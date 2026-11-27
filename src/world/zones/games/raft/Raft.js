// Wild River: what is seen of it and how it is played. The river is in rules.js, the headland it comes down in
// land.js; here they are built — the rock of the headland with its canyon, its green tops and its cliffs in the
// sea, the water that runs down it and where it breaks, the fall that feeds it from the top of the real cliff,
// the boulders, the trees and the bushes, the gantry of the start, the flags of the pools, the boards before the
// falls, the gate on the beach — and a run is run: a session that drives the player (see src/extras/plug.js),
// the raft under it, and the rafts of whoever else is on the river.
//
// What reads at a glance, and never changes: grey rock in the stream is gone round; yellow and black on the
// banks is a fall — BRACE; white boiling water under a fall holds — paddle hard, or go round; pale gravel under
// the water grounds; a green flag is a save.
import * as THREE from 'three';
import { Parts, MeshBuilder } from '../../../props/MeshBuilder.js';
import { LAYER } from '../../../../render/Shadows.js';
import { distanceCuller } from '../../../props/StaticBatch.js';
import { makeMaterial, GLSL_COMMON, GLSL_SHADOW, GLSL_LIGHTING, GLSL_SURFACE } from '../../../../render/globals.js';
import { surfaceMaterial } from '../../../../render/SurfaceMaterial.js';
import { ANIM } from '../../../../player/Character.js';
import { fallsRibbon } from '../../../water/Falls.js';
import { canvasBoard } from '../Boards.js';
import { formatTime } from '../course.js';
import { gateArch, stakeSign, nextStart, STARTS, worldClock } from '../gates.js';
import { RAFT, raftCourse, riverAt, riverPoint, riverNear, swellAt, startRun, stepRun, raftPose, botInput } from './rules.js';
import { raftLand, LAND, noise } from './land.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
const rnd = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const CREAM = [1.3, 1.17, 0.9], RED = [0.95, 0.1, 0.12], GOLD = [1.5, 1.05, 0.2], NAVY = [0.07, 0.07, 0.2], YELLOW = [1.6, 1.3, 0.12], GREEN = [0.12, 0.8, 0.28], WHITE = [1.7, 1.7, 1.66];
const TUBE = [1.75, 0.82, 0.06], FLOOR = [0.08, 0.2, 0.42], THWART = [0.12, 0.42, 1.1];
const CELL = 1.6, CHUNK = 16; // the ground of the headland: metres between two points of it, and how many a side to a piece

