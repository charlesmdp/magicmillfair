// Sculpts the statues of the golden cove: a sitting Australian shepherd — fluffy, a great ruff round its neck,
// its ears dropped, its head a little to one side — and three companions with it on the plinth: a cat sitting
// at its right, a snake coiled at its left, a bird perched on its head. They are modelled as blends of rounded
// shapes (a signed distance field), turned into one smooth mesh and written to public/assets/world/statue.bin.
//
//   node tools/bake-statue.mjs                 writes the mesh
//   node tools/bake-statue.mjs --preview=a.png also draws it (front, side, three quarters…) to look at the sculpture
//   node tools/bake-statue.mjs --views="0,0;0.6,0.1,0,0.8,0.1,0.5"   the views of the preview: yaw, pitch
//                                              [, what it looks at (x, y, z), how much of it (a width)]
//   node tools/bake-statue.mjs --cell=0.012    finer or coarser mesh (in heights of the statue; default 0.0155)
//
// One unit is the height the statue is given in the world (the top of the dog's head is a little under it, the
// bird a little over); it sits on y = 0, looking towards +z; x is its left.
// File: Uint32 × 4 [magic 'STA2', vertices, indices, 0], Float32 × 6 [box min xyz, box size xyz],
// Uint16 × 3 per vertex (position in the box), Int8 × 4 per vertex (normal × 127, light kept by the hollows
// × 127), Uint8 per vertex (the tone of the gold: 128 the gold itself, more: paler — the ruff, the blaze, the
// paws —, less: deeper and redder — the patches of the coat), a byte of padding if needed, Uint16 per index.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/assets/world/statue.bin');
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split(/=(.*)/s).slice(0, 2)));
const CELL = Number(opt.cell) || 0.0155;

// ---------------------------------------------------------------------------
// The shapes. They are drawn in groups — the dog's body, its head, the cat, the snake, the bird — each in a
// frame of its own (`loc` brings a point of the statue into it; `scale`: how many times bigger it is drawn).
// A group that is `mirror`ed is given on its +x side only (a shape marked `one` is not).
const groups = [];
let G = null;
const rotInv = ([rx, ry, rz]) => {
  // inverse of R = Ry · Rx · Rz (the transpose), as 9 numbers, row major
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const m = [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx, cx * sz, cx * cz, -sx, -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx];
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
};
/** A new group. `k`: how softly it melts into what is already there; `loc(x, y, z, out)`; `scale`. */
const group = (name, o = {}) => { G = { name, prims: [], marks: [], k: o.k || 0, mirror: o.mirror !== false, loc: o.loc || null, scale: o.scale || 1, tone: 0 }; groups.push(G); return G; };
/** The tone of the gold of what is drawn next: 0 the gold itself, 1 pale, -1 deep and red. */
const tone = (t) => { G.tone = t; };
const add = (p) => { p.tone = G.tone; G.prims.push(p); return p; };
/** An egg: centre, half sizes, turned by [pitch, yaw, roll]; `k`: how softly it melts into what is already there. */
const egg = (c, r, k, rot = [0, 0, 0]) => add({ t: 0, c, r, m: rotInv(rot), k, rm: Math.min(...r) });
/** A limb: from a (radius r1) to b (radius r2). */
const limb = (a, b, r1, r2, k) => add({ t: 1, a, b, r1, r2, k });
/** A flap: a limb flattened to the fraction `f` of its thickness along the direction `n` (an ear, a wing). */
const flap = (a, b, r1, r2, k, n, f) => {
  const l = Math.hypot(...n), u = n.map((v) => v / l), s = (b[0] - a[0]) * u[0] + (b[1] - a[1]) * u[1] + (b[2] - a[2]) * u[2], g = 1 / f - 1;
  return add({ t: 1, a, b: [b[0] + u[0] * s * g, b[1] + u[1] * s * g, b[2] + u[2] * s * g], r1, r2, k, n: u, f, g });
};
/** A ring: centre, radius, thickness, turned. */
const ring = (c, R, r, k, rot = [0, 0, 0]) => add({ t: 2, c, R, r, m: rotInv(rot), k });
/** A lock of fur: from `b`, `len` long towards `dir`, `r` thick where it starts and ending in a point. */
const lock = (b, dir, len, r, k = 0.016, tip = 0.006) => { const l = Math.hypot(...dir); return limb(b, [b[0] + (dir[0] / l) * len, b[1] + (dir[1] / l) * len, b[2] + (dir[2] / l) * len], r, tip, k); };
/** A patch of another tone, painted over what is there: an egg (centre, half sizes) with a soft edge. */
const mark = (c, r, t, one = false) => G.marks.push({ c, r, t, one });
/** A number between 0 and 1 that is always the same for the same `i` (so that the locks are not all alike). */
const jit = (i) => { const v = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return v - Math.floor(v); };
const DEG = Math.PI / 180;

