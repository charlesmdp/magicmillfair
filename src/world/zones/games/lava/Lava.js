// Thin Crust: what is seen of it and how it is played. Its rules are in rules.js; here it is built — a small
// volcano of dark rock in the sea east of the pier, its crater, the lava deep in it, the sixty-one columns of
// basalt, an arch on the head of the pier where one asks to play — and a round is run: a session that drives the
// player (see PlayerController.driver). The lava and the columns are drawn from the round and its clock:
// everybody who took the same start sees the same; who only watches is shown the latest round to have left on an
// even minute. The crater holds what it shows: it is as deep as the lava can ever rise, and opens as it goes up.
import * as THREE from 'three';
import { Parts, MeshBuilder } from '../../../props/MeshBuilder.js';
import { staticCaster } from '../../../../render/Shadows.js';
import { ANIM } from '../../../../player/Character.js';
import { makeMaterial, GLSL_COMMON, GLSL_SHADOW, GLSL_LIGHTING, GLSL_SURFACE } from '../../../../render/globals.js';
import { surfaceMaterial } from '../../../../render/SurfaceMaterial.js';
import { PIER, pierToWorld } from '../../../layout/layout.js';
import { formatTime } from '../course.js';
import { V, clamp, worldClock, nextStart, STARTS, gateArch } from '../gates.js';
import { LAVA, CONE, CELLS, FIELD, PULSES, UNDER, GLOW, RISING, twice, makeRound, lavaAt, columnAt, startRun, stepRun, botInput } from './rules.js';

