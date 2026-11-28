// The Diver's Rest: where it stands and what its rock is. A stack of rock on the bed of the bay — solid to the eye
// from the shore and from above — hollow inside: an arch at its foot, six metres under the waterline, a passage
// that runs under the rock, a chimney, and a chamber where the sea comes up into a pocket of air: a pool, a strand.
//
// The ground of the world cannot be dug while the game runs (its caves are baked: tools/bake-world.mjs), so the
// rock is its own: ONE function says where it is solid — solid(u, y, w) — and everything is drawn from it: what is
// seen (mesh(): surface nets), what stops a diver (the same function), what stops a walker or a swimmer of the
// game (walls(): rings of small obstacles; top(), strand(): what one stands on), what the camera may not cross.
// Nothing here knows the 3D library: the checks read it as it is (tools/dive-test.mjs).
//
// Its own frame: u runs out to sea through the mouth, w across (the strand is on the +w side), y is up (m over the sea).
export const DEEP = {
  name: "The Diver's Rest",
  at: { x: 202, z: 58 }, // the middle of the rock: in the south-east of the bay, on a bed seven and a half metres down
  yaw: 0.3, // the way its mouth looks, radians from east (+x) towards south (+z): out to sea, away from the beaches and the pier
  r: 15, // nothing of it is further from its middle than that (m) …
  low: -8.8, high: 9.2, // … nor lower, nor higher
  mouth: { u: 11.4, y: -6.2, w: 0.2 }, // the middle of the arch
  pool: { u: -0.9, w: -2.0 }, // where the chimney comes up into the pool
  rest: { u: -1.6, w: 4.3 }, // the middle of the strand
};
const CA = Math.cos(DEEP.yaw), SA = Math.sin(DEEP.yaw);
/** A point of the world (x, z) in the frame of the rock: [u, w]. */
export const toLocal = (x, z) => { const dx = x - DEEP.at.x, dz = z - DEEP.at.z; return [dx * CA + dz * SA, -dx * SA + dz * CA]; };
/** …and back: [x, z]. */
export const toWorld = (u, w) => [DEEP.at.x + u * CA - w * SA, DEEP.at.z + u * SA + w * CA];

// ---- the shapes (each: negative inside, about metres)
// an ellipsoid [centre u, y, w, radii u, y, w]
const ell = (u, y, w, e) => {
  const pu = (u - e[0]) / e[3], py = (y - e[1]) / e[4], pw = (w - e[2]) / e[5], k0 = Math.sqrt(pu * pu + py * py + pw * pw);
  if (k0 < 1e-5) return -Math.min(e[3], e[4], e[5]);
  const qu = pu / e[3], qy = py / e[4], qw = pw / e[5];
  return (k0 * (k0 - 1)) / Math.sqrt(qu * qu + qy * qy + qw * qw);
};
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// (the same rock in every browser: a hash of whole numbers, no sine)
const hash = (x, y, z) => { let n = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
function noise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let fx = x - xi, fy = y - yi, fz = z - zi;
  fx *= fx * (3 - 2 * fx); fy *= fy * (3 - 2 * fy); fz *= fz * (3 - 2 * fz);
  const a = hash(xi, yi, zi), b = hash(xi + 1, yi, zi), c = hash(xi, yi + 1, zi), d = hash(xi + 1, yi + 1, zi);
  const e = hash(xi, yi, zi + 1), f = hash(xi + 1, yi, zi + 1), g = hash(xi, yi + 1, zi + 1), h = hash(xi + 1, yi + 1, zi + 1);
  const p = a + (b - a) * fx, q = c + (d - c) * fx, r = e + (f - e) * fx, s = g + (h - g) * fx;
  const lo = p + (q - p) * fy, hi = r + (s - r) * fy;
  return lo + (hi - lo) * fz;
}

