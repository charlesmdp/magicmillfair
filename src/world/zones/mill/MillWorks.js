// Everything built around the mill besides the buildings themselves:
// channels, dam, sluice, waterwheel, garden terraces, bridges, the lane, small props.
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';
import { LAYER } from '../../../render/Shadows.js';
import { PROMENADE, MILL, LEVELS, DAM, TERRACES, frameToWorld } from '../../layout/layout.js';
import { smoothPath, resample, pointInPolygon } from '../../layout/spline.js';
import { fallsRibbon } from '../../water/Falls.js';
import { wall, channelLining, stairs, footbridge, archBridge, roadRibbon } from '../../props/Structures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class MillWorks {
  constructor(zone) {
    this.zone = zone;
    this.cast = zone.cast;
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
    this._gate(parts);
    this._roads();
    this._terrace(parts);
    const g = parts.toMeshes(this.world.materials, { name: 'mill-works', layers: this.cast });
    this.zone.group.add(g);
    this._wheel();
  }

  stream(id) { return this.data.meta.streams.find((s) => s.id === id).samples; }

  _channels(parts) {
    const stone = parts.get('stoneWet'), cap = parts.get('granite');
    stone.tint(0.95, 0.94, 0.92, 1); cap.tint(0.84, 0.83, 0.8, 1);
    for (const id of ['canal', 'raceHead', 'spill']) {
      channelLining(stone, this.stream(id), { groundAt: this.ground, cap, coping: id === 'canal' ? 0.32 : 0.4, bed: id === 'spill' ? 0.9 : 0.6 });
    }
    // the wheel pit and the tail race: thick retaining walls up to the ground they hold
    channelLining(stone, this.stream('raceTail'), { groundAt: this.ground, cap, coping: 0.85, bed: 0.6, lip: 'ground' });
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
    // (the dam proper starts after the head race, which leaves the pond at its western end: see _bridges)
    const T0 = 0.19;
    wall(stone, line(1.0, T0, 0.9).map(([x, z]) => [x, z, Y + 0.02]), { thickness: 0.6, groundAt: () => LEVELS.pondBig - 1.8, depth: 0, cap, tile: 2 });
    wall(stone, line(-1.15, T0, 1.02).map(([x, z]) => [x, z, Y + 0.02]), { thickness: 0.6, groundAt: this.ground, depth: 0.8, cap, tile: 2 });
    // paved crest
    const pave = parts.get('paving');
    pave.tint(0.82, 0.8, 0.76, 1);
    const A = line(0.75, T0, 0.92), B = line(-0.9, T0, 0.92);
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
    this.sluice = { c, fd, side };
  }

  _garden(parts) {
    const stone = parts.get('drystone'), g = parts.get('granite');
    stone.tint(1, 0.98, 0.95, 1);
    this.zone.platforms = this.zone.platforms || [];
    // Dry-stone retaining walls along the terraces (top follows the upper ground). Where the garden path
    // crosses one, the wall opens and a flight of stone steps climbs through the opening.
    const path = this.data.meta.paths.find((q) => q.id === 'garden').samples;
    const cross = (a, b, c, d) => { // segment a-b with segment c-d → point, or null
      const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1];
      const den = rx * sz - rz * sx;
      if (Math.abs(den) < 1e-9) return null;
      const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
      return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + rx * t, a[1] + rz * t, rx, rz] : null;
    };
    const GAP = 1.05; // half width of an opening
    g.tint(0.78, 0.76, 0.72, 1);
    for (const t of TERRACES) {
      const pts = resample(smoothPath(t.points, { step: 0.5 }), 0.5);
      let hit = null;
      for (let i = 0; i + 1 < path.length && !hit; i++) for (let k = 0; k + 1 < pts.length && !hit; k++) hit = cross(path[i], path[i + 1], pts[k], pts[k + 1]);
      const line = pts.map(([x, z], i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let nx = b[1] - a[1], nz = -(b[0] - a[0]);
        const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; // left = uphill
        const upY = this.ground(x + nx * 1.1, z + nz * 1.1);
        const ends = Math.min(1, i / 4, (pts.length - 1 - i) / 4);
        return [x - nx * 0.1, z - nz * 0.1, upY + 0.12 * ends - (1 - ends) * 0.5];
      });
      const runs = hit ? [line.filter((q, i) => Math.hypot(pts[i][0] - hit[0], pts[i][1] - hit[1]) > GAP && pts.findIndex((r) => Math.hypot(r[0] - hit[0], r[1] - hit[1]) <= GAP) > i),
        line.filter((q, i) => Math.hypot(pts[i][0] - hit[0], pts[i][1] - hit[1]) > GAP && pts.findIndex((r) => Math.hypot(r[0] - hit[0], r[1] - hit[1]) <= GAP) < i)] : [line];
      for (const run of runs) if (run.length > 1) wall(stone, run, { thickness: 0.55, groundAt: this.ground, depth: 0.6, tile: 2 });
      if (!hit) continue;
      // the flight: its top is flush with the upper terrace at the wall line, its foot on the lower one
      let dx = hit[2], dz = hit[3];
      const dl = Math.hypot(dx, dz); dx /= dl; dz /= dl; // uphill, along the path
      const top = V(hit[0], this.ground(hit[0] + dx * 1.5, hit[1] + dz * 1.5) + 0.02, hit[1]);
      let run = t.h * 1.9, foot = null;
      for (let it = 0; it < 3; it++) { // (the lower ground slopes a little: settle the length on the real rise)
        foot = V(hit[0] - dx * run, 0, hit[1] - dz * run);
        foot.y = this.ground(foot.x - dx * 0.4, foot.z - dz * 0.4) - 0.02;
        run = Math.max(1.2, ((top.y - foot.y) / 0.165) * 0.31);
      }
      this.zone.platforms.push(stairs(g, foot, top, 1.5, { tile: 1 }));
      // landing: a slab over the brow of the terrace, to the top of the wall line and a little beyond
      g.place(hit[0], top.y, hit[1], Math.atan2(dx, dz));
      g.box(-0.75, -0.7, -0.02, 0.75, 0.0, 1.25, { tile: 1 });
      g.pop();
      this.zone.platforms.push({ type: 'slab', x: hit[0] + dx * 0.6, z: hit[1] + dz * 0.6, y: top.y, hw: 0.75, hl: 0.65, yaw: Math.atan2(dx, dz) });
      // cheeks closing the wall on both sides of the steps
      for (const sgn of [-1, 1]) {
        const cx = hit[0] - dz * sgn * (GAP - 0.14), cz = hit[1] + dx * sgn * (GAP - 0.14);
        stone.place(cx, 0, cz, Math.atan2(dx, dz));
        stone.box(-0.3, foot.y - 0.6, -0.5, 0.3, top.y + 0.16, 0.45, { tile: 2 });
        stone.pop();
      }
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

  /**
   * A footbridge over the water at (x, z), running along (dx, dz): each end is carried on to dry ground, where
   * the bank stands at least `above` over the water, so that no bridge ever starts or ends in the water.
   */
  _bridgeOver(parts, x, z, dx, dz, level, width, { above = 0.3, onto = 0.9, reach = 6, ...options } = {}) {
    const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    const land = (sgn) => {
      let dry = null; // first dry point, in case the bank never rises `above` the water (ground falling away)
      for (let t = 0; t < reach; t += 0.2) {
        const px = x + dx * t * sgn, pz = z + dz * t * sgn;
        if (this.data.depthAt(px, pz) > 0) continue;
        if (dry === null) dry = t;
        if (this.ground(px, pz) >= level + above) return V(px + dx * onto * sgn, 0, pz + dz * onto * sgn);
      }
      const t = (dry ?? reach) + 0.4;
      return V(x + dx * (t + onto) * sgn, 0, z + dz * (t + onto) * sgn);
    };
    const a = land(-1), b = land(1);
    a.y = Math.max(this.ground(a.x, a.z), level + above) + 0.06;
    b.y = Math.max(this.ground(b.x, b.z), level + above) + 0.06;
    const platform = footbridge(parts, a, b, width, options);
    this.zone.platforms.push(platform);
    return platform;
  }

  _bridges(parts) {
    const zone = this.zone;
    zone.platforms = zone.platforms || [];
    const across = (samples, i) => { // unit vector across a stream at sample i
      const p = samples[Math.max(0, i - 1)], n = samples[Math.min(samples.length - 1, i + 1)];
      const l = Math.hypot(n[0] - p[0], n[1] - p[1]) || 1;
      return [-(n[1] - p[1]) / l, (n[0] - p[0]) / l];
    };
    // little plank bridge where the path crosses the stepped cascade
    const canal = this.stream('canal');
    const ci = Math.round(canal.length * 0.42);
    let [ax, az] = across(canal, ci);
    this._bridgeOver(parts, canal[ci][0], canal[ci][1], ax, az, canal[ci][2], 1.7, { camber: 0.12, posts: 3, above: 0.3, reach: 3.5 });
    // arched footbridge to the willow island (from the mainland bank to the island's shore)
    const isl = this.data.meta.ponds[0].islands.find((q) => q.id === 'willow');
    const sx = -217.5 - isl.x, sz = 112.5 - isl.z, sl = Math.hypot(sx, sz); // towards the nearest bank
    this._bridgeOver(parts, isl.x + (sx / sl) * (isl.rx + 3.2), isl.z + (sz / sl) * (isl.rz + 3.2), sx, sz, LEVELS.pondBig, 1.5, { camber: 0.7, posts: 6, tint: [1.0, 0.94, 0.9], onto: 1.2, reach: 40 });
    // over the head race, where it leaves the pond: the way from the courtyard on to the dam
    const head = this.stream('raceHead');
    const hi = 2;
    [ax, az] = across(head, hi);
    this._bridgeOver(parts, head[hi][0], head[hi][1], ax, az, head[hi][2], 1.9, { camber: 0.06, posts: 2, above: 0.4, onto: 1.3, tint: [0.96, 0.9, 0.84] });
    // over the sluice: from the dam to the path around the pond, just upstream of the gate (both banks are
    // at pond level there; downstream the ground falls away to the mill pool)
    const { c, fd, side } = this.sluice;
    this._bridgeOver(parts, c.x - fd.x * 1.05, c.z - fd.z * 1.05, side.x, side.z, LEVELS.pondBig, 1.6, { camber: 0.1, posts: 3, above: 0.3, onto: 1.4, reach: 5, tint: [0.96, 0.9, 0.84] });
    // over the tail race, between the lawn and the mill pool
    const tail = this.stream('raceTail');
    const ti = tail.findIndex((q) => q[0] > -107.2);
    [ax, az] = across(tail, ti);
    this._bridgeOver(parts, tail[ti][0], tail[ti][1], ax, az, tail[ti][2], 1.5, { camber: 0.15, posts: 3, above: 1.0, onto: 1.1 });
    // stone bridge carrying the promenade over the brook
    const brook = this.stream('brook');
    const prom = this.data.meta.promenade;
    let best = null;
    for (let i = 0; i < brook.length; i++) for (let j = 0; j < prom.length; j++) {
      const d = Math.hypot(brook[i][0] - prom[j][0], brook[i][1] - prom[j][1]);
      if (!best || d < best.d) best = { d, i, j };
    }
    const s = brook[best.i], pj = prom[Math.max(1, Math.min(prom.length - 2, best.j))];
    const pn = prom[Math.min(prom.length - 1, best.j + 1)], pp = prom[Math.max(0, best.j - 1)];
    let tx = pn[0] - pp[0], tz = pn[1] - pp[1];
    const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
    const span = 6.5;
    const pa = V(pj[0] - tx * span, PROMENADE.y + 0.02, pj[1] - tz * span), pb = V(pj[0] + tx * span, PROMENADE.y + 0.02, pj[1] + tz * span);
    zone.platforms.push(archBridge(parts, pa, pb, PROMENADE.width + 0.6, { rise: 1.1, waterY: s[2], camber: 0 }));
  }

  // The lane leaves the valley through a pass in the mountains: the estate gate closes it (the playable area
  // ends there, and a closed gate says so better than an invisible wall).
  _gate(parts) {
    const lane = this.data.meta.paths.find((q) => q.id === 'lane').samples, bounds = this.data.meta.bounds;
    let k = lane.length - 1; // the lane is listed from the pass down to the mill
    while (k > 0 && pointInPolygon(bounds, lane[k][0], lane[k][1])) k--;
    const i = Math.min(lane.length - 1, k + 2), p = lane[i], q = lane[Math.max(0, i - 2)];
    let dx = q[0] - p[0], dz = q[1] - p[1];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; // towards the pass
    const yaw = Math.atan2(dx, dz), y = this.ground(p[0], p[1]);
    const g = parts.get('granite'), wood = parts.get('woodDark'), iron = parts.get('paint'), stone = parts.get('drystone');
    g.tint(0.86, 0.85, 0.82, 1);
    g.place(p[0], y, p[1], yaw);
    for (const sgn of [-1, 1]) {
      g.box(sgn * 2.4 - 0.4, -0.6, -0.4, sgn * 2.4 + 0.4, 3.0, 0.4, { tile: 1 });
      g.box(sgn * 2.4 - 0.5, 3.0, -0.5, sgn * 2.4 + 0.5, 3.18, 0.5, { tile: 1 });
      g.box(sgn * 2.4 - 0.24, 3.18, -0.24, sgn * 2.4 + 0.24, 3.62, 0.24, { tile: 1 });
    }
    g.pop();
    wood.place(p[0], y, p[1], yaw);
    for (const sgn of [-1, 1]) {
      const x0 = sgn > 0 ? 0.03 : -1.98, x1 = sgn > 0 ? 1.98 : -0.03;
      wood.tint(0.5, 0.43, 0.35, 1);
      wood.box(x0, 0.14, -0.04, x1, 2.5, 0.04, { tile: 0.8 });
      wood.tint(0.62, 0.52, 0.42, 1);
      for (const [y0, y1] of [[0.14, 0.34], [1.2, 1.36], [2.32, 2.52]]) wood.box(x0, y0, -0.085, x1, y1, 0.085, { tile: 0.8 });
      wood.box(sgn > 0 ? x1 - 0.16 : x0, 0.14, -0.085, sgn > 0 ? x1 : x0 + 0.16, 2.52, 0.085, { tile: 0.8 });
      wood.box(sgn > 0 ? x0 : x1 - 0.16, 0.14, -0.085, sgn > 0 ? x0 + 0.16 : x1, 2.52, 0.085, { tile: 0.8 });
    }
    wood.pop();
    iron.tint(0.08, 0.08, 0.08, 1);
    iron.place(p[0], y, p[1], yaw);
    for (const sgn of [-1, 1]) for (const hy of [0.5, 2.1]) iron.box(sgn * 1.98, hy, -0.11, sgn * 1.2, hy + 0.07, 0.11); // strap hinges
    iron.box(-0.3, 1.25, -0.12, 0.3, 1.33, 0.12); // the bar that keeps it shut
    iron.pop();
    // dry-stone walls from the pillars to the rock on both sides
    stone.tint(1, 0.98, 0.95, 1);
    for (const sgn of [-1, 1]) {
      const line = [];
      for (let t = 2.8; t <= 12; t += 1.3) {
        const x = p[0] + dz * sgn * t, z = p[1] - dx * sgn * t;
        line.push([x, z, this.ground(x, z) + 1.7]);
      }
      wall(stone, line, { thickness: 0.6, groundAt: this.ground, depth: 0.6, tile: 2 });
    }
    this.zone.colliders.push({ type: 'box', x: p[0], z: p[1], hw: 2.9, hl: 0.35, yaw });
  }

  _roads() {
    // asphalt ribbons, cut into stretches so that most of them are culled
    const CHUNK = 160;
    for (const p of this.data.meta.paths) {
      if (p.kind !== 'asphalt') continue;
      const inside = p.samples.filter((s) => Math.abs(s[0]) < 511 && Math.abs(s[1]) < 511);
      let from = 0, len = 0, total = 0;
      const lens = [0];
      for (let i = 1; i < inside.length; i++) lens.push((total += Math.hypot(inside[i][0] - inside[i - 1][0], inside[i][1] - inside[i - 1][1])));
      for (let i = 1; i < inside.length; i++) {
        len = lens[i] - lens[from];
        if (len < CHUNK && i < inside.length - 1) continue;
        const parts = new Parts();
        const road = parts.get('asphalt');
        road.tint(1, 1, 1, 1);
        roadRibbon(road, inside.slice(from, i + 1), p.width + 0.8, {
          groundAt: this.ground, tile: 3, feather: 0.7, endFade: 5, fadeStart: from === 0, fadeEnd: i === inside.length - 1, v0: lens[from],
        });
        const g = parts.toMeshes(this.world.materials, { name: `road-${p.id}` });
        g.userData.keep = true;
        this.zone.group.add(g);
        from = i;
      }
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
    pivot.userData.keep = true; // it turns: never merged with the static scenery
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
    const sg = st.toMeshes(this.world.materials, { name: 'mill-wheel-frame', layers: this.cast });
    const base = new THREE.Group();
    base.position.copy(pivot.position);
    base.rotation.y = fr.yaw;
    base.add(sg);
    this.zone.group.add(base);
    // white water: the sheet leaving the launder onto the floats, and the boil in the tail race below
    const foam = this.world.water.shared.uFoam;
    const tailY = this.stream('raceTail')[0][2] - pivot.position.y + 0.03;
    const sheet = [[R + 0.95, 0.02], [R + 0.3, 0.0], [R + 0.05, -0.04], [R - 0.08, -0.22], [R - 0.2, -0.6], [R - 0.38, -1.05], [R - 0.62, tailY]].map(([z, y]) => V(0, y, z));
    const falls = new THREE.Group();
    falls.position.copy(pivot.position);
    falls.rotation.y = fr.yaw;
    falls.userData.keep = true;
    falls.add(fallsRibbon(sheet, V(1, 0, 0), W * 0.86, foam, (i) => (i === 0 ? 0 : 1)));
    const boil = [1.5, 0.9, 0.2, -0.6, -1.5, -2.6].map((z) => V(0, tailY, z));
    falls.add(fallsRibbon(boil, V(1, 0, 0), W * 1.05, foam, (i) => [0, 0.9, 1, 0.8, 0.4, 0][i], true));
    this.zone.group.add(falls);
    falls.updateMatrixWorld(true);
  }
}
