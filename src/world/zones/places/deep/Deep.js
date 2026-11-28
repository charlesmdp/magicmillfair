// What is seen of the extra `dive` (src/extras/dive.js): the Diver's Rest — the rock of plan.js, its cave, what
// glows and what was left in it — and the sea as it looks from under: a veil of colour that thickens with the
// depth, the surface seen from below, bubbles, weed on the bed, a shoal round the rock.
//
// It costs little. Above the water only the rock is drawn (one mesh, with the stone of the world); the cave and
// what is in it are drawn for who is under the water near it, or inside. Everything of the sea from under — four
// small draw calls — is drawn only while the camera is under, when the game no longer renders its mirrored view of
// the world for the water: under the water a frame is cheaper than above it. The veil is the haze of the world
// itself (the shared uniforms of src/render/globals.js), lent the colour of the water for as long as the camera is
// under, and given back.
import * as THREE from 'three';
import { G, makeMaterial, GLSL_COMMON, GLSL_LIGHTING } from '../../../../render/globals.js';
import { LAYER } from '../../../../render/Shadows.js';
import { Parts } from '../../../props/MeshBuilder.js';
import { seatAt } from '../../../../player/PlayerController.js';
import { DEEP, CELL, WALL, toWorld, toLocal, grid, mesh, solid, away, hull, hollow, inCave, strand, inChamber, top, walls } from './plan.js';

const TEAL = [0.12, 0.85, 1.0], VIOLET = [0.55, 0.4, 1.0];
// The crystals: each cluster grows on the rock met from a point of the hollow, going that way — [from, way, colour, how
// many, how tall, how bright (the first three are the hint: they are drawn for an eye over the water too)]
const CRYSTALS = [
  [[11.8, -3.6, 0.5], [-1, 0.1, 0], TEAL, 6, 0.5, 2.4], // over the arch, on the face of the rock: the glow one may catch from outside
  [[9.4, -6.2, 0.3], [0.1, 0.35, 1], TEAL, 6, 0.34, 2], // in the arch, on one side
  [[9.8, -6.0, 0.3], [0.1, 0.3, -1], TEAL, 5, 0.3, 2], // and on the other
  [[5.6, -6.1, -1.1], [0.2, 1, -0.3], TEAL, 5, 0.28], // the roof of the passage
  [[0.6, -6.0, -2.3], [-1, 0.15, -0.2], VIOLET, 6, 0.32], // its end, under the chimney
  [[-0.9, -3.4, -2.1], [-0.5, 0.1, -1], TEAL, 5, 0.26], // the chimney
  [[-1, 1.4, 0.3], [-1, 0.25, -0.6], TEAL, 9, 0.62], // the chamber: over the pool,
  [[-1, 1.4, 0.3], [1, 0.3, -0.5], VIOLET, 8, 0.54],
  [[-1, 1.6, 0.3], [0.35, 0.45, 1], TEAL, 9, 0.66], // behind the strand,
  [[-1, 1.6, 0.3], [-0.9, 0.5, 0.75], VIOLET, 8, 0.54],
  [[-1, 2.0, 0.3], [0.1, 1, 0.1], TEAL, 7, 0.5], // in the vault,
  [[-1, 1.0, 0.3], [-0.3, 0.2, -1], VIOLET, 7, 0.5], // across the pool,
  [[1.5, -1.2, -2.2], [1, -0.6, -0.5], TEAL, 6, 0.32], // and under the water of the pool
];
/** What the helmet says to who looks at it. */
export const HELMET = { label: 'the diving helmet', text: 'A diving helmet, from before: copper, gone a little green. Whoever wore it had to carry their air down here in a pot. They walked in out of the sea, set it down like a hat on a hall table — and stayed for the view. Robots do not breathe. It is the only thing they envy nobody.' };