// ============================================================================ the dog: its body
group('dog');
// --- sitting, the back sloping from the withers down to the rump on the ground, the chest proud
limb([0, 0.185, -0.155], [0, 0.5, 0.025], 0.2, 0.158, 0);
egg([0, 0.455, 0.105], [0.158, 0.185, 0.115], 0.05); // the chest
egg([0, 0.6, -0.02], [0.14, 0.15, 0.11], 0.05); // the withers and the mane behind the neck
limb([0, 0.56, 0.045], [0, 0.735, 0.088], 0.165, 0.135, 0.05); // the neck, thick with fur
egg([0.1, 0.625, 0.03], [0.095, 0.14, 0.108], 0.045); // the mane, at the sides of the neck
egg([0, 0.125, -0.335], [0.05, 0.05, 0.06], 0.04); // a bob of a tail
// --- the hind legs, folded at the sides; the feet flat on the ground, pointing forward
egg([0.166, 0.165, -0.085], [0.088, 0.137, 0.176], 0.04, [-0.35, 0, 0]);
tone(1);
egg([0.183, 0.035, 0.055], [0.05, 0.037, 0.11], 0.022);
for (const dx of [-0.027, 0, 0.027]) egg([0.183 + dx, 0.03, 0.158], [0.019, 0.022, 0.024], 0.01);
// --- the front legs: straight columns under the shoulders, feathered behind, big round paws
tone(0);
egg([0.104, 0.435, 0.055], [0.075, 0.125, 0.09], 0.04); // shoulder
tone(0.6);
limb([0.08, 0.43, 0.118], [0.08, 0.075, 0.16], 0.062, 0.047, 0.03);
tone(1);
egg([0.08, 0.037, 0.2], [0.061, 0.041, 0.086], 0.022);
for (const dx of [-0.034, 0, 0.034]) egg([0.08 + dx, 0.03, 0.274], [0.021, 0.024, 0.026], 0.01);
tone(0.6);
for (const [y, l] of [[0.37, 0.075], [0.28, 0.08], [0.19, 0.07]]) lock([0.08, y, 0.1], [0.12, -0.8, -0.62], l, 0.034, 0.014); // the feathers behind the legs
// --- the ruff: the great bib of pale fur on the chest, ending in points, and the mane round the neck, in
// tiers of locks that hang down and out — the wider the lower
tone(1);
egg([0, 0.45, 0.158], [0.128, 0.145, 0.08], 0.035);
{
  let n = 0;
  // [height, how far round the neck the tier goes (degrees from the front), radius sideways, radius front and
  // back, centre z, length of a lock, its thickness, how many]
  for (const [y, to, rx, rz, zc, len, r, count] of [[0.675, 172, 0.128, 0.112, 0.062, 0.085, 0.046, 6], [0.6, 176, 0.158, 0.132, 0.05, 0.1, 0.052, 7], [0.515, 150, 0.164, 0.142, 0.066, 0.108, 0.052, 6], [0.425, 74, 0.132, 0.126, 0.088, 0.125, 0.046, 3]]) {
    for (let i = 0; i < count; i++) {
      const a = (count === 3 ? [0, 30, 62][i] : 9 + ((to - 9) * i) / (count - 1) + (jit(n) - 0.5) * 9) * DEG, s = Math.sin(a), c = Math.cos(a), l = len * (0.86 + 0.3 * jit(n + 50));
      // (pale in front and at the sides, the gold of the coat behind)
      tone(a < 100 * DEG ? 1 : a < 135 * DEG ? 0.45 : 0);
      lock([s * rx * 0.8, y, zc + c * rz * 0.8], [s * 0.58, -1, c * 0.58], a === 0 ? l * 1.25 : l, r, 0.017);
      n++;
    }
  }
}
// --- the coat of the back and the flanks: rows of locks that lie down and back; the britches behind the thighs
tone(0);
{
  let n = 100;
  for (const [y, zc, rx, rz, from, len, r, count] of [[0.445, -0.03, 0.15, 0.15, 112, 0.095, 0.05, 4], [0.33, -0.085, 0.185, 0.185, 100, 0.1, 0.055, 5], [0.215, -0.14, 0.2, 0.2, 118, 0.09, 0.05, 4]]) {
    for (let i = 0; i < count; i++) {
      const a = (from + ((180 - from) * i) / (count - 1) + (jit(n) - 0.5) * 6) * DEG, s = Math.sin(a), c = Math.cos(a);
      lock([s * rx * 0.86, y, zc + c * rz * 0.86], [s * 0.5, -1, c * 0.5], len * (0.85 + 0.3 * jit(n + 50)), r, 0.02);
      n++;
    }
  }
  lock([0.205, 0.215, -0.19], [0.5, -1, -0.5], 0.085, 0.045, 0.02);
  lock([0.235, 0.2, -0.09], [0.7, -1, -0.1], 0.075, 0.042, 0.02);
}
// --- the patches of the coat (a merle: deep, red patches on the gold), and the pale of the belly
mark([0.13, 0.36, -0.2], [0.11, 0.1, 0.1], -1);
mark([0, 0.52, -0.13], [0.1, 0.09, 0.07], -1);
mark([0.17, 0.22, -0.02], [0.07, 0.085, 0.09], -0.8);
mark([-0.1, 0.27, -0.27], [0.09, 0.08, 0.08], -1, true);
mark([0.06, 0.66, -0.09], [0.07, 0.06, 0.05], -0.9, true);
mark([0, 0.3, 0.13], [0.07, 0.12, 0.06], 0.9);
// --- its ball, by its foot (it is not mirrored)
tone(0);
egg([0.215, 0.047, 0.264], [0.047, 0.047, 0.047], 0).one = true;

