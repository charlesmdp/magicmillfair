// Checks of The Bee's Knees, without a browser: the combs hang over the sea, clear of the pier, of the island, of
// the beach lounge and of the sand bar of the waves, and the arch is on dry sand; a comb is round and whole and
// nobody leaves it sideways; a cell one touches drops after its time and not before, whoever is still on it, and
// does not come back; one falls from comb to comb and into the sea; a jump, a jump granted a moment late; the
// royal jelly throws one back up, once; the bees take the wax apart on paths drawn from the seed; a player that
// plays by itself holds a good while, the same run for the same seed and at any frame rate.
// usage: node tools/hive-test.mjs
import { check, done, ground } from './lib/check.mjs';
import { BOARDS as SERVER } from '../server/scores.js';
import { PIER, ISLAND, BEACH_LOUNGE, BOUNDS } from '../src/world/layout/layout.js';
import { slideCourse } from '../src/world/zones/games/slide/track.js';
import { HIVE, BOARD, BOUND, CELLS, KIND, NEAR, START, APOTHEM, PITCH, holds, cellAt, startRun, stepRun, gone, standing, droneAt, botInput, botRun, idleInput, hammerInput, runnerInput } from '../src/world/zones/games/hive/rules.js';

const H = HIVE, C = H.at, N = CELLS.length, RIM = H.radius + H.cell + 0.7, POLE = 12.6 + 0.6; // (the outside of the hoops; the foot of the crook, on the side the camera looks at)
const FX = Math.sin(H.view), FZ = Math.cos(H.view), RX = -FZ, RZ = FX;
/** The stick that pushes towards (dx, dz) of the world (the rules read it along the camera). */
const towards = (dx, dz, out) => { const l = Math.hypot(dx, dz) || 1; out.y = (dx * FX + dz * FZ) / l; out.x = (dx * RX + dz * RZ) / l; return out; };
/** Runs `st` for `secs` (or until `stop(st, seen)`); `drive(st, input, t)` pushes the stick. Returns the events, each with its second. */
const run = (st, secs, drive, stop) => {
  const input = { x: 0, y: 0, jump: false }, events = [], seen = [];
  for (let t = 0; t < secs && !st.over; t += H.step) { input.jump = false; drive?.(st, input, t); stepRun(st, H.step, input, events); for (const e of events) seen.push({ ...e, at: st.clock }); events.length = 0; if (stop?.(st, seen)) break; }
  return seen;
};
/** A run begun standing on cell `i` of comb `c`. */
const standOn = (c, i, seed = 1) => { const st = startRun(seed); Object.assign(st, { x: CELLS[i].x, z: CELLS[i].z, y: H.levels[c], on: c, cell: i }); return st; };
const fmt = (ms) => `${(ms / 1000).toFixed(1)} s`;
/** A cell of plain wax of comb `c`, next to the middle; and a plain one next to it. */
const plain = (c) => NEAR[START].find((i) => KIND[c][i] === 0), beside = (c, i) => NEAR[i].find((j) => j !== START && KIND[c][j] === 0);

