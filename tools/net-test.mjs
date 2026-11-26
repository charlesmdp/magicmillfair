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
import { signWebhook, stripeConfig } from '../server/stripe.js';
import { cleanLogo, cleanText, cleanUrl, paysOf } from '../server/shop.js';
import { restMailer, sponsorMail } from '../server/mail.js';
import { rankSponsors, placeWords } from '../src/app/thanks.js';
import { describe as describeItem, forLife, publicPrices, PRICES } from '../server/catalog.js';
import { visit, localDay } from '../server/routes.js';
import { cleanTalk, oneSentence, PERSONAS, REPLY_MAX, REPLY_WORDS } from '../server/npc.js';
import { wardrobeFrom, fitLook, fitKit, fitColor, mayLight, HAT_IDS, FIREWORK } from '../server/wardrobe.js';
import { ITEMS, PASS as GAME_PASS, packKit } from '../server/items.js';
import { __make as gameOf, replay, agrees } from '../server/replay.js';
import { sessionOf, packLog, rngOf } from '../src/world/zones/games/core.js';
import { flightOf, flightLog } from '../src/world/zones/games/WingRules.js';
import { runOf, runLog } from '../src/ui/ArcadeRules.js';
import { cleanGeo, packGeo, unpackGeo } from '../server/visitors.js';
import { openRoom, sleepRoom, userRoom, isUserRoom, cleanRoomName } from '../server/urooms.js';

// what the test servers are given: the secret that signs the notes of the runs, the administrator's key
const SCORE_SECRET = 'test-score-secret', ADMIN_KEY = 'test-admin-key';
const STRIPE_KEY = 'sk_test_magicmillfairtests', STRIPE_HOOK = 'whsec_magicmillfairtests', STRIPE_PK = 'pk_test_magicmillfairtests';
// (where the Node server writes the e-mails it would send)
const MAIL_FILE = path.join(os.tmpdir(), `mmf-net-test-mail-${process.pid}.jsonl`);
process.on('exit', () => { try { fs.rmSync(MAIL_FILE, { force: true }); } catch { /* nothing to remove */ } });
// A stand-in for Stripe: it hands out payment pages and remembers what it was asked.
const stripe = { sessions: {}, asked: [], refunds: [], portals: [], cancelled: [], port: 0, server: null };
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
      const sub = /^\/v1\/subscriptions\/(\w+)(\?.*)?$/.exec(req.url);
      if (sub && req.headers.authorization === `Bearer ${STRIPE_KEY}`) {
        // something paid by the month: asked about (its last payment), or stopped
        if (req.method === 'DELETE') stripe.cancelled.push(sub[1]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(req.method === 'DELETE' ? { id: sub[1], status: 'canceled' } : { id: sub[1], latest_invoice: { id: 'in_test_1', payment_intent: { id: `pi_month_${sub[1]}` } } }));
      }
      if (req.url === '/v1/billing_portal/sessions' && req.headers.authorization === `Bearer ${STRIPE_KEY}`) {
        stripe.portals.push({ customer: form.get('customer'), back: form.get('return_url') });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ id: `bps_test_${stripe.portals.length}`, url: `https://billing.stripe.test/p/session/${stripe.portals.length}` }));
      }
      const one = /^\/v1\/checkout\/sessions\/(cs_\w+)$/.exec(req.url);
      if (one && req.method === 'GET') {
        // a payment page, asked about: as it stands (the test says when it is paid: stripe.sessions[id])
        const s = req.headers.authorization === `Bearer ${STRIPE_KEY}` ? stripe.sessions[one[1]] : null;
        res.writeHead(s ? 200 : 404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(s || { error: { message: 'No such checkout.session' } }));
      }
      stripe.asked.push({ url: req.url, auth: req.headers.authorization, version: req.headers['stripe-version'] || '', form });
      if (ok) {
        const id = `cs_test_${stripe.asked.length}`, month = form.get('mode') === 'subscription';
        stripe.sessions[id] = { id, status: 'open', payment_status: 'unpaid', amount_total: Number(form.get('line_items[0][price_data][unit_amount]')), payment_intent: month ? null : `pi_${id}`, subscription: month ? `sub_${id}` : null, customer: `cus_${id}`,
          customer_details: { email: 'buyer@example.org' }, metadata: Object.fromEntries([...form].filter(([k]) => /^metadata\[\w+\]$/.test(k)).map(([k, v]) => [k.slice(9, -1), v])) };
      }
      res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
      // (a form to show inside the game has no page: Stripe gives a secret for its script instead)
      const session = form.get('ui_mode') === 'embedded' ? { id: `cs_test_${stripe.asked.length}`, client_secret: `cs_test_secret_${stripe.asked.length}`, url: null } : { id: `cs_test_${stripe.asked.length}`, url: `https://checkout.stripe.test/pay/cs_test_${stripe.asked.length}` };
      res.end(JSON.stringify(ok ? session : { error: { message: 'Invalid API Key' } }));
    });
  });
  await new Promise((resolve) => stripe.server.listen(stripe.port, '127.0.0.1', resolve));
}
const shopEnv = () => ({ STRIPE_SECRET_KEY: STRIPE_KEY, STRIPE_WEBHOOK_SECRET: STRIPE_HOOK, STRIPE_PUBLISHABLE_KEY: STRIPE_PK, STRIPE_API: `http://127.0.0.1:${stripe.port}` });

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
    env: { ...process.env, ALLOWED_ORIGINS: '', MAX_PLAYERS: '', DIST_DIR: '', HOST: '127.0.0.1', TICK_HZ: '20', ANTHROPIC_API_KEY: '', NPC_MODEL: '', SCORE_SECRET, ADMIN_KEY, MAIL_FILE, FREE_ROOMS: '1', ADDRESS_LIMITS: '0', ...shopEnv(), ...env, PORT: String(port) },
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
  config.vars.FREE_ROOMS = env.FREE_ROOMS ?? '1'; // (the rooms by address: open on the test servers — most checks give each its own room)
  config.vars.ADDRESS_LIMITS = env.ADDRESS_LIMITS ?? '0'; // (no limit by address: here everybody comes from one — the limits have a test of their own)
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

// (NET_TEST_ONLY=door,release: only those sections are played)
const ONLY = (process.env.NET_TEST_ONLY || '').split(',').filter(Boolean);
async function section(name, fn) {
  if (ONLY.length && !ONLY.includes(name)) return;
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
  fs.writeFileSync(path.join(dist, 'version.json'), `${JSON.stringify({ commit: 'abc1234', date: '2026-11-24 00:00' })}\n`); // (what a build writes: which version it is)
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
  a.send({ t: 's', p: [1.23456, 2.34567, -3.33333, 0.123456], a: 2, f: 33 });
  await sleep(TICK * 3);
  const b = new Client(port, 't1');
  const wb = await b.hello('Bob', 4);
  check('ws: welcome lists the players already there, with their last state',
    !!wb && wb.id !== a.id && JSON.stringify(wb.peers) === JSON.stringify([{ id: a.id, name: 'Ada', color: 3, p: [1.23, 2.35, -3.33, 0.123], a: 2, f: 33 }]), wb);
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
  a.send({ t: 's', p: [10.004, 20.006, 99999, 7.5], a: 3, f: 224 });
  const u = await b.wait((m) => m.t === 'u' && m.s.some((r) => r[0] === a.id && r[1] === 10));
  const row = u && u.s.find((r) => r[0] === a.id);
  check('ws: a state reaches the others in a batch', !!u && Number.isFinite(u.now), u);
  check('ws: values are rounded (2 decimals, yaw 3) and clamped', !!row && JSON.stringify(row.slice(0, 7)) === JSON.stringify([a.id, 10, 20.01, 2000, round3(7.5 - Math.PI * 2), 3, 224]), row);
  check('ws: rows carry their age at tick time', !!row && Number.isInteger(row[7]) && row[7] >= 0 && row[7] <= TICK * 3, row);
  a.send({ t: 's', p: [-1e9, -1e9, 0, 0], a: 99, f: -1 });
  const low = await c.wait((m) => m.t === 'u' && m.s.some((r) => r[0] === a.id && r[1] === -2000));
  check('ws: out-of-range values are clamped or reset', !!low && JSON.stringify(low.s.find((r) => r[0] === a.id).slice(1, 7)) === '[-2000,-100,0,0,0,0]', low);
  // (a look that is everybody's: the free camera, a bouquet, a quad, a big head, a disguise, a size from a secret word)
  a.send({ t: 's', p: [5, 1, 5, 0], a: 10, f: 0x2ce1 });
  const wide = await c.wait((m) => m.t === 'u' && m.s.some((r) => r[0] === a.id && r[1] === 5));
  a.send({ t: 's', p: [6, 1, 5, 0], a: 16, f: 70000 });
  const over = await c.wait((m) => m.t === 'u' && m.s.some((r) => r[0] === a.id && r[1] === 6));
  check('ws: the look of an avatar is sixteen bits (a size, a disguise…), an animation one of sixteen; beyond that, nothing', wide?.s.find((r) => r[0] === a.id)?.slice(5, 7).join() === `10,${0x2ce1}` && over?.s.find((r) => r[0] === a.id)?.slice(5, 7).join() === '0,0', [wide, over]);
  // …and what is sold shows on those who have it only: a hat, the flame of a jetpack, a size of the pass come off
  // a visitor who bought nothing (here one whose browser gave no name: not even the free day of the light jetpack)
  a.send({ t: 's', p: [7, 1, 5, 0], a: 0, f: 0x1a42 | 16 });
  const bare = await c.wait((m) => m.t === 'u' && m.s.some((r) => r[0] === a.id && r[1] === 7));
  check('ws: a hat, a flame, a size that were not bought are not shown to the others — the rest of the look is', bare?.s.find((r) => r[0] === a.id)?.[6] === 0x840, bare);

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
  // the administrator's badge: `ad` in a hello counts once the key is recognised — the others are told then, a
  // newcomer finds it in their welcome, and all are told again when it comes off; from anybody else: nothing
  eve.send({ t: 'hello', name: 'Eve', color: 2, v: 2, dev: DEV, ad: 1 });
  adm.send({ t: 'hello', name: 'Admin', color: 1, v: 2, ad: 1 });
  const worn = await bob.wait((m) => m.t === 'join' && m.id === adm.id && m.ad === 1);
  const guest = new Client(port, 'mod', from(4));
  const greeted = await guest.hello('Guest', 4);
  const badges = (greeted?.peers || []).filter((p) => p.ad === 1).map((p) => p.id).join();
  adm.send({ t: 'hello', name: 'Admin', color: 1, v: 2 });
  const bare = await guest.wait((m) => m.t === 'join' && m.id === adm.id && m.ad === undefined);
  const faked = bob.msgs.some((m) => m.t === 'join' && m.id === eve.id && m.ad !== undefined);
  guest.ws.close();
  await bob.wait((m) => m.t === 'leave' && m.id === guest.id);
  check('admin: a badge for who wants it known — the others are told once the key is recognised (a newcomer too), and told when it comes off; from a visitor it does nothing',
    worn?.name === 'Admin' && badges === String(adm.id) && !!bare && !faked, [worn, badges, bare, faked]);
  // a line for those nearby (20 m), a line for everyone
  adm.send({ t: 'c', m: 'psst', n: 1 }); adm.send({ t: 'c', m: 'hello all' });
  const near = await bob.wait((m) => m.t === 'c' && m.m === 'psst'), all = await eve.wait((m) => m.t === 'c' && m.m === 'hello all');
  check('chat: a line said to those nearby stops at twenty metres; a line to everyone does not', near?.n === 1 && !!all && all.n === undefined && !eve.msgs.some((m) => m.t === 'c' && m.m === 'psst'), [near, all]);
  // kept out in silence: the visitor stays and notices nothing — but nobody hears them any more, a score of
  // theirs is announced to nobody, and the big red button only goes off for them. It holds when they come back,
  // until it is lifted.
  {
    const DEVM = 'device-of-mia-0123456789ab', key = { authorization: `Bearer ${ADMIN_KEY}` };
    const mia = new Client(port, 'mod', from(6, DEVM));
    await mia.hello('Mia', 4, DEVM);
    mia.send({ t: 's', p: [1, 1, 0, 0], a: 0, f: 0 });
    mia.send({ t: 'c', m: 'before' });
    const before = await bob.wait((m) => m.t === 'c' && m.m === 'before');
    adm.send({ t: 'ban', id: mia.id, h: 1, q: 1 });
    await sleep(600); // (the list is kept by the notebook)
    mia.send({ t: 'c', m: 'after' }); mia.send({ t: 'g', b: 'bell' }); mia.send({ t: 'n' }); mia.send({ t: 'e', e: 2 });
    const show = await mia.wait((m) => m.t === 'n' && m.id === mia.id), wave = await bob.wait((m) => m.t === 'e' && m.id === mia.id);
    await sleep(TICK * 4);
    const unheard = !bob.msgs.some((m) => (m.t === 'c' && m.m === 'after') || (m.t === 'g' && m.id === mia.id) || m.t === 'n');
    adm.send({ t: 'who' });
    const marked = await adm.wait((m) => m.t === 'who' && m.list.some((p) => p.id === mia.id && p.muted === true));
    const quiet = (json(await request(port, '/api/bans', { headers: key }))?.bans || []).filter((b) => b.name === 'Mia');
    check('admin: kept out in silence — the visitor stays, sees their own show and is seen waving, but what they write, a score of theirs and their red button reach nobody; the list says so',
      !!before && mia.code === null && !mia.msgs.some((m) => m.t === 'kicked') && !!show && !!wave && unheard && !!marked && quiet.length === 2 && quiet.every((b) => b.quiet === true) && quiet.some((b) => b.kind === 'dev' && b.key === DEVM), { before, show, wave, unheard, quiet });
    mia.ws.close();
    await bob.wait((m) => m.t === 'leave' && m.id === mia.id);
    const mia2 = new Client(port, 'mod', from(6, DEVM));
    const again = await mia2.hello('Mia', 4, DEVM);
    mia2.send({ t: 'c', m: 'still here' });
    await sleep(TICK * 6);
    const still = !!again && mia2.code === null && !bob.msgs.some((m) => m.t === 'c' && m.m === 'still here');
    // lifted: she is heard again at once, without having to come back
    for (const b of quiet) await request(port, `/api/bans?${b.kind}=${encodeURIComponent(b.key)}`, { method: 'DELETE', headers: key });
    await sleep(400);
    mia2.send({ t: 'c', m: 'at last' });
    const heard = await bob.wait((m) => m.t === 'c' && m.m === 'at last');
    // …and set from the back office, by her browser: it holds at once too
    await request(port, '/api/bans', { method: 'POST', headers: { ...key, 'content-type': 'application/json' }, body: JSON.stringify({ dev: DEVM, name: 'Mia', hours: 1, quiet: true }) });
    await sleep(400);
    mia2.send({ t: 'c', m: 'hushed again' });
    await sleep(TICK * 6);
    const hushed = !bob.msgs.some((m) => m.t === 'c' && m.m === 'hushed again');
    await request(port, `/api/bans?dev=${DEVM}`, { method: 'DELETE', headers: key });
    mia2.ws.close();
    await bob.wait((m) => m.t === 'leave' && m.id === mia2.id);
    check('admin: who is kept out in silence is still unheard when they come back — until it is lifted, which holds at once; so does a silence set from the back office', still && !!heard && hushed, { still, heard, hushed });
  }
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
  // nobody twice: a page that connects again (its line dropped without the relay noticing) replaces the
  // connection it had; two tabs of one browser are two visitors
  {
    const TOM = 'device-of-tom-0123456789', ZED = 'device-of-zed-0123456789';
    const seer = new Client(port, 'twins', from(11)), first = new Client(port, 'twins', from(12, TOM));
    await seer.hello('Seer', 1);
    const w1 = await first.hello('Tom', 4, TOM, 'page-one-abcdef');
    const again = new Client(port, 'twins', from(12, TOM));
    const w2 = await again.hello('Tom', 4, TOM, 'page-one-abcdef');
    const left = await seer.wait((m) => m.t === 'leave' && m.id === first.id, 4000), firstEnd = await Promise.race([first.closed, sleep(4000).then(() => 'still open')]);
    const tab = new Client(port, 'twins', from(12, TOM));
    const w3 = await tab.hello('Tom', 4, TOM, 'page-two-abcdef');
    const other2 = new Client(port, 'twins', from(13, ZED));
    const w4 = await other2.hello('Zed', 6, ZED, 'page-two-abcdef'); // (the name of a page, said by another browser: not that page)
    await sleep(400);
    const stayed = !seer.msgs.some((m) => m.t === 'leave' && (m.id === again.id || m.id === tab.id));
    check('nobody twice: a page that connects again replaces the connection it had — the others see the old one leave at once; two tabs of one browser are two visitors; the name of a page cannot be borrowed by another browser',
      !!w1 && !!w2 && !!left && firstEnd !== 'still open' && again.id !== first.id && !!w3 && !!w4 && stayed && w3.peers.filter((q) => q.name === 'Tom').length === 1 && w4.peers.filter((q) => q.name === 'Tom').length === 2,
      [!!w1, !!w2, !!left, firstEnd, !!w3, !!w4, stayed, w3?.peers.map((q) => q.name), w4?.peers.map((q) => q.name)]);
    await Promise.all([seer, again, tab, other2].map((c) => c.close()));
  }
  await Promise.all([adm, other, back, sameAddress, sameDevice].map((c) => c.close()));
  await server.stop();
  fs.rmSync(file, { force: true });
}

