// Checks of the water slide ("Mostly Down"), without a browser: the course is sound (it holds together, clears
// the ground, never runs into itself), what lies in it leaves a way through, the ride is the same on every
// device, and a bot gets down it — carefully without a scratch, boldly through every shortcut.
// usage: node tools/slide-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SLIDE, slideCourse, lineAt, rimAt } from '../src/world/zones/games/slide/track.js';
import { RIDE, startRide, stepRide, botInput, botRun, rideProgress } from '../src/world/zones/games/slide/ride.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const fmt = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;

const course = slideCourse(), P = course.main.points, R = SLIDE.radius;

// ------------------------------------------------------------------------------------------------ the line
{
  const first = P[0], last = P[P.length - 1];
  check('the line leaves the deck and ends by the gate', Math.hypot(first.x - SLIDE.top.x, first.z - SLIDE.top.z) < 0.01 && Math.hypot(last.x - SLIDE.gate.x, last.z - SLIDE.gate.z) < 12, `${course.length.toFixed(0)} m long, ${(first.y - last.y).toFixed(0)} m down, ends ${Math.hypot(last.x - SLIDE.gate.x, last.z - SLIDE.gate.z).toFixed(1)} m from the gate`);
  let gap = 0, kink = 0, steep = 0, flat = 9, tight = 1e9;
  for (let i = 1; i < P.length; i++) {
    gap = Math.max(gap, Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y, P[i].z - P[i - 1].z));
    kink = Math.max(kink, Math.abs(Math.atan2(Math.sin(P[i].yaw - P[i - 1].yaw), Math.cos(P[i].yaw - P[i - 1].yaw))));
    steep = Math.max(steep, P[i].slope); flat = Math.min(flat, P[i].slope);
    if (Math.abs(P[i].k) > 1e-6) tight = Math.min(tight, 1 / Math.abs(P[i].k));
  }
  check('it is one smooth line: no gap, no kink', gap < SLIDE.step * 1.2 && kink < 0.08, `longest step ${gap.toFixed(2)} m, sharpest turn between two samples ${kink.toFixed(3)} rad`);
  check('it always goes down, never too steeply, and no bend is too tight', flat > 0 && steep < 0.36 && tight > 17, `slopes ${(flat * 100).toFixed(1)} % to ${(steep * 100).toFixed(0)} %, tightest radius ${tight.toFixed(1)} m`);
  check('the stretches follow one another without a hole', course.stretches.every((s, i) => i === 0 || Math.abs(s.from - course.stretches[i - 1].to) < 1.5) && Math.abs(course.finish - course.stretches[course.stretches.length - 1].from) < 1e-9, course.stretches.map((s) => `${s.name} ${s.from.toFixed(0)}`).join(' · '));
  // where it passes over itself, there is room for someone to slide underneath
  let closest = 1e9;
  for (let i = 0; i < P.length; i += 2) for (let j = i + 50; j < P.length; j += 2) {
    if (Math.abs(P[i].x - P[j].x) < 3.6 && Math.abs(P[i].z - P[j].z) < 3.6) closest = Math.min(closest, Math.abs(P[i].y - P[j].y));
  }
  check('where the line passes over itself there is room underneath', closest > 5, `least height between two passes: ${closest.toFixed(1)} m`);
}

// ------------------------------------------------------------------------------------------------ the shortcuts
for (const f of course.forks) {
  const a = lineAt(course.main, f.from), b = lineAt(course.main, f.to), p0 = f.points[0], p1 = f.points[f.points.length - 1];
  const off = Math.abs(Math.atan2(Math.sin(p1.yaw - b.yaw), Math.cos(p1.yaw - b.yaw)));
  let tight = 1e9, steep = 0;
  for (const p of f.points) { if (Math.abs(p.k) > 1e-6) tight = Math.min(tight, 1 / Math.abs(p.k)); steep = Math.max(steep, p.slope); }
  check(`${f.name}: leaves the line and comes back to it exactly`, Math.hypot(p0.x - a.x, p0.y - a.y, p0.z - a.z) < 0.05 && Math.hypot(p1.x - b.x, p1.y - b.y, p1.z - b.z) < 0.05 && off < 0.08, `arrives ${off.toFixed(3)} rad off the heading of the line`);
  check(`${f.name}: shorter, steeper and tighter than what it cuts`, f.length < (f.to - f.from) * 0.75 && tight > 9 && steep < 0.36, `${f.length.toFixed(0)} m for ${(f.to - f.from).toFixed(0)} m, radius ${tight.toFixed(1)} m, up to ${(steep * 100).toFixed(0)} %`);
  // the ridge between the two troughs: nothing at the very point where they part, the whole rim once they are apart
  const mine = f.side < 0 ? -1 : 1;
  check(`${f.name}: the two troughs part round a ridge that grows`, rimAt(course.main, f.from + 1, mine) < 0.2 && rimAt(course.main, f.from + 24, mine) > SLIDE.rim - 0.01 && rimAt(f, 1, -mine) < 0.2 && rimAt(f, 26, -mine) > SLIDE.rim - 0.01);
}

