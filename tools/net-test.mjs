// Automated check of the multiplayer presence layer: server protocol and hygiene, static file serving,
// interpolation maths and the Presence façade (run under Node with its WebSocket / BroadcastChannel globals).
// usage: node tools/net-test.mjs      → one PASS/FAIL line per check, exit code 1 when anything fails
//        node tools/net-test.mjs --cloudflare   → the same protocol checks against the Cloudflare version
//        (cloudflare/worker.js run by `wrangler dev` in the local Workers runtime), plus what is specific to
//        it: static assets and their headers, pings answered at the edge, hibernation, ghost connections.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { Track, wrapAngle } from '../src/net/interp.js';
import { Presence, cleanName, cleanRoom } from '../src/net/Presence.js';
import { sleep, until, freePort, request, Client } from './lib/net.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CF = process.argv.includes('--cloudflare');
const TICK = 50; // ms: the test server runs with TICK_HZ=20
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const round2 = (v) => Math.round(v * 100) / 100;
const round3 = (v) => Math.round(v * 1000) / 1000;
let failures = 0;
let total = 0;

function check(name, ok, detail) {
  total++;
  if (!ok) failures++;
  const more = ok || detail === undefined ? '' : `  → ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${more}`);
}

// ------------------------------------------------------------------------------------------------- helpers

