// Foliage textures: leaf-clump atlases (2x2 tiles, RGBA) and tileable barks.
import sharp from 'sharp';
import { createCanvas, field, normalize01, saveMaterial, rgb, fbm, perlin, worley, mulberry32, clamp, lerp, smoothstep, mix3, ensureDir } from '../lib/tex.mjs';

const TILE = 512;

// ---------------------------------------------------------------------------
// Leaf shapes (drawn pointing along +x from the origin, unit length)

function shapeOvate(ctx, w, tip = 1) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(0.15, -w * 1.25, 0.7, -w * 0.9, tip, 0);
  ctx.bezierCurveTo(0.7, w * 0.9, 0.15, w * 1.25, 0, 0);
  ctx.closePath();
}
function shapeLobed(ctx, w, lobes, depth) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  const pts = [];
  for (let i = 0; i <= lobes * 2; i++) {
    const t = i / (lobes * 2);
    const env = Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.75 * w;
    pts.push([0.04 + t * 0.96, env * (i % 2 ? 1 : 1 - depth)]);
  }
  for (const [x, y] of pts) ctx.lineTo(x, -y);
  ctx.lineTo(1, 0);
  for (const [x, y] of pts.reverse()) ctx.lineTo(x, y);
  ctx.closePath();
}
function shapePalmate(ctx, w) {
  // five pointed lobes (plane tree / maple-like)
  ctx.beginPath();
  ctx.moveTo(0, 0);
  const lobes = [[-1.15, 0.62], [-0.55, 0.86], [0, 1.0], [0.55, 0.86], [1.15, 0.62]];
  let first = true;
  for (let i = 0; i < lobes.length; i++) {
    const [a, len] = lobes[i];
    const tx = Math.cos(a) * len, ty = Math.sin(a) * len * w * 2.2;
    const a0 = a - 0.3, a1 = a + 0.3;
    const sx0 = Math.cos(a0) * len * 0.42, sy0 = Math.sin(a0) * len * 0.42 * w * 2.2;
    const sx1 = Math.cos(a1) * len * 0.42, sy1 = Math.sin(a1) * len * 0.42 * w * 2.2;
    if (first) { ctx.lineTo(sx0, sy0); first = false; } else ctx.lineTo(sx0, sy0);
    ctx.lineTo(tx, ty);
    ctx.lineTo(sx1, sy1);
  }
  ctx.closePath();
}

function drawLeaf(ctx, x, y, angle, size, kind, c0, c1, vein) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(size, size);
  if (kind.shape === 'lobed') shapeLobed(ctx, kind.w, kind.lobes, kind.depth);
  else if (kind.shape === 'palmate') shapePalmate(ctx, kind.w);
  else shapeOvate(ctx, kind.w, 1);
  const g = ctx.createLinearGradient(0, -kind.w, 0.6, kind.w);
  g.addColorStop(0, rgb(c0)); g.addColorStop(1, rgb(c1));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 0.02;
  ctx.strokeStyle = rgb(vein, 0.75);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(kind.shape === 'palmate' ? 0.9 : 0.95, 0); ctx.stroke();
  if (kind.veins) {
    ctx.lineWidth = 0.012;
    for (let i = 1; i <= kind.veins; i++) {
      const t = i / (kind.veins + 1);
      ctx.beginPath(); ctx.moveTo(t, 0); ctx.lineTo(t + 0.16, -kind.w * 0.75 * Math.sin(Math.PI * t)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(t, 0); ctx.lineTo(t + 0.16, kind.w * 0.75 * Math.sin(Math.PI * t)); ctx.stroke();
    }
  }
  ctx.restore();
}

