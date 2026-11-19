// Procedural texture baker. usage: node tools/bake-textures.mjs [group ...]
// Groups: common terrain building foliage (all when omitted).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/assets/textures');
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const groups = process.argv.slice(2);
const want = (g) => groups.length === 0 || groups.includes(g);
const infoFile = path.join(OUT, 'textures.json');
const info = fs.existsSync(infoFile) ? JSON.parse(fs.readFileSync(infoFile, 'utf8')) : {};

if (want('common')) await (await import('./textures/common.mjs')).bakeCommon(OUT, log);
if (want('terrain')) info.terrain = await (await import('./textures/terrain.mjs')).bakeTerrain(path.join(OUT, 'terrain'), log);
if (want('building') && fs.existsSync(path.join(ROOT, 'tools/textures/building.mjs'))) info.building = await (await import('./textures/building.mjs')).bakeBuilding(path.join(OUT, 'building'), log);
if (want('foliage') && fs.existsSync(path.join(ROOT, 'tools/textures/foliage.mjs'))) info.foliage = await (await import('./textures/foliage.mjs')).bakeFoliage(path.join(OUT, 'foliage'), log);

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(infoFile, JSON.stringify(info, null, 1));
log('done');
