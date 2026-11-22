// Small bright things that fly about for a moment: the trails some avatars leave behind them (stardust,
// confetti, bubbles, fallout) and the fireworks. One set of points for the whole world, one draw call, a fixed
// number of them: when everything is taken the oldest make room.
import * as THREE from 'three';
import { makeMaterial, GLSL_COMMON, GLSL_LIGHTING } from '../../render/globals.js';

const MAX = 900;

const VERT = /* glsl */ `
${GLSL_COMMON}
in vec4 aColor; // rgb, and how bright (above 1: it glows)
in vec2 aLook;  // size in metres, kind (0 round and soft, 1 a square of paper, 2 a ring: a bubble)
out vec4 vColor;
out float vKind;
uniform float uScale; // pixels per metre at one metre
void main() {
  vColor = aColor;
  vKind = aLook.y;
  vec4 mv = viewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aLook.x * uScale / max(0.3, -mv.z), 0.0, 96.0);
}
`;
const FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
in vec4 vColor;
in float vKind;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = length(p), a;
  if (vKind < 0.5) a = smoothstep(1.0, 0.25, d);
  else if (vKind < 1.5) a = step(max(abs(p.x), abs(p.y) * 1.6), 0.8);
  else a = smoothstep(1.0, 0.86, d) * (0.25 + 0.75 * smoothstep(0.62, 0.9, d)) + 0.5 * smoothstep(0.3, 0.0, length(p - vec2(-0.35, -0.35)));
  a *= min(1.0, vColor.a);
  if (a < 0.02) discard;
  gl_FragColor = vec4(outputColor(vColor.rgb * max(1.0, vColor.a)) * a, a);
}
`;

const rnd = (a, b) => a + Math.random() * (b - a);
const PAPER = [[1.0, 0.2, 0.25], [1.0, 0.78, 0.1], [0.15, 0.7, 1.0], [0.35, 0.9, 0.3], [1.0, 0.45, 0.9], [0.6, 0.35, 1.0]];
const BURSTS = [[1.0, 0.3, 0.25], [1.0, 0.85, 0.3], [0.35, 0.8, 1.0], [0.5, 1.0, 0.45], [1.0, 0.5, 0.95], [1.0, 0.65, 0.2]];

export class Sparks {
  constructor() {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 4);
    this.look = new Float32Array(MAX * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLook', new THREE.BufferAttribute(this.look, 2).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.uniforms = { uScale: { value: 800 } };
    this.mesh = new THREE.Points(g, makeMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 14;
    this.mesh.name = 'sparks';
    this.mesh.visible = false;
    // what each one is doing: where it is going, how long it has left, how it behaves
    this.items = Array.from({ length: MAX }, () => ({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, r: 1, g: 1, b: 1, glow: 1, size: 0.1, kind: 0, drag: 0, grav: 0, sway: 0 }));
    this.next = 0;
    this.count = 0;
    this.rockets = []; // fireworks on their way up
  }

  _spawn(o) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % MAX;
    Object.assign(it, { on: true, t: 0, kind: 0, drag: 0, grav: 0, sway: 0, glow: 1 }, o);
    return it;
  }

  /**
   * What an avatar running at (x, y, z) leaves behind it. `trail`: 1 stardust, 2 confetti, 3 bubbles, 4 fallout
   * (the numbers of TRAILS in server/items.js). Call it every frame with how long the frame lasted: the right
   * number of things come out.
   */
  trail(trail, dt, x, y, z, speed) {
    if (!trail || speed < 0.6) return;
    // (so many a second, whatever the frame rate; a few at most in one frame)
    const want = Math.min(5, dt * (trail === 3 ? 10 : trail === 2 ? 30 : 24) * Math.min(1.5, speed / 5));
    const n = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const px = x + rnd(-0.22, 0.22), pz = z + rnd(-0.22, 0.22);
      if (trail === 1) this._spawn({ x: px, y: y + rnd(0.1, 0.9), z: pz, vx: rnd(-0.2, 0.2), vy: rnd(0.1, 0.5), vz: rnd(-0.2, 0.2), life: rnd(0.7, 1.3), r: 1.0, g: 0.82, b: 0.35, glow: 2.2, size: rnd(0.09, 0.17) });
      else if (trail === 2) { const c = PAPER[Math.floor(Math.random() * PAPER.length)]; this._spawn({ x: px, y: y + rnd(0.6, 1.5), z: pz, vx: rnd(-0.7, 0.7), vy: rnd(0.6, 1.8), vz: rnd(-0.7, 0.7), life: rnd(1.1, 1.9), r: c[0], g: c[1], b: c[2], size: rnd(0.09, 0.14), kind: 1, grav: 2.4, drag: 1.6, sway: rnd(3, 7) }); }
      else if (trail === 3) this._spawn({ x: px, y: y + rnd(0.3, 1.1), z: pz, vx: rnd(-0.25, 0.25), vy: rnd(0.35, 0.8), vz: rnd(-0.25, 0.25), life: rnd(1.6, 2.6), r: 0.8, g: 0.95, b: 1.0, size: rnd(0.14, 0.3), kind: 2, sway: rnd(1, 3) });
      else this._spawn({ x: px, y: y + rnd(0.1, 1.0), z: pz, vx: rnd(-0.15, 0.15), vy: rnd(0.4, 1.0), vz: rnd(-0.15, 0.15), life: rnd(0.9, 1.6), r: 0.35, g: 1.0, b: 0.25, glow: 2.4, size: rnd(0.07, 0.15), sway: rnd(2, 5) });
    }
  }

  /** A rocket leaves from (x, y, z), climbs, and bursts. */
  firework(x, y, z) {
    if (this.rockets.length >= 12) return;
    this.rockets.push({ x, y: y + 1.6, z, vx: rnd(-1.2, 1.2), vy: rnd(19, 23), vz: rnd(-1.2, 1.2), fuse: rnd(1.25, 1.55), c: BURSTS[Math.floor(Math.random() * BURSTS.length)], c2: BURSTS[Math.floor(Math.random() * BURSTS.length)] });
  }

  update(dt, camera, height) {
    // (points are sized in pixels: so many per metre, one metre away)
    this.uniforms.uScale.value = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.fuse -= dt; r.vy -= 9 * dt;
      r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
      this._spawn({ x: r.x, y: r.y, z: r.z, vx: rnd(-0.3, 0.3), vy: rnd(-1.5, -0.5), vz: rnd(-0.3, 0.3), life: rnd(0.3, 0.6), r: 1.0, g: 0.8, b: 0.45, glow: 2.2, size: 0.2 });
      if (r.fuse > 0) continue;
      this.rockets.splice(i, 1);
      // the burst: a ball of stars, a few of another colour, all falling slowly as they go out
      const n = 70;
      for (let k = 0; k < n; k++) {
        const u = rnd(-1, 1), a = rnd(0, Math.PI * 2), s = Math.sqrt(1 - u * u), v = rnd(7, 10.5), c = k % 5 ? r.c : r.c2;
        this._spawn({ x: r.x, y: r.y, z: r.z, vx: s * Math.cos(a) * v, vy: u * v, vz: s * Math.sin(a) * v, life: rnd(1.3, 2.0), r: c[0], g: c[1], b: c[2], glow: 1.5, size: rnd(0.4, 0.62), drag: 1.7, grav: 2.6 });
      }
      this.burst = { x: r.x, y: r.y, z: r.z }; // (for whoever wants to make a noise of it)
    }
    let n = 0;
    const { pos, col, look } = this;
    for (const it of this.items) {
      if (!it.on) continue;
      it.t += dt;
      if (it.t >= it.life) { it.on = false; continue; }
      const k = Math.exp(-it.drag * dt);
      it.vx *= k; it.vz *= k; it.vy = it.vy * k - it.grav * dt;
      const sway = it.sway ? Math.sin(it.t * it.sway + it.life * 9) * 0.35 * dt : 0;
      it.x += it.vx * dt + sway; it.y += it.vy * dt; it.z += it.vz * dt + sway * 0.6;
      const f = it.t / it.life, fade = f < 0.15 ? f / 0.15 : 1 - ((f - 0.15) / 0.85) ** 2;
      pos[n * 3] = it.x; pos[n * 3 + 1] = it.y; pos[n * 3 + 2] = it.z;
      col[n * 4] = it.r; col[n * 4 + 1] = it.g; col[n * 4 + 2] = it.b; col[n * 4 + 3] = fade * it.glow;
      look[n * 2] = it.size; look[n * 2 + 1] = it.kind;
      n++;
    }
    this.count = n;
    const g = this.mesh.geometry;
    this.mesh.visible = n > 0;
    if (!n) return;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true; g.attributes.aColor.needsUpdate = true; g.attributes.aLook.needsUpdate = true;
  }
}
