// Birds: swans, geese, ducks, cormorants and herons on the ponds, gulls over the cove, a flock over the valley
// and buzzards above the mountains. Every bird is an instance of ONE mesh (one draw call): the geometry holds all
// the species, and the vertex shader keeps the vertices of the species an instance asks for.
import * as THREE from 'three';
import { makeMaterial, GLSL_COMMON, GLSL_SHADOW, GLSL_LIGHTING } from '../../render/globals.js';
import { LAYER } from '../../render/Shadows.js';
import { PIER, pierToWorld } from '../layout/layout.js';

const VERT = /* glsl */ `
${GLSL_COMMON}
${GLSL_SHADOW}
${GLSL_LIGHTING}
in vec2 aAnim;  // x: position along a wing (0 = not a wing, 1 = tip), y: how much the vertex follows the head
in float aSpec; // species of the vertex
in vec4 iBird;  // species, phase, flap speed, flap amplitude
out vec3 vCol;
out vec3 vLight;
out float vFog;
out vec3 vFogCol;
void main() {
  if (abs(aSpec - iBird.x) > 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 p = position;
  float w = aAnim.x;
  if (w > 0.001) {
    // wings: beat about the body axis, the tip a little behind the root; gliders keep them slightly raised
    float a = iBird.w * sin(uTime * iBird.z + iBird.y - w * 0.9) + 0.1;
    p.y += abs(p.x) * sin(a);
    p.x *= cos(a);
  }
  p.z += sin(uTime * 2.4 + iBird.y) * 0.014 * aAnim.y; // the head nods with each stroke
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vec3 N = normalize(mat3(instanceMatrix) * normal);
  float ndl = dot(N, uSunDir);
  float lit = w > 0.001 ? abs(ndl) * 0.75 + 0.25 : max(ndl, 0.0); // feathers let the light through
  vLight = uSunColor * lit * sunShadow(wp.xyz, vec3(0.0, 1.0, 0.0)) + hemiAmbient(N) * 1.05;
  vCol = color * instanceColor;
  vec3 f0 = applyFog(vec3(0.0), wp.xyz, cameraPosition), f1 = applyFog(vec3(1.0), wp.xyz, cameraPosition);
  vFog = 1.0 - (f1.r - f0.r);
  vFogCol = f0 / max(vFog, 1e-3);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
in vec3 vCol;
in vec3 vLight;
in float vFog;
in vec3 vFogCol;
void main() {
  gl_FragColor = vec4(outputColor(mix(vCol * vLight, vFogCol, vFog)), 1.0);
}
`;

// ------------------------------------------------------------------------------------------------ modelling
// Birds are symmetric: bodies are tubes through rings given in the side view. A ring is
// [y, z, half width, half height, colour, head weight]; +z is forward, y = 0 is the waterline (or the ground).

const WHITE = [0.96, 0.95, 0.92], BLACK = [0.045, 0.045, 0.05], ORANGE = [0.9, 0.42, 0.08], YELLOW = [0.85, 0.66, 0.14];

