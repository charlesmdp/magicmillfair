// Checks of The Endless Pond, without a browser: the circuit fits where it is put (deep water all round, a
// jetty's length from the bank), its rules are what they say — the legs run, each lap faster; one jumps the
// gaps, jumps again in the air, dives; the rafts drift, so the gaps of the inner ring move; each ring has its
// arm, and the other ring is clear of it; fireflies make lily pads, and a lily pad puts one back on, once — it
// is the same run on every device, and a bot runs it lap after lap.
// usage: node tools/pond-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { POND, startRun, stepRun, runPose, support, speedAt, driftAt, armAt, fireflyAt, score, botInput, botRun } from '../src/world/zones/games/pond/ring.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const TAU = Math.PI * 2, P = POND;
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/world/world.json'), 'utf8'));
const { data, info } = await sharp(path.join(ROOT, 'public/assets/world/height.png')).raw().toBuffer({ resolveWithObject: true });
const [lo, hi] = meta.heightRange, N = info.width, half = N / 2;
const height = (x, z) => { const i = (Math.floor(Math.min(half - 1, Math.max(-half, z)) + half) * N + Math.floor(Math.min(half - 1, Math.max(-half, x)) + half)) * info.channels; return ((data[i] * 256 + data[i + 1]) / 65535) * (hi - lo) + lo; };
const depth = (x, z) => P.level - height(x, z);

/** Runs `st` for `secs` (or until `stop(st)`); `drive(st, input, t)` presses. Returns what happened. */
const run = (st, secs, drive, stop) => {
  const input = { jump: false, down: false, side: 0 }, events = [], seen = [];
  for (let t = 0; t < secs && !st.over; t += P.step) {
    input.jump = false; input.down = false; input.side = 0;
    drive?.(st, input, t);
    stepRun(st, P.step, input, events);
    for (const e of events) seen.push({ ...e, at: t });
    events.length = 0;
    if (stop?.(st, seen)) break;
  }
  return seen;
};
/** A clock of the world at which nothing but the stones is in the way for a while: the arms far, the rafts as asked. */
const quiet = (a = 0) => { for (let c = 0; c < 400; c += 0.37) if (P.arms.every((arm) => { const d = Math.abs(((armAt(arm, c) - a) % TAU + TAU + Math.PI) % TAU - Math.PI); return d > 2.2; })) return c; return 0; };

// ------------------------------------------------------------------------------------------------ where it is
{
  let least = 1e9;
  for (let k = 0; k < 72; k++) { const a = (k / 72) * TAU; for (const r of [0, P.rings[1], P.rings[0], P.rings[0] + 0.9]) least = Math.min(least, depth(P.x + Math.cos(a) * r, P.z + Math.sin(a) * r)); }
  check('the circuit lies on deep water: who falls in swims', least > 1.4, `at least ${least.toFixed(1)} m of water under it`);
  let bank = P.rings[0] + 0.9;
  while (bank < 40 && depth(P.x + bank, P.z) > 0.05) bank += 0.25;
  check('a jetty of a few metres joins its first stone to the bank', bank - P.rings[0] > 2 && bank - P.rings[0] < 11, `${(bank - P.rings[0]).toFixed(1)} m of planks`);
  check('it is not fourteen metres across', P.rings[0] * 2 >= 12 && P.rings[0] * 2 <= 15, `${(P.rings[0] * 2).toFixed(1)} m`);
  const deck = Math.hypot(P.x + 152.5, P.z - 37.5), birch = Math.hypot(P.x + 133.4, P.z - 30.7);
  check('it keeps clear of the deck on the pond and of the island of the birch', deck > 22 && birch > 16, `${deck.toFixed(0)} m and ${birch.toFixed(0)} m away`);
}

// ------------------------------------------------------------------------------------------------ the rings
{
  const slot = TAU / P.stones, gaps = P.holes.map((k, i) => (P.holes[(i + 1) % P.holes.length] - k + P.stones) % P.stones);
  check('the outer ring: stones with single gaps, never two together, a few stones between them', P.holes.length >= 4 && gaps.every((g) => g >= 3) && !P.holes.includes(0) && !P.holes.includes(P.stones - 1), `${P.stones - P.holes.length} stones, ${P.holes.length} gaps of ${(slot * P.rings[0]).toFixed(2)} m`);
  const on = (ring, a, c) => support(ring, a, c, 0);
  check('…one can stand on a stone, not in a gap', on(0, 0.5 * slot, 0) && !on(0, (P.holes[0] + 0.5) * slot, 0) && on(0, (P.holes[0] + 1.5) * slot, 0));
  const pitch = TAU / P.rafts, gap = (pitch - P.raft) * P.rings[1];
  check('the inner ring: rafts of logs with gaps one jump wide', gap > 1.5 && gap < 0.56 * P.speed[0] - 0.3 + 0.9, `${P.rafts} rafts ${(P.raft * P.rings[1]).toFixed(1)} m long, gaps of ${gap.toFixed(1)} m`);
  const a = P.raft / 2;
  check('…that drift: where there was a raft there is a gap a few seconds later', on(1, a, 0) && !on(1, a, (P.raft / 2 + (pitch - P.raft) / 2) / Math.abs(P.drift)), `${(Math.abs(P.drift) * P.rings[1]).toFixed(2)} m/s, against the runner`);
  check('the inner ring is the shorter way round', P.rings[1] / P.rings[0] < 0.8, `${(TAU * P.rings[1]).toFixed(0)} m a lap against ${(TAU * P.rings[0]).toFixed(0)} m`);
}

