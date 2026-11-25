// Par for the Course: its rules. No renderer here: the game, its checks and the player that plays by itself all
// read this.
//
// Nine holes of crazy golf on a little walk round the pond of acid of the north-western meadow: each a bed of
// felt in its timber kerb, built level whatever the meadow does, with one idea of its own — and each a little
// harder than the last. One putts: the stick turns the aim left and right, a gauge swings up and down by itself
// (held back, the stick slows it), and the jump hits at the strength the gauge shows. The ball rolls and slows
// on the felt, runs down what slopes, comes back off a cushion with most of its speed, and drops into the cup
// when it crosses it slowly enough (a fast one lips out). Off the bed or in the acid, it is put back where it was
// hit from, with one stroke more. Seven strokes at most a hole, then on to the next. The fewer strokes the
// better; the time of the round breaks ties.
//
// Places: each hole has a frame of its own, in metres from its tee: the hole lies towards -z, `x` is to the right
// of who looks down it, `y` is counted from its felt. `at` (its tee) and `yaw` (its heading: 0 north, a quarter
// turn west) put it in the world. What moves by itself — the sails of the mill, the sliding walls — is where the
// clock of the world says: the same for everybody. Time advances in steps of 1/120 s whatever the frame rate.

export const GOLF = {
  name: 'Par for the Course',
  acid: { x: -236, z: -82, r: 4.2 }, // the pond (ACID of the layout: the checks compare them)
  gate: { x: -225.5, z: -75.6, yaw: -1.87 }, // where one asks to play, south-east of the pond, looking at it (a heading of the valley: 0 looks south)
  stand: { x: -222.4, z: -72.6, yaw: 1.1 }, // the board of scores: behind the gate, clear of where the acid sends back those it dissolved
  step: 1 / 120,
  ball: 0.085, cup: 0.19, // their radius (m): a ball one sees from above the whole hole
  take: 2.4, // m/s: the fastest ball the cup takes, when it crosses its very middle
  friction: 1.6, // m/s²: what the felt takes from a rolling ball
  g: 9.8, slope: 7, // m/s²: in the air; down a slope (a rolling ball takes five sevenths of it)
  cushion: 0.8, // the share of its speed a cushion gives back
  kerb: 0.14, // m: how high a kerb stands over the felt (a ball that flies higher goes over it)
  sweep: 1.1, slow: 0.4, // s: the gauge from nothing to full; its pace when the stick is held back
  reach: [0.4, 22], // m on level felt: the least and the most of the gauge (the most is less near the cup)
  turn: [0.3, 2.4, 1.7], // rad/s: how fast the aim turns at first, how much faster each second the stick is held, at most
  most: 7, // strokes a hole
  wait: { tee: 0.9, lost: 0.9, holed: 1.5, picked: 1.2 }, // s: before one may aim, before the ball is back, before the next hole
  cycle: 1386, // s: after so long everything that moves is back where it was (the clock of the world is read modulo this)
};
/** The board of scores: strokes × 1000 + seconds (at most 999). Nine holes in one each, at best; nine times seven strokes, at worst. */
export const BOARD = { order: 'asc', min: 9000, max: 63999 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hash = (n, k = 0) => { const s = Math.sin(n * 127.1 + k * 311.7 + 74.7) * 43758.5453; return s - Math.floor(s); };
const STEP = GOLF.step, R = GOLF.ball, CUP2 = GOLF.cup * GOLF.cup, F = GOLF.friction, G = GOLF.g, TAU = Math.PI * 2;
const SPEED = 9.4; // m/s: no ball goes faster (less than its own radius a step: it never passes through a kerb)

// ---- the shapes of the beds
const box = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const round = (cx, cz, r, n) => Array.from({ length: n }, (_, k) => [cx + Math.sin((k / n) * TAU) * r, cz - Math.cos((k / n) * TAU) * r]);
/** The hump of the third hole: a ridge across the lane. */
const hump = (x, z) => { const u = (z + 4.2) / 1.7; return u > -1 && u < 1 ? 0.21 * (1 + Math.cos(Math.PI * u)) : 0; };
/** The ramp of the ninth: the last two metres of its lane rise half a metre, and end in the air. */
const ramp = (x, z) => (z < -5.6 ? 0.25 * (-5.6 - z) : 0);
/** The green of the island: a shallow bowl, the cup at its lowest. */
const bowl = (x, z) => 0.1 * Math.max(0, Math.hypot(x, z + 10.2) - 0.25);
const ISLE = round(0, -10.2, 1.3, 20);

/**
 * The nine holes. `beds`: the felt — `poly` (its outline), `open` (the sides without a kerb), `air` (the sides
 * with nothing under them), `y` (how high it lies over the felt of the tee), `h` (its relief), `look` ('deck':
 * planks). `blocks`: what stands on the felt (x0, z0, x1, z1, height). `walls`: more cushions (x, z, x, z,
 * height). `bumpers`: (x, z, radius). `movers`: what goes by the clock. `pipe`: where the ball is swallowed and
 * where it comes out. `links`: what the felt alone does not join (x, z → x, z, as so many metres). `view`: how far
 * the camera turns from the heading of the hole. `acid`: the pond is its hazard.
 */
export const HOLES = [
  { name: 'Warm-up', tip: 'straight in', par: 2, at: [-231, -73.3], yaw: Math.PI / 2, cup: [0, -7.5],
    beds: [{ poly: box(-1.2, 1, 1.2, -8.6) }] },
  { name: 'Round the Corner', tip: 'play it off the slanted cushion', par: 2, at: [-244.5, -73.3], yaw: Math.PI / 2, cup: [5.3, -5.8], view: 0.6,
    beds: [{ poly: [[-1.2, 1], [1.2, 1], [1.2, -4.6], [6.5, -4.6], [6.5, -7], [1.2, -7], [-1.2, -4.6]] }] },
  { name: 'The Hump', tip: 'too soft and it rolls back', par: 3, at: [-254, -81.5], yaw: 0, cup: [0, -7.9],
    beds: [{ poly: box(-1.2, 1, 1.2, -9.2), h: hump }] },
  { name: 'The Windmill', tip: 'wait for the sails', par: 3, at: [-250.3, -91.3], yaw: -Math.PI / 2, cup: [0, -8.6], view: 0.55,
    beds: [{ poly: box(-1.3, 1, 1.3, -10) }],
    blocks: [[-1.3, -5.6, -0.42, -4.4, 1.2], [0.42, -5.6, 1.3, -4.4, 1.2]],
    movers: [{ kind: 'sail', z: -4.28, r: 2.05, up: 2.15, hw: 0.36, hd: 0.06, period: 6, max: 0.33, high: 0.4 }] },
  { name: 'The Mushrooms', tip: 'they kick', par: 3, at: [-237.5, -97], yaw: -Math.PI / 2, cup: [0, -6.9],
    beds: [{ poly: box(-2.2, 1, 2.2, -8) }],
    bumpers: [[0, -2.7, 0.34], [-1.15, -4.2, 0.34], [1.15, -4.2, 0.34], [0, -5.6, 0.34]] },
  { name: 'Down the Drain', tip: 'into the funnel: the pipe does the rest', par: 3, at: [-225.5, -96.6], yaw: -Math.PI / 2, cup: [5.6, -8.5], view: 0.5,
    beds: [{ poly: [[-1.2, 1], [1.2, 1], [1.2, -4.2], [0.32, -6], [-0.32, -6], [-1.2, -4.2]] }, { poly: box(0.9, -7.3, 6.9, -9.7), y: 0.25 }],
    pipe: { in: [0, -5.78], r: 0.3, out: [1.45, -8.5], dir: [1, 0], time: 1.1, gain: 0.75, least: 2, most: 5.5, bend: [1.3, -7.2, 1.3] },
    links: [[0, -5.6, 1.6, -8.5, 1]] },
  { name: 'Sliding Doors', tip: 'three walls that never stand still', par: 3, at: [-214.8, -82], yaw: 1.082, cup: [0, -9.9],
    beds: [{ poly: box(-1.2, 1, 1.2, -11) }],
    movers: [
      { kind: 'slide', z: -3, hw: 0.55, hd: 0.13, amp: 0.45, period: 3.6, phase: 0, high: 0.4 },
      { kind: 'slide', z: -5.6, hw: 0.55, hd: 0.13, amp: 0.45, period: 2.8, phase: 0.33, high: 0.4 },
      { kind: 'slide', z: -8.2, hw: 0.55, hd: 0.13, amp: 0.45, period: 4.4, phase: 0.6, high: 0.4 }] },
  { name: 'The Plank', tip: 'no kerb over the acid', par: 4, at: [-231, -84.9], yaw: Math.PI / 2, cup: [0.4, -10.4], acid: true, floor: -0.7,
    beds: [
      { poly: [[-1.2, 1], [1.2, 1], [1.2, -1.8], [0.45, -1.8], [-0.45, -1.8], [-1.2, -1.8]], open: [3] },
      { poly: box(-0.45, -1.75, 0.45, -8.05), open: [0, 1, 2, 3], air: [0, 1, 2, 3], look: 'deck' },
      { poly: [[-0.9, -8], [-0.45, -8], [0.45, -8], [1.7, -8], [1.7, -11.6], [-0.9, -11.6]], open: [1] }] },
  { name: 'The Acid Test', tip: 'up the ramp, over the acid, onto the island', par: 4, at: [-246.2, -82], yaw: -Math.PI / 2, cup: [0, -10.2], acid: true, floor: -0.75, lift: 0.1,
    beds: [
      { poly: [[-1.1, 1], [1.1, 1], [1.1, -5.6], [1.1, -7.6], [-1.1, -7.6], [-1.1, -5.6]], open: [3], h: ramp },
      { poly: ISLE, y: -0.42, h: bowl, air: ISLE.map((_, k) => k), isle: true }],
    // (the back of the island is boarded up: a ball that comes in hard stops there and drops onto the green)
    walls: [16, 17, 18, 19, 0, 1, 2, 3].map((k) => [...ISLE[k], ...ISLE[(k + 1) % 20], 0.9]),
    links: [[0, -7.4, 0, -9.3, 2.5]] },
];

// ---- each hole made ready: its frame, its beds, its cushions
for (const [i, H] of HOLES.entries()) {
  H.n = i;
  H.cos = Math.cos(H.yaw); H.sin = Math.sin(H.yaw);
  H.floor ??= -0.6;
  H.tee = [0, 0];
  H.walls ||= []; H.blocks ||= []; H.bumpers ||= []; H.movers ||= []; H.links ||= [];
  const walls = [];
  const wall = (ax, az, bx, bz, bed, high) => { const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); walls.push({ ax, az, dx, dz, il2: 1 / (l * l), nx: -dz / l, nz: dx / l, x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz), bed, high }); };
  for (const bed of H.beds) {
    bed.y ||= 0; bed.open ||= []; bed.air ||= [];
    bed.n = bed.poly.length;
    bed.xs = Float64Array.from(bed.poly, (p) => p[0]); bed.zs = Float64Array.from(bed.poly, (p) => p[1]);
    bed.x0 = Math.min(...bed.xs); bed.x1 = Math.max(...bed.xs); bed.z0 = Math.min(...bed.zs); bed.z1 = Math.max(...bed.zs);
    for (let k = 0; k < bed.n; k++) if (!bed.open.includes(k)) wall(...bed.poly[k], ...bed.poly[(k + 1) % bed.n], bed, GOLF.kerb);
  }
  for (const [x0, z0, x1, z1, high] of H.blocks) { wall(x0, z0, x1, z0, H.beds[0], high); wall(x1, z0, x1, z1, H.beds[0], high); wall(x1, z1, x0, z1, H.beds[0], high); wall(x0, z1, x0, z0, H.beds[0], high); }
  for (const [ax, az, bx, bz, high] of H.walls) wall(ax, az, bx, bz, H.beds.find((b) => b.isle) || H.beds[0], high);
  H.cushions = walls;
  if (H.acid) H.acid = [...toLocal(H, GOLF.acid.x, GOLF.acid.z), GOLF.acid.r];
}

