// The mill house: a two-storey rubble-stone longhouse with granite dressings and a steep slate roof.
// Local frame: origin at the centre of the footprint, floor level at y = 0,
// +X = garden facade, +Z = pond-side gable.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

export const HOUSE = {
  W: 7.4, L: 16.4, EAVE: 5.4, PITCH: (47 * Math.PI) / 180, BASE: -2.6,
};
HOUSE.RIDGE = HOUSE.EAVE + (HOUSE.W / 2) * Math.tan(HOUSE.PITCH);

/** Wall plane helper: point at (u along the wall, v up, d outwards). */
function plane(origin, n) {
  const uDir = new THREE.Vector3().crossVectors(UP, n).normalize();
  const at = (u, v, d = 0) => origin.clone().addScaledVector(uDir, u).addScaledVector(n, d).setY(origin.y + v);
  return { at, n, uDir };
}

/** Rectangular wall with rectangular openings (each {u0,u1,v0,v1}). */
function wallWithOpenings(b, pl, length, v0, v1, openings, tile) {
  const cuts = new Set([0, length]);
  for (const o of openings) { cuts.add(o.u0); cuts.add(o.u1); }
  const us = [...cuts].sort((a, c) => a - c);
  for (let i = 0; i + 1 < us.length; i++) {
    const ua = us[i], ub = us[i + 1];
    if (ub - ua < 1e-4) continue;
    const inside = openings.filter((o) => o.u0 <= ua + 1e-4 && o.u1 >= ub - 1e-4).sort((a, c) => a.v0 - c.v0);
    let y = v0;
    const emit = (ya, yb) => {
      if (yb - ya < 1e-4) return;
      b.quad(pl.at(ua, ya), pl.at(ub, ya), pl.at(ub, yb), pl.at(ua, yb), { tile, u0: ua, v0: ya, normal: pl.n });
    };
    for (const o of inside) { emit(y, o.v0); y = o.v1; }
    emit(y, v1);
  }
}

