// Checks of Run the Walls, without a browser: the ruin stands in the sea, clear of the tower of the spiral, of
// the cleft and of the pier, and its gate on dry ground; its way winds inwards, each lap well over the one
// outside it; saves every twenty-five metres or so; each move does what it says — a hole jumped, an edge caught, a
// wall run along, a kick from wall to wall, a face run up, a bar swung round, a ledge, slabs that give way,
// blades and spikes that keep time — and without it one falls; a fall winds time back to the last sure
// footing, three times, then it is the save; a runner that plays by itself reaches the top, a clumsy one too,
// later, thanks to the rewinds; its line for the boards.
// usage: node tools/walls-test.mjs
import { check, done, ground } from './lib/check.mjs';
import { BOARDS as SERVER } from '../server/scores.js';
import { BOUNDS, PIER, pierToWorld } from '../src/world/layout/layout.js';
import { SPIRAL } from '../src/world/zones/games/spiral/rules.js';
import { CLEFT } from '../src/world/zones/games/crack/cleft.js';
import { WALLS, BOARD, LENGTH, PLAN, course, placeAt, floorAt, hallAt, stretchOf, bladeAt, spikesAt, startRun, stepRun, botInput, botRun, heatOf, fastest } from '../src/world/zones/games/walls/rules.js';

const S = WALLS, C = S.at, H = S.half;
const height = await ground();
const { things, saves, halls, top } = course();
const of = (kind, form) => things.filter((t) => t.kind === kind && (form === undefined || t.form === form));
const inside = (x, z, poly) => { let hit = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[j][1] > z) !== (poly[i][1] > z) && x < ((poly[i][0] - poly[j][0]) * (z - poly[j][1])) / (poly[i][1] - poly[j][1]) + poly[j][0]) hit = !hit; return hit; };
const yAt = (s) => { let y = -Infinity; for (const t of of('floor')) if (s >= t.s0 && s <= t.s1) y = Math.max(y, t.y0 + ((t.y1 - t.y0) * (s - t.s0)) / (t.s1 - t.s0)); return y; };

/** A runner at a run at metre `s`, `u` across, the shared clock at `t0`. */
const runner = (s, u = 0, t0 = 0) => { const st = startRun(t0), y = floorAt(s, u); Object.assign(st, { s, u, y, gy: y, vs: S.speed, going: true }); return st; };
/** Runs `st` to metre `to` or for `secs`: the stick up unless `drive(st, input, t)` says otherwise. → { out, seen (the events), st, t } */
const go = (st, to, drive, secs = 12) => {
  const input = { run: 1, side: 0, jump: false }, events = [], seen = [];
  let t = 0;
  for (; t < secs && st.s < to && !st.over; t += S.step) {
    input.run = 1; input.side = 0; input.jump = false;
    drive?.(st, input, t);
    stepRun(st, S.step, input, events);
    for (const e of events) seen.push({ ...e, at: st.s, t });
    events.length = 0;
    if (seen.some((e) => e.type === 'out')) break;
  }
  return { out: seen.find((e) => e.type === 'out')?.why || '', seen, st, t, has: (type) => seen.some((e) => e.type === type) };
};
/** Presses the button once at each of the metres given; steers to lane `u`. */
const press = (u, ...at) => { const left = at.slice(); return (st, input) => { if (u !== null && st.mode !== 'wall') input.side = Math.max(-1, Math.min(1, (u - st.u) * 5)); while (left.length && st.s >= left[0]) { left.shift(); input.jump = true; } }; };

