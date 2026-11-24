// Checks of Wave Goodbye, without a browser: the bar of sand leaves the beach at the water's edge and runs out
// over shallow sea, clear of the island and of the pier; the sea is the same for everybody, never unfair in what
// it sends two beats running; a wave stands taller the further out one is, and lower at one end of its crest;
// what is lower than the knees only wets; who stands still is carried off, who jumps in time is not; the tall
// ones ask for the second jump, the great ones for their low end; the wader that plays by itself holds two
// minutes — and nobody holds for ever.
// usage: node lab/games/waves/test.mjs
import { check, done, ground } from '../check.mjs';
import { PIER } from '../../../src/world/layout/layout.js';
import { ISLAND } from '../../../src/world/layout/layout.js';
import { WAVES, waveOf, crestAt, heightAt, coming, startWade, stepWade, barAt, ahead, botInput, naiveInput, botWade } from './rules.js';

const W = WAVES, height = await ground();
const closing = W.speed + W.drift;
/** A wader `s` metres out, long past wading in, with the wave of beat `n` due in `lead` seconds. */
const facing = (n, s, lead = 1.6, u = 0) => { const st = startWade(0, u); st.s = s; st.clock = 30; st.t0 = n * W.beat + (W.length + W.far - s - lead * closing) / W.speed - st.clock; st.next = n; return st; };
/** The first beat from `from` on with a wave of that kind that comes alone (nothing on the beats next to it, nor two beats before or after). */
const lone = (kind, from = 0) => { for (let n = from; n < from + 20000; n++) { const w = waveOf(n); if (w.on && w.kind === kind && [-2, -1, 1, 2].every((d) => !waveOf(n + d).on)) return n; } return -1; };
/** Runs a wade until it is out, or the wave of beat `n` has gone by; `drive(st, input, t)` presses the keys (t: seconds until the crest is on one). */
const meet = (st, n, drive) => { const input = { side: 0, jump: false }, seen = []; for (let k = 0; k < 600 && !st.over && st.next <= n; k++) { input.jump = false; drive?.(st, input, (crestAt(n, st.t0 + st.clock) - st.s) / closing); const ev = []; stepWade(st, W.step, input, ev); seen.push(...ev); } return seen; };

