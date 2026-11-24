// The Great Oak ("Out on a Limb"): what is seen of the climb and how it is climbed. The way up is in route.js
// (worked out by tree.js), the tree itself is the old tree of the forest, grown and moved (giant.js); here is
// built what is added to it — a leader up to the top, the branches one walks along (dead ones, bare and grey,
// that break under the feet and grow back), the bracket fungi, three nets with a deck round the stem, the
// crow's nest and its bell, the plate and the gate at the foot — and the climb is timed.
//
// Like the other games, it knows nothing about the keyboard, the network or the leaderboards: what happens is
// told through `events` ({ line(text | null), note(text, ms), sound(name, options), started(), finished(ms, clean) }).
import * as THREE from 'three';
import { Parts } from '../../src/world/props/MeshBuilder.js';
import { LAYER } from '../../src/render/Shadows.js';
import { distanceCuller } from '../../src/world/props/StaticBatch.js';
import { makeMaterial, GLSL_COMMON, GLSL_SHADOW, GLSL_LIGHTING, GLSL_SURFACE } from '../../src/render/globals.js';
import { canvasBoard } from '../../src/world/zones/games/Boards.js';
import { formatTime } from '../../src/world/zones/games/course.js';
import { OAK, holdHeight, netHeight, readRoute } from './tree.js';
import { ROUTE } from './route.js';
import { growTree, sameModel, prune } from './giant.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// The four parts of the climb, from the ground up: their names, the colour of their fungi and of their flag.
const PARTS = [
  { name: 'The Trunk', cap: [1.25, 0.55, 0.14], band: [1.5, 0.95, 0.4], flag: [0.3, 1.25, 0.35] },
  { name: 'The Great Fork', cap: [0.95, 0.3, 0.16], band: [1.35, 0.7, 0.35], flag: [1.7, 1.35, 0.2] },
  { name: 'The Crown', cap: [1.2, 0.85, 0.2], band: [1.5, 1.3, 0.6], flag: [1.75, 0.75, 0.15] },
  { name: "The Crow's Nest", cap: [1.15, 1.05, 0.9], band: [1.5, 1.45, 1.3], flag: [1.9, 1.45, 0.25] },
];
const ROPE = [1.25, 1.05, 0.72], CREAM = [1.5, 1.4, 1.15];

// ---------------------------------------------------------------------------------------------------- shaders

// Bark, as the trees of the forest wear it (treeShader.js), on wood that does not sway: with moss on what
// faces the sky (the living branches), a tint (the dead ones are grey), paler where it has just broken.
const BARK_VERT = /* glsl */ `
${GLSL_COMMON}
in float aTone;
out vec2 vUv;
out vec3 vWorld;
out vec3 vNormalW;
out float vTone;
void main() {
  vUv = uv;
  vTone = aTone;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const BARK_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_SHADOW}
${GLSL_LIGHTING}
${GLSL_SURFACE}
uniform sampler2D uBarkTex;
uniform sampler2D uBarkNrm;
uniform vec3 uTint;
uniform float uMoss;
in vec2 vUv;
in vec3 vWorld;
in vec3 vNormalW;
in float vTone;
void main() {
  vec3 albedo = texture(uBarkTex, vUv).rgb;
  vec3 Ng = normalize(vNormalW);
  if (!gl_FrontFacing) Ng = -Ng;
  vec3 N = Ng;
#if QUALITY > 0
  // tangent frame from screen-space derivatives (no stored tangents)
  vec3 dp1 = dFdx(vWorld), dp2 = dFdy(vWorld);
  vec2 du1 = dFdx(vUv), du2 = dFdy(vUv);
  vec3 dp2p = cross(dp2, N), dp1p = cross(N, dp1);
  vec3 T = dp2p * du1.x + dp1p * du2.x, B = dp2p * du1.y + dp1p * du2.y;
  float inv = inversesqrt(max(dot(T, T), dot(B, B)) + 1e-12);
  vec3 nt = texture(uBarkNrm, vUv).xyz;
  vec2 d = (nt.xy * 2.0 - 1.0) * 1.3;
  N = normalize(N + (T * d.x + B * d.y) * inv);
  albedo *= 0.75 + 0.5 * nt.z;
#endif
  albedo *= uTint * mix(1.0, 2.6, saturate(vTone - 1.0));
  // moss where the wood faces the sky: it is what one walks on
  float up = smoothstep(0.5, 0.92, Ng.y) * uMoss * (0.55 + 0.45 * texture(uBarkTex, vUv * 0.37).g * 2.0);
  albedo = mix(albedo, vec3(0.11, 0.2, 0.045), saturate(up) * 0.8);
  vec3 Vw = normalize(cameraPosition - vWorld);
  float shadow = sunShadow(vWorld, Ng);
  Surface s;
  s.albedo = albedo; s.N = N; s.Ng = Ng; s.rough = 0.85; s.ao = min(vTone, 1.0); s.spec = 0.1; s.sss = 0.0;
  vec3 col = shadeSurface(s, vWorld, Vw, shadow);
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col), 1.0);
}
`;

// A net: ropes round and ropes across, drawn rather than built — and never so thin that they flicker.
const NET_VERT = /* glsl */ `
${GLSL_COMMON}
out vec2 vUv;
out vec3 vWorld;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const NET_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_SHADOW}
${GLSL_LIGHTING}
uniform vec3 uRope;
in vec2 vUv;
in vec3 vWorld;
float rope(float x, float thick) {
  float d = abs(fract(x + 0.5) - 0.5), w = max(fwidth(x), 1e-4);
  // (as thick as it is, or as a pixel when it is thinner than one: then fainter)
  return saturate((thick - d) / w + 0.5) * min(1.0, (2.0 * thick) / w + 0.25);
}
void main() {
  float a = max(rope(vUv.x, 0.045), rope(vUv.y, 0.045));
  if (a < 0.02) discard;
  vec3 col = uRope * (hemiAmbient(vec3(0.0, 1.0, 0.0)) + uSunColor * 0.55);
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col), a * 0.92);
}
`;

