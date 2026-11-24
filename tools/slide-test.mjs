// Checks of the water slide ("Mostly Down"), without a browser: the course is sound (it holds together, clears
// the ground, never runs into itself, ends over the sea a swim from the beach), what lies or moves in it can be
// got past, the ride is the same on every device and plays as it should — the water carries, the walls slow,
// one jumps the rolls and the gaps, gets by the propellers of the long pool and round its buffers, keeps out of
// the whirlpools; over the rim one flies, and rides on from whatever trough one comes down into — the pipe
// beside the pool, a turn of the slide below — or is put back when the count runs out — and a bot gets down
// it: carefully without a scratch, boldly through every shortcut.
// usage: node tools/slide-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SLIDE, WALL, MILL, PIPE, slideCourse, lineAt, lineOf, frameAt, rimAt, gapAt, sliderAt, propAt } from '../src/world/zones/games/slide/track.js';
import { RIDE, startRide, stepRide, ridePose, rideFall, botInput, botRun, rideProgress } from '../src/world/zones/games/slide/ride.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const fmt = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const course = slideCourse(), P = course.main.points, R = SLIDE.radius;
const mainThings = course.things.filter((t) => t.line < 0), of = (kind) => mainThings.filter((t) => t.kind === kind);

// the ground of the world, as the game reads it (metres above the sea; under the sea it is negative)
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/world/world.json'), 'utf8'));
const { data, info } = await sharp(path.join(ROOT, 'public/assets/world/height.png')).raw().toBuffer({ resolveWithObject: true });
const [lo, hi] = meta.heightRange, N = info.width, half = N / 2;
const height = (x, z) => { const i = (Math.floor(Math.min(half - 1, Math.max(-half, z)) + half) * N + Math.floor(Math.min(half - 1, Math.max(-half, x)) + half)) * info.channels; return ((data[i] * 256 + data[i + 1]) / 65535) * (hi - lo) + lo; };
const ground = (x, z) => Math.max(0, height(x, z));
/** From (x, z) in the sea: how far to where the bed is `level` or higher, and which way. */
const shore = (x, z, level) => {
  let best = { d: 99, a: 0 };
  for (let k = 0; k < 180; k++) for (let d = 0.25; d < best.d; d += 0.25) { const a = (k / 180) * Math.PI * 2; if (height(x + Math.sin(a) * d, z + Math.cos(a) * d) > level) { best = { d, a }; break; } }
  return best;
};

/** A rider put at metre `s` of the main line, going at `v`, `u` metres across: see stepRide. */
const riderAt = (s, v, u = 0, clock = 0) => { const st = startRide(course); Object.assign(st, { s, v, u, clock, floor: lineAt(course.main, s).F, mark: Math.max(0, course.marks.findLastIndex((m) => m.s <= s)) }); return st; };
/** Runs a ride for `secs` (or until `stop(st)`); `drive(st, input, t)` presses the keys. Returns what happened. */
const run = (st, secs, drive, stop) => {
  const input = { steer: 0, tuck: false, brake: false, jump: false }, events = [], seen = [];
  for (let t = 0; t < secs; t += RIDE.step) {
    drive?.(st, input, t);
    stepRide(st, RIDE.step, input, events); input.jump = false;
    for (const e of events) seen.push({ ...e, at: t, s: rideProgress(st) });
    events.length = 0;
    if (stop?.(st, seen)) break;
  }
  return seen;
};
/** Steers to stay `u` metres across. */
const hold = (u) => (q, i) => { i.steer = clamp((u - q.u) * 2.8 - q.w * 0.6, -1, 1); };
/** The course without what lies in its water: only the trough itself. */
const bare = (fn) => { const things = course.things; course.things = []; course._byLine = null; try { return fn(); } finally { course.things = things; course._byLine = null; } };
/** What a rider who has left the trough comes down onto, where there is no trough: the ground of the valley, or the sea. */
const under = (x, z, out) => { const g = height(x, z); out.wet = g < 0.5; out.y = out.wet ? 0 : g; return out; };
/** Where a point is, relative to the main line: { s (metres along it), lat (to its right), up (over its floor), F }. */
const beside = (x, y, z) => {
  let best = null, least = Infinity;
  for (const p of P) { const d = (x - p.x) ** 2 + (y - p.y) ** 2 + (z - p.z) ** 2; if (d < least) { least = d; best = p; } }
  const f = frameAt(best), dx = x - best.x, dy = y - best.y, dz = z - best.z;
  return { s: best.s + dx * best.tx + dy * best.ty + dz * best.tz, lat: dx * f.side[0] + dy * f.side[1] + dz * f.side[2], up: dx * f.up[0] + dy * f.up[1] + dz * f.up[2], F: best.F };
};

