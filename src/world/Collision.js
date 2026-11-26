// Lightweight collision world: the heightfield, walkable platforms (pier, bridges), the playable area (the
// valley floor plus the places added to it: a stairway, a village, caves), and a spatial hash of simple
// obstacles (tree trunks, buildings, props).
const CELL = 8;

export class Collision {
  constructor(data) {
    this.data = data;
    this.circles = []; // x, z, r
    this.boxes = []; // x, z, hw, hl, cos, sin
    this.platforms = [];
    this.grid = new Map();
    this.areas = []; // walkable places outside the main bounds (see Areas.js)
    this.caves = []; // those of them that lie under the ground
    this._q = { x: 0, z: 0 };
  }

  /**
   * Vertical round obstacle. y0/y1 limit it to a height band (things standing on a deck, for instance). Returns
   * what is kept of it, [x, z, r, y0, y1]: its band can be changed afterwards — y0 = 1e9 lets go of it (a thing
   * taken away while the game runs), and putting y0 back brings it back.
   */
  addCircle(x, z, r, y0 = -1e9, y1 = 1e9) {
    this.bulky = null;
    const c = [x, z, r, y0, y1], i = this.circles.push(c) - 1;
    this._insert(x - r, z - r, x + r, z + r, i);
    return c;
  }

  /**
   * Oriented box footprint (yaw around Y, same convention as layout frames). Returns what is kept of it, [x, z, hw, hl,
   * cos, sin, y0, y1]: as with a circle, y0 = 1e9 lets go of it, and putting y0 back brings it back.
   */
  addBox(x, z, hw, hl, yaw = 0, y0 = -1e9, y1 = 1e9) {
    const c = Math.cos(yaw), s = Math.sin(yaw), b = [x, z, hw, hl, c, s, y0, y1];
    const i = this.boxes.push(b) - 1;
    const ext = Math.abs(hw * c) + Math.abs(hl * s), ezt = Math.abs(hw * s) + Math.abs(hl * c);
    this._insert(x - ext, z - ezt, x + ext, z + ezt, -1 - i);
    return b;
  }

  /** The playable area: a closed polygon [[x, z], …]. Nothing confined can leave it (and the areas added to it). */
  setBounds(points) { this.bounds = points; }

  /** A walkable place reached from the playable area: a Corridor or a Polygon (see Areas.js). */
  addArea(area) {
    this.areas.push(area);
    if (area.cave) this.caves.push(area);
  }

  /** Can one stand at (x, z)? */
  walkable(x, z) {
    const b = this.bounds;
    if (!b) return true;
    let inside = false;
    for (let i = 0, j = b.length - 1; i < b.length; j = i++) {
      if ((b[j][1] > z) !== (b[i][1] > z) && x < ((b[i][0] - b[j][0]) * (z - b[j][1])) / (b[i][1] - b[j][1]) + b[j][0]) inside = !inside;
    }
    if (inside) return true;
    for (const a of this.areas) if (a.contains(x, z)) return true;
    return false;
  }

  /**
   * The cave whose roof is over (x, z), or null: inside one of them and really under the rock. With `y`, only
   * for something that is in the gallery itself, not on the ground above it.
   */
  caveAt(x, z, y) {
    for (const c of this.caves) {
      if (!c.contains(x, z)) continue;
      const floor = c.floorAt(x, z);
      if (this.data.heightAt(x, z) <= floor + 1.2) continue;
      if (y !== undefined && y > c.ceilingAt(x, z) + 0.6) continue; // walking on the mountain above
      return c;
    }
    return null;
  }

  /**
   * Where something put down at (x, z) stands: on the ground (or the platform) there — or on the floor of a
   * cave, when the spot is in a cave whose mountain cannot be walked on.
   */
  spawnHeight(x, z) {
    for (const c of this.caves) {
      if (!c.contains(x, z) || this.data.heightAt(x, z) <= c.floorAt(x, z) + 1.2) continue;
      let above = false; // is the ground over the cave part of the playable area?
      const b = this.bounds;
      if (b) for (let i = 0, j = b.length - 1; i < b.length; j = i++) if ((b[j][1] > z) !== (b[i][1] > z) && x < ((b[i][0] - b[j][0]) * (z - b[j][1])) / (b[i][1] - b[j][1]) + b[j][0]) above = !above;
      for (const a of this.areas) if (!a.cave && a.contains(x, z)) above = true;
      if (!above) return c.floorAt(x, z);
    }
    return this.groundAt(x, z, 1e4);
  }

