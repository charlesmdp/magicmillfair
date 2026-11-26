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
import {
  WALL, DECKS, FLIGHTS, LANDINGS, PIECES, point, place, out, eIn, eOut, heightOn, wallPosts, outline, arcLength,
  COLUMNS, FIRST, WALL_COUNT, plateOf, idsOf, plateAt, columnAt,
} from '../src/world/layout/plaquewall.js';

// the ground as the game reads it (bilinear, like WorldData.heightAt: on a slope of 3.4 the nearest texel is a metre and more off)
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/world/world.json'), 'utf8'));
const { data, info } = await sharp(path.join(ROOT, 'public/assets/world/height.png')).raw().toBuffer({ resolveWithObject: true });
const [lo, hi] = meta.heightRange, N = info.width, half = N / 2;
const H = (x, z) => { const i = (Math.min(N - 1, Math.max(0, z)) * N + Math.min(N - 1, Math.max(0, x))) * info.channels; return ((data[i] * 256 + data[i + 1]) / 65535) * (hi - lo) + lo; };
const ground = (x, z) => { const u = x + half - 0.5, v = z + half - 0.5, x0 = Math.floor(u), z0 = Math.floor(v), fx = u - x0, fz = v - z0; const a = H(x0, z0), b = H(x0 + 1, z0), c = H(x0, z0 + 1), d = H(x0 + 1, z0 + 1); return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz; };

const E = NORTH.ledge, S = NORTH.statue, RAD = 0.38, STEP = 0.62;
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
  const hello = { x: S.x + Math.sin(S.yaw) * 9.25, z: S.z + Math.cos(S.yaw) * 9.25 }, [fx, fz] = point(FLIGHTS[0].a0, (FLIGHTS[0].lo + FLIGHTS[0].hi) / 2);
  let ring = Infinity;
  for (let a = FLIGHTS[0].a0; a <= FLIGHTS[0].a1; a += 0.5) { const [x, z] = point(a, FLIGHTS[0].lo); ring = Math.min(ring, Math.hypot(x - S.x, z - S.z) - 7.47); }
  check('the foot of the stair is clear of where one says hello to the dog, and leaves room to walk round the plinth beside it', Math.hypot(fx - hello.x, fz - hello.z) > 3 && ring > 1.5, { hello: +Math.hypot(fx - hello.x, fz - hello.z).toFixed(2), ring: +ring.toFixed(2) });
  const arrival = place(...NORTH.stairs[0].points.at(-1).slice(0, 2));
  check('the wall keeps away from the top of the stair from the sand (where one arrives), the sign of the companions and the benches', arrival.a < WALL.from - 20 && [70.6, 14, 42].every((a) => a < WALL.from - 20), { arrival: +arrival.a.toFixed(1), from: WALL.from });
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
  check('nobody is offered a plate from the floor of the ledge, from a stair, or from the gallery over or under it',
    columnAt(...point(200, 0.85), E.y) === null && columnAt(...point(FLIGHTS[1].a0 + 10, (FLIGHTS[1].lo + FLIGHTS[1].hi) / 2), rampAt(FLIGHTS[1], FLIGHTS[1].a0 + 10)) === null
    && columnAt(plateAt(200).sx, plateAt(200).sz, plateAt(200).sy + 3.3) === null);
}

{
  // ---- walked, with the real collision: the ledge is walkable (as in PlacesZone), the wall is added as PlaqueWall.js adds it
  const col = new Collision({ heightAt: ground });
  col.setBounds([[1000, 1000], [1001, 1000], [1001, 1001]]); // (the valley is far away: only the places count here)
  const ellipse = (k, n = 28) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [E.x + Math.cos(a) * E.rx * k, E.z + Math.sin(a) * E.rz * k]; });
  col.addArea(new Polygon(ellipse(0.955), { name: 'golden' }));
  col.addCircle(S.x, S.z, 7.47); // (the plinth)
  let on = true;
  for (const p of PIECES) col.addPlatform({ clearance: p.kind === 'flight' && p.g === 0 ? 4 : 1.0, heightAt: (x, z) => (on ? heightOn(p, x, z) : null) });
  const posts = wallPosts().map(([x, z, r, y0, y1]) => ({ h: col.addCircle(x, z, r, y0, y1), y0 }));
  const area = new Polygon(outline(), { name: 'companions' });
  col.addArea({ name: 'companions', cave: false, contains: (x, z) => on && area.contains(x, z), nearest: (x, z, q) => (on ? area.nearest(x, z, q) : Infinity) });
  const setOn = (v) => { on = v; for (const p of posts) p.h[3] = v ? p.y0 : 1e9; };

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
  // off: none of it
  setOn(false);
  const [dx, dz] = point(200, mid(DECKS[1])), offDeck = col.walkable(dx, dz), offGround = col.groundAt(dx, dz, 60), [fx, fz] = point(FLIGHTS[0].a0 + 10, mid(FLIGHTS[0]));
  const offFoot = col.groundAt(fx, fz, 50), [rx, rz] = point(165, DECKS[0].lo), held = { x: rx, z: rz };
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

done();
