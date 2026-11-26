// The wall of the companions: four galleries of brass plates in the cliff round the golden dog, one over the
// other, and the stair that climbs to them — flight after flight along the rock, like the stairs of a library.
// Plain numbers only (no three.js): the builder (zones/places/PlaqueWall.js), the server (which counts the plates,
// through sponsors.js) and the checks (tools/wall-test.mjs) all read them from here.
//
// The ledge round the dog is an ellipse (NORTH.ledge); the cliff rises outside it at a steady slope (as the bake
// cut it: 3.4 m up for every metre out). A spot is told by its angle round the ledge, `a` (degrees: 0 east, 90
// south, 180 west, 270 north — the ellipse's own), and its distance out, `e` (1: the rim of the ledge). Each gallery
// is a deck of wood along the cliff, from WALL.from to WALL.to; its back wall carries two rows of plates, as round
// the plinth. The stair starts on the floor of the ledge at WALL.stair.at and climbs to each gallery in turn: a
// flight, a landing that is part of that gallery, the next flight — each flight just inside the gallery it leaves,
// over the one below it, so that no gallery is ever in the way of the stair, nor the stair in the way of a gallery.
//
// The numbers of the plates follow the galleries from the lowest: on each, the upper row from WALL.from round to
// WALL.to, then the lower row. They are sold (plaque:<n>, after the 72 of the plinth): never change WALL.from,
// WALL.to, WALL.levels, WALL.margin or PLAQUE_WALL once a plate is paid for — the plates would move.
import { NORTH } from './layout.js';
import { PLAQUE_COUNT, PLAQUE_WALL } from './sponsors.js';

const E = NORTH.ledge, R = Math.PI / 180, K = Math.min(E.rx, E.rz);
export const WALL = NORTH.wall;
const W = WALL, S = W.stair;

/** A point at angle a (degrees), distance out e: [x, z]. */
export const point = (a, e) => [E.x + Math.cos(a * R) * E.rx * e, E.z + Math.sin(a * R) * E.rz * e];
/** Where (x, z) is: { a (0 to 360), e }. */
export function place(x, z) {
  const u = (x - E.x) / E.rx, v = (z - E.z) / E.rz;
  let a = Math.atan2(v, u) / R;
  if (a < 0) a += 360;
  return { a, e: Math.hypot(u, v) };
}
/** Metres, as a distance out. */
export const out = (m) => m / K;
/** The way the rock faces at angle a: the unit vector, in (x, z), that points from the cliff towards the dog. */
export function inward(a) {
  const nx = -Math.cos(a * R) / E.rx, nz = -Math.sin(a * R) / E.rz, l = Math.hypot(nx, nz);
  return [nx / l, nz / l];
}
/** The length (m) of the arc at distance e, from angle a0 to a1. */
export function arcLength(e, a0, a1, step = 0.25) {
  let len = 0, prev = point(a0, e);
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / step));
  for (let i = 1; i <= n; i++) { const p = point(a0 + ((a1 - a0) * i) / n, e); len += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; }
  return len;
}

/**
 * Where the stone under the lowest gallery stands at angle a (a distance out): at WALL.base — or further out, behind
 * the dog, where its plinth comes near the rim, so that there is still room to go between the two (the plinth's
 * collider, PlacesZone._north: 7.47 m round the statue; a walker is 0.76 m wide, the wall's own skin 0.12).
 */
const PLINTH = { x: NORTH.statue.x, z: NORTH.statue.z, r: 7.47 };
export function baseAt(a) {
  let e = WALL.base;
  for (let i = 0; i < 80; i++) { const [x, z] = point(a, e); if (Math.hypot(x - PLINTH.x, z - PLINTH.z) >= PLINTH.r + 1.0) break; e += out(0.02); }
  return e;
}

/** The front of the back wall of gallery g (where its plates are), and the inner edge of its deck: distances out. */
export const eOut = (g) => 1 + out((W.levels[g] - E.y - 0.3 - W.margin) / 3.4);
export const eIn = (g) => eOut(g) - out(W.depth);

