// Loads the baked world maps and exposes them both to the GPU (textures)
// and to the CPU (height / water / surface queries for gameplay and scattering).
import * as THREE from 'three';
import { G } from '../render/globals.js';

const BASE = `${import.meta.env.BASE_URL}assets/world/`;

async function loadPixels(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Impossible de charger ${url}`);
  const blob = await res.blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const w = bmp.width, h = bmp.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  bmp.close?.();
  return { data, w, h };
}

function dataTexture(data, w, h, { mip = false, filter = THREE.LinearFilter, wrap = THREE.ClampToEdgeWrapping, format = THREE.RGBAFormat, srgb = false } = {}) {
  const t = new THREE.DataTexture(data, w, h, format, THREE.UnsignedByteType);
  t.magFilter = filter;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : filter;
  t.generateMipmaps = mip;
  t.wrapS = t.wrapT = wrap;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

export class WorldData {
  async load(onProgress = () => {}) {
    const names = ['height', 'water', 'normal', 'splat0', 'splat1', 'splat2', 'tint', 'backdrop'];
    let done = 0;
    const tick = () => onProgress(++done / (names.length + 2));
    const [meta, treesBuf, ...imgs] = await Promise.all([
      fetch(`${BASE}world.json`).then((r) => r.json()).then((v) => (tick(), v)),
      fetch(`${BASE}trees.bin`).then((r) => r.arrayBuffer()).then((v) => (tick(), v)),
      ...names.map((n) => loadPixels(`${BASE}${n}.png`).then((v) => (tick(), v))),
    ]);
    const [height, water, normal, splat0, splat1, splat2, tint, backdrop] = imgs;
    this.meta = meta;
    const N = (this.size = meta.size);
    this.half = N / 2;
    const [hMin, hMax] = meta.heightRange;
    this.hMin = hMin;
    this.hRange = hMax - hMin;
    const n2 = N * N;

    // --- CPU fields
    const H = (this.height = new Float32Array(n2));
    const Wt = (this.water = new Float32Array(n2));
    const hw = new Uint8Array(n2 * 4); // RG terrain, BA water
    const nrm = new Uint8Array(n2 * 4); // normal xz, canopy shade, AO
    const sa = new Uint8Array(n2 * 4), sb = new Uint8Array(n2 * 4);
    const aux = new Uint8Array(n2 * 4); // grass height, shore distance, -, -
    const k = this.hRange / 65535;
    for (let i = 0, p = 0; i < n2; i++, p += 4) {
      const hv = height.data[p] * 256 + height.data[p + 1];
      const wv = water.data[p] * 256 + water.data[p + 1];
      H[i] = hv * k + hMin;
      Wt[i] = wv === 0 ? -1000 : wv * k + hMin;
      hw[p] = height.data[p]; hw[p + 1] = height.data[p + 1]; hw[p + 2] = water.data[p]; hw[p + 3] = water.data[p + 1];
      nrm[p] = normal.data[p]; nrm[p + 1] = normal.data[p + 1]; nrm[p + 2] = normal.data[p + 2]; nrm[p + 3] = height.data[p + 2];
      sa[p] = splat0.data[p]; sa[p + 1] = splat0.data[p + 1]; sa[p + 2] = splat0.data[p + 2]; sa[p + 3] = splat1.data[p];
      sb[p] = splat1.data[p + 1]; sb[p + 1] = splat1.data[p + 2]; sb[p + 2] = splat2.data[p]; sb[p + 3] = splat2.data[p + 1];
      aux[p] = splat2.data[p + 2]; aux[p + 1] = water.data[p + 2]; aux[p + 2] = 0; aux[p + 3] = 255;
    }
    this.splatA = sa; // lawn, meadow, forest, dirt
    this.splatB = sb; // rock, sand, gravel, soil
    this.aux = aux;
    this.normalData = nrm;
    this.tintData = tint;

    // --- GPU textures
    this.heightTex = dataTexture(hw, N, N, { mip: true }); // mips drive the terrain LOD morphing
    this.normalTex = dataTexture(nrm, N, N, { mip: true });
    this.splatATex = dataTexture(sa, N, N, { mip: true });
    this.splatBTex = dataTexture(sb, N, N, { mip: true });
    this.auxTex = dataTexture(aux, N, N, { mip: true });
    this.tintTex = dataTexture(new Uint8Array(tint.data.buffer.slice(0)), tint.w, tint.h, { mip: true });
    G.uHeightTex.value = this.heightTex;
    G.uNormalTex.value = this.normalTex;
    G.uWorldMap.value.set(1 / N, N / 2, hMin, this.hRange);

    // --- backdrop relief
    const bn = meta.backdrop.n;
    this.backdrop = { n: bn, step: meta.backdrop.step, half: meta.backdrop.half, height: new Float32Array(bn * bn), cover: new Float32Array(bn * bn) };
    for (let i = 0, p = 0; i < bn * bn; i++, p += 4) {
      this.backdrop.height[i] = (backdrop.data[p] * 256 + backdrop.data[p + 1]) * k + hMin;
      this.backdrop.cover[i] = backdrop.data[p + 2] / 255;
    }

    // --- trees: x, z, scale, rot, species, y(backdrop only)
    this.trees = new Float32Array(treesBuf);
    return this;
  }

  /** Terrain height (bilinear). Outside the playable square falls back to the backdrop relief. */
  heightAt(x, z) {
    const N = this.size;
    const u = x + this.half - 0.5, v = z + this.half - 0.5;
    if (u < 0 || v < 0 || u > N - 1 || v > N - 1) return this.backdropHeightAt(x, z);
    const x0 = u | 0, z0 = v | 0;
    const x1 = x0 + 1 < N ? x0 + 1 : x0, z1 = z0 + 1 < N ? z0 + 1 : z0;
    const fx = u - x0, fz = v - z0;
    const H = this.height;
    const a = H[z0 * N + x0], b = H[z0 * N + x1], c = H[z1 * N + x0], d = H[z1 * N + x1];
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
  }

  backdropHeightAt(x, z) {
    const b = this.backdrop;
    let u = (x + b.half) / b.step, v = (z + b.half) / b.step;
    u = Math.min(Math.max(u, 0), b.n - 1.001); v = Math.min(Math.max(v, 0), b.n - 1.001);
    const x0 = u | 0, z0 = v | 0, fx = u - x0, fz = v - z0;
    const H = b.height, n = b.n;
    const a = H[z0 * n + x0], bb = H[z0 * n + x0 + 1], c = H[(z0 + 1) * n + x0], d = H[(z0 + 1) * n + x0 + 1];
    return (a + (bb - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
  }

  index(x, z) {
    const N = this.size;
    let i = Math.floor(x + this.half), j = Math.floor(z + this.half);
    i = i < 0 ? 0 : i >= N ? N - 1 : i;
    j = j < 0 ? 0 : j >= N ? N - 1 : j;
    return j * N + i;
  }

  /** Water surface height at this spot, or -1000 when there is no water body nearby. */
  waterAt(x, z) {
    if (Math.abs(x) > this.half || Math.abs(z) > this.half) return x > 300 ? 0 : -1000;
    return this.water[this.index(x, z)];
  }

  /** Water depth (>0 when submerged). */
  depthAt(x, z) {
    const w = this.waterAt(x, z);
    return w < -500 ? -1 : w - this.heightAt(x, z);
  }

  normalAt(x, z, out) {
    const p = this.index(x, z) * 4;
    const nx = this.normalData[p] / 127.5 - 1, nz = this.normalData[p + 1] / 127.5 - 1;
    const ny = Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
    return out.set(nx, ny, nz);
  }

  /** Layer weights 0..1: lawn, meadow, forest, dirt, rock, sand, gravel, soil */
  surfaceAt(x, z, out) {
    const p = this.index(x, z) * 4;
    const a = this.splatA, b = this.splatB;
    out[0] = a[p] / 255; out[1] = a[p + 1] / 255; out[2] = a[p + 2] / 255; out[3] = a[p + 3] / 255;
    out[4] = b[p] / 255; out[5] = b[p + 1] / 255; out[6] = b[p + 2] / 255; out[7] = b[p + 3] / 255;
    return out;
  }

  grassAt(x, z) { return this.aux[this.index(x, z) * 4] / 255; }
  canopyShadeAt(x, z) { return this.normalData[this.index(x, z) * 4 + 2] / 255; }
  inside(x, z, margin = 0) { return Math.abs(x) < this.half - margin && Math.abs(z) < this.half - margin; }
}
