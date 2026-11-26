// Bee Fly: what is seen of it and how it is played. Its rules are in rules.js; here it is built — four
// round combs of wax in their hoops of dark timber, hung over the sea from a great crook under a skep of straw,
// the bees, the arch on the sand where one asks to play — and a run is played: a session that drives the player
// (see PlayerController.driver). The wax one has broken is one's own: a comb is whole again for the next run.
import * as THREE from 'three';
import { Parts, MeshBuilder } from '../../../props/MeshBuilder.js';
import { surfaceMaterial } from '../../../../render/SurfaceMaterial.js';
import { LAYER } from '../../../../render/Shadows.js';
import { ANIM } from '../../../../player/Character.js';
import { formatTime } from '../course.js';
import { V, clamp, gateArch, worldClock } from '../gates.js';
import { HIVE, CELLS, KIND, holds, startRun, stepRun, botInput, droneAt, standing } from './rules.js';

const N = CELLS.length, COMBS = HIVE.levels.length, R = HIVE.cell, TAU = Math.PI * 2;
const FX = Math.sin(HIVE.view), FZ = Math.cos(HIVE.view);
const NAMES = ['top comb', 'upper comb', 'lower comb', 'last comb'];
// the wax: fresh, capped, with royal jelly in it — and as it gives way
const TINT = [[1, 1, 1], [1.0, 0.86, 0.6], [1.04, 0.8, 1.1]], HOT = [1.0, 0.4, 0.16], BURNT = [0.42, 0.17, 0.07];
const CAP = [[0, 0, 0], [0.56, 0.27, 0.05], [1.0, 0.42, 0.82]];
const TIMBER = [0.58, 0.46, 0.38], ROPE = [1.15, 1.0, 0.72], STRAW = [1.22, 0.88, 0.36], AMBER = [1.5, 0.98, 0.14];
const BEES = COMBS + 4; // one that works on each comb, a few that only fly round the skep

