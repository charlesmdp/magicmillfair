// The temple on the mountain: a pagoda of three roofs, a gate at the top of the stairway, pavilions, a stupa,
// a great bell, prayer wheels, and strings of prayer flags from the spire to everything around.
// Everything is built in world coordinates into a Parts set; build() returns what the place needs to know
// (obstacles, platforms, seats).
import * as THREE from 'three';
import { stairs } from '../../props/Structures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RED = [0.62, 0.1, 0.07], DARK_RED = [0.4, 0.07, 0.06], GOLD = [1.35, 0.95, 0.25], PLASTER = [1.7, 1.6, 1.38];
const TILE = [0.42, 0.6, 0.6], BRONZE = [0.42, 0.33, 0.16], STONE = [0.84, 0.82, 0.78];
const FLAGS = [[0.14, 0.32, 0.85], [0.97, 0.96, 0.92], [0.85, 0.12, 0.1], [0.16, 0.6, 0.24], [1.0, 0.8, 0.12]]; // sky, wind, fire, water, earth

/**
 * A pagoda roof in the frame of the builder: hipped, its slopes hollow and its corners turned up.
 * The eaves are a rectangle hx × hz (half sizes) at height y; the roof rises `rise` to a smaller rectangle
 * ix × iz (the storey above, or nearly nothing: a ridge or a point). `curl`: how much the corners lift.
 */
export function pagodaRoof(parts, y, hx, hz, rise, curl, { ix = 0.02, iz = 0.02, seg = 6, rows = 5, tone = TILE, under = DARK_RED, knobs = true } = {}) {
  const roof = parts.get('slate'), wood = parts.get('paint');
  // a point of the surface: side 0..3 (+x, +z, -x, -z), s in [-1, 1] along the eave, u in [0, 1] from the top down
  const at = (side, s, u, drop = 0) => {
    const lift = curl * Math.abs(s) ** 2.6 * u * u;
    const h = y + rise * (1 - u) ** 1.7 + lift - drop;
    const along = side % 2 === 0 ? iz + (hz - iz) * u : ix + (hx - ix) * u, out = side % 2 === 0 ? ix + (hx - ix) * u : iz + (hz - iz) * u;
    const sg = side < 2 ? 1 : -1;
    return side % 2 === 0 ? V(sg * out, h, sg * s * along) : V(-sg * s * along, h, sg * out);
  };
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < seg; i++) {
      const s0 = -1 + (2 * i) / seg, s1 = -1 + (2 * (i + 1)) / seg;
      for (let j = 0; j < rows; j++) {
        const u0 = j / rows, u1 = (j + 1) / rows, k = 0.9 + 0.2 * (((i * 3 + j * 5 + side) % 4) / 3);
        roof.tint(tone[0] * k, tone[1] * k, tone[2] * k, 1).quad(at(side, s0, u0), at(side, s1, u0), at(side, s1, u1), at(side, s0, u1), { tile: 1.4 });
        // the underside, a hand lower: painted timber
        if (j >= rows - 3) wood.tint(under[0], under[1], under[2], 1).quad(at(side, s0, u1, 0.12), at(side, s1, u1, 0.12), at(side, s1, u0, 0.12), at(side, s0, u0, 0.12));
      }
      // the edge of the eave
      wood.tint(under[0] * 1.25, under[1] * 1.25, under[2] * 1.25, 1).quad(at(side, s0, 1), at(side, s1, 1), at(side, s1, 1, 0.12), at(side, s0, 1, 0.12));
    }
    // the hip: a ridge of round tiles from the top down to the corner, a golden knob at its tip
    let prev = at(side, 1, 0, -0.04);
    roof.tint(tone[0] * 0.62, tone[1] * 0.62, tone[2] * 0.62, 1);
    for (let j = 1; j <= rows; j++) { const q = at(side, 1, j / rows, -0.04); roof.rod(prev, q, 0.085, 5, { caps: false }); prev = q; }
    if (knobs) parts.get('paint').tint(GOLD[0], GOLD[1], GOLD[2], 1).place(prev.x, prev.y + 0.06, prev.z).lathe([[0.0, -0.1], [0.1, 0.0], [0.05, 0.12], [0.0, 0.26]], 6).pop();
  }
}

