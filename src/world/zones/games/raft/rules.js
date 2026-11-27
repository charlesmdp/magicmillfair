// Wild River: its course and how a raft goes down it. No renderer here: the game, its checks and the player
// that plays by itself all read these lines.
//
// The river comes down a headland of rock that stands in the sea at the foot of the northern cliffs: it rises in
// a pool under a great fall that drops from the cliff top (the Cauldron), winds through its own canyon in three
// long reaches and two hairpins, and goes over a last great fall into a lagoon open to the sea. (Why a headland
// of its own: see lab/games/raft.md — the mountains have no way down that a river could take.)
//
// A course is laid like a toy track — so many metres straight, a bend of so many degrees — then cut into samples
// a metre apart: where it is, which way it goes, how it bends, how high its water stands, how wide it is, how
// fast it runs. A raft is somewhere along it (`s` metres from the spring) and somewhere across it (`u`: metres
// from the middle, to the right when positive); it points `a` radians to the right of the way the river goes.
//
// The stream carries; one paddles on (forward), holds water (back) and steers — a raft has weight: it slides to
// the outside of a bend, turns late, spins when a rock catches a corner. One button: BRACE. Pressed just before
// a rock or a fall, it saves the knock. Taken sideways by a fall or a great wave, the raft goes over: one swims,
// and climbs back in at the last flag (there is one at every pool), the clock running.
//
// Headings are counted the way the valley's are: 0 looks south (+z), and they grow turning left.
// Time advances in steps of 1/120 s whatever the frame rate. Nothing here is random: what is in the way never
// moves, and is the same for everybody.

export const RAFT = {
  name: 'Wild River',
  step: 1 / 120,
  every: 10, // seconds between two starts on the clock everybody shares
  // where one asks to play, on the sand at the north end of the beach, and which way the gate looks (at the sea)
  gate: { x: 51.5, z: -116.5, yaw: 1.2 },
  // the spring: the middle of the Cauldron, at the foot of the northern sea cliffs, and the way the river leaves it
  top: { x: 291, z: -490, y: 53.85, yaw: Math.PI / 2 },
  r: 1.25, // m: a raft, for what it runs into (it is 3.7 m long and 2 m wide)
  g: 9.81,
  carry: 1.0, // 1/s: how fast the stream takes a raft along with it
  grip: 1.3, // 1/s: …and stills what it does across the stream
  paddle: 2.7, // m/s²: paddling on, the way the raft points
  back: 2.3, // m/s²: holding water
  draw: 1.7, // m/s²: straight across, at full stick (the paddles pull the raft sideways)
  steer: 0.8, // radians: how far off the stream the crew points the raft at full stick
  turn: { pull: 7.5, damp: 4.3, most: 3.3 }, // the raft comes round to where it is pointed: stiffness, damping, the most it can turn (rad/s²)
  swing: 0.45, // how much of a bend throws the raft towards its outer bank
  brace: { hold: 0.55, rest: 0.45, early: 0.12 }, // s: how long a brace holds, how long before another, how much too early a press may come
  knock: { soft: 1.3, keep: 0.55, stun: 0.9, spin: 1.6, over: 3.2 }, // a rock: under `soft` m/s it only shoves; a knock keeps so much speed and takes the paddles for so long; a second hard one while knocked turns the raft over
  bank: { hard: 2.3, keep: 0.8 }, // into a bank faster than that (m/s), one is thrown back, with so much of one's speed
  side: 0.78, // sin of the angle off the stream beyond which a raft is taken sideways (51°)
  fall: { least: 1.4, great: 6, stun: [0.55, 0.12, 1.6], keep: 0.55 }, // a fall under `least` m is nothing; over `great` it must be braced; a knock takes the paddles for a + b·h s (c at the most)
  hole: { hold: 3.4, out: 1.0, speed: 3.4, punch: 0.72 }, // a hole holds so long at the most; so much paddling gets one out, at that speed; punched through, it leaves so much of one's speed
  shoal: { drag: 3.2, crawl: 1.3 }, // on a gravel bar: how hard it holds, how fast one still creeps over it
  swim: 2.1, // s in the water after going over, before one is back in the raft at the last flag
  climb: 0.9, // s to climb back in (no paddle yet)
  mercy: 3, // times over in a row from the same flag after which one is put back at the next
  least: 0.4, // m/s: the stream never leaves a raft slower than this (nobody is stuck in a pool)
  upstream: -1.6, // m/s: the most one can make back up the river, holding water
};

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------------------------------------- laying the river

/** So many metres straight ahead. */
export const line = (length) => ({ length, k: 0 });
/** A bend of `angle` degrees (to the left when positive) of radius `r`. */
export const bend = (angle, r) => ({ length: Math.abs(angle) * DEG * r, k: Math.sign(angle) / r });

// The water of each kind of stretch: how fast it runs down the middle (m/s), half its width (m), how wide its
// banks are before the walls of the canyon (m, left and right), how deep it looks (0 thin and white, 1 dark).
const WATER = {
  pool: { c: 1.7, hw: 6.6, bank: 3.6, deep: 1 },
  riffle: { c: 3.7, hw: 5.4, bank: 3.2, deep: 0.35 },
  rapid: { c: 4.9, hw: 5.4, bank: 2.8, deep: 0.2 },
  narrows: { c: 6.3, hw: 3.3, bank: 0.5, deep: 0.45 },
  fall: { c: 5.6, hw: 5.2, bank: 2.4, deep: 0.15 },
  fork: { c: 4.4, hw: 10.2, bank: 2.6, deep: 0.3 },
  lagoon: { c: 1.3, hw: 9.5, bank: 5, deep: 1 },
};

/**
 * The river, from the spring to the sea: stretches, each a few segments, going down `drop` metres in all. What
 * lies in a stretch is given in metres from where it begins (`at`) and across (`u`, right when positive):
 *   rocks   [at, u, radius]            boulders: gone round
 *   ledges  [at, height]               falls, from bank to bank: taken straight, and braced
 *   waves   [from, to, u0, u1, height] a train of standing waves: the fast water — and, a metre high or more, a
 *                                      great wave: taken head on
 *   holes   [from, to, u0, u1]         the white boil that holds a raft, below a fall
 *   shoals  [from, to, u0, u1]         a gravel bar: one grounds on it
 *   island  [from, to, u, half]        an island of rock in the middle: the river forks round it
 *   flag    at                         a flag on the bank: a save
 */
