// Hold the Rails!: its line round the mountains of the valley, and how a car runs on it. No renderer here: the
// game, its checks and the player that plays by itself all read these lines.
//
// A wooden coaster leaves a station at the back of the north beach, is hauled straight up the face of the
// northern mountains, runs west along them, is hauled again up to the heights of the north-west, comes down the
// whole western range from north to south, climbs a last time in the south-west and runs east down the southern
// range to dive into the meadow south of Mostly Up, where it stops.
//
// The line is laid like a toy track seen from above — way-points joined by straights, each corner rounded to a
// radius — then eased, given its heights (one for each way-point: a straight ramp between two, the knees
// rounded), and cut into samples a metre apart (metres of the plan, as on a map): where it is, which way it
// goes, how it bends, how it climbs, how it leans.
//
// THE CAR IS NOT HELD BY THE RAILS. It is somewhere along the line (`s`) and somewhere across it (`u`: metres
// from the middle of the rails, to the right when positive). Speed pushes it to the outside of every bend — a
// banked bend less —, a crest lightens it (the stick bites less), the stick brings it back. Further across than
// the sleepers are wide, it falls: one is put back at the last pylon with a flag, the clock running. Stick
// forward runs, stick back brakes. One button: a burst of speed that comes back.
//
// Headings are counted the way the valley's are: 0 looks south (+z), and they grow turning left. Time advances
// in steps of 1/120 s whatever the frame rate. Nothing here is random: what is in the way never moves.

export const COASTER = {
  name: 'Hold the Rails!',
  step: 1 / 120,
  every: 10, // seconds between two starts on the clock everybody shares
  // where one asks to play, at the back of the north beach, and which way the gate looks (north: at the station and the lift)
  gate: { x: 38, z: -125, yaw: Math.PI },
  g: 9.81,
  rail: 0.75, // m: each rail from the middle of the line
  lim: [1.5, 1.0], // m: how far across the car may be — over the first kilometre, and over the last
  ease: [900, 700], // m: the tolerance narrows from so far into the line to so far before its end
  steer: 9.5, // m/s²: what the stick does across, at full stick
  grip: 2.6, // 1/s: how the rails hold what slides across them
  run: 4.2, runTop: 23, // m/s²: stick forward — less and less up to that speed (m/s)
  brake: 10, // m/s²: stick back
  roll: 0.12, drag: 0.0042, // what slows a car that coasts: so much (m/s²), and so much for each (m/s)²
  top: 38, creep: 3.5, // m/s: no car goes faster; none is ever left slower (nobody is stuck on a slope)
  chain: 15, // m/s: a lift
  boost: { push: 9, time: 1.1, rest: 5 }, // the burst: so hard (m/s²), for so long, and how long before another (s)
  bankAt: 16, bankMost: 0.5, // the bends lean as a car going so fast would wish (m/s), never more than so much (radians)
  light: [0.3, 1.25], // how light a car may get over a crest, how heavy in a dip (1: its own weight)
  fall: { time: 1.5, set: 0.7, v: 9 }, // s one falls for; s it takes to be set back on the rails; m/s one leaves the flag at
  mercy: 3, // falls in a row from the same flag after which one is put back at the next
  edge: 0.7, // of the tolerance: beyond, the outer wheel throws sparks
  lost: { keep: 0.12 }, // m: where a rail is missing, how far on the side of the other the middle of the car must stay
  lean: 0.15, // m: at a fork, how far on its side the car must be to take it
  stop: 8, // m/s²: how hard the car is stopped once the clock has stopped
};

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------------------------------------- the line, as it is drawn
// A way-point: [x, z, radius of the corner there (m), height of the rails there (m over the sea), name]. A name
// is what the rest hangs on: the lifts, the flags, the gaps, the names of the stretches.
export const WAY = [
  // ---- the station, at the back of the north beach, and the first lift: straight up the face of the mountain
  [38, -129, 0, 5.6, 'station'],
  [38, -147, 0, 5.6, 'lift1'],
  [38, -262, 0, 134, 'top1'],
  // ---- the north range, heading west: a level breath, a wide turn to the left, the first drop down the flank
  [38, -276, 0, 134],
  [38, -312, 26, 134, 'drop1'],
  [0, -308.6, 0, 129],
  [-52, -304, 50, 111, 'dip1'],
  [-92, -272, 45, 97.5],
  [-140, -277, 60, 113.5, 'hump1'],
  [-178, -266, 60, 112],
  [-208, -272, 40, 112.5, 'lift2'],
  // ---- the second lift, up to the heights of the north-west
  [-300, -292, 40, 180],
  [-418, -292, 0, 225, 'top2'],
  [-442, -292, 0, 225],
  // ---- the western range, from north to south
  [-474, -292, 24, 226, 'west'],
  [-472, -264, 0, 225.5],
  [-466, -245, 60, 213],
  [-446, -200, 60, 221.5, 'crest2'],
  // (the Whirl: once round, to the right, on the shoulder of the mountain — and out under the way in)
  [-446, -169, 0, 217, 'whirl'],
  [-446, -126, 20, 212],
  [-486, -126, 20, 210.5],
  [-486, -170, 20, 209.5],
  [-432, -170, 20, 207],
  [-432, -136, 0, 183.5],
  [-440, -100, 50, 201, 'hump2'],
  [-444, -72, 55, 180.5],
  [-446, -45, 50, 150.5],
  // (the Switchback: across the slope and back)
  [-412, -2, 30, 146.5, 'switch'],
  [-452, 48, 30, 156.5],
  [-430, 92, 40, 156, 'brink'],
  [-432, 138, 45, 98, 'hollow'],
  [-438, 172, 45, 114],
  [-440, 222, 45, 128.5],
  // ---- round the south-west, and the third lift
  [-416, 248, 45, 122.5],
  [-385, 276, 30, 104, 'lift3'],
  [-312, 287, 0, 150, 'top3'],
  // ---- the southern range, heading east: the last kilometre
  [-296, 289, 0, 150, 'south'],
  [-262, 298, 40, 124],
  [-226, 270, 30, 108.5],
  [-186, 296, 30, 103, 'hump3'],
  [-146, 268, 30, 89.5],
  [-104, 294, 30, 86.5],
  [-62, 280, 30, 85.5],
  [-20, 292, 28, 103.5, 'hump4'],
  [24, 289, 0, 115],
  // ---- the horseshoe, the last dive north to the edge of the meadow south of Mostly Up, and the terminus
  [64, 288, 18, 117.5, 'shoe'],
  [64, 251, 18, 92.5],
  [20, 252, 0, 86, 'leap'],
  [-32, 255, 0, 88],
  [-74, 257, 22, 96, 'dive'],
  [-30, 178, 0, 50.5, 'finish'],
  [-22, 163, 40, 34],
  [40, 137, 0, 24, 'end'],
];