/** Window or door set in an opening: stone reveals, painted frame, glazing bars, glass, dark room behind. */
function opening(parts, pl, o, depth = 0.24) {
  const stone = parts.get('granite'), paint = parts.get('woodPaint'), glass = parts.get('glass'), dark = parts.get('matte');
  const { u0, u1, v0, v1 } = o;
  const A = (u, v, d) => pl.at(u, v, -d);
  const inN = pl.n.clone().negate();
  // reveals (jambs, head, sill)
  stone.tint(0.92, 0.9, 0.86, 0.85);
  stone.quad(A(u0, v0, 0), A(u0, v0, depth), A(u0, v1, depth), A(u0, v1, 0), { tile: 1 });
  stone.quad(A(u1, v0, depth), A(u1, v0, 0), A(u1, v1, 0), A(u1, v1, depth), { tile: 1 });
  stone.quad(A(u0, v1, 0), A(u0, v1, depth), A(u1, v1, depth), A(u1, v1, 0), { tile: 1 });
  stone.quad(A(u0, v0, depth), A(u0, v0, 0), A(u1, v0, 0), A(u1, v0, depth), { tile: 1 });
  stone.tint(1, 1, 1, 1);
  // frame
  const f = 0.065, dF = depth - 0.06;
  const bar = (ua, va, ub, vb) => paint.quad(A(ua, va, dF), A(ub, va, dF), A(ub, vb, dF), A(ua, vb, dF), { tile: 1, normal: pl.n });
  bar(u0, v0, u1, v0 + f); bar(u0, v1 - f, u1, v1); bar(u0, v0, u0 + f, v1); bar(u1 - f, v0, u1, v1);
  const mid = (u0 + u1) / 2;
  if (o.door !== 'solid') {
    bar(mid - 0.035, v0, mid + 0.035, v1); // meeting stile
    const rows = o.rows ?? (v1 - v0 > 1.6 ? 3 : 2);
    for (let r = 1; r < rows; r++) { const y = v0 + ((v1 - v0) * r) / rows; bar(u0, y - 0.02, u1, y + 0.02); }
    // glass with a dark, slightly warm interior behind it
    glass.tint(1, 1, 1, 1);
    glass.quad(A(u0 + f, v0 + f, dF + 0.02), A(u1 - f, v0 + f, dF + 0.02), A(u1 - f, v1 - f, dF + 0.02), A(u0 + f, v1 - f, dF + 0.02), { normal: pl.n });
    dark.tint(0.16, 0.13, 0.11, 0.6);
    dark.quad(A(u0, v0, depth + 0.35), A(u1, v0, depth + 0.35), A(u1, v1, depth + 0.35), A(u0, v1, depth + 0.35), { normal: pl.n });
    if (o.curtain) {
      dark.tint(0.82, 0.78, 0.7, 0.8);
      dark.quad(A(u0 + f, v0 + f, depth + 0.1), A(u0 + (u1 - u0) * 0.32, v0 + f, depth + 0.1), A(u0 + (u1 - u0) * 0.26, v1 - f, depth + 0.1), A(u0 + f, v1 - f, depth + 0.1), { normal: pl.n });
      dark.quad(A(u1 - (u1 - u0) * 0.32, v0 + f, depth + 0.1), A(u1 - f, v0 + f, depth + 0.1), A(u1 - f, v1 - f, depth + 0.1), A(u1 - (u1 - u0) * 0.26, v1 - f, depth + 0.1), { normal: pl.n });
    }
  } else {
    // boarded door
    const wood = parts.get('woodDark');
    wood.tint(0.9, 0.88, 0.84, 1);
    wood.quad(A(u0 + f, v0, dF + 0.02), A(u1 - f, v0, dF + 0.02), A(u1 - f, v1 - f, dF + 0.02), A(u0 + f, v1 - f, dF + 0.02), { tile: 0.6, normal: pl.n });
  }
  // granite dressings standing proud of the rubble
  const P = 0.035;
  const blk = (ua, va, ub, vb, d = P) => {
    const a = pl.at(ua, va, 0), c = pl.at(ub, vb, d);
    // box spanning the two corners in wall space
    stone.quad(pl.at(ua, va, d), pl.at(ub, va, d), pl.at(ub, vb, d), pl.at(ua, vb, d), { tile: 1, u0: ua, v0: va, normal: pl.n });
    stone.quad(pl.at(ua, vb, d), pl.at(ub, vb, d), pl.at(ub, vb, 0), pl.at(ua, vb, 0), { tile: 1 });
    stone.quad(pl.at(ua, va, 0), pl.at(ub, va, 0), pl.at(ub, va, d), pl.at(ua, va, d), { tile: 1 });
    stone.quad(pl.at(ua, va, 0), pl.at(ua, va, d), pl.at(ua, vb, d), pl.at(ua, vb, 0), { tile: 1 });
    stone.quad(pl.at(ub, va, d), pl.at(ub, va, 0), pl.at(ub, vb, 0), pl.at(ub, vb, d), { tile: 1 });
    void a; void c;
  };
  const shade = (k) => stone.tint(k, k * 0.985, k * 0.96, 1);
  shade(1.0); blk(u0 - 0.2, v1, u1 + 0.2, v1 + 0.3); // lintel
  if (!o.door) { shade(0.95); blk(u0 - 0.12, v0 - 0.13, u1 + 0.12, v0, 0.07); } // sill
  // jamb stones, alternately long and short
  const n = Math.max(2, Math.round((v1 - v0) / 0.42));
  for (let i = 0; i < n; i++) {
    const ya = v0 + ((v1 - v0) * i) / n, yb = v0 + ((v1 - v0) * (i + 1)) / n - 0.012;
    const w = i % 2 ? 0.2 : 0.34;
    shade(0.92 + 0.12 * ((i * 7) % 3) / 2);
    blk(u0 - w, ya, u0, yb); blk(u1, ya, u1 + w, yb);
  }
  stone.tint(1, 1, 1, 1);
}