/** A round red column from y0 to y1, on a stone base, with a painted capital. */
function column(parts, x, y0, z, y1, r = 0.2) {
  parts.get('granite').tint(STONE[0], STONE[1], STONE[2], 1).cylinder(x, y0 - 0.2, z, r * 1.5, r * 1.3, 0.38, 8, { tile: 1 });
  const p = parts.get('paint');
  p.tint(RED[0], RED[1], RED[2], 1).cylinder(x, y0 + 0.18, z, r, r * 0.92, y1 - y0 - 0.18, 9, { capTop: false });
  p.tint(GOLD[0] * 0.9, GOLD[1] * 0.9, GOLD[2] * 0.9, 1).cylinder(x, y1 - 0.2, z, r * 1.25, r * 1.25, 0.2, 9, { capTop: false });
}

/** A stone lantern: foot, shaft, a lit box under a little roof. */
function stoneLantern(parts, x, y, z, k = 1) {
  const g = parts.get('granite'), glow = parts.get('glow');
  g.tint(STONE[0], STONE[1], STONE[2], 1).place(x, y, z);
  g.lathe([[0.34 * k, -0.2], [0.34 * k, 0.1], [0.14 * k, 0.2], [0.11 * k, 0.95 * k], [0.3 * k, 1.05 * k], [0.3 * k, 1.12 * k]], 6, { tile: 1 });
  g.lathe([[0.36 * k, 1.5 * k], [0.12 * k, 1.68 * k], [0.05 * k, 1.84 * k]], 6, { tile: 1 });
  g.pop();
  glow.tint(1.0, 0.74, 0.36, 1).box(x - 0.19 * k, y + 1.12 * k, z - 0.19 * k, x + 0.19 * k, y + 1.5 * k, z + 0.19 * k);
}

/** A string of prayer flags between two points: it sags, the flags hang from it. */
export function prayerFlags(parts, a, c, sag = 1.6, start = 0) {
  const cord = parts.get('woodDark'), cloth = parts.get('doubleSided');
  const len = a.distanceTo(c), n = Math.max(4, Math.round(len / 0.62));
  const dir = c.clone().sub(a).setY(0).normalize();
  const at = (t) => { const p = a.clone().lerp(c, t); p.y -= Math.sin(Math.PI * t) * sag; return p; };
  let prev = at(0);
  cord.tint(0.9, 0.85, 0.7, 1);
  for (let i = 1; i <= n; i++) {
    const p = at(i / n);
    if (i % 2 === 0 || i === n) { cord.rod(prev, p, 0.012, 3, { caps: false }); prev = p; }
    if (i === n) break;
    const col = FLAGS[(i + start) % FLAGS.length], q = at((i + 0.72) / n);
    // (each flag is caught a little differently by the wind)
    const blow = 0.1 + 0.12 * ((i * 7) % 5) / 4, side = V(-dir.z, 0, dir.x).multiplyScalar(blow);
    cloth.tint(col[0], col[1], col[2], 1).quad(p.clone().add(V(0, -0.5, 0)).add(side), q.clone().add(V(0, -0.5, 0)).add(side), q, p, { tile: 1 });
  }
}

/**
 * Builds the temple. `site` = the layout (VILLAGE), `y` the level of its shelf, `ground(x, z)` the terrain.
 * Returns { colliders, platforms }.
 */