const COURSE = [
  { name: 'The Cauldron', kind: 'pool', line: [line(26)], drop: 0.15, hw: 8 },
  { name: 'First Riffles', kind: 'riffle', line: [bend(15, 70), bend(-15, 70), line(3)], drop: 2.0,
    rocks: [[13, -3.7, 1.0], [27, 3.5, 1.1]], waves: [[6, 34, -1.6, 1.6, 0.28]] },
  { name: 'The Rock Garden', kind: 'rapid', line: [line(22), bend(-13, 90), bend(13, 90), line(11)], drop: 4.6, hw: 6,
    rocks: [[7, -1.6, 1.3], [16, 3.0, 1.2], [25, -3.9, 1.1], [29, 0.8, 1.35], [38, 4.1, 1.2], [42, -2.4, 1.5], [52, 1.9, 1.3], [57, -4.2, 1.1], [64, -0.5, 1.35], [69, 3.7, 1.0]] },
  { name: 'Otter Pool', kind: 'pool', line: [line(26)], drop: 0.2, flag: 12 },
  { name: 'The Step', kind: 'fall', line: [line(10)], drop: 2.7, ledges: [[5, 2.4]] },
  { name: 'The Big Bend', kind: 'rapid', line: [bend(-180, 20)], drop: 3.6, hw: 5.8,
    rocks: [[41, -4.5, 1.2]], waves: [[8, 52, -4.6, -1.2, 0.6]], shoals: [[14, 50, 2.6, 5.8]] },
  { name: 'Heron Pool', kind: 'pool', line: [line(24)], drop: 0.2, flag: 12 },
  { name: 'The Narrows', kind: 'narrows', line: [line(6), bend(13, 80), bend(-26, 80), bend(13, 80), line(12.5)], drop: 5.9,
    rocks: [[19, -2.75, 1.05], [37, 2.7, 1.05], [56, -2.6, 1.1]], waves: [[4, 68, -1.1, 1.1, 0.5]] },
  { name: 'The Chute', kind: 'fall', line: [line(12)], drop: 3.3, ledges: [[4, 3.0]], holes: [[5.6, 10.4, -0.8, 5.2]] },
  { name: 'Boulder Alley', kind: 'rapid', line: [line(42)], drop: 3.3,
    rocks: [[7, 2.7, 1.6], [16, -3.0, 1.5], [25, 1.3, 1.7], [33, -2.2, 1.5], [39, 3.6, 1.2]], waves: [[26, 40, -5, -3.2, 0.4]] },
  { name: 'Kingfisher Pool', kind: 'pool', line: [line(22)], drop: 0.2, flag: 11 },
  { name: 'The Hairpin', kind: 'rapid', line: [bend(180, 20)], drop: 4.2, hw: 5.8,
    rocks: [[51, -0.6, 1.4]], waves: [[6, 26, 1.2, 4.8, 0.55], [33, 36.5, -0.6, 5.8, 1.25]], shoals: [[12, 44, -5.8, -3.0]] },
  { name: 'The Fork', kind: 'fork', line: [line(15), bend(10, 90), bend(-10, 90), line(13)], drop: 4.0,
    island: [13, 47, 0.7, 3.1], rocks: [[21, -6.9, 1.25], [31, -3.7, 1.2], [40, -7.4, 1.15]], waves: [[14, 46, -7.6, -3.6, 0.45]] },
  { name: 'Last Chance', kind: 'pool', line: [line(24)], drop: 0.2, flag: 12 },
  { name: 'The Staircase', kind: 'rapid', line: [line(52)], drop: 8.7,
    ledges: [[10, 1.7], [24, 1.7], [38, 1.7]], rocks: [[17, 3.3, 1.2], [31, -3.6, 1.2], [46, 2.6, 1.2]], holes: [[25.4, 29.4, -5.4, -0.4]] },
  { name: 'The Great Fall', kind: 'fall', line: [line(14)], drop: 10.1, ledges: [[4.5, 9.6]] },
  { name: 'The Lagoon', kind: 'lagoon', line: [line(27)], drop: 0.12 },
];
const FINISH = 16; // metres into the lagoon: where the clock stops

