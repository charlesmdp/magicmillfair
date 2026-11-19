// Small plants atlas (4 x 4 tiles, RGBA): waterside plants, ferns, wildflowers, garden flowers, lily pads.
import sharp from 'sharp';
import { createCanvas, rgb, mulberry32, clamp, lerp, mix3, ensureDir } from '../lib/tex.mjs';

const T = 512; // tile size while drawing (the atlas is downsampled afterwards)

function blade(ctx, x0, y0, len, lean, w, c0, c1, curl = 0.3) {
  const x1 = x0 + lean * len, y1 = y0 - len * Math.sqrt(Math.max(0.05, 1 - lean * lean));
  const cx = x0 + lean * len * curl, cy = y0 - len * 0.6;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, rgb(c0)); g.addColorStop(1, rgb(c1));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x0 - w / 2, y0);
  ctx.quadraticCurveTo(cx - w * 0.4, cy, x1, y1);
  ctx.quadraticCurveTo(cx + w * 0.4, cy, x0 + w / 2, y0);
  ctx.closePath(); ctx.fill();
  return [x1, y1];
}
function stem(ctx, x0, y0, x1, y1, w, c) {
  ctx.strokeStyle = rgb(c); ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + (x1 - x0) * 0.2, y0 + (y1 - y0) * 0.6, x1, y1); ctx.stroke();
}
function petals(ctx, x, y, r, n, c, c2, inner = 0.25, squash = 1) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, squash); ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, r, 0);
    g.addColorStop(0, rgb(c2)); g.addColorStop(1, rgb(c));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(r * 0.55, 0, r * 0.5, r * inner, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
}
const disc = (ctx, x, y, r, c) => { ctx.fillStyle = rgb(c); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };

