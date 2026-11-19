// Ground materials: lawn, meadow, forest floor, dirt, rock, sand, gravel, tilled soil.
import { field, normalize01, blurWrap, tileCanvas, rgb, channel, saveMaterial, fbm, perlin, worley, mulberry32, clamp, lerp, smoothstep, mix3 } from '../lib/tex.mjs';

const S = 1024;

function blades(seed, { count, len, width, deep, mid, top, accent, accentRate, bg, curl = 0.5, bias = null }) {
  const col = tileCanvas(S), hgt = tileCanvas(S);
  const rnd = mulberry32(seed);
  col.ctx.fillStyle = rgb(bg); col.ctx.fillRect(0, 0, S, S);
  hgt.ctx.fillStyle = '#000'; hgt.ctx.fillRect(0, 0, S, S);
  // mottled soil / thatch under the blades
  for (let i = 0; i < 900; i++) {
    const x = rnd() * S, y = rnd() * S, r = 8 + rnd() * 26;
    const c = mix3(bg, deep, rnd());
    col.wrap(x, y, r, (ctx) => { ctx.fillStyle = rgb(c, 0.35); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); });
  }
  const layers = 6;
  for (let l = 0; l < layers; l++) {
    const t = l / (layers - 1);
    const n = Math.round((count / layers) * (1.25 - 0.5 * t));
    for (let i = 0; i < n; i++) {
      const x = rnd() * S, y = rnd() * S;
      const a = bias !== null ? bias + (rnd() - 0.5) * 2.2 : rnd() * Math.PI * 2;
      const L = len * (0.55 + rnd() * 0.9) * (0.8 + 0.4 * t);
      const w = width * (0.6 + rnd() * 0.8);
      const bend = (rnd() - 0.5) * curl * L;
      const dx = Math.cos(a), dy = Math.sin(a);
      const tx = x + dx * L, ty = y + dy * L;
      const cx = x + dx * L * 0.55 - dy * bend, cy = y + dy * L * 0.55 + dx * bend;
      const nx = -dy * w * 0.5, ny = dx * w * 0.5;
      let base = mix3(deep, mid, clamp(t * 1.3 + (rnd() - 0.5) * 0.3));
      let tip = mix3(mid, top, clamp(t * 1.1 + (rnd() - 0.5) * 0.4));
      if (rnd() < accentRate * (0.4 + t)) { tip = mix3(tip, accent, 0.5 + rnd() * 0.5); base = mix3(base, accent, 0.25); }
      const path = (ctx) => {
        ctx.beginPath();
        ctx.moveTo(x + nx, y + ny);
        ctx.quadraticCurveTo(cx + nx * 0.6, cy + ny * 0.6, tx, ty);
        ctx.quadraticCurveTo(cx - nx * 0.6, cy - ny * 0.6, x - nx, y - ny);
        ctx.closePath();
      };
      col.wrap(x, y, L + 4, (ctx) => {
        const g = ctx.createLinearGradient(x, y, tx, ty);
        g.addColorStop(0, rgb(base)); g.addColorStop(1, rgb(tip));
        ctx.fillStyle = g; path(ctx); ctx.fill();
      });
      hgt.wrap(x, y, L + 4, (ctx) => {
        const g = ctx.createLinearGradient(x, y, tx, ty);
        const h0 = Math.round(40 + 150 * t), h1 = Math.round(Math.min(255, h0 + 70));
        g.addColorStop(0, `rgb(${h0},${h0},${h0})`); g.addColorStop(1, `rgb(${h1},${h1},${h1})`);
        ctx.fillStyle = g; path(ctx); ctx.fill();
      });
    }
  }
  const pix = col.pixels();
  const colour = new Float32Array(S * S * 3);
  // broad tonal variation so the tile does not look uniform from afar
  for (let i = 0; i < S * S; i++) {
    const u = (i % S) / S, v = ((i / S) | 0) / S;
    const m = 1 + 0.12 * fbm(u * 3, v * 3, { seed: seed + 5, octaves: 3, period: 3 });
    colour[i * 3] = pix[i * 4] * m; colour[i * 3 + 1] = pix[i * 4 + 1] * m; colour[i * 3 + 2] = pix[i * 4 + 2] * (2 - m);
  }
  return { colour, height: blurWrap(channel(hgt.pixels(), S), S, 0.8) };
}

