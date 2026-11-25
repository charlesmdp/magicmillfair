// The quad race: three laps of the gravel track round the wheat fields, against the clock. The quad is driven
// like a kart: it slides when thrown into a bend with the drift button held (and leaves the bend faster for
// it), hops, flies off the ramp, and is thrown forward by the pads of light on the track.
//
// The track is a path of the world (layout: PATHS 'race'); what stands on it is built here: the gantry of the
// start and its lights, the line, the pads, the ramp at the end of its funnel of bales, the chicanes, the logs
// to hop, the kerbs and the arrows of the bends, the stand to watch from, the board of the best times.
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';
import { makeMaterial, GLSL_COMMON, GLSL_LIGHTING } from '../../../render/globals.js';
import { seatAt } from '../../../player/PlayerController.js';
import { RACE } from '../../layout/layout.js';
import { canvasBoard } from './Boards.js';
import { formatTime } from './course.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// how a quad behaves in the race (metres, seconds)
const TOP = 20, BOOST = 26.5, OFF = 0.55, ACCEL = 13, BRAKE = 20, BACK = 5, GRIP = 10, SLIDE = 2.3, GRAVITY = 24, RADIUS = 0.8, HOP = 7.2;
const RAMP = { length: 7, half: 1.9, rise: 2.3 }, PAD = { length: 6, half: 2.2 }, LOG = { radius: 0.27, top: 0.42 };
const RED = [0.85, 0.12, 0.1], WHITE = [1.45, 1.45, 1.4], STRAW = [1.45, 1.15, 0.5], STEEL = [0.22, 0.24, 0.28];
const UP = V(0, 1, 0), _n = V(0, 0, 0), _e1 = V(0, 0, 0), _e2 = V(0, 0, 0);
// what the starts are called, and painted with (see RACE.starts)
const START_TONES = { Red: '#e23b2e', Blue: '#2f7fe6', Green: '#2fae4f', Yellow: '#f2c14e', Purple: '#9a5be0', Orange: '#f08a24' };
/** A quad whose front looks towards `want`, whatever the order its corners are given in. */
const facing = (b, A, B, C, D, want = UP, o = {}) => (_n.crossVectors(_e1.subVectors(B, A), _e2.subVectors(D, A)).dot(want) >= 0 ? b.quad(A, B, C, D, o) : b.quad(A, D, C, B, o));

// The pads: chevrons of light that run the way one drives.
const PAD_VERT = /* glsl */ `
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
const PAD_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
in vec2 vUv; // across the pad, and along it (the way one drives)
in vec3 vWorld;
void main() {
  float x = abs(vUv.x - 0.5) * 2.0;
  float wave = fract(vUv.y * 3.0 + x * 0.85 - uTime * 1.7);
  float chevron = smoothstep(0.42, 0.5, wave) * (1.0 - smoothstep(0.92, 1.0, wave));
  float pulse = 0.8 + 0.2 * sin(uTime * 7.0);
  vec3 col = mix(vec3(0.9, 0.22, 0.02), vec3(2.2, 1.7, 0.25), chevron) * pulse;
  float a = (0.42 + 0.58 * chevron) * smoothstep(1.0, 0.84, x) * smoothstep(0.0, 0.07, vUv.y) * smoothstep(1.0, 0.93, vUv.y);
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col) * a, a);
}
`;

/** One can ask for a start until that long before it leaves (seconds): the time to be put on the grid. */
const JOIN = 0.6;

export class Race {
  constructor(zone) {
    this.zone = zone;
    this.world = zone.world;
    this.data = zone.data;
    this.session = null;
    /** The clock the starts are counted on (ms): the game gives it the one everybody shares. */
    this.clock = () => Date.now();
  }

  /**
   * The start a visitor who asks now would leave with: the one that is counted down, until its very last
   * second (JOIN) — one is put on the grid at once, the lights that are left go out, and off it goes.
   * { name ('Red'…), tone (its colour), wait (seconds until it), at (when, on the clock) }.
   */
  nextStart(now = this.clock(), least = JOIN) {
    const every = RACE.every * 1000, n = Math.ceil((now + least * 1000) / every), name = RACE.starts[((n % RACE.starts.length) + RACE.starts.length) % RACE.starts.length];
    return { n, name, tone: START_TONES[name] || '#f2c14e', at: n * every, wait: (n * every - now) / 1000 };
  }

