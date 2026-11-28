// Checks of the wall of the companions, without a browser (layout/plaquewall.js): its four galleries stand in the
// cliff round the golden dog, above the ground and planted in the rock; its stair climbs from the floor of the ledge
// to each of them in turn, never under anything lower than a head, never too steep; its 324 plates are numbered on
// from the plinth's, two to a column, and each column is in front of a spot one can stand on; walked with the real
// collision (src/world/Collision.js), the stair leads from the ledge to the highest gallery and along it, and the
// rails keep one on it — while it is on; off, nothing of it is there. And the server sells its plates as plaques,
// at the same price, only those.
// usage: node tools/wall-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { check, done, ROOT } from './lib/check.mjs';
import { Collision } from '../src/world/Collision.js';
import { Polygon } from '../src/world/Areas.js';
import { NORTH } from '../src/world/layout/layout.js';
import { PLAQUE_COUNT, PLAQUE_WALL, PLAQUE_WALL_COUNT } from '../src/world/layout/sponsors.js';
import { RELEASE } from '../src/app/config.js';
import { describe as describeItem } from '../server/catalog.js';
import { sponsorMail } from '../server/mail.js';
import {
  WALL, DECKS, FLIGHTS, LANDINGS, PIECES, SIGN, point, place, out, eIn, eOut, baseAt, heightOn, heightNear, wallSegments, crowds, outline, arcLength,
  COLUMNS, FIRST, WALL_COUNT, plateOf, idsOf, plateAt, columnAt,
} from '../src/world/layout/plaquewall.js';

// the ground as the game reads it (bilinear, like WorldData.heightAt: on a slope of 3.4 the nearest texel is a metre and more off)
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/world/world.json'), 'utf8'));
const { data, info } = await sharp(path.join(ROOT, 'public/assets/world/height.png')).raw().toBuffer({ resolveWithObject: true });
const [lo, hi] = meta.heightRange, N = info.width, half = N / 2;
const H = (x, z) => { const i = (Math.min(N - 1, Math.max(0, z)) * N + Math.min(N - 1, Math.max(0, x))) * info.channels; return ((data[i] * 256 + data[i + 1]) / 65535) * (hi - lo) + lo; };
const ground = (x, z) => { const u = x + half - 0.5, v = z + half - 0.5, x0 = Math.floor(u), z0 = Math.floor(v), fx = u - x0, fz = v - z0; const a = H(x0, z0), b = H(x0 + 1, z0), c = H(x0, z0 + 1), d = H(x0 + 1, z0 + 1); return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz; };

const E = NORTH.ledge, S = NORTH.statue, RAD = 0.38, STEP = 0.62, CLIMB = 1.35, REACH = 0.6;
// (where things stand on the ledge, as PlacesZone._north puts them: the plinth's drum, PR = 7.05; where one says hello to
// the dog, and from how far; the board of the companions, NORTH.companions: so many degrees round the drum from the
// tablet, so far out, so wide, facing the top of the stair)
const PR = 7.05, fwd = [Math.sin(S.yaw), Math.cos(S.yaw)], HELLO = { x: S.x + fwd[0] * (PR + 2.2), z: S.z + fwd[1] * (PR + 2.2), reach: 4.2 };
const COMPANIONS = (() => { const B = NORTH.companions, a = (B.a * Math.PI) / 180, lx = Math.sin(a) * (PR + B.out), lz = Math.cos(a) * (PR + B.out), c = Math.cos(S.yaw), s = Math.sin(S.yaw), x = S.x + lx * c + lz * s, z = S.z - lx * s + lz * c, [tx, tz] = NORTH.stairs[0].points.at(-1); return { x, z, hw: B.w / 2 + 0.2, hl: 0.12, yaw: Math.atan2(tx - x, tz - z) }; })();
const rampAt = (p, a) => (p.y0 === p.y1 ? p.y0 : p.y0 + (p.y1 - p.y0) * ((a - p.a0) / (p.a1 - p.a0)));
/** The lowest of f(a, e) - ground over a piece (every quarter of a degree, every 4 cm out). */
const lowest = (p, f) => { let min = Infinity, at = null; for (let a = p.a0; a <= p.a1 + 1e-9; a += 0.25) for (let e = p.lo; e <= p.hi + 1e-9; e += out(0.04)) { const [x, z] = point(a, e), c = f(a, e) - ground(x, z); if (c < min) { min = c; at = [+a.toFixed(2), +e.toFixed(4)]; } } return { min: +min.toFixed(2), at }; };