  /** Keeps a point inside the playable area, sliding along its edge. Mutates and returns `p` ({x, z}). */
  confine(p) {
    const b = this.bounds;
    if (!b) return p;
    let inside = false, best = Infinity, bx = p.x, bz = p.z;
    for (let i = 0, j = b.length - 1; i < b.length; j = i++) {
      const ax = b[j][0], az = b[j][1], cx = b[i][0], cz = b[i][1];
      if ((az > p.z) !== (cz > p.z) && p.x < ((cx - ax) * (p.z - az)) / (cz - az) + ax) inside = !inside;
      const dx = cx - ax, dz = cz - az;
      let t = ((p.x - ax) * dx + (p.z - az) * dz) / (dx * dx + dz * dz || 1);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t, qz = az + dz * t;
      const d = (p.x - qx) ** 2 + (p.z - qz) ** 2;
      if (d < best) { best = d; bx = qx; bz = qz; }
    }
    if (inside) return p;
    // outside the valley floor: fine in one of the added places, otherwise back to the nearest edge of them all
    const q = this._q;
    for (const a of this.areas) {
      const d = a.nearest(p.x, p.z, q);
      if (d === 0) return p;
      if (d < best) { best = d; bx = q.x; bz = q.z; }
    }
    p.x = bx; p.z = bz;
    return p;
  }

  /**
   * platform: { heightAt(x, z) -> number | null, clearance, thick }. `thick`: a solid body hangs that far under
   * the surface (a floating stone): one cannot walk or jump into its side.
   */
  addPlatform(p) {
    this.platforms.push(p);
    if (p.thick) (this.solids || (this.solids = [])).push(p);
  }

  /** Is (x, z) within the footprint of a cave (its mouth included)? */
  inCave(x, z) {
    for (const c of this.caves) if (c.contains(x, z)) return true;
    return false;
  }

  /** Is the side of a solid platform in the way of something standing at height y on (x, z)? */
  blocked(x, z, y) {
    if (!this.solids) return false;
    for (const p of this.solids) {
      const top = p.heightAt(x, z);
      if (top === null) continue;
      if (y + 0.3 < top - (p.clearance ?? 1.2) && y + 1.5 > top - p.thick) return true;
    }
    return false;
  }

