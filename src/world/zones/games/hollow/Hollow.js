// The Hollow Hill: what is seen of it and how it is flown. Its rules are in tunnel.js; here the cave is built —
// a ring of rock round its line, rough everywhere, with a flat floor; the columns, the teeth, the arches, the
// curtains and the beams of crystal; the rings; the lake; the lanterns and the crystals that light it — and
// a flight is run: a session that drives the player (see PlayerController.driver).
//
// The cave lies whole under the hill behind the sea cliff: nothing of it shows outside but the mouth of a mine
// at the foot of the cliff, where one asks to fly — and the cave itself is only drawn for who flies in it. No
// lamp is computed in it, as in the other caves of the valley: the light is painted in the vertices.
import * as THREE from 'three';
import { Parts } from '../../../props/MeshBuilder.js';
import { ANIM } from '../../../../player/Character.js';
import { canvasBoard } from '../Boards.js';
import { formatTime } from '../course.js';
import { HOLLOW, course, tunnelAt, tunnelPoint, stretchAt, startFlight, stepFlight, flightPose, botInput } from './tunnel.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2;
const h2 = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7 + 74.7) * 43758.5453; return s - Math.floor(s); };
const noise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v); return (h2(i, j) * (1 - a) + h2(i + 1, j) * a) * (1 - b) + (h2(i, j + 1) * (1 - a) + h2(i + 1, j + 1) * a) * b; };
const RING = 1.5, SEG = 24; // the rock: a ring of facets every so many metres, so many round
const DARK = [0.085, 0.095, 0.125]; // what is seen where no light reaches
const GOLD = [1.0, 0.78, 0.26];
// what lights each stretch: its colour, and whether it comes from lanterns or from crystals
const THEME = {
  'The Start Hall': { col: [1.0, 0.74, 0.4], lantern: true }, 'The Lantern Gallery': { col: [1.0, 0.72, 0.38], lantern: true },
  'The Forest of Columns': { col: [0.3, 0.85, 1.0] }, 'The Teeth': { col: [0.7, 0.45, 1.0] }, 'The Screw': { col: [0.5, 1.0, 0.45] },
  'The Lake': { col: [0.3, 0.6, 1.0] }, 'The Curtains': { col: [1.0, 0.6, 0.22], lantern: true }, 'The Narrows': { col: [1.0, 0.4, 0.25], lantern: true },
  'The Crystal Hall': { col: [1.0, 0.45, 0.9] }, 'The Way Home': { col: [1.0, 0.8, 0.5], lantern: true },
};

