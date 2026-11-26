// Checks of Big Tsunami, without a browser: the bank of sand lies just off the north beach, over shallow sea, a
// lagoon behind it, clear of the pier and of the game that hangs to the north; the sea is the same for
// everybody, and has a mood that goes round in two and a half minutes; every kind of wave can be passed by its
// move; a wave that catches one carries one back, the further the taller it stood, and only off the back of the
// bank is the run over; who stands still is carried off in a few seconds; the runner that plays by itself holds
// the building sea and is beaten by the wild one.
// usage: node tools/waves-test.mjs
import { check, done, ground } from './lib/check.mjs';
import { BOARDS as SERVER } from '../server/scores.js';
import { PIER, ISLAND } from '../src/world/layout/layout.js';
import { WAVES, BOARD, seaOf, seaAt, crestAt, heightAt, mood, moodLine, startRun, stepRun, bankAt, ahead, botInput, botRun, stillInput, hammerInput } from '../src/world/zones/games/waves/rules.js';

const W = WAVES, K = W.kinds, C = W.cycle, height = await ground();
const BASE = 12000000; // a cycle of the sea, somewhere in the time of the world
const T1 = W.jump / W.g, T2 = W.again / W.g, DEEP = W.front - W.back;
const SEA = []; for (let c = BASE; c < BASE + 6; c++) SEA.push(...seaOf(c));
const tauOf = (w) => w.t - Math.floor(w.t / C) * C;
const find = (kind, ok = () => true) => SEA.find((w) => w.kind === kind && ok(w));
/** A runner at (s, u), long past getting ready, with the wave `w` due there in `lead` seconds — and no other wave to do with (but those `keep` names). */
const facing = (w, s, u, lead = 1.5, keep = (o) => o.id === w.id) => {
  const st = startRun(0, u), now = w.t - (s + w.v * lead - W.front - w.k * u) / w.v;
  st.s = s; st.clock = 30; st.t0 = now - 30;
  for (const o of seaAt(now, [], 8, 8)) if (!keep(o)) st.seen.add(o.id);
  return st;
};
/** Plays a run until the wave `w` has gone by and `more` seconds after, or the run is over; `drive(st, input, t)` presses the keys (t: s until its crest is on one). Returns what happened. */
const meet = (st, w, drive, more = 0) => {
  const input = { x: 0, y: 0, jump: false }, seen = [];
  let left = -1;
  for (let k = 0; k < 1500 && !st.over; k++) {
    input.x = 0; input.y = 0; input.jump = false;
    drive?.(st, input, (crestAt(w, st.t0 + st.clock, st.u) - st.s) / w.v);
    stepRun(st, W.step, input, seen);
    if (st.seen.has(w.id)) { if (left < 0) left = more; if ((left -= W.step) < 0) break; }
  }
  return seen;
};
const has = (ev, type, kind) => ev.some((e) => e.type === type && (!kind || e.kind === kind));
const hop = (st, i, t) => { i.jump = st.h <= 0 && t <= T1; }; // (so as to be at the top over the crest)
const two = (st, i, t) => { i.jump = (st.h <= 0 && t <= T1 + T2) || (st.h > 0 && !st.twice && t <= T2); };
/** What a wave does to who stands at (s, u): { push (m carried), wash (m pulled out again), up (s until on one's feet), over, hit (the event) }. */
const caught = (w, s, u, keep) => {
  const st = facing(w, s, u, 1.2, keep), ev = [], input = { x: 0, y: 0, jump: false };
  let low = s, at = -1, up = -1;
  for (let k = 0; k < 600 && !st.over; k++) { stepRun(st, W.step, input, ev); if (at < 0 && has(ev, 'hit')) at = st.clock; if (st.s < low) low = st.s; if (up < 0 && has(ev, 'up')) up = st.clock - at; }
  return { push: s - low, wash: st.s - low, up, over: st.over, hit: ev.find((e) => e.type === 'hit'), hits: ev.filter((e) => e.type === 'hit'), cause: st.cause, st };
};
const mid = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];

