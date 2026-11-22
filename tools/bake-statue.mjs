// Sculpts the golden dog of the cove: a sitting Australian shepherd, modelled as a blend of rounded shapes
// (a signed distance field), turned into a smooth mesh and written to public/assets/world/statue.bin.
//
//   node tools/bake-statue.mjs                 writes the mesh
//   node tools/bake-statue.mjs --preview=a.png also draws it (front, side, three quarters) to look at the sculpture
//   node tools/bake-statue.mjs --cell=0.012    finer or coarser mesh (in heights of the statue; default 0.0155)
//
// The statue is modelled 1 tall (the tips of its ears), sitting on y = 0, looking towards +z; x is its left.
// File: Uint32 × 4 [magic 'STA1', vertices, indices, 0], Float32 × 6 [box min xyz, box size xyz],
// Uint16 × 3 per vertex (position in the box), Int8 × 4 per vertex (normal × 127, light kept by the hollows
// × 127), Uint16 per index.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/assets/world/statue.bin');
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split(/=(.*)/s).slice(0, 2)));
const CELL = Number(opt.cell) || 0.0155;

// ---------------------------------------------------------------------------
// The shapes. Everything is mirrored in x: a shape off the middle is given on the +x side only.
const prims = [];
const rotInv = ([rx, ry, rz]) => {
  // inverse of R = Ry · Rx · Rz (the transpose), as 9 numbers, row major
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const m = [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx, cx * sz, cx * cz, -sx, -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx];
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
};
/** An egg: centre, half sizes, turned by [pitch, yaw, roll]; `k`: how softly it melts into what is already there. */
const egg = (c, r, k, rot = [0, 0, 0]) => prims.push({ t: 0, c, r, m: rotInv(rot), k, rm: Math.min(...r) });
/** A limb: from a (radius r1) to b (radius r2). */
const limb = (a, b, r1, r2, k) => prims.push({ t: 1, a, b, r1, r2, k });
/** A flap: a limb flattened to the fraction `f` of its thickness along the direction `n` (an ear). */
const flap = (a, b, r1, r2, k, n, f) => {
  const l = Math.hypot(...n), u = n.map((v) => v / l), s = (b[0] - a[0]) * u[0] + (b[1] - a[1]) * u[1] + (b[2] - a[2]) * u[2], g = 1 / f - 1;
  prims.push({ t: 1, a, b: [b[0] + u[0] * s * g, b[1] + u[1] * s * g, b[2] + u[2] * s * g], r1, r2, k, n: u, f, g });
};
/** A ring: centre, radius, thickness, turned. */
const ring = (c, R, r, k, rot = [0, 0, 0]) => prims.push({ t: 2, c, R, r, m: rotInv(rot), k });