// the stack: a dome, the talus at its foot, a shoulder, a tooth
const DOME = [-0.4, -3.2, 0, 10.2, 11.5, 9.8], TALUS = [0, -8.6, 0, 13.0, 3.4, 12.6], SHOULDER = [-5.6, -2.5, 5.4, 5.2, 6.4, 4.8], TOOTH = [7.0, -2.0, -6.2, 3.4, 9.6, 3.4];
/** The stack without its hollow, smooth: negative inside. */
export const hull = (u, y, w) => smin(smin(smin(ell(u, y, w, DOME), ell(u, y, w, TALUS), 2.2), ell(u, y, w, SHOULDER), 1.0), ell(u, y, w, TOOTH), 0.8);
// the chamber, and its floor: the bottom of the pool, a bank, then the strand (dry from w = 2.2 or so)
const CHAMBER = [-1.0, 1.2, 0.3, 6.2, 4.6, 6.0];
/** The floor of the chamber at (u, w): the bed of its pool, the bank, the sand of the strand (m over the sea). */
export const strand = (u, w) => -2.7 + 2.55 * sm(-1.5, 1.6, w) + 0.7 * sm(1.2, 4.4, w);
/** Is (u, w) under the vault of the chamber (a little short of its walls)? */
export const inChamber = (u, w, shrink = 0) => ((u - CHAMBER[0]) / (CHAMBER[3] - shrink)) ** 2 + ((w - CHAMBER[2]) / (CHAMBER[5] - shrink)) ** 2 < 1;
// the way in: from the arch, under the rock, and up the chimney into the pool — [u, y, w, radius]
export const WAY = [[13.5, -6.3, 0.6, 2.3], [8.5, -6.2, -0.4, 2.05], [4.0, -6.1, -1.6, 1.9], [0.2, -6.0, -2.3, 1.95], [-0.9, -3.6, -2.2, 1.85], [-0.9, -1.6, -2.0, 1.9]];
function way(u, y, w) {
  let best = Infinity;
  for (let k = 0; k + 1 < WAY.length; k++) {
    const a = WAY[k], b = WAY[k + 1], du = b[0] - a[0], dy = b[1] - a[1], dw = b[2] - a[2];
    let t = ((u - a[0]) * du + (y - a[1]) * dy + (w - a[2]) * dw) / (du * du + dy * dy + dw * dw);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const pu = u - a[0] - du * t, py = y - a[1] - dy * t, pw = w - a[2] - dw * t, d = Math.sqrt(pu * pu + py * py + pw * pw) - (a[3] + (b[3] - a[3]) * t);
    if (d < best) best = d;
  }
  return best;
}
/** The hollow: negative in the passage, the chimney and the chamber (without the roughness of the rock). */
export const hollow = (u, y, w) => smin(Math.max(ell(u, y, w, CHAMBER), (strand(u, w) - y) * 0.7), way(u, y, w), 0.9);

/** The rock: negative where it is solid, positive in the water, the air, and its own hollow — about metres to its face. */
export function solid(u, y, w) {
  let o = hull(u, y, w);
  if (o > 3) return o - 1.2; // (far outside: its roughness is less than that)
  const n1 = noise(u * 0.31 + 7.3, y * 0.36, w * 0.31 - 2.1) - 0.5, n2 = noise(u * 0.9, y * 0.9 + 3.7, w * 0.9) - 0.5;
  o += n1 * 1.5 + (0.5 - Math.abs(n2) * 2) * 0.7; // (swells, and cracks where the fine grain turns)
  return Math.max(o, -(hollow(u, y, w) + n1 * 0.3 + n2 * 0.3));
}
/** Which way out of the rock at a point (the slope of solid()): written to `out` ({ u, y, w }), of length one. */
export function away(u, y, w, out) {
  const e = 0.12, du = solid(u + e, y, w) - solid(u - e, y, w), dy = solid(u, y + e, w) - solid(u, y - e, w), dw = solid(u, y, w + e) - solid(u, y, w - e), l = Math.hypot(du, dy, dw) || 1;
  out.u = du / l; out.y = dy / l; out.w = dw / l;
  return out;
}
/** In the cave — the passage, the chimney, the chamber — and not merely near the rock? */
export const inCave = (u, y, w) => u * u + w * w < DEEP.r * DEEP.r && y < DEEP.high && hull(u, y, w) < -0.4 && hollow(u, y, w) < 0.5;
/** Open water over (u, y, w) all the way up, and air over the water: one can come up there. */
export function airOver(u, y, w) {
  if (u * u + w * w > DEEP.r * DEEP.r) return true;
  for (let h = Math.min(y + 0.6, 1.3); h <= 1.3; h += 0.6) if (solid(u, h, w) < 0.35) return false;
  return solid(u, 1.3, w) >= 0.35;
}