async function startServer(env = {}, port = 0) {
  port = port || (await freePort());
  const proc = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
    env: { ...process.env, ALLOWED_ORIGINS: '', MAX_PLAYERS: '', DIST_DIR: '', HOST: '127.0.0.1', TICK_HZ: '20', ANTHROPIC_API_KEY: '', NPC_MODEL: '', ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const server = { port, proc, log: '', alive: () => proc.exitCode === null && proc.signalCode === null };
  proc.stdout.on('data', (d) => { server.log += d; });
  proc.stderr.on('data', (d) => { server.log += d; });
  const exited = new Promise((resolve) => proc.once('exit', resolve));
  server.stop = async () => {
    if (server.alive()) proc.kill('SIGTERM');
    await exited;
  };
  for (let i = 0; i < 100 && server.alive(); i++) {
    const res = await request(port, '/healthz').catch(() => null);
    if (res && res.status === 200) return server;
    await sleep(50);
  }
  proc.kill('SIGKILL');
  throw new Error(`the server did not start:\n${server.log}`);
}

// The Cloudflare target: the real Worker and its Durable Object, in the local Workers runtime. The settings come
// from wrangler.jsonc itself (minus the build step), so what is tested is what gets deployed.
async function startWorker(env = {}, port = 0) {
  port = port || (await freePort());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmf-cf-test-'));
  const jsonc = fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8');
  // strip // comments (outside strings) to get plain JSON
  const config = JSON.parse(jsonc.replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*/g, (m, str) => str || ''));
  delete config.build;
  delete config.$schema;
  config.main = path.join(ROOT, config.main);
  config.assets.directory = env.DIST_DIR;
  config.vars = { ...config.vars, TICK_MS: String(TICK), ALLOWED_ORIGINS: env.ALLOWED_ORIGINS || '', DEBUG: '1' };
  if (env.MAX_PLAYERS) config.vars.MAX_PLAYERS = env.MAX_PLAYERS;
  if (env.STALE_MS) config.vars.STALE_MS = env.STALE_MS;
  fs.writeFileSync(path.join(dir, 'wrangler.json'), JSON.stringify(config));
  const proc = spawn(process.execPath, [
    path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--config', path.join(dir, 'wrangler.json'),
    '--port', String(port), '--ip', '127.0.0.1', '--inspector-port', String(await freePort()),
    '--persist-to', path.join(dir, 'state'), '--show-interactive-dev-session=false',
  ], { env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const server = { port, proc, log: '', alive: () => proc.exitCode === null && proc.signalCode === null };
  proc.stdout.on('data', (d) => { server.log += d; });
  proc.stderr.on('data', (d) => { server.log += d; });
  const exited = new Promise((resolve) => proc.once('exit', resolve));
  const kill = (signal) => { try { process.kill(-proc.pid, signal); } catch { /* gone */ } }; // wrangler and its runtime
  server.stop = async () => {
    if (server.alive()) kill('SIGTERM');
    await Promise.race([exited, sleep(4000).then(() => kill('SIGKILL'))]);
    fs.rmSync(dir, { recursive: true, force: true });
  };
  for (let i = 0; i < 400 && server.alive(); i++) {
    const res = await request(port, '/healthz').catch(() => null);
    if (res && res.status === 200) return server;
    await sleep(100);
  }
  kill('SIGKILL');
  throw new Error(`the Worker did not start:\n${server.log}`);
}

const start = (env, port) => (CF ? startWorker(env, port) : startServer(env, port));
// Players who said hello in one room (both relays answer /api/presence?room=…).
const headCount = async (port, room) => JSON.parse((await request(port, `/api/presence?room=${room}`)).body.toString()).players;

async function section(name, fn) {
  try { await fn(); } catch (err) { check(`${name}: no unexpected error`, false, String(err && err.stack ? err.stack : err)); }
}

// ------------------------------------------------------------------------------------ interpolation (pure)

function testInterpolation() {
  const fresh = () => ({ visible: false });
  // Snapshots every 100 ms; sender clock = local clock + 1000; delay = clamp(1.45 * 100, 100, 250) = 145 ms.
  let tr = new Track(100);
  let out = tr.sample(0, fresh());
  check('interp: a track without snapshot is not visible', out.visible === false);
  tr.push(1000, 0, 0, 0, 0, 0, 1, 2);
  tr.push(1100, 100, 1, 2, -4, 1, 3, 4);
  check('interp: playout delay is 145 ms for 100 ms snapshots (within 100..250)', near(tr.delay, 145), tr.delay);
  out = tr.sample(195, fresh()); // playout clock = 195 + 1000 - 145 = 1050: halfway
  check('interp: linear interpolation between two snapshots', near(out.x, 0.5) && near(out.y, 1) && near(out.z, -2) && near(out.yaw, 0.5) && out.visible, out);
  check('interp: anim/flags come from the snapshot being left', out.anim === 1 && out.flags === 2, out);
  out = tr.sample(220, out); // clock 1075
  check('interp: three quarters of the way', near(out.x, 0.75) && near(out.z, -3), out);

  tr = new Track(100);
  tr.push(1000, 0, 0, 0, 0, 3.0);
  tr.push(1100, 100, 0, 0, 0, -3.0);
  out = tr.sample(195, fresh());
  check('interp: yaw takes the shortest arc through ±π', Math.abs(out.yaw) > 3.1 && near(Math.abs(wrapAngle(out.yaw - 3.0)), (Math.PI * 2 - 6) / 2, 1e-6), out.yaw);
  check('interp: wrapAngle stays in [-π, π)', near(wrapAngle(Math.PI * 3), -Math.PI) && near(wrapAngle(-0.5), -0.5) && near(wrapAngle(7), 7 - Math.PI * 2));

  tr = new Track(100);
  tr.push(1000, 0, 0, 5, 0, 0);
  tr.push(1100, 100, 1, 6, 0, 0); // 10 m/s along x
  out = tr.sample(245, fresh()); // clock 1100: exactly on the last snapshot
  const at0 = out.x;
  out = tr.sample(345, out); // 100 ms past the last snapshot
  const at100 = out.x;
  out = tr.sample(445, out); // 200 ms
  const at200 = out.x;
  out = tr.sample(1445, out); // 1.2 s: capped
  check('interp: extrapolates with the last velocity…', near(at0, 1) && near(at100, 2) && near(at200, 3), [at0, at100, at200]);
  check('interp: …for at most 200 ms, then holds', near(out.x, 3) && near(out.y, 6), out);
  for (let t = 1461; t < 2500; t += 16) out = tr.sample(t, out);
  check('interp: reported speed falls back to 0 while holding', out.speed === 0, out.speed);

  tr = new Track(100);
  tr.push(1000, 0, 0, 0, 0, 0);
  tr.push(1100, 100, 50, 0, 0, 0); // 50 m in one snapshot: teleport
  out = tr.sample(195, fresh());
  const before = out.x;
  out = tr.sample(244, out);
  const justBefore = out.x;
  out = tr.sample(246, out);
  check('interp: a teleport (> 12 m) snaps instead of interpolating', before === 0 && justBefore === 0 && out.x === 50, [before, justBefore, out.x]);
  out = tr.sample(400, out);
  check('interp: no extrapolation and no speed spike after a teleport', out.x === 50 && out.speed === 0, out);

  // A peer walking at 2 m/s then stopping: the repeated last snapshot (rest confirmation) prevents any overshoot.
  tr = new Track(100);
  out = fresh();
  let maxX = 0;
  let speedWalking = 0;
  for (let t = 0; t <= 3000; t += 10) {
    if (t % 100 === 0 && t <= 1200) tr.push(1000 + t, t, Math.min(t, 1000) * 0.002, 0, 0, 0);
    tr.sample(t, out);
    maxX = Math.max(maxX, out.x);
    if (t === 900) speedWalking = out.speed;
  }
  check('interp: smoothed speed matches the walking speed', near(speedWalking, 2, 0.2), speedWalking);
  check('interp: stops exactly where the peer stopped (no overshoot)', near(out.x, 2, 1e-9) && maxX <= 2 + 1e-9 && out.speed === 0, { x: out.x, maxX, speed: out.speed });

  // After a long rest the peer starts moving: it must not start gliding before it actually left.
  tr.push(1000 + 8000, 8000, 2.2, 0, 0, 0);
  tr.push(1000 + 8100, 8100, 2.4, 0, 0, 0);
  out = tr.sample(8020, out);
  const early = out.x; // clock = 9020 - 145 = 8875 < 8900 (one interval before the first new snapshot)
  out = tr.sample(8095, out); // clock 8950: halfway between "still there" (8900) and the new snapshot (9000)
  check('interp: after a rest, motion only starts one interval before the new snapshot', near(early, 2, 1e-9) && near(out.x, 2.1, 0.02), [early, out.x]);

  // Late data after a dry spell is blended in, not popped.
  tr = new Track(100);
  out = fresh();
  tr.push(1000, 0, 0, 0, 0, 0);
  tr.push(1100, 100, 1, 0, 0, 0);
  for (let t = 150; t <= 700; t += 10) tr.sample(t, out); // runs dry, extrapolates to x = 3 and holds
  tr.push(1600, 600, 4, 0, 0, 0);
  tr.push(1700, 700, 5, 0, 0, 0);
  let worst = 0;
  let prev = out.x;
  for (let t = 710; t <= 1100; t += 10) {
    tr.sample(t, out);
    worst = Math.max(worst, Math.abs(out.x - prev));
    prev = out.x;
  }
  check('interp: a correction after a stall is blended (no pop)', worst < 0.35 && near(out.x, 5 + 2, 0.05), { worst, x: out.x });

  // Irregular arrivals raise the playout delay, within its bounds.
  tr = new Track(1000 / 12);
  for (let i = 0; i < 60; i++) tr.push(1000 + i * 83, i * 83 + (i % 2 ? 70 : 0), i * 0.1, 0, 0, 0);
  const jittery = tr.delay;
  for (let i = 60; i < 400; i++) tr.push(1000 + i * 83, i * 83 + (i % 2 ? 400 : 0), i * 0.1, 0, 0, 0);
  check('interp: delay adapts to jitter and stays within 100..250 ms', jittery > 140 && jittery <= 250 && tr.delay === 250 && new Track(20).delay === 100, [jittery, tr.delay]);

  tr = new Track(100);
  const bad = [tr.push(NaN, 0, 0, 0, 0, 0), tr.push(1000, 0, 'x', 0, 0, 0), tr.push(1000, 0, 0, Infinity, 0, 0), tr.push(1000, 0, 0, 0, 0, undefined)];
  tr.push(1000, 0, 1, 1, 1, 1);
  check('interp: malformed and stale snapshots are rejected', bad.every((r) => r === false) && tr.push(999, 5, 9, 9, 9, 9) === false && tr.buf.length === 1);
  check('names: control characters and angle brackets stripped, 16 characters max',
    cleanName('<b>Zo\u0007é\n  la   fée</b> des manèges') === 'bZoé la fée/b de' && cleanName('  ') === 'Visitor' && cleanName({}) === 'Visitor' && [...cleanName('🎡'.repeat(40))].length === 16,
    cleanName('<b>Zo\u0007é\n  la   fée</b> des manèges'));
  check('rooms: ids are reduced to [a-z0-9_-]{1,48}', cleanRoom(' La Grande/Roue! ') === 'la-grande-roue' && cleanRoom('x'.repeat(80)).length === 48 && cleanRoom('***') === '' && cleanRoom('a_b-c') === 'a_b-c');
}

// ------------------------------------------------------------------------------------------- static files

const TYPES = {
  html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png',
  jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon', bin: 'application/octet-stream',
  wasm: 'application/wasm', glb: 'model/gltf-binary', gltf: 'model/gltf+json', woff2: 'font/woff2', txt: 'text/plain', map: 'application/json',
};

function makeDist() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmf-net-test-'));
  const dist = path.join(tmp, 'dist');
  fs.mkdirSync(path.join(dist, 'assets/world'), { recursive: true });
  fs.mkdirSync(path.join(dist, 'types'));
  const html = `<!doctype html><html lang="fr"><title>Magic Mill Fair</title><body>${'<p>La grande roue tourne.</p>'.repeat(300)}</body></html>`;
  const js = `export const lines = ${JSON.stringify(Array.from({ length: 3000 }, (_, i) => `manège ${i % 9}`))};\n`;
  fs.writeFileSync(path.join(dist, 'index.html'), html);
  fs.writeFileSync(path.join(dist, 'assets/index-Bx7kQ2aZ.js'), js);
  for (const name of ['index-Bx7kQ2aZ.html', 'chunk-D83-4wx8.js', 'chunk-B2VQ4CKO.css', 'chunk-BRCbD3of.js.map']) fs.writeFileSync(path.join(dist, 'assets', name), js);
  for (const name of ['vendor-settings.js', 'leaf-1024x512.webp', 'world/tile-000a00ff.bin', 'world/tree-oak_0001.json', '../index-Bx7kQ2aZ.js']) fs.writeFileSync(path.join(dist, 'assets', name), js);
  fs.writeFileSync(path.join(dist, 'assets/world/world.json'), JSON.stringify({ trees: Array.from({ length: 500 }, (_, i) => i) }));
  fs.writeFileSync(path.join(dist, 'assets/world/trees.bin'), Buffer.alloc(4096, 7));
  for (const ext of Object.keys(TYPES)) fs.writeFileSync(path.join(dist, 'types', `file.${ext}`), 'x');
  fs.writeFileSync(path.join(tmp, 'secret.txt'), 'TOP-SECRET');
  return { tmp, dist, html, js };
}

async function testStatic(server, fx) {
  const { port } = server;
  let res = await request(port, '/healthz');
  check('http: GET /healthz → 200 ok', res.status === 200 && res.body.toString() === 'ok', res.status);
  res = await request(port, '/api/presence');
  check('http: GET /api/presence → { rooms: 0, players: 0 } when empty', res.status === 200 && res.body.toString() === '{"rooms":0,"players":0}', res.body.toString());

  res = await request(port, '/');
  check('static: / serves index.html, uncompressed unless asked, never cached blindly',
    res.status === 200 && res.body.toString() === fx.html && /^text\/html/.test(res.headers['content-type']) && res.headers['cache-control'] === 'no-cache' && !res.headers['content-encoding'], res.headers);
  res = await request(port, '/index.html', { headers: { 'Accept-Encoding': 'gzip' } });
  check('static: gzip on the fly when accepted',
    res.headers['content-encoding'] === 'gzip' && res.body.length < fx.html.length / 4 && zlib.gunzipSync(res.body).toString() === fx.html
    && Number(res.headers['content-length']) === res.body.length && /accept-encoding/i.test(res.headers.vary || ''), res.headers);
  res = await request(port, '/assets/index-Bx7kQ2aZ.js', { headers: { 'Accept-Encoding': 'gzip, deflate, br' } });
  check('static: brotli preferred when accepted', res.headers['content-encoding'] === 'br' && zlib.brotliDecompressSync(res.body).toString() === fx.js, res.headers);
  check('static: hashed files under /assets/ are immutable', res.headers['cache-control'] === 'public, max-age=31536000, immutable' && /^text\/javascript/.test(res.headers['content-type']), res.headers);
  const again = await request(port, '/assets/index-Bx7kQ2aZ.js', { headers: { 'Accept-Encoding': 'br' } });
  check('static: compressed copy is reused (same bytes)', again.body.equals(res.body));
  const cache = async (target) => (await request(port, target)).headers['cache-control'];
  const hashed = await Promise.all(['/assets/chunk-D83-4wx8.js', '/assets/chunk-B2VQ4CKO.css', '/assets/chunk-BRCbD3of.js.map'].map(cache));
  check('static: every Vite-style hashed name is recognised', hashed.every((c) => /immutable/.test(c)), hashed);
  const plain = await Promise.all(['/assets/vendor-settings.js', '/assets/leaf-1024x512.webp', '/assets/world/tile-000a00ff.bin', '/assets/world/tree-oak_0001.json',
    '/index-Bx7kQ2aZ.js', '/assets/index-Bx7kQ2aZ.html', '/assets/world/world.json'].map(cache));
  const data = await request(port, '/assets/world/world.json');
  check('static: other files are revalidated (no-cache + ETag), never immutable', plain.every((c) => c === 'no-cache') && !!data.headers.etag, plain);
  res = await request(port, '/assets/world/world.json', { headers: { 'If-None-Match': data.headers.etag } });
  check('static: conditional request → 304', res.status === 304 && res.body.length === 0, res.status);
  res = await request(port, '/assets/world/trees.bin', { headers: { 'Accept-Encoding': 'gzip, br' } });
  check('static: binary files are sent as they are', res.status === 200 && !res.headers['content-encoding'] && res.body.length === 4096 && res.headers['content-type'] === 'application/octet-stream', res.headers);
  res = await request(port, '/index.html', { method: 'HEAD' });
  check('static: HEAD → headers only', res.status === 200 && res.body.length === 0 && Number(res.headers['content-length']) === Buffer.byteLength(fx.html), res.headers);
  res = await request(port, '/index.html', { method: 'HEAD', headers: { 'Accept-Encoding': 'gzip' } });
  check('static: HEAD announces the compressed length', res.body.length === 0 && res.headers['content-encoding'] === 'gzip' && Number(res.headers['content-length']) < fx.html.length / 4, res.headers);
  const missing = await Promise.all(['/nope.js', '/assets', '/assets/', '/some/spa/route', '/index.html/x'].map((p) => request(port, p)));
  check('static: unknown paths → 404 (no SPA fallback)', missing.every((r) => r.status === 404), missing.map((r) => r.status));
  res = await request(port, '/', { method: 'POST' });
  check('static: other methods → 405', res.status === 405 && /GET/.test(res.headers.allow || ''), res.status);
  const wrong = [];
  for (const [ext, type] of Object.entries(TYPES)) {
    res = await request(port, `/types/file.${ext}`);
    if (res.status !== 200 || !String(res.headers['content-type']).startsWith(type)) wrong.push(`${ext}: ${res.headers['content-type']}`);
  }
  check(`static: MIME types (${Object.keys(TYPES).join(' ')})`, wrong.length === 0, wrong);
  const attacks = ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/assets/../../secret.txt', '/assets/..%5c..%5csecret.txt',
    '/..%252fsecret.txt', '/%2e%2e%2f%2e%2e%2fsecret.txt', '//../secret.txt', '/./../secret.txt', '/%00', '/%E0%A4%A'];
  const leaks = [];
  for (const target of attacks) {
    res = await request(port, target);
    if (res.status < 400 || res.body.includes('TOP-SECRET')) leaks.push(`${target} → ${res.status}`);
  }
  check('static: path traversal is rejected', leaks.length === 0, leaks);
  res = await request(port, '/ws');
  check('http: plain GET on /ws → 426', res.status === 426, res.status);

  const bare = await startServer({ DIST_DIR: path.join(fx.tmp, 'missing') });
  res = await request(bare.port, '/');
  const health = await request(bare.port, '/healthz');
  check('static: without dist/, a French hint to run "npm run build"', res.status === 503 && res.body.toString().includes('npm run build') && health.status === 200, res.body.toString());
  await bare.stop();
}

