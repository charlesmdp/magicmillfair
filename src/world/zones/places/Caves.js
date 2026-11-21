// Caves. A gallery is a tube of rock built round a smooth line through the nodes of the layout (CAVES): a flat
// floor, walls, a low vault, rough everywhere, widening into chambers. Where it comes out of the mountain it
// has a thick lip, like a porch of rock, and the terrain is cut away inside it (see Terrain: holes).
// No lamp is computed: the light is painted in the vertices — daylight near the mouth, then lanterns and
// glowing crystals.
import * as THREE from 'three';
import { Corridor } from '../../Areas.js';
import { seatAt } from '../../../player/PlayerController.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ARCH = 12, FLOOR = 4; // segments across the vault and across the floor
const SHAPE = 0.55; // how square the vault is (1 = a half circle)
const LIP = 0.7; // thickness of the porch at the mouth

const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Smooth line through the nodes [x, z, r, floor, roof]: a sample every `step` metres, with its direction. */
function spine(nodes, step = 1.25) {
  const out = [];
  const at = (k, t) => {
    const p0 = nodes[Math.max(0, k - 1)], p1 = nodes[k], p2 = nodes[k + 1], p3 = nodes[Math.min(nodes.length - 1, k + 2)];
    const t2 = t * t, t3 = t2 * t;
    return p1.map((_, c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3));
  };
  for (let k = 0; k + 1 < nodes.length; k++) {
    const n = Math.max(2, Math.round(Math.hypot(nodes[k + 1][0] - nodes[k][0], nodes[k + 1][1] - nodes[k][1]) / step));
    for (let i = k === 0 ? 0 : 1; i <= n; i++) out.push(at(k, i / n));
  }
  let s = 0;
  return out.map((p, i) => {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    if (i > 0) s += Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]);
    return { x: p[0], z: p[1], r: Math.max(1.2, p[2]), floor: p[3], roof: Math.max(2.4, p[4]), dx: (b[0] - a[0]) / l, dz: (b[1] - a[1]) / l, s };
  });
}

/**
 * Builds one cave into `parts` (walls in 'cave', furniture in wood, lights in 'glow'). Returns what the game
 * needs: the corridor to walk in, the hole to cut in the terrain, a function giving the light anywhere inside.
 */