// What hangs on the names. Metres are counted along the line from the way-point named.
const LIFTS = [['lift1', 'top1'], ['lift2', 'top2'], ['lift3', 'top3']];
const STRETCHES = [
  ['station', 'The Station'], ['lift1', 'The First Lift'], ['top1', 'The Runaway'], ['dip1', 'The Flank'], ['lift2', 'The Second Lift'],
  ['top2', 'The High Line'], ['whirl', 'The Whirl'], ['hump2', 'The Western Wall'], ['switch', 'The Switchback'], ['brink', 'The Hollow'], ['lift3', 'The Last Lift'],
  ['top3', 'The Rattler'], ['hump3', 'Last Legs'], ['shoe', 'The Horseshoe'], ['dive', 'The Dive'], ['finish', 'The Terminus'],
];
// a flag: [name of a way-point, metres after it, what the pylon is called]
const FLAGS = [
  ['station', 6, 'the station'], ['top1', 4, 'the top of the first lift'], ['dip1', 0, 'the Flank'], ['hump1', 28, 'the Flank'], ['top2', 4, 'the top of the second lift'],
  ['west', 28, 'the High Line'], ['whirl', 8, 'the Whirl'], ['whirl', 96, 'the Whirl'], ['hump2', -30, 'the Western Wall'], ['switch', -44, 'the Switchback'], ['brink', -40, 'the brink'], ['hollow', 34, 'the Hollow'],
  ['top3', 4, 'the top of the last lift'], ['south', 62, 'the Rattler'], ['hump3', 24, 'Last Legs'], ['hump4', -44, 'Last Legs'], ['hump4', 34, 'the Horseshoe'], ['shoe', 34, 'the Horseshoe'], ['leap', 40, 'the Leap'],
];
// a gap in the rails: [name, metres after it, how long it is (m), how high its ramp lifts the car (m), over how many
// metres]: one flies it, off the ramp — fast enough, or one falls short
const GAPS = [['drop1', 50, 7, 0.8, 10], ['hollow', 10, 16, 1.5, 12], ['leap', 14, 12, 0.6, 10]];
// a rail missing: [name, metres after it, how long (m), which rail (-1: the left one)]: one keeps to the other
const LOST = [['hump1', -14, 28, 1], ['west', 46, 30, -1], ['hump3', 58, 26, 1], ['dive', 34, 30, 1]];

// ---------------------------------------------------------------------------------------------- laying a line

/** Runs a box filter of `half` samples to each side twice over `a` (a triangle, then: what changes eases in and out). Ends are held. */
function ease(a, half) {
  half = Math.max(1, Math.round(half));
  let src = a;
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float64Array(src.length), sum = new Float64Array(src.length + 1);
    for (let i = 0; i < src.length; i++) sum[i + 1] = sum[i] + src[i];
    for (let i = 0; i < src.length; i++) {
      const lo = Math.max(0, i - half), hi = Math.min(src.length - 1, i + half);
      out[i] = (sum[hi + 1] - sum[lo] + src[0] * Math.max(0, half - i) + src[src.length - 1] * Math.max(0, i + half - (src.length - 1))) / (2 * half + 1);
    }
    src = out;
  }
  return src;
}

/**
 * Lays a line through way-points ([x, z, r, y, name]): straights, each corner rounded to its radius; the corners
 * eased; the heights a straight ramp from way-point to way-point, the knees rounded over `knee` metres. Returns
 * { points, length, step, track (its length along the rails), marks (name → metres) } — a point:
 * { s, x, y, z, yaw, tx, tz, k (how it bends, 1/m: to the left when positive), rise (m up per m of plan), kv (how
 * its slope turns, 1/m of rail: negative over a crest), bank (radians: positive leans into a left bend) }.
 */