// ------------------------------------------------------------------------------------------------ the run
{
  // the legs run by themselves, and each lap is run faster
  check('each lap is run a little faster than the last, up to a limit', speedAt(1) > speedAt(0) * 1.03 && speedAt(10) > speedAt(0) * 1.4 && speedAt(500) === P.speed[2], `${(speedAt(0) * 3.6).toFixed(0)} km/h on the first, ${(speedAt(10) * 3.6).toFixed(0)} on the eleventh, never more than ${(P.speed[2] * 3.6).toFixed(0)}`);
  const idle = startRun(quiet()), seen = run(idle, 10);
  check('who does nothing runs into the first gap', idle.over && idle.why === 'gap' && score(idle) < 0.25 && seen.some((e) => e.type === 'fall'), `in the water after ${idle.clock.toFixed(1)} s, ${score(idle).toFixed(1)} laps`);
  // a jump over the first gap; a second jump in the air carries further; a dive brings one down
  const slot = TAU / P.stones, edge = P.holes[0] * slot * P.rings[0];
  const jumper = (far) => { const st = startRun(quiet()); let air = 0, top = 0; run(st, 4, (q, i) => { const d = edge - q.turned * P.rings[0]; i.jump = (d < 0.5 && d > 0.3 && q.h <= 0) || (far && q.jumps === 1 && q.vh < 0.4 && q.vh > 0); if (q.h > 0) air += P.step; top = Math.max(top, q.h); }, (q) => q.turned * P.rings[0] > edge + 8); return { st, air, top }; };
  const one = jumper(false), two = jumper(true);
  check('a jump at the edge of a gap carries over it', !one.st.over && one.top > 0.6 && one.top < 1, `${one.top.toFixed(2)} m up, ${one.air.toFixed(2)} s in the air: ${(one.air * P.speed[0]).toFixed(1)} m for a gap of ${(slot * P.rings[0]).toFixed(1)} m`);
  check('a second jump in the air carries further, and higher', two.air > one.air + 0.25 && two.top > one.top + 0.3, `${two.air.toFixed(2)} s in the air, ${two.top.toFixed(2)} m up`);
  const diver = startRun(quiet()); let down = 0; run(diver, 2, (q, i, t) => { i.jump = t < 0.01; i.down = q.h > 0.5 && q.vh > 0 && !down; if (i.down) down = t; }, (q) => q.h === 0 && down > 0);
  check('a dive brings one down at once', down > 0 && diver.clock - down < 0.2, `down ${(diver.clock - down).toFixed(2)} s after it`);
  // a step aside: onto the other ring
  const stepper = startRun(0); let c = 0; while (!support(1, 0.12, c + 0.3, -0.3)) c += 0.05; // (a raft beside the first stone)
  const side = startRun(c); run(side, 0.6, (q, i, t) => { i.side = t < 0.01 ? 1 : 0; });
  check('a step aside takes one to the other ring', !side.over && side.ring === 1 && Math.abs(runPose(side).r - P.rings[1]) < 0.01);
  void stepper;
}