// --- the body: sitting, the back sloping from the withers down to the rump on the ground, the chest proud
limb([0, 0.185, -0.155], [0, 0.5, 0.025], 0.2, 0.158, 0);
egg([0, 0.455, 0.105], [0.158, 0.185, 0.115], 0.05); // the chest
egg([0, 0.6, -0.02], [0.135, 0.14, 0.105], 0.05); // the withers and the mane behind the neck
limb([0, 0.56, 0.045], [0, 0.735, 0.088], 0.16, 0.128, 0.05); // the neck, thick with fur
egg([0.092, 0.625, 0.03], [0.082, 0.125, 0.1], 0.045); // the mane, at the sides of the neck
egg([0, 0.125, -0.335], [0.05, 0.05, 0.06], 0.04); // a bob of a tail
// --- the hind legs, folded at the sides; the feet flat on the ground, pointing forward
egg([0.166, 0.165, -0.085], [0.088, 0.137, 0.176], 0.04, [-0.35, 0, 0]);
egg([0.183, 0.035, 0.055], [0.05, 0.037, 0.11], 0.022);
for (const dx of [-0.027, 0, 0.027]) egg([0.183 + dx, 0.03, 0.158], [0.019, 0.022, 0.024], 0.01);
// --- the front legs: straight columns under the shoulders, feathered behind, big round paws
egg([0.104, 0.435, 0.055], [0.075, 0.125, 0.09], 0.04); // shoulder
limb([0.08, 0.43, 0.118], [0.08, 0.075, 0.16], 0.062, 0.047, 0.03);
egg([0.08, 0.25, 0.098], [0.032, 0.15, 0.05], 0.022);
egg([0.08, 0.037, 0.2], [0.061, 0.041, 0.086], 0.022);
for (const dx of [-0.034, 0, 0.034]) egg([0.08 + dx, 0.03, 0.274], [0.021, 0.024, 0.026], 0.01);
// --- the ruff: a bib of fur on the chest, ending in points; locks at the sides of the neck
egg([0, 0.415, 0.165], [0.108, 0.105, 0.062], 0.03);
limb([0, 0.36, 0.214], [0, 0.272, 0.198], 0.04, 0.007, 0.02);
limb([0.055, 0.386, 0.2], [0.064, 0.312, 0.188], 0.034, 0.007, 0.02);
limb([0.098, 0.422, 0.166], [0.112, 0.352, 0.152], 0.03, 0.007, 0.02);
limb([0.13, 0.6, 0.04], [0.176, 0.478, 0.03], 0.058, 0.016, 0.025);
limb([0.112, 0.54, 0.118], [0.15, 0.44, 0.108], 0.05, 0.014, 0.022);
// --- the head (drawn a little small, then enlarged about the top of the neck: a statue wants a big head)
const HS = 1.13, hp = ([x, y, z]) => [x * HS, 0.77 + (y - 0.77) * HS, 0.1 + (z - 0.1) * HS], hr = (r) => (Array.isArray(r) ? r.map((v) => v * HS) : r * HS);
egg(hp([0, 0.806, 0.124]), hr([0.12, 0.105, 0.121]), 0.035);
egg(hp([0.07, 0.762, 0.113]), hr([0.072, 0.072, 0.086]), 0.03); // cheeks
limb(hp([0.1, 0.758, 0.098]), hp([0.15, 0.7, 0.08]), hr(0.042), hr(0.012), 0.02); // the fur under the ears
limb(hp([0, 0.778, 0.19]), hp([0, 0.77, 0.288]), hr(0.066), hr(0.05), 0.03); // the muzzle
limb(hp([0, 0.742, 0.17]), hp([0, 0.744, 0.272]), hr(0.04), hr(0.03), 0.02); // the lower jaw
egg(hp([0, 0.79, 0.328]), hr([0.034, 0.027, 0.023]), 0.012); // the nose
egg(hp([0.05, 0.85, 0.196]), hr([0.032, 0.018, 0.028]), 0.03); // brows
egg(hp([0.055, 0.82, 0.218]), hr([0.021, 0.021, 0.021]), 0.004); // eyes
// --- the ears: set high and wide, half pricked, their tips folded over, outward and forward
{
  const N = [0.45, -0.1, 0.9], B = hp([0.092, 0.868, 0.1]), F = hp([0.15, 0.94, 0.1]), T = hp([0.198, 0.888, 0.136]);
  flap(B, F, hr(0.058), hr(0.04), 0.018, N, 0.36);
  flap(F, T, hr(0.04), hr(0.014), 0.014, [0.3, 0.5, 0.8], 0.36);
}
// --- a collar and its medal
ring([0, 0.6, 0.06], 0.156, 0.021, 0.006, [0.42, 0, 0]);
egg([0, 0.528, 0.224], [0.038, 0.038, 0.017], 0.004, [-0.2, 0, 0]);
// --- and its ball, by its right foot (the only thing that is not mirrored)
egg([0.215, 0.047, 0.264], [0.047, 0.047, 0.047], 0);
prims[prims.length - 1].one = true;