// ------------------------------------------------------------------------------------------------ the ground
{
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/world/world.json'), 'utf8'));
  const { data, info } = await sharp(path.join(ROOT, 'public/assets/world/height.png')).raw().toBuffer({ resolveWithObject: true });
  const [lo, hi] = meta.heightRange, N = info.width, half = N / 2;
  const ground = (x, z) => { const i = (Math.floor(Math.min(half - 1, Math.max(-half, z)) + half) * N + Math.floor(Math.min(half - 1, Math.max(-half, x)) + half)) * info.channels; return Math.max(0, ((data[i] * 256 + data[i + 1]) / 65535) * (hi - lo) + lo); };
  // the trough, across its whole width, clears the ground everywhere but where it sits on it: the deck, and the
  // last metres down to the sand (where it may bed a little into the bank)
  let least = 1e9, where = 0, bedded = 0;
  const lines = [course.main, ...course.forks];
  for (const line of lines) for (const p of line.points) {
    const rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw);
    let g = 0;
    for (const o of [-3.2, -1.6, 0, 1.6, 3.2]) g = Math.max(g, ground(p.x + rx * o, p.z + rz * o));
    const room = p.y - 0.4 - g, resting = line === course.main && (p.s < 7 || p.s > course.length - 48);
    if (resting) bedded = Math.min(bedded, room); else if (room < least) { least = room; where = Math.round(p.s); }
  }
  check('the trough clears the ground across its whole width', least > 1.2, `least room ${least.toFixed(1)} m (at metre ${where}); it beds ${(-bedded).toFixed(1)} m into the ground at most where it rests on it`);
  check('where it rests on the ground it is not buried', bedded > -2.2);
  const villages = (meta.sky || []).map((v) => Math.min(...P.map((p) => Math.hypot(p.x - v.x, p.z - v.z))));
  check('it keeps away from the sky villages', Math.min(...villages) > 30, `nearest village: ${Math.min(...villages).toFixed(0)} m`);
  check('the gate stands on dry sand', ground(SLIDE.gate.x, SLIDE.gate.z) > 1 && ground(SLIDE.gate.x, SLIDE.gate.z) < 4, `${ground(SLIDE.gate.x, SLIDE.gate.z).toFixed(1)} m above the sea`);
}

// ------------------------------------------------------------------------------------------------ what lies in the trough
{
  const lineOf = (id) => (id < 0 ? course.main : course.forks[id]);
  const buoys = course.things.filter((t) => t.kind === 'buoy'), boosts = course.things.filter((t) => t.kind === 'boost');
  check('there are buoys and strips of light, on the line and in the shortcuts', buoys.length > 20 && boosts.length > 5 && course.forks.every((f) => course.things.some((t) => t.line === f.id)), `${buoys.length} buoys, ${boosts.length} strips`);
  check('nothing on the launch, nothing in the run-out, nothing on the way into a shortcut', course.things.every((t) => t.line >= 0 || (t.s > 60 && t.s < course.finish - 30 && !course.forks.some((f) => t.s > f.from - 44 && t.s < f.from + 16))));
  check('every buoy floats inside the trough', buoys.every((t) => Math.abs(t.a) + t.r / R < rimAt(lineOf(t.line), t.s, Math.sign(t.a) || 1) - 0.02));
  // every row of buoys leaves a way through, wide enough for a rider
  const need = 2 * RIDE.body + 0.12;
  let narrowest = 1e9;
  for (const t of buoys) {
    const row = buoys.filter((o) => o.line === t.line && Math.abs(o.s - t.s) < 2.5).map((o) => o.a).sort((x, y) => x - y), line = lineOf(t.line);
    const edges = [-rimAt(line, t.s, -1), ...row, rimAt(line, t.s, 1)];
    let widest = 0;
    for (let i = 0; i + 1 < edges.length; i++) widest = Math.max(widest, (edges[i + 1] - edges[i]) * R - (i === 0 ? t.r : 2 * t.r) + (i === 0 || i + 1 === edges.length - 1 ? t.r : 0) - (i === 0 && i + 1 === edges.length - 1 ? 0 : 0));
    narrowest = Math.min(narrowest, widest);
  }
  check('every row of buoys leaves a way through for a rider', narrowest > need, `the narrowest of the widest ways: ${narrowest.toFixed(2)} m (a rider is ${(2 * RIDE.body).toFixed(1)} m wide)`);
  const marks = course.marks.map((m) => m.s);
  check('the arches one is put back at come in order, the first at the top, none in a shortcut or beside a low side',
    marks[0] === 0 && marks.every((s, i) => i === 0 || s > marks[i - 1] + 30) && marks.every((s) => !course.forks.some((f) => s > f.from - 10 && s < f.from + 16) && !course.open.some((o) => s > o.from - 10 && s < o.to + 4)), marks.map((s) => s.toFixed(0)).join(' '));
  check('where the outer side is low, the trough is barely banked', course.open.length >= 2 && course.open.every((o) => Math.abs(lineAt(course.main, (o.from + o.to) / 2).bank) < 0.3 && rimAt(course.main, (o.from + o.to) / 2, o.side) < SLIDE.low + 0.02));
}

