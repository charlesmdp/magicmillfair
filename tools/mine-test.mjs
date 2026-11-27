// Checks of Little Mine Train (the game `mine`), without a browser: the line is a loop of a kilometre from a
// station at the foot of the west mountains and back — in the open it runs over the ground, clear of the trees;
// its tunnels are under the ground; it stands away from what the valley has there already; one leans, brakes
// and hops as the rules say; a driver with a person's limits gets round without leaving the rails, a clumsy one
// leaves them a few times and still gets home, and who does nothing is off at the first sharp bend.
// usage: node tools/mine-test.mjs [--plan]     (its last line is its line for server/scores.js; --plan: the line, every ten metres, over the ground of the world)
import fs from 'node:fs';
import path from 'node:path';
import { ground, ROOT } from './lib/check.mjs';
import { BOUNDS } from '../src/world/layout/layout.js';
import { MINE, course, railAt, stretchAt, startRun, stepRun, cartPose, heatOf, botInput, naiveInput, botRun } from '../src/world/zones/games/mine/rules.js';

const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
let line = '';
const M = MINE, C = course(), L = C.length, F = C.fork, height = await ground();
const T = new Float32Array(fs.readFileSync(path.join(ROOT, 'public/assets/world/trees.bin')).buffer.slice(0));
const trees = (x, z, r) => { let n = 0; for (let i = 0; i + 5 < T.length; i += 6) if ((T[i] - x) ** 2 + (T[i + 1] - z) ** 2 < r * r) n++; return n; };
const inside = (x, z) => { let c = false; for (let i = 0, j = BOUNDS.length - 1; i < BOUNDS.length; j = i++) if ((BOUNDS[j][1] > z) !== (BOUNDS[i][1] > z) && x < ((BOUNDS[i][0] - BOUNDS[j][0]) * (z - BOUNDS[j][1])) / (BOUNDS[i][1] - BOUNDS[j][1]) + BOUNDS[j][0]) c = !c; return c; };
const OPEN = new Set(['station', 'open', 'trestle']);
const S = Object.fromEntries(C.stretches.map((q, i) => [q.name, { ...q, to: i + 1 < C.stretches.length ? C.stretches[i + 1].from : L }]));

if (process.argv.includes('--plan')) {
  console.log(`length ${L.toFixed(1)} m · top of the lift ${C.top.toFixed(0)} · fork ${F.s0.toFixed(0)} → ${F.s1.toFixed(0)} (short way ${F.len.toFixed(0)} m) · finish ${C.finish.toFixed(0)}`);
  console.log(C.stretches.map((q) => `${q.name} ${q.from.toFixed(0)}`).join(' · '));
  for (let s = 0; s <= L; s += 10) { const r = railAt(s, 0, {}), g = height(r.x, r.z); console.log(`${String(s).padStart(5)}  ${r.kind.padEnd(8)} x ${r.x.toFixed(0).padStart(5)} z ${r.z.toFixed(0).padStart(5)} y ${r.y.toFixed(1).padStart(6)}  ground ${g.toFixed(1).padStart(6)}  over ${(r.y - g).toFixed(1).padStart(6)}  trees ${trees(r.x, r.z, 4)}  k ${(r.k * 100).toFixed(1).padStart(5)}  free ${C.free[Math.round(s / C.ds)].toFixed(1)}`); }
  { const i0 = C.pts.findIndex((q) => q.of && q.of.name === 'The Deep Line'), i1 = C.pts.findIndex((q, i) => i > i0 && q.of && q.of.name !== 'The Deep Line'), d = (q) => `(${q.x.toFixed(1)}, ${q.z.toFixed(1)}, y ${q.y.toFixed(1)}, heading ${((Math.PI - q.yaw) * 180 / Math.PI).toFixed(0)}°)`; console.log('the link:', (i0 * C.ds).toFixed(0), d(C.pts[i0 - 1]), '→', (i1 * C.ds).toFixed(0), d(C.pts[i1])); }
  console.log('bends', C.bends.map((b) => `${b.s.toFixed(0)}${b.dir > 0 ? 'R' : 'L'}${b.r.toFixed(0)}${b.brake ? '!' : ''}(${b.need.toFixed(2)})`).join(' '));
  console.log('signals', C.signals.map((g) => g.s.toFixed(0)).join(' '));
  for (const kind of ['steady', 'bold', 'clumsy']) { const b = botRun(kind); console.log(kind, JSON.stringify(b)); }
  process.exit(0);
}

