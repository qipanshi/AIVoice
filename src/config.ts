import { resolve } from 'node:path';

export const scopes = ['meetings:read', 'transcripts:read', 'reports:read'];
export interface Config {
  issuer: string; resource: string; backend: string; bridgeSecret: string;
  database: string; port: number; production: boolean; allowedOrigins: string[];
}
export function readConfig(): Config {
  const production = process.env.NODE_ENV === 'production';
  const issuer = (process.env.AIVOICE_PUBLIC_ORIGIN || 'http://127.0.0.1:18620').replace(/\/$/, '');
  const backend = (process.env.AIVOICE_BACKEND_ORIGIN || 'https://xx.qipanshi.com').replace(/\/$/, '');
  for (const value of [issuer, backend]) {
    const url = new URL(value);
    if (url.origin !== value || url.username || url.password ||
      (url.protocol !== 'https:' && (production || !['localhost', '127.0.0.1'].includes(url.hostname)))) {
      throw new Error('AIVoice origins must be HTTPS origins (HTTP loopback is development-only)');
    }
  }
  const bridgeSecret = process.env.AIVOICE_BRIDGE_SECRET || '';
  if (Buffer.byteLength(bridgeSecret) < 32) throw new Error('Set AIVOICE_BRIDGE_SECRET to a random secret of at least 32 bytes');
  const port = Number(process.env.PORT || 18620);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return {
    issuer, resource: `${issuer}/mcp`, backend, bridgeSecret, port, production,
    database: resolve(process.env.AIVOICE_DATABASE || './data/aivoice.sqlite'),
    allowedOrigins: [issuer, ...(process.env.AIVOICE_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)],
  };
}
