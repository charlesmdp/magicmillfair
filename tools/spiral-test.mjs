// Checks of Spiral of Death, without a browser: the tower stands in the sea, clear of the cliffs, of the
// cleft and of the pier, and its gate on dry sand; the track is a slope one can run and leaves room under the
// turn above; the camera sees far enough past the tower; the legs do what the stick asks — who lets go stops,
// nobody runs back down, the clock starts with the first step —; each thing in the way is got past by its move
// and ends the attempt without it, at a run and from a standstill; who only runs is back at the foot within a
// second; what moves is the same for everybody, can be got past whatever the moment one arrives — or waited
// for — and leaves nowhere to stand for ever; each new kind of thing (planks that give way, springboards, stairs
// three high, bars that go up and down, the wind, belts, sliding doors, cannons, planks a foot wide, boards on a
// cable, rams, hammers in a row) is got past by its move and ends the attempt without it; nothing asks for a
// move timed to less than a quarter of a second; the landings, and where a touch puts one back; a runner that
// plays by itself reaches the bell; each turn has as much in the way as the last, and something new.
// usage: node tools/spiral-test.mjs
import { check, done, ground } from './lib/check.mjs';
import { BOARDS as SERVER } from '../server/scores.js';
import { BOUNDS, pierToWorld, PIER } from '../src/world/layout/layout.js';
import { CLEFT } from '../src/world/zones/games/crack/cleft.js';
import { SPIRAL, BOARD, TURN, LENGTH, LANDINGS, course, speedAt, trackY, slopeAt, spiralAt, sightAhead, fastest, floorAt, millAngle, stompAt, hammerAt, barrelAt, startRun, stepRun, botInput, botRun, heightOf, liftAt, gustAt, doorAt, cannonAt, ramAt } from '../src/world/zones/games/spiral/rules.js';

const S = SPIRAL, C = S.at, H = S.half, TAU = Math.PI * 2;
const height = await ground();
const { things, turns } = course();
const first = (kind, n = 0) => things.filter((t) => t.kind === kind)[n];
const inside = (x, z, poly) => { let hit = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[j][1] > z) !== (poly[i][1] > z) && x < ((poly[i][0] - poly[j][0]) * (z - poly[j][1])) / (poly[i][1] - poly[j][1]) + poly[j][0]) hit = !hit; return hit; };

/** A runner already at a run, the stick up, at metre `s`, `u` across, the clock of the world at `t0`. */
const runner = (s, u = 0, t0 = 0) => { const st = startRun(t0), v = speedAt(s); Object.assign(st, { s, u, v, pace: v, since: 0, going: true }); return st; };
/** One who stands there: on the planks, or on the crate that is there. */
const stander = (s, u = 0, t0 = 0) => { const st = startRun(t0); Object.assign(st, { s, u, h: Math.max(0, floorAt(s, u)), going: true }); return st; };
/**
 * Runs `st` to metre `to`, to the end of the attempt, or for `secs` seconds. The stick is up unless `drive(st,
 * input)` says otherwise; it presses the keys too. Returns { out (why, '' when nothing stopped it), at, st, seen, t }.
 */
const go = (st, to, drive, secs = 30) => {
  const input = { side: 0, run: 1, jump: false, down: false, crouch: false }, events = [], seen = [];
  let t = 0;
  for (; t < secs && st.s < to && !st.over; t += S.step) {
    input.run = 1; input.jump = input.down = input.crouch = false;
    drive?.(st, input);
    if (input.down || input.crouch) input.run = 0; // (one stick: it is not up and down at once)
    stepRun(st, S.step, input, events);
    for (const e of events) seen.push(e);
    events.length = 0;
    const e = seen.find((q) => q.type === 'out');
    if (e) return { out: e.why, at: e.s, st, seen, t };
  }
  return { out: '', at: st.s, st, seen, t };
};
/** The stick let go. */
const still = (st, input) => { input.run = 0; };
/** Presses `key` once, `d` metres before metre `at` (several: one after the other). */
const press = (...list) => { const left = list.map(([key, at, d]) => ({ key, s: at - d })); return (st, input) => { while (left.length && st.s >= left[0].s) { input[left.shift().key] = true; } }; };
/** Steers to `u`. */
const steer = (u, then) => (st, input) => { input.side = Math.max(-1, Math.min(1, (u - st.u) * 5)); then?.(st, input); };
/** Is metre `s` of the track bare planks, with nothing within a stride of it? */
const STRETCH = new Set(['barrels', 'wind', 'belt', 'trolley']); // (what lies along a stretch: one may start in it)
const clear = (s) => floorAt(s, 0) === 0 && !things.some((t) => !STRETCH.has(t.kind) && s > t.s0 - 1.2 && s < t.s1 + 1.2);
/** A bare place to start from, `least` metres or more before metre `s`. */
const before = (s, least = 5) => { let from = s - least; while (!clear(from)) from -= 0.25; return from; };
/** For how long (s) pressing `key` gets a runner from `from` past `to`: a press tried at every step of two seconds. */
const windowOf = (key, from, to, u = 0) => { let n = 0; for (let k = 0; k < 240; k++) { let i = 0; if (!go(runner(from, u), to, (st, input) => { if (i++ === k) input[key] = true; }).out) n++; } return n * S.step; };