export function lay(way, { knee = 7, round = 5 } = {}) {
  const H = 0.5, n = way.length, dirs = [], T = new Array(n).fill(0), turn = new Array(n).fill(0);
  for (let i = 0; i + 1 < n; i++) { const dx = way[i + 1][0] - way[i][0], dz = way[i + 1][1] - way[i][1], l = Math.hypot(dx, dz); dirs.push({ x: dx / l, z: dz / l, l, yaw: Math.atan2(dx, dz) }); }
  for (let i = 1; i + 1 < n; i++) { turn[i] = wrap(dirs[i].yaw - dirs[i - 1].yaw); T[i] = way[i][2] * Math.tan(Math.abs(turn[i]) / 2); }
  for (let i = 0; i + 1 < n; i++) if (T[i] + T[i + 1] > dirs[i].l + 1e-6) throw new Error(`coaster: way-points ${i} and ${i + 1} are too near for their corners (${(T[i] + T[i + 1]).toFixed(1)} m of bends in ${dirs[i].l.toFixed(1)} m)`);
  // ---- the plan, half a metre at a time; where each way-point is along it
  const raw = [], at = new Array(n).fill(0);
  let dist = 0;
  const put = (x, z) => { if (raw.length) dist += Math.hypot(x - raw[raw.length - 1].x, z - raw[raw.length - 1].z); raw.push({ x, z, d: dist }); };
  put(way[0][0], way[0][1]);
  for (let i = 0; i + 1 < n; i++) {
    const d = dirs[i], a = T[i], b = d.l - T[i + 1];
    for (let t = a + H; t < b - 1e-6; t += H) put(way[i][0] + d.x * t, way[i][1] + d.z * t);
    put(way[i][0] + d.x * b, way[i][1] + d.z * b);
    if (i + 2 < n && T[i + 1] > 0) {
      // the corner at way-point i + 1: an arc from here, about a centre on the side it turns to
      const r = way[i + 1][2], sg = Math.sign(turn[i + 1]), sx = way[i][0] + d.x * b, sz = way[i][1] + d.z * b;
      const cx = sx + sg * r * Math.cos(d.yaw), cz = sz - sg * r * Math.sin(d.yaw), arc = Math.abs(turn[i + 1]), steps = Math.max(2, Math.ceil((arc * r) / H));
      const from = dist;
      for (let q = 1; q <= steps; q++) { const yaw = d.yaw + sg * (arc * q) / steps; put(cx - sg * r * Math.cos(yaw), cz + sg * r * Math.sin(yaw)); }
      at[i + 1] = (from + dist) / 2;
    } else at[i + 1] = dist;
  }
  // ---- eased: the corners come on little by little (the line is drawn again half a metre apart, then smoothed)
  const total0 = dist, m = Math.round(total0 / H), xs = new Float64Array(m + 1), zs = new Float64Array(m + 1);
  for (let i = 0, j = 0; i <= m; i++) { const d = (total0 * i) / m; while (j < raw.length - 2 && raw[j + 1].d < d) j++; const a = raw[j], b = raw[j + 1], t = b.d > a.d ? (d - a.d) / (b.d - a.d) : 0; xs[i] = lerp(a.x, b.x, t); zs[i] = lerp(a.z, b.z, t); }
  const ex = ease(xs, round / H / 2), ez = ease(zs, round / H / 2), acc = new Float64Array(m + 1);
  // (the two ends stay where they were laid, and leave as they were laid: the filter holds them)
  for (let i = 1; i <= m; i++) acc[i] = acc[i - 1] + Math.hypot(ex[i] - ex[i - 1], ez[i] - ez[i - 1]);
  const total = acc[m], N = Math.round(total), step = total / N, P = [];
  for (let i = 0, j = 0; i <= N; i++) { const d = i * step; while (j < m - 1 && acc[j + 1] < d) j++; const t = acc[j + 1] > acc[j] ? (d - acc[j]) / (acc[j + 1] - acc[j]) : 0; P.push({ s: d, x: lerp(ex[j], ex[j + 1], t), z: lerp(ez[j], ez[j + 1], t) }); }
  const sOf = (d0) => { const f = clamp((d0 / total0) * m, 0, m), j = Math.min(m - 1, Math.floor(f)); return lerp(acc[j], acc[j + 1], f - j); };
  const marks = new Map(), nodes = [];
  way.forEach((w, i) => { const s = sOf(at[i]); if (w[4]) marks.set(w[4], s); if (Number.isFinite(w[3])) nodes.push([s, w[3]]); });
  // ---- which way it goes, how it bends
  for (let i = 0; i <= N; i++) { const a = P[Math.max(0, i - 1)], b = P[Math.min(N, i + 1)], d = Math.hypot(b.x - a.x, b.z - a.z) || 1; P[i].tx = (b.x - a.x) / d; P[i].tz = (b.z - a.z) / d; P[i].yaw = Math.atan2(P[i].tx, P[i].tz); }
  const ks = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) { const a = P[Math.max(0, i - 1)], b = P[Math.min(N, i + 1)]; ks[i] = wrap(b.yaw - a.yaw) / ((Math.min(N, i + 1) - Math.max(0, i - 1)) * step); }
  const k = ease(ks, 2);
  // ---- its heights: a ramp from node to node, the knees rounded
  const ys = new Float64Array(N + 1);
  for (let i = 0, j = 0; i <= N; i++) { const s = P[i].s; while (j < nodes.length - 2 && nodes[j + 1][0] < s) j++; const a = nodes[j], b = nodes[j + 1]; ys[i] = lerp(a[1], b[1], clamp((s - a[0]) / Math.max(1e-6, b[0] - a[0]), 0, 1)); }
  const y = ease(ys, knee / step);
  let track = 0;
  for (let i = 0; i <= N; i++) {
    const p = P[i], a = Math.max(0, i - 1), b = Math.min(N, i + 1);
    p.y = y[i]; p.k = k[i]; p.rise = (y[b] - y[a]) / ((b - a) * step);
    if (i) track += Math.hypot(step, y[i] - y[i - 1]);
    p.t = track;
  }
  for (let i = 0; i <= N; i++) { const a = Math.max(0, i - 1), b = Math.min(N, i + 1); P[i].kv = (Math.atan(P[b].rise) - Math.atan(P[a].rise)) / Math.max(1e-6, P[b].t - P[a].t); }
  // ---- how it leans: into its bends, as a car going at a fair speed would wish
  const lean = ease(Float64Array.from(P, (p) => clamp(Math.atan((p.k * COASTER.bankAt * COASTER.bankAt) / COASTER.g), -COASTER.bankMost, COASTER.bankMost)), 4);
  for (let i = 0; i <= N; i++) P[i].bank = lean[i];
  return { points: P, length: total, step, track, marks };
}

