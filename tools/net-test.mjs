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
import { sign, verify, randomId } from '../server/token.js';
import { addScore, topsOf, periodKeys, runFits, cleanScore } from '../server/scores.js';
import { signWebhook } from '../server/stripe.js';
import { cleanLogo, cleanText, cleanUrl } from '../server/shop.js';
import { visit, localDay } from '../server/routes.js';
import { cleanTalk, oneSentence } from '../server/npc.js';
import { cleanGeo, packGeo, unpackGeo } from '../server/visitors.js';

// what the test servers are given: the secret that signs the notes of the runs, the administrator's key
const SCORE_SECRET = 'test-score-secret', ADMIN_KEY = 'test-admin-key';
const STRIPE_KEY = 'sk_test_magicmillfairtests', STRIPE_HOOK = 'whsec_magicmillfairtests';
// A stand-in for Stripe: it hands out payment pages and remembers what it was asked.
const stripe = { asked: [], refunds: [], portals: [], port: 0, server: null };
async function startStripe() {
  stripe.port = await freePort();
  stripe.server = http.createServer((req, res) => {
    let text = '';
    req.on('data', (d) => { text += d; });
    req.on('end', () => {
      const form = new URLSearchParams(text), ok = req.headers.authorization === `Bearer ${STRIPE_KEY}` && req.url === '/v1/checkout/sessions';
      if (req.url === '/v1/refunds' && req.headers.authorization === `Bearer ${STRIPE_KEY}`) {
        // a refund: written down; one payment is "too old" and cannot be given back
        const pay = form.get('payment_intent'), old = pay === 'pi_too_old';
        if (!old) stripe.refunds.push({ pay, key: req.headers['idempotency-key'], why: form.get('metadata[why]') });
        res.writeHead(old ? 400 : 200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(old ? { error: { message: 'This payment is too old to be refunded.' } } : { id: `re_test_${stripe.refunds.length}` }));
      }
      if (req.url === '/v1/billing_portal/sessions' && req.headers.authorization === `Bearer ${STRIPE_KEY}`) {
        stripe.portals.push({ customer: form.get('customer'), back: form.get('return_url') });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ id: `bps_test_${stripe.portals.length}`, url: `https://billing.stripe.test/p/session/${stripe.portals.length}` }));
      }
      stripe.asked.push({ url: req.url, auth: req.headers.authorization, form });
      res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(ok ? { id: `cs_test_${stripe.asked.length}`, url: `https://checkout.stripe.test/pay/cs_test_${stripe.asked.length}` } : { error: { message: 'Invalid API Key' } }));
    });
  });
  await new Promise((resolve) => stripe.server.listen(stripe.port, '127.0.0.1', resolve));
}
const shopEnv = () => ({ STRIPE_SECRET_KEY: STRIPE_KEY, STRIPE_WEBHOOK_SECRET: STRIPE_HOOK, STRIPE_API: `http://127.0.0.1:${stripe.port}` });

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
    env: { ...process.env, ALLOWED_ORIGINS: '', MAX_PLAYERS: '', DIST_DIR: '', HOST: '127.0.0.1', TICK_HZ: '20', ANTHROPIC_API_KEY: '', NPC_MODEL: '', SCORE_SECRET, ADMIN_KEY, ...shopEnv(), ...env, PORT: String(port) },
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
  config.vars = { ...config.vars, TICK_MS: String(TICK), ALLOWED_ORIGINS: env.ALLOWED_ORIGINS || '', DEBUG: '1', SCORE_SECRET, ADMIN_KEY, ...shopEnv() };
  if (env.MAX_PLAYERS) config.vars.MAX_PLAYERS = env.MAX_PLAYERS;
  if (env.STALE_MS) config.vars.STALE_MS = env.STALE_MS;
  if (env.NEAR) config.vars.NEAR = env.NEAR;
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
  a.send({ t: 's', p: [5, 1, 5, 0], a: 10, f: 0x1a42 });
  const wide = await c.wait((m) => m.t === 'u' && m.s.some((r) => r[0] === a.id && r[1] === 5));
  a.send({ t: 's', p: [6, 1, 5, 0], a: 16, f: 70000 });
  const over = await c.wait((m) => m.t === 'u' && m.s.some((r) => r[0] === a.id && r[1] === 6));
  check('ws: the look of an avatar is sixteen bits (a size, a disguise, more hats), an animation one of sixteen; beyond that, nothing', wide?.s.find((r) => r[0] === a.id)?.slice(5, 7).join() === `10,${0x1a42}` && over?.s.find((r) => r[0] === a.id)?.slice(5, 7).join() === '0,0', [wide, over]);

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
  // A score has gone on a board: the room is told which (and nothing else is believed), not more than once every three seconds
  b.send({ t: 'g', b: 'shoot' }); b.send({ t: 'g', b: 'race' }); b.send({ t: 'g', b: '<script>' });
  const scored = await a.wait((m) => m.t === 'g');
  await sleep(TICK * 3);
  check('ws: "a score of mine went on that board" is passed on to the room, once in a while', JSON.stringify(scored) === JSON.stringify({ t: 'g', id: b.id, b: 'shoot' }) && a.msgs.filter((m) => m.t === 'g').length === 1 && c.msgs.filter((m) => m.t === 'g').length === 1 && !b.msgs.some((m) => m.t === 'g'), a.msgs.filter((m) => m.t === 'g'));
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

// --------------------------------------------------------------------- a crowd; the administrator; nearby chat

// More visitors than each is told about in detail: to each the nearest ones, the others on the map.
async function testCrowd(start, dist) {
  const server = await start({ NEAR: '2', MAX_PLAYERS: '20', DIST_DIR: dist });
  const { port } = server;
  // five visitors: three together, two together 300 m away
  const spots = [[0, 0], [3, 0], [6, 0], [300, 0], [303, 0]], cs = [];
  for (const [i, [x, z]] of spots.entries()) {
    const c = new Client(port, 'crowd');
    c.welcome = await c.hello(`P${i}`, i);
    c.send({ t: 's', p: [x, 1, z, 0], a: 0, f: 0 });
    cs.push(c);
    await sleep(TICK);
  }
  await sleep(700); // (the circles are worked out every 400 ms)
  const told = cs.map((c) => [...new Set(c.rows().map((r) => r[0]))].sort((a, b) => a - b).join());
  const last = cs[4].welcome;
  check('crowd: each is told about the nearest ones only (two here), never more', told[0] === [cs[1].id, cs[2].id].join() && told[3] === String(cs[4].id) && told[4] === String(cs[3].id) && told[1] === [cs[0].id, cs[2].id].sort((a, b) => a - b).join(), told);
  check('crowd: a newcomer is welcomed with who is there, not where (that comes with those around)', !!last && last.near === 2 && last.peers.length === 4 && last.peers.every((p) => p.p === undefined), last);
  const map = await cs[0].wait((m) => m.t === 'm' && m.p.includes(cs[4].id), 4000);
  const at = (id) => { const i = map ? map.p.findIndex((v, k) => k % 3 === 0 && v === id) : -1; return i < 0 ? null : [map.p[i + 1], map.p[i + 2]]; };
  check('crowd: the map says roughly where everybody is', !!map && map.p.length === 15 && JSON.stringify(at(cs[3].id)) === '[300,0]' && JSON.stringify(at(cs[1].id)) === '[3,0]', map);
  // one of the three walks over to the far pair: the first is told it has gone, the pair hears of it
  cs[2].send({ t: 's', p: [301, 1, 1, 0], a: 1, f: 0 });
  const gone = await cs[0].wait((m) => m.t === 'u' && Array.isArray(m.g) && m.g.includes(cs[2].id), 3000);
  const arrived = await cs[3].wait((m) => m.t === 'u' && m.s.some((r) => r[0] === cs[2].id && r[1] === 301), 3000);
  check('crowd: who walks away is told to be gone; who they walk up to hears of them', !!gone && !!arrived, [gone, arrived]);
  // an emote is for those around
  cs[0].send({ t: 'e', e: 3 });
  const waved = await cs[1].wait((m) => m.t === 'e' && m.id === cs[0].id);
  await sleep(TICK * 3);
  check('crowd: an emote goes to those around, not across the map', !!waved && !cs[3].msgs.some((m) => m.t === 'e'), waved);
  // alone, far from everybody: told that nobody watches (the state may then be sent less often); and back
  cs[4].send({ t: 's', p: [1900, 1, 1900, 0], a: 1, f: 0 });
  const unseen = await cs[4].wait((m) => m.t === 'w' && m.n === 0, 3000);
  const from = cs[4].msgs.length;
  cs[4].send({ t: 's', p: [302, 1, 2, 0], a: 1, f: 0 });
  const seen = await cs[4].wait((m) => m.t === 'w' && m.n === 1 && cs[4].msgs.indexOf(m) >= from, 3000);
  check('crowd: a visitor nobody is near is told so, and told again when someone is', !!unseen && !!seen, [unseen, seen]);
  // the crowd thins out: everybody is told about everybody again
  await Promise.all([cs[1].close(), cs[2].close()]);
  const mark = cs[0].msgs.length;
  cs[3].send({ t: 's', p: [304, 1, 0, 0.5], a: 0, f: 0 });
  const again = await cs[0].wait((m) => m.t === 'u' && cs[0].msgs.indexOf(m) >= mark && m.s.some((r) => r[0] === cs[4].id) , 3000);
  const far = await cs[0].wait((m) => m.t === 'u' && cs[0].msgs.indexOf(m) >= mark && m.s.some((r) => r[0] === cs[3].id && r[1] === 304), 3000);
  check('crowd: when it thins out, everybody hears of everybody again', !!again && !!far, [again, far]);
  await Promise.all(cs.map((c) => c.close()));
  await server.stop();
}

