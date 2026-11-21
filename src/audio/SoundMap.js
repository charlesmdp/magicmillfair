// What the ear needs to know about the world, worked out once from the baked maps on a coarse grid (4 m cells):
// how far the open sea and the ponds are, how loud the waves of the beaches are, how much the streams babble,
// how many trees stand around — plus the short list of the waterfalls. The mixer then reads a place in a few
// lookups.
import { STREAMS } from '../world/layout/layout.js';
import { reach } from './synth.js';

const CELL = 4, N = 256, HALF = 512, FAR = 255;
const DIAGONAL = Math.SQRT2;

/** Distance (in cells) from every cell to the nearest cell holding 0: two sweeps, each cell taking the shortest way through a neighbour. */
function spread(d) {
  for (let j = 0, q = 0; j < N; j++) {
    for (let i = 0; i < N; i++, q++) {
      let v = d[q];
      if (i > 0 && d[q - 1] + 1 < v) v = d[q - 1] + 1;
      if (j > 0) {
        if (d[q - N] + 1 < v) v = d[q - N] + 1;
        if (i > 0 && d[q - N - 1] + DIAGONAL < v) v = d[q - N - 1] + DIAGONAL;
        if (i < N - 1 && d[q - N + 1] + DIAGONAL < v) v = d[q - N + 1] + DIAGONAL;
      }
      d[q] = v;
    }
  }
  for (let j = N - 1, q = N * N - 1; j >= 0; j--) {
    for (let i = N - 1; i >= 0; i--, q--) {
      let v = d[q];
      if (i < N - 1 && d[q + 1] + 1 < v) v = d[q + 1] + 1;
      if (j < N - 1) {
        if (d[q + N] + 1 < v) v = d[q + N] + 1;
        if (i < N - 1 && d[q + N + 1] + DIAGONAL < v) v = d[q + N + 1] + DIAGONAL;
        if (i > 0 && d[q + N - 1] + DIAGONAL < v) v = d[q + N - 1] + DIAGONAL;
      }
      d[q] = v;
    }
  }
}

/** Add `amount` to a grid around (x, z): a peak that is down to a quarter `core` metres away, and to nothing at `r` metres. */
function splat(grid, x, z, r, amount, core) {
  const ci = (x + HALF) / CELL - 0.5, cj = (z + HALF) / CELL - 0.5, cells = r / CELL, k = (r * r) / (core * core);
  const i0 = Math.max(0, Math.ceil(ci - cells)), i1 = Math.min(N - 1, Math.floor(ci + cells));
  const j0 = Math.max(0, Math.ceil(cj - cells)), j1 = Math.min(N - 1, Math.floor(cj + cells));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const u = ((i - ci) * (i - ci) + (j - cj) * (j - cj)) / (cells * cells);
      if (u < 1) grid[j * N + i] += (amount * (1 - u) * (1 - u)) / ((1 + u * k) * (1 + u * k));
    }
  }
}

export class SoundMap {
  /** @param data the WorldData of the game (heightAt, waterAt, canopyShadeAt, meta) */
  constructor(data) {
    this.data = data;
    this.ready = false;
    this.sea = new Uint8Array(N * N).fill(FAR); // metres to the open sea, 0 over it (255 = far away)
    this.fresh = new Uint8Array(N * N).fill(FAR); // metres to a pond or a pool
    this.surf = new Uint8Array(N * N); // the waves breaking on the beaches, as loud as they are heard from here
    this.babble = new Uint8Array(N * N); // running water close by
    this.cover = new Uint8Array(N * N); // trees around
    /** Waterfalls: the falling water as a segment from (x, y, z), `roar` and `hiss` say how much of each it gives. */
    this.falls = [];
    this.tmp = null;
  }