// ---- what one walks on. Each piece: { kind, g, a0, a1 (angles, a0 < a1), lo, hi (distances out), y0, y1 (heights
// at a0 and at a1: the same but on a flight) }.
/** The galleries, from the lowest. */
export const DECKS = W.levels.map((y, g) => ({ kind: 'deck', g, a0: W.from, a1: W.to, lo: eIn(g), hi: eOut(g), y0: y, y1: y }));
/** The flights: flight g climbs to gallery g — from the floor of the ledge, or from gallery g - 1, just inside it. */
export const FLIGHTS = W.levels.map((y, g) => {
  const a0 = S.at + g * (S.flight + S.landing), edge = eIn(Math.max(0, g - 1));
  return { kind: 'flight', g, a0, a1: a0 + S.flight, lo: edge - out(S.width), hi: edge, y0: g ? W.levels[g - 1] : S.foot, y1: y };
});
/** The landings: at the head of flight g, part of gallery g (and reaching in over the flight's width). */
export const LANDINGS = FLIGHTS.map((f) => ({ kind: 'landing', g: f.g, a0: f.a1, a1: f.a1 + S.landing, lo: f.lo, hi: eOut(f.g), y0: f.y1, y1: f.y1 }));
export const PIECES = [...DECKS, ...FLIGHTS, ...LANDINGS];

/** The height of piece p at (x, z) — or null when (x, z) is not on it. */
export function heightOn(p, x, z) {
  const { a, e } = place(x, z);
  if (e < p.lo || e > p.hi || a < p.a0 || a > p.a1) return null;
  return p.y0 === p.y1 ? p.y0 : p.y0 + (p.y1 - p.y0) * ((a - p.a0) / (p.a1 - p.a0));
}
/** Of the pieces over (x, z), the height of the one nearest to y (within 1.5 m) — or null: where one stood there. */
export function heightNear(x, z, y) {
  let best = null;
  for (const p of PIECES) { const h = heightOn(p, x, z); if (h !== null && Math.abs(h - y) < 1.5 && (best === null || Math.abs(h - y) < Math.abs(best - y))) best = h; }
  return best;
}
/**
 * The sign at the foot of the stair, on the floor of the ledge, against the stone under the lowest gallery and square
 * to the dog: its middle (angle, distance out), its half width and half depth (it is in the way as a whole: a box).
 */
export const SIGN = (() => {
  const a = S.at - 8, e = W.base - out(0.03), [x, z] = point(a, e), [nx, nz] = inward(a);
  return { a, e, x, z, hw: 0.9, hl: 0.12, yaw: Math.atan2(nx, nz) };
})();

/** What of [lo, hi] is left once the spans are taken out of it: [[lo, hi], …]. */
function gaps(lo, hi, spans) {
  const left = [];
  let at = lo;
  for (const [a, b] of spans.slice().sort((p, q) => p[0] - q[0])) { if (a > at + 1e-6) left.push([at, Math.min(a, hi)]); at = Math.max(at, b); }
  if (hi > at + 1e-6) left.push([at, hi]);
  return left.filter(([a, b]) => b - a > 1e-4);
}

/**
 * Where one cannot pass (the rails): along an arc, { e, a0, a1, y0, y1 } (at distance e, from angle a0 to a1, at
 * heights y0 to y1) — or across, { a, lo, hi, y } (at angle a, from distance lo to hi). Every edge of every piece that
 * leads nowhere: the inner edge of each gallery (but where its landing comes in) and its two ends; both sides of
 * each flight; round each landing, all but where the flight arrives, the next one leaves, and the gallery goes on.
 */