function clump(ctx, ox, oy, rnd, sp) {
  const cx = ox + TILE / 2, cy = oy + TILE / 2;
  const R = TILE * 0.5;
  // a few twigs showing between the leaves
  ctx.lineCap = 'round';
  for (let i = 0; i < sp.twigs; i++) {
    const a = rnd() * Math.PI * 2, l = R * (0.45 + rnd() * 0.4);
    ctx.strokeStyle = rgb(sp.twig, 1); ctx.lineWidth = 1.5 + rnd() * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(cx + Math.cos(a + 0.3) * l * 0.5, cy + Math.sin(a + 0.3) * l * 0.5, cx + Math.cos(a) * l, cy + Math.sin(a) * l);
    ctx.stroke();
  }
  const n = sp.count;
  for (let i = 0; i < n; i++) {
    const t = i / n; // drawn back to front: later leaves are brighter
    const a = rnd() * Math.PI * 2;
    // radial density: fuller in the middle, ragged rim
    const rr = Math.pow(rnd(), sp.spread) * R * sp.fill;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * sp.squash;
    const size = sp.size * TILE * (0.7 + rnd() * 0.6) * (1 - 0.25 * (rr / R));
    const dir = a + (rnd() - 0.5) * sp.splay + (sp.droop ? 0 : 0);
    const shade = lerp(0.55, 1.12, t) * (0.85 + rnd() * 0.3);
    const hue = rnd();
    let base = mix3(sp.dark, sp.mid, clamp(t * 1.2));
    let tip = mix3(sp.mid, sp.light, clamp(t * 1.1 + (rnd() - 0.5) * 0.4));
    if (hue < sp.accentRate) { base = mix3(base, sp.accent, 0.45); tip = mix3(tip, sp.accent, 0.7); }
    base = base.map((v) => v * shade); tip = tip.map((v) => v * shade);
    drawLeaf(ctx, x, y, dir, size, sp.kind, base, tip, mix3(base, [20, 30, 10], 0.45));
  }
}

function needles(ctx, ox, oy, rnd, sp) {
  const cx = ox + TILE / 2, cy = oy + TILE / 2;
  const R = TILE * 0.47;
  ctx.lineCap = 'round';
  const fans = sp.fans;
  for (let f = 0; f < fans; f++) {
    const t = f / fans;
    const a = rnd() * Math.PI * 2;
    const rr = Math.pow(rnd(), 0.7) * R * 0.62;
    const fx = cx + Math.cos(a) * rr, fy = cy + Math.sin(a) * rr;
    // short woody shoot
    ctx.strokeStyle = rgb(sp.twig); ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * rr * 0.5, cy + Math.sin(a) * rr * 0.5); ctx.lineTo(fx, fy); ctx.stroke();
    const count = sp.perFan;
    const len = R * sp.len * (0.75 + rnd() * 0.5);
    for (let i = 0; i < count; i++) {
      const na = a + (rnd() - 0.5) * sp.splay;
      const l = len * (0.6 + rnd() * 0.5);
      const shade = lerp(0.5, 1.15, t) * (0.8 + rnd() * 0.4);
      const c = mix3(sp.dark, rnd() < sp.accentRate ? sp.accent : sp.light, rnd() * 0.9).map((v) => v * shade);
      ctx.strokeStyle = rgb(c); ctx.lineWidth = sp.thick * (0.7 + rnd() * 0.6);
      ctx.beginPath(); ctx.moveTo(fx, fy);
      ctx.quadraticCurveTo(fx + Math.cos(na + 0.12) * l * 0.55, fy + Math.sin(na + 0.12) * l * 0.55, fx + Math.cos(na) * l, fy + Math.sin(na) * l);
      ctx.stroke();
    }
  }
}

function strands(ctx, ox, oy, rnd, sp) {
  // hanging willow whips: the top of the tile is where the strands attach
  const n = sp.strands;
  for (let s = 0; s < n; s++) {
    const t = s / n;
    let x = ox + TILE * (0.12 + 0.76 * rnd()), y = oy + TILE * (0.02 + rnd() * 0.1);
    const len = TILE * (0.6 + rnd() * 0.36);
    const sway = (rnd() - 0.5) * 0.35;
    const steps = 22;
    const shade = lerp(0.6, 1.1, t) * (0.85 + rnd() * 0.3);
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      pts.push([x + Math.sin(u * 2.2 + s) * 9 + sway * u * TILE * 0.3, y + u * len]);
    }
    ctx.strokeStyle = rgb(sp.twig.map((v) => v * shade)); ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) ctx.lineTo(p[0], p[1]);
    ctx.stroke();
    for (let i = 1; i < pts.length; i++) {
      for (const side of [-1, 1]) {
        if (rnd() < 0.12) continue;
        const [px, py] = pts[i];
        const a = Math.PI / 2 + side * (0.5 + rnd() * 0.5);
        const size = sp.size * TILE * (0.7 + rnd() * 0.6) * (1 - 0.3 * (i / pts.length));
        const base = mix3(sp.dark, sp.mid, clamp(t + rnd() * 0.3)).map((v) => v * shade);
        const tip = mix3(sp.mid, rnd() < sp.accentRate ? sp.accent : sp.light, rnd()).map((v) => v * shade);
        drawLeaf(ctx, px, py, a, size, sp.kind, base, tip, mix3(base, [30, 40, 12], 0.4));
      }
    }
  }
}

