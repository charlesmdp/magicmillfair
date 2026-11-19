// Asset loading helpers (textures, texture arrays) with simple progress tracking.
import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL;
export const assetUrl = (p) => `${BASE}assets/${p}`;

const loader = new THREE.TextureLoader();
let pending = 0, finished = 0;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn(finished, pending));
export function onAssetProgress(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function track(promise) {
  pending++; notify();
  return promise.finally(() => { finished++; notify(); });
}

let maxAniso = 4;
export function setMaxAnisotropy(v) { maxAniso = v; }

/** Load a 2D texture. srgb: colour data; repeat: tiling. */
export function loadTexture(path, { srgb = false, repeat = true, mip = true, aniso = true, flipY = false } = {}) {
  return track(new Promise((resolve, reject) => {
    loader.load(assetUrl(path), (t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
      t.generateMipmaps = mip;
      t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      t.anisotropy = aniso ? maxAniso : 1;
      t.flipY = flipY;
      resolve(t);
    }, undefined, () => reject(new Error(`Texture introuvable : ${path}`)));
  }));
}

async function loadBitmap(path) {
  const res = await fetch(assetUrl(path));
  if (!res.ok) throw new Error(`Image introuvable : ${path}`);
  return createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
}

/**
 * Build the two terrain texture arrays from per-layer images:
 *   albedo array: rgb colour (sRGB) + height in alpha
 *   normal array: tangent normal xy
 */
export async function loadLayerArrays(dir, names, size) {
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const n = names.length;
  const albedo = new Uint8Array(size * size * 4 * n);
  const normal = new Uint8Array(size * size * 2 * n);
  await Promise.all(names.map((name, layer) => track((async () => {
    const [c, nm] = await Promise.all([loadBitmap(`${dir}/${name}_c.webp`), loadBitmap(`${dir}/${name}_n.webp`)]);
    // canvas readbacks are serialised by the single 2D context
    ctx.drawImage(c, 0, 0, size, size);
    const cd = ctx.getImageData(0, 0, size, size).data;
    ctx.drawImage(nm, 0, 0, size, size);
    const nd = ctx.getImageData(0, 0, size, size).data;
    const ao = layer * size * size * 4, no = layer * size * size * 2;
    for (let i = 0, p = 0; i < size * size; i++, p += 4) {
      albedo[ao + p] = cd[p]; albedo[ao + p + 1] = cd[p + 1]; albedo[ao + p + 2] = cd[p + 2]; albedo[ao + p + 3] = nd[p + 2];
      normal[no + i * 2] = nd[p]; normal[no + i * 2 + 1] = nd[p + 1];
    }
    c.close?.(); nm.close?.();
  })())));
  const make = (data, format, srgb) => {
    const t = new THREE.DataArrayTexture(data, size, size, n);
    t.format = format;
    t.type = THREE.UnsignedByteType;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = maxAniso;
    t.needsUpdate = true;
    return t;
  };
  return { albedo: make(albedo, THREE.RGBAFormat, true), normal: make(normal, THREE.RGFormat, false) };
}

export async function loadJSON(path) {
  const res = await track(fetch(assetUrl(path)));
  if (!res.ok) throw new Error(`Fichier introuvable : ${path}`);
  return res.json();
}