/** A place of a hole, in the world: [x, z]. */
export function toWorld(H, x, z, out = [0, 0]) { out[0] = H.at[0] + x * H.cos + z * H.sin; out[1] = H.at[1] - x * H.sin + z * H.cos; return out; }
/** A place of the world, in the frame of a hole: [x, z]. */
export function toLocal(H, wx, wz, out = [0, 0]) { const dx = wx - H.at[0], dz = wz - H.at[1]; out[0] = dx * H.cos - dz * H.sin; out[1] = dx * H.sin + dz * H.cos; return out; }
/** The heading (0 north, a quarter turn west) of an aim of a hole (0 down the hole, turning right). */
export const headingOf = (H, aim) => H.yaw - aim;

function inPoly(bed, x, z) {
  const X = bed.xs, Z = bed.zs;
  let c = false;
  for (let i = 0, j = bed.n - 1; i < bed.n; j = i++) if ((Z[i] > z) !== (Z[j] > z) && x < ((X[j] - X[i]) * (z - Z[i])) / (Z[j] - Z[i]) + X[i]) c = !c;
  return c;
}
let _fy = 0; // (the height of the felt bedAt found)
/** The bed under (x, z) — the highest whose felt is not above `top` —, or null: nothing is built there. */
function bedAt(H, x, z, top) {
  let best = null;
  _fy = -Infinity;
  for (let i = 0; i < H.beds.length; i++) {
    const bed = H.beds[i];
    if (x < bed.x0 || x > bed.x1 || z < bed.z0 || z > bed.z1 || !inPoly(bed, x, z)) continue;
    const y = bed.h ? bed.y + bed.h(x, z) : bed.y;
    if (y <= top && y > _fy) { _fy = y; best = bed; }
  }
  return best;
}
/** The height of the felt at (x, z) of a hole (-Infinity: none). */
export function feltAt(H, x, z) { bedAt(H, x, z, 99); return _fy; }
/** The level of the felt of the tee of a hole, over the sea: its beds clear the ground everywhere. `ground(x, z)`: the ground of the world. */
export function levelOf(H, ground) {
  let top = -Infinity;
  const w = [0, 0];
  for (const bed of H.beds) {
    if (bed.isle) continue; // (it stands in the pond)
    for (let k = 0; k < bed.n; k++) {
      const a = bed.poly[k], b = bed.poly[(k + 1) % bed.n], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
      for (let i = 0; i < n; i++) { toWorld(H, a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, w); if (!bed.air.includes(k) || !H.acid) top = Math.max(top, ground(w[0], w[1]) - bed.y); }
    }
    for (let x = bed.x0 + 0.25; x < bed.x1; x += 0.5) for (let z = bed.z0 + 0.25; z < bed.z1; z += 0.5) { if (!inPoly(bed, x, z) || (H.acid && bed.air.length)) continue; toWorld(H, x, z, w); top = Math.max(top, ground(w[0], w[1]) - bed.y); }
  }
  return top + 0.12 + (H.lift || 0);
}

