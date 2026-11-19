// The forest: thousands of trees drawn with a handful of instanced draw calls.
//   near  : full bark + foliage meshes
//   mid   : simplified mesh (one draw call per species variant)
//   far   : camera-facing impostors relit from pre-rendered atlases (every tree, static buffers)
// Levels cross-fade with a screen-space dither driven by the same distance formula on the GPU.
import * as THREE from 'three';
import { makeMaterial } from '../../render/globals.js';
import { LAYER } from '../../render/Shadows.js';
import { loadTexture } from '../../core/Assets.js';
import { buildTree, SPECIES, SPECIES_ORDER } from './TreeBuilder.js';
import { LEAF_VERT, LEAF_FRAG, WOOD_VERT, WOOD_FRAG, IMPOSTOR_VERT, IMPOSTOR_FRAG } from './treeShader.js';

const VARIANTS = 2;
// species may share a leaf atlas: load each one once
const leafCache = new Map();
function leafTexture(name, size) {
  const key = `${name}_${size}`;
  if (!leafCache.has(key)) leafCache.set(key, loadTexture(`textures/foliage/leaf_${key}.webp`, { srgb: true, repeat: false }));
  return leafCache.get(key);
}
const ELEV = 4, COLS = 4;
const CELL = 32; // metres, spatial hash for LOD queries

export class Forest {
  constructor(engine, data) {
    this.engine = engine;
    this.data = data;
    this.group = new THREE.Group();
    this.group.name = 'forest';
    this.lod = {
      uLodCam: { value: new THREE.Vector3() },
      uLodRange: { value: new THREE.Vector4(38, 14, 115, 14) },
    };
    this.species = [];
    this.stats = { near: 0, mid: 0, total: 0 };
    this._frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._sphere = new THREE.Sphere();
    this.setTier(engine.tier);
  }

  setTier(t) {
    this.lod.uLodRange.value.set(t.treeNear, t.treeFade, t.treeMid, t.treeFade * 1.4);
  }

  async load(onProgress = () => {}) {
    const tier = this.engine.tier;
    const size = tier.quality >= 2 ? 1024 : 512;
    const a2c = !!tier.msaa;
    this.a2c = a2c;
    const barkNames = [...new Set(SPECIES_ORDER.map((n) => SPECIES[n].bark))];
    const present = new Set();
    const T = this.data.trees;
    for (let i = 0; i < T.length; i += 6) present.add(T[i + 4]);
    present.add(SPECIES_ORDER.indexOf('palm'));
    const [leafTex, barkTex] = await Promise.all([
      Promise.all(SPECIES_ORDER.map((n, i) => (present.has(i) ? leafTexture(SPECIES[n].leaf, size) : null))),
      Promise.all(barkNames.map((b) => Promise.all([loadTexture(`textures/foliage/bark_${b}_c.webp`, { srgb: true }), loadTexture(`textures/foliage/bark_${b}_n.webp`)]))),
    ]);
    const bark = Object.fromEntries(barkNames.map((b, i) => [b, { c: barkTex[i][0], n: barkTex[i][1] }]));
    onProgress(0.3);

    // ---- materials and models
    const woodMats = {};
    const mkWood = (b, defines = {}) => makeMaterial({
      uniforms: { ...this.lod, uLodMode: { value: 0 }, uSway: { value: 1 }, uBarkTex: { value: bark[b].c }, uBarkNrm: { value: bark[b].n } },
      defines: { BAKE: 0, ...defines }, vertexShader: WOOD_VERT, fragmentShader: WOOD_FRAG,
    });
    const mkLeaf = (sp, tex, mode, defines = {}, opts = {}) => makeMaterial({
      uniforms: {
        ...this.lod, uLodMode: { value: mode }, uSway: { value: sp.sway }, uLeafTex: { value: tex },
        uLeafTint: { value: new THREE.Vector3(...sp.leafTint) }, uBarkColor: { value: new THREE.Vector3(...sp.barkColor) },
      },
      defines: { BAKE: 0, ...defines }, vertexShader: LEAF_VERT, fragmentShader: LEAF_FRAG, side: THREE.DoubleSide, ...opts,
    });
    this._mkLeaf = mkLeaf; this._mkWood = mkWood;

    const order = SPECIES_ORDER.map((name, si) => ({ name, si })).filter((s) => present.has(s.si));
    for (const { name, si } of order) {
      const sp = SPECIES[name];
      if (!woodMats[sp.bark]) {
        const m = mkWood(sp.bark);
        const d = mkWood(sp.bark, { DEPTH_ONLY: 1 }); d.colorWrite = false;
        woodMats[sp.bark] = { m, d };
      }
      const tex = leafTex[si];
      const leaf0 = mkLeaf(sp, tex, 0, a2c ? { USE_A2C: 1 } : {}, { alphaToCoverage: a2c });
      const leaf1 = mkLeaf(sp, tex, 1, a2c ? { USE_A2C: 1 } : {}, { alphaToCoverage: a2c });
      const depth0 = mkLeaf(sp, tex, 0, { DEPTH_ONLY: 1 }); depth0.colorWrite = false;
      const depth1 = mkLeaf(sp, tex, 1, { DEPTH_ONLY: 1 }); depth1.colorWrite = false;
      const models = [];
      for (let v = 0; v < VARIANTS; v++) models.push(buildTree(name, 1337 + si * 101 + v * 17));
      this.species[si] = { name, sp, si, tex, models, mats: { wood: woodMats[sp.bark], leaf0, leaf1, depth0, depth1 }, trees: [], variants: [] };
    }
    onProgress(0.5);

    this._buildInstances();
    onProgress(0.6);
    this._bakeImpostors();
    onProgress(0.95);
    this._buildImpostorMeshes();
    this.scene = null;
    return this;
  }