const TAU = Math.PI * 2;
const TONES = { Red: '#e23b2e', Blue: '#2f7fe6', Green: '#2fae4f', Yellow: '#f2c14e', Purple: '#9a5be0', Orange: '#f08a24' };
const INNER = FIELD + 1.9; // m from the middle: where the lava meets the rock of the crater as a round begins
const VIEW = { back: 16, up: 18, ahead: -2.6 }; // the camera: so far behind the middle of the field, so high over the lava; where it looks, past the middle
const SHOW = 120; // s: who only watches is shown a round that began so long ago at most
const EMBERS = 40, PUFFS = 12, BUBBLES = 14, SPURTS = 3, DROPS = 5; // (a spurt throws so many drops)
// (numbers drawn from whole numbers: what is built is the same on every device)
const rnd = (a, b = 0) => { let h = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul((b | 0) + 0x7F4A7C15, 0x85EBCA6B)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

// ---------------------------------------------------------------------------------------------- materials

const VERT = /* glsl */ `
${GLSL_COMMON}
out vec2 vUv;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vColor;
out vec3 vInst; // of a column — x: how near the lava is to covering it, y: how hot it is all over (it has just come up; 2 and more: it is only a glow in the lava yet, the whiter the higher it will stand), z: its own shade
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
// Basalt — the columns, and the inside of the crater: dark stone lit like the rest of the world, red-hot where the
// lava is; veins of fire that open across a column the lava is about to cover, and beat faster and faster; and,
// where a column is about to come up, its head white-hot in the lava with rings running over it.
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
  float glows = step(1.5, vInst.y), tall = saturate(vInst.y - 2.0), hot = vInst.y * (1.0 - glows);
  // (the stone: the grain of the game's granite, and the cracks that cut a column of basalt into drums)
  #ifdef CRATER
  // (the inside of the crater: beds of rock, broken ones, of no two heights the same)
  float drum = smoothstep(0.0, 0.06, abs(fract(vUv.y * 0.37 + 0.6 * vnoise(vUv * vec2(0.11, 0.3))) - 0.5) - 0.43) * step(0.42, vnoise(vUv * vec2(0.3, 1.9) + 3.7)) * 0.6;
  #else
  float drum = smoothstep(0.0, 0.05, abs(fract(vUv.y * 0.9 + 0.13 * sin(vUv.x * 2.3)) - 0.5) - 0.44) * side;
  #endif
  vec3 albedo = vColor.rgb * vInst.z * (0.4 + 0.9 * texture(uMap, vUv * 0.45).rgb) * (1.0 - 0.5 * drum);
  albedo *= 1.0 - 0.72 * max(vInst.x, hot); // (what is about to be covered, or has just come up out of the lava, is charred: its own light shows the better)
  float shadow = sunShadow(vWorld, N);
  Surface s;
  s.albedo = albedo; s.N = N; s.Ng = N; s.rough = 0.78; s.ao = vColor.a; s.spec = 0.2; s.sss = 0.0;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 col = shadeSurface(s, vWorld, V, shadow);
  // the lava below: its light on the sides, strongest at its surface, and a little of it on everything in the crater
  float over = vWorld.y - uLavaY, low = 1.0 - smoothstep(0.02, 2.0, over);
  col += vec3(2.7, 0.6, 0.08) * low * low * side * (0.8 + 0.2 * sin(uTime * 1.7 + vWorld.x * 1.3 + vWorld.z * 1.9));
  col += albedo * vec3(1.25, 0.5, 0.2) * (1.0 - smoothstep(2.0, 16.0, over)) * (0.35 + 0.65 * side);
  // the lava is about to cover it
  float n = vnoise(vWorld.xz * 1.5) * 0.65 + vnoise(vWorld.xz * 3.6 + 7.3) * 0.35;
  float veins = 1.0 - smoothstep(0.0, 0.07 + 0.12 * vInst.x, abs(n - 0.5));
  float beat = 0.62 + 0.38 * sin(uTime * (9.0 + 17.0 * vInst.x));
  col += (vec3(0.95, 0.11, 0.008) + vec3(2.9, 0.82, 0.07) * veins * beat) * vInst.x;
  col += vec3(1.7, 0.3, 0.025) * hot * (0.45 + 0.55 * side);
  // a column is about to come up here
  float rings = 0.5 + 0.5 * sin(length(vUv) * 7.5 - uTime * 9.0);
  vec3 head = mix(vec3(2.9, 0.95, 0.1), vec3(3.6, 3.1, 2.2), tall) * (0.6 + 0.4 * rings) * (0.86 + 0.14 * sin(uTime * 13.0 + vWorld.x));
  col = mix(col, head, glows);
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col), 1.0);
}
`;
// The lava: plates of dark crust that drift, the glow between them, brighter veins that open and close; before a
// rise, and while it rises, the crust breaks up and the whole pool brightens.
const LAVA_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
${NOISE}
uniform float uHeat;
uniform float uSurge; // 0 to 1: the lava is rising — it swells, and a wave of light runs out from the middle
in vec2 vUv;
in vec3 vWorld;
void main() {
  vec2 p = vWorld.xz * 0.36;
  float t = uTime * 0.05;
  vec2 flow = vec2(fbm(p * 0.55 + t), fbm(p * 0.55 - t + 5.2)) - 0.5;
  float plates = fbm(p + flow * 1.9 + vec2(t * 0.7, -t));
  float cracks = fbm(p * 2.5 - flow * 2.3 + vec2(-t, t * 1.3));
  float crust = smoothstep(0.37 + 0.11 * uHeat, 0.5 + 0.11 * uHeat, plates);
  float vein = 1.0 - smoothstep(0.0, 0.075 + 0.05 * uHeat, abs(cracks - 0.5));
  vec3 hot = mix(vec3(1.9, 0.36, 0.035), vec3(2.6, 1.05, 0.16), saturate(1.2 - plates * 2.6 + vein * 0.3 + 0.25 * uHeat));
  vec3 dark = vec3(0.05, 0.014, 0.012) * (0.6 + 0.8 * cracks) + vec3(1.5, 0.26, 0.03) * vein * vein;
  vec3 col = mix(hot, dark, crust);
  col *= 0.92 + 0.08 * sin(uTime * 0.8 + plates * 11.0) + 0.12 * uHeat;
  col += vec3(1.6, 0.5, 0.06) * uSurge * (0.5 + 0.5 * sin(vUv.x * 18.0 - uTime * 11.0)) * (1.0 - crust * 0.6);
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
    /** What was last drawn: the level of the lava (rises so far), its height (m over where it begins), s before it rises again (0 and less: it is rising; Infinity: never again). */
    this.shown = { level: 0, pool: 0, soon: Infinity, surge: 0 };
  }

  build() {
    const world = this.world, mats = world.materials, L = LAVA, cx = L.at.x, cz = L.at.z, parts = new Parts();
    const rock = parts.get('rock'), wall = new MeshBuilder();
    // ---- the volcano: a cone of rock that goes down to the bed of the sea, highest behind (the east), and the
    // crater in it — as deep as the lava can rise, wider as it goes up
    const SEG = 64, ROWS = 17, LIP = 6, crest = [], wob = [], f = [rnd(1, 7) * TAU, rnd(2, 7) * TAU, rnd(3, 7) * TAU, rnd(4, 7) * TAU];
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * TAU, e = 0.5 + 0.5 * Math.cos(a); // (a from the east)
      crest.push(CONE.rim + 1.6 * e * e + 0.5 * Math.sin(3 * a + f[0]) + 0.3 * Math.sin(7 * a + f[1]) + 0.7 * Math.max(0, Math.sin(2 * a + f[2])) + (rnd(i, 11) - 0.5) * 0.6);
      wob.push(0.9 * Math.sin(2 * a + f[2]) + 0.5 * Math.sin(5 * a + f[3]) + (rnd(i, 12) - 0.5) * 0.6);
    }
    const P = (i, j, out = V(0, 0, 0)) => {
      const k = ((i % SEG) + SEG) % SEG, a = (k / SEG) * TAU, yc = crest[k], w = wob[k], lip = yc - 0.55, rl = INNER + CONE.flare * (lip - L.level);
      let r, y;
      if (j === 0) { r = INNER - 0.7; y = L.level - 1.4; } // (under the lava)
      else if (j <= LIP) { // up the inside of the crater, to its lip
        y = L.level + [0, 0, 0.17, 0.36, 0.56, 0.78, 1][j] * (lip - L.level) - (j === 1 ? 0.06 : 0);
        r = INNER + CONE.flare * (y - L.level) + (j > 1 && j < LIP ? (rnd(k * 16 + j, 13) - 0.5) * 0.22 : 0);
      } else if (j === 7) { r = rl + 0.85; y = yc; } // (the crest)
      else if (j === 8) { r = rl + 1.75; y = yc - 0.4; }
      else if (j <= 12) { // down the cone: steep under the crest, wider at its foot
        const h = [0.8, 0.58, 0.36, 0.17][j - 9];
        y = yc * h; r = CONE.foot - (CONE.foot - rl - 1.75) * Math.pow(h, 0.62) + 0.3 * w * (1 - h) + (rnd(k * 16 + j, 13) - 0.5) * 0.4;
      } else { const [dr, deep] = [[0, 0.25], [0.3, -1.4], [0.5, -5], [0.6, -9.2]][j - 13]; r = CONE.foot + dr + 0.3 * w * (j === 13 ? 1 : 0.5); y = deep; } // (into the sea, and to its bed)
      return out.set(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
    };
    {
      const inside = [], outside = [], a = V(0, 0, 0), b = V(0, 0, 0), c = V(0, 0, 0), d = V(0, 0, 0), n = V(0, 0, 0), p = V(0, 0, 0);
      for (let i = 0; i <= SEG; i++) {
        inside.push([]); outside.push([]);
        let along = 0;
        // (an old flow of lava down the cone here and there: darker, and a little red)
        const flow = rnd(Math.floor((i % SEG) / 2), 51) < 0.24;
        for (let j = 0; j < ROWS; j++) {
          P(i, j, p);
          P(i + 1, j, a).sub(P(i - 1, j, b));
          P(i, Math.min(ROWS - 1, j + 1), c).sub(P(i, Math.max(0, j - 1), d));
          n.crossVectors(a, c).normalize();
          if (j > 0) along += p.distanceTo(P(i, j - 1, d));
          const u = (i / SEG) * TAU * (INNER + 4), t = 0.42 + 0.12 * rnd((i % SEG) * 31 + j, 5);
          if (j <= LIP) { const s = 0.52 + 0.12 * rnd((i % SEG) * 31 + j, 5); inside[i].push(wall.vert(p, n, u, along, [s * 0.17, s * 0.135, s * 0.125, j < 2 ? 0.6 : 0.85])); }
          if (j >= LIP) {
            // (burnt black under the crest, the paler ash of old eruptions towards the foot, bed over bed)
            const ash = [0, 0, 0, 0.1, 0.4, 0.75, 1, 1, 0.8, 0.8, 0.8][j - LIP], bed = j > 8 && j < 13 ? 0.94 + 0.12 * rnd(j, 61) : 1, old = flow && j > 7 && j < 14;
            const k = t * (0.72 + 0.6 * ash) * bed * (old ? 0.5 : 1);
            outside[i].push(rock.vert(p, n, u / rock.tile, along / rock.tile, j === LIP ? [k * 0.9, k * 0.74, k * 0.68, 0.85] : [k * (0.86 + 0.1 * ash) * (old ? 1.1 : 1), k * (0.8 + 0.06 * ash), k * (0.82 - 0.08 * ash), 1]));
          }
        }
      }
      for (let i = 0; i < SEG; i++) {
        for (let j = 0; j < LIP; j++) wall.idx.push(inside[i][j], inside[i + 1][j], inside[i][j + 1], inside[i + 1][j], inside[i + 1][j + 1], inside[i][j + 1]);
        for (let j = 0; j + 1 < ROWS - LIP; j++) rock.idx.push(outside[i][j], outside[i + 1][j], outside[i][j + 1], outside[i + 1][j], outside[i + 1][j + 1], outside[i][j + 1]);
      }
    }
    // ---- teeth of rock along the crest, boulders where the sea breaks on the foot
    for (let k = 0; k < 11; k++) {
      const i = Math.floor(rnd(k, 21) * SEG), q = P(i, 7), s = 0.75 + rnd(k, 22) * 0.65, t = 0.3 + 0.1 * rnd(k, 23);
      rock.tint(t * 0.86, t * 0.82, t * 0.84, 1).place(q.x, q.y - 0.6, q.z, rnd(k, 24) * TAU, (rnd(k, 25) - 0.5) * 0.5, (rnd(k, 26) - 0.5) * 0.5)
        .lathe([[1.25 * s, -0.6], [1.1 * s, 0.5 * s], [0.85 * s, 1.2 * s], [0.5 * s, 1.75 * s], [0.12 * s, 2.0 * s], [0.01, 2.02 * s]], 5).pop();
    }
    for (let k = 0; k < 12; k++) {
      const i = Math.floor(rnd(k, 31) * SEG), q = P(i, 13), s = 0.6 + rnd(k, 32) * 0.9, t = 0.34 + 0.1 * rnd(k, 33), far = Math.hypot(q.x - cx, q.z - cz), pull = Math.min(1, (CONE.foot + 0.2 - s) / far); // (none of them beyond the foot)
      rock.tint(t * 0.86, t * 0.82, t * 0.84, 1).place(cx + (q.x - cx) * pull, 0.1, cz + (q.z - cz) * pull, rnd(k, 36) * TAU)
        .lathe([[0.02, -0.7 * s], [0.75 * s, -0.5 * s], [1.0 * s, -0.05 * s], [0.85 * s, 0.4 * s], [0.5 * s, 0.72 * s], [0.02, 0.85 * s]], 7).pop();
    }
    // ---- the arch on the head of the pier, where one asks to play: one looks through it at the volcano
    const [gx, gz] = pierToWorld(126.5, -6), yaw = Math.atan2(cx - gx, cz - gz);
    this.gate = { x: gx, y: PIER.deckY, z: gz, yaw };
    gateArch(this.group, parts.get('paint'), gx, PIER.deckY, gz, yaw, L.name.toUpperCase(), `A ROUND EVERY ${L.every} SECONDS · THE LAVA ONLY RISES`, { tone: [0.85, 0.3, 0.06], ink: '#2a1410' });
    this.group.add(parts.toMeshes(mats, { name: 'lava-islet', layers: staticCaster(world.engine.tier) }));

    // ---- basalt: the inside of the crater (the lava lights it from below, wherever it is) and the columns
    const basalt = (defines = {}) => { const mat = makeMaterial({ uniforms: { uMap: { value: mats.granite.uniforms.uMap.value }, uLavaY: { value: L.level } }, defines, vertexShader: VERT, fragmentShader: BASALT_FRAG, vertexColors: true }); mat.name = 'lava:basalt'; return mat; };
    {
      const mesh = new THREE.Mesh(wall.build(), basalt({ CRATER: 1 }));
      mesh.name = 'lava-crater'; mesh.matrixAutoUpdate = false;
      this.crater = mesh;
      this.group.add(mesh);
    }
    // ---- the lava: a disc that goes up the crater, and widens as the crater does
    {
      const b = new MeshBuilder(), N = 40, up = V(0, 1, 0);
      const c0 = b.vert(V(0, 0, 0), up, 0, 0);
      for (let i = 0; i <= N; i++) { const a = (i / N) * TAU, id = b.vert(V(Math.cos(a), 0, Math.sin(a)), up, 1, i / N); if (i) b.idx.push(c0, id, id - 1); }
      const mat = makeMaterial({ uniforms: { uHeat: { value: 0 }, uSurge: { value: 0 } }, vertexShader: VERT, fragmentShader: LAVA_FRAG });
      mat.name = 'lava:pool';
      this.pool = new THREE.Mesh(b.build(), mat);
      this.pool.name = 'lava-pool'; this.pool.matrixAutoUpdate = false; this.pool.frustumCulled = false;
      this.group.add(this.pool);
    }
    // ---- embers that go up from it (light only: nothing of the sun on them)
    {
      const b = new MeshBuilder();
      b.lathe([[0.001, -0.07], [0.05, 0], [0.001, 0.07]], 4);
      const spark = surfaceMaterial({ name: 'lava:spark', color: [0, 0, 0], rough: 1, spec: 0, emissive: [1, 1, 1] });
      this.embers = new THREE.InstancedMesh(b.build(), spark, EMBERS);
      this.embers.name = 'lava-embers'; this.embers.frustumCulled = false;
      for (let k = 0; k < EMBERS; k++) this.embers.setColorAt(k, new THREE.Color(0, 0, 0));
      this.group.add(this.embers);
    }
    // ---- bubbles that swell on the lava and burst, and spurts of it thrown up in drops (light only, like the embers)
    {
      const b = new MeshBuilder();
      b.lathe([[0.001, -1], [0.7, -0.7], [1, 0], [0.7, 0.7], [0.001, 1]], 7);
      this.blobs = new THREE.InstancedMesh(b.build(), this.embers.material, BUBBLES + SPURTS * DROPS);
      this.blobs.name = 'lava-blobs'; this.blobs.frustumCulled = false;
      for (let k = 0; k < BUBBLES + SPURTS * DROPS; k++) this.blobs.setColorAt(k, new THREE.Color(0, 0, 0));
      this.group.add(this.blobs);
    }
    // ---- smoke over the crater, seen from the pier: round puffs that go up and drift out to sea, redder at the
    // mouth the higher the lava stands (who plays is under it, and is spared it)
    {
      const b = new MeshBuilder();
      b.lathe([[0.001, -1], [0.6, -0.8], [0.94, -0.34], [1, 0.1], [0.82, 0.58], [0.46, 0.89], [0.001, 1]], 7);
      this.smoke = new THREE.InstancedMesh(b.build(), surfaceMaterial({ name: 'lava:smoke', color: [1, 1, 1], rough: 1, spec: 0 }), PUFFS);
      this.smoke.name = 'lava-smoke'; this.smoke.frustumCulled = false;
      for (let k = 0; k < PUFFS; k++) this.smoke.setColorAt(k, new THREE.Color(0.5, 0.5, 0.5));
      this.group.add(this.smoke);
    }
    // ---- the columns: one shape, sixty-one times — a prism long enough to stand in the lava whatever its level;
    // each is put where the round has it, every frame
    {
      const b = new MeshBuilder(), R = L.R - 0.055, bev = 0.13, deep = 5 * L.lv + 0.9, corner = (k, r, y) => { const a = (k * 60 + 30) * (Math.PI / 180); return V(Math.cos(a) * r, y, Math.sin(a) * r); };
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
      this.columns = new THREE.InstancedMesh(b.build(), basalt(), CELLS.length);
      this.columns.name = 'lava-columns'; this.columns.frustumCulled = false;
      for (let c = 0; c < CELLS.length; c++) this.columns.setColorAt(c, new THREE.Color(0, 0, 1));
      this.group.add(this.columns);
    }
    this.group.updateMatrixWorld(true);
    this._draw(makeRound(0), -1, 0);
    world.scene.add(this.group);
    return this;
  }

  setBest(ms) { this.best = ms || 0; }
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.4 * 2.4; }
  /** The start one who asks now would leave with: { n, name, at (ms), wait (s), tone }. */
  nextStart() { const st = nextStart(this.clock(), LAVA.every, STARTS); return { ...st, tone: TONES[st.name] || '#f2c14e' }; }

  /** Puts the lava and the columns where `round` has them at `t` (s from its start); `time`: for what only trembles and glows. */
  _draw(round, t, time) {
    const L = LAVA, m = this._m || (this._m = new THREE.Matrix4()), o = this._o || (this._o = {}), col = this.columns.instanceColor.array, cx = L.at.x, cz = L.at.z;
    // the lava: how high; how soon it rises again — the columns it will cover then say so, more and more
    const lava = lavaAt(round, t), pool = lava * L.lv, level = Math.floor(lava + 1e-9), soon = level < round.high ? PULSES[level] - t : Infinity, heat = soon <= 0 ? 1 : clamp(1 - soon / 2.6, 0, 1);
    for (let c = 0; c < CELLS.length; c++) {
      const C = CELLS[c], s = columnAt(round, c, t, o, lava).state;
      let x = cx + C.x, y = L.level + o.top, z = cz + C.z, warn = 0, hot = 0;
      if (s === UNDER) y -= 0.7; // (under the lava: out of the way of its surface)
      else if (s === GLOW) hot = 2 + clamp((o.level - level - 2) / 3, 0, 1);
      else if (s === RISING) { hot = 1; const a = 0.07 * (1 - o.k); x += a * Math.sin(time * 71 + c * 2.3); z += a * Math.cos(time * 67 + c * 1.7); } // (it shudders as it comes up)
      else {
        hot = Math.max(0, 1 - o.k / 1.5); // (it cools)
        if (o.level === level + 1 && heat > 0) { const a = 0.012 + 0.03 * heat; warn = heat * (0.55 + 0.45 * heat); x += a * Math.sin(time * 61 + c * 1.9); z += a * Math.cos(time * 53 + c * 2.7); }
      }
      m.makeTranslation(x, y, z);
      this.columns.setMatrixAt(c, m);
      col[c * 3] = warn; col[c * 3 + 1] = hot; col[c * 3 + 2] = 0.5 + 0.16 * clamp(o.level - lava, 0, 4.5) + 0.05 * rnd(c, 3); // (the higher over the lava, the paler: heights are read at a glance)
    }
    this.columns.instanceMatrix.needsUpdate = true;
    this.columns.instanceColor.needsUpdate = true;
    const wide = INNER + 0.5 + CONE.flare * pool, surge = lava - level > 1e-9 ? Math.sin(Math.PI * (lava - level)) : 0; // (0 to 1 and back while it rises)
    // (as it rises the pool swells a little over where the rules have it — a few centimetres, never over a column's top)
    this.pool.matrix.makeScale(wide, 1, wide).setPosition(cx, L.level + pool + 0.07 * surge, cz);
    this.pool.material.uniforms.uSurge.value = surge;
    this.pool.matrixWorld.copy(this.pool.matrix);
    this.pool.material.uniforms.uHeat.value = heat * heat;
    this.columns.material.uniforms.uLavaY.value = this.crater.material.uniforms.uLavaY.value = L.level + pool;
    this.shown.level = level; this.shown.pool = pool; this.shown.soon = soon; this.shown.surge = surge;
  }

  /** Every frame: the lava and the columns are where the round says — one's own while one plays, else the latest to have left on an even minute. */
  update(dt, time, camera) {
    const L = LAVA, s = this.session;
    if (!s && camera && (camera.position.x - L.at.x) ** 2 + (camera.position.z - L.at.z) ** 2 > 320 * 320) return; // (too far to tell)
    const now = this.clock() / 1000;
    if (s) this._draw(s.state.round, s.state.clock, now);
    else { const n = Math.floor(now / SHOW) * Math.round(SHOW / L.every); this._draw(makeRound(n), now - n * L.every, now); }
    // ---- embers: each goes up from somewhere in the lava, again and again
    const m = this._m, col = this.embers.instanceColor.array, base = L.level + this.shown.pool;
    for (let k = 0; k < EMBERS; k++) {
      const life = (3.2 + 2.6 * rnd(k, 41)) * 0.8, age = (now + life * rnd(k, 42)) % life, turn = Math.floor((now + life * rnd(k, 42)) / life), u = age / life;
      const a = rnd(k, 43 + (turn % 97)) * TAU, r = Math.sqrt(rnd(k, 44 + (turn % 89))) * INNER, glow = Math.sin(Math.PI * Math.min(1, u * 1.15)) * (0.75 + 0.25 * Math.sin(now * 9 + k));
      const size = (1 + u) * Math.min(1, glow * 4); // (an ember that no longer glows is not there)
      m.makeScale(size, size, size).setPosition(L.at.x + Math.cos(a) * r + Math.sin(now * 0.9 + k) * 0.5 * u, base + 0.2 + u * u * 7.5 + u * 1.5, L.at.z + Math.sin(a) * r + Math.cos(now * 0.7 + k * 2) * 0.5 * u);
      this.embers.setMatrixAt(k, m);
      const hot = 1 + 0.8 * this.shown.surge;
      col[k * 3] = 3.4 * glow * hot; col[k * 3 + 1] = 1.1 * glow * hot; col[k * 3 + 2] = 0.15 * glow;
    }
    this.embers.instanceMatrix.needsUpdate = true;
    this.embers.instanceColor.needsUpdate = true;
    // ---- bubbles: each swells somewhere on the lava, and bursts; more and quicker as a rise comes and while it rises
    const bc = this.blobs.instanceColor.array, stir = 1 + 1.5 * this.shown.surge + (this.shown.soon > 0 && this.shown.soon < 1.5 ? 1.5 - this.shown.soon : 0);
    this._boil = ((this._boil ?? now % 1000) + Math.min(dt, 0.1) * stir) % 100000; this._spit = ((this._spit ?? now % 1000) + Math.min(dt, 0.1) * (1 + this.shown.surge)) % 100000; // (their own clocks: quicker as a rise comes)
    for (let k = 0; k < BUBBLES; k++) {
      const life = 1.4 + 1.6 * rnd(k, 81), clock = this._boil + life * rnd(k, 82), u = (clock % life) / life, turn = Math.floor(clock / life);
      const a = rnd(k, 83 + (turn % 71)) * TAU, r = Math.sqrt(rnd(k, 84 + (turn % 67))) * (INNER - 0.6), size = 0.32 * (0.6 + 0.6 * rnd(k, 85 + (turn % 59))) * Math.sqrt(u) * (u < 0.92 ? 1 : 0);
      m.makeScale(size, size * 0.55, size).setPosition(L.at.x + Math.cos(a) * r, base + 0.02, L.at.z + Math.sin(a) * r);
      this.blobs.setMatrixAt(k, m);
      const g = 1.2 + 1.4 * u * u;
      bc[k * 3] = 2.6 * g; bc[k * 3 + 1] = 0.75 * g; bc[k * 3 + 2] = 0.1 * g;
    }
    // ---- spurts: now and then a fountain of drops thrown up out of the lava, falling back into it
    for (let j = 0; j < SPURTS; j++) {
      const life = 2.6 + 2 * rnd(j, 91), clock = this._spit + life * rnd(j, 92), age = clock % life, turn = Math.floor(clock / life), fly = 0.9;
      const a = rnd(j, 93 + (turn % 83)) * TAU, r = Math.sqrt(rnd(j, 94 + (turn % 79))) * (INNER - 0.8), px = L.at.x + Math.cos(a) * r, pz = L.at.z + Math.sin(a) * r;
      for (let d = 0; d < DROPS; d++) {
        const i = BUBBLES + j * DROPS + d, va = rnd(j * 7 + d, 95 + (turn % 73)) * TAU, vo = 0.6 + 1.2 * rnd(j * 7 + d, 96), up = 4 + 2.5 * rnd(j * 7 + d, 97 + (turn % 61));
        const t = age < fly ? age : 0, y = base + up * t - 7 * t * t, size = age < fly && y > base - 0.05 ? 0.09 + 0.05 * rnd(j, d) : 0;
        m.makeScale(size, size * 1.4, size).setPosition(px + Math.cos(va) * vo * t, y, pz + Math.sin(va) * vo * t);
        this.blobs.setMatrixAt(i, m);
        bc[i * 3] = 3.2; bc[i * 3 + 1] = 1.1; bc[i * 3 + 2] = 0.16;
      }
    }
    this.blobs.instanceMatrix.needsUpdate = true;
    this.blobs.instanceColor.needsUpdate = true;
    // ---- smoke: each puff swells as it leaves the mouth of the crater, goes up, drifts east, thins out
    const tint = this.smoke.instanceColor.array, full = clamp(this.shown.pool / (L.top * L.lv), 0, 1);
    for (let k = 0; k < PUFFS; k++) {
      const life = 15 + 5 * rnd(k, 71), u = ((now + life * rnd(k, 72)) % life) / life, turn = Math.floor((now + life * rnd(k, 72)) / life), a = rnd(k, 73 + (turn % 53)) * TAU, r = 5 * rnd(k, 74 + (turn % 61));
      const size = s ? 0 : (2.2 + 4.2 * Math.sqrt(u)) * Math.min(1, u * 9) * Math.min(1, (1 - u) * 2.6), warm = (1 - Math.min(1, u * 3.5)) * (0.25 + 0.75 * full);
      m.makeScale(size, size * 0.86, size).setPosition(L.at.x + Math.cos(a) * r * (1 + u) + 26 * u * u, CONE.rim - 2 + 34 * u - 9 * u * u, L.at.z + Math.sin(a) * r * (1 + u) - 7 * u * u);
      this.smoke.setMatrixAt(k, m);
      const grey = 0.4 + 0.22 * u + 0.06 * rnd(k, 75);
      tint[k * 3] = grey + 1.5 * warm; tint[k * 3 + 1] = grey + 0.34 * warm; tint[k * 3 + 2] = grey * 1.04;
    }
    this.smoke.instanceMatrix.needsUpdate = true;
    this.smoke.instanceColor.needsUpdate = true;
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
    const S = { gone: false, last: 9, after: 0, acc: 0, sunk: 0, rises: 0, told: 0, count: 9, shake: 0, said: 0, cam: 0, look: V(0, 0, 0), eye: V(0, 0, 0) };
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
        // ---- the lava: how high it is, how soon it rises again; a word before the first rise, a sound at each
        const lava = lavaAt(st.round, st.clock), level = Math.floor(lava + 1e-9), rising = lava - level > 1e-9, soon = level < st.round.high ? PULSES[level] - st.clock : Infinity;
        if (!st.over) {
          if (!S.told && soon < 5 && level === 0 && st.clock > 0) { S.told = 1; io.note('The lava is about to rise: up on a higher column!', 3200); }
          // (the count of the last seconds before a rise: two soft ticks, then the last second — the columns about
          // to go under beat, the camera shivers — and a rumble as the lava surges, the camera shaken)
          const count = soon > 0 && soon <= 2 && st.clock > 0 ? Math.ceil(soon) : 9;
          if (count < S.count) io.play('tick', { volume: count === 1 ? 0.9 : 0.5 });
          S.count = count;
          if (level + (rising ? 1 : 0) > S.rises) {
            S.rises = level + (rising ? 1 : 0); S.shake = 1;
            io.play('whack', { volume: 0.75 }); io.play('hit', { volume: 0.45 });
            if (S.rises === 1 && S.told < 2) { S.told = 2; io.note('New columns come up where the lava glows — the whiter, the higher.', 3600); }
            // (a double rise is said two pulses ahead, and again before it)
            if (twice(S.rises + 3) && S.said < S.rises) { S.said = S.rises; io.play('bell', { volume: 0.7 }); io.note('After the next rise, the lava rises twice in a row — think two levels up!', 3600); }
            if (twice(S.rises + 2) && S.said < S.rises) { S.said = S.rises; io.play('bell'); io.note('Next: a double rise — two levels at once. Get high!', 3200); }
          }
        }
        S.shiver = !st.over && soon > 0 && soon < 1 ? 1 - soon : 0;
        S.shake = Math.max(0, S.shake - dt * 1.6);
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
            : `level ${level + (rising ? 1 : 0)} · ${formatTime(Math.max(0, Math.round(st.clock * 1000)))} · ${rising ? 'the lava rises!' : soon === Infinity ? 'the lava has it all' : `the lava rises${twice(level + 2) ? ' TWICE' : ''} in ${Math.max(1, Math.ceil(soon))} s${soon < 1 ? '!' : ''}`}`;
        S.pool = lava * L.lv;
      },
      /**
       * The camera: fixed in the crater, behind the field and high over the lava, the whole field in view; it goes
       * up with the lava, and leans a little after the player. It keeps inside the rock: the crater opens as it goes up.
       */
      camera: (cam, dt) => {
        const tall = cam.aspect < 1, follow = tall ? 0.72 : 0.3, [fx, fz] = L.look;
        S.cam += ((S.pool || 0) - S.cam) * (1 - Math.exp(-Math.min(dt, 0.1) * 4));
        const y = L.level + S.cam;
        S.look.set(L.at.x + st.x * follow + fx * VIEW.ahead, y + 1.2, L.at.z + st.z * follow + fz * VIEW.ahead);
        let ex = st.x * follow * 0.5 - fx * VIEW.back, ez = st.z * follow * 0.5 - fz * VIEW.back;
        const far = Math.hypot(ex, ez), room = INNER + CONE.flare * (Math.min(y + VIEW.up, CONE.rim - 1.7) - L.level) - 0.9;
        if (far > room) { ex *= room / far; ez *= room / far; }
        S.eye.set(L.at.x + ex, y + VIEW.up, L.at.z + ez);
        // (shaken as the lava surges, a shiver in the last second before it does)
        const now = this.clock() / 1000, j = 0.2 * S.shake * S.shake + 0.035 * (S.shiver || 0);
        if (j > 0) { S.eye.x += j * Math.sin(now * 47); S.eye.y += j * Math.sin(now * 61 + 1.3); S.look.x += j * 0.6 * Math.sin(now * 53 + 2.1); S.look.y += j * 0.6 * Math.sin(now * 43); }
        cam.position.copy(S.eye); cam.up.set(0, 1, 0); cam.lookAt(S.look);
        return tall ? 76 : 56;
      },
      /** The round is over (or left): the player is put back before the arch, on the pier. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x, this.gate.z, this.gate.yaw); session.close(); },
      close: () => { if (this.session === session) this.session = null; },
    };
    this.session = session;
    session.step(0, player, false);
    S.cam = S.pool || 0;
    return session;
  }

  _tell(e, io) {
    if (e.type === 'jump') io.play('jump', { volume: 0.5 });
    else if (e.type === 'land') io.play('land', { volume: 0.35 });
    else if (e.type === 'out') { io.play('fail'); io.note(e.time > 0 ? `In the lava! You held ${formatTime(e.time)}.` : 'In the lava before the round had even left.', 3200); }
  }
}
