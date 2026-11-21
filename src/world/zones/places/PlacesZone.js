// Places reached from the valley: the stairway cut in the rock and the temple high above, the terraces over
// the great waterfall, the island and its winding path, the camp and its hammocks, the beanbags of the beach
// and of the deck on the pond, the secret cove and the fall that drops from the cliffs into the sea.
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
import { seatAt } from '../../../player/PlayerController.js';
import { ANIM } from '../../../player/Character.js';
import { STAIRWAY, VILLAGE, FALLS, COVE, ISLAND, islandPath, CAMP, BEACH_LOUNGE, POND_DECK, LEVELS, CAVES } from '../../layout/layout.js';

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
    this._cove();
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
      [/^terraces:rock$/, 600 * k], [/^terraces:/, 260 * k], [/^cove:/, 260 * k], [/^seafall/, Infinity],
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
  // The secret cove: a beach shut in by the cliffs. A boat pulled up on the sand, a fire, a hammock, a chest.

  _cove() {
    const parts = new Parts();
    const wood = parts.get('woodDark'), rock = parts.get('rock'), paint = parts.get('paint');
    const { x, z, yaw } = COVE, fx = Math.sin(yaw), fz = Math.cos(yaw), sx = fz, sz = -fx; // towards the sea, and along the beach
    const at = (f, s) => [x + fx * f + sx * s, z + fz * f + sz * s];
    {
      // the boat: clinker planks, two thwarts, an oar across them
      const [bx, bz] = at(1.5, 4.6), by = this.ground(bx, bz) + 0.1, a = yaw + 0.5;
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
    {
      // the fire: a ring of stones, two logs to sit on, facing the sea
      const [cx, cz] = at(-1.5, -1.5), cy = this.ground(cx, cz);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; rock.tint(0.82 + 0.06 * (k % 2), 0.8, 0.76, 1).place(cx + Math.cos(a) * 0.7, cy - 0.05, cz + Math.sin(a) * 0.7, a * 1.7).cube(0, 0.1, 0, 0.32, 0.26, 0.26, { tile: 1 }).pop(); }
      wood.tint(0.26, 0.22, 0.2, 1);
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI + 0.4; wood.rod(V(cx - Math.cos(a) * 0.45, cy + 0.08, cz - Math.sin(a) * 0.45), V(cx + Math.cos(a) * 0.45, cy + 0.26, cz + Math.sin(a) * 0.45), 0.08, 6); }
      parts.get('glow').tint(1, 0.5, 0.14, 1).cylinder(cx, cy + 0.12, cz, 0.24, 0.02, 0.6, 6, { capTop: false });
      this.colliders.push({ type: 'circle', x: cx, z: cz, r: 0.85 });
      for (const s of [-1, 1]) {
        const lx = cx - fx * 1.9 + sx * s * 1.5, lz = cz - fz * 1.9 + sz * s * 1.5, ly = this.ground(lx, lz), tx = Math.cos(yaw - s * 0.5), tz = -Math.sin(yaw - s * 0.5);
        wood.tint(0.62, 0.52, 0.4, 1).rod(V(lx - tx * 0.9, ly + 0.2, lz - tz * 0.9), V(lx + tx * 0.9, ly + 0.2, lz + tz * 0.9), 0.2, 8);
        for (const o of [-0.42, 0.42]) this.seats.push(seatAt(lx + tx * o, ly + 0.4, lz + tz * o, Math.atan2(cx - lx, cz - lz)));
        this.colliders.push({ type: 'circle', x: lx, z: lz, r: 0.5, y0: ly - 1, y1: ly + 0.5 });
      }
    }
    {
      // a chest half buried in the sand, its lid open on something that shines
      const [tx, tz] = at(-5.2, 3.4), ty = this.ground(tx, tz);
      wood.tint(0.42, 0.28, 0.16, 1).place(tx, ty - 0.12, tz, yaw + 2.2, 0.08, 0.1).box(-0.42, 0, -0.28, 0.42, 0.44, 0.28, { tile: 1, faces: 'xXzZy' });
      wood.place(0, 0.44, -0.28, 0, -1.15).box(-0.42, 0, 0, 0.42, 0.06, 0.56, { tile: 1 }).pop();
      wood.pop();
      paint.tint(1.4, 1.0, 0.25, 1).place(tx, ty - 0.12, tz, yaw + 2.2, 0.08, 0.1).box(-0.44, 0.1, -0.3, -0.36, 0.34, 0.3).box(0.36, 0.1, -0.3, 0.44, 0.34, 0.3).pop();
      parts.get('glow').tint(1, 0.78, 0.2, 1).place(tx, ty + 0.2, tz, yaw + 2.2).lathe([[0.0, 0.0], [0.3, 0.0], [0.22, 0.1], [0.0, 0.16]], 7).pop();
      this.colliders.push({ type: 'circle', x: tx, z: tz, r: 0.5 });
    }
    // a hammock between its posts, and two beanbag chairs: nobody will come and disturb you here
    {
      const [hx, hz] = at(-4.6, -5.4);
      this._hammock(parts, hx, hz, yaw + 1.2, POUF[5]);
      const b = parts.get('matte');
      this._chairs(b, [[1.2, -4.4], [0.6, -6.4]], at, this.ground, yaw);
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
        if (k === 2) continue; // where the path comes up
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
      this.npcs.push({ id: 'alligator', name: 'Al', x: px, y: y + 1.45, z: pz, reach: 2.6 });
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
    if (camera) this._cull(camera.position);
  }
}
