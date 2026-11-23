// The course of the water slide ("Mostly Down"): a trough with a stream running down its middle, that leaves
// the rim of the cliffs above the golden dog, a hundred and fifty metres up, winds round the statue,
// corkscrews over the sea, swerves along the cliffs through the fall that drops from them, whirls in the bay
// and throws its riders into the sea, a few strokes from the beach where they asked to ride.
//
// Nothing here knows about the renderer: the game, its tests and the bot that proves the course can be ridden
// all read the same lines. A line is laid like a toy track — so many metres straight, a bend of so many
// degrees, a helix, a swerve, a gap to fly over — then its bends and its slopes are eased into one another,
// and it is cut into samples a metre apart: where it is, which way it goes, how it leans, how it curves.
//
// Headings are counted the way the valley's are: 0 looks south (+z), and they grow turning left.

export const SLIDE = {
  name: 'Mostly Down',
  // where one asks to ride, on the sand at the north end of the beach, and which way the gate looks
  gate: { x: 63.5, z: -133.5, yaw: 1.05 },
  // the top: the deck on the rim of the cliff above the statue, and the way the trough leaves it
  top: { x: 189.5, z: -315.5, y: 154.6, yaw: 1.3324 },
  radius: 2.13, // of the trough (a shallow half pipe): what one slides in
  rim: 1.0, // how far up its sides the trough goes (radians from its bottom): beyond, one is over the edge
  stream: 0.42, // half the width of the water that runs down the middle (radians): where one is carried
  step: 1, // metres between two samples
  checkpoint: 90, // metres, about, between two places one is put back at after going over the edge
};

const DEG = Math.PI / 180;
const TIGHT = 0.62; // the radius of a shortcut, as a share of that of the helix it cuts
const LEAN = 0.55; // how much of the lean a bend asks for the trough has
const REACH = 8.5; // metres: about how far beyond the end of the trough one comes down in the sea
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
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
/**
 * A swerve to one side and back onto the same line (to the left first when `side` > 0): three bends, `drop`
 * metres down in all. It takes the place of 4 · r · sin(angle) metres of straight line.
 */
export const swerve = (angle, r, drop, side = 1) => [bend(side * angle, r, drop / 4), bend(-side * 2 * angle, r, drop / 2), bend(side * angle, r, drop / 4)];
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
 * (how the trough leans into the bend, radians), tag (the segment it came from) }.
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
    out.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), s, tag: t < 0.5 ? a.tag : b.tag });
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
 * Where a line is `s` metres from its start, and how it stands there: { x, y, z, yaw, k, kv, slope, bank, tx, ty,
 * tz, i (the sample before), s }. `out` is filled and returned.
 */
export function lineAt(line, s, out = {}) {
  const pts = line.points, f = clamp(s / line.step, 0, pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), t = f - i, a = pts[i], b = pts[i + 1];
  out.x = lerp(a.x, b.x, t); out.y = lerp(a.y, b.y, t); out.z = lerp(a.z, b.z, t);
  out.tx = lerp(a.tx, b.tx, t); out.ty = lerp(a.ty, b.ty, t); out.tz = lerp(a.tz, b.tz, t);
  out.yaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * t;
  out.k = lerp(a.k, b.k, t); out.kv = lerp(a.kv, b.kv, t); out.slope = lerp(a.slope, b.slope, t); out.bank = lerp(a.bank, b.bank, t);
  out.i = i; out.s = clamp(s, 0, line.length);
  return out;
}

/**
 * The frame of the trough at a place of a line (see lineAt): `side` (towards the right-hand side of who slides,
 * leaning with the bend) and `up` (out of the bottom of the trough), each [x, y, z].
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

// ---------------------------------------------------------------------------------------------- the course

/**
 * The slide, from the top to the sea: stretches, each a few segments. A stretch may hold a `shortcut`: a
 * tighter turn inside a helix, that leaves it `at` turns in and comes back to it a whole turn further down.
 */
