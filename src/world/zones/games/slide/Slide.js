// The water slide ("Mostly Down"): what is seen of it and how it is ridden. The line it follows is in
// track.js, the way one goes down it in ride.js; here it is built — the trough in bands of colour, narrow
// here, opened out there, the pipe that runs beside its long pool, the water that runs down it and stands in
// its pools, the whirlpools that turn in them, the rolls, the arms and the blocks that lie or move in it, the
// propellers and the buffers of the long pool, the ramps at the lips of its gaps, the falls of the Cascade —
// water pouring from each lip into the pool below —, the pipes that hang beside the pools, each in the colour
// of what it carries, the sparks, the arrows of light, the hoops in the air on the way to the harder mouths,
// the masts of its helices and the legs of the rest, the deck at the top, the arches, the signs, the gate on
// the beach and the board of the best times — and a ride is run: in the trough, and out of it, in the air,
// down to whatever trough one finds.
//
// Like the race, a ride is a session that drives the player (see PlayerController.driver): the game opens
// it, calls its camera every frame, reads its line for the clock of the screen and its time at the end.
// Nothing here knows about the keyboard, the network or the leaderboards.
import * as THREE from 'three';
import { Parts } from '../../../props/MeshBuilder.js';
import { LAYER } from '../../../../render/Shadows.js';
import { distanceCuller } from '../../../props/StaticBatch.js';
import { makeMaterial, GLSL_COMMON, GLSL_SHADOW, GLSL_LIGHTING } from '../../../../render/globals.js';
import { ANIM } from '../../../../player/Character.js';
import { canvasBoard } from '../Boards.js';
import { formatTime } from '../course.js';
import { SLIDE, WALL, NEAR, slideCourse, lineAt, lineOf, frameAt, rimAt, across, sliderAt, spinnerAt, propAt, refAt, sideAt, asideAt } from './track.js';
import { RIDE, startRide, stepRide, ridePose, rideProgress, rideFall, botInput } from './ride.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

const CREAM = [1.3, 1.17, 0.9], RED = [0.95, 0.1, 0.12], GOLD = [1.5, 1.05, 0.2], TEAL = [0.12, 0.7, 0.78], BLUE = [0.16, 0.36, 1.0];
const PURPLE = [0.5, 0.2, 0.85], NAVY = [0.07, 0.07, 0.2], YELLOW = [1.6, 1.3, 0.12], WHITE = [1.7, 1.7, 1.66], STEEL = [0.5, 0.53, 0.58];
const PINK = [1.25, 0.16, 0.62], DEEP = [0.05, 0.2, 0.42];
const VIOLET = [0.4, 0.13, 0.95], LILAC = [0.66, 0.4, 1.2], ORANGE = [1.7, 0.42, 0.05], AMBER = [1.75, 0.8, 0.1], SPARK = [1.9, 1.35, 0.15];
// two colours for each stretch of the course, in bands (its `tone`); a shortcut wears the colours of a warning
const BANDS = [[RED, CREAM], [GOLD, CREAM], [TEAL, CREAM], [RED, GOLD], [BLUE, WHITE], [PURPLE, TEAL], [RED, CREAM], [BLUE, WHITE], [TEAL, WHITE]];
const WARN = [NAVY, YELLOW];
// …and a pipe one chooses is all of one colour, the colour of what it carries, so that it is told from afar:
// violet where sparks hang, orange where the water rushes
const PAINT = { warn: WARN, spark: [VIOLET, LILAC], rush: [ORANGE, AMBER] };
const INK = { spark: '#3c1796', rush: '#a8480a' }; // …and so are the signs that name it
const BAND = 6; // metres of one colour
const SHELL = 0.13; // thickness of the trough
const SEAT = 0.34; // how high the rider's hips ride above the water (on a ring)
const FILM = 0.035; // how thick the water runs over a plain trough

