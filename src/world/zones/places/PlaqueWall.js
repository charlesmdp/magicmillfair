// The wall of the companions, built (where everything stands: layout/plaquewall.js): four galleries along the cliff
// round the golden dog, their back walls of dark wood that carry the plates like the shelves of a library, their
// balustrades, the stair that climbs to them flight after flight, a lamp here and there, and a sign at its foot.
// Only built — and only loaded: PlacesZone.buildWall — once the switch `plaqueWall` is on; while it is off, nothing
// of it is drawn and nothing of it is in anybody's way.
//
// The plates are one mesh painted from one picture, like those of the plinth (Plaques.js) — but there are far too
// many of them for a cell each: the bare plates share one cell, the plates that are somebody's but not engraved yet
// another two (yours, or somebody else's), and the engraved ones nearest to whoever looks get a cell of their own
// (the others, too far to be read, show an engraved plate). The picture is made when somebody comes near, and thrown
// away when they have gone; far away, the plates are plain bronze.
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';
import { LAYER } from '../../../render/Shadows.js';
import { canvasBoard } from '../games/Boards.js';
import { Polygon } from '../../Areas.js';
import { loadImage } from '../../../net/Shop.js';
import { drawPlate, CELL_W, CELL_H } from './Plaques.js';
import { NORTH } from '../../layout/layout.js';
import {
  WALL, DECKS, FLIGHTS, LANDINGS, PIECES, point, place, out, inward, eIn, eOut, heightOn, wallPosts, outline,
  COLUMNS, FIRST, WALL_COUNT, plateAt, idsOf, columnAt, arcLength,
} from '../../layout/plaquewall.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const E = NORTH.ledge, R = Math.PI / 180;
const NEAR = 150, FAR = 230, HIDE = 520; // metres: the picture is made within the first, dropped beyond the second; nothing is drawn beyond the third
const T = 0.22; // the thickness of a deck
const DEG = 1.5; // arcs are drawn in steps of that many degrees
const PLATE = { w: 0.93, h: 0.48 };
const BRONZE = 0x5e4929; // a plate seen from afar, before its picture is made
// the cells shared by many plates: bare, somebody's (being engraved), yours (have it engraved), engraved (too far to be read)
const BARE = 0, TAKEN = 1, MINE = 2, FAR_CELL = 3, SHARED = 4;
const AFAR = { title: '— — —', subtitle: '— —— — —— —' };

const steps = (a0, a1, deg = DEG) => { const n = Math.max(1, Math.ceil((a1 - a0) / deg)); return Array.from({ length: n + 1 }, (_, i) => a0 + ((a1 - a0) * i) / n); };
const val = (v, a) => (typeof v === 'function' ? v(a) : v);

