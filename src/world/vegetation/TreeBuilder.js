// Procedural tree generator: grows a branch skeleton from per-species parameters,
// then builds bark tubes and foliage cards (camera-facing leaf clumps) for two levels of detail.
import * as THREE from 'three';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UP = new THREE.Vector3(0, 1, 0);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * Species parameters. Lengths in metres for a tree of nominal size.
 * levels[i]: len, segs, count (children per parent), angle [min,max] (deg from parent axis),
 * span [t0,t1] (where along the parent the children sit), up (curve towards the sky, <0 droops),
 * wander, taper, radius (ratio to the parent's local radius), sides (tube segments around).
 */
export const SPECIES = {
  oak: {
    height: 17, bark: 'oak', leaf: 'oak', barkColor: [0.19, 0.16, 0.13],
    trunk: { len: 5.4, radius: 0.46, segs: 6, lean: 0.06, wander: 0.05, taper: 0.28, sides: 9, flare: 1.0 },
    levels: [
      { len: [8.6, 10.4], segs: 7, count: [5, 6], angle: [28, 58], span: [0.52, 1.0], up: 0.5, wander: 0.2, taper: 0.72, radius: 0.62, sides: 6, shape: 'flat' },
      { len: [3.6, 5.2], segs: 4, count: [6, 8], angle: [45, 72], span: [0.28, 1.0], up: 0.2, wander: 0.25, taper: 0.8, radius: 0.5, sides: 4, shape: 'mid' },
      { len: [1.4, 2.2], segs: 2, count: [3, 5], angle: [35, 65], span: [0.3, 1.0], up: 0.15, wander: 0.3, taper: 0.8, radius: 0.5, sides: 0 },
    ],
    cards: { count: 270, size: [1.5, 2.1], lod1: 84, lod1Size: 1.75 }, leafTint: [0.74, 0.86, 0.72], sway: 0.7,
  },
  beech: {
    height: 20, bark: 'smooth', leaf: 'beech', barkColor: [0.3, 0.29, 0.26],
    trunk: { len: 17.5, radius: 0.4, segs: 12, lean: 0.03, wander: 0.035, taper: 0.9, sides: 9, flare: 0.7 },
    levels: [
      { len: [3.2, 7.4], segs: 6, count: [15, 18], angle: [38, 68], span: [0.3, 0.98], up: 0.38, wander: 0.16, taper: 0.8, radius: 0.5, sides: 5, shape: 'ovoid', angleByT: -24 },
      { len: [1.8, 3.2], segs: 3, count: [4, 6], angle: [40, 65], span: [0.3, 1.0], up: 0.15, wander: 0.25, taper: 0.8, radius: 0.5, sides: 3, shape: 'mid' },
      { len: [0.9, 1.5], segs: 2, count: [2, 4], angle: [35, 60], span: [0.4, 1.0], up: 0.1, wander: 0.3, taper: 0.8, radius: 0.5, sides: 0 },
    ],
    cards: { count: 280, size: [1.35, 1.9], lod1: 88, lod1Size: 1.75 }, leafTint: [0.8, 0.86, 0.74], sway: 0.8,
  },
  birch: {
    height: 14, bark: 'birch', leaf: 'birch', barkColor: [0.62, 0.6, 0.55],
    trunk: { len: 13.2, radius: 0.17, segs: 12, lean: 0.1, wander: 0.07, taper: 0.92, sides: 7, flare: 0.5 },
    levels: [
      { len: [1.4, 3.6], segs: 5, count: [16, 20], angle: [36, 56], span: [0.36, 0.98], up: 0.3, wander: 0.2, taper: 0.85, radius: 0.42, sides: 4, shape: 'ovoid', angleByT: -14 },
      { len: [1.0, 1.9], segs: 3, count: [3, 5], angle: [30, 60], span: [0.3, 1.0], up: -0.55, wander: 0.3, taper: 0.85, radius: 0.5, sides: 3 },
    ],
    cards: { count: 200, size: [0.95, 1.4], lod1: 70, lod1Size: 1.7 }, leafTint: [0.86, 0.9, 0.72], sway: 1.3,
  },
  willow: {
    height: 12, bark: 'oak', leaf: 'willow', barkColor: [0.2, 0.17, 0.13],
    trunk: { len: 3.0, radius: 0.4, segs: 4, lean: 0.12, wander: 0.08, taper: 0.2, sides: 8, flare: 1.1 },
    levels: [
      { len: [5.6, 7.2], segs: 7, count: [5, 6], angle: [34, 62], span: [0.55, 1.0], up: 0.42, wander: 0.2, taper: 0.75, radius: 0.6, sides: 6, shape: 'flat' },
      { len: [2.6, 4.2], segs: 5, count: [6, 8], angle: [40, 75], span: [0.25, 1.0], up: -0.35, wander: 0.22, taper: 0.85, radius: 0.5, sides: 4, shape: 'mid' },
    ],
    cards: { count: 190, size: [1.15, 1.5], hang: [2.6, 4.2], lod1: 64, lod1Size: 1.6 }, leafTint: [0.82, 0.88, 0.74], sway: 1.6,
  },
  pine: {
    height: 22, bark: 'pine', leaf: 'pine', barkColor: [0.3, 0.17, 0.11],
    trunk: { len: 20.5, radius: 0.33, segs: 12, lean: 0.07, wander: 0.05, taper: 0.8, sides: 8, flare: 0.5 },
    levels: [
      { len: [2.6, 5.4], segs: 5, count: [11, 14], angle: [58, 84], span: [0.66, 0.99], up: 0.5, wander: 0.18, taper: 0.8, radius: 0.5, sides: 5, shape: 'umbrella', angleByT: -30 },
      { len: [1.1, 2.0], segs: 2, count: [3, 5], angle: [30, 60], span: [0.35, 1.0], up: 0.3, wander: 0.3, taper: 0.8, radius: 0.5, sides: 3 },
    ],
    cards: { count: 150, size: [1.5, 2.1], lod1: 56, lod1Size: 1.6 }, leafTint: [0.76, 0.88, 0.82], sway: 0.9,
  },
  cypress: {
    height: 16, bark: 'pine', leaf: 'cypress', barkColor: [0.24, 0.16, 0.11],
    trunk: { len: 15.4, radius: 0.24, segs: 8, lean: 0.02, wander: 0.02, taper: 0.95, sides: 6, flare: 0.5 },
    cone: { radius: 2.3, base: 0.1, peak: 0.24 },
    cards: { count: 230, size: [1.25, 1.7], lod1: 76, lod1Size: 1.6 }, leafTint: [0.76, 0.9, 0.82], sway: 0.5,
  },
  plane: {
    height: 19, bark: 'smooth', leaf: 'plane', barkColor: [0.36, 0.35, 0.3],
    trunk: { len: 7.2, radius: 0.44, segs: 7, lean: 0.04, wander: 0.04, taper: 0.3, sides: 9, flare: 0.8 },
    levels: [
      { len: [8.6, 10.6], segs: 7, count: [4, 5], angle: [24, 46], span: [0.6, 1.0], up: 0.5, wander: 0.18, taper: 0.72, radius: 0.62, sides: 6, shape: 'flat' },
      { len: [3.4, 5.0], segs: 4, count: [6, 8], angle: [42, 70], span: [0.3, 1.0], up: 0.2, wander: 0.25, taper: 0.8, radius: 0.5, sides: 4, shape: 'mid' },
      { len: [1.3, 2.1], segs: 2, count: [3, 5], angle: [35, 65], span: [0.3, 1.0], up: 0.15, wander: 0.3, taper: 0.8, radius: 0.5, sides: 0 },
    ],
    cards: { count: 240, size: [1.6, 2.2], lod1: 80, lod1Size: 1.75 }, leafTint: [0.78, 0.86, 0.72], sway: 0.8,
  },
  palm: {
    height: 13, bark: 'palm', leaf: 'palm', barkColor: [0.3, 0.25, 0.19],
    trunk: { len: 11.6, radius: 0.24, segs: 10, lean: 0.14, wander: 0.03, taper: 0.3, sides: 7, flare: 0.9 },
    fronds: { count: 17, len: [3.6, 4.6], width: 1.5 },
    cards: { count: 0, size: [1, 1], lod1: 0, lod1Size: 1 }, leafTint: [1, 1, 0.9], sway: 1.2,
  },
  // garden shrubs: a short stem, a dome of arching branches (planted in the rock garden and along hedges)
  bush: {
    height: 2.6, bark: 'smooth', leaf: 'bush', barkColor: [0.2, 0.17, 0.13], shrub: 0.62,
    trunk: { len: 0.5, radius: 0.1, segs: 2, lean: 0.2, wander: 0.1, taper: 0.25, sides: 5, flare: 0.4 },
    levels: [
      { len: [1.1, 1.7], segs: 3, count: [9, 11], angle: [25, 88], span: [0.2, 1.0], up: 0.45, wander: 0.22, taper: 0.75, radius: 0.6, sides: 3, shape: 'mid' },
      { len: [0.5, 0.9], segs: 2, count: [3, 4], angle: [35, 70], span: [0.35, 1.0], up: 0.2, wander: 0.3, taper: 0.8, radius: 0.5, sides: 0 },
    ],
    cards: { count: 84, size: [0.85, 1.2], lod1: 30, lod1Size: 1.5 }, leafTint: [0.74, 0.86, 0.68], sway: 0.45,
  },
  bloom: {
    height: 2.2, bark: 'smooth', leaf: 'bloom', barkColor: [0.2, 0.17, 0.13], shrub: 0.55,
    trunk: { len: 0.4, radius: 0.09, segs: 2, lean: 0.2, wander: 0.1, taper: 0.25, sides: 5, flare: 0.4 },
    levels: [
      { len: [0.9, 1.4], segs: 3, count: [9, 11], angle: [30, 88], span: [0.2, 1.0], up: 0.4, wander: 0.22, taper: 0.75, radius: 0.6, sides: 3, shape: 'mid' },
      { len: [0.45, 0.8], segs: 2, count: [3, 4], angle: [35, 70], span: [0.35, 1.0], up: 0.2, wander: 0.3, taper: 0.8, radius: 0.5, sides: 0 },
    ],
    cards: { count: 76, size: [0.8, 1.1], lod1: 28, lod1Size: 1.5 }, leafTint: [0.86, 0.9, 0.84], sway: 0.45,
  },
};

export const SPECIES_ORDER = ['oak', 'beech', 'birch', 'willow', 'pine', 'cypress', 'plane', 'palm', 'bush', 'bloom'];

// ---------------------------------------------------------------------------

class Geo {
  constructor(attrs) {
    this.attrs = attrs; // { name: itemSize }
    this.data = {};
    for (const k of Object.keys(attrs)) this.data[k] = [];
    this.index = [];
    this.count = 0;
  }
  vertex(values) {
    for (const k of Object.keys(this.attrs)) {
      const v = values[k];
      for (let i = 0; i < this.attrs[k]; i++) this.data[k].push(v[i]);
    }
    return this.count++;
  }
  tri(a, b, c) { this.index.push(a, b, c); }
  build() {
    const g = new THREE.BufferGeometry();
    for (const k of Object.keys(this.attrs)) g.setAttribute(k, new THREE.Float32BufferAttribute(this.data[k], this.attrs[k]));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.index, 1) : new THREE.Uint16BufferAttribute(this.index, 1));
    return g;
  }
}