/** Runs a box filter of `width` samples twice over `a` (bends and widths ease in and out). Ends are held. */
function ease(a, width) {
  const half = Math.max(1, Math.round(width / 2));
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

let built = null;
/**
 * The course, laid once:
 *   points     a sample every metre: { x, z, s, yaw, tx, tz (the way it goes), k (how it bends, 1/m, left when
 *              positive), y (the height of its water), slope, hw (half the width of its water), bank ([left,
 *              right]: how wide each bank is), c (how fast it runs down its middle), deep, stretch }
 *   length, finish (where the clock stops), drop
 *   stretches  [{ name, kind, from, to }]
 *   rocks      [{ s, u, r }]            ledges  [{ s, h, run (how far the water takes to come down) }]
 *   waves      [{ from, to, u0, u1, h }] holes   [{ from, to, u0, u1 }]     shoals  [{ from, to, u0, u1 }]
 *   islands    [{ from, to, u, half }]   flags   [{ s, name }] — the first is the spring: where a run begins
 */
export function raftCourse() {
  if (built) return built;
  const H = 0.5, ks = [], tags = [];
  COURSE.forEach((stretch, i) => { for (const seg of stretch.line) { const n = Math.max(1, Math.round(seg.length / H)); for (let q = 0; q < n; q++) { ks.push(seg.k); tags.push(i); } } });
  const pad = 30, wide = (a) => Float64Array.from([...new Array(pad).fill(a[0]), ...a, ...new Array(pad).fill(a[a.length - 1])]);
  const k = ease(wide(ks), 14).subarray(pad, pad + ks.length);
  // ---- the plan: half a metre at a time (the heading at the middle of each step: a circle stays a circle)
  const raw = [];
  let { x, z, yaw } = RAFT.top;
  for (let i = 0; i < ks.length; i++) {
    raw.push({ x, z, i: tags[i] });
    const mid = yaw + k[i] * H * 0.5;
    x += Math.sin(mid) * H; z += Math.cos(mid) * H; yaw += k[i] * H;
  }
  raw.push({ x, z, i: tags[tags.length - 1] });
  const total = (raw.length - 1) * H, n = Math.round(total), P = [];
  for (let m = 0; m <= n; m++) { const f = Math.min(raw.length - 1.001, (m * total) / n / H), a = raw[Math.floor(f)], b = raw[Math.floor(f) + 1], t = f - Math.floor(f); P.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), s: (m * total) / n, stretch: t < 0.5 ? a.i : b.i }); }
  const step = total / n;
  for (let m = 0; m <= n; m++) {
    const a = P[Math.max(0, m - 1)], b = P[Math.min(n, m + 1)], d = Math.hypot(b.x - a.x, b.z - a.z) || 1, p = P[m];
    p.tx = (b.x - a.x) / d; p.tz = (b.z - a.z) / d; p.yaw = Math.atan2(p.tx, p.tz);
  }
  for (let m = 0; m <= n; m++) { const a = P[Math.max(0, m - 1)], b = P[Math.min(n, m + 1)]; P[m].k = wrap(b.yaw - a.yaw) / ((Math.min(n, m + 1) - Math.max(0, m - 1)) * step); }
  // ---- the stretches, and what lies in them
  const stretches = COURSE.map((stretch, i) => { const mine = P.filter((p) => p.stretch === i); return { name: stretch.name, kind: stretch.kind, from: mine[0].s, to: mine[mine.length - 1].s + (i < COURSE.length - 1 ? step : 0) }; });
  const rocks = [], ledges = [], waves = [], holes = [], shoals = [], islands = [], flags = [{ s: 9, name: COURSE[0].name }];
  COURSE.forEach((stretch, i) => {
    const s0 = stretches[i].from;
    for (const [at, u, r] of stretch.rocks || []) rocks.push({ s: s0 + at, u, r });
    for (const [at, h] of stretch.ledges || []) ledges.push({ s: s0 + at, h, run: 1.1 + 0.22 * h });
    for (const [from, to, u0, u1, h] of stretch.waves || []) waves.push({ from: s0 + from, to: s0 + to, u0, u1, h });
    for (const [from, to, u0, u1] of stretch.holes || []) holes.push({ from: s0 + from, to: s0 + to, u0, u1 });
    for (const [from, to, u0, u1] of stretch.shoals || []) shoals.push({ from: s0 + from, to: s0 + to, u0, u1 });
    if (stretch.island) { const [from, to, u, half] = stretch.island; islands.push({ from: s0 + from, to: s0 + to, u, half }); }
    if (stretch.flag) flags.push({ s: s0 + stretch.flag, name: stretch.name });
  });
  rocks.sort((a, b) => a.s - b.s); ledges.sort((a, b) => a.s - b.s);
  rocks.forEach((r, index) => { r.index = index; });
  // ---- how high the water stands: each stretch comes down by its drop — its falls at once, the rest evenly
  const y = new Float64Array(n + 1);
  {
    let level = RAFT.top.y;
    const slope = new Float64Array(n + 1);
    COURSE.forEach((stretch, i) => {
      const st = stretches[i], steps = (stretch.ledges || []).reduce((sum, l) => sum + l[1], 0), even = Math.max(0, stretch.drop - steps) / Math.max(1, st.to - st.from);
      for (let m = 0; m <= n; m++) if (P[m].stretch === i) slope[m] = even;
    });
    const eased = ease(slope, 9);
    for (let m = 0; m <= n; m++) {
      y[m] = level;
      level -= eased[m] * step;
    }
    // (the falls: the water comes down a ledge over a metre or two)
    for (const l of ledges) for (let m = 0; m <= n; m++) y[m] -= l.h * smooth(l.s, l.s + l.run, P[m].s);
    // (and the lagoon lies a hand above the sea, whatever the easing made of the rest)
    const off = y[n] - 0.35;
    for (let m = 0; m <= n; m++) y[m] -= off * (m / n);
  }
  // ---- how wide it is, how fast it runs
  const of = (key, own) => ease(Float64Array.from(P, (p) => (own && COURSE[p.stretch][own]) ?? WATER[COURSE[p.stretch].kind][key]), 12);
  const hw = of('hw', 'hw'), c = of('c'), bank = of('bank'), deep = of('deep');
  for (let m = 0; m <= n; m++) {
    const p = P[m];
    p.y = y[m]; p.slope = (y[Math.max(0, m - 1)] - y[Math.min(n, m + 1)]) / ((Math.min(n, m + 1) - Math.max(0, m - 1)) * step);
    p.hw = hw[m]; p.c = c[m]; p.bank = [bank[m], bank[m]]; p.deep = deep[m];
    // (the water gathers speed coming to the lip of a fall, and is white and slow under it)
    for (const l of ledges) {
      if (p.s <= l.s) p.c = Math.max(p.c, 5.8 * (1 - smooth(0, 9, l.s - p.s)));
      else p.c *= 1 - 0.35 * (1 - smooth(l.s + l.run, l.s + l.run + 5, p.s));
    }
  }
  const last = P[n];
  built = {
    points: P, step, length: total, finish: stretches[stretches.length - 1].from + FINISH, drop: y[0] - y[n], stretches,
    rocks, ledges, waves, holes, shoals, islands, flags,
    end: { x: last.x, z: last.z, y: last.y, yaw: last.yaw },
  };
  return built;
}

const _a = {};
/**
 * The river `s` metres from its spring: { x, z, yaw, tx, tz, k, y, slope, hw, c, deep, bank, i (the sample before),
 * s }. `out` is filled and returned.
 */