// ============================================================================ its head
// Drawn a little small, then enlarged about the top of the neck (a statue wants a big head) and turned: it
// looks a little to its left — to whoever comes up the stair — with its head to one side, as it does.
const HS = 1.2, HP = [0, 0.725, 0.08], HM = rotInv([0.03, 0.27, -0.13]);
const headLoc = (x, y, z, o) => {
  const px = x - HP[0], py = y - HP[1], pz = z - HP[2];
  const qx = HM[0] * px + HM[1] * py + HM[2] * pz + HP[0], qy = HM[3] * px + HM[4] * py + HM[5] * pz + HP[1], qz = HM[6] * px + HM[7] * py + HM[8] * pz + HP[2];
  o[0] = qx / HS; o[1] = 0.77 + (qy - 0.77) / HS; o[2] = 0.1 + (qz - 0.1) / HS;
};
group('head', { k: 0.04, loc: headLoc, scale: HS });
egg([0, 0.806, 0.124], [0.124, 0.1, 0.122], 0); // the skull: broad, rather flat between the ears
egg([0.07, 0.762, 0.113], [0.078, 0.074, 0.09], 0.03); // cheeks
tone(-1);
lock([0.098, 0.762, 0.1], [0.62, -0.75, -0.2], 0.085, 0.044, 0.02); // the long fur of the cheeks, under the ears
lock([0.082, 0.748, 0.125], [0.5, -0.85, 0.05], 0.075, 0.038, 0.02);
tone(1);
limb([0, 0.776, 0.19], [0, 0.766, 0.292], 0.066, 0.05, 0.03); // the muzzle
limb([0, 0.74, 0.17], [0, 0.733, 0.27], 0.041, 0.031, 0.02); // the lower jaw
egg([0.03, 0.752, 0.25], [0.03, 0.026, 0.045], 0.015); // the lips
tone(-1.4);
egg([0, 0.788, 0.33], [0.036, 0.029, 0.025], 0.012); // the nose
tone(0);
egg([0.05, 0.851, 0.196], [0.033, 0.019, 0.029], 0.03); // brows
tone(-1.4);
egg([0.056, 0.822, 0.229], [0.023, 0.021, 0.02], 0.004); // eyes: round, and proud of the skull
// --- the ears: set high and wide, dropped — the leather breaks just above the skull and hangs down beside
// the cheek, a soft triangle with long feathers behind it
tone(-1);
{
  const B = [0.084, 0.86, 0.09], F = [0.134, 0.868, 0.097], T = [0.168, 0.762, 0.146];
  flap(B, F, 0.044, 0.048, 0.02, [-0.3, 0.92, 0.15], 0.34);
  flap(F, T, 0.058, 0.015, 0.016, [0.88, 0.26, 0.38], 0.3);
  lock([0.158, 0.836, 0.08], [0.3, -1, -0.12], 0.115, 0.026, 0.014, 0.005);
  lock([0.146, 0.83, 0.058], [0.2, -1, -0.25], 0.1, 0.024, 0.014, 0.005);
}
// --- the patches of the face: deep round the eyes and on the cheeks, the pale blaze between them
mark([0.082, 0.825, 0.165], [0.064, 0.066, 0.075], -1);
mark([0, 0.85, 0.205], [0.023, 0.075, 0.075], 1);
mark([0, 0.8, 0.26], [0.07, 0.05, 0.075], 1);
mark([0.056, 0.822, 0.24], [0.021, 0.019, 0.02], -1.5); // (the eyes stay dark in their patches)

