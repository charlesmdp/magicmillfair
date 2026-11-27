// Little Mine Train: its rules. No renderer here: the game, its checks and the drivers that play by themselves
// all read this.
//
// A small train of three ore carts leaves a wooden station at the foot of the west mountains, is hauled up a
// lift inside the rock, and runs away: a first gentle run in the open, a tunnel, a trestle over a gully, a
// spiral round a rock, a fork under the mountain, a drop into the dark, a lake under the mountain, a last run of
// bends back down to the station. The train follows its rails by itself. What one does:
//   lean     the stick, left and right — into the bend: a bend taken upright at speed tips the cart, and a cart
//            that tips for too long leaves the rails. Leaning on a straight costs nothing.
//   brake    the stick pulled back (sparks) — before what is too sharp for the speed one has
//   let run  the stick pushed forward — faster, where the line allows
//   hop      the button, pressed (an edge): over a gap in the rails, over a rock on them
//   choose   at the fork one leans right for the short way — the hard one; otherwise the long way round
// Nuggets along the line take a quarter of a second each off the time (some hang beside the rails: lean to them; some
// above: hop). Off the rails: back on them at the last signal, three seconds added — never the whole run.
//
// The line is laid like a toy track: so many metres straight, a bend of so many degrees — then its bends and its
// slopes are eased into one another and it is cut into samples half a metre apart. Places are `s` metres along it.
// Headings are counted the way the valley's are: 0 looks south (+z), and they grow turning left; a bend to the
// right has `k` > 0. Time advances in steps of 1/120 s whatever the frame rate.

export const MINE = {
  name: 'Little Mine Train',
  step: 1 / 120,
  every: 10, // s between two starts (gates.js: nextStart)
  station: { x: -220, z: -130.9, y: 24.9, yaw: -0.698 }, // where the line begins — and ends: the north-east end of the platform, looking south-west along the foot of the mountain
  gate: { x: -219.9, z: -113.6, yaw: -2.269 }, // where one asks, on the meadow before the platform (north of the golf, clear of the wall of thanks)
  wait: 18, // m along the line: where the first cart waits
  haul: { out: 10, lift: 22, over: 11, pull: 9 }, // m/s out of the station, up the lift, and over its head to where the chain lets go; how fast the chain takes it (m/s²)
  roll: { free: 8.5, slope: 35, run: 11.5, runSlope: 50, gain: 0.6, most: 3, drag: 0.25, brake: 9, least: 4.5, top: 26 }, // the speed it tends to by itself, and let run; how it gets there; the brake
  lean: { rate: 6, hold: 9, slack: 0.35, tip: 1.8, right: 1.5 }, // how fast one leans; m/s² across that a full lean holds; what needs no lean; how fast it tips, and rights itself
  hop: { up: 4.2, g: 9.81, rock: 0.3 }, // the hop: 0.86 s in the air, 0.9 m high; how high a rock is
  off: { time: 1.7, cost: 3000, speed: 6, tries: 3 }, // off the rails: s before one is put back, ms added, the speed one is put back with; so many times after the same signal and one is set down at the next
  nugget: { give: 250, lean: 0.45, high: 0.35 }, // ms off the time for each; how far one leans, how high one hops, to take one
  cart: { gap: 2.1, n: 3 }, // m between two carts of the train
  count: 3,
};

const DEG = Math.PI / 180, DS = 0.5, EASE = 5;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------------------------- the line

/** So many metres straight (on the map), going down `drop` metres. */
const S = (len, drop = 0, kind, o = {}) => ({ len, turn: 0, drop, kind, ...o });
/** A bend of `deg` degrees (to the right when positive) of radius `r`. */
const B = (deg, r, drop = 0, kind, o = {}) => ({ len: Math.abs(deg) * DEG * r, turn: deg, drop, kind, ...o });