let built = null;
/**
 * The course, laid once:
 *   points, length, step, track   the line (see lay); each point also has `lim`: how far across a car may be there
 *   start     where a car waits (m);  finish  where the clock stops (m);  top  its highest rail (m over the sea)
 *   lifts     [{ from, to, v }]: the chain takes the car up, in the middle of the rails
 *   flags     [{ s, name }]: the pylons one is put back at — the first is the station
 *   gaps      [{ from, to, need (m/s: the least speed that flies it), lip, run (its ramp lifts the car so high, over so many metres), kick }]
 *   lost      [{ from, to, side (-1: the left rail is missing) }]
 *   forks     [{ from, to, side, points, length, … }]: another way, shorter and harder, between two metres of the line
 *   stretches [{ name, from, to }]
 */
export function course() {
  if (built) return built;
  const main = lay(WAY), P = main.points, L = main.length, at = (name, plus = 0) => { if (!main.marks.has(name)) throw new Error(`coaster: no way-point "${name}"`); return main.marks.get(name) + plus; };
  for (const p of P) p.lim = lerp(COASTER.lim[0], COASTER.lim[1], smooth(COASTER.ease[0], L - COASTER.ease[1], p.s));
  const lifts = LIFTS.map(([a, b]) => ({ from: at(a), to: at(b), v: COASTER.chain }));
  const stretches = STRETCHES.map(([mark, name], i) => ({ name, from: i ? at(mark) : 0, to: i + 1 < STRETCHES.length ? at(STRETCHES[i + 1][0]) : L + 1 }));
  const flags = FLAGS.map(([mark, plus, name]) => ({ s: at(mark, plus), name })).sort((a, b) => a.s - b.s);
  const gaps = GAPS.map(([mark, plus, len, lip, run]) => ({ from: at(mark, plus), to: at(mark, plus) + len, lip, run, kick: (2 * lip) / run })).sort((a, b) => a.from - b.from);
  const lost = LOST.map(([mark, plus, len, side]) => ({ from: at(mark, plus), to: at(mark, plus) + len, side })).sort((a, b) => a.from - b.from);
  built = { ...main, main, lifts, flags, gaps, lost, forks: [], stretches, start: flags[0].s, finish: at('finish'), top: Math.max(...P.map((p) => p.y)), end: P[P.length - 1] };
  built.main = built;
  for (const g of gaps) g.need = gapNeed(built, g);
  return built;
}

const _a = {}, _b = {}, _c = {};
/**
 * A line `s` metres from its start: { x, y, z, yaw, tx, tz, k, rise, kv, bank, lim, t (metres of rail), i (the
 * sample before), s }. `out` is filled and returned.
 */
export function railAt(line, s, out = {}) {
  const P = line.points, f = clamp(s / line.step, 0, P.length - 1), i = Math.min(P.length - 2, Math.floor(f)), t = f - i, a = P[i], b = P[i + 1];
  out.x = lerp(a.x, b.x, t); out.y = lerp(a.y, b.y, t); out.z = lerp(a.z, b.z, t); out.tx = lerp(a.tx, b.tx, t); out.tz = lerp(a.tz, b.tz, t);
  out.yaw = a.yaw + wrap(b.yaw - a.yaw) * t;
  out.k = lerp(a.k, b.k, t); out.rise = lerp(a.rise, b.rise, t); out.kv = lerp(a.kv, b.kv, t); out.bank = lerp(a.bank, b.bank, t); out.lim = lerp(a.lim, b.lim, t); out.t = lerp(a.t, b.t, t);
  out.i = i; out.s = clamp(s, 0, line.length);
  return out;
}

/**
 * The frame of the rails at a place of a line (see railAt): `fwd` (along the rails), `side` (towards the right of
 * who rides, leaning with the bend) and `up` (out of the sleepers), each [x, y, z].
 */
export function frameAt(p, out = { fwd: [0, 0, 0], side: [0, 0, 0], up: [0, 0, 0] }) {
  const c = 1 / Math.sqrt(1 + p.rise * p.rise), fx = p.tx * c, fy = p.rise * c, fz = p.tz * c;
  // level, to the right of the way one goes; then up, square to both
  const rx = -p.tz, rz = p.tx, vx = -fy * p.tx, vy = c, vz = -fy * p.tz;
  const cb = Math.cos(p.bank), sb = Math.sin(p.bank);
  // leaning into a left bend (bank > 0): the right-hand rail comes up
  out.fwd[0] = fx; out.fwd[1] = fy; out.fwd[2] = fz;
  out.side[0] = rx * cb + vx * sb; out.side[1] = vy * sb; out.side[2] = rz * cb + vz * sb;
  out.up[0] = vx * cb - rx * sb; out.up[1] = vy * cb; out.up[2] = vz * cb - rz * sb;
  return out;
}

const _f = { fwd: [0, 0, 0], side: [0, 0, 0], up: [0, 0, 0] };
/** A place of a line in the world: `u` metres to the right of the middle of the rails, `h` metres over them. out.x, out.y, out.z. */
export function railPoint(line, s, u = 0, h = 0, out = {}) {
  const p = railAt(line, s, _a), f = frameAt(p, _f);
  out.x = p.x + f.side[0] * u + f.up[0] * h; out.y = p.y + f.side[1] * u + f.up[1] * h; out.z = p.z + f.side[2] * u + f.up[2] * h; out.yaw = p.yaw;
  return out;
}

const CELL = 10, cellOf = (i, j) => (i + 4096) * 8192 + j + 4096;
/**
 * Where a place of the world is on the line: { line, s, u, d (how far from the middle of the rails, in plan) } —
 * or null when it is more than `reach` metres from it (the cars of the others are drawn where their riders are).
 */