/** Alternating corner stones on a vertical edge shared by two wall planes. */
function quoins(parts, corner, nA, nB, y0, y1) {
  const g = parts.get('granite');
  const P = 0.035, H = 0.37;
  const n = Math.round((y1 - y0) / H);
  const dA = new THREE.Vector3().crossVectors(UP, nA).normalize(); // along wall A
  const dB = new THREE.Vector3().crossVectors(UP, nB).normalize();
  // make both run away from the corner
  const sA = dA.dot(nB) > 0 ? -1 : 1, sB = dB.dot(nA) > 0 ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const ya = y0 + ((y1 - y0) * i) / n, yb = y0 + ((y1 - y0) * (i + 1)) / n - 0.012;
    const la = i % 2 ? 0.26 : 0.5, lb = i % 2 ? 0.5 : 0.26;
    const k = 0.9 + 0.14 * (((i * 5) % 4) / 3);
    g.tint(k, k * 0.985, k * 0.96, 1);
    const c = corner.clone().addScaledVector(nA, P).addScaledVector(nB, P);
    const a1 = c.clone().addScaledVector(dA, sA * la), b1 = c.clone().addScaledVector(dB, sB * lb);
    const q = (p0, p1, n0) => {
      const pts = [p0.clone().setY(ya), p1.clone().setY(ya), p1.clone().setY(yb), p0.clone().setY(yb)];
      // order so that the quad faces n0
      const nn = new THREE.Vector3().crossVectors(pts[1].clone().sub(pts[0]), pts[3].clone().sub(pts[0]));
      if (nn.dot(n0) < 0) g.quad(pts[1], pts[0], pts[3], pts[2], { tile: 1 }); else g.quad(pts[0], pts[1], pts[2], pts[3], { tile: 1 });
    };
    q(c, a1, nA); q(c, b1, nB);
    // returns closing the block ends and its top
    q(a1, a1.clone().addScaledVector(nA, -P), dA.clone().multiplyScalar(sA));
    q(b1, b1.clone().addScaledVector(nB, -P), dB.clone().multiplyScalar(sB));
  }
  g.tint(1, 1, 1, 1);
}

function chimney(parts, x, z, yBase, yTop, sx = 1.0, sz = 0.62) {
  const g = parts.get('granite');
  g.tint(0.9, 0.88, 0.84, 1);
  g.box(x - sx / 2, yBase, z - sz / 2, x + sx / 2, yTop, z + sz / 2, { tile: 1, faces: 'xXzZ' });
  g.tint(0.82, 0.8, 0.77, 1);
  g.box(x - sx / 2 - 0.06, yTop, z - sz / 2 - 0.06, x + sx / 2 + 0.06, yTop + 0.12, z + sz / 2 + 0.06, { tile: 1 });
  // raised slab on four small stones (keeps the rain out)
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) g.cube(x + dx * (sx / 2 - 0.1), yTop + 0.2, z + dz * (sz / 2 - 0.1), 0.16, 0.16, 0.16, { tile: 1 });
  g.tint(0.74, 0.73, 0.7, 1);
  g.box(x - sx / 2 - 0.02, yTop + 0.28, z - sz / 2 - 0.02, x + sx / 2 + 0.02, yTop + 0.36, z + sz / 2 + 0.02, { tile: 1 });
  parts.get('matte').tint(0.03, 0.03, 0.03, 0.4).box(x - sx / 2 + 0.1, yTop + 0.12, z - sz / 2 + 0.1, x + sx / 2 - 0.1, yTop + 0.13, z + sz / 2 - 0.1, { faces: 'Y' });
}