// ---- what goes by the clock of the world
const _mv = { x: 0, z: 0, hw: 0, hd: 0, ux: 0, on: false, turn: 0 };
/**
 * Where a mover of a hole is at the second `tw` of the clock of the world: { x, z (its middle), hw, hd (half its
 * width and depth), ux (m/s, across the lane), on (is it in the way of a ball?), turn (the sails: how far they
 * have turned, rad) }. A sliding wall goes from side to side; of the sails of the mill only the one that comes
 * down across the door counts, while it is low enough to stop a ball.
 */
export function moverAt(m, tw, out = {}) {
  const t = tw / m.period;
  out.z = m.z; out.hw = m.hw; out.hd = m.hd;
  if (m.kind === 'slide') {
    const a = TAU * (t - Math.floor(t) + m.phase);
    out.x = m.amp * Math.sin(a); out.ux = ((m.amp * TAU) / m.period) * Math.cos(a); out.on = true; out.turn = 0;
  } else {
    const a = TAU * (t - Math.floor(t)), q = Math.PI / 2, e = a + q / 2 - Math.floor((a + q / 2) / q) * q - q / 2;
    out.turn = a; out.x = m.r * Math.sin(e); out.ux = ((m.r * TAU) / m.period) * Math.cos(e); out.on = Math.abs(e) < m.max;
  }
  return out;
}

// ---- the ball
/** A ball at rest at (x, z) of a hole. */
export function ballAt(H, x, z, b = {}) { b.x = x; b.z = z; b.y = feltAt(H, x, z); b.vx = 0; b.vz = 0; b.vy = 0; b.air = false; b.pipe = 0; b.keep = 0; b.lip = false; return b; }

function collide(H, b, tw, ev) {
  // the cushions: the kerbs of the beds, the foot of the mill, the boards of the island
  const W = H.cushions;
  for (let i = 0; i < W.length; i++) {
    const w = W[i];
    if (b.x < w.x0 - R || b.x > w.x1 + R || b.z < w.z0 - R || b.z > w.z1 + R) continue;
    const t = clamp(((b.x - w.ax) * w.dx + (b.z - w.az) * w.dz) * w.il2, 0, 1), px = w.ax + w.dx * t, pz = w.az + w.dz * t, ex = b.x - px, ez = b.z - pz, d2 = ex * ex + ez * ez;
    if (d2 >= R * R) continue;
    const base = w.bed.h ? w.bed.y + w.bed.h(px, pz) : w.bed.y;
    if (b.y >= base + w.high || b.y < base - 0.3) continue; // (over it, or already under the bed)
    const d = Math.sqrt(d2), nx = d > 1e-9 ? ex / d : w.nx, nz = d > 1e-9 ? ez / d : w.nz;
    b.x = px + nx * R; b.z = pz + nz * R;
    const vn = b.vx * nx + b.vz * nz;
    if (vn < 0) { const k = (1 + GOLF.cushion) * vn; b.vx -= k * nx; b.vz -= k * nz; if (ev && vn < -0.5) ev.push({ type: 'bounce', speed: -vn }); }
  }
  // the mushrooms: they give back more than they get
  for (let i = 0; i < H.bumpers.length; i++) {
    const m = H.bumpers[i], ex = b.x - m[0], ez = b.z - m[1], rr = m[2] + R, d2 = ex * ex + ez * ez;
    if (d2 >= rr * rr || b.y > 0.45) continue;
    const d = Math.sqrt(d2) || 1, nx = ex / d, nz = ez / d;
    b.x = m[0] + nx * rr; b.z = m[1] + nz * rr;
    const vn = b.vx * nx + b.vz * nz;
    if (vn < 0) {
      const out = Math.max(-vn * 1.15, 2.6);
      b.vx += (out - vn) * nx; b.vz += (out - vn) * nz;
      const s = Math.hypot(b.vx, b.vz); if (s > SPEED) { b.vx *= SPEED / s; b.vz *= SPEED / s; }
      if (ev) ev.push({ type: 'bump', n: i, speed: out });
    }
  }
  // what moves: a wall that slides shoves the ball along; a sail stops it
  for (let i = 0; i < H.movers.length; i++) {
    const m = H.movers[i];
    if (b.y > m.high || b.z < m.z - m.hd - R || b.z > m.z + m.hd + R) continue;
    const v = moverAt(m, tw, _mv);
    if (!v.on) continue;
    const qx = clamp(b.x, v.x - v.hw, v.x + v.hw), qz = clamp(b.z, v.z - v.hd, v.z + v.hd), ex = b.x - qx, ez = b.z - qz, d2 = ex * ex + ez * ez;
    if (d2 >= R * R) continue;
    let nx, nz, push;
    if (d2 > 1e-12) { const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; push = R - d; } else {
      // (its middle is inside the wall: out by the nearest face)
      const px = v.hw - Math.abs(b.x - v.x), pz = v.hd - Math.abs(b.z - v.z);
      if (pz < px) { nx = 0; nz = b.z < v.z ? -1 : 1; push = pz + R; } else { nx = b.x < v.x ? -1 : 1; nz = 0; push = px + R; }
    }
    b.x += nx * push; b.z += nz * push;
    const vn = (b.vx - v.ux) * nx + b.vz * nz;
    if (vn < 0) { const k = (1 + GOLF.cushion) * vn; b.vx -= k * nx; b.vz -= k * nz; if (ev && vn < -0.5) ev.push({ type: 'bounce', speed: -vn, moving: true }); }
  }
}

