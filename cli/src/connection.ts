import { createServer, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { Client, StreamableHTTPClientTransport, auth } from '@modelcontextprotocol/client';
import { CredentialsProvider, scope } from './credentials.js';

export const version = '0.3.1';
export function validateServer(value: string) {
  const url = new URL(value);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname))) || url.username || url.password || url.search || url.hash) throw new Error('服务器地址必须是 HTTPS MCP 地址；仅本机调试允许 HTTP。');
  return url.href;
}

export async function connect(provider: CredentialsProvider) {
  if (!provider.data.tokens) throw new Error('尚未登录。请先执行 aivoice login（使用相同的 --server 和 --profile）。');
  const client = new Client({ name: 'AIVoice CLI', version });
  const transport = new StreamableHTTPClientTransport(new URL(provider.data.server), { authProvider: provider, onInsufficientScope: 'throw' });
  try { await client.connect(transport); return client; }
  catch (error) { await transport.close(); throw error; }
}

export function validCallback(url: URL, expectedState: string) {
  return url.pathname === '/callback' && url.searchParams.getAll('state').length === 1 && url.searchParams.get('state') === expectedState;
}

function callbackPage(success: boolean) {
  const title = success ? '授权成功' : '授权未完成';
  const message = success ? 'AIVoice 已连接，你可以返回终端继续使用。' : '请返回终端查看原因，并根据提示重新连接。';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · AIVoice</title><style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#0a0a12;color:#f7f7fa;font:16px/1.7 system-ui,"Microsoft YaHei",sans-serif}
    main{width:min(100%,500px);padding:40px;border:1px solid #30303b;border-radius:16px;background:#151520}.brand{font-size:15px;font-weight:700;letter-spacing:.02em;color:#ffb300}.mark{width:54px;height:54px;display:grid;place-items:center;margin:38px 0 20px;border:1px solid #6a482b;border-radius:50%;color:#ffb300}.mark svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}h1{margin:0;font-size:30px;line-height:1.3}p{margin:16px 0 0;color:#d4d1dd}.hint{margin-top:28px;padding-top:20px;border-top:1px solid #30303b;font-size:14px;color:#b6b5c3}@media(max-width:520px){main{padding:28px}h1{font-size:26px}.mark{margin-top:30px}}
    </style></head><body><main><div class="brand">AIVoice · 开放平台</div><div class="mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></div><h1>${title}</h1><p>${message}</p><p class="hint">${success ? '现在可以关闭此页面。' : '可关闭此页面，重新发起授权。'}</p></main></body></html>`;
}

export async function login(provider: CredentialsProvider, options: { port: number; noBrowser: boolean }, announce: (url: URL) => void = url => {
  process.stderr.write(`请在浏览器打开以下地址，使用微信扫码并在声掌门确认授权：\n${url.href}\n`);
  if (!options.noBrowser) {
    // No shell: the URL is always an argument, never executable command text.
    const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url.href] : [url.href];
    const child = spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true });
    child.on('error', () => process.stderr.write('未能自动打开浏览器，请手动打开上述地址。\n'));
    child.unref();
  }
}) {
  let resolveCallback!: (params: URLSearchParams) => void;
  let rejectCallback!: (error: Error) => void;
  const callback = new Promise<URLSearchParams>((resolve, reject) => { resolveCallback = resolve; rejectCallback = reject; });
  // Attach a handler immediately: timeout or cancellation can precede discovery completion.
  void callback.catch(() => {});
  let accepted = false;
  let callbackResponse: ServerResponse | undefined;
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' || !validCallback(url, provider.nonce) || accepted) { res.writeHead(400, {'Content-Type':'text/plain; charset=utf-8'}).end('无效的授权回调，请回到终端重新登录。'); return; }
    accepted = true;
    callbackResponse = res;
    resolveCallback(url.searchParams);
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(options.port, '127.0.0.1', resolve); });
  const port = (server.address() as { port: number }).port;
  // A fresh registration binds exactly this loopback port; old credentials remain on disk until success.
  provider.data = { server: provider.data.server, redirect: `http://127.0.0.1:${port}/callback` };
  provider.onAuthorize = announce;
  const timeout = setTimeout(() => rejectCallback(new Error('等待授权超时，请重新执行 login。')), 600_000);
  const cancel = () => rejectCallback(new Error('登录已取消。'));
  process.once('SIGINT', cancel);
  try {
    const result = await auth(provider, { serverUrl: provider.data.server, scope });
    if (result === 'REDIRECT') {
      const params = await callback;
      const transport = new StreamableHTTPClientTransport(new URL(provider.data.server), { authProvider: provider });
      await transport.finishAuth(params); // SDK verifies issuer + PKCE; state was checked above.
    }
    await provider.persist();
    if (callbackResponse && !callbackResponse.destroyed) {
      callbackResponse.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",'Referrer-Policy':'no-referrer'}).end(callbackPage(true));
    }
  } catch (error) {
    if (callbackResponse && !callbackResponse.destroyed) {
      callbackResponse.writeHead(400, {'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",'Referrer-Policy':'no-referrer'}).end(callbackPage(false));
    }
    throw error;
  } finally {
    clearTimeout(timeout); process.removeListener('SIGINT', cancel); provider.onAuthorize = undefined;
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

export async function logout(provider: CredentialsProvider) {
  const tokens = provider.data.tokens;
  if (!tokens) { await provider.forget(); return; }
  // This client targets AIVoice's published revocation endpoint, under the recorded issuer.
  const issuer = tokens.issuer;
  if (!issuer || !provider.data.client) throw new Error('缺少已验证的授权服务器信息，请在小程序中撤销此授权，再执行 logout --local。');
  const endpoint = new URL('/oauth/revoke', issuer);
  for (const [token_type_hint, token] of [['refresh_token', tokens.refresh_token], ['access_token', tokens.access_token]]) {
    if (!token) continue;
    const result = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token, token_type_hint: token_type_hint!, client_id: provider.data.client.client_id }) });
    if (!result.ok) throw new Error('远端撤销未完成，本地凭证已保留。请稍后重试，或在小程序撤销后使用 logout --local。');
  }
  await provider.forget();
}