export function railLines() {
  const lines = [];
  const along = (e, a0, a1, y0, y1 = y0) => { if (a1 - a0 > 0.05) lines.push({ e, a0, a1, y0, y1 }); };
  const across = (a, lo, hi, y) => { for (const [l, h] of gaps(lo, hi, [])) lines.push({ a, lo: l, hi: h, y }); };
  for (const d of DECKS) {
    const L = LANDINGS[d.g];
    along(d.lo, d.a0, L.a0, d.y0); along(d.lo, L.a1, d.a1, d.y0);
    across(d.a0, d.lo, d.hi, d.y0); across(d.a1, d.lo, d.hi, d.y0);
  }
  for (const f of FLIGHTS) { along(f.lo, f.a0, f.a1, f.y0, f.y1); along(f.hi, f.a0, f.a1, f.y0, f.y1); }
  for (const L of LANDINGS) {
    const f = FLIGHTS[L.g], next = FLIGHTS[L.g + 1], d = DECKS[L.g];
    along(L.lo, L.a0, L.a1, L.y0);
    for (const [lo, hi] of gaps(L.lo, L.hi, [[f.lo, f.hi], [d.lo, d.hi]])) across(L.a0, lo, hi, L.y0);
    for (const [lo, hi] of gaps(L.lo, L.hi, [...(next ? [[next.lo, next.hi]] : []), [d.lo, d.hi]])) across(L.a1, lo, hi, L.y0);
  }
  return lines;
}

/**
 * The collision of the wall, as thin smooth walls — oriented boxes [x, z, hw, hl, yaw, y0, y1] (see Collision.addBox),
 * one every 0.4 m or so along each line, each for the height it stands at: nothing in them to catch on, one slides along
 * them. The rails; the back walls of the galleries (one cannot walk into the rock behind the plates); the stone under
 * the lowest gallery (nor up the rim of the ledge under it); the sign at the foot of the stair.
 */
export const SKIN = 0.06;
export function wallSegments() {
  const segs = [];
  const line = (pts, band) => {
    for (let i = 1; i < pts.length; i++) {
      const [x0, z0, y0] = pts[i - 1], [x1, z1, y1] = pts[i], len = Math.hypot(x1 - x0, z1 - z0);
      if (len > 1e-3) segs.push([(x0 + x1) / 2, (z0 + z1) / 2, len / 2 + 0.02, SKIN, Math.atan2(-(z1 - z0), x1 - x0), Math.min(y0, y1) + band[0], Math.max(y0, y1) + band[1]]);
    }
  };
  const arc = (eAt, a0, a1, y0, y1) => {
    const n = Math.max(1, Math.ceil(arcLength(eAt(a0), a0, a1) / 0.4));
    return Array.from({ length: n + 1 }, (_, i) => { const t = i / n, a = a0 + (a1 - a0) * t, [x, z] = point(a, eAt(a)); return [x, z, y0 + (y1 - y0) * t]; });
  };
  for (const l of railLines()) {
    if ('e' in l) line(arc(() => l.e, l.a0, l.a1, l.y0, l.y1), [-0.4, 1.15]);
    else { const [x0, z0] = point(l.a, l.lo), [x1, z1] = point(l.a, l.hi); line([[x0, z0, l.y], [x1, z1, l.y]], [-0.4, 1.15]); }
  }
  for (const d of DECKS) line(arc(() => d.hi + out(SKIN), W.from, W.to, d.y0, d.y0), [-0.5, 2.9]);
  // (the stone under the lowest gallery — behind the dog, standing back out of the way of whoever goes round the plinth)
  line(arc(baseAt, W.from, W.to, E.y, E.y), [-0.9, 3.2]);
  segs.push([SIGN.x, SIGN.z, SIGN.hw, SIGN.hl, SIGN.yaw, E.y - 0.9, E.y + 3.2]);
  return segs;
}
/** How far (x, z) is from the side of segment s (0: inside it). */
export function awayFrom(s, x, z) {
  const c = Math.cos(s[4]), n = Math.sin(s[4]), dx = x - s[0], dz = z - s[1], lx = dx * c - dz * n, lz = dx * n + dz * c;
  return Math.hypot(lx - Math.max(-s[2], Math.min(s[2], lx)), lz - Math.max(-s[3], Math.min(s[3], lz)));
}
/**
 * Would the wall, coming up now, be in the way of somebody standing at (x, z, y) (radius r)? Up against one of its
 * walls (or inside one), or under its lowest flight, which stands on the floor: they are to step aside first.
 */