// ----------------------------------------------------------------------------------------------- protocol

async function testProtocol(server) {
  const { port } = server;
  const a = new Client(port, 't1');
  const wa = await a.hello('Ada', 3);
  check('ws: welcome carries id, clock, tick and no peer for the first player',
    !!wa && Number.isInteger(wa.id) && wa.id > 0 && Number.isFinite(wa.now) && wa.tick === TICK && Array.isArray(wa.peers) && wa.peers.length === 0, wa);
  a.send({ t: 's', p: [1.23456, 2.34567, -3.33333, 0.123456], a: 2, f: 5 });
  await sleep(TICK * 3);
  const b = new Client(port, 't1');
  const wb = await b.hello('Bob', 4);
  check('ws: welcome lists the players already there, with their last state',
    !!wb && wb.id !== a.id && JSON.stringify(wb.peers) === JSON.stringify([{ id: a.id, name: 'Ada', color: 3, p: [1.23, 2.35, -3.33, 0.123], a: 2, f: 5 }]), wb);
  const joined = await a.wait((m) => m.t === 'join');
  check('ws: the others get a join', JSON.stringify(joined) === JSON.stringify({ t: 'join', id: b.id, name: 'Bob', color: 4 }), joined);
  const c = new Client(port, 't1');
  const wc = await c.hello('Cléo', 15);
  const d = new Client(port, 't2');
  const wd = await d.hello('Dan', 1);
  // (ids are unique per room on Cloudflare, where every room is its own object; across the server under Node)
  check('ws: third player sees both, ids are unique', !!wc && wc.peers.map((p) => p.id).sort().join() === [a.id, b.id].sort().join() && new Set(CF ? [a.id, b.id, c.id] : [a.id, b.id, c.id, d.id]).size === (CF ? 3 : 4), wc);
  check('ws: another room starts empty', !!wd && wd.peers.length === 0, wd);
  let res = await request(port, '/api/presence');
  if (!CF) check('http: /api/presence counts rooms and players', res.body.toString() === '{"rooms":2,"players":4}', res.body.toString());
  res = await request(port, '/api/presence?room=T1');
  const census1 = JSON.parse(res.body.toString());
  check('http: /api/presence?room= counts one room', census1.room === 't1' && census1.players === 3 && (await headCount(port, 't2')) === 1 && (await headCount(port, 'nobody')) === 0, res.body.toString());

  // States: batched to the others, rounded, clamped, never echoed.
  a.send({ t: 's', p: [10.004, 20.006, 99999, 7.5], a: 3, f: 200 });
  const u = await b.wait((m) => m.t === 'u' && m.s.some((r) => r[0] === a.id && r[1] === 10));
  const row = u && u.s.find((r) => r[0] === a.id);
  check('ws: a state reaches the others in a batch', !!u && Number.isFinite(u.now), u);
  check('ws: values are rounded (2 decimals, yaw 3) and clamped', !!row && JSON.stringify(row.slice(0, 7)) === JSON.stringify([a.id, 10, 20.01, 2000, round3(7.5 - Math.PI * 2), 3, 200]), row);
  check('ws: rows carry their age at tick time', !!row && Number.isInteger(row[7]) && row[7] >= 0 && row[7] <= TICK * 3, row);
  a.send({ t: 's', p: [-1e9, -1e9, 0, 0], a: 99, f: -1 });
  const low = await c.wait((m) => m.t === 'u' && m.s.some((r) => r[0] === a.id && r[1] === -2000));
  check('ws: out-of-range values are clamped or reset', !!low && JSON.stringify(low.s.find((r) => r[0] === a.id).slice(1, 7)) === '[-2000,-100,0,0,0,0]', low);

  // Two players moving in the same tick: one batch for the third, each of them only gets the other one.
  let both = null;
  for (let i = 1; i <= 12 && !both; i++) {
    a.send({ t: 's', p: [100 + i, 0, 0, 0], a: 0, f: 0 });
    b.send({ t: 's', p: [200 + i, 0, 0, 0], a: 0, f: 0 });
    both = await c.wait((m) => m.t === 'u' && m.s.length === 2 && m.s.some((r) => r[1] === 100 + i) && m.s.some((r) => r[1] === 200 + i), TICK * 3);
  }
  check('ws: states of one tick are batched together', !!both, c.msgs.slice(-3));
  await sleep(TICK * 3);
  check('ws: nobody ever receives its own state', [a, b, c, d].every((x) => x.rows(x.id).length === 0) && a.rows(b.id).length > 0 && b.rows(a.id).length > 0);
  check('ws: rooms are isolated', d.rows().length === 0 && !d.msgs.some((m) => m.t === 'join' || m.t === 'leave' || m.t === 'e') && a.rows(d.id).length === 0, d.msgs);

  // Unchanged state: relayed once more (rest confirmation), then not at all.
  for (let i = 0; i < 4; i++) {
    b.send({ t: 's', p: [555, 1, 2, 3], a: 1, f: 1 });
    await sleep(TICK * 3);
  }
  check('ws: an unchanged state is confirmed once, then no longer relayed', a.rows(b.id).filter((r) => r[1] === 555).length === 2, a.rows(b.id).filter((r) => r[1] === 555));

  // Emotes, ping, identity.
  b.send({ t: 'e', e: 7 });
  const emote = await a.wait((m) => m.t === 'e');
  await c.wait((m) => m.t === 'e');
  await sleep(TICK);
  check('ws: emotes are relayed to the room only', JSON.stringify(emote) === JSON.stringify({ t: 'e', id: b.id, e: 7 }) && c.msgs.some((m) => m.t === 'e') && ![b, d].some((x) => x.msgs.some((m) => m.t === 'e')), emote);
  // Chat: relayed as it comes to the others in the room, cleaned and bounded, never sent back, never stored.
  b.send({ t: 'c', m: '  Hello\u0000  there,\n<b>friends</b>  ' });
  const said = await a.wait((m) => m.t === 'c');
  await c.wait((m) => m.t === 'c');
  await sleep(TICK);
  check('ws: chat lines are relayed to the room only, cleaned, not echoed', JSON.stringify(said) === JSON.stringify({ t: 'c', id: b.id, m: 'Hello there, <b>friends</b>' }) && c.msgs.some((m) => m.t === 'c') && ![b, d].some((x) => x.msgs.some((m) => m.t === 'c')), said);
  b.send({ t: 'c', m: 'é'.repeat(500) });
  const long = await a.wait((m) => m.t === 'c' && m.m.startsWith('é'));
  check('ws: a chat line is cut at 200 characters', !!long && [...long.m].length === 200, long && long.m.length);
  for (const bad of [{ t: 'c' }, { t: 'c', m: 42 }, { t: 'c', m: '   \n ' }, { t: 'c', m: ['x'] }]) b.send(bad);
  const chatBefore = a.msgs.filter((m) => m.t === 'c').length;
  for (let i = 0; i < 12; i++) b.send({ t: 'c', m: `line ${i}` });
  await sleep(350);
  const chatGot = a.msgs.filter((m) => m.t === 'c').length - chatBefore;
  check('ws: empty or malformed lines are dropped; a talkative player is slowed down, not disconnected (5 in a row, then 1 every 2 s)', chatGot >= 2 && chatGot <= 4 && b.code === null && server.alive(), { chatGot, code: b.code });
  const late = new Client(port, 't1');
  const wl = await late.hello('Late');
  await sleep(TICK * 2);
  check('ws: nothing is kept for those who arrive later', !!wl && !late.msgs.some((m) => m.t === 'c') && !JSON.stringify(wl).includes('friends'), late.msgs.filter((m) => m.t === 'c'));
  await late.close();
  await a.wait((m) => m.t === 'leave' && m.id === late.id);
  a.send({ t: 'ping', c: 42 });
  const pong = await a.wait((m) => m.t === 'pong');
  check('ws: ping → pong with the server clock', !!pong && pong.c === 42 && Number.isFinite(pong.now), pong);
  a.send({ t: 'hello', name: '<i>Ada\u0000 Lovelace de la grande roue</i>', color: 99 });
  const renamed = await b.wait((m) => m.t === 'join' && m.id === a.id);
  check('ws: a new hello renames (join for a known id), name sanitised', !!renamed && renamed.name === 'iAda Lovelace de' && renamed.color === 0, renamed);
  const e = new Client(port, 't2');
  const we = await e.hello(undefined, 'x');
  const anonymous = await d.wait((m) => m.t === 'join' && m.id === e.id);
  check('ws: default name and colour', !!we && we.peers.length === 1 && anonymous?.name === 'Visitor' && anonymous.color === 0, anonymous);

  // Garbage must be ignored without closing the connection nor crashing the server.
  const junk = ['', 'not json', '{', 'null', '[]', '42', '"s"', '{"t":"s"}', '{"t":"s","p":"x"}', '{"t":"s","p":[1,2,3]}', '{"t":"s","p":[1e999,0,0,0]}',
    '{"t":"s","p":[null,0,0,0]}', '{"t":"s","p":{"length":4}}', '{"t":"e","e":-1}', '{"t":"e","e":32}', '{"t":"e","e":1.5}', '{"t":"e"}', '{"t":"zz"}',
    '{"t":"hello","name":{"a":1},"color":[]}', '{"t":"ping","c":"x"}', '{"t":["s"]}', '{"__proto__":{"t":"s"}}', Buffer.from([0, 255, 254, 1, 2])];
  const before = { rows: b.rows(a.id).length, emotes: b.msgs.filter((m) => m.t === 'e').length };
  for (const frame of junk) a.send(frame);
  a.send({ t: 's', p: [77, 0, 0, 0], a: 0, f: 0 });
  const after = await b.wait((m) => m.t === 'u' && m.s.some((r) => r[0] === a.id && r[1] === 77));
  res = await request(port, '/healthz');
  check('ws: malformed frames are ignored (connection kept, server alive)',
    !!after && a.code === null && server.alive() && res.status === 200 && b.rows(a.id).length === before.rows + 1 && b.msgs.filter((m) => m.t === 'e').length === before.emotes, { code: a.code, log: server.log });

  // Leaving.
  await c.close();
  const left = await a.wait((m) => m.t === 'leave' && m.id === c.id);
  await b.wait((m) => m.t === 'leave' && m.id === c.id);
  check('ws: closing sends a leave to the room', JSON.stringify(left) === JSON.stringify({ t: 'leave', id: c.id }) && !d.msgs.some((m) => m.t === 'leave'), left);

  // Oversized frame → that connection is closed, the others are told.
  const big = new Client(port, 't1');
  await big.hello('Big');
  big.send({ t: 's', p: [0, 0, 0, 0], a: 0, f: 0, pad: 'x'.repeat(3000) });
  const bigCode = await Promise.race([big.closed, sleep(3000)]);
  const bigLeft = await a.wait((m) => m.t === 'leave' && m.id === big.id);
  check('ws: a frame over 2 KB closes the connection (1009)', bigCode === 1009 && !!bigLeft && server.alive(), bigCode);

  // Flooding → disconnected, after the allowed burst (2 s × 40 messages) went through.
  const flood = new Client(port, 't1');
  await flood.hello('Flood');
  for (let i = 0; i < 400; i++) flood.send({ t: 'e', e: 9 });
  const floodCode = await Promise.race([flood.closed, sleep(3000)]);
  const floodLeft = await a.wait((m) => m.t === 'leave' && m.id === flood.id);
  const relayed = a.msgs.filter((m) => m.t === 'e' && m.id === flood.id).length;
  check('ws: a flooding client is disconnected (> 40 msg/s over 2 s)', Number.isInteger(floodCode) && !!floodLeft && relayed >= 70 && relayed <= 90 && server.alive(), { floodCode, relayed });
  const polite = new Client(port, 't2');
  await polite.hello('Poli');
  for (let i = 0; i < 60; i++) {
    polite.send({ t: 's', p: [i, 0, 0, 0], a: 0, f: 0 });
    await sleep(25);
  }
  check('ws: 40 msg/s sustained is tolerated', polite.code === null && d.rows(polite.id).length > 20, polite.code);

  // Room capacity (the test server runs with MAX_PLAYERS=4).
  const crowd = [];
  for (let i = 0; i < 4; i++) {
    crowd.push(new Client(port, 'crowd'));
    await crowd[i].hello(`P${i}`);
  }
  const extra = new Client(port, 'crowd');
  const full = await extra.wait((m) => m.t === 'full');
  const extraCode = await Promise.race([extra.closed, sleep(3000)]);
  check('ws: a full room answers {t:"full"} and closes', !!full && extraCode === 1013 && crowd.every((x) => x.id > 0 && x.code === null), { full, extraCode });
  await Promise.all(crowd.map((x) => x.close()));
  await until(() => !crowd.some((x) => x.code === null));
  const retry = new Client(port, 'crowd');
  check('ws: …and accepts again once somebody left', !!(await retry.hello('Retry')), retry.msgs);

  // Room ids, origins, paths.
  const weird = new Client(port, 'Été 2026 / Grande_Roue-1!');
  await weird.hello('W');
  const same = new Client(port, 't2026grande_roue-1');
  const ws = await same.hello('S');
  check('ws: room ids are sanitised to [a-z0-9_-]', !!ws && ws.peers.length === 1 && ws.peers[0].id === weird.id, ws);
  const dflt = new Client(port, '');
  await dflt.hello('M1');
  const main = new Client(port, 'main');
  const wm = await main.hello('M2');
  check('ws: the default room is "main"', !!wm && wm.peers.length === 1 && wm.peers[0].id === dflt.id, wm);
  const evil = new Client(port, 't1', { origin: 'https://evil.example' });
  const local = new Client(port, 't1', { origin: 'http://localhost:5173' });
  const sameHost = new Client(port, 't1', { origin: `http://127.0.0.1:${port}` });
  const verdicts = await Promise.all([evil.opened, local.opened, sameHost.opened]);
  check('ws: foreign origins are refused (403), localhost and same host accepted', JSON.stringify(verdicts) === '[false,true,true]' && evil.status === 403, [verdicts, evil.status]);
  const other = new WebSocket(`ws://127.0.0.1:${port}/other`);
  const otherStatus = await new Promise((resolve) => {
    other.on('unexpected-response', (req, r) => { req.destroy(); resolve(r.statusCode); });
    other.on('error', () => resolve(0));
    other.on('open', () => resolve(101));
  });
  check('ws: upgrades outside /ws are refused (404)', otherStatus === 404, otherStatus);

  await Promise.all([a, b, d, e, polite, retry, weird, same, dflt, main, local, sameHost].map((x) => x.close()));
  if (!CF) {
    let census = '';
    for (let i = 0; i < 40 && census !== '{"rooms":0,"players":0}'; i++) {
      await sleep(50);
      census = (await request(port, '/api/presence')).body.toString();
    }
    check('ws: empty rooms are removed', census === '{"rooms":0,"players":0}', census);
  } else {
    await until(() => false, 300);
    check('ws: rooms are empty once everybody left', (await headCount(port, 't1')) === 0 && (await headCount(port, 't2')) === 0 && (await headCount(port, 'main')) === 0);
  }

  const strict = await start({ ALLOWED_ORIGINS: 'https://fair.example, https://autre.example/', DIST_DIR: server.dist });
  const ok = new Client(strict.port, 'r', { origin: 'https://autre.example' });
  const ko = new Client(strict.port, 'r', { origin: `http://127.0.0.1:${strict.port}` });
  const cli = new Client(strict.port, 'r');
  const strictVerdicts = await Promise.all([ok.opened, ko.opened, cli.opened]);
  check('ws: ALLOWED_ORIGINS restricts browser origins to the list', JSON.stringify(strictVerdicts) === '[true,false,true]' && ko.status === 403, strictVerdicts);
  await Promise.all([ok.close(), cli.close()]);
  await strict.stop();
}

