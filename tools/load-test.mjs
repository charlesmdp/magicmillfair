// A crowd at the door of the fair: hundreds of visitors — real connections, speaking the real protocol — as
// the game does it: the door is asked which room, the relay of that room is dialled, a hello, then a walk.
// With the real rules (200 a room at the most, a new room at 50, a starting room takes everybody up to 20…):
//   1. an evening: the visitors arrive over a few seconds — everybody gets in, the rooms are shared out, none is
//      crowded, the list of the rooms says what is true, a state sent is received by the neighbours in time;
//   2. a link that goes round (230 at once want the same room): that room holds 200, never one more — the door
//      turns the others towards another room, the relay refuses whoever comes without asking — and the owner
//      still gets in;
//   3. the tide goes out (most of them leave): the rooms that have emptied are offered a livelier one — nobody
//      is moved, nobody is cut off — and those who accept change room.
// usage: node tools/load-test.mjs [--cloudflare] [--visitors=600]        (npm run test:load)
//   one PASS/FAIL line per check, exit code 1 when anything fails. The Node server by default; --cloudflare:
//   the real Worker and its Durable Objects in the local Workers runtime (wrangler dev).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { sleep, freePort, request } from './lib/net.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const CF = !!opt.cloudflare;
const VISITORS = Math.max(120, Number(opt.visitors) || (CF ? 400 : 600));
const ADMIN_KEY = 'load-test-admin-key', SECRET = 'load-test-secret';
const LINK = 230; // how many follow the same link at once
let failures = 0, total = 0;
function check(name, ok, detail) {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : `  → ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}
setTimeout(() => { console.log('FAIL  the load test timed out'); process.exit(1); }, 600000).unref();

// ------------------------------------------------------------------------------------------------ the servers
function fixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmf-load-'));
  const dist = path.join(tmp, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Atomic Oasis</title>');
  fs.writeFileSync(path.join(dist, 'version.json'), `${JSON.stringify({ commit: 'abc1234' })}\n`);
  return { tmp, dist };
}
async function startNode(fx) {
  const port = await freePort();
  const proc = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
    env: { ...process.env, ALLOWED_ORIGINS: '', MAX_PLAYERS: '', DIST_DIR: fx.dist, HOST: '127.0.0.1', TICK_HZ: '', ANTHROPIC_API_KEY: '', SCORE_SECRET: SECRET, ADMIN_KEY, SCORES_FILE: path.join(fx.tmp, 'scores.json'), STRIPE_SECRET_KEY: '', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const server = { port, proc, log: '', alive: () => proc.exitCode === null && proc.signalCode === null };
  proc.stdout.on('data', (d) => { server.log += d; });
  proc.stderr.on('data', (d) => { server.log += d; });
  const exited = new Promise((resolve) => proc.once('exit', resolve));
  server.stop = async () => { if (server.alive()) proc.kill('SIGTERM'); await exited; };
  for (let i = 0; i < 100 && server.alive(); i++) { const res = await request(port, '/healthz').catch(() => null); if (res && res.status === 200) return server; await sleep(50); }
  proc.kill('SIGKILL');
  throw new Error(`the server did not start:\n${server.log}`);
}
// (the settings come from wrangler.jsonc itself, minus the build step: what is tested is what gets deployed)
async function startWorker(fx) {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmf-load-cf-'));
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'wrangler.jsonc'), 'utf8').replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*/g, (m, str) => str || ''));
  delete config.build; delete config.$schema;
  config.main = path.join(ROOT, config.main);
  config.assets.directory = fx.dist;
  config.vars = { ...config.vars, ALLOWED_ORIGINS: '', SCORE_SECRET: SECRET, ADMIN_KEY };
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
  const kill = (signal) => { try { process.kill(-proc.pid, signal); } catch { /* gone */ } };
  server.stop = async () => { if (server.alive()) kill('SIGTERM'); await Promise.race([exited, sleep(4000).then(() => kill('SIGKILL'))]); fs.rmSync(dir, { recursive: true, force: true }); };
  for (let i = 0; i < 400 && server.alive(); i++) { const res = await request(port, '/healthz').catch(() => null); if (res && res.status === 200) return server; await sleep(100); }
  kill('SIGKILL');
  throw new Error(`the Worker did not start:\n${server.log}`);
}

// ------------------------------------------------------------------------------------------------ a visitor
let PORT = 0, serial = 0;
const rnd = (() => { let s = 20261124; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
const everybody = new Set(); // the visitors who are connected
const json = (res) => { try { return JSON.parse(res.body.toString()); } catch { return null; } };

class Visitor {
  constructor() {
    this.n = ++serial;
    // (an address of their own: the door counts how often each address asks. The Node server is told by a header,
    // as a proxy would tell it; the Worker only believes where a connection comes from — any 127.x.y.z is this machine)
    this.from = { 'x-forwarded-for': `10.${1 + (this.n >> 16)}.${(this.n >> 8) & 255}.${this.n & 255}` };
    this.local = CF ? `127.${1 + (this.n >> 16)}.${(this.n >> 8) & 255}.${1 + (this.n % 250)}` : undefined;
    this.room = ''; this.id = 0; this.ws = null; this.x = (rnd() - 0.5) * 500; this.z = (rnd() - 0.5) * 500; this.yaw = 0;
    this.offers = []; this.told = {}; this.cut = null; this.batches = 0; this.turned = 0; this.probe = null; this.watch = 0; this.seen = [];
  }

  async ask(query = {}, key) {
    const q = new URLSearchParams(Object.entries(query).filter(([, v]) => v)).toString();
    for (let tries = 0; tries < 5; tries++) {
      const res = await request(PORT, `/api/door${q ? `?${q}` : ''}`, { headers: { ...this.from, ...(key && { authorization: `Bearer ${key}` }) }, from: this.local }).catch(() => null);
      const a = res && res.status === 200 ? json(res) : null;
      if (a && a.room) return a;
      await sleep(300);
    }
    return null;
  }

  // The relay of a room is dialled: 'welcome', 'full', 'closed', or 'lost' (no answer).
  dial(room, pass) {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${encodeURIComponent(room)}${pass ? `&pass=${encodeURIComponent(pass)}` : ''}`, { headers: this.from, perMessageDeflate: false, ...(this.local && { localAddress: this.local }) });
      let done = false;
      const end = (how) => { if (!done) { done = true; clearTimeout(timer); resolve(how); } };
      const timer = setTimeout(() => { try { ws.terminate(); } catch { /* gone */ } end('lost'); }, 20000);
      ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', name: `Visitor ${this.n}`, color: this.n % 16, v: 2, dev: `load-test-device-${String(this.n).padStart(6, '0')}`, b: 'abc1234' })));
      ws.on('message', (data) => {
        const text = data.toString();
        if (text.startsWith('{"t":"u"')) {
          // (states: counted — and looked into only by those who time how long one takes to come)
          this.batches++;
          if (this.watch) { const at = text.indexOf(`[${this.watch},`); if (at >= 0) { const row = text.slice(at + 1, text.indexOf(']', at)).split(','); this.seen.push([Number(row[4]), performance.now()]); } }
          return;
        }
        if (text.startsWith('{"t":"m"') || text.startsWith('{"t":"join"') || text.startsWith('{"t":"leave"') || text.startsWith('{"t":"w"')) return;
        let m; try { m = JSON.parse(text); } catch { return; }
        if (m.t === 'welcome') { this.ws = ws; this.room = room; this.id = m.id; everybody.add(this); end('welcome'); }
        else if (m.t === 'full') end('full');
        else if (m.t === 'closed') end('closed');
        else if (m.t === 'quiet') this.offers.push(m);
      });
      ws.on('close', (code) => { if (this.ws === ws) { this.ws = null; everybody.delete(this); if (!this.leaving) this.cut = code; } end('lost'); });
      ws.on('error', () => {});
    });
  }

  /** As the game does: the door, then the relay; a room that says it is full sends one back to the door. */
  async arrive({ want = '', key = '' } = {}) {
    const not = [];
    for (let tries = 0; tries < 6; tries++) {
      const a = await this.ask({ want, not: not.join(',') }, key);
      if (!a) return false;
      if (a.full) this.told.full = a.full;
      const how = await this.dial(a.room, a.pass);
      if (how === 'welcome') { this.why = a.why; return true; }
      this.turned++;
      not.push(a.room);
    }
    return false;
  }

  /** To another room, as the game does it: the door is asked first; the same visitor, another connection. */
  async change(to) {
    const a = await this.ask({ want: to });
    if (!a || a.room !== to) return false;
    const was = this.ws;
    this.leaving = true; this.ws = null; everybody.delete(this);
    try { was?.close(); } catch { /* gone */ }
    const how = await this.dial(to, a.pass);
    this.leaving = false;
    return how === 'welcome';
  }

  walk() {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.x += (rnd() - 0.5) * 3; this.z += (rnd() - 0.5) * 3;
    if (!this.probe) this.yaw = Math.round((rnd() * 6 - 3) * 1000) / 1000;
    this.ws.send(JSON.stringify({ t: 's', p: [Math.round(this.x * 100) / 100, 3, Math.round(this.z * 100) / 100, this.yaw], a: 1, f: 0 }));
  }

  leave() { this.leaving = true; try { this.ws?.close(); } catch { /* gone */ } this.ws = null; everybody.delete(this); }
}