// ------------------------------------------------------------------------------------------------ the line
{
  const first = P[0], last = P[P.length - 1];
  check('the line leaves the deck at the top of the cliff', Math.hypot(first.x - SLIDE.top.x, first.z - SLIDE.top.z) < 0.01 && first.y > 140, `${course.length.toFixed(0)} m long, ${(first.y - last.y).toFixed(0)} m down`);
  let gap = 0, kink = 0, steep = 0, flat = 9, tight = 1e9;
  for (let i = 1; i < P.length; i++) {
    gap = Math.max(gap, Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y, P[i].z - P[i - 1].z));
    kink = Math.max(kink, Math.abs(Math.atan2(Math.sin(P[i].yaw - P[i - 1].yaw), Math.cos(P[i].yaw - P[i - 1].yaw))));
    steep = Math.max(steep, P[i].slope); flat = Math.min(flat, P[i].slope);
    if (Math.abs(P[i].k) > 1e-6) tight = Math.min(tight, 1 / Math.abs(P[i].k));
  }
  check('it is one smooth line: no step, no kink', gap < SLIDE.step * 1.2 && kink < 0.08, `longest step ${gap.toFixed(2)} m, sharpest turn between two samples ${kink.toFixed(3)} rad`);
  check('it always goes down, never too steeply, and no bend is too tight', flat > 0 && steep < 0.36 && tight > 15, `slopes ${(flat * 100).toFixed(1)} % to ${(steep * 100).toFixed(0)} %, tightest radius ${tight.toFixed(1)} m`);
  check('the stretches follow one another without a hole', course.stretches.every((s, i) => i === 0 || Math.abs(s.from - course.stretches[i - 1].to) < 1.5), course.stretches.map((s) => `${s.name} ${s.from.toFixed(0)}`).join(' · '));
  // where it passes over itself, there is room for someone to slide underneath
  let closest = 1e9;
  for (let i = 0; i < P.length; i += 2) for (let j = i + 50; j < P.length; j += 2) {
    if (Math.abs(P[i].x - P[j].x) < 3.6 + P[i].F + P[j].F && Math.abs(P[i].z - P[j].z) < 3.6 + P[i].F + P[j].F) closest = Math.min(closest, Math.abs(P[i].y - P[j].y));
  }
  check('where the line passes over itself there is room underneath', closest > 5, `least height between two passes: ${closest.toFixed(1)} m`);
  // after the launch, wherever it runs straight something is going on: the long pool, a pool of whirlpools, the run-up to a gap or the landing after it
  const busy = (s) => course.mills.some((z) => s > z.from - 12 && s < z.to + 10) || course.basins.some((z) => s > z.from - 8 && s < z.to + 8) || course.gaps.some((g) => s > g.from - 34 && s < g.to + 24);
  let idle = 0, longest = 0, runLen = 0;
  for (const p of P) { if (p.s > 46 && Math.abs(p.k) < 0.006 && !busy(p.s)) { idle++; runLen++; longest = Math.max(longest, runLen); } else runLen = 0; }
  check('after the launch it never runs straight with nothing going on', idle / P.length < 0.03 && longest < 20, `${idle} m in all, ${longest} m at most`);
  check('the trough is 15 % wider than the first one, and its rim a full radian up', Math.abs(SLIDE.radius / 1.85 - 1.15) < 0.005 && SLIDE.rim === 1, `${(2 * R * Math.sin(SLIDE.rim)).toFixed(1)} m from rim to rim where it is plain`);
  // it opens out: the long pool, the pool of the whirlpools, small pools round the whirlpools of the plain stretches
  const widest = (z) => Math.max(...P.filter((p) => p.s >= z.from && p.s <= z.to).map((p) => 2 * (p.F + R * Math.sin(SLIDE.rim))));
  const pots = of('whirl').filter((t) => !course.basins.some((z) => t.s > z.from && t.s < z.to));
  check('it is wider in places: a long pool, a pool of whirlpools, small pools round the other whirlpools', course.mills.length >= 1 && course.basins.length >= 1 && course.mills.every((z) => widest(z) > 10) && course.basins.every((z) => widest(z) > 9) && pots.length >= 3 && pots.every((t) => lineAt(course.main, t.s).F > 1.5),
    `the long pool ${widest(course.mills[0]).toFixed(1)} m from rim to rim, the pool of the whirlpools ${widest(course.basins[0]).toFixed(1)} m, ${pots.length} small pools ${(2 * (lineAt(course.main, pots[0].s).F + R * Math.sin(SLIDE.rim))).toFixed(1)} m`);
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
  check(`${f.name}: the two troughs part round a ridge that grows`, rimAt(course.main, f.from + 1, mine) < 0.45 && rimAt(course.main, f.from + 24, mine) > WALL - 0.03 && rimAt(f, 1, -mine) < 0.45 && rimAt(f, 26, -mine) > WALL - 0.03);
}

// ------------------------------------------------------------------------------------------------ the ground, the sea
{
  // the trough, across its whole width and under its pools, clears the ground everywhere but on the deck it leaves from
  let least = 1e9, where = 0, bedded = 0;
  for (const line of course.lines) for (const p of line.points) {
    const rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw), reach = p.F + 3.6;
    let g = 0;
    for (const o of [-1, -0.5, 0, 0.5, 1]) g = Math.max(g, ground(p.x + rx * o * reach, p.z + rz * o * reach));
    const room = p.y - p.D - 0.4 - g;
    if (line === course.main && p.s < 7) bedded = Math.min(bedded, room); else if (room < least) { least = room; where = Math.round(p.s); }
  }
  check('the trough clears the ground (and the sea) across its whole width', least > 0.8, `least room ${least.toFixed(1)} m (at metre ${where})`);
  check('where it rests on the deck it is not buried', bedded > -2.2, `${(-bedded).toFixed(1)} m into the ground at most`);
  const villages = (meta.sky || []).map((v) => Math.min(...P.map((p) => Math.hypot(p.x - v.x, p.z - v.z))));
  check('it keeps away from the sky villages', Math.min(...villages) > 30, `nearest village: ${Math.min(...villages).toFixed(0)} m`);
  check('the gate stands on dry sand', ground(SLIDE.gate.x, SLIDE.gate.z) > 1 && ground(SLIDE.gate.x, SLIDE.gate.z) < 4, `${ground(SLIDE.gate.x, SLIDE.gate.z).toFixed(1)} m above the sea`);
  // the end: over the sea, deep enough to fall into, and a swim of about ten metres from the beach
  const e = course.end, sp = course.splash;
  check('the trough ends over the sea, a little above the water', height(e.x, e.z) < -1.5 && e.y > 1 && e.y < 2.6, `${e.y.toFixed(1)} m above water ${(-height(e.x, e.z)).toFixed(1)} m deep`);
  const swim = shore(sp.x, sp.z, -1.05), dry = shore(sp.x, sp.z, 0.15);
  check('where one comes down the sea is deep enough to swim, and the beach about ten metres of crawl away', height(sp.x, sp.z) < -1.5 && swim.d >= 7.5 && swim.d <= 13 && dry.d > swim.d + 2 && dry.d < 20,
    `${(-height(sp.x, sp.z)).toFixed(1)} m deep · ${swim.d} m to swim, then ${(dry.d - swim.d).toFixed(1)} m of shallows to the sand`);
  const landing = { x: sp.x + Math.sin(dry.a) * dry.d, z: sp.z + Math.cos(dry.a) * dry.d };
  check('…and one comes out of the water by the gate', Math.hypot(landing.x - SLIDE.gate.x, landing.z - SLIDE.gate.z) < 30, `${Math.hypot(landing.x - SLIDE.gate.x, landing.z - SLIDE.gate.z).toFixed(0)} m from it`);
}

