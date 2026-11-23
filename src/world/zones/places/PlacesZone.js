// Places reached from the valley: the stairway cut in the rock and the temple high above, the terraces over
// the great waterfall, the island and its winding path, the camp and its hammocks, the beanbags of the beach
// and of the deck on the pond, the secret cove and the fall that drops from the cliffs into the sea, the
// golden cove further up the coast and the dog that sits above it.
// Each place is merged into one mesh per material and hidden when too far to matter.
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';
import { staticCaster, LAYER } from '../../../render/Shadows.js';
import { mergeStatic, distanceCuller } from '../../props/StaticBatch.js';
import { stairs, wall, footbridge } from '../../props/Structures.js';
import { Corridor, Polygon } from '../../Areas.js';
import { buildCave } from './Caves.js';
import { buildTemple } from './Temple.js';
import { fallsRibbon } from '../../water/Falls.js';
import { canvasBoard } from '../games/Boards.js';
import { seatAt } from '../../../player/PlayerController.js';
import { ANIM } from '../../../player/Character.js';
import { statueGeometry, goldMaterial } from './GoldenDog.js';
import { buildPlaques } from './Plaques.js';
import { PLAQUE_COUNT } from '../../layout/sponsors.js';
import { STAIRWAY, VILLAGE, FALLS, COVE, ISLAND, islandPath, CAMP, BEACH_LOUNGE, POND_DECK, LEVELS, CAVES, GLADE, NORTH } from '../../layout/layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// hammock and tent cloths
const POUF = [[0.75, 0.12, 0.1], [0.9, 0.62, 0.08], [0.07, 0.42, 0.44], [0.86, 0.34, 0.5], [0.16, 0.3, 0.68], [0.85, 0.36, 0.08], [0.3, 0.55, 0.2], [0.5, 0.25, 0.6], [0.88, 0.82, 0.7], [0.1, 0.55, 0.7]];
// beanbag chairs: as bright as sweets
const CANDY = [[0.95, 0.24, 0.5], [0.16, 0.5, 0.95], [0.28, 0.78, 0.2], [0.58, 0.26, 0.9], [1.0, 0.5, 0.08], [1.0, 0.82, 0.14], [0.95, 0.16, 0.12], [0.2, 0.82, 0.78]];
const scaled = (sx, sy, sz) => new THREE.Matrix4().makeScale(sx, sy, sz);

/**
 * Beanbag chair: a cushion to sit on and a taller one to lean against. (x, z) is where one sits, facing `yaw`;
 * the seat is 0.235 m above y. Made for the avatar's sitting pose: thighs on the cushion, feet on the ground.
 */
const CHAIR_SEAT = 0.235;
function beanbagChair(b, x, y, z, yaw, color, size = 1) {
  const k = 0.9 + 0.2 * ((color[0] * 7 + color[2] * 3) % 1);
  b.place(x, y, z, yaw);
  b.tint(color[0], color[1], color[2], 1);
  b.push(new THREE.Matrix4().makeTranslation(0, 0, -0.2 * size).multiply(scaled(size, 1, 0.82 * size)));
  b.lathe([[0.03, 0.0], [0.34, 0.0], [0.42, 0.06], [0.43, 0.15], [0.37, 0.215], [0.2, CHAIR_SEAT], [0.0, CHAIR_SEAT + 0.005]], 12, { tile: 1 });
  b.pop();
  b.tint(color[0] * 0.86 * k, color[1] * 0.86 * k, color[2] * 0.86 * k, 1);
  b.push(new THREE.Matrix4().makeTranslation(0, 0, -0.47 * size).multiply(scaled(1.08 * size, 1, 0.6 * size)));
  b.lathe([[0.03, 0.0], [0.33, 0.0], [0.4, 0.1], [0.41, 0.36], [0.37, 0.6], [0.26, 0.76], [0.1, 0.84], [0.0, 0.85]], 12, { tile: 1 });
  b.pop();
  b.pop();
}

/** A parasol: pole, canopy in two colours, a little finial. */
function parasol(parts, x, y, z, color, r = 1.7) {
  const pole = parts.get('woodDark'), cloth = parts.get('doubleSided');
  pole.tint(1.3, 1.25, 1.15, 1).rod(V(x, y - 0.3, z), V(x, y + 2.5, z), 0.035, 6);
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2, k = i % 2 ? 1 : 0.82;
    cloth.tint(color[0] * k, color[1] * k, color[2] * k, 1).tri(V(x, y + 2.52, z), V(x + Math.cos(a0) * r, y + 2.05, z + Math.sin(a0) * r), V(x + Math.cos(a1) * r, y + 2.05, z + Math.sin(a1) * r), { tile: 1 });
  }
}

/** A string of lights between two points, sagging, a bulb every 0.9 m. */
function lightString(parts, a, c, sag = 0.5) {
  const wire = parts.get('woodDark'), bulbs = parts.get('glow');
  const n = Math.max(3, Math.round(a.distanceTo(c) / 0.9));
  let prev = a;
  wire.tint(0.1, 0.1, 0.1, 1);
  for (let i = 1; i <= n; i++) {
    const t = i / n, p = a.clone().lerp(c, t);
    p.y -= Math.sin(Math.PI * t) * sag;
    wire.rod(prev, p, 0.008, 3, { caps: false });
    if (i < n) bulbs.tint(1, 0.84 + 0.1 * (i % 2), 0.5 + 0.2 * (i % 3), 1).place(p.x, p.y - 0.06, p.z).lathe([[0.0, -0.05], [0.045, -0.02], [0.045, 0.02], [0.0, 0.05]], 5).pop();
    prev = p;
  }
}

/**
 * The alligator: lounging in a beanbag chair like everybody else, a drink in its hand. Modelled in the frame
 * of its chair (it sits at the origin, facing +Z).
 */
function alligator(b, x, y, z, yaw) {
  const G = [0.24, 0.5, 0.2], BELLY = [0.75, 0.78, 0.5], DARK = [0.14, 0.32, 0.13];
  b.place(x, y, z, yaw);
  const blob = (px, py, pz, sx, sy, sz, c, pitch = 0) => {
    b.tint(c[0], c[1], c[2], 1);
    b.push(new THREE.Matrix4().makeTranslation(px, py, pz).multiply(new THREE.Matrix4().makeRotationX(pitch)).multiply(scaled(sx, sy, sz)));
    b.lathe([[0.0, -1], [0.55, -0.82], [0.9, -0.4], [1.0, 0.0], [0.9, 0.4], [0.55, 0.82], [0.0, 1]], 9, { tile: 1 });
    b.pop();
  };
  blob(0, 0.55, -0.16, 0.25, 0.36, 0.2, G, -0.3); // body, leaning back
  blob(0, 0.52, -0.05, 0.19, 0.3, 0.1, BELLY, -0.3); // pale belly
  blob(0, 0.98, -0.2, 0.2, 0.15, 0.2, G); // head
  blob(0, 0.95, 0.12, 0.13, 0.065, 0.27, G); // snout, upper jaw
  blob(0, 0.875, 0.1, 0.115, 0.04, 0.24, BELLY); // lower jaw
  for (const s of [-1, 1]) {
    blob(s * 0.095, 1.11, -0.14, 0.06, 0.06, 0.06, G); // eye bumps
    blob(s * 0.095, 1.125, -0.1, 0.035, 0.035, 0.03, [0.95, 0.9, 0.3]); // eyes
    blob(s * 0.095, 1.125, -0.075, 0.012, 0.03, 0.012, [0.02, 0.02, 0.02]);
    blob(s * 0.05, 0.99, 0.37, 0.022, 0.018, 0.022, DARK); // nostrils
    for (let i = 0; i < 4; i++) blob(s * 0.115, 0.905, 0.03 + i * 0.085, 0.014, 0.028, 0.014, [0.97, 0.97, 0.92]); // teeth
    // legs: thighs on the cushion, feet out in front; arms on the belly
    blob(s * 0.17, 0.3, 0.1, 0.08, 0.08, 0.2, G);
    blob(s * 0.18, 0.12, 0.3, 0.07, 0.13, 0.07, G);
    blob(s * 0.18, 0.03, 0.38, 0.075, 0.03, 0.12, DARK);
    blob(s * 0.25, 0.62, 0.0, 0.055, 0.055, 0.18, G, s > 0 ? -0.5 : 0.2);
  }
  for (let i = 0; i < 6; i++) blob(0, 0.86 - i * 0.1, -0.33 - i * 0.012, 0.035, 0.05, 0.03, DARK); // ridge down the back
  // the tail, curling round on the deck to the left
  for (let i = 0; i < 7; i++) { const a = i * 0.42; blob(-0.2 - Math.sin(a) * 0.5, 0.09 - i * 0.008, -0.2 + (1 - Math.cos(a)) * 0.5, 0.13 - i * 0.014, 0.09 - i * 0.009, 0.16, i % 2 ? DARK : G, 0); }
  // a drink in the right hand: a glass, something orange, a straw
  b.tint(0.92, 0.95, 0.97, 1).place(0.27, 0.68, 0.15).lathe([[0.03, 0.0], [0.045, 0.11]], 7).pop();
  b.tint(1.0, 0.55, 0.1, 1).place(0.27, 0.69, 0.15).lathe([[0.0, 0.0], [0.028, 0.0], [0.04, 0.085], [0.0, 0.085]], 7).pop();
  b.tint(0.9, 0.15, 0.2, 1).rod(V(0.27, 0.72, 0.15), V(0.3, 0.86, 0.17), 0.006, 4);
  // sunglasses
  b.tint(0.03, 0.03, 0.04, 1).box(-0.15, 1.1, -0.085, 0.15, 1.15, -0.07);
  b.pop();
}

/** Low table: a slice of trunk on a stump. */
function lowTable(parts, x, y, z, r = 0.45) {
  const w = parts.get('woodDark');
  w.tint(0.95, 0.88, 0.78, 1).cylinder(x, y, z, r * 0.42, r * 0.38, 0.3, 8);
  w.tint(1.1, 1.02, 0.9, 1).cylinder(x, y + 0.3, z, r, r, 0.06, 12, { capBottom: true });
}

/** Lantern on a post (the glass glows). */
function lantern(parts, x, y, z, h = 2.1) {
  const p = parts.get('woodDark'), g = parts.get('glow'); // (dark wood rather than iron: one material less to draw)
  p.tint(0.16, 0.15, 0.14, 1).rod(V(x, y - 0.2, z), V(x, y + h, z), 0.035, 6);
  p.box(x - 0.1, y + h, z - 0.1, x + 0.1, y + h + 0.03, z + 0.1);
  p.box(x - 0.12, y + h + 0.27, z - 0.12, x + 0.12, y + h + 0.31, z + 0.12);
  g.tint(1, 0.82, 0.5, 1).box(x - 0.075, y + h + 0.03, z - 0.075, x + 0.075, y + h + 0.27, z + 0.075);
}

