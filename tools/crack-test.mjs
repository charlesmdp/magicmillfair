// Checks of Between a Rock, without a browser: two needles stand in the sea before the cliff, their planks over
// the water, the walkway from the sand; the cleft widens with height, its ledges leave room to pass and its wet
// stretches are never where one needs to wait; one walks, steers a little, holds on to a wall and slides —
// slowly while holding towards it —, kicks from wall to wall; nobody climbs a single wall; stones come down by
// the clock of the world, break on the ledges, knock off who is under them; there is no net; the arc drawn is the
// jump; one who reads the cleft gets to the bell, one who only hammers the jump stays on the planks.
// usage: node tools/crack-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { CLEFT, wideAt, wallAt, wetAt, ledgeBox, rockAt, rocks, startClimb, stepClimb, climbPose, leapArc, botInput, naiveInput, botClimb } from '../src/world/zones/games/crack/cleft.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const C = CLEFT;
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/world/world.json'), 'utf8'));
const { data, info } = await sharp(path.join(ROOT, 'public/assets/world/height.png')).raw().toBuffer({ resolveWithObject: true });
const [lo, hi] = meta.heightRange, N = info.width, half = N / 2;
const height = (x, z) => { const i = (Math.floor(Math.min(half - 1, Math.max(-half, z)) + half) * N + Math.floor(Math.min(half - 1, Math.max(-half, x)) + half)) * info.channels; return ((data[i] * 256 + data[i + 1]) / 65535) * (hi - lo) + lo; };
/** A moment of the world's clock with no stone anywhere near for a few seconds (to try the climbing itself). */
const QUIET = (() => { for (let t = 5; t < 4000; t += 0.25) { let n = 0; for (let d = 0; d < 6; d += 0.25) rocks(t + d, () => n++); if (!n) return t; } return 0; })();
/** A climber put on a wall at a height, holding it; or in the air; or on the planks. */
const onWall = (side, y, t0 = QUIET) => Object.assign(startClimb(t0), { ground: false, wall: side, y, x: side * (wallAt(side, y + 0.8) - C.body), started: true, top: y });
const inAir = (x, y, more = {}, t0 = QUIET) => Object.assign(startClimb(t0), { ground: false, x, y, started: true, top: y }, more);
/** Plays a climb for `secs` with what `drive(st, input, t)` asks; returns the events, in order. */
const run = (st, secs, drive, stop) => { const input = { x: 0, y: 0, jump: false }, events = [], seen = []; for (let t = 0; t < secs && !st.over; t += C.step) { input.jump = false; drive?.(st, input, t); events.length = 0; stepClimb(st, C.step, input, events); seen.push(...events.map((e) => ({ ...e, at: t }))); if (stop?.(st, events)) break; } return seen; };
const first = (t) => Math.abs(t) < 1e-9;
/** A kick from a wall, held towards the wall across: how much higher that wall is caught. */
const gain = (side, y) => { const st = onWall(side, y); run(st, 2, (q, inp, t) => { inp.jump = first(t); inp.x = -side; }, (q) => q.wall === -side || q.ground); return st.wall === -side ? st.y - y : NaN; };

