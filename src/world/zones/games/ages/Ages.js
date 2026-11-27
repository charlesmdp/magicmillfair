// War Through the Ages: what is seen of it and how it is played. Its rules are in rules.js, its toys in models.js,
// its panel of buttons in panel.js; here the stage is built — a long table in the west meadow, painted like a
// fairground booth: a road of sand from end to end, a base at each end, a backdrop of painted hills, bunting and
// bulbs — and a war is played on it: a session that drives the player (see PlayerController.driver), who stands on
// the roof of the base on the left and looks at the war. The camera stands in front of the stage and does not move:
// the whole road is in the picture, over the buttons. While nobody plays, the robots of the five ages stand on the
// road, age by age, and nothing moves.
import * as THREE from 'three';
import { Parts, MeshBuilder } from '../../../props/MeshBuilder.js';
import { surfaceMaterial } from '../../../../render/SurfaceMaterial.js';
import { LAYER, staticCaster } from '../../../../render/Shadows.js';
import { ANIM } from '../../../../player/Character.js';
import { canvasBoard } from '../Boards.js';
import { formatTime } from '../course.js';
import { V, clamp, gateArch, worldClock } from '../gates.js';
import { AGES, W, ERAS, GENERAL, GATE, spot, along, startWar, press, stepWar, acePlay } from './rules.js';
import { TEAM, BASE, drawUnit, drawTurret, drawBase, drawPlane } from './models.js';
import { makePanel } from './panel.js';

const A = AGES, H = A.half, L = W.road, STEP = A.step, TAU = Math.PI * 2;
/** Where each kind walks across the road (towards the camera): the brawlers nearest, the shooters behind, the heavy ones between. */
const LANE = [0.92, 0.34, 0.62];
const ROAD = { z0: -0.42, z1: 1.6 };
/** The camera: so far in front of the middle of the stage, so high over it; what must be in the picture: so wide (half), from so low to so high. */
const CAM = { v: 31, y: 12.5, wide: 18.5, low: -1.0, lowV: 4.8, high: 7.9, highV: -2 };
const RED = [1.05, 0.1, 0.07], CREAM = [1.1, 0.98, 0.72], GILT = [1.2, 0.85, 0.16], GRASS = [[0.17, 0.56, 0.11], [0.21, 0.66, 0.14]], SAND = [0.86, 0.66, 0.36];
const FLAGS = [[1.4, 0.09, 0.06], [1.4, 1.15, 0.06], [0.06, 0.3, 1.5], [0.12, 1.05, 0.18], [1.4, 0.18, 0.95], [1.45, 0.5, 0.03]];
/** How much larger than the rules have them the robots are drawn (a brawler and a shooter; a heavy one), and the turrets. */
const BIG = [1.42, 1.42, 1.22], TURRET = 1.5;
const GATE_A = [-L / 2, L / 2]; // where the gate of each side stands along the stage
const rnd = Math.random;

const glowMat = (color, extra = {}) => new THREE.MeshBasicMaterial({ color: color ? new THREE.Color(color[0], color[1], color[2]) : 0xffffff, toneMapped: false, ...extra });
function inst(geo, mat, n, name) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.name = name; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.visible = false;
  m.setColorAt(0, _c.setRGB(1, 1, 1));
  return m;
}
/** One more instance of `m`: where, how turned, how large, of what colour. */
function put(m, x, y, z, q, sx, sy, sz, col) {
  if (m.count >= m.instanceMatrix.count) return;
  m.setMatrixAt(m.count, _m.compose(_p.set(x, y, z), q || _q0, _s.set(sx, sy, sz)));
  m.setColorAt(m.count, col ? _c.setRGB(col[0], col[1], col[2]) : _c.setRGB(1, 1, 1));
  m.count++;
}
const flush = (m) => { m.visible = m.count > 0; if (!m.count) return; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; };

/** What flies about for a moment — chips, sparks, smoke, confetti: small boxes with a speed, a life, a colour. Only seen. */
class Bits {
  constructor(group, n) {
    this.n = n; this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n).fill(1);
    this.size = new Float32Array(n); this.fall = new Float32Array(n); this.grow = new Float32Array(n); this.next = 0; this.live = 0;
    this.mesh = inst(new THREE.BoxGeometry(1, 1, 1), glowMat(), n, 'ages-bits');
    group.add(this.mesh);
  }
  /** One more: at (x, y, z), going (vx, vy, vz), for `life` s, of colour `col`, `size` m; `fall`: how much gravity pulls it (negative: it rises); `grow`: how much larger it gets (smoke). */
  add(x, y, z, vx, vy, vz, life, col, size, fall = 1, grow = 0) {
    const i = this.next; this.next = (i + 1) % this.n;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z; this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.fall[i] = fall; this.grow[i] = grow;
    this.mesh.setColorAt(i, _c.setRGB(col[0], col[1], col[2]));
    this.mesh.count = Math.max(this.mesh.count, i + 1); this.live = Math.max(this.live, life);
  }
  burst(n, x, y, z, speed, up, life, cols, size, fall = 1) { for (let i = 0; i < n; i++) { const a = rnd() * TAU, s = speed * (0.4 + 0.6 * rnd()); this.add(x, y, z, Math.cos(a) * s, up * (0.5 + rnd()), Math.sin(a) * s * 0.6, life * (0.6 + 0.6 * rnd()), cols[i % cols.length], size * (0.6 + 0.7 * rnd()), fall); } }
  update(dt) {
    const m = this.mesh;
    if (this.live <= 0) { if (m.visible) { m.visible = false; m.count = 0; this.next = 0; } return; }
    this.live -= dt; m.visible = true;
    for (let i = 0; i < m.count; i++) {
      if (this.life[i] <= 0) { m.setMatrixAt(i, _zero); continue; }
      const l = (this.life[i] -= dt), k = i * 3;
      this.v[k + 1] -= 9.8 * this.fall[i] * dt; this.v[k] *= 1 - 0.9 * dt; this.v[k + 2] *= 1 - 0.9 * dt;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      if (this.p[k + 1] < 0.03 && this.fall[i] > 0) { this.p[k + 1] = 0.03; this.v[k + 1] *= -0.35; this.v[k] *= 0.6; this.v[k + 2] *= 0.6; }
      const f = Math.max(0, l / this.max[i]), sz = this.size[i] * (this.grow[i] ? 1 + this.grow[i] * (1 - f) : 0.35 + 0.65 * f) * (this.grow[i] ? Math.min(1, f * 3) : 1);
      m.setMatrixAt(i, _m.compose(_p.set(this.p[k], this.p[k + 1], this.p[k + 2]), _q0, _s.setScalar(sz)));
    }
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.live = 0; this.mesh.count = 0; this.mesh.visible = false; this.next = 0; }
}

