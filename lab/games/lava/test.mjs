// Checks of Thin Crust, without a browser: the volcano stands in the open sea, clear of the pier, and its crater
// holds the lava it shows; the field is sixty-one columns, one level of which is jumped and two are not; the lava
// rises in pulses, faster and faster — twice a double rise, said ahead — and never goes down; no column ever goes down, a new one comes up out of the
// lava after a glow, at least one level above the lava to come; a round is the same for everybody and not the next
// one's; for the first minute (eleven rises) there is a way on from the largest dry region, in the time left; later the
// hills are fewer and narrower; the side of a higher column is a wall, any drop is fine, the lava covers who
// stands too low; who only stands there is out at the first rise; a bot that reads the relief holds a minute and
// more; every round ends; the same run on every device; the line of its board of scores.
// usage: node lab/games/lava/test.mjs
import { check, done, ground } from '../check.mjs';
import { PIER, pierToWorld, BOUNDS } from '../../../src/world/layout/layout.js';
import { nextStart, STARTS } from '../kit.js';
import { LAVA, CONE, BOARD, PULSES, PACE, twice, CELLS, FIELD, UNDER, GLOW, RISING, UP, cellAt, makeRound, pulseOf, risesAt, lavaAt, levelsAt, regionsOf, walks, wayOn, columnAt, topAt, dryAt, startRun, stepRun, botInput, botRun, idleInput } from './rules.js';

const L = LAVA, N = CELLS.length, height = await ground();
const run = (st, secs, drive, stop) => { const input = { x: 0, y: 0, jump: false }, events = [], seen = []; for (let t = 0; t < secs && !st.over; t += L.step) { input.jump = false; drive?.(st, input, t); stepRun(st, L.step, input, events); for (const e of events) seen.push({ ...e, at: st.clock }); events.length = 0; if (stop?.(st, seen)) break; } return seen; };
/** The stick that goes towards a place of the field. */
const towards = (st, i, x, z) => { const dx = x - st.x, dz = z - st.z, d = Math.hypot(dx, dz) || 1, [fx, fz] = L.look; i.y = (dx * fx + dz * fz) / d; i.x = (dx * -fz + dz * fx) / d; };
/** A round in which nothing comes up but what is asked: every column at the level given (0: covered), the lava rising `high` times. */
const still = (levels = () => 1, high = 0) => ({ n: -1, high, end: high ? PULSES[high - 1] + L.surge : 0, pulses: [], cols: CELLS.map((c, i) => [{ level: levels(c, i), glow: -1e9, rise: -1e9, up: -1e9 }]) });
const on = (round, cell, wait = 0) => { const st = startRun(0, wait, cell); st.round = round; st.h = topAt(round, cell, st.clock); return st; };
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1), secs = (ms) => (ms / 1000).toFixed(1);