export function railNear(c, x, z, y = null, reach = 8, out = {}) {
  if (!c._grid) {
    c._grid = new Map();
    for (const line of [c, ...c.forks]) for (const p of line.points) { const key = cellOf(Math.floor(p.x / CELL), Math.floor(p.z / CELL)); if (!c._grid.has(key)) c._grid.set(key, []); c._grid.get(key).push({ p, line }); }
  }
  let best = null, least = reach * reach;
  const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), span = Math.ceil(reach / CELL);
  for (let i = ci - span; i <= ci + span; i++) for (let j = cj - span; j <= cj + span; j++) {
    const list = c._grid.get(cellOf(i, j));
    if (!list) continue;
    // (where the line passes over itself, the height tells which of the two is meant)
    for (const q of list) { const d = (q.p.x - x) ** 2 + (q.p.z - z) ** 2 + (y === null ? 0 : ((q.p.y - y) * 0.5) ** 2); if (d < least) { least = d; best = q; } }
  }
  if (!best) return null;
  const p = best.p, dx = x - p.x, dz = z - p.z;
  out.line = best.line; out.s = clamp(p.s + dx * p.tx + dz * p.tz, 0, best.line.length); out.u = -dx * p.tz + dz * p.tx; out.d = Math.hypot(dx, dz);
  return out;
}

// ---------------------------------------------------------------------------------------------- what pushes a car

/** How hard a bend pushes a car going at `v` across the rails there (m/s², to the right when positive): nothing below the speed its lean was made for. */
export function pushAt(p, v) {
  const c = v * v * Math.abs(p.k) * Math.cos(p.bank) - COASTER.g * Math.sin(Math.abs(p.bank));
  return c > 0 ? Math.sign(p.k) * c : 0;
}
/** How heavy a car going at `v` is on the rails there: 1 its own weight, less over a crest, more in a dip. */
export function lightAt(p, v) {
  return clamp(1 + (v * v * p.kv * Math.sqrt(1 + p.rise * p.rise)) / COASTER.g, COASTER.light[0], COASTER.light[1]);
}
/** How far across a car may be at a place of a line: [left, right] (m from the middle; where a rail is missing, only the side of the other). */
export function roomAt(line, s, lim, out = [0, 0]) {
  out[0] = -lim; out[1] = lim;
  for (const g of line.lost) if (s >= g.from && s <= g.to) { if (g.side < 0) out[0] = COASTER.lost.keep; else out[1] = -COASTER.lost.keep; }
  return out;
}
const liftAt = (line, s) => { for (const l of line.lifts) if (s >= l.from && s < l.to) return l; return null; };

/** How high the ramp before a gap lifts a car at a place of a line (m): it curls up to the lip. */
export function rampAt(line, s) {
  for (const g of line.gaps) if (s > g.from - g.run && s <= g.from) { const t = (s - (g.from - g.run)) / g.run; return g.lip * t * t; }
  return 0;
}
/** The least speed (m/s) at the lip of a gap that carries a car over it. */
function gapNeed(line, g) {
  const K = COASTER, p = railAt(line, g.from, {}), c = 1 / Math.sqrt(1 + p.rise * p.rise), far = railAt(line, g.to, {});
  for (let v = 6; v <= K.top; v += 0.25) {
    const vh = v * c, t = (g.to - g.from) / vh, y = p.y + g.lip + (v * p.rise * c + vh * g.kick) * t - 0.5 * K.g * t * t;
    if (y >= far.y - 0.25) return v;
  }
  return K.top;
}

// ---------------------------------------------------------------------------------------------- a run

/** A car in the station, waiting `wait` seconds for its start: see stepRun. */
export function startRun(c, { wait = 0 } = {}) {
  return {
    course: c, line: c, q: c.start, s: c.start, u: 0, v: 0, vu: 0, clock: 0, acc: 0, wait, last: Math.ceil(wait),
    boost: 0, cool: 0, want: 0, // (a burst going on for so long yet; none before…; a press that waits)
    lifted: false, air: null, // on a chain; over a gap: { gap, y, vy, vh }
    fall: 0, why: '', fell: null, set: 0, // falling for so long yet, and why; where it left the rails; being set back on them
    flag: 0, fellAt: -1, again: 0, falls: 0, boosts: 0, edge: 0, edges: 0, light: 1, push: 0, x: 0, y: 0,
    over: false, time: 0, fast: 0, took: [],
  };
}

/**
 * Advances a run by `dt` seconds. `input`: { x (-1 … 1: the stick across, right when positive), y (-1 … 1:
 * forward runs, back brakes), boost (true on the frame the button is pressed) }. `events`, when given, is filled
 * with what happened: { type: 'tick' (n) | 'go' | 'lift' | 'top' | 'boost' | 'edge' (side) | 'air' | 'land' (hard)
 * | 'fork' (short) | 'fall' (why: 'out', 'gap', 'rail'; side) | 'back' (flag, on) | 'flag' (n) | 'finish' (time) }.
 */
export function stepRun(st, dt, input, events) {
  if (input?.boost) st.want = 0.2;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= COASTER.step) { st.acc -= COASTER.step; sub(st, COASTER.step, input, events); }
  return st;
}

function drop(st, why, events) {
  if (st.fall > 0) return;
  const K = COASTER;
  st.fell = { line: st.line, q: st.q, u: st.u, v: st.v, vu: st.vu || Math.sign(st.u), y: st.air ? st.air.y : null, side: Math.sign(st.u) || 1 };
  st.fall = K.fall.time; st.why = why; st.falls++; st.air = null; st.boost = 0; st.lifted = false;
  events?.push({ type: 'fall', why, side: st.fell.side });
}

