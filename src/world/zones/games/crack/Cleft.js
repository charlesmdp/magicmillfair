// Between a Rock: what is seen of it and how it is climbed. Its rules are in cleft.js; here it is built — two
// needles of layered rock standing in the sea before the cliff, the cleft between them, their ledges under
// grass and ferns, the creepers, the trees on their heads, the fall that comes down the cliff behind, the water
// that runs down the walls, the stones that come down, the planks at the foot and the walkway to them from the
// beach, the bell at the top — and a climb is run: a session that drives the player (see PlayerController.driver).
//
// The cleft is built in its own frame: x across (to the right as one looks into it from the sea), y up, z out of
// it towards the sea. It opens outwards a little, like a book: what is on its walls is seen from in front. The
// rock has a light of its own (it stands in the shade of the cliff all day): the higher, the warmer.
import * as THREE from 'three';
import { Parts } from '../../../props/MeshBuilder.js';
import { LAYER } from '../../../../render/Shadows.js';
import { ANIM } from '../../../../player/Character.js';
import { surfaceMaterial } from '../../../../render/SurfaceMaterial.js';
import { fallsRibbon } from '../../../water/Falls.js';
import { Polygon } from '../../../Areas.js';
import { canvasBoard } from '../Boards.js';
import { formatTime } from '../course.js';
import { CLEFT, wallAt, wetAt, ledgeBox, rocks, startClimb, stepClimb, cleftPoint, leapArc, botInput } from './cleft.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const TAU = Math.PI * 2;
const h2 = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7 + 74.7) * 43758.5453; return s - Math.floor(s); };
const noise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v); return (h2(i, j) * (1 - a) + h2(i + 1, j) * a) * (1 - b) + (h2(i, j + 1) * (1 - a) + h2(i + 1, j + 1) * a) * b; };
const ROPE = [1.15, 1.0, 0.72], GOLD = [1.5, 1.05, 0.2], CREAM = [1.3, 1.17, 0.9], RED = [0.95, 0.1, 0.12];
const OPEN = 0.16; // how much the cleft opens outwards: so much wider a metre nearer the sea
const Y0 = -6, FRONT = 3.0, BACK = -5.2; // the needles: from under the sea, in rows; how far they come forward and go back
const TOP = [CLEFT.height + 0.25, CLEFT.height + 1.9]; // how high each needle is: the one of the bell (on the right), the other
const ROCKS = 6, DOTS = 12;