{
  // ---- where it stands
  const R = CONE.within; let shallow = 0, deep = -99;
  for (let a = 0; a < 360; a += 10) for (const r of [0, 8, 16, R]) { const h = height(L.at.x + Math.cos(a / 57.3) * r, L.at.z + Math.sin(a / 57.3) * r); deep = Math.max(deep, h); if (h > -4) shallow++; }
  const [hx, hz] = pierToWorld(PIER.length, 0), fromPier = Math.hypot(L.at.x - hx, L.at.z - hz) - R;
  const inside = (x, z) => { let c = false; for (let i = 0, j = BOUNDS.length - 1; i < BOUNDS.length; j = i++) if ((BOUNDS[j][1] > z) !== (BOUNDS[i][1] > z) && x < ((BOUNDS[i][0] - BOUNDS[j][0]) * (z - BOUNDS[j][1])) / (BOUNDS[i][1] - BOUNDS[j][1]) + BOUNDS[j][0]) c = !c; return c; };
  let out = 0; for (let a = 0; a < 360; a += 15) if (!inside(L.at.x + Math.cos(a / 57.3) * R, L.at.z + Math.sin(a / 57.3) * R)) out++;
  check('the volcano stands in the open sea, on a bed of four metres and more', shallow === 0, `never less than ${(-deep).toFixed(1)} m of water under it`);
  check('clear of the head of the pier, inside where one may swim, west of 215; its foot within twenty-seven metres of its middle, its highest rock under thirty', fromPier > 12 && out === 0 && L.at.x + R < 215 && R <= 27 && CONE.foot < R && CONE.rim + CONE.tall <= 30, `${fromPier.toFixed(1)} m of water between the pier and its foot; ${(CONE.rim + CONE.tall).toFixed(1)} m at the most`);
  const full = L.level + L.top * L.lv;
  check('the crater holds the lava it shows: its lip is everywhere above the highest the lava can ever be, and it opens as it goes up', CONE.rim - CONE.low > full + 0.9 && CONE.flare > 0 && CONE.flare < 0.5 && L.level > 0.5, `the lava at ${L.level} m above the sea to begin with, ${full.toFixed(1)} m at the most; the lip at ${(CONE.rim - CONE.low).toFixed(1)} m and more`);
  const [gx, gz] = pierToWorld(126.5, -6);
  check('the arch is on the deck of the pier head, a little before its rail', Math.abs(-6) < PIER.headWidth / 2 - 2 && 126.5 < PIER.length - 3 && 126.5 > PIER.length - PIER.headLength + 3, `at ${gx.toFixed(1)}, ${gz.toFixed(1)}`);
}
{
  // ---- the field
  const six = CELLS.filter((c) => c.n.length === 6).length, near = Math.sqrt(3) * L.R;
  const sound = CELLS.every((c, i) => cellAt(c.x, c.z) === i && c.n.every((j) => Math.abs(Math.hypot(CELLS[j].x - c.x, CELLS[j].z - c.z) - near) < 1e-9 && CELLS[j].n.includes(i)));
  check('sixty-one columns, six-sided, each touching its neighbours; beyond the last ring there is only lava', N === 61 && six === 37 && sound && cellAt(FIELD + 0.5, 0) === -1 && cellAt(0, FIELD) === -1, `${FIELD.toFixed(1)} m from the middle to the last corner`);
  const apex = (L.jump * L.jump) / (2 * L.g), air = (2 * L.jump) / L.g, far = L.run * air;
  check('a jump takes one level, not two; it crosses one missing column, not two', L.lv >= 0.8 && L.lv <= 0.9 && apex > L.lv + 0.2 && apex + L.stepUp < 2 * L.lv - 0.2 && far > near + 1 && far < 2 * near - 0.4, `${apex.toFixed(2)} m up, ${far.toFixed(1)} m far; a level is ${L.lv} m, a column ${near.toFixed(2)} m`);
}
{
  // ---- the lava
  // (the gap before the rise to level i + 2 is gaps[i]; a double rise is left out of the slowing down)
  const all = PULSES.slice(1).map((p, i) => p - PULSES[i]), gaps = all.filter((g, i) => !twice(i + 2));
  check('the lava rises in pulses, one level at a time, faster and faster: the first after six and a half seconds, the next about six later, about three apart in the end', PULSES.length === L.top && PULSES[0] === 6.5 && gaps[0] > 6 && gaps[0] <= 6.5 && gaps.every((g, i) => !i || g <= gaps[i - 1] + 1e-9) && gaps.at(-1) < 3.3 && gaps.at(-1) >= 3 && gaps[8] < 5, `rises at ${PULSES.slice(0, 5).map((p) => p.toFixed(1)).join(', ')}… ${PULSES.slice(-2).map((p) => p.toFixed(1)).join(', ')} s; ${gaps[0].toFixed(1)} s apart at first, ${gaps.at(-1).toFixed(1)} s in the end`);
  // a double rise: the rise to a level of L.twice comes hard on the one before, once the lava is still again; never in the first minute
  const doubles = L.twice.every((k) => Math.abs(all[k - 2] - L.again) < 1e-9 && L.again > L.surge + 0.4 && k - 2 >= L.fair && k <= L.last) && all.filter((g) => g < 2).length === L.twice.length;
  check('now and then a double rise: two levels hard on each other, after the first minute, and nothing comes up between the two', doubles && makeRound(4711).pulses.every((P) => !twice(P.k + 1) || P.cells.length === 0), `to levels ${L.twice.join(' and ')}, at ${L.twice.map((k) => PULSES[k - 2].toFixed(1) + ' and ' + PULSES[k - 1].toFixed(1)).join(', ')} s`);
  const R = makeRound(4711);
  let down = 0, whole = true, prev = 0;
  for (let t = -5; t < R.end + 20; t += 0.01) { const l = lavaAt(R, t); if (l < prev - 1e-12 || l > prev + 0.05) down++; prev = l; }
  for (let k = 0; k <= R.high; k++) if (lavaAt(R, (k ? PULSES[k - 1] + L.surge : -3) + 0.01) !== k || (k < R.high && lavaAt(R, PULSES[k] - 0.01) !== k)) whole = false;
  check('the lava never goes down; between two rises it is still, at a whole level; it stops once it has covered everything', down === 0 && whole && lavaAt(R, R.end + 60) === R.high && lavaAt(R, -3) === 0 && risesAt(PULSES[4] + 0.01) === 5, `round 4711: ${R.high} rises, the last over at ${R.end.toFixed(1)} s`);
}
{
  // ---- a round
  const text = (n) => JSON.stringify(makeRound(n).cols), a = text(4711), b = text(4712);
  for (let n = 100; n < 130; n++) makeRound(n); // (the round is forgotten, and made again)
  check('a round is the same for everybody who takes that start, and not the round of the next start', text(4711) === a && a !== b && JSON.stringify(makeRound(4711).cols.map((c) => c[0].level)) !== JSON.stringify(makeRound(4712).cols.map((c) => c[0].level)), `${makeRound(4711).pulses.slice(1, 6).map((p) => p.cells.length).join(', ')}… columns come up, pulse after pulse; then ${makeRound(4712).pulses.slice(1, 6).map((p) => p.cells.length).join(', ')}…`);
  const s0 = nextStart(100_000, L.every, STARTS), s1 = nextStart(s0.at + 1, L.every, STARTS);
  check('a round leaves every ten seconds on the shared clock, each start with its name', s0.at % (L.every * 1000) === 0 && s0.wait >= 3 && s0.wait < 3 + L.every && s1.at - s0.at === L.every * 1000 && s1.name !== s0.name && s1.n === s0.n + 1, `${s0.name}, then ${s1.name}`);
  // every column of sixty rounds
  const ROUNDS = 60, over = [0, 0, 0, 0, 0], news = [], dry = [], first = [0, 0, 0, 0, 0];
  let twofold = 0, came = 0, order = true, wet = true, room = true, heights = true, notice = 99, spare = 99, late = 0, lone = 0, level = true, ends = 0, highest = 0, sunk = 0;
  let ways = 0, far = 0, farDry = 0, least = 99, people = 0, spared = true;
  for (let n = 9000; n < 9000 + ROUNDS; n++) {
    const R = makeRound(n);
    ends = Math.max(ends, R.end); highest = Math.max(highest, R.high);
    if (dryAt(R, -1) !== N || dryAt(R, R.end + 0.01) !== 0 || R.high > L.top) wet = false;
    R.cols.forEach((list, c) => {
      first[list[0].level]++;
      if (CELLS[c].ring <= 1 && list[0].level !== 1) level = false;
      list.forEach((e, i) => {
        if (!i) return;
        came++;
        const k = risesAt(e.glow), P = pulseOf(k), was = list[i - 1];
        if (!(e.level > was.level) || !(e.glow < e.rise && e.rise < e.up)) order = false;
        // (it comes up where there is lava: what stood there is covered, and the lava is still)
        if (was.level > k || lavaAt(R, e.glow) !== k || lavaAt(R, e.up) !== k || e.glow < PULSES[k - 1] + L.surge + L.settle - 1e-9) room = false;
        // (`base`: the lava to come — before a double rise, two levels up)
        const base = k + 1 + (twice(k + 2) ? 1 : 0);
        if (e.level < base + 1 || e.level > base + 4 || e.level > L.top) heights = false;
        over[e.level - base]++; if (twice(k + 2)) twofold++;
        notice = Math.min(notice, e.rise - e.glow); spare = Math.min(spare, P.at - e.up);
        if (k >= L.last) late++;
        // (a lone one: nothing dry round it that is within a level of it)
        const lv = levelsAt(R, e.up);
        if (!CELLS[c].n.some((j) => lv[j] > k && Math.abs(lv[j] - e.level) <= 1)) lone++;
      });
    });
    R.pulses.forEach((P) => {
      const k = P.k, before = levelsAt(R, k ? PULSES[k - 1] + L.surge + 0.01 : -1), after = levelsAt(R, P.at - 0.01);
      (news[k] ||= []).push(P.cells.length);
      (dry[k] ||= []).push(after.reduce((s, v) => s + (v > k + 1 ? 1 : 0), 0));
      if (k >= L.fair) return;
      // the way on, asked again of the round as it was finally written: from every column of the largest dry
      // region, a walk — a step up at a time — to the largest region there is after the rise, and (with a jump
      // where it helps) to any ground that stays dry
      const w = wayOn(before, after, k, false), j = wayOn(before, after, k, true);
      ways++; people += w.from.length; least = Math.min(least, w.to.length);
      far = Math.max(far, w.on / P.left); farDry = Math.max(farDry, j.dry / P.left);
      if (!(w.on <= 0.7 * P.left + 1e-9) || !(j.dry <= P.left) || !P.sure) spared = false;
    });
    // no top ever goes down (one round in five, every twentieth of a second)
    if (n % 5 === 0) for (let c = 0; c < N; c++) { let was = -1; for (let t = -1; t < R.end + 1; t += 0.05) { const top = topAt(R, c, t); if (top < was - 1e-9) sunk++; was = top; } }
  }
  const m = (k0, k1) => mean(news.slice(k0, k1).map(mean)), d = (k0, k1) => mean(dry.slice(k0, k1).map(mean)), total = over.reduce((s, v) => s + v, 0);
  check('the relief of the start: every column stands, at one level to four; the middle of the field is level and low — nobody can stay there', level && wet && first[1] > first[2] && first[2] > first[3] && first[3] > first[4] && first[4] > 0 && first[0] === 0, `${[1, 2, 3, 4].map((l) => `${Math.round((first[l] / ROUNDS / N) * 100)} %`).join(' / ')} of them at levels 1 / 2 / 3 / 4`);
  check('no column ever goes down: what comes up where one was covered stands higher, and no top is ever lower than it was', order && sunk === 0 && came > 3000, `${came} columns came up in sixty rounds`);
  check('a column comes up out of the lava — where what stood is covered — after a glow, and is up before the lava rises again', room && notice >= L.notice[1] - 1e-9 && Math.abs(pulseOf(1).rise - pulseOf(1).glow - L.notice[0]) < 1e-9 && spare > 0.9 && late === 0, `the shortest glow ${notice.toFixed(2)} s, the first ${L.notice[0]} s; up ${spare.toFixed(2)} s before the rise at the least; nothing comes after the rise to level ${L.last}`);
  const stay = [1, 2, 3, 4].reduce((s, l) => s + l * over[l], 0) / total; // (how many rises a new column stands, on average, after the one to come)
  check('a new column always stands at least one level above the lava to come — before a double rise, above both — mostly one or two: small hills, one has to move on at nearly every pulse', heights && over[0] === 0 && over[1] > over[3] && over[2] > over[3] && over[3] > over[4] && over[4] > total * 0.02 && stay < 2 && twofold > ROUNDS * 2, `${[1, 2, 3, 4].map((l) => `${Math.round((over[l] / total) * 100)} %`).join(' / ')} of them one / two / three / four levels above it — ${stay.toFixed(2)} on average; ${(twofold / ROUNDS).toFixed(1)} a round come up before a double rise`);
  check(`fair for the first ${L.fair} rises (${PULSES[L.fair - 1].toFixed(0)} s): from every column of the largest dry region one can walk, a step up at a time, to the largest region there is after the rise — so to ground that stays dry — in the time left once the columns are up`, spared && ways === ROUNDS * L.fair && least >= 5 && far <= 0.7 + 1e-9 && L.fair >= 8 && PULSES[L.fair - 1] > 58 && !L.twice.some((k) => k <= L.fair + 1), `${ways} rises looked at, ${people} columns to leave from; the longest walk takes ${Math.round(far * 100)} % of the time left (to any dry ground: ${Math.round(farDry * 100)} %); the region to come is never smaller than ${least} columns`);
  check('later the hills are fewer and narrower, the notice shorter, and less and less stays dry', m(1, L.fair) > m(L.fair, 15) + 3 && m(L.fair, 15) > m(15, L.last) && d(1, L.fair) > 16 && d(L.fair, 15) < d(1, L.fair) - 5 && d(15, L.last) < d(L.fair, 15) && pulseOf(L.last - 1).rise - pulseOf(L.last - 1).glow < 1 && pulseOf(L.last - 1).left < pulseOf(L.fair).left - 0.3 && pulseOf(L.last - 1).left > 1.2, `columns that come up at each pulse: ${m(1, L.fair).toFixed(1)}, then ${m(L.fair, 15).toFixed(1)}, then ${m(15, L.last).toFixed(1)}; dry after the rise: ${d(1, L.fair).toFixed(0)}, ${d(L.fair, 15).toFixed(0)}, ${d(15, L.last).toFixed(0)} of ${N}; time left once they are up: ${pulseOf(1).left.toFixed(1)} s, ${pulseOf(L.fair).left.toFixed(1)} s, ${pulseOf(L.last - 1).left.toFixed(1)} s`);
  check('and there are lone columns — nothing dry round them within a level: out of reach, or with no way on', lone > ROUNDS * 4 && lone < came * 0.4, `${lone} of the ${came}, ${(lone / ROUNDS).toFixed(1)} a round`);
  check('every round ends: once nothing comes up any more the lava covers what is left, and stops', wet && ends <= BOARD.max / 1000 && highest <= L.top && ends < 130, `the longest of the sixty is all lava at ${ends.toFixed(1)} s, level ${highest}`);
}
{
  // ---- reading a relief
  const c0 = cellAt(0, 0), [e1, e2] = [1, 2].map((k) => cellAt(k * Math.sqrt(3) * L.R, 0)), lv = (set) => { const a = new Int8Array(N); for (const [c, l] of set) a[c] = l; return a; };
  const stair = lv([[c0, 1], [e1, 2], [e2, 3]]), cliff = lv([[c0, 1], [e1, 3]]), ditch = lv([[c0, 2], [e2, 2]]), hole = lv([[c0, 1], [e2, 2]]);
  const reg = regionsOf(stair, 0), two = regionsOf(cliff, 0);
  check('a relief is read as one walks it: a step up of one level, any drop, a jump over one missing column to a top no higher', reg.size.length === 1 && reg.size[0] === 3 && two.size.length === 2 && Math.abs(walks(stair, 0, [e2])[c0] - 2 * PACE.up) < 1e-9 && walks(cliff, 0, [e1])[c0] === Infinity && walks(cliff, 0, [c0])[e1] === PACE.step
    && walks(ditch, 0, [e2])[c0] === PACE.gap && walks(ditch, 0, [e2], false)[c0] === Infinity && walks(hole, 0, [e2])[c0] === Infinity && regionsOf(stair, 1).size[0] === 2, `up a stair of two: ${(2 * PACE.up).toFixed(1)} s`);
}
{
  // ---- the columns under the feet
  const flat = still();
  const st = on(flat, cellAt(0, 0)); run(st, 1, (q, i) => { i.y = 1; });
  check('"up" on the stick goes away from the camera, across the columns, at a run', Math.abs(st.x - L.look[0] * (L.run - 0.45)) < 0.5 && Math.abs(st.z) < 1e-6 && st.ground && !st.over, `${Math.hypot(st.x, st.z).toFixed(1)} m in a second`);
  const edge = on(flat, cellAt(0, 0)); const seen = run(edge, 6, (q, i) => { i.x = 1; });
  check('beyond the last column there is the lava: one is out, and told for how long one held', edge.over && seen.some((e) => e.type === 'out' && e.time === edge.time) && edge.time > 1500 && edge.time < 2600 && Math.hypot(edge.x, edge.z) > FIELD - 1.3, `${(edge.time / 1000).toFixed(2)} s`);
  // one level, two levels, a drop
  const c0 = cellAt(0, 0), east = CELLS[c0].n.find((j) => CELLS[j].x > 1 && Math.abs(CELLS[j].z) < 0.1);
  const steps = (lv, own = 1) => still((c, i) => (i === east ? lv : i === c0 ? own : 1));
  const walk = on(steps(2), c0); run(walk, 2, (q, i) => towards(q, i, CELLS[east].x, 0));
  const hop = on(steps(2), c0); run(hop, 2, (q, i) => { towards(q, i, CELLS[east].x, 0); i.jump = q.ground && q.x > 0.7 && q.h < 1.5; });
  const wall = on(steps(3), c0); run(wall, 2, (q, i) => { towards(q, i, CELLS[east].x, 0); i.jump = q.ground && q.x > 0.7; });
  const drop = on(steps(1, 5), c0); run(drop, 2, (q, i) => towards(q, i, CELLS[east].x, 0));
  check('the side of a higher column is a wall: one level is jumped, two are not; any drop is fine', cellAt(walk.x, walk.z) === c0 && cellAt(hop.x, hop.z) === east && Math.abs(hop.h - 2 * L.lv) < 1e-6 && cellAt(wall.x, wall.z) === c0 && !wall.over && cellAt(drop.x, drop.z) === east && drop.ground && !drop.over && Math.abs(drop.h - L.lv) < 1e-6, `walked into: stopped at ${walk.x.toFixed(2)} m; jumped: up at ${hop.h.toFixed(1)} m; dropped four levels: down at ${drop.h.toFixed(1)} m`);
  // a ditch of one column, of two
  const line = [0, 1, 2, 3].map((k) => cellAt(k * Math.sqrt(3) * L.R, 0));
  const ditch = (gone) => still((c, i) => (gone.includes(i) ? 0 : 1));
  const over = on(ditch([line[1]]), c0); run(over, 2.5, (q, i) => { towards(q, i, CELLS[line[2]].x, 0); i.jump = q.ground && q.x > 0.8 && q.x < 2; });
  const short = on(ditch([line[1], line[2]]), c0); run(short, 2.5, (q, i) => { towards(q, i, CELLS[line[3]].x, 0); i.jump = q.ground && q.x > 0.8 && q.x < 2; });
  check('a covered column is jumped over; two in a row are not', !over.over && cellAt(over.x, over.z) === line[2] && short.over, `over one: landed ${(over.x - CELLS[line[2]].x + Math.sqrt(3) * L.R / 2).toFixed(1)} m past its edge`);
  // the lava rises: it covers the column one level over it, and whoever is on it
  const pulse = still((c, i) => (i === east ? 2 : 1), 1);
  const low = on(pulse, c0), heard = run(low, 14), high = on(pulse, east); run(high, 14);
  const fled = on(pulse, c0); run(fled, 14, (q, i) => { if (q.clock > PULSES[0] - 0.6) { towards(q, i, CELLS[east].x, 0); i.jump = q.ground && q.x > 0.7 && q.h < 1.5; } });
  const o = {}, covered = [PULSES[0] - 0.1, PULSES[0] + L.surge + 0.1].map((t) => columnAt(pulse, c0, t, o).state);
  check('the lava rises a level: the column it reaches is covered and whoever stands on it is out — who stands a level higher, or gets there in time, is not', low.over && low.time > PULSES[0] * 1000 + 300 && low.time < (PULSES[0] + L.surge) * 1000 && heard.at(-1).type === 'out' && !high.over && !fled.over && cellAt(fled.x, fled.z) === east && covered.join() === [UP, UNDER].join() && dryAt(pulse, 12) === 1, `out at ${(low.time / 1000).toFixed(2)} s, ${((low.time - PULSES[0] * 1000) / 1000).toFixed(2)} s after the lava began to rise`);
  // a column comes up: a glow, then it rises; before it is up there is only lava there
  const born = still((c, i) => (i === east ? 0 : i === c0 ? 2 : 1));
  born.cols[east].push({ level: 3, glow: 1, rise: 2, up: 2 + L.rise });
  const states = [0.5, 1.5, 2.3, 3].map((t) => columnAt(born, east, t, o).state), heads = [1.1, 1.9].map((t) => topAt(born, east, t));
  const soon = on(born, c0); run(soon, 4, (q, i) => { if (q.clock > 1.1) towards(q, i, CELLS[east].x, 0); });
  const then = on(born, c0); run(then, 5, (q, i) => { if (q.clock > 2.9) { towards(q, i, CELLS[east].x, 0); i.jump = q.ground && q.x > 0.7 && q.h < 2; } });
  check('where a column is about to come up there is a glow, and only lava yet: who steps there is out; once it is up it is climbed like any other', states.join() === [UNDER, GLOW, RISING, UP].join() && heads.every((h) => h > 0 && h < L.burn) && soon.over && soon.time < 2000 && !then.over && cellAt(then.x, then.z) === east && Math.abs(then.h - 3 * L.lv) < 1e-6, `its head ${heads.map((h) => h.toFixed(2)).join(' to ')} m over the lava while it glows — one cannot stand that low`);
}
{
  // ---- whole rounds
  const START = 5000, middle = CELLS.map((c, i) => (c.ring <= 1 ? i : -1)).filter((i) => i >= 0);
  const idle = []; for (let k = 0; k < 12; k++) { const st = startRun(START + k, 0, middle[k % middle.length]); run(st, 60, (q, i) => idleInput(q, i)); idle.push(st.time); }
  check('who only stands there, anywhere in the middle, is out at the first rise', middle.length === 7 && idle.every((t) => t > PULSES[0] * 1000 && t < (PULSES[0] + L.surge) * 1000), idle.map((t) => (t / 1000).toFixed(1)).join(' · ') + ' s');
  // (on the highest column of the start one is out when the lava comes to it: at the fourth rise at the latest)
  const perch = []; for (let k = 0; k < 12; k++) { const R = makeRound(START + k), top = R.cols.reduce((b, list, c) => (list[0].level > R.cols[b][0].level ? c : b), 0), st = startRun(START + k, 0, top); run(st, 60, (q, i) => idleInput(q, i)); perch.push([R.cols[top][0].level, st.time]); }
  check('nor is the highest column of the start a place to stay: the lava comes to it, at the fourth rise at the latest', perch.every(([lv, t]) => lv >= 3 && lv <= 4 && t > PULSES[lv - 1] * 1000 && t < (PULSES[lv - 1] + L.surge) * 1000), perch.map(([lv, t]) => `${(t / 1000).toFixed(1)}`).join(' · ') + ' s');
  const hops = []; for (let k = 0; k < 12; k++) { const st = startRun(START + k); run(st, 60, (q, i) => { i.jump = q.ground; }); hops.push(st.time); }
  check('hammering the jump on the spot saves nobody', hops.every((t) => t > PULSES[0] * 1000 && t < (PULSES[0] + L.surge + 0.8) * 1000), hops.map((t) => (t / 1000).toFixed(1)).join(' · ') + ' s');
  const runs = []; for (let k = 0; k < 12; k++) runs.push(botRun(START + k));
  const minute = runs.filter((r) => r.time > 60000).length, best = Math.max(...runs.map((r) => r.time)), worst = Math.min(...runs.map((r) => r.time));
  check(`a bot that reads the relief — and sees no more than a player — holds more than a minute on most of twelve starts, and in the end the lava has it too`, minute >= 10 && runs.every((r) => r.over && r.time > 30000) && best < BOARD.max, `${runs.map((r) => secs(r.time)).join(' · ')} s — ${minute} of 12 over a minute`);
  const slow = []; for (let k = 0; k < 12; k++) slow.push(botRun(START + k, 200, 0.4));
  check('one that looks about itself only every four tenths of a second holds a minute on most of them too', slow.filter((r) => r.time > 60000).length >= 9 && slow.every((r) => r.over), slow.map((r) => secs(r.time)).join(' · ') + ' s');
  const many = []; for (let k = 0; k < 40; k++) many.push(botRun(7000 + k).time);
  check('on forty other starts: the fair rises of the first minute held nearly always, nobody beyond a minute and a half or so', many.filter((t) => t > PULSES[L.fair - 1] * 1000).length >= 36 && Math.max(...many) < 100000 && mean(many) > 70000, `${secs(Math.min(...many))} s the shortest, ${secs(mean(many))} s the mean, ${secs(Math.max(...many))} s the longest`);
  const at = (dt) => { const st = startRun(START + 3), input = { x: 0, y: 0, jump: false }; let acc = 0; for (let t = 0; t < 200 && !st.over; t += dt) { acc += dt; while (acc >= L.step && !st.over) { acc -= L.step; botInput(st, input); stepRun(st, L.step, input, null); } } return st.time; };
  check('the same run at 30 and at 144 frames a second', at(1 / 30) === at(1 / 144) && at(1 / 30) === runs[3].time, `${secs(runs[3].time)} s`);
  // a wait before the start: every column stands, nothing moves, and the time counts from the start
  const early = startRun(START + 3, 6); run(early, 5.9, (q, i) => { i.x = Math.sin(q.clock * 3) * 0.4; i.y = Math.cos(q.clock * 2) * 0.4; });
  const all = dryAt(early.round, early.clock) === N && lavaAt(early.round, early.clock) === 0 && early.clock < 0 && !early.over;
  const fell = on(still(), cellAt(0, 0), 6); run(fell, 5.9, (q, i) => { i.x = 1; });
  check('before the round leaves every column stands and one may walk about; who falls in then has held nothing', all && fell.over && fell.time === 0);
  // (a score is how long one held, in ms: nobody holds longer than the lava takes to cover the highest a column may stand)
  const line = { order: 'desc', min: 1000, max: Math.ceil(PULSES[L.top - 1] + L.surge) * 1000 };
  check('the board of scores in rules.js is the one these rounds give: the longer the better, no longer than the lava takes to cover everything', BOARD.order === line.order && BOARD.min === line.min && BOARD.max === line.max && BOARD.max > best && BOARD.min < Math.min(...idle), JSON.stringify(BOARD));
  console.log(`      for the board of scores: lava: { order: '${line.order}', min: ${line.min}, max: ${String(line.max).replace(/000$/, '_000')} }`);
}
done();
