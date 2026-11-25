// Small bright things that fly about for a moment: the trails some avatars leave behind them (stardust,
// confetti, bubbles, fallout), the fireworks, and the mushroom cloud of those who found every relic. One set of
// points for the whole world, one draw call, a fixed number of them: when everything is taken the oldest make room.
import * as THREE from 'three';
import { makeMaterial, GLSL_COMMON, GLSL_LIGHTING } from '../../render/globals.js';

const MAX = 1800; // (a mushroom cloud is some three hundred of them at its fullest)

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
// A puff of the mushroom cloud, by how hot it is — from 1, the white of the flash, down through yellow, orange and
// a dull red to 0, the grey-brown of smoke: [heat, r, g, b, glow] (under 1 a puff no longer glows: it hides what is behind it).
const FIRE = [[0, 0.27, 0.24, 0.23, 0.92], [0.18, 0.5, 0.2, 0.1, 1.05], [0.45, 1.0, 0.45, 0.12, 1.7], [0.75, 1.0, 0.78, 0.3, 2.3], [1, 1.0, 0.97, 0.8, 3.2]];
const fire = (heat) => {
  const h = Math.min(1, Math.max(0, heat));
  let k = 1;
  while (k < FIRE.length - 1 && FIRE[k][0] < h) k++;
  const a = FIRE[k - 1], b = FIRE[k], t = (h - a[0]) / (b[0] - a[0]);
  return { r: a[1] + (b[1] - a[1]) * t, g: a[2] + (b[2] - a[2]) * t, b: a[3] + (b[3] - a[3]) * t, glow: a[4] + (b[4] - a[4]) * t };
};

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
    this.rockets = []; this.clouds = []; // fireworks on their way up
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

  /** Feathers: `n` pale scraps thrown out of (x, y, z), drifting down as they turn. */
  feathers(x, y, z, n) {
    for (let k = 0; k < n; k++) this._spawn({ x: x + rnd(-0.3, 0.3), y: y + rnd(-0.2, 0.4), z: z + rnd(-0.3, 0.3), vx: rnd(-2.2, 2.2), vy: rnd(0.5, 3.2), vz: rnd(-2.2, 2.2), life: rnd(1.3, 2.4), r: 1.0, g: 0.96, b: 0.84, size: rnd(0.1, 0.17), kind: 1, grav: 2.0, drag: 2.2, sway: rnd(3, 7) });
  }

  /** Gold dust: `n` glints that appear within `r` m of (x, y, z) and drift down. */
  glitter(x, y, z, r, n) {
    for (let k = 0; k < n; k++) {
      const u = rnd(-1, 1), a = rnd(0, Math.PI * 2), s = Math.sqrt(1 - u * u), d = r * Math.cbrt(Math.random());
      this._spawn({ x: x + s * Math.cos(a) * d, y: y + u * d * 0.7, z: z + s * Math.sin(a) * d, vx: rnd(-0.5, 0.5), vy: rnd(-0.4, 1.4), vz: rnd(-0.5, 0.5), life: rnd(1.4, 2.8), r: 1.0, g: 0.8, b: 0.3, glow: 2.4, size: rnd(0.3, 0.6), grav: 1.3, drag: 0.8, sway: rnd(1, 3) });
    }
  }

  /**
   * A mushroom cloud over (x, y, z), six metres of it: the flash at the foot and the ring of dust it sends along
   * the ground; the stem that climbs; the ball of fire it carries up, which rolls as it goes — out over the top,
   * down at its rim, back in under itself — and cools from white to orange to smoke; a ring of vapour round the
   * stem as the cap goes through; embers; and, this being a fair, a fallout of confetti. Some five seconds in
   * all (see update()).
   */
  mushroom(x, y, z) {
    if (this.clouds.length >= 5) return;
    for (let k = 0; k < 10; k++) { const a = rnd(0, 6.283), d = rnd(0, 0.5); this._spawn({ x: x + Math.cos(a) * d, y: y + rnd(0.3, 1.1), z: z + Math.sin(a) * d, vx: 0, vy: rnd(0.5, 1.5), vz: 0, life: rnd(0.22, 0.4), r: 1, g: 0.98, b: 0.88, glow: 4, size: rnd(1.1, 1.6) }); }
    for (let k = 0; k < 40; k++) { const a = (k / 40) * 6.283 + rnd(-0.06, 0.06), v = rnd(6.5, 9); this._spawn({ x: x + Math.cos(a) * 0.3, y: y + rnd(0.12, 0.3), z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * v, vy: rnd(0, 0.5), vz: Math.sin(a) * v, life: rnd(0.8, 1.25), r: 0.82, g: 0.74, b: 0.6, glow: 0.6, size: rnd(0.6, 0.95), drag: 3.2 }); }
    this.clouds.push({ x, y, z, t: 0, ring: false });
  }

  /** A rocket leaves from (x, y, z), climbs, and bursts. */
  firework(x, y, z) {
    if (this.rockets.length >= 12) return;
    this.rockets.push({ x, y: y + 1.6, z, vx: rnd(-1.2, 1.2), vy: rnd(19, 23), vz: rnd(-1.2, 1.2), fuse: rnd(1.25, 1.55), c: BURSTS[Math.floor(Math.random() * BURSTS.length)], c2: BURSTS[Math.floor(Math.random() * BURSTS.length)] });
  }

  update(dt, camera, height) {
    // (points are sized in pixels: so many per metre, one metre away)
    this.uniforms.uScale.value = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    // the mushroom clouds. `top`: how high the cap has climbed (fast at first, then it hangs); `heat`: 1 at the
    // flash, 0 when all of it is smoke; `R`: how wide the cap has rolled out
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i], some = (rate) => { const w = rate * dt; return Math.floor(w) + (Math.random() < w % 1 ? 1 : 0); };
      c.t += dt;
      const t = c.t, rise = 1 - Math.exp(-t / 0.8), top = c.y + 1.0 + 5.4 * rise, heat = Math.max(0, 1 - t / 3.0), R = 0.5 + 1.9 * (1 - Math.exp(-t / 0.9));
      // (the stem: smoke that climbs from the ground to the cap, hottest just under it, wider at its foot)
      if (t < 3.3) for (let k = some(46); k > 0; k--) {
        const f = Math.random() ** 0.8, w = (f < 0.12 ? 0.55 : 0.2) + 0.12 * Math.random(), a = rnd(0, 6.283), d = Math.sqrt(Math.random()) * w;
        this._spawn({ x: c.x + Math.cos(a) * d, y: c.y + 0.25 + f * (top - c.y - 0.6), z: c.z + Math.sin(a) * d, vx: rnd(-0.12, 0.12), vy: rnd(1.0, 2.2) * (0.4 + rise), vz: rnd(-0.12, 0.12), life: rnd(0.7, 1.1), ...fire(heat * (0.45 + 0.5 * f) - 0.03), size: rnd(0.55, 0.85), drag: 0.6 });
      }
      if (t > 0.12 && t < 3.4) {
        // (the crown of the cap: thrown out from its middle, it falls as it goes — a dome)
        for (let k = some(70); k > 0; k--) {
          const a = rnd(0, 6.283), v = rnd(0.8, 1.6) * (1.2 + 0.67 * R), d = rnd(0, 0.35);
          this._spawn({ x: c.x + Math.cos(a) * d, y: top + rnd(-0.1, 0.5), z: c.z + Math.sin(a) * d, vx: Math.cos(a) * v, vy: rnd(0.5, 1.5), vz: Math.sin(a) * v, life: rnd(0.95, 1.45), ...fire(heat * rnd(0.75, 1.05)), size: rnd(0.85, 1.25), drag: 1.5, grav: 1.9 });
        }
        // (its rim: cooler, it sinks and is drawn back in towards the stem — the roll of the cap)
        for (let k = some(44); k > 0; k--) {
          const a = rnd(0, 6.283), v = rnd(0.3, 0.9);
          this._spawn({ x: c.x + Math.cos(a) * R, y: top + rnd(-0.55, 0.05), z: c.z + Math.sin(a) * R, vx: -Math.cos(a) * v, vy: rnd(-0.9, -0.2), vz: -Math.sin(a) * v, life: rnd(0.7, 1.1), ...fire(heat * rnd(0.3, 0.7) - 0.05), size: rnd(0.7, 1.05), drag: 0.8 });
        }
      }
      // (the ring of white vapour round the stem, half-way up, as the cap goes through)
      if (!c.ring && t > 0.55) {
        c.ring = true;
        for (let k = 0; k < 30; k++) { const a = (k / 30) * 6.283, v = rnd(2.2, 2.8); this._spawn({ x: c.x + Math.cos(a) * 0.4, y: c.y + 3.0 + rnd(-0.08, 0.08), z: c.z + Math.sin(a) * 0.4, vx: Math.cos(a) * v, vy: 0.15, vz: Math.sin(a) * v, life: rnd(0.9, 1.3), r: 0.96, g: 0.96, b: 0.98, glow: 0.5, size: rnd(0.45, 0.65), drag: 2.4 }); }
      }
      // (embers out of the cap while it burns — and the fallout: confetti, from under the cap, once it has cooled)
      if (t > 0.4 && t < 2.2) for (let k = some(10); k > 0; k--) { const a = rnd(0, 6.283), v = rnd(2.5, 5); this._spawn({ x: c.x, y: top, z: c.z, vx: Math.cos(a) * v, vy: rnd(1, 3.5), vz: Math.sin(a) * v, life: rnd(0.8, 1.4), r: 1, g: 0.7, b: 0.25, glow: 2.6, size: rnd(0.1, 0.18), grav: 5, drag: 0.6 }); }
      if (t > 2.0 && t < 3.6) for (let k = some(34); k > 0; k--) { const p = PAPER[Math.floor(Math.random() * PAPER.length)], a = rnd(0, 6.283), d = Math.sqrt(Math.random()) * (R + 0.6); this._spawn({ x: c.x + Math.cos(a) * d, y: top + rnd(-0.9, -0.2), z: c.z + Math.sin(a) * d, vx: rnd(-0.6, 0.6), vy: rnd(-0.2, 0.9), vz: rnd(-0.6, 0.6), life: rnd(1.8, 2.8), r: p[0], g: p[1], b: p[2], size: rnd(0.1, 0.15), kind: 1, grav: 2.2, drag: 1.5, sway: rnd(3, 7) }); }
      if (t > 3.7) this.clouds.splice(i, 1);
    }
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