function perpTo(dir) {
  const a = Math.abs(dir.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0);
  return new THREE.Vector3().crossVectors(dir, a).normalize();
}

/** Grow the skeleton. Returns { branches, anchors, height } */
function growSkeleton(sp, rnd) {
  const branches = [];
  const anchors = []; // { p: Vector3, dir: Vector3, w: branch weight }
  const tr = sp.trunk;

  const grow = (level, start, dir, length, radius, def, baseT) => {
    const segs = def.segs;
    const pts = [{ p: start.clone(), r: radius, d: dir.clone() }];
    const d = dir.clone();
    const p = start.clone();
    const step = length / segs;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const side = perpTo(d);
      const side2 = new THREE.Vector3().crossVectors(d, side);
      d.addScaledVector(side, (rnd() - 0.5) * 2 * def.wander).addScaledVector(side2, (rnd() - 0.5) * 2 * def.wander);
      // curve towards the sky (or droop). Drooping branches fall more towards their tips.
      const up = def.up || 0;
      if (up >= 0) d.y += (up / segs) * 1.6;
      else d.y += (up / segs) * (0.6 + 2.4 * t);
      d.normalize();
      p.addScaledVector(d, step);
      const r = radius * Math.max(0.12, 1 - t * def.taper);
      pts.push({ p: p.clone(), r, d: d.clone() });
    }
    const br = { level, pts, length, baseT };
    branches.push(br);
    return br;
  };

  const sample = (br, t) => {
    const f = clamp(t, 0, 1) * (br.pts.length - 1);
    const i = Math.min(br.pts.length - 2, Math.floor(f)), k = f - i;
    const a = br.pts[i], b = br.pts[i + 1];
    return { p: a.p.clone().lerp(b.p, k), r: lerp(a.r, b.r, k), d: a.d.clone().lerp(b.d, k).normalize() };
  };

  const shapeRatio = (shape, t) => {
    switch (shape) {
      case 'ovoid': return 0.35 + 0.65 * Math.sin(Math.PI * clamp((t - 0.05) * 1.05, 0, 1)) ** 0.7 * (1.2 - 0.55 * t);
      case 'mid': return 0.55 + 0.45 * Math.sin(Math.PI * clamp(t * 0.9 + 0.1, 0, 1));
      case 'umbrella': return 0.62 + 0.38 * (1 - t);
      case 'flat': default: return 1;
    }
  };

  const spawn = (parent, levelIdx, baseT) => {
    const def = sp.levels[levelIdx];
    if (!def) return;
    const n = Math.round(lerp(def.count[0], def.count[1], rnd()));
    let az = rnd() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const u = (k + 0.25 + rnd() * 0.5) / n;
      const t = lerp(def.span[0], def.span[1], u);
      const s = sample(parent, t);
      az += 2.39996 + (rnd() - 0.5) * 0.9; // golden angle keeps the branches well spread
      let ang = lerp(def.angle[0], def.angle[1], rnd());
      if (def.angleByT) ang += def.angleByT * u;
      ang *= Math.PI / 180;
      const side = perpTo(s.d);
      const q = new THREE.Quaternion().setFromAxisAngle(s.d, az);
      side.applyQuaternion(q);
      const dir = s.d.clone().multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang)).normalize();
      // keep limbs from diving into the ground
      if (levelIdx <= 1 && dir.y < -0.15 && (def.up || 0) >= 0) dir.y = -0.15 + rnd() * 0.2, dir.normalize();
      const len = lerp(def.len[0], def.len[1], rnd()) * shapeRatio(def.shape, u) * (levelIdx === 0 ? 1 : clamp(parent.length / lerp(sp.levels[levelIdx - 1].len[0], sp.levels[levelIdx - 1].len[1], 0.5), 0.6, 1.25));
      const radius = Math.max(0.02, s.r * def.radius * (0.85 + rnd() * 0.3));
      const start = s.p.clone().addScaledVector(dir, -s.r * 0.3);
      const br = grow(levelIdx + 1, start, dir, len, radius, def, baseT);
      br.meshSides = def.sides;
      const last = levelIdx === sp.levels.length - 1;
      if (last) {
        // foliage anchors along the outer part and at the tip
        const m = Math.max(1, Math.round(len / 1.1));
        for (let j = 0; j < m; j++) {
          const tt = lerp(0.45, 1.0, (j + 0.5) / m);
          const ss = sample(br, tt);
          anchors.push({ p: ss.p, d: ss.d, w: 1 });
        }
        anchors.push({ p: br.pts[br.pts.length - 1].p.clone(), d: br.pts[br.pts.length - 1].d.clone(), w: 1 });
      } else {
        spawn(br, levelIdx + 1, baseT);
        const tip = br.pts[br.pts.length - 1];
        anchors.push({ p: tip.p.clone(), d: tip.d.clone(), w: 1 });
      }
    }
  };

  // trunk
  const lean = new THREE.Vector3((rnd() - 0.5) * 2 * tr.lean, 1, (rnd() - 0.5) * 2 * tr.lean).normalize();
  const trunk = grow(0, new THREE.Vector3(0, -0.5, 0), lean, tr.len + 0.5, tr.radius, { segs: tr.segs, wander: tr.wander, up: 0.12, taper: tr.taper }, 0);
  trunk.meshSides = tr.sides;
  trunk.isTrunk = true;
  if (sp.levels) spawn(trunk, 0, 0);
  if (sp.levels && sp.levels[0].shape !== 'flat') anchors.push({ p: trunk.pts[trunk.pts.length - 1].p.clone(), d: UP.clone(), w: 1 });
  return { branches, anchors, trunk };
}