/** Gable roof (two slate planes), ridge tiles, gable copings. Ridge runs along Z. */
function roof(parts, { hw, hl, eave, ridge, over = 0.28, copings = true, zOver = 0 }) {
  const slate = parts.get('slate');
  slate.tint(1, 1, 1, 1);
  const pitch = Math.atan2(ridge - eave, hw);
  const slopeLen = Math.hypot(hw, ridge - eave) + over;
  const ex = hw + over * Math.cos(pitch), ey = eave - over * Math.sin(pitch);
  const z0 = -hl - zOver, z1 = hl + zOver;
  const TH = 0.07;
  // +X slope then -X slope
  slate.quad(V(ex, ey + TH, z1), V(ex, ey + TH, z0), V(0, ridge + TH, z0), V(0, ridge + TH, z1), { tile: 2, uLen: z1 - z0, vLen: slopeLen });
  slate.quad(V(-ex, ey + TH, z0), V(-ex, ey + TH, z1), V(0, ridge + TH, z1), V(0, ridge + TH, z0), { tile: 2, uLen: z1 - z0, vLen: slopeLen });
  // eaves: fascia board and soffit
  const wood = parts.get('woodDark');
  wood.tint(0.7, 0.68, 0.66, 0.8);
  for (const s of [1, -1]) {
    const a = V(s * ex, ey + TH, z0), bq = V(s * ex, ey + TH, z1);
    const lo = (p) => p.clone().setY(ey - 0.1);
    if (s > 0) wood.quad(lo(bq), lo(a), a, bq, { tile: 1 }); else wood.quad(lo(a), lo(bq), bq, a, { tile: 1 });
    const inA = V(s * hw, ey - 0.1, z0), inB = V(s * hw, ey - 0.1, z1);
    if (s > 0) wood.quad(inB, inA, lo(a), lo(bq), { tile: 1 }); else wood.quad(inA, inB, lo(bq), lo(a), { tile: 1 });
  }
  // terracotta ridge: a low arch of five facets
  const clay = parts.get('matte');
  const R = 0.15, seg = 0.42;
  const count = Math.round((z1 - z0) / seg);
  for (let i = 0; i < count; i++) {
    const za = z0 + ((z1 - z0) * i) / count, zb = z0 + ((z1 - z0) * (i + 1)) / count - 0.012;
    const k = 0.85 + 0.3 * (((i * 13) % 7) / 6);
    clay.tint(0.62 * k, 0.27 * k, 0.17 * k, 1);
    let prev = null;
    for (let f = 0; f <= 5; f++) {
      const a = Math.PI * (0.08 + 0.84 * (f / 5));
      const px = Math.cos(a) * R * 1.25, py = ridge + TH - 0.05 + Math.sin(a) * R;
      if (prev) clay.quad(V(prev[0], prev[1], za), V(prev[0], prev[1], zb), V(px, py, zb), V(px, py, za), { tile: 1 });
      prev = [px, py];
    }
  }
  if (copings) {
    // stone copings running up each gable, with a kneeler at the foot
    const g = parts.get('granite');
    for (const zc of [z0, z1]) {
      const dir = zc > 0 ? 1 : -1;
      for (const s of [1, -1]) {
        const n = 7;
        for (let i = 0; i < n; i++) {
          const t0 = i / n, t1 = (i + 1) / n - 0.01;
          const xa = s * lerp(hw + 0.05, 0.42, t0), xb = s * lerp(hw + 0.05, 0.42, t1);
          const ya = lerp(eave, ridge, t0 * (1 - 0.42 / hw) + 0.0) , yb = lerp(eave, ridge, t1 * (1 - 0.42 / hw));
          const k = 0.86 + 0.16 * (((i * 5 + (s > 0 ? 1 : 0)) % 4) / 3);
          g.tint(k, k * 0.985, k * 0.96, 1);
          const zi = zc - dir * 0.3, zo = zc + dir * 0.06;
          const top = 0.2;
          const p = [V(xa, ya + top, zi), V(xb, yb + top, zi), V(xb, yb + top, zo), V(xa, ya + top, zo)];
          if (dir * s > 0) g.quad(p[0], p[1], p[2], p[3], { tile: 1 }); else g.quad(p[1], p[0], p[3], p[2], { tile: 1 });
          // outer face and inner face
          const lowA = V(xa, ya - 0.05, zo), lowB = V(xb, yb - 0.05, zo);
          if (dir * s > 0) g.quad(lowA, lowB, p[2], p[3], { tile: 1 }); else g.quad(lowB, lowA, p[3], p[2], { tile: 1 });
          const inA = V(xa, ya, zi), inB = V(xb, yb, zi);
          if (dir * s > 0) g.quad(inB, inA, p[0], p[1], { tile: 1 }); else g.quad(inA, inB, p[1], p[0], { tile: 1 });
        }
        g.tint(0.86, 0.85, 0.82, 1);
        g.cube(s * (hw + 0.12), eave + 0.06, zc - dir * 0.12, 0.5, 0.3, 0.42, { tile: 1 });
      }
    }
  }
}
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Build the house into `parts` (keyed by material).
 * Returns a few anchor positions in local space (wheel axle, doors...).
 */
