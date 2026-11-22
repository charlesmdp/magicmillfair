// Offline world baker.
// Composes the surveyed relief (tools/data) with the authored layout (src/world/layout)
// into the runtime assets under public/assets/world:
//   height.png   RG = terrain height (16 bit), B = ambient occlusion
//   water.png    RG = water surface height (16 bit, 0 = none), B = distance to shore
//   normal.png   RG = terrain normal xz, B = canopy shade
//   splat0/1/2   surface layer weights (+ grass height in splat2.B)
//   tint.png     macro colour variation
//   backdrop.png low resolution surrounding relief
//   trees.bin    tree placements, world.json metadata (streams, ponds, paths...)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Grid, signedDistance, distanceTo, fillPolygon, clamp, lerp, smoothstep } from './lib/grid.mjs';
import { fbm, ridged, perlin, hash2, mulberry32 } from './lib/noise.mjs';
import { savePng, loadImage } from './lib/img.mjs';
import sharp from 'sharp';
import { smoothPath, resample, arcLengths } from '../src/world/layout/spline.js';
import * as L from '../src/world/layout/layout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/assets', L.WORLD_DIR); // (each track of the race has its own maps: see TRACKS)
const PREVIEW = path.join(ROOT, 'tools/preview');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PREVIEW, { recursive: true });

const N = L.WORLD.size; // cells of 1 m
const HALF = L.WORLD.half;
const HMIN = -32, HMAX = 352; // 16-bit height encoding range (6 mm steps)
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const wx = (i) => -HALF + i + 0.5; // cell centre -> world
const gi = (x) => x + HALF - 0.5; // world -> continuous cell index
const idx = (i, j) => j * N + i;

// ---------------------------------------------------------------------------
// Inputs

const demRaw = new Float32Array(fs.readFileSync(path.join(ROOT, 'tools/data/dem_8m.f32')).buffer.slice(0));
const DEM_N = 257, DEM_STEP = 8, DEM_HALF = 1024;
const dem = new Grid(DEM_N, DEM_N);
dem.d.set(demRaw);
const demAt = (x, z) => dem.sampleCubic((x + DEM_HALF) / DEM_STEP, (z + DEM_HALF) / DEM_STEP) * L.WORLD.verticalScale + L.DATUM;

const canopyImg = await loadImage(path.join(ROOT, 'tools/data/canopy_1m.png'), 1);
const canopy = Grid.from(N, N, (i, j) => canopyImg.data[j * N + i] / 8); // metres
const canopyWide = await loadImage(path.join(ROOT, 'tools/data/canopy_2m.png'), 1); // 2048 m window, 2 m cells

// ---------------------------------------------------------------------------
// Geometry helpers

/** Distance field of a polyline: nearest distance, arc position and side for cells within `radius`. */
function polylineField(pts, radius) {
  const dist = new Float32Array(N * N).fill(1e9);
  const pos = new Float32Array(N * N); // fractional sample index along the polyline
  const side = new Int8Array(N * N); // +1 = left of travel direction
  for (let k = 0; k + 1 < pts.length; k++) {
    const ax = pts[k][0], az = pts[k][1], bx = pts[k + 1][0], bz = pts[k + 1][1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    if (l2 < 1e-12) continue;
    const i0 = Math.max(0, Math.floor(gi(Math.min(ax, bx) - radius))), i1 = Math.min(N - 1, Math.ceil(gi(Math.max(ax, bx) + radius)));
    const j0 = Math.max(0, Math.floor(gi(Math.min(az, bz) - radius))), j1 = Math.min(N - 1, Math.ceil(gi(Math.max(az, bz) + radius)));
    for (let j = j0; j <= j1; j++) {
      const z = wx(j);
      for (let i = i0; i <= i1; i++) {
        const x = wx(i);
        let t = ((x - ax) * dx + (z - az) * dz) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ax + dx * t, pz = az + dz * t;
        const d = Math.hypot(x - px, z - pz);
        const q = idx(i, j);
        if (d < dist[q]) {
          dist[q] = d;
          pos[q] = k + t;
          // left of the direction of travel (with +Z pointing "down" on the map, left = -cross)
          side[q] = dx * (z - az) - dz * (x - ax) < 0 ? 1 : -1;
        }
      }
    }
  }
  return { dist, pos, side };
}

function interp(arr, p) {
  const k = Math.min(arr.length - 2, Math.max(0, Math.floor(p)));
  const t = p - k;
  return arr[k] + (arr[k + 1] - arr[k]) * t;
}

/** Signed distance grid (metres, negative inside) of a world-space polygon. */
function polygonSDF(pts) {
  const mask = new Uint8Array(N * N);
  fillPolygon(mask, N, N, pts.map((p) => [gi(p[0]), gi(p[1])]));
  return signedDistance(mask, N, N);
}

/** Closed outline with optional straight ("hard") runs between control points. */
function closedOutline(pts, hardEdges = [], step = 1) {
  const n = pts.length;
  const isHard = (i) => hardEdges.some(([a, b]) => i >= a && i < b);
  const out = [];
  for (let i = 0; i < n; i++) {
    const p1 = pts[i], p2 = pts[(i + 1) % n];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const m = Math.max(1, Math.ceil(len / step));
    if (isHard(i)) {
      for (let j = 0; j < m; j++) out.push([lerp(p1[0], p2[0], j / m), lerp(p1[1], p2[1], j / m)]);
    } else {
      const p0 = isHard((i - 1 + n) % n) ? p1 : pts[(i - 1 + n) % n];
      const p3 = isHard((i + 1) % n) ? p2 : pts[(i + 2) % n];
      for (let j = 0; j < m; j++) {
        const t = j / m, t2 = t * t, t3 = t2 * t;
        const c = (a, b, cc, d) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
        out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Base relief

log('base relief');
const H = Grid.from(N, N, (i, j) => demAt(wx(i), wx(j)));
const detailMask = new Grid(N, N, 1); // where small-scale noise may be added

// 1b. Hills, and the mountains that close the valley: outside the playable area the ground rises, first as a
// band of crags (the visible reason why one cannot go further), then as long slopes cut by ridges and gullies.
const boundsPts = closedOutline(L.BOUNDS, [], 2);
const boundsSDF = polygonSDF(boundsPts); // metres, negative inside the playable area
function mountain(x, z, d) {
  if (d <= 0) return 0;
  const south = smoothstep(40, 150, z); // the sun is in the south: lower crags and gentler slopes there
  // the crags: a rock face of uneven height, broken into ledges
  const n1 = fbm(x / 64, z / 64, { seed: 201, octaves: 3 });
  const crag = lerp(16, 8.5, south) * (1 + 0.55 * n1);
  const band = crag * 0.45 + 1.5;
  // (the foot of the face wanders: buttresses and recesses instead of a wall)
  const dc = Math.max(0, d + fbm(x / 11, z / 11, { seed: 205, octaves: 3 }) * 4.2 - 1.2);
  const t = smoothstep(0, band, dc);
  let h = crag * lerp(t, Math.floor(t * 3 + 0.5) / 3, 0.34) + (ridged(x / 6, z / 6, { seed: 204, octaves: 3 }) - 0.35) * 2.6 * t;
  // the slopes above, steep at first, cut by ridges and gullies that grow with the distance
  const e = Math.max(0, d - band);
  h += e * lerp(0.64, 0.4, south) * (1 - 0.28 * smoothstep(120, 520, e));
  const amp = Math.min(64, e * 0.3);
  h += (ridged(x / 170, z / 170, { seed: 202, octaves: 4 }) - 0.5) * amp * 1.5;
  h += (ridged(x / 56, z / 56, { seed: 203, octaves: 3 }) - 0.5) * amp * 0.5;
  return Math.max(0, h);
}
for (let q = 0; q < N * N; q++) canopy.d[q] *= 1 - smoothstep(-2, 6, boundsSDF.d[q]); // the surveyed woods stop at the mountains
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const q = idx(i, j), x = wx(i), z = wx(j);
    for (const [hx, hz, r, hh] of L.HILLS) {
      const dd = ((x - hx) ** 2 + (z - hz) ** 2) / (r * r);
      if (dd < 9) H.d[q] += hh * Math.exp(-dd * 2.2);
    }
    if (boundsSDF.d[q] > 0) H.d[q] += mountain(x, z, boundsSDF.d[q]);
  }
}

// ---------------------------------------------------------------------------
// 2. Coast

log('coast');
const coastPts = smoothPath(L.COAST.line, { step: 2 });
const BW = L.COAST.beachWidth;
const coastField = polylineField(coastPts, 240);
const seaMask = new Uint8Array(N * N);
{
  const poly = coastPts.map((p) => [gi(p[0]), gi(p[1])]);
  poly.push([gi(900), gi(700)], [gi(900), gi(-700)]);
  fillPolygon(seaMask, N, N, poly);
}
const coastD = new Grid(N, N); // signed: + inland, - offshore
const beach = new Grid(N, N);
const seaCliff = new Grid(N, N); // 1 = sea cliff country: fluted faces that the land cover makes green
const SC = L.SEA_CLIFFS;
const coastBeach = coastPts.map((p) => clamp(p[2], 0, 1));
for (let q = 0; q < N * N; q++) {
  const d = Math.min(coastField.dist[q], 240);
  coastD.d[q] = seaMask[q] ? -d : d;
  beach.d[q] = coastField.dist[q] < 240 ? interp(coastBeach, coastField.pos[q]) : 0;
}
beach.d.set(beach.blur(14).d); // avoid seams where the nearest coast vertex changes
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const q = idx(i, j);
    const x = wx(i), z = wx(j);
    const d0 = coastD.d[q];
    if (d0 > 235) continue;
    const b = beach.d[q];
    const wob = fbm(x / 22, z / 22, { seed: 11, octaves: 3 }) * 5 * (1 - b) + fbm(x / 6, z / 6, { seed: 12, octaves: 2 }) * 1.2 * (1 - b);
    const d = d0 + wob;
    const base = H.d[q];
    let h;
    if (d >= 0) {
      // sandy shore: beach face, berm, promenade level, then blend into the relief
      const sand = d < BW ? 2.3 * smoothstep(0, BW, d) ** 0.85 : 2.3 + (L.COAST.promenadeY - 2.3) * smoothstep(BW, BW + 6, d);
      const hBeach = lerp(sand, Math.max(base, L.COAST.promenadeY - 0.3), smoothstep(BW + 12, BW + 62, d));
      // rocky shore: keep the relief, drop to the sea over a short distance. Beyond the playable valley the
      // capes are sea cliffs: the land stands high right at the water, its face cut by flutes (ribs and
      // gullies running down it), the whole rampart sinking back into the mountain further inland.
      const wild = (boundsSDF.d[q] > 0 ? smoothstep(0, 7, boundsSDF.d[q]) : 0) * (1 - b) * (1 - b);
      const rib = Math.abs(Math.sin((coastField.pos[q] * 2 * Math.PI) / SC.every + 2.4 * fbm(x / 41, z / 41, { seed: 72, octaves: 2 })));
      const gully = (1 - rib) ** 1.6 * wild;
      const crest = (SC.height + SC.vary * fbm(x / 130, z / 130, { seed: 71, octaves: 2 })) * (1 - 0.16 * gully) * (1 - smoothstep(60, 215, d0));
      const top = Math.max(base, 2.5 + 3 * b, crest * wild);
      const run = lerp(12 + top * 0.25, 4.5 + top * 0.115, wild); // how far from the water the face tops out
      const hCliff = lerp(-0.8, top, smoothstep(-1, run, d - gully * SC.flute) ** lerp(0.75, 0.6, wild));
      h = lerp(hCliff, hBeach, b);
      seaCliff.d[q] = wild * (1 - smoothstep(run + 14, run + 50, d));
    } else {
      const a = -d;
      const hBeach = -(3.4 * (1 - Math.exp(-a / 60)) + a * 0.02);
      const hCliff = -(1.2 + 4.5 * (1 - Math.exp(-a / 10)) + a * 0.02);
      h = lerp(hCliff, hBeach, b);
    }
    H.d[q] = h;
  }
}

// The fall into the sea: a hanging valley cut into the cliffs of the northern cape. Its lip is the last point,
// going seaward, where the land is still as high as the stream.
const hAt = (x, z) => H.sample(gi(x), gi(z)); // the relief so far, anywhere
const seaFall = (() => {
  const F = L.SEA_FALL, [ux, uz] = F.dir;
  const brow = hAt(F.x - ux * 14, F.z - uz * 14); // the land behind the face
  const y = Math.min(F.y, brow - 4);
  let lx = F.x - ux * 30, lz = F.z - uz * 30;
  for (let t = -30; t < 30; t += 0.5) { const px = F.x + ux * t, pz = F.z + uz * t; if (hAt(px, pz) >= y + 0.5) { lx = px; lz = pz; } }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = wx(i), z = wx(j), t = -((x - lx) * ux + (z - lz) * uz); // metres inland of the lip
    if (t < -1.5 || t > 95) continue;
    const side = Math.abs((x - lx) * -uz + (z - lz) * ux);
    if (side > 26) continue;
    const q = idx(i, j);
    const floor = y - 0.45 + Math.max(0, t) * 0.07 + Math.max(0, side - F.width * 0.5) * 1.35 + smoothstep(60, 95, t) * 40;
    if (H.d[q] > floor) { H.d[q] = lerp(floor, H.d[q], smoothstep(-0.5, -1.5, t)); detailMask.d[q] = Math.min(detailMask.d[q], 0.5); }
  }
  return { x: lx, z: lz, y, dir: F.dir, width: F.width, drop: y };
})();

// ---------------------------------------------------------------------------
// 3. Streams: resolve centrelines, condition the valley floor

log('streams');
const streams = L.STREAMS.map((s) => {
  let pts = smoothPath(s.points, { step: 1 });
  pts = resample(pts, 1);
  // sharpen cascades and enforce a monotonic water profile
  const ctrl = s.points;
  const ctrlS = arcLengths(ctrl);
  const sLen = arcLengths(pts);
  const total = sLen[sLen.length - 1];
  const scale = total / ctrlS[ctrlS.length - 1];
  const y = new Float64Array(pts.length);
  for (let k = 0; k < pts.length; k++) {
    const sc = sLen[k] / scale;
    let c = 0;
    while (c + 2 < ctrl.length && ctrlS[c + 1] < sc) c++;
    const segLen = ctrlS[c + 1] - ctrlS[c];
    let t = clamp((sc - ctrlS[c]) / segLen, 0, 1);
    const drop = ctrl[c][2] - ctrl[c + 1][2];
    if (drop / segLen > 0.07) t = smoothstep(0.3, 0.7, t); // waterfall step
    y[k] = lerp(ctrl[c][2], ctrl[c + 1][2], t);
  }
  for (let k = 1; k < y.length; k++) if (y[k] > y[k - 1]) y[k] = y[k - 1];
  const width = pts.map((p) => p[3]);
  const out = pts.map((p, k) => [p[0], p[1], y[k], width[k]]);
  return { ...s, samples: out };
});

