// The height of the ground, read from the world's raster (public/assets/world/height.png). From another tool:
//   import { height } from './heights.mjs'      height(x, z) → metres
// or, to print a grid of heights:
//   node lab/tools/heights.mjs grid <x0> <x1> <z0> <z1> <step>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), sharp = createRequire(import.meta.url)('sharp');
const meta = JSON.parse(fs.readFileSync(ROOT + '/public/assets/world/world.json', 'utf8'));
const { data, info } = await sharp(ROOT + '/public/assets/world/height.png').raw().toBuffer({ resolveWithObject: true });
const [lo, hi] = meta.heightRange, N = info.width, half = N / 2;
export const height = (x, z) => { const i = (Math.floor(Math.min(half - 1, Math.max(-half, z)) + half) * N + Math.floor(Math.min(half - 1, Math.max(-half, x)) + half)) * info.channels; return ((data[i] * 256 + data[i + 1]) / 65535) * (hi - lo) + lo; };
if (process.argv[2] === 'grid') {
  const [x0, x1, z0, z1, st] = process.argv.slice(3).map(Number);
  let head = '  z\\x'; for (let x = x0; x <= x1; x += st) head += String(x).padStart(4); console.log(head);
  for (let z = z0; z <= z1; z += st) { let l = String(z).padStart(5) + ' '; for (let x = x0; x <= x1; x += st) l += String(Math.round(height(x, z))).padStart(4); console.log(l); }
}
