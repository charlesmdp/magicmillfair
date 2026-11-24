// Checks of Head Over Heels, without a browser: the line hangs over the sea, clear of the pier, its gate on dry
// sand; gravity turns over only while one's feet are on a girder; who never turns it over falls at the first
// gap and is put back at a flag, the clock running on; the ends of the girders and the sky are falls too; from
// every flag there is a way to the end; a bot runs the line without a fall and every time it turns gravity over
// it had a good moment to do it in; another catches every spark.
// usage: node lab/games/flip/test.mjs
import { check, done, ground } from '../check.mjs';
import { BOUNDS, PIER } from '../../../src/world/layout/layout.js';
import { FLIP, FLAGS, startRun, backAt, stepRun, feetOf, speedAt, stretchAt, lineAt, botInput, botRun, fromFlag } from './rules.js';

const R = FLIP, G = R.girders, height = await ground();
const inside = (x, z, b = BOUNDS) => { let inn = false; for (let i = 0, j = b.length - 1; i < b.length; j = i++) if ((b[j][1] > z) !== (b[i][1] > z) && x < ((b[i][0] - b[j][0]) * (z - b[j][1])) / (b[i][1] - b[j][1]) + b[j][0]) inn = !inn; return inn; };
/** Runs `st` for `secs` (or until `stop`); `drive(st, input, t)` presses the key. Returns what happened. */
const run = (st, secs, drive, stop) => { const input = { flip: false }, events = [], seen = []; for (let t = 0; t < secs && !st.over; t += R.step) { input.flip = false; drive?.(st, input, t); stepRun(st, R.step, input, events); for (const e of events) seen.push({ ...e, at: t, s: st.s }); events.length = 0; if (stop?.(st, seen)) break; } return seen; };
/** A runner brought to metre `s` by the bot, then left to who drives. */
const runnerAt = (s, mode = 'mid') => { const st = startRun(0), input = { flip: false }; while (st.s < s && !st.over) { botInput(st, input, mode); stepRun(st, R.step, input, null); } st.bot = null; return st; };
const fmt = (ms) => `${(ms / 1000).toFixed(2)} s`;