{
  // ---- where it stands
  const R = S.r + H + 2.9; let deep = 0, shallow = -99, land = 999, out = 0;
  for (let k = 0; k < 48; k++) for (const r of [0, R * 0.5, R]) { const a = (k / 48) * TAU, x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r, h = height(x, z); deep = Math.min(deep, h); shallow = Math.max(shallow, h); if (!inside(x, z, BOUNDS)) out++; }
  for (let k = 0; k < 360; k++) for (let d = 1; d < land; d += 0.5) { const a = (k / 360) * TAU; if (height(C.x + Math.cos(a) * d, C.z + Math.sin(a) * d) > 0) { land = d; break; } }
  check('the tower stands in the sea, on the bed of the bay', shallow < -4 && out === 0, `${(-shallow).toFixed(1)} to ${(-deep).toFixed(1)} m of water under its plinth, all of it within the bay`);
  const cleft = Math.hypot(C.x - CLEFT.at.x, C.z - CLEFT.at.z) - (S.r + H), corner = [pierToWorld(PIER.length, PIER.headWidth / 2), pierToWorld(PIER.length - PIER.headLength, PIER.headWidth / 2)];
  const pier = Math.min(...corner.map(([x, z]) => Math.hypot(C.x - x, C.z - z))) - (S.r + H);
  // (and the cliffs nowhere lean over it: within 45 m of its rail, how high the land gets, and how near the land that is higher than the foot of the tower comes)
  let tall = -99, tallAt = 0;
  for (let k = 0; k < 360; k++) for (let d = 0; d <= 45; d += 1) { const a = (k / 360) * TAU, h = height(C.x + Math.cos(a) * (S.r + H + d), C.z + Math.sin(a) * (S.r + H + d)); if (h > tall) { tall = h; tallAt = d; } }
  check('clear of the cliffs — all 146 m of it —, of the cleft of Bouncy Rock and of the pier', land - (S.r + H) > 15 && cleft > 35 && pier > 25 && tallAt > 30, `from its rail: ${(land - S.r - H).toFixed(0)} m to the nearest land (the cliffs within 45 m are ${tall.toFixed(0)} m high at most, ${tallAt} m off), ${cleft.toFixed(0)} m to the cleft, ${pier.toFixed(0)} m to the pier`);
  const g = S.gate, gh = height(g.x, g.z); let sea = 99, hump = -9;
  for (let k = 0; k < 72; k++) for (let d = 1; d < sea; d += 0.5) { const a = (k / 72) * TAU; if (height(g.x + Math.cos(a) * d, g.z + Math.sin(a) * d) < 0) { sea = d; break; } }
  for (let f = 0.15; f <= 1; f += 0.01) hump = Math.max(hump, height(g.x + (C.x - S.r - g.x) * f, g.z + (C.z - g.z) * f));
  check('the gate is on dry sand, a few steps from the water, the tower in sight across the bay', gh > 0.4 && gh < 3 && sea < 14 && hump < 0.5 && inside(g.x, g.z, BOUNDS), `${gh.toFixed(1)} m over the sea, ${sea.toFixed(0)} m from the water, ${Math.hypot(C.x - g.x, C.z - g.z).toFixed(0)} m from the tower`);
}
{
  // ---- the track
  // (the highest a head gets: on what is there — the planks, a crate — with both jumps; over a hole thrown by a springboard, with the second jump at its top)
  const springs = things.filter((t) => t.kind === 'spring'), jumps = (S.jump * S.jump + S.again * S.again) / (2 * S.g), thrown = (S.spring.up * S.spring.up + S.again * S.again) / (2 * S.g);
  let slope = 0, roomy = 99, worst = 99;
  for (let s = 0; s < LENGTH; s += 0.25) {
    slope = Math.max(slope, slopeAt(s));
    const room = trackY(s + TURN) - trackY(s) - 0.24 - 0.26, head = Math.max(...[-1.2, 0, 1.2].map((u) => Math.max(0, floorAt(s, u)))) + (springs.some((t) => s > t.s0 - 1 && s < t.s1 + 14) ? thrown : jumps) + S.tall;
    roomy = Math.min(roomy, room); worst = Math.min(worst, room - head);
  }
  check('nineteen turns round the tower, the bell 146 m over the foot; a slope one runs up, room under the turn above for the highest head', S.turns === 19 && heightOf(LENGTH) > 145 && heightOf(LENGTH) < 147 && slope < 0.15 && worst > 0.4 && Math.abs(trackY(LENGTH) - S.foot - S.turns * S.rise) < 1e-6, `${LENGTH.toFixed(0)} m of track, ${heightOf(LENGTH).toFixed(1)} m up, ${(slope * 100).toFixed(1)} % at the steepest; ${roomy.toFixed(1)} m of room at the least, ${worst.toFixed(2)} m over the highest head`);
  const p0 = spiralAt(0), p1 = spiralAt(TURN), q = spiralAt(10, 1), f = spiralAt(10.01, 1);
  const right = { x: Math.cos(q.yaw) * -1, z: Math.sin(q.yaw) }; // (to the right of who runs with heading `yaw`)
  check('it winds round once a turn, the tower on the left of who runs', Math.hypot(p0.x - p1.x, p0.z - p1.z) < 1e-6 && Math.abs(p1.y - p0.y - S.rise) < 1e-6 && Math.abs(Math.hypot(q.x - C.x, q.z - C.z) - (S.r + 1)) < 1e-6 && (f.x - q.x) * Math.sin(q.yaw) + (f.z - q.z) * Math.cos(q.yaw) > 0 && (q.x - C.x) * right.x + (q.z - C.z) * right.z > 0);
  const least = Math.min(...[-S.reach, 0, S.reach].map((u) => sightAhead(u) / (S.speed[1] * (S.r / (S.r + u)))));
  check('the camera sees the track well past the tower: nothing comes into sight less than 1.2 s ahead', sightAhead(0) >= 12 && least >= 1.2, `${sightAhead(0).toFixed(1)} m ahead along the middle (${sightAhead(-S.reach).toFixed(1)} by the tower, ${sightAhead(S.reach).toFixed(1)} by the rail): ${least.toFixed(2)} s at the least, at the speed of the bell`);
  let slow = 0; for (let s = 0; s < LENGTH; s += 0.05) slow += 0.05 / (speedAt(s) * (S.r / (S.r + S.reach)));
  check('one runs faster as one climbs, and the inside is the shorter way round', speedAt(0) === S.speed[0] && speedAt(LENGTH) === S.speed[1] && S.speed[1] > S.speed[0] && fastest() < slow * 1000 * 0.8, `${S.speed[0]} m/s at the foot, ${S.speed[1]} at the bell; ${(fastest() / 1000).toFixed(1)} s along the tower, ${slow.toFixed(1)} s along the rail`);
  globalThis.SLOWEST = slow;
}
{
  // ---- the stick: the legs run when it is up, stop when it is let go, and the clock waits for the first step
  const stops = [5, 309].map((s0) => { const st = runner(s0); let t = 0; while (st.v > 0 && t < 2) { stepRun(st, S.step, { run: 0 }); t += S.step; } const at = st.s; go(st, 1e9, still, 3); return { t, d: at - s0, moved: st.s - at, v: speedAt(s0) }; });
  const starts = [5, 309].map((s0) => { const st = stander(s0); let t = 0; while (st.v < speedAt(st.s) - 1e-3 && t < 2) { stepRun(st, S.step, { run: 1 }); t += S.step; } return { t, d: st.s - s0 }; });
  const half = stander(5); go(half, 1e9, (st, input) => { input.run = 0.5; }, 2);
  const back = stander(5); go(back, 1e9, (st, input) => { input.crouch = true; }, 2);
  check('who lets go of the stick stops: within a quarter of a second, and stays; nobody runs back down',
    stops.every((r) => r.t <= S.stop + 0.011 && r.d > 0.3 && r.d < 1 && r.moved === 0) && starts.every((r) => Math.abs(r.t - S.start) < 0.011 && r.d < 1.2) && Math.abs(half.v - speedAt(half.s) / 2) < 1e-3 && back.s === 5 && back.v === 0 && back.duck > 0,
    `from ${stops.map((r) => r.v.toFixed(1)).join(' and ')} m/s: stopped in ${stops.map((r) => r.t.toFixed(2)).join(' and ')} s, ${stops.map((r) => r.d.toFixed(2)).join(' and ')} m further; from standing, at full speed in ${starts[0].t.toFixed(2)} s and ${starts[0].d.toFixed(2)} m; half the stick, half the speed; stick down while standing: a duck, on the spot`);
  // (the clock: it waits at the foot — while one looks, steps aside, hops —, starts with the first step, and waits again after a fall)
  const st = startRun(0), input = { side: 0, run: 0, jump: false, down: false, crouch: false }, events = [], seen = [];
  const pass = (secs, set) => { for (let k = 0, n = Math.round(secs / S.step); k < n; k++) { input.jump = false; set?.(k * S.step); stepRun(st, S.step, input, events); for (const e of events) seen.push({ ...e, total: st.total, clock: st.clock }); events.length = 0; } };
  pass(5); const idle = { clock: st.clock, s: st.s, total: st.total };
  pass(2, (t) => { input.side = t < 1 ? 1 : -1; input.jump = Math.abs(t - 0.5) < 1e-6; }); const hopped = { clock: st.clock, s: st.s, jumps: seen.filter((e) => e.type === 'jump').length, u: st.u };
  input.side = 0; input.run = 1; pass(1); const first = seen.find((e) => e.type === 'go'), ran = { clock: st.clock, s: st.s };
  while (!seen.some((e) => e.type === 'out') && st.total < 30) pass(S.step);
  const fell = seen.find((e) => e.type === 'out');
  input.run = 0; pass(3); const foot = seen.find((e) => e.type === 'foot'), again = { clock: st.clock, s: st.s, going: st.going, attempt: st.attempt };
  check('the clock starts with the first step: thinking at the foot is free — and it waits there again after a fall',
    idle.clock === 0 && idle.s === 0 && idle.total > 4.99 && hopped.clock === 0 && hopped.s === 0 && hopped.jumps === 1 && hopped.u !== 0 && !!first && Math.abs(first.total - 7 - S.step) < 1e-6 && Math.abs(ran.clock - 1) < 1e-6 && ran.s > 4 && fell?.why === 'hole' && !!foot && again.clock === 0 && again.s === 0 && !again.going && again.attempt === 2,
    `7 s at the foot, a step aside and a hop: the clock at 0; it starts at the first step and reads ${ran.clock.toFixed(2)} s one second later, ${ran.s.toFixed(1)} m up the track; after the fall, at the foot: 0 again, for as long as one stands`);
}
{
  // ---- what stands in the way, one thing after the other: its move gets one past, nothing else does
  const hole = first('hole'), low = first('low'), high = first('high'), fence = first('fence'), crate = first('crate');
  const fell = go(runner(before(hole.s0)), hole.s1 + 3), over = go(runner(before(hole.s0)), hole.s1 + 3, press(['jump', hole.s0, 0.6])), w = windowOf('jump', before(hole.s0), hole.s1 + 3);
  check('a hole: who runs on goes down it; jumped, it is behind', fell.out === 'hole' && fell.at > hole.s0 && fell.at < hole.s1 + 0.5 && !over.out, `${(hole.s1 - hole.s0).toFixed(1)} m wide; ${w.toFixed(2)} s in which the jump is right`);
  const hit = go(runner(before(low.s)), low.s + 3), jumped = go(runner(before(low.s)), low.s + 3, press(['jump', low.s, 1.5])), slid = go(runner(before(low.s)), low.s + 3, press(['down', low.s, 1.2])), wl = windowOf('jump', before(low.s), low.s + 3);
  check('a hurdle (yellow and black): jumped — sliding does not get one under it', hit.out === 'low' && !jumped.out && slid.out === 'low', `${wl.toFixed(2)} s in which the jump is right`);
  const head = go(runner(before(high.s)), high.s + 3), under = go(runner(before(high.s)), high.s + 3, press(['down', high.s, 1.2])), into = go(runner(before(high.s)), high.s + 3, press(['jump', high.s, 1.5])), wh = windowOf('down', before(high.s), high.s + 3);
  const twice = go(runner(before(high.s)), high.s + 3, press(['jump', high.s, 3.3], ['jump', high.s, 1.7]));
  check('a hung board (red and white): slid under — a jump goes into it; who jumps twice, and well, goes over', head.out === 'high' && !under.out && into.out === 'high' && !twice.out, `${wh.toFixed(2)} s in which the slide is right`);
  const open = fence.u0 > -H ? -1 : 1, fs = before(fence.s), straight = go(runner(fs, -open * 0.8), fence.s + 3), round = go(runner(fs, -open * 0.8), fence.s + 3, steer(open * 1.0));
  const jumpIt = go(runner(fs, -open * 0.8), fence.s + 3, press(['jump', fence.s, 3.3], ['jump', fence.s, 1.7])), slideIt = go(runner(fs, -open * 0.8), fence.s + 3, press(['down', fence.s, 1.2]));
  check('a fence (navy and cream): gone round — neither jumped nor slid under', straight.out === 'fence' && !round.out && jumpIt.out === 'fence' && slideIt.out === 'fence', `it leaves ${(2 * H - (fence.u1 - fence.u0)).toFixed(1)} m of the ${2 * H} m on one side`);
  const flat = go(runner(before(crate.s0)), crate.s1 + 4), up = go(runner(before(crate.s0)), crate.s1 - 0.6, press(['jump', crate.s0, 1.8])), on = up.st.h, off = go(up.st, crate.s1 + 4);
  check('a crate: run into, it ends the attempt; jumped onto, one runs along its top and off its end', flat.out === 'crate' && !up.out && Math.abs(on - crate.top) < 1e-6 && !off.out && off.st.h === 0, `${crate.top} m high`);
  // (the stairs: the first pair of crates that touch, the second twice as high)
  const crates = things.filter((t) => t.kind === 'crate'), a = crates.find((c) => crates.some((d) => Math.abs(d.s0 - c.s1) < 1e-6 && d.top > c.top)), b = crates.find((d) => Math.abs(d.s0 - a.s1) < 1e-6);
  const one = go(runner(before(a.s0, 3.5)), b.s1 + 4, press(['jump', a.s0, 2.6])), two = go(runner(before(a.s0, 3.5)), b.s1 - 0.5, press(['jump', a.s0, 2.6], ['jump', b.s0, 1.6]));
  check('the stairs: one jump is not enough — a jump onto the first crate, then again onto the higher one', one.out === 'crate' && one.at > a.s0 && !two.out && Math.abs(two.st.h - b.top) < 1e-6, `${a.top} m, then ${b.top} m`);
  // (the stairs with nothing behind them: off the high crate with a jump)
  const c2 = crates.filter((c) => crates.some((d) => Math.abs(d.s0 - c.s1) < 1e-6 && d.top > c.top))[1], d2 = crates.find((d) => Math.abs(d.s0 - c2.s1) < 1e-6), gap = things.find((t) => t.kind === 'hole' && Math.abs(t.s0 - d2.s1) < 1e-6);
  const walk = go(runner(before(c2.s0, 3.5)), gap.s1 + 3, press(['jump', c2.s0, 2.6], ['jump', d2.s0, 1.6])), leap = go(runner(before(c2.s0, 3.5)), gap.s1 + 3, press(['jump', c2.s0, 2.6], ['jump', d2.s0, 1.6], ['jump', d2.s1, 1.2]));
  check('where the track is missing behind the stairs, one jumps off the high crate — who walks off it goes down the hole', !!gap && walk.out === 'hole' && !leap.out, `a hole of ${(gap.s1 - gap.s0).toFixed(1)} m behind a crate of ${d2.top} m`);
  // (the planks of the last turn: the first one, by the rail)
  const planks = things.filter((t) => t.kind === 'hole' && t.s0 > 5.5 * TURN && (t.u0 > -H || t.u1 < H) && t.s1 - t.s0 > 3), p = planks[0], mid = planks.find((t) => t.s0 === p.s0 && t !== p);
  const edge = [p, mid].map((t) => (t.u0 > -H ? t.u0 : t.u1)).sort((x, y) => x - y), centre = (edge[0] + edge[1]) / 2;
  const onIt = go(runner(p.s0 + 0.5, centre), p.s1 - 0.5), offIt = go(runner(p.s0 + 0.5, centre - 1.4), p.s1 - 0.5);
  check('the planks of The Works: on one, one runs; beside it, there is nothing', !onIt.out && offIt.out === 'hole' && Number.isFinite(floorAt(p.s0 + 1, centre)) && floorAt(p.s0 + 1, centre - 1.4) === -Infinity, `${(edge[1] - edge[0]).toFixed(1)} m wide`);
  // (down in the air: a dive; the stick held: one lands sliding)
  const bare = before(high.s, 5.4), far = go(runner(bare), bare + 4.8, press(['jump', bare + 0.5, 0])), short = go(runner(bare), bare + 4.8, press(['jump', bare + 0.5, 0], ['down', bare + 1.6, 0]));
  const landAt = (r) => { let s = 0; const q = runner(bare); go(q, bare + 4.8, (st, input) => { r(st, input); if (!s && st.jumps === 0 && !st.air && st.s > bare + 1) s = st.s; }); return s; };
  const plain = landAt(press(['jump', bare + 0.5, 0])), dived = landAt(press(['jump', bare + 0.5, 0], ['down', bare + 1.6, 0])); let slidOnLanding = false;
  go(runner(bare), bare + 4.8, (st, input) => { if (st.s >= bare + 0.5 && st.s < bare + 0.6 && !st.air) input.jump = true; input.crouch = st.s > bare + 1; if (st.slide > 0 && !st.air) slidOnLanding = true; });
  check('down in the air is a dive: one is on the planks sooner — and with the stick held, one lands sliding', !far.out && !short.out && short.seen.some((e) => e.type === 'dive') && dived > 0 && dived < plain - 0.8 && slidOnLanding, `a jump of ${(plain - bare - 0.5).toFixed(1)} m, cut to ${(dived - bare - 0.5).toFixed(1)} m`);
}
{
  // ---- the same things met from a standstill: a jump is as long as the run before it, and nothing is shut for who stopped
  const jumpNow = (st, input) => { if (st.n === 0) input.jump = true; }, twice = (st, input) => { if (st.n === 0 || (st.air && st.jumps === 1 && st.vh <= 0)) input.jump = true; };
  const gaps = things.filter((t) => t.kind === 'hole' && t.u0 <= -H && t.u1 >= H && t.s1 < 5.5 * TURN); // (every hole right across the track, but the last ones, between the planks)
  let hop = 0; go(stander(5), 1e9, (st, input) => { if (st.n === 0) input.jump = true; else if (!st.air && !hop) hop = st.s - 5; }, 1); // (how far one jump takes who stood, the stick up)
  let shut = 0, short = 0, long = 0, late = 0;
  for (const g of gaps) {
    const edge = g.s0 - 0.05, far = g.s1 + 0.3, crossed = (r) => r.out !== 'hole' && r.st.s >= g.s1 - S.edge;
    if (go(stander(edge), far, jumpNow).out === 'hole') shut++; // (one jump from a standstill at its edge: down it)
    if (crossed(go(stander(edge), far, twice))) long++; // (the same with the second jump, at the top of the first)
    if (crossed(go(stander(g.s0 - 1), far, (st, input) => { if (!st.air && st.jumps === 0 && st.s >= edge && st.s < g.s0 + 0.1) input.jump = true; }))) short++; // (a metre of run-up, one jump)
    if (crossed(go(stander(edge), far, (st, input) => { if (!st.air && st.s >= g.s0 + 0.12) input.jump = true; }))) late++; // (from the very edge: the stick, then the jump at the last moment)
  }
  check('a jump is as long as the run before it: from a standstill at its edge one jump crosses no hole — a metre of run-up does, and so does the second jump',
    hop > 0.9 && hop < 1.3 && shut === gaps.length && short === gaps.length && long === gaps.length && gaps.length >= 9,
    `one jump from a standstill: ${hop.toFixed(2)} m; ${gaps.length} holes of ${Math.min(...gaps.map((g) => g.s1 - g.s0)).toFixed(1)} to ${Math.max(...gaps.map((g) => g.s1 - g.s0)).toFixed(1)} m: ${shut} too wide for it, ${short} crossed after a metre of run-up, ${long} with two jumps from the edge (${late} with one, the stick first and the jump at the last moment)`);
  // (a hurdle: a standing jump comes down on it; a crate: one gets onto it; a hung board: duck, then go — or a step and a slide)
  const low = first('low'), high = first('high'), crate = first('crate');
  const onIt = go(stander(low.s - 0.5), low.s + 2, jumpNow), stepped = go(stander(low.s - 1.6), low.s + 2, (st, input) => { if (!st.air && st.jumps === 0 && st.s >= low.s - 1) input.jump = true; }), hopped = go(stander(low.s - 0.5), low.s + 2, twice);
  const up = go(stander(crate.s0 - 0.4), crate.s0 + 1.5, jumpNow), flat = go(stander(crate.s0 - 0.4), crate.s0 + 1.5);
  const duckGo = (wait) => (st, input) => { const t = st.n * S.step; if (t < 0.3) input.crouch = true; else if (t < 0.3 + wait) input.run = 0; }; // (down, then — the stick through its middle — up)
  const into = go(stander(high.s - 1), high.s + 2), under = go(stander(high.s - 1), high.s + 2, duckGo(0.1)), tooLate = go(stander(high.s - 1), high.s + 2, duckGo(1)), tooFar = go(stander(high.s - 4.5), high.s + 2, duckGo(0.1));
  const stepSlide = go(stander(high.s - 1.2), high.s + 2, (st, input) => { if (st.n >= 17 && st.n < 29) input.run = 0; else if (st.n >= 29 && st.n < 60) input.crouch = true; if (st.n === 29) input.down = true; }); // (the stick up for seventeen steps, a tenth of a second through its middle, then down)
  const noSlide = go(stander(high.s - 3), high.s + 2, (st, input) => { input.crouch = true; if (st.n === 0) input.down = true; }, 2);
  check('from a standstill before them: a jump comes down on the hurdle — a step of run-up, or two jumps, clear it —; one jump gets one onto a crate; before a hung board one ducks, then goes',
    onIt.out === 'low' && !stepped.out && !hopped.out && !up.out && up.st.h === crate.top && flat.out === 'crate' && into.out === 'high' && !under.out && tooLate.out === 'high' && tooFar.out === 'high' && !stepSlide.out && stepSlide.seen.some((e) => e.type === 'slide') && !noSlide.out && noSlide.st.s === high.s - 3 && !noSlide.seen.some((e) => e.type === 'slide'),
    `one stays low ${S.stay} s after a duck: under the board from a metre before it; who waits a second, or ducked 4.5 m away, is up again and into it; a slide wants a run: none from a standstill, one after ${Math.round(17 * S.step * 1000)} ms of stick`);
}
{
  // ---- who only pushes the stick up
  const st = startRun(0), input = { side: 0, run: 1, jump: false, down: false, crouch: false }, events = [], seen = [];
  for (let t = 0; t < 40 && st.attempt < 4; t += S.step) { stepRun(st, S.step, input, events); for (const e of events) seen.push({ ...e, t }); events.length = 0; }
  const outs = seen.filter((e) => e.type === 'out'), foot = seen.filter((e) => e.type === 'foot'), goes = seen.filter((e) => e.type === 'go'), hole = first('hole');
  check('who only runs goes down the first hole, and is at the foot again within a second, the clock at nought', outs.length === 3 && outs.every((e) => e.why === 'hole' && e.s > hole.s0 && e.s < hole.s1 + 0.5) && foot[0].t - outs[0].t < 1 && goes[1].t - outs[0].t < 1 && st.s === 0 && st.clock === 0 && st.attempt === 4,
    `${hole.s0} m from the foot; running again ${(goes[1].t - outs[0].t).toFixed(2)} s after the fall; three attempts in ${seen.filter((e) => e.type === 'foot')[2].t.toFixed(1)} s`);
  check('the best height of the run is kept from one attempt to the next', st.best > hole.s0 && st.best < hole.s1 + 0.5 && heightOf(st.best) > 1.5, `${heightOf(st.best).toFixed(1)} m up`);
}
{
  // ---- what moves: by the clock of the world, the same for everybody, and never without a way past
  const mills = things.filter((t) => t.kind === 'mill'), stomps = things.filter((t) => t.kind === 'stomp'), hammers = things.filter((t) => t.kind === 'hammer'), rolls = things.filter((t) => t.kind === 'barrels');
  const same = JSON.stringify([millAngle(mills[0], 71.3), stompAt(stomps[0], 71.3, 1), hammerAt(hammers[0], 71.3), barrelAt(rolls[0], 40, 71.3)]) === JSON.stringify([millAngle(mills[0], 71.3), stompAt(stomps[0], 71.3, 1), hammerAt(hammers[0], 71.3), barrelAt(rolls[0], 40, 71.3)]);
  let both = 0, way = 9;
  for (let t = 0; t < 60; t += 0.01) {
    for (const s of stomps) if (stompAt(s, t, -1) < S.tall && stompAt(s, t, 1) < S.tall) both++;
    for (const h of hammers) { const u = hammerAt(h, t), shut = h.head + S.across; way = Math.min(way, Math.max(u - shut + S.reach, S.reach - (u + shut))); }
  }
  check('the two blocks of a stomper are never down together, and a hammer always leaves a way by', same && both === 0 && way > 0.5, `${way.toFixed(2)} m at the least beside a hammer`);
  let abreast = 0, least = 99;
  for (const r of rolls) for (let n = 1; n < 400; n++) { const a = barrelAt(r, n, n * r.every + r.off + 2, {}), b = barrelAt(r, n + 1, n * r.every + r.off + 2, {}); if (a.alive && b.alive) { least = Math.min(least, Math.abs(a.s - b.s)); if (Math.abs(a.s - b.s) < 2 * r.r + 1 && a.u !== b.u) abreast++; } }
  check('barrels roll down one behind the other, never two abreast; under a hung board they pass', abreast === 0 && least > 5 && rolls.every((r) => 2 * r.r <= S.bar.high), `${least.toFixed(1)} m apart at the least`);
  // (each of them met at many moments — thirty for the old kinds, ten for the new —: the runner that plays by itself is put a little before it)
  const OLD = [...mills, ...stomps, ...hammers.filter((t) => !t.form), ...rolls], NEW = things.filter((t) => ['lift', 'door', 'cannon', 'ram', 'trolley'].includes(t.kind) || (t.kind === 'hammer' && t.form));
  const spanOf = (m) => (m.kind === 'mill' ? TAU / m.turn : m.kind === 'barrels' || m.kind === 'trolley' ? m.every : m.period);
  let met = 0; const stopped = [];
  for (const m of [...OLD, ...NEW]) {
    const from = before(m.s0, 5), span = spanOf(m), n = OLD.includes(m) ? 30 : 10;
    for (let k = 0; k < n; k++) {
      const st = runner(from, 0, 40 + (k * span * 3.1) / n), input = { side: 0, run: 0, jump: false, down: false, crouch: false }, events = [];
      let out = '';
      for (let t = 0; t < 14 && st.s < m.s1 + 0.8 && !out; t += S.step) { botInput(st, input); stepRun(st, S.step, input, events); out = events.find((e) => e.type === 'out')?.why || ''; }
      met++;
      if (out || st.s < m.s1 + 0.8) stopped.push(`${m.kind} at ${m.s0.toFixed(0)} m (${out || 'not past it'})`);
    }
  }
  check('each thing that moves is got past whatever the moment one comes to it', stopped.length === 0, stopped.length ? `${stopped.length} of ${met}: ${stopped.slice(0, 4).join(', ')}` : `${OLD.length} of the first turns, thirty moments each, and ${NEW.length} of the new ones (bars, doors, cannons, rams, cables, hammers in a row), ten each: ${met} times past`);
  // (and met from a standstill right before it, by the tower, in the middle, by the rail: the runner that plays by itself lets go of the stick when the way is shut, and waits for its moment)
  let from0 = 0, waits = 0, longest = 0, where = ''; const held = [];
  for (const m of [...OLD, ...NEW]) {
    const from = m.kind === 'mill' ? m.s - m.arm - 0.3 : m.kind === 'barrels' || m.kind === 'trolley' ? before(m.s0, 3) : m.s0 - S.along - 0.1;
    const span = spanOf(m), n = OLD.includes(m) ? 12 : 6;
    for (const u of m.kind === 'barrels' || m.kind === 'trolley' ? [0] : [-1.3, 0, 1.3]) for (let k = 0; k < n; k++) {
      const st = stander(from, u, 40 + (k * span * 3.1) / n), input = { side: 0, run: 0, jump: false, down: false, crouch: false }, events = [];
      let out = '', t = 0, stood = 0;
      for (; t < 30 && st.s < m.s1 + 0.8 && !out; t += S.step) { botInput(st, input); if (!input.run && st.v === 0) stood += S.step; stepRun(st, S.step, input, events); out = events.find((e) => e.type === 'out')?.why || ''; }
      from0++; if (st.bot.stops) waits++; if (stood > longest) { longest = stood; where = `${m.kind} at ${m.s0.toFixed(0)} m`; }
      if (out || st.s < m.s1 + 0.8) held.push(`${m.kind} at ${m.s0.toFixed(0)} m, ${u} across, moment ${k} (${out || 'not past it after 30 s'})`);
    }
  }
  globalThis.WAITED = `${longest.toFixed(1)} s (${where})`;
  check('and by one who had stopped right before it: the runner that plays by itself waits for its moment — three seconds at most —, then goes', held.length === 0 && waits > 0 && longest < 3.5, held.length ? `${held.length} of ${from0}: ${held.slice(0, 4).join(', ')}` : `across the track, at many moments: ${from0} times past, ${waits} of them after letting go of the stick to wait — ${globalThis.WAITED} at the longest`);
  // (what moves leaves nowhere to stand for ever: within a mill, under a stomper, in the swing of a hammer, one is caught within one of its turns)
  let spots = 0, safe = 0;
  for (const m of mills) for (let ds = -1.5; ds <= 1.5; ds += 0.5) for (const u of [-1.3, -0.65, 0, 0.65, 1.3]) { if (Math.hypot(ds, u) > m.arm) continue; spots++; if (go(stander(m.s + ds, u, 40), 1e9, still, TAU / m.turn + 0.1).out !== 'mill') safe++; }
  for (const m of stomps) for (const ds of [0.1, 0.8, 1.5]) for (const u of [-1.3, -0.65, -0.1, 0, 0.1, 0.65, 1.3]) { spots++; if (go(stander(m.s0 + ds, u, 40), 1e9, still, m.period + 0.1).out !== 'stomp') safe++; }
  for (const m of hammers) for (const u of [-1.3, -0.65, 0, 0.65, 1.3]) { spots++; if (go(stander(m.s, u, 40), 1e9, still, m.period + 0.1).out !== 'hammer') safe++; }
  check('what moves leaves nowhere to stand for ever: within a mill, under a stomper, in the swing of a hammer, one is caught within one turn of it', safe === 0 && spots > 80, `${spots} places stood on: ${spots - safe} caught`);
  // (the barrels: they come at who stands still as well — wherever across the track, ducking or not)
  let stoodAt = 0, bowled = 0, worst = 0, sum = 0;
  for (const r of rolls) for (const f of [0.12, 0.5, 0.9]) for (const u of [-1.3, -0.65, 0, 0.65, 1.3]) for (const t0 of [40, 53.7, 91.3]) for (const crouch of [false, true]) {
    let s0 = r.s0 + (r.s1 - r.s0) * f; while (things.some((t) => t.kind === 'high' && Math.abs(t.s - s0) < 0.6)) s0 += 0.7; // (not under a hung board: nobody stands there)
    const res = go(stander(s0, u, t0), 1e9, (st, input) => { input.run = 0; input.crouch = crouch; }, 90);
    stoodAt++; if (res.out === 'barrel') { bowled++; worst = Math.max(worst, res.t); sum += res.t; }
  }
  check('standing still in the turn of the barrels does not save one: wherever one stands, a barrel comes', bowled === stoodAt && worst < 60, `${stoodAt} times stood among them, on ${rolls.length === 1 ? 'their stretch' : `their ${rolls.length} stretches`}: bowled over every time — after ${(sum / Math.max(1, bowled)).toFixed(1)} s on average, ${worst.toFixed(1)} s at the longest`);
}
{
  // ---- the new kinds, one after the other: their move gets one past, nothing else does
  const kind = (k, f) => things.filter((t) => t.kind === k && (f === undefined || t.form === f));
  const holeAt = (s0) => things.find((t) => t.kind === 'hole' && Math.abs(t.s0 - s0) < 1e-6);
  /** Does pressing `key` at some step of the first `n` get runner `make()` past metre `to`? */
  const someKey = (make, to, key, n = 60) => { for (let k = 0; k < n; k++) { let i = 0; if (!go(make(), to, (st, input) => { if (i++ === k) input[key] = true; }).out) return true; } return false; };
  // (planks that give way)
  const cr = kind('crumble').filter((t) => !t.form), c0 = cr[0]; let c1 = c0; while (cr.some((t) => Math.abs(t.s0 - c1.s1) < 1e-6)) c1 = cr.find((t) => Math.abs(t.s0 - c1.s1) < 1e-6);
  const across = go(runner(before(c0.s0)), c1.s1 + 1), stop = go(runner(before(c0.s0)), c1.s1 + 1, (st, input) => { if (st.s > c0.s0 + 2) input.run = 0; }, 4);
  check('planks that give way: who keeps running is over them — who stops on one goes down with it', !across.out && stop.out === 'hole' && stop.at < c0.s0 + 3.5, `${Math.round(c1.s1 - c0.s0)} planks of a metre; each holds ${S.crumble} s from the first foot set on it`);
  // (springboards: the hole behind one is too long for any jump — taken at its very edge, by the tower, at full speed, with both jumps)
  const sp = kind('spring')[0], gap = holeAt(sp.s1 + 0.3);
  const thrown = go(runner(before(sp.s0)), gap.s1 + 2), stepOn = go(stander(sp.s0 - 0.5), gap.s1 + 2, null, 4);
  let crossed = 0, best = 0;
  for (let k1 = 0; k1 < 8; k1++) for (let g = 4; g < 90; g += 2) {
    const r = go(runner(sp.s1 + 0.02, -S.reach), gap.s1 + 2, (st, input) => { input.side = -1; if (st.n === k1 || st.n === k1 + g) input.jump = true; });
    if (!r.out) crossed++; else best = Math.max(best, r.at - gap.s0);
  }
  check('a springboard (gold): who runs onto it — or steps on it from a standstill — is thrown over the hole behind it; no jump, nor two, gets one across', !thrown.out && !stepOn.out && crossed === 0 && thrown.seen.some((e) => e.type === 'spring'), `a hole of ${(gap.s1 - gap.s0).toFixed(1)} m; two jumps from its edge, at full speed by the tower, get ${best.toFixed(1)} m at the best`);
  // (stairs three high: two jumps do not get one onto the top, three do; off it, a jump)
  const top = kind('crate', 'stack')[0], mid = things.find((t) => t.kind === 'crate' && Math.abs(t.s1 - top.s0) < 1e-6), low = things.find((t) => t.kind === 'crate' && Math.abs(t.s1 - mid.s0) < 1e-6), pit = holeAt(top.s1);
  const from = before(low.s0, 3.5), keys = (...at) => (st, input) => { if (at.includes(st.n)) input.jump = true; };
  let two = 0, three = null;
  for (let a = 0; a < 40; a += 2) for (let b = a + 6; b < a + 90; b += 3) { const r = go(runner(from), top.s0 + 0.5, keys(a, b)); if (!r.out && r.st.h >= top.top - 1e-6) two++; }
  for (let a = 0; a < 40 && !three; a += 2) for (let b = a + 10; b < a + 80 && !three; b += 4) for (let c = b + 10; c < b + 80 && !three; c += 4) { const r = go(runner(from), top.s0 + 0.6, keys(a, b, c)); if (!r.out && r.st.h >= top.top - 1e-6) three = [a, b, c]; }
  const walk = three && go(go(runner(from), top.s0 + 0.6, keys(...three)).st, pit.s1 + 2), leap = three && go(go(runner(from), top.s0 + 0.6, keys(...three)).st, pit.s1 + 2, (st, input) => { if (st.s > top.s1 - 1.4 && !st.air && st.h > 2) input.jump = true; });
  check('stairs three high (a gold band): two jumps do not get one onto the top — three do —, and off it a jump: who walks off goes down the hole behind', two === 0 && !!three && walk.out === 'hole' && !leap.out, `${low.top}, ${mid.top} then ${top.top} m; a hole of ${(pit.s1 - pit.s0).toFixed(1)} m behind`);
  // (bars that go up and down: met low, a jump; met high, a slide; and nothing else)
  const lf = kind('lift')[0], eta = 3 / speedAt(lf.s), when = (y) => { for (let t = 40; ; t += 0.01) if (Math.abs(liftAt(lf, t + eta) - y) < 1e-9 && Math.abs(liftAt(lf, t + eta - 0.25) - y) < 1e-9 && Math.abs(liftAt(lf, t + eta + 0.25) - y) < 1e-9) return t; };
  const tLow = when(lf.lo), tHigh = when(lf.hi), atLift = (t0) => () => runner(lf.s - 3, 0, t0);
  const liftOk = go(atLift(tLow)(), lf.s + 0.6).out === 'lift' && someKey(atLift(tLow), lf.s + 0.6, 'jump') && !someKey(atLift(tLow), lf.s + 0.6, 'down') && go(atLift(tHigh)(), lf.s + 0.6).out === 'lift' && someKey(atLift(tHigh), lf.s + 0.6, 'down') && !someKey(atLift(tHigh), lf.s + 0.6, 'jump');
  check('a bar that goes up and down (yellow and black while low, red and white while high): low, it is jumped — high, slid under; run into, it ends the attempt', liftOk, `its foot from ${lf.lo} to ${lf.hi} m, every ${lf.period} s`);
  // (the wind: in a gust, who does not steer against it is pushed into the hole by the rail)
  const wd = kind('wind')[0], pit2 = things.find((t) => t.kind === 'hole' && t.s0 > wd.s0 && t.u0 >= 0), gust = Math.ceil(40 / wd.period) * wd.period - wd.phase * wd.period;
  const blown = go(runner(wd.s0 + 0.5, -1, gust), pit2.s1 + 0.5), held = go(runner(wd.s0 + 0.5, -1, gust), pit2.s1 + 0.5, steer(-1));
  check('the wind (streamers show it): in a gust, who does not steer against it is pushed into the hole by the rail — who does, is not', blown.out === 'hole' && !held.out && gustAt(wd, gust + 0.5) === 1, `${wd.push} m/s across in a gust, ${Math.round(wd.period * 0.37 * 10) / 10} s long, every ${wd.period} s`);
  // (belts: who stands on one is carried back into the hole behind it; who runs, gets up it)
  const bt = kind('belt')[0], hurdle = things.find((t) => t.kind === 'low' && t.s > bt.s0);
  const carried = go(stander(bt.s0 + 3), 1e9, still, 6), ran = go(runner(bt.s0 + 0.3), hurdle.s - 1.5);
  check('a belt (black, its slats running down): who stands on it is carried back down into the hole behind it — who runs gets up it', carried.out === 'hole' && !ran.out && ran.st.s >= hurdle.s - 1.5, `${bt.v} m/s down, ${(bt.s1 - bt.s0).toFixed(0)} m long; up it at ${((hurdle.s - 1.5 - bt.s0 - 0.3) / ran.t).toFixed(1)} m/s`);
  // (sliding doors: who runs straight on meets the wall, at some moments; who steers to the door goes through, at every moment)
  const dr = kind('door')[0]; let walled = 0, through = 0;
  for (let k = 0; k < 24; k++) {
    const t0 = 40 + (k * dr.period) / 24;
    if (go(runner(dr.s - 4, 0, t0), dr.s + 0.6).out === 'door') walled++;
    const aim = (st, input) => { const eta = Math.max(0, dr.s - st.s) / Math.max(1, st.v), u = doorAt(dr, st.t0 + st.total + eta); input.side = Math.max(-1, Math.min(1, (u - st.u) * 5)); };
    if (!go(runner(dr.s - 4, 0, t0), dr.s + 0.6, aim).out) through++;
  }
  check('a wall with a sliding door (navy): who runs straight on meets the wall — who steers to the door goes through, whenever one comes', walled > 6 && through === 24, `straight on: into the wall at ${walled} moments of 24; steering to the door: through at ${through}`);
  // (cannon balls: met as one crosses, a low one is jumped, a high one slid under)
  const ballOk = kind('cannon').slice(0, 2).map((cn) => {
    const eta = 3 / speedAt(cn.s); let t0 = 40; while (Math.abs(cannonAt(cn, t0 + eta)) > 0.05) t0 += 0.001;
    const make = () => runner(cn.s - 3, 0, t0), key = cn.high ? 'down' : 'jump', other = cn.high ? 'jump' : 'down';
    return go(make(), cn.s + 0.6).out === 'cannon' && someKey(make, cn.s + 0.6, key) && !someKey(make, cn.s + 0.6, other);
  });
  check('cannon balls shot across from the tower: a low one (black and yellow) is jumped, a high one (red and white) slid under — met without, they end the attempt', ballOk.every(Boolean) && kind('cannon').some((c) => c.high) && kind('cannon').some((c) => !c.high), `${kind('cannon').length} cannons, a ball each every ${Math.min(...kind('cannon').map((c) => c.period))} to ${Math.max(...kind('cannon').map((c) => c.period))} s, ${kind('cannon')[0].v} m/s`);
  // (planks a foot wide: on one, one runs; beside it, nothing)
  const rp = kind('hole', 'rope'), ra = rp[0], rb = rp.find((t) => t !== ra && Math.abs(t.s0 - ra.s0) < 1e-6), rc = (ra.u1 + rb.u0) / 2;
  const onRope = go(runner(ra.s0 + 0.3, rc), ra.s1 - 0.3), offRope = go(runner(ra.s0 + 0.3, rc + 0.6), ra.s1 - 0.3);
  check('planks a foot wide over nothing: on one, one runs — a step beside it, and one is down', !onRope.out && offRope.out === 'hole', `${(rb.u0 - ra.u1).toFixed(2)} m wide, ${kind('hole', 'rope').length / 2} of them`);
  // (boards on a cable: who stands under the cable is swept off — ducking, the board goes over)
  const tr = kind('trolley')[0], under = tr.s0 + 3;
  const swept = go(stander(under, 0, 40), 1e9, still, 3 * tr.every), ducked = go(stander(under, 0, 40), 1e9, (st, input) => { input.run = 0; input.crouch = true; }, 3 * tr.every);
  check('boards on a cable (red and white) come down the track: who stands up under it is swept off — who ducks lets them by', swept.out === 'trolley' && !ducked.out, `one every ${tr.every} s at ${tr.v} m/s`);
  // (rams: who runs straight on meets one, at some moments)
  const rm = kind('ram')[0]; let rammed = 0;
  for (let k = 0; k < 24; k++) if (go(runner(rm.s - 3.5, 0, 40 + (k * rm.period) / 24), rm.s + 0.8).out === 'ram') rammed++;
  check('rams (navy, a yellow and black face) shoot across from the tower or from the rail: who runs straight on meets one at some moments — the moment is read, or waited for', rammed > 4 && rammed < 24 && Math.max(...Array.from({ length: 200 }, (_, k) => ramAt(rm, (k * rm.period) / 200))) > 2 * H, `into it at ${rammed} moments of 24`);
  // (to the bell, on planks a foot wide that give way: who keeps running rings it; who stops goes down)
  const last = kind('crumble', 'rope').filter((t) => t.s1 > LENGTH - 12), lc = (last[0].u0 + last[0].u1) / 2;
  const rung = go(runner(last[0].s0 + 0.1, lc), LENGTH + 1), halt = go(runner(last[0].s0 + 0.1, lc), LENGTH + 1, (st, input) => { if (st.s > last[0].s0 + 3) input.run = 0; }, 4);
  check('the last planks, a foot wide and giving way: who keeps running rings the bell — who stops goes down', rung.st.over && halt.out === 'hole', `${last.length} m of them before the bell`);
}
{
  // ---- nothing asks for a move timed to less than a quarter of a second: each hole, hurdle and hung board right across the track, met at a run
  const win = (t) => {
    // (from as far back as six metres, with nothing in between — planks that give way aside)
    const key = t.kind === 'high' ? 'down' : 'jump', ok = (s) => floorAt(s, 0) === 0 && !things.some((q) => !STRETCH.has(q.kind) && q.kind !== 'crumble' && s > q.s0 - 1.2 && s < q.s1 + 1.2);
    let from = t.s0 - 1.3; while (from > t.s0 - 6 && ok(from - 0.25)) from -= 0.25;
    let n = 0;
    for (let k = 0; k < 240; k++) {
      let i = 0; const st = runner(from), events = [], input = { side: 0, run: 1, jump: false, down: false, crouch: false };
      let ok = true;
      for (let q = 0; q < 600; q++) {
        input.jump = input.down = false; if (i++ === k) input[key] = true; input.run = input.down ? 0 : 1;
        stepRun(st, S.step, input, events);
        if (events.some((e) => e.type === 'out')) { ok = false; break; }
        events.length = 0;
        if (st.s > t.s1 + 0.4 && !st.air) break;
      }
      if (ok) n++;
    }
    return n * S.step;
  };
  const spring = new Set(things.filter((t) => t.kind === 'spring').map((t) => (t.s1 + 0.3).toFixed(3)));
  const wind = things.filter((t) => ['wind', 'belt', 'trolley', 'barrels'].includes(t.kind)); // (where something else comes at one as well)
  const side = things.filter((q) => (q.kind === 'hole' && (q.u0 > -H || q.u1 < H)) || q.kind === 'crate'); // (a gap between two planks is crossed steering, a hole behind a crate jumped from its top: neither is met straight on)
  const all = things.filter((t) => ['hole', 'low', 'high'].includes(t.kind) && t.u0 <= -H && t.u1 >= H && !spring.has(t.s0.toFixed(3)) && !wind.some((w) => t.s0 < w.s1 && t.s1 > w.s0) && !side.some((q) => Math.abs(q.s1 - t.s0) < 0.1 || Math.abs(q.s0 - t.s1) < 0.1));
  const ws = all.map((t) => ({ t, w: win(t) })).sort((a, b) => a.w - b.w);
  globalThis.TIGHTEST = `${ws[0].w.toFixed(2)} s (a ${ws[0].t.kind} at ${ws[0].t.s0.toFixed(0)} m)`;
  check('nothing asks for a move timed to less than a quarter of a second: every hole, hurdle and hung board right across the track, met straight on at a run, leaves that long to press the key', ws[0].w >= 0.25, `${ws.length} of them: ${globalThis.TIGHTEST} at the tightest, ${ws[Math.floor(ws.length / 2)].w.toFixed(2)} s for half of them or less`);
}
{
  // ---- the landings, and where a touch puts one back
  const level = LANDINGS.every((a) => slopeAt(a + 0.5) < 1e-6 && slopeAt(a + S.land - 0.5) < 1e-6), empty = LANDINGS.every((a) => !things.some((t) => t.s1 > a - 0.25 && t.s0 < a + S.land + 0.25));
  const apart = LANDINGS.map((a, i) => (i ? (a - LANDINGS[i - 1]) / TURN : a / TURN));
  check('a landing every three turns: level, and nothing on it', LANDINGS.length === 6 && level && empty && apart.every((d) => d > 2.8 && d < 3.2), `at ${LANDINGS.map((a) => `${heightOf(a).toFixed(0)} m`).join(', ')} up, ${S.land} m long`);
  const L = LANDINGS[1], hit = things.find((t) => t.kind === 'low' && t.s > L);
  const touch = (mode) => {
    const keep = S.back; S.back = mode;
    const st = runner(L - 3), r = go(st, hit.s + 2), at = st.clock, input = { side: 0, run: 0, jump: false, down: false, crouch: false };
    let t = 0; while (st.down > 0 || st.wait > 0) { stepRun(st, S.step, input); t += S.step; }
    for (let k = 0; k < 60; k++) { stepRun(st, S.step, input); t += S.step; }
    S.back = keep;
    return { why: r.out, s: st.s, clock: st.clock, at, t, going: st.going };
  };
  const land = touch('landing'), foot = touch('foot');
  check("a landing is a save (back: 'landing', the rule): a touch puts one back on the last landing reached, and the clock runs on — with back: 'foot', at the foot, where the clock waits for the first step",
    S.back === 'landing' && land.why === 'low' && Math.abs(land.s - (L + S.land / 2)) < 1e-6 && land.going && Math.abs(land.clock - land.at - land.t) < 1e-6 && foot.why === 'low' && foot.s === 0 && foot.clock === 0 && !foot.going,
    `a hurdle ${(hit.s - L).toFixed(0)} m past the landing at ${heightOf(L).toFixed(0)} m: 'landing' puts one back on it, the clock ${land.at.toFixed(1)} s then ${land.clock.toFixed(1)} s after ${land.t.toFixed(1)} s; 'foot' puts one at the foot, the clock at 0`);
  {
    // every landing saves once, as it is first reached: a run to the bell tells the six of them, in order
    const st = startRun(0), input = { side: 0, run: 0, jump: false, down: false, crouch: false }, events = [], saves = [];
    for (let t = 0; t < 600 && !st.over; t += S.step) { botInput(st, input); stepRun(st, S.step, input, events); for (const e of events) if (e.type === 'save') saves.push(e); events.length = 0; }
    const heights = saves.map((e) => heightOf(e.s)), gaps = [...heights.map((h, i) => h - (i ? heights[i - 1] : 0)), heightOf(LENGTH) - (heights[heights.length - 1] || 0)], most = Math.max(...gaps);
    check('a run to the bell is saved six times, at each landing as it is first reached: from the foot to a save, from a save to the next, from the last to the bell, never thirty metres of climb',
      st.over && saves.length === 6 && saves.every((e, i) => e.n === i + 1 && e.s === LANDINGS[i]) && most < 30, `saved ${heights.map((h) => h.toFixed(0)).join(', ')} m up; the most to climb between two: ${most.toFixed(1)} m`);
  }
  {
    // a fall after a save costs the way back from that save, not the climb: one goes on, and the time is the whole of it
    const st = runner(L - 3), r = go(st, hit.s + 2), at = st.clock, input = { side: 0, run: 0, jump: false, down: false, crouch: false };
    for (let t = 0; t < 600 && !st.over; t += S.step) { botInput(st, input); stepRun(st, S.step, input); }
    check('a fall after a save: one goes on from that landing and rings the bell at the second attempt — the clock never went back: the fall is in the time',
      r.out === 'low' && st.over && st.attempt === 2 && st.outs === 1 && Math.abs(st.time - Math.round(st.clock * 1000)) <= 1 && st.clock > at + S.fall, `touched ${at.toFixed(1)} s after the landing, the bell ${(st.time / 1000).toFixed(1)} s after it`);
    // before the first landing there is no save: the foot, and a new start — the clock waits for the first step
    const hole = things.find((t) => t.kind === 'hole'), early = runner(Math.max(1, hole.s0 - 4)), fell = go(early, hole.s1 + 3);
    for (let k = 0; k < 400 && (early.down > 0 || early.wait > 0); k++) stepRun(early, S.step, { side: 0, run: 0, jump: false, down: false, crouch: false });
    check('before the first landing nothing is saved: a fall puts one back at the foot, the clock at nought, waiting for the first step', fell.out === 'hole' && early.s === 0 && early.clock === 0 && !early.going && early.home === 0 && early.attempt === 2, `a hole ${heightOf(hole.s0).toFixed(1)} m up`);
  }
}
{
  // ---- the runner that plays by itself
  const runs = [0, 7.3, 14.6].map((t0) => botRun(t0, 600));
  check('a runner that plays by itself reaches the bell at its first attempt, whenever it starts', runs.every((r) => r.over && r.attempts === 1 && r.time > fastest() && r.time < globalThis.SLOWEST * 1000 && r.time <= r.clock * 1000 + 1), `${runs.map((r) => (r.time / 1000).toFixed(1)).join(' · ')} s from the first step; ${Math.round(runs.reduce((a, r) => a + r.keys, 0) / runs.length)} keys pressed; the stick let go to wait ${runs.reduce((a, r) => a + r.stops, 0)} times in all; its tightest key ${globalThis.TIGHTEST}, its longest wait ${globalThis.WAITED}`);
  globalThis.BOT = runs;
  // (the same runner on slower legs: every jump is shorter, every slide too — and still nothing on the way is shut)
  const legs = S.speed.slice(), slower = [0.75, 0.5].map((k) => { S.speed = legs.map((v) => v * k); const r = botRun(11, 900); S.speed = legs; return { k, ...r }; });
  check('nothing on the way needs the full speed: on legs that never go faster than three quarters of it, than half of it, the same runner reaches the bell at its first attempt', slower.every((r) => r.over && r.attempts === 1), slower.map((r) => `at ${Math.round(r.k * 100)} %: ${r.over ? `${(r.time / 1000).toFixed(1)} s` : `not there — ${r.why.slice(0, 3).join(', ')}`}`).join(' · '));
  const at = (dt) => { const st = startRun(3), input = { side: 0, run: 0, jump: false, down: false, crouch: false }; let acc = 0; for (let t = 0; t < 400 && !st.over; t += dt) { acc += dt; while (acc >= S.step && !st.over) { acc -= S.step; botInput(st, input); stepRun(st, S.step, input, null); } } return st.time; };
  const a30 = at(1 / 30), a144 = at(1 / 144);
  check('the same run at 30 and at 144 frames a second', a30 === a144 && a30 > 0, `the bell in ${(a30 / 1000).toFixed(2)} s both times`);
  // ---- each turn worse than the last, and each with something new
  const count = turns.map((t) => t.things.reduce((n, x) => n + (x.kind === 'barrels' || x.kind === 'trolley' ? Math.ceil((x.s1 - x.s0) / (x.every * x.v)) : 1), 0));
  const kinds = turns.map((t) => [...new Set(t.things.map((x) => (x.form ? `${x.kind} (${x.form})` : x.kind)))]), seenKinds = new Set(), fresh = kinds.map((list) => { const novel = list.filter((k) => !seenKinds.has(k)); for (const k of list) seenKinds.add(k); return novel; });
  const firstAt = Math.min(...things.map((t) => t.s0));
  check('each turn has at least as much in the way as the one before, and every one but the sixth brings something new', count.every((n, i) => i === 0 || n >= count[i - 1]) && count[5] > count[0] * 2 && fresh.every((f, i) => i === 5 || f.length > 0) && firstAt > 12,
    `${count.join(', ')} things (the barrels and the boards on the track at once counted); new: ${fresh.map((f, i) => `${i + 1}: ${f.join(' ') || '—'}`).join(' · ')}; nothing in the first ${firstAt} m`);
  // ---- its line for the boards of scores
  const late = startRun(0); Object.assign(late, { s: LENGTH - 0.05, going: true, clock: 3600 }); stepRun(late, 0.1, { run: 1 });
  check('its board: the time from the first step to the bell — falls and all, once a landing has saved one —, the lower the better — from the time nobody can beat (along the tower, thrown by the springboards) to a quarter of an hour, the most that is counted',
    BOARD.order === 'asc' && BOARD.min === Math.floor(fastest() / 1000) * 1000 && BOARD.max === 900_000 && [...runs, ...slower].every((r) => r.time >= BOARD.min && r.time <= BOARD.max) && late.over && late.time === BOARD.max,
    `${(fastest() / 1000).toFixed(1)} s at the least; an attempt of an hour is told as ${late.time / 1000} s`);
  { const S = SERVER.spiral || {}; check('the server keeps its board by the same line (server/scores.js), behind its switch', S.order === BOARD.order && S.min === BOARD.min && S.max === BOARD.max && S.release === 'spiral', JSON.stringify(S)); }
  console.log(`      for the board of scores: spiral: { order: '${BOARD.order}', min: ${BOARD.min}, max: ${BOARD.max} }`);
}
done();