// ------------------------------------------------------------------------------------------------ what lies and moves in the water
{
  const kinds = {}; for (const t of course.things) kinds[t.kind] = (kinds[t.kind] || 0) + 1;
  check('rolls, rolls that slide, arms that turn, whirlpools, propellers, buffers and padding — and no buoy left', ['bar', 'slider', 'spinner', 'whirl', 'prop', 'bumper', 'block'].every((k) => kinds[k] >= 3) && Object.keys(kinds).length === 7 && course.forks.every((f) => course.things.some((t) => t.line === f.id)), JSON.stringify(kinds));
  check('some of it moves', of('slider').length + of('spinner').length >= 8 && of('slider').every((t) => t.amp > 0.3 && t.period > 1) && of('spinner').every((t) => Math.abs(t.period) > 1.5), `${of('slider').length} sliders, ${of('spinner').length} spinners`);
  const inZone = (s) => course.mills.some((z) => s > z.from && s < z.to) || course.basins.some((z) => s > z.from && s < z.to);
  check('nothing on the launch, at the very end, on the way into a shortcut, nor before or after a gap',
    mainThings.every((t) => t.s > 46 && t.s < course.finish - 12 && !course.forks.some((f) => t.s > f.from - 44 && t.s < f.from + 16) && (inZone(t.s) || !course.gaps.some((g) => t.s > g.from - 26 && t.s < g.to + 12))));
  // a whirlpool leaves a way round, on the water, on one side at least
  const way = (t) => { const F = lineAt(course.main, t.s).F; return Math.max(F + SLIDE.stream - (t.u + t.core), F + SLIDE.stream + (t.u - t.core)); };
  check('every whirlpool lies in a pool of its own, with a way round it on the water', of('whirl').every((t) => lineAt(course.main, t.s).D > 0.5 && way(t) > 2 * RIDE.body + 0.3), `the narrowest way round: ${Math.min(...of('whirl').map(way)).toFixed(2)} m (a rider is ${(2 * RIDE.body).toFixed(1)} m wide)`);
  const apex = (RIDE.jump * RIDE.jump) / (2 * RIDE.g);
  check('what is to be jumped is low enough, and what is not is too tall', course.things.every((t) => (t.kind === 'block' || t.kind === 'bumper' ? t.h > apex + 0.3 : t.kind === 'whirl' || t.h < apex - 0.15)), `rolls ${of('bar')[0].h} m, arms ${of('spinner')[0].h} m, blades ${of('prop')[0].h} m; padding ${of('block')[0].h} m, buffers ${of('bumper')[0].h} m; a jump goes ${apex.toFixed(2)} m up`);
  // something to do something about every so often
  const ev = [0, ...mainThings.map((t) => t.s), ...course.gaps.map((g) => g.from), ...course.forks.map((f) => f.from), course.finish].sort((x, y) => x - y);
  const ways = ev.slice(1).map((v, i) => v - ev[i]);
  check('there is never long with nothing in the way', Math.max(...ways) < 100 && ways.reduce((x, y) => x + y, 0) / ways.length < 45, `${ways.length - 1} things to deal with; ${Math.round(ways.reduce((x, y) => x + y, 0) / ways.length)} m apart on average, ${Math.round(Math.max(...ways))} m at most`);
  const marks = course.marks.map((m) => m.s);
  check('the arches one is put back at come in order, the first at the top, none in the mouth of a shortcut nor in a gap',
    marks[0] === 0 && marks.every((s, i) => i === 0 || s > marks[i - 1] + 30) && marks.every((s) => !course.forks.some((f) => s > f.from - 10 && s < f.from + 16) && !gapAt(course, -1, s)), marks.map((s) => s.toFixed(0)).join(' '));
}

// ------------------------------------------------------------------------------------------------ the gaps
{
  check('there are three gaps between two troughs, each on a way that runs straight', course.gaps.length === 3 && course.gaps.every((g) => g.to - g.from > 7 && g.to - g.from < 12 && Math.abs(lineAt(course.main, (g.from + g.to) / 2).k) < 0.02), course.gaps.map((g) => `${g.from.toFixed(0)}–${g.to.toFixed(0)} m`).join(' · '));
  const cross = (g, s0, v, drive) => bare(() => { const st = riderAt(s0, v); const seen = run(st, 12, (q, i) => drive?.(q, i, g), (q) => q.fly || q.s > g.to + 3); return { ok: !st.fly, fell: seen.some((e) => e.type === 'out' && e.kind === 'gap'), landed: st.s }; });
  const lipJump = (st, i, g) => { const d = g.from - st.s; if (d > 0 && d <= st.v * 0.05 + 0.3 && st.h <= 0) i.jump = true; };
  const need = course.gaps.map((g) => { let ramp = 0, jump = 0; for (let v = 3.5; v <= 20 && !(ramp && jump); v += 0.25) { if (!ramp && cross(g, g.from - 0.5, v).ok) ramp = v; if (!jump && cross(g, g.from - 1.5, v, lipJump).ok) jump = v; } return { ramp, jump }; });
  check('at speed the ramp at the lip throws one across; slowly, one must jump', need.every((n) => n.ramp > 8 && n.ramp < 13 && n.jump > 0 && n.jump < n.ramp - 1), need.map((n) => `ramp alone from ${(n.ramp * 3.6).toFixed(0)} km/h, with a jump from ${(n.jump * 3.6).toFixed(0)}`).join(' · '));
  check('too slowly and without a jump: short of the far side, down into the gap', course.gaps.every((g) => cross(g, g.from - 0.5, 5).fell));
  // each gap has an arch a run-up before it, and who is put back there gets across by doing nothing
  const fair = course.gaps.map((g) => { const m = course.marks.find((q) => q.s > g.from - 32 && q.s < g.from - 16); return m ? [0, 1.2, 1.7].map((u) => bare(() => { const st = riderAt(m.s + 0.5, RIDE.back, u); run(st, 12, null, (q) => q.fly || q.s > g.to + 3); return !st.fly; })) : [false]; });
  check('put back at the arch before a gap, one gets across without doing anything — from the water or from a wall', fair.every((list) => list.every(Boolean)));
  // a jump on the ramp carries further, never out of all measure: one lands before the plunge into the long pool
  const far = bare(() => { const g = course.gaps[1], st = riderAt(g.from - 2, 22); let landed = 0; run(st, 6, lipJump.length ? (q, i) => lipJump(q, i, g) : null, (q) => { if (q.s > g.to && q.h === 0 && !landed) landed = q.s; return !!landed; }); return landed - g.to; });
  check('jumping on the ramp at full speed, one still comes down before the plunge into the long pool', far > 0 && far < course.mills[0].plunge - course.gaps[1].to, `${far.toFixed(0)} m beyond the far lip (the plunge is ${(course.mills[0].plunge - course.gaps[1].to).toFixed(0)} m beyond it)`);
}

/** The course with only that in its water (a thing, or several). */
const only = (t, fn) => { const things = course.things; course.things = [].concat(t); course._byLine = null; try { return fn(); } finally { course.things = things; course._byLine = null; } };

