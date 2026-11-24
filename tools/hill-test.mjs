// Checks of Uphill Battle, without a browser: the slope is open ground — no tree on it, no water, an even climb;
// what rolls is the same for everybody and gets worse towards the top; a log is jumped, the rest is kept out of
// the way of; what hits carries one back down, never to the start; the climbs leave together on the shared
// clock; a bot gets to the bell.
// usage: node tools/hill-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { HILL, nextStart, thingAt, rolling, startClimb, stepClimb, slopeAt, botInput, botClimb } from '../src/world/zones/games/hill/slope.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const H = HILL;
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/world/world.json'), 'utf8'));
const { data, info } = await sharp(path.join(ROOT, 'public/assets/world/height.png')).raw().toBuffer({ resolveWithObject: true });
const [lo, hi] = meta.heightRange, N = info.width, half = N / 2;
const height = (x, z) => { const i = (Math.floor(Math.min(half - 1, Math.max(-half, z)) + half) * N + Math.floor(Math.min(half - 1, Math.max(-half, x)) + half)) * info.channels; return ((data[i] * 256 + data[i + 1]) / 65535) * (hi - lo) + lo; };
const T = new Float32Array(fs.readFileSync(path.join(ROOT, 'public/assets/world/trees.bin')).buffer.slice(0));
const run = (st, secs, drive, stop) => { const input = { up: 0, side: 0, jump: false }, events = [], seen = []; for (let t = 0; t < secs && !st.over; t += H.step) { input.jump = false; drive?.(st, input, t); stepClimb(st, H.step, input, events); for (const e of events) seen.push({ ...e, at: t }); events.length = 0; if (stop?.(st, seen)) break; } return seen; };
/** A moment of the world's clock when a thing of that kind is about to come past metre `s`, and that thing. */
const meeting = (kind, s) => { for (let c = 20; c < 2000; c += 0.05) { let found = null; rolling(c, (t) => { if (t.kind === kind && t.s > s + 6 && t.s < s + 7) found = { ...t }; }); if (found) return { clock: c, thing: found }; } return null; };

