import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';
import type { Config } from '../src/config.js';

for (const [name, redirectUri, formTarget] of [
  ['CLI loopback callback', 'http://127.0.0.1:19231/callback', 'http://127.0.0.1:19231'],
  ['remote HTTPS callback', 'https://client.example.test/oauth/callback', 'https://client.example.test'],
  ['native application callback', 'com.example.aivoice:/oauth/callback', 'com.example.aivoice:'],
]) {
  test(`authorization CSP permits ${name} without opening other destinations`, async t => {
    const http = createServer();
    await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
    const store = new Store(':memory:');
    t.after(async () => {
      http.closeAllConnections();
      await new Promise<void>(resolve => http.close(() => resolve()));
      store.db.close();
    });
    const config: Config = { issuer: origin, resource: origin + '/mcp', backend: 'http://127.0.0.1:1', bridgeSecret: 'fixture-only-bridge-secret-at-least-32-bytes', database: ':memory:', port: 0, production: false, allowedOrigins: [origin] };
    const { app } = await createApp(config, store);
    http.on('request', app);
    const registered = await fetch(origin + '/oauth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ application_type: 'native', redirect_uris: [redirectUri, 'https://other.example.test/callback'], response_types: ['code'], grant_types: ['authorization_code'], token_endpoint_auth_method: 'none' }),
    });
    const client = await registered.json() as { client_id: string };
    assert.equal(registered.status, 201, JSON.stringify(client));
    const params = new URLSearchParams({ client_id: client.client_id, response_type: 'code', redirect_uri: redirectUri, resource: config.resource, scope: 'meetings:read', state: 'csp-regression', code_challenge_method: 'S256', code_challenge: createHash('sha256').update(randomBytes(48)).digest('base64url') });
    const authorization = await fetch(origin + '/oauth/authorize?' + params, { redirect: 'manual' });
    assert.equal(authorization.status, 303);
    const cookies = authorization.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');
    const page = await fetch(new URL(authorization.headers.get('location')!, origin), { headers: { Cookie: cookies } });
    assert.equal(page.status, 200);
    const ticket = store.ticket(new URL(page.url).pathname.split('/').pop()!)!;
    const directives = new Map(page.headers.get('content-security-policy')!.split(';').map(value => {
      const [directive, ...sources] = value.trim().split(/\s+/);
      return [directive, sources.join(' ')];
    }));
    // Chrome checks the callback redirect after the same-origin form POST.
    // Permit this interaction's callback, not all registered client URLs or '*'.
    assert.equal(directives.get('form-action'), `'self' ${formTarget}`);
    assert.equal(directives.get('default-src'), "'none'");
    assert.equal(directives.get('connect-src'), "'self'");
    assert.equal(directives.get('script-src'), `'nonce-${ticket.csrf}'`);
    assert.equal(directives.get('frame-ancestors'), "'none'");
    assert.equal(directives.get('base-uri'), "'none'");
    const html = await page.text();
    assert.ok(html.includes(`action="/aivoice/interaction/${ticket.uid}/finish" method="post"`));
    assert.ok(html.includes(`name="csrf" value="${ticket.csrf}"`));
    const publicPage = await fetch(origin);
    assert.match(publicPage.headers.get('content-security-policy')!, /form-action 'none'/);
  });
}