// ---- the rock on a grid of `cell` metres (worked out once: what is drawn and what one stands on are read from it)
export const CELL = 0.5;
let lattice = null;
/** solid() at every point of the grid, slab after slab: `slabs` of them at a go (the rest at the next call) → true when done. */
export function grid(cell = CELL, slabs = Infinity) {
  const R = DEEP.r;
  if (!lattice || lattice.cell !== cell) { const nx = Math.round((2 * R) / cell) + 1, ny = Math.round((DEEP.high - DEEP.low) / cell) + 1; lattice = { cell, nx, ny, nz: nx, val: new Float32Array(nx * ny * nx), done: 0 }; }
  const g = lattice;
  for (let n = 0; g.done < g.nz && n < slabs; g.done++, n++) {
    const k = g.done, w = -R + k * cell;
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) g.val[(k * g.ny + j) * g.nx + i] = solid(-R + i * cell, DEEP.low + j * cell, w);
  }
  return slabs === Infinity ? g : g.done >= g.nz;
}

// ---- what is drawn: the face of the rock, as a mesh (surface nets on that grid)
/**
 * → { position, normal, uv (Float32Array, in the frame of the rock: u, y, w), rock, cave (indices: the outside, the
 * inside), count }. A vertex in every cell the face crosses, a quad across every edge of the grid that goes through it.
 */
export function mesh(cell = CELL) {
  const R = DEEP.r, { nx, ny, nz, val } = grid(cell), at = (i, j, k) => (k * ny + j) * nx + i;
  const cx = nx - 1, cy = ny - 1, cz = nz - 1, cellAt = (i, j, k) => (k * cy + j) * cx + i;
  const point = new Float32Array(cx * cy * cz * 3), grad = new Float32Array(cx * cy * cz * 3), has = new Uint8Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const v = [val[at(i, j, k)], val[at(i + 1, j, k)], val[at(i, j + 1, k)], val[at(i + 1, j + 1, k)], val[at(i, j, k + 1)], val[at(i + 1, j, k + 1)], val[at(i, j + 1, k + 1)], val[at(i + 1, j + 1, k + 1)]];
    let neg = 0;
    for (let c = 0; c < 8; c++) if (v[c] < 0) neg++;
    if (neg === 0 || neg === 8) continue;
    // where the face crosses the twelve edges of the cell: the vertex is their middle
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let a = 0; a < 8; a++) for (let d = 1; d < 8; d <<= 1) {
      const b = a | d;
      if (a & d || (v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += (a & 1) + (d === 1 ? t : 0); sy += ((a >> 1) & 1) + (d === 2 ? t : 0); sz += ((a >> 2) & 1) + (d === 4 ? t : 0); n++;
    }
    const q = cellAt(i, j, k) * 3;
    point[q] = -R + (i + sx / n) * cell; point[q + 1] = DEEP.low + (j + sy / n) * cell; point[q + 2] = -R + (k + sz / n) * cell;
    grad[q] = v[1] + v[3] + v[5] + v[7] - v[0] - v[2] - v[4] - v[6]; grad[q + 1] = v[2] + v[3] + v[6] + v[7] - v[0] - v[1] - v[4] - v[5]; grad[q + 2] = v[4] + v[5] + v[6] + v[7] - v[0] - v[1] - v[2] - v[3];
    has[cellAt(i, j, k)] = 1;
  }
  // (a vertex is written once for each of the three ways its rock texture may be laid: along u, y or w)
  const id = new Int32Array(cx * cy * cz * 3).fill(-1), position = [], normal = [], uv = [], rock = [], cave = [];
  const vert = (c, axis) => {
    let n = id[c * 3 + axis];
    if (n >= 0) return n;
    const q = c * 3, x = point[q], y = point[q + 1], z = point[q + 2], l = Math.hypot(grad[q], grad[q + 1], grad[q + 2]) || 1;
    n = id[c * 3 + axis] = position.length / 3;
    position.push(x, y, z); normal.push(grad[q] / l, grad[q + 1] / l, grad[q + 2] / l);
    if (axis === 0) uv.push(z, y); else if (axis === 1) uv.push(x, z); else uv.push(x, y);
    return n;
  };
  const quad = (a, b, c, d, axis, flip) => {
    if (!(has[a] && has[b] && has[c] && has[d])) return;
    const q = [vert(a, axis), vert(b, axis), vert(c, axis), vert(d, axis)];
    // (inside or outside: by the hollow at the middle of the quad)
    const mu = (point[a * 3] + point[c * 3]) / 2, my = (point[a * 3 + 1] + point[c * 3 + 1]) / 2, mw = (point[a * 3 + 2] + point[c * 3 + 2]) / 2;
    const list = hollow(mu, my, mw) < 0.75 && hull(mu, my, mw) < -0.2 ? cave : rock;
    if (flip) list.push(q[0], q[2], q[1], q[0], q[3], q[2]); else list.push(q[0], q[1], q[2], q[0], q[2], q[3]);
  };
  for (let k = 1; k < cz; k++) for (let j = 1; j < cy; j++) for (let i = 1; i < cx; i++) {
    const v0 = val[at(i, j, k)] < 0;
    if (v0 !== (val[at(i + 1, j, k)] < 0)) quad(cellAt(i, j - 1, k - 1), cellAt(i, j, k - 1), cellAt(i, j, k), cellAt(i, j - 1, k), 0, !v0);
    if (v0 !== (val[at(i, j + 1, k)] < 0)) quad(cellAt(i - 1, j, k - 1), cellAt(i - 1, j, k), cellAt(i, j, k), cellAt(i, j, k - 1), 1, !v0);
    if (v0 !== (val[at(i, j, k + 1)] < 0)) quad(cellAt(i - 1, j - 1, k), cellAt(i, j - 1, k), cellAt(i, j, k), cellAt(i - 1, j, k), 2, !v0);
  }
  return { position: new Float32Array(position), normal: new Float32Array(normal), uv: new Float32Array(uv), rock, cave, count: position.length / 3 };
}

