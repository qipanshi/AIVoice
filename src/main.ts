import { readConfig } from './config.js';
import { createApp } from './app.js';

const config = readConfig();
const { app, store } = await createApp(config);
const server = app.listen(config.port, '0.0.0.0', () => console.info(`AIVoice MCP listening on port ${config.port}`));
const cleanup = setInterval(() => store.cleanup(), 600_000);
cleanup.unref();
for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal, () => {
  clearInterval(cleanup);
  server.close(() => { store.db.close(); process.exit(0); });
});
