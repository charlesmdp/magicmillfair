// Little Mine Train: what is seen of it and how it is driven. Its rules are in rules.js; here the line is built —
// two rusty rails on sleepers, on low timber over the ground and on trestles over the gullies; a wooden station
// at the foot of the mountain; the mouths of timber where the line goes into the rock; a rock needle with the
// line wound round it; boards before each thing to do (blue: lean that way — red: brake — yellow and black: hop
// — green: the fork); nuggets; signals — and a run is driven: a session that drives the player (plug.js).
//
// What is inside the mountain — the lift, the tunnels, the fork, the drop, the lake — is an inside of the game's
// own, drawn only for who rides (the ground of the world is not dug): from outside one sees the mouths. A train
// is drawn under every visitor who rides.
import * as THREE from 'three';
import { Parts } from '../../../props/MeshBuilder.js';
import { ANIM } from '../../../../player/Character.js';
import { formatTime } from '../course.js';
import { gateArch, nextStart, STARTS, worldClock } from '../gates.js';
import { MINE, course, railAt, startRun, stepRun, cartPose, botInput } from './rules.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2;
const h1 = (n) => { const s = Math.sin(n * 127.1 + 74.7) * 43758.5453; return s - Math.floor(s); };
const INSIDE = new Set(['rock', 'lift', 'hall', 'lake']);
const GAUGE = 0.46; // half the width between the rails
const RUST = [0.5, 0.25, 0.14], WOOD = [0.62, 0.45, 0.3], DARK = [0.06, 0.055, 0.07];
const LAMP = { rock: [1.0, 0.66, 0.3], lift: [1.0, 0.5, 0.2], hall: [1.0, 0.8, 0.45], lake: [0.3, 0.85, 1.0] };