// ------------------------------------------------------------------------------------------------ the ride
{
  // the same run, whatever the frame rate
  const ride = (dt) => { const st = startRide(course), input = {}; for (let t = 0; t < 400 && !st.over; t += dt) { botInput(st, 'careful', input); stepRide(st, dt, input); } return st.time; };
  const t30 = ride(1 / 30), t144 = ride(1 / 144), t60 = ride(1 / 60);
  check('a ride takes the same time at 30, 60 and 144 frames a second', Math.abs(t30 - t60) < 60 && Math.abs(t144 - t60) < 60, `${fmt(t30)} · ${fmt(t60)} · ${fmt(t144)}`);

  const careful = botRun(course, 'careful'), bold = botRun(course, 'bold'), plain = botRun(course, { bold: true, cuts: false });
  check('a careful rider gets down without flying out, hardly touching a buoy', careful.over && careful.falls === 0 && careful.bumps <= 1, `${fmt(careful.time)}, ${careful.bumps} buoy${careful.bumps === 1 ? '' : 's'}`);
  check('a bold rider takes both shortcuts and is clearly faster', bold.over && bold.falls === 0 && bold.took.length === course.forks.length && bold.time < careful.time - 5000, `${fmt(bold.time)}, top speed ${(bold.top * 3.6).toFixed(0)} km/h`);
  check('the shortcuts are worth taking', bold.time < plain.time - 2000, `${fmt(plain.time)} without them`);
  // nobody gets stuck: someone who touches nothing, someone who brakes all the way
  const drift = (input) => { const st = startRide(course); for (let t = 0; t < 900 && !st.over; t += RIDE.step) stepRide(st, RIDE.step, input); return st; };
  const idle = drift({ steer: 0 }), slow = drift({ steer: 0, brake: true });
  check('a rider who touches nothing gets to the bottom, far behind', idle.over && idle.time > careful.time + 10000, `${fmt(idle.time)}, ${idle.bumps} buoys, out ${idle.falls} time${idle.falls === 1 ? '' : 's'}`);
  check('a rider who brakes all the way gets there too', slow.over && slow.time < 8 * 60000, fmt(slow.time));
  // over a low side: out, back at the last arch, the clock still running
  const o = course.open[0], st = startRide(course), events = [];
  Object.assign(st, { s: o.from + 8, v: 24, a: o.side * 0.3, mark: course.marks.findLastIndex((m) => m.s <= o.from) });
  const mark = course.marks[st.mark].s;
  let outAt = -1, backAt = -1;
  for (let t = 0; t < 8 && backAt < 0; t += RIDE.step) { stepRide(st, RIDE.step, { steer: o.side, tuck: true }, events); for (const e of events) { if (e.type === 'out') outAt = st.clock; if (e.type === 'back') backAt = st.clock; } events.length = 0; }
  check('too fast and too wide where the side is low: out, then back at the last arch with the clock running', outAt >= 0 && backAt > outAt + 1 && Math.abs(rideProgress(st) - mark) < 2 && st.falls === 1, `out after ${outAt.toFixed(1)} s, back at metre ${mark.toFixed(0)} ${(backAt - outAt).toFixed(1)} s later`);
  // what the leaderboard should believe: nothing much under the best the bot can do
  console.log(`      suggested rule for the board of scores: slide: { order: 'asc', min: ${Math.floor((bold.time * 0.78) / 1000) * 1000}, max: 3600_000 }`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