// ============================================================================ the bird, perched on the dog's head
{
  const s = 0.115, at = [0.012, 0.9, 0.1], M = rotInv([0, -0.45, 0.1]), o3 = [0, 0, 0];
  group('bird', { k: 0.008, scale: HS * s, loc: (x, y, z, o) => {
    headLoc(x, y, z, o3);
    const px = (o3[0] - at[0]) / s, py = (o3[1] - at[1]) / s, pz = (o3[2] - at[2]) / s;
    o[0] = M[0] * px + M[1] * py + M[2] * pz; o[1] = M[3] * px + M[4] * py + M[5] * pz; o[2] = M[6] * px + M[7] * py + M[8] * pz;
  } });
  tone(0.5);
  egg([0, 0.44, 0], [0.2, 0.3, 0.215], 0, [0.2, 0, 0]); // the body, upright
  tone(1);
  egg([0, 0.4, 0.09], [0.15, 0.22, 0.14], 0.04); // the breast
  tone(0.4);
  egg([0, 0.8, 0.07], [0.17, 0.16, 0.17], 0.06); // the head
  tone(-1.2);
  limb([0, 0.8, 0.21], [0, 0.72, 0.3], 0.06, 0.014, 0.02); // the beak, hooked
  egg([0.115, 0.83, 0.15], [0.034, 0.034, 0.024], 0.004); // eyes
  tone(-1);
  flap([0.17, 0.62, -0.02], [0.13, 0.1, -0.2], 0.15, 0.05, 0.02, [1, 0.1, 0.25], 0.3); // the wings, folded
  flap([0, 0.26, -0.14], [0, -0.26, -0.4], 0.1, 0.045, 0.03, [0, 0.55, 0.85], 0.3); // the tail
  flap([0, 0.92, 0.02], [0, 1.12, -0.12], 0.07, 0.02, 0.02, [1, 0, 0], 0.28); // a crest
  tone(0);
  egg([0.075, 0.04, 0.06], [0.05, 0.04, 0.09], 0.02); // feet
}

// ============================================================================ the cat, sitting at the dog's right
{
  const s = 0.32, at = [-0.368, 0, 0.085], M = rotInv([0, -0.5, 0]);
  group('cat', { scale: s, loc: (x, y, z, o) => {
    const px = (x - at[0]) / s, py = (y - at[1]) / s, pz = (z - at[2]) / s;
    o[0] = M[0] * px + M[1] * py + M[2] * pz; o[1] = M[3] * px + M[4] * py + M[5] * pz; o[2] = M[6] * px + M[7] * py + M[8] * pz;
  } });
  limb([0, 0.2, -0.1], [0, 0.52, 0.05], 0.2, 0.135, 0); // sitting: the back, from the rump to the shoulders
  tone(1);
  egg([0, 0.42, 0.11], [0.14, 0.17, 0.1], 0.05); // the chest
  tone(0);
  limb([0, 0.55, 0.06], [0, 0.69, 0.1], 0.12, 0.105, 0.05); // the neck
  egg([0, 0.79, 0.12], [0.155, 0.125, 0.135], 0.03); // the head, round
  egg([0.085, 0.75, 0.165], [0.075, 0.06, 0.07], 0.03); // cheeks
  tone(1);
  egg([0, 0.745, 0.24], [0.062, 0.045, 0.045], 0.02); // the muzzle
  tone(-1.4);
  egg([0, 0.772, 0.283], [0.02, 0.014, 0.013], 0.006); // the nose
  egg([0.068, 0.812, 0.232], [0.032, 0.028, 0.02], 0.006); // eyes
  tone(-1);
  flap([0.085, 0.865, 0.11], [0.125, 1.0, 0.085], 0.066, 0.012, 0.02, [0.2, 0.12, 1], 0.36); // the ears, pricked
  tone(0);
  egg([0.15, 0.17, -0.06], [0.1, 0.15, 0.17], 0.04, [-0.3, 0, 0]); // the haunches
  tone(1);
  egg([0.15, 0.035, 0.1], [0.05, 0.035, 0.1], 0.02); // the hind feet
  tone(0);
  limb([0.068, 0.42, 0.13], [0.068, 0.07, 0.175], 0.06, 0.046, 0.03); // the front legs, close together
  tone(1);
  egg([0.068, 0.035, 0.205], [0.056, 0.037, 0.07], 0.02);
  // its tail, brought round its feet (not mirrored), the tip deep
  tone(0);
  const tail = [[0, 0.075, -0.27], [-0.15, 0.06, -0.235], [-0.245, 0.056, -0.09], [-0.25, 0.052, 0.09], [-0.17, 0.05, 0.25], [-0.03, 0.05, 0.31]];
  for (let i = 0; i + 1 < tail.length; i++) { if (i === tail.length - 2) tone(-1); limb(tail[i], tail[i + 1], 0.05 - i * 0.004, 0.046 - i * 0.004, i ? 0.01 : 0.04).one = true; }
  mark([0, 0.86, 0.14], [0.05, 0.05, 0.06], -0.7); // a darker cap between the ears
}