{
  // ---- the numbers, shared with the server
  const ids = [];
  for (let g = 0; g < COLUMNS.length; g++) for (let k = 0; k < COLUMNS[g]; k++) for (const q of idsOf(g, k)) ids.push(q.n);
  const sorted = ids.slice().sort((a, b) => a - b), every = sorted.every((n, i) => n === FIRST + i);
  const round = ids.every((n) => { const p = plateOf(n), two = idsOf(p.g, p.k); return two[p.row].n === n; });
  check('the plates of the wall go on from those of the plinth: 324 of them, no. 73 to 396, each once — four galleries of 36, 39, 42 and 45 columns of two (sponsors.js, shared with the server)',
    PLAQUE_COUNT === 72 && FIRST === 73 && WALL_COUNT === 324 && PLAQUE_WALL_COUNT === 324 && PLAQUE_WALL.join() === '36,39,42,45' && ids.length === 324 && every && round && plateOf(72) === null && plateOf(397) === null,
    { first: FIRST, count: WALL_COUNT, columns: PLAQUE_WALL });
  const p73 = plateAt(73), p396 = plateAt(396), lower = plateAt(FIRST + COLUMNS[0]);
  check('plate 73 is the upper plate of the first column of the lowest gallery, plate 109 the lower one under it; 396 the last of the highest',
    p73.g === 0 && p73.k === 0 && p73.row === 0 && lower.g === 0 && lower.k === 0 && lower.row === 1 && Math.abs(lower.a - p73.a) < 1e-9 && p73.y - lower.y > 0.5 && p396.g === 3 && p396.k === 44 && p396.row === 1,
    { 73: [p73.g, p73.k, p73.row], 109: [lower.g, lower.k, lower.row], 396: [p396.g, p396.k, p396.row] });
}

{
  // ---- on the rock
  const decks = DECKS.map((d) => lowest(d, () => d.y0)), lands = LANDINGS.map((l) => lowest(l, () => l.y0));
  check('every gallery and every landing stands over the ground under it (at least 15 cm)', decks.every((r) => r.min >= 0.15) && lands.every((r) => r.min >= 0.15), { decks, lands });
  const planted = DECKS.map((d) => { let min = Infinity; for (let a = WALL.from; a <= WALL.to; a += 0.5) { const [x, z] = point(a, d.hi + out(0.5)); min = Math.min(min, ground(x, z) - d.y0); } return +min.toFixed(2); });
  check('the back wall of each gallery is planted in the rock: half a metre behind it, the rock stands over the deck', planted.every((m) => m >= 0.1), planted);
  const f0 = FLIGHTS[0], foot = lowest({ ...f0, a1: f0.a0 + 0.5 }, () => f0.y0), onFloor = lowest(f0, (a) => rampAt(f0, a));
  check('the stair starts on the floor of the ledge, and its first flight never sinks into it', Math.abs(foot.min) < 0.2 && onFloor.min > -0.2, { foot, onFloor });
  const hung = FLIGHTS.slice(1).map((f) => lowest(f, (a) => rampAt(f, a) - 0.38));
  check('the other flights hang clear of the ground (their underside a metre over it at least)', hung.every((r) => r.min >= 1), hung);
  const top = WALL.levels[3] + 3.0 + 0.06, statueTop = E.y + 2.0 + S.height * 1.06;
  check('the wall rises no higher than the dog and its bird', top < 62.3 && top < statueTop, { top, statueTop: +statueTop.toFixed(1) });
}

