// Reusable built structures: walls, lined channels, bridges, stairs, railings, road ribbons.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Left normals (in XZ) of a polyline, mitred at the joints. pts: [[x, z], ...] */
function normals2(pts) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    out.push([dz, -dx, dx, dz]); // left normal (x,z), tangent (x,z)
  }
  return out;
}

/**
 * Wall following a polyline. Each point: [x, z, yTop]. The base goes `depth` below the lower of
 * the ground heights on both sides, so the wall is always planted in the terrain.
 */
export function wall(b, pts, { thickness = 0.5, groundAt, depth = 0.5, tile = 2, capColor = null, cap = null, base = null } = {}) {
  const nr = normals2(pts);
  let u = 0;
  const half = thickness / 2;
  const secs = pts.map((p, i) => {
    if (i > 0) u += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const [nx, nz] = nr[i];
    const lx = p[0] + nx * half, lz = p[1] + nz * half, rx = p[0] - nx * half, rz = p[1] - nz * half;
    const gl = base !== null ? base : groundAt(p[0] + nx * (half + 0.3), p[1] + nz * (half + 0.3)) - depth;
    const gr = base !== null ? base : groundAt(p[0] - nx * (half + 0.3), p[1] - nz * (half + 0.3)) - depth;
    return { u, top: p[2], l: [lx, lz], r: [rx, rz], gl: Math.min(gl, p[2] - 0.1), gr: Math.min(gr, p[2] - 0.1), n: [nx, nz] };
  });
  const dark = [b.color[0] * 0.8, b.color[1] * 0.8, b.color[2] * 0.8, 0.7];
  for (let i = 0; i + 1 < secs.length; i++) {
    const s0 = secs[i], s1 = secs[i + 1];
    const len = s1.u - s0.u;
    // left face
    b.quad(V(s1.l[0], s1.gl, s1.l[1]), V(s0.l[0], s0.gl, s0.l[1]), V(s0.l[0], s0.top, s0.l[1]), V(s1.l[0], s1.top, s1.l[1]),
      { tile, u0: -s1.u, v0: s0.gl, uLen: len, vLen: s0.top - s0.gl, colors: [dark, dark, b.color, b.color] });
    // right face
    b.quad(V(s0.r[0], s0.gr, s0.r[1]), V(s1.r[0], s1.gr, s1.r[1]), V(s1.r[0], s1.top, s1.r[1]), V(s0.r[0], s0.top, s0.r[1]),
      { tile, u0: s0.u, v0: s0.gr, uLen: len, vLen: s0.top - s0.gr, colors: [dark, dark, b.color, b.color] });
    // top
    const c = capColor || b.color;
    (cap || b).quad(V(s0.l[0], s0.top, s0.l[1]), V(s0.r[0], s0.top, s0.r[1]), V(s1.r[0], s1.top, s1.r[1]), V(s1.l[0], s1.top, s1.l[1]), { tile, u0: 0, v0: s0.u, color: c });
  }
  // end caps
  for (const [s, flip] of [[secs[0], false], [secs[secs.length - 1], true]]) {
    const a = V(s.l[0], Math.min(s.gl, s.gr), s.l[1]), c = V(s.r[0], Math.min(s.gl, s.gr), s.r[1]);
    const at = V(s.l[0], s.top, s.l[1]), ct = V(s.r[0], s.top, s.r[1]);
    if (flip) b.quad(a, c, ct, at, { tile }); else b.quad(c, a, at, ct, { tile });
  }
}

/**
 * Stone lining of a channel. samples: [[x, z, waterY, width], ...].
 * Builds both side walls (inner face down to the bed, a coping on top).
 */