// ============================================================================ the snake, coiled at the dog's left
{
  const sc = 1.2, at = [0.352, 0, 0.07];
  group('snake', { mirror: false, scale: sc, loc: (x, y, z, o) => { o[0] = (x - at[0]) / sc; o[1] = (y - at[1]) / sc; o[2] = (z - at[2]) / sc; } });
  // three turns of a coil that narrows as it rises, then the neck, up in a curve to the head that looks ahead
  const pts = [];
  for (let i = 0; i <= 50; i++) { const u = i / 50, a = u * Math.PI * 2 * 2.6 + 2.2, R = 0.068 - 0.04 * u; pts.push([Math.sin(a) * R, 0.022 + 0.062 * u * u + 0.02 * u, Math.cos(a) * R, 0.0215 - 0.002 * u]); }
  const end = pts[pts.length - 1], a1 = 2.6 * Math.PI * 2 + 2.2;
  for (let i = 1; i <= 9; i++) { const u = i / 9; pts.push([end[0] + Math.sin(a1 + 1.2) * 0.012 * u - 0.004 * u, end[1] + 0.105 * u - 0.012 * u * u, end[2] + Math.cos(a1 + 1.2) * 0.012 * u + 0.05 * u * u, 0.0195 - 0.003 * u]); }
  pts.forEach((p, i) => { if (i === 0) return; const q = pts[i - 1]; tone(Math.floor(i / 4) % 2 ? -1 : 0.3); limb([q[0], q[1], q[2]], [p[0], p[1], p[2]], i < 4 ? 0.008 + q[3] * (i / 4) : q[3], i < 4 ? 0.008 + p[3] * ((i + 1) / 4) : p[3], i === 1 ? 0 : 0.004); });
  const h = pts[pts.length - 1];
  tone(0.3);
  egg([h[0], h[1] + 0.004, h[2] + 0.02], [0.024, 0.016, 0.034], 0.012); // the head, flat
  tone(-1.4);
  for (const sx of [-1, 1]) egg([h[0] + sx * 0.015, h[1] + 0.013, h[2] + 0.03], [0.006, 0.006, 0.007], 0.002); // eyes
}

