// Round the Bend: what is seen of it and how it is played. Its rules are in rules.js; here it is built — a table in
// the meadow with a circuit of tarmac on it for radio-controlled cars, its kerbs and tyre walls, the pad, the sand,
// the ramp and the oil, a stand to drive from and the arch where one asks to play — and a race is played: a session
// that drives the player (see PlayerController.driver). The cars are only there while a race is on; the camera hangs
// over the table and looks straight down, so that the whole track is in view.
import * as THREE from 'three';
import { Parts, MeshBuilder } from '../../../src/world/props/MeshBuilder.js';
import { surfaceMaterial } from '../../../src/render/SurfaceMaterial.js';
import { LAYER } from '../../../src/render/Shadows.js';
import { ANIM } from '../../../src/player/Character.js';
import { formatTime } from '../../../src/world/zones/games/course.js';
import { V, clamp, gateArch, worldClock } from '../kit.js';
import { CARS, TRACK, PAD, SAND, RAMP, OIL, GATE, startRace, stepRace, botInput, placeOf, lapOf } from './rules.js';

const C = CARS, T = TRACK, M = T.m, DS = T.ds, TAU = Math.PI * 2, STEP = C.step;
const ORD = ['1st', '2nd', '3rd', '4th'];
// the cars: one's own, then the three rivals as they stand on the grid (rules.js: Blue, Yellow, White)
const PAINT = [[1.8, 0.13, 0.1], [0.12, 0.38, 1.8], [1.85, 1.5, 0.08], [1.9, 1.9, 2.0]];
const MAT = [0.42, 0.62, 0.66], TARMAC = [0.2, 0.2, 0.22], RED = [1.6, 0.18, 0.14], CREAM = [1.5, 1.45, 1.3], TYRE = [0.11, 0.11, 0.12];
const TOP = 0.03, FOV = 50; // the tarmac stands so far over the table; the camera's field of view (degrees)

const UP = V(0, 1, 0);
/** A quad that faces `want` (up unless said): the order of its corners is found here. */
function face(b, a, p, c, d, color, want = UP) {
  const n = new THREE.Vector3().crossVectors(p.clone().sub(a), d.clone().sub(a));
  if (n.dot(want) >= 0) b.quad(a, p, c, d, { color }); else b.quad(a, d, c, p, { color });
}

/** A car, nose towards +z, 0.45 m long: a white body (the instance paints it), dark glass and wheels, a wing behind. */
function carGeometry() {
  const b = new MeshBuilder(), white = [1, 1, 1, 1], glass = [0.07, 0.08, 0.11, 1], dark = [0.05, 0.05, 0.06, 1], tyre = [0.04, 0.04, 0.05, 1];
  const body = (x0, y0, z0, x1, y1, z1, c = white) => b.box(x0, y0, z0, x1, y1, z1, { color: c });
  body(-0.12, 0.035, -0.2, 0.12, 0.085, 0.19);
  // (the nose slopes down: a wedge in front, a cab behind it)
  const w = 0.12;
  b.quad(V(-w, 0.085, 0.19), V(w, 0.085, 0.19), V(w * 0.8, 0.06, 0.225), V(-w * 0.8, 0.06, 0.225), { color: white });
  b.quad(V(-w * 0.8, 0.06, 0.225), V(w * 0.8, 0.06, 0.225), V(w * 0.8, 0.035, 0.225), V(-w * 0.8, 0.035, 0.225), { color: white });
  b.tri(V(-w, 0.035, 0.19), V(-w, 0.085, 0.19), V(-w * 0.8, 0.06, 0.225), { color: white }).tri(V(w, 0.085, 0.19), V(w, 0.035, 0.19), V(w * 0.8, 0.06, 0.225), { color: white });
  body(-0.075, 0.085, -0.1, 0.075, 0.13, 0.05, glass);
  body(-0.06, 0.13, -0.08, 0.06, 0.14, 0.03, white);
  body(-0.13, 0.115, -0.225, 0.13, 0.125, -0.17); // (the wing)
  body(-0.1, 0.085, -0.2, -0.085, 0.115, -0.185, dark); body(0.085, 0.085, -0.2, 0.1, 0.115, -0.185, dark);
  for (const [x, z] of [[-0.135, 0.13], [0.135, 0.13], [-0.135, -0.13], [0.135, -0.13]]) {
    b.tint(...tyre).place(x, 0.045, z, 0, 0, Math.PI / 2).cylinder(0, -0.021, 0, 0.045, 0.045, 0.042, 8).pop();
  }
  return b.build();
}
/** The flame of a boost: a long cone behind the car, bright. */
function flameGeometry() {
  const b = new MeshBuilder();
  b.tint(2.4, 1.2, 0.25, 1).place(0, 0.06, -0.21, Math.PI, Math.PI / 2).lathe([[0.001, 0.34], [0.03, 0.2], [0.05, 0.06], [0.001, 0]], 6).pop();
  return b.build();
}
/** What marks one's own car: a ring on the table round it and an arrow ahead of it, flat, bright. */
function markGeometry() {
  const b = new MeshBuilder(), c = [2.6, 2.6, 2.0, 1], r0 = 0.36, r1 = 0.43, y = 0.012, n = 24;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU;
    face(b, V(Math.sin(a0) * r1, y, Math.cos(a0) * r1), V(Math.sin(a1) * r1, y, Math.cos(a1) * r1), V(Math.sin(a1) * r0, y, Math.cos(a1) * r0), V(Math.sin(a0) * r0, y, Math.cos(a0) * r0), c);
  }
  b.tri(V(0, y, 0.82), V(0.13, y, 0.6), V(-0.13, y, 0.6), { color: c });
  return b.build();
}