const rnd = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// ---- the surface of the water, seen from under
const SHEET_VERT = /* glsl */ `
uniform vec3 uAt; // under the camera, at the level of the water
out vec3 vWorld;
void main() {
  vWorld = vec3(position.x + uAt.x, uAt.y + position.y, position.z + uAt.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;
const SHEET_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
uniform sampler2D uCaustics;
uniform vec4 uRock; // the rock: x, z, how far its shade goes
uniform vec3 uAt;
in vec3 vWorld;
void main() {
  if (vWorld.y < uAt.y - 0.5) { gl_FragColor = vec4(outputColor(applyFog(uFogColor, vWorld, cameraPosition)), 1.0); return; } // (far under: where the bed of the map ends, the deep)
  vec3 dir = normalize(vWorld - cameraPosition);
  // the ripples, seen from under: they bend what comes through, and draw a net of light
  vec2 uv = vWorld.xz * 0.085;
  float c1 = texture(uCaustics, uv + uTime * vec2(0.021, 0.013)).r, c2 = texture(uCaustics, uv * 1.37 - uTime * vec2(0.017, 0.024) + 0.31).r;
  float net = min(c1, c2) * 2.6, up = dir.y + (c1 - c2) * 0.14;
  // straight above, the sky, through the round window of the surface; all round it the surface is a mirror of the deep
  float window = smoothstep(0.6, 0.78, up);
  vec3 sky = mix(vec3(0.36, 0.72, 0.9), vec3(0.78, 0.96, 1.0), smoothstep(0.72, 1.0, up)) * (0.75 + 0.6 * uSunDir.y);
  vec3 col = mix(uFogColor * 0.7, sky, window) + vec3(0.7, 1.0, 0.94) * net * (0.07 + 0.5 * window);
  // (the sun, where it comes down through the water: bent towards the vertical)
  vec3 sun = normalize(vec3(uSunDir.x * 0.75, sqrt(1.0 - 0.5625 * (1.0 - uSunDir.y * uSunDir.y)), uSunDir.z * 0.75));
  float sd = saturate(dot(dir, sun));
  col += uSunColor * (pow(sd, 220.0) * 1.6 + pow(sd, 24.0) * 0.16) * window * (0.5 + net);
  // under the rock there is no sky: its roof, and the light of what glows in it
  float rock = 1.0 - smoothstep(uRock.z - 2.0, uRock.z + 1.0, length(vWorld.xz - uRock.xy));
  col = mix(col, vec3(0.02, 0.13, 0.13) * (0.4 + 0.5 * net), rock);
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col), 1.0);
}`;