export function channelLining(b, samples, { groundAt, lip = 0.3, coping = 0.38, bed = 0.55, tile = 2, extra = 0.07, cap = null } = {}) {
  const pts = samples.map((s) => [s[0], s[1]]);
  const nr = normals2(pts);
  for (const side of [1, -1]) {
    let u = 0, prev = null;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      if (i > 0) u += Math.hypot(s[0] - samples[i - 1][0], s[1] - samples[i - 1][1]);
      const [nx, nz] = nr[i];
      const half = s[3] / 2 + extra;
      const ix = s[0] + nx * half * side, iz = s[1] + nz * half * side;
      const ox = s[0] + nx * (half + coping) * side, oz = s[1] + nz * (half + coping) * side;
      const ground = groundAt(s[0] + nx * (half + coping + 0.4) * side, s[1] + nz * (half + coping + 0.4) * side);
      // lip 'ground': a retaining wall, as tall as the ground it holds back
      const top = lip === 'ground' ? Math.max(s[2] + 0.3, Math.min(ground + 0.05, s[2] + 3.4)) : s[2] + lip, bot = s[2] - bed;
      const g = Math.min(top - 0.05, ground - 0.4);
      const cur = { u, i: V(ix, top, iz), ib: V(ix, bot, iz), o: V(ox, top, oz), ob: V(ox, g, oz), top, bot, g };
      if (prev) {
        const len = cur.u - prev.u;
        const dark = [b.color[0] * 0.62, b.color[1] * 0.64, b.color[2] * 0.62, 0.6];
        const q = (p0, p1, p2, p3, o) => (side > 0 ? b.quad(p0, p1, p2, p3, o) : b.quad(p1, p0, p3, p2, o));
        // inner face (seen from the water)
        q(prev.ib, cur.ib, cur.i, prev.i, { tile, u0: prev.u, v0: prev.bot, uLen: len, vLen: prev.top - prev.bot, colors: side > 0 ? [dark, dark, b.color, b.color] : [dark, dark, b.color, b.color] });
        // coping
        const cb = cap || b;
        if (side > 0) cb.quad(prev.i, cur.i, cur.o, prev.o, { tile, u0: prev.u, v0: 0 }); else cb.quad(cur.i, prev.i, prev.o, cur.o, { tile, u0: prev.u, v0: 0 });
        // outer face (usually buried, visible where the ground falls away)
        q(cur.ob, prev.ob, prev.o, cur.o, { tile, u0: -cur.u, v0: prev.g, uLen: len, vLen: prev.top - prev.g });
      }
      prev = cur;
    }
  }
}

/** Flight of steps from a (bottom) to b (top). a, b: Vector3 at the centre of the first/last tread. */
export function stairs(b, a, c, width, { steps = null, tile = 1, sideWalls = true } = {}) {
  const rise = c.y - a.y;
  const n = steps || Math.max(2, Math.round(rise / 0.17));
  const dir = V(c.x - a.x, 0, c.z - a.z);
  const run = dir.length();
  dir.normalize();
  const side = V(-dir.z, 0, dir.x).multiplyScalar(width / 2);
  const h = rise / n, t = run / n;
  for (let i = 0; i < n; i++) {
    const p0 = V(a.x, a.y, a.z).addScaledVector(dir, t * i), p1 = p0.clone().addScaledVector(dir, t);
    const y0 = a.y + h * i, y1 = y0 + h;
    const k = 0.9 + 0.14 * (((i * 7) % 5) / 4);
    const col = [b.color[0] * k, b.color[1] * k, b.color[2] * k, 1];
    // riser then tread
    b.quad(p0.clone().sub(side).setY(y0), p0.clone().add(side).setY(y0), p0.clone().add(side).setY(y1), p0.clone().sub(side).setY(y1), { tile, color: [col[0] * 0.85, col[1] * 0.85, col[2] * 0.85, 0.8] });
    b.quad(p0.clone().sub(side).setY(y1), p0.clone().add(side).setY(y1), p1.clone().add(side).setY(y1), p1.clone().sub(side).setY(y1), { tile, color: col });
    if (sideWalls) {
      const low = a.y - 0.6;
      b.quad(p1.clone().add(side).setY(low), p0.clone().add(side).setY(low), p0.clone().add(side).setY(y1), p1.clone().add(side).setY(y1), { tile });
      b.quad(p0.clone().sub(side).setY(low), p1.clone().sub(side).setY(low), p1.clone().sub(side).setY(y1), p0.clone().sub(side).setY(y1), { tile });
    }
  }
  // walkable: a ramp from a to c (it always counts, so that it cannot be walked through from the side)
  return { type: 'deck', a: V(a.x, a.y, a.z), b: V(c.x, c.y, c.z), width, camber: 0, clearance: 4 };
}