export function buildCave(parts, cave, { seats, colliders, ground }) {
  const line = spine(cave.nodes);
  const lights = (cave.lights || []).map(([x, z, kind]) => {
    // on the floor of the gallery at that spot
    let best = line[0];
    for (const p of line) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (best.x - x) ** 2 + (best.z - z) ** 2) best = p;
    return { x, z, y: best.floor + (kind === 'lantern' ? 1.45 : 0.7), floor: best.floor, kind, power: kind === 'lantern' ? 2.3 : 1.5 };
  });
  /** Light at a point: [amount, r, g, b]. Daylight fades within a few metres of the mouth; then lamps only. */
  const lightAt = (x, y, z, depth) => {
    let amount = 0.24 + 0.9 * Math.exp(-Math.max(0, depth) / 5.5), r = amount, g = amount, b = amount * 1.04;
    for (const l of lights) {
      const d2 = (x - l.x) ** 2 + (y - l.y) ** 2 + (z - l.z) ** 2;
      const k = l.power / (1 + d2 / 9);
      amount += k;
      if (l.kind === 'lantern') { r += k * 1.25; g += k * 0.92; b += k * 0.55; } else { r += k * 0.55; g += k * 0.95; b += k * 1.35; }
    }
    return [amount, r / amount, g / amount, b / amount];
  };

  // ---- the tube
  const b = parts.get('cave');
  const ring = (p, grow = 0) => {
    // points of a section, from the foot of the left wall over the vault to the foot of the right wall, then the floor back
    const pts = [];
    const sx = -p.dz, sz = p.dx; // to the left of the direction of travel… (either side: the section is symmetric)
    for (let j = 0; j <= ARCH; j++) {
      const phi = (j / ARCH) * Math.PI, u = -Math.cos(phi), up = Math.sin(phi) ** SHAPE;
      // roughness: never into the room at the foot of the walls, free higher up
      // (calm near the mouth, where the terrain is cut to the exact shape of the vault)
      const calm = 0.2 + 0.8 * Math.min(1, Math.max(0, (p.s - cave.open - 0.5) / 2.5));
      const n = ((noise(p.s * 0.55 + 7.3, j * 0.8) - 0.5) * 1.1 + (noise(p.s * 1.9, j * 2.3 + 40) - 0.5) * 0.4) * calm;
      // (nothing at the foot of the walls: they meet the floor exactly)
      const out = grow + Math.max(n, -0.5 * up) * Math.min(1, up * 2.2) * Math.min(1, p.r / 3);
      const lat = u * (p.r + 0.12 + out * (1 - up * 0.5)), y = p.floor + (p.roof + out) * up;
      pts.push(V(p.x + sx * lat, y, p.z + sz * lat));
    }
    for (let j = 0; j <= FLOOR; j++) {
      const u = 1 - (2 * j) / FLOOR;
      const lat = u * (p.r + 0.12 + grow);
      pts.push(V(p.x + sx * lat, p.floor - grow + (noise(p.x + sx * lat, p.z + sz * lat) - 0.5) * 0.07 * (1 - Math.abs(u)), p.z + sz * lat));
    }
    return pts;
  };
  const M = ARCH + FLOOR + 2;
  const rings = line.map((p) => ring(p));
  const centre = (p) => V(p.x, p.floor + p.roof * 0.4, p.z);
  const put = (P, i, j, inward, lit) => {
    // normal from the neighbours, turned towards the inside (or the outside, for the porch)
    const a = P[Math.max(0, i - 1)][j], c = P[Math.min(P.length - 1, i + 1)][j];
    const lo = j === 0 || j === ARCH + 1 ? j : j - 1, hi = j === ARCH || j === M - 1 ? j : j + 1;
    const n = new THREE.Vector3().crossVectors(c.clone().sub(a), P[i][hi].clone().sub(P[i][lo])).normalize();
    const p = P[i][j], toC = centre(line[i]).sub(p);
    if ((n.dot(toC) < 0) === inward) n.negate();
    const floor = j > ARCH;
    const k = 0.84 + 0.32 * noise(p.x * 0.7 + p.y, p.z * 0.7 - p.y);
    const [amount, lr, lg, lb] = lit ? lightAt(p.x, p.y, p.z, line[i].s) : [1, 1, 1, 1];
    // (the outside of the porch: weathered, darker than the fresh rock inside)
    const tone = floor ? [0.66, 0.6, 0.52] : lit ? [1, 0.98, 0.95] : [0.62, 0.58, 0.52];
    // arc length across for the texture
    return b.vert(p, n, (floor ? (j - ARCH - 1) * 0.9 : j * 0.8) + (floor ? 30 : 0), line[i].s, [tone[0] * k * lr, tone[1] * k * lg, tone[2] * k * lb, Math.min(1.9, Math.max(0.15, amount * (floor ? 0.9 : 1)))]);
  };
  const quad = (i0, i1, i2, i3, p0, p1, p2, towards) => {
    // wound so that it faces `towards`
    const n = new THREE.Vector3().crossVectors(p1.clone().sub(p0), p2.clone().sub(p0));
    if (n.dot(towards.clone().sub(p0)) > 0) b.idx.push(i0, i1, i2, i0, i2, i3); else b.idx.push(i0, i2, i1, i0, i3, i2);
  };
  const ids = rings.map((_, i) => Array.from({ length: M }, (__, j) => put(rings, i, j, true, true)));
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let j = 0; j + 1 < M; j++) {
      if (j === ARCH) continue; // the corner between the right wall and the floor: separate vertices
      quad(ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j], rings[i][j], rings[i][j + 1], rings[i + 1][j + 1], centre(line[i]));
    }
  }
  {
    // the far end: closed
    const i = rings.length - 1, p = line[i], c = V(p.x + p.dx * 0.6, p.floor + p.roof * 0.45, p.z + p.dz * 0.6);
    const [amount, lr, lg, lb] = lightAt(c.x, c.y, c.z, p.s);
    const ci = b.vert(c, V(-p.dx, 0, -p.dz), 0, p.s + 1, [0.9 * lr, 0.88 * lg, 0.85 * lb, Math.min(1.9, amount)]);
    for (let j = 0; j + 1 < M; j++) {
      const n = new THREE.Vector3().crossVectors(rings[i][j + 1].clone().sub(rings[i][j]), c.clone().sub(rings[i][j]));
      if (n.dot(V(-p.dx, 0, -p.dz)) > 0) b.idx.push(ids[i][j], ids[i][j + 1], ci); else b.idx.push(ids[i][j], ci, ids[i][j + 1]);
    }
  }
  {
    // the porch: the outside of the first metres, and the lip joining it to the inside
    const n = Math.max(2, line.findIndex((p) => p.s > cave.open + 1.2));
    const outer = line.slice(0, n + 1).map((p) => ring(p, LIP));
    const oid = outer.map((_, i) => Array.from({ length: M }, (__, j) => put(outer, i, j, false, false)));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < ARCH; j++) {
        const away = outer[i][j].clone().multiplyScalar(2).sub(centre(line[i]));
        quad(oid[i][j], oid[i][j + 1], oid[i + 1][j + 1], oid[i + 1][j], outer[i][j], outer[i][j + 1], outer[i + 1][j + 1], away);
      }
    }
    const front = V(line[0].x - line[0].dx * 5, line[0].floor + 1.5, line[0].z - line[0].dz * 5);
    const lipIn = Array.from({ length: ARCH + 1 }, (_, j) => b.vert(rings[0][j], V(-line[0].dx, 0, -line[0].dz), j * 0.8, -0.5, [0.8, 0.78, 0.74, 0.75]));
    const lipOut = Array.from({ length: ARCH + 1 }, (_, j) => b.vert(outer[0][j], V(-line[0].dx, 0, -line[0].dz), j * 0.8, -1, [0.64, 0.6, 0.54, 1]));
    for (let j = 0; j < ARCH; j++) quad(lipIn[j], lipIn[j + 1], lipOut[j + 1], lipOut[j], rings[0][j], rings[0][j + 1], outer[0][j + 1], front);
  }

  {
    // the sill: where the ground outside stands higher than the floor (a bank, the foot of the face), its cut
    // face closes the mouth up to that height — seen from inside, the opening has the outline of the ground
    const m = line[0], sx = -m.dz, sz = m.dx, half = m.r + 0.3, n = V(m.dx, 0, m.dz), STEP = 0.35;
    const top = (l) => Math.max(m.floor, ground(m.x + sx * l - m.dx * 0.06, m.z + sz * l - m.dz * 0.06));
    for (let l = -half; l < half; l += STEP) {
      const l1 = Math.min(half, l + STEP), y0 = top(l), y1 = top(l1);
      if (y0 < m.floor + 0.03 && y1 < m.floor + 0.03) continue;
      const P = (ll, y) => V(m.x + sx * ll, y, m.z + sz * ll);
      const c = [0.72, 0.68, 0.62, 0.8];
      const i0 = b.vert(P(l, m.floor - 0.3), n, l, 0, c), i1 = b.vert(P(l1, m.floor - 0.3), n, l1, 0, c), i2 = b.vert(P(l1, y1), n, l1, y1 - m.floor, c), i3 = b.vert(P(l, y0), n, l, y0 - m.floor, c);
      quad(i0, i1, i2, i3, P(l, m.floor - 0.3), P(l1, m.floor - 0.3), P(l1, y1), centre(line[2]));
    }
  }

  // ---- what is inside
  const at = (x, z) => {
    let best = line[0];
    for (const p of line) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (best.x - x) ** 2 + (best.z - z) ** 2) best = p;
    return best;
  };
  const lit = (x, y, z) => { const p = at(x, z), l = lightAt(x, y, z, p.s); return [l[1], l[2], l[3], Math.min(1.9, l[0])]; };
  const wood = parts.get('woodDark'), glow = parts.get('glow'), iron = wood; // (lantern posts in dark wood: one material less)
  for (const l of lights) {
    if (l.kind === 'lantern') {
      const c = lit(l.x, l.floor + 0.8, l.z);
      iron.tint(0.2 * c[0], 0.19 * c[1], 0.18 * c[2], c[3]).rod(V(l.x, l.floor - 0.2, l.z), V(l.x, l.y - 0.14, l.z), 0.035, 6);
      iron.box(l.x - 0.1, l.y - 0.14, l.z - 0.1, l.x + 0.1, l.y - 0.11, l.z + 0.1).box(l.x - 0.12, l.y + 0.13, l.z - 0.12, l.x + 0.12, l.y + 0.17, l.z + 0.12);
      glow.tint(1, 0.8, 0.45, 1).box(l.x - 0.075, l.y - 0.11, l.z - 0.075, l.x + 0.075, l.y + 0.13, l.z + 0.075);
      colliders.push({ type: 'circle', x: l.x, z: l.z, r: 0.14 });
    } else {
      // a cluster of crystals, leaning every which way
      for (let k = 0; k < 5; k++) {
        const a = hash(l.x + k, l.z) * Math.PI * 2, d = 0.12 + 0.3 * hash(l.z, k + l.x), h = 0.45 + 0.75 * hash(k * 3.3, l.x);
        const px = l.x + Math.cos(a) * d, pz = l.z + Math.sin(a) * d;
        const tone = k % 2 ? [0.1, 0.4, 0.58] : [0.3, 0.2, 0.62]; // (the glow material multiplies this: deep blue-green and violet)
        glow.tint(tone[0], tone[1], tone[2], 1).rod(V(px, l.floor - 0.1, pz), V(px + Math.cos(a) * h * 0.35, l.floor + h, pz + Math.sin(a) * h * 0.35), 0.11, 5, { r1: 0.015, caps: false });
      }
      colliders.push({ type: 'circle', x: l.x, z: l.z, r: 0.45 });
    }
  }
  for (const [x, z, yaw] of cave.chairs || []) {
    const y = at(x, z).floor, c = lit(x, y + 0.5, z);
    wood.tint(0.82 * c[0], 0.7 * c[1], 0.52 * c[2], c[3]).place(x, y, z, yaw);
    wood.box(-0.22, 0.31, -0.22, 0.22, 0.36, 0.22, { tile: 0.8 }); // seat
    for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [0.19, 0.19], [-0.19, 0.19]]) wood.box(lx - 0.03, 0, lz - 0.03, lx + 0.03, 0.31, lz + 0.03, { tile: 0.8 });
    wood.box(-0.22, 0.36, -0.22, -0.16, 0.86, -0.18, { tile: 0.8 }).box(0.16, 0.36, -0.22, 0.22, 0.86, -0.18, { tile: 0.8 }); // back
    wood.box(-0.22, 0.62, -0.215, 0.22, 0.84, -0.185, { tile: 0.8 });
    wood.pop();
    seats.push(seatAt(x, y + 0.36, z, yaw, { reach: 1.6 }));
    colliders.push({ type: 'circle', x, z, r: 0.3, y0: y - 1, y1: y + 0.5 });
  }
  if (cave.table) {
    const [x, z] = cave.table, y = at(x, z).floor, c = lit(x, y + 0.6, z);
    wood.tint(0.8 * c[0], 0.68 * c[1], 0.5 * c[2], c[3]).cylinder(x, y, z, 0.2, 0.16, 0.58, 8).cylinder(x, y + 0.58, z, 0.62, 0.62, 0.06, 12, { capBottom: true });
    glow.tint(1, 0.85, 0.5, 1).cylinder(x, y + 0.64, z, 0.035, 0.03, 0.14, 6); // a candle
    colliders.push({ type: 'circle', x, z, r: 0.6 });
  }

  if (cave.hoard) {
    // a chest that someone left there, its lid thrown back on something that shines; coins on the floor round it
    const [x, z, yaw] = cave.hoard, y = at(x, z).floor, c = lit(x, y + 0.4, z);
    wood.tint(0.56 * c[0], 0.38 * c[1], 0.22 * c[2], c[3]).place(x, y, z, yaw).box(-0.5, 0, -0.32, 0.5, 0.5, 0.32, { tile: 1, faces: 'xXzZy' });
    wood.place(0, 0.5, -0.32, 0, -1.2).box(-0.5, 0, 0, 0.5, 0.07, 0.64, { tile: 1 }).pop();
    wood.pop();
    glow.tint(1, 0.78, 0.2, 1).place(x, y + 0.26, z, yaw).lathe([[0.0, 0.0], [0.36, 0.0], [0.26, 0.12], [0.0, 0.2]], 7).pop();
    for (let k = 0; k < 9; k++) { const a = hash(x + k, z) * Math.PI * 2, d = 0.75 + 0.6 * hash(z, k); glow.cylinder(x + Math.cos(a) * d, y + 0.004, z + Math.sin(a) * d, 0.05, 0.05, 0.014, 6); }
    colliders.push({ type: 'circle', x, z, r: 0.62 });
  }
  for (const [x, z, kind] of cave.stock || []) {
    const y = at(x, z).floor, c = lit(x, y + 0.5, z), turn = hash(x, z) * 3;
    if (kind === 'keg') {
      wood.tint(0.6 * c[0], 0.43 * c[1], 0.27 * c[2], c[3]).place(x, y, z, turn).lathe([[0.0, 0.0], [0.27, 0.0], [0.33, 0.2], [0.35, 0.42], [0.33, 0.64], [0.27, 0.84], [0.0, 0.84]], 10, { tile: 0.8 }).pop();
      colliders.push({ type: 'circle', x, z, r: 0.38 });
    } else {
      wood.tint(0.8 * c[0], 0.64 * c[1], 0.44 * c[2], c[3]).place(x, y, z, turn).box(-0.4, 0, -0.32, 0.4, 0.56, 0.32, { tile: 0.8 });
      for (const e of [-0.4, 0.4]) wood.box(e - 0.03, 0, -0.35, e + 0.03, 0.59, 0.35, { tile: 0.8 });
      wood.pop();
      colliders.push({ type: 'circle', x, z, r: 0.5 });
    }
  }

  // ---- for the game
  // (the corridor starts a few metres in front of the mouth, so that it is entered from the valley floor)
  // (…or from further away, where the mouth is come to through a place that is not part of the valley: the sea)
  const reach = cave.reach || 4.5;
  const nodes = [[line[0].x - line[0].dx * reach, line[0].z - line[0].dz * reach, line[0].r - 0.22 + (reach > 5 ? 1.6 : 0), line[0].floor, line[0].roof]];
  if (reach > 5) nodes.push([line[0].x - line[0].dx * 3, line[0].z - line[0].dz * 3, line[0].r - 0.22, line[0].floor, line[0].roof]);
  for (let i = 0; i < line.length; i += 2) { const p = line[i]; nodes.push([p.x, p.z, p.r - 0.22, p.floor, p.roof]); }
  const last = line[line.length - 1];
  if ((line.length - 1) % 2) nodes.push([last.x, last.z, last.r - 0.22, last.floor, last.roof]);
  nodes.push([last.x + last.dx * 0.2, last.z + last.dz * 0.2, 0.2, last.floor, last.roof]); // the end wall is right there
  const corridor = new Corridor(nodes, { cave: true, cut: true, name: cave.id });
  /** Ambient light for someone standing at (x, z) in the cave. */
  corridor.light = (x, z) => { const p = at(x, z); return Math.min(1.25, 0.2 + lightAt(x, p.floor + 1, z, corridor.depthAt(x, z) - (reach - 4.5))[0] * 0.75); };
  const m = line[0];
  const hole = { x: m.x, z: m.z, dx: m.dx, dz: m.dz, half: m.r + 0.3, depth: cave.open + 4, floor: m.floor, height: m.roof + 0.3, shape: SHAPE / 2 };
  return { corridor, hole };
}