/** A ball that stops in the way of what moves is put just clear of it (towards the tee, before the sails). */
function settle(H, b) {
  for (const m of H.movers) {
    const band = m.hd + R + 0.03;
    if (Math.abs(b.z - m.z) < band) b.z = m.z + (m.kind === 'sail' || b.z >= m.z ? band : -band);
  }
}

export const ROLLS = 0, RESTS = 1, HOLED = 2, ACID = 3, OUT = 4;
/**
 * Advances a ball of hole `H` by one step of 1/120 s; `tw`: the second of the clock of the world at the end of
 * the step. Returns ROLLS, RESTS (it has stopped), HOLED, ACID or OUT (it is lost: in the pond, or off the bed).
 * `events`: { type: 'bounce' (speed) | 'bump' | 'land' (speed) | 'lip' | 'in' | 'out' (the pipe) }.
 */
export function ballStep(H, b, tw, ev) {
  const dt = STEP;
  if (b.pipe > 0) {
    // in the pipe: it comes out at the other end, with part of the speed it went in with
    b.pipe -= dt;
    if (b.pipe <= 0) { const p = H.pipe, v = clamp(b.keep * p.gain, p.least, p.most); b.pipe = 0; b.x = p.out[0]; b.z = p.out[1]; b.y = feltAt(H, b.x, b.z); b.vx = p.dir[0] * v; b.vz = p.dir[1] * v; b.vy = 0; if (ev) ev.push({ type: 'out', speed: v }); }
    return ROLLS;
  }
  if (b.air) {
    // in the air: it comes down on felt that was under it — or on nothing
    const y0 = b.y;
    b.vy -= G * dt; b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
    collide(H, b, tw, ev);
    if (bedAt(H, b.x, b.z, y0 + 0.02) && b.y <= _fy) {
      const hit = -b.vy;
      b.y = _fy;
      if (hit > 1.4) { b.vy = hit * 0.32; b.vx *= 0.86; b.vz *= 0.86; if (ev) ev.push({ type: 'land', speed: hit }); } else { b.air = false; b.vy = 0; }
    } else if (b.y < H.floor) return H.acid && (b.x - H.acid[0]) ** 2 + (b.z - H.acid[1]) ** 2 < H.acid[2] * H.acid[2] ? ACID : OUT;
    return ROLLS;
  }
  // on the felt: the slope pulls it, the felt slows it
  const bed = bedAt(H, b.x, b.z, b.y + 0.06);
  let ax = 0, az = 0;
  if (bed && bed.h) { const e = 0.01; ax = (-GOLF.slope * (bed.h(b.x + e, b.z) - bed.h(b.x - e, b.z))) / (2 * e); az = (-GOLF.slope * (bed.h(b.x, b.z + e) - bed.h(b.x, b.z - e))) / (2 * e); }
  const sp = Math.hypot(b.vx, b.vz), pull = Math.hypot(ax, az);
  if (sp < 0.04) {
    if (pull <= F) { b.vx = 0; b.vz = 0; settle(H, b); return RESTS; }
    const k = ((pull - F) / pull) * dt; b.vx += ax * k; b.vz += az * k;
  } else {
    const ox = b.vx, oz = b.vz, f = (F * dt) / sp;
    b.vx += ax * dt - ox * f; b.vz += az * dt - oz * f;
    if (b.vx * ox + b.vz * oz <= 0 && pull <= F) { b.vx = 0; b.vz = 0; settle(H, b); return RESTS; }
  }
  b.x += b.vx * dt; b.z += b.vz * dt;
  collide(H, b, tw, ev);
  if (!bedAt(H, b.x, b.z, b.y + 0.06)) { b.air = true; return ROLLS; } // (off an edge without a kerb)
  const fall = b.y + b.vy * dt - 0.5 * G * dt * dt;
  if (_fy < fall - 1e-5) { b.air = true; b.y = fall; b.vy -= G * dt; return ROLLS; } // (the felt drops away faster than it falls: off a crest, off a lip)
  b.vy = (_fy - b.y) / dt; b.y = _fy;
  // the cup: it takes a ball that crosses it slowly enough — the nearer its middle, the faster that may be
  const cx = b.x - H.cup[0], cz = b.z - H.cup[1], d2 = cx * cx + cz * cz;
  if (d2 < CUP2) {
    const s = Math.hypot(b.vx, b.vz);
    if (s <= GOLF.take * Math.sqrt(1 - d2 / CUP2)) { b.x = H.cup[0]; b.z = H.cup[1]; b.y -= 0.12; b.vx = 0; b.vz = 0; b.vy = 0; return HOLED; }
    // (too fast: it lips out — bent towards the middle, and slowed)
    const k = (9 * dt) / GOLF.cup, slow = 1 - 3 * dt;
    b.vx = (b.vx - cx * k) * slow; b.vz = (b.vz - cz * k) * slow;
    if (!b.lip) { b.lip = true; if (ev) ev.push({ type: 'lip', speed: s }); }
  } else b.lip = false;
  if (H.pipe) {
    const p = H.pipe, ex = b.x - p.in[0], ez = b.z - p.in[1];
    if (ex * ex + ez * ez < p.r * p.r) { b.keep = Math.hypot(b.vx, b.vz); b.pipe = p.time; b.vx = 0; b.vz = 0; if (ev) ev.push({ type: 'in', speed: b.keep }); }
  }
  return ROLLS;
}