export function buildTemple(parts, site, y, ground) {
  const colliders = [], platforms = [];
  const T = site.temple;
  const paint = parts.get('paint'), plaster = parts.get('matte'), granite = parts.get('granite'), glow = parts.get('glow');
  const frame = (o, fn) => { for (const b of parts.map.values()) b.place(o.x, y, o.z, o.yaw || 0); fn(); for (const b of parts.map.values()) b.pop(); };
  // every builder that will be used inside a frame must exist before the frame is opened
  for (const m of ['slate', 'paint', 'matte', 'granite', 'glow', 'woodDark', 'doubleSided', 'stone', 'glass']) parts.get(m);
  const toWorld = (o, lx, lz) => { const c = Math.cos(o.yaw || 0), s = Math.sin(o.yaw || 0); return [o.x + lx * c + lz * s, o.z - lx * s + lz * c]; };

  // --- the great hall: a plinth, a ring of red columns, three storeys under three roofs, a golden spire.
  // In its own frame the front (the niche of the statue, the steps) looks along +X.
  {
    const H = T.hall, P = H.plinth, B = 4.6; // half size of the plinth, of the ground storey
    frame(H, () => {
      granite.tint(STONE[0], STONE[1], STONE[2], 1).box(-P, -1.2, -P, P, 0.9, P, { tile: 1.6, faces: 'xXzZY' });
      granite.tint(STONE[0] * 0.92, STONE[1] * 0.92, STONE[2] * 0.92, 1).box(-P - 0.25, -1.2, -P - 0.25, P + 0.25, 0.2, P + 0.25, { tile: 1.6, faces: 'xXzZY' });
      // the ground storey: plastered walls, a red band at their foot, round windows, the niche in front
      plaster.tint(PLASTER[0], PLASTER[1], PLASTER[2], 1);
      plaster.box(-B, 0.9, -B, B, 5.0, -B + 0.4).box(-B, 0.9, B - 0.4, B, 5.0, B).box(-B, 0.9, -B, -B + 0.4, 5.0, B);
      plaster.box(B - 0.4, 0.9, -B, B, 5.0, -1.5).box(B - 0.4, 0.9, 1.5, B, 5.0, B).box(B - 0.4, 3.7, -1.5, B, 5.0, 1.5);
      paint.tint(DARK_RED[0], DARK_RED[1], DARK_RED[2], 1);
      paint.box(-B - 0.03, 0.9, -B - 0.03, B + 0.03, 1.75, B + 0.03, { faces: 'xzZ' }).box(B, 0.9, -B - 0.03, B + 0.03, 1.75, -1.5).box(B, 0.9, 1.5, B + 0.03, 1.75, B + 0.03);
      // the niche: dark inside, a golden figure seated on a lotus, two lamps
      paint.tint(0.1, 0.05, 0.04, 1).box(B - 2.6, 0.9, -1.5, B - 2.5, 3.7, 1.5, { faces: 'X' }).box(B - 2.6, 0.9, -1.5, B - 0.4, 3.7, -1.45, { faces: 'Z' }).box(B - 2.6, 0.9, 1.45, B - 0.4, 3.7, 1.5, { faces: 'z' }).box(B - 2.6, 3.65, -1.5, B - 0.4, 3.7, 1.5, { faces: 'y' });
      granite.tint(0.7, 0.68, 0.66, 1).box(B - 2.6, 0.9, -1.5, B - 0.4, 0.92, 1.5, { faces: 'Y', tile: 1 });
      paint.tint(RED[0], RED[1], RED[2], 1).box(B - 0.4, 0.9, -1.72, B + 0.06, 3.9, -1.5).box(B - 0.4, 0.9, 1.5, B + 0.06, 3.9, 1.72).box(B - 0.4, 3.7, -1.72, B + 0.06, 3.95, 1.72);
      paint.tint(GOLD[0], GOLD[1], GOLD[2], 1).place(B - 1.7, 0.92, 0);
      paint.lathe([[0.0, 0.0], [0.62, 0.0], [0.7, 0.12], [0.5, 0.22], [0.42, 0.3]], 10); // the lotus
      paint.lathe([[0.42, 0.3], [0.5, 0.48], [0.44, 0.62], [0.3, 0.9], [0.27, 1.22], [0.12, 1.32]], 9); // crossed legs, body
      paint.lathe([[0.1, 1.3], [0.19, 1.42], [0.2, 1.56], [0.13, 1.7], [0.06, 1.76], [0.07, 1.86], [0.0, 1.9]], 8); // head, topknot
      paint.pop();
      for (const s of [-1, 1]) glow.tint(1.0, 0.7, 0.3, 1).place(B - 1.3, 0.92, s * 1.05).lathe([[0.05, 0.0], [0.05, 0.5], [0.11, 0.55], [0.0, 0.75]], 6).pop();
      // round windows on the sides, their red rims
      for (const sz of [-1, 1]) for (const lx of [-2.0, 1.2]) {
        paint.tint(RED[0], RED[1], RED[2], 1).place(lx, 3.0, sz * (B + 0.02), 0, (sz * Math.PI) / 2).lathe([[0.62, 0.0], [0.7, 0.05], [0.52, 0.05]], 12).pop();
        paint.tint(0.08, 0.06, 0.05, 1).place(lx, 3.0, sz * (B + 0.03), 0, (sz * Math.PI) / 2).lathe([[0.52, 0.0], [0.0, 0.0]], 12).pop();
      }
      // the ring of columns under the first roof, a beam on their heads
      const C = P - 0.45;
      for (let k = -2; k <= 2; k++) for (const s of [-1, 1]) {
        column(parts, k * (C / 2), 0.9, s * C, 4.4);
        if (Math.abs(k) < 2) column(parts, s * C, 0.9, k * (C / 2), 4.4);
      }
      paint.tint(DARK_RED[0], DARK_RED[1], DARK_RED[2], 1);
      for (const s of [-1, 1]) paint.box(-C - 0.2, 4.4, s * C - 0.14, C + 0.2, 4.72, s * C + 0.14).box(s * C - 0.14, 4.4, -C, s * C + 0.14, 4.72, C);
      pagodaRoof(parts, 4.72, P + 1.5, P + 1.5, 2.3, 1.15, { ix: 3.1, iz: 3.1, seg: 8 });
      // the second storey, its little balcony rail, its roof
      plaster.tint(PLASTER[0], PLASTER[1], PLASTER[2], 1).box(-3.0, 6.9, -3.0, 3.0, 9.4, 3.0, { faces: 'xXzZ' });
      paint.tint(RED[0], RED[1], RED[2], 1);
      for (const s of [-1, 1]) for (const t of [-1, 1]) paint.box(s * 3.0 - 0.14, 6.9, t * 3.0 - 0.14, s * 3.0 + 0.14, 9.4, t * 3.0 + 0.14);
      for (const s of [-1, 1]) { paint.box(-0.6, 7.3, s * 3.02 - 0.02, 0.6, 8.9, s * 3.02 + 0.02).box(s * 3.02 - 0.02, 7.3, -0.6, s * 3.02 + 0.02, 8.9, 0.6); }
      paint.tint(DARK_RED[0], DARK_RED[1], DARK_RED[2], 1).box(-3.2, 9.4, -3.2, 3.2, 9.62, 3.2, { faces: 'xXzZ' });
      pagodaRoof(parts, 9.62, 5.0, 5.0, 2.0, 0.95, { ix: 1.9, iz: 1.9, seg: 6 });
      // the third storey and the last roof, drawn up to a point
      plaster.tint(PLASTER[0], PLASTER[1], PLASTER[2], 1).box(-1.8, 11.5, -1.8, 1.8, 13.5, 1.8, { faces: 'xXzZ' });
      paint.tint(RED[0], RED[1], RED[2], 1);
      for (const s of [-1, 1]) for (const t of [-1, 1]) paint.box(s * 1.8 - 0.12, 11.5, t * 1.8 - 0.12, s * 1.8 + 0.12, 13.5, t * 1.8 + 0.12);
      paint.tint(DARK_RED[0], DARK_RED[1], DARK_RED[2], 1).box(-2.0, 13.5, -2.0, 2.0, 13.7, 2.0, { faces: 'xXzZ' });
      pagodaRoof(parts, 13.7, 3.5, 3.5, 2.9, 0.8, { seg: 6, rows: 6 });
      // the spire: rings of gold, a ball, a needle
      paint.tint(GOLD[0], GOLD[1], GOLD[2], 1).place(0, 16.5, 0);
      paint.lathe([[0.34, 0.0], [0.4, 0.14], [0.2, 0.3], [0.3, 0.44], [0.16, 0.6], [0.24, 0.74], [0.12, 0.9], [0.18, 1.02], [0.08, 1.2], [0.2, 1.42], [0.2, 1.52], [0.04, 1.74], [0.03, 2.9], [0.0, 3.0]], 8);
      paint.pop();
      // the steps up to the plinth, in front
      granite.tint(STONE[0], STONE[1], STONE[2], 1);
    });
    const [ax, az] = toWorld(H, P + 2.5, 0), [bx, bz] = toWorld(H, P - 0.05, 0);
    platforms.push(stairs(granite.tint(STONE[0], STONE[1], STONE[2], 1), V(ax, y, az), V(bx, y + 0.9, bz), 4.4, { steps: 5, tile: 1.4, sideWalls: false }));
    platforms.push({ type: 'slab', x: H.x, z: H.z, hw: P, hl: P, yaw: H.yaw || 0, y: y + 0.9, clearance: 1.0 });
    colliders.push({ type: 'box', x: H.x, z: H.z, hw: B + 0.15, hl: B + 0.15, yaw: H.yaw || 0 });
    T.spire = { x: H.x, y: y + 19.3, z: H.z };
  }

  // --- the gate at the top of the stairway: two red columns, a beam, a small roof
  {
    const G = T.gate;
    frame(G, () => {
      for (const s of [-1, 1]) column(parts, 0, 0, s * 2.35, 4.5, 0.26);
      paint.tint(DARK_RED[0], DARK_RED[1], DARK_RED[2], 1).box(-0.2, 3.5, -3.1, 0.2, 3.85, 3.1).box(-0.24, 4.5, -3.4, 0.24, 4.9, 3.4);
      paint.tint(GOLD[0], GOLD[1], GOLD[2], 1).box(-0.26, 3.95, -0.75, 0.26, 4.42, 0.75);
      pagodaRoof(parts, 4.9, 1.5, 4.3, 1.0, 0.75, { ix: 0.05, iz: 3.3, seg: 6, rows: 4 });
    });
    for (const s of [-1, 1]) { const [cx, cz] = toWorld(G, 0, s * 2.35); colliders.push({ type: 'circle', x: cx, z: cz, r: 0.36 }); }
    T.gateTop = { x: G.x, y: y + 5.9, z: G.z };
  }

  // --- pavilions: where the monks live. A plastered house under one curling roof, a red door, a round window.
  for (const [i, p] of T.pavilions.entries()) {
    const hw = p.w / 2, hl = p.l / 2;
    frame(p, () => {
      granite.tint(STONE[0] * 0.95, STONE[1] * 0.95, STONE[2] * 0.95, 1).box(-hw - 0.3, -1.2, -hl - 0.3, hw + 0.3, 0.25, hl + 0.3, { tile: 1.6, faces: 'xXzZY' });
      plaster.tint(PLASTER[0], PLASTER[1], PLASTER[2], 1).box(-hw, 0.25, -hl, hw, 3.3, hl, { faces: 'xXzZ' });
      paint.tint(DARK_RED[0], DARK_RED[1], DARK_RED[2], 1).box(-hw - 0.02, 0.25, -hl - 0.02, hw + 0.02, 0.95, hl + 0.02, { faces: 'xXzZ' });
      paint.box(-hw - 0.05, 3.3, -hl - 0.05, hw + 0.05, 3.55, hl + 0.05, { faces: 'xXzZ' });
      // door and window on the front (+X), posts at the corners
      paint.tint(RED[0], RED[1], RED[2], 1).box(hw, 0.25, -0.62, hw + 0.05, 2.4, 0.62);
      paint.tint(GOLD[0], GOLD[1], GOLD[2], 1).box(hw + 0.05, 1.25, -0.06, hw + 0.09, 1.45, 0.06);
      for (const sz of [-1, 1]) {
        paint.tint(RED[0], RED[1], RED[2], 1).place(hw + 0.02, 2.0, sz * (hl - 1.0), 0, 0, -Math.PI / 2).lathe([[0.42, 0.0], [0.5, 0.05], [0.34, 0.05]], 10).pop();
        paint.tint(0.08, 0.06, 0.05, 1).place(hw + 0.03, 2.0, sz * (hl - 1.0), 0, 0, -Math.PI / 2).lathe([[0.34, 0.0], [0.0, 0.0]], 10).pop();
      }
      paint.tint(RED[0], RED[1], RED[2], 1);
      for (const s of [-1, 1]) for (const t of [-1, 1]) paint.box(s * hw - 0.13, 0.25, t * hl - 0.13, s * hw + 0.13, 3.3, t * hl + 0.13);
      pagodaRoof(parts, 3.55, hw + 1.0, hl + 1.0, 1.7 + 0.2 * (i % 2), 0.7, { ix: 0.05, iz: Math.max(0.05, hl - hw), seg: 6, rows: 4 });
    });
    colliders.push({ type: 'box', x: p.x, z: p.z, hw: hw + 0.3, hl: hl + 0.3, yaw: p.yaw || 0 });
  }

  // --- the bell: four posts, a roof, a great bronze bell and the beam that strikes it
  {
    const b = T.bell;
    frame(b, () => {
      granite.tint(STONE[0], STONE[1], STONE[2], 1).box(-2.1, -1.2, -2.1, 2.1, 0.22, 2.1, { tile: 1.6, faces: 'xXzZY' });
      for (const s of [-1, 1]) for (const t of [-1, 1]) column(parts, s * 1.6, 0.22, t * 1.6, 3.5, 0.17);
      paint.tint(DARK_RED[0], DARK_RED[1], DARK_RED[2], 1);
      for (const s of [-1, 1]) paint.box(-1.8, 3.5, s * 1.6 - 0.12, 1.8, 3.78, s * 1.6 + 0.12).box(s * 1.6 - 0.12, 3.5, -1.8, s * 1.6 + 0.12, 3.78, 1.8);
      paint.box(-0.1, 3.5, -1.7, 0.1, 3.7, 1.7);
      pagodaRoof(parts, 3.78, 2.7, 2.7, 1.9, 0.75, { seg: 6, rows: 4 });
      paint.tint(BRONZE[0], BRONZE[1], BRONZE[2], 1).place(0, 1.25, 0).lathe([[0.62, 0.0], [0.66, 0.08], [0.6, 0.2], [0.56, 0.9], [0.5, 1.5], [0.36, 1.85], [0.14, 2.0], [0.1, 2.25]], 12).pop();
      parts.get('woodDark').tint(1.0, 0.85, 0.65, 1).rod(V(0.78, 1.75, 0), V(2.4, 1.75, 0), 0.11, 7);
      parts.get('woodDark').tint(0.9, 0.85, 0.7, 1).rod(V(1.2, 1.86, 0), V(1.2, 3.5, 0.5), 0.012, 3).rod(V(2.0, 1.86, 0), V(2.0, 3.5, 0.5), 0.012, 3);
    });
    colliders.push({ type: 'circle', x: b.x, z: b.z, r: 0.9 });
    for (const s of [-1, 1]) for (const t of [-1, 1]) { const [cx, cz] = toWorld(b, s * 1.6, t * 1.6); colliders.push({ type: 'circle', x: cx, z: cz, r: 0.26 }); }
    T.bellTop = { x: b.x, y: y + 5.8, z: b.z };
  }

  // --- the stupa: a white dome on its steps, thirteen golden rings, and the eyes that look four ways
  {
    const s = T.stupa;
    frame(s, () => {
      plaster.tint(1.85, 1.8, 1.68, 1);
      plaster.box(-1.9, -1.2, -1.9, 1.9, 0.5, 1.9, { faces: 'xXzZY' }).box(-1.5, 0.5, -1.5, 1.5, 0.95, 1.5, { faces: 'xXzZY' }).box(-1.15, 0.95, -1.15, 1.15, 1.35, 1.15, { faces: 'xXzZY' });
      plaster.place(0, 1.35, 0).lathe([[0.95, 0.0], [1.12, 0.35], [1.1, 0.8], [0.88, 1.25], [0.5, 1.55], [0.42, 1.6]], 12).pop();
      paint.tint(GOLD[0], GOLD[1], GOLD[2], 1).box(-0.42, 2.95, -0.42, 0.42, 3.4, 0.42, { faces: 'xXzZY' });
      paint.place(0, 3.4, 0).lathe([[0.34, 0.0], [0.3, 0.12], [0.3, 0.2], [0.26, 0.32], [0.26, 0.4], [0.22, 0.52], [0.22, 0.6], [0.18, 0.72], [0.18, 0.8], [0.13, 0.95], [0.3, 1.02], [0.06, 1.2], [0.04, 1.75], [0.0, 1.8]], 8).pop();
      paint.tint(0.1, 0.12, 0.4, 1);
      for (const k of [-1, 1]) { paint.box(-0.43, 3.14, k * 0.2 - 0.09, -0.425, 3.24, k * 0.2 + 0.09).box(0.425, 3.14, k * 0.2 - 0.09, 0.43, 3.24, k * 0.2 + 0.09).box(k * 0.2 - 0.09, 3.14, -0.43, k * 0.2 + 0.09, 3.24, -0.425).box(k * 0.2 - 0.09, 3.14, 0.425, k * 0.2 + 0.09, 3.24, 0.43); }
    });
    colliders.push({ type: 'circle', x: s.x, z: s.z, r: 2.3 });
    T.stupaTop = { x: s.x, y: y + 5.1, z: s.z };
  }

  // --- prayer wheels: a row of golden drums on a red rack, under a narrow roof
  {
    const w = T.wheels, n = w.count, half = (n - 1) * 0.42;
    frame(w, () => {
      granite.tint(STONE[0] * 0.95, STONE[1] * 0.95, STONE[2] * 0.95, 1).box(-half - 0.5, -1.2, -0.42, half + 0.5, 0.3, 0.42, { tile: 1.4, faces: 'xXzZY' });
      paint.tint(RED[0], RED[1], RED[2], 1);
      for (const s of [-1, 1]) paint.box(s * (half + 0.36) - 0.07, 0.3, -0.07, s * (half + 0.36) + 0.07, 2.0, 0.07);
      paint.box(-half - 0.45, 0.62, -0.05, half + 0.45, 0.72, 0.05).box(-half - 0.45, 1.86, -0.07, half + 0.45, 2.0, 0.07);
      for (let k = 0; k < n; k++) {
        const lx = -half + k * 0.84;
        paint.tint(GOLD[0] * (0.92 + 0.12 * (k % 2)), GOLD[1] * (0.92 + 0.12 * (k % 2)), GOLD[2], 1).place(lx, 0.82, 0).lathe([[0.0, 0.0], [0.27, 0.0], [0.3, 0.06], [0.3, 0.86], [0.27, 0.92], [0.0, 0.92]], 10).pop();
        paint.tint(DARK_RED[0], DARK_RED[1], DARK_RED[2], 1).place(lx, 1.14, 0).lathe([[0.305, 0.0], [0.305, 0.22]], 10).pop();
      }
      pagodaRoof(parts, 2.0, half + 1.0, 0.85, 0.5, 0.3, { ix: half + 0.5, iz: 0.04, seg: 4, rows: 3, knobs: false });
    });
    colliders.push({ type: 'box', x: w.x, z: w.z, hw: half + 0.6, hl: 0.5, yaw: (w.yaw || 0) + Math.PI / 2 });
  }

  // --- the lotus pond in the middle of the court, the incense urn before the hall, stone lanterns along the way
  {
    const f = site.fountain, water = parts.get('glass');
    granite.tint(STONE[0], STONE[1], STONE[2], 1).place(f.x, y, f.z).lathe([[1.9, -0.3], [1.9, 0.5], [1.6, 0.5], [1.6, 0.1], [0.0, 0.08]], 14, { tile: 1.5 }).pop();
    water.tint(0.45, 0.7, 0.72, 1).cylinder(f.x, y + 0.36, f.z, 1.6, 1.6, 0.02, 14);
    const leaf = parts.get('doubleSided');
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4, r = 0.35 + 0.95 * ((k * 5) % 7) / 7, lx = f.x + Math.cos(a) * r, lz = f.z + Math.sin(a) * r;
      leaf.tint(0.22, 0.52, 0.2, 1).cylinder(lx, y + 0.385, lz, 0.2 + 0.06 * (k % 3), 0.2 + 0.06 * (k % 3), 0.004, 7);
      if (k % 3 === 0) paint.tint(1.25, 0.6, 0.85, 1).place(lx, y + 0.39, lz).lathe([[0.0, 0.0], [0.1, 0.06], [0.05, 0.17], [0.0, 0.2]], 6).pop();
    }
    colliders.push({ type: 'circle', x: f.x, z: f.z, r: 2.0 });
    const u = T.urn;
    paint.tint(BRONZE[0], BRONZE[1], BRONZE[2], 1).place(u.x, y, u.z);
    for (let k = 0; k < 3; k++) paint.rod(V(Math.cos(k * 2.094) * 0.5, -0.2, Math.sin(k * 2.094) * 0.5), V(Math.cos(k * 2.094) * 0.36, 0.5, Math.sin(k * 2.094) * 0.36), 0.06, 5);
    paint.lathe([[0.2, 0.42], [0.62, 0.62], [0.72, 0.95], [0.6, 1.2], [0.68, 1.26], [0.56, 1.3], [0.5, 1.16]], 12);
    paint.pop();
    glow.tint(1.0, 0.45, 0.15, 1).cylinder(u.x, y + 1.14, u.z, 0.5, 0.5, 0.03, 10);
    colliders.push({ type: 'circle', x: u.x, z: u.z, r: 0.85 });
    for (const [lx, lz] of T.lanterns) { stoneLantern(parts, lx, y, lz); colliders.push({ type: 'circle', x: lx, z: lz, r: 0.42 }); }
  }

  // --- prayer flags: from the spire to the gate, the bell, the stupa and two masts at the edge
  {
    const top = V(T.spire.x, T.spire.y - 0.5, T.spire.z);
    const ends = [V(T.gateTop.x, T.gateTop.y, T.gateTop.z), V(T.bellTop.x, T.bellTop.y, T.bellTop.z), V(T.stupaTop.x, T.stupaTop.y, T.stupaTop.z)];
    for (const [mx, mz] of T.masts) {
      const my = ground(mx, mz);
      parts.get('woodDark').tint(1.0, 0.9, 0.75, 1).rod(V(mx, my - 0.4, mz), V(mx, my + 7.5, mz), 0.07, 6);
      colliders.push({ type: 'circle', x: mx, z: mz, r: 0.25 });
      ends.push(V(mx, my + 7.4, mz));
    }
    ends.forEach((e, i) => prayerFlags(parts, top, e, 1.2 + top.distanceTo(e) * 0.05, i));
    // and between the masts and the gate, low over the lookout
    prayerFlags(parts, ends[3], ends[0], 1.0, 2);
    prayerFlags(parts, ends[4], ends[2], 1.0, 4);
  }
  return { colliders, platforms };
}
