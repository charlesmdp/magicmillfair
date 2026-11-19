// Pure-math spline helpers shared by the runtime and the offline bakers (no three.js).

/** Centripetal-ish Catmull-Rom on 2D/3D/ND point arrays. Returns `out` point. */
function catmull(p0, p1, p2, p3, t, out) {
  const t2 = t * t, t3 = t2 * t;
  for (let k = 0; k < p1.length; k++) {
    out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  }
  return out;
}

/**
 * Densify a control polygon with a Catmull-Rom spline.
 * @param {number[][]} pts control points (any dimension, extra components are interpolated too)
 * @param {object} o { closed, step } step = approximate spacing of output samples in the XZ plane
 */
export function smoothPath(pts, { closed = false, step = 1 } = {}) {
  const n = pts.length;
  const out = [];
  const get = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const m = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j < m; j++) out.push(catmull(p0, p1, p2, p3, j / m, new Array(p1.length)));
  }
  if (!closed) out.push(pts[n - 1].slice());
  return out;
}

/** Resample a polyline at constant arc-length spacing (in the first two components). */
export function resample(pts, spacing) {
  const out = [pts[0].slice()];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1], b = pts[i];
    let seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (acc + seg >= spacing && seg > 1e-9) {
      const t = (spacing - acc) / seg;
      const p = a.map((v, k) => v + (b[k] - v) * t);
      out.push(p);
      a = p;
      seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      acc = 0;
    }
    acc += seg;
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > spacing * 0.25) out.push(last.slice());
  else out[out.length - 1] = last.slice();
  return out;
}

/** Cumulative arc length (first two components). */
export function arcLengths(pts) {
  const s = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) s[i] = s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}

/** Closest point on a polyline: returns { d, i, t, x, z } (i = segment index, t in [0,1]). */
export function closestOnPolyline(pts, x, z) {
  let best = { d: Infinity, i: 0, t: 0, x: pts[0][0], z: pts[0][1] };
  for (let i = 0; i + 1 < pts.length; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, i, t, x: px, z: pz };
  }
  return best;
}

export function pointInPolygon(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