{
  // ---- the stair: never too steep, never under anything lower than a head, and it reaches each gallery
  const slopes = FLIGHTS.map((f) => +((f.y1 - f.y0) / arcLength((f.lo + f.hi) / 2, f.a0, f.a1)).toFixed(2));
  const reach = FLIGHTS.every((f, g) => Math.abs(f.y1 - WALL.levels[g]) < 1e-9 && (g === 0 || Math.abs(f.y0 - WALL.levels[g - 1]) < 1e-9) && LANDINGS[g].a0 === f.a1 && (g === 0 || FLIGHTS[g].a0 === LANDINGS[g - 1].a1));
  check('flight after flight, the stair climbs from the floor of the ledge to each gallery in turn, a landing at the head of each — steep, as in a library, but walkable (rise / run under 1.2)', reach && slopes.every((s) => s > 0.6 && s < 1.2), slopes);
  // anything over anything else: a head's room at least (2.6 m between a floor and what is over it, its depth counted)
  let least = Infinity, where = '';
  for (const p of PIECES) for (const q of PIECES) {
    if (p === q) continue;
    for (let a = Math.max(p.a0, q.a0); a <= Math.min(p.a1, q.a1); a += 0.5) {
      const elo = Math.max(p.lo, q.lo), ehi = Math.min(p.hi, q.hi);
      if (ehi - elo < out(0.02)) continue;
      const hp = rampAt(p, a), hq = rampAt(q, a);
      if (hq <= hp + 0.01) continue; // (q over p: from p's floor to q's underside)
      const room = hq - (q.kind === 'flight' ? 0.38 : 0.22) - hp;
      if (room < least) { least = room; where = `${q.kind} ${q.g} over ${p.kind} ${p.g} at ${a}°`; }
    }
  }
  check('nowhere is anything over a gallery, a flight or a landing lower than a head: 2.6 m of room at least', least >= 2.6, { least: +least.toFixed(2), where });
  const [fx, fz] = point(FLIGHTS[0].a0, (FLIGHTS[0].lo + FLIGHTS[0].hi) / 2);
  let ring = Infinity;
  for (let a = FLIGHTS[0].a0; a <= FLIGHTS[0].a1; a += 0.5) { const [x, z] = point(a, FLIGHTS[0].lo); ring = Math.min(ring, Math.hypot(x - S.x, z - S.z) - 7.47); }
  const hello = Math.hypot(fx - HELLO.x, fz - HELLO.z);
  check('the foot of the stair is three metres and more from the spot where one says hello to the dog (within its reach: whoever stands there may greet it), and leaves 1.5 m to walk round the plinth beside it', hello > 3 && ring > 1.5, { hello: +hello.toFixed(2), reach: HELLO.reach, ring: +ring.toFixed(2) });
  const arrival = place(...NORTH.stairs[0].points.at(-1).slice(0, 2)), sign = place(COMPANIONS.x, COMPANIONS.z);
  check('the wall keeps away from the top of the stair from the sand (where one arrives), the sign of the companions and the benches', arrival.a < WALL.from - 20 && sign.a < WALL.from - 20 && [14, 42].every((a) => a < WALL.from - 20), { arrival: +arrival.a.toFixed(1), sign: +sign.a.toFixed(1), from: WALL.from });
}

{
  // ---- the plates and where one reads them
  let bad = [], apart = Infinity;
  for (let n = FIRST; n < FIRST + WALL_COUNT; n++) {
    const p = plateAt(n), col = columnAt(p.sx, p.sz, p.sy);
    if (!col || !idsOf(col.g, col.k).some((q) => q.n === n)) bad.push(n);
    const q = plateAt(n + 1);
    if (q && q.g === p.g && q.row === p.row) apart = Math.min(apart, Math.hypot(q.x - p.x, q.z - p.z));
  }
  check('in front of every plate there is a spot on its gallery from which its column is offered (the two plates of it)', !bad.length, bad.slice(0, 8));
  check('the plates of a row do not touch (93 cm wide, a little more from one to the next)', apart > 0.98 && apart < 1.2, { apart: +apart.toFixed(3) });
  // (everywhere: the floor of the ledge round the plinth, every flight all along, every reading spot from the floors over and under it)
  const wrong = [];
  for (let a = 90; a <= 320; a += 2) for (const e of [0.75, 0.85, 0.93]) if (columnAt(...point(a, e), E.y + 0.2)) wrong.push(['floor', a, e]);
  for (const f of FLIGHTS) for (let a = f.a0; a <= f.a1; a += 0.5) for (const e of [f.lo + out(0.2), (f.lo + f.hi) / 2, f.hi - out(0.2)]) if (columnAt(...point(a, e), rampAt(f, a))) wrong.push(['flight', f.g, a]);
  for (let n = FIRST; n < FIRST + WALL_COUNT; n += 3) { const p = plateAt(n); for (const dy of [-3.3, 3.3]) if (columnAt(p.sx, p.sz, p.sy + dy)) wrong.push(['floor over or under', n, dy]); }
  check('nobody is offered a plate from the floor of the ledge, from a stair, or from the gallery over or under it', !wrong.length, wrong.slice(0, 6));
}