// What is on a piece: [what, metres from its beginning, …] — 'gap' (length), 'rock', 'nug' (side: -1 left, 1 right,
// 0 in the middle, 2 above)
// The pieces from the station to the lake (a kind lasts until the next is said):
//   station · open (on the ground, on low timber) · trestle (high over the ground) · rock (a tunnel) · lift ·
//   hall (a great cave) · lake
const OUT = [
  S(12, -2, 'station', { name: 'The Station' }),
  S(18, 0, 'station'),
  S(3, -0.3, 'open'),
  B(55, 11, -1, 'open'),
  B(35, 11, 0, 'rock', { name: 'The Lift' }),
  S(3.64, 0, 'rock'),
  B(35, 25, 0, 'rock'),
  S(74, -43, 'lift'),
  S(44, -38, 'lift'),
  S(14.3, -16.95, 'lift'),
  S(8, -0.2, 'rock', { head: true }),
  B(105, 14, 0.3, 'rock'),
  S(25.5, 0.3, 'rock', { free: true }),
  // a first gentle run in the open, across a high terrace
  S(4, 0.1, 'open', { name: 'The High Line', things: [['nug', 2, 0]] }),
  B(12, 30, 0.15, 'open', { things: [['nug', 1, 1], ['nug', 5, 1]] }),
  S(6, 0.1, 'open', { things: [['nug', 3, 0]] }),
  B(-12, 30, 0.15, 'open', { things: [['nug', 1, -1], ['nug', 5, -1]] }),
  S(4, 0.1, 'open'),
  // a trestle over the saddle: nuggets to lean to and to hop to — nothing yet that throws one off
  S(78, 2.4, 'trestle', { name: 'The Trestle', things: [['nug', 8, 1], ['nug', 14, 1], ['nug', 26, -1], ['nug', 32, -1], ['nug', 44, 2], ['nug', 58, 2], ['nug', 68, 0], ['nug', 74, 0]] }),
  // a spiral round a rock: once and a half, going down
  B(-540, 13, 10.5, 'trestle', { name: 'The Spiral', things: [['nug', 20, -1], ['nug', 45, -1], ['nug', 70, -1], ['nug', 95, -1]] }),
  S(5, 1.2, 'open'),
  // down into the ground: a tunnel of lanterns, a gap in the rails, a rock on them
  S(30, 6.5, 'rock', { name: 'The Lantern Tunnel', things: [['nug', 12, 0], ['nug', 20, 0]] }),
  S(46, 2.8, 'rock', { things: [['gap', 4, 2.6], ['nug', 5.3, 2], ['nug', 12, 1], ['nug', 16, -1], ['rock', 22], ['nug', 22, 2], ['nug', 36, 0], ['nug', 42, 0]] }),
  // the fork — the long way round to the left, the short way straight on, broken
  B(-90, 14, 2, 'hall', { name: 'The Fork', fork: 'in' }),
  B(180, 14, 4, 'hall', { things: [['nug', 12, 1], ['nug', 22, 1], ['nug', 32, 1]] }),
  B(-90, 14, 2, 'hall', { fork: 'out' }),
  S(12.25, 0.6, 'rock'),
  B(-90, 18, 1.4, 'rock'),
  // the drop into the dark
  S(70, 48, 'rock', { name: 'The Drop', things: [['nug', 14, 0], ['nug', 28, 0], ['nug', 42, 0], ['nug', 56, 0]] }),
  S(11.75, 1.6, 'rock'),
  // the lake under the mountain
  S(45, 0.4, 'lake', { name: 'The Lake', things: [['gap', 8, 2.4], ['nug', 9.2, 2], ['nug', 18, -1], ['nug', 24, 1], ['rock', 38], ['nug', 38, 2]] }),
  B(-140, 20, 0.3, 'lake', { things: [['nug', 10, -1], ['nug', 20, -1], ['nug', 30, -1], ['nug', 40, -1]] }),
];
// … and the last of it, laid so that it ends where the line began: the last run of bends, and home round a boulder to the platform
const HOME = [
  B(90, 14, 4.6, 'rock', { name: 'The Last Bends' }),
  B(-90, 13, 4.6, 'rock', { things: [['nug', 10, -1]] }),
  B(90, 12, 4.6, 'rock', { things: [['nug', 9, 1]] }),
  S(10, 1.2, 'rock'),
  B(20, 10, 0.25, 'rock'),
  B(70, 10, 0.65, 'open', { name: 'Home' }),
  S(6, 0.2, 'open'),
];
const KINDS = ['station', 'open', 'trestle', 'rock', 'lift', 'hall', 'lake'];

/** A chain of pieces from a pose: raw points a quarter of a metre apart, with what each piece carries. */
function chain(pieces, pose) {
  const h = 0.25, ks = [], sl = [], owner = [];
  let kind = 'open';
  pieces.forEach((p, i) => { const n = Math.max(1, Math.round(p.len / h)), k = (p.turn * DEG) / (n * h); if (p.kind) kind = p.kind; p._kind = kind; for (let j = 0; j < n; j++) { ks.push(k); sl.push(p.drop / (n * h)); owner.push(i); } });
  // (bends and slopes are eased into one another: twice a running mean over `EASE` metres)
  const ease = (a) => { const w = Math.round(EASE / 2 / h), sum = [0]; for (let i = 0; i < a.length; i++) sum.push(sum[i] + a[i]); return a.map((_, i) => { const lo = Math.max(0, i - w), hi = Math.min(a.length, i + w + 1); return (sum[hi] - sum[lo]) / (2 * w + 1); }); };
  const k2 = ease(ease(ks)), s2 = ease(ease(sl)), pts = [];
  let { x, y, z, yaw } = pose;
  for (let i = 0; i <= ks.length; i++) {
    pts.push({ x, y, z, piece: owner[Math.min(i, ks.length - 1)] });
    if (i === ks.length) break;
    yaw -= k2[i] * h * 0.5; x += Math.sin(yaw) * h; z += Math.cos(yaw) * h; yaw -= k2[i] * h * 0.5; y -= s2[i] * h;
  }
  return { pts, end: { x, y, z, yaw } };
}