  build() {
    const path = this.data.meta.paths.find((p) => p.id === 'race');
    if (!path) return this;
    // the line of the track: points about two metres apart, closed; s = metres from the first one
    const raw = path.samples.slice(0, -1), n = raw.length;
    let s = 0;
    this.pts = raw.map((p, i) => {
      const q = raw[(i + 1) % n], l = Math.hypot(q[0] - p[0], q[1] - p[1]), tx = (q[0] - p[0]) / l, tz = (q[1] - p[1]) / l, pt = { x: p[0], z: p[1], y: p[2], s, tx, tz, nx: tz, nz: -tx, l };
      s += l;
      return pt;
    });
    this.length = s;
    this.width = path.width;
    const L = this.length, W2 = this.width / 2, h = (x, z) => this.data.heightAt(x, z);
    const parts = new Parts(), paint = parts.get('paint'), wood = parts.get('woodDark'), glow = parts.get('glow'), matte = parts.get('matte'), cloth = parts.get('doubleSided'), deck = parts.get('woodDeck');
    const zone = this.zone;
    // a point of the track `l` metres to the side (towards +n) of where `p` is, on the ground (or `lift` above it)
    const c = (p, l, lift = 0) => { const x = p.x + p.nx * l, z = p.z + p.nz * l; return V(x, h(x, z) + lift, z); };
    // a strip of paint laid on the track from `s0` to `s1` metres along it, between two offsets: it follows the ground
    const strip = (b, s0, s1, l0, l1, lift = 0.05) => { const p0 = this.at(s0), p1 = this.at(s1); facing(b, c(p0, l0, lift), c(p0, l1, lift), c(p1, l1, lift), c(p1, l0, lift)); };
    /** What a driver has to go round: { s, pass (the offset of a clear line there), reach (from how far to think of it) }. */
    this.obstacles = [];
    const busy = []; // [s, reach]: stretches where the bends are not dressed (something stands there already)
    const taken = (sv, m = 0) => busy.some(([b, r]) => { let d = sv - b; d -= Math.round(d / L) * L; return Math.abs(d) < r + m; });

    // a bale of straw with its red band (it stops a quad), lying along `yaw`
    const bale = (x, z, yaw, r = 0.72) => {
      const y = h(x, z);
      matte.tint(STRAW[0], STRAW[1], STRAW[2], 1).place(x, y, z, yaw).box(-0.45, 0, -0.75, 0.45, 0.8, 0.75).pop();
      paint.tint(RED[0], RED[1], RED[2], 1).place(x, y, z, yaw).box(-0.47, 0.25, -0.2, 0.47, 0.55, 0.2, { faces: 'xXY' }).pop();
      zone.colliders.push({ type: 'circle', x, z, r, y0: y - 1, y1: y + 1.2 });
    };
    // three tyres, one on the other
    const tyres = (x, z, top = RED) => {
      const y = h(x, z);
      for (let k = 0; k < 3; k++) { const t = k === 2 ? top : k ? WHITE : [0.07, 0.07, 0.08]; matte.tint(t[0], t[1], t[2], 1).place(x, y + k * 0.24, z, k * 0.7).lathe([[0.2, 0.0], [0.38, 0.02], [0.43, 0.12], [0.38, 0.22], [0.2, 0.24]], 9).pop(); }
      zone.colliders.push({ type: 'circle', x, z, r: 0.45, y0: y - 1, y1: y + 1.0 });
    };
    // a pole with a pennant
    const flag = (x, z, tall, tone, yaw) => {
      const y = h(x, z), fx = Math.sin(yaw), fz = Math.cos(yaw);
      paint.tint(WHITE[0], WHITE[1], WHITE[2], 1).rod(V(x, y - 0.3, z), V(x, y + tall, z), 0.035, 5);
      cloth.tint(tone[0], tone[1], tone[2], 1).tri(V(x, y + tall, z), V(x, y + tall - 0.7, z), V(x + fx * 1.3, y + tall - 0.35, z + fz * 1.3));
    };
    // a string of small flags from a to b
    const TONES = [RED, WHITE, [1.5, 1.05, 0.2], [0.1, 0.6, 0.65]];
    const bunting = (a, b) => {
      const m = Math.max(4, Math.round(a.distanceTo(b) / 0.8));
      let prev = a;
      for (let k = 1; k <= m; k++) {
        const q = a.clone().lerp(b, k / m);
        q.y -= Math.sin((k / m) * Math.PI) * 0.5;
        wood.tint(0.9, 0.85, 0.7, 1).rod(prev, q, 0.012, 3, { caps: false });
        const mid = prev.clone().lerp(q, 0.5), t = TONES[k % TONES.length];
        cloth.tint(t[0], t[1], t[2], 1).tri(prev.clone().lerp(q, 0.12), prev.clone().lerp(q, 0.88), V(mid.x, mid.y - 0.36, mid.z));
        prev = q;
      }
    };

    // ---- the start: a chequered line, a gantry over it with its banner and its lights, flags along the straight
    const S0 = RACE.start * L, st = this.at(S0);
    this.start = { s: S0, x: st.x, z: st.z };
    busy.push([S0, 16]);
    for (let i = 0; i < 10; i++) for (let j = 0; j < 3; j++) {
      const k = (i + j) % 2 ? [0.06, 0.06, 0.07] : WHITE;
      strip(paint.tint(k[0], k[1], k[2], 1), S0 + j * 0.6, S0 + (j + 1) * 0.6, -W2 + i * (this.width / 10), -W2 + (i + 1) * (this.width / 10));
    }
    const HW = W2 + 0.9, TOPY = 6.2;
    const posts = [-1, 1].map((g) => c(st, g * HW));
    const baseY = Math.max(posts[0].y, posts[1].y);
    for (const p of posts) {
      for (let k = 0; k < 10; k++) { const t = k % 2 ? WHITE : RED; paint.tint(t[0], t[1], t[2], 1).box(p.x - 0.2, p.y - 0.3 + k * 0.66, p.z - 0.2, p.x + 0.2, p.y - 0.3 + (k + 1) * 0.66, p.z + 0.2); }
      paint.tint(1.5, 1.1, 0.2, 1).place(p.x, baseY + TOPY + 0.1, p.z).lathe([[0.0, 0.0], [0.24, 0.1], [0.26, 0.3], [0.0, 0.5]], 8).pop();
      zone.colliders.push({ type: 'circle', x: p.x, z: p.z, r: 0.36 });
      tyres(p.x - st.tx * 0.9, p.z - st.tz * 0.9);
    }
    // (a truss: two beams, braces between them)
    paint.tint(STEEL[0], STEEL[1], STEEL[2], 1);
    for (const dy of [TOPY, TOPY - 1.45]) paint.beam(V(posts[0].x, baseY + dy, posts[0].z), V(posts[1].x, baseY + dy, posts[1].z), 0.14, 0.14);
    for (let k = 0; k < 8; k++) {
      const a = posts[0].clone().lerp(posts[1], k / 8), b = posts[0].clone().lerp(posts[1], (k + 1) / 8);
      paint.beam(V(a.x, baseY + (k % 2 ? TOPY : TOPY - 1.45), a.z), V(b.x, baseY + (k % 2 ? TOPY - 1.45 : TOPY), b.z), 0.07, 0.07);
    }
    const banner = canvasBoard(1024, 150, (ctx, w, hh) => {
      for (const x0 of [0, w - 150]) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#111' : '#f6f1e4'; ctx.fillRect(x0 + i * 75, j * 75, 75, 75); }
      ctx.fillStyle = '#b3541e'; ctx.fillRect(150, 0, w - 300, hh);
      ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = "900 104px Georgia, 'Times New Roman', serif";
      ctx.fillText(RACE.name.toUpperCase(), w / 2, hh / 2 + 6, w - 340);
    }, HW * 2 - 0.5, (HW * 2 - 0.5) * (150 / 1024), { both: true });
    banner.mesh.position.set(st.x - st.tx * 0.09, baseY + TOPY - 0.72, st.z - st.tz * 0.09);
    banner.mesh.rotation.y = Math.atan2(-st.tx, -st.tz); // it faces those who come up to the line (and reads from the other side too)
    banner.mesh.name = 'race:banner';
    zone.group.add(banner.mesh);
    {
      // the lights: three red ones that come on one by one, a green one to go — hung under the truss, turned
      // towards the grid (the lit lamps are meshes of their own, shown when it is their turn)
      const yaw = Math.atan2(-st.tx, -st.tz), cy = baseY + TOPY - 2.0;
      paint.tint(0.05, 0.05, 0.06, 1).place(st.x, cy, st.z, yaw).box(-1.25, -0.3, -0.16, 1.25, 0.3, 0.1);
      for (const dx of [-0.9, -0.3, 0.3, 0.9]) paint.tint(dx > 0.6 ? 0.03 : 0.16, dx > 0.6 ? 0.14 : 0.03, 0.03, 1).place(dx, 0, 0.1, 0, Math.PI / 2).lathe([[0.2, 0.0], [0.0, 0.0]], 10).pop();
      paint.pop();
      paint.tint(STEEL[0], STEEL[1], STEEL[2], 1);
      for (const dx of [-0.9, 0.9]) paint.rod(V(st.x + Math.cos(yaw) * dx, cy + 0.3, st.z - Math.sin(yaw) * dx), V(st.x + Math.cos(yaw) * dx, baseY + TOPY - 1.45, st.z - Math.sin(yaw) * dx), 0.03, 4, { caps: false });
      this.lamps = [-0.9, -0.3, 0.3, 0.9].map((dx, k) => {
        const b = new Parts().get('glow'), t = k === 3 ? [0.1, 0.9, 0.18] : [0.95, 0.04, 0.03];
        b.tint(t[0], t[1], t[2], 1).place(0, 0, 0, 0, Math.PI / 2).lathe([[0.0, 0.0], [0.19, 0.0], [0.17, 0.05], [0.0, 0.09]], 10).pop();
        const m = new THREE.Mesh(b.build(), this.world.materials.glow);
        m.name = 'moving-race-lamp';
        m.position.set(st.x + Math.cos(yaw) * dx + Math.sin(yaw) * 0.125, cy, st.z - Math.sin(yaw) * dx + Math.cos(yaw) * 0.125);
        m.rotation.y = yaw;
        m.visible = false;
        zone.group.add(m);
        return m;
      });
    }
    // flags along the straight, bunting from the gantry to the first of them
    for (const g of [-1, 1]) {
      let prev = V(posts[g < 0 ? 0 : 1].x, baseY + TOPY - 0.1, posts[g < 0 ? 0 : 1].z);
      for (const d of [-13, -26]) {
        const p = this.at(S0 + d), q = c(p, g * (W2 + 1.5));
        flag(q.x, q.z, 4.2, TONES[(d === -13 ? 0 : 2) + (g > 0 ? 1 : 0)], Math.atan2(p.tx, p.tz));
        const top = V(q.x, q.y + 4.1, q.z);
        if (d === -13) bunting(prev, top);
        prev = top;
      }
    }

    // ---- the stand: three tiers of benches beside the straight, on the side away from the paddock
    {
      const g = -RACE.paddock, p = this.at(S0 + 13), yaw = Math.atan2(-p.nx * g, -p.nz * g); // it looks at the track
      const mid = c(p, g * (W2 + 4.4)), fx = Math.sin(yaw), fz = Math.cos(yaw), sx = Math.cos(yaw), sz = -Math.sin(yaw), HALF = 4.6;
      // (level, on the highest ground under it)
      let y0 = -1e9;
      for (const a of [-HALF, 0, HALF]) for (const b of [-1.6, 1.6]) y0 = Math.max(y0, h(mid.x + sx * a - fx * b, mid.z + sz * a - fz * b));
      for (let k = 0; k < 3; k++) {
        const back = -1.3 + k * 0.95, ty = y0 + 0.42 * (k + 1), bx = mid.x - fx * (back + 0.0), bz = mid.z - fz * (back + 0.0);
        deck.tint(1.05, 0.97, 0.85, 1).place(bx, ty, bz, yaw).box(-HALF, -0.07, -0.45, HALF, 0, 0.45, { tile: 1.2 }).pop();
        wood.tint(0.5, 0.42, 0.34, 1).place(bx, ty, bz, yaw);
        for (const a of [-HALF + 0.2, -HALF / 3, HALF / 3, HALF - 0.2]) wood.box(a - 0.07, -0.07 - 0.42 * (k + 1) - 0.5, -0.4, a + 0.07, -0.07, 0.4, { tile: 1 });
        wood.pop();
        zone.platforms.push({ type: 'slab', x: bx, z: bz, hw: HALF, hl: 0.48, yaw, y: ty });
        for (let q = 0; q < 6; q++) { const a = -HALF + 0.75 + q * ((2 * HALF - 1.5) / 5); this.world.seats.push(seatAt(bx + sx * a + fx * 0.1, ty, bz + sz * a + fz * 0.1, yaw, { reach: 1.3 })); }
      }
      // a rail behind, a striped awning over it
      const top = y0 + 0.42 * 3;
      paint.tint(STEEL[0], STEEL[1], STEEL[2], 1);
      const P = (a, b, y) => V(mid.x + sx * a - fx * b, y, mid.z + sz * a - fz * b);
      for (const a of [-HALF, HALF]) { paint.rod(P(a, 1.1, y0 - 0.4), P(a, 1.1, top + 2.3), 0.05, 5); paint.rod(P(a, -1.75, y0 - 0.4), P(a, -1.75, top + 2.95), 0.05, 5); }
      paint.beam(P(-HALF, 1.1, top + 1.0), P(HALF, 1.1, top + 1.0), 0.06, 0.06);
      for (let k = 0; k < 8; k++) {
        const a0 = -HALF - 0.3 + (k / 8) * (2 * HALF + 0.6), a1 = -HALF - 0.3 + ((k + 1) / 8) * (2 * HALF + 0.6), t = k % 2 ? WHITE : RED;
        cloth.tint(t[0], t[1], t[2], 1).quad(P(a0, -2.05, top + 3.0), P(a1, -2.05, top + 3.0), P(a1, 1.35, top + 2.3), P(a0, 1.35, top + 2.3));
      }
      for (const a of [-HALF, HALF]) for (const b of [1.1, -1.75]) { const q = P(a, b, 0); zone.colliders.push({ type: 'circle', x: q.x, z: q.z, r: 0.14 }); }
    }

    // ---- the pads that throw the quad forward: chevrons of light running along the track (one mesh, its own
    // shader), and on each side a post with an arrow of light, to be seen from far
    {
      const pos = [], uv = [], idx = [], NX = 4, NZ = 8;
      this.pads = RACE.boosts.map((u) => {
        const s0 = u * L, base = pos.length / 3;
        busy.push([s0 + PAD.length / 2, PAD.length / 2 + 2]);
        for (let j = 0; j <= NZ; j++) {
          const p = this.at(s0 + (j / NZ) * PAD.length);
          for (let i = 0; i <= NX; i++) { const q = c(p, (i / NX - 0.5) * 2 * PAD.half, 0.08); pos.push(q.x, q.y, q.z); uv.push(i / NX, j / NZ); }
        }
        for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = base + j * (NX + 1) + i, b = a + NX + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
        const p = this.at(s0), yaw = Math.atan2(-p.tx, -p.tz);
        for (const g of [-1, 1]) {
          const q = c(p, g * (W2 + 0.9));
          for (let k = 0; k < 4; k++) { const t = k % 2 ? WHITE : [0.1, 0.35, 0.8]; paint.tint(t[0], t[1], t[2], 1).box(q.x - 0.09, q.y - 0.3 + k * 0.75, q.z - 0.09, q.x + 0.09, q.y - 0.3 + (k + 1) * 0.75, q.z + 0.09); }
          // two chevrons, one over the other, facing those who arrive
          glow.tint(1.0, 0.7, 0.08, 1).place(q.x, q.y + 2.75, q.z, yaw);
          for (const dy of [0, 0.5]) for (const sgn of [-1, 1]) facing(glow, V(sgn * 0.55, dy, 0), V(0, dy + 0.45, 0), V(0, dy + 0.75, 0), V(sgn * 0.55, dy + 0.3, 0), V(0, 0, 1));
          glow.pop();
          zone.colliders.push({ type: 'circle', x: q.x, z: q.z, r: 0.2 });
        }
        return { s: s0 + PAD.length / 2, hot: 0 };
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      const mesh = new THREE.Mesh(g, makeMaterial({ vertexShader: PAD_VERT, fragmentShader: PAD_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
      mesh.name = 'moving-race-pads';
      mesh.renderOrder = 6;
      zone.group.add(mesh);
    }

    // ---- the ramp: planks rising to a lip, at the end of a funnel of bales that brings every quad onto it
    {
      const s0 = RACE.jump * L, a = this.at(s0), b = this.at(s0 + RAMP.length), y0 = h(a.x, a.z), y1 = h(b.x, b.z) + RAMP.rise;
      busy.push([s0 - 2, 22]);
      this.obstacles.push({ s: s0 + RAMP.length, pass: 0, reach: 34 });
      const P = (t, l, dy = 0) => V(a.x + (b.x - a.x) * t + a.nx * l, y0 + 0.03 + (y1 - y0 - 0.03) * t + dy, a.z + (b.z - a.z) * t + a.nz * l);
      facing(deck.tint(1.1, 0.95, 0.75, 1), P(0, -RAMP.half), P(0, RAMP.half), P(1, RAMP.half), P(1, -RAMP.half), UP, { tile: 1.2 });
      // (arrows painted on the planks; hazard stripes down its sides; the face under the lip)
      for (let k = 0; k < 3; k++) {
        const t0 = 0.14 + k * 0.28, t1 = t0 + 0.1;
        paint.tint(1.5, 1.1, 0.1, 1);
        for (const g of [-1, 1]) facing(paint, P(t0, g * 1.25, 0.012), P(t1, g * 1.25, 0.012), P(t1 + 0.1, 0, 0.012), P(t0 + 0.1, 0, 0.012));
      }
      for (const g of [-1, 1]) {
        for (let k = 0; k < 8; k++) {
          const t0 = k / 8, t1 = (k + 1) / 8, t = k % 2 ? [0.06, 0.06, 0.07] : [1.5, 1.2, 0.1];
          const A = P(t0, g * RAMP.half), B = P(t1, g * RAMP.half), A0 = V(A.x, Math.min(A.y, h(A.x, A.z)) - 0.2, A.z), B0 = V(B.x, Math.min(B.y, h(B.x, B.z)) - 0.2, B.z);
          facing(paint.tint(t[0], t[1], t[2], 1), A0, B0, B, A, V(a.nx * g, 0, a.nz * g));
        }
        paint.tint(RED[0], RED[1], RED[2], 1).beam(P(0, g * RAMP.half, 0.1), P(1, g * RAMP.half, 0.1), 0.14, 0.14);
        const lip = P(1, g * (RAMP.half + 0.25));
        wood.tint(0.5, 0.42, 0.34, 1).box(lip.x - 0.12, h(lip.x, lip.z) - 0.3, lip.z - 0.12, lip.x + 0.12, lip.y, lip.z + 0.12, { tile: 1 });
        paint.tint(WHITE[0], WHITE[1], WHITE[2], 1).rod(V(lip.x, lip.y, lip.z), V(lip.x, lip.y + 3.4, lip.z), 0.035, 5);
        cloth.tint(g > 0 ? 1.5 : RED[0], g > 0 ? 1.05 : RED[1], g > 0 ? 0.2 : RED[2], 1).tri(V(lip.x, lip.y + 3.4, lip.z), V(lip.x, lip.y + 2.7, lip.z), V(lip.x + a.tx * 1.3, lip.y + 3.05, lip.z + a.tz * 1.3));
      }
      const e0 = P(1, -RAMP.half), e1 = P(1, RAMP.half);
      facing(wood.tint(0.8, 0.6, 0.4, 1), e0, e1, V(e1.x, h(e1.x, e1.z) - 0.2, e1.z), V(e0.x, h(e0.x, e0.z) - 0.2, e0.z), V(a.tx, 0, a.tz), { tile: 1 });
      this.ramp = { ax: a.x, az: a.z, tx: a.tx, tz: a.tz, y0, y1 };
      zone.platforms.push({ type: 'custom', clearance: 0.9, heightAt: (x, z) => this.rampAt(x, z) });
      // (nobody drives into it from behind: its lip is a wall for whoever is on the ground)
      zone.colliders.push({ type: 'box', x: b.x + a.tx * 0.1, z: b.z + a.tz * 0.1, hw: RAMP.half, hl: 0.15, yaw: Math.atan2(-a.nz, a.nx), y0: Math.min(y0, h(b.x, b.z)) - 1, y1: y1 - 0.6 });
      // the funnel: from the edges of the track, twelve metres before, to the sides of the ramp, and on along them
      for (const g of [-1, 1]) {
        for (let k = 0; k <= 7; k++) {
          const p = this.at(s0 - 12 + k * 1.6), off = g * (W2 - 0.2 + (RAMP.half + 0.62 - W2 + 0.2) * (k / 7)), q = c(p, off);
          bale(q.x, q.z, Math.atan2(p.tx, p.tz) - g * 0.14);
        }
        for (let k = 1; k <= 4; k++) { const p = this.at(s0 + k * 1.55), q = c(p, g * (RAMP.half + 0.62)); bale(q.x, q.z, Math.atan2(p.tx, p.tz)); }
        const p = this.at(s0 - 12.9), q = c(p, g * (W2 + 0.35));
        tyres(q.x, q.z, [1.5, 1.1, 0.2]);
      }
    }

    // ---- chicanes: two walls of bales, each from one edge to the middle of the track, far enough apart
    // (RACE.gap) for a quad at full speed to go from one side to the other without lifting
    RACE.chicanes.forEach((u, m) => {
      const s0 = u * L;
      busy.push([s0 + RACE.gap / 2, RACE.gap / 2 + 8]);
      [0, RACE.gap].forEach((d, k) => {
        const g = (k + m) % 2 ? 1 : -1, p = this.at(s0 + d), yaw = Math.atan2(p.tx, p.tz);
        for (let j = 0; j < 4; j++) { const q = c(p, g * (W2 + 0.1 - j * 0.92)); bale(q.x, q.z, yaw, 0.6); }
        const end = c(p, g * 0.3);
        tyres(end.x, end.z);
        // (a red and white rail along the top of the wall: it is seen from far, from either side)
        for (let j = 0; j < 8; j++) {
          const a = c(p, g * (W2 + 0.56 - j * 0.46), 0.8), b = c(p, g * (W2 + 0.56 - (j + 1) * 0.46), 0.8), t = j % 2 ? WHITE : RED, y = Math.max(a.y, b.y);
          paint.tint(t[0], t[1], t[2], 1).beam(V(a.x, y + 0.13, a.z), V(b.x, y + 0.13, b.z), 0.2, 0.26);
        }
        this.obstacles.push({ s: s0 + d, pass: -g * (W2 / 2 + 0.2), reach: 30 });
      });
    });

    // ---- logs: a trunk lying across half the track, to hop — or to go round
    RACE.logs.forEach((u, m) => {
      const s0 = u * L, g = m % 2 ? 1 : -1, p = this.at(s0), a = c(p, g * (W2 + 0.5), LOG.radius - 0.03), b = c(p, -g * 0.35, LOG.radius - 0.03);
      busy.push([s0, 6]);
      wood.tint(0.5, 0.36, 0.25, 1).rod(a, b, LOG.radius, 8);
      wood.tint(1.2, 1.0, 0.7, 1);
      for (const [q, o] of [[a, b], [b, a]]) { const d = q.clone().sub(o).normalize(); wood.rod(q.clone().addScaledVector(d, -0.01), q.clone().addScaledVector(d, 0.012), LOG.radius * 0.86, 8); }
      // (a stub of a branch, and a stripe of paint so that it is seen in time)
      wood.tint(0.5, 0.36, 0.25, 1).rod(a.clone().lerp(b, 0.3), a.clone().lerp(b, 0.3).add(V(p.tx * 0.2, 0.5, p.tz * 0.2)), 0.07, 5);
      for (const t of [0.15, 0.5, 0.85]) { const q = a.clone().lerp(b, t), d = b.clone().sub(a).normalize(); paint.tint(1.5, 1.2, 0.1, 1).rod(q.clone().addScaledVector(d, -0.14), q.clone().addScaledVector(d, 0.14), LOG.radius + 0.012, 8, { caps: false }); }
      const base = h((a.x + b.x) / 2, (a.z + b.z) / 2); // (a quad in the air clears it once its wheels are above this, and a little more)
      zone.colliders.push({ type: 'box', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, hw: a.distanceTo(b) / 2, hl: LOG.radius, yaw: Math.atan2(-(b.z - a.z), b.x - a.x), y0: base - 1.5, y1: base + LOG.top });
      this.obstacles.push({ s: s0, pass: -g * (W2 / 2 + 0.35), reach: 12 });
    });

    // ---- the bends: bales on the outside, a kerb on the inside, and arrows where the turn is sharp
    {
      const pts = this.pts;
      let since = 99, arrows = 99;
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[(i + 4) % n], turn = p.tx * q.tz - p.tz * q.tx; // > 0: the track turns right, away from +n
        since += p.l; arrows += p.l;
        if (Math.abs(turn) < 0.16 || taken(p.s, 1)) continue;
        const g = turn > 0 ? 1 : -1; // the outside of the bend
        // (the kerb: red and white, half on the gravel, half off it)
        const t = i % 2 ? WHITE : RED;
        strip(paint.tint(t[0], t[1], t[2], 1), p.s, p.s + p.l, -g * (W2 - 0.35), -g * (W2 + 0.3), 0.06);
        if (since >= 5.5) {
          since = 0;
          const o = c(p, g * (W2 + 1.5));
          bale(o.x, o.z, Math.atan2(p.tx, p.tz), 0.75);
        }
        if (Math.abs(turn) > 0.24 && arrows >= 15) {
          arrows = 0;
          // a board on the outside, across the way one arrives: three arrows pointing where the track goes
          const o = c(p, g * (W2 + 2.6)), yaw = Math.atan2(-p.tx, -p.tz);
          paint.tint(WHITE[0], WHITE[1], WHITE[2], 1).place(o.x, o.y, o.z, yaw).box(-1.1, 1.0, -0.03, 1.1, 1.75, 0.03);
          paint.tint(RED[0], RED[1], RED[2], 1);
          const dir = g; // (seen from the track, the inside of the bend is on this side of the board)
          for (const dx of [-0.66, 0, 0.66]) {
            facing(paint, V(dx - dir * 0.2, 1.08, 0.035), V(dx + dir * 0.06, 1.08, 0.035), V(dx + dir * 0.26, 1.375, 0.035), V(dx, 1.375, 0.035), V(0, 0, 1));
            facing(paint, V(dx, 1.375, 0.035), V(dx + dir * 0.26, 1.375, 0.035), V(dx + dir * 0.06, 1.67, 0.035), V(dx - dir * 0.2, 1.67, 0.035), V(0, 0, 1));
          }
          paint.tint(STEEL[0], STEEL[1], STEEL[2], 1);
          for (const dx of [-0.9, 0.9]) paint.box(dx - 0.04, -0.3, -0.04, dx + 0.04, 1.0, 0.04);
          paint.pop();
          zone.colliders.push({ type: 'circle', x: o.x, z: o.z, r: 0.5 });
        }
      }
    }
    // ---- the paddock: where one asks to race. A great mat on the ground with nothing over it, so that it is
    // seen from wherever one comes; behind it, side by side, the board of the starts and the board of the best
    // times, and between them a mast with an arrow of light.
    const side = RACE.paddock, MAT = 3.2, A0 = HW + 3.7, B0 = -3.2;
    // (`a` metres from the middle of the track, away from it; `b` metres along it, the way one drives)
    const off = (a, b) => [st.x + st.nx * side * a + st.tx * b, st.z + st.nz * side * a + st.tz * b];
    const [mx, mz] = off(A0, B0), out = Math.atan2(st.nx * side, st.nz * side); // (`out`: facing away from the track)
    this.paddock = { x: mx, z: mz, r: MAT + 0.9 };
    {
      // the mat: it lies on the ground as the ground goes, and is read by who comes to the track
      const spot = canvasBoard(768, 768, (ctx, w) => {
        const c = w / 2, serif = "Georgia, 'Times New Roman', serif";
        ctx.clearRect(0, 0, w, w);
        ctx.fillStyle = '#b3261e'; ctx.beginPath(); ctx.arc(c, c, c - 6, 0, 7); ctx.fill();
        ctx.strokeStyle = '#f6e7b8'; ctx.lineWidth = 20; ctx.beginPath(); ctx.arc(c, c, c - 30, 0, 7); ctx.stroke();
        // the middle: a chequered disc, as on a flag, rimmed with gold
        const m = c * 0.3, q = (2 * m) / 6;
        ctx.save(); ctx.beginPath(); ctx.arc(c, c, m, 0, 7); ctx.clip();
        for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { ctx.fillStyle = (i + j) % 2 ? '#15130f' : '#fff3d6'; ctx.fillRect(c - m + i * q, c - m + j * q, q + 1, q + 1); }
        ctx.restore();
        ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(c, c, m, 0, 7); ctx.stroke();
        // what it says goes round it, three times over: it reads from wherever one comes
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const round = (text, radius, font, tone, turn, gap = 0) => {
          ctx.font = font; ctx.fillStyle = tone;
          const wide = [...text].map((ch) => ctx.measureText(ch).width + gap);
          let at = turn - wide.reduce((x, y) => x + y, 0) / radius / 2;
          [...text].forEach((ch, k) => {
            const mid = at + wide[k] / radius / 2;
            ctx.save(); ctx.translate(c + Math.sin(mid) * radius, c + Math.cos(mid) * radius); ctx.rotate(-mid); ctx.fillText(ch, 0, 0); ctx.restore();
            at += wide[k] / radius;
          });
        };
        for (let k = 0; k < 3; k++) {
          const turn = (k * 2 * Math.PI) / 3;
          round('RACE HERE', c * 0.73, `900 82px ${serif}`, k === 1 ? '#f2c14e' : '#fff3d6', turn, 5);
          round('★', c * 0.73, `900 54px ${serif}`, '#f2c14e', turn + Math.PI / 3);
          round('stand here · press E', c * 0.445, '700 29px system-ui, sans-serif', '#fff3d6', turn + Math.PI / 3, 1.5);
        }
      }, 2 * MAT, 2 * MAT);
      const fx = -st.nx * side, fz = -st.nz * side, rx = -fz, rz = fx; // towards the track (the top of what is written); to the right of who reads it
      const N = 10, pos = [], uv = [], idx = [];
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
        const u = i / N, v = j / N, x = mx + rx * (u - 0.5) * 2 * MAT + fx * (v - 0.5) * 2 * MAT, z = mz + rz * (u - 0.5) * 2 * MAT + fz * (v - 0.5) * 2 * MAT;
        pos.push(x, h(x, z) + 0.07, z); uv.push(u, v);
      }
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * (N + 1) + i; idx.push(k, k + 1, k + N + 2, k, k + N + 2, k + N + 1); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      spot.mesh.geometry.dispose();
      spot.mesh.geometry = geo;
      Object.assign(spot.mesh.material, { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide });
      spot.mesh.name = 'games:race-spot';
      spot.mesh.renderOrder = 4;
      zone.group.add(spot.mesh);
      // (no fern and no blade of grass comes through it)
      this.world.scatter?.keepOut?.push({ x: mx, z: mz, r: MAT + 0.25 });
      this.world.grass?.uniforms.uBare?.value.set(mx, mz, MAT + 0.15);
      // the mast, between the two boards: an arrow of light at its top, seen from far — this way to race
      const [ax, az] = off(A0 + MAT + 1.0, B0 + 0.13), ay = h(ax, az), yaw = Math.atan2(st.tx, st.tz);
      paint.tint(STEEL[0], STEEL[1], STEEL[2], 1).rod(V(ax, ay - 0.3, az), V(ax, ay + 6.4, az), 0.055, 6);
      zone.colliders.push({ type: 'circle', x: ax, z: az, r: 0.16 });
      glow.tint(1.0, 0.7, 0.08, 1).place(ax, ay + 4.7, az, yaw);
      for (const turn of [0, Math.PI / 2]) {
        glow.push(new THREE.Matrix4().makeRotationY(turn));
        for (const dy of [0, 0.62]) for (const sgn of [-1, 1]) for (const f of [1, -1]) facing(glow, V(sgn * 0.7, dy + 1.25, 0), V(0, dy + 0.65, 0), V(0, dy + 0.28, 0), V(sgn * 0.7, dy + 0.88, 0), V(0, 0, f));
        glow.pop();
      }
      glow.pop();
    }
    zone._add(parts, 'race');
    {
      // the board of the starts, behind the mat: the start that leaves next, counted down to its GO — and the
      // two after it, each with its colour, so that friends can settle on one (it reads from both sides). When
      // it is too late to join the one that is leaving, the board says so, and which one is next for the asking.
      const [bx, bz] = off(A0 + MAT + 1.0, B0 + 1.95), by = h(bx, bz);
      const state = { key: '', name: '', tone: '#f2c14e', wait: 9, open: true, next: [] };
      const board = canvasBoard(640, 320, (ctx, w, hh) => {
        const serif = "Georgia, 'Times New Roman', serif", sans = 'system-ui, sans-serif', gone = state.wait <= 0;
        ctx.fillStyle = '#16211b'; ctx.fillRect(0, 0, w, hh);
        ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 9; ctx.strokeRect(8, 8, w - 16, hh - 16);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = gone ? '#8be28f' : state.open ? '#f6e7b8' : '#ff9a86'; ctx.font = `700 31px ${sans}`;
        ctx.fillText(gone ? 'OFF THEY GO!' : state.open ? 'NEXT START — ASK NOW TO BE IN IT' : 'LEAVING — TOO LATE FOR THIS ONE', w / 2, 44, w - 50);
        ctx.globalAlpha = state.open || gone ? 1 : 0.6;
        ctx.fillStyle = state.tone; ctx.beginPath(); ctx.arc(78, 132, 40, 0, 7); ctx.fill();
        ctx.strokeStyle = '#f6e7b8'; ctx.lineWidth = 5; ctx.stroke();
        ctx.fillStyle = state.tone; ctx.font = `900 98px ${serif}`; ctx.fillText(state.name.toUpperCase(), w / 2 + 6, 132, w - 300);
        ctx.fillStyle = '#fff3d6'; ctx.font = `900 ${gone ? 62 : 88}px ${serif}`; ctx.textAlign = 'right'; ctx.fillText(gone ? 'GO!' : `${Math.ceil(state.wait)}`, w - 34, 134);
        ctx.globalAlpha = 1;
        // the two that follow
        ctx.fillStyle = '#b9c7bd'; ctx.font = `700 22px ${sans}`; ctx.textAlign = 'left'; ctx.fillText('THEN', 28, 252);
        state.next.forEach((s, k) => {
          const x0 = 96 + k * 266, mine = k === 0 && !state.open && !gone;
          ctx.fillStyle = mine ? 'rgba(246, 231, 184, 0.16)' : 'rgba(255, 255, 255, 0.06)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x0, 222, 254, 62, 12); else ctx.rect(x0, 222, 254, 62); ctx.fill();
          if (mine) { ctx.strokeStyle = '#f6e7b8'; ctx.lineWidth = 3; ctx.stroke(); }
          ctx.fillStyle = s.tone; ctx.beginPath(); ctx.arc(x0 + 30, 253, 17, 0, 7); ctx.fill();
          ctx.fillStyle = s.tone; ctx.font = `900 30px ${serif}`; ctx.textAlign = 'left'; ctx.fillText(s.name.toUpperCase(), x0 + 56, 254, 108);
          ctx.fillStyle = '#fff3d6'; ctx.font = `700 23px ${sans}`; ctx.textAlign = 'right'; ctx.fillText(`in ${Math.ceil(s.wait)} s`, x0 + 244, 254);
        });
        ctx.textAlign = 'center'; ctx.fillStyle = '#8fa096'; ctx.font = `600 17px ${sans}`;
        ctx.fillText(`a start every ${RACE.every} seconds — ask for the same colour as your friends and leave together`, w / 2, 300, w - 40);
      }, 2.6, 1.3, { both: true });
      board.mesh.position.set(bx, by + 2.25, bz);
      board.mesh.rotation.y = out;
      board.mesh.name = 'games:race-starts';
      zone.group.add(board.mesh);
      const post = new Parts(), pw = post.get('paint');
      for (const g of [-1, 1]) { const qx = bx + Math.cos(out) * g * 1.38, qz = bz - Math.sin(out) * g * 1.38; pw.tint(STEEL[0], STEEL[1], STEEL[2], 1).box(qx - 0.05, by - 0.3, qz - 0.05, qx + 0.05, by + 2.95, qz + 0.05); zone.colliders.push({ type: 'circle', x: qx, z: qz, r: 0.14 }); }
      zone._add(post, 'race-starts');
      const named = (k) => RACE.starts[((k % RACE.starts.length) + RACE.starts.length) % RACE.starts.length];
      /** Called every frame: the board follows the clock (it is painted again when what it says changes). */
      this.update = (pos) => {
        if ((pos.x - bx) ** 2 + (pos.z - bz) ** 2 > 70 * 70) return;
        // the start that leaves next — or that left less than a second ago (its GO stays up that long)
        const now = this.clock(), every = RACE.every * 1000, n = Math.ceil((now - 900) / every), wait = (n * every - now) / 1000, key = `${n}|${Math.ceil(wait)}`;
        if (key === state.key) return;
        Object.assign(state, { key, name: named(n), tone: START_TONES[named(n)] || '#f2c14e', wait, open: wait >= JOIN, next: [1, 2].map((k) => ({ name: named(n + k), tone: START_TONES[named(n + k)] || '#f2c14e', wait: wait + k * RACE.every })) });
        board.redraw();
      };
    }

    // the board of the best times: beside the board of the starts, the same way round
    { const [px, pz] = off(A0 + MAT + 1.2, B0 - 2.05); this.board = zone.scoreStand('race', px, pz, out, { title: RACE.name.toUpperCase(), sub: `${RACE.laps} laps of the track on a quad · best times`, format: formatTime, width: 3.0, pixels: 0.85 }); }
    return this;
  }

  /** The track `s` metres from its first point: { x, z, y, tx, tz (the way one drives), nx, nz (to the right… of the map: see paddock) }. */
  at(s) {
    const pts = this.pts, L = this.length;
    s = ((s % L) + L) % L;
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pts[mid].s <= s) lo = mid; else hi = mid - 1; }
    const p = pts[lo], q = pts[(lo + 1) % pts.length], t = (s - p.s) / p.l;
    return { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, y: p.y + (q.y - p.y) * t, tx: p.tx, tz: p.tz, nx: p.tz, nz: -p.tx, i: lo };
  }

  /** Where (x, z) is along the track, looking round the point of index `hint`: { i, s, side (metres off its middle) }. */
  locate(x, z, hint, out = {}) {
    const pts = this.pts, n = pts.length;
    let best = Infinity;
    for (let k = -8; k <= 8; k++) {
      const i = (((hint + k) % n) + n) % n, p = pts[i];
      const t = clamp(((x - p.x) * p.tx + (z - p.z) * p.tz) / p.l, 0, 1), dx = x - p.x - p.tx * p.l * t, dz = z - p.z - p.tz * p.l * t, d = dx * dx + dz * dz;
      if (d < best) { best = d; out.i = i; out.s = p.s + p.l * t; out.side = dx * p.tz - dz * p.tx; }
    }
    return out;
  }

  /** The height of the ramp under (x, z), or null. */
  rampAt(x, z) {
    const r = this.ramp, u = (x - r.ax) * r.tx + (z - r.az) * r.tz, v = (x - r.ax) * r.tz - (z - r.az) * r.tx;
    return u >= 0 && u <= RAMP.length && Math.abs(v) <= RAMP.half ? r.y0 + 0.03 + (r.y1 - r.y0 - 0.03) * (u / RAMP.length) : null;
  }

  /**
   * The offset (metres, towards +n) of a clear line `s` metres along the track: round the logs, through the
   * chicanes, onto the ramp. (For whoever drives without eyes: a bot, a ghost.)
   */
  lineAt(s) {
    const L = this.length, list = this.obstacles;
    if (!list.length) return 0;
    // the one that has just been passed, the one that comes, and how far each is
    let p = null, q = null, dp = Infinity, dq = Infinity;
    for (const o of list) { let d = s - o.s; d -= Math.floor(d / L) * L; if (d < dp) { dp = d; p = o; } if (L - d < dq) { dq = L - d; q = o; } }
    // Past one, its side is held for a few metres (the quad has to clear the end of the wall), then let go;
    // the side of the next is taken up from `reach` metres before it — or from where the last one lets go,
    // when two stand close — and reached a few metres before it.
    const HOLD = 4, LEAD = 7, TAIL = 16, ease = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const tail = p.pass * (1 - ease(HOLD, HOLD + TAIL, dp));
    const from = Math.min(q.reach, dp + dq - HOLD);
    const w = from <= LEAD ? (dq <= LEAD ? 1 : 0) : 1 - ease(LEAD, from, dq);
    return tail + (q.pass - tail) * w;
  }

  /** Is (x, z) in the paddock, where a race is asked for? */
  near(x, z) { return !!this.paddock && (x - this.paddock.x) ** 2 + (z - this.paddock.z) ** 2 < this.paddock.r ** 2; }

  /**
   * A race starts: the player is put on a quad behind the line; three, two, one… `io`: { play(sound, options),
   * note(text), go() (the clock starts) }. `start`: the start it leaves with ({ name, wait }: see nextStart());
   * `place`: a number that spreads those who leave together over the grid (four abreast, two rows).
   * Returns the session — it is also the driver of the player (see PlayerController.driver):
   * { step(dt, player, control), camera(camera, dt), line, over, time (ms), start, close() }.
   */
  open(player, io, start = { name: '', wait: 3.2 }, place = 0) {
    const L = this.length, col = this.world.collision, data = this.data;
    const back = 4.5 + 3.2 * (Math.floor(place / 4) % 2), grid0 = this.at(this.start.s - back), off = [-0.9, 0.9, -2.7, 2.7][((place % 4) + 4) % 4];
    const grid = { ...grid0, x: grid0.x + grid0.nx * off, z: grid0.z + grid0.nz * off };
    const S = {
      x: grid.x, z: grid.z, y: col.groundAt(grid.x, grid.z, 1e4), yaw: Math.atan2(grid.tx, grid.tz), vx: 0, vz: 0, vy: 0, grounded: true,
      count: Math.max(0.5, start.wait), clock: 0, prog: -back, i: grid.i, s: this.start.s - back, good: { s: this.start.s - back }, lost: 0, laps: 0, lapAt: 0,
      drift: 0, charge: 0, boost: 0, sound: 0, cam: null, fov: 62, tilt: 0, ru: null,
    };
    const lamps = this.lamps || [], light = (count, clock) => lamps.forEach((m, k) => { m.visible = k < 3 ? count > 0 && count <= 3 - k : count <= 0 && clock < 2.5; });
    const loc = {}, p = { x: 0, z: 0 };
    const reset = () => {
      const g = this.at(S.good.s);
      Object.assign(S, { x: g.x, z: g.z, y: col.groundAt(g.x, g.z, 1e4), yaw: Math.atan2(g.tx, g.tz), vx: 0, vz: 0, vy: 0, grounded: true, i: g.i, s: S.good.s, drift: 0, charge: 0, boost: 0, lost: 0 });
      io.play('respawn');
    };
    const called = start.name ? `${start.name} start` : 'ready';
    const session = {
      race: this, over: false, time: 0, line: '', laps: 0, state: S, start,
      step: (dt, pl, control) => {
        const inp = pl.input;
        let gas = control ? inp.move.y : 0, steer = control ? inp.move.x : 0;
        const wantDrift = control && inp.run, jump = control && inp.jump;
        if (S.count > 0) {
          const was = S.count;
          S.count -= dt;
          if (Math.ceil(S.count) !== Math.ceil(was) && S.count > 0 && S.count <= 3) io.play('tick');
          if (S.count <= 0) { io.play('start'); io.go(); } else { gas = 0; steer = 0; }
        } else if (!session.over) S.clock += dt;
        light(S.count, S.clock);
        if (session.over) { gas = 0; steer = 0; }
        // ---- the heading, then the speed along it and across it
        const speed = Math.hypot(S.vx, S.vz), f0x = Math.sin(S.yaw), f0z = Math.cos(S.yaw), along0 = S.vx * f0x + S.vz * f0z;
        const drifting = S.grounded && wantDrift && speed > 7 && (S.drift !== 0 || Math.abs(steer) > 0.25);
        if (drifting) { if (!S.drift) S.drift = Math.sign(steer) || 1; S.charge += dt; if ((S.sound -= dt) <= 0) { S.sound = 0.34; io.play('drift', { volume: 0.5 }); } }
        else {
          if (S.drift && S.charge > 0.7) { S.boost = Math.max(S.boost, 0.7 + Math.min(0.9, S.charge * 0.45)); io.play('boost', { volume: 0.8 }); }
          S.drift = 0; S.charge = 0;
        }
        const turn = steer * (drifting ? 2.5 : 1.95) * clamp(Math.abs(along0) / 6, 0, 1) / (1 + 0.016 * Math.max(0, speed - 9)) * (along0 < -0.5 ? -1 : 1);
        // (the heading is counted the way the valley's are: it grows turning left)
        if (S.grounded) S.yaw -= turn * dt; else S.yaw -= turn * 0.35 * dt;
        const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw), rx = -fz, rz = fx; // forwards, and to the right
        let vf = S.vx * fx + S.vz * fz, vl = S.vx * rx + S.vz * rz;
        this.locate(S.x, S.z, S.i, loc);
        const on = Math.abs(loc.side) < this.width / 2 + 0.5, top = (S.boost > 0 ? BOOST : TOP) * (on ? 1 : OFF);
        if (S.boost > 0) S.boost -= dt;
        if (S.grounded) {
          if (gas > 0) { if (vf < top) vf = Math.min(top, vf + ACCEL * gas * (S.boost > 0 ? 1.8 : 1) * dt); } else if (gas < 0) vf = Math.max(-BACK, vf - (vf > 0 ? BRAKE : 6) * -gas * dt);
          vf -= vf * (on ? 0.22 : 1.3) * dt * (gas > 0 ? 0.3 : 1); // rolling to a stop when let go; the grass holds a quad back
          if (vf > top) vf -= (vf - top) * Math.min(1, dt * 2.6);
          vl *= Math.exp(-(drifting ? SLIDE : GRIP) * dt);
        }
        S.vx = vf * fx + vl * rx; S.vz = vf * fz + vl * rz;
        // ---- on the ground of the world: what is solid stops the quad, the edge of the valley too
        p.x = S.x + S.vx * dt; p.z = S.z + S.vz * dt;
        const wx = p.x, wz = p.z;
        col.resolve(p, RADIUS, S.y);
        col.confine(p);
        if ((p.x - wx) ** 2 + (p.z - wz) ** 2 > 1e-6) { const k = Math.exp(-dt * 7); S.vx *= k; S.vz *= k; }
        const before = S.y;
        S.x = p.x; S.z = p.z;
        const ground = col.groundAt(S.x, S.z, S.y + 0.7);
        const R = this.ramp, ru = (S.x - R.ax) * R.tx + (S.z - R.az) * R.tz, rv = (S.x - R.ax) * R.tz - (S.z - R.az) * R.tx; // along the ramp, and across it
        if (S.grounded) {
          if (jump) { S.vy = HOP; S.grounded = false; io.play('jump'); }
          // off the lip of the ramp: thrown up as steeply as it rises, and a little more
          else if (S.ru !== null && ru > RAMP.length && Math.abs(rv) < RAMP.half + 0.5 && vf > 3) { S.grounded = false; S.vy = vf * (RAMP.rise / RAMP.length) * 1.1 + 2.2; io.play('jump'); }
          else if (ground < S.y - 0.3 && speed > 4) { S.grounded = false; S.vy = Math.max(0, S.slope || 0); } // over a brow
          else { S.y += (ground - S.y) * Math.min(1, dt * 30); S.slope = (S.y - before) / Math.max(dt, 1e-4); }
        }
        S.ru = S.grounded && ru >= 0 && ru <= RAMP.length && Math.abs(rv) <= RAMP.half ? ru : null;
        if (!S.grounded) {
          S.vy -= GRAVITY * dt; S.y += S.vy * dt;
          if (S.y <= ground) { S.y = ground; S.grounded = true; S.slope = 0; if (S.vy < -5) io.play('land', { volume: 0.8 }); S.vy = 0; }
        }
        // ---- the pads
        for (const pad of this.pads) {
          if (pad.hot > 0) pad.hot -= dt;
          let d = loc.s - pad.s; d -= Math.round(d / L) * L;
          if (pad.hot <= 0 && S.grounded && Math.abs(d) < PAD.length / 2 && Math.abs(loc.side) < PAD.half) { pad.hot = 1.5; S.boost = 1.15; io.play('boost'); }
        }
        // ---- how far round: only what is driven on the track (or right beside it) counts
        if (Math.abs(loc.side) < this.width / 2 + 4) {
          let d = loc.s - S.s; d -= Math.round(d / L) * L;
          S.prog += d; S.s = loc.s; S.i = loc.i; S.lost = 0;
          if (on && S.grounded) S.good.s = loc.s;
        } else if ((S.lost += dt) > 3) { io.note('Back on the track!'); reset(); }
        const water = data.waterAt(S.x, S.z);
        if (water > -500 && water - data.heightAt(S.x, S.z) > 0.6 && S.y < water) { io.note('A quad does not float.'); reset(); }
        if (S.count <= 0 && !session.over) {
          const laps = Math.floor(S.prog / L);
          if (laps > S.laps) {
            S.laps = laps;
            if (laps >= RACE.laps) { session.over = true; session.time = Math.round(S.clock * 1000); io.play('victory'); }
            else { io.play('lap'); io.note(`Lap ${laps}: ${formatTime(Math.round((S.clock - S.lapAt) * 1000))}`); }
            S.lapAt = S.clock;
          }
        }
        session.laps = S.laps;
        // ---- what the player is, as far as the world is concerned
        const slip = clamp(vl / 9, -1, 1);
        pl.pos.set(S.x, S.y, S.z);
        pl.yaw = S.yaw + slip * 0.35; // the quad points into the slide
        S.tilt += ((S.grounded ? steer * 0.1 * clamp(speed / TOP, 0, 1) - slip * 0.12 : 0) - S.tilt) * Math.min(1, dt * 8);
        pl.roll = S.tilt;
        pl.pitch = S.grounded ? clamp(-(S.slope || 0) / Math.max(4, speed), -0.5, 0.5) * 0.9 : clamp(-S.vy / 26, -0.45, 0.45);
        pl.speed = speed; pl.grounded = S.grounded;
        session.speed = speed;
        const lap = Math.min(RACE.laps, S.laps + 1);
        session.line = S.count > 0 ? `${RACE.name} · ${Math.ceil(S.count) > 3 ? `${called} in ${Math.ceil(S.count)}` : Math.ceil(S.count)}…` : session.over ? `${RACE.name} · ${formatTime(session.time)}` : `Lap ${lap}/${RACE.laps} · ${formatTime(Math.round(S.clock * 1000))} · ${Math.round(speed * 3.6)} km/h${S.boost > 0 ? ' ▲' : ''}`;
      },
      /** The camera of the race: low behind the quad, turning with where it goes rather than where it points. */
      camera: (cam, dt) => {
        const speed = Math.hypot(S.vx, S.vz), going = speed > 3 ? Math.atan2(S.vx, S.vz) : S.yaw;
        // (angles are mixed through their difference, so that the turn of the compass does not matter)
        const target = S.yaw + 0.6 * Math.atan2(Math.sin(going - S.yaw), Math.cos(going - S.yaw));
        if (S.cam === null) S.cam = target;
        S.cam += Math.atan2(Math.sin(target - S.cam), Math.cos(target - S.cam)) * Math.min(1, dt * 5.5);
        const back = 6.0 + speed * 0.06, up = 2.5 + speed * 0.02, fx = Math.sin(S.cam), fz = Math.cos(S.cam);
        let cx = S.x - fx * back, cz = S.z - fz * back, cy = S.y + up;
        const floor = col.groundAt(cx, cz, cy + 2) + 0.6;
        if (cy < floor) cy = floor;
        cam.position.set(cx, cy, cz);
        cam.lookAt(S.x + fx * 4, S.y + 1.1, S.z + fz * 4);
        S.fov += (62 + 15 * clamp(speed / TOP, 0, 1.4) + (S.boost > 0 ? 6 : 0) - S.fov) * Math.min(1, dt * 4);
        return S.fov;
      },
      close: () => { if (this.session === session) this.session = null; player.pitch = 0; player.roll = 0; for (const m of lamps) m.visible = false; },
    };
    this.session = session;
    return session;
  }
}
