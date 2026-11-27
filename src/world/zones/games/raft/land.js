// The headland the Wild River comes down: how high its ground stands at every place. No renderer here: what
// builds it and what checks it read the same lines.
//
// It is a block of rock that stands in the sea against the foot of the northern cliffs, tilted towards the
// south-east, and the river has cut its canyon into it: the bed, a bank of earth and gravel on each side, walls
// of rock in steps up to the top — tall where a higher reach of the river runs behind them, a low green shore
// where the land opens out —, and round it all the cliffs that go down into the sea. Its height is one function
// of the place: the lower of what the river has left standing and of what the sea has.
//
// Nothing of the world is dug: the headland is laid in the sea, and against the cliff — which rises behind it,
// and through it where it is the higher.
import { RAFT, riverAt } from './rules.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const h2 = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7 + 74.7) * 43758.5453; return s - Math.floor(s); };
/** A smooth noise, 0 … 1. */
export const noise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v); return (h2(i, j) * (1 - a) + h2(i + 1, j) * a) * (1 - b) + (h2(i, j + 1) * (1 - a) + h2(i + 1, j + 1) * a) * b; };
const fbm = (x, y) => noise(x, y) * 0.6 + noise(x * 2.3 + 5.1, y * 2.3 + 1.7) * 0.28 + noise(x * 5.1 + 2.2, y * 5.1 + 9.4) * 0.12;

export const LAND = {
  // how the land stands beside each kind of stretch: how wide its banks are (left, right: m) and how far over
  // the water its top is (m). By name, the stretches that are their own: the pools open out, and the reach from
  // the island to the last pool is a wide green shore on the side of the sea — where the eye rests
  kind: {
    pool: { bank: [4.5, 4.5], cap: 5 }, riffle: { bank: [3.2, 3.2], cap: 6 }, rapid: { bank: [2.8, 2.8], cap: 7.5 }, narrows: { bank: [0.5, 0.5], cap: 13 },
    fall: { bank: [2.4, 2.4], cap: 8 }, fork: { bank: [3, 3], cap: 5 }, lagoon: { bank: [5, 7], cap: 2.2 },
  },
  // (`soft`: on that side — left, right — no wall behind the bank: a slope of grass. The east end of the headland is
  // such a place: two pools and the great bend between them lie round one meadow, where the eye rests)
  own: {
    'The Cauldron': { bank: [3.6, 3.6], cap: 6.5 }, 'Otter Pool': { bank: [4.5, 9], cap: 3.2, soft: [0, 1] }, 'The Step': { bank: [2.6, 7], cap: 3.4, soft: [0, 1] },
    'The Big Bend': { bank: [3, 9.5], cap: 3, soft: [0, 1] }, 'Heron Pool': { bank: [4.5, 9], cap: 3.4, soft: [0, 1] },
    'Kingfisher Pool': { bank: [6, 4.5], cap: 4.5, soft: [1, 0] }, 'The Hairpin': { bank: [7, 3], cap: 4, soft: [1, 0] },
    'The Fork': { bank: [3.2, 4.2], cap: 3.2 }, 'Last Chance': { bank: [5, 5.5], cap: 2.8 },
    'The Staircase': { bank: [2.8, 4], cap: 4.5 }, 'The Great Fall': { bank: [2.6, 3.4], cap: 4.5 },
  },
  rim: 2.5, // m of top beyond the banks, at the least, before the cliffs of the sea (and half its height over the water more)
  steep: 8, // the cliffs of the sea: so many metres up for one across
  shore: 2.6, // m of rocks along the foot of those cliffs, between the sea and the wall
  foot: 2.2, // m: the first of the wall is a slope of fallen rock, so wide — a low shore is nothing else
  bays: 4.5, // m: how far the line of the shore wanders in and out: bays and buttresses
  // the foot of the real cliff, from north to south: [z, x] — west of it the headland runs on into the rock
  cliff: [[-512, 293], [-487, 287], [-469, 281], [-451, 276], [-433, 271], [-421, 269], [-409, 265], [-397, 262], [-380, 257]],
  back: 14, // m: how far behind its spring the pool of the Cauldron goes on, into the real cliff
  grid: 16, // m: the squares the river is sorted into, for looking it up
  reach: 66, // m: how far from the river anything of the headland is
};

/** The foot of the real cliff at `z`: its x. */
function cliffFoot(z) {
  const C = LAND.cliff;
  if (z <= C[0][0]) return C[0][1];
  for (let i = 1; i < C.length; i++) if (z <= C[i][0]) return lerp(C[i - 1][1], C[i][1], (z - C[i - 1][0]) / (C[i][0] - C[i - 1][0]));
  return C[C.length - 1][1];
}

/** A wall of the canyon, `t` metres in from its foot: how high it has come (m) — in steps: a face, a ledge, a face. */
function wallUp(t, wobble) {
  const q = Math.max(0, t + wobble), n = Math.floor(q / 7), f = q - n * 7;
  return n * 12.5 + (f < 4 ? f * 2.8 : 11.2 + (f - 4) * 0.433);
}