let laid = null;
/**
 * The line, laid once: { length, ds, n, pts: [{ x, y, z, yaw, k, slope, kind }], stretches: [{ name, from }],
 * gaps: [{ s, len, way }], rocks: [{ s, way }], nuggets: [{ s, side, way }], signals: [{ s }], boards: [{ s, kind }],
 * fork: { s0, s1, len, pts } (the short way: from s0 on the line, `len` metres, joining at s1), top (the head of
 * the lift), finish, free: the speed it has left to itself, by sample }.
 */
export function course() {
  if (laid) return laid;
  const M = MINE, a = chain(OUT, M.station);
  // (the last pieces are laid from nowhere, then moved so that their end is the beginning of the line)
  const b0 = chain(HOME, { x: 0, y: 0, z: 0, yaw: 0 }), turn = M.station.yaw - b0.end.yaw, c = Math.cos(turn), sn = Math.sin(turn);
  const move = (p) => ({ x: p.x * c + p.z * sn, z: -p.x * sn + p.z * c });
  const e = move(b0.end), home = { x: M.station.x - e.x, z: M.station.z - e.z, y: M.station.y - b0.end.y, yaw: turn };
  const b = chain(HOME, home);
  // (between the two, under the mountain: one smooth curve from the end of the first to the beginning of the second)
  const p0 = a.end, p1 = home, far = Math.hypot(p1.x - p0.x, p1.z - p0.z), reach = far * 0.9, link = [];
  for (let i = 1; i < 400; i++) {
    const t = i / 400, t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    link.push({ x: h00 * p0.x + h10 * Math.sin(p0.yaw) * reach + h01 * p1.x + h11 * Math.sin(p1.yaw) * reach, z: h00 * p0.z + h10 * Math.cos(p0.yaw) * reach + h01 * p1.z + h11 * Math.cos(p1.yaw) * reach, y: lerp(p0.y, p1.y, t * t * (3 - 2 * t)), link: true });
  }
  const raw = [...a.pts.map((p) => ({ ...p, of: OUT[p.piece] })), ...link.map((p) => ({ ...p, of: LINK })), ...b.pts.map((p) => ({ ...p, of: HOME[p.piece] }))];
  // ---- cut into samples half a metre apart (on the map and up: the true length of the rails)
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y, raw[i].z - raw[i - 1].z));
  const length = cum[cum.length - 1], n = Math.floor(length / DS), pts = [], begin = new Map();
  raw.forEach((p, i) => { if (!begin.has(p.of)) begin.set(p.of, cum[i]); });
  for (let j = 0, i = 0; j <= n; j++) {
    const s = j * DS;
    while (i < raw.length - 2 && cum[i + 1] < s) i++;
    const f = clamp((s - cum[i]) / (cum[i + 1] - cum[i] || 1), 0, 1), p = raw[i], q = raw[i + 1];
    pts.push({ x: lerp(p.x, q.x, f), y: lerp(p.y, q.y, f), z: lerp(p.z, q.z, f), kind: p.of._kind, of: p.of });
  }
  frames(pts);
  // ---- what the pieces carry
  const gaps = [], rocks = [], nuggets = [], stretches = [];
  let fork = null, f0 = 0;
  for (const [piece, s0] of begin) {
    if (piece.name) stretches.push({ name: piece.name, from: s0 });
    if (piece.fork === 'in') f0 = s0;
    if (piece.fork === 'out') { const next = [...begin.values()].filter((v) => v > s0 + 0.01).sort((p, q) => p - q)[0]; fork = { s0: f0, s1: next }; }
    for (const [what, at, v] of piece.things || []) {
      if (what === 'gap') gaps.push({ s: s0 + at, len: v });
      else if (what === 'rock') rocks.push({ s: s0 + at });
      else nuggets.push({ s: s0 + at, side: v });
    }
  }
  stretches.sort((p, q) => p.from - q.from);
  // ---- the short way of the fork: straight from where the long way leaves to where it comes back, broken twice
  {
    const A = pts[Math.round(fork.s0 / DS)], Z = pts[Math.round(fork.s1 / DS)], len = Math.hypot(Z.x - A.x, Z.y - A.y, Z.z - A.z), m = Math.round(len / DS), sp = [];
    fork.s0 = Math.round(fork.s0 / DS) * DS; fork.s1 = Math.round(fork.s1 / DS) * DS; fork.len = m * DS;
    for (let j = 0; j <= m; j++) { const t = j / m; sp.push({ x: lerp(A.x, Z.x, t), y: lerp(A.y, Z.y, t), z: lerp(A.z, Z.z, t), kind: 'hall' }); }
    frames(sp);
    fork.pts = sp; fork.m = m;
    for (const p of pts) if (p.of && (p.of.fork || (p.of.turn === 180))) p.fork = true;
    const s = fork.s0;
    gaps.push({ s: s + 11, len: 2.8, way: 1 }, { s: s + 45, len: 2.8, way: 1 }); rocks.push({ s: s + 29, way: 1 });
    nuggets.push({ s: s + 12.4, side: 2, way: 1 }, { s: s + 29, side: 2, way: 1 }, { s: s + 46.4, side: 2, way: 1 }, { s: s + 5, side: 0, way: 1 }, { s: s + 53, side: 0, way: 1 });
    for (const t of [...gaps, ...rocks, ...nuggets]) if (t.way === undefined) t.way = t.s > fork.s0 && t.s < fork.s1 ? 0 : -1; // (-1: on the line itself, whichever way one took)
  }
  gaps.sort((p, q) => p.s - q.s); rocks.sort((p, q) => p.s - q.s); nuggets.sort((p, q) => p.s - q.s);
  nuggets.forEach((g, i) => { g.id = i; });
  const head = begin.get(OUT.find((q) => q.head)), top = begin.get(OUT.find((q) => q.free)), finish = length - 2;
  // ---- the speed the train has left to itself (nobody leans, nothing tips): what the boards are worked out from
  const free = new Float32Array(pts.length);
  { let v = M.haul.over; for (let j = Math.round(top / DS); j < pts.length; j++) { free[j] = v; v = Math.max(M.roll.least, v + accel(v, pts[j].slope, 0) * (DS / v)); } for (let j = 0; j < Math.round(top / DS); j++) free[j] = M.haul.over; }
  // ---- the bends: where one must lean, where one must brake first
  const bends = [], need = (j) => (free[j] ** 2 * Math.abs(pts[j].k)) / M.lean.hold;
  for (let j = Math.round(top / DS) + 4; j < pts.length; j++) {
    if (Math.abs(pts[j].k) < 1 / 60) continue;
    const dir = Math.sign(pts[j].k); let e2 = j, most = 0, tight = 0;
    while (e2 < pts.length && Math.sign(pts[e2].k) === dir && Math.abs(pts[e2].k) >= 1 / 60) { most = Math.max(most, need(e2)); tight = Math.max(tight, Math.abs(pts[e2].k)); e2++; }
    if (most > M.lean.slack * 0.7 && e2 - j > 8) bends.push({ s: j * DS, to: e2 * DS, dir, need: most, r: 1 / tight, brake: most > 1 + M.lean.slack - 0.3 });
    j = e2;
  }
  // ---- the boards: a lean arrow before each bend, a brake sign before what is too sharp, a hop sign before each gap and rock, one for the fork
  const boards = [];
  const lead = (s) => clamp(free[clamp(Math.round(s / DS), 0, pts.length - 1)] * 1.8, 18, 38); // (two seconds or so before, at the speed the train has there)
  for (const bd of bends) { boards.push({ s: bd.s - lead(bd.s), to: bd.s, kind: bd.dir > 0 ? 'right' : 'left', way: bd.s > fork.s0 && bd.s < fork.s1 ? 0 : -1 }); if (bd.brake) boards.push({ s: bd.s - lead(bd.s) - 14, to: bd.s, kind: 'brake', way: bd.s > fork.s0 && bd.s < fork.s1 ? 0 : -1 }); }
  for (const g of gaps) boards.push({ s: g.s - (g.way === 1 ? 14 : lead(g.s)), to: g.s, kind: 'hop', way: g.way });
  for (const r of rocks) boards.push({ s: r.s - (r.way === 1 ? 14 : lead(r.s)), to: r.s, kind: 'hop', way: r.way });
  boards.push({ s: fork.s0 - 34, to: fork.s0, kind: 'fork', way: -1 });
  boards.sort((p, q) => p.s - q.s);
  // (two boards never stand in one place: the earlier one is moved back)
  for (let i = boards.length - 2; i >= 0; i--) { const nx = boards.slice(i + 1).find((q) => q.way === boards[i].way || q.way === -1 || boards[i].way === -1); if (nx && nx.s - boards[i].s < 6) boards[i].s = nx.s - 6; }
  boards.sort((p, q) => p.s - q.s);
  // ---- the signals: a save every sixty metres or so, where the line is straight and nothing is close ahead
  const signals = [{ s: top + 2 }];
  for (let s = top + 55; s < finish - 75; s += 58) {
    let best = s, bad = 1e9;
    for (let d = -18; d <= 18; d += 1.5) {
      const q = s + d; let cost = Math.abs(d) * 0.02;
      for (let x = 0; x < 14; x += 1) cost += Math.abs(pts[Math.min(pts.length - 1, Math.round((q + x) / DS))].k) * 12;
      for (const t of [...gaps, ...rocks]) if (t.way !== 1 && t.s > q - 3 && t.s < q + 24) cost += 50;
      if (q > fork.s0 - 14 && q < fork.s0 + 4) cost += 50;
      if (cost < bad) { bad = cost; best = q; }
    }
    signals.push({ s: best });
    s = best;
  }
  signals.push({ s: length - 30 }); // (the last, before the bend home)
  signals.forEach((g, i) => { g.id = i; });
  laid = { length, ds: DS, n: pts.length, pts, stretches, gaps, rocks, nuggets, signals, boards, bends, fork, head, top, finish, free, kinds: KINDS };
  return laid;
}
const LINK = { _kind: 'rock', name: 'The Deep Line' };