function putBack(st, events) {
  const K = COASTER, c = st.course, flags = c.flags;
  if (st.flag === st.fellAt) st.again++; else { st.fellAt = st.flag; st.again = 1; }
  const on = st.again >= K.mercy && st.flag + 1 < flags.length;
  if (on) { st.flag++; st.again = 0; }
  const at = flags[st.flag].s;
  Object.assign(st, { line: c, q: at, s: at, u: 0, v: st.flag ? K.fall.v : 0, vu: 0, set: K.fall.set, air: null, boost: 0, cool: 0, fell: null, lifted: false });
  events?.push({ type: 'back', flag: st.flag, on });
}

function sub(st, dt, input, events) {
  const K = COASTER, c = st.course;
  if (st.wait > 0) {
    st.wait -= dt;
    const n = Math.ceil(st.wait);
    if (n !== st.last && n > 0 && n <= 3) events?.push({ type: 'tick', n });
    st.last = n;
    if (st.wait <= 0) events?.push({ type: 'go' });
    return;
  }
  if (!st.over) st.clock += dt;
  if (st.cool > 0) st.cool -= dt;
  if (st.want > 0) st.want -= dt;
  if (st.edge > 0) st.edge -= dt;
  // ---- falling: off the rails, down — then back on them at the last flag
  if (st.fall > 0) { st.fall -= dt; if (st.fall <= 0) putBack(st, events); return; }
  const line = st.line;
  let x = clamp(input?.x || 0, -1, 1), y = clamp(input?.y || 0, -1, 1);
  if (st.set > 0) { st.set -= dt; x = 0; y = 0; }
  if (st.over) { x = clamp(-st.u * 3 - st.vu, -1, 1); y = 0; }
  st.x = x; st.y = y;
  const p = railAt(line, st.q, _a), cosp = 1 / Math.sqrt(1 + p.rise * p.rise), sinp = p.rise * cosp, room = roomAt(line, st.q, p.lim, _room);

  // ---- over a gap: the car flies as it left the ramp
  if (st.air) {
    const A = st.air, before = st.q;
    A.vy -= K.g * dt; A.y += A.vy * dt;
    st.q += A.vh * dt; st.u += st.vu * dt;
    const r = railAt(line, st.q, _b);
    if (before < A.gap.to && st.q >= A.gap.to && A.y < railAt(line, A.gap.to, _c).y - 0.25) { drop(st, 'gap', events); return; }
    if (st.q < A.gap.to) { if (A.y < r.y - 2.5) { drop(st, 'gap', events); return; } } else if (A.y <= r.y) {
      const cp = 1 / Math.sqrt(1 + r.rise * r.rise), sp = r.rise * cp, hard = Math.max(0, -(A.vy * cp - A.vh * sp));
      st.air = null; st.v = clamp(A.vh * cp + A.vy * sp - 0.12 * Math.max(0, hard - 3), K.creep, K.top);
      events?.push({ type: 'land', hard });
      const rm = roomAt(line, st.q, r.lim, _room);
      if (st.u < rm[0] || st.u > rm[1]) { drop(st, 'out', events); return; }
    }
    place(st, events);
    return;
  }

  // ---- along the rails
  const lift = liftAt(line, st.q);
  if (lift && !st.over) {
    st.v += clamp(lift.v - st.v, -9 * dt, 9 * dt);
    if (st.boost > 0) st.boost -= dt;
    if (!st.lifted) { st.lifted = true; events?.push({ type: 'lift' }); }
  } else {
    if (st.lifted) { st.lifted = false; events?.push({ type: 'top' }); }
    if (st.want > 0 && st.cool <= 0 && st.set <= 0 && !st.over) { st.boost = K.boost.time; st.cool = K.boost.rest; st.want = 0; st.boosts++; events?.push({ type: 'boost' }); }
    let a = -K.g * sinp - K.roll - K.drag * st.v * st.v;
    if (y > 0) a += K.run * y * Math.max(0, 1 - st.v / K.runTop);
    if (st.boost > 0) { a += K.boost.push; st.boost -= dt; }
    st.v += a * dt;
    if (y < 0) st.v += K.brake * y * dt;
    if (st.over) st.v = Math.max(0, st.v - K.stop * dt); else st.v = clamp(st.v, K.creep, K.top);
  }
  if (st.v > st.fast) st.fast = st.v;

  // ---- across them: the bend pushes, the stick answers, the rails hold a little
  const light = lightAt(p, st.v), push = pushAt(p, st.v);
  st.light = light; st.push = push;
  if (lift && !st.over) { st.vu = 0; st.u += -st.u * Math.min(1, 5 * dt); } else {
    st.vu += (push + K.steer * x * Math.min(1, light) - K.grip * Math.min(1, light) * st.vu) * dt;
    st.u += st.vu * dt;
    if (st.u < room[0] || st.u > room[1]) { drop(st, room[1] - room[0] < p.lim * 1.5 && Math.abs(st.u) < p.lim ? 'rail' : 'out', events); return; }
    if (Math.abs(st.u) > p.lim * K.edge && st.edge <= 0) { st.edge = 0.5; st.edges++; events?.push({ type: 'edge', side: Math.sign(st.u) }); }
  }
  const before = st.q;
  st.q += st.v * cosp * dt;

  // ---- a gap: off its lip
  for (const g of line.gaps) if (before < g.from && st.q >= g.from) { st.air = { gap: g, y: p.y + g.lip, vy: st.v * sinp + st.v * cosp * g.kick, vh: st.v * cosp }; events?.push({ type: 'air', need: g.need, v: st.v }); break; }
  // ---- a fork: who is on its side of the rails takes it
  if (line === c) for (let n = 0; n < c.forks.length; n++) { const f = c.forks[n]; if (before < f.from && st.q >= f.from) { const short = st.u * f.side > K.lean; st.took.push(short ? 1 : 0); if (short) { st.line = f; st.q -= f.from; } events?.push({ type: 'fork', short, n }); break; } }
  place(st, events);
}
const _room = [0, 0];