  _buildInstances() {
    const d = this.data, T = d.trees;
    const n = T.length / 6;
    const count = d.meta.treeCount; // the first `count` trees are inside the playable square
    this.count = count;
    this.total = n;
    this.matrices = new Float32Array(count * 16);
    this.colors = new Float32Array(count * 3);
    this.info = new Float32Array(count * 6); // x, y, z, radius, species, variant
    this.all = []; // every tree incl. backdrop: for impostors
    const grid = new Map();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < n; i++) {
      const x = T[i * 6], z = T[i * 6 + 1], scale = T[i * 6 + 2], rot = T[i * 6 + 3], si = T[i * 6 + 4];
      const sp = this.species[si];
      if (!sp) continue;
      const inMap = i < count;
      const y = (inMap ? d.heightAt(x, z) : T[i * 6 + 5]) - 0.12;
      const variant = (rnd() * VARIANTS) | 0;
      const tint = rnd();
      const look = (rnd() * 2) | 0;
      const tree = { x, y, z, scale, rot, si, variant, tint, phase: rnd(), col: variant * 2 + look, inMap };
      this.all.push(tree);
      sp.trees.push(tree);
      // per-tree foliage tone: mostly green, a few warmer crowns
      const warm = tint * tint;
      let cr = 0.9 + 0.22 * warm, cg = 0.94 + 0.08 * tint, cb = 0.95 - 0.25 * warm;
      const garden = sp.sp.shrub || scale < 0.36; // shrubs and dwarf specimens: a gardener's palette
      if (garden && sp.name !== 'bloom') {
        const k = rnd();
        if (sp.name === 'cypress') [cr, cg, cb] = k < 0.45 ? [0.78, 0.98, 1.2] : k < 0.7 ? [1.3, 1.22, 0.62] : [0.92, 1.0, 0.92];
        else if (sp.name === 'bush') [cr, cg, cb] = k < 0.5 ? [0.86, 0.96, 0.86] : k < 0.66 ? [1.28, 1.16, 0.62] : k < 0.8 ? [1.4, 0.86, 0.74] : k < 0.92 ? [1.12, 1.14, 0.98] : [0.8, 0.94, 1.06];
      } else if (sp.name === 'bloom') {
        // flower colour: pink, crimson, lilac-blue, white
        const k = rnd();
        [cr, cg, cb] = k < 0.4 ? [1.0, 0.94, 0.98] : k < 0.6 ? [1.08, 0.74, 0.8] : k < 0.82 ? [0.84, 0.9, 1.2] : [1.06, 1.1, 1.06];
      }
      tree.rgb = [cr, cg, cb]; // the same tone at every level of detail
      if (!inMap) continue;
      q.setFromAxisAngle(up, rot);
      const sy = scale * (0.94 + rnd() * 0.12);
      m.compose(p.set(x, y, z), q, s.set(scale, sy, scale));
      m.toArray(this.matrices, i * 16);
      this.colors[i * 3] = cr; this.colors[i * 3 + 1] = cg; this.colors[i * 3 + 2] = cb;
      const model = sp.models[variant];
      this.info.set([x, y, z, Math.max(model.radius, model.height * 0.5) * scale, si, variant], i * 6);
      const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    }
    this.grid = grid;