class Model {
  constructor() { this.p = []; this.n = []; this.c = []; this.a = []; this.i = []; }
  get count() { return this.p.length / 3; }
  vert(x, y, z, nx, ny, nz, col, wing = 0, head = 0) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); this.a.push(wing, head);
    return this.count - 1;
  }
  tube(rings, sides = 6) {
    const first = this.count;
    rings.forEach((r, k) => {
      const prev = rings[Math.max(0, k - 1)], next = rings[Math.min(rings.length - 1, k + 1)];
      let ty = next[0] - prev[0], tz = next[1] - prev[1];
      const tl = Math.hypot(ty, tz) || 1; ty /= tl; tz /= tl;
      const uy = tz, uz = -ty; // "up" of the section, perpendicular to the path in the side view
      for (let j = 0; j < sides; j++) {
        const th = ((j + 0.5) / sides) * Math.PI * 2, cx = Math.cos(th), sy = Math.sin(th);
        this.vert(cx * r[2], r[0] + uy * sy * r[3], r[1] + uz * sy * r[3], cx, uy * sy, uz * sy, r[4], 0, r[5] || 0);
      }
    });
    for (let k = 0; k + 1 < rings.length; k++) for (let j = 0; j < sides; j++) {
      const a = first + k * sides + j, b = first + k * sides + ((j + 1) % sides), c = a + sides, d = b + sides;
      this.i.push(a, c, b, b, c, d);
    }
    for (const [k, dir] of [[0, -1], [rings.length - 1, 1]]) { // closed ends
      const r = rings[k], centre = this.vert(0, r[0], r[1], 0, 0, dir, r[4], 0, r[5] || 0);
      for (let j = 0; j < sides; j++) {
        const a = first + k * sides + j, b = first + k * sides + ((j + 1) % sides);
        if (dir < 0) this.i.push(centre, a, b); else this.i.push(centre, b, a);
      }
    }
    return this;
  }
  /** Flat feathers: a fan through points [x, y, z, colour, wing weight] (mirrored on both sides when `both`). */
  fan(points, both = true, normal = [0, 1, 0]) {
    for (const sgn of both ? [1, -1] : [1]) {
      const ids = points.map((q) => this.vert(q[0] * sgn, q[1], q[2], normal[0] * sgn, normal[1], normal[2], q[3], q[4] || 0));
      for (let k = 1; k + 1 < ids.length; k++) this.i.push(ids[0], ids[k], ids[k + 1]);
    }
    return this;
  }
  legs(x, top, z, colour, foot = 0.07) {
    for (const sgn of [1, -1]) {
      this.tube([[top, z, 0.012, 0.012, colour], [0, z, 0.012, 0.012, colour]].map((r) => r), 4);
      const n = this.count; // move the leg just made to its side
      for (let k = n - 10; k < n; k++) this.p[k * 3] += x * sgn;
      this.fan([[x * sgn, 0.005, z - 0.01, colour], [x * sgn + foot * 0.6, 0.005, z + foot, colour], [x * sgn - foot * 0.6, 0.005, z + foot, colour]], false);
    }
    return this;
  }
}