// ---- what the game's own walker, swimmer and camera meet (they know obstacles that stand, and floors: Collision.js)
export const WALL = 0.55;
let tables = null;
function build() {
  const R = DEEP.r, g = grid(), n = g.nx, top = new Float32Array(n * n).fill(-99);
  // the top of the rock over each spot (seen from above: the first rock a stone dropped from the sky meets)
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
    for (let j = g.ny - 2; j >= 0 && DEEP.low + j * g.cell > -1.2; j--) {
      const s = g.val[(k * g.ny + j) * n + i];
      if (s < 0) { const a = g.val[(k * g.ny + j + 1) * n + i]; top[k * n + i] = DEEP.low + (j + 1 - a / (a - s)) * g.cell; break; }
    }
  }
  // where one cannot be at the height of the water or of the strand: a body of rock in the way, from the feet to the head
  const m = Math.round((2 * R) / 1) + 1, shut = new Uint8Array(m * m), circles = [];
  const stand = (u, w) => (inChamber(u, w, 0.3) ? Math.max(strand(u, w), -1.05) : -1.05);
  for (let k = 0; k < m; k++) for (let i = 0; i < m; i++) {
    const u = -R + i, w = -R + k, h = stand(u, w);
    shut[k * m + i] = solid(u, h + 0.45, w) < 0.2 || solid(u, h + 1.2, w) < 0.2 || solid(u, h + 1.9, w) < 0.2 || solid(u, h + 2.5, w) < 0.2 ? 1 : 0; // (and room over the head for an eye)
  }
  for (let k = 0; k < m; k++) for (let i = 0; i < m; i++) {
    if (!shut[k * m + i]) continue;
    let edge = false; // (only the rock one can come up against: two cells from where one can be)
    for (let b = -2; b <= 2 && !edge; b++) for (let a = -2; a <= 2; a++) { const p = i + a, q = k + b; if (p < 0 || q < 0 || p >= m || q >= m || !shut[q * m + p]) { edge = true; break; } }
    if (edge) circles.push([-R + i, -R + k]);
  }
  return { n, top, circles };
}
/** The top of the rock over (u, w) — what one who drops onto it stands on —, or null where the sea is open. */
export function top(u, w) {
  tables ||= build();
  const { n, top: t } = tables, R = DEEP.r, fi = (u + R) / CELL, fk = (w + R) / CELL, i = Math.floor(fi), k = Math.floor(fk);
  if (i < 0 || k < 0 || i >= n - 1 || k >= n - 1) return null;
  const a = t[k * n + i], b = t[k * n + i + 1], c = t[(k + 1) * n + i], d = t[(k + 1) * n + i + 1];
  if (a < -50 || b < -50 || c < -50 || d < -50) return null;
  const x = fi - i, z = fk - k;
  return a + (b - a) * x + (c - a) * z + (a - b - c + d) * x * z;
}
/** The rock as the game's walker and swimmer meet it: [[u, w], …], the middles of round obstacles (WALL m in radius). */
export const walls = () => (tables ||= build()).circles;