// ------------------------------------------------------------------------------------------------------- wood

/** Tubes of bark, one after the other in one mesh: see tube(). */
class Wood {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.tone = []; this.idx = []; this.n = 0; }

  /**
   * A limb along `pts` ([{ x, y, z }]). section(i) → { a, b (half its width, half its height), flat (how
   * square its section is: 2 round, 3 flat on top), drop (how far under the line its middle is: b, when the
   * line is where one walks), tone }. `repeat`: how many times the bark goes round.
   */
  tube(pts, section, sides = 10, repeat = 2) {
    const n = pts.length, t = V(0, 0, 0), side = V(1, 0, 0), up = V(0, 1, 0), c = V(0, 0, 0), q = V(0, 0, 0), nr = V(0, 0, 0);
    let prev = -1, v = 0, ref = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], p = pts[i], s = section(i);
      t.set(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
      // across: level, when the limb is not upright; then what is left is "up"
      if (Math.abs(t.y) < 0.97) side.set(-t.z, 0, t.x).normalize(); else side.addScaledVector(t, -side.dot(t)).normalize();
      up.crossVectors(side, t).normalize();
      if (up.y < 0 && Math.abs(t.y) < 0.97) up.negate();
      if (i > 0) v += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z) * (repeat / (TAU * ref));
      else ref = Math.max(0.12, s.a);
      c.set(p.x, p.y, p.z).addScaledVector(up, -(s.drop || 0));
      const e = 2 / (s.flat || 2), first = this.n;
      for (let k = 0; k <= sides; k++) {
        const ang = (k / sides) * TAU, cs = Math.cos(ang), sn = Math.sin(ang);
        const lx = Math.sign(cs) * Math.abs(cs) ** e * s.a, ly = Math.sign(sn) * Math.abs(sn) ** e * s.b;
        q.copy(c).addScaledVector(side, lx).addScaledVector(up, ly);
        nr.set(0, 0, 0).addScaledVector(side, (Math.sign(cs) * Math.abs(cs) ** (2 - e)) / Math.max(s.a, 1e-3)).addScaledVector(up, (Math.sign(sn) * Math.abs(sn) ** (2 - e)) / Math.max(s.b, 1e-3));
        if (nr.lengthSq() < 1e-10) nr.copy(up); else nr.normalize();
        this.pos.push(q.x, q.y, q.z); this.nrm.push(nr.x, nr.y, nr.z); this.uv.push((k / sides) * repeat, v); this.tone.push(s.tone ?? 1);
        this.n++;
      }
      if (prev >= 0) for (let k = 0; k < sides; k++) this.idx.push(prev + k, first + k, prev + k + 1, prev + k + 1, first + k, first + k + 1);
      prev = first;
    }
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aTone', new THREE.Float32BufferAttribute(this.tone, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** The line of a branch from its root to its tip: [{ x, y, z, e (how far from the root) }], and its length. */
function fromRoot(h) {
  const line = h.root === 'start' ? h.line : h.line.slice().reverse();
  return line.map((p) => ({ x: p.x, y: p.y, z: p.z, e: h.root === 'start' ? p.d : h.len - p.d }));
}

/**
 * Draws a branch into `wood`: from `from` to `to` metres along it (all of it by default), relative to
 * `origin`. Its top is where one walks; a collar where it leaves the stem, a knot at its tip when one lands
 * there, a round end. `ends`: [pale at the start, pale at the end] (where it has broken).
 */
function drawBranch(wood, h, { from = 0, to = Infinity, origin = null, broken = [false, false] } = {}) {
  const all = fromRoot(h), len = h.len, K = h.knot ? h.knot + 0.1 : 0, hv = h.hw + 0.13;
  const half = (e) => {
    let a = hv * (1 + 0.5 * Math.exp(-e / 0.6)) * (1 - 0.1 * (e / len));
    if (K && len - e < K) a = Math.max(a, Math.sqrt(Math.max(0, K * K - (len - e) ** 2)));
    return a;
  };
  const pts = [], secs = [];
  // (`mid`: a closing ring — where it broke — is drawn in to the middle of the wood, not to its top)
  const put = (p, a, tone, flat = 2.9, mid = null) => { pts.push(origin ? { x: p.x - origin.x, y: p.y - origin.y, z: p.z - origin.z } : p); const b = clamp(0.26 + 0.3 * a, 0.02, 0.5) * Math.min(1, a / 0.2); secs.push({ a: Math.max(a, 0.012), b: Math.max(b, 0.012), flat, drop: mid ?? b, tone }); };
  const thick = (e) => { const a = half(e); return clamp(0.26 + 0.3 * a, 0.02, 0.5) * Math.min(1, a / 0.2); };
  const inside = all.filter((p) => p.e >= from - 1e-6 && p.e <= to + 1e-6);
  if (inside.length < 2) return wood;
  if (broken[0]) put(inside[0], 0.01, 1.9, 2, thick(inside[0].e));
  inside.forEach((p, k) => put(p, half(p.e), (broken[0] && k === 0) || (broken[1] && k === inside.length - 1) ? 1.9 : lerp(0.72, 1, clamp(p.e / 1.2, 0, 1))));
  const last = inside[inside.length - 1], before = inside[inside.length - 2];
  if (broken[1]) put(last, 0.01, 1.9, 2, thick(last.e));
  else if (to >= len - 1e-6) {
    // the end: rounded off, beyond where one stands (round the knot, when there is one)
    const dx = last.x - before.x, dy = last.y - before.y, dz = last.z - before.z, dl = Math.hypot(dx, dy, dz) || 1, R = K || half(len);
    for (const f of [0.35, 0.65, 0.86, 0.97, 1]) put({ x: last.x + (dx / dl) * R * f, y: last.y + (dy / dl) * R * f, z: last.z + (dz / dl) * R * f }, Math.max(0.012, R * Math.sqrt(1 - f * f)), 1, 2.4);
  }
  return wood.tube(pts, (i) => secs[i], 10, 2);
}