let made = null;
/**
 * The headland of a course: { x0, x1, z0, z1 (what it lies within), at(x, z, out) }.
 * at() fills and returns out: h (the height of the ground: under -3, the bed of the sea), e (m beyond the edge
 * of the river's water — negative: on its water), s, u (the nearest place of the river), level (its water there),
 * top (how high the land would stand there, the canyon and the sea apart), sea (m inside the line of the shore:
 * negative, out at sea), kind (0 the bed, 1 a bank, 2 a wall of the canyon, 3 the top, 4 the cliffs of the sea,
 * 5 the sea).
 */
export function raftLand(course) {
  if (made && made.course === course) return made;
  // ---- the river, a sample every two metres — and a little further than its end: the way out of the lagoon
  const S = [], p = {};
  const shapeOf = (i) => LAND.own[course.stretches[i].name] || LAND.kind[course.stretches[i].kind];
  const n = Math.floor(course.length / 2);
  for (let m = 0; m <= n; m++) {
    const q = riverAt(course, (m * course.length) / n, p), st = course.points[Math.min(course.points.length - 1, Math.round(q.s))].stretch;
    S.push({ x: q.x, z: q.z, s: q.s, y: q.y, hw: q.hw, tx: q.tx, tz: q.tz, yaw: q.yaw, deep: q.deep, shape: shapeOf(st), bl: 0, br: 0, cap: 0, out: 0, sl: 0, sr: 0, n: S.length });
  }
  // (banks and tops ease from one stretch into the next)
  const eased = (get) => { const raw = S.map(get), out = new Float64Array(raw.length), w = 6; for (let i = 0; i < raw.length; i++) { let sum = 0, c = 0; for (let d = -w; d <= w; d++) { const k = clamp(i + d, 0, raw.length - 1); sum += raw[k]; c++; } out[i] = sum / c; } return out; };
  const bl = eased((q) => q.shape.bank[0]), br = eased((q) => q.shape.bank[1]), cap = eased((q) => q.shape.cap), sl = eased((q) => q.shape.soft?.[0] || 0), sr = eased((q) => q.shape.soft?.[1] || 0);
  S.forEach((q, i) => { q.bl = bl[i]; q.br = br[i]; q.cap = cap[i]; q.sl = sl[i]; q.sr = sr[i]; q.out = q.hw + Math.max(q.bl, q.br) + LAND.rim + 0.5 * q.cap + LAND.shore + LAND.foot + LAND.bays * 0.8 + (q.y + q.cap) / LAND.steep; });
  {
    const e = S[S.length - 1];
    for (let d = 2; d <= 34; d += 2) {
      const t = d / 34;
      S.push({ x: e.x + e.tx * d, z: e.z + e.tz * d, s: e.s + d, y: e.y * (1 - t), hw: e.hw + 7 * t, tx: e.tx, tz: e.tz, yaw: e.yaw, deep: 1, shape: e.shape, bl: e.bl * (1 - t), br: e.br * (1 - t), cap: e.cap * (1 - 0.7 * t), out: Math.max(0, e.out * (1 - smooth(0, 0.8, t))), sl: 0, sr: 0, n: S.length, mouth: true });
    }
  }
  {
    // (and back from its spring into the real cliff: the Cauldron has no shore of its own on that side — the face of
    // the cliff rises out of its water, and the great fall comes down it)
    const a = S[0], head = [];
    for (let d = LAND.back; d >= 2; d -= 2) head.push({ ...a, x: a.x - a.tx * d, z: a.z - a.tz * d, s: -d, head: true });
    S.unshift(...head);
    S.forEach((q, i) => { q.n = i; });
  }
  const grid = new Map(), G = LAND.grid, key = (i, j) => (i + 512) * 4096 + j + 512;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const q of S) {
    const k = key(Math.floor(q.x / G), Math.floor(q.z / G));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(q);
    x0 = Math.min(x0, q.x - q.out); x1 = Math.max(x1, q.x + q.out); z0 = Math.min(z0, q.z - q.out); z1 = Math.max(z1, q.z + q.out);
  }
  const span = Math.ceil(LAND.reach / G), far = new Float32Array(S.length + 2), seen = [];
  const at = (x, z, out = {}) => {
    let floor = Infinity, top = -Infinity, sea = -Infinity, near = null, nd = Infinity, ne = Infinity;
    const ci = Math.floor(x / G), cj = Math.floor(z / G), wob = 2.2 * (fbm(x / 13, z / 13) - 0.5);
    seen.length = 0;
    for (let i = ci - span; i <= ci + span; i++) for (let j = cj - span; j <= cj + span; j++) {
      const list = grid.get(key(i, j));
      if (!list) continue;
      for (const q of list) {
        const d = Math.hypot(x - q.x, z - q.z);
        if (d > LAND.reach) continue;
        far[q.n + 1] = d; seen.push(q);
        // how high the land stands about the river…
        const right = -(x - q.x) * Math.cos(q.yaw) + (z - q.z) * Math.sin(q.yaw) > 0, b = right ? q.br : q.bl, e = d - q.hw;
        const t = q.y + q.cap - 0.2 * Math.max(0, e - b - q.cap / 1.8);
        if (!q.mouth && t > top) top = t;
        // …and how far inside the line of its shore this is
        if (q.out - d > sea) sea = q.out - d;
        if (e < ne) { ne = e; nd = d; near = q; }
      }
    }
    // what the river has left standing here — its bed, its bank, its wall —, reach by reach: of each reach that
    // passes near, the place abreast (the nearest of its neighbours along the river). So a fall keeps its step:
    // the low water under it does not eat the banks above it
    for (const q of seen) {
      const d = far[q.n + 1], before = q.n > 0 ? far[q.n] : 0, after = q.n < S.length - 1 ? far[q.n + 2] : 0;
      if ((before > 0 && before < d) || (after > 0 && after < d)) continue;
      const right = -(x - q.x) * Math.cos(q.yaw) + (z - q.z) * Math.sin(q.yaw) > 0, b = right ? q.br : q.bl, soft = right ? q.sr : q.sl, e = d - q.hw;
      const rise = Math.min(1.6, 0.5 + 0.1 * b), t = e - b;
      const v = e <= 0 ? -(0.45 + 0.95 * q.deep) * Math.min(1, -e / 1.6) : e <= b ? 0.1 + rise * (e / b) ** 1.2 : 0.1 + rise + lerp(wallUp(t, wob), 0.3 * t + 0.5 * (wob + 1.1) * Math.min(1, t / 4), soft);
      if (q.y + v < floor) floor = q.y + v;
    }
    for (const q of seen) far[q.n + 1] = 0;
    if (!near) { out.h = -6; out.e = 99; out.s = 0; out.u = 0; out.level = 0; out.top = -6; out.sea = -99; out.kind = 5; return out; }
    // (the shore wanders; and to the west the headland runs on into the real cliff: no shore there)
    sea += 2.4 * (fbm(x / 9 + 3.1, z / 9 + 7.7) - 0.5) + 2 * LAND.bays * (noise(x / 27 + 1.7, z / 27 + 0.4) - 0.5);
    const inland = cliffFoot(z) + 5 - x - 3 * Math.max(0, z + 398) - 3 * Math.max(0, -509 - z);
    if (inland > sea) sea = inland;
    sea = Math.min(sea, z + 511.5); // (nothing beyond the northern edge of the world's own ground)
    top += 1.6 * (fbm(x / 17 + 1.3, z / 17 + 4.2) - 0.5);
    let h = Math.min(top, floor), kind = floor < top ? (ne <= 0 ? 0 : ne <= (near ? Math.max(near.bl, near.br) : 0) ? 1 : 2) : 3;
    // the cliffs of the sea: rocks along their foot, then the wall
    const up = sea - LAND.shore, wall = sea <= 0 ? -6 : up < 0 ? -1.6 + 2.5 * (sea / LAND.shore) ** 1.5 : up < LAND.foot ? 0.9 + up : 0.9 + LAND.foot + LAND.steep * (up - LAND.foot);
    if (wall < h) { h = wall; kind = sea <= 0 ? 5 : 4; }
    const dx = x - near.x, dz = z - near.z;
    out.h = h; out.e = ne; out.s = near.s + dx * near.tx + dz * near.tz; out.u = -dx * Math.cos(near.yaw) + dz * Math.sin(near.yaw);
    out.level = near.y; out.top = top; out.sea = sea; out.kind = kind;
    // ---- in the river: the island of the fork stands out of it, the gravel bars lie just under it
    if (ne <= 0.5 && !near.mouth) {
      for (const it of course.islands) {
        const mid = (it.from + it.to) / 2, r2 = ((out.s - mid) / ((it.to - it.from) / 2)) ** 2 + ((out.u - it.u) / it.half) ** 2;
        if (r2 < 1.25) { const up = near.y + 2.4 * Math.max(0, 1 - r2) ** 0.6 - 0.5 * smooth(0.8, 1.25, r2) - (r2 > 1 ? 0.3 : 0); if (up > out.h) { out.h = up; out.kind = r2 < 1 ? 1 : 0; } }
      }
      for (const g of course.shoals) {
        const k = Math.min(smooth(g.from - 1.5, g.from + 2.5, out.s), 1 - smooth(g.to - 2.5, g.to + 1.5, out.s)) * Math.min(smooth(g.u0 - 0.6, g.u0 + 1.2, out.u), 1 - smooth(g.u1 - 1.2, g.u1 + 0.6, out.u));
        if (k > 0) { const up = near.y - 0.8 + 0.72 * k; if (up > out.h) out.h = up; }
      }
    }
    return out;
  };
  made = { course, x0: Math.floor(x0) - 2, x1: Math.ceil(x1) + 2, z0: Math.floor(z0) - 2, z1: Math.ceil(z1) + 2, at, samples: S, foot: cliffFoot };
  made.x0 = Math.max(made.x0, 258);
  return made;
}

export { RAFT };
