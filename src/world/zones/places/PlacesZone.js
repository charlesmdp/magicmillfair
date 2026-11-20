// Places reached from the valley: the stairway cut in the rock and the village high above, the island and its
// winding path, the camp and its hammocks, the beanbags of the beach and of the deck on the pond.
// Each place is merged into one mesh per material and hidden when too far to matter.
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';
import { staticCaster, LAYER } from '../../../render/Shadows.js';
import { mergeStatic, distanceCuller } from '../../props/StaticBatch.js';
import { stairs, wall, footbridge } from '../../props/Structures.js';
import { buildOutbuilding } from '../mill/MillHouse.js';
import { Corridor, Polygon } from '../../Areas.js';
import { buildCave } from './Caves.js';
import { seatAt } from '../../../player/PlayerController.js';
import { ANIM } from '../../../player/Character.js';
import { STAIRWAY, VILLAGE, ISLAND, islandPath, CAMP, BEACH_LOUNGE, POND_DECK, LEVELS, CAVES } from '../../layout/layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// beanbag colours (linear-ish albedo): no two neighbours alike
const POUF = [[0.75, 0.12, 0.1], [0.9, 0.62, 0.08], [0.07, 0.42, 0.44], [0.86, 0.34, 0.5], [0.16, 0.3, 0.68], [0.85, 0.36, 0.08], [0.3, 0.55, 0.2], [0.5, 0.25, 0.6], [0.88, 0.82, 0.7], [0.1, 0.55, 0.7]];

