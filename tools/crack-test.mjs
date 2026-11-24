// Checks of Between a Rock, without a browser: the cleft lies on the sea cliff — in front of its rock from the
// sea to the lip, its planks over the water, its walkway from the sand; five stretches, each wider than the
// last; who does nothing slides; a kick carries across and up, less and less with height; thorns throw off,
// polish and moss let slide, stones come down by the clock of the world; the nets catch; the beads tell the
// truth; one who reads the walls gets to the bell, one who only hammers the key is thrown off again and again.
// usage: node tools/crack-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { CLEFT, cleft, wideAt, wallAt, kindAt, sectionAt, rainAt, startClimb, stepClimb, climbPose, cleftPoint, kickMark, botInput, naiveInput, botClimb } from '../src/world/zones/games/crack/cleft.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const C = CLEFT, L = cleft();
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/world/world.json'), 'utf8'));
const { data, info } = await sharp(path.join(ROOT, 'public/assets/world/height.png')).raw().toBuffer({ resolveWithObject: true });
const [lo, hi] = meta.heightRange, N = info.width, half = N / 2;
const height = (x, z) => { const i = (Math.floor(Math.min(half - 1, Math.max(-half, z)) + half) * N + Math.floor(Math.min(half - 1, Math.max(-half, x)) + half)) * info.channels; return ((data[i] * 256 + data[i + 1]) / 65535) * (hi - lo) + lo; };
/** A climber put on a wall at a height, holding it. */
const onWall = (side, y, t0 = 0) => Object.assign(startClimb(t0), { stand: false, side, y, x: side * (wallAt(side, y + C.chest) - C.body), started: true, grip: C.grip[kindAt(side, y + C.chest)] ?? 0, top: y, section: sectionAt(y) });
/** Plays a climb for `secs` with what `drive(st, input, t)` asks; returns the events, in order. */
const run = (st, secs, drive, stop) => { const input = { x: 0, y: 0, jump: false }, events = [], seen = []; for (let t = 0; t < secs && !st.over; t += C.step) { input.jump = false; drive?.(st, input, t); events.length = 0; stepClimb(st, C.step, input, events); seen.push(...events.map((e) => ({ ...e, at: t }))); if (stop?.(st, events)) break; } return seen; };
/** One kick from a wall at a height: how much higher (or lower) the other wall is held. */
const gain = (y, high) => { const st = onWall(-1, y), seen = run(st, 2, (q, inp, t) => { inp.jump = t === 0; inp.y = high ? 1 : 0; }, (q, ev) => ev.some((e) => e.type === 'hold' || e.type === 'thorn' || e.type === 'net')); return { d: st.y - y, how: seen[seen.length - 1]?.type, kind: seen[seen.length - 1]?.kind }; };