{
  // ---- where it stands
  let dry = 0, out = 0, deep = 0;
  for (let s = 0; s <= R.length + 3; s += 2) { const p = lineAt(s), h = height(p.x, p.z); if (h > -0.4) dry++; if (!inside(p.x, p.z)) out++; deep = Math.min(deep, h); }
  const last = Math.max(...G.map((g) => g.to)), end = lineAt(last), clear = Math.min(R.side - PIER.headWidth / 2, R.side - PIER.width / 2);
  check('the line hangs over the sea, inside the bay, from just off the beach', dry === 0 && out === 0 && end.x < 215, `${R.length} m, the sea ${(-height(lineAt(0).x, lineAt(0).z)).toFixed(1)} m deep under its start and ${(-deep).toFixed(1)} m at most; it ends at x = ${end.x.toFixed(0)}`);
  check('it is clear of the pier: ten metres off the edge of its head', clear >= 9.5 && R.along + R.length > PIER.length, `${clear.toFixed(1)} m`);
  const gate = lineAt(R.gate), gh = height(gate.x, gate.z);
  check('one asks to run on dry sand, before the stairs', gh > 0.3 && gh < 2 && inside(gate.x, gate.z), `the gate at (${gate.x.toFixed(1)}, ${gate.z.toFixed(1)}), ${gh.toFixed(2)} m over the sea`);
  const lows = Math.min(...G.map((g) => g.bottom)), highs = Math.max(...G.map((g) => g.top));
  let cross = 0;
  for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) { const a = G[i], b = G[j]; if (a.from < b.to - 1e-9 && b.from < a.to - 1e-9 && a.bottom < b.top - 1e-9 && b.bottom < a.top - 1e-9) cross++; }
  check('the girders are between three and nine metres over the sea, and none is in another', lows >= 3 && highs <= 9 && cross === 0, `${G.length} of them, from ${lows.toFixed(1)} to ${highs.toFixed(1)} m`);
  const room = Math.min(R.levels.mid[0] - R.levels.floor, R.levels.ceiling - R.levels.mid[1]);
  check('a runner fits between a girder half-way and the floor, and between it and the ceiling', room > R.body.tall + 0.3, `${room.toFixed(1)} m for a runner of ${R.body.tall} m`);
  const P = R.sparks, inGirder = P.filter(([s, y]) => G.some((g) => s > g.from - 0.2 && s < g.to + 0.2 && y > g.bottom - 0.2 && y < g.top + 0.2)).length;
  check('the sparks hang in the open air, in the order one comes to them', P.length <= 30 && inGirder === 0 && P.every((p, k) => k === 0 || p[0] > P[k - 1][0]) && P.every(([s, y]) => s > 3 && s < R.length - 3 && y > R.levels.floor && y < R.levels.ceiling), `${P.length} of them, ${R.stretches.map((st, k) => P.filter((p) => stretchAt(p[0]) === k).length).join(' + ')} by stretch`);
  check('one runs faster and faster', speedAt(0) === R.speed[0] && speedAt(R.length) === R.speed[1] && speedAt(80) > speedAt(40) && R.speed[1] > R.speed[0] * 1.4, `${R.speed[0]} m/s at the start, ${R.speed[1]} at the end`);
}
{
  // ---- the key
  const st = startRun(0);
  run(st, 5, null, (q) => q.s >= 9.5);
  const before = { g: st.g, feet: feetOf(st) };
  const seen = run(st, 2, (q, i, t) => { i.flip = t === 0 || Math.abs(t - 0.1) < 1e-6; }, (q) => q.on >= 0 && q.g > 0);
  check('the key turns gravity over: from the floor one falls up to the underside of the ceiling, and runs on there head down', before.g === -1 && Math.abs(before.feet - R.levels.floor) < 1e-9 && st.g === 1 && Math.abs(feetOf(st) - R.levels.ceiling) < 1e-9 && G[st.on].kind === 'ceiling' && seen.some((e) => e.type === 'land' && e.up), `${seen.find((e) => e.type === 'land').at.toFixed(2)} s in the air`);
  check('not in the air: pressed again on the way up, it does nothing', st.flips === 1);
  // (a key pressed a moment before the feet touch still counts)
  const early = runnerAt(9.5); let pressed = false;
  run(early, 2, (q, i, t) => { i.flip = t === 0 || (!pressed && q.on < 0 && q.g > 0 && R.levels.ceiling - feetOf(q) < 0.6 && (pressed = true)); }, (q) => q.flips >= 2 || q.s > 14);
  check('a key pressed a moment before the feet touch still counts', early.flips === 2 && early.g === -1);
  // (and a moment after they have left the end of a girder)
  const late = (after) => { const q = startRun(0); run(q, 5, null, (w) => w.s >= 13.5); let left = -1; run(q, 2, (w, i, t) => { if (w.on < 0 && left < 0) left = t; i.flip = left >= 0 && Math.abs(t - left - after) < 1e-6; }, (w) => w.out > 0 || (w.on >= 0 && w.g > 0)); return q; };
  const just = late(0.05), gone = late(0.2);
  check('and a moment after they have left the end of a girder — no longer', just.flips === 1 && just.g === 1 && !(just.out > 0) && gone.flips === 0 && gone.out > 0);
}
{
  // ---- the falls
  const st = startRun(0), seen = run(st, 12);
  const first = seen.find((e) => e.type === 'fall'), back = seen.find((e) => e.type === 'back');
  check('who never turns gravity over falls into the sea at the first gap', first && first.kind === 'sea' && first.s > 14 && first.s < 18, first ? `at ${first.s.toFixed(1)} m, ${first.at.toFixed(1)} s after the start` : '');
  check('and is put back at the flag after a moment, to stand there a little — the clock running on', back && Math.abs(back.at - first.at - R.fall.out) < 0.02 && back.flag === 0 && st.falls >= 2 && st.s < 18 && Math.abs(st.clock - 12) < 0.02, `${R.fall.out} s out, ${R.fall.hold} s standing; ${st.falls} falls in twelve seconds`);
  const step = backAt(startRun(0), 1), into = run(step, 6, null, (q) => q.out > 0);
  check('running into the end of a girder is a fall: nobody climbs a step', into.some((e) => e.type === 'fall' && e.kind === 'crash') && step.s > 45.5 && step.s < 46.2, `at ${step.s.toFixed(1)} m`);
  const block = startRun(0), hit = run(block, 8, (q, i) => { i.flip = q.on >= 0 && ((q.flips === 0 && q.s >= 9) || (q.flips === 1 && q.s >= 19)); }, (q) => q.out > 0);
  check('so is running into a block', block.g === -1 && hit.some((e) => e.type === 'fall' && e.kind === 'crash') && block.s > 26.5 && block.s < 27.2, `at ${block.s.toFixed(1)} m`);
  const sky = startRun(0), up = run(sky, 3, (q, i, t) => { i.flip = t === 0; }, (q) => q.out > 0);
  check('and turning gravity over with nothing above: one is lost in the sky', up.some((e) => e.type === 'fall' && e.kind === 'sky'), `${up.find((e) => e.type === 'fall').at.toFixed(2)} s later`);
  const far = runnerAt(60), lost = run(far, 6, null, (q, ev) => ev.some((e) => e.type === 'back'));
  check('a fall puts one back at the last flag passed, on its feet', lost.some((e) => e.type === 'back' && e.flag === 1) && far.s === FLAGS[1].s && far.g === -1 && far.on === FLAGS[1].on && far.flag === 1);
}
{
  // ---- the way to the end
  const ways = FLAGS.map((f, k) => fromFlag(k));
  check('from every flag there is a way to the end', ways.every((v) => v >= 0) && FLAGS.every((f, k) => k === 0 || f.s - FLAGS[k - 1].s <= 45), `flags at ${FLAGS.map((f) => f.s).join(', ')} m`);
  // (put back at a flag, one has time to look before anything has to be done)
  const first = FLAGS.map((f, k) => { const q = backAt(startRun(0), k), inp = { flip: false }; let t = 0; while (!q.over && t < 30) { botInput(q, inp, 'late'); if (inp.flip) break; stepRun(q, R.step, inp, null); t += R.step; } return t; });
  check('put back at a flag one stands there a moment, then has more than half a second before gravity must be turned over', first.every((t) => t > 0.5) && R.fall.hold >= 0.4, first.map((t) => `${t.toFixed(1)} s`).join(', '));
  const mid = botRun('mid'), late = botRun('late'), early = botRun('early'), keen = botRun('keen');
  const sorted = [...mid.windows].sort((a, b) => a - b);
  check('a bot runs the line without a fall', mid.over && mid.falls === 0 && mid.flips === mid.windows.length, `${fmt(mid.time)} on the clock of the game (${mid.clock.toFixed(2)} s run, ${mid.sparks} sparks on its way), gravity turned over ${mid.flips} times`);
  check('every time it turns gravity over there was a quarter of a second, at least, to do it in', sorted[0] >= 0.25, `${sorted[0].toFixed(2)} s at the least, ${sorted[sorted.length >> 1].toFixed(2)} s in the middle, ${sorted[sorted.length - 1].toFixed(2)} s at the most`);
  check('who turns it over at the first moment gets there too, and who waits for the last', early.over && early.falls === 0 && late.over && late.falls === 0, `${early.sparks} and ${late.sparks} sparks`);
  check('every spark can be caught, all of them in one run', keen.over && keen.falls === 0 && keen.sparks === R.sparks.length, `${keen.sparks} of ${R.sparks.length}: ${fmt(keen.time)}, gravity turned over ${keen.flips} times, ${Math.min(...keen.windows).toFixed(2)} s for the tightest of them`);
  check('a run without a fall lasts the same for everybody: sparks and falls are what tell the runs apart', mid.clock === late.clock && mid.clock === keen.clock && keen.time === Math.round((keen.clock - keen.sparks * R.spark.worth) * 1000) && keen.time < mid.time, `${mid.clock.toFixed(2)} s; ${R.spark.worth} s off for each spark`);
  // (a fall costs more than any spark gives back)
  const st = startRun(0), input = { flip: false }; let missed = false;
  for (let t = 0; t < 120 && !st.over; t += R.step) { botInput(st, input, 'mid'); if (input.flip && !missed) { missed = true; input.flip = false; st.bot = null; run(st, 3, null, (q) => q.out > 0); } stepRun(st, R.step, input, null); }
  check('a fall costs more than a spark gives: the time out, the time standing, and the way again', st.over && st.falls === 1 && st.time - mid.time > (R.fall.out + R.fall.hold) * 1000, `${fmt(st.time)} with one fall`);
  const at = (dt) => { const q = startRun(0), inp = { flip: false }; let acc = 0; for (let t = 0; t < 120 && !q.over; t += dt) { acc += dt; while (acc >= R.step && !q.over) { acc -= R.step; botInput(q, inp, 'mid'); stepRun(q, R.step, inp, null); } } return q.time; };
  check('the same run at 30 and at 144 frames a second', at(1 / 30) === mid.time && at(1 / 144) === mid.time);
  // (no run can be shorter than that of the bot that catches every spark without a fall: the floor of the board)
  console.log(`      for the board of scores: flip: { order: 'asc', min: ${Math.floor(keen.time / 1000) * 1000}, max: 600_000 }`);
}
done();