    // instanced meshes per species variant
    const perSV = new Map();
    for (let i = 0; i < count; i++) {
      const k = this.info[i * 6 + 4] * VARIANTS + this.info[i * 6 + 5];
      perSV.set(k, (perSV.get(k) || 0) + 1);
    }
    for (const sp of this.species) {
      if (!sp) continue;
      for (let v = 0; v < VARIANTS; v++) {
        const model = sp.models[v];
        const have = perSV.get(sp.si * VARIANTS + v) || 0;
        // shrubs are planted close together: many more of them can be near at once
        const cap0 = Math.max(4, Math.min(have, sp.sp.shrub ? 420 : 160)), cap1 = Math.max(4, Math.min(have, 1400));
        const mk = (geo, mat, cap, depth, name) => {
          const im = new THREE.InstancedMesh(geo, mat, cap);
          im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
          im.instanceColor.setUsage(THREE.DynamicDrawUsage);
          im.count = 0;
          im.frustumCulled = false;
          im.matrixAutoUpdate = false;
          im.name = name;
          im.userData.depthMaterial = depth;
          im.layers.enable(LAYER.DYNAMIC_CASTER);
          im.layers.enable(LAYER.REFLECT);
          this.group.add(im);
          return { mesh: im, cap, sum: -1 };
        };
        const wood0 = mk(model.wood0, sp.mats.wood.m, cap0, sp.mats.wood.d, `tree:${sp.name}${v}:wood`);
        const leaf0 = mk(model.leaf0, sp.mats.leaf0, cap0, sp.mats.depth0, `tree:${sp.name}${v}:leaf`);
        const lod1 = mk(model.lod1, sp.mats.leaf1, cap1, sp.mats.depth1, `tree:${sp.name}${v}:mid`);
        wood0.mesh.renderOrder = -2; // bark first: it occludes part of the foliage behind it
        sp.variants[v] = { wood0, leaf0, lod1, list0: [], list1: [] };
      }
    }
  }

  /** Render every species from a few viewpoints into its impostor atlas (colour + normal/occlusion). */
  _bakeImpostors() {
    const renderer = this.engine.renderer;
    const tier = this.engine.tier;
    const cell = tier.quality >= 2 ? 192 : tier.quality === 1 ? 160 : 128;
    const W = COLS * cell, H = ELEV * cell;
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const prevTarget = renderer.getRenderTarget();
    const prevClear = new THREE.Color(); renderer.getClearColor(prevClear);
    const prevAlpha = renderer.getClearAlpha();
    const prevAuto = renderer.autoClear;
    renderer.autoClear = false;
    const one = new THREE.Matrix4();
    for (const sp of this.species) {
      if (!sp) continue;
      const mkRT = (srgb, samples) => {
        const rt = new THREE.WebGLRenderTarget(W, H, {
          format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true, samples,
          minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true,
        });
        rt.texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        rt.texture.anisotropy = 2;
        return rt;
      };
      const rtA = mkRT(true, 4), rtN = mkRT(false, 0);
      const R = Math.max(...sp.models.map((m) => Math.max(m.radius, m.height * 0.5))) * 1.04;
      const cy = Math.max(...sp.models.map((m) => m.height)) * 0.5;
      sp.imp = { R, cy, rtA, rtN };
      const leafA = this._mkLeaf(sp.sp, sp.tex, 2, { BAKE: 1, USE_A2C: 1 }, { alphaToCoverage: true });
      const leafN = this._mkLeaf(sp.sp, sp.tex, 2, { BAKE: 2 });
      const woodA = this._mkWood(sp.sp.bark, { BAKE: 1 }), woodN = this._mkWood(sp.sp.bark, { BAKE: 2 });
      woodA.uniforms.uLodMode.value = 2; woodN.uniforms.uLodMode.value = 2;
      for (const [rt, lm, wm, clear, alpha] of [[rtA, leafA, woodA, 0x000000, 0], [rtN, leafN, woodN, 0x8080ff, 0.7]]) {
        renderer.setRenderTarget(rt);
        renderer.setClearColor(clear, alpha);
        rt.scissorTest = false;
        rt.viewport.set(0, 0, W, H);
        renderer.clear();
        for (let c = 0; c < COLS; c++) {
          const model = sp.models[c >> 1];
          const wood = new THREE.InstancedMesh(model.wood0, wm, 1), leaf = new THREE.InstancedMesh(model.leaf0, lm, 1);
          one.makeRotationY((c & 1) * 2.4);
          wood.setMatrixAt(0, one); leaf.setMatrixAt(0, one);
          wood.frustumCulled = leaf.frustumCulled = false;
          scene.add(wood, leaf);
          for (let e = 0; e < ELEV; e++) {
            const elev = (e / (ELEV - 1)) * 1.553; // up to 89 degrees
            cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R;
            cam.position.set(0, cy + Math.sin(elev) * 100, Math.cos(elev) * 100);
            cam.up.set(0, 1, 0);
            cam.lookAt(0, cy, 0);
            cam.updateProjectionMatrix();
            cam.updateMatrixWorld(true);
            rt.viewport.set(c * cell, e * cell, cell, cell);
            rt.scissor.set(c * cell, e * cell, cell, cell);
            rt.scissorTest = true;
            renderer.setRenderTarget(rt);
            renderer.render(scene, cam);
          }
          scene.remove(wood, leaf);
          wood.dispose(); leaf.dispose();
        }
        rt.scissorTest = false;
        rt.viewport.set(0, 0, W, H);
      }
      for (const m of [leafA, leafN, woodA, woodN]) m.dispose();
    }
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.autoClear = prevAuto;
  }

  _buildImpostorMeshes() {
    const quad = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
    for (const sp of this.species) {
      if (!sp || !sp.trees.length) continue;
      const n = sp.trees.length;
      const pos = new Float32Array(n * 4), dat = new Float32Array(n * 4), tone = new Float32Array(n * 3);
      sp.trees.forEach((t, i) => {
        pos.set([t.x, t.y, t.z, t.scale], i * 4);
        dat.set([t.col, t.tint, t.phase, 0], i * 4);
        tone.set(t.rgb, i * 3);
      });
      const geo = new THREE.InstancedBufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(quad, 3));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 4));
      geo.setAttribute('iData', new THREE.InstancedBufferAttribute(dat, 4));
      geo.setAttribute('iTone', new THREE.InstancedBufferAttribute(tone, 3));
      geo.instanceCount = n;
      const mat = makeMaterial({
        uniforms: {
          ...this.lod, uLodMode: { value: 1 }, uAtlas: { value: sp.imp.rtA.texture }, uAtlasN: { value: sp.imp.rtN.texture },
          uImp: { value: new THREE.Vector4(sp.imp.R, sp.imp.cy, ELEV, COLS) },
        },
        vertexShader: IMPOSTOR_VERT, fragmentShader: IMPOSTOR_FRAG,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.name = `tree:${sp.name}:far`;
      mesh.layers.enable(LAYER.REFLECT);
      mesh.renderOrder = 2;
      sp.impostor = mesh;
      this.group.add(mesh);
    }
  }

  /** Temporarily add every tree as a mid-detail shadow caster (for the static shadow bake). */
  prepareShadowBake() {
    const temp = [];
    for (const sp of this.species) {
      if (!sp) continue;
      const mat = this._mkLeaf(sp.sp, sp.tex, 2, { DEPTH_ONLY: 1 });
      mat.colorWrite = false;
      for (let v = 0; v < VARIANTS; v++) {
        const idx = [];
        for (let i = 0; i < this.count; i++) if (this.info[i * 6 + 4] === sp.si && this.info[i * 6 + 5] === v) idx.push(i);
        if (!idx.length) continue;
        const im = new THREE.InstancedMesh(sp.models[v].lod1, mat, idx.length);
        idx.forEach((ti, k) => im.instanceMatrix.array.set(this.matrices.subarray(ti * 16, ti * 16 + 16), k * 16));
        im.frustumCulled = false;
        im.layers.set(LAYER.STATIC_CASTER);
        this.group.add(im);
        temp.push(im);
      }
      temp.push({ dispose: () => mat.dispose(), isMat: true });
    }
    return () => {
      for (const t of temp) {
        if (!t.isMat) this.group.remove(t);
        t.dispose();
      }
    };
  }

  update(camera) {
    const cp = camera.position;
    this.lod.uLodCam.value.copy(cp);
    const R = this.lod.uLodRange.value;
    const near = R.x, nearF = R.y, mid = R.z;
    this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._m, camera.coordinateSystem, camera.reversedDepth);
    const shadowR = 62; // trees this close may cast shadows into view even when off-screen
    for (const sp of this.species) if (sp) for (const v of sp.variants) { v.list0.length = 0; v.list1.length = 0; }
    const c0x = Math.floor((cp.x - mid) / CELL), c1x = Math.floor((cp.x + mid) / CELL);
    const c0z = Math.floor((cp.z - mid) / CELL), c1z = Math.floor((cp.z + mid) / CELL);
    const info = this.info, sph = this._sphere;
    let nNear = 0, nMid = 0;
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const list = this.grid.get(`${cx},${cz}`);
      if (!list) continue;
      for (let k = 0; k < list.length; k++) {
        const i = list[k], o = i * 6;
        const dx = info[o] - cp.x, dz = info[o + 2] - cp.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > mid * mid) continue;
        const d = Math.sqrt(d2);
        if (d > shadowR) {
          const r = info[o + 3];
          sph.center.set(info[o], info[o + 1] + r * 0.8, info[o + 2]); sph.radius = r * 1.25;
          if (!this._frustum.intersectsSphere(sph)) continue;
        }
        const v = this.species[info[o + 4]].variants[info[o + 5]];
        if (d < near) { v.list0.push(i); nNear++; }
        if (d > near - nearF) { v.list1.push(i); nMid++; }
      }
    }
    this.stats.near = nNear; this.stats.mid = nMid;
    for (const sp of this.species) {
      if (!sp) continue;
      for (const v of sp.variants) {
        this._fill(v.wood0, v.list0);
        this._fill(v.leaf0, v.list0);
        this._fill(v.lod1, v.list1);
      }
    }
  }

  _fill(slot, list) {
    const n = Math.min(list.length, slot.cap);
    let sum = n;
    for (let k = 0; k < n; k++) sum = (sum * 31 + list[k]) | 0;
    const mesh = slot.mesh;
    mesh.count = n;
    if (sum === slot.sum) return; // same trees as last frame: nothing to upload
    slot.sum = sum;
    const M = mesh.instanceMatrix.array, C = mesh.instanceColor.array;
    const src = this.matrices, col = this.colors;
    for (let k = 0; k < n; k++) {
      const i = list[k];
      M.set(src.subarray(i * 16, i * 16 + 16), k * 16);
      C[k * 3] = col[i * 3]; C[k * 3 + 1] = col[i * 3 + 1]; C[k * 3 + 2] = col[i * 3 + 2];
    }
    mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, n * 16); mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, n * 3); mesh.instanceColor.needsUpdate = true;
  }

  /** Trunk positions for collisions: [x, z, radius] of every tree in the playable area. */
  colliders() {
    const out = [];
    for (let i = 0; i < this.count; i++) {
      const sp = this.species[this.info[i * 6 + 4]];
      if (!sp) continue;
      const scale = this.data.trees[i * 6 + 2];
      // a shrub is an obstacle as a whole; a tree only by its trunk
      out.push([this.info[i * 6], this.info[i * 6 + 2], sp.sp.shrub ? sp.sp.shrub * scale : sp.sp.trunk.radius * scale * 1.15 + 0.1]);
    }
    return out;
  }
}
