// Checks of Thin Crust, without a browser: the islet stands in the open sea, clear of the pier; the field is
// sixty-one columns, one step of which is jumped and two are not; a round is the same for everybody and not the
// next one's; a column warns before it sinks; fewer and fewer stand; nothing is unfair for the first minute; who
// only stands there is soon in the lava; a column that sinks takes one down with it, the side of a higher one is
// a wall; a bot holds a good while; the same run on every device.
// usage: node lab/games/lava/test.mjs
import { check, done, ground } from '../check.mjs';
import { PIER, pierToWorld, BOUNDS } from '../../../src/world/layout/layout.js';
import { nextStart, STARTS } from '../kit.js';
import { LAVA, CELLS, FIELD, GONE, UP, WARN, SINKING, cellAt, makeRound, columnAt, topAt, standingAt, targetAt, warnTime, startRun, stepRun, botInput, botRun, idleInput } from './rules.js';

const L = LAVA, height = await ground();
const run = (st, secs, drive, stop) => { const input = { x: 0, y: 0, jump: false }, events = [], seen = []; for (let t = 0; t < secs && !st.over; t += L.step) { input.jump = false; drive?.(st, input, t); stepRun(st, L.step, input, events); for (const e of events) seen.push({ ...e, at: st.clock }); events.length = 0; if (stop?.(st, seen)) break; } return seen; };
/** The stick that goes towards a place of the field. */
const towards = (st, i, x, z) => { const dx = x - st.x, dz = z - st.z, d = Math.hypot(dx, dz) || 1, [fx, fz] = L.look; i.y = (dx * fx + dz * fz) / d; i.x = (dx * -fz + dz * fx) / d; };
/** A round in which nothing ever moves but what is asked: every column at the height given, for ever. */
const still = (levels = () => 0) => ({ n: -1, acts: [], lives: CELLS.map((c, i) => { const lv = levels(c, i); return lv < 0 ? [] : [{ level: lv, rise: -1e9, up: -1e9, warn: Infinity, sink: Infinity, gone: Infinity }]; }) });
const on = (round, cell, wait = 0) => { const st = startRun(0, wait, cell); st.round = round; st.h = topAt(round, cell, st.clock); return st; };

