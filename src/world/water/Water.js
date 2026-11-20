// Water system: pond surfaces, stream ribbons, the sea, and the planar reflection that feeds them.
import * as THREE from 'three';
import { makeMaterial, G } from '../../render/globals.js';
import { WATER_VERT, WATER_FRAG } from './waterShader.js';
import { fallsRibbon } from './Falls.js';
import { PlanarReflection } from './PlanarReflection.js';
import { loadTexture } from '../../core/Assets.js';

function offsetOutline(pts, d) {
  // push every vertex outwards along the average of its two edge normals
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const s = area > 0 ? 1 : -1;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    let nx = (b[1] - a[1]) * s, nz = -(b[0] - a[0]) * s;
    const l = Math.hypot(nx, nz) || 1;
    return [p[0] + (nx / l) * d, p[1] + (nz / l) * d];
  });
}

export class Water {
  constructor(engine, data) {
    this.engine = engine;
    this.data = data;
    this.group = new THREE.Group();
    this.group.name = 'water';
    this.reflection = new PlanarReflection(engine);
    this.materials = {};
  }

  async load() {
    const [r1, r2, foam] = await Promise.all([
      loadTexture('textures/water_n1.webp'),
      loadTexture('textures/water_n2.webp'),
      loadTexture('textures/foam.png'),
    ]);
    this.shared = {
      uRipple1: { value: r1 }, uRipple2: { value: r2 }, uFoam: { value: foam },
      uAux: { value: this.data.auxTex },
      uReflection: { value: this.reflection.target.texture },
      uReflMatrix: { value: this.reflection.matrix },
      uReflParams: { value: new THREE.Vector4(1, 0, 0, 1) },
    };
    const make = (defines, extra) => makeMaterial({
      uniforms: { ...this.shared, uCenter: { value: new THREE.Vector3() }, ...extra },
      defines,
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    const absorb = new THREE.Vector3(0.42, 0.11, 0.09);
    this.materials.pond = make({ POND: 1 }, {
      uAbsorb: { value: absorb }, uScatter: { value: new THREE.Vector3(0.022, 0.12, 0.105) },
      uRippleParams: { value: new THREE.Vector4(0.17, 0.05, 0.22, 0.045) },
    });
    this.materials.stream = make({ STREAM: 1 }, {
      uAbsorb: { value: absorb }, uScatter: { value: new THREE.Vector3(0.03, 0.12, 0.1) },
      uRippleParams: { value: new THREE.Vector4(0.3, 0.1, 0.5, 0.1) },
    });
    this.materials.sea = make({ SEA: 1 }, {
      uAbsorb: { value: new THREE.Vector3(0.3, 0.075, 0.055) }, uScatter: { value: new THREE.Vector3(0.012, 0.115, 0.17) },
      uRippleParams: { value: new THREE.Vector4(0.11, 0.028, 0.34, 0.06) },
    });
    this.falls = [];
    this._buildPonds();
    this._buildStreams();
    this._buildSea();
    this._buildLevelGrid();
    return this;
  }

  _mesh(geo, mat, name, order = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.frustumCulled = true;
    m.matrixAutoUpdate = false;
    m.renderOrder = 10 + order;
    this.group.add(m);
    return m;
  }

  _buildPonds() {
    for (const p of this.data.meta.ponds) {
      const outline = offsetOutline(p.outline, 1.4);
      const contour = outline.map((q) => new THREE.Vector2(q[0], q[1]));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      const pos = new Float32Array(outline.length * 3);
      outline.forEach((q, i) => { pos[i * 3] = q[0]; pos[i * 3 + 1] = p.level; pos[i * 3 + 2] = q[1]; });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aFlow', new THREE.BufferAttribute(new Float32Array(outline.length * 4), 4));
      const idx = [];
      // triangulateShape may flip the winding; make every triangle face up
      for (const t of tris) {
        const a = outline[t[0]], b = outline[t[1]], c = outline[t[2]];
        const up = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0;
        idx.push(t[0], up ? t[1] : t[2], up ? t[2] : t[1]);
      }
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      this._mesh(geo, this.materials.pond, `pond:${p.id}`);
    }
  }

  _buildStreams() {
    for (const s of this.data.meta.streams) {
      const pts = s.samples;
      const n = pts.length;
      const pos = new Float32Array(n * 2 * 3), flow = new Float32Array(n * 2 * 4), fade = new Float32Array(n * 2);
      const along = [0];
      for (let i = 1; i < n; i++) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const total = along[n - 1];
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        let tx = b[0] - a[0], tz = b[1] - a[1];
        const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        const slope = Math.max(0, (a[2] - b[2]) / tl);
        const speed = Math.min(3.2, 0.55 + slope * 9);
        const white = Math.min(1, Math.max(0, (slope - 0.1) * 4.5));
        const half = pts[i][3] / 2 + 1.1;
        const nx = -tz, nz = tx;
        // A stream starts and ends in still water (pond, sea): it dissolves into it instead of ending on an edge.
        const f = Math.min(1, along[i] / 2.5, (total - along[i]) / Math.min(7, total * 0.3));
        for (let k = 0; k < 2; k++) {
          const sgn = k ? 1 : -1, o = (i * 2 + k);
          pos[o * 3] = pts[i][0] + nx * half * sgn; pos[o * 3 + 1] = pts[i][2]; pos[o * 3 + 2] = pts[i][1] + nz * half * sgn;
          flow[o * 4] = tx; flow[o * 4 + 1] = tz; flow[o * 4 + 2] = speed; flow[o * 4 + 3] = white;
          fade[o] = f * f * (3 - 2 * f);
        }
      }
      const idx = [];
      // counter-clockwise seen from above: the surface faces the sky. Sheer drops are left to the waterfalls.
      const sheer = [];
      for (let i = 0; i < n - 1; i++) sheer.push(pts[i][2] - pts[i + 1][2] > (along[i + 1] - along[i]) * 1.6);
      // a tall fall takes the steep steps at its head and foot with it: that water is in the air too
      for (let i = 0; i < n - 1; i++) {
        if (!sheer[i] || sheer[i - 1]) continue;
        let j = i, drop = 0;
        while (sheer[j]) { drop += pts[j][2] - pts[j + 1][2]; j++; }
        if (drop < 3) continue;
        const steep = (k) => k >= 0 && k < n - 1 && pts[k][2] - pts[k + 1][2] > (along[k + 1] - along[k]) * 0.25;
        for (let k = i - 1; steep(k) && k > i - 4; k--) sheer[k] = true;
        for (let k = j; steep(k) && k < j + 4; k++) sheer[k] = true;
      }
      for (let i = 0; i < n - 1; i++) {
        if (sheer[i]) { this._fall(s, i, along); continue; }
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('aFlow', new THREE.BufferAttribute(flow, 4));
      geo.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      this._mesh(geo, this.materials.stream, `stream:${s.id}`, 1).userData.samples = pts;
    }
    this._buildFalls();
  }

  // A run of sheer samples (i → i+1 is one step of it): remembered once per drop.
  _fall(stream, i) {
    const last = this.falls[this.falls.length - 1];
    if (last && last.stream === stream && last.to === i) { last.to = i + 1; return; }
    this.falls.push({ stream, from: i, to: i + 1 });
  }

  // Waterfalls: a sheet of white water leaving the lip on a parabola, and the boil where it lands.
  _buildFalls() {
    for (const f of this.falls) {
      const pts = f.stream.samples;
      const lip = pts[Math.max(0, f.from - 1)], foot = pts[Math.min(pts.length - 1, f.to + 1)];
      const height = lip[2] - foot[2];
      if (height < 1.5) continue; // weirs and steps are drawn by the stream itself
      const up = pts[Math.max(0, f.from - 3)];
      let dx = pts[f.to][0] - up[0], dz = pts[f.to][1] - up[1];
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const side = new THREE.Vector3(-dz, 0, dx);
      const start = new THREE.Vector3(pts[f.from][0], pts[f.from][2] + 0.03, pts[f.from][1]);
      const v0 = 1.9 + height * 0.085; // m/s over the lip: a tall fall shoots clear of the rock (one can walk behind it)
      const T = Math.sqrt((2 * height) / 9.81);
      const sheet = [new THREE.Vector3(start.x - dx * 1.6, start.y + 0.02, start.z - dz * 1.6)];
      const steps = Math.max(6, Math.round(height * 1.3));
      for (let k = 0; k <= steps; k++) {
        const t = (k / steps) * T;
        sheet.push(new THREE.Vector3(start.x + dx * v0 * t, start.y - 4.905 * t * t, start.z + dz * v0 * t));
      }
      const wLip = pts[f.from][3] * 0.82;
      const mesh = fallsRibbon(sheet, side, wLip, this.shared.uFoam, (k) => (k === 0 ? 0 : 1));
      mesh.name = `falls:${f.stream.id}`;
      this.group.add(mesh);
      // the boil: a patch of foam on the pool, drifting downstream
      const land = sheet[sheet.length - 1];
      const boil = [];
      for (let k = -1; k <= 6; k++) boil.push(new THREE.Vector3(land.x + dx * k * 0.95, foot[2] + 0.04, land.z + dz * k * 0.95));
      const foam = fallsRibbon(boil, side, wLip * 1.5, this.shared.uFoam, (k) => [0, 0.85, 0.9, 0.75, 0.55, 0.35, 0.15, 0][k], true);
      foam.name = `falls:${f.stream.id}:boil`;
      this.group.add(foam);
    }
  }

  _buildSea() {
    // polar grid centred on the camera: dense near the viewer, stretching to the horizon
    const rings = 50, segs = 80;
    const pos = [0, 0, 0];
    for (let r = 1; r <= rings; r++) {
      const rad = 1.4 * (Math.pow(1.178, r) - 1) + r * 0.6;
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
      }
    }
    const idx = [];
    for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
    for (let r = 0; r < rings - 1; r++) {
      for (let s = 0; s < segs; s++) {
        const a = 1 + r * segs + s, b = 1 + r * segs + ((s + 1) % segs), c = a + segs, d = b + segs;
        idx.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aFlow', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 4), 4));
    geo.setIndex(idx);
    this.sea = this._mesh(geo, this.materials.sea, 'sea', -1);
    this.sea.frustumCulled = false;
  }

  /** Coarse map of "which water level is closest to here" (drives the reflection plane). */
  _buildLevelGrid() {
    const d = this.data, N = d.size, C = 8, n = N / C;
    const level = new Float32Array(n * n).fill(NaN);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let best = NaN, count = 0;
      for (let b = 0; b < C; b += 2) for (let a = 0; a < C; a += 2) {
        const q = (j * C + b) * N + i * C + a;
        const w = d.water[q];
        if (w > -500 && d.height[q] < w) { best = w; count++; }
      }
      if (count > 0) level[j * n + i] = best;
    }
    // nearest-value propagation
    for (let pass = 0; pass < n; pass++) {
      let changed = false;
      const src = Float32Array.from(level);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        if (!Number.isNaN(src[j * n + i])) continue;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= n || b >= n) continue;
          const v = src[b * n + a];
          if (!Number.isNaN(v)) { level[j * n + i] = v; changed = true; break; }
        }
      }
      if (!changed) break;
    }
    this.levelGrid = { n, cell: C, level };
  }

  /** Is any water body inside the view frustum and within `range` metres (the sea counts at any distance)? */
  _waterInView(camera, range, streams = 0.4) {
    const fr = this._frustum || (this._frustum = new THREE.Frustum());
    const pm = this._pm || (this._pm = new THREE.Matrix4());
    fr.setFromProjectionMatrix(pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem, camera.reversedDepth);
    const cp = camera.position;
    const v = this._v || (this._v = new THREE.Vector3());
    for (const m of this.group.children) {
      if (m === this.sea) continue;
      const sp = m.geometry.boundingSphere;
      if (!sp) return true;
      if (sp.distanceToPoint(cp) > range || !fr.intersectsSphere(sp)) continue;
      const pts = m.userData.samples;
      if (!pts) return true;
      // a stream is long and thin: look at the stretch near the viewer only (reflections are faint on it)
      if (streams <= 0) continue;
      const near = (range * streams) ** 2;
      for (let i = 0; i < pts.length; i += 3) {
        const q = pts[i];
        if ((q[0] - cp.x) ** 2 + (q[1] - cp.z) ** 2 < near && fr.containsPoint(v.set(q[0], q[2], q[1]))) return true;
      }
    }
    // open water east of the coast, up to the horizon
    const sea = this._seaBox || (this._seaBox = new THREE.Box3(new THREE.Vector3(250, -1, -3000), new THREE.Vector3(3200, 1, 3000)));
    return fr.intersectsBox(sea);
  }

  nearestLevel(x, z) {
    const g = this.levelGrid, half = this.data.half;
    if (x > half - 8) return 0;
    const i = Math.min(g.n - 1, Math.max(0, Math.floor((x + half) / g.cell)));
    const j = Math.min(g.n - 1, Math.max(0, Math.floor((z + half) / g.cell)));
    const v = g.level[j * g.n + i];
    return Number.isNaN(v) ? 0 : v;
  }

  update(dt, camera, scene) {
    const tier = this.engine.tier;
    const cp = camera.position;
    this.sea.material.uniforms.uCenter.value.set(Math.round(cp.x), 0, Math.round(cp.z));
    // reflect about the water the viewer is looking at: probe a little ahead of the camera
    const f = this._f || (this._f = new THREE.Vector3());
    f.set(0, 0, -1).applyQuaternion(camera.quaternion); f.y = 0;
    if (f.lengthSq() > 1e-6) f.normalize();
    const ahead = Math.min(40, 6 + Math.max(0, cp.y - this.nearestLevel(cp.x, cp.z)) * 1.2);
    this.reflection.targetY = this.nearestLevel(cp.x + f.x * ahead, cp.z + f.z * ahead);
    const on = this.reflection.enabled && tier.reflection > 0;
    this.group.visible = false; // never reflect water in water
    // the mirrored view is only worth a pass when some water can be seen and is close enough to show it
    const needed = on && this._waterInView(camera, tier.quality === 0 ? 260 : 520, tier.quality === 0 ? 0 : 0.4);
    const rendered = needed ? this.reflection.update(scene, camera, dt, this.every || tier.reflectionEvery) : false;
    this.group.visible = true;
    this.reflectionActive = needed;
    const rp = this.shared.uReflParams.value;
    rp.x = on && (rendered || this._hasReflection) ? 1 : 0;
    if (rendered) this._hasReflection = true;
    rp.y = this.reflection.planeY;
    rp.z = this.reflection.hdr ? 1 : 0;
    this.shared.uReflection.value = this.reflection.target.texture;
  }
}
