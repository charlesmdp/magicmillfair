// "Out on a Limb": the climb up the Great Oak — the old tree of the clearing, twice as tall — worked out from
// the way the avatar really jumps (see PlayerController and ../course.js) and from the tree itself: its trunk
// and its great limbs are read back from its own mesh, the way goes up between them.
//
// What one climbs on:
//   - bracket fungi, on the trunk: steps;
//   - branches, which one walks along: straight ones, and ones that turn (an L, an S, a hook…), out from the
//     trunk to their tip, then from the tip of the next one back in. Dead ones (no leaf on them) break soon
//     after one has set foot on them, and grow back;
//   - three nets across the tree, with a deck round the trunk: a fall ends in the net below.
// Everything gets harder with the height: narrower branches, longer jumps, more dead wood, less time on it.
//
// Lengths in metres, from the foot of the tree: x east, z south, y up from where its trunk starts (the ground
// is OAK.sink higher). No dependency on the renderer: the tests walk the same course.
import { reach } from '../course.js';

export const OAK = {
  name: 'Out on a Limb', place: 'The Great Oak',
  species: 'elder', variant: 0, // which tree of the forest it is, and which of its two shapes (the same on every device)
  from: { x: -110, z: 138 }, // where the old tree stands
  at: { x: -110, z: 158 }, // where the giant stands: twenty metres towards the mountain
  scale: 2.1, // twice the old tree (which was 1.05 of its model)
  sink: 0.6, // how deep the foot of the trunk is in the ground
  nets: [11.4, 30, 48], top: 66, // above the ground: the three nets, the crow's nest
  net: 10.6, deck: 2.5, // how far a net reaches from the middle; how wide the deck round the trunk is
  start: { yaw: Math.PI, away: 9.5, r: 1.3 }, // the plate one leaves: on the side of the clearing
  gate: { yaw: Math.PI, away: 14 }, // where one arrives from
  back: 6, // seconds before a broken branch has grown back
  seed: 22,
};

const TAU = Math.PI * 2, RADIUS = 0.38, JUMP = 5.4, GRAVITY = 15; // (the avatar's: see PlayerController)
const STAIRS = 6, STEP = 0.55; // the steps up to a deck: how many (the deck is the last), how high each
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------------------------------------------- the tree

/**
 * The skeleton of a tree, read back from its bark (the `wood0` geometry of TreeBuilder: one tube per branch,
 * ring after ring, then its tip), `scale` times as big: [{ level, pts: [{ x, y, z, r }], tip: { x, y, z },
 * first, count (its vertices), parent (index, -1 for the trunk), at (how far along its parent, 0..1) }].
 */
export function readSkeleton(geometry, scale = 1) {
  const P = geometry.getAttribute('position'), UV = geometry.getAttribute('uv'), out = [];
  let i = 0;
  while (i < P.count) {
    const first = i, pts = [], rings = [];
    let sides = 0;
    while (i < P.count && Math.abs(UV.getX(i)) < 1e-6) {
      let j = i + 1;
      while (j < P.count && UV.getX(j) > UV.getX(j - 1)) j++;
      const n = j - i - 1;
      if (n < 3) break;
      let x = 0, y = 0, z = 0, r = 0;
      for (let k = i; k < j - 1; k++) { x += P.getX(k); y += P.getY(k); z += P.getZ(k); }
      x /= n; y /= n; z /= n;
      for (let k = i; k < j - 1; k++) r += Math.hypot(P.getX(k) - x, P.getY(k) - y, P.getZ(k) - z);
      pts.push({ x: x * scale, y: y * scale, z: z * scale, r: (r / n) * scale });
      if (!out.length) { const ring = []; for (let k = i; k < j - 1; k++) ring.push([P.getX(k) * scale, P.getZ(k) * scale]); rings.push(ring); } // (the trunk: its bark, point by point)
      sides = n; i = j;
    }
    if (!pts.length) break;
    const tip = { x: P.getX(i) * scale, y: P.getY(i) * scale, z: P.getZ(i) * scale };
    i++;
    out.push({ pts, tip, sides, first, count: i - first, ...(out.length ? null : { rings }) });
  }
  // which is whose: the trunk first, then each branch after the one it grows on (thinner than it is)
  const kinds = [...new Set(out.map((b) => b.sides))].sort((a, b) => b - a);
  const last = [];
  out.forEach((b, k) => {
    b.level = kinds.indexOf(b.sides);
    b.parent = b.level ? last[b.level - 1] ?? -1 : -1;
    last[b.level] = k;
    b.at = 0;
    if (b.parent >= 0) {
      const q = out[b.parent].pts, p = b.pts[0];
      let best = 1e9;
      for (let s = 0; s + 1 < q.length; s++) for (let t = 0; t <= 1; t += 0.125) {
        const d = Math.hypot(lerp(q[s].x, q[s + 1].x, t) - p.x, lerp(q[s].y, q[s + 1].y, t) - p.y, lerp(q[s].z, q[s + 1].z, t) - p.z);
        if (d < best) { best = d; b.at = (s + t) / (q.length - 1); }
      }
    }
  });
  return out;
}

/**
 * The stem one climbs round: the trunk of the tree as far as it goes, then a leader of our own up to the top.
 * Returns stem(y) → { x, z, r } and what the leader is made of: { from, to (heights), pts: [{ x, y, z, r }] }.
 */
export function stemOf(skeleton, top) {
  const trunk = skeleton[0].pts, cap = trunk[trunk.length - 1];
  const tip = top + 4.5; // (a thin mast above the crow's nest: the flag)
  // the leader: it leaves the trunk a little under its end, wanders a little, thins to a pole
  const lead = (y) => {
    const t = clamp((y - cap.y) / (top - cap.y), 0, 1.2), k = Math.min(1, (y - cap.y + 2) / 6);
    return {
      x: cap.x + (0.55 * Math.sin((y - cap.y) / 8.5) + 0.25 * Math.sin((y - cap.y) / 3.7 + 1)) * k,
      z: cap.z + (0.5 * Math.sin((y - cap.y) / 7.1 + 2) + 0.22 * Math.sin((y - cap.y) / 4.3)) * k + 0.5 * k,
      r: y > top ? lerp(0.8, 0.09, clamp((y - top) / (tip - top), 0, 1) ** 0.6) : lerp(cap.r * 0.97, 0.8, t ** 0.9),
    };
  };
  const stem = (y) => {
    if (y >= cap.y) return lead(y);
    let i = 0;
    while (i + 2 < trunk.length && trunk[i + 1].y < y) i++;
    const a = trunk[i], b = trunk[i + 1], t = clamp((y - a.y) / (b.y - a.y), 0, 1);
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), r: lerp(a.r, b.r, t) };
  };
  const pts = [];
  for (let y = cap.y - 2.5; y < tip + 1e-6; y += y < top ? 1.25 : 0.9) pts.push({ y, ...lead(Math.max(y, cap.y)), ...(y < cap.y ? { r: cap.r * 0.9 } : null) });
  return { stem, leader: { from: cap.y - 2.5, to: tip, pts } };
}