// The administrator: who is there, putting someone out, keeping them out; a line said to those nearby only.
async function testModeration(start, dist) {
  const file = path.join(os.tmpdir(), `mmf-moderation-${process.pid}.json`); // (a store of its own, under Node)
  fs.rmSync(file, { force: true });
  const server = await start({ MAX_PLAYERS: '20', DIST_DIR: dist, SCORES_FILE: file });
  const { port } = server;
  const json = (res) => { try { return JSON.parse(res.body.toString()); } catch { return null; } };
  // (under Node each visitor comes from an address of their own — what a proxy in front of the server says)
  const from = (n, dev) => ({ headers: { 'x-forwarded-for': `10.9.8.${n}`, 'user-agent': `TestBrowser/${n}` }, ...(dev && { dev }) });
  const DEV = 'device-of-eve-0123456789';
  const adm = new Client(port, 'mod', from(1)), eve = new Client(port, 'mod', from(2, DEV)), bob = new Client(port, 'mod', from(3));
  await adm.hello('Admin', 1);
  await eve.hello('Eve', 2, DEV);
  await bob.hello('Bob', 3);
  adm.send({ t: 's', p: [0, 1, 0, 0], a: 0, f: 0 }); bob.send({ t: 's', p: [5, 1, 0, 0], a: 0, f: 0 }); eve.send({ t: 's', p: [100, 1, 0, 0], a: 0, f: 0 });
  // not the administrator: asking who is there or putting someone out does nothing; a wrong key is told so
  eve.send({ t: 'who' }); eve.send({ t: 'kick', id: bob.id }); eve.send({ t: 'admin', key: 'a guess' });
  const no = await eve.wait((m) => m.t === 'admin');
  await sleep(TICK * 4);
  check('admin: without the key, nothing — who, kick and a wrong key', !!no && no.ok === false && !eve.msgs.some((m) => m.t === 'who') && bob.code === null, [no, bob.code]);
  adm.send({ t: 'admin', key: ADMIN_KEY });
  const yes = await adm.wait((m) => m.t === 'admin');
  adm.send({ t: 'who' });
  const who = await adm.wait((m) => m.t === 'who');
  const e = who?.list.find((p) => p.id === eve.id);
  check('admin: with the key, who is there — name, address, browser, device, since when', !!yes && yes.ok === true && who?.list.length === 3 && e?.name === 'Eve' && (CF || e.ip === '10.9.8.2') && e.ip.length > 0 && e.ua === 'TestBrowser/2' && e.dev === DEV && Number.isFinite(e.since), who);
  // a line for those nearby (20 m), a line for everyone
  adm.send({ t: 'c', m: 'psst', n: 1 }); adm.send({ t: 'c', m: 'hello all' });
  const near = await bob.wait((m) => m.t === 'c' && m.m === 'psst'), all = await eve.wait((m) => m.t === 'c' && m.m === 'hello all');
  check('chat: a line said to those nearby stops at twenty metres; a line to everyone does not', near?.n === 1 && !!all && all.n === undefined && !eve.msgs.some((m) => m.t === 'c' && m.m === 'psst'), [near, all]);
  // put out
  adm.send({ t: 'kick', id: bob.id });
  const out = await bob.wait((m) => m.t === 'kicked');
  const code = await Promise.race([bob.closed, sleep(4000)]);
  const left = await eve.wait((m) => m.t === 'leave' && m.id === bob.id);
  check('admin: kick — told why, hung up on (4001), the others see them leave', out?.ban === false && code === 4001 && !!left, [out, code]);
  // kept out: neither the address nor the device gets back in, until the administrator lifts it
  adm.send({ t: 'ban', id: eve.id, h: 1 });
  const banned = await eve.wait((m) => m.t === 'kicked');
  const eveCode = await Promise.race([eve.closed, sleep(4000)]);
  await sleep(400); // (the list is kept by the notebook)
  const sameAddress = new Client(port, 'mod', from(2));
  const k1 = await sameAddress.wait((m) => m.t === 'kicked', 4000);
  const admin = { authorization: `Bearer ${ADMIN_KEY}` };
  const noList = await request(port, '/api/bans');
  const list = json(await request(port, '/api/bans', { headers: admin }))?.bans || [];
  const ipBan = list.find((b) => b.kind === 'ip'), devBan = list.find((b) => b.kind === 'dev');
  check('admin: ban — put out (4003), the same address is turned away; the list is the administrator\'s', banned?.ban === true && eveCode === 4003 && k1?.ban === true && noList.status === 403 && ipBan?.key === e.ip && devBan?.key === DEV && ipBan.name === 'Eve' && ipBan.until > Date.now(), [banned, eveCode, k1, noList.status, list]);
  const lifted = json(await request(port, `/api/bans?ip=${encodeURIComponent(ipBan?.key || '')}`, { method: 'DELETE', headers: admin }));
  const sameDevice = new Client(port, 'mod', from(4, DEV)); // another address, the device that was banned
  const k2 = await sameDevice.wait((m) => m.t === 'kicked', 4000);
  const other = new Client(port, 'mod', from(5, 'device-of-fay-0123456789'));
  const wf = await other.hello('Fay', 5, 'device-of-fay-0123456789');
  await request(port, `/api/bans?dev=${DEV}`, { method: 'DELETE', headers: admin });
  const back = new Client(port, 'mod', from(2, DEV));
  const wb = await back.hello('Eve', 2, DEV);
  check('admin: the device stays out when the address is let in again; others come in; a lifted ban lets them back', lifted?.removed === 1 && k2?.ban === true && !!wf && !!wb, [lifted, k2, !!wf, !!wb]);
  // naming another administrator: a key of their own, good on the relay and on the API; never kept as it is
  adm.send({ t: 'promote', id: other.id });
  const made = await other.wait((m) => m.t === 'promoted'), ack = await adm.wait((m) => m.t === 'promoted' && m.id === other.id);
  const fay = { authorization: `Bearer ${made?.key}` };
  const fayAdmin = json(await request(port, '/api/admin', { headers: fay })), ownerAdmin = json(await request(port, '/api/admin', { headers: admin }));
  other.send({ t: 'who' });
  const fayWho = await other.wait((m) => m.t === 'who');
  const named = json(await request(port, '/api/admins', { headers: fay })), noNames = await request(port, '/api/admins');
  check('admins: one names another — a key of their own, good on the relay and on the API, and listed without it',
    typeof made?.key === 'string' && made.key.startsWith('adm_') && made.by === 'Admin' && !!ack && fayAdmin?.ok === true && fayAdmin.owner === false && ownerAdmin?.owner === true
    && fayWho?.list.find((p) => p.id === other.id)?.admin === 'admin' && fayWho.list.find((p) => p.id === adm.id)?.admin === 'owner' && fayWho.list.find((p) => p.id === back.id)?.admin === ''
    && noNames.status === 403 && named?.admins.length === 1 && named.admins[0].name === 'Fay' && named.admins[0].by === 'Admin' && !JSON.stringify(named).includes(made.key.slice(4)),
    [made && { ...made, key: `${String(made.key).slice(0, 8)}…` }, fayAdmin, ownerAdmin, named]);
  // a gift: the administrator tells a visitor's game that the shop has something for them (the shop gives, not this message)
  adm.send({ t: 'gift', id: back.id });
  const told = await back.wait((m) => m.t === 'gift');
  back.send({ t: 'gift', id: adm.id });
  const notTold = await adm.wait((m) => m.t === 'gift', 400);
  check('admin: "something was given to you" reaches that visitor only, and only an administrator can say it', told?.by === 'Admin' && !notTold, [told, notTold]);
  // what a named administrator may do: speak on the important channel, name others — not put the owner out, not take a title away
  other.send({ t: 'kick', id: adm.id });
  other.send({ t: 'c', m: 'the fair closes at ten', i: 1 });
  back.send({ t: 'c', m: 'I am important too', i: 1 });
  const imp = await back.wait((m) => m.t === 'c' && m.m === 'the fair closes at ten'), plain = await other.wait((m) => m.t === 'c' && m.m === 'I am important too');
  const noRemove = await request(port, `/api/admins?id=${named?.admins[0].id}`, { method: 'DELETE', headers: fay });
  await sleep(TICK * 4);
  check('admins: the important channel is theirs alone; they cannot put the owner out, nor take a title away', imp?.i === 1 && !!plain && plain.i === undefined && adm.code === null && noRemove.status === 403, [imp, plain, adm.code, noRemove.status]);
  // the key is good on a new connection too; the owner takes the title away: it opens nothing any more
  const again = new Client(port, 'mod', from(7));
  await again.hello('Fay again', 7);
  again.send({ t: 'admin', key: made?.key });
  const again1 = await again.wait((m) => m.t === 'admin');
  const removed = json(await request(port, `/api/admins?id=${named?.admins[0].id}`, { method: 'DELETE', headers: admin }));
  adm.send({ t: 'demote', key: named?.admins[0].id });
  const lost = await other.wait((m) => m.t === 'admin' && m.ok === false && m.out === true), lost2 = await again.wait((m) => m.t === 'admin' && m.ok === false);
  const dead = await request(port, '/api/admin', { headers: fay });
  other.send({ t: 'who' });
  await sleep(TICK * 4);
  check('admins: the owner takes the title away — the key opens nothing any more, the relay forgets it at once',
    again1?.ok === true && again1.owner === undefined && removed?.removed === 1 && removed.admins.length === 0 && !!lost && !!lost2 && dead.status === 403 && other.msgs.filter((m) => m.t === 'who').length === 1,
    [again1, removed, !!lost, !!lost2, dead.status]);
  await again.close();
  // the big red button: one explosion for the whole room; then it says how long to wait — to newcomers too
  back.send({ t: 'n' });
  const boomA = await adm.wait((m) => m.t === 'n'), boomB = await back.wait((m) => m.t === 'n');
  other.send({ t: 'n' });
  const tooSoon = await other.wait((m) => m.t === 'n' && m.id === undefined);
  await sleep(TICK * 4);
  const late = new Client(port, 'mod', from(8));
  const lateWelcome = await late.hello('Late', 8);
  check('the big red button: it goes off for the whole room, once; then it says how long to wait, to newcomers too',
    boomA?.id === back.id && boomB?.id === back.id && boomA.wait === 900000 && tooSoon?.wait > 880000 && tooSoon.wait <= 900000 && adm.msgs.filter((m) => m.t === 'n').length === 1
    && Array.isArray(lateWelcome?.blast) && lateWelcome.blast[0] > 880000 && lateWelcome.blast[0] <= 900000 && lateWelcome.blast[1] >= 0 && lateWelcome.blast[1] < 20000,
    [boomA, boomB, tooSoon, lateWelcome?.blast]);
  await late.close();
  // guessing the key: a handful of tries, then the door
  const guesser = new Client(port, 'mod', from(6));
  await guesser.hello('Guesser', 6);
  for (let i = 0; i < 7; i++) guesser.send({ t: 'admin', key: `guess ${i}` });
  const shut = await Promise.race([guesser.closed, sleep(4000)]);
  check('admin: after a few wrong keys the connection is closed', shut !== undefined && guesser.msgs.filter((m) => m.t === 'admin').length <= 5, [shut, guesser.msgs.filter((m) => m.t === 'admin').length]);
  await Promise.all([adm, other, back, sameAddress, sameDevice].map((c) => c.close()));
  await server.stop();
  fs.rmSync(file, { force: true });
}

