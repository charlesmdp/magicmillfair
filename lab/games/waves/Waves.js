// Wave Goodbye: what is seen of it and how it is played. Its rules are in rules.js; here it is built — the bank
// of sand off the beach and the neck that joins it, the poles that say how tall a wave stands, the arch on the
// sand where one jumps in, the waves, the foam they leave, the spray — and a run is played: a session that
// drives the player (see PlayerController.driver). The sea is drawn from the clock of the world: everybody
// sees the same waves.
import * as THREE from 'three';
import { Parts, MeshBuilder } from '../../../src/world/props/MeshBuilder.js';
import { LAYER } from '../../../src/render/Shadows.js';
import { ANIM } from '../../../src/player/Character.js';
import { surfaceMaterial } from '../../../src/render/SurfaceMaterial.js';
import { formatTime } from '../../../src/world/zones/games/course.js';
import { V, clamp, lerp, worldClock, gateArch } from '../kit.js';
import { WAVES, heightAt, crestAt, seaAt, mood, moodLine, startRun, stepRun, bankAt, botInput } from './rules.js';

const TOP = 0.3; // m over the sea: the top of the bank, where one stands
const POOL = 14, ACROSS = 31; // waves drawn at once; points along a crest
// a wave cut across, from its back to its front: [metres towards the sea (times its size), share of its height;
// what a crest that curls adds to each]
const PROFILE = [[2.6, 0, 0, 0], [1.5, 0.3, 0, 0], [0.6, 0.78, 0, 0], [0, 1, -0.1, 0], [-0.38, 0.93, -0.3, -0.08], [-0.3, 0.62, -0.05, -0.1], [-0.55, 0.26, 0, 0], [-1.05, 0, 0, 0]];
const SEA = [0.14, 0.52, 0.6], GREEN = [0.2, 0.7, 0.68], LIGHT = [0.5, 0.92, 0.86], DEEP = [0.07, 0.34, 0.4], FOAM = [1.05, 1.06, 1.05];
const FS = 14, FU = 23, SPRAY = 96; // the foam on the sand: points out and across; drops of spray at once
const BODY = 0.55; // m: the middle of the runner, which a tumble turns about
const mix = (a, b, t, out) => { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; return out; };
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
/** How far outside the bank a place is (m; negative inside): a rectangle with round corners, a step wider than where one runs. */
const outside = (s, u) => { const W = WAVES, r = 1.2, qs = Math.max(Math.abs(s - (W.back + W.front) / 2) - ((W.front - W.back) / 2 + 0.25 - r), 0), qu = Math.max(Math.abs(u) - (W.half + 0.25 - r), 0); return Math.hypot(qs, qu) - r; };
/** What the water runs on at a place: the top of the bank, the sea round it (m over the sea). */
const under = (s, u) => { const d = outside(s, u); return d <= 0 ? TOP : d >= 1 ? 0 : TOP * (1 - smooth(d)); };
/** The neck of sand that joins the bank to the beach: how high it stands `s` metres out. */
const neck = (s) => lerp(0.1, TOP - 0.04, clamp((s + 1) / (WAVES.back + 1), 0, 1));
/** The sand: how high it stands at a place (the bank, its slopes down to the bed of the sea, the neck). */
function sandAt(s, u) {
  const d = outside(s, u), bank = d <= 0 ? TOP : d <= 1 ? TOP - (TOP + 0.08) * smooth(d) : -0.08 - 1.5 * smooth((d - 1) / 4.5);
  if (s > WAVES.back + 1) return bank;
  const a = Math.abs(u), n = neck(s), ridge = a <= 0.9 ? n : n - (n + 0.45) * smooth((a - 0.9) / 1.6);
  return Math.max(bank, ridge);
}
const _c = [0, 0, 0], _mood = {};