// ---- how far from the cup: the way round the kerbs, on a grid
const CELL = 0.2, CLEAR = 0.15;
/** The map of a hole: for each place of a grid, how far the cup is by the felt (and which place comes next on the way). */
function mapOf(H) {
  if (H.map) return H.map;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const bed of H.beds) { x0 = Math.min(x0, bed.x0); x1 = Math.max(x1, bed.x1); z0 = Math.min(z0, bed.z0); z1 = Math.max(z1, bed.z1); }
  const i0 = Math.floor(x0 / CELL) - 1, j0 = Math.floor(z0 / CELL) - 1, nx = Math.ceil(x1 / CELL) + 2 - i0, nz = Math.ceil(z1 / CELL) + 2 - j0, N = nx * nz;
  const ok = new Uint8Array(N), dist = new Float32Array(N).fill(Infinity), next = new Int32Array(N).fill(-1), leap = new Uint8Array(N);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = (i + i0) * CELL, z = (j + j0) * CELL;
    if (!bedAt(H, x, z, 99)) continue;
    let free = true;
    for (const w of H.cushions) { const t = clamp(((x - w.ax) * w.dx + (z - w.az) * w.dz) * w.il2, 0, 1); if (Math.hypot(x - w.ax - w.dx * t, z - w.az - w.dz * t) < CLEAR) { free = false; break; } }
    for (const m of H.bumpers) if (Math.hypot(x - m[0], z - m[1]) < m[2] + CLEAR) free = false;
    for (const k of H.blocks) if (x > k[0] && x < k[2] && z > k[1] && z < k[3]) free = false;
    if (free) ok[j * nx + i] = 1;
  }
  const M = (H.map = { i0, j0, nx, nz, ok, dist, next, leap });
  const node = (x, z) => nearest(M, x, z);
  // from the cup outwards (the links are taken backwards: they lead to the cup, not from it)
  const from = new Map();
  for (const [ax, az, bx, bz, cost] of H.links) { const a = node(ax, az), b = node(bx, bz); if (a >= 0 && b >= 0) (from.get(b) || from.set(b, []).get(b)).push([a, cost]); }
  const heap = [], put = (d, n) => { heap.push([d, n]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const take = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let c = 2 * k + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++; if (heap[k][0] <= heap[c][0]) break; [heap[k], heap[c]] = [heap[c], heap[k]]; k = c; } } return top; };
  const c0 = node(H.cup[0], H.cup[1]);
  dist[c0] = Math.hypot((c0 % nx + i0) * CELL - H.cup[0], (Math.floor(c0 / nx) + j0) * CELL - H.cup[1]); put(dist[c0], c0);
  while (heap.length) {
    const [d, n] = take();
    if (d > dist[n]) continue;
    const i = n % nx, j = (n - i) / nx;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const m = b * nx + a; if (!ok[m]) continue;
      const nd = d + CELL * (di && dj ? Math.SQRT2 : 1);
      if (nd < dist[m]) { dist[m] = nd; next[m] = n; leap[m] = 0; put(nd, m); }
    }
    for (const [m, cost] of from.get(n) || []) if (d + cost < dist[m]) { dist[m] = d + cost; next[m] = n; leap[m] = 1; put(dist[m], m); }
  }
  return M;
}
/** The place of the grid nearest to (x, z) that can be stood on (-1: none within three quarters of a metre). */
function nearest(M, x, z) {
  const ci = Math.round(x / CELL) - M.i0, cj = Math.round(z / CELL) - M.j0;
  let best = -1, least = Infinity;
  for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
    const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= M.nx || j >= M.nz || !M.ok[j * M.nx + i]) continue;
    const d = Math.hypot((i + M.i0) * CELL - x, (j + M.j0) * CELL - z) + (M.dist[j * M.nx + i] === Infinity ? 0 : M.dist[j * M.nx + i]);
    if (d < least) { least = d; best = j * M.nx + i; }
  }
  return best;
}
/** How far the cup is from (x, z) by the felt, round the kerbs (m; 60: one cannot get there from here). */
export function farFrom(H, x, z) {
  const M = mapOf(H), n = nearest(M, x, z);
  if (n < 0 || M.dist[n] === Infinity) return 60;
  return M.dist[n] + Math.hypot((n % M.nx + M.i0) * CELL - x, (Math.floor(n / M.nx) + M.j0) * CELL - z);
}
/** Is the straight line from (ax, az) to (bx, bz) free for a ball: on felt all the way, clear of the cushions and of the mushrooms? */
function clearLine(H, ax, az, bx, bz) {
  const l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / 0.1));
  for (let k = 1; k <= n; k++) {
    const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
    if (!bedAt(H, x, z, 99)) return false;
    for (const w of H.cushions) { if (x < w.x0 - R || x > w.x1 + R || z < w.z0 - R || z > w.z1 + R) continue; const t = clamp(((x - w.ax) * w.dx + (z - w.az) * w.dz) * w.il2, 0, 1); if (Math.hypot(x - w.ax - w.dx * t, z - w.az - w.dz * t) < R * 0.9 && k < n) return false; }
    for (const m of H.bumpers) if (Math.hypot(x - m[0], z - m[1]) < m[2] + R) return false;
  }
  return true;
}
/** Where to aim from (x, z) to follow the way to the cup: the cup itself when the line to it is free, else the furthest place of the way one can see. */
export function wayFrom(H, x, z, out = [0, 0]) {
  const M = mapOf(H);
  out[0] = H.cup[0]; out[1] = H.cup[1];
  if (clearLine(H, x, z, out[0], out[1])) return out;
  let n = nearest(M, x, z), seen = false;
  for (let k = 0; k < 400 && n >= 0; k++) {
    const px = (n % M.nx + M.i0) * CELL, pz = (Math.floor(n / M.nx) + M.j0) * CELL;
    if (Math.hypot(px - x, pz - z) > 0.3) { if (clearLine(H, x, z, px, pz)) { out[0] = px; out[1] = pz; seen = true; } else if (seen) break; }
    if (M.leap[n]) { if (!seen || (out[0] === px && out[1] === pz)) { out[0] = px + (px - x) * 0.01; out[1] = pz + (pz - z) * 0.01; } break; } // (a pipe, a jump: one aims at where it begins)
    n = M.next[n];
  }
  return out;
}
/** The aim (0 down the hole, turning right, rad) that follows the way to the cup from (x, z). */
export function aimFrom(H, x, z) { const w = wayFrom(H, x, z, _w); return Math.atan2(w[0] - x, -(w[1] - z)); }
const _w = [0, 0];