/** The heading, the bend and the slope of every sample of a line of points. */
function frames(pts) {
  const n = pts.length, yaw = new Float64Array(n);
  for (let j = 0; j < n; j++) { const p = pts[Math.max(0, j - 1)], q = pts[Math.min(n - 1, j + 1)], d = Math.hypot(q.x - p.x, q.z - p.z) || 1; yaw[j] = Math.atan2(q.x - p.x, q.z - p.z); pts[j].slope = -(q.y - p.y) / d; pts[j].run = d / (Math.hypot(d, q.y - p.y) || 1); }
  for (let j = 1; j < n; j++) { while (yaw[j] - yaw[j - 1] > Math.PI) yaw[j] -= 2 * Math.PI; while (yaw[j] - yaw[j - 1] < -Math.PI) yaw[j] += 2 * Math.PI; }
  for (let j = 0; j < n; j++) { const lo = Math.max(0, j - 3), hi = Math.min(n - 1, j + 3); pts[j].yaw = yaw[j]; pts[j].k = hi > lo ? -(yaw[hi] - yaw[lo]) / ((hi - lo) * DS) * pts[j].run : 0; }
}

/**
 * The rails at `s` metres along the line (`way` 1: on the short way of the fork, between its two ends): fills
 * `out` with where they are (x, y, z), their heading `yaw`, how they bend (`k`, to the right when positive, per
 * metre), their `slope` (down when positive) and the `kind` of the place.
 */