{
  // ---- where it is
  let wet = 0, n = 0; const [x0, z0, x1, z1] = C.landing, W = C.way;
  for (let x = x0; x <= x1; x += 0.5) for (let z = z0; z <= C.at.z + C.deep; z += 0.5) { n++; if (height(x, z) < -0.5) wet++; }
  check('the needles stand in the sea: the landing and the planks between them are over the water, a step above it', wet === n && C.floor > 0.8 && C.floor < 2, `${wet}/${n} over the water`);
  const sand = height(W.a[0], W.a[1]), mid = height((W.a[0] + W.b[0]) / 2, (W.a[1] + W.b[1]) / 2);
  check('the walkway leaves from the sand of the beach and ends on the landing', sand >= C.floor - 0.1 && sand < C.floor + 1.2 && mid < 0.5 && W.b[0] >= x0 && W.b[0] <= x1 && W.b[1] >= z0 && W.b[1] <= z1, `sand at ${sand.toFixed(1)} m, planks at ${C.floor}`);
  check('the cliff is behind them, and a fall can come down it into the sea', height(C.at.x, C.at.z + 13.4) > 25 && height(C.at.x, C.at.z + 5) < 0.5, `${height(C.at.x, C.at.z + 13.4).toFixed(0)} m high thirteen metres behind`);
  const foot = climbPose(startClimb());
  check('one starts in the middle of the cleft, on the planks', foot.x === C.at.x && foot.y === C.floor && foot.z === C.at.z);
}
{
  // ---- its shape
  const wider = [0, 8, 16, 24, 32, 40].map(wideAt), L = C.ledges;
  check('the cleft widens with height: three metres at the planks, four and a half at the top', wider.every((w, i) => i === 0 || w >= wider[i - 1]) && wider[0] === 3 && wider[5] > 4.4 && wider[5] < 4.8, wider.map((w) => w.toFixed(1)).join(' < '));
  const room = L.map((l) => wideAt(l.y) - l.out), steps = L.map((l, i) => l.y - (i ? L[i - 1].y : 0));
  check('seven ledges, now on one wall, now on the other, each leaving room to pass; the first one high enough to learn the kick under it', L.length === 7 && L.every((l, i) => i === 0 || l.side === -L[i - 1].side) && Math.min(...room) > 1.9 && L[0].y >= 5 && Math.min(...steps) > 4.4 && C.height - L[6].y > 4, `${steps.map((s) => s.toFixed(1)).join(', ')} m, then ${(C.height - L[6].y).toFixed(1)} m to the top`);
  // (the wall from which one kicks up onto a ledge is the one across from it, a metre and a half below its top)
  let waits = 0; for (const l of L) for (let y = l.y - 1.5; y < l.y - 0.2; y += 0.1) if (wetAt(-l.side, y + 0.8)) waits++;
  check('water runs down the rock in five places, none below thirteen metres — and never where one waits to kick up onto a ledge', C.wet.length === 5 && C.wet.every((w) => w.y0 > 13) && waits === 0);
}
{
  // ---- walking, jumping, steering
  const up = startClimb(QUIET); let top = 0; run(up, 1.2, (q, inp, t) => { inp.jump = first(t); top = Math.max(top, q.y); }, (q, ev) => ev.some((e) => e.type === 'land'));
  const to = startClimb(QUIET); run(to, 1.5, (q, inp, t) => { inp.jump = first(t); inp.x = -1; }, (q) => !!q.wall);
  check('off the planks one jumps as high as oneself; steered, the jump reaches a wall, and holds', Math.abs(top - (C.jump * C.jump) / (2 * C.g)) < 0.05 && up.ground && to.wall === -1 && to.y > 0.8, `${top.toFixed(2)} m high; the wall caught at ${to.y.toFixed(1)} m`);
  const low = gain(1, 5.4), high = gain(1, 36.6);
  check('a kick carries across and up: more than a metre and a half where it is narrow, a good deal less at the top', low > 1.5 && high > 0.5 && high < low - 0.35, `${low.toFixed(2)} m, then ${high.toFixed(2)} m`);
  const speed = (drive, side = 1, y = 12.4, lead = 0.6, span = 0.4) => { const st = onWall(side, y); run(st, lead, drive); const a = st.y; run(st, span, drive); return (a - st.y) / span; };
  const hold = speed((q, inp) => { inp.x = 1; }), free = speed(null), drop = speed((q, inp) => { inp.y = -1; }, 1, 12.4, 0.45, 0.2), w = C.wet[0], wetHeld = speed((q, inp) => { inp.x = w.side; }, w.side, w.y1 - 0.9, 0.2, 0.15);
  check('on a wall one slides: slowly while one holds towards it, faster with nothing held, fast where water runs, faster still letting go', Math.abs(hold - C.slide.hold) < 0.05 && Math.abs(free - C.slide.free) < 0.05 && wetHeld > 4 && drop > 6, `${hold.toFixed(1)}, ${free.toFixed(1)}, ${wetHeld.toFixed(1)} and ${drop.toFixed(1)} m/s`);
  const away = onWall(1, 6); let left = 0; run(away, 0.5, (q, inp, t) => { inp.x = -1; if (!left && !q.wall) left = t; });
  check('held away from it, a wall is let go — after a moment, not at once', left > 0.1 && left < 0.2 && !away.wall, `${left.toFixed(2)} s`);
  const back = onWall(1, 37.4); run(back, 4, (q, inp, t) => { inp.jump = first(t); inp.x = 1; }, (q) => q.wall || q.ground);
  check('nobody climbs a single wall: a kick steered back to the wall it left ends lower', (back.wall === 1 || back.ground) && back.y < 36.4, `${(37.4 - back.y).toFixed(1)} m lower`);
  const early = inAir(0.9, 5.6, { vx: 3 }); run(early, 1, (q, inp, t) => { inp.jump = Math.abs(t - 0.025) < C.step / 2; }, (q) => q.wall === -1);
  const late = onWall(1, 5.8); let let2 = -1; run(late, 1, (q, inp, t) => { inp.x = -1; if (let2 < 0 && !q.wall) let2 = t; inp.jump = let2 >= 0 && Math.abs(t - let2 - 0.05) < C.step / 2; }, (q) => q.wall === -1);
  check('the jump is forgiving: asked a moment before the wall is touched, or a moment after it is let go, it is still a kick', early.wall === -1 && early.kicks === 1 && early.y > 6.4 && late.wall === -1 && late.kicks === 1 && late.y > 6.4, `${early.y.toFixed(1)} m and ${late.y.toFixed(1)} m`);
}
{
  // ---- the ledges
  const l = C.ledges[1], b = ledgeBox(l, {}), above = inAir((b.x0 + b.x1) / 2, l.y + 1.2), ev = run(above, 1, null, (q) => q.ground);
  const rest = { ...above }; run(above, 1.5); // (standing: nothing slides)
  const head = inAir((b.x0 + b.x1) / 2, l.y - 2.7, { vy: 7 }); let highest = 0; const evU = run(head, 0.5, (q) => { highest = Math.max(highest, q.y + C.tall); });
  const off = inAir((b.x0 + b.x1) / 2, l.y, { ground: true, on: 1 }); let fell = false; run(off, 1.2, (q, inp) => { inp.x = -l.side; if (!q.ground) fell = true; });
  check('a ledge: one lands on it and stands; one knocks one\'s head under it; one walks off its end, and falls', ev.some((e) => e.type === 'land' && e.ledge === 1) && above.ground && above.y === rest.y && evU.some((e) => e.type === 'bonk') && highest <= b.y0 + 0.01 && fell && off.y < l.y - 0.5);
  const dn = onWall(l.side, l.y + 1.5); run(dn, 3, null, (q) => q.ground);
  check('who slides down a wall onto a ledge stops there', dn.ground && dn.on === 1 && dn.y === l.y);
  const kick = onWall(-l.side, l.y - 0.9); let over = 0; run(kick, 3, (q, inp, t) => { inp.jump = first(t); inp.x = l.side; over = Math.max(over, q.y); }, (q) => q.ground);
  check('and one gets onto a ledge by a kick from the wall across, taken a metre below its top', kick.ground && kick.on === 1 && over > l.y, `over it at ${over.toFixed(1)} m, then down onto it`);
}
{
  // ---- the stones
  const a = rockAt(41, 80.3, {}), b = rockAt(41, 80.3, {}), R = C.rocks; let lanes = [0, 0, 0], lowest = 99, deep = 0, onLedge = 0, n = 0;
  for (let k = 0; k < 600; k++) { const r = rockAt(k, k * R.every + 0.01, {}); lanes[r.lane + 1]++; lowest = Math.min(lowest, r.stop); if (r.stop < R.mid) deep++; if (r.lane && C.ledges.some((l) => l.side === r.lane && Math.abs(r.stop - l.y - R.r) < 1e-9)) onLedge++; n++; }
  check('stones come down by the clock of the world, the same for everybody: along a wall or down the middle', JSON.stringify(a) === JSON.stringify(b) && lanes.every((v) => v > 90), `${lanes[0]} down the left wall, ${lanes[1]} down the middle, ${lanes[2]} down the right`);
  check('none gets below thirteen metres; one in two stops half-way; those of a wall break on its first ledge', lowest >= R.low && deep > 40 && deep < n * 0.5 && onLedge === lanes[0] + lanes[2], `${deep} of ${n} get below ${R.mid} m`);
  // a stone down the middle that goes low, and a climber in its way
  // a stone down the left wall, a climber holding that wall above its last ledge, another on the wall across
  let k = 0; while (rockAt(k, 0, {}).lane !== -1) k++;
  const when = k * R.every + (R.from - 36.6) / R.speed, hit = onWall(-1, 33, when), evH = run(hit, 0.6, (q, inp) => { inp.x = -1; }), missed = onWall(1, 36.6, when), evM = run(missed, 0.5, (q, inp) => { inp.x = 1; });
  check('a stone knocks off who is under it, and misses who is on the other wall', evH.some((e) => e.type === 'hit') && hit.hits === 1 && hit.stun > 0 && !hit.wall && !evM.some((e) => e.type === 'hit'));
  const dazed = inAir(wallAt(1, 34.8) - C.body - 0.02, 34.8, { vx: 2, stun: C.stun }), d1 = run(dazed, C.stun - 0.05), after = run(dazed, 2, (q, inp) => { inp.x = 1; }, (q) => !!q.wall || q.ground);
  check('knocked off, one holds nothing for a moment — then catches the wall again, or lands on its ledge', !d1.some((e) => e.type === 'cling') && (dazed.wall === 1 || (dazed.ground && dazed.on === 4)) && after.some((e) => e.type === 'cling' || e.type === 'land'), `${(34.8 - dazed.y).toFixed(1)} m lower${dazed.ground ? ', on the ledge below' : ''}`);
  // a stone down the right wall: who is under the last ledge of that wall is out of its way
  let m = 0; while (rockAt(m, 0, {}).lane !== 1) m++;
  const top = C.ledges[6], under = onWall(1, top.y - 2.6, m * R.every + (R.from - top.y) / R.speed - 0.5), evS = run(under, 1.2, (q, inp) => { inp.x = 1; });
  check('a ledge is a roof: the stones of its wall break on it', !evS.some((e) => e.type === 'hit') && rockAt(m, m * R.every + 10, {}).gone);
  const fall = inAir(0, 30.5, { stun: C.stun }), evF = run(fall, 6, null, (q) => q.ground);
  check('there is no net: who falls and catches nothing goes down to a ledge, or to the planks', fall.ground && evF.some((e) => e.type === 'land' && e.fell > 2.5) && fall.falls >= 0, `from 30 m to ${fall.y.toFixed(1)} m`);
}
{
  // ---- the arc drawn is the jump; the clock is the clock
  let worst = 0, n = 0;
  for (let y = 1; y < 38; y += 0.9) for (const side of [-1, 1]) {
    // (a dot every twentieth of a second: the jump is followed for as long, and compared dot by dot)
    const st = onWall(side, y), arc = leapArc(st, 12, []); if (!arc || !arc.length) { worst = 9; continue; }
    const inp = { x: 0, y: 0, jump: true }; stepClimb(st, C.step, inp, null); inp.jump = false;
    for (const p of arc) { for (let i = 0; i < 6 && !st.wall && !st.ground && !st.over; i++) stepClimb(st, C.step, inp, null); worst = Math.max(worst, Math.hypot(p[0] - st.x, p[1] - st.y)); }
    n++;
  }
  check('the way of the next jump, drawn in dots before the climber, is the way the jump goes', worst < 0.01 && leapArc(inAir(0, 5), 12, []) === null, `${n} jumps, dot for dot`);
  const one = startClimb(7), two = startClimb(7), acts = [], inp = { x: 0, y: 0, jump: false };
  for (let k = 0; k < 120 * 6; k++) { botInput(one, inp); acts.push({ ...inp }); stepClimb(one, C.step, inp, null); }
  for (let k = 0; k < acts.length;) { const m = 1 + (k % 5); for (let j = 0; j < m && k < acts.length; j++, k++) stepClimb(two, C.step, acts[k], null); }
  check('the same asks give the same climb, however the time is cut', Math.abs(one.y - two.y) < 1e-9 && one.x === two.x && one.kicks === two.kicks, `${one.y.toFixed(2)} m after six seconds`);
}
{
  // ---- it can be climbed
  const runs = [0, 0.4, 1.1, 1.7, 3.3, 7.7, 12.9, 31.3, 44.4, 58.6, 71.0, 123.4, 150.2, 301.9].map((t0) => botClimb(t0, 200));
  const times = runs.map((r) => r.time / 1000).sort((a, b) => a - b), median = times[Math.floor(times.length / 2)];
  check('a climber who reads the cleft gets to the bell, whenever it starts', runs.every((r) => r.over) && median < 20 && times[0] > 9 && times[times.length - 1] < 150, `${times[0].toFixed(1)} s at best, ${median.toFixed(1)} s more often than not, ${times[times.length - 1].toFixed(1)} s at worst; ${Math.max(...runs.map((r) => r.hits))} stone at most`);
  const naive = botClimb(0, 40, naiveInput);
  check('one who only hammers the jump stays on the planks: it takes a wall', !naive.over && naive.top < 2);
  const st = startClimb(0), seen = run(st, 60, (q, i) => botInput(q, i)), go = seen.find((e) => e.type === 'go'), top = seen.find((e) => e.type === 'top');
  check('the clock starts with the first jump and stops at the top', !!go && !!top && st.time === Math.round((st.clock - st.go) * 1000) && st.time > 0 && st.y >= C.height - 0.1);
  console.log(`\n  a rule for the board of its best times:  crack: { order: 'asc', min: ${Math.floor((times[0] * 0.6))}000, max: 1800_000 }   (the bot's best: ${times[0].toFixed(1)} s)`);
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