export function riverAt(course, s, out = {}) {
  const P = course.points, f = clamp(s / course.step, 0, P.length - 1), i = Math.min(P.length - 2, Math.floor(f)), t = f - i, a = P[i], b = P[i + 1];
  out.x = lerp(a.x, b.x, t); out.z = lerp(a.z, b.z, t); out.tx = lerp(a.tx, b.tx, t); out.tz = lerp(a.tz, b.tz, t);
  out.yaw = a.yaw + wrap(b.yaw - a.yaw) * t;
  out.k = lerp(a.k, b.k, t); out.y = lerp(a.y, b.y, t); out.slope = lerp(a.slope, b.slope, t); out.hw = lerp(a.hw, b.hw, t);
  out.c = lerp(a.c, b.c, t); out.deep = lerp(a.deep, b.deep, t); out.bank = a.bank; out.i = i; out.s = clamp(s, 0, course.length);
  return out;
}
/** A place of the river in the world: `u` metres to the right of its middle; out.x, out.y (the water), out.z. */
export function riverPoint(course, s, u, out = {}) {
  const p = riverAt(course, s, _a);
  out.x = p.x - Math.cos(p.yaw) * u; out.z = p.z + Math.sin(p.yaw) * u; out.y = p.y; out.yaw = p.yaw;
  return out;
}

const CELL = 8, cellOf = (i, j) => (i + 4096) * 8192 + j + 4096;
/**
 * Where a place of the world is on the river: { s, u, d (how far from its middle) } — or null when it is more
 * than `reach` metres from it (the rafts of the other visitors are drawn where their riders are).
 */
export function riverNear(course, x, z, reach = 14, out = {}) {
  if (!course._grid) {
    course._grid = new Map();
    for (const p of course.points) { const key = cellOf(Math.floor(p.x / CELL), Math.floor(p.z / CELL)); if (!course._grid.has(key)) course._grid.set(key, []); course._grid.get(key).push(p); }
  }
  let best = null, least = reach * reach;
  const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), span = Math.ceil(reach / CELL);
  for (let i = ci - span; i <= ci + span; i++) for (let j = cj - span; j <= cj + span; j++) {
    const list = course._grid.get(cellOf(i, j));
    if (!list) continue;
    for (const p of list) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < least) { least = d; best = p; } }
  }
  if (!best) return null;
  const dx = x - best.x, dz = z - best.z;
  out.s = clamp(best.s + dx * best.tx + dz * best.tz, 0, course.length);
  out.u = -dx * Math.cos(best.yaw) + dz * Math.sin(best.yaw);
  out.d = Math.sqrt(least);
  return out;
}

// ---------------------------------------------------------------------------------------------- the water

/** How fast the water runs at a place (m/s, down the river): quick down the middle — towards the outside of a bend —, slow along the banks; quicker in a train of waves, slower behind an island. */
export function currentAt(course, p, u) {
  const q = clamp(u / p.hw, -1.2, 1.2) - clamp(p.k * 7, -0.35, 0.35);
  let c = p.c * clamp(1.12 - 0.62 * q * q, 0.42, 1.12);
  for (const w of course.waves) if (p.s > w.from - 3 && p.s < w.to + 3 && u > w.u0 - 0.8 && u < w.u1 + 0.8) c *= 1 + 0.16 * Math.min(smooth(w.from - 3, w.from + 2, p.s), 1 - smooth(w.to - 2, w.to + 3, p.s));
  for (const it of course.islands) if (p.s > it.from && p.s < it.to && u > it.u) c *= 0.8; // (the right-hand channel: the long, quiet way)
  return c;
}

/** How high the water stands over the level of the river at a place, in a train of waves (m; for what is seen, and how a raft bobs). */
export function swellAt(course, s, u, time = 0) {
  let h = 0;
  for (const w of course.waves) {
    if (s < w.from - 2 || s > w.to + 2 || u < w.u0 - 1.5 || u > w.u1 + 1.5) continue;
    const along = Math.min(smooth(w.from - 2, w.from + 1.5, s), 1 - smooth(w.to - 1.5, w.to + 2, s)), across = Math.min(smooth(w.u0 - 1.5, w.u0 + 0.6, u), 1 - smooth(w.u1 - 0.6, w.u1 + 1.5, u));
    // (a great wave is one crest; a train, a crest every few metres — they stand where they are)
    const crest = w.h >= 1 ? Math.cos(((s - (w.from + w.to) / 2) / (w.to - w.from + 4)) * Math.PI) ** 2 : 0.5 + 0.5 * Math.cos(((s - w.from) / (4.2 + w.h * 2.2)) * 2 * Math.PI + 0.6 * Math.sin(time * 2.1 + s));
    h = Math.max(h, w.h * along * across * crest);
  }
  return h;
}

// ---------------------------------------------------------------------------------------------- a run

/** A raft in the Cauldron, waiting `wait` seconds for its start, `lane` metres to the right of the middle: see stepRun. */
export function startRun(course, { wait = 0, lane = 0 } = {}) {
  return {
    s: course.flags[0].s, u: clamp(lane, -5, 5), vs: 0, vu: 0, a: 0, w: 0, clock: 0, acc: 0, wait, last: Math.ceil(wait),
    stun: 0, braced: 0, rest: 0, want: 0, // (the paddles lost for so long; a brace holding for so long; no other before…; a press that came a little early)
    air: null, // over a fall: { y (how high the raft is), vy, h (the fall), braced }
    held: null, // in a hole: { hole, t, out (how much paddling so far) }
    swim: 0, // in the water, after going over: for so long yet
    flag: 0, fellAt: -1, again: 0, // (the last flag passed; where one last went over, and how many times running)
    grounded: 0, // (on a gravel bar)
    knocks: 0, saves: 0, swims: 0, holds: 0, braces: 0, wasted: 0, over: false, time: 0,
    margins: [], // (for every brace that saved a knock: how long before it was needed it came, s)
    nextRock: 0, nextLedge: 0, done: new Set(), // (what is behind; the waves already taken)
    course,
  };
}

/**
 * Advances a run by `dt` seconds. `input`: { x (-1 … 1: steer, right when positive), y (-1 … 1: forward paddles
 * on, back holds water), brace (true on the frame it is pressed) }. `events`, when given, is filled with what
 * happened: { type: 'tick' (n) | 'go' | 'brace' | 'rock' (braced, hard) | 'bank' | 'lip' (h) | 'land' (h, clean,
 * braced, side) | 'wave' (h, clean) | 'hole' | 'free' (punched) | 'shoal' | 'over' (why) | 'back' (flag, on) |
 * 'flag' (n) | 'finish' (time) }. Returns the run.
 */