function buildModels() {
  const M = {};
  // --- mute swan
  M.swan = new Model().tube([
    [0.2, -0.52, 0.015, 0.015, WHITE], [0.16, -0.4, 0.12, 0.08, WHITE], [0.13, -0.2, 0.22, 0.16, WHITE], [0.12, 0.02, 0.25, 0.19, WHITE],
    [0.12, 0.22, 0.2, 0.16, WHITE], [0.16, 0.35, 0.12, 0.11, WHITE], [0.28, 0.42, 0.055, 0.055, WHITE, 0.2], [0.44, 0.43, 0.042, 0.042, WHITE, 0.5],
    [0.6, 0.38, 0.038, 0.038, WHITE, 0.8], [0.72, 0.4, 0.04, 0.04, WHITE, 1], [0.76, 0.48, 0.05, 0.045, WHITE, 1], [0.745, 0.56, 0.034, 0.03, BLACK, 1],
    [0.72, 0.66, 0.02, 0.012, ORANGE, 1],
  ], 7)
    // the wings, held a little raised over the back
    .fan([[0.1, 0.3, 0.2, WHITE], [0.24, 0.26, 0.0, WHITE], [0.2, 0.3, -0.3, WHITE], [0.06, 0.36, -0.4, WHITE], [0.03, 0.4, -0.1, WHITE]], true, [0.6, 0.8, 0]);
  // --- goose (black neck, white cheek)
  const GB = [0.42, 0.36, 0.29], GP = [0.74, 0.7, 0.62], GL = [0.2, 0.19, 0.18];
  M.goose = new Model().tube([
    [0.3, -0.36, 0.012, 0.012, BLACK], [0.27, -0.28, 0.08, 0.05, WHITE], [0.24, -0.14, 0.15, 0.11, GB], [0.23, 0.02, 0.17, 0.13, GB],
    [0.24, 0.16, 0.14, 0.12, GP], [0.28, 0.25, 0.08, 0.08, GP], [0.38, 0.29, 0.04, 0.04, BLACK, 0.3], [0.5, 0.29, 0.034, 0.034, BLACK, 0.7],
    [0.6, 0.3, 0.036, 0.036, WHITE, 1], [0.64, 0.35, 0.042, 0.038, BLACK, 1], [0.625, 0.42, 0.024, 0.016, BLACK, 1],
  ], 6).legs(0.07, 0.22, 0.0, GL);
  // --- mallard
  const DG = [0.6, 0.58, 0.54], DC = [0.38, 0.2, 0.13], DH = [0.05, 0.27, 0.14];
  M.duck = new Model().tube([
    [0.12, -0.27, 0.012, 0.012, BLACK], [0.09, -0.18, 0.08, 0.055, [0.3, 0.28, 0.26]], [0.075, -0.04, 0.12, 0.09, DG], [0.08, 0.09, 0.11, 0.09, DC],
    [0.12, 0.165, 0.07, 0.065, DC], [0.17, 0.19, 0.04, 0.04, WHITE, 0.4], [0.22, 0.2, 0.044, 0.044, DH, 0.8], [0.26, 0.23, 0.054, 0.048, DH, 1],
    [0.245, 0.3, 0.03, 0.016, YELLOW, 1], [0.24, 0.355, 0.022, 0.008, YELLOW, 1],
  ], 6);
  // --- cormorant, swimming low in the water
  const CD = [0.09, 0.1, 0.095];
  M.cormorant = new Model().tube([
    [0.03, -0.36, 0.012, 0.012, CD], [0.02, -0.2, 0.09, 0.05, CD], [0.02, 0.0, 0.12, 0.07, CD], [0.04, 0.16, 0.08, 0.07, CD],
    [0.13, 0.24, 0.04, 0.04, CD, 0.4], [0.26, 0.3, 0.032, 0.032, CD, 0.8], [0.34, 0.36, 0.036, 0.034, CD, 1], [0.345, 0.42, 0.022, 0.018, [0.8, 0.65, 0.3], 1],
    [0.335, 0.5, 0.012, 0.01, [0.4, 0.38, 0.32], 1],
  ], 6);
  // --- cormorant standing on the bank, wings held out to dry
  M.perched = new Model().tube([
    [0.1, -0.2, 0.012, 0.012, CD], [0.14, -0.06, 0.07, 0.06, CD], [0.3, 0.0, 0.11, 0.09, CD], [0.46, 0.05, 0.09, 0.08, CD],
    [0.58, 0.08, 0.04, 0.04, CD, 0.5], [0.7, 0.08, 0.032, 0.032, CD, 0.8], [0.77, 0.12, 0.036, 0.034, CD, 1], [0.775, 0.18, 0.022, 0.018, [0.8, 0.65, 0.3], 1],
    [0.765, 0.26, 0.012, 0.01, [0.4, 0.38, 0.32], 1],
  ], 6).legs(0.05, 0.14, -0.03, BLACK)
    .fan([[0.08, 0.5, 0.02, CD], [0.34, 0.6, -0.02, CD], [0.56, 0.5, -0.05, CD], [0.5, 0.26, -0.06, CD], [0.2, 0.2, -0.02, CD]], true, [0, 0, 1]);
  // --- grey heron
  const HG = [0.4, 0.45, 0.52], HP = [0.74, 0.76, 0.78], HL = [0.5, 0.46, 0.3];
  M.heron = new Model().tube([
    [0.4, -0.24, 0.012, 0.012, [0.3, 0.33, 0.37]], [0.45, -0.12, 0.07, 0.06, HG], [0.52, 0.03, 0.09, 0.085, HG], [0.6, 0.13, 0.06, 0.06, HP],
    [0.7, 0.17, 0.03, 0.03, HP, 0.3], [0.8, 0.12, 0.026, 0.026, HP, 0.6], [0.89, 0.13, 0.028, 0.028, HP, 0.9], [0.93, 0.19, 0.036, 0.032, WHITE, 1],
    [0.925, 0.26, 0.02, 0.016, YELLOW, 1], [0.915, 0.39, 0.006, 0.005, YELLOW, 1],
  ], 6).legs(0.04, 0.44, -0.02, HL, 0.09)
    .fan([[0, 0.97, 0.16, BLACK, 0], [0.012, 0.95, 0.1, BLACK, 0], [0, 0.93, -0.02, BLACK, 0]], true, [1, 0, 0]); // the black plume
  // --- flyers: a body and two wings that the shader beats. Points: [x, y, z, colour, position along the wing]
  const flyer = (len, girth, span, chord, body, upper, tip, tail = 0.5) => new Model().tube([
    [0, -len * 0.55, 0.004, 0.004, body], [0, -len * 0.2, girth * 0.7, girth * 0.6, body], [0, len * 0.12, girth, girth * 0.85, body],
    [0, len * 0.38, girth * 0.6, girth * 0.6, body], [0, len * 0.52, 0.004, 0.004, YELLOW],
  ], 5)
    .fan([[girth * 0.5, 0.01, chord * 0.5, upper, 0.02], [span * 0.5, 0.01, chord * 0.62, upper, 0.5], [span, 0.01, chord * 0.1, tip, 1],
      [span * 0.55, 0.01, -chord * 0.42, upper, 0.55], [girth * 0.5, 0.01, -chord * 0.5, upper, 0.02]])
    .fan([[0, 0.0, -len * 0.3, upper], [len * tail * 0.5, 0.0, -len * 0.75, upper], [0, 0.0, -len * 0.68, upper]]);
  M.gull = flyer(0.42, 0.055, 0.62, 0.2, WHITE, [0.72, 0.75, 0.78], BLACK);
  M.swift = flyer(0.15, 0.022, 0.2, 0.07, [0.1, 0.1, 0.13], [0.12, 0.12, 0.15], [0.1, 0.1, 0.12], 0.8);
  M.buzzard = flyer(0.5, 0.07, 0.62, 0.32, [0.36, 0.25, 0.17], [0.32, 0.22, 0.15], [0.14, 0.1, 0.08], 0.7);
  return M;
}