/** Bark tube along a branch (parallel-transported rings). */
function addTube(geo, br, sides, treeH, uRepeat, flare) {
  const pts = br.pts;
  let normal = perpTo(pts[0].d);
  let v = 0;
  const r0 = pts[0].r;
  const vScale = uRepeat / (2 * Math.PI * Math.max(r0, 0.05));
  let prevRing = null;
  for (let i = 0; i < pts.length; i++) {
    const { p, d } = pts[i];
    // transport the frame
    normal.addScaledVector(d, -normal.dot(d)).normalize();
    const binormal = new THREE.Vector3().crossVectors(d, normal);
    if (i > 0) v += pts[i].p.distanceTo(pts[i - 1].p) * vScale;
    let r = pts[i].r;
    const ring = [];
    const h01 = clamp(p.y / treeH, 0, 1);
    const sway = h01 * h01;
    const branchW = br.level === 0 ? 0 : clamp((i / (pts.length - 1)) * (0.4 + 0.3 * br.level), 0, 1);
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      let rr = r;
      if (flare > 0 && br.isTrunk) {
        // root flare with a few buttresses, fading out above the ground
        const f = Math.exp(-Math.max(0, p.y) / 0.55) * flare;
        rr *= 1 + f * (0.75 + 0.28 * Math.sin(a * 3 + 1.3) + 0.14 * Math.sin(a * 5 + 0.4));
      }
      const nx = Math.cos(a), ny = Math.sin(a);
      const nrm = new THREE.Vector3().addScaledVector(normal, nx).addScaledVector(binormal, ny);
      const pos = p.clone().addScaledVector(nrm, rr);
      ring.push(geo.vertex({
        position: [pos.x, pos.y, pos.z], normal: [nrm.x, nrm.y, nrm.z],
        uv: [(s / sides) * uRepeat, v], aWind: [sway, branchW, br.baseT || 0],
      }));
    }
    if (prevRing) {
      for (let s = 0; s < sides; s++) {
        geo.tri(prevRing[s], ring[s], prevRing[s + 1]);
        geo.tri(prevRing[s + 1], ring[s], ring[s + 1]);
      }
    }
    prevRing = ring;
  }
  // pointed tip
  const tip = pts[pts.length - 1];
  const tp = tip.p.clone().addScaledVector(tip.d, tip.r * 1.5);
  const h01 = clamp(tp.y / treeH, 0, 1);
  const c = geo.vertex({ position: [tp.x, tp.y, tp.z], normal: [tip.d.x, tip.d.y, tip.d.z], uv: [0.5 * uRepeat, v + 0.2], aWind: [h01 * h01, br.level === 0 ? 0 : 1, br.baseT || 0] });
  for (let s = 0; s < sides; s++) geo.tri(prevRing[s], c, prevRing[s + 1]);
}