function smooth1d(arr, sigma) {
  const out = new Float64Array(arr.length);
  const r = Math.ceil(sigma * 3);
  for (let k = 0; k < arr.length; k++) {
    let s = 0, wsum = 0;
    for (let m = -r; m <= r; m++) {
      const kk = clamp(k + m, 0, arr.length - 1);
      const w = Math.exp(-(m * m) / (2 * sigma * sigma));
      s += arr[kk] * w; wsum += w;
    }
    out[k] = s / wsum;
  }
  return out;
}
function streamOps(s, { fill = true } = {}) {
  const R = 150;
  const f = polylineField(s.samples, R);
  const ys = smooth1d(s.samples.map((p) => p[2]), s.smooth ?? (s.lined ? 2 : 12));
  const ws = s.samples.map((p) => p[3]);
  // bank level field, blurred so that the valley floor has no seams
  const bank = new Grid(N, N);
  for (let q = 0; q < N * N; q++) bank.d[q] = f.dist[q] <= R ? interp(ys, f.pos[q]) + 0.28 : H.d[q];
  const bankS = s.lined || s.smooth !== undefined ? bank : bank.blur(3.5);
  const flat = s.flat ?? 6, slope = s.slope ?? 0.3;
  for (let q = 0; q < N * N; q++) {
    const d = f.dist[q];
    if (d > R - 8) continue;
    const half = interp(ws, f.pos[q]) / 2;
    const b = bankS.d[q];
    let h = H.d[q];
    // (no raised floodplain on the beach: the brook must reach the sea)
    if (fill) h = Math.max(h, lerp(-50, b - Math.max(0, d - 40) * 0.06, smoothstep(2, 30, coastD.d[q])));
    const e = Math.max(0, d - (half + flat));
    h = Math.min(h, b + e * slope * (1 + e * 0.004));
    H.d[q] = h;
  }
  return f;
}
function streamBed(s) {
  const f = polylineField(s.samples, 12);
  const ys = s.samples.map((p) => p[2]);
  const ws = s.samples.map((p) => p[3]);
  for (let q = 0; q < N * N; q++) {
    const d = f.dist[q];
    if (d > 10) continue;
    const w = interp(ys, f.pos[q]);
    const half = interp(ws, f.pos[q]) / 2;
    // walled channels are cut wider than the water: their thick stone walls stand in the cut and hide its sides
    const u = d / (half + (s.walled ? 0.8 : s.lined ? 0.12 : 0.55));
    if (s.walled && u >= 1 && d < half + 1.9) { detailMask.d[q] = 0; padMask.d[q] = Math.max(padMask.d[q], 0.7); }
    else if (s.lined && u >= 1 && d < half + 0.75) { H.d[q] = lerp(H.d[q], w + 0.3, 0.9); detailMask.d[q] = 0; padMask.d[q] = Math.max(padMask.d[q], 0.7); }
    if (u < 1) {
      const prof = s.lined ? 1 : Math.cos(u * Math.PI * 0.5) ** 0.7;
      const i = q % N, j = (q / N) | 0;
      const rough = fbm(wx(i) / 2.3, wx(j) / 2.3, { seed: 51, octaves: 2 }) * 0.1;
      const bed = w + 0.26 - (s.bedDepth + 0.3) * prof + rough;
      H.d[q] = Math.min(H.d[q], bed);
      detailMask.d[q] = 0;
    } else if (d < half + 2.2) {
      detailMask.d[q] = Math.min(detailMask.d[q], 0.4);
    }
  }
  return f;
}
for (const s of streams) streamOps(s, { fill: s.id !== 'canal' && s.fill !== false });

// ---------------------------------------------------------------------------
// 4. Ponds

log('ponds');
const ponds = L.PONDS.map((p) => {
  const outline = closedOutline(p.outline, p.hardEdges, 1);
  const sdf = polygonSDF(outline);
  // islands: union of ellipses carved out of the water area
  const island = new Grid(N, N, 1e9);
  for (const isl of p.islands) {
    for (let j = Math.floor(gi(isl.z - isl.rz - 12)); j <= Math.ceil(gi(isl.z + isl.rz + 12)); j++) {
      for (let i = Math.floor(gi(isl.x - isl.rx - 12)); i <= Math.ceil(gi(isl.x + isl.rx + 12)); i++) {
        if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const x = wx(i), z = wx(j);
        const ang = Math.atan2(z - isl.z, x - isl.x);
        const wob = 1 + 0.16 * Math.sin(ang * 3 + isl.x) + 0.1 * Math.sin(ang * 5 + isl.z);
        const r = Math.hypot((x - isl.x) / isl.rx, (z - isl.z) / isl.rz) / wob;
        const d = (r - 1) * Math.min(isl.rx, isl.rz); // approx metres outside the island
        const q = idx(i, j);
        if (d < island.d[q]) island.d[q] = d;
      }
    }
  }
  return { ...p, outlinePts: outline, sdf, island };
});

// 4a. basin margins: a level strip around each pond, then a gentle cut into the valley sides
for (const p of ponds) {
  const flat = p.margin ?? 6, slope = p.cutSlope ?? 0.3;
  for (let q = 0; q < N * N; q++) {
    const d = p.sdf.d[q];
    if (d > 90) continue;
    const bankTop = p.level + p.bank;
    let h = H.d[q];
    h = Math.max(h, bankTop - Math.max(0, d - 4.5) * 0.3);
    const e = Math.max(0, d - flat);
    h = Math.min(h, bankTop + 0.02 * Math.min(d, flat) + e * slope * (1 + e * 0.006));
    H.d[q] = h;
  }
}
// 4b. soften the kinks left by the valley and basin shaping
{
  const sm = H.blur(2.2);
  for (let q = 0; q < N * N; q++) if (coastD.d[q] > 6) H.d[q] = sm.d[q];
}
// 4c. precise basins, shores and islands
for (const p of ponds) {
  for (let q = 0; q < N * N; q++) {
    const d = p.sdf.d[q];
    if (d > 8) continue;
    const i = q % N, j = (q / N) | 0;
    const x = wx(i), z = wx(j);
    let h = H.d[q];
    if (d <= 0) {
      const shore = Math.min(-d, p.island.d[q]);
      const n1 = fbm(x / 7, z / 7, { seed: 21, octaves: 3 });
      const depth = p.depth * (smoothstep(-0.3, p.shelf, shore) ** 0.8) * (0.85 + 0.25 * n1);
      h = p.level - 0.02 - depth;
      if (p.island.d[q] < 0) {
        const isl = p.islands.reduce((best, c) => (Math.hypot(x - c.x, z - c.z) < Math.hypot(x - best.x, z - best.z) ? c : best), p.islands[0]);
        h = p.level + isl.top * smoothstep(0, 2.2, -p.island.d[q]) ** 0.7 + 0.1;
      }
      detailMask.d[q] = p.island.d[q] < 0 ? 0.5 : 0.15;
    } else {
      const bankTop = p.level + p.bank;
      const tgt = Math.max(Math.min(h, bankTop + 0.42 * Math.max(0, d - 1.2)), bankTop - 0.5 * Math.max(0, d - 2.5));
      // ease the first metre of bank down to the waterline
      h = lerp(lerp(p.level + 0.05, tgt, smoothstep(0, 1.3, d)), h, smoothstep(3, 8, d));
      h = Math.max(h, Math.min(bankTop, p.level + 0.05 + d * 0.3) - Math.max(0, d - 4.5) * 0.3);
      if (d < 3) detailMask.d[q] = Math.min(detailMask.d[q], 0.3 + 0.2 * d);
    }
    H.d[q] = h;
  }
}

// ---------------------------------------------------------------------------
// 4d. Places beyond the valley floor: the island in the cove, the high village and its stairway, the camp