const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
function dist(x0, y, z) {
  const xm = Math.abs(x0);
  let d = 1e9;
  for (let i = 0; i < prims.length; i++) {
    const p = prims[i], x = p.one ? x0 : xm;
    let v;
    if (p.t === 1) {
      const a = p.a, b = p.b, bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], l2 = bx * bx + by * by + bz * bz, rr = p.r1 - p.r2, a2 = l2 - rr * rr, il2 = 1 / l2;
      let px = x - a[0], py = y - a[1], pz = z - a[2];
      if (p.n) { const sn = (px * p.n[0] + py * p.n[1] + pz * p.n[2]) * p.g; px += p.n[0] * sn; py += p.n[1] * sn; pz += p.n[2] * sn; }
      const yy = px * bx + py * by + pz * bz, zz = yy - l2;
      const qx = px * l2 - bx * yy, qy = py * l2 - by * yy, qz = pz * l2 - bz * yy, x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
      const kk = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > kk) v = Math.sqrt(x2 + z2) * il2 - p.r2;
      else if (Math.sign(yy) * a2 * y2 < kk) v = Math.sqrt(x2 + y2) * il2 - p.r1;
      else v = (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - p.r1;
      if (p.n) v *= p.f;
    } else {
      const m = p.m, ox = x - p.c[0], oy = y - p.c[1], oz = z - p.c[2];
      const lx = m[0] * ox + m[1] * oy + m[2] * oz, ly = m[3] * ox + m[4] * oy + m[5] * oz, lz = m[6] * ox + m[7] * oy + m[8] * oz;
      if (p.t === 0) {
        const r = p.r, ax = lx / r[0], ay = ly / r[1], az = lz / r[2], k0 = Math.hypot(ax, ay, az), k1 = Math.hypot(ax / r[0], ay / r[1], az / r[2]);
        v = k0 < 1e-6 ? -p.rm : (k0 * (k0 - 1)) / k1;
      } else v = Math.hypot(Math.hypot(lx, lz) - p.R, ly) - p.r;
    }
    d = i === 0 ? v : smin(d, v, p.k);
  }
  return d;
}
const E = 0.0015;
const normalAt = (x, y, z) => {
  const nx = dist(x + E, y, z) - dist(x - E, y, z), ny = dist(x, y + E, z) - dist(x, y - E, z), nz = dist(x, y, z + E) - dist(x, y, z - E), l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
};
/** How much of the sky a point of the surface sees (1: all of it; the hollows and the foot of the statue less). */
const lightAt = (x, y, z, n) => {
  let occ = 0;
  for (const [d, w] of [[0.012, 0.3], [0.03, 0.28], [0.065, 0.24], [0.13, 0.18]]) {
    const px = x + n[0] * d, py = y + n[1] * d, pz = z + n[2] * d;
    occ += w * Math.max(0, d - Math.min(dist(px, py, pz), py + 0.004)) / d;
  }
  return Math.max(0.22, 1 - occ * 1.25);
};

