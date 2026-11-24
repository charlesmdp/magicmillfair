// What the checks of the games of this folder share: a line for each check, the count at the end, and the ground
// of the world as the game reads it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const results = [];
/** One check: a line PASS or FAIL, with what was measured. */
export const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
/** The end of the checks: the count, and the process ends with it. */
export const done = () => { const failed = results.filter((r) => !r).length; console.log(`\n${results.length - failed}/${results.length} checks passed`); process.exit(failed ? 1 : 0); };

/** The ground of the world: (x, z) → metres above the sea (negative: the bed of the sea, of a pond). */
export async function ground() {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/world/world.json'), 'utf8'));
  const { data, info } = await sharp(path.join(ROOT, 'public/assets/world/height.png')).raw().toBuffer({ resolveWithObject: true });
  const [lo, hi] = meta.heightRange, N = info.width, half = N / 2;
  return (x, z) => { const i = (Math.floor(Math.min(half - 1, Math.max(-half, z)) + half) * N + Math.floor(Math.min(half - 1, Math.max(-half, x)) + half)) * info.channels; return ((data[i] * 256 + data[i + 1]) / 65535) * (hi - lo) + lo; };
}