/**
 * How far the bark of the trunk is from its middle at height y, towards `th` (it is fluted at the foot, round
 * higher up): read off its own rings. null above the trunk.
 */
export function trunkRadius(skeleton, th, y) {
  const trunk = skeleton[0], pts = trunk.pts;
  if (!trunk.rings || y > pts[pts.length - 1].y) return null;
  let i = 0;
  while (i + 2 < pts.length && pts[i + 1].y < y) i++;
  const at = (k) => {
    const ring = trunk.rings[k], c = pts[k], n = ring.length;
    // (the two points of the ring on either side of that direction)
    for (let q = 0; q < n; q++) {
      const a = ring[q], b = ring[(q + 1) % n];
      const a0 = Math.atan2(a[0] - c.x, a[1] - c.z), a1 = Math.atan2(b[0] - c.x, b[1] - c.z);
      const d0 = ((th - a0 + Math.PI * 3) % TAU) - Math.PI, span = ((a1 - a0 + Math.PI * 3) % TAU) - Math.PI;
      if (span !== 0 && d0 / span >= 0 && d0 / span <= 1) return lerp(Math.hypot(a[0] - c.x, a[1] - c.z), Math.hypot(b[0] - c.x, b[1] - c.z), d0 / span);
    }
    return c.r;
  };
  return lerp(at(i), at(i + 1), clamp((y - pts[i].y) / (pts[i + 1].y - pts[i].y), 0, 1));
}

/** What of the tree is in the way: its limbs (not the trunk), as capsules. `thin`: the thinnest that still counts. */
function obstacles(skeleton, thin, within) {
  const out = [];
  skeleton.forEach((b, index) => {
    if (!b.level) return;
    for (let i = 0; i + 1 < b.pts.length; i++) {
      const a = b.pts[i], c = b.pts[i + 1];
      if (Math.max(a.r, c.r) < thin || Math.min(Math.hypot(a.x, a.z), Math.hypot(c.x, c.z)) > within) continue;
      out.push({ a, b: c, level: b.level, index, y0: Math.min(a.y - a.r, c.y - c.r), y1: Math.max(a.y + a.r, c.y + c.r) });
    }
    // (its pointed end)
    const e = b.pts[b.pts.length - 1];
    if (e.r >= thin && Math.hypot(e.x, e.z) <= within) out.push({ a: e, b: { ...b.tip, r: 0.02 }, level: b.level, index, y0: Math.min(e.y, b.tip.y) - e.r, y1: Math.max(e.y, b.tip.y) + e.r });
  });
  return out;
}

