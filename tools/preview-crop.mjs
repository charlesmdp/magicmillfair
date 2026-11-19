// Dev helper: crop/zoom a region of a baked preview. usage: node tools/preview-crop.mjs world x0 z0 x1 z1 scale out
import sharp from 'sharp';
const [name, x0, z0, x1, z1, scale, out] = process.argv.slice(2);
const left = Math.round(+x0 + 512), top = Math.round(+z0 + 512);
const width = Math.round(+x1 - +x0), height = Math.round(+z1 - +z0);
await sharp(`tools/preview/${name}.png`).extract({ left, top, width, height }).resize(Math.round(width * +scale), Math.round(height * +scale), { kernel: 'nearest' }).toFile(out);
console.log(out);