export function railAt(s, way = 0, out = {}) {
  const C = course(), F = C.fork, short = way === 1 && s >= F.s0 && s <= F.s0 + F.len, pts = short ? F.pts : C.pts;
  const f = clamp((short ? s - F.s0 : s) / DS, 0, pts.length - 1), j = Math.min(pts.length - 2, Math.floor(f)), t = f - j, p = pts[j], q = pts[j + 1];
  out.x = lerp(p.x, q.x, t); out.y = lerp(p.y, q.y, t); out.z = lerp(p.z, q.z, t); out.yaw = lerp(p.yaw, q.yaw, t); out.k = lerp(p.k, q.k, t); out.slope = lerp(p.slope, q.slope, t); out.kind = p.kind;
  return out;
}
/** The stretch one is in at `s` (its number in course().stretches). */
export function stretchAt(s) { const st = course().stretches; let i = 0; while (i + 1 < st.length && st[i + 1].from <= s) i++; return i; }

// ---------------------------------------------------------------------------------------------- the run

/** How the speed changes by itself (m/s²) at `v` on a `slope`, with the stick at `y` (1: let it run, -1: brake). */
function accel(v, slope, y) {
  const R = MINE.roll, run = clamp(y, 0, 1), target = lerp(R.free + R.slope * slope, R.run + R.runSlope * slope, run);
  let a = target > v ? Math.min(R.most, R.gain * (target - v)) : R.drag * (target - v);
  if (y < 0) a -= R.brake * Math.min(1, -y);
  return a;
}

/** A train waiting at the platform: see stepRun. `o.wait`: s before it leaves. */
export function startRun(o = {}) {
  return { phase: 'wait', wait: o.wait ?? MINE.count, s: MINE.wait, way: 0, v: 0, lean: 0, tip: 0, y: 0, vy: 0, air: false, braking: false, hopWas: false,
    clock: 0, acc: 0, off: 0, why: '', offs: 0, cost: 0, nuggets: 0, got: {}, save: -1, tries: 0, over: false, time: 0, top: 0, short: 0, stretch: 0 };
}

