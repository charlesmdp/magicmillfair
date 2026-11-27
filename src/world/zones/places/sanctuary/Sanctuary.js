// The Sanctuary: what is seen of it. Its plan is in plan.js; here it is built — a great hall of pale stone under
// a dome, at the foot of the cliff that closes the west meadow: a front with two towers, tall doors and a rose
// over a broad stair, and inside, round the middle under the eye of the dome, three chapels of the same size,
// the same height and the same light: a mosque, a church and a synagogue.
//
// Outside it is stone in the sun of the world, like every building of the valley. Inside, its light is painted
// into the vertices (`lightAt`): what comes down from the eye of the dome, cool and white, and what comes through
// the coloured glass at the end of each arm, warm — the same lamp for each chapel. Nothing of it moves.
import * as THREE from 'three';
import { Parts } from '../../../props/MeshBuilder.js';
import { LAYER } from '../../../../render/Shadows.js';
import { surfaceMaterial } from '../../../../render/SurfaceMaterial.js';
import { PLAN as P, toWorld, armPoint, FRONT, LANDING, STAIR_END, STEP, floorAt, inside, DOOR, walls } from './plan.js';
import { furnish } from './chapels.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2, HALF = Math.PI / 2, EPS = 1e-6;
const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7 + 74.7) * 43758.5453; return s - Math.floor(s); };
const span = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
const ARMS = [0, HALF, Math.PI, -HALF];
/** A point of an arm (u across, y up, v out from the middle) in the frame of the hall. */
export const A = (a, u, y, v) => { const [x, z] = armPoint(a, u, v); return V(x, y, z); };
const TOP = P.cornice + P.drum; // where the dome springs
export const APEX = TOP + P.R; // the eye of the dome, over the floor
const EAVES = P.spring + P.W + 1.4, RIDGE = EAVES + 2.8, RO = P.R + P.T, WO = P.W + P.T, DEEP = -9;

// ---- the stone and its light
export const STONE = [0.86, 0.8, 0.69], CREAM = [0.95, 0.9, 0.8], ROSE = [0.8, 0.66, 0.58], SLATE = [0.5, 0.53, 0.58], GOLD = [1.0, 0.76, 0.3];
const OUT = [0.93, 0.87, 0.75], ROOF = [0.56, 0.5, 0.45], DOME = [0.86, 0.8, 0.66];
/** The glass at the end of each arm: the same lamp for the three chapels (and the rose over the doors). */
const LAMPS = ARMS.map((a) => { const [x, z] = armPoint(a, 0, a === 0 ? P.chord - 0.6 : P.chord + P.W - 1.2); return { x, y: a === 0 ? 10 : 6.2, z, k: a === 0 ? 0.6 : 0.95, reach: 8.5 }; });
/** The light that falls on a point of the inside whose face looks the way `n` says: [r, g, b]. */
export function lightAt(p, n) {
  let r = 0.2, g = 0.2, b = 0.23; // (what is left in the shade: cool)
  // (the eye of the dome and the windows of the drum: white, from above)
  let dx = -p.x, dy = APEX - 2 - p.y, dz = -p.z, d = Math.hypot(dx, dy, dz) || 1;
  let w = ((0.35 + 0.65 * Math.max(0, (n.x * dx + n.y * dy + n.z * dz) / d)) * 1.2) / (1 + (d / 20) ** 2);
  r += w; g += 0.96 * w; b += 0.86 * w;
  // (the pool of light on the floor, under the eye)
  if (n.y > 0.9 && p.y < 1.5) { const pool = clamp(1 - (Math.hypot(p.x, p.z) - 2.0) / 3.4, 0, 1); r += 0.8 * pool; g += 0.72 * pool; b += 0.52 * pool; }
  // (the coloured glass at the end of each arm: gold)
  for (const L of LAMPS) {
    dx = L.x - p.x; dy = L.y - p.y; dz = L.z - p.z; d = Math.hypot(dx, dy, dz) || 1;
    w = ((0.3 + 0.7 * Math.max(0, (n.x * dx + n.y * dy + n.z * dz) / d)) * L.k) / (1 + (d / L.reach) ** 2);
    r += w; g += 0.78 * w; b += 0.46 * w;
  }
  return [r, g, b];
}
/** How a face of the inside is painted: its stone under its light. */
export const lit = (p, n, base, tone = 1) => { const L = lightAt(p, n); return [base[0] * L[0] * tone, base[1] * L[1] * tone, base[2] * L[2] * tone, 1]; };
/** How a face of the outside is painted: its stone (the sun of the world does the rest). */
const plain = (p, n, base, tone = 1) => [base[0] * tone, base[1] * tone, base[2] * tone, 1];

const newell = (a, q, r, d) => { const s = [a, q, r, d]; let x = 0, y = 0, z = 0; for (let i = 0; i < 4; i++) { const p = s[i], t = s[(i + 1) % 4]; x += (p.y - t.y) * (p.z + t.z); y += (p.z - t.z) * (p.x + t.x); z += (p.x - t.x) * (p.y + t.y); } return V(x, y, z); };
/** One face a-q-r-d that looks the way `want` says (a vector, or a point → vector), painted at each corner. */
export function face(b, a, q, r, d, want, base = STONE, paint = lit, tones = [1, 1, 1, 1]) {
  const n = newell(a, q, r, d);
  if (n.lengthSq() < 1e-7) return;
  n.normalize();
  const w = typeof want === 'function' ? want(V(0, 0, 0).add(a).add(q).add(r).add(d).multiplyScalar(0.25)) : want, flip = n.dot(w) < 0;
  if (flip) n.negate();
  const cs = [paint(a, n, base, tones[0]), paint(q, n, base, tones[1]), paint(r, n, base, tones[2]), paint(d, n, base, tones[3])];
  if (flip) b.quad(a, d, r, q, { normal: n, colors: [cs[0], cs[3], cs[2], cs[1]] }); else b.quad(a, q, r, d, { normal: n, colors: cs });
}
/**
 * A surface f(u, v) over the lists `us` and `vs`, in courses of blocks: every block has its own tone (laid in
 * bond: a block is two lengths wide, shifted by one on every other course), a little darker at its foot than at
 * its head. `base`: its stone, or (i, j) → the stone of a field.
 */