log('island, village, stairway');
const noTrees = new Grid(N, N); // 1 = nothing is planted here
const islandMask = new Grid(N, N); // the island: its rock, above the water and just under it
const islandSand = new Grid(N, N); // its little landing beach
const stairMask = new Grid(N, N);
const goldBare = new Grid(N, N); // round the golden cove, its stair and its ledge: bare rock (the green of the sea cliffs is scraped off)
const goldSand = new Grid(N, N); // the sand of the golden cove
const goldPad = new Grid(N, N); // the ledge of the statue: a hard floor
const campMask = new Grid(N, N);
const caveMouth = new Grid(N, N);
const climbMask = new Grid(N, N);
const acidMask = new Grid(N, N);
const terraceMask = new Grid(N, N); // the terraces above the great waterfall
const skyMask = new Grid(N, N); // the shelves of the sky villages
const skyPaved = new Grid(N, N); // under their halls and pavilions
const skyGreen = new Grid(N, N); // round them: woods and meadows hold on, however high (1 near a village, 0 far from all)
const gladeMask = new Grid(N, N); // the meadow of the high clearing
const skySites = []; // { x, z, y, yaw }
let acidLevel = 0;
const disc = (x, z, r, fn) => {
  for (let j = Math.max(0, Math.floor(gi(z - r))); j <= Math.min(N - 1, Math.ceil(gi(z + r))); j++) {
    for (let i = Math.max(0, Math.floor(gi(x - r))); i <= Math.min(N - 1, Math.ceil(gi(x + r))); i++) {
      const d = Math.hypot(wx(i) - x, wx(j) - z);
      if (d <= r) fn(idx(i, j), d, wx(i), wx(j));
    }
  }
};
{
  // --- the island: a cone of rock with the path wound round it as a ledge. Along a ray from the centre the
  // ground steps up from one turn of the path to the next: ledge, cliff, ledge, cliff… up to the flat top.
  const IS = L.ISLAND, w2 = IS.width / 2, TAU = Math.PI * 2, top = IS.y1 + 0.2;
  const wall = (t) => smoothstep(0, 0.62, t) ** 0.75; // a cliff, then a verge level with the path above
  const hollows = IS.alcoves.map((u) => u * L.ISLAND_LENGTH);
  disc(IS.x, IS.z, IS.r0 + 24, (q, d, x, z) => {
    let a = (Math.atan2(z - IS.z, x - IS.x) - IS.start) % TAU;
    if (a < 0) a += TAU;
    const turns = []; // the turns crossed by this ray, from the outside in
    for (let k = 0; ; k++) {
      const p = L.islandAt(a + TAU * k);
      if (!p) break;
      let inner = w2; // wider where a hollow is cut in the rock
      for (const s0 of hollows) inner = Math.max(inner, w2 + IS.alcove.depth * (1 - smoothstep(IS.alcove.half - 0.9, IS.alcove.half, Math.abs(p.s - s0))));
      turns.push({ r: p.r, y: p.y, inner });
    }
    const t0 = turns[0];
    let h, ledge = false;
    if (d >= t0.r + w2) {
      // the shore: rock dropping into the sea; at the foot of the path, a little beach slopes in instead
      const e = d - t0.r - w2, run = 4 + t0.y * 0.14;
      const landing = 1 - smoothstep(0.42, 0.8, a);
      const jag = (ridged(a * 3.1, 0.5, { seed: 214, octaves: 3 }) - 0.5) * 2.2 * (1 - landing);
      const cliff = t0.y - (t0.y + 3.2) * smoothstep(0, Math.max(2.5, run + jag), e) - Math.max(0, e - run) * 0.6;
      const beach = e < 8 ? t0.y - e * 0.21 : t0.y - 1.68 - (e - 8) * 0.45;
      h = Math.max(H.d[q], lerp(cliff, beach, landing));
      if (h > -1.5) islandSand.d[q] = landing * (1 - smoothstep(0.5, 2.2, e) * 0) ;
    } else {
      h = top;
      for (let k = 0; k < turns.length; k++) {
        const t = turns[k], nx = turns[k + 1];
        const inn = t.r - t.inner;
        if (d >= inn) { h = t.y; ledge = true; break; }
        const out = Math.min(nx ? nx.r + w2 : IS.summit, inn - 0.6), y1 = nx ? nx.y : top;
        if (d > out) {
          const u = (inn - d) / (inn - out);
          // buttresses and gullies: the face is pushed in and out, and broken into ledges
          const rough = (ridged(a * 2.6 + k * 3.1, d / 9, { seed: 211, octaves: 3 }) - 0.5) * 0.34 + (ridged(x / 5, z / 5, { seed: 212, octaves: 2 }) - 0.5) * 0.16;
          h = lerp(t.y, y1, wall(clamp(u + rough * Math.sin(Math.PI * clamp(u * 1.4, 0, 1)), 0, 1)));
          h += (ridged(x / 3.4, z / 3.4, { seed: 213, octaves: 2 }) - 0.5) * 1.1 * Math.sin(Math.PI * clamp(u, 0, 1));
          break;
        }
      }
    }
    if (h > H.d[q] + 0.01 || d < t0.r + w2) {
      H.d[q] = h;
      detailMask.d[q] = ledge || d < IS.summit ? 0 : 1;
      if (h > -2) islandMask.d[q] = 1;
    }
    if (d < IS.r0 + 6) noTrees.d[q] = 1;
  });

  // --- the village: a shelf levelled on the western mountain. Above it the rock is cut back steeply, below
  // it the slope falls away.
  const VL = L.VILLAGE;
  const sdf = polygonSDF(closedOutline(VL.outline, [], 2));
  for (let q = 0; q < N * N; q++) {
    const d = sdf.d[q];
    if (d > 14) continue;
    const e = Math.max(0, d);
    H.d[q] = d <= 0 ? VL.y : clamp(H.d[q], VL.y - e * 1.15, VL.y + e * 1.7);
    if (d < 1) detailMask.d[q] = 0;
    if (d < 3.5) noTrees.d[q] = 1;
  }
  var villageSDF = sdf;

  // --- above the great waterfall: three terraces of level rock, a pool of the torrent on each (the pools
  // themselves are dug with the stream, further down), sheer faces between them
  const locked = new Uint8Array(N * N); // ground that the next shapes must leave alone
  const FL = L.FALLS;
  const terraceSDF = FL.levels.map((t) => polygonSDF(closedOutline(t.bank, [], 1)));
  FL.levels.forEach((t, k) => {
    const sdf = terraceSDF[k];
    for (let q = 0; q < N * N; q++) if (sdf.d[q] <= 0) { H.d[q] = t.y - 0.03; locked[q] = 1; detailMask.d[q] = 0.25; terraceMask.d[q] = 1; noTrees.d[q] = 1; }
  });
  FL.levels.forEach((t, k) => {
    const sdf = terraceSDF[k];
    for (let q = 0; q < N * N; q++) {
      const e = sdf.d[q];
      if (e <= 0 || e > 12 || locked[q]) continue;
      H.d[q] = clamp(H.d[q], t.y - e * 2.6, t.y + e * 3.2);
      terraceMask.d[q] = Math.max(terraceMask.d[q], 1 - smoothstep(0, 5, e));
      if (e < 9) noTrees.d[q] = 1; // (open to the sky, and seen from the valley)
    }
  });

  // --- the high clearing: its shelf is evened out (a shallow bowl round the lake), the slopes round it eased
  {
    const G = L.GLADE;
    disc(G.x, G.z, Math.max(G.rx, G.rz) + 16, (q, d, x, z) => {
      const e = Math.hypot((x - G.x) / G.rx, (z - G.z) / G.rz); // 1 on its edge
      if (e < 1) { H.d[q] = lerp(H.d[q], G.y + 0.5 * smoothstep(0.35, 1, e) ** 2, 0.94); detailMask.d[q] = Math.min(detailMask.d[q], 0.5); noTrees.d[q] = 1; gladeMask.d[q] = 1 - smoothstep(0.82, 1, e); }
      else { const out = (e - 1) * Math.min(G.rx, G.rz); H.d[q] = clamp(H.d[q], G.y + 0.5 - out * 0.9, G.y + 0.5 + out * 1.1); }
    });
  }

  // --- the golden cove: a pocket of sand at the foot of the sea cliffs, and the ledge of the statue high above.
  // Both are made level (the rock is cut, or built up); round them the cliff is only ever cut back, steeply.
  // Where the cove looks at the sea its sand shelves into the water — a beach, as at the landing of the island:
  // one swims in, finds the bottom and walks out (a bank, however low, would keep a swimmer in the water).
  for (const S of [L.NORTH.cove, L.NORTH.ledge]) {
    const beach = S === L.NORTH.cove ? L.NORTH.beach : null;
    disc(S.x, S.z, Math.max(S.rx, S.rz) + (beach ? beach.reach + 4 : 22), (q, d, x, z) => {
      const e = Math.hypot((x - S.x) / S.rx, (z - S.z) / S.rz); // 1 on its edge
      const off = (e - 1) * Math.min(S.rx, S.rz); // metres outside its edge (negative inside)
      if (e < 1) { H.d[q] = S.y + 0.25 * smoothstep(0.55, 1, e) ** 2; locked[q] = 1; detailMask.d[q] = Math.min(detailMask.d[q], 0.35); noTrees.d[q] = 1; }
      else {
        H.d[q] = Math.min(H.d[q], S.y + 0.3 + off * 3.4); if (off < 7) noTrees.d[q] = 1;
        if (beach) {
          // (the face of the beach, then the shelf under the water, then down to the bed of the sea)
          const sand = off < beach.face ? S.y + 0.25 - off * beach.slope : S.y + 0.25 - beach.face * beach.slope - (off - beach.face) * beach.drop;
          if (sand > H.d[q] && off < beach.reach) {
            const a = 1 - smoothstep(beach.reach - 5, beach.reach, off);
            H.d[q] = lerp(H.d[q], sand, a); detailMask.d[q] = Math.min(detailMask.d[q], 0.3);
            goldSand.d[q] = Math.max(goldSand.d[q], a);
          }
        }
      }
      goldBare.d[q] = Math.max(goldBare.d[q], 1 - smoothstep(5, 15, off));
      if (S === L.NORTH.cove) goldSand.d[q] = Math.max(goldSand.d[q], 1 - smoothstep(0.2, 2.6, off));
      else goldPad.d[q] = Math.max(goldPad.d[q], 1 - smoothstep(-0.9, 0.5, off));
    });
  }

  // --- stairways: flights of steps with a level landing at each corner. The rock is cut to them (or built
  // up under them): steep faces on both sides. The long one climbs to the temple; three short ones go up
  // beside the falls, from terrace to terrace.
  for (const ST of [L.STAIRWAY, ...FL.stairs, ...L.NORTH.stairs]) {
    const sw = ST.width / 2;
    const samples = [];
    for (let k = 0; k + 1 < ST.points.length; k++) {
      const [ax, az, ay] = ST.points[k], [bx, bz, by] = ST.points[k + 1];
      const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len);
      for (let m = k === 0 ? 0 : 1; m <= n; m++) {
        const t = clamp(((m / n) * len - ST.landing) / (len - 2 * ST.landing), 0, 1);
        samples.push([lerp(ax, bx, m / n), lerp(az, bz, m / n), lerp(ay, by, t)]);
      }
    }
    const sf = polylineField(samples, 18);
    const ys = samples.map((q) => q[2]);
    // (the stair of the golden cove runs across the face of a sea cliff: which of its sides falls away to the sea?)
    const north = L.NORTH.stairs.includes(ST);
    let seaSide = 0;
    if (north) {
      const m = samples.length >> 1, [mx, mz] = samples[m], tx = samples[m + 1][0] - mx, tz = samples[m + 1][1] - mz, tl = Math.hypot(tx, tz);
      seaSide = hAt(mx + (tz / tl) * 6, mz - (tx / tl) * 6) < hAt(mx - (tz / tl) * 6, mz + (tx / tl) * 6) ? 1 : -1;
    }
    for (let q = 0; q < N * N; q++) {
      const d = sf.dist[q];
      if (d > 16) continue;
      const y = interp(ys, sf.pos[q]) - 0.16; // the ground lies just under the steps
      // (on the cliff the bed is cut wider than the steps: at this grain of relief a wall cut closer would bite into them)
      const e = d - sw - (north ? 1.25 : 0.15);
      // (a terrace is never built up, but the steps that arrive on it are cut into its edge)
      if (e <= 0) { H.d[q] = locked[q] ? Math.min(H.d[q], y) : y; detailMask.d[q] = 0; stairMask.d[q] = 1; }
      else {
        // Across the face of a sea cliff: towards the cliff the rock is cut back steeply, a notch and not a
        // valley; towards the sea nothing is left standing higher than the steps (no fin of rock between them
        // and the drop), and a bank of rock holds them up.
        const up = north ? (sf.side[q] === seaSide ? -0.3 + Math.max(0, e - 3) * 2 : e * 4.5) : e * 2.8;
        H.d[q] = locked[q] ? Math.min(H.d[q], y + up) : clamp(H.d[q], y - e * 1.5, y + Math.max(up, -e * 1.5));
        stairMask.d[q] = Math.max(stairMask.d[q], 1 - smoothstep(0, 1.3, e));
        if (e < 1) detailMask.d[q] = Math.min(detailMask.d[q], 0.4);
      }
      if (d < sw + (ST === L.STAIRWAY ? 3.5 : 6.5)) noTrees.d[q] = 1;
      if (north) goldBare.d[q] = Math.max(goldBare.d[q], 1 - smoothstep(3.5, 11, e));
    }
  }

  // --- the sky villages: shoulders and tops of the mountains that look down on the valley, far enough from
  // each other, each levelled into a small round shelf
  {
    const S = L.SKY, R = S.pad;
    const TARGETS = [[L.MILL.house.x, L.MILL.house.z, 24], [-60, 20, 14], [40, 0, 6], [-168, 70, 22]]; // the mill, the valley, the seafront, the great pond
    const sees = (x, y, z, [tx, tz, ty]) => {
      const d = Math.hypot(tx - x, tz - z), n = Math.ceil(d / 8);
      for (let k = 1; k < n; k++) { const t = k / n; if (hAt(x + (tx - x) * t, z + (tz - z) * t) > y + 2.5 + (ty + 10 - y - 2.5) * t) return false; }
      return true;
    };
    const taken = [[L.VILLAGE.square.x, L.VILLAGE.square.z, 95], ...L.STAIRWAY.points.map((p) => [p[0], p[1], 60]), ...FL.levels.map((t) => [t.bank[0][0], t.bank[0][1], 80]), [seaFall.x, seaFall.z, 70], [L.NORTH.ledge.x, L.NORTH.ledge.z, 90], [L.GLADE.x, L.GLADE.z, 84]];
    const cands = [];
    for (let z = -474; z <= 474; z += 6) for (let x = -474; x <= 474; x += 6) {
      const q = idx(Math.round(gi(x)), Math.round(gi(z))), d = boundsSDF.d[q];
      if (d < 70 || d > 330 || coastD.d[q] < 45) continue;
      const y = H.d[q];
      if (y < 60 || taken.some(([tx, tz, r]) => Math.hypot(x - tx, z - tz) < r)) continue;
      let lo = 1e9, hi = -1e9, above = 0;
      for (let a = 0; a < 8; a++) {
        const c = Math.cos((a * Math.PI) / 4), sn = Math.sin((a * Math.PI) / 4);
        for (const r of [R * 0.5, R]) { const v = hAt(x + c * r, z + sn * r); lo = Math.min(lo, v); hi = Math.max(hi, v); }
        if (hAt(x + c * 30, z + sn * 30) < y - 2) above++;
      }
      if (hi - lo > 16) continue;
      const seen = TARGETS.filter((t) => sees(x, y, z, t)).length;
      if (seen < 2) continue;
      cands.push({ x, z, y, score: seen * 3 + above * 1.2 - (hi - lo) * 0.25 + Math.min(y, 200) * 0.015 });
    }
    cands.sort((a, b) => b.score - a.score || a.x - b.x || a.z - b.z);
    for (const c of cands) {
      if (skySites.length >= S.count) break;
      if (skySites.every((p) => Math.hypot(p.x - c.x, p.z - c.z) > S.apart)) skySites.push(c);
    }
    if (skySites.length < S.count) throw new Error(`only ${skySites.length} sites for the sky villages`);
    // (in a stable order: from the north-west round to the south, so that a village keeps its number)
    skySites.sort((a, b) => Math.atan2(a.z, a.x + 60) - Math.atan2(b.z, b.x + 60));
    for (const p of skySites) {
      let sum = 0, cnt = 0;
      disc(p.x, p.z, R * 0.7, (q) => { sum += H.d[q]; cnt++; });
      p.y = sum / cnt - 0.4;
      disc(p.x, p.z, R + 9, (q, d) => {
        const k = 1 - smoothstep(R, R + 9, d);
        H.d[q] = lerp(H.d[q], p.y, k);
        skyMask.d[q] = Math.max(skyMask.d[q], 1 - smoothstep(R - 1.5, R + 3, d));
        if (d < R + 1) { detailMask.d[q] = 0; noTrees.d[q] = 1; }
      });
      // which way it looks: at the valley
      p.yaw = Math.atan2(-60 - p.x, 10 - p.z);
      // (round it the mountain stays green: see the land cover)
      disc(p.x, p.z, 200, (q, d) => { skyGreen.d[q] = Math.max(skyGreen.d[q], 1 - smoothstep(105, 200, d)); });
      // (the floors of its hall and of its pavilions: nothing grows there)
      const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
      for (const [lx, lz, hw, hl] of [[S.hall.x, S.hall.z, S.hall.hw + 0.9, S.hall.hl + 1.2], ...S.pavilions.map((v) => [v.x, v.z, v.h + 0.2, v.h + 0.2])]) {
        const cx = p.x + lx * c + lz * sn, cz = p.z - lx * sn + lz * c;
        disc(cx, cz, Math.hypot(hw, hl) + 1, (q, d, x, z) => { const u = (x - cx) * c - (z - cz) * sn, v = (x - cx) * sn + (z - cz) * c; if (Math.abs(u) < hw && Math.abs(v) < hl) skyPaved.d[q] = 1; });
      }
    }
    log(`  ${skySites.length} sky villages, ${Math.min(...skySites.map((p) => p.y)).toFixed(0)} to ${Math.max(...skySites.map((p) => p.y)).toFixed(0)} m`);
    // the Sky Gate in the valley: a small round place on the lawn
    const G = S.gate;
    let sum = 0, cnt = 0;
    disc(G.x, G.z, 3, (q) => { sum += H.d[q]; cnt++; });
    const gy = sum / cnt;
    disc(G.x, G.z, 9, (q, d) => {
      H.d[q] = lerp(H.d[q], gy, 1 - smoothstep(4.2, 9, d));
      skyMask.d[q] = Math.max(skyMask.d[q], 1 - smoothstep(3.6, 5.6, d));
      if (d < 6) { detailMask.d[q] = Math.min(detailMask.d[q], 0.2); noTrees.d[q] = 1; }
    });
  }

  // --- the camp: a clearing on its wooded rise, gently levelled
  const C = L.CAMP;
  let sum = 0, cnt = 0;
  disc(C.x, C.z, 6, (q) => { sum += H.d[q]; cnt++; });
  const campY = sum / cnt;
  disc(C.x, C.z, C.r + 8, (q, d) => {
    H.d[q] = lerp(H.d[q], campY, (1 - smoothstep(C.r - 4, C.r + 7, d)) * 0.9);
    campMask.d[q] = 1 - smoothstep(C.r - 5, C.r + 0.5, d);
    if (d < C.r) noTrees.d[q] = 1;
  });
  // --- the lawn of the Sky Stones, levelled into the hillside
  const K = L.CLIMB;
  disc(K.x, K.z, K.r + 9, (q, d) => {
    H.d[q] = lerp(H.d[q], K.y, 1 - smoothstep(K.r, K.r + 9, d));
    if (d < K.r + 1) { detailMask.d[q] = 0; noTrees.d[q] = 1; }
    climbMask.d[q] = 1 - smoothstep(K.r - 0.5, K.r + 2.5, d);
  });
  disc(K.x, K.z, K.r + 16, (q) => { noTrees.d[q] = 1; }); // (and no tree in the way of those who fall)
  {
    // …and, behind the lawn, a bay cut into the hill at the same level: the tower of those who watch stands in it
    const T = K.tower, ux = T.x - K.x, uz = T.z - K.z, len2 = ux * ux + uz * uz;
    disc(T.x, T.z, T.r + 32, (q, d, x, z) => {
      const t = clamp(((x - K.x) * ux + (z - K.z) * uz) / len2, 0, 1);
      const e = Math.hypot(x - K.x - ux * t, z - K.z - uz * t) - T.r; // how far outside the bay
      if (e > 8) return;
      H.d[q] = lerp(H.d[q], K.y, 1 - smoothstep(0, 8, e));
      if (e < 1) detailMask.d[q] = 0;
      climbMask.d[q] = Math.max(climbMask.d[q], 1 - smoothstep(-0.5, 2.5, e));
    });
    disc(T.x, T.z, T.r + 9, (q) => { noTrees.d[q] = 1; });
  }
  // --- the acid pond: a bowl in the woods, bare and burnt round its rim
  {
    const A = L.ACID;
    let sum = 0, cnt = 0;
    disc(A.x, A.z, A.r + 2.5, (q, d) => { if (d > A.r + 1.5) { sum += H.d[q]; cnt++; } });
    const rim = sum / cnt;
    disc(A.x, A.z, A.r + 7, (q, d) => {
      const bowl = rim - 1.7 * (1 - smoothstep(A.r * 0.25, A.r + 1.2, d));
      H.d[q] = lerp(H.d[q], bowl, 1 - smoothstep(A.r + 2, A.r + 7, d));
      if (d < A.r + 2) { detailMask.d[q] = 0.3; noTrees.d[q] = 1; }
      acidMask.d[q] = 1 - smoothstep(A.r + 0.5, A.r + 3.5, d);
    });
    acidLevel = rim - 0.62;
  }
  // --- nothing grows where people lounge
  disc(L.BEACH_LOUNGE.x, L.BEACH_LOUNGE.z, L.BEACH_LOUNGE.r + 1, (q) => { noTrees.d[q] = 1; });
  disc(L.COVE.x, L.COVE.z, L.COVE.r, (q) => { noTrees.d[q] = 1; }); // (the camp; the hollow behind it keeps its trees)
  // --- cave mouths: level ground in front (not in the pool of the waterfall), nothing planted before or above them
  for (const c of L.CAVES) {
    const [mx, mz, mr, floor] = c.nodes[0], [nx, nz] = c.nodes[1];
    const l = Math.hypot(nx - mx, nz - mz), ax = (nx - mx) / l, az = (nz - mz) / l; // into the rock
    disc(mx, mz, 9, (q, d, x, z) => {
      noTrees.d[q] = 1;
      const along = (x - mx) * ax + (z - mz) * az, across = Math.abs((x - mx) * az - (z - mz) * ax);
      if (!c.water && along < 0.5 && along > -5 && across < mr + 2.5) {
        const w = (1 - smoothstep(mr + 0.5, mr + 2.5, across)) * (1 - smoothstep(-2.5, -5, along));
        H.d[q] = lerp(H.d[q], floor - 0.04, w);
        if (w > 0.5) detailMask.d[q] = 0;
      }
      // a mouth on the sea: the bed rises to the doorstep, so that a swimmer walks out of the water
      if (c.slip && along < 0.3 && along > -c.slip - 2 && across < mr + 2) {
        const w = 1 - smoothstep(mr, mr + 2, across), sill = lerp(floor - 0.05, H.d[q], smoothstep(0.3, c.slip, -along));
        if (sill > H.d[q]) H.d[q] = lerp(H.d[q], sill, w);
        detailMask.d[q] = Math.min(detailMask.d[q], 1 - w);
      }
      // (no grass in the mouth itself, where the ground is cut away)
      if (along > -1.2 && along < c.open + 5 && across < mr + 1.5) caveMouth.d[q] = 1;
    });
  }
}