/**
 * Advances a run by `dt` seconds. `input`: { x (-1 lean left … 1 lean right), y (1 let it run … -1 brake), hop (the button) }.
 * `events`: { type: 'go' | 'top' | 'hop' | 'land' | 'off' (why: 'tip' | 'gap' | 'rock') | 'back' (signal, skipped) |
 * 'signal' (n) | 'nugget' (id) | 'fork' (way) | 'stretch' (n) | 'finish' (time) }.
 */
export function stepRun(st, dt, input, events) {
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= MINE.step - 1e-9) { st.acc -= MINE.step; sub(st, MINE.step, input, events); }
  return st;
}

const _r = {};
function sub(st, dt, input, events) {
  const M = MINE, C = course(), F = C.fork;
  if (st.phase === 'wait') { st.wait -= dt; if (st.wait > 0) return; st.phase = 'run'; events?.push({ type: 'go' }); }
  if (st.phase === 'done') return;
  st.clock += dt;
  if (st.phase === 'off') {
    // off the rails: a moment on the ground, then back on them at the last signal (or, after three tries, at the next)
    st.off -= dt;
    if (st.off > 0) return;
    let n = Math.max(0, st.save), skipped = false;
    if (st.tries >= M.off.tries && n + 1 < C.signals.length) { n++; skipped = true; st.tries = 0; st.save = n; }
    Object.assign(st, { phase: 'run', s: C.signals[n].s, way: 0, v: M.off.speed, lean: 0, tip: 0, y: 0, vy: 0, air: false });
    events?.push({ type: 'back', signal: n, skipped });
    return;
  }
  const r = railAt(st.s, st.way, _r), hauled = st.s < C.top, ix = clamp(input?.x || 0, -1, 1), iy = hauled || st.over ? 0 : clamp(input?.y || 0, -1, 1);
  // ---- the speed
  if (st.over) { const far = (st.home ? M.wait - st.s : C.length - st.s + M.wait); st.v = Math.min(Math.max(1.2, st.v - 6 * dt), Math.sqrt(Math.max(0.02, 2 * 3.5 * far))); } // (over the line: on, slowing, to its place at the platform)
  else if (hauled) { const want = st.s > C.head - 14 ? M.haul.over : r.kind === 'lift' ? M.haul.lift : M.haul.out; st.v += clamp(want - st.v, -M.haul.pull * dt, M.haul.pull * dt); }
  else if (!st.air) st.v = clamp(st.v + accel(st.v, r.slope, iy) * dt, M.roll.least, M.roll.top);
  st.braking = iy < -0.3 && !st.air && st.v > M.roll.least + 0.05;
  // ---- the lean, and the cart that tips
  st.lean += clamp(ix - st.lean, -M.lean.rate * dt, M.lean.rate * dt);
  if (!hauled && !st.air && !st.over) {
    const need = (st.v * st.v * Math.abs(r.k)) / M.lean.hold, into = st.lean * Math.sign(r.k || 1), eff = into >= 0 ? into : into * clamp(need / 0.5, 0, 1), excess = need - eff - M.lean.slack;
    st.tip = Math.max(0, st.tip + (excess > 0 ? excess * M.lean.tip : -M.lean.right) * dt);
    st.need = need;
    if (st.tip >= 1) return off(st, 'tip', events);
  } else if (hauled) st.tip = 0;
  // ---- the hop
  const press = !!input?.hop && !st.hopWas; st.hopWas = !!input?.hop;
  if (press && !st.air && !hauled && !st.over) { st.air = true; st.vy = M.hop.up; events?.push({ type: 'hop' }); }
  if (st.air) { st.y += st.vy * dt; st.vy -= M.hop.g * dt; if (st.y <= 0) { st.y = 0; st.vy = 0; st.air = false; events?.push({ type: 'land' }); } }
  // ---- forward
  const s0 = st.s;
  st.s += st.v * dt;
  if (st.v > st.top) st.top = st.v;
  // (the fork: leaning right as one passes it, one takes the short way)
  if (s0 < F.s0 && st.s >= F.s0) { st.way = st.lean > 0.5 ? 1 : 0; if (st.way) st.short++; events?.push({ type: 'fork', way: st.way }); }
  if (st.way === 1 && st.s >= F.s0 + F.len) { st.s = F.s1 + (st.s - F.s0 - F.len); st.way = 0; }
  const on = (t) => t.way === -1 || t.way === st.way || (t.way === 0 && (st.s < F.s0 || st.s > F.s1));
  // ---- what is in the way
  for (const g of C.gaps) { if (g.s > st.s) break; if (on(g) && st.s < g.s + g.len && !st.air) return off(st, 'gap', events); }
  for (const k of C.rocks) { if (k.s - 0.4 > st.s) break; if (on(k) && st.s < k.s + 0.4 && st.y < M.hop.rock) return off(st, 'rock', events); }
  // ---- the nuggets
  for (const g of C.nuggets) {
    if (g.s > st.s) break;
    if (g.s <= s0 || st.got[g.id] || !on(g)) continue;
    if (g.side === 0 || (g.side === 2 ? st.y > M.nugget.high : st.lean * g.side > M.nugget.lean)) { st.got[g.id] = 1; st.nuggets++; events?.push({ type: 'nugget', id: g.id }); }
  }
  // ---- the signals, the stretches, the end
  while (st.way === 0 && st.save + 1 < C.signals.length && C.signals[st.save + 1].s <= st.s) { st.save++; st.tries = 0; events?.push({ type: 'signal', n: st.save }); }
  if (s0 < C.top && st.s >= C.top) events?.push({ type: 'top' });
  const n = stretchAt(st.s);
  if (n !== st.stretch) { st.stretch = n; events?.push({ type: 'stretch', n }); }
  if (!st.over && st.s >= C.finish) { st.over = true; st.time = Math.max(1000, Math.round(st.clock * 1000) + st.cost - st.nuggets * M.nugget.give); events?.push({ type: 'finish', time: st.time }); }
  if (st.over && !st.home && st.s >= C.length - 0.01) { st.s -= C.length; st.home = true; } // (the line is a loop: its end is its beginning)
  if (st.over && st.home && st.s >= M.wait - 0.05) { st.v = 0; st.phase = 'done'; }
}
function off(st, why, events) {
  st.phase = 'off'; st.off = MINE.off.time; st.why = why; st.offs++; st.tries++; st.cost += MINE.off.cost; st.air = false; st.vy = 0;
  events?.push({ type: 'off', why });
}

