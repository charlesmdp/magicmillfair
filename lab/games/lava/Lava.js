// Thin Crust: what is seen of it and how it is played. Its rules are in rules.js; here it is built — an islet of
// dark rock in the sea east of the pier, its crater, the lava in it, the sixty-one columns of basalt, an arch on
// the head of the pier where one asks to play — and a round is run: a session that drives the player (see
// PlayerController.driver). The columns are drawn from the round and its clock: everybody who took the same
// start sees the same; who only watches is shown a round that began with the minute.
import * as THREE from 'three';
import { Parts, MeshBuilder } from '../../../src/world/props/MeshBuilder.js';
import { LAYER, staticCaster } from '../../../src/render/Shadows.js';
import { ANIM } from '../../../src/player/Character.js';
import { makeMaterial, GLSL_COMMON, GLSL_SHADOW, GLSL_LIGHTING, GLSL_SURFACE } from '../../../src/render/globals.js';
import { surfaceMaterial } from '../../../src/render/SurfaceMaterial.js';
import { PIER, pierToWorld } from '../../../src/world/layout/layout.js';
import { formatTime } from '../../../src/world/zones/games/course.js';
import { V, clamp, worldClock, nextStart, STARTS, gateArch } from '../kit.js';
import { LAVA, CELLS, FIELD, GONE, RISING, UP, WARN, SINKING, makeRound, columnAt, cellAt, startRun, stepRun, botInput } from './rules.js';