export function buildMillHouse(parts) {
  const { W, L, EAVE, RIDGE, BASE } = HOUSE;
  const hw = W / 2, hl = L / 2;
  const stone = parts.get('stone');
  stone.tint(1, 1, 1, 1);
  const T = 2; // metres per texture repeat

  // ---- the four walls
  const east = plane(V(hw, 0, hl), V(1, 0, 0)), west = plane(V(-hw, 0, -hl), V(-1, 0, 0));
  const south = plane(V(-hw, 0, hl), V(0, 0, 1)), north = plane(V(hw, 0, -hl), V(0, 0, -1));
  const win = (c, w, v0, v1, extra = {}) => ({ u0: c - w / 2, u1: c + w / 2, v0, v1, ...extra });
  const G0 = [0.92, 2.2], F1 = [3.5, 4.82];
  const eastO = [
    win(hl - 0.9, 1.3, 0.04, 2.25, { door: 'glass', rows: 3 }), win(hl + 1.7, 0.95, ...G0), win(hl + 5.4, 0.95, ...G0, { curtain: true }),
    win(hl - 4.6, 0.95, ...F1), win(hl - 0.3, 0.95, ...F1, { curtain: true }), win(hl + 4.6, 0.95, ...F1),
  ];
  const westO = [
    win(hl - 2.2, 1.0, 0.04, 2.15, { door: 'solid' }), win(hl + 2.6, 0.95, ...G0), win(hl - 5.8, 0.95, ...G0),
    win(hl - 4.2, 0.95, ...F1), win(hl + 0.6, 0.95, ...F1, { curtain: true }), win(hl + 4.8, 0.95, ...F1),
  ];
  const southO = [
    win(hw - 1.2, 1.3, 0.04, 2.25, { door: 'glass', rows: 3 }), win(hw + 1.5, 0.95, ...G0, { curtain: true }),
    win(hw - 1.2, 0.95, ...F1), win(hw + 1.5, 0.95, ...F1),
  ];
  const northO = [win(hw - 1.0, 1.0, 0.04, 2.15, { door: 'solid' }), win(hw, 0.95, 3.7, 4.9)];
  const walls = [[east, L, eastO], [west, L, westO], [south, W, southO], [north, W, northO]];
  for (const [pl, len, ops] of walls) {
    wallWithOpenings(stone, pl, len, BASE, EAVE, ops, T);
    for (const o of ops) opening(parts, pl, o);
  }
  // gables above the eaves, with a small attic window
  for (const [pl, zc] of [[south, hl], [north, -hl]]) {
    const a = pl.at(0, EAVE), bq = pl.at(W, EAVE), top = pl.at(hw, RIDGE);
    stone.tri(a, bq, top, { tile: T, u0: 0, v0: EAVE, normal: pl.n });
    opening(parts, pl, win(hw, 0.6, 6.25, 7.05, { rows: 1 }), 0.02);
    void zc;
  }
  // corner stones
  quoins(parts, V(hw, 0, hl), east.n, south.n, BASE + 1.6, EAVE);
  quoins(parts, V(-hw, 0, hl), west.n, south.n, BASE + 1.6, EAVE);
  quoins(parts, V(hw, 0, -hl), east.n, north.n, BASE + 1.6, EAVE);
  quoins(parts, V(-hw, 0, -hl), west.n, north.n, BASE + 1.6, EAVE);

  // ---- roof, chimneys
  roof(parts, { hw, hl, eave: EAVE, ridge: RIDGE });
  chimney(parts, 0, hl - 0.34, RIDGE - 0.9, RIDGE + 1.45);
  chimney(parts, 0, -hl + 0.34, RIDGE - 0.9, RIDGE + 1.45);

  // ---- dormer on the garden side (stone front rising from the wall head)
  {
    const zc = -1.5, dw = 0.82, dh = 1.45, peak = 0.7;
    const front = plane(V(hw, 0, zc + dw), V(1, 0, 0));
    const ops = [win(dw, 0.86, EAVE + 0.3, EAVE + 1.28, { rows: 2 })];
    wallWithOpenings(stone, front, dw * 2, EAVE, EAVE + dh, ops, T);
    opening(parts, front, ops[0], 0.18);
    stone.tri(front.at(0, EAVE + dh), front.at(dw * 2, EAVE + dh), front.at(dw, EAVE + dh + peak), { tile: T, normal: front.n });
    const tan = Math.tan(HOUSE.PITCH);
    const xEave = (RIDGE - (EAVE + dh)) / tan, xRidge = (RIDGE - (EAVE + dh + peak)) / tan;
    const slate = parts.get('slate');
    slate.tint(0.96, 0.96, 0.98, 1);
    const fx = hw + 0.12;
    // two little roof planes running back into the main roof
    slate.quad(V(fx, EAVE + dh - 0.02, zc + dw + 0.14), V(xEave, EAVE + dh, zc + dw + 0.14), V(xRidge, EAVE + dh + peak + 0.02, zc), V(fx, EAVE + dh + peak + 0.02, zc), { tile: 2 });
    slate.quad(V(xEave, EAVE + dh, zc - dw - 0.14), V(fx, EAVE + dh - 0.02, zc - dw - 0.14), V(fx, EAVE + dh + peak + 0.02, zc), V(xRidge, EAVE + dh + peak + 0.02, zc), { tile: 2 });
    // cheeks
    stone.tint(0.9, 0.9, 0.9, 0.9);
    stone.tri(V(hw, EAVE, zc + dw), V(hw, EAVE + dh, zc + dw), V(xEave, EAVE + dh, zc + dw), { tile: T, normal: V(0, 0, 1) });
    stone.tri(V(hw, EAVE + dh, zc - dw), V(hw, EAVE, zc - dw), V(xEave, EAVE + dh, zc - dw), { tile: T, normal: V(0, 0, -1) });
    stone.tint(1, 1, 1, 1);
  }

  // ---- lean-to carport against the north gable
  {
    const slate = parts.get('slate'), wood = parts.get('woodDark');
    const z0 = -hl, z1 = -hl - 5.6, yWall = 3.75, yOut = 2.45;
    const x0 = -hw + 0.3, x1 = hw + 0.5;
    slate.tint(0.92, 0.92, 0.94, 1);
    slate.quad(V(x1 + 0.2, yWall + 0.1, z0), V(x0 - 0.2, yWall + 0.1, z0), V(x0 - 0.2, yOut + 0.1, z1 - 0.3), V(x1 + 0.2, yOut + 0.1, z1 - 0.3), { tile: 2 });
    wood.tint(0.78, 0.74, 0.7, 0.8);
    // underside so it reads as a real roof from below
    wood.quad(V(x0 - 0.2, yWall + 0.02, z0), V(x1 + 0.2, yWall + 0.02, z0), V(x1 + 0.2, yOut + 0.02, z1 - 0.3), V(x0 - 0.2, yOut + 0.02, z1 - 0.3), { tile: 1.2 });
    wood.tint(0.95, 0.92, 0.88, 1);
    const posts = [x0, (x0 + x1) / 2, x1];
    for (const px of posts) {
      wood.box(px - 0.1, BASE, z1 - 0.1, px + 0.1, yOut, z1 + 0.1, { tile: 0.8 });
      // knee braces
      wood.beam(V(px, yOut - 0.7, z1), V(px, yOut - 0.02, z1 + 0.75), 0.09, 0.09, { tile: 0.8 });
    }
    wood.box(x0 - 0.2, yOut - 0.02, z1 - 0.11, x1 + 0.2, yOut + 0.16, z1 + 0.11, { tile: 0.8 }); // front beam
    for (let i = 0; i < 7; i++) {
      const px = lerp(x0, x1, i / 6);
      wood.beam(V(px, yWall + 0.02, z0), V(px, yOut + 0.03, z1 - 0.25), 0.07, 0.14, { tile: 0.8 });
    }
  }

  // ---- conservatory on the garden side
  {
    const paint = parts.get('woodPaint'), glass = parts.get('glass'), g = parts.get('granite');
    const x0 = hw, x1 = hw + 3.0, z0 = -2.75, z1 = 2.45, yEave = 2.25, yWall = 3.2, plinth = 0.45;
    g.tint(0.9, 0.88, 0.84, 1);
    g.box(x0, BASE, z0, x1, plinth, z0 + 0.22, { tile: 1 });
    g.box(x0, BASE, z1 - 0.22, x1, plinth, z1, { tile: 1 });
    g.box(x1 - 0.22, BASE, z0, x1, plinth, z1, { tile: 1 });
    parts.get('paving').tint(0.9, 0.9, 0.9, 0.9).box(x0, -0.2, z0 + 0.22, x1 - 0.22, 0.02, z1 - 0.22, { faces: 'Y', tile: 2 });
    paint.tint(1, 1, 1, 1);
    const S = 0.07;
    const post = (px, pz, y1) => paint.box(px - S / 2, plinth, pz - S / 2, px + S / 2, y1, pz + S / 2, { tile: 1 });
    const bays = 5;
    // front (x1) wall
    for (let i = 0; i <= bays; i++) {
      const pz = lerp(z0 + S / 2, z1 - S / 2, i / bays);
      post(x1 - S / 2, pz, yEave);
      // rafter from the house wall down to the eave
      paint.beam(V(x0, yWall, pz), V(x1 - S / 2, yEave + 0.02, pz), S, S * 1.2, { tile: 1 });
    }
    paint.box(x1 - S, yEave - S / 2, z0, x1, yEave + S / 2, z1, { tile: 1 });
    paint.box(x1 - S, 1.25, z0, x1, 1.25 + S * 0.7, z1, { tile: 1 });
    paint.box(x0, yWall - S / 2, z0, x0 + S, yWall + S / 2, z1, { tile: 1 });
    // side walls
    for (const pz of [z0 + S / 2, z1 - S / 2]) {
      for (let i = 1; i <= 2; i++) { const px = lerp(x0, x1 - S / 2, i / 3); post(px, pz, lerp(yWall, yEave, i / 3)); }
      post(x0 + S / 2, pz, yWall);
      paint.beam(V(x0, yWall, pz), V(x1, yEave, pz), S, S, { tile: 1 });
      paint.box(x0, 1.25, pz - S / 2, x1, 1.25 + S * 0.7, pz + S / 2, { tile: 1 });
    }
    glass.tint(1, 1, 1, 1);
    glass.quad(V(x1 - S / 2, plinth, z1), V(x1 - S / 2, plinth, z0), V(x1 - S / 2, yEave, z0), V(x1 - S / 2, yEave, z1));
    glass.quad(V(x1 - S / 2, yEave, z1), V(x1 - S / 2, yEave, z0), V(x0, yWall, z0), V(x0, yWall, z1));
    glass.quad(V(x0, plinth, z1 - S / 2), V(x1, plinth, z1 - S / 2), V(x1, yEave, z1 - S / 2), V(x0, yWall, z1 - S / 2));
    glass.quad(V(x1, plinth, z0 + S / 2), V(x0, plinth, z0 + S / 2), V(x0, yWall, z0 + S / 2), V(x1, yEave, z0 + S / 2));
  }

  // ---- thresholds and a strip of paving along the pond-side gable (terrace)
  parts.get('granite').tint(0.84, 0.83, 0.8, 1).box(-hw + 0.4, -0.25, hl, -hw + 2.1, 0.02, hl + 0.5, { tile: 1 });

  return {
    wheel: V(hw + 0.85, -1.0, 5.4), // axle position
    bounds: { hw, hl, eave: EAVE, ridge: RIDGE },
  };
}