// ------------------------------------------------------------------------------------------------ the long pool
{
  const z = course.mills[0], mid = lineAt(course.main, (z.from + z.to) / 2), F = mid.F;
  const inPool = mainThings.filter((t) => t.s > z.from && t.s < z.to), props = inPool.filter((t) => t.kind === 'prop'), buffers = inPool.filter((t) => t.kind === 'bumper'), pads = inPool.filter((t) => t.kind === 'block');
  const inThePool = (s, v, u = 0, clock = 0) => { const st = riderAt(s, v, u, clock); st.dip = z; return st; }; // (already slowed by the plunge)
  check('the long pool: wide, slack water, three propellers as wide as it is, buffers between them',
    F >= 3.5 && mid.S > 0.95 && props.length === 3 && buffers.length === 3 && props.every((t) => t.len >= F + 0.4 && t.u === 0) && inPool.every((t) => ['prop', 'bumper', 'block'].includes(t.kind)),
    `${(z.to - z.from).toFixed(0)} m long, ${(2 * (F + R * Math.sin(SLIDE.rim))).toFixed(1)} m from rim to rim; blades ${props[0].len.toFixed(1)} m long over a floor ${F.toFixed(1)} m to each side`);
  check('the propellers turn one way then the other, a little faster each', props.every((t, i) => i === 0 || (t.period * props[i - 1].period < 0 && Math.abs(t.period) < Math.abs(props[i - 1].period))), props.map((t) => `${t.blades} blades, a turn in ${Math.abs(t.period)} s ${t.period > 0 ? 'clockwise' : 'the other way'}`).join(' · '));
  // nobody slips by along a wall: beyond the tips of the blades the walls are padded, up to the rim
  const padded = (t) => { const mine = pads.filter((q) => Math.abs(q.s - t.s) < 0.1); return mine.length === 2 && mine.every((q) => q.pad && Math.abs(q.u) - q.half <= t.len + 0.15 && Math.abs(q.u) + q.half >= F + WALL - 0.01); };
  check('…from wall to wall: where the blades end, the walls are padded up to the rim', props.every(padded));
  const wall = [-1, 1].map((sg) => { const t = props[0], st = inThePool(t.s - 9, 11, sg * (F + 1.1)); only(pads.filter((q) => Math.abs(q.s - t.s) < 0.1), () => run(st, 3, hold(sg * (F + 1.1)), (q) => q.s > t.s + 3)); return { bumps: st.bumps, u: Math.abs(st.u), falls: st.falls }; });
  check('…and who rides a wall there is stopped by the padding, and shoved back down', wall.every((r) => r.bumps >= 1 && r.u < F + 0.9 && r.falls === 0), wall.map((r) => `${r.bumps} bump, back ${r.u.toFixed(1)} m from the middle`).join(' · '));

  // one plunges into it: most of the speed is gone, and the slack water keeps one slow
  const dive = bare(() => { const st = riderAt(z.from - 8, 21), seen = run(st, 3, hold(0), (q) => q.s > z.plunge + 6), after = st.v; run(st, 9, hold(0), (q) => q.s > z.to - 6); return { plunged: seen.some((e) => e.type === 'plunge'), after, cruise: st.v }; });
  check('one plunges into it: the still water takes most of the speed, and keeps one slow', dive.plunged && dive.after < 15 && dive.cruise < 12.5 && dive.cruise > 8, `in at ${(21 * 3.6).toFixed(0)} km/h, ${(dive.after * 3.6).toFixed(0)} km/h six metres on, ${(dive.cruise * 3.6).toFixed(0)} km/h at the far end`);

  // a propeller: whether one gets by depends on when one comes, and on which side; a jump over the blade does it
  const blade = (t, q) => { // (is a blade two to five metres ahead of where the rider is going, in a third of a second?)
    const ps = q.s - t.s, pu = q.u - t.u;
    for (let j = 0; j < t.blades; j++) { const th = propAt(t, q.clock + 0.3) + (j * 2 * Math.PI) / t.blades; for (let r = t.hub; r <= t.len; r += 0.4) { const bs = Math.cos(th) * r - ps, bu = Math.sin(th) * r - pu; if (bs > 1.8 && bs < 5 && Math.abs(bu) < 0.6) return true; } }
    return false;
  };
  const N = 60, pass = (t, u, jumps) => {
    let clean = 0, backs = 0, worst = 0;
    for (let k = 0; k < N; k++) {
      const st = inThePool(t.s - 14, 11.5, u, k * 0.1873), c0 = st.clock; st.floor = F;
      const seen = only(t, () => run(st, 25, (q, i) => { hold(u)(q, i); i.jump = jumps && q.h <= 0 && blade(t, q); }, (q) => q.s > t.s + 7));
      if (!st.bumps) clean++;
      backs += seen.filter((e) => e.type === 'blade' && e.back).length;
      worst = Math.max(worst, st.clock - c0);
    }
    return { clean: clean / N, backs: backs / N, worst };
  };
  // (the kinder side of each: where its blades go down the slide — its left when it turns clockwise)
  const kind = props.map((t) => pass(t, t.period > 0 ? -3.3 : 3.3, false)), cruel = props.map((t) => pass(t, t.period > 0 ? 3.3 : -3.3, false));
  check('a propeller lets one by or not, depending on when one comes — more often where its blades go one\'s way', kind.every((r, i) => r.clean > 0.4 && r.clean < 0.95 && r.clean > cruel[i].clean + 0.15),
    props.map((t, i) => `${Math.round(kind[i].clean * 100)} % of the time on its kinder side, ${Math.round(cruel[i].clean * 100)} % on the other`).join(' · '));
  check('a blade that comes at one throws one back up the pool; one that goes one\'s way hardly ever does', cruel.every((r, i) => r.backs > 0.5 && kind[i].backs < r.backs / 4), props.map((t, i) => `thrown back ${cruel[i].backs.toFixed(2)} times a pass against ${kind[i].backs.toFixed(2)}`).join(' · '));
  const over = props.flatMap((t) => [-3.3, -1.4, 1.4, 3.3].map((u) => pass(t, u, true)));
  check('jumping the blade that comes, one gets by nearly every time, wherever across', over.every((r) => r.clean >= 0.75) && over.reduce((a, r) => a + r.clean, 0) / over.length > 0.9, `${Math.round((over.reduce((a, r) => a + r.clean, 0) / over.length) * 100)} % on average, ${Math.round(Math.min(...over.map((r) => r.clean)) * 100)} % at worst`);
  check('…and nobody is held up for long at a propeller', [...kind, ...cruel, ...over].every((r) => r.worst < 12), `at worst ${Math.max(...[...kind, ...cruel].map((r) => r.worst)).toFixed(1)} s to get by one`);

  // a buffer: too tall to jump — straight into it one is thrown back up the pool, and aside
  {
    const t = buffers[0], jumpOver = (q, i) => { const d = t.s - q.s; i.steer = clamp((t.u - q.u) * 2.8 - q.w * 0.6, -1, 1); i.jump = d > 0 && d < (q.v * RIDE.jump) / RIDE.g + 0.3 && q.h <= 0; };
    const into = inThePool(t.s - 8, 11, t.u), jumped = inThePool(t.s - 8, 11, t.u), round = inThePool(t.s - 8, 11, t.u + t.r + 0.9);
    let low = 1e9, hit = 0;
    const seen = only(t, () => run(into, 14, (q) => { if (q.bumps && !hit) hit = q.s; if (hit) low = Math.min(low, q.s); }, (q) => q.s > t.s + 4));
    only(t, () => { run(jumped, 4, jumpOver, (q) => q.bumps > 0 || q.s > t.s + 4); run(round, 4, hold(t.u + t.r + 0.9), (q) => q.s > t.s + 4); });
    check('riding into a buffer: thrown back up the pool, and aside', seen.some((e) => e.type === 'bump') && hit - low > 1.5, `thrown back ${(hit - low).toFixed(1)} m`);
    check('…it is too tall to jump; going round it, nothing happens', jumped.bumps >= 1 && round.bumps === 0);
    check('…and who does nothing gets round it in the end', into.s > t.s + 4 && into.falls === 0, `past it after ${seen[seen.length - 1].at.toFixed(1)} s and ${into.bumps} bounce${into.bumps === 1 ? '' : 's'}`);
  }

  // whenever they come, the bots get through — nearly always without touching anything
  const through = (how) => { let clean = 0, worst = 0; for (let k = 0; k < 30; k++) { const st = riderAt(z.from - 40, 19, 0, k * 0.371), t0 = st.clock; run(st, 30, (q, i) => botInput(q, how, i), (q) => q.s > z.to + 10 || q.fly); if (!st.bumps && !st.falls) clean++; worst = Math.max(worst, st.clock - t0); } return { clean, worst }; };
  const tc = through('careful'), tb = through('bold');
  check('whenever they come, the bots get through the pool — nearly always without touching anything', tc.clean >= 25 && tb.clean >= 25 && tc.worst < 14 && tb.worst < 14, `careful: ${tc.clean} times out of 30, ${tc.worst.toFixed(1)} s at worst · bold: ${tb.clean} out of 30, ${tb.worst.toFixed(1)} s`);
  const idle = riderAt(z.from - 5, 19); run(idle, 60, null, (q) => q.s > z.to + 5);
  check('who does nothing in the pool is knocked about — and gets through all the same', idle.s > z.to && idle.bumps >= 2 && idle.falls === 0, `${idle.bumps} things run into`);
}

