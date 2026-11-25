// Par for the Course: what is seen of it and how it is played. Its rules are in rules.js; here the nine beds are
// built — felt in a timber kerb, level whatever the meadow does, each with its tee, its cup and flag and its number
// on a stake — the mill, the sliding walls and the ball are drawn where the rules have them, and a round is played:
// a session that drives the player (see PlayerController.driver). One builds nothing per frame: what moves (the
// sails, the walls, the ball, the line of dots, the gauge, the putter) is a handful of pooled meshes.
import * as THREE from 'three';
import { Parts, MeshBuilder } from '../../../src/world/props/MeshBuilder.js';
import { surfaceMaterial } from '../../../src/render/SurfaceMaterial.js';
import { LAYER } from '../../../src/render/Shadows.js';
import { ANIM } from '../../../src/player/Character.js';
import { canvasBoard } from '../../../src/world/zones/games/Boards.js';
import { V, clamp, lerp, gateArch, stakeSign, worldClock } from '../kit.js';
import { GOLF, HOLES, toWorld, levelOf, feltAt, moverAt, gaugeOf, sightLine, startRound, stepRound, botInput, lineOf, formatScore } from './rules.js';

const R = GOLF.ball, TAU = Math.PI * 2, STEP = GOLF.step;
const FELT = [0.1, 0.66, 0.15], FELT2 = [0.09, 0.58, 0.16], TEE = [0.05, 0.4, 0.1], TIMBER = [1.25, 0.78, 0.42], SKIRT = [0.62, 0.42, 0.26], STONE = [1.1, 1.0, 0.9];
const DOTS = 44, KERB = 0.2;

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
    const paint = parts.get('paint'), wood = parts.get('woodDark'), matte = parts.get('matte'), stone = parts.get('stone'), deck = parts.get('woodDeck');
    const all = [paint, wood, matte, stone, deck];
    for (const H of HOLES) {
      const lv = (this.level[H.n] = levelOf(H, ground));
      for (const b of all) b.place(H.at[0], lv, H.at[1], H.yaw);
      const wy = (bed, x, z) => bed.y + (bed.h ? bed.h(x, z) : 0);
      const wpos = (x, z) => toWorld(H, x, z);
      // ---- the felt, the kerbs, what is under them
      for (const bed of H.beds) {
        const isDeck = bed.look === 'deck', top = (x, z) => wy(bed, x, z) + 0.002;
        const maxEdge = bed.h ? 0.35 : 0.8, tone = isDeck ? [1.1, 0.8, 0.5] : bed.isle ? FELT2 : FELT;
        felt(isDeck ? deck : paint, bed, tone, top, maxEdge, (x, z) => (isDeck ? 0.92 + 0.1 * hash2(Math.round(x * 5), Math.round(z * 2.2)) : 0.93 + 0.1 * hash2(Math.round(x * 4), Math.round(z * 4))));
        const sign = orient(bed.poly);
        for (let k = 0; k < bed.n; k++) {
          const p = bed.poly[k], q = bed.poly[(k + 1) % bed.n], dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
          if (len < 1e-6) continue;
          const ux = dx / len, uz = dz / len, nx = sign > 0 ? uz : -uz, nz = sign > 0 ? -ux : ux;
          const air = bed.air.includes(k), kerb = !bed.open.includes(k), steps = bed.h ? Math.ceil(len / 0.45) : Math.max(1, Math.ceil(len / 0.9));
          for (let i = 0; i < steps; i++) {
            const t0 = i / steps, t1 = (i + 1) / steps, ax = p[0] + dx * t0, az = p[1] + dz * t0, cx = p[0] + dx * t1, cz = p[1] + dz * t1;
            const y0 = wy(bed, ax, az), y1 = wy(bed, cx, cz);
            if (kerb) {
              const e = 0.1, o = KERB / 2;
              wood.tint(...TIMBER, 1).beam(V(ax + nx * o - ux * e * (i === 0), y0 + 0.03, az + nz * o - uz * e * (i === 0)), V(cx + nx * o + ux * e * (i === steps - 1), y1 + 0.03, cz + nz * o + uz * e * (i === steps - 1)), KERB, 0.22);
            }
            // the board under it, down to the meadow (a plank over the acid is a thin slab; the island stands in the pond)
            const off = kerb ? KERB : 0, sx0 = ax + nx * off, sz0 = az + nz * off, sx1 = cx + nx * off, sz1 = cz + nz * off;
            const w0 = wpos(sx0, sz0), w1 = wpos(sx1, sz1);
            let d0, d1;
            if (air) { d0 = bed.isle ? acidY - lv - 0.4 : y0 - 0.2; d1 = bed.isle ? acidY - lv - 0.4 : y1 - 0.2; } else { d0 = Math.min(y0 - 0.3, ground(w0[0], w0[1]) - lv - 0.15); d1 = Math.min(y1 - 0.3, ground(w1[0], w1[1]) - lv - 0.15); }
            const tone2 = isDeck ? [0.8, 0.55, 0.35] : SKIRT;
            (isDeck ? deck : wood).tint(...tone2, 1);
            wall(isDeck ? deck : wood, V(sx0, y0 - 0.08, sz0), V(sx1, y1 - 0.08, sz1), V(sx1, d1, sz1), V(sx0, d0, sz0), nx, nz);
          }
        }
        if (isDeck) { // the underside of the plank
          flat(deck.tint(0.5, 0.35, 0.22, 1), bed.poly.map((p) => V(p[0], wy(bed, p[0], p[1]) - 0.2, p[1])), -1);
        }
      }
      // ---- the tee: a darker mat with two white markers; the cup: a dark disc in a ring of steel, a pole and a pennant
      const T = [0, 0], ty = feltAt(H, 0, 0) + 0.004;
      flat(paint.tint(...TEE, 1), [V(-0.42, ty, 0.5), V(-0.42, ty, -0.5), V(0.42, ty, -0.5), V(0.42, ty, 0.5)], 1);
      for (const s of [-1, 1]) paint.tint(1.7, 1.7, 1.7, 1).cylinder(s * 0.6, ty - 0.02, -0.55, 0.035, 0.03, 0.13, 8);
      const cy = feltAt(H, H.cup[0], H.cup[1]);
      matte.tint(0.03, 0.03, 0.03, 1).place(H.cup[0], cy + 0.006, H.cup[1]).lathe([[g.cup, 0], [0.001, 0]], 18).pop();
      matte.tint(1.4, 1.4, 1.5, 1).place(H.cup[0], cy, H.cup[1]).lathe([[g.cup + 0.07, 0], [g.cup + 0.06, 0.014], [g.cup, 0.014]], 18).pop();
      const pole = [H.cup[0] + 0.02, cy, H.cup[1]], flag = H.n === 8 ? [1.5, 1.1, 0.1] : [1.5, 0.22, 0.2];
      paint.tint(1.5, 1.5, 1.5, 1).cylinder(pole[0], cy, pole[2], 0.016, 0.012, 1.15, 6);
      const fa = V(pole[0], cy + 1.12, pole[2]), fb = V(pole[0], cy + 0.8, pole[2]), fc = V(pole[0] + 0.42, cy + 0.96, pole[2] - 0.05);
      paint.tint(...flag, 1).tri(fa, fb, fc).tri(fa, fc, fb);
      // ---- what stands on the felt
      for (const [x0, z0, x1, z1, high] of H.blocks) {
        stone.tint(...STONE, 1).box(x0, wy(H.beds[0], x0, z0), z0, x1, high, z1);
        stone.tint(1.0, 0.55, 0.4, 1).box(x0 - 0.04, high, z0 - 0.04, x1 + 0.04, high + 0.1, z1 + 0.04);
      }
      for (const [ax, az, bx, bz, high] of H.walls) {
        const bed = H.beds.find((q) => q.isle) || H.beds[0], y = wy(bed, ax, az);
        wood.tint(...TIMBER, 1).beam(V(ax, y + high / 2, az), V(bx, y + high / 2, bz), 0.1, high);
      }
      for (const [x, z, r] of H.bumpers) {
        const y = feltAt(H, x, z);
        matte.tint(1.35, 1.25, 1.05, 1).cylinder(x, y, z, r * 0.45, r * 0.38, 0.22, 10);
        paint.tint(1.5, 0.2, 0.3, 1).place(x, y + 0.2, z).lathe([[r, 0], [r * 0.96, 0.08], [r * 0.7, 0.2], [r * 0.3, 0.27], [0.001, 0.29]], 14).pop();
        for (let k = 0; k < 5; k++) { const a = k * 1.256 + z; paint.tint(1.8, 1.8, 1.8, 1).cylinder(x + Math.sin(a) * r * 0.55, y + 0.31 - 0.14 * 0.4, z + Math.cos(a) * r * 0.55, 0.045, 0.04, 0.03, 6); }
      }
      if (H.pipe) this._pipe(H, paint, matte);
      if (H.n === 3) this._mill(H, wood, stone, matte);
      for (const b of all) b.pop();
      // ---- the number and the par, on a stake beside the tee (it reads from behind the tee)
      const sp = wpos(-1.75, 0.5);
      stakeSign(this.group, wood, sp[0], ground(sp[0], sp[1]), sp[1], H.yaw, `${H.n + 1} · PAR ${H.par}`, { w: 1.2, h: 0.46, up: 1.05 });
    }
    // ---- the arch where one asks to play
    const gt = g.gate, gy = this.data.heightAt(gt.x, gt.z);
    this.gate = { x: gt.x, y: gy, z: gt.z, yaw: gt.yaw };
    this.boardSpot = { x: g.stand.x, z: g.stand.z, yaw: g.stand.yaw, y: this.data.heightAt(g.stand.x, g.stand.z) };
    gateArch(this.group, paint, gt.x, gy, gt.z, gt.yaw, g.name.toUpperCase(), 'NINE HOLES ROUND THE ACID POND · THE FEWER STROKES THE BETTER', { tone: [0.2, 1.1, 0.35], ink: '#0e2a16' });
    this.group.add(parts.toMeshes(mats, { name: 'golf-course', layers: [LAYER.STATIC_CASTER] }));
    this._pool();
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    return this;
  }

  /** The funnel's pipe: a steel tube that goes over the back of the funnel and comes down on the upper green. */
  _pipe(H, paint, matte) {
    const p = H.pipe, y0 = feltAt(H, p.in[0], p.in[1]), y1 = feltAt(H, p.out[0], p.out[1]);
    matte.tint(0.02, 0.02, 0.02, 1).place(p.in[0], y0 + 0.006, p.in[1]).lathe([[p.r, 0], [0.001, 0]], 16).pop();
    matte.tint(1.2, 1.2, 1.3, 1).place(p.in[0], y0, p.in[1]).lathe([[p.r + 0.09, 0], [p.r + 0.08, 0.02], [p.r, 0.02]], 16).pop();
    const pts = [V(p.in[0], y0 - 0.3, p.in[1] - 0.5), V(p.in[0], y0 + 0.55, p.in[1] - 0.52), V(p.in[0] + 0.5, y0 + 0.8, p.in[1] - 1.5), V(p.out[0] - 0.55, y1 + 0.62, p.out[1]), V(p.out[0] - 0.1, y1 + 0.46, p.out[1])];
    for (let i = 0; i + 1 < pts.length; i++) { matte.tint(0.8, 0.9, 1.1, 1).rod(pts[i], pts[i + 1], 0.24); matte.tint(0.45, 0.5, 0.6, 1).place(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z).lathe([[0.27, -0.05], [0.29, 0], [0.29, 0.05], [0.27, 0.1]], 8).pop(); }
    matte.tint(0.02, 0.02, 0.02, 1).place(p.out[0] - 0.08, y1 + 0.46, p.out[1], 0, 0, 0).box(-0.02, -0.2, -0.2, 0.02, 0.2, 0.2).pop();
  }

  /** The mill's hub: a crossbeam over the door (above the height of a ball), a post, an axle — the sails are pooled. */
  _mill(H, wood, stone, matte) {
    const s = H.movers[0], y = 1.2;
    wood.tint(...TIMBER, 1).box(-0.5, y + 0.02, s.z - 0.5, 0.5, y + 0.14, s.z - 0.3);
    matte.tint(0.5, 0.4, 0.3, 1).rod(V(0, y + 0.1, s.z - 0.4), V(0, s.up, s.z - 0.4), 0.06, 8).rod(V(0, s.up, s.z - 0.4), V(0, s.up, s.z), 0.05, 8);
  }

  /** What moves and what is only there while one plays: made once, put where it is each frame. */
  _pool() {
    const mats = this.world.materials;
    // the sails and the sliding walls: instances of one box (the two holes that have them never draw more than 14)
    const box = new MeshBuilder().tint(1, 1, 1, 1).box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5).build();
    const flat = surfaceMaterial({ name: 'golf-movers', rough: 0.6, spec: 0.25 });
    this.movers = new THREE.InstancedMesh(box, flat, 16);
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

  /** What goes by the clock: the walls of the sliding doors, the sails of the mill — in the state of a round, or on the clock of the world. */
  _movers(tw) {
    const m = _m, q = _q, e = _e, p = _p, s = _s, col = _c, M = this.movers;
    let n = 0;
    const put = (H, x, y, z, sx, sy, sz, roll, tone) => {
      const w = toWorld(H, x, z);
      p.set(w[0], this.level[H.n] + y, w[1]);
      q.setFromEuler(e.set(0, H.yaw, 0)); q.multiply(_r.setFromAxisAngle(_z, roll));
      m.compose(p, q, s.set(sx, sy, sz));
      M.setMatrixAt(n, m); M.setColorAt(n, col.setRGB(tone[0], tone[1], tone[2])); n++;
    };
    for (const H of HOLES) for (const mv of H.movers) {
      const v = moverAt(mv, tw, _mv);
      if (mv.kind === 'slide') {
        put(H, v.x, mv.high * 0.5 + 0.05, v.z, v.hw * 2, mv.high + 0.1, v.hd * 2, 0, [1.5, 0.95, 0.12]);
        put(H, v.x, mv.high + 0.11, v.z, v.hw * 2 + 0.04, 0.05, v.hd * 2 + 0.04, 0, [1.6, 0.3, 0.25]);
      } else {
        put(H, 0, mv.up, mv.z, 0.2, 0.2, 0.14, 0, [0.4, 0.3, 0.22]);
        for (let k = 0; k < 4; k++) {
          const a = v.turn + (k * Math.PI) / 2, sn = Math.sin(a), cs = Math.cos(a), phi = a + Math.PI;
          put(H, sn * mv.r * 0.5, mv.up - cs * mv.r * 0.5, mv.z, 0.1, mv.r, 0.06, phi, [0.5, 0.36, 0.24]);
          put(H, sn * mv.r * 0.72, mv.up - cs * mv.r * 0.72, mv.z + 0.01, mv.hw * 2, mv.r * 0.55, 0.04, phi, k % 2 ? [1.5, 1.4, 1.2] : [1.4, 0.3, 0.25]);
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

  /** A round is asked for: the player is put at the first tee. `io`: { play, note, splash }. Returns the session — the driver of the player (see lab/games/kit.js). */
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
    const hidden = st.phase === 'holed' || st.phase === 'lost' || st.phase === 'over' || b.pipe > 0;
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
    else if (e.type === 'in') io.play('tick', { volume: 0.5 });
    else if (e.type === 'out') io.play('whack', { volume: 0.3 });
    else if (e.type === 'lip') io.play('tick', { volume: 0.3 });
    else if (e.type === 'lost') {
      const w = toWorld(H, e.x, e.z);
      if (e.what === 'acid') { io.play('splash'); io.splash(w[0], this.level[st.hole] - 0.7, w[1], 1.2); io.note('Into the acid! A stroke more — back to where you hit from.', 3000); } else { io.play('fail', { volume: 0.5 }); io.note('Off the bed! A stroke more — back to where you hit from.', 3000); }
    } else if (e.type === 'holed') {
      const d = e.strokes - e.par;
      if (e.strokes === 1) { io.play('victory'); io.note('Hole in one!', 3200); }
      else if (d <= 0) { io.play('bell'); io.note(d < 0 ? `${e.strokes} strokes: under par!` : `${e.strokes} strokes: par.`, 2600); }
      else { io.play('checkpoint'); io.note(d === 1 ? `${e.strokes} strokes: one over par.` : `${e.strokes} strokes: ${d} over par.`, 2600); }
    } else if (e.type === 'picked') { io.play('fail'); io.note(`${GOLF.most} strokes: pick up and move on.`, 2800); }
    else if (e.type === 'tee') { io.play('checkpoint', { volume: 0.4 }); io.note(this._intro(HOLES[e.hole]), 4200); }
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _r = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler(), _z = new THREE.Vector3(0, 0, 1), _mv = {};