function fronds(ctx, ox, oy, rnd, sp) {
  // one palm frond per tile, growing from the left edge towards the right
  const y0 = oy + TILE / 2;
  const x0 = ox + TILE * 0.03, x1 = ox + TILE * 0.97;
  ctx.lineCap = 'round';
  const n = 46;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const px = lerp(x0, x1, t);
      const len = TILE * 0.42 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.12)) ** 0.6 * (0.85 + rnd() * 0.3);
      for (const side of [-1, 1]) {
        const a = side * (1.25 - t * 0.75 + (rnd() - 0.5) * 0.12);
        const shade = (pass ? 1.05 : 0.7) * (0.85 + rnd() * 0.3);
        const c = mix3(sp.dark, sp.light, rnd() * 0.8 + 0.1).map((v) => v * shade);
        ctx.strokeStyle = rgb(c); ctx.lineWidth = TILE * 0.017 * (1 - t * 0.5);
        const ex = px + Math.cos(a) * len, ey = y0 + Math.sin(a) * len;
        ctx.beginPath(); ctx.moveTo(px, y0);
        ctx.quadraticCurveTo(px + Math.cos(a) * len * 0.6, y0 + Math.sin(a) * len * 0.5, ex, ey + Math.abs(Math.sin(a)) * len * 0.12 * 0);
        ctx.stroke();
      }
    }
  }
  ctx.strokeStyle = rgb(sp.twig); ctx.lineWidth = TILE * 0.02;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();
}

