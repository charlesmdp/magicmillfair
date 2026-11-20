// Walkable places added to the playable area: corridors (a chain of discs of varying radius: a stairway, a
// tunnel, a cave and its chambers) and polygons (the shelf of the village).

export class Corridor {
  /**
   * @param {number[][]} nodes [[x, z, half width, floor, ceiling height], …] (floor and ceiling only for caves)
   * @param {{ cave?: boolean, cut?: boolean, name?: string }} [o] cave: under the ground, with its own floor;
   *   cut: the first node is a flat end (the mouth): nothing of the corridor lies in front of it
   */
  constructor(nodes, { cave = false, cut = false, name = '' } = {}) {
    this.nodes = nodes;
    this.cave = cave;
    this.cut = cut;
    this.name = name;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z, r] of nodes) { x0 = Math.min(x0, x - r); z0 = Math.min(z0, z - r); x1 = Math.max(x1, x + r); z1 = Math.max(z1, z + r); }
    this.box = [x0 - 0.5, z0 - 0.5, x1 + 0.5, z1 + 0.5];
    // distance from the mouth to each node, along the corridor
    this.along = [0];
    for (let k = 1; k < nodes.length; k++) this.along.push(this.along[k - 1] + Math.hypot(nodes[k][0] - nodes[k - 1][0], nodes[k][1] - nodes[k - 1][1]));
    this.length = this.along[nodes.length - 1];
    this._k = 0; this._t = 0; this._px = 0; this._pz = 0; this._r = 0; this._d = 0;
  }

  /** Where (x, z) stands in the corridor: returns radius − distance to its axis (≥ 0 inside), remembering the spot. */
  _probe(x, z) {
    const n = this.nodes;
    let best = -Infinity;
    for (let k = 0; k + 1 < n.length; k++) {
      const a = n[k], b = n[k + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      let t = ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1);
      if (k === 0 && this.cut && t < 0) continue;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a[0] + dx * t, pz = a[1] + dz * t, r = a[2] + (b[2] - a[2]) * t;
      const d = Math.hypot(x - px, z - pz), m = r - d;
      if (m > best) { best = m; this._k = k; this._t = t; this._px = px; this._pz = pz; this._r = r; this._d = d; }
    }
    return best;
  }

  contains(x, z) {
    const b = this.box;
    return x >= b[0] && z >= b[1] && x <= b[2] && z <= b[3] && this._probe(x, z) >= 0;
  }

  /** Nearest point of the corridor to (x, z), written to `out`; returns the squared distance to it. */
  nearest(x, z, out) {
    const m = this._probe(x, z);
    if (m === -Infinity) return Infinity;
    if (m >= 0) { out.x = x; out.z = z; return 0; }
    const d = this._d || 1e-6, k = Math.max(0, this._r - 0.001) / d;
    out.x = this._px + (x - this._px) * k; out.z = this._pz + (z - this._pz) * k;
    return m * m;
  }

  _lerp(i) { const n = this.nodes, a = n[this._k], b = n[this._k + 1]; return a[i] + (b[i] - a[i]) * this._t; }

  /** Floor of a cave at (x, z) (call for a point inside). */
  floorAt(x, z) { this._probe(x, z); return this._lerp(3); }

  /** Its roof there: highest along the axis, lower towards the walls (the vault of Caves.js). */
  ceilingAt(x, z) {
    this._probe(x, z);
    const u = Math.min(0.97, this._d / ((this._r || 1) + 0.3));
    return this._lerp(3) + this._lerp(4) * (1 - u * u) ** 0.275;
  }

  /** How far inside (m from the mouth, along the corridor). */
  depthAt(x, z) { this._probe(x, z); return this.along[this._k] + (this.along[this._k + 1] - this.along[this._k]) * this._t; }
}

export class Polygon {
  /** @param {number[][]} points [[x, z], …] closed */
  constructor(points, { name = '' } = {}) {
    this.points = points;
    this.name = name;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [x, z] of points) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    this.box = [x0, z0, x1, z1];
  }

  contains(x, z) {
    const b = this.box, p = this.points;
    if (x < b[0] || z < b[1] || x > b[2] || z > b[3]) return false;
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[j][1] > z) !== (p[i][1] > z) && x < ((p[i][0] - p[j][0]) * (z - p[j][1])) / (p[i][1] - p[j][1]) + p[j][0]) inside = !inside;
    }
    return inside;
  }

  /** Nearest point of the polygon to (x, z), written to `out`; returns the squared distance to it (0 inside). */
  nearest(x, z, out) {
    if (this.contains(x, z)) { out.x = x; out.z = z; return 0; }
    const p = this.points;
    let best = Infinity;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const ax = p[j][0], az = p[j][1], dx = p[i][0] - ax, dz = p[i][1] - az;
      let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t, qz = az + dz * t, d = (x - qx) ** 2 + (z - qz) ** 2;
      if (d < best) { best = d; out.x = qx; out.z = qz; }
    }
    return best;
  }
}
