// Emotes of light: a sun-coloured ring opens above the player, a mechanical animal appears in it, moves for a
// few seconds and fades away. Ten of them (built in RankAnimals.js): a goldfish that blows bubbles, a squirrel
// that nibbles a nut, a carp that leaps as up a waterfall, an eagle that spreads its wings, a panda that munches
// bamboo, an elephant that trumpets, a stag that rears, a wolf that howls, a tiger that leaps through the ring,
// a dragon that coils around it.
// Each animal is ONE mesh: rigid parts (plates, drums, beams) that the vertex shader moves with one matrix per
// part, so an emote costs two draw calls (the animal, the ring) whatever its number of pieces.
import * as THREE from 'three';
import { makeMaterial, GLSL_COMMON, GLSL_LIGHTING } from '../render/globals.js';
import { BUILDERS, MAX_PARTS, RING, ss } from './RankAnimals.js';

export const RANK_DURATION = 5.6; // seconds

/** Matrices of a rig for one instant. */
class Pose {
  constructor(parts) {
    this.parts = parts;
    const n = parts.length;
    this.rotation = new Float32Array(n * 3);
    this.position = new Float32Array(n * 3);
    this.given = new Array(n).fill(null);
    this.world = Array.from({ length: n }, () => new THREE.Matrix4());
    this.matrices = new Float32Array(MAX_PARTS * 16);
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._m = new THREE.Matrix4();
    this._s = new THREE.Vector3();
    this.size = 1;
    this.reset();
  }
  reset() {
    this.rotation.fill(0);
    this.given.fill(null);
    for (let i = 0; i < this.parts.length; i++) this.position.set(this.parts[i].pivot, i * 3);
  }
  rot(i, x, y, z) { this.rotation[i * 3] = x; this.rotation[i * 3 + 1] = y; this.rotation[i * 3 + 2] = z; }
  pos(i, x, y, z) { this.position[i * 3] = x; this.position[i * 3 + 1] = y; this.position[i * 3 + 2] = z; }
  /** The whole local matrix of a part, given as it is (copied). */
  direct(i, matrix) { (this.given[i] || (this.given[i] = new THREE.Matrix4())).copy(matrix); this._has = true; }
  compute() {
    const { parts, rotation: r, position: p, world, matrices } = this;
    for (let i = 0; i < parts.length; i++) {
      const w = world[i];
      if (this.given[i]) w.copy(this.given[i]);
      else {
        w.makeRotationFromEuler(this._e.set(r[i * 3], r[i * 3 + 1], r[i * 3 + 2]));
        if (parts[i].parent < 0 && this.size !== 1) w.scale(this._s.setScalar(this.size)); // the whole animal, larger than modelled
        w.setPosition(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      }
      if (parts[i].parent >= 0) w.premultiply(world[parts[i].parent]);
      w.toArray(matrices, i * 16);
    }
  }
}

// ---------------------------------------------------------------------------
// Materials

const ANIMAL_VERT = /* glsl */ `
${GLSL_COMMON}
uniform mat4 uParts[${MAX_PARTS}];
out vec3 vWorld;
out vec3 vNormal;
out float vShade;
void main() {
  int part = int(color.a * 32.0);
  mat4 m = uParts[part];
  vec4 wp = modelMatrix * (m * vec4(position, 1.0));
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * (mat3(m) * normal));
  vShade = color.r;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ANIMAL_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
uniform float uShow;  // 0 nothing, 1 all there
uniform float uGlow;  // extra light (howl, roar)
uniform vec3 uBase;   // where it takes shape from (world)
in vec3 vWorld;
in vec3 vNormal;
in float vShade;
void main() {
  // takes shape, and dissolves, in grains of light
  float grain = ign(gl_FragCoord.xy);
  if (uShow < 0.999 && grain > uShow * 1.15 - 0.08 * sin(vWorld.y * 7.0 + uTime * 5.0)) discard;
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  float rim = pow(1.0 - saturate(dot(N, V)), 2.2);
  float top = N.y * 0.5 + 0.5;
  // sunlight made solid: deep gold, paler where it faces up, glowing at the edges
  vec3 gold = mix(vec3(0.9, 0.3, 0.02), vec3(1.0, 0.7, 0.14), top);
  float plate = min(vShade, 1.3);
  vec3 col = gold * (0.3 + 0.62 * top) * plate * plate;
  col += vec3(1.0, 0.72, 0.3) * rim * 0.5;
  col += vec3(1.0, 0.9, 0.6) * max(vShade - 1.3, 0.0) * 1.5; // eyes, the core in the chest, antlers and fins
  // a pulse of light runs along the plates
  col *= 0.95 + 0.14 * sin(vWorld.y * 8.0 + vWorld.x * 3.0 - uTime * 6.0) + uGlow * 0.45;
  col *= 1.0 + 0.9 * (1.0 - uShow);
  gl_FragColor = vec4(outputColor(col), 1.0);
}
`;

const RING_VERT = /* glsl */ `
out vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RING_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
uniform float uOpen;  // 0..1: the ring catches fire round its circumference
uniform float uShow;  // overall strength
uniform float uGlow;
in vec2 vP;
void main() {
  float r = length(vP), a = atan(vP.y, vP.x), turn = a / 6.2831853;
  float lit = smoothstep(0.0, 0.06, uOpen * 1.1 - fract(turn + 0.25));
  float core = exp(-pow((r - 0.8) / 0.026, 2.0));
  float halo = exp(-pow((r - 0.8) / 0.12, 2.0));
  // flames licking outwards, turning slowly
  float f1 = sin(a * 9.0 + uTime * 1.7) * 0.5 + 0.5, f2 = sin(a * 23.0 - uTime * 2.9) * 0.5 + 0.5, f3 = sin(a * 5.0 - uTime * 0.8) * 0.5 + 0.5;
  float lick = f1 * f2 + 0.35 * f3;
  float flame = exp(-pow((r - 0.85 - 0.07 * lick) / 0.05, 2.0)) * (0.35 + lick);
  // the teeth of a dial turning inside (these animals are machines)
  float teeth = step(0.5, fract(turn * 36.0 + uTime * 0.11)) * smoothstep(0.685, 0.695, r) * (1.0 - smoothstep(0.735, 0.745, r));
  float teeth2 = step(0.72, fract(turn * 12.0 - uTime * 0.07)) * smoothstep(0.63, 0.64, r) * (1.0 - smoothstep(0.665, 0.675, r));
  float inside = (1.0 - smoothstep(0.1, 0.78, r)) * 0.07 * uOpen;
  float I = (core * 1.5 + halo * (0.42 + uGlow * 0.5) + flame * 1.0 + (teeth * 0.5 + teeth2 * 0.36)) * lit + inside;
  I *= uShow;
  // orange flames, a core that is almost white: the colour of the sun
  vec3 col = mix(vec3(1.0, 0.3, 0.02), vec3(1.0, 0.8, 0.32), saturate(core * 0.85 + halo * 0.25)) * (0.55 + 0.75 * saturate(I));
  float alpha = saturate(I);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(outputColor(col) * alpha, alpha * 0.8);
}
`;

let ringGeometry = null;

class Emote {
  constructor(kind, rig) {
    this.kind = kind;
    this.rig = rig;
    this.pose = new Pose(rig.parts);
    this.pose.size = rig.size || 1;
    this.group = new THREE.Group();
    this.uniforms = { uParts: { value: this.pose.matrices }, uShow: { value: 0 }, uGlow: { value: 0 }, uBase: { value: new THREE.Vector3() } };
    this.animal = new THREE.Mesh(rig.geometry, makeMaterial({ uniforms: this.uniforms, vertexShader: ANIMAL_VERT, fragmentShader: ANIMAL_FRAG, vertexColors: true, side: THREE.DoubleSide }));
    this.animal.frustumCulled = false;
    this.ringUniforms = { uOpen: { value: 0 }, uShow: { value: 0 }, uGlow: { value: 0 } };
    if (!ringGeometry) ringGeometry = new THREE.PlaneGeometry(2.5, 2.5);
    this.ring = new THREE.Mesh(ringGeometry, makeMaterial({
      uniforms: this.ringUniforms, vertexShader: RING_VERT, fragmentShader: RING_FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    this.ring.position.set(0, RING.y, RING.z);
    this.ring.scale.setScalar(RING.r / 0.8);
    this.ring.renderOrder = 30;
    this.ring.frustumCulled = false;
    this.group.add(this.animal, this.ring);
    this.time = 0;
    this.target = null;
  }

  start(target) {
    this.target = target;
    this.time = 0;
    this.group.rotation.y = target.rotation.y;
    this.group.visible = true;
    this.step(0);
  }

  /** Returns false once the emote is over. */
  step(dt) {
    const t = (this.time += dt);
    if (t >= RANK_DURATION || !this.target.parent) { this.group.visible = false; return false; }
    this.group.position.copy(this.target.position);
    this.pose.reset();
    const glow = this.rig.animate(t, this.pose) || 0;
    this.pose.compute();
    const show = ss(0.45, 1.25, t) * (1 - ss(RANK_DURATION - 0.95, RANK_DURATION - 0.1, t));
    this.uniforms.uShow.value = show;
    this.uniforms.uGlow.value = glow;
    this.ringUniforms.uOpen.value = ss(0, 0.75, t);
    this.ringUniforms.uShow.value = ss(0, 0.3, t) * (1 - ss(RANK_DURATION - 0.7, RANK_DURATION, t));
    this.ringUniforms.uGlow.value = glow;
    return true;
  }
}

export class RankEmotes {
  constructor(scene) {
    this.scene = scene;
    this.rigs = {};
    this.free = {}; // kind → emotes ready to be used again
    this.active = [];
  }

  /**
   * Summon an animal over `target` (an Object3D: the avatar's root).
   * `kind`: goldfish | squirrel | carp | eagle | panda | elephant | deer | wolf | tiger | dragon.
   */
  play(kind, target) {
    if (!BUILDERS[kind] || !target) return;
    // one at a time per avatar
    const again = this.active.find((e) => e.target === target);
    if (again) { again.group.visible = false; this.active.splice(this.active.indexOf(again), 1); (this.free[again.kind] ||= []).push(again); }
    let e = this.free[kind]?.pop();
    if (!e) {
      e = new Emote(kind, this.rigs[kind] || (this.rigs[kind] = BUILDERS[kind]()));
      this.scene.add(e.group);
    }
    e.start(target);
    this.active.push(e);
  }

  update(dt, camera) {
    if (this.paused) dt = 0; // (screenshots)
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      if (!e.step(dt)) { this.active.splice(i, 1); (this.free[e.kind] ||= []).push(e); continue; }
      e.group.visible = !camera || e.group.position.distanceToSquared(camera.position) < 260 * 260;
    }
  }
}