const height = await ground();
{
  // ---- where it stands
  let shallow = -99, deep = 0;
  for (let k = 0; k < 36; k++) for (const r of [0, 4, 8, RIM]) { const a = (k / 36) * Math.PI * 2, h = height(C.x + Math.sin(a) * r, C.z + Math.cos(a) * r); shallow = Math.max(shallow, h); deep = Math.min(deep, h); }
  const foot = height(C.x + FX * POLE, C.z + FZ * POLE);
  check('the combs hang over the sea: water under all of them, and round the foot of the crook', shallow < -1 && foot < -1 && H.levels.at(-1) > 5, `the bed of the sea ${(-shallow).toFixed(1)} to ${(-deep).toFixed(1)} m down, ${(-foot).toFixed(1)} m at the foot of the crook; the lowest comb ${H.levels.at(-1)} m over the water`);
  // the pier, in its own frame: metres along it from its root, and to its side
  const ph = PIER.heading, dx = C.x - PIER.rootX, dz = C.z - PIER.rootZ, along = dx * Math.cos(ph) + dz * Math.sin(ph), side = -dx * Math.sin(ph) + dz * Math.cos(ph);
  const box = (a0, a1, half) => Math.hypot(Math.max(a0 - along, 0, along - a1), Math.max(Math.abs(side) - half, 0));
  const pier = Math.min(box(0, PIER.length, PIER.width / 2), box(PIER.length - PIER.headLength, PIER.length, PIER.headWidth / 2)) - POLE;
  const island = Math.hypot(C.x - ISLAND.x, C.z - ISLAND.z) - POLE - 36; // (its rock begins about 36 m from its middle)
  const lounge = Math.hypot(C.x + FX * POLE - BEACH_LOUNGE.x, C.z + FZ * POLE - BEACH_LOUNGE.z) - BEACH_LOUNGE.r;
  const P = slideCourse().main.points, end = P[P.length - 1], slide = Math.hypot(C.x - end.x, C.z - end.z) - RIM;
  check('clear of the pier, of the island, of the beach lounge and of where the slide throws its riders', pier > 20 && island > 8 && lounge > 8 && slide > 15, `${pier.toFixed(0)} m from the pier, ${island.toFixed(0)} m from the rock of the island, ${lounge.toFixed(0)} m from the lounge, ${slide.toFixed(0)} m from the end of the slide`);
  check('and north of the sand bar of the waves (which keeps south of z = -70 out there)', C.z + RIM < -73 && H.gate.z < -72, `its southern edge at z = ${(C.z + RIM).toFixed(1)}`);
  // the arch: on dry sand that can be walked, level, with room round it
  const g = H.gate, hg = height(g.x, g.z), tilt = Math.max(...[[1.7, 0], [-1.7, 0], [0, 1.7], [0, -1.7]].map(([ax, az]) => Math.abs(height(g.x + ax, g.z + az) - hg)));
  let inside = false; for (let i = 0, j = BOUNDS.length - 1; i < BOUNDS.length; j = i++) if ((BOUNDS[j][1] > g.z) !== (BOUNDS[i][1] > g.z) && g.x < ((BOUNDS[i][0] - BOUNDS[j][0]) * (g.z - BOUNDS[j][1])) / (BOUNDS[i][1] - BOUNDS[j][1]) + BOUNDS[j][0]) inside = !inside;
  const looks = Math.atan2(C.x - g.x, C.z - g.z), room = Math.hypot(g.x - BEACH_LOUNGE.x, g.z - BEACH_LOUNGE.z) - BEACH_LOUNGE.r;
  check('the arch is on dry sand of the beach, where one can walk, and looks at the combs', hg > 0.4 && hg < 2 && tilt < 0.6 && inside && room > 2.5 && Math.abs(looks - g.yaw) < 0.1, `${hg.toFixed(2)} m over the sea, ${room.toFixed(1)} m from the beanbags of the lounge`);
}
{
  // ---- the combs
  const count = (c, k) => KIND[c].filter((v) => v === k).length, caps = [0, 1, 2, 3].map((c) => count(c, 1) / N);
  check('four combs alike, round: every cell within reach of the middle, six neighbours unless on the rim', H.levels.length === 4 && N >= 50 && CELLS.every((c) => Math.hypot(c.x, c.z) <= H.radius + 1e-6) && NEAR.every((n, i) => n.length >= 3 && n.length <= 6 && n.every((j) => NEAR[j].includes(i) && Math.abs(Math.hypot(CELLS[i].x - CELLS[j].x, CELLS[i].z - CELLS[j].z) - PITCH) < 1e-9)), `${N} cells a comb, ${PITCH.toFixed(2)} m from one to the next`);
  let holes = 0, n = 0; for (let x = -H.radius; x <= H.radius; x += 0.17) for (let z = -H.radius; z <= H.radius; z += 0.17) { if (Math.hypot(x, z) > H.radius - H.cell) continue; n++; const i = cellAt(x, z); if (i < 0 || Math.max(Math.abs(x - CELLS[i].x), 0) > H.cell) holes++; }
  check('a comb is whole: no gap in it before one has run on it', holes === 0 && cellAt(H.radius + 3, 0) < 0, `${n} places tried`);
  const apart = [1, 2, 3].every((c) => { const j = CELLS.map((_, i) => i).filter((i) => KIND[c][i] === 2); return j.every((a) => j.every((b) => a === b || Math.hypot(CELLS[a].x - CELLS[b].x, CELLS[a].z - CELLS[b].z) > 5)); });
  check('capped cells on every comb, royal jelly on the three lower ones only, well apart; one begins on a capped cell', count(0, 2) === 0 && count(1, 2) === H.jelly && count(2, 2) === H.jelly && count(3, 2) === H.jelly && apart && caps.every((s) => s > 0.07 && s < 0.22) && KIND[0][START] === 1 && KIND[1][START] === 0 && KIND[2][START] === 0 && KIND[3][START] === 0, `${[0, 1, 2, 3].map((c) => `${count(c, 1)} capped${c ? `, ${count(c, 2)} of jelly` : ''}`).join(' · ')}`);
  // nobody leaves a comb sideways
  let out = 0, far = 0;
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, st = startRun(3); run(st, 4, (q, i) => { towards(Math.sin(a), Math.cos(a), i); i.jump = q.ground && Math.floor(q.clock * 3) % 2 === 0; if (cellAt(q.x, q.z) < 0) out++; far = Math.max(far, Math.hypot(q.x, q.z)); }); }
  check('nobody leaves a comb sideways: who runs at its edge is kept on its outer cells', out === 0 && far > H.radius && far < H.radius + H.cell, `${far.toFixed(2)} m from the middle at most`);
}
{
  // ---- a cell gives way: after its time, not before
  const fell = [];
  for (let c = 0; c < 4; c++) { const st = standOn(c, plain(c)), seen = run(st, 3, null, (q) => !q.ground); fell.push(seen.find((e) => e.type === 'fall')?.at ?? 0); }
  check('a cell one stands on drops after its time and not before: less on each comb down', fell.every((t, c) => t >= H.delay[c] && t < H.delay[c] + 2.5 * H.step), fell.map((t) => `${t.toFixed(3)} s`).join(' · '));
  const capped = KIND[0].findIndex((k) => k === 1), st = standOn(0, capped), seen = run(st, 3, null, (q) => !q.ground);
  check('a capped cell holds much longer', Math.abs(seen.find((e) => e.type === 'fall').at - H.capped) < 2.5 * H.step && holds(0, capped) === H.capped, `${seen.find((e) => e.type === 'fall').at.toFixed(3)} s`);
  // touched, then left: it drops all the same, and stays dropped; the next one drops in its turn
  const from = plain(0), next = beside(0, from), walk = standOn(0, from), when = [];
  run(walk, 2.2, (q, i) => { towards(CELLS[next].x - q.x, CELLS[next].z - q.z, i); if (Math.hypot(CELLS[next].x - q.x, CELLS[next].z - q.z) < 0.15) { i.x = 0; i.y = 0; } if (gone(q, 0, from) && !when[0]) when[0] = q.clock; if (gone(q, 0, next) && !when[1]) when[1] = q.clock; }, (q) => q.on !== 0 && q.ground);
  check('whether one is still on it or not: a cell touched and left drops at its time — and the one run on to, at its own', when[0] >= H.delay[0] && when[0] < H.delay[0] + 2.5 * H.step && when[1] > when[0] && when[1] < when[0] + 0.5 && walk.on === 1, `${when.map((t) => t.toFixed(2)).join(' s, then ')} s`);
  const long = botRun(5).state, back = []; for (let c = 0; c < 4; c++) for (let i = 0; i < N; i++) if (long.drop[c][i] < long.clock && !gone(long, c, i)) back.push(i);
  check('a cell that dropped does not come back', back.length === 0 && [0, 1, 2, 3].every((c) => standing(long, c) < N));
}
{
  // ---- from comb to comb, and into the sea
  const st = startRun(1), seen = run(st, 20, null), order = seen.filter((e) => e.type !== 'touch' && e.type !== 'bee').map((e) => `${e.type}${e.comb ?? ''}`).join(' ');
  check('who stands still falls from comb to comb and is in the sea within eight seconds', order === 'fall0 land1 fall1 land2 fall2 land3 fall3 sea' && st.over && st.time < 8000 && st.time === seen.at(-1).time, `${fmt(st.time)}: ${order}`);
  // a jump
  const up = standOn(0, KIND[0].findIndex((k) => k === 1)); let top = 0; const air = run(up, 2, (q, i, t) => { i.jump = t === 0; top = Math.max(top, q.y - H.levels[0]); }, (q, ev) => ev.some((e) => e.type === 'land')); // (off a capped cell: it is still there when one comes down)
  const flight = air.find((e) => e.type === 'land').at - air.find((e) => e.type === 'jump').at;
  check('a jump: a little over a metre, two thirds of a second', top > 1.1 && top < 1.35 && flight > 0.6 && flight < 0.72, `${top.toFixed(2)} m up, ${flight.toFixed(2)} s`);
  const off = plain(0), to = beside(0, off), hop = standOn(0, off);
  run(hop, 3, (q, i) => { if (q.clock > 0.5 || !q.ground) towards(CELLS[to].x - q.x, CELLS[to].z - q.z, i); i.jump = q.ground && q.on === 0 && q.clock > 0.5 && q.clock < 0.6; }, (q, ev) => ev.some((e) => e.type === 'land'));
  check('off a cell about to drop, a jump lands on the next one', hop.ground && hop.on === 0 && hop.cell === to && hop.jumps === 1 && gone(hop, 0, off), `on it at ${hop.clock.toFixed(2)} s`);
  const late = (after) => { const q = standOn(0, off); let asked = false; run(q, 1.2, (s, i) => { i.jump = !asked && !s.ground && s.clock > H.delay[0] + after; asked ||= i.jump; }); return q.jumps; };
  check('a jump is still granted a moment after the wax has gone — not later', late(0.05) === 1 && late(0.25) === 0);
}
{
  // ---- royal jelly
  const j = KIND[1].findIndex((k) => k === 2), st = standOn(1, j), seen = run(st, 4, null, (q, ev) => ev.some((e) => e.type === 'land'));
  check('the first foot on royal jelly is thrown back up, through the wax, onto the comb above', seen[0]?.type === 'throw' && st.on === 0 && st.ground && st.throws === 1 && Math.hypot(st.x - CELLS[j].x, st.z - CELLS[j].z) < 0.01, `up from the ${H.levels[1]} m comb to the ${H.levels[0]} m one in ${seen.at(-1).at.toFixed(2)} s`);
  const again = standOn(1, j); again.drop[1][j] = 0.4; const second = run(again, 1, null, (q) => !q.ground);
  check('once: jelly that a foot — or a bee — has had is a cell like another, and gives way', again.throws === 0 && !second.some((e) => e.type === 'throw') && second.some((e) => e.type === 'fall'));
}
{
  // ---- the bees
  const st = startRun(7), input = { x: 0, y: 0, jump: false }, events = [], bees = [[], [], [], []];
  for (let t = 0; t < 600 && !st.over; t += H.step) { botInput(st, input); stepRun(st, H.step, input, events); for (const e of events) if (e.type === 'bee') bees[e.comb].push({ cell: e.cell, at: st.clock }); events.length = 0; }
  const onTime = bees.every((list, c) => list.every((b) => { const k = (b.at - H.drone.first[c]) / H.drone.every; return Math.abs(k - Math.round(k)) < 0.02; }));
  const hops = bees.map((list) => list.filter((b, k) => k && NEAR[list[k - 1].cell].includes(b.cell)).length / Math.max(1, list.length - 1));
  check('on each comb a bee takes the wax apart by itself: a cell every so often, most often the one next to the last', onTime && bees.every((l) => l.length > 8) && hops.every((s) => s > 0.5), bees.map((l, c) => `${l.length} cells on comb ${c + 1}`).join(' · '));
  const path = (seed) => { const q = startRun(seed), list = []; run(q, 3.7, (s, i) => { towards(1, 0, i); }, null).forEach((e) => { if (e.type === 'bee') list.push(e.cell); }); return [q.drone.map((d) => d.to).join(','), ...list].join(' '); };
  check('their paths are drawn from the seed of the run: the same for the same seed, others for another', path(4) === path(4) && path(4) !== path(5) && path(5) !== path(6));
  const d = droneAt(startRun(2), 0), q2 = startRun(2); run(q2, 2.5, null); const landed = droneAt(q2, 0);
  check('a bee comes in from beyond the rim, and is seen on the cell it eats', Math.hypot(d.x, d.z) > H.radius && cellAt(landed.x, landed.z) === q2.drone[0].at && landed.up < 0.6, `${Math.hypot(d.x, d.z).toFixed(1)} m out at first`);
}
{
  // ---- a player that plays by itself, and those that do not think
  const runs = []; for (let seed = 1; seed <= 12; seed++) runs.push(botRun(seed));
  const least = Math.min(...runs.map((r) => r.time)), most = Math.max(...runs.map((r) => r.time));
  check('a player that plays by itself holds fifty-five seconds and more, whatever the seed', runs.every((r) => r.over && r.time >= 55000), runs.map((r) => (r.time / 1000).toFixed(0)).join(' · ') + ' s');
  const last = runs.filter((r) => r.state.low === 3).length;
  check('it runs on the four combs — when the bees have left it any of the last —, and takes the jelly now and then', runs.every((r) => r.state.low >= 1 && r.mine > 25) && last >= 5 && runs.some((r) => r.throws > 0), `${Math.round(runs.reduce((a, r) => a + r.mine, 0) / runs.length)} cells of its own a run; on the last comb in ${last} runs of twelve; ${runs.reduce((a, r) => a + r.throws, 0)} throws`);
  const a = botRun(9), b = botRun(9), same = (x, y) => x.time === y.time && x.mine === y.mine && [0, 1, 2, 3].every((c) => x.state.drop[c].every((v, i) => v === y.state.drop[c][i]));
  check('the same run for the same seed', same(a, b) && !same(a, botRun(10)));
  const at = (dt) => { const st = startRun(11), input = { x: 0, y: 0, jump: false }; let acc = 0; for (let t = 0; t < 600 && !st.over; t += dt) { acc += dt; while (acc >= H.step && !st.over) { acc -= H.step; botInput(st, input); stepRun(st, H.step, input, null); } } return st.time; };
  check('the same run at 30 and at 144 frames a second', at(1 / 30) === at(1 / 144) && at(1 / 30) > 0);
  const idle = botRun(1, 600, idleInput).time, hammer = botRun(1, 600, hammerInput).time, wild = [1, 2, 3, 4, 5, 6].map((s) => botRun(s, 600, runnerInput).time);
  check('who only hammers the jump is in the sea at once; who runs round without looking, long before the one who thinks', hammer < 8000 && idle < 7500 && Math.max(...wild) < least * 0.8 && Math.min(...wild) > idle, `still: ${fmt(idle)} · hammering: ${fmt(hammer)} · running round: ${wild.map(fmt).join(', ')}`);
  // what nobody can pass: a bee lands on a cell nothing has touched every so often for as long as its comb has one,
  // so there comes a second when every cell of the four combs has been touched; a capped one holds longest; then
  // nothing is left to stand on, and one is in the sea a throw and a fall later
  const eaten = Math.max(...H.drone.first) + (N - 1) * H.drone.every, bound = BOUND;
  const greedy = botRun(3, 600, (st, out) => { botInput(st, out); return out; }).state;
  check('a run has an end, whatever one does: the bees have landed on every cell in time, and nobody holds longer than that', bound < 90 && most / 1000 < bound - 5 && [0, 1, 2, 3].every((c) => greedy.drop[c].every((t) => t <= eaten + H.capped + 1e-6 || t === Infinity) && standing(greedy, c) < N), `every cell touched by ${eaten.toFixed(0)} s, in the sea by ${bound.toFixed(0)} s at the very latest; the best of the twelve runs: ${fmt(most)}`);
  // (and players that push the stick and the jump at random: none passes that second, none is ever off the wax sideways)
  const rnd = (n, k) => { const v = Math.sin(n * 127.1 + k * 311.7 + 74.7) * 43758.5453; return v - Math.floor(v); };
  let longest = 0, astray = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const st = startRun(seed), input = { x: 0, y: 0, jump: false };
    for (let k = 0; !st.over && k < 120 * 120; k++) { const beat = Math.floor(st.clock * (1 + (seed % 4))); input.x = rnd(seed, beat) * 2 - 1; input.y = rnd(seed, beat + 0.5) * 2 - 1; input.jump = rnd(seed, k) < 0.02 * (seed % 3); stepRun(st, H.step, input, null); if (cellAt(st.x, st.z) < 0 || !Number.isFinite(st.y)) astray++; }
    if (!st.over) astray++;
    longest = Math.max(longest, st.time);
  }
  check('sixty players that push the stick and the jump at random: all in the sea before that second, none ever off the wax sideways', astray === 0 && longest > 5000 && longest / 1000 < bound, `the luckiest held ${fmt(longest)}`);
  const line = { order: 'desc', min: Math.floor(Math.min(idle, hammer) / 1000) * 1000, max: Math.ceil(bound / 10) * 10_000 };
  check('the board of scores in rules.js is the one these runs give: its least what one gets by not playing, its most the bound of a run', BOARD.order === line.order && BOARD.min === line.min && BOARD.max === line.max && BOARD.max > most, JSON.stringify(BOARD));
  { const S = SERVER.hive || {}; check('the server keeps its board by the same line (server/scores.js), behind its switch', S.order === BOARD.order && S.min === BOARD.min && S.max === BOARD.max && S.release === 'hive' && S.each === 1 && S.unit === 'time', JSON.stringify(S)); }
  console.log(`      for the board of scores: hive: { order: 'desc', min: ${line.min}, max: ${String(line.max).replace(/000$/, '_000')} }`);
}
done();
