// Checks of Round the Bend, without a browser: the table stands in the meadow inside its rectangle, its top level
// over ground that is not quite, the arch on grass one can walk on; the lap holds together — its length, its
// bends, its boards, nothing of it off the table, no two stretches sharing a board — and its gates are in their
// order; the stick says where the car goes on the picture; the car pulls, brakes, slides when thrown into a bend,
// bounces off the boards and off the others, flies off the ramp, is kicked by the pad, loses its tyres on the oil,
// is slowed by the sand; a gate out of its turn does not count; the car that drives by itself finishes its three
// laps, the rivals too, in a spread of times, a clumsy driver later; the same race at 30 and 144 frames a second.
// usage: node lab/games/cars/test.mjs
import { check, done, ground } from '../check.mjs';
import { CARS, TRACK, GATE, PAD, SAND, RAMP, OIL, RACING, RIVALS, SHORTEST, BOARD, gateEnds, flight, inZone, rampAt, putCar, startRace, stepRace, placeOf, lapsDone, lapOf, botInput, idleInput, clumsyInput, keysInput, raceRun } from './rules.js';

const C = CARS, T = TRACK, M = T.m, DS = T.ds, LIM = C.wall - C.body, TAU = Math.PI * 2;
const wrap = (a) => { a %= TAU; return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a; };
const fmt = (ms) => `${(ms / 1000).toFixed(2)} s`;
/** The stick that pushes towards (dx, dz) of the world, as the picture is turned. */
const towards = (st, dx, dz, out) => { const FX = Math.sin(st.view), FZ = Math.cos(st.view), l = Math.hypot(dx, dz) || 1; out.y = (dx * FX + dz * FZ) / l; out.x = (dx * -FZ + dz * FX) / l; return out; };
/** … and the way the lap goes where one's car is. */
const along = (st, out) => { const k = st.cars[0].k; return towards(st, T.tx[k], T.tz[k], out); };
/** A race with one's car alone on the track: `s` metres along the lap from the line, `l` to the left of the centre line, going at `v`. */
const alone = (s, l = 0, v = 0) => { const st = startRace(1); st.cars.length = 1; putCar(st.cars[0], s, l, v); return st; };
/** Runs `st` for `secs` (or until `stop(st, seen)`); `drive(st, input, t)` holds the stick. Returns the events, each with its second. */
const run = (st, secs, drive, stop) => {
  const input = { x: 0, y: 0, jump: false }, events = [], seen = [];
  for (let t = 0; t < secs - 1e-9; t += C.step) { input.jump = false; drive?.(st, input, t); stepRace(st, C.step, input, events); for (const e of events) seen.push({ ...e, at: st.clock }); events.length = 0; if (stop?.(st, seen)) break; }
  return seen;
};
const speedOf = (c) => Math.hypot(c.vx, c.vz);
const STRAIGHT = 81; // metres along the lap: on the straight past the stand, out of the last hairpin