/** Where the cart `i` of a train is (0: the first) and how it lies: { x, y, z, yaw, pitch, roll, kind }. */
export function cartPose(st, i = 0, out = {}) {
  const C = course(), F = C.fork;
  let s = st.s - i * MINE.cart.gap, way = st.way;
  if (s < 0 && st.home) s += C.length; // (home again: the carts behind are still on the last of the line)
  // (a cart behind the first may still be on the other side of an end of the short way)
  if (way === 1 && s < F.s0) way = 0;
  else if (way === 0 && st.short && st.s >= F.s1 && s < F.s1 && st.wasShort) { s = F.s0 + F.len - (F.s1 - s); way = 1; }
  const r = railAt(Math.max(0, s), way, _r), lag = i * 0.12;
  out.x = r.x; out.z = r.z; out.y = r.y + (i === 0 ? st.y : Math.max(0, st.y - lag)); out.yaw = r.yaw; out.pitch = Math.atan(r.slope);
  out.roll = st.lean * 0.3 - st.tip * 0.5 * Math.sign(r.k || 1); out.kind = r.kind; out.s = s; out.k = r.k;
  return out;
}

/** How hot a run is, 0 … 1: how fast the train runs, and a little of how far it has got (its music comes in with it). */
export function heatOf(st) {
  if (!st || st.phase === 'wait') return 0;
  const C = course();
  return clamp(0.15 + 0.6 * clamp((st.v - 6) / 14, 0, 1) + 0.25 * clamp(st.s / C.length, 0, 1), 0, 1);
}

// ---------------------------------------------------------------------------------------------- drivers that play by themselves

const LATE = { steady: 0.25, bold: 0.25, clumsy: 0.5 };
/**
 * A driver that plays by itself, with a person's limits: what it asks is what it decided a quarter of a second
 * earlier (half a second for the clumsy one). `steady` reads the boards — it leans before the bend, brakes
 * before what is too sharp, hops in the middle of the moment, takes the long way; `bold` lets it run and takes
 * the short way; `clumsy` leans when the bend is under it, brakes when the cart tips, and hops by guess.
 */
