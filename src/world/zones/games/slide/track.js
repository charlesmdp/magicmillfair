// The course of the water slide ("Mostly Down"): a trough with a stream running down its middle, that leaves
// the rim of the cliffs above the golden dog, a hundred and fifty metres up, winds round the statue,
// corkscrews over the sea, opens into three lanes along the cliffs, into a pool of whirlpools by the fall that
// drops from them, whirls in the bay and throws its riders into the sea, a few strokes from the beach where
// they asked to ride.
//
// Nothing here knows about the renderer: the game, its tests and the bot that proves the course can be ridden
// all read the same lines. A line is laid like a toy track — so many metres straight, a bend of so many
// degrees, a helix, a gap to fly over — then its bends and its slopes are eased into one another, and it is
// cut into samples a metre apart: where it is, which way it goes, how it leans, how it curves, how wide it is.
//
// Across the trough everything is counted in metres along its surface from its middle, to the right when
// positive (`u`): a flat floor (none in a plain trough, metres of it where the slide opens out) and, beyond it
// on either side, a wall that curls up to the rim.
//
// Headings are counted the way the valley's are: 0 looks south (+z), and they grow turning left.

export const SLIDE = {
  name: 'Mostly Down',
  // where one asks to ride, on the sand at the north end of the beach, and which way the gate looks
  gate: { x: 63.5, z: -133.5, yaw: 1.05 },
  // the top: the deck on the rim of the cliff above the statue, and the way the trough leaves it
  top: { x: 189.5, z: -315.5, y: 154.6, yaw: 1.3324 },
  radius: 2.13, // of the walls of the trough (a plain trough is a shallow half pipe of that radius)
  rim: 1.0, // how far up its walls the trough goes (radians): beyond, one is over the edge
  stream: 0.9, // m: half the width of the water that runs down the middle of a plain trough — where one is carried
  shore: 1.28, // m: where nothing is left of its push
  step: 1, // metres between two samples
  checkpoint: 90, // metres, about, between two places one is put back at after going over the edge
};
/** How far a wall goes from the floor to the rim, along its surface (m). */
export const WALL = SLIDE.radius * SLIDE.rim;

const DEG = Math.PI / 180;
const TIGHT = 0.62; // the radius of a shortcut, as a share of that of the helix it cuts
const LEAN = 0.55; // how much of the lean a bend asks for the trough has
const REACH = 8.5; // metres: about how far beyond the end of the trough one comes down in the sea
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------------------------------------- laying a line

/** So many metres straight ahead, going down `drop` metres. */
export const line = (length, drop, o = {}) => ({ length, k: 0, slope: drop / length, ...o });
/** A bend of `angle` degrees (left when positive) of radius `r`, going down `drop` metres. */
export const bend = (angle, r, drop, o = {}) => { const length = Math.abs(angle) * DEG * r; return { length, k: Math.sign(angle) / r, slope: drop / length, ...o }; };
/** `turns` turns of a helix of radius `r` (to the left when positive), going down `drop` metres. */
export const helix = (turns, r, drop, o = {}) => bend(turns * 360, r, drop, o);
/** So many metres where there is no trough: one flies from a lip to the next stretch, or falls short. */
export const gap = (length, drop) => line(length, drop, { gap: true });

/** Runs a box filter of `width` samples twice over `a` (a triangle, then: bends ease in and out). Ends are held. */
function ease(a, width) {
  const half = Math.max(1, Math.round(width / 2));
  let src = a;
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float64Array(src.length), sum = new Float64Array(src.length + 1);
    for (let i = 0; i < src.length; i++) sum[i + 1] = sum[i] + src[i];
    for (let i = 0; i < src.length; i++) {
      const lo = Math.max(0, i - half), hi = Math.min(src.length - 1, i + half);
      // (beyond the ends the value of the end itself goes on)
      out[i] = (sum[hi + 1] - sum[lo] + src[0] * Math.max(0, half - i) + src[src.length - 1] * Math.max(0, i + half - (src.length - 1))) / (2 * half + 1);
    }
    src = out;
  }
  return src;
}