const sizes = () => { const by = new Map(); for (const v of everybody) by.set(v.room, (by.get(v.room) || 0) + 1); return by; };
const order = (by) => [...by].sort((a, b) => (a[0] === 'main' ? 1 : Number(a[0].split('-')[1])) - (b[0] === 'main' ? 1 : Number(b[0].split('-')[1])));
const show = (by) => order(by).map(([name, n]) => `${name === 'main' ? 'Room 1' : `Room ${name.split('-')[1]}`}: ${n}`).join(' · ');
const adminRooms = async () => json(await request(PORT, '/api/rooms', { headers: { authorization: `Bearer ${ADMIN_KEY}`, 'x-forwarded-for': '10.250.0.1' } }));
const publicRooms = async () => json(await request(PORT, '/api/rooms', { headers: { 'x-forwarded-for': '10.250.0.2' } }));
/** Waits until the server's list of the rooms says what is true (a room of the Worker says so a few seconds late). */
async function agree(ms = 15000) {
  let list = null, truth = '';
  for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) {
    truth = order(sizes()).map(([name, n]) => `${name}:${n}`).join();
    list = await adminRooms();
    if (list?.rooms?.map((r) => `${r.name}:${r.players}`).join() === truth) return { ok: true, list, truth };
  }
  return { ok: false, list, truth };
}