const COURSE = [
  { name: 'The Launch', line: [line(12, 0.4), line(33.66, 10.7)] },
  { name: 'Round the Dog', line: [helix(1.788, 26, 41.3), line(4, 1), ...swerve(18, 18.6, 4.5, 1), line(4, 1), gap(9, 1.6), line(6, 1.9)] },
  { name: 'The Corkscrew', line: [helix(1.926, 24, 40)], shortcut: { at: 0.3, name: 'The Needle' } },
  { name: 'The Balcony', line: [...swerve(26, 22, 7, 1), line(6, 1.4), gap(10, 1.8), line(7, 1.8), ...swerve(24, 22, 5.7, 1), line(2.23, 0.3)] },
  { name: 'Through the Fall', line: [...swerve(20, 18.3, 2.3, 1), bend(-34.9, 38, 2.1), line(6, 0.6), gap(9, 0.9), line(20.9, 1.6)] },
  { name: 'The Whirlpool', line: [helix(1.961, 20, 19.7)], shortcut: { at: 0.42, name: 'The Plughole' } },
  { name: 'Into the Sea', line: [line(10, 1.5), bend(54, 25, 2.5), line(8, 1.5)] },
];

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
 *   things     what lies in the stream: [{ kind, line (-1: the main line, else the fork), s, a (where across
 *              the trough, radians from its bottom, right when positive), … }] — a 'whirl' (a whirlpool, `r`
 *              metres across at most: who rides into it is held and spun) or a 'bar' (a roll lying across,
 *              `half` radians to each side, `h` metres high: one jumps it, goes round it, or runs into it)
 *   helices    [{ name, x, z, r, from, to, top, bottom, turn }]: what the line winds round
 *   finish     where the clock stops (metres along the main line): the end of the trough
 *   end        { x, y, z, yaw }: where the trough ends, over the sea; `splash`: { x, z } about where one lands
 * Every sample also carries `rim`: [left, right], how far up each side one may ride there (see rimAt).
 */