/** Flowering shrub: a leafy clump with heads of small blossoms on top. */
function blossoms(ctx, ox, oy, rnd, sp) {
  clump(ctx, ox, oy, rnd, sp);
  const cx = ox + TILE / 2, cy = oy + TILE / 2;
  for (let h = 0; h < sp.heads; h++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * TILE * 0.3;
    const hx = cx + Math.cos(a) * rr, hy = cy + Math.sin(a) * rr;
    const R = TILE * (0.07 + rnd() * 0.035);
    const tone = rnd();
    for (let i = 0; i < 16; i++) {
      const b = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R;
      const x = hx + Math.cos(b) * d, y = hy + Math.sin(b) * d;
      const r = TILE * (0.02 + rnd() * 0.012);
      const c = mix3(sp.petal[0], sp.petal[1], clamp(tone * 0.6 + rnd() * 0.5));
      // five rounded petals around a darker heart
      for (let k = 0; k < 5; k++) {
        const pa = b + (k / 5) * Math.PI * 2;
        ctx.fillStyle = rgb(c.map((v) => v * (0.86 + 0.14 * (k % 2))));
        ctx.beginPath(); ctx.ellipse(x + Math.cos(pa) * r * 0.55, y + Math.sin(pa) * r * 0.55, r * 0.62, r * 0.46, pa, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = rgb(sp.heart); ctx.beginPath(); ctx.arc(x, y, r * 0.22, 0, Math.PI * 2); ctx.fill();
    }
  }
}

const OVATE = (w, veins = 4) => ({ shape: 'ovate', w, veins });
export const LEAF_SPECIES = {
  oak: { draw: clump, count: 105, size: 0.21, spread: 0.62, fill: 0.74, squash: 1, splay: 1.3, twigs: 5, twig: [70, 54, 38], accentRate: 0.1,
    kind: { shape: 'lobed', w: 0.3, lobes: 4, depth: 0.32, veins: 0 }, dark: [30, 60, 22], mid: [58, 100, 34], light: [106, 146, 54], accent: [150, 162, 62] },
  beech: { draw: clump, count: 120, size: 0.17, spread: 0.6, fill: 0.76, squash: 1, splay: 1.1, twigs: 5, twig: [84, 72, 58], accentRate: 0.14,
    kind: OVATE(0.26, 5), dark: [44, 82, 26], mid: [82, 128, 40], light: [136, 172, 62], accent: [176, 186, 76] },
  birch: { draw: clump, count: 150, size: 0.105, spread: 0.55, fill: 0.78, squash: 1, splay: 1.6, twigs: 7, twig: [60, 46, 36], accentRate: 0.22,
    kind: OVATE(0.34, 3), dark: [62, 98, 30], mid: [108, 146, 46], light: [160, 188, 70], accent: [204, 196, 78] },
  plane: { draw: clump, count: 64, size: 0.3, spread: 0.6, fill: 0.72, squash: 1, splay: 1.2, twigs: 4, twig: [92, 80, 62], accentRate: 0.12,
    kind: { shape: 'palmate', w: 0.4, veins: 0 }, dark: [42, 76, 26], mid: [78, 118, 40], light: [124, 158, 60], accent: [168, 170, 70] },
  willow: { draw: strands, strands: 9, size: 0.085, twig: [124, 132, 60], accentRate: 0.25,
    kind: OVATE(0.13, 0), dark: [70, 104, 34], mid: [118, 150, 54], light: [168, 190, 84], accent: [196, 200, 104] },
  pine: { draw: needles, fans: 26, perFan: 46, len: 0.5, splay: 1.7, thick: 2.6, twig: [90, 62, 44], accentRate: 0.15,
    dark: [20, 50, 30], light: [70, 116, 60], accent: [110, 140, 70] },
  cypress: { draw: needles, fans: 70, perFan: 26, len: 0.2, splay: 2.6, thick: 4.2, twig: [70, 56, 40], accentRate: 0.1,
    dark: [16, 42, 26], light: [54, 96, 52], accent: [84, 118, 62] },
  palm: { draw: fronds, twig: [120, 136, 60], dark: [40, 84, 30], light: [112, 156, 58] },
  // garden shrubs: small glossy leaves, packed tight; the second one carries flower heads
  bush: { draw: clump, count: 210, size: 0.105, spread: 0.52, fill: 0.82, squash: 1, splay: 1.5, twigs: 3, twig: [58, 46, 34], accentRate: 0.1,
    kind: OVATE(0.38, 2), dark: [22, 50, 24], mid: [46, 88, 38], light: [90, 132, 58], accent: [128, 152, 66] },
  bloom: { draw: blossoms, count: 170, size: 0.115, spread: 0.52, fill: 0.8, squash: 1, splay: 1.5, twigs: 3, twig: [58, 46, 34], accentRate: 0.08,
    kind: OVATE(0.4, 3), dark: [26, 56, 26], mid: [52, 96, 40], light: [96, 138, 60], accent: [132, 156, 70],
    heads: 7, petal: [[232, 132, 170], [252, 214, 228]], heart: [250, 226, 120] },
};

/** Spread opaque colours into the transparent area so mip-mapping never shows dark halos. */
function bleed(px, W, H, iters = 10) {
  const a = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) a[i] = px[i * 4 + 3] > 96 ? 1 : 0;
  for (let it = 0; it < iters; it++) {
    const add = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (a[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (a[j]) { r += px[j * 4]; g += px[j * 4 + 1]; b += px[j * 4 + 2]; n++; }
      }
      if (n) add.push(i, r / n, g / n, b / n);
    }
    for (let k = 0; k < add.length; k += 4) {
      const i = add[k]; px[i * 4] = add[k + 1]; px[i * 4 + 1] = add[k + 2]; px[i * 4 + 2] = add[k + 3]; a[i] = 1;
    }
  }
  // anything still untouched gets the average colour
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < W * H; i++) if (px[i * 4 + 3] > 96) { r += px[i * 4]; g += px[i * 4 + 1]; b += px[i * 4 + 2]; n++; }
  r /= n; g /= n; b /= n;
  for (let i = 0; i < W * H; i++) if (!a[i]) { px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; }
  return [r, g, b];
}