export class Cleft {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'cleft';
    this.session = null;
    this.best = 0;
    /** The clock everybody shares (s): the stones come down by it. */
    this.clock = () => (performance.timeOrigin + performance.now()) / 1000;
  }

  build() {
    const world = this.world, C = CLEFT, cx = C.at.x, F = C.floor, [WAY, LANDING] = [C.way, C.landing];
    // ---- the rock and the leaves have a light of their own: the cleft is in the shade of the cliff all day
    const granite = world.materials.granite.uniforms;
    const mats = {
      ...world.materials,
      needle: surfaceMaterial({ map: granite.uMap.value, normalMap: granite.uNormalMap.value, name: 'needle', rough: 0.92, spec: 0.06, normalScale: 1.5, uvScale: 0.36, color: [0.9, 0.84, 0.76], emissive: [0.27, 0.23, 0.18], waterline: true }),
      leaf: surfaceMaterial({ name: 'leaf', rough: 0.8, spec: 0.1, emissive: [0.2, 0.3, 0.1], side: THREE.DoubleSide }),
    };
    const parts = new Parts(), rock = parts.get('needle'), leaf = parts.get('leaf'), matte = parts.get('matte'), paint = parts.get('paint'), wood = parts.get('woodDeck'), wet = parts.get('woodWet'), bark = parts.get('woodDark');
    const M = (this.frame = new THREE.Matrix4().makeBasis(V(-1, 0, 0), V(0, 1, 0), V(0, 0, -1)).setPosition(cx, F, C.at.z));
    const all = [...parts.map.values()];
    const wall = (side, y) => wallAt(side, clamp(y, 0, C.height));
    /** The face of a wall: how far from the middle it is at a height and a depth. */
    const face = (side, y, z) => side * (wall(side, y) + OPEN * z);
    for (const b of all) b.push(M);

    // ---- the two needles: layer upon layer of rock, each a little in or out of the last — a lip at the top of a
    // layer, a hollow at the foot of the next: shelves where moss grows, overhangs with shade under them
    const layers = (side) => { const out = []; let at = Y0, k = 0; const top = TOP[side > 0 ? 0 : 1]; while (at < top - 0.5) { const th = Math.min(top - at, 1.3 + 2.7 * h2(k, side + 7)); out.push({ k, y0: at, y1: at + th, d: (h2(k, side + 3) - 0.4) * 1.1, tone: 0.8 + 0.34 * h2(k, side + 5), hue: h2(k, side + 6) }); at += th; k++; } out[out.length - 1].y1 = top; return out; };
    const flute = (i, side, y) => (h2(i * 3.7, side + 11) - 0.5) * 0.7 + (noise(y * 0.07 + i, side + 2.5) - 0.5) * 0.8; // (grooves down the rock)
    const profile = (side, y, lip, L) => {
      const w = wall(side, y), top = TOP[side > 0 ? 0 : 1];
      // (it thins towards its head, and its head is round)
      const thin = 1 - 0.32 * clamp(y / 40, 0, 1) ** 1.4, head = clamp((y - (top - 2.6)) / 2.6, 0, 1), round = 1 - 0.6 * head * head;
      const swell = (noise(y * 0.09 + side * 9.1, 2.2) - 0.5) * 2.2, d = L.d + lip + swell * 0.5;
      const deep = (BACK - 1.4) * thin * round, far = (5.2 + swell * 0.6) * thin * round, nose = (FRONT + 0.4 * swell) * round, f = (i) => (d + flute(i, side, y)) * round;
      const inner = [BACK, BACK * 0.55, -1.2, 0, 1.3, FRONT - 0.5].map((z) => [w + OPEN * z * round + Math.max(0, lip) * 0.3, z * round]); // (the wall of the cleft, from its back to its mouth: true where one climbs)
      return [...inner, [w + 0.9 * round, nose - 0.25 + f(6) * 0.5], [w + 2.0 * round, nose + 0.2 + f(7)], [w + far * 0.62, nose - 0.15 + f(8)], [w + far * 0.9 + f(9) * 0.7, nose - 1.5 + f(9) * 0.7], [w + far + f(10), -0.6], [w + far * 0.95 + f(11) * 0.7, deep * 0.5 - f(11) * 0.5], [w + far * 0.74, deep * 0.92 - f(12)], [w + far * 0.36, deep - f(13)], [w + 0.5 * round, deep * 0.88], inner[0]];
    };
    const LIGHT = V(0.45, 0.62, 0.64).normalize(); // (where the light of the picture comes from: above, before, to the right)
    const tone = (side, y, L, n, inner, zz) => {
      // (warmer and lighter towards the top; darker deep in the cleft and under what overhangs; whatever looks up is under moss)
      const lift = 0.55 + 0.6 * clamp(y / 40, 0, 1), deepIn = inner ? clamp(0.5 + (zz + 5.2) * 0.085, 0.45, 1) : 1, lit = 0.62 + 0.5 * Math.max(0, n.x * side * LIGHT.x * side + n.y * LIGHT.y + n.z * LIGHT.z);
      if (n.y > 0.5) { const m = (0.7 + 0.5 * h2(Math.floor(y * 3), side)) * lift * deepIn; return [0.3 * m, 0.6 * m, 0.14 * m, 1]; }
      const g = L.tone * lift * deepIn * lit * (n.y < -0.25 ? 0.5 : 1) * 1.08;
      // (moss in patches on the rock itself: it is seen from below, where the shelves are not)
      const moss = clamp((noise(y * 0.45 + zz * 0.5 + side * 3, side * 5.5 + zz * 0.3 + y * 0.12) - 0.6) * 5, 0, 0.85);
      const r = g * (0.8 + 0.14 * L.hue), gg = g * (0.71 + 0.05 * L.hue), b = g * (0.61 - 0.07 * L.hue), m = lift * deepIn * lit;
      return [r + (0.26 * m - r) * moss, gg + (0.5 * m - gg) * moss, b + (0.13 * m - b) * moss, 1];
    };
    this.tops = {};
    const profiles = {};
    for (const side of [-1, 1]) {
      const Ls = layers(side), grid = [];
      // (rows where the rock changes: the hollow at the foot of a layer, its face, the lip at its top)
      for (const L of Ls) {
        const th = L.y1 - L.y0, ys = [[0.02, -0.26], [Math.min(0.42, th * 0.3), 0]];
        for (let u = 1.2; u < th - 0.6; u += 0.95) ys.push([u, 0.06 * Math.sin(u * 2.1 + L.k)]);
        ys.push([th - Math.min(0.38, th * 0.25), 0.14], [th - 0.02, 0.32]);
        for (const [u, lip] of ys) grid.push({ y: L.y0 + u, L, P: profile(side, L.y0 + u, lip, L) });
      }
      profiles[side] = grid;
      const rows = grid.length - 1;
      for (let j = 0; j <= rows; j++) {
        const n = grid[j].P.length;
        grid[j].pts = grid[j].P.map(([x, z], i) => {
          const inner = i <= 5 || i === n - 1, a = inner ? 0.06 : 0.22;
          return V(side * (x + (inner ? h2(i * 7 + side * 3, j) * a : (h2(i * 7 + side * 3, j) - 0.5) * a)), grid[j].y, z + (inner ? 0 : (h2(i * 3 + 11, j * 5 + side) - 0.5) * 0.22));
        });
      }
      const N = grid[0].pts.length, _a = V(0, 0, 0), _b = V(0, 0, 0), _n = V(0, 0, 0);
      for (let j = 0; j < rows; j++) for (let i = 0; i + 1 < N; i++) {
        const a = grid[j].pts[i], q = grid[j].pts[i + 1], r = grid[j + 1].pts[i + 1], d = grid[j + 1].pts[i];
        _a.subVectors(q, a); _b.subVectors(d, a); _n.crossVectors(_a, _b).normalize(); if (side < 0) _n.negate();
        const o = { color: tone(side, grid[j].y, grid[j + 1].L, _n, i <= 4, (a.z + q.z) / 2), u0: i * 1.1, v0: grid[j].y };
        if (side < 0) rock.quad(a, d, r, q, o); else rock.quad(a, q, r, d, o);
      }
      // (its head: grass)
      const head = grid[rows].pts.slice(0, N - 1), mid = head.reduce((s, p) => s.add(p), V(0, 0, 0)).multiplyScalar(1 / head.length);
      mid.y += 0.35;
      for (let i = 0; i < head.length; i++) { const a = head[i], b = head[(i + 1) % head.length], g = 0.8 + 0.4 * h2(i, side + 20); rock.tri(...(side > 0 ? [mid, a, b] : [mid, b, a]), { color: [0.36 * g, 0.66 * g, 0.18 * g, 1] }); }
      this.tops[side] = { x: mid.x, y: mid.y, z: mid.z };
    }
    /** A place on the outside of a needle (its front, its far side) at a height: [x, z] of point `i` of its outline. */
    const outside = (side, y, i) => { const g = profiles[side]; let j = 0; while (j + 1 < g.length && g[j + 1].y < y) j++; return g[j].P[i]; };

    // ---- what grows: ferns, bushes, creepers, flowers, trees
    const green = (k, light = 1) => { const g = (0.5 + 0.7 * h2(k, 91)) * light; return [(0.2 + 0.16 * h2(k, 93)) * g, 0.64 * g, 0.14 * g + 0.06 * h2(k, 92), 1]; };
    const fern = (p, size, k) => {
      const n = 5 + Math.floor(3 * h2(k, 1));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + h2(k, i + 2), dir = V(Math.cos(a), 0, Math.sin(a)), across = V(-dir.z, 0, dir.x).multiplyScalar(0.13 * size), l = size * (0.7 + 0.5 * h2(k + i, 3));
        const m = p.clone().addScaledVector(dir, l * 0.5).add(V(0, l * 0.42, 0)), t = p.clone().addScaledVector(dir, l).add(V(0, l * 0.12, 0)), c = green(k + i * 13);
        leaf.quad(p.clone().sub(across), p.clone().add(across), m.clone().add(across), m.clone().sub(across), { color: c });
        leaf.tri(m.clone().sub(across), m.clone().add(across), t, { color: [c[0] * 1.2, c[1] * 1.2, c[2] * 1.1, 1] });
      }
    };
    const blob = (p, r, c, flat = 0.75) => leaf.tint(...c).place(p.x, p.y, p.z, h2(p.x, p.y) * TAU).lathe([[0, -r * flat], [r * 0.7, -r * flat * 0.7], [r, 0], [r * 0.75, r * flat * 0.7], [0, r * flat]], 7).pop();
    const bush = (p, r, k) => { for (let i = 0; i < 3 + (k % 2); i++) blob(p.clone().add(V((h2(k, i) - 0.5) * r * 1.3, r * (0.3 + 0.4 * h2(k, i + 5)), (h2(k, i + 9) - 0.5) * r * 1.3)), r * (0.55 + 0.35 * h2(k, i + 3)), green(k * 7 + i)); };
    const creeper = (p, len, k) => {
      let a = p.clone();
      for (let i = 0; i < Math.ceil(len / 0.5); i++) {
        const b = a.clone().add(V((h2(k, i) - 0.5) * 0.16, -0.5, (h2(k, i + 30) - 0.5) * 0.16));
        leaf.tint(...green(k + i, 0.8)).rod(a, b, 0.025, 4, { caps: false });
        if (i % 2 === 0) { const s = 0.16 + 0.08 * h2(k, i + 60), o = V((h2(k, i + 70) - 0.5) * 0.3, 0, (h2(k, i + 80) - 0.5) * 0.3); leaf.quad(b, b.clone().add(o).add(V(s, -s * 0.4, 0)), b.clone().add(o).add(V(0, -s * 1.6, 0)), b.clone().add(o).add(V(-s, -s * 0.4, 0)), { color: green(k + i * 3) }); }
        a = b;
      }
    };
    const flower = (p, k) => blob(p, 0.09 + 0.04 * h2(k, 5), h2(k, 6) < 0.6 ? [1.5, 0.16, 0.12, 1] : [1.6, 1.1, 0.15, 1], 1);
    const tree = (p, h, k) => {
      const lean = V((h2(k, 1) - 0.5) * 0.9, h, (h2(k, 2) - 0.5) * 0.9), mid = p.clone().addScaledVector(lean, 0.55).add(V(0.25, 0, 0.1)), top = p.clone().add(lean);
      bark.tint(0.75, 0.6, 0.5, 1).rod(p.clone().add(V(0, -0.4, 0)), mid, 0.2, 6, { r1: 0.14, caps: false }).rod(mid, top, 0.14, 6, { r1: 0.07, caps: false });
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + h2(k, i + 4), r = h * (0.34 + 0.16 * h2(k, i + 8)), q = top.clone().add(V(Math.cos(a) * r * 0.75, (h2(k, i + 12) - 0.3) * 0.7, Math.sin(a) * r * 0.75)); bark.tint(0.7, 0.56, 0.46, 1).rod(mid.clone().lerp(top, 0.7), q, 0.06, 5, { caps: false }); blob(q.clone().add(V(0, 0.25, 0)), r, green(k * 5 + i, 1.15), 0.38); }
      blob(top.clone().add(V(0, 0.5, 0)), h * 0.4, green(k * 5 + 9, 1.25), 0.4);
    };

    // ---- the ledges: a shelf of rock under grass, a fern or two, a creeper from its end
    C.ledges.forEach((l, n) => {
      const b = ledgeBox(l, {}), s = l.side, tip = s > 0 ? b.x0 : b.x1, zs = [-2.3, -1.2, 0, 1.1, 2.0], T = C.ledge;
      // (its end is round, seen from above; it is thicker against the wall)
      const out = (z) => l.out * (1 - 0.3 * (z / 2.3) ** 2) + (z < -1.2 ? 0.2 : 0);
      for (let i = 0; i + 1 < zs.length; i++) {
        const z0 = zs[i], z1 = zs[i + 1], w0 = face(s, l.y, z0), w1 = face(s, l.y, z1), t0 = w0 - s * out(z0), t1 = w1 - s * out(z1), g = 0.8 + 0.45 * h2(n, i);
        const A = V(w0 + s * 0.3, l.y, z0), B = V(t0, l.y, z0), Cc = V(t1, l.y, z1), D = V(w1 + s * 0.3, l.y, z1), under = (p, deep) => V(p.x, l.y - deep, p.z), q = (pts, o) => (s > 0 ? rock.quad(pts[0], pts[1], pts[2], pts[3], o) : rock.quad(pts[3], pts[2], pts[1], pts[0], o));
        q([A, B, Cc, D], { color: [0.36 * g, 0.66 * g, 0.18 * g, 1] }); // (the grass)
        for (let f = 0; f < 4; f++) { const p0 = B.clone().lerp(Cc, f / 4), p1 = B.clone().lerp(Cc, (f + 1) / 4), c = green(n * 17 + i * 5 + f, 1.15); leaf.tri(p0, p1, p0.clone().lerp(p1, 0.5).add(V(-s * 0.06, -0.28 - 0.2 * h2(n + f, i), 0)), { color: c }); } // (and its fringe, which hangs over the end)
        q([Cc, B, under(B, T * 0.9), under(Cc, T * 0.9)], { color: [0.62 * g, 0.5 * g, 0.38 * g, 1] }); // (its end)
        q([under(D, T * 1.5), under(Cc, T * 0.9), under(B, T * 0.9), under(A, T * 1.5)], { color: [0.34, 0.28, 0.22, 1] }); // (underneath, in the shade)
        if (i === 0) q([B, A, under(A, T * 1.5), under(B, T * 0.9)], { color: [0.5, 0.42, 0.32, 1] });
        if (i === zs.length - 2) q([D, Cc, under(Cc, T * 0.9), under(D, T * 1.5)], { color: [0.66 * g, 0.54 * g, 0.4 * g, 1] });
      }
      fern(V(face(s, l.y, -1.5) - s * 0.35, l.y, -1.5), 0.75, n * 11 + 1); fern(V(face(s, l.y, 1.4) - s * 0.3, l.y, 1.4), 0.6, n * 11 + 2);
      if (n % 2 === 0) bush(V(face(s, l.y, -1.9) - s * 0.5, l.y, -1.9), 0.42, n + 40);
      flower(V(face(s, l.y, 1.0) - s * (0.25 + 0.4 * h2(n, 8)), l.y + 0.12, 1.0 + 0.4 * h2(n, 9)), n + 3); flower(V(face(s, l.y, -0.9) - s * 0.2, l.y + 0.1, -0.9), n + 5);
      for (const z of [-1.6, 0.6, 1.7]) creeper(V(face(s, l.y, z) - s * out(z) * 0.98, l.y - 0.05, z), 0.9 + 1.5 * h2(n, z + 5), n * 5 + z);
    });
    // ---- on the walls and on the needles: ferns on every shelf, creepers, bushes; trees on their heads
    for (const side of [-1, 1]) {
      const top = TOP[side > 0 ? 0 : 1];
      for (let k = 0; k < 84; k++) {
        const y = 2 + (top - 4) * h2(k, side + 30), z = -4 + 6.6 * h2(k, side + 31), x = face(side, y, z) + side * 0.02;
        if (wetAt(side, y) && z > -1.5 && z < 1.5) continue;
        if (k % 3 === 0) fern(V(x - side * 0.05, y, z), 0.5 + 0.45 * h2(k, 2), k * 3 + side); else if (k % 3 === 1) creeper(V(x - side * 0.04, y, z), 1.2 + 2.8 * h2(k, 3), k + side * 50); else if (k % 6 === 2) bush(V(x - side * 0.1, y, z), 0.3 + 0.22 * h2(k, 6), k + side * 20);
      }
      for (let k = 0; k < 26; k++) {
        // (on their fronts and their far sides)
        const y = 3 + (top - 5) * h2(k, side + 40), i = 6 + Math.floor(h2(k, side + 41) * 5), P = outside(side, y, i), p = V(side * (P[0] + 0.05), y, P[1] + 0.05);
        if (k % 3 === 0) bush(p, 0.4 + 0.3 * h2(k, 4), k + side * 70); else if (k % 3 === 1) fern(p, 0.7, k * 5 + side); else creeper(p, 1.5 + 2.5 * h2(k, 5), k * 9 + side);
      }
      const t = this.tops[side];
      tree(V(t.x + side * 1.0, t.y - 0.25, t.z - 1.6), 3.2 + 0.8 * h2(side, 50), side + 60); if (side < 0) tree(V(t.x - 2.2, t.y - 0.3, t.z + 0.6), 2.4, 77);
      for (let k = 0; k < 9; k++) { const a = h2(k, side + 61) * TAU, r = 0.8 + 2.4 * h2(k, side + 62), p = V(t.x + Math.cos(a) * r * 0.8, t.y - 0.25, t.z + Math.sin(a) * r * 1.5); if (k % 3 === 0) bush(p, 0.5, k + side * 90); else fern(p, 0.8, k * 7 + side * 3); if (k % 2) flower(p.clone().add(V(0.3, 0.15, 0.2)), k + side); }
      for (let k = 0; k < 7; k++) { const z = -3.5 + 6 * h2(k, side + 63); creeper(V(face(side, top - 0.6, z) - side * 0.03, top - 0.5, z), 1.6 + 3 * h2(k, side + 64), k * 4 + side * 30); }
    }
    // ---- the bell, on the head of the right needle
    const bell = (this.bell = { x: this.tops[1].x - 0.4, y: TOP[0] + 0.15, z: this.tops[1].z + 1.2 });
    bark.tint(0.9, 0.85, 0.8, 1).cylinder(bell.x + 1.1, bell.y - 0.3, bell.z, 0.09, 0.07, 2.7, 6).beam(V(bell.x + 1.1, bell.y + 2.3, bell.z), V(bell.x - 0.1, bell.y + 2.3, bell.z), 0.09, 0.09);
    paint.tint(...GOLD, 1).place(bell.x, bell.y + 1.8, bell.z).lathe([[0.03, 0.4], [0.13, 0.36], [0.22, 0.1], [0.31, -0.05], [0.34, -0.12]], 10).pop();
    for (const b of all) b.pop();

    // ---- the planks between the needles, the landing before them and the walkway from the beach: level, on piles
    const [ax, az] = WAY.a, [bx, bz] = WAY.b, len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len, inZ = C.at.z + C.deep;
    wood.tint(1, 0.98, 0.92, 1).box(cx - 1.42, F - 0.09, LANDING[3] - 0.05, cx + 1.42, F, inZ).box(LANDING[0], F - 0.09, LANDING[1], LANDING[2], F, LANDING[3]);
    wood.beam(V(ax, F - 0.045, az), V(bx + dx * 0.3, F - 0.045, bz + dz * 0.3), WAY.half * 2, 0.09);
    const pile = (x, z, top = F - 0.05) => { const g = Math.min(-0.6, this.data.heightAt(x, z)) - 0.5; wet.tint(0.9, 0.88, 0.85, 1).cylinder(x, g, z, 0.09, 0.09, top - g, 6); };
    const post = (x, z) => { pile(x, z, F + 0.95); return V(x, F + 0.88, z); };
    let prev = null, prevIn = null;
    for (let t = 1.2; t < len - 0.4; t += 2.25) {
      // (a post on each side, and a rope from post to post: nobody walks off the planks — see the rails below)
      const x = ax + dx * t, z = az + dz * t, p = post(x + dz * 0.7, z - dx * 0.7), q = post(x - dz * 0.7, z + dx * 0.7);
      if (prev) matte.tint(...ROPE, 1).rod(prev, p, 0.022, 4, { caps: false });
      if (prevIn) matte.tint(...ROPE, 1).rod(prevIn, q, 0.022, 4, { caps: false });
      prev = p; prevIn = q;
    }
    // (the rope of the side of the cliff ends at a post where the landing begins; one more closes the landing behind it)
    { const p = post(LANDING[0] + 0.15, LANDING[3] - 0.3); if (prevIn) matte.tint(...ROPE, 1).rod(prevIn, p, 0.022, 4, { caps: false }); }
    for (const x of [LANDING[0] + 0.15, cx, LANDING[2] - 0.15]) { const p = post(x, LANDING[1] + 0.12); if (prev) matte.tint(...ROPE, 1).rod(prev, p, 0.022, 4, { caps: false }); prev = p; }
    { const p = post(LANDING[2] - 0.15, LANDING[3] - 0.3); matte.tint(...ROPE, 1).rod(prev, p, 0.022, 4, { caps: false }); }
    pile(LANDING[0] + 0.2, LANDING[3] - 0.2); for (const z of [C.at.z - 1.5, C.at.z + 2]) for (const sx of [-1.2, 1.2]) pile(cx + sx, z);
    // ---- its name over the walkway, where it leaves the sand; what it is, on the landing
    const sx = ax + dx * 2.4, sz = az + dz * 2.4, yaw = Math.atan2(dx, dz);
    for (const u of [-1.05, 1.05]) for (let y = 0, k = 0; y < 3.1; y += 0.62, k++) paint.tint(...(k % 2 ? CREAM : RED), 1).cylinder(sx + dz * u, F + y, sz - dx * u, 0.1, 0.1, 0.62, 8);
    const name = canvasBoard(1024, 200, (ctx, w, h) => {
      ctx.fillStyle = '#1d2a33'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = "700 92px Georgia, 'Times New Roman', serif"; ctx.fillText(C.name.toUpperCase(), w / 2, 84, w * 0.9);
      ctx.fillStyle = '#f2c14e'; ctx.font = '600 34px system-ui, sans-serif'; ctx.fillText('FORTY METRES UP THE CLEFT · FROM WALL TO WALL', w / 2, 158, w * 0.9);
    }, 2.5, 0.49, { both: true });
    name.mesh.position.set(sx, F + 2.9, sz); name.mesh.rotation.y = yaw; name.mesh.name = 'cleft-name';
    this.group.add(name.mesh);
    this.board = canvasBoard(512, 384, (ctx, w, h) => this._board(ctx, w, h), 1.5, 1.125, { both: false });
    this.board.mesh.position.set(LANDING[2] - 0.5, F + 1.55, LANDING[3] - 0.45); this.board.mesh.rotation.y = Math.PI + 0.5; this.board.mesh.name = 'cleft-board';
    bark.tint(0.9, 0.85, 0.8, 1).cylinder(LANDING[2] - 0.5, F, LANDING[3] - 0.42, 0.06, 0.06, 1.1, 6);
    this.group.add(this.board.mesh);
    this.group.add(parts.toMeshes(mats, { name: 'cleft-rock', layers: [LAYER.STATIC_CASTER] }));

    // ---- the water: a fall down the cliff behind the cleft, from a spring in the rock; and what runs down the walls
    const foam = world.water.shared.uFoam, fall = [], zTop = C.at.z + 13.4;
    for (let z = zTop; z > C.at.z + 5.2; z -= 0.45) fall.push(V(cx, Math.max(0.12, this.data.heightAt(cx, z) + 0.35), z));
    fall.push(V(cx, 0.1, C.at.z + 5.0));
    const sheet = fallsRibbon(fall, V(1, 0, 0), 2.6, foam, (i) => (i === 0 ? 0 : i === fall.length - 1 ? 0.5 : 1));
    const veil = fallsRibbon(fall.slice(2), V(1, 0, 0), 4.6, foam, (i) => Math.min(0.45, i / 8));
    const boil = fallsRibbon([0, 0.9, 1.9, 3.0, 4.2, 5.4].map((d) => V(cx, 0.08, C.at.z + 5.4 - d)), V(1, 0, 0), 4.2, foam, (i) => [0, 0.9, 0.95, 0.7, 0.4, 0][i], true);
    for (const m of [sheet, veil, boil]) { m.name = 'cleft-fall'; this.group.add(m); }
    for (const w of C.wet) {
      const pts = []; for (let y = w.y1 + 0.5; y > w.y0 - 0.7; y -= 0.5) { const p = cleftPoint(w.side * (wall(w.side, y) + OPEN * 0.1 - 0.05), y, 0.1, {}); pts.push(V(p.x, p.y, p.z)); }
      const m = fallsRibbon(pts, V(0, 0, 1), 2.3, foam, (i) => (i === 0 || i === pts.length - 1 ? 0 : Math.min(1, 0.55 + i * 0.2)));
      m.name = 'cleft-wet'; this.group.add(m);
    }

    // ---- what moves: the stones that come down, the way of the next jump, a mark where a stone comes
    const lump = (name, build) => { const p = new Parts(); build(p); const m = p.toMeshes(mats, { name, layers: [] }); m.visible = false; this.group.add(m); return m; };
    this.stones = Array.from({ length: ROCKS }, (_, k) => lump('cleft-stone', (p) => p.get('needle').tint(0.8 + 0.2 * (k % 3), 0.72, 0.6, 1).lathe([[0, -0.3], [0.2, -0.26], [0.34, -0.04], [0.31, 0.17], [0.17, 0.3], [0, 0.33]], 7)));
    this.dots = Array.from({ length: DOTS }, (_, k) => lump('cleft-dot', (p) => { const r = 0.085 - k * 0.003; p.get('glow').tint(1.2, 0.9, 0.25, 1).lathe([[0, -r], [r, 0], [0, r]], 6); }));
    this.marks = Array.from({ length: 3 }, () => lump('cleft-mark', (p) => p.get('glow').tint(1.4, 0.3, 0.1, 1).lathe([[0, -0.3], [0.16, -0.05], [0, 0.12]], 4)));

    // ---- one walks to it: the planks carry, and so does the water round them (the needles stand at the edge of the bay)
    const col = world.collision;
    this.deck = {
      clearance: 1.2,
      heightAt: (x, z) => {
        if (x >= LANDING[0] && x <= LANDING[2] && z >= LANDING[1] && z <= LANDING[3]) return F;
        if (Math.abs(x - cx) <= 1.42 && z > LANDING[3] - 0.05 && z <= inZ) return F;
        const t = (x - ax) * dx + (z - az) * dz, u = (x - ax) * -dz + (z - az) * dx;
        return t >= 0 && t <= len + 0.3 && Math.abs(u) <= WAY.half ? F : null;
      },
    };
    col.addPlatform(this.deck);
    col.addArea(new Polygon([[ax + dz * 2, az - dx * 2], [LANDING[0] - 0.3, LANDING[1] - 1.5], [LANDING[2] + 1.2, LANDING[1] - 1.5], [LANDING[2] + 1.2, LANDING[3] + 0.1], [cx + 1.4, LANDING[3] + 0.1], [cx + 1.4, inZ - 0.05], [cx - 1.4, inZ - 0.05], [cx - 1.4, LANDING[3] + 0.1], [LANDING[0] - 0.3, LANDING[3] + 0.1], [ax - dz * 2, az + dx * 2]], { name: 'cleft' }));
    for (const side of [-1, 1]) col.addBox(cx + side * (1.5 + 2.7), C.at.z + 1.1, 2.7, 4.3);
    // ---- the ropes hold: nobody falls off the walkway, off the landing, or off the end of the planks (walls as
    // thin as a rope, at the height of the planks only: who swims underneath passes)
    {
      const y0 = F + 0.2, y1 = F + 2.0, thin = 0.05, yaw = Math.atan2(-dz, dx);
      const rail = (x0, z0, x1, z1) => col.addBox((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2, thin, Math.atan2(-(z1 - z0), x1 - x0), y0, y1);
      // the walkway: both sides, from the sand to the landing
      for (const side of [-1, 1]) { const ox = -dz * side * (WAY.half + 0.06), oz = dx * side * (WAY.half + 0.06); col.addBox((ax + bx) / 2 + ox, (az + bz) / 2 + oz, len / 2 + 0.2, thin, yaw, y0, y1); }
      // the landing: its side to the sea, its far end, its side to the rock (the needles close the rest), and its near
      // end on both sides of where the walkway comes in
      const [lx0, lz0, lx1, lz1] = LANDING, at = (x) => bz + ((x - bx) * dz) / dx, wide = (WAY.half + 0.06) / Math.abs(dx);
      rail(lx0, lz0 - 0.06, lx1, lz0 - 0.06);
      rail(lx1 + 0.06, lz0, lx1 + 0.06, lz1);
      rail(lx0, lz1 + 0.06, cx - 1.42, lz1 + 0.06);
      rail(cx + 1.42, lz1 + 0.06, lx1, lz1 + 0.06);
      rail(lx0 - 0.06, lz0, lx0 - 0.06, Math.max(lz0, at(lx0) - wide));
      rail(lx0 - 0.06, Math.min(lz1, at(lx0) + wide), lx0 - 0.06, lz1);
      // the end of the planks, before the fall
      rail(cx - 1.42, inZ + 0.06, cx + 1.42, inZ + 0.06);
    }
    this.gate = { x: cx, z: (LANDING[1] + LANDING[3]) / 2 + 0.3, y: F, yaw: 0 };
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    return this;
  }

  _board(ctx, w, h) {
    ctx.fillStyle = '#1d2a33'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f2c14e'; ctx.font = "700 44px Georgia, 'Times New Roman', serif"; ctx.fillText(CLEFT.name.toUpperCase(), w / 2, 52, w * 0.9);
    ctx.fillStyle = '#f6e7b8'; ctx.font = '600 25px system-ui, sans-serif';
    ['From wall to wall, up to the bell.', 'Hold on to a wall: you slide slowly.', 'Mind the stones — a ledge is a roof.', 'No net: who falls, falls.'].forEach((t, k) => ctx.fillText(t, w / 2, 112 + k * 40, w * 0.9));
    ctx.fillStyle = '#f2c14e'; ctx.font = '700 36px system-ui, sans-serif'; ctx.fillText(this.best ? `Your best  ${formatTime(this.best)}` : 'Not climbed yet', w / 2, 318, w * 0.9);
  }

  setBest(ms) { this.best = ms || 0; this.board?.redraw(); }
  /** Is one on the planks before the cleft or between the needles (where one asks to climb)? */
  near(x, z, y = CLEFT.floor) { const L = CLEFT.landing; return Math.abs(y - CLEFT.floor) < 1.2 && x > L[0] + 0.3 && x < L[2] - 0.3 && z > L[1] && z < CLEFT.at.z + CLEFT.deep; }

  /** A place of the cleft in the world, as a vector. */
  at(x, y, d, out = V(0, 0, 0)) { const p = cleftPoint(x, y, d, this._p || (this._p = {})); return out.set(p.x, p.y, p.z); }

  /**
   * A climb is asked for: the player is put on the planks between the needles. `io`: { play, note }.
   * Returns the session — the driver of the player: step(dt, player, control), camera(camera, dt), line, over
   * (`time` in ms), ended, drop(player), close(), auto (true: it climbs by itself).
   */
  open(player, io) {
    const C = CLEFT, events = [], input = { x: 0, y: 0, jump: false }, st = startClimb(this.clock()), sparks = this.world.sparks;
    const S = { cam: null, look: V(0, 0, 0), after: 0, acc: 0, yaw: Math.PI, spin: 0, shake: 0, trail: 0, high: 0 }, _t = V(0, 0, 0), pos = V(0, 0, 0), arc = [];
    const burst = (n, r = 0.35) => sparks?.glitter(pos.x, pos.y + 0.5, pos.z, r, n);
    const session = {
      cleft: this, over: false, ended: false, time: 0, line: '', riding: false, anim: ANIM.idle, state: st, auto: false,
      step: (dt, pl, control) => {
        const inp = pl.input;
        if (session.auto) {
          S.acc += Math.min(dt, 0.25);
          while (S.acc >= C.step && !st.over) { S.acc -= C.step; botInput(st, input); stepClimb(st, C.step, input, events); }
        } else {
          input.x = control ? inp.move.x : 0; input.y = control ? inp.move.y : 0; input.jump = control && !!inp.jump;
          if (!st.over) stepClimb(st, dt, input, events);
        }
        this.at(st.x, st.y, 0, pos);
        for (const e of events) {
          if (e.type === 'kick') { io.play('jump', { volume: 0.5 }); burst(8); S.trail = 0.5; }
          else if (e.type === 'jump') { io.play('jump', { volume: 0.4 }); S.trail = 0.35; }
          else if (e.type === 'cling' && e.wet) io.play('splash', { volume: 0.25 });
          else if (e.type === 'hit') { io.play('whack'); io.note('A stone!'); S.shake = 0.4; }
          else if (e.type === 'land') { if (e.fell > 4) { io.play('land'); io.note(`${Math.round(e.fell)} m down${e.ledge < 0 ? ' — back on the planks' : ', onto a ledge'}.`); } }
          else if (e.type === 'top') { io.play('bell'); io.play('victory', { volume: 0.7 }); io.note(`The top! ${formatTime(e.time)}`); sparks?.glitter(pos.x, pos.y + 1, pos.z, 1.4, 60); }
        }
        events.length = 0;
        let yaw;
        if (st.over) {
          // onto the head of the needle, to the bell
          S.after += dt;
          if (!session.over) { session.over = true; session.time = st.time; }
          const k = clamp(S.after / 0.8, 0, 1), from = this.at(st.x, C.height, 0, _t), b = this.bell;
          const to = _t.clone().set(C.at.x - (b.x - 0.9), C.floor + b.y, C.at.z - b.z);
          pos.set(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * 0.9, from.z + (to.z - from.z) * k);
          yaw = Math.PI; session.anim = k < 1 ? ANIM.jump : ANIM.idle;
          if (S.after > 3.4) session.ended = true;
        } else {
          const way = st.wall || (st.ground ? st.face : Math.sign(st.vx) || st.face);
          yaw = -way * Math.PI / 2;
          session.anim = st.ground ? (Math.abs(st.vx) > 0.4 ? ANIM.run : ANIM.idle) : ANIM.jump;
          // (a trail of stardust behind a jump, as long as it carries)
          if (S.trail > 0 && !st.ground && !st.wall) { S.trail -= dt; sparks?.trail(1, dt, pos.x, pos.y + 0.3, pos.z, 6); }
        }
        S.spin = st.stun > 0 ? S.spin + dt * 12 : 0;
        let d = yaw - S.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); S.yaw += d * Math.min(1, dt * 18);
        pl.pos.copy(pos); pl.yaw = S.yaw; pl.roll = 0; pl.pitch = st.stun > 0 ? Math.sin(S.spin) * 1.2 : 0;
        pl.speed = st.ground ? Math.abs(st.vx) : 0; pl.grounded = st.ground || st.over;
        this._arc(st, arc);
        S.high = Math.max(S.high, st.y);
        session.line = st.over ? `${C.name} · ${formatTime(st.time)}` : !st.started ? `${C.name} · to a wall, and from wall to wall` : `${formatTime(Math.round((st.clock - st.go) * 1000))} · ${Math.max(0, Math.floor(st.y))} m of ${C.height}${st.hits ? ` · ${st.hits} stone${st.hits === 1 ? '' : 's'}` : ''}`;
      },
      /** The camera: out over the water before the cleft, lower than the climber, looking up into it. */
      camera: (cam, dt) => {
        const y = st.over ? C.height + 2.5 : st.y;
        if (st.over) this.at(3.2, y + 2.2, 11.5, _t); else this.at(st.x * 0.3, Math.max(1.5, y - 0.5), 6.6, _t);
        if (S.shake > 0) { S.shake -= dt; _t.x += (Math.random() - 0.5) * S.shake; _t.y += (Math.random() - 0.5) * S.shake; }
        if (!S.cam) S.cam = _t.clone(); else S.cam.lerp(_t, Math.min(1, dt * (st.over ? 2 : 6)));
        if (st.over) this.at(0.8, y - 1.6, -1, _t); else this.at(st.x * 0.45, y + 2.5, 0, _t);
        S.look.lerp(_t, S.look.lengthSq() ? Math.min(1, dt * 7) : 1);
        cam.position.copy(S.cam); cam.up.set(0, 1, 0); cam.lookAt(S.look);
        return st.over ? 62 : 74;
      },
      /** The climb is over (or left): the player is put back on the planks before the cleft. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x, this.gate.z, this.gate.yaw); session.close(); },
      close: () => { if (this.session === session) this.session = null; player.pitch = 0; for (const m of this.dots) m.visible = false; },
    };
    this.session = session;
    session.step(0, player, false);
    return session;
  }

  /** The way of the next jump, in dots of light before the climber (nothing in the air). */
  _arc(st, arc) {
    const pts = st.over ? null : leapArc(st, DOTS, arc);
    this.dots.forEach((m, k) => {
      m.visible = !!pts && k < pts.length;
      if (m.visible) { this.at(pts[k][0], pts[k][1] + 0.8, 0.25, m.position); m.updateMatrixWorld(true); }
    });
  }

  /** Every frame: the stones are where the clock of the world says; a mark shows above who climbs where one comes. */
  update() {
    const clock = this.clock(), st = this.session?.state;
    let n = 0, marks = 0;
    rocks(clock, (r) => {
      const m = this.stones[n++];
      if (m) { m.visible = true; this.at(r.x, r.y, 0, m.position); m.rotation.set(r.y * 1.3, r.n, r.y * 0.9); m.updateMatrixWorld(true); }
      // (a stone on its way, still above what the climber sees: a mark at the top of the picture, on its line)
      if (st && !st.over && r.y > st.y + 7.5 && r.y < st.y + 22 && r.stop < st.y + 1.6 && marks < this.marks.length) { const k = this.marks[marks++]; k.visible = true; this.at(r.x, st.y + 7.2, 0.3, k.position); k.updateMatrixWorld(true); }
    }, this._r || (this._r = {}));
    for (; n < this.stones.length; n++) this.stones[n].visible = false;
    for (; marks < this.marks.length; marks++) this.marks[marks].visible = false;
  }
}
