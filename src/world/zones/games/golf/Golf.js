// Par for the Course: what is seen of it and how it is played. Its rules are in rules.js; here the nine beds are
// built — felt raised half a metre over the meadow on a painted timber skirt, in a kerb striped in the hole's
// colour, each with its tee, its cup and flag and a painted plate of its number, name and par — and each dressed
// as the place of the valley it takes after: the swan pond, the temple stairs and their waterfall, the mill, the
// floating stones, the golden dog, the big wheel of the pier, the island and its boulder. Round them: a path of
// planks, a rope round the acid, poles of bunting and bulbs, benches, tubs of flowers and a ticket kiosk by the
// gate. What moves (the swan, the paddles, the big wheels, the ball, the line of dots, the gauge, the putter) is
// drawn where the rules have it, with a handful of pooled meshes; a round is a session that drives the player (see
// PlayerController.driver). Nothing is built per frame.
import * as THREE from 'three';
import { Parts, MeshBuilder } from '../../../props/MeshBuilder.js';
import { surfaceMaterial } from '../../../../render/SurfaceMaterial.js';
import { LAYER } from '../../../../render/Shadows.js';
import { ANIM } from '../../../../player/Character.js';
import { canvasBoard } from '../Boards.js';
import { V, clamp, lerp, gateArch, stakeSign, worldClock } from '../gates.js';
import { GOLF, HOLES, GROUNDS, STAIRS, toWorld, toLocal, levelOf, feltAt, moverAt, gaugeOf, sightLine, startRound, stepRound, botInput, lineOf, formatScore } from './rules.js';

const R = GOLF.ball, TAU = Math.PI * 2, STEP = GOLF.step;
const FELT = [0.1, 0.66, 0.15], FELT2 = [0.09, 0.58, 0.16], TEE = [0.05, 0.4, 0.1], STONE = [1.1, 1.0, 0.9], CREAM = [1.65, 1.5, 1.2];
/** The colour of each hole: its kerb and skirt are striped in it and cream, its flag and the disc of its number are painted in it. */
const TONES = [[1.55, 0.15, 0.12], [0.3, 0.6, 1.55], [1.6, 1.15, 0.2], [0.2, 0.95, 0.4], [0.85, 0.35, 1.45], [1.6, 0.6, 0.12], [0.2, 0.45, 1.3], [0.6, 1.5, 0.2], [1.35, 0.2, 0.75]];
const DOTS = 44, KERB = 0.2, MOVERS = 96;
const mul = (c, k) => c.map((v) => v * k);

const hash2 = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7 + 74.7) * 43758.5453; return s - Math.floor(s); };
const orient = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; } return s > 0 ? 1 : -1; };

/** A simple polygon cut into triangles (indices), by ears; the points on a straight line are let go. */
function earClip(pts) {
  const sign = orient(pts), idx = pts.map((_, i) => i), out = [];
  const area = (a, b, c) => ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) * sign;
  const inside = (p, a, b, c) => area(a, b, p) > 1e-9 && area(b, c, p) > 1e-9 && area(c, a, p) > 1e-9;
  for (let guard = 0; idx.length > 3 && guard < 999; guard++) {
    let cut = false;
    for (let i = 0; i < idx.length && !cut; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length], ar = area(pts[a], pts[b], pts[c]);
      if (Math.abs(ar) < 1e-9) { idx.splice(i, 1); cut = true; } else if (ar > 0 && !idx.some((k) => k !== a && k !== b && k !== c && inside(pts[k], pts[a], pts[b], pts[c]))) { out.push([a, b, c]); idx.splice(i, 1); cut = true; }
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push([...idx]);
  return out;
}

/** The felt of a bed, in its own frame: as small triangles (so that its relief and its mottle have vertices to live on). `y(x, z)`: the felt there. */
function felt(b, bed, tone, y, maxEdge, shade) {
  const e = 0.02, tile = b.tile || 1;
  const vert = (p) => {
    const x = p[0], z = p[1], k = shade(x, z), n = new THREE.Vector3((y(x - e, z) - y(x + e, z)) / (2 * e), 1, (y(x, z - e) - y(x, z + e)) / (2 * e)).normalize();
    return b.vert(V(x, y(x, z), z), n, x / tile, z / tile, [tone[0] * k, tone[1] * k, tone[2] * k, 1]);
  };
  const emit = (a, c, d) => {
    const l = [[a, c], [c, d], [d, a]].map(([p, q]) => Math.hypot(p[0] - q[0], p[1] - q[1])), m = l.indexOf(Math.max(...l));
    if (l[m] > maxEdge) {
      const [p, q] = [[a, c], [c, d], [d, a]][m], r = [d, a, c][m], h = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      emit(p, h, r); emit(h, q, r);
      return;
    }
    // (facing up: the corners go round the way that makes the face look up)
    const up = (c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0]) < 0;
    const [i, j, k] = [a, up ? c : d, up ? d : c].map(vert);
    b.idx.push(i, j, k);
  };
  for (const [i, j, k] of earClip(bed.poly)) emit(bed.poly[i], bed.poly[j], bed.poly[k]);
}

/** A flat polygon (convex) that faces up (dir 1) or down (-1). */
function flat(b, pts, dir) {
  const n = new THREE.Vector3().crossVectors(pts[1].clone().sub(pts[0]), pts[2].clone().sub(pts[0]));
  b.poly(n.y * dir >= 0 ? pts : [...pts].reverse());
}

/** A quad a-b-c-d that shows its face towards (nx, nz). */
function wall(b, a, c, d, e, nx, nz) {
  const n = new THREE.Vector3().crossVectors(c.clone().sub(a), e.clone().sub(a));
  if (n.x * nx + n.z * nz >= 0) b.quad(a, c, d, e); else b.quad(a, e, d, c);
}

