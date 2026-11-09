#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { credentialPath, loadCredentials, CredentialsProvider } from './credentials.js';
import { connect, login, logout, validateServer, version } from './connection.js';
import { createBridge } from './bridge.js';
import { commandHelp } from './help.js';

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, strict: true, options: {
    help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
    server: { type: 'string', default: process.env.AIVOICE_MCP_URL || 'https://open.qipanshi.com/mcp' }, profile: { type: 'string', default: 'default' },
    'no-browser': { type: 'boolean' }, 'callback-port': { type: 'string', default: '0' }, local: { type: 'boolean' },
    start: { type: 'string' }, end: { type: 'string' }, keyword: { type: 'string' }, offset: { type: 'string' }, limit: { type: 'string' }, kind: { type: 'string' },
  }});
  if (values.version) { console.log(version); return; }
  if (values.help || !positionals.length) { process.stdout.write(commandHelp(positionals[0])); return; }
  const [command, meetingId, ...extra] = positionals;
  if (!['login','status','logout','meetings','transcript','report','mcp'].includes(command) || extra.length || (meetingId && !['transcript','report'].includes(command))) throw new Error('命令或参数不正确。执行 aivoice --help 查看用法。');
  const server = validateServer(values.server!);
  const path = credentialPath(server, values.profile!);
  const provider = new CredentialsProvider(path, await loadCredentials(path, server));
  if (command === 'login') {
    const port = Number(values['callback-port']);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('callback-port 必须是 0–65535 的整数。');
    await login(provider, { port, noBrowser: !!values['no-browser'] });
    console.log(JSON.stringify({ authorized: true, server, profile: values.profile })); return;
  }
  if (command === 'logout') {
    if (values.local) await provider.forget(); else await logout(provider);
    console.log(JSON.stringify({ localCredentialsRemoved: true, remoteRevocationRequested: !values.local })); return;
  }
  const args: Record<string, unknown> = {};
  if (command === 'meetings') {
    for (const [option, field] of [['start','startDate'],['end','endDate']] as const) {
      const date = values[option]; if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期格式应为 YYYY-MM-DD。');
      if (date) args[field] = date;
    }
    if (values.start && values.end && values.start > values.end) throw new Error('开始日期不能晚于结束日期。');
    if (values.keyword) args.keyword = values.keyword;
  }
  if (command === 'transcript' || command === 'report') {
    if (!meetingId || !/^[1-9]\d*$/.test(meetingId)) throw new Error('请提供 meetings 返回的完整会议 ID。');
    args.meetingId = meetingId;
    if (command === 'report') {
      if (values.kind && !['standard','industry'].includes(values.kind)) throw new Error('kind 只能是 standard 或 industry。');
      args.kind = values.kind || 'standard';
    }
  }
  for (const field of ['offset','limit'] as const) if (values[field] !== undefined) {
    const value = Number(values[field]); if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} 必须为非负整数。`); args[field] = value;
  }
  const client = await connect(provider);
  if (command === 'mcp') {
    const handle = serveStdio(() => createBridge(client), { onerror: () => process.stderr.write('MCP 桥接连接异常，请检查网络或重新登录。\n') });
    const close = async () => { await handle.close(); await client.close(); };
    process.stdin.once('end', () => { void close(); });
    process.once('SIGINT', () => { void close(); }); process.once('SIGTERM', () => { void close(); });
    return;
  }
  try {
    if (command === 'status') {
      const result = await client.listTools(); console.log(JSON.stringify({ connected: true, server, profile: values.profile, tools: result.tools.map(t => t.name) })); return;
    }
    const name = command === 'meetings' ? 'list_meetings' : command === 'transcript' ? 'get_transcript' : 'get_report';
    const result = await client.callTool({ name, arguments: args });
    console.log(JSON.stringify(result.structuredContent ?? result, null, 2));
    if (result.isError) process.exitCode = 1;
  } finally { await client.close(); }
}

main().catch(error => {
  // SDK errors can include response bodies. Do not echo them or credentials to tool logs.
  const message = error instanceof Error && /[\u4e00-\u9fff]/.test(error.message) ? error.message : '操作失败，请检查网络、服务地址和授权状态；需要时重新执行 login。';
  process.stderr.write(message + '\n'); process.exitCode = 1;
});