// ---------------------------------------------------------------------------
// 5. Roads and paths (graded onto a smoothed longitudinal profile)

log('paths');
const pathMask = { asphalt: new Grid(N, N), gravel: new Grid(N, N), dirt: new Grid(N, N) };
const pathClear = new Grid(N, N, 1e9); // distance to the nearest path edge (for tree exclusion)
const paths = L.PATHS.map((p) => {
  let pts = resample(smoothPath(p.points, { step: 1 }), 1);
  const inside = (q) => Math.abs(q[0]) < HALF + 30 && Math.abs(q[1]) < HALF + 30;
  pts = pts.filter(inside);
  // longitudinal profile from the current terrain, smoothed
  const prof = new Float64Array(pts.length);
  for (let k = 0; k < pts.length; k++) prof[k] = H.sample(gi(pts[k][0]), gi(pts[k][1]));
  const win = p.kind === 'asphalt' ? 16 : 6;
  const sm = new Float64Array(pts.length);
  for (let k = 0; k < pts.length; k++) {
    let s = 0, wsum = 0;
    for (let m = -win * 2; m <= win * 2; m++) {
      const kk = clamp(k + m, 0, pts.length - 1);
      const w = Math.exp(-(m * m) / (2 * win * win));
      s += prof[kk] * w; wsum += w;
    }
    sm[k] = s / wsum;
  }
  return { ...p, samples: pts.map((q, k) => [q[0], q[1], sm[k]]) };
});
const waterNear = new Grid(N, N, 1e9); // distance to any pond/stream (filled later, used by paths)
for (const p of paths) {
  const half = p.width / 2;
  const shoulder = p.kind === 'asphalt' ? 3.2 : 1.6;
  const f = polylineField(p.samples, half + shoulder + 4);
  const ys = p.samples.map((q) => q[2]);
  for (let q = 0; q < N * N; q++) {
    const d = f.dist[q];
    if (d > half + shoulder + 3) continue;
    const y = interp(ys, f.pos[q]);
    const w = (1 - smoothstep(half, half + shoulder, d)) * p.cut;
    H.d[q] = lerp(H.d[q], y, w);
    const cover = 1 - smoothstep(half - 0.35, half + 0.45, d);
    const m = pathMask[p.kind];
    if (cover > m.d[q]) m.d[q] = cover;
    if (d < half + 1.2) detailMask.d[q] = Math.min(detailMask.d[q], p.kind === 'asphalt' ? 0 : 0.25);
    const edge = d - half - (p.kind === 'asphalt' ? 2.6 : 1.1);
    if (edge < pathClear.d[q]) pathClear.d[q] = edge;
  }
}

// ---------------------------------------------------------------------------
// 6. Pads, buildings, rock garden

log('pads & garden');
const padMask = new Grid(N, N); // 1 = authored hard surface (no vegetation)
function applyPad(outline, y, feather, markMask = 1) {
  const sdf = polygonSDF(outline);
  for (let q = 0; q < N * N; q++) {
    const d = sdf.d[q];
    if (d > feather + 1) continue;
    const w = 1 - smoothstep(0, feather, d);
    H.d[q] = lerp(H.d[q], y, w);
    if (d < 0.6) { detailMask.d[q] = 0; if (markMask) padMask.d[q] = Math.max(padMask.d[q], markMask); }
  }
  return sdf;
}

// rock garden slope with dry-stone terraces
{
  const g = L.ROCK_GARDEN;
  const sdf = polygonSDF(g.outline);
  const o = [-128, -4.5];
  const slopeAt = (x, z) => {
    const t = clamp(((x - o[0]) * g.up[0] + (z - o[1]) * g.up[1]) / g.run, 0, 1);
    return g.baseY + (g.topY - g.baseY) * (t * 0.25 + 0.75 * smoothstep(0, 1, t));
  };
  const target = new Grid(N, N);
  for (let q = 0; q < N * N; q++) {
    if (sdf.d[q] > 8) continue;
    const i = q % N, j = (q / N) | 0;
    target.d[q] = slopeAt(wx(i), wx(j));
  }
  for (const wall of L.TERRACES) {
    const pts = resample(smoothPath(wall.points, { step: 0.5 }), 0.5);
    const f = polylineField(pts, 5);
    const base = pts.map((p) => slopeAt(p[0], p[1]));
    for (let q = 0; q < N * N; q++) {
      const d = f.dist[q];
      if (d > 4.2 || sdf.d[q] > 6) continue;
      const pos = f.pos[q];
      const endFade = smoothstep(0, 3, pos) * smoothstep(0, 3, pts.length - 1 - pos);
      const sd = d * f.side[q]; // + = uphill
      const hb = interp(base, pos);
      const step = sd >= 0 ? wall.h * 0.55 : -wall.h * 0.45;
      const flat = hb + step + sd * 0.06;
      const w = (1 - smoothstep(1.6, 4.2, d)) * endFade;
      target.d[q] = lerp(target.d[q], flat, w);
    }
  }
  for (let q = 0; q < N * N; q++) {
    const d = sdf.d[q];
    if (d > 7) continue;
    const w = 1 - smoothstep(-1.5, 6, d);
    H.d[q] = lerp(H.d[q], target.d[q], w);
    if (d < 0) detailMask.d[q] = Math.min(detailMask.d[q], 0.35);
  }
}
const gardenSDF = polygonSDF(L.ROCK_GARDEN.outline);

const padSDF = {};
for (const pad of L.PADS) padSDF[pad.id] = applyPad(pad.outline, pad.y, pad.feather);
// seafront boardwalk: level strip at the back of the beach
const promField = polylineField(resample(smoothPath(L.PROMENADE.points, { step: 1 }), 1), 40);
for (let q = 0; q < N * N; q++) {
  const d = promField.dist[q];
  if (d > 30) continue;
  const half = L.PROMENADE.width / 2;
  const w = 1 - smoothstep(half + 0.3, half + 9, d);
  // only ever raise towards the sea side / ease the land side: keep the beach face below
  const seaSide = coastD.d[q] < BW + 8;
  const tgt = L.PROMENADE.y;
  H.d[q] = d <= half + 0.3 ? tgt : lerp(H.d[q], seaSide ? Math.min(H.d[q], tgt) : tgt, w * (seaSide ? 0.35 : 0.9));
  if (d < half + 0.4) { detailMask.d[q] = 0; padMask.d[q] = Math.max(padMask.d[q], 1); }
}
const buildingSDF = new Grid(N, N, 1e9);
for (const key of ['house', 'annexA', 'annexB', 'shed']) {
  const fr = L.MILL[key];
  const rect = L.frameRect(fr, 0.8);
  const y = key === 'shed' ? H.sample(gi(fr.x), gi(fr.z)) : L.LEVELS.court;
  const sdf = applyPad(rect, y, key === 'shed' ? 1.5 : 2.5);
  for (let q = 0; q < N * N; q++) if (sdf.d[q] < buildingSDF.d[q]) buildingSDF.d[q] = sdf.d[q];
}
// garden lawn east of the house: slopes from the facade down to the mill pool
{
  const fr = L.MILL.house;
  const lawn = [L.frameToWorld(fr, 3.7, -9.5), L.frameToWorld(fr, 9.5, -10.5), L.frameToWorld(fr, 10, 9), L.frameToWorld(fr, 3.7, 8.6)];
  const sdf = polygonSDF(lawn);
  for (let q = 0; q < N * N; q++) {
    const d = sdf.d[q];
    if (d > 5) continue;
    const i = q % N, j = (q / N) | 0;
    const x = wx(i), z = wx(j);
    // distance east of the facade plane
    const c = Math.cos(fr.yaw), s = Math.sin(fr.yaw);
    const lx = (x - fr.x) * c - (z - fr.z) * s;
    const y = lerp(L.LEVELS.court - 0.45, L.LEVELS.court - 1.5, smoothstep(3.7, 10, lx));
    H.d[q] = lerp(H.d[q], y, (1 - smoothstep(0, 5, d)) * 0.9);
  }
}

// ---------------------------------------------------------------------------
// 7. Stream beds, dam, mill race (final carving)

log('channels & dam');
const streamField = new Grid(N, N, 1e9);
const streamLevel = new Grid(N, N, -1e9);
for (const s of streams) {
  const f = streamBed(s);
  const ys = s.samples.map((p) => p[2]);
  const ws = s.samples.map((p) => p[3]);
  for (let q = 0; q < N * N; q++) {
    if (f.dist[q] > 11) continue;
    const e = f.dist[q] - interp(ws, f.pos[q]) / 2; // distance to the water edge
    if (e < streamField.d[q]) { streamField.d[q] = e; streamLevel.d[q] = interp(ys, f.pos[q]); }
  }
}
{
  // dam crest (walkable), with a notch at the sluice
  const crest = resample(L.DAM.crest.map((p) => [p[0], p[1]]), 0.5);
  const f = polylineField(crest, 6);
  for (let q = 0; q < N * N; q++) {
    const d = f.dist[q];
    if (d > 4) continue;
    const w = 1 - smoothstep(L.DAM.width / 2, L.DAM.width / 2 + 1.1, d);
    // only raise on the downstream side and the crest itself; never fill the pond
    if (ponds[0].sdf.d[q] > -0.3) H.d[q] = lerp(H.d[q], L.DAM.crestY, w);
    if (w > 0.5) { detailMask.d[q] = 0; padMask.d[q] = Math.max(padMask.d[q], 1); }
  }
}

{
  // the plunge pool of the great waterfall: deep enough to dive into from the terrace above
  const P = L.PLUNGE, ux = P.b[0] - P.a[0], uz = P.b[1] - P.a[1], len2 = ux * ux + uz * uz;
  disc((P.a[0] + P.b[0]) / 2, (P.a[1] + P.b[1]) / 2, Math.sqrt(len2) / 2 + P.r + 1, (q, d, x, z) => {
    if (streamField.d[q] > -0.2 || caveMouth.d[q] > 0) return; // water only, and not the doorstep of the grotto
    const t = clamp(((x - P.a[0]) * ux + (z - P.a[1]) * uz) / len2, 0, 1);
    const e = Math.hypot(x - P.a[0] - ux * t, z - P.a[1] - uz * t) / P.r;
    if (e >= 1) return;
    // (from the shore: a shelf one can walk up, as deep as one stands; then it drops)
    const off = -streamField.d[q] - 0.2, stand = 1.3 / P.shelf, bank = off < stand ? off * P.shelf : 1.3 + (off - stand) * 2.5;
    const depth = Math.min(P.depth * (1 - smoothstep(0.35, 1, e)), bank);
    H.d[q] = Math.min(H.d[q], streamLevel.d[q] - depth);
  });
}

// ---------------------------------------------------------------------------
// 8. Small scale detail