export function stepRun(st, dt, input, events) {
  if (input?.brace) st.want = RAFT.brace.early + RAFT.step;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= RAFT.step) { st.acc -= RAFT.step; sub(st, RAFT.step, input, events); }
  return st;
}

/** The raft goes over: one is in the water, and will be back in it at the last flag. */
function capsize(st, why, events) {
  if (st.swim > 0) return;
  st.swim = RAFT.swim; st.swims++; st.air = null; st.held = null; st.stun = 0; st.braced = 0;
  events?.push({ type: 'over', why });
}

function putBack(st, events) {
  const flags = st.course.flags;
  if (st.flag === st.fellAt) st.again++; else { st.fellAt = st.flag; st.again = 1; }
  const on = st.again >= RAFT.mercy && st.flag + 1 < flags.length;
  if (on) { st.flag++; st.again = 0; }
  const at = flags[st.flag].s;
  Object.assign(st, { s: at, u: 0, vs: 0.5, vu: 0, a: 0, w: 0, stun: RAFT.climb, braced: 0, rest: 0, air: null, held: null, grounded: 0 });
  st.nextRock = st.course.rocks.findIndex((r) => r.s > at - 4); if (st.nextRock < 0) st.nextRock = st.course.rocks.length;
  st.nextLedge = st.course.ledges.findIndex((l) => l.s > at); if (st.nextLedge < 0) st.nextLedge = st.course.ledges.length;
  st.done.clear();
  events?.push({ type: 'back', flag: st.flag, on });
}

/** Knocked: the paddles are lost for a moment, most of the speed is gone, the raft spins. */
function knock(st, stun, keep, spin) {
  st.stun = Math.max(st.stun, stun); st.vs *= keep; st.vu *= keep; st.w += spin; st.knocks++;
}