// ------------------------------------------------------------------------------- the API: scores, characters

async function testApi({ port }) {
  const json = (res) => { try { return JSON.parse(res.body.toString()); } catch { return null; } };
  const post = (target, body, headers = {}) => request(port, target, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  let res = await request(port, '/api/scores');
  check('api: GET /api/scores → the board of the Sky Stones, empty at first', res.status === 200 && json(res)?.board === 'sky' && Array.isArray(json(res).top) && json(res).top.length === 0 && /json/.test(res.headers['content-type']), [res.status, res.body.toString().slice(0, 120)]);
  // a page of another site may not post (browsers say where a POST comes from); not counted by the limiter
  res = await post('/api/scores', { board: 'sky', name: 'Mallory', ms: 150000 }, { origin: 'https://elsewhere.example' });
  check('api: a POST from another site is refused', res.status === 403, res.status);
  // six posts a minute per address: the first three are honest times
  res = await post('/api/scores', { board: 'sky', name: '  Ada   <b>Lovelace</b> the first ', ms: 240000.4 });
  const first = json(res);
  check('api: a time is recorded, the name cleaned', res.status === 200 && first?.rank === 1 && first.best === true && first.top[0].ms === 240000 && first.top[0].name === 'Ada bLovelace/b' && first.top[0].at === undefined, res.body.toString().slice(0, 200));
  res = await post('/api/scores', { board: 'sky', name: 'Bob', ms: 200000 });
  const second = json(res);
  res = await post('/api/scores', { board: 'sky', name: 'ada blovelace/B', ms: 300000 });
  const third = json(res);
  check('api: best first; a slower time changes nothing, whatever the case of the name', second?.rank === 1 && second.top.map((e) => e.name).join() === 'Bob,Ada bLovelace/b' && third?.rank === 2 && third.best === false && third.top[1].ms === 240000, [second, third]);
  const bad = [];
  bad.push((await post('/api/scores', { board: 'sky', name: 'Flash', ms: 1000 })).status); // nobody climbs that fast
  bad.push((await post('/api/scores', { board: '__proto__', name: 'Eve', ms: 200000 })).status);
  bad.push((await post('/api/scores', `{"board":"sky","name":"Big","ms":200000,"pad":"${'x'.repeat(6000)}"}`)).status);
  check('api: impossible times, unknown boards and oversized bodies are refused', bad.join() === '400,400,400', bad);
  res = await post('/api/scores', { board: 'sky', name: 'Carol', ms: 210000 });
  const limited = res.status;
  res = await request(port, '/api/scores?board=sky');
  check('api: a seventh POST within the minute is turned away; the board is unchanged', limited === 429 && json(res)?.top.length === 2 && json(res).top[0].name === 'Bob', [limited, res.body.toString().slice(0, 160)]);
  res = await request(port, '/api/scores?board=nope');
  const del = await request(port, '/api/scores', { method: 'DELETE' });
  check('api: unknown board → 404, other methods → 405', res.status === 404 && del.status === 405, [res.status, del.status]);
  // the characters: no key in this test, so the game is told to use its own lines
  res = await post('/api/npc', { npc: 'alligator', messages: [{ role: 'user', content: 'Hello Al' }] });
  const get = await request(port, '/api/npc');
  check('api: /api/npc without a key → 501 (the game uses its own lines), GET → 405', res.status === 501 && json(res)?.reply === null && get.status === 405, [res.status, get.status]);
}

// ------------------------------------------------------------------------------------------ Presence façade

function listen(presence) {
  const events = [];
  for (const type of ['status', 'join', 'leave', 'emote', 'identity']) presence.on(type, (arg) => events.push({ type, ...arg }));
  presence.on('chat', ({ id, text }) => events.push({ type: 'chat', id, text }));
  return events;
}

// Calls `fn(seconds)` roughly every 8 ms for `ms` milliseconds, like a render loop would.
async function frames(ms, fn) {
  const start = performance.now();
  for (let t = 0; t < ms; t = performance.now() - start) {
    fn(t / 1000);
    await sleep(8);
  }
}

// `sender` walks along +x from `x0` at `speed` m/s for 1.6 s, then stands still for 0.9 s; returns what `receiver`
// saw of it. Real clocks and several processes are involved: on a busy machine a measurement can be disturbed,
// so it is redone (twice at most) before being judged.
async function walk(sender, receiver, peer, x0, speed, pose) {
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    const from = x0 + attempt * 9;
    const trace = [];
    await frames(1600, (t) => {
      sender.setLocal(from + speed * t, ...pose);
      sender.update(0.008);
      receiver.update(0.008);
      if (t > 0.6 && peer.visible) trace.push({ t, x: peer.x, speed: peer.speed });
    });
    const last = trace[trace.length - 1] || {};
    result = { frames: trace.length, backwards: 0, jumps: 0, lag: from + speed * last.t - last.x, speed: last.speed, seen: { ...peer } };
    for (let i = 1; i < trace.length; i++) {
      const dx = trace[i].x - trace[i - 1].x;
      if (dx < -0.005) result.backwards++;
      if (dx > speed * (trace[i].t - trace[i - 1].t) * 2 + 0.05) result.jumps++;
    }
    result.stop = round2(from + speed * 1.6 + 0.123);
    await frames(900, () => {
      sender.setLocal(result.stop, pose[0], pose[1], pose[2], 0, 0);
      sender.update(0.008);
      receiver.update(0.008);
    });
    result.smooth = result.frames > 50 && result.backwards === 0 && result.jumps === 0;
    result.follows = result.lag > 0.04 * speed && result.lag < 0.4 * speed; // 40 to 400 ms behind the sender
    result.stopped = near(peer.x, result.stop, 0.005) && peer.speed < 0.05;
    if (result.smooth && result.follows && result.stopped) break;
  }
  return result;
}

