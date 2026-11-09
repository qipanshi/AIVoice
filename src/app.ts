import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import * as z from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Config } from './config.js';
import { scopes } from './config.js';
import { Store, accountId, parseAccount, type Identity } from './store.js';
import { Backend, UpstreamError } from './backend.js';
import { createProvider } from './oauth.js';
import { authorizationPage } from './web.js';
import { createMcp, toolScopes } from './mcp.js';

export async function createApp(config: Config, store = new Store(config.database), backend = new Backend(config)) {
  const app = express();
  const provider = await createProvider(config, store, backend);
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' }); next();
  });
  app.get('/health', (_req, res) => res.json({ status: 'UP', service: 'AIVoice MCP' }));
  const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
  app.get('/', (_req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; script-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.sendFile('index.html', { root: publicDirectory });
  });
  app.use('/aivoice/site', express.static(publicDirectory, { index: false, dotfiles: 'deny' }));
  app.use('/aivoice/downloads', express.static(fileURLToPath(new URL('../downloads/', import.meta.url)), { index: false, dotfiles: 'deny' }));
  app.get(['/install.ps1', '/install.sh'], (req, res) => res.type('text/plain').sendFile(req.path.slice(1), { root: fileURLToPath(new URL('../installers/', import.meta.url)) }));
  app.get('/aivoice/icon.jpg', (_req,res) => res.sendFile('qipanshi_mcp.jpg', { root: fileURLToPath(new URL('../assets/', import.meta.url)) }));
  const metadata = { resource: config.resource, resource_name: 'AIVoice MCP', authorization_servers: [config.issuer], scopes_supported: scopes, bearer_methods_supported: ['header'] };
  app.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], (_req, res) => res.json(metadata));
  app.use('/oauth/register', rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use('/oauth', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));

  app.use('/aivoice/bridge', express.json({ limit: '16kb' }), async (req, res, next) => {
    try {
      const auth = await backend.verifyBridge(String(req.headers.authorization || '').replace(/^Bearer /, ''));
      res.locals.subject = auth.subject; next();
    } catch { res.status(401).json({ error: 'invalid_bridge_token' }); }
  });
  app.get('/aivoice/bridge/requests/:scene', (req, res) => {
    const ticket = store.byScene(req.params.scene);
    if (!ticket || ticket.decision) return res.status(410).json({ error: 'request_expired' });
    return res.json({ clientName: ticket.clientName, redirectOrigin: new URL(ticket.redirectUri).origin, scopes: ticket.scopes, expiresAt: new Date(ticket.expires).toISOString() });
  });
  const decisionSchema = z.object({ decision: z.enum(['allow','deny']), identity: z.object({ userId: z.number().int().positive(), organizationId: z.number().int().nonnegative(), version: z.number().int().nonnegative(), displayName: z.string().max(100) }) }).strict();
  app.post('/aivoice/bridge/requests/:scene/decision', async (req, res) => {
    const body = decisionSchema.parse(req.body);
    if (String(body.identity.userId) !== res.locals.subject) return res.status(403).json({ error: 'subject_mismatch' });
    if (body.decision === 'allow') await backend.identity(body.identity);
    if (!store.decide(req.params.scene, body.decision, body.identity)) return res.status(410).json({ error: 'request_expired' });
    return res.json({ accepted: true });
  });
  app.get('/aivoice/bridge/grants', (_req, res) => res.json(store.grants(Number(res.locals.subject))));
  app.post('/aivoice/bridge/grants/:id/revoke', async (req, res) => {
    const grant = await provider.Grant.find(req.params.id);
    if (!grant || parseAccount(grant.accountId!).userId !== Number(res.locals.subject)) return res.status(404).json({ error: 'grant_not_found' });
    await store.adapter('Grant').revokeByGrantId(req.params.id);
    await grant.destroy();
    return res.json({ revoked: true });
  });

  app.get('/aivoice/interaction/:uid', async (req, res) => {
    const details = await provider.interactionDetails(req, res);
    if (details.uid !== req.params.uid) return res.sendStatus(403);
    const client = await provider.Client.find(String(details.params.client_id));
    const requested = String(details.params.scope || '').split(' ').filter(s => scopes.includes(s));
    if (!client || !requested.length || details.params.resource !== config.resource) return res.status(400).send('授权请求缺少有效的资源地址或读取权限，请返回原工具重新连接。');
    const ticket = store.ticket(details.uid, { clientId: client.clientId, clientName: client.clientName || '未命名应用', redirectUri: String(details.params.redirect_uri), scopes: requested })!;
    // The provider has already validated this interaction's registered redirect URI.
    // Chrome also applies form-action to the redirects following the consent POST.
    const callback = new URL(ticket.redirectUri);
    const formTarget = ['http:', 'https:'].includes(callback.protocol) ? callback.origin : callback.protocol;
    res.setHeader('Content-Security-Policy', `default-src 'none'; img-src 'self'; script-src 'nonce-${ticket.csrf}'; style-src 'nonce-${ticket.csrf}'; connect-src 'self'; form-action 'self' ${formTarget}; frame-ancestors 'none'; base-uri 'none'`);
    return res.type('html').send(authorizationPage(ticket));
  });
  app.get('/aivoice/interaction/:uid/qr', async (req, res) => {
    const details = await provider.interactionDetails(req, res);
    const ticket = store.ticket(req.params.uid);
    if (details.uid !== req.params.uid || !ticket) return res.sendStatus(410);
    const qr = await backend.qrcode(ticket.scene);
    return res.type('png').send(Buffer.from(qr.image, 'base64'));
  });
  app.get('/aivoice/interaction/:uid/status', async (req, res) => {
    const details = await provider.interactionDetails(req, res);
    const ticket = store.ticket(req.params.uid);
    if (details.uid !== req.params.uid || !ticket) return res.sendStatus(410);
    return res.json({ ready: !!ticket.decision });
  });
  app.post('/aivoice/interaction/:uid/finish', express.urlencoded({ extended: false, limit: '2kb' }), async (req, res) => {
    const details = await provider.interactionDetails(req, res);
    const ticket = store.ticket(req.params.uid);
    const csrf = Buffer.from(String(req.body.csrf || ''));
    if (details.uid !== req.params.uid || !ticket || csrf.length !== ticket.csrf.length || !timingSafeEqual(csrf, Buffer.from(ticket.csrf))) return res.sendStatus(403);
    if (!ticket.decision || !ticket.identity) return res.status(409).send('请先在小程序中确认授权。');
    if (ticket.decision === 'deny') {
      store.deleteTicket(ticket.uid);
      return provider.interactionFinished(req, res, { error: 'access_denied', error_description: '用户取消授权' }, { mergeWithLastSubmission: false });
    }
    await backend.identity(ticket.identity);
    const account = accountId(ticket.identity);
    const grant = new provider.Grant({ accountId: account, clientId: ticket.clientId });
    // The AS advertises these scopes for standards-based client registration.
    // Acknowledge only the consented scopes here; MCP access still requires the resource grant below.
    grant.addOIDCScope(String(details.params.scope || '').split(' ').filter(s => ['openid','offline_access', ...ticket.scopes].includes(s)).join(' '));
    grant.addResourceScope(config.resource, ticket.scopes.join(' '));
    const grantId = await grant.save();
    store.rememberGrant(grantId, ticket);
    store.deleteTicket(ticket.uid);
    return provider.interactionFinished(req, res, { login: { accountId: account, remember: true, amr: ['wechat'] }, consent: { grantId } }, { mergeWithLastSubmission: false });
  });

  app.use('/mcp', rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.all('/mcp', express.json({ limit: '64kb' }), async (req, res) => {
    if (req.headers.origin && !config.allowedOrigins.includes(req.headers.origin)) return res.sendStatus(403);
    if (req.method === 'OPTIONS') {
      if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.set({ 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, MCP-Method, MCP-Name', 'Access-Control-Expose-Headers': 'WWW-Authenticate, MCP-Session-Id' });
      return res.sendStatus(204);
    }
    if (req.headers.origin) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, MCP-Session-Id');
    const bearer = /^Bearer (\S+)$/.exec(String(req.headers.authorization || ''))?.[1];
    const token = bearer ? await provider.AccessToken.find(bearer) : undefined;
    const grant = token?.grantId ? await provider.Grant.find(token.grantId) : undefined;
    if (!token?.isValid || token.aud !== config.resource || !grant?.isValid || grant.accountId !== token.accountId) {
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${config.issuer}/.well-known/oauth-protected-resource/mcp", scope="${scopes.join(' ')}"`);
      return res.status(401).json({ error: 'invalid_token' });
    }
    const identity = await backend.identity(parseAccount(token.accountId));
    const tool = req.body?.method === 'tools/call' ? req.body?.params?.name : undefined;
    const required = typeof tool === 'string' && Object.hasOwn(toolScopes,tool) ? toolScopes[tool] : undefined;
    if (required && !(token.scope || '').split(' ').includes(required)) {
      res.setHeader('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${required}", resource_metadata="${config.issuer}/.well-known/oauth-protected-resource/mcp"`);
      return res.status(403).json({error:'insufficient_scope'});
    }
    const server = createMcp(backend, identity, `${config.issuer}/aivoice/icon.jpg`);
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.use(provider.callback());
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (res.headersSent) return;
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'invalid_request', message: '请求参数无效' });
    if (error instanceof UpstreamError) return res.status(error.status >= 500 ? 503 : error.status).json({ error: error.code, message: error.message });
    console.error('AIVoice request failed', error instanceof Error ? error.name : 'Error');
    return res.status(500).json({ error: 'server_error', message: '服务暂时不可用，请稍后重试' });
  });
  return { app, provider, store };
}