const _p = {};
function sub(st, dt, input, events) {
  const K = RAFT, course = st.course;
  if (st.wait > 0) {
    // waiting for the start, in the Cauldron
    st.wait -= dt;
    const n = Math.ceil(st.wait);
    if (n !== st.last && n > 0 && n <= 3) events?.push({ type: 'tick', n });
    st.last = n;
    if (st.wait <= 0) events?.push({ type: 'go' });
    return;
  }
  if (!st.over) st.clock += dt;
  if (st.stun > 0) st.stun -= dt;
  if (st.rest > 0) st.rest -= dt;
  if (st.want > 0) st.want -= dt;
  if (st.braced > 0) { st.braced -= dt; if (st.braced <= 0) { st.rest = K.brace.rest; if (st.used === false) st.wasted++; } }
  const p = riverAt(course, st.s, _p);

  // ---- in the water, after going over: carried along a little, then back in the raft at the last flag
  if (st.swim > 0) {
    st.swim -= dt;
    st.vs += (currentAt(course, p, st.u) * 0.6 - st.vs) * Math.min(1, dt * 2); st.vu *= Math.max(0, 1 - 2 * dt);
    st.s = clamp(st.s + st.vs * dt, 0, course.length - 0.5); st.u = clamp(st.u + st.vu * dt, -p.hw, p.hw); st.a += st.w * dt; st.w *= Math.max(0, 1 - 1.5 * dt);
    if (st.swim <= 0) putBack(st, events);
    return;
  }
  const stunned = st.stun > 0, x = stunned ? 0 : clamp(input?.x || 0, -1, 1), y = stunned ? 0 : clamp(input?.y || 0, -1, 1);
  // ---- a brace: the crew gets down and holds on (nobody paddles meanwhile)
  if (st.want > 0 && st.braced <= 0 && st.rest <= 0 && !stunned && !st.held) { st.braced = K.brace.hold; st.want = 0; st.braces++; st.used = false; st.bracedAt = st.clock; events?.push({ type: 'brace' }); }
  const braced = st.braced > 0;
  /** A brace has just saved a knock: how long before it was needed it had come. */
  const saved = () => { st.saves++; st.used = true; st.margins.push(st.clock - st.bracedAt); };

  // ---- over a fall: the raft drops, and comes down as it left
  if (st.air) {
    const A = st.air;
    A.vy -= K.g * dt; A.y += A.vy * dt;
    if (braced) A.braced = true;
    st.s = Math.min(course.length - 0.5, st.s + (st.vs * dt) / Math.max(0.6, 1 + p.k * st.u)); st.u = clamp(st.u + st.vu * dt * 0.5, -p.hw + K.r, p.hw - K.r); st.a += st.w * dt;
    const q = riverAt(course, st.s, _p);
    if (A.y <= q.y) {
      const h = A.h, side = Math.abs(Math.sin(st.a)) > K.side, hard = h >= K.fall.least;
      st.air = null;
      if (hard && ((side && !A.braced) || (h >= K.fall.great && !A.braced))) { events?.push({ type: 'land', h, clean: false, side, braced: A.braced }); capsize(st, side ? 'side' : 'great', events); return; }
      if (hard && (side || !A.braced)) {
        knock(st, Math.min(K.fall.stun[2], K.fall.stun[0] + K.fall.stun[1] * h), K.fall.keep, (st.a < 0 ? -1 : 1) * 0.8);
        if (A.braced) saved();
        events?.push({ type: 'land', h, clean: false, side, braced: A.braced });
      } else {
        if (hard) saved();
        st.vs = Math.max(st.vs, q.c + 0.6);
        events?.push({ type: 'land', h, clean: true, side: false, braced: A.braced });
      }
    }
    return;
  }

  // ---- held in a hole: the raft surfs on the boil, turning, until it is paddled out or let go
  if (st.held) {
    const H = st.held, hole = H.hole;
    H.t += dt; if (y > 0.4) H.out += dt;
    st.vs += (0 - st.vs) * Math.min(1, dt * 6); st.vu += (0 - st.vu) * Math.min(1, dt * 6);
    st.s += ((hole.from + 1.2) - st.s) * Math.min(1, dt * 3); st.u += (clamp(st.u, hole.u0 + 1, hole.u1 - 1) - st.u) * Math.min(1, dt * 3);
    st.w += (1.7 - st.w) * Math.min(1, dt * 2); st.a += st.w * dt;
    if (H.out >= K.hole.out || H.t >= K.hole.hold) {
      st.held = null; st.s = hole.to + 0.3; st.vs = K.hole.speed; st.w = 0.4; st.a = wrap(st.a) * 0.5; st.done.add(hole);
      events?.push({ type: 'free', punched: false });
    }
    return;
  }

  // ---- the stream, the paddles, the bend
  const cur = currentAt(course, p, st.u), thrust = braced ? 0 : y > 0 ? K.paddle * y : K.back * y, ca = Math.cos(st.a), sa = Math.sin(st.a);
  let as = K.carry * (cur - st.vs) + thrust * ca, au = -K.grip * st.vu + thrust * sa + K.draw * x * (braced ? 0.3 : 1) + K.swing * p.k * st.vs * st.vs;
  // (a gravel bar holds what runs onto it)
  let shoal = false;
  for (const g of course.shoals) if (st.s > g.from && st.s < g.to && st.u > g.u0 && st.u < g.u1) shoal = true;
  if (shoal) { as += K.shoal.drag * (Math.min(st.vs, K.shoal.crawl) - st.vs); if (!st.grounded) events?.push({ type: 'shoal' }); st.grounded = 0.6; } else if (st.grounded > 0) st.grounded -= dt;
  st.vs = clamp(st.vs + as * dt, K.upstream, 14); st.vu = clamp(st.vu + au * dt, -7, 7);
  if (st.vs < K.least && y >= 0 && !shoal) st.vs = Math.min(K.least, cur);
  // ---- where it points: the crew brings it round to where the stick says — late
  {
    const aim = stunned ? null : x * K.steer, a = wrap(st.a);
    let pull = aim === null ? 0 : K.turn.pull * wrap(aim - a) * (Math.abs(x) > 0.05 || Math.abs(y) > 0.05 ? 1 : 0.6);
    pull -= K.turn.damp * st.w * (stunned ? 0.35 : 1);
    st.w += clamp(pull, -K.turn.most, K.turn.most) * dt;
    st.a = a + (st.w + p.k * st.vs) * dt;
  }
  const before = st.s, uBefore = st.u;
  st.s = Math.max(0.5, st.s + (st.vs * dt) / Math.max(0.6, 1 + p.k * st.u));
  st.u += st.vu * dt;

  // ---- the banks
  {
    const lim = p.hw - K.r * 0.8, side = st.u < 0 ? -1 : 1;
    if (Math.abs(st.u) > lim) {
      st.u = side * lim;
      const into = st.vu * side;
      if (into > 0) {
        if (into > K.bank.hard) { st.vs *= K.bank.keep; st.w += side * -0.9 * Math.sign(ca || 1); events?.push({ type: 'bank', hard: into }); }
        st.vu = -into * side * 0.2;
      }
    }
  }
  // ---- an island: one slides along it, or runs onto its head
  for (const it of course.islands) {
    if (st.s < it.from - K.r - 1 || st.s > it.to + K.r + 1) continue;
    const mid = (it.from + it.to) / 2, la = (it.to - it.from) / 2 + K.r, lb = it.half + K.r, es = (st.s - mid) / la, eu = (st.u - it.u) / lb, d = es * es + eu * eu;
    if (d >= 1) continue;
    // (out of it, the way its side faces there)
    let ns = es / la, nu = eu / lb; const nl = Math.hypot(ns, nu) || 1; ns /= nl; nu /= nl;
    const push = (1 - Math.sqrt(d)) * Math.min(la, lb);
    st.s += ns * push; st.u += nu * push;
    const into = -(st.vs * ns + st.vu * nu);
    if (into > 0) {
      st.vs += ns * into * 1.1; st.vu += nu * into * 1.1;
      if (into > K.knock.soft && ns < -0.5) {
        if (braced) { saved(); st.vs *= 0.85; events?.push({ type: 'rock', braced: true, hard: into }); } else { knock(st, K.knock.stun, K.knock.keep, (nu < 0 ? -1 : 1) * K.knock.spin); events?.push({ type: 'rock', braced: false, hard: into }); }
      }
    }
  }
  // ---- the rocks: a shove, a knock — or nothing but a jolt, braced
  const rocks = course.rocks;
  while (st.nextRock < rocks.length && rocks[st.nextRock].s < st.s - 6) st.nextRock++;
  for (let n = st.nextRock; n < rocks.length && rocks[n].s < st.s + 6; n++) {
    const r = rocks[n], ds = st.s - r.s, du = st.u - r.u, d = Math.hypot(ds, du) || 1e-6, reach = r.r + K.r;
    if (d >= reach) continue;
    const ns = ds / d, nu = du / d;
    st.s += ns * (reach - d + 0.01); st.u += nu * (reach - d + 0.01);
    const into = -(st.vs * ns + st.vu * nu);
    if (into <= 0) continue;
    // (the corner that caught: the raft turns about it)
    const spin = (ns * st.vu - nu * st.vs < 0 ? -1 : 1);
    st.vs += ns * into * 1.15; st.vu += nu * into * 1.15;
    if (into < K.knock.soft) { st.w += spin * 0.5 * into; continue; }
    if (braced) { saved(); st.vs *= 0.88; st.w += spin * 0.4; events?.push({ type: 'rock', index: r.index, braced: true, hard: into }); continue; }
    if (stunned && st.stun > 0.25 && into > K.knock.over) { events?.push({ type: 'rock', index: r.index, braced: false, hard: into }); capsize(st, 'rock', events); return; }
    knock(st, K.knock.stun, K.knock.keep, spin * (K.knock.spin + 0.25 * into));
    events?.push({ type: 'rock', index: r.index, braced: false, hard: into });
  }
  // ---- a train of waves: nothing but a ride — a great one, taken sideways, turns the raft over
  for (const w of course.waves) {
    if (w.h < 1 || st.done.has(w)) continue;
    const crest = (w.from + w.to) / 2;
    if (!(before < crest && st.s >= crest) || st.u < w.u0 || st.u > w.u1) continue;
    st.done.add(w);
    const side = Math.abs(Math.sin(st.a)) > K.side;
    if (side && !braced) { events?.push({ type: 'wave', h: w.h, clean: false }); capsize(st, 'wave', events); return; }
    if (side) { saved(); knock(st, 0.6, 0.7, (st.a < 0 ? -1 : 1) * 0.7); }
    events?.push({ type: 'wave', h: w.h, clean: !side });
  }
  // ---- a hole: punched through, straight and paddling, or braced — or it holds
  for (const hole of course.holes) {
    if (st.done.has(hole) || st.s < hole.from || st.s > hole.to || st.u < hole.u0 || st.u > hole.u1) continue;
    const straight = Math.abs(Math.sin(st.a)) < 0.6 && Math.cos(st.a) > 0;
    if ((straight && y > 0.5) || braced) { st.done.add(hole); st.vs *= K.hole.punch; if (braced) saved(); events?.push({ type: 'free', punched: true }); continue; }
    st.held = { hole, t: 0, out: 0 }; st.holds++;
    events?.push({ type: 'hole' });
    return;
  }
  // ---- the lip of a fall
  const ledges = course.ledges;
  while (st.nextLedge < ledges.length && ledges[st.nextLedge].s < before - 0.01) st.nextLedge++;
  if (st.nextLedge < ledges.length) {
    const l = ledges[st.nextLedge];
    if (before <= l.s && st.s > l.s) {
      st.nextLedge++;
      st.vs = Math.max(st.vs, 2.2); // (nothing stops on the lip)
      st.air = { y: riverAt(course, l.s, _a).y, vy: 0, h: l.h, braced };
      events?.push({ type: 'lip', h: l.h, braced });
    }
  }
  // ---- the flags, the end
  while (st.flag + 1 < course.flags.length && st.s >= course.flags[st.flag + 1].s) { st.flag++; st.again = 0; st.fellAt = -1; events?.push({ type: 'flag', n: st.flag }); }
  if (!st.over && st.s >= course.finish) { st.over = true; st.time = Math.round(st.clock * 1000); events?.push({ type: 'finish', time: st.time }); }
  if (st.s > course.length - 1.5) { st.s = course.length - 1.5; st.vs = Math.min(st.vs, 0.3); }
  void uBefore;
}