/** Keep at most `max` anchors with a minimum spacing (outer ones first). */
function thin(anchors, minDist, max, center, rnd) {
  const scored = anchors.map((a) => ({ a, s: a.p.distanceTo(center) + rnd() * 1.5 }));
  scored.sort((x, y) => y.s - x.s);
  const out = [];
  const cell = minDist, grid = new Map();
  const key = (p) => `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)},${Math.floor(p.z / cell)}`;
  for (const { a } of scored) {
    if (out.length >= max) break;
    let ok = true;
    const cx = Math.floor(a.p.x / cell), cy = Math.floor(a.p.y / cell), cz = Math.floor(a.p.z / cell);
    for (let i = -1; i <= 1 && ok; i++) for (let j = -1; j <= 1 && ok; j++) for (let k = -1; k <= 1; k++) {
      const list = grid.get(`${cx + i},${cy + j},${cz + k}`);
      if (!list) continue;
      for (const q of list) if (q.distanceToSquared(a.p) < minDist * minDist) { ok = false; break; }
      if (!ok) break;
    }
    if (!ok) continue;
    out.push(a);
    const kk = key(a.p);
    if (!grid.has(kk)) grid.set(kk, []);
    grid.get(kk).push(a.p);
  }
  return out;
}

const LEAF_ATTRS = { position: 3, normal: 3, uv: 2, aCorner: 3, aLeaf: 4 };

