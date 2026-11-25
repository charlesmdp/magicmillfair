// Checks of Head Over Heels, without a browser: the machine stands in the sea, clear of the pier, its gate on dry
// sand; the course is a thousand metres long, in fourteen stretches, and one runs it more than two and a half
// times as fast at the end; gravity turns over only while one's feet are on something; a girder in the way
// pushes one back and out at the left end — unless one frees oneself in time; out, one drops back in near one's
// place after a moment, the machine never winding back, three seconds on one's time; a bot runs the course
// without a fall, never held back, and every time it turns gravity over it had a good moment to do it in;
// another catches every spark; a start every ten seconds. And several runners of one start, each fed the
// others a tenth of a second late as the network would: they land on each other, hold each other back, catch up.
// usage: node lab/games/flip/test.mjs
import { check, done, ground } from '../check.mjs';
import { BOUNDS, PIER, pierToWorld } from '../../../src/world/layout/layout.js';
import { nextStart, STARTS } from '../kit.js';
import { FLIP, FLAGS, BOARD, MACHINE, startRun, backAt, stepRun, feetOf, lagOf, chaseAt, speedAt, stretchAt, frameAt, scrollAfter, secondsTo, scoreOf, boxOf, botInput, botRun, fromFlag, wayOn } from './rules.js';

const R = FLIP, G = R.girders, L = R.levels, height = await ground();
const under = (k) => L.base + k * L.rise, over = (k) => under(k) + L.thick;
const inside = (x, z, b = BOUNDS) => { let inn = false; for (let i = 0, j = b.length - 1; i < b.length; j = i++) if ((b[j][1] > z) !== (b[i][1] > z) && x < ((b[i][0] - b[j][0]) * (z - b[j][1])) / (b[i][1] - b[j][1]) + b[j][0]) inn = !inn; return inn; };
/** Runs `st` for `secs` (or until `stop`); `drive(st, input, t)` presses the key. Returns what happened. */
const run = (st, secs, drive, stop) => { const input = { flip: false }, events = [], seen = []; for (let t = 0; t < secs && !st.over; t += R.step) { input.flip = false; drive?.(st, input, t); stepRun(st, R.step, input, events); for (const e of events) seen.push({ ...e, at: t, s: st.s, lag: lagOf(st) }); events.length = 0; if (stop?.(st, seen)) break; } return seen; };
/** A runner brought to metre `s` by the bot, then left to who drives. */
const runnerAt = (s, mode = 'mid') => { const st = startRun(0), input = { flip: false }; while (st.s < s && !st.over) { botInput(st, input, mode); stepRun(st, R.step, input, null); } st.bot = null; return st; };
const fmt = (ms) => `${(ms / 1000).toFixed(2)} s`;
const first = { end: G.find((g) => g.kind === 'girder' && g.level === 0).to, above: G.find((g) => g.kind === 'girder' && g.level > 0), stud: G.find((g) => g.kind === 'stud') };
const named = (name) => { const k = R.stretches.findIndex((s) => s.name === name), a = R.stretches[k].from, b = k + 1 < R.stretches.length ? R.stretches[k + 1].from : R.length; return G.filter((g) => g.from < b && g.to > a); };