/** A level band between distances lo and hi, from angle a0 to a1, at height y (a number, or a function of the angle): seen from above — or from below (`down`). */
function flat(b, lo, hi, a0, a1, y, { down = false } = {}) {
  let s = 0;
  const as = steps(a0, a1);
  for (let i = 1; i < as.length; i++) {
    const p = as[i - 1], q = as[i], [x0, z0] = point(p, lo), [x1, z1] = point(p, hi), [x2, z2] = point(q, lo), [x3, z3] = point(q, hi);
    const A = V(x0, val(y, p), z0), B = V(x2, val(y, q), z2), C = V(x3, val(y, q), z3), D = V(x1, val(y, p), z1);
    if (down) b.quad(D, C, B, A, { u0: s, v0: 0 }); else b.quad(A, B, C, D, { u0: s, v0: 0 });
    s += Math.hypot(x2 - x0, z2 - z0);
  }
}
/** A wall along the arc at distance e, from a0 to a1, between heights y0 and y1 (numbers or functions of the angle): its face towards the dog — or away from it. */
function arcWall(b, e, a0, a1, y0, y1, { away = false } = {}) {
  let s = 0;
  const as = steps(a0, a1);
  for (let i = 1; i < as.length; i++) {
    const p = as[i - 1], q = as[i], [x0, z0] = point(p, e), [x1, z1] = point(q, e), len = Math.hypot(x1 - x0, z1 - z0);
    const pb = V(x0, val(y0, p), z0), qb = V(x1, val(y0, q), z1), qt = V(x1, val(y1, q), z1), pt = V(x0, val(y1, p), z0);
    if (away) b.quad(qb, pb, pt, qt, { u0: -s - len, v0: pb.y }); else b.quad(pb, qb, qt, pt, { u0: s, v0: pb.y });
    s += len;
  }
}
/** A wall across, at angle a, from distance lo to hi, between heights y0 and y1: its face towards growing angles — or the other way (`back`). */
function radialWall(b, a, lo, hi, y0, y1, { back = false } = {}) {
  const [x0, z0] = point(a, lo), [x1, z1] = point(a, hi);
  const A = V(x0, y0, z0), B = V(x1, y0, z1), C = V(x1, y1, z1), D = V(x0, y1, z0);
  if (back) b.quad(B, A, D, C, { v0: y0 }); else b.quad(A, B, C, D, { v0: y0 });
}
/** A small block standing on the rock at angle a, distance e, height y: `box` given square to the wall (x along it, z towards the dog). */
function onWall(b, a, e, y, box) {
  const [x, z] = point(a, e), [nx, nz] = inward(a);
  b.place(x, y, z, Math.atan2(nx, nz)).box(...box).pop();
}
/** A rail along points [{ x, y, z }]: a beam from each to the next. */
function railAlong(b, pts, w = 0.075, h = 0.06) {
  for (let i = 1; i < pts.length; i++) b.beam(pts[i - 1], pts[i], w, h);
}

/**
 * Builds the wall for the zone of the places (`zone`: its world, its group, its casting layers). Returns
 * { group, first, count, on, setOn(on), columnAt(x, z, y), ids({ g, k }), where(n), set(n, what), peek(n), update(cam),
 *   painted, shown(n), foot, holds(x, z, y) }:
 * - columnAt: the column of plates in front of whoever stands at (x, z, y) on a gallery — or null (and always while off);
 * - set(n, what): what plate n shows — null, { taken, mine } or { title, subtitle, logo (an address or an image), pending };
 * - foot: where the stair starts, on the floor of the ledge; holds(x, z, y): is that somewhere on the wall, above the floor?
 */