/**
 * How far along the aim a ball would be stopped: by the first cushion, mushroom or foot of the mill, or by the
 * end of the felt — within `far` metres. Returns that distance; `out`: where ([x, z]) and the way it would come
 * back ([dx, dz]; 0, 0 when nothing sends it back).
 */
export function sightLine(H, x, z, aim, far, out) {
  const dx = Math.sin(aim), dz = -Math.cos(aim);
  let best = far, nx = 0, nz = 0;
  for (const w of H.cushions) {
    if (w.bed.isle || w.high > 0.5 !== w.high > 0.5) continue;
    // the line of the cushion, pushed out by the radius of the ball towards where the ball is
    const side = (x - w.ax) * w.nx + (z - w.az) * w.nz >= 0 ? 1 : -1, ox = w.ax + w.nx * R * side, oz = w.az + w.nz * R * side, den = dx * w.dz - dz * w.dx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((ox - x) * w.dz - (oz - z) * w.dx) / den, u = ((ox - x) * dz - (oz - z) * dx) / den;
    if (t > 1e-6 && t < best && u >= -0.02 && u <= 1.02) { best = t; nx = w.nx * side; nz = w.nz * side; }
  }
  for (const m of H.bumpers) {
    const ex = m[0] - x, ez = m[1] - z, along = ex * dx + ez * dz, off2 = ex * ex + ez * ez - along * along, rr = (m[2] + R) * (m[2] + R);
    if (along <= 0 || off2 >= rr) continue;
    const t = along - Math.sqrt(rr - off2);
    if (t > 1e-6 && t < best) { best = t; nx = (x + dx * t - m[0]) / (m[2] + R); nz = (z + dz * t - m[1]) / (m[2] + R); }
  }
  // (the end of the felt, where no kerb stops the ball)
  for (let t = 0.1; t < best; t += 0.1) if (!bedAt(H, x + dx * t, z + dz * t, 99)) { best = t; nx = 0; nz = 0; break; }
  if (out) { out[0] = x + dx * best; out[1] = z + dz * best; const vn = dx * nx + dz * nz; out[2] = nx || nz ? dx - 2 * vn * nx : 0; out[3] = nx || nz ? dz - 2 * vn * nz : 0; }
  return best;
}

// ---- a round
/** The strength the gauge shows (0 … 1): up, then down, then up again. */
export const gaugeOf = (phase) => (phase < 1 ? phase : 2 - phase);
/** How fast the aim turns (rad/s, the stick pushed fully) once the stick has been held `held` seconds the same way. */
export const turnRate = (held) => Math.min(GOLF.turn[2], GOLF.turn[0] + GOLF.turn[1] * held);
/** The speed (m/s) a ball leaves with, at strength `p` (0 … 1) of a gauge whose most is `far` metres of level felt. */
export const speedOf = (p, far) => Math.sqrt(2 * F * (GOLF.reach[0] + (far - GOLF.reach[0]) * p));
/** The most of the gauge (m of level felt) for a ball `d` metres from the cup: near the cup the gauge is finer. */
export const reachFor = (d) => clamp(2.2 * d + 2.5, 5, GOLF.reach[1]);

/**
 * A round, on the first tee. `t0`: the second of the clock of the world when it begins (what moves is read
 * there). Its state: `hole` (0 … 8), `phase` ('tee': the ball is put down; 'aim'; 'roll'; 'lost': in the acid or
 * off the bed; 'holed'; 'picked': seven strokes, the ball is picked up), `ball`, `from` (where it was hit from),
 * `aim` (rad: 0 down the hole, turning right), `gauge` (its phase, 0 … 2), `far` (its most, m), `strokes` (hole
 * by hole), `total`, `clock` (s), and at the end `over`, `time` (s) and `score`.
 */
export function startRound(t0 = 0) {
  const st = { t0, clock: 0, acc: 0, steps: 0, hole: 0, phase: 'tee', wait: GOLF.wait.tee, strokes: new Array(HOLES.length).fill(0), holed: new Array(HOLES.length).fill(false), total: 0, ball: {}, from: [0, 0], aim: 0, held: 0, dir: 0, gauge: 0, since: 0, far: GOLF.reach[1], power: 0, want: false, over: false, time: 0, score: 0, clumsy: 0, bot: null };
  ballAt(HOLES[0], 0, 0, st.ball);
  return st;
}
/** The score of a round: strokes × 1000 + seconds (at most 999). */
export const scoreOf = (strokes, seconds) => strokes * 1000 + Math.min(999, Math.max(0, Math.floor(seconds)));
/** How a score is written: "31 strokes (2:07)". */
export function formatScore(score) { const n = Math.floor(score / 1000), s = score % 1000; return `${n} strokes (${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')})`; }
/** The line of the run: "hole 4 of 9 · par 3 · stroke 2 · 11 so far". */
export function lineOf(st) {
  if (st.over) return `${GOLF.name} · ${formatScore(st.score)}`;
  const H = HOLES[st.hole], n = st.strokes[st.hole];
  return `hole ${st.hole + 1} of ${HOLES.length} · par ${H.par} · stroke ${Math.min(GOLF.most, st.phase === 'aim' || st.phase === 'tee' ? n + 1 : Math.max(1, n))} · ${st.total} so far`;
}