/**
 * Lays `segments` from `from` ({ x, y, z, yaw }). `lead`, `tail`: what the line had just been doing, and what it
 * does next ({ k, slope }), so that the easing runs through its ends. Returns raw points half a metre apart
 * (in plan): [{ x, y, z, tag }].
 */
function lay(from, segments, lead = null, tail = null) {
  const H = 0.5, k = [], slope = [], tags = [];
  for (const seg of segments) {
    const n = Math.max(1, Math.round(seg.length / H));
    for (let i = 0; i < n; i++) { k.push(seg.k); slope.push(seg.slope); tags.push(seg); }
  }
  const pad = 40, first = segments[0], last = segments[segments.length - 1];
  const before = lead || { k: first.k, slope: first.slope }, after = tail || { k: last.k, slope: last.slope };
  const wide = (a, x, y) => Float64Array.from([...new Array(pad).fill(x), ...a, ...new Array(pad).fill(y)]);
  const ks = ease(wide(k, before.k, after.k), 22).subarray(pad, pad + k.length), ss = ease(wide(slope, before.slope, after.slope), 18).subarray(pad, pad + k.length);
  const out = [];
  let { x, y, z, yaw } = from;
  for (let i = 0; i < k.length; i++) {
    out.push({ x, y, z, tag: tags[i] });
    // (half a step with the heading at the middle of it: a circle stays a circle)
    const mid = yaw + ks[i] * H * 0.5;
    x += Math.sin(mid) * H; z += Math.cos(mid) * H; y -= ss[i] * H; yaw += ks[i] * H;
  }
  out.push({ x, y, z, tag: tags[tags.length - 1] });
  out.yaw = yaw;
  return out;
}

/**
 * From raw points to the samples everything else reads, `step` metres apart along the line itself:
 * { x, y, z, s (metres from the start of the line), yaw, tx, ty, tz (the way it goes), k (how it bends, 1/m, left
 * when positive), kv (how its slope changes, 1/m: negative over a crest), slope (metres down per metre), bank
 * (how the trough leans into the bend, radians), F (half the width of its flat floor, m: none in a plain
 * trough), D (how deep the water stands over the floor, m), lim ([left, right]: how far from the middle one may
 * ride on each side, m — see rimAt), tag (the segment it came from) }.
 */
function sample(raw, step) {
  const acc = [0];
  for (let i = 1; i < raw.length; i++) acc.push(acc[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y, raw[i].z - raw[i - 1].z));
  const total = acc[acc.length - 1], n = Math.max(2, Math.round(total / step)), out = [];
  let j = 0;
  for (let i = 0; i <= n; i++) {
    const s = (total * i) / n;
    while (j < raw.length - 2 && acc[j + 1] < s) j++;
    const t = acc[j + 1] > acc[j] ? (s - acc[j]) / (acc[j + 1] - acc[j]) : 0, a = raw[j], b = raw[j + 1];
    out.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), s, tag: t < 0.5 ? a.tag : b.tag, F: 0, D: 0, lim: [WALL, WALL] });
  }
  const h = total / n;
  for (let i = 0; i <= n; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(n, i + 1)], d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) || 1;
    const p = out[i];
    p.tx = (b.x - a.x) / d; p.ty = (b.y - a.y) / d; p.tz = (b.z - a.z) / d;
    p.yaw = Math.atan2(p.tx, p.tz);
    p.slope = -p.ty / Math.max(1e-6, Math.hypot(p.tx, p.tz));
  }
  const turn = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  for (let i = 0; i <= n; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(n, i + 1)], span = (Math.min(n, i + 1) - Math.max(0, i - 1)) * h;
    out[i].k = turn(a.yaw, b.yaw) / span;
    out[i].kv = (Math.asin(b.ty) - Math.asin(a.ty)) / span;
  }
  // the trough leans into its bends — but only about half as much as someone going at a fair speed would wish:
  // a bend throws its riders up its outer side, out of the stream, and it is for them to steer back into it
  const lean = ease(Float64Array.from(out, (p) => clamp(Math.atan((p.k * 16 * 16) / 9.81) * LEAN, -0.8, 0.8)), 9 / h);
  for (let i = 0; i <= n; i++) out[i].bank = lean[i];
  return { points: out, length: total, step: h };
}