const TILES = [
  // 0 reeds
  (ctx, r) => { for (let i = 0; i < 26; i++) { const t = i / 26; blade(ctx, T * (0.5 + (r() - 0.5) * 0.3), T, T * (0.55 + r() * 0.42), (r() - 0.5) * 0.7, 16 + r() * 10, mix3([40, 70, 26], [56, 92, 34], t), mix3([110, 140, 56], [176, 176, 90], r()), 0.2 + r() * 0.5); } },
  // 1 cattails
  (ctx, r) => {
    for (let i = 0; i < 16; i++) blade(ctx, T * (0.5 + (r() - 0.5) * 0.3), T, T * (0.5 + r() * 0.36), (r() - 0.5) * 0.6, 15 + r() * 8, [44, 76, 30], mix3([96, 130, 50], [150, 160, 80], r()), 0.3);
    for (let i = 0; i < 4; i++) {
      const x = T * (0.3 + i * 0.13 + r() * 0.05), h = T * (0.72 + r() * 0.2);
      stem(ctx, T * 0.5 + (x - T * 0.5) * 0.3, T, x, T - h, 5, [110, 130, 60]);
      ctx.fillStyle = rgb([92, 58, 36]); ctx.beginPath(); ctx.roundRect(x - 9, T - h + 14, 18, 80, 9); ctx.fill();
      ctx.fillStyle = rgb([126, 84, 52]); ctx.beginPath(); ctx.roundRect(x - 5, T - h + 18, 5, 70, 3); ctx.fill();
      stem(ctx, x, T - h + 14, x, T - h - 16, 3, [130, 140, 70]);
    }
  },
  // 2 yellow flag iris
  (ctx, r) => {
    for (let i = 0; i < 16; i++) blade(ctx, T * (0.5 + (r() - 0.5) * 0.28), T, T * (0.45 + r() * 0.4), (r() - 0.5) * 0.75, 26 + r() * 14, [50, 86, 40], mix3([104, 146, 70], [140, 166, 86], r()), 0.25);
    for (let i = 0; i < 4; i++) {
      const x = T * (0.26 + i * 0.16 + r() * 0.04), h = T * (0.62 + r() * 0.26);
      stem(ctx, T * 0.5 + (x - T * 0.5) * 0.35, T, x, T - h, 6, [96, 130, 60]);
      petals(ctx, x, T - h, 42, 3, [246, 206, 40], [220, 150, 20], 0.42, 0.8);
      petals(ctx, x, T - h - 6, 26, 3, [252, 226, 90], [240, 190, 40], 0.4, 1);
    }
  },
  // 3 fern frond (grows upwards)
  (ctx, r) => {
    const n = 34;
    ctx.strokeStyle = rgb([70, 96, 36]); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(T / 2, T); ctx.lineTo(T / 2, T * 0.03); ctx.stroke();
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const y = T * (0.96 - t * 0.92);
      const len = T * 0.44 * Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.12)) ** 0.8 * (1 - t * 0.45);
      for (const s of [-1, 1]) {
        const c0 = mix3([44, 84, 28], [62, 110, 36], r()), c1 = mix3([96, 150, 52], [140, 176, 70], r() * (0.4 + t * 0.6));
        ctx.save(); ctx.translate(T / 2, y); ctx.rotate(s > 0 ? -0.32 : Math.PI + 0.32);
        const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, rgb(c0)); g.addColorStop(1, rgb(c1));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, -T * 0.014);
        // toothed pinna
        const teeth = 7;
        for (let k = 0; k <= teeth; k++) { const u = k / teeth; ctx.lineTo(len * u, -T * 0.02 * (1 - u) * (k % 2 ? 1.5 : 0.7)); }
        for (let k = teeth; k >= 0; k--) { const u = k / teeth; ctx.lineTo(len * u, T * 0.02 * (1 - u) * (k % 2 ? 1.5 : 0.7)); }
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
  },
  // 4 ox-eye daisies
  (ctx, r) => flowers(ctx, r, { n: 9, stemC: [70, 110, 40], draw: (x, y, s) => { petals(ctx, x, y, 34 * s, 14, [250, 250, 244], [226, 226, 214], 0.2, 0.85); disc(ctx, x, y, 11 * s, [240, 190, 30]); } }),
  // 5 poppies
  (ctx, r) => flowers(ctx, r, { n: 7, stemC: [80, 116, 50], draw: (x, y, s) => { petals(ctx, x, y, 40 * s, 5, [226, 44, 28], [170, 20, 16], 0.5, 0.8); disc(ctx, x, y, 9 * s, [26, 20, 20]); } }),
  // 6 buttercups
  (ctx, r) => flowers(ctx, r, { n: 14, stemC: [76, 120, 44], draw: (x, y, s) => { petals(ctx, x, y, 22 * s, 5, [250, 214, 30], [240, 180, 10], 0.5, 0.85); disc(ctx, x, y, 6 * s, [220, 160, 10]); } }),
  // 7 cornflowers / blue
  (ctx, r) => flowers(ctx, r, { n: 9, stemC: [90, 124, 70], draw: (x, y, s) => { petals(ctx, x, y, 30 * s, 12, [70, 96, 230], [40, 50, 170], 0.22, 0.85); disc(ctx, x, y, 8 * s, [60, 40, 130]); } }),
  // 8 foxgloves
  (ctx, r) => {
    for (let i = 0; i < 12; i++) blade(ctx, T * (0.5 + (r() - 0.5) * 0.3), T, T * (0.16 + r() * 0.14), (r() - 0.5) * 1.6, 44, [50, 86, 36], [98, 136, 60], 0.3);
    for (let i = 0; i < 3; i++) {
      const x = T * (0.3 + i * 0.2 + r() * 0.04), h = T * (0.7 + r() * 0.24);
      stem(ctx, T * 0.5 + (x - T * 0.5) * 0.4, T, x, T - h, 6, [84, 120, 56]);
      for (let k = 0; k < 13; k++) {
        const t = k / 13, y = T - h + t * h * 0.6, s = 0.5 + t * 0.6, side = k % 2 ? 1 : -1;
        ctx.fillStyle = rgb(mix3([226, 120, 190], [180, 60, 150], r()));
        ctx.beginPath(); ctx.ellipse(x + side * 13 * s, y, 15 * s, 21 * s, side * 0.5, 0, 7); ctx.fill();
        ctx.fillStyle = rgb([250, 220, 240]); ctx.beginPath(); ctx.ellipse(x + side * 15 * s, y + 9 * s, 6 * s, 8 * s, 0, 0, 7); ctx.fill();
      }
    }
  },
  // 9 heather mound
  (ctx, r) => {
    for (let i = 0; i < 520; i++) {
      const a = Math.PI * r(), rad = T * 0.46 * Math.sqrt(r());
      const x = T / 2 + Math.cos(a) * rad, y = T - Math.sin(a) * rad * 0.82 - 6;
      const t = 1 - rad / (T * 0.46);
      const c = r() < 0.6 ? mix3([200, 90, 160], [150, 60, 150], r()) : mix3([46, 74, 40], [84, 110, 56], r());
      ctx.fillStyle = rgb(c.map((v) => v * (0.7 + 0.5 * (1 - t))));
      ctx.beginPath(); ctx.ellipse(x, y, 5 + r() * 4, 13 + r() * 9, (r() - 0.5) * 1.2, 0, 7); ctx.fill();
    }
  },
  // 10 agapanthus
  (ctx, r) => {
    for (let i = 0; i < 18; i++) blade(ctx, T * (0.5 + (r() - 0.5) * 0.24), T, T * (0.28 + r() * 0.2), (r() - 0.5) * 1.5, 22, [44, 80, 36], [92, 130, 60], 0.3);
    for (let i = 0; i < 4; i++) {
      const x = T * (0.2 + i * 0.2 + r() * 0.05), h = T * (0.62 + r() * 0.28);
      stem(ctx, T * 0.5 + (x - T * 0.5) * 0.3, T, x, T - h, 5, [90, 126, 60]);
      for (let k = 0; k < 44; k++) {
        const a = r() * 7, rad = 44 * Math.sqrt(r());
        ctx.fillStyle = rgb(mix3([86, 110, 226], [130, 150, 240], r()).map((v) => v * (0.75 + 0.35 * r())));
        ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * rad, T - h + Math.sin(a) * rad * 0.9, 9, 5, a, 0, 7); ctx.fill();
      }
    }
  },
  // 11 lily pad (seen from above)
  (ctx, r) => {
    const g = ctx.createRadialGradient(T / 2, T / 2, T * 0.05, T / 2, T / 2, T * 0.47);
    g.addColorStop(0, rgb([104, 150, 60])); g.addColorStop(1, rgb([56, 104, 44]));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(T / 2, T / 2); ctx.arc(T / 2, T / 2, T * 0.47, 0.22, Math.PI * 2 - 0.22); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgb([130, 170, 80], 0.6); ctx.lineWidth = 3;
    for (let i = 0; i < 16; i++) { const a = 0.3 + (i / 16) * (Math.PI * 2 - 0.6); ctx.beginPath(); ctx.moveTo(T / 2, T / 2); ctx.lineTo(T / 2 + Math.cos(a) * T * 0.45, T / 2 + Math.sin(a) * T * 0.45); ctx.stroke(); }
    void r;
  },
  // 12 water lily flower on its pad (seen from above)
  (ctx, r) => {
    const g = ctx.createRadialGradient(T / 2, T / 2, T * 0.05, T / 2, T / 2, T * 0.47);
    g.addColorStop(0, rgb([96, 140, 56])); g.addColorStop(1, rgb([52, 98, 42]));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(T / 2, T / 2); ctx.arc(T / 2, T / 2, T * 0.47, 2.2, Math.PI * 2 + 1.8); ctx.closePath(); ctx.fill();
    petals(ctx, T / 2, T / 2, T * 0.3, 12, [250, 240, 244], [240, 170, 200], 0.3, 1);
    petals(ctx, T / 2, T / 2, T * 0.2, 9, [255, 250, 250], [246, 200, 220], 0.32, 1);
    disc(ctx, T / 2, T / 2, T * 0.06, [246, 200, 50]);
    void r;
  },
  // 13 dune grass tuft
  (ctx, r) => { for (let i = 0; i < 40; i++) blade(ctx, T * (0.5 + (r() - 0.5) * 0.16), T, T * (0.5 + r() * 0.45), (r() - 0.5) * 1.5, 8 + r() * 4, [110, 126, 70], mix3([176, 180, 110], [214, 204, 140], r()), 0.2 + r() * 0.3); },
  // 14 broad-leaved rosette (dock / hosta)
  (ctx, r) => {
    for (let i = 0; i < 15; i++) {
      const a = -Math.PI * (0.08 + 0.84 * r()), len = T * (0.36 + r() * 0.3);
      ctx.save(); ctx.translate(T / 2, T - 4); ctx.rotate(a);
      const g = ctx.createLinearGradient(0, 0, len, 0); g.addColorStop(0, rgb([40, 80, 34])); g.addColorStop(1, rgb(mix3([86, 134, 54], [120, 160, 70], r())));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(len * 0.3, -len * 0.26, len * 0.8, -len * 0.18, len, 0); ctx.bezierCurveTo(len * 0.8, len * 0.18, len * 0.3, len * 0.26, 0, 0); ctx.fill();
      ctx.strokeStyle = rgb([130, 160, 84], 0.7); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.94, 0); ctx.stroke();
      ctx.restore();
    }
  },
  // 15 lavender
  (ctx, r) => {
    for (let i = 0; i < 46; i++) {
      const x0 = T * (0.5 + (r() - 0.5) * 0.2), lean = (r() - 0.5) * 1.1, len = T * (0.5 + r() * 0.42);
      const [x1, y1] = blade(ctx, x0, T, len, lean, 5, [96, 116, 90], [136, 150, 120], 0.2);
      for (let k = 0; k < 7; k++) { ctx.fillStyle = rgb(mix3([120, 90, 200], [160, 120, 226], r())); ctx.beginPath(); ctx.ellipse(x1 - lean * k * 7, y1 + k * 9, 7, 6, 0, 0, 7); ctx.fill(); }
    }
  },
];