export class Golf {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'golf';
    this.session = null;
    this.best = 0;
    this.level = [];
    this.cam = null;
  }

  build() {
    const world = this.world, mats = world.materials, parts = new Parts(), g = GOLF, acidY = this.data.meta?.acid?.y ?? 27.94;
    const ground = (x, z) => this.data.heightAt(x, z);
    const B = { paint: parts.get('paint'), wood: parts.get('woodDark'), wp: parts.get('woodPaint'), deck: parts.get('woodDeck'), matte: parts.get('matte'), stone: parts.get('stone'), granite: parts.get('granite'), glow: parts.get('glow') };
    const all = Object.values(B);
    this._plates = [];
    for (const H of HOLES) {
      const lv = (this.level[H.n] = levelOf(H, ground)), tone = TONES[H.n];
      for (const b of all) b.place(H.at[0], lv, H.at[1], H.yaw);
      const wy = (bed, x, z) => bed.y + (bed.h ? bed.h(x, z) : 0);
      const below = (x, z) => { const w = toWorld(H, x, z); return ground(w[0], w[1]) - lv; }; // (the meadow there, from the felt of the tee)
      // ---- the felt, its striped kerbs, and the painted skirt under them down to the meadow
      for (const bed of H.beds) {
        const look = bed.look || 'felt', top = (x, z) => wy(bed, x, z) + 0.002;
        const maxEdge = bed.h ? 0.35 : 0.8, ftone = look === 'deck' ? [1.1, 0.8, 0.5] : bed.isle ? FELT2 : FELT;
        felt(look === 'deck' ? B.deck : B.paint, bed, ftone, top, maxEdge, (x, z) => (look === 'deck' ? 0.92 + 0.1 * hash2(Math.round(x * 5), Math.round(z * 2.2)) : 0.93 + 0.1 * hash2(Math.round(x * 4), Math.round(z * 4))));
        const sign = orient(bed.poly), floating = !H.acid && bed.air.length === bed.n;
        let stripe = 0;
        for (let k = 0; k < bed.n; k++) {
          const p = bed.poly[k], q = bed.poly[(k + 1) % bed.n], dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
          if (len < 1e-6) continue;
          const ux = dx / len, uz = dz / len, nx = sign > 0 ? uz : -uz, nz = sign > 0 ? -ux : ux;
          const air = bed.air.includes(k), kerb = !bed.open.includes(k), steps = Math.max(1, Math.round(len / (bed.h ? 0.35 : 0.5)));
          for (let i = 0; i < steps; i++, stripe++) {
            const t0 = i / steps, t1 = (i + 1) / steps, ax = p[0] + dx * t0, az = p[1] + dz * t0, cx = p[0] + dx * t1, cz = p[1] + dz * t1;
            const y0 = wy(bed, ax, az), y1 = wy(bed, cx, cz), odd = stripe % 2;
            if (kerb) {
              const e = 0.1, o = KERB / 2;
              B.wp.tint(...(odd ? CREAM : tone), 1).beam(V(ax + nx * o - ux * e * (i === 0), y0 + 0.03, az + nz * o - uz * e * (i === 0)), V(cx + nx * o + ux * e * (i === steps - 1), y1 + 0.03, cz + nz * o + uz * e * (i === steps - 1)), KERB, 0.22);
            }
            // the board under it, down to the meadow (a plank over the acid and a floating stone are thin slabs; the island stands in the pond)
            const off = kerb ? KERB : 0, sx0 = ax + nx * off, sz0 = az + nz * off, sx1 = cx + nx * off, sz1 = cz + nz * off;
            let d0, d1;
            if (air) { d0 = bed.isle ? acidY - lv - 0.4 : y0 - 0.22; d1 = bed.isle ? acidY - lv - 0.4 : y1 - 0.22; } else { d0 = Math.min(y0 - 0.3, below(sx0, sz0) - 0.15); d1 = Math.min(y1 - 0.3, below(sx1, sz1) - 0.15); }
            const skirt = look === 'deck' ? B.deck.tint(0.8, 0.55, 0.35, 1) : look === 'stone' || bed.isle ? B.stone.tint(...STONE, 1) : B.wp.tint(...(odd ? mul(CREAM, 0.85) : mul(tone, 0.85)), 1);
            wall(skirt, V(sx0, y0 - 0.08, sz0), V(sx1, y1 - 0.08, sz1), V(sx1, d1, sz1), V(sx0, d0, sz0), nx, nz);
            if (!air && !kerb) continue;
            // (a gold line along the top of the skirt)
            if (!air && look === 'felt') B.paint.tint(1.6, 1.15, 0.3, 1).beam(V(sx0 - nx * 0.01, y0 - 0.12, sz0 - nz * 0.01), V(sx1 - nx * 0.01, y1 - 0.12, sz1 - nz * 0.01), 0.03, 0.05);
          }
        }
        if (look === 'deck' && bed.air.length) flat(B.deck.tint(0.5, 0.35, 0.22, 1), bed.poly.map((p) => V(p[0], wy(bed, p[0], p[1]) - 0.22, p[1])), -1);
        if (floating) {
          // a stone of Mostly Up: rock under it, to a point, and nothing holding it
          const cx = (bed.x0 + bed.x1) / 2, cz = (bed.z0 + bed.z1) / 2, tip = V(cx + 0.1, bed.y - 1.0, cz - 0.1), ring = bed.poly.map((p) => V(p[0] + Math.sign(p[0] - cx) * KERB, bed.y - 0.22, p[1] + Math.sign(p[1] - cz) * 0.02));
          B.granite.tint(0.95, 0.9, 0.85, 1);
          for (let k = 0; k < ring.length; k++) B.granite.tri(ring[(k + 1) % ring.length], ring[k], tip).tri(ring[k], ring[(k + 1) % ring.length], tip);
        }
        if (look === 'deck' && !bed.air.length) {
          // the pier stands on posts
          for (let z = bed.z1 - 0.4; z > bed.z0; z -= 2.2) for (const x of [bed.x0 - 0.1, bed.x1 + 0.1]) { const d = below(x, z); B.wood.tint(0.7, 0.55, 0.42, 1).cylinder(x, d - 0.2, z, 0.1, 0.1, -d + 0.05, 6); }
        }
      }
      // ---- the tee: a darker mat with two white markers; the cup: a dark disc in a ring of steel, a pole and a pennant in the hole's colour
      const ty = feltAt(H, 0, 0) + 0.004;
      flat(B.paint.tint(...TEE, 1), [V(-0.42, ty, 0.5), V(-0.42, ty, -0.5), V(0.42, ty, -0.5), V(0.42, ty, 0.5)], 1);
      for (const s of [-1, 1]) B.paint.tint(1.7, 1.7, 1.7, 1).cylinder(s * 0.6, ty - 0.02, -0.55, 0.035, 0.03, 0.13, 8);
      const cy = feltAt(H, H.cup[0], H.cup[1]);
      B.matte.tint(0.03, 0.03, 0.03, 1).place(H.cup[0], cy + 0.006, H.cup[1]).lathe([[g.cup, 0], [0.001, 0]], 18).pop();
      B.matte.tint(1.4, 1.4, 1.5, 1).place(H.cup[0], cy, H.cup[1]).lathe([[g.cup + 0.07, 0], [g.cup + 0.06, 0.014], [g.cup, 0.014]], 18).pop();
      const pole = [H.cup[0] + 0.02, cy, H.cup[1]];
      for (let k = 0; k < 4; k++) B.paint.tint(...(k % 2 ? tone : CREAM), 1).cylinder(pole[0], cy + k * 0.29, pole[2], 0.016, 0.014, 0.29, 6);
      const fa = V(pole[0], cy + 1.12, pole[2]), fb = V(pole[0], cy + 0.8, pole[2]), fc = V(pole[0] + 0.42, cy + 0.96, pole[2] - 0.05);
      B.paint.tint(...tone, 1).tri(fa, fb, fc).tri(fa, fc, fb);
      // ---- the water, the button, the boards of the island
      for (const [x, z, r] of H.pools) {
        const y = feltAt(H, x, z) + 0.006;
        B.paint.tint(0.15, 0.45, 1.1, 1).place(x, y, z).lathe([[r, 0], [0.001, 0]], 28).pop();
        B.paint.tint(0.5, 0.85, 1.4, 1).place(x, y + 0.002, z).lathe([[r * 0.7, 0], [r * 0.62, 0]], 28).pop();
        for (let k = 0; k < 22; k++) { const a = (k / 22) * TAU; B.stone.tint(1.4, 1.35, 1.25, 1).box(x + Math.sin(a) * (r + 0.05) - 0.05, y - 0.01, z + Math.cos(a) * (r + 0.05) - 0.05, x + Math.sin(a) * (r + 0.05) + 0.05, y + 0.03, z + Math.cos(a) * (r + 0.05) + 0.05); }
        for (const [a, d] of [[0.5, 0.55], [2.2, 0.4], [4.1, 0.62]]) B.paint.tint(0.25, 0.9, 0.3, 1).place(x + Math.sin(a) * d * r, y + 0.004, z + Math.cos(a) * d * r).lathe([[0.13, 0], [0.001, 0]], 7).pop();
      }
      for (const [x, z, r] of H.bumpers) {
        const y = feltAt(H, x, z);
        B.paint.tint(1.6, 1.25, 0.15, 1).cylinder(x, y, z, r + 0.07, r + 0.05, 0.1, 16);
        B.matte.tint(0.1, 0.1, 0.12, 1).cylinder(x, y + 0.1, z, r + 0.02, r + 0.02, 0.05, 16);
        B.paint.tint(1.7, 0.12, 0.1, 1).place(x, y + 0.15, z).lathe([[r, 0], [r * 0.98, 0.1], [r * 0.85, 0.2], [r * 0.5, 0.27], [0.001, 0.29]], 16).pop();
      }
      if (H.n === 8) for (const [ax, az, bx, bz, high] of H.walls) { const bed = H.beds.find((q) => q.isle), y = wy(bed, ax, az); B.wp.tint(...(Math.round(ax * 3) % 2 ? CREAM : tone), 1).beam(V(ax, y + high / 2, az), V(bx, y + high / 2, bz), 0.1, high); }
      this._decor(H, B, lv, wy, below, tone);
      for (const b of all) b.pop();
      // ---- the plate of the hole, on two posts at the left of its tee: its number, its name and its par
      const bed0 = H.beds[0], px = bed0.x0 - 0.62, pz = 0.6, pw = toWorld(H, px, pz), gy = ground(pw[0], pw[1]), yc = Math.max(gy, lv) + 0.85;
      for (const s of [-1, 1]) { const q = toWorld(H, px + s * 0.5, pz + 0.02); B.wood.tint(0.55, 0.4, 0.3, 1).cylinder(q[0], ground(q[0], q[1]) - 0.3, q[1], 0.045, 0.04, yc - ground(q[0], q[1]) + 0.3, 6); }
      this._plates.push([pw[0], yc, pw[1], H.yaw, 1.3, 0.52, H.n]);
    }
    this._grounds(B, ground, acidY);
    // ---- the arch where one asks to play
    const gt = g.gate, gy = this.data.heightAt(gt.x, gt.z);
    this.gate = { x: gt.x, y: gy, z: gt.z, yaw: gt.yaw };
    this.boardSpot = { x: g.stand.x, z: g.stand.z, yaw: g.stand.yaw, y: this.data.heightAt(g.stand.x, g.stand.z) };
    gateArch(this.group, B.paint, gt.x, gy, gt.z, gt.yaw, g.name.toUpperCase(), 'NINE HOLES OF CRAZY GOLF ROUND THE ACID POND', { tone: [0.2, 1.1, 0.35], ink: '#0e2a16' });
    this.group.add(parts.toMeshes(mats, { name: 'golf-course', layers: [LAYER.STATIC_CASTER] }));
    this.group.add(this._signs());
    this._pool();
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    return this;
  }

  /** What makes each hole the place of the valley it takes after: the mill, the temple, the dog, the big wheel… (in the hole's frame, from the felt of its tee). */
  _decor(H, B, lv, wy, below, tone) {
    const bed = H.beds[0], gold = [1.75, 1.05, 0.12];
    if (H.n === 2) {
      // the stairs: a white nosing at the top of each step; the temple behind the cup; the waterfall down the rock at the left
      for (const z of STAIRS) { const y = wy(bed, 0, z - 0.42) + 0.004; flat(B.paint.tint(1.7, 1.65, 1.5, 1), [V(-1.3, y, z - 0.36), V(-1.3, y, z - 0.44), V(1.3, y, z - 0.44), V(1.3, y, z - 0.36)], 1); }
      const ty = wy(bed, 0, -12.5), z0 = -13.0;
      B.stone.tint(1.25, 1.2, 1.1, 1).box(-1.4, below(0, z0) - 0.2, z0 - 1.1, 1.4, ty + 0.1, z0 + 0.15);
      for (const x of [-1.15, -0.4, 0.4, 1.15]) B.paint.tint(1.7, 1.65, 1.5, 1).cylinder(x, ty + 0.1, z0 - 0.45, 0.11, 0.09, 1.25, 10);
      B.paint.tint(1.7, 1.65, 1.5, 1).box(-1.35, ty + 1.35, z0 - 0.75, 1.35, ty + 1.5, z0 - 0.1);
      const a = V(-1.4, ty + 1.5, z0 - 0.05), b = V(1.4, ty + 1.5, z0 - 0.05), c = V(0, ty + 2.0, z0 - 0.05), a2 = V(-1.4, ty + 1.5, z0 - 0.8), b2 = V(1.4, ty + 1.5, z0 - 0.8), c2 = V(0, ty + 2.0, z0 - 0.8);
      B.paint.tint(...gold, 1).tri(a, b, c).tri(b2, a2, c2).quad(b, b2, c2, c).quad(a2, a, c, c2);
      // (the waterfall: a rock at the left of the top step, the water down its face into a pool on the meadow)
      const wx = -2.3, wz = -10.6, foot = below(wx, wz);
      B.granite.tint(0.9, 0.85, 0.8, 1).box(wx - 0.55, foot - 0.2, wz - 1.6, wx + 0.35, ty + 1.3, wz - 0.7);
      B.paint.tint(0.55, 0.9, 1.6, 1).quad(V(wx + 0.37, foot + 0.02, wz - 0.85), V(wx + 0.37, foot + 0.02, wz - 1.45), V(wx + 0.37, ty + 1.25, wz - 1.4), V(wx + 0.37, ty + 1.25, wz - 0.9));
      B.paint.tint(0.25, 0.6, 1.4, 1).place(wx + 0.75, foot + 0.04, wz - 1.15).lathe([[0.55, 0], [0.001, 0]], 14).pop();
    } else if (H.n === 3) {
      // the mill: its two walls of stone either side of the door, a lintel and a red roof; the axle of its wheel on two posts
      const [L, R2] = H.blocks, m = H.movers[0];
      for (const [x0, z0, x1, z1, high] of [L, R2]) B.stone.tint(...STONE, 1).box(x0, wy(bed, x0, z0), z0, x1, high, z1);
      B.stone.tint(...STONE, 1).box(-0.35, 0.55, L[1], 0.35, L[4], L[3]);
      B.wp.tint(0.95, 0.65, 0.4, 1).box(-0.38, 0.5, L[3] - 0.02, 0.38, 0.58, L[3] + 0.04);
      const r0 = V(-1.55, 1.3, L[1] - 0.15), r1 = V(1.55, 1.3, L[1] - 0.15), r2 = V(1.55, 1.3, L[3] + 0.15), r3 = V(-1.55, 1.3, L[3] + 0.15), ridge0 = V(-1.55, 2.05, (L[1] + L[3]) / 2), ridge1 = V(1.55, 2.05, (L[1] + L[3]) / 2);
      B.paint.tint(1.45, 0.25, 0.2, 1).quad(r3, r2, ridge1, ridge0).quad(r1, r0, ridge0, ridge1).tri(r0, r3, ridge0).tri(r2, r1, ridge1);
      for (const s of [-1, 1]) B.wood.tint(0.6, 0.45, 0.32, 1).box(s * 1.45 - 0.07, 0, m.z - 0.07, s * 1.45 + 0.07, m.up + 0.1, m.z + 0.07);
      B.matte.tint(0.45, 0.4, 0.35, 1).rod(V(-1.5, m.up, m.z), V(1.5, m.up, m.z), 0.05, 8);
      // (the race: water along the foot of the wall)
      B.paint.tint(0.25, 0.6, 1.4, 1).box(1.52, below(1.8, -2) + 0.02, -6.5, 2.1, below(1.8, -2) + 0.08, -1.5);
    } else if (H.n === 5) {
      // the golden dog, standing over the lane: its paws on the two blocks, the ball goes between its legs; its bowl beyond
      const [L, R2] = H.blocks, zc = (L[1] + L[3]) / 2, y0 = wy(bed, 0, zc);
      for (const [x0, z0, x1, z1] of [L, R2]) B.paint.tint(...mul(gold, 0.8), 1).box(x0, y0, z0, x1, y0 + 0.25, z1);
      for (const x of [-0.85, 0.85]) for (const dz of [-0.2, 0.2]) B.paint.tint(...gold, 1).box(x - 0.1, y0 + 0.2, zc + dz - 0.09, x + 0.1, y0 + 1.15, zc + dz + 0.09);
      B.paint.tint(...gold, 1).box(-1.05, y0 + 1.05, zc - 0.33, 1.05, y0 + 1.55, zc + 0.33);
      B.paint.tint(...gold, 1).box(-1.5, y0 + 1.35, zc - 0.25, -0.95, y0 + 1.85, zc + 0.25).box(-1.85, y0 + 1.4, zc - 0.14, -1.45, y0 + 1.65, zc + 0.14);
      B.matte.tint(0.08, 0.06, 0.05, 1).box(-1.9, y0 + 1.53, zc - 0.06, -1.82, y0 + 1.62, zc + 0.06);
      for (const s of [-1, 1]) B.paint.tint(...mul(gold, 0.85), 1).box(-1.3, y0 + 1.8, zc + s * 0.2 - 0.05, -1.12, y0 + 2.1, zc + s * 0.2 + 0.05);
      B.paint.tint(...gold, 1).beam(V(1.0, y0 + 1.45, zc), V(1.45, y0 + 1.95, zc), 0.1, 0.1);
      B.paint.tint(1.6, 0.2, 0.2, 1).box(-1.08, y0 + 1.38, zc - 0.34, -0.98, y0 + 1.48, zc + 0.34);
      const bx = 0, bz = -6.7, by = wy(bed, bx, bz);
      B.paint.tint(1.5, 0.2, 0.18, 1).place(bx, by, bz).lathe([[0.24, 0], [0.27, 0.2], [0.21, 0.22], [0.19, 0.12], [0.001, 0.12]], 8).pop();
    } else if (H.n === 6) {
      // the big wheels: their feet on the two blocks either side of the lane, an A of struts up to the axle (the rest turns)
      for (const m of H.movers) {
        for (const s of [-1, 1]) {
          B.paint.tint(1.6, 1.6, 1.6, 1).box(s * 0.55 - (s > 0 ? 0 : 0.65), 0, m.z - 0.15, s * 0.55 + (s > 0 ? 0.65 : 0), 0.9, m.z + 0.15);
          for (const dz of [-1, 1]) B.paint.tint(...tone, 1).rod(V(s * 0.875, 0.85, m.z + dz * 0.12), V(s * 0.06, m.up, m.z + dz * 0.3), 0.05, 6);
        }
        B.matte.tint(0.6, 0.6, 0.65, 1).rod(V(0, m.up, m.z - 0.34), V(0, m.up, m.z + 0.34), 0.07, 8);
      }
      // (bulbs along the rails of the pier)
      for (let z = bed.z1 + 0.2; z < bed.z0; z += 0.8) for (const x of [bed.x0 - 0.1, bed.x1 + 0.1]) B.glow.tint(1.6, 1.4, 0.7, 1).cylinder(x, 0.17, z, 0.04, 0.04, 0.07, 5);
    } else if (H.n === 8) {
      // the island's boulder, come to rest on a rock behind the boards
      const by = H.beds[1].y;
      B.granite.tint(0.8, 0.78, 0.72, 1).place(0.2, by - 0.5, -12.4).lathe([[0.75, 0], [0.7, 0.3], [0.45, 0.5], [0.001, 0.55]], 9).pop();
      B.granite.tint(1.05, 1.0, 0.95, 1).place(0.2, by + 0.05, -12.4).lathe([[0.001, 0], [0.4, 0.1], [0.55, 0.5], [0.4, 0.92], [0.001, 1.03]], 10).pop();
    }
  }

  /** The grounds: the path of planks, the rope round the acid, the poles of bunting and bulbs, benches, tubs of flowers and the ticket kiosk. */
  _grounds(B, ground, acidY) {
    const P = GROUNDS, A = GOLF.acid;
    // the path: a low walk of planks over the grass, on two runners, every 30 cm a plank
    let k = 0;
    const UP = 0.3;
    for (const line of P.path) for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1], [bx, bz] = line[i], l = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / l, uz = (bz - az) / l;
      for (const sd of [-0.3, 0.3]) { const p0 = V(ax - uz * sd, 0, az + ux * sd), p1 = V(bx - uz * sd, 0, bz + ux * sd); p0.y = ground(p0.x, p0.z) + UP - 0.12; p1.y = ground(p1.x, p1.z) + UP - 0.12; B.wood.tint(0.55, 0.42, 0.32, 1).beam(p0, p1, 0.1, 0.24); }
      for (let d = 0.15; d < l; d += 0.3, k++) {
        const x = ax + ux * d, z = az + uz * d, w = 0.42 + 0.04 * hash2(k, 3), s = 0.02 * (hash2(k, 7) - 0.5);
        const p0 = V(x - uz * w + ux * s, 0, z + ux * w + uz * s), p1 = V(x + uz * w - ux * s, 0, z - ux * w - uz * s);
        p0.y = ground(x, z) + UP + 0.01; p1.y = p0.y;
        const t = 0.85 + 0.25 * hash2(k, 1);
        B.deck.tint(1.05 * t, 0.8 * t, 0.55 * t, 1).beam(p0, p1, 0.24, 0.07);
      }
    }
    // the rope round the acid: stakes and a sagging rope between them, but where a hole crosses it
    const near = (x, z) => HOLES.some((H) => { const l = toLocal(H, x, z); return [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]].some(([dx, dz]) => feltAt(H, l[0] + dx, l[1] + dz) > -Infinity); });
    const rr = A.r + 1.65, stakes = [];
    for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU, x = A.x + Math.sin(a) * rr, z = A.z + Math.cos(a) * rr; stakes.push(near(x, z) ? null : V(x, ground(x, z), z)); }
    stakes.forEach((p, i) => {
      if (!p) return;
      B.wp.tint(...(i % 2 ? CREAM : [1.5, 0.2, 0.18]), 1).cylinder(p.x, p.y - 0.2, p.z, 0.04, 0.035, 0.8, 6);
      const q = stakes[(i + 1) % stakes.length];
      if (q) { const m = V((p.x + q.x) / 2, (p.y + q.y) / 2 + 0.42, (p.z + q.z) / 2); B.matte.tint(1.4, 1.2, 0.8, 1).rod(V(p.x, p.y + 0.55, p.z), m, 0.015, 4).rod(m, V(q.x, q.y + 0.55, q.z), 0.015, 4); }
    });
    // the poles, and the bunting with its bulbs from one to the next
    const top = P.poles.map(([x, z]) => V(x, ground(x, z) + 3.05, z));
    for (const [i, [x, z]] of P.poles.entries()) {
      const y = ground(x, z);
      for (let h = 0; h < 3.1; h += 0.45) B.wp.tint(...(Math.round(h / 0.45) % 2 ? CREAM : [1.5, 0.2, 0.18]), 1).cylinder(x, y - 0.3 + h, z, 0.06, 0.06, Math.min(0.45, 3.2 - h), 7);
      B.paint.tint(1.7, 1.25, 0.3, 1).place(x, y + 3.1, z).lathe([[0.001, 0.22], [0.08, 0.17], [0.1, 0.08], [0.06, 0], [0.001, -0.01]], 7).pop();
    }
    const FLAG = [[1.6, 0.2, 0.18], [1.7, 1.4, 0.2], [0.25, 0.55, 1.5], [0.3, 1.2, 0.35], [1.6, 1.5, 1.3]];
    let f = 0;
    for (const run of P.runs) for (let i = 1; i < run.length; i++) {
      const a = top[run[i - 1]], b = top[run[i]], n = Math.max(2, Math.round(a.distanceTo(b) / 0.42));
      const at = (t) => V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - 0.55 * 4 * t * (1 - t), a.z + (b.z - a.z) * t);
      for (let j = 0; j < n; j++, f++) {
        const p = at(j / n), q = at((j + 1) / n), m = V((p.x + q.x) / 2, (p.y + q.y) / 2 - 0.3, (p.z + q.z) / 2);
        B.matte.tint(0.9, 0.85, 0.75, 1).rod(p, q, 0.012, 3);
        const fp = p.clone().lerp(q, 0.12), fq = p.clone().lerp(q, 0.88);
        B.paint.tint(...FLAG[f % FLAG.length], 1).tri(fp, fq, m).tri(fq, fp, m);
        if (j % 2) B.glow.tint(1.8, 1.6, 0.8, 1).cylinder(p.x, p.y - 0.08, p.z, 0.035, 0.045, 0.08, 5);
      }
    }
    // benches, tubs of flowers
    for (const [x, z, h] of P.benches) {
      const b = B.wp.place(x, ground(x, z), z, h);
      b.tint(0.3, 0.7, 0.35, 1).box(-0.8, 0.42, -0.22, 0.8, 0.48, 0.2).box(-0.8, 0.55, 0.2, 0.8, 0.85, 0.25);
      b.tint(0.35, 0.28, 0.22, 1);
      for (const s of [-1, 1]) b.box(s * 0.68 - 0.05, -0.2, -0.2, s * 0.68 + 0.05, 0.42, 0.18).box(s * 0.68 - 0.05, 0.42, 0.2, s * 0.68 + 0.05, 0.85, 0.24);
      b.pop();
    }
    for (const [i, [x, z]] of P.tubs.entries()) {
      const y = ground(x, z);
      B.wp.tint(...(i % 2 ? [0.25, 0.5, 1.4] : [1.5, 0.25, 0.2]), 1).place(x, y - 0.1, z).lathe([[0.26, 0], [0.34, 0.5], [0.37, 0.52], [0.3, 0.52], [0.001, 0.46]], 10).pop();
      for (let j = 0; j < 7; j++) { const a = j * 2.4 + i, r = j ? 0.18 : 0, fx = x + Math.sin(a) * r, fz = z + Math.cos(a) * r; B.paint.tint(0.2, 0.75, 0.25, 1).cylinder(fx, y + 0.4, fz, 0.012, 0.012, 0.25 + 0.1 * (j % 3), 3); B.paint.tint(...FLAG[(i + j) % 4], 1).box(fx - 0.05, y + 0.62 + 0.1 * (j % 3), fz - 0.05, fx + 0.05, y + 0.72 + 0.1 * (j % 3), fz + 0.05); }
    }
    // the ticket kiosk beside the gate: a striped booth, its window and counter to those who come, a pointed roof with bulbs
    const [kx, kz, kh] = P.kiosk, ky = ground(kx, kz), K = B.wp.place(kx, ky, kz, kh);
    for (let i = 0; i < 6; i++) K.tint(...(i % 2 ? CREAM : [1.5, 0.2, 0.18]), 1).box(-0.7 + i * (1.4 / 6), -0.2, -0.6, -0.7 + (i + 1) * (1.4 / 6), 2.1, 0.6, { faces: 'xXzZ' });
    K.tint(0.12, 0.1, 0.18, 1).box(-0.5, 0.95, -0.62, 0.5, 1.55, -0.58);
    K.tint(1.6, 1.2, 0.35, 1).box(-0.6, 0.9, -0.8, 0.6, 0.96, -0.6);
    K.pop();
    const roof = [[-0.85, -0.75], [0.85, -0.75], [0.85, 0.75], [-0.85, 0.75]], apex = V(0, 3.0, 0), R = B.paint.place(kx, ky, kz, kh);
    for (let i = 0; i < 4; i++) {
      const [ax, az] = roof[i], [bx, bz] = roof[(i + 1) % 4];
      for (let j = 0; j < 4; j++) { const p = V(ax + ((bx - ax) * j) / 4, 2.1, az + ((bz - az) * j) / 4), q = V(ax + ((bx - ax) * (j + 1)) / 4, 2.1, az + ((bz - az) * (j + 1)) / 4); R.tint(...(j % 2 ? CREAM : [1.5, 0.2, 0.18]), 1).tri(q, p, apex); }
    }
    R.tint(1.7, 1.25, 0.3, 1).box(-0.85, 2.0, -0.75, 0.85, 2.1, 0.75).pop();
    const G = B.glow.place(kx, ky, kz, kh);
    for (let i = 0; i < 4; i++) { const [ax, az] = roof[i], [bx, bz] = roof[(i + 1) % 4]; for (let j = 0; j < 4; j++) G.tint(1.8, 1.6, 0.8, 1).cylinder(ax + ((bx - ax) * (j + 0.5)) / 4, 1.95, az + ((bz - az) * (j + 0.5)) / 4, 0.035, 0.045, 0.07, 5); }
    G.pop();
    this._plates.push([kx - Math.sin(kh) * 0.64, ky + 1.83, kz - Math.cos(kh) * 0.64, kh + Math.PI, 1.3, 0.5, 9]);
  }

  /** The painted plates — the nine numbers of the holes and the kiosk's — on one canvas: a single mesh. */
  _signs() {
    const W = 1024, CW = 512, CH = 204.8, canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = W;
    const ctx = canvas.getContext('2d');
    const css = (c) => `rgb(${c.map((v) => Math.round(Math.min(255, v * 150))).join(',')})`;
    for (let n = 0; n < 10; n++) {
      const x0 = (n % 2) * CW, y0 = Math.floor(n / 2) * CH, H = HOLES[n];
      ctx.fillStyle = '#1b1440'; ctx.fillRect(x0, y0, CW, CH);
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 8; ctx.strokeRect(x0 + 8, y0 + 8, CW - 16, CH - 16);
      ctx.textBaseline = 'middle';
      if (!H) {
        ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.font = "700 74px Georgia, 'Times New Roman', serif"; ctx.fillText('TICKETS', x0 + CW / 2, y0 + 78, CW - 50);
        ctx.fillStyle = '#f2c14e'; ctx.font = '600 30px system-ui, sans-serif'; ctx.fillText('A ROUND OF NINE · FREE TODAY', x0 + CW / 2, y0 + 150, CW - 50);
        continue;
      }
      ctx.fillStyle = css(TONES[n]); ctx.beginPath(); ctx.arc(x0 + 100, y0 + CH / 2, 72, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#f6e7b8'; ctx.lineWidth = 6; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = '800 92px system-ui, sans-serif'; ctx.fillText(String(n + 1), x0 + 100, y0 + CH / 2 + 4);
      ctx.textAlign = 'left'; ctx.fillStyle = '#f6e7b8'; ctx.font = "700 40px Georgia, 'Times New Roman', serif"; ctx.fillText(H.name.replace(/^The /, '').toUpperCase(), x0 + 190, y0 + 62, CW - 215);
      ctx.fillStyle = '#f2c14e'; ctx.font = '700 40px system-ui, sans-serif'; ctx.fillText(`PAR ${H.par}`, x0 + 190, y0 + 116, CW - 215);
      ctx.fillStyle = '#b9b2d8'; ctx.font = 'italic 24px Georgia, serif'; ctx.fillText(`after ${H.place}`, x0 + 190, y0 + 160, CW - 215);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const pos = [], uv = [], idx = [];
    for (const [x, y, z, yaw, w, h, n] of this._plates) {
      const u0 = (n % 2) * 0.5, u1 = u0 + 0.5, v1 = 1 - (Math.floor(n / 2) * CH) / W, v0 = v1 - CH / W, c = Math.cos(yaw), s = Math.sin(yaw);
      const at = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
      for (const [side, dz] of [[1, 0.012], [-1, -0.012]]) {
        const b = pos.length / 3, l = (-w / 2) * side, r = (w / 2) * side;
        pos.push(...at(l, -h / 2, dz), ...at(r, -h / 2, dz), ...at(r, h / 2, dz), ...at(l, h / 2, dz));
        uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    mesh.name = 'golf-plates';
    return mesh;
  }

  /** What moves and what is only there while one plays: made once, put where it is each frame. */
  _pool() {
    const mats = this.world.materials;
    // the swan, the paddles of the mill wheel, the big wheels and their gondolas: instances of one box
    const box = new MeshBuilder().tint(1, 1, 1, 1).box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5).build();
    const flat = surfaceMaterial({ name: 'golf-movers', rough: 0.6, spec: 0.25 });
    this.movers = new THREE.InstancedMesh(box, flat, MOVERS);
    this.movers.name = 'golf-movers'; this.movers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.movers.boundingSphere = new THREE.Sphere(V(-232, 28, -88), 40);
    this.movers.setColorAt(0, new THREE.Color(1, 1, 1));
    this.group.add(this.movers);
    // the ball (white, a ring of light under it) and the dots of the aim
    const ball = new MeshBuilder().tint(1.9, 1.9, 1.9, 1), prof = [];
    for (let k = 0; k <= 8; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 8; prof.push([Math.max(0.001, R * Math.cos(a)), R * Math.sin(a)]); }
    ball.lathe(prof, 14);
    this.ball = new THREE.Mesh(ball.build(), surfaceMaterial({ name: 'golf-ball', rough: 0.35, spec: 0.5 }));
    this.ball.scale.setScalar(1.5); this.ball.name = 'golf-ball'; this.ball.frustumCulled = false; this.ball.visible = false;
    const ring = new MeshBuilder().tint(1, 1, 1, 1);
    for (let k = 0; k < 20; k++) { const a = (k / 20) * TAU, b = ((k + 1) / 20) * TAU, r0 = 0.2, r1 = 0.27; ring.quad(V(Math.sin(a) * r0, 0, Math.cos(a) * r0), V(Math.sin(a) * r1, 0, Math.cos(a) * r1), V(Math.sin(b) * r1, 0, Math.cos(b) * r1), V(Math.sin(b) * r0, 0, Math.cos(b) * r0)); }
    const glow = surfaceMaterial({ name: 'golf-glow', rough: 1, spec: 0, emissive: [1.7, 1.6, 1.0] });
    this.ring = new THREE.Mesh(ring.build(), glow);
    this.ring.name = 'golf-ring'; this.ring.frustumCulled = false; this.ring.visible = false;
    const dot = new MeshBuilder().tint(1, 1, 1, 1);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, b = ((k + 1) / 8) * TAU; dot.tri(V(0, 0, 0), V(Math.sin(a) * 0.06, 0, Math.cos(a) * 0.06), V(Math.sin(b) * 0.06, 0, Math.cos(b) * 0.06)); }
    this.dots = new THREE.InstancedMesh(dot.build(), glow, DOTS);
    this.dots.name = 'golf-dots'; this.dots.frustumCulled = false; this.dots.count = 0; this.dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dots.setColorAt(0, new THREE.Color(1, 1, 1));
    this.group.add(this.ball, this.ring, this.dots);
    // the gauge: a board that faces the camera, over the ball
    this.gauge = canvasBoard(256, 56, (ctx, w, h) => this._paintGauge(ctx, w, h), 1.7, 0.372);
    this.gauge.mesh.material.transparent = true; this.gauge.mesh.name = 'golf-gauge'; this.gauge.mesh.visible = false; this.gauge.mesh.renderOrder = 30; this.gauge.mesh.material.depthTest = false; this.gauge.mesh.frustumCulled = false;
    this.group.add(this.gauge.mesh);
    this._shown = { p: -1, far: -1 };
    // the putter: a shaft and a head, swung round a pivot at the hand
    const pt = new Parts(), shaft = pt.get('matte'), head = pt.get('paint');
    shaft.tint(0.9, 0.9, 1.0, 1).rod(V(0, 0, 0), V(0, -0.84, 0.04), 0.017, 6);
    head.tint(1.45, 0.3, 0.25, 1).box(-0.035, -0.9, -0.05, 0.035, -0.82, 0.13);
    this.putter = pt.toMeshes(mats, { name: 'golf-putter' });
    this.putter.visible = false;
    this.group.add(this.putter);
  }

  _paintGauge(ctx, w, h) {
    const p = this._shown ? Math.max(0, this._shown.p) : 0;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(10,18,12,0.82)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(2, 2, w - 4, h - 4, 12) : ctx.rect(2, 2, w - 4, h - 4); ctx.fill();
    ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 3; ctx.stroke();
    const x0 = 14, x1 = w - 14, y0 = 14, y1 = h - 14, grad = ctx.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, '#38d66b'); grad.addColorStop(0.6, '#f2e24e'); grad.addColorStop(1, '#ef4a3a');
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = grad; ctx.fillRect(x0, y0, (x1 - x0) * p, y1 - y0);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x0 + (x1 - x0) * p - 3, 6, 6, h - 12);
  }

  setBest(n) { this.best = n || 0; }
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.5 * 2.5; }

  /** The felt of hole `n` as the world has it: its place in metres over the sea of a spot of the hole's frame. */
  _at(H, x, z, out = V(0, 0, 0)) { const w = toWorld(H, x, z), f = feltAt(H, x, z); return out.set(w[0], this.level[H.n] + (f > -Infinity ? f : 0), w[1]); }

  /** What goes by the clock: the swan, the mill wheel, the big wheels — in the state of a round, or on the clock of the world. */
  _movers(tw) {
    const m = _m, q = _q, e = _e, p = _p, s = _s, col = _c, M = this.movers;
    let n = 0;
    const put = (H, x, y, z, sx, sy, sz, pitch, roll, tone) => {
      if (n >= MOVERS) return;
      const w = toWorld(H, x, z);
      p.set(w[0], this.level[H.n] + y, w[1]);
      q.setFromEuler(e.set(0, H.yaw, 0)); q.multiply(_r.setFromAxisAngle(_x, pitch)); q.multiply(_r.setFromAxisAngle(_z, roll));
      m.compose(p, q, s.set(sx, sy, sz));
      M.setMatrixAt(n, m); M.setColorAt(n, col.setRGB(tone[0], tone[1], tone[2])); n++;
    };
    const WHITE = [1.8, 1.8, 1.75], CABIN = [[1.6, 0.2, 0.18], [1.7, 1.35, 0.2], [0.25, 0.55, 1.5], [0.3, 1.2, 0.35], [0.9, 0.35, 1.4], [1.6, 0.6, 0.12]];
    for (const H of HOLES) for (const mv of H.movers) {
      const v = moverAt(mv, tw, _mv), y0 = feltAt(H, mv.x0 || 0, mv.z);
      if (mv.look === 'swan') {
        // a swan: its body, its neck and head towards where it goes, an orange beak
        const d = v.ux >= 0 ? 1 : -1;
        put(H, v.x, y0 + 0.11, v.z, 0.5, 0.18, 0.28, 0, 0, WHITE);
        put(H, v.x - d * 0.24, y0 + 0.2, v.z, 0.12, 0.12, 0.2, 0, d * 0.6, WHITE);
        put(H, v.x + d * 0.18, y0 + 0.36, v.z, 0.07, 0.36, 0.07, 0, -d * 0.12, WHITE);
        put(H, v.x + d * 0.24, y0 + 0.55, v.z, 0.16, 0.09, 0.08, 0, 0, WHITE);
        put(H, v.x + d * 0.36, y0 + 0.535, v.z, 0.1, 0.045, 0.05, 0, 0, [1.7, 0.6, 0.1]);
      } else if (mv.kind === 'wheel') {
        // the mill wheel turns along the lane: its paddles come down to the felt and sweep it towards the tee
        const k = TAU / mv.n;
        put(H, 0, mv.up, mv.z, 0.36, 0.24, 0.24, 0, 0, [0.45, 0.32, 0.22]);
        for (let i = 0; i < mv.n; i++) {
          const a = v.turn + i * k, rc = mv.r - 0.25;
          put(H, 0, mv.up - Math.cos(a) * mv.r * 0.5, mv.z + Math.sin(a) * mv.r * 0.5, 0.08, mv.r, 0.08, -a, 0, [0.5, 0.36, 0.24]);
          put(H, 0, mv.up - Math.cos(a) * rc, mv.z + Math.sin(a) * rc, mv.hw * 2, 0.5, 0.05, -a, 0, i % 2 ? [1.45, 0.3, 0.22] : [1.5, 1.4, 1.2]);
        }
      } else {
        // a big wheel turns across the lane: a rim, its spokes, and gondolas that hang level and come down through the lane
        const k = TAU / mv.n, rim = 12;
        put(H, 0, mv.up, mv.z, 0.3, 0.3, 0.5, 0, 0, [1.6, 1.6, 1.6]);
        for (let i = 0; i < rim; i++) { const a = v.turn + ((i + 0.5) * TAU) / rim; put(H, Math.sin(a) * mv.r, mv.up - Math.cos(a) * mv.r, mv.z, (TAU * mv.r) / rim + 0.05, 0.08, 0.08, 0, a, [1.7, 1.65, 1.6]); }
        for (let i = 0; i < mv.n; i++) {
          const a = v.turn + i * k, x = Math.sin(a) * mv.r, y = mv.up - Math.cos(a) * mv.r;
          put(H, Math.sin(a) * mv.r * 0.5, mv.up - Math.cos(a) * mv.r * 0.5, mv.z, 0.06, mv.r, 0.06, 0, a, [1.5, 1.5, 1.5]);
          put(H, x, y - 0.28, mv.z, mv.hw * 2 - 0.06, 0.4, mv.hd * 2, 0, 0, CABIN[i % CABIN.length]);
          put(H, x, y - 0.05, mv.z, mv.hw * 2 + 0.04, 0.06, mv.hd * 2 + 0.08, 0, 0, [1.7, 1.6, 1.5]);
        }
      }
    }
    M.count = n;
    M.instanceMatrix.needsUpdate = true; M.instanceColor.needsUpdate = true;
  }

  /** Every frame: what moves goes where the clock says (in a round: where the round has it); what belongs to a round is put where it is. */
  update(dt, time, cam) {
    const s = this.session;
    this._movers(s ? s.state.t0 + s.state.clock : (worldClock() / 1000) % GOLF.cycle);
    if (!s) { this.ball.visible = this.ring.visible = this.putter.visible = this.gauge.mesh.visible = false; this.dots.count = 0; return; }
    s.show(dt, time, cam);
  }

  /** A round is asked for: the player is put at the first tee. `io`: { play, note, splash }. Returns the session — the driver of the player (see src/extras/plug.js). */
  open(player, io) {
    const st = startRound((worldClock() / 1000) % GOLF.cycle), events = [], input = { x: 0, y: 0, jump: false };
    const S = { acc: 0, after: 0, spot: [0, 0], goal: [0, 0], hole: -1, walk: 0, alpha: 0, swing: -1, from: 0, ended: false, told: false };
    const look = V(0, 0, 0), _t = V(0, 0, 0), _c = V(0, 0, 0), _d = V(0, 0, 0), _w = [0, 0, 0, 0];
    const self = this;
    const session = {
      golf: this, over: false, ended: false, score: 0, line: '', riding: false, anim: ANIM.idle, state: st, auto: false,
      step: (dt, pl, control) => {
        const inp = pl.input;
        if (!st.over) {
          if (session.auto) {
            S.acc += Math.min(dt, 0.25);
            while (S.acc >= STEP && !st.over) { S.acc -= STEP; botInput(st, input); stepRound(st, STEP, input, events); }
          } else {
            input.x = control ? inp.move.x : 0; input.y = control ? inp.move.y : 0; input.jump = control && !!inp.jump;
            stepRound(st, dt, input, events);
          }
        }
        for (const e of events) self._tell(e, st, io, S);
        events.length = 0;
        const H = HOLES[st.hole], b = st.ball;
        // the robot stands behind the ball, a little to the left of the line, and walks round it as the aim turns
        const dx = Math.sin(st.aim), dz = -Math.cos(st.aim), rx = -dz, rz = dx;
        let lat = 0.32, px, pz;
        for (const l of [0.32, 0.16, 0]) { lat = l; px = b.x - dx * 0.5 - rx * l; pz = b.z - dz * 0.5 - rz * l; if (feltAt(H, px, pz) > -Infinity) break; }
        // (it stays where it is while the ball runs, and goes to the new ball when that has stopped)
        if (st.phase === 'aim' || st.phase === 'tee' || S.hole < 0) { S.goal[0] = px; S.goal[1] = pz; }
        if (S.hole !== st.hole) { S.hole = st.hole; S.spot[0] = S.goal[0] = px; S.spot[1] = S.goal[1] = pz; this.cam = null; }
        const gx = S.goal[0] - S.spot[0], gz = S.goal[1] - S.spot[1], k = Math.min(1, dt * 8);
        S.spot[0] += gx * k; S.spot[1] += gz * k;
        const speed = dt > 0 ? Math.hypot(gx * k, gz * k) / dt : 0;
        const wp = toWorld(H, S.spot[0], S.spot[1]), fy = feltAt(H, S.spot[0], S.spot[1]);
        pl.pos.set(wp[0], this.level[st.hole] + (fy > -Infinity ? fy : b.y), wp[1]);
        const wd = [dx * H.cos + dz * H.sin, -dx * H.sin + dz * H.cos];
        pl.yaw = Math.atan2(wd[0], wd[1]); pl.pitch = 0; pl.roll = 0; pl.speed = speed; pl.grounded = true; pl.vel?.set(0, 0, 0);
        session.anim = speed > 0.8 ? ANIM.run : ANIM.idle;
        if (st.over) {
          S.after += dt;
          if (!session.over) { session.over = true; session.score = st.score; io.play('victory'); io.note(`Round over: ${formatScore(st.score)}.`, 5000); }
          if (S.after > 3) session.ended = true;
        }
        session.line = lineOf(st);
      },
      /** The camera: above the hole and behind its tee, the whole of it in view, a little towards the ball when that runs far. */
      camera: (cam, dt) => {
        const H = HOLES[Math.min(st.hole, HOLES.length - 1)], b = st.ball, bb = self._bounds(H);
        const hc = H.yaw - (H.view || 0), fx = -Math.sin(hc), fz = -Math.cos(hc), span = Math.hypot(bb.w, bb.l);
        self._at(H, bb.cx, bb.cz, _t); const cy = _t.y;
        self._at(H, b.x, b.z, _c);
        const f = Math.min(0.5, 0.15 + 0.1 * Math.max(0, Math.hypot(b.x - bb.cx, b.z - bb.cz) - span * 0.3));
        _t.lerp(_c, f); _t.y = Math.max(cy, _t.y) - 0.1;
        const zoom = cam.aspect < 1 ? 1 + 0.5 * (1 - cam.aspect) : 1, back = (3.6 + span * 0.5) * zoom, high = (5.4 + span * 0.8) * zoom; // (a narrow screen stands further back)
        _d.set(_t.x - fx * back, _t.y + high, _t.z - fz * back);
        if (!this.cam) { this.cam = _d.clone(); look.copy(_t); } else { const k = Math.min(1, dt * 3.2); this.cam.lerp(_d, k); look.lerp(_t, Math.min(1, dt * 4)); }
        cam.position.copy(this.cam); cam.up.set(0, 1, 0); cam.lookAt(look);
        return 52;
      },
      /** What belongs to the round is put where it is: the ball, its ring, the dots, the gauge, the putter. */
      show: (dt, time, cam) => self._show(st, S, dt, time, cam, _w),
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x, this.gate.z, this.gate.yaw); session.close(); },
      close: () => { if (this.session === session) { this.session = null; this.ball.visible = this.ring.visible = this.putter.visible = this.gauge.mesh.visible = false; this.dots.count = 0; } },
    };
    this.session = session;
    this.cam = null;
    session.step(0, player, false);
    io.note(this._intro(HOLES[0]), 4200);
    return session;
  }

  _intro(H) { return `Hole ${H.n + 1} · ${H.name} · par ${H.par} — ${H.tip}`; }

  /** The bounds of a hole's felt, in its frame: the middle and the size. */
  _bounds(H) {
    if (H.box) return H.box;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const bed of H.beds) { x0 = Math.min(x0, bed.x0); x1 = Math.max(x1, bed.x1); z0 = Math.min(z0, bed.z0); z1 = Math.max(z1, bed.z1); }
    return (H.box = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, l: z1 - z0 });
  }

  _show(st, S, dt, time, cam, w) {
    const H = HOLES[st.hole], b = st.ball, lv = this.level[st.hole], aimPhase = st.phase === 'aim' || st.phase === 'tee';
    // the ball
    const wp = toWorld(H, b.x, b.z), by = lv + b.y;
    const hidden = st.phase === 'holed' || st.phase === 'lost' || st.phase === 'over';
    this.ball.visible = !hidden;
    this.ball.position.set(wp[0], by + R * 1.5, wp[1]);
    this.ring.visible = !hidden && st.phase !== 'roll';
    this.ring.position.set(wp[0], by + 0.012, wp[1]);
    this.ring.scale.setScalar(1 + 0.12 * Math.sin(time * 6));
    // the dots: the way the ball would go at the strength the gauge shows now, one bounce or two
    let n = 0;
    if (st.phase === 'aim') {
      const p = gaugeOf(st.gauge);
      let rest = GOLF.reach[0] + (st.far - GOLF.reach[0]) * p, x = b.x, z = b.z, aim = st.aim, last = by;
      const space = clamp(rest / 30, 0.26, 0.7);
      for (let bounce = 0; bounce < 3 && rest > 0.05 && n < DOTS; bounce++) {
        const hit = sightLine(H, x, z, aim, rest, w), dx = Math.sin(aim), dz = -Math.cos(aim);
        for (let d = bounce ? 0 : space; d <= hit && n < DOTS; d += space) {
          const fx = x + dx * d, fz = z + dz * d, fy = feltAt(H, fx, fz), ww = toWorld(H, fx, fz);
          if (fy > -Infinity) last = lv + fy;
          _p.set(ww[0], last + 0.014, ww[1]);
          _m.compose(_p, _q.identity(), _s.setScalar(fy > -Infinity ? 1 : 0));
          this.dots.setMatrixAt(n, _m);
          _c.setRGB(1.0, 1.0 - 0.45 * p, 0.8 - 0.7 * p);
          this.dots.setColorAt(n, _c);
          n++;
        }
        if (w[2] === 0 && w[3] === 0) break;
        rest = (rest - hit) * GOLF.cushion * GOLF.cushion; x = w[0]; z = w[1]; aim = Math.atan2(w[2], -w[3]);
      }
    }
    this.dots.count = n;
    if (n) { this.dots.instanceMatrix.needsUpdate = true; this.dots.instanceColor.needsUpdate = true; }
    // the gauge: over the ball, facing the camera
    const gauge = this.gauge.mesh;
    gauge.visible = st.phase === 'aim';
    if (gauge.visible) {
      const q = Math.round(gaugeOf(st.gauge) * 64) / 64;
      if (q !== this._shown.p) { this._shown.p = q; this.gauge.redraw(); }
      gauge.position.set(wp[0], by + 1.05, wp[1]);
      gauge.quaternion.copy(cam.quaternion);
    }
    // the putter: back as the gauge rises, forward at the hit
    const pl = this.putter, aw = H.yaw - st.aim, dx = Math.sin(st.aim), dz = -Math.cos(st.aim), rx = -dz, rz = dx;
    let want = aimPhase ? -0.12 - 0.9 * gaugeOf(st.gauge) : 0;
    if (S.swing >= 0) {
      S.swing += dt;
      want = S.swing < 0.09 ? lerp(S.from, 0.75, S.swing / 0.09) : lerp(0.75, 0, Math.min(1, (S.swing - 0.09) / 0.5));
      if (S.swing > 0.6) S.swing = -1;
      S.alpha = want;
    } else S.alpha += (want - S.alpha) * Math.min(1, dt * 14);
    const wd = [dx * H.cos + dz * H.sin, -dx * H.sin + dz * H.cos], hx = wp[0] - wd[0] * 0.5, hz = wp[1] - wd[1] * 0.5;
    pl.visible = true;
    pl.position.set(hx, by + 0.9, hz);
    pl.rotation.set(S.alpha, aw, 0, 'YXZ');
  }

  /** The rules say what happened: here it is said aloud (a sound, a note). */
  _tell(e, st, io, S) {
    const H = HOLES[st.hole];
    if (e.type === 'hit') { io.play('whack', { volume: 0.5 + 0.5 * e.power }); S.swing = 0; S.from = S.alpha; }
    else if (e.type === 'bounce') io.play('hit', { volume: clamp(e.speed / 6, 0.15, 0.6) });
    else if (e.type === 'bump') io.play('pick', { volume: 0.6 });
    else if (e.type === 'land' && e.speed > 2) io.play('land', { volume: 0.4 });
    else if (e.type === 'lip') io.play('tick', { volume: 0.3 });
    else if (e.type === 'lost') {
      const w = toWorld(H, e.x, e.z);
      if (e.what === 'acid') { io.play('splash'); io.splash(w[0], this.level[st.hole] - 0.7, w[1], 1.2); io.note('Into the acid! A stroke more — back to where you hit from.', 3000); }
      else if (e.what === 'water') { io.play('splash', { volume: 0.6 }); io.splash(w[0], this.level[st.hole] + 0.02, w[1], 0.6); io.note('Into the swan pond! A stroke more — back to where you hit from.', 3000); } else { io.play('fail', { volume: 0.5 }); io.note(`${H.beds.some((b) => b.look === 'stone') ? 'Down between the stones!' : 'Off the bed!'} A stroke more — back to where you hit from.`, 3000); }
    } else if (e.type === 'holed') {
      const d = e.strokes - e.par;
      if (e.strokes === 1) { io.play('victory'); io.note('Hole in one!', 3200); }
      else if (d <= 0) { io.play('bell'); io.note(d < 0 ? `${e.strokes} strokes: under par!` : `${e.strokes} strokes: par.`, 2600); }
      else { io.play('checkpoint'); io.note(d === 1 ? `${e.strokes} strokes: one over par.` : `${e.strokes} strokes: ${d} over par.`, 2600); }
    } else if (e.type === 'picked') { io.play('fail'); io.note(`${GOLF.most} strokes: pick up and move on.`, 2800); }
    else if (e.type === 'tee') { io.play('checkpoint', { volume: 0.4 }); io.note(this._intro(HOLES[e.hole]), 4200); }
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _r = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler(), _x = new THREE.Vector3(1, 0, 0), _z = new THREE.Vector3(0, 0, 1), _mv = {};
