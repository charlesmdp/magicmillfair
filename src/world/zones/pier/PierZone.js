// The seafront: boardwalk promenade, the great pier on its timber piles, and the big wheel.
import * as THREE from 'three';
import { Parts, MeshBuilder } from '../../props/MeshBuilder.js';
import { LAYER, staticCaster } from '../../../render/Shadows.js';
import { ANIM, SEAT } from '../../../player/Character.js';
import { seatAt } from '../../../player/PlayerController.js';
import { drawSponsor, canvasBoard } from '../games/Boards.js';
import { PIER, PROMENADE, COAST, pierToWorld, BEACH_LOUNGE } from '../../layout/layout.js';
import { roadRibbon } from '../../props/Structures.js';
import { distanceCuller, mergeStatic } from '../../props/StaticBatch.js';
import { surfaceMaterial } from '../../../render/SurfaceMaterial.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// cheerful fairground palette (linear-ish albedo values)
const PAL = { red: [0.62, 0.07, 0.06], cream: [0.86, 0.8, 0.66], teal: [0.05, 0.4, 0.42], yellow: [0.85, 0.6, 0.08], blue: [0.1, 0.25, 0.6], pink: [0.8, 0.3, 0.42], orange: [0.82, 0.32, 0.06], white: [0.9, 0.9, 0.88], green: [0.1, 0.42, 0.2] };
const GONDOLA = ['red', 'yellow', 'teal', 'orange', 'blue', 'pink'];

export function deckHeight(along) {
  return lerp(PROMENADE.y + 0.07, PIER.deckY, smooth(0, PIER.rampLength, along));
}

