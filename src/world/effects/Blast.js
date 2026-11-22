// The big red button on the island sets this off: a nuclear explosion far out at sea. A flash, a fireball
// that rises into a mushroom cloud, a ring racing over the water towards the shore, and — when the ring
// arrives — a boom, a shaking camera and a gust in the trees. Nothing is hurt: everything is destroyed
// already. The whole show lasts a minute, and costs nothing the rest of the time (nothing is drawn).
import * as THREE from 'three';
import { makeMaterial, G, GLSL_COMMON, GLSL_LIGHTING } from '../../render/globals.js';

/** Where it goes off (far beyond the pier), and how long the show lasts. */
export const GROUND_ZERO = new THREE.Vector3(2250, 0, -330);
export const BLAST_SECONDS = 62;
const SOUND_SPEED = 330; // m/s: the ring on the sea, and the boom that comes with it

const SMOKE_VERT = /* glsl */ `
${GLSL_COMMON}
uniform float uBoil; // seconds since it went off: the surface billows
uniform float uPuff; // how deep the billows are (in the units of the shape)
out vec3 vWorld;
out vec3 vN;
out float vNoise;
float lumps(vec3 p) { return sin(p.x) * sin(p.y) * sin(p.z); }
void main() {
  vec3 p = position;
  vec3 q = normalize(p) * 3.0;
  float b = lumps(q * 1.7 + vec3(0.0, -uBoil * 0.3, 0.0)) * 0.55 + lumps(q * 3.9 + vec3(1.3, -uBoil * 0.5, 2.1)) * 0.34 + lumps(q * 8.1 - vec3(0.0, uBoil * 0.8, 0.0)) * 0.2;
  vNoise = b;
  p += normal * b * uPuff;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const SMOKE_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
uniform float uHeat;  // 1 white-hot, 0 cold smoke
uniform float uAlpha; // 1 solid; less: thinning out (dithered)
in vec3 vWorld;
in vec3 vN;
in float vNoise;
void main() {
  if (uAlpha < 0.999 && ign(gl_FragCoord.xy) > uAlpha) discard;
  vec3 N = normalize(vN);
  // the hollows between the puffs stay hot longest
  float crevice = smoothstep(-0.2, 0.5, -vNoise);
  float heat = saturate(uHeat * (0.5 + 1.0 * crevice));
  vec3 smoke = mix(vec3(0.15, 0.12, 0.11), vec3(0.66, 0.6, 0.54), saturate(vNoise * 0.85 + 0.55));
  vec3 lit = smoke * (hemiAmbient(N) + uSunColor * saturate(dot(N, uSunDir) * 0.8 + 0.2) * 0.9);
  vec3 fire = mix(vec3(1.7, 0.22, 0.02), vec3(4.4, 3.2, 1.7), heat * heat);
  vec3 col = mix(lit, fire, smoothstep(0.04, 0.7, heat));
  col = mix(col, applyFog(col, vWorld, cameraPosition), 0.65 * (1.0 - 0.6 * heat));
  gl_FragColor = vec4(outputColor(col), 1.0);
}
`;
const GLOW_VERT = /* glsl */ `
${GLSL_COMMON}
uniform float uSize;
out vec2 vP;
void main() {
  vP = position.xy;
  vec4 c = viewMatrix * modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  c.xy += position.xy * uSize;
  gl_Position = projectionMatrix * c;
}
`;
const GLOW_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
uniform float uGlow;
in vec2 vP;
void main() {
  float d = length(vP);
  float a = pow(saturate(1.0 - d), 1.7) * uGlow;
  if (a < 0.004) discard;
  // white-hot at the heart, the colour of a sunset further out
  vec3 col = mix(vec3(1.0, 0.58, 0.22), vec3(2.6, 2.3, 1.8), pow(saturate(1.0 - d), 5.0));
  gl_FragColor = vec4(outputColor(col), a);
}
`;
const RING_VERT = /* glsl */ `
${GLSL_COMMON}
out float vEdge;
out vec3 vWorld;
void main() {
  vEdge = uv.x;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const RING_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
uniform float uFade;
in float vEdge;
in vec3 vWorld;
void main() {
  // (only over the sea: the land would show it climbing the hills)
  vec2 h = worldHeights(vWorld.xz);
  bool inside = abs(vWorld.x) < 511.0 && abs(vWorld.z) < 511.0;
  if (inside && h.x > 0.3) discard;
  float a = smoothstep(0.0, 0.25, vEdge) * smoothstep(1.0, 0.55, vEdge) * uFade;
  if (a < 0.01) discard;
  vec3 col = applyFog(vec3(1.05), vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col) * a, a);
}
`;

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (a, b, t) => { const k = clamp01((t - a) / (b - a)); return k * k * (3 - 2 * k); };

export class Blast {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'blast';
    this.group.visible = false;
    this.group.position.copy(GROUND_ZERO);
    this.t = -1; // seconds since it went off (-1: nothing is going on)
    this.arrived = false;
    this._wind = G.uWind.value.z;
    this._exposure = 0;

    const smoke = (puff) => makeMaterial({ uniforms: { uBoil: { value: 0 }, uPuff: { value: puff }, uHeat: { value: 1 }, uAlpha: { value: 1 } }, vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG });
    // the head of the mushroom: a ball, flattened underneath; its skirt, rolling round it; the stem, flaring at
    // both ends; the cloud of spray at its foot
    const ball = new THREE.SphereGeometry(1, 40, 26);
    { const p = ball.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) * 0.55); ball.computeVertexNormals(); }
    this.cap = new THREE.Mesh(ball, smoke(0.2));
    this.skirt = new THREE.Mesh(new THREE.TorusGeometry(1, 0.34, 14, 44).rotateX(Math.PI / 2), smoke(0.1));
    const profile = [[1.9, 0], [1.25, 0.05], [0.95, 0.16], [0.82, 0.4], [0.86, 0.7], [1.05, 0.88], [1.5, 1.0]].map(([r, y]) => new THREE.Vector2(r, y));
    this.stem = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), smoke(0.12));
    this.foot = new THREE.Mesh(new THREE.SphereGeometry(1, 30, 12, 0, Math.PI * 2, 0, Math.PI / 2), smoke(0.16));
    for (const m of [this.cap, this.skirt, this.stem, this.foot]) { m.frustumCulled = false; m.name = 'blast:smoke'; this.group.add(m); }
    // the glare round the fireball
    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    this.glow = new THREE.Mesh(quad, makeMaterial({ uniforms: { uSize: { value: 600 }, uGlow: { value: 1 } }, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false }));
    this.glow.frustumCulled = false; this.glow.renderOrder = 1001; this.glow.name = 'blast:glow';
    this.group.add(this.glow);
    // the ring on the sea
    const ring = new THREE.RingGeometry(0.965, 1, 96, 1).rotateX(-Math.PI / 2);
    { const uv = ring.attributes.uv, p = ring.attributes.position; for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.hypot(p.getX(i), p.getZ(i)) - 0.965) / 0.035, 0); }
    this.ring = new THREE.Mesh(ring, makeMaterial({ uniforms: { uFade: { value: 1 } }, vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
    this.ring.frustumCulled = false; this.ring.renderOrder = 13; this.ring.name = 'blast:ring';
    this.ring.position.y = 0.35;
    this.group.add(this.ring);
  }

  get active() { return this.t >= 0; }

  /** It goes off (`since` seconds ago, for who arrives in the middle of the show). */
  fire(since = 0) {
    if (this.active) return false;
    this.t = Math.max(0, since);
    this.arrived = false;
    this.group.visible = true;
    this._wind = G.uWind.value.z;
    this._exposure = G.uExposure.value;
    return true;
  }

  _end() {
    this.t = -1;
    this.group.visible = false;
    G.uWind.value.z = this._wind;
    if (this._exposure) G.uExposure.value = this._exposure;
  }

  /**
   * Every frame. Returns what the rest of the game makes of it: { flash (0..1: the screen whitens), shake
   * (metres the camera trembles by), boom (true on the frame the blast wave arrives: play the sound) }.
   */
  update(dt, camera) {
    const out = { flash: 0, shake: 0, boom: false };
    if (!this.active) return out;
    const t = (this.t += dt);
    if (t > BLAST_SECONDS) { this._end(); return out; }
    const fade = 1 - smooth(BLAST_SECONDS - 16, BLAST_SECONDS, t); // thinning out at the end
    const heat = Math.exp(-t / 6.5);
    // the fireball swells and rises; the stem follows it up
    const R = 90 + 250 * (1 - Math.exp(-t / 4.5)), H = 80 + 740 * (1 - Math.exp(-t / 10));
    this.cap.position.y = H;
    this.cap.scale.set(R, R * 0.74, R);
    const roll = smooth(2.5, 14, t);
    this.skirt.visible = roll > 0.02;
    this.skirt.position.y = H - R * 0.36;
    this.skirt.scale.setScalar(R * (0.55 + 0.42 * roll));
    const sr = 34 + 40 * (1 - Math.exp(-t / 6));
    this.stem.scale.set(sr, H - R * 0.2, sr);
    const fr = 60 + 230 * (1 - Math.exp(-t / 5));
    this.foot.scale.set(fr, 34 + 40 * (1 - Math.exp(-t / 7)), fr);
    for (const m of [this.cap, this.skirt, this.stem, this.foot]) {
      const u = m.material.uniforms;
      u.uBoil.value = t;
      u.uHeat.value = m === this.cap ? heat : m === this.skirt ? heat * 0.7 : heat * 0.45;
      u.uAlpha.value = fade;
    }
    this.glow.position.y = H;
    this.glow.material.uniforms.uSize.value = R * (2.6 + 3.4 * Math.exp(-t / 2.5));
    this.glow.material.uniforms.uGlow.value = Math.min(1, heat * 1.7) * fade;
    this.glow.visible = heat > 0.02;
    // the ring over the sea
    const rr = SOUND_SPEED * t;
    this.ring.visible = rr < 3100;
    this.ring.scale.set(rr, 1, rr);
    this.ring.material.uniforms.uFade.value = 0.85 * (1 - smooth(1800, 3100, rr));
    // seen from the camera
    const dx = GROUND_ZERO.x - camera.position.x, dz = GROUND_ZERO.z - camera.position.z, dist = Math.hypot(dx, dz);
    // the flash: blinding for who looks that way, a white-out for the others; then the light of the fireball
    camera.getWorldDirection(this._dir ||= new THREE.Vector3());
    const facing = clamp01((this._dir.x * dx + this._dir.z * dz) / (dist || 1) * 0.5 + 0.5);
    out.flash = Math.exp(-t / 0.75) * (0.4 + 0.6 * facing);
    G.uExposure.value = this._exposure * (1 + 1.6 * Math.exp(-t / 1.6) + 0.25 * heat);
    // the blast wave arrives: a boom, the ground trembles, the trees bend
    const since = t - dist / SOUND_SPEED;
    if (since >= 0 && !this.arrived) { this.arrived = true; out.boom = true; }
    if (since >= 0) {
      out.shake = 0.5 * Math.exp(-since / 1.3) * (0.4 + 0.6 * Math.abs(Math.sin(since * 23)));
      G.uWind.value.z = this._wind * (1 + 3.2 * Math.exp(-since / 2.6));
    }
    return out;
  }
}
