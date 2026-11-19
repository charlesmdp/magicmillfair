// Deterministic noise helpers shared by the bakers (no dependencies).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/** Tileable gradient noise in [-1,1]. `period` (integer lattice cells) of 0 disables tiling. */
export function perlin(x, y, seed = 0, period = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const wrap = (v) => (period > 0 ? ((v % period) + period) % period : v);
  const g = (ix, iy, dx, dy) => {
    const a = hash2(wrap(ix), wrap(iy), seed) * Math.PI * 2;
    return Math.cos(a) * dx + Math.sin(a) * dy;
  };
  const u = fade(fx), v = fade(fy);
  const n00 = g(x0, y0, fx, fy), n10 = g(x0 + 1, y0, fx - 1, fy);
  const n01 = g(x0, y0 + 1, fx, fy - 1), n11 = g(x0 + 1, y0 + 1, fx - 1, fy - 1);
  return (n00 + (n10 - n00) * u + (n01 + (n11 - n01) * u - (n00 + (n10 - n00) * u)) * v) * 1.41421356;
}

/** Fractal noise in roughly [-1,1]. */
export function fbm(x, y, { seed = 0, octaves = 5, lacunarity = 2, gain = 0.5, period = 0 } = {}) {
  let amp = 1, sum = 0, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * perlin(x * f, y * f, seed + o * 131, period > 0 ? Math.round(period * f) : 0);
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

export function ridged(x, y, opts = {}) {
  const { seed = 0, octaves = 5, lacunarity = 2, gain = 0.5, period = 0 } = opts;
  let amp = 1, sum = 0, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(perlin(x * f, y * f, seed + o * 131, period > 0 ? Math.round(period * f) : 0));
    sum += amp * n * n;
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

/**
 * Tileable cellular noise. Returns { f1, f2, id, cx, cy } for the nearest feature points.
 * `jitter` in [0,1].
 */
export function worley(x, y, seed = 0, period = 0, jitter = 1) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 1e9, f2 = 1e9, id = 0, cx = 0, cy = 0;
  const wrap = (v) => (period > 0 ? ((v % period) + period) % period : v);
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = xi + i, gy = yi + j;
      const wx = wrap(gx), wy = wrap(gy);
      const px = gx + 0.5 + (hash2(wx, wy, seed) - 0.5) * jitter;
      const py = gy + 0.5 + (hash2(wx, wy, seed + 77) - 0.5) * jitter;
      const dx = px - x, dy = py - y;
      const d = dx * dx + dy * dy;
      if (d < f1) { f2 = f1; f1 = d; id = hash2(wx, wy, seed + 911); cx = px; cy = py; }
      else if (d < f2) f2 = d;
    }
  }
  return { f1: Math.sqrt(f1), f2: Math.sqrt(f2), id, cx, cy };
}