/** Where the run is on the main line; its flags, its end. */
function place(st, events) {
  const c = st.course;
  if (st.line !== c && st.q >= st.line.length) { const f = st.line; st.line = c; st.q = f.to + (st.q - f.length); }
  st.s = st.line === c ? st.q : st.line.from + (st.q / st.line.length) * (st.line.to - st.line.from);
  while (st.flag + 1 < c.flags.length && st.s >= c.flags[st.flag + 1].s) { st.flag++; st.again = 0; st.fellAt = -1; events?.push({ type: 'flag', n: st.flag }); }
  if (!st.over && st.s >= c.finish) { st.over = true; st.time = Math.round(st.clock * 1000); events?.push({ type: 'finish', time: st.time }); }
  if (st.line === c && st.q > c.length - 3) { st.q = c.length - 3; st.v = 0; }
}

/**
 * Where a car is in the world, and how it stands: { x, y, z (the middle of its floor), yaw, pitch (nose up when
 * positive), roll (leaning to the left when positive), s, u, lim, falling (0 … 1: how far into its fall), air }.
 */
export function carPose(st, out = {}) {
  const K = COASTER;
  if (st.fall > 0 && st.fell) {
    // off the rails: thrown the way it was going, and down
    const F = st.fell, t = K.fall.time - st.fall, p = railAt(F.line, F.q, _a), f = frameAt(p, _f), cosp = 1 / Math.sqrt(1 + p.rise * p.rise);
    const along = F.v * 0.7 * t, across = F.u + F.side * (0.4 + 2.2 * t), down = 0.5 * K.g * t * t;
    out.x = p.x + p.tx * cosp * along + f.side[0] * across; out.z = p.z + p.tz * cosp * along + f.side[2] * across;
    out.y = (F.y ?? p.y) + p.rise * cosp * along * 0.5 - down; out.yaw = p.yaw - F.side * 0.5 * t; out.pitch = -0.5 * t; out.roll = -F.side * 3.2 * t;
    out.s = st.s; out.u = F.u; out.lim = p.lim; out.falling = clamp(t / K.fall.time, 0, 1); out.air = false; out.rise = p.rise; out.bank = p.bank; out.k = p.k;
    return out;
  }
  const p = railAt(st.line, st.q, _a), f = frameAt(p, _f);
  out.x = p.x + f.side[0] * st.u; out.z = p.z + f.side[2] * st.u; out.y = (st.air ? Math.max(st.air.y, p.y) : p.y + rampAt(st.line, st.q)) + f.side[1] * st.u;
  out.yaw = p.yaw; out.pitch = st.air ? Math.atan2(st.air.vy, st.air.vh) : Math.atan(p.rise); out.roll = p.bank;
  out.s = st.s; out.u = st.u; out.lim = p.lim; out.falling = 0; out.air = !!st.air; out.rise = p.rise; out.bank = p.bank; out.k = p.k;
  return out;
}

/**
 * How tense a run is, 0 … 1 (its music follows it): how far it has come, how fast it goes, how near the edge the
 * car is — and next to nothing on a lift.
 */
export function heatOf(st) {
  if (!st || st.wait > 0) return 0;
  const c = st.course, far = clamp((st.s - c.start) / (c.finish - c.start), 0, 1), p = railAt(st.line, st.q, _c);
  const fast = clamp((st.v - 12) / 20, 0, 1), edge = clamp(Math.abs(st.u) / p.lim, 0, 1);
  return clamp(0.12 + 0.5 * far + (st.lifted ? 0 : 0.26 * fast + 0.12 * edge * edge), 0, 1);
}

// ---------------------------------------------------------------------------------------------- a car that drives itself

/** The speed (m/s) at which the bend at a place asks `share` of the stick — less where the car is light. */
export function capAt(p, share) {
  const K = COASTER, k = Math.abs(p.k);
  if (k < 1e-4) return K.top;
  let v = Math.sqrt((share * K.steer + K.g * Math.sin(Math.abs(p.bank))) / (k * Math.cos(p.bank)));
  // (over a crest the stick bites less: the same bend asks more of it)
  for (let n = 0; n < 2; n++) { const light = Math.min(1, lightAt(p, v)); v = Math.sqrt((share * K.steer * light + K.g * Math.sin(Math.abs(p.bank))) / (k * Math.cos(p.bank))); }
  return Math.min(K.top, v);
}

const DELAY = { steady: 0.25, keen: 0, clumsy: 0 };
/**
 * A car that drives itself — the proof that the line can be ridden, and the times to beat. `how`:
 *   steady  a careful hand with a person's limits: what it does, it does a quarter of a second late
 *   keen    the same without the delay, braking later, taking the short way at every fork
 *   clumsy  the stick untouched: the chain takes it up, and the first bend throws it off
 * It leans against each bend as it comes, brakes before the ones that would ask too much of the stick, keeps to
 * the rail that is left where one is missing, and bursts where the line is straight — and before a gap that
 * needs it. Returns the input for stepRun.
 */