// Where the visitors come from: counted by day and by country, the last visits kept, for the administrators.
// (Under Node the server is told, by a proxy's headers, where each request comes from; the local Workers
// runtime gives every request the same made-up place.)
// --- what is released (the switches the owner throws), which version is online, a word to every room, the board
// of a game that waits for its switch, and the figures. A server of its own: nothing here leans on the others.
async function testRelease(start, dist) {
  const file = path.join(os.tmpdir(), `mmf-release-${process.pid}.json`);
  fs.rmSync(file, { force: true });
  const server = await start({ MAX_PLAYERS: '20', DIST_DIR: dist, SCORES_FILE: file });
  const { port } = server;
  const json = (res) => { try { return JSON.parse(res.body.toString()); } catch { return null; } };
  const call = (target, body, key) => request(port, target, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body !== undefined && { 'content-type': 'application/json' }), ...(key && { authorization: `Bearer ${key}` }) }, ...(body !== undefined && { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  try {
    const st = json(await call('/api/status'));
    check('release: the status says what is released — the slide, the lab\'s five other games and the seven games with a gate off, the caves and the figures on, the sky hidden — and which version is online',
      st?.ok === true && st.release?.slide === false && ['pond', 'boats', 'hill', 'crack', 'hollow', 'waves', 'lava', 'hive', 'flip', 'spiral', 'cars', 'golf'].every((k) => st.release[k] === false) && st.release.caves === true && st.release.stats === true && st.release.sky === 'hidden' && st.release.userRooms === false && st.build === 'abc1234' && st.refresh === 0, st);
    // the board of a game that is not released: as if it did not exist
    const shut = { run: await call('/api/run', { board: 'slide' }), board: await call('/api/scores?board=slide'), all: json(await call('/api/scores?board=all')) };
    // two visitors, in two rooms
    const ann = new Client(port, 'rel-a'), bob = new Client(port, 'rel-b');
    await ann.hello('Ann'); await bob.hello('Bob');
    const here = async () => json(await call('/api/stats'))?.here;
    // (a room of the Worker tells the notebook how many it holds: a moment later)
    let seen = await here();
    for (let i = 0; i < 50 && seen !== 2; i++) { await sleep(100); seen = await here(); }
    // only the owner throws a switch
    const nobody = await call('/api/release', { set: { slide: true } }), wrongKey = await call('/api/release', { set: { slide: true } }, 'not-the-key');
    const wrong = await call('/api/release', { set: { sky: 'tomorrow' } }, ADMIN_KEY);
    const res = await call('/api/release', { set: { slide: true, sky: 'soon', nonsense: 1 } }, ADMIN_KEY), set = json(res);
    const toAnn = await ann.wait((m) => m.t === 'r'), toBob = await bob.wait((m) => m.t === 'r');
    check('release: only the owner throws a switch, a value that is not one is refused, and every room is told at once',
      nobody.status === 403 && wrongKey.status === 403 && wrong.status === 400 && res.status === 200 && set.release.slide === true && set.release.sky === 'soon' && set.release.caves === true && !('nonsense' in set.release)
      && set.rooms === 2 && toAnn?.r?.slide === true && toAnn.v === 'abc1234' && toBob?.r?.sky === 'soon', [nobody.status, wrongKey.status, wrong.status, res.status, set, toAnn, toBob]);
    // the board of the slide, now that it is released: a note, a score
    const run = await call('/api/run', { board: 'slide' });
    const posted = await call('/api/scores', { board: 'slide', name: 'Otter', score: 41000, run: await sign(SCORE_SECRET, { b: 'slide', t: Date.now() - 42000, n: randomId(9) }) });
    const open = json(await call('/api/scores?board=all'));
    check('release: the board of a game waits for its switch — no note, no score, not listed; once released it takes a time',
      shut.run.status === 400 && shut.board.status === 404 && shut.all?.boards && !('slide' in shut.all.boards) && 'sky' in shut.all.boards
      && run.status === 200 && posted.status === 200 && json(posted).day === 1 && open.boards.slide?.tops?.day?.[0]?.name === 'Otter', [shut.run.status, shut.board.status, run.status, posted.status, posted.body.toString().slice(0, 120)]);
    // the lab's five other games: a switch each, and a board that waits for it — a time for four of them (the
    // less the better), how long one held for the three ponds (the more the better: never longer than the run lasted)
    {
      const LAB = { pond: 20_000, boats: 40_000, hill: 34_000, crack: 9_000, hollow: 20_000 }, ids = Object.keys(LAB);
      const note = (b, ago) => sign(SCORE_SECRET, { b, t: Date.now() - ago, n: randomId(9) });
      // (what an address may post is counted: each of these scores comes from an address of its own)
      let who = 150;
      const post = (body) => request(port, '/api/scores', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), from: `127.0.0.${who++}` });
      const before = { runs: [], all: json(await call('/api/scores?board=all')) };
      for (const b of ids) before.runs.push((await call('/api/run', { board: b })).status);
      const on = json(await call('/api/release', { set: Object.fromEntries(ids.map((b) => [b, true])) }, ADMIN_KEY));
      const posted = {};
      for (const b of ids) posted[b] = json(await post({ board: b, name: `Lab ${b}`, score: LAB[b], run: await note(b, LAB[b] + 2500) }));
      // (too good to be true: under what each board believes — and a pond held for a minute, ten seconds after its run began)
      const low = { boats: await post({ board: 'boats', name: 'Quick', score: 30_000, run: await note('boats', 60_000) }), hollow: await post({ board: 'hollow', name: 'Quick', score: 14_000, run: await note('hollow', 60_000) }) };
      const soon = await post({ board: 'pond', name: 'Quick', score: 60_000, run: await note('pond', 10_000) });
      const longer = json(await post({ board: 'pond', name: 'Longer', score: 45_000, run: await note('pond', 48_000) }));
      const after = json(await call('/api/scores?board=all')), desk = json(await call('/api/admin', null, ADMIN_KEY));
      const unit = Object.fromEntries((desk?.boards || []).map((x) => [x.id, x.unit])), named = Object.fromEntries((desk?.boards || []).map((x) => [x.id, x.name]));
      check('release: the lab\'s five other games — the three ponds, the regatta, the slope, the cleft, the cave — each have a switch and a board that waits for it; a time too good to be true is refused, and the ponds are scored by how long one held',
        before.runs.every((s) => s === 400) && ids.every((b) => !(b in before.all.boards)) && ids.every((b) => on?.release?.[b] === true) && ids.every((b) => posted[b]?.day === 1 && after.boards[b]?.tops.day.some((e) => e.name === `Lab ${b}`))
        && low.boats.status === 400 && low.hollow.status === 400 && soon.status === 400 && longer?.day === 1 && after.boards.pond.tops.day.map((e) => e.name).join() === 'Longer,Lab pond'
        && unit.pond === 'time' && unit.hollow === 'time' && unit.bell === 'points' && named.pond === 'The Endless Pond' && named.crack === 'Bouncy Rock',
        [before.runs, on?.release, Object.fromEntries(ids.map((b) => [b, posted[b]?.day])), low.boats.status, low.hollow.status, soon.status, after.boards?.pond?.tops.day, unit.pond, named.pond]);
    }
    // the seven games with a gate: a switch each, and a board that waits for it — three scored by how long one
    // held, three by a time, the golf by its strokes (a thousand for each, then the seconds of the round). The
    // time of the machine may be well over what the run lasted (each fall adds to it), never a run shorter than
    // the machine takes
    {
      const NEW = { waves: 30_000, lava: 40_000, hive: 30_000, flip: 90_000, spiral: 200_000, cars: 30_000, golf: 31_127 }, ids = Object.keys(NEW);
      const note = (b, ago) => sign(SCORE_SECRET, { b, t: Date.now() - ago, n: randomId(9) });
      let who = 200;
      const post = (body) => request(port, '/api/scores', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), from: `127.0.0.${who++}` });
      const before = { runs: [], all: json(await call('/api/scores?board=all')) };
      for (const b of ids) before.runs.push((await call('/api/run', { board: b })).status);
      const on = json(await call('/api/release', { set: Object.fromEntries(ids.map((b) => [b, true])) }, ADMIN_KEY));
      const posted = {};
      for (const b of ids) posted[b] = json(await post({ board: b, name: `New ${b}`, score: NEW[b], run: await note(b, NEW[b] + 2500) }));
      // (the machine: twenty-two falls put a time at two and a half minutes, a hundred seconds after the start —
      // believed; a time told a minute after the start is not: the machine takes longer than that)
      const falls = json(await post({ board: 'flip', name: 'Clumsy', score: 150_000, run: await note('flip', 100_000) }));
      const early = await post({ board: 'flip', name: 'Quick', score: 90_000, run: await note('flip', 60_000) });
      // (too good to be true: a minute held on the sand ten seconds after the run began; longer in the crater than
      // the lava leaves anybody; a comb left at once; nine holes in eight strokes; three laps in ten seconds)
      const bad = {
        waves: await post({ board: 'waves', name: 'Quick', score: 60_000, run: await note('waves', 10_000) }),
        lava: await post({ board: 'lava', name: 'Quick', score: 99_000, run: await note('lava', 120_000) }),
        hive: await post({ board: 'hive', name: 'Quick', score: 5_000, run: await note('hive', 60_000) }),
        golf: await post({ board: 'golf', name: 'Quick', score: 8_050, run: await note('golf', 300_000) }),
        cars: await post({ board: 'cars', name: 'Quick', score: 10_000, run: await note('cars', 60_000) }),
        spiral: await post({ board: 'spiral', name: 'Quick', score: 200_000, run: await note('spiral', 100_000) }),
      };
      const after = json(await call('/api/scores?board=all')), desk = json(await call('/api/admin', null, ADMIN_KEY));
      const unit = Object.fromEntries((desk?.boards || []).map((x) => [x.id, x.unit])), named = Object.fromEntries((desk?.boards || []).map((x) => [x.id, x.name]));
      check('release: the seven games with a gate each have a switch and a board that waits for it; what is too good to be true is refused; the machine\'s time may carry its falls, never be told before the machine is through',
        before.runs.every((st) => st === 400) && ids.every((b) => !(b in before.all.boards)) && ids.every((b) => on?.release?.[b] === true) && ids.every((b) => posted[b]?.day === 1 && after.boards[b]?.tops.day.some((e) => e.name === `New ${b}`))
        && falls?.day === 2 && early.status === 400 && Object.values(bad).every((r) => r.status === 400)
        && after.boards.waves.tops.day[0].score === 30_000 && after.boards.golf.tops.day[0].score === 31_127
        && unit.waves === 'time' && unit.lava === 'time' && unit.hive === 'time' && unit.flip === 'time' && unit.cars === 'time' && unit.golf === 'strokes' && named.waves === 'Big Tsunami' && named.hive === "Bee Fly" && named.golf === 'Balthazar Golf',
        [before.runs, Object.fromEntries(ids.map((b) => [b, posted[b]?.day ?? posted[b]])), falls?.day ?? falls, early.status, Object.fromEntries(Object.entries(bad).map(([k, r]) => [k, r.status])), unit.golf, named.golf]);
    }
    // everybody is asked to refresh
    const t0 = Date.now();
    ann.msgs.length = 0;
    const fr = json(await call('/api/release', { refresh: true }, ADMIN_KEY)), asked = await ann.wait((m) => m.t === 'r' && m.f > 0), later = json(await call('/api/release'));
    check('release: the owner can ask every page to refresh — said to every room, and to whoever asks later; the switches stay as they were',
      fr?.refresh >= t0 - 3000 && asked?.f === fr.refresh && later.refresh === fr.refresh && later.release.slide === true && later.release.sky === 'soon' && later.build === 'abc1234', [fr, asked, later]);
    // a word to every room
    const word = await call('/api/announce', { text: '  Fireworks   at nine  ' }, ADMIN_KEY), heard = await bob.wait((m) => m.t === 'say'), hush = await call('/api/announce', { text: 'psst' }), empty = await call('/api/announce', { text: '   ' }, ADMIN_KEY);
    check('release: an administrator says a word to every room at once; nobody else can, and nothing is not a word',
      word.status === 200 && json(word).rooms === 2 && json(word).said === 'Fireworks at nine' && heard?.m === 'Fireworks at nine' && hush.status === 403 && empty.status === 400, [word.status, word.body.toString(), heard, hush.status, empty.status]);
    // the figures: sums; a browser adds what it did; who is here; the owner sets what was before; the shop adds and takes back
    const fig0 = json(await call('/api/stats'));
    const counted = json(await call('/api/stats', { device: 'd'.repeat(22), d: { keys: 12, metres: 30, secs: 40, moving: 20 }, color: 3, kind: 'computer', os: 'Linux', from: 'direct' }));
    const fig1 = json(await call('/api/stats'));
    const setNo = await call('/api/stats/set', { money: 10, passes: 2, people: 100 }), setYes = json(await call('/api/stats/set', { money: 10, passes: 2, people: 100 }, ADMIN_KEY));
    const hook = async (event) => { const raw = JSON.stringify(event); return request(port, '/api/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': await signWebhook(STRIPE_HOOK, raw) }, body: raw }); };
    const DEV = 'device-of-fig-0123456789', RIVAL = 'device-of-riv-0123456789';
    const sale = (id, item, device, amount, extra = {}) => ({ type: 'checkout.session.completed', data: { object: { id, payment_status: 'paid', amount_total: amount, metadata: { item, device }, ...extra } } });
    await hook(sale('cs_fig_1', 'hat:crown', DEV, 999));
    await hook(sale('cs_fig_1', 'hat:crown', DEV, 999)); // (Stripe says it twice: counted once)
    await hook(sale('cs_fig_2', 'pass', DEV, 1900, { subscription: 'sub_fig', customer: 'cus_fig' }));
    await hook(sale('cs_fig_3', 'board:mole', DEV, 500, { payment_intent: 'pi_fig_1' }));
    const before = json(await call('/api/stats'));
    await hook(sale('cs_fig_4', 'board:mole', RIVAL, 800, { payment_intent: 'pi_fig_2' })); // (outbid: the first bid is given back)
    const after = json(await call('/api/stats'));
    check('figures: sums that a browser adds to; "here now" is who is connected; the owner alone sets what was before; the shop adds what it sells — once — and takes back what it gives back',
      fig0?.keys === 0 && seen === 2 && fig0.here === 2 && counted?.counted === true && fig1.keys === 12 && fig1.people === 1 && setNo.status === 403 && setYes?.money === 10 && setYes.passes === 2 && setYes.people === 100
      && before.money === 10 + 9.99 + 19 + 5 && before.passes === 3 && after.money === before.money + 8 - 5, [fig0?.keys, seen, fig0?.here, counted, fig1?.keys, setNo.status, setYes?.money, before?.money, before?.passes, after?.money]);
    // the rooms, for the administrators: how many each holds, and how many of them are still on an older version
    const cat = new Client(port, 'rel-a'), dan = new Client(port, 'rel-b');
    await cat.opened; await dan.opened;
    cat.send({ t: 'hello', name: 'Cat', color: 1, v: 2, b: 'deadbeef' }); dan.send({ t: 'hello', name: 'Dan', color: 2, v: 2, b: 'abc1234' });
    await cat.wait((m) => m.t === 'welcome'); await dan.wait((m) => m.t === 'welcome');
    let rooms = null;
    for (let i = 0; i < 90; i++) {
      // (a room of the Worker counts again a few seconds after it last did, when something happens in it)
      if (i % 10 === 9) { ann.send({ t: 'ping', c: i }); bob.send({ t: 'ping', c: i }); }
      rooms = json(await call('/api/rooms', undefined, ADMIN_KEY));
      if (rooms?.players === 4 && rooms.old === 3) break;
      await sleep(100);
    }
    const noRooms = await call('/api/rooms');
    check('rooms: the administrators see the rooms that hold somebody — how many each, and how many are still on an older version than the one online (anybody else: the common rooms only, and no such detail)',
      noRooms.status === 200 && json(noRooms)?.rooms?.length === 0 && rooms?.build === 'abc1234' && rooms.rooms.length === 2 && rooms.rooms[0].name === 'rel-a' && rooms.rooms[0].players === 2 && rooms.rooms[0].old === 2 && rooms.rooms[1].name === 'rel-b' && rooms.rooms[1].players === 2 && rooms.rooms[1].old === 1 && rooms.players === 4 && rooms.old === 3, [noRooms.status, rooms]);
    ann.ws.close(); bob.ws.close(); cat.ws.close(); dan.ws.close();
  } finally {
    await server.stop();
    fs.rmSync(file, { force: true });
  }
}

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
  const post = (target, body, headers = {}, from) => request(port, target, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body), ...(from && { from }) });
  // scores belong to accounts: Ada, Bob and Dana have one each, made from a browser of their own (and from another
  // address than the rest of this test: what an address may ask of the accounts is counted)
  const dev = { ada: randomId(16), bob: randomId(16), dana: randomId(16), gil: randomId(16), hal: randomId(16) }, ELSEWHERE = '127.0.0.41', GUESTS = '127.0.0.42';
  const signUp = (name, device) => post('/api/account', { action: 'create', device, name, password: 'a good password' }, {}, ELSEWHERE);
  const signed = [await signUp('Ada', dev.ada), await signUp('Bob', dev.bob), await signUp('Dana', dev.dana)].map((r) => r.status).join();
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
  res = await post('/api/scores', { board: 'sky', name: '  Ada   <b>Lovelace</b> the first ', score: 240000.4, run: adaNote, device: dev.ada }); // 3
  const first = json(res);
  check('api: a time is recorded in the four lists — under the name of the account, whatever name the page gives', signed === '200,200,200' && res.status === 200 && first?.rank === 1 && first.best === true && first.guest === undefined && ['day', 'week', 'month', 'all'].every((p) => first.tops[p][0]?.score === 240000 && first.tops[p][0].name === 'Ada' && first.tops[p][0].at === undefined) && first.top[0].ms === 240000, [signed, res.body.toString().slice(0, 240)]);
  res = await post('/api/scores', { board: 'sky', name: 'Twice', score: 240000, run: adaNote }); // 4: the same note again
  check('api: the note of a run counts once', res.status === 400, res.status);
  res = await post('/api/scores', { board: 'sky', name: 'Bob', ms: 200000, run: await note('sky', 205000), device: dev.bob }); // 5 (`ms`: what the first version of the game sends)
  const second = json(res);
  res = await post('/api/scores', { board: 'sky', name: 'ada', score: 300000, run: await note('sky', 300000), device: dev.ada }); // 6
  const third = json(res);
  check('api: best first; a slower time changes nothing', second?.rank === 1 && second.tops.all.map((e) => e.name).join() === 'Bob,Ada' && third?.rank === 2 && third.best === false && third.tops.all[1].score === 240000, [second, third]);
  // a game played for points: the best is the highest, and the game cannot be over before it has lasted
  const soon = await post('/api/scores', { board: 'shoot', name: 'Quick', score: 500, run: await note('shoot', 5000) }); // 7
  // (a great score at a booth is played again by the server: this one comes out of a game really played, with the seed of its note)
  let gallery = null;
  for (let hand = 1; hand < 20 && !(gallery && gallery.score >= 10); hand++) gallery = playBooth('shoot', 5150, hand);
  res = await post('/api/scores', { board: 'shoot', name: 'Dana', score: gallery.score, run: await sign(SCORE_SECRET, { b: 'shoot', t: Date.now() - 50000, n: randomId(9), s: 5150 }), log: gallery.log, device: dev.dana }); // 8
  check('api: a board of points — not before the game has lasted, then recorded', soon.status === 400 && res.status === 200 && gallery.score >= 10 && json(res).tops.day[0].score === gallery.score && json(res).rank === 1, [soon.status, res.status, res.body.toString().slice(0, 120)]);
  res = await post('/api/scores', { board: 'sky', name: 'Carol', score: 210000, run: await note('sky', 215000) });
  const limited = res.status;
  res = await request(port, '/api/scores?board=sky');
  check('api: a ninth POST within the minute is turned away; the board is unchanged', limited === 429 && json(res)?.tops.all.length === 2 && json(res).tops.all[0].name === 'Bob', [limited, res.body.toString().slice(0, 160)]);
  res = await request(port, '/api/scores?board=all');
  const every = json(res)?.boards || {};
  check('api: every board in one request (the four booths, the race, the climb, the flying theatre)', res.status === 200 && ['sky', 'race', 'wing', 'shoot', 'mole', 'milk', 'bell'].every((id) => every[id] && ['day', 'week', 'month', 'all'].every((p) => Array.isArray(every[id].tops[p]))) && every.sky.tops.all[0].name === 'Bob' && every.shoot.tops.all[0].score === gallery.score && !every.race.tops.all.length, [res.status, res.body.toString().slice(0, 200)]);
  res = await request(port, '/api/scores?board=nope');
  const put = await request(port, '/api/scores', { method: 'PUT' });
  check('api: unknown board → 404, other methods → 405', res.status === 404 && put.status === 405, [res.status, put.status]);
  // the administrator: recognised by the key, may take a line off a board
  const anon = await request(port, '/api/admin'), wrong = await request(port, '/api/admin', { headers: { authorization: 'Bearer nope' } });
  const admin = await request(port, '/api/admin', { headers: { authorization: `Bearer ${ADMIN_KEY}` } });
  const noDel = await request(port, '/api/scores?board=sky&name=Bob', { method: 'DELETE' });
  const del = await request(port, '/api/scores?board=sky&name=bob', { method: 'DELETE', headers: { authorization: `Bearer ${ADMIN_KEY}` } });
  res = await request(port, '/api/scores?board=sky');
  check('api: only the administrator\'s key opens /api/admin and takes a line off a board', anon.status === 403 && wrong.status === 403 && admin.status === 200 && noDel.status === 403 && del.status === 200 && json(del).removed > 0 && json(res).tops.all.map((e) => e.name).join() === 'Ada', [anon.status, wrong.status, admin.status, noDel.status, del.status, res.body.toString().slice(0, 120)]);
  // without an account: on the list of the day only — told where the score would stand in the others, and given a
  // note to claim it with; never under the name of an account. (From another address: this one has posted enough.)
  {
    const key = { authorization: `Bearer ${ADMIN_KEY}` }, lists = async (q = '') => json(await request(port, `/api/scores?board=sky${q}`))?.tops;
    const gil = json(await post('/api/scores', { board: 'sky', name: 'Gil', score: 190000, run: await note('sky', 195000), device: dev.gil }, {}, GUESTS));
    const borrowed = await post('/api/scores', { board: 'sky', name: 'ADA', score: 150000, run: await note('sky', 155000), device: dev.gil }, {}, GUESTS);
    const after = await lists();
    check('scores: a visitor without an account is on the list of the day only — and is told where they would stand in the others; nobody posts under the name of an account',
      gil?.guest === true && gil.day === 1 && gil.rank === 0 && gil.best === true && gil.would?.week === 1 && gil.would.month === 1 && gil.would.all === 1 && typeof gil.claim === 'string' && gil.tops.day[0].name === 'Gil' && gil.tops.all.map((e) => e.name).join() === 'Ada'
      && borrowed.status === 409 && json(borrowed)?.taken === true && after.day.map((e) => e.name).join() === 'Gil,Ada' && ['week', 'month', 'all'].every((p) => after[p].map((e) => e.name).join() === 'Ada'), [gil, borrowed.status, after]);
    // …an account made within the half hour: the note is handed back, and the score counts everywhere — once
    const noAccount = await post('/api/scores/claim', { device: dev.gil, claims: [gil?.claim] }, {}, GUESTS);
    const madeGil = await signUp('Gil', dev.gil);
    const claimed = json(await post('/api/scores/claim', { device: dev.gil, claims: [gil?.claim, 'not a note'] }, {}, GUESTS)), twice = json(await post('/api/scores/claim', { device: dev.gil, claims: [gil?.claim] }, {}, GUESTS));
    const forged = json(await post('/api/scores/claim', { device: dev.gil, claims: [await sign('another secret', { c: 1, b: 'sky', s: 100000, x: Date.now() + 60000, n: 'abc' }), await sign(SCORE_SECRET, { c: 1, b: 'sky', s: 100000, x: Date.now() - 1000, n: 'old' })] }, {}, GUESTS));
    const withIt = await lists();
    check('scores: an account made within the half hour claims the score with the note the server gave — it then counts for the week, the month and all time; once, and only with a note of the server that has not expired',
      noAccount.status === 403 && madeGil.status === 200 && claimed?.claimed.join() === 'sky' && claimed.name === 'Gil' && claimed.boards.sky.tops.all[0].name === 'Gil' && twice?.claimed.length === 0 && forged?.claimed.length === 0
      && ['week', 'month', 'all'].every((p) => withIt[p].map((e) => `${e.name}:${e.score}`).join() === 'Gil:190000,Ada:240000'), [noAccount.status, madeGil.status, claimed, twice, forged, withIt]);
    // kept out in silence: the score shows on that visitor's screen, and nowhere else
    await post('/api/bans', { dev: dev.hal, name: 'Hal', hours: 1, quiet: true }, key);
    const hal = json(await post('/api/scores', { board: 'sky', name: 'Hal', score: 170000, run: await note('sky', 175000), device: dev.hal }, {}, GUESTS));
    const forAll = await lists(), forHal = await lists(`&device=${dev.hal}`), everyHal = json(await request(port, `/api/scores?board=all&device=${dev.hal}`))?.boards?.sky?.tops;
    await request(port, `/api/bans?dev=${dev.hal}`, { method: 'DELETE', headers: key });
    check('scores: the score of a visitor kept out in silence shows to them — as if nothing was the matter — and to nobody else',
      hal?.guest === true && hal.day === 1 && hal.tops.day[0].name === 'Hal' && forHal.day[0].name === 'Hal' && everyHal?.day[0].name === 'Hal' && !forAll.day.some((e) => e.name === 'Hal') && forAll.day[0].name === 'Gil', [hal, forAll.day, forHal.day]);
  }
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
  check('shop: a payment page is asked of Stripe at the price of the catalogue, for this visitor', res.status === 200 && /^https:\/\/checkout\.stripe\.test\//.test(json(res)?.url || '') && asked?.get('mode') === 'payment' && asked.get('line_items[0][price_data][unit_amount]') === '999' && asked.get('line_items[0][price_data][currency]') === 'usd' && asked.get('metadata[item]') === 'hat:crown' && asked.get('metadata[device]') === ann && asked.get('client_reference_id') === ann && asked.get('success_url').endsWith('/?paid=hat%3Acrown&cs={CHECKOUT_SESSION_ID}'), [res.status, res.body.toString().slice(0, 160), asked?.toString().slice(0, 300)]);
  // (a sky village is for hire only once the sky is open: the owner's switch)
  const shutSky = await post('/api/checkout', { item: 'village:eagle-rest', device: bob });
  await post('/api/release', { set: { sky: 'open' } }, { authorization: `Bearer ${ADMIN_KEY}` });
  res = await post('/api/checkout', { item: 'village:eagle-rest', device: bob });
  const sub = stripe.asked[1]?.form;
  const nothing = await post('/api/checkout', { item: 'hat:invisible', device: ann }), nobody = await post('/api/checkout', { item: 'jetpack', device: 'x' });
  check('shop: a village is a subscription by the month, at the price of its height — once the sky is open, not before; what is not sold is refused', shutSky.status === 400 && res.status === 200 && sub?.get('mode') === 'subscription' && sub.get('line_items[0][price_data][recurring][interval]') === 'month' && Number(sub.get('line_items[0][price_data][unit_amount]')) >= 1900 && sub.get('subscription_data[metadata][item]') === 'village:eagle-rest' && nothing.status === 400 && nobody.status === 400, [res.status, sub?.toString().slice(0, 200), nothing.status, nobody.status]);
  // (the panel over the board of a game of the lab is for sale once its game is switched on — its board waits for it too)
  // (asked from an address of its own — on either server: these two do not count against what the other checks may ask)
  const aside = (body) => request(port, '/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), from: '127.0.0.77' });
  const shutPanel = await aside({ item: 'board:hill', device: bob, bid: 300 });
  await post('/api/release', { set: { hill: true } }, { authorization: `Bearer ${ADMIN_KEY}` });
  const openPanel = await aside({ item: 'board:hill', device: bob, bid: 300 });
  await post('/api/release', { set: { hill: false } }, { authorization: `Bearer ${ADMIN_KEY}` });
  check('shop: the panel of a game that waits for its switch is sold once that game is on, not before', shutPanel.status === 400 && openPanel.status === 200 && /^https:\/\/checkout\.stripe\.test\//.test(json(openPanel)?.url || ''), [shutPanel.status, openPanel.status, openPanel.body?.toString().slice(0, 120)]);
  // the payment form inside the game: where the publishable key was given, Stripe is asked for a form to embed
  stripe.asked.length = 0;
  const inGame = await post('/api/checkout', { item: 'hat:cowboy', device: ann, embed: true });
  const emb = stripe.asked[0];
  const keys = [stripeConfig({ STRIPE_SECRET_KEY: 'sk_test_abc' }), stripeConfig({ STRIPE_SECRET_KEY: 'sk_test_abc', STRIPE_PUBLISHABLE_KEY: 'pk_live_abcdefghijklmnop' }), stripeConfig({ STRIPE_SECRET_KEY: 'sk_test_abc', STRIPE_PUBLISHABLE_KEY: 'sk_test_abcdefghijklmnop' }),
    stripeConfig({ STRIPE_SECRET_KEY: 'sk_test_abc', STRIPE_PUBLISHABLE_KEY: 'pk_test_abcdefghijklmnop' }), stripeConfig({ STRIPE_LIVE_SECRET_KEY: 'sk_live_abc', STRIPE_TEST_SECRET_KEY: 'sk_test_abc', STRIPE_LIVE_PUBLISHABLE_KEY: 'pk_live_abcdefghijklmnop', STRIPE_TEST_PUBLISHABLE_KEY: 'pk_test_abcdefghijklmnop' })];
  check('shop: with Stripe\'s publishable key the payment form can be shown inside the game — the game is told the key, and Stripe is asked for a form to embed (a secret for its script, no page), at the price of the catalogue; a key of the wrong kind or mode does not count',
    shop.pk === STRIPE_PK && inGame.status === 200 && /^cs_test_secret_/.test(json(inGame)?.secret || '') && !json(inGame).url
    && emb?.form.get('ui_mode') === 'embedded' && emb.form.get('redirect_on_completion') === 'if_required' && emb.form.get('return_url').endsWith('/?paid=hat%3Acowboy&cs={CHECKOUT_SESSION_ID}') && /^cs_test_/.test(json(inGame).id || '') && !emb.form.get('success_url') && !emb.form.get('cancel_url')
    && emb.form.get('line_items[0][price_data][unit_amount]') === '999' && emb.form.get('metadata[item]') === 'hat:cowboy' && emb.form.get('metadata[device]') === ann && emb.version === '2025-03-31.basil' && stripe.asked.length === 1
    && keys[0].publishable === '' && keys[1].publishable === '' && keys[2].publishable === '' && keys[3].publishable === 'pk_test_abcdefghijklmnop' && keys[4].mode === 'live' && keys[4].publishable === 'pk_live_abcdefghijklmnop',
    [shop.pk, inGame.status, inGame.body.toString().slice(0, 120), emb?.form.toString().slice(0, 300), emb?.version, keys.map((k) => k.publishable)]);
  // only Stripe's word counts
  const forged = await hook(paid('jetpack', ann), 'whsec_somebody_else'), stale = await hook(paid('jetpack', ann), STRIPE_HOOK, Date.now() - 3600_000);
  const unsigned = await post('/api/stripe/webhook', JSON.stringify(paid('jetpack', ann)));
  const still = json(await request(port, `/api/shop?device=${ann}`));
  check('shop: a webhook that Stripe did not sign, or an old one, gives nothing', forged.status === 400 && stale.status === 400 && unsigned.status === 400 && !still.owned.length, [forged.status, stale.status, unsigned.status, still.owned]);
  const ok1 = await hook(paid('hat:crown', ann)), ok2 = await hook(paid('hat:crown', ann)), ok3 = await hook(paid('jetpack', ann));
  const mine = json(await request(port, `/api/shop?device=${ann}`)), theirs = json(await request(port, `/api/shop?device=${bob}`));
  const again = await post('/api/checkout', { item: 'hat:crown', device: ann });
  check('shop: what Stripe says was paid is theirs — once, and theirs only; it is not sold to them twice', ok1.status === 200 && ok2.status === 200 && ok3.status === 200 && mine.owned.join() === 'hat:crown,jetpack' && !theirs.owned.length && again.status === 409, [mine.owned, theirs.owned, again.status]);
  // what one is seen wearing is what one has (wardrobe.js): Ann owns a crown and the jetpack, Bob nothing — both
  // say they wear a crown, a flame, a size of the pass, gold paint and a colour of the pass
  {
    const CROWN = 6 << 1, look = CROWN | 16 | (2 << 8) | 32; // (a crown, a jetpack burning, the size "Jumbo", a bouquet)
    const watcher = new Client(port, 'wardrobe'), wa = new Client(port, 'wardrobe', { dev: ann }), wb = new Client(port, 'wardrobe', { dev: bob });
    await watcher.hello('Watcher', 0);
    for (const [c, name, dev] of [[wa, 'Ann', ann], [wb, 'Bob', bob]]) { await c.opened; c.send({ t: 'hello', name, color: 20, v: 2, dev, k: packKit({ paint: 1 }) }); await c.wait((m) => m.t === 'welcome'); c.id = c.msgs.find((m) => m.t === 'welcome').id; }
    const cards = [await watcher.wait((m) => m.t === 'join' && m.id === wa.id), await watcher.wait((m) => m.t === 'join' && m.id === wb.id)];
    wa.send({ t: 's', p: [1, 1, 1, 0], a: 0, f: look }); wb.send({ t: 's', p: [2, 1, 1, 0], a: 0, f: look }); watcher.send({ t: 's', p: [3, 1, 1, 0], a: 0, f: look });
    const rowOf = async (c, x) => (await watcher.wait((m) => m.t === 'u' && m.s.some((r) => r[0] === c.id && r[1] === x)))?.s.find((r) => r[0] === c.id)?.[6];
    const seen = [await rowOf(wa, 1), await rowOf(wb, 2)];
    const mine = (await wa.wait((m) => m.t === 'u' && m.s.some((r) => r[0] === watcher.id)))?.s.find((r) => r[0] === watcher.id)?.[6];
    wb.send({ t: 'e', e: FIREWORK }); wa.send({ t: 'e', e: 2 });
    await watcher.wait((m) => m.t === 'e' && m.id === wa.id);
    const lit = watcher.msgs.some((m) => m.t === 'e' && m.id === wb.id);
    check('wardrobe: what was bought shows (a crown, the flame of the jetpack); what was not is brought back to the plain robot — hat, size, paint, colour, a firework nobody bought; the free day of the light jetpack counts, for a browser that has one',
      cards[0]?.color === 4 && cards[0].k === undefined && cards[1]?.color === 4 && seen[0] === (CROWN | 16 | 32) && seen[1] === (16 | 32) && mine === 32 && !lit, { cards, seen, mine, lit });
    // a present while he is there: the page says "something is new", the relay asks again — and the crown he was
    // asking for shows, without his sending anything more
    await post('/api/gift', { device: bob, item: 'hat:crown' }, { authorization: `Bearer ${ADMIN_KEY}` });
    wb.send({ t: 'own' });
    const crowned = await until(() => watcher.msgs.filter((m) => m.t === 'u').flatMap((m) => m.s).filter((r) => r[0] === wb.id).pop()?.[6] === (CROWN | 16 | 32), 6000);
    // an administrator may wear anything
    watcher.send({ t: 'admin', key: ADMIN_KEY });
    await watcher.wait((m) => m.t === 'admin');
    const free = await until(() => wa.msgs.filter((m) => m.t === 'u').flatMap((m) => m.s).filter((r) => r[0] === watcher.id).pop()?.[6] === look, 6000);
    check('wardrobe: what is given, or bought, shows as soon as the page says so ({t:\'own\'}: the relay asks the notebook again); an administrator may wear anything', !!crowned && !!free, { crowned, free });
    for (const c of [watcher, wa, wb]) c.ws.close();
    // (the rules themselves)
    const now = 1_000_000_000_000, none = { m: 0, t: 0 }, w = (items, pass) => { const g = wardrobeFrom(items, pass, now - 10 * 86_400_000, now); return { m: g.m, t: now + g.left }; };
    const hats = fs.readFileSync(path.join(ROOT, 'src/player/Cosmetics.js'), 'utf8').split('export const HATS = [')[1].split('];')[0].match(/id: '([a-z]+)'/g).map((s) => s.slice(5, -1));
    const sold = ITEMS.map((it) => it.id).filter((id) => id.startsWith('hat:')).map((id) => id.slice(4));
    const fresh = wardrobeFrom([], false, 0, now), old = wardrobeFrom([], false, now - 2 * 86_400_000, now);
    check('wardrobe: the rules — a hat needs to be owned (or the pass), a flame needs a jetpack (or the pass, or the free day), the sizes and the second rows of colours come with the pass, paints and trails are bought; the numbers of the hats are those of the game',
      HAT_IDS.join() === hats.join() && sold.every((h) => HAT_IDS.includes(h)) && FIREWORK === 31
      && fitLook(CROWN | 16, none, now) === 0 && fitLook(CROWN, w(['hat:crown']), now) === CROWN && fitLook(CROWN, w(['hat:cap']), now) === 0 && fitLook(CROWN | 16 | (3 << 8), w([], true), now) === (CROWN | 16 | (3 << 8))
      && fitLook(16, w(['jetlite']), now) === 16 && fitLook(16, { m: 0, t: now + 5 }, now) === 16 && fitLook(16, { m: 0, t: now - 5 }, now) === 0 && fitLook(0x1000 | (4 << 1), w(['hat:party']), now) === (0x1000 | (4 << 1))
      && fitLook(0x2000 | 0x400 | 32 | 64 | 128 | 1, none, now) === (0x2000 | 0x400 | 32 | 64 | 128 | 1) && fitLook(CROWN | 16 | (2 << 8), true, now) === (CROWN | 16 | (2 << 8)) && fitLook(CROWN, undefined, now) === CROWN
      && fitKit(packKit({ paint: 1, trail: 2, pet: 1 }), w(['paint:gold'])) === packKit({ paint: 1 }) && fitKit(packKit({ paint: 1, trail: 2 }), w(['trail:confetti'], true)) === packKit({ trail: 2 }) && fitKit(packKit({ paint: 7 }), w(['paint:gold'])) === 0
      && fitColor(20, none) === 4 && fitColor(20, w([], true)) === 20 && fitColor(7, none) === 7 && fitColor(31, undefined) === 31
      && !mayLight(none) && mayLight(w(['fireworks'])) && mayLight(true) && fresh.left === 24 * 3600_000 && old.left === 0,
      { hats, HAT_IDS, fresh, old });
  }
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
  // a place to sponsor: paid, then filled in by its holder — and shown at once (the owner takes down afterwards what should not be there)
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
  const before = { fine: json(fine) };
  check('shop: only the holder fills a place in; a link must be https; what is not a picture is refused', intruder.status === 403 && html.status === 400 && svg.status === 400 && page.status === 400 && liar.status === 400 && fine.status === 200 && before.fine?.state === 'live', [intruder.status, html.status, svg.status, page.status, liar.status, fine.status, before.fine]);
  const noAdmin = await request(port, '/api/sponsors'), list = json(await request(port, '/api/sponsors', { headers: admin }));
  const kept = list?.slots?.['tarp:shoot'];
  check('shop: the administrator sees every place as it is shown — text made harmless — and nothing of a sponsor waits for approval', noAdmin.status === 403 && kept?.state === 'live' && !kept.draft && !/[<>]/.test(kept.title + kept.subtitle) && kept.title.length <= 28 && kept.subtitle === 'Friendly machines b since /b 1999' && kept.url === 'https://acme.example/robots?x=1', [noAdmin.status, kept]);
  const approve = await post('/api/sponsors', { slot: 'tarp:shoot', approve: true }, admin), sneaky = await post('/api/sponsors', { slot: 'tarp:shoot', approve: true });
  const live = json(await request(port, `/api/shop?device=${ann}`)).slots['tarp:shoot'];
  const logo = await request(port, live?.logo || '/nowhere');
  check('shop: what a sponsor sends is shown to everyone at once (there is nothing to approve); the picture is served as a picture and nothing else', approve.status === 404 && sneaky.status === 403 && live.state === 'live' && live.url === 'https://acme.example/robots?x=1' && logo.status === 200 && logo.headers['content-type'] === 'image/png' && logo.headers['x-content-type-options'] === 'nosniff' && /sandbox/.test(logo.headers['content-security-policy'] || '') && logo.body.equals(Buffer.from(PNG, 'base64')), [approve.status, sneaky.status, live, logo.status, logo.headers]);
  // …but what a visitor who is kept out in silence had put up is shown to them alone, until it is lifted
  {
    const seenBy = async (device) => json(await request(port, `/api/shop?device=${device}`)).slots['tarp:shoot'];
    const [holder, other] = (await seenBy(ann))?.mine ? [ann, bob] : [bob, ann];
    await post('/api/bans', { dev: holder, name: 'Sponsor', hours: 1, quiet: true }, admin);
    const toOthers = await seenBy(other), toThem = await seenBy(holder);
    await request(port, `/api/bans?dev=${holder}`, { method: 'DELETE', headers: admin });
    const again = await seenBy(other);
    check('shop: what a sponsor who is kept out in silence had put up is shown to them alone — and to everybody again once it is lifted', toOthers?.state === 'taken' && toOthers.title === undefined && toThem?.state === 'live' && toThem.mine === true && again?.state === 'live', [toOthers, toThem?.state, again?.state]);
  }
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
  // a plaque for a companion, round the golden dog: paid once, engraved by who paid, shown once approved — and never a link
  {
    const away = { 'x-forwarded-for': '10.6.6.2' }; // (an address of its own: see above)
    stripe.asked.length = 0;
    const page = CF ? null : await post('/api/checkout', { item: 'plaque:5', device: ann }, away), form = stripe.asked[0]?.form;
    const none = CF ? [] : [await post('/api/checkout', { item: 'plaque:0', device: ann }, away), await post('/api/checkout', { item: 'plaque:73', device: ann }, away), await post('/api/checkout', { item: 'plaque:x', device: ann }, away), await post('/api/checkout', { item: 'plaque:05', device: ann }, away)];
    await hook(paid('plaque:5', ann));
    const taken = CF ? null : await post('/api/checkout', { item: 'plaque:5', device: bob }, away);
    const mine = json(await request(port, `/api/shop?device=${ann}`)), seen = json(await request(port, `/api/shop?device=${bob}`));
    const fill = await post('/api/sponsor', { slot: 'plaque:5', device: ann, title: 'Milou', subtitle: '2009 – 2024 · he loved the sea', url: 'https://evil.example/', logo: JPEG });
    const draft = json(await request(port, '/api/sponsors', { headers: admin }))?.slots?.['plaque:5']?.draft;
    const own = json(await request(port, `/api/shop?device=${ann}`)).slots['plaque:5'];
    const ownPic = await request(port, `${own?.draft?.logo || '/nowhere?x=1'}&device=${ann}`), otherPic = await request(port, `${own?.draft?.logo || '/nowhere?x=1'}&device=${bob}`);
    const notYet = json(await request(port, `/api/shop?device=${bob}`)).slots['plaque:5'];
    await post('/api/sponsors', { slot: 'plaque:5', approve: true }, admin);
    const live = json(await request(port, `/api/shop?device=${bob}`)).slots['plaque:5'], pic = await request(port, live?.logo || '/nowhere');
    // (its holder changes the words and keeps the picture: the administrator is told that the picture stays)
    const again = await post('/api/sponsor', { slot: 'plaque:5', device: ann, title: 'Milou', subtitle: 'the best of dogs', keepLogo: true });
    const keep = json(await request(port, '/api/sponsors', { headers: admin }))?.slots?.['plaque:5']?.draft;
    // (the administrator fills one in by hand: no link there either)
    const byHand = await post('/api/sponsors', { slot: 'plaque:40', set: { title: 'Félix', subtitle: 'cat of the mill', url: 'https://evil.example/' } }, admin);
    const hand = json(await request(port, '/api/shop')).slots['plaque:40'];
    check('plaques: a plate round the golden dog is paid once, at the price of the catalogue; who paid holds it and has it engraved — a name, a few words, a picture, never a link',
      mine.prices.plaque === 2000 && (CF || (page.status === 200 && form?.get('mode') === 'payment' && form.get('line_items[0][price_data][unit_amount]') === '2000' && form.get('metadata[item]') === 'plaque:5' && !form.get('line_items[0][price_data][recurring][interval]') && none.every((r) => r.status === 400) && taken.status === 409))
      && mine.slots['plaque:5']?.mine === true && seen.slots['plaque:5']?.state === 'taken' && !seen.slots['plaque:5'].mine
      && fill.status === 200 && draft?.title === 'Milou' && draft.subtitle === '2009 – 2024 · he loved the sea' && draft.url === '' && typeof draft.logo === 'string'
      && byHand.status === 200 && hand?.state === 'live' && hand.title === 'Félix' && hand.url === '',
      [page?.status, form?.toString().slice(0, 200), none.map((r) => r.status), taken?.status, mine.slots['plaque:5'], seen.slots['plaque:5'], fill.status, draft, byHand.status, hand]);
    check('plaques: nothing is engraved before it is approved — until then its picture is for its holder and the administrator only; a change of words keeps the picture, and says so',
      notYet?.state === 'taken' && !notYet.title && ownPic.status === 200 && ownPic.headers['content-type'] === 'image/jpeg' && otherPic.status === 404
      && live?.state === 'live' && live.title === 'Milou' && live.url === '' && pic.status === 200 && pic.headers['content-type'] === 'image/jpeg'
      && again.status === 200 && keep?.keep === true && keep.logo === null && keep.subtitle === 'the best of dogs',
      [notYet, ownPic.status, otherPic.status, live, pic.status, again.status, keep]);
  }
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
  // the owner takes a sponsor off an auctioned panel and gives the bid back
  const off = await request(port, '/api/sponsors?slot=board:mole&refund=1', { method: 'DELETE', headers: admin });
  const bobTold = json(await request(port, `/api/shop?device=${bob}`));
  check('auction: a sponsor the owner takes off with the money back gets the bid back; the panel is free again, from a dollar',
    off.status === 200 && json(off).removed === 'board:mole' && json(off).refunded === true && !bobTold.slots['board:mole'] && stripe.refunds.some((r) => r.pay === 'pi_bob_1') && /refunded in full/.test(bobTold.notes?.[0] || ''), [off.status, bobTold.notes, stripe.refunds.map((r) => r.pay)]);
  // taken down: nothing is given back by itself (what was shown broke the rules) — the bid that was kept is
  // written down, and the owner can still give it back later; a place paid by the month stops being paid either
  // way — and the month that is running is given back only if the owner says so
  await hook(bidPaid('board:fish', ann, 400, 'pi_ann_9'));
  const keptBid = await request(port, '/api/sponsors?slot=board:fish', { method: 'DELETE', headers: admin });
  const annKept = json(await request(port, `/api/shop?device=${ann}`));
  const keptNote = json(keptBid).refunds?.[0], nobodyRefunds = await request(port, '/api/sponsors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refund: 'pi_ann_9' }) });
  const refundedNow = !stripe.refunds.some((r) => r.pay === 'pi_ann_9');
  const later = await request(port, '/api/sponsors', { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: JSON.stringify({ refund: 'pi_ann_9' }) }), annBack = json(await request(port, `/api/shop?device=${ann}`));
  const twice = await request(port, '/api/sponsors', { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: JSON.stringify({ refund: 'pi_ann_9' }) });
  check('sponsors: taken down, a bid is kept — nothing is given back by itself; it is written down, and the owner (nobody else) can give it back later, once',
    keptNote?.pay === 'pi_ann_9' && keptNote.kept === true && keptNote.ok === false && keptNote.amount === 400 && !('by' in keptNote) && refundedNow && nobodyRefunds.status === 403
    && later.status === 200 && json(later).refunded === true && stripe.refunds.some((r) => r.pay === 'pi_ann_9') && json(later).refunds.find((r) => r.pay === 'pi_ann_9')?.ok === true && /refunded your payment in full/.test(annBack.notes?.at(-1) || '') && twice.status === 404,
    [keptNote, nobodyRefunds.status, later.status, later.body.toString().slice(0, 120), annBack.notes, twice.status]);
  await hook(paid('gondola:3', bob, 'sub_gone_1'));
  await hook(paid('gondola:4', bob, 'sub_gone_2'));
  const back = await request(port, '/api/sponsors?slot=gondola:3&refund=1', { method: 'DELETE', headers: admin }), noBack = await request(port, '/api/sponsors?slot=gondola:4', { method: 'DELETE', headers: admin });
  const bobKept = json(await request(port, `/api/shop?device=${bob}`));
  check('sponsors: the administrator takes one down — the money is kept unless the owner gives it back; a place paid by the month stops being paid either way, and its holder is told',
    keptBid.status === 200 && json(keptBid).refunded === false && !annKept.slots['board:fish'] && /took your panel down\.$/.test(annKept.notes?.at(-1) || '')
    && json(back).stopped === true && json(back).refunded === true && stripe.cancelled.includes('sub_gone_1') && stripe.refunds.some((r) => r.pay === 'pi_month_sub_gone_1')
    && json(noBack).stopped === true && json(noBack).refunded === false && stripe.cancelled.includes('sub_gone_2') && !stripe.refunds.some((r) => r.pay === 'pi_month_sub_gone_2')
    && !bobKept.slots['gondola:3'] && !bobKept.slots['gondola:4'] && /nothing more will be charged/.test((bobKept.notes || []).join(' ')),
    [keptBid.status, keptBid.body.toString().slice(0, 80), annKept.notes, back.body.toString().slice(0, 80), noBack.body.toString().slice(0, 80), stripe.cancelled, bobKept.notes]);
  // ---- the wall of thanks: the shop says what each sponsor pays — amounts only — and the wall ranks them (src/app/thanks.js)
  {
    const cara = randomId(16), far = { 'x-forwarded-for': '10.7.12.1' }, same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    await hook(bidPaid('board:geiger', cara, 700, 'pi_thanks_1'));
    await hook({ type: 'checkout.session.completed', data: { object: { id: 'cs_thanks_g20', payment_status: 'paid', subscription: 'sub_thanks_20', metadata: { item: 'gondola:20', device: cara } } } });
    const unshown = json(await request(port, '/api/shop')).slots; // (paid for, nothing shown yet: no amount either)
    const f1 = await post('/api/sponsor', { slot: 'board:geiger', device: cara, title: 'Acme Rockets', subtitle: 'To the moon, mostly', url: 'https://acme.example' }, far);
    const f2 = await post('/api/sponsor', { slot: 'gondola:20', device: cara, title: 'Otter Boats', subtitle: 'They float' }, far);
    const h1 = await post('/api/sponsors', { slot: 'gondola:21', set: { title: 'Big Spender', paid: 123400 } }, admin);
    const h2 = await post('/api/sponsors', { slot: 'gondola:22', set: { title: 'Quiet Partner' } }, admin);
    const h3 = await post('/api/sponsors', { slot: 'plaque:70', set: { title: 'Rex', subtitle: 'good boy', paid: 99900 } }, admin);
    const seen = json(await request(port, '/api/shop')).slots, kept = json(await request(port, '/api/sponsors', { headers: admin })).slots;
    check('thanks: the shop says what each sponsor pays, with what they show and not before — a bid, a month, what the administrator said was paid; nothing for a plaque, and never who pays',
      [f1, f2, h1, h2, h3].every((r) => r.status === 200) && !unshown['board:geiger']?.pays && !unshown['gondola:20']?.pays
      && same(seen['board:geiger']?.pays, { amount: 700, monthly: false, total: 700 }) && same(seen['gondola:20']?.pays, { amount: 2900, monthly: true, total: 2900 })
      && same(seen['gondola:21']?.pays, { amount: 123400, monthly: false, total: 123400 }) && seen['gondola:22']?.state === 'live' && seen['gondola:22'].pays === undefined
      && seen['plaque:70']?.state === 'live' && seen['plaque:70'].pays === undefined && kept['gondola:21']?.paid === 123400
      && ['board:geiger', 'gondola:20', 'gondola:21'].every((id) => ['by', 'sub', 'pay', 'at', 'paid'].every((k) => !(k in seen[id]))),
      [[f1, f2, h1, h2, h3].map((r) => r.status), unshown['board:geiger'], seen['board:geiger'], seen['gondola:20'], seen['gondola:21'], seen['gondola:22'], seen['plaque:70'], kept['gondola:21']]);
    const wall = rankSponsors(seen, { geiger: 'Geiger Says' }).filter((r) => ['Acme Rockets', 'Otter Boats', 'Big Spender', 'Quiet Partner', 'Rex'].includes(r.name));
    check('thanks: the wall ranks them by what each has put in, the most first — a month is said as a month, who is not known to pay comes last, and the plaques are not on it',
      wall.map((r) => r.name).join() === 'Big Spender,Otter Boats,Acme Rockets,Quiet Partner' && wall[0].figure === '$1,234' && wall[0].where === 'Gondola 21'
      && wall[1].figure === '$29' && wall[1].unit === 'a month' && wall[1].where === 'Gondola 20' && wall[1].tagline === 'They float'
      && wall[2].figure === '$7' && wall[2].unit === '' && wall[2].where === 'Geiger Says' && wall[3].figure === '' && wall[3].note === 'partner of the fair',
      wall);
    // (the places are given back)
    await hook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_thanks_20' } } });
    for (const id of ['board:geiger', 'gondola:21', 'gondola:22', 'plaque:70']) await request(port, `/api/sponsors?slot=${id}`, { method: 'DELETE', headers: admin });
  }
  // ---- a gondola for good: the same place, paid once instead of by the month — the buyer's choice (catalog.js: forLife)
  {
    const eve = randomId(16), far = { 'x-forwarded-for': '10.7.13.1' }, same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    stripe.asked.length = 0;
    const page = CF ? null : await post('/api/checkout', { item: 'gondola:15', device: eve, life: true }, far), form = stripe.asked[0]?.form;
    // (what is only held by the month is not sold for good. Asking for a payment page is counted by address, and
    // the local runtime of Cloudflare sees one address for the whole test: there, as above, it is not asked)
    const noLife = CF ? null : await post('/api/checkout', { item: 'tarp:shoot', device: eve, life: true }, far), noPass = CF ? null : await post('/api/checkout', { item: 'pass', device: eve, life: true }, far);
    await hook({ type: 'checkout.session.completed', data: { object: { id: 'cs_life_g15', payment_status: 'paid', subscription: null, customer: 'cus_life_15', amount_total: 19900, metadata: { item: 'gondola:15', device: eve, life: '1' } } } });
    const mine = json(await request(port, `/api/shop?device=${eve}`)).slots['gondola:15'];
    // (its banner is put up by the administrator here: what a holder may send is counted by address too — the holder's own way is played in the browser, tools/shop-test.mjs)
    const filled = await post('/api/sponsors', { slot: 'gondola:15', set: { title: 'For Good Inc', subtitle: 'Paid once' } }, admin);
    const shown = json(await request(port, '/api/shop')).slots['gondola:15'];
    // (nobody else can take it, by the month or for good; and a subscription that ends somewhere takes nothing back)
    const taken = CF ? null : await post('/api/checkout', { item: 'gondola:15', device: randomId(16), life: true }, { 'x-forwarded-for': '10.7.13.2' }), rented = CF ? null : await post('/api/checkout', { item: 'gondola:15', device: randomId(16) }, { 'x-forwarded-for': '10.7.13.3' });
    await hook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_of_nobody' } } });
    const still = json(await request(port, '/api/shop')).slots, wall = rankSponsors(still, {}).find((r) => r.name === 'For Good Inc'), prices = json(await request(port, '/api/shop')).prices;
    const mail = sponsorMail('https://fair.example', 'Eve', { place: 'gondola 15 of the big wheel', cents: 19900, life: true }).text;
    check('shop: a gondola may be bought for good — one payment of $199, no subscription — where a backdrop or the Game Pass may not; it is its buyer\'s with nothing to look after, nobody else can take it, no subscription that ends takes it back, the wall of thanks says what was paid, the word of thanks says it is for good',
      (CF || (page.status === 200 && form?.get('mode') === 'payment' && form.get('line_items[0][price_data][unit_amount]') === '19900' && form.get('line_items[0][price_data][recurring][interval]') === null && form.get('metadata[item]') === 'gondola:15' && form.get('metadata[life]') === '1' && /gondola 15 of the big wheel, for good$/.test(form.get('line_items[0][price_data][product_data][name]'))))
      && (CF || (noLife.status === 400 && noPass.status === 400 && taken.status === 409 && rented.status === 409)) && mine?.mine === true && mine.life === true && !mine.manage && filled.status === 200
      && shown?.state === 'live' && same(shown.pays, { amount: 19900, monthly: false, total: 19900 }) && !('life' in shown) && still['gondola:15']?.state === 'live'
      && wall?.figure === '$199' && wall.unit === '' && prices.gondola === 2900 && prices.gondolaLife === 19900 && /yours for good/.test(mail) && /\$199\)/.test(mail) && !/a month/.test(mail.split('\n')[2]),
      [page?.status, form && Object.fromEntries(form), noLife?.status, noPass?.status, mine, shown?.pays, taken?.status, rented?.status, wall?.figure, prices.gondolaLife]);
    await request(port, '/api/sponsors?slot=gondola:15', { method: 'DELETE', headers: admin });
  }
  // ---- a beach hut: the panel on its roof, by the month or for good — half what a gondola costs (catalog.js)
  {
    const fay = randomId(16), gus = randomId(16), same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    stripe.asked.length = 0;
    const month = CF ? null : await post('/api/checkout', { item: 'hut:4', device: fay }, { 'x-forwarded-for': '10.7.14.1' }), monthForm = stripe.asked[0]?.form;
    stripe.asked.length = 0;
    const once = CF ? null : await post('/api/checkout', { item: 'hut:12', device: gus, life: true }, { 'x-forwarded-for': '10.7.14.2' }), lifeForm = stripe.asked[0]?.form;
    const nowhere = CF ? null : await post('/api/checkout', { item: 'hut:27', device: fay }, { 'x-forwarded-for': '10.7.14.3' });
    await hook({ type: 'checkout.session.completed', data: { object: { id: 'cs_hut_4', payment_status: 'paid', subscription: 'sub_hut_4', customer: 'cus_hut_4', amount_total: 1450, metadata: { item: 'hut:4', device: fay } } } });
    await hook({ type: 'checkout.session.completed', data: { object: { id: 'cs_hut_12', payment_status: 'paid', subscription: null, customer: 'cus_hut_12', amount_total: 9950, metadata: { item: 'hut:12', device: gus, life: '1' } } } });
    const held = json(await request(port, `/api/shop?device=${fay}`)).slots['hut:4'], mine = json(await request(port, `/api/shop?device=${gus}`)).slots['hut:12'];
    // (nobody else can take the one bought for good)
    const taken = CF ? null : await post('/api/checkout', { item: 'hut:12', device: randomId(16), life: true }, { 'x-forwarded-for': '10.7.14.4' });
    const set4 = await post('/api/sponsors', { slot: 'hut:4', set: { title: 'Sandy Toes Surf School', subtitle: 'lessons at low tide' } }, admin);
    const set12 = await post('/api/sponsors', { slot: 'hut:12', set: { title: 'Forever Sandals' } }, admin);
    const all = json(await request(port, '/api/shop')), wall = rankSponsors(all.slots, {}), sand = wall.find((r) => r.name === 'Sandy Toes Surf School'), sandals = wall.find((r) => r.name === 'Forever Sandals');
    // (the one held by the month ends with its subscription; the one bought for good stays)
    await hook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_hut_4' } } });
    const after = json(await request(port, '/api/shop')).slots;
    check('shop: a beach hut is sponsored like a gondola, for half its price — $14.50 a month on a subscription, or $99.50 once and for good —, from 1 to 26; the one bought for good is nobody else\'s, the one held by the month ends with its subscription; the wall of thanks says which hut and how each pays',
      (CF || (month.status === 200 && monthForm?.get('mode') === 'subscription' && monthForm.get('line_items[0][price_data][unit_amount]') === '1450' && monthForm.get('line_items[0][price_data][recurring][interval]') === 'month' && monthForm.get('metadata[item]') === 'hut:4'
        && once.status === 200 && lifeForm?.get('mode') === 'payment' && lifeForm.get('line_items[0][price_data][unit_amount]') === '9950' && lifeForm.get('line_items[0][price_data][recurring][interval]') === null && lifeForm.get('metadata[item]') === 'hut:12' && lifeForm.get('metadata[life]') === '1' && /beach hut 12 by the pier, for good$/.test(lifeForm.get('line_items[0][price_data][product_data][name]'))
        && nowhere.status === 400 && taken.status === 409))
      && held?.mine === true && !held.life && mine?.mine === true && mine.life === true && !mine.manage && set4.status === 200 && set12.status === 200
      && same(all.slots['hut:4']?.pays, { amount: 1450, monthly: true, total: 1450 }) && same(all.slots['hut:12']?.pays, { amount: 9950, monthly: false, total: 9950 }) && all.prices.hut === 1450 && all.prices.hutLife === 9950
      && sand?.figure === '$14.50' && sand.unit === 'a month' && sand.places.join() === 'Beach hut 4' && sandals?.figure === '$99.50' && sandals.unit === '' && sandals.places.join() === 'Beach hut 12'
      && !after['hut:4'] && after['hut:12']?.state === 'live',
      [month?.status, monthForm && Object.fromEntries(monthForm), once?.status, lifeForm && Object.fromEntries(lifeForm), nowhere?.status, taken?.status, held, mine, all.slots['hut:4']?.pays, all.slots['hut:12']?.pays, sand, sandals, after['hut:4'], after['hut:12']?.state]);
    await request(port, '/api/sponsors?slot=hut:12', { method: 'DELETE', headers: admin });
  }
}
// Accounts: nobody needs one; whoever signs in keeps what they bought, their days in a row and their look,
// from one browser to the next.
// ------------------------------------------------------------------------- what was said, kept a while (chatlog.js)
async function testChatLog({ port }) {
  const json = (res) => { try { return JSON.parse(res.body.toString()); } catch { return null; } };
  const read = (query = '', key = ADMIN_KEY, method = 'GET') => request(port, `/api/chatlog${query}`, { method, headers: key ? { authorization: `Bearer ${key}` } : {} });
  const a = new Client(port, 'talk'), b = new Client(port, 'talk');
  await a.hello('Ada Talks', 1);
  await b.hello('Bob Talks', 2);
  a.send({ t: 'c', m: 'Hello <b>everybody</b>' });
  await b.wait((m) => m.t === 'c' && /Hello/.test(m.m));
  b.send({ t: 'c', m: 'psst, over here', n: 1 });
  // (on the Cloudflare server a room hands its lines to the notebook a moment later)
  let got = null;
  for (let i = 0; i < 40 && !got; i++) { const r = json(await read()); if (r?.lines?.[0]?.text === 'psst, over here') got = r; else await sleep(250); }
  const nobody = await read('', ''), page = json(await read('?limit=1')), older = page?.lines?.[0] ? json(await read(`?limit=5&before=${page.lines[0].n}`)) : null;
  const wiped = await read('', ADMIN_KEY, 'DELETE'), after = json(await read());
  a.ws.close(); b.ws.close();
  check('chat log: what is said in a room — to everybody, to who stands nearby — is kept for the administrators, the newest first, with who said it, where, to whom and when; nobody else reads it; it is read page by page; the owner empties it',
    !!got && got.lines[0].to === 'nearby' && got.lines[0].name === 'Bob Talks' && got.lines[0].room === 'talk' && got.lines[1].to === 'everyone' && got.lines[1].name === 'Ada Talks' && got.lines[1].text === 'Hello <b>everybody</b>'
    && Math.abs(got.lines[1].t - Date.now()) < 120000 && got.keeps?.days === 14 && got.keeps.lines === 5000 && nobody.status === 403 && page?.lines?.length === 1 && page.more === true && older?.lines?.[0]?.name === 'Ada Talks'
    && wiped.status === 200 && after?.lines?.length === 0,
    [got?.lines?.slice(0, 2), nobody.status, page, older?.lines?.[0], wiped.status, after]);
}

// ------------------------------------------------------------- back from the payment page (no webhook needed); a new sponsor
async function testPaid({ port }) {
  const json = (res) => { try { return JSON.parse(res.body.toString()); } catch { return null; } };
  // (from an address of its own: these calls do not count against what the other checks may ask)
  const post = (target, body) => request(port, target, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), from: '127.0.0.80' });
  const owned = async (device) => json(await request(port, `/api/shop?device=${device}`));
  const pay = (id) => Object.assign(stripe.sessions[id], { status: 'complete', payment_status: 'paid' });
  const cat = randomId(16);
  stripe.asked.length = 0;
  const page = await post('/api/checkout', { item: 'hat:beanie', device: cat }), id = `cs_test_${stripe.asked.length}`, back = stripe.asked[stripe.asked.length - 1]?.form.get('success_url') || '';
  const early = await post('/api/checkout/confirm', { session: id });
  pay(id);
  const done = await post('/api/checkout/confirm', { session: id }), has = (await owned(cat)).owned, again = await post('/api/checkout/confirm', { session: id });
  const none = await post('/api/checkout/confirm', { session: 'cs_test_9999' }), junk = await post('/api/checkout/confirm', { session: '../../etc' });
  check('paid, without Stripe having to say so: the payment page comes back with its name in the address; asked, the server asks Stripe — not paid yet: nothing; paid: what was bought is given, once; a page that does not exist gives nothing',
    page.status === 200 && /[?&]cs=\{CHECKOUT_SESSION_ID\}/.test(back) && /[?&]paid=hat%3Abeanie/.test(back) && json(early)?.ok === false && json(done)?.ok === true && json(done).given === true && json(done).item === 'hat:beanie'
    && has.join() === 'hat:beanie' && json(again)?.ok === true && none.status === 404 && junk.status === 404, [page.status, back, json(early), json(done), has, json(again), none.status, junk.status]);
  // a sponsor: what the panel shows goes up right after the payment, the whole fair is told — by name —, and the sponsor is thanked by e-mail
  const ear = new Client(port, 'main');
  await ear.hello('Ear', 1);
  const dog = randomId(16);
  stripe.asked.length = 0;
  const bidPage = await post('/api/checkout', { item: 'board:cups', device: dog, bid: 700 }), bid = `cs_test_${stripe.asked.length}`;
  pay(bid);
  const took = await post('/api/checkout/confirm', { session: bid }), mine = (await owned(dog)).slots['board:cups'];
  const filled = await post('/api/sponsor', { slot: 'board:cups', device: dog, title: 'Acme Robots', subtitle: 'quel connard, ce robot', url: 'https://example.org/acme' });
  const heard = await ear.wait((m) => m.t === 'say' && /Acme Robots/.test(m.m), 4000), shown = (await owned(randomId(16))).slots['board:cups'];
  const changed = await post('/api/sponsor', { slot: 'board:cups', device: dog, title: 'Acme Robots Inc', subtitle: 'robots, mostly', url: 'https://example.org/acme' });
  await sleep(400);
  const cheers = ear.msgs.filter((m) => m.t === 'say' && /Acme/.test(m.m)).length;
  ear.ws.close();
  const mails = CF || !fs.existsSync(MAIL_FILE) ? null : fs.readFileSync(MAIL_FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((m) => m.to === 'buyer@example.org' && /^You sponsor the board of Shell Shock/.test(m.subject));
  check('a new sponsor: the bid is taken as they come back; what their panel says goes up at once — without the words the chat hides —; the whole fair is told once, by name, with due praise; changing the panel later says nothing; the sponsor is thanked by e-mail',
    bidPage.status === 200 && json(took)?.given === true && mine?.mine === true && filled.status === 200 && json(filled).state === 'live' && shown?.title === 'Acme Robots' && shown.subtitle === 'quel ********, ce robot' && shown.url === 'https://example.org/acme'
    && /Acme Robots/.test(heard?.m || '') && /the board of Shell Shock/.test(heard.m) && /gods of the (Atomic|nuclear) [Oo]asis/.test(heard.m) && changed.status === 200 && cheers === 1 && (mails === null || (mails.length === 1 && /\$7/.test(mails[0].text) && /refunded in full/.test(mails[0].text))),
    [bidPage.status, json(took), mine, filled.status, shown, heard, cheers, mails?.map((m) => m.subject)]);
  // a big attraction has five places on its panel, each an auction of its own; a stall of the pier has one
  const second = await post('/api/checkout', { item: 'board:sky-2', device: dog, bid: 500 }), secondId = `cs_test_${stripe.asked.length}`, sixth = await post('/api/checkout', { item: 'board:sky-6', device: dog, bid: 500 }), stall = await post('/api/checkout', { item: 'board:cups-2', device: dog, bid: 500 });
  pay(secondId);
  const tookSecond = await post('/api/checkout/confirm', { session: secondId }), places = (await owned(dog)).slots;
  check('five places on the panel of a big attraction: "board:sky-2" is bid for and taken like any panel — beside the first, which stays free —, there is no sixth, and a stall of the pier has only one',
    second.status === 200 && sixth.status === 400 && stall.status === 400 && json(tookSecond)?.given === true && places['board:sky-2']?.mine === true && places['board:sky-2'].bid === 500 && !places['board:sky'],
    [second.status, sixth.status, stall.status, json(tookSecond), places['board:sky-2'], places['board:sky']]);
  // the site of a sponsor, opened from the game, is counted on its place — the same address once in a while — and added up for the sponsor
  const click = (slot, from) => request(port, '/api/click', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slot }), from });
  const c1 = json(await click('board:cups', '127.0.0.80')), c2 = json(await click('board:cups', '127.0.0.80')), c3 = json(await click('board:cups', '127.0.0.81')), nope = await click('board:nope', '127.0.0.81');
  const { rankSponsors } = await import('../src/app/thanks.js');
  const row = rankSponsors((await owned(randomId(16))).slots, { cups: 'Shell Shock' }).find((r) => r.name === 'Acme Robots Inc');
  check('clicks: the site of a sponsor opened from the game is counted on its place — the same address only once in ten minutes —, nothing is counted for a place that has no site; the wall of thanks adds them up for the sponsor, with its site in a few letters',
    c1?.clicks === 1 && c2?.clicks === 1 && c3?.clicks === 2 && nope.status === 404 && row?.clicks === 2 && row.site === 'example.org' && row.first === 'board:cups' && row.figure === '$7', [c1, c2, c3, nope.status, row]);
}