{
  // ---- where it stands
  const R = FIELD + 1.9 + 10.1; let shallow = 0, deep = -99;
  for (let a = 0; a < 360; a += 10) for (const r of [0, 8, 16, R]) { const h = height(L.at.x + Math.cos(a / 57.3) * r, L.at.z + Math.sin(a / 57.3) * r); deep = Math.max(deep, h); if (h > -4) shallow++; }
  const [hx, hz] = pierToWorld(PIER.length, 0), fromPier = Math.hypot(L.at.x - hx, L.at.z - hz) - R;
  const inside = (x, z) => { let c = false; for (let i = 0, j = BOUNDS.length - 1; i < BOUNDS.length; j = i++) if ((BOUNDS[j][1] > z) !== (BOUNDS[i][1] > z) && x < ((BOUNDS[i][0] - BOUNDS[j][0]) * (z - BOUNDS[j][1])) / (BOUNDS[i][1] - BOUNDS[j][1]) + BOUNDS[j][0]) c = !c; return c; };
  let out = 0; for (let a = 0; a < 360; a += 15) if (!inside(L.at.x + Math.cos(a / 57.3) * R, L.at.z + Math.sin(a / 57.3) * R)) out++;
  check('the islet stands in the open sea, on a bed of five metres and more', shallow === 0, `never less than ${(-deep).toFixed(1)} m of water under it`);
  check('clear of the head of the pier, inside where one may swim, west of 212', fromPier > 12 && out === 0 && L.at.x + R < 212, `${fromPier.toFixed(0)} m of water between the pier and its foot`);
  const [gx, gz] = pierToWorld(126.5, -6);
  check('the arch is on the deck of the pier head, a little before its rail', Math.abs(-6) < PIER.headWidth / 2 - 2 && 126.5 < PIER.length - 3 && 126.5 > PIER.length - PIER.headLength + 3, `at ${gx.toFixed(1)}, ${gz.toFixed(1)}`);
}
{
  // ---- the field
  const six = CELLS.filter((c) => c.n.length === 6).length, near = Math.sqrt(3) * L.R;
  const sound = CELLS.every((c, i) => cellAt(c.x, c.z) === i && c.n.every((j) => Math.abs(Math.hypot(CELLS[j].x - c.x, CELLS[j].z - c.z) - near) < 1e-9 && CELLS[j].n.includes(i)));
  check('sixty-one columns, six-sided, each touching its neighbours; beyond the last ring there is only lava', CELLS.length === 61 && six === 37 && sound && cellAt(FIELD + 0.5, 0) === -1 && cellAt(0, FIELD) === -1, `${FIELD.toFixed(1)} m from the middle to the last corner`);
  const apex = (L.jump * L.jump) / (2 * L.g), air = (2 * L.jump) / L.g, far = L.run * air;
  check('a jump takes one step of the columns, not two; it crosses one missing column, not two', apex > L.tops[1] - L.tops[0] + 0.2 && apex < L.tops[2] - L.tops[0] - 0.3 && far > near + 1 && far < 2 * near - 0.4, `${apex.toFixed(2)} m up, ${far.toFixed(1)} m far; a step is ${(L.tops[1] - L.tops[0]).toFixed(1)} m, a column ${near.toFixed(2)} m`);
}
{
  // ---- a round
  const a = makeRound(4711), b = makeRound(4712), again = JSON.stringify(makeRound(4711).lives) === JSON.stringify(a.lives);
  const fresh = (n) => { const l = makeRound(n).lives; return JSON.stringify(l); };
  check('a round is the same for everybody who takes that start, and not the round of the next start', again && fresh(4711) !== fresh(4712) && a.acts.map((x) => x.kind).join() !== b.acts.map((x) => x.kind).join(), `${a.acts.slice(0, 5).map((x) => x.kind).join(', ')}… then ${b.acts.slice(0, 5).map((x) => x.kind).join(', ')}…`);
  const s0 = nextStart(100_000, L.every, STARTS), s1 = nextStart(s0.at + 1, L.every, STARTS);
  check('a round leaves every ten seconds on the shared clock, each start with its name', s0.at % (L.every * 1000) === 0 && s0.wait >= 3 && s0.wait < 3 + L.every && s1.at - s0.at === L.every * 1000 && s1.name !== s0.name && s1.n === s0.n + 1, `${s0.name}, then ${s1.name}`);
  // every life of every column of sixty rounds
  let first = 99, least = 99, early = 99, lives = 0, order = true, unfair = 0, wide = 0, fairChecked = 0, kinds = new Set(), heights = [0, 0, 0];
  const counts = [0, 15, 30, 45, 60, 75, 90, 120].map(() => []);
  for (let n = 9000; n < 9060; n++) {
    const R = makeRound(n);
    R.acts.forEach((x) => kinds.add(x.kind));
    [0, 15, 30, 45, 60, 75, 90, 120].forEach((t, k) => counts[k].push(standingAt(R, t)));
    R.lives.forEach((ls, c) => ls.forEach((l, k) => {
      lives++;
      if (k === 0) heights[l.level]++;
      if (!(l.rise <= l.up && l.up <= l.warn && l.warn <= l.sink && l.sink <= l.gone) || (k && ls[k - 1].gone > l.rise)) order = false;
      if (l.warn === Infinity) return;
      first = Math.min(first, l.warn); least = Math.min(least, l.sink - l.warn); if (l.warn < 20) early = Math.min(early, l.sink - l.warn);
      if (l.warn >= L.reach) return;
      // is there somewhere to go from it: a neighbour that stands when it sinks, and half a second more, no higher than a step?
      fairChecked++;
      const holds = (y, up) => R.lives[y].some((m) => m.up <= l.sink - 0.35 && m.sink >= l.sink + 0.55 && L.tops[m.level] <= L.tops[l.level] + up);
      if (CELLS[c].n.some((y) => holds(y, 0.95))) return;
      if (l.warn >= L.fair && CELLS[c].far.some((f) => holds(f.i, f.gap ? 0.05 : 0.95))) { wide++; return; }
      unfair++;
    }));
  }
  const mean = counts.map((a) => a.reduce((s, v) => s + v, 0) / a.length);
  check('what a column does is in order: it comes up, stands, warns, sinks — and is gone before it comes back', order && lives > 10000, `${lives} lives of columns in sixty rounds; rings, thirds, sweeps, the rim, one by one: ${[...kinds].join(', ')}`);
  check('nothing warns before two and a half seconds; a column warns before it sinks — 1.4 s early in a round, never less than half a second', first >= L.grace && Math.abs(early - 1.4) < 1e-9 && least > 0.549 && Math.abs(warnTime(0) - 1.4) < 1e-9, `the first warning at ${first.toFixed(2)} s; the shortest ${least.toFixed(2)} s`);
  check('the columns stand at three heights, the middle of the field level', heights[0] > heights[1] && heights[1] > heights[2] && heights[2] > 0 && [9000, 9001, 9002, 9003].every((n) => CELLS.every((c, i) => c.ring > 1 || makeRound(n).lives[i][0].level === 0)), `${heights.map((h) => Math.round((h / 60 / 61) * 100)).join(' % / ')} % of them`);
  check('fewer and fewer stand as the round goes on', mean.every((m, k) => !k || m < mean[k - 1]) && mean[0] === 61 && mean[2] > 30 && mean[4] < 26 && mean[6] < 8 && targetAt(0) === 61 && targetAt(200) === 2, mean.map((m, k) => `${[0, 15, 30, 45, 60, 75, 90, 120][k]} s: ${m.toFixed(0)}`).join(' · '));
  check(`nothing unfair for ${L.fair} s: a column that warns has a neighbour to step to, no higher than one step; then, to ${L.reach} s, at least one to jump to`, unfair === 0 && fairChecked > 5000, `${fairChecked} warnings looked at, ${wide} of them (after ${L.fair} s) with only a jump to make`);
}
{
  // ---- the columns under the feet
  const flat = still();
  const st = on(flat, cellAt(0, 0)); run(st, 1, (q, i) => { i.y = 1; });
  check('"up" on the stick goes away from the camera, across the columns, at a run', Math.abs(st.x - L.look[0] * (L.run - 0.45)) < 0.5 && Math.abs(st.z) < 1e-6 && st.ground && !st.over, `${Math.hypot(st.x, st.z).toFixed(1)} m in a second`);
  const edge = on(flat, cellAt(0, 0)); const seen = run(edge, 6, (q, i) => { i.x = 1; });
  check('beyond the last column there is the lava: one is out, and told for how long one held', edge.over && seen.some((e) => e.type === 'out' && e.time === edge.time) && edge.time > 1500 && edge.time < 2600 && Math.hypot(edge.x, edge.z) > FIELD - 1.3, `${(edge.time / 1000).toFixed(2)} s`);
  // a step, two steps
  const c0 = cellAt(0, 0), east = CELLS[c0].n.find((j) => CELLS[j].x > 1 && Math.abs(CELLS[j].z) < 0.1);
  const steps = (lv) => still((c, i) => (i === east ? lv : 0));
  const walk = on(steps(1), c0); run(walk, 2, (q, i) => towards(q, i, CELLS[east].x, 0));
  const hop = on(steps(1), c0); run(hop, 2, (q, i) => { towards(q, i, CELLS[east].x, 0); i.jump = q.ground && q.x > 0.7 && q.h < 1.5; });
  const wall = on(steps(2), c0); run(wall, 2, (q, i) => { towards(q, i, CELLS[east].x, 0); i.jump = q.ground && q.x > 0.7; });
  check('the side of a higher column is a wall: one step is jumped, two are not', cellAt(walk.x, walk.z) === c0 && cellAt(hop.x, hop.z) === east && Math.abs(hop.h - L.tops[1]) < 1e-6 && cellAt(wall.x, wall.z) === c0 && !wall.over, `walked into: stopped at ${walk.x.toFixed(2)} m; jumped: up at ${hop.h.toFixed(1)} m`);
  // a ditch of one column, of two
  const line = [0, 1, 2, 3].map((k) => cellAt(k * Math.sqrt(3) * L.R, 0));
  const ditch = (gone) => still((c, i) => (gone.includes(i) ? -1 : 0));
  const over = on(ditch([line[1]]), c0); run(over, 2.5, (q, i) => { towards(q, i, CELLS[line[2]].x, 0); i.jump = q.ground && q.x > 0.8 && q.x < 2; });
  const short = on(ditch([line[1], line[2]]), c0); run(short, 2.5, (q, i) => { towards(q, i, CELLS[line[3]].x, 0); i.jump = q.ground && q.x > 0.8 && q.x < 2; });
  check('a ditch of one column is jumped; of two, not', !over.over && cellAt(over.x, over.z) === line[2] && short.over, `over one: landed ${(over.x - CELLS[line[2]].x + Math.sqrt(3) * L.R / 2).toFixed(1)} m past its edge`);
  // a column that warns, then sinks
  const one = still(); one.lives[c0][0] = { level: 0, rise: -1e9, up: -1e9, warn: 1, sink: 2.4, gone: 2.4 + L.sink };
  const o = {}, states = [0.5, 1.5, 2.6, 3.4].map((t) => columnAt(one, c0, t, o).state);
  const sunk = on(one, c0), heard = run(sunk, 5);
  const left = on(one, c0); run(left, 5, (q, i) => { if (q.clock > 1.2) towards(q, i, CELLS[east].x, 0); else { i.x = 0; i.y = 0; } }, (q) => q.clock > 4);
  check('a column stands, warns, sinks and is gone; who stays on it goes down with it into the lava — who steps off in time does not', states.join() === [UP, WARN, SINKING, GONE].join() && sunk.over && sunk.time > 2400 && sunk.time < 2400 + L.sink * 1000 + 50 && heard.at(-1).type === 'out' && !left.over && cellAt(left.x, left.z) === east, `in the lava at ${(sunk.time / 1000).toFixed(2)} s, ${((sunk.time - 2400) / 1000).toFixed(2)} s after it began to sink`);
}
{
  // ---- whole rounds
  const idle = []; for (let k = 0; k < 12; k++) { const st = startRun(5000 + k); run(st, 120, (q, i) => idleInput(q, i)); idle.push(st.time); }
  check('who only stands there is in the lava within half a minute', idle.every((t) => t > 5000 && t < 35000), idle.map((t) => (t / 1000).toFixed(0)).join(' · ') + ' s');
  const hops = []; for (let k = 0; k < 12; k++) { const st = startRun(5000 + k); run(st, 120, (q, i) => { i.jump = q.ground; }); hops.push(st.time); }
  check('hammering the jump on the spot saves nobody', hops.every((t) => t < 36000), hops.map((t) => (t / 1000).toFixed(0)).join(' · ') + ' s');
  const runs = []; for (let k = 0; k < 12; k++) runs.push(botRun(5000 + k));
  const good = runs.filter((r) => r.time >= 30000).length, best = Math.max(...runs.map((r) => r.time)), worst = Math.min(...runs.map((r) => r.time));
  check('a bot holds half a minute and more on most of twelve starts, and in the end the lava has it too', good >= 10 && runs.every((r) => r.over && r.time > 12000) && best < 200000, runs.map((r) => (r.time / 1000).toFixed(1)).join(' · ') + ' s');
  check('every round ends: it is beyond holding long before nothing rises any more', best < (L.end - 60) * 1000 && standingAt(makeRound(5000), L.end + 20) === 0, `the longest ${(best / 1000).toFixed(1)} s, the shortest ${(worst / 1000).toFixed(1)} s`);
  const at = (dt) => { const st = startRun(5003), input = { x: 0, y: 0, jump: false }; let acc = 0; for (let t = 0; t < 300 && !st.over; t += dt) { acc += dt; while (acc >= L.step && !st.over) { acc -= L.step; botInput(st, input); stepRun(st, L.step, input, null); } } return st.time; };
  check('the same run at 30 and at 144 frames a second', at(1 / 30) === at(1 / 144) && at(1 / 30) === runs[3].time);
  // a wait before the start: every column stands, and the time counts from the start
  const early = startRun(5003, 6); run(early, 5.9, (q, i) => { i.x = Math.sin(q.clock * 3) * 0.4; i.y = Math.cos(q.clock * 2) * 0.4; });
  const all = standingAt(early.round, early.clock) === 61 && early.clock < 0 && !early.over;
  const fell = on(still(), cellAt(0, 0), 6); run(fell, 5.9, (q, i) => { i.x = 1; });
  check('before the round leaves every column stands and one may walk about; who falls in then has held nothing', all && fell.over && fell.time === 0);
  // (a score is how long one held, in ms: nobody holds longer than the round has columns — the last go down at L.end)
  console.log(`      for the board of scores: lava: { order: 'desc', min: 1000, max: ${Math.ceil(L.end + warnTime(L.end) + L.sink + 1)}_000 }`);
}
done();