async function testPresence(server) {
  const url = `ws://127.0.0.1:${server.port}/ws`;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(' ')); // the client reports what it had to catch (restored by main)

  // --- online, through the real server
  const a = new Presence({ room: 'Façade 1', name: 'Ada', color: 3, url });
  const b = new Presence({ room: 'façade-1', name: 'Bob', color: 5, url: `http://127.0.0.1:${server.port}/ws` });
  const ea = listen(a);
  const eb = listen(b);
  check('presence: constructor does not connect, room is sanitised', a.mode === 'offline' && a.count === 1 && a.peers.size === 0 && a.room === 'fa-ade-1' && b.room === 'fa-ade-1', [a.mode, a.room, b.room]);
  a.connect();
  b.connect();
  a.connect(); // twice: no effect
  await until(() => a.peers.size === 1 && b.peers.size === 1);
  const bobSeenByAda = [...a.peers.values()][0];
  check('presence: two clients get online and see each other', a.mode === 'online' && b.mode === 'online' && bobSeenByAda?.name === 'Bob' && bobSeenByAda?.color === 5 && bobSeenByAda?.id === b.id && a.id > 0, [a.mode, b.mode, bobSeenByAda]);
  check('presence: status and join events', eb.some((e) => e.type === 'status' && e.mode === 'online' && e.count === 2) && eb.filter((e) => e.type === 'join').length === 1 && eb.find((e) => e.type === 'join').name === 'Ada', eb);
  check('presence: a peer without state is not visible yet', bobSeenByAda?.visible === false, bobSeenByAda);

  const ada = b.peers.get(a.id);
  const w = await walk(a, b, ada, 0, 3, [1.5, -2, 0.5, 2, 9]); // y, z, yaw, anim, flags
  check('presence: remote avatar follows, a little in the past', w.follows && near(w.seen.y, 1.5, 0.01) && near(w.seen.z, -2, 0.01) && near(w.seen.yaw, 0.5, 0.01) && w.seen.anim === 2 && w.seen.flags === 9, w);
  check('presence: interpolated motion is continuous (no jump, no step back)', w.smooth, w);
  check('presence: speed is about the walking speed', near(w.speed, 3, 0.8), w.speed);
  check('presence: remote avatar stops exactly where the player stopped', w.stopped && ada.anim === 0 && ada.flags === 0, { x: ada.x, expected: w.stop, speed: ada.speed });
  const stopAt = w.stop;

  a.sendEmote(7);
  a.sendEmote(99); // invalid: ignored
  await until(() => eb.some((e) => e.type === 'emote'));
  await sleep(100);
  check('presence: emotes', JSON.stringify(eb.filter((e) => e.type === 'emote')) === JSON.stringify([{ type: 'emote', id: a.id, emote: 7 }]) && !ea.some((e) => e.type === 'emote'), eb.filter((e) => e.type === 'emote'));
  const line = a.sendChat('  Bonjour   tout\tle monde  ');
  const none = a.sendChat('   ');
  await until(() => eb.some((e) => e.type === 'chat'));
  await sleep(60);
  check('presence: chat lines reach the others, cleaned; the sender gets back what was sent', line === 'Bonjour tout le monde' && none === ''
    && JSON.stringify(eb.filter((e) => e.type === 'chat')) === JSON.stringify([{ type: 'chat', id: a.id, text: 'Bonjour tout le monde' }]) && !ea.some((e) => e.type === 'chat'), eb.filter((e) => e.type === 'chat'));
  const burst = Array.from({ length: 8 }, (_, i) => a.sendChat(`fast ${i}`)).filter(Boolean).length;
  check('presence: the client itself holds back a flood of lines', burst >= 3 && burst <= 4, burst);
  a.setIdentity('  Zoé <3 ', 12);
  await until(() => eb.some((e) => e.type === 'identity'));
  check('presence: setIdentity renames for the others, without a second join', ada.name === 'Zoé 3' && ada.color === 12 && a.name === 'Zoé 3' && eb.filter((e) => e.type === 'join').length === 1 && b.peers.size === 1, [ada.name, ada.color]);

  // --- a third client arrives late: it must see the others where they stand
  const c = new Presence({ room: 'fa-ade-1', name: 'Cléo', color: 1, url });
  c.connect();
  await until(() => c.peers.size === 2);
  c.update(0.016);
  const adaSeenByCleo = c.peers.get(a.id);
  check('presence: a newcomer sees existing players at once, at their last position', !!adaSeenByCleo && adaSeenByCleo.visible && near(adaSeenByCleo.x, stopAt, 0.005) && adaSeenByCleo.name === 'Zoé 3' && c.count === 3, adaSeenByCleo);
  c.dispose();
  await until(() => b.peers.size === 1);
  check('presence: dispose() leaves the room', b.peers.size === 1 && eb.some((e) => e.type === 'leave' && e.name === 'Cléo') && eb.some((e) => e.type === 'status' && e.count === 3) && b.count === 2, eb.filter((e) => e.type !== 'emote'));

  if (CF) {
    a.dispose();
    b.dispose();
    check('presence: no internal error was caught along the way', warnings.length === 0, warnings);
    return;
  }

  // --- two idle tabs (never calling setLocal/update, like hidden tabs) are left alone during the next section
  const idle1 = new Presence({ room: 'veille', name: 'Veille 1' });
  const idle2 = new Presence({ room: 'veille', name: 'Veille 2' });
  const ei = listen(idle1);
  const idleSince = Date.now();
  idle1.connect();
  idle2.connect();

  // --- the server goes away: same-browser fallback, then back online when it returns
  const port = await freePort();
  let own = await startServer({}, port);
  const p1 = new Presence({ room: 'resilience', name: 'Un', url: `ws://127.0.0.1:${port}/ws` });
  const p2 = new Presence({ room: 'resilience', name: 'Deux', url: `ws://127.0.0.1:${port}/ws` });
  const e1 = listen(p1);
  p1.connect();
  p2.connect();
  await until(() => p1.peers.size === 1 && p2.peers.size === 1 && p1.mode === 'online');
  const onlineId = p1.id;
  await own.stop();
  await until(() => p1.mode === 'local' && p2.mode === 'local' && p1.peers.size === 1 && p2.peers.size === 1, 6000);
  check('presence: server lost → falls back to local mode, peers of the same browser still there', p1.mode === 'local' && p2.mode === 'local' && p1.peers.size === 1 && [...p1.peers.values()][0].name === 'Deux' && p1.id !== onlineId, [p1.mode, p2.mode, p1.peers.size]);
  let threw = null;
  try {
    p1.setLocal(1, 2, 3, 4, 5, 6);
    p1.sendEmote(1);
    p1.setIdentity('Un bis', 2);
    p1.update(0.016);
  } catch (err) { threw = err; }
  check('presence: the API stays usable without server', threw === null, String(threw));
  own = await startServer({}, port);
  await until(() => p1.mode === 'online' && p2.mode === 'online' && p1.peers.size === 1 && p2.peers.size === 1, 12000);
  check('presence: server back → reconnects on its own and returns online', p1.mode === 'online' && p2.mode === 'online' && p1.peers.size === 1 && [...p2.peers.values()][0].name === 'Un bis', [p1.mode, p2.mode, p1.peers.size, e1.filter((e) => e.type === 'status')]);
  p1.dispose();
  p2.dispose();
  await own.stop();
  await sleep(Math.max(0, 6500 - (Date.now() - idleSince)));
  check('presence: local mode — an idle tab stays present beyond the 5 s timeout (own keep-alive)',
    idle1.mode === 'local' && idle1.peers.size === 1 && idle2.peers.size === 1 && ei.filter((e) => e.type === 'join').length === 1 && !ei.some((e) => e.type === 'leave'), ei);
  idle1.dispose();
  idle2.dispose();

  // --- garbage from a (fake) server must never throw
  const fakePort = await freePort();
  const fake = new WebSocketServer({ port: fakePort, host: '127.0.0.1' });
  const garbage = ['', 'not json', 'null', '[]', '7', '{"t":"u"}', '{"t":"u","now":"x","s":"y"}', '{"t":"u","now":1,"s":[null,[],[7],[7,"a","b"],[7,1e999,0,0,0,0,0],{"0":7}]}',
    '{"t":"join"}', '{"t":"join","id":"x"}', '{"t":"join","id":1.5,"name":"n"}', '{"t":"leave"}', '{"t":"leave","id":{}}', '{"t":"e","id":7,"e":"x"}', '{"t":"e","id":7,"e":64}',
    '{"t":"welcome"}', '{"t":"welcome","id":"x","peers":3}', '{"t":"pong"}', '{"t":"full"}', '{"t":{}}'];
  fake.on('connection', (ws) => {
    ws.on('message', () => {
      for (const g of garbage) ws.send(g);
      ws.send(JSON.stringify({ t: 'welcome', id: 5, now: 1000, tick: 'fast', peers: [null, 3, { id: 'x' }, { id: 5, name: 'moi' }, { id: 7, name: { toString: 1 }, color: 'red', p: [1, 2, 3], a: 'x' }, { id: 8, name: '<Huit>', color: 2, p: [4, 5, 6, 7], a: 3, f: 300 }] }));
      for (const g of garbage) ws.send(g);
      ws.send(Buffer.from([1, 2, 3]));
      ws.send(JSON.stringify({ t: 'u', now: 1100, s: [[8, 5, 5, 6, 7, 3, 300, 'age'], [9, 0, 0, 0, 0, 0, 0]] }));
      ws.send(JSON.stringify({ t: 'e', id: 8, e: 3 }));
    });
  });
  const g = new Presence({ room: 'junk', name: 'G', url: `ws://127.0.0.1:${fakePort}/ws` });
  const eg = listen(g);
  g.connect();
  await until(() => eg.some((e) => e.type === 'emote'));
  g.update(0.016);
  const seven = g.peers.get(7);
  const eight = g.peers.get(8);
  check('presence: malformed server messages are ignored, valid ones still apply',
    g.mode === 'online' && g.id === 5 && g.peers.size === 2 && seven?.name === 'Visitor' && seven.color === 0 && seven.visible === false && eight?.name === 'Huit' && eight.color === 2 && eight.visible && eight.x >= 4 && eight.x <= 5.5 && eight.y === 5 && eight.anim === 3 && eight.flags === 0
    && eg.filter((e) => e.type === 'emote').length === 1, { mode: g.mode, id: g.id, peers: [...g.peers.values()] });
  g.dispose();
  await new Promise((resolve) => { for (const ws of fake.clients) ws.terminate(); fake.close(resolve); });

  // --- no server at all (no location under Node): BroadcastChannel only
  const l1 = new Presence({ room: 'tabs', name: 'Onglet 1', color: 1 });
  const l2 = new Presence({ room: 'tabs', name: 'Onglet 2', color: 2 });
  const el1 = listen(l1);
  const el2 = listen(l2);
  l1.connect();
  await until(() => l1.mode === 'local');
  l1.setLocal(5, 0, 5, 1, 1, 0);
  l2.connect();
  await until(() => l1.peers.size === 1 && l2.peers.size === 1);
  const tab1 = l2.peers.get(l1.id);
  check('presence: local mode — tabs find each other without server', l1.mode === 'local' && l2.mode === 'local' && tab1?.name === 'Onglet 1' && tab1.color === 1 && l1.id !== l2.id && l1.id > 0 && el2.some((e) => e.type === 'status' && e.mode === 'local' && e.count === 2), [l1.mode, l2.mode, l1.id, l2.id]);
  await until(() => { l2.update(0.016); return tab1.visible; });
  check('presence: local mode — a newcomer gets the position of the others right away', tab1.visible && near(tab1.x, 5) && near(tab1.z, 5), tab1);
  const lw = await walk(l1, l2, tab1, 5, 2, [0, 5, 1, 1, 0]);
  check('presence: local mode — smooth motion that ends on the right spot', lw.smooth && lw.follows && lw.stopped, lw);
  l2.sendEmote(4);
  l2.sendChat('salut');
  await until(() => el1.some((e) => e.type === 'chat'));
  check('presence: local mode — chat between tabs', el1.some((e) => e.type === 'chat' && e.text === 'salut' && e.id === l2.id) && !el2.some((e) => e.type === 'chat'), el1.filter((e) => e.type === 'chat'));
  l2.setIdentity('Renommé', 9);
  await until(() => el1.some((e) => e.type === 'identity') && el1.some((e) => e.type === 'emote'));
  check('presence: local mode — emotes and renames', el1.some((e) => e.type === 'emote' && e.emote === 4 && e.id === l2.id) && l1.peers.get(l2.id)?.name === 'Renommé' && l1.peers.get(l2.id)?.color === 9, el1);
  const stray = new BroadcastChannel('mmf-presence-tabs');
  const fromTab1 = { id: l1.id, name: 'Onglet 1', color: 1 };
  for (const junk of [null, 5, 'x', {}, [], { t: 'u' }, { t: 'u', id: 1.5 }, { t: 'zz', id: 77 }, { t: 'hello' }, { t: 'hello', id: 'x' }, { t: 'leave', id: null }, { t: 'leave', id: 123456 },
    { ...fromTab1, t: 'u' }, { ...fromTab1, t: 'u', s: 'x' }, { ...fromTab1, t: 'u', s: [null] }, { ...fromTab1, t: 'u', now: 'x', s: [[l1.id, 'a', {}, 0, 0, 0, 0]] },
    { ...fromTab1, t: 'u', now: 5, s: [[999, 1, 1, 1, 1, 0, 0]] }, { ...fromTab1, t: 'e', e: 'x' }, { ...fromTab1, t: 'e', e: 99 }]) stray.postMessage(junk);
  await sleep(150);
  l1.update(0.016);
  l2.update(0.016);
  check('presence: local mode — garbage on the channel is ignored', l1.peers.size === 1 && l2.peers.size === 1 && near(tab1.x, lw.stop, 0.005) && el1.filter((e) => e.type === 'emote').length === 1, [l1.peers.size, l2.peers.size, tab1.x]);
  stray.close();
  l2.dispose();
  await until(() => l1.peers.size === 0);
  check('presence: local mode — closing a tab is seen at once', l1.peers.size === 0 && el1.some((e) => e.type === 'leave') && l1.count === 1, el1.slice(-3));
  const l3 = new Presence({ room: 'tabs', name: 'Onglet 3' });
  l3.connect();
  await until(() => l1.peers.size === 1 && l3.peers.size === 1);
  check('presence: local mode — peers in other rooms or disposed ones are not seen', l1.peers.size === 1 && [...l1.peers.values()][0].name === 'Onglet 3' && l3.peers.size === 1);
  l1.dispose();
  l3.dispose();

  // --- nothing available at all: offline, and the API still does not throw
  const BC = globalThis.BroadcastChannel;
  globalThis.BroadcastChannel = undefined;
  const solo = new Presence({ room: 'solo' });
  const es = listen(solo);
  let error = null;
  try {
    solo.connect();
    await until(() => es.length > 0);
    solo.setLocal(1, 2, 3, 4, 5, 6);
    solo.setLocal(NaN, undefined, 'x', {}, null, -1);
    solo.sendEmote(3);
    solo.sendEmote('x');
    solo.setIdentity('Seul', 3);
    solo.setIdentity();
    solo.update(0.016);
    solo.update();
    solo.dispose();
    solo.dispose();
    solo.connect();
    solo.setLocal(0, 0, 0, 0);
    solo.update(0.016);
  } catch (err) { error = err; }
  globalThis.BroadcastChannel = BC;
  check('presence: no server and no BroadcastChannel → offline, nothing throws', error === null && JSON.stringify(es) === JSON.stringify([{ type: 'status', mode: 'offline', count: 1 }]) && solo.name === 'Seul' && solo.color === 3, { error: String(error), es });
  const anon = new Presence();
  check('presence: default identity and room', /^Visitor \d\d$/.test(anon.name) && Number.isInteger(anon.color) && anon.color >= 0 && anon.color <= 15 && anon.room === 'main', [anon.name, anon.color, anon.room]);

  a.dispose();
  b.dispose();
  check('presence: no internal error was caught along the way', warnings.length === 0, warnings);
}

