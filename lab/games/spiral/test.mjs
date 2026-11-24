// Checks of A Turn for the Worse, without a browser: the tower stands in the sea, clear of the cliffs, of the
// cleft and of the pier, and its gate on dry sand; the track is a slope one can run and leaves room under the
// turn above; the camera sees far enough past the tower; each thing in the way is got past by its move and ends
// the attempt without it; who does nothing is back at the foot within a second; what moves is the same for
// everybody and can be got past whatever the moment one arrives; a runner that plays by itself reaches the
// bell; each turn has more in the way than the last.
// usage: node lab/games/spiral/test.mjs
import { check, done, ground } from '../check.mjs';
import { BOUNDS, pierToWorld, PIER } from '../../../src/world/layout/layout.js';
import { CLEFT } from '../../../src/world/zones/games/crack/cleft.js';
import { SPIRAL, TURN, LENGTH, course, speedAt, trackY, spiralAt, sightAhead, fastest, floorAt, millAngle, stompAt, hammerAt, barrelAt, startRun, stepRun, botInput, botRun, heightOf } from './rules.js';

const S = SPIRAL, C = S.at, H = S.half, TAU = Math.PI * 2;
const height = await ground();
const { things, turns } = course();
const first = (kind, n = 0) => things.filter((t) => t.kind === kind)[n];
const inside = (x, z, poly) => { let hit = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[j][1] > z) !== (poly[i][1] > z) && x < ((poly[i][0] - poly[j][0]) * (z - poly[j][1])) / (poly[i][1] - poly[j][1]) + poly[j][0]) hit = !hit; return hit; };