// ------------------------------------------------------------------------------------------------ the pipe beside the pool
{
  const z = course.mills[0], pipe = course.pipes[0], open = R * Math.sin(SLIDE.rim), goal = course.marks.find((m) => m.s > z.to).s;
  const rel = pipe.points.map((p) => beside(p.x, p.y, p.z)), low = rel.filter((r) => r.up < -1), end = rel[rel.length - 1];
  check('a pipe runs beside the long pool, joined to nothing: lower than the pool at first, higher at its end', course.pipes.length === 1 && pipe.pipe && low.length > 25 && low.every((r) => r.up < -1 && r.up > -3) && end.up > 3 && rel[0].s > z.from - 12 && end.s < z.to,
    `${pipe.length.toFixed(0)} m long; ${(-low[0].up).toFixed(1)} m under the pool for ${low.length} m, ${end.up.toFixed(1)} m over it at its end`);
  check('…on the side away from the cliff, clear of the pool, and clear of the ground', rel.every((r) => r.lat * pipe.side > 0 && (r.up > 2.5 || Math.abs(r.lat) - open > r.F + open + 0.4)) && pipe.points.every((p) => p.y - 0.5 - ground(p.x, p.z) > 3),
    `its rim ${Math.min(...rel.filter((r) => r.up < 2.5).map((r) => Math.abs(r.lat) - open - r.F - open)).toFixed(1)} m from the pool's at the nearest`);
  // jumping the rim of the pool on that side: down into the pipe, off its end, down onto the slide again
  const ride = (at, upTo = 30) => {
    const st = riderAt(z.from - 40, 19), t0 = st.clock; let hopped = false;
    const seen = run(st, 40, (q, i) => {
      botInput(q, 'careful', i);
      const m = q.s - z.from;
      if (at !== null && q.line < 0 && !q.fly && !hopped && m > at && m < upTo) { i.steer = pipe.side; i.brake = false; i.tuck = false; i.jump = q.u * pipe.side > 3.1 && q.h <= 0; }
      if (q.fly) { hopped = true; i.steer = 0; }
    }, (q) => !q.fly && rideProgress(q) >= goal);
    return { st, seen, time: st.clock - t0, lands: seen.filter((e) => e.type === 'land' && e.hop) };
  };
  const stay = ride(null), hop = ride(17.5), late = ride(45.5, 53.5); // (past the first propeller; and between the last two, where the pipe is high)
  check('jumping the rim of the pool on its side, one comes down in the pipe and rides on', hop.lands.length >= 1 && hop.lands[0].line === pipe.id && hop.st.falls === 0 && hop.st.took.includes(pipe.id), hop.lands[0] ? `over the rim ${(hop.seen.find((e) => e.type === 'out').s - z.from).toFixed(0)} m into the pool, in the pipe ${(hop.lands[0].at - hop.seen.find((e) => e.type === 'out').at).toFixed(2)} s later` : 'never in the pipe');
  check('…off its end one flies, and comes down on the slide again', hop.lands.length === 2 && hop.lands[1].line === -1 && hop.lands[1].from === 'off' && hop.st.falls === 0, hop.lands[1] ? `${(hop.lands[1].s - z.from).toFixed(0)} m from the top of the pool` : '');
  check('…and it is the faster way, even against a pool crossed without touching anything', stay.st.bumps === 0 && hop.time < stay.time - 0.4, `${hop.time.toFixed(2)} s by the pipe, ${stay.time.toFixed(2)} s by the pool`);
  check('where the pipe has climbed over the rim, jumping the rim misses it: back to the arch before the pool', late.st.falls >= 1 && late.seen.some((e) => e.type === 'back' && course.marks[e.mark].s < z.from), `lost ${(late.time - stay.time).toFixed(1)} s`);
  // off its end, slow or fast, one comes down on the water of the slide
  const ends = [8, 12, 16, 20].map((v) => { const st = riderAt(0, v); Object.assign(st, { line: pipe.id, s: pipe.length - 3, floor: 0 }); const seen = run(st, 4, null, (q, ev) => ev.some((e) => (e.type === 'land' && e.hop) || e.type === 'back')); const land = seen.find((e) => e.type === 'land' && e.hop); return { v, ok: !!land && land.line === -1, u: st.u, air: land ? land.at - seen.find((e) => e.type === 'out').at : 0, wide: lineAt(course.main, st.s).F }; });
  check('off the end of the pipe, slow or fast, one comes down on the water of the slide — well within the count', ends.every((r) => r.ok && Math.abs(r.u) < r.wide + WALL - 0.4 && r.air < RIDE.out - 0.3), ends.map((r) => `${(r.v * 3.6).toFixed(0)} km/h: ${Math.abs(r.u).toFixed(1)} m from the middle after ${r.air.toFixed(2)} s`).join(' · '));
}