// ---------------------------------------------------------------------------------------------- the water
// The river: green and dark where it stands in a pool, pale where it runs thin, streaks of foam going its way —
// white where it breaks: in a rapid, round a rock, under a fall.
const WATER_VERT = /* glsl */ `
${GLSL_COMMON}
in float aEdge;
in float aDeep;
in float aFoam;
in float aFade;
out float vFade;
out vec2 vUv;
out float vEdge;
out float vDeep;
out float vFoam;
out vec3 vWorld;
out vec3 vNormalW;
void main() {
  vUv = uv; vEdge = aEdge; vDeep = aDeep; vFoam = aFoam; vFade = aFade;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const WATER_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_SHADOW}
${GLSL_LIGHTING}
uniform sampler2D uFoam;
in vec2 vUv;    // x: metres across, y: metres along the river
in float vEdge; // 0 in the middle, 1 at the bank
in float vDeep; // 0 where it runs thin, 1 in a pool
in float vFoam; // 0 smooth water, 1 white water
in float vFade; // 1 where it is lost in the sea
in vec3 vWorld;
in vec3 vNormalW;
void main() {
  float run = 0.5 + 1.1 * vFoam;
  float a1 = texture(uFoam, vec2(vUv.x * 0.13, vUv.y * 0.045 - uTime * 0.42 * run)).r;
  float a2 = texture(uFoam, vec2(vUv.x * 0.27 + 0.37, vUv.y * 0.1 - uTime * 0.74 * run)).r;
  float a3 = texture(uFoam, vec2(vUv.x * 0.5 + 0.11, vUv.y * 0.31 - uTime * 1.3)).r;
  float n = max(a1, a2 * 0.92) + 0.3 * vFoam * a3;
  float streak = smoothstep(0.82 - 0.62 * vFoam, 1.0 - 0.45 * vFoam, n) * (0.25 + 0.75 * smoothstep(0.02, 0.3, vFoam));
  float shore = smoothstep(0.8, 0.98, vEdge) * (0.35 + 0.65 * a3);
  vec3 n3 = normalize(vNormalW + vec3((a2 - 0.5) * 0.25, 0.0, (a1 - 0.5) * 0.25));
  float shadow = sunShadow(vWorld, n3);
  vec3 light = hemiAmbient(n3) + uSunColor * (0.2 + 0.8 * shadow) * max(dot(n3, uSunDir), 0.0);
  vec3 view = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(view, n3), 0.0), 3.0);
  vec3 thin = vec3(0.1, 0.4, 0.38), pool = vec3(0.018, 0.17, 0.19);
  vec3 tone = mix(thin, pool, vDeep) * (0.8 + 0.4 * a2);
  tone = mix(tone, vec3(1.0), clamp(streak * 0.92 + shore * 0.55, 0.0, 1.0));
  float glint = pow(max(dot(reflect(-view, n3), uSunDir), 0.0), 60.0) * (0.25 + 0.5 * shadow);
  vec3 col = tone * light + vec3(0.7, 0.88, 1.0) * fres * 0.3 + uSunColor * glint;
  float alpha = mix(mix(0.78, 0.94, vDeep), 0.97, clamp(streak + shore, 0.0, 1.0)) * (1.0 - smoothstep(0.985, 1.0, vEdge) * 0.6) * (1.0 - vFade);
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col) * alpha, alpha);
}
`;
let waterMat = null;
function waterMaterial(foam) {
  if (!waterMat) {
    waterMat = makeMaterial({
      uniforms: { uFoam: foam }, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, side: THREE.DoubleSide,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    waterMat.name = 'raft:water';
  }
  return waterMat;
}

// ---------------------------------------------------------------------------------------------- the rock
// The ground of the headland: the world's granite laid on it from three sides (no face of a cliff is smeared),
// in beds that follow the height, grass and moss wherever it lies flat enough, gravel along the river, dark and
// wet at the foot of the cliffs. What the vertices say: r how dry (0: in the water), g how much gravel or sand,
// b how wet and dark, a how much of the sky reaches the place.
const LAND_VERT = /* glsl */ `
${GLSL_COMMON}
out vec3 vWorld;
out vec3 vNormal;
out vec4 vColor;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vColor = color;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const LAND_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_SHADOW}
${GLSL_LIGHTING}
${GLSL_SURFACE}
uniform sampler2D uMap;
in vec3 vWorld;
in vec3 vNormal;
in vec4 vColor;
void main() {
  vec3 N = normalize(vNormal);
  vec3 w = pow(abs(N), vec3(5.0)); w /= (w.x + w.y + w.z);
  vec3 p = vWorld * 0.11;
  vec3 tex = texture(uMap, p.zy).rgb * w.x + texture(uMap, p.xz).rgb * w.y + texture(uMap, p.xy).rgb * w.z;
  float n1 = texture(uMap, vWorld.xz * 0.013).r, n2 = texture(uMap, vWorld.xz * 0.047 + 0.31).g, n3 = texture(uMap, vec2((vWorld.x + vWorld.z) * 0.06, vWorld.y * 0.006)).b;
  float grain = 0.72 + 0.56 * tex.r;
  // rock: beds of it, one over the other, a dark seam between two
  float yb = vWorld.y + 2.4 * n1 + 0.7 * n2;
  float beds = 0.5 + 0.5 * sin(yb * 1.7) * sin(yb * 0.57 + 1.7);
  float seam = 1.0 - smoothstep(0.0, 0.07, abs(fract(yb * 0.42) - 0.5)) ;
  float steep = 1.0 - smoothstep(0.55, 0.85, N.y);
  vec3 rock = mix(vec3(0.33, 0.3, 0.27), vec3(0.56, 0.5, 0.43), beds) * grain;
  rock = mix(rock, rock * vec3(1.16, 0.98, 0.78), n1 * 0.8);
  rock *= 1.0 - 0.4 * seam * steep;
  // grass where the ground lies flat enough — the tops, the ledges, the banks —, moss in streaks down the faces
  float green = smoothstep(0.7, 0.86, N.y + 0.14 * (n2 - 0.5)) * vColor.r;
  vec3 grass = mix(vec3(0.16, 0.34, 0.08), vec3(0.4, 0.5, 0.13), n1) * (0.75 + 0.5 * tex.g);
  float moss = smoothstep(0.42, 0.7, n3) * steep * smoothstep(2.5, 9.0, vWorld.y) * vColor.r * 0.75;
  vec3 albedo = mix(rock, vec3(0.2, 0.37, 0.1) * grain, moss);
  albedo = mix(albedo, grass, green);
  // gravel along the river, sand round the lagoon; dark where it is wet
  albedo = mix(albedo, mix(vec3(0.5, 0.46, 0.39), vec3(0.74, 0.68, 0.52), smoothstep(0.55, 0.9, vColor.g)) * grain, min(1.0, vColor.g * 1.6));
  albedo *= 1.0 - 0.62 * vColor.b;
  vec3 V = normalize(cameraPosition - vWorld);
  float shadow = sunShadow(vWorld, N);
  Surface s;
  s.albedo = albedo; s.N = N; s.Ng = N; s.rough = 0.95; s.ao = vColor.a; s.spec = 0.04 + 0.2 * vColor.b; s.sss = 0.0;
  vec3 col = shadeSurface(s, vWorld, V, shadow);
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col), 1.0);
}
`;

export class Raft {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.course = raftCourse();
    this.land = raftLand(this.course);
    this.group = new THREE.Group();
    this.group.name = 'raft';
    this.session = null;
    this.best = 0;
    /** The clock everybody shares (ms): the starts are counted on it. */
    this.clock = worldClock;
  }

  build() {
    const world = this.world, granite = world.materials.granite.uniforms;
    // the rock of the headland (the world's granite, in its own colours: they come from the vertices) and its leaves
    this.mats = {
      ...world.materials,
      land: makeMaterial({ uniforms: { uMap: granite.uMap }, vertexShader: LAND_VERT, fragmentShader: LAND_FRAG, vertexColors: true }),
      leaf: surfaceMaterial({ name: 'raft-leaf', rough: 0.86, spec: 0.05, side: THREE.DoubleSide }),
    };
    this.mats.land.name = 'raft-land';
    this._ground();
    this._water();
    this._falls();
    this._stones();
    this._plants();
    this._signs();
    this._gate();
    this._rafts();
    this.group.updateMatrixWorld(true);
    const far = world.engine.tier.phone ? 0.7 : 1;
    this._near = 150 * far; // within that distance a piece of the headland is drawn in full
    this._cull = distanceCuller(this.group, [[/^raft-(ground|far)/, Infinity], [/^raft-water/, 420 * far], [/^raft-(plants|stones)/, 520 * far], [/^raft-(signs|flag|board|sign)/, 260 * far], [/^raft-gate|gate-board|stake-sign/, 420], [/^raft-fall/, 1400], [/./, 900]]);
    world.scene.add(this.group);
    return this;
  }

  // -------------------------------------------------------------------------------------------- the headland
  /** The ground of the headland: its height on a lattice, then pieces of it — each twice: in full, and with a quarter of the points for when it is far. */
  _ground() {
    const L = this.land, nx = Math.floor((L.x1 - L.x0) / CELL) + 1, nz = Math.floor((L.z1 - L.z0) / CELL) + 1, n = nx * nz;
    const H = new Float32Array(n), kind = new Uint8Array(n), E = new Float32Array(n), top = new Float32Array(n), sea = new Float32Array(n), lvl = new Float32Array(n), o = {};
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; L.at(L.x0 + i * CELL, L.z0 + j * CELL, o);
      H[k] = o.h; kind[k] = o.kind; E[k] = o.e; top[k] = o.top; sea[k] = o.sea; lvl[k] = o.level;
    }
    const at = (i, j) => H[clamp(j, 0, nz - 1) * nx + clamp(i, 0, nx - 1)];
    const col = [0, 0, 0, 1], N = V(0, 1, 0), P = V(0, 0, 0);
    /** The colour of the ground at a point of the lattice: rock in beds, grass where it lies flat, gravel by the water — and how much of the sky reaches it. */
    const paint = (i, j) => {
      const k = j * nx + i, x = L.x0 + i * CELL, z = L.z0 + j * CELL, h = H[k], e = E[k], n1 = noise(x / 6.3, z / 6.3);
      // how dry: nothing grows in the water, nor within a step of it, nor in the spray of the sea
      const dry = (kind[k] === 0 ? 0 : smooth(0.05, 0.9, e)) * smooth(1.0, 2.2, h);
      // gravel along the water of the river — more of it, and paler, round the lagoon: a beach
      const river = kind[k] === 1 || kind[k] === 0 ? 1 - smooth(0.2, 1.7 + 1.3 * n1, e) : 0, beach = lvl[k] < 1.2 && h < 2.4 ? smooth(8, 2.5, e) * smooth(2.4, 1.3, h) : 0;
      // wet and dark: the bed under the water, the foot of the cliffs in the sea
      const under = kind[k] === 0 ? 0.25 + 0.6 * smooth(0, -1.2, h - lvl[k]) : 0, surf = (kind[k] === 4 || sea[k] < 3) ? smooth(1.5, 0.1, h) * 0.8 : 0;
      // how much of the sky reaches the point: less at the foot of a wall, at the bottom of the canyon
      const deep = Math.max(0, top[k] - h), ao = kind[k] === 3 ? 1 : 1 - 0.42 * smooth(1, 16, deep) * (kind[k] === 4 ? 0.3 : 1);
      col[0] = dry; col[1] = Math.max(river * 0.55, beach); col[2] = Math.max(under, surf); col[3] = ao;
      return col;
    };
    const piece = (b, i0, j0, stride) => {
      const ids = new Map(), cells = (CHUNK / stride) | 0;
      const vert = (i, j, drop = 0) => {
        const key = (j * nx + i) * 2 + (drop ? 1 : 0);
        if (ids.has(key)) return ids.get(key);
        const x = L.x0 + i * CELL, z = L.z0 + j * CELL, h = at(i, j);
        N.set((at(i - 1, j) - at(i + 1, j)) / (2 * CELL), 1, (at(i, j - 1) - at(i, j + 1)) / (2 * CELL)).normalize();
        const c = paint(clamp(i, 0, nx - 1), clamp(j, 0, nz - 1));
        const id = b.vert(P.set(x, h - drop, z), N, x + 0.62 * h, z + 0.62 * h, c);
        ids.set(key, id);
        return id;
      };
      let any = false;
      for (let cj = 0; cj < cells; cj++) for (let ci = 0; ci < cells; ci++) {
        const i = i0 + ci * stride, j = j0 + cj * stride;
        if (i + stride >= nx || j + stride >= nz) continue;
        if (Math.max(at(i, j), at(i + stride, j), at(i, j + stride), at(i + stride, j + stride)) < -2.4) continue; // (under the sea)
        const a = vert(i, j), c = vert(i + stride, j), d = vert(i + stride, j + stride), e = vert(i, j + stride);
        // (the diagonal that follows the ground best)
        if (Math.abs(at(i, j) - at(i + stride, j + stride)) < Math.abs(at(i + stride, j) - at(i, j + stride))) b.idx.push(a, e, d, a, d, c); else b.idx.push(a, e, c, c, e, d);
        any = true;
        if (stride > 1) {
          // (a far piece wears a skirt along its edges: no slit shows between it and a piece drawn in full)
          const skirt = (p, q, i1, j1, i2, j2) => { const p2 = vert(i1, j1, 3), q2 = vert(i2, j2, 3); b.idx.push(p, p2, q, q, p2, q2, p, q, p2, q, q2, p2); };
          if (ci === 0) skirt(a, e, i, j, i, j + stride);
          if (ci === cells - 1) skirt(c, d, i + stride, j, i + stride, j + stride);
          if (cj === 0) skirt(a, c, i, j, i + stride, j);
          if (cj === cells - 1) skirt(e, d, i, j + stride, i + stride, j + stride);
        }
      }
      return any;
    };
    this._pieces = [];
    const cast = [LAYER.STATIC_CASTER];
    for (let j0 = 0; j0 < nz - 1; j0 += CHUNK) for (let i0 = 0; i0 < nx - 1; i0 += CHUNK) {
      const near = new MeshBuilder(), far = new MeshBuilder();
      if (!piece(near, i0, j0, 1)) continue;
      piece(far, i0, j0, 2);
      const a = new THREE.Mesh(near.build(), this.mats.land), b = new THREE.Mesh(far.build(), this.mats.land);
      a.name = `raft-ground-${i0}-${j0}`; b.name = `raft-far-${i0}-${j0}`;
      for (const m of [a, b]) { m.matrixAutoUpdate = false; this.group.add(m); }
      for (const l of cast) a.layers.enable(l);
      a.visible = false;
      const s = a.geometry.boundingSphere;
      this._pieces.push({ near: a, far: b, x: s.center.x, y: s.center.y, z: s.center.z, r: s.radius });
    }
    this._lattice = { H, kind, E, top, sea, lvl, nx, nz };
  }

  /** A point of the lattice of the ground nearest to a place: { h, kind, e, top, sea, flat (how level it lies, 0 … 1) }. */
  _groundAt(x, z, out = {}) {
    const L = this.land, G = this._lattice, i = clamp(Math.round((x - L.x0) / CELL), 1, G.nx - 2), j = clamp(Math.round((z - L.z0) / CELL), 1, G.nz - 2), k = j * G.nx + i;
    out.h = G.H[k]; out.kind = G.kind[k]; out.e = G.E[k]; out.top = G.top[k]; out.sea = G.sea[k]; out.level = G.lvl[k];
    out.flat = 1 / Math.hypot((G.H[k - 1] - G.H[k + 1]) / (2 * CELL), 1, (G.H[k - G.nx] - G.H[k + G.nx]) / (2 * CELL));
    return out;
  }

  // -------------------------------------------------------------------------------------------- the water
  /** The water of the river, from bank to bank, in stretches: its waves stand in it, its foam is where it breaks. */
  _water() {
    const foam = this.world.water?.shared?.uFoam;
    if (!foam) return;
    const course = this.course, mat = waterMaterial(foam), N = 10, rows = [], q = {};
    for (let s = 0; s <= course.length + 0.01; s += 1.5) rows.push(Math.min(s, course.length));
    for (const l of course.ledges) rows.push(l.s - 0.35, l.s + 0.02, l.s + l.run * 0.4, l.s + l.run, l.s + l.run + 0.9);
    rows.sort((a, b) => a - b);
    // (and on out of the lagoon into the sea, fading)
    const end = course.end, out = [];
    for (let d = 2; d <= 30; d += 4) out.push(d);
    const white = (s, u, p) => {
      const kindOf = course.stretches[course.points[clamp(Math.round(s), 0, course.points.length - 1)].stretch].kind;
      let f = { pool: 0.04, lagoon: 0.03, riffle: 0.3, rapid: 0.5, narrows: 0.55, fall: 0.6, fork: 0.4 }[kindOf] * (0.55 + 0.45 * smooth(p.hw, 0, Math.abs(u) + 1.5));
      for (const l of course.ledges) { if (s > l.s - 2 && s < l.s + l.run + 5 + l.h) f = Math.max(f, s < l.s ? 0.5 * smooth(l.s - 2, l.s, s) : 1 - 0.75 * smooth(l.s + l.run + 1, l.s + l.run + 5 + l.h, s)); }
      for (const r of course.rocks) { if (Math.abs(r.s - s) > 9) continue; const ds = s - r.s, du = u - r.u, d = Math.hypot(ds, du); f = Math.max(f, 1 - smooth(r.r - 0.2, r.r + 1.3, d), ds > 0 ? 0.75 * (1 - smooth(0, 7, ds)) * (1 - smooth(r.r * 0.5, r.r + 0.9 + ds * 0.25, Math.abs(du))) : 0); }
      for (const h of course.holes) if (s > h.from - 0.5 && s < h.to + 1.5 && u > h.u0 - 0.5 && u < h.u1 + 0.5) f = 1;
      for (const it of course.islands) { const mid = (it.from + it.to) / 2, r2 = ((s - mid) / ((it.to - it.from) / 2 + 1.2)) ** 2 + ((u - it.u) / (it.half + 1.2)) ** 2; if (r2 < 1.25) f = Math.max(f, 0.85 * (1 - smooth(0.8, 1.25, r2))); }
      return clamp(Math.max(f, swellAt(course, s, u, 0) * 1.3), 0, 1);
    };
    const ROWS = 42;
    for (let from = 0; from < rows.length - 1; from += ROWS) {
      const to = Math.min(rows.length - 1, from + ROWS), pos = [], nrm = [], uv = [], edge = [], deep = [], fo = [], fd = [], idx = [];
      let count = 0;
      const row = (x, y, z, rx, rz, half, s, p, fade) => {
        for (let j = 0; j <= N; j++) {
          const u = lerp(-half, half, j / N);
          pos.push(x + rx * u, y + (p ? swellAt(course, s, u, 0) : 0) + 0.03, z + rz * u); nrm.push(0, 1, 0); uv.push(u, s);
          edge.push(clamp(Math.abs(u) / half, 0, 1) * (1 - fade)); fd.push(fade); deep.push(p ? p.deep * (course.shoals.some((g) => s > g.from && s < g.to && u > g.u0 && u < g.u1) ? 0.1 : 1) : 1); fo.push(p ? white(s, u, p) : 0.05);
        }
        if (count) { const r0 = (count - 1) * (N + 1), r1 = count * (N + 1); for (let j = 0; j < N; j++) idx.push(r0 + j, r0 + j + 1, r1 + j, r1 + j, r0 + j + 1, r1 + j + 1); }
        count++;
      };
      // (behind the spring, the pool of the Cauldron runs on to the face of the real cliff)
      if (from === 0) { const p = riverAt(course, 0, q); for (let d = LAND.back; d >= 2; d -= 2) row(p.x - p.tx * d, p.y, p.z - p.tz * d, -Math.cos(p.yaw), Math.sin(p.yaw), p.hw + 0.7, -d, p, 0); }
      for (let n = from; n <= to; n++) { const p = riverAt(course, rows[n], q); row(p.x, p.y, p.z, -Math.cos(p.yaw), Math.sin(p.yaw), p.hw + 0.7, p.s, p, 0); }
      if (to === rows.length - 1) for (const d of out) row(end.x + Math.sin(end.yaw) * d, end.y * (1 - d / 30) - 0.02, end.z + Math.cos(end.yaw) * d, -Math.cos(end.yaw), Math.sin(end.yaw), 10.2 + d * 0.25, course.length + d, null, d / 30);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
      geo.setAttribute('aDeep', new THREE.Float32BufferAttribute(deep, 1));
      geo.setAttribute('aFoam', new THREE.Float32BufferAttribute(fo, 1));
      geo.setAttribute('aFade', new THREE.Float32BufferAttribute(fd, 1));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `raft-water-${from}`; mesh.renderOrder = 12; mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
  }

  /** What falls: a sheet of white water down every ledge and the boil under it — and the great fall that feeds the river, down the real cliff into the Cauldron. */
  _falls() {
    const foam = this.world.water?.shared?.uFoam;
    if (!foam) return;
    const course = this.course, q = {}, add = (m, name) => { m.name = name; this.group.add(m); };
    for (const l of course.ledges) {
      const p = riverAt(course, l.s, {}), side = V(-Math.cos(p.yaw), 0, Math.sin(p.yaw)), sheet = [], boil = [];
      for (const d of [-0.7, -0.1, 0.25 * l.run, 0.6 * l.run, l.run, l.run + 0.5]) { const r = riverAt(course, l.s + d, q); sheet.push(V(r.x, r.y + 0.07 + (d > 0 && d < l.run ? 0.12 : 0), r.z)); }
      const reach = 3.5 + l.h * 0.9;
      for (let k = 0; k <= 6; k++) { const r = riverAt(course, l.s + l.run - 0.4 + (reach * k) / 6, q); boil.push(V(r.x, r.y + 0.08, r.z)); }
      add(fallsRibbon(sheet, side, p.hw * 2 - 0.3, foam, (i) => (i === 0 ? 0 : 1)), 'raft-fall-sheet');
      add(fallsRibbon(boil, side, p.hw * 2 - 0.5, foam, (i) => [0.2, 0.95, 1, 0.85, 0.6, 0.3, 0][i], true), 'raft-fall-boil');
      if (l.h > 5) add(fallsRibbon(sheet.slice(1).map((v) => v.clone().add(V(p.tx * 0.5, 0.25, p.tz * 0.5))), side, p.hw * 2 + 3, foam, (i) => Math.min(0.42, 0.14 + i * 0.1)), 'raft-fall-veil');
    }
    // ---- the great fall that feeds it: from a spring at the brink of the cliff, down its face, into the Cauldron
    const T = RAFT.top, d = this.data, down = [];
    let brink = 262, high = -1;
    for (let x = 244; x <= 268; x += 0.5) { const h = d.heightAt(x, T.z); if (h > high) { high = h; brink = x; } }
    const pool = riverAt(course, 0, {}).y;
    for (let x = brink + 1.5; x < T.x; x += 0.4) { const y = d.heightAt(x, T.z) + 0.55; down.push(V(x, Math.max(y, pool + 0.1), T.z)); if (y <= pool + 0.1) break; }
    this.spring = { x: brink + 1.5, y: high, z: T.z, foot: down[down.length - 1].x, height: high - pool };
    add(fallsRibbon(down, V(0, 0, 1), 6.5, foam, (i) => Math.min(1, i / 5)), 'raft-fall-source');
    add(fallsRibbon(down.slice(4), V(0, 0, 1), 11, foam, (i) => Math.min(0.38, i / 30)), 'raft-fall-mist');
    const churn = [];
    for (let k = 0; k <= 6; k++) churn.push(V(this.spring.foot - 1 + k * 1.7, pool + 0.09, T.z));
    add(fallsRibbon(churn, V(0, 0, 1), 12, foam, (i) => [0.5, 1, 0.95, 0.8, 0.55, 0.3, 0][i], true), 'raft-fall-churn');
  }

  // -------------------------------------------------------------------------------------------- stones, plants
  /** Boulders: those of the river (the rules' rocks: grey, wet, standing out of the stream), and others along its banks, on the island and at the foot of the cliffs. */
  _stones() {
    const course = this.course, R = rnd(4711), list = [], q = {}, o = {};
    for (const r of course.rocks) { riverPoint(course, r.s, r.u, q); list.push({ x: q.x, y: q.y - r.r * 0.32, z: q.z, s: r.r * 1.08, squash: 0.82, tone: 0.92 }); }
    // (a rock that leaves no room along a bank: more of them fill the corner — no raft goes there)
    for (const r of course.rocks) { if (!r.bank) continue; const p = riverAt(course, r.s, {}); for (let k = 0; k < 3; k++) { const u = r.u + r.bank * (r.r * 0.8 + (p.hw - Math.abs(r.u) - r.r) * (0.3 + 0.35 * k)); riverPoint(course, r.s + (R() - 0.5) * 3.4, u, q); list.push({ x: q.x, y: q.y - 0.3, z: q.z, s: 0.7 + 0.6 * R(), squash: 0.8, tone: 0.9 }); } }
    for (const it of course.islands) for (let k = 0; k < 9; k++) { const a = R() * TAU, s = (it.from + it.to) / 2 + Math.cos(a) * ((it.to - it.from) / 2 - 0.5), u = it.u + Math.sin(a) * (it.half - 0.3); riverPoint(course, s, u, q); list.push({ x: q.x, y: q.y + 0.1, z: q.z, s: 0.6 + 0.8 * R(), squash: 0.75, tone: 1 }); }
    // along the banks, and in the sea at the foot of the cliffs
    for (let n = 0; n < 2600 && list.length < 230; n++) {
      const x = this.land.x0 + R() * (this.land.x1 - this.land.x0), z = this.land.z0 + R() * (this.land.z1 - this.land.z0), g = this._groundAt(x, z, o);
      if (g.kind === 1 && g.e > 0.3 && g.e < 3.2 && R() < 0.5) list.push({ x, y: g.h - 0.25, z, s: 0.35 + 0.75 * R() * R(), squash: 0.7 + 0.3 * R(), tone: 0.95 + 0.15 * R() });
      else if (g.kind === 4 && g.h < 1.6 && g.h > -1.4 && R() < 0.55) list.push({ x, y: g.h - 0.2, z, s: 0.7 + 1.7 * R() * R(), squash: 0.75, tone: 0.62 + 0.2 * R() });
    }
    // one boulder, in two shapes: a ball of twenty faces pushed in and out
    const shapes = [0, 1].map((v) => {
      const geo = new THREE.IcosahedronGeometry(1, 1).toNonIndexed(), p = geo.attributes.position, c = new Float32Array(p.count * 4);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.78 + 0.42 * noise(x * 1.7 + 11 * v, y * 1.7 + z * 1.3 + 5 * v);
        p.setXYZ(i, x * k, y * k * 0.9, z * k);
        const t = 0.8 + 0.3 * noise(x * 3 + 2, z * 3 + y * 2), low = smooth(-0.1, -0.7, y);
        c.set([0.98 * t * (1 - 0.45 * low), 0.94 * t * (1 - 0.42 * low), 0.87 * t * (1 - 0.38 * low), 1 - 0.3 * low], i * 4);
      }
      geo.computeVertexNormals(); geo.setAttribute('color', new THREE.BufferAttribute(c, 4));
      return geo;
    });
    const m = new THREE.Matrix4(), e = new THREE.Euler(), qt = new THREE.Quaternion(), sc = V(1, 1, 1), tone = new THREE.Color();
    shapes.forEach((geo, v) => {
      const mine = list.filter((_, i) => i % 2 === v), mesh = new THREE.InstancedMesh(geo, this.mats.rock, mine.length);
      mine.forEach((b, i) => { m.compose(V(b.x, b.y, b.z), qt.setFromEuler(e.set((R() - 0.5) * 0.5, R() * TAU, (R() - 0.5) * 0.5)), sc.set(b.s * (0.9 + 0.3 * R()), b.s * b.squash, b.s * (0.9 + 0.3 * R()))); mesh.setMatrixAt(i, m); mesh.setColorAt(i, tone.setRGB(b.tone, b.tone, b.tone)); });
      mesh.name = `raft-stones-${v}`; mesh.matrixAutoUpdate = false; mesh.layers.enable(LAYER.STATIC_CASTER);
      mesh.computeBoundingSphere();
      this.group.add(mesh);
    });
  }

  /** Trees and bushes of the headland's own, light: three kinds, each drawn in one go — pines on the tops, round trees on the meadows and the banks, bushes on the ledges and by the water. */
  _plants() {
    const R = rnd(90117), o = {}, L = this.land;
    const kinds = { pine: [], round: [], bush: [] };
    for (let n = 0; n < 9000; n++) {
      const x = L.x0 + R() * (L.x1 - L.x0), z = L.z0 + R() * (L.z1 - L.z0), g = this._groundAt(x, z, o), w = noise(x / 19 + 3, z / 19 + 8);
      if (g.h < 1.4 || g.kind === 0 || g.kind === 4 || g.flat < 0.72) continue;
      const here = { x, y: g.h - 0.15, z, k: 0.75 + 0.6 * R(), yaw: R() * TAU };
      if (g.kind === 3 && g.sea > 3.5) { if (R() < 0.2 + 0.5 * w && kinds.pine.length < 150) kinds.pine.push(here); else if (R() < 0.3 && kinds.bush.length < 260) kinds.bush.push(here); }
      else if (g.kind === 1 && g.e > 2.6) { if (R() < 0.55 && kinds.round.length < 80) kinds.round.push(here); else if (R() < 0.5 && kinds.bush.length < 260) kinds.bush.push(here); }
      else if (g.kind === 1 && g.e > 1.1 && R() < 0.3 && kinds.bush.length < 260) kinds.bush.push(here);
      else if (g.kind === 2 && g.flat > 0.86 && R() < 0.6) { if (R() < 0.3 && kinds.round.length < 80) kinds.round.push(here); else if (kinds.bush.length < 260) kinds.bush.push(here); }
    }
    const green = (t, dark = 1) => [(0.1 + 0.13 * t) * dark, (0.3 + 0.2 * t) * dark, (0.06 + 0.05 * t) * dark, 1];
    const blob = (b, x, y, z, r, flat, c) => b.tint(...c).place(x, y, z, r * 7.3).lathe([[0, -r * flat], [r * 0.72, -r * flat * 0.62], [r, 0], [r * 0.7, r * flat * 0.72], [0, r * flat]], 7).pop();
    const make = {
      pine: (wood, leaf) => {
        wood.tint(0.62, 0.48, 0.38, 1).cylinder(0, -0.3, 0, 0.19, 0.07, 6.6, 6);
        for (let k = 0; k < 5; k++) { const y = 1.7 + k * 1.15, r = 1.75 - k * 0.3; leaf.tint(...green(0.15 + 0.12 * k, 0.72 + 0.07 * k)).place(0, y, 0, k * 1.3).lathe([[r, 0], [r * 0.55, 0.55], [0.12, 1.5]], 7).pop(); leaf.tint(...green(0, 0.5)).place(0, y, 0, k * 1.3).lathe([[0.1, 0.12], [r, 0]], 7).pop(); }
      },
      round: (wood, leaf) => {
        wood.tint(0.7, 0.56, 0.45, 1).cylinder(0, -0.3, 0, 0.17, 0.11, 2.7, 6).rod(V(0, 2.2, 0), V(0.8, 3.3, 0.3), 0.08, 5, { caps: false }).rod(V(0, 2.1, 0), V(-0.7, 3.2, -0.5), 0.08, 5, { caps: false });
        blob(leaf, 0, 4.0, 0, 1.55, 0.72, green(0.75)); blob(leaf, 0.95, 3.5, 0.4, 1.1, 0.7, green(0.5, 0.9)); blob(leaf, -0.85, 3.4, -0.6, 1.15, 0.7, green(0.9, 0.86)); blob(leaf, 0.1, 3.3, -0.9, 0.95, 0.7, green(0.35, 0.8));
      },
      bush: (wood, leaf) => { blob(leaf, 0, 0.5, 0, 0.75, 0.7, green(0.6)); blob(leaf, 0.55, 0.4, 0.2, 0.55, 0.7, green(0.9, 0.88)); blob(leaf, -0.45, 0.36, -0.3, 0.5, 0.72, green(0.3, 0.82)); },
    };
    const m = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = V(0, 1, 0), sc = V(1, 1, 1), tone = new THREE.Color();
    for (const [name, list] of Object.entries(kinds)) {
      if (!list.length) continue;
      const wood = new MeshBuilder(), leaf = new MeshBuilder();
      make[name](wood, leaf);
      for (const [b, mat, part] of [[wood, this.mats.woodDark, 'wood'], [leaf, this.mats.leaf, 'leaf']]) {
        if (b.empty) continue;
        const mesh = new THREE.InstancedMesh(b.build(), mat, list.length);
        list.forEach((t, i) => { const k = name === 'pine' ? t.k * 1.25 : t.k; m.compose(V(t.x, t.y, t.z), qt.setFromAxisAngle(up, t.yaw), sc.set(k, k * (0.9 + 0.25 * ((i * 7) % 5) / 5), k)); mesh.setMatrixAt(i, m); const c = 0.85 + 0.3 * (((i * 13) % 7) / 7); mesh.setColorAt(i, tone.setRGB(c, 0.9 + 0.2 * (((i * 5) % 9) / 9), c)); });
        mesh.name = `raft-plants-${name}-${part}`; mesh.matrixAutoUpdate = false; mesh.layers.enable(LAYER.STATIC_CASTER);
        mesh.computeBoundingSphere();
        this.group.add(mesh);
      }
    }
  }

  // -------------------------------------------------------------------------------------------- what stands on the river
  /** The ground beside the river, `u` metres across from its middle at metre `s`: a point of the headland. */
  _bank(s, u, out = V(0, 0, 0)) { const q = riverPoint(this.course, s, u, {}); return out.set(q.x, Math.max(this.land.at(q.x, q.z, {}).h, q.y), q.z); }

  /** The gantry of the start, the flags of the pools, the boards before the falls, the arch of the finish. */
  _signs() {
    const course = this.course, parts = new Parts(), paint = parts.get('paint'), wood = parts.get('woodDark'), cloth = parts.get('doubleSided'), glow = parts.get('glow');
    const banner = (text, sub, w, h, back = '#3a1410') => canvasBoard(1024, Math.round((1024 * h) / w), (ctx, cw, ch) => {
      ctx.fillStyle = back; ctx.fillRect(0, 0, cw, ch); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = ch * 0.05; ctx.strokeRect(ch * 0.05, ch * 0.05, cw - ch * 0.1, ch - ch * 0.1);
      ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${Math.round(ch * (sub ? 0.46 : 0.6))}px Georgia, 'Times New Roman', serif`; ctx.fillText(text, cw / 2, ch * (sub ? 0.4 : 0.54), cw * 0.9);
      if (sub) { ctx.fillStyle = '#f2c14e'; ctx.font = `600 ${Math.round(ch * 0.2)}px system-ui, sans-serif`; ctx.fillText(sub, cw / 2, ch * 0.78, cw * 0.92); }
    }, w, h, { both: true });
    const hang = (board, x, y, z, yaw, name = 'raft-sign') => { board.mesh.position.set(x, y, z); board.mesh.rotation.y = yaw; board.mesh.name = name; this.group.add(board.mesh); };
    /** A gantry over the river at metre `s`: two striped posts on its banks, bunting between them. Returns where its board hangs. */
    const gantry = (s, tones, high) => {
      const p = riverAt(course, s, {}), a = this._bank(s, -(p.hw + 1.3)).clone(), b = this._bank(s, p.hw + 1.3).clone(), top = p.y + high;
      for (const f of [a, b]) for (let y = f.y - 0.5, k = 0; y < top; y += 0.6, k++) paint.tint(...tones[k % tones.length], 1).cylinder(f.x, y, f.z, 0.14, 0.14, Math.min(0.6, top - y), 8);
      for (const f of [a, b]) paint.tint(...GOLD, 1).place(f.x, top, f.z).lathe([[0.001, 0.3], [0.12, 0.25], [0.17, 0.13], [0.12, 0.02], [0.001, 0]], 8).pop();
      // (a line of pennants, and bulbs along it)
      for (let k = 0; k < 14; k++) {
        const t0 = k / 14, t1 = (k + 1) / 14, sag = (t) => top - 0.25 - 0.9 * Math.sin(Math.PI * t), q0 = a.clone().lerp(b, t0).setY(sag(t0)), q1 = a.clone().lerp(b, t1).setY(sag(t1)), mid = q0.clone().lerp(q1, 0.5);
        wood.tint(0.3, 0.26, 0.22, 1).rod(q0, q1, 0.018, 4, { caps: false });
        cloth.tint(...[RED, CREAM, YELLOW, GREEN][k % 4], 1).tri(q0, q1, mid.clone().add(V(0, -0.55, 0)));
        glow.tint(1.6, 1.3, 0.6, 1).place(q0.x, q0.y - 0.06, q0.z).lathe([[0.001, -0.07], [0.06, -0.03], [0.06, 0.03], [0.001, 0.07]], 5).pop();
      }
      return { x: p.x, y: top + 0.55, z: p.z, yaw: p.yaw };
    };
    // ---- the start: over the mouth of the Cauldron
    { const g = gantry(course.flags[0].s + 4, [RED, CREAM], 9.2); hang(banner(RAFT.name.toUpperCase(), `${Math.round(course.length / 10) * 10} METRES TO THE SEA · ${Math.round(course.drop)} M DOWN · BRACE BEFORE EVERY FALL`, 7.6, 1.5), g.x, g.y, g.z, g.yaw); }
    { const g = gantry(course.finish, [NAVY, WHITE], 8.6); hang(banner('FINISH', '', 4.6, 1.05, '#1b1340'), g.x, g.y, g.z, g.yaw); }
    // ---- a flag at every pool: a pole on the right bank, a green pennant, a board that says SAVE
    course.flags.forEach((f, n) => {
      if (!n || f.last) return;
      const p = riverAt(course, f.s, {}), at = this._bank(f.s, p.hw + 1.6).clone(), fx = p.tx, fz = p.tz;
      paint.tint(...CREAM, 1).cylinder(at.x, at.y - 0.4, at.z, 0.07, 0.05, 4.6, 6);
      cloth.tint(...GREEN, 1).tri(V(at.x, at.y + 4.1, at.z), V(at.x, at.y + 3.2, at.z), V(at.x + fx * 1.5, at.y + 3.6, at.z + fz * 1.5));
      const sign = stakeSign(this.group, wood, at.x - fx * 0.5, at.y, at.z - fz * 0.5, p.yaw, `SAVE ${n}`, { w: 1.25, h: 0.46, up: 2.1, back: '#0e3b22' });
      sign.mesh.name = 'raft-flag-sign';
    });
    // ---- before every fall that knocks: boards in yellow and black on both banks — BRACE
    for (const l of course.ledges) {
      if (l.h < RAFT.fall.least) continue;
      const p = riverAt(course, l.s - 7, {});
      for (const side of [-1, 1]) {
        const at = this._bank(l.s - 7, side * (p.hw + 1.1)).clone();
        wood.tint(0.9, 0.85, 0.8, 1).cylinder(at.x, at.y - 0.4, at.z, 0.06, 0.05, 2.5, 6);
        const b = canvasBoard(256, 256, (ctx, w, h) => {
          ctx.fillStyle = '#f5c518'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#16161c';
          for (let k = 0; k < 3; k++) { ctx.beginPath(); const y = 28 + k * 52; ctx.moveTo(26, y); ctx.lineTo(w / 2, y + 44); ctx.lineTo(w - 26, y); ctx.lineTo(w - 26, y + 26); ctx.lineTo(w / 2, y + 70); ctx.lineTo(26, y + 26); ctx.fill(); }
          ctx.fillStyle = '#16161c'; ctx.fillRect(0, h - 58, w, 58); ctx.fillStyle = '#f5c518'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 44px system-ui, sans-serif'; ctx.fillText('BRACE', w / 2, h - 27);
        }, l.h > 5 ? 1.7 : 1.15, l.h > 5 ? 1.7 : 1.15, { both: true });
        hang(b, at.x, at.y + 2.2 + (l.h > 5 ? 0.3 : 0), at.z, p.yaw, 'raft-sign-brace');
      }
    }
    this.group.add(parts.toMeshes(this.mats, { name: 'raft-signs', layers: [] }));
  }

  /** The gate on the beach: an arch, and beside it a raft on its trestles, paddles against it. */
  _gate() {
    const G = RAFT.gate, d = this.data, gy = d.heightAt(G.x, G.z), parts = new Parts(), paint = parts.get('paint'), wood = parts.get('woodDeck');
    this.gate = { x: G.x, y: gy, z: G.z, yaw: G.yaw };
    gateArch(this.group, paint, G.x, gy, G.z, G.yaw, RAFT.name.toUpperCase(), 'A RAFT LEAVES EVERY TEN SECONDS · YOU ARE TAKEN UP TO THE RIVER', { tone: [0.1, 0.42, 0.85], width: 3.6 });
    // (the raft: to the left of who looks through the gate, on two trestles)
    const lx = Math.cos(G.yaw), lz = -Math.sin(G.yaw), fx = Math.sin(G.yaw), fz = Math.cos(G.yaw), cx = G.x + lx * 4.2 + fx * 0.6, cz = G.z + lz * 4.2 + fz * 0.6, cy = d.heightAt(cx, cz);
    for (const t of [-1.0, 1.0]) {
      const px = cx + fx * t, pz = cz + fz * t;
      wood.tint(1, 0.95, 0.85, 1).beam(V(px - lx * 1.1, cy + 0.72, pz - lz * 1.1), V(px + lx * 1.1, cy + 0.72, pz + lz * 1.1), 0.12, 0.1);
      for (const sgn of [-1, 1]) for (const lean of [-0.3, 0.3]) wood.rod(V(px + lx * sgn * 0.9 + fx * lean, cy - 0.2, pz + lz * sgn * 0.9 + fz * lean), V(px + lx * sgn * 0.8, cy + 0.72, pz + lz * sgn * 0.8), 0.045, 5, { caps: false });
    }
    const show = this._raftMesh('raft-gate-raft');
    show.position.set(cx, cy + 0.78, cz); show.rotation.y = G.yaw + 0.12; show.updateMatrix(); show.visible = true;
    this.group.add(show);
    for (const k of [0, 1]) { const bx = cx - lx * 1.5 + fx * (k ? 0.9 : -0.7), bz = cz - lz * 1.5 + fz * (k ? 0.9 : -0.7); this._paddle(paint, V(bx, d.heightAt(bx, bz), bz), V(bx + lx * 0.5, d.heightAt(bx, bz) + 1.75, bz + lz * 0.5)); }
    this.group.add(parts.toMeshes(this.mats, { name: 'raft-gate', layers: [LAYER.STATIC_CASTER] }));
  }

  /** A paddle from its grip to the tip of its blade. */
  _paddle(b, from, to) {
    const dir = to.clone().sub(from), len = dir.length(), neck = from.clone().addScaledVector(dir, 0.68);
    b.tint(1.5, 1.4, 1.1, 1).rod(from, neck, 0.036, 5);
    b.tint(...RED, 1).beam(neck, to, 0.26, 0.04);
    b.tint(...NAVY, 1).place(from.x, from.y, from.z).lathe([[0.001, -0.05], [0.05, 0], [0.001, 0.05]], 5).pop();
    void len;
  }

  // -------------------------------------------------------------------------------------------- the rafts
  /** The shape of a raft: bright tubes round a dark floor, two thwarts, a line along its sides. Its bow looks along +z. */
  _raftShape() {
    if (this._shape) return this._shape;
    const parts = new Parts(), b = parts.get('paint'), rope = parts.get('matte'), y = 0.3, r = 0.28;
    for (const sx of [-0.72, 0.72]) b.tint(...TUBE, 1).rod(V(sx, y, -1.25), V(sx, y, 1.2), r, 9);
    const end = (sg, kick) => {
      const pts = [V(0.72, y, sg * 1.2), V(0.58, y + kick * 0.4, sg * 1.6), V(0.24, y + kick, sg * 1.84), V(-0.24, y + kick, sg * 1.84), V(-0.58, y + kick * 0.4, sg * 1.6), V(-0.72, y, sg * 1.2)];
      for (let k = 0; k + 1 < pts.length; k++) b.tint(...(k === 2 ? WHITE : TUBE), 1).rod(pts[k], pts[k + 1], r, 9);
      for (const p of pts.slice(1, -1)) b.tint(...TUBE, 1).place(p.x, p.y, p.z).lathe([[0.001, -r], [r * 0.7, -r * 0.7], [r, 0], [r * 0.7, r * 0.7], [0.001, r]], 9).pop();
    };
    end(1, 0.2); end(-1, 0.08);
    b.tint(...FLOOR, 1).box(-0.72, 0.04, -1.3, 0.72, 0.14, 1.3);
    for (const z of [0.5, -0.5]) b.tint(...THWART, 1).rod(V(-0.72, y + 0.02, z), V(0.72, y + 0.02, z), 0.19, 8, { caps: false });
    for (const sx of [-1, 1]) { rope.tint(0.95, 0.95, 0.9, 1).rod(V(sx * 1.0, y + 0.05, -1.1), V(sx * 1.0, y + 0.05, 1.05), 0.022, 4, { caps: false }); for (const z of [-0.9, 0, 0.9]) b.tint(...NAVY, 1).box(sx * 0.93 - 0.05, y, z - 0.1, sx * 0.93 + 0.05, y + 0.12, z + 0.1); }
    return (this._shape = [...parts.map].filter(([, q]) => !q.empty).map(([key, q]) => ({ key, geo: q.build() })));
  }

  _raftMesh(name) {
    const g = new THREE.Group();
    g.name = name; g.matrixAutoUpdate = false; g.visible = false;
    for (const { key, geo } of this._raftShape()) { const m = new THREE.Mesh(geo, this.mats[key]); m.name = `${name}:${key}`; m.frustumCulled = false; g.add(m); }
    return g;
  }

  /** One's own raft and paddle, and a few more for the others who are on the river. */
  _rafts() {
    this.mine = this._raftMesh('raft-mine');
    const b = new MeshBuilder();
    this._paddle(b, V(0, 0.75, 0), V(0, -0.75, 0));
    this.paddle = new THREE.Mesh(b.build(), this.mats.paint);
    this.paddle.name = 'raft-paddle'; this.paddle.matrixAutoUpdate = false; this.paddle.visible = false; this.paddle.frustumCulled = false;
    this.others = Array.from({ length: 8 }, (_, i) => this._raftMesh(`raft-other-${i}`));
    // (added to the scene itself: what culls the group by distance leaves them alone)
    this.world.scene.add(this.mine, this.paddle, ...this.others);
  }

  /** Puts a raft where it is: on the water at (x, y, z), pointing `yaw`, nose down by `pitch`, leaning by `roll` (`over`: turned turtle). */
  _place(mesh, x, y, z, yaw, pitch = 0, roll = 0, over = false) {
    const e = this._e || (this._e = new THREE.Euler(0, 0, 0, 'YXZ')), q = this._q || (this._q = new THREE.Quaternion()), p = this._p || (this._p = V(0, 0, 0)), one = this._one || (this._one = V(1, 1, 1));
    mesh.matrix.compose(p.set(x, y + (over ? 0.5 : 0), z), q.setFromEuler(e.set(pitch, yaw, roll + (over ? Math.PI : 0))), one);
    mesh.matrixWorld.copy(mesh.matrix);
    for (const c of mesh.children) c.matrixWorld.copy(mesh.matrix);
    mesh.visible = true;
  }

  setBest(ms) { this.best = ms || 0; }
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.4 * 2.4; }
  /** The start one who asks now would leave with (see gates.js). */
  nextStart() { return nextStart(this.clock(), RAFT.every, STARTS); }

  // -------------------------------------------------------------------------------------------- a run
  /**
   * A run is asked for: the player is taken up to the Cauldron, into a raft, and leaves with the next start.
   * `io`: { play, note, splash, mates }. Returns the session — the driver of the player (see src/extras/plug.js):
   * step, camera, line, start, over (`score`, ms), ended, drop, close, auto (true: a crew runs it by itself),
   * instance (0: the river is one place for everybody), tell() (how far down it one is, and whether in the water).
   */
  open(player, io) {
    const course = this.course, start = this.nextStart(), lanes = [-3.3, -1.1, 1.1, 3.3], st = startRun(course, { wait: Math.max(0.05, start.wait), lane: lanes[Math.floor(Math.random() * lanes.length)] });
    const events = [], input = { x: 0, y: 0, brace: false }, pose = {}, S = { cam: null, look: V(0, 0, 0), fov: 62, shake: 0, after: 0, acc: 0, stroke: 0, pitch: 0, roll: 0, bob: 0, stretch: -1, gone: false, wet: 0, time: 0 };
    const t = V(0, 0, 0), q = {}, pm = new THREE.Matrix4(), pq = new THREE.Quaternion(), pe = new THREE.Euler(0, 0, 0, 'YXZ'), one = V(1, 1, 1);
    const session = {
      raft: this, over: false, ended: false, score: 0, time: 0, line: '', riding: false, anim: ANIM.sit, state: st, auto: false, start, instance: 0,
      tell: () => [Math.round(st.s * 10) / 10, st.swim > 0 ? 1 : 0],
      step: (dt, pl, control) => {
        const inp = pl.input, wait = (start.at - this.clock()) / 1000;
        S.time += dt;
        // (the start goes by the clock everybody shares: the rules count the last moment down)
        if (!S.gone) { if (wait > 0.05) st.wait = wait; }
        if (session.auto) {
          S.acc += Math.min(dt, 0.25);
          while (S.acc >= RAFT.step) { S.acc -= RAFT.step; botInput(st, 'steady', input); stepRun(st, RAFT.step, input, events); }
        } else {
          input.x = control ? clamp(inp.move.x, -1, 1) : 0; input.y = control ? clamp(inp.move.y, -1, 1) : 0; input.brace = control && !!inp.jump;
          stepRun(st, dt, input, events);
        }
        for (const e of events) this._tell(e, st, io, S);
        events.length = 0;
        // ---- where the raft is, and how it lies on the water
        raftPose(st, pose, S.time);
        const swim = st.swim > 0, air = !!st.air, fast = clamp(st.vs / 7, 0, 1.3);
        S.bob += dt * (2 + 5 * fast);
        const want = air ? clamp(0.25 - st.air.vy * 0.07, -0.2, 1.0) : Math.atan(pose.slope) * 0.9 + (st.stun > 0 ? 0.12 * Math.sin(S.time * 17) : 0);
        S.pitch += (want - S.pitch) * Math.min(1, dt * (air ? 5 : 8));
        S.roll += ((st.held ? 0.22 * Math.sin(S.time * 7) : clamp(st.vu * 0.05 + st.w * 0.07, -0.3, 0.3) + 0.05 * fast * Math.sin(S.bob * 1.3)) - S.roll) * Math.min(1, dt * 6);
        const y = pose.y + 0.02 + 0.04 * fast * Math.sin(S.bob);
        this._place(this.mine, pose.x, y, pose.z, pose.yaw, S.pitch, S.roll, swim);
        // ---- the rider: in the raft — or in the water beside it
        if (swim) { pl.pos.set(pose.x + Math.cos(pose.yaw) * 1.6, pose.level - 0.75, pose.z - Math.sin(pose.yaw) * 1.6); pl.pitch = 0; pl.roll = 0; }
        else { pl.pos.set(pose.x - Math.sin(pose.yaw) * 0.2, y + 0.34, pose.z - Math.cos(pose.yaw) * 0.2); pl.pitch = S.pitch * 0.8; pl.roll = S.roll; }
        pl.yaw = pose.yaw; pl.speed = Math.hypot(st.vs, st.vu); pl.grounded = true;
        session.anim = swim ? ANIM.swim : ANIM.sit;
        // (the paddle: a stroke on one side then the other while one paddles, across the knees when braced)
        const paddling = !swim && st.wait <= 0 && st.stun <= 0 && st.braced <= 0 && (Math.abs(input.y) > 0.2 || Math.abs(input.x) > 0.2);
        if (paddling) S.stroke += dt * (4.6 + 2 * Math.abs(input.y));
        const sideOf = Math.sin(S.stroke * 0.5) >= 0 ? 1 : -1, sweep = Math.sin(S.stroke), braced = st.braced > 0 || st.stun > 0;
        pe.set(braced ? 0.1 : 0.55 * sweep * Math.sign(input.y || 1), pose.yaw, braced ? Math.PI / 2 : sideOf * (0.75 + 0.2 * Math.abs(sweep)));
        const hx = Math.cos(pose.yaw), hz = -Math.sin(pose.yaw), off = braced ? 0 : sideOf * 0.62;
        pm.compose(t.set(pose.x - Math.sin(pose.yaw) * 0.05 - hx * off, y + (braced ? 0.72 : 0.62), pose.z - Math.cos(pose.yaw) * 0.05 - hz * off), pq.setFromEuler(pe), one);
        this.paddle.matrix.copy(pm); this.paddle.matrixWorld.copy(pm); this.paddle.visible = !swim;
        // ---- the line of the run
        const here = course.stretches.findIndex((z) => st.s >= z.from && st.s < z.to);
        if (here !== S.stretch && here >= 0 && S.gone) { S.stretch = here; if (here > 0) io.note(course.stretches[here].name, 2200); }
        if (st.over && !session.over) { session.over = true; session.time = st.time; session.score = st.time; }
        if (st.over) { S.after += dt; if (S.after > 3.2) session.ended = true; }
        const mishaps = `${st.knocks ? ` · knocked ${st.knocks}` : ''}${st.swims ? ` · over ${st.swims}` : ''}`;
        session.line = !S.gone ? `${RAFT.name} · ${start.name} start in ${Math.max(1, Math.ceil(st.wait))}…`
          : st.over ? `${RAFT.name} · ${formatTime(st.time)}${mishaps}`
            : `${formatTime(Math.round(st.clock * 1000))} · ${course.stretches[Math.max(0, here)].name} · ${Math.max(0, Math.round(course.finish - st.s))} m to the sea${mishaps}`;
      },
      /**
       * The camera: behind the raft and above the river, looking down it at the next fifty metres — it keeps over
       * the water, so nothing of the canyon comes between. Before the start it looks back at the raft from in
       * front: the Cauldron and the great fall behind it; it comes round as the start is counted in.
       */
      camera: (cam, dt) => {
        const wait = st.wait > 0 ? st.wait : 0, back = 8.6 + st.vs * 0.22, behind = riverAt(course, Math.max(0.5, pose.s - back), q), ahead = riverAt(course, Math.min(course.length - 0.5, pose.s + 9 + st.vs * 0.6), {});
        const bx = behind.x - Math.cos(behind.yaw) * pose.u * 0.55, bz = behind.z + Math.sin(behind.yaw) * pose.u * 0.55, turn = smooth(3.4, 1.2, wait);
        // (in front of the raft, a little aside; then round behind it)
        const fx = pose.x + Math.sin(pose.ryaw) * 10 - Math.cos(pose.ryaw) * 6, fz = pose.z + Math.cos(pose.ryaw) * 10 + Math.sin(pose.ryaw) * 6;
        t.set(lerp(fx, bx, turn), lerp(pose.level + 3.2, Math.max(behind.y, pose.y) + 4.1 + st.vs * 0.07, turn), lerp(fz, bz, turn));
        if (!S.cam) S.cam = t.clone(); else S.cam.lerp(t, Math.min(1, dt * (st.swim > 0 ? 2.5 : 5.5)));
        t.set(lerp(pose.x, ahead.x - Math.cos(ahead.yaw) * pose.u * 0.3, turn * 0.8), lerp(pose.y + 1.6, lerp(pose.y, ahead.y, 0.6) + 0.9, turn), lerp(pose.z, ahead.z + Math.sin(ahead.yaw) * pose.u * 0.3, turn * 0.8));
        S.look.lerp(t, S.look.lengthSq() ? Math.min(1, dt * 7) : 1);
        cam.position.copy(S.cam);
        if (S.shake > 0) { S.shake = Math.max(0, S.shake - dt * 2.4); cam.position.x += (Math.random() - 0.5) * S.shake * 0.45; cam.position.y += (Math.random() - 0.5) * S.shake * 0.45; }
        cam.up.set(0, 1, 0); cam.lookAt(S.look);
        S.fov += (60 + 12 * clamp(st.vs / 9, 0, 1.2) + (st.air ? 6 : 0) - S.fov) * Math.min(1, dt * 3);
        return S.fov;
      },
      /** The run is over, or left: the player is let go at the gate on the beach. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x, this.gate.z, this.gate.yaw); session.close(); },
      close: () => { if (this.session === session) this.session = null; player.pitch = 0; player.roll = 0; this.mine.visible = false; this.paddle.visible = false; },
    };
    S.go = () => { S.gone = true; };
    this._S = S;
    this.session = session;
    session.step(0, player, false);
    return session;
  }

  /** What happened in a step of the run, told to who plays. */
  _tell(e, st, io, S) {
    const pose = raftPose(st, {});
    if (e.type === 'tick') io.play('tick');
    else if (e.type === 'go') { S.gone = true; io.play('start'); io.note('Paddle! The stream does the rest — steer early.', 2600); }
    else if (e.type === 'brace') io.play('jump', { volume: 0.35 });
    else if (e.type === 'rock') { io.play(e.braced ? 'land' : 'hit', { volume: e.braced ? 0.5 : 0.9 }); S.shake = e.braced ? 0.4 : 1; io.note(e.braced ? 'Braced!' : 'Knocked! Brace before a rock you cannot miss.', 1800); io.splash?.(pose.x, pose.level, pose.z, 3); }
    else if (e.type === 'bank') { io.play('land', { volume: 0.4 }); S.shake = Math.max(S.shake, 0.3); }
    else if (e.type === 'lip') io.play('whoosh', { volume: Math.min(1, 0.35 + e.h * 0.07) });
    else if (e.type === 'land') {
      io.play('splash', { volume: clamp(0.35 + e.h * 0.07, 0.3, 1) }); io.splash?.(pose.x, pose.level, pose.z, 3 + e.h * 0.8); S.shake = Math.max(S.shake, e.clean ? 0.25 + e.h * 0.05 : 0.9);
      if (e.h >= RAFT.fall.least) { if (e.clean) io.note(e.h > 5 ? 'Down the great fall!' : 'Braced — clean!', 1600); else if (!e.side || e.braced) { io.play('hit', { volume: 0.7 }); io.note(e.braced ? 'Sideways! Take the falls straight.' : 'Knocked! Press BRACE just before a fall.', 2200); } }
    } else if (e.type === 'wave') { io.play('splash', { volume: 0.6 }); S.shake = Math.max(S.shake, 0.5); if (e.clean) io.note('Through the great wave!', 1500); }
    else if (e.type === 'hole') { io.play('fail', { volume: 0.5 }); io.note('Held by the boil — paddle hard!', 2400); }
    else if (e.type === 'free') { io.play(e.punched ? 'boost' : 'squirt', { volume: 0.5 }); if (e.punched) io.note('Punched through!', 1400); }
    else if (e.type === 'shoal') { io.play('land', { volume: 0.4 }); io.note('Aground on the gravel — keep to the deep water.', 2200); }
    else if (e.type === 'over') { io.play('splash'); io.play('fail', { volume: 0.7 }); S.shake = 1.1; io.splash?.(pose.x, pose.level, pose.z, 7); io.note(e.why === 'great' ? 'Over! The great fall must be braced.' : e.why === 'wave' ? 'Over! Take a great wave head on.' : e.why === 'rock' ? 'Over! Knocked twice.' : 'Over! Take the falls straight.', 2600); }
    else if (e.type === 'back') { io.play('respawn'); S.cam = null; S.look.set(0, 0, 0); io.note(e.on ? 'Back in the raft — put in a little further down.' : `Back in the raft at ${this.course.flags[e.flag].name}.`, 2400); }
    else if (e.type === 'flag') { if (!this.course.flags[e.n].last) { io.play('checkpoint', { volume: 0.6 }); io.note(`${this.course.flags[e.n].name}: saved.`, 1800); } }
    else if (e.type === 'finish') { io.play('victory'); io.note(`The sea! ${formatTime(e.time)}`, 4200); }
  }

  /** Every frame, in every browser that has the game on: what is far is drawn plainly or not at all; a raft is put under whoever else is on the river. */
  update(dt, time, camera) {
    if (!camera || !this._cull) return;
    const c = camera.position;
    for (const p of this._pieces) {
      const near = Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z) - p.r < this._near;
      if (p.near.visible !== near) { p.near.visible = near; p.far.visible = !near; }
    }
    this._cull(c);
    // ---- the others: whoever plays the river now, wherever its robot is on it
    let used = 0;
    const who = this.crowd?.of() || [], at = this._at || (this._at = {});
    for (const m of who) {
      const p = m.peer;
      if (used >= this.others.length || !p || !p.visible || p.far || p.hidden) continue;
      const on = riverNear(this.course, p.x, p.z, 16, at);
      if (!on) continue;
      const r = riverAt(this.course, on.s, this._r || (this._r = {})), over = m.d?.[1] > 0, air = Math.max(0, p.y - 0.36 - r.y);
      this._place(this.others[used++], p.x + Math.sin(p.yaw) * 0.2, (over ? r.y : Math.max(r.y, p.y - 0.36)) + 0.02, p.z + Math.cos(p.yaw) * 0.2, p.yaw, Math.atan(r.slope) * 0.9 + Math.min(0.6, air * 0.2), 0, over);
    }
    for (let i = used; i < this.others.length; i++) this.others[i].visible = false;
  }
}

export { RAFT };