export class Hollow {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'hollow';
    this.session = null;
    this.best = 0;
  }

  build() {
    const world = this.world, mats = world.materials, H = HOLLOW, C = course(), L = C.length, parts = new Parts();
    const rock = parts.get('cave'), glow = parts.get('glow'), wood = parts.get('woodDark'), paint = parts.get('paint'), matte = parts.get('matte');
    const f = {}, g = {}, P = (s, u, v) => { const p = tunnelPoint(s, u, v, g); return V(p.x, p.y, p.z); };
    const theme = (s) => THEME[C.stretches[stretchAt(s)].name] || THEME['The Start Hall'];
    const wrap = (s) => ((s % L) + L) % L;

    // ---- the lights: along the walls, by every thing in the way, in every ring
    const lights = [], lamps = [];
    const light = (s, u, v, col, r, power = 1) => { const p = P(s, u, v); lights.push({ s: wrap(s), x: p.x, y: p.y, z: p.z, r, col, power }); return p; };
    for (let s = 3, k = 0; s < L - 2; s += 8.5, k++) {
      tunnelAt(s, f);
      const t = theme(s), side = k % 2 ? 1 : -1, low = !t.lantern && k % 3 === 0, a = low ? -0.5 : 0.62, u = side * (f.a - 0.15) * Math.cos(a) * (low ? 0.75 : 1), v = low ? -f.b * H.floor + 0.25 : (f.b - 0.15) * Math.sin(a);
      lamps.push({ p: light(s, u * 0.93, v * 0.93, t.col, 4.4 + f.a * 0.3, 1.45), lantern: !!t.lantern, col: t.col, s, u, v, low });
    }
    for (const t of C.things) {
      const col = theme(t.s).col, pale = [col[0] * 0.8 + 0.2, col[1] * 0.8 + 0.2, col[2] * 0.8 + 0.2];
      if (t.kind === 'curtain') { light(t.s - 1.2, t.u, t.v, GOLD, 3.4, 1.0); continue; }
      const mu = (t.u1 + t.u2) / 2, mv = (t.v1 + t.v2) / 2, len = Math.hypot(t.u2 - t.u1, t.v2 - t.v1);
      light(t.s - 2.2, mu * 0.85, mv * 0.6, pale, 3.6 + len * 0.1, t.kind === 'beam' ? 1.6 : 0.95);
      if (len > 11) { light(t.s - 2, t.u1 * 0.9, t.v1 * 0.7, pale, 4, 0.8); light(t.s - 2, t.u2 * 0.9, t.v2 * 0.7, pale, 4, 0.8); }
    }
    for (const r of C.rings) light(r.s, r.u, r.v, GOLD, 3.6, 1.2);
    for (const u of [-6, 0, 6]) light(0, u, -tunnelAt(0, f).b * H.floor + 1.2, [1, 0.85, 0.55], 5, 0.9); // (the line)
    const buckets = [];
    for (let b = 0; b * 10 < L; b++) buckets.push(lights.filter((l) => { let d = Math.abs(l.s - (b * 10 + 5)); if (d > L / 2) d = L - d; return d < 48; }));
    /** The light at a place of the cave (which is near `s` along its line), as a colour. */
    const lit = (s, p, gain = 1) => {
      let r = DARK[0], gg = DARK[1], b = DARK[2];
      for (const l of buckets[Math.min(buckets.length - 1, Math.floor(wrap(s) / 10))]) {
        const d = Math.hypot(p.x - l.x, p.y - l.y, p.z - l.z), q = 1 - d / (3.4 * l.r);
        if (q <= 0) continue;
        const w = (l.power * q * q) / (1 + (d / l.r) ** 2);
        r += l.col[0] * w; gg += l.col[1] * w; b += l.col[2] * w;
      }
      return [Math.min(1.7, r * gain), Math.min(1.7, gg * gain), Math.min(1.7, b * gain), 1];
    };

    // ---- the rock: a ring of facets round the line, rough, with a flat floor
    const Mr = Math.round(L / RING), step = L / Mr, rings = [];
    for (let k = 0; k < Mr; k++) {
      const s = k * step, row = [];
      tunnelAt(s, f);
      for (let j = 0; j < SEG; j++) {
        const a = (j / SEG) * TAU, cu = Math.cos(a), cv = Math.sin(a);
        // (never more than four tenths of a metre inside where the rules have the wall: the flyer keeps half a metre off it)
        const d = (noise(s * 0.21 + 2.7 * cu, 2.7 * cv + 11) - 0.36) * 1.1 + (noise(s * 0.6 + 5.1 * cu + 40, 5.1 * cv) - 0.5) * 0.3;
        const u = (f.a + d) * cu, floor = -f.b * H.floor + (noise(s * 0.3, u * 0.4 + 50) - 0.5) * 0.3;
        const p = P(s, u, Math.max(floor, (f.b + d) * cv));
        row.push({ p, c: lit(s, p) });
      }
      rings.push(row);
    }
    for (let k = 0; k < Mr; k++) {
      const r0 = rings[k], r1 = rings[(k + 1) % Mr];
      for (let j = 0; j < SEG; j++) {
        const a = r0[j], b = r0[(j + 1) % SEG], c = r1[(j + 1) % SEG], d = r1[j];
        rock.quad(a.p, b.p, c.p, d.p, { colors: [a.c, b.c, c.c, d.c], u0: j * 1.4, v0: k * RING });
      }
    }

    // ---- the water of the lake: wherever the floor is lower than its level
    for (let k = 0; k < Mr; k++) {
      const s0 = k * step, s1 = s0 + step, wide = (s) => { tunnelAt(s, f); return f.water > -f.b * H.floor - 0.1 ? [f.water, f.a * Math.sqrt(Math.max(0, 1 - (f.water / f.b) ** 2)) + 0.8] : null; };
      const w0 = wide(s0), w1 = wide(s1);
      if (!w0 || !w1) continue;
      const a = P(s0, -w0[1], w0[0]), b = P(s0, w0[1], w0[0]), c = P(s1, w1[1], w1[0]), d = P(s1, -w1[1], w1[0]);
      const tone = (p) => { const q = lit(s0, p, 0.14); return [0.004 + q[0], 0.012 + q[1], 0.02 + q[2], 1]; };
      paint.quad(a, b, c, d, { colors: [tone(a), tone(b), tone(c), tone(d)] });
    }

    // ---- what is in the way
    const studs = (s, pts, col) => { for (const p of pts) { tunnelAt(s, f); const out = V(-f.tx, 0.15, -f.tz).multiplyScalar(0.3); glow.tint(col[0] * 0.55, col[1] * 0.55, col[2] * 0.55, 1).rod(p, p.clone().add(out), 0.075, 4, { r1: 0.012, caps: false }); } };
    const toward = (s, p, r) => { tunnelAt(s, f); return V(p.x - f.tx * r, p.y, p.z - f.tz * r); }; // (the side of a thing that faces who comes)
    for (const t of C.things) {
      const col = theme(t.s).col, tone = (p) => { const q = lit(t.s - 1.2, p, 0.92); return rock.tint(q[0] + 0.03, q[1] + 0.03, q[2] + 0.035, 1); };
      if (t.kind === 'curtain') {
        // a wall of rock across the cave, with one hole, ragged at the edge
        const N = 30, edge = [], near = [], far = [];
        for (let i = 0; i < N; i++) { const a = (i / N) * TAU, r = t.r + 0.08 + 0.2 * h2(i, t.id), at = (q) => [t.u + q * Math.cos(a), t.v + q * Math.sin(a)]; edge.push(at(r)); near.push(at(r + 3.2)); far.push(at(30)); }
        const shade = (uv) => lit(t.s - 1.2, P(t.s - 0.36, ...uv), 0.9), cE = edge.map(shade), cN = near.map(shade), cF = [DARK[0] * 1.3, DARK[1] * 1.3, DARK[2] * 1.3, 1];
        for (let i = 0; i < N; i++) {
          const k = (i + 1) % N, e0 = edge[i], e1 = edge[k], n0 = near[i], n1 = near[k], f0 = far[i], f1 = far[k];
          // (the face one comes at: lit round the hole, dark further out; the other face; the inside of the hole)
          rock.quad(P(t.s - 0.36, ...e0), P(t.s - 0.36, ...n0), P(t.s - 0.36, ...n1), P(t.s - 0.36, ...e1), { colors: [cE[i], cN[i], cN[k], cE[k]] });
          rock.quad(P(t.s - 0.36, ...n0), P(t.s - 0.36, ...f0), P(t.s - 0.36, ...f1), P(t.s - 0.36, ...n1), { colors: [cN[i], cF, cF, cN[k]] });
          rock.quad(P(t.s + 0.36, ...e0), P(t.s + 0.36, ...e1), P(t.s + 0.36, ...f1), P(t.s + 0.36, ...f0), { color: cF });
          rock.quad(P(t.s - 0.36, ...e0), P(t.s - 0.36, ...e1), P(t.s + 0.36, ...e1), P(t.s + 0.36, ...e0), { colors: [cE[i], cE[k], cF, cF] });
        }
        continue;
      }
      const p1 = P(t.s, t.u1, t.v1), p2 = P(t.s, t.u2, t.v2);
      if (t.kind === 'column') {
        // thick at the foot and at the head, a waist between
        const lo = P(t.s, t.u1, t.v1 - 0.5), hi = P(t.s, t.u2, t.v2 + 0.7), n = 5, shape = [1.3, 0.96, 0.88, 0.9, 0.98, 1.35];
        for (let i = 0; i < n; i++) { const a = lo.clone().lerp(hi, i / n), b = lo.clone().lerp(hi, (i + 1) / n); tone(a.clone().lerp(b, 0.5)).rod(a, b, t.r1 * shape[i], 9, { r1: t.r1 * shape[i + 1], caps: false }); }
        studs(t.s, [0.22, 0.5, 0.78].map((q) => toward(t.s, lo.clone().lerp(hi, q), t.r1 * 0.86)), col);
      } else if (t.kind === 'stalactite' || t.kind === 'stalagmite') {
        const base = P(t.s, t.u1, t.v1 + (t.kind === 'stalactite' ? 0.7 : -0.5)), mid = base.clone().lerp(p2, 0.55);
        tone(base.clone().lerp(mid, 0.5)).rod(base, mid, t.r1, 8, { r1: t.r1 * 0.5, caps: false });
        tone(mid.clone().lerp(p2, 0.5)).rod(mid, p2, t.r1 * 0.5, 8, { r1: 0.14, caps: false });
        glow.tint(col[0] * 0.6, col[1] * 0.6, col[2] * 0.6, 1).place(p2.x, p2.y, p2.z).lathe([[0, -0.2], [0.13, -0.08], [0.13, 0.08], [0, 0.2]], 6).pop();
        studs(t.s, [toward(t.s, base.clone().lerp(p2, 0.3), t.r1 * 0.7)], col);
      } else if (t.kind === 'boulder') {
        // a knuckle of rock, out from the wall on a thick neck
        tunnelAt(t.s, f);
        const side = Math.sign(t.u1) || 1, root = P(t.s, side * (f.a + 0.6), t.v1 * 0.9), r = t.r1 * 0.97;
        tone(p1).place(p1.x, p1.y, p1.z, h2(t.id, 3) * TAU).lathe([[0, -r], [r * 0.6, -r * 0.82], [r * 0.96, -r * 0.3], [r, r * 0.15], [r * 0.75, r * 0.7], [0, r]], 9).pop();
        tone(root.clone().lerp(p1, 0.5)).rod(root, p1, r * 1.05, 8, { r1: r * 0.72, caps: false });
        studs(t.s, [toward(t.s, p1.clone().add(V(0, r * 0.4, 0)), r * 0.85), toward(t.s, p1.clone().add(V(0, -r * 0.4, 0)), r * 0.85)], col);
      } else if (t.kind === 'arch') {
        // a bridge of rock from wall to wall
        const n = 7, pts = []; for (let i = 0; i <= n; i++) pts.push(P(t.s, (t.u1 - 0.8) + ((t.u2 - t.u1 + 1.6) * i) / n, t.v1 + (i === 0 || i === n ? -0.25 : 0.08 * Math.sin(i * 2.1 + t.id))));
        for (let i = 0; i < n; i++) tone(pts[i].clone().lerp(pts[i + 1], 0.5)).rod(pts[i], pts[i + 1], t.r1 * (0.88 + 0.1 * h2(i, t.id)), 8, { r1: t.r1 * (0.88 + 0.1 * h2(i + 1, t.id)), caps: false });
        studs(t.s, [1, 2.5, 3.5, 4.5, 6].map((q) => toward(t.s, pts[Math.floor(q)].clone().lerp(pts[Math.ceil(q)], q % 1), t.r1 * 0.85)), col);
      } else if (t.kind === 'beam') {
        // a great crystal from wall to wall
        const d = p2.clone().sub(p1).normalize(), a = p1.clone().addScaledVector(d, -1.5), b = p2.clone().addScaledVector(d, 1.5);
        glow.tint(col[0] * 0.24, col[1] * 0.24, col[2] * 0.24, 1).rod(a, b, t.r1 * 0.96, 6, { caps: false });
        glow.tint(0.5, 0.5, 0.55, 1).rod(a, b, t.r1 * 0.3, 4, { caps: false });
      }
    }

    // ---- the lanterns and the crystals on the walls; glow-worms on the roof of the Screw
    for (const l of lamps) {
      tunnelAt(l.s, f);
      const wall = P(l.s, l.u * 1.04, l.v * 1.04);
      if (l.lantern) {
        const p = l.p.clone().add(V(0, -0.25, 0));
        wood.tint(0.5, 0.5, 0.55, 1).rod(wall.clone().add(V(0, 0.3, 0)), l.p.clone().add(V(0, 0.3, 0)), 0.03, 4, { caps: false }).rod(l.p.clone().add(V(0, 0.3, 0)), p.clone().add(V(0, 0.16, 0)), 0.015, 4, { caps: false });
        glow.tint(1, 0.8, 0.45, 1).box(p.x - 0.1, p.y - 0.14, p.z - 0.1, p.x + 0.1, p.y + 0.14, p.z + 0.1);
        wood.tint(0.4, 0.4, 0.45, 1).box(p.x - 0.13, p.y + 0.14, p.z - 0.13, p.x + 0.13, p.y + 0.18, p.z + 0.13);
      } else {
        for (let k = 0; k < 5; k++) {
          const tip = l.p.clone().lerp(wall, 0.2).add(V((h2(k, l.s) - 0.5) * 1.1, l.low ? 0.5 + 0.9 * h2(k + 9, l.s) : (h2(k + 9, l.s) - 0.4) * 1.0, (h2(k + 5, l.s) - 0.5) * 1.1));
          const tone = k % 2 ? 0.5 : 0.36;
          glow.tint(l.col[0] * tone, l.col[1] * tone, l.col[2] * tone, 1).rod(wall.clone().add(V((h2(k, l.s + 3) - 0.5) * 0.5, l.low ? -0.2 : 0, (h2(k + 2, l.s) - 0.5) * 0.5)), tip, 0.13 + 0.07 * h2(k, l.s + 7), 5, { r1: 0.015, caps: false });
        }
      }
    }
    const screw = C.stretches.find((q) => q.name === 'The Screw');
    for (let k = 0; k < 220; k++) {
      const s = screw.from + (screw.to - screw.from) * h2(k, 1), a = 0.5 + 2.1 * h2(k, 2);
      tunnelAt(s, f);
      const p = P(s, (f.a - 0.1) * Math.cos(a), (f.b - 0.1) * Math.sin(a)), q = 0.03 + 0.03 * h2(k, 3);
      glow.tint(0.25, 0.8, 0.3, 1).box(p.x - q, p.y - q, p.z - q, p.x + q, p.y + q, p.z + q);
    }

    // ---- the line: a hoop of lights round the Start Hall, a chequered strip on its floor (nothing across the way)
    tunnelAt(0, f);
    const floor = -f.b * H.floor;
    for (let j = 0; j < 44; j++) {
      const a = (j / 44) * TAU, v = (f.b - 0.2) * Math.sin(a);
      if (v < floor + 0.3) continue;
      const p = P(0, (f.a - 0.2) * Math.cos(a), v);
      glow.tint(1.0, 0.72, 0.2, 1).place(p.x, p.y, p.z).lathe([[0, -0.13], [0.11, -0.05], [0.11, 0.05], [0, 0.13]], 6).pop();
    }
    for (let i = -7; i < 7; i++) for (let j = 0; j < 2; j++) { const a = P(-0.8 + j * 0.8, i, floor + 0.2), b = P(-0.8 + j * 0.8, i + 1, floor + 0.2), c = P(j * 0.8, i + 1, floor + 0.2), d = P(j * 0.8, i, floor + 0.2), w = (i + j) & 1 ? 1.5 : 0.06; paint.tint(w, w, w, 1).quad(a, b, c, d); }
    // (the cave itself is drawn only for who flies in it: nobody else can see any of it — it is under the hill —
    // and what is not drawn costs nothing)
    this.inside = new THREE.Group(); this.inside.name = 'hollow-inside'; this.inside.visible = false;
    this.inside.add(parts.toMeshes(mats, { name: 'hollow-cave', layers: [] }));
    this.group.add(this.inside);

    // ---- the rings: each one by itself, to be put out when it is flown through
    this.rings = C.rings.map((r) => {
      const p = new Parts(), b = p.get('glow'), n = 20;
      for (let i = 0; i < n; i++) { const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU; b.tint(1.0, 0.7, 0.16, 1).rod(P(r.s, r.u + r.r * Math.cos(a0), r.v + r.r * Math.sin(a0)), P(r.s, r.u + r.r * Math.cos(a1), r.v + r.r * Math.sin(a1)), 0.1, 5, { caps: false }); }
      const m = p.toMeshes(mats, { name: 'hollow-ring', layers: [] });
      this.inside.add(m);
      return m;
    });

    // ---- outside: the mouth of a mine at the foot of the cliff, its name, the board of one's best time
    const out = new Parts(), M = H.mouth, timber = out.get('woodDark'), black = out.get('matte'), lamp = out.get('glow'), iron = out.get('paint');
    const mz = M.z + 1.8, my = this.data.heightAt(M.x, mz) - 0.15, top = my + 2.75;
    for (const side of [-1, 1]) timber.tint(0.95, 0.9, 0.85, 1).box(M.x + side * 1.45 - 0.14, my - 0.6, mz - 0.14, M.x + side * 1.45 + 0.14, top, mz + 0.14).beam(V(M.x + side * 1.45, my + 1.5, mz - 0.02), V(M.x + side * 0.55, top - 0.1, mz - 0.02), 0.12, 0.12);
    timber.box(M.x - 1.85, top, mz - 0.2, M.x + 1.85, top + 0.3, mz + 0.2);
    black.tint(0.012, 0.012, 0.016, 1).box(M.x - 1.4, my - 0.6, mz + 0.3, M.x + 1.4, top, mz + 0.36);
    lamp.tint(1, 0.8, 0.45, 1).box(M.x - 0.1, top - 0.5, mz - 0.4, M.x + 0.1, top - 0.24, mz - 0.2);
    for (const side of [-0.45, 0.45]) { let prev = null; for (let z = mz + 0.2; z > M.z - 2.6; z -= 0.8) { const p = V(M.x + side, this.data.heightAt(M.x + side, z) + 0.09, z); if (prev) iron.tint(0.32, 0.3, 0.3, 1).rod(prev, p, 0.035, 4, { caps: false }); prev = p; } }
    for (let z = mz - 0.2; z > M.z - 2.4; z -= 0.7) { const y = this.data.heightAt(M.x, z); timber.tint(0.8, 0.75, 0.7, 1).beam(V(M.x - 0.75, y + 0.04, z), V(M.x + 0.75, y + 0.04, z), 0.16, 0.08); }
    this.group.add(out.toMeshes(mats, { name: 'hollow-mouth', layers: [] }));
    const name = canvasBoard(1024, 200, (ctx, w, h) => {
      ctx.fillStyle = '#16121f'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = "700 92px Georgia, 'Times New Roman', serif"; ctx.fillText(H.name.toUpperCase(), w / 2, 84, w * 0.9);
      ctx.fillStyle = '#f2c14e'; ctx.font = '600 34px system-ui, sans-serif'; ctx.fillText('A RACE FLOWN UNDER THE GROUND · ONE LAP AGAINST THE CLOCK', w / 2, 158, w * 0.9);
    }, 3.6, 0.7, { both: false });
    name.mesh.position.set(M.x, top + 0.75, mz - 0.22); name.mesh.rotation.y = Math.PI; name.mesh.name = 'hollow-name';
    this.group.add(name.mesh);
    this.board = canvasBoard(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#16121f'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f6e7b8'; ctx.font = '600 27px system-ui, sans-serif';
      ['You fly by yourself: steer,', 'burst, and miss the rock.'].forEach((t, k) => ctx.fillText(t, w / 2, 52 + k * 38, w * 0.9));
      ctx.fillStyle = '#f2c14e'; ctx.font = '700 40px system-ui, sans-serif'; ctx.fillText(this.best ? `Your best  ${formatTime(this.best)}` : 'Not flown yet', w / 2, 190, w * 0.9);
    }, 1.5, 0.75, { both: false });
    const bx = M.x + 2.6, bz = mz - 0.6, by = this.data.heightAt(bx, bz);
    { const post = new Parts(); post.get('woodDark').tint(0.9, 0.85, 0.8, 1).cylinder(bx, by - 0.2, bz + 0.04, 0.06, 0.06, 1.4, 6); this.group.add(post.toMeshes(mats, { name: 'hollow-post', layers: [] })); }
    this.board.mesh.position.set(bx, by + 1.55, bz); this.board.mesh.rotation.y = Math.PI - 0.35; this.board.mesh.name = 'hollow-board';
    this.group.add(this.board.mesh);
    this.gate = { x: M.x, z: M.z, y: this.data.heightAt(M.x, M.z), yaw: M.yaw };
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    return this;
  }

  setBest(ms) { this.best = ms || 0; this.board?.redraw(); }
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.5 * 2.5; }

  /**
   * A flight is asked for: the player is put in the Start Hall, and is off when the count is done. `io`:
   * { play, note }. Returns the session — the driver of the player: step(dt, player, control), camera(camera, dt),
   * line, over (`time` in ms), ended, drop(player), close(), auto (true: it flies by itself).
   */
  open(player, io) {
    const H = HOLLOW, C = course(), events = [], input = { x: 0, y: 0, burst: false }, st = startFlight();
    const S = { cam: null, look: V(0, 0, 0), after: 0, acc: 0, last: 9, shake: 0, fov: 70, was: false, hold: false }, _t = V(0, 0, 0), pose = {}, p = {};
    for (const m of this.rings) m.visible = true;
    this.inside.visible = true;
    const session = {
      hollow: this, over: false, ended: false, time: 0, line: '', riding: false, anim: ANIM.swim, state: st, auto: false,
      step: (dt, pl, control) => {
        const inp = pl.input;
        if (!st.gone) { const n = Math.ceil(st.wait); if (n !== S.last && n > 0 && n <= H.count) { S.last = n; io.play('tick'); } }
        if (session.auto) {
          S.acc += Math.min(dt, 0.25);
          while (S.acc >= H.step && !st.over) { S.acc -= H.step; botInput(st, input); stepFlight(st, H.step, input, events); }
        } else {
          // (the burst: held on a keyboard — Space, or Shift; on a touch screen a tap of the arrow starts it, another stops it)
          if (control && inp.isTouch && inp.jump) S.hold = !S.hold;
          if (st.gauge <= 0 || st.stun > 0 || !st.gone) S.hold = false;
          input.x = control ? inp.move.x : 0; input.y = control ? inp.move.y : 0; input.burst = control && (inp.rise > 0 || !!inp.run || S.hold);
          if (!st.over) stepFlight(st, dt, input, events);
        }
        for (const e of events) {
          if (e.type === 'go') io.play('start');
          else if (e.type === 'crash') { io.play('whack'); S.shake = 0.35; }
          else if (e.type === 'knock') { io.play('hit', { volume: 0.5 }); S.shake = Math.max(S.shake, 0.15); }
          else if (e.type === 'ring') { io.play('pick'); this.rings[e.id].visible = false; }
          else if (e.type === 'over') { io.play('bell'); io.play('victory', { volume: 0.7 }); io.note(`${H.name}: ${formatTime(e.time)}${st.hits ? '' : ' — and not a scratch'}`); }
        }
        events.length = 0;
        if (st.bursting && !S.was) io.play('boost', { volume: 0.5 });
        S.was = st.bursting;
        if (st.over) {
          // past the line: on a little way, slowing, then out
          S.after += dt; st.s += Math.max(3, 16 - S.after * 6) * dt; st.vu *= 0.9; st.vv *= 0.9;
          if (!session.over) { session.over = true; session.time = st.time; }
          if (S.after > 2.6) session.ended = true;
        }
        flightPose(st, pose);
        pl.pos.set(pose.x, pose.y - 0.5, pose.z); pl.yaw = pose.yaw; pl.pitch = st.stun > 0 ? pose.pitch + Math.sin(st.stun * 25) * 0.6 : pose.pitch; pl.roll = pose.roll;
        pl.speed = st.speed; pl.grounded = false;
        const name = C.stretches[st.stretch].name, n = Math.round(clamp(st.gauge, 0, 1) * 8);
        session.line = !st.gone ? `${H.name} · ${Math.max(1, Math.ceil(st.wait))}…`
          : st.over ? `${H.name} · ${formatTime(st.time)}${st.hits ? ` · ${st.hits} knock${st.hits === 1 ? '' : 's'}` : ' · clean'}`
            : `${formatTime(Math.round(st.clock * 1000))} · ${name} · ${st.bursting ? 'BURST' : 'burst'} ${'█'.repeat(n)}${'░'.repeat(8 - n)}${st.hits ? ` · ${st.hits} knock${st.hits === 1 ? '' : 's'}` : ''}`;
      },
      /** The camera: in the cave behind the flyer, a little nearer the middle than it is, looking where it goes. */
      camera: (cam, dt) => {
        const back = st.gone ? 6.2 : 7.5, fast = clamp((st.speed + st.extra - H.cruise) / (H.burst - H.cruise), 0, 1.3);
        tunnelAt(st.s - back, p);
        const lowest = -p.b * H.floor + 0.9, cu = clamp(st.u * 0.8, -(p.a - 1.5), p.a - 1.5), cv = clamp(st.v * 0.8 + 0.95, Math.max(lowest, p.water + 0.7), p.b - 1.3);
        const c = tunnelPoint(st.s - back, cu, cv, p);
        _t.set(c.x, c.y, c.z);
        if (S.shake > 0) { S.shake -= dt; _t.x += (Math.random() - 0.5) * S.shake; _t.y += (Math.random() - 0.5) * S.shake; }
        if (!S.cam) S.cam = _t.clone(); else S.cam.lerp(_t, Math.min(1, dt * 14));
        const l = tunnelPoint(st.s + 11, st.u * 0.55, st.v * 0.55, p);
        _t.set(l.x, l.y, l.z);
        S.look.lerp(_t, S.look.lengthSq() ? Math.min(1, dt * 12) : 1);
        cam.position.copy(S.cam); cam.up.set(0, 1, 0); cam.lookAt(S.look);
        S.fov += (72 + 9 * fast - S.fov) * Math.min(1, dt * 4);
        return S.fov;
      },
      /** The flight is over (or left): the player is put back outside, before the mouth of the mine. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x, this.gate.z, this.gate.yaw); session.close(); },
      close: () => { if (this.session === session) this.session = null; player.pitch = 0; player.roll = 0; for (const m of this.rings) m.visible = true; this.inside.visible = false; },
    };
    this.session = session;
    session.step(0, player, false);
    return session;
  }

  update() { /* nothing moves in the cave but who flies in it */ }
}