export class PlacesZone {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'zone:places';
    this.cast = staticCaster(world.engine.tier);
    this.colliders = [];
    this.platforms = [];
    this.areas = [];
    this.holes = []; // openings to cut in the terrain (cave mouths)
    this.npcs = []; // characters to talk to: { id, name, x, y (where its bubble goes), z, reach }
    this.animated = [];
    this.seats = world.seats;
    this.ground = (x, z) => this.data.heightAt(x, z);
    this._roots = {}; // place → groups to merge
  }

  /** Turn a Parts set into meshes belonging to `place` (optionally placed at a frame). */
  _add(place, parts, frame = null, y = 0, layers = this.cast) {
    const g = parts.toMeshes(this.world.materials, { name: place, layers });
    if (frame) { g.position.set(frame.x, y, frame.z); g.rotation.y = frame.yaw || 0; }
    g.updateMatrixWorld(true);
    (this._roots[place] ||= []).push(g);
    this.group.add(g);
  }

  build() {
    this._stairs(STAIRWAY, 'stairway', { stones: true });
    this._temple();
    this._terraces();
    this._glade();
    this._cove();
    this._north();
    this._seaFall();
    this._island();
    this._camp();
    this._beach();
    this._deck();
    for (const cave of CAVES) {
      const parts = new Parts();
      const { corridor, hole } = buildCave(parts, cave, this);
      this.areas.push(corridor);
      this.holes.push(hole);
      this._add(`cave-${cave.id}`, parts, null, 0, []); // (underground: no shadow to cast, nothing to mirror)
    }
    this.group.updateMatrixWorld(true);
    for (const [place, roots] of Object.entries(this._roots)) this.group.add(mergeStatic(roots, place));
    this.group.updateMatrixWorld(true);
    // only the deck itself is worth drawing a second time for the mirror of the pond
    this.group.traverse((o) => { if (o.isMesh && !/^deck:(woodDeck|woodWet)$/.test(o.name)) o.layers.disable(LAYER.REFLECT); });
    // the village and its stairway are landmarks; furniture and small things go with distance
    const k = this.world.engine.tier.phone ? 0.6 : 1; // furniture goes sooner on a phone
    this._cull = distanceCuller(this.group, [
      [/^temple:(slate|matte|paint|granite)$/, Infinity], [/^temple:/, 420 * k], [/^stairway:rock$/, Infinity], [/^stairway:/, 420 * k],
      [/^terraces:rock$/, 600 * k], [/^terraces:/, 260 * k], [/^glade:/, 240 * k], [/^cove:/, 260 * k], [/^seafall/, Infinity],
      [/^golden:(rock|granite)$/, 700 * k], [/^golden:/, 300 * k], // (the dog itself is a landmark: never hidden)
      [/^cave-\w+:cave$/, 170 * k], [/^cave-/, 80 * k], [/^island:/, 340 * k], [/^camp/, 230 * k], [/^beach:/, 280 * k], [/^deck:(woodDeck|woodWet)$/, 520 * k], [/^deck:/, 240 * k],
    ]);
    return this;
  }

  // ---------------------------------------------------------------------------
  // Stairways: flights of steps cut in the rock, a landing at each corner (see STAIRWAY and FALLS.stairs)

  _stairs(def, place, { stones = false } = {}) {
    const parts = new Parts();
    const rock = parts.get('rock'), slab = parts.get('granite');
    const pts = def.points, w = def.width, L = def.landing;
    const nodes = [];
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, az, ay] = pts[k], [bx, bz, by] = pts[k + 1];
      const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
      const a = V(ax + dx * L, ay, az + dz * L), b = V(bx - dx * L, by, bz - dz * L);
      rock.tint(0.92, 0.9, 0.87, 1);
      this.platforms.push(stairs(rock, a, b, w, { steps: Math.round((by - ay) / 0.19), tile: 1.6 }));
      if (k === 0) nodes.push([ax, az, 1.5]);
      nodes.push([a.x, a.z, w / 2 - 0.2], [b.x, b.z, w / 2 - 0.2], [bx, bz, 1.55]);
    }
    // landings: worn slabs, and a boulder on the outer side of each turn
    for (let k = 0; k < pts.length; k++) {
      const [x, z, y] = pts[k];
      slab.tint(0.78 + 0.05 * (k % 2), 0.76, 0.72, 1).cylinder(x, y - 0.4, z, L + 0.35, L + 0.3, 0.42, 9);
      this.platforms.push({ type: 'disc', x, z, r: L + 0.3, y: y + 0.02, clearance: 1.2 });
      if (k > 0 && k < pts.length - 1) {
        // away from both flights
        const p = pts[k - 1], n = pts[k + 1];
        let ox = 2 * x - p[0] - n[0], oz = 2 * z - p[1] - n[1];
        const l = Math.hypot(ox, oz) || 1; ox /= l; oz /= l;
        rock.tint(0.8, 0.78, 0.74, 0.9).place(x + ox * (L + 0.9), y + 0.1, z + oz * (L + 0.9), k * 1.3, 0.2, 0.15).cube(0, 0.2, 0, 1.1, 1.0, 0.9, { tile: 1.6 }).pop();
        this.colliders.push({ type: 'circle', x: x + ox * (L + 0.9), z: z + oz * (L + 0.9), r: 0.7 });
      }
    }
    if (stones) {
      // at the foot: two standing stones mark the way up
      const [fx, fz] = pts[0], [nx, nz] = pts[1];
      const l0 = Math.hypot(nx - fx, nz - fz), tx = (nx - fx) / l0, tz = (nz - fz) / l0;
      for (const s of [-1, 1]) {
        const px = fx - tx * 1.2 + -tz * s * 2.0, pz = fz - tz * 1.2 + tx * s * 2.0, gy = this.ground(px, pz);
        rock.tint(0.86, 0.84, 0.8, 1).place(px, gy - 0.3, pz, 0.4 * s, 0.05 * s, 0).box(-0.32, 0, -0.26, 0.32, 2.3, 0.26, { tile: 1.6 }).box(-0.2, 2.3, -0.16, 0.2, 2.6, 0.16, { tile: 1.6 }).pop();
        this.colliders.push({ type: 'circle', x: px, z: pz, r: 0.45 });
      }
    }
    this.areas.push(new Corridor(nodes, { name: place }));
    this._add(place, parts);
  }

  // ---------------------------------------------------------------------------
  // The temple on the mountain (see Temple.js), and the lookout over the valley at its edge

  _temple() {
    const y = VILLAGE.y + 0.04;
    const parts = new Parts();
    const built = buildTemple(parts, VILLAGE, y, this.ground);
    this.colliders.push(...built.colliders);
    this.platforms.push(...built.platforms);
    {
      // the lookout: a low dry-stone wall along the edge above the valley, benches facing the view
      const dry = parts.get('stone'), cap = parts.get('granite');
      for (const line of [VILLAGE.wall, VILLAGE.wall2]) {
        dry.tint(1, 1, 1, 1); cap.tint(0.84, 0.83, 0.8, 1);
        wall(dry, line.map(([x, z]) => [x, z, y + 0.82]), { thickness: 0.55, groundAt: this.ground, depth: 1.2, tile: 2, cap });
        for (let k = 0; k + 1 < line.length; k++) {
          const [ax, az] = line[k], [bx, bz] = line[k + 1], len = Math.hypot(bx - ax, bz - az);
          this.colliders.push({ type: 'box', x: (ax + bx) / 2, z: (az + bz) / 2, hw: len / 2 + 0.2, hl: 0.34, yaw: Math.atan2(-(bz - az), bx - ax) });
        }
      }
      const stone = parts.get('granite');
      for (const bz of [47.5, 42.5, 37.5]) this._bench(stone, -355.1, y, bz, Math.PI / 2);
      this._bench(stone, -355.1, y, 22.5, Math.PI / 2);
    }
    {
      // places to sit, all over: round cushions before the great hall and round the lotus pond, a bench on
      // each side of the door of every pavilion, benches by the bell, the stupa and the prayer wheels
      const T = VILLAGE.temple, stone = parts.get('granite'), cloth = parts.get('matte');
      const cushion = (x, z, yaw, k) => {
        const c = k % 2 ? [0.5, 0.08, 0.07] : [0.95, 0.5, 0.06];
        cloth.tint(c[0], c[1], c[2], 1).place(x, y, z, k * 1.7).lathe([[0.0, 0.0], [0.3, 0.0], [0.37, 0.07], [0.37, 0.16], [0.29, 0.225], [0.0, 0.24]], 10, { tile: 1 }).pop();
        this.seats.push(seatAt(x, y + CHAIR_SEAT, z, yaw, { reach: 1.4 }));
      };
      // (in two groups, left and right of the way up to the hall; they look at it)
      const hx = T.hall.x + T.hall.plinth + 3.4;
      [-5.6, -4.5, -3.4, 3.4, 4.5, 5.6].forEach((o, k) => { cushion(hx, T.hall.z + o, -Math.PI / 2, k); cushion(hx + 1.3, T.hall.z + o + 0.2, -Math.PI / 2, k + 1); });
      const F = VILLAGE.fountain;
      for (let k = 0; k < 6; k++) { const a = 0.5 + (k / 6) * Math.PI * 2, x = F.x + Math.sin(a) * 4.1, z = F.z + Math.cos(a) * 4.1; cushion(x, z, a + Math.PI, k); }
      for (const p of T.pavilions) {
        const c = Math.cos(p.yaw || 0), sn = Math.sin(p.yaw || 0), out = p.w / 2 + 0.85;
        for (const side of [-1, 1]) { const lz = side * (p.l / 4 + 0.75); this._bench(stone, p.x + out * c + lz * sn, y, p.z - out * sn + lz * c, (p.yaw || 0) + Math.PI / 2); }
      }
      const towards = (o, d, turn) => { const a = (o.yaw || 0) + turn; this._bench(stone, o.x + Math.sin(a) * d, y, o.z + Math.cos(a) * d, a + Math.PI); };
      towards(T.bell, 3.6, 1.9); // facing the bell
      towards(T.stupa, 3.9, 2.6);
      towards(T.wheels, 2.9, 0); // in front of the prayer wheels
    }
    this.areas.push(new Polygon(VILLAGE.outline, { name: 'temple' }));
    this._add('temple', parts);
  }

  // ---------------------------------------------------------------------------
  // Above the great waterfall: three terraces, a pool of the torrent on each, steps from one to the next

  _terraces() {
    FALLS.stairs.forEach((st) => this._stairs(st, 'terraces'));
    const parts = new Parts();
    FALLS.levels.forEach((t, k) => {
      // (the lowest terrace reaches the brink of the great fall: one can leap from it into the pool below)
      const bank = k === 0 ? [...t.bank, [-280.5, 127.5], [-280.5, 121.5]] : t.bank;
      this.areas.push(new Polygon(bank, { name: 'terraces' }));
    });
    // a cairn where each flight arrives, a lantern by each pool
    const rock = parts.get('rock');
    for (const st of FALLS.stairs) {
      const [x, z, y] = st.points[st.points.length - 1], p = st.points[st.points.length - 2];
      const l = Math.hypot(x - p[0], z - p[1]), sx = -(z - p[1]) / l, sz = (x - p[0]) / l;
      const cx = x + sx * 2.4, cz = z + sz * 2.4;
      for (let i = 0; i < 4; i++) rock.tint(0.9 - 0.04 * i, 0.88 - 0.04 * i, 0.84, 1).place(cx, y - 0.1 + i * 0.3, cz, i * 1.1).cube(0, 0.15, 0, 0.62 - i * 0.12, 0.3, 0.5 - i * 0.09, { tile: 1.2 }).pop();
      this.colliders.push({ type: 'circle', x: cx, z: cz, r: 0.45 });
      lantern(parts, x - sx * 2.3, y, z - sz * 2.3, 2.0);
    }
    // on the top terrace: a stone bench that looks down the three falls
    const S = FALLS.seat;
    this._bench(parts.get('granite'), S.x, FALLS.levels[2].y, S.z, S.yaw);
    this._add('terraces', parts);
  }

  // ---------------------------------------------------------------------------
  // The high clearing, above and behind the falls: a meadow ringed by woods, the lake the torrent rises in.
  // A fire with logs round it, benches that look at the water, two hammocks at the edge of the wood.

  _glade() {
    const G = GLADE, parts = new Parts(), wood = parts.get('woodDark'), rock = parts.get('rock');
    // where one walks: the whole meadow, its lake included (it is shallow)
    const edge = [];
    for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2; edge.push([G.x + Math.cos(a) * G.rx * 0.97, G.z + Math.sin(a) * G.rz * 0.97]); }
    this.areas.push(new Polygon(edge, { name: 'glade' }));
    // the fire: a ring of stones, four logs to sit on
    const [cx, cz] = G.fire, cy = this.ground(cx, cz);
    for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; rock.tint(0.82 + 0.06 * (k % 2), 0.8, 0.76, 1).place(cx + Math.cos(a) * 0.8, cy - 0.05, cz + Math.sin(a) * 0.8, a * 1.7).cube(0, 0.1, 0, 0.34, 0.26, 0.28, { tile: 1 }).pop(); }
    wood.tint(0.26, 0.22, 0.2, 1);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI + 0.4; wood.rod(V(cx - Math.cos(a) * 0.5, cy + 0.08, cz - Math.sin(a) * 0.5), V(cx + Math.cos(a) * 0.5, cy + 0.3, cz + Math.sin(a) * 0.5), 0.085, 6); }
    parts.get('glow').tint(1, 0.5, 0.14, 1).cylinder(cx, cy + 0.12, cz, 0.27, 0.02, 0.7, 6, { capTop: false });
    this.colliders.push({ type: 'circle', x: cx, z: cz, r: 0.95 });
    for (let k = 0; k < 4; k++) {
      const a = 0.5 + (k / 4) * Math.PI * 2, lx = cx + Math.sin(a) * 2.5, lz = cz + Math.cos(a) * 2.5, ly = this.ground(lx, lz), tx = Math.cos(a), tz = -Math.sin(a);
      wood.tint(0.62, 0.52, 0.4, 1).rod(V(lx - tx * 0.95, ly + 0.2, lz - tz * 0.95), V(lx + tx * 0.95, ly + 0.2, lz + tz * 0.95), 0.2, 8);
      for (const o of [-0.45, 0.45]) this.seats.push(seatAt(lx + tx * o, ly + 0.4, lz + tz * o, a + Math.PI));
      this.colliders.push({ type: 'box', x: lx, z: lz, hw: 0.95, hl: 0.2, yaw: a, y0: ly - 1, y1: ly + 0.45 });
    }
    // benches by the lake, looking at it
    const stone = parts.get('granite'), lake = [-364, 190.5];
    for (const [bx, bz] of [[-353.6, 189.6], [-358.4, 200.2], [-371.5, 183.0]]) this._bench(stone, bx, this.ground(bx, bz), bz, Math.atan2(lake[0] - bx, lake[1] - bz));
    // two hammocks at the edge of the wood, lanterns where the steps arrive and by the fire
    this._hammock(parts, -338.6, 196.5, 0.3, POUF[2]);
    this._hammock(parts, -345.5, 207.2, 1.35, POUF[5]);
    const top = FALLS.stairs[FALLS.stairs.length - 1].points.at(-1);
    for (const [lx, lz] of [[top[0] + 2.6, top[1] + 1.6], [cx + 3.4, cz - 2.6], [-361.5, 203.5]]) { lantern(parts, lx, this.ground(lx, lz), lz, 2.0); this.colliders.push({ type: 'circle', x: lx, z: lz, r: 0.14 }); }
    this._add('glade', parts);
  }


  // ---------------------------------------------------------------------------
  // The golden cove (see NORTH): a pocket of sand under the sea cliffs that one swims to, a stair cut across
  // the face of the cliff, and on the ledge at its top a golden dog fifteen metres tall, sitting on a round
  // plinth, looking out over the bay. Its name is on the plinth.

  _north() {
    const N = NORTH, S = N.statue, parts = new Parts();
    const stone = parts.get('granite'), wood = parts.get('woodDark'), paint = parts.get('paint'), dry = parts.get('stone');
    const GOLD = [1.5, 1.05, 0.25];
    const ellipse = (E, k, n = 28) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [E.x + Math.cos(a) * E.rx * k, E.z + Math.sin(a) * E.rz * k]; });
    // where one walks: the sand, the stair (see _stairs), the ledge
    this.areas.push(new Polygon(ellipse(N.cove, 0.97), { name: 'golden' }), new Polygon(ellipse(N.ledge, 0.955), { name: 'golden' }));
    N.stairs.forEach((st) => this._stairs(st, 'golden'));
    const st = N.stairs[0];
    let steps = 0;
    // a rope on the side of the drop, from post to post, all the way up; a lantern against the rock at each landing
    for (let k = 0; k + 1 < st.points.length; k++) {
      const [ax, az, ay] = st.points[k], [bx, bz, by] = st.points[k + 1];
      const len = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / len, tz = (bz - az) / len, run = len - 2 * st.landing;
      steps += Math.round((by - ay) / 0.19);
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, o = st.width / 2 + 2.2;
      const side = this.ground(mx - tz * o, mz + tx * o) < this.ground(mx + tz * o, mz - tx * o) ? 1 : -1; // the side that falls away
      const sx = -tz * side, sz = tx * side, off = st.width / 2 + 0.1, n = Math.max(2, Math.round(run / 2.7));
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const d = st.landing + (run * i) / n, p = V(ax + tx * d + sx * off, ay + (by - ay) * (i / n), az + tz * d + sz * off);
        wood.tint(0.8, 0.72, 0.6, 1).box(p.x - 0.06, p.y - 0.6, p.z - 0.06, p.x + 0.06, p.y + 1.05, p.z + 0.06, { tile: 1 });
        if (prev) {
          wood.tint(1.5, 1.3, 0.95, 1);
          let q0 = prev.clone().setY(prev.y + 0.98);
          for (let j = 1; j <= 4; j++) { const q = prev.clone().lerp(p, j / 4); q.y += 0.98 - Math.sin((j / 4) * Math.PI) * 0.14; wood.rod(q0, q, 0.022, 4, { caps: false }); q0 = q; }
        }
        prev = p;
      }
      if (k + 2 < st.points.length) lantern(parts, bx - sx * (st.landing + 0.55), by, bz - sz * (st.landing + 0.55), 2.0);
    }
    {
      // on the sand: the prints of four very large paws, from the water to the foot of the stair; a sign there
      const C = N.cove, y = C.y + 0.012, [fx, fz] = st.points[0];
      const from = [C.x + 3.4, C.z + 5.6], to = [fx - 1.5, fz + 1.7], dx = to[0] - from[0], dz = to[1] - from[1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
      paint.tint(GOLD[0], GOLD[1], GOLD[2], 1);
      for (let k = 0; k < 5; k++) {
        const s = k % 2 ? 0.62 : -0.62, px = from[0] + dx * (k / 4) - uz * s, pz = from[1] + dz * (k / 4) + ux * s;
        paint.place(px, y, pz, Math.atan2(ux, uz));
        paint.cylinder(0, 0, 0, 0.34, 0.34, 0.012, 12);
        for (const [tx, tz] of [[-0.36, 0.3], [-0.13, 0.5], [0.13, 0.5], [0.36, 0.3]]) paint.cylinder(tx, 0, tz, 0.125, 0.125, 0.012, 9);
        paint.pop();
      }
      const sgx = fx + 2.3, sgz = fz + 1.3, yaw = Math.atan2(C.x - sgx, C.z - sgz), W = 1.7, H = 1.0;
      const sign = canvasBoard(512, 300, (ctx, w, h) => {
        const serif = "Georgia, 'Times New Roman', serif";
        ctx.fillStyle = '#3b2616'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#e9b949'; ctx.lineWidth = 7; ctx.strokeRect(12, 12, w - 24, h - 24);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f6d98a'; ctx.font = `900 92px ${serif}`; ctx.fillText(`${steps} STEPS`, w / 2, 100, w - 60);
        ctx.fillStyle = '#f3e6c8'; ctx.font = `italic 600 44px ${serif}`; ctx.fillText('to the best dog ever', w / 2, 182, w - 50);
        ctx.fillStyle = '#e9b949'; ctx.font = `700 46px ${serif}`; ctx.fillText('▲', w / 2, 246);
      }, W, H);
      const sy = this.ground(sgx, sgz);
      sign.mesh.position.set(sgx, sy + 1.25 + H / 2, sgz);
      sign.mesh.rotation.y = yaw;
      sign.mesh.name = 'golden:sign';
      this.group.add(sign.mesh);
      wood.tint(0.55, 0.42, 0.3, 1).place(sgx, sy, sgz, yaw).box(-W / 2 - 0.05, 1.2, -0.06, W / 2 + 0.05, 1.3 + H, -0.012, { tile: 1 }).box(-0.07, -0.4, -0.16, 0.07, 1.3 + H, -0.06, { tile: 1 }).pop();
      this.colliders.push({ type: 'circle', x: sgx, z: sgz, r: 0.3 });
    }
    // ---- the ledge: a round plinth, the dog on it, its name on a tablet at the front
    const E = N.ledge, y0 = E.y, PH = 2.0, PR = 7.05;
    stone.tint(0.88, 0.86, 0.82, 1).place(S.x, y0, S.z, S.yaw);
    stone.lathe([[PR + 0.3, -0.7], [PR + 0.3, 0.3], [PR, 0.44], [PR, PH - 0.4], [PR + 0.22, PH - 0.28], [PR + 0.22, PH - 0.06], [PR + 0.05, PH], [0, PH]], 44, { tile: 2 });
    // (the tablet: a block that stands out of the drum, a moulding over it)
    stone.tint(0.8, 0.78, 0.74, 1).box(-2.5, -0.3, PR - 0.6, 2.5, PH - 0.22, PR + 0.42, { tile: 2 });
    stone.tint(0.9, 0.88, 0.84, 1).box(-2.66, PH - 0.22, PR - 0.6, 2.66, PH + 0.02, PR + 0.56, { tile: 2 });
    stone.pop();
    const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw); // the way it looks
    this.colliders.push({ type: 'circle', x: S.x, z: S.z, r: PR + 0.42 }, { type: 'box', x: S.x + fx * (PR + 0.1), z: S.z + fz * (PR + 0.1), hw: 2.75, hl: 0.55, yaw: S.yaw });
    const plaque = canvasBoard(1024, 400, (ctx, w, h) => {
      const serif = "Georgia, 'Times New Roman', serif";
      // bronze, darker at the edges; a raised border; letters of polished gold
      const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#5b3d1c'); bg.addColorStop(0.5, '#6f4c22'); bg.addColorStop(1, '#3f2a12');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#2a1b0a'; ctx.lineWidth = 16; ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.strokeStyle = '#e2b24a'; ctx.lineWidth = 6; ctx.strokeRect(24, 24, w - 48, h - 48);
      ctx.strokeStyle = '#a9792a'; ctx.lineWidth = 2; ctx.strokeRect(36, 36, w - 72, h - 72);
      const gold = (y0g, y1g) => { const g = ctx.createLinearGradient(0, y0g, 0, y1g); g.addColorStop(0, '#fff3b0'); g.addColorStop(0.45, '#f6c64e'); g.addColorStop(0.55, '#d99a1c'); g.addColorStop(1, '#f9dd7c'); return g; };
      const paw = (cx, cy, r) => { ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.35, r * 0.62, r * 0.5, 0, 0, 7); ctx.fill(); for (const [ox, oy] of [[-0.66, -0.18], [-0.24, -0.62], [0.24, -0.62], [0.66, -0.18]]) { ctx.beginPath(); ctx.ellipse(cx + ox * r, cy + oy * r, r * 0.21, r * 0.27, ox * 0.5, 0, 7); ctx.fill(); } };
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 190px ${serif}`;
      ctx.fillStyle = '#231505'; ctx.fillText(S.name, w / 2 + 5, 158 + 6, w - 300);
      ctx.fillStyle = gold(70, 240); ctx.fillText(S.name, w / 2, 158, w - 300);
      ctx.fillStyle = '#e2b24a'; ctx.fillRect(w / 2 - 250, 262, 500, 4);
      ctx.font = `700 74px ${serif}`;
      ctx.fillStyle = '#231505'; ctx.fillText(S.plaque.split('').join(' '), w / 2 + 3, 322 + 4, w - 200);
      ctx.fillStyle = gold(288, 356); ctx.fillText(S.plaque.split('').join(' '), w / 2, 322, w - 200);
      ctx.fillStyle = '#e9bd55'; paw(96, 150, 44); paw(w - 96, 150, 44);
    }, 4.6, 1.8);
    plaque.mesh.position.set(S.x + fx * (PR + 0.435), y0 + 0.86, S.z + fz * (PR + 0.435));
    plaque.mesh.rotation.y = S.yaw;
    plaque.mesh.name = 'golden:plaque';
    this.group.add(plaque.mesh);
    // round the drum of the plinth: the plaques of the companions (see Plaques.js), and a sign that says what they are
    this.plaques = buildPlaques({ x: S.x, y: y0, z: S.z, yaw: S.yaw, r: PR }, PLAQUE_COUNT);
    this.group.add(this.plaques.mesh);
    {
      // (to the right of who comes up the stair, by the parapet: clear of the ring where one walks round the
      // plates, and of what one sees of them from the top of the stair)
      const a = 38 * (Math.PI / 180), lx = Math.sin(a) * (PR + 4.7), lz = Math.cos(a) * (PR + 4.7), c = Math.cos(S.yaw), s = Math.sin(S.yaw);
      const gx = S.x + lx * c + lz * s, gz = S.z - lx * s + lz * c, [tx, tz] = st.points[st.points.length - 1], yaw = Math.atan2(tx - gx, tz - gz), W = 1.7, H = 1.06;
      const sign = canvasBoard(544, 340, (ctx, w, h) => {
        const serif = "Georgia, 'Times New Roman', serif";
        const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#5b3d1c'); bg.addColorStop(0.5, '#6f4c22'); bg.addColorStop(1, '#3f2a12');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#2a1b0a'; ctx.lineWidth = 12; ctx.strokeRect(6, 6, w - 12, h - 12);
        ctx.strokeStyle = '#e2b24a'; ctx.lineWidth = 4; ctx.strokeRect(18, 18, w - 36, h - 36);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f6d98a'; ctx.font = `900 46px ${serif}`; ctx.fillText('THE GOOD COMPANIONS', w / 2, 74, w - 70);
        ctx.fillStyle = '#e2b24a'; ctx.fillRect(w / 2 - 150, 108, 300, 3);
        ctx.fillStyle = '#f3e6c8'; ctx.font = `italic 600 25px ${serif}`;
        ['Round the best dog ever,', 'the best friends of everybody else.'].forEach((t, i) => ctx.fillText(t, w / 2, 146 + i * 32, w - 60));
        ctx.fillStyle = '#ffe9a6'; ctx.font = `700 24px ${serif}`;
        ['A plate for yours, for good:', 'step up to one that is still bare.'].forEach((t, i) => ctx.fillText(t, w / 2, 236 + i * 31, w - 60));
      }, W, H, { both: true });
      sign.mesh.position.set(gx, y0 + 1.0 + H / 2, gz);
      sign.mesh.rotation.y = yaw;
      sign.mesh.name = 'golden:companions';
      this.group.add(sign.mesh);
      wood.tint(0.55, 0.42, 0.3, 1).place(gx, y0, gz, yaw).box(-W / 2 - 0.05, 0.95, -0.024, W / 2 + 0.05, 1.05 + H, -0.006, { tile: 1 }).box(-0.07, -0.3, -0.1, 0.07, 1.0, -0.03, { tile: 1 }).pop();
      this.colliders.push({ type: 'circle', x: gx, z: gz, r: 0.3 });
    }
    // the dog itself (its mesh is baked: see GoldenDog.js), and its shadow across the ledge
    const dog = new THREE.Mesh(statueGeometry(this.data.statue, S.height), goldMaterial());
    dog.name = 'golden-dog';
    dog.position.set(S.x, y0 + PH, S.z);
    dog.rotation.y = S.yaw;
    dog.matrixAutoUpdate = false;
    dog.updateMatrix();
    for (const l of this.cast) dog.layers.enable(l);
    this.group.add(dog);
    {
      // a parapet of dry stone wherever the ledge ends in a drop (not where the stair arrives), lanterns at its ends
      const [tx, tz] = st.points[st.points.length - 1], entry = Math.atan2(tz - E.z, tx - E.x), runs = [];
      let cur = null;
      for (let d = -180; d <= 180; d += 6) {
        const a = (d * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
        let da = Math.abs(a - entry); if (da > Math.PI) da = 2 * Math.PI - da;
        const open = da > 0.3 && this.ground(E.x + c * (E.rx + 2.6), E.z + s * (E.rz + 2.6)) < y0 - 1.2;
        if (open) { if (!cur) runs.push((cur = [])); cur.push([E.x + c * (E.rx + 0.12), E.z + s * (E.rz + 0.12)]); } else cur = null;
      }
      for (const line of runs) {
        if (line.length < 3) continue;
        dry.tint(1, 1, 1, 1); stone.tint(0.84, 0.83, 0.8, 1);
        wall(dry, line.map(([x, z]) => [x, z, y0 + 0.95]), { thickness: 0.5, groundAt: this.ground, depth: 1.4, tile: 2, cap: stone });
        for (const [x, z] of [line[0], line[line.length - 1]]) lantern(parts, x + (E.x - x) * 0.06, y0, z + (E.z - z) * 0.06, 2.0);
      }
      // two benches by the parapet, turned towards the dog
      for (const d of [14, 42]) {
        const a = (d * Math.PI) / 180, bx = E.x + Math.cos(a) * E.rx * 0.8, bz = E.z + Math.sin(a) * E.rz * 0.8;
        this._bench(stone, bx, y0 + 0.02, bz, Math.atan2(S.x - bx, S.z - bz));
      }
    }
    /** Where one says hello to it (at the tablet), and where its head is. */
    this.crokmou = { name: S.name, x: S.x + fx * (PR + 2.2), y: y0, z: S.z + fz * (PR + 2.2), reach: 4.2, head: { x: S.x + fx * S.height * 0.2, y: y0 + PH + S.height * 0.82, z: S.z + fz * S.height * 0.2 } };
    this._add('golden', parts);
  }

  // ---------------------------------------------------------------------------
  // The secret cove: a beach shut in by the cliffs. A boat pulled up on the sand, a fire, a hammock, a chest.

  _cove() {
    const parts = new Parts();
    const wood = parts.get('woodDark'), rock = parts.get('rock'), paint = parts.get('paint');
    const { x, z } = COVE, fl = Math.hypot(COVE.sea[0], COVE.sea[1]), fx = COVE.sea[0] / fl, fz = COVE.sea[1] / fl, sx = fz, sz = -fx; // towards the sea, and along the beach
    const yaw = Math.atan2(fx, fz); // facing the sea
    const at = (f, s) => [x + fx * f + sx * s, z + fz * f + sz * s];
    {
      // the boat: clinker planks, two thwarts, an oar across them
      const [bx, bz] = at(5.2, -9.5), by = this.ground(bx, bz) + 0.1, a = yaw + 0.5;
      wood.tint(0.5, 0.36, 0.24, 1).place(bx, by, bz, a, 0, 0.16);
      const rib = (t) => [0.02 + 0.72 * Math.sin(Math.PI * Math.min(1, t * 1.25) * 0.5) * (1 - 0.35 * t * t), 0.5 * t * t];
      for (let k = 0; k < 8; k++) {
        const t0 = -1 + k / 4, t1 = -1 + (k + 1) / 4, w0 = rib(Math.abs(t0)), w1 = rib(Math.abs(t1));
        const hw0 = 0.78 * (1 - t0 * t0 * 0.85) + 0.04, hw1 = 0.78 * (1 - t1 * t1 * 0.85) + 0.04;
        for (const s of [-1, 1]) {
          const A = V(s * hw0, 0.52 + w0[1] * 0.3, t0 * 2.0), B = V(s * hw1, 0.52 + w1[1] * 0.3, t1 * 2.0), C = V(s * hw1 * 0.35, 0.02, t1 * 1.9), D = V(s * hw0 * 0.35, 0.02, t0 * 1.9);
          if (s > 0) wood.quad(A, B, C, D, { tile: 1 }).quad(D, C, B, A, { tile: 1 }); else wood.quad(B, A, D, C, { tile: 1 }).quad(C, D, A, B, { tile: 1 });
        }
        wood.quad(V(-hw0 * 0.35, 0.02, t0 * 1.9), V(hw0 * 0.35, 0.02, t0 * 1.9), V(hw1 * 0.35, 0.02, t1 * 1.9), V(-hw1 * 0.35, 0.02, t1 * 1.9), { tile: 1 });
      }
      wood.tint(0.7, 0.55, 0.38, 1).box(-0.66, 0.34, -0.62, 0.66, 0.38, -0.38, { tile: 1 }).box(-0.7, 0.34, 0.5, 0.7, 0.38, 0.74, { tile: 1 });
      wood.tint(0.85, 0.72, 0.5, 1).rod(V(-0.5, 0.42, -1.3), V(0.45, 0.42, 1.5), 0.03, 5);
      wood.pop();
      this.colliders.push({ type: 'circle', x: bx, z: bz, r: 1.25 });
    }
    const [cx, cz] = at(-1, 0), cy = this.ground(cx, cz); // the fire
    {
      // a ring of stones, and four logs to sit on round it (the side of the sea is left open)
      for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; rock.tint(0.82 + 0.06 * (k % 2), 0.8, 0.76, 1).place(cx + Math.cos(a) * 0.8, cy - 0.05, cz + Math.sin(a) * 0.8, a * 1.7).cube(0, 0.1, 0, 0.34, 0.26, 0.28, { tile: 1 }).pop(); }
      wood.tint(0.26, 0.22, 0.2, 1);
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI + 0.4; wood.rod(V(cx - Math.cos(a) * 0.5, cy + 0.08, cz - Math.sin(a) * 0.5), V(cx + Math.cos(a) * 0.5, cy + 0.3, cz + Math.sin(a) * 0.5), 0.085, 6); }
      parts.get('glow').tint(1, 0.5, 0.14, 1).cylinder(cx, cy + 0.12, cz, 0.27, 0.02, 0.7, 6, { capTop: false });
      this.colliders.push({ type: 'circle', x: cx, z: cz, r: 0.95 });
      for (const turn of [-2.35, -1.2, 1.2, 2.35]) {
        // (turn: where the log lies round the fire, 0 = on the side of the sea)
        const a = yaw + turn, lx = cx + Math.sin(a) * 2.5, lz = cz + Math.cos(a) * 2.5, ly = this.ground(lx, lz), tx = Math.cos(a), tz = -Math.sin(a);
        wood.tint(0.62, 0.52, 0.4, 1).rod(V(lx - tx * 0.95, ly + 0.2, lz - tz * 0.95), V(lx + tx * 0.95, ly + 0.2, lz + tz * 0.95), 0.2, 8);
        for (const o of [-0.45, 0.45]) this.seats.push(seatAt(lx + tx * o, ly + 0.4, lz + tz * o, a + Math.PI));
        this.colliders.push({ type: 'box', x: lx, z: lz, hw: 0.95, hl: 0.2, yaw: a, y0: ly - 1, y1: ly + 0.45 });
      }
    }
    {
      // a chest half buried in the sand at the back of the beach, its lid open on something that shines
      const [tx, tz] = at(-13, 3), ty = this.ground(tx, tz);
      wood.tint(0.42, 0.28, 0.16, 1).place(tx, ty - 0.12, tz, yaw + 0.3, 0.08, 0.1).box(-0.42, 0, -0.28, 0.42, 0.44, 0.28, { tile: 1, faces: 'xXzZy' });
      wood.place(0, 0.44, -0.28, 0, -1.15).box(-0.42, 0, 0, 0.42, 0.06, 0.56, { tile: 1 }).pop();
      wood.pop();
      paint.tint(1.4, 1.0, 0.25, 1).place(tx, ty - 0.12, tz, yaw + 0.3, 0.08, 0.1).box(-0.44, 0.1, -0.3, -0.36, 0.34, 0.3).box(0.36, 0.1, -0.3, 0.44, 0.34, 0.3).pop();
      parts.get('glow').tint(1, 0.78, 0.2, 1).place(tx, ty + 0.2, tz, yaw + 0.3).lathe([[0.0, 0.0], [0.3, 0.0], [0.22, 0.1], [0.0, 0.16]], 7).pop();
      this.colliders.push({ type: 'circle', x: tx, z: tz, r: 0.5 });
    }
    // hammocks under the palms at the back, two rows of beanbag chairs facing the sea, low tables, lanterns:
    // nobody will come and disturb you here
    {
      [[-9.5, -8, 1.25, 5], [-10.5, 0, 1.75, 2], [-9.5, 8, 2.1, 3]].forEach(([f, sd, turn, tone]) => { const [hx, hz] = at(f, sd); this._hammock(parts, hx, hz, yaw + turn, POUF[tone]); });
      const b = parts.get('matte');
      this._chairs(b, [[2.4, -7], [2.6, -4.5], [2.4, -2], [2.4, 2], [2.6, 4.5], [2.4, 7], [-5.2, -7], [-5.6, -4.4], [-5.6, 4.4], [-5.2, 7]], at, this.ground, yaw);
      for (const [f, sd] of [[2.9, -3.2], [2.9, 3.3], [-5.0, -5.7], [-5.0, 5.7]]) {
        const [px, pz] = at(f, sd), py = this.ground(px, pz);
        lowTable(parts, px, py - 0.03, pz, 0.36);
        this.colliders.push({ type: 'circle', x: px, z: pz, r: 0.34, y0: -100, y1: py + 0.5 });
      }
      for (const [f, sd] of [[-7.6, -4.2], [-7.6, 4.2], [0.6, -9.4]]) { const [px, pz] = at(f, sd); lantern(parts, px, this.ground(px, pz), pz, 2.0); this.colliders.push({ type: 'circle', x: px, z: pz, r: 0.14 }); }
    }
    {
      // Somebody has been drinking here: a crate and a keg of "OIL" (these are robots), bottles standing on the
      // crate, lying in the sand, stuck in it. One texture for every label, one mesh for them all.
      const glass = parts.get('paint'), labels = [];
      const label = (c, right, up, w, h) => labels.push([c, right, up, w, h]); // centre, unit vectors along and up, size
      const bottle = (px, py, pz, turn, pitch = 0, roll = 0, k = 1) => {
        glass.tint(0.05, 0.11, 0.05, 1).place(px, py, pz, turn, pitch, roll);
        glass.lathe([[0.0, 0.0], [0.05 * k, 0.0], [0.055 * k, 0.02 * k], [0.055 * k, 0.17 * k], [0.044 * k, 0.215 * k], [0.018 * k, 0.26 * k], [0.018 * k, 0.32 * k], [0.026 * k, 0.325 * k], [0.0, 0.33 * k]], 8);
        glass.pop();
        if (!pitch && !roll) label(V(px + Math.sin(turn) * 0.057 * k, py + 0.1 * k, pz + Math.cos(turn) * 0.057 * k), V(Math.cos(turn), 0, -Math.sin(turn)), V(0, 1, 0), 0.085 * k, 0.085 * k);
      };
      const [kx0, kz0] = at(-2.6, -3.4), ky0 = this.ground(kx0, kz0), ca = yaw + 0.4;
      wood.tint(0.78, 0.62, 0.42, 1).place(kx0, ky0 - 0.06, kz0, ca).box(-0.36, 0, -0.3, 0.36, 0.5, 0.3, { tile: 0.8 });
      for (const e of [-0.36, 0.36]) wood.box(e - 0.03, 0, -0.33, e + 0.03, 0.53, 0.33, { tile: 0.8 });
      wood.pop();
      for (const sgn of [-1, 1]) label(V(kx0 + Math.sin(ca) * 0.305 * sgn, ky0 + 0.2, kz0 + Math.cos(ca) * 0.305 * sgn), V(Math.cos(ca) * sgn, 0, -Math.sin(ca) * sgn), V(0, 1, 0), 0.5, 0.25);
      this.colliders.push({ type: 'circle', x: kx0, z: kz0, r: 0.5, y0: ky0 - 1, y1: ky0 + 0.6 });
      const top = (lx, lz) => [kx0 + lx * Math.cos(ca) + lz * Math.sin(ca), kz0 - lx * Math.sin(ca) + lz * Math.cos(ca)];
      [[-0.2, 0.05, 0.3], [0.02, -0.1, 2.0], [0.2, 0.1, 4.1]].forEach(([lx, lz, t], i) => { const [bx, bz] = top(lx, lz); bottle(bx, ky0 + 0.44, bz, ca + t, 0, 0, 1.25 + 0.1 * i); });
      // the keg, on its side
      const [kx, kz] = at(-3.8, -5.0), ky = this.ground(kx, kz);
      wood.tint(0.5, 0.36, 0.22, 1).place(kx, ky + 0.3, kz, yaw + 1.9, 0, Math.PI / 2).lathe([[0.0, -0.42], [0.25, -0.42], [0.31, -0.2], [0.33, 0], [0.31, 0.2], [0.25, 0.42], [0.0, 0.42]], 10, { tile: 0.8 }).pop();
      paint.tint(0.12, 0.12, 0.13, 1);
      for (const e of [-0.24, 0.24]) paint.place(kx, ky + 0.3, kz, yaw + 1.9, 0, Math.PI / 2).lathe([[0.315, e - 0.03], [0.325, e], [0.315, e + 0.03]], 10).pop();
      {
        const a = yaw + 1.9, ex = Math.cos(a), ez = -Math.sin(a); // the axis of the keg
        label(V(kx + ex * 0.425, ky + 0.3, kz + ez * 0.425), V(-ez, 0, ex), V(0, 1, 0), 0.4, 0.2);
      }
      this.colliders.push({ type: 'circle', x: kx, z: kz, r: 0.42, y0: ky - 1, y1: ky + 0.7 });
      // empties: round the fire, by the boat, by the chairs, under a hammock
      for (const [f, sd, t, lying] of [[0.4, -1.7, 0.7, 1], [-2.9, 1.9, 2.2, 1], [-0.2, 1.6, 4.0, 0], [4.4, -7.6, 1.0, 1], [3.4, -5.6, 5.0, 0], [3.5, 0.4, 2.6, 1], [-6.4, 6.0, 3.3, 0], [-8.6, -6.6, 0.4, 1], [3.3, 5.6, 1.7, 0], [-4.4, -2.2, 5.6, 1]]) {
        const [bx, bz] = at(f, sd), by = this.ground(bx, bz);
        if (lying) bottle(bx, by + 0.065, bz, t, Math.PI / 2 - 0.06, 0, 1.3); else bottle(bx, by - 0.05, bz, t, 0.22, 0.1, 1.3);
      }
      // the labels
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#efe3c2'; ctx.fillRect(0, 0, 256, 128);
      ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, 240, 112);
      ctx.fillStyle = '#2a1c10'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = "900 84px Georgia, 'Times New Roman', serif";
      ctx.fillText('OIL', 128, 68);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const pos = [], uv = [], idx = [];
      for (const [c, r, u, w, h] of labels) {
        const i = pos.length / 3;
        for (const [a, bb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(c.x + r.x * a * w / 2 + u.x * bb * h / 2, c.y + r.y * a * w / 2 + u.y * bb * h / 2, c.z + r.z * a * w / 2 + u.z * bb * h / 2); uv.push((a + 1) / 2, (bb + 1) / 2); }
        idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false }));
      mesh.name = 'cove:labels';
      this.group.add(mesh);
    }
    this._add('cove', parts);
  }

  // ---------------------------------------------------------------------------
  // The fall into the sea: a stream leaves its hanging valley at the top of the cliffs and drops to the water

  _seaFall() {
    const F = this.data.meta.seaFall, foam = this.world.water.shared.uFoam;
    if (!F) return;
    const [ux, uz] = F.dir, side = V(-uz, 0, ux);
    // the stream in its valley, running to the lip
    const run = [];
    for (let t = -26; t <= 0.5; t += 2.2) run.push(V(F.x + ux * t, F.y + Math.max(0, -t) * 0.07 + 0.05, F.z + uz * t));
    const stream = fallsRibbon(run, side, F.width * 0.8, foam, (i) => Math.min(1, i / 3));
    // the fall itself: off the lip, on a parabola, down to the sea
    const v0 = 4.6, T = Math.sqrt((2 * F.y) / 9.81), sheet = [V(F.x - ux * 0.6, F.y + 0.06, F.z - uz * 0.6)], steps = 30;
    for (let k = 0; k <= steps; k++) { const t = (k / steps) * T; sheet.push(V(F.x + ux * v0 * t, F.y + 0.04 - 4.905 * t * t, F.z + uz * v0 * t)); }
    // (it widens and frays as it falls)
    const fall = fallsRibbon(sheet, side, F.width, foam, (i) => (i === 0 ? 0 : 1));
    const veil = fallsRibbon(sheet.slice(8), side, F.width * 2.1, foam, (i) => Math.min(0.5, i / 12));
    const land = sheet[sheet.length - 1], boil = [];
    for (let k = -2; k <= 7; k++) boil.push(V(land.x + ux * k * 1.5, 0.06, land.z + uz * k * 1.5));
    const churn = fallsRibbon(boil, side, F.width * 3.2, foam, (i) => [0, 0.6, 0.9, 0.95, 0.8, 0.6, 0.42, 0.26, 0.12, 0][i], true);
    for (const [m, name] of [[stream, 'seafall:stream'], [fall, 'seafall'], [veil, 'seafall:veil'], [churn, 'seafall:boil']]) { m.name = name; this.group.add(m); }
  }

  /** Stone bench for two, facing `yaw`. */
  _bench(b, x, y, z, yaw) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), sx = fz, sz = -fx; // forward, and along the bench
    b.tint(0.82, 0.81, 0.78, 1).place(x, y, z, yaw);
    b.box(-1.05, 0.3, -0.24, 1.05, 0.39, 0.24, { tile: 1 });
    for (const s of [-0.8, 0.8]) b.box(s - 0.12, -0.2, -0.2, s + 0.12, 0.3, 0.2, { tile: 1 });
    b.pop();
    for (const s of [-0.5, 0.5]) this.seats.push(seatAt(x + sx * s, y + 0.39, z + sz * s, yaw));
    this.colliders.push({ type: 'box', x, z, hw: 1.05, hl: 0.26, yaw, y0: y - 1, y1: y + 0.6 });
    void fx; void fz;
  }

  // ---------------------------------------------------------------------------
  // The island: timber frames at the hollows of the path, beams over the drop, a ring of stones at the top

  _island() {
    const parts = new Parts();
    const wood = parts.get('woodDark'), deck = parts.get('woodDeck'), rock = parts.get('rock');
    const w2 = ISLAND.width / 2;
    for (const u of ISLAND.alcoves) {
      // a frame like the shoring of a gallery, at the mouth of the hollow
      const p = islandPath(u), ix = p.x - p.nx * (w2 + 0.15), iz = p.z - p.nz * (w2 + 0.15), y = p.y;
      wood.tint(0.82, 0.74, 0.62, 1);
      const posts = [];
      for (const s of [-1, 1]) {
        const px = ix + p.tx * s * (ISLAND.alcove.half - 0.25), pz = iz + p.tz * s * (ISLAND.alcove.half - 0.25);
        const py = this.ground(px, pz);
        wood.box(px - 0.13, py - 0.3, pz - 0.13, px + 0.13, y + 2.45, pz + 0.13, { tile: 1 });
        posts.push(V(px, y + 2.5, pz));
        this.colliders.push({ type: 'circle', x: px, z: pz, r: 0.2 });
      }
      wood.beam(posts[0].clone().addScaledVector(V(p.tx, 0, p.tz), -0.35), posts[1].clone().addScaledVector(V(p.tx, 0, p.tz), 0.35), 0.3, 0.26, { tile: 1 });
    }
    const glow = parts.get('glow');
    ISLAND.beams.forEach((u, i) => {
      // timber out over the drop, to stand on while the boulder goes by: find the edge of the cliff first
      // (a square frame: straight out from the island, and across — the path itself is a few degrees off)
      const p = islandPath(u), n = V(p.nx, 0, p.nz), side = Math.sign(-p.nz * p.tx + p.nx * p.tz) || 1, t = V(-p.nz * side, 0, p.nx * side);
      let edge = w2;
      while (edge < w2 + 4 && this.ground(p.x + p.nx * (edge + 0.5), p.z + p.nz * (edge + 0.5)) > p.y - 0.8) edge += 0.25;
      const y = p.y + 0.14, HW = 0.3; // top of the timbers, half their width
      const at = (out, along, dy = 0) => V(p.x + n.x * out + t.x * along, y + dy, p.z + n.z * out + t.z * along);
      const yawOut = Math.atan2(n.x, n.z), yawAlong = Math.atan2(t.x, t.z);
      // a walkway of two planks side by side on a squared timber, from `a` to `b` (points on its axis, at the top)
      const walk = (a, b, yaw) => {
        const mid = a.clone().add(b).multiplyScalar(0.5), half = a.distanceTo(b) / 2;
        wood.tint(0.78, 0.7, 0.58, 1).place(mid.x, mid.y, mid.z, yaw).box(-0.14, -0.34, -half, 0.14, -0.07, half, { tile: 1 }).pop();
        deck.tint(0.98, 0.9, 0.78, 1).place(mid.x, mid.y, mid.z, yaw);
        for (const sx of [-1, 1]) deck.box(sx * HW, -0.07, -half, sx * 0.012, 0, half, { tile: 1.4 });
        deck.pop();
        this.platforms.push({ type: 'slab', x: mid.x, z: mid.z, hw: HW, hl: half, yaw, y });
      };
      // a strut from the rock below up to a timber
      const strut = (out, along) => {
        const foot = at(edge - 0.15, along, -3.1), head = at(out, along, -0.3);
        wood.tint(0.7, 0.62, 0.5, 1).beam(foot, head, 0.16, 0.16, { tile: 1 });
      };
      // a rope between posts (it sags), and the posts themselves
      const rail = (pts) => {
        wood.tint(0.8, 0.72, 0.6, 1);
        for (const q of pts) wood.box(q.x - 0.055, q.y - 0.3, q.z - 0.055, q.x + 0.055, q.y + 1.02, q.z + 0.055, { tile: 1 });
        wood.tint(1.5, 1.3, 0.95, 1);
        for (let k = 0; k + 1 < pts.length; k++) {
          const a = pts[k].clone().setY(pts[k].y + 0.96), b = pts[k + 1].clone().setY(pts[k + 1].y + 0.96);
          let prev = a;
          for (let j = 1; j <= 5; j++) {
            const q = a.clone().lerp(b, j / 5);
            q.y -= Math.sin((j / 5) * Math.PI) * 0.16;
            wood.rod(prev, q, 0.022, 4, { caps: false });
            prev = q;
          }
        }
      };
      const lantern = (q) => {
        wood.tint(0.6, 0.54, 0.45, 1).box(q.x - 0.05, q.y - 0.3, q.z - 0.05, q.x + 0.05, q.y + 1.75, q.z + 0.05, { tile: 1 });
        glow.tint(1.0, 0.72, 0.3, 1).place(q.x, q.y + 1.52, q.z).lathe([[0.0, -0.13], [0.12, -0.06], [0.12, 0.08], [0.0, 0.15]], 6).pop();
      };
      if (i % 2 === 0) {
        // two walkways out, joined at their ends by a third one along the cliff, with a rope on the sea side
        const OUT = edge + 3.0, A = 2.3;
        for (const sa of [-A, A]) { walk(at(edge - 1.4, sa), at(OUT + HW, sa), yawOut); strut(edge + 1.9, sa); }
        walk(at(OUT, -A - HW), at(OUT, A + HW), yawAlong);
        const posts = [-A - HW, -A / 2, 0, A / 2, A + HW].map((sa) => at(OUT + HW - 0.06, sa));
        rail(posts);
        lantern(at(OUT + HW - 0.06, A + HW + 0.2));
        // the rope holds: one cannot step off on the sea side
        const mid = at(OUT + HW + 0.1, 0);
        this.colliders.push({ type: 'box', x: mid.x, z: mid.z, hw: 0.1, hl: A + HW + 0.2, yaw: yawAlong, y0: y - 0.6, y1: y + 1.4 });
      } else {
        // one walkway out to a round crow's nest
        const OUT = edge + 3.9, R = 1.15, c = at(OUT, 0);
        walk(at(edge - 1.4, 0), at(OUT - R + 0.25, 0), yawOut);
        strut(edge + 1.7, 0);
        deck.tint(0.98, 0.9, 0.78, 1).cylinder(c.x, y - 0.07, c.z, R, R, 0.07, 14, { tile: 1.4 });
        wood.tint(0.78, 0.7, 0.58, 1).cylinder(c.x, y - 0.34, c.z, R * 0.92, R, 0.27, 14, { tile: 1, capTop: false, capBottom: true });
        for (const sa of [-0.75, 0.75]) wood.tint(0.7, 0.62, 0.5, 1).beam(at(edge - 0.15, sa * 0.5, -3.1), at(OUT - 0.2, sa, -0.3), 0.16, 0.16, { tile: 1 });
        this.platforms.push({ type: 'disc', x: c.x, z: c.z, r: R, y });
        // a rope round the sea side of the nest
        const posts = [];
        for (let k = 0; k <= 6; k++) {
          const a = (-0.62 + (k / 6) * 1.24) * Math.PI; // from one side of the walkway round to the other
          posts.push(V(c.x + (n.x * Math.cos(a) + t.x * Math.sin(a)) * (R - 0.06), y, c.z + (n.z * Math.cos(a) + t.z * Math.sin(a)) * (R - 0.06)));
        }
        rail(posts);
        for (let k = 0; k + 1 < posts.length; k++) {
          const a = posts[k], b = posts[k + 1], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
          const ox = mx - c.x, oz = mz - c.z, ol = Math.hypot(ox, oz) || 1; // pushed just outside the deck
          this.colliders.push({ type: 'box', x: mx + (ox / ol) * 0.22, z: mz + (oz / ol) * 0.22, hw: 0.1, hl: Math.hypot(b.x - a.x, b.z - a.z) / 2 + 0.08, yaw: Math.atan2(b.x - a.x, b.z - a.z), y0: y - 0.6, y1: y + 1.4 });
        }
        lantern(posts[3]);
      }
    });
    {
      // the top: standing stones in a ring, a mast and its pennant, two stone seats to take in the view
      const y = ISLAND.y1 + 0.2;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + 0.4, r = ISLAND.summit - 1.1, x = ISLAND.x + Math.cos(a) * r, z = ISLAND.z + Math.sin(a) * r;
        if (k === 2 || k === 6) continue; // where the path comes up; where the sign of the button stands
        rock.tint(0.84, 0.82, 0.78, 1).place(x, y - 0.3, z, a, 0.06 * (k % 3 - 1), 0).box(-0.3, 0, -0.22, 0.3, 1.25 + 0.3 * (k % 2), 0.22, { tile: 1.6 }).pop();
        this.colliders.push({ type: 'circle', x, z, r: 0.4 });
      }
      // a mast and its wooden vane (the way to the beach)
      wood.tint(1.05, 1.0, 0.92, 1).rod(V(ISLAND.x, y - 0.3, ISLAND.z), V(ISLAND.x, y + 6.4, ISLAND.z), 0.08, 6);
      wood.tint(0.9, 0.3, 0.2, 1).place(ISLAND.x, y + 5.9, ISLAND.z, 0.3).box(-1.5, -0.14, -0.03, 0.4, 0.14, 0.03, { tile: 1 }).box(-1.9, -0.24, -0.03, -1.5, 0.24, 0.03, { tile: 1 }).pop();
      this.colliders.push({ type: 'circle', x: ISLAND.x, z: ISLAND.z, r: 0.25 });
      const g = rock;
      this._bench(g, ISLAND.x - 3.2, y, ISLAND.z + 1.2, -Math.PI / 2); // facing the beach and the valley
      this._bench(g, ISLAND.x + 1.0, y, ISLAND.z + 3.3, 0);
      this._button(parts, y);
    }
    {
      // where one lands: a mooring post, and a marker stone at the foot of the path
      const p = islandPath(0.012), y = this.ground(p.x, p.z);
      wood.tint(0.7, 0.62, 0.5, 1).cylinder(p.x + p.nx * 2.6, y - 0.6, p.z + p.nz * 2.6, 0.16, 0.13, 1.7, 8);
      this.colliders.push({ type: 'circle', x: p.x + p.nx * 2.6, z: p.z + p.nz * 2.6, r: 0.25 });
    }
    this._add('island', parts);
  }

  // ---------------------------------------------------------------------------
  // The big red button, at the top of the island, facing the open sea: a drum painted like a circus ring, a
  // red dome on it, a lamp that says whether it is ready, and beside it the sign that explains — in the best
  // of moods — what it does (see effects/Blast.js). Bunting from the mast, because it is a fair.

  _button(parts, y) {
    const paint = parts.get('paint'), wood = parts.get('woodDark'), cloth = parts.get('doubleSided'), glow = parts.get('glow');
    const bx = ISLAND.x + 3.6, bz = ISLAND.z - 0.1; // the button: on the side of the open sea
    const RED = [0.85, 0.1, 0.08], CREAM = [0.97, 0.93, 0.84], GOLD = [1.5, 1.05, 0.25];
    // the drum: stripes all round, a gold rim top and bottom, a hazard collar under the dome
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2, c = k % 2 ? CREAM : RED, r = 0.42;
      paint.tint(c[0], c[1], c[2], 1).quad(V(bx + Math.cos(a0) * r, y - 0.3, bz + Math.sin(a0) * r), V(bx + Math.cos(a0) * r, y + 0.9, bz + Math.sin(a0) * r), V(bx + Math.cos(a1) * r, y + 0.9, bz + Math.sin(a1) * r), V(bx + Math.cos(a1) * r, y - 0.3, bz + Math.sin(a1) * r));
    }
    paint.tint(GOLD[0], GOLD[1], GOLD[2], 1).cylinder(bx, y, bz, 0.46, 0.46, 0.07, 16).cylinder(bx, y + 0.86, bz, 0.47, 0.47, 0.07, 16);
    for (let k = 0; k < 16; k++) {
      const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2, c = k % 2 ? [0.06, 0.06, 0.07] : [1.5, 1.2, 0.1];
      paint.tint(c[0], c[1], c[2], 1).quad(V(bx + Math.cos(a0) * 0.36, y + 0.932, bz + Math.sin(a0) * 0.36), V(bx + Math.cos(a0) * 0.2, y + 0.932, bz + Math.sin(a0) * 0.2), V(bx + Math.cos(a1) * 0.2, y + 0.932, bz + Math.sin(a1) * 0.2), V(bx + Math.cos(a1) * 0.36, y + 0.932, bz + Math.sin(a1) * 0.36));
    }
    this.colliders.push({ type: 'circle', x: bx, z: bz, r: 0.5 });
    // what moves: the dome (it goes down when pressed), the two lamps (green: ready; red: recharging)
    const piece = (material, fill) => { const p = new Parts(); fill(p.get(material)); const m = new THREE.Mesh(p.get(material).build(), this.world.materials[material]); m.frustumCulled = false; this.group.add(m); return m; };
    const dome = piece('paint', (b) => b.tint(1.5, 0.07, 0.05, 1).lathe([[0.2, 0.0], [0.2, 0.05], [0.17, 0.11], [0.1, 0.155], [0.0, 0.17]], 14));
    dome.name = 'moving-button:dome';
    dome.position.set(bx, y + 0.93, bz);
    const lamp = (c) => { const m = piece('glow', (b) => b.tint(c[0], c[1], c[2], 1).lathe([[0.0, -0.05], [0.05, 0.0], [0.0, 0.05]], 8)); m.name = 'moving-button:lamp'; m.position.set(bx - 0.44, y + 0.6, bz); return m; };
    const ready = lamp([0.25, 1.6, 0.35]), wait = lamp([1.7, 0.2, 0.12]);
    wait.visible = false;
    // the sign, beside it, turned towards whoever comes up
    const sa = (6 / 7) * Math.PI * 2 + 0.4, sr = ISLAND.summit - 1.45, sx = ISLAND.x + Math.cos(sa) * sr, sz = ISLAND.z + Math.sin(sa) * sr;
    const yaw = Math.atan2(ISLAND.x - sx, ISLAND.z - sz), W = 2.7, H = 1.62, low = 0.95;
    const sign = canvasBoard(1024, 614, (ctx, w, h) => {
      const serif = "Georgia, 'Times New Roman', serif";
      ctx.fillStyle = '#7a1420'; ctx.fillRect(0, 0, w, h);
      // hazard stripes along the top and the bottom
      for (const y0 of [0, h - 44]) { ctx.save(); ctx.beginPath(); ctx.rect(0, y0, w, 44); ctx.clip(); for (let x = -60; x < w + 60; x += 56) { ctx.fillStyle = (x / 56) % 2 ? '#15151a' : '#f2c14e'; ctx.beginPath(); ctx.moveTo(x, y0 + 44); ctx.lineTo(x + 28, y0 + 44); ctx.lineTo(x + 72, y0); ctx.lineTo(x + 44, y0); ctx.fill(); ctx.fillStyle = (x / 56) % 2 ? '#f2c14e' : '#15151a'; ctx.beginPath(); ctx.moveTo(x + 28, y0 + 44); ctx.lineTo(x + 56, y0 + 44); ctx.lineTo(x + 100, y0); ctx.lineTo(x + 72, y0); ctx.fill(); } ctx.restore(); }
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 8; ctx.strokeRect(14, 58, w - 28, h - 116);
      ctx.fillStyle = '#ffe9a8'; for (let i = 0; i < 28; i++) { ctx.beginPath(); ctx.arc(40 + i * 35, 80, 5.5, 0, 7); ctx.arc(40 + i * 35, h - 80, 5.5, 0, 7); ctx.fill(); }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f2c14e'; ctx.font = `700 40px ${serif}`; ctx.fillText('★  TODAY AND EVERY DAY  ★', w / 2, 128);
      ctx.fillStyle = '#fff3d6'; ctx.font = `900 92px ${serif}`; ctx.fillText('FREE NUCLEAR', w / 2, 212, w - 80); ctx.fillText('EXPLOSION!', w / 2, 306, w - 80);
      ctx.fillStyle = '#f2c14e'; ctx.font = `700 46px ${serif}`; ctx.fillText('Press the big red button.', w / 2, 388);
      ctx.fillStyle = '#f6e7c8'; ctx.font = `italic 600 36px ${serif}`; ctx.fillText('Everything is destroyed already anyway,', w / 2, 444, w - 70); ctx.fillText('so enjoy the show!', w / 2, 488, w - 70);
      ctx.fillStyle = '#d9b9a0'; ctx.font = '600 22px system-ui, sans-serif'; ctx.fillText('One every 15 minutes · No refunds · Do look at the flash, it is lovely', w / 2, 536, w - 60);
    }, W, H);
    sign.mesh.position.set(sx, y + low + H / 2, sz);
    sign.mesh.rotation.y = yaw;
    sign.mesh.name = 'island:sign';
    this.group.add(sign.mesh);
    // its two posts, its back, a gold ball on each post
    paint.tint(0.34, 0.07, 0.09, 1).place(sx, y, sz, yaw).box(-W / 2, low, -0.05, W / 2, low + H, -0.012, { faces: 'zxXyY' });
    wood.tint(0.95, 0.9, 0.8, 1).place(sx, y, sz, yaw);
    for (const g of [-1, 1]) wood.box(g * (W / 2 + 0.07) - 0.06, -0.3, -0.09, g * (W / 2 + 0.07) + 0.06, low + H + 0.12, 0.03, { tile: 1 });
    wood.pop();
    paint.tint(GOLD[0], GOLD[1], GOLD[2], 1);
    for (const g of [-1, 1]) paint.place(g * (W / 2 + 0.07), low + H + 0.12, -0.03).lathe([[0.0, 0.0], [0.09, 0.04], [0.1, 0.12], [0.0, 0.2]], 8).pop();
    paint.pop();
    for (const g of [-1, 1]) this.colliders.push({ type: 'circle', x: sx + Math.cos(yaw) * g * (W / 2 + 0.07), z: sz - Math.sin(yaw) * g * (W / 2 + 0.07), r: 0.16 });
    this.colliders.push({ type: 'box', x: sx, z: sz, hw: W / 2, hl: 0.1, yaw, y0: y + low - 0.2, y1: y + low + H });
    // bunting from the mast to the sign, and from the mast to the stones of the other side
    const TONES = [RED, CREAM, [1.5, 1.05, 0.2], [0.1, 0.6, 0.65]];
    const bunting = (a, b, n) => {
      let prev = a;
      for (let k = 1; k <= n; k++) {
        const q = a.clone().lerp(b, k / n);
        q.y -= Math.sin((k / n) * Math.PI) * 0.55;
        wood.tint(0.9, 0.85, 0.7, 1).rod(prev, q, 0.012, 4, { caps: false });
        const m = prev.clone().lerp(q, 0.5), c = TONES[k % TONES.length];
        cloth.tint(c[0] * 1.1, c[1] * 1.1, c[2] * 1.1, 1).tri(prev.clone().lerp(q, 0.12), prev.clone().lerp(q, 0.88), V(m.x, m.y - 0.34, m.z));
        prev = q;
      }
    };
    const top = V(ISLAND.x, y + 5.4, ISLAND.z);
    bunting(top, V(sx, y + low + H + 0.3, sz), 12);
    bunting(top, V(ISLAND.x - 4.6, y + 1.7, ISLAND.z - 2.6), 11);
    bunting(top, V(ISLAND.x + 0.8, y + 1.7, ISLAND.z + 5.0), 11);
    glow.tint(1.0, 0.78, 0.35, 1).place(top.x, top.y + 0.12, top.z).lathe([[0.0, -0.1], [0.1, 0.0], [0.0, 0.1]], 6).pop();
    /** Where one stands to press it, what moves, and how it is told what state it is in. */
    this.button = {
      x: bx, y, z: bz, reach: 1.7, pressed: 0,
      /** `ready`: the lamp; `dt`: the dome comes back up after a press. */
      update: (dt, isReady) => {
        const b = this.button;
        b.pressed = Math.max(0, b.pressed - dt * 1.6);
        dome.position.y = y + 0.93 - 0.1 * Math.min(1, b.pressed * 2);
        ready.visible = isReady; wait.visible = !isReady;
      },
      press: () => { this.button.pressed = 1; },
    };
  }

  // ---------------------------------------------------------------------------
  // The camp: a fire, logs to sit on, hammocks slung between posts, two tents

  _hammock(parts, x, z, yaw, color) {
    const wood = parts.get('woodDark'), cloth = parts.get('doubleSided'), rope = wood;
    const y = this.ground(x, z), ax = Math.sin(yaw), az = Math.cos(yaw), sx = az, sz = -ax;
    const HALF = 2.0, TOP = 1.5, LOW = 0.62, REACH = 1.5;
    const ends = [];
    for (const s of [-1, 1]) {
      const px = x + ax * s * HALF, pz = z + az * s * HALF, py = this.ground(px, pz);
      wood.tint(0.78, 0.7, 0.58, 1).rod(V(px + ax * s * 0.25, py - 0.4, pz + az * s * 0.25), V(px, y + TOP + 0.12, pz), 0.075, 7);
      ends.push(V(px, y + TOP, pz));
      this.colliders.push({ type: 'circle', x: px, z: pz, r: 0.16 });
    }
    // the cloth: slung low in the middle, its edges curling up
    const P = (s, c) => {
      const hw = 0.62 * (1 - 0.78 * s ** 4);
      return V(x + ax * s * REACH + sx * c * hw, y + LOW + 0.62 * s * s + 0.2 * c * c * (1 - s * s), z + az * s * REACH + sz * c * hw);
    };
    const NS = 10, NC = 4;
    for (let i = 0; i < NS; i++) {
      for (let j = 0; j < NC; j++) {
        const s0 = -1 + (2 * i) / NS, s1 = -1 + (2 * (i + 1)) / NS, c0 = -1 + (2 * j) / NC, c1 = -1 + (2 * (j + 1)) / NC;
        const k = (j === 1 || j === 2) ? 1 : 0.72; // a lighter band down the middle
        cloth.tint(color[0] * k + 0.06, color[1] * k + 0.06, color[2] * k + 0.06, 1);
        cloth.quad(P(s0, c0), P(s0, c1), P(s1, c1), P(s1, c0), { tile: 1 });
      }
    }
    rope.tint(1.5, 1.35, 1.0, 1);
    for (const [s, e] of [[-1, ends[0]], [1, ends[1]]]) for (const c of [-1, 0, 1]) rope.rod(P(s, c), e, 0.012, 4, { caps: false });
    this.seats.push({ x, y: y + LOW - 0.04, z, yaw, pose: ANIM.lie, label: 'Lie down', exit: [x + sx * 1.15, z + sz * 1.15], reach: 2.0 });
  }

  _camp() {
    const parts = new Parts();
    const { x, z } = CAMP, y = this.ground(x, z);
    const rock = parts.get('rock'), wood = parts.get('woodDark');
    // the fire: a ring of stones, crossed logs
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2, r = 0.82;
      rock.tint(0.78 + 0.08 * (k % 2), 0.76, 0.72, 1).place(x + Math.cos(a) * r, y - 0.05, z + Math.sin(a) * r, a * 1.7).cube(0, 0.12, 0, 0.36, 0.3, 0.28, { tile: 1 }).pop();
    }
    wood.tint(0.3, 0.26, 0.22, 1);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI + 0.3; wood.rod(V(x - Math.cos(a) * 0.55, y + 0.1, z - Math.sin(a) * 0.55), V(x + Math.cos(a) * 0.55, y + 0.32, z + Math.sin(a) * 0.55), 0.09, 6); }
    this.colliders.push({ type: 'circle', x, z, r: 0.95 });
    {
      // the flames: their own little mesh, so that they can flicker
      const f = new Parts(), g = f.get('glow');
      g.tint(1, 0.5, 0.12, 1).cylinder(0, 0.15, 0, 0.3, 0.02, 0.85, 7, { capTop: false });
      g.tint(1, 0.75, 0.25, 1).cylinder(0.08, 0.15, 0.05, 0.18, 0.02, 0.55, 6, { capTop: false });
      g.tint(1, 0.36, 0.08, 1).cylinder(-0.14, 0.12, -0.08, 0.16, 0.02, 0.5, 6, { capTop: false });
      const fire = f.toMeshes(this.world.materials, { name: 'campfire', layers: [] });
      fire.position.set(x, y, z);
      fire.updateMatrixWorld(true);
      fire.children.forEach((m) => { m.matrixAutoUpdate = false; });
      this.group.add(fire);
      this.animated.push((dt, time) => {
        if (!fire.children[0].visible) return;
        fire.scale.set(1 + 0.08 * Math.sin(time * 11), 1 + 0.16 * Math.sin(time * 7.3) + 0.08 * Math.sin(time * 17), 1 + 0.08 * Math.cos(time * 9));
        fire.updateMatrix(); fire.updateMatrixWorld(true);
      });
    }
    // logs to sit on, facing the fire
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.6, r = 2.5, lx = x + Math.cos(a) * r, lz = z + Math.sin(a) * r, ly = this.ground(lx, lz);
      const tx = -Math.sin(a), tz = Math.cos(a);
      wood.tint(0.62, 0.52, 0.4, 1).rod(V(lx - tx * 0.95, ly + 0.2, lz - tz * 0.95), V(lx + tx * 0.95, ly + 0.2, lz + tz * 0.95), 0.2, 8);
      const yaw = Math.atan2(x - lx, z - lz);
      for (const s of [-0.45, 0.45]) this.seats.push(seatAt(lx + tx * s, ly + 0.4, lz + tz * s, yaw));
      this.colliders.push({ type: 'circle', x: lx, z: lz, r: 0.5, y0: ly - 1, y1: ly + 0.5 });
    }
    // hammocks round the clearing, their heads towards the trees
    const tones = [POUF[0], POUF[2], POUF[1], POUF[4], POUF[6], POUF[3]];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.15, r = 8.2;
      this._hammock(parts, x + Math.cos(a) * r, z + Math.sin(a) * r, a + Math.PI / 2 + (k % 2 ? 0.35 : -0.3), tones[k]);
    }
    // two tents
    const cloth = parts.get('doubleSided');
    for (const [a, tone] of [[3.75, [0.72, 0.6, 0.36]], [5.35, [0.42, 0.5, 0.36]]]) {
      const tx0 = x + Math.cos(a) * 10.2, tz0 = z + Math.sin(a) * 10.2, ty = this.ground(tx0, tz0), yaw = -a + Math.PI / 2;
      cloth.tint(tone[0], tone[1], tone[2], 1).place(tx0, ty, tz0, yaw);
      const W = 1.25, H = 1.5, D = 1.35;
      cloth.quad(V(-W, 0, D), V(-W, 0, -D), V(0, H, -D), V(0, H, D), { tile: 1 });
      cloth.quad(V(W, 0, -D), V(W, 0, D), V(0, H, D), V(0, H, -D), { tile: 1 });
      cloth.tint(tone[0] * 0.8, tone[1] * 0.8, tone[2] * 0.8, 1).tri(V(-W, 0, -D), V(W, 0, -D), V(0, H, -D), { tile: 1 });
      cloth.pop();
      wood.tint(0.7, 0.62, 0.5, 1).place(tx0, ty, tz0, yaw).rod(V(0, -0.2, D), V(0, H + 0.1, D), 0.03, 5).rod(V(0, -0.2, -D), V(0, H + 0.1, -D), 0.03, 5).pop();
      this.colliders.push({ type: 'circle', x: tx0, z: tz0, r: 1.3 });
    }
    lantern(parts, x + 4.2, this.ground(x + 4.2, z - 3.6), z - 3.6, 2.0);
    lantern(parts, x - 4.4, this.ground(x - 4.4, z + 3.2), z + 3.2, 2.0);
    this._add('camp', parts);
  }

  // ---------------------------------------------------------------------------
  // Beanbags: at the north end of the beach, and on the deck over the pond. Sitting there, a laptop comes out.

  /** Rows of beanbag chairs facing `yaw`, on a grid given in the frame of the lounge; returns their places. */
  _chairs(b, spots, at, groundY, yaw, skip = () => false) {
    spots.forEach(([lx, lz], i) => {
      if (skip(i)) return;
      const [px, pz] = at(lx, lz), py = groundY(px, pz);
      const face = yaw + (((i * 37) % 11) / 11 - 0.5) * 0.5; // each turned a little its own way
      beanbagChair(b, px, py, pz, face, CANDY[(i * 7 + ((i * i) >> 2)) % CANDY.length], 0.96 + ((i * 13) % 5) * 0.025);
      this.seats.push(seatAt(px, py + CHAIR_SEAT, pz, face, { work: true, pose: ANIM.work, label: 'Sit down', reach: 1.5 }));
      this.colliders.push({ type: 'circle', x: px - Math.sin(face) * 0.38, z: pz - Math.cos(face) * 0.38, r: 0.36, y0: py - 1, y1: py + 0.7 });
    });
  }

  _beach() {
    const parts = new Parts();
    const b = parts.get('matte');
    const { x, z, yaw } = BEACH_LOUNGE;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    // five rows of five, stepping down towards the sea (which lies towards +X here)
    const spots = [];
    for (let row = 0; row < 5; row++) for (let k = 0; k < 5; k++) spots.push([-5.2 + row * 2.5 + (k % 2) * 0.35, -5 + k * 2.5 + (row % 2) * 0.5]);
    this._chairs(b, spots, at, this.ground, Math.PI / 2 + yaw * 0.4);
    for (const [lx, lz] of [[-3.9, -3.7], [1.1, -1.2], [-1.4, 3.8], [3.6, 3.9]]) {
      const [px, pz] = at(lx, lz);
      lowTable(parts, px, this.ground(px, pz) - 0.03, pz, 0.36);
      this.colliders.push({ type: 'circle', x: px, z: pz, r: 0.34, y0: -100, y1: this.ground(px, pz) + 0.5 });
    }
    // parasols, and strings of lights between poles round the lot
    [[-2.6, -1.3, CANDY[5]], [2.4, 1.4, CANDY[1]], [-0.2, -4.9, CANDY[0]], [0.6, 5.2, CANDY[7]]].forEach(([lx, lz, tone]) => {
      const [px, pz] = at(lx, lz);
      parasol(parts, px, this.ground(px, pz), pz, tone, 1.9);
      this.colliders.push({ type: 'circle', x: px, z: pz, r: 0.12 });
    });
    const wood = parts.get('woodDark');
    const poles = [[-7.2, -7.2], [0.5, -7.6], [7.4, -7.0], [7.6, 0.4], [7.2, 7.2], [-0.4, 7.6], [-7.4, 7.0], [-7.6, -0.2]].map(([lx, lz]) => {
      const [px, pz] = at(lx, lz), py = this.ground(px, pz);
      wood.tint(1.25, 1.2, 1.1, 1).rod(V(px, py - 0.5, pz), V(px, py + 3.0, pz), 0.05, 6);
      this.colliders.push({ type: 'circle', x: px, z: pz, r: 0.14 });
      return V(px, py + 2.95, pz);
    });
    poles.forEach((p, i) => lightString(parts, p, poles[(i + 1) % poles.length], 0.55));
    lightString(parts, poles[0], poles[4], 0.9);
    lightString(parts, poles[2], poles[6], 0.9);
    this._add('beach', parts);
  }

  _deck() {
    const parts = new Parts();
    const D = POND_DECK, y = D.y, c = Math.cos(D.yaw), s = Math.sin(D.yaw), hw = D.w / 2, hl = D.l / 2;
    const at = (lx, lz) => [D.x + lx * c + lz * s, D.z - lx * s + lz * c];
    const deck = parts.get('woodDeck'), wet = parts.get('woodWet'), wood = deck;
    // boards, joists, stilts down to the bed of the pond
    deck.place(D.x, y, D.z, D.yaw);
    const N = Math.round(D.l / 0.4);
    for (let i = 0; i < N; i++) {
      const z0 = -hl + (i / N) * D.l, k = 0.88 + 0.2 * (((i * 7) % 5) / 4);
      deck.tint(0.96 * k, 0.9 * k, 0.8 * k, 1).box(-hw, -0.06, z0, hw, 0, z0 + D.l / N - 0.02, { tile: 2, faces: 'xXzZY' });
    }
    deck.pop();
    wet.tint(0.8, 0.72, 0.62, 1);
    for (const lx of [-hw + 0.3, -hw / 2, 0, hw / 2, hw - 0.3]) {
      const [x0, z0] = at(lx, -hl + 0.1), [x1, z1] = at(lx, hl - 0.1);
      wet.beam(V(x0, y - 0.2, z0), V(x1, y - 0.2, z1), 0.16, 0.26, { tile: 1 });
      for (const lz of [-hl + 0.4, -hl / 3, hl / 3, hl - 0.4]) {
        const [px, pz] = at(lx, lz);
        wet.cylinder(px, this.ground(px, pz) - 0.5, pz, 0.14, 0.12, y - 0.2 - this.ground(px, pz) + 0.5, 7);
      }
    }
    this.platforms.push({ type: 'slab', x: D.x, z: D.z, hw, hl, yaw: D.yaw, y });
    // the gangway from the bank
    const [gx0, gz0] = D.gangway[0], [gx1, gz1] = D.gangway[1];
    const a = V(gx0, Math.max(this.ground(gx0, gz0), LEVELS.pondBig + 0.25) + 0.05, gz0), b = V(gx1, y, gz1);
    this.platforms.push(footbridge(parts, a, b, 1.5, { camber: 0, posts: 5, tint: [0.96, 0.9, 0.82], frameMat: 'woodDeck' }));
    for (const t of [0.3, 0.72]) {
      const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
      for (const sd of [-0.62, 0.62]) wet.cylinder(px + sd, this.ground(px + sd, pz) - 0.5, pz, 0.09, 0.08, a.y + (b.y - a.y) * t - 0.1 - this.ground(px + sd, pz) + 0.5, 6);
    }
    // railing all round, open where the gangway lands
    wood.tint(0.62, 0.52, 0.42, 1);
    const gl = ((gx1 - D.x) * c - (gz1 - D.z) * s); // where the gangway meets the north edge (local x)
    const runs = [[[-hw, -hl], [gl - 0.85, -hl]], [[gl + 0.85, -hl], [hw, -hl]], [[hw, -hl], [hw, hl]], [[hw, hl], [-hw, hl]], [[-hw, hl], [-hw, -hl]]];
    for (const [p0, p1] of runs) {
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      if (len < 0.4) continue;
      const n = Math.max(1, Math.round(len / 1.7));
      for (let i = 0; i <= n; i++) {
        const [px, pz] = at(p0[0] + ((p1[0] - p0[0]) * i) / n, p0[1] + ((p1[1] - p0[1]) * i) / n);
        wood.box(px - 0.045, y, pz - 0.045, px + 0.045, y + 0.98, pz + 0.045, { tile: 1 });
      }
      const [x0, z0] = at(p0[0], p0[1]), [x1, z1] = at(p1[0], p1[1]);
      wood.beam(V(x0, y + 0.98, z0), V(x1, y + 0.98, z1), 0.1, 0.06, { tile: 1 });
      wood.beam(V(x0, y + 0.52, z0), V(x1, y + 0.52, z1), 0.05, 0.05, { tile: 1 });
      this.colliders.push({ type: 'box', x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: len / 2, hl: 0.1, yaw: Math.atan2(-(z1 - z0), x1 - x0), y0: y - 0.5, y1: y + 3 });
    }
    // four rows of beanbag chairs facing the open water (an aisle from the gangway), one of them taken
    const cushions = parts.get('matte');
    const spots = [];
    for (let row = 0; row < 4; row++) for (let k = 0; k < 6; k++) spots.push([-6.4 + k * 2.56 + (row % 2) * 0.3, -3.6 + row * 2.5]);
    const GATOR = 22; // front row, towards the east end
    this._chairs(cushions, spots, at, () => y, D.yaw);
    {
      const [lx, lz] = spots[GATOR], [px, pz] = at(lx, lz);
      const seat = this.seats.find((q) => Math.abs(q.x - (px + Math.sin(q.yaw) * 0.22)) < 0.05 && Math.abs(q.z - (pz + Math.cos(q.yaw) * 0.22)) < 0.05);
      if (seat) this.seats.splice(this.seats.indexOf(seat), 1); // that one is taken
      const face = seat ? seat.yaw : D.yaw;
      alligator(cushions, px, y + CHAIR_SEAT - 0.24, pz, face);
      this.npcs.push({ id: 'alligator', name: 'Billy', x: px, y: y + 1.45, z: pz, reach: 2.6 });
    }
    for (const [lx, lz] of [[-5.1, -2.3], [0.0, 0.2], [5.2, -2.4], [-2.5, 2.7], [2.6, 2.6]]) { const [px, pz] = at(lx, lz); lowTable(parts, px, y, pz, 0.34); this.colliders.push({ type: 'circle', x: px, z: pz, r: 0.32, y0: y - 0.5, y1: y + 1 }); }
    for (const [lx, lz, tone] of [[-3.9, 1.3, CANDY[5]], [3.9, 1.3, CANDY[1]], [-1.3, -2.4, CANDY[0]]]) { const [px, pz] = at(lx, lz); parasol(parts, px, y, pz, tone, 1.8); this.colliders.push({ type: 'circle', x: px, z: pz, r: 0.1, y0: y - 0.5, y1: y + 3 }); }
    // posts at the corners and the middles of the long sides, strings of lights between them
    const posts = [[-hw + 0.12, -hl + 0.12], [0, -hl + 0.12], [hw - 0.12, -hl + 0.12], [hw - 0.12, hl - 0.12], [0, hl - 0.12], [-hw + 0.12, hl - 0.12]].map(([lx, lz]) => {
      const [px, pz] = at(lx, lz);
      wood.tint(0.7, 0.6, 0.5, 1).box(px - 0.05, y, pz - 0.05, px + 0.05, y + 3.0, pz + 0.05, { tile: 1 });
      return V(px, y + 2.95, pz);
    });
    posts.forEach((p, i) => lightString(parts, p, posts[(i + 1) % posts.length], 0.5));
    lightString(parts, posts[0], posts[3], 0.8); lightString(parts, posts[2], posts[5], 0.8); lightString(parts, posts[1], posts[4], 0.7);
    this._add('deck', parts);
  }

  update(dt, time, camera) {
    for (const a of this.animated) a(dt, time);
    if (camera) { this._cull(camera.position); this.plaques?.update(camera.position); }
  }
}