/**
 * Timber footbridge between two points, with an optional camber and handrails.
 * Returns a walkable platform description for the collision system.
 */
export function footbridge(parts, a, c, width, { camber = 0.25, rails = true, posts = 5, deckMat = 'woodDeck', frameMat = 'woodDark', tint = [1, 1, 1] } = {}) {
  const deck = parts.get(deckMat), wood = parts.get(frameMat);
  deck.tint(tint[0], tint[1], tint[2], 1); wood.tint(tint[0] * 0.95, tint[1] * 0.93, tint[2] * 0.9, 1);
  const dir = V(c.x - a.x, 0, c.z - a.z);
  const len = dir.length();
  dir.normalize();
  const side = V(-dir.z, 0, dir.x);
  const N = Math.max(4, Math.round(len / 0.8));
  const at = (t) => {
    const p = a.clone().lerp(c, t);
    p.y += Math.sin(Math.PI * t) * camber;
    return p;
  };
  // deck boards
  const boards = Math.round(len / 0.16);
  for (let i = 0; i < boards; i++) {
    const t0 = i / boards, t1 = (i + 0.93) / boards;
    const p0 = at(t0), p1 = at(t1);
    const k = 0.86 + 0.22 * (((i * 11) % 7) / 6);
    const col = [tint[0] * k, tint[1] * k, tint[2] * k, 1];
    const w = side.clone().multiplyScalar(width / 2);
    deck.quad(p0.clone().sub(w), p0.clone().add(w), p1.clone().add(w), p1.clone().sub(w), { tile: 2, u0: i * 0.37, v0: 0, color: col, uLen: width, vLen: 0.16 });
    // board edges (thickness)
    const d = V(0, -0.05, 0);
    deck.quad(p0.clone().add(w).add(d), p1.clone().add(w).add(d), p1.clone().add(w), p0.clone().add(w), { tile: 2, color: [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, 0.8] });
    deck.quad(p1.clone().sub(w).add(d), p0.clone().sub(w).add(d), p0.clone().sub(w), p1.clone().sub(w), { tile: 2, color: [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, 0.8] });
  }
  // beams under the deck
  for (const s of [-1, 0, 1]) {
    for (let i = 0; i < N; i++) {
      const p0 = at(i / N).addScaledVector(side, s * (width / 2 - 0.12)), p1 = at((i + 1) / N).addScaledVector(side, s * (width / 2 - 0.12));
      p0.y -= 0.16; p1.y -= 0.16;
      wood.beam(p0, p1, 0.12, 0.2, { tile: 1 });
    }
  }
  if (rails) {
    const H = 0.95;
    for (const s of [-1, 1]) {
      const off = side.clone().multiplyScalar(s * (width / 2 - 0.05));
      for (let i = 0; i <= posts; i++) {
        const p = at(i / posts).add(off);
        wood.box(p.x - 0.045, p.y - 0.2, p.z - 0.045, p.x + 0.045, p.y + H, p.z + 0.045, { tile: 1 });
      }
      for (let i = 0; i < N; i++) {
        const p0 = at(i / N).add(off), p1 = at((i + 1) / N).add(off);
        wood.beam(p0.clone().setY(p0.y + H), p1.clone().setY(p1.y + H), 0.1, 0.06, { tile: 1 });
        wood.beam(p0.clone().setY(p0.y + H * 0.5), p1.clone().setY(p1.y + H * 0.5), 0.05, 0.05, { tile: 1 });
      }
    }
  }
  return { type: 'deck', a: a.clone(), b: c.clone(), width, camber };
}