// Where the visitors come from: counted by day and by country, the last visits kept, for the administrators.
// (Under Node the server is told, by a proxy's headers, where each request comes from; the local Workers
// runtime gives every request the same made-up place.)
async function testVisitors(start, dist) {
  const file = path.join(os.tmpdir(), `mmf-visitors-${process.pid}.json`);
  fs.rmSync(file, { force: true });
  const server = await start({ DIST_DIR: dist, GEO_HEADERS: '1', SCORES_FILE: file });
  const { port } = server;
  const json = (res) => { try { return JSON.parse(res.body.toString()); } catch { return null; } };
  const post = (target, body, headers = {}) => request(port, target, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const admin = { authorization: `Bearer ${ADMIN_KEY}` };
  const a = randomId(16), b = randomId(16);
  await post('/api/visit', { device: a, tz: 0, name: 'Ada' }, { 'cf-ipcountry': 'FR', 'cf-ipcity': 'Lyon', 'cf-region': 'Auvergne' });
  await post('/api/visit', { device: a, tz: 0, name: 'Ada' }, { 'cf-ipcountry': 'FR', 'cf-ipcity': 'Lyon', 'cf-region': 'Auvergne' });
  await post('/api/visit', { device: b, tz: 0, name: '<b>Bob</b>' }, { 'cf-ipcountry': 'br', 'cf-ipcity': 'São Paulo' }); // (a header carries UTF-8 one byte per character)
  const none = await request(port, '/api/visitors');
  const rep = json(await request(port, '/api/visitors', { headers: admin }));
  const day = rep?.days?.[0], last = rep?.recent?.[0], first = rep?.recent?.[1];
  check('visitors: counted by day (people, page loads), the last visits kept — for the administrators only',
    none.status === 403 && rep?.today === new Date().toISOString().slice(0, 10) && day?.day === rep.today && day.u === 2 && day.n === 3 && rep.recent.length === 2
    && last.name === 'bBob/b' && last.dev === b.slice(0, 8) && first.name === 'Ada' && first.n === 2 && Object.values(day.by).reduce((t, n) => t + n, 0) === 2,
    [none.status, rep]);
  if (!CF) {
    check('visitors: the country and the town of each, as the proxy in front of the server gives them',
      day.by.FR === 1 && day.by.BR === 1 && rep.countries.length === 2 && last.cc === 'BR' && last.city === 'São Paulo' && first.cc === 'FR' && first.city === 'Lyon' && first.region === 'Auvergne',
      [day, rep.countries, last, first]);
    const kept = (() => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } })();
    check('visitors: kept with the rest — the visit of a device remembers where it came from', kept?.[`visit:${a}`]?.cc === 'FR' && kept[`visit:${a}`].city === 'Lyon' && kept[`visit:${b}`]?.cc === 'BR' && !!kept['visitors:days'] && kept['visitors:recent'].length === 2, kept && Object.keys(kept));
  }
  await server.stop();
  fs.rmSync(file, { force: true });
}

// ------------------------------------------------------------------------------- the API: scores, characters

async function testApi({ port }) {
  const json = (res) => { try { return JSON.parse(res.body.toString()); } catch { return null; } };
  const post = (target, body, headers = {}) => request(port, target, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  // the note of a run that started `ago` ms ago, as the server would have signed it
  const note = (board, ago) => sign(SCORE_SECRET, { b: board, t: Date.now() - ago, n: randomId(9) });
  let res = await request(port, '/api/status');
  check('api: /api/status says what is switched on, and no secret', res.status === 200 && json(res)?.ok === true && json(res).npc === false && json(res).admin === true && json(res).shop === 'test' && !/test-|sk_|whsec_/.test(res.body.toString()), res.body.toString().slice(0, 160));
  res = await request(port, '/api/scores');
  const empty = json(res);
  check('api: GET /api/scores → the four lists of the climb, empty at first', res.status === 200 && empty?.board === 'sky' && ['day', 'week', 'month', 'all'].every((p) => Array.isArray(empty.tops[p]) && !empty.tops[p].length) && Array.isArray(empty.top) && /json/.test(res.headers['content-type']), [res.status, res.body.toString().slice(0, 160)]);
  // a page of another site may not post (browsers say where a POST comes from); not counted by the limiter
  res = await post('/api/scores', { board: 'sky', name: 'Mallory', score: 150000, run: await note('sky', 200000) }, { origin: 'https://elsewhere.example' });
  check('api: a POST from another site is refused', res.status === 403, res.status);
  // the start of a run: a signed note
  res = await post('/api/run', { board: 'sky' });
  const fresh = json(res)?.run, mine = await verify(SCORE_SECRET, fresh);
  const noBoard = await post('/api/run', { board: 'nope' }), tooBig = await post('/api/run', `{"board":"sky","pad":"${'x'.repeat(6000)}"}`);
  check('api: POST /api/run hands out a signed note of the start; unknown boards and oversized bodies are refused', res.status === 200 && mine?.b === 'sky' && Math.abs(mine.t - Date.now()) < 5000 && noBoard.status === 400 && tooBig.status === 400, [res.status, mine, noBoard.status, tooBig.status]);
  // eight posts a minute per address. A score needs the note of its run, old enough for the time it claims.
  const refused = [];
  refused.push((await post('/api/scores', { board: 'sky', name: 'Nobody', score: 240000 })).status); // 1: no note
  refused.push((await post('/api/scores', { board: 'sky', name: 'Hasty', score: 240000, run: fresh })).status); // 2: a 240 s climb, seconds after its start
  check('api: no score without the note of its run, nor one that claims more time than has passed', refused.join() === '400,400', refused);
  const adaNote = await note('sky', 250000);
  res = await post('/api/scores', { board: 'sky', name: '  Ada   <b>Lovelace</b> the first ', score: 240000.4, run: adaNote }); // 3
  const first = json(res);
  check('api: a time is recorded in the four lists, the name cleaned', res.status === 200 && first?.rank === 1 && first.best === true && ['day', 'week', 'month', 'all'].every((p) => first.tops[p][0]?.score === 240000 && first.tops[p][0].name === 'Ada bLovelace/b' && first.tops[p][0].at === undefined) && first.top[0].ms === 240000, res.body.toString().slice(0, 240));
  res = await post('/api/scores', { board: 'sky', name: 'Twice', score: 240000, run: adaNote }); // 4: the same note again
  check('api: the note of a run counts once', res.status === 400, res.status);
  res = await post('/api/scores', { board: 'sky', name: 'Bob', ms: 200000, run: await note('sky', 205000) }); // 5 (`ms`: what the first version of the game sends)
  const second = json(res);
  res = await post('/api/scores', { board: 'sky', name: 'ada blovelace/B', score: 300000, run: await note('sky', 300000) }); // 6
  const third = json(res);
  check('api: best first; a slower time changes nothing, whatever the case of the name', second?.rank === 1 && second.tops.all.map((e) => e.name).join() === 'Bob,Ada bLovelace/b' && third?.rank === 2 && third.best === false && third.tops.all[1].score === 240000, [second, third]);
  // a game played for points: the best is the highest, and the game cannot be over before it has lasted
  const soon = await post('/api/scores', { board: 'shoot', name: 'Quick', score: 500, run: await note('shoot', 5000) }); // 7
  res = await post('/api/scores', { board: 'shoot', name: 'Dana', score: 120, run: await note('shoot', 50000) }); // 8
  check('api: a board of points — not before the game has lasted, then recorded', soon.status === 400 && res.status === 200 && json(res).tops.day[0].score === 120 && json(res).rank === 1, [soon.status, res.status, res.body.toString().slice(0, 120)]);
  res = await post('/api/scores', { board: 'sky', name: 'Carol', score: 210000, run: await note('sky', 215000) });
  const limited = res.status;
  res = await request(port, '/api/scores?board=sky');
  check('api: a ninth POST within the minute is turned away; the board is unchanged', limited === 429 && json(res)?.tops.all.length === 2 && json(res).tops.all[0].name === 'Bob', [limited, res.body.toString().slice(0, 160)]);
  res = await request(port, '/api/scores?board=all');
  const every = json(res)?.boards || {};
  check('api: every board in one request (the four booths, the race, the climb, the flying theatre)', res.status === 200 && ['sky', 'race', 'wing', 'shoot', 'mole', 'milk', 'bell'].every((id) => every[id] && ['day', 'week', 'month', 'all'].every((p) => Array.isArray(every[id].tops[p]))) && every.sky.tops.all[0].name === 'Bob' && every.shoot.tops.all[0].score === 120 && !every.race.tops.all.length, [res.status, res.body.toString().slice(0, 200)]);
  res = await request(port, '/api/scores?board=nope');
  const put = await request(port, '/api/scores', { method: 'PUT' });
  check('api: unknown board → 404, other methods → 405', res.status === 404 && put.status === 405, [res.status, put.status]);
  // the administrator: recognised by the key, may take a line off a board
  const anon = await request(port, '/api/admin'), wrong = await request(port, '/api/admin', { headers: { authorization: 'Bearer nope' } });
  const admin = await request(port, '/api/admin', { headers: { authorization: `Bearer ${ADMIN_KEY}` } });
  const noDel = await request(port, '/api/scores?board=sky&name=Bob', { method: 'DELETE' });
  const del = await request(port, '/api/scores?board=sky&name=bob', { method: 'DELETE', headers: { authorization: `Bearer ${ADMIN_KEY}` } });
  res = await request(port, '/api/scores?board=sky');
  check('api: only the administrator\'s key opens /api/admin and takes a line off a board', anon.status === 403 && wrong.status === 403 && admin.status === 200 && noDel.status === 403 && del.status === 200 && json(del).removed > 0 && json(res).tops.all.map((e) => e.name).join() === 'Ada bLovelace/b', [anon.status, wrong.status, admin.status, noDel.status, del.status, res.body.toString().slice(0, 120)]);
  // visits: the days in a row of a device
  const device = randomId(16);
  const v1 = json(await post('/api/visit', { device, tz: -60 })), v2 = json(await post('/api/visit', { device, tz: -60 }));
  const badVisit = await post('/api/visit', { device: 'x' });
  check('api: a first visit is day 1, and stays day 1 the same day; a device must look like one', v1?.days === 1 && v2?.days === 1 && v2.best === 1 && Number.isInteger(v1.today) && badVisit.status === 400, [v1, v2, badVisit.status]);
  // the characters: no key in this test, so the game is told to use its own lines
  res = await post('/api/npc', { npc: 'alligator', messages: [{ role: 'user', content: 'Hello Billy, where is the waterfall?' }] });
  const get = await request(port, '/api/npc');
  check('api: /api/npc without a key → 501 (the game uses its own lines), GET → 405', res.status === 501 && json(res)?.reply === null && get.status === 405, [res.status, get.status]);
}

// What the API is made of, checked without a server: the lists by period, the notes, the visits, the guard
// rails of the characters.
// ------------------------------------------------------------------- the shop: payments, sponsors, pictures

// the smallest pictures that are what they say: a PNG and a JPEG of 2 × 2
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DwnwEImBigAAwAFiQCAnlmBxsAAAAASUVORK5CYII=';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'), Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x02, 0x00, 0x02, 0x01, 0x01, 0x11, 0x00]), Buffer.alloc(24), Buffer.from([0xff, 0xd9])]).toString('base64');

