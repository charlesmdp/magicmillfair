import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

/** Save raw interleaved 8-bit pixels. channels: 1, 3 or 4. */
export async function savePng(file, data, w, h, channels, opts = {}) {
  ensureDir(file);
  await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width: w, height: h, channels } })
    .png({ compressionLevel: 9, adaptiveFiltering: true, ...opts })
    .toFile(file);
}

export async function saveWebp(file, data, w, h, channels, opts = {}) {
  ensureDir(file);
  await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width: w, height: h, channels } })
    .webp({ quality: 88, effort: 5, ...opts })
    .toFile(file);
}

export async function saveJpg(file, data, w, h, channels, opts = {}) {
  ensureDir(file);
  await sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width: w, height: h, channels } })
    .jpeg({ quality: 88, ...opts })
    .toFile(file);
}

/** Load an image as raw 8-bit pixels: { data, w, h, channels }. */
export async function loadImage(file, channels) {
  let img = sharp(file);
  if (channels === 1) img = img.greyscale();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), w: info.width, h: info.height, channels: info.channels };
}