  /** The work, in slices of a few milliseconds: one per frame (see Soundscape). */
  jobs() {
    const q = N >> 2, third = Math.ceil(this.data.meta.coast.length / 3);
    return [
      () => this._scan(0, q), () => this._scan(q, 2 * q), () => this._scan(2 * q, 3 * q), () => this._scan(3 * q, N),
      () => this._distances(), () => this._trees(),
      () => this._shore(0, third), () => this._shore(third, 2 * third), () => this._shore(2 * third, 3 * third),
      () => this._streams(),
    ];
  }

  /** Look at the middle of every cell: sea, fresh water, tree crowns overhead. */
  _scan(j0, j1) {
    const d = this.data, t = this.tmp || (this.tmp = { sea: new Float32Array(N * N), fresh: new Float32Array(N * N), cover: new Float32Array(N * N) });
    for (let j = j0; j < j1; j++) {
      const z = -HALF + j * CELL + 2.5; // (the middle of a texel of the baked maps: no blending between two of them)
      for (let i = 0, q = j * N; i < N; i++, q++) {
        const x = -HALF + i * CELL + 2.5, w = d.waterAt(x, z);
        const wet = w > -500 && d.heightAt(x, z) < w; // (the level is also known on the dry ground next to water)
        t.sea[q] = wet && w < 0.5 ? 0 : 1e6; // the sea is the water at level 0: ponds and streams lie higher
        t.fresh[q] = wet && w >= 0.5 ? 0 : 1e6;
        t.cover[q] = 1 - d.canopyShadeAt(x, z); // (the map holds the light left under the crowns: 1 in the open)
      }
    }
  }

  _distances() {
    const t = this.tmp;
    spread(t.sea);
    spread(t.fresh);
    for (let q = 0; q < N * N; q++) {
      this.sea[q] = Math.min(FAR, t.sea[q] * CELL);
      this.fresh[q] = Math.min(FAR, t.fresh[q] * CELL);
    }
  }

