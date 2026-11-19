// Everything built around the mill besides the buildings themselves:
// channels, dam, sluice, waterwheel, garden terraces, bridges, the lane, small props.
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';
import { LAYER } from '../../../render/Shadows.js';
import { MILL, LEVELS, DAM, TERRACES, frameToWorld } from '../../layout/layout.js';
import { smoothPath, resample } from '../../layout/spline.js';
import { wall, channelLining, stairs, footbridge, archBridge, roadRibbon } from '../../props/Structures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CAST = [LAYER.STATIC_CASTER, LAYER.DYNAMIC_CASTER, LAYER.REFLECT];

export class MillWorks {
  constructor(zone) {
    this.zone = zone;
    this.world = zone.world;
    this.data = zone.world.data;
    this.ground = (x, z) => this.data.heightAt(x, z);
  }

  build() {
    const parts = new Parts();
    this._channels(parts);
    this._dam(parts);
    this._garden(parts);
    this._bridges(parts);
    this._roads(parts);
    this._terrace(parts);
    const g = parts.toMeshes(this.world.materials, { name: 'mill-works', layers: CAST });
    this.zone.group.add(g);
    this._wheel();
  }

  stream(id) { return this.data.meta.streams.find((s) => s.id === id).samples; }

  _channels(parts) {
    const stone = parts.get('stoneWet'), cap = parts.get('granite');
    stone.tint(0.95, 0.94, 0.92, 1); cap.tint(0.84, 0.83, 0.8, 1);
    for (const id of ['canal', 'raceHead', 'raceTail', 'spill']) {
      channelLining(stone, this.stream(id), { groundAt: this.ground, cap, coping: id === 'canal' ? 0.32 : 0.4, bed: id === 'spill' ? 0.9 : 0.6 });
    }
  }