// ---------------------------------------------------------------------------
// The field: how far a point is from the surface (negative inside)
const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
/** How far the point (x0, y, z), in the frame of its group, is from the shape `p`. */
function primDist(p, x0, y, z, mirror) {
  const x = mirror && !p.one ? Math.abs(x0) : x0;
  if (p.t === 1) {
    const a = p.a, b = p.b, bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], l2 = bx * bx + by * by + bz * bz, rr = p.r1 - p.r2, a2 = l2 - rr * rr, il2 = 1 / l2;
    let px = x - a[0], py = y - a[1], pz = z - a[2];
    if (p.n) { const sn = (px * p.n[0] + py * p.n[1] + pz * p.n[2]) * p.g; px += p.n[0] * sn; py += p.n[1] * sn; pz += p.n[2] * sn; }
    const yy = px * bx + py * by + pz * bz, zz = yy - l2;
    const qx = px * l2 - bx * yy, qy = py * l2 - by * yy, qz = pz * l2 - bz * yy, x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
    const kk = Math.sign(rr) * rr * rr * x2;
    let v;
    if (Math.sign(zz) * a2 * z2 > kk) v = Math.sqrt(x2 + z2) * il2 - p.r2;
    else if (Math.sign(yy) * a2 * y2 < kk) v = Math.sqrt(x2 + y2) * il2 - p.r1;
    else v = (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - p.r1;
    return p.n ? v * p.f : v;
  }
  const m = p.m, ox = x - p.c[0], oy = y - p.c[1], oz = z - p.c[2];
  const lx = m[0] * ox + m[1] * oy + m[2] * oz, ly = m[3] * ox + m[4] * oy + m[5] * oz, lz = m[6] * ox + m[7] * oy + m[8] * oz;
  if (p.t === 0) {
    const r = p.r, ax = lx / r[0], ay = ly / r[1], az = lz / r[2], k0 = Math.hypot(ax, ay, az), k1 = Math.hypot(ax / r[0], ay / r[1], az / r[2]);
    return k0 < 1e-6 ? -p.rm : (k0 * (k0 - 1)) / k1;
  }
  return Math.hypot(Math.hypot(lx, lz) - p.R, ly) - p.r;
}
// (each group is in a ball: a point far from the ball is not asked about the shapes inside it)
for (const g of groups) {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  const grow = (c, r) => { for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], c[a] - r); hi[a] = Math.max(hi[a], c[a] + r); } };
  for (const p of g.prims) {
    if (p.t === 0) grow(p.c, Math.max(...p.r));
    else if (p.t === 1) { const r = Math.max(p.r1, p.r2) / (p.f || 1); grow(p.a, r); grow(p.b, r); }
    else grow(p.c, p.R + p.r);
    if (g.mirror && !p.one) { lo[0] = Math.min(lo[0], -hi[0]); hi[0] = Math.max(hi[0], -lo[0]); }
  }
  g.ball = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2];
}
const Q = [0, 0, 0];
function dist(x, y, z) {
  let d = 1e9;
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    let lx = x, ly = y, lz = z;
    if (g.loc) { g.loc(x, y, z, Q); lx = Q[0]; ly = Q[1]; lz = Q[2]; }
    const far = (Math.hypot(lx - g.ball[0], ly - g.ball[1], lz - g.ball[2]) - g.ball[3]) * g.scale;
    if (far > 0.09 && far > d + g.k) { continue; }
    if (far > 0.09 && d === 1e9) { d = far; continue; }
    let v = 0;
    const ps = g.prims;
    for (let i = 0; i < ps.length; i++) { const w = primDist(ps[i], lx, ly, lz, g.mirror); v = i === 0 ? w : smin(v, w, ps[i].k); }
    v *= g.scale;
    d = d === 1e9 ? v : smin(d, v, g.k);
  }
  return d;
}
/** The tone of the gold at a point of the surface: that of the shapes it belongs to, then the patches over it. */
function toneAt(x, y, z) {
  let sw = 0, st = 0, best = null, bd = 1e9;
  for (const g of groups) {
    let lx = x, ly = y, lz = z;
    if (g.loc) { g.loc(x, y, z, Q); lx = Q[0]; ly = Q[1]; lz = Q[2]; }
    if ((Math.hypot(lx - g.ball[0], ly - g.ball[1], lz - g.ball[2]) - g.ball[3]) * g.scale > 0.05) continue;
    let gd = 1e9;
    for (const p of g.prims) {
      const v = primDist(p, lx, ly, lz, g.mirror) * g.scale, w = Math.exp(-Math.max(0, v) / 0.009);
      sw += w; st += w * p.tone;
      if (v < gd) gd = v;
    }
    if (gd < bd) { bd = gd; best = g; g.q = [lx, ly, lz]; }
  }
  let t = sw > 1e-9 ? st / sw : 0;
  if (best) for (const m of best.marks) {
    const [lx, ly, lz] = best.q, mx = (best.mirror && !m.one ? Math.abs(lx) : lx) - m.c[0], e = Math.hypot(mx / m.r[0], (ly - m.c[1]) / m.r[1], (lz - m.c[2]) / m.r[2]);
    const a = Math.min(1, Math.max(0, (1.12 - e) / 0.3));
    t += (m.t - t) * a * a * (3 - 2 * a);
  }
  return Math.max(-1.5, Math.min(1.5, t));
}
const E = 0.0015;
const normalAt = (x, y, z) => {
  const nx = dist(x + E, y, z) - dist(x - E, y, z), ny = dist(x, y + E, z) - dist(x, y - E, z), nz = dist(x, y, z + E) - dist(x, y, z - E), l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
};
/** How much of the sky a point of the surface sees (1: all of it; the hollows and the foot of the statue less). */
const lightAt = (x, y, z, n, f = dist) => {
  let occ = 0;
  for (const [d, w] of [[0.012, 0.3], [0.03, 0.28], [0.065, 0.24], [0.13, 0.18]]) {
    const px = x + n[0] * d, py = y + n[1] * d, pz = z + n[2] * d;
    occ += w * Math.max(0, d - Math.min(f(px, py, pz), py + 0.004)) / d;
  }
  return Math.max(0.22, 1 - occ * 1.25);
};