async function leafAtlas(dir, name, sp, seed, log) {
  const S = TILE * 2;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const rnd = mulberry32(seed);
  for (let t = 0; t < 4; t++) {
    const ox = (t % 2) * TILE, oy = ((t / 2) | 0) * TILE;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox + 3, oy + 3, TILE - 6, TILE - 6); ctx.clip();
    sp.draw(ctx, ox, oy, rnd, sp);
    ctx.restore();
  }
  const img = ctx.getImageData(0, 0, S, S);
  const avg = bleed(img.data, S, S, 12);
  const buf = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  ensureDir(`${dir}/x`);
  for (const size of [1024, 512]) {
    await sharp(buf, { raw: { width: S, height: S, channels: 4 } }).resize(size, size, { kernel: 'lanczos3' }).webp({ quality: 88, alphaQuality: 100, effort: 5 }).toFile(`${dir}/leaf_${name}_${size}.webp`);
  }
  log(`foliage/leaf_${name}`);
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return avg.map((v) => Math.round(lin(v) * 1000) / 1000);
}

// ---------------------------------------------------------------------------
// Barks (tile around the trunk in u, along it in v)

function barkFurrowed(S, seed, { ridge, dark, light, moss, cells = 9, stretch = 4 }) {
  const colour = new Float32Array(S * S * 3), height = new Float32Array(S * S);
  for (let y = 0, i = 0; y < S; y++) for (let x = 0; x < S; x++, i++) {
    const u = x / S, v = y / S;
    const wu = u + 0.03 * fbm(u * 4, v * 3, { seed, octaves: 3, period: 0 }) * 0 + 0.035 * perlin(u * 4, v * 3, seed + 1, 0) * 0;
    const warp = 0.05 * fbm(u * 4, v * 2, { seed: seed + 2, octaves: 3, period: 2 });
    const w = worley((u + warp) * cells, v * (cells / stretch), seed, 0, 1);
    // period-safe version: sample a tileable cellular field by wrapping u manually
    const wt = worley(((u + warp) % 1) * cells, v * Math.round(cells / stretch), seed + 3, cells, 1);
    const e = wt.f2 - wt.f1;
    const plate = smoothstep(0.0, 0.5, e) ** 0.85;
    const grain = fbm(u * 40, v * 9, { seed: seed + 5, octaves: 3, period: 0 }) * 0 + perlin(u * 48, v * 10, seed + 6, 48) * 0.5 + perlin(u * 16, v * 5, seed + 7, 16) * 0.5;
    const h = clamp(plate * (0.7 + 0.3 * ((wt.id * 3.7) % 1)) + grain * 0.14);
    let c = mix3(dark, mix3(ridge, light, clamp(grain * 0.5 + 0.5)), clamp(h * 1.15));
    const m = smoothstep(0.15, 0.55, fbm(u * 3, v * 3, { seed: seed + 9, octaves: 3, period: 3 })) * (0.4 + 0.6 * plate);
    c = mix3(c, moss, m * 0.55);
    colour[i * 3] = c[0]; colour[i * 3 + 1] = c[1]; colour[i * 3 + 2] = c[2];
    height[i] = h + w.f1 * 0;
  }
  return { colour, height };
}

function barkSmooth(S, seed, { base, patch, patch2, lenticel }) {
  const colour = new Float32Array(S * S * 3), height = new Float32Array(S * S);
  for (let y = 0, i = 0; y < S; y++) for (let x = 0; x < S; x++, i++) {
    const u = x / S, v = y / S;
    const big = fbm(u * 3, v * 3, { seed, octaves: 4, period: 3 });
    // flaking plates: ragged patches at two scales
    const p1 = fbm(u * 4, v * 3, { seed: seed + 1, octaves: 4, period: 0, gain: 0.55 });
    const pa = fbm(u * 4, v * 4, { seed: seed + 1, octaves: 4, period: 4, gain: 0.55 });
    const pb = fbm(u * 6, v * 5, { seed: seed + 2, octaves: 4, period: 0, gain: 0.55 });
    const pc = fbm(u * 6, v * 6, { seed: seed + 2, octaves: 4, period: 6, gain: 0.55 });
    const blot = smoothstep(0.12, 0.2, pa);
    const blot2 = smoothstep(0.2, 0.27, pc) * (1 - blot);
    const len = smoothstep(0.03, 0.0, Math.abs(perlin(u * 9, v * 44, seed + 4, 44))) * smoothstep(0.1, 0.5, perlin(u * 6, v * 6, seed + 5, 6));
    const grain = perlin(u * 60, v * 60, seed + 6, 60);
    let c = mix3(base.map((k) => k * 0.82), base, clamp(0.5 + big * 0.8 + grain * 0.15));
    c = mix3(c, patch, blot * 0.75);
    c = mix3(c, patch2, blot2 * 0.8);
    c = mix3(c, lenticel, len * 0.8);
    colour[i * 3] = c[0]; colour[i * 3 + 1] = c[1]; colour[i * 3 + 2] = c[2];
    height[i] = clamp(0.5 + big * 0.2 + grain * 0.06 - len * 0.25 + blot * 0.1 - blot2 * 0.06 + (p1 + pb) * 0);
  }
  return { colour, height };
}