log('detail noise');
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const q = idx(i, j);
    const m = detailMask.d[q];
    if (m <= 0) continue;
    const x = wx(i), z = wx(j);
    const forest = smoothstep(3, 9, canopy.d[q]);
    const n = fbm(x / 26, z / 26, { seed: 3, octaves: 4 }) * 0.42 + fbm(x / 6.5, z / 6.5, { seed: 4, octaves: 3 }) * (0.07 + 0.1 * forest);
    H.d[q] += n * m;
  }
}
// rocky relief on steep ground (cliffs)
{
  const tmp = H.clone();
  for (let j = 1; j < N - 1; j++) {
    for (let i = 1; i < N - 1; i++) {
      const q = idx(i, j);
      const sx = (tmp.d[q + 1] - tmp.d[q - 1]) / 2, sz = (tmp.d[q + N] - tmp.d[q - N]) / 2;
      const slope = Math.hypot(sx, sz);
      const k = smoothstep(0.55, 1.1, slope) * detailMask.d[q];
      if (k > 0) {
        const x = wx(i), z = wx(j);
        H.d[q] += (ridged(x / 9, z / 9, { seed: 71, octaves: 4 }) - 0.5) * 1.8 * k + (ridged(x / 2.8, z / 2.8, { seed: 72, octaves: 2 }) - 0.5) * 0.45 * k;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 9. Water level map

log('water map');
const WATER_NONE = HMIN; // encodes to 0
const waterY = new Grid(N, N, WATER_NONE);
const shoreIn = new Grid(N, N, 0); // metres from the shore, inside water (0 on land)
const NEAR = 3.4; // the level stays valid this far outside a water body (shore blending in the shaders)
{
  // 1) cells that really are water, 2) a thin ring around them where the level is known but the ground is dry
  const inside = new Uint8Array(N * N);
  const ring = new Float32Array(N * N).fill(1e9);
  const ringLevel = new Float32Array(N * N);
  for (let q = 0; q < N * N; q++) {
    let lvl = null;
    for (const p of ponds) {
      const d = p.sdf.d[q];
      if (d > NEAR) continue;
      const dEdge = Math.max(d, -p.island.d[q]);
      if (dEdge <= 0) { lvl = p.level; break; }
      if (dEdge < ring[q]) { ring[q] = dEdge; ringLevel[q] = p.level; }
    }
    if (lvl === null && streamField.d[q] < NEAR) {
      const e = streamField.d[q];
      if (e <= 0.55) lvl = streamLevel.d[q];
      else if (e < ring[q]) { ring[q] = e; ringLevel[q] = streamLevel.d[q]; }
    }
    if (lvl === null && coastD.d[q] < NEAR + 30) {
      if (H.d[q] < L.LEVELS.sea && coastD.d[q] < 1.5) lvl = L.LEVELS.sea;
      else { const e = Math.max(0.01, coastD.d[q]); if (e < ring[q] && e < NEAR + 30) { ring[q] = e; ringLevel[q] = L.LEVELS.sea; } }
    }
    if (lvl !== null) { inside[q] = 1; waterY.d[q] = lvl; if (H.d[q] > lvl - 0.02) H.d[q] = lvl - 0.02; }
  }
  for (let q = 0; q < N * N; q++) {
    if (inside[q] || ring[q] > NEAR + 30) continue;
    const lvl = ringLevel[q];
    const isSea = lvl === L.LEVELS.sea;
    if (!isSea && ring[q] > NEAR) continue;
    waterY.d[q] = lvl;
    // dry ground next to water never dips below the surface
    const minH = lvl + Math.min(0.12, 0.03 + ring[q] * 0.05);
    if (H.d[q] < minH) H.d[q] = minH;
  }
  const dry = new Uint8Array(N * N);
  for (let q = 0; q < N * N; q++) dry[q] = inside[q] ? 0 : 1;
  const dd = distanceTo(dry, N, N);
  for (let q = 0; q < N * N; q++) shoreIn.d[q] = inside[q] ? dd.d[q] : 0;
  const dw = distanceTo(inside, N, N);
  for (let q = 0; q < N * N; q++) waterNear.d[q] = dw.d[q];
}

// ---------------------------------------------------------------------------
// 10. Normals, ambient occlusion, slope

log('normals & AO');
const NX = new Grid(N, N), NZ = new Grid(N, N), NY = new Grid(N, N), SLOPE = new Grid(N, N), AO = new Grid(N, N, 1);
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const q = idx(i, j);
    const sx = (H.get(i + 1, j) - H.get(i - 1, j)) / 2, sz = (H.get(i, j + 1) - H.get(i, j - 1)) / 2;
    const l = Math.hypot(sx, 1, sz);
    NX.d[q] = -sx / l; NY.d[q] = 1 / l; NZ.d[q] = -sz / l;
    SLOPE.d[q] = Math.hypot(sx, sz);
  }
}
{
  const dirs = [];
  for (let k = 0; k < 8; k++) dirs.push([Math.cos((k / 8) * Math.PI * 2 + 0.3), Math.sin((k / 8) * Math.PI * 2 + 0.3)]);
  const radii = [1.5, 3, 6, 12, 24];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const q = idx(i, j);
      const h = H.d[q];
      let occ = 0;
      for (const [dx, dz] of dirs) {
        let m = 0;
        for (const r of radii) {
          const v = (H.get(Math.round(i + dx * r), Math.round(j + dz * r)) - h) / r;
          if (v > m) m = v;
        }
        occ += m / Math.sqrt(1 + m * m);
      }
      AO.d[q] = clamp(1 - 0.95 * (occ / 8), 0, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// 11. Land cover

log('land cover');
const cover = canopy.map((v) => smoothstep(2.5, 7, v)).blur(2.2); // tree canopy presence
// On the mountains the woods are invented: broad stands, thinning out with altitude, absent from crags.
const TREE_LINE = 112;
const woods = (x, z, h, slope) => smoothstep(-0.2, 0.22, fbm(x / 95, z / 95, { seed: 301, octaves: 3 }) + 0.42 - Math.max(0, h - 60) / 150)
  * (1 - smoothstep(1.0, 1.4, slope)) * (1 - smoothstep(TREE_LINE - 30, TREE_LINE, h));
for (let q = 0; q < N * N; q++) {
  const d = boundsSDF.d[q];
  if (d <= 0) continue;
  const i = q % N, j = (q / N) | 0;
  let w = woods(wx(i), wx(j), H.d[q], SLOPE.d[q]);
  // round the sky villages groves hold on above the tree line (not on crags, not on the shelves themselves)
  if (skyGreen.d[q] > 0) w = Math.max(w, skyGreen.d[q] * 0.8 * smoothstep(-0.08, 0.2, fbm(wx(i) / 58, wx(j) / 58, { seed: 311, octaves: 3 }) + 0.06) * (1 - smoothstep(0.9, 1.3, SLOPE.d[q])));
  cover.d[q] = lerp(cover.d[q], w * (H.d[q] > 0.8 ? 1 : 0), smoothstep(0, 12, d));
}
const parkMask = new Grid(N, N);
for (const poly of L.PARK) {
  const sdf = polygonSDF(poly);
  for (let q = 0; q < N * N; q++) parkMask.d[q] = Math.max(parkMask.d[q], 1 - smoothstep(-6, 4, sdf.d[q]));
}
for (let q = 0; q < N * N; q++) parkMask.d[q] *= 1 - smoothstep(-4, 4, boundsSDF.d[q]);
const fieldSoil = new Grid(N, N), fieldCrop = new Grid(N, N), fieldKind = new Uint8Array(N * N);
L.FIELDS.forEach((f, k) => {
  const sdf = polygonSDF(f.outline);
  for (let q = 0; q < N * N; q++) {
    const w = 1 - smoothstep(-4, 1, sdf.d[q]);
    if (w <= 0) continue;
    if (f.crop === 'soil') fieldSoil.d[q] = Math.max(fieldSoil.d[q], w);
    else if (w > fieldCrop.d[q]) { fieldCrop.d[q] = w; fieldKind[q] = f.crop === 'wheat' ? 1 : 2; }
  }
});

// layers: 0 lawn, 1 meadow, 2 forest floor, 3 dirt, 4 rock, 5 sand, 6 gravel, 7 soil
const slopeWide = SLOPE.blur(3); // cliffs are steep over a wide area, garden banks are not
const LAYERS = 8;
const W = Array.from({ length: LAYERS }, () => new Grid(N, N));
const grassH = new Grid(N, N); // 0..1 blade height factor
const tint = [new Grid(N, N, 1), new Grid(N, N, 1), new Grid(N, N, 1)];
const over = (q, layer, a) => {
  if (a <= 0) return;
  a = Math.min(1, a);
  for (let k = 0; k < LAYERS; k++) W[k].d[q] *= 1 - a;
  W[layer].d[q] += a;
};
const mulTint = (q, r, g, b, a = 1) => {
  tint[0].d[q] = lerp(tint[0].d[q], tint[0].d[q] * r, a);
  tint[1].d[q] = lerp(tint[1].d[q], tint[1].d[q] * g, a);
  tint[2].d[q] = lerp(tint[2].d[q], tint[2].d[q] * b, a);
};
const setTint = (q, r, g, b, a = 1) => {
  tint[0].d[q] = lerp(tint[0].d[q], r, a);
  tint[1].d[q] = lerp(tint[1].d[q], g, a);
  tint[2].d[q] = lerp(tint[2].d[q], b, a);
};

for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const q = idx(i, j);
    const x = wx(i), z = wx(j);
    const h = H.d[q];
    const slope = SLOPE.d[q];
    const wl = waterY.d[q];
    const above = wl > WATER_NONE + 0.5 ? h - wl : 99;
    const cov = cover.d[q];
    const park = parkMask.d[q];
    const nA = fbm(x / 60, z / 60, { seed: 31, octaves: 4 });
    const nB = fbm(x / 9, z / 9, { seed: 32, octaves: 3 });
    const nC = fbm(x / 3.1, z / 3.1, { seed: 33, octaves: 2 });

    // --- base cover
    W[1].d[q] = 1; // meadow
    let gh = 0.62 + 0.18 * nB;
    // macro patchiness of the meadows
    mulTint(q, 1 + 0.1 * nA + 0.05 * nB, 1 + 0.04 * nA, 1 - 0.1 * nA, 1);

    if (fieldCrop.d[q] > 0) {
      const a = fieldCrop.d[q];
      const rows = 0.5 + 0.5 * Math.sin((x * 0.83 + z * 0.56) * 2.4); // drill lines
      if (fieldKind[q] === 1) { setTint(q, 1.32, 1.12, 0.52, a * 0.95); gh = lerp(gh, 0.95 + 0.05 * rows, a); }
      else { setTint(q, 0.72, 1.0, 0.62, a * 0.9); gh = lerp(gh, 0.8, a); }
      mulTint(q, 1 - 0.07 * rows, 1 - 0.05 * rows, 1 - 0.05 * rows, a);
    }
    if (fieldSoil.d[q] > 0) {
      const a = fieldSoil.d[q];
      over(q, 7, a);
      gh *= 1 - a;
      mulTint(q, 1 + 0.08 * nA, 1 + 0.05 * nA, 1 + 0.02 * nA, a);
    }
    if (park > 0) {
      over(q, 0, park * (1 - fieldSoil.d[q]));
      gh = lerp(gh, 0.2 + 0.05 * nB, park);
      const stripes = Math.sin((x * 0.94 - z * 0.34) * 1.6);
      mulTint(q, 1 + 0.03 * stripes, 1 + 0.025 * stripes, 1, park * 0.6);
    }
    // forest floor under the canopy (parkland keeps its grass under specimen trees)
    const forest = cov * lerp(1, 0.3, park);
    over(q, 2, forest * (0.85 + 0.3 * nB));
    // under the trees only a few patches of woodland grass survive
    gh = lerp(gh, 0.34 * smoothstep(0.15, 0.4, nA + 0.5 * nB), smoothstep(0.25, 0.7, forest));

    // --- garden, courtyard, hard surfaces
    const gardenIn = 1 - smoothstep(-1.5, 1.5, gardenSDF.d[q]);
    if (gardenIn > 0) {
      over(q, 3, gardenIn * 0.85);
      over(q, 6, gardenIn * smoothstep(0.1, 0.5, nC) * 0.5);
      gh = lerp(gh, 0.0, gardenIn);
      mulTint(q, 0.7, 0.67, 0.66, gardenIn); // darker, mulched beds
    }
    for (const id of ['court', 'drive', 'plaza']) {
      const a = 1 - smoothstep(-0.4, 0.8, padSDF[id].d[q]);
      if (a > 0) {
        over(q, 6, a);
        gh *= 1 - a;
        if (id === 'drive') setTint(q, 0.62, 0.62, 0.64, a);
        if (id === 'plaza') setTint(q, 1.08, 1.02, 0.94, a);
      }
    }
    if (padMask.d[q] > 0) { over(q, 6, padMask.d[q]); gh *= 1 - padMask.d[q]; }
    const bd = buildingSDF.d[q];
    if (bd < 1.6) { const a = 1 - smoothstep(0.6, 1.6, bd); over(q, 6, a * 0.9); gh *= 1 - a; }

    // --- paths
    const pa = pathMask.asphalt.d[q], pg = pathMask.gravel.d[q], pd = pathMask.dirt.d[q];
    if (pg > 0) { over(q, 6, pg * (0.9 + 0.2 * nC)); gh *= 1 - pg; }
    if (pd > 0) { over(q, 3, pd * (0.85 + 0.3 * nC)); gh *= 1 - pd; setTint(q, 1.08, 1.0, 0.9, pd * 0.7); }
    if (pa > 0) { over(q, 6, pa); gh *= 1 - pa; setTint(q, 0.3, 0.31, 0.33, pa); }
    // worn verge along tracks
    const verge = 1 - smoothstep(0, 1.6, pathClear.d[q] + 1.1);
    if (verge > 0 && pa + pg + pd < 0.5) gh *= 1 - 0.35 * verge;

    // --- mountains: the grass gets shorter and paler with altitude
    const mount = boundsSDF.d[q] > 0 ? smoothstep(0, 30, boundsSDF.d[q]) : 0;
    if (mount > 0) {
      const alt = smoothstep(50, 150, h) * (1 - 0.7 * skyGreen.d[q]);
      gh = lerp(gh, 0.34 - 0.12 * alt, mount);
      mulTint(q, 1 + 0.16 * alt, 1 + 0.06 * alt, 1 - 0.06 * alt, mount);
      if (gladeMask.d[q] > 0) { const a = gladeMask.d[q]; gh = lerp(gh, 0.44 + 0.08 * nA, a); mulTint(q, 0.9, 1.1, 0.78, a); } // the meadow of the high clearing: tall and lush
    }

    // --- the village (gravel lanes, short grass), the camp (trodden earth under the trees)
    const vd = villageSDF.d[q];
    if (vd < 3) {
      const a = 1 - smoothstep(-1, 3, vd);
      const lanes = smoothstep(-0.25, 0.2, fbm(x / 13, z / 13, { seed: 61, octaves: 2 }) + 0.25 - Math.hypot(x - L.VILLAGE.square.x, z - L.VILLAGE.square.z) / 60);
      over(q, 6, a * lanes * 0.9);
      gh = lerp(gh, 0.2 * (1 - lanes), a);
      setTint(q, 1.04, 1.0, 0.94, a * lanes * 0.6);
    }
    if (campMask.d[q] > 0) { over(q, 3, campMask.d[q] * 0.75); gh *= 1 - campMask.d[q] * 0.9; }
    // the lawn of the Sky Stones (mown), the burnt rim of the acid pond
    if (climbMask.d[q] > 0) { const a = climbMask.d[q]; over(q, 0, a); gh = lerp(gh, 0.12, a); setTint(q, 1.02, 1.06, 0.9, a * 0.6); }
    if (acidMask.d[q] > 0) { const a = acidMask.d[q]; over(q, 4, a * 0.85); over(q, 7, a * 0.5 * smoothstep(0.1, 0.5, nC)); gh *= 1 - a; setTint(q, 0.62, 0.72, 0.42, a); }
    // the terraces above the falls (bare rock, a little gravel), the shelves of the sky villages (a gravel court, mown grass)
    if (terraceMask.d[q] > 0) { const a = terraceMask.d[q]; over(q, 4, a * 0.9); over(q, 6, a * 0.45 * smoothstep(0.0, 0.5, nC)); gh *= 1 - a; }
    if (skyMask.d[q] > 0) { const a = skyMask.d[q]; over(q, 0, a); over(q, 6, a * 0.8 * smoothstep(0.1, 0.45, nB + 0.35)); gh = lerp(gh, 0.14, a); setTint(q, 1.03, 1.04, 0.92, a * 0.6); }
    if (skyPaved.d[q] > 0) gh = 0;

    // --- slopes
    // grass holds on banks up to about 45 degrees; beyond that the soil shows (bare rock on the mountains)
    const dirtS = smoothstep(0.86, 1.2, slope + 0.12 * nB);
    const rockS = smoothstep(1.05, 1.5, slopeWide.d[q] + 0.15 * nB) * smoothstep(0.7, 1.0, slope);
    over(q, 3, dirtS * 0.9 * (1 - 0.7 * mount));
    // (bare rock takes over with altitude — except round the sky villages, where alpine meadows hold on)
    over(q, 4, Math.max(rockS, mount * Math.max(smoothstep(0.8, 1.15, slope + 0.12 * nB), smoothstep(TREE_LINE + 20, TREE_LINE + 90, h + 30 * nA) * 0.75 * (1 - 0.92 * skyGreen.d[q]))));
    gh *= 1 - smoothstep(0.8, 1.2, slope);

    // --- sea cliffs: whatever can hold on to them is green. (The renderer paints steep ground as rock, except
    // where the tint is this lush green: there, moss and grass hang on the face.)
    if (seaCliff.d[q] > 0 && h > 1.2) {
      const a = seaCliff.d[q] * smoothstep(1.2, 5, h) * (1 - goldBare.d[q]);
      setTint(q, 0.5 + 0.1 * nA, 1.3 + 0.08 * nB, 0.34, a * 0.92);
      gh = lerp(gh, 0.5 * (1 - smoothstep(0.6, 1.0, slope)), a);
    }

    // --- sea shore
    const b = beach.d[q];
    const cd = coastD.d[q];
    if (cd < 150) {
      const sandy = b * (1 - smoothstep(2.9 + 0.5 * nB, 4.3 + 0.5 * nB, h)) * (1 - smoothstep(BW + 5, BW + 14, cd)) * (1 - Math.min(1, padMask.d[q]));
      over(q, 5, sandy);
      gh = lerp(gh, 0, Math.min(1, sandy * 1.6));
      // dune grass fringe behind the beach
      const dune = b * smoothstep(0.2, 0.8, sandy) * smoothstep(2.4, 3.0, h);
      gh = Math.max(gh, dune * 0.55 * smoothstep(-0.2, 0.3, nB));
      // rocky shore
      const rocky = (1 - b) * (1 - smoothstep(1.5, 5, h + 2 * nB)) * (1 - smoothstep(8, 30, Math.abs(cd)));
      over(q, 4, rocky);
      if (h < 0.4) { over(q, 5, b); over(q, 4, (1 - b) * smoothstep(-6, -1, h)); over(q, 5, (1 - b) * (1 - smoothstep(-6, -1.5, h)) * 0.8); }
    }

    // --- the island: rock, short grass on its ledges, sand only where one lands; the steps of the stairway
    if (islandMask.d[q] > 0) {
      const sand = islandSand.d[q] * (1 - smoothstep(1.3, 2.4, h));
      const rock = Math.max(smoothstep(0.55, 1.0, slope + 0.1 * nB), 1 - smoothstep(0.3, 1.6, h)) * (1 - sand);
      W[5].d[q] *= sand; // (the shore logic above put sand everywhere near the water)
      over(q, 4, rock);
      over(q, 5, sand);
      if (pd > 0) over(q, 3, pd * 0.9 * (1 - sand));
      gh = h > 1.5 ? 0.3 * (1 - rock) * (1 - pd) : 0;
    }
    if (stairMask.d[q] > 0) { over(q, 4, stairMask.d[q]); gh *= 1 - stairMask.d[q]; setTint(q, 1.02, 1.0, 0.97, stairMask.d[q] * 0.8); }
    // --- the golden cove: bare rock round it, pale sand at the foot of the cliff; the ledge of the statue is a hard floor
    if (goldBare.d[q] > 0) { const a = goldBare.d[q]; over(q, 4, a * 0.85); gh *= 1 - a; }
    if (goldSand.d[q] > 0) { const a = goldSand.d[q] * (1 - smoothstep(2.4, 3.6, h)); over(q, 5, a); gh *= 1 - a; setTint(q, 1.06, 1.0, 0.9, a); }
    if (goldPad.d[q] > 0) { over(q, 6, goldPad.d[q]); gh *= 1 - goldPad.d[q]; setTint(q, 1.1, 1.03, 0.92, goldPad.d[q]); }

    // --- banks and beds of fresh water
    if (wl > 0.5 && (above < 0.05 || waterNear.d[q] < 2.2)) {
      const isStream = streamField.d[q] < 3 && Math.abs(streamLevel.d[q] - wl) < 0.05;
      // a narrow strip of bare, damp ground at the water's edge; everything under water
      const strip = above < 0.02 ? 1 : (1 - smoothstep(0.25, 1.5 + 0.7 * nB, waterNear.d[q])) * (1 - smoothstep(0.2, 0.6, above));
      if (isStream) {
        over(q, 6, strip * 0.95);
        over(q, 4, strip * smoothstep(0.15, 0.6, nC) * 0.6);
      } else {
        over(q, 3, strip * 0.92);
        over(q, 6, strip * smoothstep(0.0, 0.5, nC) * smoothstep(-0.9, -0.1, above) * 0.7);
        over(q, 4, strip * smoothstep(0.35, 0.7, nB) * 0.35);
      }
      gh *= 1 - strip;
    }
    if (above < 0.03 || caveMouth.d[q] > 0) gh = 0;
    gh *= 1 - Math.min(1, padMask.d[q]); // nothing grows through paving and planks
    grassH.d[q] = clamp(gh, 0, 1);

    // moisture: slightly richer greens in the valley bottom, drier on the plateaus
    const wetness = 1 - smoothstep(0, 22, waterNear.d[q]);
    mulTint(q, 1 - 0.06 * wetness, 1 + 0.02 * wetness, 1 - 0.04 * wetness, 1);
  }
}

// ---------------------------------------------------------------------------
// 12. Trees

log('trees');
const SPECIES = ['oak', 'beech', 'birch', 'willow', 'pine', 'cypress', 'plane', 'palm', 'bush', 'bloom', 'elder'];
const SPECIES_H = { oak: 17, beech: 20, birch: 14, willow: 12, pine: 22, cypress: 16, plane: 19, palm: 13, bush: 2.6, bloom: 2.2, elder: 38 };
const rng = mulberry32(20251119);
const trees = [];
{
  const sm = canopy.blur(1.6);
  const cand = [];
  // crown tops: local maxima of the canopy height model
  for (let j = 4; j < N - 4; j++) {
    for (let i = 4; i < N - 4; i++) {
      const v = sm.d[idx(i, j)];
      if (v < 5) continue;
      let top = true;
      for (let dj = -3; dj <= 3 && top; dj++) for (let di = -3; di <= 3; di++) {
        if ((di || dj) && sm.d[idx(i + di, j + dj)] > v) { top = false; break; }
      }
      if (top) cand.push([wx(i) + (rng() - 0.5) * 0.8, wx(j) + (rng() - 0.5) * 0.8, v, 1]);
    }
  }
  // fill the closed canopy where the height model is too smooth to show individual crowns
  for (let z = -HALF + 3; z < HALF - 3; z += 5.2) {
    for (let x = -HALF + 3; x < HALF - 3; x += 5.2) {
      const px = x + (rng() - 0.5) * 4.2, pz = z + (rng() - 0.5) * 4.2;
      const v = sm.sample(gi(px), gi(pz));
      if (v > 5.5) cand.push([px, pz, v * (0.8 + 0.2 * rng()), 0]);
    }
  }
  cand.sort((a, b) => b[3] - a[3] || b[2] - a[2]);

  const CELL = 8, GN = Math.ceil(N / CELL);
  const buckets = Array.from({ length: GN * GN }, () => []);
  const giants = []; // trees that keep a clearing wider than the neighbourhood searched below
  const tooClose = (x, z, r) => {
    for (const t of giants) { const rr = (r + t.r) * 0.5; if ((t.x - x) ** 2 + (t.z - z) ** 2 < rr * rr) return true; }
    const ci = Math.floor((x + HALF) / CELL), cj = Math.floor((z + HALF) / CELL);
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const a = ci + di, b = cj + dj;
      if (a < 0 || b < 0 || a >= GN || b >= GN) continue;
      for (const t of buckets[b * GN + a]) {
        const rr = (r + t.r) * 0.5;
        if ((t.x - x) ** 2 + (t.z - z) ** 2 < rr * rr) return true;
      }
    }
    return false;
  };
  const add = (x, z, species, scale, r, hero = 0) => {
    const t = { x, z, species, scale, r, rot: rng() * Math.PI * 2, hero };
    trees.push(t);
    if (r > 30) giants.push(t);
    const ci = Math.floor((x + HALF) / CELL), cj = Math.floor((z + HALF) / CELL);
    if (ci >= 0 && cj >= 0 && ci < GN && cj < GN) buckets[cj * GN + ci].push(t);
  };
  for (const [x, z, sp, sc] of L.HERO_TREES) add(x, z, sp, sc, sp === 'elder' ? 92 : 7 * sc, 1); // the old tree keeps its clearing
  for (const t of trees) if (t.species === 'elder') t.shadeR = 19 * t.scale; // (the shade on the ground is the crown's, not the clearing's)
  // palms along the seafront: both sides of the boardwalk and around the plaza (never in a path or in the brook)
  const palmSpot = (x, z) => {
    const q = idx(Math.round(gi(x)), Math.round(gi(z)));
    return pathClear.d[q] > 0.6 && waterNear.d[q] > 3 && padSDF.plaza.d[q] > 1.2 && boundsSDF.d[q] < -2;
  };
  {
    const pts = resample(smoothPath(L.PROMENADE.points, { step: 1 }), 1);
    for (let k = 6; k < pts.length - 4; k += 13) {
      const a = pts[k - 1], b = pts[k + 1];
      let nx = b[1] - a[1], nz = -(b[0] - a[0]);
      const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      for (const s of [-1, 1]) {
        const x = pts[k][0] + nx * s * (L.PROMENADE.width / 2 + 1.6), z = pts[k][1] + nz * s * (L.PROMENADE.width / 2 + 1.6);
        if (Math.hypot(x - L.PIER.rootX, z - L.PIER.rootZ) < 16 || !palmSpot(x, z)) continue;
        add(x, z, 'palm', 0.8 + rng() * 0.35, 5, 1);
      }
    }
    const pz = L.PROMENADE.plaza;
    for (let i = 0; i < 9; i++) {
      const a = 1.2 + (i / 9) * 3.9, x = pz.x + Math.cos(a) * (pz.r + 3), z = pz.z + Math.sin(a) * (pz.r + 3);
      if (palmSpot(x, z)) add(x, z, 'palm', 0.9 + rng() * 0.3, 5, 1);
    }
  }

  for (const [x, z, hgt] of cand) {
    if (Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4) continue;
    const i = Math.round(gi(x)), j = Math.round(gi(z));
    const q = idx(i, j);
    const h = H.d[q];
    const wl = waterY.d[q];
    if (wl > WATER_NONE + 0.5 && h < wl + 0.12) continue; // standing in water
    if (waterNear.d[q] < 1.1) continue;
    if (pathClear.d[q] < 0 || noTrees.d[q] > 0) continue;
    if (buildingSDF.d[q] < 4.5) continue;
    if (padMask.d[q] > 0 || gardenSDF.d[q] < 1) continue;
    if (padSDF.court.d[q] < 2 || padSDF.drive.d[q] < 2 || padSDF.plaza.d[q] < 6) continue;
    if (promField.dist[q] < L.PROMENADE.width / 2 + 4) continue;
    if (boundsSDF.d[q] > 0) continue; // the mountains are planted below
    if (coastD.d[q] < BW + 12 && beach.d[q] > 0.3 && h < 4.2) continue;
    if (coastD.d[q] < 3) continue;
    if (SLOPE.d[q] > 1.25) continue;
    if (fieldSoil.d[q] > 0.3 || fieldCrop.d[q] > 0.3) continue;
    // keep the lawns open: thin the park, clear a ring around the lower ponds
    const park = parkMask.d[q];
    if (park > 0.5 && rng() < 0.5) continue;
    // species by habitat, with low-frequency stands
    const stand = fbm(x / 70, z / 70, { seed: 91, octaves: 2 });
    const stand2 = fbm(x / 45 + 40, z / 45, { seed: 92, octaves: 2 });
    const riparian = waterNear.d[q] < 7 && wl > 0.5;
    const coastal = coastD.d[q] < 170;
    const r = rng();
    let sp;
    if (riparian) sp = r < 0.32 ? 'willow' : r < 0.58 ? 'birch' : r < 0.82 ? 'oak' : 'beech';
    else if (coastal) sp = r < 0.5 + 0.3 * stand ? 'pine' : r < 0.8 ? 'oak' : 'birch';
    else if (stand2 > 0.32) sp = r < 0.6 ? 'pine' : r < 0.85 ? 'birch' : 'oak';
    else if (stand > 0.18) sp = r < 0.62 ? 'beech' : r < 0.9 ? 'oak' : 'birch';
    else sp = r < 0.62 ? 'oak' : r < 0.82 ? 'beech' : r < 0.93 ? 'birch' : 'plane';
    const target = clamp(hgt * 1.12 + 3, 8, 27) * (0.9 + 0.2 * rng());
    const scale = clamp(target / SPECIES_H[sp], 0.62, 1.38);
    const radius = (sp === 'pine' || sp === 'birch' || sp === 'cypress' ? 5.0 : 6.6) * scale;
    if (tooClose(x, z, radius)) continue;
    add(x, z, sp, scale, radius);
  }

  // ---- the grove the race track threads: planted close, a corridor left for the track
  if (L.RACE.grove) {
    // (the corridor is measured from the corners of the line, and a long bend bulges out of them by a metre)
    const G = L.RACE.grove, track = L.PATHS.find((p) => p.id === 'race').points, half = L.RACE.width / 2 + 3.6;
    const lane = L.PATHS.find((p) => p.id === 'lane').points;
    const near = (pts, x, z, r) => { for (let i = 0; i + 1 < pts.length; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], ux = bx - ax, uz = bz - az, t = clamp(((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz || 1), 0, 1); if (Math.hypot(x - ax - ux * t, z - az - uz * t) < r) return true; } return false; };
    let planted = 0;
    for (let k = 0; k < G.trees * 14 && planted < G.trees; k++) {
      const a = rng() * Math.PI * 2, f = Math.sqrt(rng()), px = G.x + Math.cos(a) * G.rx * f, pz = G.z + Math.sin(a) * G.rz * f;
      if (near(track, px, pz, half) || near(lane, px, pz, 4.2)) continue;
      const q = idx(Math.round(gi(px)), Math.round(gi(pz)));
      if (SLOPE.d[q] > 1.3 || waterNear.d[q] < 1.6) continue;
      const r = rng(), sp = r < 0.34 ? 'beech' : r < 0.6 ? 'pine' : r < 0.82 ? 'birch' : 'oak';
      const scale = 0.8 + 0.4 * rng(), radius = (sp === 'pine' || sp === 'birch' ? 3.1 : 3.9) * scale;
      if (tooClose(px, pz, radius)) continue;
      add(px, pz, sp, scale, radius);
      planted++;
    }
    log(`the grove of the track: ${planted} trees`);
  }

  // ---- the woods that ring the high clearing
  {
    const G = L.GLADE;
    for (let k = 0; k < 420; k++) {
      const a = rng() * Math.PI * 2, f = 1.07 + 0.5 * rng() * rng(), px = G.x + Math.cos(a) * G.rx * f, pz = G.z + Math.sin(a) * G.rz * f;
      const q = idx(Math.round(gi(px)), Math.round(gi(pz)));
      if (noTrees.d[q] > 0 || SLOPE.d[q] > 1.3 || waterNear.d[q] < 1.6) continue;
      const r = rng(), sp = r < 0.4 ? 'beech' : r < 0.66 ? 'pine' : r < 0.86 ? 'birch' : 'oak';
      const scale = 0.85 + 0.45 * rng(), radius = (sp === 'pine' || sp === 'birch' ? 4.4 : 5.6) * scale;
      if (tooClose(px, pz, radius)) continue;
      add(px, pz, sp, scale, radius);
    }
  }

  // ---- the woods of the mountains
  for (let z = -HALF + 4; z < HALF - 4; z += 6.4) {
    for (let x = -HALF + 4; x < HALF - 4; x += 6.4) {
      const px = x + (rng() - 0.5) * 5.6, pz = z + (rng() - 0.5) * 5.6;
      const q = idx(Math.round(gi(px)), Math.round(gi(pz)));
      if (boundsSDF.d[q] < 1.5 || rng() > cover.d[q] * 0.92) continue;
      const h = H.d[q];
      if (h < 1.2 || SLOPE.d[q] > 1.36 || waterNear.d[q] < 1.4 || coastD.d[q] < 3 || pathClear.d[q] < 0 || noTrees.d[q] > 0) continue;
      const r = rng();
      const sp = h > 96 ? (r < 0.85 ? 'pine' : 'birch') : h > 48 ? (r < 0.58 ? 'pine' : r < 0.84 ? 'beech' : 'birch') : (r < 0.36 ? 'pine' : r < 0.66 ? 'oak' : r < 0.9 ? 'beech' : 'birch');
      const scale = (0.78 + 0.5 * rng()) * (1 - 0.3 * smoothstep(70, TREE_LINE, h)) * (1 - 0.12 * smoothstep(TREE_LINE, 230, h)); // smaller towards the tree line, and above it
      const radius = (sp === 'pine' || sp === 'birch' ? 5.0 : 6.6) * scale;
      if (tooClose(px, pz, radius)) continue;
      add(px, pz, sp, scale, radius);
    }
  }

  // ---- shrubs (same instancing and levels of detail as the trees, at garden scale)
  const freeGround = (q, pathMargin) => {
    const wl = waterY.d[q];
    if (wl > WATER_NONE + 0.5 && H.d[q] < wl + 0.15) return false;
    return waterNear.d[q] > 1.6 && pathClear.d[q] > pathMargin && buildingSDF.d[q] > 1.7 && padMask.d[q] <= 0 && noTrees.d[q] <= 0
      && padSDF.court.d[q] > 0.9 && padSDF.drive.d[q] > 1.2 && padSDF.plaza.d[q] > 5 && SLOPE.d[q] < 1.3;
  };
  const shrub = (x, z, species, scale, r) => { add(x, z, species, scale, r); trees[trees.length - 1].shadeR = r * 0.55 + 0.4; };
  const segDist = (x, z, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
  };
  // 1. the rock garden: planted in drifts, bare soil, stone and heather showing between the clumps
  {
    const xs = L.ROCK_GARDEN.outline.map((p) => p[0]), zs = L.ROCK_GARDEN.outline.map((p) => p[1]);
    const wallDist = (x, z) => {
      let d = 1e9;
      for (const w of L.TERRACES) for (let k = 0; k + 1 < w.points.length; k++) d = Math.min(d, segDist(x, z, w.points[k], w.points[k + 1]));
      return d;
    };
    for (let z = Math.min(...zs); z < Math.max(...zs); z += 1.7) {
      for (let x = Math.min(...xs); x < Math.max(...xs); x += 1.7) {
        const px = x + (rng() - 0.5) * 1.5, pz = z + (rng() - 0.5) * 1.5;
        const q = idx(Math.round(gi(px)), Math.round(gi(pz)));
        if (gardenSDF.d[q] > -0.7 || !freeGround(q, 0.55) || wallDist(px, pz) < 0.8) continue;
        const drift = fbm(px / 7.5, pz / 7.5, { seed: 77, octaves: 2 });
        if (drift < -0.14 || rng() < 0.18) continue;
        const r = rng();
        let sp, scale, rad;
        if (r < 0.46) { sp = 'bush'; scale = 0.5 + rng() * 0.62; rad = 2.3 * scale; }
        else if (r < 0.7) { sp = 'bloom'; scale = 0.55 + rng() * 0.45; rad = 2.1 * scale; }
        else if (r < 0.9) { sp = 'cypress'; scale = 0.1 + rng() * 0.12; rad = 1.3; }
        else { sp = 'palm'; scale = 0.15 + rng() * 0.07; rad = 1.5; }
        if (tooClose(px, pz, rad)) continue;
        shrub(px, pz, sp, scale, rad);
      }
    }
  }
  // 2. flowering shrubs where the lawns meet the woods
  for (let z = -HALF + 8; z < HALF - 8; z += 6.5) {
    for (let x = -HALF + 8; x < HALF - 8; x += 6.5) {
      const cx = x + (rng() - 0.5) * 5, cz = z + (rng() - 0.5) * 5;
      const q0 = idx(Math.round(gi(cx)), Math.round(gi(cz)));
      const c = cover.d[q0];
      if (parkMask.d[q0] < 0.6 || c < 0.1 || c > 0.62 || rng() > 0.42) continue;
      const n = 1 + ((rng() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const px = cx + (rng() - 0.5) * 3.4, pz = cz + (rng() - 0.5) * 3.4;
        const q = idx(Math.round(gi(px)), Math.round(gi(pz)));
        if (!freeGround(q, 1.2) || gardenSDF.d[q] < 1) continue;
        const sp = rng() < 0.6 ? 'bloom' : 'bush';
        const scale = 0.6 + rng() * 0.5, rad = 2.2 * scale;
        if (tooClose(px, pz, rad)) continue;
        shrub(px, pz, sp, scale, rad);
      }
    }
  }
  // 3. hedgerows around the fields: the patchwork of the plateau
  for (const f of L.FIELDS) {
    const ring = resample([...f.outline, f.outline[0]], 4.4);
    for (const [hx, hz] of ring) {
      const px = hx + (rng() - 0.5) * 2.2, pz = hz + (rng() - 0.5) * 2.2;
      if (Math.abs(px) > HALF - 5 || Math.abs(pz) > HALF - 5) continue;
      const q = idx(Math.round(gi(px)), Math.round(gi(pz)));
      if (!freeGround(q, 1.6) || buildingSDF.d[q] < 6 || gardenSDF.d[q] < 2 || coastD.d[q] < 30 || promField.dist[q] < L.PROMENADE.width / 2 + 4) continue;
      const r = rng();
      if (r < 0.08) continue; // gaps
      let sp, scale, rad;
      if (r < 0.6) { sp = 'bush'; scale = 1.0 + rng() * 0.75; rad = 1.9 * scale; }
      else if (r < 0.82) { sp = 'oak'; scale = 0.5 + rng() * 0.4; rad = 5.5 * scale; }
      else if (r < 0.92) { sp = 'birch'; scale = 0.55 + rng() * 0.3; rad = 4 * scale; }
      else { sp = 'bloom'; scale = 0.9 + rng() * 0.5; rad = 2.0 * scale; }
      if (tooClose(px, pz, rad)) continue;
      if (sp === 'oak' || sp === 'birch') add(px, pz, sp, scale, rad); else shrub(px, pz, sp, scale, rad);
    }
  }
}
log(`  ${trees.length} trees`);
const treeCount = {};
for (const t of trees) treeCount[t.species] = (treeCount[t.species] || 0) + 1;
log('  ', JSON.stringify(treeCount));

// canopy shade map (ambient occlusion under the trees), 0 = fully shaded
const shade = new Grid(N, N, 0);
for (const t of trees) {
  const r = t.shadeR ?? t.r * 0.72 + 1.5;
  for (let j = Math.floor(gi(t.z - r)); j <= Math.ceil(gi(t.z + r)); j++) {
    for (let i = Math.floor(gi(t.x - r)); i <= Math.ceil(gi(t.x + r)); i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const d = Math.hypot(wx(i) - t.x, wx(j) - t.z) / r;
      if (d < 1) shade.d[idx(i, j)] = Math.max(shade.d[idx(i, j)], (1 - d * d) ** 0.8);
    }
  }
}
const shadeBlur = shade.blur(2.5);

// ---------------------------------------------------------------------------
// 13. Backdrop relief (outside the playable square)

log('backdrop');
const BN = 257;
const backdrop = new Grid(BN, BN);
const backCover = new Grid(BN, BN);
{
  const sea = new Uint8Array(BN * BN);
  const toB = (v) => (v + DEM_HALF) / DEM_STEP;
  const ext = [[330, -1100], ...L.COAST.line.map((p) => [p[0], p[1]]), [360, 1100], [1200, 1100], [1200, -1100]];
  fillPolygon(sea, BN, BN, ext.map((p) => [toB(p[0]), toB(p[1])]));
  const sd = signedDistance(sea, BN, BN); // in 8 m pixels, negative in the sea
  // distance outside the playable area, for points beyond the detailed terrain
  const outside = (x, z) => {
    let best = 1e9;
    for (let k = 0; k < boundsPts.length; k += 2) {
      const a = boundsPts[k], b = boundsPts[(k + 2) % boundsPts.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      best = Math.min(best, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
    }
    return best;
  };
  for (let j = 0; j < BN; j++) {
    for (let i = 0; i < BN; i++) {
      const x = -DEM_HALF + i * DEM_STEP, z = -DEM_HALF + j * DEM_STEP;
      const inner = Math.abs(x) <= HALF - 4 && Math.abs(z) <= HALF - 4;
      let h = dem.get(i, j) * L.WORLD.verticalScale + L.DATUM;
      const d = sd.get(i, j) * DEM_STEP;
      if (d < 0) h = -(2 + 6 * (1 - Math.exp(d / 80)) - d * 0.015);
      else if (!inner) h = lerp(0.5, Math.max(h, 3) + mountain(x, z, outside(x, z)), smoothstep(0, 60, d));
      // inside the playable square use the detailed terrain so both meshes agree at the border
      if (inner) h = H.sample(gi(x), gi(z));
      backdrop.d[j * BN + i] = h;
      backCover.d[j * BN + i] = d < 0 ? 0 : woods(x, z, h, 0.4);
    }
  }
}
// distant tree impostors outside the square
const farTrees = [];
{
  const r2 = mulberry32(777);
  for (let z = -DEM_HALF + 40; z < DEM_HALF - 40; z += 9) {
    for (let x = -DEM_HALF + 40; x < DEM_HALF - 40; x += 9) {
      if (Math.abs(x) < HALF - 2 && Math.abs(z) < HALF - 2) continue;
      const dEdge = Math.max(Math.abs(x), Math.abs(z)) - HALF;
      if (dEdge > 420) continue;
      const px = x + (r2() - 0.5) * 8, pz = z + (r2() - 0.5) * 8;
      const c = backCover.sample((px + DEM_HALF) / DEM_STEP, (pz + DEM_HALF) / DEM_STEP);
      if (r2() > c * 0.9) continue;
      const h = backdrop.sample((px + DEM_HALF) / DEM_STEP, (pz + DEM_HALF) / DEM_STEP);
      if (h < 1.5) continue;
      const r = r2();
      farTrees.push({ x: px, z: pz, y: h, species: h > 90 ? (r < 0.85 ? 'pine' : 'birch') : r < 0.45 ? 'pine' : r < 0.72 ? 'oak' : r < 0.92 ? 'beech' : 'birch', scale: 0.85 + r2() * 0.45, rot: r2() * 6.283 });
    }
  }
}
log(`  ${farTrees.length} backdrop trees`);

// ---------------------------------------------------------------------------
// 14. Write assets

log('writing');
const enc16 = (v) => Math.round(clamp((v - HMIN) / (HMAX - HMIN), 0, 1) * 65535);
{
  const buf = new Uint8Array(N * N * 3);
  for (let q = 0; q < N * N; q++) {
    const v = enc16(H.d[q]);
    buf[q * 3] = v >> 8; buf[q * 3 + 1] = v & 255; buf[q * 3 + 2] = Math.round(AO.d[q] * 255);
  }
  await savePng(path.join(OUT, 'height.png'), buf, N, N, 3);
}
{
  const buf = new Uint8Array(N * N * 3);
  for (let q = 0; q < N * N; q++) {
    const v = waterY.d[q] <= WATER_NONE + 0.5 ? 0 : enc16(waterY.d[q]);
    buf[q * 3] = v >> 8; buf[q * 3 + 1] = v & 255; buf[q * 3 + 2] = Math.round(clamp(shoreIn.d[q] / 16, 0, 1) * 255);
  }
  await savePng(path.join(OUT, 'water.png'), buf, N, N, 3);
}
{
  const buf = new Uint8Array(N * N * 3);
  for (let q = 0; q < N * N; q++) {
    buf[q * 3] = Math.round((NX.d[q] * 0.5 + 0.5) * 255);
    buf[q * 3 + 1] = Math.round((NZ.d[q] * 0.5 + 0.5) * 255);
    buf[q * 3 + 2] = Math.round(clamp(1 - shadeBlur.d[q], 0, 1) * 255);
  }
  await savePng(path.join(OUT, 'normal.png'), buf, N, N, 3);
}
for (let m = 0; m < 3; m++) {
  const buf = new Uint8Array(N * N * 3);
  for (let q = 0; q < N * N; q++) {
    let sum = 0;
    for (let k = 0; k < LAYERS; k++) sum += W[k].d[q];
    for (let c = 0; c < 3; c++) {
      const layer = m * 3 + c;
      buf[q * 3 + c] = layer < LAYERS ? Math.round((W[layer].d[q] / sum) * 255) : Math.round(grassH.d[q] * 255);
    }
  }
  await savePng(path.join(OUT, `splat${m}.png`), buf, N, N, 3);
}
{
  const TN = 512;
  const buf = new Uint8Array(TN * TN * 3);
  const tb = tint.map((t) => t.blur(0.8));
  for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {
    for (let c = 0; c < 3; c++) {
      const v = (tb[c].d[idx(i * 2, j * 2)] + tb[c].d[idx(i * 2 + 1, j * 2)] + tb[c].d[idx(i * 2, j * 2 + 1)] + tb[c].d[idx(i * 2 + 1, j * 2 + 1)]) / 4;
      buf[(j * TN + i) * 3 + c] = Math.round(clamp(v * 0.5, 0, 1) * 255);
    }
  }
  await savePng(path.join(OUT, 'tint.png'), buf, TN, TN, 3);
}
{
  const buf = new Uint8Array(BN * BN * 3);
  for (let q = 0; q < BN * BN; q++) {
    const v = enc16(backdrop.d[q]);
    buf[q * 3] = v >> 8; buf[q * 3 + 1] = v & 255; buf[q * 3 + 2] = Math.round(clamp(backCover.d[q], 0, 1) * 255);
  }
  await savePng(path.join(OUT, 'backdrop.png'), buf, BN, BN, 3);
}
{
  // trees: x, z, scale, rot (float32) + species index, flags
  const all = [...trees, ...farTrees];
  const buf = new Float32Array(all.length * 6);
  all.forEach((t, k) => {
    buf[k * 6] = t.x; buf[k * 6 + 1] = t.z; buf[k * 6 + 2] = t.scale; buf[k * 6 + 3] = t.rot;
    buf[k * 6 + 4] = SPECIES.indexOf(t.species); buf[k * 6 + 5] = t.y !== undefined ? t.y : -9999;
  });
  fs.writeFileSync(path.join(OUT, 'trees.bin'), Buffer.from(buf.buffer));
}
const r2 = (v) => Math.round(v * 100) / 100;
const meta = {
  size: N,
  heightRange: [HMIN, HMAX],
  backdrop: { n: BN, step: DEM_STEP, half: DEM_HALF },
  species: SPECIES,
  treeCount: trees.length,
  farTreeCount: farTrees.length,
  ponds: ponds.map((p) => ({ id: p.id, name: p.name, level: p.level, outline: p.outlinePts.filter((_, k) => k % 2 === 0).map((q) => [r2(q[0]), r2(q[1])]), islands: p.islands })),
  streams: streams.map((s) => ({ id: s.id, lined: !!s.lined, falls: s.falls, ctrl: s.points.length, samples: s.samples.map((q) => q.map(r2)) })),
  paths: paths.map((p) => ({ id: p.id, kind: p.kind, width: p.width, samples: p.samples.filter((_, k) => k % 2 === 0 || k === p.samples.length - 1).map((q) => q.map(r2)) })),
  coast: coastPts.filter((_, k) => k % 3 === 0).map((q) => q.map(r2)),
  promenade: resample(smoothPath(L.PROMENADE.points, { step: 1 }), 2).map((q) => q.map(r2)),
  bounds: boundsPts.filter((_, k) => k % 2 === 0).map((q) => [r2(q[0]), r2(q[1])]),
  acid: { y: r2(acidLevel) },
  seaFall: { x: r2(seaFall.x), z: r2(seaFall.z), y: r2(seaFall.y), dir: seaFall.dir, width: seaFall.width },
  sky: skySites.map((p) => ({ x: p.x, z: p.z, y: r2(p.y), yaw: r2(p.yaw) })),
  map: L.MAP_VIEW,
};
fs.writeFileSync(path.join(OUT, 'world.json'), JSON.stringify(meta));
{
  // the price tier of each sky village, for the server (the game works it out the same way: ten prices, as many
  // villages at each, from the lowest shelf to the highest — see layout/sponsors.js)
  const ys = meta.sky.map((v) => v.y), order = ys.map((_, i) => i).sort((i, j) => ys[i] - ys[j] || i - j), tiers = [];
  order.forEach((i, rank) => { tiers[i] = Math.min(9, Math.floor((rank * 10) / ys.length)); });
  if (L.TRACK === 'grove') fs.writeFileSync(path.join(ROOT, 'server/sky-tiers.js'), `// Written by tools/bake-world.mjs: do not edit by hand.\n// The price tier (0 to 9) of each sky village, in the order of the \`sky\` list of world.json.\nexport const SKY_TIERS = ${JSON.stringify(tiers)};\n`);
}

// ---------------------------------------------------------------------------
// 15. Preview (top-down, shaded) for visual checks

log('preview');
{
  const cols = [[0.36, 0.52, 0.2], [0.45, 0.55, 0.22], [0.26, 0.24, 0.13], [0.36, 0.28, 0.19], [0.45, 0.43, 0.4], [0.86, 0.78, 0.6], [0.66, 0.6, 0.52], [0.42, 0.31, 0.22]];
  const buf = new Uint8Array(N * N * 3);
  const sun = [-0.45, 0.72, -0.53];
  for (let q = 0; q < N * N; q++) {
    let sum = 0, r = 0, g = 0, b = 0;
    for (let k = 0; k < LAYERS; k++) { const w = W[k].d[q]; sum += w; r += cols[k][0] * w; g += cols[k][1] * w; b += cols[k][2] * w; }
    r = (r / sum) * tint[0].d[q]; g = (g / sum) * tint[1].d[q]; b = (b / sum) * tint[2].d[q];
    const lit = clamp(NX.d[q] * sun[0] + NY.d[q] * sun[1] + NZ.d[q] * sun[2], 0, 1) * 1.15 + 0.25;
    const ao = AO.d[q] * (0.55 + 0.45 * (1 - shadeBlur.d[q]));
    r *= lit * ao; g *= lit * ao; b *= lit * ao;
    const wl = waterY.d[q];
    if (wl > WATER_NONE + 0.5 && H.d[q] < wl) {
      const dep = clamp((wl - H.d[q]) / 2.5, 0, 1);
      r = lerp(r, 0.07, 0.45 + 0.5 * dep); g = lerp(g, 0.28, 0.45 + 0.5 * dep); b = lerp(b, 0.36, 0.45 + 0.5 * dep);
    }
    buf[q * 3] = clamp(r, 0, 1) * 255; buf[q * 3 + 1] = clamp(g, 0, 1) * 255; buf[q * 3 + 2] = clamp(b, 0, 1) * 255;
  }
  const treeCols = { oak: [40, 92, 30], beech: [62, 112, 36], birch: [96, 136, 52], willow: [110, 140, 60], pine: [22, 62, 40], cypress: [18, 52, 30], plane: [70, 110, 40], palm: [60, 120, 60], bush: [34, 84, 36], bloom: [186, 110, 140], elder: [30, 78, 26] };
  for (const t of trees) {
    const r = t.species === 'elder' ? 19 * t.scale : t.r * 0.5; // (its crown, not the clearing it keeps)
    const c = treeCols[t.species];
    for (let j = Math.floor(gi(t.z - r)); j <= Math.ceil(gi(t.z + r)); j++) for (let i = Math.floor(gi(t.x - r)); i <= Math.ceil(gi(t.x + r)); i++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const d = Math.hypot(wx(i) - t.x, wx(j) - t.z) / r;
      if (d > 1) continue;
      const k = (1 - d * 0.5) * (0.8 + 0.4 * hash2(i, j, 5));
      const q = idx(i, j) * 3;
      buf[q] = c[0] * k; buf[q + 1] = c[1] * k; buf[q + 2] = c[2] * k;
    }
  }
  // what is built: roofs, the pier and its big wheel (seen from above: a line across the pier)
  const paint = (poly, rgb, shade = 0) => {
    const mask = new Uint8Array(N * N);
    fillPolygon(mask, N, N, poly.map((p) => [gi(p[0]), gi(p[1])]));
    for (let q = 0; q < N * N; q++) if (mask[q]) {
      const k = 1 - shade * hash2(q % N, (q / N) | 0, 9);
      buf[q * 3] = rgb[0] * k; buf[q * 3 + 1] = rgb[1] * k; buf[q * 3 + 2] = rgb[2] * k;
    }
  };
  for (const key of ['house', 'annexA', 'annexB', 'shed']) paint(L.frameRect(L.MILL[key], 0.2), [74, 80, 96], 0.12);
  // the village and its stairway, the deck on the pond
  {
    // the temple: its hall, its pavilions
    const T = L.VILLAGE.temple;
    paint(L.frameRect({ x: T.hall.x, z: T.hall.z, yaw: T.hall.yaw, width: T.hall.plinth * 2, length: T.hall.plinth * 2 }, 0.35), [150, 60, 50], 0.12);
    for (const hs of T.pavilions) paint(L.frameRect({ x: hs.x, z: hs.z, yaw: hs.yaw, width: hs.w, length: hs.l }, 0.35), [88, 92, 106], 0.12);
  }
  {
    const pts = L.STAIRWAY.points, w = L.STAIRWAY.width / 2 + 0.4;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1], l = Math.hypot(bx - ax, bz - az), nx = (-(bz - az) / l) * w, nz = ((bx - ax) / l) * w;
      paint([[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]], [206, 200, 188], 0.1);
    }
    const D = L.POND_DECK, g = D.gangway;
    paint(L.frameRect({ x: D.x, z: D.z, yaw: D.yaw, width: D.w, length: D.l }), [178, 152, 118], 0.14);
    paint([[g[0][0] - 0.8, g[0][1]], [g[0][0] + 0.8, g[0][1]], [g[1][0] + 0.8, g[1][1]], [g[1][0] - 0.8, g[1][1]]], [178, 152, 118], 0.14);
  }
  {
    const P = L.PIER, w = P.width / 2, hw = P.headWidth / 2, h0 = P.length - P.headLength, at = L.pierToWorld;
    paint([at(0, -w), at(h0, -w), at(h0, -hw), at(P.length, -hw), at(P.length, hw), at(h0, hw), at(h0, w), at(0, w)], [178, 152, 118], 0.14);
    const a = P.wheel.along, r = P.wheel.radius;
    paint([at(a - 1.4, -r), at(a + 1.4, -r), at(a + 1.4, r), at(a - 1.4, r)], [240, 238, 232]);
    paint([at(a - 2.6, -2.6), at(a + 2.6, -2.6), at(a + 2.6, 2.6), at(a - 2.6, 2.6)], [214, 60, 46]);
  }
  await savePng(path.join(PREVIEW, 'world.png'), buf, N, N, 3);
  // the map of the HUD: the playable area and a little around it, 2 pixels per metre
  const mv = L.MAP_VIEW;
  await sharp(Buffer.from(buf.buffer), { raw: { width: N, height: N, channels: 3 } })
    .extract({ left: Math.round(gi(mv.x0) + 0.5), top: Math.round(gi(mv.z0) + 0.5), width: Math.round(mv.x1 - mv.x0), height: Math.round(mv.z1 - mv.z0) })
    .resize(Math.round((mv.x1 - mv.x0) * 2), Math.round((mv.z1 - mv.z0) * 2), { kernel: 'cubic' })
    .jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(OUT, 'map.jpg'));
  // …and the whole square kilometre, mountains and their villages included, 1 pixel per metre
  await sharp(Buffer.from(buf.buffer), { raw: { width: N, height: N, channels: 3 } }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(OUT, 'megamap.jpg'));
  // elevation preview with contours
  const e = new Uint8Array(N * N * 3);
  for (let q = 0; q < N * N; q++) {
    const h = H.d[q];
    const t = clamp((h + 5) / 60, 0, 1);
    const lit = clamp(NX.d[q] * sun[0] + NY.d[q] * sun[1] + NZ.d[q] * sun[2], 0, 1) * 0.9 + 0.3;
    let r = lerp(0.35, 0.95, t) * lit, g = lerp(0.55, 0.9, t) * lit, b = lerp(0.35, 0.7, t) * lit;
    if (h < 0) { r = 0.2; g = 0.4 + 0.02 * h; b = 0.6 + 0.02 * h; }
    const i = q % N, j = (q / N) | 0;
    const c = Math.floor(h / 2) !== Math.floor(H.get(i + 1, j) / 2) || Math.floor(h / 2) !== Math.floor(H.get(i, j + 1) / 2);
    if (c) { r *= 0.55; g *= 0.55; b *= 0.55; }
    e[q * 3] = clamp(r, 0, 1) * 255; e[q * 3 + 1] = clamp(g, 0, 1) * 255; e[q * 3 + 2] = clamp(b, 0, 1) * 255;
  }
  await savePng(path.join(PREVIEW, 'elevation.png'), e, N, N, 3);
}
const [lo, hi] = H.minmax();
log(`done. height range ${lo.toFixed(1)} .. ${hi.toFixed(1)} m`);
for (const f of fs.readdirSync(OUT)) log('  ', f, (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0), 'KB');