// ---------------------------------------------------------------------------
// The field on a grid, and the mesh: surface nets (one vertex in every cell the surface crosses, a quad across
// every edge it cuts)
const B0 = [-0.5, -CELL * 0.5, -0.46], B1 = [0.5, 1.1, 0.45];
const N3 = [0, 1, 2].map((a) => Math.ceil((B1[a] - B0[a]) / CELL));
function grid() {
  const [nx, ny, nz] = N3, sx = nx + 1, sy = ny + 1;
  const val = new Float32Array((nx + 1) * (ny + 1) * (nz + 1));
  for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const y = B0[1] + j * CELL;
    // (the statue stands on the ground: it is cut flat there)
    val[i + sx * (j + sy * k)] = Math.max(dist(B0[0] + i * CELL, y, B0[2] + k * CELL), -y);
  }
  return val;
}
/** The field read from the grid, between its points (for the preview: it is what the mesh is made of). */
const reader = (val) => {
  const [nx, ny, nz] = N3, sx = nx + 1, sy = ny + 1;
  return (x, y, z) => {
    const fx = (x - B0[0]) / CELL, fy = (y - B0[1]) / CELL, fz = (z - B0[2]) / CELL;
    const cx = Math.min(nx - 1e-6, Math.max(0, fx)), cy = Math.min(ny - 1e-6, Math.max(0, fy)), cz = Math.min(nz - 1e-6, Math.max(0, fz));
    const out = Math.hypot(fx - cx, fy - cy, fz - cz) * CELL;
    const i = Math.floor(cx), j = Math.floor(cy), k = Math.floor(cz), u = cx - i, v = cy - j, w = cz - k, o = i + sx * (j + sy * k);
    const a = val[o] * (1 - u) + val[o + 1] * u, b = val[o + sx] * (1 - u) + val[o + sx + 1] * u, c = val[o + sx * sy] * (1 - u) + val[o + sx * sy + 1] * u, d = val[o + sx * sy + sx] * (1 - u) + val[o + sx * sy + sx + 1] * u;
    return (a * (1 - v) + b * v) * (1 - w) + (c * (1 - v) + d * v) * w + out;
  };
};
function mesh(val) {
  const [nx, ny, nz] = N3, sx = nx + 1, sy = ny + 1;
  const at = (i, j, k) => i + sx * (j + sy * k);
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
  // the vertices are brought onto the surface itself, then their normals, their light and their tone are taken from it
  const V = pos.length / 3, nrm = new Float32Array(V * 3), light = new Float32Array(V), tones = new Float32Array(V);
  for (let v = 0; v < V; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    for (let it = 0; it < 3 && y > 0.002; it++) { const d = dist(x, y, z), g = normalAt(x, y, z); x -= g[0] * d * 0.8; y = Math.max(0, y - g[1] * d * 0.8); z -= g[2] * d * 0.8; }
    if (y < 0.004) y = 0;
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    const g = normalAt(x, Math.max(y, 0.003), z);
    nrm.set(g, v * 3);
    light[v] = lightAt(x, y, z, g);
    tones[v] = toneAt(x, y, z);
  }
  // (what lies flat on the ground is never seen: those triangles go)
  const kept = [];
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2]; if (pos[a * 3 + 1] > 0 || pos[b * 3 + 1] > 0 || pos[c * 3 + 1] > 0) kept.push(a, b, c); }
  return { pos: Float32Array.from(pos), nrm, light, tones, idx: kept };
}

function write({ pos, nrm, light, tones, idx }) {
  // only the vertices still in use
  const map = new Int32Array(pos.length / 3).fill(-1);
  let V = 0;
  for (const i of idx) if (map[i] < 0) map[i] = V++;
  if (V > 65535) throw new Error(`${V} vertices: too many for 16-bit indices (use a bigger --cell)`);
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (let i = 0; i < map.length; i++) if (map[i] >= 0) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], pos[i * 3 + a]); hi[a] = Math.max(hi[a], pos[i * 3 + a]); }
  const size = hi.map((h, a) => h - lo[a]);
  const at = 40 + V * 11 + (V & 1); // (the indices start on an even byte)
  const buf = Buffer.alloc(at + idx.length * 2);
  buf.writeUInt32LE(0x32415453, 0); buf.writeUInt32LE(V, 4); buf.writeUInt32LE(idx.length, 8); buf.writeUInt32LE(0, 12);
  [...lo, ...size].forEach((v, k) => buf.writeFloatLE(v, 16 + k * 4));
  for (let i = 0; i < map.length; i++) {
    const v = map[i];
    if (v < 0) continue;
    for (let a = 0; a < 3; a++) buf.writeUInt16LE(Math.round(((pos[i * 3 + a] - lo[a]) / size[a]) * 65535), 40 + v * 6 + a * 2);
    for (let a = 0; a < 3; a++) buf.writeInt8(Math.round(nrm[i * 3 + a] * 127), 40 + V * 6 + v * 4 + a);
    buf.writeInt8(Math.round(light[i] * 127), 40 + V * 6 + v * 4 + 3);
    buf.writeUInt8(Math.max(0, Math.min(255, Math.round(128 + tones[i] * 84))), 40 + V * 10 + v);
  }
  idx.forEach((i, k) => buf.writeUInt16LE(map[i], at + k * 2));
  fs.writeFileSync(OUT, buf);
  return { V, T: idx.length / 3, bytes: buf.length, lo, hi };
}

