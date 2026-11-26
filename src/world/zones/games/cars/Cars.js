// Karting Simulator: what is seen of it and how it is played. Its rules are in rules.js; here it is built — a table in
// the meadow with a toy circuit on it for radio-controlled cars: a bright infield, kerbs red and white, walls of
// coloured tyres, a glowing pad, the sand, the oil, the ramp with its hoop of fire, the jets of fire beside the
// track, bunting round the table, a stand to drive from and the arch where one asks to play — and a race is played:
// a session that drives the player (see PlayerController.driver). The cars are only there while a race is on, drawn
// large and bright; their sparks, flames, skid marks and the confetti at the end are drawn here, never in the rules.
// The camera hangs over the table and looks straight down, so that the whole track is in view.
import * as THREE from 'three';
import { Parts, MeshBuilder } from '../../../props/MeshBuilder.js';
import { surfaceMaterial } from '../../../../render/SurfaceMaterial.js';
import { LAYER } from '../../../../render/Shadows.js';
import { ANIM } from '../../../../player/Character.js';
import { formatTime } from '../course.js';
import { V, clamp, gateArch, worldClock } from '../gates.js';
import { CARS, TRACK, PAD, SAND, RAMP, OIL, JETS, GATE, startRace, stepRace, botInput, placeOf, lapOf, jetTime } from './rules.js';

const C = CARS, T = TRACK, M = T.m, DS = T.ds, TAU = Math.PI * 2, STEP = C.step, F = C.fire;
const ORD = ['1st', '2nd', '3rd', '4th'];
// the cars: one's own, then the three rivals as they stand on the grid (rules.js: Blue, Yellow, Pink) — loud and far apart
const PAINT = [[2.7, 0.06, 0.05], [0.08, 0.5, 2.7], [2.3, 2.0, 0.05], [2.4, 0.2, 1.5]];
const GRASS = [[0.3, 1.05, 0.22], [0.36, 1.2, 0.26]], TARMAC = [0.16, 0.16, 0.2], RED = [2.3, 0.1, 0.08], CREAM = [2.1, 2.1, 2.0];
const TYRES = [[2.2, 0.12, 0.1], [2.3, 1.8, 0.08], [0.1, 0.45, 2.4], [2.0, 2.0, 2.0], [0.15, 1.6, 0.25], [2.2, 0.2, 1.4]];
const FLAGS = [[2.4, 0.15, 0.1], [2.4, 2.0, 0.1], [0.1, 0.5, 2.6], [0.2, 1.8, 0.3], [2.4, 0.3, 1.6], [2.5, 0.9, 0.05]];
const SPARK = [[1.6, 1.6, 1.6], [3, 2.6, 0.4], [3, 1.1, 0.1], [0.5, 1.2, 3.2]]; // smoke-white, then the sparks of a slide: yellow, orange, blue
const FLAME = [[2.6, 1.2, 0.2], [3, 2.5, 0.4], [3, 1.1, 0.1], [0.6, 1.3, 3.4]]; // the flame of the jump; the burst of a slide by its sparks
const BIG = 1.5; // the cars are drawn so much larger than they are to the boards and to each other (they were found small)
const TOP = 0.03, FOV = 50; // the tarmac stands so far over the table; the camera's field of view (degrees)

const UP = V(0, 1, 0);
/** A quad that faces `want` (up unless said): the order of its corners is found here. */
function face(b, a, p, c, d, color, want = UP) {
  const n = new THREE.Vector3().crossVectors(p.clone().sub(a), d.clone().sub(a));
  if (n.dot(want) >= 0) b.quad(a, p, c, d, { color }); else b.quad(a, d, c, p, { color });
}

/** A car, nose towards +z, 0.45 m long: a white body (the instance paints it), dark glass and wheels, a wing behind. */
function carGeometry() {
  const b = new MeshBuilder(), white = [1, 1, 1, 1], glass = [0.07, 0.08, 0.11, 1], dark = [0.05, 0.05, 0.06, 1], tyre = [0.04, 0.04, 0.05, 1];
  const body = (x0, y0, z0, x1, y1, z1, c = white) => b.box(x0, y0, z0, x1, y1, z1, { color: c });
  body(-0.12, 0.035, -0.2, 0.12, 0.085, 0.19);
  // (the nose slopes down: a wedge in front, a cab behind it)
  const w = 0.12;
  b.quad(V(-w, 0.085, 0.19), V(w, 0.085, 0.19), V(w * 0.8, 0.06, 0.225), V(-w * 0.8, 0.06, 0.225), { color: white });
  b.quad(V(-w * 0.8, 0.06, 0.225), V(w * 0.8, 0.06, 0.225), V(w * 0.8, 0.035, 0.225), V(-w * 0.8, 0.035, 0.225), { color: white });
  b.tri(V(-w, 0.035, 0.19), V(-w, 0.085, 0.19), V(-w * 0.8, 0.06, 0.225), { color: white }).tri(V(w, 0.085, 0.19), V(w, 0.035, 0.19), V(w * 0.8, 0.06, 0.225), { color: white });
  body(-0.075, 0.085, -0.1, 0.075, 0.13, 0.05, glass);
  body(-0.06, 0.13, -0.08, 0.06, 0.14, 0.03, white);
  body(-0.13, 0.115, -0.225, 0.13, 0.125, -0.17); // (the wing)
  body(-0.1, 0.085, -0.2, -0.085, 0.115, -0.185, dark); body(0.085, 0.085, -0.2, 0.1, 0.115, -0.185, dark);
  for (const [x, z] of [[-0.135, 0.13], [0.135, 0.13], [-0.135, -0.13], [0.135, -0.13]]) {
    b.tint(...tyre).place(x, 0.045, z, 0, 0, Math.PI / 2).cylinder(0, -0.021, 0, 0.045, 0.045, 0.042, 8).pop();
  }
  return b.build();
}
/** The flame of a boost: a long cone out of the exhaust, white — each flame is tinted by what lit it. */
function flameGeometry() {
  const b = new MeshBuilder();
  b.tint(1, 1, 1, 1).place(0, 0.06, -0.21, Math.PI, Math.PI / 2).lathe([[0.001, 0.34], [0.03, 0.2], [0.05, 0.06], [0.001, 0]], 6).pop();
  return b.build();
}
/** A tongue of fire one long along +z from its foot, white (tinted by the instance). */
function tongueGeometry() {
  const g = new THREE.ConeGeometry(0.16, 1, 7, 1);
  g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5);
  return g;
}
const glowMat = (color) => new THREE.MeshBasicMaterial(color ? { color } : { vertexColors: true });