/** Camera-facing leaf card. mode: 0 = free billboard, 1 = hanging (vertical axis), 2 = solid geometry (no billboard). */
function addCard(geo, center, size, hang, nrm, tile, roll, leaf, mode) {
  const u0 = (tile % 2) * 0.5, v0 = Math.floor(tile / 2) * 0.5;
  const pad = 0.004;
  const c = Math.cos(roll), s = Math.sin(roll);
  const corners = hang
    ? [[-0.5 * size, -hang], [0.5 * size, -hang], [0.5 * size, 0.12 * hang], [-0.5 * size, 0.12 * hang]]
    : [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, y]) => [(x * c - y * s) * size, (x * s + y * c) * size]);
  const uvs = [[u0 + pad, v0 + 0.5 - pad], [u0 + 0.5 - pad, v0 + 0.5 - pad], [u0 + 0.5 - pad, v0 + pad], [u0 + pad, v0 + pad]];
  const ids = corners.map((co, i) => geo.vertex({
    position: [center.x, center.y, center.z], normal: [nrm.x, nrm.y, nrm.z], uv: uvs[i], aCorner: [co[0], co[1], mode], aLeaf: leaf,
  }));
  geo.tri(ids[0], ids[1], ids[2]);
  geo.tri(ids[0], ids[2], ids[3]);
}