export class Waves {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'waves';
    this.session = null;
    this.best = 0;
    this.fx = Math.sin(WAVES.yaw); this.fz = Math.cos(WAVES.yaw);
    this.list = []; this.broke = new Set(); this.shake = 0; this.drawn = 0;
    /** The clock everybody shares (s): the sea goes by it. */
    this.clock = () => worldClock() / 1000;
  }

  /** A place of the bank in the world, `y` metres over the sea. */
  at(s, u, y = TOP, out = V(0, 0, 0)) { const p = bankAt(s, u, this._p || (this._p = {})); return out.set(p.x, y, p.z); }

  build() {
    const world = this.world, mats = world.materials, W = WAVES, parts = new Parts(), wood = parts.get('woodWet'), paint = parts.get('paint'), cloth = parts.get('doubleSided');
    // ---- the sand: the bank, dry on top, going down into the sea all round, and the neck that joins it to the
    // beach (the lines of the grid lie close together where the sand goes under)
    const off = [0, 0.35, 0.7, 1, 1.5, 2.2, 3.2, 4.6, 6.5], eb = W.back - 0.25, ef = W.front + 0.25, eu = W.half + 0.25;
    const ss = [-2, -1, 0, 1.1, 2.2, 3.3, ...off.slice(0, 5).map((d) => eb - d), eb + 0.4, eb + 1.05, 8.5, 10.5, 12.5, ef - 1.05, ef - 0.4, ...off.map((d) => ef + d)].sort((p, q) => p - q);
    const right = [0, 0.9, 1.7, 2.5, 3.6, 5.5, eu - 1.05, eu - 0.4, ...off.map((d) => eu + d)], us = [...right.slice(1).map((u) => -u).reverse(), ...right];
    const sand = new MeshBuilder(), grain = (p) => 0.93 + 0.1 * Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453 % 1); // (no two metres of sand quite alike)
    const tone = (p) => (p.y > 0.2 ? [0.78, 0.67, 0.46] : p.y > 0.02 ? [0.62, 0.52, 0.36] : p.y > -0.3 ? [0.5, 0.44, 0.31] : [0.4, 0.4, 0.3]).map((c) => c * grain(p));
    const rows = ss.map((s) => us.map((u) => this.at(s, u, sandAt(s, u)))), n = V(0, 0, 0), a = V(0, 0, 0), b = V(0, 0, 0);
    const ids = rows.map((row, i) => row.map((p, j) => {
      a.subVectors(rows[Math.min(rows.length - 1, i + 1)][j], rows[Math.max(0, i - 1)][j]); b.subVectors(row[Math.min(row.length - 1, j + 1)], row[Math.max(0, j - 1)]);
      n.crossVectors(a, b).normalize(); if (n.y < 0) n.negate();
      return sand.vert(p, n, p.x, p.z, [...tone(p), 1]);
    }));
    for (let i = 0; i + 1 < rows.length; i++) for (let j = 0; j + 1 < us.length; j++) {
      const p = ids[i][j], q = ids[i + 1][j], r = ids[i + 1][j + 1], t = ids[i][j + 1];
      a.subVectors(rows[i + 1][j], rows[i][j]); b.subVectors(rows[i + 1][j + 1], rows[i][j]);
      if (a.cross(b).y > 0) sand.idx.push(p, q, r, p, r, t); else sand.idx.push(p, r, q, p, t, r);
    }
    this.sandMaterial = surfaceMaterial({ name: 'waves-sand', rough: 0.96, spec: 0.05 });
    const bank = new THREE.Mesh(sand.build(), this.sandMaterial);
    bank.name = 'waves-bank'; bank.matrixAutoUpdate = false;
    this.group.add(bank);
    // ---- the wet sand round the bank: under the sea as a rule — it shows when the sea draws back before a great one
    const wet = new MeshBuilder(), up = V(0, 1, 0), ring = (k, share) => { const t = (k / 40) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t), wob = 1 + 0.07 * Math.sin(3 * t + 1) + 0.05 * Math.sin(7 * t); return this.at(11.5 + c * (c > 0 ? 15.5 : 8.5) * wob * share, sn * (W.half + 7.5) * wob * share, 0).clone(); };
    const mid = wet.vert(this.at(11.5, 0, 0).clone(), up, 0, 0, [0.56, 0.48, 0.34, 1]), inner = [], outer = [];
    for (let k = 0; k < 40; k++) { const p = ring(k, 0.72), q = ring(k, 1); inner.push(wet.vert(p, up, p.x, p.z, [0.52, 0.45, 0.32, 1])); outer.push(wet.vert(q, up, q.x, q.z, [0.4, 0.38, 0.29, 1])); }
    for (let k = 0; k < 40; k++) { const l = (k + 1) % 40; wet.idx.push(mid, inner[l], inner[k], inner[k], inner[l], outer[l], inner[k], outer[l], outer[k]); }
    this.apron = new THREE.Mesh(wet.build(), this.sandMaterial);
    this.apron.name = 'waves-apron'; this.apron.matrixAutoUpdate = false; this.apron.position.y = -0.35; this.apron.updateMatrix();
    this.group.add(this.apron);
    // ---- two tall poles at the front corners, a band to the metre: how tall a wave stands is read on them;
    // two stakes with a pennant at the back
    for (const side of [-1, 1]) {
      const p = this.at(W.front + 1.1, side * (W.half + 1.1), 0);
      wood.tint(0.95, 0.9, 0.84, 1).cylinder(p.x, -1.6, p.z, 0.1, 0.1, 1.6, 8);
      for (let m = 0; m < 5; m++) paint.tint(...(m % 2 ? [1.3, 1.17, 0.9] : [0.95, 0.1, 0.12]), 1).cylinder(p.x, m, p.z, 0.09, 0.09, 1, 8);
      paint.tint(1.5, 1.05, 0.2, 1).place(p.x, 5, p.z).lathe([[0.001, 0.3], [0.12, 0.25], [0.16, 0.13], [0.12, 0.02], [0.001, 0]], 8).pop();
      const q = this.at(W.back - 0.9, side * (W.half + 0.9), 0), tip = this.at(W.back - 1.8, side * (W.half + 0.9), 2.25);
      wood.tint(0.95, 0.9, 0.84, 1).cylinder(q.x, -1.2, q.z, 0.06, 0.045, 3.7, 6);
      cloth.tint(...(side < 0 ? [1.5, 0.25, 0.2] : [0.2, 0.75, 1.3]), 1).tri(V(q.x, 2.5, q.z), V(q.x, 2.05, q.z), tip.clone()); // (the pennant flies towards the beach: the wind comes off the sea)
    }
    // ---- the arch on the sand, where one jumps in
    const g = this.at(-7, 0, 0); g.y = Math.max(0.1, this.data.heightAt(g.x, g.z));
    this.gate = { x: g.x, y: g.y, z: g.z, yaw: W.yaw };
    gateArch(this.group, paint, g.x, g.y, g.z, W.yaw, W.name.toUpperCase(), 'HOLD THE BANK · HOP, OR RUN ROUND · A GREAT ONE: FIND ITS GAP', { tone: [0.12, 0.5, 0.85], ink: '#0d2a3a', width: 3.6 });
    this.group.add(parts.toMeshes(mats, { name: 'waves-set', layers: [LAYER.STATIC_CASTER] }));
    // ---- one can walk out to the bank at any time, over the neck (the waves only matter to who has jumped in under the arch)
    const fx = this.fx, fz = this.fz;
    this.deck = {
      clearance: 1.2,
      heightAt: (x, z) => { const dx = x - W.from.x, dz = z - W.from.z, s = dx * fx + dz * fz, u = -dx * fz + dz * fx; return outside(s, u) <= 0.05 ? TOP : Math.abs(u) <= 1 && s > -1.5 && s <= W.back ? neck(s) : null; },
    };
    world.collision.addPlatform(this.deck);
    // ---- one's own best: a golden float off the bank, the further out the longer one held; it rides the waves
    const float = new Parts();
    float.get('paint').tint(1.6, 1.15, 0.2, 1).lathe([[0.001, -0.25], [0.3, -0.12], [0.36, 0.1], [0.2, 0.3], [0.05, 0.36], [0.05, 1.5]], 10);
    float.get('doubleSided').tint(1.6, 1.15, 0.2, 1).tri(V(0, 1.5, 0), V(0, 1.14, 0), V(0, 1.32, 0.6));
    this.mark = float.toMeshes(mats, { name: 'waves-best', layers: [] });
    this.mark.visible = false; this.markAt = { s: 0, u: 0 };
    this.group.add(this.mark);
    // ---- the waves: a few of them, shaped every frame where the clock says
    this.waveMaterial = surfaceMaterial({ name: 'waves-wave', rough: 0.2, spec: 0.6, side: THREE.DoubleSide, emissive: [0.05, 0.2, 0.2] }); // (water lets the light through: its shaded side is never grey)
    const sheet = (rowsN, colsN, material, name) => {
      const geo = new THREE.BufferGeometry(), index = [];
      for (const [key, size] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 4]]) geo.setAttribute(key, new THREE.BufferAttribute(new Float32Array(rowsN * colsN * size).fill(key === 'color' ? 1 : 0), size));
      for (let i = 0; i + 1 < rowsN; i++) for (let j = 0; j + 1 < colsN; j++) { const p = i * colsN + j; index.push(p, p + colsN, p + 1, p + 1, p + colsN, p + colsN + 1); }
      geo.setIndex(index);
      const m = new THREE.Mesh(geo, material);
      m.name = name; m.frustumCulled = false; m.visible = false; m.matrixAutoUpdate = false;
      this.group.add(m);
      return m;
    };
    this.pool = [];
    for (let k = 0; k < POOL; k++) this.pool.push(sheet(ACROSS, PROFILE.length, this.waveMaterial, `waves-wave${k}`));
    // ---- the foam a wave leaves on the sand: a sheet over the bank, white where a crest went by a moment ago
    this.foam = sheet(FS, FU, surfaceMaterial({ name: 'waves-foam', fade: true, rough: 0.9, spec: 0.05, emissive: [0.3, 0.32, 0.32], polygonOffset: 1 }), 'waves-foam');
    const fp = this.foam.geometry.attributes.position.array, fn = this.foam.geometry.attributes.normal.array, fc = this.foam.geometry.attributes.color.array;
    this.foamAt = [];
    for (let i = 0; i < FS; i++) for (let j = 0; j < FU; j++) {
      const s = lerp(W.back - 1.4, W.front + 1.4, i / (FS - 1)), u = lerp(-W.half - 1.4, W.half + 1.4, j / (FU - 1)), k = i * FU + j, p = this.at(s, u, under(s, u) + 0.035);
      fp[k * 3] = p.x; fp[k * 3 + 1] = p.y; fp[k * 3 + 2] = p.z; fn[k * 3 + 1] = 1; fc[k * 4 + 3] = 0;
      this.foamAt.push(s, u);
    }
    this.foam.visible = true;
    // ---- the spray: drops thrown up where a wave breaks on the runner, or on the front edge of the bank
    const drops = new THREE.BufferGeometry();
    this.drops = { pos: new Float32Array(SPRAY * 3).fill(-99), vel: new Float32Array(SPRAY * 3), life: new Float32Array(SPRAY), next: 0, live: 0 };
    drops.setAttribute('position', new THREE.BufferAttribute(this.drops.pos, 3));
    this.spray = new THREE.Points(drops, new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false }));
    this.spray.name = 'waves-spray'; this.spray.frustumCulled = false; this.spray.visible = false; this.spray.matrixAutoUpdate = false;
    this.group.add(this.spray);
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    return this;
  }

  /** One's own best (ms): the golden float is put out, the further the longer one held. */
  setBest(ms) {
    this.best = ms || 0;
    this.mark.visible = this.best > 0;
    this.markAt.s = WAVES.front + 3 + Math.min(22, this.best / 5000); this.markAt.u = -(WAVES.half + 1.8);
    this.mark.rotation.y = WAVES.yaw;
  }

  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.6 * 2.6; }

  /** What the arch says of the sea now. */
  moodLine() { return moodLine(this.clock()); }

  /** Shapes one wave of the pool: `w` (see rules.js) as it is at `clock`. Returns whether there is anything of it to see. */
  _shape(mesh, w, clock) {
    const W = WAVES, P = PROFILE.length, geo = mesh.geometry.attributes, pos = geo.position.array, nor = geo.normal.array, col = geo.color.array, fx = this.fx, fz = this.fz, c = _c;
    const span = W.half + W.reach;
    let tallest = 0;
    for (let i = 0; i < ACROSS; i++) {
      const u = lerp(-span, span, i / (ACROSS - 1)), out = Math.max(0, Math.abs(u) - W.half) / W.reach;
      const sc = crestAt(w, clock, u) + Math.sin(u * 0.5 + w.id * 1.7) * 0.12; // (no crest is quite straight)
      const H = heightAt(w, sc, u) * (1 - out * out), size = 0.55 + 0.42 * H, curl = clamp((H - 0.9) / 1.3, 0, 1);
      if (H > tallest) tallest = H;
      // (a white crest says: this one matters — lower than the knees it is only a swell; a tall one is streaked
      // with white down its face, the more as it breaks on the bank)
      const white = clamp((H - W.knee * 0.8) / (W.knee * 0.5), 0, 1), breaking = clamp((W.front + 4 - sc) / 5, 0, 1), face = white * Math.min(0.85, 0.12 + 0.3 * curl + 0.5 * breaking * curl);
      for (let j = 0; j < P; j++) {
        const q = PROFILE[j], s = sc + (q[0] + q[2] * curl) * size, k = (i * P + j) * 3, k4 = (i * P + j) * 4;
        pos[k] = W.from.x + fx * s - fz * u; pos[k + 2] = W.from.z + fz * s + fx * u;
        pos[k + 1] = under(s, u) - 0.12 + (q[1] + q[3] * curl) * (H + 0.12);
        if (j === 0) mix(SEA, GREEN, 0.1, c); else if (j === 1) mix(SEA, GREEN, 0.55, c); else if (j === 2) mix(GREEN, LIGHT, 0.45, c);
        else if (j === 3 || j === 4) mix(LIGHT, FOAM, white, c); else if (j === 5) mix(mix(GREEN, DEEP, 0.6 * curl, c), FOAM, face * 0.5, c);
        else if (j === 6) mix(mix(GREEN, DEEP, 0.3 * curl, c), FOAM, face, c); else mix(GREEN, FOAM, 0.2 + 0.6 * white * breaking, c);
        col[k4] = c[0]; col[k4 + 1] = c[1]; col[k4 + 2] = c[2]; col[k4 + 3] = j === 5 ? 1 - 0.3 * curl : 1;
      }
    }
    if (tallest < 0.03) { mesh.visible = false; return false; }
    // (the normals: from the neighbours along the crest and across it)
    for (let i = 0; i < ACROSS; i++) for (let j = 0; j < P; j++) {
      const i0 = (Math.max(0, i - 1) * P + j) * 3, i1 = (Math.min(ACROSS - 1, i + 1) * P + j) * 3, j0 = (i * P + Math.max(0, j - 1)) * 3, j1 = (i * P + Math.min(P - 1, j + 1)) * 3;
      const ax = pos[i1] - pos[i0], ay = pos[i1 + 1] - pos[i0 + 1], az = pos[i1 + 2] - pos[i0 + 2], bx = pos[j1] - pos[j0], by = pos[j1 + 1] - pos[j0 + 1], bz = pos[j1 + 2] - pos[j0 + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1, sign = ny < 0 ? -1 / l : 1 / l, k = (i * P + j) * 3;
      nx *= sign; ny *= sign; nz *= sign;
      nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
    }
    geo.position.needsUpdate = geo.normal.needsUpdate = geo.color.needsUpdate = true;
    mesh.visible = true;
    return true;
  }

  /** Throws `n` drops up from a place; `bx`, `bz`: the way the water goes (m/s). */
  _spray(x, y, z, n, power = 1, bx = 0, bz = 0, wide = 0.5) {
    const D = this.drops;
    for (let i = 0; i < n; i++) {
      const k = (D.next++ % SPRAY) * 3, r = Math.random;
      D.pos[k] = x + (r() - 0.5) * wide; D.pos[k + 1] = y + r() * 0.4; D.pos[k + 2] = z + (r() - 0.5) * wide;
      D.vel[k] = bx * (0.4 + r()) + (r() - 0.5) * 3; D.vel[k + 1] = (2.5 + r() * 4) * Math.min(1.6, 0.6 + power * 0.35); D.vel[k + 2] = bz * (0.4 + r()) + (r() - 0.5) * 3;
      D.life[k / 3] = 0.5 + r() * 0.5;
    }
    D.live = 1.2;
  }

  /** Every frame: the sea is where the clock says — the clock of the world, or of the run that is being played here. */
  update(dt = 0, time = 0) {
    const W = WAVES, run = this.session, clock = run ? run.state.t0 + run.state.clock : this.clock(), list = seaAt(clock, this.list, 0, 3.2);
    let used = 0, draw = 0, shake = 0;
    for (const w of list) {
      const crest = crestAt(w, clock, 0);
      if (w.kind === 'great') { const left = w.t - clock; draw = Math.max(draw, smooth((5.2 - left) / 1.4) * smooth((left - 0.2) / 0.9)); shake = Math.max(shake, 1 - Math.abs(crest - (W.front - 2)) / 9); }
      if (clock > w.dies || used >= POOL) continue;
      if (this._shape(this.pool[used], w, clock)) used++;
      // (a tall one breaks on the front edge of the bank: spray all along it, rings on the water at its corners)
      if (w.h >= 2 && crest <= W.front + 0.5 && crest > W.front - 2 && !this.broke.has(w.id)) {
        this.broke.add(w.id);
        for (let u = -W.half; u <= W.half; u += 1.6) { const H = heightAt(w, W.front, u); if (H > 1.2) { const p = this.at(W.front + 0.3, u + 0.8, TOP + H * 0.5, this._q || (this._q = V(0, 0, 0))); this._spray(p.x, p.y, p.z, 3, H, -this.fx * 3, -this.fz * 3, 1.6); } }
        for (const side of [-1, 1]) { const p = this.at(W.front + 1.5, side * (W.half + 1.5), 0, this._q); this.world.ripples?.splash(time, p.x, 0, p.z, w.h); }
        run?.io.play('splash', { volume: Math.min(0.6, w.h * 0.13) });
      }
    }
    for (let k = used; k < this.pool.length; k++) this.pool[k].visible = false;
    if (this.broke.size > 60) this.broke.clear();
    this.shake = Math.max(0, shake);
    // ---- the foam on the sand: white where a crest went by, fading
    const col = this.foam.geometry.attributes.color, fc = col.array, at = this.foamAt;
    for (let k = 0; k < FS * FU; k++) {
      const s = at[k * 2], u = at[k * 2 + 1];
      let foam = 0;
      for (const w of list) {
        const age = (s - crestAt(w, clock, u)) / w.v;
        if (age < -0.15 || age > 3.2) continue;
        const H = heightAt(w, s, u);
        if (H < 0.12) continue;
        const life = 1.2 + 0.6 * H, f = age < 0 ? 1 + age / 0.15 : 1 - age / life;
        if (f > 0) foam = Math.max(foam, Math.min(1, 0.4 + H * 0.35) * f);
      }
      fc[k * 4 + 3] = foam;
    }
    col.needsUpdate = true;
    // ---- the sea draws back before a great one: the wet sand round the bank shows
    if (Math.abs(draw - this.drawn) > 0.002) { this.drawn = draw; this.apron.position.y = lerp(-0.35, 0.09, draw); this.apron.updateMatrix(); this.apron.updateMatrixWorld(true); }
    // ---- the spray falls
    const D = this.drops;
    if (D.live > 0) {
      D.live -= dt;
      for (let i = 0; i < SPRAY; i++) {
        if (D.life[i] <= 0) continue;
        const k = i * 3;
        D.life[i] -= dt; D.vel[k + 1] -= 16 * dt;
        D.pos[k] += D.vel[k] * dt; D.pos[k + 1] += D.vel[k + 1] * dt; D.pos[k + 2] += D.vel[k + 2] * dt;
        if (D.life[i] <= 0 || D.pos[k + 1] < 0) { D.life[i] = 0; D.pos[k + 1] = -99; }
      }
      this.spray.geometry.attributes.position.needsUpdate = true;
    }
    this.spray.visible = D.live > 0;
    // ---- the float rides what goes by under it
    if (this.mark.visible) {
      let y = 0;
      for (const w of list) { const d = crestAt(w, clock, this.markAt.u) - this.markAt.s, H = heightAt(w, this.markAt.s, this.markAt.u); if (H > 0.02) y += H * Math.exp(-((d / (0.8 + 0.5 * H)) ** 2)); }
      this.at(this.markAt.s, this.markAt.u, 0.05 + y, this.mark.position);
      this.mark.rotation.x = Math.sin(clock * 1.3) * 0.08;
      this.mark.updateMatrix(); this.mark.updateMatrixWorld(true);
    }
  }

  /**
   * One jumps in: the player leaps from the arch over the lagoon onto the bank, gets ready, and holds it. `io`:
   * { play, note, splash }. Returns the session — the driver of the player: step(dt, player, control),
   * camera(camera, dt), line, over (`score`: how long one held, ms), ended, drop(player), close(), auto (true:
   * it plays by itself).
   */
  open(player, io) {
    const W = WAVES, events = [], input = { x: 0, y: 0, jump: false }, st = startRun(this.clock(), 0);
    const S = { acc: 0, yaw: W.yaw, hit: null, shook: 0, after: 0, wet: false, cam: null, look: V(0, 0, 0), jolt: 0, mood: '', said: new Set(), close: -9, from: player.pos.clone() };
    const _t = V(0, 0, 0), pos = V(0, 0, 0), TAU = Math.PI * 2;
    const session = {
      waves: this, io, feel: S, over: false, ended: false, score: 0, line: '', riding: false, anim: ANIM.idle, state: st, auto: false,
      step: (dt, pl, control) => {
        const inp = pl.input;
        if (!st.over) {
          // (the sea of the run keeps to the clock of the world: a frame that took too long is caught up, gently)
          const late = this.clock() - (st.t0 + st.clock);
          if (late > 0.004 && late < 2) st.t0 += Math.min(late, dt * 0.05);
          if (session.auto) {
            S.acc += Math.min(dt, 0.25);
            while (S.acc >= W.step && !st.over) { S.acc -= W.step; botInput(st, input); stepRun(st, W.step, input, events); }
          } else {
            input.x = control ? inp.move.x : 0; input.y = control ? inp.move.y : 0; input.jump = control && !!inp.jump;
            stepRun(st, dt, input, events);
          }
          // (a great one is said before it is there, and so is the mood of the sea when it turns)
          const now = st.t0 + st.clock, m = mood(now, _mood);
          for (const w of this.list) if (w.kind === 'great' && !S.said.has(w.id) && w.t - now < 5 && w.t - now > 1.2) { S.said.add(w.id); io.note('A great one! Find its gap.', 2600); io.play('bell', { rate: 0.5 }); }
          if (m.name !== S.mood) {
            if (S.mood === '') { /* (the mood one jumps into is on the arch) */ } else if (m.name === 'wild') { io.note('The sea goes wild!', 2400); io.play('tick'); } else if (m.name === 'great ones') io.note('Now the great ones — find the gaps!', 2400);
            else if (m.name === 'flat') { io.note('A lull. Catch your breath: it builds again in a moment.', 3200); io.play('bell'); } else io.note('The sea is building again.', 2200);
            S.mood = m.name;
          }
        }
        for (const e of events) this._tell(e, session);
        events.length = 0;
        // ---- how the runner holds itself: running, in the air, tumbled by a wave, getting up, shaking itself
        const speed = Math.hypot(st.vs, st.vu);
        let s = st.s, u = st.u, y = TOP + st.h, pitch = 0, roll = 0, yaw = W.yaw, anim = st.h > 0.05 ? ANIM.jump : speed > 1.2 ? ANIM.run : ANIM.idle;
        if (st.over) {
          // carried off the back: rolled into the lagoon, where one sits up in the water
          S.after += dt;
          const k = Math.min(1, S.after / 1.0), e = 1 - (1 - k) * (1 - k);
          s = lerp(st.s, 3.4, e); u = lerp(st.u, Math.abs(st.u) < 2.4 ? (st.u < 0 ? -2.4 : 2.4) : st.u, e); // (beside the neck)
          y = lerp(TOP, -0.34, Math.min(1, k * 1.5)) + Math.abs(Math.sin(k * TAU)) * 0.25 * (1 - k);
          pitch = -2 * TAU * e; anim = k < 1 ? ANIM.jump : ANIM.sit;
          if (k >= 1 && !S.wet) { S.wet = true; const p = this.at(s, u, 0); io.splash?.(p.x, 0, p.z, 5); io.play('splash', { volume: 0.7 }); this._spray(p.x, 0.1, p.z, 16, 1.5); }
          if (!session.over) { session.over = true; session.score = st.time; }
          if (S.after > 2.4) session.ended = true;
        } else if (st.down > 0 && S.hit) {
          // knocked down: head over heels in the foam the way the wave goes, then on one's seat for a moment
          const h = S.hit; h.t += dt;
          const k = clamp(h.t / Math.max(0.3, h.T - 0.4), 0, 1), e = 1 - (1 - k) * (1 - k);
          pitch = -TAU * h.turns * e; roll = Math.sin(k * Math.PI) * 0.5 * h.side;
          y += Math.abs(Math.sin(e * Math.PI * h.turns)) * 0.28 * Math.min(1.6, h.H);
          anim = k < 1 ? ANIM.jump : ANIM.sit;
        } else {
          if (speed > 1) { const wx = this.fx * st.vs - this.fz * st.vu, wz = this.fz * st.vs + this.fx * st.vu; yaw = Math.atan2(wx, wz); }
          if (S.shook > 0) { S.shook -= dt; const f = S.shook / 0.5; yaw += Math.sin(S.shook * 46) * 0.4 * f; roll = Math.sin(S.shook * 38) * 0.16 * f; } // (it shakes the water off)
        }
        let turn = yaw - S.yaw; turn -= Math.round(turn / TAU) * TAU;
        S.yaw = st.down > 0 || st.over ? W.yaw : S.yaw + turn * Math.min(1, dt * 16);
        this.at(s, u, y, pos);
        if (pitch) { const c = BODY * Math.sin(pitch); pos.y += BODY * (1 - Math.cos(pitch)); pos.x -= Math.sin(S.yaw) * c; pos.z -= Math.cos(S.yaw) * c; } // (the tumble turns about its middle, not its feet)
        if (!st.over && st.clock < 0.7) {
          // (the leap from the arch, over the lagoon)
          const k = st.clock / 0.7, e = k * k * (3 - 2 * k);
          pos.lerpVectors(S.from, pos, e); pos.y += Math.sin(k * Math.PI) * 2.2; anim = ANIM.jump;
        }
        pl.pos.copy(pos); pl.yaw = S.yaw; pl.pitch = pitch; pl.roll = roll;
        pl.speed = st.over || st.down > 0 ? 0 : speed; pl.grounded = st.h <= 0 && st.down <= 0;
        session.anim = anim;
        const now = st.t0 + st.clock, room = Math.max(0, st.s - W.back);
        session.line = st.over ? `${W.name} · held ${formatTime(st.time)}`
          : st.clock < W.grace ? `${W.name} · get ready — ${moodLine(now)}`
            : `${formatTime(Math.round(st.clock * 1000))} · ${room.toFixed(1)} m of sand left · ${moodLine(now)}`;
      },
      /** The camera: fixed behind the bank and above it, looking out at what comes; it leans a little the way the runner goes. */
      camera: (cam, dt) => {
        this.at(-2.6, st.u * 0.32, 7.3, _t);
        if (!S.cam) S.cam = _t.clone(); else S.cam.lerp(_t, Math.min(1, dt * 4));
        this.at(13.2, st.u * 0.55, 0.7, _t);
        S.look.lerp(_t, S.look.lengthSq() ? Math.min(1, dt * 5) : 1);
        cam.position.copy(S.cam);
        // (a great one makes the ground tremble as it comes; a hit jolts)
        const amp = 0.05 * this.shake + 0.14 * S.jolt;
        S.jolt = Math.max(0, S.jolt - dt * 2.5);
        if (amp > 0.001) { cam.position.x += Math.sin(st.clock * 53) * amp; cam.position.y += Math.sin(st.clock * 67 + 1) * amp * 0.8; }
        cam.up.set(0, 1, 0); cam.lookAt(S.look);
        return 62;
      },
      /** The run is over (or left): the player is put back on the sand under the arch, facing the sea. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x, this.gate.z, W.yaw); session.close(); },
      close: () => { if (this.session === session) this.session = null; player.pitch = 0; player.roll = 0; },
    };
    this.session = session;
    session.step(0, player, false);
    return session;
  }

  /** What happened in a run is heard, seen and said. */
  _tell(e, session) {
    const io = session.io, st = session.state, S = session.feel;
    if (e.type === 'jump') io.play('jump', { volume: 0.5 });
    else if (e.type === 'again') io.play('jump', { volume: 0.6, rate: 1.25 });
    else if (e.type === 'land') io.play('land', { volume: 0.3 });
    else if (e.type === 'clear') {
      if (e.kind === 'great') { io.play('checkpoint'); io.note('Through the gap of a great one!', 1800); }
      else if (e.close && st.clock - S.close > 2.5) { S.close = st.clock; io.play('pick', { volume: 0.6 }); io.note('Close!', 800); }
      else if (e.kind === 'wall' || e.kind === 'breaker') io.play('tick', { volume: 0.4 });
    } else if (e.type === 'hit') {
      // (the wave breaks on the runner: spray, a thud, and head over heels — twice over for a tall one)
      const p = this.at(st.s, st.u, TOP + st.h + 0.5);
      io.play('splash', { volume: Math.min(1, 0.45 + e.H * 0.2) }); io.play(e.H >= 1.7 ? 'whack' : 'hit', { volume: 0.8 });
      this._spray(p.x, p.y, p.z, 12 + Math.round(e.H * 8), e.H, -this.fx * 4, -this.fz * 4);
      S.jolt = Math.min(1, 0.3 + e.H * 0.25);
      if (S.hit && st.down > 0 && S.hit.t < S.hit.T) { S.hit.T = S.hit.t + st.down; S.hit.turns += 1; S.hit.H = Math.max(S.hit.H, e.H); }
      else S.hit = { t: 0, T: st.down, turns: e.H >= 1.7 ? 2 : 1, H: e.H, side: Math.random() < 0.5 ? -1 : 1 };
      if (e.kind === 'great') io.note('Rolled by a great one!', 1600);
    } else if (e.type === 'up') { S.hit = null; S.shook = 0.5; }
    else if (e.type === 'out') {
      io.play('fail');
      io.note(`Washed into the lagoon by ${e.kind === 'great' ? 'a great one' : e.kind === 'roller' ? 'a roller' : `a ${e.kind}`} — held ${formatTime(e.time)}.`, 4200);
    }
  }
}