const height = await ground();
{
  // ---- where it stands
  const x0 = C.at.x - C.half.x, x1 = C.at.x + C.half.x, z0 = C.at.z - C.half.z, z1 = C.at.z + C.half.z, g = C.gate;
  check('the table, its stand and its arch are in the meadow, inside their rectangle', x0 >= -257 && x1 <= -223 && z0 >= -65 && g.z + 0.6 <= -45 && Math.abs(g.x - C.at.x) < 2 && C.stand.z > z1 && C.stand.z + C.stand.d / 2 < g.z, `x ${x0} … ${x1}, z ${z0.toFixed(1)} … ${(g.z + 0.6).toFixed(1)} (the rectangle: x -257 … -223, z -65 … -45)`);
  let lo = 99, hi = -99; for (let x = x0; x <= x1; x += 0.5) for (let z = z0; z <= z1; z += 0.5) { const h = height(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  const top = hi + C.rise;
  check('the ground under it is nearly level, not quite: its top is level, over the grass everywhere', hi - lo < 0.9 && lo > 29 && C.rise >= 0.5, `the grass ${lo.toFixed(2)} to ${hi.toFixed(2)} m, the tarmac at ${top.toFixed(2)} m: ${C.rise} to ${(top - lo).toFixed(2)} m over it`);
  const hg = height(g.x, g.z), tilt = Math.max(...[[1.7, 0], [-1.7, 0], [0, 1.2], [0, -1.2]].map(([ax, az]) => Math.abs(height(g.x + ax, g.z + az) - hg))), looks = Math.atan2(C.at.x - g.x, C.at.z - g.z);
  const deck = height(C.at.x, C.stand.z) + C.stand.up;
  check('the arch is on grass one can walk on, level, and looks at the table; the stand lifts one to the height of a table', hg > 20 && tilt < 0.25 && Math.abs(wrap(looks - g.yaw)) < 0.1 && top - deck > 0.5 && top - deck < 1.0 && C.stand.up <= 0.6, `${hg.toFixed(2)} m, ${tilt.toFixed(2)} m of tilt under the arch; the tarmac ${(top - deck).toFixed(2)} m over the boards of the stand`);
}
{
  // ---- the lap
  let gap = 0, bend = 0, far = [0, 0];
  for (let k = 0; k < M; k++) { const j = (k + 1) % M; gap = Math.max(gap, Math.abs(Math.hypot(T.x[j] - T.x[k], T.z[j] - T.z[k]) - DS)); bend = Math.max(bend, Math.abs(wrap(Math.atan2(T.tx[j], T.tz[j]) - Math.atan2(T.tx[k], T.tz[k])))); far = [Math.max(far[0], Math.abs(T.x[k])), Math.max(far[1], Math.abs(T.z[k]))]; }
  const tight = 1 / Math.max(...T.curve.map(Math.abs));
  check('a lap of 70 to 90 m that holds together: its samples evenly apart all the way round, no kink', T.length > 70 && T.length < 90 && Math.abs(M * DS - T.length) < 1e-9 && gap < 0.004 && bend < DS / tight + 1e-6, `${T.length.toFixed(1)} m in ${M} samples ${DS.toFixed(3)} m apart; the tightest bend ${tight.toFixed(1)} m`);
  check('the tarmac and its boards lie on the table; the inside board of the tightest bend has room', far[0] + C.wall <= C.half.x - 0.3 && far[1] + C.wall <= C.half.z - 0.3 && tight > C.wall + 0.3 && C.road < LIM, `the boards reach ${(far[0] + C.wall).toFixed(2)} × ${(far[1] + C.wall).toFixed(2)} m from the middle, the table ${C.half.x} × ${C.half.z}`);
  // its bends: runs of samples that turn the same way
  const bends = []; for (let k = 0; k < M; k++) { const c = T.curve[k]; if (!c) continue; const last = bends.at(-1); if (last && last.to === k - 1 && Math.abs(last.c - c) < 1e-9) { last.to = k; last.n++; } else bends.push({ c, to: k, n: 1 }); }
  const turned = (b) => Math.round((Math.abs(b.c) * b.n * DS * 180) / Math.PI);
  let straight = 0, runLen = 0; for (let k = 0; k < 2 * M; k++) { runLen = T.curve[k % M] ? 0 : runLen + 1; straight = Math.max(straight, Math.min(runLen, M)); }
  const hairpins = bends.filter((b) => 1 / Math.abs(b.c) <= 2.05 && turned(b) > 170), sweep = bends.filter((b) => 1 / Math.abs(b.c) > 5 && turned(b) > 170), flick = bends.filter((b) => turned(b) < 40);
  check('it has what makes a track: a long straight, a fast sweep, a flick right and left, three hairpins — one of them the other way', straight * DS > 15 && sweep.length === 1 && flick.length === 2 && flick[0].c < 0 && flick[1].c > 0 && hairpins.length === 3 && hairpins.filter((b) => b.c < 0).length === 1, `a straight of ${(straight * DS).toFixed(1)} m; bends of ${bends.map((b) => `${b.c > 0 ? 'left' : 'right'} ${turned(b)}° r${(1 / Math.abs(b.c)).toFixed(1)}`).join(', ')}`);
  let near = 99; for (let i = 0; i < M; i += 2) for (let j = i + 2; j < M; j += 2) { const d = Math.min(j - i, M - j + i) * DS; if (d > 4.5) near = Math.min(near, Math.hypot(T.x[i] - T.x[j], T.z[i] - T.z[j])); }
  check('no two stretches of it share a board: wherever the lap comes back near itself there is room for both', near > 2 * C.wall + 0.3, `never nearer than ${near.toFixed(2)} m, the boards ${(2 * C.wall).toFixed(1)} m apart`);
  const ends = GATE.map((_, j) => gateEnds(j));
  check('sixteen gates in their order round the lap, from board to board, the line first', GATE.length === 16 && GATE[0] === 0 && GATE.every((k, j) => !j || (k > GATE[j - 1] && Math.abs(k - GATE[j - 1] - M / 16) <= 1)) && ends.every((e) => Math.abs(Math.hypot(e[0] - e[2], e[1] - e[3]) - 2 * C.wall) < 1e-9), `${(T.length / 16).toFixed(1)} m from one to the next`);
  const flat = (zone, before, after) => { for (let n = -Math.round(before / DS); n < zone.n + Math.round(after / DS); n++) if (T.curve[(((zone.k0 + n) % M) + M) % M]) return false; return true; };
  const sandy = Array.from({ length: SAND.n }, (_, n) => T.curve[(SAND.k0 + n) % M]);
  check('the pad on the straight before the sweep, the sand on the outside of the sweep, the ramp on a straight with room to come down, the oil before the hairpin', flat(PAD, 1, 3) && flat(RAMP, 3, 6) && flat(OIL, 1, 1) && sandy.every((c) => c > 0 && 1 / c > 5) && SAND.l1 < 0 && SAND.l0 >= -C.road && inZone(PAD, PAD.k0 + 1, -0.6) && !inZone(PAD, PAD.k0 + 1, 0.5) && rampAt(RAMP.k0 + RAMP.n - 0.01, 0) > C.ramp.high * 0.98 && rampAt(RAMP.k0 + RAMP.n + 0.01, 0) === 0, `pad ${(PAD.k0 * DS).toFixed(0)} m, sand ${(SAND.k0 * DS).toFixed(0)} to ${((SAND.k0 + SAND.n) * DS).toFixed(0)} m, ramp ${(RAMP.k0 * DS).toFixed(0)} m, oil ${(OIL.k0 * DS).toFixed(0)} m along the lap`);
}
{
  // ---- the stick
  const nose = (view, x, y, secs = 0.8) => { const st = alone(STRAIGHT + 3); st.view = view; run(st, secs, (q, i) => { i.x = x; i.y = y; }); return st.cars[0].yaw; };
  const want = [[0, 1, Math.PI, 'up: north'], [1, 0, Math.PI / 2, 'right: east'], [0, -1, 0, 'down: south'], [-1, 0, -Math.PI / 2, 'left: west']];
  const off = want.map(([x, y, a]) => Math.abs(wrap(nose(C.view, x, y) - a)));
  check('the stick says where the car should go on the picture: its nose turns that way, whatever way it was going', off.every((d) => d < 0.12), want.map((w, n) => `${w[3]} (${(off[n] * 57.3).toFixed(0)}° off)`).join(' · '));
  const turned = Math.abs(wrap(nose(Math.PI / 2, 0, 1) - Math.PI / 2)), right = Math.abs(wrap(nose(Math.PI / 2, 1, 0) - 0));
  check('… and when the picture is turned a quarter (a phone held upright), up is still up on it', turned < 0.12 && right < 0.12, 'up: east · right: south');
  // flat out, and let go
  const st = alone(STRAIGHT, 0.5), c = st.cars[0]; let most = 0;
  run(st, 1.6, (q, i) => { along(q, i); most = Math.max(most, speedOf(q.cars[0])); });
  const v = speedOf(c), from = c.s;
  run(st, 2, null, (q) => speedOf(q.cars[0]) < 0.01);
  const stop = (c.s - from + M) % M * DS;
  check('it pulls to its top speed and no further; the stick let go, it brakes to a stand', v > 0.85 * C.top && most <= C.top + 1e-9 && speedOf(c) < 0.01 && stop < (v * v) / (2 * C.brake) + 0.1 && stop > 2, `${v.toFixed(1)} m/s after 1.6 s (flat out: ${C.top}); stopped in ${stop.toFixed(1)} m`);
  // the boost
  const plain = alone(STRAIGHT, 0.5), quick = alone(STRAIGHT, 0.5); let fastest = 0;
  run(plain, C.boost.time, (q, i) => along(q, i));
  run(quick, C.boost.time, (q, i, t) => { along(q, i); i.jump = t === 0; fastest = Math.max(fastest, speedOf(q.cars[0])); });
  run(quick, 0.6, (q, i) => { along(q, i); fastest = Math.max(fastest, speedOf(q.cars[0])); });
  const parked = alone(STRAIGHT), asked = run(parked, 6, (q, i, t) => { i.jump = Math.abs(t - 0) < 1e-9 || Math.abs(t - 2) < C.step / 2 || Math.abs(t - 5.2) < C.step / 2; }).filter((e) => e.type === 'boost').map((e) => e.at.toFixed(1));
  check('the jump is a short boost: faster for a moment, no faster than its own top; it comes back by itself, not before', speedOf(quick.cars[0]) > C.top && fastest <= C.boost.top + 1e-9 && fastest > C.top + 1.5 && asked.join() === '0.0,5.2' && parked.cars[0].charge < 1, `${speedOf(plain.cars[0]).toFixed(1)} m/s without, ${fastest.toFixed(1)} m/s with it; asked at 0, 2 and 5.2 s: given at ${asked.join(' and ')} s`);
}
{
  // ---- sliding, the boards, the others
  const slide = (v) => { const st = alone(STRAIGHT, 0, v), c = st.cars[0]; let slip = 0, lead = 0; const seen = run(st, 0.3, (q, i) => { i.x = 0; i.y = 1; slip = Math.max(slip, c.slip); lead = Math.max(lead, Math.abs(wrap(c.yaw - Math.atan2(c.vx, c.vz)))); }); return { slip, lead, left: speedOf(c), drift: seen.some((e) => e.type === 'drift') }; };
  const fast = slide(7.4), slow = slide(2.5);
  check('thrown into a bend at speed the car slides — its nose turns faster than its tyres follow — and what slides is lost; slowly, it holds', fast.slip > 2.5 && fast.lead > 0.35 && fast.drift && fast.left < 7.4 * 0.9 && slow.slip < 1 && !slow.drift, `at 7.4 m/s: ${fast.slip.toFixed(1)} m/s across, the nose ${(fast.lead * 57.3).toFixed(0)}° ahead, ${fast.left.toFixed(1)} m/s left; at 2.5 m/s: ${slow.slip.toFixed(1)} m/s across`);
  let out = 0, hits = 0, back = 0;
  for (let j = 0; j < 8; j++) for (const side of [-1, 1]) {
    const st = alone((j * T.length) / 8 + 1.3), c = st.cars[0], k = c.k, seen = run(st, 1.5, (q, i) => { towards(q, T.nx[k] * side, T.nz[k] * side, i); out = Math.max(out, Math.abs(c.l)); });
    const hit = seen.find((e) => e.type === 'wall');
    if (hit) { hits++; if (hit.speed > 1.2) back++; }
  }
  const flatOut = alone(STRAIGHT, 0, 7.4), fc = flatOut.cars[0]; let after = 0;
  const bang = run(flatOut, 0.6, (q, i) => { i.x = 0; i.y = 1; out = Math.max(out, Math.abs(fc.l)); }, (q, seen) => { if (seen.some((e) => e.type === 'wall')) { after = fc.vx * T.nx[fc.k] + fc.vz * T.nz[fc.k]; return true; } return false; });
  check('the boards stop a car, wherever it is driven at them, and it bounces off', out <= LIM + 1e-9 && hits === 16 && back === 16 && bang.some((e) => e.type === 'wall') && after < -0.5, `16 of 16 runs at a board ended on it, never further than ${out.toFixed(3)} m from the centre line (the boards at ${C.wall}, a car ${C.body} wide to them); at speed it comes back at ${(-after).toFixed(1)} m/s`);
  const two = startRace(1); two.cars.length = 2; two.cars[1].skill = { ...RIVALS[0], delay: 1e9 };
  putCar(two.cars[0], STRAIGHT, 0.4, 6); putCar(two.cars[1], STRAIGHT + 1.5, 0.4, 0);
  let closest = 9; const bump = run(two, 0.6, (q, i) => { along(q, i); closest = Math.min(closest, Math.hypot(q.cars[0].x - q.cars[1].x, q.cars[0].z - q.cars[1].z)); }, (q, seen) => seen.some((e) => e.type === 'bump'));
  check('cars bounce off each other: the one that is hit is sent on, the one that hits is slowed, they never overlap', bump.some((e) => e.type === 'bump') && speedOf(two.cars[1]) > 3 && speedOf(two.cars[0]) < 4 && closest >= 2 * C.body - 1e-6, `hit at ${bump.find((e) => e.type === 'bump')?.speed.toFixed(1)} m/s: ${speedOf(two.cars[0]).toFixed(1)} and ${speedOf(two.cars[1]).toFixed(1)} m/s after`);
}
{
  // ---- what lies on the tarmac
  const lip = (RAMP.k0 + RAMP.n) * DS, fly = (v) => { const st = alone(RAMP.k0 * DS - 3, 0, v), c = st.cars[0]; let high = 0, was = null, kept = true; const seen = run(st, 2.5, (q, i) => { if (c.air) { i.x = 0; i.y = -1; high = Math.max(high, c.y); if (was && (Math.abs(was[0] - c.vx) > 1e-9 || Math.abs(was[1] - c.vz) > 1e-9)) kept = false; was = [c.vx, c.vz]; } else along(q, i); }, (q, ev) => ev.some((e) => e.type === 'land') || (c.s * DS > lip + 1 && !c.air)); const up = seen.find((e) => e.type === 'jump'), down = seen.find((e) => e.type === 'land'); return { up, down, high, kept, far: (c.s * DS - lip), v: speedOf(c) }; };
  const big = fly(7.4), small = fly(0.8);
  const air = big.up && big.down ? big.down.at - big.up.at : 0;
  check('off the lip of the ramp the car flies: nothing steers it or slows it in the air; at a crawl it only drops off', big.up && big.down && Math.abs(air - flight(big.v)) < 0.04 && big.high > C.ramp.high && big.kept && big.far > 2.5 && big.far < 4.5 && !small.up, `at ${big.v.toFixed(1)} m/s: ${air.toFixed(2)} s in the air, ${big.far.toFixed(1)} m, ${big.high.toFixed(2)} m high`);
  const kick = (l) => { const st = alone(PAD.k0 * DS - 2, l, 7.4), seen = run(st, 0.6, (q, i) => along(q, i)); return { v: Math.max(speedOf(st.cars[0])), pad: seen.filter((e) => e.type === 'pad').length }; };
  const on = kick(-0.6), beside = kick(0.5);
  check('the pad kicks whoever drives over it — once —, up to its own top; beside it, nothing', on.pad === 1 && on.v > C.top + 1 && on.v <= C.pad.top && beside.pad === 0 && beside.v <= C.top + 1e-9, `${on.v.toFixed(1)} m/s after it, ${beside.v.toFixed(1)} beside it`);
  const slick = (l) => { const st = alone(OIL.k0 * DS - 1.5, l, 6), c = st.cars[0]; let round = 0, was = c.yaw, way = null, swerve = 0; const seen = run(st, 0.25 + C.oil.time, (q, i) => { i.x = 0; i.y = 1; if (c.oil > 0) { round += Math.abs(wrap(c.yaw - was)); const a = Math.atan2(c.vx, c.vz); way ??= a; swerve = Math.max(swerve, Math.abs(wrap(a - way))); } was = c.yaw; }); return { oil: seen.filter((e) => e.type === 'oil').length, round, swerve }; };
  const oily = slick(-0.55), dry = slick(0.5);
  check('on the oil the tyres are gone for a moment: the nose goes round by itself and the car slides on the way it was going, whatever the stick says', oily.oil === 1 && oily.round > 5 && oily.swerve < 0.3 && dry.oil === 0, `the nose turns ${(oily.round / TAU).toFixed(1)} times round, the way it goes changes by ${(oily.swerve * 57.3).toFixed(0)}° with the stick hard over`);
  const drag = (s, l) => { const st = alone(s, l, 7); run(st, 0.3, (q, i) => along(q, i)); return speedOf(st.cars[0]); };
  const sand = drag(SAND.k0 * DS + 0.5, -0.8), road = drag(SAND.k0 * DS + 0.5, 0.4);
  const verge = alone(STRAIGHT, C.road + 0.07); run(verge, 1.5, (q, i) => along(q, i));
  check('the sand slows a car down hard; off the tarmac, by the boards, it goes at a little over half its speed', sand < road - 1.5 && road > 6.8 && Math.abs(speedOf(verge.cars[0]) - C.verge.top * C.top) < 0.3 && Math.abs(verge.cars[0].l) > C.road, `after 0.3 s from 7 m/s: ${sand.toFixed(1)} m/s in the sand, ${road.toFixed(1)} on the tarmac beside it; ${speedOf(verge.cars[0]).toFixed(1)} m/s flat out off the tarmac`);
}
{
  // ---- the gates
  const st = alone(-2), c = st.cars[0];
  run(st, 3, (q, i) => along(q, i), (q) => q.cars[0].s * DS > 1.5 && q.cars[0].s < M / 2);
  const first = c.gate;
  putCar(c, -2); run(st, 3, (q, i) => along(q, i), (q) => q.cars[0].s * DS > 1.5 && q.cars[0].s < M / 2); // lifted back before the line, and over it again
  const again = c.gate;
  run(st, 4, (q, i) => botInput(q, i), (q) => q.cars[0].gate >= 3);
  const three = c.gate;
  putCar(c, GATE[12] * DS - 2); run(st, 2.5, (q, i) => botInput(q, i)); // lifted across the infield
  check('a gate out of its turn does not count: the line crossed twice is not a lap, nor is a gate reached across the infield', first === 1 && again === 1 && three === 3 && c.gate === 3 && lapsDone(c) === 0 && c.s > GATE[12], `after the line twice: ${again} gate; lifted from gate 3 to gate 12 and driven on through two more: ${c.gate} gates`);
  const rev = alone(-2), r = rev.cars[0];
  run(rev, 3, (q, i) => along(q, i), (q) => q.cars[0].s * DS > 1.5 && q.cars[0].s < M / 2);
  const wrong = run(rev, 6, (q, i) => { i.x = -1; i.y = 0; }, (q) => q.cars[0].s > M / 2 && q.cars[0].s * DS < T.length - 6); // back over the line, the wrong way
  const behind = r.s * DS - T.length;
  run(rev, 4, (q, i) => along(q, i), (q) => q.cars[0].s * DS > 3 && q.cars[0].s < M / 2);
  check('nor is going back over the line and forwards again — and who goes the wrong way is told', r.gate === 1 && behind < -5 && wrong.some((e) => e.type === 'wrong'), `${(-behind).toFixed(1)} m back over the line and on again: ${r.gate} gate`);
}
{
  // ---- races
  const seeds = Array.from({ length: 12 }, (_, i) => i + 1), runs = seeds.map((s) => raceRun(s));
  const best = Math.min(...runs.map((r) => r.time)), worst = Math.max(...runs.map((r) => r.time));
  const start = startRace(1);
  check('one starts last on the grid, the three rivals before one, the best in front', placeOf(start, 0) === 4 && placeOf(start, 1) === 1 && placeOf(start, 2) === 2 && placeOf(start, 3) === 3 && lapOf(start.cars[0]) === 1 && start.cars.every((c) => Math.abs(c.l) < C.road && c.s > M / 2), start.cars.map((c, i) => `${i ? RIVALS[i - 1].name : 'one'} ${((M - c.s) * DS).toFixed(1)} m behind the line`).join(' · '));
  const inOrder = runs.every((r) => r.order.length === 16 * C.laps + 1 && r.order.every((g, n) => g === n % 16) && r.laps.length === C.laps + 1);
  check('the car that drives by itself finishes its three laps, whatever the seed, its gates in their order, without touching a board', runs.every((r) => r.over && !r.state.out && r.time > 33000 && r.time < 42000 && !r.events.wall) && inOrder, `${runs.map((r) => (r.time / 1000).toFixed(1)).join(' · ')} s`);
  const laps = runs[3].laps.slice(1).map((t, i) => t - runs[3].laps[i]);
  check('a lap takes it about twelve seconds; it flies the ramp, takes the pad and boosts on the straight every lap', laps.every((t) => t > 10.5 && t < 13.5) && runs.every((r) => r.events.jump === C.laps && r.events.pad >= C.laps && r.events.boost >= C.laps), `laps of ${laps.map((t) => t.toFixed(2)).join(', ')} s (seed 4)`);
  const rivals = [1, 2, 3].map((i) => runs.map((r) => r.state.cars[i].time)), mean = rivals.map((t) => t.reduce((a, b) => a + b, 0) / t.length);
  const wins = runs.filter((r) => r.place === 1).length;
  check('the rivals finish too, in a spread of times: the best a few seconds behind what the track allows, the last a good eight', runs.every((r) => r.state.cars.every((c) => c.done && c.time > 0) && r.state.cars[1].time < r.state.cars[2].time && r.state.cars[2].time < r.state.cars[3].time) && mean[0] > best * 1.05 && mean[0] < best * 1.12 && mean[1] > mean[0] + 1500 && mean[2] > mean[1] + 1500 && mean[2] < best * 1.3 && rivals.every((t) => new Set(t).size > 6), RIVALS.map((r, i) => `${r.name} ${fmt(Math.min(...rivals[i]))} to ${fmt(Math.max(...rivals[i]))}`).join(' · ') + ` (the best of one's own car: ${fmt(best)})`);
  check('the car that drives by itself gets past them from the back of the grid, most of the time', wins >= 8 && runs.every((r) => r.place <= 2), `first in ${wins} races of ${runs.length}, never worse than second; ${fmt(best)} to ${fmt(worst)}`);
  const clumsy = [1, 2, 3, 4].map((s) => raceRun(s, clumsyInput)), keys = [1, 2, 3, 4].map((s) => raceRun(s, keysInput));
  check('a clumsy driver — the stick always full, never lifting — finishes too, off the boards, later', clumsy.every((r, i) => r.over && r.time > runs[i].time + 1500 && r.events.wall >= 5) && Math.max(...clumsy.map((r) => r.time)) < 60000, `${clumsy.map((r) => `${fmt(r.time)} (${r.events.wall} boards, place ${r.place})`).join(' · ')}`);
  check('a driver with a keyboard — eight ways only, all or nothing — finishes too, between the two', keys.every((r, i) => r.over && r.time > runs[i].time && r.time < 50000), `${keys.map((r) => `${fmt(r.time)} (place ${r.place})`).join(' · ')}`);
  const idle = raceRun(1, idleInput);
  check('who never touches the stick has no time: the race is called off at its limit, the rivals long home', idle.over && idle.state.out && idle.time === 0 && idle.events.out === 1 && Math.abs(idle.state.clock - C.limit) < 0.01 && idle.state.cars.slice(1).every((c) => c.done) && idle.state.cars[0].gate === 0, `called off at ${idle.state.clock.toFixed(0)} s`);
  const a = raceRun(7), b = raceRun(7), c = raceRun(8), same = (x, y) => x.time === y.time && x.state.cars.every((car, i) => car.time === y.state.cars[i].time && car.x === y.state.cars[i].x);
  check('the same race for the same seed, another for another', same(a, b) && !same(a, c));
  const at = (dt) => { const st = startRace(5), input = { x: 0, y: 0, jump: false }; let acc = 0; for (let t = 0; t < 200 && !st.over; t += dt) { acc += dt; while (acc >= C.step && !st.over) { acc -= C.step; botInput(st, input); stepRace(st, C.step, input, null); } } return [st.time, st.place, ...st.cars.map((car) => car.x.toFixed(9))].join(); };
  check('the same race at 30 and at 144 frames a second', at(1 / 30) === at(1 / 144) && Number(at(1 / 30).split(',')[0]) > 0);
  // (players that push the stick and the jump at random: none ever beyond the boards or faster than the cap, every race has an end)
  const rnd = (n, k) => { const v = Math.sin(n * 127.1 + k * 311.7 + 74.7) * 43758.5453; return v - Math.floor(v); };
  let astray = 0, quickest = Infinity, home = 0, fastest = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const st = startRace(seed), input = { x: 0, y: 0, jump: false }, wild = seed % 4 === 0;
    for (let k = 0; !st.over && k < (C.limit + 1) * 120; k++) {
      const beat = Math.floor(st.clock * (1 + (seed % 3)));
      // (most of them mean to go round — a stick that points roughly along the lap —, a quarter push anywhere)
      if (wild) { input.x = rnd(seed, beat) * 2 - 1; input.y = rnd(seed, beat + 0.5) * 2 - 1; } else { along(st, input); input.x += (rnd(seed, beat) - 0.5) * 1.6; input.y += (rnd(seed, beat + 0.5) - 0.5) * 1.6; }
      input.jump = rnd(seed, k) < 0.01;
      stepRace(st, C.step, input, null);
      for (const c of st.cars) { const v = speedOf(c); fastest = Math.max(fastest, v); if (!(Math.abs(c.l) <= LIM + 1e-9) || !(v <= C.cap + 1e-9) || !Number.isFinite(c.x + c.z + c.y + c.yaw)) astray++; }
    }
    if (!st.over) astray++;
    if (st.time) { home++; quickest = Math.min(quickest, st.time); }
  }
  check('forty players that push the stick and the jump at random: none ever beyond the boards or over the cap, every race has an end', astray === 0 && home >= 10 && quickest > best, `${home} of 40 got home, the quickest in ${fmt(quickest)}; nothing ever faster than ${fastest.toFixed(1)} m/s (the cap: ${C.cap})`);
  // what nobody goes under: from each gate to the next at least the gap between the two lines (measured here point by point)
  let shortest = 0;
  for (let j = 0; j < 16; j++) { const p = gateEnds(j), q = gateEnds((j + 1) % 16); let least = Infinity; for (let u = 0; u <= 60; u++) for (let v = 0; v <= 60; v++) least = Math.min(least, Math.hypot(p[0] + (p[2] - p[0]) * (u / 60) - q[0] - (q[2] - q[0]) * (v / 60), p[1] + (p[3] - p[1]) * (u / 60) - q[1] - (q[3] - q[1]) * (v / 60))); shortest += least; }
  const line = { order: 'asc', min: Math.floor((C.laps * shortest) / C.cap) * 1000, max: C.limit * 1000 };
  check('the board of scores in rules.js is the one these runs give: its least what the shortest way through the gates takes at the cap, its most the limit of a race', Math.abs(shortest - SHORTEST) < 0.05 && BOARD.order === line.order && BOARD.min === line.min && BOARD.max === line.max && BOARD.min < best * 0.6 && BOARD.max > worst, `${shortest.toFixed(1)} m a lap at the very least; ${JSON.stringify(BOARD)}`);
  console.log(`      for the board of scores: cars: { order: 'asc', min: ${String(line.min).replace(/000$/, '_000')}, max: ${String(line.max).replace(/000$/, '_000')} }`);
}
void RACING;
done();