  _insert(x0, z0, x1, z1, id) {
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        const k = cx * 73856093 ^ cz * 19349663;
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(id);
      }
    }
  }

  /** Push a circle (x, z, r) standing at height y out of the obstacles around it. Mutates and returns `p` ({x, z}). */
  resolve(p, r, y = 0) {
    for (let pass = 0; pass < 2; pass++) {
      const cx0 = Math.floor((p.x - r) / CELL), cx1 = Math.floor((p.x + r) / CELL);
      const cz0 = Math.floor((p.z - r) / CELL), cz1 = Math.floor((p.z + r) / CELL);
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
        const list = this.grid.get(cx * 73856093 ^ cz * 19349663);
        if (!list) continue;
        for (const id of list) {
          if (id >= 0) {
            const c = this.circles[id];
            if (y + 1.2 < c[3] || y > c[4]) continue;
            const dx = p.x - c[0], dz = p.z - c[1];
            const min = r + c[2];
            const d2 = dx * dx + dz * dz;
            if (d2 < min * min && d2 > 1e-8) {
              const d = Math.sqrt(d2);
              p.x = c[0] + (dx / d) * min; p.z = c[1] + (dz / d) * min;
            }
          } else {
            const b = this.boxes[-1 - id];
            if (y + 1.2 < b[6] || y > b[7]) continue;
            // into the box frame
            const dx = p.x - b[0], dz = p.z - b[1];
            const lx = dx * b[4] - dz * b[5], lz = dx * b[5] + dz * b[4];
            const qx = Math.max(-b[2], Math.min(b[2], lx)), qz = Math.max(-b[3], Math.min(b[3], lz));
            let ox = lx - qx, oz = lz - qz;
            const d2 = ox * ox + oz * oz;
            if (d2 >= r * r) continue;
            if (d2 > 1e-8) {
              const d = Math.sqrt(d2);
              ox = (ox / d) * r; oz = (oz / d) * r;
              const nx = qx + ox, nz = qz + oz;
              p.x = b[0] + nx * b[4] + nz * b[5]; p.z = b[1] - nx * b[5] + nz * b[4];
            } else {
              // inside: leave through the nearest face
              const px = b[2] - Math.abs(lx), pz = b[3] - Math.abs(lz);
              let nx = lx, nz = lz;
              if (px < pz) nx = Math.sign(lx || 1) * (b[2] + r); else nz = Math.sign(lz || 1) * (b[3] + r);
              p.x = b[0] + nx * b[4] + nz * b[5]; p.z = b[1] - nx * b[5] + nz * b[4];
            }
          }
        }
      }
    }
    return p;
  }

  /**
   * Height of the surface one can stand on at (x, z) for something currently at height y.
   * Platforms only count when y is above them (minus a step), so one can walk underneath.
   */
  groundAt(x, z, y) {
    let h = this.data.heightAt(x, z);
    // in a cave one walks on its floor, under the ground (unless one is on the mountain above it)
    for (const c of this.caves) {
      if (!c.contains(x, z)) continue;
      const f = c.floorAt(x, z);
      if (f < h && !(y > c.ceilingAt(x, z) + 0.9 && h > f + 1.2)) h = f;
    }
    for (const p of this.platforms) {
      const ph = p.heightAt(x, z);
      if (ph === null || ph <= h) continue;
      if (y >= ph - (p.clearance ?? 1.2)) h = ph;
    }
    return h;
  }

  /**
   * Does the segment a->b (xz) cross something that hides the view: a building, or a bulky round obstacle
   * (hut, kiosk)? Thin things such as tree trunks and posts are ignored. Returns the first hit fraction or 1.
   */
  segment(ax, az, bx, bz) {
    let best = 1;
    const sx0 = bx - ax, sz0 = bz - az;
    const len2 = sx0 * sx0 + sz0 * sz0;
    if (len2 > 1e-9) {
      for (const c of this.bulky || (this.bulky = this.circles.filter((q) => q[2] >= 0.9))) {
        const fx = ax - c[0], fz = az - c[1];
        const r = c[2] + 0.25;
        const cc = fx * fx + fz * fz - r * r;
        if (cc <= 0) continue; // the viewer starts inside: nothing sensible to do
        const bq = fx * sx0 + fz * sz0;
        const disc = bq * bq - len2 * cc;
        if (bq >= 0 || disc < 0) continue;
        const t = (-bq - Math.sqrt(disc)) / len2;
        if (t >= 0 && t < best) best = t;
      }
    }
    for (const b of this.boxes) {
      if (b[6] > -1e8) continue; // only full-height buildings block the camera
      // slab test in the box frame
      const dax = ax - b[0], daz = az - b[1], dbx = bx - b[0], dbz = bz - b[1];
      const sx = dax * b[4] - daz * b[5], sz = dax * b[5] + daz * b[4];
      const ex = dbx * b[4] - dbz * b[5], ez = dbx * b[5] + dbz * b[4];
      const dx = ex - sx, dz = ez - sz;
      let t0 = 0, t1 = 1;
      let ok = true;
      for (const [s, d, h] of [[sx, dx, b[2]], [sz, dz, b[3]]]) {
        if (Math.abs(d) < 1e-9) { if (Math.abs(s) > h) { ok = false; break; } continue; }
        let ta = (-h - s) / d, tb = (h - s) / d;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 < best) best = t0;
    }
    return best;
  }
}