/** Simple stone outbuilding volume: walls, gable roof, a few openings. Ridge along local Z. */
export function buildOutbuilding(parts, { W, L, eave, ridge, base = -2, doors = [], windows = [], chimneyAt = null, copings = false }) {
  const hw = W / 2, hl = L / 2;
  const stone = parts.get('stone');
  stone.tint(0.96, 0.95, 0.94, 1);
  const T = 2;
  const pls = {
    e: [plane(V(hw, 0, hl), V(1, 0, 0)), L], w: [plane(V(-hw, 0, -hl), V(-1, 0, 0)), L],
    s: [plane(V(-hw, 0, hl), V(0, 0, 1)), W], n: [plane(V(hw, 0, -hl), V(0, 0, -1)), W],
  };
  const ops = { e: [], w: [], s: [], n: [] };
  for (const d of doors) ops[d.side].push({ u0: d.at - d.w / 2, u1: d.at + d.w / 2, v0: 0.04, v1: d.h ?? 2.0, door: 'solid' });
  for (const w of windows) ops[w.side].push({ u0: w.at - (w.w ?? 0.7) / 2, u1: w.at + (w.w ?? 0.7) / 2, v0: w.sill ?? 1.0, v1: (w.sill ?? 1.0) + (w.h ?? 0.8), rows: 2 });
  for (const k of Object.keys(pls)) {
    const [pl, len] = pls[k];
    wallWithOpenings(stone, pl, len, base, eave, ops[k], T);
    for (const o of ops[k]) opening(parts, pl, o, 0.2);
  }
  for (const k of ['s', 'n']) {
    const [pl] = pls[k];
    stone.tri(pl.at(0, eave), pl.at(W, eave), pl.at(hw, ridge), { tile: T, v0: eave, normal: pl.n });
  }
  roof(parts, { hw, hl, eave, ridge, over: 0.22, copings, zOver: copings ? 0 : 0.18 });
  if (chimneyAt !== null) chimney(parts, 0, chimneyAt, ridge - 0.7, ridge + 1.0, 0.8, 0.55);
}
