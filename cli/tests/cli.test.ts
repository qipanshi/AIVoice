import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { credentialPath, loadCredentials, CredentialsProvider } from '../src/credentials.js';
import { login, connect, logout, validCallback, validateServer } from '../src/connection.js';
import { createApp } from '../../src/app.js';
import { Store, type Identity } from '../../src/store.js';
import { Backend } from '../../src/backend.js';
import type { Config } from '../../src/config.js';

const run = promisify(execFile);
test('subcommand help describes actual defaults without starting authentication', async () => {
  const result = await run(process.execPath, [resolve('cli/dist/main.js'), 'report', '--help']);
  assert.match(result.stdout, /standard.*industry/); assert.match(result.stdout, /12000/); assert.match(result.stdout, /会议ID必填/); assert.equal(result.stderr, '');
  assert.match(result.stdout, /https:\/\/open[.]qipanshi[.]com\/mcp/);
  const main = await run(process.execPath, [resolve('cli/dist/main.js'), '--help']);
  assert.match(main.stdout, /uninstall\.ps1/);
  assert.match(main.stdout, /uninstall\.sh/);
});
test('credential profiles and endpoint isolation; no path traversal', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'aivoice-cli-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const url = 'https://open.qipanshi.com/mcp'; const path = credentialPath(url, 'me', dir);
  assert.notEqual(path, credentialPath(url, 'work', dir)); assert.notEqual(path, credentialPath('https://other.example/mcp', 'me', dir));
  assert.throws(() => credentialPath(url, '../escape', dir)); assert.throws(() => validateServer('http://outside.example/mcp'));
  const provider = new CredentialsProvider(path, { server: url, redirect: 'http://127.0.0.1:1/callback' });
  await provider.saveTokens({ access_token: 'fixture', token_type: 'Bearer' });
  assert.equal((await loadCredentials(path, url)).tokens?.access_token, 'fixture');
  await assert.rejects(loadCredentials(path, 'https://wrong.example/mcp'));
});

test('callback requires exact path and one matching state; no credentials on missing login', async t => {
  assert.equal(validCallback(new URL('http://127.0.0.1/callback?state=good'), 'good'), true);
  for (const path of ['/callback?state=bad', '/other?state=good', '/callback?state=good&state=bad']) assert.equal(validCallback(new URL(path, 'http://127.0.0.1'), 'good'), false);
  const dir = await mkdtemp(join(tmpdir(), 'aivoice-cli-empty-')); t.after(() => rm(dir, { recursive: true, force: true }));
  await assert.rejects(run(process.execPath, [resolve('cli/dist/main.js'), 'status'], { env: { ...process.env, AIVOICE_CONFIG_DIR: dir } }), error => {
    assert.equal((error as { stdout: string }).stdout, ''); assert.match((error as { stderr: string }).stderr, /尚未登录/); return true;
  });
});