// ------------------------------------------------------------- what may not be said, nor worn as a name (decency.js)
async function testDecency({ port }) {
  const { maskChat, nameOk } = await import('../server/decency.js');
  const json = (res) => { try { return JSON.parse(res.body.toString()); } catch { return null; } };
  // (the rules themselves, on examples mild enough to be written here — the list is fingerprints only)
  const says = [['fuck, that was close', 0], ['putain de merde', 0], ['wtf damn shit bordel', 0], ['fuck you', 1], ['Go FUCK yourself!', 1], ['shut the fuck up', 1], ['quel connard', 1], ['bande de c0nnards', 1], ['coooonnard', 1], ['kys', 1], ['ferme ta gueule', 1],
    ['see www.example.com now', 1], ['http://example.org/x', 1], ['cheap gold at example.com/buy', 1], ['join discord.gg/abcd', 1], ['so.fun, this game', 0], ['I was late. Top score though', 0], ['dispute, computer, salopette, en retard', 0], ['3.5 km/h', 0]];
  const wrong = says.filter(([line, hides]) => (maskChat(line) !== line) !== !!hides).map(([line]) => line);
  const names = [['Ada', 1], ['Visitor 42', 1], ['Computer', 1], ['Dr. No', 1], ['R2-D2', 1], ['L\u00e9a', 1], ['bob@home', 0], ['www.example', 0], ['example.com', 0], ['Https', 0], ['Fuck', 0], ['M e r d e', 0], ['xXconnardXx', 0], ['Sh1t', 0]];
  const wrongNames = names.filter(([n, ok]) => nameOk(n) !== !!ok).map(([n]) => n);
  check('decency: plain swearing passes in the chat; a strong insult, a threat, a slur — in the plural, spelt with digits, its letters stretched — and the address of a site are hidden; a name holds no @, no address, no insult, no swear word; ordinary words and names are left alone',
    wrong.length === 0 && wrongNames.length === 0 && maskChat('quel connard, va voir example.com') === 'quel ********, va voir ********', [wrong, wrongNames]);
  // through the relay: the others read the line with its words hidden — the administrators' log keeps it as it was typed;
  // a name that may not be worn is not: its bearer is told, and is a visitor; an account cannot be called that either
  const a = new Client(port, 'polite'), b = new Client(port, 'polite');
  await a.hello('Ada Polite', 1);
  await b.hello('Bob Polite', 2);
  a.send({ t: 'c', m: 'gg — fuck you, see example.com' });
  const heard = await b.wait((m) => m.t === 'c');
  const c = new Client(port, 'polite');
  await c.hello('xXconnardXx', 3);
  const told = await c.wait((m) => m.t === 'name');
  const joined = await b.wait((m) => m.t === 'join' && m.id === c.id);
  let line = null;
  for (let i = 0; i < 40 && !line; i++) { const r = json(await request(port, '/api/chatlog', { headers: { authorization: `Bearer ${ADMIN_KEY}` } })); line = r?.lines?.find((l) => /see example/.test(l.text)) || null; if (!line) await sleep(250); }
  const made = await request(port, '/api/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create', device: randomId(16), name: 'Connard 12', password: 'a good password' }), from: '127.0.0.79' });
  for (const x of [a, b, c]) x.ws.close();
  check('decency, through the relay: the others read a line with its insult and its address hidden, the log of the administrators keeps it as typed and says so; a name that may not be worn is refused — its bearer is told and is a visitor; no account is called that',
    heard?.m === 'gg — ********, see ********' && told?.rude === 1 && /^Visitor \d+$/.test(told.name) && joined?.name === told.name && line?.text === 'gg — fuck you, see example.com' && line.filtered === true
    && made.status === 400 && /cannot be worn/.test(json(made)?.error || ''), [heard, told, joined?.name, line, made.status, json(made)]);
}

