// Checks of Head Over Heels, without a browser: the machine stands in the sea, clear of the pier, its gate on dry
// sand; the course is four times as long and three times as tall as it was, and one runs it more than twice as
// fast at the end; gravity turns over only while one's feet are on a girder; a girder in the way pushes one back
// and out at the left end — unless one frees oneself in time; out, one is put back at a flag, the clock running
// on; every flag is reached and left; a bot runs the course without a fall, never held back, and every time it
// turns gravity over it had a good moment to do it in; another catches every spark; a start every ten seconds.
// usage: node lab/games/flip/test.mjs
import { check, done, ground } from '../check.mjs';
import { BOUNDS, PIER, pierToWorld } from '../../../src/world/layout/layout.js';
import { nextStart, STARTS } from '../kit.js';
import { FLIP, FLAGS, BOARD, startRun, backAt, stepRun, feetOf, lagOf, speedAt, stretchAt, frameAt, scrollAfter, secondsTo, botInput, botRun, fromFlag } from './rules.js';

const R = FLIP, G = R.girders, L = R.levels, height = await ground();
const under = (k) => L.base + k * L.rise, over = (k) => under(k) + L.thick;
const inside = (x, z, b = BOUNDS) => { let inn = false; for (let i = 0, j = b.length - 1; i < b.length; j = i++) if ((b[j][1] > z) !== (b[i][1] > z) && x < ((b[i][0] - b[j][0]) * (z - b[j][1])) / (b[i][1] - b[j][1]) + b[j][0]) inn = !inn; return inn; };
/** Runs `st` for `secs` (or until `stop`); `drive(st, input, t)` presses the key. Returns what happened. */
const run = (st, secs, drive, stop) => { const input = { flip: false }, events = [], seen = []; for (let t = 0; t < secs && !st.over; t += R.step) { input.flip = false; drive?.(st, input, t); stepRun(st, R.step, input, events); for (const e of events) seen.push({ ...e, at: t, s: st.s, lag: lagOf(st) }); events.length = 0; if (stop?.(st, seen)) break; } return seen; };
/** A runner brought to metre `s` by the bot, then left to who drives. */
const runnerAt = (s, mode = 'mid') => { const st = startRun(0), input = { flip: false }; while (st.s < s && !st.over) { botInput(st, input, mode); stepRun(st, R.step, input, null); } st.bot = null; return st; };
const fmt = (ms) => `${(ms / 1000).toFixed(2)} s`;
const first = { end: G.find((g) => g.kind === 'girder' && g.level === 0).to, above: G.find((g) => g.kind === 'girder' && g.level > 0), stud: G.find((g) => g.kind === 'stud') };

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
  check('the girders are on six levels, from three to eighteen and a half metres over the sea, and none is in another', levels.size === 6 && lows === under(0) && highs === over(5) && highs - lows >= 15 && cross === 0 && G.every((g) => g.to - g.from >= 1), `${G.length} of them (${G.filter((g) => g.kind !== 'girder').length} blocks), ${[...levels].sort().map((k) => G.filter((g) => g.kind === 'girder' && g.level === k).length).join(' + ')} by level`);
  check('a runner fits between a level and the next, on the one or under the other', L.rise - L.thick > R.body.tall + 0.3 && 2 * L.rise - L.thick - L.tooth > R.body.tall + 0.3, `${(L.rise - L.thick).toFixed(1)} m for a runner of ${R.body.tall} m; ${(2 * L.rise - L.thick - L.tooth).toFixed(1)} m past a block where the next girder is two levels away`);
  check('the course is more than four times as long as it was, in ten stretches, a flag at the start of each', R.length >= 4 * 158 && R.stretches.length === 10 && FLAGS.length === 10 && FLAGS.every((f, k) => f.s === k * R.apart && f.on >= 0 && G[f.on].from <= f.s - 0.5 && G[f.on].to >= f.s + 3) && R.stretches.every((s, k) => s.from === FLAGS[k].s && s.name), `${R.length} m: ${R.stretches.map((s) => s.name).join(', ')}`);
  const P = R.sparks, inGirder = P.filter(([s, y]) => G.some((g) => s > g.from - 0.2 && s < g.to + 0.2 && y > g.bottom - 0.2 && y < g.top + 0.2)).length;
  check('the sparks hang in the open air, in the order one comes to them', P.length >= 30 && inGirder === 0 && P.every((p, k) => k === 0 || p[0] >= P[k - 1][0]) && P.every(([s, y]) => s > 3 && s < R.length - 3 && y > under(0) && y < over(5)), `${P.length} of them, ${R.stretches.map((st, k) => P.filter((p) => stretchAt(p[0]) === k).length).join(' + ')} by stretch`);
  check('the girders go by faster and faster: more than twice as fast at the end', speedAt(0) === R.speed[0] && speedAt(R.length) === R.speed[1] && speedAt(400) > speedAt(200) && R.speed[1] >= R.speed[0] * 2.2 && R.speed[1] >= 16, `${R.speed[0]} m/s at the start, ${R.speed[1]} at the end; ${(R.window - R.place).toFixed(0)} m seen ahead: ${((R.window - R.place) / R.speed[0]).toFixed(1)} s of it at the start, ${((R.window - R.place) / R.speed[1]).toFixed(1)} s at the end`);
}
{
  // ---- the key
  const st = startRun(0);
  run(st, 5, null, (q) => q.s >= first.above.from + 1);
  const before = { g: st.g, feet: feetOf(st) };
  const seen = run(st, 2, (q, i, t) => { i.flip = t === 0 || Math.abs(t - 0.1) < 1e-6; }, (q) => q.on >= 0 && q.g > 0);
  check('the key turns gravity over: from the floor one falls up to the underside of the girder above, and runs on there head down', before.g === -1 && Math.abs(before.feet - over(0)) < 1e-9 && st.g === 1 && Math.abs(feetOf(st) - first.above.bottom) < 1e-9 && st.on === G.indexOf(first.above) && seen.some((e) => e.type === 'land' && e.up), `${seen.find((e) => e.type === 'land').at.toFixed(2)} s in the air, up to level ${first.above.level}`);
  check('not in the air: pressed again on the way up, it does nothing', st.flips === 1);
  // (a key pressed a moment before the feet touch still counts)
  const early = runnerAt(first.above.from + 1); let pressed = false;
  run(early, 2, (q, i, t) => { i.flip = t === 0 || (!pressed && q.on < 0 && q.g > 0 && first.above.bottom - feetOf(q) < 0.6 && (pressed = true)); }, (q) => q.flips >= 2 || q.s > first.above.to);
  check('a key pressed a moment before the feet touch still counts', early.flips === 2 && early.g === -1);
  // (and a moment after they have left the end of a girder)
  const late = (after) => { const q = startRun(0); run(q, 5, null, (w) => w.s >= first.end - 1); let left = -1; run(q, 2, (w, i, t) => { if (w.on < 0 && left < 0) left = t; i.flip = left >= 0 && Math.abs(t - left - after) < 1e-6; }, (w) => w.out > 0 || (w.on >= 0 && w.g > 0)); return q; };
  const just = late(0.05), gone = late(0.2);
  check('and a moment after they have left the end of a girder — no longer', just.flips === 1 && just.g === 1 && !(just.out > 0) && gone.flips === 0 && gone.out > 0);
  // (the longest way there is in the machine: from the lowest girder to the underside of the highest)
  const air = []; { const q = startRun(0), ev = []; let from = -1; for (let t = 0; t < 200 && !q.over; t += R.step) { botInput(q, ev.input || (ev.input = { flip: false }), 'mid'); stepRun(q, R.step, ev.input, ev); for (const e of ev) { if (e.type === 'flip') from = t; else if (e.type === 'land' && from >= 0) { air.push(t - from); from = -1; } } ev.length = 0; } }
  check('from the lowest girder to the highest one falls for three quarters of a second: never longer', Math.max(...air) <= 0.8 && Math.max(...air) > 0.7 && Math.min(...air) < 0.2, `${Math.max(...air).toFixed(2)} s at the most, ${Math.min(...air).toFixed(2)} s from a level to the next; one falls at ${R.fast} m/s at the most`);
}
{
  // ---- pushed back, and out
  const st = startRun(0), seen = run(st, 12);
  const fall = seen.find((e) => e.type === 'fall'), back = seen.find((e) => e.type === 'back');
  check('who never turns gravity over falls out below at the first gap', fall && fall.kind === 'sea' && fall.s > first.end && fall.s < first.end + 4, fall ? `at ${fall.s.toFixed(1)} m, ${fall.at.toFixed(1)} s after the start` : '');
  check('and is put back at the flag after a moment, to stand there a little — the clock running on', back && Math.abs(back.at - fall.at - R.fall.out) < 0.02 && back.flag === 0 && st.falls >= 2 && st.s < first.end + 4 && Math.abs(st.clock - 12) < 0.02, `${R.fall.out} s out, ${R.fall.hold} s standing; ${st.falls} falls in twelve seconds`);
  const sky = startRun(0), up = run(sky, 3, (q, i, t) => { i.flip = t === 0; }, (q) => q.out > 0);
  check('turning gravity over with nothing above: one is gone above', up.some((e) => e.type === 'fall' && e.kind === 'sky'), `${up.find((e) => e.type === 'fall').at.toFixed(2)} s later`);
  // (the first block of the course: the bot is brought to the girder it stands on, and does nothing more)
  const stud = first.stud, pushed = runnerAt(stud.from - 8), flag = pushed.flag, hit = run(pushed, 8, null, (q, ev) => ev.some((e) => e.type === 'back'));
  const bump = hit.find((e) => e.type === 'bump'), left = hit.find((e) => e.type === 'fall'), v = speedAt(stud.from);
  check('running into a block does not end the run at once: the block holds one back, one\'s feet still on the girder', bump && Math.abs(bump.s - (stud.from - R.body.half)) < 1e-6 && bump.lag < 0.2 && (!left || left.at > bump.at + 1), bump ? `at ${bump.s.toFixed(1)} m, against the first block of the course (on level ${stud.level})` : 'no bump');
  check('and pushes one towards the left end of the machine: out there, not before', left && left.kind === 'left' && Math.abs(left.s - bump.s) < 1e-6 && Math.abs(left.lag - (R.place - R.body.half)) < 0.2 && Math.abs(left.at - bump.at - (R.place - R.body.half) / v) < 0.1, left ? `${(left.at - bump.at).toFixed(2)} s after the block was met, ${left.lag.toFixed(1)} m behind one's place` : 'no fall');
  check('out, one is put back at the last flag passed, on its feet, the machine wound back with one', hit.some((e) => e.type === 'back' && e.flag === flag) && pushed.s === FLAGS[flag].s && pushed.scroll === FLAGS[flag].s - R.place && pushed.g === -1 && pushed.on === FLAGS[flag].on && flag === stretchAt(stud.from), `flag ${flag + 1}, at ${FLAGS[flag].s} m`);
  // (freed in time: gravity turned over while the block holds one back; then the bot takes the run to its end)
  const freed = (held) => { const q = runnerAt(stud.from - 8), inp = { flip: false }; let t = 0, at = -1, done = false, worst = 0, place = -1, free = -1; for (; t < 90 && !q.over && !q.falls; t += R.step) { inp.flip = false; if (at < 0 && q.held) at = t; if (at >= 0 && !done && t >= at + held) { inp.flip = done = true; } else if (done) botInput(q, inp, 'mid'); stepRun(q, R.step, inp, null); worst = Math.max(worst, lagOf(q)); if (done && free < 0 && !q.held) free = t; if (free >= 0 && place < 0 && lagOf(q) < 1e-6) place = t; } return { q, worst, back: place - free }; };
  const soon = freed(0.4), last = freed(1.2), gain = R.gain * v;
  check('freed in time — gravity turned over while the block holds one — one runs a little faster than the girders go by until one is back in one\'s place', soon.q.over && soon.q.falls === 0 && soon.worst > 3 && soon.back > 0 && Math.abs(soon.back - soon.worst / gain) < 0.5 && R.gain > 0.1 && R.gain < 0.5, `held for 0.4 s: ${soon.worst.toFixed(1)} m behind, back in its place ${soon.back.toFixed(1)} s later (${(R.gain * 100).toFixed(0)} % faster), and on to the arch`);
  check('even at the last moment, almost at the left end', last.q.over && last.q.falls === 0 && last.worst > R.place - 2 && last.worst < R.place - R.body.half, `held for 1.2 s: ${last.worst.toFixed(1)} m behind of the ${R.place} there are, back in its place ${last.back.toFixed(1)} s later`);
  // (the end of a girder met in the air holds one back as well: one slides along it and falls on)
  let slide = null, air = [], early = 0;
  for (let d = 1.5; d < 4.5 && !air.some((e) => e.type === 'bump'); d += 0.1) { early = d; slide = startRun(0); air = run(slide, 6, (q, i) => { i.flip = q.flips === 0 && q.on >= 0 && q.s >= first.above.from - d; }, (q) => q.out > 0 || (q.on >= 0 && q.g > 0)); }
  const met = air.find((e) => e.type === 'bump');
  check('the end of a girder met in the air holds one back as well, for as long as one is beside it', met && Math.abs(met.s - (first.above.from - R.body.half)) < 1e-6 && slide.on < 0 && slide.kind === 'sky', met ? `gravity turned over ${early.toFixed(1)} m before the first girder above begins: its end holds one for a moment (${met.lag.toFixed(2)} m lost), then one is gone above` : 'no bump');
}
{
  // ---- the flags
  const ways = FLAGS.map((f, k) => fromFlag(k));
  check('from every flag there is a way to the end', ways.every((v) => v >= 0), `flags every ${R.apart} m, on level ${[...new Set(FLAGS.map((f) => f.level))].join(', ')}`);
  // (put back at a flag, one has time to look before anything has to be done)
  const wait = FLAGS.map((f, k) => { const q = backAt(startRun(0), k), inp = { flip: false }; let t = 0; while (!q.over && t < 30) { botInput(q, inp, 'late'); if (inp.flip) break; stepRun(q, R.step, inp, null); t += R.step; } return t; });
  check('put back at a flag one stands there a moment, then has more than half a second before gravity must be turned over', wait.every((t) => t > 0.5) && R.fall.hold >= 0.4, wait.map((t) => `${t.toFixed(1)} s`).join(', '));
  const next = FLAGS.map((f, k) => { const q = backAt(startRun(0), k), inp = { flip: false }, to = k + 1 < FLAGS.length ? FLAGS[k + 1].s : R.length; let t = 0; while (!q.over && q.s < to && !q.falls && t < 30) { botInput(q, inp, 'mid'); stepRun(q, R.step, inp, null); t += R.step; } return { t, ok: !q.falls && q.s >= to - 1e-6 && (q.over || q.flag === k + 1) }; });
  check('every flag is reached and left: from each, the bot gets to the next without a fall', next.every((n) => n.ok), next.map((n) => `${n.t.toFixed(1)} s`).join(', '));
}
{
  // ---- the way to the end
  const mid = botRun('mid'), late = botRun('late'), early = botRun('early'), keen = botRun('keen');
  const all = mid.windows.map((w) => w.width).sort((a, b) => a - b), third = mid.windows.filter((w) => w.s < R.length / 3).map((w) => w.width), rest = mid.windows.filter((w) => w.s >= R.length / 3).map((w) => w.width);
  check('a bot runs the course without a fall, and no girder ever holds it back', mid.over && mid.falls === 0 && mid.held === 0 && mid.flips === mid.windows.length, `${fmt(mid.time)} on the clock of the game (${mid.clock.toFixed(2)} s run, ${mid.sparks} sparks on its way), gravity turned over ${mid.flips} times`);
  check('every time it turns gravity over there was a fifth of a second, at least, to do it in — three tenths in the first third of the course', Math.min(...rest) >= 0.2 && Math.min(...third) >= 0.3, `${Math.min(...third).toFixed(2)} s at the least in the first third, ${Math.min(...rest).toFixed(2)} s after it; ${all[all.length >> 1].toFixed(2)} s in the middle, ${all[all.length - 1].toFixed(2)} s at the most`);
  const per = R.stretches.map((s, k) => mid.windows.filter((w) => stretchAt(w.s) === k).length), secs = R.stretches.map((s, k) => secondsTo((k + 1) * R.apart) - secondsTo(k * R.apart));
  const pace = (a, b) => per.slice(a, b).reduce((x, y) => x + y, 0) / secs.slice(a, b).reduce((x, y) => x + y, 0);
  check('and the moments to decide come closer together as one goes: more than twice as often in the last three stretches as in the first three', pace(7, 10) > 2 * pace(0, 3) && pace(3, 7) > pace(0, 3), `${per.join(' + ')} by stretch, in ${secs.map((s) => s.toFixed(1)).join(', ')} s: one every ${(1 / pace(0, 3)).toFixed(1)} s, then every ${(1 / pace(3, 7)).toFixed(1)} s, then every ${(1 / pace(7, 10)).toFixed(1)} s`);
  check('who turns it over at the first moment gets there too, and who waits for the last', early.over && early.falls === 0 && early.held === 0 && late.over && late.falls === 0 && late.held === 0, `${early.sparks} and ${late.sparks} sparks`);
  check('every spark can be caught, all of them in one run', keen.over && keen.falls === 0 && keen.held === 0 && keen.sparks === R.sparks.length, `${keen.sparks} of ${R.sparks.length}: ${fmt(keen.time)}, gravity turned over ${keen.flips} times, ${Math.min(...keen.windows.map((w) => w.width)).toFixed(2)} s for the tightest of them`);
  check('a run nothing holds back lasts the same for everybody: sparks and falls are what tell the runs apart', mid.clock === late.clock && mid.clock === keen.clock && Math.abs(mid.clock - secondsTo(R.length)) < 0.05 && mid.clock > 60 && mid.clock < 65 && keen.time === Math.round((keen.clock - keen.sparks * R.spark.worth) * 1000) && keen.time < mid.time, `${mid.clock.toFixed(2)} s; ${R.spark.worth} s off for each spark`);
  // (a fall costs more than any spark gives back)
  const st = startRun(0), input = { flip: false }; let missed = false;
  for (let t = 0; t < 240 && !st.over; t += R.step) { botInput(st, input, 'mid'); if (input.flip && !missed) { missed = true; input.flip = false; st.bot = null; run(st, 3, null, (q) => q.out > 0); } stepRun(st, R.step, input, null); }
  check('a fall costs more than a spark gives: the time out, the time standing, and the way again', st.over && st.falls === 1 && st.time - mid.time > (R.fall.out + R.fall.hold) * 1000, `${fmt(st.time)} with one fall`);
  const at = (dt) => { const q = startRun(0), inp = { flip: false }; let acc = 0; for (let t = 0; t < 240 && !q.over; t += dt) { acc += dt; while (acc >= R.step && !q.over) { acc -= R.step; botInput(q, inp, 'mid'); stepRun(q, R.step, inp, null); } } return q.time; };
  check('the same run at 30 and at 144 frames a second', at(1 / 30) === mid.time && at(1 / 144) === mid.time);
  // ---- the starts: every ten seconds on the clock everybody shares
  const s0 = nextStart(100_000, R.every, STARTS, R.count), s1 = nextStart(s0.at + 1, R.every, STARTS, R.count), s2 = nextStart(s0.at - R.count * 1000 - 1, R.every, STARTS, R.count);
  check('a start every ten seconds on the clock everybody shares, each with its name: who asks in time leaves with it', s1.at - s0.at === R.every * 1000 && s0.at % (R.every * 1000) === 0 && s0.name !== s1.name && s2.n === s0.n && s0.wait >= R.count && s0.wait < R.every + R.count, `${STARTS.length} names; one waits ${R.count} to ${R.count + R.every} s`);
  // (who is not running sees the girders of the latest start where its runners see them: the scroll of a run nothing holds back)
  const q = startRun(0), inp = { flip: false }; let off = 0;
  for (let k = 1; k <= 7 * 120; k++) { botInput(q, inp, 'mid'); stepRun(q, R.step, inp, null); if (k % 60 === 0) off = Math.max(off, Math.abs(q.scroll - scrollAfter(k * R.step))); }
  check('who looks on sees the girders where the runners of the latest start see them', q.falls === 0 && off < 0.02 && scrollAfter(0) === -R.place && Math.abs(scrollAfter(1e4) - (R.length - R.place)) < 1e-6, `${(off * 1000).toFixed(1)} mm apart at the most in the first seven seconds`);
  // (no run can be shorter than that of the bot that catches every spark without a fall: the floor of the board)
  const line = { order: 'asc', min: Math.floor(keen.time / 1000) * 1000, max: 600_000 };
  console.log(`      for the board of scores: flip: { order: '${line.order}', min: ${line.min}, max: ${String(line.max).replace(/(\d)(?=(\d{3})+$)/g, '$1_')} }`);
  check('the line of its board of scores is the one its rules give', BOARD.order === line.order && BOARD.min === line.min && BOARD.max === line.max, `${BOARD.order}, from ${BOARD.min} to ${BOARD.max} ms`);
}
done();