// Isolated module fixture: no WeChat, business database, or deployed server is contacted.
test('CLI OAuth, queries, stdio and refresh use the same own-user grant', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'aivoice-cli-flow-'));
  const http = createServer(); await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
  const config: Config = { issuer: origin, resource: origin + '/mcp', backend: 'http://127.0.0.1:1', bridgeSecret: 'fixture-bridge-secret-at-least-32-bytes', database: ':memory:', port: 0, production: false, allowedOrigins: [origin] };
  class FakeBackend extends Backend {
    override async identity(identity: Identity) { return identity; }
    override async request<T>(_path: string, identity?: Identity) { assert.equal(identity?.userId, 11); return { meetings: [{ id: '1001', title: '模拟会议' }], nextOffset: null } as T; }
  }
  const store = new Store(':memory:'); const { app } = await createApp(config, store, new FakeBackend(config)); http.on('request', app);
  t.after(async () => { http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve())); store.db.close(); await rm(directory, { recursive: true, force: true }); });
  const path = credentialPath(config.resource, 'default', directory);
  const provider = new CredentialsProvider(path, { server: config.resource, redirect: '' });
  let browserCompletion: Promise<void> = Promise.resolve();
  await login(provider, { port: 0, noBrowser: true }, url => {
    browserCompletion = (async () => {
      const jar = new Map<string, string>();
      const browser = async (url: string, init: RequestInit = {}) => {
        const result = await fetch(url, { ...init, redirect: 'manual', headers: { ...init.headers, Cookie: [...jar.values()].join('; ') } });
        for (const cookie of result.headers.getSetCookie()) { const pair = cookie.split(';')[0]; jar.set(pair.split('=')[0], pair); }
        return result;
      };
      let response = await browser(url.href);
      const interaction = new URL(response.headers.get('location')!, origin);
      response = await browser(interaction.href); assert.equal(response.status, 200);
      const ticket = store.ticket(interaction.pathname.split('/').pop()!)!;
      store.decide(ticket.scene, 'allow', { userId: 11, organizationId: 7, version: 1, displayName: '模拟用户' });
      response = await browser(interaction.href + '/finish', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf: ticket.csrf }) });
      for (let i = 0; i < 8 && [302,303].includes(response.status); i++) response = await browser(new URL(response.headers.get('location')!, origin).href);
      assert.equal(response.status, 200);
      assert.equal(new URL(response.url).pathname, '/callback', 'consent must reach the original loopback callback');
      assert.match(response.headers.get('content-type') || '', /text\/html/);
      const callbackPage = await response.text();
      assert.match(callbackPage, /AIVoice/);
      assert.match(callbackPage, /终端/);
    })();
    void browserCompletion.catch(error => { console.error('Synthetic browser fixture failed:', error); process.emit('SIGINT'); });
  });
  await browserCompletion;
  assert.ok(provider.data.tokens?.refresh_token);
  const env = { ...process.env, AIVOICE_CONFIG_DIR: directory };
  const bin = resolve('cli/dist/main.js');
  const query = await run(process.execPath, [bin, 'meetings', '--server', config.resource, '--start', '2026-11-01'], { env });
  assert.equal(JSON.parse(query.stdout).meetings[0].id, '1001');
  const local = new Client({ name: 'stdio fixture', version: '1' });
  const stdio = new StdioClientTransport({ command: process.execPath, args: [bin, 'mcp', '--server', config.resource], env, stderr: 'pipe' });
  await local.connect(stdio);
  try {
    assert.equal((await local.listTools()).tools.length, 3);
    const result = await local.callTool({ name: 'get_report', arguments: { meetingId: '1001' } });
    assert.ok(result.structuredContent);
    const forbidden = await local.callTool({ name: 'generate_report', arguments: {} }); assert.equal(forbidden.isError, true);
  } finally { await local.close(); }
  // Expire only this test fixture's access token, retaining the refresh token.
  store.db.prepare("UPDATE oauth_objects SET expires=1 WHERE model='AccessToken'").run();
  const renewed = new CredentialsProvider(path, await loadCredentials(path, config.resource));
  const client = await connect(renewed); await client.listTools(); await client.close();
  assert.notEqual(renewed.data.tokens?.access_token, provider.data.tokens?.access_token);
  assert.equal((await loadCredentials(path, config.resource)).tokens?.access_token, renewed.data.tokens?.access_token);
  await logout(renewed); await assert.rejects(readFile(path));
  const rejected = await fetch(config.resource, { method: 'POST', headers: { Authorization: `Bearer ${renewed.data.tokens?.access_token}`, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(rejected.status, 401);
});

test('denied authorization displays the failure page rather than success', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'aivoice-cli-denied-'));
  const http = createServer(); await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(http.address() as {port:number}).port}`;
  const config: Config = { issuer: origin, resource: origin + '/mcp', backend: 'http://127.0.0.1:1', bridgeSecret: 'fixture-bridge-secret-at-least-32-bytes', database: ':memory:', port: 0, production: false, allowedOrigins: [origin] };
  const store = new Store(':memory:'); const {app} = await createApp(config, store); http.on('request', app);
  t.after(async () => { http.closeAllConnections(); await new Promise<void>(resolve=>http.close(()=>resolve())); store.db.close(); await rm(directory,{recursive:true,force:true}); });
  const provider = new CredentialsProvider(credentialPath(config.resource,'default',directory), {server:config.resource,redirect:''});
  let browserCompletion: Promise<void> = Promise.resolve();
  const attempt=login(provider,{port:0,noBrowser:true},url=>{
    browserCompletion=(async()=>{
      const jar=new Map<string,string>();
      const browser=async(target:string,init:RequestInit={})=>{
        const result=await fetch(target,{...init,redirect:'manual',headers:{...init.headers,Cookie:[...jar.values()].join('; ')}});
        for(const cookie of result.headers.getSetCookie()){const pair=cookie.split(';')[0];jar.set(pair.split('=')[0],pair);}
        return result;
      };
      let response=await browser(url.href);
      const interaction=new URL(response.headers.get('location')!,origin);
      response=await browser(interaction.href);assert.equal(response.status,200);
      const ticket=store.ticket(interaction.pathname.split('/').pop()!)!;
      store.decide(ticket.scene,'deny',{userId:11,organizationId:0,version:1,displayName:'模拟用户'});
      response=await browser(interaction.href+'/finish',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:ticket.csrf})});
      for(let i=0;i<8 && [302,303].includes(response.status);i++)response=await browser(new URL(response.headers.get('location')!,origin).href);
      assert.equal(response.status,400);assert.match(response.headers.get('content-type') || '',/text\/html/);
      const page=await response.text();assert.match(page,/授权未完成/);assert.doesNotMatch(page,/授权成功/);
    })();
    void browserCompletion.catch(()=>process.emit('SIGINT'));
  });
  await assert.rejects(attempt);await browserCompletion;
});

test('portal and assets are public; data endpoint remains authenticated', async t => {
  const http = createServer(); await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
  const config: Config = { issuer: origin, resource: origin + '/mcp', backend: 'http://127.0.0.1:1', bridgeSecret: 'fixture-bridge-secret-at-least-32-bytes', database: ':memory:', port: 0, production: false, allowedOrigins: [origin] };
  const store = new Store(':memory:'); const { app } = await createApp(config, store); http.on('request', app);
  t.after(async () => { http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve())); store.db.close(); });
  const page = await fetch(origin); assert.equal(page.status, 200); assert.match(await page.text(), /选择适合你的接入方式/); assert.match(page.headers.get('content-security-policy')!, /script-src 'self'/);
  assert.equal((await fetch(origin + '/aivoice/site/site.js')).status, 200);
  for (const path of ['/install.ps1', '/install.sh']) {
    const installer = await fetch(origin + path);
    assert.equal(installer.status, 200);
    assert.match(installer.headers.get('content-type')!, /text\/plain/);
    assert.match(await installer.text(), /0\.3\.1/);
  }
  assert.equal((await fetch(origin + '/aivoice/icon.jpg')).status, 200, 'user-provided icon must load from a dot-prefixed workspace too');
  assert.equal((await fetch(origin + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
});