// ------------------------------------------------------------- a thing one steers in a game (a boat): {t:'v'}
async function testThings({ port }) {
  const a = new Client(port, 'pondside'), b = new Client(port, 'pondside'), far = new Client(port, 'pondside');
  await a.hello('Skipper A', 1);
  await b.hello('Skipper B', 2);
  await far.hello('Far Away', 3);
  a.send({ t: 's', p: [0, 10, 0, 0], a: 0 });
  b.send({ t: 's', p: [30, 10, 0, 0], a: 0 });
  far.send({ t: 's', p: [400, 10, 0, 0], a: 0 });
  await sleep(400);
  a.send({ t: 'v', k: 1, n: 17955, d: [12.3456, -7.891, 0.5, 6, 120.4, 2, 31000, 0] });
  const got = await b.wait((m) => m.t === 'v');
  // (what has not the shape of one is not handed on)
  for (const bad of [{ t: 'v', k: 99, n: 1, d: [1] }, { t: 'v', k: 1, n: -1, d: [1] }, { t: 'v', k: 1, n: 1, d: [] }, { t: 'v', k: 1, n: 1, d: [1, 2, 3, 4, 5, 6, 7, 8, 9] }, { t: 'v', k: 1, n: 1, d: [1e9] }, { t: 'v', k: 1, n: 1, d: ['x'] }]) a.send(bad);
  // (a flood: a few get through, the rest are dropped)
  for (let i = 0; i < 40; i++) a.send({ t: 'v', k: 1, n: 2, d: [i] });
  await sleep(600);
  const all = b.msgs.filter((m) => m.t === 'v'), flood = all.filter((m) => m.n === 2).length, bads = all.filter((m) => m.n === 1 || m.n === -1 || m.k === 99).length, farGot = far.msgs.filter((m) => m.t === 'v').length;
  a.ws.close(); b.ws.close(); far.ws.close();
  check('a thing one steers in a game — a boat of the regatta — is handed on to those near enough, carried to the hundredth, with whose it is; what has not its shape is not; a flood is cut to a few a second; who is far away is told nothing',
    got?.id === a.id && got.k === 1 && got.n === 17955 && JSON.stringify(got.d) === '[12.35,-7.89,0.5,6,120.4,2,31000,0]' && bads === 0 && flood >= 1 && flood <= 14 && farGot === 0, [got, bads, flood, farGot]);
}

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
  // the name of an account is its owner's alone, in the world too: somebody else who takes it is given a visitor's
  // name and told; who is signed in to the account wears it; a name kept for visitors makes no account
  {
    const thief = new Client(port, 'names', { dev: b }), owner = new Client(port, 'names', { dev: a });
    await thief.hello(who.toUpperCase(), 1, b);
    const told = await thief.wait((m) => m.t === 'name'), seenAs = thief.msgs.find((m) => m.t === 'welcome');
    await owner.hello(who, 2, a);
    const ownerTold = owner.msgs.find((m) => m.t === 'name'), card = seenAs && (owner.msgs.find((m) => m.t === 'welcome')?.peers || []).find((q) => q.id === thief.id);
    thief.send({ t: 'hello', name: who, color: 1, v: 2, dev: b });
    const again = await thief.wait((m) => m.t === 'name' && m !== told, 1500);
    thief.ws.close(); owner.ws.close();
    // (asked from an address of its own, on either server: it does not count against what the checks below may try)
    const kept = await request(port, '/api/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create', device: randomId(16), name: 'Visitor 42', password: 'correct horse' }), from: '127.0.0.78' });
    check('accounts: the name of an account is reserved — somebody else who takes it in the world is given a visitor\'s name and told, at the door and on changing name; its owner wears it; "Visitor 42" makes no account',
      told?.taken === cleanName(who.toUpperCase()) && /^Visitor \d+$/.test(told.name) && card?.name === told.name && !ownerTold && again?.taken === who && again.name === told.name && kept.status === 400,
      [told, card, ownerTold, again, kept.status]);
  }
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
  // e-mails: where the host can send some, an account may carry an address, and a code to set a new password is mailed there
  const says = json(await request(port, '/api/status'));
  if (!CF) {
    const from = (k) => ({ 'x-forwarded-for': `10.7.9.${k}` }); // (addresses of their own: see above)
    const c = randomId(16), d = randomId(16), bob = `Bob ${randomId(3).replace(/[^A-Za-z0-9]/g, 'x')}`;
    const outbox = () => (fs.existsSync(MAIL_FILE) ? fs.readFileSync(MAIL_FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
    const badMail = await acct({ action: 'create', device: c, name: bob, password: 'correct horse', email: 'not an address' }, from(1));
    const madeB = await acct({ action: 'create', device: c, name: bob, password: 'correct horse', email: '  Bob@Example.ORG ' }, from(1));
    // (the welcome leaves while the answer is given: it is waited for, so that what follows counts from there)
    await until(() => outbox().some((m) => m.to === 'bob@example.org' && /^Welcome/.test(m.subject)));
    const start = outbox().length;
    const unknown = await acct({ action: 'mailcode', device: d, name: 'Nobody Here' }, from(2)), noAddress = await acct({ action: 'mailcode', device: d, name: who }, from(2));
    const asked1 = await acct({ action: 'mailcode', device: d, name: bob.toUpperCase() }, from(2)), asked2 = await acct({ action: 'mailcode', device: d, name: bob }, from(2));
    const box = outbox().slice(start), mail = box[0], code = /Your code: ([A-Z2-9-]{14})/.exec(mail?.text || '')?.[1] || 'none';
    const wrongCode = await acct({ action: 'reset', device: d, name: bob, code: 'AAAA-BBBB-CCCC', password: 'mailed new one' }, from(3));
    const byMail = await acct({ action: 'reset', device: d, name: bob, code: code.toLowerCase(), password: 'mailed new one' }, from(3));
    const twice = await acct({ action: 'reset', device: randomId(16), name: bob, code, password: 'and another one' }, from(3));
    const byRecovery = await acct({ action: 'reset', device: d, name: bob, code: json(madeB)?.recovery, password: 'by the first code' }, from(3));
    check('e-mail: an account may carry an address (never shown whole); asked for, a code is mailed there — the same answer whatever the name, one message at a time — and sets a new password, once; the recovery code still works',
      says.mail === true && badMail.status === 400 && madeB.status === 200 && json(madeB).account.email === 'b•••@e•••.org' && !madeB.body.toString().includes('bob@example.org')
      && unknown.status === 200 && noAddress.status === 200 && asked1.status === 200 && asked2.status === 200 && unknown.body.toString() === asked1.body.toString()
      && box.length === 1 && mail.to === 'bob@example.org' && /Atomic Oasis/.test(mail.subject) && code.length === 14 && mail.html.includes(code) && !/password: |correct horse/.test(mail.text)
      && wrongCode.status === 403 && byMail.status === 200 && twice.status === 403 && byRecovery.status === 200,
      [says, badMail.status, madeB.status, json(madeB)?.account, [unknown.status, noAddress.status, asked1.status, asked2.status], box.length, mail && { to: mail.to, subject: mail.subject }, wrongCode.status, byMail.status, twice.status, byRecovery.status]);
    // the address is changed — or taken away — from a browser that is signed in, with the password
    const noPw = await acct({ action: 'email', device: d, email: 'new@example.org', password: 'not the password' }, from(4));
    const changed = await acct({ action: 'email', device: d, email: 'New@Example.org', password: 'by the first code' }, from(4));
    const stranger = await acct({ action: 'email', device: randomId(16), email: 'evil@example.org', password: 'by the first code' }, from(4));
    const removed = await acct({ action: 'email', device: d, email: '', password: 'by the first code' }, from(4));
    const before2 = outbox().length;
    const afterGone = await acct({ action: 'mailcode', device: d, name: bob }, from(5));
    check('e-mail: the address of an account is changed, or taken away, from a browser that is signed in and with the password; once it is gone no code is mailed',
      noPw.status === 403 && changed.status === 200 && json(changed).account.email === 'n•••@e•••.org' && stranger.status === 403 && removed.status === 200 && json(removed).account.email === undefined && afterGone.status === 200 && outbox().length === before2,
      [noPw.status, changed.status, json(changed)?.account, stranger.status, removed.status, json(removed)?.account, afterGone.status, outbox().length - before2]);
    // ---- the two messages in the colours of the fair: a welcome to whoever makes an account with an address, a word
    // of thanks to whoever takes the Game Pass — once each, and only where there is an address
    {
      const to = (addr, re) => outbox().filter((m) => m.to === addr && re.test(m.subject)), WELCOME = /^Welcome to Atomic Oasis/, THANKS = /^Your Game Pass is on/;
      // (a twin in plain text; tables and inline styles; nothing fetched from anywhere, and no link but to the game)
      const sober = (m) => !!m && m.text.length > 200 && /<table/.test(m.html) && !/<img|<script|<link|<iframe|url\(|@import|src=/i.test(m.html) && [...m.html.matchAll(/href="([^"]*)"/g)].every((h) => h[1] === `http://127.0.0.1:${port}`);
      const eve = `Eve ${randomId(3).replace(/[^A-Za-z0-9]/g, 'x')}`, [e1, e2, e3, e4] = [randomId(16), randomId(16), randomId(16), randomId(16)], before = outbox().length;
      const bare = await acct({ action: 'create', device: e2, name: `${eve} b`, password: 'correct horse' }, from(21));
      const madeE = await acct({ action: 'create', device: e1, name: eve, password: 'correct horse', email: 'Eve@Example.org' }, from(22));
      await until(() => to('eve@example.org', WELCOME).length > 0);
      await sleep(120);
      const hello = to('eve@example.org', WELCOME), sent = outbox().length - before;
      check('e-mail: whoever makes an account with an address is welcomed, once, in the colours of the fair — with a twin in plain text and nothing fetched from anywhere; an account without an address gets nothing',
        bare.status === 200 && madeE.status === 200 && hello.length === 1 && sent === 1 && to('bob@example.org', WELCOME).length === 1
        && hello[0].subject === `Welcome to Atomic Oasis, ${eve}` && hello[0].text.includes(`Welcome to Atomic Oasis, ${eve}!`) && /Forgot the password/.test(hello[0].text) && /No newsletter, no tracking/.test(hello[0].text)
        && hello[0].html.includes(`Welcome, ${eve}!`) && sober(hello[0]),
        [bare.status, madeE.status, hello.length, sent, hello[0]?.subject, sober(hello[0]), hello[0]?.html.length]);
      const pass = (id, device, more = {}) => ({ type: 'checkout.session.completed', data: { object: { id, payment_status: 'paid', amount_total: 1900, subscription: `sub_${id}`, customer: `cus_${id}`, metadata: { item: 'pass', device }, ...more } } });
      await hook(pass('cs_mail_1', e1));
      await until(() => to('eve@example.org', THANKS).length > 0);
      await hook(pass('cs_mail_1', e1)); // (Stripe says it twice)
      await hook(pass('cs_mail_2', e3, { customer_details: { email: ' Guest@Example.org ' } })); // (no account: the address given at the payment)
      await hook(pass('cs_mail_3', e4)); // (no account, no address)
      await until(() => to('guest@example.org', THANKS).length > 0);
      await sleep(150);
      const thanks = to('eve@example.org', THANKS), guest = to('guest@example.org', THANKS), all = outbox().filter((m) => THANKS.test(m.subject));
      const held = [e1, e3, e4].map((dev) => request(port, `/api/shop?device=${dev}`)), passes = (await Promise.all(held)).map((r) => !!json(r).pass);
      check('e-mail: whoever takes the Game Pass is thanked once — at the address of their account or, failing that, the one given at the payment — and told what it gives and how to stop it; twice from Stripe is once here, and without an address nothing leaves',
        passes.every(Boolean) && thanks.length === 1 && guest.length === 1 && all.length === 2
        && thanks[0].text.startsWith(`Thank you, ${eve}!`) && GAME_PASS.perks.every((p) => thanks[0].text.includes(p)) && /Look after it, or stop it/.test(thanks[0].text) && /\$19 a month/.test(thanks[0].text) && sober(thanks[0])
        && guest[0].text.startsWith('Thank you!') && /make an account/.test(guest[0].text) && sober(guest[0]),
        [passes, thanks.length, guest.length, all.map((m) => m.to), thanks[0]?.subject, sober(thanks[0]), sober(guest[0])]);
    }
  } else {
    check('e-mail: a host that cannot send any says so (the game then asks nobody for an address)', says.mail === false, says);
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
  {
    // (what a sponsor pays, for the wall of thanks: server/shop.js paysOf)
    const day = 86_400_000, t0 = 1_700_000_000_000, same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    check('shop logic: what a sponsor has put in — a place held by the month counts every month begun, a bid what was bid, a place filled by hand what the administrator said; a plaque is no sponsor\'s',
      same(paysOf('gondola:3', { sub: 'sub_x', at: t0 }, t0 + 65 * day), { amount: 2900, monthly: true, total: 8700 }) && paysOf('gondola:3', { sub: 'sub_x', at: t0 }, t0 + day).total === 2900
      && same(paysOf('board:sky', { bid: 500, pay: 'pi_x' }, t0), { amount: 500, monthly: false, total: 500 }) && paysOf('board:sky', { by: 'admin' }, t0) === null
      && paysOf('tarp:shoot', { paid: 5000 }, t0)?.total === 5000 && paysOf('plaque:3', { paid: 2000, sub: 'sub_y' }, t0) === null && paysOf('nothing:1', { paid: 1 }, t0) === null,
      [paysOf('gondola:3', { sub: 'sub_x', at: t0 }, t0 + 65 * day), paysOf('board:sky', { bid: 500, pay: 'pi_x' }, t0), paysOf('tarp:shoot', { paid: 5000 }, t0)]);
  }
  {
    // (a beach hut: a place of its own, by the month or for good, for half what a gondola costs — server/catalog.js)
    const day = 86_400_000, t0 = 1_700_000_000_000, same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    const h7 = describeItem('hut:7'), life = forLife(h7), p = publicPrices(), month = paysOf('hut:7', { sub: 'sub_h', at: t0 }, t0 + 40 * day);
    check('shop logic: a beach hut is a place of its own — twenty-six of them, $14.50 a month or $99.50 once, half what a gondola costs —; its name says which; what it puts in counts on the wall of thanks, where it is "Beach hut 7"',
      h7?.kind === 'slot' && h7.amount === 1450 && h7.monthly === true && h7.name === 'Atomic Oasis — beach hut 7 by the pier' && describeItem('hut:26')?.amount === 1450
      && ['hut:0', 'hut:27', 'hut:07', 'hut:x', 'hut', 'hut:1:2', 'hut:-1'].every((id) => describeItem(id) === null)
      && life?.amount === 9950 && life.monthly === false && life.life === true && life.name === 'Atomic Oasis — beach hut 7 by the pier, for good'
      && PRICES.hut * 2 === PRICES.gondola && PRICES.hutLife * 2 === PRICES.gondolaLife && p.hut === 1450 && p.hutLife === 9950 && !('room' in p) && !('board' in p)
      && same(month, { amount: 1450, monthly: true, total: 2900 }) && same(paysOf('hut:7', { paid: 9950 }, t0), { amount: 9950, monthly: false, total: 9950 }) && placeWords('hut:7') === 'Beach hut 7',
      [h7, life, p.hut, p.hutLife, month]);
  }
  check('shop logic: text is one short line without markup; links are https and carry no name or password',
    cleanText('  <b>Hello</b>\n\tworld\u0000 ', 20) === 'b Hello /b world' && cleanText('x'.repeat(99), 28).length === 28 && cleanUrl('https://example.com/a?b=1') === 'https://example.com/a?b=1' && ['http://example.com', 'javascript:alert(1)', 'data:text/html,x', 'https://user:pw@example.com', 'https://localhost', 'ftp://example.com', ''].every((u) => cleanUrl(u) === ''), [cleanText('  <b>Hello</b>\n\tworld\u0000 ', 20)]);
  check('shop logic: a picture is told by its bytes — PNG, JPEG, WebP; never SVG, HTML, GIF, or something too large',
    cleanLogo(PNG)?.type === 'image/png' && cleanLogo(JPEG)?.type === 'image/jpeg' && cleanLogo(b64('<svg xmlns="http://www.w3.org/2000/svg"></svg>')) === null && cleanLogo(b64('<html>')) === null && cleanLogo(b64('GIF89a')) === null && cleanLogo('not base64 !') === null && cleanLogo(Buffer.alloc(100_000, 1).toString('base64')) === null && cleanLogo(Buffer.concat([Buffer.from(PNG, 'base64').subarray(0, 16), Buffer.from([0, 0, 0x10, 0, 0, 0, 0x10, 0]), Buffer.alloc(40)]).toString('base64')) === null, [cleanLogo(PNG), cleanLogo(JPEG)]);
}

async function testApiLogic() {
  {
    // a room a player made (server/urooms.js), from the day it is paid for to the day it is freed
    const kept = new Map(), clock = { t: Date.UTC(2026, 0, 10) }, DAY = 86_400_000;
    const ctx = { store: { get: async (k) => (kept.has(k) ? structuredClone(kept.get(k)) : undefined), put: async (k, v) => { kept.set(k, structuredClone(v)); }, delete: async (k) => { kept.delete(k); } }, now: () => clock.t, secret: async () => 'a-secret' };
    const made = await openRoom(ctx, 'Ada', 'sub_1', 'cus_1');
    await ctx.store.put(`uboard:${made.id}:bell`, { v: 2, all: [{ name: 'Ada', score: 5, at: clock.t }] });
    const slept = await sleepRoom(ctx, made.id);
    clock.t += 29 * DAY;
    const still = await userRoom(ctx, made.id), woken = await openRoom(ctx, 'ada', 'sub_2', 'cus_1'), boards = kept.has(`uboard:${made.id}:bell`), subs = [kept.has('sub:sub_1'), kept.get('sub:sub_2')?.room];
    await sleepRoom(ctx, made.id);
    clock.t += 31 * DAY;
    const gone = await userRoom(ctx, made.id), again = await openRoom(ctx, 'Ada', 'sub_3', 'cus_1');
    check('rooms of players: a room is made for an account; it falls asleep when its subscription ends and, paid for again within thirty days, wakes as it was — after that it is freed, its boards with it',
      isUserRoom(made.id) && !isUserRoom('own-short') && !isUserRoom('main') && made.name === "Ada's room" && made.state === 'live' && slept === true && still?.state === 'asleep' && woken.id === made.id && woken.state === 'live' && woken.sub === 'sub_2' && boards
      && subs[0] === false && subs[1] === made.id && !kept.has('sub:sub_2') && gone === null && again.id !== made.id && !kept.has(`uboard:${made.id}:bell`) && !kept.has(`uroom:${made.id}`) && cleanRoomName('  A <b>fine</b>\n room  ') === 'A b fine /b room',
      [made, slept, still, woken, gone, again, [...kept.keys()]]);
  }
  {
    // e-mails through Cloudflare's REST API: three secrets, or nothing
    const asked = [], ok = { ok: true, json: async () => ({ success: true }) }, no = { ok: false, status: 403, json: async () => ({ errors: [{ code: 10102, message: 'Sending domain not onboarded' }] }) };
    const env = { MAIL_FROM: 'Hello@Example.org', CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef', CLOUDFLARE_EMAIL_TOKEN: 'token-of-at-least-twenty-characters' };
    const send = restMailer(env, async (url, init) => { asked.push({ url, init }); return ok; });
    await send({ to: 'ada@example.org', subject: 'Hi', text: 'plain', html: '<p>rich</p>' });
    const body = JSON.parse(asked[0]?.init.body || '{}');
    let refused = '';
    try { await restMailer(env, async () => no)({ to: 'ada@example.org', subject: 'Hi', text: 'x', html: 'x' }); } catch (err) { refused = err.message; }
    check('e-mail: with three secrets — an address to write from, the account, a token — a message leaves through Cloudflare\'s REST API; without them all, none can; a refusal is said',
      asked[0]?.url === 'https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/email/sending/send' && asked[0].init.method === 'POST' && asked[0].init.headers.Authorization === 'Bearer token-of-at-least-twenty-characters'
      && body.from === 'hello@example.org' && body.to === 'ada@example.org' && body.subject === 'Hi' && body.text === 'plain' && body.html === '<p>rich</p>'
      && restMailer({ ...env, MAIL_FROM: '' }) === null && restMailer({ ...env, CLOUDFLARE_ACCOUNT_ID: 'nope' }) === null && restMailer({ ...env, CLOUDFLARE_EMAIL_TOKEN: 'short' }) === null && restMailer({}) === null
      && refused === 'Cloudflare e-mail: 10102 Sending domain not onboarded', [asked[0]?.url, body, refused]);
  }
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
  const talk = cleanTalk({ npc: 'alligator', messages: [{ role: 'user', content: 'I lost my hat' }, { role: 'assistant', content: 'Hats come back, champ. <b>' }, { role: 'user', content: `  Where   is the waterfall? ${'x'.repeat(400)}` }] });
  // (a long conversation: the line, and the three exchanges before it — what the visitor's own page sends along)
  const long = cleanTalk({ npc: 'alligator', messages: [...Array.from({ length: 8 }, (_, i) => [{ role: 'user', content: `q${i}` }, { role: 'assistant', content: `a${i}` }]).flat(), { role: 'user', content: 'and now?' }] });
  const cut = [oneSentence('Head west, champ: keep going upstream past the pond. And then buy my course.'), oneSentence('"One hundred and forty-four, champ."'), oneSentence('See https://example.com now'), oneSentence('- a list'), oneSentence('<b>bold</b> move')];
  check('characters: the last line is kept, bounded, with the three exchanges before it of the same conversation (bounded, no markup); an answer is cut to one plain sentence', talk?.question.startsWith('Where is the waterfall?') && talk.question.length <= 200 && JSON.stringify(talk.before) === '[["I lost my hat","Hats come back, champ. b"]]'
    && long?.question === 'and now?' && long.before.map((b) => b.join(':')).join() === 'q5:a5,q6:a6,q7:a7' && cleanTalk({ npc: 'alligator', messages: [{ role: 'assistant', content: 'x' }] }) === null && cleanTalk({ npc: 'nobody', messages: [] }) === null && cut[0] === 'Head west, champ: keep going upstream past the pond.' && cut[1] === 'One hundred and forty-four, champ.' && cut[2] === null && cut[3] === null && cut[4] === null, [talk, cut]);
  // (an answer is read in a small bubble: the character is asked for a short sentence, and shown short ones —
  // every example it is given keeps to the words asked for, far from where an answer is cut; one that is too long
  // all the same is cut at a word, and says so with an ellipsis)
  const shown = PERSONAS.alligator.system.split('\n').filter((l) => l.startsWith('Visitor: ')).map((l) => l.slice(l.indexOf(' — ') + 3)), words = shown.map((a) => a.split(/\s+/).length), longest = Math.max(...shown.map((a) => a.length));
  const tooLong = oneSentence(`A mindset is a muscle, champ, ${'and a muscle is a mindset, '.repeat(12)}so stretch.`);
  check('characters: Billy is asked for a short sentence — twenty words at the most — and every example he is shown keeps to it, far from where an answer is cut; one that is too long all the same is cut at a word and ends in an ellipsis',
    REPLY_WORDS === 20 && PERSONAS.alligator.system.includes(`${REPLY_WORDS} words at the very most`) && !/30 words/.test(PERSONAS.alligator.system) && shown.length === 8 && words.every((n) => n >= 8 && n <= REPLY_WORDS) && longest <= REPLY_MAX - 60
    && [...tooLong].length <= REPLY_MAX && tooLong.endsWith('…') && !/[\s,;:]…$/.test(tooLong), { words, longest, tooLong });
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
  const w = await walk(a, b, ada, 0, 3, [1.5, -2, 0.5, 2, 33]); // y, z, yaw, anim, flags
  check('presence: remote avatar follows, a little in the past', w.follows && near(w.seen.y, 1.5, 0.01) && near(w.seen.z, -2, 0.01) && near(w.seen.yaw, 0.5, 0.01) && w.seen.anim === 2 && w.seen.flags === 33, w);
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
    check('presence: when a room of one\'s own is full, newcomers gather in the next one', crowd.every((p) => p.count === 4 && p.room === 'crowd') && late1.room === 'crowd-2' && late1.label === 'crowd-2' && late2.room === 'crowd-2' && late1.count === 2 && late2.peers.size === 1 && heads.join() === '4,2', { rooms: [late1.room, late2.room], counts: [late1.count, late2.count, ...crowd.map((p) => p.count)], modes: [late1.mode, late2.mode], heads });
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
  const page = await request(port, '/'), which = await request(port, '/version.json');
  check('cf: the page itself is never kept by a browser (it asks each time), nor the file that says which version is online',
    /no-cache/.test(page.headers['cache-control'] || '') && which.status === 200 && /no-store/.test(which.headers['cache-control'] || '') && JSON.parse(which.body.toString()).commit === 'abc1234', [page.headers['cache-control'], which.status, which.headers['cache-control']]);

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
  h1.send({ t: 's', p: [12.5, 3, -7.25, 1], a: 1, f: 32 });
  await h2.wait((m) => m.t === 'u' && m.s.some((r) => r[0] === h1.id && r[1] === 12.5));
  const quietSince = Date.now();
  for (let i = 0; i < 8; i++) { await sleep(2000); h1.send('{"t":"ping"}'); h2.send('{"t":"ping"}'); } // answered at the edge
  const info = JSON.parse((await request(port, '/api/presence?room=sleepy')).body.toString());
  check('cf: an idle room is unloaded (hibernation) while its visitors stay connected',
    info.players === 2 && info.up < Date.now() - quietSince - 4000 && h1.code === null && h2.code === null && h1.msgs.filter((m) => m.t === 'pong').length === 8, { info, idle: Date.now() - quietSince, codes: [h1.code, h2.code], pongs: h1.msgs.filter((m) => m.t === 'pong').length, others: h1.msgs.filter((m) => m.t !== 'pong').slice(-4) });
  const h3 = new Client(port, 'sleepy');
  const w3 = await h3.hello('Trois', 5);
  check('cf: after waking up, a newcomer still learns who is there and where',
    !!w3 && JSON.stringify(w3.peers) === JSON.stringify([{ id: h1.id, name: 'Un', color: 2, p: [12.5, 3, -7.25, 1], a: 1, f: 32 }, { id: h2.id, name: 'Deux', color: 3 }]) && new Set([h1.id, h2.id, h3.id]).size === 3, w3);
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

// The door of the rooms (server/door.js, rooms.js): which room a newcomer is sent to, a room that never holds
// more than its limit, the owner who always gets in, a friend's link, a room gone quiet, the rooms by address —
// and the game's own side of it (src/net/Presence.js). The rules are set small: six a room at the most, a new
// room once the others hold three, a room that starts takes everybody until it holds two, quiet at one.
async function testDoor(start, dist) {
  const file = path.join(os.tmpdir(), `mmf-door-${process.pid}.json`);
  fs.rmSync(file, { force: true });
  const server = await start({ MAX_PLAYERS: '6', FREE_ROOMS: '0', DIST_DIR: dist, SCORES_FILE: file }); // (the rooms by address: as the fair is delivered)
  const { port } = server;
  const json = (res) => { try { return JSON.parse(res.body.toString()); } catch { return null; } };
  const call = (target, body, key) => request(port, target, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body !== undefined && { 'content-type': 'application/json' }), ...(key && { authorization: `Bearer ${key}` }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
  const door = async (query = '', key) => json(await call(`/api/door${query}`, undefined, key));
  const enter = async (name, query = '', key) => { const a = await door(query, key), c = new Client(port, a.room, a.pass ? { pass: a.pass } : {}); return { a, c, ok: !!(await c.hello(name)) }; };
  const listed = async (want) => { let list = null; for (let i = 0; i < 100; i++) { list = json(await call('/api/rooms')); if (list?.rooms?.map((r) => `${r.name}:${r.players}`).join() === want) break; await sleep(100); } return list; };
  const made = [];
  try {
    // --- the rules: settings, the owner's
    const base = json(await call('/api/rooms'));
    const noKey = await call('/api/rooms/rules', { open: 3 }), set = json(await call('/api/rooms/rules', { max: 50, open: 3, start: 2, low: 1 }, ADMIN_KEY));
    check('door: the rules of the rooms are settings — the owner alone changes them, and "at most" never goes above what the server was started with',
      base?.max === 6 && Array.isArray(base.rooms) && base.rooms.length === 0 && noKey.status === 403 && set?.rules?.max === 6 && set.rules.open === 3 && set.rules.start === 2 && set.rules.low === 1 && set.base?.max === 6 && set.base.open === 6, [base, noKey.status, set]);

    // --- newcomers
    const v = [];
    for (const name of ['A', 'B', 'C', 'D', 'E']) v.push(await enter(name));
    check('door: the server says which room — the first one while it fills, a second one once the first holds enough, and that one takes every newcomer while it starts',
      v.map((x) => x.a.room).join() === 'main,main,main,main-2,main-2' && v[0].a.why === 'new' && v[0].a.label === 'Room 1' && v[3].a.why === 'new' && v[3].a.label === 'Room 2' && v[4].a.why === 'starting' && v.every((x) => x.ok), v.map((x) => x.a));

    // --- a friend's link; a room never holds more than its limit
    const f = [await enter('F', '?want=main'), await enter('G', '?want=main'), await enter('H', '?want=main')];
    const turned = await door('?want=main');
    const barge = new Client(port, 'main');
    const bargeFull = await barge.wait((m) => m.t === 'full'), bargeCode = await Promise.race([barge.closed, sleep(3000)]);
    check('door: a friend\'s link leads to the friend\'s room while it has room; full, the door says so and gives another room — and the relay turns away whoever comes without asking: never more than the limit',
      f.every((x) => x.a.room === 'main' && x.a.why === 'asked' && x.ok) && turned?.full === 'main' && turned.fullLabel === 'Room 1' && turned.room === 'main-2' && !turned.pass && !!bargeFull && bargeCode === 1013, [f[0].a, f[2].a, turned, bargeFull, bargeCode]);

    // --- the owner always gets in
    const mine = await door('?want=main', ADMIN_KEY);
    const boss = new Client(port, 'main', { pass: mine.pass }), bossIn = await boss.hello('Boss');
    const elsewhere = new Client(port, 'main', { pass: (await door('?want=main-2', ADMIN_KEY)).pass }), elseFull = await elsewhere.wait((m) => m.t === 'full');
    const forged = new Client(port, 'main', { pass: await sign('not-the-secret', { o: 1, r: 'main', x: Date.now() + 60000 }) }), forgedFull = await forged.wait((m) => m.t === 'full');
    check('door: the owner always gets in — with a note the door signs for that one room, good for a minute (the key itself never goes in an address); a note for another room, or a forged one, opens nothing',
      mine?.room === 'main' && typeof mine.pass === 'string' && mine.pass.length > 20 && !!bossIn && !!elseFull && !!forgedFull, [mine, !!bossIn, elseFull, forgedFull]);

    // --- coming back; the lists
    const back = await door('?back=main-2'), backFull = await door('?back=main');
    const list = await listed('main:7,main-2:2'), all = json(await call('/api/rooms', undefined, ADMIN_KEY));
    check('door: whoever comes back — a refresh, a new version — finds their room again while it has room; anybody may ask for the common rooms and how many each holds, an administrator also sees what the door makes of each',
      back?.room === 'main-2' && back.why === 'back' && backFull?.full === 'main' && /^main-[23]$/.test(backFull.room)
      && list?.rooms?.length === 2 && list.rooms[0].label === 'Room 1' && list.rooms[0].players === 7 && list.rooms[1].label === 'Room 2' && list.max === 6 && !('old' in list.rooms[0]) && !('phase' in list.rooms[0])
      && all?.rooms?.[0]?.phase === 'live' && all.players === 9 && all.rules?.open === 3, [back, backFull, list, all]);

    // --- a room that empties goes quiet (the first room: down to two; the second: down to one)
    for (const x of [...f, v[2], v[4]]) x.c.ws.close();
    boss.ws.close();
    const thin = await listed('main:2,main-2:1');
    await sleep(13000); // (those the door sent somewhere and who never came are forgotten after twelve seconds)
    // (the rooms are put in order when the host has the occasion — here, the owner touching the rules: at once on
    // the Node server, which counts its rooms itself; a few seconds later on the Worker, which is told)
    await call('/api/rooms/rules', { low: 1 }, ADMIN_KEY);
    const offer = await v[3].c.wait((m) => m.t === 'quiet', 12000), told = v[0].c.msgs.some((m) => m.t === 'quiet');
    const next = await door();
    const after = json(await call('/api/rooms'));
    check('door: a room that has emptied while a livelier one has room goes quiet — it takes no newcomer any more, and whoever is in it is offered the other room (nobody is moved); the list says so',
      next?.room === 'main' && offer?.to === 'main' && offer.n >= 2 && !told && after?.rooms?.[1]?.quiet === true && v[3].c.code === null, [thin, next, offer, after]);

    // --- the rooms by address, and their switch: off as the fair is delivered, the owner's to throw
    const first = { status: json(await call('/api/status'))?.release?.freeRooms, door: await door('?want=club-house') };
    await call('/api/release', { set: { freeRooms: true } }, ADMIN_KEY);
    const club = [];
    for (let i = 0; i < 6; i++) { const c = new Client(port, 'club'); await c.hello(`Club ${i}`); club.push(c); }
    const own = await door('?want=club-house'), over = await door('?want=club&not=club');
    const shut = json(await call('/api/release', { set: { freeRooms: false } }, ADMIN_KEY));
    const refused = await door('?want=club-house'), knocker = new Client(port, 'club-house'), closedMsg = await knocker.wait((m) => m.t === 'closed'), knockCode = await Promise.race([knocker.closed, sleep(3000)]);
    const ownerDoor = await door('?want=club-house', ADMIN_KEY), ownerIn = new Client(port, 'club-house', { pass: ownerDoor.pass }), ownerWelcome = await ownerIn.hello('Boss');
    const common = new Client(port, 'main'), commonIn = await common.hello('Zed');
    await call('/api/release', { set: { freeRooms: true } }, ADMIN_KEY);
    const again = new Client(port, 'club-house'), againIn = await again.hello('Yan');
    check('door: as the fair is delivered only the common rooms exist; when the owner opens the rooms by address, a name written there is a room of its own — full, those who follow gather next door; switched off again, only the common rooms — for everybody but the owner',
      first.status === false && first.door?.closed === 'club-house' && /^main(-2)?$/.test(first.door.room) && own?.room === 'club-house' && own.why === 'own' && over?.room === 'club-2' && over.full === 'club' && shut?.release?.freeRooms === false && refused?.closed === 'club-house' && /^main(-2)?$/.test(refused.room) && !!closedMsg && knockCode === 1013
      && ownerDoor?.room === 'club-house' && !!ownerWelcome && !!commonIn && !!againIn && club.every((c) => c.code === null), [own, over, shut?.release, refused, closedMsg, knockCode, ownerDoor?.room, !!ownerWelcome, !!commonIn, !!againIn]);
    for (const c of [...club, ownerIn, again, knocker, barge, elsewhere, forged]) c.ws.close();

    // --- the game's own side of it: the room is asked of the door, one changes room without leaving the page
    // (six a room, a new room once the others hold four, nothing goes quiet; the second room is empty again)
    await call('/api/rooms/rules', { open: 4, start: 0, low: 0, merge: 0 }, ADMIN_KEY);
    v[3].c.ws.close();
    await listed('main:3'); // (A, B and Zed)
    await sleep(13000); // (those the door sent somewhere and who never came are forgotten)
    const url = `ws://127.0.0.1:${port}/ws`, events = { pia: [], paul: [] };
    const pia = new Presence({ name: 'Pia', url }), paul = new Presence({ name: 'Paul', url }), friend = new Presence({ name: 'Friend', url, room: 'main-2' });
    made.push(pia, paul, friend);
    pia.on('room', (e) => events.pia.push(e)); paul.on('room', (e) => events.paul.push(e));
    pia.connect();
    await until(() => pia.mode === 'online' && pia.count === 4, 8000);
    paul.connect();
    await until(() => paul.mode === 'online' && paul.room === 'main-2', 8000);
    friend.connect();
    await until(() => friend.mode === 'online' && paul.count === 2, 8000);
    let rooms = null;
    for (let i = 0; i < 100; i++) { rooms = await pia.rooms(); if (rooms?.map((r) => `${r.name}:${r.players}`).join() === 'main:4,main-2:2') break; await sleep(100); }
    check('presence: the room is the one the door says — the first room while it has not enough, a second one after that; a friend\'s link leads to the friend; the rooms are listed with how many each holds',
      pia.room === 'main' && pia.label === 'Room 1' && pia.count === 4 && events.pia.length === 1 && events.pia[0].room === 'main' && events.pia[0].moved === true && paul.room === 'main-2' && paul.label === 'Room 2' && events.paul[0]?.why === 'new'
      && friend.room === 'main-2' && paul.count === 2 && rooms?.length === 2 && rooms[0].label === 'Room 1' && rooms[1].label === 'Room 2' && rooms[1].players === 2, { pia: [pia.room, pia.count, events.pia], paul: [paul.room, paul.count, events.paul], friend: friend.room, rooms });
    // Pia changes room: the same page — only the room
    v[0].c.msgs.length = 0;
    const moved = await pia.switchRoom('main-2');
    await until(() => pia.mode === 'online' && pia.room === 'main-2' && pia.count === 3 && paul.count === 3, 8000);
    const left = v[0].c.msgs.some((m) => m.t === 'leave');
    check('presence: one changes room without leaving the page — the visitors of the room one leaves see one go, those of the other see one arrive',
      moved === true && pia.room === 'main-2' && pia.count === 3 && paul.count === 3 && [...paul.peers.values()].some((p) => p.name === 'Pia') && left && events.pia.length === 2 && events.pia[1].room === 'main-2' && events.pia[1].moved === true, { moved, room: pia.room, counts: [pia.count, paul.count], left, events: events.pia });
    // a room that is full is not changed to: one stays where one is, and is told
    const fill = [];
    for (let i = 0; i < 3; i++) { const c = new Client(port, 'main'); await c.hello(`Fill ${i}`); fill.push(c); }
    await listed('main:6,main-2:3');
    await paul.switchRoom('main');
    await until(() => events.paul.some((e) => e.full === 'main'), 8000);
    await until(() => paul.mode === 'online' && paul.count === 3, 8000);
    const stay = events.paul.find((e) => e.full === 'main');
    // …but the owner gets in, and whoever comes back finds their room
    const owner = new Presence({ name: 'Owner', url, room: 'main' }), returning = new Presence({ name: 'Back', url, back: 'main-2' });
    made.push(owner, returning);
    owner.setAdminKey(ADMIN_KEY);
    owner.connect(); returning.connect();
    await until(() => owner.mode === 'online' && owner.count === 7 && returning.mode === 'online' && returning.count === 4, 8000);
    check('presence: a room that is full is not changed to — one stays where one was, and is told; the owner gets in all the same; whoever comes back finds their room',
      paul.room === 'main-2' && stay?.moved === false && owner.room === 'main' && owner.count === 7 && returning.room === 'main-2' && returning.count === 4, { paul: [paul.room, paul.count, events.paul], owner: [owner.room, owner.count, owner.mode], back: [returning.room, returning.count] });
    for (const c of [...fill, common, v[0].c, v[1].c]) c.ws.close();
  } finally {
    for (const p of made) p.dispose();
    if (process.env.NET_TEST_LOG) fs.writeFileSync(`${process.env.NET_TEST_LOG}.door`, server.log);
    await server.stop();
    fs.rmSync(file, { force: true });
  }
}

// The boards from before scores belonged to accounts are put away, once — nothing of them is lost, nothing of them shows.
async function testEra(start, dist) {
  const file = path.join(os.tmpdir(), `mmf-era-${process.pid}.json`);
  const old = { 'board:sky': [{ name: 'Old Timer', ms: 150000, at: 5 }], 'board:shoot': { v: 2, all: [{ name: 'Somebody', score: 900, at: 7 }], day: { key: '2026-01-01', list: [] }, week: { key: '2026-W01', list: [] }, month: { key: '2026-01', list: [] } }, 'visit:abc': { day: 1, days: 3, best: 3 } };
  fs.writeFileSync(file, JSON.stringify(old));
  const server = await start({ DIST_DIR: dist, SCORES_FILE: file });
  const json = (res) => { try { return JSON.parse(res.body.toString()); } catch { return null; } };
  try {
    const boards = json(await request(server.port, '/api/scores?board=all'))?.boards, again = json(await request(server.port, '/api/scores?board=sky'));
    const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
    await until(() => !!read()?.['scores:era'], 4000);
    const kept = read();
    check('scores: the boards from before scores belonged to accounts are put away as they were — shown nowhere, lost nowhere — and the lists start again; the rest of what is kept is left alone',
      !!boards && Object.values(boards).every((b) => ['day', 'week', 'month', 'all'].every((p) => b.tops[p].length === 0)) && again?.top.length === 0
      && JSON.stringify(kept?.['board0:sky']) === JSON.stringify(old['board:sky']) && JSON.stringify(kept['board0:shoot']) === JSON.stringify(old['board:shoot']) && !kept['board:sky'] && !kept['board:shoot'] && kept['scores:era'].v === 1 && kept['visit:abc']?.days === 3,
      [boards && Object.keys(boards).length, kept && Object.keys(kept)]);
  } finally {
    await server.stop();
    fs.rmSync(file, { force: true });
  }
}

// A game of a booth, really played — here by a hand that strikes when the needle is high (the bell), or that wanders
// and clicks (the others) — with the seed `seed`: { score, log } as the page would send them.
function playBooth(board, seed, hand = 1) {
  const { def, make } = gameOf(board), game = make(), s = sessionOf(def, game, seed), rnd = rngOf(hand * 7919 + 13);
  let dx = 0, dy = -0.1, down = false, red = 0;
  for (let k = 0; k < 75 * 70 && !s.over; k++) {
    if (rnd() < 0.08) { dx = (rnd() - 0.5) * 1.6; dy = (rnd() - 0.5) * 1.1; } else { dx += (rnd() - 0.5) * 0.02; dy += (rnd() - 0.5) * 0.02; }
    if (rnd() < 0.03) down = !down;
    // (the bell: struck when the needle is high; SCRAM!: the alarm answered a dozen steps after it shows; the others: now and then)
    red = game.phase === 'alarm' ? red + 1 : 0;
    const l = Math.hypot(dx, dy, 1), strike = board === 'bell' ? (s.gauge !== null && s.gauge > 0.8 + 0.03 * hand ? 1 : 0) : board === 'scram' ? (red === 10 + hand ? 1 : 0) : rnd() < 0.07 ? 1 : 0;
    s.tick(1 / 60, dx / l, dy / l, -1 / l, strike, down, true, null);
  }
  return { score: s.score, log: packLog(s.words), over: s.over };
}

// A flight of the flying theatre, by a bot that flaps through `goal` pairs of columns then lets itself fall — and a
// run at the arcade cabinet, by one that jumps and ducks for `until` metres then meets what comes:
// { score, words, log, over } as the page would send them.
function playWing(seed, goal) {
  const f = flightOf(seed), log = flightLog();
  for (let k = 0; k < 120 * 600 && !f.S.over; k++) {
    const ahead = f.pairs.filter((p) => p.x > -3.3).sort((a, b) => a.x - b.x)[0], target = (ahead && ahead.x < 6 ? ahead.y : 3.3) - 0.3;
    const flap = !f.S.fallen && f.S.score < goal && (!f.S.flying || (f.S.y < target && f.S.vy < 1.2));
    log.step(flap); f.tick(flap);
  }
  return { score: f.S.score, words: log.words(), log: packLog(log.words()), over: f.S.over };
}
function playRun(seed, until) {
  const r = runOf(seed), log = runLog(), s = r.s;
  for (let k = 0; k < 120 * 1200 && !s.over; k++) {
    const next = s.things.filter((o) => !o.gone && o.kind !== 'iso').map((o) => ({ kind: o.kind, gap: o.x + 2 - (s.x + 84), wide: o.w - 4 })).filter((o) => o.gap + o.wide > -20).sort((a, b) => a.gap - b.gap)[0];
    let keys = 0;
    if (next && s.score < until) { if (next.kind === 'drone') keys = next.gap < 40 && next.gap + next.wide > -24 ? 2 : 0; else if (next.kind !== 'high') keys = next.gap < s.speed * 0.27 - next.wide / 2 - 9 && next.gap > -4 ? 1 : 0; }
    log.step(keys); r.tick(keys);
  }
  return { score: s.score, words: log.words(), log: packLog(log.words()), over: s.over };
}

// The referee (server/replay.js): a great score at a booth is played again by the server, from the seed of its note
// and the log that came with it. What does not come out of its game is not put on the board, and waits for the owner.
async function testReplay(start, dist) {
  const file = path.join(os.tmpdir(), `mmf-replay-${process.pid}.json`);
  fs.rmSync(file, { force: true });
  const server = await start({ DIST_DIR: dist, SCORES_FILE: file });
  const { port } = server;
  const json = (res) => { try { return JSON.parse(res.body.toString()); } catch { return null; } };
  const key = { authorization: `Bearer ${ADMIN_KEY}` };
  // (what an address may post is counted: each of these visitors comes from an address of their own)
  let who = 60;
  const post = (target, body, headers = {}) => request(port, target, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), from: `127.0.0.${who++}` });
  const noteOf = (board, ago, seed) => sign(SCORE_SECRET, { b: board, t: Date.now() - ago, n: randomId(9), ...(seed !== undefined && { s: seed }) });
  const board = async (id, q = '') => json(await request(port, `/api/scores?board=${id}${q}`))?.tops;
  try {
    const run = json(await post('/api/run', { board: 'bell' })), mine = await verify(SCORE_SECRET, run?.run);
    const SEED = 424242, honest = playBooth('bell', SEED), other = playBooth('bell', SEED + 1), again = replay('bell', SEED, honest.log);
    // (…and a game of quick answers: how fast is told by the steps that were written down, not by the clock of a machine)
    const alarms = playBooth('scram', 606);
    check('replay: the note of a run carries the seed of its game — and a game played again from its log ends with the same score, here as on the server',
      Number.isInteger(run?.seed) && run.seed >= 0 && run.seed <= 0xffffffff && mine?.s === run.seed && typeof mine.v === 'string' && honest.over && honest.score >= 3000 && again?.score === honest.score && agrees('bell', honest.score, again)
      && !agrees('bell', honest.score + 1, again) && !agrees('bell', honest.score, { ...again, over: false }) && alarms.over && alarms.score >= 150 && alarms.score <= 260 && agrees('scram', alarms.score, replay('scram', 606, alarms.log)) && replay('bell', SEED, 'not a log') === null && replay('sky', SEED, honest.log) === null, [run?.seed, honest.score, again]);
    // a game really played: its score goes on the board
    const devs = { honest: randomId(16), liar: randomId(16), bare: randomId(16), swap: randomId(16) };
    const fair = json(await post('/api/scores', { board: 'bell', name: 'Honest', score: honest.score, run: await noteOf('bell', 6000, SEED), log: honest.log, device: devs.honest }));
    // the same game with a better score claimed; a score with no game at all; a game played with another seed
    const liar = json(await post('/api/scores', { board: 'bell', name: 'Liar', score: 9999, run: await noteOf('bell', 6000, SEED), log: honest.log, device: devs.liar }));
    const bare = json(await post('/api/scores', { board: 'bell', name: 'Bare', score: 9998, run: await noteOf('bell', 6000, SEED), device: devs.bare }));
    const swap = json(await post('/api/scores', { board: 'bell', name: 'Swap', score: Math.max(honest.score + 1, other.score + 600), run: await noteOf('bell', 6000, SEED), log: other.log, device: devs.swap }));
    const forAll = await board('bell'), forLiar = await board('bell', `&device=${devs.liar}`);
    check('replay: a score that comes out of its game goes on the board; one that does not — a better score claimed, no game at all, the game of another seed — is answered as if it did, shown to its author, and to nobody else',
      fair?.day === 1 && forAll?.day.map((e) => e.name).join() === 'Honest' && liar?.tops.day[0].name === 'Liar' && liar.day === 1 && bare?.tops.day[0].name === 'Bare' && swap?.tops.day.some((e) => e.name === 'Swap')
      && forLiar.day[0].name === 'Liar' && forLiar.day.some((e) => e.name === 'Honest'), [fair?.day, forAll?.day, liar?.day, forLiar?.day]);
    // …and waits for the owner: who takes one onto the board after all, and lets another go
    const nobody = await request(port, '/api/flagged');
    const flagged = json(await request(port, '/api/flagged', { headers: key }))?.flagged || [];
    const pick = (name) => flagged.find((f) => f.name === name);
    const took = json(await request(port, '/api/flagged', { method: 'POST', headers: { ...key, 'content-type': 'application/json' }, body: JSON.stringify({ id: pick('Bare')?.id, accept: true }) }));
    const gone = json(await request(port, '/api/flagged', { method: 'POST', headers: { ...key, 'content-type': 'application/json' }, body: JSON.stringify({ id: pick('Liar')?.id, accept: false }) }));
    const after = await board('bell');
    check('replay: what the server did not believe waits for the owner, with the reason — taken, it goes on the board; let go, it is forgotten',
      nobody.status === 403 && flagged.length === 3 && /played again, it gives \d+$/.test(pick('Liar')?.why || '') && flagged.every((f) => Object.keys(f).sort().join() === 'at,board,guest,id,name,score,why') && /no game came with it/.test(pick('Bare')?.why || '') && /played again/.test(pick('Swap')?.why || '')
      && took?.flagged.length === 2 && gone?.flagged.length === 1 && gone.flagged[0].name === 'Swap' && after.day.map((e) => `${e.name}:${e.score}`).join() === `Bare:9998,Honest:${honest.score}`, [nobody.status, flagged, after?.day]);
    // a game with a clock and a pointer that wanders (the moles): its log is longer, and is believed the same way
    let moles = null;
    for (let hand = 1; hand < 12 && !(moles && moles.score >= 20); hand++) moles = playBooth('mole', 77, hand);
    const whack = json(await post('/api/scores', { board: 'mole', name: 'Whacker', score: moles.score, run: await noteOf('mole', 50000, 77), log: moles.log, device: randomId(16) }));
    // …and a score that changes nothing at the top of a board is not played again: five better ones stand above it
    for (let k = 0; k < 5; k++) { const g = playBooth('bell', 900 + k, 2); await post('/api/scores', { board: 'bell', name: `Top ${k}`, score: g.score, run: await noteOf('bell', 6000, 900 + k), log: g.log, device: randomId(16) }); }
    const small = json(await post('/api/scores', { board: 'bell', name: 'Small', score: 5, run: await noteOf('bell', 6000, 1), device: randomId(16) }));
    const last = await board('bell'), still = json(await request(port, '/api/flagged', { headers: key }))?.flagged || [];
    check('replay: a game with a clock is believed the same way (a log of some forty kilobytes); a score that would not enter the first five of a list is not played again',
      whack?.day === 1 && moles.score >= 20 && moles.log.length > 20000 && moles.log.length < 80000 && (await board('mole'))?.day[0]?.name === 'Whacker'
      && last.day.length === 8 && last.day[7].name === 'Small' && small?.day === 8 && still.length === 1, [whack?.day, moles.score, moles.log.length, last?.day.map((e) => e.name), still.length]);
    // the flying theatre and the arcade cabinet: when one flapped, which keys were down — a few hundred characters, and
    // believed the same way. A column more than was flown, a flight cut before its end: not believed.
    let flight = null, runner = null;
    for (let seed = 31; seed < 60 && !(flight && flight.score === 12); seed++) flight = { seed, ...playWing(seed, 12) };
    for (let seed = 71; seed < 99 && !(runner && runner.score >= 400); seed++) runner = { seed, ...playRun(seed, 400) };
    const cut = [...flight.words], steps = ((cut[0] | (cut[1] << 16)) >>> 0) - 60;
    cut[0] = steps & 0xffff; cut[1] = steps >>> 16;
    const fly = (name, score, log, seed = flight.seed) => noteOf('wing', 120000, seed).then((run) => post('/api/scores', { board: 'wing', name, score, run, log, device: randomId(16) })).then(json);
    const flew = await fly('Flyer', flight.score, flight.log), more = await fly('Higher', flight.score + 1, flight.log), short = await fly('Shorter', flight.score, packLog(cut));
    const ran = json(await post('/api/scores', { board: 'run', name: 'Runner', score: runner.score, run: await noteOf('run', 120000, runner.seed), log: runner.log, device: randomId(16) }));
    // …and a game that began before a delivery and ended after it: the reason says so (its rules may have changed)
    const late = json(await post('/api/scores', { board: 'run', name: 'Late', score: runner.score + 30, run: await sign(SCORE_SECRET, { b: 'run', t: Date.now() - 120000, n: randomId(9), s: runner.seed, v: 'the-one-before' }), log: runner.log, device: randomId(16) }));
    const wings = await board('wing'), runs = await board('run'), end = json(await request(port, '/api/flagged', { headers: key }))?.flagged || [];
    const said = (name) => end.find((f) => f.name === name)?.why || '';
    check('replay: a flight and a run at the arcade are believed the same way (what was flapped, what was pressed: a few hundred characters); a column more than was flown, a flight cut before its end, are not — and a game a delivery came in the middle of says so',
      flight.over && flight.score === 12 && runner.over && runner.score >= 400 && flight.log.length < 600 && runner.log.length < 2000 && flew?.day === 1 && ran?.day === 1
      && wings.day.map((e) => `${e.name}:${e.score}`).join() === 'Flyer:12' && runs.day.map((e) => e.name).join() === 'Runner' && more?.day === 1 && short?.day >= 1 && late?.day === 1
      && said('Higher') === 'played again, it gives 12' && said('Shorter') === 'played again, it gives 12 and does not end' && said('Late') === `played again, it gives ${runner.score} (a delivery came during this game: its rules may have changed)` && end.length === 4,
      [flight.score, flight.log.length, runner.score, runner.log.length, flew?.day, ran?.day, wings?.day, runs?.day, end.map((f) => `${f.name}: ${f.why}`)]);
  } finally {
    await server.stop();
    fs.rmSync(file, { force: true });
  }
}

// Rooms that players make for themselves (server/urooms.js): nothing while the switch is off; then a room is bought
// by an account, reached by its link, a password exchanged for a ticket, its owner's tools, its own boards — and it
// falls asleep when it is no longer paid for.
async function testUserRooms(start, dist) {
  const file = path.join(os.tmpdir(), `mmf-urooms-${process.pid}.json`);
  fs.rmSync(file, { force: true });
  const server = await start({ DIST_DIR: dist, SCORES_FILE: file, FREE_ROOMS: '0' });
  const { port } = server;
  const json = (res) => { try { return JSON.parse(res.body.toString()); } catch { return null; } };
  const key = { authorization: `Bearer ${ADMIN_KEY}` };
  // (what an address may ask is counted: the visitors of this test come from addresses of their own)
  let who = 100;
  const post = (target, body, headers = {}) => request(port, target, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body), from: `127.0.0.${who++}` });
  const get = (target, headers = {}) => request(port, target, { headers, from: `127.0.0.${who++}` });
  const hook = async (event) => { const raw = JSON.stringify(event); return post('/api/stripe/webhook', raw, { 'stripe-signature': await signWebhook(STRIPE_HOOK, raw, Date.now()) }); };
  const release = (set) => post('/api/release', { set }, key);
  const paid = (session, sub, device, account) => hook({ type: 'checkout.session.completed', data: { object: { id: session, payment_status: 'paid', amount_total: 5900, subscription: sub, customer: 'cus_ada', metadata: { item: 'room', device, account } } } });
  const ada = randomId(16), guest = randomId(16), other = randomId(16);
  const join = async (room, dev, name, ticket) => {
    const c = new Client(port, room, { dev, ...(ticket && { ticket }) });
    await c.opened;
    const no = await c.wait((m) => m.t === 'locked' || m.t === 'closed' || m.t === 'kicked', 500);
    if (no) return { c, no: no.t, code: await Promise.race([c.closed, sleep(3000)]) };
    return { c, welcome: await c.hello(name, 1) };
  };
  const made = [];
  try {
    // switched off, as the fair is delivered: nothing answers, nothing is sold, such a name is no room
    const off = { mine: await get(`/api/myroom?device=${ada}`), enter: await post('/api/room/enter', { room: 'own-abcdefgh', device: guest }), list: await get('/api/urooms', key), buy: await post('/api/checkout', { item: 'room', device: ada }), door: json(await get('/api/door?want=own-abcdefgh')), prices: json(await get(`/api/shop?device=${ada}`))?.prices };
    check('rooms of players: switched off, as delivered, nothing answers — no path, nothing sold, and such a name is no room',
      off.mine.status === 404 && off.enter.status === 404 && off.list.status === 404 && off.buy.status === 400 && off.door?.closed === 'own-abcdefgh' && !!off.prices && !('room' in off.prices), [off.mine.status, off.enter.status, off.list.status, off.buy.status, off.door, off.prices]);

    // switched on: a room takes an account; it is bought by the month, and made when Stripe says it is paid
    await release({ userRooms: true });
    const noAcct = await post('/api/checkout', { item: 'room', device: ada });
    const acct = json(await post('/api/account', { action: 'create', device: ada, name: 'Ada', password: 'correct horse' }));
    stripe.asked.length = 0;
    const buy = await post('/api/checkout', { item: 'room', device: ada }), form = stripe.asked[0]?.form;
    const before = json(await get(`/api/myroom?device=${ada}`));
    await paid('cs_room_1', 'sub_room_1', ada, 'Ada');
    const mine = json(await get(`/api/myroom?device=${ada}`)), id = mine?.room?.id || '';
    const twice = await post('/api/checkout', { item: 'room', device: ada });
    check('rooms of players: switched on, a room is bought by the month ($59) from a browser signed in to an account — one for each — and is there once Stripe says it is paid',
      noAcct.status === 403 && json(noAcct)?.account === true && acct?.account?.name === 'Ada' && buy.status === 200 && form?.get('mode') === 'subscription' && form.get('line_items[0][price_data][unit_amount]') === '5900' && form.get('metadata[account]') === 'Ada'
      && before?.room === null && before.price === 5900 && /^own-[a-z0-9]{8}$/.test(id) && mine.room.name === "Ada's room" && mine.room.state === 'live' && mine.room.locked === false && twice.status === 409, [noAcct.status, buy.status, before, mine, twice.status]);

    // its owner names it and gives it a password; the door says that it is there, and locked
    const named = json(await post('/api/myroom', { device: ada, name: '  The   Clubhouse <3 ', password: 'sesame42' }));
    const notMine = await post('/api/myroom', { device: guest, name: 'Mine now' }), short = await post('/api/myroom', { device: ada, password: 'abc' });
    const door = json(await get(`/api/door?want=${id}`)), nowhere = json(await get('/api/door?want=own-zzzzzzzz'));
    if (!CF) await until(() => { try { return fs.readFileSync(file, 'utf8').includes(id); } catch { return false; } }, 4000);
    check('rooms of players: its owner names it and gives it a password — kept as those of the accounts are, never as it was typed; the door says the room is there and locked, and that another name of the kind is no room',
      named?.room?.name === 'The Clubhouse 3' && named.room.locked === true && notMine.status === 403 && short.status === 400 && door?.room === id && door.own === true && door.locked === true && door.label === 'The Clubhouse 3' && door.why === 'own'
      && nowhere?.gone === 'own-zzzzzzzz' && /^main/.test(nowhere.room) && (CF || (fs.readFileSync(file, 'utf8').includes(id) && !fs.readFileSync(file, 'utf8').includes('sesame42'))), [named, notMine.status, short.status, door, nowhere]);

    // getting in: the password is exchanged for a ticket (never in an address); the relay lets nobody in without one
    const none = await post('/api/room/enter', { room: id, device: guest }), wrong = await post('/api/room/enter', { room: id, device: guest, password: 'sesame' });
    const right = json(await post('/api/room/enter', { room: id, device: guest, password: 'sesame42' })), host = json(await post('/api/room/enter', { room: id, device: ada }));
    const bare = await join(id, guest, 'Guest'), stolen = await join(id, other, 'Thief', right?.ticket);
    const g = await join(id, guest, 'Guest', right?.ticket), h = await join(id, ada, 'Ada', host?.ticket);
    made.push(bare, stolen, g, h);
    check('rooms of players: the password is exchanged for a ticket (its owner needs none); the relay lets in who holds a ticket made for their browser — and nobody else',
      none.status === 401 && json(none)?.locked === true && wrong.status === 401 && json(wrong)?.wrong === true && !!right?.ticket && !!right.member && right.host === false && right.max === 50 && right.label === 'The Clubhouse 3'
      && host?.host === true && bare.no === 'locked' && bare.code === 1013 && stolen.no === 'locked' && !!g.welcome && !!h.welcome && h.welcome.peers.length === 1, [none.status, wrong.status, right && { ...right, ticket: !!right.ticket, member: !!right.member }, host?.host, bare.no, bare.code, stolen.no, !!g.welcome, h.welcome?.peers]);

    // its owner puts a visitor out: gone, and not back within the hour; a visitor puts nobody out
    g.c.send({ t: 'kick', id: h.welcome.id });
    await sleep(300);
    const stays = h.c.code === null;
    h.c.send({ t: 'kick', id: g.welcome.id });
    const out = await g.c.wait((m) => m.t === 'kicked', 3000), code = await Promise.race([g.c.closed, sleep(3000)]);
    const fresh = json(await post('/api/room/enter', { room: id, device: guest, password: 'sesame42' })), back = await join(id, guest, 'Guest', fresh?.ticket);
    made.push(back);
    check('rooms of players: its owner puts a visitor out — gone, and not back within the hour, even with a new ticket; a visitor puts nobody out',
      stays && out?.host === true && out.ban === false && code === 4001 && !!fresh?.ticket && !back.welcome && back.c.msgs.some((m) => m.t === 'kicked' && m.host === true), [stays, out, code, !!fresh?.ticket, !!back.welcome, back.c.msgs.map((m) => m.t)]);

    // its own boards, next to the world's: a score made in the room goes on both
    const member = right.member, games = [playBooth('bell', 7001), playBooth('bell', 7002, 2), playBooth('bell', 7003, 3)];
    const note = (seed) => sign(SCORE_SECRET, { b: 'bell', t: Date.now() - 6000, n: randomId(9), s: seed });
    const scored = json(await post('/api/scores', { board: 'bell', name: 'Guest', score: games[0].score, run: await note(7001), log: games[0].log, device: guest, room: id, member }));
    const outside = json(await post('/api/scores', { board: 'bell', name: 'Passer', score: games[1].score, run: await note(7002), log: games[1].log, device: other }));
    // (the note of a member is made for one browser: it lets nobody else onto the boards of the room)
    const forged = json(await post('/api/scores', { board: 'bell', name: 'Forger', score: games[2].score, run: await note(7003), log: games[2].log, device: randomId(16), room: id, member }));
    const q = `&room=${id}&member=${encodeURIComponent(member)}`;
    const world = json(await get('/api/scores?board=bell')), inside = json(await get(`/api/scores?board=bell&device=${guest}${q}`)), peek = json(await get(`/api/scores?board=bell&device=${other}${q}`)), every = json(await get(`/api/scores?board=all&device=${guest}${q}`));
    const order = [['Guest', games[0].score], ['Passer', games[1].score], ['Forger', games[2].score]].sort((a, b) => b[1] - a[1]).map((e) => e[0]).join();
    check('rooms of players: a score made in a room goes on the boards of the room and on the world\'s; the boards of a room are read — and written — with the note of a member, made for one browser',
      scored?.day >= 1 && scored.room?.id === id && scored.room.tops.day.map((e) => e.name).join() === 'Guest' && scored.room.day === 1 && !!outside?.tops && !outside.room && !!forged?.tops && !forged.room
      && world.tops.day.map((e) => e.name).join() === order && !world.room && inside.room?.tops.day.map((e) => e.name).join() === 'Guest' && inside.tops.day.length === 3 && !peek.room && every.room?.boards.bell.tops.day[0].score === games[0].score && every.boards.bell.tops.day.length === 3,
      [scored && { day: scored.day, room: scored.room }, !!outside?.room, !!forged?.room, world?.tops.day, inside?.room, !!peek?.room, games.map((x) => x.score)]);

    // its owner empties its boards — the world keeps its own; the administrators see every room
    const reset = json(await post('/api/myroom', { device: ada, reset: true }));
    const emptied = json(await get(`/api/scores?board=bell&device=${guest}${q}`));
    const listed = json(await get('/api/urooms', key)), noKey = await get('/api/urooms');
    check('rooms of players: its owner empties its boards — the world keeps its own; the administrators see every room, with its owner',
      reset?.reset === true && emptied.room?.tops.day.length === 0 && emptied.tops.day.length === 3 && noKey.status === 403 && listed?.rooms.length === 1 && listed.rooms[0].id === id && listed.rooms[0].owner === 'Ada' && listed.rooms[0].locked === true && listed.max === 50, [reset, emptied?.room, noKey.status, listed]);

    // the subscription ends: the room falls asleep — nobody gets in, nothing is lost; paid for again, it wakes as it was
    await hook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_room_1' } } });
    const asleep = { mine: json(await get(`/api/myroom?device=${ada}`)), enter: await post('/api/room/enter', { room: id, device: ada }), door: json(await get(`/api/door?want=${id}`)), knock: await join(id, ada, 'Ada', host.ticket) };
    made.push(asleep.knock);
    const again = await post('/api/checkout', { item: 'room', device: ada });
    await paid('cs_room_2', 'sub_room_2', ada, 'Ada');
    const woken = json(await get(`/api/myroom?device=${ada}`)), locked = await post('/api/room/enter', { room: id, device: guest });
    check('rooms of players: when the subscription ends the room falls asleep — nobody gets in, its link says so, nothing is lost; paid for again it wakes as it was, with its name and its password',
      asleep.mine?.room?.state === 'asleep' && asleep.mine.room.until > Date.now() + 29 * 86_400_000 && asleep.enter.status === 423 && json(asleep.enter)?.asleep === true && asleep.door?.asleep === id && /^main/.test(asleep.door.room) && asleep.knock.no === 'closed'
      && again.status === 200 && woken?.room?.id === id && woken.room.state === 'live' && woken.room.name === 'The Clubhouse 3' && woken.room.locked === true && locked.status === 401, [asleep.mine, asleep.enter.status, asleep.door, asleep.knock.no, again.status, woken, locked.status]);

    // switched off again: nothing answers any more — and nothing is lost: switched on, the room is there
    await release({ userRooms: false });
    const shut = { enter: await post('/api/room/enter', { room: id, device: ada }), knock: await join(id, ada, 'Ada', host.ticket) };
    made.push(shut.knock);
    await release({ userRooms: true });
    const kept = json(await get(`/api/myroom?device=${ada}`));
    // an administrator tries a room out: one for the account their browser is signed in to, for nothing; and reads the boards of any room
    const boss = randomId(16), bossName = `Boss ${randomId(3).replace(/[^A-Za-z0-9]/g, 'x')}`;
    await post('/api/account', { action: 'create', device: boss, name: bossName, password: 'a good password' });
    const bossNoKey = await post('/api/urooms', { open: true, device: boss }), bossNoAcct = await post('/api/urooms', { open: true, device: randomId(16) }, key);
    const bossRoom = json(await post('/api/urooms', { open: true, device: boss }, key)), bossTwice = json(await post('/api/urooms', { open: true, device: boss }, key));
    const bossMine = json(await get(`/api/myroom?device=${boss}`)), bossSeen = json(await get(`/api/scores?board=all&room=${id}`, key)), bossUnseen = json(await get(`/api/scores?board=all&room=${id}`));
    check('an administrator tries a room of one\'s own out for nothing — one for their account, once, with no subscription — and reads the boards of any room a player made; nobody else does either',
      bossNoKey.status === 403 && bossNoAcct.status === 403 && /^own-[a-z0-9]{8}$/.test(bossRoom?.room?.id || '') && bossRoom.fresh === true && bossTwice?.room?.id === bossRoom.room.id && bossTwice.fresh === false && bossMine?.room?.id === bossRoom.room.id && bossMine.room.state === 'live'
      && !!bossSeen?.room?.boards && bossSeen.room.id === id && !bossUnseen?.room, [bossNoKey.status, bossNoAcct.status, bossRoom, bossTwice?.fresh, bossMine?.room, Object.keys(bossSeen?.room?.boards || {}).length, bossUnseen?.room]);
    check('rooms of players: switched off again nothing answers any more, and nothing is lost — switched on, the room is there as it was', shut.enter.status === 404 && shut.knock.no === 'closed' && kept?.room?.id === id && kept.room.name === 'The Clubhouse 3', [shut.enter.status, shut.knock.no, kept]);
    // a room for good: paid once instead of by the month — no subscription behind it, and nothing puts it to sleep
    {
      const zed = randomId(16), zedName = `Zed ${randomId(3).replace(/[^A-Za-z0-9]/g, 'x')}`;
      const zedMade = await post('/api/account', { action: 'create', device: zed, name: zedName, password: 'a good password' });
      stripe.asked.length = 0;
      const buyGood = CF ? null : await post('/api/checkout', { item: 'room', device: zed, life: true }), formGood = stripe.asked[0]?.form;
      await hook({ type: 'checkout.session.completed', data: { object: { id: 'cs_room_good', payment_status: 'paid', amount_total: 19900, subscription: null, customer: 'cus_zed', metadata: { item: 'room', device: zed, account: zedName, life: '1' } } } });
      const good = json(await get(`/api/myroom?device=${zed}`));
      await hook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_of_nobody_2' } } });
      const goodStill = json(await get(`/api/myroom?device=${zed}`)), goodTwice = CF ? null : await post('/api/checkout', { item: 'room', device: zed, life: true });
      const notes = json(await get(`/api/shop?device=${zed}`))?.notes || [];
      check('rooms of players: a room may be bought for good — one payment of $199, no subscription —: it is theirs, said to be for good, with nothing to look after; no subscription that ends puts it to sleep; and an account has one room',
        zedMade.status === 200 && (CF || (buyGood.status === 200 && formGood?.get('mode') === 'payment' && formGood.get('line_items[0][price_data][unit_amount]') === '19900' && formGood.get('line_items[0][price_data][recurring][interval]') === null && formGood.get('metadata[life]') === '1' && formGood.get('metadata[account]') === zedName && /a room of your own, for good$/.test(formGood.get('line_items[0][price_data][product_data][name]')) && goodTwice.status === 409))
        && good?.room?.state === 'live' && good.room.life === true && good.room.managed === false && good.price === 5900 && good.life === 19900 && goodStill?.room?.state === 'live' && notes.some((n) => /yours for good/.test(n)),
        [zedMade.status, buyGood?.status, formGood && Object.fromEntries(formGood), good, goodStill?.room?.state, goodTwice?.status, notes]);
    }
  } finally {
    for (const m of made) { try { m.c.ws.close(); } catch { /* closed */ } }
    await server.stop();
    fs.rmSync(file, { force: true });
  }
}

// So many connections from one address (door.js): in a room, in all, new ones a minute — and the owner always gets in.
async function testLimits(start, dist) {
  const file = path.join(os.tmpdir(), `mmf-limits-${process.pid}.json`);
  fs.rmSync(file, { force: true });
  const server = await start({ MAX_PLAYERS: '20', ADDRESS_LIMITS: '1', DIST_DIR: dist, SCORES_FILE: file });
  const { port } = server, A = '127.0.0.31', B = '127.0.0.32';
  const json = (res) => { try { return JSON.parse(res.body.toString()); } catch { return null; } };
  const key = { authorization: `Bearer ${ADMIN_KEY}` }, set = async (body) => json(await request(port, '/api/limits', { method: 'POST', headers: { ...key, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  // (each visitor of this test comes from the address it says: the servers see where a connection really comes from)
  const join = async (room, from, name, pass) => {
    const c = new Client(port, room, { localAddress: from, ...(pass && { pass }) });
    await c.opened;
    const no = await c.wait((m) => m.t === 'limit', 500);
    if (no) return { c, limit: no, code: await Promise.race([c.closed, sleep(3000)]) };
    return { c, welcome: await c.hello(name, 1) };
  };
  const made = [];
  try {
    const base = json(await request(port, '/api/limits', { headers: key })), noKey = await request(port, '/api/limits');
    const narrow = await set({ room: 2, total: 3, minute: 6 });
    check('limits: so many connections from one address — wide as delivered (30 in a room, 60 in all, 120 new ones a minute), the owner\'s to change',
      base?.on === true && base.limits.room === 30 && base.limits.total === 60 && base.limits.minute === 120 && noKey.status === 403 && narrow?.limits.room === 2 && narrow.limits.total === 3 && narrow.limits.minute === 6, [base, noKey.status, narrow]);
    const a1 = await join('la', A, 'A1'), a2 = await join('la', A, 'A2'), a3 = await join('la', A, 'A3');
    const a4 = await join('lb', A, 'A4'), a5 = await join('lb', A, 'A5'), b1 = await join('la', B, 'B1');
    made.push(a1, a2, a3, a4, a5, b1);
    check('limits: a third connection from one address in a room is told so and hung up on; so is a fourth in all; another address is not concerned',
      !!a1.welcome && !!a2.welcome && a3.limit?.of === 'room' && a3.limit.max === 2 && a3.code === 1013 && !!a4.welcome && a5.limit?.of === 'total' && a5.limit.max === 3 && !!b1.welcome, [a3.limit, a3.code, a5.limit, !!b1.welcome]);
    // the owner always gets in: the door gives them a note for that room
    const door = json(await request(port, '/api/door?want=la', { headers: key, from: A }));
    const boss = await join('la', A, 'Owner', door?.pass);
    made.push(boss);
    check('limits: the owner always gets in', door?.room === 'la' && !!door.pass && !!boss.welcome, [door?.room, !!door?.pass, boss.limit]);
    // two of them leave: there is room for that address again (the door hears of it within a few seconds)
    a1.c.ws.close(); a2.c.ws.close();
    let a6 = null;
    for (let k = 0; k < 16 && !a6?.welcome; k++) { await sleep(1000); a6 = await join('la', A, 'A6'); }
    made.push(a6);
    // new ones a minute, from an address that has not come yet: the second is the last
    await set({ room: 20, total: 20, minute: 2 });
    const C = '127.0.0.33', a7 = await join('lc', C, 'C1'), a8 = await join('lc', C, 'C2'), a9 = await join('lc', C, 'C3'), b2 = await join('lc', B, 'B2');
    made.push(a7, a8, a9, b2);
    // the page itself (src/net/Presence.js): told that its address has too many connections it says so, stays on
    // its own meanwhile, and comes in by itself when there is room
    await set({ room: 20, total: 1, minute: 0 });
    const held = await join('lp', '127.0.0.1', 'Held');
    made.push(held);
    const pia = new Presence({ name: 'Pia', room: 'lp', url: `ws://127.0.0.1:${port}/ws`, limitWait: { minute: 400, total: 400 } }), said = [];
    pia.on('limit', (e) => said.push(e));
    pia.connect();
    const refused = await until(() => said.length > 0, 8000), alone = pia.mode;
    held.c.ws.close();
    const cameIn = await until(() => pia.mode === 'online', 20000);
    pia.dispose();
    check('limits: the page says so when its address has too many connections, stays on its own meanwhile, and comes in by itself when there is room', !!held.welcome && refused && said[0].of === 'total' && said[0].max === 1 && alone !== 'online' && cameIn, [said.slice(0, 2), alone, pia.mode]);
    const back = await set({ reset: true });
    check('limits: when some have left that address may come in again; a third new connection in a minute is told to wait; the owner puts the limits back as they were',
      !!a6?.welcome && !!a7.welcome && !!a8.welcome && a9.limit?.of === 'minute' && a9.limit.max === 2 && !!b2.welcome && back?.limits.total === 60, [!!a6?.welcome, !!a7.welcome, !!a8.welcome, a9.limit, back?.limits]);
  } finally {
    for (const v of made) try { v?.c.ws.close(); } catch { /* closed */ }
    await server.stop();
    fs.rmSync(file, { force: true });
  }
}

const uncaught = [];
const warn = console.warn;
process.on('uncaughtException', (err) => uncaught.push(err));
process.on('unhandledRejection', (err) => uncaught.push(err));
setTimeout(() => {
  console.log('FAIL  the test run timed out');
  process.exit(1);
}, 420000).unref();
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
    await section('paid', () => testPaid(server));
    await section('accounts', () => testAccounts(server));
    await section('chatlog', () => testChatLog(server));
    await section('decency', () => testDecency(server));
    await section('things', () => testThings(server));
    await section('cloudflare', () => testCloudflare(server, fx));
    await section('crowd', () => testCrowd(startWorker, fx.dist));
    await section('moderation', () => testModeration(startWorker, fx.dist));
    await section('visitors', () => testVisitors(startWorker, fx.dist));
    await section('release', () => testRelease(startWorker, fx.dist));
    await section('door', () => testDoor(startWorker, fx.dist));
    await section('limits', () => testLimits(startWorker, fx.dist));
    await section('replay', () => testReplay(startWorker, fx.dist));
    await section('urooms', () => testUserRooms(startWorker, fx.dist));
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
    await section('paid', () => testPaid(server));
    await section('accounts', () => testAccounts(server));
    await section('chatlog', () => testChatLog(server));
    await section('decency', () => testDecency(server));
    await section('things', () => testThings(server));
    await section('crowd', () => testCrowd(startServer, fx.dist));
    await section('moderation', () => testModeration(startServer, fx.dist));
    await section('visitors', () => testVisitors(startServer, fx.dist));
    await section('release', () => testRelease(startServer, fx.dist));
    await section('door', () => testDoor(startServer, fx.dist));
    await section('limits', () => testLimits(startServer, fx.dist));
    await section('era', () => testEra(startServer, fx.dist));
    await section('replay', () => testReplay(startServer, fx.dist));
    await section('urooms', () => testUserRooms(startServer, fx.dist));
    const kept = (() => { try { return JSON.parse(fs.readFileSync(path.join(fx.tmp, 'scores.json'), 'utf8')); } catch { return null; } })();
    if (!ONLY.length || ONLY.includes('api')) check('api: the Node server keeps the boards and the visits in its file', kept?.['board:sky']?.all?.length === 2 && kept['board:sky'].all[0].at > 0 && kept['board:shoot']?.day?.list?.[0]?.name === 'Dana' && Object.keys(kept).some((k) => k.startsWith('visit:')), kept);
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