function barkBirch(S, seed) {
  const colour = new Float32Array(S * S * 3), height = new Float32Array(S * S);
  for (let y = 0, i = 0; y < S; y++) for (let x = 0; x < S; x++, i++) {
    const u = x / S, v = y / S;
    const big = fbm(u * 3, v * 3, { seed, octaves: 4, period: 3 });
    // dark horizontal lenticels and a few big scars
    const streak = smoothstep(0.05, 0.0, Math.abs(perlin(u * 5, v * 36, seed + 2, 36))) * smoothstep(-0.1, 0.4, perlin(u * 7 + 3.1, v * 7, seed + 3, 7));
    const wt = worley(u * 3, v * 4, seed + 4, 3, 1);
    const scar = smoothstep(0.2, 0.1, Math.hypot((wt.cx - u * 3) * 0.45, (wt.cy - v * 4) * 1.5)) * (wt.id > 0.55 ? 1 : 0);
    const peel = smoothstep(0.02, 0.0, Math.abs(perlin(u * 4, v * 22, seed + 6, 22) - 0.25)) * 0.6;
    let c = mix3([196, 190, 178], [236, 232, 222], clamp(0.5 + big * 0.9));
    c = mix3(c, [150, 138, 120], peel * 0.6);
    c = mix3(c, [40, 36, 34], clamp(streak * 0.9 + scar));
    colour[i * 3] = c[0]; colour[i * 3 + 1] = c[1]; colour[i * 3 + 2] = c[2];
    height[i] = clamp(0.6 + big * 0.12 - streak * 0.3 - scar * 0.35 + peel * 0.15);
  }
  return { colour, height };
}

export async function bakeFoliage(dir, log) {
  const info = { leaf: {}, bark: {} };
  let seed = 1000;
  for (const [name, sp] of Object.entries(LEAF_SPECIES)) info.leaf[name] = { avg: await leafAtlas(dir, name, sp, seed += 37, log) };
  const S = 512;
  const barks = {
    oak: () => barkFurrowed(S, 11, { ridge: [104, 92, 78], dark: [72, 62, 53], light: [130, 118, 102], moss: [84, 96, 60], cells: 14, stretch: 5 }),
    pine: () => barkFurrowed(S, 22, { ridge: [146, 98, 70], dark: [72, 46, 36], light: [174, 126, 92], moss: [120, 96, 70], cells: 8, stretch: 3 }),
    smooth: () => barkSmooth(S, 33, { base: [150, 144, 130], patch: [178, 172, 148], patch2: [108, 116, 90], lenticel: [86, 80, 72] }),
    birch: () => barkBirch(S, 44),
    palm: () => barkFurrowed(S, 55, { ridge: [134, 112, 88], dark: [56, 44, 36], light: [164, 142, 112], moss: [110, 100, 78], cells: 6, stretch: 0.5 }),
  };
  for (const [name, gen] of Object.entries(barks)) {
    const { colour, height } = gen();
    normalize01(height);
    await saveMaterial(dir, `bark_${name}`, S, colour, height, { normalStrength: name === 'smooth' || name === 'birch' ? 2.0 : 5.5, cavityAmount: 0.6 });
    log(`foliage/bark_${name}`);
  }
  return info;
}
