// Checks of The Endless Pond, without a browser: three circuits on the Great Pond, in deep water, clear of one
// another and of the regatta; one ring and one arm, then two rings where one has to change ring — a stretch of
// stones too long to jump, a gate that is neither jumped nor slid under —, then three rings and four arms that go
// faster and faster; fifteen seconds, twenty, then as long as one can; from a pond to the next one runs by
// oneself and nothing can happen; what one can do, what the arms do, the lily pads; a bot gets through.
// usage: node tools/pond-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { POND, waysOf, speedAt, driftAt, armAt, fireflyAt, support, startRun, stepRun, runPose, score, botInput, botRun } from '../src/world/zones/games/pond/ring.js';
import { course } from '../src/world/zones/games/boats/water.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const P = POND, PS = P.ponds, W = waysOf(), TAU = Math.PI * 2;
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/world/world.json'), 'utf8'));
const { data, info } = await sharp(path.join(ROOT, 'public/assets/world/height.png')).raw().toBuffer({ resolveWithObject: true });
const [lo, hi] = meta.heightRange, N = info.width, half = N / 2;
const height = (x, z) => { const i = (Math.floor(Math.min(half - 1, Math.max(-half, z)) + half) * N + Math.floor(Math.min(half - 1, Math.max(-half, x)) + half)) * info.channels; return ((data[i] * 256 + data[i + 1]) / 65535) * (hi - lo) + lo; };
const wrap = (a) => ((a % TAU) + TAU) % TAU;
/** Runs for `secs` with what `drive(st, input, t)` asks; returns the events. */
const run = (st, secs, drive, stop) => { const input = { jump: false, down: false, side: 0 }, events = [], seen = []; for (let t = 0; t < secs && !st.over; t += P.step) { input.jump = input.down = false; input.side = 0; drive?.(st, input, t); events.length = 0; stepRun(st, P.step, input, events); seen.push(...events.map((e) => ({ ...e, at: t }))); if (stop?.(st, events)) break; } return seen; };
const first = (t) => Math.abs(t) < 1e-9;
/** A runner on a pond, at an angle of a ring, past its first moments; `clock`: the world's. */
const on = (stage, ring, a, clock = 0, more = {}) => Object.assign(startRun(clock, stage), { ring, to: ring, a, safe: 0, t: 2, r: PS[stage].rings[ring].r }, more);
/** A moment of the world's clock when no arm of a pond comes within a radian and a half of angle `a` for `secs` seconds. */
const quiet = (stage, a, secs = 3) => { for (let c = 30; c < 2000; c += 0.05) { let ok = true; for (let d = 0; d <= secs && ok; d += 0.1) for (const arm of PS[stage].arms) if (Math.abs(wrap(armAt(arm, c + d) - a + Math.PI) - Math.PI) < 1.5) ok = false; if (ok) return c; } return -1; };
/** A moment of the world's clock when arm `i` of a pond points at angle `a` (it comes there `lead` s later). */
const whenArm = (stage, i, a, lead = 0) => { const arm = PS[stage].arms[i]; for (let c = 20; c < 400; c += 0.002) if (Math.abs(wrap(armAt(arm, c + lead) - a + Math.PI) - Math.PI) < 0.004) return c; return -1; };