  /** Trees "around": the crowns within some twenty metres, not only the one overhead. */
  _trees() {
    const a = this.tmp.cover, b = this.tmp.sea, R = 3; // (the sea grid is free again: used as scratch)
    for (let pass = 0; pass < 2; pass++) {
      const src = pass ? b : a, dst = pass ? a : b, step = pass ? N : 1; // across, then down
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const along = pass ? j : i, q = j * N + i;
          let sum = 0, n = 0;
          for (let k = -R; k <= R; k++) { if (along + k < 0 || along + k >= N) continue; sum += src[q + k * step]; n++; }
          dst[q] = sum / n;
        }
      }
    }
    // (a wood is never a closed roof on the map: 60 % of crowns is already a dense one)
    for (let q = 0; q < N * N; q++) this.cover[q] = Math.min(255, a[q] * 1.7 * 255);
  }

  /**
   * The waves of the beaches. The coast line knows how sandy it is at each of its points (1 = a beach, 0 = rock):
   * each sandy point is a source of breaking waves, and every cell keeps the loudest it hears. Cliffs give none.
   */
  _shore(i0, i1) {
    const coast = this.data.meta.coast, loud = this.tmp.fresh, R = 170, cells = R / CELL;
    if (i0 === 0) loud.fill(0);
    for (let k = i0; k < Math.min(i1, coast.length); k++) {
      const [x, z, sand] = coast[k];
      if (sand < 0.05) continue;
      const ci = (x + HALF) / CELL - 0.5, cj = (z + HALF) / CELL - 0.5;
      const a0 = Math.max(0, Math.ceil(ci - cells)), a1 = Math.min(N - 1, Math.floor(ci + cells));
      for (let j = Math.max(0, Math.ceil(cj - cells)), j1 = Math.min(N - 1, Math.floor(cj + cells)); j <= j1; j++) {
        for (let i = a0; i <= a1; i++) {
          const d2 = ((i - ci) * (i - ci) + (j - cj) * (j - cj)) * CELL * CELL;
          if (d2 >= R * R) continue;
          const v = sand * reach(Math.sqrt(d2), 28, R);
          if (v > loud[j * N + i]) loud[j * N + i] = v;
        }
      }
    }
    if (i1 >= coast.length) for (let q = 0; q < N * N; q++) this.surf[q] = 255 * loud[q];
  }

  /** Brooks and races babble where they run down; where they drop, they are waterfalls. */
  _streams() {
    const energy = this.tmp.cover.fill(0), meta = this.data.meta;
    const great = STREAMS.find((s) => s.waterfall)?.waterfall; // the one great waterfall of the valley
    for (const stream of meta.streams) {
      const s = stream.samples;
      let top = -1;
      for (let i = 0; i < s.length - 1; i++) {
        const a = s[i], b = s[i + 1], run = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, slope = Math.max(0, a[2] - b[2]) / run;
        if (slope > 1) { if (top < 0) top = i; continue; } // falling: see below
        if (top >= 0) { this._fall(s[top], a, great); top = -1; }
        // (a wide pool is no louder than a brook; smooth, level water hardly makes a sound)
        splat(energy, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 40, Math.min(a[3], 4) * run * (0.012 + 2.5 * Math.min(0.5, slope)), 5); // (running water is heard from close by only)
      }
      if (top >= 0) this._fall(s[top], s[s.length - 1], great);
    }
    if (meta.seaFall) {
      const f = meta.seaFall, [dx, dz] = f.dir || [0, 0];
      this._add(f.x, f.y, f.z, f.x + dx * 5, 0, f.z + dz * 5, 0.5, 0.8, 14, 200);
    }
    for (let q = 0; q < N * N; q++) this.babble[q] = Math.min(255, Math.sqrt(energy[q]) * 150); // (a brook at one's feet: about 0.85)
    this.tmp = null;
    this.ready = true;
  }

  /** A drop in a stream between two of its samples [x, z, y, width]. */
  _fall(a, b, great) {
    const drop = a[2] - b[2];
    if (great && Math.hypot(b[0] - great.pool[0], b[1] - great.pool[1]) < 6) this._add(a[0], a[2], a[1], b[0], b[2], b[1], 1, 0.45, 16, 240, true);
    else if (drop > 4) this._add(a[0], a[2], a[1], b[0], b[2], b[1], 0.15, 0.9, 7, 95); // the steps above the great fall: lighter
    else this._add(a[0], a[2], a[1], b[0], b[2], b[1], 0, 0.14 * drop, 4, 45); // weirs and spillways: a trickle
  }

  _add(x0, y0, z0, x1, y1, z1, roar, hiss, half, far, great = false) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    this.falls.push({ x: x0, y: y0, z: z0, dx, dy, dz, inv: 1 / (dx * dx + dy * dy + dz * dz || 1), roar, hiss, half, far, great });
  }

  /** What is around (x, z): fills `out` { sea, fresh (metres), surf, babble, cover (0..1) }. */
  sample(x, z, out) {
    let u = (x + HALF) / CELL - 0.5, v = (z + HALF) / CELL - 0.5;
    u = u < 0 ? 0 : u > N - 1.001 ? N - 1.001 : u;
    v = v < 0 ? 0 : v > N - 1.001 ? N - 1.001 : v;
    const i = u | 0, j = v | 0, fx = u - i, fz = v - j, q = j * N + i;
    const a = (1 - fx) * (1 - fz), b = fx * (1 - fz), c = (1 - fx) * fz, d = fx * fz;
    let g = this.sea; out.sea = g[q] * a + g[q + 1] * b + g[q + N] * c + g[q + N + 1] * d;
    g = this.fresh; out.fresh = g[q] * a + g[q + 1] * b + g[q + N] * c + g[q + N + 1] * d;
    g = this.surf; out.surf = (g[q] * a + g[q + 1] * b + g[q + N] * c + g[q + N + 1] * d) / 255;
    g = this.babble; out.babble = (g[q] * a + g[q + 1] * b + g[q + N] * c + g[q + N + 1] * d) / 255;
    g = this.cover; out.cover = (g[q] * a + g[q + 1] * b + g[q + N] * c + g[q + N + 1] * d) / 255;
  }
}