{
  // ---- walked, with the real collision: the ledge is walkable (as in PlacesZone), the wall is added as PlaqueWall.js adds it
  const col = new Collision({ heightAt: ground });
  col.setBounds([[1000, 1000], [1001, 1000], [1001, 1001]]); // (the valley is far away: only the places count here)
  const ellipse = (k, n = 28) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [E.x + Math.cos(a) * E.rx * k, E.z + Math.sin(a) * E.rz * k]; });
  col.addArea(new Polygon(ellipse(0.955), { name: 'golden' }));
  col.addCircle(S.x, S.z, 7.47); // (the plinth)
  col.addBox(S.x + fwd[0] * (PR + 0.1), S.z + fwd[1] * (PR + 0.1), 2.75, 0.55, S.yaw); // (its tablet)
  col.addBox(COMPANIONS.x, COMPANIONS.z, COMPANIONS.hw, COMPANIONS.hl, COMPANIONS.yaw); // (the board of the companions)
  let on = true;
  for (const p of PIECES) col.addPlatform({ clearance: p.kind === 'flight' && p.g === 0 ? 4 : 1.0, heightAt: (x, z) => (on ? heightOn(p, x, z) : null) });
  const posts = wallSegments().map(([x, z, hw, hl, yaw, y0, y1]) => ({ h: col.addBox(x, z, hw, hl, yaw, y0, y1), y0 }));
  const area = new Polygon(outline(), { name: 'companions' });
  col.addArea({ name: 'companions', cave: false, contains: (x, z) => on && area.contains(x, z), nearest: (x, z, q) => (on ? area.nearest(x, z, q) : Infinity) });
  const setOn = (v) => { on = v; for (const p of posts) p.h[6] = v ? p.y0 : 1e9; };

  /**
   * Walks a path of points [x, z] from y as a walker does: towards each point in turn, 10 cm at a time, pushed out of
   * what is in the way (resolve, confine), refusing a step higher than STEP, falling where the ground falls away.
   * Returns where it ended (and how far from the end of the path), the highest step taken, the farthest it was pushed
   * from its way, how often it was refused a step, and its worst fall.
   */
  const walk = (path, y0) => {
    const pts = [];
    for (let i = 1; i < path.length; i++) { const [ax, az] = path[i - 1], [bx, bz] = path[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1)); for (let k = 1; k <= n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]); }
    const w = { x: path[0][0], z: path[0][1] };
    let y = y0, step = 0, astray = 0, refused = 0, fell = 0, off = 0;
    for (const [tx, tz] of pts) {
      const p = { x: tx, z: tz };
      col.resolve(p, RAD, y); col.confine(p);
      const g = col.groundAt(p.x, p.z, y + 0.3);
      if (g - y > STEP) { refused++; continue; }
      // (bare rock too steep is not walked up — as PlayerController.tryMove: over REACH ahead, steeper than CLIMB)
      if (Math.abs(g - ground(p.x, p.z)) < 0.02 && g > y + 1e-4) { const d = Math.hypot(p.x - w.x, p.z - w.z) || 1, qx = w.x + ((p.x - w.x) / d) * REACH, qz = w.z + ((p.z - w.z) / d) * REACH; if ((ground(qx, qz) - y) / REACH > CLIMB && Math.abs(col.groundAt(qx, qz, y + 0.3) - ground(qx, qz)) < 0.02) { refused++; continue; } }
      if (!col.walkable(p.x, p.z)) off++;
      step = Math.max(step, g - y); fell = Math.max(fell, y - g);
      w.x = p.x; w.z = p.z; y = g;
      astray = Math.max(astray, Math.hypot(w.x - tx, w.z - tz));
    }
    const [ex, ez] = path[path.length - 1];
    return { y: +y.toFixed(2), left: +Math.hypot(w.x - ex, w.z - ez).toFixed(2), step: +step.toFixed(2), astray: +astray.toFixed(2), refused, fell: +fell.toFixed(2), off };
  };
  // (brushing past the post at the foot of a rail pushes one aside by a few centimetres: no more than 10)
  const fine = (r, level) => r.left < 0.05 && r.refused === 0 && r.fell < 0.2 && r.step <= 0.3 && r.astray < 0.1 && r.off === 0 && Math.abs(r.y - level) < 0.01;
  const mid = (f) => (f.lo + f.hi) / 2, along = (e, a0, a1, d = 1) => { const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / d)); return Array.from({ length: n + 1 }, (_, i) => point(a0 + ((a1 - a0) * i) / n, e)); };
  // from the ledge, where the stair from the sand arrives, round the plinth to the foot of the stair; up, flight after
  // flight (along the middle of each, across each landing), to the highest gallery; along it to the last column
  const lastCol = (g) => WALL.to - (0.5 * (WALL.to - WALL.from)) / COLUMNS[g], firstCol = (g) => WALL.from + (0.5 * (WALL.to - WALL.from)) / COLUMNS[g];
  const path = [...along(0.86, 100, FLIGHTS[0].a0 - 1)];
  for (const f of FLIGHTS) {
    const L = LANDINGS[f.g], next = FLIGHTS[f.g + 1];
    path.push(...along(mid(f), f.a0 - 0.5, f.a1 + 1));
    // (across the landing, from the head of the flight to the foot of the next — or onto the gallery)
    const a = (L.a0 + L.a1) / 2;
    path.push(point(a, mid(f)), point(a, next ? mid(next) : mid(DECKS[f.g])));
    if (next) path.push(...along(mid(next), a, L.a1 - 0.5)); else path.push(...along(mid(DECKS[f.g]), a, lastCol(f.g)));
  }
  const up = walk(path, E.y + 0.2);
  check('walked, the stair leads from the ledge to the highest gallery and along it to its last column: never a step too high, never pushed aside by a rail, never a fall, never off the ground one may walk',
    fine(up, WALL.levels[3]), up);
  const lows = DECKS.slice(0, 3).map((d) => { const L = LANDINGS[d.g], a = (L.a0 + L.a1) / 2; return walk([...along(mid(L), L.a0 + 2, a), ...along(mid(d), a, lastCol(d.g))], d.y0); });
  const backs = DECKS.map((d) => walk(along(mid(d), LANDINGS[d.g].a0 + 2, firstCol(d.g)), d.y0));
  check('each gallery is walked from its landing to its first and to its last column, under the flights that climb over it', lows.every((r, g) => fine(r, WALL.levels[g])) && backs.every((r, g) => fine(r, WALL.levels[g])), { lows, backs });
  // the rails: from a gallery, a flight, a landing, one walks on towards the edge — and is held back
  const towards = (a, e, y, de) => { const [x0, z0] = point(a, e), p = { x: x0, z: z0 }; for (let i = 0; i < 12; i++) { const [x, z] = point(place(p.x, p.z).a, place(p.x, p.z).e + de); p.x = x; p.z = z; col.resolve(p, RAD, y); } return place(p.x, p.z).e; };
  const edges = [
    ['gallery 1, towards the ledge below', 250, mid(DECKS[0]), DECKS[0].y0, -out(0.1), (e) => e > DECKS[0].lo + out(0.3)],
    ['gallery 3, towards gallery 2 below', 280, mid(DECKS[2]), DECKS[2].y0, -out(0.1), (e) => e > DECKS[2].lo + out(0.3)],
    ['the third flight, towards the gallery under it', FLIGHTS[2].a0 + 12, mid(FLIGHTS[2]), rampAt(FLIGHTS[2], FLIGHTS[2].a0 + 12), -out(0.1), (e) => e > FLIGHTS[2].lo + out(0.25)],
    ['the second flight, towards gallery 1 beside and below it', FLIGHTS[1].a0 + 14, mid(FLIGHTS[1]), rampAt(FLIGHTS[1], FLIGHTS[1].a0 + 14), out(0.1), (e) => e < FLIGHTS[1].hi - out(0.25)],
    ['gallery 2, into its back wall', 200, mid(DECKS[1]), DECKS[1].y0, out(0.1), (e) => e < DECKS[1].hi - out(0.3)],
    ['the last landing, off its inner edge', LANDINGS[3].a0 + 2, mid(LANDINGS[3]), LANDINGS[3].y0, -out(0.1), (e) => e > LANDINGS[3].lo + out(0.3)],
  ].map(([what, a, e, y, de, ok]) => { const got = towards(a, e, y, de); return [what, ok(got), +got.toFixed(4)]; });
  check('the rails keep one on the wall: off the inner edge of a gallery or a landing, off the side of a flight, into the back wall — held back', edges.every((r) => r[1]), edges);
  // under it: the ledge is walked round the foot of the wall as before, under the hung flights
  const ring = (a0, a1) => along(0.86, a0, a1);
  const under = walk(ring(FLIGHTS[1].a0 - 2, 195), E.y + 0.2);
  check('on the floor of the ledge one walks under the flights that hang over it, as if nothing were there', under.left < 0.05 && !under.refused && under.astray < 0.05 && !under.off && under.y < E.y + 0.5, under);
  // round the back of the plinth, where it comes near the rim: one keeps pressing along it (4.4 m/s, steps of 22 cm at
  // most, as PlayerController does) — with the wall on, one is never pushed deeper into the plinth than with it off
  const press = () => {
    const w = { x: S.x + Math.cos((205 * Math.PI) / 180) * 8.1, z: S.z + Math.sin((205 * Math.PI) / 180) * 8.1 };
    let y = E.y + 0.1, deepest = 0, frames = 0;
    const from = Math.atan2(w.z - S.z, w.x - S.x);
    for (; frames < 900; frames++) {
      const a = Math.atan2(w.z - S.z, w.x - S.x), tx = -Math.sin(a), tz = Math.cos(a), dist = 4.4 / 60, n = Math.max(1, Math.ceil(dist / 0.22));
      for (let i = 0; i < n; i++) {
        const p = { x: w.x + ((tx * 0.97 - Math.cos(a) * 0.24) * dist) / n, z: w.z + ((tz * 0.97 - Math.sin(a) * 0.24) * dist) / n };
        col.resolve(p, RAD, y); col.confine(p);
        const g = col.groundAt(p.x, p.z, y + 0.3);
        if (g - y > STEP) continue;
        w.x = p.x; w.z = p.z; y = g;
      }
      deepest = Math.max(deepest, 7.85 - Math.hypot(w.x - S.x, w.z - S.z));
      if ((Math.atan2(w.z - S.z, w.x - S.x) - from + 4 * Math.PI) % (2 * Math.PI) > (100 * Math.PI) / 180) break;
    }
    return { deepest: +deepest.toFixed(3), round: frames < 900, secs: +(frames / 60).toFixed(1) };
  };
  setOn(false); const pressOff = press(); setOn(true); const pressOn = press();
  // (and along the stone itself, behind the dog, pressing into it at an angle — both ways round: one slides along it)
  const slide = (dir, into) => {
    const w = { x: 0, z: 0 }, a0 = dir > 0 ? 205 : 295;
    [w.x, w.z] = point(a0, 0.93);
    let y = E.y + 0.1, frames = 0;
    for (; frames < 900; frames++) {
      const { a } = place(w.x, w.z), [nx, nz] = [Math.cos((a * Math.PI) / 180) / E.rx, Math.sin((a * Math.PI) / 180) / E.rz], nl = Math.hypot(nx, nz), ox = nx / nl, oz = nz / nl, tx = -oz * dir, tz = ox * dir;
      const c = Math.cos((into * Math.PI) / 180), sn = Math.sin((into * Math.PI) / 180), vx = tx * c + ox * sn, vz = tz * c + oz * sn, dist = 4.4 / 60, n = Math.max(1, Math.ceil(dist / 0.22));
      for (let i = 0; i < n; i++) {
        const p = { x: w.x + (vx * dist) / n, z: w.z + (vz * dist) / n };
        col.resolve(p, RAD, y); col.confine(p);
        const g = col.groundAt(p.x, p.z, y + 0.3);
        if (g - y > STEP) continue;
        w.x = p.x; w.z = p.z; y = g;
      }
      const { a: now } = place(w.x, w.z);
      if (dir > 0 ? now > 290 : now < 210) break;
    }
    return frames < 900 ? +(frames / 60).toFixed(1) : null;
  };
  const slides = [];
  for (const dir of [1, -1]) for (const into of [10, 30, 50, 64]) { setOn(false); const off = slide(dir, into); setOn(true); const onT = slide(dir, into); slides.push([dir, into, off, onT]); }
  check('behind the dog, one slides along the stone under the lowest gallery, pressing into it at any angle, both ways round, as one slides along the edge of the ledge without the wall',
    slides.every(([, , off, onT]) => off === null || (onT !== null && onT <= off * 1.5 + 0.5)), slides);
  check('behind the dog, where its plinth comes near the rim, one goes round it with the wall on as with it off: the stone under the lowest gallery stands back, and nobody is pushed into the plinth',
    pressOn.deepest <= pressOff.deepest + 0.02 && pressOn.round === pressOff.round, { off: pressOff, on: pressOn });
  // where somebody stood on the wall is found again (on the floor they were on, not the one over it): a page that comes back puts them there
  const again = [[plateAt(88), 'under the second landing'], [plateAt(166), 'under the fourth flight'], [plateAt(300), 'out in the open']].map(([p, what]) => [what, heightNear(p.sx, p.sz, p.sy) === p.sy, +p.sy.toFixed(2)]);
  check('a spot on the wall is found again on the floor one stood on, even under a landing or a flight', again.every((r) => r[1]), again);
  // off: none of it
  setOn(false);
  const [dx, dz] = point(200, mid(DECKS[1])), offDeck = col.walkable(dx, dz), offGround = col.groundAt(dx, dz, 60), [fx, fz] = point(FLIGHTS[0].a0 + 10, mid(FLIGHTS[0]));
  const offFoot = col.groundAt(fx, fz, 50), [rx, rz] = point(165, DECKS[0].lo), held = { x: rx, z: rz };
  // (the wall coming up while somebody stands on the floor of the ledge, anywhere it was walkable: either they are in
  // its way — and step aside to the foot of its stair (main.js) — or, whichever way they then step, as a slow frame does
  // (22 cm at once), they are never pushed through its walls into the stone or the rock)
  const spots = [];
  for (let a = 116; a <= 312; a += 1) for (let e = 0.78; e <= 0.956; e += 0.006) {
    const [x, z] = point(a, e);
    if (!col.walkable(x, z) || Math.hypot(x - S.x, z - S.z) < 7.47 + RAD) continue;
    spots.push([x, z]);
  }
  const shoved = [];
  let inWay = 0;
  for (const [x, z] of spots) {
    if (crowds(x, z, E.y + 0.2)) { inWay++; continue; }
    setOn(true);
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * Math.PI * 2, p = { x: x + Math.cos(t) * 0.22, z: z + Math.sin(t) * 0.22 };
      col.resolve(p, RAD, E.y + 0.2); col.confine(p);
      const { a, e } = place(p.x, p.z);
      if (a >= WALL.from - 1 && a <= WALL.to + 1 && e > baseAt(Math.min(WALL.to, Math.max(WALL.from, a)))) shoved.push([+place(x, z).a.toFixed(1), +place(x, z).e.toFixed(3), k]);
    }
    setOn(false);
  }
  const footFree = !crowds(...point(FLIGHTS[0].a0 - 0.8, (FLIGHTS[0].lo + FLIGHTS[0].hi) / 2), E.y + 0.2);
  check('when the wall comes up, nobody standing on the floor of the ledge is pushed through it: whoever stands in its way is told to step aside (to the foot of its stair, which is clear), and from anywhere else no step goes through its walls',
    spots.length > 1000 && !shoved.length && footFree && inWay > 0, { spots: spots.length, inWay, shoved: shoved.slice(0, 6), footFree });
  col.resolve(held, RAD, DECKS[0].y0);
  const floor = walk(ring(100, 195), E.y + 0.2);
  setOn(true);
  check('switched off, nothing of it is there: the galleries are no ground to stand on, the stair is gone, the rails stop nobody — and the ledge is walked round as it was',
    !offDeck && offGround < WALL.levels[1] - 0.5 && offFoot < E.y + 0.5 && Math.hypot(held.x - rx, held.z - rz) < 1e-9 && floor.left < 0.05 && !floor.refused && floor.astray < 0.05 && !floor.off,
    { offDeck, offGround: +offGround.toFixed(2), offFoot: +offFoot.toFixed(2), floor });
}