export class Cars {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'cars';
    this.session = null;
    this.best = 0;
    this.top = 0; // how high the table stands: its mat
  }

  build() {
    const world = this.world, mats = world.materials, at = C.at, parts = new Parts();
    const matte = parts.get('matte'), paint = parts.get('paint'), wood = parts.get('woodDark');
    // ---- the table: level over a meadow that is not quite
    const x0 = at.x - C.half.x, x1 = at.x + C.half.x, z0 = at.z - C.half.z, z1 = at.z + C.half.z;
    let lo = 99, hi = -99;
    for (let x = x0; x <= x1; x += 0.5) for (let z = z0; z <= z1; z += 0.5) { const h = this.data.heightAt(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    const top = (this.top = hi + C.rise), ty = top + TOP, bottom = lo - 0.5;
    this.tarmac = ty;
    const rim = 0.28;
    wood.tint(0.5, 0.34, 0.2, 1).box(x0, bottom, z0, x1, top - 0.02, z1);
    wood.tint(0.62, 0.43, 0.26, 1).box(x0, top - 0.02, z0, x1, top + 0.07, z0 + rim).box(x0, top - 0.02, z1 - rim, x1, top + 0.07, z1).box(x0, top - 0.02, z0 + rim, x0 + rim, top + 0.07, z1 - rim).box(x1 - rim, top - 0.02, z0 + rim, x1, top + 0.07, z1 - rim);
    matte.tint(...MAT, 1).box(x0 + rim, top - 0.02, z0 + rim, x1 - rim, top, z1 - rim);
    // ---- helpers: a place on the lap (sample k, l to its left, height y) and flat or standing strips along it
    const P = (k, l, y) => { k = ((k % M) + M) % M; return V(at.x + T.x[k] + T.nx[k] * l, y, at.z + T.z[k] + T.nz[k] * l); };
    /** A flat strip from sample k to k + n, between l0 and l1, at height y; `tone(j)` colours its j-th piece, each `step` samples long. */
    const strip = (b, k, n, l0, l1, y, tone, step = 2) => { for (let j = 0, i = 0; j < n; j += step, i++) { const e = Math.min(n, j + step); face(b, P(k + j, l0, y), P(k + e, l0, y), P(k + e, l1, y), P(k + j, l1, y), tone(i)); } };
    const flat = (c) => () => c;
    // ---- the tarmac, a shade or two different from stretch to stretch
    strip(matte, 0, M, -C.road, C.road, ty, (i) => { const s = 1 + 0.12 * (((i * 7) % 5) / 4 - 0.5); return [TARMAC[0] * s, TARMAC[1] * s, TARMAC[2] * s, 1]; });
    // (the dashed line down the middle)
    strip(paint, 0, M, -0.02, 0.02, ty + 0.008, (i) => (i % 4 < 2 ? [0.9, 0.9, 0.8, 1] : [0.2, 0.2, 0.22, 1]), 2);
    // ---- the kerbs, red and white, between the tarmac and the boards
    for (const side of [-1, 1]) strip(paint, 0, M, side > 0 ? C.road : -C.wall, side > 0 ? C.wall : -C.road, ty + 0.006, (i) => (i % 4 < 2 ? RED : CREAM), 2);
    // ---- the boards: a wall of tyres, charcoal, with a white one now and then — its top and both faces
    const wallH = 0.2;
    const tone = (i) => { const k = 1 + 0.25 * (i % 3), c = i % 9 === 0 ? [1.25, 1.22, 1.1, 1] : [TYRE[0] * k, TYRE[1] * k, TYRE[2] * k, 1]; return c; };
    for (const side of [-1, 1]) {
      const a = side * C.wall, d = side * (C.wall + 0.3);
      for (let j = 0, i = 0; j < M; j += 2, i++) {
        const c = tone(i);
        face(paint, P(j, a, ty + wallH), P(j + 2, a, ty + wallH), P(j + 2, d, ty + wallH), P(j, d, ty + wallH), c); // top
        // (the face on the track side, and the one away from it)
        for (const [l, dir] of [[a, -side], [d, side]]) {
          const nx = P(j, l + dir, 0), want = V(nx.x - P(j, l, 0).x, 0, nx.z - P(j, l, 0).z);
          face(paint, P(j, l, ty), P(j + 2, l, ty), P(j + 2, l, ty + wallH), P(j, l, ty + wallH), l === a ? c : [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, 1], want);
        }
      }
    }
    // ---- the start line, a chequered strip across the tarmac, the four places of the grid behind it
    for (let r = 0; r < 2; r++) for (let i = 0; i < 12; i++) {
      const l0 = -C.road + (i * 2 * C.road) / 12, l1 = l0 + (2 * C.road) / 12;
      face(paint, P(r * 2 - 2, l0, ty + 0.01), P(r * 2, l0, ty + 0.01), P(r * 2, l1, ty + 0.01), P(r * 2 - 2, l1, ty + 0.01), (i + r) % 2 ? [0.08, 0.08, 0.09, 1] : [1.6, 1.6, 1.5, 1]);
    }
    for (let slot = 0; slot < 4; slot++) {
      const k = -Math.round((0.9 + 0.9 * slot + 0.3) / DS), l = slot % 2 ? -0.5 : 0.5;
      face(paint, P(k, l - 0.17, ty + 0.01), P(k + 1, l - 0.17, ty + 0.01), P(k + 1, l + 0.17, ty + 0.01), P(k, l + 0.17, ty + 0.01), [1.5, 1.5, 1.4, 1]);
    }
    // ---- the pad: yellow, with dark arrows the way one goes
    strip(paint, PAD.k0, PAD.n, PAD.l0, PAD.l1, ty + 0.012, flat([1.7, 1.35, 0.1, 1]), 1);
    for (let a = 0; a < 2; a++) {
      const k = PAD.k0 + a * 3, m = (PAD.l0 + PAD.l1) / 2, y = ty + 0.018, ink = [0.14, 0.1, 0.02, 1];
      for (const s of [-1, 1]) face(paint, P(k, m + s * 0.3, y), P(k + 1, m + s * 0.3, y), P(k + 3, m, y), P(k + 2, m, y), ink);
    }
    // ---- the sand on the outside of the sweep, with a few darker grains; the oil, black with a rainbow in it
    strip(paint, SAND.k0, SAND.n, SAND.l0, SAND.l1, ty + 0.012, (i) => (i % 3 ? [1.55, 1.25, 0.72, 1] : [1.4, 1.1, 0.62, 1]), 2);
    for (let i = 0; i < 9; i++) { const k = SAND.k0 + 2 + i * 3, l = SAND.l0 + 0.1 + ((i * 5) % 7) * 0.08; face(paint, P(k, l, ty + 0.018), P(k + 1, l, ty + 0.018), P(k + 1, l + 0.05, ty + 0.018), P(k, l + 0.05, ty + 0.018), [1.0, 0.76, 0.42, 1]); }
    strip(paint, OIL.k0, OIL.n, OIL.l0, OIL.l1, ty + 0.012, flat([0.05, 0.04, 0.07, 1]), 1);
    for (let i = 0; i < 4; i++) { const k = OIL.k0 + i, l = OIL.l0 + 0.15 + i * 0.17; face(paint, P(k, l, ty + 0.018), P(k + 1, l, ty + 0.018), P(k + 1, l + 0.12, ty + 0.018), P(k, l + 0.12, ty + 0.018), [[0.5, 0.15, 0.9, 1], [0.1, 0.5, 0.7, 1], [0.8, 0.3, 0.5, 1], [0.2, 0.6, 0.3, 1]][i]); }
    // ---- the ramp: rises the way one goes and ends in the air; orange, with white bars
    {
      const hgt = (j) => (j / RAMP.n) * C.ramp.high, y = ty + 0.01;
      for (let j = 0; j < RAMP.n; j++) face(paint, P(RAMP.k0 + j, RAMP.l0, y + hgt(j)), P(RAMP.k0 + j + 1, RAMP.l0, y + hgt(j + 1)), P(RAMP.k0 + j + 1, RAMP.l1, y + hgt(j + 1)), P(RAMP.k0 + j, RAMP.l1, y + hgt(j)), j % 2 ? [1.25, 0.28, 0.03, 1] : [1.6, 1.6, 1.55, 1]);
      const e = RAMP.k0 + RAMP.n;
      face(paint, P(e, RAMP.l0, y), P(e, RAMP.l1, y), P(e, RAMP.l1, y + C.ramp.high), P(e, RAMP.l0, y + C.ramp.high), [0.7, 0.14, 0.02, 1], V(T.tx[e % M], 0, T.tz[e % M]));
      for (const l of [RAMP.l0, RAMP.l1]) { const out = V(T.nx[e % M] * Math.sign(l), 0, T.nz[e % M] * Math.sign(l)); face(paint, P(RAMP.k0, l, y), P(e, l, y), P(e, l, y + C.ramp.high), P(RAMP.k0, l, y), [0.9, 0.2, 0.03, 1], out); }
    }
    // ---- cones and a few stacks of tyres on the table, on the inside of the bends
    const cone = (x, z, tint) => {
      paint.tint(...tint, 1).place(x, top, z).lathe([[0.001, 0.2], [0.03, 0.15], [0.07, 0.02], [0.1, 0], [0.1, -0.02]], 8).pop();
      paint.tint(1.6, 1.6, 1.5, 1).place(x, top, z).lathe([[0.034, 0.12], [0.05, 0.085], [0.054, 0.07], [0.036, 0.1]], 8).pop();
    };
    let last = -999;
    for (let k = 0; k < M; k += 2) {
      const c = T.curve[k], r = c ? 1 / Math.abs(c) : 0;
      if (!c || k - last < 26 || (k % 9 !== 0 && r > 2.5)) continue;
      last = k;
      const p = P(k, Math.sign(c) * (C.wall + 0.55), top); cone(p.x, p.z, [1.8, 0.55, 0.08]);
      const q = P(k + 4, Math.sign(c) * (C.wall + 0.5), top); cone(q.x, q.z, [1.8, 0.55, 0.08]);
    }
    // ---- the stand against the table: its boards, steps, and a rail round it
    const sd = C.stand, sx = at.x, sz = sd.z, deck = this.data.heightAt(sx, sz) + sd.up;
    this.deck = deck;
    wood.tint(0.55, 0.37, 0.22, 1).box(sx - sd.w / 2, lo - 0.5, sz - sd.d / 2, sx + sd.w / 2, deck - 0.05, sz + sd.d / 2);
    wood.tint(0.7, 0.5, 0.3, 1).box(sx - sd.w / 2 - 0.05, deck - 0.05, sz - sd.d / 2, sx + sd.w / 2 + 0.05, deck, sz + sd.d / 2 + 0.05);
    wood.tint(0.62, 0.44, 0.27, 1).box(sx - 0.6, deck - 0.3, sz + sd.d / 2 + 0.05, sx + 0.6, deck - 0.22, sz + sd.d / 2 + 0.5);
    for (const s of [-1, 1]) wood.tint(0.5, 0.34, 0.2, 1).cylinder(sx + s * (sd.w / 2 - 0.04), deck, sz + sd.d / 2 - 0.04, 0.04, 0.04, 0.8, 6);
    wood.tint(0.5, 0.34, 0.2, 1).box(sx - sd.w / 2 + 0.04, deck + 0.7, sz + sd.d / 2 - 0.07, sx + sd.w / 2 - 0.04, deck + 0.78, sz + sd.d / 2 - 0.02);
    // ---- the arch on the grass, where one asks
    const g = C.gate, gy = this.data.heightAt(g.x, g.z);
    this.gate = { x: g.x, y: gy, z: g.z, yaw: g.yaw };
    gateArch(this.group, paint, g.x, gy, g.z, g.yaw, C.name.toUpperCase(), 'THREE LAPS · THREE RIVALS · THE FASTEST TIME', { tone: [1.5, 0.3, 0.12], ink: '#10222a' });
    this.group.add(parts.toMeshes(mats, { name: 'cars-table', layers: [LAYER.STATIC_CASTER] }));
    // ---- what moves: the four cars (one mesh), their flames, the mark on one's own
    const carMat = surfaceMaterial({ name: 'toy-cars', rough: 0.3, spec: 0.6 }), glow = surfaceMaterial({ name: 'toy-flame', rough: 0.9, spec: 0, emissive: [0.5, 0.25, 0.05] }), markMat = surfaceMaterial({ name: 'toy-mark', rough: 0.9, spec: 0, emissive: [0.45, 0.45, 0.3] });
    const ball = new THREE.Sphere(V(at.x, top, at.z), 16);
    this.cars = new THREE.InstancedMesh(carGeometry(), carMat, 4);
    this.flames = new THREE.InstancedMesh(flameGeometry(), glow, 4);
    for (const m of [this.cars, this.flames]) { m.boundingSphere = ball; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; this.group.add(m); }
    this.cars.name = 'cars-toys'; this.flames.name = 'cars-flames';
    PAINT.forEach((c, i) => this.cars.setColorAt(i, new THREE.Color(c[0], c[1], c[2])));
    this.flames.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mark = new THREE.Mesh(markGeometry(), markMat);
    this.mark.name = 'cars-mark'; this.mark.visible = false; this.mark.frustumCulled = false;
    this.group.add(this.mark);
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    return this;
  }

  setBest(ms) { this.best = ms || 0; }
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.5 * 2.5; }

  /**
   * A race is asked for: the player is put on the stand, and it begins at the count of three. `io`: { play, note,
   * splash }. Returns the session — the driver of the player (see lab/games/kit.js).
   */
  open(player, io) {
    const seed = (Math.floor(worldClock() / 97) % 99991) + 1, st = startRace(seed), events = [], input = { x: 0, y: 0, jump: false };
    const S = { count: 3, last: 4, acc: 0, after: 0, place: 4, since: 0, stand: V(C.at.x, this.deck, C.stand.z + 0.1) };
    const session = {
      cars: this, over: false, ended: false, score: 0, line: '', riding: false, anim: ANIM.idle, state: st, auto: false, seed,
      step: (dt, pl, control) => {
        const inp = pl.input;
        if (S.count > 0) {
          S.count -= Math.min(dt, 0.25);
          if (Math.ceil(S.count) !== S.last && S.count > 0) { S.last = Math.ceil(S.count); io.play('tick'); }
          if (S.count <= 0) io.play('start');
        } else if (session.auto) {
          S.acc += Math.min(dt, 0.25);
          while (S.acc >= STEP && !st.out) { S.acc -= STEP; botInput(st, input); stepRace(st, STEP, input, events); }
        } else if (!st.out) {
          input.x = control ? inp.move.x : 0; input.y = control ? inp.move.y : 0; input.jump = control && !!inp.jump;
          stepRace(st, dt, input, events);
        }
        for (const e of events) this._tell(e, st, io);
        events.length = 0;
        // (the place one holds: told when it has held for a moment, not at every touch of wheels)
        const place = placeOf(st, 0);
        if (S.count <= 0 && !st.over) {
          if (place !== S.place) { S.place = place; S.since = 0; } else if (S.since >= 0 && (S.since += dt) > 0.5 && st.clock > 2 && place !== S.told) { if (S.told) { io.play(place < S.told ? 'checkpoint' : 'tick', { volume: 0.4 }); io.note(place < S.told ? `${ORD[place - 1]} place!` : `Down to ${ORD[place - 1]}.`, 1400); } S.told = place; }
        }
        pl.pos.set(S.stand.x, S.stand.y, S.stand.z); pl.vel?.set(0, 0, 0); pl.yaw = Math.PI; pl.pitch = 0; pl.roll = 0; pl.speed = 0; pl.grounded = true;
        session.anim = ANIM.idle;
        if (st.over) {
          S.after += dt;
          if (!session.over) { session.over = true; session.score = st.time; }
          if (S.after > 4) session.ended = true;
        }
        const you = st.cars[0], now = Math.round(st.clock * 1000);
        session.line = S.count > 0 ? `${C.name} · ${Math.max(1, Math.ceil(S.count))}…`
          : st.out ? `${C.name} · time is up`
            : you.done ? `finished ${ORD[you.rank - 1]} · ${formatTime(you.time)}`
              : `lap ${lapOf(you)} of ${C.laps} · ${ORD[place - 1]} · ${formatTime(now)}`;
      },
      /** The camera: high over the middle of the table, looking straight down, the picture turned so that the long way of the table runs along the screen. */
      camera: (cam, dt) => {
        const portrait = cam.aspect < 1;
        st.view = portrait ? Math.PI / 2 : Math.PI; // ("up" on the screen: east for a phone held upright, north otherwise)
        const t = Math.tan((FOV * Math.PI) / 360), across = portrait ? C.half.x : C.half.z, wide = portrait ? C.half.z : C.half.x;
        const dist = Math.max((across + 0.2) / t, (wide + 0.2) / (t * cam.aspect));
        cam.position.set(C.at.x, this.top + dist, C.at.z);
        cam.up.set(Math.sin(st.view), 0, Math.cos(st.view));
        cam.lookAt(C.at.x, this.top, C.at.z);
        return FOV;
      },
      /** The race is over (or left): the player is put back on the grass, before the arch. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x, this.gate.z, this.gate.yaw); session.close(); },
      close: () => { if (this.session === session) { this.session = null; this._draw(null); } },
    };
    this.session = session;
    session.step(0, player, false);
    return session;
  }

  _tell(e, st, io) {
    const mine = e.car === 0;
    if (e.type === 'lap' && mine) { io.play('lap'); io.note(e.lap === C.laps ? 'Last lap!' : `Lap ${e.lap} of ${C.laps}`, 1600); }
    else if (e.type === 'finish' && mine) { io.play(e.place === 1 ? 'victory' : 'bell'); io.note(`${ORD[e.place - 1]} place · ${formatTime(e.time)}`, 4200); }
    else if (e.type === 'boost' && mine) io.play('boost', { volume: 0.5 });
    else if (e.type === 'pad' && mine) io.play('boost', { volume: 0.35 });
    else if (e.type === 'wall' && mine) io.play('hit', { volume: clamp(e.speed / 6, 0.2, 0.6) });
    else if (e.type === 'bump' && (mine || e.with === 0)) io.play('hit', { volume: clamp(e.speed / 5, 0.2, 0.5) });
    else if (e.type === 'drift' && mine) io.play('drift', { volume: 0.3 });
    else if (e.type === 'oil' && mine) { io.play('drift', { volume: 0.5 }); io.note('Oil!', 1000); }
    else if (e.type === 'jump' && mine) io.play('jump', { volume: 0.5 });
    else if (e.type === 'land' && mine) io.play('land', { volume: 0.6 });
    else if (e.type === 'wrong' && mine) io.note('Wrong way! Turn round.', 2200);
    else if (e.type === 'out') io.note('Time is up: the race is called off.', 3500);
  }

  /** Puts the cars where the race has them (`st`), or away (null). */
  _draw(st) {
    const n = st ? st.cars.length : 0;
    this.cars.count = n; this.flames.count = 0;
    this.mark.visible = !!st;
    if (!st) return;
    const at = C.at, y0 = this.tarmac, m = _m, q = _q, p = _p, e = _e;
    let f = 0;
    for (let i = 0; i < n; i++) {
      const c = st.cars[i], speed = Math.hypot(c.vx, c.vz);
      // (nose up on the ramp, along the way it flies in the air; leaning a little into a slide)
      const pitch = c.air ? Math.atan2(c.vy, Math.max(speed, 1)) : c.climb > 0.05 ? Math.atan2(C.ramp.high, C.ramp.length) : 0;
      p.set(at.x + c.x, y0 + c.y, at.z + c.z);
      q.setFromEuler(e.set(-pitch, c.yaw, clamp(c.slip * 0.03, -0.12, 0.12) * (c.drift ? 1 : 0), 'YXZ'));
      m.compose(p, q, _s.setScalar(1));
      this.cars.setMatrixAt(i, m);
      if (c.boost > 0) { this.flames.setMatrixAt(f++, m); }
      if (i === 0) { this.mark.position.set(p.x, p.y, p.z); this.mark.rotation.set(0, c.yaw, 0); this.mark.scale.setScalar(1 + 0.06 * Math.sin(worldClock() / 140)); }
    }
    this.flames.count = f;
    this.cars.instanceMatrix.needsUpdate = true; this.flames.instanceMatrix.needsUpdate = true;
    if (this.cars.instanceColor) this.cars.instanceColor.needsUpdate = true;
  }

  /** Every frame: the cars as the race has them. */
  update() {
    this._draw(this.session ? this.session.state : null);
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
void GATE;