export function botInput(st, kind = 'steady', out = { x: 0, y: 0, hop: false }) {
  const M = MINE, C = course(), F = C.fork, bot = st.bot || (st.bot = { q: [], seed: 7 }), late = LATE[kind] ?? 0.25;
  const ask = { x: 0, y: 0, hop: false };
  if (st.phase === 'off') bot.hopped = 0;
  if (st.phase === 'run' && !st.over && st.s >= C.top - 2) {
    const v = Math.max(st.v, M.roll.least), ahead = late + 0.2, way = st.way, at = (d) => (way === 1 && st.s + d > F.s0 + F.len ? railAt(F.s1 + st.s + d - F.s0 - F.len, 0, _b) : railAt(st.s + d, way, _b)), need = (k) => (v * v * Math.abs(k)) / M.lean.hold;
    const mine = (t) => t.way === -1 || t.way === way || (st.s < F.s0 && t.way === (kind === 'bold' ? 1 : 0));
    if (kind === 'clumsy') {
      const r = at(0);
      ask.x = need(r.k) > 0.5 ? Math.sign(r.k) : 0;
      ask.y = st.tip > 0.25 ? -1 : 0;
    } else {
      // lean: for the bend one will be in when the lean has come
      let lean = 0;
      for (const d of [v * ahead, v * (ahead + 0.25), v * 0.1]) { const r = at(d); if (need(r.k) > 0.14) { lean = Math.sign(r.k); break; } }
      if (!lean) { const g = C.nuggets.find((q) => q.s > st.s + v * late && q.s < st.s + v * (late + 0.7) && Math.abs(q.side) === 1 && mine(q) && !st.got[q.id]); if (g) lean = g.side; }
      // (the fork is chosen as one passes it)
      if (st.s < F.s0 && st.s + v * (ahead + 0.5) > F.s0) lean = kind === 'bold' ? 1 : lean > 0 ? 0 : lean;
      ask.x = lean;
      // brake: so as to be slow enough for everything in the next sixty metres
      const hold = kind === 'bold' ? 1 + M.lean.slack - 0.12 : 1 + M.lean.slack - 0.3, B = M.roll.brake * 0.75;
      let room = 99;
      for (let d = 0; d < 64; d += 1.5) { const r = at(d), safe = Math.sqrt((hold * M.lean.hold) / Math.max(1e-4, Math.abs(r.k))), can = Math.sqrt(safe * safe + 2 * B * Math.max(0, d - v * (late + 0.15))); if (can - v < room) room = can - v; }
      ask.y = room < 0.4 ? -1 : room > (kind === 'bold' ? 1.6 : 4) ? 1 : 0;
      if (st.s > C.finish - 30) ask.y = Math.min(ask.y, 0);
    }
    // hop: so that the gap, or the rock, is in the middle of the leap
    const T = (2 * M.hop.up) / M.hop.g, things = [...C.gaps.map((g) => ({ s: g.s + g.len / 2, way: g.way })), ...C.rocks.map((r) => ({ s: r.s, way: r.way }))].filter((t) => mine(t) && t.s > st.s).sort((p, q) => p.s - q.s);
    const next = things[0];
    if (next) {
      const err = kind === 'clumsy' ? (rnd(bot, Math.round(next.s)) - 0.5) * 0.62 : 0, press = next.s - v * (T / 2 + late + err);
      if (st.s >= press && bot.hopped !== next.s) { ask.hop = true; bot.hopped = next.s; }
    }
    if (kind !== 'clumsy') { const g = C.nuggets.find((q) => q.side === 2 && mine(q) && !st.got[q.id] && q.s > st.s && !things.some((t) => Math.abs(t.s - q.s) < 4)); if (g && st.s >= g.s - v * (T / 2 + late) && bot.hopped !== g.s) { ask.hop = true; bot.hopped = g.s; } }
  }
  // (what it asks now is what it decided `late` seconds ago; a press is kept for a tenth of a second)
  bot.q.push({ t: st.clock, ...ask });
  while (bot.q.length > 1 && bot.q[1].t <= st.clock - late) bot.q.shift();
  const was = bot.q[0].t <= st.clock - late + 1e-9 ? bot.q[0] : null;
  out.x = was ? was.x : 0; out.y = was ? was.y : 0;
  if (was && was.hop && bot.q[0] !== bot.done) { bot.done = bot.q[0]; bot.hold = st.clock + 0.1; }
  out.hop = st.clock < (bot.hold || 0);
  return out;
}
const _b = {};
/** A number between 0 and 1 drawn from the seed of a driver and a place. */
function rnd(bot, n) { const s = Math.sin(n * 127.1 + bot.seed * 311.7) * 43758.5453; return s - Math.floor(s); }
/** One who does nothing. */
export function naiveInput(st, out = { x: 0, y: 0, hop: false }) { out.x = 0; out.y = 0; out.hop = false; return out; }

/** Runs the line with a driver ('steady', 'bold', 'clumsy', or a function): { time (ms), over, offs, nuggets, top, short, why: [where it left the rails] }. */
export function botRun(kind = 'steady', limit = 400) {
  const st = startRun({ wait: 0.01 }), input = { x: 0, y: 0, hop: false }, events = [], why = [];
  for (let t = 0; t < limit && !st.over; t += MINE.step) {
    if (typeof kind === 'function') kind(st, input); else botInput(st, kind, input);
    events.length = 0; sub(st, MINE.step, input, events);
    for (const e of events) if (e.type === 'off') why.push({ why: e.why, s: Math.round(st.s), v: Math.round(st.v * 10) / 10 });
  }
  return { time: st.time, over: st.over, offs: st.offs, nuggets: st.nuggets, top: st.top, short: st.short, why, clock: st.clock, s: st.s };
}