/**
 * Where a line is `s` metres from its start, and how it stands there: { x, y, z, yaw, k, kv, slope, bank, F, D,
 * tx, ty, tz, i (the sample before), s }. `out` is filled and returned.
 */
export function lineAt(line, s, out = {}) {
  const pts = line.points, f = clamp(s / line.step, 0, pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), t = f - i, a = pts[i], b = pts[i + 1];
  out.x = lerp(a.x, b.x, t); out.y = lerp(a.y, b.y, t); out.z = lerp(a.z, b.z, t);
  out.tx = lerp(a.tx, b.tx, t); out.ty = lerp(a.ty, b.ty, t); out.tz = lerp(a.tz, b.tz, t);
  out.yaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * t;
  out.k = lerp(a.k, b.k, t); out.kv = lerp(a.kv, b.kv, t); out.slope = lerp(a.slope, b.slope, t); out.bank = lerp(a.bank, b.bank, t);
  out.F = lerp(a.F, b.F, t); out.D = lerp(a.D, b.D, t);
  out.i = i; out.s = clamp(s, 0, line.length);
  return out;
}

/**
 * The frame of the trough at a place of a line (see lineAt): `side` (towards the right-hand side of who slides,
 * leaning with the bend) and `up` (out of the floor of the trough), each [x, y, z].
 */
export function frameAt(p, out = { side: [0, 0, 0], up: [0, 0, 0] }) {
  // level, to the right of the way one goes; then up, square to both (right × forward)
  const rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw);
  const vx = -rz * p.ty, vy = rz * p.tx - rx * p.tz, vz = rx * p.ty;
  const c = Math.cos(p.bank), sn = Math.sin(p.bank);
  // leaning into a left bend (bank > 0): the right-hand side comes up, the top tips to the left
  out.side[0] = rx * c + vx * sn; out.side[1] = vy * sn; out.side[2] = rz * c + vz * sn;
  out.up[0] = vx * c - rx * sn; out.up[1] = vy * c; out.up[2] = vz * c - rz * sn;
  return out;
}

/**
 * Where the surface of a trough whose floor is `F` wide (to each side) is, `u` metres across from its middle:
 * { off (to the side, m), lift (up, m), tilt (how the surface leans there, radians: 0 on the floor, up to the
 * rim's on a wall; of the sign of u) }.
 */
export function across(F, u, out = {}) {
  const e = Math.abs(u) - F, sg = u < 0 ? -1 : 1;
  if (e <= 0) { out.off = u; out.lift = 0; out.tilt = 0; return out; }
  const a = e / SLIDE.radius;
  out.off = sg * (F + SLIDE.radius * Math.sin(a)); out.lift = SLIDE.radius * (1 - Math.cos(a)); out.tilt = sg * a;
  return out;
}

// ---------------------------------------------------------------------------------------------- the course

/**
 * The slide, from the top to the sea: stretches, each a few segments. A stretch may hold a `shortcut` (a
 * tighter turn inside a helix, that leaves it `at` turns in and comes back to it a whole turn further down),
 * `lanes` (the trough opens out, flat, and is parted into three lanes, from so many metres into the stretch to
 * so many) or a `basin` (it opens into a pool where whirlpools turn). `aside` moves the line over, `by` metres
 * to the right (to the left when negative), from so many metres into the stretch to so many, easing over `ramp`
 * metres at both ends: room for what is wide, where a cliff stands close.
 */