export class PierZone {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'zone:pier';
    this.cast = staticCaster(world.engine.tier);
    this.platforms = [];
    this.colliders = [];
    this.animated = [];
    this.ground = (x, z) => this.data.heightAt(x, z);
    this._surf = new Float32Array(8);
  }

  build() {
    // everything on the pier is modelled in the pier frame: x along it, z across, y = world height
    this.frame = new THREE.Group();
    this.frame.position.set(PIER.rootX, 0, PIER.rootZ);
    this.frame.rotation.y = -PIER.heading;
    this.group.add(this.frame);

    const world = new Parts();
    this._promenade(world);
    this._beach(world);
    const shore = world.toMeshes(this.world.materials, { name: 'seafront', layers: this.cast });
    this.group.add(shore);

    const pier = new Parts();
    this._deck(pier);
    this._railings(pier);
    this._lamps(pier);
    this._arch(pier);
    this._kiosks(pier);
    this._wheelFrame(pier);
    const deck = pier.toMeshes(this.world.materials, { name: 'pier', layers: this.cast });
    this.frame.add(deck);
    this.group.updateMatrixWorld(true);
    // one mesh per material for everything that stands still (promenade and pier together)
    this.group.add(mergeStatic([shore, deck], 'seafront'));
    this._wheel();
    this._sign();
    this.group.updateMatrixWorld(true);
    // small things vanish with distance; the pier and its wheel stay as landmarks
    this._cull = distanceCuller(this.group, [[/big-wheel/, Infinity], [/:glow$/, 300], [/^seafront:doubleSided$/, 420], [/pier-sign/, 420]]);

    const half = PIER.width / 2, head0 = PIER.length - PIER.headLength;
    this.platforms.push({ type: 'pier', x0: 0, x1: PIER.length, half, head0, headHalf: PIER.headWidth / 2 });
    return this;
  }

  /** Is (x, z) over the pier deck? Returns the deck height or null. */
  deckAt(x, z) {
    const c = Math.cos(PIER.heading), s = Math.sin(PIER.heading);
    const dx = x - PIER.rootX, dz = z - PIER.rootZ;
    const u = dx * c + dz * s, v = -dx * s + dz * c;
    if (u < -1.5 || u > PIER.length) return null;
    const half = u > PIER.length - PIER.headLength ? PIER.headWidth / 2 : PIER.width / 2;
    if (Math.abs(v) > half) return null;
    return deckHeight(Math.max(0, u));
  }

  // ---- seafront (world coordinates)

  _promenade(parts) {
    const deck = parts.get('woodDeck');
    deck.tint(1.02, 0.98, 0.92, 1);
    const samples = this.data.meta.promenade.map(([x, z]) => [x, z, 0]);
    roadRibbon(deck, samples, PROMENADE.width, { groundAt: () => PROMENADE.y, lift: 0.07, tile: 2, edgeFade: false, step: 0 });
    // plaza paving
    const pave = parts.get('paving');
    pave.tint(0.95, 0.92, 0.86, 1);
    const pz = PROMENADE.plaza;
    pave.cylinder(pz.x, PROMENADE.y - 0.3, pz.z, pz.r, pz.r, 0.36, 28, { tile: 2 });
    // kerbs along the boardwalk
    const wood = parts.get('woodDark');
    wood.tint(0.9, 0.84, 0.76, 1);
    const iron = parts.get('paint'), glow = parts.get('glow'), flags = parts.get('doubleSided');
    let acc = 0;
    let prevLamp = null, k = 0;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let nx = b[1] - a[1], nz = -(b[0] - a[0]);
      nx /= seg; nz /= seg; // left of travel; the sea is on the right going south
      for (const s of [-1, 1]) {
        const o = s * (PROMENADE.width / 2 + 0.06);
        wood.beam(V(a[0] + nx * o, PROMENADE.y + 0.1, a[1] + nz * o), V(b[0] + nx * o, PROMENADE.y + 0.1, b[1] + nz * o), 0.16, 0.2, { tile: 1 });
      }
      acc += seg;
      if (acc >= 15) {
        acc = 0; k++;
        // lamp post on the sea side
        const o = -(PROMENADE.width / 2 - 0.5);
        const lx = b[0] + nx * o, lz = b[1] + nz * o;
        if (Math.hypot(lx - PIER.rootX, lz - PIER.rootZ) < 13) continue;
        this._lamp(iron, glow, lx, PROMENADE.y + 0.07, lz, 4.6, PAL.teal);
        if (prevLamp) this._bunting(flags, V(prevLamp[0], PROMENADE.y + 4.3, prevLamp[1]), V(lx, PROMENADE.y + 4.3, lz), k);
        prevLamp = [lx, lz];
        // a bench facing the sea
        const bx = b[0] - nx * 2.2, bz = b[1] - nz * 2.2;
        this._bench(parts, bx, PROMENADE.y + 0.07, bz, Math.atan2(-nx, -nz));
      }
    }
    // steps from the boardwalk down to the sand, every now and then
    const g = parts.get('granite');
    g.tint(0.8, 0.78, 0.74, 1);
    for (let i = 8; i < samples.length - 6; i += 22) {
      const a = samples[i - 1], b = samples[i + 1];
      let nx = b[1] - a[1], nz = -(b[0] - a[0]);
      const l = Math.hypot(nx, nz); nx /= l; nz /= l;
      const p = samples[i];
      const bx = p[0] - nx * (PROMENADE.width / 2 + 0.2), bz = p[1] - nz * (PROMENADE.width / 2 + 0.2);
      for (let s = 0; s < 6; s++) {
        const sx = bx - nx * s * 0.5, sz = bz - nz * s * 0.5;
        g.place(sx, 0, sz, Math.atan2(nx, nz));
        g.box(-1.6, PROMENADE.y - 1.4 - s * 0.16, -0.25, 1.6, PROMENADE.y - s * 0.16, 0.25, { tile: 1 });
        g.pop();
      }
    }
  }

  _lamp(iron, glow, x, y, z, h, col) {
    iron.tint(col[0], col[1], col[2], 1);
    iron.place(x, y, z);
    iron.lathe([[0.2, 0], [0.16, 0.3], [0.08, 0.5], [0.06, h - 0.5], [0.1, h - 0.4], [0.05, h - 0.3], [0.05, h]], 8);
    iron.lathe([[0.03, h], [0.22, h + 0.06], [0.03, h + 0.12]], 8);
    iron.pop();
    glow.tint(1, 0.93, 0.78, 1);
    glow.place(x, y + h + 0.32, z).lathe([[0.02, -0.2], [0.16, -0.14], [0.22, 0], [0.16, 0.14], [0.02, 0.2]], 8).pop();
  }

  _bunting(b, p0, p1, seed) {
    const cols = [PAL.red, PAL.yellow, PAL.teal, PAL.cream, PAL.blue, PAL.orange];
    const n = Math.max(6, Math.round(p0.distanceTo(p1) / 0.7));
    const dir = p1.clone().sub(p0).normalize();
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 0.8) / n;
      const sag = (t) => Math.sin(Math.PI * t) * 0.9;
      const a = p0.clone().lerp(p1, t0); a.y -= sag(t0);
      const c = p0.clone().lerp(p1, t1); c.y -= sag(t1);
      const m = a.clone().lerp(c, 0.5); m.y -= 0.42;
      const col = cols[(i + seed) % cols.length];
      b.tint(col[0] * 1.2, col[1] * 1.2, col[2] * 1.2, 1);
      b.tri(a, c, m, { tile: 1 });
    }
    void dir;
  }

  _bench(parts, x, y, z, yaw) {
    const wood = parts.get('woodDark'), iron = parts.get('paint');
    wood.tint(0.95, 0.8, 0.62, 1); iron.tint(0.08, 0.1, 0.1, 1);
    for (const b of [wood, iron]) b.place(x, y, z, yaw);
    wood.box(-0.9, 0.42, -0.24, 0.9, 0.47, 0.22, { tile: 1 });
    wood.box(-0.9, 0.6, 0.2, 0.9, 0.95, 0.25, { tile: 1 });
    for (const sx of [-0.8, 0.8]) { iron.box(sx - 0.03, 0, -0.22, sx + 0.03, 0.42, 0.22); iron.box(sx - 0.03, 0.42, 0.18, sx + 0.03, 0.95, 0.24); }
    for (const b of [wood, iron]) b.pop();
    // two places, back to the backrest (which is on the +Z side of the bench)
    const ax = Math.cos(yaw), az = -Math.sin(yaw);
    for (const s of [-0.45, 0.45]) this.world.seats.push(seatAt(x + ax * s, y + 0.47, z + az * s, yaw + Math.PI));
    this.colliders.push({ type: 'box', x, z, hw: 0.9, hl: 0.27, yaw, y0: y - 1, y1: y + 0.7 });
  }

  _beach(parts) {
    // On the sand, seaward of the boardwalk: beach huts in a row, facing the sea, then parasols and towels.
    // (n below points from the boardwalk towards the sea: the promenade is listed from north to south.)
    const paint = parts.get('paint'), cloth = parts.get('doubleSided');
    const samples = this.data.meta.promenade;
    const hues = [PAL.red, PAL.teal, PAL.yellow, PAL.blue, PAL.pink, PAL.orange, PAL.green];
    const brook = this.data.meta.streams.find((q) => q.id === 'brook').samples;
    // (nothing in the brook, nor where the beanbags are)
    const nearBrook = (x, z, r) => brook.some((q) => (q[0] - x) ** 2 + (q[1] - z) ** 2 < r * r) || (x - BEACH_LOUNGE.x) ** 2 + (z - BEACH_LOUNGE.z) ** 2 < (BEACH_LOUNGE.r + r) ** 2;
    let n = 0;
    for (let i = 3; i < samples.length - 3; i++) {
      const p = samples[i], a = samples[i - 1], b = samples[i + 1];
      let nx = b[1] - a[1], nz = -(b[0] - a[0]);
      const l = Math.hypot(nx, nz); nx /= l; nz /= l;
      const dPier = Math.hypot(p[0] - PIER.rootX, p[1] - PIER.rootZ);
      // huts: two rows of twelve on either side of the pier
      const hx = p[0] + nx * (PROMENADE.width / 2 + 3.4), hz = p[1] + nz * (PROMENADE.width / 2 + 3.4);
      if (dPier > 22 && dPier < 78 && i % 2 === 0 && !nearBrook(hx, hz, 7)) {
        const gy = this.ground(hx, hz);
        const col = hues[n++ % hues.length];
        const yaw = Math.atan2(nx, nz);
        paint.place(hx, gy + 0.25, hz, yaw);
        // stilts, striped body, little gable roof, door
        paint.tint(0.9, 0.88, 0.84, 1);
        for (const [sx, sz] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) paint.box(sx - 0.05, -0.8, sz - 0.05, sx + 0.05, 0.05, sz + 0.05);
        for (let s = 0; s < 6; s++) {
          const c = s % 2 ? PAL.white : col;
          paint.tint(c[0], c[1], c[2], 1);
          const x0 = -0.95 + (s * 1.9) / 6, x1 = x0 + 1.9 / 6;
          paint.box(x0, 0, -0.95, x1, 2.0, 0.95, { faces: 'zZ' });
        }
        paint.tint(col[0], col[1], col[2], 1);
        paint.box(-0.95, 0, -0.95, 0.95, 2.0, 0.95, { faces: 'xXy' });
        paint.tint(0.92, 0.9, 0.86, 1);
        paint.quad(V(-1.1, 1.95, 1.1), V(1.1, 1.95, 1.1), V(1.1, 1.95, -1.1), V(-1.1, 1.95, -1.1));
        paint.tint(col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 1);
        paint.quad(V(-1.1, 1.95, 1.1), V(0, 2.75, 1.1), V(0, 2.75, -1.1), V(-1.1, 1.95, -1.1));
        paint.quad(V(0, 2.75, 1.1), V(1.1, 1.95, 1.1), V(1.1, 1.95, -1.1), V(0, 2.75, -1.1));
        paint.tri(V(-0.95, 2.0, 0.95), V(0.95, 2.0, 0.95), V(0, 2.68, 0.95));
        paint.tri(V(0.95, 2.0, -0.95), V(-0.95, 2.0, -0.95), V(0, 2.68, -0.95));
        paint.tint(0.95, 0.93, 0.88, 1);
        paint.box(-0.36, 0.05, 0.95, 0.36, 1.75, 0.98);
        paint.pop();
        this.colliders.push({ type: 'circle', x: hx, z: hz, r: 1.25 });
      }
      // parasols and towels scattered on the dry sand
      if (i % 2 === 1 && dPier > 14) {
        const h = Math.sin(i * 12.9898) * 43758.5453; const r = h - Math.floor(h);
        const off = PROMENADE.width / 2 + 7.5 + r * 8.5;
        const px = p[0] + nx * off, pz = p[1] + nz * off;
        const gy = this.ground(px, pz);
        // dry sand only: above the swash, away from the brook's mouth
        if (gy < 0.9 || nearBrook(px, pz, 6) || this.data.surfaceAt(px, pz, this._surf)[5] < 0.5) continue;
        const col = hues[(i * 5) % hues.length];
        cloth.place(px, gy, pz, r * 6.28, 0.12 * (r - 0.5));
        paint.place(px, gy, pz, r * 6.28, 0.12 * (r - 0.5));
        paint.tint(0.9, 0.9, 0.9, 1).rod(V(0, -0.3, 0), V(0, 2.25, 0), 0.025, 5);
        const N = 10;
        for (let s = 0; s < N; s++) {
          const a0 = (s / N) * Math.PI * 2, a1 = ((s + 1) / N) * Math.PI * 2;
          const c = s % 2 ? PAL.white : col;
          cloth.tint(c[0] * 1.15, c[1] * 1.15, c[2] * 1.15, 1);
          cloth.tri(V(0, 2.3, 0), V(Math.cos(a1) * 1.35, 1.85, Math.sin(a1) * 1.35), V(Math.cos(a0) * 1.35, 1.85, Math.sin(a0) * 1.35));
        }
        cloth.pop(); paint.pop();
        // towel
        const c2 = hues[(i * 3 + 2) % hues.length];
        cloth.tint(c2[0] * 1.1, c2[1] * 1.1, c2[2] * 1.1, 1);
        cloth.place(px + 1.2, gy + 0.03, pz + 0.4, r * 3);
        cloth.quad(V(-0.45, 0, 0.9), V(0.45, 0, 0.9), V(0.45, 0, -0.9), V(-0.45, 0, -0.9));
        cloth.pop();
      }
    }
  }

  // ---- pier (pier frame)

  _deck(parts) {
    const deck = parts.get('woodDeck'), wood = parts.get('woodWet');
    const L = PIER.length, W = PIER.width, head0 = L - PIER.headLength, HW = PIER.headWidth;
    deck.tint(1, 0.96, 0.9, 1);
    const halfAt = (x) => (x >= head0 ? HW / 2 : W / 2);
    const step = 6;
    for (let x = 0; x < L; x += step) {
      const x1 = Math.min(L, x + step);
      const y0 = deckHeight(x), y1 = deckHeight(x1);
      const h = halfAt(x + 0.01);
      deck.quad(V(x, y0, -h), V(x, y0, h), V(x1, y1, h), V(x1, y1, -h), { tile: 2, u0: 0, v0: x });
      // fascia boards along the edges
      deck.tint(0.7, 0.66, 0.6, 0.85);
      deck.quad(V(x, y0 - 0.45, h), V(x1, y1 - 0.45, h), V(x1, y1, h), V(x, y0, h), { tile: 2 });
      deck.quad(V(x1, y1 - 0.45, -h), V(x, y0 - 0.45, -h), V(x, y0, -h), V(x1, y1, -h), { tile: 2 });
      // underside
      deck.tint(0.45, 0.43, 0.4, 0.6);
      deck.quad(V(x, y0 - 0.3, h), V(x, y0 - 0.3, -h), V(x1, y1 - 0.3, -h), V(x1, y1 - 0.3, h), { tile: 2 });
      deck.tint(1, 0.96, 0.9, 1);
    }
    // step where the head widens, and the seaward end
    deck.tint(0.7, 0.66, 0.6, 0.85);
    for (const s of [1, -1]) {
      const a = V(head0, PIER.deckY - 0.45, s * W / 2), b = V(head0, PIER.deckY - 0.45, s * HW / 2);
      if (s > 0) deck.quad(b, a, a.clone().setY(PIER.deckY), b.clone().setY(PIER.deckY), { tile: 2 }); else deck.quad(a, b, b.clone().setY(PIER.deckY), a.clone().setY(PIER.deckY), { tile: 2 });
    }
    deck.quad(V(L, PIER.deckY - 0.45, HW / 2), V(L, PIER.deckY - 0.45, -HW / 2), V(L, PIER.deckY, -HW / 2), V(L, PIER.deckY, HW / 2), { tile: 2 });

    // piles and bracing: one bent every 7 m
    wood.tint(0.8, 0.72, 0.62, 1);
    const c = Math.cos(PIER.heading), s = Math.sin(PIER.heading);
    const groundLocal = (x, z) => this.ground(PIER.rootX + x * c - z * s, PIER.rootZ + x * s + z * c);
    for (let x = 4; x < L; x += 7) {
      const h = halfAt(x);
      const rows = x >= head0 ? [-21, -14, -7, 0, 7, 14, 21] : [-7, -2.4, 2.4, 7];
      const y = deckHeight(x);
      let prev = null;
      for (const z of rows) {
        const g = groundLocal(x, z);
        const bottom = Math.min(g - 1.2, -1);
        wood.cylinder(x, bottom, z, 0.24, 0.2, y - 0.3 - bottom, 7, { tile: 1.2, capTop: false });
        if (prev !== null && y - Math.max(g, 0.4) > 2.2) {
          // cross bracing between neighbouring piles, above the water
          const lo = Math.max(g, 0) + 0.7, hi = y - 0.7;
          wood.beam(V(x, lo, prev), V(x, hi, z), 0.12, 0.18, { tile: 1.2 });
          wood.beam(V(x, hi, prev), V(x, lo, z), 0.12, 0.18, { tile: 1.2 });
        }
        prev = z;
      }
      // cap beam across the bent and joists to the next one
      wood.beam(V(x, y - 0.45, -h + 0.2), V(x, y - 0.45, h - 0.2), 0.3, 0.3, { tile: 1.2 });
    }
    for (const z of [-7, -2.4, 2.4, 7]) wood.beam(V(2, deckHeight(PIER.rampLength) - 0.72, z), V(L, PIER.deckY - 0.72, z), 0.2, 0.26, { tile: 1.2 });
  }

  /** Perimeter of the deck as polylines in the pier frame (where railings and lamps go). */
  _edges() {
    const L = PIER.length, W = PIER.width / 2, HW = PIER.headWidth / 2, head0 = L - PIER.headLength;
    return [
      [[2.5, -W], [head0, -W], [head0, -HW], [L, -HW], [L, HW], [head0, HW], [head0, W], [2.5, W]],
    ];
  }

  _railings(parts) {
    const paint = parts.get('woodPaint');
    paint.tint(0.97, 0.96, 0.93, 1);
    for (const line of this._edges()) {
      for (let i = 0; i + 1 < line.length; i++) {
        const a = line[i], b = line[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.max(1, Math.round(len / 2.6));
        const ya = (x) => deckHeight(x);
        for (const hgt of [1.08, 0.72, 0.38]) {
          // rails follow the ramp in a few straight pieces
          const pieces = a[0] < PIER.rampLength || b[0] < PIER.rampLength ? 6 : 1;
          for (let k = 0; k < pieces; k++) {
            const t0 = k / pieces, t1 = (k + 1) / pieces;
            const p0 = V(lerp(a[0], b[0], t0), 0, lerp(a[1], b[1], t0)), p1 = V(lerp(a[0], b[0], t1), 0, lerp(a[1], b[1], t1));
            p0.y = ya(p0.x) + hgt; p1.y = ya(p1.x) + hgt;
            paint.beam(p0, p1, hgt > 1 ? 0.12 : 0.05, hgt > 1 ? 0.07 : 0.08, { tile: 1 });
          }
        }
        for (let k = 0; k <= n; k++) {
          const x = lerp(a[0], b[0], k / n), z = lerp(a[1], b[1], k / n);
          const y = ya(x);
          paint.box(x - 0.055, y - 0.3, z - 0.055, x + 0.055, y + 1.1, z + 0.055, { tile: 1 });
        }
      }
    }
  }

  _lamps(parts) {
    const iron = parts.get('paint'), glow = parts.get('glow');
    const W = PIER.width / 2 - 0.6, head0 = PIER.length - PIER.headLength, HW = PIER.headWidth / 2 - 0.7;
    const pts = [];
    for (let x = 20; x < head0 - 4; x += 14) pts.push([x, -W], [x, W]);
    for (let x = head0 + 8; x < PIER.length; x += 14) pts.push([x, -HW], [x, HW]);
    for (let z = -HW + 12; z < HW; z += 12) pts.push([PIER.length - 0.8, z]);
    const cols = [[1, 0.93, 0.78], [1, 0.6, 0.4], [0.6, 0.9, 1], [1, 0.85, 0.4]];
    let prev = {};
    pts.forEach(([x, z], i) => {
      const y = deckHeight(x);
      this._lamp(iron, glow, x, y, z, 4.4, PAL.cream);
      // festoon lights from lamp to lamp along each side
      const key = z < -1 ? 'l' : z > 1 ? 'r' : 'e';
      const p = prev[key];
      if (p && Math.hypot(p[0] - x, p[2] - z) < 16) {
        const n = 14;
        for (let k = 1; k < n; k++) {
          const t = k / n;
          const bx = lerp(p[0], x, t), bz = lerp(p[2], z, t), by = lerp(p[1], y, t) + 4.3 - Math.sin(Math.PI * t) * 0.7;
          const c = cols[(k + i) % cols.length];
          glow.tint(c[0], c[1], c[2], 1);
          glow.cube(bx, by, bz, 0.11, 0.14, 0.11);
        }
      }
      prev[key] = [x, y, z];
    });
  }

  _arch(parts) {
    // entrance: two towers and the frame that carries the sign
    const paint = parts.get('paint');
    const x = 3.2, W = PIER.width / 2 - 0.2, y = deckHeight(x);
    for (const s of [-1, 1]) {
      paint.tint(...PAL.cream, 1);
      paint.box(x - 0.7, y - 1, s * W - 0.7, x + 0.7, y + 6.6, s * W + 0.7, { tile: 1 });
      paint.tint(...PAL.red, 1);
      paint.box(x - 0.82, y + 6.6, s * W - 0.82, x + 0.82, y + 6.95, s * W + 0.82, { tile: 1 });
      paint.box(x - 0.78, y - 0.2, s * W - 0.78, x + 0.78, y + 0.5, s * W + 0.78, { tile: 1 });
      // pyramid cap with a ball
      const top = V(x, y + 8.3, s * W);
      const c = [V(x - 0.82, y + 6.95, s * W - 0.82), V(x + 0.82, y + 6.95, s * W - 0.82), V(x + 0.82, y + 6.95, s * W + 0.82), V(x - 0.82, y + 6.95, s * W + 0.82)];
      paint.tint(...PAL.teal, 1);
      for (let i = 0; i < 4; i++) paint.tri(c[(i + 1) % 4], c[i], top, { tile: 1 });
      paint.tint(...PAL.yellow, 1);
      paint.place(top.x, top.y, top.z).lathe([[0.01, -0.1], [0.2, 0.05], [0.26, 0.25], [0.2, 0.45], [0.01, 0.55]], 8).pop();
    }
    this.colliders.push({ type: 'local', x, z: -W, r: 0.9 }, { type: 'local', x, z: W, r: 0.9 });
  }

  _kiosks(parts) {
    const paint = parts.get('paint'), cloth = parts.get('doubleSided'), wood = parts.get('woodDark');
    const head0 = PIER.length - PIER.headLength, HW = PIER.headWidth / 2;
    // (the walk of the pier and the four corners of its head belong to the booths of the fair: see
    // zones/games/Booths.js)
    const spots = [
      [PIER.wheel.along - 10, -7.5, -Math.PI / 2, PAL.red], // (where the gondolas of the wheel find their sponsors)
    ];
    for (const [x, z, yaw, col] of spots) {
      const y = PIER.deckY;
      for (const b of [paint, cloth, wood]) b.place(x, y, z, yaw);
      // counter with a striped front, posts, awning
      wood.tint(0.9, 0.8, 0.66, 1);
      wood.box(-2.1, 0, -1.3, 2.1, 0.1, 1.3, { tile: 1 });
      for (let s = 0; s < 8; s++) {
        const c = s % 2 ? PAL.white : col;
        paint.tint(c[0], c[1], c[2], 1);
        paint.box(-2 + s * 0.5, 0.1, 1.2, -1.5 + s * 0.5, 1.05, 1.26, { faces: 'Z' });
      }
      paint.tint(col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, 1);
      paint.box(-2, 0.1, -1.25, 2, 1.05, 1.2, { faces: 'xXz' });
      wood.box(-2.1, 1.05, -1.3, 2.1, 1.12, 1.4, { tile: 1 });
      paint.tint(0.95, 0.94, 0.9, 1);
      for (const [px, pz] of [[-1.95, -1.2], [1.95, -1.2], [1.95, 1.2], [-1.95, 1.2]]) paint.box(px - 0.05, 1.05, pz - 0.05, px + 0.05, 2.5, pz + 0.05);
      paint.tint(col[0] * 0.6, col[1] * 0.6, col[2] * 0.6, 1);
      paint.box(-2, 1.12, -1.25, 2, 2.5, -1.2, { faces: 'zZ' });
      // awning: striped tent roof with a scalloped valance
      const N = 12;
      for (let s = 0; s < N; s++) {
        const c = s % 2 ? PAL.white : col;
        cloth.tint(c[0] * 1.1, c[1] * 1.1, c[2] * 1.1, 1);
        const x0 = -2.5 + (s * 5) / N, x1 = x0 + 5 / N;
        cloth.quad(V(x0, 2.45, 1.9), V(x1, 2.45, 1.9), V(x1, 3.35, 0), V(x0, 3.35, 0));
        cloth.quad(V(x1, 2.45, -1.7), V(x0, 2.45, -1.7), V(x0, 3.35, 0), V(x1, 3.35, 0));
        cloth.tri(V(x0, 2.45, 1.9), V((x0 + x1) / 2, 2.18, 1.9), V(x1, 2.45, 1.9));
      }
      cloth.tint(col[0], col[1], col[2], 1);
      cloth.tri(V(-2.5, 2.45, 1.9), V(-2.5, 2.45, -1.7), V(-2.5, 3.35, 0));
      cloth.tri(V(2.5, 2.45, -1.7), V(2.5, 2.45, 1.9), V(2.5, 3.35, 0));
      for (const b of [paint, cloth, wood]) b.pop();
      this.colliders.push({ type: 'local', x, z, r: 2.3 });
    }
    // flags at the corners of the pier head
    for (const [x, z, col] of [[PIER.length - 1.2, -HW + 1.2, PAL.red], [PIER.length - 1.2, HW - 1.2, PAL.teal], [head0 + 1.2, -HW + 1.2, PAL.yellow], [head0 + 1.2, HW - 1.2, PAL.blue]]) {
      paint.tint(0.9, 0.9, 0.9, 1).rod(V(x, PIER.deckY, z), V(x, PIER.deckY + 9, z), 0.06, 6);
      cloth.tint(col[0] * 1.2, col[1] * 1.2, col[2] * 1.2, 1).tri(V(x, PIER.deckY + 9, z), V(x, PIER.deckY + 7.9, z), V(x - 2.4, PIER.deckY + 8.45, z + 0.3));
    }
  }

  _wheelFrame(parts) {
    // A-frames carrying the axle, braced fore and aft
    const paint = parts.get('paint');
    const W = PIER.wheel, y0 = PIER.deckY;
    paint.tint(...PAL.white, 1);
    for (const dx of [-3.4, 3.4]) {
      const hub = V(W.along + dx, W.hubY, 0);
      for (const s of [-1, 1]) {
        paint.rod(V(W.along + dx * 1.5, y0, s * 17.5), hub, 0.55, 10, { r1: 0.38, tile: 2 });
        paint.rod(V(W.along + dx * 1.5, y0 + 12, s * 11.6), V(W.along + dx * 1.5, y0 + 12, 0), 0.16, 6, { tile: 2 });
        this.colliders.push({ type: 'local', x: W.along + dx * 1.5, z: s * 17.5, r: 0.9 });
      }
    }
    // hub housing and the central fore-aft struts
    paint.tint(...PAL.red, 1);
    paint.rod(V(W.along - 4.2, W.hubY, 0), V(W.along + 4.2, W.hubY, 0), 0.9, 14, { tile: 2 });
    // boarding platform and steps under the wheel
    const wood = parts.get('woodDeck');
    wood.tint(0.95, 0.9, 0.82, 1);
    wood.box(W.along - 5, y0, -5, W.along + 5, y0 + 0.9, 5, { tile: 2, faces: 'xXzZY' });
    for (let s = 0; s < 4; s++) wood.box(W.along - 5 - 0.4 * (s + 1), y0, -2.2, W.along - 5 - 0.4 * s, y0 + 0.9 - 0.22 * (s + 1), 2.2, { tile: 2, faces: 'xXzZY' });
    paint.tint(...PAL.teal, 1);
    for (const [bx, bz] of [[-5, -5], [5, -5], [5, 5], [-5, 5]]) paint.box(W.along + bx - 0.08, y0 + 0.9, bz - 0.08, W.along + bx + 0.08, y0 + 2.0, bz + 0.08);
  }

  /** The rotating wheel (rims, spokes) and its gondolas, which stay upright. */
  _wheel() {
    const W = PIER.wheel, R = W.radius, N = 24;
    const b = new MeshBuilder();
    const P = (a, r, x) => V(x, Math.sin(a) * r, Math.cos(a) * r);
    const SEG = 48;
    for (const x of [-1.7, 1.7]) {
      for (let i = 0; i < SEG; i++) {
        const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
        b.tint(...PAL.white, 1);
        b.beam(P(a0, R, x), P(a1, R, x), 0.28, 0.34, { tile: 2 });
        b.beam(P(a0, R - 3.2, x), P(a1, R - 3.2, x), 0.2, 0.24, { tile: 2 });
        // lattice between the two rings
        b.beam(P(a0, R - 3.2, x), P((a0 + a1) / 2, R, x), 0.1, 0.1, { tile: 2 });
        b.beam(P((a0 + a1) / 2, R, x), P(a1, R - 3.2, x), 0.1, 0.1, { tile: 2 });
        // inner ring
        if (i % 2 === 0) b.beam(P(a0, R * 0.52, x), P(((i + 2) / SEG) * Math.PI * 2, R * 0.52, x), 0.12, 0.14, { tile: 2 });
      }
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        b.tint(i % 2 ? PAL.red[0] : PAL.white[0], i % 2 ? PAL.red[1] : PAL.white[1], i % 2 ? PAL.red[2] : PAL.white[2], 1);
        b.rod(P(a, 1.0, x * 0.4), P(a, R - 3.2, x), 0.075, 5, { caps: false, tile: 2 });
      }
    }
    // ties between the two rims at every gondola
    b.tint(...PAL.white, 1);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      b.beam(P(a, R, -1.7), P(a, R, 1.7), 0.12, 0.12, { tile: 2 });
      b.beam(P(a, R - 3.2, -1.7), P(a + Math.PI / N, R - 3.2, 1.7), 0.07, 0.07, { tile: 2 });
    }
    // sunburst hub
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
      const c = i % 2 ? PAL.yellow : PAL.red;
      b.tint(c[0], c[1], c[2], 1);
      for (const x of [-2.0, 2.0]) {
        const pts = [V(x, 0, 0), P(a0, 5.2, x), P(a1, 5.2, x)];
        if (x > 0) b.tri(pts[0], pts[2], pts[1], { tile: 2 }); else b.tri(pts[0], pts[1], pts[2], { tile: 2 });
      }
    }
    const mat = this.world.materials.paint;
    const wheel = new THREE.Mesh(b.build(), mat);
    wheel.name = 'big-wheel';
    // it spins about its hub: a sphere centred there stays valid at any angle
    wheel.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), W.radius + 3);
    for (const l of [LAYER.DYNAMIC_CASTER, LAYER.REFLECT, LAYER.STATIC_CASTER]) wheel.layers.enable(l);
    const pivot = new THREE.Group();
    pivot.position.set(W.along, W.hubY, 0);
    pivot.add(wheel);
    this.frame.add(pivot);

    // gondola: an open car hung under its pivot bar — a tub with two benches facing each other, a roof on posts
    const g = new MeshBuilder();
    const TUB = { x: 1.36, z: 1.06, floor: -3.3, rim: -2.48, t: 0.08 }, BENCH = TUB.floor + 0.44;
    g.tint(1, 1, 1, 1);
    g.rod(V(-1.5, 0, 0), V(1.5, 0, 0), 0.07, 6);
    for (const x of [-1.25, 1.25]) g.beam(V(x, 0, 0), V(x, -1.25, 0), 0.07, 0.07);
    g.box(-1.42, -1.42, -1.12, 1.42, -1.25, 1.12);
    for (const [px, pz] of [[-1.3, -1.0], [1.3, -1.0], [1.3, 1.0], [-1.3, 1.0]]) g.box(px - 0.06, TUB.rim, pz - 0.06, px + 0.06, -1.42, pz + 0.06);
    g.box(-TUB.x, TUB.floor, -TUB.z, TUB.x, TUB.rim, TUB.z, { faces: 'xXzZy' });
    {
      // the inside of the tub (darker), its rim, the benches
      const xi = TUB.x - TUB.t, zi = TUB.z - TUB.t, y0 = TUB.floor + 0.06, y1 = TUB.rim;
      g.tint(0.5, 0.5, 0.5, 0.8);
      g.quad(V(-xi, y0, zi), V(-xi, y0, -zi), V(-xi, y1, -zi), V(-xi, y1, zi));
      g.quad(V(xi, y0, -zi), V(xi, y0, zi), V(xi, y1, zi), V(xi, y1, -zi));
      g.quad(V(xi, y0, zi), V(-xi, y0, zi), V(-xi, y1, zi), V(xi, y1, zi));
      g.quad(V(-xi, y0, -zi), V(xi, y0, -zi), V(xi, y1, -zi), V(-xi, y1, -zi));
      g.quad(V(-xi, y0, zi), V(xi, y0, zi), V(xi, y0, -zi), V(-xi, y0, -zi));
      g.tint(0.9, 0.9, 0.9, 1);
      g.box(-TUB.x, y1, -TUB.z, TUB.x, y1 + 0.03, -zi); g.box(-TUB.x, y1, zi, TUB.x, y1 + 0.03, TUB.z);
      g.box(-TUB.x, y1, -zi, -xi, y1 + 0.03, zi); g.box(xi, y1, -zi, TUB.x, y1 + 0.03, zi);
      g.tint(0.72, 0.6, 0.45, 1);
      for (const sx of [-1, 1]) g.box(sx > 0 ? xi - 0.5 : -xi, y0, -zi, sx > 0 ? xi : -xi + 0.5, BENCH, zi);
    }
    g.tint(0.85, 0.85, 0.85, 1);
    g.box(-1.2, -3.42, -0.9, 1.2, -3.3, 0.9);
    // A banner on both ends of each tub: its sponsor's, or an invitation to be it. One sheet for the 24, one
    // mesh whose corners follow the cars. A free car has a small invitation on the end of its tub; a sponsored
    // one carries a board half as wide again as the car, from under its floor to above its rim — what is read
    // from the walk of the pier. Each says the number of its car: the booth of the sponsors names them so.
    const banners = (() => {
      const COLS = 6, CW = 320, CH = 120, STUB = 46, ROWS = Math.ceil(N / COLS), canvas = document.createElement('canvas');
      canvas.width = COLS * CW; canvas.height = ROWS * CH;
      const ctx = canvas.getContext('2d'), tex = new THREE.CanvasTexture(canvas), state = new Array(N).fill(null);
      tex.colorSpace = THREE.SRGBColorSpace;
      const paint = (i) => {
        ctx.save();
        ctx.translate((i % COLS) * CW, Math.floor(i / COLS) * CH);
        ctx.beginPath(); ctx.rect(0, 0, CW, CH); ctx.clip();
        ctx.clearRect(0, 0, CW, CH);
        if (state[i]) {
          // its sponsor's panel and, on a stub at its end, the number of the car: "Gondola 7" at the booth is this one
          drawSponsor(ctx, CW - STUB, CH, state[i], { what: `gondola ${i + 1}` });
          const x = CW - STUB;
          ctx.fillStyle = '#7a1420'; ctx.fillRect(x, 0, STUB, CH);
          ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 4; ctx.strokeRect(x + 2, 4, STUB - 6, CH - 8);
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#f2c14e'; ctx.font = '700 13px system-ui, sans-serif'; ctx.fillText('No.', x + STUB / 2 - 1, CH * 0.3);
          ctx.fillStyle = '#f6e7b8'; ctx.font = `800 ${i + 1 > 9 ? 27 : 34}px Georgia, 'Times New Roman', serif`; ctx.fillText(String(i + 1), x + STUB / 2 - 1, CH * 0.58);
        } else drawSponsor(ctx, CW, CH, null, { what: `gondola ${i + 1}` });
        ctx.restore();
        tex.needsUpdate = true;
      };
      for (let i = 0; i < N; i++) paint(i);
      const pos = new Float32Array(N * 24), uv = new Float32Array(N * 16), idx = [];
      for (let i = 0; i < N; i++) for (let side = 0; side < 2; side++) {
        const q = i * 2 + side, u0 = (i % COLS) / COLS, u1 = u0 + 1 / COLS, v1 = 1 - Math.floor(i / COLS) / ROWS, v0 = v1 - 1 / ROWS;
        uv.set([u0, v0, u1, v0, u1, v1, u0, v1], q * 8);
        idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), W.radius + 6);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      mesh.name = 'big-wheel-banners';
      pivot.add(mesh);
      const X = TUB.x + 0.012;
      const SMALL = { z: TUB.z - 0.04, y0: TUB.floor + 0.06, y1: TUB.rim - 0.03 }, BIG = { z: 1.6, y0: TUB.floor - 0.08, y1: TUB.floor - 0.08 + 1.2 };
      /** The banners of car `i`, hung at (0, y, z) in the frame of the wheel; `swing`: how far the car leans (radians). */
      const move = (i, y, z, swing = 0) => {
        const s = state[i] ? BIG : SMALL, c = Math.cos(swing), n = Math.sin(swing), o = i * 24;
        // (the four corners under the bar the car hangs from, leaning with it: low −z, low +z, high +z, high −z)
        const ya = y + s.y0 * c + s.z * n, za = z + s.y0 * n - s.z * c, yb = y + s.y0 * c - s.z * n, zb = z + s.y0 * n + s.z * c;
        const yc = y + s.y1 * c - s.z * n, zc = z + s.y1 * n + s.z * c, yd = y + s.y1 * c + s.z * n, zd = z + s.y1 * n - s.z * c;
        // (each faces away from the car and reads from left to right: one towards the shore, one towards the
        // end of the pier — wound the other way round they faced into the tub, and nobody ever saw them)
        pos[o] = -X; pos[o + 1] = ya; pos[o + 2] = za; pos[o + 3] = -X; pos[o + 4] = yb; pos[o + 5] = zb; pos[o + 6] = -X; pos[o + 7] = yc; pos[o + 8] = zc; pos[o + 9] = -X; pos[o + 10] = yd; pos[o + 11] = zd;
        pos[o + 12] = X; pos[o + 13] = yb; pos[o + 14] = zb; pos[o + 15] = X; pos[o + 16] = ya; pos[o + 17] = za; pos[o + 18] = X; pos[o + 19] = yd; pos[o + 20] = zd; pos[o + 21] = X; pos[o + 22] = yc; pos[o + 23] = zc;
      };
      return { mesh, move, flush: () => { geo.attributes.position.needsUpdate = true; }, has: (i) => !!state[i], set: (i, sponsor) => { if (i >= 0 && i < N) { state[i] = sponsor || null; paint(i); } } };
    })();
    /** Gondola `n` (1 to 24) shows its sponsor ({ title, subtitle, logo }), or is free again (null). */
    this.setGondola = (n, sponsor) => banners.set(n - 1, sponsor);
    /** Does gondola `n` show a sponsor? */
    this.gondolaShown = (n) => banners.has(n - 1);
    this.gondolas = N;
    const gondolas = new THREE.InstancedMesh(g.build(), mat, N);
    gondolas.name = 'big-wheel-gondolas';
    gondolas.boundingSphere = new THREE.Sphere(new THREE.Vector3(), W.radius + 6);
    gondolas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) { const c = PAL[GONDOLA[i % GONDOLA.length]]; gondolas.setColorAt(i, col.setRGB(c[0], c[1], c[2])); }
    for (const l of [LAYER.DYNAMIC_CASTER, LAYER.REFLECT]) gondolas.layers.enable(l);
    pivot.add(gondolas);
    const m = new THREE.Matrix4();
    // The wheel follows the clock rather than the frames: everybody sees the same car at the same place.
    const SPEED = 0.055, TAU = Math.PI * 2;
    const clock = () => ((Date.now() / 1000) * SPEED) % TAU;
    let angle = clock();
    const place = () => {
      for (let i = 0; i < N; i++) {
        const a = angle + (i / N) * Math.PI * 2, swing = Math.sin(a * 2 + i) * 0.035;
        // a touch of swing as each car goes round
        m.makeRotationX(swing);
        m.setPosition(0, Math.sin(a) * R, Math.cos(a) * R);
        gondolas.setMatrixAt(i, m);
        banners.move(i, Math.sin(a) * R, Math.cos(a) * R, swing);
      }
      gondolas.instanceMatrix.needsUpdate = true;
      banners.flush();
    };
    place();
    this.animated.push(() => {
      angle = clock();
      wheel.rotation.x = -angle;
      place();
    });
    this.wheelPivot = pivot;
    /**
     * Where to stand to photograph gondola `n` as it is right now, banner first: { from, at } (in the world) —
     * a few metres before the wheel on the side of the shore, level with the car.
     */
    this.gondolaView = (n) => {
      // (the wheel is put where the clock says first: far from the pier nothing moves it, and the photograph is taken at once)
      angle = clock();
      wheel.rotation.x = -angle;
      place();
      const a = angle + ((n - 1) / N) * Math.PI * 2, y = Math.sin(a) * R, z = Math.cos(a) * R;
      pivot.updateWorldMatrix(true, false);
      const from = pivot.localToWorld(new THREE.Vector3(-5.7, y - 2.2, z + 0.9)), at = pivot.localToWorld(new THREE.Vector3(-1.4, y - 2.45, z));
      return { from: from.toArray(), at: at.toArray() };
    };
    {
      // the stand where a gondola is sponsored (the kiosk by the steps): its sign, and where one asks
      const sign = canvasBoard(512, 128, (ctx, w, hh) => {
        ctx.fillStyle = '#7a1420'; ctx.fillRect(0, 0, w, hh);
        ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 6; ctx.strokeRect(5, 5, w - 10, hh - 10);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f6e7b8'; ctx.font = "700 46px Georgia, 'Times New Roman', serif"; ctx.fillText('SPONSOR A GONDOLA', w / 2, 48, w - 30);
        ctx.fillStyle = '#f2c14e'; ctx.font = '600 24px system-ui, sans-serif'; ctx.fillText('your name goes round with the wheel', w / 2, 96, w - 30);
      }, 3.6, 0.9);
      sign.mesh.position.set(W.along - 10 - 1.45, PIER.deckY + 2.0, -7.5);
      sign.mesh.rotation.y = -Math.PI / 2;
      sign.mesh.name = 'pier-sign-sponsors';
      this.frame.add(sign.mesh);
      this.sponsorBooth = pierToWorld(W.along - 10 - 2.6, -7.5);
    }

    // --- riding: two seats per car, boarded from the platform while the car passes over it
    this.group.updateMatrixWorld(true);
    const h = PIER.heading, WINDOW = 0.15; // how far from the lowest point a car can be boarded or left (radians)
    const low = (i) => { let d = (angle + (i / N) * TAU - 1.5 * Math.PI) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
    const _v = new THREE.Vector3();
    const seats = [];
    for (let i = 0; i < N; i++) {
      for (const sx of [-1, 1]) {
        const bx = sx * (TUB.x - TUB.t - 0.25); // middle of the bench, facing the other one
        const fx = -sx * Math.cos(h), fz = -sx * Math.sin(h); // world direction faced
        seats.push({
          car: i, pose: ANIM.sit, locked: true, label: 'Board the wheel', leaving: false,
          yaw: Math.atan2(fx, fz),
          at: (out) => {
            const a = angle + (i / N) * TAU;
            _v.set(bx - sx * SEAT.back, Math.sin(a) * R + BENCH - SEAT.under, Math.cos(a) * R);
            pivot.localToWorld(_v);
            out.x = _v.x; out.y = _v.y; out.z = _v.z; out.yaw = Math.atan2(fx, fz);
            return out;
          },
          canLeave: () => Math.abs(low(i)) < WINDOW,
          // back on the platform, on the land side of the cars
          exit: () => { _v.set(-2.8, 0, Math.max(-3.5, Math.min(3.5, Math.cos(angle + (i / N) * TAU) * R))); pivot.localToWorld(_v); return [_v.x, _v.z]; },
        });
      }
    }
    const at = { x: 0, y: 0, z: 0, yaw: 0 };
    /** The seat that can be boarded from where the player stands, if any (a moving seat: see Interact). */
    this.boarding = (pos) => {
      const dx = pos.x - PIER.rootX, dz = pos.z - PIER.rootZ;
      const u = dx * Math.cos(h) + dz * Math.sin(h) - W.along, v = -dx * Math.sin(h) + dz * Math.cos(h);
      if (Math.abs(u) > 5.2 || Math.abs(v) > 5.2 || Math.abs(pos.y - (PIER.deckY + 0.9)) > 0.6) return null;
      let best = null, bestD = 3.6 * 3.6;
      for (const s of seats) {
        if (Math.abs(low(s.car)) > WINDOW) continue;
        s.at(at);
        const d = (at.x - pos.x) ** 2 + (at.z - pos.z) ** 2;
        if (d < bestD) { best = s; bestD = d; }
      }
      return best;
    };
  }

  /** Painted sign over the entrance, drawn with canvas text. */
  _sign() {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 192;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0d5f63'; ctx.fillRect(0, 0, 1024, 192);
    ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 10; ctx.strokeRect(12, 12, 1000, 168);
    ctx.fillStyle = '#fff3d6';
    ctx.font = '900 104px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ATOMIC OASIS', 512, 100);
    ctx.fillStyle = '#f2c14e';
    for (let i = 0; i < 34; i++) { ctx.beginPath(); ctx.arc(34 + i * 29, 26, 5, 0, 7); ctx.arc(34 + i * 29, 166, 5, 0, 7); ctx.fill(); }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = surfaceMaterial({ map: tex, rough: 0.6, spec: 0.2, name: 'sign' });
    const b = new MeshBuilder();
    const W = PIER.width / 2 - 0.9, x = 3.2, y = deckHeight(x) + 5.4, n = 12;
    // gentle arch between the two towers: one face towards the land, one towards the sea, each reading
    // left to right for whoever walks towards it (arriving from the land, the viewer's left is -z)
    for (const land of [true, false]) {
      const fx = x - (land ? 0.16 : 0.08);
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const z0 = lerp(-W, W, t0), z1 = lerp(-W, W, t1);
        const h0 = Math.sin(Math.PI * t0) * 1.3, h1 = Math.sin(Math.PI * t1) * 1.3;
        const a = V(fx, y + h0, z0), c = V(fx, y + h1, z1);
        const u0 = land ? t0 : 1 - t0, u1 = land ? t1 : 1 - t1, nrm = V(land ? -1 : 1, 0, 0);
        const i0 = b.vert(a, nrm, u0, 0), i1 = b.vert(c, nrm, u1, 0);
        const i2 = b.vert(c.clone().setY(c.y + 2.3), nrm, u1, 1), i3 = b.vert(a.clone().setY(a.y + 2.3), nrm, u0, 1);
        if (land) b.idx.push(i0, i1, i2, i0, i2, i3); else b.idx.push(i0, i2, i1, i0, i3, i2);
      }
    }
    const mesh = new THREE.Mesh(b.build(), mat);
    mesh.name = 'pier-sign';
    for (const l of this.cast) mesh.layers.enable(l);
    this.frame.add(mesh);
  }

  update(dt, time, camera) {
    for (const a of this.animated) a(dt, time);
    if (camera) this._cull(camera.position);
  }
}