/** A train already running, at a place of the line, at a speed. */
const running = (s, v = 10, more = {}) => Object.assign(startRun({ wait: 0 }), { phase: 'run', wait: 0, s, v, stretch: stretchAt(s), save: C.signals.filter((g) => g.s <= s).length - 1 }, more);
/** Runs `secs` with what `drive(st, input, t)` asks; returns the events (with the moment of each). */
const run = (st, secs, drive, stop) => { const input = { x: 0, y: 0, hop: false }, events = [], seen = []; for (let t = 0; t < secs; t += M.step) { drive?.(st, input, t); events.length = 0; stepRun(st, M.step, input, events); seen.push(...events.map((e) => ({ ...e, at: t }))); if (stop?.(st, events)) break; } return seen; };

{
  // ---- the line
  const a = C.pts[0], z = C.pts[C.n - 1], names = C.stretches.map((q) => q.name);
  check('the line is a loop of a kilometre and more: it ends where it began, at the platform, looking the same way', L > 950 && L < 1250 && Math.hypot(a.x - z.x, a.z - z.z) < 0.6 && Math.abs(a.y - z.y) < 0.05 && Math.abs(Math.sin(a.yaw - z.yaw)) < 0.01, `${L.toFixed(0)} m; its two ends ${Math.hypot(a.x - z.x, a.z - z.z).toFixed(2)} m apart`);
  check('eleven stretches, in the order one rides them', names.join() === 'The Station,The Lift,The High Line,The Trestle,The Spiral,The Lantern Tunnel,The Fork,The Drop,The Lake,The Deep Line,The Last Bends,Home' || names.length >= 11, names.join(' · '));
  let low = [99, 0], bad = 0, tall = [0, 0], out = 0, wood = [];
  for (let j = 0; j < C.n; j++) {
    const p = C.pts[j]; if (!OPEN.has(p.kind)) continue;
    out++;
    const over = p.y - height(p.x, p.z), atMouth = [1, 2, 3, 4, 5, 6].some((d) => !OPEN.has(C.pts[Math.max(0, j - d)].kind) || !OPEN.has(C.pts[Math.min(C.n - 1, j + d)].kind));
    if (over + (atMouth ? 0.8 : 0) < low[0]) low = [over + (atMouth ? 0.8 : 0), j * C.ds]; // (at a mouth the rails meet the ground)
    if (over > tall[0]) tall = [over, j * C.ds];
    if (j % 4 === 0 && trees(p.x, p.z, 2.2)) { bad++; wood.push(Math.round(j * C.ds)); }
  }
  check('in the open the line runs over the ground of the world — on low timber, and on a great trestle over the saddle', low[0] > 0.3 && tall[0] > 8 && tall[0] < 26 && out * C.ds > 280, `${(out * C.ds).toFixed(0)} m in the open; lowest ${low[0].toFixed(2)} m over the ground (at ${low[1]} m), highest ${tall[0].toFixed(1)} m (at ${tall[1]} m)`);
  check('no tree stands on it', bad === 0, bad ? `trees within 2.2 m at ${wood.join(', ')} m` : 'none within 2.2 m of the rails in the open');
  // the insides: under the ground — but where the line comes to the surface, at a mouth
  const mouths = []; for (let j = 1; j < C.n; j++) if (OPEN.has(C.pts[j].kind) !== OPEN.has(C.pts[j - 1].kind)) mouths.push(j * C.ds);
  let thin = [99, 0], deep = 0;
  for (let j = 0; j < C.n; j++) {
    const p = C.pts[j]; if (OPEN.has(p.kind)) continue;
    const s = j * C.ds, cover = height(p.x, p.z) - p.y;
    if (cover > deep) deep = cover;
    if (mouths.some((m) => Math.abs(m - s) < 34)) { if (cover < -1.2) thin = [Math.min(thin[0], cover), s]; continue; }
    if (cover < thin[0]) thin = [cover, s];
  }
  check('what is inside the mountain is under its ground: four mouths, and rock over the rails everywhere else', mouths.length === 4 && thin[0] > 3.9, `mouths at ${mouths.map((m) => m.toFixed(0)).join(', ')} m; never less than ${thin[0].toFixed(1)} m of rock over the rails (at ${thin[1]} m), ${deep.toFixed(0)} m at the deepest`);
  let near = [99];
  for (let i = 0; i < C.n; i += 4) for (let j = i + 80; j < C.n; j += 4) { const p = C.pts[i], q = C.pts[j]; if ((p.fork && q.fork) || (i < 80 && j > C.n - 80)) continue; const d = Math.hypot(p.x - q.x, p.z - q.z), dy = Math.abs(p.y - q.y); if (d < 6 && dy < 7 && d + dy < near[0]) near = [d + dy, i * C.ds, j * C.ds]; }
  check('the line never runs into itself: where it passes over itself (the spiral, the mountain over the deep line) there is room between', near[0] > 6.5, near[0] < 99 ? `nearest ${near[0].toFixed(1)} m (at ${near[1]} m and ${near[2]} m)` : 'never within six metres of itself');
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of [...C.pts, ...F.pts]) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  // (what the valley has there already — the Stairway, the Lost Temple, the waterfall, the cars' table, the golf, War Through the Ages and its gate, The Sanctuary)
  const places = { 'the Stairway': [-312, 60], 'the Lost Temple': [-380, 36], 'the waterfall': [-268, 116], "the cars' table": [-243, -56], 'the golf': [-236, -82], 'War Through the Ages': [-259, -19], 'its gate': [-240, -13], 'The Sanctuary': [-189, -124] };
  let close = ['', 999];
  for (const [name, [x, z]] of Object.entries(places)) for (let j = 0; j < C.n; j += 2) { const p = C.pts[j]; if (!OPEN.has(p.kind)) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < close[1]) close = [name, d]; }
  const walked = C.pts.filter((p, j) => OPEN.has(p.kind) && j * C.ds > 200 && j * C.ds < L - 200 && inside(p.x, p.z)).length;
  check('it keeps in the mountains west and north-west of the valley — its high run over ground nobody walks — and away from what the valley has there already', x0 > -445 && x1 < -140 && z0 > -305 && z1 < -20 && close[1] > 11 && walked === 0, `x ${x0.toFixed(0)} … ${x1.toFixed(0)}, z ${z0.toFixed(0)} … ${z1.toFixed(0)}, ${y0.toFixed(0)} … ${y1.toFixed(0)} m over the sea; in the open never nearer than ${close[1].toFixed(0)} m to ${close[0]}`);
  const G = M.gate, here = height(G.x, G.z);
  check('one asks on the meadow before the platform: ground one can walk to, flat, no tree in the way, a few steps from the train', inside(G.x, G.z) && inside(G.x + 3, G.z) && here > 20 && Math.abs(height(G.x + 2, G.z) - here) < 0.6 && trees(G.x, G.z, 2.5) === 0 && Math.hypot(G.x - M.station.x, G.z - (M.station.z - M.wait)) < 12 && Math.abs(M.station.y - here) < 2, `gate at (${G.x}, ${G.z}), ground ${here.toFixed(1)} m; the rails ${(M.station.y - here).toFixed(1)} m higher`);
}
{
  // ---- what is on the line
  const before = (s, kind, way) => C.boards.filter((b) => b.kind === kind && b.s < s && b.s > s - 45 && (way === undefined || b.way === way || b.way === -1)).length;
  const sharp = C.bends.filter((b) => b.need > M.lean.slack + 0.15), noBoard = sharp.filter((b) => !before(b.s + 1, b.dir > 0 ? 'right' : 'left')), hops = [...C.gaps, ...C.rocks], noHop = hops.filter((t) => !before(t.s, 'hop', t.way));
  check('a board before each thing to do: an arrow before every bend that asks for a lean, a brake sign before what is too sharp, a hop sign before every gap and rock, one for the fork', noBoard.length === 0 && noHop.length === 0 && C.boards.some((b) => b.kind === 'brake') && C.boards.filter((b) => b.kind === 'fork').length === 1, `${C.boards.length} boards: ${sharp.length} bends to lean into (${C.bends.filter((b) => b.brake).length} to brake before), ${C.gaps.length} gaps, ${C.rocks.length} rocks`);
  const lead = Math.min(...C.boards.map((b) => (b.to - b.s) / Math.max(8, b.way === 1 ? 12 : C.free[Math.round(Math.max(0, b.s) / C.ds)])));
  check('each board is passed a second and more before what it tells of', lead > 1.0, `${lead.toFixed(2)} s at the least, at the speed the train has by itself`);
  let far = 0; for (let i = 1; i < C.signals.length; i++) far = Math.max(far, C.signals[i].s - C.signals[i - 1].s);
  const tight = C.signals.filter((g) => hops.some((t) => t.way !== 1 && t.s > g.s - 2 && t.s < g.s + 12));
  check('a signal every sixty metres or so, the first at the head of the lift, none just before a gap or a rock', C.signals.length >= 14 && far < 85 && Math.abs(C.signals[0].s - C.top) < 5 && tight.length === 0 && L - C.signals[C.signals.length - 1].s < 90, `${C.signals.length} signals, never more than ${far.toFixed(0)} m apart`);
  const sides = { 0: 0, 1: 0, '-1': 0, 2: 0 }; for (const g of C.nuggets) sides[g.side]++;
  check('nuggets all along: some between the rails, some to lean to, some to hop to', C.nuggets.length >= 30 && sides[0] > 3 && sides[1] > 5 && sides[-1] > 5 && sides[2] > 4 && C.nuggets.every((g, i) => g.id === i), `${C.nuggets.length} nuggets (${sides[0]} between the rails, ${sides[-1]} left, ${sides[1]} right, ${sides[2]} high), ${(C.nuggets.length * M.nugget.give / 1000).toFixed(0)} s to be had`);
  check('the fork: the long way round to the left, the short way straight on — shorter by twenty metres and more, broken twice, a rock between', F.s1 - F.s0 - F.len > 20 && C.gaps.filter((g) => g.way === 1).length === 2 && C.rocks.filter((r) => r.way === 1).length === 1 && Math.hypot(F.pts[F.m].x - railAt(F.s1, 0, {}).x, F.pts[F.m].z - railAt(F.s1, 0, {}).z) < 0.05, `${(F.s1 - F.s0).toFixed(0)} m round, ${F.len.toFixed(0)} m straight on`);
}
{
  // ---- the start, the lift, the speed
  const st = startRun(), ev = run(st, 40, null, (q, e) => e.some((x) => x.type === 'top')), go = ev.find((e) => e.type === 'go'), top = ev.find((e) => e.type === 'top');
  check('a count of three, and the train is hauled out of the station, up the lift and over its head: a quarter of a minute to read the keys', !!go && Math.abs(go.at - M.count) < 0.02 && !!top && top.at - go.at > 11 && top.at - go.at < 18 && st.offs === 0, `${(top.at - go.at).toFixed(1)} s from the platform to where the chain lets go, ${(railAt(C.top, 0, {}).y - M.station.y).toFixed(0)} m higher`);
  const lazy = startRun({ wait: 0 }); run(lazy, 20, (q, inp) => { inp.x = 1; inp.y = -1; inp.hop = true; }, (q) => q.s > C.head - 20);
  const lazy2 = running(C.head + 4, M.haul.over); run(lazy2, 2, (q, inp) => { inp.x = -1; inp.y = -1; inp.hop = true; });
  check('while the chain has it nothing one does matters: one cannot tip, brake or hop there — not on the lift, not round its head', lazy.offs === 0 && lazy.y === 0 && lazy.v > M.haul.lift - 0.5 && lazy2.offs === 0 && lazy2.y === 0 && lazy2.v > M.haul.over - 0.5);
  const hl = S['The High Line'].from + 8, flat = running(hl, 9.5), let_ = running(hl, 9.5), brake = running(hl, 9.5);
  run(flat, 1.5, (q, inp) => { inp.x = -Math.sign(railAt(q.s + 3, 0, {}).k || 0); }); run(let_, 1.5, (q, inp) => { inp.y = 1; inp.x = -Math.sign(railAt(q.s + 3, 0, {}).k || 0) * 0; }); run(brake, 1.5, (q, inp) => { inp.y = -1; });
  check('left to itself the train rolls at its own speed; the stick forward lets it run, the stick back brakes it hard — never to a stand', Math.abs(flat.v - 9.5) < 1.2 && let_.v > flat.v + 1.5 && brake.v < 5 && brake.v >= M.roll.least - 1e-6, `${flat.v.toFixed(1)} m/s by itself, ${let_.v.toFixed(1)} let run, ${brake.v.toFixed(1)} braked (after a second and a half)`);
  const drop = S['The Drop'], fast = running(drop.from - 2, 11); run(fast, 4.2);
  check('the drop into the dark makes it fast: over seventy kilometres an hour at its foot', fast.v > 19 && fast.v <= M.roll.top && fast.offs === 0, `${(fast.v * 3.6).toFixed(0)} km/h`);
}
{
  // ---- the lean
  const sp = S['The Spiral'], at = sp.from + 30, k = railAt(at, 0, {}).k, into = Math.sign(k);
  const upright = running(at, 12), leaning = running(at, 12), wrong = running(at, 12), e1 = run(upright, 3, (q, inp) => { inp.y = 0; }, (q) => q.phase === 'off'), e2 = run(leaning, 3, (q, inp) => { inp.x = into; }, (q) => q.phase === 'off'), e3 = run(wrong, 3, (q, inp) => { inp.x = -into; }, (q) => q.phase === 'off');
  const t1 = e1.find((e) => e.type === 'off'), t3 = e3.find((e) => e.type === 'off');
  check('a bend taken upright at speed tips the cart, and it leaves the rails; leaning into it holds; leaning the wrong way, it is off twice as soon', !!t1 && t1.why === 'tip' && t1.at > 0.4 && leaning.offs === 0 && leaning.tip < 0.05 && !!t3 && t3.at < t1.at * 0.7 && t3.at > 0.2, `the spiral (${(1 / Math.abs(k)).toFixed(0)} m round) at 12 m/s: off after ${t1?.at.toFixed(2)} s upright, ${t3?.at.toFixed(2)} s leaning out, held leaning in`);
  const straight = running(S['The Trestle'].to - 20, 11); run(straight, 0.8, (q, inp) => { inp.x = 1; });
  const slow = running(at, 6.5); run(slow, 3, (q, inp) => { inp.y = -1; });
  check('leaning on a straight costs nothing; and slowly enough, a bend needs no lean at all', straight.offs === 0 && straight.tip === 0 && Math.abs(straight.lean) > 0.9 && slow.offs === 0, `braked to ${slow.v.toFixed(1)} m/s round the spiral, upright`);
  const hot = running(at, 17), cool = running(at, 17); run(hot, 3, (q, inp) => { inp.x = into; }, (q) => q.phase === 'off'); run(cool, 3, (q, inp) => { inp.x = into; inp.y = -1; }, (q) => q.phase === 'off');
  check('too fast, no lean holds: one brakes first', hot.offs === 1 && cool.offs === 0, 'the spiral at 17 m/s: off though leaning in; braking, held');
  const tips = running(at, 12); run(tips, 0.3); const half = tips.tip; run(tips, 1.2, (q, inp) => { inp.x = into; });
  check('a cart that has begun to tip rights itself when one leans in time', half > 0.15 && half < 0.9 && tips.tip < 0.02 && tips.offs === 0, `tipped ${(half * 100).toFixed(0)} % after 0.3 s upright, upright again a second later`);
}
{
  // ---- the hop: gaps and rocks
  const T = (2 * M.hop.up) / M.hop.g, h = running(S['The High Line'].from + 4, 9.5), ev = run(h, 1.2, (q, inp, t) => { inp.hop = t < 0.05; }), land = ev.find((e) => e.type === 'land');
  let apex = 0; { const q = running(S['The High Line'].from + 4, 9.5); run(q, 1, (r, inp, t) => { inp.hop = t < 0.05; if (r.y > apex) apex = r.y; }); }
  check('the button hops the cart: most of a second in the air, a metre high — once for each press', ev.filter((e) => e.type === 'hop').length === 1 && !!land && Math.abs(land.at - T) < 0.03 && apex > 0.8 && apex < 1.0, `${land?.at.toFixed(2)} s, ${apex.toFixed(2)} m`);
  const held = running(S['The High Line'].from + 4, 9.5), e2 = run(held, 2.5, (q, inp) => { inp.hop = true; });
  check('held down, the button hops once: it is pressed, not held', e2.filter((e) => e.type === 'hop').length === 1);
  // for each gap and each rock of the long way, at the speed the steady driver has there: the moments one may press
  const speeds = {}; { const st = startRun({ wait: 0.01 }), inp = { x: 0, y: 0, hop: false }; for (let t = 0; t < 300 && !st.over; t += M.step) { botInput(st, 'steady', inp); stepRun(st, M.step, inp, null); for (const g of [...C.gaps, ...C.rocks]) if (g.way !== 1 && speeds[g.s] === undefined && st.s > g.s - 14) speeds[g.s] = st.v; } }
  let narrow = [9, 0], miss = 0;
  for (const g of [...C.gaps, ...C.rocks].filter((t) => t.way !== 1)) {
    const v = speeds[g.s] || 10, prev = [...C.gaps, ...C.rocks].filter((t) => t.way !== 1 && t.s < g.s - 1).map((t) => t.s + (t.len || 0.4) + 1.5).pop() || 0, s0 = Math.max(g.s - 16, prev); let first = -1, last = -1;
    for (let t = 0; t < 1.9; t += 1 / 60) { const q = running(s0, v); run(q, 2.6, (r, inp, now) => { inp.hop = now >= t && now < t + 0.05; inp.x = Math.sign(railAt(r.s + 2, 0, {}).k) * (Math.abs(railAt(r.s + 2, 0, {}).k) > 0.01 ? 1 : 0); }, (r) => r.phase === 'off' || r.s > g.s + 6); if (q.offs === 0) { if (first < 0) first = t; last = t; } }
    if (first < 0) miss++; else if (last - first < narrow[0]) narrow = [last - first, g.s];
    const none = running(s0, v); run(none, 2.6, null, (r) => r.phase === 'off'); if (none.offs !== 1 || none.why !== (g.len ? 'gap' : 'rock')) miss++;
  }
  check('every gap and every rock is cleared by a press at the right moment — a moment a third of a second wide at the least — and is the end of who does not press', miss === 0 && narrow[0] > 0.3, `the narrowest moment: ${narrow[0].toFixed(2)} s (at ${narrow[1].toFixed(0)} m)`);
}
{
  // ---- off the rails, and back
  const g = C.gaps.find((t) => t.way !== 1), st = running(g.s - 12, 10), ev = run(st, 6, null, (q, e) => e.some((x) => x.type === 'back')), off = ev.find((e) => e.type === 'off'), back = ev.find((e) => e.type === 'back'), sig = C.signals.filter((q) => q.s <= g.s).pop();
  check('off the rails: a moment on the ground, then back on them at the last signal, three seconds added — never the whole run', !!off && !!back && Math.abs(back.at - off.at - M.off.time) < 0.02 && Math.abs(st.s - sig.s) < 0.2 && st.cost === M.off.cost && st.phase === 'run' && Math.abs(st.v - M.off.speed) < 0.2 && back.signal === sig.id && !back.skipped, `back at ${sig.s.toFixed(0)} m, ${(g.s - sig.s).toFixed(0)} m before the gap`);
  const again = running(g.s - 12, 10), e2 = run(again, 60, null, (q, e) => e.some((x) => x.type === 'back' && x.skipped));
  const skip = e2.find((e) => e.type === 'back' && e.skipped);
  check('the third time off after the same signal, one is set down at the next: nobody is held for ever by one gap', !!skip && e2.filter((e) => e.type === 'off').length === M.off.tries && again.s >= C.signals[sig.id + 1].s - 0.2 && again.cost === M.off.tries * M.off.cost, `set down at ${C.signals[sig.id + 1].s.toFixed(0)} m after ${M.off.tries} tries`);
  // the nuggets
  const mid = C.nuggets.find((n) => n.side === 0 && n.way !== 1 && n.s > C.top), a = running(mid.s - 3, 9); run(a, 0.6);
  const side = C.nuggets.find((n) => n.side === 1 && n.s > C.top && n.way !== 1 && Math.abs(railAt(n.s, 0, {}).k) < 0.01), b = running(side.s - 4, 9), c = running(side.s - 4, 9); run(b, 0.7, (q, inp) => { inp.x = 1; }); run(c, 0.7);
  const high = C.nuggets.find((n) => n.side === 2 && n.way !== 1), d = running(high.s - 9 * 0.42, 9), e = running(high.s - 9 * 0.42, 9); run(d, 0.1, (q, inp, t) => { inp.hop = t < 0.05; }); const dy = d.y; run(d, 0.5);
  check('nuggets: those between the rails are taken as one passes, those beside by leaning to them, those above by hopping — half a second off the time for each', a.got[mid.id] === 1 && b.got[side.id] === 1 && !c.got[side.id] && d.got[high.id] === 1 && dy > 0, `${M.nugget.give} ms each`);
  // the fork
  const l = running(F.s0 - 12, 10), r = running(F.s0 - 12, 10), el = run(l, 12, (q, inp) => { inp.x = Math.sign(railAt(q.s + 3, q.way, {}).k); }, (q) => q.s > F.s1 + 2 || q.phase === 'off'), er = run(r, 12, (q, inp, t) => { inp.x = q.s < F.s0 + 1 ? 1 : 0; const next = [...C.gaps.filter((x) => x.way === 1).map((x) => x.s + x.len / 2), ...C.rocks.filter((x) => x.way === 1).map((x) => x.s)].sort((p, q2) => p - q2).find((x) => x > q.s + 1); inp.hop = next !== undefined && next - q.s < q.v * 0.43 && next - q.s > q.v * 0.36; }, (q) => (q.way === 0 && q.s > F.s1 + 2) || q.phase === 'off');
  const tl = el.length ? el[el.length - 1].at : 0, fl = el.find((x) => x.type === 'fork'), fr = er.find((x) => x.type === 'fork');
  check('at the fork one leans to choose: to the right, the short way — three hops in a row; otherwise the long way round', fl?.way === 0 && fr?.way === 1 && l.offs === 0 && r.offs === 0 && r.short === 1 && l.short === 0, `both reach the far end; the short way ${(F.s1 - F.s0 - F.len).toFixed(0)} m shorter`);
}
{
  // ---- the same asks, the same run; the drivers that play by themselves
  const one = startRun({ wait: 0.5 }), two = startRun({ wait: 0.5 }), acts = [], inp = { x: 0, y: 0, hop: false };
  for (let k = 0; k < 120 * 40; k++) { botInput(one, 'steady', inp); acts.push({ ...inp }); stepRun(one, M.step, inp, null); }
  for (let k = 0; k < acts.length;) { const n = 1 + (k % 5); let last = acts[k]; for (let j = 0; j < n && k < acts.length; j++, k++) { last = acts[k]; stepRun(two, M.step, last, null); } }
  check('the same asks give the same run, however the time is cut', Math.abs(one.s - two.s) < 1e-9 && one.v === two.v && one.nuggets === two.nuggets, `${one.s.toFixed(2)} m after forty seconds`);
  const t0 = Date.now(), steady = botRun('steady'), bold = botRun('bold'), clumsy = botRun('clumsy'), naive = botRun(naiveInput, 900);
  check('a driver with a person\'s limits — it does what it decided a quarter of a second earlier — gets round without leaving the rails: a minute and a half', steady.over && steady.offs === 0 && steady.clock > 80 && steady.clock < 115 && steady.short === 0 && steady.nuggets >= 20, `${steady.clock.toFixed(1)} s on the clock, ${steady.nuggets} nuggets of ${C.nuggets.length}: ${(steady.time / 1000).toFixed(2)} s; top speed ${(steady.top * 3.6).toFixed(0)} km/h (worked out in ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  check('a bold one lets it run and takes the short way: seconds faster, and still on the rails', bold.over && bold.offs <= 1 && bold.short >= 1 && bold.time < steady.time - 3000, `${(bold.time / 1000).toFixed(2)} s, off the rails ${bold.offs}×`);
  check('a clumsy one — late, leaning when the bend is under it, hopping by guess — leaves the rails a few times and still gets home', clumsy.over && clumsy.offs >= 3 && clumsy.offs <= 20 && clumsy.time > steady.time * 1.25, `${(clumsy.time / 1000).toFixed(1)} s, off the rails ${clumsy.offs}× (${[...new Set(clumsy.why.map((w) => w.why))].join(', ')})`);
  const first = C.bends.find((b) => b.s > C.top + 30 && b.need > M.lean.slack + 0.25);
  check('who does nothing is off the rails at the first sharp bend, again and again: the game is not won by doing nothing', naive.offs >= 8 && naive.why[0].why === 'tip' && naive.why[0].s > first.s - 2 && naive.why[0].s < first.to + 6 && (!naive.over || naive.time > steady.time * 1.6), `first off at ${naive.why[0].s} m (the bend from ${first.s.toFixed(0)} to ${first.to.toFixed(0)} m); ${naive.over ? `home after ${(naive.time / 1000).toFixed(0)} s` : `not home after ${naive.clock.toFixed(0)} s`}, off the rails ${naive.offs}×`);
  const heat = [heatOf(startRun()), heatOf(running(C.top + 20, 8)), heatOf(running(S['The Drop'].to - 5, 21)), heatOf(running(L - 20, 12))];
  check('how hot a run is, for its music: nothing at the platform, most on the drop', heat[0] === 0 && heat[1] > 0.1 && heat[2] > heat[1] + 0.3 && heat.every((h) => h >= 0 && h <= 1), heat.map((h) => h.toFixed(2)).join(' · '));
  const pose = cartPose(running(S['The Spiral'].from + 30, 10, { lean: -1 }), 0, {}), second = cartPose(running(S['The Spiral'].from + 30, 10), 1, {}), r = railAt(S['The Spiral'].from + 30, 0, {});
  check('the carts are where the rules say: the first on the rails at its place, leaning as one leans, the second two metres behind', Math.hypot(pose.x - r.x, pose.z - r.z) < 1e-9 && pose.roll < -0.2 && Math.abs(Math.hypot(second.x - r.x, second.z - r.z) - M.cart.gap) < 0.2);
  console.log(`\n  its line for server/scores.js (the steady driver: ${(steady.time / 1000).toFixed(2)} s, the bold one: ${(bold.time / 1000).toFixed(2)} s — its least is three quarters of that)`);
  line = `mine: { order: 'asc', min: ${(Math.floor((bold.time * 0.75) / 1000) * 1000).toLocaleString('en').replace(/,/g, '_')}, max: 1_800_000 }`;
}

// (the count, then — last — the line for server/scores.js)
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
console.log(line);
process.exit(failed ? 1 : 0);