const COURSE = [
  { name: 'The Launch', line: [line(12, 0.4), line(33.66, 10.7)] },
  { name: 'Round the Dog', line: [helix(1.788, 26, 41.3), line(30.99, 6.5), gap(9, 1.6), line(6, 1.9)] },
  { name: 'The Corkscrew', line: [helix(1.926, 24, 40)], shortcut: { at: 0.3, name: 'The Needle' } },
  { name: 'Three Lanes', line: [line(12, 2.4), gap(10, 2.0), line(77.6, 13.6)], lanes: { from: 37, to: 93 }, aside: { from: 0, to: 140, by: -5, ramp: 44 } },
  { name: 'The Drain', line: [line(25.04, 0.8), bend(-34.9, 38, 3.0), line(6, 1.0), gap(9, 1.0), line(20.9, 1.7)], basin: { from: 3, to: 30 } },
  { name: 'The Whirlpool', line: [helix(1.961, 20, 19.7)], shortcut: { at: 0.42, name: 'The Plughole' } },
  { name: 'Into the Sea', line: [line(10, 1.5), bend(63, 25, 2.6), line(8, 1.4)] },
];

export const LANES = { floor: 3.6, width: 2.4, centres: [-2.4, 0, 2.4], wall: 0.25, wallHeight: 0.9 };
export const BASIN = { floor: 3.2, depth: 0.9 };
export const POT = { floor: 1.9, depth: 0.8, length: 6 }; // a small pool round one whirlpool, in a plain stretch

let built = null;
/**
 * The course, laid once:
 *   main       the line from the top to the sea: { points, length, step }
 *   stretches  [{ name, from, to }] (metres along the main line)
 *   forks      [{ name, from, to (where it leaves the main line, and where it comes back to it), side (-1: it
 *              leaves on the left), points, length, step }]: the other way round a helix — shorter, steeper,
 *              tighter
 *   gaps       [{ from, to }] (metres along the main line) where there is no trough: one flies, or falls short
 *   marks      [{ s }] where one is put back after going over the edge or falling short (the first is the start)
 *   lanes      [{ from, to, centres, width }]: where the trough is parted into lanes (metres along the main line)
 *   basins     [{ from, to }]: the pools
 *   walls      [{ from, to, u, half, h }]: what parts the lanes — blocks standing in the water, with ways through
 *              between them for who aims well
 *   things     what lies in the water: [{ kind, line (-1: the main line, else the fork), s, u (where across,
 *              metres from the middle, right when positive), … }]:
 *                'bar'      a roll lying across, `half` m to each side, `h` m high: jumped, or run into
 *                'slider'   a roll that slides from side to side: `amp` m each way, once every `period` s
 *                'spinner'  a post with two arms `len` m long, `h` m above the water, turning once every `period` s
 *                'block'    a block too tall to jump, `half` m to each side and `len` m long: one goes round it
 *                'whirl'    a whirlpool: it draws in whoever comes within `reach` m of its eye, and holds and
 *                           spins whoever comes within `core` m; `r` is how wide it looks
 *   helices    [{ name, x, z, r, from, to, top, bottom, turn }]: what the line winds round
 *   finish     where the clock stops (metres along the main line): the end of the trough
 *   end        { x, y, z, yaw }: where the trough ends, over the sea; `splash`: { x, z } about where one lands
 */