// ------------------------------------------------------------------------------------------------ the arms
{
  const [low, high] = P.arms;
  check('two arms turn about the post: a low beam over the logs, a curtain over the stones — never both over one ring', !low.high && high.high && low.far <= high.near && low.far > P.rings[1] && high.near < P.rings[0] && low.far < P.rings[0] - 0.5 && high.near > P.rings[1] + 0.5 && low.turn > 0 && high.turn < 0);
  // the curtain: on the stones one slides under it, or is swept off; from the logs it is left to pass
  const meet = (ring, arm) => { for (let c = 0; c < 200; c += 0.01) { const st = startRun(c); st.ring = st.to = ring; const a = 1.0 / P.rings[ring] * (ring ? 1 : 1); const d = ((armAt(arm, c + 0.25) - (speedAt(0) / P.rings[ring]) * 0.25 - 0) % TAU + TAU) % TAU; if (Math.abs(d) < 0.01 && support(ring, 0, c, -0.3) && support(ring, 0.25 * speedAt(0) / P.rings[ring], c + 0.25, -0.3)) return c; void a; } return -1; };
  const cHigh = meet(0, high), cLow = meet(1, low);
  const facing = (ring, c, drive) => { const st = startRun(c); st.ring = st.to = ring; run(st, 0.5, drive); return st; };
  check('the curtain sweeps off who stands under it; a slide goes under', cHigh >= 0 && facing(0, cHigh).why === 'high' && !facing(0, cHigh, (q, i, t) => { i.down = t < 0.01; }).over);
  check('…and from the logs it is left to pass', cHigh >= 0 && facing(1, cHigh).why !== 'high');
  check('the low beam trips who runs into it; a jump clears it', cLow >= 0 && facing(1, cLow).why === 'low' && facing(1, cLow, (q, i, t) => { i.jump = t < 0.01; }).why !== 'low', `met after a quarter of a second at clock ${cLow.toFixed(2)}: ${facing(1, cLow).why || 'nothing'}`);
  check('…and it does not reach the stones', cLow >= 0 && facing(0, cLow).why !== 'low');
}

// ------------------------------------------------------------------------------------------------ fireflies and lily pads
{
  const seen = new Set(); for (let c = 0; c < 900; c += P.fly.every) { const f = fireflyAt(c); seen.add(`${f.ring}:${Math.floor(f.a)}`); }
  check('a firefly hangs over one ring or the other, and moves every few seconds', seen.size > 8 && fireflyAt(0).n !== fireflyAt(P.fly.every).n, `${seen.size} places in a quarter of an hour`);
  // caught by who jumps under it; three make a lily pad; a lily pad puts back on the circuit, once
  const st = startRun(0); st.flies = P.fly.lily - 1;
  const f = fireflyAt(0); st.ring = st.to = f.ring; st.a = f.a - 0.3 / P.rings[f.ring]; st.safe = 0;
  const ev = run(st, 0.4, (q, i, t) => { i.jump = t < 0.01; });
  check('a firefly is caught by who jumps under it, and the third makes a lily pad', ev.some((e) => e.type === 'fly') && ev.some((e) => e.type === 'lily') && st.lilies === 1, `${st.flies} fireflies, ${st.lilies} lily pad`);
  const saved = startRun(quiet()); saved.lilies = 1;
  const ev2 = run(saved, 12, null, (q) => q.over);
  const first = ev2.find((e) => e.type === 'saved'), fall = ev2.find((e) => e.type === 'fall');
  check('who falls in with a lily pad is put back on the circuit — once', !!first && !!fall && fall.at > first.at + 0.5 && saved.lilies === 0 && saved.saved === 1, first ? `saved after ${first.at.toFixed(1)} s, in the water for good after ${fall.at.toFixed(1)} s` : 'never saved');
}

// ------------------------------------------------------------------------------------------------ the same on every device, and a bot
{
  const laps = (dt) => { const st = startRun(31.7), input = { jump: false, down: false, side: 0 }; let acc = 0; for (let t = 0; t < 40 && !st.over; t += dt) { acc += dt; while (acc >= P.step && !st.over) { acc -= P.step; botInput(st, input); stepRun(st, P.step, input, null); } } return st.turned / TAU; };
  const a = laps(1 / 30), b = laps(1 / 144);
  check('a run is the same at 30 and at 144 frames a second', Math.abs(a - b) < 1e-6, `${a.toFixed(2)} laps in forty seconds`);
  const runs = []; for (let k = 0; k < 8; k++) runs.push(botRun(k * 37.7, 240));
  const sorted = runs.map((r) => r.laps).sort((x, y) => x - y);
  check('a bot runs it lap after lap, whenever it starts', sorted[2] > 10 && sorted[sorted.length - 1] > 40, `${runs.map((r) => r.laps.toFixed(0)).join(', ')} laps (four minutes at most)`);
  const plain = []; for (let k = 0; k < 6; k++) plain.push(botRun(k * 53.1 + 5, 120, false));
  check('nobody is beaten at the start by what they could not see coming', runs.every((r) => r.laps > 1) && plain.every((r) => r.laps > 1), `shortest runs: ${Math.min(...runs.map((r) => r.laps)).toFixed(1)} and ${Math.min(...plain.map((r) => r.laps)).toFixed(1)} laps`);
  console.log(`      for the board of scores: tenths of a lap, the more the better — pond: { order: 'desc', min: 1, max: ${Math.round(sorted[sorted.length - 1] * 10 * 30)} }`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