/** How far (x, y, z) is from the bark of a capsule (negative: inside it). */
function clearOf(o, x, y, z) {
  const a = o.a, b = o.b, dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const t = clamp(((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / (dx * dx + dy * dy + dz * dz || 1), 0, 1);
  return Math.hypot(x - a.x - dx * t, y - a.y - dy * t, z - a.z - dz * t) - lerp(a.r, b.r, t);
}

// ------------------------------------------------------------------------------------------------- the shapes

// A branch seen from above, drawn like a turtle would: [{ len } | { arc (radians, + to the left), r }].
const SHAPES = {
  I: (L) => [{ len: L }],
  L: (L, rnd, side) => { const a = lerp(0.42, 0.6, rnd()); return [{ len: L * a }, { arc: side * lerp(1.25, 1.65, rnd()), r: lerp(0.9, 1.3, rnd()) }, { len: L * (1 - a) }]; },
  S: (L, rnd, side) => { const A = lerp(0.9, 1.35, rnd()), r = lerp(0.9, 1.4, rnd()); return [{ len: L * 0.3 }, { arc: side * A, r }, { len: L * 0.26 }, { arc: -side * A, r }, { len: L * 0.3 }]; },
  C: (L, rnd, side) => [{ len: 0.9 }, { arc: side * lerp(1.1, 1.9, rnd()), r: lerp(2.4, 3.8, rnd()) }, { len: 0.7 }],
  Z: (L, rnd, side) => { const A = lerp(1.35, 1.7, rnd()); return [{ len: L * 0.34 }, { arc: side * A, r: 0.7 }, { len: L * 0.3 }, { arc: -side * A, r: 0.7 }, { len: L * 0.3 }]; },
  U: (L, rnd, side) => [{ len: L * 0.4 }, { arc: side * lerp(2.5, 3.0, rnd()), r: lerp(1.25, 1.6, rnd()) }, { len: L * 0.34 }],
};

/** The line of a shape, from (0, 0) heading along +x: [{ x, z, d (how far along), h (its heading) }], a point every 0.35 m or so. */
function trace(segments, more = 0) {
  const pts = [{ x: 0, z: 0, d: 0, h: 0 }];
  let x = 0, z = 0, h = 0, d = 0;
  segments.forEach((sg, k) => {
    if (sg.len !== undefined) {
      const len = Math.max(0.3, sg.len + (k === segments.length - 1 ? more : 0)), n = Math.max(1, Math.round(len / 0.35));
      for (let i = 1; i <= n; i++) { x += (Math.cos(h) * len) / n; z += (Math.sin(h) * len) / n; d += len / n; pts.push({ x, z, d, h }); }
    } else {
      const len = Math.abs(sg.arc) * sg.r, n = Math.max(2, Math.round(len / 0.3));
      for (let i = 1; i <= n; i++) {
        const dh = sg.arc / n;
        x += Math.cos(h + dh / 2) * (len / n); z += Math.sin(h + dh / 2) * (len / n); h += dh; d += len / n;
        pts.push({ x, z, d, h });
      }
    }
  });
  return pts;
}

// ------------------------------------------------------------------------------------------------- the course

/** How wide (half) the top of a branch is, how hard a jump is — `s` up the tree (0..1). */
export const widthAt = (s) => lerp(0.62, 0.37, s ** 0.9);
export const ratioAt = (s) => lerp(0.34, 0.78, s ** 1.1);

/**
 * The way up. `skeleton`: see readSkeleton (of the tree at OAK.scale); `ground(x, z)`: how high the ground is
 * round the tree (OAK.sink where it is flat).
 *
 * Returns {
 *   holds: what one stands on, in the order one meets it — each { i, kind, s (how far up, 0..1), y, ratio }:
 *     'fungus' { x, y, z, r, on: { x, z } (the middle of the stem there), stair? (walked up, not jumped) }
 *     'branch' { pts: [{ x, y, z, d }] (the top of the branch, the way one walks it), hw, len, shape,
 *                root: 'start' | 'end' (which end is in the stem), fragile (seconds, 0: sound), lift }
 *     'deck'   { x, z (the middle of the stem), y, r0, r1, gap: [from, to] (the angles of the way up through it), level (1..3, 4: the crow's nest) }
 *   jumps: [{ from, to (indices of holds), a: { x, y, z }, b: { x, y, z } (where one leaves, where one lands), gap, rise, ratio }],
 *   nets: [{ y, r0, r1, x, z, sag }], top: { x, y, z, r }, start: { x, y, z, r }, stem, leader, height, ground,
 *   limbs: the capsules of the tree that are in the way (see obstacles), seed }
 */
export function oakCourse({ skeleton, ground = () => OAK.sink, seed = OAK.seed, tries = 60, log = null } = {}) {
  let last = null;
  for (let k = 0; k < tries; k++) {
    try { return build(skeleton, ground, seed + k * 101); } catch (err) { if (!err.oak) throw err; last = err; log?.push(err.message); }
  }
  throw last;
}

function build(skeleton, ground, seed) {
  const rnd = mulberry32(seed);
  const G = ground(0, 0), TOP = G + OAK.top, levels = [G, ...OAK.nets.map((h) => G + h), TOP];
  const { stem, leader } = stemOf(skeleton, TOP);
  const thick = obstacles(skeleton, 0.28, OAK.net + 3);
  const holds = [], jumps = [];
  const fail = (why) => Object.assign(new Error(`The Great Oak: ${why}`), { oak: true });
  const progress = (y) => clamp((y - G) / (TOP - G), 0, 1);
  const P = (th, rho, y) => { const c = stem(y); return { x: c.x + Math.sin(th) * rho, z: c.z + Math.cos(th) * rho, y }; };
  const angleOf = (p) => { const c = stem(p.y); return Math.atan2(p.x - c.x, p.z - c.z); };
  const rhoOf = (p) => { const c = stem(p.y); return Math.hypot(p.x - c.x, p.z - c.z); };

  // is there room for a body there: the wood of the tree out of the way, the stem too (unless `inStem`)
  const room = (x, y, z, rad, tall = 0) => {
    for (const o of thick) {
      if (y + tall + rad < o.y0 || y - rad > o.y1) continue;
      for (let h = 0; h <= tall + 1e-6; h += 0.6) if (clearOf(o, x, y + h, z) < rad) return false;
    }
    return true;
  };
  // (someone standing on (x, y, z): the wood under the feet, the body above)
  const stands = (p, hw) => room(p.x, p.y - 0.35, p.z, hw + 0.3) && room(p.x, p.y + 0.45, p.z, 0.55, 1.6);
  // would it be on top of, or just under, what is already there (other than `but`)?
  let floor = -1; // the deck one last came up through: what is under it is not in the way of what is over it
  const crowds = (pts, hw, but = []) => {
    for (const h of holds) {
      if (but.includes(h.i) || h.i < floor) continue;
      const list = h.kind === 'branch' ? h.pts : h.kind === 'fungus' ? [h] : null;
      if (!list) continue;
      const w = (h.kind === 'branch' ? h.hw : h.r) + hw + (h.stair ? 0.4 : 0.9);
      for (const q of list) for (const p of pts) if (Math.abs(p.y - q.y) < 2.9 && (p.x - q.x) ** 2 + (p.z - q.z) ** 2 < w * w) return true;
    }
    return false;
  };
  // how high one is, a fraction `u` of the way through a jump that lands `rise` higher than it left
  const arc = (rise, u) => { const T = (JUMP + Math.sqrt(Math.max(0, JUMP * JUMP - 2 * GRAVITY * Math.max(rise, -3)))) / GRAVITY; return JUMP * T * u - 0.5 * GRAVITY * (T * u) ** 2; };
  // is something solid (a branch, a fungus) in the way of a body with its feet at (x, y, z)? As the game has it
  // (Collision.blocked), with room to spare: one does not walk or jump into the side of what is above one's knees.
  const under = (h, x, y, z) => {
    if (h.kind !== 'branch' && h.kind !== 'fungus') return false;
    for (const [ox, oz] of [[0, 0], [0.42, 0], [-0.42, 0], [0, 0.42], [0, -0.42]]) {
      const top = holdHeight(h, x + ox, z + oz);
      if (top !== null && y + 0.2 < top - 0.45 && y + 1.65 > top - (h.kind === 'branch' ? 0.5 : 0.3)) return true;
    }
    return false;
  };
  const bars = (h, a, b) => {
    const rise = b.y - a.y;
    for (let u = 0; u <= 1.0001; u += 0.1) if (under(h, lerp(a.x, b.x, u), a.y + arc(rise, u), lerp(a.z, b.z, u))) return true;
    return false;
  };
  // the flight from a to b: nothing of the tree in it, nor of what is already built on it
  const flight = (a, b, but = -1) => {
    const rise = b.y - a.y;
    for (let u = 0.1; u < 0.95; u += 0.12) {
      const x = lerp(a.x, b.x, u), z = lerp(a.z, b.z, u), y = a.y + arc(rise, u);
      if (!room(x, y + 0.2, z, 0.6, 1.5)) return false;
      const c = stem(y);
      if (Math.hypot(x - c.x, z - c.z) < c.r + RADIUS + 0.12) return false;
    }
    for (let k = Math.max(0, floor, holds.length - 9); k < holds.length; k++) if (k !== but && bars(holds[k], a, b)) return false;
    return true;
  };
  // would a new hold be in the way of the last jumps, or over the heads of those who stand on the last holds —
  // or they over the heads of those who stand on it?
  const spots = (h) => (h.kind === 'branch' ? h.pts : h.kind === 'fungus' ? [h.at] : []);
  const hinders = (h) => {
    for (let k = Math.max(0, jumps.length - 5); k < jumps.length; k++) if (bars(h, jumps[k].a, jumps[k].b)) return true;
    for (let k = Math.max(0, floor, holds.length - 9); k < holds.length; k++) {
      const o = holds[k];
      for (const q of spots(o)) if (under(h, q.x, q.y, q.z)) return true;
      for (const q of spots(h)) if (under(o, q.x, q.y, q.z)) return true;
    }
    return false;
  };

  // how far out the bark is, seen from the middle of the stem at height y towards `th`: the stem itself, or a
  // limb that runs up along it — where someone can stand against it. null: no standing there at all.
  const bark = (th, y) => {
    const c = stem(y), from = trunkRadius(skeleton, th, y) ?? c.r;
    for (let rho = from; rho < Math.max(from, c.r) + 3.2; rho += 0.15) {
      const x = c.x + Math.sin(th) * (rho + RADIUS + 0.1), z = c.z + Math.cos(th) * (rho + RADIUS + 0.1);
      if (room(x, y + 0.45, z, 0.5, 1.6)) return rho;
    }
    return null;
  };

  const add = (h) => { h.i = holds.length; h.s = progress(h.y); holds.push(h); return h; };
  const jump = (from, to, a, b, ratio, runup) => {
    const rise = b.y - a.y, gap = Math.hypot(b.x - a.x, b.z - a.z);
    jumps.push({ from: from.i, to: to.i, a, b, gap, rise, ratio, runup });
  };
  // how far apart two places to stand may be: `ratio` of what a jump can do, the edges one stands on included
  const span = (ratio, runup, rise, e0, e1) => e0 + e1 + ratio * (reach(runup, Math.max(rise, 0)) - 0.12);

  /** A fungus on the bark at angle `th`, its top at height y (null: no bark to stand by there). */
  const fungus = (th, y, r) => {
    const c = stem(y), rho = bark(th, y);
    if (rho === null) return null;
    const q = P(th, rho + 0.12, y);
    // where one stands on it: clear of the bark
    const out = rho + RADIUS + 0.08 + (r - 0.3) * 0.5, at = { x: c.x + Math.sin(th) * out, z: c.z + Math.cos(th) * out, y };
    return { kind: 'fungus', x: q.x, y, z: q.z, r, th, rho, on: { x: c.x, z: c.z }, at, edge: (r - 0.3) * 0.5 };
  };

  /**
   * A branch out of the stem at angle `th`: its root at height y0 (the top of the wood there), rising `lift` to
   * its tip, `dev` off the straight way out. `segments`: its shape (see SHAPES), `more`: added to its last stretch.
   * Returns its line from the root outwards: { pts: [{ x, y, z, d, h (the heading there, as a yaw) }], len }.
   */
  const grow = (th, y0, lift, segments, dev, more = 0, flat = 0) => {
    const local = trace(segments, more), len = local[local.length - 1].d;
    const c0 = stem(y0), h0 = th + dev, fx = Math.sin(h0), fz = Math.cos(h0), rx = Math.cos(h0), rz = -Math.sin(h0);
    const ox = c0.x + Math.sin(th) * (c0.r - 0.25), oz = c0.z + Math.cos(th) * (c0.r - 0.25);
    // (the turtle's x is "forwards": out of the stem; its z is to the side one goes round to)
    // (level for its first `flat` metres — in the bark, and where one lands on it — then rising to its tip)
    return { pts: local.map((q) => ({ x: ox + fx * q.x + rx * q.z, y: y0 + lift * clamp((q.d - flat) / Math.max(0.5, len - flat), 0, 1) ** 1.15, z: oz + fz * q.x + rz * q.z, d: q.d, h: h0 + q.h })), len };
  };
  /** Is a branch (see grow) where it can be: out of the stem and staying out, over the net, clear of the tree? */
  const fits = (br, hw, netY, but) => {
    const n = br.pts.length;
    let out = false;
    for (let i = 0; i < n; i++) {
      const p = br.pts[i], rho = rhoOf(p), c = stem(p.y);
      if (rho > OAK.net - 1.5) return false;
      if (!out) { if (rho > c.r + hw + 0.55 && stands(p, hw)) out = true; else if (p.d > 3.6) return false; continue; }
      if (rho < c.r + hw + 0.5) return false; // (back into the stem)
      if (!stands(p, hw)) return false;
      if (netY !== null && p.y + 2.2 > netY - 0.9 && rho > c.r + OAK.deck - 0.2) return false; // (the net above)
    }
    if (!out) return false;
    // (it does not cross itself: a hook comes back, not through)
    for (let i = 0; i < n; i++) for (let j = i + 9; j < n; j++) if ((br.pts[i].x - br.pts[j].x) ** 2 + (br.pts[i].z - br.pts[j].z) ** 2 < (2 * hw + 0.7) ** 2) return false;
    return !crowds(br.pts.filter((p) => rhoOf(p) > stem(p.y).r + hw + 0.5), hw, but);
  };
  /** The part of a branch one can stand on: from where it is out of the bark. */
  const walkable = (br, hw) => {
    // (after the last place, near its root, where the bark or a limb leaves no room for a body)
    let k = 0;
    for (let i = 0; i < br.pts.length && br.pts[i].d < 4.6; i++) { const p = br.pts[i]; if (!(rhoOf(p) > stem(p.y).r + RADIUS + 0.1 && room(p.x, p.y + 0.45, p.z, 0.45, 1.5))) k = i + 1; }
    return br.pts.slice(Math.min(k, br.pts.length - 1));
  };

  // which shapes, how long, by how far up one is — never the same three times running
  const shapesAt = (s) => (s < 0.14 ? ['I', 'L', 'C'] : s < 0.42 ? ['I', 'L', 'C', 'S'] : s < 0.7 ? ['L', 'S', 'C', 'U', 'Z', 'I'] : ['S', 'Z', 'U', 'L', 'C', 'I']);
  const choices = (s) => {
    // (those the tree has least of first)
    const used = {};
    for (const h of holds) if (h.kind === 'branch') used[h.shape] = (used[h.shape] || 0) + 1;
    return shapesAt(s).map((q) => [q, (used[q] || 0) * 0.5 + rnd() * 3]).sort((a, b) => a[1] - b[1]).map((q) => q[0]);
  };
  // how much a branch leans the way one goes round: those that end the way they began (straight, an S, a Z) most
  const leanOf = (shape) => (shape === 'I' ? lerp(0.5, 1.0, rnd()) : shape === 'S' || shape === 'Z' ? lerp(0.35, 0.95, rnd()) : lerp(-0.1, 0.7, rnd()));
  const lengthOf = (s) => lerp(3.0, lerp(5.6, 4.4, s), rnd());
  /** How long dead wood holds once one is on it: the time to run its length, and less and less to spare. */
  const fuseOf = (len, s) => len / 6.2 + lerp(0.6, 0.25, s);
  const tooSteep = (len, lift) => len < Math.abs(lift) / 0.34;

  // ---- the start: a plate on the ground, on the side one arrives from
  const S = OAK.start;
  const start = { x: Math.sin(S.yaw) * S.away, z: Math.cos(S.yaw) * S.away, r: S.r };
  start.y = ground(start.x, start.z);

  let th = S.yaw - 0.55; // the angle one is at, round the stem (it grows: one goes round to the left, seen from above)
  let y = G; // the height one stands at
  let here = null; // the hold one stands on, and where on it: { hold, at: { x, y, z }, edge, runup }
  let dead = 0, sinceDead = 9;
  const snapshot = () => ({ holds: holds.length, jumps: jumps.length, th, y, here, dead, sinceDead });
  const restore = (m) => { holds.length = m.holds; jumps.length = m.jumps; ({ th, y, here, dead, sinceDead } = m); };

  const missed = {}, miss = (k) => { missed[k] = (missed[k] || 0) + 1; return false; }; // (what was in the way, for whoever tunes this)

  /** How far round the stem a hop of `far` metres takes one, from where one stands, to stand `rho` from its middle. */
  const round = (far, rho, c0) => {
    const most = 2 * rho * Math.sin(Math.acos(Math.min(1, (c0.r + RADIUS + 0.12) / rho))); // (the stem itself is in the way of a longer one)
    return 2 * Math.asin(Math.min(1, Math.min(far, most) / (2 * rho)));
  };

  /** A hop round the stem onto a fungus, `rise` higher. */
  const hop = (rise, ratio, s, dir = 1) => {
    const yy = y + rise, c0 = stem(yy);
    for (let t = 0; t < 16; t++) {
      const r = lerp(0.98, 0.8, s) * lerp(0.92, 1.1, rnd()), e = (r - 0.3) * 0.5;
      const far = span(Math.min(0.8, ratio * 0.9), here.runup, rise, here.edge, e);
      const f = fungus(th + dir * round(far, c0.r + RADIUS + 0.3, c0) * (1.05 - 0.07 * t) * lerp(0.9, 1, rnd()), yy, r);
      if (!f) continue;
      const d = Math.hypot(f.at.x - here.at.x, f.at.z - here.at.z);
      if (d > far || d < here.edge + e + 0.35 || crowds([f], r, [here.hold.i]) || !flight(here.at, f.at) || hinders(f)) continue;
      add(f);
      jump(here.hold, f, here.at, f.at, ratio * 0.9, here.runup);
      th = f.th; y = f.y;
      here = { hold: f, at: f.at, edge: f.edge, runup: 0.8 };
      return true;
    }
    return false;
  };

  /** A branch out of the stem, to walk out along: one hops onto it near the stem (or walks onto it, from a deck). */
  const branchOut = (rise, lift, ratio, s, netY, mayDie, dir = 1) => {
    const deck = here.hold.kind === 'deck' ? here.hold : null, hw = widthAt(s), yRoot = deck ? deck.y - 0.03 : y + rise, c0 = stem(yRoot);
    let best = null;
    for (const shape of choices(s)) {
      for (let t = 0; t < 26 && !best; t++) {
        const far = deck ? 0 : span(Math.min(0.8, ratio * 0.9), here.runup, rise, here.edge, hw * 0.8);
        // (from a deck: anywhere round it but where the way came up)
        const at = deck ? deck.gap[1] + 0.6 + rnd() * (TAU - (deck.gap[1] - deck.gap[0]) - 1.2) : th + dir * round(far, c0.r + RADIUS + 0.45, c0) * lerp(0.55, 1.05, rnd());
        // it leans the way one goes round, so that its end points on to the next one — a straight one leans most
        const segments = SHAPES[shape](lengthOf(s), rnd, dir * (rnd() < 0.75 ? 1 : -1)), dev = dir * leanOf(shape);
        // (drawn level first, to see where it comes out of the bark: it rises from a step beyond that)
        const level = grow(at, yRoot, 0, segments, dev), w0 = walkable(level, hw)[0];
        if (!w0 || w0.d > level.len - 2) { miss('out: fits'); continue; }
        // (a short one cannot rise much: what it does not take, the branch back in will)
        const rises = Math.min(lift, 0.33 * Math.max(0, level.len - w0.d - 0.8));
        const br = grow(at, yRoot, rises, segments, dev, 0, w0.d + 0.8);
        if (!fits(br, hw, netY, [here.hold.i])) { miss('out: fits'); continue; }
        const pts = walkable(br, hw), land = pts[Math.min(pts.length - 1, 2)];
        if (!deck) {
          // (one lands on it near the stem — where it is already a little higher than at its root)
          const d = Math.hypot(land.x - here.at.x, land.z - here.at.z), up = land.y - here.at.y;
          if (up > 0.8) { miss('out: high'); continue; }
          if (d > span(Math.min(0.8, ratio * 0.9), here.runup, up, here.edge, hw * 0.8)) { miss('out: far'); continue; }
          if (d < here.edge + hw + 0.3) { miss('out: near'); continue; }
          if (!flight(here.at, land)) { miss('out: flight'); continue; }
        }
        // (its tip not too far out: the next one has to come back from there)
        const tip = br.pts[br.pts.length - 1];
        // (those that end the way they began point away from the stem: shorter, or the next would start too far out)
        if (rhoOf(tip) - stem(tip.y).r > (shape === 'I' || shape === 'S' || shape === 'Z' ? lerp(3.3, 2.9, s) : lerp(5.6, 4.2, s))) { miss('out: tip'); continue; }
        if (hinders({ kind: 'branch', pts, hw })) { miss('out: over heads'); continue; }
        best = { br, pts, land, shape, lift: rises, fuse: mayDie ? fuseOf(br.len, s) : 0 };
      }
      if (best) break;
    }
    if (!best) return null;
    const O = add({ kind: 'branch', pts: best.pts, hw, len: best.br.len, shape: best.shape, root: 'start', fragile: best.fuse, lift: best.lift, y: best.br.pts[best.br.pts.length - 1].y, line: best.br.pts });
    if (best.fuse) { dead++; sinceDead = 0; }
    if (!deck) jump(here.hold, O, here.at, best.land, ratio * 0.9, here.runup);
    return O;
  };

  /** The jump from the tip of the branch one is on to the tip of the next, which goes back in to the stem. */
  const branchIn = (O, tipRise, lift, ratio, s, netY, mayDie, dir = 1) => {
    const tip = O.pts[O.pts.length - 1], hw = widthAt(progress(tip.y + tipRise)), runup = Math.min(4, O.len - 0.6);
    const knot = hw * lerp(1.55, 1.2, s), want = span(ratio, runup, tipRise, O.hw, knot * 0.8), cone = lerp(0.5, 0.85, s);
    const list = choices(s), thin = stem(tip.y).r < 1.3;
    for (let t = 0; t < 150; t++) {
      const shape = list[Math.floor(t / 25) % list.length];
      if (shape === 'I' && O.shape === 'I' && t < 100) continue; // (two straight ones in a row: a jump round a corner)
      const yTip = tip.y + tipRise, yRoot = yTip + lift, c0 = stem(yRoot);
      // where the jump lands: more or less straight on, off the end of the branch one is on
      const jh = tip.h + (rnd() * 2 - 1) * cone * 0.9, T = { x: tip.x + Math.sin(jh) * want, z: tip.z + Math.cos(jh) * want };
      const rhoT = Math.hypot(T.x - c0.x, T.z - c0.z);
      if (rhoT - c0.r > lerp(6.4, 5.9, s)) { miss('in: far out'); continue; }
      // the branch that ends there, drawn from its root (it droops towards its tip): which root, how long a last stretch
      const segments = SHAPES[shape](lengthOf(s), rnd, dir * (rnd() < 0.75 ? -1 : 1)), dev = -dir * leanOf(shape);
      // (first, about the right size for its tip to be that far from the stem)
      const tipOf = () => { const local = trace(segments); return local[local.length - 1]; };
      let q = tipOf();
      for (let pass = 0; pass < 4; pass++) {
        const out = Math.hypot(c0.r - 0.25 + q.x * Math.cos(dev) - q.z * Math.sin(dev), q.x * Math.sin(dev) + q.z * Math.cos(dev));
        const f = clamp((rhoT - c0.r) / Math.max(0.5, out - c0.r), 0.6, 1.6);
        if (Math.abs(f - 1) < 0.03) break;
        for (const sg of segments) { if (sg.len !== undefined) sg.len *= f; else sg.r = Math.max(0.65, sg.r * f); }
        q = tipOf();
      }
      if (q.d < 2.6) { miss('in: short'); continue; }
      if (q.d > 8.8) { miss('in: long'); continue; }
      const va = c0.r - 0.25 + q.x * Math.cos(dev) - q.z * Math.sin(dev), vb = q.x * Math.sin(dev) + q.z * Math.cos(dev);
      const dx = Math.cos(q.h + dev), dz = Math.sin(q.h + dev), hb = va * dx + vb * dz, disc = hb * hb - (va * va + vb * vb - rhoT * rhoT);
      if (disc < 0) { miss('in: far'); continue; }
      const m0 = -hb - Math.sqrt(disc), m1 = -hb + Math.sqrt(disc), more = Math.abs(m0) < Math.abs(m1) ? m0 : m1;
      if (more < -1.4 || more > 1.8 || segments[segments.length - 1].len + more < 0.6) { miss('in: stretch'); continue; }
      const at = Math.atan2(T.x - c0.x, T.z - c0.z) - Math.atan2(vb + more * dz, va + more * dx);
      const ahead = dir * (((at - angleOf(tip) + Math.PI * 3) % TAU) - Math.PI);
      if (ahead < (thin ? -1.2 : -0.25) || ahead > (thin ? 2.6 : 1.5)) { miss('in: behind'); continue; } // (its root further round than the tip one jumps from, not back)
      const br = grow(at, yRoot, -lift, segments, dev, more), e = br.pts[br.pts.length - 1];
      if (tooSteep(br.len, lift)) { miss('in: steep'); continue; }
      const fuse = mayDie ? fuseOf(br.len, s) : 0;
      const jx = e.x - tip.x, jz = e.z - tip.z, jl = Math.hypot(jx, jz);
      if (Math.abs(jl - want) > 0.08) { miss('in: gap'); continue; }
      // (and on along the new one, not back over one's shoulder)
      if (Math.acos(clamp((jx * -Math.sin(e.h) + jz * -Math.cos(e.h)) / jl, -1, 1)) > lerp(1.95, 1.6, s)) { miss('in: back'); continue; }
      if (!fits(br, hw, netY, [O.i])) { miss('in: fits'); continue; }
      if (!flight(tip, e)) { miss('in: flight'); continue; }
      const pts = walkable(br, hw).reverse().map((p) => ({ ...p, d: br.len - p.d, h: p.h + Math.PI }));
      if (hinders({ kind: 'branch', pts, hw, knot })) { miss('in: over heads'); continue; }
      const I = add({ kind: 'branch', pts, hw, knot, len: br.len, shape, root: 'end', fragile: fuse, lift, y: pts[pts.length - 1].y, line: br.pts.slice().reverse().map((p) => ({ ...p, d: br.len - p.d, h: p.h + Math.PI })) });
      if (fuse) { dead++; sinceDead = 0; }
      jump(O, I, tip, pts[0], ratio, runup);
      const end = pts[pts.length - 1];
      th = angleOf(end); y = end.y;
      here = { hold: I, at: end, edge: hw * 0.8, runup: Math.min(2.5, br.len - 0.8) };
      return I;
    }
    return null;
  };

  /** One turn of the way: a hop or more round the stem, a branch out, the jump from tip to tip, a branch back in. */
  const cycle = (final, yLast, netY, attempt = 0) => {
    const s = progress(y), fromDeck = here.hold.kind === 'deck', left = yLast - y;
    // (mostly round to the left; now and then back the other way — where the limbs of the tree leave no other way)
    const dir = rnd() < (attempt > 1 ? 0.45 : 0.12) ? -1 : 1;
    if (!fromDeck && left > 7.5 && rnd() < (attempt > 2 ? 0.3 : 0.06)) {
      // a ladder: fungi up the bark, from side to side
      const n = 3 + ((rnd() * 3) | 0);
      for (let k = 0; k < n; k++) if (!hop(lerp(0.48, 0.62, rnd()), ratioAt(s), s, k % 2 ? -dir : dir)) return miss('ladder');
      return true;
    }
    // how much higher this turn takes one: all that is left, for the last one before the steps
    const share = final ? left : Math.min(lerp(2.4, 4.3, rnd()), left - 1.9);
    const most = fromDeck ? 0 : clamp(Math.floor((share - 1.4) / 0.54), 1, 3);
    let hops = fromDeck ? 0 : Math.min(most, 1 + (rnd() < 0.55) + (rnd() < 0.2));
    if (share - hops * 0.62 > 3.9) hops = most;
    const rises = Array.from({ length: hops }, () => lerp(0.46, 0.62, rnd()));
    let rest = share - rises.reduce((a, b) => a + b, 0);
    if (!final) rest = Math.min(rest, 3.9);
    // (a metre and more between the root of the branch out and the root of the branch in: no hop from one to the other)
    if (rest < 1.3 || rest > 3.9) return miss('rest');
    const down = !final && s > 0.42 && rnd() < 0.18; // a step down at the tips: harder to judge
    const tipRise = down ? -lerp(0.2, 0.4, rnd()) : clamp(rest * lerp(0.2, 0.32, rnd()), 0.3, 0.82);
    const outLift = (rest - tipRise) * lerp(0.42, 0.58, rnd()), inLift = rest - tipRise - outLift;
    const ratio = ratioAt(s) * lerp(0.93, 1.06, rnd());
    for (let k = 0; k < hops - 1; k++) if (!hop(rises[k], ratio, s, dir)) return miss('hop');
    sinceDead++;
    // dead wood: none at the foot of the tree, then more and more — never two dead branches running before the top
    const dies = () => s > 0.09 && sinceDead > (s > 0.72 ? 0 : 1) && rnd() < lerp(0.2, 0.62, s);
    const O = branchOut(rises[hops - 1] || 0, outLift, ratio, s, netY, !fromDeck && dies(), dir);
    if (!O) return miss(fromDeck ? 'out of the deck' : 'out');
    if (!O.fragile) sinceDead++;
    const back = inLift + (outLift - O.lift); // (what the branch out did not rise)
    if (back > 2.7) return miss('rest');
    return !!branchIn(O, tipRise, back, ratio * (final ? 0.85 : 1), s, netY, !final && dies(), dir) || miss('in');
  };

  /** Up through the deck: steps of fungi round the stem, then the deck itself (the crow's nest, at the top). */
  const finish = (y1, level) => {
    let first = th;
    for (let k = 0; k < STAIRS - 1; k++) {
      if (k === STAIRS - 4) first = th; // (from here up, heads are through the deck: it is open over these steps)
      const yy = y + (y1 - y) / (STAIRS - k), c0 = stem(yy), r = clamp(c0.r * 0.5 + 0.55, 0.78, 1.15), e = (r - 0.3) * 0.5;
      const far = span(0.42, 0.8, yy - y, here.edge, e);
      let f = null;
      for (let t = 0; t < 10 && !f; t++) {
        const q = fungus(th + round(far, c0.r + RADIUS + 0.3, c0) * (1 - t * 0.07), yy, r);
        if (!q || Math.hypot(q.at.x - here.at.x, q.at.z - here.at.z) > far + 0.1 || !flight(here.at, q.at) || hinders(q)) continue;
        f = q;
      }
      if (!f) return miss('steps');
      add(f);
      jump(here.hold, f, here.at, f.at, 0.42, here.runup);
      th = f.th; y = f.y;
      here = { hold: f, at: f.at, edge: f.edge, runup: 0.8 };
    }
    const c1 = stem(y1), r1 = level < 4 ? c1.r + OAK.deck : 2.4;
    let on = null;
    for (const da of [0.5, 0.7, 0.35, 0.9, 0.2]) {
      const rho = bark(th + da, y1);
      if (rho === null || rho > c1.r + 0.9) continue;
      const q = P(th + da, rho + RADIUS + 0.5, y1);
      if (Math.hypot(q.x - here.at.x, q.z - here.at.z) < 2.6 && flight(here.at, q)) { on = q; break; }
    }
    if (!on) return miss('deck');
    const deck = add({ kind: 'deck', x: c1.x, z: c1.z, y: y1, r0: c1.r - 0.1, r1, gap: [first - 0.3, th + 0.22], level });
    jump(here.hold, deck, here.at, on, 0.42, here.runup);
    y = y1; th += 0.5;
    here = { hold: deck, at: on, edge: 0.5, runup: 2 };
    floor = deck.i;
    return true;
  };

  for (let sec = 0; sec < 4; sec++) {
    const y1 = levels[sec + 1], yLast = y1 - STAIRS * STEP, netY = sec < 3 ? y1 : null;
    if (sec === 0) {
      // from the ground: three fungi one walks up, round the foot of the trunk
      for (let k = 0; k < 3; k++) {
        // (the first: a step up from the ground at its edge, where one comes to it)
        if (!k) { const far = (trunkRadius(skeleton, th, G + 0.5) ?? stem(G).r) + 1.25; y = Math.min(ground(Math.sin(th) * far, Math.cos(th) * far), ground(Math.sin(th) * (far - 1), Math.cos(th) * (far - 1))) + 0.42; } else y += 0.5;
        const f = add({ ...fungus(th, y, 1.25), stair: true });
        if (holds.length > 1) jump(holds[f.i - 1], f, holds[f.i - 1].at, f.at, 0, 0.9);
        here = { hold: f, at: f.at, edge: f.edge, runup: 0.9 };
        th += 0.34;
      }
    }
    // (a search: turn after turn, each drawn again a few times when there is no way on — and from the deck again
    // when a turn finds none)
    const section = () => {
      for (;;) {
        const final = yLast - y <= 5.3;
        let ok = false;
        for (let attempt = 0; attempt < 5 && !ok; attempt++) {
          const m = snapshot();
          ok = cycle(final, yLast, netY, attempt);
          if (!ok) restore(m);
        }
        if (!ok) return false;
        if (final) return finish(y1, sec + 1);
      }
    };
    let ok = false;
    const m0 = snapshot();
    for (let again = 0; again < 250 && !ok; again++) { ok = section(); if (!ok) restore(m0); }
    if (!ok) throw fail(`no way from ${levels[sec].toFixed(1)} m to ${y1.toFixed(1)} m ${JSON.stringify(missed)}`);
  }

  const top = holds[holds.length - 1];
  const nets = OAK.nets.map((h, k) => { const c = stem(G + h); return { y: G + h, x: c.x, z: c.z, r0: c.r + OAK.deck - 0.05, r1: OAK.net - (k ? 0 : 0), sag: 0.55, level: k + 1 }; });
  return { holds, jumps, nets, top: { x: top.x, y: top.y, z: top.z, r: top.r1 }, start, stem, leader, height: TOP - G, ground: G, limbs: obstacles(skeleton, 0.5, OAK.net + 2).filter((o) => o.level === 1), seed, dead };
}

// ------------------------------------------------------------------------------------------- standing on it

/** How high the top of a hold is at (x, z), or null when (x, z) is not on it. */
export function holdHeight(h, x, z) {
  if (h.kind === 'fungus') return (x - h.x) ** 2 + (z - h.z) ** 2 <= h.r * h.r ? h.y : null;
  if (h.kind === 'deck') {
    const dx = x - h.x, dz = z - h.z, d2 = dx * dx + dz * dz;
    if (d2 > h.r1 * h.r1 || d2 < h.r0 * h.r0) return null;
    // (the way up through it: open)
    const a = Math.atan2(dx, dz), w = h.gap[1] - h.gap[0], t = (((a - h.gap[0]) % TAU) + TAU) % TAU;
    return t < w && d2 < (h.r0 + 1.75) ** 2 ? null : h.y;
  }
  const box = h.box || (h.box = boxOf(h));
  if (x < box[0] || x > box[1] || z < box[2] || z > box[3]) return null;
  const pts = h.pts, hw2 = h.hw * h.hw;
  // (the knot at its tip: wider, to land on)
  if (h.knot && (x - pts[0].x) ** 2 + (z - pts[0].z) ** 2 <= h.knot * h.knot) return pts[0].y;
  let best = hw2, y = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    const d = (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2;
    if (d <= best) { best = d; y = lerp(a.y, b.y, t); }
  }
  return y;
}
function boxOf(h) {
  const b = [1e9, -1e9, 1e9, -1e9];
  const w = Math.max(h.hw, h.knot || 0);
  for (const p of h.pts) { b[0] = Math.min(b[0], p.x - w); b[1] = Math.max(b[1], p.x + w); b[2] = Math.min(b[2], p.z - w); b[3] = Math.max(b[3], p.z + w); }
  return b;
}

/** How high a net is at (x, z) (it hangs a little between the stem and its rim), or null beyond it. */
export function netHeight(n, x, z) {
  const d = Math.hypot(x - n.x, z - n.z);
  if (d < n.r0 || d > n.r1) return null;
  const t = (d - n.r0) / (n.r1 - n.r0);
  return n.y - n.sag * Math.sin(Math.PI * t) ** 0.8;
}

// ------------------------------------------------------------------------------------------- making room

/**
 * What of the tree itself is in the way of the climb and is taken off it: the small branches and the leaves that
 * hang where one walks, jumps or looks. Returns { cut: Map(branch index → the ring it is cut at; 0: gone),
 * cards: Set(indices of leaf cards) } — `cards`: [[x, y, z]] the middles of the leaf cards of the tree.
 */
export function clearing(course, skeleton, cards = []) {
  const { holds, jumps, stem, leader } = course;
  // where bodies go: the walks, the flights
  const way = [];
  for (const h of holds) {
    if (h.kind === 'branch') for (const p of h.line || h.pts) way.push({ x: p.x, y: p.y, z: p.z, r: h.hw });
    else if (h.kind === 'fungus') way.push({ x: h.at.x, y: h.y, z: h.at.z, r: h.r * 0.7 });
    else for (let a = 0; a < TAU; a += 0.35) way.push({ x: h.x + Math.sin(a) * (h.r0 + h.r1) / 2, y: h.y, z: h.z + Math.cos(a) * (h.r0 + h.r1) / 2, r: (h.r1 - h.r0) / 2 });
  }
  for (const j of jumps) for (let t = 0.2; t < 0.9; t += 0.2) way.push({ x: lerp(j.a.x, j.b.x, t), y: lerp(j.a.y, j.b.y, t) + 0.5, z: lerp(j.a.z, j.b.z, t), r: 0.4 });
  const near = (x, y, z, side, under, over) => {
    for (const w of way) if (y > w.y - under && y < w.y + over && (x - w.x) ** 2 + (z - w.z) ** 2 < (w.r + side) ** 2) return true;
    return false;
  };
  const inStem = (x, y, z, pad) => { if (y < leader.from + 2 || y > leader.to) return false; const c = stem(y); return Math.hypot(x - c.x, z - c.z) < c.r + pad; };
  const cut = new Map();
  skeleton.forEach((b, index) => {
    if (b.level < 2) return;
    // (gone with what it grows on)
    const up = cut.get(b.parent);
    if (up !== undefined && b.at * (skeleton[b.parent].pts.length - 1) >= up - 0.5) { cut.set(index, 0); return; }
    for (let i = 0; i < b.pts.length; i++) {
      const p = b.pts[i], q = b.pts[Math.min(b.pts.length - 1, i + 1)];
      let hit = false;
      for (let t = 0; t <= 1 && !hit; t += 0.25) {
        const x = lerp(p.x, q.x, t), y = lerp(p.y, q.y, t), z = lerp(p.z, q.z, t);
        hit = near(x, y, z, 0.75 + p.r, 1.1, 2.5) || (b.level > 1 && inStem(x, y, z, 0.1));
      }
      if (hit) { cut.set(index, i); break; }
    }
  });
  const gone = new Set();
  cards.forEach(([x, y, z], k) => { if (near(x, y, z, 3.4, 2.6, 4.6) || inStem(x, y, z, 1.6)) gone.add(k); });
  return { cut, cards: gone };
}

// ------------------------------------------------------------------------------------- the course, written down

/**
 * A course read back from what tools/oak-course.mjs wrote (route.js): the same holds, jumps and nets as
 * oakCourse() gives, and stem(y) → { x, z, r, least (where the bark is nearest its middle) }.
 */
export function readRoute(route) {
  const xyz = (a) => ({ x: a[0], y: a[1], z: a[2] });
  const holds = route.holds.map((h, i) => {
    if (h.kind === 'fungus') return { ...h, i, on: { x: h.on[0], z: h.on[1] }, at: xyz(h.at), edge: (h.r - 0.3) * 0.5 };
    if (h.kind !== 'branch') return { ...h, i };
    const line = h.line.map(([x, y, z, d, hd]) => ({ x, y, z, d, h: hd }));
    return { ...h, i, line, pts: line.slice(h.walk[0], h.walk[1] + 1) };
  });
  const jumps = route.jumps.map((j) => ({ ...j, a: xyz(j.a), b: xyz(j.b) }));
  const T = route.stem, last = T.at.length - 1;
  const stem = (y) => {
    const f = clamp((y - T.from) / T.step, 0, last - 1e-6), i = Math.floor(f), t = f - i, a = T.at[i], b = T.at[i + 1];
    return { x: lerp(a[0], b[0], t), z: lerp(a[1], b[1], t), r: lerp(a[2], b[2], t), least: lerp(a[3], b[3], t) };
  };
  return { ...route, holds, jumps, stem, leader: route.leader.map(([x, y, z, r]) => ({ x, y, z, r })) };
}