/** A cell of wax: a shallow cup with raised walls, standing a little proud of its own depth. The floor of the cup is at 0. */
function cellGeometry() {
  const b = new MeshBuilder(), ri = R * 0.8, top = 0.07, floor = -0.04, low = -0.62;
  const P = (r, k, y) => V(r * Math.cos(Math.PI / 6 + (k * Math.PI) / 3), y, r * Math.sin(Math.PI / 6 + (k * Math.PI) / 3));
  const pale = [0.96, 0.83, 0.48, 1], wall = [0.95, 0.72, 0.27, 1], side = [0.86, 0.56, 0.17, 1], deep = [0.5, 0.27, 0.07, 1], under = [0.4, 0.21, 0.06, 1];
  for (let k = 0; k < 6; k++) {
    b.tri(V(0, floor, 0), P(ri, k + 1, floor), P(ri, k, floor), { color: pale });
    b.quad(P(R, k, top), P(ri, k, top), P(ri, k + 1, top), P(R, k + 1, top), { color: wall });
    b.quad(P(ri, k, floor), P(ri, k + 1, floor), P(ri, k + 1, top), P(ri, k, top), { color: side });
    b.quad(P(R, k + 1, low), P(R, k, low), P(R, k, top), P(R, k + 1, top), { colors: [deep, deep, side, side] });
    b.tri(V(0, low, 0), P(R, k, low), P(R, k + 1, low), { color: under });
  }
  return b.build();
}
/** What closes a capped cell, or swells out of one of royal jelly: a low dome with six sides, white (its instance gives the colour). */
function capGeometry() {
  const b = new MeshBuilder(), rings = [[R * 0.78, -0.03], [R * 0.66, 0.13], [R * 0.4, 0.23]];
  const P = (r, k, y) => V(r * Math.cos(Math.PI / 6 + (k * Math.PI) / 3), y, r * Math.sin(Math.PI / 6 + (k * Math.PI) / 3));
  for (let k = 0; k < 6; k++) {
    for (let j = 0; j + 1 < rings.length; j++) b.quad(P(rings[j][0], k + 1, rings[j][1]), P(rings[j][0], k, rings[j][1]), P(rings[j + 1][0], k, rings[j + 1][1]), P(rings[j + 1][0], k + 1, rings[j + 1][1]), { color: j ? [1, 1, 1, 1] : [0.8, 0.8, 0.8, 1] });
    b.tri(V(0, 0.27, 0), P(rings[2][0], k + 1, rings[2][1]), P(rings[2][0], k, rings[2][1]), { color: [1.12, 1.12, 1.12, 1] });
  }
  return b.build();
}
/** A bee, nose towards +z, as long as a foot: bands of amber and of black, two pale wings. */
function beeGeometry() {
  const b = new MeshBuilder(), dark = [0.1, 0.07, 0.05, 1];
  b.push(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  const bands = [[[0.001, -0.36], [0.11, -0.29], dark], [[0.11, -0.29], [0.18, -0.17], AMBER], [[0.18, -0.17], [0.2, -0.05], dark], [[0.2, -0.05], [0.19, 0.06], AMBER], [[0.19, 0.06], [0.15, 0.15], dark], [[0.15, 0.15], [0.13, 0.25], [0.2, 0.14, 0.08, 1]], [[0.13, 0.25], [0.001, 0.33], dark]];
  for (const [p0, p1, tone] of bands) b.tint(tone[0], tone[1], tone[2], 1).lathe([p0, p1], 8);
  b.pop();
  const pale = [1.7, 1.8, 1.9, 1];
  for (const s of [-1, 1]) {
    const a = V(s * 0.06, 0.16, 0.1), c = V(s * 0.5, 0.3, -0.02), d = V(s * 0.42, 0.26, -0.3), e = V(s * 0.1, 0.17, -0.12);
    b.quad(a, c, d, e, { color: pale }).quad(e, d, c, a, { color: pale });
  }
  return b.build();
}

export class Hive {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'hive';
    this.session = null;
    this.best = 0;
    this.shown = new Float32Array(COMBS).fill(1); // how much of each comb is drawn (a comb above one's head is put away)
    this.lit = new Float32Array(COMBS).fill(1); // … and how bright (the combs under the one one runs on are in its shade: a hole reads as a hole)
  }

  build() {
    const world = this.world, mats = world.materials, H = HIVE, C = H.at, parts = new Parts();
    const wood = parts.get('woodDark'), matte = parts.get('matte'), paint = parts.get('paint');
    // ---- the wax: every cell of the four combs is one instance of the same cup; the caps and the jelly, of the same dome
    const wax = (this.wax = surfaceMaterial({ name: 'wax', rough: 0.5, spec: 0.3, emissive: [0.05, 0.032, 0.008] }));
    const cells = (this.cells = new THREE.InstancedMesh(cellGeometry(), wax, COMBS * N));
    const lids = [];
    for (let c = 0; c < COMBS; c++) for (let i = 0; i < N; i++) if (KIND[c][i]) lids.push(c * N + i);
    const caps = (this.caps = new THREE.InstancedMesh(capGeometry(), wax, lids.length));
    // (their instances move: what is tested against the view is one sphere round the four combs and what falls from them)
    for (const m of [cells, caps]) { m.boundingSphere = new THREE.Sphere(V(C.x, (H.levels[0] + H.levels[COMBS - 1]) / 2, C.z), 23); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(m); }
    cells.name = 'hive-cells'; caps.name = 'hive-caps';
    cells.setColorAt(0, new THREE.Color(1, 1, 1)); caps.setColorAt(0, new THREE.Color(1, 1, 1));
    // ---- a great crook of timber stands in the sea on the side the camera looks at — never between it and the
    // player — and arches over the combs: the skep hangs from its tip like a lantern
    const POLE = 12.6, RH = H.radius + R + 0.4, HEAD = H.levels[0] + 11.2, RX = -FZ, RZ = FX;
    /** A place round the combs: `off` metres towards where the camera looks, `side` metres to its right, at height y. */
    const at = (off, side, y) => V(C.x + FX * off + RX * side, y, C.z + FZ * off + RZ * side);
    const foot = at(POLE, 0, 0), bed = Math.min(-1, this.data.heightAt(foot.x, foot.z)) - 0.6;
    wood.tint(...TIMBER, 1).cylinder(foot.x, bed, foot.z, 0.58, 0.42, HEAD - bed, 12, { capTop: false });
    for (const y of [0.5, H.levels[COMBS - 1] - 2.6, HEAD - 0.5]) wood.tint(0.36, 0.3, 0.27, 1).cylinder(foot.x, y, foot.z, 0.62, 0.6, 0.36, 12); // (iron bands)
    const crook = [];
    for (let k = 0; k <= 10; k++) { const t = (k / 10) * (Math.PI / 2); crook.push([POLE * Math.cos(t), HEAD + 6 * Math.sin(t)]); }
    crook.push([-0.95, HEAD + 5.72], [-1.55, HEAD + 5.05], [-1.42, HEAD + 4.4], [-0.9, HEAD + 4.05]);
    for (let k = 0; k + 1 < crook.length; k++) { const r0 = 0.42 - 0.27 * (k / (crook.length - 1)), r1 = 0.42 - 0.27 * ((k + 1) / (crook.length - 1)); wood.tint(...TIMBER, 1).rod(at(crook[k][0], 0, crook[k][1]), at(crook[k + 1][0], 0, crook[k + 1][1]), r0, 10, { r1 }); }
    // ---- the hoops, like a beekeeper's frames: each comb in its own, on an arm of the crook, hung from the one
    // above by ropes (none on the side of the camera: a rope near the lens is a bar across the picture). Each
    // hoop is a group of its own: over one's head it is put away with its comb.
    const round = (deg, y) => at(RH * Math.cos((deg * Math.PI) / 180), RH * Math.sin((deg * Math.PI) / 180), y);
    this.hoops = [];
    for (let c = 0; c < COMBS; c++) {
      const L = H.levels[c], own = new Parts(), timber = own.get('woodDark'), cord = own.get('matte');
      for (let k = 0; k < 30; k++) { const a0 = (k / 30) * TAU, a1 = ((k + 1) / 30) * TAU; timber.tint(0.46, 0.36, 0.29, 1).beam(V(C.x + Math.sin(a0) * RH, L - 0.2, C.z + Math.cos(a0) * RH), V(C.x + Math.sin(a1) * RH, L - 0.2, C.z + Math.cos(a1) * RH), 0.3, 0.6); }
      timber.tint(...TIMBER, 1).beam(at(POLE, 0, L - 0.2), at(RH, 0, L - 0.2), 0.3, 0.38).beam(at(POLE, 0, L - 2.4), at(RH + 0.5, 0, L - 0.5), 0.2, 0.24);
      if (c + 1 < COMBS) for (const deg of [-100, -50, 50, 100]) cord.tint(...ROPE, 1).rod(round(deg, H.levels[c + 1] + 0.1), round(deg, L - 0.5), 0.035, 5, { caps: false });
      if (!c) for (const deg of [-100, 100]) cord.tint(...ROPE, 1).rod(round(deg, L + 0.1), at(POLE, 0, HEAD - 0.6), 0.04, 5, { caps: false });
      // (the wax is tied to its hoop: a peg to every cell of the rim that comes near it)
      for (let i = 0; i < N; i++) { const d = Math.hypot(CELLS[i].x, CELLS[i].z); if (d < H.radius - R * 0.9) continue; const ux = CELLS[i].x / d, uz = CELLS[i].z / d; timber.tint(0.5, 0.4, 0.3, 1).beam(V(C.x + ux * (d + R * 0.7), L - 0.3, C.z + uz * (d + R * 0.7)), V(C.x + ux * RH, L - 0.3, C.z + uz * RH), 0.1, 0.1); }
      const hoop = own.toMeshes(mats, { name: `hive-hoop${c}`, layers: [LAYER.STATIC_CASTER] });
      this.hoops.push(hoop);
      this.group.add(hoop);
    }
    // ---- the skep: a dome of coiled straw on its round board, hung high over the top comb (the camera flies under it)
    const base = H.levels[0] + 10.7, coils = [];
    wood.tint(0.5, 0.4, 0.32, 1).cylinder(C.x, base - 0.2, C.z, 3.9, 3.9, 0.2, 20, { capBottom: true });
    for (let k = 0; k <= 10; k++) { const t = k / 10, r = 3.5 * Math.cos(t * 1.42) ** 0.75, y = base + 4.2 * Math.sin(t * 1.42) / Math.sin(1.42); coils.push([r + 0.1, y + 0.08], [r - 0.02, y + 0.31]); }
    coils.push([0.26, base + 4.42], [0.001, base + 4.5]);
    matte.tint(...STRAW, 1).place(C.x, 0, C.z).lathe(coils, 18).pop();
    matte.tint(...ROPE, 1).rod(V(C.x, base + 4.4, C.z), at(-0.9, 0, HEAD + 4.05), 0.06, 6, { caps: false });
    // (the way in, on the side of the beach: a dark mouth and its little board)
    { const a = H.view, x = C.x + Math.sin(a) * 3.36, z = C.z + Math.cos(a) * 3.36; matte.tint(0.08, 0.05, 0.03, 1).place(x, base + 1.1, z, a, Math.PI / 2).cylinder(0, 0, 0, 0.6, 0.55, 0.14, 12).pop(); wood.tint(...TIMBER, 1).place(x, base + 0.42, z, a).box(-0.8, -0.05, -0.1, 0.8, 0.05, 0.62).pop(); }
    // ---- the arch on the sand, where one asks
    const g = H.gate, gy = this.data.heightAt(g.x, g.z);
    this.gate = { x: g.x, y: gy, z: g.z, yaw: g.yaw };
    this.boardSpot = { x: g.x + 0.2, z: g.z - 4.2, yaw: g.yaw + Math.PI }; // (its stand: on the other side of the arch than the kit would put it, clear of the parasols on the sand)
    {
      // (the board of its five sponsors: across the arch from its stand, as in a mirror — beside the stand it would
      // stand among the chairs of the Beach Lounge, or in the arch)
      const b = this.boardSpot, fx = Math.sin(g.yaw), fz = Math.cos(g.yaw), vx = b.x - g.x, vz = b.z - g.z, d = vx * fx + vz * fz;
      this.rollSpot = { x: g.x + 2 * d * fx - vx, z: g.z + 2 * d * fz - vz };
    }
    gateArch(this.group, paint, g.x, gy, g.z, g.yaw, H.name.toUpperCase(), 'THE WAX YOU STAND ON GIVES WAY · HOW LONG CAN YOU HOLD?', { tone: [1.45, 0.92, 0.12], ink: '#2a1c0a' });
    this.group.add(parts.toMeshes(mats, { name: 'hive-frame', layers: [LAYER.STATIC_CASTER] }));
    // ---- the bees
    const bees = (this.bees = new THREE.InstancedMesh(beeGeometry(), mats.paint, BEES));
    bees.name = 'hive-bees'; bees.boundingSphere = new THREE.Sphere(V(C.x, (H.levels[0] + H.levels[COMBS - 1]) / 2 + 2, C.z), 23); bees.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(bees);
    this._draw(null);
    this._fly(null, 0);
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    return this;
  }

  setBest(ms) { this.best = ms || 0; }
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.5 * 2.5; }

  /**
   * Draws the wax as a run has it (`st`: its state; null: whole, as nobody has touched it): a cell that gives
   * way goes from the colour of wax to that of a coal, sinks and trembles; dropped, it falls away and is gone.
   * A comb above one's head is put away, so that one sees where one stands.
   */
  _draw(st, dt = 0) {
    const H = HIVE, C = H.at, m = _m, q = _q, s = _s, p = _p, col = _c;
    let n = 0;
    for (let c = 0; c < COMBS; c++) {
      const L = H.levels[c];
      // (shown: the comb one is on, those below — and one that one is being thrown up to)
      const want = !st || st.y >= L - 0.7 || (st.vy > 0 && st.y + (st.vy * st.vy) / (2 * H.g) >= L) ? 1 : 0;
      this.shown[c] = dt ? clamp(this.shown[c] + Math.sign(want - this.shown[c]) * dt * 5, 0, 1) : want;
      // (in full light: the comb one is on — or about to come down on —; those below it, dimmer and bluer)
      const mine = !st ? c : st.ground ? st.on : H.levels.findIndex((l) => l < st.y), bright = !st || c <= (mine < 0 ? COMBS : mine) ? 1 : 0;
      this.lit[c] = dt ? clamp(this.lit[c] + Math.sign(bright - this.lit[c]) * dt * 4, 0, 1) : bright;
      const show = this.shown[c], lit = this.lit[c], lr = 0.5 + 0.5 * lit, lg = 0.56 + 0.44 * lit, lb = 0.7 + 0.3 * lit;
      this.hoops[c].visible = show > 0.02;
      for (let i = 0; i < N; i++) {
        const k = c * N + i, drop = st ? st.drop[c][i] : Infinity, kind = KIND[c][i], base = TINT[kind];
        let y = L, size = 0.955 * show, tilt = 0, spent = false;
        col.setRGB(base[0], base[1], base[2]);
        if (drop !== Infinity) {
          const t = st.clock - drop;
          spent = true;
          if (t >= 0) {
            // dropped: it falls away, turning, and is gone
            if (t > 0.75) size = 0; else { y = L - 0.5 * 26 * t * t; tilt = t * (3 + (i % 5)); size *= 1 - t * 0.5; }
            col.setRGB(BURNT[0], BURNT[1], BURNT[2]);
          } else {
            const f = clamp(1 + t / holds(c, i), 0, 1), a = Math.min(1, f / 0.55), b = clamp((f - 0.55) / 0.45, 0, 1);
            // (the last third of its time it blinks)
            const blink = f > 0.66 ? 0.75 + 0.25 * Math.sin(st.clock * 38) : 1;
            col.setRGB((base[0] + (HOT[0] - base[0]) * a + (BURNT[0] - HOT[0]) * b) * blink, (base[1] + (HOT[1] - base[1]) * a + (BURNT[1] - HOT[1]) * b) * blink, (base[2] + (HOT[2] - base[2]) * a + (BURNT[2] - HOT[2]) * b) * blink);
            y = L - 0.16 * f + Math.sin(st.clock * 47 + i * 1.7) * 0.022 * f;
          }
        }
        col.r *= lr; col.g *= lg; col.b *= lb;
        p.set(C.x + CELLS[i].x, y, C.z + CELLS[i].z);
        q.setFromEuler(_e.set(tilt, 0, tilt * 0.6));
        m.compose(p, q, s.setScalar(size));
        this.cells.setMatrixAt(k, m);
        this.cells.setColorAt(k, col);
        if (kind) {
          // its cap — darker wax —, or its jelly, which is gone with the first foot (or the first bee)
          const tone = CAP[kind];
          if (kind === 2 && spent) s.setScalar(0); else if (kind === 1 && spent) col.multiplyScalar(0.8); else col.setRGB(tone[0] * lr, tone[1] * lg, tone[2] * lb);
          if (kind === 2 && !spent) { const pulse = st ? 1 + 0.07 * Math.sin(st.clock * 5 + i) : 1; s.set(size * pulse, size * 1.3 * (2 - pulse), size * pulse); } // (the jelly swells and breathes)
          m.compose(p, q, s);
          this.caps.setMatrixAt(n, m);
          this.caps.setColorAt(n, col);
          n++;
        }
      }
    }
    this.cells.instanceMatrix.needsUpdate = true; this.cells.instanceColor.needsUpdate = true;
    this.caps.instanceMatrix.needsUpdate = true; this.caps.instanceColor.needsUpdate = true;
  }

  /** Puts the bees where they are: those of a run on their combs (`st`), else hovering over the wax; the others round the skep. */
  _fly(st, now) {
    const H = HIVE, C = H.at, m = _m, q = _q, s = _s, p = _p;
    for (let k = 0; k < BEES; k++) {
      let x, y, z, yaw, size = 1.75, lean = 0;
      if (k < COMBS && st) {
        const d = droneAt(st, k, _d), show = this.shown[k];
        x = C.x + d.x; z = C.z + d.z; y = H.levels[k] + d.up + Math.sin(now * 9 + k) * 0.05; yaw = d.heading; lean = d.flying > 0 && d.flying < 1 ? 0.35 : 0; size *= show;
      } else if (k < COMBS) {
        const a = now * 0.45 + k * 2.1, r = 3.4 + Math.sin(now * 0.31 + k) * 1.4;
        x = C.x + Math.sin(a) * r; z = C.z + Math.cos(a) * r; y = H.levels[k] + 1.3 + Math.sin(now * 1.7 + k * 3) * 0.3; yaw = a + Math.PI / 2; lean = 0.2;
      } else {
        const a = -now * (0.5 + 0.07 * k) + k * 1.9, r = 5.3 + Math.sin(now * 0.4 + k * 2) * 0.7;
        x = C.x + Math.sin(a) * r; z = C.z + Math.cos(a) * r; y = H.levels[0] + 13 + Math.sin(now * 0.9 + k * 1.3) * 1.5; yaw = a - Math.PI / 2; lean = 0.25; size = 1.5;
      }
      p.set(x, y, z);
      q.setFromEuler(_e.set(lean, yaw, Math.sin(now * 23 + k * 2) * 0.12, 'YXZ'));
      m.compose(p, q, s.setScalar(size));
      this.bees.setMatrixAt(k, m);
    }
    this.bees.instanceMatrix.needsUpdate = true;
  }

  /**
   * A run is asked for: the player is put on the middle of the top comb, and it begins at the count of three.
   * `io`: { play, note, splash }. Returns the session — the driver of the player (see src/extras/plug.js).
   */
  open(player, io) {
    const H = HIVE, C = H.at, seed = (Math.floor(worldClock() / 97) % 99991) + 1, st = startRun(seed), events = [], input = { x: 0, y: 0, jump: false };
    const S = { count: 3, last: 4, acc: 0, after: 0, cam: null, look: V(0, 0, 0) }, _t = V(0, 0, 0);
    const session = {
      hive: this, over: false, ended: false, score: 0, line: '', riding: false, anim: ANIM.idle, state: st, auto: false, seed,
      // (a run is one's own — the cells that have given way are — so nobody shares it: who else runs on the combs is
      // not shown meanwhile, rather than seen falling through wax that is whole here: src/extras/mates.js)
      instance: seed,
      step: (dt, pl, control) => {
        const inp = pl.input;
        if (S.count > 0) {
          S.count -= Math.min(dt, 0.25);
          if (Math.ceil(S.count) !== S.last && S.count > 0) { S.last = Math.ceil(S.count); io.play('tick'); }
          if (S.count <= 0) io.play('start');
        } else if (session.auto) {
          S.acc += Math.min(dt, 0.25);
          while (S.acc >= H.step && !st.over) { S.acc -= H.step; botInput(st, input); stepRun(st, H.step, input, events); }
        } else if (!st.over) {
          input.x = control ? inp.move.x : 0; input.y = control ? inp.move.y : 0; input.jump = control && !!inp.jump;
          stepRun(st, dt, input, events);
        }
        for (const e of events) this._tell(e, st, io);
        events.length = 0;
        const speed = Math.hypot(st.vx, st.vz);
        pl.pos.set(C.x + st.x, st.over ? -0.55 : st.y, C.z + st.z); pl.yaw = st.face; pl.pitch = 0; pl.roll = 0;
        pl.speed = speed; pl.grounded = st.ground;
        session.anim = st.over ? ANIM.swim : !st.ground ? ANIM.jump : speed > 0.7 ? ANIM.run : ANIM.idle;
        if (st.over) { S.after += dt; if (!session.over) { session.over = true; session.score = st.time; } if (S.after > 2) session.ended = true; }
        session.line = S.count > 0 ? `${H.name} · ${Math.max(1, Math.ceil(S.count))}…`
          : st.over ? `${H.name} · held ${formatTime(st.time)}`
            : `${formatTime(Math.round(st.clock * 1000))} · ${NAMES[st.on]} · ${standing(st, st.on)} cells left on it`;
      },
      /** The camera: above the player and behind, always looking the same way — steep enough to read the wax round one's feet. */
      camera: (cam, dt) => {
        const px = C.x + st.x, pz = C.z + st.z, py = Math.max(0, st.y);
        _t.set(px - FX * 8.2, py + 9.8, pz - FZ * 8.2);
        if (!S.cam) S.cam = _t.clone(); else { const k = Math.min(1, dt * 7); S.cam.x += (_t.x - S.cam.x) * k; S.cam.z += (_t.z - S.cam.z) * k; S.cam.y += (_t.y - S.cam.y) * Math.min(1, dt * 4.5); }
        _t.set(px + FX * 1.6, py + 0.5, pz + FZ * 1.6);
        if (S.look.lengthSq()) { const k = Math.min(1, dt * 9); S.look.x += (_t.x - S.look.x) * k; S.look.z += (_t.z - S.look.z) * k; S.look.y += (_t.y - S.look.y) * Math.min(1, dt * 5.5); } else S.look.copy(_t);
        cam.position.copy(S.cam); cam.up.set(0, 1, 0); cam.lookAt(S.look);
        return 58;
      },
      /** The run is over (or left): the player is put back on the sand, before the arch. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x, this.gate.z, this.gate.yaw); session.close(); },
      close: () => { if (this.session === session) { this.session = null; this._draw(null); } },
    };
    this.session = session;
    this.shown.fill(1); this.lit.fill(1);
    session.step(0, player, false);
    return session;
  }

  _tell(e, st, io) {
    if (e.type === 'jump') io.play('jump', { volume: 0.5 });
    else if (e.type === 'land') io.play('land', { volume: 0.6 });
    else if (e.type === 'touch') io.play('tick', { volume: 0.22 });
    else if (e.type === 'throw') { io.play('boost'); io.note('Royal jelly! Back up you go.'); }
    else if (e.type === 'fall' && e.comb < COMBS - 1 && st.vy <= 0) io.play('whack', { volume: 0.35 });
    else if (e.type === 'sea') { io.play('splash'); io.splash(HIVE.at.x + st.x, 0, HIVE.at.z + st.z, 1.5); io.note(`In the sea! You held ${formatTime(e.time)}.`, 3200); }
  }

  /** Every frame: the wax as the run has it, the bees where they are. */
  update(dt) {
    const s = this.session, now = worldClock() / 1000;
    if (s) this._draw(s.state, Math.min(dt || 0.016, 0.1));
    this._fly(s ? s.state : null, s ? s.state.clock + 100 : now % 10000);
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler(), _d = {};