export function surf(b, us, vs, f, { want, base = STONE, jitter = 0.055, key = 0, paint = lit, bond = true, shade = 0.045 } = {}) {
  const rows = vs.map((v, j) => us.map((u, i) => f(u, v, i, j)));
  for (let j = 0; j + 1 < vs.length; j++) for (let i = 0; i + 1 < us.length; i++) {
    const t = 1 + (hash((bond ? Math.floor((i + (j % 2)) / 2) : i) + key * 31.7, j + key * 7.3) - 0.5) * 2 * jitter;
    face(b, rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i], want, typeof base === 'function' ? base(i, j) : base, paint, [t * (1 - shade), t * (1 - shade), t * (1 + shade), t * (1 + shade)]);
  }
}
/** A block between two corners given in a frame `F(x, y, z)` → a point of the hall: its faces, painted. `faces` as MeshBuilder.box. */
export function slab(b, F, x0, y0, z0, x1, y1, z1, base = STONE, { faces = 'xXyYzZ', paint = lit } = {}) {
  const c = F((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), out = (m) => m.clone().sub(c);
  const q = (a, d, e, g) => face(b, a, d, e, g, out, base, paint);
  if (faces.includes('x')) q(F(x0, y0, z0), F(x0, y0, z1), F(x0, y1, z1), F(x0, y1, z0));
  if (faces.includes('X')) q(F(x1, y0, z0), F(x1, y0, z1), F(x1, y1, z1), F(x1, y1, z0));
  if (faces.includes('y')) q(F(x0, y0, z0), F(x1, y0, z0), F(x1, y0, z1), F(x0, y0, z1));
  if (faces.includes('Y')) q(F(x0, y1, z0), F(x1, y1, z0), F(x1, y1, z1), F(x0, y1, z1));
  if (faces.includes('z')) q(F(x0, y0, z0), F(x1, y0, z0), F(x1, y1, z0), F(x0, y1, z0));
  if (faces.includes('Z')) q(F(x0, y0, z1), F(x1, y0, z1), F(x1, y1, z1), F(x0, y1, z1));
}
/** Something turned on a lathe, standing at `at` (a point of the hall): `profile` [[radius, height], …] from its foot up. */
export function turn(b, at, profile, sides = 10, base = STONE, { paint = lit, shade = 0 } = {}) {
  surf(b, span(0, TAU, sides), profile.map((_, i) => i), (t, i) => V(at.x + profile[i][0] * Math.sin(t), at.y + profile[i][1], at.z + profile[i][0] * Math.cos(t)),
    { want: (m) => V(m.x - at.x, 0.02, m.z - at.z), base, jitter: 0, paint, bond: false, shade });
}

export class Sanctuary {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'sanctuary';
    /** Where one stands before its doors, looking in. */
    this.door = DOOR;
    this.name = P.name;
  }

  /** How much one is in it, 0 … 1 (see plan.js). */
  inside(x, y, z) { return inside(x, y, z); }

  build() {
    const world = this.world, grain = world.materials.granite.uniforms.uNormalMap.value;
    const mats = {
      ...world.materials,
      sanctuaryStone: surfaceMaterial({ normalMap: grain, name: 'sanctuary-stone', rough: 0.92, spec: 0.05, normalScale: 0.7, uvScale: 0.5 }),
      sanctuaryIn: surfaceMaterial({ name: 'sanctuary-inside', color: [0, 0, 0], rough: 1, spec: 0, emissive: [1, 1, 1] }),
      sanctuaryThin: surfaceMaterial({ name: 'sanctuary-thin', color: [0, 0, 0], rough: 1, spec: 0, emissive: [1, 1, 1], side: THREE.DoubleSide }),
    };
    const M = new THREE.Matrix4().makeRotationY(P.yaw).setPosition(P.at.x, P.floor, P.at.z);
    const outP = new Parts(), inP = new Parts();
    const mk = (parts, key) => { const b = parts.get(key); b.push(M); return b; };
    const out = mk(outP, 'sanctuaryStone'), shine = mk(outP, 'sanctuaryIn'), inn = mk(inP, 'sanctuaryIn'), thin = mk(inP, 'sanctuaryThin');
    const middle = (y) => (m) => V(-m.x, y - m.y, -m.z); // (a face of the round middle looks at its axis)
    const away = (m) => V(m.x, 0.3 * Math.hypot(m.x, m.z), m.z);

    // ================================================================ inside
    // ---- the round wall, with its four arches
    const a0 = Math.asin(P.W / P.R), jamb = new Set([7, 17, 31, 41, 55, 65, 79, 89]), angles = [];
    for (let i = 0; i <= 96; i++) { const t = (i / 96) * TAU; if (jamb.has(i)) angles.push(t - EPS, t + EPS); else angles.push(t); }
    const archAt = (t) => { for (const a of ARMS) { const d = Math.atan2(Math.sin(t - a), Math.cos(t - a)); if (Math.abs(d) < a0 - EPS / 2) return P.spring + Math.sqrt(Math.max(0, P.W * P.W - (P.R * Math.sin(d)) ** 2)); } return 0; };
    surf(inn, angles, span(0, P.cornice, 18), (t, y) => V(P.R * Math.sin(t), Math.max(y, archAt(t)), P.R * Math.cos(t)), { want: middle(8), key: 1 });
    // (its cornice, the drum and its windows)
    const ring = (b, profile, sides, want, o = {}) => surf(b, span(0, TAU, sides), profile.map((_, i) => i), (t, i) => V(profile[i][0] * Math.sin(t), profile[i][1], profile[i][0] * Math.cos(t)), { want, bond: false, jitter: 0.02, ...o });
    ring(inn, [[P.R, P.cornice - 0.9], [P.R - 0.18, P.cornice - 0.8], [P.R - 0.18, P.cornice - 0.55], [P.R - 0.5, P.cornice - 0.25], [P.R - 0.5, P.cornice], [P.R - 0.1, P.cornice + 0.02]], 96, middle(6), { base: CREAM });
    surf(inn, span(0, TAU, 96), span(P.cornice, TOP, 5), (t, y) => V((P.R - 0.1) * Math.sin(t), y, (P.R - 0.1) * Math.cos(t)), { want: middle(12), key: 2 });
    ring(inn, [[P.R - 0.1, TOP - 0.35], [P.R - 0.4, TOP - 0.2], [P.R - 0.4, TOP], [P.R, TOP + 0.02]], 96, middle(8), { base: CREAM });
    // ---- the dome: night blue at its foot, gold towards its eye; ribs of stone; stars
    const fMax = Math.acos(P.oculus / P.R), domeAt = (t, f, r = P.R) => V(r * Math.cos(f) * Math.sin(t), TOP + r * Math.sin(f), r * Math.cos(f) * Math.cos(t));
    const NIGHT = [0.2, 0.3, 0.62], DAWN = [1.0, 0.86, 0.6];
    surf(inn, span(0, TAU, 48), span(0, fMax, 14), (t, f) => domeAt(t, f), { want: middle(10), bond: false, jitter: 0.03, shade: 0,
      base: (i, j) => { const k = clamp((j - 6) / 8, 0, 1) ** 1.5; return [NIGHT[0] + (DAWN[0] - NIGHT[0]) * k, NIGHT[1] + (DAWN[1] - NIGHT[1]) * k, NIGHT[2] + (DAWN[2] - NIGHT[2]) * k]; } });
    for (let k = 0; k < 16; k++) { const t0 = ((k + 0.5) / 16) * TAU, w = 0.26 / P.R; surf(inn, [t0 - w, t0 + w], span(0, fMax, 14), (t, f) => domeAt(t, f, P.R - 0.14), { want: middle(10), base: CREAM, bond: false, jitter: 0.03, shade: 0 }); }
    for (let k = 0; k < 90; k++) {
      // (stars of gold, small, scattered between the ribs)
      const t = ((Math.floor(k / 6) + 0.2 + 0.6 * hash(k, 3)) / 16) * TAU + TAU / 32, f = 0.08 + 0.92 * hash(k, 5) * (fMax - 0.5), s = 0.1 + 0.09 * hash(k, 9), c = domeAt(t, f, P.R - 0.06);
      const e1 = domeAt(t + 0.01, f, P.R - 0.06).sub(c).normalize().multiplyScalar(s), e2 = domeAt(t, f + 0.01, P.R - 0.06).sub(c).normalize().multiplyScalar(s), g = 1.1 + 0.9 * hash(k, 11);
      face(inn, c.clone().sub(e1), c.clone().sub(e2), c.clone().add(e1), c.clone().add(e2), middle(10), [1.0 * g, 0.82 * g, 0.4 * g], plain);
    }
    // (its eye: a ring of stone, and the sky)
    const eyeY = TOP + P.R * Math.sin(fMax);
    ring(inn, [[P.oculus + 0.5, eyeY - 0.12], [P.oculus, eyeY - 0.02], [P.oculus, eyeY + 1.5]], 32, middle(eyeY - 3), { base: [1.25, 1.2, 1.05] });
    ring(shine, [[0.001, eyeY + 1.5], [P.oculus + 0.05, eyeY + 1.5]], 24, V(0, -1, 0), { base: [1.9, 1.85, 1.7], paint: plain });
    // (the windows of the drum: sixteen panes of coloured glass)
    const GLASS = [[0.25, 0.5, 1.5], [1.6, 1.05, 0.25], [1.5, 0.28, 0.22], [0.3, 1.2, 0.6], [1.5, 1.35, 0.95]];
    /** A window of coloured glass: panes in a pointed frame, from `o` (its foot, in the middle), `x` to its right, `y` up. */
    const lancet = (b, o, x, y, w, h, want, key = 0, k = 1) => {
      const cols = 2, rows = Math.max(2, Math.round(h / 0.55)), P3 = (u, v) => o.clone().addScaledVector(x, u).addScaledVector(y, v);
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) { const c = GLASS[Math.floor(hash(i + key * 3.1, j + key * 1.7) * 4.999)], g = k * (0.75 + 0.5 * hash(j, i + key)); face(b, P3(-w / 2 + (i * w) / cols + 0.03, (j * h) / rows + 0.03), P3(-w / 2 + ((i + 1) * w) / cols - 0.03, (j * h) / rows + 0.03), P3(-w / 2 + ((i + 1) * w) / cols - 0.03, ((j + 1) * h) / rows - 0.03), P3(-w / 2 + (i * w) / cols + 0.03, ((j + 1) * h) / rows - 0.03), want, [c[0] * g, c[1] * g, c[2] * g], plain); }
      for (let i = 0; i < 6; i++) { const t0 = (i / 6) * Math.PI, t1 = ((i + 1) / 6) * Math.PI, c = GLASS[(i + key) % 5], g = k; face(b, P3(0, h + 0.03), P3((w / 2 - 0.03) * Math.cos(t0), h + 0.03 + (w / 2) * 1.25 * Math.sin(t0)), P3((w / 2 - 0.03) * Math.cos(t1), h + 0.03 + (w / 2) * 1.25 * Math.sin(t1)), P3(0, h + 0.03), want, [c[0] * g, c[1] * g, c[2] * g], plain); }
    };
    for (let k = 0; k < 16; k++) { const t = (k / 16) * TAU, r = P.R - 0.16; lancet(inn, V(r * Math.sin(t), P.cornice + 0.7, r * Math.cos(t)), V(Math.cos(t), 0, -Math.sin(t)), V(0, 1, 0), 1.1, 1.9, middle(12), k, 1.15); }

    // ---- the four arms: their walls and their vaults
    const half = (s) => [...span(0, P.spring, 9).map((y) => [s * P.W, y]), ...Array.from({ length: 8 }, (_, k) => { const t = ((k + 1) / 8) * HALF; return [s * P.W * Math.cos(t), P.spring + P.W * Math.sin(t)]; })];
    ARMS.forEach((a, n) => {
      const axis = (m) => { const v = m.x * Math.sin(a) + m.z * Math.cos(a); return A(a, 0, 3.5, v).sub(m); };
      for (const s of [-1, 1]) { const sec = half(s); surf(inn, span(0, 1, 8), sec.map((_, i) => i), (t, i) => { const [u, y] = sec[i], v0 = Math.sqrt(P.R * P.R - u * u); return A(a, u, y, v0 + (P.chord - v0) * t); }, { want: axis, key: 10 + n * 2 + s }); }
      // (a band of stone where the vault springs, and an arch of lighter stone where the arm opens)
      for (const s of [-1, 1]) slab(inn, (x, y, z) => A(a, x, y, z), s * P.W - 0.14, P.spring - 0.32, Math.sqrt(P.R * P.R - P.W * P.W), s * P.W + 0.14, P.spring, P.chord, CREAM, { faces: s < 0 ? 'XyY' : 'xyY' });
      // (the floor of the arm: flags of two stones)
      surf(inn, span(-P.W, P.W, 8), span(0, 1, 9), (u, t) => { const v0 = Math.sqrt(P.R * P.R - u * u) - 0.4; return A(a, u, 0, v0 + (P.chord - v0) * t); }, { want: V(0, 1, 0), bond: false, jitter: 0.035, shade: 0, base: (i, j) => ((i + j) % 2 ? CREAM : ROSE) });
      if (a === 0) return;
      // (the half circle of a chapel, and its half dome)
      const prof = [...span(0, P.spring, 9).map((y) => [P.W, y]), ...Array.from({ length: 8 }, (_, k) => { const t = ((k + 1) / 8) * HALF; return [P.W * Math.cos(t), P.spring + P.W * Math.sin(t)]; })];
      surf(inn, span(0, Math.PI, 24), prof.map((_, i) => i), (bb, i) => A(a, prof[i][0] * Math.cos(bb), prof[i][1], P.chord + prof[i][0] * Math.sin(bb)), { want: (m) => A(a, 0, 3.5, P.chord).sub(m), key: 30 + n });
      surf(inn, span(0, Math.PI, 12), [0, 1.9, 3.7, P.W + 0.3], (bb, r) => A(a, r * Math.cos(bb), 0, P.chord + r * Math.sin(bb)), { want: V(0, 1, 0), bond: false, jitter: 0.035, shade: 0, base: (i, j) => ((i + j) % 2 ? ROSE : CREAM) });
      // (two tall windows of coloured glass, either side of what the chapel turns to)
      for (const bb of [Math.PI * 0.2, Math.PI * 0.8]) { const r = P.W - 0.07, o = A(a, r * Math.cos(bb), 1.9, P.chord + r * Math.sin(bb)), x = A(a, -Math.sin(bb), 0, Math.cos(bb)); lancet(inn, o, x, V(0, 1, 0), 1.3, 3.5, (m) => A(a, 0, 3.5, P.chord).sub(m), n * 5 + Math.round(bb * 3), 1.3); }
    });
    // ---- the floor of the middle: rings of flags round a disc of light
    const rs = [0, 1.1, 2.1, 2.5, 4.4, 4.8, 6.6, 8.4, 10.2, 10.6, 12.5];
    surf(inn, span(0, TAU, 48), rs, (t, r) => V(r * Math.sin(t), 0, r * Math.cos(t)), { want: V(0, 1, 0), bond: false, jitter: 0.035, shade: 0,
      base: (i, j) => (j === 0 ? CREAM : j === 2 || j === 4 || j === 8 ? SLATE : j === 1 ? (Math.floor(i / 2) % 2 ? ROSE : CREAM) : j === 3 ? CREAM : (Math.floor(i / 3) + j) % 2 ? CREAM : ROSE) });
    // ---- the wall of the doors, seen from inside: the doorway, and the rose over it
    const D = P.door, doorAt = (u) => (Math.abs(u) < D.half - EPS / 2 ? D.spring + Math.sqrt(Math.max(0, D.half * D.half - u * u)) : 0), vaultAt = (u) => P.spring + Math.sqrt(Math.max(0, P.W * P.W - u * u));
    const across = [...span(-P.W, -D.half - EPS, 4), ...span(-D.half + EPS, D.half - EPS, 10), ...span(D.half + EPS, P.W, 4)];
    surf(inn, across, span(0, P.spring + P.W, 16), (u, y) => V(u, clamp(y, doorAt(u), vaultAt(u)), P.chord), { want: V(0, 0, -1), key: 40 });
    /** A round window: petals of glass round a heart, in a ring of stone. */
    const rose = (b, c, x, y, r, want, k = 1, stone = lit) => {
      const P3 = (u, v) => c.clone().addScaledVector(x, u).addScaledVector(y, v), n = 12;
      for (let i = 0; i < n; i++) {
        const t0 = (i / n) * TAU, t1 = ((i + 1) / n) * TAU, tm = (t0 + t1) / 2, g = GLASS[i % 2 ? 0 : 1], h = GLASS[i % 2 ? 2 : 3], e = 0.04;
        face(b, P3(0.3 * r * Math.cos(t0 + e), 0.3 * r * Math.sin(t0 + e)), P3(0.72 * r * Math.cos(t0 + e), 0.72 * r * Math.sin(t0 + e)), P3(0.72 * r * Math.cos(t1 - e), 0.72 * r * Math.sin(t1 - e)), P3(0.3 * r * Math.cos(t1 - e), 0.3 * r * Math.sin(t1 - e)), want, [g[0] * k, g[1] * k, g[2] * k], plain);
        face(b, P3(0.76 * r * Math.cos(t0 + e), 0.76 * r * Math.sin(t0 + e)), P3(0.93 * r * Math.cos(tm), 0.93 * r * Math.sin(tm)), P3(0.93 * r * Math.cos(tm), 0.93 * r * Math.sin(tm)), P3(0.76 * r * Math.cos(t1 - e), 0.76 * r * Math.sin(t1 - e)), want, [h[0] * k, h[1] * k, h[2] * k], plain);
        face(b, P3(0, 0), P3(0.26 * r * Math.cos(t0), 0.26 * r * Math.sin(t0)), P3(0.26 * r * Math.cos(t1), 0.26 * r * Math.sin(t1)), P3(0, 0), want, [GLASS[4][0] * k, GLASS[4][1] * k, GLASS[4][2] * k], plain);
      }
      return stone;
    };
    rose(inn, V(0, 9.6, P.chord - 0.06), V(-1, 0, 0), V(0, 1, 0), 2.1, V(0, 0, -1), 1.35);

    // ---- what each chapel holds, and the bench round the middle
    const solid = furnish({ inn, thin, lancet, rose, GLASS, V, A, face, slab, turn, surf, lit, plain, span, hash, STONE, CREAM, ROSE, SLATE, GOLD });

    // ================================================================ outside
    const courses = (top) => [DEEP, 0.55, 0.55 + EPS, ...span(1.3, top, Math.round((top - 1.3) / 0.76))], foot = (j) => (j < 2 ? 0.3 : 0);
    // ---- the round middle: its wall up to the dome, and the dome
    const drumTop = TOP + 1.2;
    surf(out, span(0, TAU, 48), courses(drumTop), (t, y, i, j) => V((RO + foot(j)) * Math.sin(t), y, (RO + foot(j)) * Math.cos(t)), { want: away, base: OUT, paint: plain, key: 50 });
    ring(out, [[RO, drumTop - 0.5], [RO + 0.45, drumTop - 0.15], [RO + 0.45, drumTop + 0.15], [RO - 0.3, drumTop + 0.3]], 48, away, { base: CREAM, paint: plain });
    const RD = RO - 0.25, capY = drumTop + 0.3 + RD * Math.sin(Math.acos((P.oculus + 0.9) / RD));
    surf(out, span(0, TAU, 48), span(0, Math.acos((P.oculus + 0.9) / RD), 12), (t, f) => V(RD * Math.cos(f) * Math.sin(t), drumTop + 0.3 + RD * Math.sin(f), RD * Math.cos(f) * Math.cos(t)), { want: away, base: DOME, paint: plain, bond: false, jitter: 0.03, shade: 0.02, key: 51 });
    for (let k = 0; k < 16; k++) { const t0 = ((k + 0.5) / 16) * TAU, w = 0.3 / RD; surf(out, [t0 - w, t0 + w], span(0, Math.acos((P.oculus + 0.9) / RD), 12), (t, f) => V((RD + 0.16) * Math.cos(f) * Math.sin(t), drumTop + 0.3 + (RD + 0.16) * Math.sin(f), (RD + 0.16) * Math.cos(f) * Math.cos(t)), { want: away, base: CREAM, paint: plain, bond: false, jitter: 0.02, shade: 0 }); }
    // (the lantern over its eye: a ring of little arches, a cap, a ball of gold)
    ring(out, [[P.oculus + 1.1, capY - 0.3], [P.oculus + 1.1, capY + 0.5], [P.oculus + 0.75, capY + 0.6], [P.oculus + 0.75, capY + 2.3], [P.oculus + 1.2, capY + 2.5], [P.oculus + 1.2, capY + 2.8], [P.oculus * 0.55, capY + 4.0], [0.16, capY + 4.9], [0.1, capY + 5.6]], 16, away, { base: CREAM, paint: plain });
    for (let k = 0; k < 8; k++) { const t = (k / 8) * TAU, r = P.oculus + 0.78; lancet(shine, V(r * Math.sin(t), capY + 0.85, r * Math.cos(t)), V(Math.cos(t), 0, -Math.sin(t)), V(0, 1, 0), 0.8, 0.9, away, k, 0.8); }
    out.tint(1.5, 1.05, 0.25, 1).place(0, capY + 5.9, 0).lathe([[0.01, -0.42], [0.3, -0.3], [0.42, 0], [0.3, 0.3], [0.01, 0.42]], 10).pop();
    // (the windows of the drum, seen from outside)
    for (let k = 0; k < 16; k++) { const t = (k / 16) * TAU, r = RO + 0.03; lancet(shine, V(r * Math.sin(t), P.cornice + 1.9, r * Math.cos(t)), V(Math.cos(t), 0, -Math.sin(t)), V(0, 1, 0), 1.1, 1.9, away, k, 0.55); }

    // ---- the four arms: walls, buttresses, roofs; the half circles of the chapels
    ARMS.forEach((a, n) => {
      const F = (x, y, z) => A(a, x, y, z), off = (m) => { const v = m.x * Math.sin(a) + m.z * Math.cos(a); return m.clone().sub(A(a, 0, m.y - 6, v)); };
      const v0 = Math.sqrt(RO * RO - WO * WO) - 0.6, v1 = a === 0 ? FRONT : P.chord, ys = courses(EAVES);
      for (const s of [-1, 1]) {
        surf(out, span(v0, v1, 8), ys, (v, y, i, j) => F(s * (WO + foot(j)), y, v), { want: off, base: OUT, paint: plain, key: 60 + n * 2 + s });
        // (two buttresses a side, stepped)
        for (const v of [v0 + 3.4, v1 - 1.4 - (a === 0 ? 5.4 : 0)]) {
          slab(out, F, s * WO, DEEP, v - 0.75, s * (WO + 1.5), 5.2, v + 0.75, OUT, { faces: s < 0 ? 'xzZ' : 'XzZ', paint: plain });
          slab(out, F, s * WO, 5.2, v - 0.65, s * (WO + 1.0), 9.6, v + 0.65, OUT, { faces: s < 0 ? 'xzZ' : 'XzZ', paint: plain });
          for (const [y0, y1, d0, d1, hw] of [[5.2, 5.9, 1.5, 1.0, 0.75], [9.6, 10.5, 1.0, 0.0, 0.65]]) face(out, F(s * (WO + d0), y0, v - hw), F(s * (WO + d0), y0, v + hw), F(s * (WO + d1), y1, v + hw), F(s * (WO + d1), y1, v - hw), V(0, 1, 0), CREAM, plain);
        }
        // (the roof: slabs of stone)
        surf(out, span(v0 - 3, v1 + (a === 0 ? -0.2 : 0), 8), [0, 0.5, 1], (v, t) => F(s * (WO + 0.4) * (1 - t), EAVES + (RIDGE - EAVES) * t - 0.1, v), { want: V(0, 1, 0), base: ROOF, paint: plain, jitter: 0.07, key: 70 + n });
        // (a cornice under the eaves)
        slab(out, F, s * WO, EAVES - 0.5, v0, s * (WO + 0.3), EAVES, v1, CREAM, { faces: s < 0 ? 'xy' : 'Xy', paint: plain });
      }
      if (a === 0) return;
      surf(out, span(0, Math.PI, 16), ys, (bb, y, i, j) => F((WO + foot(j)) * Math.cos(bb), y, P.chord + (WO + foot(j)) * Math.sin(bb)), { want: (m) => m.clone().sub(F(0, m.y - 6, P.chord)), base: OUT, paint: plain, key: 80 + n });
      surf(out, span(0, Math.PI, 16), [0, 0.5, 1], (bb, t) => F((WO + 0.4) * (1 - t) * Math.cos(bb), EAVES - 0.1 + (RIDGE - EAVES) * t, P.chord + (WO + 0.4) * (1 - t) * Math.sin(bb)), { want: V(0, 1, 0), base: ROOF, paint: plain, jitter: 0.07, key: 90 + n });
      surf(out, span(0, Math.PI, 16), [EAVES - 0.5, EAVES], (bb, y) => F((WO + 0.3) * Math.cos(bb), y, P.chord + (WO + 0.3) * Math.sin(bb)), { want: (m) => m.clone().sub(F(0, m.y - 6, P.chord)), base: CREAM, paint: plain, bond: false, jitter: 0.02 });
      // (its windows, seen from outside)
      for (const bb of [Math.PI * 0.2, Math.PI * 0.8]) { const r = WO + 0.04, o = F(r * Math.cos(bb), 1.9, P.chord + r * Math.sin(bb)), x = F(-Math.sin(bb), 0, Math.cos(bb)); lancet(shine, o, x, V(0, 1, 0), 1.3, 3.5, (m) => m.clone().sub(F(0, m.y, P.chord)), n * 5 + Math.round(bb * 3), 0.6); }
    });

    // ---- the front: the gable with the doorway and the rose, the two towers, the stair
    const gable = (u) => EAVES + 0.9 + (RIDGE - EAVES) * (1 - Math.abs(u) / WO);
    const acrossOut = [...span(-WO, -D.half - 0.5 - EPS, 4), ...span(-D.half - 0.5 + EPS, D.half + 0.5 - EPS, 12), ...span(D.half + 0.5 + EPS, WO, 4)];
    // (the doorway is cut wider outside: three arches, one in the other, step in to the doors)
    const portal = (u, k) => { const h = D.half + 0.5 - k * 0.25; return Math.abs(u) < h - EPS / 2 ? D.spring + Math.sqrt(Math.max(0, h * h - u * u)) : 0; };
    surf(out, acrossOut, [DEEP, ...span(0, RIDGE + 0.9, 24)], (u, y) => V(u, clamp(y, portal(u, 0), gable(u)), FRONT), { want: V(0, 0, 1), base: OUT, paint: plain, key: 100 });
    for (let k = 0; k < 3; k++) {
      // (each arch: its face, and the turn of its inside)
      const h = D.half + 0.5 - k * 0.25, z = FRONT - k * 0.35, pts = [[-h, 0], ...Array.from({ length: 13 }, (_, i) => { const t = Math.PI - (i / 12) * Math.PI; return [h * Math.cos(t), D.spring + h * Math.sin(t)]; }), [h, 0]];
      for (let i = 0; i + 1 < pts.length; i++) {
        const [u0, y0] = pts[i], [u1, y1] = pts[i + 1], tone = k % 2 ? ROSE : CREAM, inw = (m) => V(-m.x, D.spring * 0.7 - m.y, 0.4);
        face(out, V(u0, y0, z), V(u1, y1, z), V(u1, y1, z - 0.35), V(u0, y0, z - 0.35), inw, tone, plain);
        if (k < 2) { const s0 = (h - 0.25) / h; face(out, V(u0, y0, z - 0.35), V(u1, y1, z - 0.35), V(u1 * s0, i === pts.length - 2 ? 0 : D.spring + (y1 - D.spring) * s0, z - 0.35), V(u0 * s0, i === 0 ? 0 : D.spring + (y0 - D.spring) * s0, z - 0.35), V(0, 0, 1), OUT, plain); }
      }
    }
    // (the turn of the doorway itself, through the wall)
    { const h = D.half, pts = [[-h, 0], ...Array.from({ length: 13 }, (_, i) => { const t = Math.PI - (i / 12) * Math.PI; return [h * Math.cos(t), D.spring + h * Math.sin(t)]; }), [h, 0]];
      for (let i = 0; i + 1 < pts.length; i++) face(out, V(pts[i][0], pts[i][1], FRONT - 1.05), V(pts[i + 1][0], pts[i + 1][1], FRONT - 1.05), V(pts[i + 1][0], pts[i + 1][1], P.chord), V(pts[i][0], pts[i][1], P.chord), (m) => V(-m.x, D.spring * 0.7 - m.y, 0), OUT, plain);
      const zz = FRONT - 0.7; // (back of the last step, down to the doorway)
      for (let i = 0; i + 1 < pts.length; i++) { const s0 = h / (h + 0.0001 + 0.0); face(out, V(pts[i][0] * 1.0, pts[i][1], zz - 0.35), V(pts[i + 1][0], pts[i + 1][1], zz - 0.35), V(pts[i + 1][0] * s0, pts[i + 1][1], zz - 0.35 - EPS), V(pts[i][0] * s0, pts[i][1], zz - 0.35 - EPS), V(0, 0, 1), OUT, plain); }
      slab(out, V, -h - 0.5, DEEP, P.chord - 0.2, h + 0.5, 0, FRONT, CREAM, { faces: 'Y', paint: plain }); // (its sill)
    }
    // (the doors: two tall leaves of dark wood, open)
    const wood = mk(outP, 'woodDark');
    for (const s of [-1, 1]) { wood.tint(0.62, 0.5, 0.4, 1).place(s * D.half, 0, P.chord + 0.15, s * -1.15); wood.box(s < 0 ? 0 : -D.half, 0, -0.07, s < 0 ? D.half : 0, D.spring + 1.1, 0.07); for (const y of [0.9, 2.6, 4.3]) wood.tint(0.25, 0.2, 0.16, 1).box(s < 0 ? 0 : -D.half, y, -0.1, s < 0 ? D.half : 0, y + 0.16, 0.1); wood.pop(); }
    // (the rose over the doors, in its ring of stone; three small round stones over the doorway: none above another)
    rose(shine, V(0, 10.6, FRONT + 0.05), V(1, 0, 0), V(0, 1, 0), 2.3, V(0, 0, 1), 0.62);
    for (let i = 0; i < 24; i++) { const t0 = (i / 24) * TAU, t1 = ((i + 1) / 24) * TAU, r0 = 2.3, r1 = 2.85, q = (r, t, z) => V(r * Math.cos(t), 10.6 + r * Math.sin(t), z); face(out, q(r0, t0, FRONT + 0.22), q(r1, t0, FRONT + 0.22), q(r1, t1, FRONT + 0.22), q(r0, t1, FRONT + 0.22), V(0, 0, 1), i % 2 ? CREAM : ROSE, plain); face(out, q(r1, t0, FRONT + 0.22), q(r1, t0, FRONT), q(r1, t1, FRONT), q(r1, t1, FRONT + 0.22), (m) => V(m.x, m.y - 10.6, 0), CREAM, plain); face(out, q(r0, t0, FRONT + 0.22), q(r0, t0, FRONT), q(r0, t1, FRONT), q(r0, t1, FRONT + 0.22), (m) => V(-m.x, 10.6 - m.y, 0), OUT, plain); }
    for (let i = 0; i < 12; i++) { const t = (i / 12) * TAU, c = Math.cos(t), s = Math.sin(t), px = -s * 0.07, py = c * 0.07, z = FRONT + 0.14; face(out, V(0.6 * c - px, 10.6 + 0.6 * s - py, z), V(2.3 * c - px, 10.6 + 2.3 * s - py, z), V(2.3 * c + px, 10.6 + 2.3 * s + py, z), V(0.6 * c + px, 10.6 + 0.6 * s + py, z), V(0, 0, 1), CREAM, plain); }
    // (a band of stone across the front, under the rose; the eaves of the gable)
    slab(out, V, -WO, 7.3, FRONT, WO, 7.7, FRONT + 0.25, CREAM, { faces: 'yYZ', paint: plain });
    for (const s of [-1, 1]) face(out, V(0, gable(0) + 0.0, FRONT + 0.3), V(s * WO, gable(WO), FRONT + 0.3), V(s * WO, gable(WO), FRONT - 0.5), V(0, gable(0), FRONT - 0.5), V(0, 1, 0), CREAM, plain);
    for (const s of [-1, 1]) face(out, V(0, gable(0), FRONT + 0.3), V(s * WO, gable(WO), FRONT + 0.3), V(s * WO, gable(WO) - 0.45, FRONT + 0.3), V(0, gable(0) - 0.45, FRONT + 0.3), V(0, 0, 1), CREAM, plain);
    // (the towers: square, in three stages, a belfry of two arches a side, a spire of stone)
    const Tw = P.towers, tz = FRONT - Tw.half + 0.9;
    for (const s of [-1, 1]) {
      const tx = s * (WO + Tw.half), ys = courses(Tw.height), corner = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]];
      for (let e = 0; e < 4; e++) surf(out, span(0, 1, 4), ys, (t, y, i, j) => { const h = Tw.half + foot(j) - (y > 15 ? 0.2 : 0); return V(tx + h * (corner[e][0] + (corner[e + 1][0] - corner[e][0]) * t), y, tz + h * (corner[e][1] + (corner[e + 1][1] - corner[e][1]) * t)); }, { want: (m) => V(m.x - tx, 0.2, m.z - tz), base: OUT, paint: plain, key: 110 + e + s });
      for (const y of [7.3, 15, Tw.height]) slab(out, V, tx - Tw.half - 0.22, y, tz - Tw.half - 0.22, tx + Tw.half + 0.22, y + 0.4, tz + Tw.half + 0.22, CREAM, { paint: plain });
      // (the belfry: dark arches, and tall slits lower down)
      for (let e = 0; e < 4; e++) {
        const nx = [0, 1, 0, -1][e], nz = [1, 0, -1, 0][e], h = Tw.half - 0.2 + 0.03, o = V(tx + nx * h, 0, tz + nz * h), x = V(nz, 0, -nx), dark = [0.11, 0.09, 0.08];
        for (const u of [-1.15, 1.15]) { const pts = [[-0.65, 16.6], ...Array.from({ length: 7 }, (_, i) => { const t = Math.PI - (i / 6) * Math.PI; return [0.65 * Math.cos(t), 20 + 0.65 * Math.sin(t)]; }), [0.65, 16.6]]; for (let i = 0; i + 1 < pts.length; i++) face(out, o.clone().addScaledVector(x, u + pts[i][0]).setY(pts[i][1]), o.clone().addScaledVector(x, u + pts[i + 1][0]).setY(pts[i + 1][1]), o.clone().addScaledVector(x, u + pts[i + 1][0]).setY(16.6), o.clone().addScaledVector(x, u + pts[i][0]).setY(16.6), V(nx, 0, nz), dark, plain); }
        const o2 = V(tx + nx * (Tw.half + 0.03), 0, tz + nz * (Tw.half + 0.03));
        for (const y of [3.2, 10]) face(out, o2.clone().addScaledVector(x, -0.22).setY(y), o2.clone().addScaledVector(x, 0.22).setY(y), o2.clone().addScaledVector(x, 0.22).setY(y + 2.6), o2.clone().addScaledVector(x, -0.22).setY(y + 2.6), V(nx, 0, nz), dark, plain);
      }
      const top = V(tx, Tw.height + 0.4 + Tw.spire, tz), hh = Tw.half + 0.05, y = Tw.height + 0.4;
      for (let e = 0; e < 4; e++) { const p0 = V(tx + hh * corner[e][0], y, tz + hh * corner[e][1]), p1 = V(tx + hh * corner[e + 1][0], y, tz + hh * corner[e + 1][1]), m0 = p0.clone().lerp(top, 0.5), m1 = p1.clone().lerp(top, 0.5), w = (m) => V(m.x - tx, 0.5, m.z - tz); face(out, p0, p1, m1, m0, w, ROOF, plain, [0.95, 0.95, 1.05, 1.05]); face(out, m0, m1, top, top, w, ROOF, plain, [1.05, 1.05, 1.15, 1.15]); }
      out.tint(1.5, 1.05, 0.25, 1).place(tx, top.y + 0.25, tz).lathe([[0.01, -0.3], [0.22, -0.2], [0.3, 0], [0.22, 0.2], [0.01, 0.3]], 8).pop();
    }
    // (the stair: a landing, and steps down to the meadow between two cheeks of stone)
    const St = P.steps;
    slab(out, V, -St.half, DEEP, FRONT, St.half, 0, LANDING, CREAM, { faces: 'YZ', paint: plain });
    for (let k = 0; k < St.n; k++) slab(out, V, -St.half, DEEP, LANDING + k * St.run, St.half, -(k + 0.5) * STEP, LANDING + (k + 1) * St.run, k % 2 ? OUT : CREAM, { faces: 'YZ', paint: plain });
    for (const s of [-1, 1]) {
      const x0 = s * St.half, x1 = s * (St.half + 0.9), n = 4, len = (STAIR_END + 0.6 - FRONT) / n;
      for (let k = 0; k < n; k++) { const top = 1.0 - ((k * len) / St.run) * STEP * (k ? 1 : 0); slab(out, V, Math.min(x0, x1), DEEP, FRONT + k * len, Math.max(x0, x1), top, FRONT + (k + 1) * len, OUT, { paint: plain }); slab(out, V, Math.min(x0, x1) - 0.08, top, FRONT + k * len - 0.08, Math.max(x0, x1) + 0.08, top + 0.18, FRONT + (k + 1) * len + 0.08, CREAM, { paint: plain }); }
    }

    // ================================================================ into the world
    const outer = outP.toMeshes(mats, { name: 'sanctuary-out', layers: [LAYER.STATIC_CASTER] });
    this.inner = inP.toMeshes(mats, { name: 'sanctuary-in', layers: [] });
    this.group.add(outer, this.inner);
    world.scene.add(this.group);
    this.group.updateMatrixWorld(true);
    this.triangles = [...outP.map.values(), ...inP.map.values()].reduce((s, b) => s + b.idx.length / 3, 0);

    // ---- where one walks, and what stops one
    const col = world.collision;
    col.addPlatform({ heightAt: floorAt, clearance: 1.2 });
    const put = ([lx, lz, hw, hl, yaw], y0, y1) => { const [x, z] = toWorld(lx, lz); col.addBox(x, z, hw, hl, yaw + P.yaw, y0, y1); };
    for (const b of walls()) put(b);
    for (const b of solid) put(b, P.floor - 1, P.floor + 4);
    return this;
  }

  /** Every frame: its inside is drawn only for who is near enough to see into it. */
  update(dt, time, camera) {
    if (!this.inner || !camera) return;
    const dx = camera.position.x - P.at.x, dz = camera.position.z - P.at.z;
    this.inner.visible = dx * dx + dz * dz < 150 * 150;
  }
}