const TAU = Math.PI * 2, S3 = Math.sqrt(3);
const TONES = { Red: '#e23b2e', Blue: '#2f7fe6', Green: '#2fae4f', Yellow: '#f2c14e', Purple: '#9a5be0', Orange: '#f08a24' };
const INNER = FIELD + 1.9; // m from the middle: where the lava meets the rock of the crater
const SHOW = 60; // s: who only watches is shown a round that began so long ago at most
const EMBERS = 28;
// (numbers drawn from whole numbers: what is built is the same on every device)
const rnd = (a, b = 0) => { let h = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul((b | 0) + 0x7F4A7C15, 0x85EBCA6B)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

// ---------------------------------------------------------------------------------------------- materials

const VERT = /* glsl */ `
${GLSL_COMMON}
out vec2 vUv;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vColor;
out vec3 vInst; // of a column — x: how far it is through its warning, y: how hot it is all over (it sinks, it has just risen), z: its own shade
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  vInst = vec3(0.0, 0.0, 1.0);
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  n = mat3(instanceMatrix) * n;
  #endif
  #ifdef USE_INSTANCING_COLOR
  vInst = instanceColor;
  #endif
  vec4 wp = modelMatrix * p;
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * n);
  vUv = uv;
  #ifdef USE_COLOR_ALPHA
  vColor = color;
  #elif defined(USE_COLOR)
  vColor = vec4(color, 1.0);
  #else
  vColor = vec4(1.0);
  #endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const NOISE = /* glsl */ `
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { return vnoise(p) * 0.5 + vnoise(p * 2.03 + 3.1) * 0.3 + vnoise(p * 4.1 + 9.7) * 0.2; }
`;
// A column of basalt: dark stone lit like the rest of the world, red-hot low on its sides where the lava is, and —
// when it warns — veins of fire that open across it and beat faster and faster.
const BASALT_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_SHADOW}
${GLSL_LIGHTING}
${GLSL_SURFACE}
${NOISE}
uniform sampler2D uMap;
uniform float uLavaY;
in vec2 vUv;
in vec3 vWorld;
in vec3 vNormal;
in vec4 vColor;
in vec3 vInst;
void main() {
  vec3 N = normalize(vNormal);
  float side = 1.0 - saturate(N.y);
  // (the stone: the grain of the game's granite, and the cracks that cut a column of basalt into drums)
  float drum = smoothstep(0.0, 0.05, abs(fract(vUv.y * 0.9 + 0.13 * sin(vUv.x * 2.3)) - 0.5) - 0.44) * side;
  vec3 albedo = vColor.rgb * vInst.z * (0.4 + 0.9 * texture(uMap, vUv * 0.45).rgb) * (1.0 - 0.5 * drum);
  albedo *= 1.0 - 0.72 * max(vInst.x, vInst.y); // (what is about to go, or has just come up out of the lava, is charred: its own light shows the better)
  float shadow = sunShadow(vWorld, N);
  Surface s;
  s.albedo = albedo; s.N = N; s.Ng = N; s.rough = 0.78; s.ao = vColor.a; s.spec = 0.2; s.sss = 0.0;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 col = shadeSurface(s, vWorld, V, shadow);
  // the lava below: its light on the sides, strongest at its surface
  float low = 1.0 - smoothstep(0.02, 1.7, vWorld.y - uLavaY);
  col += vec3(2.7, 0.6, 0.08) * low * low * side * (0.8 + 0.2 * sin(uTime * 1.7 + vWorld.x * 1.3 + vWorld.z * 1.9));
  // the warning
  float n = vnoise(vWorld.xz * 1.5) * 0.65 + vnoise(vWorld.xz * 3.6 + 7.3) * 0.35;
  float veins = 1.0 - smoothstep(0.0, 0.07 + 0.12 * vInst.x, abs(n - 0.5));
  float beat = 0.62 + 0.38 * sin(uTime * (9.0 + 17.0 * vInst.x));
  col += (vec3(0.95, 0.11, 0.008) + vec3(2.9, 0.82, 0.07) * veins * beat) * vInst.x;
  col += vec3(1.7, 0.3, 0.025) * vInst.y * (0.45 + 0.55 * side);
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col), 1.0);
}
`;
// The lava: plates of dark crust that drift, the glow between them, brighter veins that open and close.
const LAVA_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
${NOISE}
in vec2 vUv;
in vec3 vWorld;
void main() {
  vec2 p = vWorld.xz * 0.36;
  float t = uTime * 0.05;
  vec2 flow = vec2(fbm(p * 0.55 + t), fbm(p * 0.55 - t + 5.2)) - 0.5;
  float plates = fbm(p + flow * 1.9 + vec2(t * 0.7, -t));
  float cracks = fbm(p * 2.5 - flow * 2.3 + vec2(-t, t * 1.3));
  float crust = smoothstep(0.37, 0.5, plates);
  float vein = 1.0 - smoothstep(0.0, 0.075, abs(cracks - 0.5));
  vec3 hot = mix(vec3(1.9, 0.36, 0.035), vec3(2.6, 1.05, 0.16), saturate(1.2 - plates * 2.6 + vein * 0.3));
  vec3 dark = vec3(0.05, 0.014, 0.012) * (0.6 + 0.8 * cracks) + vec3(1.5, 0.26, 0.03) * vein * vein;
  vec3 col = mix(hot, dark, crust);
  col *= 0.92 + 0.08 * sin(uTime * 0.8 + plates * 11.0);
  // (hotter against the rock of the crater, where it wells up)
  col += vec3(0.9, 0.22, 0.02) * smoothstep(0.88, 1.0, vUv.x);
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col), 1.0);
}
`;

// ---------------------------------------------------------------------------------------------- the game

export class Lava {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'lava';
    this.session = null;
    this.best = 0;
    /** The clock everybody shares (ms): the starts are counted on it. */
    this.clock = worldClock;
    this._shown = { n: NaN, t: NaN };
  }

  build() {
    const world = this.world, mats = world.materials, L = LAVA, cx = L.at.x, cz = L.at.z, parts = new Parts();
    const rock = parts.get('rock');
    // ---- the islet: a ring of rock, low towards the pier (one sees in from there), high behind; it goes down to the bed of the sea
    const SEG = 64, ROWS = 12, crest = [], wob = [], f = [rnd(1, 7) * TAU, rnd(2, 7) * TAU, rnd(3, 7) * TAU, rnd(4, 7) * TAU];
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * TAU, e = 0.5 + 0.5 * Math.cos(a); // (a from the east, where it is highest)
      crest.push(2.7 + 3.7 * e * e + 0.5 * Math.sin(3 * a + f[0]) + 0.32 * Math.sin(7 * a + f[1]) + (rnd(i, 11) - 0.5) * 0.7);
      wob.push(0.9 * Math.sin(2 * a + f[2]) + 0.5 * Math.sin(5 * a + f[3]) + (rnd(i, 12) - 0.5) * 0.6);
    }
    const P = (i, j, out = V(0, 0, 0)) => {
      const k = ((i % SEG) + SEG) % SEG, a = (k / SEG) * TAU, yc = crest[k], w = wob[k], jit = j > 1 && j < 11 ? (rnd(k * 16 + j, 13) - 0.5) * 0.36 : 0;
      // (from the lava up the inside of the crater to its crest, then down a cliff into the sea, and to its bed)
      const [dr, y] = [[-0.6, L.level - 0.9], [0.0, L.level + 0.3], [0.42, L.level + 1.45], [1.05, L.level + (yc - L.level) * 0.74], [1.9, yc], [2.9, yc - 0.25], [4.0 + 0.4 * w, yc * 0.78], [4.9 + 0.6 * w, yc * 0.4], [5.6 + 0.8 * w, 0.25], [6.6 + 0.8 * w, -1.4], [8.0 + 0.5 * w, -5.0], [8.8, -9.2]][j];
      const r = INNER + dr + jit;
      return out.set(cx + Math.cos(a) * r, y + jit * 0.8, cz + Math.sin(a) * r);
    };
    {
      const ids = [], a = V(0, 0, 0), b = V(0, 0, 0), c = V(0, 0, 0), d = V(0, 0, 0), n = V(0, 0, 0), p = V(0, 0, 0);
      for (let i = 0; i <= SEG; i++) {
        ids.push([]);
        let along = 0;
        for (let j = 0; j < ROWS; j++) {
          P(i, j, p);
          P(i + 1, j, a).sub(P(i - 1, j, b));
          P(i, Math.min(ROWS - 1, j + 1), c).sub(P(i, Math.max(0, j - 1), d));
          n.crossVectors(a, c).normalize();
          if (j > 0) along += p.distanceTo(P(i, j - 1, d));
          // (dark stone, darker and warmer down the inside of the crater, a little paler on the crest)
          const inside = j < 4, t = 0.42 + 0.12 * rnd(i * 31 + j, 5) + (j === 4 || j === 5 ? 0.06 : 0);
          const col = inside ? [t * 0.95, t * 0.74, t * 0.66, j < 2 ? 0.55 : 0.8] : [t * 0.86, t * 0.82, t * 0.84, 1];
          ids[i].push(rock.vert(p, n, ((i / SEG) * TAU * (INNER + 4)) / rock.tile, along / rock.tile, col));
        }
      }
      for (let i = 0; i < SEG; i++) for (let j = 0; j + 1 < ROWS; j++) rock.idx.push(ids[i][j], ids[i + 1][j], ids[i][j + 1], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]);
    }
    // ---- teeth of rock along the crest, boulders where the sea breaks on it
    for (let k = 0; k < 7; k++) {
      const i = Math.floor(rnd(k, 21) * SEG), q = P(i, 4), s = 0.8 + rnd(k, 22) * 0.8, t = 0.36 + 0.1 * rnd(k, 23);
      rock.tint(t * 0.86, t * 0.82, t * 0.84, 1).place(q.x, q.y - 0.6, q.z, rnd(k, 24) * TAU, (rnd(k, 25) - 0.5) * 0.5, (rnd(k, 26) - 0.5) * 0.5)
        .lathe([[1.25 * s, -0.6], [1.1 * s, 0.5 * s], [0.85 * s, 1.2 * s], [0.5 * s, 1.75 * s], [0.12 * s, 2.0 * s], [0.01, 2.02 * s]], 5).pop();
    }
    for (let k = 0; k < 12; k++) {
      const i = Math.floor(rnd(k, 31) * SEG), q = P(i, 8), s = 0.6 + rnd(k, 32) * 0.9, t = 0.34 + 0.1 * rnd(k, 33);
      rock.tint(t * 0.86, t * 0.82, t * 0.84, 1).place(q.x + (rnd(k, 34) - 0.5) * 1.6, 0.1, q.z + (rnd(k, 35) - 0.5) * 1.6, rnd(k, 36) * TAU)
        .lathe([[0.02, -0.7 * s], [0.75 * s, -0.5 * s], [1.0 * s, -0.05 * s], [0.85 * s, 0.4 * s], [0.5 * s, 0.72 * s], [0.02, 0.85 * s]], 7).pop();
    }
    // ---- the arch on the head of the pier, where one asks to play: one looks through it at the islet
    const [gx, gz] = pierToWorld(126.5, -6), yaw = Math.atan2(cx - gx, cz - gz);
    this.gate = { x: gx, y: PIER.deckY, z: gz, yaw };
    gateArch(this.group, parts.get('paint'), gx, PIER.deckY, gz, yaw, L.name.toUpperCase(), `A ROUND EVERY ${L.every} SECONDS · KEEP OUT OF THE LAVA`, { tone: [0.85, 0.3, 0.06], ink: '#2a1410' });
    this.group.add(parts.toMeshes(mats, { name: 'lava-islet', layers: staticCaster(world.engine.tier) }));

    // ---- the lava
    {
      const b = new MeshBuilder(), R = INNER + 0.5, N = 40, mid = V(cx, L.level, cz), up = V(0, 1, 0);
      const c0 = b.vert(mid, up, 0, 0);
      for (let i = 0; i <= N; i++) { const a = (i / N) * TAU, id = b.vert(V(cx + Math.cos(a) * R, L.level, cz + Math.sin(a) * R), up, 1, i / N); if (i) b.idx.push(c0, id, id - 1); }
      const mat = makeMaterial({ vertexShader: VERT, fragmentShader: LAVA_FRAG });
      mat.name = 'lava:pool';
      const mesh = new THREE.Mesh(b.build(), mat);
      mesh.name = 'lava-pool'; mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
    // ---- its light on the rock round it, and embers that go up from it (light only: nothing of the sun on them)
    const ember = surfaceMaterial({ name: 'lava:ember', color: [0, 0, 0], rough: 1, spec: 0, emissive: [1, 1, 1], fade: true, side: THREE.DoubleSide });
    {
      const b = new MeshBuilder(), lo = V(0, 0, 0), hi = V(0, 0, 0), n = V(0, 1, 0);
      let pl = 0, ph = 0;
      for (let i = 0; i <= SEG; i++) {
        P(i, 1, lo); P(i, 3, hi);
        const a = (i / SEG) * TAU, ix = -Math.cos(a) * 0.07, iz = -Math.sin(a) * 0.07;
        lo.x += ix; lo.z += iz; lo.y = L.level; hi.x += ix * 3; hi.z += iz * 3; hi.y = Math.min(hi.y, L.level + 2.6);
        const l = b.vert(lo, n, 0, 0, [2.6, 0.62, 0.08, 0.95]), h = b.vert(hi, n, 0, 1, [1.2, 0.2, 0.02, 0]);
        if (i) b.idx.push(pl, l, ph, ph, l, h);
        pl = l; ph = h;
      }
      const mesh = new THREE.Mesh(b.build(), ember);
      mesh.name = 'lava-glow'; mesh.matrixAutoUpdate = false; mesh.renderOrder = 20;
      this.group.add(mesh);
    }
    {
      const b = new MeshBuilder();
      b.lathe([[0.001, -0.07], [0.05, 0], [0.001, 0.07]], 4);
      const spark = surfaceMaterial({ name: 'lava:spark', color: [0, 0, 0], rough: 1, spec: 0, emissive: [1, 1, 1] });
      this.embers = new THREE.InstancedMesh(b.build(), spark, EMBERS);
      this.embers.name = 'lava-embers'; this.embers.frustumCulled = false;
      for (let k = 0; k < EMBERS; k++) this.embers.setColorAt(k, new THREE.Color(0, 0, 0));
      this.group.add(this.embers);
    }
    // ---- the columns: one shape, sixty-one times; each is put where the round has it, every frame
    {
      const b = new MeshBuilder(), R = L.R - 0.055, bev = 0.13, deep = 5.2, corner = (k, r, y) => { const a = (k * 60 + 30) * (Math.PI / 180); return V(Math.cos(a) * r, y, Math.sin(a) * r); };
      const top = [0.215, 0.21, 0.245, 1], edge = [0.16, 0.155, 0.185, 1], side = [0.11, 0.105, 0.13, 1];
      // (its top, a worn edge, its six sides — each side with its own normal: a column of basalt is a crystal)
      b.tint(...top).setTile(1);
      { const up = V(0, 1, 0), ids = []; for (let k = 0; k < 6; k++) { const p = corner(k, R - bev, 0); ids.push(b.vert(p, up, p.x, p.z, top)); } for (let k = 1; k < 5; k++) b.idx.push(ids[0], ids[k + 1], ids[k]); }
      for (let k = 0; k < 6; k++) {
        // (seen from outside the next corner is on the left: each face is listed from there, so that it is its length that runs along the stone's grain and its height up it)
        const a0 = corner(k, R - bev, 0), a1 = corner(k + 1, R - bev, 0), b0 = corner(k, R, -bev), b1 = corner(k + 1, R, -bev), c0 = corner(k, R, -deep), c1 = corner(k + 1, R, -deep), u0 = -(k + 1) * L.R;
        b.quad(b1, b0, a0, a1, { color: edge, u0, v0: -bev });
        b.quad(c1, c0, b0, b1, { color: side, u0, v0: -deep });
      }
      const mat = makeMaterial({ uniforms: { uMap: { value: mats.granite.uniforms.uMap.value }, uLavaY: { value: L.level } }, vertexShader: VERT, fragmentShader: BASALT_FRAG, vertexColors: true });
      mat.name = 'lava:basalt';
      this.columns = new THREE.InstancedMesh(b.build(), mat, CELLS.length);
      this.columns.name = 'lava-columns'; this.columns.frustumCulled = false;
      for (let c = 0; c < CELLS.length; c++) this.columns.setColorAt(c, new THREE.Color(0, 0, 1));
      this.group.add(this.columns);
    }
    this._draw(makeRound(0), -1, 0);
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    return this;
  }

  setBest(ms) { this.best = ms || 0; }
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.4 * 2.4; }
  /** The start one who asks now would leave with: { n, name, at (ms), wait (s), tone }. */
  nextStart() { const st = nextStart(this.clock(), LAVA.every, STARTS); return { ...st, tone: TONES[st.name] || '#f2c14e' }; }

  /** Puts the columns where `round` has them at `t` (s from its start); `time`: for what only trembles and glows. */
  _draw(round, t, time) {
    const L = LAVA, m = this._m || (this._m = new THREE.Matrix4()), o = this._o || (this._o = {}), col = this.columns.instanceColor.array, cx = L.at.x, cz = L.at.z;
    let up = 0;
    for (let c = 0; c < CELLS.length; c++) {
      const C = CELLS[c], s = columnAt(round, c, t, o).state;
      let x = cx + C.x, y = L.level + o.top, z = cz + C.z, warn = 0, hot = 0;
      if (s === GONE) y = -40;
      else if (s === WARN) { const k = o.k, a = 0.016 + 0.03 * k; warn = Math.min(1, k * 9) * (0.58 + 0.42 * k); /* (it shows at once, then more and more) */ x += a * Math.sin(time * 61 + c * 1.9); z += a * Math.cos(time * 53 + c * 2.7); y += a * 0.5 * Math.sin(time * 71 + c); up++; }
      else if (s === SINKING) { warn = 1; hot = 0.4 + 0.6 * o.k; }
      else if (s === RISING) hot = 1 - o.k;
      else up++;
      m.makeTranslation(x, y, z);
      this.columns.setMatrixAt(c, m);
      col[c * 3] = warn; col[c * 3 + 1] = hot; col[c * 3 + 2] = 0.8 + 0.2 * o.level + 0.12 * rnd(c, 3); // (the higher, the paler: heights are read at a glance)
    }
    this.columns.instanceMatrix.needsUpdate = true;
    this.columns.instanceColor.needsUpdate = true;
    this.standing = up;
  }

  /** Every frame: the columns are where the round says — one's own while one plays, else one that began with the minute. */
  update(dt, time, camera) {
    const L = LAVA, s = this.session;
    if (!s && camera && (camera.position.x - L.at.x) ** 2 + (camera.position.z - L.at.z) ** 2 > 320 * 320) return; // (too far to tell)
    const now = this.clock() / 1000;
    if (s) this._draw(s.state.round, s.state.clock, now);
    else { const n = Math.floor(now / SHOW) * Math.round(SHOW / L.every); this._draw(makeRound(n), now - n * L.every, now); }
    // ---- embers: each goes up from somewhere in the lava, again and again
    const m = this._m, col = this.embers.instanceColor.array;
    for (let k = 0; k < EMBERS; k++) {
      const life = 3.2 + 2.6 * rnd(k, 41), age = (now + life * rnd(k, 42)) % life, turn = Math.floor((now + life * rnd(k, 42)) / life), u = age / life;
      const a = rnd(k, 43 + (turn % 97)) * TAU, r = Math.sqrt(rnd(k, 44 + (turn % 89))) * INNER, glow = Math.sin(Math.PI * Math.min(1, u * 1.15)) * (0.75 + 0.25 * Math.sin(now * 9 + k));
      const size = (1 + u) * Math.min(1, glow * 4); // (an ember that no longer glows is not there)
      m.makeScale(size, size, size).setPosition(L.at.x + Math.cos(a) * r + Math.sin(now * 0.9 + k) * 0.5 * u, L.level + 0.2 + u * u * 7.5 + u * 1.5, L.at.z + Math.sin(a) * r + Math.cos(now * 0.7 + k * 2) * 0.5 * u);
      this.embers.setMatrixAt(k, m);
      col[k * 3] = 3.4 * glow; col[k * 3 + 1] = 1.1 * glow; col[k * 3 + 2] = 0.15 * glow;
    }
    this.embers.instanceMatrix.needsUpdate = true;
    this.embers.instanceColor.needsUpdate = true;
  }

  /**
   * A round is asked for: the player is put on the field — on one of the seven columns of the middle — and may
   * walk about it until the next start leaves. `io`: { play, note }. Returns the session — the driver of the
   * player: step(dt, player, control), camera(camera, dt), line, start (its name), over (`score`: how long one
   * held, ms), ended, drop(player), close(), auto (true: it plays by itself).
   */
  open(player, io) {
    const L = LAVA, start = this.nextStart(), events = [], input = { x: 0, y: 0, jump: false };
    const middle = CELLS.map((c, i) => (c.ring <= 1 ? i : -1)).filter((i) => i >= 0);
    const st = startRun(start.n, Math.max(0, (start.at - this.clock()) / 1000), middle[Math.floor(Math.random() * middle.length)]);
    const S = { gone: false, last: 9, after: 0, acc: 0, sunk: 0, warned: null, look: V(0, 0, 0), eye: V(0, 0, 0), o: {} };
    const session = {
      game: this, over: false, ended: false, score: 0, line: '', start, riding: false, anim: ANIM.idle, state: st, auto: false,
      step: (dt, pl, control) => {
        const inp = pl.input, real = (this.clock() - start.at) / 1000, wait = -real;
        if (!S.gone) {
          // (until the round leaves, its time is read on the clock of the world — not counted in frames: everybody leaves together)
          if (Math.ceil(wait) !== S.last && wait > 0 && wait <= 3) { S.last = Math.ceil(wait); io.play('tick'); }
          if (wait <= 0) { S.gone = true; io.play('start'); }
          if (!st.over) st.clock = Math.min(real, 0.25) - Math.min(dt, 0.25);
        }
        if (session.auto) {
          S.acc += Math.min(dt, 0.25);
          while (S.acc >= L.step && !st.over) { S.acc -= L.step; botInput(st, input); stepRun(st, L.step, input, events); }
        } else if (!st.over) {
          input.x = control ? inp.move.x : 0; input.y = control ? inp.move.y : 0; input.jump = control && !!inp.jump;
          stepRun(st, dt, input, events);
        }
        for (const e of events) this._tell(e, io);
        events.length = 0;
        // (the column under the feet begins to warn: a tick, once)
        if (!st.over && st.ground) { const c = cellAt(st.x, st.z); if (c >= 0 && columnAt(st.round, c, st.clock, S.o).state === WARN) { const key = c * 1000 + st.round.lives[c].length; if (S.warned !== key) { S.warned = key; io.play('tick', { volume: 0.7 }); } } }
        if (st.over) {
          // in the lava: one goes down into it, and that is the end of the round
          S.after += dt; S.sunk = Math.min(1.5, S.sunk + dt * 0.75);
          if (!session.over) { session.over = true; session.score = st.clock > 0 ? st.time : 0; }
          if (S.after > 2) session.ended = true;
        }
        pl.pos.set(L.at.x + st.x, L.level + st.h - S.sunk, L.at.z + st.z);
        pl.yaw = st.face; pl.pitch = 0; pl.roll = 0;
        pl.speed = Math.sqrt(st.vx * st.vx + st.vz * st.vz); pl.grounded = st.ground;
        session.anim = st.over ? ANIM.dead : !st.ground ? ANIM.jump : pl.speed > 0.6 ? ANIM.run : ANIM.idle;
        session.line = st.over ? `${L.name} · held ${formatTime(session.score)}`
          : !S.gone ? `${L.name} · ${start.name} start in ${Math.max(1, Math.ceil(wait))}…`
            : `${formatTime(Math.round(st.clock * 1000))} · ${this.standing} column${this.standing === 1 ? '' : 's'} standing`;
      },
      /** The camera: fixed, high over the rim behind the field, the whole of it in view; it leans a little after the player. */
      camera: (cam, dt) => {
        const tall = cam.aspect < 1, follow = tall ? 0.72 : 0.3, [fx, fz] = L.look;
        S.look.set(L.at.x + st.x * follow + fx * 1.2, L.level + 0.9, L.at.z + st.z * follow + fz * 1.2);
        S.eye.set(L.at.x + st.x * follow * 0.6 - fx * 22, L.level + 17.5, L.at.z + st.z * follow * 0.6 - fz * 22);
        cam.position.copy(S.eye); cam.up.set(0, 1, 0); cam.lookAt(S.look);
        return tall ? 74 : 49;
      },
      /** The round is over (or left): the player is put back before the arch, on the pier. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x, this.gate.z, this.gate.yaw); session.close(); },
      close: () => { if (this.session === session) this.session = null; },
    };
    this.session = session;
    session.step(0, player, false);
    return session;
  }

  _tell(e, io) {
    if (e.type === 'jump') io.play('jump', { volume: 0.5 });
    else if (e.type === 'land') io.play('land', { volume: 0.35 });
    else if (e.type === 'out') { io.play('fail'); io.note(e.time > 0 ? `In the lava! You held ${formatTime(e.time)}.` : 'In the lava before the round had even left.', 3200); }
  }
}
void LAYER; void UP; void S3; void clamp;