// ---------------------------------------------------------------------------
// The mesh: surface nets (one vertex in every cell the surface crosses, a quad across every edge it cuts)
function mesh() {
  const B0 = [-0.3, -CELL * 0.5, -0.43], B1 = [0.3, 1.02, 0.42];
  const n = [0, 1, 2].map((a) => Math.ceil((B1[a] - B0[a]) / CELL));
  const [nx, ny, nz] = n, sx = nx + 1, sy = ny + 1;
  const val = new Float32Array((nx + 1) * (ny + 1) * (nz + 1));
  const at = (i, j, k) => i + sx * (j + sy * k);
  for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const y = B0[1] + j * CELL;
    // (the statue stands on the ground: it is cut flat there)
    val[at(i, j, k)] = Math.max(dist(B0[0] + i * CELL, y, B0[2] + k * CELL), -y);
  }
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const cat = (i, j, k) => i + nx * (j + ny * k);
  const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = CORNERS.map(([a, b, c]) => val[at(i + a, j + b, k + c)]);
    let inside = 0;
    for (const q of v) if (q < 0) inside++;
    if (inside === 0 || inside === 8) continue;
    let px = 0, py = 0, pz = 0, cnt = 0;
    for (const [a, b] of EDGES) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      px += CORNERS[a][0] + (CORNERS[b][0] - CORNERS[a][0]) * t; py += CORNERS[a][1] + (CORNERS[b][1] - CORNERS[a][1]) * t; pz += CORNERS[a][2] + (CORNERS[b][2] - CORNERS[a][2]) * t;
      cnt++;
    }
    cellVert[cat(i, j, k)] = pos.length / 3;
    pos.push(B0[0] + (i + px / cnt) * CELL, B0[1] + (j + py / cnt) * CELL, B0[2] + (k + pz / cnt) * CELL);
  }
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
    const v0 = val[at(i, j, k)] < 0;
    if (v0 !== (val[at(i + 1, j, k)] < 0)) quad(cellVert[cat(i, j - 1, k - 1)], cellVert[cat(i, j, k - 1)], cellVert[cat(i, j, k)], cellVert[cat(i, j - 1, k)], !v0);
    if (v0 !== (val[at(i, j + 1, k)] < 0)) quad(cellVert[cat(i - 1, j, k - 1)], cellVert[cat(i - 1, j, k)], cellVert[cat(i, j, k)], cellVert[cat(i, j, k - 1)], !v0);
    if (v0 !== (val[at(i, j, k + 1)] < 0)) quad(cellVert[cat(i - 1, j - 1, k)], cellVert[cat(i, j - 1, k)], cellVert[cat(i, j, k)], cellVert[cat(i - 1, j, k)], !v0);
  }
  // the vertices are brought onto the surface itself, then their normals and their light are taken from it
  const V = pos.length / 3, nrm = new Float32Array(V * 3), light = new Float32Array(V);
  for (let v = 0; v < V; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    for (let it = 0; it < 3 && y > 0.002; it++) { const d = dist(x, y, z), g = normalAt(x, y, z); x -= g[0] * d * 0.8; y = Math.max(0, y - g[1] * d * 0.8); z -= g[2] * d * 0.8; }
    if (y < 0.004) y = 0;
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    const g = normalAt(x, Math.max(y, 0.003), z);
    nrm.set(g, v * 3);
    light[v] = lightAt(x, y, z, g);
  }
  // (what lies flat on the ground is never seen: those triangles go)
  const kept = [];
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2]; if (pos[a * 3 + 1] > 0 || pos[b * 3 + 1] > 0 || pos[c * 3 + 1] > 0) kept.push(a, b, c); }
  return { pos: Float32Array.from(pos), nrm, light, idx: kept };
}

function write({ pos, nrm, light, idx }) {
  // only the vertices still in use
  const map = new Int32Array(pos.length / 3).fill(-1);
  let V = 0;
  for (const i of idx) if (map[i] < 0) map[i] = V++;
  if (V > 65535) throw new Error(`${V} vertices: too many for 16-bit indices (use a bigger --cell)`);
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < map.length; i++) if (map[i] >= 0) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], pos[i * 3 + a]); hi[a] = Math.max(hi[a], pos[i * 3 + a]); }
  const size = hi.map((h, a) => h - lo[a]);
  const buf = Buffer.alloc(40 + V * 10 + idx.length * 2);
  buf.writeUInt32LE(0x31415453, 0); buf.writeUInt32LE(V, 4); buf.writeUInt32LE(idx.length, 8); buf.writeUInt32LE(0, 12);
  [...lo, ...size].forEach((v, k) => buf.writeFloatLE(v, 16 + k * 4));
  for (let i = 0; i < map.length; i++) {
    const v = map[i];
    if (v < 0) continue;
    for (let a = 0; a < 3; a++) buf.writeUInt16LE(Math.round(((pos[i * 3 + a] - lo[a]) / size[a]) * 65535), 40 + v * 6 + a * 2);
    for (let a = 0; a < 3; a++) buf.writeInt8(Math.round(nrm[i * 3 + a] * 127), 40 + V * 6 + v * 4 + a);
    buf.writeInt8(Math.round(light[i] * 127), 40 + V * 6 + v * 4 + 3);
  }
  idx.forEach((i, k) => buf.writeUInt16LE(map[i], 40 + V * 10 + k * 2));
  fs.writeFileSync(OUT, buf);
  return { V, T: idx.length / 3, bytes: buf.length, lo, hi };
}

