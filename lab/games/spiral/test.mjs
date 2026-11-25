// Checks of A Turn for the Worse, without a browser: the tower stands in the sea, clear of the cliffs, of the
// cleft and of the pier, and its gate on dry sand; the track is a slope one can run and leaves room under the
// turn above; the camera sees far enough past the tower; the legs do what the stick asks — who lets go stops,
// nobody runs back down, the clock starts with the first step —; each thing in the way is got past by its move
// and ends the attempt without it, at a run and from a standstill; who only runs is back at the foot within a
// second; what moves is the same for everybody, can be got past whatever the moment one arrives — or waited
// for — and leaves nowhere to stand for ever; a runner that plays by itself reaches the bell; each turn has
// more in the way than the last.
// usage: node lab/games/spiral/test.mjs
import { check, done, ground } from '../check.mjs';
import { BOUNDS, pierToWorld, PIER } from '../../../src/world/layout/layout.js';
import { CLEFT } from '../../../src/world/zones/games/crack/cleft.js';
import { SPIRAL, BOARD, TURN, LENGTH, course, speedAt, trackY, spiralAt, sightAhead, fastest, floorAt, millAngle, stompAt, hammerAt, barrelAt, startRun, stepRun, botInput, botRun, heightOf } from './rules.js';

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
const clear = (s) => floorAt(s, 0) === 0 && !things.some((t) => t.kind !== 'barrels' && s > t.s0 - 1.2 && s < t.s1 + 1.2);
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
  check('clear of the cliffs, of the cleft of Between a Rock and of the pier', land - (S.r + H) > 15 && cleft > 35 && pier > 25, `from its rail: ${(land - S.r - H).toFixed(0)} m to the nearest land, ${cleft.toFixed(0)} m to the cleft, ${pier.toFixed(0)} m to the pier`);
  const g = S.gate, gh = height(g.x, g.z); let sea = 99, hump = -9;
  for (let k = 0; k < 72; k++) for (let d = 1; d < sea; d += 0.5) { const a = (k / 72) * TAU; if (height(g.x + Math.cos(a) * d, g.z + Math.sin(a) * d) < 0) { sea = d; break; } }
  for (let f = 0.15; f <= 1; f += 0.01) hump = Math.max(hump, height(g.x + (C.x - S.r - g.x) * f, g.z + (C.z - g.z) * f));
  check('the gate is on dry sand, a few steps from the water, the tower in sight across the bay', gh > 0.4 && gh < 3 && sea < 14 && hump < 0.5 && inside(g.x, g.z, BOUNDS), `${gh.toFixed(1)} m over the sea, ${sea.toFixed(0)} m from the water, ${Math.hypot(C.x - g.x, C.z - g.z).toFixed(0)} m from the tower`);
}
{
  // ---- the track
  const slope = S.rise / TURN, head = 1.8 + (S.jump * S.jump + S.again * S.again) / (2 * S.g) + S.tall, room = S.rise - 0.24 - 0.26;
  check('six turns round the tower, a slope one runs up, room under the turn above for the highest jump', S.turns === 6 && slope < 0.15 && head < room - 0.5 && Math.abs(trackY(LENGTH) - S.foot - S.turns * S.rise) < 1e-6, `${LENGTH.toFixed(0)} m of track, ${(S.turns * S.rise).toFixed(0)} m up, ${(slope * 100).toFixed(0)} % ; a head at ${head.toFixed(1)} m at most, ${room.toFixed(1)} m of room`);
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
  const stops = [5, 309].map((s0) => { const st = runner(s0); let t = 0; while (st.v > 0 && t < 2) { stepRun(st, S.step, { run: 0 }); t += S.step; } const at = st.s; go(st, 999, still, 3); return { t, d: at - s0, moved: st.s - at, v: speedAt(s0) }; });
  const starts = [5, 309].map((s0) => { const st = stander(s0); let t = 0; while (st.v < speedAt(st.s) - 1e-3 && t < 2) { stepRun(st, S.step, { run: 1 }); t += S.step; } return { t, d: st.s - s0 }; });
  const half = stander(5); go(half, 999, (st, input) => { input.run = 0.5; }, 2);
  const back = stander(5); go(back, 999, (st, input) => { input.crouch = true; }, 2);
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
  check('the planks before the bell: on one, one runs; beside it, there is nothing', !onIt.out && offIt.out === 'hole' && Number.isFinite(floorAt(p.s0 + 1, centre)) && floorAt(p.s0 + 1, centre - 1.4) === -Infinity, `${(edge[1] - edge[0]).toFixed(1)} m wide`);
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
  let hop = 0; go(stander(5), 999, (st, input) => { if (st.n === 0) input.jump = true; else if (!st.air && !hop) hop = st.s - 5; }, 1); // (how far one jump takes who stood, the stick up)
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
  // (each of them met at thirty moments: the runner that plays by itself is put a little before it)
  let met = 0; const stopped = [];
  for (const m of [...mills, ...stomps, ...hammers, ...rolls]) {
    const from = before(m.s0, 5);
    const span = m.kind === 'mill' ? TAU / m.turn : m.kind === 'barrels' ? m.every : m.period;
    for (let k = 0; k < 30; k++) {
      const st = runner(from, 0, 40 + (k * span * 3.1) / 30), input = { side: 0, run: 0, jump: false, down: false, crouch: false }, events = [];
      let out = '';
      for (let t = 0; t < 12 && st.s < m.s1 + 0.8 && !out; t += S.step) { botInput(st, input); stepRun(st, S.step, input, events); out = events.find((e) => e.type === 'out')?.why || ''; }
      met++;
      if (out) stopped.push(`${m.kind} at ${m.s0.toFixed(0)} m (${out})`);
    }
  }
  check('each thing that moves is got past whatever the moment one comes to it', stopped.length === 0, stopped.length ? stopped.slice(0, 4).join(', ') : `${mills.length} mills, ${stomps.length} stompers, ${hammers.length} hammers, ${rolls.length} runs of barrels, thirty moments each: ${met} times past`);
  // (and met from a standstill, a step before it: the runner that plays by itself lets go of the stick when the way is shut, and waits for its moment)
  let from0 = 0, waits = 0, longest = 0; const held = [];
  for (const m of [...mills, ...stomps, ...hammers, ...rolls]) {
    const from = m.kind === 'mill' ? m.s - m.arm - 0.6 : m.kind === 'barrels' ? before(m.s0, 3) : m.s0 - S.along - 0.4;
    const span = m.kind === 'mill' ? TAU / m.turn : m.kind === 'barrels' ? m.every : m.period;
    for (let k = 0; k < 12; k++) {
      const st = stander(from, 0, 40 + (k * span * 3.1) / 12), input = { side: 0, run: 0, jump: false, down: false, crouch: false }, events = [];
      let out = '', t = 0, stood = 0;
      for (; t < 30 && st.s < m.s1 + 0.8 && !out; t += S.step) { botInput(st, input); if (!input.run && st.v === 0) stood += S.step; stepRun(st, S.step, input, events); out = events.find((e) => e.type === 'out')?.why || ''; }
      from0++; if (st.bot.stops) waits++; longest = Math.max(longest, stood);
      if (out || st.s < m.s1 + 0.8) held.push(`${m.kind} at ${m.s0.toFixed(0)} m (${out || 'not past it after 30 s'})`);
    }
  }
  check('and by one who had stopped a step before it: the runner that plays by itself waits for its moment, then goes', held.length === 0 && waits > 0 && longest < 6, held.length ? held.slice(0, 4).join(', ') : `twelve moments each: ${from0} times past, ${waits} of them after letting go of the stick to wait — ${longest.toFixed(1)} s at the longest`);
  // (what moves leaves nowhere to stand for ever: within a mill, under a stomper, in the swing of a hammer, one is caught within one of its turns)
  let spots = 0, safe = 0;
  for (const m of mills) for (let ds = -1.5; ds <= 1.5; ds += 0.5) for (const u of [-1.3, -0.65, 0, 0.65, 1.3]) { if (Math.hypot(ds, u) > m.arm) continue; spots++; if (go(stander(m.s + ds, u, 40), 999, still, TAU / m.turn + 0.1).out !== 'mill') safe++; }
  for (const m of stomps) for (const ds of [0.1, 0.8, 1.5]) for (const u of [-1.3, -0.65, -0.1, 0, 0.1, 0.65, 1.3]) { spots++; if (go(stander(m.s0 + ds, u, 40), 999, still, m.period + 0.1).out !== 'stomp') safe++; }
  for (const m of hammers) for (const u of [-1.3, -0.65, 0, 0.65, 1.3]) { spots++; if (go(stander(m.s, u, 40), 999, still, m.period + 0.1).out !== 'hammer') safe++; }
  check('what moves leaves nowhere to stand for ever: within a mill, under a stomper, in the swing of a hammer, one is caught within one turn of it', safe === 0 && spots > 80, `${spots} places stood on: ${spots - safe} caught`);
  // (the barrels: they come at who stands still as well — wherever across the track, ducking or not)
  let stoodAt = 0, bowled = 0, worst = 0, sum = 0;
  for (const r of rolls) for (const f of [0.12, 0.5, 0.9]) for (const u of [-1.3, -0.65, 0, 0.65, 1.3]) for (const t0 of [40, 53.7, 91.3]) for (const crouch of [false, true]) {
    let s0 = r.s0 + (r.s1 - r.s0) * f; while (things.some((t) => t.kind === 'high' && Math.abs(t.s - s0) < 0.6)) s0 += 0.7; // (not under a hung board: nobody stands there)
    const res = go(stander(s0, u, t0), 999, (st, input) => { input.run = 0; input.crouch = crouch; }, 90);
    stoodAt++; if (res.out === 'barrel') { bowled++; worst = Math.max(worst, res.t); sum += res.t; }
  }
  check('standing still in the turn of the barrels does not save one: wherever one stands, a barrel comes', bowled === stoodAt && worst < 60, `${stoodAt} times stood among them, on both stretches: bowled over every time — after ${(sum / Math.max(1, bowled)).toFixed(1)} s on average, ${worst.toFixed(1)} s at the longest`);
}
{
  // ---- the runner that plays by itself
  const runs = []; for (let k = 0; k < 12; k++) runs.push(botRun(k * 7.3));
  check('a runner that plays by itself reaches the bell at its first attempt, whenever it starts', runs.every((r) => r.over && r.attempts === 1 && r.time > fastest() && r.time < globalThis.SLOWEST * 1000 && r.time <= r.clock * 1000 + 1), `${runs.map((r) => (r.time / 1000).toFixed(1)).join(' · ')} s from the first step; ${Math.round(runs.reduce((a, r) => a + r.keys, 0) / runs.length)} keys pressed; the stick let go to wait ${runs.reduce((a, r) => a + r.stops, 0)} times in all`);
  const at = (dt) => { const st = startRun(3), input = { side: 0, run: 0, jump: false, down: false, crouch: false }; let acc = 0; for (let t = 0; t < 120 && !st.over; t += dt) { acc += dt; while (acc >= S.step && !st.over) { acc -= S.step; botInput(st, input); stepRun(st, S.step, input, null); } } return st.time; };
  check('the same run at 30 and at 144 frames a second', at(1 / 30) === at(1 / 144) && at(1 / 30) > 0);
  // ---- each turn worse than the last
  const count = turns.map((t) => t.things.reduce((n, x) => n + (x.kind === 'barrels' ? Math.ceil((x.s1 - x.s0) / (x.every * x.v)) : 1), 0));
  const kinds = turns.map((t) => [...new Set(t.things.map((x) => x.kind))]), seenKinds = new Set(), fresh = kinds.map((list) => { const novel = list.filter((k) => !seenKinds.has(k)); for (const k of list) seenKinds.add(k); return novel; });
  const firstAt = Math.min(...things.map((t) => t.s0));
  check('each turn has at least as much in the way as the one before, and the first five each bring something new', count.every((n, i) => i === 0 || n >= count[i - 1]) && count[5] > count[0] * 2 && fresh.slice(0, 5).every((f) => f.length > 0) && firstAt > 12,
    `${count.join(', ')} things (the barrels on the track at once counted); new: ${fresh.map((f, i) => `${i + 1}: ${f.join(' ') || '—'}`).join(' · ')}; nothing in the first ${firstAt} m`);
  // ---- its line for the boards of scores
  const late = startRun(0); Object.assign(late, { s: LENGTH - 0.05, going: true, clock: 3600 }); stepRun(late, 0.1, { run: 1 });
  check('its board: the time of the attempt that rings the bell, the lower the better — from the time nobody can beat to a quarter of an hour, the most that is counted',
    BOARD.order === 'asc' && BOARD.min === Math.floor(fastest() / 1000) * 1000 && BOARD.max === 900_000 && runs.every((r) => r.time >= BOARD.min && r.time <= BOARD.max) && late.over && late.time === BOARD.max,
    `${(fastest() / 1000).toFixed(1)} s at the least; an attempt of an hour is told as ${late.time / 1000} s`);
  console.log(`      for the board of scores: spiral: { order: '${BOARD.order}', min: ${BOARD.min}, max: ${BOARD.max} }`);
}
done();