// ---------------------------------------------------------------------------------------------- the water
// A sheet of water running down the trough: streaks of foam that go the way one slides. Deeper and bluer
// where it stands in a pool.
const WATER_VERT = /* glsl */ `
${GLSL_COMMON}
in float aEdge;
in float aDeep;
out vec2 vUv;
out float vEdge;
out float vDeep;
out vec3 vWorld;
out vec3 vNormalW;
void main() {
  vUv = uv; vEdge = aEdge; vDeep = aDeep;
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
in vec2 vUv;    // x: metres across (a plain stream is one wide to each side), y: metres along the flow
in float vEdge; // 0 well inside the sheet, 1 at its border
in float vDeep; // 0 where it runs thin, 1 in a pool
in vec3 vWorld;
in vec3 vNormalW;
void main() {
  float a1 = texture(uFoam, vec2(vUv.x * 0.7, vUv.y * 0.09 - uTime * 1.1)).r;
  float a2 = texture(uFoam, vec2(vUv.x * 1.6 + 0.37, vUv.y * 0.19 - uTime * 1.9)).r;
  float streak = smoothstep(0.42, 0.92, a1 * 0.62 + a2 * 0.52) * (1.0 - 0.45 * vDeep);
  float edge = 1.0 - smoothstep(0.55, 1.0, vEdge);
  vec3 n = normalize(vNormalW);
  float shadow = sunShadow(vWorld, n);
  vec3 light = hemiAmbient(n) + uSunColor * (0.2 + 0.8 * shadow) * max(dot(n, uSunDir), 0.0);
  vec3 view = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(view, n), 0.0), 3.0);
  vec3 tone = mix(mix(vec3(0.16, 0.6, 0.78), vec3(0.06, 0.4, 0.72), vDeep), vec3(1.0), streak * 0.85);
  vec3 col = tone * light + vec3(0.75, 0.9, 1.0) * fres * 0.35;
  float alpha = edge * mix(mix(0.62, 0.9, vDeep), 0.95, streak);
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
    waterMat.name = 'slide:water';
  }
  return waterMat;
}

// A whirlpool: a funnel in the water of a pool, foam winding down it into a dark eye, turning.
const WHIRL_VERT = /* glsl */ `
${GLSL_COMMON}
out vec2 vUv;
out vec3 vWorld;
out vec3 vNormalW;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const WHIRL_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_SHADOW}
${GLSL_LIGHTING}
in vec2 vUv;   // -1..1 both ways (and a little more: the lip), the eye in the middle
in vec3 vWorld;
in vec3 vNormalW;
void main() {
  float r = length(vUv);
  if (r > 1.14) discard;
  float ang = atan(vUv.y, vUv.x);
  float wind = ang * 3.0 + 10.0 * pow(max(r, 0.001), 0.5) - uTime * 6.0; // three arms of foam, winding in
  float arms = smoothstep(0.3, 0.85, 0.5 + 0.5 * sin(wind));
  float fine = smoothstep(0.6, 0.95, 0.5 + 0.5 * sin(wind * 2.0 + 1.7 + uTime * 1.3));
  vec3 n = normalize(vNormalW);
  vec3 light = hemiAmbient(n) + uSunColor * (0.3 + 0.7 * max(dot(n, uSunDir), 0.0));
  vec3 tone = mix(vec3(0.0, 0.05, 0.16), vec3(0.04, 0.36, 0.7), smoothstep(0.05, 0.6, r));
  tone = mix(tone, vec3(0.14, 0.58, 0.78), smoothstep(0.6, 1.0, r));
  tone = mix(tone, vec3(1.0), arms * (0.2 + 0.65 * smoothstep(0.12, 0.9, r)));
  tone = mix(tone, vec3(1.0), fine * 0.3 * smoothstep(0.35, 1.0, r));
  tone = mix(tone, vec3(1.0), smoothstep(0.86, 0.98, r) * (1.0 - smoothstep(1.02, 1.14, r)) * 0.75); // the lip: a ring of foam
  vec3 view = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(view, n), 0.0), 3.0);
  vec3 col = applyFog(tone * light + vec3(0.75, 0.9, 1.0) * fres * 0.3, vWorld, cameraPosition);
  float alpha = 1.0 - smoothstep(1.02, 1.14, r);
  gl_FragColor = vec4(outputColor(col) * alpha, alpha);
}
`;
let whirlMat = null;
function whirlMaterial() {
  if (!whirlMat) {
    whirlMat = makeMaterial({
      vertexShader: WHIRL_VERT, fragmentShader: WHIRL_FRAG, side: THREE.DoubleSide,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    whirlMat.name = 'slide:whirl';
  }
  return whirlMat;
}

// ---------------------------------------------------------------------------------------------- building

const _f = { side: [0, 0, 0], up: [0, 0, 0] }, _xs = {}, _mx = new THREE.Vector3(), _mz = new THREE.Vector3();
/**
 * A point of the trough at a sample: `u` metres across from its middle (along its surface), `raise` metres out
 * of that surface (into the trough), `drop` metres straight down (the floor of a pool).
 */
function onTrough(p, f, u, raise = 0, out = V(0, 0, 0), drop = 0) {
  const X = across(p.F, u, _xs), sn = Math.sin(X.tilt), cs = Math.cos(X.tilt), off = X.off - sn * raise, lift = X.lift + cs * raise - drop;
  return out.set(p.x + f.side[0] * off + f.up[0] * lift, p.y + f.side[1] * off + f.up[1] * lift, p.z + f.side[2] * off + f.up[2] * lift);
}
/** …the way out of its surface there (into the trough; out of it when `k` is -1)… */
function troughNormal(p, f, u, out = V(0, 0, 0), k = 1) {
  const tilt = across(p.F, u, _xs).tilt, sn = Math.sin(tilt), cs = Math.cos(tilt);
  return out.set((f.up[0] * cs - f.side[0] * sn) * k, (f.up[1] * cs - f.side[1] * sn) * k, (f.up[2] * cs - f.side[2] * sn) * k);
}
/** …and the way across it there, towards the right. */
function troughAcross(p, f, u, out = V(0, 0, 0)) {
  const tilt = across(p.F, u, _xs).tilt, sn = Math.sin(tilt), cs = Math.cos(tilt);
  return out.set(f.side[0] * cs + f.up[0] * sn, f.side[1] * cs + f.up[1] * sn, f.side[2] * cs + f.up[2] * sn);
}

export class Slide {
  /**
   * @param world the world: its scene, its ground (data), its materials, its water (for the foam), its engine
   * @param {{ board?: boolean }} [o] board: false when the game hangs its own board of scores at `boardSpot`
   *   (GamesZone.scoreStand) instead of the plain one built here
   */
  constructor(world, { board = true } = {}) {
    this.world = world;
    this.ownBoard = board;
    this.data = world.data;
    this.course = slideCourse();
    this.group = new THREE.Group();
    this.group.name = 'slide';
    this.session = null;
    this.best = null; // the best time of this visitor, ms
    this.events = null;
  }

  build() {
    const world = this.world, mats = world.materials, tier = world.engine.tier, cast = [LAYER.STATIC_CASTER], course = this.course;
    // the trough, a stretch at a time, each twice: as it is seen from near, and far more plainly (a fifteenth of
    // the triangles) for when it is far — which it is from most of the valley, whether or not a hill hides it
    const lines = course.lines;
    this._stretches = [];
    lines.forEach((line, li) => {
      const pts = line.points, CHUNK = 150;
      for (let from = 0; from < pts.length - 1; from += CHUNK) {
        const to = Math.min(pts.length - 1, from + CHUNK), near = new Parts(), far = new Parts();
        this._trough(near.get('paint'), line, from, to);
        this._trough(far.get('paint'), line, from, to, 2, 4);
        const a = near.toMeshes(mats, { name: `slide-trough${li}-${from}`, layers: cast }), b = far.toMeshes(mats, { name: `slide-far${li}-${from}`, layers: [] });
        const sphere = a.children[0].geometry.boundingSphere;
        b.visible = false;
        this._stretches.push({ near: a, far: b, x: sphere.center.x, y: sphere.center.y, z: sphere.center.z, r: sphere.radius });
        this.group.add(a, b);
      }
    });
    this._water(lines);
    this._supports(mats, cast);
    this._ends(mats, cast);
    this._things(mats);
    this._whirls();
    this._movers(mats);
    this._sparks(mats);
    this.group.updateMatrixWorld(true);
    const far = tier.phone ? 0.6 : 1;
    this._near = 150 * far; // within that distance a stretch of the trough is drawn in full
    this._cull = distanceCuller(this.group, [[/^slide-(trough|far)/, Infinity], [/^slide-water/, 170 * far], [/^slide-(things|whirls)/, 170 * far], [/^slide-mover/, 140 * far], [/^slide-(sign|board)/, 150 * far], [/^slide-arches/, 260 * far], [/^slide-legs/, 1200], [/./, 900]]);
    world.scene.add(this.group);
    return this;
  }

  /**
   * The trough of a line between two samples: its inside — two walls, and between them, where it is opened out,
   * the floor of a pool under the water —, its outside and its two lips; nothing where the line crosses a gap.
   * `arcs`: how many faces up each wall; `stride`: one sample in so many (the plain version seen from far has
   * few of both).
   */
  _trough(b, line, i0, i1, arcs = 4, stride = 1) {
    const pts = line.points, tones = this.course.stretches.map((q) => q.tone);
    const palette = (p) => (line.id >= 0 ? PAINT[line.paint] || WARN : BANDS[tones[p.tag.stretch ?? 0] % BANDS.length]);
    const a = V(0, 0, 0), n = V(0, 0, 0), up = V(0, 0, 0);
    // (where water stands from the first metre — the pool under a fall, the mouth of a pipe — a wall closes the head of the trough)
    const headed = (i) => (line.key ? i === 0 : i > 0 && !!pts[i - 1].tag.fall);
    let prev = null;
    for (let i = i0; i <= i1; i = i < i1 ? Math.min(i1, i + stride) : i + 1) {
      const p = pts[i];
      if (p.tag.gap) { prev = null; continue; }
      const f = frameAt(p, _f), lo = -(p.lim[0] + 0.13), hi = p.lim[1] + 0.13, F = p.F, D = Math.max(0, p.D - FILM);
      const tone = palette(p)[Math.floor(p.s / BAND) % 2], inside = [tone[0] * 1.08 + 0.05, tone[1] * 1.08 + 0.05, tone[2] * 1.08 + 0.05, 1];
      const wet = Math.min(1, D / 0.5), floor = [lerp(inside[0], DEEP[0], wet), lerp(inside[1], DEEP[1], wet), lerp(inside[2], DEEP[2], wet), 1];
      up.set(f.up[0], f.up[1], f.up[2]);
      const ring = { in: [], out: [], lipL: [], lipR: [] };
      // the inside: down the left wall, across the floor (sunk under the water of a pool), up the right wall
      for (let j = 0; j <= arcs; j++) { const u = lerp(lo, -F, j / arcs); ring.in.push(b.vert(onTrough(p, f, u, 0, a), troughNormal(p, f, u, n), j / arcs, p.s, inside)); }
      for (const u of [-F, 0, F]) ring.in.push(b.vert(onTrough(p, f, u, 0, a, D), up, 0.5, p.s, floor));
      for (let j = 0; j <= arcs; j++) { const u = lerp(F, hi, j / arcs); ring.in.push(b.vert(onTrough(p, f, u, 0, a), troughNormal(p, f, u, n), j / arcs, p.s, inside)); }
      // the outside: the same way round, a shell away
      for (let j = 0; j <= arcs; j++) { const u = lerp(lo, -F, j / arcs); ring.out.push(b.vert(onTrough(p, f, u, -SHELL, a, j === arcs ? D : 0), troughNormal(p, f, u, n, -1), j / arcs, p.s, [...tone, 1])); }
      for (let j = 0; j <= arcs; j++) { const u = lerp(F, hi, j / arcs); ring.out.push(b.vert(onTrough(p, f, u, -SHELL, a, j === 0 ? D : 0), troughNormal(p, f, u, n, -1), j / arcs, p.s, [...tone, 1])); }
      // the lips: the tops of the two walls, white
      // (…gold and white round the mouth of a pipe one falls into: a target, seen from above)
      const lip = line.key && p.s < line.mouth && Math.floor(p.s / 2) % 2 ? [...SPARK, 1] : [...WHITE, 1];
      for (const [key, u, sign] of [['lipL', lo, -1], ['lipR', hi, 1]]) {
        troughAcross(p, f, u, n).multiplyScalar(sign);
        ring[key].push(b.vert(onTrough(p, f, u, 0, a), n, 0, p.s, lip), b.vert(onTrough(p, f, u, -SHELL, a), n, 1, p.s, lip));
      }
      if (prev) {
        for (let j = 0; j + 1 < ring.in.length; j++) b.idx.push(prev.in[j], prev.in[j + 1], ring.in[j], ring.in[j], prev.in[j + 1], ring.in[j + 1]);
        for (let j = 0; j + 1 < ring.out.length; j++) b.idx.push(prev.out[j], ring.out[j], prev.out[j + 1], prev.out[j + 1], ring.out[j], ring.out[j + 1]);
        b.idx.push(prev.lipL[0], ring.lipL[0], prev.lipL[1], prev.lipL[1], ring.lipL[0], ring.lipL[1]);
        b.idx.push(prev.lipR[0], prev.lipR[1], ring.lipR[0], ring.lipR[0], prev.lipR[1], ring.lipR[1]);
      } else if (headed(i)) {
        // the wall at its head: from rim to rim, down to the floor — seen from the pool, and from behind
        const back = V(-p.tx, -p.ty, -p.tz), fore = V(p.tx, p.ty, p.tz), white = [...WHITE, 1];
        for (const [nrm, tint, flip] of [[fore, inside, true], [back, [...tone, 1], false]]) {
          const fan = [];
          for (let j = 0; j <= arcs; j++) { const u = lerp(lo, -F, j / arcs); fan.push(b.vert(onTrough(p, f, u, 0, a), nrm, j / arcs, p.s, j === 0 ? white : tint)); }
          for (const u of [-F, 0, F]) fan.push(b.vert(onTrough(p, f, u, 0, a, D), nrm, 0.5, p.s, tint));
          for (let j = 0; j <= arcs; j++) { const u = lerp(F, hi, j / arcs); fan.push(b.vert(onTrough(p, f, u, 0, a), nrm, j / arcs, p.s, j === arcs ? white : tint)); }
          for (let j = 1; j + 1 < fan.length; j++) { if (flip) b.idx.push(fan[0], fan[j + 1], fan[j]); else b.idx.push(fan[0], fan[j], fan[j + 1]); }
        }
      }
      prev = ring;
    }
  }

  /**
   * The water: the stream that runs down the middle of a plain trough, and what stands over the whole floor
   * where the slide is opened out — in stretches (none over a gap).
   */
  _water(lines) {
    const foam = this.world.water?.shared?.uFoam;
    if (!foam) return;
    const N = 8, REACH = SLIDE.stream + 0.17, a = V(0, 0, 0), n = V(0, 0, 0), mat = waterMaterial(foam);
    const sheet = (name, pos, nrm, uv, edge, deep, idx) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
      geo.setAttribute('aDeep', new THREE.Float32BufferAttribute(deep, 1));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name;
      mesh.renderOrder = 12; // after the water of the world
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    };
    lines.forEach((line, li) => {
      const pts = line.points, CHUNK = 84;
      for (let from = 0; from < pts.length - 1; from += CHUNK) {
        const to = Math.min(pts.length - 1, from + CHUNK), pos = [], nrm = [], uv = [], edge = [], deep = [], idx = [];
        let prev = -1, rows = 0;
        for (let i = from; i <= to; i++) {
          const p = pts[i];
          if (p.tag.gap) { prev = -1; continue; }
          const f = frameAt(p, _f), lo = -Math.min(p.F + REACH, p.lim[0] + 0.04), hi = Math.min(p.F + REACH, p.lim[1] + 0.04), d = clamp(p.D / 0.6, 0, 1);
          for (let j = 0; j <= N; j++) {
            const u = lerp(lo, hi, j / N);
            onTrough(p, f, u, FILM, a); troughNormal(p, f, u, n);
            pos.push(a.x, a.y, a.z); nrm.push(n.x, n.y, n.z); uv.push(u / REACH, p.s);
            edge.push(clamp(1 - Math.min(u - lo, hi - u) / REACH, 0, 1)); deep.push(d);
          }
          if (prev >= 0) { const r0 = prev * (N + 1), r1 = rows * (N + 1); for (let j = 0; j < N; j++) idx.push(r0 + j, r0 + j + 1, r1 + j, r1 + j, r0 + j + 1, r1 + j + 1); }
          prev = rows++;
        }
        if (idx.length) sheet(`slide-water${li}-${from}`, pos, nrm, uv, edge, deep, idx);
      }
    });
    // ---- the falls: the stream pours from each lip — and from the end of a pipe that ends in the air — down to
    // the water below, as water thrown forward falls
    const pour = (line, s, drop, name) => {
      const p = lineAt(line, s, {}), f = frameAt(p, { side: [0, 0, 0], up: [0, 0, 0] }), M = 4, STEPS = 12, v = 9, T = Math.sqrt((2 * (drop + 0.5)) / 9.81);
      const pos = [], nrm = [], uv = [], edge = [], deep = [], idx = [], hl = Math.hypot(p.tx, p.tz) || 1, fx = p.tx / hl, fz = p.tz / hl;
      for (let k = 0; k <= STEPS; k++) {
        const t = (T * k) / STEPS, ahead = v * t, down = 4.905 * t * t, len = Math.hypot(v, 9.81 * t), half = REACH * (1 + (0.3 * k) / STEPS);
        for (let j = 0; j <= M; j++) {
          const w = lerp(-half, half, j / M);
          pos.push(p.x + fx * ahead + f.side[0] * w, p.y + FILM - down + f.side[1] * w, p.z + fz * ahead + f.side[2] * w);
          nrm.push((fx * 9.81 * t) / len, v / len, (fz * 9.81 * t) / len); uv.push(w / REACH, p.s + Math.hypot(ahead, down));
          edge.push(Math.abs(w) / half); deep.push(0);
        }
        if (k) { const r0 = (k - 1) * (M + 1), r1 = k * (M + 1); for (let j = 0; j < M; j++) idx.push(r0 + j, r0 + j + 1, r1 + j, r1 + j, r0 + j + 1, r1 + j + 1); }
      }
      sheet(name, pos, nrm, uv, edge, deep, idx);
    };
    this.course.falls.forEach((fl, k) => pour(this.course.main, fl.from, fl.drop, `slide-water-fall${k}`));
    this.course.sides.forEach((ln, k) => { if (ln.end === 'off') { const e = ln.points[ln.points.length - 1], low = lineAt(this.course.main, e.ref + 12, {}); pour(ln, ln.length, e.y - low.y, `slide-water-off${k}`); } });
  }

  /** What holds it all up: a mast in the middle of each helix, with an arm to every turn; legs under the rest. */
  _supports(mats, cast) {
    const course = this.course, data = this.data, P = course.main.points, R = SLIDE.radius;
    const ground = (x, z) => Math.min(data.heightAt(x, z), Math.max(-6, data.heightAt(x, z)));
    const parts = new Parts(), b = parts.get('paint');
    const under = (p) => { const f = frameAt(p, _f), d = p.D + SHELL + 0.05; return V(p.x - f.up[0] * d, p.y - f.up[1] * d, p.z - f.up[2] * d); };
    const inHelix = (s) => course.helices.some((h) => s >= h.from - 2 && s <= h.to + 2);
    // nothing that holds the slide up may go through another part of it: how near a segment passes any trough
    // (other than round the metre `own` of the main line, which it holds)
    // (…nor the pipes that hang beside the very stretch it holds: they are told by the metre they run beside)
    const every = course.lines.flatMap((line) => line.points.filter((_, n) => n % 2 === 0).map((p) => ({ x: p.x, y: p.y + R * 0.5, z: p.z, F: p.F, s: line.id < 0 || line.key ? p.ref : -1e6 })));
    const _ab = V(0, 0, 0), _ap = V(0, 0, 0);
    const clearOf = (a, c, own, room = R + 0.9) => {
      _ab.subVectors(c, a);
      const l2 = _ab.lengthSq() || 1;
      for (const q of every) {
        if (Math.abs(q.s - own) < 9) continue;
        _ap.set(q.x - a.x, q.y - a.y, q.z - a.z);
        const t = clamp(_ap.dot(_ab) / l2, 0, 1), dx = a.x + _ab.x * t - q.x, dy = a.y + _ab.y * t - q.y, dz = a.z + _ab.z * t - q.z;
        if (dx * dx + dy * dy + dz * dz < (room + q.F) * (room + q.F)) return false;
      }
      return true;
    };
    // (a mast wherever the line winds round something: the two quarters of the oval that lie over the Corkscrew
    // hang from its mast, which goes up to them)
    const masts = [];
    for (const h of course.helices) {
      let m = masts.find((q) => Math.hypot(q.x - h.x, q.z - h.z) < 2);
      if (!m) masts.push((m = { x: h.x, z: h.z, top: -1e9, tone: h.tone }));
      m.top = Math.max(m.top, h.top);
      if (!h.arc) m.tone = h.tone;
    }
    for (const h of masts) {
      const base = ground(h.x, h.z) - 1, top = h.top + 5.5;
      // the mast, in bands, a ball on top
      for (let y = base, k = 0; y < top; y += 9, k++) {
        const y1 = Math.min(top, y + 9), t0 = (y - base) / (top - base), t1 = (y1 - base) / (top - base);
        b.tint(...(k % 2 ? CREAM : BANDS[h.tone % BANDS.length][0]), 1).cylinder(h.x, y, h.z, lerp(1.25, 0.6, t0), lerp(1.25, 0.6, t1), y1 - y, 12, { capTop: false });
      }
      b.tint(...GOLD, 1).place(h.x, top + 0.5, h.z).lathe([[0.0, -0.75], [0.52, -0.5], [0.75, 0], [0.52, 0.5], [0.0, 0.75]], 10).pop();
    }
    for (const h of course.helices) {
      // an arm from the mast to the trough, every sixth of a turn (not where a shortcut is in its way)
      const stepLen = (2 * Math.PI * h.r) / 6;
      for (let s = h.from + stepLen * 0.5; s < h.to; s += stepLen) {
        const p = P[Math.round(s)], u = under(p), dx = u.x - h.x, dz = u.z - h.z, d = Math.hypot(dx, dz) || 1;
        const a0 = V(h.x + (dx / d) * 0.5, u.y - 0.9 - d * 0.07, h.z + (dz / d) * 0.5), a1 = V(u.x - (dx / d) * 0.2, u.y - 0.12, u.z - (dz / d) * 0.2);
        if (clearOf(a0, a1, p.s, R + 0.5)) b.tint(...STEEL, 1).rod(a0, a1, 0.17, 6, { caps: false });
      }
    }
    // legs: one every so often under what no mast holds, where the ground is not too far below — and never
    // through a turn of the slide that passes underneath (the leg is then tried a little further on)
    const legs = new Parts(), lb = legs.get('paint');
    let since = 99;
    for (let i = 4; i < P.length - 2; i++) {
      const p = P[i];
      since += 1;
      if (inHelix(p.s) || since < 15 || p.tag.gap) continue;
      // (none right under the lip of a fall: that is where the camera of who has just come down is)
      if (course.falls.some((q) => p.s > q.from - 9 && p.s <= q.from + 0.5)) continue;
      const u = under(p), g = ground(p.x, p.z);
      if (u.y - g < 0.9) continue;
      if (!clearOf(V(p.x, g - 0.6, p.z), V(u.x, u.y - 0.25, u.z), p.s, R + 1.7)) continue;
      since = 0;
      const tall = u.y - g, r = clamp(0.2 + tall * 0.006, 0.22, 0.6);
      lb.tint(...CREAM, 1).rod(V(p.x, g - 0.6, p.z), V(u.x, u.y - 0.25, u.z), r, 8, { caps: false, r1: r * 0.7 });
      // a yoke under the trough, and a red band every twenty metres of a tall leg
      const f = frameAt(p, _f);
      // (…as wide as what it carries: the rivers that run against the trough stand on the same legs)
      let yl = R * 0.8 + p.F, yr = yl;
      for (const ln of course.sides) {
        if (p.s < ln.from || p.s > ln.to) continue;
        const at = sideAt(ln, p.s), d = asideAt(ln, at), q = lineAt(ln, at, {});
        if (Math.abs(q.y - p.y) > 1.2) continue;
        if (d < 0) yl = Math.max(yl, -d + R * 0.8 + q.F); else yr = Math.max(yr, d + R * 0.8 + q.F);
      }
      lb.tint(...STEEL, 1).rod(V(u.x - f.side[0] * yl, u.y - 0.2 - f.side[1] * yl, u.z - f.side[2] * yl), V(u.x + f.side[0] * yr, u.y - 0.2 + f.side[1] * yr, u.z + f.side[2] * yr), 0.13, 6);
      for (let y = g + 20; y < u.y - 4; y += 20) lb.tint(...RED, 1).cylinder(p.x + (u.x - p.x) * ((y - g) / tall), y, p.z + (u.z - p.z) * ((y - g) / tall), r * 1.25, r * 1.25, 1.2, 8);
    }
    // a pipe hangs from the slide it runs beside: a strut every ten metres or so, from the outside of the one's
    // rim to the outside of the other's nearer wall, and a band round the pipe there
    for (const pipe of course.pipes) {
      const fq = { side: [0, 0, 0], up: [0, 0, 0] }, fm = { side: [0, 0, 0], up: [0, 0, 0] };
      for (let i = 3; i < pipe.points.length - 1; i += 9) {
        const q = pipe.points[i], m = lineAt(course.main, pipe.from + (q.s / pipe.length) * (pipe.to - pipe.from), {});
        frameAt(q, fq); frameAt(m, fm);
        const a = onTrough(m, fm, pipe.side * (m.F + WALL - 0.12), -(SHELL + 0.07)).clone(), c = onTrough(q, fq, -pipe.side * 1.15, -(SHELL + 0.07)).clone();
        lb.tint(...STEEL, 1).rod(a, c, 0.13, 6);
        const band = [];
        for (let k = 0; k <= 8; k++) band.push(onTrough(q, fq, lerp(-(WALL + 0.1), WALL + 0.1, k / 8), -(SHELL + 0.05)).clone());
        for (let k = 0; k < 8; k++) lb.tint(...STEEL, 1).rod(band[k], band[k + 1], 0.07, 5, { caps: false });
      }
    }
    // so do the pipes of the Cascade, while they hang beside a pool: a strut every nine metres, and a band round the pipe
    for (const ln of course.sides) {
      const fq = { side: [0, 0, 0], up: [0, 0, 0] }, fm = { side: [0, 0, 0], up: [0, 0, 0] };
      for (let i = 4; i < ln.points.length - 1; i += 9) {
        const q = ln.points[i], near = P[clamp(Math.round(q.ref), 0, P.length - 1)];
        if (Math.abs(q.d) < NEAR + 0.6 || near.tag.gap) continue; // (where it runs against the main line it stands on its legs)
        const m = lineAt(course.main, q.ref, {});
        if (Math.abs(q.y - m.y) > 4.5) continue;
        frameAt(q, fq); frameAt(m, fm);
        const a = onTrough(m, fm, ln.side * (m.F + WALL - 0.12), -(SHELL + 0.07)).clone(), c = onTrough(q, fq, -ln.side * (q.F + 1.15), -(SHELL + 0.07)).clone();
        lb.tint(...STEEL, 1).rod(a, c, 0.13, 6);
        const band = [];
        for (let k = 0; k <= 8; k++) band.push(onTrough(q, fq, lerp(-(q.F + WALL + 0.1), q.F + WALL + 0.1, k / 8), -(SHELL + 0.05)).clone());
        for (let k = 0; k < 8; k++) lb.tint(...STEEL, 1).rod(band[k], band[k + 1], 0.07, 5, { caps: false });
      }
    }
    this.group.add(parts.toMeshes(mats, { name: 'slide-masts', layers: cast }), legs.toMeshes(mats, { name: 'slide-legs', layers: cast }));
  }

  /** The deck at the top, the arches along the way, the gate on the beach and its board. */
  _ends(mats, cast) {
    const course = this.course, R = SLIDE.radius, data = this.data;
    const parts = new Parts(), wood = parts.get('woodDeck'), paint = parts.get('paint');
    // ---- the deck: planks on the rim of the cliff, a rail, two posts and the name
    const T = SLIDE.top, fx = Math.sin(T.yaw), fz = Math.cos(T.yaw), rx = -fz, rz = fx;
    wood.place(T.x - fx * 3.2, T.y - 0.12, T.z - fz * 3.2, T.yaw);
    wood.tint(1, 1, 1, 1).box(-5.2, -0.35, -4.6, 5.2, 0, 4.4);
    wood.pop();
    paint.place(T.x - fx * 3.2, T.y - 0.12, T.z - fz * 3.2, T.yaw);
    for (const sx of [-5.1, 5.1]) for (let z = -4.4; z <= 4.4; z += 2.2) paint.tint(...CREAM, 1).box(sx - 0.07, 0, z - 0.07, sx + 0.07, 1.05, z + 0.07);
    for (const sx of [-5.1, 5.1]) paint.tint(...RED, 1).box(sx - 0.05, 0.98, -4.45, sx + 0.05, 1.08, 4.45);
    paint.tint(...RED, 1).box(-5.1, 0.98, -4.5, 5.1, 1.08, -4.4);
    for (const sx of [-2.6, 2.6]) paint.tint(...CREAM, 1).cylinder(sx, 0, 3.3, 0.16, 0.13, 4.6, 8);
    paint.pop();
    // (legs under the deck, down to the rock)
    for (const [ox, oz] of [[-4.6, -4], [4.6, -4], [-4.6, 3.8], [4.6, 3.8]]) {
      const x = T.x - fx * 3.2 + rx * ox + fx * oz, z = T.z - fz * 3.2 + rz * ox + fz * oz, g = data.heightAt(x, z);
      if (T.y - 0.4 - g > 0.2) wood.tint(0.8, 0.8, 0.8, 1).rod(V(x, g - 0.4, z), V(x, T.y - 0.4, z), 0.16, 6, { caps: false });
    }
    const sign = (text, sub, w, h, tone = '#7a1420') => canvasBoard(512, Math.round((512 * h) / w), (ctx, cw, ch) => {
      ctx.fillStyle = tone; ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = ch * 0.05; ctx.strokeRect(ch * 0.05, ch * 0.05, cw - ch * 0.1, ch - ch * 0.1);
      ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(ch * (sub ? 0.46 : 0.6))}px Georgia, 'Times New Roman', serif`;
      ctx.fillText(text, cw / 2, ch * (sub ? 0.4 : 0.53), cw * 0.9);
      if (sub) { ctx.font = `600 ${Math.round(ch * 0.2)}px system-ui, sans-serif`; ctx.fillStyle = '#f2c14e'; ctx.fillText(sub, cw / 2, ch * 0.78, cw * 0.9); }
    }, w, h, { both: true });
    const hang = (board, x, y, z, yaw) => { board.mesh.position.set(x, y, z); board.mesh.rotation.y = yaw; board.mesh.name = 'slide-sign'; this.group.add(board.mesh); return board; };
    hang(sign(SLIDE.name.toUpperCase(), `${Math.round(course.finish / 10) * 10} METRES OF WATER · ${Math.round(T.y)} M DOWN`, 5.0, 1.25), T.x + fx * 0.1, T.y + 4.1, T.z + fz * 0.1, T.yaw);

    // ---- the arches: one at every place one is put back, numbered; a chequered one where the clock stops
    const arches = new Parts(), ab = arches.get('paint');
    const arch = (s, tones, big) => {
      // (a portal over the trough, as wide as it is there: up from beside one rim, round, and down beside the other)
      const p = lineAt(course.main, s), f = frameAt(p, { side: [0, 0, 0], up: [0, 0, 0] }), n = 14, pts = [];
      const half = p.F + R * Math.sin(SLIDE.rim) + (big ? 0.8 : 0.5), base = R * (1 - Math.cos(SLIDE.rim)) - 0.45, top = base + (big ? 4.3 : 3.7);
      // (over the rivers too, where they run against the trough)
      let hl = half, hr = half;
      for (const ln of course.sides) {
        if (s < ln.from || s > ln.to) continue;
        const d = asideAt(ln, sideAt(ln, s));
        if (Math.abs(d) >= NEAR + 1) continue;
        if (d < 0) hl = Math.max(hl, -d + half); else hr = Math.max(hr, d + half);
      }
      for (let k = 0; k <= n; k++) {
        const ang = Math.PI * (k / n), x = (hr - hl) / 2 - (Math.cos(ang) * (hr + hl)) / 2, y = base + (top - base) * Math.sin(ang) ** 0.6;
        pts.push(V(p.x + f.side[0] * x + f.up[0] * y, p.y + f.side[1] * x + f.up[1] * y, p.z + f.side[2] * x + f.up[2] * y));
      }
      for (let k = 0; k < n; k++) ab.tint(...tones[k % tones.length], 1).rod(pts[k], pts[k + 1], big ? 0.2 : 0.13, 6, { caps: false });
    };
    course.marks.forEach((m, k) => { if (k) arch(m.s, [GOLD, GOLD, RED], false); });
    arch(course.finish - 1.5, [NAVY, WHITE], true);
    arch(1.2, [RED, CREAM], true);
    {
      const p = lineAt(course.main, course.finish - 1.5), f = frameAt(p, { side: [0, 0, 0], up: [0, 0, 0] });
      hang(sign('FINISH', '', 3.4, 0.8, '#1b1340'), p.x + f.up[0] * (R + 3.4), p.y + f.up[1] * (R + 3.4), p.z + f.up[2] * (R + 3.4), p.yaw);
    }

    // ---- where a shortcut leaves: its name and which side, a little before
    for (const fk of course.forks) {
      const p = lineAt(course.main, fk.from - 20), f = frameAt(p, { side: [0, 0, 0], up: [0, 0, 0] }), k = fk.side * (R + 1.5);
      const x = p.x + f.side[0] * k + f.up[0] * 2.3, y = p.y + f.side[1] * k + f.up[1] * 2.3, z = p.z + f.side[2] * k + f.up[2] * 2.3;
      hang(sign(fk.side < 0 ? `◀ ${fk.name.toUpperCase()}` : `${fk.name.toUpperCase()} ▶`, 'SHORTER · STEEPER · KEEP TO THIS SIDE', 4.4, 1.25, '#12122e'), x, y, z, p.yaw);
      ab.tint(...STEEL, 1).rod(V(p.x + f.side[0] * fk.side * (R + 0.1), p.y + f.side[1] * fk.side * (R + 0.1) + 0.9, p.z + f.side[2] * fk.side * (R + 0.1)), V(x, y - 0.5, z), 0.09, 6);
    }

    // ---- where a pipe runs beside the slide: its name and which side, over its top end — and how one gets into it
    for (const pipe of course.pipes) {
      const p = lineAt(course.main, pipe.from + 9), f = frameAt(p, { side: [0, 0, 0], up: [0, 0, 0] }), k = pipe.side * (p.F + R * Math.sin(SLIDE.rim) + 2.6);
      const x = p.x + f.side[0] * k + f.up[0] * 2.5, y = p.y + f.side[1] * k + f.up[1] * 2.5, z = p.z + f.side[2] * k + f.up[2] * 2.5;
      hang(sign(pipe.side < 0 ? `◀ ${pipe.name.toUpperCase()}` : `${pipe.name.toUpperCase()} ▶`, 'A PIPE BELOW · JUMP THE RIM TO DROP INTO IT', 4.4, 1.25, '#12122e'), x, y, z, p.yaw);
      const foot = pipe.side * (p.F + R * Math.sin(SLIDE.rim) + 0.15), lift = R * (1 - Math.cos(SLIDE.rim));
      ab.tint(...STEEL, 1).rod(V(p.x + f.side[0] * foot + f.up[0] * lift, p.y + f.side[1] * foot + f.up[1] * lift, p.z + f.side[2] * foot + f.up[2] * lift), V(x, y - 0.5, z), 0.09, 6);
    }

    // ---- the falls: the name of each over its lip, high; and beside the lip, on the side of each pipe that hangs
    // under it, the name of that pipe in its colour, with what it carries
    const over = (q, fq, side, up) => V(q.x + fq.side[0] * side + fq.up[0] * up, q.y + fq.side[1] * side + fq.up[1] * up, q.z + fq.side[2] * side + fq.up[2] * up);
    for (const fl of course.falls) {
      const q = lineAt(course.main, fl.from - 1.5), fq = frameAt(q, { side: [0, 0, 0], up: [0, 0, 0] }), rim = R * Math.sin(SLIDE.rim) + 0.15, lift = R * (1 - Math.cos(SLIDE.rim));
      const c = over(q, fq, 0, 6.3);
      hang(sign(fl.name.toUpperCase(), 'STEER IN THE AIR · THE RING OF LIGHT IS WHERE YOU LAND', 5.0, 1.2, '#12122e'), c.x, c.y, c.z, q.yaw);
      for (const sg of [-1, 1]) ab.tint(...STEEL, 1).rod(over(q, fq, sg * rim, lift), over(q, fq, sg * 2.3, 5.75), 0.08, 6);
      for (const ln of course.sides.filter((v) => v.under === fl.id)) {
        const at = over(q, fq, ln.side * 4.7, 3.0);
        hang(sign(ln.side < 0 ? `◀ ${ln.name.toUpperCase()}` : `${ln.name.toUpperCase()} ▶`, ln.paint === 'spark' ? 'SPARKS · EACH TAKES ¼ S OFF YOUR TIME' : 'FAST WATER · ARROWS THAT THROW YOU ON', 4.2, 1.15, INK[ln.paint]), at.x, at.y, at.z, q.yaw);
        ab.tint(...STEEL, 1).rod(over(q, fq, ln.side * rim, lift), over(q, fq, ln.side * 4.7, 2.45), 0.08, 6);
      }
    }
    // ---- the rivers: where the low rims begin, what they are for
    {
      const first = Math.max(...course.sides.filter((ln) => ln.end === 'join').map((ln) => ln.points.find((v) => Math.abs(v.d) < NEAR).ref));
      const q = lineAt(course.main, first + 4), fq = frameAt(q, { side: [0, 0, 0], up: [0, 0, 0] }), c = over(q, fq, 0, 6.3);
      hang(sign('THE THREE RIVERS', 'LOW RIMS · HOLD THE STICK TO GO OVER INTO THE NEXT PIPE', 5.4, 1.2, '#12122e'), c.x, c.y, c.z, q.yaw);
      for (const sg of [-1, 1]) ab.tint(...STEEL, 1).rod(over(q, fq, sg * 1.45, 0.5), over(q, fq, sg * 2.5, 5.75), 0.08, 6);
    }

    // ---- the gate on the beach: two striped posts, the name over them, a round mat, the board of the times
    const G = SLIDE.gate, gy = data.heightAt(G.x, G.z), gfx = Math.sin(G.yaw), gfz = Math.cos(G.yaw);
    this.gate = { x: G.x, y: gy, z: G.z, yaw: G.yaw };
    paint.place(G.x, gy, G.z, G.yaw);
    for (const sx of [-2.1, 2.1]) for (let y = 0, k = 0; y < 4.2; y += 0.7, k++) paint.tint(...(k % 2 ? CREAM : RED), 1).cylinder(sx, y, 0, 0.2, 0.2, 0.7, 10, { capTop: y + 0.7 >= 4.2 });
    for (const sx of [-2.1, 2.1]) paint.tint(...GOLD, 1).place(sx, 4.45, 0).lathe([[0.0, -0.3], [0.22, -0.2], [0.3, 0], [0.22, 0.2], [0.0, 0.3]], 8).pop();
    paint.tint(...TEAL, 1).cylinder(0, 0.02, 0, 2.0, 2.0, 0.05, 28);
    paint.tint(...CREAM, 1).cylinder(0, 0.03, 0, 1.55, 1.55, 0.05, 28);
    paint.pop();
    hang(sign(SLIDE.name.toUpperCase(), 'THE WATER SLIDE · STAND HERE TO BE TAKEN TO THE TOP', 4.3, 1.15), G.x, gy + 4.05, G.z, G.yaw);
    // the board of the times stands to the right of the gate, turned a little towards who arrives
    this.boardSpot = { x: G.x - gfz * 4.4 + gfx * 0.4, z: G.z + gfx * 4.4 + gfz * 0.4, yaw: G.yaw + 0.5 };
    if (this.ownBoard) {
      // (a plain one: this visitor's best, and the times of the bots to beat — the lab has no board of scores)
      const B = this.boardSpot;
      this.board = canvasBoard(768, 512, (ctx, w, h) => this._drawBoard(ctx, w, h), 3.0, 2.0, { both: true });
      this.board.mesh.position.set(B.x, gy + 1.75, B.z);
      this.board.mesh.rotation.y = B.yaw;
      this.board.mesh.name = 'slide-board';
      this.group.add(this.board.mesh);
      for (const sx of [-1.3, 1.3]) { const c = Math.cos(B.yaw), sn = Math.sin(B.yaw), px = B.x + c * sx, pz = B.z - sn * sx, g0 = data.heightAt(px, pz); paint.tint(...CREAM, 1).cylinder(px, g0 - 0.2, pz, 0.08, 0.08, 1.2 + (gy - g0) + 0.2, 6); }
    }

    this.group.add(parts.toMeshes(mats, { name: 'slide-ends', layers: cast }), arches.toMeshes(mats, { name: 'slide-arches', layers: cast }));
  }

  _drawBoard(ctx, w, h) {
    ctx.fillStyle = '#1b1340'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 10; ctx.strokeRect(9, 9, w - 18, h - 18);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f6e7b8'; ctx.font = "700 70px Georgia, 'Times New Roman', serif"; ctx.fillText(SLIDE.name.toUpperCase(), w / 2, 78);
    ctx.fillStyle = '#f2c14e'; ctx.font = '600 28px system-ui, sans-serif'; ctx.fillText('FROM THE TOP TO THE SEA, AGAINST THE CLOCK', w / 2, 136);
    const rows = [['Your best', this.best ? formatTime(this.best) : '—', '#ffffff'], ...(this.par || []).map(([name, ms]) => [name, formatTime(ms), '#bfe8ee'])];
    rows.forEach(([name, value, tone], i) => {
      const y = 215 + i * 78;
      ctx.textAlign = 'left'; ctx.fillStyle = tone; ctx.font = `${i ? 500 : 700} 44px system-ui, sans-serif`; ctx.fillText(name, 70, y);
      ctx.textAlign = 'right'; ctx.font = `700 50px ui-monospace, Menlo, monospace`; ctx.fillText(value, w - 70, y);
    });
  }

  /** The best time of this visitor (ms), and the times to beat ([[name, ms]]): what the board by the gate shows. */
  setTimes(best, par) { this.best = best || null; if (par) this.par = par; this.board?.redraw(); }

  /**
   * What lies in the water and does not move: the rolls, the blocks, the padding of the walls beside a propeller,
   * the rails of what slides and the posts of what turns, the line of floats where one plunges into the long
   * pool — and at the lip of each gap, and at the end of each pipe, a ramp of arrows of light, with a striped
   * edge where one takes off and where one lands.
   */
  _things(mats) {
    const course = this.course, parts = new Parts(), paint = parts.get('paint'), glow = parts.get('glow');
    const p = {}, f = { side: [0, 0, 0], up: [0, 0, 0] }, n = V(0, 0, 0);
    // something standing on the trough at metre `s`, `u` across: x to the right, y out of the surface, z back up the line
    const stand = (line, s, u, raise = 0) => { const q = lineAt(line, s, {}), fr = frameAt(q, { side: [0, 0, 0], up: [0, 0, 0] }); return this._frame(q, fr, u, raise, new THREE.Matrix4()); };
    const brick = (line, s, u, wide, long, tall, tone, top) => {
      paint.push(stand(line, s, u));
      paint.tint(...tone, 1).box(-wide / 2, -0.06, -long / 2, wide / 2, tall, long / 2);
      if (top) paint.tint(...top, 1).box(-wide / 2 - 0.03, tall, -long / 2 - 0.03, wide / 2 + 0.03, tall + 0.07, long / 2 + 0.03);
      paint.pop();
    };
    const tube = (line, s, from, to, radius, raise, tones) => {
      lineAt(line, s, p); frameAt(p, f);
      const steps = Math.max(3, Math.round((to - from) / 0.24)), pts = [];
      for (let k = 0; k <= steps; k++) pts.push(onTrough(p, f, lerp(from, to, k / steps), raise).clone());
      for (let k = 0; k < steps; k++) paint.tint(...tones[k % tones.length], 1).rod(pts[k], pts[k + 1], radius, 8, { caps: k === 0 || k === steps - 1 });
    };
    for (const t of course.things) {
      const line = lineOf(course, t.line);
      // a roll: a striped tube lying across the water, following the floor (in the stripes of a warning, not those of the ring one rides in)
      if (t.kind === 'bar') tube(line, t.s, t.u - t.half, t.u + t.half, t.h / 2, t.h / 2 - 0.02, [YELLOW, NAVY]);
      // padding up a wall, from where the blades of a propeller end to the rim: three pink cushions
      else if (t.kind === 'block' && t.pad) { const sg = t.u < 0 ? -1 : 1, from = Math.abs(t.u) - t.half, w = t.half / 3; for (let k = 0; k < 3; k++) brick(line, t.s, sg * (from + w * (k + 0.5)), w + 0.04, t.len, 0.62, PINK, WHITE); }
      // a block: pink, taller than a jump
      else if (t.kind === 'block') brick(line, t.s, t.u, t.half * 2, t.len, t.h, PINK, WHITE);
      // what a slider runs on: a dark rail across, as far as it goes each way
      else if (t.kind === 'slider') tube(line, t.s, t.u - t.amp - t.half, t.u + t.amp + t.half, 0.045, 0.03, [NAVY]);
      // the post of a spinner
      else if (t.kind === 'spinner') {
        paint.push(stand(line, t.s, t.u));
        paint.tint(...STEEL, 1).cylinder(0, 0, 0, 0.17, 0.13, t.h + 0.12, 8);
        paint.tint(...GOLD, 1).place(0, t.h + 0.2, 0).lathe([[0.0, -0.16], [0.13, -0.1], [0.17, 0], [0.13, 0.1], [0.0, 0.16]], 8).pop();
        paint.pop();
      }
    }
    // ---- where one plunges into the long pool: a line of floats across, white and red
    for (const z of course.mills) { const F = lineAt(course.main, z.plunge, {}).F; tube(course.main, z.plunge, -F - 0.5, F + 0.5, 0.11, 0.06, [WHITE, RED]); }
    // ---- the gaps: arrows of light up to the lip, a striped edge on the lip and on the far side
    const chevrons = (line, s0, length, half, tone = [1.0, 0.95, 0.35]) => {
      for (let k = 0; k < 4; k++) {
        const s = s0 + k * (length / 4), base = lineAt(line, s, {}), tip = lineAt(line, s + 0.8, {}), mid = lineAt(line, s + 0.45, {});
        const fb = frameAt(base, { side: [0, 0, 0], up: [0, 0, 0] }), ft = frameAt(tip, { side: [0, 0, 0], up: [0, 0, 0] });
        for (const sgn of [-1, 1]) {
          const q0 = onTrough(base, fb, sgn * half, 0.05).clone(), q1 = onTrough(base, fb, sgn * half * 0.45, 0.05).clone(), q2 = onTrough(tip, ft, 0, 0.05).clone(), q3 = onTrough(mid, ft, sgn * half, 0.05).clone();
          troughNormal(base, fb, 0, n);
          glow.tint(tone[0], tone[1], tone[2], 1).quad(sgn > 0 ? q1 : q0, sgn > 0 ? q0 : q1, sgn > 0 ? q3 : q2, sgn > 0 ? q2 : q3, { normal: n.clone() });
        }
      }
    };
    for (const g of course.gaps) {
      chevrons(course.main, g.from - 5.2, 4.6, 1.05);
      for (const s of [g.from - 0.5, g.to + 0.5]) tube(course.main, s, -rimAt(course.main, s, -1), rimAt(course.main, s, 1), 0.12, -0.02, [YELLOW, NAVY]);
    }
    // ---- the pipes: a striped edge at both ends, and arrows up to the one that one flies off
    for (const pipe of course.pipes) {
      chevrons(pipe, pipe.length - 6.2, 4.6, 1.05);
      for (const s of [0.3, pipe.length - 0.3]) tube(pipe, s, -WALL, WALL, 0.12, -0.02, [YELLOW, NAVY]);
    }
    // ---- the falls: arrows of light up to each lip, and a white and blue edge on it — and so at the end of a
    // pipe that ends in the air
    for (const fl of course.falls) { chevrons(course.main, fl.from - 6.4, 5.6, 1.05, [0.55, 1.1, 1.7]); tube(course.main, fl.from - 0.15, -WALL, WALL, 0.12, -0.02, [WHITE, BLUE]); }
    for (const ln of course.sides) if (ln.end === 'off') { chevrons(ln, ln.length - 6.6, 5.6, 1.05, [0.55, 1.1, 1.7]); tube(ln, ln.length - 0.15, -WALL, WALL, 0.12, -0.02, [WHITE, BLUE]); }
    // ---- the arrows that throw one forward: hot, on the water of the Rapids
    for (const t of course.things) if (t.kind === 'boost') chevrons(lineOf(course, t.line), t.s - t.len / 2, t.len, t.half, [1.9, 0.75, 0.1]);
    // ---- a hoop round each spark that hangs in the air — the way to the harder mouth goes through it —, standing
    // on the pipe below
    for (const q of course.sparks) {
      if (!q.air) continue;
      const fx = Math.sin(q.yaw), fz = Math.cos(q.yaw), ring = [], r = 1.55, seg = 16, R = SLIDE.radius;
      for (let k = 0; k <= seg; k++) { const a = (k / seg) * Math.PI * 2; ring.push(V(q.x - fz * Math.cos(a) * r, q.y + Math.sin(a) * r, q.z + fx * Math.cos(a) * r)); }
      for (let k = 0; k < seg; k++) paint.tint(...(k % 2 ? WHITE : SPARK), 1).rod(ring[k], ring[k + 1], 0.1, 6, { caps: false });
      // (two legs, from its sides down to the pipe it leads to — the nearest one below)
      let under = null, least = 1e9;
      for (const ln of course.sides) { if (q.ref < ln.from || q.ref > ln.to) continue; const at = lineAt(ln, sideAt(ln, q.ref), {}), d = Math.hypot(at.x - q.x, at.z - q.z); if (d < least && at.y < q.y) { least = d; under = at; } }
      if (!under) continue;
      const fu = frameAt(under, { side: [0, 0, 0], up: [0, 0, 0] });
      for (const sg of [-1, 1]) {
        const top = V(q.x - fz * sg * r, q.y, q.z + fx * sg * r), off = (top.x - under.x) * fu.side[0] + (top.z - under.z) * fu.side[2], reach = under.F + R * Math.sin(SLIDE.rim);
        if (Math.abs(off) > reach - 0.1) continue;
        const e = Math.abs(off) - under.F, u = Math.sign(off) * (e <= 0 ? Math.abs(off) : under.F + R * Math.asin(e / R));
        paint.tint(...STEEL, 1).rod(top, onTrough(under, fu, u, 0).clone(), 0.07, 6);
      }
    }
    this.group.add(parts.toMeshes(mats, { name: 'slide-things', layers: [] }));
  }

  /** The frame of something on the trough: x across it to the right, y out of its surface, z back up the line; `raise` m out of the surface. */
  _frame(p, f, u, raise, out) {
    const ex = troughAcross(p, f, u, V(0, 0, 0)), ey = troughNormal(p, f, u, V(0, 0, 0)), ez = V(0, 0, 0).crossVectors(ex, ey);
    return out.makeBasis(ex, ey, ez).setPosition(onTrough(p, f, u, raise, V(0, 0, 0)));
  }

  /** The whirlpools: each a funnel in the water of its pool, down to a dark eye. */
  _whirls() {
    const course = this.course, RINGS = 9, SEGS = 26, mat = whirlMaterial();
    const p = {}, f = { side: [0, 0, 0], up: [0, 0, 0] }, c = V(0, 0, 0), ex = V(0, 0, 0), ey = V(0, 0, 0), ez = V(0, 0, 0), q = V(0, 0, 0), nn = V(0, 0, 0);
    course.things.forEach((t, index) => {
      if (t.kind !== 'whirl') return;
      lineAt(lineOf(course, t.line), t.s, p); frameAt(p, f);
      onTrough(p, f, t.u, FILM + 0.02, c); troughAcross(p, f, t.u, ex); troughNormal(p, f, t.u, ey); ez.set(p.tx, p.ty, p.tz);
      const depth = clamp(p.D - 0.14, 0.15, 0.76), pos = [], nrm = [], uv = [], idx = [];
      for (let i = 0; i <= RINGS; i++) {
        // (the water dips towards the eye, steeper and steeper; beyond the lip it lies flat)
        const rho = (i / RINGS) * 1.14, dip = rho < 1 ? depth * (1 - rho) ** 1.7 : 0, lean = rho < 1 ? (depth * 1.7 * (1 - rho) ** 0.7) / t.r : 0;
        for (let j = 0; j < SEGS; j++) {
          const ang = (j / SEGS) * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang);
          q.copy(c).addScaledVector(ez, cs * rho * t.r).addScaledVector(ex, sn * rho * t.r).addScaledVector(ey, -dip);
          nn.copy(ey).addScaledVector(ez, -cs * lean).addScaledVector(ex, -sn * lean).normalize();
          pos.push(q.x, q.y, q.z); nrm.push(nn.x, nn.y, nn.z); uv.push(cs * rho, sn * rho);
        }
      }
      for (let i = 0; i < RINGS; i++) for (let j = 0; j < SEGS; j++) { const a = i * SEGS + j, b = i * SEGS + ((j + 1) % SEGS); idx.push(a, a + SEGS, b, b, a + SEGS, b + SEGS); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `slide-whirls-${index}`;
      mesh.renderOrder = 13; // over the water it turns in
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    });
  }

  /**
   * What moves over the water: the rolls that slide from side to side, the arms that turn, the propellers of the
   * long pool — each moved by the clock of the ride (see update) — and its buffers, that swell when run into.
   */
  _movers(mats) {
    const course = this.course;
    this._moving = [];
    course.things.forEach((t, index) => {
      if (t.kind !== 'slider' && t.kind !== 'spinner' && t.kind !== 'prop' && t.kind !== 'bumper') return;
      const parts = new Parts(), b = parts.get('paint');
      if (t.kind === 'prop') {
        // a propeller: padded blades in red and white, as long as the pool is wide, lying on the water round a
        // low hub — drawn about y, the first blade along z
        for (let j = 0; j < t.blades; j++) {
          b.place(0, 0, 0, (j / t.blades) * Math.PI * 2);
          const n = 7, w = t.thick / 2;
          for (let k = 0; k < n; k++) b.tint(...(k % 2 ? WHITE : RED), 1).box(-w, 0.05, lerp(t.hub * 0.8, t.len - 0.12, k / n), w, t.h, lerp(t.hub * 0.8, t.len - 0.12, (k + 1) / n));
          b.tint(...YELLOW, 1).box(-w - 0.04, 0.03, t.len - 0.12, w + 0.04, t.h + 0.04, t.len);
          b.pop();
        }
        b.tint(...NAVY, 1).lathe([[t.hub, 0.0], [t.hub, t.h * 0.55], [t.hub * 0.78, t.h * 0.9], [t.hub * 0.3, t.h + 0.04]], 16);
        b.tint(...GOLD, 1).place(0, t.h + 0.08, 0).lathe([[0.0, -0.13], [0.15, -0.08], [0.19, 0], [0.15, 0.08], [0.0, 0.13]], 8).pop();
      } else if (t.kind === 'bumper') {
        // a buffer: a great padded drum, in bands, too tall to jump
        b.tint(...PURPLE, 1).lathe([[t.r * 0.9, -0.1], [t.r, 0.14], [t.r, 0.52]], 20);
        b.tint(...YELLOW, 1).lathe([[t.r, 0.52], [t.r * 1.03, 0.78], [t.r, 1.04]], 20);
        b.tint(...PURPLE, 1).lathe([[t.r, 1.04], [t.r * 0.93, 1.42], [t.r * 0.62, t.h - 0.06], [0.0, t.h]], 20);
      } else if (t.kind === 'slider') {
        // a pink and white roll, lying across: drawn along x, its middle at the origin
        const n = 5;
        for (let k = 0; k < n; k++) b.tint(...(k % 2 ? WHITE : PINK), 1).rod(V(lerp(-t.half, t.half, k / n), 0, 0), V(lerp(-t.half, t.half, (k + 1) / n), 0, 0), t.h / 2, 8, { caps: k === 0 || k === n - 1 });
      } else {
        // two arms, red and white, turning about the post: drawn along z
        const n = 6;
        for (let k = 0; k < n; k++) b.tint(...(k % 2 ? WHITE : RED), 1).rod(V(0, 0, lerp(-t.len, t.len, k / n)), V(0, 0, lerp(-t.len, t.len, (k + 1) / n)), 0.09, 6, { caps: k === 0 || k === n - 1 });
        for (const z of [-t.len, t.len]) b.tint(...YELLOW, 1).place(0, 0, z).lathe([[0.0, -0.15], [0.12, -0.09], [0.15, 0], [0.12, 0.09], [0.0, 0.15]], 6).pop();
      }
      const mesh = new THREE.Mesh(b.build(), mats.paint);
      mesh.name = `slide-mover-${index}`;
      mesh.matrixAutoUpdate = false;
      const line = lineOf(course, t.line), p = lineAt(line, t.s, {}), f = frameAt(p, { side: [0, 0, 0], up: [0, 0, 0] });
      const raise = t.kind === 'prop' || t.kind === 'bumper' ? FILM : t.h - 0.11; // (what stands on the water; what turns over it)
      const it = { t, index, mesh, p, f, swell: 0, ex: troughAcross(p, f, t.u, V(0, 0, 0)), ey: troughNormal(p, f, t.u, V(0, 0, 0)), ez: V(p.tx, p.ty, p.tz), at: onTrough(p, f, t.u, raise, V(0, 0, 0)) };
      this._moving.push(it);
      this._move(it, 0);
      this.group.add(mesh);
    });
  }

  /** The sparks: a lozenge of gold light each, turning where it hangs (see update); one's own catches are hidden. */
  _sparks(mats) {
    const b = new Parts().get('glow');
    b.tint(...SPARK, 1).lathe([[0.001, -0.5], [0.33, 0], [0.001, 0.5]], 4);
    const geo = b.build();
    this._lit = this.course.sparks.map((q, k) => {
      const mesh = new THREE.Mesh(geo, mats.glow);
      mesh.name = `slide-mover-spark${k}`;
      mesh.matrixAutoUpdate = false;
      mesh.matrix.makeTranslation(q.x, q.y, q.z);
      this.group.add(mesh);
      return mesh;
    });
  }

  /** Puts something that moves where it is at `clock` seconds. */
  _move(it, clock) {
    const t = it.t, m = it.mesh.matrix;
    if (t.kind === 'slider') this._frame(it.p, it.f, sliderAt(t, clock), t.h / 2 - 0.02, m);
    else if (t.kind === 'bumper') {
      // (run into, it swells and settles)
      const k = 1 + 0.2 * it.swell * Math.abs(Math.cos(it.swell * 9));
      m.makeBasis(_mx.copy(it.ex).multiplyScalar(k), it.ey, _mz.crossVectors(it.ex, it.ey).multiplyScalar(k)).setPosition(it.at);
    } else {
      // (its arms lie along the line when the angle is 0, and turn towards the right)
      const th = t.kind === 'prop' ? propAt(t, clock) : spinnerAt(t, clock), z = _mz.copy(it.ez).multiplyScalar(Math.cos(th)).addScaledVector(it.ex, Math.sin(th)), x = _mx.crossVectors(it.ey, z);
      m.makeBasis(x, it.ey, z).setPosition(it.at);
    }
    it.mesh.matrixWorld.copy(m); // (a child of the slide's group, which stays where it is)
  }

  /** Is the player standing at the gate, where one asks to ride? */
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.3 * 2.3; }

  /** About where one is after a ride: in the sea, off the end of the trough (a session tells exactly: `exit`). [x, z, yaw] */
  get exit() { const c = this.course; return [c.splash.x, c.splash.z, c.end.yaw]; }

  /** What a rider who has left the trough falls onto at (x, z): the water (of the sea, of a lake) or the ground. */
  _under(x, z, out) {
    const g = this.data.heightAt(x, z), w = this.data.waterAt(x, z);
    out.wet = w > g + 0.5;
    out.y = out.wet ? w : g;
    return out;
  }

  /** The way (a heading) from (x, z) to the nearest dry ground: where one swims to, out of the sea. */
  _shore(x, z, fallback = 0) {
    let best = null;
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * Math.PI * 2, sn = Math.sin(a), cs = Math.cos(a);
      for (let d = 1; d < (best ? best.d : 60); d += 0.5) {
        if (this.data.heightAt(x + sn * d, z + cs * d) > this.data.waterAt(x + sn * d, z + cs * d) + 0.1) { best = { d, a }; break; }
      }
    }
    return best ? best.a : fallback;
  }

  /**
   * A ride starts: the player is put in the trough at the top; three, two, one… `io`: { play(sound, options),
   * note(text), go() (the clock starts), splash(x, y, z, strength) (optional: rings on the water where one falls
   * in) }. Returns the session — it is also the driver of the player (see PlayerController.driver):
   *   step(dt, player, control), camera(camera, dt) → the angle of view, line (the clock of the screen), speed,
   *   over (the clock has stopped: `time`, in ms, is the run's), ended (the rider is in the sea and has turned to
   *   the beach: the game lets go of them — see `drop`), exit ([x, z, yaw]: where they are then),
   *   drop(player) (the player swims from there), close(), riding: false, anim.
   */
  open(player, io) {
    const course = this.course, st = startRide(course, { under: (x, z, out) => this._under(x, z, out) }), events = [], pose = {};
    const S = { count: 3.4, cam: null, look: null, fov: 60, shake: 0, stretch: -1, lean: 0, flip: 0, after: 0, from: 0, to: 0, yaw: 0, lip: 0, drop: 0, fall: null, told: false };
    // a ring to sit in
    const ring = this._ring || (this._ring = this._makeRing());
    ring.visible = true;
    // …and, out of the trough, a ring of light where one is going to come down: green over a trough, red elsewhere
    const mark = this._mark || (this._mark = this._makeMark());
    mark.ok.visible = mark.bad.visible = false;
    this._adrift = null;
    const _m = new THREE.Matrix4(), _x = V(0, 0, 0), _y = V(0, 0, 0), _z = V(0, 0, 0), _t = V(0, 0, 0), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), ONE = V(1, 1, 1), UP = V(0, 1, 0);
    const input = { steer: 0, tuck: false, brake: false, jump: false };
    const turnTo = (from, to, t) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
    const session = {
      slide: this, over: false, ended: false, time: 0, line: '', speed: 0, riding: false, anim: ANIM.sit, state: st, falls: 0,
      exit: this.exit,
      // the ride steers by itself: 'careful' | 'bold' | { bold, cuts } (see botInput) — or a function (state, input)
      // that fills the input as it likes (the tests, a film)
      auto: null,
      /** For the tests: the rider is put at metre `s` of the main line, going at `v`. Such a ride has no time. */
      warp: (s, v = 15) => {
        Object.assign(st, { line: -1, s, v, u: 0, w: 0, h: 0, vh: 0, fly: null, spin: 0, turn: 0, stun: 0, warped: true });
        st.cool.clear();
        st.next.clear();
        st.mark = Math.max(0, course.marks.findLastIndex((m) => m.s <= s));
        S.count = 0; S.cam = null;
      },
      step: (dt, pl, control) => {
        const inp = pl.input;
        if (typeof session.auto === 'function') session.auto(st, input);
        else if (session.auto) botInput(st, session.auto, input);
        else {
          input.steer = control ? clamp(inp.move.x, -1, 1) : 0;
          input.tuck = control && (inp.move.y > 0.35 || !!inp.run);
          input.brake = control && inp.move.y < -0.35;
          input.jump = control && !!inp.jump;
        }
        if (S.count > 0) {
          const was = S.count;
          S.count -= dt;
          if (Math.ceil(S.count) !== Math.ceil(was) && S.count > 0 && S.count <= 3) io.play('tick');
          if (S.count <= 0) { io.play('start'); io.go?.(); st.v = 2.5; }
        } else stepRide(st, dt, input, events);
        for (const e of events) this._tell(e, st, io, S);
        events.length = 0;
        ridePose(st, pose);
        if (S.flip > 0) S.flip = Math.max(0, S.flip - dt / 0.55);
        const flip = S.flip > 0 ? (1 - S.flip) * Math.PI * 2 : 0; // (head over heels, once, after running into a roll)
        S.lean += ((pose.flying ? 0 : input.tuck ? -0.42 : input.brake ? 0.18 : -0.16) - S.lean) * Math.min(1, dt * 6);
        if (pose.flying) {
          // ---- out of the trough: the ring and its rider turn over as one, and fall
          const fly = st.fly, still = pose.wet || pose.down;
          let yaw = pose.yaw;
          if (fly.kind === 'end' && still) {
            // in the sea at the end of a run: round to face the beach, then the game lets go
            if (S.after === 0) { S.from = pose.yaw; S.to = this._shore(pose.x, pose.z, pose.yaw); }
            S.after += dt;
            const t = clamp(S.after / 1.0, 0, 1);
            yaw = S.yaw = turnTo(S.from, S.to, t * t * (3 - 2 * t));
            if (S.after > 1.25 && !session.ended) { session.ended = true; session.exit = [pose.x, pose.z, S.to]; }
          }
          const bob = pose.wet ? Math.sin(st.clock * 3.1 + fly.t * 3.1) * 0.05 : 0;
          _e.set(-pose.pitch, yaw, -pose.roll);
          _q.setFromEuler(_e);
          _y.set(0, 1, 0).applyQuaternion(_q);
          pl.pos.set(pose.x + _y.x * 0.04, pose.y + _y.y * 0.04 + bob, pose.z + _y.z * 0.04);
          pl.yaw = yaw; pl.pitch = -pose.pitch + S.lean; pl.roll = -pose.roll;
          _t.set(pose.x - _y.x * 0.1, pose.y - _y.y * 0.1 + bob, pose.z - _y.z * 0.1);
          ring.matrix.compose(_t, _q, ONE);
        } else {
          // ---- in the trough: sitting in the ring, which lies flat on the water where they are
          pl.pos.set(pose.x + pose.ux * SEAT, pose.y + pose.uy * SEAT, pose.z + pose.uz * SEAT);
          pl.yaw = pose.yaw;
          pl.pitch = -pose.pitch + S.lean + flip; // nose down the slope; lying back when tucked
          pl.roll = -pose.roll;
          _z.set(pose.fx, pose.fy, pose.fz); _y.set(pose.ux, pose.uy, pose.uz); _x.crossVectors(_y, _z).normalize(); _z.crossVectors(_x, _y);
          if (st.turn) { _x.applyAxisAngle(_y, st.turn); _z.applyAxisAngle(_y, st.turn); } // (held in a whirlpool: round and round)
          if (flip) { _y.applyAxisAngle(_x, flip); _z.applyAxisAngle(_x, flip); }
          ring.matrix.copy(_m.makeBasis(_x, _y, _z).setPosition(pose.x + pose.ux * 0.2, pose.y + pose.uy * 0.2, pose.z + pose.uz * 0.2));
        }
        ring.matrixWorldNeedsUpdate = true;
        const fall = rideFall(st);
        S.fall = fall && !fall.air ? fall : null;
        // (a fall ahead — the lip of the trough, the end of a pipe that ends in the air: how near, and how far down it goes)
        {
          const ln = lineOf(course, st.line), next = st.fly ? null : st.line < 0 ? course.falls.find((q) => q.from > st.s - 0.5) : ln.end === 'off' && ln.out ? { from: ln.length, drop: 9 } : null;
          const near = next ? clamp(1 - (next.from - st.s - 4) / 24, 0, 1) : 0;
          S.lip += (near * near * (3 - 2 * near) - S.lip) * Math.min(1, dt * 5);
          if (next) S.drop = next.drop;
        }
        mark.ok.visible = !!fall && fall.ok; mark.bad.visible = !!fall && !fall.ok && !fall.air;
        if (fall && !fall.air) {
          const m = fall.ok ? mark.ok : mark.bad, k = 1 + 0.1 * Math.sin(st.clock * 13);
          _y.set(fall.nx, fall.ny, fall.nz);
          m.matrix.compose(_t.set(fall.x + fall.nx * 0.16, fall.y + fall.ny * 0.16, fall.z + fall.nz * 0.16), _q.setFromUnitVectors(UP, _y), _x.set(k, 1, k));
          m.matrixWorldNeedsUpdate = true;
        }
        pl.speed = st.v; pl.grounded = true;
        // ---- the clock of the screen
        session.speed = st.v;
        const here = rideProgress(st), idx = course.stretches.findIndex((s) => here >= s.from && here <= s.to + 1);
        if (idx !== S.stretch && idx >= 0 && S.count <= 0) { S.stretch = idx; if (idx > 0 && idx < course.stretches.length - 1 && !st.fly) io.note(st.line >= 0 ? lineOf(course, st.line).name : course.stretches[idx].name); }
        if (st.over && !session.over) { session.over = true; session.time = st.warped ? 0 : st.time; session.falls = st.falls; }
        // (the time as it will count: each spark caught is a quarter of a second off it)
        const now = formatTime(Math.max(0, Math.round((st.clock - st.sparks * RIDE.spark.worth) * 1000))), lit = st.sparks ? ` · ${st.sparks} spark${st.sparks === 1 ? '' : 's'}` : '';
        session.line = S.count > 0 ? `${SLIDE.name} · ${Math.ceil(S.count) > 3 ? 'ready' : Math.ceil(S.count)}…`
          : session.over ? `${SLIDE.name} · ${formatTime(session.time)}${lit}`
            : pose.flying && pose.left > 0 ? (pose.sure ? `${now} · FALLING · steer to choose your pipe${lit}` : `${now} · OUT · ${pose.left.toFixed(1)} s to find a tube`)
            : `${now} · ${Math.round(st.v * 3.6)} km/h · ${Math.max(0, Math.round(course.finish - here))} m to go${lit}`;
      },
      /**
       * The camera of the ride: behind and above, looking down the trough, wider as it goes faster. Out of the
       * trough it flies behind the rider and looks down the way they go, at where they are going to come down;
       * when they have come down outside it stays where it is and watches; in the sea at the end it comes round
       * behind them, to where the camera of the game will be.
       */
      camera: (cam, dt) => {
        const fly = st.fly;
        if (!S.cam) {
          S.cam = V(pose.x - pose.fx * 6 + pose.ux * 1.3, pose.y - pose.fy * 6 + 2.4, pose.z - pose.fz * 6 + pose.uz * 1.3);
          S.look = V(pose.x + pose.fx * 5.5, pose.y + pose.fy * 5.5 + 0.9, pose.z + pose.fz * 5.5);
        }
        if (fly && fly.kind !== 'end') {
          if (fly.wet || fly.down) {
            // come down outside: watched from where the camera was
            _t.set(pose.x, pose.y + 0.2, pose.z);
            S.look.lerp(_t, Math.min(1, dt * 10));
          } else {
            // in the air: from behind and above, looking down the way one flies — the further down the faster one
            // falls; in a fall of the course, from higher, and at where one is going to come down
            const high = fly.sure ? 4.6 : 3.3, far = fly.sure ? 7.4 : 6.6;
            _t.set(pose.x - pose.fx * far, pose.y + high, pose.z - pose.fz * far);
            S.cam.lerp(_t, Math.min(1, dt * 6));
            const drop = clamp(-fly.vy * 0.24, 0, 4);
            _t.set(pose.x + pose.fx * 6, pose.y + 0.5 - drop, pose.z + pose.fz * 6);
            if (fly.sure && S.fall) { _t.x = lerp(_t.x, S.fall.x, 0.55); _t.y = lerp(_t.y, S.fall.y + 0.4, 0.55); _t.z = lerp(_t.z, S.fall.z, 0.55); }
            S.look.lerp(_t, Math.min(1, dt * 9));
          }
        } else if (fly && S.after > 0) {
          _t.set(pose.x - Math.sin(S.yaw) * 6.83, pose.y + 2.98, pose.z - Math.cos(S.yaw) * 6.83);
          S.cam.lerp(_t, Math.min(1, dt * 5));
          _t.set(pose.x, pose.y + 1.45, pose.z);
          S.look.lerp(_t, Math.min(1, dt * 8));
        } else {
          // (further back and higher where the slide is opened out: the propellers and the whirlpools are seen coming)
          // (…and higher as a fall nears, looking over the lip and down: what lies under it is seen before one is in the air)
          const wide = pose.wide || 0, back = 5.4 + st.v * 0.07 + wide * 0.45 + S.lip * 0.8, up = 2.35 + st.v * 0.015 + wide * 0.4 + S.lip * 2.8, hop = fly ? 0 : Math.min(st.h, 1.2) * 0.6; // (a jump is seen: the camera does not quite follow it)
          _t.set(pose.x - pose.fx * back + pose.ux * (up * 0.55 - hop), pose.y - pose.fy * back + up + pose.uy * (0.4 - hop), pose.z - pose.fz * back + pose.uz * (up * 0.55 - hop));
          S.cam.lerp(_t, Math.min(1, dt * 7.5));
          const ahead = 5.5 + S.lip * 7;
          _t.set(pose.x + pose.fx * ahead - pose.ux * hop, pose.y + pose.fy * ahead + 0.9 - S.lip * Math.min(4.5, S.drop * 0.55) - pose.uy * hop, pose.z + pose.fz * ahead - pose.uz * hop);
          S.look.lerp(_t, Math.min(1, dt * 9));
        }
        cam.position.copy(S.cam);
        if (S.shake > 0) { S.shake = Math.max(0, S.shake - dt * 2.2); cam.position.x += (Math.random() - 0.5) * S.shake * 0.5; cam.position.y += (Math.random() - 0.5) * S.shake * 0.5; }
        cam.up.set(0, 1, 0);
        cam.lookAt(S.look);
        // (the horizon leans a little with the trough: the bends are felt)
        if (!fly) cam.rotateZ(clamp(-pose.roll * 0.22, -0.3, 0.3));
        // (wide when fast, and in the air; narrow on someone who has come down outside, so that they are seen)
        S.fov += ((fly ? (fly.kind === 'end' ? 62 : fly.wet || fly.down ? 40 : 72) : 62 + 24 * clamp(st.v / 26, 0, 1.25)) - S.fov) * Math.min(1, dt * (fly ? 3 : 4));
        return S.fov;
      },
      /**
       * The ride is over and the game lets go: the player is in the sea where they came down, facing the beach,
       * and swims from there (the ring stays behind, adrift). Before the end, or on dry ground: stood at `exit`.
       */
      drop: (pl) => {
        const [x, z, yaw] = session.exit, water = this.data.waterAt(x, z), ground = this.data.heightAt(x, z);
        pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0;
        pl.teleport(x, z, yaw);
        if (water > ground + 1.2) { pl.pos.y = water - 1.0; pl.grounded = false; }
        if (session.ended && st.fly?.wet) this._adrift = { x: st.fly.x, y: st.fly.y, z: st.fly.z, t: 0, yaw };
        session.close();
      },
      close: () => {
        if (this.session === session) this.session = null;
        player.pitch = 0; player.roll = 0;
        mark.ok.visible = mark.bad.visible = false;
        if (!this._adrift) ring.visible = false;
      },
    };
    this.session = session;
    session.step(0, player, false);
    return session;
  }

  /** What happened in a step of the ride, told to the player. */
  _tell(e, st, io, S) {
    const course = this.course;
    if (e.type === 'jump') io.play('jump', { volume: 0.6 });
    else if (e.type === 'kick') io.play('boost', { volume: 0.8 });
    else if (e.type === 'land') {
      if (e.hard > 2) io.play('land', { volume: clamp(e.hard / 8, 0.3, 1) });
      if (e.hard > 3) S.shake = Math.max(S.shake, 0.4);
      if (e.hop && e.sure) {
        // down from a fall of the course: into the pool — a splash —, or into one of the pipes that hang beside it
        const ln = e.line >= 0 ? lineOf(course, e.line) : null;
        io.play('splash', { volume: 0.6 });
        S.shake = Math.max(S.shake, 0.5);
        if (ln && ln.key) { io.play('boost', { volume: 0.6 }); io.note(ln.paint === 'spark' ? `${ln.name}: catch the sparks!` : `${ln.name}: fast water!`); }
      } else if (e.hop) {
        // back in a trough after having left one: which, and what was skipped
        if (e.gain > 25) io.play('boost', { volume: 0.7 });
        io.note(e.line >= 0 && lineOf(course, e.line).pipe ? `${lineOf(course, e.line).name}: the pipe below!` : e.gain > 25 ? `Back in the tube — ${Math.round(e.gain)} m skipped!${e.flat ? ' (a hard landing)' : ''}` : e.from === 'off' ? 'Back on the slide!' : 'Back in the tube!');
        if (e.flat) S.shake = 1.2;
      }
    } else if (e.type === 'bar' || e.type === 'arm') { io.play('hit'); S.shake = 0.9; S.flip = 1; }
    else if (e.type === 'block' || e.type === 'hub') { io.play('hit'); S.shake = 1.0; }
    else if (e.type === 'blade') { io.play('hit', { volume: e.back ? 1 : 0.6 }); S.shake = e.back ? 1.0 : 0.5; if (e.back) io.note('Thrown back by a blade!'); }
    else if (e.type === 'bump') {
      const it = this._moving.find((m) => m.index === e.index);
      if (it) it.swell = 1;
      io.play('whack', { volume: e.graze ? 0.5 : 1 });
      if (!e.graze) { S.shake = 1.0; io.note('Bounced back!'); }
    } else if (e.type === 'plunge') { io.play('splash', { volume: 0.7 }); S.shake = Math.max(S.shake, 0.5); io.note('Propellers! Slip by behind a blade — or jump it.'); }
    else if (e.type === 'whirl') { io.play('fail', { volume: 0.6 }); io.note('Caught in a whirlpool!'); }
    else if (e.type === 'free') io.play('squirt', { volume: 0.5 });
    else if (e.type === 'lane') { if (!e.quiet) { io.play('squirt', { volume: 0.5 }); io.note(e.line >= 0 ? `Over the rim: ${lineOf(course, e.line).name}` : 'Over the rim: the river in the middle'); } }
    else if (e.type === 'spark') io.play('pick', { volume: 0.7 });
    else if (e.type === 'boost') { io.play('boost', { volume: 0.8 }); S.shake = Math.max(S.shake, 0.35); }
    else if (e.type === 'out' && e.sure) {
      // a fall of the course: nothing is lost — one steers, and comes down below (said once a ride)
      S.flip = 0;
      io.play('jump', { volume: 0.7 });
      if (e.kind === 'off') io.note('Off the end: the long fall — steer!');
      else if (!S.told) { S.told = true; io.note('A fall! Steer in the air — the ring of light is where you land.'); }
    } else if (e.type === 'out') {
      S.flip = 0;
      if (e.kind === 'end') return;
      // out of the trough is not out of the ride: any trough one comes down into will do
      io.play(e.kind === 'gap' ? 'fail' : 'jump', { volume: 0.8 });
      io.note(e.kind === 'gap' ? 'Too short!' : e.kind === 'off' ? 'Off the end of the pipe: land on the slide!' : 'Out of the tube! Land in one — any — before the count runs out.');
    } else if (e.type === 'splash') {
      io.play('splash', { volume: e.kind === 'end' ? 1 : 0.7 }); io.splash?.(e.x, e.y, e.z, e.kind === 'end' ? 9 : 5);
      io.note(e.kind === 'end' ? 'Swim back to the beach!' : 'Missed! Back to the last arch…');
      if (e.kind !== 'end') io.play('fail', { volume: 0.7 });
    } else if (e.type === 'thud') { io.play('land'); io.play('fail', { volume: 0.7 }); io.note('Missed! Back to the last arch…'); }
    else if (e.type === 'back') { io.play('respawn'); S.cam = null; if (e.late) io.note(e.on ? 'No tube in time! Put back a little further on.' : 'No tube in time! Back to the last arch.'); else if (e.on) io.note('Put back a little further on.'); }
    else if (e.type === 'mark') io.play('checkpoint', { volume: 0.5 });
    else if (e.type === 'fork') { io.play('boost', { volume: 0.5 }); io.note(`${lineOf(course, e.fork).name}: the short way down`); }
    else if (e.type === 'finish') io.play('victory');
  }

  _makeRing() {
    const geo = new THREE.TorusGeometry(0.52, 0.2, 8, 18);
    geo.rotateX(Math.PI / 2);
    const col = new Float32Array(geo.attributes.position.count * 4);
    for (let i = 0; i < geo.attributes.position.count; i++) {
      const ang = Math.atan2(geo.attributes.position.getZ(i), geo.attributes.position.getX(i)), tone = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 2 ? WHITE : RED;
      col.set([tone[0], tone[1], tone[2], 1], i * 4);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const mesh = new THREE.Mesh(geo, this.world.materials.paint);
    mesh.name = 'slide-ring';
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.world.scene.add(mesh);
    return mesh;
  }

  /** The rings of light that show where a rider out of the trough is going to come down: { ok (green), bad (red) }. */
  _makeMark() {
    const make = (tone, name) => {
      // (a ring lying on what one comes down on, and a thin shaft of light standing in it: seen from behind and above)
      const parts = new Parts(), b = parts.get('glow');
      b.tint(tone[0], tone[1], tone[2], 1);
      for (let k = 0; k < 28; k++) {
        const a0 = (k / 28) * Math.PI * 2, a1 = ((k + 1) / 28) * Math.PI * 2;
        b.quad(V(Math.sin(a0) * 0.85, 0, Math.cos(a0) * 0.85), V(Math.sin(a0) * 1.5, 0, Math.cos(a0) * 1.5), V(Math.sin(a1) * 1.5, 0, Math.cos(a1) * 1.5), V(Math.sin(a1) * 0.85, 0, Math.cos(a1) * 0.85), { normal: V(0, 1, 0) });
      }
      b.cylinder(0, 0, 0, 0.1, 0.04, 4.2, 6);
      const mesh = new THREE.Mesh(b.build(), this.world.materials.glow);
      mesh.name = name;
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = 14; // over the water it lies on
      this.world.scene.add(mesh);
      return mesh;
    };
    return { ok: make([0.25, 1.2, 0.3], 'slide-mark-ok'), bad: make([1.3, 0.12, 0.1], 'slide-mark-bad') };
  }

  /** Every frame: what is too far to be seen is not drawn, and the trough is drawn plainly where it is far. */
  update(dt, time, camera) {
    const d = this._adrift;
    if (d && this._ring) {
      // the ring a rider has left in the sea: it bobs there for a while, turning slowly, and is taken away
      d.t += dt;
      if (d.t > 40) { this._adrift = null; this._ring.visible = false; }
      else {
        const m = this._ring.matrix.makeRotationY(d.yaw + d.t * 0.25);
        m.setPosition(d.x, d.y + 0.04 + Math.sin(d.t * 2.2) * 0.05, d.z);
        this._ring.matrixWorldNeedsUpdate = true;
      }
    }
    if (!camera || !this._cull) return;
    // what moves over the water goes by the clock of the ride that is on (so that what is seen is what is run into)
    const clock = this.session ? this.session.state.clock : time;
    for (const it of this._moving) {
      if (it.swell > 0) it.swell = Math.max(0, it.swell - dt * 2.4);
      if (it.mesh.visible) this._move(it, clock);
    }
    const c = camera.position;
    for (const t of this._stretches) {
      const near = Math.hypot(c.x - t.x, c.y - t.y, c.z - t.z) - t.r < this._near;
      if (t.near.visible !== near) { t.near.visible = near; t.far.visible = !near; }
    }
    this._cull(c);
    // the sparks turn where they hang; those one has caught in this ride are gone
    const got = this.session ? this.session.state.got : null;
    this._lit.forEach((mesh, k) => {
      if (!mesh.visible) return;
      if (got && got.has(k)) { mesh.visible = false; return; }
      const q = this.course.sparks[k];
      mesh.matrix.makeRotationY(time * 2.4 + k).setPosition(q.x, q.y + Math.sin(time * 3 + k) * 0.08, q.z);
      mesh.matrixWorld.copy(mesh.matrix);
    });
  }
}

export { RIDE };