// ---- bubbles: points that rise
const BUBBLE_VERT = /* glsl */ `
uniform float uView; // half the height of the picture, in pixels
in float aSize;
out vec3 vWorld;
void main() {
  vWorld = position;
  vec4 mv = viewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * projectionMatrix[1][1] * uView / max(0.4, -mv.z);
}`;
const BUBBLE_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
in vec3 vWorld;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = dot(p, p);
  if (r > 1.0) discard;
  float rim = smoothstep(0.35, 1.0, r), glint = 1.0 - smoothstep(0.0, 0.3, length(p - vec2(-0.38, -0.4)));
  vec3 col = applyFog(vec3(0.5, 0.88, 0.95) * (0.3 + rim) + glint, vWorld, cameraPosition);
  float a = saturate(0.16 + 0.6 * rim + glint);
  gl_FragColor = vec4(outputColor(col) * a, a);
}`;

// ---- what lives there: weed on the bed (uKind 0), a shoal that goes round the rock (uKind 1) — one program for both
const LIFE_VERT = /* glsl */ `
${GLSL_COMMON}
uniform float uKind;
uniform vec4 uShoal; // the middle of the rock (x, y, z) the shoal goes round
in vec4 aI; // weed: where it is rooted (x, y, z), how tall — a fish: where in the round it is, how far out, how deep, how big
out vec3 vWorld;
out vec3 vTint;
void main() {
  vec3 p;
  if (uKind < 0.5) {
    float ph = aI.x * 1.7 + aI.z * 2.3, t = position.y, sway = t * t * aI.w * 0.3;
    p = aI.xyz + vec3(position.x, t * aI.w, position.z);
    p.x += sin(uTime * 1.1 + ph + t * 2.0) * sway;
    p.z += cos(uTime * 0.9 + ph * 1.3 + t * 1.7) * sway * 0.8;
    vTint = mix(vec3(0.015, 0.07, 0.04), mix(vec3(0.1, 0.3, 0.1), vec3(0.2, 0.26, 0.08), fract(ph * 0.37)), t);
  } else {
    float a = uTime * 0.12 + aI.x + 0.2 * sin(uTime * 0.4 + aI.x * 9.0);
    vec3 c = uShoal.xyz + vec3(cos(a) * aI.y, aI.z + sin(a * 3.0 + aI.x * 5.0) * 0.4, sin(a) * aI.y);
    vec3 fwd = vec3(-sin(a), 0.0, cos(a)), side = vec3(fwd.z, 0.0, -fwd.x);
    float wag = sin(uTime * 9.0 + aI.x * 20.0) * 0.3 * max(0.0, 0.15 - position.x);
    p = c + (fwd * position.x + vec3(0.0, position.y, 0.0) + side * wag) * aI.w;
    vTint = mix(vec3(0.16, 0.3, 0.36), vec3(0.62, 0.8, 0.84), smoothstep(-0.1, 0.12, position.y));
  }
  vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const LIFE_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
in vec3 vWorld;
in vec3 vTint;
void main() {
  vec3 col = vTint * (hemiAmbient(vec3(0.0, 1.0, 0.0)) * 1.6 + uSunColor * 0.4 * exp(vWorld.y * 0.22));
  gl_FragColor = vec4(outputColor(applyFog(col, vWorld, cameraPosition)), 1.0);
}`;

const BUBBLES = 140;

export class Deep {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'dive';
    this.lights = [];
    this.under = false; // is the camera under the water?
    this._fog = null; // the haze of the world, kept while the water has it
    this._dark = 0;
  }

  /** Builds everything (the rock is worked out a slab at a time: nothing waits for it). Resolves to itself. */
  async build() {
    const { world } = this, [cx, cz] = [DEEP.at.x, DEEP.at.z];
    while (!grid(CELL, 5)) await new Promise((r) => setTimeout(r, 0));
    const frame = (this.frame = new THREE.Group()); // the frame of the rock: u, y, w
    frame.position.set(cx, 0, cz);
    frame.rotation.y = -DEEP.yaw;
    this.group.add(frame);
    this._crystals();
    this._rock();
    this._things();
    frame.updateMatrixWorld(true);
    this._sea();
    this._solid();
    world.scene.add(this.group);
    this.show(false, false, 1e9);
    return this;
  }

  // The light of the cave, at a point whose face looks the way (nu, ny, nw): daylight a little way in from the arch,
  // then what glows. No lamp is computed — as in the caves of the game it is painted in the vertices: `out` is what
  // the colour of a vertex must be for the stone to give that light back (the stone is lit by the sky and the ground
  // of the world, which are not seen from in here: their tint is taken off).
  _light(u, y, w, nu, ny, nw, out) {
    const day = Math.exp(-Math.max(0, Math.hypot(u - DEEP.mouth.u - 1.5, y - DEEP.mouth.y, w - DEEP.mouth.w) - 1.5) / 3.2);
    let r = 0.02 + 0.1 * day, g = 0.024 + 0.17 * day, b = 0.03 + 0.19 * day;
    for (const l of this.lights) {
      const du = l.u - u, dy = l.y - y, dw = l.w - w, d2 = du * du + dy * dy + dw * dw, d = Math.sqrt(d2) || 1;
      const k = (l.power / (1 + d2 / (l.reach * l.reach))) * (0.4 + 0.6 * Math.max(0, (du * nu + dy * ny + dw * nw) / d));
      r += (0.3 + 0.7 * l.c[0]) * k; g += (0.3 + 0.7 * l.c[1]) * k; b += (0.3 + 0.7 * l.c[2]) * k; // (its colour, a little washed out)
    }
    const sky = G.uSkyColor.value, ground = G.uGroundColor.value, h = ny * 0.5 + 0.5, t = h * h * (3 - 2 * h);
    out[0] = Math.min(9, r / (ground.r + (sky.r - ground.r) * t)); out[1] = Math.min(9, g / (ground.g + (sky.g - ground.g) * t)); out[2] = Math.min(9, b / (ground.b + (sky.b - ground.b) * t));
    return out;
  }

  _crystals() {
    const n = { u: 0, y: 0, w: 0 };
    for (const [from, way, c, count, tall, bright = 1] of CRYSTALS) {
      const l = Math.hypot(...way);
      let [u, y, w] = from;
      for (let k = 0; k < 120 && solid(u, y, w) > 0.04; k++) { u += (way[0] / l) * 0.1; y += (way[1] / l) * 0.1; w += (way[2] / l) * 0.1; }
      away(u, y, w, n);
      this.lights.push({ u: u + n.u * tall * 0.6, y: y + n.y * tall * 0.6, w: w + n.w * tall * 0.6, foot: [u, y, w], n: [n.u, n.y, n.w], c, count, tall, bright, power: 0.34 + 0.06 * count, reach: 1.7 + tall * 2.2 });
    }
  }

  // The rock, in the stone of the boulders of the world (it knows the water it stands in): its outside, and its
  // inside, whose light is painted in its vertices (as in the caves of the game).
  _rock() {
    const { world } = this, m = mesh(), color = new Float32Array(m.count * 4), c = [0, 0, 0];
    for (let i = 0; i < m.count; i++) {
      const u = m.position[i * 3], y = m.position[i * 3 + 1], w = m.position[i * 3 + 2], nu = m.normal[i * 3], ny = m.normal[i * 3 + 1], nw = m.normal[i * 3 + 2];
      if (hollow(u, y, w) < 0.75 && hull(u, y, w) < -0.2) {
        this._light(u, y, w, nu, ny, nw, c);
        // (the floor of the chamber is sand: paler, warmer — from the bank of the pool to the back of the strand)
        const sand = ny > 0.55 && y > -2.2 && y < 0.95 && inChamber(u, w) ? Math.min(1, (ny - 0.55) / 0.25) : 0;
        color[i * 4] = c[0] * (1 + 0.75 * sand); color[i * 4 + 1] = c[1] * (1 + 0.55 * sand); color[i * 4 + 2] = c[2] * (1 + 0.12 * sand); color[i * 4 + 3] = 1;
      } else {
        // outside: beds of stone, darker where it is wet, weed at the line of the water, moss where the top is level
        const beds = 0.8 + 0.2 * Math.sin(y * 2.1 + (u * 0.8 + w) * 0.16 + rnd(i) * 0.6), v = 0.74 * beds * (0.92 + 0.16 * rnd(i * 1.7));
        const wet = Math.max(0, 1 - Math.abs(y - 0.2) / 1.25), moss = Math.min(1, Math.max(0, (ny - 0.5) / 0.35)) * Math.min(1, Math.max(0, (y - 1.2) / 2.2)) * (0.55 + 0.45 * rnd(i * 2.3));
        color[i * 4] = v * (1 - 0.42 * wet) * (1 - 0.42 * moss); color[i * 4 + 1] = v * (1 - 0.24 * wet) * (1 - 0.1 * moss); color[i * 4 + 2] = v * (1 - 0.46 * wet) * (1 - 0.6 * moss); color[i * 4 + 3] = 0.8 + 0.2 * Math.max(0, ny);
        // (and round the arch, the glow of what grows there: the hint)
        for (const l of this.lights) if (l.bright > 1) { const d2 = (l.u - u) ** 2 + (l.y - y) ** 2 + (l.w - w) ** 2; if (d2 < 30) { const k = 2.2 / (1 + d2 / 2.2); color[i * 4] += l.c[0] * k; color[i * 4 + 1] += l.c[1] * k; color[i * 4 + 2] += l.c[2] * k; } }
      }
    }
    const attr = { position: new THREE.BufferAttribute(m.position, 3), normal: new THREE.BufferAttribute(m.normal, 3), uv: new THREE.BufferAttribute(m.uv, 2), color: new THREE.BufferAttribute(color, 4) };
    const part = (index, material, name) => {
      const geo = new THREE.BufferGeometry();
      for (const k in attr) geo.setAttribute(k, attr[k]);
      geo.setIndex(index);
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -1, 0), DEEP.r + 2);
      const mesh3 = new THREE.Mesh(geo, material);
      mesh3.name = name;
      this.frame.add(mesh3);
      return mesh3;
    };
    this.rock = part(m.rock, world.materials.rock, 'dive:rock');
    this.rock.layers.enable(LAYER.STATIC_CASTER);
    this.cave = part(m.cave, world.materials.rock, 'dive:cave');
    this.cave.layers.enable(LAYER.REFLECT); // (the pool of the chamber mirrors its vault, not the sky)
    this.triangles = (m.rock.length + m.cave.length) / 3;
  }

  // What is in the cave: the crystals, and on the strand a helmet on its stone, a bottle of air, a log to sit on.
  _things() {
    const parts = new Parts(), hints = new Parts(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), d = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), mat = new THREE.Matrix4();
    let seed = 1;
    for (const l of this.lights) {
      const glow = (l.bright > 1 ? hints : parts).get('glow');
      for (let k = 0; k < l.count; k++) {
        // a spike of six sides, leaning away from the others
        const a = rnd(seed++) * 6.283, lean = k === 0 ? 0 : 0.25 + 0.55 * rnd(seed++), h = l.tall * (k === 0 ? 1.25 : 0.55 + 0.6 * rnd(seed++)), r = h * (0.13 + 0.06 * rnd(seed++));
        d.set(Math.cos(a) * lean, 1, Math.sin(a) * lean).normalize();
        q.setFromUnitVectors(up, new THREE.Vector3(...l.n)).multiply(new THREE.Quaternion().setFromUnitVectors(up, d));
        const off = k === 0 ? 0 : 0.22 * l.tall;
        mat.compose(new THREE.Vector3(l.foot[0] + Math.cos(a) * off - l.n[0] * 0.12, l.foot[1] - l.n[1] * 0.12, l.foot[2] + Math.sin(a) * off - l.n[2] * 0.12), q, one);
        const v = (0.3 + 0.3 * rnd(seed++)) * l.bright;
        glow.push(mat).tint(l.c[0] * v, l.c[1] * v, l.c[2] * v, 1).lathe([[r, 0], [r * 0.82, h * 0.7], [0.001, h]], 6).pop();
      }
    }
    // the strand: what was left there
    const R = DEEP.rest, at = (u, w) => strand(u, w), lit = (u, y, w, k = 1) => { const c = this._light(u, y + 0.3, w, 0, 0.3, 0, [0, 0, 0]); return [c[0] * k, c[1] * k, c[2] * k]; };
    {
      // a flat stone, and on it the helmet: a copper globe, its collar, three round windows — one still lit from inside
      const u = R.u - 1.9, w = R.w + 0.75, y = at(u, w), stone = parts.get('cave'), paint = parts.get('paint'), L = lit(u, y + 0.6, w, 0.62);
      stone.place(u, y - 0.1, w, 0.4).tint(...lit(u, y, w, 0.9), 1).lathe([[0.62, 0], [0.56, 0.3], [0.4, 0.42], [0.001, 0.44]], 7).pop();
      paint.place(u, y + 0.42, w, 2.2);
      paint.tint(0.78 * L[0], 0.42 * L[1], 0.2 * L[2], 1).lathe([[0.3, 0], [0.33, 0.06], [0.24, 0.14], [0.27, 0.2], [0.33, 0.36], [0.31, 0.52], [0.2, 0.64], [0.001, 0.68]], 12);
      paint.tint(0.52 * L[0], 0.34 * L[1], 0.2 * L[2], 1);
      for (const a of [0, 1.45, -1.45]) paint.place(Math.sin(a) * 0.3, 0.4, Math.cos(a) * 0.3, a, Math.PI / 2).lathe([[0.13, 0], [0.13, 0.06], [0.1, 0.06]], 10).pop();
      paint.pop();
      parts.get('glow').place(u, y + 0.42, w, 2.2).place(0, 0.4, 0.3, 0, Math.PI / 2).tint(0.1, 0.5, 0.4, 1).lathe([[0.1, 0.055], [0.001, 0.07]], 10).pop().pop();
      this.helmet = { u, w, y };
      // the bottle of air they came with, lying by it
      paint.tint(0.8 * L[0], 0.66 * L[1], 0.16 * L[2], 1).rod(new THREE.Vector3(u + 0.9, y + 0.13, w - 0.1), new THREE.Vector3(u + 1.75, y + 0.13, w + 0.25), 0.13, 8);
    }
    {
      // a log from some tide of before, to sit on and look at the pool
      const u = R.u + 2.2, w = R.w - 0.1, y = at(u, w), wood = parts.get('woodDark'), L = lit(u, y, w, 0.85);
      wood.tint(L[0], L[1], L[2], 1).rod(new THREE.Vector3(u - 0.95, y + 0.2, w + 0.1), new THREE.Vector3(u + 0.95, y + 0.2, w - 0.1), 0.23, 8);
      this.log = { u, w, y: y + 0.43 };
    }
    this.things = parts.toMeshes(this.world.materials, { name: 'dive-in', layers: [LAYER.REFLECT] });
    this.hint = hints.toMeshes(this.world.materials, { name: 'dive-hint' });
    this.frame.add(this.things, this.hint);
    {
      // the dark of the passage, for an eye that looks in from outside: five veils across it, seen from the arch only
      // (the haze of the water is one colour everywhere: without them the inside would be as bright as the open sea)
      const pos = [], idx = [], S = 12;
      for (const [u, y, w, tu, tw] of [[9.6, -6.25, -0.1, 0.98, 0.2], [8.2, -6.2, -0.45, 0.98, 0.2], [6.8, -6.15, -0.85, 0.97, 0.26], [5.4, -6.1, -1.25, 0.96, 0.28], [4.0, -6.1, -1.6, 0.96, 0.28]]) {
        const o = pos.length / 3;
        pos.push(u, y, w);
        for (let s = 0; s < S; s++) { const a = (s / S) * 6.2832; pos.push(u - Math.cos(a) * tw * 2.2, y + Math.sin(a) * 2.2, w + Math.cos(a) * tu * 2.2); }
        for (let s = 0; s < S; s++) idx.push(o, o + 1 + ((s + 1) % S), o + 1 + s); // (it faces the arch)
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      this.veil = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x01090a, transparent: true, opacity: 0.24, depthWrite: false, toneMapped: false }));
      this.veil.name = 'dive:veil';
      this.veil.renderOrder = 25;
      this.frame.add(this.veil);
    }
  }

  // The sea from under: the surface, the bubbles, the weed, the shoal.
  _sea() {
    const { world } = this, [cx, cz] = [DEEP.at.x, DEEP.at.z], group = (this.sea = new THREE.Group());
    group.name = 'dive:sea';
    const still = (o) => { o.frustumCulled = false; o.matrixAutoUpdate = false; group.add(o); return o; };
    {
      // the surface: a round sheet that goes with the camera, out to the horizon
      // (and, far out, a wall and a floor of the colour of the deep: nothing of the sky shows under the horizon)
      const pos = [0, 0, 0], idx = [], S = 28;
      for (const [r, y] of [[70, 0], [3000, 0], [2900, -90]]) for (let s = 0; s < S; s++) pos.push(Math.cos((s / S) * 6.2832) * r, y, Math.sin((s / S) * 6.2832) * r);
      pos.push(0, -90, 0);
      for (let s = 0; s < S; s++) { const a = 1 + s, b = 1 + ((s + 1) % S); idx.push(0, a, b, a, a + S, b + S, a, b + S, b, a + S, a + 2 * S, b + 2 * S, a + S, b + 2 * S, b + S, a + 2 * S, 1 + 3 * S, b + 2 * S); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      this.sheetAt = new THREE.Vector3();
      this.sheet = still(new THREE.Mesh(geo, makeMaterial({ uniforms: { uAt: { value: this.sheetAt }, uRock: { value: new THREE.Vector4(cx, cz, 9.5, 0) } }, vertexShader: SHEET_VERT, fragmentShader: SHEET_FRAG, side: THREE.DoubleSide })));
      this.sheet.renderOrder = 4;
    }
    {
      const geo = new THREE.BufferGeometry(), pos = new Float32Array(BUBBLES * 3).fill(-999), size = new Float32Array(BUBBLES);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
      this.bubbleView = { value: 400 };
      this.bubbles = still(new THREE.Points(geo, makeMaterial({ uniforms: { uView: this.bubbleView }, vertexShader: BUBBLE_VERT, fragmentShader: BUBBLE_FRAG, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor })));
      this.bubbles.renderOrder = 30;
      this.bub = { pos, size, vy: new Float32Array(BUBBLES), ph: new Float32Array(BUBBLES), top: new Float32Array(BUBBLES), next: 0, live: 0 };
    }
    const life = (kind, position, index, inst) => {
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
      geo.setIndex(index);
      geo.setAttribute('aI', new THREE.InstancedBufferAttribute(new Float32Array(inst), 4));
      geo.instanceCount = inst.length / 4;
      return still(new THREE.Mesh(geo, makeMaterial({ uniforms: { uKind: { value: kind }, uShoal: { value: new THREE.Vector4(cx, -3.6, cz, 0) } }, vertexShader: LIFE_VERT, fragmentShader: LIFE_FRAG, side: THREE.DoubleSide })));
    };
    {
      // weed: two crossed blades that narrow to their tip; tufts of it round the foot of the rock, thicker by the arch
      const pos = [], idx = [], N = 3;
      for (let b = 0; b < 2; b++) for (let k = 0; k <= N; k++) { const t = k / N, h = 0.045 * (1 - 0.8 * t * t); pos.push(b ? 0 : -h, t, b ? -h : 0, b ? 0 : h, t, b ? h : 0); }
      for (let b = 0; b < 2; b++) for (let k = 0; k < N; k++) { const a = b * (N + 1) * 2 + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const inst = [], bed = (x, z) => world.data.heightAt(x, z);
      for (let i = 0; i < 520 && inst.length < 4 * 640; i++) {
        const near = i % 3 === 0, a = rnd(i * 3.1) * 6.2832, r = near ? 10.5 + rnd(i * 5.7) * 5 : 14 + rnd(i * 7.9) ** 0.7 * 44;
        let [u, w] = [Math.cos(a) * r, Math.sin(a) * r];
        if (i % 9 === 0) { u = DEEP.mouth.u + 1.5 + rnd(i) * 4.5; w = DEEP.mouth.w + (rnd(i * 2.3) - 0.5) * 9; } // (a garden before the arch)
        if (solid(u, DEEP.low + 1.5, w) < 0.5 && r < 15) continue;
        const [x, z] = toWorld(u, w), tuft = 4 + Math.floor(rnd(i * 1.3) * 5);
        for (let k = 0; k < tuft; k++) { const px = x + (rnd(i + k * 17.3) - 0.5) * 0.6, pz = z + (rnd(i + k * 29.1) - 0.5) * 0.6; inst.push(px, bed(px, pz) - 0.05, pz, 0.4 + rnd(i + k * 3.7) * (near ? 0.95 : 0.6)); }
      }
      this.weed = life(0, pos, idx, inst);
    }
    {
      // the shoal: small fish — a body, a tail — that go round the rock, all the same way
      const pos = [0.5, 0, 0, 0.05, 0.17, 0, -0.3, 0, 0, 0.05, -0.17, 0, -0.56, 0.17, 0, -0.56, -0.17, 0], idx = [0, 1, 2, 0, 2, 3, 2, 4, 5], inst = [];
      for (let i = 0; i < 64; i++) { const lead = rnd(i * 9.1) * 1.1; inst.push((i % 2) * 3.1 + lead + rnd(i * 2.9) * 0.25, 13.5 + rnd(i * 4.3) * 4, (rnd(i * 6.1) - 0.5) * 3.4, 0.26 + rnd(i * 8.7) * 0.2); }
      this.shoal = life(1, pos, idx, inst);
    }
    this.group.add(group);
  }

  // What stops the game's own walker, swimmer and camera: the rock at the height of the water (round obstacles),
  // its top and the strand of the chamber (floors), no jetpack over it; and the log is a seat.
  _solid() {
    const { world } = this, col = world.collision, [cx, cz] = [DEEP.at.x, DEEP.at.z], R2 = DEEP.r * DEEP.r, p = [0, 0];
    for (const [u, w] of walls()) { const [x, z] = toWorld(u, w); col.addCircle(x, z, WALL, -3, (top(u, w) ?? 1.3) - 0.3); }
    const local = (x, z) => { const dx = x - cx, dz = z - cz; if (dx * dx + dz * dz > R2) return null; const q = toLocal(x, z); p[0] = q[0]; p[1] = q[1]; return p; };
    col.addPlatform({ heightAt: (x, z) => { const q = local(x, z); return q ? top(q[0], q[1]) : null; } });
    col.addPlatform({ heightAt: (x, z) => { const q = local(x, z); if (!q || !inChamber(q[0], q[1], 0.2)) return null; const h = strand(q[0], q[1]); return h > -0.95 ? h : null; } });
    world.noFly.push({ x: cx, z: cz, r: 12.5 });
    // (the game renders its mirrored view of the world when it has water in sight — it knows its ponds, its streams
    // and the open sea east of the coast: the pool of the chamber is told to it as one more, never drawn)
    const pool = new THREE.Mesh(new THREE.BufferGeometry());
    const [px, pz] = toWorld(DEEP.pool.u, DEEP.pool.w);
    pool.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(px, 0, pz), 7);
    pool.visible = false;
    world.water?.group.add(pool);
    const s = this.log, [sx, sz] = toWorld(s.u, s.w), yaw = Math.atan2(Math.sin(DEEP.yaw), -Math.cos(DEEP.yaw)); // (one sits facing the pool: -w)
    world.seats.push(seatAt(sx, s.y, sz, yaw, { label: 'Sit on the log' }));
  }

  /** A bubble (or `n`) let go at (x, y, z), which rises to the surface at `level`. */
  bubble(x, y, z, level, n = 1, spread = 0.2, size = 0.07) {
    const b = this.bub;
    for (let k = 0; k < n; k++) {
      const i = b.next; b.next = (i + 1) % BUBBLES;
      b.pos[i * 3] = x + (Math.random() - 0.5) * spread; b.pos[i * 3 + 1] = y + (Math.random() - 0.5) * spread; b.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      b.size[i] = size * (0.5 + Math.random()); b.vy[i] = 0.9 + Math.random() * 0.9; b.ph[i] = Math.random() * 6.28; b.top[i] = level;
    }
    b.live = BUBBLES;
  }

  /** Is (x, y, z) in the cave? (its passage, its chimney, its chamber) */
  inside(x, y, z) {
    const dx = x - DEEP.at.x, dz = z - DEEP.at.z;
    if (dx * dx + dz * dz > 14.5 * 14.5) return false;
    const [u, w] = toLocal(x, z);
    return inCave(u, y, w);
  }

  /** What is drawn: `under` — the camera is under the water —, `inside` — one is in the cave —, `far` m from the rock. */
  show(under, inside, far) {
    this.rock.visible = far < 900;
    this.cave.visible = this.things.visible = far < 80 && (under || inside);
    this.veil.visible = this.cave.visible && !inside;
    this.hint.visible = far < 90;
    this.sea.visible = under;
  }

  /**
   * Every frame. `level`: the water over the camera (or null: none); `depth`: how far under it the camera is.
   * The haze of the world is lent the colour of the water while the camera is under, and given back.
   */
  update(dt, time, camera, level, inside) {
    const cam = camera.position, under = level !== null && cam.y < level - 0.02, far = Math.hypot(cam.x - DEEP.at.x, cam.z - DEEP.at.z);
    if (under !== this.under) {
      this.under = under;
      if (under) this._fog = { color: G.uFogColor.value.clone(), sun: G.uFogSunColor.value.clone(), params: G.uFogParams.value.clone() };
      else if (this._fog) { G.uFogColor.value.copy(this._fog.color); G.uFogSunColor.value.copy(this._fog.sun); G.uFogParams.value.copy(this._fog.params); this._fog = null; }
    }
    this.show(under, inside, far);
    if (!under) return;
    // the veil: clear and green-blue under the surface, thicker and darker with the depth — and dark in the cave
    const d = Math.min(1, (level - cam.y) / 8), k = (this._dark += ((inside ? 1 : 0) - this._dark) * Math.min(1, dt * 2.5));
    G.uFogColor.value.setRGB(0.05 - 0.03 * d, 0.3 - 0.15 * d, 0.44 - 0.17 * d).multiplyScalar(1 - 0.72 * k);
    G.uFogSunColor.value.setRGB(0.3 - 0.14 * d, 0.7 - 0.25 * d, 0.72 - 0.2 * d).multiplyScalar(1 - 0.8 * k);
    G.uFogParams.value.set(0.04 + 0.03 * d + 0.012 * k, 0, 0, 0);
    this.sheetAt.set(cam.x, level, cam.z);
    this.bubbleView.value = this.world.engine.renderer.domElement.height / 2;
    // the bubbles rise, wander a little, and are gone at the surface
    const b = this.bub;
    if (b.live > 0) {
      b.live = 0;
      for (let i = 0; i < BUBBLES; i++) {
        if (b.size[i] <= 0) continue;
        const y = (b.pos[i * 3 + 1] += b.vy[i] * dt);
        b.pos[i * 3] += Math.sin(b.ph[i] + time * 3.1) * 0.22 * dt; b.pos[i * 3 + 2] += Math.cos(b.ph[i] * 1.7 + time * 2.6) * 0.22 * dt;
        if (y > b.top[i] - 0.06) { b.size[i] = 0; b.pos[i * 3 + 1] = -999; } else b.live++;
      }
      this.bubbles.geometry.attributes.position.needsUpdate = true;
      this.bubbles.geometry.attributes.aSize.needsUpdate = true;
    }
  }
}