export function slideCourse() {
  if (built) return built;
  const segments = [];
  COURSE.forEach((stretch, i) => { for (const seg of stretch.line) segments.push({ ...seg, stretch: i }); });
  const from = { x: SLIDE.top.x, y: SLIDE.top.y, z: SLIDE.top.z, yaw: SLIDE.top.yaw };
  const main = sample(lay(from, segments), SLIDE.step);
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

  // how far up each side of the trough one may ride, at every sample: [left, right] (radians, both positive).
  // The rim, as a rule; and where a shortcut leaves or joins, the ridge between the two troughs — they are two
  // pipes that cross, and what parts them stands where they are equally far.
  const R = SLIDE.radius, ridge = (d) => (d >= 2 * R * Math.sin(SLIDE.rim) ? SLIDE.rim : Math.asin(clamp(d / (2 * R), 0, 1)));
  const rims = (line) => { for (const p of line.points) p.rim = [SLIDE.rim, SLIDE.rim]; };
  rims(main); forks.forEach(rims);
  for (const f of forks) {
    const mine = f.side < 0 ? 0 : 1, theirs = 1 - mine; // the side of the main line the fork is on; and of the fork, the side the main line is on
    const near = (pts, q) => { let best = 1e9; for (const p of pts) { const d = Math.hypot(p.x - q.x, p.z - q.z, p.y - q.y); if (d < best) best = d; } return best; };
    const a0 = Math.max(0, Math.floor(f.from) - 2), a1 = Math.min(P.length - 1, Math.ceil(f.from) + 30), b0 = Math.max(0, Math.floor(f.to) - 30), b1 = Math.min(P.length - 1, Math.ceil(f.to) + 2);
    for (let i = a0; i <= a1; i++) if (P[i].s >= f.from) P[i].rim[mine] = Math.min(P[i].rim[mine], ridge(near(f.points.slice(0, 44), P[i])));
    for (let i = b0; i <= b1; i++) if (P[i].s <= f.to) P[i].rim[mine] = Math.min(P[i].rim[mine], ridge(near(f.points.slice(-44), P[i])));
    f.points.forEach((p, n) => {
      if (n < 34) p.rim[theirs] = Math.min(p.rim[theirs], ridge(near(P.slice(a0, a1 + 1), p)));
      if (n > f.points.length - 35) p.rim[theirs] = Math.min(p.rim[theirs], ridge(near(P.slice(b0, b1 + 1), p)));
    });
  }

  // where one is put back: the start, a good run-up before every gap (far enough to gather the speed it
  // takes), and every so often in between — never in a shortcut
  const RUNUP = 24, inFork = (v) => forks.some((f) => (v > f.from - 14 && v < f.from + 20) || (v > f.to - 20 && v < f.to + 14));
  const spots = [0, ...gaps.map((g) => g.from - RUNUP)];
  for (let s = SLIDE.checkpoint; s < main.length - 60; s += SLIDE.checkpoint) {
    let at = s;
    for (let n = 0; n < 40 && (inFork(at) || gaps.some((g) => at > g.from - RUNUP - 30 && at < g.to + 20)); n++) at += 4;
    if (at < main.length - 50 && !spots.some((v) => Math.abs(v - at) < 40)) spots.push(at);
  }
  const marks = spots.sort((x, y) => x - y).map((s) => ({ s }));

  // what lies in the stream. It thickens as one goes down: nothing on the launch, then whirlpools to keep out
  // of and rolls to jump — rolls only where the trough runs straight enough to jump, and the wide ones (that
  // nobody gets round) further down
  const things = [], rnd = mulberry32(90210);
  const free = (line, s) => (line === main
    // (nothing on the way into a shortcut, nor on the run-up to a gap or where one lands after it)
    ? !forks.some((f) => (s > f.from - 44 && s < f.from + 16) || Math.abs(s - f.to) < 11) && !gaps.some((g) => s > g.from - RUNUP - 4 && s < g.to + 14)
      && !marks.some((m) => m.s > 0 && Math.abs(s - m.s) < 9)
    : s > 14 && s < line.length - 14);
  const strew = (line, from, to, hard, only) => {
    let s = from, last = only === 'bar' ? 'whirl' : '';
    while (s < to) {
      const u = (s - from) / Math.max(1, to - from), level = clamp(hard(u), 0, 1);
      s += lerp(38, 22, level) * (0.85 + 0.3 * rnd());
      // (where nothing may lie, a little further on rather than not at all: no long way with nothing in it)
      const ok = (v) => v < to && free(line, v) && Math.min(rimAt(line, v, -1), rimAt(line, v, 1)) >= SLIDE.rim - 0.05;
      for (let n = 0; n < 6 && s < to && !ok(s); n++) s += 3;
      if (!ok(s)) continue;
      const p = lineAt(line, s), straight = Math.abs(p.k) < 0.018;
      // a roll after a whirlpool, more often than not a whirlpool after a roll; the wide rolls (that nobody gets
      // round) only where the trough runs straight, and further down
      if (only === 'bar' || last === 'whirl' || (last === 'bar' && rnd() < 0.35)) {
        const wide = straight && rnd() < lerp(0.1, 0.7, level);
        things.push({ kind: (last = 'bar'), line: line.id, s, a: 0, half: wide ? SLIDE.rim - 0.1 : 0.56, h: 0.46, wide });
      } else {
        things.push({ kind: (last = 'whirl'), line: line.id, s, a: lerp(-0.14, 0.14, rnd()), r: 1.05 });
      }
    }
  };
  const total = main.length;
  strew(main, 30, total - 14, (u) => 0.1 + 0.9 * ((30 + u * (total - 44)) / total) ** 1.2);
  for (const f of forks) strew(f, 16, f.length - 14, () => 0.9, 'bar'); // (a shortcut is tight enough: rolls only)

  // the helices: what they turn round (a mast stands there), between which metres, and how high
  const helices = [];
  COURSE.forEach((stretch, i) => {
    const seg = stretch.line.find((g) => Math.abs(g.k) > 0 && g.length * Math.abs(g.k) > 5);
    if (!seg) return;
    const mine = P.filter((p) => p.tag.stretch === i && p.tag === P.find((q) => q.tag.stretch === i && Math.abs(q.tag.k) === Math.abs(seg.k) && q.tag.length === seg.length).tag && Math.abs(p.k) > Math.abs(seg.k) * 0.9), m = mine[mine.length >> 1];
    helices.push({ name: stretch.name, x: m.x + Math.cos(m.yaw) / m.k, z: m.z - Math.sin(m.yaw) / m.k, r: 1 / Math.abs(seg.k), from: mine[0].s, to: mine[mine.length - 1].s, top: mine[0].y, bottom: mine[mine.length - 1].y, turn: Math.sign(seg.k) });
  });

  const last = P[P.length - 1], end = { x: last.x, y: last.y, z: last.z, yaw: last.yaw };
  built = { main, length: main.length, finish: main.length - 0.4, stretches, forks, gaps, marks, things, helices, end, splash: { x: end.x + Math.sin(end.yaw) * REACH, z: end.z + Math.cos(end.yaw) * REACH } };
  return built;
}

/** The gap a place of a line is in, or null (only the main line has gaps). */
export function gapAt(course, line, s) {
  if (line >= 0) return null;
  for (const g of course.gaps) if (s >= g.from && s <= g.to) return g;
  return null;
}

/** How far up the left (`side` < 0) or the right-hand side of the trough one may ride at a place of a line (radians). */
export function rimAt(line, s, side) {
  const pts = line.points, f = clamp(s / line.step, 0, pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), k = side < 0 ? 0 : 1;
  return lerp(pts[i].rim[k], pts[i + 1].rim[k], f - i);
}