function flowers(ctx, r, { n, stemC, draw }) {
  for (let i = 0; i < 26; i++) blade(ctx, T * (0.5 + (r() - 0.5) * 0.4), T, T * (0.14 + r() * 0.3), (r() - 0.5) * 1.3, 12 + r() * 10, [46, 84, 34], mix3([100, 140, 56], [136, 160, 74], r()), 0.3);
  for (let i = 0; i < n; i++) {
    const x = T * (0.14 + ((i + r() * 0.6) / n) * 0.72), h = T * (0.42 + r() * 0.46);
    stem(ctx, T * 0.5 + (x - T * 0.5) * 0.35, T, x, T - h, 4.5, stemC);
    draw(x, T - h, 0.75 + r() * 0.5);
  }
}

function bleed(px, W, H, iters) {
  const a = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) a[i] = px[i * 4 + 3] > 90 ? 1 : 0;
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
    for (let k = 0; k < add.length; k += 4) { const i = add[k]; px[i * 4] = add[k + 1]; px[i * 4 + 1] = add[k + 2]; px[i * 4 + 2] = add[k + 3]; a[i] = 1; }
  }
  for (let i = 0; i < W * H; i++) if (!a[i]) { px[i * 4] = 70; px[i * 4 + 1] = 110; px[i * 4 + 2] = 50; }
}

export async function bakePlants(dir, log) {
  const S = T * 4;
  const canvas = createCanvas(S, S);
  const ctx = canvas.getContext('2d');
  const rnd = mulberry32(4242);
  TILES.forEach((draw, i) => {
    const ox = (i % 4) * T, oy = Math.floor(i / 4) * T;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox + 4, oy + 4, T - 8, T - 8); ctx.clip();
    ctx.translate(ox, oy);
    draw(ctx, rnd);
    ctx.restore();
  });
  const img = ctx.getImageData(0, 0, S, S);
  bleed(img.data, S, S, 10);
  const buf = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  ensureDir(`${dir}/x`);
  for (const size of [1024, 512]) {
    await sharp(buf, { raw: { width: S, height: S, channels: 4 } }).resize(size, size, { kernel: 'lanczos3' }).webp({ quality: 88, alphaQuality: 100, effort: 5 }).toFile(`${dir}/plants_${size}.webp`);
  }
  log('foliage/plants');
  void clamp; void lerp;
}
