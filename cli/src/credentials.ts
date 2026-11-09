import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import type { OAuthClientProvider, OAuthClientMetadata, OAuthDiscoveryState, StoredOAuthClientInformation, StoredOAuthTokens } from '@modelcontextprotocol/client';

export const scope = 'meetings:read transcripts:read reports:read offline_access';
export type Credentials = { server: string; redirect: string; client?: StoredOAuthClientInformation; tokens?: StoredOAuthTokens; discovery?: OAuthDiscoveryState };

export function credentialPath(server: string, profile: string, directory = process.env.AIVOICE_CONFIG_DIR || join(homedir(), '.aivoice')) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(profile)) throw new Error('profile 仅允许 1–64 位字母、数字、下划线或连字符。');
  return join(directory, profile, createHash('sha256').update(server).digest('hex').slice(0, 32) + '.json');
}

export async function loadCredentials(path: string, server: string): Promise<Credentials> {
  let text: string;
  try { text = await readFile(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { server, redirect: '' }; throw error; }
  const data = JSON.parse(text) as Credentials;
  if (data.server !== server) throw new Error('本地凭证的服务器不匹配，请重新登录。');
  return data;
}

export class CredentialsProvider implements OAuthClientProvider {
  verifier = '';
  nonce = randomBytes(32).toString('base64url');
  onAuthorize?: (url: URL) => void;
  constructor(public readonly path: string, public data: Credentials) {}
  get redirectUrl() { return this.data.redirect; }
  get clientMetadata(): OAuthClientMetadata {
    return { client_name: 'AIVoice CLI', application_type: 'native', redirect_uris: [this.data.redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' };
  }
  state() { return this.nonce; }
  clientInformation() { return this.data.client; }
  saveClientInformation(client: StoredOAuthClientInformation) { this.data.client = client; }
  tokens() { return this.data.tokens; }
  async saveTokens(tokens: StoredOAuthTokens) {
    this.data.tokens = tokens;
    await this.persist();
  }
  redirectToAuthorization(url: URL) {
    if (!this.onAuthorize) throw new Error('需要重新授权：请先执行 aivoice login（使用相同的 --server 和 --profile）。');
    this.onAuthorize(url);
  }
  saveCodeVerifier(value: string) { this.verifier = value; }
  codeVerifier() { if (!this.verifier) throw new Error('授权会话已失效，请重新登录。'); return this.verifier; }
  saveDiscoveryState(discovery: OAuthDiscoveryState) { this.data.discovery = discovery; }
  discoveryState() { return this.data.discovery; }
  async invalidateCredentials(kind: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery') {
    if (kind === 'all' || kind === 'client') delete this.data.client;
    if (kind === 'all' || kind === 'tokens') delete this.data.tokens;
    if (kind === 'all' || kind === 'discovery') delete this.data.discovery;
    if (kind === 'all' || kind === 'verifier') this.verifier = '';
    await this.persist();
  }
  async persist() {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = this.path + '.' + process.pid + '.tmp';
    await writeFile(temporary, JSON.stringify(this.data), { mode: 0o600 });
    await rename(temporary, this.path);
  }
  async forget() { await rm(this.path, { force: true }); }
}
