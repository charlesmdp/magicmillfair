// Tiny immediate-mode mesh builder: boxes, quads, beams, cylinders, lathes...
// UVs are generated in metres (divided by the texture tile size) so materials keep a constant scale.
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3();
const _v = new THREE.Vector3();

export class MeshBuilder {
  constructor() {
    this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = [];
    this.count = 0;
    this.stack = [];
    this.m = new THREE.Matrix4();
    this.nm = new THREE.Matrix3();
    this.color = [1, 1, 1, 1];
    this.tile = 1;
    this.identity = true;
  }

  // ---- state
  push(matrix) {
    this.stack.push(this.m.clone());
    this.m.multiply(matrix);
    this._refresh();
    return this;
  }
  pop() { this.m.copy(this.stack.pop()); this._refresh(); return this; }
  /** Push a translation + rotation about Y (radians). */
  place(x, y, z, yaw = 0, pitch = 0, roll = 0) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
    m.setPosition(x, y, z);
    return this.push(m);
  }
  _refresh() {
    this.identity = this.m.equals(IDENTITY);
    this.nm.getNormalMatrix(this.m);
  }
  tint(r, g, b, a = 1) { this.color = [r, g, b, a]; return this; }
  setTile(t) { this.tile = t; return this; }

  // ---- low level
  vert(p, n, u, v, c = this.color) {
    _v.copy(p); _n.copy(n);
    if (!this.identity) { _v.applyMatrix4(this.m); _n.applyMatrix3(this.nm).normalize(); }
    this.pos.push(_v.x, _v.y, _v.z);
    this.nrm.push(_n.x, _n.y, _n.z);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2], c[3] ?? 1);
    return this.count++;
  }

  /** Quad a-b-c-d (counter-clockwise when seen from the front). UVs follow the a->b and a->d edges in metres. */
  quad(a, b, c, d, o = {}) {
    const tile = o.tile ?? this.tile;
    _a.subVectors(b, a); _b.subVectors(d, a);
    const n = o.normal || new THREE.Vector3().crossVectors(_a, _b).normalize();
    const lu = _a.length(), lv = _b.length();
    const u0 = (o.u0 ?? 0) / tile, v0 = (o.v0 ?? 0) / tile;
    const us = (o.uLen ?? lu) / tile, vs = (o.vLen ?? lv) / tile;
    const col = o.color || this.color;
    const cols = o.colors || [col, col, col, col];
    const i0 = this.vert(a, n, u0, v0, cols[0]);
    const i1 = this.vert(b, n, u0 + us, v0, cols[1]);
    const i2 = this.vert(c, n, u0 + us, v0 + vs, cols[2]);
    const i3 = this.vert(d, n, u0, v0 + vs, cols[3]);
    this.idx.push(i0, i1, i2, i0, i2, i3);
    return this;
  }

  tri(a, b, c, o = {}) {
    const tile = o.tile ?? this.tile;
    _a.subVectors(b, a); _b.subVectors(c, a);
    const n = o.normal || new THREE.Vector3().crossVectors(_a, _b).normalize();
    // planar uv in the triangle's own frame
    const ux = _a.clone().normalize(), uy = new THREE.Vector3().crossVectors(n, ux);
    const col = o.color || this.color;
    const uvOf = (p) => { _c.subVectors(p, a); return [(_c.dot(ux) + (o.u0 ?? 0)) / tile, (_c.dot(uy) + (o.v0 ?? 0)) / tile]; };
    const ids = [a, b, c].map((p) => { const [u, v] = uvOf(p); return this.vert(p, n, u, v, col); });
    this.idx.push(ids[0], ids[1], ids[2]);
    return this;
  }

  /** Convex polygon fan, points counter-clockwise. */
  poly(pts, o = {}) {
    for (let i = 1; i + 1 < pts.length; i++) this.tri(pts[0], pts[i], pts[i + 1], o);
    return this;
  }

  /** Axis-aligned box between two corners. faces: string subset of "xXyYzZ" (lower = min side). */
  box(x0, y0, z0, x1, y1, z1, o = {}) {
    const f = o.faces || 'xXyYzZ';
    const P = (x, y, z) => new THREE.Vector3(x, y, z);
    const q = (a, b, c, d, u0, v0) => this.quad(a, b, c, d, { ...o, u0, v0 });
    if (f.includes('Z')) q(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), x0, y0);
    if (f.includes('z')) q(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), -x1, y0);
    if (f.includes('X')) q(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), -z1, y0);
    if (f.includes('x')) q(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), z0, y0);
    if (f.includes('Y')) q(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), x0, -z1);
    if (f.includes('y')) q(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), x0, z0);
    return this;
  }

  /** Box centred on a point. */
  cube(cx, cy, cz, sx, sy, sz, o) { return this.box(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, o); }

  /** Rectangular beam from p0 to p1 (w across, h up in its own frame). */
  beam(p0, p1, w, h, o = {}) {
    const d = _a.subVectors(p1, p0);
    const len = d.length();
    const z = d.clone().normalize();
    const up = Math.abs(z.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3().crossVectors(up, z).normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(p0);
    if (o.roll) m.multiply(new THREE.Matrix4().makeRotationZ(o.roll));
    this.push(m);
    this.box(-w / 2, -h / 2, 0, w / 2, h / 2, len, o);
    this.pop();
    return this;
  }

  /** Vertical (y) frustum: r0 at the bottom, r1 at the top. */
  cylinder(cx, y0, cz, r0, r1, h, sides = 12, o = {}) {
    const tile = o.tile ?? this.tile;
    const col = o.color || this.color;
    const ring = [];
    const slope = (r0 - r1) / h;
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const n = new THREE.Vector3(c, slope, sn).normalize();
      const u = (a * Math.max(r0, r1)) / tile;
      const b = this.vert(new THREE.Vector3(cx + c * r0, y0, cz + sn * r0), n, u, y0 / tile, col);
      const t = this.vert(new THREE.Vector3(cx + c * r1, y0 + h, cz + sn * r1), n, u, (y0 + h) / tile, col);
      ring.push([b, t]);
    }
    for (let s = 0; s < sides; s++) {
      const [b0, t0] = ring[s], [b1, t1] = ring[s + 1];
      this.idx.push(b0, t0, b1, b1, t0, t1);
    }
    const cap = (y, r, up) => {
      const n = new THREE.Vector3(0, up ? 1 : -1, 0);
      const c0 = this.vert(new THREE.Vector3(cx, y, cz), n, cx / tile, cz / tile, col);
      const vs = [];
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        vs.push(this.vert(new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r), n, (cx + Math.cos(a) * r) / tile, (cz + Math.sin(a) * r) / tile, col));
      }
      for (let s = 0; s < sides; s++) up ? this.idx.push(c0, vs[s + 1], vs[s]) : this.idx.push(c0, vs[s], vs[s + 1]);
    };
    if (o.capTop !== false && r1 > 1e-4) cap(y0 + h, r1, true);
    if (o.capBottom) cap(y0, r0, false);
    return this;
  }

  /** Tube along an arbitrary segment. */
  rod(p0, p1, r, sides = 6, o = {}) {
    const d = _a.subVectors(p1, p0);
    const len = d.length();
    const y = d.clone().normalize();
    const ref = Math.abs(y.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3().crossVectors(ref, y).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    this.push(new THREE.Matrix4().makeBasis(x, y, z).setPosition(p0));
    this.cylinder(0, 0, 0, r, o.r1 ?? r, len, sides, { capTop: o.caps !== false, capBottom: o.caps !== false, ...o });
    this.pop();
    return this;
  }

  /** Surface of revolution around Y from a profile [[radius, y], ...] (bottom to top). */
  lathe(profile, sides = 16, o = {}) {
    const tile = o.tile ?? this.tile;
    const col = o.color || this.color;
    let prev = null;
    let vAcc = 0;
    for (let i = 0; i < profile.length; i++) {
      const [r, y] = profile[i];
      const pa = profile[Math.max(0, i - 1)], pb = profile[Math.min(profile.length - 1, i + 1)];
      const dr = pb[0] - pa[0], dy = pb[1] - pa[1];
      if (i > 0) vAcc += Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]);
      const ring = [];
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const c = Math.cos(a), sn = Math.sin(a);
        const n = new THREE.Vector3(dy * c, -dr, dy * sn).normalize();
        ring.push(this.vert(new THREE.Vector3(c * r, y, sn * r), n, (a * Math.max(r, 0.2)) / tile, vAcc / tile, col));
      }
      if (prev) for (let s = 0; s < sides; s++) this.idx.push(prev[s], ring[s], prev[s + 1], prev[s + 1], ring[s], ring[s + 1]);
      prev = ring;
    }
    return this;
  }

  /** Ribbon following a list of {p, right, v} cross-sections (roads, railings, rims). */
  ribbon(sections, o = {}) {
    const tile = o.tile ?? this.tile;
    const col = o.color || this.color;
    let prev = null;
    for (const s of sections) {
      const n = s.n || new THREE.Vector3(0, 1, 0);
      const l = this.vert(s.l, n, 0, s.v / tile, s.cl || col), r = this.vert(s.r, n, (s.w ?? s.l.distanceTo(s.r)) / tile, s.v / tile, s.cr || col);
      if (prev) this.idx.push(prev[0], l, prev[1], prev[1], l, r);
      prev = [l, r];
    }
    return this;
  }

  /** Append an existing geometry (position/normal/uv) with a transform. */
  add(geo, matrix = IDENTITY, col = this.color) {
    const p = geo.attributes.position, n = geo.attributes.normal, u = geo.attributes.uv;
    const base = this.count;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      _a.fromBufferAttribute(p, i).applyMatrix4(matrix);
      _b.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      this.vert(_a.clone(), _b.clone(), u ? u.getX(i) : 0, u ? u.getY(i) : 0, col);
    }
    const index = geo.index;
    if (index) for (let i = 0; i < index.count; i++) this.idx.push(base + index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    return this;
  }

  get empty() { return this.count === 0; }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 4));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const IDENTITY = new THREE.Matrix4();

/** A set of builders keyed by material name, turned into meshes in one go. */
export class Parts {
  constructor() { this.map = new Map(); }
  get(name) {
    if (!this.map.has(name)) this.map.set(name, new MeshBuilder());
    return this.map.get(name);
  }
  /** Apply the same placement to every builder used inside fn. */
  toMeshes(materials, { name = 'prop', layers = [], castShadow = true } = {}) {
    const group = new THREE.Group();
    group.name = name;
    for (const [key, b] of this.map) {
      if (b.empty) continue;
      const mat = materials[key];
      if (!mat) throw new Error(`Unknown material: ${key}`);
      const mesh = new THREE.Mesh(b.build(), mat);
      mesh.name = `${name}:${key}`;
      mesh.matrixAutoUpdate = false;
      for (const l of layers) mesh.layers.enable(l);
      if (mat.transparent) { mesh.renderOrder = 20; mesh.layers.set(0); }
      group.add(mesh);
    }
    return group;
  }
}