const SPECIES = ['swan', 'goose', 'duck', 'cormorant', 'perched', 'heron', 'gull', 'swift', 'buzzard'];
const FLOAT = { goose: -0.2 }; // models drawn standing on their legs sit this much lower when they swim

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------------- birds

export class Birds {
  /** @param {import('../World.js').World} world */
  constructor(world) {
    this.data = world.data;
    const few = world.engine.tier.particles < 0.6; // light tier: smaller flocks
    const rnd = (this.rnd = mulberry(4242));
    this.birds = [];
    this._water(rnd);
    this._sky(rnd, few);

    // geometry: every species, one after the other
    const models = buildModels();
    const pos = [], nrm = [], col = [], anim = [], spec = [], idx = [];
    SPECIES.forEach((name, s) => {
      const m = models[name], base = pos.length / 3;
      pos.push(...m.p); nrm.push(...m.n); col.push(...m.c); anim.push(...m.a);
      for (let k = 0; k < m.count; k++) spec.push(s);
      for (const i of m.i) idx.push(base + i);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aAnim', new THREE.Float32BufferAttribute(anim, 2));
    geo.setAttribute('aSpec', new THREE.Float32BufferAttribute(spec, 1));
    geo.setIndex(idx);
    const n = this.birds.length;
    this.info = new Float32Array(n * 4);
    geo.setAttribute('iBird', new THREE.InstancedBufferAttribute(this.info, 4));
    const mat = makeMaterial({ vertexShader: VERT, fragmentShader: FRAG, vertexColors: true, side: THREE.DoubleSide });
    mat.name = 'birds';
    const mesh = (this.mesh = new THREE.InstancedMesh(geo, mat, n));
    mesh.name = 'birds';
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (!world.engine.tier.phone) mesh.layers.enable(LAYER.REFLECT);
    const tint = new THREE.Color();
    this.birds.forEach((b, i) => {
      this.info.set([SPECIES.indexOf(b.species), b.phase, b.flap || 0, b.amp || 0], i * 4);
      mesh.setColorAt(i, tint.setRGB(...(b.tint || [1, 1, 1])));
    });
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
    this.update(0, 0, null);
  }

  // ---- water birds: where they can go, who lives where
  _water(rnd) {
    const d = this.data, ponds = {};
    for (const p of d.meta.ponds) {
      const xs = p.outline.map((q) => q[0]), zs = p.outline.map((q) => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      const open = [], shallow = [];
      for (let k = 0; k < 4000 && (open.length < 70 || shallow.length < 12); k++) {
        const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
        const w = d.waterAt(x, z);
        if (Math.abs(w - p.level) > 0.02) continue;
        const depth = w - d.heightAt(x, z), shore = (d.aux[d.index(x, z) * 4 + 1] / 255) * 16;
        if (depth > 0.4 && shore > 2.2 && open.length < 70) open.push([x, z]);
        else if (depth > 0.07 && depth < 0.2 && shallow.length < 12) shallow.push([x, z]);
      }
      ponds[p.id] = { level: p.level, open, shallow, outline: p.outline };
    }
    this.ponds = ponds;
    const swimmer = (species, pond, o = {}) => {
      const P = ponds[pond];
      if (!P || P.open.length < 4) return null;
      const [x, z] = o.leader ? [o.leader.x - 0.8, o.leader.z - 0.8] : P.open[(rnd() * P.open.length) | 0];
      const b = { kind: 'swim', species, pond: P, x, z, heading: rnd() * 6.28, cruise: 0.32, scale: 1, phase: rnd() * 6.28, wait: rnd() * 4, pitch: 0, ...o };
      this.birds.push(b);
      return b;
    };
    const family = (species, pond, young, o, youngTint, youngScale) => {
      const a = swimmer(species, pond, o);
      if (!a) return;
      swimmer(species, pond, { ...o, leader: a, gap: 1.1 * (o.scale || 1), side: 0.5 });
      for (let k = 0; k < young; k++) swimmer(species, pond, { leader: a, gap: 0.7 + k * 0.42, side: (k % 2 ? -1 : 1) * 0.22, scale: youngScale, tint: youngTint, cruise: 0.5 });
    };
    // the great pond: a pair of swans and their cygnets, geese, mallards, a cormorant that dives
    family('swan', 'big', 3, { cruise: 0.3 }, [0.62, 0.6, 0.58], 0.42);
    const lead = swimmer('goose', 'big', { cruise: 0.36 });
    if (lead) for (let k = 0; k < 3; k++) swimmer('goose', 'big', { leader: lead, gap: 0.9 + k * 0.8, side: (k % 2 ? -1 : 1) * 0.45, cruise: 0.5 });
    family('duck', 'big', 0, { cruise: 0.34, dabbles: true }, null, 1);
    swimmer('duck', 'big', { cruise: 0.3, dabbles: true, tint: [0.8, 0.64, 0.46] });
    swimmer('cormorant', 'big', { cruise: 0.55, dives: true, wait: 3 });
    // the mill pool and the iris pond: ducks, one family with ducklings
    swimmer('duck', 'tail', { cruise: 0.3, dabbles: true });
    swimmer('duck', 'tail', { cruise: 0.3, dabbles: true, tint: [0.8, 0.64, 0.46] });
    family('duck', 'bean', 4, { cruise: 0.3, tint: [0.8, 0.64, 0.46] }, [1.25, 1.1, 0.55], 0.4);
    swimmer('swan', 'bean', { cruise: 0.26 });
    // herons fishing in the shallows, facing the open water
    const stand = (species, P, o = {}) => {
      if (!P || !P.shallow.length) return;
      const [x, z] = P.shallow[(rnd() * P.shallow.length) | 0];
      const cx = P.open.reduce((s, q) => s + q[0], 0) / P.open.length, cz = P.open.reduce((s, q) => s + q[1], 0) / P.open.length;
      this.birds.push({ kind: 'stand', species, x, z, y: d.heightAt(x, z) - 0.02, heading: Math.atan2(cx - x, cz - z) + (rnd() - 0.5), scale: 1, phase: rnd() * 6.28, ...o });
    };
    stand('heron', ponds.big); stand('heron', ponds.big); stand('heron', ponds.bean);
    // on the banks: geese grazing, a cormorant drying its wings on the willow island
    const big = ponds.big;
    if (big) {
      const o = big.outline, at = (o.length * 0.19) | 0;
      for (let k = 0; k < 3; k++) {
        const q = o[(at + k * 2) % o.length], prev = o[(at + k * 2 - 1 + o.length) % o.length], next = o[(at + k * 2 + 1) % o.length];
        let nx = next[1] - prev[1], nz = -(next[0] - prev[0]);
        const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        for (const sgn of [1, -1]) { // whichever side is the bank
          const x = q[0] + nx * sgn * (2.2 + k * 0.5), z = q[1] + nz * sgn * (2.2 + k * 0.5);
          if (d.depthAt(x, z) > 0) continue;
          this.birds.push({ kind: 'stand', species: 'goose', x, z, y: d.heightAt(x, z) + 0.2, heading: rnd() * 6.28, scale: 1, phase: rnd() * 6.28, grazes: true });
          break;
        }
      }
      const isl = d.meta.ponds[0].islands.find((q) => q.id === 'willow');
      if (isl) {
        for (let a = 0; a < 6.28; a += 0.3) { // the first dry spot of its shore, going round
          const x = isl.x + Math.cos(a + 2.4) * isl.rx * 0.72, z = isl.z + Math.sin(a + 2.4) * isl.rz * 0.72;
          if (d.depthAt(x, z) > 0) continue;
          this.birds.push({ kind: 'stand', species: 'perched', x, z, y: d.heightAt(x, z), heading: a + 2.4 + Math.PI / 2, scale: 1, phase: 1 });
          break;
        }
      }
    }
  }

  // ---- birds in the sky follow closed curves: nothing to simulate
  _sky(rnd, few) {
    const [hx, hz] = pierToWorld(PIER.length * 0.7);
    for (let k = 0; k < (few ? 5 : 9); k++) {
      this.birds.push({ kind: 'circle', species: 'gull', cx: hx + (rnd() - 0.5) * 70, cz: hz + (rnd() - 0.5) * 90, r: 16 + rnd() * 38, y: 11 + rnd() * 26, speed: 7 + rnd() * 3, dir: rnd() < 0.5 ? 1 : -1, phase: rnd() * 6.28, flap: 5, amp: 0.28, scale: 1 });
    }
    for (let k = 0; k < 2; k++) {
      this.birds.push({ kind: 'circle', species: 'buzzard', cx: -150 + k * 170, cz: -150 + k * 260, r: 70 + rnd() * 40, y: 120 + rnd() * 40, speed: 9, dir: k ? 1 : -1, phase: rnd() * 6.28, flap: 1.2, amp: 0.04, scale: 2.2 });
    }
    for (let k = 0; k < (few ? 8 : 18); k++) {
      this.birds.push({ kind: 'flock', species: 'swift', phase: rnd() * 6.28, k: rnd() * 40, flap: 22, amp: 0.75, scale: 1 });
    }
  }

  _flock(b, t, out) {
    const f = 0.085, p = b.k;
    out.set(-95 + 120 * Math.sin(t * f) + 6 * Math.sin(t * 1.3 + p), 38 + 13 * Math.sin(t * f * 2.1 + 1) + 2 * Math.sin(t * 1.7 + p * 2), 0 + 95 * Math.sin(t * f * 1.37 + 0.6) + 6 * Math.cos(t * 1.1 + p * 1.7));
  }

  update(dt, time, playerPos) {
    const d = this.data, m = this._m, q = this._q, e = this._e, pos = this._p, sc = this._s, rnd = this.rnd;
    this.birds.forEach((b, i) => {
      let pitch = 0, roll = 0, scale = b.scale;
      if (b.kind === 'swim') {
        const P = b.pond;
        let tx, tz, speed = b.cruise;
        if (b.leader) {
          const L = b.leader, s = Math.sin(L.heading), c = Math.cos(L.heading);
          tx = L.x - s * b.gap + c * b.side; tz = L.z - c * b.gap - s * b.side;
          speed = Math.max(L.cruise, b.cruise);
        } else {
          if (playerPos && (b.x - playerPos.x) ** 2 + (b.z - playerPos.z) ** 2 < 36 && !(b.flee > 0)) {
            // someone comes close: make for the far side of the pond
            b.target = P.open.reduce((best, s) => ((s[0] - playerPos.x) ** 2 + (s[1] - playerPos.z) ** 2 > (best[0] - playerPos.x) ** 2 + (best[1] - playerPos.z) ** 2 ? s : best), P.open[0]);
            b.flee = 5; b.wait = 0; b.under = 0;
          }
          if (b.flee > 0) { b.flee -= dt; speed *= 2.6; }
          if (b.wait > 0) {
            b.wait -= dt;
            speed = 0;
            if (b.dabbles && b.tip) pitch = 1.15 * Math.min(1, Math.min(b.wait, b.tip - b.wait + 0.01) * 2.5); // tail up, head under
            if (b.dives && b.under > 0) { // under water: come up somewhere else
              scale = 0;
              if (b.wait <= 0) { const s = P.open[(rnd() * P.open.length) | 0]; b.x = s[0]; b.z = s[1]; b.under = 0; }
            }
            if (b.wait <= 0) b.target = P.open[(rnd() * P.open.length) | 0];
          }
          if (!b.target) b.target = P.open[(rnd() * P.open.length) | 0];
          tx = b.target[0]; tz = b.target[1];
        }
        const dx = tx - b.x, dz = tz - b.z, dist = Math.hypot(dx, dz);
        if (speed > 0 && dist > 0.25) {
          let turn = Math.atan2(dx, dz) - b.heading;
          turn = Math.atan2(Math.sin(turn), Math.cos(turn));
          b.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, turn));
          const v = Math.min(speed, dist * 1.2) * Math.max(0.15, Math.cos(turn));
          const nx = b.x + Math.sin(b.heading) * v * dt, nz = b.z + Math.cos(b.heading) * v * dt;
          if (Math.abs(d.waterAt(nx, nz) - P.level) < 0.03 && d.depthAt(nx, nz) > 0.16) { b.x = nx; b.z = nz; b.v = v; }
          else if (!b.leader) { b.target = P.open[(rnd() * P.open.length) | 0]; b.v = 0; } // a bank in the way
        } else if (!b.leader && !(b.wait > 0)) {
          // arrived: rest a while; ducks dabble, the cormorant dives
          b.wait = 2 + rnd() * 7;
          b.tip = b.dabbles && rnd() < 0.6 ? (b.wait = 2.2 + rnd() * 1.5) : 0;
          if (b.dives && rnd() < 0.7) { b.under = 1; b.wait = 4 + rnd() * 4; }
          b.v = 0;
        }
        pos.set(b.x, P.level + (FLOAT[b.species] || 0) * b.scale + Math.sin(time * 1.4 + b.phase) * 0.012 * b.scale - (scale === 0 ? 1 : 0), b.z);
      } else if (b.kind === 'stand') {
        pos.set(b.x, b.y, b.z);
        if (b.grazes) pitch = 0.5 + 0.35 * Math.sin(time * 0.35 + b.phase) * Math.sin(time * 0.11 + b.phase * 2); // head to the grass, now and then
      } else if (b.kind === 'circle') {
        const a = b.phase + (time * b.speed * b.dir) / b.r;
        pos.set(b.cx + Math.cos(a) * b.r, b.y + Math.sin(time * 0.21 + b.phase) * 3, b.cz + Math.sin(a) * b.r);
        b.heading = Math.atan2(-Math.sin(a) * b.dir, Math.cos(a) * b.dir);
        roll = -0.38 * b.dir;
      } else {
        this._flock(b, time + 0.06, sc);
        this._flock(b, time, pos);
        b.heading = Math.atan2(sc.x - pos.x, sc.z - pos.z);
        pitch = -Math.atan2(sc.y - pos.y, Math.hypot(sc.x - pos.x, sc.z - pos.z));
        roll = Math.sin(time * 1.3 + b.k) * 0.5;
      }
      e.set(pitch, b.heading, roll);
      m.compose(pos, q.setFromEuler(e), sc.setScalar(scale));
      m.toArray(this.mesh.instanceMatrix.array, i * 16);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