/** A runner already going, at metre `s`, `u` across, the clock of the world at `t0`. */
const runner = (s, u = 0, t0 = 0) => { const st = startRun(t0); Object.assign(st, { wait: 0, s, u }); return st; };
/** Runs `st` to metre `to`, or to the end of the attempt; `drive(st, input)` presses the keys. Returns { out (why, '' when nothing stopped it), at, st, seen }. */
const go = (st, to, drive) => {
  const input = { side: 0, jump: false, down: false, crouch: false }, events = [], seen = [];
  for (let t = 0; t < 30 && st.s < to && !st.over; t += S.step) {
    input.jump = input.down = false;
    drive?.(st, input);
    stepRun(st, S.step, input, events);
    for (const e of events) seen.push(e);
    events.length = 0;
    const e = seen.find((q) => q.type === 'out');
    if (e) return { out: e.why, at: e.s, st, seen };
  }
  return { out: '', at: st.s, st, seen };
};
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
  const planks = things.filter((t) => t.kind === 'hole' && t.s0 > 5.5 * TURN && (t.u0 > -H || t.u1 < H) && t.s1 - t.s0 > 3), p = planks[0], mid = planks.find((t) => t.s0 === p.s0 && t !== p), c = (Math.max(p.u0, mid.u0) + Math.min(p.u1, mid.u1)) / 2 || (p.u1 + mid.u0) / 2;
  const edge = [p, mid].map((t) => (t.u0 > -H ? t.u0 : t.u1)).sort((x, y) => x - y), centre = (edge[0] + edge[1]) / 2;
  const onIt = go(runner(p.s0 + 0.5, centre), p.s1 - 0.5), offIt = go(runner(p.s0 + 0.5, centre - 1.4), p.s1 - 0.5);
  check('the planks before the bell: on one, one runs; beside it, there is nothing', !onIt.out && offIt.out === 'hole' && Number.isFinite(floorAt(p.s0 + 1, centre)) && floorAt(p.s0 + 1, centre - 1.4) === -Infinity, `${(edge[1] - edge[0]).toFixed(1)} m wide`);
  void c;
  // (down in the air: a dive; the stick held: one lands sliding)
  const bare = before(high.s, 5.4), far = go(runner(bare), bare + 4.8, press(['jump', bare + 0.5, 0])), short = go(runner(bare), bare + 4.8, press(['jump', bare + 0.5, 0], ['down', bare + 1.6, 0]));
  const landAt = (r) => { let s = 0; const q = runner(bare); go(q, bare + 4.8, (st, input) => { r(st, input); if (!s && st.jumps === 0 && !st.air && st.s > bare + 1) s = st.s; }); return s; };
  const plain = landAt(press(['jump', bare + 0.5, 0])), dived = landAt(press(['jump', bare + 0.5, 0], ['down', bare + 1.6, 0])); let slidOnLanding = false;
  go(runner(bare), bare + 4.8, (st, input) => { if (st.s >= bare + 0.5 && st.s < bare + 0.6 && !st.air) input.jump = true; input.crouch = st.s > bare + 1; if (st.slide > 0 && !st.air) slidOnLanding = true; });
  check('down in the air is a dive: one is on the planks sooner — and with the stick held, one lands sliding', !far.out && !short.out && short.seen.some((e) => e.type === 'dive') && dived > 0 && dived < plain - 0.8 && slidOnLanding, `a jump of ${(plain - bare - 0.5).toFixed(1)} m, cut to ${(dived - bare - 0.5).toFixed(1)} m`);
}
{
  // ---- who does nothing
  const st = startRun(0), input = { side: 0, jump: false, down: false, crouch: false }, events = [], seen = [];
  for (let t = 0; t < 40 && st.attempt < 4; t += S.step) { stepRun(st, S.step, input, events); for (const e of events) seen.push({ ...e, t }); events.length = 0; }
  const outs = seen.filter((e) => e.type === 'out'), foot = seen.filter((e) => e.type === 'foot'), goes = seen.filter((e) => e.type === 'go'), hole = first('hole');
  check('who does nothing goes down the first hole, and is at the foot again within a second, the clock at nought', outs.length === 3 && outs.every((e) => e.why === 'hole' && e.s > hole.s0 && e.s < hole.s1 + 0.5) && foot[0].t - outs[0].t < 1 && goes[1].t - outs[0].t < 1 && st.s === 0 && st.clock === 0 && st.attempt === 4,
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
      const st = runner(from, 0, 40 + (k * span * 3.1) / 30), input = { side: 0, jump: false, down: false, crouch: false }, events = [];
      let out = '';
      for (let t = 0; t < 12 && st.s < m.s1 + 0.8 && !out; t += S.step) { botInput(st, input); stepRun(st, S.step, input, events); out = events.find((e) => e.type === 'out')?.why || ''; }
      met++;
      if (out) stopped.push(`${m.kind} at ${m.s0.toFixed(0)} m (${out})`);
    }
  }
  check('each thing that moves is got past whatever the moment one comes to it', stopped.length === 0, stopped.length ? stopped.slice(0, 4).join(', ') : `${mills.length} mills, ${stomps.length} stompers, ${hammers.length} hammers, ${rolls.length} runs of barrels, thirty moments each: ${met} times past`);
}
{
  // ---- the runner that plays by itself
  const runs = []; for (let k = 0; k < 12; k++) runs.push(botRun(k * 7.3));
  check('a runner that plays by itself reaches the bell at its first attempt, whenever it starts', runs.every((r) => r.over && r.attempts === 1 && r.time > fastest() && r.time < globalThis.SLOWEST * 1000), `${runs.map((r) => (r.time / 1000).toFixed(1)).join(' · ')} s; ${Math.round(runs.reduce((a, r) => a + r.keys, 0) / runs.length)} keys pressed`);
  const at = (dt) => { const st = startRun(3), input = { side: 0, jump: false, down: false, crouch: false }; let acc = 0; for (let t = 0; t < 120 && !st.over; t += dt) { acc += dt; while (acc >= S.step && !st.over) { acc -= S.step; botInput(st, input); stepRun(st, S.step, input, null); } } return st.time; };
  check('the same run at 30 and at 144 frames a second', at(1 / 30) === at(1 / 144) && at(1 / 30) > 0);
  // ---- each turn worse than the last
  const count = turns.map((t) => t.things.reduce((n, x) => n + (x.kind === 'barrels' ? Math.ceil((x.s1 - x.s0) / (x.every * x.v)) : 1), 0));
  const kinds = turns.map((t) => [...new Set(t.things.map((x) => x.kind))]), seenKinds = new Set(), fresh = kinds.map((list) => { const novel = list.filter((k) => !seenKinds.has(k)); for (const k of list) seenKinds.add(k); return novel; });
  const firstAt = Math.min(...things.map((t) => t.s0));
  check('each turn has at least as much in the way as the one before, and the first five each bring something new', count.every((n, i) => i === 0 || n >= count[i - 1]) && count[5] > count[0] * 2 && fresh.slice(0, 5).every((f) => f.length > 0) && firstAt > 12,
    `${count.join(', ')} things (the barrels on the track at once counted); new: ${fresh.map((f, i) => `${i + 1}: ${f.join(' ') || '—'}`).join(' · ')}; nothing in the first ${firstAt} m`);
  console.log(`      for the board of scores: spiral: { order: 'asc', min: ${Math.floor(fastest() / 1000) * 1000}, max: ${Math.ceil(globalThis.SLOWEST) * 1000} }`);
}
done();