/**
 * Where a raft is in the world, and how it lies: { x, y, z, yaw (the way it points), s, u, level (the water of
 * the river there), lift (how high over it the raft is: a wave, a fall), slope (of the water, m per m),
 * ryaw (the way the river goes), hw }.
 */
export function raftPose(st, out = {}, time = 0) {
  const course = st.course, p = riverAt(course, st.s, _a);
  out.x = p.x - Math.cos(p.yaw) * st.u; out.z = p.z + Math.sin(p.yaw) * st.u;
  out.level = p.y; out.lift = st.air ? Math.max(0, st.air.y - p.y) : swellAt(course, st.s, st.u, time) * 0.8;
  out.y = p.y + out.lift;
  out.yaw = p.yaw - st.a; out.ryaw = p.yaw; out.s = st.s; out.u = st.u; out.slope = p.slope; out.hw = p.hw; out.k = p.k;
  out.fx = p.tx; out.fz = p.tz;
  return out;
}

// ---------------------------------------------------------------------------------------------- a raft that goes by itself

/** May a raft be `u` metres across at metre `s`: on the water, clear of the rocks and of the island by `room` metres? */
function clearAt(course, p, s, u, room) {
  if (Math.abs(u) > p.hw - RAFT.r * 0.8 - room * 0.5) return false;
  for (const r of course.rocks) { if (r.s < s - 5) continue; if (r.s > s + 5) break; if (Math.hypot(s - r.s, u - r.u) < r.r + RAFT.r + room) return false; }
  for (const it of course.islands) { const mid = (it.from + it.to) / 2, la = (it.to - it.from) / 2 + RAFT.r + room, lb = it.half + RAFT.r + room; if (((s - mid) / la) ** 2 + ((u - it.u) / lb) ** 2 < 1) return false; }
  return true;
}

/**
 * The line to take: for every metre of the river, how far across to be (m). The quickest way that keeps clear
 * of the rocks, of the holes and of the gravel, and never asks a raft to cross the river faster than it can:
 * found once, from the sea back up. `how`: 'keen' cuts closer.
 */
export function raftLine(course, how = 'steady') {
  const key = `_line_${how}`;
  if (course[key]) return course[key];
  const DU = 0.25, U = 11, nu = Math.round((2 * U) / DU) + 1, n = Math.floor(course.length), room = how === 'keen' ? 0.3 : 0.55, soft = how === 'keen' ? 0.5 : 1.0;
  const cost = new Float32Array((n + 1) * nu), next = new Int16Array((n + 1) * nu), p = {};
  const at = (j) => -U + j * DU;
  const price = (s, j) => {
    riverAt(course, s, p);
    const u = at(j);
    if (!clearAt(course, p, s, u, room)) return Infinity;
    let c = 1 / (currentAt(course, p, u) + 2.2);
    if (!clearAt(course, p, s, u, room + soft)) c += 0.25;
    for (const h of course.holes) if (s > h.from - 3 && s < h.to + 1 && u > h.u0 - 1.4 && u < h.u1 + 1.4) c += 3;
    for (const g of course.shoals) if (s > g.from - 1 && s < g.to + 1 && u > g.u0 - 1.2 && u < g.u1 + 1.2) c += 2;
    return c;
  };
  for (let j = 0; j < nu; j++) cost[n * nu + j] = 0;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = 0; j < nu; j++) {
      const here = price(i, j);
      let best = Infinity, to = j;
      if (here < Infinity) for (let d = -1; d <= 1; d++) { const jj = j + d; if (jj < 0 || jj >= nu) continue; const c = cost[(i + 1) * nu + jj] + 0.02 * d * d; if (c < best) { best = c; to = jj; } }
      cost[i * nu + j] = here + best; next[i * nu + j] = to;
    }
  }
  const lineOf = new Float32Array(n + 1);
  let j = Math.round(U / DU);
  { let best = Infinity; for (let q = 0; q < nu; q++) if (Math.abs(at(q)) < 4 && cost[q] < best) { best = cost[q]; j = q; } }
  for (let i = 0; i <= n; i++) { lineOf[i] = at(j); if (i < n) j = next[i * nu + j]; }
  // (rounded off a little: a raft does not turn on the spot — never into what it keeps clear of)
  const out = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    let sum = 0, w = 0;
    for (let d = -3; d <= 3; d++) { const q = clamp(i + d, 0, n); sum += lineOf[q]; w++; }
    const u = sum / w;
    out[i] = clearAt(course, riverAt(course, i, p), i, u, room) ? u : lineOf[i];
  }
  return (course[key] = out);
}

