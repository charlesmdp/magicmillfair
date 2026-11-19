// Small numeric toolkit for the offline bakers: float grids, blurs, distance fields.

export class Grid {
  constructor(w, h, fill = 0) {
    this.w = w;
    this.h = h;
    this.d = new Float32Array(w * h);
    if (fill !== 0) this.d.fill(fill);
  }

  static from(w, h, fn) {
    const g = new Grid(w, h);
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) g.d[i] = fn(x, y);
    return g;
  }

  clone() {
    const g = new Grid(this.w, this.h);
    g.d.set(this.d);
    return g;
  }

  get(x, y) {
    x = x < 0 ? 0 : x >= this.w ? this.w - 1 : x;
    y = y < 0 ? 0 : y >= this.h ? this.h - 1 : y;
    return this.d[y * this.w + x];
  }

  /** Bilinear sample at continuous pixel coordinates (pixel centres at integers). */
  sample(x, y) {
    const w = this.w, h = this.h;
    if (x < 0) x = 0; else if (x > w - 1) x = w - 1;
    if (y < 0) y = 0; else if (y > h - 1) y = h - 1;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = x0 + 1 < w ? x0 + 1 : x0, y1 = y0 + 1 < h ? y0 + 1 : y0;
    const fx = x - x0, fy = y - y0;
    const d = this.d;
    const a = d[y0 * w + x0], b = d[y0 * w + x1], c = d[y1 * w + x0], e = d[y1 * w + x1];
    return (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
  }

  /** Bicubic (Catmull-Rom) sample. */
  sampleCubic(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const wx = cubicWeights(fx), wy = cubicWeights(fy);
    let s = 0;
    for (let j = 0; j < 4; j++) {
      let r = 0;
      for (let i = 0; i < 4; i++) r += wx[i] * this.get(x0 - 1 + i, y0 - 1 + j);
      s += wy[j] * r;
    }
    return s;
  }

  map(fn) {
    const g = new Grid(this.w, this.h);
    const d = this.d, o = g.d;
    for (let i = 0; i < d.length; i++) o[i] = fn(d[i], i);
    return g;
  }

  apply(fn) {
    const d = this.d;
    for (let i = 0; i < d.length; i++) d[i] = fn(d[i], i);
    return this;
  }

  minmax() {
    let lo = Infinity, hi = -Infinity;
    for (const v of this.d) { if (v < lo) lo = v; if (v > hi) hi = v; }
    return [lo, hi];
  }

  /** Separable gaussian blur (clamped borders). */
  blur(sigma) {
    if (sigma <= 0) return this.clone();
    const r = Math.max(1, Math.ceil(sigma * 3));
    const k = new Float32Array(2 * r + 1);
    let sum = 0;
    for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r]; }
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    const w = this.w, h = this.h;
    const tmp = new Float32Array(w * h), out = new Grid(w, h);
    const d = this.d;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let i = -r; i <= r; i++) {
          let xx = x + i; if (xx < 0) xx = 0; else if (xx >= w) xx = w - 1;
          s += d[row + xx] * k[i + r];
        }
        tmp[row + x] = s;
      }
    }
    const o = out.d;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let i = -r; i <= r; i++) {
          let yy = y + i; if (yy < 0) yy = 0; else if (yy >= h) yy = h - 1;
          s += tmp[yy * w + x] * k[i + r];
        }
        o[y * w + x] = s;
      }
    }
    return out;
  }

  /** Resize with bilinear filtering (pixel-centre aligned). */
  resize(w2, h2) {
    const g = new Grid(w2, h2);
    const sx = this.w / w2, sy = this.h / h2;
    for (let y = 0, i = 0; y < h2; y++) for (let x = 0; x < w2; x++, i++) {
      g.d[i] = this.sample((x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5);
    }
    return g;
  }
}

function cubicWeights(t) {
  const t2 = t * t, t3 = t2 * t;
  return [
    -0.5 * t3 + t2 - 0.5 * t,
    1.5 * t3 - 2.5 * t2 + 1,
    -1.5 * t3 + 2 * t2 + 0.5 * t,
    0.5 * t3 - 0.5 * t2,
  ];
}

// ---------------------------------------------------------------------------
// Distance transforms

const INF = 1e20;

function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s;
    do {
      const p = v[k];
      s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
    } while (s <= z[k] && --k >= 0);
    k++;
    v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k];
    d[q] = (q - p) * (q - p) + f[p];
  }
}

/** Exact euclidean distance (in pixels) to the nearest pixel where mask != 0. */
export function distanceTo(mask, w, h) {
  const g = new Float64Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = mask[i] ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) g[y * w + x] = d[x];
  }
  const out = new Grid(w, h);
  for (let i = 0; i < g.length; i++) out.d[i] = Math.sqrt(g[i]);
  return out;
}

/**
 * Signed distance (pixels) from a binary mask: negative inside, positive outside.
 * Half-pixel corrected so that the zero level sits on the mask boundary.
 */
export function signedDistance(mask, w, h) {
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
  const outside = distanceTo(mask, w, h);
  const inside = distanceTo(inv, w, h);
  const g = new Grid(w, h);
  for (let i = 0; i < g.d.length; i++) g.d[i] = mask[i] ? -(inside.d[i] - 0.5) : outside.d[i] - 0.5;
  return g;
}

/** Even-odd scanline fill of a polygon given in pixel coordinates. Sets mask to `value`. */
export function fillPolygon(mask, w, h, pts, value = 1) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const ya = Math.max(0, Math.floor(y0)), yb = Math.min(h - 1, Math.ceil(y1));
  const xs = [];
  for (let y = ya; y <= yb; y++) {
    const yc = y; // sample at pixel centre (integer coords = centres)
    xs.length = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) {
        xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k])), xb = Math.min(w - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) mask[y * w + x] = value;
    }
  }
}

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const smootherstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
