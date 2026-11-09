import Provider, { errors, type Configuration } from 'oidc-provider';
import { exportJWK, generateKeyPair } from 'jose';
import { randomBytes } from 'node:crypto';
import type { Config } from './config.js';
import { scopes } from './config.js';
import { Store, parseAccount } from './store.js';
import { Backend } from './backend.js';

export async function createProvider(config: Config, store: Store, backend: Backend) {
  if (!store.setting('jwks')) {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    store.saveSetting('jwks', JSON.stringify({ keys: [{ ...await exportJWK(privateKey), kid: randomBytes(16).toString('hex'), use: 'sig', alg: 'RS256' }] }));
  }
  if (!store.setting('cookie-key')) store.saveSetting('cookie-key', randomBytes(48).toString('base64url'));
  const settings: Configuration & { fetch: typeof fetch } = {
    adapter: store.adapter,
    clients: [],
    jwks: JSON.parse(store.setting('jwks')!),
    cookies: { keys: [store.setting('cookie-key')!], short: { sameSite: 'lax', httpOnly: true }, long: { sameSite: 'lax', httpOnly: true } },
    // DCR clients may declare resource scopes. Issued grants still separate
    // OIDC identity scopes from MCP resource scopes in the consent handler.
    scopes: ['openid', 'offline_access', ...scopes],
    responseTypes: ['code'],
    clientDefaults: { grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' },
    pkce: { required: () => true },
    features: {
      devInteractions: { enabled: false },
      userinfo: { enabled: false },
      revocation: { enabled: true },
      registration: { enabled: true },
      clientIdMetadataDocument: { enabled: true, ack: 'draft-02' },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => config.resource,
        useGrantedResource: () => true,
        getResourceServerInfo: (_ctx, resource) => {
          if (resource !== config.resource) throw new errors.InvalidTarget();
          return { scope: scopes.join(' '), audience: config.resource, accessTokenTTL: 900, accessTokenFormat: 'opaque' };
        },
      },
    } as Configuration['features'],
    routes: { authorization: '/oauth/authorize', token: '/oauth/token', jwks: '/oauth/jwks', registration: '/oauth/register', revocation: '/oauth/revoke' },
    interactions: { url: (_ctx, interaction) => `/aivoice/interaction/${interaction.uid}` },
    findAccount: async (_ctx, id) => {
      try {
        await backend.identity(parseAccount(id));
        return { accountId: id, claims: async () => ({ sub: id }) };
      } catch { return undefined; }
    },
    issueRefreshToken: (_ctx, client) => client.grantTypeAllowed('refresh_token'),
    rotateRefreshToken: true,
    ttl: { AccessToken: 900, AuthorizationCode: 60, RefreshToken: 2_592_000, Grant: 2_592_000, Session: 2_592_000, Interaction: 600 },
    // The provider supplies a dispatcher that rejects special-use destination IPs.
    // Do not silently fall back to unguarded fetch for client metadata/JWKS.
    fetch: ((url: Parameters<typeof fetch>[0], options: RequestInit & { dispatcher?: unknown } = {}) => {
      if (!options.dispatcher) throw new Error('OAuth outbound SSRF protection unavailable');
      return fetch(url, options);
    }) as typeof fetch,
    renderError: (ctx, out) => {
      ctx.type = 'application/json';
      ctx.body = { error: out.error, error_description: '授权请求无效或已过期，请返回原工具重新连接。' };
    },
  };
  const provider = new Provider(config.issuer, settings);
  provider.proxy = true;
  provider.on('server_error', () => console.error('OAuth request failed; no credentials or request body logged'));
  return provider;
}