// ----------------------------------------------------------------------------------------- Cloudflare only

async function testCloudflare(server, fx) {
  const { port } = server;
  // --- the site: files served by the platform, with the headers of public/_headers
  let res = await request(port, '/');
  check('cf: / serves the page', res.status === 200 && /text\/html/.test(res.headers['content-type']) && res.body.toString() === fx.html, [res.status, res.headers['content-type']]);
  res = await request(port, '/assets/index-Bx7kQ2aZ.js');
  check('cf: the hashed bundle may be cached for good', res.status === 200 && /immutable/.test(res.headers['cache-control']) && /max-age=31536000/.test(res.headers['cache-control']), res.headers['cache-control']);
  res = await request(port, '/assets/world/world.json');
  const etag = res.headers.etag;
  check('cf: world files are revalidated on each visit', res.status === 200 && !/immutable/.test(res.headers['cache-control'] || '') && /max-age=0|no-cache/.test(res.headers['cache-control'] || '') && !!etag, [res.headers['cache-control'], etag]);
  res = await request(port, '/assets/world/world.json', { headers: { 'If-None-Match': etag } });
  check('cf: …and cost nothing when unchanged (304)', res.status === 304 && res.body.length === 0, res.status);
  res = await request(port, '/missing.png');
  const health = await request(port, '/healthz');
  const plain = await request(port, '/ws');
  check('cf: unknown paths → 404, /healthz → ok, /ws without upgrade → 426', res.status === 404 && health.status === 200 && health.body.toString() === 'ok' && plain.status === 426, [res.status, health.status, plain.status]);
  res = await request(port, '/_headers');
  check('cf: the headers file itself is not published', res.status === 404, res.status);

  // --- pings: the fixed text is answered by the platform (the relay's own pong carries a clock)
  const p1 = new Client(port, 'edge');
  await p1.hello('Ping');
  p1.send('{"t":"ping"}');
  const auto = await p1.wait((m) => m.t === 'pong');
  check('cf: the client ping is answered without waking the room', JSON.stringify(auto) === '{"t":"pong"}', auto);
  await p1.close();

  // --- no keep-alive: once a visitor stands still the client goes quiet, so that the room can sleep
  const quiet = new Presence({ room: 'calme', name: 'Calme', url: `ws://127.0.0.1:${port}/ws` });
  const watcher = new Client(port, 'calme');
  await watcher.hello('Témoin');
  quiet.connect();
  await until(() => quiet.mode === 'online');
  const sent = [];
  const transport = quiet._tr, raw = transport.send.bind(transport);
  transport.send = (m) => { sent.push({ ...m, at: Date.now() }); return raw(m); };
  for (let i = 0; i < 12; i++) { quiet.setLocal(i * 0.3, 0, 0, 0, 1, 0); quiet.update(0.016); await sleep(60); }
  const stopped = Date.now();
  for (let i = 0; i < 70; i++) { quiet.setLocal(3.3, 0, 0, 0, 0, 0); quiet.update(0.016); await sleep(60); }
  const late = sent.filter((m) => m.t === 's' && m.at > stopped + 1500);
  check('cf: welcome asks for no keep-alive (idle: 0) and the client obeys', watcher.rows().some((r) => r[1] === 3.3) && late.length === 0 && sent.some((m) => m.t === 's'), { late: late.length, sent: sent.length });
  quiet.dispose();
  await watcher.close();

  // --- hibernation: an idle room is unloaded, its connections and what it knew survive
  const h1 = new Client(port, 'sleepy');
  await h1.hello('Un', 2);
  const h2 = new Client(port, 'sleepy');
  await h2.hello('Deux', 3);
  h1.send({ t: 's', p: [12.5, 3, -7.25, 1], a: 1, f: 4 });
  await h2.wait((m) => m.t === 'u' && m.s.some((r) => r[0] === h1.id && r[1] === 12.5));
  const quietSince = Date.now();
  for (let i = 0; i < 8; i++) { await sleep(2000); h1.send('{"t":"ping"}'); h2.send('{"t":"ping"}'); } // answered at the edge
  const info = JSON.parse((await request(port, '/api/presence?room=sleepy')).body.toString());
  check('cf: an idle room is unloaded (hibernation) while its visitors stay connected',
    info.players === 2 && info.up < Date.now() - quietSince - 4000 && h1.code === null && h2.code === null && h1.msgs.filter((m) => m.t === 'pong').length === 8, { info, idle: Date.now() - quietSince });
  const h3 = new Client(port, 'sleepy');
  const w3 = await h3.hello('Trois', 5);
  check('cf: after waking up, a newcomer still learns who is there and where',
    !!w3 && JSON.stringify(w3.peers) === JSON.stringify([{ id: h1.id, name: 'Un', color: 2, p: [12.5, 3, -7.25, 1], a: 1, f: 4 }, { id: h2.id, name: 'Deux', color: 3 }]) && new Set([h1.id, h2.id, h3.id]).size === 3, w3);
  h2.send({ t: 's', p: [1, 2, 3, 0], a: 0, f: 0 });
  const woke1 = await h1.wait((m) => m.t === 'u' && m.s.some((r) => r[0] === h2.id && r[1] === 1));
  const woke3 = await h3.wait((m) => m.t === 'u' && m.s.some((r) => r[0] === h2.id && r[1] === 1));
  check('cf: …and states flow again between old and new connections', !!woke1 && !!woke3 && !!(await h1.wait((m) => m.t === 'join' && m.id === h3.id)), [woke1, woke3]);
  await h1.close();
  const gone = await h3.wait((m) => m.t === 'leave' && m.id === h1.id);
  check('cf: …and departures are still announced', !!gone && (await headCount(port, 'sleepy')) === 2, gone);
  await Promise.all([h2.close(), h3.close()]);

  // --- ghosts: a connection that stays silent for too long is closed (here after 2 s instead of 150 s)
  const strict = await startWorker({ STALE_MS: '2000', DIST_DIR: fx.dist });
  const ghost = new Client(strict.port, 'ghosts');
  await ghost.hello('Fantôme');
  const live = new Client(strict.port, 'ghosts');
  await live.hello('Vivant');
  for (let i = 0; i < 80 && ghost.code === null; i++) { live.send({ t: 's', p: [i, 0, 0, 0], a: 1, f: 0 }); await sleep(70); }
  const left = await live.wait((m) => m.t === 'leave' && m.id === ghost.id, 500);
  check('cf: a silent connection is closed as a ghost, active ones stay', ghost.code === 1001 && !!left && live.code === null, { ghost: ghost.code, live: live.code });
  await live.close();
  await strict.stop();
}