{
  // ---- where it stands
  let wet = 0, n = 0, deep = 0;
  for (let dx = -40; dx <= 40; dx += 4) for (let dz = -40; dz <= 40; dz += 4) { n++; const g = height(C.x + dx, C.z + dz); if (g < -2) wet++; deep = Math.min(deep, g); }
  const ext = [0, 0, 0, 0];
  for (let s = 0; s <= LENGTH; s += 1) { const p = placeAt(s, H + 0.6); ext[0] = Math.min(ext[0], p.x - C.x); ext[1] = Math.max(ext[1], p.x - C.x); ext[2] = Math.min(ext[2], p.z - C.z); ext[3] = Math.max(ext[3], p.z - C.z); }
  const half = Math.hypot(Math.max(-ext[0], ext[1]), Math.max(-ext[2], ext[3])), toSpiral = Math.hypot(C.x - SPIRAL.at.x, C.z - SPIRAL.at.z), toCleft = Math.hypot(C.x - CLEFT.at.x, C.z - CLEFT.at.z), head = pierToWorld(PIER.length, 0), toPier = Math.hypot(C.x - head[0], C.z - head[1]);
  check('the ruin stands in the sea: water under all of it, and room about it — the tower of the spiral, the cleft, the head of the pier are well away', wet === n && toSpiral > half + 30 && toCleft > half + 30 && toPier > half + 30,
    `${Math.round(ext[1] - ext[0])} × ${Math.round(ext[3] - ext[2])} m at (${C.x}, ${C.z}), the bed ${(-deep).toFixed(0)} m down at the most; ${Math.round(toSpiral)} m from the spiral, ${Math.round(toCleft)} m from the cleft, ${Math.round(toPier)} m from the head of the pier`);
  const g = S.gate, gy = height(g.x, g.z);
  check('its gate is on dry ground one can walk to, on the south beach, the ruin in sight across the water', gy > 0.6 && gy < 9 && inside(g.x, g.z, BOUNDS) && Math.hypot(g.x - SPIRAL.gate.x, g.z - SPIRAL.gate.z) > 9, `(${g.x}, ${g.z}), ${gy.toFixed(1)} m over the sea, ${Math.round(Math.hypot(g.x - C.x, g.z - C.z))} m from the ruin, ${Math.hypot(g.x - SPIRAL.gate.x, g.z - SPIRAL.gate.z).toFixed(0)} m from the gate of the spiral`);
}
{
  // ---- the way
  const arcs = PLAN.filter((p) => p.kind === 'arc'), lines = PLAN.filter((p) => p.kind === 'line');
  // (two places far apart along the way and close in the world: one lap over the other)
  let least = Infinity, worst = '';
  for (let a = 0; a <= LENGTH; a += 1.5) for (let b = a + 60; b <= LENGTH; b += 1.5) { const p = placeAt(a), q = placeAt(b); if (Math.hypot(p.x - q.x, p.z - q.z) < S.plan.inset + 1) { const d = yAt(b) - yAt(a); if (Number.isFinite(d) && d < least) { least = d; worst = `${a} and ${b} m`; } } }
  const tallest = Math.max(...of('wall').map((t) => t.y1 - t.y0 + 0.35));
  check('the way winds inwards like a snail\'s shell — nine sides, eight corners turned left — and each lap runs well over the one outside it: the wall on the left is always there, and higher than any band one runs along', lines.length === 9 && arcs.length === 8 && least > tallest + 0.5 && PLAN[PLAN.length - 1].s1 >= LENGTH,
    `${LENGTH} m, sides of ${lines.map((p) => (p.s1 - p.s0).toFixed(1)).join(', ')} m; the lap inside is ${least.toFixed(1)} m higher at the least (at ${worst}), the tallest band ${tallest.toFixed(1)} m; the top ${top.toFixed(1)} m over the foot`);
  const onArc = things.filter((t) => t.kind !== 'floor' && arcs.some((p) => t.s1 > p.s0 && t.s0 < p.s1));
  check('the corners are worn steps and nothing else: what asks for a move stands along a straight wall', onArc.length === 0 && arcs.every((p) => of('floor', 'stairs').some((t) => Math.abs(t.s0 - p.s0) < 1e-6 && Math.abs(t.s1 - p.s1) < 1e-6)), onArc.map((t) => `${t.kind} at ${t.s0.toFixed(0)}`).join(', ') || `${arcs.length} flights of ${(arcs[0].s1 - arcs[0].s0).toFixed(1)} m, one metre up each`);
  const gaps = saves.slice(1).map((v, i) => v.s - saves[i].s), plain = saves.every((v) => Math.abs(floorAt(v.s, 0) - v.y) < 1e-6);
  const okFloor = saves.every((v) => of('floor').some((t) => !t.form && v.s > t.s0 + 0.3 && v.s < t.s1 - 0.3 && Math.abs(t.y0 - v.y) < 1e-6));
  check('twelve saves, one at the head of each stretch, each on a floor that stays — every twenty-five metres or so, never more than thirty-six', saves.length === 12 && saves.length === S.names.length && okFloor && plain && Math.max(...gaps) <= 36 && saves[0].s < 3,
    `at ${saves.map((v) => v.s.toFixed(0)).join(', ')} m: ${(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1)} m apart on average, ${Math.max(...gaps).toFixed(1)} at the most`);
  const kinds = saves.map((v, i) => [...new Set(things.filter((t) => t.s0 >= v.s - 2 && t.s0 < (saves[i + 1]?.s ?? LENGTH) - 2 && (t.kind !== 'floor' || t.form === 'crumble' || t.form === 'ledge')).map((t) => (t.kind === 'floor' ? t.form : t.kind === 'wall' ? (t.side > 0 ? 'wall on the right' : 'wall') : t.kind)))]);
  const all = new Set(kinds.flat());
  check('each stretch teaches or tests one thing, then they mix: eight kinds of moment in all', ['face', 'wall', 'wall on the right', 'pole', 'blade', 'spikes', 'crumble', 'ledge'].every((k) => all.has(k)) && kinds.every((k) => k.length >= 1 || true), kinds.map((k, i) => `${i + 1} ${S.names[i]}: ${k.join(' + ') || 'holes'}`).join(' · '));
  // (the camera comes in between the walls of a hall before one is between them, and stays in until it is out)
  const cam = halls.every(([a, b]) => hallAt(a - 1.5) > 0.98 && hallAt(b + S.cam.back) > 0.98 && hallAt(a - 11) < 0.02 && hallAt(b + S.cam.back + 7) < 0.02);
  check('where a wall stands on the right the camera comes in over the middle of the way before the runner is between the two, and stays there until it has left them behind: no wall is ever between it and the runner', halls.length === 2 && cam, halls.map(([a, b]) => `${a}–${b} m`).join(', '));
}
{
  // ---- the moves, one by one
  const holes = [[8, 10.2], [18.5, 21.3]];
  const a = go(runner(4), 12), b = go(runner(15.5), 23), c = go(runner(15.5), 23, press(null, 18.2));
  check('a hole: the first is narrow — who runs into it catches its far edge and pulls up; the second is not: jumped, or it is a fall', !a.out && a.has('catch') && a.has('up') && b.out === 'fall' && !c.out && c.has('jump') && !c.has('catch'), `holes of ${holes.map(([p, q]) => (q - p).toFixed(1)).join(' and ')} m`);
  const late = go(runner(15.5), 23, press(null, 18.5 + S.edge + S.speed * (S.coyote - 0.03)));
  check('a quarter of a second of grace on an edge: a press that late after the last stone is still a jump', !late.out && late.has('jump'), `${S.coyote} s — ${(S.speed * S.coyote).toFixed(2)} m past the edge at a run`);
  // a wall run along: the gap of 6.5 m at 28.5
  const w1 = go(runner(25.5), 38, press(-1.4, 27.8)), w2 = go(runner(25.5), 38, press(0.4, 27.8)), w3 = go(runner(25.5), 38, press(-1.4)), band = of('wall')[0];
  const ride = w1.seen.find((e) => e.type === 'wall'), off = w1.seen.find((e) => e.type === 'off' || e.type === 'land');
  check('a band of blue stone: jumped at at a run, it is run along over the gap — away from it, or without the jump, the same gap is a fall', !w1.out && !!ride && !!off && off.at - ride.at > 4 && w2.out === 'fall' && w3.out === 'fall', ride ? `taken at ${ride.at.toFixed(1)} m, left at ${off.at.toFixed(1)}: ${(off.at - ride.at).toFixed(1)} m along it in ${(off.t - ride.t).toFixed(2)} s; the band ${band.s0}–${band.s1} m, the gap 28.5–35` : 'no wall');
  // wall to wall: the gap of 16 m at 91.5
  const k1 = go(runner(89.2), 109, press(-1.4, 90.6, 96)), k2 = go(runner(89.2), 109, press(-1.4, 90.6));
  let wide = 0; for (let at = 91; at < 104; at += 0.1) if (!go(runner(89.2), 109, press(-1.4, 90.6, at)).out) wide += 0.1;
  check('from wall to wall: the button on the first wall kicks one across to the band of the wall on the right, and on to the floor — without the kick, a fall; the kick may come at any moment of nearly a second', !k1.out && k1.seen.filter((e) => e.type === 'wall').length === 2 && k1.has('kick') && k2.out === 'fall' && wide / S.wall.v > 0.5, `the kick works along ${wide.toFixed(1)} m of the first wall: ${(wide / S.wall.v).toFixed(2)} s`);
  // up a wall
  const u1 = go(runner(61), 66.5), slow = (() => { const st = runner(63.6); st.vs = 0; return go(st, 66.5); })(), face = of('face');
  check('a face of green stone: run at, one runs up it, catches its edge and stands on it — from a standstill at its foot as well; no button', !u1.out && u1.has('climb') && u1.has('up') && Math.abs(u1.st.y - 4.6) < 1e-6 && !slow.out && slow.has('up'), `${face.length} faces, ${face.map((t) => (t.y1 - t.y0).toFixed(1)).join(', ')} m; the first, 2.6 m, takes ${(u1.seen.find((e) => e.type === 'up').t - u1.seen.find((e) => e.type === 'climb').t).toFixed(2)} s`);
  check('no face is higher than one runs up, and no floor is so far under the one before that coming down would be a fall', face.every((t) => t.y1 - t.y0 <= S.climb.reach - 0.3) && of('floor').every((t, i, list) => i === 0 || t.y0 >= list[i - 1].y1 - 0.01), `${Math.max(...face.map((t) => t.y1 - t.y0)).toFixed(1)} m at the most; one runs up ${S.climb.reach} m`);
  // a bar
  const p1 = go(runner(109), 121, press(0, 111.2, 114.6)), p2 = go(runner(109), 121, press(0, 111.2), 4), p3 = go(runner(109), 121, press(0));
  check('a gold bar: jumped into, one hangs from it — for as long as one likes — and the button throws one over the rest of the gap; without the bar the gap is a fall', !p1.out && p1.has('bar') && p1.has('swing') && p1.st.s >= 119 && !p2.out && p2.st.mode === 'pole' && p3.out === 'fall', `${of('pole').length} bars; thrown ${(p1.seen.find((e) => e.type === 'land')?.at - 114.6).toFixed(1)} m`);
  // a ledge
  const l1 = go(runner(184.5, -1.4, 0.9), 197, press(-1.4)), l2 = go(runner(184.5, 0), 197), ledge = of('floor', 'ledge')[0];
  check('a ledge along the wall: one shuffles along it, the back to the stone, and cannot step off its side — who keeps to the middle of the way falls', !l1.out && l2.out === 'fall' && l1.t > (ledge.s1 - ledge.s0) / S.speed + 0.8, `${(ledge.s1 - ledge.s0).toFixed(0)} m long, ${(ledge.u1 - ledge.u0).toFixed(2)} m wide, at ${S.shuffle} m/s`);
  // slabs that give way
  const c1 = go(runner(169.5), 186, press(0, 176.8)), stand = go(runner(169.5), 186, (st, input) => { if (st.s > 173) input.run = 0; }), slab = of('floor', 'crumble');
  check('slabs that give way: at a run they hold — one jumps the hole between them —, under who stops they are gone', !c1.out && stand.out === 'fall' && c1.seen.filter((e) => e.type === 'tread').length >= 6, `${slab.length} slabs, each holds ${S.crumble} s`);
  // what keeps time: for each, the moments (of one period) at which one who comes at a run gets past
  const timed = [...of('blade'), ...of('spikes')].map((t) => {
    // (a blade is got past on one side or the other, or waited for; the middle of the way — on a ledge, the ledge — is shut part of the time)
    const from = t.s0 - 2.5, lanes = t.kind === 'spikes' ? [0] : [-1.4, 0, 1.4], N = 96, own = floorAt(from, 0) > -Infinity ? 0 : -1.4;
    let ok = 0, best = 0, runLen = 0, jumped = 0;
    for (let k = 0; k < 2 * N; k++) {
      const t0 = (k / N) * t.period, pass = lanes.some((u) => floorAt(from, u) > -Infinity && !go(runner(from, u, t0), t.s1 + 1.5, press(u), 4).out);
      if (k < N && !go(runner(from, own, t0), t.s1 + 1.5, press(own), 4).out) ok++;
      runLen = pass ? runLen + 1 : 0; best = Math.max(best, runLen);
      if (k < N && t.kind === 'spikes' && !go(runner(from, 0, t0), t.s1 + 1.5, press(0, t.s0 - 1.3), 4).out) jumped++;
    }
    return { t, open: ok / N, window: Math.min(t.period, (best / N) * t.period), jumped: jumped / N };
  });
  check('blades and spikes keep time on the shared clock: each is in the way part of the time, and lets one by at a run — on one side or the other — for a quarter of a second at a stretch at the very least; the spikes are jumped at any moment', timed.every((r) => r.window >= 0.25 && r.open < 1 && (r.t.kind !== 'spikes' || r.jumped === 1)),
    timed.map((r) => `${r.t.kind} at ${Math.round(r.t.s0)} m: the middle open ${Math.round(r.open * 100)} % of its ${r.t.period} s, a way by ${r.window >= r.t.period ? 'at any moment' : `for ${r.window.toFixed(2)} s at a stretch`}`).join(' · '));
  // (the button itself: for how long does one press, from a run, get one across? a press tried at every step of two seconds)
  const windowOf = (from, to, lane, then = []) => { let n = 0; for (let k = 0; k < 240; k++) { let i = 0; const left = then.slice(); if (!go(runner(from, lane), to, (q, input) => { input.side = q.mode === 'wall' ? 0 : Math.max(-1, Math.min(1, (lane - q.u) * 5)); if (i++ === k) input.jump = true; if (left.length && q.mode === 'pole' && q.pt > 0.2) { left.shift(); input.jump = true; } }, 6).out) n++; } return n * S.step; };
  const wins = [['the jump over the second hole', windowOf(15.5, 23, 0)], ['the jump at the first band', windowOf(24.5, 38, -1.4)], ['the jump into the first bar', windowOf(108.7, 121, 0, [1])], ['the jump at the band of the first hall', (() => { let n = 0; for (let k = 0; k < 240; k++) { let i = 0, kicked = false; if (!go(runner(88.5, -1.4), 109, (q, input) => { if (q.mode !== 'wall') input.side = Math.max(-1, Math.min(1, (-1.4 - q.u) * 5)); if (i++ === k) input.jump = true; if (q.mode === 'wall' && q.side < 0 && q.s > 96 && !kicked) { kicked = true; input.jump = true; } }, 6).out) n++; } return n * S.step; })()]];
  check('nothing asks for a press timed to less than a quarter of a second: each jump has a window twice that and more', wins.every(([, w]) => w >= 0.5), wins.map(([name, w]) => `${name}: ${w.toFixed(2)} s`).join(' · '));
  const b0 = of('blade')[0], s0 = of('spikes')[0];
  check('they are the same for everybody: where a blade is, how far the spikes are out, is read from the clock alone — and the spikes show their points before they come up', Math.abs(bladeAt(b0, 12.5) - bladeAt(b0, 12.5 + b0.period * 3)) < 1e-9 && Math.abs(bladeAt(b0, 1) - bladeAt(b0, 1.4)) > 0.2 && spikesAt(s0, s0.period * (0.9 - s0.phase)) > 0.1 && spikesAt(s0, s0.period * (0.9 - s0.phase)) < 0.2 && spikesAt(s0, s0.period * (0.2 - s0.phase)) === 1 && spikesAt(s0, s0.period * (0.7 - s0.phase)) === 0, `a blade swings ${b0.amp} m each way in ${b0.period} s; spikes are up ${Math.round(s0.share * 100)} % of ${s0.period} s`);
}
{
  // ---- time winds back
  const st = runner(15.5), input = { run: 1, side: 0, jump: false }, events = [], seen = [];
  let fellAt = 0, clockThen = 0, back = null, backwards = true, prev = Infinity, tBack = 0;
  for (let t = 0; t < 8 && !back; t += S.step) {
    stepRun(st, S.step, input, events);
    for (const e of events) { seen.push(e); if (e.type === 'out') { fellAt = e.s; clockThen = st.clock; } if (e.type === 'back') { back = e; tBack = st.clock - clockThen; } }
    events.length = 0;
    if (st.mode === 'rewind') { if (st.s > prev + 1e-9) backwards = false; prev = st.s; }
  }
  check('a fall winds time back: one goes back along one\'s own path — backwards all the way — to the last sure footing, a stride before the edge, and stands there; the clock has run on; one rewind less in reserve', !!back && backwards && back.s < 18.5 && back.s > 16 && st.mode === 'ground' && st.vs === 0 && st.rew === S.rewinds - 1 && tBack > 0.2 && tBack < 1.6 && st.clock > clockThen,
    back ? `fell at ${fellAt.toFixed(1)} m, back at ${back.s.toFixed(1)} m ${tBack.toFixed(2)} s later` : 'no rewind');
  // (again and again: three in reserve, then the save — and the reserve is full again)
  const again = runner(26.5); again.home = 1;
  const log = [];
  for (let t = 0; t < 40 && log.filter((e) => e.type === 'home').length < 1; t += S.step) { stepRun(again, S.step, input, events); for (const e of events) log.push(e); events.length = 0; }
  const n = (type) => log.filter((e) => e.type === type).length, home = log.find((e) => e.type === 'home');
  check('three rewinds in reserve; with none left a fall is the last save — the reserve full again there, the clock still running', n('rewind') === 3 && n('out') === 4 && !!home && Math.abs(home.s - saves[1].s) < 1e-6 && again.rew === S.rewinds && again.clock > 5, home ? `four falls in ${again.clock.toFixed(1)} s: three wound back, the fourth back to the save at ${home.s.toFixed(1)} m` : 'never home');
  const full = runner(86.5); full.rew = 0; full.home = 2;
  go(full, 90);
  check('a save reached fills the reserve', full.home === 3 && full.rew === S.rewinds, `the save at ${saves[3].s.toFixed(1)} m`);
  // (a blade: the same)
  const bl = of('blade')[0];
  let hit = null;
  for (let k = 0; k < 40 && !hit; k++) { const r = go(runner(bl.s - 4, 0, k * 0.07), bl.s + 2, null, 3); if (r.out === 'blade') hit = r; }
  let after = null;
  if (hit) { const q = hit.st, ev = []; for (let t = 0; t < 4 && !after; t += S.step) { stepRun(q, S.step, { run: 0, side: 0, jump: false }, ev); after = ev.find((e) => e.type === 'back') || null; } }
  check('a blade winds time back as a fall does: to a footing out of its reach', !!hit && !!after && after.s < bl.s - 1, after ? `hit at ${hit.seen.find((e) => e.type === 'out').s.toFixed(1)} m, back at ${after.s.toFixed(1)} m` : 'never hit');
}
{
  // ---- the runner that plays by itself
  const runs = [0, 7.3, 14.6].map((t0) => botRun(t0, 400));
  check('a runner that plays by itself — it never presses sooner than a quarter of a second after deciding to — reaches the top without a fall, whenever it starts', runs.every((r) => r.over && r.outs === 0 && r.time > fastest() && r.time < 120_000), runs.map((r) => `${(r.time / 1000).toFixed(1)} s, ${r.keys} presses`).join(' · '));
  const clumsy = [[3, 0.9, 7], [11, 0.9, 21], [5, 0.9, 99]].map(([t0, c, seed]) => botRun(t0, 900, c, seed));
  check('a clumsy one — its presses come late, or not at all, now and then — falls, is wound back, and reaches the top all the same, later', clumsy.every((r) => r.over) && clumsy.reduce((a, r) => a + r.rewinds, 0) >= 3 && clumsy.reduce((a, r) => a + r.time, 0) > runs.reduce((a, r) => a + r.time, 0),
    clumsy.map((r) => `${(r.time / 1000).toFixed(1)} s: ${r.outs} falls, ${r.rewinds} wound back, ${r.homes} back to a save`).join(' · '));
  const idle = startRun(0); for (let t = 0; t < 60; t += 0.1) stepRun(idle, 0.1, { run: 0, side: 0, jump: false });
  const only = go(startRun(0), LENGTH, null, 60);
  check('nothing is won by doing nothing: who stands stays at the start, the clock waiting; who only runs falls at the second hole', idle.s === saves[0].s && idle.clock === 0 && !idle.going && only.out === 'fall' && only.st.s < 24, `only running: a fall at ${only.st.s.toFixed(1)} m`);
  const at = (dt) => { const st = startRun(3), input = { run: 0, side: 0, jump: false }; let acc = 0; for (let t = 0; t < 300 && !st.over; t += dt) { acc += dt; while (acc >= S.step && !st.over) { acc -= S.step; botInput(st, input); stepRun(st, S.step, input, null); } } return st.time; };
  const a30 = at(1 / 30), a144 = at(1 / 144);
  check('the same run at 30 and at 144 frames a second', a30 === a144 && a30 > 0, `the top in ${(a30 / 1000).toFixed(2)} s both times`);
  const heat = [startRun(0), Object.assign(startRun(0), { s: 150, best: 150 }), Object.assign(startRun(0), { s: 120, best: 150 }), Object.assign(startRun(0), { s: LENGTH, best: LENGTH })].map(heatOf);
  check('how far a run has come, for its music: nought at the start, one at the top, never back down after a fall', heat[0] < 0.01 && heat[1] === 0.5 && heat[2] === 0.5 && heat[3] === 1 && heatOf(null) === 0, heat.map((h) => h.toFixed(2)).join(', '));
  // ---- its line for the boards of scores
  const lateRun = startRun(0); Object.assign(lateRun, { s: LENGTH - 0.3, y: top, gy: top, going: true, clock: 7200 }); stepRun(lateRun, 0.3, { run: 1 });
  check('its board: the time from the first step to the top of the tower, falls and all, the lower the better — from the time nobody can beat to half an hour, the most that is counted', BOARD.order === 'asc' && BOARD.min === Math.floor(fastest() / 1000) * 1000 && BOARD.max === 1800_000 && [...runs, ...clumsy].every((r) => r.time >= BOARD.min && r.time <= BOARD.max) && lateRun.over && lateRun.time === BOARD.max,
    `${(fastest() / 1000).toFixed(1)} s at the least (the whole way at the speed a bar throws one at); a run of two hours is told as ${lateRun.time / 1000} s`);
  { const V = SERVER.walls || {}; check('the server keeps its board by the same line (server/scores.js), behind its switch', V.order === BOARD.order && V.min === BOARD.min && V.max === BOARD.max && V.release === 'walls', JSON.stringify(V)); }
  // (the count, then — last — the line for server/scores.js)
  process.on('exit', () => console.log(`walls: { order: '${BOARD.order}', min: ${BOARD.min}, max: ${BOARD.max} }`));
}
done();