function crownStats(anchors) {
  const box = new THREE.Box3();
  for (const a of anchors) box.expandByPoint(a.p);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  return { center, size, box };
}

function addFoliage(geo, sp, anchors, count, sizeRange, treeH, rnd, stats, lodScale = 1) {
  const { center, size } = stats;
  const core = center.clone(); core.y -= size.y * 0.12;
  const minDist = Math.cbrt((size.x * size.y * size.z * 0.5) / Math.max(1, count)) * 0.62;
  const picked = thin(anchors, minDist, count, core, rnd);
  const hang = sp.cards.hang;
  for (const a of picked) {
    const p = a.p.clone();
    // nudge outwards so the leaves wrap the branch ends
    const out = p.clone().sub(core);
    const rel = new THREE.Vector3(out.x / (size.x * 0.5 + 1e-3), out.y / (size.y * 0.5 + 1e-3), out.z / (size.z * 0.5 + 1e-3));
    const depth = clamp(rel.length(), 0, 1.2);
    out.normalize();
    p.addScaledVector(out, 0.25 * lodScale);
    const nrm = out.clone().lerp(UP, 0.28).normalize();
    const s = lerp(sizeRange[0], sizeRange[1], rnd()) * lodScale;
    const h01 = clamp(p.y / treeH, 0, 1);
    // darker towards the inside and the underside of the crown
    const ao = clamp(lerp(0.42, 1.0, smooth(0.35, 1.0, depth)) * lerp(0.72, 1.0, smooth(-0.6, 0.5, rel.y)), 0.3, 1);
    const leaf = [h01 * h01, rnd(), ao, rnd()];
    if (hang) addCard(geo, p, s, lerp(hang[0], hang[1], rnd()) * (0.85 + 0.3 * lodScale * 0.5), 0, nrm, (rnd() * 4) | 0, 0, leaf, 1);
    else addCard(geo, p, s, 0, nrm, (rnd() * 4) | 0, rnd() * Math.PI * 2, leaf, 0);
  }
}