/**
 * What flies about for a moment — sparks, smoke, flames, confetti: small boxes, each with its place, its speed, its
 * life, its colour and its size; gravity pulls the heavy ones, the light ones float. Only seen, never in the rules.
 */
class Bits {
  constructor(group, n) {
    this.n = n; this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n).fill(1);
    this.size = new Float32Array(n); this.fall = new Float32Array(n); this.spin = new Float32Array(n); this.flat = new Uint8Array(n); this.next = 0;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), glowMat(new THREE.Color(1, 1, 1)), n);
    this.mesh.name = 'cars-bits'; this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.count = 0;
    this.mesh.setColorAt(0, _c.setRGB(1, 1, 1));
    group.add(this.mesh);
  }
  /** One more: at (x, y, z), going (vx, vy, vz), for `life` s, of colour `col`, `size` m; `fall`: how much gravity pulls it (1: fully); `flat`: a scrap of paper that turns as it falls. */
  add(x, y, z, vx, vy, vz, life, col, size, fall = 1, flat = 0) {
    const i = this.next; this.next = (i + 1) % this.n;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z; this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.fall[i] = fall; this.flat[i] = flat; this.spin[i] = Math.random() * TAU;
    this.mesh.setColorAt(i, _c.setRGB(col[0], col[1], col[2]));
    this.mesh.count = Math.max(this.mesh.count, i + 1);
  }
  update(dt, floor) {
    const m = this.mesh;
    for (let i = 0; i < m.count; i++) {
      if (this.life[i] <= 0) { m.setMatrixAt(i, _zero); continue; }
      const l = (this.life[i] -= dt), k = i * 3, flat = this.flat[i];
      this.v[k + 1] -= 9.8 * this.fall[i] * dt;
      const drag = flat ? 2.5 : 0.6; this.v[k] *= 1 - drag * dt; this.v[k + 2] *= 1 - drag * dt; if (flat) this.v[k + 1] = Math.max(this.v[k + 1], -0.7);
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      if (this.p[k + 1] < floor) { this.p[k + 1] = floor; this.v[k + 1] *= -0.3; if (flat) { this.v[k] = 0; this.v[k + 2] = 0; } }
      const f = flat ? 1 : Math.max(0, l / this.max[i]), sz = this.size[i] * (flat ? 1 : 0.4 + 0.6 * f);
      this.spin[i] += dt * (flat ? 6 : 0);
      _p.set(this.p[k], this.p[k + 1], this.p[k + 2]);
      _q.setFromEuler(_e.set(flat ? this.spin[i] : 0, this.spin[i] * 0.7, 0));
      _s.set(sz, flat ? sz * 0.08 : sz, flat ? sz * 0.6 : sz);
      m.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.mesh.count = 0; }
}

/** Skid marks: dark strokes on the tarmac where the tyres slid, which stay a while and then wear away. */
class Skids {
  constructor(group, n) {
    this.n = n; this.age = new Float32Array(n).fill(99); this.next = 0; this.last = [];
    const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.012, 0.012, 0.016), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), n);
    this.mesh.name = 'cars-skids'; this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.count = 0;
    this.mat = []; for (let i = 0; i < n; i++) this.mat.push(new THREE.Matrix4());
    group.add(this.mesh);
  }
  /** Tyre `w` has got to (x, y, z): if it slides, a stroke from where it was. */
  mark(w, x, y, z, slides) {
    const was = this.last[w];
    if (!slides) { this.last[w] = null; return; }
    if (!was) { this.last[w] = [x, z]; return; }
    const dx = x - was[0], dz = z - was[1], d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    if (d < 0.4) {
      const i = this.next; this.next = (i + 1) % this.n; this.age[i] = 0;
      _p.set((x + was[0]) / 2, y, (z + was[1]) / 2); _q.setFromAxisAngle(UP, Math.atan2(dx, dz)); _s.set(0.06, 1, d + 0.01);
      this.mat[i].compose(_p, _q, _s); this.mesh.count = Math.max(this.mesh.count, i + 1);
    }
    this.last[w] = [x, z];
  }
  update(dt) {
    const m = this.mesh;
    for (let i = 0; i < m.count; i++) {
      const a = (this.age[i] += dt), wear = a < 7 ? 1 : a < 9 ? 1 - (a - 7) / 2 : 0;
      if (!wear) { m.setMatrixAt(i, _zero); continue; }
      _m.copy(this.mat[i]); if (wear < 1) { _m.decompose(_p, _q, _s); _s.x *= wear; _m.compose(_p, _q, _s); }
      m.setMatrixAt(i, _m);
    }
    m.instanceMatrix.needsUpdate = true;
  }
  clear() { this.age.fill(99); this.mesh.count = 0; this.last = []; }
}
/** What marks one's own car: a ring on the table round it and an arrow ahead of it, flat, bright. */
function markGeometry() {
  const b = new MeshBuilder(), c = [2.6, 2.6, 2.0, 1], r0 = 0.36, r1 = 0.43, y = 0.012, n = 24;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU;
    face(b, V(Math.sin(a0) * r1, y, Math.cos(a0) * r1), V(Math.sin(a1) * r1, y, Math.cos(a1) * r1), V(Math.sin(a1) * r0, y, Math.cos(a1) * r0), V(Math.sin(a0) * r0, y, Math.cos(a0) * r0), c);
  }
  b.tri(V(0, y, 0.82), V(0.13, y, 0.6), V(-0.13, y, 0.6), { color: c });
  return b.build();
}

