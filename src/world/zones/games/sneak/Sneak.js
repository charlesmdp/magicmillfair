// Robots Can See You: what is seen of it and how it is played. Its rules are in rules.js; here it is built — a quay
// in the south of the bay with a yard on it: containers cut low so that the alleys read as a map, crates and
// sandbags, tall grass, lamps whose warm pools are painted on the paving, the robots on their rounds, the cameras
// on their poles, the searchlight on its tower, and the arch on the sand where one asks to play — and a run is
// played: a session that drives the player (see PlayerController.driver). What sees is drawn on the ground, every
// frame, from the rules: each cone and the pool of the searchlight stop at what hides (at what is low too while
// one crouches: what is drawn is where one would be seen as one stands), blue while calm, amber when it has
// heard or begins to see one, red when one is caught. The camera hangs high over the yard, looks along it and
// never turns.
import * as THREE from 'three';
import { Parts, MeshBuilder } from '../../../props/MeshBuilder.js';
import { LAYER } from '../../../../render/Shadows.js';
import { ANIM } from '../../../../player/Character.js';
import { formatTime } from '../course.js';
import { V, clamp, gateArch, worldClock } from '../gates.js';
import { SNEAK, BOXES, CORES, GATES, SAVES, ROOMS, TOWER, DOOR, VIEWERS, ROBOTS, poseAt, reach, startRun, stepRun, botInput, timeOf, coresOf } from './rules.js';