export class Ages {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'ages';
    this.session = null;
    this.best = 0;
    this.top = 0; // how high the stage stands: its road
  }

  build() {
    const world = this.world, mats = world.materials, cast = staticCaster(world.engine.tier), parts = new Parts();
    const paint = parts.get('paint'), matte = parts.get('matte'), wood = parts.get('woodDark'), glow = parts.get('glow');
    const P = (b, c) => b.tint(c[0], c[1], c[2], 1);
    // ---- the table: level over a meadow that is not quite
    let lo = 99, hi = -99;
    for (let a = -H.a; a <= H.a; a += 0.5) for (let v = -H.v; v <= H.v; v += 0.5) { const p = spot(a, v), h = this.data.heightAt(p.x, p.z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    const top = (this.top = hi + A.rise), deep = top - lo + 0.5;
    // (everything of the stage is drawn in its own frame: x along the road, to the right as the camera sees it; z towards the camera)
    const stage = (this.stage = new THREE.Group());
    stage.name = 'ages-frame'; stage.position.set(A.at.x, top, A.at.z); stage.rotation.y = A.look + Math.PI;
    this.group.add(stage);
    P(wood, [0.5, 0.33, 0.2]).box(-H.a, -deep, -H.v, H.a, -0.2, H.v);
    P(paint, GILT).box(-H.a - 0.12, -0.2, -H.v - 0.12, H.a + 0.12, -0.05, H.v + 0.12);
    // (its skirt: planks painted red and cream, as round a booth of the fair)
    for (let a = -H.a, n = 0; a < H.a - 0.01; a += 0.75, n++) P(paint, n % 2 ? CREAM : RED).box(a, -deep, H.v, Math.min(H.a, a + 0.75), -0.2, H.v + 0.05);
    for (const s of [-1, 1]) for (let v = -H.v, n = 0; v < H.v - 0.01; v += 0.8, n++) P(paint, n % 2 ? CREAM : RED).box(Math.min(s * H.a, s * (H.a + 0.05)), -deep, v, Math.max(s * H.a, s * (H.a + 0.05)), -0.2, v + 0.8);
    P(paint, [0.3, 0.24, 0.2]).box(-H.a, -deep, -H.v - 0.05, H.a, -0.2, -H.v);
    // ---- its top: mown grass behind and before, a road of sand between, the two ruts of all the wheels that came
    for (let a = -H.a, n = 0; a < H.a - 0.01; a += 1.5, n++) { const g = GRASS[n % 2], e = Math.min(H.a, a + 1.5); P(matte, g).box(a, -0.05, -H.v, e, 0, ROAD.z0).box(a, -0.05, ROAD.z1, e, 0, H.v); }
    P(matte, SAND).box(-H.a, -0.05, ROAD.z0, H.a, 0.012, ROAD.z1);
    for (const z of [0.3, 0.9]) P(matte, [0.72, 0.54, 0.28]).box(-H.a, 0.012, z - 0.05, H.a, 0.018, z + 0.05);
    for (let a = -H.a + 0.3, n = 0; a < H.a; a += 0.85, n++) { const r = 0.07 + 0.03 * ((n * 7) % 3); for (const z of [ROAD.z0 - 0.02, ROAD.z1 + 0.02]) P(paint, [0.6, 0.57, 0.52]).box(a - r, 0, z - r, a + r, r * 1.2, z + r); }
    for (let z = ROAD.z0 + 0.1; z < ROAD.z1; z += 0.34) P(paint, CREAM).box(-0.04, 0.012, z, 0.04, 0.02, z + 0.18); // (the middle of the road)
    // ---- what grows behind the road: toy trees, rocks, bushes — low, and behind whoever fights
    const tree = (x, z, h, c) => { P(wood, [0.5, 0.3, 0.16]).cylinder(x, 0, z, 0.09, 0.07, h * 0.4, 6); paint.tint(c[0], c[1], c[2], 1).place(x, h * 0.3, z).lathe([[0.001, h * 0.72], [h * 0.14, h * 0.5], [h * 0.3, h * 0.24], [h * 0.36, 0.02], [0.001, 0]], 7).pop(); };
    for (const [x, z, h, n] of [[-10.2, -2.9, 1.9, 0], [-8.6, -2.2, 1.4, 1], [-5.4, -3.1, 2.2, 0], [-1.8, -2.5, 1.6, 1], [2.6, -3.0, 2.0, 0], [4.1, -2.1, 1.3, 1], [7.3, -2.8, 2.1, 0], [10.4, -2.4, 1.5, 1]]) tree(x, z, h, n ? [0.14, 0.5, 0.2] : [0.1, 0.38, 0.15]);
    for (const [x, z, r] of [[-7.2, -1.5, 0.3], [-3.3, -1.3, 0.22], [0.6, -1.7, 0.36], [5.6, -1.4, 0.26], [8.9, -1.6, 0.32]]) paint.tint(0.5, 0.48, 0.44, 1).place(x, 0, z).lathe([[0.001, -0.05], [r, 0], [r * 0.9, r * 0.5], [r * 0.45, r * 0.85], [0.001, r * 0.9]], 6).pop();
    for (const [x, z, n] of [[-10.6, 3.5, 0], [-6.4, 3.7, 1], [-2.1, 3.4, 2], [2.2, 3.7, 3], [6.5, 3.5, 4], [10.8, 3.6, 5], [-14.5, 3.4, 2], [14.8, 3.6, 1]]) { P(paint, [0.12, 0.42, 0.12]).box(x - 0.02, 0, z - 0.02, x + 0.02, 0.2, z + 0.02); paint.tint(...FLAGS[n], 1).place(x, 0.24, z).lathe([[0.001, -0.07], [0.08, 0], [0.001, 0.07]], 6).pop(); }
    // ---- the backdrop: a sky that pales towards the hills, two rows of painted hills, a sun, clouds
    const zb = -H.v;
    P(wood, [0.42, 0.28, 0.17]).box(-H.a, 0, zb - 0.14, H.a, 3.4, zb);
    const sky0 = [0.95, 1.1, 1.2, 1], sky1 = [0.2, 0.48, 1.15, 1];
    paint.quad(V(-H.a, 0, zb + 0.005), V(H.a, 0, zb + 0.005), V(H.a, 3.4, zb + 0.005), V(-H.a, 3.4, zb + 0.005), { colors: [sky0, sky0, sky1, sky1] });
    const hump = (x, w, h, z, c0, c1) => { const pts = [V(x - w, 0, z), V(x + w, 0, z)]; for (let n = 1; n < 12; n++) { const t = (n / 12) * Math.PI; pts.push(V(x + Math.cos(t) * w, Math.sin(t) * h, z)); } const c = pts.map((p) => { const k = clamp(p.y / h, 0, 1); return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k, 1]; }); for (let n = 1; n + 1 < pts.length; n++) { const i0 = paint.vert(pts[0], _zn, 0, 0, c[0]), i1 = paint.vert(pts[n], _zn, 0, 0, c[n]), i2 = paint.vert(pts[n + 1], _zn, 0, 0, c[n + 1]); paint.idx.push(i0, i1, i2); } };
    const disc = (x, y, rx, ry, z, c) => { const pts = []; for (let n = 0; n < 14; n++) { const t = (n / 14) * TAU; pts.push(V(x + Math.cos(t) * rx, y + Math.sin(t) * ry, z)); } paint.tint(c[0], c[1], c[2], 1).poly(pts); };
    disc(-12.4, 2.5, 0.55, 0.55, zb + 0.02, [1.6, 1.3, 0.4]);
    for (const [x, y, s] of [[-7.5, 2.75, 1], [-1.4, 2.3, 0.8], [5.2, 2.85, 1.1], [11.6, 2.4, 0.9], [-15.4, 2.2, 0.7]]) { disc(x, y, 0.9 * s, 0.26 * s, zb + 0.03, [1.3, 1.3, 1.3]); disc(x + 0.5 * s, y + 0.16 * s, 0.55 * s, 0.24 * s, zb + 0.035, [1.4, 1.4, 1.4]); disc(x - 0.5 * s, y + 0.1 * s, 0.45 * s, 0.2 * s, zb + 0.035, [1.4, 1.4, 1.4]); }
    for (const [x, w, h] of [[-15.5, 4.4, 1.9], [-8.4, 5.2, 2.3], [-0.8, 4.6, 1.7], [6.6, 5.4, 2.4], [14.4, 4.8, 2.0]]) hump(x, w, h, zb + 0.06, [0.18, 0.5, 0.45], [0.34, 0.7, 0.95]);
    for (const [x, w, h] of [[-17.2, 3.2, 1.0], [-11.6, 3.8, 1.25], [-4.6, 3.6, 0.95], [2.8, 4.2, 1.3], [10.2, 3.6, 1.05], [16.6, 3.2, 1.2]]) hump(x, w, h, zb + 0.12, [0.13, 0.44, 0.12], [0.26, 0.7, 0.2]);
    P(paint, GILT).box(-H.a, 3.4, zb - 0.16, H.a, 3.52, zb + 0.04);
    // ---- five striped posts behind it, bunting from one to the next, a string of bulbs under the bunting
    const posts = [-H.a + 0.1, -9, 0, 9, H.a - 0.1], pz = zb - 0.3, ph = 6.0;
    for (const x of posts) { for (let y = -deep, k = 0; y < ph; y += 0.6, k++) paint.tint(...(k % 2 ? CREAM : RED), 1).cylinder(x, y, pz, 0.12, 0.12, Math.min(0.6, ph - y), 8); paint.tint(...GILT, 1).place(x, ph, pz).lathe([[0.001, 0.3], [0.11, 0.24], [0.16, 0.13], [0.11, 0.02], [0.001, 0]], 8).pop(); }
    let fl = 0;
    for (let n = 0; n + 1 < posts.length; n++) {
      const x0 = posts[n], x1 = posts[n + 1], sag = (t) => 4 * t * (1 - t), cnt = Math.round((x1 - x0) / 0.5);
      for (let i = 0; i < cnt; i++) {
        const t0 = i / cnt, t1 = (i + 1) / cnt, tm = (t0 + t1) / 2, y0 = ph - 0.25 - sag(t0) * 0.9, y1 = ph - 0.25 - sag(t1) * 0.9, ym = (y0 + y1) / 2, xa = x0 + (x1 - x0) * t0, xb = x0 + (x1 - x0) * t1, xm = (xa + xb) / 2;
        P(paint, [0.6, 0.6, 0.56]).beam(V(xa, y0, pz + 0.14), V(xb, y1, pz + 0.14), 0.02, 0.02);
        paint.tint(...FLAGS[fl++ % FLAGS.length], 1).tri(V(xa + 0.04, y0 - 0.01, pz + 0.15), V(xm, ym - 0.42, pz + 0.15), V(xb - 0.04, y1 - 0.01, pz + 0.15));
        if (i % 2 === 0) { const yb = ph - 1.1 - sag(tm) * 1.0; P(glow, i % 4 ? [2.6, 2.1, 1.0] : [2.8, 1.4, 0.6]).place(xm, yb, pz + 0.16).lathe([[0.001, -0.09], [0.07, -0.05], [0.09, 0.02], [0.05, 0.08], [0.001, 0.1]], 6).pop(); P(paint, [0.2, 0.2, 0.2]).box(xm - 0.008, yb + 0.1, pz + 0.152, xm + 0.008, yb + 0.26, pz + 0.168); }
      }
    }
    // (two lamps at the front corners, low: they light nothing, they glow)
    for (const s of [-1, 1]) { P(wood, [0.5, 0.33, 0.2]).cylinder(s * (H.a - 0.2), -0.2, H.v - 0.2, 0.07, 0.06, 1.3, 6); P(glow, [2.8, 2.2, 1.1]).place(s * (H.a - 0.2), 1.2, H.v - 0.2).lathe([[0.001, -0.14], [0.12, -0.08], [0.15, 0.03], [0.08, 0.14], [0.001, 0.17]], 8).pop(); }
    stage.add(parts.toMeshes(mats, { name: 'ages-stage', layers: cast }));
    // ---- its name over the backdrop, on a painted board
    const marquee = canvasBoard(1024, 150, (ctx, w, h) => {
      ctx.fillStyle = '#3a1410'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f6e7b8'; ctx.font = "700 70px Georgia, 'Times New Roman', serif"; ctx.fillText(A.name.toUpperCase(), w / 2, 60, w - 60);
      ctx.fillStyle = '#f2c14e'; ctx.font = '600 28px system-ui, sans-serif'; ctx.fillText(ERAS.map((e) => e.name.replace(' Age', '').toUpperCase()).join('   ·   '), w / 2, 116, w - 60);
    }, 8.2, 1.2, { both: true });
    marquee.mesh.position.set(0, 4.3, zb - 0.1); marquee.mesh.name = 'ages-marquee'; stage.add(marquee.mesh);
    // ---- the toys: one material for all of them (their colours are in their vertices)
    this.toys = surfaceMaterial({ name: 'ages-toys', rough: 0.55, spec: 0.3 });
    // ---- the two bases, in the dress of each age: only the two that are worn are shown
    this.bases = [0, 1].map((side) => ERAS.map((_, era) => {
      const bp = new Parts(); drawBase(bp, era, side, GATE_A[side], side ? -1 : 1);
      const g = bp.toMeshes(mats, { name: `ages-base-${side}-${era}`, layers: [LAYER.DYNAMIC_CASTER] });
      g.visible = false; stage.add(g);
      return g;
    }));
    // ---- the turrets: so many of each age at the most (three a base)
    this.turrets = ERAS.map((_, era) => [0, 1].map((side) => { const b = new MeshBuilder(); drawTurret(b, era, side ? -1 : 1); const m = inst(b.build(), this.toys, W.places, `ages-turret-${era}-${side}`); m.layers.enable(LAYER.DYNAMIC_CASTER); stage.add(m); return m; }));
    // ---- while nobody plays: one's own robots of the five ages on the road, age by age, and a board that names the ages
    {
      const b = new MeshBuilder(); this.paradeAt = [];
      ERAS.forEach((e, era) => { const x = -8.6 + era * 4.3; this.paradeAt.push(x); [[1, -1.3], [0, -0.1], [2, 1.4]].forEach(([k, dx]) => { b.push(new THREE.Matrix4().makeScale(BIG[k], BIG[k], BIG[k]).setPosition(x + dx, 0.012, LANE[k])); drawUnit(b, era, k, 0, 1); b.pop(); }); });
      this.parade = new THREE.Mesh(b.build(), this.toys); this.parade.name = 'ages-parade'; this.parade.layers.enable(LAYER.STATIC_CASTER);
      const strip = canvasBoard(2048, 72, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 40px Georgia, serif';
        ERAS.forEach((e, era) => { const cx = ((this.paradeAt[era] + 11.5) / 23) * w; ctx.fillStyle = '#3a1410'; ctx.beginPath(); ctx.roundRect(cx - 170, 6, 340, h - 12, 14); ctx.fill(); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 4; ctx.stroke(); ctx.fillStyle = '#f6e7b8'; ctx.fillText(`${'I II III IV V'.split(' ')[era]} · ${e.name.toUpperCase()}`, cx, h / 2 + 2, 320); });
      }, 23, 0.81);
      strip.mesh.material.transparent = true; strip.mesh.position.set(0, 0.34, 2.5); strip.mesh.rotation.x = -0.5; strip.mesh.name = 'ages-ages';
      this.parade.add(strip.mesh); stage.add(this.parade);
    }
    // ---- the arch on the grass, where one asks
    const wp = new Parts(), gy = this.data.heightAt(GATE.x, GATE.z);
    this.gate = { x: GATE.x, y: gy, z: GATE.z, yaw: GATE.yaw };
    gateArch(this.group, wp.get('paint'), GATE.x, gy, GATE.z, GATE.yaw, A.name.toUpperCase(), 'TWO ARMIES · FIVE AGES · THE FASTEST VICTORY', { tone: [0.2, 0.5, 1.7], ink: '#101a2e' });
    this.group.add(wp.toMeshes(mats, { name: 'ages-gate', layers: cast }));
    // (one does not walk through the table)
    world.collision.addBox(A.at.x, A.at.z, H.a + 0.15, H.v + 0.2, A.look + Math.PI, -1e9, top + 9);
    // ---- where the camera stands, where the bars of the two bases hang, where one's robot stands
    const deck = stage.localToWorld(V(GATE_A[0] - BASE.stand.d, BASE.deck, BASE.stand.z));
    this.stand = { x: deck.x, y: deck.y, z: deck.z, yaw: A.look - Math.PI / 2 };
    this.rest();
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    return this;
  }

  /** The stage as it is while nobody plays: a base of stone on the left, a base of the atom on the right, the robots of the five ages between them. */
  rest() {
    this.bases.forEach((side, i) => side.forEach((g, era) => { g.visible = era === (i ? 4 : 0); g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); }));
    for (const pair of this.turrets) for (const m of pair) { m.count = 0; m.visible = false; }
    this._turret(0, 0, 0, 1); this._turret(1, 4, 0, 1);
    for (const pair of this.turrets) for (const m of pair) flush(m);
    this.parade.visible = true;
  }
  /** One more turret to draw this frame: of side `side` and of age `era`, in place `j`, so much pulled back by its last shot. */
  _turret(side, era, j, k) {
    const m = this.turrets[era][side], dir = side ? -1 : 1;
    put(m, GATE_A[side] - dir * (W.mount[j] + (1 - k) * 0.14), BASE.roof, BASE.turret.z, null, TURRET, TURRET * (0.88 + 0.12 * k), TURRET);
  }

  setBest(ms) { this.best = ms || 0; }
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.5 * 2.5; }

  /** What is only made when the first war begins: the armies, their bars, what they shoot, what flies about. */
  _arm() {
    if (this.units) return;
    const stage = this.stage;
    this.tall = []; this.units = [];
    for (let era = 0; era < ERAS.length; era++) for (let k = 0; k < 3; k++) for (let side = 0; side < 2; side++) {
      const b = new MeshBuilder(); drawUnit(b, era, k, side);
      const g = b.build(), m = inst(g, this.toys, W.cap + 6, `ages-unit-${era}-${k}-${side}`);
      m.layers.enable(LAYER.DYNAMIC_CASTER); stage.add(m); this.units.push(m);
      if (!side) (this.tall[era] ||= [])[k] = g.boundingBox.max.y;
    }
    const flat = new THREE.CircleGeometry(0.5, 14); flat.rotateX(-Math.PI / 2);
    this.shades = inst(flat, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 2 * W.cap + 12, 'ages-shades');
    const bar = new THREE.PlaneGeometry(1, 1);
    this.bars = inst(bar, glowMat(null, { depthTest: false }), 4 * W.cap + 8, 'ages-bars'); this.bars.renderOrder = 30;
    this.balls = inst(new THREE.SphereGeometry(1, 8, 6), this.toys, 90, 'ages-balls'); this.balls.layers.enable(LAYER.DYNAMIC_CASTER);
    this.streaks = inst(new THREE.BoxGeometry(1, 1, 1), glowMat(), 120, 'ages-streaks');
    this.bits = new Bits(stage, 520);
    const pb = new MeshBuilder(); drawPlane(pb);
    this.plane = new THREE.Mesh(pb.build(), this.toys); this.plane.name = 'ages-plane'; this.plane.visible = false;
    this.fire = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), glowMat([3, 2.4, 1.2], { transparent: true, opacity: 0.92, depthWrite: false })); this.fire.name = 'ages-fire'; this.fire.visible = false; this.fire.renderOrder = 25;
    const ring = new THREE.RingGeometry(0.82, 1, 40); ring.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ring, glowMat([3, 2.6, 1.6], { transparent: true, opacity: 0.8, depthWrite: false })); this.ring.name = 'ages-ring'; this.ring.visible = false;
    stage.add(this.shades, this.bars, this.balls, this.streaks, this.plane, this.fire, this.ring);
    stage.updateMatrixWorld(true);
  }

  /** The pictures of the buttons: the three robots and the turret of each age, drawn once by the renderer of the game. */
  _pictures(era) {
    const all = (this.pictures ||= []);
    if (all[era] !== undefined) return all[era];
    all[era] = null;
    try {
      const renderer = this.world.engine.renderer, N = 96, scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x777788, 0.5)); const sun = new THREE.DirectionalLight(0xffffff, 0.42); sun.position.set(2, 3, 4); scene.add(sun);
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true }), was = renderer.getRenderTarget(), color0 = new THREE.Color(), alpha0 = renderer.getClearAlpha();
      renderer.getClearColor(color0); renderer.setClearColor(0x000000, 0);
      const out = [];
      for (let b = 0; b < 4; b++) {
        const mb = new MeshBuilder(); if (b < 3) drawUnit(mb, era, b, 0, 1); else drawTurret(mb, era, 1);
        const geo = mb.build(), mesh = new THREE.Mesh(geo, mat), box = geo.boundingBox, cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2, half = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, 0.8) * 0.56;
        scene.add(mesh);
        cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.updateProjectionMatrix();
        cam.position.set(cx + 6, cy + 3.5, 14); cam.lookAt(cx, cy, 0);
        const rt = new THREE.WebGLRenderTarget(N, N, { samples: 4, depthBuffer: true }), px = new Uint8Array(N * N * 4);
        renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam); renderer.readRenderTargetPixels(rt, 0, 0, N, N, px); rt.dispose();
        scene.remove(mesh); geo.dispose();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = N;
        const ctx = canvas.getContext('2d'), img = ctx.createImageData(N, N);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const s = ((N - 1 - y) * N + x) * 4, d = (y * N + x) * 4; for (let c = 0; c < 3; c++) img.data[d + c] = Math.round(255 * Math.pow(px[s + c] / 255, 1 / 2.2)); img.data[d + 3] = px[s + 3]; }
        ctx.putImageData(img, 0, 0); out.push(canvas);
      }
      renderer.setRenderTarget(was); renderer.setClearColor(color0, alpha0); mat.dispose();
      all[era] = out;
    } catch { all[era] = null; }
    return all[era];
  }

  /**
   * A war is asked for: the player is put on the roof of the base on the left, the panel of buttons comes, and
   * the war begins after a moment. `io`: { play, note, … }. Returns the session — the driver of the player (see
   * src/extras/plug.js).
   */
  open(player, io) {
    this._arm();
    const seed = (Math.floor(worldClock() / 97) % 99991) + 1, st = startWar(seed), events = [], queue = [];
    const S = { count: 2.6, acc: 0, after: 0, cam: null, chosen: -1, held: 0, repeat: 0, said: -1, smoke: 0 };
    this.bits.clear(); this.vis = new Map(); this.dying = []; this.fx = []; this.recoil = [[9, 9, 9], [9, 9, 9]]; this.shake = [0, 0]; this.blast = null; this.raid = null; this.fallen = -1; this.sunk = 0;
    this.parade.visible = false;
    const touch = !!document.getElementById('ui')?.classList.contains('touch'); // (a telephone: the game says so on its own page)
    const panel = (this.panel = makePanel({ touch, press: (b) => queue.push(b), pictures: (era) => this._pictures(era) }));
    const session = {
      ages: this, over: false, ended: false, score: 0, line: '', riding: false, anim: ANIM.idle, state: st, auto: false, seed, instance: seed,
      step: (dt, pl, control) => {
        const inp = pl.input;
        // (the stick chooses a button, the jump key presses it: the whole game with a stick and one button)
        if (control && inp && !st.over) {
          const x = Math.abs(inp.move.x) > 0.5 ? Math.sign(inp.move.x) : 0;
          if (x && (x !== S.held || (S.repeat -= dt) <= 0)) { S.chosen = S.chosen < 0 ? (x > 0 ? 0 : 5) : (S.chosen + x + 6) % 6; S.repeat = x !== S.held ? 0.36 : 0.16; }
          S.held = x;
          if (inp.jump) queue.push(S.chosen < 0 ? 0 : S.chosen);
        }
        if (S.count > 0) {
          S.count -= Math.min(dt, 0.25); queue.length = 0;
          if (S.count <= 0) { io.play('start'); panel.say('To war!', 'age', 1400); panel.tip(touch ? 'Shooters bring a base down — send sturdy robots before them' : 'Shooters bring a base down — send sturdy robots before them · keys 1 … 6', 9000); }
        } else if (!st.over) {
          for (const b of queue) { if (press(st, 0, b)) { panel.done(b); io.play(b === 4 ? 'rocket' : b === 5 ? 'checkpoint' : b === 3 ? 'press' : 'click', { volume: b < 3 ? 0.5 : 0.8 }); } else { panel.nope(b); io.play('tick', { volume: 0.35, rate: 0.7 }); } }
          queue.length = 0;
          if (session.auto) { S.acc += Math.min(dt, 0.25); while (S.acc >= STEP && !st.over) { S.acc -= STEP; acePlay(st); stepWar(st, STEP, events); } } else stepWar(st, dt, events);
        }
        for (const e of events) this._tell(e, st, io, S);
        events.length = 0;
        pl.pos.set(this.stand.x, this.stand.y, this.stand.z); pl.vel?.set(0, 0, 0); pl.yaw = this.stand.yaw; pl.pitch = 0; pl.roll = 0; pl.speed = 0; pl.grounded = true;
        session.anim = ANIM.idle;
        if (st.over) {
          S.after += dt;
          if (!session.over) { session.over = true; session.score = st.won ? st.time : 0; panel.end(); }
          if (S.after > 6) session.ended = true;
        }
        const era = ERAS[st.sides[0].age].name;
        session.line = S.count > 0 ? `${A.name} · ${Math.max(1, Math.ceil(S.count))}…`
          : st.won ? `victory · ${formatTime(st.time)}` : st.over ? (st.out ? 'the war is called off' : 'defeat') : `${era} · ${formatTime(Math.round(st.clock * 1000))}`;
        panel.update(st, S.chosen);
      },
      /** The camera: in front of the stage, over it, the whole road in the picture — and the stage clear of the buttons. */
      camera: (cam) => {
        S.cam = cam;
        const view = { w: window.innerWidth || 1280, h: window.innerHeight || 720 }, r = panel.rect();
        // (the share of the picture the stage may take: under the line of the run, over the buttons)
        const y0 = (view.h < 520 ? 34 : 64) / view.h, y1 = clamp((r.top - (view.h < 520 ? 2 : 10)) / view.h, 0.5, 0.94);
        const near = Math.atan2(CAM.y - CAM.low, CAM.v - CAM.lowV), far = Math.atan2(CAM.y - CAM.high, CAM.v - CAM.highV), dist = Math.hypot(CAM.v, CAM.y - 1);
        const need = 2 * Math.atan(Math.tan(Math.atan2(CAM.wide, dist)) / cam.aspect), fit = (near - far) / (y1 - y0), fov = clamp(Math.max(need, fit), 0.3, 1.9);
        // (the middle of what must be seen comes in the middle of the room it has)
        const pitch = (near + far) / 2 + ((y0 + y1) / 2 - 0.5) * -fov, at = spot(0, CAM.v), to = spot(0, CAM.v - Math.cos(pitch) * 10);
        cam.position.set(at.x, this.top + CAM.y, at.z); cam.up.set(0, 1, 0);
        cam.lookAt(to.x, this.top + CAM.y - Math.sin(pitch) * 10, to.z);
        // (an eye of one's own, the same: what the page shows over the stage — the bars of the bases, the gold of a fall — is placed through it, whatever the game does with its camera meanwhile)
        const eye = (this.eye ||= new THREE.PerspectiveCamera());
        eye.position.copy(cam.position); eye.quaternion.copy(cam.quaternion); eye.fov = (fov * 180) / Math.PI; eye.aspect = cam.aspect; eye.updateProjectionMatrix(); eye.updateMatrixWorld(true);
        this.view = view;
        return eye.fov;
      },
      /** The war is over (or left): the player is put back on the grass, before the arch. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x, this.gate.z, this.gate.yaw); session.close(); },
      /** … and the war is put away: the armies, what flies, the panel. */
      close: () => {
        if (this.session !== session) return;
        this.session = null; this.panel = null; panel.close();
        for (const m of [...this.units, this.shades, this.bars, this.balls, this.streaks]) { m.count = 0; m.visible = false; }
        this.plane.visible = this.fire.visible = this.ring.visible = false; this.bits.clear();
        this.rest();
      },
    };
    this.session = session; this.S = S;
    session.step(0, player, false);
    return session;
  }

  /** What an event of the war sounds and looks like. */
  _tell(e, st, io, S) {
    const bits = this.bits, panel = this.panel, mine = e.side === 0, dir = e.side ? -1 : 1;
    if (e.type === 'out') {
      const k = e.unit.def.k;
      bits.burst(5, GATE_A[e.side] - dir * 0.75, 0.3, LANE[k], 1.2, 1.4, 0.4, [[1.6, 1.4, 1.0]], 0.09, 0.4);
      if (!mine && k === 2) { panel.say(`A ${e.unit.def.name} is coming!`, 'warn', 1800); io.play('bell', { volume: 0.5, rate: 0.8 }); }
    } else if (e.type === 'hit') {
      const u = e.unit, x = along(e.side ? L - u.p : u.p) + dir * (u.def.len / 2 + 0.1);
      bits.burst(4, x, 0.8, LANE[u.def.k], 2.2, 1.8, 0.25, [[3, 2.6, 0.8], [3, 1.4, 0.3]], 0.07);
      io.play('whack', { volume: 0.22, rate: 1.25 - 0.1 * u.def.era });
    } else if (e.type === 'shot') {
      const q = e.shot;
      if (q.turret >= 0) this.recoil[q.side][q.turret] = 0;
      if (q.era >= 2 && q.era <= 3) { const x = q.turret >= 0 ? GATE_A[q.side] - dir * (W.mount[q.turret] - 0.9) : along(q.from) + dir * 0.4; bits.add(x, q.turret >= 0 ? BASE.roof + 0.9 : 0.85, q.turret >= 0 ? BASE.turret.z : LANE[q.k], dir * 0.8, 0.5, 0, 0.5, [1.5, 1.5, 1.5], 0.16, -0.1, 1.2); }
      io.play(q.era === 2 && (q.k === 2 || q.turret >= 0) ? 'bang' : 'shot', { volume: q.turret >= 0 ? 0.3 : 0.16, rate: [0.7, 1.5, 0.9, 1.3, 2.1][q.era] });
    } else if (e.type === 'land') {
      const q = e.shot, x = along(q.to);
      if (e.hurt) bits.burst(q.era >= 2 ? 5 : 3, x, q.at ? 0.8 : 1.4, q.at ? LANE[q.at.def.k] : 0.6, 1.8, 1.6, 0.25, q.era === 4 ? [[0.6, 3, 1.2], [0.8, 2.6, 3]] : [[3, 2.4, 0.8], [1.2, 1.1, 1.0]], 0.07);
    } else if (e.type === 'fall') {
      const u = e.unit, v = this.vis.get(u.id), x = v ? v.x : along(e.side ? L - u.p : u.p);
      this.dying.push({ era: u.def.era, k: u.def.k, side: e.side, x, t: 0 });
      this.vis.delete(u.id);
      bits.burst(10, x, 0.7, LANE[u.def.k], 2.6, 2.6, 0.7, [TEAM[e.side], [1.1, 1.1, 1.15], [0.3, 0.3, 0.33]], 0.11);
      if (!mine) { const p = this._page(x, 1.7, LANE[u.def.k]); if (p) panel.gold(p.x, p.y, `+${e.gold}`); io.play('coin', { volume: 0.3 }); } else io.play('miss', { volume: 0.25, rate: 0.8 });
    } else if (e.type === 'base') {
      this.shake[e.side] = 0.22; panel.ouch(e.side);
      bits.burst(3, GATE_A[e.side] + (e.side ? 1 : -1) * 0.2, 1.2, 0.6, 1.6, 2.0, 0.5, [[0.9, 0.85, 0.78], [0.5, 0.48, 0.45]], 0.1);
      io.play('hit', { volume: e.side ? 0.25 : 0.45, rate: e.side ? 1.2 : 0.8 });
    } else if (e.type === 'turret') {
      bits.burst(12, GATE_A[e.side] - dir * W.mount[e.place], BASE.roof + 0.5, BASE.turret.z, 1.6, 2.2, 0.6, [[2.6, 2.2, 0.8], [1.6, 1.6, 1.6]], 0.1);
    } else if (e.type === 'blow') {
      this._blow(e, st);
      if (mine) panel.say(`${ERAS[e.era].blow.name}!`, 'blow', 2200); else { panel.say(`Their ${ERAS[e.era].blow.name.replace(/^The /, '')}!`, 'warn', 2200); io.play('rocket', { volume: 0.7, rate: 0.8 }); }
    } else if (e.type === 'strike') {
      io.play('boom', { volume: e.era === 4 ? 1 : 0.6, rate: e.era === 4 ? 0.7 : 1.2 });
      if (e.era === 4) { panel.flash(); const x = this.blowAt?.[e.side] ?? 0; this.blast = { x, t: 0 }; bits.burst(70, x, 0.5, 0.6, 5, 9, 2.2, [[3, 2.2, 0.8], [3, 1.2, 0.3], [0.5, 0.45, 0.4]], 0.4, 0.5); for (let n = 0; n < 40; n++) bits.add(x + (rnd() - 0.5) * 1.5, 1 + rnd() * 5, 0.6 + (rnd() - 0.5), (rnd() - 0.5) * (n > 20 ? 5 : 1), 2.5 + rnd() * 2, (rnd() - 0.5) * 0.6, 2.4, n % 3 ? [0.6, 0.55, 0.5] : [2.6, 1.4, 0.4], 0.5, -0.12, 2.5); }
    } else if (e.type === 'age') {
      const era = ERAS[e.era], x = GATE_A[e.side] - dir * 3.5;
      bits.burst(60, x, 4.5, 0, 4, 6, 1.6, [TEAM[e.side], [2.6, 2.1, 0.5], [2.4, 2.4, 2.4]], 0.14, 0.7);
      if (mine) { panel.say(era.name, 'age', 2600, `${era.units.map((u) => u.name).join(' · ')} · +${era.income} gold a second`); io.play('cheer', { volume: 0.6 }); } else { panel.say(`The other side reaches the ${era.name}`, 'warn', 2400); io.play('bell', { volume: 0.7 }); }
    } else if (e.type === 'bold') {
      panel.say('The other general holds nothing back now!', 'warn', 4200, 'Its coffers are open: heavy ones and shooters, and no more councils'); io.play('rage', { volume: 0.7 });
    } else if (e.type === 'won') {
      this.fallen = 1; panel.say('VICTORY', 'win', 0, `the other base fell in ${formatTime(e.time)}`); io.play('victory');
      for (let n = 0; n < 5; n++) bits.burst(50, -10 + n * 5, 5 + rnd() * 2, 0, 5, 5, 2.6, FLAGS, 0.16, 0.5);
    } else if (e.type === 'lost') { this.fallen = 0; panel.say('DEFEAT', 'lose', 0, 'your base has fallen'); io.play('wasted'); }
    else if (e.type === 'off') { panel.say('The war is called off', 'warn', 0, 'neither base fell in a quarter of an hour'); io.play('fail'); }
  }

  /** A great blow is on its way: what one sees of it before it falls (the rules count the seconds). */
  _blow(e, st) {
    const side = e.side, dir = side ? -1 : 1, at = st.clock + W.fuse, foes = st.sides[1 - side].units, own = GATE_A[side];
    const targets = foes.map((u) => ({ x: along(side ? u.p : L - u.p), z: LANE[u.def.k] }));
    const mid = targets.length ? targets.reduce((n, t) => n + t.x, 0) / targets.length : dir * 5;
    (this.blowAt ||= [0, 0])[side] = mid;
    const more = (n) => { while (targets.length < n) targets.push({ x: clamp(mid + (rnd() - 0.5) * 9, -11, 11), z: 0.2 + rnd() * 0.9 }); };
    const fly = (o) => this.fx.push(o);
    if (e.era === 0) { more(9); for (const t of targets) { const t0 = at - 0.95 - rnd() * 0.3; fly({ kind: 'ball', x0: t.x - dir * (5 + rnd() * 3), y0: 13 + rnd() * 3, z0: t.z - 1.5, x1: t.x, y1: 0.2, z1: t.z, t0, t1: at + rnd() * 0.08, arc: 0, size: 0.26 + rnd() * 0.16, col: [0.42, 0.26, 0.16], trail: [[2.6, 0.9, 0.12], [2.8, 1.6, 0.3]], dust: [[0.5, 0.45, 0.4], [2.6, 1.0, 0.15]] }); } }
    else if (e.era === 1) { more(6); for (let n = 0; n < 38; n++) { const t = targets[n % targets.length]; fly({ kind: 'streak', x0: own - dir * (1 + rnd() * 3), y0: 2.5 + rnd() * 2, z0: -2 + rnd() * 4, x1: t.x + (rnd() - 0.5) * 1.3, y1: 0.1, z1: t.z + (rnd() - 0.5) * 0.5, t0: at - 1.45 - rnd() * 0.12, t1: at + rnd() * 0.1, arc: 7 + rnd() * 2, size: 0.7, thick: 0.045, col: [1.8, 1.5, 1.0], dust: n % 4 ? null : [[1.4, 1.2, 0.8]] }); } }
    else if (e.era === 2) { more(8); for (const t of targets) { const t0 = at - 1.0 - rnd() * 0.15; fly({ kind: 'ball', x0: own - dir * (2 + rnd() * 3), y0: 3.4, z0: -1 + rnd() * 3, x1: t.x, y1: 0.25, z1: t.z, t0, t1: at + rnd() * 0.08, arc: 2.4, size: 0.24, col: [0.1, 0.1, 0.12], trail: [[1.3, 1.3, 1.3]], dust: [[3, 1.8, 0.4], [0.8, 0.75, 0.7], [0.2, 0.2, 0.2]] }); } for (let n = 0; n < 14; n++) this.bits.add(own - dir * (2 + rnd() * 3), 3.4, -1 + rnd() * 3, dir * (1 + rnd()), 0.6, 0, 1.2, [1.6, 1.6, 1.6], 0.4, -0.1, 1.5); }
    else if (e.era === 3) { more(7); this.raid = { dir, t0: at - 1.7, t1: at + 1.1, from: own - dir * 8, to: -own + dir * 8 }; for (const t of targets) fly({ kind: 'ball', x0: t.x - dir * 2.4, y0: 8.3, z0: 0.6, x1: t.x, y1: 0.25, z1: t.z, t0: at - 0.8 - rnd() * 0.1, t1: at + rnd() * 0.08, arc: 0, size: 0.22, long: 1.7, col: [0.16, 0.18, 0.14], dust: [[3, 1.8, 0.4], [0.5, 0.48, 0.45], [0.2, 0.2, 0.2]] }); }
    else fly({ kind: 'ball', x0: mid - dir * 1.5, y0: 16, z0: 0.6, x1: mid, y1: 0.5, z1: 0.6, t0: at - 1.55, t1: at, arc: 0, size: 0.42, long: 1.9, col: [1.6, 1.6, 1.5], trail: [[2.6, 2.6, 2.6]] });
  }

  /** Where a place of the stage is on the page (px), through the camera of the war: null before the camera is known. */
  _page(x, y, z) {
    const eye = this.eye, view = this.view;
    if (!eye || !view || !this.S?.cam) return null;
    this.stage.localToWorld(_p.set(x, y, z)).project(eye);
    return { x: (_p.x * 0.5 + 0.5) * view.w, y: (-_p.y * 0.5 + 0.5) * view.h };
  }

  /** Every frame: nothing while nobody plays; the war as its rules have it otherwise. */
  update(dt = 0) {
    const session = this.session;
    if (!session) return;
    const st = session.state, d = clamp(dt || 0, 0, 0.05), now = st.clock, bits = this.bits, S = this.S;
    for (const m of this.units) m.count = 0;
    this.shades.count = this.bars.count = this.balls.count = this.streaks.count = 0;
    for (const pair of this.turrets) for (const m of pair) m.count = 0;
    // ---- the two bases: the dress of their age, a shudder when they are hit, the fall of the one that lost
    for (let i = 0; i < 2; i++) {
      const s = st.sides[i];
      if (this.shake[i] > 0) this.shake[i] -= d;
      const k = this.shake[i] > 0 ? 0.035 : 0;
      this.bases[i].forEach((g, era) => {
        g.visible = era === s.age;
        if (!g.visible) return;
        if (this.fallen === i) { this.sunk = Math.min(1, this.sunk + d / 3.5); g.position.set((rnd() - 0.5) * 0.08 * (1 - this.sunk), -2.6 * this.sunk * this.sunk, 0); g.rotation.z = (i ? -1 : 1) * 0.16 * this.sunk; if (rnd() < 0.8) bits.add(GATE_A[i] + (i ? 1 : -1) * (0.5 + rnd() * 4.5), 0.4 + rnd() * 3, -3 + rnd() * 5, (rnd() - 0.5), 1.5 + rnd() * 2, 0, 1.6, rnd() < 0.3 ? [2.6, 1.0, 0.15] : [0.3, 0.28, 0.26], 0.32, -0.1, 2); }
        else { g.position.set((rnd() - 0.5) * k, 0, (rnd() - 0.5) * k); g.rotation.z = 0; }
      });
      s.turrets.forEach((t, j) => { if (!t || this.fallen === i) return; const r = (this.recoil[i][j] += d); this._turret(i, t.era, j, clamp(r / 0.25, 0, 1)); });
      // (the chimney of the steam age smokes, the tower of the atom steams)
      if (s.age >= 3 && this.fallen !== i && (S.smoke += d) > 0.12) { S.smoke = 0; const dirB = i ? 1 : -1; bits.add(GATE_A[i] + dirB * (s.age === 3 ? BASE.to - 0.7 : BASE.to - 0.95), s.age === 3 ? 7 : 6.5, BASE.back + (s.age === 3 ? 0.7 : 0.95), 0.3, 0.9, 0, 2.2, s.age === 3 ? [0.5, 0.48, 0.46] : [2, 2, 2], 0.3, -0.03, 2.2); }
    }
    // ---- the robots: each where the rules have it, a little late (so that one who steps past another is seen to step)
    const seen = this.vis;
    for (let i = 0; i < 2; i++) {
      const dir = i ? -1 : 1, col = TEAM[i];
      for (const u of st.sides[i].units) {
        const df = u.def, k = df.k, x1 = along(i ? L - u.p : u.p);
        let v = seen.get(u.id); if (!v) { v = { x: x1 }; seen.set(u.id, v); }
        v.x += (x1 - v.x) * Math.min(1, d * 13);
        const age = now - u.born, grow = clamp(age / 0.22, 0.2, 1) * BIG[k], walks = u.moving && df.speed > 0, legs = k !== 2 || df.era === 0 || df.era === 4, ph = now * df.speed * 3.4 + u.id * 1.7;
        // (it waddles as it walks; it lunges when it hits, leans back when it shoots; it starts when it is hit)
        const hit = u.hit < 0.26 ? Math.sin((u.hit / 0.26) * Math.PI) : 0, ouch = u.ouch < 0.12 ? 1 : 0;
        const lean = df.range ? hit * -0.13 : hit * 0.34, reach = df.range ? hit * -0.09 : hit * 0.24;
        const roll = walks && legs ? Math.sin(ph) * 0.1 : 0, bob = walks ? (legs ? Math.abs(Math.sin(ph)) * 0.06 : Math.abs(Math.sin(ph * 2.3)) * 0.012) : 0;
        _q.setFromEuler(_e.set(roll, 0, -dir * lean - dir * ouch * -0.08));
        put(this.units[df.era * 6 + k * 2 + i], v.x + dir * (reach - ouch * 0.05), 0.012 + bob, LANE[k], _q, grow, grow, grow, ouch ? [2.4, 2.4, 2.4] : null);
        put(this.shades, v.x, 0.02, LANE[k], null, df.len * 0.95, 1, 0.7 + (k === 2 ? 0.5 : 0));
        if (u.hp < df.hp) { const f = clamp(u.hp / df.hp, 0, 1), y = this.tall[df.era][k] * BIG[k] + 0.22, w = k === 2 ? 1.3 : 0.8; put(this.bars, v.x, y, LANE[k], null, w + 0.06, 0.15, 1, [0.03, 0.03, 0.04]); put(this.bars, v.x - (w / 2) * (1 - f), y, LANE[k] + 0.01, null, w * f, 0.09, 1, i ? [3, 0.5, 0.3] : [0.4, 1.4, 3]); }
        void col;
      }
    }
    for (let n = this.dying.length - 1; n >= 0; n--) { // (who fell tips over backwards and is gone)
      const q = this.dying[n], dir = q.side ? -1 : 1; q.t += d;
      if (q.t > 0.55) { this.dying.splice(n, 1); continue; }
      const f = q.t / 0.55, sc = (1 - 0.5 * f * f) * BIG[q.k];
      _q.setFromEuler(_e.set(0, 0, dir * f * 1.5));
      put(this.units[q.era * 6 + q.k * 2 + q.side], q.x - dir * f * 0.4, 0.012 + 0.25 * Math.sin(f * Math.PI), LANE[q.k], _q, sc, sc, sc, [1 - 0.6 * f, 1 - 0.6 * f, 1 - 0.6 * f]);
    }
    // ---- what is shot: a stone, an arrow, a ball, a bullet, a ray — each on its way to what it was aimed at
    for (const q of st.shots) {
      const f = clamp(q.t / q.T, 0, 1), dir = q.side ? -1 : 1, tur = q.turret >= 0;
      const x0 = tur ? GATE_A[q.side] - dir * (W.mount[q.turret] - 0.8) : along(q.from), x1 = along(q.to), dist = Math.abs(x1 - x0);
      const y0 = tur ? BASE.roof + 0.95 : q.k === 2 ? [1, 1, 0.85, 1.25, 2.0][q.era] : 0.95, z0 = tur ? BASE.turret.z : LANE[q.k], y1 = q.at ? 0.75 : 1.5, z1 = q.at ? LANE[q.at.def.k] : 0.6;
      const arc = tur ? [1.7, 0.5, 3.4, 0, 0][q.era] : [0.26, 0.2, 0.03, 0, 0][q.era] * dist, h = 4 * f * (1 - f) * arc;
      const x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f + h, z = z0 + (z1 - z0) * f, slope = Math.atan2(y1 - y0 + 4 * (1 - 2 * f) * arc, (x1 - x0) || 1e-3);
      if (q.era === 0) put(this.balls, x, y, z, null, tur ? 0.2 : 0.1, tur ? 0.2 : 0.1, tur ? 0.2 : 0.1, [0.9, 0.86, 0.8]);
      else if (q.era === 2) { const r = tur ? 0.2 : q.k === 2 ? 0.17 : 0.07; put(this.balls, x, y, z, null, r, r, r, [0.12, 0.12, 0.14]); }
      else { _q.setFromEuler(_e.set(0, 0, slope)); const len = q.era === 1 ? (tur ? 0.95 : 0.6) : q.era === 3 ? (q.k === 2 && !tur ? 0.5 : 0.36) : tur ? 1.5 : q.k === 2 ? 1.2 : 0.9, th = q.era === 1 ? 0.04 : q.era === 3 ? (q.k === 2 && !tur ? 0.12 : 0.05) : q.k === 2 || tur ? 0.12 : 0.07; put(this.streaks, x, y, z, _q, len, th, th, q.era === 1 ? [1.5, 1.2, 0.8] : q.era === 3 ? [3, 2.5, 0.8] : tur ? [2.4, 2.8, 3.2] : q.side ? [3.2, 1.0, 0.5] : [0.6, 3.2, 1.6]); }
    }
    // ---- a great blow on its way: what falls, the plane of the air raid, the ball of fire of the atom
    for (let n = this.fx.length - 1; n >= 0; n--) {
      const q = this.fx[n];
      if (now < q.t0) continue;
      if (now >= q.t1 || st.over) { if (q.dust) bits.burst(9, q.x1, 0.3, q.z1, 3, 3.5, 0.7, q.dust, 0.15); this.fx.splice(n, 1); continue; }
      const f = (now - q.t0) / (q.t1 - q.t0), h = 4 * f * (1 - f) * q.arc, x = q.x0 + (q.x1 - q.x0) * f, y = q.y0 + (q.y1 - q.y0) * f + h, z = q.z0 + (q.z1 - q.z0) * f;
      const slope = Math.atan2(q.y1 - q.y0 + 4 * (1 - 2 * f) * q.arc, (q.x1 - q.x0) || 1e-3);
      _q.setFromEuler(_e.set(0, 0, slope));
      if (q.kind === 'ball') put(this.balls, x, y, z, _q, q.size * (q.long || 1), q.size, q.size, q.col); else put(this.streaks, x, y, z, _q, q.size, q.thick, q.thick, q.col);
      if (q.trail && rnd() < 0.7) bits.add(x, y, z, (rnd() - 0.5) * 0.6, 0.3, (rnd() - 0.5) * 0.6, 0.45, q.trail[Math.floor(rnd() * q.trail.length)], q.size * 0.7, -0.05, 1);
    }
    if (this.raid) { const r = this.raid, f = (now - r.t0) / (r.t1 - r.t0); this.plane.visible = f >= 0 && f <= 1; if (this.plane.visible) { this.plane.position.set(r.from + (r.to - r.from) * f, 9.2 + Math.sin(f * 9) * 0.15, 0.6); this.plane.rotation.set(Math.sin(f * 7) * 0.12, r.dir > 0 ? 0 : Math.PI, 0); } else if (f > 1) this.raid = null; }
    if (this.blast) {
      const b = this.blast; b.t += d;
      const f = b.t / 2.2;
      if (f >= 1) { this.blast = null; this.fire.visible = this.ring.visible = false; }
      else {
        const r = 6.5 * Math.min(1, b.t / 0.3) * (1 - 0.35 * f);
        this.fire.visible = true; this.fire.position.set(b.x, 1.2 + f * 3.5, 0.6); this.fire.scale.set(r, r * (0.8 + 0.5 * f), r * 0.55); this.fire.material.opacity = 0.92 * (1 - f) ** 1.5; this.fire.material.color.setRGB(3, 2.4 - 1.6 * f, 1.2 - 1.1 * f);
        this.ring.visible = true; this.ring.position.set(b.x, 0.06, 0.6); this.ring.scale.setScalar(1 + 26 * Math.sqrt(f)); this.ring.material.opacity = 0.8 * (1 - f);
      }
    }
    bits.update(d);
    for (const m of this.units) flush(m);
    for (const m of [this.shades, this.bars, this.balls, this.streaks]) flush(m);
    for (const pair of this.turrets) for (const m of pair) flush(m);
    // ---- over each base, how much of it stands
    if (this.panel) for (let i = 0; i < 2; i++) { const p = this._page(GATE_A[i] + (i ? -1 : 1) * 2.5, 4.3, 0); if (p) this.panel.place(i, p.x, p.y); }
    void GENERAL;
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q0 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0), _zn = new THREE.Vector3(0, 0, 1);