// ---------------------------------------------------------------------------------------------------- main

const uncaught = [];
const warn = console.warn;
process.on('uncaughtException', (err) => uncaught.push(err));
process.on('unhandledRejection', (err) => uncaught.push(err));
setTimeout(() => {
  console.log('FAIL  the test run timed out');
  process.exit(1);
}, 180000).unref();
if (typeof globalThis.WebSocket !== 'function') globalThis.WebSocket = WebSocket; // Node 20: no global WebSocket yet

const fx = makeDist();
let server = null;
try {
  if (CF) {
    fs.copyFileSync(path.join(ROOT, 'public/_headers'), path.join(fx.dist, '_headers'));
    server = await startWorker({ DIST_DIR: fx.dist, MAX_PLAYERS: '4' });
    server.dist = fx.dist;
    await section('protocol', () => testProtocol(server));
    await section('presence', () => testPresence(server));
    await section('api', () => testApi(server));
    await section('cloudflare', () => testCloudflare(server, fx));
    if (process.env.NET_TEST_LOG) fs.writeFileSync(process.env.NET_TEST_LOG, server.log);
    // (the local tool also logs its own failed attempts to reach Cloudflare when offline: not the Worker's)
    const trouble = server.log.split('\n').filter((line) => /\[wrangler:error\]|\[ERROR\]|Uncaught/.test(line));
    check('worker: still running at the end, no exception logged', server.alive() && !trouble.length, { alive: server.alive(), trouble: trouble.slice(0, 6) });
  } else {
    await section('interp', async () => testInterpolation());
    server = await startServer({ DIST_DIR: fx.dist, MAX_PLAYERS: '4', SCORES_FILE: path.join(fx.tmp, 'scores.json') });
    await section('static', () => testStatic(server, fx));
    await section('protocol', () => testProtocol(server));
    await section('presence', () => testPresence(server));
    await section('api', () => testApi(server));
    const kept = (() => { try { return JSON.parse(fs.readFileSync(path.join(fx.tmp, 'scores.json'), 'utf8')); } catch { return null; } })();
    check('api: the Node server keeps the boards in its file', kept?.sky?.length === 2 && kept.sky[0].name === 'Bob' && kept.sky[0].at > 0, kept);
    check('server: still running at the end, nothing on stderr', server.alive() && !/error|exception/i.test(server.log), server.log);
  }
} catch (err) {
  check('test run', false, String(err && err.stack ? err.stack : err));
} finally {
  console.warn = warn;
  if (server) await server.stop();
  fs.rmSync(fx.tmp, { recursive: true, force: true });
}
check('no uncaught error in the test process', uncaught.length === 0, uncaught.map(String));
console.log(failures ? `\n${failures} of ${total} checks FAILED` : `\nAll ${total} checks passed`);
process.exit(failures ? 1 : 0);