export class Cars {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'cars';
    this.session = null;
    this.best = 0;
    this.top = 0; // how high the table stands: its mat
    this._lv = [0, 0, 0, 0]; // the sparks each car had when its slide let go: the colour of its flame
  }

  build() {
    const world = this.world, mats = world.materials, at = C.at, parts = new Parts();
    const matte = parts.get('matte'), paint = parts.get('paint'), wood = parts.get('woodDark');
    // ---- the table: level over a meadow that is not quite
    const x0 = at.x - C.half.x, x1 = at.x + C.half.x, z0 = at.z - C.half.z, z1 = at.z + C.half.z;
    let lo = 99, hi = -99;
    for (let x = x0; x <= x1; x += 0.5) for (let z = z0; z <= z1; z += 0.5) { const h = this.data.heightAt(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    const top = (this.top = hi + C.rise), ty = top + TOP, bottom = lo - 0.5;
    this.tarmac = ty;
    const rim = 0.28;
    wood.tint(0.5, 0.34, 0.2, 1).box(x0, bottom, z0, x1, top - 0.02, z1);
    wood.tint(0.62, 0.43, 0.26, 1).box(x0, top - 0.02, z0, x1, top + 0.07, z0 + rim).box(x0, top - 0.02, z1 - rim, x1, top + 0.07, z1).box(x0, top - 0.02, z0 + rim, x0 + rim, top + 0.07, z1 - rim).box(x1 - rim, top - 0.02, z0 + rim, x1, top + 0.07, z1 - rim);
    // (the infield: bright grass, mown in stripes)
    const bands = 12, bw = (x1 - x0 - 2 * rim) / bands;
    for (let i = 0; i < bands; i++) matte.tint(...GRASS[i % 2], 1).box(x0 + rim + i * bw, top - 0.02, z0 + rim, x0 + rim + (i + 1) * bw, top, z1 - rim);
    const glow = new MeshBuilder(); // (what shines by itself: the pad, the lamps of the jets)
    // ---- helpers: a place on the lap (sample k, l to its left, height y) and flat or standing strips along it
    const P = (k, l, y) => { k = ((k % M) + M) % M; return V(at.x + T.x[k] + T.nx[k] * l, y, at.z + T.z[k] + T.nz[k] * l); };
    /** A flat strip from sample k to k + n, between l0 and l1, at height y; `tone(j)` colours its j-th piece, each `step` samples long. */
    const strip = (b, k, n, l0, l1, y, tone, step = 2) => { for (let j = 0, i = 0; j < n; j += step, i++) { const e = Math.min(n, j + step); face(b, P(k + j, l0, y), P(k + e, l0, y), P(k + e, l1, y), P(k + j, l1, y), tone(i)); } };
    const flat = (c) => () => c;
    // ---- the tarmac, a shade or two different from stretch to stretch
    strip(matte, 0, M, -C.road, C.road, ty, (i) => { const s = 1 + 0.12 * (((i * 7) % 5) / 4 - 0.5); return [TARMAC[0] * s, TARMAC[1] * s, TARMAC[2] * s, 1]; });
    // (the dashed line down the middle)
    strip(paint, 0, M, -0.02, 0.02, ty + 0.008, (i) => (i % 4 < 2 ? [0.9, 0.9, 0.8, 1] : [0.2, 0.2, 0.22, 1]), 2);
    // ---- the kerbs, red and white, between the tarmac and the boards
    for (const side of [-1, 1]) strip(paint, 0, M, side > 0 ? C.road : -C.wall, side > 0 ? C.wall : -C.road, ty + 0.006, (i) => (i % 4 < 2 ? RED : CREAM), 2);
    // ---- the boards: a wall of tyres painted in bright colours, a few at a time — its top and both faces
    const wallH = 0.2;
    const tone = (i) => { const c = TYRES[Math.floor(i / 3) % TYRES.length], k = i % 3 === 1 ? 0.8 : 1; return [c[0] * k, c[1] * k, c[2] * k, 1]; };
    for (const side of [-1, 1]) {
      const a = side * C.wall, d = side * (C.wall + 0.3);
      for (let j = 0, i = 0; j < M; j += 2, i++) {
        const c = tone(i);
        face(paint, P(j, a, ty + wallH), P(j + 2, a, ty + wallH), P(j + 2, d, ty + wallH), P(j, d, ty + wallH), c); // top
        // (the face on the track side, and the one away from it)
        for (const [l, dir] of [[a, -side], [d, side]]) {
          const nx = P(j, l + dir, 0), want = V(nx.x - P(j, l, 0).x, 0, nx.z - P(j, l, 0).z);
          face(paint, P(j, l, ty), P(j + 2, l, ty), P(j + 2, l, ty + wallH), P(j, l, ty + wallH), l === a ? c : [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, 1], want);
        }
      }
    }
    // ---- the start line, a chequered strip across the tarmac, the four places of the grid behind it
    for (let r = 0; r < 2; r++) for (let i = 0; i < 12; i++) {
      const l0 = -C.road + (i * 2 * C.road) / 12, l1 = l0 + (2 * C.road) / 12;
      face(paint, P(r * 2 - 2, l0, ty + 0.01), P(r * 2, l0, ty + 0.01), P(r * 2, l1, ty + 0.01), P(r * 2 - 2, l1, ty + 0.01), (i + r) % 2 ? [0.08, 0.08, 0.09, 1] : [1.6, 1.6, 1.5, 1]);
    }
    for (let slot = 0; slot < 4; slot++) {
      const k = -Math.round((0.9 + 0.9 * slot + 0.3) / DS), l = slot % 2 ? -0.5 : 0.5;
      face(paint, P(k, l - 0.17, ty + 0.01), P(k + 1, l - 0.17, ty + 0.01), P(k + 1, l + 0.17, ty + 0.01), P(k, l + 0.17, ty + 0.01), [1.5, 1.5, 1.4, 1]);
    }
    // ---- the pad: it glows green and yellow, with dark arrows the way one goes
    strip(glow, PAD.k0, PAD.n, PAD.l0, PAD.l1, ty + 0.012, (i) => (i % 2 ? [0.4, 2.6, 0.3, 1] : [2.6, 2.4, 0.2, 1]), 1);
    for (let a = 0; a < 2; a++) {
      const k = PAD.k0 + a * 3, m = (PAD.l0 + PAD.l1) / 2, y = ty + 0.018, ink = [0.14, 0.1, 0.02, 1];
      for (const s of [-1, 1]) face(paint, P(k, m + s * 0.3, y), P(k + 1, m + s * 0.3, y), P(k + 3, m, y), P(k + 2, m, y), ink);
    }
    // ---- the sand on the outside of the sweep, with a few darker grains; the oil, black with a rainbow in it
    strip(paint, SAND.k0, SAND.n, SAND.l0, SAND.l1, ty + 0.012, (i) => (i % 3 ? [1.55, 1.25, 0.72, 1] : [1.4, 1.1, 0.62, 1]), 2);
    for (let i = 0; i < 9; i++) { const k = SAND.k0 + 2 + i * 3, l = SAND.l0 + 0.1 + ((i * 5) % 7) * 0.08; face(paint, P(k, l, ty + 0.018), P(k + 1, l, ty + 0.018), P(k + 1, l + 0.05, ty + 0.018), P(k, l + 0.05, ty + 0.018), [1.0, 0.76, 0.42, 1]); }
    strip(paint, OIL.k0, OIL.n, OIL.l0, OIL.l1, ty + 0.012, flat([0.05, 0.04, 0.07, 1]), 1);
    for (let i = 0; i < 4; i++) { const k = OIL.k0 + i, l = OIL.l0 + 0.15 + i * 0.17; face(paint, P(k, l, ty + 0.018), P(k + 1, l, ty + 0.018), P(k + 1, l + 0.12, ty + 0.018), P(k, l + 0.12, ty + 0.018), [[0.5, 0.15, 0.9, 1], [0.1, 0.5, 0.7, 1], [0.8, 0.3, 0.5, 1], [0.2, 0.6, 0.3, 1]][i]); }
    // ---- the ramp: rises the way one goes and ends in the air; orange, with white bars
    {
      const hgt = (j) => (j / RAMP.n) * C.ramp.high, y = ty + 0.01;
      for (let j = 0; j < RAMP.n; j++) face(paint, P(RAMP.k0 + j, RAMP.l0, y + hgt(j)), P(RAMP.k0 + j + 1, RAMP.l0, y + hgt(j + 1)), P(RAMP.k0 + j + 1, RAMP.l1, y + hgt(j + 1)), P(RAMP.k0 + j, RAMP.l1, y + hgt(j)), j % 2 ? [1.25, 0.28, 0.03, 1] : [1.6, 1.6, 1.55, 1]);
      const e = RAMP.k0 + RAMP.n;
      face(paint, P(e, RAMP.l0, y), P(e, RAMP.l1, y), P(e, RAMP.l1, y + C.ramp.high), P(e, RAMP.l0, y + C.ramp.high), [0.7, 0.14, 0.02, 1], V(T.tx[e % M], 0, T.tz[e % M]));
      for (const l of [RAMP.l0, RAMP.l1]) { const out = V(T.nx[e % M] * Math.sign(l), 0, T.nz[e % M] * Math.sign(l)); face(paint, P(RAMP.k0, l, y), P(e, l, y), P(e, l, y + C.ramp.high), P(RAMP.k0, l, y), [0.9, 0.2, 0.03, 1], out); }
    }
    // ---- cones and a few stacks of tyres on the table, on the inside of the bends
    const cone = (x, z, tint) => {
      paint.tint(...tint, 1).place(x, top, z).lathe([[0.001, 0.2], [0.03, 0.15], [0.07, 0.02], [0.1, 0], [0.1, -0.02]], 8).pop();
      paint.tint(1.6, 1.6, 1.5, 1).place(x, top, z).lathe([[0.034, 0.12], [0.05, 0.085], [0.054, 0.07], [0.036, 0.1]], 8).pop();
    };
    let last = -999;
    for (let k = 0; k < M; k += 2) {
      const c = T.curve[k], r = c ? 1 / Math.abs(c) : 0;
      if (!c || k - last < 26 || (k % 9 !== 0 && r > 2.5)) continue;
      last = k;
      const p = P(k, Math.sign(c) * (C.wall + 0.55), top); cone(p.x, p.z, [1.8, 0.55, 0.08]);
      const q = P(k + 4, Math.sign(c) * (C.wall + 0.5), top); cone(q.x, q.z, [1.8, 0.55, 0.08]);
    }
    // ---- the jets of fire: a black-and-yellow box on the boards of each, its lamp glowing — the flame is drawn as it burns
    this.jets = JETS.map((J) => {
      const k = J.k0 + Math.round(J.n / 2), side = J.side, foot = P(k, side * (C.wall + 0.15), ty + 0.12);
      paint.tint(2.3, 1.9, 0.1, 1).box(foot.x - 0.17, ty, foot.z - 0.17, foot.x + 0.17, ty + wallH + 0.05, foot.z + 0.17);
      paint.tint(0.06, 0.06, 0.07, 1).box(foot.x - 0.12, ty + wallH + 0.05, foot.z - 0.12, foot.x + 0.12, ty + wallH + 0.09, foot.z + 0.12);
      face(glow, P(k - 3, side * (C.wall + 0.02), ty + wallH + 0.005), P(k + 3, side * (C.wall + 0.02), ty + wallH + 0.005), P(k + 3, side * (C.wall + 0.1), ty + wallH + 0.005), P(k - 3, side * (C.wall + 0.1), ty + wallH + 0.005), [2.6, 0.5, 0.05, 1]);
      return { k, side, x: foot.x, y: ty + 0.12, z: foot.z, nx: -T.nx[k % M] * side, nz: -T.nz[k % M] * side, tx: T.tx[k % M], tz: T.tz[k % M] };
    });
    // ---- bunting all round the table: little flags, every colour, over its rim
    {
      const y = top + 0.12, edge = [[x0 + 0.14, z0 + 0.14, x1 - 0.14, z0 + 0.14], [x1 - 0.14, z0 + 0.14, x1 - 0.14, z1 - 0.14], [x1 - 0.14, z1 - 0.14, x0 + 0.14, z1 - 0.14], [x0 + 0.14, z1 - 0.14, x0 + 0.14, z0 + 0.14]];
      let n = 0;
      for (const [ax, az, bx, bz] of edge) {
        const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, ox = uz, oz = -ux, cnt = Math.floor(len / 0.32);
        paint.tint(0.95, 0.95, 0.9, 1).beam(V(ax, y + 0.01, az), V(bx, y + 0.01, bz), 0.015, 0.015);
        for (let i = 0; i < cnt; i++, n++) {
          const t = (i + 0.5) * (len / cnt), cx = ax + ux * t, cz = az + uz * t, c = FLAGS[n % FLAGS.length];
          face(paint, V(cx - ux * 0.11, y, cz - uz * 0.11), V(cx + ux * 0.11, y, cz + uz * 0.11), V(cx + ox * 0.2, y - 0.02, cz + oz * 0.2), V(cx + ox * 0.2, y - 0.02, cz + oz * 0.2), [...c, 1]);
        }
      }
    }
    // ---- the stand against the table: its boards, steps, and a rail round it
    const sd = C.stand, sx = at.x, sz = sd.z, deck = this.data.heightAt(sx, sz) + sd.up;
    this.deck = deck;
    wood.tint(0.55, 0.37, 0.22, 1).box(sx - sd.w / 2, lo - 0.5, sz - sd.d / 2, sx + sd.w / 2, deck - 0.05, sz + sd.d / 2);
    wood.tint(0.7, 0.5, 0.3, 1).box(sx - sd.w / 2 - 0.05, deck - 0.05, sz - sd.d / 2, sx + sd.w / 2 + 0.05, deck, sz + sd.d / 2 + 0.05);
    wood.tint(0.62, 0.44, 0.27, 1).box(sx - 0.6, deck - 0.3, sz + sd.d / 2 + 0.05, sx + 0.6, deck - 0.22, sz + sd.d / 2 + 0.5);
    for (const s of [-1, 1]) wood.tint(0.5, 0.34, 0.2, 1).cylinder(sx + s * (sd.w / 2 - 0.04), deck, sz + sd.d / 2 - 0.04, 0.04, 0.04, 0.8, 6);
    wood.tint(0.5, 0.34, 0.2, 1).box(sx - sd.w / 2 + 0.04, deck + 0.7, sz + sd.d / 2 - 0.07, sx + sd.w / 2 - 0.04, deck + 0.78, sz + sd.d / 2 - 0.02);
    // ---- the arch on the grass, where one asks
    const g = C.gate, gy = this.data.heightAt(g.x, g.z);
    this.gate = { x: g.x, y: gy, z: g.z, yaw: g.yaw };
    gateArch(this.group, paint, g.x, gy, g.z, g.yaw, C.name.toUpperCase(), 'THREE LAPS · THREE RIVALS · THE FASTEST TIME', { tone: [1.5, 0.3, 0.12], ink: '#10222a' });
    this.group.add(parts.toMeshes(mats, { name: 'cars-table', layers: [LAYER.STATIC_CASTER] }));
    const lit = new THREE.Mesh(glow.build(), glowMat());
    lit.name = 'cars-glow'; this.group.add(lit);
    // ---- the hoop of fire over the lip of the ramp: an arch from board to board, which flickers and spits flames
    {
      const e = (RAMP.k0 + RAMP.n + Math.round(0.5 / DS)) % M, R = C.road + 0.12;
      this.hoop = new THREE.Group(); this.hoop.name = 'cars-hoop';
      const outer = new THREE.Mesh(new THREE.TorusGeometry(R, 0.12, 6, 36, Math.PI), glowMat(new THREE.Color(2.8, 0.75, 0.05)));
      const inner = new THREE.Mesh(new THREE.TorusGeometry(R, 0.06, 5, 36, Math.PI), glowMat(new THREE.Color(3, 2.4, 0.5)));
      inner.position.z = 0.02; this.hoop.add(outer, inner);
      this.hoop.position.set(at.x + T.x[e], ty, at.z + T.z[e]); this.hoop.rotation.y = Math.atan2(T.tx[e], T.tz[e]);
      this.hoopR = R; this.group.add(this.hoop);
      for (const s of [-1, 1]) { const p = P(e, s * (R + 0.02), top); wood.tint(0.15, 0.15, 0.17, 1).cylinder(p.x, top, p.z, 0.06, 0.06, ty - top + 0.08, 8); }
    }
    // ---- what moves: the four cars (one mesh), their flames, the mark on one's own; sparks and confetti; skid marks; the jets' flames
    const carMat = surfaceMaterial({ name: 'toy-cars', rough: 0.25, spec: 0.7 }), markMat = surfaceMaterial({ name: 'toy-mark', rough: 0.9, spec: 0, emissive: [0.45, 0.45, 0.3] });
    const ball = new THREE.Sphere(V(at.x, top, at.z), 16);
    this.cars = new THREE.InstancedMesh(carGeometry(), carMat, 4);
    this.flames = new THREE.InstancedMesh(flameGeometry(), glowMat(), 4);
    this.tongues = new THREE.InstancedMesh(tongueGeometry(), glowMat(new THREE.Color(1, 1, 1)), JETS.length * 2);
    for (const m of [this.cars, this.flames, this.tongues]) { m.boundingSphere = ball; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; this.group.add(m); }
    this.cars.name = 'cars-toys'; this.flames.name = 'cars-flames'; this.tongues.name = 'cars-jets';
    PAINT.forEach((c, i) => this.cars.setColorAt(i, new THREE.Color(c[0], c[1], c[2])));
    for (let i = 0; i < 4; i++) this.flames.setColorAt(i, new THREE.Color(1, 1, 1));
    for (let i = 0; i < JETS.length * 2; i++) this.tongues.setColorAt(i, new THREE.Color(1, 1, 1));
    this.bits = new Bits(this.group, 700);
    this.skids = new Skids(this.group, 1400);
    this.mark = new THREE.Mesh(markGeometry(), markMat);
    this.mark.name = 'cars-mark'; this.mark.visible = false; this.mark.frustumCulled = false;
    this.group.add(this.mark);
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    return this;
  }

  setBest(ms) { this.best = ms || 0; }
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.5 * 2.5; }

  /**
   * A race is asked for: the player is put on the stand, and it begins at the count of three. `io`: { play, note,
   * splash }. Returns the session — the driver of the player (see src/extras/plug.js).
   */
  open(player, io) {
    const seed = (Math.floor(worldClock() / 97) % 99991) + 1, st = startRace(seed), events = [], input = { x: 0, y: 0, jump: false };
    const S = { count: 3, last: 4, acc: 0, after: 0, place: 4, since: 0, lit: false, cam: null, stand: V(C.at.x, this.deck, C.stand.z + 0.1) };
    this.bits.clear(); this.skids.clear();
    const session = {
      cars: this, over: false, ended: false, score: 0, line: '', riding: false, anim: ANIM.idle, state: st, auto: false, seed,
      step: (dt, pl, control) => {
        const inp = pl.input;
        if (S.count > 0) {
          S.count -= Math.min(dt, 0.25);
          if (Math.ceil(S.count) !== S.last && S.count > 0) { S.last = Math.ceil(S.count); io.play('tick'); }
          if (S.count <= 0) { io.play('start'); io.play('boost', { volume: 0.4 }); io.note('Go!', 900); } // (the horn, and the cars' engines)
        } else if (session.auto) {
          S.acc += Math.min(dt, 0.25);
          while (S.acc >= STEP && !st.out) { S.acc -= STEP; botInput(st, input); stepRace(st, STEP, input, events); }
        } else if (!st.out) {
          input.x = control ? inp.move.x : 0; input.y = control ? inp.move.y : 0; input.jump = control && !!inp.jump;
          stepRace(st, dt, input, events);
        }
        for (const e of events) this._tell(e, st, io);
        events.length = 0;
        if (!S.lit && st.clock >= F.from && !st.over) { S.lit = true; io.note('The fire jets are lit!', 1500); io.play('boost', { volume: 0.3 }); }
        // (the place one holds: told when it has held for a moment, not at every touch of wheels)
        const place = placeOf(st, 0);
        if (S.count <= 0 && !st.over) {
          if (place !== S.place) { S.place = place; S.since = 0; } else if (S.since >= 0 && (S.since += dt) > 0.5 && st.clock > 2 && place !== S.told) { if (S.told) { io.play(place < S.told ? 'checkpoint' : 'tick', { volume: 0.4 }); io.note(place < S.told ? `${ORD[place - 1]} place!` : `Down to ${ORD[place - 1]}.`, 1400); } S.told = place; }
        }
        pl.pos.set(S.stand.x, S.stand.y, S.stand.z); pl.vel?.set(0, 0, 0); pl.yaw = Math.PI; pl.pitch = 0; pl.roll = 0; pl.speed = 0; pl.grounded = true;
        session.anim = ANIM.idle;
        if (st.over) {
          S.after += dt;
          if (!session.over) { session.over = true; session.score = st.time; }
          if (S.after > 4) session.ended = true;
        }
        const you = st.cars[0], now = Math.round(st.clock * 1000);
        session.line = S.count > 0 ? `${C.name} · ${Math.max(1, Math.ceil(S.count))}…`
          : st.out ? `${C.name} · time is up`
            : you.done ? `finished ${ORD[you.rank - 1]} · ${formatTime(you.time)}`
              : `lap ${lapOf(you)} of ${C.laps} · ${ORD[place - 1]} · ${formatTime(now)}`;
      },
      /** The camera: high over the middle of the table, looking straight down, the picture turned so that the long way of the table runs along the screen. */
      camera: (cam, dt) => {
        S.cam = cam;
        const portrait = cam.aspect < 1;
        st.view = portrait ? Math.PI / 2 : Math.PI; // ("up" on the screen: east for a phone held upright, north otherwise)
        const t = Math.tan((FOV * Math.PI) / 360), across = portrait ? C.half.x : C.half.z, wide = portrait ? C.half.z : C.half.x;
        const dist = Math.max((across + 0.3) / t, (wide + 0.3) / (t * cam.aspect));
        cam.position.set(C.at.x, this.top + dist, C.at.z);
        cam.up.set(Math.sin(st.view), 0, Math.cos(st.view));
        cam.lookAt(C.at.x, this.top, C.at.z);
        return FOV;
      },
      /** The race is over (or left): the player is put back on the grass, before the arch. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x, this.gate.z, this.gate.yaw); session.close(); },
      /** … and the game is put away: the cars, what flies, the marks — and the camera stood upright again (the view from above turned it). */
      close: () => {
        if (S.cam) { S.cam.up.set(0, 1, 0); S.cam.updateMatrixWorld(); S.cam = null; }
        if (this.session === session) { this.session = null; this._draw(null); this.bits.clear(); this.skids.clear(); }
      },
    };
    this.session = session;
    session.step(0, player, false);
    return session;
  }

  _tell(e, st, io) {
    const mine = e.car === 0, c = st.cars[e.car ?? 0];
    if (e.type === 'lap' && mine) { io.play('lap'); io.note(e.lap === C.laps ? 'Last lap!' : `Lap ${e.lap} of ${C.laps}`, 1600); }
    else if (e.type === 'finish' && mine) { io.play(e.place === 1 ? 'victory' : 'bell'); io.note(`${ORD[e.place - 1]} place · ${formatTime(e.time)}`, 4200); this._confetti(c, e.place === 1 ? 260 : 120); }
    else if (e.type === 'boost' && mine) io.play('boost', { volume: 0.5 });
    else if (e.type === 'turbo' && mine) io.play('boost', { volume: 0.3 + 0.12 * e.level });
    else if (e.type === 'spark' && mine && e.level > 1) io.play('tick', { volume: 0.25 + 0.1 * e.level });
    else if (e.type === 'pad' && mine) io.play('boost', { volume: 0.35 });
    else if (e.type === 'wall' && mine) io.play('hit', { volume: clamp(e.speed / 6, 0.2, 0.6) });
    else if (e.type === 'bump' && (mine || e.with === 0)) io.play('hit', { volume: clamp(e.speed / 5, 0.2, 0.5) });
    else if (e.type === 'drift' && mine) io.play('drift', { volume: 0.3 });
    else if (e.type === 'oil' && mine) { io.play('drift', { volume: 0.5 }); io.note('Oil!', 1000); }
    else if (e.type === 'fire' && mine) { io.play('hit', { volume: 0.5 }); io.note('Scorched!', 1000); }
    else if (e.type === 'jump' && mine) io.play('jump', { volume: 0.5 });
    else if (e.type === 'land' && mine) io.play('land', { volume: 0.6 });
    else if (e.type === 'wrong' && mine) io.note('Wrong way! Turn round.', 2200);
    else if (e.type === 'out') io.note('Time is up: the race is called off.', 3500);
    // what is seen of it, for every car
    const at = C.at, y = this.tarmac;
    if (e.type === 'bump') { const o = st.cars[e.with], x = at.x + (c.x + o.x) / 2, z = at.z + (c.z + o.z) / 2; for (let n = 0; n < 10; n++) this.bits.add(x, y + 0.08, z, (Math.random() - 0.5) * 3, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 3, 0.35, SPARK[1 + (n % 2)], 0.035); }
    else if (e.type === 'wall' && e.speed > 2) for (let n = 0; n < 6; n++) this.bits.add(at.x + c.x, y + 0.08, at.z + c.z, (Math.random() - 0.5) * 2.5, 1 + Math.random(), (Math.random() - 0.5) * 2.5, 0.3, SPARK[1], 0.03);
    else if (e.type === 'fire') for (let n = 0; n < 14; n++) this.bits.add(at.x + c.x, y + 0.1, at.z + c.z, (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6, 0.9, [0.05, 0.05, 0.05], 0.09, -0.05);
    else if (e.type === 'turbo') for (let n = 0; n < 8 + 6 * e.level; n++) { const a = c.yaw + Math.PI + (Math.random() - 0.5) * 0.8, v = 1.5 + Math.random() * 2; this.bits.add(at.x + c.x - Math.sin(c.yaw) * 0.3, y + 0.08, at.z + c.z - Math.cos(c.yaw) * 0.3, Math.sin(a) * v, 0.5 + Math.random(), Math.cos(a) * v, 0.4, FLAME[e.level], 0.05, 0.4); }
  }

  /** Confetti over one's car (and the line) at the end of the race. */
  _confetti(c, n) {
    const at = C.at, y = this.tarmac;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = 0.8 + Math.random() * 2.2, col = [...FLAGS, ...PAINT][i % (FLAGS.length + PAINT.length)];
      this.bits.add(at.x + c.x + (Math.random() - 0.5) * 0.6, y + 0.3, at.z + c.z + (Math.random() - 0.5) * 0.6, Math.cos(a) * v, 3 + Math.random() * 3, Math.sin(a) * v, 4 + Math.random() * 2, col, 0.09, 1, 1);
    }
  }

  /** Puts the cars where the race has them (`st`), or away (null); and what goes with them — flames, sparks, marks, the jets. */
  _draw(st, dt = 0) {
    const n = st ? st.cars.length : 0;
    this.cars.count = n; this.flames.count = 0; this.tongues.count = 0;
    this.mark.visible = !!st;
    if (!st) return;
    const at = C.at, y0 = this.tarmac, m = _m, q = _q, p = _p, e = _e, wob = worldClock() / 1000;
    let f = 0;
    for (let i = 0; i < n; i++) {
      const c = st.cars[i], speed = Math.hypot(c.vx, c.vz);
      // (nose up on the ramp, along the way it flies in the air; leaning a little into a slide)
      const pitch = c.air ? Math.atan2(c.vy, Math.max(speed, 1)) : c.climb > 0.05 ? Math.atan2(C.ramp.high, C.ramp.length) : 0;
      p.set(at.x + c.x, y0 + c.y, at.z + c.z);
      q.setFromEuler(e.set(-pitch, c.yaw, clamp(c.slip * 0.03, -0.12, 0.12) * (c.drift ? 1 : 0), 'YXZ'));
      m.compose(p, q, _s.setScalar(BIG));
      this.cars.setMatrixAt(i, m);
      // (blackened by a jet for a moment: its paint comes back as the soot wears off)
      const soot = clamp(c.scorch / F.time, 0, 1) * 0.92, col = PAINT[i];
      this.cars.setColorAt(i, _c.setRGB(col[0] * (1 - soot) + 0.05 * soot, col[1] * (1 - soot) + 0.04 * soot, col[2] * (1 - soot) + 0.04 * soot));
      // the flame out of the exhaust: the jump's, or the burst of a slide (its colour that of the sparks it was)
      if (c.boost > 0 || c.turbo > 0) {
        const lv = c.boost > 0 ? 0 : this._lv[i] || 1, len = (lv ? 0.8 + 0.35 * lv : 1.2) * (0.8 + 0.4 * Math.random());
        m.compose(p, q, _s.set(BIG * (lv === 3 ? 1.3 : 1), BIG, BIG * len));
        this.flames.setMatrixAt(f, m); this.flames.setColorAt(f, _c.setRGB(...FLAME[lv])); f++;
        if (dt && Math.random() < 0.6) { const bx = p.x - Math.sin(c.yaw) * 0.45, bz = p.z - Math.cos(c.yaw) * 0.45; this.bits.add(bx, p.y + 0.09, bz, -Math.sin(c.yaw) * 1.5 + (Math.random() - 0.5), 0.4, -Math.cos(c.yaw) * 1.5 + (Math.random() - 0.5), 0.25, FLAME[lv], 0.05, -0.1); }
      }
      if (c.level) this._lv[i] = c.level; else if (c.turbo <= 0) this._lv[i] = 0;
      // the rear tyres: sparks while it slides, the colour of its heat, and the marks they leave
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), lx = fz, lz = -fx;
      for (const s of [-1, 1]) {
        const wx = p.x + lx * s * 0.2 - fx * 0.2, wz = p.z + lz * s * 0.2 - fz * 0.2, slides = !c.air && (c.drift || c.slip > 1.2);
        if (dt) this.skids.mark(i * 2 + (s > 0 ? 1 : 0), wx, y0 + c.y + 0.006, wz, slides);
        if (dt && slides && Math.random() < 0.5 + 0.15 * c.level) {
          const col = SPARK[c.level], v = 0.6 + Math.random() * 1.2, a = Math.atan2(-c.vx, -c.vz) + (Math.random() - 0.5) * 1.2;
          this.bits.add(wx, y0 + c.y + 0.03, wz, Math.sin(a) * v + c.vx * 0.3, 0.5 + Math.random() * (c.level ? 1.6 : 0.4), Math.cos(a) * v + c.vz * 0.3, c.level ? 0.3 : 0.5, col, c.level ? 0.03 + 0.008 * c.level : 0.07, c.level ? 1 : -0.1);
        }
      }
      if (i === 0) { this.mark.position.set(p.x, p.y, p.z); this.mark.rotation.set(0, c.yaw, 0); this.mark.scale.setScalar(1.3 * (1 + 0.06 * Math.sin(worldClock() / 140))); }
    }
    this.flames.count = f;
    // the jets: a small blue pilot flame; glowing larger before a burst; a roaring tongue across their side while it burns
    let g = 0;
    for (let j = 0; j < this.jets.length; j++) {
      const J = this.jets[j], t = jetTime(st, j), on = t >= 0 && t < F.burst, warn = t >= F.every - F.warn;
      const reach = on ? (C.wall - 0.1) * (0.85 + 0.25 * Math.sin(wob * 40 + j) * Math.random()) : warn ? 0.35 : 0.12;
      for (const layer of [0, 1]) {
        _p.set(J.x, J.y + (layer ? 0.03 : 0), J.z); _q.setFromAxisAngle(UP, Math.atan2(J.nx, J.nz));
        m.compose(_p, _q, _s.set(on ? (layer ? 1.4 : 2.2) : 0.6, on ? (layer ? 1.2 : 2) : 0.6, reach * (layer ? 0.75 : 1)));
        this.tongues.setMatrixAt(g, m); this.tongues.setColorAt(g, _c.setRGB(...(on ? (layer ? [3, 2.6, 0.6] : [3, 0.9, 0.08]) : warn ? [3, 0.7, 0.05] : [0.4, 0.8, 3]))); g++;
      }
      if (on && dt) for (let k = 0; k < 3; k++) { const d = Math.random() * (C.wall - 0.25), w = (Math.random() - 0.5) * 0.6; this.bits.add(J.x + J.nx * d + J.tx * w, J.y + 0.05, J.z + J.nz * d + J.tz * w, J.nx * 1.2, 0.8 + Math.random() * 1.2, J.nz * 1.2, 0.45, Math.random() < 0.5 ? FLAME[0] : FLAME[2], 0.08, -0.15); }
    }
    this.tongues.count = g;
    for (const mesh of [this.cars, this.flames, this.tongues]) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  }

  /** Every frame: the cars as the race has them, what flies about, the marks wearing away, the hoop flickering. */
  update(dt = 0) {
    const d = clamp(dt || 0, 0, 0.05), st = this.session ? this.session.state : null, w = worldClock() / 1000;
    this._draw(st, d);
    this.bits.update(d, this.tarmac + 0.01); this.skids.update(d);
    if (this.hoop) {
      this.hoop.scale.setScalar(1 + 0.04 * Math.sin(w * 23) + 0.03 * Math.sin(w * 37));
      if (d && Math.random() < 0.7) { const a = Math.random() * Math.PI, R = this.hoopR; _p.set(Math.cos(a) * R, Math.sin(a) * R, 0).applyEuler(this.hoop.rotation).add(this.hoop.position); this.bits.add(_p.x, _p.y, _p.z, 0, 0.6 + Math.random() * 0.5, 0, 0.4, Math.random() < 0.5 ? FLAME[0] : FLAME[1], 0.07, -0.2); }
    }
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
void GATE;
