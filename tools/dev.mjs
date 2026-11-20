// Development: the Vite dev server plus the presence relay, so that several tabs or devices on the local
// network see each other while you work. (Plain `npm run dev:vite` starts Vite alone.)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELAY_PORT = process.env.RELAY_PORT || '8787';
const relay = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
  env: { ...process.env, PORT: RELAY_PORT, HOST: '127.0.0.1' },
  stdio: ['ignore', 'ignore', 'inherit'], // its banner would point at the wrong port: keep errors only
});
relay.on('exit', (code) => { if (code) console.error(`The presence relay stopped (code ${code}).`); });

const server = await createServer({
  root: ROOT,
  server: { proxy: { '/ws': { target: `ws://127.0.0.1:${RELAY_PORT}`, ws: true }, '/api': `http://127.0.0.1:${RELAY_PORT}` } },
});
await server.listen();
server.printUrls();
console.log('  ➜  Multiplayer presence: on (local relay)\n');

const stop = () => { relay.kill(); server.close().finally(() => process.exit(0)); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