export function slideCourse() {
  if (built) return built;
  const segments = [];
  COURSE.forEach((stretch, i) => { for (const seg of stretch.line) segments.push({ ...seg, stretch: i }); });
  const from = { x: SLIDE.top.x, y: SLIDE.top.y, z: SLIDE.top.z, yaw: SLIDE.top.yaw };
  const raw = lay(from, segments);
  {
    // the stretches that are moved aside (see COURSE): each point goes over, square to the way the line runs there
    const at = [0];
    for (let i = 1; i < raw.length; i++) at.push(at[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y, raw[i].z - raw[i - 1].z));
    const moved = raw.map((p) => ({ x: p.x, z: p.z }));
    COURSE.forEach((stretch, i) => {
      if (!stretch.aside) return;
      const s0 = at[raw.findIndex((p) => p.tag.stretch === i)], o = stretch.aside;
      raw.forEach((p, n) => {
        const t = Math.min(smooth(s0 + o.from, s0 + o.from + o.ramp, at[n]), 1 - smooth(s0 + o.to - o.ramp, s0 + o.to, at[n]));
        if (t <= 0) return;
        const a = raw[Math.max(0, n - 1)], b = raw[Math.min(raw.length - 1, n + 1)], d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        moved[n].x = p.x - ((b.z - a.z) / d) * o.by * t; moved[n].z = p.z + ((b.x - a.x) / d) * o.by * t; // (to the right of the way it goes: (-tz, tx))
      });
    });
    raw.forEach((p, n) => { p.x = moved[n].x; p.z = moved[n].z; });
  }
  const main = sample(raw, SLIDE.step);
  main.id = -1;
  const P = main.points;
  const stretches = COURSE.map((stretch, i) => {
    const mine = P.filter((p) => p.tag.stretch === i);
    return { name: stretch.name, from: mine[0].s, to: mine[mine.length - 1].s };
  });

  // the gaps: where the samples come from a segment that has no trough
  const gaps = [];
  {
    let run = null;
    for (const p of P) { if (p.tag.gap) { if (!run) gaps.push((run = { from: p.s - 0.5, to: p.s })); run.to = p.s + 0.5; } else run = null; }
  }

  // where the trough opens out: into lanes, into a pool
  const lanes = [], basins = [];
  COURSE.forEach((stretch, i) => {
    if (stretch.lanes) lanes.push({ from: stretches[i].from + stretch.lanes.from, to: stretches[i].from + stretch.lanes.to, centres: LANES.centres, width: LANES.width });
    if (stretch.basin) basins.push({ from: stretches[i].from + stretch.basin.from, to: stretches[i].from + stretch.basin.to });
  });
  const widen = (from, to, floor, depth, ramp) => {
    for (const p of P) {
      const t = Math.min(smooth(from - ramp, from, p.s), 1 - smooth(to, to + ramp, p.s));
      if (t <= 0) continue;
      p.F = Math.max(p.F, floor * t); p.D = Math.max(p.D, depth * t);
    }
  };
  for (const z of lanes) widen(z.from, z.to, LANES.floor, 0, 9);
  for (const z of basins) widen(z.from, z.to, BASIN.floor, BASIN.depth, 7);
  const opened = (s, room = 0) => [...lanes, ...basins].some((z) => s > z.from - 12 - room && s < z.to + 12 + room);

  // the shortcuts: a tighter turn inside the helix, from one of its turns to the next one down
  const forks = [];
  COURSE.forEach((stretch, i) => {
    if (!stretch.shortcut) return;
    const seg = stretch.line[0], turnLength = (2 * Math.PI) / Math.abs(seg.k), s0 = stretches[i].from + stretch.shortcut.at * turnLength, s1 = s0 + turnLength;
    const a = lineAt(main, s0), b = lineAt(main, s1);
    // (the easing takes a little of its turning away at both ends: it is given back as length, until the turn
    // comes round to the heading of the line it joins; what is then left to close is pulled in along the way)
    let inner = { length: turnLength * TIGHT, k: seg.k / TIGHT, slope: 0, stretch: i, shortcut: true }, raw = null;
    for (let pass = 0; pass < 4; pass++) {
      inner.slope = (a.y - b.y) / inner.length;
      raw = lay({ x: a.x, y: a.y, z: a.z, yaw: a.yaw }, [inner], { k: seg.k, slope: seg.slope }, { k: seg.k, slope: seg.slope });
      const short = a.yaw + Math.sign(seg.k) * 2 * Math.PI + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) - raw.yaw;
      if (Math.abs(short) < 0.004) break;
      inner = { ...inner, length: inner.length + short / inner.k };
    }
    const e = raw[raw.length - 1], dx = b.x - e.x, dy = b.y - e.y, dz = b.z - e.z;
    raw.forEach((p, n) => { const t = n / (raw.length - 1), w = t * t * (3 - 2 * t); p.x += dx * w; p.y += dy * w; p.z += dz * w; });
    const fork = sample(raw, SLIDE.step);
    Object.assign(fork, { id: forks.length, name: stretch.shortcut.name, from: s0, to: s1, side: seg.k > 0 ? -1 : 1, stretch: i });
    forks.push(fork);
  });

  // where one is put back: the start, a good run-up before every gap (far enough to gather the speed it
  // takes), and every so often in between — never in a shortcut, never where the trough is opened out
  const RUNUP = 24, inFork = (v) => forks.some((f) => (v > f.from - 14 && v < f.from + 20) || (v > f.to - 20 && v < f.to + 14));
  const spots = [0, ...gaps.map((g) => g.from - RUNUP)];
  for (let s = SLIDE.checkpoint; s < main.length - 60; s += SLIDE.checkpoint) {
    let at = s;
    for (let n = 0; n < 60 && (inFork(at) || opened(at) || gaps.some((g) => at > g.from - RUNUP - 30 && at < g.to + 20)); n++) at += 4;
    if (at < main.length - 50 && !spots.some((v) => Math.abs(v - at) < 40)) spots.push(at);
  }
  const marks = spots.sort((x, y) => x - y).map((s) => ({ s }));

  const things = [], walls = [], rnd = mulberry32(90210);
  // ---- the lanes: two rows of blocks part them, with ways through for who aims well; each lane has its own
  // trouble — rolls to jump on the left, arms that turn in the middle, blocks to go round on the right
  for (const z of lanes) {
    const [L, M, R] = z.centres, len = z.to - z.from, at = (m) => z.from + m, cut = (list) => list.filter(([a, b]) => b <= len - 1 && b > a);
    for (const [a, b] of cut([[3, 16], [25, 38], [47, len - 1]])) walls.push({ from: at(a), to: at(b), u: -LANES.width / 2, half: LANES.wall, h: LANES.wallHeight });
    for (const [a, b] of cut([[3, 11], [20, 31], [40, len - 1]])) walls.push({ from: at(a), to: at(b), u: LANES.width / 2, half: LANES.wall, h: LANES.wallHeight });
    const put = (kind, m, u, o = {}) => { if (m < len - 3) things.push({ kind, line: -1, s: at(m), u, ...o }); };
    // (what is jumped stands a good jump apart: fifteen metres and more)
    put('bar', 8, L, { half: 0.9, h: 0.46 }); put('slider', 23, L, { amp: 0.42, period: 1.9, phase: 0.6, half: 0.5, h: 0.46 });
    put('bar', 38, L, { half: 0.9, h: 0.46 }); put('slider', 52, L, { amp: 0.42, period: 1.5, phase: 2.2, half: 0.5, h: 0.46 });
    put('spinner', 10, M, { len: 0.86, period: 2.6, phase: 0.4, h: 0.42 }); put('block', 23, M + 0.6, { half: 0.35, len: 1.2, h: 1.3 });
    put('spinner', 36, M, { len: 0.86, period: -2.1, phase: 1.3, h: 0.42 }); put('bar', 52, M, { half: 0.9, h: 0.46 });
    put('block', 9, R + 0.8, { half: 0.4, len: 1.2, h: 1.3 }); put('block', 22, R - 0.6, { half: 0.4, len: 1.2, h: 1.3 });
    put('block', 35, R + 0.8, { half: 0.4, len: 1.2, h: 1.3 }); put('bar', 50, R, { half: 0.9, h: 0.46 });
  }
  // ---- the pools: three whirlpools in a triangle — one in the middle of the way in, to go round on either side,
  // then two abreast, to pass between
  for (const z of basins) {
    const len = z.to - z.from, at = (t) => z.from + len * t;
    for (const [t, u] of [[0.25, 0], [0.72, -1.95], [0.72, 1.95]]) things.push({ kind: 'whirl', line: -1, s: at(t), u, core: 0.75, reach: 2.6, r: 1.9 });
  }

  // ---- along the plain trough: it thickens as one goes down. Nothing on the launch; then rolls to jump, rolls
  // that slide from side to side, arms that turn — and, in a small pool of its own, a whirlpool to keep out of
  const free = (ln, s, room = 0) => (ln === main
    // (nothing on the way into a shortcut, nor on the run-up to a gap or where one lands after it, nor where the
    // trough is opened out: that has its own trouble)
    ? !forks.some((f) => (s > f.from - 44 - room && s < f.from + 16 + room) || Math.abs(s - f.to) < 11 + room) && !gaps.some((g) => s > g.from - RUNUP - 4 - room && s < g.to + 14 + room)
      && !marks.some((m) => m.s > 0 && Math.abs(s - m.s) < 9 + room) && !opened(s, room)
    : s > 14 && s < ln.length - 14);
  const pots = [];
  const strew = (ln, from, to, hard, only) => {
    let s = from, n = 0;
    const order = ['bar', 'pot', 'slider', 'spinner', 'pot', 'bar', 'slider', 'pot', 'spinner'];
    while (s < to) {
      const t = (s - from) / Math.max(1, to - from), level = clamp(hard(t), 0, 1);
      s += lerp(38, 23, level) * (0.85 + 0.3 * rnd());
      // (where nothing may lie, a little further on rather than not at all: no long way with nothing in it)
      const ok = (v, room) => v < to && free(ln, v, room);
      for (let m = 0; m < 6 && s < to && !ok(s, 0); m++) s += 3;
      if (!ok(s, 0)) continue;
      let kind = only || order[n++ % order.length];
      if (kind === 'pot') {
        // (a pool needs room about it: a little further on if need be, else a roll instead)
        let at = s;
        for (let m = 0; m < 7 && !ok(at, 7); m++) at += 3;
        if (ok(at, 7) && at < to - 50) s = at; else kind = 'bar'; // (none in the last metres, low over the shore)
      }
      const side = rnd() < 0.5 ? -1 : 1, outer = lineAt(ln, s).k < 0 ? -1 : 1; // (the side a bend throws its riders to)
      if (kind === 'bar') things.push({ kind, line: ln.id, s, u: 0, half: 1.19, h: 0.46 });
      else if (kind === 'slider') things.push({ kind, line: ln.id, s, u: 0, amp: 0.55, period: lerp(2.4, 1.5, level), phase: rnd() * 6.28, half: 0.5, h: 0.46 });
      else if (kind === 'spinner') things.push({ kind, line: ln.id, s, u: 0, len: 1.0, period: side * lerp(2.8, 1.9, level), phase: rnd() * 6.28, h: 0.42 });
      else { pots.push(s); things.push({ kind: 'whirl', line: ln.id, s, u: outer * lerp(0.25, 0.55, rnd()), core: 0.62, reach: 2.1, r: 1.45 }); } // (where one drifts to, unless one steers)
    }
  };
  const total = main.length;
  strew(main, 30, total - 14, (t) => 0.1 + 0.9 * ((30 + t * (total - 44)) / total) ** 1.2);
  for (const f of forks) strew(f, 16, f.length - 14, () => 0.9, 'bar'); // (a shortcut is tight enough: rolls only)
  for (const s of pots) widen(s - POT.length / 2, s + POT.length / 2, POT.floor, POT.depth, 6);

  // how far from the middle of the trough one may ride on each side, at every sample: [left, right] (metres,
  // both positive). The rim, as a rule; and where a shortcut leaves or joins, the ridge between the two troughs
  // — they are two pipes that cross, and what parts them stands where they are equally far.
  const R = SLIDE.radius, ridge = (d) => R * (d >= 2 * R * Math.sin(SLIDE.rim) ? SLIDE.rim : Math.asin(clamp(d / (2 * R), 0, 1)));
  for (const ln of [main, ...forks]) for (const p of ln.points) p.lim = [p.F + WALL, p.F + WALL];
  for (const f of forks) {
    const mine = f.side < 0 ? 0 : 1, theirs = 1 - mine; // the side of the main line the fork is on; and of the fork, the side the main line is on
    const near = (pts, q) => { let best = 1e9; for (const p of pts) { const d = Math.hypot(p.x - q.x, p.z - q.z, p.y - q.y); if (d < best) best = d; } return best; };
    const a0 = Math.max(0, Math.floor(f.from) - 2), a1 = Math.min(P.length - 1, Math.ceil(f.from) + 30), b0 = Math.max(0, Math.floor(f.to) - 30), b1 = Math.min(P.length - 1, Math.ceil(f.to) + 2);
    for (let i = a0; i <= a1; i++) if (P[i].s >= f.from) P[i].lim[mine] = Math.min(P[i].lim[mine], ridge(near(f.points.slice(0, 44), P[i])));
    for (let i = b0; i <= b1; i++) if (P[i].s <= f.to) P[i].lim[mine] = Math.min(P[i].lim[mine], ridge(near(f.points.slice(-44), P[i])));
    f.points.forEach((p, n) => {
      if (n < 34) p.lim[theirs] = Math.min(p.lim[theirs], ridge(near(P.slice(a0, a1 + 1), p)));
      if (n > f.points.length - 35) p.lim[theirs] = Math.min(p.lim[theirs], ridge(near(P.slice(b0, b1 + 1), p)));
    });
  }

  // the helices: what they turn round (a mast stands there), between which metres, and how high
  const helices = [];
  COURSE.forEach((stretch, i) => {
    const seg = stretch.line.find((g) => Math.abs(g.k) > 0 && g.length * Math.abs(g.k) > 5);
    if (!seg) return;
    const mine = P.filter((p) => p.tag.stretch === i && p.tag === P.find((q) => q.tag.stretch === i && Math.abs(q.tag.k) === Math.abs(seg.k) && q.tag.length === seg.length).tag && Math.abs(p.k) > Math.abs(seg.k) * 0.9), m = mine[mine.length >> 1];
    helices.push({ name: stretch.name, x: m.x + Math.cos(m.yaw) / m.k, z: m.z - Math.sin(m.yaw) / m.k, r: 1 / Math.abs(seg.k), from: mine[0].s, to: mine[mine.length - 1].s, top: mine[0].y, bottom: mine[mine.length - 1].y, turn: Math.sign(seg.k) });
  });

  things.sort((a, b) => a.line - b.line || a.s - b.s);
  const last = P[P.length - 1], end = { x: last.x, y: last.y, z: last.z, yaw: last.yaw };
  built = { main, length: main.length, finish: main.length - 0.4, stretches, forks, gaps, marks, lanes, basins, walls, things, helices, end, splash: { x: end.x + Math.sin(end.yaw) * REACH, z: end.z + Math.cos(end.yaw) * REACH } };
  return built;
}

/** The gap a place of a line is in, or null (only the main line has gaps). */
export function gapAt(course, line, s) {
  if (line >= 0) return null;
  for (const g of course.gaps) if (s >= g.from && s <= g.to) return g;
  return null;
}

/**
 * How far from the middle of the trough one may ride, on its left (`side` < 0) or its right, at a place of a
 * line (m). The whole rim, as a rule: `full` tells (it is not, by a ridge where a shortcut leaves or joins).
 */
export function rimAt(line, s, side) {
  const pts = line.points, f = clamp(s / line.step, 0, pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), k = side < 0 ? 0 : 1;
  return lerp(pts[i].lim[k], pts[i + 1].lim[k], f - i);
}

/** Where a slider is across the trough at `clock` seconds (m from the middle). */
export const sliderAt = (t, clock) => t.u + t.amp * Math.sin((clock / t.period) * 2 * Math.PI + t.phase);
/** How the arms of a spinner stand at `clock` seconds (radians: 0 along the trough, growing towards the right). */
export const spinnerAt = (t, clock) => (clock / t.period) * 2 * Math.PI + t.phase;