const S = SNEAK, STEP = S.step, TAU = Math.PI * 2;
const CALM = [0.07, 0.5, 0.9], WARY = [0.95, 0.6, 0.04], RED = [1.15, 0.07, 0.03], LIGHT = [0.75, 0.7, 0.42];
// what the boxes of the rules are drawn as: so high, in these colours
const HIGH = { cont: 1.55, wall: 1.25, fence: 1.05, gate: 1.4, crate: 0.75, bags: 0.62, grass: 0.8 };
const PAINTS = [[0.9, 0.2, 0.1], [0.08, 0.45, 0.55], [0.95, 0.6, 0.08], [0.12, 0.22, 0.6], [0.5, 0.55, 0.6], [0.55, 0.15, 0.4], [0.15, 0.5, 0.22]];
const LAMPS = [[-13, 31], [3, 31], [13.5, 20.6], [-13.5, 20.6], [0, 17], [11, 7.6], [-11, 7.6], [-13.5, 3.5], [-1.2, -4.6], [12.5, -4.5], [13.6, -7.4], [-13.6, -7.4], [-13.6, -17.6], [1.6, -17.8], [-13.8, -21.4], [13.8, -21.4], [-13.5, -31], [13.5, -31], [0, -28.2]];
const rnd = (a, b = 0) => { let h = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul((b | 0) + 0x7F4A7C15, 0x85EBCA6B)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const glowMat = (o = {}) => new THREE.MeshBasicMaterial({ vertexColors: true, ...o });
const light = () => glowMat({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

/** A robot of the yard, looking towards +z: a barrel on a skirt, a head with one wide eye. */
function robotGeometry() {
  const b = new MeshBuilder();
  b.tint(0.2, 0.22, 0.28, 1).cylinder(0, 0.02, 0, 0.42, 0.34, 0.3, 10);
  b.tint(0.82, 0.3, 0.1, 1).cylinder(0, 0.32, 0, 0.3, 0.33, 0.62, 10);
  b.tint(1.6, 1.25, 0.2, 1).cylinder(0, 0.9, 0, 0.34, 0.34, 0.08, 10);
  b.tint(0.24, 0.26, 0.32, 1).cylinder(0, 0.98, 0, 0.2, 0.16, 0.14, 8);
  b.tint(0.9, 0.9, 0.86, 1).box(-0.3, 1.1, -0.24, 0.3, 1.5, 0.24);
  b.tint(0.05, 0.05, 0.07, 1).box(-0.26, 1.2, 0.2, 0.26, 1.42, 0.27);
  b.tint(3.2, 2.2, 0.3, 1).box(-0.2, 1.26, 0.26, 0.2, 1.36, 0.29);
  b.tint(0.2, 0.22, 0.28, 1).box(-0.04, 1.5, -0.04, 0.04, 1.75, 0.04).box(-0.43, 0.55, -0.08, -0.33, 0.85, 0.08).box(0.33, 0.55, -0.08, 0.43, 0.85, 0.08);
  b.tint(3, 0.3, 0.2, 1).box(-0.07, 1.74, -0.07, 0.07, 1.86, 0.07);
  return b.build();
}
/** The head of a camera, looking towards +z from the top of its pole. */
function camGeometry() {
  const b = new MeshBuilder();
  b.tint(0.85, 0.85, 0.82, 1).box(-0.16, 2.3, -0.3, 0.16, 2.6, 0.34);
  b.tint(0.05, 0.05, 0.07, 1).box(-0.12, 2.34, 0.34, 0.12, 2.56, 0.4);
  b.tint(3, 0.4, 0.2, 1).box(-0.05, 2.5, 0.4, 0.05, 2.56, 0.42);
  return b.build();
}

export class Sneak {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'sneak';
    this.session = null;
    this.best = 0;
    this.floor = S.deck; // how high the floor of the yard stands over the sea
    this._c = Math.cos(S.yaw); this._s = Math.sin(S.yaw);
  }

  /** The yard's frame → the world's. */
  toWorld(x, z, out = V(0, 0, 0)) { return out.set(S.at.x + x * this._c + z * this._s, this.floor, S.at.z - x * this._s + z * this._c); }

  build() {
    const world = this.world, mats = world.materials, parts = new Parts();
    const matte = parts.get('matte'), paint = parts.get('paint'), wood = parts.get('woodDark'), glow = parts.get('glow');
    const yard = (this.yard = new THREE.Group());
    yard.name = 'sneak-yard'; yard.position.set(S.at.x, this.floor, S.at.z); yard.rotation.y = S.yaw;
    const HX = S.half.x + 1.2, HZ = S.half.z + 1.2;
    // ---- the quay: a slab on piles, its edge striped
    matte.tint(0.1, 0.105, 0.12, 1).box(-HX, -0.7, -HZ, HX, -0.02, HZ);
    for (let x = -HX + 1; x <= HX - 1; x += (2 * HX - 2) / 4) for (let z = -HZ + 1; z <= HZ - 1; z += (2 * HZ - 2) / 8) wood.tint(0.3, 0.24, 0.2, 1).cylinder(x, -7, z, 0.3, 0.3, 6.4, 8);
    for (let i = 0, n = 44; i < n; i++) { const z0 = -HZ + (i * 2 * HZ) / n, z1 = z0 + (2 * HZ) / n, c = i % 2 ? [0.9, 0.7, 0.08] : [0.05, 0.05, 0.06]; for (const s of [-1, 1]) paint.tint(...c, 1).box(s > 0 ? HX - 0.35 : -HX, -0.02, z0, s > 0 ? HX : -HX + 0.35, 0.03, z1); }
    // ---- the paving: slabs of a metre, dark, the warm pools of the lamps painted on them; brighter at the saves
    const lit = (x, z) => { let w = 0; for (const [lx, lz] of LAMPS) { const d2 = (x - lx) ** 2 + (z - lz) ** 2; w += Math.exp(-d2 / 14); } return Math.min(1, w); };
    for (let x = -15; x < 15; x++) for (let z = -32; z < 32; z++) {
      const w = lit(x + 0.5, z + 0.5), k = 0.9 + 0.2 * rnd(x + 40, z + 40), room = z >= 19 ? 0 : z >= 6 ? 1 : z >= -6 ? 2 : z >= -19 ? 3 : 4, base = room % 2 ? [0.05, 0.056, 0.09] : [0.062, 0.066, 0.096];
      matte.tint((base[0] + 0.3 * w) * k, (base[1] + 0.19 * w) * k, (base[2] + 0.05 * w) * k, 1).box(x + 0.02, -0.02, z + 0.02, x + 0.98, 0, z + 0.98);
    }
    // (the saves: a white square with a green heart; the door out: a striped mat)
    for (const s of SAVES) { paint.tint(0.8, 0.8, 0.75, 1).box(s.x - 0.9, 0, s.z - 0.6, s.x + 0.9, 0.012, s.z + 0.6); glow.tint(0.3, 1.6, 0.5, 1).box(s.x - 0.55, 0.012, s.z - 0.3, s.x + 0.55, 0.02, s.z + 0.3); }
    for (let i = 0; i < 6; i++) paint.tint(...(i % 2 ? [1.6, 1.3, 0.15] : [0.1, 0.1, 0.1]), 1).box(-1.2 + i * 0.4, 0, -31.9, -0.8 + i * 0.4, 0.012, -30.9);
    // ---- what stands in the yard, cut low: one sees over it into every alley
    const gates = [];
    BOXES.forEach((b, i) => {
      const h = HIGH[b.look] ?? 1.4;
      if (b.gate) { gates.push(b); return; }
      if (b.look === 'cont') {
        // a row of containers: each its own paint, a lighter lid, ribs across it
        const along = b.x1 - b.x0 >= b.z1 - b.z0, len = along ? b.x1 - b.x0 : b.z1 - b.z0, n = Math.max(1, Math.round(len / 6));
        for (let j = 0; j < n; j++) {
          const a0 = (along ? b.x0 : b.z0) + (j * len) / n + (j ? 0.04 : 0), a1 = (along ? b.x0 : b.z0) + ((j + 1) * len) / n - (j < n - 1 ? 0.04 : 0), c = PAINTS[Math.floor(rnd(i, j) * PAINTS.length)], hh = h + 0.12 * (rnd(i + 9, j) - 0.5);
          const x0 = along ? a0 : b.x0, x1 = along ? a1 : b.x1, z0 = along ? b.z0 : a0, z1 = along ? b.z1 : a1;
          paint.tint(c[0] * 0.4, c[1] * 0.4, c[2] * 0.4, 1).box(x0, 0, z0, x1, hh, z1);
          paint.tint(c[0] * 0.66 + 0.02, c[1] * 0.66 + 0.02, c[2] * 0.66 + 0.02, 1).box(x0 + 0.1, hh, z0 + 0.1, x1 - 0.1, hh + 0.05, z1 - 0.1);
          const ribs = Math.max(2, Math.round((a1 - a0) / 1.0));
          for (let r = 1; r < ribs; r++) { const q = a0 + ((a1 - a0) * r) / ribs; if (along) paint.tint(c[0] * 0.48, c[1] * 0.48, c[2] * 0.48, 1).box(q - 0.05, hh + 0.05, z0 + 0.12, q + 0.05, hh + 0.09, z1 - 0.12); else paint.tint(c[0] * 0.48, c[1] * 0.48, c[2] * 0.48, 1).box(x0 + 0.12, hh + 0.05, q - 0.05, x1 - 0.12, hh + 0.09, q + 0.05); }
        }
      } else if (b.look === 'wall') {
        matte.tint(0.2, 0.19, 0.19, 1).box(b.x0, 0, b.z0, b.x1, h, b.z1);
        matte.tint(0.62, 0.58, 0.5, 1).box(b.x0 - 0.04, h, b.z0 - 0.04, b.x1 + 0.04, h + 0.08, b.z1 + 0.04);
      } else if (b.look === 'fence') {
        const along = b.x1 - b.x0 >= b.z1 - b.z0, len = along ? b.x1 - b.x0 : b.z1 - b.z0, n = Math.max(1, Math.round(len / 2));
        matte.tint(0.1, 0.12, 0.14, 1).box(b.x0 + 0.1, 0, b.z0 + 0.1, b.x1 - 0.1, h - 0.1, b.z1 - 0.1);
        paint.tint(0.85, 0.66, 0.08, 1).box(b.x0, h - 0.1, b.z0, b.x1, h, b.z1);
        for (let j = 0; j <= n; j++) { const q = (along ? b.x0 : b.z0) + (j * len) / n, px = along ? q : (b.x0 + b.x1) / 2, pz = along ? (b.z0 + b.z1) / 2 : q; matte.tint(0.12, 0.13, 0.15, 1).box(px - 0.12, 0, pz - 0.12, px + 0.12, h + 0.1, pz + 0.12); }
      } else if (b.look === 'crate') {
        const along = b.x1 - b.x0 >= b.z1 - b.z0, len = along ? b.x1 - b.x0 : b.z1 - b.z0, n = Math.max(1, Math.round(len / 0.75));
        for (let j = 0; j < n; j++) {
          const a0 = (along ? b.x0 : b.z0) + (j * len) / n + 0.02, a1 = (along ? b.x0 : b.z0) + ((j + 1) * len) / n - 0.02, k = 0.85 + 0.3 * rnd(i, j + 5);
          const x0 = along ? a0 : b.x0, x1 = along ? a1 : b.x1, z0 = along ? b.z0 : a0, z1 = along ? b.z1 : a1;
          wood.tint(0.8 * k, 0.55 * k, 0.28 * k, 1).box(x0, 0, z0, x1, h, z1);
          paint.tint(1.05 * k, 0.78 * k, 0.4 * k, 1).box(x0 + 0.07, h, z0 + 0.07, x1 - 0.07, h + 0.03, z1 - 0.07);
        }
      } else if (b.look === 'bags') {
        // a wall of sandbags: two rows of fat bags, the upper set back
        const len = b.x1 - b.x0, n = Math.max(2, Math.round(len / 0.7));
        for (let row = 0; row < 2; row++) for (let j = 0; j < n - row; j++) { const x0 = b.x0 + ((j + row * 0.5) * len) / n, k = 0.85 + 0.25 * rnd(i + row, j); matte.tint(0.62 * k, 0.54 * k, 0.34 * k, 1).box(x0 + 0.03, row * 0.3, b.z0 + row * 0.06, x0 + len / n - 0.03, row * 0.3 + 0.31, b.z1 - row * 0.06); }
      } else if (b.look === 'grass') {
        // a planter of timber, and tall grass in it
        wood.tint(0.7, 0.45, 0.25, 1).box(b.x0, 0, b.z0, b.x1, 0.12, b.z1);
        for (let x = b.x0 + 0.15; x < b.x1; x += 0.3) for (let z = b.z0 + 0.15; z < b.z1; z += 0.3) { const k = 0.7 + 0.6 * rnd(x * 10, z * 10), hh = 0.5 + 0.4 * rnd(x * 7, z * 13); matte.tint(0.14 * k, 0.6 * k, 0.18 * k, 1).box(x - 0.07, 0.1, z - 0.07, x + 0.07, hh, z + 0.07); }
      }
    });
    // ---- lamps: a post, a warm head (its pool is painted on the paving)
    for (const [x, z] of LAMPS) { matte.tint(0.1, 0.11, 0.13, 1).cylinder(x, 0, z, 0.07, 0.05, 2.1, 6); glow.tint(3, 2.1, 0.8, 1).box(x - 0.16, 2.1, z - 0.16, x + 0.16, 2.3, z + 0.16); }
    // ---- the poles of the cameras, the tower of the searchlight, the posts of the beams
    for (const v of VIEWERS) {
      if (v.kind === 'cam') matte.tint(0.15, 0.16, 0.18, 1).cylinder(v.x, 0, v.z, 0.07, 0.06, 2.35, 6);
      if (v.kind === 'beam') for (const [x, z] of [[v.x0, v.z0], [v.x1, v.z1]]) { paint.tint(1.5, 1.2, 0.15, 1).cylinder(x, 0, z, 0.09, 0.09, 0.75, 6); glow.tint(3, 0.3, 0.6, 1).box(x - 0.07, 0.75, z - 0.07, x + 0.07, 0.88, z + 0.07); }
    }
    matte.tint(0.14, 0.15, 0.17, 1).cylinder(TOWER.x, 0, TOWER.z, 0.22, 0.14, 3.6, 8);
    paint.tint(1.4, 1.15, 0.15, 1).box(TOWER.x - 0.4, 3.6, TOWER.z - 0.4, TOWER.x + 0.4, 3.75, TOWER.z + 0.4);
    glow.tint(3, 2.8, 1.8, 1).box(TOWER.x - 0.26, 3.75, TOWER.z - 0.26, TOWER.x + 0.26, 4.2, TOWER.z + 0.26);
    // ---- the way down to the sand: a gangway of planks from the near end of the quay, and the arch on the beach
    const g = S.gate, gy = this.data.heightAt(g.x, g.z);
    this.gate = { x: g.x, y: gy, z: g.z, yaw: Math.PI / 2 };
    {
      const gl = { x: (g.z - S.at.z) * 1, z: S.at.x - g.x }; // (the gate in the yard's frame: the yard is turned a quarter)
      const end = gl.z - 3.2, drop = gy - this.floor;
      for (let z = HZ, i = 0; z < end; z += 0.5, i++) { const y = (drop * (z - HZ)) / (end - HZ), k = 0.85 + 0.25 * rnd(i, 3); wood.tint(0.8 * k, 0.58 * k, 0.36 * k, 1).box(gl.x - 1.1, y - 0.12, z + 0.02, gl.x + 1.1, y - 0.02, z + 0.48); }
      for (let z = HZ + 1; z < end; z += 3) for (const s of [-1, 1]) wood.tint(0.45, 0.33, 0.22, 1).cylinder(gl.x + s * 1.05, -6, z, 0.09, 0.09, 6.9 + (drop * (z - HZ)) / (end - HZ), 6);
    }
    const mesh = parts.toMeshes(mats, { name: 'sneak-yard', layers: [LAYER.STATIC_CASTER] });
    yard.add(mesh);
    // (the arch, in the frame of the world)
    const wparts = new Parts();
    gateArch(this.group, wparts.get('paint'), g.x, gy, g.z, this.gate.yaw, S.name.toUpperCase(), 'SLIP THROUGH UNSEEN · THREE CORES · THE FASTEST TIME', { tone: [0.12, 0.5, 0.75], ink: '#0e1626' });
    this.group.add(wparts.toMeshes(mats, { name: 'sneak-gate', layers: [LAYER.STATIC_CASTER] }));
    // ---- what moves: the robots, the heads of the cameras, the gates, the cores; what sees, drawn on the ground
    const robot = robotGeometry(), head = camGeometry();
    this.robots = []; this.cams = [];
    for (const v of VIEWERS) {
      if (v.kind === 'robot') { const m = new THREE.Mesh(robot, mats.paint); m.name = 'sneak-robot'; yard.add(m); this.robots.push(m); }
      if (v.kind === 'cam') { const m = new THREE.Mesh(head, mats.paint); m.name = 'sneak-cam'; m.position.set(v.x, 0, v.z); yard.add(m); this.cams.push(m); }
    }
    this.gates = gates.map((b) => {
      const mb = new MeshBuilder(), h = HIGH.gate;
      for (let x = b.x0 + 0.1; x < b.x1; x += 0.32) mb.tint(2.6, 0.25, 0.12, 1).box(x - 0.05, 0, b.z0, x + 0.05, h, b.z1);
      mb.tint(3, 1.6, 0.2, 1).box(b.x0, h - 0.14, b.z0 - 0.03, b.x1, h, b.z1 + 0.03).box(b.x0, 0.5, b.z0 - 0.03, b.x1, 0.6, b.z1 + 0.03);
      const m = new THREE.Mesh(mb.build(), glowMat()); m.name = 'sneak-gate-bars'; yard.add(m);
      return { n: b.gate, mesh: m, open: 0 };
    });
    this.cores = CORES.map((c) => {
      const mb = new MeshBuilder();
      mb.tint(0.5, 3, 2.4, 1).place(0, 0.75, 0).lathe([[0.001, 0.34], [0.24, 0], [0.001, -0.34]], 6).pop();
      mb.tint(0.2, 1.3, 1.1, 1).cylinder(0, 0.02, 0, 0.5, 0.5, 0.03, 16);
      const m = new THREE.Mesh(mb.build(), glowMat()); m.name = 'sneak-core'; m.position.set(c.x, 0, c.z); yard.add(m);
      return m;
    });
    // (the cones, the pool of the searchlight, the beams: one mesh, redrawn every frame)
    const MAXV = 3 * 900;
    this.conePos = new Float32Array(MAXV * 3); this.coneCol = new Float32Array(MAXV * 3);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(this.conePos, 3).setUsage(THREE.DynamicDrawUsage));
    cg.setAttribute('color', new THREE.BufferAttribute(this.coneCol, 3).setUsage(THREE.DynamicDrawUsage));
    cg.boundingSphere = new THREE.Sphere(V(0, 0, 0), 60);
    this.cones = new THREE.Mesh(cg, light()); this.cones.name = 'sneak-cones'; this.cones.frustumCulled = false; this.cones.renderOrder = 21; yard.add(this.cones);
    // (one's own: the ring a run is heard in, a bright ring under one's feet, the meter over one's head)
    const ring = (r0, r1, c) => { const gm = new THREE.RingGeometry(r0, r1, 48); gm.rotateX(-Math.PI / 2); const m = new THREE.Mesh(gm, new THREE.MeshBasicMaterial({ color: new THREE.Color(...c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.visible = false; m.renderOrder = 22; yard.add(m); return m; };
    this.ring = ring(0.955, 1, [0.9, 0.9, 0.75]); this.ring.name = 'sneak-noise';
    this.mark = ring(0.5, 0.62, [0.5, 1.2, 0.7]); this.mark.name = 'sneak-mark';
    const bar = (w, h, c) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...c), depthTest: false, transparent: true })); m.visible = false; m.renderOrder = 30; this.group.add(m); return m; };
    this.meterBack = bar(1.5, 0.26, [0.03, 0.03, 0.05]); this.meterFill = bar(1.4, 0.16, [1, 0.7, 0.05]);
    this.meterBack.name = 'sneak-meter'; this.meterFill.name = 'sneak-meter-fill';
    this.group.add(yard);
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    this._draw(worldClock() / 1000, null, 0);
    return this;
  }

  setBest(ms) { this.best = ms || 0; }
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.6 * 2.6; }

  /**
   * A run is asked for: the player is put at the start of the yard, and the clock runs from the first step. `io`:
   * { play, note }. Returns the session — the driver of the player (see src/extras/plug.js).
   */
  open(player, io) {
    const st = startRun(worldClock() / 1000), events = [], input = { x: 0, y: 0, jump: false };
    const Q = { after: 0, focus: null, eye: V(0, 0, 0), look: V(0, 0, 0), lean: 0, heard: 0, said: 0, w: V(0, 0, 0) };
    const session = {
      game: this, over: false, ended: false, score: 0, line: '', riding: false, anim: ANIM.idle, state: st, auto: false, instance: 0,
      // (what the others are told of this run: crouched or not, the meter, caught)
      tell: () => [st.crouch ? 1 : 0, Math.round(st.meter * 100), st.freeze > 0 ? 1 : 0],
      step: (dt, pl, control) => {
        const inp = pl.input;
        // (the rounds are the shared clock's: the run follows it, whatever the frames of this browser are)
        const due = st.over ? 0 : clamp(worldClock() / 1000 - st.now, 0, 0.25);
        if (session.auto) { for (let acc = due + st.acc; acc >= STEP - 1e-9 && !st.over; acc -= STEP) { botInput(st, input); stepRun(st, STEP, input, events); st.acc = 0; } }
        else { input.x = control ? inp.move.x : 0; input.y = control ? inp.move.y : 0; input.jump = control && !!inp.jump; stepRun(st, due, input, events); }
        for (const e of events) this._tell(e, st, io, Q);
        events.length = 0;
        const w = this.toWorld(st.x, st.z, Q.w);
        Q.lean += ((st.crouch ? 1 : 0) - Q.lean) * Math.min(1, dt * 12);
        pl.pos.set(w.x, this.floor - 0.22 * Q.lean, w.z); pl.vel?.set(0, 0, 0);
        pl.yaw = st.face + S.yaw; pl.pitch = 0.6 * Q.lean; pl.roll = 0; pl.speed = st.speed; pl.grounded = true;
        session.anim = st.freeze > 0 ? ANIM.dead : st.speed > S.walk + 0.5 ? ANIM.run : st.speed > 0.3 ? ANIM.walk : ANIM.idle;
        if (st.over) {
          Q.after += dt;
          if (!session.over) { session.over = true; session.score = st.out ? 0 : st.time; }
          if (Q.after > 3.5) session.ended = true;
        }
        const room = st.save, t = formatTime(timeOf(st));
        session.line = st.over ? (st.out ? `${S.name} · time is up` : `Out of the yard · ${formatTime(st.time)}${st.caught ? ` · caught ${st.caught}×` : ' · never seen!'}`)
          : !st.started ? `${S.name} · the clock starts at your first step`
            : `${ROOMS[room]} · cores ${coresOf(st)}/3 · ${t}${st.caught ? ` · caught ${st.caught}× (+${st.caught * S.penalty} s)` : ''}${st.crouch ? ' · crouched' : ''}`;
      },
      /** The camera: high behind one, looking along the yard — it follows softly and never turns. */
      camera: (cam, dt) => {
        const tall = cam.aspect < 1, up = tall ? 23 : 17.5, back = tall ? 10.5 : 9.5, ahead = tall ? 5 : 2.2;
        // (the middle of the picture: a little ahead of one, and never far off the middle of the yard — its whole width is in view on a wide screen)
        const fx = tall ? clamp(st.x, -10, 10) : clamp(st.x * 0.45, -4, 4), fz = clamp(st.z - ahead, -S.half.z + 2, S.half.z - 4);
        if (!Q.focus) Q.focus = V(fx, 0, fz); else { const k = 1 - Math.exp(-Math.min(dt, 0.1) * 5); Q.focus.x += (fx - Q.focus.x) * k; Q.focus.z += (fz - Q.focus.z) * k; }
        this.toWorld(Q.focus.x, Q.focus.z, Q.look); this.toWorld(Q.focus.x, Q.focus.z + back, Q.eye); Q.eye.y += up;
        cam.position.copy(Q.eye); cam.up.set(0, 1, 0); cam.lookAt(Q.look);
        return tall ? 64 : 46;
      },
      /** The run is over (or left): the player is put back on the sand, before the arch. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x, this.gate.z, this.gate.yaw); session.close(); },
      close: () => { if (this.session === session) { this.session = null; this.ring.visible = false; this.mark.visible = false; this.meterBack.visible = false; this.meterFill.visible = false; } },
    };
    this.session = session;
    session.step(0, player, false);
    return session;
  }

  _tell(e, st, io, Q) {
    if (e.type === 'crouch') io.play('tick', { volume: 0.25 });
    else if (e.type === 'heard') { io.play('tick', { volume: 0.7 }); if (Q.heard++ < 2) io.note('A robot heard you run! Crouch to move without a sound.', 2600); }
    else if (e.type === 'seen') io.play('tick', { volume: 0.5 });
    else if (e.type === 'caught') { io.play('fail'); io.note(`Caught! Back to the last save · +${S.penalty} s`, 2400); }
    else if (e.type === 'core') { io.play('checkpoint'); io.note(e.n === 3 ? 'The last core: the door out is open!' : `Core ${e.n} of 3: a gate opens.`, 2600); }
    else if (e.type === 'save') { io.play('lap', { volume: 0.6 }); io.note(`Saved · ${ROOMS[e.n]}`, 2000); }
    else if (e.type === 'finish') { io.play('victory'); io.note(`Out of the yard in ${formatTime(e.time)}${e.caught ? ` · caught ${e.caught}×` : ' · never seen!'}`, 4200); }
    else if (e.type === 'out') io.note('Time is up: the run is called off.', 3500);
  }

  /** Puts what watches where the clock has it and draws what it sees; `st`: the run that is on here (or null). */
  _draw(now, st, dt, cam = null) {
    const crouched = st ? st.crouch : false, cores = st ? st.cores : 0, pos = this.conePos, col = this.coneCol, Y = 0.05;
    let n = 0;
    const vert = (x, z, c, k, y = Y) => { if (n >= pos.length) return; pos[n] = x; pos[n + 1] = y; pos[n + 2] = z; col[n] = c[0] * k; col[n + 1] = c[1] * k; col[n + 2] = c[2] * k; n += 3; };
    let r = 0, k = 0;
    for (const v of VIEWERS) {
      const p = poseAt(v, now, _pose), i = v.i;
      // its colour: calm; wary when it has heard something or begins to see one; red when one is caught
      const sees = st && st.sees[i] && st.freeze <= 0, got = st && st.freeze > 0 && st.by === i, heard = st && i < ROBOTS && st.alert[i] !== 0;
      const tone = got ? RED : sees ? mix(WARY, RED, clamp(st.meter * 1.2 - 0.2, 0, 1)) : heard ? WARY : v.kind === 'light' ? LIGHT : CALM, gain = got || sees ? 1.25 : 1;
      if (v.kind === 'robot') {
        const yaw = st ? st.look[i] : p.yaw, m = this.robots[r++];
        m.position.set(p.x, p.moving ? 0.03 * Math.abs(Math.sin(now * 9 + i)) : 0, p.z); m.rotation.y = yaw;
        this._fan(vert, p.x, p.z, yaw, v, crouched, cores, tone, gain);
      } else if (v.kind === 'cam') {
        this.cams[k++].rotation.y = p.yaw;
        this._fan(vert, p.x, p.z, p.yaw, v, crouched, cores, tone, gain);
      } else if (v.kind === 'light') {
        // the pool of the searchlight, as its tower sees it: what stands in the way casts a shadow in it
        const D = Math.hypot(p.x - TOWER.x, p.z - TOWER.z), base = Math.atan2(p.x - TOWER.x, p.z - TOWER.z), span = Math.asin(Math.min(0.999, v.r / D)), N = 22;
        let was = null;
        for (let j = 0; j <= N; j++) {
          const a = base - span + (2 * span * j) / N, b = D * Math.cos(a - base), disc = b * b - (D * D - v.r * v.r), h = disc > 0 ? Math.sqrt(disc) : 0;
          const d0 = b - h, far = Math.min(b + h, reach(TOWER.x, TOWER.z, a, b + h, crouched, cores)), near = Math.min(d0, far), sx = Math.sin(a), cz = Math.cos(a);
          const cur = [TOWER.x + sx * near, TOWER.z + cz * near, TOWER.x + sx * far, TOWER.z + cz * far];
          if (was) { vert(was[0], was[1], tone, gain); vert(was[2], was[3], tone, gain); vert(cur[2], cur[3], tone, gain); vert(was[0], was[1], tone, gain); vert(cur[2], cur[3], tone, gain); vert(cur[0], cur[1], tone, gain); }
          was = cur;
        }
      } else {
        // a beam: a bar of light between its posts while it is on; it flickers just before
        const lit = p.on ? 1 : p.soon < 0.5 ? (Math.sin(now * 40) > 0 ? 0.3 : 0) : 0;
        if (lit > 0) {
          const dx = v.x1 - v.x0, dz = v.z1 - v.z0, l = Math.hypot(dx, dz), ox = (-dz / l) * 0.09, oz = (dx / l) * 0.09, c = [1.3, 0.1, 0.45];
          for (const y of [0.06, 0.8]) { vert(v.x0 - ox, v.z0 - oz, c, lit, y); vert(v.x1 - ox, v.z1 - oz, c, lit, y); vert(v.x1 + ox, v.z1 + oz, c, lit, y); vert(v.x0 - ox, v.z0 - oz, c, lit, y); vert(v.x1 + ox, v.z1 + oz, c, lit, y); vert(v.x0 + ox, v.z0 + oz, c, lit, y); }
          // (its curtain between the two)
          vert(v.x0, v.z0, c, lit * 0.45, 0.06); vert(v.x1, v.z1, c, lit * 0.45, 0.06); vert(v.x1, v.z1, c, lit * 0.45, 0.8); vert(v.x0, v.z0, c, lit * 0.45, 0.06); vert(v.x1, v.z1, c, lit * 0.45, 0.8); vert(v.x0, v.z0, c, lit * 0.45, 0.8);
        }
      }
    }
    const geo = this.cones.geometry;
    geo.setDrawRange(0, n / 3); geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    // the gates sink as they open; the cores turn, and are gone once held
    for (const gt of this.gates) { const open = cores & (1 << (gt.n - 1)) ? 1 : 0; gt.open += (open - gt.open) * Math.min(1, (dt || 1) * 4); gt.mesh.position.y = -1.5 * gt.open; gt.mesh.visible = gt.open < 0.98; }
    this.cores.forEach((m, j) => { m.visible = !(cores & (1 << j)); m.rotation.y = now * 1.7 + j; m.position.y = 0.08 * Math.sin(now * 2.4 + j); });
    // one's own marks
    const on = !!st && !st.over;
    this.mark.visible = on; this.ring.visible = on && st.noise > 0;
    if (on) {
      this.mark.position.set(st.x, 0.04, st.z); this.mark.scale.setScalar(1 + 0.08 * Math.sin(now * 5));
      if (this.ring.visible) { this.ring.position.set(st.x, 0.06, st.z); this.ring.scale.setScalar(S.noise * (0.9 + 0.1 * ((now * 2.5) % 1))); }
    }
    const show = on && (st.meter > 0.01 || st.freeze > 0) && !!cam;
    this.meterBack.visible = show; this.meterFill.visible = show;
    if (show) {
      const w = this.toWorld(st.x, st.z, _w), f = st.freeze > 0 ? 1 : st.meter;
      this.meterBack.position.set(w.x, this.floor + 2.75, w.z); this.meterBack.quaternion.copy(cam.quaternion);
      this.meterFill.quaternion.copy(cam.quaternion); this.meterFill.scale.set(Math.max(0.02, f), 1, 1);
      _w.set(-0.7 * (1 - f), 0, 0).applyQuaternion(cam.quaternion); this.meterFill.position.copy(this.meterBack.position).add(_w);
      this.meterFill.material.color.setRGB(1.2, 0.75 * (1 - f) + 0.05, 0.04);
    }
  }

  /** A cone of sight drawn on the ground: a fan from (x, z) towards `yaw`, each ray as long as what hides lets it. */
  _fan(vert, x, z, yaw, v, crouched, cores, tone, gain) {
    const N = v.kind === 'cam' ? 12 : 18;
    let wx = 0, wz = 0, wk = 0;
    for (let j = 0; j <= N; j++) {
      const a = yaw - v.half + (2 * v.half * j) / N, d = reach(x, z, a, v.range, crouched, cores), px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d, kk = gain * (0.95 - 0.6 * (d / v.range));
      if (j) { vert(x, z, tone, gain * 1.1); vert(wx, wz, tone, wk); vert(px, pz, tone, kk); }
      wx = px; wz = pz; wk = kk;
    }
  }

  /** Every frame: the rounds as the shared clock has them — for whoever plays here, and for who only looks at the yard from near enough. */
  update(dt = 0, time = 0, cam = null) {
    const st = this.session ? this.session.state : null;
    if (!st && cam) { const far = (cam.position.x - S.at.x) ** 2 + (cam.position.z - S.at.z) ** 2 > 150 * 150; this.cones.visible = !far; if (far) return; }
    this.cones.visible = true;
    this._draw(st ? st.now : worldClock() / 1000, st, clamp(dt || 0, 0, 0.05), cam);
  }
}

const _pose = {}, _w = new THREE.Vector3();
void GATES; void DOOR; void TAU;