{
  // ---- the switch, and what the server sells
  const w = describeItem('plaque:73'), last = describeItem('plaque:396'), drum = describeItem('plaque:72');
  check('the wall comes switched off (the owner turns it on from the page /admin)', RELEASE.plaqueWall === false);
  check('its plates are sold as plaques — the same price, paid once — and marked as on the wall; nothing past no. 396, nor a number written otherwise',
    w?.plaque && w.wall === true && w.amount === drum.amount && w.monthly === false && /wall of the companions/.test(w.name) && last?.wall === true && drum?.plaque && !drum.wall
    && ['plaque:397', 'plaque:0', 'plaque:073', 'plaque:1000', 'plaque:x', 'plaque:'].every((i) => describeItem(i) === null),
    { 73: w, 72: drum?.name });
}

{
  // ---- the board of the companions, by the plates round the plinth: where it stands — and what a plaque is said to be
  // for wherever the server says it (the board itself, the offer and the form are the game's: Plaques.js, main.js)
  const B = COMPANIONS, top = NORTH.stairs[0].points.at(-1), ux = Math.cos(B.yaw), uz = -Math.sin(B.yaw);
  const ends = [-1, 1].map((k) => [B.x + ux * k * B.hw, B.z + uz * k * B.hw]);
  const within = ends.map(([x, z]) => +Math.hypot((x - E.x) / E.rx, (z - E.z) / E.rz).toFixed(3)); // (1: the rim of the ledge; one walks within 0.955 of it)
  const drum = Math.min(...ends.map(([x, z]) => Math.hypot(x - S.x, z - S.z))) - 7.47, far = Math.hypot(B.x - top[0], B.z - top[1]);
  const benches = [14, 42].map((d) => { const a = (d * Math.PI) / 180, bx = E.x + Math.cos(a) * E.rx * 0.8, bz = E.z + Math.sin(a) * E.rz * 0.8; return Math.min(...ends.map(([x, z]) => Math.hypot(x - bx, z - bz))); });
  // (it faces whoever arrives: the top of the stair is straight in front of it)
  const facing = ((top[0] - B.x) * Math.sin(B.yaw) + (top[1] - B.z) * Math.cos(B.yaw)) / far;
  check('the board of the companions stands on the ledge — both its ends on the ground one walks on —, four to six metres from the top of the stair and facing it: read as one arrives; it leaves two metres to walk round the plinth, and the benches alone',
    within.every((r) => r < 0.955) && far > 4 && far < 6 && facing > 0.999 && drum > 1.8 && benches.every((d) => d > 2) && NORTH.companions.w >= 2.2,
    { within, far: +far.toFixed(2), drum: +drum.toFixed(2), benches: benches.map((d) => +d.toFixed(2)) });
  const mail = sponsorMail('https://fair.example', 'Eve', { plaque: true, cents: 2000 }), panel = sponsorMail('https://fair.example', 'Eve', { place: 'gondola 3 of the big wheel', cents: 2900, monthly: true });
  check('the e-mail of thanks for a plaque says whom it is for — a companion here with them, or missed: not a memorial only —; that of a sponsor says nothing of the kind',
    /for your companion — here with you, or missed/.test(mail.text) && /here with you, or missed/.test(mail.html) && !/companion/.test(panel.text), { plaque: mail.text.split('\n')[2] });
}

done();