{
  // ---- where it is
  const line = barAt(0, 0), gate = barAt(-7, 0), tip = barAt(W.length, 0), rise = barAt(W.length + W.far, 0);
  let deepest = 0, dry = 0;
  for (let s = 6; s <= W.length + 5; s += 2) for (const u of [-W.half - 9, 0, W.half + 9]) { const p = barAt(s, u), h = height(p.x, p.z); deepest = Math.min(deepest, h); if (h > -0.2) dry++; }
  check('the bar leaves the beach at the water\'s edge, from an arch on dry sand', Math.abs(height(line.x, line.z)) < 0.5 && height(gate.x, gate.z) > 0.2, `the line ${height(line.x, line.z).toFixed(2)} m, the arch ${height(gate.x, gate.z).toFixed(2)} m over the sea`);
  check('and runs out over shallow sea: the sand that is built stands on the bed everywhere', dry === 0 && deepest > -4.8, `${W.length} m out, the bed ${(-deepest).toFixed(1)} m down at the deepest`);
  // (the head of the pier: 72 to 132 m along it, 24 m to each side; the rock of the island: within 38 m of its middle)
  const c = Math.cos(PIER.heading), sn = Math.sin(PIER.heading), toPier = (p) => { const dx = p.x - PIER.rootX, dz = p.z - PIER.rootZ, along = dx * c + dz * sn, side = -dx * sn + dz * c; return Math.hypot(Math.max(0, 72 - along, along - 132), Math.max(0, Math.abs(side) - 24)); };
  let pier = 99, island = 999;
  for (let s = 0; s <= W.length + W.far; s += 2) for (const u of [-W.half - 10, W.half + 10]) { const p = barAt(s, u); pier = Math.min(pier, toPier(p)); island = Math.min(island, Math.hypot(p.x - ISLAND.x, p.z - ISLAND.z)); }
  check('bar and waves keep clear of the pier and of the island', pier > 8 && island > 42, `${pier.toFixed(0)} m from the head of the pier, ${island.toFixed(0)} m from the middle of the island; the tip at (${tip.x.toFixed(0)}, ${tip.z.toFixed(0)}), the waves rise at (${rise.x.toFixed(0)}, ${rise.z.toFixed(0)})`);
}
{
  // ---- the sea
  const kinds = {}; let on = 0, three = 0, badPair = 0, greatWrong = 0, lastGreat = -99, close = 99;
  for (let n = 1000; n < 41000; n++) {
    const w = waveOf(n);
    if (!w.on) continue;
    on++; kinds[w.kind] = (kinds[w.kind] || 0) + 1;
    const before = waveOf(n - 1), after = waveOf(n + 1);
    if (before.on && after.on) three++;
    if (before.on && (!['ripple', 'roller'].includes(w.kind) || !['ripple', 'roller'].includes(before.kind) || before.dir !== w.dir)) badPair++;
    if (w.kind === 'monster') { if (n % 8 !== 0 || before.on || after.on) greatWrong++; close = Math.min(close, (n - lastGreat) * W.beat); lastGreat = n; }
  }
  const a = waveOf(4711), b = waveOf(4711), seenA = [], seenB = [];
  coming(123456.7, (w, crest) => seenA.push([w.n, w.kind, crest])); coming(123456.7, (w, crest) => seenB.push([w.n, w.kind, crest]));
  check('the sea is the same for everybody', JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(seenA) === JSON.stringify(seenB) && seenA.length > 3, `${seenA.length} waves on the sea at once`);
  check('ripples, rollers, breakers and now and then a great one — a wave every second and a half, about', kinds.ripple > kinds.roller && kinds.roller > kinds.breaker && kinds.breaker > kinds.monster && kinds.monster > 100, `${Object.entries(kinds).map(([k, v]) => `${k} ${((v / on) * 100).toFixed(0)}%`).join(', ')}; one every ${((40000 * W.beat) / on).toFixed(2)} s, a great one every ${((40000 * W.beat) / kinds.monster).toFixed(0)} s`);
  check('never three beats running; two running are small and lean the same way', three === 0 && badPair === 0);
  check('a great one opens its set and comes alone, never two within four seconds', greatWrong === 0 && close >= 4, `${close.toFixed(1)} s between two at the least`);
}
{
  // ---- how tall, and where
  const n = lone('breaker', 5000), w = waveOf(n), m = waveOf(lone('monster', 5000)), r = waveOf(lone('roller', 5000)), ri = waveOf(lone('ripple', 5000));
  const hs = [0, 10, 20, 30, 40, 50, 60].map((s) => heightAt(w, s, 0));
  check('a wave stands taller the further out one is', hs.every((h, i) => !i || h > hs[i - 1]) && hs[0] < 0.6 && hs[6] > 2.2, hs.map((h) => h.toFixed(2)).join(' → ') + ' m (a breaker, from the line to the tip)');
  const low = heightAt(m, 40, m.dir * W.half), high = heightAt(m, 40, -m.dir * W.half);
  check('and a crest is lower at one end: half as tall, for a great one', Math.abs(low / high - (1 - W.kinds.monster.tilt)) < 1e-9 && heightAt(w, 40, w.dir * W.half) < heightAt(w, 40, -w.dir * W.half));
  const counts = (wave, s) => heightAt(wave, s, 0) * W.clear >= W.knee;
  const from = (wave) => { for (let s = 0; s <= W.length; s += 0.5) if (counts(wave, s)) return s; return 99; };
  check('lower than the knees a wave only wets: breakers matter from the beach, rollers a step or two out, the ripples only half-way out', from(w) === 0 && from(r) <= 5 && from(ri) > 18 && from(ri) < 34, `rollers from ${from(r)} m out, ripples from ${from(ri)} m`);
  const apex = (W.jump * W.jump) / (2 * W.g), twice = apex + (W.again * W.again) / (2 * W.g);
  const out = (wave, end, lift) => { for (let s = 0; s <= W.length; s += 0.5) if (heightAt(wave, s, end * W.half) * W.clear > lift) return s; return 99; };
  check('a jump goes a little over a metre up, two of them two metres: enough for a breaker at its high end until the last ten metres, for a great one at its low end only', apex > 1 && twice > 1.9 && out(w, -w.dir, twice) > W.length - 14 && out(m, -m.dir, twice) < W.length * 0.75 && out(m, m.dir, twice) > W.length - 6, `${apex.toFixed(2)} m and ${twice.toFixed(2)} m; a breaker's high end is out of reach from ${out(w, -w.dir, twice)} m out, a great one's from ${out(m, -m.dir, twice)} m (its low end from ${out(m, m.dir, twice)} m)`);
}
{
  // ---- what the sea does to one
  const still = []; for (let k = 0; k < 16; k++) still.push(botWade(1000 + k * 37.3, 600, (st, o) => { o.side = 0; o.jump = false; return o; }));
  check('who wades in and stands there is carried off within half a minute — but not while wading in', still.every((r) => r.over && r.time > W.grace * 1000 && r.time < 30000), still.map((r) => `${(r.time / 1000).toFixed(0)} s`).join(' · '));
  // a roller near the beach only wets; further out it carries one off, unless jumped
  const nr = lone('roller', 7000);
  const nri = lone('ripple', 7000);
  const wet = meet(facing(nri, 10), nri), hit = meet(facing(nr, 18), nr), over = meet(facing(nr, 18), nr, (st, i, t) => { i.jump = t < 0.31 && st.h <= 0; });
  check('a ripple ten metres out only wets; a roller eighteen metres out carries off who stands there, and is cleared by a jump in time', wet.some((e) => e.type === 'wet') && !wet.some((e) => e.type === 'out') && hit.some((e) => e.type === 'out' && e.kind === 'roller') && over.some((e) => e.type === 'clear') && !over.some((e) => e.type === 'out'));
  // a breaker forty metres out, at its high end: one jump is not enough, two are
  const nb = lone('breaker', 7000), wb = waveOf(nb), hi = -wb.dir * W.half;
  const one = meet(facing(nb, 40, 1.6, hi), nb, (st, i, t) => { i.jump = t < 0.31 && st.h <= 0; });
  const two = meet(facing(nb, 40, 1.6, hi), nb, (st, i, t) => { i.jump = (t < 0.56 && st.h <= 0) || (t < 0.3 && st.h > 0 && !st.twice); });
  check('forty metres out a breaker at its high end is too tall for one jump, not for two', one.some((e) => e.type === 'out') && two.some((e) => e.type === 'clear') && !two.some((e) => e.type === 'out'), `${heightAt(wb, 40, hi).toFixed(2)} m tall there`);
  // a great one forty-five metres out: its high end cannot be jumped, its low end can
  const nm = lone('monster', 7000), wm = waveOf(nm), best = (st, i, t) => { i.jump = (t < 0.56 && st.h <= 0) || (t < 0.3 && st.h > 0 && !st.twice); };
  const top = meet(facing(nm, 45, 1.6, -wm.dir * W.half), nm, best), bottom = meet(facing(nm, 45, 1.6, wm.dir * W.half), nm, best);
  check('forty-five metres out a great one swallows whoever jumps it at its high end, and is cleared at its low end', top.some((e) => e.type === 'out' && e.kind === 'monster') && bottom.some((e) => e.type === 'clear' && e.kind === 'monster') && !bottom.some((e) => e.type === 'out'), `${heightAt(wm, 45, -wm.dir * W.half).toFixed(2)} m at one end, ${heightAt(wm, 45, wm.dir * W.half).toFixed(2)} m at the other`);
  // two on beats running: a jump for the first, the second jump for the second
  let np = 7000; while (!(waveOf(np).on && waveOf(np + 1).on && waveOf(np).kind === 'roller' && waveOf(np + 1).kind === 'roller')) np++;
  const pairSt = facing(np, 35), input = { side: 0, jump: false }, got = [];
  for (let k = 0; k < 900 && !pairSt.over && pairSt.next <= np + 1; k++) { botInput(pairSt, input); const ev = []; stepWade(pairSt, W.step, input, ev); got.push(...ev); }
  check('two rollers on beats running are cleared with a jump and a second one in the air', got.filter((e) => e.type === 'clear').length === 2 && got.some((e) => e.type === 'again') && !pairSt.over);
}
{
  // ---- the wader that plays by itself
  const runs = []; for (let k = 0; k < 16; k++) runs.push(botWade(1000 + k * 37.3, 900));
  const times = runs.map((r) => r.time).sort((a, b) => a - b), least = times[0], most = times[times.length - 1];
  check('the wader that plays by itself holds two minutes, whenever it wades in, fifty metres out and more', runs.every((r) => r.over && r.time > 110000 && r.s > 46), runs.map((r) => `${(r.time / 1000).toFixed(0)} s`).join(' · '));
  check('and nobody holds for ever: towards the tip the sea asks for more than two jumps can give', most < 200000, `${(least / 1000).toFixed(0)} to ${(most / 1000).toFixed(0)} s; carried off by ${[...new Set(runs.map((r) => r.cause))].join(', ')}`);
  const hammer = []; for (let k = 0; k < 16; k++) hammer.push(botWade(1000 + k * 37.3, 900, naiveInput));
  const mid = (a) => a.map((r) => r.time).sort((x, y) => x - y)[a.length >> 1];
  check('who only hammers the jump does not get far: the jump has to be timed', mid(hammer) < 25000 && hammer.every((r) => r.over && r.time < least), `${(mid(hammer) / 1000).toFixed(0)} s for the one in the middle`);
  const at = (dt) => { const st = startWade(1234.5), input = { side: 0, jump: false }; let acc = 0; for (let t = 0; t < 400 && !st.over; t += dt) { acc += dt; while (acc >= W.step && !st.over) { acc -= W.step; botInput(st, input); stepWade(st, W.step, input, null); } } return st.time; };
  check('the same wade at 30 and at 144 frames a second', at(1 / 30) === at(1 / 144) && at(1 / 30) > 0);
  const list = ahead(startWade(5000), 30);
  check('what comes is known half a minute ahead: the wader reads the sea', list.length > 2 && list.every((w, i) => !i || w.t > list[i - 1].t));
  console.log(`      for the board of scores: waves: { order: 'desc', min: ${Math.round(W.grace * 1000)}, max: 300_000 }`);
}
done();