// ------------------------------------------------------------------------------------------------------ the oak

export class Oak {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.course = readRoute(ROUTE);
    this.group = new THREE.Group();
    this.group.name = 'oak';
    this.events = {};
    this.run = { state: 'idle', t: 0, clean: true, deck: 0 };
    this.best = 0; // the best time of this visitor, ms (see setBest)
    this.dead = []; // the branches that break: { hold, pivot, mesh, state, t, ... }
  }

  /** Where the gate is (and which way one faces, arriving): for whoever wants to be put there. */
  get gate() { const g = OAK.gate; return { x: OAK.at.x + Math.sin(g.yaw) * g.away, z: OAK.at.z + Math.cos(g.yaw) * g.away, yaw: g.yaw + Math.PI }; }

  build() {
    const world = this.world, course = this.course;
    // ---- the tree itself: the old tree, twice as tall, twenty metres towards the mountain, pruned where one climbs
    const giant = growTree(world, OAK.species, OAK.from.x, OAK.from.z, { toX: OAK.at.x, toZ: OAK.at.z, scale: OAK.scale, variant: OAK.variant, sink: OAK.sink });
    if (!giant) throw new Error('The Great Oak: the old tree is not where the layout says');
    this.giant = giant;
    this.pruned = sameModel(giant.model, ROUTE.model);
    if (this.pruned) prune(giant.model, ROUTE.cut, ROUTE.cards);
    else console.warn('[oak] the old tree is not the tree the course was worked out for: run lab/oak/oak-course.mjs again');
    const base = (this.base = V(giant.x, giant.y, giant.z));
    this.group.position.copy(base);
    this.ground = base.y + course.ground;
    this.top = { x: base.x + course.top.x, y: base.y + course.top.y, z: base.z + course.top.z, r: course.top.r };
    {
      const s = course.start, x = base.x + s.x, z = base.z + s.z;
      this.start = { x, z, y: this.data.heightAt(x, z), r: s.r };
    }
    const mats = world.materials, cast = [LAYER.STATIC_CASTER];
    this._wood(giant, cast);
    this._leaves(giant);
    this._fungi(mats, cast);
    this._decks(mats, cast);
    this._nets(mats);
    this._foot(mats, cast);
    this._solid();
    this.group.updateMatrixWorld(true);
    const far = world.engine.tier.phone ? 0.7 : 1;
    this._cull = distanceCuller(this.group, [[/^oak-(bark|decks)/, 420 * far], [/^oak-(dead|leaves|fungi)/, 240 * far], [/^oak-net/, 300 * far], [/./, 200 * far]]);
    world.scene.add(this.group);
    return this;
  }

  // ---- bark: the leader, the branches

  _wood(giant, cast) {
    const course = this.course, src = giant.species.mats.wood.m.uniforms;
    const bark = (tint, moss) => makeMaterial({ uniforms: { uBarkTex: { value: src.uBarkTex.value }, uBarkNrm: { value: src.uBarkNrm.value }, uTint: { value: new THREE.Vector3(...tint) }, uMoss: { value: moss } }, vertexShader: BARK_VERT, fragmentShader: BARK_FRAG, side: THREE.DoubleSide });
    this.mats = { live: bark([1, 1, 1], 1), dead: bark([1.5, 1.44, 1.32], 0) };
    const live = new Wood(), stubs = new Wood();
    // the leader: the stem above the trunk, up to the mast of the crow's nest
    live.tube(course.leader, (i) => ({ a: course.leader[i].r, b: course.leader[i].r, tone: 1 }), 12, 4);
    for (const h of course.holds) {
      if (h.kind !== 'branch') continue;
      if (!h.fragile) { drawBranch(live, h); continue; }
      // dead wood: what stays on the tree when it breaks (a stub), and what falls: a mesh of its own, hinged at the break
      // (it breaks just outside the bark)
      const line = fromRoot(h), crack = (h.root === 'start' ? h.pts[0].d : h.len - h.pts[h.pts.length - 1].d) + 0.35;
      const at = line.find((p) => p.e >= crack) || line[1], next = line[Math.min(line.length - 1, line.indexOf(at) + 1)];
      drawBranch(stubs, h, { to: at.e, broken: [false, true] });
      const wood = drawBranch(new Wood(), h, { from: at.e, origin: at, broken: [true, false] });
      const mesh = new THREE.Mesh(wood.build(), this.mats.dead);
      mesh.name = `oak-dead-${h.i}`;
      mesh.layers.enable(LAYER.DYNAMIC_CASTER);
      const pivot = new THREE.Group();
      pivot.position.set(at.x, at.y, at.z);
      pivot.add(mesh);
      this.group.add(pivot);
      // (it falls turning about the level line across it at the break)
      const hx = next.x - at.x, hz = next.z - at.z, hl = Math.hypot(hx, hz) || 1;
      this.dead.push({ hold: h, pivot, mesh, axis: V(hz / hl, 0, -hx / hl), state: 'sound', t: 0, floor: 0, y0: at.y, gone: false });
    }
    const add = (wood, mat, name) => { const m = new THREE.Mesh(wood.build(), mat); m.name = name; for (const l of cast) m.layers.enable(l); this.group.add(m); return m; };
    add(live, this.mats.live, 'oak-bark');
    if (stubs.n) add(stubs, this.mats.dead, 'oak-bark-stubs');
    for (const d of this.dead) d.floor = this._floorUnder(d.hold.y);
  }

  /** The net (or the ground) under a height: where what falls from there ends. */
  _floorUnder(y) {
    let f = this.course.ground;
    for (const n of this.course.nets) if (n.y < y - 1 && n.y > f) f = n.y;
    return f;
  }

  // ---- leaves on the living branches: the leaves of the tree itself, in small tufts beside and under the way

  _leaves(giant) {
    const forest = this.world.forest, sp = giant.species, rnd = mulberry32(4711);
    const P = [], N = [], U = [], C = [], L = [], I = [], twigs = new Wood();
    let n = 0;
    const card = (x, y, z, size) => {
      const tile = (rnd() * 4) | 0, u0 = (tile % 2) * 0.5, v0 = Math.floor(tile / 2) * 0.5, pad = 0.004, roll = rnd() * TAU, c = Math.cos(roll), s = Math.sin(roll);
      const uvs = [[u0 + pad, v0 + 0.5 - pad], [u0 + 0.5 - pad, v0 + 0.5 - pad], [u0 + 0.5 - pad, v0 + pad], [u0 + pad, v0 + pad]], leaf = [0, rnd(), lerp(0.7, 1, rnd()), rnd()];
      [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].forEach(([cx, cy], k) => {
        P.push(x, y, z); N.push(0, 1, 0); U.push(...uvs[k]); C.push((cx * c - cy * s) * size, (cx * s + cy * c) * size, 0); L.push(...leaf);
      });
      I.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4;
    };
    for (const h of this.course.holds) {
      if (h.kind !== 'branch' || h.fragile) continue;
      const line = fromRoot(h);
      // two or three tufts along it, on the outside of its bends and under where one walks
      for (const f of h.len > 6 ? [0.3, 0.55, 0.8] : [0.36, 0.72]) {
        const k = clamp(Math.round(f * (line.length - 1)), 1, line.length - 2), p = line[k], a = line[k - 1], b = line[k + 1];
        const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1, side = (rnd() < 0.5 ? -1 : 1), sx = (-tz / tl) * side, sz = (tx / tl) * side;
        const out = h.hw + lerp(1.0, 1.5, rnd()), ex = p.x + sx * out, ey = p.y - lerp(0.55, 0.95, rnd()), ez = p.z + sz * out;
        twigs.tube([{ x: p.x + sx * h.hw * 0.7, y: p.y - 0.28, z: p.z + sz * h.hw * 0.7 }, { x: lerp(p.x, ex, 0.6) + sx * 0.1, y: p.y - 0.3, z: lerp(p.z, ez, 0.6) + sz * 0.1 }, { x: ex, y: ey + 0.25, z: ez }], (i) => ({ a: [0.09, 0.06, 0.025][i], b: [0.09, 0.06, 0.025][i], tone: 0.85 }), 5, 1);
        card(ex, ey, ez, lerp(1.9, 2.5, rnd()));
        card(ex + sx * 0.7 + (rnd() - 0.5) * 0.8, ey - 0.25 - rnd() * 0.3, ez + sz * 0.7 + (rnd() - 0.5) * 0.8, lerp(1.6, 2.2, rnd()));
      }
    }
    if (!n) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    geo.setAttribute('aCorner', new THREE.Float32BufferAttribute(C, 3));
    geo.setAttribute('aLeaf', new THREE.Float32BufferAttribute(L, 4));
    geo.setIndex(I);
    // (the forest's own leaf shader: it places its cards from the tree they belong to — here, the foot of the oak)
    const a2c = !!forest.a2c, mat = forest._mkLeaf(sp.sp, sp.tex, 2, a2c ? { USE_A2C: 1 } : {}, { alphaToCoverage: a2c });
    const depth = forest._mkLeaf(sp.sp, sp.tex, 2, { DEPTH_ONLY: 1 });
    depth.colorWrite = false;
    for (const m of [mat, depth]) m.uniforms.uSway.value = 0;
    const im = new THREE.InstancedMesh(geo, mat, 1);
    im.setMatrixAt(0, new THREE.Matrix4().makeTranslation(this.base.x, this.base.y, this.base.z));
    const tone = forest.all.find((t) => t.si === sp.si && Math.hypot(t.x - this.base.x, t.z - this.base.z) < 0.01)?.rgb || [1, 1, 1];
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(tone), 3);
    im.frustumCulled = false;
    im.name = 'oak-leaves';
    im.userData.depthMaterial = depth;
    im.layers.enable(LAYER.STATIC_CASTER);
    geo.boundingSphere = new THREE.Sphere(V(0, 35, 0), 40);
    this.leaves = im;
    this.world.scene.add(im); // (not in the group: its place is in its one instance)
    const m = new THREE.Mesh(twigs.build(), this.mats.live);
    m.name = 'oak-leaves-twigs';
    this.group.add(m);
  }

  // ---- bracket fungi: the steps

  _fungi(mats, cast) {
    const parts = new Parts(), b = parts.get('matte');
    for (const h of this.course.holds) {
      if (h.kind !== 'fungus') continue;
      const part = PARTS[this._part(h.y)], r = h.r, T = 0.2 + r * 0.16, k = 0.92 + 0.16 * ((h.i * 7) % 5) / 4;
      b.place(h.x, h.y, h.z, h.i * 1.7);
      // pale underneath, thick in the middle, a rounded edge; rings on top, as they grow
      b.tint(...CREAM, 1).lathe([[0.0, -T], [r * 0.5, -T * 0.85], [r * 0.9, -T * 0.42], [r * 1.0, -0.09], [r * 0.985, -0.03], [r * 0.94, 0.0]], 14);
      const rings = [0.94, 0.8, 0.62, 0.4, 0.2, 0];
      for (let q = 0; q + 1 < rings.length; q++) { const c = q % 2 ? part.band : part.cap; b.tint(c[0] * k, c[1] * k, c[2] * k, 1).lathe([[r * rings[q], 0.0], [r * rings[q + 1], 0.0]], 14); }
      b.pop();
    }
    this.group.add(parts.toMeshes(mats, { name: 'oak-fungi', layers: cast }));
  }

  /** Which part of the climb a height is in (0..3). */
  _part(y) { let k = 0; for (const n of this.course.nets) if (y > n.y + 0.05) k++; return k; }

  // ---- the decks round the stem at each net, the crow's nest at the top

  _decks(mats, cast) {
    const parts = new Parts(), deck = parts.get('woodDeck'), dark = parts.get('woodDark'), paint = parts.get('paint'), cloth = parts.get('doubleSided'), matte = parts.get('matte');
    const P = (h, a, r, dy = 0) => V(h.x + Math.sin(a) * r, h.y + dy, h.z + Math.cos(a) * r);
    this.rails = [];
    for (const h of this.course.holds) {
      if (h.kind !== 'deck') continue;
      const nest = h.level === 4, part = PARTS[h.level - 1], n = 40, w = h.gap[1] - h.gap[0];
      const open = (a) => ((((a - h.gap[0]) % TAU) + TAU) % TAU) < w;
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU, mid = (a0 + a1) / 2;
        // boards round the stem; none over the steps that come up through it
        const r0 = open(mid) ? h.r0 + 1.75 : h.r0, tone = 0.9 + 0.2 * ((k * 5) % 7) / 6;
        if (r0 >= h.r1 - 0.05) continue;
        deck.tint(1.15 * tone, 1.0 * tone, 0.8 * tone, 1);
        deck.quad(P(h, a0, r0), P(h, a0, h.r1), P(h, a1, h.r1), P(h, a1, r0), { tile: 1.2 });
        deck.quad(P(h, a1, r0, -0.12), P(h, a1, h.r1, -0.12), P(h, a0, h.r1, -0.12), P(h, a0, r0, -0.12), { tile: 1.2 });
        deck.quad(P(h, a0, h.r1, -0.12), P(h, a1, h.r1, -0.12), P(h, a1, h.r1), P(h, a0, h.r1), { tile: 1.2 });
        if (r0 > h.r0) deck.quad(P(h, a1, r0, -0.12), P(h, a0, r0, -0.12), P(h, a0, r0), P(h, a1, r0), { tile: 1.2 });
      }
      // what holds it: struts from the stem
      for (let k = 0; k < 6; k++) { const a = h.gap[1] + 0.5 + (k / 6) * (TAU - w - 1); dark.tint(1.0, 0.9, 0.75, 1).rod(P(h, a, h.r0 + 0.1, -1.5), P(h, a, h.r1 - 0.25, -0.12), 0.06, 5); }
      if (nest) {
        // the crow's nest: a wall of staves and two hoops, open where one comes up; a bell; a flag at the mast
        const m = 26;
        for (let k = 0; k < m; k++) {
          const a = (k / m) * TAU;
          if (open(a) || open(a + 0.12) || open(a - 0.12)) continue;
          dark.tint(1.15, 1.0, 0.8, 1).rod(P(h, a, h.r1 - 0.06), P(h, a, h.r1 + 0.05, 1.0), 0.05, 5);
          this.rails.push([h.x + Math.sin(a) * (h.r1 - 0.02), h.z + Math.cos(a) * (h.r1 - 0.02)]);
        }
        for (const dy of [0.55, 1.0]) for (let k = 0; k < 40; k++) {
          const a0 = (k / 40) * TAU, a1 = ((k + 1) / 40) * TAU;
          if (!open(a0) && !open(a1)) matte.tint(...ROPE, 1).rod(P(h, a0, h.r1 + 0.02, dy), P(h, a1, h.r1 + 0.02, dy), 0.03, 4);
        }
        const bell = P(h, h.gap[0] + Math.PI, h.r0 + 0.75, 1.75);
        paint.tint(1.0, 0.75, 0.15, 1).place(bell.x, bell.y, bell.z).lathe([[0.36, -0.52], [0.31, -0.38], [0.2, -0.08], [0.06, 0.02], [0.0, 0.03]], 10).pop();
        dark.tint(1.1, 1.0, 0.85, 1).rod(V(h.x, bell.y + 0.32, h.z), V(bell.x, bell.y + 0.32, bell.z), 0.045, 5).rod(V(bell.x, bell.y + 0.32, bell.z), V(bell.x, bell.y, bell.z), 0.02, 4);
        this.bell = V(bell.x, bell.y, bell.z);
        const topY = this.course.leader[this.course.leader.length - 1].y - h.y, st = this.course.stem(h.y + topY);
        cloth.tint(...part.flag, 1).tri(V(st.x, h.y + topY - 0.1, st.z), V(st.x, h.y + topY - 1.0, st.z), V(st.x + 1.9, h.y + topY - 0.55, st.z + 0.3));
      } else {
        // a pennant at its edge: how high one is, from afar
        const a = h.gap[0] + Math.PI, q = P(h, a, h.r1 - 0.2);
        paint.tint(0.9, 0.9, 0.88, 1).rod(q, V(q.x, q.y + 2.6, q.z), 0.04, 6);
        cloth.tint(...part.flag, 1).tri(V(q.x, q.y + 2.6, q.z), V(q.x, q.y + 2.0, q.z), V(q.x + Math.cos(a) * 1.1, q.y + 2.3, q.z - Math.sin(a) * 1.1));
      }
    }
    this.group.add(parts.toMeshes(mats, { name: 'oak-decks', layers: cast }));
  }

  // ---- the nets

  _nets(mats) {
    const parts = new Parts(), matte = parts.get('matte'), glow = parts.get('glow');
    this.mats.net = makeMaterial({ uniforms: { uRope: { value: new THREE.Vector3(0.4, 0.32, 0.2) } }, vertexShader: NET_VERT, fragmentShader: NET_FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: false });
    for (const n of this.course.nets) {
      const A = 72, R = 10, pos = [], uv = [], idx = [], spokes = 96, cell = 0.42;
      for (let i = 0; i <= A; i++) for (let j = 0; j <= R; j++) {
        const a = (i / A) * TAU, r = lerp(n.r0, n.r1, j / R), x = n.x + Math.sin(a) * r, z = n.z + Math.cos(a) * r;
        pos.push(x, netHeight(n, x, z) ?? n.y, z); uv.push((i / A) * spokes, r / cell);
      }
      for (let i = 0; i < A; i++) for (let j = 0; j < R; j++) { const a = i * (R + 1) + j, b = a + R + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, this.mats.net);
      mesh.name = `oak-net-${n.level}`;
      mesh.renderOrder = 4;
      this.group.add(mesh);
      // its rim: a thick rope — held up, like the stones of the other climb, by a little light
      for (let k = 0; k < A; k++) { const a0 = (k / A) * TAU, a1 = ((k + 1) / A) * TAU; matte.tint(...ROPE, 1).rod(V(n.x + Math.sin(a0) * n.r1, n.y, n.z + Math.cos(a0) * n.r1), V(n.x + Math.sin(a1) * n.r1, n.y, n.z + Math.cos(a1) * n.r1), 0.07, 5); }
      for (let k = 0; k < 10; k++) { const a = ((k + 0.5) / 10) * TAU; glow.tint(0.25, 0.6, 1.0, 1).place(n.x + Math.sin(a) * n.r1, n.y - 0.08, n.z + Math.cos(a) * n.r1).lathe([[0.0, -0.55], [0.13, 0.0]], 5).pop(); }
    }
    this.group.add(parts.toMeshes(mats, { name: 'oak-net-rims', layers: [] }));
  }

  // ---- at the foot: the plate one leaves, the gate, the board

  _foot(mats, cast) {
    const parts = new Parts(), paint = parts.get('paint'), base = this.base, s = this.start, gy = (x, z) => this.data.heightAt(x, z) - base.y;
    const sx = s.x - base.x, sz = s.z - base.z, sy = s.y - base.y;
    paint.tint(1.0, 0.75, 0.12, 1).cylinder(sx, sy - 0.05, sz, s.r, s.r, 0.09, 16);
    paint.tint(0.2, 0.55, 0.16, 1).cylinder(sx, sy - 0.05, sz, s.r * 0.7, s.r * 0.7, 0.1, 16);
    paint.tint(0.97, 0.95, 0.9, 1).cylinder(sx, sy - 0.05, sz, s.r * 0.38, s.r * 0.38, 0.11, 12);
    // the gate: two striped posts, a sign across
    const g = this.gate, gx = g.x - base.x, gz = g.z - base.z, ax = Math.cos(OAK.gate.yaw), az = -Math.sin(OAK.gate.yaw);
    this.posts = [];
    for (const side of [-1, 1]) {
      const px = gx + ax * side * 2.1, pz = gz + az * side * 2.1, py = gy(base.x + px, base.z + pz);
      for (let k = 0; k < 6; k++) paint.tint(k % 2 ? 0.92 : 0.2, k % 2 ? 0.9 : 0.5, k % 2 ? 0.86 : 0.14, 1).cylinder(px, py + k * 0.62 - 0.2, pz, 0.16, 0.16, 0.62, 10, { capTop: k === 5 });
      paint.tint(1.0, 0.75, 0.12, 1).place(px, py + 3.68, pz).lathe([[0.0, -0.16], [0.2, 0.0], [0.0, 0.2]], 8).pop();
      this.posts.push([base.x + px, base.z + pz]);
    }
    this.group.add(parts.toMeshes(mats, { name: 'oak-foot', layers: cast }));
    const sign = canvasBoard(1024, 192, (ctx, w, h) => {
      ctx.fillStyle = '#1f4a1a'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 10; ctx.strokeRect(12, 12, w - 24, h - 24);
      ctx.fillStyle = '#fff4d6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '700 84px Georgia, serif'; ctx.fillText(OAK.name.toUpperCase(), w / 2, h * 0.42);
      ctx.font = '600 30px Georgia, serif'; ctx.fillStyle = '#f2c14e'; ctx.fillText('TO THE TOP OF THE GREAT OAK, AGAINST THE CLOCK', w / 2, h * 0.8);
    }, 4.3, 0.8, { both: true });
    sign.mesh.position.set(gx, gy(g.x, g.z) + 3.25, gz);
    sign.mesh.rotation.y = OAK.gate.yaw;
    sign.mesh.name = 'oak-sign';
    this.group.add(sign.mesh);
    // a board beside the gate: what to know before going up, and one's best time
    this.board = canvasBoard(640, 512, (ctx, w, h) => this._drawBoard(ctx, w, h), 2.0, 1.6, { both: true });
    const bx = gx + ax * 4.4, bz = gz + az * 4.4, by = gy(base.x + bx, base.z + bz);
    this.board.mesh.position.set(bx, by + 1.75, bz);
    this.board.mesh.rotation.y = OAK.gate.yaw;
    this.board.mesh.name = 'oak-board';
    this.group.add(this.board.mesh);
    const legs = new Parts(), wood = legs.get('woodDark');
    for (const side of [-1, 1]) wood.tint(1.1, 0.95, 0.75, 1).box(bx + ax * side * 0.9 - 0.05, by - 0.2, bz + az * side * 0.9 - 0.05, bx + ax * side * 0.9 + 0.05, by + 2.6, bz + az * side * 0.9 + 0.05, { tile: 1 });
    this.group.add(legs.toMeshes(mats, { name: 'oak-board-legs', layers: cast }));
  }

  _drawBoard(ctx, w, h) {
    ctx.fillStyle = '#f6ecd2'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#1f4a1a'; ctx.lineWidth = 12; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#1f4a1a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 46px Georgia, serif'; ctx.fillText(OAK.place.toUpperCase(), w / 2, 62);
    ctx.font = '500 27px Georgia, serif'; ctx.fillStyle = '#3a2a16';
    const lines = [`${Math.round(this.course.height)} metres, from the plate to the bell.`, 'Leafy branches hold.', 'Bare, grey ones break: do not linger.', 'Three nets: a fall ends in the one below.'];
    lines.forEach((t, k) => ctx.fillText(t, w / 2, 138 + k * 44));
    ctx.fillStyle = '#1f4a1a'; ctx.fillRect(60, 322, w - 120, 4);
    ctx.font = '600 30px Georgia, serif'; ctx.fillText('YOUR BEST', w / 2, 366);
    ctx.font = '700 64px Georgia, serif'; ctx.fillStyle = this.best ? '#a3231a' : '#9a8c6c';
    ctx.fillText(this.best ? formatTime(this.best) : '– : – –', w / 2, 434);
  }

  /** The best time of this visitor (ms; 0: none yet), shown on the board at the gate. */
  setBest(ms) { this.best = ms || 0; this.board?.redraw(); }

  // ---- what is solid: the stem and the limbs one walks into, the holds and the nets one stands on

  _solid() {
    const col = this.world.collision, course = this.course, base = this.base;
    this._mine = []; // our round obstacles (for the camera: see _view)
    const post = (x, z, r, y0, y1) => { col.addCircle(base.x + x, base.z + z, r, base.y + y0, base.y + y1); this._mine.push(col.circles[col.circles.length - 1]); };
    // the stem, in slices: as thick as it is at each height (the least of it, where it is fluted)
    const end = course.top.y + 2.2;
    for (let y = -1.5; y < end; y += 1.5) {
      let r = 0;
      const c = course.stem(y + 0.75);
      for (const f of [0, 0.5, 1]) r = Math.max(r, course.stem(y + 1.5 * f).least);
      post(c.x, c.z, r * 0.98 + 0.04, y - 0.5, y + 1.5);
    }
    for (const [x, z, r, y0, y1] of ROUTE.posts) post(x, z, r, y0, y1);
    // (the wall of the crow's nest: one does not walk off the top)
    for (const [x, z] of this.rails) post(x, z, 0.16, course.top.y - 0.3, course.top.y + 1.25);
    for (const [x, z] of this.posts) col.addCircle(x, z, 0.26);
    const broken = new Map(this.dead.map((d) => [d.hold.i, d]));
    for (const h of course.holds) {
      const d = broken.get(h.i);
      col.addPlatform({
        clearance: 0.45,
        ...(h.kind === 'branch' ? { thick: 0.5 } : h.kind === 'fungus' ? { thick: 0.3 } : null),
        heightAt: (x, z) => { if (d && d.gone) return null; const y = holdHeight(h, x - base.x, z - base.z); return y === null ? null : y + base.y; },
      });
    }
    for (const n of course.nets) col.addPlatform({ clearance: 0.45, heightAt: (x, z) => { const y = netHeight(n, x - base.x, z - base.z); return y === null ? null : y + base.y; } });
  }

  /**
   * What hides the view, for the camera: the game asks its round obstacles without their height — the stem at
   * the foot of the tree would hide someone at the top. So only those at the height of the eye are left in.
   */
  _view(y) {
    const col = this.world.collision, band = Math.floor(y / 2); // (y: the height of whoever the camera looks at)
    if (col.bulky && col.bulky.oak === band && col.bulky.count === col.circles.length) return;
    const mine = new Set(this._mine);
    // (the eye is a little above whoever it looks at: what is in the way up to there counts)
    const list = col.circles.filter((c) => c[2] >= 0.9 && (!mine.has(c) || (y + 4.6 > c[3] && y - 0.8 < c[4])));
    list.oak = band; list.count = col.circles.length;
    col.bulky = list;
  }

  /** Is (x, z) at the tree: where the jetpack stays off, and one goes on foot? */
  near(x, z, by = 16) { return (x - this.base.x) ** 2 + (z - this.base.z) ** 2 < by * by; }

  // ---- every frame

  /** The climb: the clock from the plate to the bell, the dead wood under the feet, the nets. */
  tick(dt, player) {
    const p = player.pos, base = this.base, run = this.run, ev = this.events, course = this.course;
    const d = Math.hypot(p.x - base.x, p.z - base.z);
    this._wither(dt, player, d < 14);
    if (d < 60) this._view(p.y);
    if (d > 40) { if (run.state !== 'idle') { run.state = 'idle'; ev.line?.(null); } return; }
    if (d < 13 && player.riding) player.riding = false; // on foot only
    const cheating = player.cheat || player.gravity !== 1 || player.boost !== 1;
    const s = this.start, onPlate = player.grounded && Math.abs(p.y - s.y) < 0.4 && (p.x - s.x) ** 2 + (p.z - s.z) ** 2 < s.r * s.r;
    // falling into a net: it gives, and tells
    if (player.grounded && !this._wasGrounded && this._vy < -7) {
      const n = course.nets.find((q) => Math.abs(p.y - base.y - (netHeight(q, p.x - base.x, p.z - base.z) ?? 1e9)) < 0.05);
      if (n) { player.vel.y = Math.min(5.2, -this._vy * 0.32); player.grounded = false; ev.sound?.('land', { volume: 0.9, rate: 0.7 }); if (run.state === 'running') ev.note?.('Caught by the net.', 2200); }
    }
    this._wasGrounded = player.grounded; this._vy = player.vel.y;
    if (onPlate) {
      if (run.state !== 'ready') { run.state = 'ready'; run.t = 0; run.deck = 0; ev.line?.('Ready — the clock starts when you leave the plate'); }
      run.clean = !cheating;
      return;
    }
    if (run.state === 'ready') { run.state = 'running'; run.t = 0; ev.started?.(); }
    if (run.state !== 'running') return;
    run.t += dt;
    if (cheating || player.jet > 0) run.clean = false;
    ev.line?.(`${formatTime(run.t * 1000)}  ·  ${Math.max(0, p.y - this.ground).toFixed(0)} m${run.clean ? '' : '  ·  cheat on: no record'}`);
    if (!player.grounded) return;
    // a deck reached: said once a climb
    for (const h of course.holds) {
      if (h.kind !== 'deck' || h.level <= run.deck || Math.abs(p.y - base.y - h.y) > 0.05 || holdHeight(h, p.x - base.x, p.z - base.z) === null) continue;
      run.deck = h.level;
      if (h.level === 4) {
        run.state = 'done';
        ev.line?.(`Top reached in ${formatTime(run.t * 1000)}!`);
        ev.sound?.('bell');
        ev.finished?.(Math.round(run.t * 1000), run.clean);
      } else {
        ev.sound?.('checkpoint');
        ev.note?.(`${PARTS[h.level].name} — ${Math.round(h.y - course.ground)} m up. A fall from here on ends in this net.`, 4200);
      }
    }
  }

  /** The dead branches: one that is stood on creaks, breaks, falls — and grows back. */
  _wither(dt, player, close) {
    const p = player.pos, base = this.base, ev = this.events;
    for (const d of this.dead) {
      const h = d.hold;
      if (d.state === 'sound') {
        if (!close || !player.grounded) continue;
        const y = holdHeight(h, p.x - base.x, p.z - base.z);
        if (y === null || Math.abs(p.y - base.y - y) > 0.06) continue;
        d.state = 'creaking'; d.t = 0;
        ev.sound?.('drift', { volume: 0.7, rate: 0.55 });
        continue;
      }
      d.t += dt;
      if (d.state === 'creaking') {
        // it shakes, more and more
        const k = d.t / h.fragile;
        d.pivot.quaternion.setFromAxisAngle(d.axis, Math.sin(d.t * 46) * 0.012 * (0.4 + k) + 0.03 * k * k);
        if (d.t >= h.fragile) { d.state = 'falling'; d.t = 0; d.gone = true; ev.sound?.('whack', { volume: 1, rate: 0.6 }); }
      } else if (d.state === 'falling') {
        // down it goes, turning about the break, to the net (or the ground) below
        const fall = 0.5 * 11 * d.t * d.t;
        d.pivot.quaternion.setFromAxisAngle(d.axis, Math.min(1.5, 0.03 + 2.2 * d.t * d.t));
        d.pivot.position.y = d.y0 - Math.max(0, fall - 0.4);
        if (d.pivot.position.y < d.floor - 1 || d.t > 2.6) { d.state = 'gone'; d.t = 0; d.pivot.visible = false; }
      } else if (d.state === 'gone') {
        if (d.t >= OAK.back) { d.state = 'growing'; d.t = 0; d.pivot.visible = true; d.pivot.position.y = d.y0; d.pivot.quaternion.identity(); d.pivot.scale.setScalar(0.02); }
      } else if (d.state === 'growing') {
        const k = Math.min(1, d.t / 0.7);
        d.pivot.scale.setScalar(Math.max(0.02, k * k * (3 - 2 * k)));
        if (k >= 1) { d.state = 'sound'; d.gone = false; d.pivot.scale.setScalar(1); }
      }
    }
  }

  update(dt, time, camera) {
    this._cull(camera.position);
    if (this.leaves) this.leaves.visible = camera.position.distanceTo(this.base) < 320;
  }
}