function leafPath(ctx, x, y, a, L, W, lobes) {
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  ctx.beginPath();
  ctx.moveTo(x - dx * L * 0.5, y - dy * L * 0.5);
  if (lobes) {
    // wavy (oak-like) outline
    const steps = 7;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const w = Math.sin(t * Math.PI) ** 0.7 * W * (0.75 + 0.35 * (s % 2));
      ctx.lineTo(x + dx * L * (t - 0.5) + nx * w, y + dy * L * (t - 0.5) + ny * w);
    }
    for (let s = steps - 1; s >= 0; s--) {
      const t = s / steps;
      const w = Math.sin(t * Math.PI) ** 0.7 * W * (0.75 + 0.35 * (s % 2));
      ctx.lineTo(x + dx * L * (t - 0.5) - nx * w, y + dy * L * (t - 0.5) - ny * w);
    }
  } else {
    ctx.quadraticCurveTo(x + nx * W * 1.25, y + ny * W * 1.25, x + dx * L * 0.5, y + dy * L * 0.5);
    ctx.quadraticCurveTo(x - nx * W * 1.25, y - ny * W * 1.25, x - dx * L * 0.5, y - dy * L * 0.5);
  }
  ctx.closePath();
}

function forestFloor(seed) {
  const col = tileCanvas(S), hgt = tileCanvas(S);
  const rnd = mulberry32(seed);
  // humus
  const base = field(S, (u, v) => fbm(u * 6, v * 6, { seed, octaves: 5, period: 6 }));
  const img = col.ctx.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const t = clamp(0.5 + base[i] * 0.9);
    const c = mix3([34, 25, 17], [66, 49, 32], t);
    img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
  }
  col.ctx.putImageData(img, 0, 0);
  hgt.ctx.fillStyle = 'rgb(30,30,30)'; hgt.ctx.fillRect(0, 0, S, S);
  // moss cushions
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 90;
    const c = mix3([52, 74, 24], [84, 104, 36], rnd());
    for (const [cv, colr] of [[col, rgb(c, 0.55)], [hgt, 'rgba(120,120,120,0.5)']]) {
      cv.wrap(x, y, r, (ctx) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, colr); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      });
    }
  }
  const palette = [[122, 72, 30], [150, 104, 44], [92, 60, 34], [62, 43, 28], [168, 134, 82], [136, 84, 36], [104, 66, 30], [86, 96, 40], [180, 150, 70]];
  const N = 3400;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    const x = rnd() * S, y = rnd() * S, a = rnd() * 7;
    const L = 26 + rnd() * 30, W = L * (0.2 + rnd() * 0.16);
    const c0 = palette[(rnd() * palette.length) | 0];
    const k = 0.7 + 0.5 * rnd();
    const c = [c0[0] * k, c0[1] * k, c0[2] * k];
    const lob = rnd() < 0.55;
    // contact shadow, then the leaf, then its midrib
    col.wrap(x, y, L, (ctx) => {
      ctx.fillStyle = 'rgba(12,8,5,0.42)'; leafPath(ctx, x + 2.5, y + 3, a, L, W, lob); ctx.fill();
      const g = ctx.createLinearGradient(x - Math.sin(a) * W, y + Math.cos(a) * W, x + Math.sin(a) * W, y - Math.cos(a) * W);
      g.addColorStop(0, rgb([c[0] * 0.8, c[1] * 0.8, c[2] * 0.8])); g.addColorStop(1, rgb([c[0] * 1.12, c[1] * 1.1, c[2] * 1.05]));
      ctx.fillStyle = g; leafPath(ctx, x, y, a, L, W, lob); ctx.fill();
      ctx.strokeStyle = rgb([c[0] * 0.6, c[1] * 0.58, c[2] * 0.55], 0.9); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * L * 0.5, y - Math.sin(a) * L * 0.5); ctx.lineTo(x + Math.cos(a) * L * 0.46, y + Math.sin(a) * L * 0.46); ctx.stroke();
    });
    hgt.wrap(x, y, L, (ctx) => {
      const hv = Math.round(70 + 160 * t);
      ctx.fillStyle = `rgb(${hv},${hv},${hv})`; leafPath(ctx, x, y, a, L, W, lob); ctx.fill();
      ctx.strokeStyle = `rgb(${hv + 20},${hv + 20},${hv + 20})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * L * 0.5, y - Math.sin(a) * L * 0.5); ctx.lineTo(x + Math.cos(a) * L * 0.46, y + Math.sin(a) * L * 0.46); ctx.stroke();
    });
    if (i % 45 === 0) {
      // twig
      const tx = rnd() * S, ty = rnd() * S, ta = rnd() * 7, tl = 70 + rnd() * 170;
      const ex = tx + Math.cos(ta) * tl, ey = ty + Math.sin(ta) * tl;
      const mx = (tx + ex) / 2 + (rnd() - 0.5) * 30, my = (ty + ey) / 2 + (rnd() - 0.5) * 30;
      for (const [cv, st, lw] of [[col, rgb([58 + rnd() * 30, 42 + rnd() * 20, 28]), 2.5 + rnd() * 3], [hgt, 'rgb(235,235,235)', 3.5]]) {
        cv.wrap((tx + ex) / 2, (ty + ey) / 2, tl, (ctx) => { ctx.strokeStyle = st; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke(); });
      }
    }
  }
  const pix = col.pixels();
  const colour = new Float32Array(S * S * 3);
  for (let i = 0; i < S * S; i++) { colour[i * 3] = pix[i * 4]; colour[i * 3 + 1] = pix[i * 4 + 1]; colour[i * 3 + 2] = pix[i * 4 + 2]; }
  return { colour, height: blurWrap(channel(hgt.pixels(), S), S, 1.0) };
}

function stones(seed, { cells, palette, gap, gapDepth = 0.5, jitter = 1, fine = null }) {
  const colour = new Float32Array(S * S * 3), height = new Float32Array(S * S);
  for (let y = 0, i = 0; y < S; y++) for (let x = 0; x < S; x++, i++) {
    const u = x / S, v = y / S;
    const wu = u + 0.012 * perlin(u * 9, v * 9, seed + 1, 9), wv = v + 0.012 * perlin(u * 9 + 3.3, v * 9, seed + 2, 9);
    const w = worley(wu * cells, wv * cells, seed, cells, jitter);
    const e = w.f2 - w.f1;
    let h = smoothstep(0.0, 0.42, e) ** 0.6;
    const dome = clamp(1 - w.f1 * 1.15);
    h *= 0.55 + 0.45 * dome;
    const base = palette[Math.floor(w.id * palette.length) % palette.length];
    const shade = 0.82 + 0.3 * ((w.id * 7.31) % 1);
    const grain = 1 + 0.1 * perlin(u * 150, v * 150, seed + 9, 150) + 0.08 * perlin(u * 37, v * 37, seed + 10, 37);
    let c = [base[0] * shade * grain, base[1] * shade * grain, base[2] * shade * grain];
    const g = smoothstep(0.02, 0.2, e);
    c = mix3(gap, c, g);
    if (fine) {
      // small grit filling the joints
      const w2 = worley(u * fine.cells, v * fine.cells, seed + 50, fine.cells, 1);
      const e2 = w2.f2 - w2.f1;
      const fc = fine.palette[Math.floor(w2.id * fine.palette.length) % fine.palette.length];
      const k = (1 - g) * smoothstep(0.02, 0.25, e2);
      c = mix3(c, fc, k);
      h = Math.max(h, k * 0.35 * smoothstep(0, 0.4, e2));
    }
    colour[i * 3] = c[0]; colour[i * 3 + 1] = c[1]; colour[i * 3 + 2] = c[2];
    height[i] = lerp(1 - gapDepth, 1, h);
  }
  return { colour, height };
}

function dirt(seed) {
  const colour = new Float32Array(S * S * 3), height = new Float32Array(S * S);
  for (let y = 0, i = 0; y < S; y++) for (let x = 0; x < S; x++, i++) {
    const u = x / S, v = y / S;
    const a = fbm(u * 5, v * 5, { seed, octaves: 5, period: 5 });
    const b = fbm(u * 28, v * 28, { seed: seed + 3, octaves: 4, period: 28 });
    const g = perlin(u * 190, v * 190, seed + 5, 190);
    // pebbles of two sizes, only some cells carry one
    const w1 = worley(u * 22, v * 22, seed + 7, 22, 1), w2 = worley(u * 58, v * 58, seed + 8, 58, 1);
    const p1 = w1.id > 0.7 ? smoothstep(0.3, 0.12, w1.f1) : 0;
    const p2 = w2.id > 0.62 ? smoothstep(0.3, 0.14, w2.f1) : 0;
    const damp = smoothstep(0.05, 0.45, fbm(u * 3, v * 3, { seed: seed + 11, octaves: 3, period: 3 }));
    // fine root-like fissures along cell borders, broken up
    const cw = worley(u * 9 + 0.03 * b, v * 9, seed + 13, 9, 1);
    const crack = smoothstep(0.035, 0.0, cw.f2 - cw.f1) * smoothstep(-0.1, 0.25, a) * 0.6;
    let c = mix3([72, 52, 34], [124, 96, 66], clamp(0.5 + a * 0.75 + b * 0.3 + g * 0.08));
    c = mix3(c, [52, 38, 26], damp * 0.45 + crack);
    const pc1 = mix3([150, 138, 120], [98, 90, 80], (w1.id * 13.7) % 1), pc2 = mix3([136, 122, 102], [88, 80, 70], (w2.id * 7.7) % 1);
    c = mix3(c, pc1, p1 * 0.95);
    c = mix3(c, pc2, p2 * 0.9);
    colour[i * 3] = c[0]; colour[i * 3 + 1] = c[1]; colour[i * 3 + 2] = c[2];
    height[i] = clamp(0.42 + a * 0.3 + b * 0.14 + g * 0.03 - crack * 0.35 + p1 * 0.4 + p2 * 0.22);
  }
  return { colour, height };
}

function rock(seed) {
  const colour = new Float32Array(S * S * 3), height = new Float32Array(S * S);
  for (let y = 0, i = 0; y < S; y++) for (let x = 0; x < S; x++, i++) {
    const u = x / S, v = y / S;
    const warp = fbm(u * 3, v * 3, { seed: seed + 1, octaves: 3, period: 3 }) * 0.22;
    // schist: thin, slightly wavy beds
    const beds = fbm(u * 3, (v + warp * 0.16) * 20, { seed, octaves: 4, period: 20 });
    const fine = perlin(u * 6, (v + warp * 0.16) * 64, seed + 4, 64);
    const big = fbm(u * 4, v * 4, { seed: seed + 2, octaves: 4, period: 4 });
    // fracture network: borders of large warped cells
    const cw = worley(u * 5 + warp, v * 5 + warp * 0.6, seed + 8, 5, 1);
    const crack = smoothstep(0.03, 0.0, cw.f2 - cw.f1);
    const block = ((cw.id * 5.3) % 1 - 0.5) * 0.22; // each block sits a little higher or lower
    const h = clamp(0.5 + beds * 0.42 + fine * 0.1 + big * 0.22 + block - crack * 0.5);
    let c = mix3([70, 66, 66], [140, 132, 122], clamp(0.5 + beds * 0.8 + big * 0.35 + block));
    c = mix3(c, [132, 100, 72], smoothstep(0.08, 0.5, fbm(u * 7, v * 7, { seed: seed + 5, octaves: 3, period: 7 })) * 0.5); // iron staining
    // lichen: ragged pale blotches
    const lf = fbm(u * 10, v * 10, { seed: seed + 6, octaves: 4, period: 10 }) + 0.35 * perlin(u * 70, v * 70, seed + 12, 70);
    const lichen = smoothstep(0.28, 0.5, lf);
    const yel = smoothstep(0.3, 0.55, fbm(u * 13 + 4.2, v * 13, { seed: seed + 14, octaves: 3, period: 13 }) + 0.3 * perlin(u * 90, v * 90, seed + 15, 90));
    c = mix3(c, [152, 160, 138], lichen * 0.6);
    c = mix3(c, [168, 150, 78], yel * 0.5);
    c = mix3(c, [38, 34, 32], crack * 0.85);
    colour[i * 3] = c[0]; colour[i * 3 + 1] = c[1]; colour[i * 3 + 2] = c[2];
    height[i] = h;
  }
  return { colour, height };
}

function sand(seed) {
  const colour = new Float32Array(S * S * 3), height = new Float32Array(S * S);
  for (let y = 0, i = 0; y < S; y++) for (let x = 0; x < S; x++, i++) {
    const u = x / S, v = y / S;
    const warp = fbm(u * 4, v * 4, { seed, octaves: 3, period: 4 });
    const ripple = Math.sin((v * 16 + warp * 1.6 + Math.sin(u * Math.PI * 4) * 0.12) * Math.PI * 2) * 0.5 + 0.5;
    const grain = perlin(u * 260, v * 260, seed + 3, 260) * 0.5 + perlin(u * 120, v * 120, seed + 4, 120) * 0.5;
    const big = fbm(u * 3, v * 3, { seed: seed + 6, octaves: 3, period: 3 });
    const w = worley(u * 60, v * 60, seed + 9, 60, 1);
    const speck = smoothstep(0.1, 0.03, w.f1) * (w.id > 0.8 ? 1 : 0);
    let c = mix3([196, 176, 138], [232, 216, 180], clamp(0.5 + ripple * 0.22 + big * 0.5 + grain * 0.3));
    c = mix3(c, w.id > 0.93 ? [245, 240, 228] : [120, 104, 84], speck * 0.8);
    colour[i * 3] = c[0]; colour[i * 3 + 1] = c[1]; colour[i * 3 + 2] = c[2];
    height[i] = clamp(0.35 + ripple * 0.4 + grain * 0.08 + big * 0.15 + speck * 0.1);
  }
  return { colour, height };
}

function soil(seed) {
  const colour = new Float32Array(S * S * 3), height = new Float32Array(S * S);
  for (let y = 0, i = 0; y < S; y++) for (let x = 0; x < S; x++, i++) {
    const u = x / S, v = y / S;
    const warp = fbm(u * 3, v * 3, { seed, octaves: 3, period: 3 }) * 0.05;
    const furrow = Math.sin((v + warp) * Math.PI * 2 * 9) * 0.5 + 0.5;
    const w = worley(u * 40, v * 40 + furrow * 0.2, seed + 2, 40, 1);
    const clod = smoothstep(0.5, 0.1, w.f1) * (0.4 + 0.6 * ((w.id * 9.1) % 1));
    const grain = fbm(u * 60, v * 60, { seed: seed + 4, octaves: 3, period: 60 });
    const h = clamp(furrow * 0.6 + clod * 0.3 + grain * 0.12);
    let c = mix3([58, 40, 28], [128, 98, 70], clamp(h * 0.85 + grain * 0.2 + 0.08));
    const straw = smoothstep(0.03, 0.0, Math.abs(perlin(u * 30, v * 110, seed + 7, 30))) * smoothstep(0.2, 0.6, perlin(u * 9, v * 9, seed + 8, 9));
    c = mix3(c, [176, 150, 96], straw * 0.5);
    colour[i * 3] = c[0]; colour[i * 3 + 1] = c[1]; colour[i * 3 + 2] = c[2];
    height[i] = h;
  }
  return { colour, height };
}

export const LAYERS = ['lawn', 'meadow', 'forest', 'dirt', 'rock', 'sand', 'gravel', 'soil'];

export async function bakeTerrain(dir, log) {
  const info = {};
  const gens = {
    lawn: () => blades(101, { count: 52000, len: 26, width: 4.2, deep: [30, 52, 16], mid: [58, 100, 28], top: [104, 150, 46], accent: [150, 170, 64], accentRate: 0.12, bg: [40, 44, 20], curl: 0.35 }),
    meadow: () => blades(202, { count: 36000, len: 44, width: 4.6, deep: [44, 58, 20], mid: [86, 112, 36], top: [140, 160, 62], accent: [196, 180, 104], accentRate: 0.3, bg: [52, 46, 24], curl: 0.6, bias: 0.6 }),
    forest: () => forestFloor(303),
    dirt: () => dirt(404),
    rock: () => rock(505),
    sand: () => sand(606),
    gravel: () => stones(707, { cells: 34, palette: [[196, 180, 150], [156, 150, 142], [182, 158, 126], [118, 112, 106], [218, 210, 196], [170, 162, 148]], gap: [74, 62, 50], gapDepth: 0.6, fine: { cells: 96, palette: [[168, 152, 128], [130, 124, 116], [198, 186, 164]] } }),
    soil: () => soil(808),
  };
  const strength = { lawn: 3.2, meadow: 3.4, forest: 3.0, dirt: 3.0, rock: 5.0, sand: 1.6, gravel: 4.2, soil: 4.5 };
  const cav = { lawn: 0.55, meadow: 0.55, forest: 0.35, dirt: 0.5, rock: 0.6, sand: 0.3, gravel: 0.55, soil: 0.6 };
  for (const name of LAYERS) {
    const { colour, height } = gens[name]();
    normalize01(height);
    await saveMaterial(dir, name, S, colour, height, { normalStrength: strength[name], sizes: [1024, 512], cavityAmount: cav[name] });
    // average linear colour (used to normalise the macro variation in the shader)
    let r = 0, g = 0, b = 0;
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    for (let i = 0; i < S * S; i += 7) { r += lin(colour[i * 3]); g += lin(colour[i * 3 + 1]); b += lin(colour[i * 3 + 2]); }
    const n = Math.ceil((S * S) / 7);
    info[name] = { avg: [r / n, g / n, b / n].map((v) => Math.round(v * 1000) / 1000) };
    log(`terrain/${name}`);
  }
  return info;
}