/** Beanbag: a slumped cushion one sinks into. */
function pouf(b, x, y, z, size, color, rot = 0) {
  b.tint(color[0], color[1], color[2], 1);
  b.place(x, y, z, rot);
  const s = size;
  b.lathe([[0.03, 0.01], [0.42 * s, 0.0], [0.56 * s, 0.12 * s], [0.58 * s, 0.3 * s], [0.48 * s, 0.46 * s], [0.28 * s, 0.52 * s], [0.03, 0.44 * s]], 12, { tile: 1 });
  // the seam and its piping
  b.tint(color[0] * 0.6, color[1] * 0.6, color[2] * 0.6, 1);
  b.lathe([[0.585 * s, 0.19 * s], [0.6 * s, 0.21 * s], [0.585 * s, 0.23 * s]], 12, { tile: 1 });
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
    this._stairway();
    this._village();
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
      [/^village:(stone|slate)$/, Infinity], [/^stairway:rock$/, Infinity], [/^stairway:/, 420 * k], [/^village:/, 300 * k],
      [/^cave-\w+:cave$/, 170 * k], [/^cave-/, 80 * k], [/^island:/, 340 * k], [/^camp/, 230 * k], [/^beach:/, 280 * k], [/^deck:(woodDeck|woodWet)$/, 520 * k], [/^deck:/, 240 * k],
    ]);
    return this;
  }

  // ---------------------------------------------------------------------------
  // The stairway: five flights of steps cut in the rock, a landing at each corner

  _stairway() {
    const parts = new Parts();
    const rock = parts.get('rock'), slab = parts.get('granite');
    const pts = STAIRWAY.points, w = STAIRWAY.width, L = STAIRWAY.landing;
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
    // at the foot: two standing stones mark the way up
    const [fx, fz, fy] = pts[0], [nx, nz] = pts[1];
    const l0 = Math.hypot(nx - fx, nz - fz), tx = (nx - fx) / l0, tz = (nz - fz) / l0;
    for (const s of [-1, 1]) {
      const px = fx - tx * 1.2 + -tz * s * 2.0, pz = fz - tz * 1.2 + tx * s * 2.0, gy = this.ground(px, pz);
      rock.tint(0.86, 0.84, 0.8, 1).place(px, gy - 0.3, pz, 0.4 * s, 0.05 * s, 0).box(-0.32, 0, -0.26, 0.32, 2.3, 0.26, { tile: 1.6 }).box(-0.2, 2.3, -0.16, 0.2, 2.6, 0.16, { tile: 1.6 }).pop();
      this.colliders.push({ type: 'circle', x: px, z: pz, r: 0.45 });
    }
    void fy;
    this.areas.push(new Corridor(nodes, { name: 'stairway' }));
    this._add('stairway', parts);
  }

  // ---------------------------------------------------------------------------
  // The village: a few stone houses round a square, a chapel, a fountain, and the lookout over the valley

  _village() {
    const y = VILLAGE.y + 0.04;
    const tan = (deg) => Math.tan((deg * Math.PI) / 180);
    VILLAGE.houses.forEach((h, i) => {
      const p = new Parts(), hl = h.l / 2;
      buildOutbuilding(p, {
        W: h.w, L: h.l, eave: h.h, ridge: h.h + (h.w / 2) * tan(40 + (i % 3) * 3), base: -1.2,
        doors: [{ side: 'e', at: hl + (i % 2 ? 0.9 : -0.6), w: 1.05, h: 2.02 }],
        windows: [
          { side: 'e', at: hl - 2.5, sill: 1.05 }, { side: 'e', at: hl + 2.6, sill: 1.05 },
          { side: 'w', at: hl - 1.6, sill: 1.1 }, { side: 'w', at: hl + 1.8, sill: 1.1 },
          { side: i % 2 ? 's' : 'n', at: h.w / 2, sill: 1.15, w: 0.8 },
        ],
        chimneyAt: (i % 2 ? 1 : -1) * (hl - 0.35), copings: i % 2 === 0,
      });
      // a stone step at the door (the wall runs from +Z to -Z)
      const st = p.get('granite'), dz = i % 2 ? -0.9 : 0.6;
      st.tint(0.8, 0.78, 0.75, 1).box(h.w / 2, -0.3, dz - 0.8, h.w / 2 + 0.5, 0.08, dz + 0.8, { tile: 1 });
      this._add('village', p, h, y);
      this.colliders.push({ type: 'box', x: h.x, z: h.z, hw: h.w / 2 + 0.12, hl: hl + 0.12, yaw: h.yaw });
    });
    {
      // the chapel: a taller nave, a bell in its little tower over the door
      const c = VILLAGE.chapel, p = new Parts(), hl = c.l / 2, ridge = c.h + (c.w / 2) * tan(52);
      buildOutbuilding(p, {
        W: c.w, L: c.l, eave: c.h, ridge, base: -1.2,
        doors: [{ side: 's', at: c.w / 2, w: 1.2, h: 2.3 }],
        windows: [{ side: 'e', at: hl - 1.6, sill: 1.3, w: 0.55, h: 1.3 }, { side: 'e', at: hl + 1.6, sill: 1.3, w: 0.55, h: 1.3 }, { side: 'w', at: hl - 1.6, sill: 1.3, w: 0.55, h: 1.3 }, { side: 'w', at: hl + 1.6, sill: 1.3, w: 0.55, h: 1.3 }],
        copings: true,
      });
      const stone = p.get('stone'), slate = p.get('slate'), paint = p.get('paint');
      const z0 = hl - 0.7, z1 = hl + 0.05, top = ridge + 2.4;
      stone.tint(0.96, 0.95, 0.94, 1);
      for (const s of [-1, 1]) stone.box(s * 0.75 - 0.22, ridge - 1.2, z0, s * 0.75 + 0.22, top, z1, { tile: 2 });
      stone.box(-0.97, top, z0 - 0.05, 0.97, top + 0.3, z1 + 0.05, { tile: 2 });
      slate.tint(0.9, 0.9, 0.92, 1);
      const apex = V(0, top + 1.3, (z0 + z1) / 2), q = [V(-1.05, top + 0.3, z1 + 0.12), V(1.05, top + 0.3, z1 + 0.12), V(1.05, top + 0.3, z0 - 0.12), V(-1.05, top + 0.3, z0 - 0.12)];
      for (let k = 0; k < 4; k++) slate.tri(q[k], q[(k + 1) % 4], apex, { tile: 2 });
      paint.tint(0.35, 0.27, 0.1, 1).place(0, ridge + 1.05, (z0 + z1) / 2).lathe([[0.3, 0.0], [0.25, 0.12], [0.17, 0.36], [0.05, 0.44]], 10).pop(); // the bell
      this._add('village', p, c, y);
      this.colliders.push({ type: 'box', x: c.x, z: c.z, hw: c.w / 2 + 0.12, hl: hl + 0.12, yaw: c.yaw });
    }
    const parts = new Parts();
    {
      // fountain in the middle of the square
      const f = VILLAGE.fountain, g = parts.get('granite'), water = parts.get('glass');
      g.tint(0.8, 0.79, 0.76, 1).place(f.x, y, f.z);
      g.lathe([[1.75, -0.3], [1.75, 0.62], [1.5, 0.62], [1.5, 0.12], [0.3, 0.1], [0.3, 1.5], [0.55, 1.6], [0.55, 1.7], [0.1, 1.95]], 14, { tile: 1.5 });
      g.pop();
      water.tint(0.5, 0.75, 0.8, 1).cylinder(f.x, y + 0.5, f.z, 1.5, 1.5, 0.02, 14);
      this.colliders.push({ type: 'circle', x: f.x, z: f.z, r: 1.85 });
    }
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
      for (const [lx, lz] of [[-355.6, 33.2], [-355.6, 26.8], [-372, 30], [-384, 44], [-370, 46]]) lantern(parts, lx, y, lz, 2.3);
    }
    this.areas.push(new Polygon(VILLAGE.outline, { name: 'village' }));
    this._add('village', parts);
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
    for (const u of ISLAND.beams) {
      // planks on two beams, out over the drop: find the edge of the cliff first
      const p = islandPath(u);
      let edge = w2;
      while (edge < w2 + 4 && this.ground(p.x + p.nx * (edge + 0.5), p.z + p.nz * (edge + 0.5)) > p.y - 0.8) edge += 0.25;
      const cx = p.x + p.nx * (edge + 0.5), cz = p.z + p.nz * (edge + 0.5), y = p.y + 0.12;
      const yaw = Math.atan2(-p.tz, p.tx); // local X along the path
      wood.tint(0.8, 0.72, 0.6, 1);
      for (const s of [-1.2, 1.2]) {
        const bx = p.x + p.tx * s, bz = p.z + p.tz * s;
        wood.beam(V(bx + p.nx * (edge - 1.6), y - 0.13, bz + p.nz * (edge - 1.6)), V(bx + p.nx * (edge + 1.15), y - 0.13, bz + p.nz * (edge + 1.15)), 0.2, 0.22, { tile: 1 });
      }
      deck.tint(0.95, 0.88, 0.78, 1).place(cx, y, cz, yaw).box(-1.75, -0.05, -0.62, 1.75, 0, 0.62, { tile: 1.4 }).pop();
      this.platforms.push({ type: 'slab', x: cx, z: cz, hw: 1.75, hl: 0.62, yaw, y });
    }
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

  _beach() {
    const parts = new Parts();
    const b = parts.get('matte');
    const { x, z, yaw } = BEACH_LOUNGE;
    const spots = [[-3.6, -3.4], [-1.1, -4.3], [1.5, -4.0], [3.6, -2.4], [-4.2, -0.6], [4.4, 0.4], [-3.0, 2.3], [-0.4, 3.2], [2.4, 2.9], [0.2, -1.2]];
    const c = Math.cos(yaw), s = Math.sin(yaw);
    spots.forEach(([lx, lz], i) => {
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c, py = this.ground(px, pz);
      // every bag turned towards the sea, give or take
      const face = Math.PI / 2 + (((i * 37) % 11) / 11 - 0.5) * 0.9;
      pouf(b, px, py - 0.02, pz, 1 + ((i * 13) % 5) * 0.04, POUF[i % POUF.length], i * 0.7);
      this.seats.push(seatAt(px, py + 0.37, pz, face, { work: true, pose: ANIM.work, label: 'Sit down' }));
      this.colliders.push({ type: 'circle', x: px, z: pz, r: 0.42, y0: py - 1, y1: py + 0.45 });
    });
    for (const [lx, lz] of [[-1.6, -1.6], [2.2, 0.2]]) {
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      lowTable(parts, px, this.ground(px, pz) - 0.03, pz);
      this.colliders.push({ type: 'circle', x: px, z: pz, r: 0.4 });
    }
    {
      // a sail for shade, on four leaning poles
      const wood = parts.get('woodDark'), cloth = parts.get('doubleSided');
      const corner = (lx, lz, h) => { const px = x + lx * c + lz * s, pz = z - lx * s + lz * c; return [px, this.ground(px, pz), pz, h]; };
      const posts = [corner(-5.2, -5.2, 3.5), corner(5.4, -4.6, 2.9), corner(5.0, 4.4, 3.4), corner(-5.4, 4.6, 2.8)];
      const tops = posts.map(([px, py, pz, h]) => {
        wood.tint(0.8, 0.72, 0.6, 1).rod(V(px, py - 0.5, pz), V(px + (x - px) * 0.04, py + h, pz + (z - pz) * 0.04), 0.07, 7);
        this.colliders.push({ type: 'circle', x: px, z: pz, r: 0.16 });
        return V(px + (x - px) * 0.16, py + h - 0.15, pz + (z - pz) * 0.16);
      });
      // (the canvas lets the light through: lit from within rather than dark underneath)
      const sail = parts.get('glow');
      sail.tint(0.26, 0.25, 0.2, 1).quad(tops[0], tops[1], tops[2], tops[3], { tile: 1 }).quad(tops[3], tops[2], tops[1], tops[0], { tile: 1 });
      void cloth;
      for (const [px, py, pz] of [corner(-5.9, 0, 0), corner(6.0, -1.5, 0)]) lantern(parts, px, py, pz, 2.0);
    }
    this._add('beach', parts);
  }

  _deck() {
    const parts = new Parts();
    const D = POND_DECK, y = D.y, c = Math.cos(D.yaw), s = Math.sin(D.yaw), hw = D.w / 2, hl = D.l / 2;
    const at = (lx, lz) => [D.x + lx * c + lz * s, D.z - lx * s + lz * c];
    const deck = parts.get('woodDeck'), wet = parts.get('woodWet'), wood = deck;
    // boards, joists, stilts down to the bed of the pond
    deck.tint(0.96, 0.9, 0.8, 1).place(D.x, y, D.z, D.yaw);
    for (let i = 0; i < 20; i++) {
      const z0 = -hl + (i / 20) * D.l, k = 0.88 + 0.2 * (((i * 7) % 5) / 4);
      deck.tint(0.96 * k, 0.9 * k, 0.8 * k, 1).box(-hw, -0.06, z0, hw, 0, z0 + D.l / 20 - 0.02, { tile: 2, faces: 'xXzZY' });
    }
    deck.pop();
    wet.tint(0.8, 0.72, 0.62, 1);
    for (const lx of [-hw + 0.3, 0, hw - 0.3]) {
      const [x0, z0] = at(lx, -hl + 0.1), [x1, z1] = at(lx, hl - 0.1);
      wet.beam(V(x0, y - 0.2, z0), V(x1, y - 0.2, z1), 0.16, 0.26, { tile: 1 });
      for (const lz of [-hl + 0.4, 0, hl - 0.4]) {
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
    // beanbags, a low table, lanterns at the corners
    const b2 = parts.get('matte');
    const spots = [[-3.4, 2.4, 0.2], [-1.2, 2.9, 0.0], [1.3, 2.8, -0.1], [3.5, 2.2, -0.35], [-3.6, -0.4, 0.5], [3.6, -0.6, -0.6], [0.0, 0.2, 0.0]];
    spots.forEach(([lx, lz, turn], i) => {
      const [px, pz] = at(lx, lz);
      pouf(b2, px, y, pz, 1 + ((i * 11) % 4) * 0.04, POUF[(i + 3) % POUF.length], i * 1.1);
      // facing the open water (local +Z), give or take
      this.seats.push(seatAt(px, y + 0.39, pz, D.yaw + turn, { work: true, pose: ANIM.work, label: 'Sit down' }));
      this.colliders.push({ type: 'circle', x: px, z: pz, r: 0.42, y0: y - 0.5, y1: y + 0.45 });
    });
    for (const [lx, lz] of [[-1.9, 1.0], [2.0, 0.9]]) { const [px, pz] = at(lx, lz); lowTable(parts, px, y, pz, 0.4); this.colliders.push({ type: 'circle', x: px, z: pz, r: 0.38, y0: y - 0.5, y1: y + 1 }); }
    for (const [lx, lz] of [[-hw + 0.15, -hl + 0.15], [hw - 0.15, -hl + 0.15], [hw - 0.15, hl - 0.15], [-hw + 0.15, hl - 0.15]]) { const [px, pz] = at(lx, lz); lantern(parts, px, y, pz, 1.9); }
    this._add('deck', parts);
  }

  update(dt, time, camera) {
    for (const a of this.animated) a(dt, time);
    if (camera) this._cull(camera.position);
  }
}