{
  // ---- where they are
  let shallow = 9, near = 99, apart = 99;
  PS.forEach((p, n) => {
    for (const R of p.rings) for (let a = 0; a < TAU; a += 0.1) shallow = Math.min(shallow, P.level - height(p.x + Math.cos(a) * R.r, p.z + Math.sin(a) * R.r));
    const reach = Math.max(p.rings[0].r + 0.9, ...p.arms.map((a) => a.far));
    for (const q of course().line) near = Math.min(near, Math.hypot(q.x - p.x, q.z - p.z) - reach);
    for (let m = n + 1; m < PS.length; m++) apart = Math.min(apart, Math.hypot(PS[m].x - p.x, PS[m].z - p.z) - reach - Math.max(PS[m].rings[0].r + 0.9, ...PS[m].arms.map((a) => a.far)));
  });
  check('three circuits on the Great Pond, in its water, clear of one another and of the line of the regatta', PS.length === 3 && shallow > 0.3 && near > 2 && apart > 1, `water never less than ${shallow.toFixed(1)} m deep; ${near.toFixed(1)} m from the boats, ${apart.toFixed(1)} m from one another`);
  check('a line of stones leads from each pond to the next: a few strides of water', W[0].length > 3 && W[0].length < 12 && W[1].length > 3 && W[1].length < 14 && W[2].length === 0, `${W[0].length.toFixed(1)} m and ${W[1].length.toFixed(1)} m`);
  const bank = height(P.from[0], P.from[1]), e = runPose(startRun(0), {});
  check('one starts on the first pond, on the stone nearest the bank one comes from', bank > P.level - 0.3 && Math.hypot(e.x - P.from[0], e.z - P.from[1]) < 4 && support(PS[0], 0, startRun(0).a, 0), `${Math.hypot(e.x - P.from[0], e.z - P.from[1]).toFixed(1)} m from the bank`);
}
{
  // ---- what each is made of
  const shape = PS.map((p) => `${p.rings.length} ring${p.rings.length > 1 ? 's' : ''}, ${p.arms.length} arm${p.arms.length > 1 ? 's' : ''}`);
  check('one ring and one arm; two rings and two arms; three rings and four arms', shape.join(' · ') === '1 ring, 1 arm · 2 rings, 2 arms · 3 rings, 4 arms' && PS[0].arms[0].kind === 'low' && PS[1].arms.some((a) => a.kind === 'wall') && PS[2].arms.filter((a) => a.kind === 'wall').length === 2, shape.join(' · '));
  check('fifteen seconds on the first, twenty on the second, as long as one can on the last', PS[0].time === 15 && PS[1].time === 20 && PS[2].time === Infinity);
  check('the first is run at one pace, the second a little faster each lap, the last faster each second — to thirteen metres a second', speedAt(PS[0], 0, 0) === speedAt(PS[0], 3, 14) && speedAt(PS[1], 2, 0) > speedAt(PS[1], 0, 0) && speedAt(PS[2], 0, 30) > speedAt(PS[2], 0, 0) * 1.3 && speedAt(PS[2], 0, 500) === 13, `${speedAt(PS[0], 0, 0)}, ${speedAt(PS[1], 0, 0)} to ${speedAt(PS[1], 9, 0)}, ${speedAt(PS[2], 0, 0)} to 13 m/s`);
  // each ring has its inlet: the stone one comes onto is there, and a moment of running after it
  let landings = 0; for (let n = 0; n < 3; n++) { const R = PS[n].rings[0]; for (let d = 0; d < 0.5; d += 0.05) if (!support(PS[n], 0, W[n].in + d, 0)) landings++; }
  check('one comes onto each pond on whole stones', landings === 0);
}
{
  // ---- the second pond makes one change ring
  const p = PS[1], R = p.rings[0], slot = TAU / R.stones;
  let longest = 0, from = 0; for (let k = 0, runLen = 0; k < R.stones * 2; k++) { if (R.holes.includes(k % R.stones)) { runLen++; if (runLen > longest) { longest = runLen; from = (k - runLen + 1) % R.stones; } } else runLen = 0; }
  const gap = longest * slot * R.r, edge = from * slot;
  // the longest jump there is: a jump at the very edge, the second at the best moment
  let best = 0; for (let again = 0.2; again < 0.56; again += 0.02) { const st = on(1, 0, edge - 0.02, 0, { lap: 9 }), from = st.turned; run(st, 3, (q, inp, t) => { inp.jump = first(t) || Math.abs(t - again) < P.step / 2; }, (q) => q.over || (q.h <= 0 && q.clock > 0.3)); best = Math.max(best, (st.turned - from) * R.r); }
  check('a stretch of its stones is missing: longer than the longest jump there is, at the fastest one runs there', longest >= 5 && gap > best + 1, `${gap.toFixed(1)} m of water; the longest jump: ${best.toFixed(1)} m`);
  const jumper = on(1, 0, edge - 0.6, quiet(1, edge + 0.3)); let went = false; const evJ = run(jumper, 4, (q, inp) => { if (!went && q.a >= edge - 0.04) { went = true; inp.jump = true; } else inp.jump = q.h > 0 && q.vh < 0.4 && q.jumps === 1; });
  check('who only jumps falls in it', jumper.over && jumper.why === 'gap' && evJ.some((e) => e.type === 'again'));
  const gate = p.arms.findIndex((a) => a.kind === 'wall'), G = p.arms[gate], a0 = G.swing[0];
  const back = (speedAt(p, 0, 2) * 0.5) / p.rings[1].r, c = (() => { for (let c0 = 20; c0 < 900; c0 += 0.01) { if (Math.abs(armAt(G, c0 + 0.5) - a0) > 0.01 || Math.abs(wrap(armAt(p.arms.find((q) => q.kind === 'high'), c0 + 0.5) - a0 + Math.PI) - Math.PI) < 2.2) continue; let ok = true; for (let d = 0; d < 0.9; d += 0.05) if (!support(p, 1, a0 - back + (speedAt(p, 0, 2) * d) / p.rings[1].r, c0 + d, -0.1)) ok = false; if (ok) return c0; } return -1; })();
  const tries = [['jump', (inp) => { inp.jump = true; }], ['slide', (inp) => { inp.down = true; }], ['nothing', () => {}]].map(([name, act]) => { const st = on(1, 1, a0 - back, c); run(st, 0.9, (q, inp, t) => { if (Math.abs(t - 0.28) < P.step / 2) act(inp); }); return `${name}: ${st.why || 'through'}`; });
  const outside = (() => { const st = on(1, 0, a0 - (speedAt(p, 0, 2) * 0.5) / p.rings[0].r, c); run(st, 0.9); return st.over; })();
  check('a gate swings over its rafts: neither jumped nor slid under — one is on the stones when it comes', c > 0 && tries.every((t) => /wall/.test(t)) && !outside, tries.join(', '));
  const sector = [G.swing[0] - G.swing[1] - 0.15, G.swing[0] + G.swing[1] + 0.15]; let holesThere = 0, runUp = 0;
  for (let k = 0; k < R.stones; k++) { const mid = (k + 0.5) * slot; if (R.holes.includes(k) && mid > sector[0] && mid < sector[1]) holesThere++; }
  for (let k = from - 1; k >= 0 && !R.holes.includes(k); k--) runUp++;
  check('where the gate swings the stones are whole; and there is a good run of stones before they stop', holesThere === 0 && runUp * slot * R.r > 8 && (sector[1] < edge || sector[0] > edge + longest * slot), `${(runUp * slot * R.r).toFixed(0)} m of run before the long gap`);
}
{
  // ---- from a pond to the next
  const st = startRun(3.3), ev = run(st, 40, null, (q, e) => e.some((x) => x.type === 'pond'));
  // (nothing is pressed: on the first pond that ends in the water — so the run is taken from just before its time is up)
  const a = on(0, 0, 1.0, 50, { t: 14.9, held: 14.9 }), evA = run(a, 12, null, (q, e) => e.some((x) => x.type === 'pond'));
  const through = evA.find((e) => e.type === 'through'), bridge = evA.find((e) => e.type === 'bridge'), pond = evA.find((e) => e.type === 'pond');
  check('when its time is up a pond is done: one runs out to the stones and along them by oneself, and nothing can happen on the way', !!through && !!bridge && !!pond && pond.n === 1 && !a.over && a.stage === 1 && a.mode === 'run' && pond.at - through.at < 6, `${(pond.at - through.at).toFixed(1)} s from one pond to the next, nothing pressed`);
  check('the way is not counted: what a run is worth is how long one held on the ponds', Math.abs(a.held - 15) < 0.02 && score(a) === Math.round(a.held * 1000) && a.t < 0.02 && ev.length >= 0);
  const pose0 = runPose(on(0, 0, W[0].out, 0, { mode: 'bridge', u: 0 }), {}), pose1 = runPose(on(0, 0, W[0].out, 0, { mode: 'bridge', u: W[0].length }), {}), land = runPose(startRun(0, 1), {});
  check('the stones between two ponds lead from the edge of one to the edge of the next', Math.hypot(pose0.x - PS[0].x, pose0.z - PS[0].z) - PS[0].rings[0].r < 0.01 && Math.hypot(pose1.x - land.x, pose1.z - land.z) < 0.01);
  const b = on(1, 1, 3.0, 80, { t: 19.95, held: 34.95 }), evB = run(b, 14, null, (q, e) => e.some((x) => x.type === 'pond'));
  check('from the rafts one steps out to the stones by oneself on the way out; the last pond has no end', b.stage === 2 && evB.some((e) => e.type === 'pond' && e.n === 2) && !b.over && (() => { const c = on(2, 1, 1, 0, { t: 500 }); run(c, 0.1); return c.mode === 'run'; })());
  const g = startRun(whenArm(0, 0, W[0].in)), evG = run(g, 0.8);
  check('the first moment on a pond nothing can happen: an arm may be right there', !g.over && !evG.some((e) => e.type === 'fall') && startRun(0).safe === P.grace);
}
{
  // ---- what one does
  const j = on(2, 0, 0.9); let top = 0; run(j, 1.2, (q, inp, t) => { inp.jump = first(t); top = Math.max(top, q.h); }, (q) => q.h <= 0 && q.clock > 0.1);
  const jj = on(2, 0, 0.9); let top2 = 0; run(jj, 2, (q, inp, t) => { inp.jump = first(t) || Math.abs(t - 0.3) < P.step / 2; top2 = Math.max(top2, q.h); }, (q) => q.h <= 0 && q.clock > 0.1);
  const d = on(2, 0, 0.9); run(d, 2, (q, inp, t) => { inp.jump = first(t); inp.down = Math.abs(t - 0.2) < P.step / 2; }, (q) => q.h <= 0 && q.clock > 0.1);
  check('one jumps; a second jump in the air carries higher and further; a dive brings one down at once', Math.abs(top - (P.jump * P.jump) / (2 * P.g)) < 0.05 && top2 > top + 0.3 && jj.clock > j.clock + 0.2 && d.clock < j.clock - 0.1, `${top.toFixed(2)} m, ${top2.toFixed(2)} m with the second; ${j.clock.toFixed(2)} s in the air, ${d.clock.toFixed(2)} s with a dive`);
  const s = on(2, 0, 1.6, 0); const evS = run(s, 0.2, (q, inp, t) => { inp.side = first(t) ? 1 : 0; });
  const s2 = on(2, 1, 1.6, 0); const evS2 = run(s2, 0.2, (q, inp, t) => { inp.side = first(t) ? 1 : 0; });
  const s3 = on(2, 2, 1.6, 0); const evS3 = run(s3, 0.2, (q, inp, t) => { inp.side = first(t) ? -1 : 0; });
  const o = on(2, 0, 1.6, 0); const evO = run(o, 0.2, (q, inp, t) => { inp.side = first(t) ? -1 : 0; });
  const i = on(2, 2, 1.6, 0); const evI = run(i, 0.05, (q, inp, t) => { inp.side = first(t) ? 1 : 0; });
  check('a step to the side takes one to the next ring, inwards or outwards — no further than there are rings', evS.some((e) => e.type === 'swap' && e.to === 1) && evS2.some((e) => e.type === 'swap' && e.to === 2) && evS3.some((e) => e.type === 'swap' && e.to === 1) && !evO.some((e) => e.type === 'swap') && !evI.some((e) => e.type === 'swap'));
  const sl = on(2, 0, 0.9); const evL = run(sl, 0.4, (q, inp, t) => { inp.down = first(t); inp.side = Math.abs(t - 0.15) < P.step / 2 ? 1 : 0; });
  check('a slide is ended by a step to the side, as it is by a jump', evL.some((e) => e.type === 'slide') && evL.some((e) => e.type === 'swap') && sl.slide <= 0);
}
{
  // ---- the arms
  const low = (act) => { const c = whenArm(0, 0, 2.6, 0.5), st = on(0, 0, 2.6 - (4.6 * 0.5) / 4.0, c); run(st, 0.9, (q, inp, t) => { if (Math.abs(t - 0.26) < P.step / 2) act(inp); }); return st.why || 'by'; };
  check('a low beam is jumped; who does nothing, or slides, is tripped by it', low((i) => { i.jump = true; }) === 'by' && low(() => {}) === 'low' && low((i) => { i.down = true; }) === 'low', `${low((i) => { i.jump = true; })}, ${low(() => {})}, ${low((i) => { i.down = true; })}`);
  const hi2 = PS[1].arms.findIndex((a) => a.kind === 'high'), A = PS[1].arms[hi2], at = 3.0;
  const high = (act) => { const c = whenArm(1, hi2, at, 0.5), st = on(1, 0, at - (5.2 * 0.5) / 6.8 + A.turn * -0.5 * 0, c); st.a = at - (5.2 * 0.5) / 6.8; run(st, 0.9, (q, inp, t) => { if (Math.abs(t - 0.3) < P.step / 2) act(inp); }); return st.why || 'by'; };
  check('a curtain is slid under; a plain jump is not enough for it', high((i) => { i.down = true; }) === 'by' && high(() => {}) === 'high' && high((i) => { i.jump = true; }) === 'high', `${high((i) => { i.down = true; })}, ${high(() => {})}, ${high((i) => { i.jump = true; })}`);
  const a1 = armAt(PS[2].arms[0], 77.7), a2 = armAt(PS[2].arms[0], 77.7), sw = PS[2].arms[2]; let lo2 = 9, hi3 = -9; for (let c = 0; c < 60; c += 0.05) { const v = armAt(sw, c); lo2 = Math.min(lo2, v); hi3 = Math.max(hi3, v); }
  check('what moves — arms, rafts, fireflies — moves by the clock of the world; a gate swings to and fro, it does not go round', a1 === a2 && driftAt(PS[1].rings[1], 10) === driftAt(PS[1].rings[1], 10) && JSON.stringify(fireflyAt(PS[2], 41, {})) === JSON.stringify(fireflyAt(PS[2], 41, {})) && Math.abs(lo2 - (sw.swing[0] - sw.swing[1])) < 0.01 && Math.abs(hi3 - (sw.swing[0] + sw.swing[1])) < 0.01);
}
{
  // ---- fireflies and lily pads
  const f = on(1, 0, 0, 0, { flies: 2 }); const fly = fireflyAt(PS[1], 900.1, {}); Object.assign(f, { t0: 900.1, ring: fly.ring, to: fly.ring, r: PS[1].rings[fly.ring].r, a: fly.a - 0.02, h: 0.5, vh: 1, jumps: 2 }); const evF = run(f, 0.15);
  check('a firefly is caught by who jumps under it; three of them make a lily pad', evF.some((e) => e.type === 'fly') && evF.some((e) => e.type === 'lily') && f.lilies === 1);
  // on the stones, at the edge of the long gap of the second pond, with a lily pad: put back where there is something to run on
  const R = PS[1].rings[0], slot = TAU / R.stones, edge = 19 * slot, calm = quiet(1, edge + 0.6, 4), l = on(1, 0, edge - 0.05, calm, { lilies: 1 }), evL = run(l, 3.5, (q, inp) => { if (q.saved && q.safe <= 0.05 && q.h <= 0) inp.jump = !support(PS[1], q.ring, q.a + 0.25, q.t0 + q.clock + 0.2); });
  const saved = evL.find((e) => e.type === 'saved');
  check('who falls in with a lily pad is carried a moment and set down where there is something to run on — on another ring if need be', !!saved && saved.why === 'gap' && l.lilies === 0 && l.saved === 1 && l.ring === 1 && l.clock > P.safe, `set down on the rafts, ${l.over ? 'then in again' : 'and running'}`);
  const none = on(1, 0, edge - 0.05, calm); run(none, 1);
  check('with none, the run ends in the water: it is worth how long one held', none.over && none.why === 'gap' && none.time === Math.round(none.held * 1000));
}
{
  // ---- the same asks, the same run; the bot
  const one = startRun(7), two = startRun(7), acts = [], inp = { jump: false, down: false, side: 0 };
  for (let k = 0; k < 120 * 12; k++) { botInput(one, inp); acts.push({ ...inp }); stepRun(one, P.step, inp, null); }
  for (let k = 0; k < acts.length;) { const n = 1 + (k % 5); for (let j = 0; j < n && k < acts.length; j++, k++) stepRun(two, P.step, acts[k], null); }
  check('the same asks give the same run, however the time is cut', one.a === two.a && one.held === two.held && one.ring === two.ring && one.over === two.over, `${one.held.toFixed(2)} s held`);
  const t0 = Date.now(), runs = [0, 23.4, 300.5, 803.3, 1203.1].map((c) => botRun(c, 62)), last = runs.filter((r) => r.stage === 2), held = last.map((r) => r.held / 1000 - 35).sort((a, b) => a - b);
  check('a runner that looks ahead gets through the first two ponds, whenever it starts', last.length === runs.length, `${last.length} of ${runs.length} reach the last pond (worked out in ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  check('and holds on the last one', held[0] > 12, `${held.map((h) => h.toFixed(0)).join(', ')} s on the last pond in a minute of running, none in the water yet`);
  const still = startRun(5); run(still, 30);
  check('one who presses nothing is in the water before the first pond is done', still.over && still.stage === 0 && still.held < 15 && still.held > P.grace, `${still.held.toFixed(1)} s, ${still.why}`);
  console.log(`\n  a rule for the board of its best runs (how long one held, ms):  pond: { order: 'desc', min: 1000, max: 3600_000 }`);
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