// ------------------------------------------------------------------------------------------------ out of the trough
{
  // what the game marks is where one comes down
  const pipe = course.pipes[0], st = riderAt(0, 14); Object.assign(st, { line: pipe.id, s: pipe.length - 0.5, floor: 0 });
  let said = null;
  const seen = run(st, 3, (q) => { if (q.fly && !said) { const f = rideFall(q); said = f && { ...f }; } }, (q, ev) => ev.some((e) => e.type === 'land' && e.hop));
  const pose = ridePose(st, {});
  check('out of the trough, where one will come down is known at once — and that is where one does', !!said && said.ok && said.line === -1 && Math.hypot(said.x - pose.x, said.y - pose.y, said.z - pose.z) < 0.8 && seen.some((e) => e.type === 'land'), said ? `${Math.hypot(said.x - pose.x, said.y - pose.y, said.z - pose.z).toFixed(2)} m off, ${said.t.toFixed(2)} s ahead` : 'nothing said');

  // every way of leaving the slide over a rim, from every few metres, at three speeds, steering or not in the
  // air: where does one come down in a trough again, and stay in it?
  const skips = [];
  for (let s = 12; s < course.finish - 6; s += 4) {
    if (course.gaps.some((g) => s > g.from - 3 && s < g.to + 3)) continue;
    for (const side of [-1, 1]) for (const v of [6, 11, 15, 19]) for (const steer of [-1, 0, 1]) {
      const q = startRide(course, { under });
      Object.assign(q, { s, v, u: side * (rimAt(course.main, s, side) - 0.02), w: side * 3, floor: lineAt(course.main, s).F, mark: Math.max(0, course.marks.findLastIndex((m) => m.s <= s)) });
      const input = { steer, tuck: false, brake: false, jump: false }, events = [], mark = q.mark;
      let land = null;
      for (let t = 0; t < RIDE.out + 0.4 && !land; t += RIDE.step) { stepRide(q, RIDE.step, input, events); land = events.find((e) => e.type === 'land' && e.hop); if (events.some((e) => e.type === 'back')) break; events.length = 0; }
      if (!land || land.gain < 30) continue;
      // (it counts when one is still riding two seconds later, steering as the careful bot does)
      const kept = q.mark, to = rideProgress(q); let held = true;
      events.length = 0;
      for (let k = 0; k < 240 && held; k++) { botInput(q, 'careful', input); stepRide(q, RIDE.step, input, events); if (events.some((e) => e.type === 'out' || e.type === 'back')) held = false; }
      // (…and a little further on — out of a shortcut, if that is where one came down — the arches are theirs)
      for (let k = 0; k < 1200 && held && q.mark === mark; k++) { botInput(q, 'careful', input); stepRide(q, RIDE.step, input, events); }
      if (held) skips.push({ s, side, v, steer, to, gain: land.gain, mark, kept, after: q.mark });
    }
  }
  const whirl = course.stretches.find((q) => q.name === 'The Whirlpool'), early = skips.filter((k) => k.s < whirl.from - 60), drops = skips.filter((k) => k.s >= whirl.from - 60);
  check('nowhere above the Whirlpool does leaving the slide skip any great length of it', early.length === 0, early.length ? `${early.length} ways, the first from metre ${early[0].s} to ${early[0].to.toFixed(0)}` : `${skips.length} ways of skipping 30 m or more, all of them at the Whirlpool`);
  check('in the Whirlpool, who goes over the inner rim at the right speed comes down on the turn below — a daring short cut', drops.length >= 3 && drops.every((k) => k.gain > 90 && k.gain < 140 && k.side < 0), drops.length ? `${drops.length} ways found, about ${Math.round(drops[0].gain)} m skipped; from metre ${drops[0].s} at ${(drops[0].v * 3.6).toFixed(0)} km/h, for one` : 'none');
  check('…the arches flown over are one\'s own only once one has stayed in the trough a moment', drops.length > 0 && drops.every((k) => k.kept === k.mark && k.after > k.mark));
  // …and who touches the turn below only to be thrown out of it goes back to the arch they had
  if (drops.length) {
    const k = drops[0], q = startRide(course, { under });
    Object.assign(q, { s: k.s, v: k.v, u: k.side * (rimAt(course.main, k.s, k.side) - 0.02), w: k.side * 3, floor: 0, mark: k.mark });
    const input = { steer: k.steer, tuck: false, brake: false, jump: false }, events = [];
    let landed = false, back = null;
    for (let t = 0; t < 12 && !back; t += RIDE.step) { if (landed) { input.steer = 1; input.jump = q.h <= 0; } stepRide(q, RIDE.step, input, events); if (events.some((e) => e.type === 'land' && e.hop)) landed = true; back = events.find((e) => e.type === 'back'); events.length = 0; }
    check('…who comes down there only to go straight out again is put back at the arch they had', landed && !!back && back.mark === k.mark, back ? `back at arch ${back.mark} (they had ${k.mark})` : 'never put back');
  }
}