export function botInput(st, how = 'steady', out = { x: 0, y: 0, boost: false }) {
  if (how === 'clumsy') { out.x = 0; out.y = 0; out.boost = false; return out; }
  const K = COASTER, c = st.course, line = st.line, lag = DELAY[how], keen = how === 'keen';
  const now = { x: 0, y: 1, boost: false };
  if (st.wait <= 0 && st.fall <= 0 && !st.over) {
    const p = railAt(line, st.q, _b), cosp = 1 / Math.sqrt(1 + p.rise * p.rise), v = st.v;
    // ---- across: where it wants to be, and the push it will meet when its hand gets there
    let aim = 0;
    for (const g of line.lost) if (st.q < g.to && g.from - st.q < Math.max(26, v * 1.9)) aim = -g.side * 0.62;
    if (line === c) for (const f of c.forks) if (st.q < f.from && f.from - st.q < Math.max(30, v * 2)) aim = (keen ? 1 : -1) * f.side * 0.55;
    const pa = railAt(line, st.q + v * cosp * (lag + 0.08), _c), auth = K.steer * Math.min(1, lightAt(pa, v));
    const kp = keen ? 16 : 7.5, kd = keen ? 5.4 : 2.9;
    now.x = clamp((-pushAt(pa, v) - kp * (st.u + st.vu * lag * 0.5 - aim) - kd * st.vu) / auth, -1, 1);
    // ---- along: never faster than can still be braked for what comes — but fast enough over the lip of a gap
    const share = keen ? 0.86 : 0.6, dec = 7, see = v * (lag + 0.2), reach = (v * v) / (2 * dec) + see + 14;
    let jump = null;
    for (const g of line.gaps) if (g.from > st.q && g.from - st.q < v * 3 + 20) { jump = g; break; }
    const wish = jump ? jump.need * 1.12 + 1.5 : 0, lip = jump ? jump.from - st.q : Infinity;
    let y = 1, room = K.top;
    for (let d = 0; d <= reach; d += 2.5) {
      const r = railAt(line, st.q + d, _c);
      let cap = capAt(r, share);
      for (const g of line.lost) if (st.q + d > g.from - 6 && st.q + d < g.to) cap = Math.min(cap, capAt(r, share * 0.6));
      if (d >= lip) cap = Math.max(cap, wish + 2); // (what comes after a gap is not braked for before it)
      const can = Math.sqrt(cap * cap + 2 * dec * Math.max(0, d - see));
      room = Math.min(room, can - v);
      if (v > can) { y = -1; break; }
      if (v > can - 1) y = Math.min(y, 0);
    }
    // ---- a burst: before a gap that needs it, and where there is room for one
    if (jump && v < wish && y > 0) { if (st.cool <= 0 && lip / Math.max(4, v) < 2.2 && room > 6) now.boost = true; }
    else if (!jump && y > 0 && st.cool <= 0 && !st.lifted && room > (keen ? 7 : 10)) {
      let clear = true;
      for (let d = reach; d <= reach + v * 2.2 + 20; d += 4) { const r = railAt(line, st.q + d, _c); if (capAt(r, share) < v + 8) { clear = false; break; } }
      if (clear && !liftAt(line, st.q + v * 1.5)) now.boost = true;
    }
    now.y = y;
  }
  const steps = Math.round(lag / K.step);
  if (!steps) { out.x = now.x; out.y = now.y; out.boost = now.boost; return out; }
  const Q = st.botQ || (st.botQ = []);
  Q.push(now);
  const then = Q.length > steps ? Q.shift() : { x: 0, y: 1, boost: false };
  out.x = then.x; out.y = then.y; out.boost = then.boost && st.cool <= 0;
  return out;
}

/**
 * Rides the whole line with the bot (or with `how(st, input)`): { time (ms), over, clock, falls, boosts, edges,
 * fast (m/s), worst (the nearest it came to the edge, as a share of the tolerance), stretches ([{ name, t }]),
 * s, took (the forks: 1 the short way) }.
 */
export function botRun(c, how = 'steady', limit = 900) {
  const st = startRun(c), input = { x: 0, y: 0, boost: false }, stretches = [];
  let at = -1, worst = 0;
  for (let t = 0; t < limit && !st.over; t += COASTER.step) {
    if (typeof how === 'function') how(st, input); else botInput(st, how, input);
    if (input.boost) st.want = 0.2;
    sub(st, COASTER.step, input, null);
    if (st.fall <= 0 && !st.lifted) worst = Math.max(worst, Math.abs(st.u) / railAt(st.line, st.q, _c).lim);
    const i = c.stretches.findIndex((q) => st.s >= q.from && st.s < q.to);
    if (i > at) { at = i; stretches.push({ name: c.stretches[i].name, t: +st.clock.toFixed(1) }); }
  }
  return { time: st.over ? st.time : 0, over: st.over, clock: st.clock, falls: st.falls, boosts: st.boosts, edges: st.edges, fast: st.fast, worst, stretches, s: st.s, took: st.took };
}

/**
 * The least time the line can be ridden in (ms): flat out all the way, a burst as often as it comes back, by the
 * short way at every fork, as if nothing pushed the car off — what nobody can beat.
 */
export function fastest(c) {
  const K = COASTER;
  let t = 0, v = 0, cool = 0, boost = 0, s = c.start;
  const skip = c.forks.reduce((sum, f) => sum + Math.max(0, (f.to - f.from) - f.length), 0);
  for (let n = 0; n < 4e6 && s < c.finish - skip; n++) {
    const p = railAt(c, s, _c), cosp = 1 / Math.sqrt(1 + p.rise * p.rise), lift = liftAt(c, s), dt = K.step;
    if (lift) v += clamp(lift.v - v, -9 * dt, 9 * dt); else {
      if (cool <= 0) { boost = K.boost.time; cool = K.boost.rest; }
      let a = -K.g * p.rise * cosp - K.roll - K.drag * v * v + K.run * Math.max(0, 1 - v / K.runTop);
      if (boost > 0) { a += K.boost.push; boost -= dt; }
      v = clamp(v + a * dt, K.creep, K.top);
    }
    cool -= dt; s += v * cosp * dt; t += dt;
  }
  return Math.round(t * 1000);
}