/** Conical conifer: foliage cards on a cone around a single trunk. */
function coneAnchors(sp, rnd) {
  const out = [];
  const H = sp.trunk.len, c = sp.cone;
  const n = 900;
  for (let i = 0; i < n; i++) {
    const t = lerp(c.base, 1.02, rnd());
    const prof = t < c.peak ? lerp(0.55, 1, (t - c.base) / (c.peak - c.base)) : Math.pow(1 - (t - c.peak) / (1.03 - c.peak), 0.8);
    const r = c.radius * Math.max(0.05, prof) * (0.55 + 0.45 * Math.sqrt(rnd()));
    const a = rnd() * Math.PI * 2;
    out.push({ p: new THREE.Vector3(Math.cos(a) * r, t * H, Math.sin(a) * r), d: UP.clone(), w: 1 });
  }
  return out;
}

/** Palm: arching fronds built as real geometry (two-sided strips). */
function addFronds(geo, sp, top, rnd, treeH, detail) {
  const f = sp.fronds;
  const segs = detail ? 7 : 4;
  for (let i = 0; i < f.count; i++) {
    const az = (i / f.count) * Math.PI * 2 + rnd() * 0.5;
    const lift = lerp(-0.25, 1.05, Math.pow(rnd(), 0.8)); // some droop below the horizon, most rise
    const len = lerp(f.len[0], f.len[1], rnd());
    const dir = new THREE.Vector3(Math.cos(az), lift, Math.sin(az)).normalize();
    const side = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
    const p = top.clone();
    const d = dir.clone();
    const tile = (rnd() * 2) | 0;
    let prev = null;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const w = f.width * Math.sin(Math.PI * clamp(t * 0.92 + 0.06, 0, 1)) ** 0.5 * 0.5;
      const nrm = new THREE.Vector3().crossVectors(side, d).normalize();
      if (nrm.y < 0) nrm.negate();
      const h01 = clamp(p.y / treeH, 0, 1);
      const leaf = [h01 * h01, rnd() * 0.2 + i * 0.37, lerp(0.6, 1, t), rnd() * 0.3 + 0.2];
      // slight V section so the frond catches the light
      const a = geo.vertex({ position: [p.x - side.x * w, p.y - side.y * w - w * 0.18, p.z - side.z * w], normal: [nrm.x, nrm.y, nrm.z], uv: [t, tile * 0.5 + 0.02], aCorner: [0, 0, 2], aLeaf: [leaf[0], leaf[1] + 0.3 + t * 0.6, leaf[2], leaf[3]] });
      const b = geo.vertex({ position: [p.x + side.x * w, p.y + side.y * w - w * 0.18, p.z + side.z * w], normal: [nrm.x, nrm.y, nrm.z], uv: [t, tile * 0.5 + 0.48], aCorner: [0, 0, 2], aLeaf: [leaf[0], leaf[1] + 0.3 + t * 0.6, leaf[2], leaf[3]] });
      if (prev) { geo.tri(prev[0], a, prev[1]); geo.tri(prev[1], a, b); }
      prev = [a, b];
      d.y -= (0.32 + 0.5 * t) * (4 / segs) * 0.5; // gravity bends the frond
      d.normalize();
      p.addScaledVector(d, len / segs);
    }
  }
}