/** Stone arch bridge spanning between a and c (same height), with parapets. */
export function archBridge(parts, a, c, width, { rise = 1.3, thickness = 0.5, parapet = 0.7, stoneMat = 'drystone', capMat = 'granite', waterY = 0, camber = 0.35 } = {}) {
  const stone = parts.get(stoneMat), cap = parts.get(capMat);
  stone.tint(1, 1, 1, 1); cap.tint(0.9, 0.88, 0.85, 1);
  const dir = V(c.x - a.x, 0, c.z - a.z);
  const len = dir.length();
  dir.normalize();
  const side = V(-dir.z, 0, dir.x);
  const N = 14;
  const yDeck = (t) => a.y + Math.sin(Math.PI * t) * camber;
  const yArch = (t) => {
    // semi-elliptical opening over the middle 70 % of the span
    const k = (t - 0.5) / 0.36;
    return Math.abs(k) >= 1 ? waterY - 0.8 : waterY - 0.3 + Math.sqrt(1 - k * k) * (rise + 0.3);
  };
  const P = (t, s, y) => a.clone().addScaledVector(dir, len * t).addScaledVector(side, s).setY(y);
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const hw = width / 2;
    // road surface
    parts.get('paving').tint(0.86, 0.84, 0.8, 1).quad(P(t0, -hw + 0.3, yDeck(t0)), P(t0, hw - 0.3, yDeck(t0)), P(t1, hw - 0.3, yDeck(t1)), P(t1, -hw + 0.3, yDeck(t1)), { tile: 2, u0: 0, v0: t0 * len });
    for (const s of [1, -1]) {
      const x = s * hw;
      const top0 = yDeck(t0) + parapet, top1 = yDeck(t1) + parapet;
      const b0 = Math.min(yArch(t0), yDeck(t0) - thickness), b1 = Math.min(yArch(t1), yDeck(t1) - thickness);
      const lo0 = Math.max(yArch(t0), waterY - 0.8), lo1 = Math.max(yArch(t1), waterY - 0.8);
      void b0; void b1;
      // spandrel + parapet outer face
      const q = (p0, p1, p2, p3, o) => (s > 0 ? stone.quad(p1, p0, p3, p2, o) : stone.quad(p0, p1, p2, p3, o));
      q(P(t0, x, lo0), P(t1, x, lo1), P(t1, x, top1), P(t0, x, top0), { tile: 2, u0: t0 * len, v0: 0 });
      // parapet inner face and top
      const xi = s * (hw - 0.3);
      q(P(t1, xi, yDeck(t1)), P(t0, xi, yDeck(t0)), P(t0, xi, top0), P(t1, xi, top1), { tile: 2, u0: t0 * len, v0: 0 });
      if (s > 0) cap.quad(P(t0, xi, top0), P(t0, x, top0), P(t1, x, top1), P(t1, xi, top1), { tile: 1 });
      else cap.quad(P(t0, x, top0), P(t0, xi, top0), P(t1, xi, top1), P(t1, x, top1), { tile: 1 });
    }
    // underside of the arch
    stone.tint(0.6, 0.6, 0.6, 0.6);
    stone.quad(P(t1, -hw, Math.max(yArch(t1), waterY - 0.8)), P(t1, hw, Math.max(yArch(t1), waterY - 0.8)), P(t0, hw, Math.max(yArch(t0), waterY - 0.8)), P(t0, -hw, Math.max(yArch(t0), waterY - 0.8)), { tile: 2 });
    stone.tint(1, 1, 1, 1);
  }
  return { type: 'deck', a: a.clone(), b: c.clone(), width: width - 0.6, camber };
}