// ------------------------------------------------------------------------------------------------ the ride
{
  // the same run, whatever the frame rate (the steps of the ride are the same; the bot looks at each frame, so it
  // reacts a frame sooner or later — and comes to a propeller a moment sooner or later: a few tenths of a
  // second on a minute)
  const ride = (dt) => { const st = startRide(course), input = {}; for (let t = 0; t < 400 && !st.over; t += dt) { botInput(st, 'careful', input); stepRide(st, dt, input); } return st.time; };
  const t30 = ride(1 / 30), t144 = ride(1 / 144), t60 = ride(1 / 60);
  check('a ride takes the same time at 30, 60 and 144 frames a second', Math.abs(t30 - t60) < 400 && Math.abs(t144 - t60) < 400, `${fmt(t30)} · ${fmt(t60)} · ${fmt(t144)}`);

  const careful = botRun(course, 'careful'), bold = botRun(course, 'bold'), plain = botRun(course, { bold: true, cuts: false });
  check('a careful rider gets down without going over the edge, without touching anything', careful.over && careful.falls === 0 && careful.caught === 0 && careful.bumps === 0, `${fmt(careful.time)}, ${careful.jumps} jumps`);
  check('a bold rider takes both shortcuts and is clearly faster', bold.over && bold.falls === 0 && bold.took.length === course.forks.length && bold.time < careful.time - 5000, `${fmt(bold.time)}, top speed ${(bold.top * 3.6).toFixed(0)} km/h`);
  check('the shortcuts are worth taking', bold.time < plain.time - 2000, `${fmt(plain.time)} without them`);

  // ---- the water carries, the walls slow: the same stretch of the first helix, in the water and up a wall
  const held = (u) => bare(() => { const st = riderAt(130, 12, u); run(st, 8, hold(u)); return st.v; });
  const mid = held(0), beside = held(SLIDE.shore + 0.05), rim = held(1.9);
  check('in the water one gains speed; beside it one does not; up by the rim one loses it', mid > 17 && beside < mid - 4 && rim < beside - 1, `after 8 s: ${(mid * 3.6).toFixed(0)} km/h in the middle, ${(beside * 3.6).toFixed(0)} beside the water, ${(rim * 3.6).toFixed(0)} by the rim`);
  // ---- a bend throws out of the water who does not steer (the trough only half leans into it)
  const share = (steers) => bare(() => { const st = startRide(course), tmp = {}; let n = 0, inside = 0; run(st, 400, (q, i) => { botInput(q, 'careful', tmp); i.jump = tmp.jump; i.steer = steers ? tmp.steer : 0; if (!q.fly) { n++; if (Math.abs(q.u) < lineAt(course.main, q.s).F + SLIDE.stream) inside++; } }, (q) => q.over); return { share: inside / n, time: st.time, falls: st.falls }; });
  const lazy = share(false), keen = share(true);
  check('who does not steer is thrown out of the water by the bends, and loses time; who steers stays in it', lazy.share < 0.5 && keen.share > 0.75 && lazy.time > keen.time + 2500, `in the water ${(lazy.share * 100).toFixed(0)} % of the way without steering (${fmt(lazy.time)}), ${(keen.share * 100).toFixed(0)} % steering (${fmt(keen.time)}) — the trough empty`);
  check('the steering is a tenth keener than it was', Math.abs(RIDE.steer / R / 6.5 - 1.1) < 0.01, `${RIDE.steer} m/s² (${(RIDE.steer / R).toFixed(2)} rad/s² in a plain trough; it was 6.5)`);

  // ---- too far up a wall is really out: over the rim, a fall away from the trough, back at the last arch
  {
    const st = riderAt(126, 15), mark = course.marks[st.mark].s, rimOut = [];
    const seen = bare(() => run(st, 9, (q, i) => { i.steer = q.fly ? 0 : 1; if (q.fly && q.fly.kind === 'side') { const p = lineAt(course.main, q.s), f = q.fly; rimOut.push({ t: f.t, side: Math.hypot(f.x - p.x, f.z - p.z), below: p.y - f.y }); } }, (q, ev) => ev.some((e) => e.type === 'back')));
    const out = seen.find((e) => e.type === 'out'), back = seen.find((e) => e.type === 'back'), far = rimOut[rimOut.length - 1];
    check('a key held to the side takes the ring over the rim within a second or so', !!out && out.kind === 'side' && out.at > 0.4 && out.at < 1.5, out ? `over the edge after ${out.at.toFixed(2)} s` : 'never out');
    check('…it really leaves the trough: metres to the side and well below it before it is put back', !!far && far.side > R + 2 && far.below > 5, far ? `${far.side.toFixed(1)} m from the middle of the trough, ${far.below.toFixed(1)} m below it after ${far.t.toFixed(1)} s` : '');
    check('…then, no trough found when the count runs out, back at the last arch, the clock still running', !!back && Math.abs(st.s - mark) < 2 && st.falls === 1 && back.at - out.at > RIDE.out - 0.1 && st.clock > back.at - 0.1, back ? `back at metre ${mark.toFixed(0)}, ${(back.at - out.at).toFixed(1)} s later` : '');
    const tap = riderAt(126, 15); bare(() => run(tap, 3, (q, i, t) => { i.steer = t < 0.3 ? 1 : 0; }));
    check('a short push on the key is forgiven', tap.falls === 0);
    // where the trough narrows again, who is on a wall is brought in with it, not thrown out
    const pot = of('whirl').find((t) => !course.basins.some((zz) => t.s > zz.from && t.s < zz.to)), edge = lineAt(course.main, pot.s).F + 1.3, sg = lineAt(course.main, pot.s).k < 0 ? -1 : 1;
    const narrowing = riderAt(pot.s, 20, sg * (edge + 0.4)); narrowing.w = sg * 1.5; bare(() => run(narrowing, 2.5, null, (q) => q.s > pot.s + 22 || q.fly));
    check('where a pool narrows, who rides its wall is brought in with it — not thrown over the rim', narrowing.falls === 0, `${Math.abs(narrowing.u).toFixed(1)} m across at the end`);
  }
  // ---- nobody is left stuck: three falls running from the same arch, and one is put back at the next
  {
    const st = riderAt(126, 15), marks = [];
    bare(() => run(st, 40, (q, i) => { i.steer = 1; }, (q, ev) => { for (const e of ev.splice(0)) if (e.type === 'back') marks.push(e.mark); return marks.length >= 4; }));
    check('after three falls running from the same arch one is put back at the next', marks.length >= 3 && marks[0] === marks[1] && marks[2] === marks[0] + 1, `put back at arches ${marks.join(', ')}`);
  }
  // ---- the jump
  {
    const st = riderAt(60, 14); let top = 0, air = 0;
    bare(() => run(st, 2.5, (q, i, t) => { i.jump = t < 0.02; if (q.h > 0) air += RIDE.step; top = Math.max(top, q.h); }));
    check('a jump lifts the ring off the water and puts it down again', top > 0.5 && top < 1.1 && air > 0.5 && air < 1.1 && st.h === 0 && st.jumps === 1, `${top.toFixed(2)} m up, ${air.toFixed(2)} s in the air`);
  }
  const jumpAt = (t) => (q, i) => { const d = t.s - q.s; i.steer = clamp((t.u - q.u) * 2.8 - q.w * 0.6, -1, 1); i.jump = d > 0 && d < (q.v * RIDE.jump) / RIDE.g + 0.3 && q.h <= 0; };
  // ---- a roll: into it, most of the speed is gone; over it, nothing is lost
  {
    const t = of('bar')[0], into = riderAt(t.s - 12, 14, t.u), over = riderAt(t.s - 12, 14, t.u);
    only(t, () => { run(into, 3, hold(t.u), (q) => q.s > t.s + 1); run(over, 3, jumpAt(t), (q) => q.s > t.s + 1); });
    check('riding into a roll: thrown over it with most of the speed gone', into.bumps === 1 && into.v < 14 * RIDE.bar + 1.5, `${(into.v * 3.6).toFixed(0)} km/h left of ${(14 * 3.6).toFixed(0)}`);
    check('jumping it: nothing happens', over.bumps === 0 && over.jumps === 1, `${(over.v * 3.6).toFixed(0)} km/h`);
  }
  // ---- what moves: whether one runs into it depends on when one comes; jumping it always does
  {
    const s = of('slider')[0], sp = of('spinner')[0], when = (t, u, period) => { const hits = []; for (let k = 0; k < 16; k++) { const st = riderAt(t.s - 10, 14, u, (k / 16) * Math.abs(period)); only(t, () => run(st, 2, hold(u), (q) => q.s > t.s + 3)); hits.push(st.bumps); } return hits; };
    const sl = when(s, s.u + s.amp, s.period), ar = when(sp, sp.u + sp.len + 0.25, sp.period); // (beside the middle of the one, at the tip of the arms of the other)
    check('a roll that slides: one runs into it or not, depending on when one comes', sl.includes(0) && sl.includes(1) && Math.abs(sliderAt(s, 0) - sliderAt(s, s.period / 2)) + Math.abs(sliderAt(s, s.period / 4) - sliderAt(s, (3 * s.period) / 4)) > s.amp, `run into ${sl.filter(Boolean).length} times out of ${sl.length}`);
    check('arms that turn: the same', ar.includes(0) && ar.includes(1), `run into ${ar.filter(Boolean).length} times out of ${ar.length}`);
    const over = [s, sp].map((t) => { let hits = 0; for (let k = 0; k < 8; k++) { const st = riderAt(t.s - 12, 14, t.u, (k / 8) * Math.abs(t.period)); only(t, () => run(st, 2.5, jumpAt(t), (q) => q.s > t.s + 3)); hits += st.bumps; } return hits; });
    check('…and jumping either, whenever one comes: over', over.every((n) => n === 0));
  }
  // ---- the whirlpools: they draw in who passes near, hold who rides into them; round them or over them, free
  {
    const t = of('whirl').find((q) => !course.basins.some((zz) => q.s > zz.from && q.s < zz.to)), sg = t.u > 0 ? -1 : 1;
    const into = riderAt(t.s - 10, 14, t.u), seen = only(t, () => run(into, 6, hold(t.u), (q, ev) => ev.some((e) => e.type === 'free')));
    const caught = seen.find((e) => e.type === 'whirl'), free = seen.find((e) => e.type === 'free');
    check('riding into a whirlpool: held and spun, then let go slowly', into.caught === 1 && !!free && Math.abs(free.at - caught.at - RIDE.whirl.time) < 0.1 && into.v <= RIDE.whirl.speed + 0.5, free ? `held ${(free.at - caught.at).toFixed(1)} s, let go at ${(into.v * 3.6).toFixed(0)} km/h` : 'never let go');
    // passing by without steering: drawn towards its eye
    const by = t.u + sg * (t.core + 0.45), near = riderAt(t.s - 5, 8, by), alone = riderAt(t.s - 5, 8, by);
    only(t, () => run(near, 3, null, (q) => q.s > t.s + 1.2 || q.spin > 0)); bare(() => run(alone, 3, null, (q) => q.s > t.s + 1.2));
    check('passing near one without steering, one is drawn towards its eye', (near.u - alone.u) * -sg > 0.12 || near.spin > 0, `${Math.abs(near.u - alone.u).toFixed(2)} m nearer than without it`);
    const want = t.u + sg * (t.core + 0.85), round = riderAt(t.s - 14, 14, want), over = riderAt(t.s - 10, 14, t.u);
    only(t, () => { run(round, 3, hold(want), (q) => q.s > t.s + 3); run(over, 3, jumpAt(t), (q) => q.s > t.s + 3); });
    check('going round a whirlpool, or jumping it: free', round.caught === 0 && round.falls === 0 && over.caught === 0, `round it ${Math.abs(want - t.u).toFixed(2)} m from its eye`);
    // the pool: three in a triangle — no going straight through, and a way for who steers
    const zz = course.basins[0], inPool = of('whirl').filter((q) => q.s > zz.from && q.s < zz.to), straight = riderAt(zz.from - 6, 16, 0), steered = riderAt(zz.from - 6, 16, 0);
    run(straight, 8, null, (q) => q.s > zz.to || q.spin > 0); run(steered, 8, (q, i) => botInput(q, 'careful', i), (q) => q.s > zz.to + 4 || q.fly);
    check('the pool: three whirlpools in a triangle — straight through, one is caught; steering, one gets by', inPool.length === 3 && straight.spin > 0 && steered.caught === 0 && steered.s > zz.to, `${inPool.map((q) => `${(q.s - zz.from).toFixed(0)} m in, ${q.u.toFixed(1)} across`).join(' · ')}`);
  }
  // ---- nobody gets stuck: someone who touches nothing, someone who brakes all the way
  const drift = (input) => { const st = startRide(course); for (let t = 0; t < 900 && !st.over; t += RIDE.step) stepRide(st, RIDE.step, input); return st; };
  const idle = drift({ steer: 0 }), slow = drift({ steer: 0, brake: true });
  check('a rider who touches nothing gets to the bottom, far behind', idle.over && idle.time > careful.time + 15000, `${fmt(idle.time)}: ${idle.caught} whirlpools, ${idle.bumps} things run into, out ${idle.falls} time${idle.falls === 1 ? '' : 's'}`);
  check('a rider who brakes all the way gets there too (into every gap, and put back beyond it)', slow.over && slow.time < 8 * 60000, `${fmt(slow.time)}, out ${slow.falls} times`);

  // ---- the end: the clock stops at the last arch, the ring flies off the end of the trough into the sea
  {
    const st = riderAt(course.finish - 16, 16);
    const seen = bare(() => run(st, 20, (q, i) => botInput(q, 'careful', i), (q) => q.ended));
    const finish = seen.find((e) => e.type === 'finish'), splash = seen.find((e) => e.type === 'splash'), pose = ridePose(st, {});
    const flown = splash ? Math.hypot(splash.x - course.end.x, splash.z - course.end.z) : 0;
    check('the clock stops at the end of the trough, and the ring flies on into the sea', !!finish && !!splash && st.over && st.ended && st.fly.kind === 'end' && st.fly.wet && splash.at > finish.at && st.falls === 0, splash ? `in the water ${(splash.at - finish.at).toFixed(2)} s after the clock stopped, ${flown.toFixed(1)} m beyond the end` : 'no splash');
    check('…where the course says one comes down, in water deep enough to swim', !!splash && Math.hypot(splash.x - course.splash.x, splash.z - course.splash.z) < 4 && height(splash.x, splash.z) < -1.5 && pose.flying && pose.wet, splash ? `${Math.hypot(splash.x - course.splash.x, splash.z - course.splash.z).toFixed(1)} m from the place the course gives, ${(-height(splash.x, splash.z)).toFixed(1)} m deep` : '');
    // whatever the speed one leaves the trough at, the sea is deep where one comes down and the beach a swim away
    const lands = [RIDE.carry, 10, 24, RIDE.top].map((v) => { const q = riderAt(course.finish - 2, v); const ev = bare(() => run(q, 8, null, (r) => r.ended)); const sp = ev.find((e) => e.type === 'splash'); return sp ? { v, depth: -height(sp.x, sp.z), swim: shore(sp.x, sp.z, -1.05).d } : { v, depth: 0, swim: 0 }; });
    check('slow or fast, one comes down in deep water, a swim from the beach', lands.every((l) => l.depth > 1.4 && l.swim > 5 && l.swim < 20), lands.map((l) => `${(l.v * 3.6).toFixed(0)} km/h: ${l.swim} m to swim`).join(' · '));
  }
  // what the leaderboard should believe: nothing much under the best the bot can do
  console.log(`      the times to beat: careful ${fmt(careful.time)} · bold ${fmt(bold.time)} · touching nothing ${fmt(idle.time)}`);
  // (the bold bot never leaves the trough: who jumps into the pipe and drops a turn of the Whirlpool is a good ten seconds quicker)
  console.log(`      suggested rule for the board of scores: slide: { order: 'asc', min: ${Math.floor((bold.time * 0.55) / 1000) * 1000}, max: 3600_000 }`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