{
  // ---- where it stands
  let dry = 0, out = 0, deep = 0, clear = 1e9;
  for (let x = -1.4; x <= R.window + 1.4; x += 1.4) { const p = frameAt(x), h = height(p.x, p.z); if (h > -0.4) dry++; if (!inside(p.x, p.z)) out++; deep = Math.min(deep, h); clear = Math.min(clear, R.side - (R.along + x >= PIER.length - PIER.headLength ? PIER.headWidth : PIER.width) / 2); }
  const a = frameAt(0), b = frameAt(R.window);
  check('the machine stands in the sea, inside the bay', dry === 0 && out === 0, `${R.window} m between its towers, from (${a.x.toFixed(0)}, ${a.z.toFixed(0)}) to (${b.x.toFixed(0)}, ${b.z.toFixed(0)}); the sea ${(-height(a.x, a.z)).toFixed(1)} m deep under its left end and ${(-deep).toFixed(1)} m at most`);
  check('it is clear of the pier: ten metres off the edge of its head', clear >= 9.5 && R.along + R.window < PIER.length, `${clear.toFixed(1)} m`);
  const gate = pierToWorld(R.gate.along, R.gate.side), gh = height(gate[0], gate[1]);
  check('one asks to run on dry sand, the machine out at sea ahead', gh > 0.3 && gh < 2 && inside(gate[0], gate[1]) && R.along - R.gate.along > 20, `the gate at (${gate[0].toFixed(1)}, ${gate[1].toFixed(1)}), ${gh.toFixed(2)} m over the sea, ${(R.along - R.gate.along).toFixed(0)} m from the left tower`);
  // ---- the course
  const lows = Math.min(...G.map((g) => g.bottom)), highs = Math.max(...G.map((g) => g.top)), levels = new Set(G.filter((g) => g.kind === 'girder').map((g) => g.level));
  let cross = 0;
  for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) { const p = G[i], q = G[j]; if (p.from < q.to - 1e-9 && q.from < p.to - 1e-9 && p.bottom < q.top - 1e-9 && q.bottom < p.top - 1e-9) cross++; }
  check('the girders are on six levels, from three to eighteen and a half metres over the sea, and none is in another', levels.size === 6 && lows === under(0) && highs === over(5) && highs - lows >= 15 && cross === 0 && G.every((g) => g.to - g.from >= 1), `${G.length} of them (${G.filter((g) => g.kind === 'stud' || g.kind === 'fang').length} blocks, ${G.filter((g) => g.kind === 'post').length} pillars), ${[...levels].sort().map((k) => G.filter((g) => g.kind === 'girder' && g.level === k).length).join(' + ')} by level`);
  check('a runner fits between a level and the next, on the one or under the other', L.rise - L.thick > R.body.tall + 0.3 && 2 * L.rise - L.thick - L.tooth > R.body.tall + 0.3, `${(L.rise - L.thick).toFixed(1)} m for a runner of ${R.body.tall} m; ${(2 * L.rise - L.thick - L.tooth).toFixed(1)} m past a block where the next girder is two levels away`);
  check('a thousand metres of course, in fourteen stretches, a flag at the start of each', R.length === 1000 && R.stretches.length === 14 && FLAGS.length === 14 && FLAGS.every((f, k) => f.s === k * R.apart && f.on >= 0 && G[f.on].from <= f.s - 0.5 && G[f.on].to >= f.s + 3) && R.stretches.every((s, k) => s.from === FLAGS[k].s && s.name), `${R.length} m: ${R.stretches.map((s) => s.name).join(', ')}`);
  // (what the new stretches are made of)
  const posts = (name) => named(name).filter((g) => g.kind === 'post'), frames = posts('The Frames');
  const framed = frames.every((p) => G.some((g) => g.kind === 'girder' && Math.abs(g.top - p.bottom) < 1e-9 && g.from <= p.from + 1e-6 && g.to >= p.to - 1e-6) && G.some((g) => g.kind === 'girder' && Math.abs(g.bottom - p.top) < 1e-9 && g.from <= p.from + 1e-6 && g.to >= p.to - 1e-6));
  const sc = named('The Scatter'), scA = R.stretches.find((s) => s.name === 'The Scatter').from, longest = (lv) => Math.max(...sc.filter((g) => g.kind === 'girder' && g.level === lv && g.from <= scA + 1).map((g) => g.to - g.from));
  const bits = sc.filter((g) => g.kind === 'girder' && g.level > 0 && g.level < 5), wide = named('Wide Open').filter((g) => g.kind === 'girder');
  const cs = named('Crossing Stairs').filter((g) => g.kind === 'girder' && g.level > 0 && g.level < 5 && g.to - g.from < 12);
  check('hollow frames, a field of blocks, wide open flights, crossing stairs', frames.length >= 4 && framed && longest(0) >= R.apart - 1 && longest(5) >= R.apart - 1 && bits.length >= 8 && new Set(bits.map((g) => g.level)).size === 4 && wide.some((g) => g.to - g.from > 15) && cs.length >= 6 && new Set(cs.map((g) => g.level)).size === 4,
    `${frames.length / 2} frames of two girders and two pillars; ${bits.length} short girders on four levels between a floor and a ceiling of ${longest(0).toFixed(0)} m; flights over ${Math.max(...wide.map((g) => g.to - g.from)).toFixed(0)} m girders; ${cs.length} steps of the crossing stairs`);
  const P = R.sparks, inGirder = P.filter(([s, y]) => G.some((g) => s > g.from - 0.2 && s < g.to + 0.2 && y > g.bottom - 0.2 && y < g.top + 0.2)).length;
  check('the sparks hang in the open air, in the order one comes to them', P.length >= 40 && inGirder === 0 && P.every((p, k) => k === 0 || p[0] >= P[k - 1][0]) && P.every(([s, y]) => s > 3 && s < R.length - 3 && y > under(0) && y < over(5)), `${P.length} of them, ${R.stretches.map((st, k) => P.filter((p) => stretchAt(p[0]) === k).length).join(' + ')} by stretch`);
  check('the girders go by faster and faster: more than two and a half times as fast at the end', speedAt(0) === R.speed[0] && speedAt(R.length) === R.speed[1] && speedAt(600) > speedAt(300) && R.speed[1] >= R.speed[0] * 2.5 && R.speed[1] <= 19, `${R.speed[0]} m/s at the start, ${R.speed[1]} at the end; ${(R.window - R.place).toFixed(0)} m seen ahead: ${((R.window - R.place) / R.speed[0]).toFixed(1)} s of it at the start, ${((R.window - R.place) / R.speed[1]).toFixed(1)} s at the end`);
}
{
  // ---- the key
  const st = startRun(0);
  run(st, 5, null, (q) => q.s >= first.above.from + 1);
  const before = { g: st.g, feet: feetOf(st) };
  const seen = run(st, 2, (q, i, t) => { i.flip = t === 0 || Math.abs(t - 0.1) < 1e-6; }, (q) => q.on >= 0 && q.g > 0);
  check('the key turns gravity over: from the floor one falls up to the underside of the girder above, and runs on there head down', before.g === -1 && Math.abs(before.feet - over(0)) < 1e-9 && st.g === 1 && Math.abs(feetOf(st) - first.above.bottom) < 1e-9 && st.on === G.indexOf(first.above) && seen.some((e) => e.type === 'land' && e.up), `${seen.find((e) => e.type === 'land').at.toFixed(2)} s in the air, up to level ${first.above.level}`);
  check('not in the air: pressed again on the way up, it does nothing', st.flips === 1);
  const early = runnerAt(first.above.from + 1); let pressed = false;
  run(early, 2, (q, i, t) => { i.flip = t === 0 || (!pressed && q.on < 0 && q.g > 0 && first.above.bottom - feetOf(q) < 0.6 && (pressed = true)); }, (q) => q.flips >= 2 || q.s > first.above.to);
  check('a key pressed a moment before the feet touch still counts', early.flips === 2 && early.g === -1);
  const late = (after) => { const q = startRun(0); run(q, 5, null, (w) => w.s >= first.end - 1); let left = -1; run(q, 2, (w, i, t) => { if (w.on < 0 && left < 0) left = t; i.flip = left >= 0 && Math.abs(t - left - after) < 1e-6; }, (w) => w.out > 0 || (w.on >= 0 && w.g > 0)); return q; };
  const just = late(0.05), gone = late(0.2);
  check('and a moment after they have left the end of a girder — no longer', just.flips === 1 && just.g === 1 && !(just.out > 0) && gone.flips === 0 && gone.out > 0);
  const air = []; { const q = startRun(0), ev = []; let from = -1; for (let t = 0; t < 200 && !q.over; t += R.step) { botInput(q, ev.input || (ev.input = { flip: false }), 'mid'); stepRun(q, R.step, ev.input, ev); for (const e of ev) { if (e.type === 'flip') from = t; else if (e.type === 'land' && from >= 0) { air.push(t - from); from = -1; } } ev.length = 0; } }
  check('from the lowest girder to the highest one falls for three quarters of a second: never longer', Math.max(...air) <= 0.8 && Math.max(...air) > 0.7 && Math.min(...air) < 0.2, `${Math.max(...air).toFixed(2)} s at the most, ${Math.min(...air).toFixed(2)} s from a level to the next; one falls at ${R.fast} m/s at the most`);
}
{
  // ---- pushed back, and out
  const st = startRun(0), seen = run(st, 12);
  const fall = seen.find((e) => e.type === 'fall'), back = seen.find((e) => e.type === 'back');
  check('who never turns gravity over falls out below at the first gap', fall && fall.kind === 'sea' && fall.s > first.end && fall.s < first.end + 4, fall ? `at ${fall.s.toFixed(1)} m, ${fall.at.toFixed(1)} s after the start` : '');
  const falls = seen.filter((e) => e.type === 'fall').length;
  check('and drops back in after a moment, near its place — the machine not wound back, three seconds on its time for each fall', back && Math.abs(back.at - fall.at - R.fall.out) < 0.02 && Math.abs(R.fall.out - 1.2) < 1e-9 && back.lag < 3 && back.s > fall.s && st.falls === falls && falls >= 2 && Math.abs(st.scroll - scrollAfter(st.clock)) < 0.02 && Math.abs(st.clock - 12) < 0.02 && scoreOf(st) === Math.round((st.clock + R.fall.cost * st.falls - R.spark.worth * st.sparks) * 1000) && R.fall.cost === 3,
    back ? `back in ${(back.at - fall.at).toFixed(2)} s later, ${back.s.toFixed(1)} m along (${back.lag.toFixed(1)} m behind its place); ${falls} falls in twelve seconds: ${fmt(scoreOf(st))} on its clock` : 'never back');
  const sky = startRun(0), up = run(sky, 3, (q, i, t) => { i.flip = t === 0; }, (q) => q.out > 0);
  check('turning gravity over with nothing above: one is gone above', up.some((e) => e.type === 'fall' && e.kind === 'sky'), `${up.find((e) => e.type === 'fall').at.toFixed(2)} s later`);
  const stud = first.stud, pushed = runnerAt(stud.from - 8), hit = run(pushed, 8, null, (q, ev) => ev.some((e) => e.type === 'back'));
  const bump = hit.find((e) => e.type === 'bump'), left = hit.find((e) => e.type === 'fall'), home = hit.find((e) => e.type === 'back'), v = speedAt(stud.from);
  check('running into a block does not end the run at once: the block holds one back, one\'s feet still on the girder', bump && bump.by === 'girder' && Math.abs(bump.s - (stud.from - R.body.half)) < 1e-6 && bump.lag < 0.2 && (!left || left.at > bump.at + 1), bump ? `at ${bump.s.toFixed(1)} m, against the first block of the course (on level ${stud.level})` : 'no bump');
  check('and pushes one towards the left end of the machine: out there, not before', left && left.kind === 'left' && Math.abs(left.s - bump.s) < 1e-6 && Math.abs(left.lag - (R.place - R.body.half)) < 0.2 && Math.abs(left.at - bump.at - (R.place - R.body.half) / v) < 0.1, left ? `${(left.at - bump.at).toFixed(2)} s after the block was met, ${left.lag.toFixed(1)} m behind one's place` : 'no fall');
  check('out, one drops back in past the block, near one\'s place, with a way on to the end', home && home.s > stud.to && home.lag < 4 && wayOn(pushed) >= 0 && Math.abs(pushed.scroll - scrollAfter(pushed.clock)) < 0.02, home ? `at ${home.s.toFixed(1)} m, ${home.lag.toFixed(1)} m behind its place` : 'never back');
  const freed = (held) => { const q = runnerAt(stud.from - 8), inp = { flip: false }; let t = 0, at = -1, done = false, worst = 0, place = -1, free = -1; for (; t < 120 && !q.over && !q.falls; t += R.step) { inp.flip = false; if (at < 0 && q.held) at = t; if (at >= 0 && !done && t >= at + held) { inp.flip = done = true; } else if (done) botInput(q, inp, 'mid'); stepRun(q, R.step, inp, null); worst = Math.max(worst, lagOf(q)); if (done && free < 0 && !q.held) free = t; if (free >= 0 && place < 0 && lagOf(q) < 1e-6) place = t; } return { q, worst, back: place - free }; };
  const soon = freed(0.4), last = freed(1.2);
  check('freed in time — gravity turned over while the block holds one — one runs faster than the girders go by until one is back in one\'s place: the further behind, the faster', soon.q.over && soon.q.falls === 0 && soon.worst > 3 && soon.back > 0 && soon.back < soon.worst / (R.chase.gain * v) && chaseAt(12) > chaseAt(4) && chaseAt(4) > chaseAt(0.5) && chaseAt(0) === 0, `held for 0.4 s: ${soon.worst.toFixed(1)} m behind, back in its place ${soon.back.toFixed(1)} s later (${(chaseAt(0.5) * 100).toFixed(0)} % faster half a metre behind, ${(chaseAt(4) * 100).toFixed(0)} % four metres behind, ${(chaseAt(12) * 100).toFixed(0)} % twelve), and on to the arch`);
  check('even at the last moment, almost at the left end', last.q.over && last.q.falls === 0 && last.worst > R.place - 2 && last.worst < R.place - R.body.half, `held for 1.2 s: ${last.worst.toFixed(1)} m behind of the ${R.place} there are, back in its place ${last.back.toFixed(1)} s later`);
  let slide = null, air = [], early = 0;
  for (let d = 1.5; d < 4.5 && !air.some((e) => e.type === 'bump'); d += 0.1) { early = d; slide = startRun(0); air = run(slide, 6, (q, i) => { i.flip = q.flips === 0 && q.on >= 0 && q.s >= first.above.from - d; }, (q) => q.out > 0 || (q.on >= 0 && q.g > 0)); }
  const met = air.find((e) => e.type === 'bump');
  check('the end of a girder met in the air holds one back as well, for as long as one is beside it', met && Math.abs(met.s - (first.above.from - R.body.half)) < 1e-6 && slide.on < 0 && slide.kind === 'sky', met ? `gravity turned over ${early.toFixed(1)} m before the first girder above begins: its end holds one for a moment (${met.lag.toFixed(2)} m lost), then one is gone above` : 'no bump');
}
{
  // ---- the flags, and falls anywhere
  const ways = FLAGS.map((f, k) => fromFlag(k));
  check('from every flag there is a way to the end', ways.every((v) => v >= 0), `flags every ${R.apart} m, on level ${[...new Set(FLAGS.map((f) => f.level))].join(', ')}`);
  const next = FLAGS.map((f, k) => { const q = backAt(startRun(0), k), inp = { flip: false }, to = k + 1 < FLAGS.length ? FLAGS[k + 1].s : R.length; let t = 0; while (!q.over && q.s < to && !q.falls && t < 30) { botInput(q, inp, 'mid'); stepRun(q, R.step, inp, null); t += R.step; } return { t, ok: !q.falls && q.s >= to - 1e-6 && (q.over || q.flag === k + 1) }; });
  check('every flag is reached and left: from each, the bot gets to the next without a fall', next.every((n) => n.ok), next.map((n) => `${n.t.toFixed(1)} s`).join(', '));
  // (a fall every so many metres of the bot's way: where it drops back in, how far behind, how long before it must turn gravity over)
  const st = startRun(0), inp = { flip: false }, backs = [];
  for (let at = 20; !st.over; ) {
    botInput(st, inp, 'mid'); stepRun(st, R.step, inp, null);
    if (st.s < at || st.over || st.on < 0) continue;
    at += 25;
    const q = { ...st, got: st.got.slice(), bot: null, out: R.fall.out, falls: st.falls + 1 }, ev = [];
    for (;;) { stepRun(q, R.step, null, ev); if (ev.some((e) => e.type === 'back')) break; }
    const way = wayOn(q);
    const i2 = { flip: false }; let t = 0; while (!q.over && t < 10) { botInput(q, i2, 'late'); if (i2.flip) break; stepRun(q, R.step, i2, null); t += R.step; }
    backs.push({ lag: ev.find((e) => e.type === 'back').lag, way, wait: q.over ? 9 : t });
  }
  const worst = Math.max(...backs.map((b) => b.lag)), roomy = backs.filter((b) => b.wait >= 0.25).length;
  check('a fall anywhere: one drops back in near one\'s place, with a way on to the end, most often a moment before anything is to be done', backs.length >= 35 && backs.every((b) => b.way >= 0) && worst < 12 && roomy >= 0.9 * backs.length, `${backs.length} falls along the bot's way: back in ${(backs.reduce((a, b) => a + b.lag, 0) / backs.length).toFixed(1)} m behind one's place on the average, ${worst.toFixed(1)} m at the most; a quarter of a second or more before gravity must be turned over for ${roomy} of them, ${Math.min(...backs.map((b) => b.wait)).toFixed(2)} s at the least`);
}
let keen = null;
{
  // ---- the way to the end
  const mid = botRun('mid'), late = botRun('late'), early = botRun('early');
  keen = botRun('keen');
  const all = mid.windows.map((w) => w.width).sort((a, b) => a - b), third = mid.windows.filter((w) => w.s < R.length / 3).map((w) => w.width), rest = mid.windows.filter((w) => w.s >= R.length / 3).map((w) => w.width);
  check('a bot runs the course without a fall, and no girder ever holds it back', mid.over && mid.falls === 0 && mid.held === 0 && mid.flips === mid.windows.length, `${fmt(mid.time)} on the clock of the game (${mid.clock.toFixed(2)} s run, ${mid.sparks} sparks on its way), gravity turned over ${mid.flips} times`);
  check('every time it turns gravity over there was a fifth of a second, at least, to do it in — three tenths in the first third of the course', Math.min(...rest) >= 0.2 && Math.min(...third) >= 0.3, `${Math.min(...third).toFixed(2)} s at the least in the first third, ${Math.min(...rest).toFixed(2)} s after it; ${all[all.length >> 1].toFixed(2)} s in the middle, ${all[all.length - 1].toFixed(2)} s at the most`);
  const per = R.stretches.map((s, k) => mid.windows.filter((w) => stretchAt(w.s) === k).length), secs = R.stretches.map((s, k) => secondsTo(k + 1 < R.stretches.length ? (k + 1) * R.apart : R.length) - secondsTo(k * R.apart));
  const pace = (a, b) => per.slice(a, b).reduce((x, y) => x + y, 0) / secs.slice(a, b).reduce((x, y) => x + y, 0);
  check('and the moments to decide come closer together as one goes: more than twice as often in the last four stretches as in the first four', pace(10, 14) > 2 * pace(0, 4) && pace(4, 10) > pace(0, 4), `${per.join(' + ')} by stretch: one every ${(1 / pace(0, 4)).toFixed(1)} s, then every ${(1 / pace(4, 10)).toFixed(1)} s, then every ${(1 / pace(10, 14)).toFixed(1)} s`);
  check('who turns it over at the first moment gets there too, and who waits for the last', early.over && early.falls === 0 && early.held === 0 && late.over && late.falls === 0 && late.held === 0, `${early.sparks} and ${late.sparks} sparks`);
  check('every spark can be caught, all of them in one run', keen.over && keen.falls === 0 && keen.held === 0 && keen.sparks === R.sparks.length, `${keen.sparks} of ${R.sparks.length}: ${fmt(keen.time)}, gravity turned over ${keen.flips} times, ${Math.min(...keen.windows.map((w) => w.width)).toFixed(2)} s for the tightest of them`);
  check('one\'s time: the time the machine takes, the same for everybody, plus three seconds for each fall, less a quarter of a second for each spark', mid.clock === late.clock && mid.clock === keen.clock && Math.abs(mid.clock - MACHINE) < 1e-9 && Math.abs(MACHINE - secondsTo(R.length)) < 0.05 && MACHINE > 80 && MACHINE < 90 && keen.time === Math.round((MACHINE - keen.sparks * R.spark.worth) * 1000) && keen.time < mid.time, `the machine takes ${MACHINE.toFixed(2)} s`);
  const st = startRun(0), input = { flip: false }; let missed = false;
  for (let t = 0; t < 240 && !st.over; t += R.step) { botInput(st, input, 'mid'); if (input.flip && !missed) { missed = true; input.flip = false; st.bot = null; run(st, 3, null, (q) => q.out > 0); } stepRun(st, R.step, input, null); }
  check('a fall costs three seconds, more than a dozen sparks give back, and the run ends with everybody\'s', st.over && st.falls === 1 && st.time === Math.round((MACHINE + R.fall.cost - st.sparks * R.spark.worth) * 1000) && st.time > mid.time && R.fall.cost >= 12 * R.spark.worth, `${fmt(st.time)} with one fall`);
  const at = (dt) => { const q = startRun(0), inp = { flip: false }; let acc = 0; for (let t = 0; t < 240 && !q.over; t += dt) { acc += dt; while (acc >= R.step && !q.over) { acc -= R.step; botInput(q, inp, 'mid'); stepRun(q, R.step, inp, null); } } return q.time; };
  check('the same run at 30 and at 144 frames a second', at(1 / 30) === mid.time && at(1 / 144) === mid.time);
  // ---- the starts: every ten seconds on the clock everybody shares
  const s0 = nextStart(100_000, R.every, STARTS, R.count), s1 = nextStart(s0.at + 1, R.every, STARTS, R.count), s2 = nextStart(s0.at - R.count * 1000 - 1, R.every, STARTS, R.count);
  check('a start every ten seconds on the clock everybody shares, each with its name: who asks in time leaves with it', s1.at - s0.at === R.every * 1000 && s0.at % (R.every * 1000) === 0 && s0.name !== s1.name && s2.n === s0.n && s0.wait >= R.count && s0.wait < R.every + R.count, `${STARTS.length} names; one waits ${R.count} to ${R.count + R.every} s`);
  const q = startRun(0), inp = { flip: false }; let off = 0;
  for (let k = 1; k <= 7 * 120; k++) { botInput(q, inp, 'mid'); stepRun(q, R.step, inp, null); if (k % 60 === 0) off = Math.max(off, Math.abs(q.scroll - scrollAfter(k * R.step))); }
  check('who looks on sees the girders where the runners of the latest start see them', q.falls === 0 && off < 0.02 && scrollAfter(0) === -R.place && Math.abs(scrollAfter(1e4) - (R.length - R.place)) < 1e-6, `${(off * 1000).toFixed(1)} mm apart at the most in the first seven seconds`);
}
{
  // ---- several runners of one start. Each is given the others as the network would: where each was in the
  // window a tenth of a second ago (its place across the window, the height of its feet), turned into a box
  const LATE = Math.round(0.1 / R.step);
  /** Runs `team` (runners with an id) together for `secs`; `drive(st, input, t, k)` presses the keys; `stop(team)`. */
  const together = (team, secs, drive, stop) => {
    const past = team.map((q) => (q.past = q.past || [])), prev = team.map((q) => (q.prev = q.prev || {})), seen = team.map(() => []), input = { flip: false }, ev = [];
    for (let t = 0; t < secs && !team.every((q) => q.over); t += R.step) {
      team.forEach((q, k) => past[k].push(q.out > 0 || q.over ? null : { x: q.s - q.scroll, y: feetOf(q) }));
      team.forEach((q, k) => {
        const boxes = [];
        team.forEach((o, j) => { const p = past[j][past[j].length - 1 - LATE]; if (j === k || !p) return; const b = boxOf(o.id, p.x, p.y, q.scroll, prev[k][o.id], R.step, LATE * R.step); prev[k][o.id] = b; boxes.push(b); });
        input.flip = false; drive?.(q, input, t, k);
        stepRun(q, R.step, input, ev, boxes);
        for (const e of ev) seen[k].push({ ...e, at: t, s: q.s }); ev.length = 0;
      });
      if (stop?.(team, t)) break;
    }
    return seen;
  };
  /** A runner of the start at flag `k`, moved on `ahead` metres with the machine, then `lag` metres behind its place. */
  const runner = (id, k = 0, lag = 0, ahead = 0) => { const q = backAt(startRun(0), k); q.id = id; q.s += ahead - lag; q.scroll += ahead; return q; };
  {
    // (one falls onto the head of another, and both run on; the one below turns gravity over: the two stand on each
    // other; it turns it back: it is on its girder again, the other on its head)
    const a = runner('A'), b = runner('B');
    b.on = -1; b.c = a.c + R.body.tall + 6;
    const ev = together([a, b], 1.0);
    const onHead = b.on === -2 && b.ride === 'A' && Math.abs(feetOf(b) - (a.c + R.body.tall / 2)) < 0.2 && a.on >= 0 && b.s === a.s && lagOf(a) === 0 && lagOf(b) === 0 && !a.falls && !b.falls;
    const ev2 = together([a, b], 0.4, (q, i, t) => { i.flip = q.id === 'A' && t === 0; });
    const each = a.on === -2 && a.ride === 'B' && b.on === -2 && b.ride === 'A' && a.g === 1 && b.g === -1 && Math.abs(feetOf(a) - feetOf(b)) < 0.2;
    together([a, b], 0.5, (q, i, t) => { i.flip = q.id === 'A' && t === 0; });
    const again = a.on >= 0 && a.g === -1 && b.on === -2 && b.ride === 'A' && !a.falls && !b.falls;
    check('one lands on the head of another and both run on; the one below turns gravity over: they stand on each other; it turns it back, the other is on its head still', onHead && each && again && ev[1].some((e) => e.type === 'land' && e.runner) && ev2[0].some((e) => e.type === 'land' && e.runner),
      `B on A's head ${ev[1].find((e) => e.type === 'land')?.at.toFixed(2)} s after the start, the two side by side at their place; A head down on B's feet; A back on its girder; nobody fell`);
  }
  {
    // (two runners whose gravities are opposite, one on the floor, one under the ceiling, turn gravity over at once:
    // they meet half-way, stop against each other and run on there; one turns it over again: the other falls on with it)
    const k = R.stretches.findIndex((s) => s.name === 'Wide Open'), a = runner('C', k), b = runner('D', k);
    b.g = 1; b.on = -1; b.c = under(5) - R.body.tall / 2 - 0.01;
    together([a, b], 0.9, (q, i, t) => { i.flip = Math.abs(t - 0.15) < 1e-6; });
    const mid = (feetOf(a) + feetOf(b)) / 2, gap = feetOf(b) - feetOf(a), stuck = a.on === -2 && b.on === -2 && a.g === 1 && b.g === -1 && Math.abs(gap) < 0.5 && Math.abs(mid - (over(0) + under(5)) / 2) < 0.5 && !a.falls && !b.falls;
    const ev = together([a, b], 0.6, (q, i, t) => { i.flip = q.id === 'D' && t === 0; });
    const on = b.on >= 0 && G[b.on].level === 5 && a.on === -2 && a.ride === 'D' && a.g === 1 && !a.falls && !b.falls && ev[0].some((e) => e.type === 'land' && e.runner);
    check('two runners whose gravities are opposite meet half-way between floor and ceiling, stop against each other and run on there, each standing on the other; when one turns gravity over, the other falls on with it', stuck && on,
      `they stand feet to feet ${mid.toFixed(1)} m over the sea (${gap < 0 ? `${(-gap).toFixed(2)} m in each other` : `${gap.toFixed(2)} m apart`}); D turns gravity over: it goes up to the ceiling, C after it, and C hangs from D`);
  }
  {
    // (three runners on an unbroken floor, the second four metres behind its place, the third eight: they catch up
    // and queue behind the first)
    const k = R.stretches.findIndex((s) => s.name === 'The Scatter'), floor = FLAGS[k].on, start = G[floor].from + 8.5 - FLAGS[k].s;
    const a = runner('A', k, 0, start), b = runner('B', k, 3.5, start), c = runner('C', k, 7, start), gaps = [];
    const ev = together([a, b, c], 1.3, null, (team, t) => { if (Math.abs(t % 0.25) < R.step / 2) gaps.push([a.s - b.s, b.s - c.s]); });
    const closeB = gaps[0][0] - gaps[1][0], closeC = gaps[0][1] - gaps[1][1] + closeB;
    const tight = 2 * R.body.half - R.others.shrink;
    check('who is behind runs faster than the girders go by, the further behind the faster, and catches up', [a, b, c].every((q) => q.on === floor) && closeC > closeB && closeB > 0.5 && lagOf(a) === 0, `in the first quarter of a second B (3.5 m behind) gains ${closeB.toFixed(2)} m, C (7 m behind) ${closeC.toFixed(2)} m`);
    check('one cannot run through another: running into its back holds one, and one queues behind it', b.held && b.by === 'runner' && c.held && c.by === 'runner' && Math.abs(a.s - b.s - tight) < 0.02 && Math.abs(b.s - c.s - tight) < 0.02 && !a.held && ev[1].some((e) => e.type === 'bump' && e.by === 'runner') && !a.falls && !b.falls && !c.falls,
      `A at its place, B ${(a.s - b.s).toFixed(2)} m behind it, C ${(b.s - c.s).toFixed(2)} m behind B and ${lagOf(c).toFixed(2)} m behind its place, held`);
  }
  {
    // (boxes that appear late: two runners in one another from the start pass through each other; a box that springs
    // up just in front of one is not solid for a moment, and one runs through it)
    const a = runner('A'), b = runner('B');
    together([a, b], 1.0);
    const clean = !a.held && !b.held && !a.falls && !b.falls && lagOf(a) === 0 && lagOf(b) === 0 && a.s === b.s;
    const q = runner('Q', 0, 2), input = { flip: false }, ev = [], x = q.s + R.body.half * 2 + 0.05 - q.scroll; let held = 0;
    for (let t = 0; t < 0.6; t += R.step) { stepRun(q, R.step, input, ev, [boxOf('X', x, over(0), q.scroll)]); if (q.held) held++; }
    const passed = held === 0 && q.s > q.scroll + x && !q.falls;
    // (and one that has been there long enough holds one back)
    const w = runner('W', 0, 2), seen = [];
    for (let t = 0; t < 1; t += R.step) stepRun(w, R.step, input, seen, [boxOf('X', x + 0.6, over(0), w.scroll)]);
    check('nobody falls because of a box that appears late: two runners in one another pass through each other, one that springs up in front is passed through', clean && passed && w.held && w.by === 'runner',
      `two runners side by side from the start: neither holds the other; a box 0.05 m in front of a runner that catches up: passed through, not solid for ${R.others.settle} s; one 0.6 m further on, seen for longer: held behind it`);
    // (a fall of one runner: its scroll is everybody's; it comes back in clear of the others, three seconds on its time)
    const d = runner('D'), e = runner('E'), f = runner('F');
    const evF = together([d, e, f], 6, (st, i) => { if (st.id !== 'D' || st.falls) botInput(st, i, 'mid'); });
    const back = evF[0].find((z) => z.type === 'back'), fall = evF[0].find((z) => z.type === 'fall');
    check('a fall costs three seconds and leaves the scroll where it is: the one who fell drops back in among the others, and on', fall && back && d.scroll === e.scroll && e.scroll === f.scroll && d.falls === 1 && !e.falls && !f.falls && scoreOf(d) - scoreOf(e) === R.fall.cost * 1000 + (e.sparks - d.sparks) * R.spark.worth * 1000,
      fall && back ? `D did nothing and fell (${fall.kind}) at ${fall.s.toFixed(1)} m; back in ${(back.at - fall.at).toFixed(1)} s later, ${back.lag.toFixed(1)} m behind its place; ${fmt(scoreOf(d))} against ${fmt(scoreOf(e))} for the others` : 'no fall');
  }
  {
    // (three bots of one start, each in its own way, the whole course, each given the two others late)
    const team = ['mid', 'early', 'late'].map((m, k) => { const q = startRun(0); q.id = m; return q; });
    const t0 = Date.now();
    const seen = together(team, 200, (q, i) => botInput(q, i, q.id));
    const bumps = seen.map((e) => e.filter((x) => x.type === 'bump' && x.by === 'runner').length), rides = seen.map((e) => e.filter((x) => x.type === 'land' && x.runner).length);
    check('three bots of one start, each given the others a tenth of a second late, all get to the arch, the machine the same for all', team.every((q) => q.over && q.scroll === team[0].scroll) && team.every((q) => q.time === Math.round((MACHINE + q.falls * R.fall.cost - q.sparks * R.spark.worth) * 1000)),
      `${team.map((q) => `${q.id}: ${fmt(q.time)}, ${q.falls} fall${q.falls === 1 ? '' : 's'}`).join('; ')}; ${bumps.reduce((a, b) => a + b, 0)} times held by another, ${rides.reduce((a, b) => a + b, 0)} landings on another (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
}
{
  // (no run can be shorter than that of the bot that catches every spark without a fall: the floor of the board)
  const line = { order: 'asc', min: Math.floor(keen.time / 1000) * 1000, max: 600_000 };
  console.log(`      for the board of scores: flip: { order: '${line.order}', min: ${line.min}, max: ${String(line.max).replace(/(\d)(?=(\d{3})+$)/g, '$1_')} }`);
  check('the line of its board of scores is the one its rules give', BOARD.order === line.order && BOARD.min === line.min && BOARD.max === line.max, `${BOARD.order}, from ${BOARD.min} to ${BOARD.max} ms`);
}
done();