  _dam(parts) {
    const stone = parts.get('stoneWet'), cap = parts.get('granite');
    stone.tint(1, 1, 1, 1); cap.tint(0.86, 0.85, 0.82, 1);
    const Y = LEVELS.court;
    // quay along the courtyard and the pond side of the dam: wall face down into the water, low parapet
    const quay = [[-141.5, 5.6], [-136, 7.6], [-131.2, 8.5], [-125, 8.75], [-119.2, 9.2]];
    wall(stone, quay.map(([x, z]) => [x, z, Y + 0.02]), { thickness: 0.7, groundAt: () => LEVELS.pondBig - 1.6, depth: 0, cap, tile: 2 });
    // parapet with planters' ledge
    wall(stone, [[-131.5, 8.45], [-125.5, 8.7], [-120.6, 9.0]].map(([x, z]) => [x, z, Y + 0.52]), { thickness: 0.4, base: Y - 0.1, cap, tile: 2 });
    // the dam: upstream face in the water, downstream face retaining the crest
    const crest = DAM.crest;
    const dir = [crest[2][0] - crest[0][0], crest[2][1] - crest[0][1]];
    const len = Math.hypot(dir[0], dir[1]); dir[0] /= len; dir[1] /= len;
    const up = [-dir[1], dir[0]]; // towards the pond (south-west)
    const line = (off, a = 0, b = 1) => [0, 0.5, 1].map((t) => { const u = a + (b - a) * t; return [crest[0][0] + dir[0] * len * u + up[0] * off, crest[0][1] + dir[1] * len * u + up[1] * off]; });
    wall(stone, line(1.0, -0.04, 0.9).map(([x, z]) => [x, z, Y + 0.02]), { thickness: 0.6, groundAt: () => LEVELS.pondBig - 1.8, depth: 0, cap, tile: 2 });
    wall(stone, line(-1.15, 0.05, 1.02).map(([x, z]) => [x, z, Y + 0.02]), { thickness: 0.6, groundAt: this.ground, depth: 0.8, cap, tile: 2 });
    // paved crest
    const pave = parts.get('paving');
    pave.tint(0.82, 0.8, 0.76, 1);
    const A = line(0.75, -0.02, 0.92), B = line(-0.9, -0.02, 0.92);
    pave.quad(V(A[0][0], Y + 0.03, A[0][1]), V(B[0][0], Y + 0.03, B[0][1]), V(B[2][0], Y + 0.03, B[2][1]), V(A[2][0], Y + 0.03, A[2][1]), { tile: 2 });

    // sluice: two granite piers, a timber gate frame and its winding gear, a slab to walk across
    const sp = this.stream('spill');
    const s0 = sp[Math.round(sp.length * 0.36)], s1 = sp[Math.round(sp.length * 0.36) + 2];
    const fd = V(s1[0] - s0[0], 0, s1[1] - s0[1]).normalize();
    const side = V(-fd.z, 0, fd.x);
    const c = V(s0[0], 0, s0[1]);
    const g = parts.get('granite'), wood = parts.get('woodDark'), iron = parts.get('paint');
    g.tint(0.88, 0.87, 0.84, 1);
    for (const sgn of [-1, 1]) {
      const p = c.clone().addScaledVector(side, sgn * 1.35);
      g.place(p.x, 0, p.z, Math.atan2(fd.x, fd.z));
      g.box(-0.3, LEVELS.pondBig - 1.6, -0.45, 0.3, Y + 1.25, 0.45, { tile: 1 });
      g.box(-0.36, Y + 1.25, -0.5, 0.36, Y + 1.4, 0.5, { tile: 1 });
      g.pop();
    }
    wood.tint(0.9, 0.82, 0.72, 1);
    const pL = c.clone().addScaledVector(side, -1.0), pR = c.clone().addScaledVector(side, 1.0);
    wood.beam(pL.clone().setY(Y + 2.35), pR.clone().setY(Y + 2.35), 0.2, 0.22, { tile: 1 });
    for (const p of [pL, pR]) wood.box(p.x - 0.09, LEVELS.pondBig - 0.6, p.z - 0.09, p.x + 0.09, Y + 2.35, p.z + 0.09, { tile: 1 });
    // the gate board, half raised
    wood.tint(0.7, 0.62, 0.52, 1);
    wood.place(c.x, 0, c.z, Math.atan2(fd.x, fd.z));
    wood.box(-0.95, LEVELS.pondBig + 0.25, -0.04, 0.95, Y + 1.5, 0.04, { tile: 0.7 });
    wood.box(-0.06, Y + 1.5, -0.05, 0.06, Y + 2.5, 0.05, { tile: 0.7 });
    wood.pop();
    iron.tint(0.12, 0.13, 0.12, 1);
    iron.place(c.x, Y + 2.62, c.z, Math.atan2(fd.x, fd.z), Math.PI / 2);
    iron.lathe([[0.3, -0.03], [0.34, 0], [0.3, 0.03]], 14);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI; iron.beam(V(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32), V(-Math.cos(a) * 0.32, 0, -Math.sin(a) * 0.32), 0.03, 0.03); }
    iron.pop();
    // slab bridge on the downstream side of the gate
    g.tint(0.8, 0.79, 0.76, 1);
    const bc = c.clone().addScaledVector(fd, 0.95);
    g.place(bc.x, Y - 0.14, bc.z, Math.atan2(fd.x, fd.z));
    g.box(-2.0, 0, -0.65, 2.0, 0.18, 0.65, { tile: 1 });
    g.pop();
    this.zone.platforms = this.zone.platforms || [];
    this.zone.platforms.push({ type: 'slab', x: bc.x, z: bc.z, y: Y + 0.04, hw: 2.0, hl: 0.65, yaw: Math.atan2(fd.x, fd.z) });
  }

  _garden(parts) {
    const stone = parts.get('drystone'), g = parts.get('granite');
    stone.tint(1, 0.98, 0.95, 1);
    // dry-stone retaining walls along the terraces (top follows the upper ground)
    TERRACES.forEach((t, k) => {
      const pts = resample(smoothPath(t.points, { step: 0.5 }), 1.0);
      const line = pts.map(([x, z], i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let nx = b[1] - a[1], nz = -(b[0] - a[0]);
        const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; // left = uphill
        const upY = this.ground(x + nx * 1.1, z + nz * 1.1);
        const ends = Math.min(1, i / 2, (pts.length - 1 - i) / 2);
        return [x - nx * 0.1, z - nz * 0.1, upY + 0.12 * ends - (1 - ends) * 0.5];
      });
      wall(stone, line, { thickness: 0.55, groundAt: this.ground, depth: 0.6, tile: 2 });
      void k;
    });
    // stone steps climbing through the terraces along the garden path
    g.tint(0.78, 0.76, 0.72, 1);
    const path = [[-128.5, -5.6], [-128.2, -9.4], [-127.9, -13.8], [-128.3, -18.6], [-128.9, -24], [-129.1, -29.4]];
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], b = path[i + 1];
      const ya = this.ground(a[0], a[1]), yb = this.ground(b[0], b[1]);
      if (yb - ya > 0.4) stairs(g, V(a[0], ya - 0.02, a[1]), V(b[0], yb + 0.02, b[1]), 1.25, { tile: 1 });
    }
    // a stone bench at the top of the garden
    const bx = -140, bz = -40.5, by = this.ground(bx, bz);
    g.tint(0.84, 0.82, 0.78, 1);
    g.place(bx, by, bz, 0.5);
    g.box(-0.9, 0.38, -0.25, 0.9, 0.5, 0.25, { tile: 1 });
    g.box(-0.8, -0.2, -0.2, -0.55, 0.38, 0.2, { tile: 1 });
    g.box(0.55, -0.2, -0.2, 0.8, 0.38, 0.2, { tile: 1 });
    g.box(-0.9, 0.5, -0.3, 0.9, 1.0, -0.2, { tile: 1 });
    g.pop();
  }

  _bridges(parts) {
    const zone = this.zone;
    zone.platforms = zone.platforms || [];
    // little plank bridge where the path crosses the stepped canal
    const canal = this.stream('canal');
    const c = canal[Math.round(canal.length * 0.42)];
    const cn = canal[Math.round(canal.length * 0.42) + 1];
    let dx = cn[0] - c[0], dz = cn[1] - c[1];
    const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    const y = c[2] + 0.55;
    const a = V(c[0] - dz * 2.0, Math.max(y, this.ground(c[0] - dz * 2.0, c[1] + dx * 2.0)) + 0.05, c[1] + dx * 2.0);
    const b = V(c[0] + dz * 2.0, Math.max(y, this.ground(c[0] + dz * 2.0, c[1] - dx * 2.0)) + 0.05, c[1] - dx * 2.0);
    zone.platforms.push(footbridge(parts, a, b, 1.7, { camber: 0.12, posts: 3 }));
    // arched footbridge to the willow island
    const isl = V(-202, 0, 102);
    const from = V(-212.5, 0, 108.6), to = V(-208.2, 0, 105.6);
    from.y = this.ground(from.x, from.z) + 0.08; to.y = this.ground(to.x, to.z) + 0.08;
    zone.platforms.push(footbridge(parts, from, to, 1.5, { camber: 0.55, posts: 4, tint: [1.0, 0.94, 0.9] }));
    void isl;
    // stone arch over the brook, half way down the valley
    const brook = this.stream('brook');
    const k = brook.findIndex((s) => s[0] > 134);
    const s = brook[k], sn = brook[k + 2];
    let tx = sn[0] - s[0], tz = sn[1] - s[1];
    const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
    const span = 5.2;
    const pa = V(s[0] - tz * span, 0, s[1] + tx * span), pb = V(s[0] + tz * span, 0, s[1] - tx * span);
    const deckY = Math.max(this.ground(pa.x, pa.z), this.ground(pb.x, pb.z), s[2] + 1.5) + 0.05;
    pa.y = deckY; pb.y = deckY;
    zone.platforms.push(archBridge(parts, pa, pb, 3.0, { rise: 1.25, waterY: s[2] }));
  }

  _roads(parts) {
    const road = parts.get('asphalt');
    road.tint(1, 1, 1, 1);
    for (const p of this.data.meta.paths) {
      if (p.kind !== 'asphalt') continue;
      const inside = p.samples.filter((s) => Math.abs(s[0]) < 511 && Math.abs(s[1]) < 511);
      roadRibbon(road, inside, p.width, { groundAt: this.ground, tile: 3 });
    }
  }

  _terrace(parts) {
    // paved terrace in front of the pond-side gable
    const fr = MILL.house;
    const pave = parts.get('paving');
    pave.tint(0.94, 0.93, 0.9, 1);
    const y = LEVELS.court + 0.03;
    const c = [[-3.6, 8.25], [3.9, 8.25], [3.9, 12.6], [-3.6, 12.2]].map(([lx, lz]) => frameToWorld(fr, lx, lz));
    pave.quad(V(c[3][0], y, c[3][1]), V(c[2][0], y, c[2][1]), V(c[1][0], y, c[1][1]), V(c[0][0], y, c[0][1]), { tile: 2 });
    // old-fashioned lamp post in the courtyard
    const iron = parts.get('paint'), glow = parts.get('glow');
    const [lx, lz] = frameToWorld(fr, -7.2, 11.2);
    iron.tint(0.07, 0.2, 0.12, 1);
    iron.place(lx, LEVELS.court, lz);
    iron.lathe([[0.16, 0], [0.13, 0.25], [0.07, 0.4], [0.055, 2.3], [0.08, 2.4], [0.05, 2.5], [0.05, 2.75]], 10);
    iron.lathe([[0.03, 2.75], [0.2, 2.82], [0.17, 3.2], [0.22, 3.24], [0.03, 3.42]], 6);
    iron.pop();
    glow.tint(1, 0.9, 0.7, 1);
    glow.place(lx, LEVELS.court + 3.0, lz).lathe([[0.02, -0.12], [0.1, -0.1], [0.12, 0.1], [0.02, 0.16]], 6).pop();
  }

  _wheel() {
    const fr = MILL.house;
    const parts = new Parts();
    const wood = parts.get('woodDark');
    const R = DAM.wheel.radius, W = DAM.wheel.width;
    wood.tint(1.15, 0.8, 0.62, 1);
    const P = (a, r, x) => V(x, Math.sin(a) * r, Math.cos(a) * r);
    const N = 16;
    for (const x of [-W / 2, W / 2]) {
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
        wood.beam(P(a0, R, x), P(a1, R, x), 0.07, 0.16, { tile: 0.8 });
        wood.beam(P(a0, R - 0.42, x), P(a1, R - 0.42, x), 0.06, 0.09, { tile: 0.8 });
      }
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; wood.beam(P(a, 0.12, x), P(a, R, x), 0.07, 0.1, { tile: 0.8 }); }
    }
    // floats (paddles)
    wood.tint(0.95, 0.68, 0.52, 1);
    for (let i = 0; i < N; i++) {
      const a = ((i + 0.5) / N) * Math.PI * 2;
      const p0 = P(a, R - 0.44, 0), p1 = P(a, R + 0.02, 0);
      const d = p1.clone().sub(p0);
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), d.clone().normalize(), V(1, 0, 0));
      m.setPosition(p0.clone().lerp(p1, 0.5));
      wood.push(m).box(-W / 2 + 0.03, -0.025, -0.23, W / 2 - 0.03, 0.025, 0.23, { tile: 0.8 }).pop();
    }
    const iron = parts.get('paint');
    iron.tint(0.1, 0.1, 0.1, 1);
    iron.rod(V(-W / 2 - 1.2, 0, 0), V(W / 2 + 0.25, 0, 0), 0.085, 8);
    wood.tint(0.8, 0.6, 0.48, 1);
    wood.rod(V(-W / 2 - 0.08, 0, 0), V(W / 2 + 0.08, 0, 0), 0.2, 10);
    const g = parts.toMeshes(this.world.materials, { name: 'mill-wheel', layers: [LAYER.DYNAMIC_CASTER, LAYER.REFLECT] });
    const [wx, wz] = frameToWorld(fr, DAM.wheel.lx, DAM.wheel.lz);
    const pivot = new THREE.Group();
    pivot.position.set(wx, fr.floorY - 1.0, wz);
    pivot.rotation.y = fr.yaw;
    pivot.add(g);
    for (const m of g.children) m.matrixAutoUpdate = false;
    this.zone.group.add(pivot);
    this.zone.animated.push((dt) => { g.rotation.x += dt * 0.75; g.updateMatrix(); });
    // trestle and bearing block outside the wheel
    const st = new Parts();
    const w2 = st.get('woodDark'), gr = st.get('granite');
    gr.tint(0.85, 0.84, 0.8, 1);
    gr.box(W / 2 + 0.12, -2.4, -0.35, W / 2 + 0.55, -0.12, 0.35, { tile: 1 });
    w2.tint(0.9, 0.78, 0.66, 1);
    // short wooden launder bringing the water onto the wheel
    w2.box(-0.5, -0.05, R + 0.05, 0.5, 0.0, R + 0.95, { tile: 0.8 });
    w2.box(-0.56, -0.05, R + 0.05, -0.5, 0.3, R + 0.95, { tile: 0.8 });
    w2.box(0.5, -0.05, R + 0.05, 0.56, 0.3, R + 0.95, { tile: 0.8 });
    const sg = st.toMeshes(this.world.materials, { name: 'mill-wheel-frame', layers: CAST });
    pivot.add(sg);
  }
}