// ---------------------------------------------------------------------------
// A look at the sculpture: the field of the grid, marched ray by ray, lit like gold in the sun — in the three
// tones of its gold
const GOLDS = [[0.93, 0.37, 0.08], [1.0, 0.6, 0.12], [1.0, 0.86, 0.5]]; // deep, the gold itself, pale
const goldOf = (t) => { const a = GOLDS[t < 0 ? 0 : 2], b = GOLDS[1], u = Math.min(1.5, Math.abs(t)); return [b[0] + (a[0] - b[0]) * u, b[1] + (a[1] - b[1]) * u, b[2] + (a[2] - b[2]) * u]; };
async function preview(file, val) {
  const f = reader(val), fd = (x, y, z) => f(x, y, z);
  const W = Number(opt.w) || 340, H = Number(opt.h) || 430, views = (opt.views || '0,0;1.5708,0;0.65,0.12;3.1416,0;-0.65,0.12;-2.3,0.3').split(';').map((v) => v.split(',').map(Number));
  const img = Buffer.alloc(W * views.length * H * 3);
  const L = [0.45, 0.7, 0.55], ll = Math.hypot(...L), e = CELL * 0.8;
  views.forEach(([yaw, pitch, cx = 0, cy = 0.56, cz = 0, span = 1.18], vi) => {
    // the camera looks at the statue from the direction (sin yaw · cos pitch, sin pitch, cos yaw · cos pitch)
    const dx = -Math.sin(yaw) * Math.cos(pitch), dy = -Math.sin(pitch), dz = -Math.cos(yaw) * Math.cos(pitch);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw); // right
    const ux = -Math.sin(yaw) * Math.sin(pitch), uy = Math.cos(pitch), uz = -Math.cos(yaw) * Math.sin(pitch); // up
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const sxv = ((px + 0.5) / W - 0.5) * span, syv = (0.5 - (py + 0.5) / H) * (span * H) / W;
      const ox = cx + rx * sxv + ux * syv - dx * 2, oy = cy + uy * syv - dy * 2, oz = cz + rz * sxv + uz * syv - dz * 2;
      let t = 0, hit = false;
      for (let s = 0; s < 220 && t < 4; s++) {
        const d = Math.min(fd(ox + dx * t, oy + dy * t, oz + dz * t), oy + dy * t + 0.0005);
        if (d < 0.0008) { hit = true; break; }
        t += Math.max(d * 0.8, 0.0006);
      }
      let c = [0.62, 0.74, 0.86];
      if (hit) {
        const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
        if (y < 0.002) c = Math.hypot(x, z) < 0.47 ? [0.5, 0.48, 0.45] : [0.36, 0.35, 0.34];
        else {
          const gx = fd(x + e, y, z) - fd(x - e, y, z), gy = fd(x, y + e, z) - fd(x, y - e, z), gz = fd(x, y, z + e) - fd(x, y, z - e), gl = Math.hypot(gx, gy, gz) || 1, n = [gx / gl, gy / gl, gz / gl];
          const ao = lightAt(x, y, z, n, fd), g = goldOf(opt.plain ? 0 : toneAt(x, y, z));
          const dif = Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / ll);
          const hx = L[0] / ll - dx, hy = L[1] / ll - dy, hz = L[2] / ll - dz, hl = Math.hypot(hx, hy, hz), sp = Math.max(0, (n[0] * hx + n[1] * hy + n[2] * hz) / hl) ** 40;
          const up = 0.5 + 0.5 * n[1], k = (0.25 + 0.4 * up) * ao + dif * 0.75;
          c = [Math.min(1, g[0] * k + sp), Math.min(1, g[1] * 1.2 * k + sp * 0.9), Math.min(1, g[2] * 1.6 * k + sp * 0.6)];
        }
      }
      const o = (py * W * views.length + vi * W + px) * 3;
      img[o] = c[0] * 255; img[o + 1] = c[1] * 255; img[o + 2] = c[2] * 255;
    }
  });
  await sharp(img, { raw: { width: W * views.length, height: H, channels: 3 } }).png().toFile(file);
}

const t0 = Date.now();
const val = grid();
const out = write(mesh(val));
console.log(`statue: ${groups.map((g) => `${g.name} ${g.prims.length}`).join(', ')} shapes; ${out.V} vertices, ${out.T} triangles, ${(out.bytes / 1024).toFixed(0)} KB, box ${out.lo.map((v) => v.toFixed(3))} … ${out.hi.map((v) => v.toFixed(3))} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
if (opt.preview) { await preview(path.resolve(opt.preview), val); console.log('preview', opt.preview, `(${((Date.now() - t0) / 1000).toFixed(1)} s)`); }
