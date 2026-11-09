import { SignJWT, jwtVerify } from 'jose';
import type { Config } from './config.js';
import type { Identity } from './store.js';

export class UpstreamError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export class Backend {
  private key: Uint8Array;
  constructor(private config: Config) { this.key = new TextEncoder().encode(config.bridgeSecret); }
  async request<T>(path: string, identity?: Identity, body?: unknown): Promise<T> {
    const token = await new SignJWT(identity ? { org: identity.organizationId, ver: identity.version } : {})
      .setProtectedHeader({ alg: 'HS256' }).setIssuer('aivoice-mcp').setAudience('aivoice-internal')
      .setSubject(identity ? String(identity.userId) : 'service').setIssuedAt().setExpirationTime('60s').sign(this.key);
    const response = await fetch(`${this.config.backend}/api/v1/aivoice/internal${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json() as { data?: T; message?: string; error?: string };
    if (!response.ok) throw new UpstreamError(response.status, payload.error || 'upstream_error', payload.message || '声掌门服务暂时不可用');
    return payload.data as T;
  }
  async verifyBridge(token: string): Promise<{ subject: string }> {
    const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'], issuer: 'aivoice-backend', audience: 'aivoice-bridge', maxTokenAge: '60s' });
    if (!payload.sub) throw new Error('Missing bridge subject');
    return { subject: payload.sub };
  }
  identity(identity: Identity) { return this.request<Identity>('/identity', identity); }
  qrcode(scene: string) { return this.request<{ image: string }>('/qrcode', undefined, { scene }); }
}