const DELAY = { steady: 0.25, keen: 0, clumsy: 0.55 };
/**
 * A raft that goes by itself — the proof that the river can be run, and the times to beat. `how`:
 *   steady  a careful crew with a person's limits: it sees what comes a quarter of a second late
 *   keen    the same without the delay, cutting closer: about the best that can be done
 *   clumsy  half a second late, weaving, and it braces for one fall in two only
 * It follows the line (raftLine), paddles on, and braces before a fall and before what it cannot go round.
 * Returns the input for stepRun.
 */
export function botInput(st, how = 'steady', out = { x: 0, y: 0, brace: false }) {
  const course = st.course, K = RAFT, lineTo = raftLine(course, how === 'keen' ? 'keen' : 'steady'), n = lineTo.length - 1;
  // what it would do, seeing the river as it is now…
  const now = { x: 0, y: 1, brace: false };
  if (st.wait <= 0 && st.swim <= 0) {
    const p = riverAt(course, st.s, _p), v = Math.max(1.5, st.vs), ahead = st.s + Math.max(3, v * 0.75);
    const f = clamp(ahead, 0, n), i = Math.min(n - 1, Math.floor(f)), goal = lerp(lineTo[i], lineTo[i + 1], f - i);
    const here = lerp(lineTo[Math.min(n - 1, Math.floor(clamp(st.s, 0, n)))], lineTo[Math.min(n, Math.floor(clamp(st.s, 0, n)) + 1)], clamp(st.s, 0, n) % 1);
    // (across to the line, against the bend, not faster than can be stopped)
    const gain = how === 'clumsy' ? 0.55 : 1;
    let x = (0.62 * (goal - st.u) + 0.5 * (here - st.u) - 0.42 * st.vu) * gain - (K.swing * p.k * st.vs * st.vs) / 3.4;
    if (how === 'clumsy') x += 0.55 * Math.sin(st.clock * 2.7 + 1.3);
    now.x = clamp(x, -1, 1);
    // (off the stream after a knock: it straightens before it paddles on)
    now.y = Math.abs(Math.sin(st.a)) > 0.9 ? 0.3 : 1;
    // a fall ahead: braced just before its lip
    const l = course.ledges[st.nextLedge];
    if (l && !st.air && l.h >= K.fall.least) {
      const t = (l.s - st.s) / v;
      if (t > 0 && t < (how === 'keen' ? 0.3 : 0.5) && (how !== 'clumsy' || st.nextLedge % 2 === 0)) now.brace = true;
    }
    // a rock it is going to run into all the same: braced
    if (how !== 'clumsy') {
      for (let q = st.nextRock; q < course.rocks.length && course.rocks[q].s < st.s + 8; q++) {
        const r = course.rocks[q], ds = r.s - st.s, du = r.u - st.u, vr = st.vs, close = ds * vr + du * st.vu;
        if (close <= 0) continue;
        const sp = Math.hypot(vr, st.vu) || 1, t = close / (sp * sp), miss = Math.hypot(ds - vr * t, du - st.vu * t);
        if (miss < r.r + K.r - 0.05 && t < 0.5) now.brace = true;
      }
    }
    // a great wave it is not going to take head on: braced
    for (const w of course.waves) { if (w.h < 1 || st.done.has(w)) continue; const t = ((w.from + w.to) / 2 - st.s) / v; if (how !== 'clumsy' && t > 0 && t < 0.5 && st.u > w.u0 && st.u < w.u1 && Math.abs(Math.sin(st.a)) > K.side * 0.8) now.brace = true; }
    if (st.held) { now.y = 1; now.x = 0; }
  }
  // …done a moment later: a person's time to see and to act
  const lag = Math.round(DELAY[how] / K.step);
  if (!lag) { out.x = now.x; out.y = now.y; out.brace = now.brace && st.braced <= 0 && st.rest <= 0; return out; }
  const Q = st.botQ || (st.botQ = []);
  Q.push(now);
  const then = Q.length > lag ? Q.shift() : { x: 0, y: st.wait > 0 ? 0 : 1, brace: false };
  out.x = then.x; out.y = then.y; out.brace = then.brace && st.braced <= 0 && st.rest <= 0;
  return out;
}

/** Runs the whole river with the bot: { time (ms), over, knocks, swims, holds, braces, saves, wasted, margins, top (m/s), stretches ([{ name, t }]: when each was reached) }. */
export function botRun(course, how = 'steady', limit = 600) {
  const st = startRun(course), input = { x: 0, y: 0, brace: false }, stretches = [];
  let top = 0, at = -1;
  for (let t = 0; t < limit && !st.over; t += RAFT.step) {
    if (typeof how === 'function') how(st, input); else botInput(st, how, input);
    if (input.brace) st.want = RAFT.brace.early + RAFT.step;
    sub(st, RAFT.step, input, null);
    if (st.vs > top) top = st.vs;
    const i = course.stretches.findIndex((q) => st.s >= q.from && st.s < q.to);
    if (i > at) { at = i; stretches.push({ name: course.stretches[i].name, t: +st.clock.toFixed(1) }); }
  }
  return { time: st.over ? st.time : 0, over: st.over, clock: st.clock, knocks: st.knocks, swims: st.swims, holds: st.holds, braces: st.braces, saves: st.saves, wasted: st.wasted, margins: st.margins, top, stretches, s: st.s };
}

/** The least time the river can be run in (ms): the quickest water all the way, paddled flat out — what nobody can beat. */
export function fastest(course) {
  let t = 0;
  const p = {};
  for (let s = course.flags[0].s; s < course.finish; s += 0.5) {
    riverAt(course, s, p);
    let best = 0;
    for (let u = -p.hw; u <= p.hw; u += 0.5) best = Math.max(best, currentAt(course, p, u));
    t += 0.5 / (best + RAFT.paddle / RAFT.carry);
  }
  return Math.round(t * 1000);
}