export function crowds(x, z, y, r = 0.38) {
  if ((x - E.x) ** 2 + (z - E.z) ** 2 > (E.rx * 1.6) ** 2) return false;
  if (wallSegments().some((s) => y + 1.2 >= s[5] && y <= s[6] && awayFrom(s, x, z) < r + 0.05)) return true;
  const f = heightOn(FLIGHTS[0], x, z);
  return f !== null && f > y + 0.6;
}

/** The ground the wall covers, for the playable area: its outline [[x, z], …] (every piece is inside it). */
export function outline(step = 2) {
  const lo = Math.min(...PIECES.map((p) => p.lo)), hi = Math.max(...PIECES.map((p) => p.hi)) + out(0.05), pts = [];
  for (let a = W.from; a <= W.to + 1e-9; a += step) pts.push(point(a, hi));
  for (let a = W.to; a >= W.from - 1e-9; a -= step) pts.push(point(a, lo));
  return pts;
}

// ---- the plates. Gallery g has PLAQUE_WALL[g] columns of two, evenly round its back wall.
export const COLUMNS = PLAQUE_WALL;
/** The first number on the wall (after the plates of the plinth), and how many there are. */
export const FIRST = PLAQUE_COUNT + 1;
export const WALL_COUNT = 2 * COLUMNS.reduce((a, b) => a + b, 0);
const START = COLUMNS.reduce((s, c, g) => { s.push(g ? s[g - 1] + 2 * COLUMNS[g - 1] : FIRST); return s; }, []);
/** The angle of column k of gallery g (the middle of its plates). */
export const columnAngle = (g, k) => W.from + ((k + 0.5) * (W.to - W.from)) / COLUMNS[g];
/** Plate number n: { g, k, row: 0 the upper, 1 the lower } — or null when it is not on the wall. */
export function plateOf(n) {
  if (!Number.isInteger(n) || n < FIRST || n >= FIRST + WALL_COUNT) return null;
  for (let g = COLUMNS.length - 1; g >= 0; g--) {
    if (n < START[g]) continue;
    const i = n - START[g];
    return { g, k: i % COLUMNS[g], row: i < COLUMNS[g] ? 0 : 1 };
  }
  return null;
}
/** The two plates of column k of gallery g: [{ id: 'plaque:<n>', n, row: 'upper' }, { …, row: 'lower' }]. */
export const idsOf = (g, k) => [START[g] + k, START[g] + COLUMNS[g] + k].map((n, j) => ({ id: `plaque:${n}`, n, row: j ? 'lower' : 'upper' }));
/** How far in front of its wall a plate stands (m). */
export const PLATE_OFF = 0.022;
/**
 * Where plate n is: { x, y, z } its middle; (nx, nz) the way its face looks; { sx, sy, sz } where one stands to read
 * it, on the gallery; and its gallery, column, row and angle. Null when n is not on the wall.
 */
export function plateAt(n) {
  const p = plateOf(n);
  if (!p) return null;
  const a = columnAngle(p.g, p.k), e = eOut(p.g), [x, z] = point(a, e - out(PLATE_OFF)), [sx, sz] = point(a, e - out(0.75)), [nx, nz] = inward(a);
  return { ...p, n, a, x, y: W.levels[p.g] + W.rows[p.row], z, nx, nz, sx, sy: W.levels[p.g], sz };
}
/** The column in front of whoever stands at (x, z), at height y, on a gallery: { g, k } — or null. */
export function columnAt(x, z, y) {
  const { a, e } = place(x, z);
  if (a < W.from || a > W.to) return null;
  for (let g = 0; g < COLUMNS.length; g++) {
    if (Math.abs(y - W.levels[g]) > 0.8 || e < eIn(g) + out(0.2) || e > eOut(g)) continue;
    return { g, k: Math.min(COLUMNS[g] - 1, Math.max(0, Math.floor(((a - W.from) / (W.to - W.from)) * COLUMNS[g]))) };
  }
  return null;
}