function aimAgain(st) {
  const H = HOLES[st.hole], b = st.ball;
  st.phase = 'aim'; st.gauge = 0; st.since = 0; st.held = 0; st.dir = 0;
  st.aim = aimFrom(H, b.x, b.z);
  st.far = reachFor(farFrom(H, b.x, b.z));
}
function nextHole(st, events) {
  st.hole++;
  if (st.hole >= HOLES.length) { st.hole = HOLES.length - 1; st.over = true; st.phase = 'over'; st.score = scoreOf(st.total, st.time); if (events) events.push({ type: 'over', score: st.score, strokes: st.total, time: st.time }); return; }
  ballAt(HOLES[st.hole], 0, 0, st.ball);
  st.from[0] = 0; st.from[1] = 0; st.aim = 0;
  st.phase = 'tee'; st.wait = GOLF.wait.tee;
  if (events) events.push({ type: 'tee', hole: st.hole });
}
function pickUp(st, events) { st.phase = 'picked'; st.wait = GOLF.wait.picked; st.time = st.clock; if (events) events.push({ type: 'picked', hole: st.hole, strokes: st.strokes[st.hole] }); }

/**
 * Advances a round by `dt` seconds. `input`: { x (-1 … 1: turns the aim), y (-1 … 1: held back, it slows the
 * gauge), jump (true on the frame it is asked: hits) }. `events`: those of the ball, and { type: 'tee' (hole) |
 * 'hit' (power, speed) | 'rest' | 'lost' (what: 'acid' | 'out', x, z, y) | 'back' | 'holed' (hole, strokes, par)
 * | 'picked' (hole) | 'over' (score, strokes, time) }.
 */
export function stepRound(st, dt, input, events) {
  if (input?.jump) st.want = true;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= STEP && !st.over) { st.acc -= STEP; sub(st, input, events); st.want = false; }
  return st;
}

function sub(st, input, events) {
  const H = HOLES[st.hole], b = st.ball;
  st.clock += STEP; st.steps++;
  if (st.phase === 'aim') {
    const x = clamp(input?.x || 0, -1, 1), dir = x > 0.02 ? 1 : x < -0.02 ? -1 : 0;
    if (dir && dir === st.dir) st.held += STEP; else { st.held = dir ? STEP : 0; st.dir = dir; }
    st.aim += x * turnRate(st.held) * STEP;
    st.gauge += (STEP / GOLF.sweep) * (1 - (1 - GOLF.slow) * clamp(-(input?.y || 0), 0, 1));
    if (st.gauge >= 2) st.gauge -= 2;
    st.since += STEP;
    if (st.want && st.since >= 0.25) {
      const p = gaugeOf(st.gauge), v = speedOf(p, st.far);
      st.power = p; st.from[0] = b.x; st.from[1] = b.z;
      b.vx = Math.sin(st.aim) * v; b.vz = -Math.cos(st.aim) * v; b.vy = 0; b.lip = false;
      st.strokes[st.hole]++; st.total++; st.phase = 'roll';
      if (events) events.push({ type: 'hit', power: p, speed: v });
    }
  } else if (st.phase === 'roll') {
    const code = ballStep(H, b, st.t0 + st.clock, events);
    if (code === RESTS) { if (events) events.push({ type: 'rest' }); if (st.strokes[st.hole] >= GOLF.most) pickUp(st, events); else aimAgain(st); }
    else if (code === HOLED) { st.phase = 'holed'; st.wait = GOLF.wait.holed; st.holed[st.hole] = true; st.time = st.clock; if (events) events.push({ type: 'holed', hole: st.hole, strokes: st.strokes[st.hole], par: H.par }); }
    else if (code === ACID || code === OUT) {
      // lost: one stroke more (never more than seven), and back where it was hit from
      if (st.strokes[st.hole] < GOLF.most) { st.strokes[st.hole]++; st.total++; }
      st.phase = 'lost'; st.wait = GOLF.wait.lost;
      if (events) events.push({ type: 'lost', what: code === ACID ? 'acid' : 'out', x: b.x, z: b.z, y: b.y });
    }
  } else if (st.phase === 'tee') {
    st.wait -= STEP;
    if (st.wait <= 0) aimAgain(st);
  } else if (st.phase === 'lost') {
    st.wait -= STEP;
    if (st.wait <= 0) { ballAt(H, st.from[0], st.from[1], b); if (events) events.push({ type: 'back' }); if (st.strokes[st.hole] >= GOLF.most) pickUp(st, events); else aimAgain(st); }
  } else if (st.phase === 'holed' || st.phase === 'picked') {
    st.wait -= STEP;
    if (st.wait <= 0) nextHole(st, events);
  }
}

// ---------------------------------------------------------------------------------------------------------
// A player that plays by itself — the proof that every hole can be holed. It does what one does with one's eyes:
// it plays the putt forward with the rules above, for every aim round the way to the cup and every strength the
// gauge will show in the coming swing — and, where something moves, for the very moment of the hit —, keeps the
// one that ends in the cup, or nearest to it by the felt, and makes it finer. Then it turns the aim there and
// waits for the gauge. `st.clumsy` (a seed) makes it a clumsy one: it looks less closely, its aim is a few
// degrees off and its finger a little early or late.

const THINK = 40, EVERY = 6, SWING = Math.round((2 * GOLF.sweep) / STEP), LIMIT = 2400;
const _b = {};
/** Plays a putt forward: the ball of the round hit along `aim` at the k-th step from now. Returns what it is worth; `B.end`: how it ended. */
function tryPutt(st, B, aim, k) {
  const H = HOLES[st.hole], b = Object.assign(_b, st.ball), v = speedOf(gaugeOf(B.gauge[k]), st.far);
  b.vx = Math.sin(aim) * v; b.vz = -Math.cos(aim) * v; b.vy = 0; b.lip = false;
  let c = B.clock[k], code = ROLLS, n = 0;
  for (; n < LIMIT; n++) { c += STEP; code = ballStep(H, b, st.t0 + c, null); if (code !== ROLLS) break; }
  B.sims++;
  B.end = code;
  if (code === HOLED) return (B.safe ? 3 : 1000) - k * 0.01 - n * 0.001;
  if (code === ACID || code === OUT) return -B.here - 7;
  return -farFrom(H, b.x, b.z) - k * 0.002;
}
/** How many steps it takes to turn the aim by `a` radians. */
function turnSteps(a) {
  const [t0, t1, most] = GOLF.turn, tm = (most - t0) / t1, am = t0 * tm + 0.5 * t1 * tm * tm;
  return Math.ceil((a <= am ? (-t0 + Math.sqrt(t0 * t0 + 2 * t1 * a)) / t1 : tm + (a - am) / most) / STEP) + 3;
}