{
  // ---- where it is: on the cliff, in front of its rock; its foot in the sea; its lip at the top of the cliff
  let proud = Infinity, deep = -Infinity;
  for (let y = 0; y <= C.height; y += 0.5) for (let x = -wideAt(y) / 2 - 0.4; x <= wideAt(y) / 2 + 0.4; x += 0.4) { const p = cleftPoint(x, y, -C.back + 0.2), q = p.y - height(p.x, p.z); proud = Math.min(proud, q); deep = Math.max(deep, q); }
  check('the back of the cleft stands in front of the rock of the cliff, from the planks to the lip', proud > 0.3, `at least ${proud.toFixed(1)} m clear of it`);
  const foot = climbPose(startClimb()), top = cleftPoint(0, C.height, 0), lip = cleftPoint(0, C.height, -C.back);
  let reach = 99; for (let d = 0; d < 12; d += 0.25) if (height(lip.x, lip.z + d) >= lip.y - 0.3) { reach = d; break; }
  check('it leans back against the cliff: forty metres up it is about thirty-nine up and ten in', Math.abs(top.y - foot.y - 38.6) < 0.3 && Math.abs(top.z - foot.z - 10.35) < 0.3 && foot.x === C.at.x && foot.y === C.floor, `${(top.y - foot.y).toFixed(1)} m up, ${(top.z - foot.z).toFixed(1)} m in`);
  check('its lip comes out at the top of the cliff: the ground is level with it a few steps behind', reach < 4.5 && height(lip.x, lip.z + 6) > lip.y, `${reach} m behind the lip`);
  const [x0, z0, x1, z1] = C.landing, W = C.way;
  let wet = 0, n = 0; for (let x = x0; x <= x1; x += 0.5) for (let z = z0; z <= z1; z += 0.5) { n++; if (height(x, z) < -0.5) wet++; }
  check('the planks before it stand over the sea, a step above the water', wet === n && C.floor > 0.8 && C.floor < 2, `${wet}/${n} over the water`);
  const sand = height(W.a[0], W.a[1]), mid = height((W.a[0] + W.b[0]) / 2, (W.a[1] + W.b[1]) / 2);
  check('the walkway leaves from the sand of the beach and ends on the landing', sand >= C.floor - 0.1 && sand < C.floor + 1.2 && mid < 0.5 && W.b[0] >= x0 && W.b[0] <= x1 && W.b[1] >= z0 && W.b[1] <= z1, `sand at ${sand.toFixed(1)} m, planks at ${C.floor}`);
}
{
  // ---- its five stretches
  const S = C.sections, wider = S.every((q, i) => i === 0 || q.wide > S[i - 1].wide), even = S.every((q, i) => q.to === (i + 1) * 8);
  check('five stretches of eight metres, each wider than the last, a net at the top of each but the last', S.length === 5 && wider && even && JSON.stringify(L.nets) === '[8,16,24,32]' && Math.abs(wideAt(4) - S[0].wide) < 0.01 && Math.abs(wideAt(36) - S[4].wide) < 0.01, S.map((q) => q.wide).join(' < '));
  const kinds = [0, 1, 2, 3, 4].map((n) => new Set([-1, 1].flatMap((side) => L.patches[side].filter((p) => sectionAt((p.y0 + p.y1) / 2) === n).map((p) => p.kind))));
  check('nothing to mind in the first; then thorns; then polish; then moss; and polish again under the rain', kinds[0].size === 0 && kinds[1].has('thorn') && kinds[1].size === 1 && kinds[2].has('polish') && kinds[3].has('moss') && kinds[4].has('polish') && kinds[4].has('thorn'), kinds.map((k) => [...k].join('+') || 'bare').join(' | '));
  let facing = 0, lipFree = true;
  for (const a of L.patches[-1]) for (const b of L.patches[1]) if (a.kind === 'thorn' && b.kind === 'thorn' && a.y0 < b.y1 + 0.3 && b.y0 < a.y1 + 0.3) facing++;
  for (const side of [-1, 1]) for (const p of L.patches[side]) { if (p.kind === 'thorn' && p.y1 > C.height - 1.2) lipFree = false; if (p.y0 < 8.5) lipFree = false; }
  check('thorns never face thorns, and the lip is left alone', facing === 0 && lipFree);
}
{
  // ---- the kick, and the slide
  const low = gain(3, false), lowHigh = gain(3, true), up = gain(34.8, false), upHigh = gain(34.8, true);
  check('a kick carries across and up: a good deal in the first stretch, hardly a metre in the last', low.d > 1.5 && low.how === 'hold' && up.d > 0.6 && up.d < 1.1, `${low.d.toFixed(2)} m, then ${up.d.toFixed(2)} m`);
  check('a steep kick gains more where it is narrow, and loses where it is wide', lowHigh.d > low.d + 0.3 && upHigh.d < 0, `${lowHigh.d.toFixed(2)} m, then ${upHigh.d.toFixed(2)} m`);
  const idle = onWall(1, 6); run(idle, 0.2); const held = idle.y; run(idle, 8);
  check('one holds a moment where one lands; who does nothing then slides, down to the planks', Math.abs(held - 6) < 0.01 && idle.stand && idle.y === 0, `held at ${held.toFixed(2)}, then down`);
  const slid = (kind) => { const p = [...L.patches[-1], ...L.patches[1]].find((q) => q.kind === kind && q.y1 - q.y0 > 1.2), side = L.patches[-1].includes(p) ? -1 : 1, st = onWall(side, p.y1 - C.chest - 0.05); run(st, 0.35); return p.y1 - C.chest - 0.05 - st.y; };
  const rock = (() => { const st = onWall(1, 5); run(st, 0.35); return 5 - st.y; })(), polish = slid('polish'), moss = slid('moss');
  check('rock holds, polished rock hardly, moss not at all', rock < polish && polish < moss && rock < 0.2 && moss > 0.6, `in a third of a second: ${rock.toFixed(2)} m, ${polish.toFixed(2)} m, ${moss.toFixed(2)} m`);
  const fresh = onWall(-1, 5), late = onWall(-1, 5.8);
  run(fresh, 2, (q, inp, t) => { inp.jump = t === 0; }, (q, ev) => ev.some((e) => e.type === 'hold'));
  let from = 0; run(late, 3, (q, inp, t) => { inp.jump = false; if (!from && q.side === -1 && q.y <= 5) { inp.jump = true; from = q.y; } }, (q, ev) => from > 0 && ev.some((e) => e.type === 'hold'));
  check('a kick taken while sliding is a weaker one: who hesitates loses twice', from > 0 && late.y - from < fresh.y - 5 - 0.25, `${(fresh.y - 5).toFixed(2)} m at once, ${(late.y - from).toFixed(2)} m from the slide`);
  const fast = onWall(1, 6), slow = onWall(1, 6); run(fast, 0.8, (q, inp) => { inp.y = -1; }); run(slow, 0.8);
  check('letting go, one slides much faster: a way down to a better place to kick from', 6 - fast.y > (6 - slow.y) * 2, `${(6 - fast.y).toFixed(2)} m against ${(6 - slow.y).toFixed(2)} m`);
}
{
  // ---- thorns, nets
  const thorn = L.patches[1].find((p) => p.kind === 'thorn'), st = onWall(-1, thorn.y0 - C.chest - 1.2);
  const seen = run(st, 3, (q, inp, t) => { inp.jump = t === 0; }, (q, ev) => ev.some((e) => e.type === 'hold' || e.type === 'net'));
  const hit = seen.find((e) => e.type === 'thorn'), end = seen[seen.length - 1];
  check('who lands in the thorns is thrown back across, and holds what they catch there', !!hit && (end.type === 'hold' || end.type === 'net') && st.falls <= 1 && (st.side === -1 || st.stand), `thrown at ${hit ? hit.at.toFixed(2) : '?'} s, then ${end.type}${st.side ? ` on the wall it came from, ${(thorn.y0 - C.chest - 1.2 - st.y).toFixed(1)} m lower` : ''}`);
  const faller = Object.assign(startClimb(), { stand: false, side: 0, x: 0, y: 21, vy: -2, started: true, top: 21 }), ev2 = run(faller, 3, null, (q) => q.stand);
  check('a net catches whoever falls: never further than the top of the stretch below', faller.stand && faller.y === 16 && ev2.some((e) => e.type === 'net' && e.n === 2) && faller.falls === 1);
  const under = onWall(-1, 7.2); run(under, 2, (q, inp, t) => { inp.jump = t === 0; }, (q, ev) => ev.some((e) => e.type === 'hold'));
  check('and one goes up through it: a kick from under a net ends above it', under.side === 1 && under.y > 8 && under.section === 1, `held at ${under.y.toFixed(2)} m`);
  const walker = Object.assign(startClimb(), { y: 16, base: 2, started: true }); run(walker, 3, (q, inp) => { inp.x = 1; });
  const jumper = Object.assign(startClimb(), { y: 16, base: 2, started: true }); run(jumper, 2, (q, inp, t) => { inp.x = -1; inp.jump = Math.abs(t - 0.2) < 1e-6; }, (q, ev) => ev.some((e) => e.type === 'hold'));
  check('on a net one walks to either wall, and jumps to the wall one faces', walker.stand && Math.abs(walker.x - (wallAt(1, 16 + C.chest) - C.body)) < 0.01 && jumper.side === -1 && jumper.y > 16.5, `walked to ${walker.x.toFixed(2)}, jumped to the left wall at ${jumper.y.toFixed(1)} m`);
}
{
  // ---- the rain of stones: by the clock of the world
  const a = rainAt(1234.5), b = rainAt(1234.5);
  let left = 0, right = 0, seenAbove = 0, n = 0;
  for (let k = 0; k < 400; k++) { const r = rainAt(k * C.rain.every + 0.05); if (!r) continue; n++; if (r.side < 0) left++; else right++; if (r.y > C.height + 4) seenAbove++; }
  check('a stone comes down a wall every few seconds, the same for everybody, seen in the sky before it is in the cleft', JSON.stringify(a) === JSON.stringify(b) && n === 400 && left > 120 && right > 120 && seenAbove === 400, `${left} down the left wall, ${right} down the right`);
  // a moment when a stone is about to pass 35 m on some wall
  // a moment when a stone is a metre above the chest of two climbers at 34.5 m, one on each wall (where neither wall has thorns)
  let t0 = 0, side = 0; for (let t = 100; t < 200; t += 0.01) { const r = rainAt(t); if (r && r.y > 34.5 + C.chest + 0.9 && r.y < 34.5 + C.chest + 1.1) { t0 = t; side = r.side; break; } }
  const on = onWall(side, 34.5, t0), off = onWall(-side, 34.5, t0);
  const evOn = run(on, 0.3), evOff = run(off, 0.3);
  check('who is on the wall it comes down is thrown off; who is on the other wall is not', evOn.some((e) => e.type === 'rain') && !evOff.some((e) => e.type === 'rain' || e.type === 'thorn') && off.side === -side, `the stone down the ${side < 0 ? 'left' : 'right'} wall`);
  const low = onWall(side, 27, t0); const evLow = run(low, 1.5);
  check('the stones stop where the last stretch begins: below, nobody minds them', !evLow.some((e) => e.type === 'rain') && rainAt(t0 + 5) !== undefined && (() => { for (let t = 0; t < 30; t += 0.01) { const r = rainAt(t); if (r && r.y < C.rain.from - 1.6) return false; } return true; })());
}
{
  // ---- the beads tell the truth; the clock is the clock
  let wrong = 0, tried = 0, red = 0;
  for (let y = 1; y < 38; y += 0.37) for (const side of [-1, 1]) for (const high of [false, true]) {
    if (kindAt(side, y + C.chest) === 'thorn') continue;
    const st = onWall(side, y, 3.3), mark = kickMark(st, high, {});
    const seen = run(st, 2.5, (q, inp, t) => { inp.jump = t === 0; inp.y = high ? 1 : 0; }, (q, ev) => ev.some((e) => e.type === 'hold' || e.type === 'thorn' || e.type === 'net' || e.type === 'rain' || e.type === 'top'));
    const e = seen.find((v) => v.type === 'hold' || v.type === 'thorn' || v.type === 'net' || v.type === 'rain' || v.type === 'top');
    tried++;
    if (!mark || !e) { wrong++; continue; }
    const kind = e.type === 'hold' ? e.kind : e.type;
    if (kind === 'thorn') red++;
    if (mark.kind !== kind) wrong++;
  }
  check('the beads on the walls tell where a kick would land, and on what: thorns are shown before one is in them', wrong === 0 && red > 10, `${tried} kicks foretold, ${red} of them into thorns`);
  const one = startClimb(7), two = startClimb(7), inp = { x: 0, y: 0, jump: false };
  for (let k = 0; k < 120 * 6; k++) { botInput(one, inp); stepClimb(one, C.step, inp, null); }
  { const acts = []; const probe = startClimb(7); for (let k = 0; k < 120 * 6; k++) { botInput(probe, inp); acts.push({ ...inp }); stepClimb(probe, C.step, inp, null); } for (let k = 0; k < acts.length; k += 4) { for (let j = 0; j < 4; j++) { /* a frame of four steps: what was asked in it is asked at its first step */ } }
    // the same asks, given in frames of uneven length, end in the same place
    let k = 0; while (k < acts.length) { const n = 1 + (k % 5); for (let j = 0; j < n && k < acts.length; j++, k++) stepClimb(two, C.step, acts[k], null); } }
  check('the same asks give the same climb, however the time is cut', Math.abs(one.y - two.y) < 1e-9 && one.kicks === two.kicks && one.x === two.x, `${one.y.toFixed(3)} m after six seconds, ${one.kicks} kicks`);
}
{
  // ---- it can be climbed — by who reads it
  const runs = [0, 0.4, 1.1, 1.7, 3.3, 7.7, 12.9, 31.3, 44.4, 58.6, 71.0, 99.5].map((t0) => botClimb(t0, 120));
  const all = runs.every((r) => r.over), times = runs.map((r) => r.time / 1000), worst = Math.max(...times), best = Math.min(...times), thrown = Math.max(...runs.map((r) => r.thrown));
  check('a climber who reads the walls gets to the bell, whenever it starts', all && best > 14 && worst < 45, `${best.toFixed(1)} to ${worst.toFixed(1)} s over ${runs.length} climbs, thrown off ${thrown} time${thrown === 1 ? '' : 's'} at most`);
  const naive = [0, 7.7, 31.3].map((t0) => botClimb(t0, 60, naiveInput));
  check('one who only hammers the key is thrown off again and again, and is far behind', naive.every((r) => r.thrown >= 5 && (!r.over || r.time > worst * 1000 * 1.5)), naive.map((r) => `${r.over ? (r.time / 1000).toFixed(0) + ' s' : 'not up in a minute'}, thrown ${r.thrown} times`).join(' · '));
  const first = startClimb(0), seen = run(first, 30, (q, inp) => botInput(q, inp));
  const order = seen.filter((e) => e.type === 'section').map((e) => e.n), go = seen.find((e) => e.type === 'go'), top = seen.find((e) => e.type === 'top');
  check('the clock starts with the first jump and stops at the lip; the stretches come in order', !!go && !!top && order.join() === '1,2,3,4' && first.time === Math.round((first.clock - first.go) * 1000) && first.time > 0);
  console.log(`\n  a rule for the board of its best times:  crack: { order: 'asc', min: ${Math.floor((best * 1000 * 0.55) / 1000) * 1000}, max: 1800_000 }   (the bot's best: ${best.toFixed(1)} s)`);
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