{
  // ---- where it is
  const gate = bankAt(-7, 0), root = bankAt(0, 0), h = (s, u) => { const p = bankAt(s, u); return height(p.x, p.z); };
  const under = [], lagoon = [];
  for (const s of [W.back, (W.back + W.front) / 2, W.front]) for (const u of [-W.half, 0, W.half]) under.push(h(s, u));
  for (const u of [-6, -3, 3, 6]) lagoon.push(h(3.5, u));
  check('a bank sixteen metres wide and nine deep, just off the beach: the arch on dry sand, the root at the water\'s edge', W.half * 2 === 16 && DEEP === 9 && h(-7, 0) > 0.2 && Math.abs(h(0, 0)) < 0.5, `the arch ${h(-7, 0).toFixed(2)} m over the sea at (${gate.x.toFixed(0)}, ${gate.z.toFixed(0)}), the root ${h(0, 0).toFixed(2)} m at (${root.x}, ${root.z})`);
  check('the bank stands on the bed of a shallow sea, and there is water behind it: the lagoon', under.every((y) => y < -0.3 && y > -1.5) && lagoon.every((y) => y < -0.2), `the bed ${(-Math.max(...under)).toFixed(1)} to ${(-Math.min(...under)).toFixed(1)} m down under the bank, ${(-Math.max(...lagoon)).toFixed(1)} m and more in the lagoon`);
  // (the head of the pier: 72 to 132 m along it, 24 m to each side; the rock of the island: within 38 m of its middle; another game hangs at (84, -84))
  const c = Math.cos(PIER.heading), sn = Math.sin(PIER.heading), toPier = (p) => { const dx = p.x - PIER.rootX, dz = p.z - PIER.rootZ, along = dx * c + dz * sn, side = -dx * sn + dz * c; return Math.hypot(Math.max(0, 72 - along, along - 132), Math.max(0, Math.abs(side) - 24)); };
  let pier = 999, island = 999, other = 999, north = 999;
  for (let s = W.end - 1.5; s <= W.far + 3; s += 0.5) for (const u of [-W.half - W.reach, W.half + W.reach]) { const p = bankAt(s, u); pier = Math.min(pier, toPier(p)); island = Math.min(island, Math.hypot(p.x - ISLAND.x, p.z - ISLAND.z)); other = Math.min(other, Math.hypot(p.x - 84, p.z + 84)); north = Math.min(north, p.z); }
  north = Math.min(north, gate.z - 2, bankAt(W.back - 1, -W.half - 1.5).z);
  check('bank and waves keep south of z = -70, clear of the head of the pier, of the island and of the game that hangs to the north', north > -70 && pier > 8 && island > 42 && other > 15, `the northernmost at z = ${north.toFixed(1)}; ${pier.toFixed(0)} m from the head of the pier, ${island.toFixed(0)} m from the middle of the island, ${other.toFixed(0)} m from (84, -84)`);
}
{
  // ---- the sea: the same for everybody, with a mood that goes round
  const clock = BASE * C + 77.7, a = seaAt(clock, []), b = seaAt(clock, []);
  const one = startRun(clock - 20), other = startRun(clock - 3.3); one.clock = 20; other.clock = 3.3; other.s = one.s;
  const seenA = ahead(one, 4).map((e) => `${e.w.id}:${e.t.toFixed(4)}`), seenB = ahead(other, 4).map((e) => `${e.w.id}:${e.t.toFixed(4)}`);
  check('the sea goes by the clock of the world: the same waves for everybody, whenever one began', a.length > 3 && a.every((w, i) => w === b[i]) && seenA.length > 1 && seenA.join() === seenB.join(), `${a.length} waves on the sea at once; two runners who began 17 s apart have the same ${seenA.length} ahead`);
  const names = [5, 50, 110, 140].map((tau) => mood(BASE * C + tau).name);
  check('its mood goes round in two and a half minutes: flat (the lull), building, wild, the great ones — and the arch says it', C === 150 && names.join() === 'flat,building,wild,great ones' && moodLine(BASE * C + 60) === 'the sea: building, wild in 40 s' && moodLine(BASE * C + 149.5) === 'the sea: great ones, a lull in 1 s', `${names.join(' → ')}; at second 60: "${moodLine(BASE * C + 60)}"`);
  // the lull: nothing on the bank from the last great one of a cycle to the first wave of the next
  const cycles = [0, 1, 2, 3, 4, 5].map((k) => SEA.filter((w) => Math.floor(w.t / C) === BASE + k));
  const quiet = cycles.slice(1).map((sea, k) => (sea[0].t - (W.front - W.back) / sea[0].v * 0) - (Math.max(...cycles[k].map((w) => w.t + DEEP / w.v))));
  check('the lull: the bank lies quiet for a quarter of a minute, and no wave is on it before the lull is over', quiet.every((q) => q > 13 && q < 22) && SEA.every((w) => tauOf(w) - Math.abs(w.k) * W.half / w.v >= W.lull), `${quiet.map((q) => q.toFixed(1)).join(', ')} s between the last crest off the bank and the next on it`);
  const gapIn = (from, to) => { const ts = SEA.filter((w) => tauOf(w) >= from && tauOf(w) < to).length; return ((to - from) * 6) / ts; };
  const early = gapIn(W.lull, W.lull + 30), late = gapIn(W.wild + 5, W.cycle - 5);
  check('it builds: a wave every second and a half when it begins, twice as many when it is wild', early > 1.2 && early < 2 && late < early * 0.6, `one every ${early.toFixed(2)} s in the first half-minute, every ${late.toFixed(2)} s when wild`);
  const greats = cycles.map((sea) => sea.filter((w) => w.kind === 'great'));
  check('a great one somewhere in the building part, the sea quiet before it; three to end the cycle, each with its gap on the other half of the bank', greats.every((g) => g.length === 4 && tauOf(g[0]) < W.wild && g.slice(1).every((w, i) => tauOf(w) >= W.greats && (i === 0 || w.gap * g[i].gap < 0)))
    && cycles.every((sea) => { const g = sea.find((w) => w.kind === 'great'), before = sea[sea.indexOf(g) - 1]; return g.t - before.t >= K.great.quiet[0] - 1e-6; }), greats[0].map((w) => `second ${tauOf(w).toFixed(0)} (gap at ${w.gap.toFixed(1)})`).join(', '));
  const kinds = {}; for (const w of SEA) { const k = w.set ? (w.of === 2 ? 'two' : 'three') : w.kind; kinds[k] = (kinds[k] || 0) + 1 / (w.set ? w.of : 1); }
  check('five kinds of wave, and the rollers by twos and threes as well', ['roller', 'sweeper', 'wall', 'breaker', 'great', 'two', 'three'].every((k) => kinds[k] >= 6), `in six cycles: ${Object.entries(kinds).map(([k, v]) => `${Math.round(v)} ${k}`).join(', ')}`);
  // never unfair: wherever one stands, two crests are not on one at once
  let close = 99;
  for (const sea of cycles.slice(0, 3)) for (const s of [W.back + 0.5, 10.5, W.front - 0.5]) for (const u of [-7.5, -4, 0, 4, 7.5]) {
    const ts = sea.map((w) => w.t + (W.front - s + w.k * u) / w.v).sort((x, y) => x - y);
    for (let i = 1; i < ts.length; i++) close = Math.min(close, ts[i] - ts[i - 1]);
  }
  check('wherever one stands, two crests are never on one at once: a quarter of a second between them at the least', close >= 0.25, `${close.toFixed(2)} s at the closest (a fast one catching up with a slow one at the back of the bank)`);
}
{
  // ---- how tall, how fast
  const r = find('roller'), wl = find('wall'), br = find('breaker'), gr = find('great'), sw = find('sweeper');
  const tall = SEA.filter((w) => w.kind === 'wall' || w.kind === 'breaker').map((w) => w.h), lo = Math.min(...tall), hi = Math.max(...tall);
  const apex = (W.jump * W.jump) / (2 * W.g), twice = apex + (W.again * W.again) / (2 * W.g);
  check('tall waves are really tall: walls and breakers of 2.6 to 3.7 m, a great one of 4.6 m — a jump goes a metre and a quarter up, two of them 2.36 m', lo >= 2.6 && hi <= 3.75 && hi > 3.3 && gr.h === 4.6 && Math.abs(apex - 1.245) < 0.01 && twice > 2.3 && twice < 2.4, `walls and breakers ${lo.toFixed(2)} to ${hi.toFixed(2)} m; a jump ${apex.toFixed(2)} m, two ${twice.toFixed(2)} m`);
  const across = [W.far - 5, W.front + 8, W.front, 10.5, W.back, 3].map((s) => heightAt(wl, s, -wl.dir * 3));
  check('a wave rises out of the sea, stands tallest on the front edge of the bank, loses a third crossing it and dies in the lagoon', across[0] < across[1] && across[1] < across[2] && Math.abs(across[4] / across[2] - 2 / 3) < 1e-9 && across[3] < across[2] && across[5] < across[4] * 0.3 && heightAt(wl, W.end, 0) === 0, `a wall: ${across.map((x) => x.toFixed(2)).join(' → ')} m`);
  check('small ones are quick, huge ones slow — and every one is seen coming for four seconds and more', r.v > sw.v && sw.v > br.v && br.v > wl.v && wl.v > gr.v && (W.far - W.front) / r.v > 4, `${[r, sw, br, wl, gr].map((w) => `${w.kind} ${w.v} m/s`).join(', ')}: ${((W.far - W.front) / r.v).toFixed(1)} to ${((W.far - W.front) / gr.v).toFixed(1)} s from where they rise to the bank`);
  check('a wall has one low end, a breaker stops short, a great one has one gap — the only place where it is not too tall for two jumps, even at the back of the bank',
    heightAt(wl, W.front, wl.dir * (W.half - 1)) < 1 && heightAt(wl, W.front, -wl.dir * W.half) > 2.5 && SEA.filter((w) => w.kind === 'breaker').every((w) => { let free = 0; for (let u = -W.half; u <= W.half; u += 0.25) if (heightAt(w, W.front, u) < W.knee) free += 0.25; return free >= 3.5; })
    && heightAt(gr, W.back, gr.gap + 3) * W.clear > twice && heightAt(gr, W.front, gr.gap) < 0.8, `a wall ${heightAt(wl, W.front, -wl.dir * W.half).toFixed(2)} m, ${heightAt(wl, W.front, wl.dir * (W.half - 1)).toFixed(2)} m at its low end; a great one ${heightAt(gr, W.back, gr.gap + 3).toFixed(2)} m at the back of the bank, ${heightAt(gr, W.front, gr.gap).toFixed(2)} m in its gap`);
}
{
  // ---- every kind is passed by its move
  const r = find('roller', (w) => !w.set);
  const still = meet(facing(r, 12.5, 0), r), hopped = meet(facing(r, 12.5, 0), r, hop);
  check('a roller: it knocks down who stands there, and is hopped', has(still, 'hit', 'roller') && has(hopped, 'clear', 'roller') && !has(hopped, 'hit'));
  const sw = find('sweeper', (w) => w.h < 1.3), sweep = (crestAt(sw, 0, 6) - crestAt(sw, 0, -6)) / sw.v;
  const left = meet(facing(sw, 12.5, -6), sw, hop), right = meet(facing(sw, 12.5, 6), sw, hop), early = meet(facing(sw, 12.5, 6), sw, (st, i, t) => { i.jump = st.h <= 0 && t <= T1 + Math.abs(sweep); });
  check('a sweeper: its crest comes at an angle and is on one side of the bank before the other; a hop in time for where one stands', Math.abs(sweep) > 0.6 && has(left, 'clear') && !has(left, 'hit') && has(right, 'clear') && !has(right, 'hit') && has(early, 'hit'), `${Math.abs(sweep).toFixed(2)} s from six metres left to six metres right; who jumps when it is on the other side is caught`);
  const wl = find('wall'), tallU = -wl.dir * 3, lowU = wl.dir * (W.half - 1);
  const once = meet(facing(wl, 9.5, tallU), wl, hop), both = meet(facing(wl, 9.5, tallU), wl, two), low = meet(facing(wl, 12.5, lowU), wl, hop), front = meet(facing(find('wall', (w) => w.h > 3), W.front - W.edge, 0), find('wall', (w) => w.h > 3), two);
  check('a wall: one jump is not enough, two are from the back half of the bank — or a hop at its low end; at the front edge the tall ones are too much even for two', has(once, 'hit', 'wall') && has(both, 'clear', 'wall') && !has(both, 'hit') && has(low, 'clear', 'wall') && !has(low, 'hit') && has(front, 'hit'), `${wl.h.toFixed(2)} m at the front edge, ${heightAt(wl, 9.5, tallU).toFixed(2)} m where it was jumped`);
  const br = find('breaker', (w) => w.a > -90 && w.b > 90), inU = Math.max(br.a + 2.5, -W.half + 1), outU = br.a - 2;
  const inside = meet(facing(br, 12.5, inU), br, hop), beside = meet(facing(br, 12.5, outU), br), round = meet(facing(br, 12.5, inU), br, (st, i) => { i.x = st.u > outU ? -1 : 0; });
  check('a breaker: it covers a part of the width — a hop does nothing against it, and one runs round it without a jump', has(inside, 'hit', 'breaker') && has(beside, 'clear', 'breaker') && !has(beside, 'hit') && has(round, 'clear') && !has(round, 'hit') && !has(round, 'jump'), `from ${br.a.toFixed(1)} m to the right-hand end; run round from ${(inU - br.a).toFixed(1)} m inside it`);
  const gr = find('great'), gapU = gr.gap, awayU = gr.gap > 0 ? gr.gap - 4 : gr.gap + 4;
  const over = meet(facing(gr, W.back + 0.6, awayU), gr, two), through = meet(facing(gr, 12.5, gapU), gr, hop), idle = meet(facing(gr, 12.5, gapU), gr);
  check('a great one: two jumps are not enough anywhere, not even at the back of the bank; one gets through its gap, with a hop', has(over, 'hit', 'great') && has(through, 'clear', 'great') && !has(through, 'hit') && has(idle, 'hit'), `its gap at ${gapU.toFixed(1)} m`);
  const set = find('roller', (w) => w.set === 1 && w.of === 3), ids = [set.id, set.id + 1, set.id + 2], lastOf = SEA.find((w) => w.id === set.id + 2), list = [];
  const rope = meet(facing(set, 12.5, 0, 1.5, (o) => ids.includes(o.id)), lastOf, (st, i) => { const next = ahead(st, 2, list)[0]; i.jump = st.h <= 0 && !!next && next.t <= T1; });
  check('three rollers close together, like a skipping rope: a hop for each, on the beat', rope.filter((e) => e.type === 'clear').length === 3 && rope.filter((e) => e.type === 'jump').length === 3 && !has(rope, 'hit') && !has(rope, 'again'), `${(lastOf.t - set.t).toFixed(2)} s from the first to the third; a hop lasts ${(2 * T1).toFixed(2)} s`);
}
{
  // ---- what a wave does to who is caught
  const r = find('roller', (w) => !w.set), wl = find('wall'), gr = find('great');
  const small = caught(r, 10.5, 0), big = caught(wl, 12.5, -wl.dir * 3);
  check('a wave that catches one does not end the run: a roller carries one a metre or two towards the beach, a wall half the bank', !small.over && !big.over && small.push > 1 && small.push < 2.2 && big.push > 3.6 && big.push < 5.6 && big.push > small.push * 2 && Math.abs(small.hit.push - W.carry * small.hit.H) < 1e-9, `${small.push.toFixed(2)} m for a roller of ${small.hit.H.toFixed(2)} m, ${big.push.toFixed(2)} m for a wall of ${big.hit.H.toFixed(2)} m (the bank is ${DEEP} m deep)`);
  check('then the backwash pulls one out again a little, and one is on one\'s feet after a second or so', small.wash > 0.3 && small.wash < 1.2 && big.wash > 0.4 && small.up > 0.8 && small.up < 1.3 && big.up > small.up && big.up < 1.8, `${small.wash.toFixed(2)} and ${big.wash.toFixed(2)} m back out; up after ${small.up.toFixed(2)} and ${big.up.toFixed(2)} s`);
  const set = find('roller', (w) => w.set === 1 && w.of === 2), pair = caught(set, 12.5, 0, (o) => o.id === set.id || o.id === set.id + 1);
  check('a wave that finds one down carries one on, three quarters as far', pair.hits.length === 2 && Math.abs(pair.hits[1].push / (W.carry * pair.hits[1].H) - W.lying) < 1e-9 && !pair.over, `${pair.hits.map((e) => e.push.toFixed(2)).join(' + ')} m`);
  const last = caught(r, W.back + 0.8, 0), saved = meet(facing(r, W.back + 0.8, 0), r, hop, 1);
  check('off the back of the bank the run is over — at the back one mistake is the last, and the same roller hopped is nothing', last.over && last.cause === 'roller' && last.st.time === Math.round(last.st.clock * 1000) && last.st.s < W.back && !has(saved, 'out') && !has(saved, 'hit'), `a roller of ${last.hit.H.toFixed(2)} m, ${0.8} m from the back edge`);
  const fromMid = caught(gr, 10.5, gr.gap > 0 ? gr.gap - 5 : gr.gap + 5), fromFront = caught(gr, W.front - W.edge, gr.gap > 0 ? gr.gap - 5 : gr.gap + 5);
  check('where one stands is what one has left: a great one takes one off the bank from its middle, and leaves one on it — just — from its front edge', fromMid.over && !fromFront.over && fromFront.st.s - W.back < 2.6, `from the front edge: carried ${fromFront.push.toFixed(1)} m, ${(fromFront.st.s - W.back).toFixed(1)} m of sand left`);
}
{
  // ---- how one moves
  const st = startRun(BASE * C + 1), input = { x: 1, y: 1, jump: false }, ev = [];
  for (let k = 0; k < 24; k++) stepRun(st, W.step, input, ev);
  const speed = Math.hypot(st.vs, st.vu);
  input.x = 0; input.y = 0; input.jump = true; stepRun(st, W.step, input, ev); input.jump = false;
  let top = 0, u0 = st.u; for (let k = 0; k < 200 && st.h > 0; k++) { if (Math.abs(st.vh) < W.g * W.step && !st.twice) { input.jump = true; } input.x = -1; stepRun(st, W.step, input, ev); input.jump = false; top = Math.max(top, st.h); }
  check('one runs anywhere on the bank at 6.5 m/s, at once; a jump, a second one in the air, and one steers in the air', Math.abs(speed - W.run) < 1e-6 && Math.abs(st.vs) < 1e-6 && top > 2.3 && has(ev, 'again') && has(ev, 'land') && u0 - st.u > 3, `${speed.toFixed(2)} m/s after a fifth of a second; ${top.toFixed(2)} m up with two jumps, ${(u0 - st.u).toFixed(1)} m aside meanwhile`);
  const edge = (x, y) => { const s2 = startRun(BASE * C + 1), i = { x, y, jump: false }; for (let k = 0; k < 360; k++) stepRun(s2, W.step, i, null); return s2; }; // (three seconds: still getting ready, or in the lull)
  const b = edge(0, -1), f = edge(0, 1), l = edge(-1, 0), rg = edge(1, 0);
  check('one does not run off the bank: only a wave takes one off, and only off the back', !b.over && Math.abs(b.s - (W.back + W.edge)) < 1e-6 && Math.abs(f.s - (W.front - W.edge)) < 1e-6 && Math.abs(l.u + W.half - W.edge) < 1e-6 && Math.abs(rg.u - W.half + W.edge) < 1e-6);
}
{
  // ---- who does nothing, who only jumps
  const still = [], hammer = [], lull = [];
  for (let k = 0; k < 60; k++) { const t0 = BASE * C + 7 * C + k * 31.7, m = mood(t0 + W.grace); if (m.name === 'flat' || m.tau > C - 16) continue; still.push(botRun(t0, 120, stillInput)); hammer.push(botRun(t0, 120, hammerInput)); }
  for (let c = 8; c < 12; c++) lull.push(botRun((BASE + c) * C + 1, 120, stillInput));
  const ts = still.map((x) => x.time / 1000), worst = Math.max(...ts);
  check('who stands there is carried off within ten seconds or so, whatever the mood of the sea — but for the lull', still.every((x) => x.over && x.time >= BOARD.min) && mid(ts) < 10 && worst < 17, `${still.length} starts: ${mid(ts).toFixed(1)} s for the one in the middle, ${worst.toFixed(1)} s at the most (getting ready, ${W.grace} s, counted in)`);
  check('in the lull nothing happens to who stands there, until the sea builds again', lull.every((x) => x.over && x.time > (W.lull - 1) * 1000 && x.time < 40000), lull.map((x) => `${(x.time / 1000).toFixed(0)} s`).join(' · '));
  check('who only hammers the jump does not last either: the jump has to be timed, and one has to move', mid(hammer.map((x) => x.time)) < 14000 && hammer.every((x) => x.over), `${(mid(hammer.map((x) => x.time)) / 1000).toFixed(1)} s for the one in the middle`);
}
{
  // ---- the runner that plays by itself
  const fromLull = [], building = [], any = [];
  for (let c = 20; c < 44; c++) fromLull.push(botRun((BASE + c) * C, 400));
  for (let c = 50; c < 62; c++) for (let tau = 15; tau <= 75; tau += 15) building.push({ tau, run: botRun((BASE + c) * C + tau, 400) });
  for (let k = 0; k < 40; k++) any.push(botRun((BASE + 70) * C + k * 47.3, 400));
  const held = fromLull.map((x) => x.time / 1000), reach = building.filter((x) => x.tau + x.run.time / 1000 >= W.wild).length, beaten = fromLull.filter((x) => x.over && x.time / 1000 < C).length;
  check('the runner that plays by itself holds the building sea: begun in the lull, a minute and a half and more; begun anywhere in the building part, it is still there when the sea goes wild', mid(held) > 100 && held.filter((t) => t >= 90).length >= fromLull.length * 0.9 && reach >= building.length * 0.9, `from the lull: ${Math.min(...held).toFixed(0)} to ${Math.max(...held).toFixed(0)} s, ${mid(held).toFixed(0)} s for the one in the middle; from the building part: ${reach} of ${building.length} reach the wild sea`);
  check('and the wild sea beats it: holding through the end of a cycle is a feat', beaten >= fromLull.length * 0.9, `${beaten} of ${fromLull.length} are carried off before the next lull, by ${[...new Set(fromLull.map((x) => x.cause))].join(', ')}`);
  const long = any.filter((x) => !x.over || x.time > 180000).length, most = Math.max(...any.map((x) => x.time)), least = Math.min(...any.map((x) => x.time));
  check('whenever it begins, its run is over within three minutes — and never before it was ready', long === 0 && least >= BOARD.min, `${any.length} starts round the clock: ${(least / 1000).toFixed(0)} to ${(most / 1000).toFixed(0)} s, ${(mid(any.map((x) => x.time)) / 1000).toFixed(0)} s for the one in the middle`);
  const at = (dt) => { const st = startRun((BASE + 20) * C + 40), input = { x: 0, y: 0, jump: false }; let acc = 0; for (let t = 0; t < 400 && !st.over; t += dt) { acc += dt; while (acc >= W.step && !st.over) { acc -= W.step; botInput(st, input); stepRun(st, W.step, input, null); } } return st.time; };
  check('the same run at 30 and at 144 frames a second', at(1 / 30) === at(1 / 144) && at(1 / 30) > 0, `${(at(1 / 30) / 1000).toFixed(1)} s`);
  // ---- its line for the boards of scores
  const line = `waves: { order: '${BOARD.order}', min: ${BOARD.min}, max: ${String(BOARD.max).replace(/\B(?=(\d{3})+$)/g, '_')} }`;
  check('its line for the boards of scores: how long one held, the longer the better; no run is shorter than getting ready, and six cycles of the sea are room enough', BOARD.order === 'desc' && BOARD.min === Math.round(W.grace * 1000) && BOARD.max === 6 * C * 1000 && most < BOARD.max, line);
  { const S = SERVER.waves || {}; check('the server keeps its board by the same line (server/scores.js), behind its switch', S.order === BOARD.order && S.min === BOARD.min && S.max === BOARD.max && S.release === 'waves' && S.each === 1 && S.unit === 'time', JSON.stringify(S)); }
  console.log(`      for the board of scores: ${line}`);
}
done();