async function testShop({ port }) {
  const json = (res) => { try { return JSON.parse(res.body.toString()); } catch { return null; } };
  const post = (target, body, headers = {}) => request(port, target, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const admin = { authorization: `Bearer ${ADMIN_KEY}` };
  const hook = async (event, secret = STRIPE_HOOK, at = Date.now()) => { const raw = JSON.stringify(event); return post('/api/stripe/webhook', raw, { 'stripe-signature': await signWebhook(secret, raw, at) }); };
  const paid = (item, device, sub) => ({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_x', payment_status: 'paid', subscription: sub || null, metadata: { item, device } } } });
  const ann = randomId(16), bob = randomId(16);
  // what is sold, and that it is a test shop
  let res = await request(port, `/api/shop?device=${ann}`);
  const shop = json(res), status = json(await request(port, '/api/status'));
  check('shop: open in test mode; the prices come from the server; nothing owned, nothing sponsored yet', res.status === 200 && shop?.mode === 'test' && status?.shop === 'test' && shop.prices.items['hat:crown'] === 999 && shop.prices.items.jetpack === 3000 && shop.prices.items.jetlite === 500 && shop.prices.items['paint:gold'] === 1900 && Object.values(shop.prices.items).every((c) => c >= 500 && c <= 3000) && shop.prices.village.join() === '1900,4900,9900,19900,49900,99900,199900,399900,799900,999900' && !shop.owned.length && !Object.keys(shop.slots).length && !JSON.stringify([shop, status]).includes(STRIPE_KEY), [res.status, res.body.toString().slice(0, 200)]);
  // a payment page: asked of Stripe with the server's price, whatever the browser says
  stripe.asked.length = 0;
  res = await post('/api/checkout', { item: 'hat:crown', device: ann, amount: 1, price: 1 });
  const asked = stripe.asked[0]?.form;
  check('shop: a payment page is asked of Stripe at the price of the catalogue, for this visitor', res.status === 200 && /^https:\/\/checkout\.stripe\.test\//.test(json(res)?.url || '') && asked?.get('mode') === 'payment' && asked.get('line_items[0][price_data][unit_amount]') === '999' && asked.get('line_items[0][price_data][currency]') === 'usd' && asked.get('metadata[item]') === 'hat:crown' && asked.get('metadata[device]') === ann && asked.get('client_reference_id') === ann && asked.get('success_url').endsWith('/?paid=hat%3Acrown'), [res.status, res.body.toString().slice(0, 160), asked?.toString().slice(0, 300)]);
  res = await post('/api/checkout', { item: 'village:eagle-rest', device: bob });
  const sub = stripe.asked[1]?.form;
  const nothing = await post('/api/checkout', { item: 'hat:invisible', device: ann }), nobody = await post('/api/checkout', { item: 'jetpack', device: 'x' });
  check('shop: a village is a subscription by the month, at the price of its height; what is not sold is refused', res.status === 200 && sub?.get('mode') === 'subscription' && sub.get('line_items[0][price_data][recurring][interval]') === 'month' && Number(sub.get('line_items[0][price_data][unit_amount]')) >= 1900 && sub.get('subscription_data[metadata][item]') === 'village:eagle-rest' && nothing.status === 400 && nobody.status === 400, [res.status, sub?.toString().slice(0, 200), nothing.status, nobody.status]);
  // only Stripe's word counts
  const forged = await hook(paid('jetpack', ann), 'whsec_somebody_else'), stale = await hook(paid('jetpack', ann), STRIPE_HOOK, Date.now() - 3600_000);
  const unsigned = await post('/api/stripe/webhook', JSON.stringify(paid('jetpack', ann)));
  const still = json(await request(port, `/api/shop?device=${ann}`));
  check('shop: a webhook that Stripe did not sign, or an old one, gives nothing', forged.status === 400 && stale.status === 400 && unsigned.status === 400 && !still.owned.length, [forged.status, stale.status, unsigned.status, still.owned]);
  const ok1 = await hook(paid('hat:crown', ann)), ok2 = await hook(paid('hat:crown', ann)), ok3 = await hook(paid('jetpack', ann));
  const mine = json(await request(port, `/api/shop?device=${ann}`)), theirs = json(await request(port, `/api/shop?device=${bob}`));
  const again = await post('/api/checkout', { item: 'hat:crown', device: ann });
  check('shop: what Stripe says was paid is theirs — once, and theirs only; it is not sold to them twice', ok1.status === 200 && ok2.status === 200 && ok3.status === 200 && mine.owned.join() === 'hat:crown,jetpack' && !theirs.owned.length && again.status === 409, [mine.owned, theirs.owned, again.status]);
  // the Game Pass: by the month. Whoever holds it is lent every hat and the light jetpack; Stripe's word ends it.
  {
    const cat = randomId(16), dan = randomId(16), eli = randomId(16), far = { 'x-forwarded-for': '10.6.6.1' }; // (an address of their own: these do not count against what the other checks may ask)
    const fresh = json(await request(port, `/api/shop?device=${cat}`)), again2 = json(await request(port, `/api/shop?device=${cat}`));
    stripe.asked.length = 0;
    // (what an address may ask is counted: on the Cloudflare target, where every request of the tests comes from
    // the same one, the payment page of the pass and the account are left to the Node run)
    const page = CF ? null : await post('/api/checkout', { item: 'pass', device: cat }, far), form = stripe.asked[0]?.form;
    const passPaid = (device, sub, customer) => ({ type: 'checkout.session.completed', data: { object: { id: `cs_${sub}`, payment_status: 'paid', subscription: sub, customer, metadata: { item: 'pass', device } } } });
    await hook(passPaid(cat, 'sub_pass_1', 'cus_cat'));
    const held = json(await request(port, `/api/shop?device=${cat}`)), none = json(await request(port, `/api/shop?device=${dan}`));
    const twice = CF ? null : await post('/api/checkout', { item: 'pass', device: cat }, far);
    stripe.portals.length = 0;
    const portal = await post('/api/portal', { device: cat }, far), noPortal = await post('/api/portal', { device: dan }, far);
    check('pass: everybody has the light jetpack for a day after their first visit (counted from the first, not the last)',
      fresh.pass === null && fresh.trial?.item === 'jetlite' && Math.abs(fresh.trial.until - fresh.now - 24 * 3600_000) < 3000 && again2.trial.until === fresh.trial.until && !fresh.owned.includes('jetlite'), [fresh.trial, again2.trial, fresh.now]);
    check('pass: sold by the month at the price of the catalogue; held by who paid and nobody else; not sold twice; its holder is sent to Stripe to look after it',
      fresh.prices.pass === 1900 && (CF || (page.status === 200 && form?.get('mode') === 'subscription' && form.get('line_items[0][price_data][unit_amount]') === '1900' && form.get('line_items[0][price_data][recurring][interval]') === 'month' && form.get('metadata[item]') === 'pass' && form.get('subscription_data[metadata][device]') === cat))
      && held.pass?.managed === true && !held.pass.gift && held.pass.since > 0 && none.pass === null && (CF || twice.status === 409)
      && portal.status === 200 && /^https:\/\/billing\.stripe\.test\//.test(json(portal)?.url || '') && stripe.portals[0]?.customer === 'cus_cat' && noPortal.status === 404,
      [page?.status, form?.toString().slice(0, 200), held.pass, none.pass, twice?.status, portal.status, stripe.portals, noPortal.status]);
    // an account takes the pass with it to another browser; the end of the subscription takes it back from both
    const acct = (body) => post('/api/account', body, far);
    const who = `Pass${randomId(4).replace(/[^A-Za-z0-9]/g, 'x')}`;
    const made = CF ? null : await acct({ action: 'create', device: cat, name: who, password: 'a good password' });
    const login = CF ? null : await acct({ action: 'login', device: eli, name: who, password: 'a good password' });
    const onOther = json(await request(port, `/api/shop?device=${eli}`));
    const ended = await hook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_pass_1' } } });
    const afterCat = json(await request(port, `/api/shop?device=${cat}`)), afterEli = json(await request(port, `/api/shop?device=${eli}`));
    check('pass: an account takes it to its other browsers; when the subscription ends it is handed back everywhere, and its holder is told',
      (CF || (made.status === 200 && login.status === 200 && onOther.pass?.managed === true)) && ended.status === 200 && afterCat.pass === null && afterEli.pass === null && /has ended/.test((afterCat.notes || []).join(' ')),
      [made?.status, login?.status, onOther.pass, ended.status, afterCat.pass, afterEli.pass, afterCat.notes]);
    // gifts: the administrator's alone — a thing for good, the pass for so many days
    const noGift = await post('/api/gift', { device: dan, item: 'jetpack' });
    const g1 = await post('/api/gift', { device: dan, item: 'jetpack' }, admin), g1b = await post('/api/gift', { device: dan, item: 'jetpack' }, admin);
    const g2 = await post('/api/gift', { device: dan, pass: 30 }, admin), g3 = await post('/api/gift', { device: dan, pass: 10 }, admin);
    const bad = [await post('/api/gift', { device: dan, item: 'hat:invisible' }, admin), await post('/api/gift', { device: dan, pass: 0 }, admin), await post('/api/gift', { device: 'x', item: 'jetpack' }, admin), await post('/api/gift', { device: dan, item: 'village:eagle-rest' }, admin)];
    const got = json(await request(port, `/api/shop?device=${dan}`)), giftPortal = await post('/api/portal', { device: dan }, far);
    stripe.asked.length = 0;
    const paysAnyway = CF ? null : await post('/api/checkout', { item: 'pass', device: dan }, far);
    check('gifts: only the administrator gives; a thing is theirs for good (once), the pass for the days given (added up); they are told; a gift is not a subscription',
      noGift.status === 403 && g1.status === 200 && json(g1)?.fresh === true && json(g1b)?.fresh === false && g2.status === 200 && g3.status === 200 && bad.every((r) => r.status === 400)
      && got.owned.includes('jetpack') && got.pass?.gift === true && !got.pass.managed && Math.abs(got.pass.until - got.now - 40 * 86_400_000) < 5000
      && (got.notes || []).length === 3 && got.notes.every((n) => /gift from the fair/.test(n)) && giftPortal.status === 404 && (CF || paysAnyway.status === 200),
      [noGift.status, g1.status, g2.status, g3.status, bad.map((r) => r.status), got.owned, got.pass, got.notes, giftPortal.status, paysAnyway?.status]);
  }
  // a place to sponsor: paid, then filled in by its holder, then approved by the administrator
  await hook(paid('tarp:shoot', bob, 'sub_test_1'));
  const taken = await post('/api/checkout', { item: 'tarp:shoot', device: ann });
  const seen = json(await request(port, `/api/shop?device=${ann}`)), held = json(await request(port, `/api/shop?device=${bob}`));
  check('shop: a sponsored place is held by who paid; others only see that it is taken', taken.status === 409 && seen.slots['tarp:shoot']?.state === 'taken' && !seen.slots['tarp:shoot'].mine && held.slots['tarp:shoot']?.mine === true, [taken.status, seen.slots, held.slots]);
  const intruder = await post('/api/sponsor', { slot: 'tarp:shoot', device: ann, title: 'Mine now' });
  const html = await post('/api/sponsor', { slot: 'tarp:shoot', device: bob, title: '<script>alert(1)</script> Acme   Robotics & Sons of the North Pole', subtitle: 'Friendly\nmachines <b>since</b> 1999', url: 'javascript:alert(1)', logo: PNG });
  const svg = await post('/api/sponsor', { slot: 'tarp:shoot', device: bob, title: 'Acme', logo: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>'.padEnd(64)).toString('base64') });
  const page = await post('/api/sponsor', { slot: 'tarp:shoot', device: bob, title: 'Acme', logo: Buffer.from('<!doctype html><html><script>alert(1)</script></html>'.padEnd(64)).toString('base64') });
  const liar = await post('/api/sponsor', { slot: 'tarp:shoot', device: bob, title: 'Acme', logo: Buffer.concat([Buffer.from(PNG, 'base64').subarray(0, 8), Buffer.from('<script>alert(1)</script>'.padEnd(60))]).toString('base64') });
  const fine = await post('/api/sponsor', { slot: 'tarp:shoot', device: bob, title: '<script>alert(1)</script> Acme   Robotics & Sons of the North Pole', subtitle: 'Friendly\nmachines <b>since</b> 1999', url: 'https://acme.example/robots?x=1', logo: PNG });
  const notYet = json(await request(port, `/api/shop?device=${ann}`)).slots['tarp:shoot'], noLogo = await request(port, '/api/logo?slot=tarp:shoot');
  check('shop: only the holder fills a place in; a link must be https; what is not a picture is refused', intruder.status === 403 && html.status === 400 && svg.status === 400 && page.status === 400 && liar.status === 400 && fine.status === 200 && json(fine)?.state === 'pending', [intruder.status, html.status, svg.status, page.status, liar.status, fine.status]);
  check('shop: nothing a sponsor sends is shown before it is approved', notYet.state === 'taken' && !notYet.title && noLogo.status === 404, [notYet, noLogo.status]);
  const noAdmin = await request(port, '/api/sponsors'), list = json(await request(port, '/api/sponsors', { headers: admin }));
  const draft = list?.slots?.['tarp:shoot']?.draft;
  const peek = await request(port, draft?.logo || '/nowhere'), look = await request(port, draft?.logo || '/nowhere', { headers: admin });
  check('shop: the administrator sees what awaits approval — text made harmless, the picture for their eyes only', noAdmin.status === 403 && draft && !/[<>]/.test(draft.title + draft.subtitle) && draft.title.length <= 28 && draft.subtitle === 'Friendly machines b since /b 1999' && draft.url === 'https://acme.example/robots?x=1' && peek.status === 404 && look.status === 200 && look.headers['content-type'] === 'image/png', [noAdmin.status, draft, peek.status, look.status, look.headers['content-type']]);
  const approve = await post('/api/sponsors', { slot: 'tarp:shoot', approve: true }, admin), sneaky = await post('/api/sponsors', { slot: 'tarp:shoot', approve: true });
  const live = json(await request(port, `/api/shop?device=${ann}`)).slots['tarp:shoot'];
  const logo = await request(port, live?.logo || '/nowhere');
  check('shop: once approved it is shown to everyone; the picture is served as a picture and nothing else', approve.status === 200 && sneaky.status === 403 && live.state === 'live' && live.url === 'https://acme.example/robots?x=1' && logo.status === 200 && logo.headers['content-type'] === 'image/png' && logo.headers['x-content-type-options'] === 'nosniff' && /sandbox/.test(logo.headers['content-security-policy'] || '') && logo.body.equals(Buffer.from(PNG, 'base64')), [approve.status, sneaky.status, live, logo.status, logo.headers]);
  // the administrator fills a place by hand; a subscription that ends frees its place
  const byHand = await post('/api/sponsors', { slot: 'gondola:7', set: { title: 'Seven Seas Ice Cream', subtitle: 'on the pier since ever', url: 'https://ice.example', logo: JPEG } }, admin);
  const g7 = json(await request(port, '/api/shop')).slots['gondola:7'], g7logo = await request(port, g7?.logo || '/nowhere');
  // the colour behind a panel: the administrator's choice (a plain #rrggbb), kept with the place; the sponsor cannot send one
  const tinted = await post('/api/sponsors', { slot: 'gondola:7', set: { title: 'Seven Seas Ice Cream', subtitle: 'on the pier since ever', url: 'https://ice.example', bg: '#102A43' } }, admin);
  const g7b = json(await request(port, '/api/shop')).slots['gondola:7'];
  const sneakBg = await post('/api/sponsors', { slot: 'gondola:7', set: { title: 'Seven Seas Ice Cream', bg: 'red;background:url(https://evil.example/x)' } }, admin);
  const g7c = json(await request(port, '/api/shop')).slots['gondola:7'];
  check('shop: the colour behind a panel is the administrator\'s — a plain #rrggbb, kept with the place (the picture stays); anything else is dropped',
    tinted.status === 200 && g7b?.bg === '#102a43' && !!g7b.logo && g7b.title === 'Seven Seas Ice Cream' && sneakBg.status === 200 && !g7c?.bg && !!g7c?.logo, [tinted.status, g7b, sneakBg.status, g7c]);
  const ended = await hook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_test_1' } } });
  const after = json(await request(port, `/api/shop?device=${bob}`)), gone = await request(port, live?.logo || '/nowhere');
  const freed = await request(port, '/api/sponsors?slot=gondola:7', { method: 'DELETE', headers: admin });
  check('shop: the administrator can fill a place by hand and free it; a subscription that ends frees its place and its picture', byHand.status === 200 && g7?.state === 'live' && g7.title === 'Seven Seas Ice Cream' && g7logo.status === 200 && g7logo.headers['content-type'] === 'image/jpeg' && ended.status === 200 && !after.slots['tarp:shoot'] && gone.status === 404 && freed.status === 200 && !json(freed).slots['gondola:7'], [byHand.status, g7, g7logo.status, ended.status, Object.keys(after.slots), gone.status, freed.status]);
  // the panel of a game is auctioned: a dollar to start; whoever bids more takes it, and the other is refunded
  const bidPaid = (item, device, amount, pay) => ({ type: 'checkout.session.completed', data: { object: { id: `cs_${pay}`, payment_status: 'paid', amount_total: amount, payment_intent: pay, metadata: { item, device, bid: String(amount) } } } });
  stripe.asked.length = 0; stripe.refunds.length = 0;
  const low = await post('/api/checkout', { item: 'board:mole', device: ann, bid: 50 }), first = await post('/api/checkout', { item: 'board:mole', device: ann, bid: 100 });
  const firstForm = stripe.asked[0]?.form;
  await hook(bidPaid('board:mole', ann, 100, 'pi_ann_1'));
  const held1 = json(await request(port, `/api/shop?device=${bob}`)).slots['board:mole'], prices = json(await request(port, '/api/shop')).prices;
  check('auction: the panel of a game starts at one dollar, paid once; who paid holds it, and everybody sees what it went for',
    low.status === 409 && json(low).next === 100 && first.status === 200 && firstForm?.get('mode') === 'payment' && firstForm.get('line_items[0][price_data][unit_amount]') === '100' && firstForm.get('metadata[bid]') === '100'
    && held1?.state === 'taken' && held1.bid === 100 && held1.next === 200 && !held1.mine && prices.auction.start === 100 && prices.board === undefined,
    [low.status, first.status, held1, prices.auction]);
  // Ann shows something; Bob bids more: the panel is his (and empty again), Ann is refunded in full, once, and told so
  await post('/api/sponsor', { slot: 'board:mole', device: ann, title: 'Ann & Co', logo: PNG });
  await post('/api/sponsors', { slot: 'board:mole', approve: true }, admin);
  const shownBefore = await request(port, '/api/logo?slot=board:mole');
  const same = await post('/api/checkout', { item: 'board:mole', device: bob, bid: 100 }), more = await post('/api/checkout', { item: 'board:mole', device: bob, bid: 500 });
  await hook(bidPaid('board:mole', bob, 500, 'pi_bob_1'));
  await hook(bidPaid('board:mole', bob, 500, 'pi_bob_1')); // (Stripe says it twice: counted once)
  const annSees = json(await request(port, `/api/shop?device=${ann}`)), annAgain = json(await request(port, `/api/shop?device=${ann}`)), bobSees = json(await request(port, `/api/shop?device=${bob}`));
  const oldLogo = await request(port, '/api/logo?slot=board:mole');
  check('auction: a higher bid takes the panel — the one who held it is refunded in full, once, and told so; what they showed is gone',
    shownBefore.status === 200 && same.status === 409 && more.status === 200 && bobSees.slots['board:mole']?.mine === true && bobSees.slots['board:mole'].bid === 500 && bobSees.slots['board:mole'].next === 600 && bobSees.slots['board:mole'].state === 'taken'
    && !annSees.slots['board:mole'].mine && stripe.refunds.length === 1 && stripe.refunds[0].pay === 'pi_ann_1' && stripe.refunds[0].key === 'refund-pi_ann_1' && /outbid/.test(annSees.notes?.[0] || '') && /refunded in full/.test(annSees.notes[0]) && !annAgain.notes && oldLogo.status === 404,
    [same.status, more.status, bobSees.slots['board:mole'], stripe.refunds, annSees.notes, oldLogo.status]);
  // a bid that arrives too late (somebody paid more meanwhile) is refunded at once; a refund Stripe refuses is kept for the administrator
  await hook(bidPaid('board:mole', ann, 300, 'pi_ann_2'));
  const late = json(await request(port, `/api/shop?device=${ann}`));
  await hook(bidPaid('board:bell', ann, 100, 'pi_too_old'));
  await hook(bidPaid('board:bell', bob, 200, 'pi_bob_2'));
  const book = json(await request(port, '/api/sponsors', { headers: admin }));
  check('auction: a bid that arrives too late is refunded at once; every refund is written down — a refused one too, for the administrator',
    !late.slots['board:mole'].mine && late.slots['board:mole'].bid === 500 && /refunded/.test(late.notes?.[0] || '') && stripe.refunds.some((r) => r.pay === 'pi_ann_2') && book.slots['board:bell'].bid === 200
    && book.refunds.length === 3 && book.refunds[0].pay === 'pi_too_old' && book.refunds[0].ok === false && /too old/.test(book.refunds[0].error) && book.refunds.find((r) => r.pay === 'pi_ann_1')?.ok === true && book.refunds.find((r) => r.pay === 'pi_ann_1').amount === 100,
    [late.slots['board:mole'], late.notes, book.refunds]);
  // the administrator takes a sponsor off an auctioned panel: their bid goes back to them
  const off = await request(port, '/api/sponsors?slot=board:mole', { method: 'DELETE', headers: admin });
  const bobTold = json(await request(port, `/api/shop?device=${bob}`));
  check('auction: a sponsor taken off by the administrator gets the bid back; the panel is free again, from a dollar',
    off.status === 200 && !bobTold.slots['board:mole'] && stripe.refunds.some((r) => r.pay === 'pi_bob_1') && /refunded in full/.test(bobTold.notes?.[0] || ''), [off.status, bobTold.notes, stripe.refunds.map((r) => r.pay)]);
}
// Accounts: nobody needs one; whoever signs in keeps what they bought, their days in a row and their look,
// from one browser to the next.
async function testAccounts({ port }) {
  const json = (res) => { try { return JSON.parse(res.body.toString()); } catch { return null; } };
  const post = (target, body, headers = {}) => request(port, target, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const hook = async (event) => { const raw = JSON.stringify(event); return post('/api/stripe/webhook', raw, { 'stripe-signature': await signWebhook(STRIPE_HOOK, raw) }); };
  const paid = (item, device) => ({ type: 'checkout.session.completed', data: { object: { id: 'cs_test_a', payment_status: 'paid', metadata: { item, device } } } });
  const acct = (body, headers) => post('/api/account', body, headers);
  const owned = async (device) => json(await request(port, `/api/shop?device=${device}`)).owned.slice().sort().join();
  const a = randomId(16), b = randomId(16), who = `Ada ${randomId(3).replace(/[^A-Za-z0-9]/g, 'x')}`;
  const guest = json(await request(port, `/api/account?device=${a}`));
  const badName = await acct({ action: 'create', device: a, name: 'x', password: 'correct horse' }), shortPw = await acct({ action: 'create', device: a, name: who, password: 'short' });
  const made = await acct({ action: 'create', device: a, name: who, password: 'correct horse', profile: { name: '<b>Ada</b>', color: 3, hat: 'crown', paint: 'gold', trail: 'x'.repeat(40), evil: '<script>' } });
  const dup = await acct({ action: 'create', device: b, name: who.toUpperCase(), password: 'another one' });
  const me = json(await request(port, `/api/account?device=${a}`));
  check('accounts: nobody needs one; a name and a password make one (a recovery code is given once), and a name is taken only once',
    guest?.account === null && badName.status === 400 && shortPw.status === 400 && made.status === 200 && /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(json(made).recovery) && json(made).account.name === who
    && dup.status === 409 && me.account?.name === who && me.account.profile.name === 'bAda/b' && me.account.profile.hat === 'crown' && me.account.profile.trail === 'none' && me.account.profile.evil === undefined && !JSON.stringify(me).includes('correct horse'),
    [guest, badName.status, shortPw.status, made.status, dup.status, me]);
  // another browser: what it bought as a guest joins the account when it signs in; what is bought from then on is the account's
  await hook(paid('hat:cap', b));
  const wrong = await acct({ action: 'login', device: b, name: who, password: 'wrong horse' });
  const before = await owned(a);
  const login = await acct({ action: 'login', device: b, name: who.toLowerCase(), password: 'correct horse' });
  await hook(paid('trail:bubbles', a));
  const [ownA, ownB] = [await owned(a), await owned(b)];
  check('accounts: signing in from another browser brings what was bought on either side',
    wrong.status === 403 && before === '' && login.status === 200 && json(login).account.profile.hat === 'crown' && json(login).account.devices === 2
    && ownA === 'hat:cap,trail:bubbles' && ownB === 'hat:cap,trail:bubbles', [wrong.status, login.status, ownA, ownB]);
  // the days in a row are the account's; the look is kept; a sponsored place held from one browser is theirs on the other
  const v1 = json(await post('/api/visit', { device: a, tz: 0 })), v2 = json(await post('/api/visit', { device: b, tz: 0 }));
  const saved = await acct({ action: 'save', device: b, profile: { name: 'Ada', color: 7, hat: 'cap', paint: 'none', trail: 'bubbles' } }), stranger = await acct({ action: 'save', device: randomId(16), profile: { name: 'Eve', color: 1 } });
  await hook({ type: 'checkout.session.completed', data: { object: { id: 'cs_gondola', payment_status: 'paid', subscription: 'sub_acct_1', metadata: { item: 'gondola:11', device: a } } } });
  const seenFromB = json(await request(port, `/api/shop?device=${b}`)).slots['gondola:11'], fill = await post('/api/sponsor', { slot: 'gondola:11', device: b, title: 'Ada and Sons' });
  const look = json(await request(port, `/api/account?device=${a}`)).account.profile;
  check('accounts: the days in a row, the look and the places held are the same from every browser of the account',
    v1?.days === 1 && v2?.days === 1 && saved.status === 200 && stranger.status === 403 && look.color === 7 && look.hat === 'cap' && look.trail === 'bubbles' && seenFromB?.mine === true && fill.status === 200,
    [v1, v2, saved.status, stranger.status, look, seenFromB, fill.status]);
  // signing out: the browser is a guest again, with what it bought itself; a new password with the recovery code
  await acct({ action: 'logout', device: b });
  const out = json(await request(port, `/api/account?device=${b}`)), ownGuest = await owned(b);
  const badCode = await acct({ action: 'reset', device: b, name: who, code: 'AAAA-BBBB-CCCC', password: 'brand new one' });
  const reset = await acct({ action: 'reset', device: b, name: who, code: json(made).recovery.toLowerCase().replace(/-/g, ' '), password: 'brand new one' });
  const old = await acct({ action: 'login', device: a, name: who, password: 'correct horse' }), fresh = await acct({ action: 'login', device: a, name: who, password: 'brand new one' });
  check('accounts: signed out, a browser keeps only what it bought itself; the recovery code sets a new password, and the old one is dead',
    out.account === null && ownGuest === 'hat:cap' && badCode.status === 403 && reset.status === 200 && old.status === 403 && fresh.status === 200, [out, ownGuest, badCode.status, reset.status, old.status, fresh.status]);
  if (!CF) {
    // (each try from another address: it is the account that closes, not the address)
    let n = 20;
    const tries = [];
    for (let i = 0; i < 10; i++) tries.push((await acct({ action: 'login', device: b, name: who, password: `guess ${i}` }, { 'x-forwarded-for': `10.7.7.${n++}` })).status);
    const locked = await acct({ action: 'login', device: b, name: who, password: 'brand new one' }, { 'x-forwarded-for': `10.7.7.${n++}` });
    const nobody = await acct({ action: 'login', device: b, name: 'Nobody Here', password: 'correct horse' }, { 'x-forwarded-for': `10.7.7.${n++}` });
    let flood = 0;
    for (let i = 0; i < 12; i++) if ((await acct({ action: 'login', device: b, name: 'Somebody Else', password: 'x'.repeat(9) }, { 'x-forwarded-for': '10.7.8.1' })).status === 429) flood++;
    check('accounts: ten wrong passwords close an account for a while, even to the right one; a name that does not exist is answered like a wrong password; an address may only try a few a minute',
      tries.every((t) => t === 403) && nobody.status === 403 && json(nobody).error === json(wrong).error && locked.status === 429 && Number(locked.headers['retry-after']) > 800 && flood === 2, [tries, locked.status, locked.headers['retry-after'], flood]);
  }
}

// Points that take time to make (the flying theatre: a pair of columns every 0.8 s at the very best): a score
// cannot arrive sooner than its points could have been made.
function testScoreLogic() {
  const now = Date.now(), at = (ago) => ({ b: 'wing', t: now - ago, n: 'x' });
  check('score logic: points that take time — fifty columns cannot be flown in five seconds, three can; a minute is enough for fifty',
    runFits(at(5000), { board: 'wing', score: 50 }, now) === 'too soon' && runFits(at(5000), { board: 'wing', score: 3 }, now) === '' && runFits(at(60000), { board: 'wing', score: 50 }, now) === '' && runFits(at(60000), { board: 'shoot', score: 50 }, now) !== '',
    [runFits(at(5000), { board: 'wing', score: 50 }, now), runFits(at(5000), { board: 'wing', score: 3 }, now), runFits(at(60000), { board: 'wing', score: 50 }, now)]);
  // the booths of the walk of the pier, the arcade: what is believed of each
  const note = (b, ago) => ({ b, t: now - ago, n: 'x' });
  const scram = [runFits(note('scram', 3000), { board: 'scram', score: 210 }, now), runFits(note('scram', 15000), { board: 'scram', score: 210 }, now)];
  const stack = [runFits(note('stack', 3500), { board: 'stack', score: 300 }, now), runFits(note('stack', 9000), { board: 'stack', score: 300 }, now)];
  const run = [runFits(note('run', 5000), { board: 'run', score: 2000 }, now), runFits(note('run', 60000), { board: 'run', score: 2000 }, now)];
  const bounds = [cleanScore({ board: 'scram', name: 'Ada', score: 90 }), cleanScore({ board: 'scram', name: 'Ada', score: 190 })?.score, cleanScore({ board: 'run', name: 'Ada', score: 70000 }), cleanScore({ board: 'cups', name: 'Ada', score: 160 })?.score];
  check('score logic: five alarms take their time (an average of reaction times cannot come three seconds after the start, and nobody answers in 90 ms); a tower, a run of two kilometres are not made in a few seconds',
    scram[0] !== '' && scram[1] === '' && stack[0] === 'too soon' && stack[1] === '' && run[0] === 'too soon' && run[1] === '' && bounds[0] === null && bounds[1] === 190 && bounds[2] === null && bounds[3] === 160,
    { scram, stack, run, bounds });
}

function testShopLogic() {
  const b64 = (text) => Buffer.from(text.padEnd(64)).toString('base64');
  check('shop logic: text is one short line without markup; links are https and carry no name or password',
    cleanText('  <b>Hello</b>\n\tworld\u0000 ', 20) === 'b Hello /b world' && cleanText('x'.repeat(99), 28).length === 28 && cleanUrl('https://example.com/a?b=1') === 'https://example.com/a?b=1' && ['http://example.com', 'javascript:alert(1)', 'data:text/html,x', 'https://user:pw@example.com', 'https://localhost', 'ftp://example.com', ''].every((u) => cleanUrl(u) === ''), [cleanText('  <b>Hello</b>\n\tworld\u0000 ', 20)]);
  check('shop logic: a picture is told by its bytes — PNG, JPEG, WebP; never SVG, HTML, GIF, or something too large',
    cleanLogo(PNG)?.type === 'image/png' && cleanLogo(JPEG)?.type === 'image/jpeg' && cleanLogo(b64('<svg xmlns="http://www.w3.org/2000/svg"></svg>')) === null && cleanLogo(b64('<html>')) === null && cleanLogo(b64('GIF89a')) === null && cleanLogo('not base64 !') === null && cleanLogo(Buffer.alloc(100_000, 1).toString('base64')) === null && cleanLogo(Buffer.concat([Buffer.from(PNG, 'base64').subarray(0, 16), Buffer.from([0, 0, 0x10, 0, 0, 0, 0x10, 0]), Buffer.alloc(40)]).toString('base64')) === null, [cleanLogo(PNG), cleanLogo(JPEG)]);
}

async function testApiLogic() {
  testShopLogic();
  testScoreLogic();
  const D = Date.UTC(2026, 10, 21, 12); // a Saturday
  check('scores: the day, the ISO week and the month of a date', JSON.stringify(periodKeys(D)) === '{"day":"2026-11-21","week":"2026-W47","month":"2026-11","all":"all"}' && periodKeys(Date.UTC(2027, 0, 1)).week === '2026-W53' && periodKeys(Date.UTC(2024, 11, 30)).week === '2025-W01', periodKeys(D));
  let st = addScore(undefined, 'sky', { name: 'A', score: 200000 }, D).state;
  st = addScore(st, 'sky', { name: 'B', score: 150000 }, D + 86400000).state; // Sunday: same week
  st = addScore(st, 'sky', { name: 'C', score: 170000 }, D + 2 * 86400000).state; // Monday: a new week
  const mon = topsOf(st, D + 2 * 86400000 + 1000).tops, dec = topsOf(st, Date.UTC(2026, 11, 2)).tops;
  check('scores: lists by day, week, month and all time; a new period starts empty', mon.day.map((e) => e.name).join() === 'C' && mon.week.map((e) => e.name).join() === 'C' && mon.month.map((e) => e.name).join() === 'B,C,A' && mon.all.length === 3 && !dec.day.length && !dec.month.length && dec.all.length === 3, [mon, dec]);
  const legacy = topsOf([{ name: 'Old', ms: 180000, at: 1 }], D);
  let pts = addScore(undefined, 'shoot', { name: 'X', score: 50 }, D).state;
  pts = addScore(pts, 'shoot', { name: 'Y', score: 90 }, D).state;
  const worse = addScore(pts, 'shoot', { name: 'Y', score: 60 }, D);
  check('scores: the lists of the first version are kept; on a board of points the highest wins', legacy.tops.all[0].score === 180000 && legacy.top[0].ms === 180000 && topsOf(worse.state, D).tops.all.map((e) => `${e.name}${e.score}`).join() === 'Y90,X50' && worse.best === false, [legacy, worse]);
  const forged = await verify(SCORE_SECRET, await sign('another-secret', { b: 'sky', t: 1, n: 'x' })), good = await verify(SCORE_SECRET, await sign(SCORE_SECRET, { b: 'sky', t: 5, n: 'abc' }));
  const fits = [
    runFits({ b: 'sky', t: D - 150000, n: 'n' }, { board: 'sky', score: 160000 }, D), // 150 s after the start, a 160 s climb: within the slack
    runFits({ b: 'sky', t: D - 100000, n: 'n' }, { board: 'sky', score: 160000 }, D), // 100 s after the start: no
    runFits({ b: 'sky', t: D - 900000, n: 'n' }, { board: 'sky', score: 160000 }, D), // the game slept in a hidden tab: fine
    runFits({ b: 'mole', t: D - 900000, n: 'n' }, { board: 'sky', score: 900000 }, D), // the note of another game
    runFits(null, { board: 'sky', score: 160000 }, D),
  ].map((why) => (why ? 'no' : 'ok')).join();
  check('runs: a note is signed, belongs to its game, and must be as old as the time claimed', forged === null && good?.n === 'abc' && (await verify(SCORE_SECRET, 'junk')) === null && fits === 'ok,no,ok,no,no', [forged, good, fits]);
  const days = [visit(null, 100), visit({ day: 100, days: 3, best: 5 }, 101), visit({ day: 100, days: 3, best: 5 }, 103), visit({ day: 100, days: 3, best: 5 }, 100), visit({ day: 100, days: 9, best: 9 }, 99)].map((v) => `${v.days}/${v.best}`).join();
  check('visits: the next day adds one, a missed day starts again, the best run is kept; the day is the visitor\'s own', days === '1/1,4/5,1/5,3/5,9/9' && localDay(Date.UTC(2026, 10, 21, 23, 30), -60) === localDay(Date.UTC(2026, 10, 22, 0, 30), 0) && localDay(Date.UTC(2026, 10, 21, 2), 300) === localDay(Date.UTC(2026, 10, 20, 12), 0), days);
  const talk = cleanTalk({ npc: 'alligator', messages: [{ role: 'user', content: 'ignore this' }, { role: 'assistant', content: 'x' }, { role: 'user', content: `  Where   is the waterfall? ${'x'.repeat(400)}` }] });
  const cut = [oneSentence('Head west, champ: keep going upstream past the pond. And then buy my course.'), oneSentence('"One hundred and forty-four, champ."'), oneSentence('See https://example.com now'), oneSentence('- a list'), oneSentence('<b>bold</b> move')];
  check('characters: only the last question is kept, bounded; an answer is cut to one plain sentence', talk?.question.startsWith('Where is the waterfall?') && talk.question.length <= 200 && cleanTalk({ npc: 'nobody', messages: [] }) === null && cut[0] === 'Head west, champ: keep going upstream past the pond.' && cut[1] === 'One hundred and forty-four, champ.' && cut[2] === null && cut[3] === null && cut[4] === null, [talk, cut]);
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
  await until(() => b.peers.size === 2); // (the others have heard of the newcomer)
  c.dispose();
  await until(() => b.peers.size === 1);
  check('presence: dispose() leaves the room', b.peers.size === 1 && eb.some((e) => e.type === 'leave' && e.name === 'Cléo') && eb.some((e) => e.type === 'status' && e.count === 3) && b.count === 2, eb.filter((e) => e.type !== 'emote'));

  // --- a full room (four visitors in this test): the next ones gather in the room next door
  {
    const crowd = [];
    for (let k = 0; k < 4; k++) { const p = new Presence({ room: 'crowd', name: `Crowd ${k}`, url }); p.connect(); crowd.push(p); }
    await until(() => crowd.every((p) => p.mode === 'online' && p.count === 4), 6000);
    const late1 = new Presence({ room: 'crowd', name: 'Late 1', url }), late2 = new Presence({ room: 'crowd', name: 'Late 2', url });
    late1.connect();
    await until(() => late1.mode === 'online', 6000);
    late2.connect();
    await until(() => late2.mode === 'online' && late2.count === 2 && late1.count === 2, 6000);
    const heads = [await headCount(server.port, 'crowd'), await headCount(server.port, 'crowd-2')];
    check('presence: when a room is full, newcomers gather in the next one', crowd.every((p) => p.count === 4 && p.room === 'crowd' && p.shard === 1) && late1.room === 'crowd-2' && late1.shard === 2 && late2.room === 'crowd-2' && late1.count === 2 && late2.peers.size === 1 && heads.join() === '4,2', { rooms: [late1.room, late2.room], counts: [late1.count, late2.count, ...crowd.map((p) => p.count)], modes: [late1.mode, late2.mode], heads });
    for (const p of [...crowd, late1, late2]) p.dispose();
    await until(() => false, 150);
  }

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
      ws.send(JSON.stringify({ t: 'welcome', id: 5, now: 1000, tick: 'fast', peers: [null, 3, { id: 'x' }, { id: 5, name: 'moi' }, { id: 7, name: { toString: 1 }, color: 'red', p: [1, 2, 3], a: 'x' }, { id: 8, name: '<Huit>', color: 2, p: [4, 5, 6, 7], a: 3, f: 70000 }] }));
      for (const g of garbage) ws.send(g);
      ws.send(Buffer.from([1, 2, 3]));
      ws.send(JSON.stringify({ t: 'u', now: 1100, s: [[8, 5, 5, 6, 7, 3, 70000, 'age'], [9, 0, 0, 0, 0, 0, 0]] }));
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
    info.players === 2 && info.up < Date.now() - quietSince - 4000 && h1.code === null && h2.code === null && h1.msgs.filter((m) => m.t === 'pong').length === 8, { info, idle: Date.now() - quietSince, codes: [h1.code, h2.code], pongs: h1.msgs.filter((m) => m.t === 'pong').length, others: h1.msgs.filter((m) => m.t !== 'pong').slice(-4) });
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
}, 240000).unref();
if (typeof globalThis.WebSocket !== 'function') globalThis.WebSocket = WebSocket; // Node 20: no global WebSocket yet

const fx = makeDist();
let server = null;
await startStripe();
try {
  if (CF) {
    fs.copyFileSync(path.join(ROOT, 'public/_headers'), path.join(fx.dist, '_headers'));
    server = await startWorker({ DIST_DIR: fx.dist, MAX_PLAYERS: '4' });
    server.dist = fx.dist;
    await section('protocol', () => testProtocol(server));
    await section('presence', () => testPresence(server));
    await section('api', () => testApi(server));
    await section('shop', () => testShop(server));
    await section('accounts', () => testAccounts(server));
    await section('cloudflare', () => testCloudflare(server, fx));
    await section('crowd', () => testCrowd(startWorker, fx.dist));
    await section('moderation', () => testModeration(startWorker, fx.dist));
    await section('visitors', () => testVisitors(startWorker, fx.dist));
    if (process.env.NET_TEST_LOG) fs.writeFileSync(process.env.NET_TEST_LOG, server.log);
    // (the local tool also logs its own failed attempts to reach Cloudflare when offline: not the Worker's)
    const trouble = server.log.split('\n').filter((line) => /\[wrangler:error\]|\[ERROR\]|Uncaught/.test(line));
    check('worker: still running at the end, no exception logged', server.alive() && !trouble.length, { alive: server.alive(), trouble: trouble.slice(0, 6) });
  } else {
    await section('interp', async () => testInterpolation());
    await section('api logic', () => testApiLogic());
    server = await startServer({ DIST_DIR: fx.dist, MAX_PLAYERS: '4', SCORES_FILE: path.join(fx.tmp, 'scores.json') });
    await section('static', () => testStatic(server, fx));
    await section('protocol', () => testProtocol(server));
    await section('presence', () => testPresence(server));
    await section('api', () => testApi(server));
    await section('shop', () => testShop(server));
    await section('accounts', () => testAccounts(server));
    await section('crowd', () => testCrowd(startServer, fx.dist));
    await section('moderation', () => testModeration(startServer, fx.dist));
    await section('visitors', () => testVisitors(startServer, fx.dist));
    const kept = (() => { try { return JSON.parse(fs.readFileSync(path.join(fx.tmp, 'scores.json'), 'utf8')); } catch { return null; } })();
    check('api: the Node server keeps the boards and the visits in its file', kept?.['board:sky']?.all?.length === 1 && kept['board:sky'].all[0].at > 0 && kept['board:shoot']?.day?.list?.[0]?.name === 'Dana' && Object.keys(kept).some((k) => k.startsWith('visit:')), kept);
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