/**
 * Build one tree variant.
 * @returns {{ wood0, leaf0, lod1, height, radius, crownY, trunkRadius, species }}
 */
export function buildTree(name, seed) {
  const sp = SPECIES[name];
  const rnd = rng(seed);
  const { branches, anchors: grown, trunk } = growSkeleton(sp, rnd);
  let anchors = grown;
  if (sp.cone) anchors = coneAnchors(sp, rnd);
  const top = trunk.pts[trunk.pts.length - 1].p;
  let treeH = top.y;
  for (const a of anchors) treeH = Math.max(treeH, a.p.y);
  if (sp.fronds) treeH = top.y + 3.2;
  treeH += 0.8;

  const stats = anchors.length ? crownStats(anchors) : { center: top.clone(), size: new THREE.Vector3(8, 6, 8), box: new THREE.Box3().setFromCenterAndSize(top, new THREE.Vector3(8, 6, 8)) };

  // ---- LOD0
  const wood0 = new Geo({ position: 3, normal: 3, uv: 2, aWind: 3 });
  for (const br of branches) {
    if (!br.meshSides) continue;
    addTube(wood0, br, br.meshSides, treeH, br.level === 0 ? 4 : br.level === 1 ? 2 : 1, sp.trunk.flare);
  }
  const leaf0 = new Geo(LEAF_ATTRS);
  if (sp.fronds) addFronds(leaf0, sp, top, rnd, treeH, true);
  else addFoliage(leaf0, sp, anchors, sp.cards.count, sp.cards.size, treeH, rnd, stats);

  // ---- LOD1: trunk and main limbs only (as solid "leaf-shader" geometry) + fewer, larger cards
  const lod1 = new Geo(LEAF_ATTRS);
  const woodTmp = new Geo({ position: 3, normal: 3, uv: 2, aWind: 3 });
  for (const br of branches) {
    if (br.level > 1 || !br.meshSides) continue;
    addTube(woodTmp, br, br.level === 0 ? 5 : 3, treeH, 1, sp.trunk.flare * 0.8);
  }
  {
    const P = woodTmp.data.position, Nn = woodTmp.data.normal, Wd = woodTmp.data.aWind;
    for (let i = 0; i < woodTmp.count; i++) {
      lod1.vertex({
        position: [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], normal: [Nn[i * 3], Nn[i * 3 + 1], Nn[i * 3 + 2]],
        uv: [0, 0], aCorner: [0, 0, 3], aLeaf: [Wd[i * 3], 0.5, 0.75, 0.5],
      });
    }
    lod1.index.push(...woodTmp.index);
  }
  const rnd1 = rng(seed + 9173);
  if (sp.fronds) addFronds(lod1, sp, top, rnd1, treeH, false);
  else addFoliage(lod1, sp, anchors, sp.cards.lod1, sp.cards.size, treeH, rnd1, stats, sp.cards.lod1Size);

  const radius = Math.max(stats.size.x, stats.size.z) * 0.5 + 1.2;
  return {
    species: name,
    wood0: wood0.build(), leaf0: leaf0.build(), lod1: lod1.build(),
    height: treeH,
    radius: sp.fronds ? 4.6 : radius,
    crownY: stats.center.y,
    crownCenter: stats.center.clone(),
    crownSize: stats.size.clone(),
    trunkRadius: sp.trunk.radius,
    tris: { wood0: wood0.index.length / 3, leaf0: leaf0.index.length / 3, lod1: lod1.index.length / 3 },
  };
}