// ------------------------------------------------------------------------------------------------- the test
const fx = fixture();
let server = null, walking = null;
try {
  server = CF ? await startWorker(fx) : await startNode(fx);
  PORT = server.port;
  console.log(`${CF ? 'the Worker (wrangler dev)' : 'the Node server'} on port ${PORT}: ${VISITORS} visitors, then ${LINK} more through one link`);
  const rules = (await adminRooms())?.rules;
  check('the rules of the door are the usual ones: 200 a room at the most, a new room at 50, a starting room takes everybody up to 20, quiet at 8', rules?.max === 200 && rules.open === 50 && rules.start === 20 && rules.low === 8, rules);
  walking = setInterval(() => { for (const v of everybody) if (v.n % 2 === walking.turn) v.walk(); walking.turn = 1 - walking.turn; }, 250); // (each visitor: a step twice a second)
  walking.turn = 0;

  // ---- 1. an evening: the visitors arrive, thirty a second
  const t0 = Date.now(), crowd = [], arrivals = [];
  let peak = 0;
  for (let i = 0; i < VISITORS; i++) {
    const v = new Visitor();
    crowd.push(v);
    arrivals.push(v.arrive());
    if (i % 3 === 2) { await sleep(100); peak = Math.max(peak, ...sizes().values()); }
  }
  const got = await Promise.all(arrivals);
  const took = (Date.now() - t0) / 1000;
  await sleep(1500);
  const after1 = sizes(), list1 = await agree();
  const n1 = [...after1.values()], shared = n1.filter((n) => n >= 20).length;
  console.log(`  after ${took.toFixed(1)} s: ${show(after1)}`);
  check(`an evening: ${VISITORS} visitors arrive in ${took.toFixed(0)} s — every one of them gets in, at the first room they are sent to`,
    got.every(Boolean) && everybody.size === VISITORS && crowd.every((v) => v.turned === 0 && v.cut === null), { in: everybody.size, refused: got.filter((ok) => !ok).length, turned: crowd.filter((v) => v.turned).length, cut: crowd.filter((v) => v.cut !== null).length });
  check('an evening: the rooms are shared out — none crowded (they hold about fifty: the largest far fewer than 200), all but the last one opened well alive, and there are about as many as fifties of visitors',
    Math.max(...n1) <= 80 && shared >= n1.length - 1 && n1.length >= Math.floor(VISITORS / 65) && n1.length <= Math.ceil(VISITORS / 40), { rooms: n1.length, largest: Math.max(...n1), smallest: Math.min(...n1), peak });
  const pub1 = await publicRooms();
  check('an evening: the list of the rooms says what is true — how many in each — to the administrators and to anybody', list1.ok && pub1?.rooms?.length === n1.length && pub1.rooms.reduce((s, r) => s + r.players, 0) === VISITORS && pub1.max === 200, { truth: list1.truth, list: list1.list?.rooms?.map((r) => `${r.name}:${r.players}`).join() });
  // how long a state takes from one visitor to their neighbours (three pairs, in three rooms, twenty states each)
  const pairs = order(after1).slice(0, 3).map(([room]) => { const here = crowd.filter((v) => v.room === room); const a = here[0], b = here[1]; b.x = a.x + 1; b.z = a.z + 1; b.walk(); b.watch = a.id; a.probe = []; return [a, b]; });
  await sleep(1200);
  for (let k = 1; k <= 20; k++) {
    for (const [a] of pairs) { a.yaw = k / 1000; a.probe.push([a.yaw, performance.now()]); a.walk(); }
    await sleep(300);
  }
  await sleep(1000);
  const delays = [];
  for (const [a, b] of pairs) for (const [yaw, sent] of a.probe) { const hit = b.seen.find(([y, at]) => Math.abs(y - yaw) < 1e-6 && at >= sent); if (hit) delays.push(hit[1] - sent); }
  delays.sort((x, y) => x - y);
  const median = delays[Math.floor(delays.length / 2)] || 0, p95 = delays[Math.floor(delays.length * 0.95)] || 0;
  for (const [a, b] of pairs) { a.probe = null; b.watch = 0; }
  check(`an evening: with everybody walking, what one does reaches the neighbours in time (median ${Math.round(median)} ms, 95 % under ${Math.round(p95)} ms — the relay sends ${CF ? 10 : 12} times a second)`,
    // (a state overtaken by the next one before the relay's round is never sent — only the newest matters —: on
    // a machine that is busy with something else, a few of the sixty are not heard as such)
    delays.length >= 45 && median < 400 && p95 < 1500, { heard: delays.length, of: 60, median: Math.round(median), p95: Math.round(p95) });

  // ---- 2. a link goes round: 230 at once want the first room
  const before2 = sizes().get('main') || 0;
  const fans = Array.from({ length: LINK }, () => new Visitor());
  let most = 0;
  const watchMain = setInterval(() => { most = Math.max(most, sizes().get('main') || 0); }, 50);
  const came = await Promise.all(fans.map((v, i) => sleep(i * 10).then(() => v.arrive({ want: 'main' }))));
  // …and thirty who come without asking the door
  const barging = await Promise.all(Array.from({ length: 30 }, () => new Visitor().dial('main')));
  await sleep(1500);
  clearInterval(watchMain);
  const main2 = sizes().get('main') || 0, inMain = fans.filter((v) => v.room === 'main').length, elsewhere = fans.filter((v) => v.room && v.room !== 'main');
  const count2 = json(await request(PORT, '/api/presence?room=main'))?.players;
  console.log(`  the first room held ${before2}; ${LINK} more asked for it: ${inMain} got in, ${elsewhere.length} were sent elsewhere (${elsewhere.filter((v) => v.turned).length} of them after the relay itself said no). Now: ${show(sizes())}`);
  check('a link that goes round: the room holds 200 and never one more — the others are told it is full and get another room, nobody is left outside',
    came.every(Boolean) && main2 === 200 && most <= 200 && count2 === 200 && inMain === 200 - before2 && elsewhere.length === LINK - inMain && elsewhere.every((v) => v.told.full === 'main') && everybody.size === VISITORS + LINK, { before: before2, main: main2, most, count: count2, in: inMain, elsewhere: elsewhere.length, told: elsewhere.filter((v) => v.told.full === 'main').length, here: everybody.size });
  check('a link that goes round: whoever comes without asking the door is turned away by the relay itself', barging.every((how) => how === 'full') && (sizes().get('main') || 0) === 200, barging.reduce((by, how) => { by[how] = (by[how] || 0) + 1; return by; }, {}));
  const boss = new Visitor(), bossIn = await boss.arrive({ want: 'main', key: ADMIN_KEY });
  await sleep(500);
  const count3 = json(await request(PORT, '/api/presence?room=main'))?.players;
  check('a link that goes round: the owner still gets in — the only one over the limit', bossIn && boss.room === 'main' && count3 === 201 && crowd.concat(fans).every((v) => v.cut === null), { in: bossIn, room: boss.room, count: count3 });
  boss.leave();

  // ---- 3. the tide goes out: more than eight in ten leave
  const all = [...everybody];
  for (const v of all) if (rnd() < 0.85) v.leave();
  const stayed = [...everybody];
  console.log(`  ${all.length - stayed.length} have left, ${stayed.length} stay: ${show(sizes())}`);
  // (the door puts its rooms in order when it hears from them — a few seconds — or when somebody knocks)
  let offered = [];
  for (const end = Date.now() + 40000; Date.now() < end; await sleep(1000)) { offered = stayed.filter((v) => v.offers.length); if (offered.length && Date.now() > end - 22000) break; }
  const quietRooms = new Set(offered.map((v) => v.room)), tos = new Set(offered.map((v) => v.offers[0].to)), sizeNow = sizes();
  const sensible = offered.every((v) => v.offers[0].to !== v.room && (sizeNow.get(v.offers[0].to) || 0) >= (sizeNow.get(v.room) || 0));
  check('the tide goes out: the rooms that have emptied are offered a livelier one — every visitor of such a room is told, nobody is moved, nobody is cut off',
    offered.length > 0 && sensible && [...quietRooms].every((room) => stayed.filter((v) => v.room === room).every((v) => v.offers.length)) && stayed.every((v) => v.cut === null && v.ws), { offered: offered.length, from: [...quietRooms], to: [...tos], cut: stayed.filter((v) => v.cut !== null).length });
  // six in ten accept
  const moving = offered.filter(() => rnd() < 0.6), movedOk = await Promise.all(moving.map((v) => v.change(v.offers[0].to)));
  await sleep(1500);
  const after3 = sizes(), list3 = await agree(20000), pub3 = await publicRooms();
  console.log(`  ${moving.length} of the ${offered.length} who were offered another room took it: ${show(after3)}`);
  check('the tide goes out: those who accept change room — the same visitor, another room — and the lists follow; the rooms gone quiet are marked so',
    movedOk.every(Boolean) && moving.every((v) => v.room === v.offers[0].to) && list3.ok && [...quietRooms].filter((room) => after3.has(room)).every((room) => pub3?.rooms?.find((r) => r.name === room)?.quiet === true) && Math.max(...after3.values()) <= 200,
    { moved: movedOk.filter(Boolean).length, of: moving.length, truth: list3.truth, list: list3.list?.rooms?.map((r) => `${r.name}:${r.players}${r.phase === 'quiet' ? 'q' : ''}`).join() });
  const trouble = CF ? server.log.split('\n').filter((line) => /\[wrangler:error\]|\[ERROR\]|Uncaught/.test(line)) : server.log.split('\n').filter((line) => /error|exception/i.test(line));
  check('the server is still running, and has complained of nothing', server.alive() && !trouble.length, trouble.slice(0, 5));
} catch (err) {
  check('load test', false, String(err && err.stack ? err.stack : err));
} finally {
  clearInterval(walking);
  for (const v of [...everybody]) v.leave();
  await sleep(300);
  if (server) await server.stop();
  fs.rmSync(fx.tmp, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} of ${total} checks FAILED` : `\nAll ${total} checks passed`);
process.exit(failures ? 1 : 0);