// ---------------------------------------------------------------------------
// A look at the sculpture: the field itself, marched ray by ray, lit like gold in the sun
async function preview(file) {
  const W = 340, H = 430, views = (opt.views || '0,0;1.5708,0;0.65,0.12;3.1416,0;-2.3,0.3').split(';').map((v) => v.split(',').map(Number));
  const img = Buffer.alloc(W * views.length * H * 3);
  const L = [0.45, 0.7, 0.55], ll = Math.hypot(...L);
  views.forEach(([yaw, pitch], vi) => {
    // the camera looks at the statue from the direction (sin yaw · cos pitch, sin pitch, cos yaw · cos pitch)
    const dx = -Math.sin(yaw) * Math.cos(pitch), dy = -Math.sin(pitch), dz = -Math.cos(yaw) * Math.cos(pitch);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw); // right
    const ux = -Math.sin(yaw) * -Math.sin(pitch) * -1, uy = Math.cos(pitch), uz = -Math.cos(yaw) * -Math.sin(pitch) * -1; // up
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const sxv = ((px + 0.5) / W - 0.5) * 0.9, syv = (0.5 - (py + 0.5) / H) * (0.9 * H) / W + 0.5;
      let ox = rx * sxv + ux * (syv - 0.5) - dx * 2, oy = 0.5 + uy * (syv - 0.5) - dy * 2, oz = rz * sxv + uz * (syv - 0.5) - dz * 2;
      let t = 0, hit = false;
      for (let s = 0; s < 90 && t < 4; s++) {
        const d = Math.min(dist(ox + dx * t, oy + dy * t, oz + dz * t), oy + dy * t + 0.0005);
        if (d < 0.0007) { hit = true; break; }
        t += d * 0.85;
      }
      let c = [0.62, 0.74, 0.86];
      if (hit) {
        const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
        if (y < 0.002) c = [0.5, 0.48, 0.45];
        else {
          const n = normalAt(x, y, z), ao = lightAt(x, y, z, n);
          const dif = Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / ll);
          const hx = L[0] / ll - dx, hy = L[1] / ll - dy, hz = L[2] / ll - dz, hl = Math.hypot(hx, hy, hz), sp = Math.max(0, (n[0] * hx + n[1] * hy + n[2] * hz) / hl) ** 40;
          const up = 0.5 + 0.5 * n[1], k = (0.25 + 0.4 * up) * ao + dif * 0.75;
          c = [Math.min(1, 1.0 * k + sp), Math.min(1, 0.72 * k + sp * 0.9), Math.min(1, 0.2 * k + sp * 0.6)];
        }
      }
      const o = (py * W * views.length + vi * W + px) * 3;
      img[o] = c[0] * 255; img[o + 1] = c[1] * 255; img[o + 2] = c[2] * 255;
    }
  });
  await sharp(img, { raw: { width: W * views.length, height: H, channels: 3 } }).png().toFile(file);
}

const t0 = Date.now();
const out = write(mesh());
console.log(`statue: ${out.V} vertices, ${out.T} triangles, ${(out.bytes / 1024).toFixed(0)} KB, box ${out.lo.map((v) => v.toFixed(3))} … ${out.hi.map((v) => v.toFixed(3))} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
if (opt.preview) { await preview(path.resolve(opt.preview)); console.log('preview', opt.preview); }