export class Mine {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'mine';
    this.session = null;
    this.best = 0;
    this.clock = worldClock;
  }

  /** A place by the rails: `u` to the right of them at `s`, `v` above them (square to them). */
  at(s, u = 0, v = 0, way = 0) {
    const r = railAt(s, way, this._r || (this._r = {})), c = 1 / Math.hypot(1, r.slope), sy = Math.sin(r.yaw), cy = Math.cos(r.yaw);
    // (forward: (sy·c, -slope·c, cy·c) — right: (-cy, 0, sy) — up: right × forward)
    return V(r.x - cy * u + sy * r.slope * c * v, r.y + c * v, r.z + sy * u + cy * r.slope * c * v);
  }

  build() {
    const world = this.world, mats = world.materials, C = course(), L = C.length, F = C.fork, ground = (x, z) => this.data.heightAt(x, z);
    this.inside = new THREE.Group(); this.inside.name = 'mine-inside'; this.inside.visible = false;
    this.mouths = new THREE.Group(); this.mouths.name = 'mine-mouths';
    // ---- the pieces: the line is cut every sixty metres, what is inside the rock apart from what is outside
    const pieces = [], kindAt = (s, way) => (way ? 'hall' : C.pts[clamp(Math.round(s / C.ds), 0, C.n - 1)].kind);
    const piece = (s, way = 0) => {
      const inside = INSIDE.has(kindAt(s, way)), key = `${way}:${inside ? 'i' : 'o'}:${Math.floor(s / 60)}`;
      let p = pieces.find((q) => q.key === key);
      if (!p) pieces.push(p = { key, inside, parts: new Parts() });
      return p.parts;
    };
    const gapAt = (s, way) => C.gaps.some((g) => (g.way === -1 || g.way === way) && s > g.s - 0.2 && s < g.s + g.len + 0.2);
    // ---- the lamps of the insides, and the light they paint on the rock
    const lamps = [];
    for (let s = 44, k = 0; s < L - 30; s += 11, k++) { const kind = kindAt(s, 0); if (INSIDE.has(kind)) lamps.push({ s, way: 0, side: k % 2 ? 1 : -1, kind, p: this.at(s, (k % 2 ? 1 : -1) * (kind === 'lake' ? 5.5 : 2.0), 3.1) }); }
    for (let s = F.s0 + 9, k = 0; s < F.s0 + F.len - 6; s += 11, k++) lamps.push({ s, way: 1, side: k % 2 ? 1 : -1, kind: 'hall', p: this.at(s, (k % 2 ? 1 : -1) * 2.0, 3.1, 1) });
    const lit = (p, gain = 1) => {
      let r = DARK[0], g = DARK[1], b = DARK[2];
      for (const l of lamps) { const d2 = (p.x - l.p.x) ** 2 + (p.y - l.p.y) ** 2 + (p.z - l.p.z) ** 2; if (d2 > 400) continue; const w = 1.15 / (1 + d2 / 10), c = LAMP[l.kind]; r += c[0] * w; g += c[1] * w; b += c[2] * w; }
      return [Math.min(1.5, r * gain), Math.min(1.5, g * gain), Math.min(1.5, b * gain), 1];
    };

    // ---- the rails and the sleepers, the whole line and the short way of the fork
    const lay = (from, to, way) => {
      for (let s = from; s < to - 0.01; s += 1) {
        const e = Math.min(to, s + 1), inside = INSIDE.has(kindAt(s, way)), P = piece(s, way), iron = P.get(inside ? 'cave' : 'paint'), wood = P.get(inside ? 'cave' : 'woodDark');
        if (gapAt(s + 0.5, way)) continue;
        for (const side of [-1, 1]) {
          const a = this.at(s, side * GAUGE, 0.12, way), b = this.at(e, side * GAUGE, 0.12, way), c = inside ? lit(a, 1.6) : null;
          iron.tint(...(inside ? [RUST[0] * c[0] + 0.05, RUST[1] * c[1] + 0.03, RUST[2] * c[2] + 0.02] : RUST), 1).beam(a, b, 0.08, 0.1);
        }
        const m = this.at(s + 0.5, 0, 0, way), c = inside ? lit(m, 1.3) : null;
        wood.tint(...(inside ? [WOOD[0] * c[0] + 0.03, WOOD[1] * c[1] + 0.025, WOOD[2] * c[2] + 0.02] : [0.85, 0.75, 0.68]), 1).beam(this.at(s + 0.5, -0.78, 0, way), this.at(s + 0.5, 0.78, 0, way), 0.2, 0.12);
      }
    };
    lay(0, L, 0); lay(F.s0, F.s0 + F.len, 1);

    // ---- outside: the timber the line stands on — low bents over the ground, tall braced ones over the gullies
    const spiral = (() => { const i = C.stretches.findIndex((q) => q.name === 'The Spiral'); return { from: C.stretches[i].from, to: C.stretches[i + 1].from }; })();
    for (let s = 2; s < L - 1; s += 3) {
      const kind = kindAt(s, 0);
      if (INSIDE.has(kind)) continue;
      const P = piece(s, 0), wood = P.get('woodDark'), top = this.at(s, 0, -0.06), r = railAt(s, 0, {}), rx = -Math.cos(r.yaw), rz = Math.sin(r.yaw);
      // (two stringers under the sleepers)
      for (const side of [-1, 1]) wood.tint(0.8, 0.7, 0.62, 1).beam(this.at(s - 1.5, side * 0.5, -0.15), this.at(s + 1.5, side * 0.5, -0.15), 0.14, 0.2);
      if (Math.round((s - 2) / 3) % 2) continue;
      const wound = s > spiral.from - 2 && s < spiral.to + 2; // (round the rock the line passes under itself: plain posts, the turn below runs between them)
      const feet = [-1, 1].map((side) => { const up = top.y - ground(top.x + rx * side * 0.9, top.z + rz * side * 0.9), splay = wound ? 1.15 + Math.max(0, up) * 0.11 : 0.9 + Math.max(0, up) * 0.09, x = top.x + rx * side * splay, z = top.z + rz * side * splay; return { side, x, z, y: ground(x, z) - 0.5 }; });
      const high = top.y - Math.min(feet[0].y, feet[1].y);
      if (high < 0.75) continue;
      const thick = high > 6 ? 0.26 : 0.2;
      for (const f of feet) wood.tint(0.9, 0.8, 0.7, 1).beam(V(f.x, f.y, f.z), V(top.x + rx * f.side * (wound ? 1.05 : 0.8), top.y - 0.2, top.z + rz * f.side * (wound ? 1.05 : 0.8)), thick, thick);
      wood.tint(1.0, 0.88, 0.76, 1).beam(V(top.x - rx * 1.05, top.y - 0.3, top.z - rz * 1.05), V(top.x + rx * 1.05, top.y - 0.3, top.z + rz * 1.05), 0.22, 0.22);
      // (every four metres down: a tie across, and a brace)
      const post = (f, y) => { const t = clamp((y - f.y) / (top.y - 0.2 - f.y), 0, 1); return V(f.x + (top.x + rx * f.side * 0.8 - f.x) * t, y, f.z + (top.z + rz * f.side * 0.8 - f.z) * t); };
      for (let y = top.y - 4, k = 0; !wound && y > Math.max(feet[0].y, feet[1].y) + 1; y -= 4, k++) {
        wood.tint(0.78, 0.68, 0.6, 1).beam(post(feet[0], y), post(feet[1], y), 0.12, 0.18);
        wood.tint(0.7, 0.6, 0.52, 1).beam(post(feet[k % 2], y), post(feet[1 - (k % 2)], Math.min(top.y - 0.4, y + 4)), 0.1, 0.14);
      }
    }

    // ---- inside: the rock round the line — an arch of facets every two metres, timber sets, lanterns; the lake
    const SHAPE = { rock: [2.7, 5.1], lift: [2.6, 5.0], hall: [3.4, 5.3], lake: [8.5, 6.6] };
    const near = (p, way) => { // how far a place is from the other way of the fork (on the map)
      const pts = way ? C.pts : F.pts, j0 = way ? Math.round(F.s0 / C.ds) : 0, j1 = way ? Math.round(F.s1 / C.ds) : pts.length - 1; let best = 1e9;
      for (let j = j0; j <= j1; j += 2) { const d = (pts[j].x - p.x) ** 2 + (pts[j].z - p.z) ** 2; if (d < best) best = d; }
      return Math.sqrt(best);
    };
    const tube = (from, to, way) => {
      const ring = (s) => {
        const kind = kindAt(s, way), [hw, hh] = SHAPE[kind] || SHAPE.rock, row = [], n = 10;
        // (floor, wall, arch, wall, floor — rough: each corner is pushed in or out a little)
        for (let i = 0; i <= n; i++) {
          const a = Math.PI * (i / n), rough = 1 + (h1(Math.round(s) * 13 + i * 7 + way * 31) - 0.5) * 0.22, u = -Math.cos(a) * hw * rough, v = i === 0 || i === n ? -0.25 : Math.max(-0.25, Math.sin(a) * hh * rough);
          const p = this.at(s, u, kind === 'lake' && (i === 0 || i === n) ? -2.2 : v, way);
          row.push({ p, c: lit(p) });
        }
        return { row, kind, hw };
      };
      let prev = null;
      for (let s = from; s <= to + 0.01; s += 2) {
        const sc = Math.min(s, to);
        if (!INSIDE.has(kindAt(sc, way))) { prev = null; continue; }
        const cur = ring(sc);
        if (prev) {
          const rock = piece(sc - 1, way).get('cave'), fork = sc > F.s0 - 4 && sc < F.s1 + 4;
          for (let i = 0; i < cur.row.length - 1; i++) {
            const a = prev.row[i], b = prev.row[i + 1], c = cur.row[i + 1], d = cur.row[i];
            // (where the two ways of the fork run into one another, the wall between them is left out)
            if (fork && near(a.p.clone().add(c.p).multiplyScalar(0.5), way) < 3.0) continue;
            rock.quad(a.p, d.p, c.p, b.p, { colors: [a.c, d.c, c.c, b.c] });
          }
          // the floor: ballast between the walls — or, in the cave of the lake, black water with the line on piles
          const fl = piece(sc - 1, way).get('cave'), a = prev.row[0], b = prev.row[prev.row.length - 1], c = cur.row[cur.row.length - 1], d = cur.row[0];
          if (cur.kind === 'lake') {
            const w = (p) => { const q = lit(V(p.x, p.y + 1, p.z), 0.5); return [0.01 + q[0] * 0.25, 0.04 + q[1] * 0.5, 0.06 + q[2] * 0.6, 1]; }, up = (p) => V(p.x, p.y + 1.1, p.z);
            piece(sc - 1, way).get('glow').quad(up(a.p), up(b.p), up(c.p), up(d.p), { colors: [w(a.p), w(b.p), w(c.p), w(d.p)] });
            for (const side of [-1, 1]) fl.tint(0.3, 0.24, 0.2, 1).beam(this.at(sc - 1, side * 0.7, -0.1, way), this.at(sc - 1, side * 0.7, -1.4, way), 0.2, 0.2);
          } else {
            const g = (p) => { const q = lit(p, 1.1); return [q[0] * 0.75 + 0.02, q[1] * 0.7 + 0.02, q[2] * 0.68 + 0.02, 1]; };
            fl.quad(a.p, b.p, c.p, d.p, { colors: [g(a.p), g(b.p), g(c.p), g(d.p)] });
          }
        }
        prev = cur;
        // a set of timber every six metres (not in the great caves)
        if ((cur.kind === 'rock' || cur.kind === 'lift') && Math.round(sc / 2) % 3 === 0) {
          const P = piece(sc, way).get('cave'), t = (p) => { const q = lit(p, 1.5); return [WOOD[0] * q[0] + 0.04, WOOD[1] * q[1] + 0.03, WOOD[2] * q[2] + 0.025, 1]; };
          const l0 = this.at(sc, -2.05, -0.2, way), l1 = this.at(sc, -1.85, 4.25, way), r0 = this.at(sc, 2.05, -0.2, way), r1 = this.at(sc, 1.85, 4.25, way);
          P.tint(...t(l1)).beam(l0, l1, 0.24, 0.24); P.tint(...t(r1)).beam(r0, r1, 0.24, 0.24); P.tint(...t(l1.clone().lerp(r1, 0.5))).beam(this.at(sc, -2.2, 4.36, way), this.at(sc, 2.2, 4.36, way), 0.28, 0.26);
        }
      }
    };
    tube(0, L, 0); tube(F.s0 + 2, F.s0 + F.len - 2, 1);
    for (const l of lamps) {
      // a lantern on the wall (in the cave of the lake: a cluster of crystals)
      const P = piece(l.s, l.way), glow = P.get('glow'), c = LAMP[l.kind];
      if (l.kind === 'lake') { for (let k = 0; k < 4; k++) { const base = this.at(l.s + (h1(l.s + k) - 0.5) * 2, l.side * 7.6, 0.4 + h1(l.s * 3 + k) * 1.2); glow.tint(c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 1).rod(base, V(base.x + (h1(k + l.s) - 0.5) * 1.2, base.y + 1.2 + h1(k * 5 + l.s) * 1.6, base.z + (h1(k * 9 + l.s) - 0.5) * 1.2), 0.2, 5, { r1: 0.02, caps: false }); } continue; }
      const p = l.p;
      glow.tint(c[0] * 1.25, c[1] * 1.1, c[2] * 0.9, 1).box(p.x - 0.12, p.y - 0.17, p.z - 0.12, p.x + 0.12, p.y + 0.17, p.z + 0.12);
      P.get('cave').tint(0.2, 0.17, 0.15, 1).box(p.x - 0.16, p.y + 0.17, p.z - 0.16, p.x + 0.16, p.y + 0.23, p.z + 0.16).beam(p.clone().add(V(0, 0.23, 0)), this.at(l.s, l.side * 2.5, 3.5, l.way), 0.05, 0.05);
    }
    // (veins of gold and crystals in the rock, here and there)
    for (let k = 0; k < 70; k++) {
      const s = 50 + h1(k * 3.3) * (L - 110), kind = kindAt(s, 0);
      if (!INSIDE.has(kind) || kind === 'lake') continue;
      const side = h1(k) < 0.5 ? -1 : 1, hw = (SHAPE[kind] || SHAPE.rock)[0] - 0.12, v = 0.5 + h1(k * 7) * 2.2, glow = piece(s, 0).get('glow'), gold = h1(k * 11) < 0.6;
      const a = this.at(s, side * hw * Math.cos(Math.asin(clamp(v / 4, 0, 0.9))), v), tone = gold ? [0.75, 0.5, 0.08] : [0.2, 0.6, 0.75];
      if (gold) glow.tint(...tone, 1).rod(a, this.at(s + 0.8 + h1(k) * 1.2, side * hw * Math.cos(Math.asin(clamp((v + 0.5) / 4, 0, 0.9))), v + 0.5), 0.05, 4, { caps: false });
      else for (let j = 0; j < 3; j++) glow.tint(tone[0] * 0.7, tone[1] * 0.7, tone[2] * 0.7, 1).rod(a, V(a.x + (h1(k + j) - 0.5) * 0.9, a.y + 0.3 + h1(k * 2 + j) * 0.6, a.z + (h1(k * 5 + j) - 0.5) * 0.9), 0.09, 4, { r1: 0.01, caps: false });
    }

    // ---- the gaps and the rocks: what one hops
    for (const g of C.gaps) {
      const way = g.way === 1 ? 1 : 0, P = piece(g.s, way), inside = INSIDE.has(kindAt(g.s, way)), b = P.get(inside ? 'glow' : 'paint');
      for (const [s, dir] of [[g.s - 0.25, -1], [g.s + g.len + 0.25, 1]]) for (const side of [-1, 1]) {
        // (the broken ends: a striped stump on each side, yellow and black)
        for (let k = 0; k < 3; k++) b.tint(...(k % 2 ? [0.05, 0.05, 0.05] : [1.0, 0.78, 0.05]), 1).beam(this.at(s, side * 0.95, k * 0.3, way), this.at(s, side * 0.95, k * 0.3 + 0.3, way), 0.16, 0.16);
        P.get(inside ? 'cave' : 'woodDark').tint(0.5, 0.4, 0.32, 1).beam(this.at(s, side * GAUGE, 0.1, way), this.at(s + dir * -0.9, side * GAUGE * 1.5, -0.5, way), 0.08, 0.1);
      }
    }
    for (const k of C.rocks) {
      const way = k.way === 1 ? 1 : 0, P = piece(k.s, way), inside = INSIDE.has(kindAt(k.s, way)), p = this.at(k.s, 0, 0.05, way), c = inside ? lit(p, 2.2) : [1, 1, 1];
      P.get(inside ? 'cave' : 'stoneWet').tint(0.5 * c[0] + 0.06, 0.47 * c[1] + 0.05, 0.45 * c[2] + 0.05, 1).place(p.x, p.y, p.z, k.s).lathe([[0, 0], [0.5, 0.02], [0.62, 0.22], [0.5, 0.48], [0.28, 0.62], [0, 0.66]], 7).pop();
      for (const side of [-1, 1]) P.get(inside ? 'glow' : 'paint').tint(1.0, 0.78, 0.05, 1).beam(this.at(k.s, side * 0.95, 0, way), this.at(k.s, side * 0.95, 0.8, way), 0.14, 0.14);
    }

    // ---- the boards, before each thing to do: the same colours every time
    const board = (bd) => {
      const way = bd.way === 1 ? 1 : 0, s = Math.max(4, bd.s), inside = INSIDE.has(kindAt(s, way)), P = piece(s, way), b = P.get(inside ? 'glow' : 'paint'), post = P.get(inside ? 'cave' : 'woodDark');
      const side = bd.kind === 'left' ? -1 : 1, u = side * (inside ? 1.75 : 2.0), r = railAt(s, way, {}), yaw = r.yaw + Math.PI, mid = this.at(s, u, inside ? 3.3 : 2.6, way), dim = inside ? 0.8 : 1;
      post.tint(0.45, 0.36, 0.3, 1).beam(this.at(s, side * (inside ? 2.45 : 2.0), -0.6, way), this.at(s, side * (inside ? 2.45 : 2.0), inside ? 3.3 : 2.4, way), 0.12, 0.12);
      const back = bd.kind === 'brake' ? [0.9, 0.08, 0.06] : bd.kind === 'hop' ? [1.0, 0.76, 0.04] : bd.kind === 'fork' ? [0.1, 0.6, 0.22] : [0.08, 0.3, 0.85];
      const ink = bd.kind === 'hop' ? [0.04, 0.04, 0.04] : [1.3, 1.3, 1.25], w = 0.62, big = 1.45;
      b.push(new THREE.Matrix4().makeRotationY(yaw).scale(V(big, big, 1)).setPosition(mid.x, mid.y, mid.z));
      b.tint(back[0] * dim, back[1] * dim, back[2] * dim, 1).poly([V(-w, -w, 0), V(w, -w, 0), V(w, w, 0), V(-w, w, 0)]);
      b.tint(ink[0] * dim, ink[1] * dim, ink[2] * dim, 1);
      const z = 0.02;
      if (bd.kind === 'left' || bd.kind === 'right') {
        // an arrow, pointing the way one leans (the board looks back along the line: its own x is the rider's right)
        if (bd.kind === 'right') b.poly([V(0.05, -0.42, z), V(0.5, 0, z), V(0.05, 0.42, z)]).poly([V(-0.45, -0.15, z), V(0.06, -0.15, z), V(0.06, 0.15, z), V(-0.45, 0.15, z)]);
        else b.poly([V(-0.05, 0.42, z), V(-0.5, 0, z), V(-0.05, -0.42, z)]).poly([V(-0.06, -0.15, z), V(0.45, -0.15, z), V(0.45, 0.15, z), V(-0.06, 0.15, z)]);
      } else if (bd.kind === 'brake') b.poly([V(-0.45, -0.13, z), V(0.45, -0.13, z), V(0.45, 0.13, z), V(-0.45, 0.13, z)]);
      else if (bd.kind === 'hop') { b.poly([V(-0.42, -0.1, z), V(0, 0.45, z), V(0.42, -0.1, z)]); b.poly([V(-0.42, -0.45, z), V(0.42, -0.45, z), V(0.42, -0.27, z), V(-0.42, -0.27, z)]); }
      else { b.poly([V(-0.08, -0.45, z), V(0.08, -0.45, z), V(0.08, 0, z), V(-0.08, 0, z)]); b.poly([V(-0.08, -0.05, z), V(0.03, -0.12, z), V(0.45, 0.35, z), V(0.34, 0.42, z)]); b.poly([V(-0.03, -0.12, z), V(0.08, -0.05, z), V(-0.34, 0.42, z), V(-0.45, 0.35, z)]); }
      b.pop();
    };
    for (const bd of C.boards) board(bd);
    // ---- the signals: a post and a green lamp, where one is put back
    for (const g of C.signals) {
      const inside = INSIDE.has(kindAt(g.s, 0)), P = piece(g.s, 0), top = this.at(g.s, -1.5, 2.0);
      P.get(inside ? 'cave' : 'woodDark').tint(0.4, 0.33, 0.28, 1).beam(this.at(g.s, -1.5, -0.6), top, 0.1, 0.1);
      P.get('glow').tint(0.15, 1.1, 0.3, 1).box(top.x - 0.13, top.y, top.z - 0.13, top.x + 0.13, top.y + 0.3, top.z + 0.13);
    }

    // ---- the rock the line winds round: a needle standing on the terrace
    {
      const sp = C.stretches.find((q) => q.name === 'The Spiral'), a = railAt(sp.from + 12, 0, {}), b = railAt(sp.from + 12 + 40.8, 0, {}), cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, base = Math.min(...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => ground(cx + Math.cos(k * 0.785) * 9, cz + Math.sin(k * 0.785) * 9))) - 1.5, top = a.y + 6;
      const P = piece(sp.from + 30, 0), rock = P.get('stoneWet'), n = 7;
      this.needle = { x: cx, z: cz };
      for (let i = 0; i < n; i++) {
        const y0 = base + ((top - base) * i) / n, y1 = base + ((top - base) * (i + 1)) / n, r0 = 7.6 * (1 - i / n) ** 0.8 + 1.6 + h1(i * 3) * 1.1, r1 = 7.6 * (1 - (i + 1) / n) ** 0.8 + 1.6 + h1(i * 3 + 3) * 1.1, t = 0.55 + 0.5 * (i / n);
        rock.tint(0.62 * t, 0.56 * t, 0.5 * t, 1).place(cx + (h1(i) - 0.5) * 1.2, 0, cz + (h1(i + 9) - 0.5) * 1.2, i * 0.9).cylinder(0, y0, 0, r0, i === n - 1 ? 0.6 : r1, y1 - y0, 9).pop();
      }
      world.collision?.addCircle?.(cx, cz, 8);
    }

    // ---- the mouths: a frame of timber where the line goes into the rock or comes out of it, dark behind
    for (let j = 1; j < C.n; j++) {
      const was = INSIDE.has(C.pts[j - 1].kind), is = INSIDE.has(C.pts[j].kind);
      if (was === is) continue;
      const s = j * C.ds + (is ? -1.2 : 1.2), P = new Parts(), wood = P.get('woodDark'), r = railAt(s, 0, {}), gy = Math.min(ground(r.x, r.z), r.y) - 0.6;
      for (const side of [-1, 1]) { const foot = this.at(s, side * 2.1, 0); foot.y = gy; wood.tint(1.0, 0.86, 0.72, 1).beam(foot, this.at(s, side * 2.1, 4.6), 0.34, 0.34).tint(0.85, 0.72, 0.6, 1).beam(this.at(s, side * 2.1, 3.0), this.at(s, side * 1.0, 4.55), 0.2, 0.2); }
      wood.tint(1.05, 0.9, 0.75, 1).beam(this.at(s, -2.8, 4.8), this.at(s, 2.8, 4.8), 0.4, 0.4);
      // (a lantern under the beam; planks to the side)
      const lp = this.at(s, 0, 4.35); P.get('glow').tint(1.3, 0.9, 0.45, 1).box(lp.x - 0.12, lp.y - 0.3, lp.z - 0.12, lp.x + 0.12, lp.y, lp.z + 0.12);
      this.group.add(P.toMeshes(mats, { name: 'mine-mouth', layers: [] }));
      // (for who does not ride: the dark of the mouth — a black wall just inside the frame)
      const Q = new Parts(), d = is ? 0.5 : -0.5, a = this.at(s + d, -2.1, -0.3), b = this.at(s + d, 2.1, -0.3), c = this.at(s + d, 2.1, 4.7), e = this.at(s + d, -2.1, 4.7);
      Q.get('matte').tint(0.012, 0.011, 0.014, 1); if (is) Q.get('matte').quad(a, b, c, e); else Q.get('matte').quad(b, a, e, c);
      this.mouths.add(Q.toMeshes(mats, { name: 'mine-dark', layers: [], castShadow: false }));
    }
    // (for who rides: the ground of the world is not drawn where an inside comes up through it — at the mouths, and
    // wherever a tunnel runs shallower than its own roof: an unseen sheet just above the ground is drawn before
    // it, and the ground behind is left out)
    {
      const geo = [], add = (p) => geo.push(p.x, p.y, p.z);
      for (let sq = 1; sq < L - 1; sq += 1) {
        if (!INSIDE.has(kindAt(sq, 0)) || !INSIDE.has(kindAt(sq + 1, 0))) continue;
        const roof = this.at(sq, 0, 5.8).y;
        for (let u = -3.2; u < 3.19; u += 1.6) {
          const q = [this.at(sq, u, 0), this.at(sq, u + 1.6, 0), this.at(sq + 1, u + 1.6, 0), this.at(sq + 1, u, 0)];
          for (const p of q) p.y = ground(p.x, p.z) + 0.3;
          if (Math.min(...q.map((p) => p.y)) > roof) continue;
          add(q[0]); add(q[2]); add(q[1]); add(q[0]); add(q[3]); add(q[2]);
        }
      }
      if (geo.length) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(geo, 3));
        const hole = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
        hole.name = 'mine-hole'; hole.renderOrder = 4; hole.matrixAutoUpdate = false; hole.frustumCulled = false;
        this.inside.add(hole);
      }
    }

    // ---- the station: a platform of planks under a roof, steps, crates and barrels of ore
    {
      const P = new Parts(), deck = P.get('woodDeck'), wood = P.get('woodDark'), paint = P.get('paint'), S0 = MINE.station, x0 = S0.x + 1.0, x1 = S0.x + 4.2, z0 = S0.z - 29, z1 = S0.z - 3, y = S0.y + 0.3;
      deck.tint(1.0, 0.92, 0.8, 1).box(x0, y - 0.14, z0, x1, y, z1);
      for (let z = z0 + 0.6; z < z1; z += 3.1) for (const x of [x0 + 0.2, x1 - 0.2]) { const g = ground(x, z) - 0.4; wood.tint(0.8, 0.7, 0.6, 1).box(x - 0.12, g, z - 0.12, x + 0.12, y - 0.14, z + 0.12); }
      // (steps down to the meadow, facing the gate)
      for (let k = 0; k < 6; k++) deck.tint(0.95, 0.86, 0.74, 1).box(x1 + k * 0.42, y - 0.14 - (k + 1) * 0.24, MINE.gate.z - 1.4, x1 + (k + 1) * 0.42, y - (k + 1) * 0.24, MINE.gate.z + 1.4);
      // (the roof: posts, a ridge, two slopes of red and cream boards)
      const rz0 = z0 + 3, rz1 = z1 - 6, top = y + 3.1;
      for (let z = rz0; z <= rz1 + 0.1; z += (rz1 - rz0) / 3) for (const x of [x0 + 0.35, x1 - 0.35]) wood.tint(1.0, 0.86, 0.7, 1).box(x - 0.11, y, z - 0.11, x + 0.11, top, z + 0.11);
      for (let z = rz0 - 0.8, k = 0; z < rz1 + 0.8; z += 1.0, k++) {
        const tone = k % 2 ? [1.25, 1.12, 0.86] : [0.9, 0.12, 0.1], zz = Math.min(z + 1.0, rz1 + 0.8), mx = (x0 + x1) / 2;
        paint.tint(tone[0] * 0.5, tone[1] * 0.5, tone[2] * 0.5, 1).quad(V(x0 - 0.7, top - 0.05, zz), V(x0 - 0.7, top - 0.05, z), V(mx, top + 0.95, z), V(mx, top + 0.95, zz)).quad(V(mx, top + 0.95, zz), V(mx, top + 0.95, z), V(x1 + 0.7, top - 0.05, z), V(x1 + 0.7, top - 0.05, zz));
        paint.tint(...tone, 1).quad(V(x0 - 0.7, top - 0.07, z), V(x0 - 0.7, top - 0.07, zz), V(mx, top + 0.93, zz), V(mx, top + 0.93, z)).quad(V(mx, top + 0.93, z), V(mx, top + 0.93, zz), V(x1 + 0.7, top - 0.07, zz), V(x1 + 0.7, top - 0.07, z));
      }
      wood.tint(0.9, 0.78, 0.64, 1).box((x0 + x1) / 2 - 0.1, top + 0.86, rz0 - 0.9, (x0 + x1) / 2 + 0.1, top + 1.02, rz1 + 0.9);
      // (crates, barrels, a heap of ore that glints)
      for (const [dx, dz, w] of [[2.4, -26.5, 0.8], [2.5, -25.4, 0.6], [1.9, -5.2, 0.7]]) wood.tint(0.95, 0.8, 0.6, 1).box(S0.x + dx, y, S0.z + dz, S0.x + dx + w, y + w, S0.z + dz + w);
      for (const [dx, dz] of [[3.4, -27.2], [3.5, -4.6], [2.9, -4.1]]) paint.tint(0.55, 0.3, 0.16, 1).cylinder(S0.x + dx, y, S0.z + dz, 0.32, 0.32, 0.9, 10);
      for (let k = 0; k < 9; k++) P.get('glow').tint(0.9, 0.62, 0.1, 1).cube(S0.x + 2.2 + h1(k) * 0.9, y + 0.12 + h1(k * 3) * 0.3, S0.z - 24 + h1(k * 7) * 0.9, 0.2, 0.2, 0.2);
      // (lanterns under the roof, bunting bulbs along its edge)
      for (let z = rz0; z <= rz1 + 0.1; z += (rz1 - rz0) / 3) P.get('glow').tint(1.3, 0.95, 0.5, 1).cube((x0 + x1) / 2, top + 0.2, z, 0.22, 0.34, 0.22);
      for (let z = rz0 - 0.6, k = 0; z < rz1 + 0.7; z += 0.9, k++) P.get('glow').tint(...[[1.2, 0.25, 0.2], [1.2, 0.95, 0.3], [0.3, 0.9, 0.5], [0.3, 0.6, 1.2]][k % 4], 1).cube(x1 + 0.72, top - 0.16, z, 0.12, 0.14, 0.12);
      // (buffers at the end of the line would stop nothing: the line is a loop — a striped post marks the finish)
      const fin = C.finish;
      for (const side of [-1, 1]) for (let k = 0; k < 6; k++) paint.tint(...(k % 2 ? [1.3, 1.25, 1.1] : [0.08, 0.08, 0.08]), 1).beam(this.at(fin, side * 1.3, -0.6 + k * 0.5), this.at(fin, side * 1.3, -0.1 + k * 0.5), 0.14, 0.14);
      const G = MINE.gate, gy = ground(G.x, G.z);
      gateArch(this.group, paint, G.x, gy, G.z, G.yaw, MINE.name.toUpperCase(), 'LEAN · BRAKE · HOP', { tone: [0.72, 0.36, 0.12] });
      this.gate = { x: G.x, y: gy, z: G.z, yaw: G.yaw };
      this.group.add(P.toMeshes(mats, { name: 'mine-station', layers: [] }));
    }

    for (const p of pieces) (p.inside ? this.inside : this.group).add(p.parts.toMeshes(mats, { name: p.inside ? 'mine-rock' : 'mine-line', layers: [], castShadow: !p.inside }));

    // ---- the nuggets: one mesh for all of them; one that is taken is put out until the next run
    {
      const geo = new THREE.IcosahedronGeometry(0.26, 0), mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.72, 0.08), toneMapped: false });
      this.nuggets = new THREE.InstancedMesh(geo, mat, C.nuggets.length);
      this.nuggets.name = 'mine-nuggets'; this.nuggets.frustumCulled = false;
      this.nuggetAt = C.nuggets.map((g) => this.at(g.s, g.side === 2 ? 0 : g.side * 1.15, g.side === 2 ? 2.25 : g.side ? 1.35 : 1.15, g.way === 1 ? 1 : 0));
      this.group.add(this.nuggets);
      this.lightNuggets();
    }

    // ---- the trains: one's own, and one for each of five others
    this.trains = [];
    for (let k = 0; k < 6; k++) { const t = this._train(k); t.visible = false; this.group.add(t); this.trains.push(t); }
    this.group.add(this.inside, this.mouths);
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    // (the train of nobody stands at the platform, to be looked at)
    this._park();
    return this;
  }

  /** A train of three ore carts, built round the place of each on the rails: a group of three groups. */
  _train(n) {
    const mats = this.world.materials, train = new THREE.Group(); train.name = 'mine-train'; train.carts = [];
    for (let i = 0; i < MINE.cart.n; i++) {
      const P = new Parts(), body = P.get('paint'), iron = P.get('matte'), tone = [[0.62, 0.22, 0.12], [0.2, 0.36, 0.5], [0.24, 0.42, 0.24], [0.62, 0.46, 0.12], [0.42, 0.24, 0.5], [0.6, 0.34, 0.14]][n % 6];
      // (a hopper: wider at the top than at the bottom — its two sides lean out)
      const w0 = 0.42, w1 = 0.62, l0 = 0.62, l1 = 0.8, y0 = 0.42, y1 = 1.08, q = (a, b, c, d, k = 1) => body.tint(tone[0] * k, tone[1] * k, tone[2] * k, 1).quad(a, b, c, d);
      const c = (sx, sz, top) => V(sx * (top ? w1 : w0), top ? y1 : y0, sz * (top ? l1 : l0));
      q(c(-1, -1, 0), c(-1, 1, 0), c(-1, 1, 1), c(-1, -1, 1)); q(c(1, 1, 0), c(1, -1, 0), c(1, -1, 1), c(1, 1, 1)); q(c(-1, 1, 0), c(1, 1, 0), c(1, 1, 1), c(-1, 1, 1), 0.85); q(c(1, -1, 0), c(-1, -1, 0), c(-1, -1, 1), c(1, -1, 1), 0.85);
      q(c(-1, -1, 0), c(1, -1, 0), c(1, 1, 0), c(-1, 1, 0), 0.5);
      // (the inside, darker; a rim of iron; the frame, the axles and four wheels)
      const d = (sx, sz, top) => V(sx * (top ? w1 - 0.05 : w0 - 0.03), top ? y1 : y0 + 0.06, sz * (top ? l1 - 0.05 : l0 - 0.03)), k = 0.35;
      q(d(-1, 1, 0), d(-1, -1, 0), d(-1, -1, 1), d(-1, 1, 1), k); q(d(1, -1, 0), d(1, 1, 0), d(1, 1, 1), d(1, -1, 1), k); q(d(1, 1, 0), d(-1, 1, 0), d(-1, 1, 1), d(1, 1, 1), k); q(d(-1, -1, 0), d(1, -1, 0), d(1, -1, 1), d(-1, -1, 1), k); q(d(-1, 1, 0), d(1, 1, 0), d(1, -1, 0), d(-1, -1, 0), k);
      for (const sz of [-1, 1]) iron.tint(0.12, 0.11, 0.1, 1).box(-w1 - 0.03, y1 - 0.04, sz * l1 - 0.04, w1 + 0.03, y1 + 0.04, sz * l1 + 0.04);
      for (const sx of [-1, 1]) iron.tint(0.12, 0.11, 0.1, 1).box(sx * w1 - 0.04, y1 - 0.04, -l1, sx * w1 + 0.04, y1 + 0.04, l1);
      iron.tint(0.1, 0.09, 0.08, 1).box(-0.34, 0.3, -0.75, 0.34, 0.42, 0.75).box(-0.06, 0.3, -1.05, 0.06, 0.38, 1.05);
      for (const sz of [-0.45, 0.45]) for (const sx of [-1, 1]) iron.tint(0.16, 0.14, 0.13, 1).place(sx * GAUGE, 0.26, sz, 0, 0, Math.PI / 2).cylinder(0, -0.05, 0, 0.2, 0.2, 0.1, 10).pop();
      // (the carts behind carry ore: grey lumps, some of them gold)
      if (i > 0) for (let j = 0; j < 9; j++) { const gold = h1(j * 3 + i + n) < 0.35; P.get(gold ? 'glow' : 'paint').tint(...(gold ? [0.95, 0.66, 0.1] : [0.34, 0.31, 0.3]), 1).cube((h1(j + i * 5) - 0.5) * 0.8, y1 - 0.02 + h1(j * 7) * 0.2, (h1(j * 11 + i) - 0.5) * 1.1, 0.3, 0.26, 0.3); }
      const g = P.toMeshes(mats, { name: 'mine-cart', layers: [] });
      g.matrixAutoUpdate = true; g.rotation.order = 'YXZ';
      train.add(g); train.carts.push(g);
    }
    return train;
  }

  /** Puts a train where a run is: each cart on the rails, leaning as it does. `tumble` (s): off the rails for so long. */
  _place(train, st, tumble = 0) {
    const p = this._p || (this._p = {});
    for (let i = 0; i < train.carts.length; i++) {
      const c = train.carts[i]; cartPose(st, i, p);
      const r = railAt(p.s, st.way === 1 && p.s >= course().fork.s0 ? 1 : 0, this._q || (this._q = {})), rx = -Math.cos(r.yaw), rz = Math.sin(r.yaw), out = tumble > 0 ? Math.min(1, tumble * 1.6) * (st.why === 'tip' ? -Math.sign(p.k || 1) : (i % 2 ? 1 : -1) * 0.5) : 0;
      c.position.set(p.x + rx * out * (1.6 + i * 0.5), p.y + 0.02 - (tumble > 0 && st.why === 'gap' ? Math.min(3.5, tumble * tumble * 5) : 0) + (tumble > 0 && st.why !== 'gap' ? Math.max(0, Math.sin(Math.min(1, tumble * 1.4) * Math.PI)) * 0.6 : 0), p.z + rz * out * (1.6 + i * 0.5));
      c.rotation.set(p.pitch + (tumble > 0 && st.why === 'gap' ? Math.min(1.1, tumble * 2) : 0), p.yaw + (tumble > 0 ? out * 0.5 : 0), (i === 0 ? p.roll : p.roll * 0.7) + out * Math.min(1.4, tumble * 2.2));
    }
    train.visible = true;
  }

  /** The train of nobody, at the platform. */
  _park() { const st = startRun(); this._place(this.trains[0], st); }

  setBest(ms) { this.best = ms || 0; }
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.6 * 2.6; }
  nextStart() { return nextStart(this.clock(), MINE.every, STARTS); }

  /**
   * A run is asked for: the player is sat in the first cart at the platform and leaves with the next start.
   * `io`: { play, note, mates }. Returns the session — the driver of the player (see src/extras/plug.js).
   */
  open(player, io) {
    const C = course(), start = this.nextStart(), st = startRun({ wait: Math.max(0.05, start.wait) }), events = [], input = { x: 0, y: 0, hop: false };
    const S = { cam: null, look: V(0, 0, 0), fov: 64, shake: 0, acc: 0, last: 99, gone: false, said: '', saidFor: 0, roll: 0, back: 7 }, p = {}, t = V(0, 0, 0), q = {};
    this.lightNuggets();
    this.inside.visible = true; this.mouths.visible = false;
    const session = {
      mine: this, over: false, ended: false, score: 0, time: 0, line: '', riding: false, anim: ANIM.sit, state: st, auto: false, start, instance: 0,
      tell: () => [Math.round(st.s * 10) / 10, st.way, Math.round(st.lean * 10) / 10, Math.round(st.y * 10) / 10, st.phase === 'off' ? 1 : st.phase === 'wait' ? 2 : 0, Math.round(st.v * 10) / 10],
      step: (dt, pl, control) => {
        const inp = pl.input, wait = (start.at - this.clock()) / 1000;
        // (the start goes by the clock everybody shares: the rules count the last moment down)
        if (st.phase === 'wait' && wait > 0.05) st.wait = wait;
        if (st.phase === 'wait') { const n = Math.ceil(st.wait); if (n !== S.last && n > 0 && n <= 3) { S.last = n; io.play('tick'); } }
        if (session.auto) {
          S.acc += Math.min(dt, 0.25);
          while (S.acc >= MINE.step) { S.acc -= MINE.step; botInput(st, 'steady', input); stepRun(st, MINE.step, input, events); }
        } else {
          input.x = control ? clamp(inp.move.x, -1, 1) : 0; input.y = control ? clamp(inp.move.y, -1, 1) : 0; input.hop = control && !!inp.jump;
          stepRun(st, dt, input, events);
          input.hop = false;
        }
        for (const e of events) this._tell(e, st, io, S);
        events.length = 0;
        if (st.over && !session.over) { session.over = true; session.score = st.time; session.time = st.time; }
        if (st.phase === 'done') { S.after = (S.after || 0) + dt; if (S.after > 2.2) session.ended = true; }
        // ---- the train, and the robot in its first cart
        this._place(this.trains[0], st, st.phase === 'off' ? MINE.off.time - st.off : 0);
        const c = this.trains[0].carts[0];
        pl.pos.set(c.position.x, c.position.y + 0.5, c.position.z); pl.yaw = c.rotation.y; pl.pitch = -c.rotation.x * 0.6; pl.roll = c.rotation.z;
        pl.speed = st.v; pl.grounded = true;
        // ---- the line of the run
        const name = C.stretches[st.stretch]?.name || '', kmh = Math.round(st.v * 3.6), r = railAt(st.s, st.way, q), need = st.need || 0, into = st.lean * Math.sign(r.k || 1);
        let warn = '';
        if (st.phase === 'run' && st.s > C.top && !st.over) {
          if (st.tip > 0.12 && need > 1 + MINE.lean.slack && into > 0.6) warn = ' · TOO FAST — BRAKE!';
          else if (st.tip > 0.12) warn = r.k > 0 ? ' · LEAN RIGHT →' : ' · ← LEAN LEFT';
        }
        if (S.saidFor > 0) S.saidFor -= dt;
        session.line = st.phase === 'wait' ? `${MINE.name} · the ${start.name} train leaves in ${Math.max(1, Math.ceil(st.wait))}…`
          : st.over ? `${MINE.name} · ${formatTime(st.time)} · ${st.nuggets} nugget${st.nuggets === 1 ? '' : 's'}${st.offs ? ` · off the rails ${st.offs}×` : ' · never off the rails'}`
            : `${formatTime(Math.round(st.clock * 1000) + st.cost)} · ${name} · ${kmh} km/h · ${st.nuggets} nugget${st.nuggets === 1 ? '' : 's'}${st.offs ? ` · +${st.offs * MINE.off.cost / 1000} s` : ''}${warn}`;
      },
      /** The camera: behind and above the first cart, on the line it has just run, looking along the rails ahead; it leans with the cart. */
      camera: (cam, dt) => {
        cartPose(st, 0, p);
        const inside = INSIDE.has(p.kind), way = st.way, back = (inside ? 8.6 : 9.4) + st.v * 0.07, up = inside ? (p.kind === 'lake' ? 4.6 : 3.9) : 5.0;
        const sb = Math.max(0.5, st.s - back), b = this.at(sb, st.lean * 0.5, up, way && sb >= C.fork.s0 ? 1 : 0), aheadS = st.s + 9 + st.v * 0.5;
        const onShort = way === 1 && aheadS > C.fork.s0 + C.fork.len, a = onShort ? this.at(C.fork.s1 + aheadS - C.fork.s0 - C.fork.len, 0, 0.3, 0) : this.at(Math.min(C.length, aheadS), 0, 0.3, way);
        t.copy(b);
        if (!S.cam) S.cam = t.clone(); else S.cam.lerp(t, Math.min(1, dt * 9));
        S.look.lerp(a, S.look.lengthSq() ? Math.min(1, dt * 8) : 1);
        cam.position.copy(S.cam);
        if (S.shake > 0) { S.shake = Math.max(0, S.shake - dt * 2.2); cam.position.x += (Math.random() - 0.5) * S.shake * 0.4; cam.position.y += (Math.random() - 0.5) * S.shake * 0.4; }
        S.roll += ((st.lean * 0.1 - st.tip * 0.12 * Math.sign(p.k || 1)) - S.roll) * Math.min(1, dt * 6);
        const r = railAt(st.s, way, q);
        cam.up.set(-Math.cos(r.yaw) * Math.sin(S.roll), Math.cos(S.roll), Math.sin(r.yaw) * Math.sin(S.roll)); cam.lookAt(S.look);
        S.fov += (62 + 14 * clamp((st.v - 8) / 14, 0, 1) - S.fov) * Math.min(1, dt * 3);
        return S.fov;
      },
      /** The run is over, or left: the player is let go at the gate, before the platform. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x, this.gate.z, this.gate.yaw); session.close(); },
      close: () => { if (this.session === session) this.session = null; player.pitch = 0; player.roll = 0; this.inside.visible = false; this.mouths.visible = true; this.lightNuggets(); this._park(); },
    };
    this.session = session;
    session.step(0, player, false);
    return session;
  }

  /** What happened in a step of the run, told to who drives. */
  _tell(e, st, io, S) {
    const C = course();
    if (e.type === 'go') { io.play('start'); io.note('Hauled up the lift — then: lean into the bends, brake before the red boards, hop at the yellow ones.', 6000); }
    else if (e.type === 'top') { io.play('bell', { volume: 0.5 }); io.note('Off she goes!', 1600); }
    else if (e.type === 'hop') io.play('jump', { volume: 0.5 });
    else if (e.type === 'land') { io.play('land', { volume: 0.5 }); S.shake = Math.max(S.shake, 0.25); }
    else if (e.type === 'nugget') { io.play('pick', { volume: 0.6 }); this.takeNugget(e.id); }
    else if (e.type === 'signal') { if (e.n > 0) io.play('checkpoint', { volume: 0.35 }); }
    else if (e.type === 'fork') io.note(e.way ? 'The short way — broken: hop, hop, hop!' : 'The long way round.', 2200);
    else if (e.type === 'off') { io.play('fail', { volume: 0.8 }); io.play('hit', { volume: 0.7 }); S.shake = 1; io.note(e.why === 'tip' ? 'Off the rails! Lean into the bend — and brake before the sharp ones.' : e.why === 'gap' ? 'Into the gap! Press the button just before it.' : 'A rock on the rails! Hop over it.', 2800); }
    else if (e.type === 'back') { io.play('respawn'); S.cam = null; S.look.set(0, 0, 0); io.note(e.skipped ? 'Set down at the next signal — three seconds more.' : `Back on the rails at the last signal — ${MINE.off.cost / 1000} seconds more.`, 2400); }
    else if (e.type === 'finish') { io.play('bell'); io.play('victory', { volume: 0.8 }); io.note(`Home! ${formatTime(e.time)} — ${st.nuggets} of ${C.nuggets.length} nuggets${st.offs ? `, off the rails ${st.offs} time${st.offs === 1 ? '' : 's'}` : ', never off the rails'}.`, 7000); }
  }

  /** Every nugget is lit again (a run begins, or ends). */
  lightNuggets() {
    const m = new THREE.Matrix4();
    this.nuggetAt.forEach((p, i) => { m.makeRotationY(i * 1.3).setPosition(p.x, p.y, p.z); this.nuggets.setMatrixAt(i, m); });
    this.nuggets.instanceMatrix.needsUpdate = true;
  }

  /** The nugget `i` has been taken: it goes out. */
  takeNugget(i) {
    const p = this.nuggetAt[i];
    if (!p) return;
    this.nuggets.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0).setPosition(p.x, p.y, p.z));
    this.nuggets.instanceMatrix.needsUpdate = true;
  }

  /** Every frame, in every browser that has the game on: a train is put under whoever else rides the line. */
  update(dt) {
    const who = this.crowd?.of() || [], seen = this._seen || (this._seen = new Map()), C = course();
    let used = 1;
    for (const m of who) {
      if (used >= this.trains.length || !m.peer || !m.d || m.d.length < 6) continue;
      // (what they tell comes a few times a second: between two words the train runs on at the speed it said)
      let g = seen.get(m.id);
      if (!g) seen.set(m.id, g = { st: startRun(), told: -1 });
      const [s, way, lean, y, phase, v] = m.d;
      if (s !== g.told) { g.told = s; if (Math.abs(g.st.s - s) > 12) g.st.s = s; g.err = s - g.st.s; }
      const fix = (g.err || 0) * Math.min(1, dt * 3); g.err = (g.err || 0) - fix;
      Object.assign(g.st, { s: clamp(g.st.s + (phase ? 0 : v * dt) + fix, 0, C.length - 0.5), way: way ? 1 : 0, lean, y, v, tip: 0, why: 'tip' });
      this._place(this.trains[used++], g.st, phase === 1 ? 0.6 : 0);
    }
    for (let i = used; i < this.trains.length; i++) this.trains[i].visible = false;
    if (!this.session && !this.trains[0].visible) this._park();
  }
}

export { MINE };