export function buildPlaqueWall(zone) {
  const world = zone.world, collision = world.collision, phone = !!world.engine.tier.phone;
  const group = new THREE.Group();
  group.name = 'companions';
  group.visible = false;
  const parts = new Parts();
  const deck = parts.get('woodDeck'), wood = parts.get('woodDark'), stone = parts.get('granite'), brass = parts.get('paint'), glow = parts.get('glow');
  const WARM = [1.18, 0.98, 0.82], DARKER = [0.8, 0.68, 0.58];

  // ---- the base: a wall of stone under the lowest gallery, from the floor of the ledge
  stone.tint(0.86, 0.84, 0.8, 1);
  arcWall(stone, WALL.base + out(0.03), WALL.from, WALL.to, E.y - 0.4, WALL.levels[0] - T);
  for (const [a, back] of [[WALL.from, true], [WALL.to, false]]) radialWall(stone, a, WALL.base + out(0.03), eIn(0) + out(0.6), E.y - 0.4, WALL.levels[0] - T, { back });

  // ---- the galleries: a deck of planks, its edge and its underside, the back wall with its shelves, lamps
  for (const d of DECKS) {
    const { g, lo, hi, y0: y } = d, L = LANDINGS[g], top = g + 1 < DECKS.length ? WALL.levels[g + 1] - T : y + 3.0;
    deck.tint(1.05, 0.98, 0.9, 1);
    flat(deck, lo, hi + out(0.25), WALL.from, WALL.to, y);
    flat(deck, L.lo, lo, L.a0, L.a1, y); // (its landing: the head of a flight)
    wood.tint(...DARKER, 1);
    flat(wood, lo, hi, WALL.from, WALL.to, y - T, { down: true });
    flat(wood, L.lo, lo, L.a0, L.a1, y - T, { down: true });
    arcWall(wood, lo, WALL.from, L.a0, y - T, y); arcWall(wood, lo, L.a1, WALL.to, y - T, y); arcWall(wood, L.lo, L.a0, L.a1, y - T, y);
    radialWall(wood, L.a0, L.lo, lo, y - T, y, { back: true }); radialWall(wood, L.a1, L.lo, lo, y - T, y);
    radialWall(wood, WALL.from, lo, hi, y - T, y, { back: true }); radialWall(wood, WALL.to, lo, hi, y - T, y);
    // the back wall: dark panels, a shelf under each row of plates and one over them, an upright between columns
    wood.tint(...WARM, 1);
    arcWall(wood, hi, WALL.from, WALL.to, y - 0.05, top);
    for (const [a, back] of [[WALL.from, true], [WALL.to, false]]) radialWall(wood, a, hi, hi + out(0.4), y - 0.05, top, { back });
    if (g + 1 === DECKS.length) {
      // (the top of the highest: a cornice, and the rock behind it)
      wood.tint(...DARKER, 1);
      arcWall(wood, hi - out(0.09), WALL.from, WALL.to, top - 0.18, top + 0.06);
      flat(wood, hi - out(0.09), hi, WALL.from, WALL.to, top - 0.18, { down: true });
      flat(wood, hi - out(0.09), hi + out(0.5), WALL.from, WALL.to, top + 0.06);
    }
    wood.tint(1.35, 1.12, 0.9, 1);
    for (const ledge of [0.44, 1.0, 1.58]) {
      arcWall(wood, hi - out(0.05), WALL.from, WALL.to, y + ledge, y + ledge + 0.035);
      flat(wood, hi - out(0.05), hi, WALL.from, WALL.to, y + ledge + 0.035);
    }
    const cols = COLUMNS[g];
    for (let k = 0; k <= cols; k++) {
      const a = WALL.from + (k * (WALL.to - WALL.from)) / cols, end = k === 0 || k === cols;
      onWall(wood, a, hi, y, [-(end ? 0.07 : 0.035), 0.3, 0, end ? 0.07 : 0.035, 1.8, end ? 0.06 : 0.035]);
      if (k % 6 === 3) {
        // a lamp: a brass arm, a lantern
        brass.tint(1.5, 1.05, 0.3, 1);
        onWall(brass, a, hi, y, [-0.03, 2.08, 0, 0.03, 2.13, 0.2]);
        onWall(brass, a, hi, y, [-0.075, 2.36, 0.12, 0.075, 2.39, 0.27]);
        glow.tint(1, 0.82, 0.5, 1);
        onWall(glow, a, hi, y, [-0.055, 2.15, 0.14, 0.055, 2.36, 0.25]);
      }
    }
  }

  // ---- the stair: flight after flight, each just inside the gallery it leaves; treads, risers, the sides, the rails
  for (const f of FLIGHTS) {
    const n = Math.max(4, Math.round((f.y1 - f.y0) / 0.235)), h = (f.y1 - f.y0) / n, da = (f.a1 - f.a0) / n;
    const ramp = (a) => f.y0 + (f.y1 - f.y0) * ((a - f.a0) / (f.a1 - f.a0)), hung = f.g > 0;
    for (let i = 0; i < n; i++) {
      const a = f.a0 + i * da, tread = f.y0 + (i + 0.5) * h;
      deck.tint(1.0, 0.92, 0.82, 1);
      flat(deck, f.lo, f.hi, a, a + da, tread);
      wood.tint(...DARKER, 1);
      radialWall(wood, a, f.lo, f.hi, i ? tread - h : f.y0 - 0.05, tread, { back: true });
    }
    // the sides: deep boards that hold the treads (down to the floor for the lowest flight), its underside when it hangs
    wood.tint(...WARM, 1);
    const side = (a) => ramp(a) + h / 2 + 0.08, under = (a) => (hung ? ramp(a) - 0.38 : WALL.stair.foot - 0.3);
    arcWall(wood, f.lo, f.a0, f.a1, under, side);
    arcWall(wood, f.hi, f.a0, f.a1, under, side, { away: true });
    if (hung) { wood.tint(...DARKER, 1); flat(wood, f.lo, f.hi, f.a0, f.a1, (a) => ramp(a) - 0.38, { down: true }); }
    // rails on both sides, a post at the foot, in the middle and at the head
    wood.tint(0.9, 0.74, 0.6, 1);
    for (const e of [f.lo + out(0.04), f.hi - out(0.04)]) {
      railAlong(wood, steps(f.a0, f.a1, 2.5).map((a) => { const [x, z] = point(a, e); return V(x, ramp(a) + 0.95, z); }));
      for (const a of [f.a0 + 0.6, (f.a0 + f.a1) / 2, f.a1 - 0.3]) onWall(wood, a, e, ramp(a), [-0.04, 0, -0.04, 0.04, 0.97, 0.04]);
    }
  }

  // ---- the balustrades: posts, a handrail and a rail halfway up, wherever one would fall
  wood.tint(0.9, 0.74, 0.6, 1);
  for (const d of DECKS) {
    const L = LANDINGS[d.g];
    for (const [a0, a1] of [[WALL.from, L.a0], [L.a1, WALL.to]]) balustradeArc(d.lo + out(0.04), a0, a1, d.y0);
    balustradeArc(L.lo + out(0.04), L.a0, L.a1, d.y0);
    for (const a of [WALL.from, WALL.to]) balustradeAcross(a, d.lo, d.hi, d.y0);
  }
  for (const L of LANDINGS) {
    const f = FLIGHTS[L.g], next = FLIGHTS[L.g + 1], d = DECKS[L.g];
    for (const [lo, hi] of spans(L.lo, L.hi, [[f.lo, f.hi], [d.lo, d.hi]])) balustradeAcross(L.a0 + 0.3, lo, hi, L.y0);
    for (const [lo, hi] of spans(L.lo, L.hi, [...(next ? [[next.lo, next.hi]] : []), [d.lo, d.hi]])) balustradeAcross(L.a1 - 0.3, lo, hi, L.y0);
  }
  function balustradeArc(e, a0, a1, y) {
    if (a1 - a0 < 0.3) return;
    const pts = steps(a0, a1, 3).map((a) => { const [x, z] = point(a, e); return { a, x, z }; });
    railAlong(wood, pts.map((p) => V(p.x, y + 0.98, p.z)));
    railAlong(wood, pts.map((p) => V(p.x, y + 0.48, p.z)), 0.05, 0.05);
    const n = Math.max(1, Math.round(arcLength(e, a0, a1) / 1.25));
    for (let i = 0; i <= n; i++) onWall(wood, a0 + ((a1 - a0) * i) / n, e, y, [-0.045, 0, -0.045, 0.045, 1.0, 0.045]);
  }
  function balustradeAcross(a, lo, hi, y) {
    const [x0, z0] = point(a, lo), [x1, z1] = point(a, hi);
    wood.beam(V(x0, y + 0.98, z0), V(x1, y + 0.98, z1), 0.075, 0.06);
    wood.beam(V(x0, y + 0.48, z0), V(x1, y + 0.48, z1), 0.05, 0.05);
    for (const [x, z] of [[x0, z0], [x1, z1]]) wood.box(x - 0.045, y, z - 0.045, x + 0.045, y + 1.0, z + 0.045);
  }

  const layers = zone.cast.filter((l) => l !== LAYER.REFLECT); // (nothing here is seen in the pond)
  const built = parts.toMeshes(world.materials, { name: 'companions', layers });
  built.updateMatrixWorld(true);
  for (const m of built.children) { m.matrixAutoUpdate = false; m.updateMatrix(); }
  group.add(built);

  // ---- a sign at the foot of the stair
  const S = WALL.stair, footAt = (S.at - 0.8), [fx, fz] = point(footAt, (FLIGHTS[0].lo + FLIGHTS[0].hi) / 2);
  const foot = { x: fx, y: S.foot, z: fz };
  let signPost = null;
  {
    const [gx, gz] = point(S.at - 6, eIn(0) - out(0.15)), [tx, tz] = NORTH.stairs[0].points.at(-1), yaw = Math.atan2(tx - gx, tz - gz), W = 1.6, H = 1.0;
    const sign = canvasBoard(512, 320, (ctx, w, h) => {
      const serif = "Georgia, 'Times New Roman', serif";
      const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#5b3d1c'); bg.addColorStop(0.5, '#6f4c22'); bg.addColorStop(1, '#3f2a12');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#2a1b0a'; ctx.lineWidth = 12; ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.strokeStyle = '#e2b24a'; ctx.lineWidth = 4; ctx.strokeRect(18, 18, w - 36, h - 36);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f6d98a'; ctx.font = `900 40px ${serif}`; ctx.fillText('THE WALL OF THE', w / 2, 66, w - 60); ctx.fillText('COMPANIONS', w / 2, 112, w - 60);
      ctx.fillStyle = '#e2b24a'; ctx.fillRect(w / 2 - 140, 142, 280, 3);
      ctx.fillStyle = '#f3e6c8'; ctx.font = `italic 600 25px ${serif}`;
      [`${WALL_COUNT} more plates, up the stair,`, 'on four galleries round the dog.'].forEach((t, i) => ctx.fillText(t, w / 2, 180 + i * 32, w - 60));
      ctx.fillStyle = '#ffe9a6'; ctx.font = `700 24px ${serif}`;
      ctx.fillText('A bare one can be yours.', w / 2, 262, w - 60);
    }, W, H, { both: true });
    const sy = E.y + 0.1;
    sign.mesh.position.set(gx, sy + 1.0 + H / 2, gz);
    sign.mesh.rotation.y = yaw;
    sign.mesh.name = 'companions:sign';
    group.add(sign.mesh);
    const post = new Parts();
    post.get('woodDark').tint(0.55, 0.42, 0.3, 1).place(gx, sy, gz, yaw).box(-W / 2 - 0.05, 0.95, -0.024, W / 2 + 0.05, 1.05 + H, -0.006, { tile: 1 }).box(-0.07, -0.3, -0.1, 0.07, 1.0, -0.03, { tile: 1 }).pop();
    group.add(post.toMeshes(world.materials, { name: 'companions-sign', layers }));
    signPost = [gx, gz];
  }

  // ---- the plates: a quad each, one mesh; the picture they are painted from is made when somebody comes near
  const COLS = 8, ROWS = phone ? 4 : 8, CELLS = COLS * ROWS, AW = COLS * CELL_W, AH = ROWS * CELL_H;
  const pos = new Float32Array(WALL_COUNT * 12), uv = new Float32Array(WALL_COUNT * 8), idx = [], centre = new Float32Array(WALL_COUNT * 3);
  for (let i = 0; i < WALL_COUNT; i++) {
    const p = plateAt(FIRST + i), rx = p.nz, rz = -p.nx, hw = PLATE.w / 2, hh = PLATE.h / 2; // (right, for whoever reads it)
    const c = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    c.forEach(([u, v], j) => { pos.set([p.x + rx * u, p.y + v, p.z + rz * u], i * 12 + j * 3); });
    centre.set([p.x, p.y, p.z], i * 3);
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const uvAttr = new THREE.BufferAttribute(uv, 2);
  uvAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('uv', uvAttr);
  geometry.setIndex(idx);
  geometry.computeBoundingSphere();
  const material = new THREE.MeshBasicMaterial({ toneMapped: false, color: BRONZE });
  const plates = new THREE.Mesh(geometry, material);
  plates.name = 'companions:plates';
  plates.matrixAutoUpdate = false;
  group.add(plates);

  const what = new Array(WALL_COUNT).fill(null), cellOf = new Int16Array(WALL_COUNT).fill(-1), holder = new Int16Array(CELLS).fill(-1), fresh = new Uint8Array(CELLS);
  let atlas = null, dirty = false, uploaded = 0, picked = 0, pickedAt = null, queue = [];
  const own = (w) => !!w && !w.taken; // (engraved, or waiting for approval: it needs a cell of its own to be read)
  const shownCell = (i) => { const w = what[i]; if (!w) return BARE; if (w.taken) return w.mine ? MINE : TAKEN; const c = cellOf[i]; return c >= 0 && fresh[c] ? c : FAR_CELL; };
  const setUV = (i, c) => {
    const col = c % COLS, row = Math.floor(c / COLS), u0 = (col * CELL_W + 1) / AW, u1 = ((col + 1) * CELL_W - 1) / AW, v1 = 1 - (row * CELL_H + 1) / AH, v0 = 1 - ((row + 1) * CELL_H - 1) / AH;
    uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
    uvAttr.needsUpdate = true;
  };
  const paintCell = (c, w, picture) => {
    const col = c % COLS, row = Math.floor(c / COLS), { ctx } = atlas;
    ctx.save(); ctx.beginPath(); ctx.rect(col * CELL_W, row * CELL_H, CELL_W, CELL_H); ctx.clip(); ctx.translate(col * CELL_W, row * CELL_H);
    drawPlate(ctx, w, picture);
    ctx.restore();
    dirty = true;
  };
  /** Paints pooled cell c for the plate that holds it; its picture, if it has one, comes after. */
  const paint = (c) => {
    const i = holder[c];
    if (i < 0) return;
    const w = what[i], logo = w?.logo;
    paintCell(c, w, logo && typeof logo !== 'string' ? logo : null);
    fresh[c] = 1; setUV(i, c);
    if (typeof logo !== 'string' || !logo) return;
    const mine = atlas;
    loadImage(logo).then((img) => { if (img && atlas === mine && holder[c] === i && what[i] === w) paintCell(c, w, img); });
  };
  const release = (c) => { const i = holder[c]; if (i >= 0) { cellOf[i] = -1; holder[c] = -1; fresh[c] = 0; setUV(i, shownCell(i)); } };
  /** The engraved plates nearest to the eye get the cells (the others show an engraved plate that cannot be read from there). */
  const pick = (cam) => {
    picked = performance.now(); pickedAt = { x: cam.x, y: cam.y, z: cam.z };
    const want = [];
    for (let i = 0; i < WALL_COUNT; i++) if (own(what[i])) want.push([(centre[i * 3] - cam.x) ** 2 + (centre[i * 3 + 1] - cam.y) ** 2 + (centre[i * 3 + 2] - cam.z) ** 2, i]);
    want.sort((p, q) => p[0] - q[0]);
    const keep = new Set(want.slice(0, CELLS - SHARED).map((w) => w[1]));
    for (let c = SHARED; c < CELLS; c++) if (holder[c] >= 0 && !keep.has(holder[c])) release(c);
    for (const i of keep) {
      if (cellOf[i] >= 0) continue;
      let c = SHARED;
      while (c < CELLS && holder[c] >= 0) c++;
      if (c >= CELLS) break;
      holder[c] = i; cellOf[i] = c; fresh[c] = 0; queue.push(c);
    }
  };
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = AW; canvas.height = AH;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    atlas = { canvas, ctx: canvas.getContext('2d'), texture };
    paintCell(BARE, null, null); paintCell(TAKEN, { taken: true }, null); paintCell(MINE, { taken: true, mine: true }, null); paintCell(FAR_CELL, AFAR, null);
    for (let i = 0; i < WALL_COUNT; i++) setUV(i, shownCell(i));
    material.map = texture; material.color.set(0xffffff); material.needsUpdate = true;
    texture.needsUpdate = true; dirty = false; uploaded = performance.now();
    picked = 0;
  };
  const drop = () => {
    for (let c = SHARED; c < CELLS; c++) { if (holder[c] >= 0) cellOf[holder[c]] = -1; holder[c] = -1; fresh[c] = 0; }
    queue = [];
    material.map = null; material.color.set(BRONZE); material.needsUpdate = true;
    atlas.texture.dispose();
    atlas.canvas.width = atlas.canvas.height = 1; // (its memory goes at once)
    atlas = null;
  };

  // ---- what one walks on, what one bumps into, where one may stand — all of it only while the wall is on
  let on = false;
  const near2 = (E.rx * 1.6) ** 2;
  for (const p of PIECES) {
    collision.addPlatform({
      clearance: p.kind === 'flight' && p.g === 0 ? 4 : 1.0, // (the lowest flight stands on the floor: one cannot walk into its side)
      heightAt: (x, z) => (on && (x - E.x) ** 2 + (z - E.z) ** 2 < near2 ? heightOn(p, x, z) : null),
    });
  }
  const posts = wallPosts().map(([x, z, r, y0, y1]) => ({ handle: collision.addCircle(x, z, r, 1e9, y1), y0 }));
  if (signPost) posts.push({ handle: collision.addCircle(signPost[0], signPost[1], 0.3, 1e9, 1e9), y0: -1e9 });
  const ground = new Polygon(outline(), { name: 'companions' });
  collision.addArea({ name: 'companions', cave: false, contains: (x, z) => on && ground.contains(x, z), nearest: (x, z, q) => (on ? ground.nearest(x, z, q) : Infinity) });

  const k = phone ? 0.6 : 1, mid = point((WALL.from + WALL.to) / 2, 1.1);
  return {
    group, first: FIRST, count: WALL_COUNT, foot,
    get on() { return on; },
    /** On: drawn, walked on, bumped into; off: none of it (the plates sold keep what they hold). */
    setOn(v) {
      on = !!v;
      for (const p of posts) p.handle[3] = on ? p.y0 : 1e9;
      if (!on) { group.visible = false; if (atlas) drop(); }
    },
    columnAt: (x, z, y) => (on ? columnAt(x, z, y) : null),
    ids: ({ g, k: col }) => idsOf(g, col),
    where: (n) => plateAt(n),
    /** Is (x, z, y) somewhere on the wall — on a gallery or the stair, above the floor of the ledge? */
    holds(x, z, y) {
      if (y < E.y + 1.2) return false;
      return PIECES.some((p) => { const h = heightOn(p, x, z); return h !== null && Math.abs(h - y) < 1.5; });
    },
    set(n, w) {
      const i = n - FIRST;
      if (!(i >= 0 && i < WALL_COUNT)) return;
      what[i] = w || null;
      const c = cellOf[i];
      if (c >= 0) { if (own(what[i])) { fresh[c] = 0; if (!queue.includes(c)) queue.push(c); } else release(c); }
      setUV(i, shownCell(i));
      if (own(what[i]) && c < 0) picked = 0; // (a plate engraved: the cells are given out again)
    },
    peek: (n) => what[n - FIRST] ?? null,
    /** (for the tests) which cell plate n is drawn from: 0 bare, 1 somebody's, 2 yours, 3 engraved but too far — or its own */
    shown: (n) => (atlas ? shownCell(n - FIRST) : -1),
    get painted() { return !!atlas; },
    /** Every frame: drawn while near enough, the picture made when somebody comes near, its cells handed out and painted a few at a time. */
    update(cam) {
      if (!on) return;
      const d2 = (cam.x - mid[0]) ** 2 + (cam.z - mid[1]) ** 2;
      group.visible = d2 < (HIDE * k) ** 2;
      if (!atlas) { if (d2 < NEAR * NEAR) make(); else return; }
      if (d2 > FAR * FAR) { drop(); return; }
      const now = performance.now();
      if (now - picked > 600 || !pickedAt || (cam.x - pickedAt.x) ** 2 + (cam.y - pickedAt.y) ** 2 + (cam.z - pickedAt.z) ** 2 > 4) pick(cam);
      for (let n = 0; n < 3 && queue.length; n++) paint(queue.shift());
      if (dirty && now - uploaded > 350) { atlas.texture.needsUpdate = true; dirty = false; uploaded = now; }
    },
  };
}

/** What of [lo, hi] is left once the spans are taken out: [[lo, hi], …]. */
function spans(lo, hi, taken) {
  const left = [];
  let at = lo;
  for (const [a, b] of taken.slice().sort((p, q) => p[0] - q[0])) { if (a > at + 1e-6) left.push([at, Math.min(a, hi)]); at = Math.max(at, b); }
  if (hi > at + 1e-6) left.push([at, hi]);
  return left.filter(([a, b]) => b - a > 1e-4);
}
void place; void eOut; void R;
