// Procedural texture toolkit (tileable fields, height -> normal, canvas helpers).
import { createCanvas } from '@napi-rs/canvas';
import { fbm, perlin, worley, mulberry32 } from './noise.mjs';
import { savePng, saveWebp, ensureDir } from './img.mjs';

export { fbm, perlin, worley, mulberry32, createCanvas };
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Scalar field sampled over the unit square: fn(u, v, x, y) -> value. */
export function field(S, fn) {
  const d = new Float32Array(S * S);
  for (let y = 0, i = 0; y < S; y++) for (let x = 0; x < S; x++, i++) d[i] = fn(x / S, y / S, x, y);
  return d;
}

export function normalize01(d) {
  let lo = Infinity, hi = -Infinity;
  for (const v of d) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const k = 1 / Math.max(hi - lo, 1e-9);
  for (let i = 0; i < d.length; i++) d[i] = (d[i] - lo) * k;
  return d;
}

/** Wrapping separable gaussian blur. */
export function blurWrap(d, S, sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(S * S), out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += d[y * S + ((x + i + S * 8) % S)] * k[i + r];
    tmp[y * S + x] = s;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) s += tmp[((y + i + S * 8) % S) * S + x] * k[i + r];
    out[y * S + x] = s;
  }
  return out;
}

/** Tangent-space normal (xy in -1..1) from a tileable height field. */
export function normalFromHeight(h, S, strength = 4) {
  const n = new Float32Array(S * S * 2);
  for (let y = 0; y < S; y++) {
    const ym = ((y - 1 + S) % S) * S, yp = ((y + 1) % S) * S, y0 = y * S;
    for (let x = 0; x < S; x++) {
      const xm = (x - 1 + S) % S, xp = (x + 1) % S;
      const dx = (h[y0 + xp] - h[y0 + xm]) * 0.5 + (h[ym + xp] - h[ym + xm] + h[yp + xp] - h[yp + xm]) * 0.25;
      const dy = (h[yp + x] - h[ym + x]) * 0.5 + (h[yp + xm] - h[ym + xm] + h[yp + xp] - h[ym + xp]) * 0.25;
      const nx = -dx * strength, ny = -dy * strength;
      const l = Math.hypot(nx, ny, 1);
      n[(y0 + x) * 2] = nx / l;
      n[(y0 + x) * 2 + 1] = ny / l;
    }
  }
  return n;
}

/** Cavity / ambient shading factor from a height field (1 = open, <1 = crevice). */
export function cavity(h, S, radius = 4, strength = 1.6) {
  const b = blurWrap(h, S, radius);
  const out = new Float32Array(S * S);
  for (let i = 0; i < out.length; i++) out[i] = clamp(1 + (h[i] - b[i]) * strength, 0.25, 1.25);
  return out;
}

/** Canvas whose drawing calls are repeated across the edges so the result tiles. */
export function tileCanvas(S) {
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const wrap = (x, y, r, draw) => {
    for (const ox of x < r ? [0, S] : x > S - r ? [0, -S] : [0]) {
      for (const oy of y < r ? [0, S] : y > S - r ? [0, -S] : [0]) {
        ctx.save();
        ctx.translate(ox, oy);
        draw(ctx);
        ctx.restore();
      }
    }
  };
  const pixels = () => ctx.getImageData(0, 0, S, S).data;
  return { canvas, ctx, wrap, pixels };
}

export const rgb = (c, a = 1) => `rgba(${Math.round(clamp(c[0], 0, 255))},${Math.round(clamp(c[1], 0, 255))},${Math.round(clamp(c[2], 0, 255))},${a})`;

/** Read a canvas channel as a float field in 0..1. */
export function channel(pix, S, c = 0) {
  const d = new Float32Array(S * S);
  for (let i = 0; i < d.length; i++) d[i] = pix[i * 4 + c] / 255;
  return d;
}

export function resizeRGB(buf, S, S2, ch = 3) {
  // box filter downscale by an integer factor
  const f = S / S2;
  const out = new Uint8Array(S2 * S2 * ch);
  for (let y = 0; y < S2; y++) for (let x = 0; x < S2; x++) for (let c = 0; c < ch; c++) {
    let s = 0;
    for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += buf[((y * f + j) * S + x * f + i) * ch + c];
    out[(y * S2 + x) * ch + c] = Math.round(s / (f * f));
  }
  return out;
}

/**
 * Save a material as two opaque images: <name>_c (sRGB colour) and <name>_n (normal xy + height).
 * colour: Float32Array S*S*3 in 0..255 (sRGB), height: 0..1, sizes: output resolutions.
 */
export async function saveMaterial(dir, name, S, colour, height, { normalStrength = 4, sizes = [S], cavityAmount = 0.5, quality = 86, normalHeight = null } = {}) {
  const nh = normalHeight || height;
  const n = normalFromHeight(nh, S, normalStrength * (S / 512));
  const cav = cavityAmount > 0 ? cavity(height, S, S / 180, 1.8) : null;
  const c8 = new Uint8Array(S * S * 3), n8 = new Uint8Array(S * S * 3);
  for (let i = 0; i < S * S; i++) {
    const k = cav ? lerp(1, cav[i], cavityAmount) : 1;
    c8[i * 3] = clamp(colour[i * 3] * k, 0, 255);
    c8[i * 3 + 1] = clamp(colour[i * 3 + 1] * k, 0, 255);
    c8[i * 3 + 2] = clamp(colour[i * 3 + 2] * k, 0, 255);
    n8[i * 3] = Math.round((n[i * 2] * 0.5 + 0.5) * 255);
    n8[i * 3 + 1] = Math.round((n[i * 2 + 1] * 0.5 + 0.5) * 255);
    n8[i * 3 + 2] = Math.round(clamp(height[i]) * 255);
  }
  for (const s of sizes) {
    const sub = sizes.length > 1 ? `${dir}/${s}` : dir;
    const c = s === S ? c8 : resizeRGB(c8, S, s), nn = s === S ? n8 : resizeRGB(n8, S, s);
    await saveWebp(`${sub}/${name}_c.webp`, c, s, s, 3, { quality });
    await saveWebp(`${sub}/${name}_n.webp`, nn, s, s, 3, { quality: Math.min(95, quality + 6) });
  }
}

export { savePng, saveWebp, ensureDir };