{
  let trees = 0, worst = 0, wet = 0; const hs = [];
  for (let i = 0; i + 5 < T.length; i += 6) { const px = T[i] - H.from.x, pz = T[i + 1] - H.from.z, al = px * Math.sin(H.yaw) + pz * Math.cos(H.yaw), ac = Math.abs(-px * Math.cos(H.yaw) + pz * Math.sin(H.yaw)); if (al > -5 && al < H.length + 4 && ac < H.half + 2.5) trees++; }
  for (let s = 0; s <= H.length; s += 2) { const p = slopeAt(s, 0), h = height(p.x, p.z); hs.push(h); if (h < 10.6) wet++; for (const u of [-H.half, H.half]) { const q = slopeAt(s, u); worst = Math.max(worst, Math.abs(height(q.x, q.z) - h)); } }
  const rise = hs[hs.length - 1] - hs[0], bumps = Math.max(...hs.map((h, i) => Math.abs(h - (hs[0] + (rise * i) / (hs.length - 1)))));
  check('the slope is open ground: no tree on it, none of it under water', trees === 0 && wet === 0, `${trees} trees`);
  check('an even climb from the pond towards the old tree', rise > 16 && bumps < 2.5 && worst < 2.2, `${rise.toFixed(0)} m up in ${H.length} m, never more than ${bumps.toFixed(1)} m off the straight, ${worst.toFixed(1)} m of tilt across at most`);
}
{
  // what rolls: the same for everybody, every kind, each down to its line
  const a = thingAt(41, 60.3), b = thingAt(41, 60.3);
  const kinds = {}, ends = { log: 99, barrel: 99, boulder: 99 }; let most = 0;
  for (let c = 100; c < 400; c += 0.25) { let n = 0; rolling(c, (t) => { n++; kinds[t.kind] = (kinds[t.kind] || 0) + 1; ends[t.kind] = Math.min(ends[t.kind], t.s); if (Math.abs(t.u) + t.half > H.half + 0.01) kinds.out = 1; }); most = Math.max(most, n); }
  check('what rolls is the same for everybody, and stays on the slope', JSON.stringify(a) === JSON.stringify(b) && !kinds.out);
  check('logs, barrels and boulders — and it gets worse as one climbs: the boulders stop first, then the barrels', kinds.log > kinds.barrel && kinds.barrel > kinds.boulder && ends.log < 1 && Math.abs(ends.barrel - H.kinds.barrel.end) < 1 && Math.abs(ends.boulder - H.kinds.boulder.end) < 1, `logs to the foot, barrels down to ${H.kinds.barrel.end} m, boulders to ${H.kinds.boulder.end} m; ${most} rolling at once at most`);
  const apex = (H.jump * H.jump) / (2 * H.g);
  check('a jump clears a log, not a barrel', apex > H.kinds.log.clear + 0.2 && apex < H.kinds.barrel.r * 2 + 0.1, `a jump goes ${apex.toFixed(2)} m up`);
}
{
  // a log: run into, it carries one back down; jumped, nothing happens
  const m = meeting('log', 10), into = startClimb(m.clock, m.thing.u), over = startClimb(m.clock, m.thing.u); into.s = over.s = 10;
  const seen = run(into, 4, (q, i) => { i.up = 1; }, (q, ev) => ev.some((e) => e.type === 'up')); let low = 99; for (const e of seen) void e;
  const gone = (q, n) => { let d = -9; rolling(q.t0 + q.clock, (t) => { if (t.n === n) d = t.s - q.s; }); return d; };
  run(over, 3, (q, i) => { i.up = 1; const d = gone(q, m.thing.n); i.jump = d > 0 && d < 3.2 && q.h <= 0; }, (q) => gone(q, m.thing.n) < -1.5);
  low = into.s;
  check('run into, a log carries one back down a few metres — not to the start', seen.some((e) => e.type === 'hit' && e.kind === 'log') && into.hits === 1 && low < 10 && low > 2, `back at ${low.toFixed(1)} m`);
  check('jumped in time, nothing happens', over.hits === 0 && over.jumps === 1 && over.s > 11);
  const mb = meeting('boulder', 50), under = startClimb(mb.clock, mb.thing.u), aside = startClimb(mb.clock, mb.thing.u + (mb.thing.u > 0 ? -2.6 : 2.6)); under.s = aside.s = 50;
  const past = (n) => (q) => { let d = -9; rolling(q.t0 + q.clock, (t) => { if (t.n === n) d = t.s - q.s; }); return d < -2.5 || q.hits > 0; };
  run(under, 3, (q, i) => { i.up = 1; i.jump = q.h <= 0; }, past(mb.thing.n)); run(aside, 3, (q, i) => { i.up = 1; }, past(mb.thing.n));
  check('a boulder cannot be jumped: one keeps out of its way', under.hits === 1 && aside.hits === 0);
}
{
  const s0 = nextStart(100_000), s1 = nextStart(s0.at + 1);
  check('the climbs leave together: a start every ten seconds on the shared clock, each with its name', s0.at % (H.every * 1000) === 0 && s0.wait >= 3 && s0.wait < 3 + H.every && s1.at - s0.at === H.every * 1000 && s1.name !== s0.name && H.starts.includes(s0.name), `${s0.name}, then ${s1.name}`);
  const runs = []; for (let k = 0; k < 12; k++) runs.push(botClimb(1000 + k * H.every));
  check('a bot gets to the bell, whichever start it takes, hit twice at most', runs.every((r) => r.over && r.hits <= 3 && r.time < 20000) && runs.filter((r) => r.hits === 0).length >= 3, runs.map((r) => `${(r.time / 1000).toFixed(1)} s`).join(' · '));
  const plod = startClimb(1000); run(plod, 120, (q, i) => { i.up = 1; });
  check('who only runs straight up gets there too, much later', plod.over && plod.time > Math.min(...runs.map((r) => r.time)) * 1.4, `${(plod.time / 1000).toFixed(1)} s, hit ${plod.hits} times`);
  const at = (dt) => { const st = startClimb(1040), input = { up: 0, side: 0, jump: false }; let acc = 0; for (let t = 0; t < 60 && !st.over; t += dt) { acc += dt; while (acc >= H.step && !st.over) { acc -= H.step; botInput(st, input); stepClimb(st, H.step, input, null); } } return st.time; };
  check('the same climb at 30 and at 144 frames a second', at(1 / 30) === at(1 / 144));
  console.log(`      for the board of scores: hill: { order: 'asc', min: ${Math.floor((Math.min(...runs.map((r) => r.time)) * 0.85) / 1000) * 1000}, max: 600_000 }`);
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