/** The search, a putt at a time (it is taken up again step after step: the bot thinks while the gauge swings). */
function* search(st, B) {
  const H = HOLES[st.hole], way = st.aim, tries = [];
  // the gauge and the clock, step by step, as the round will count them
  let g = st.gauge, c = st.clock;
  B.gauge = [g]; B.clock = [c];
  for (let k = 1; k <= THINK + SWING + 80; k++) { g += STEP / GOLF.sweep; if (g >= 2) g -= 2; c += STEP; B.gauge.push(g); B.clock.push(c); }
  // when to hit: every few steps of a whole swing of the gauge (where nothing moves, each strength once is enough)
  const whens = [], seen = new Set();
  for (let k = THINK + 6; k < THINK + 6 + SWING; k += EVERY) { if (!H.movers.length) { const p = Math.round(gaugeOf(B.gauge[k]) * 26); if (seen.has(p)) continue; seen.add(p); } whens.push(k); }
  const fits = (a, k) => k >= THINK + turnSteps(Math.abs(a - st.aim)) + 1 && k < B.gauge.length - 1;
  const span = B.safe ? 15 : 24, fan = B.safe ? 6 : 4;
  let found = null;
  scan: for (const k of whens) {
    for (let j = 0; j <= span * 2; j++) {
      const a = way + (((j + 1) >> 1) * (j % 2 ? 1 : -1) * fan * Math.PI) / 180;
      if (!fits(a, k)) continue;
      const v = tryPutt(st, B, a, k);
      tries.push({ a, k, v });
      yield;
      if (!B.safe && B.end === HOLED) { found = { a, k, v }; break scan; }
    }
  }
  tries.sort((p, q) => q.v - p.v);
  if (!found && B.safe) {
    // the clumsy one: of the best few, the one that still ends well a little to either side and a little early or late
    const top = [];
    for (const t of tries) { if (top.length >= 6) break; if (top.every((o) => Math.abs(o.a - t.a) > 0.1 || Math.abs(o.k - t.k) > 12)) top.push(t); }
    for (const t of top) {
      let sum = t.v, n = 1;
      for (const [da, dk] of [[0.035, 0], [-0.035, 0], [0, 4], [0, -4]]) { if (!fits(t.a + da, t.k + dk)) continue; sum += tryPutt(st, B, t.a + da, t.k + dk); n++; yield; }
      t.w = sum / n;
      if (!found || t.w > found.w) found = t;
    }
  } else if (!found) {
    // the best few, made finer: a little to either side, a little earlier or later, by smaller and smaller steps
    const top = [];
    for (const t of tries) { if (top.length >= 4) break; if (top.every((o) => Math.abs(o.a - t.a) > 0.1 || Math.abs(o.k - t.k) > 12)) top.push({ ...t }); }
    fine: for (const t of top) {
      for (const [da, dk] of [[2, 3], [1, 2], [0.5, 1], [0.25, 1], [0.12, 1], [0.06, 1]]) {
        for (let again = 0; again < 2; again++) {
          let better = false;
          for (const [sa, sk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const a = t.a + (sa * da * Math.PI) / 180, k = t.k + sk * dk;
            if (!fits(a, k)) continue;
            const v = tryPutt(st, B, a, k);
            yield;
            if (v > t.v) { t.a = a; t.k = k; t.v = v; better = true; if (B.end === HOLED) { found = t; break fine; } }
          }
          if (!better) break;
        }
      }
      if (!found || t.v > found.v) found = t;
      if (found.v > 900) break;
    }
  }
  found ||= { a: way, k: THINK + 40, v: 0 };
  if (B.safe) {
    // … and its hand is not sure
    const n = st.clumsy * 31 + st.total * 7 + st.hole;
    found.a += (hash(n, 1) * 2 - 1) * 0.044;
    found.k = clamp(found.k + Math.round((hash(n, 2) * 2 - 1) * 4), THINK + turnSteps(Math.abs(found.a - st.aim)) + 1, B.gauge.length - 2);
  }
  B.aim = found.a; B.at = B.from + found.k; B.worth = found.v;
}

/** The stick and the jump of the player that plays by itself, for the next step of the round. */
export function botInput(st, out = { x: 0, y: 0, jump: false }) {
  out.x = 0; out.y = 0; out.jump = false;
  if (st.over || st.phase !== 'aim') { st.bot = null; return out; }
  let B = st.bot;
  if (!B || B.stroke !== st.total || B.hole !== st.hole) {
    const H = HOLES[st.hole];
    B = st.bot = { stroke: st.total, hole: st.hole, from: st.steps, safe: !!st.clumsy, sims: 0, here: farFrom(H, st.ball.x, st.ball.z), aim: st.aim, at: Infinity, run: null, left: THINK };
    B.run = search(st, B);
    // (so many putts tried at each step that the search is over when the thinking is)
    B.each = Math.ceil(((H.movers.length ? SWING / EVERY : 27) * (B.safe ? 31 : 49) + 220) / (THINK - 2));
  }
  if (B.run) {
    for (let n = 0; n < B.each; n++) if (B.run.next().done) { B.run = null; break; }
    B.left--;
    if (B.run && B.left <= 0) { while (!B.run.next().done); B.run = null; }
    return out;
  }
  const d = B.aim - st.aim;
  if (Math.abs(d) > 1e-12) {
    // the stick, just so far that the aim gets there
    const dir = d > 0 ? 1 : -1, held = dir === st.dir ? st.held + STEP : STEP;
    out.x = clamp(d / (turnRate(held) * STEP), -1, 1);
    if (Math.abs(out.x) <= 0.02) { out.x = 0; B.aim = st.aim; }
  }
  if (st.steps + 1 >= B.at && Math.abs(B.aim - st.aim - out.x * turnRate(out.x > 0 === st.dir > 0 && st.dir ? st.held + STEP : STEP) * STEP) < 1e-6) out.jump = true;
  return out;
}

/** Plays a round with the bot (`clumsy`: the seed of a clumsy one; 0: the careful one). Returns its state. `limit`: seconds. */
export function botRound(t0 = 0, clumsy = 0, limit = 900, events = null) {
  const st = startRound(t0), input = { x: 0, y: 0, jump: false };
  st.clumsy = clumsy;
  for (let n = 0; n < limit / STEP && !st.over; n++) { botInput(st, input); stepRound(st, STEP, input, events); }
  return st;
}