/** Post-and-rail fence along a polyline of Vector3 (already on the ground). */
export function railFence(b, pts, { height = 1.0, rails = 2, post = 0.09, spacing = 1.8 } = {}) {
  let acc = 0, last = null;
  const postsAt = [];
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) { postsAt.push(pts[0].clone()); last = pts[0]; continue; }
    const seg = pts[i].distanceTo(pts[i - 1]);
    let d = spacing - acc;
    while (d <= seg) { postsAt.push(pts[i - 1].clone().lerp(pts[i], d / seg)); d += spacing; }
    acc = (acc + seg) % spacing;
    last = pts[i];
  }
  if (postsAt[postsAt.length - 1].distanceTo(last) > spacing * 0.4) postsAt.push(last.clone());
  for (let i = 0; i < postsAt.length; i++) {
    const p = postsAt[i];
    b.box(p.x - post / 2, p.y - 0.3, p.z - post / 2, p.x + post / 2, p.y + height, p.z + post / 2, { tile: 0.8 });
    if (i > 0) {
      const q = postsAt[i - 1];
      for (let r = 0; r < rails; r++) {
        const h = height * (0.92 - (r * 0.5) / Math.max(1, rails - 1) * (rails > 1 ? 1 : 0)) - r * 0.02;
        b.beam(V(q.x, q.y + h, q.z), V(p.x, p.y + h, p.z), 0.045, 0.09, { tile: 0.8 });
      }
    }
  }
}

/** Road / path surface draped over the ground. samples: [[x, z, y], ...] */
export function roadRibbon(b, samples, width, { groundAt, lift = 0.035, tile = 3, edgeFade = true, feather = 0, endFade = 0, fadeStart = true, fadeEnd = true, v0 = 0, step = 1.1 } = {}) {
  // a section every metre or so and several vertices across, so that the ribbon hugs the ground
  const dense = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i], n = samples[i + 1];
    dense.push(s);
    if (!n) break;
    const d = Math.hypot(n[0] - s[0], n[1] - s[1]), k = step > 0 ? Math.ceil(d / step) : 1;
    for (let j = 1; j < k; j++) dense.push([s[0] + ((n[0] - s[0]) * j) / k, s[1] + ((n[1] - s[1]) * j) / k]);
  }
  samples = dense;
  const pts = samples.map((s) => [s[0], s[1]]);
  const nr = normals2(pts);
  let v = 0;
  const secs = [];
  const hw = width / 2;
  // with `feather` the outer band fades to nothing
  const f = feather > 0 ? Math.min(0.6, feather / hw) : 0.34;
  const m = (1 - f) * 0.5;
  const cols = [-1, -(1 - f), -m, 0, m, 1 - f, 1];
  const lens = [0];
  for (let i = 1; i < samples.length; i++) lens.push(lens[i - 1] + Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]));
  const total = lens[lens.length - 1];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    v = lens[i];
    const [nx, nz] = nr[i];
    const end = endFade > 0 ? Math.min(1, Math.min(fadeStart ? v : 1e9, fadeEnd ? total - v : 1e9) / endFade) : 1;
    const row = [];
    for (const t of cols) {
      const x = s[0] + nx * hw * t, z = s[1] + nz * hw * t;
      const edge = Math.abs(t) === 1;
      row.push({ p: V(x, groundAt(x, z) + lift, z), u: (t * hw + hw) / tile, edge, alpha: feather > 0 ? (edge ? 0 : end * end * (3 - 2 * end)) : 1 });
    }
    secs.push({ v: (v0 + v) / tile, row });
  }
  for (let i = 0; i + 1 < secs.length; i++) {
    const a = secs[i], c = secs[i + 1];
    for (let k = 0; k + 1 < a.row.length; k++) {
      const col = (r) => {
        const base = edgeFade && r.edge ? [0.9, 0.88, 0.84, 1] : b.color;
        return feather > 0 ? [base[0], base[1], base[2], r.alpha] : base;
      };
      const up = V(0, 1, 0);
      const i0 = b.vert(a.row[k].p, up, a.row[k].u, a.v, col(a.row[k]));
      const i1 = b.vert(a.row[k + 1].p, up, a.row[k + 1].u, a.v, col(a.row[k + 1]));
      const i2 = b.vert(c.row[k + 1].p, up, c.row[k + 1].u, c.v, col(c.row[k + 1]));
      const i3 = b.vert(c.row[k].p, up, c.row[k].u, c.v, col(c.row[k]));
      b.idx.push(i0, i2, i1, i0, i3, i2);
    }
  }
}
