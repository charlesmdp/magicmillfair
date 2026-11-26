// A sheet of pictures with a caption under each: node lab/tools/sheet.mjs out.png <columns> "file|caption" ...
import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('sharp');
const [out, cols, ...items] = process.argv.slice(2), C = Number(cols), W = 800, H = 500, BAR = 44, rows = Math.ceil(items.length / C);
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const tiles = await Promise.all(items.map(async (it) => { const [f, cap] = it.split('|'); const pic = await sharp(f).resize(W, H, { fit: 'cover' }).toBuffer(); const bar = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${BAR}"><rect width="100%" height="100%" fill="#16121f"/><text x="14" y="29" font-family="Georgia, serif" font-size="21" fill="#f6e7b8">${esc(cap || '')}</text></svg>`); return sharp({ create: { width: W, height: H + BAR, channels: 3, background: '#16121f' } }).composite([{ input: pic, left: 0, top: 0 }, { input: bar, left: 0, top: H }]).png().toBuffer(); }));
await sharp({ create: { width: W * C + 12 * (C + 1), height: (H + BAR) * rows + 12 * (rows + 1), channels: 3, background: '#0c0a12' } }).composite(tiles.map((input, i) => ({ input, left: 12 + (i % C) * (W + 12), top: 12 + Math.floor(i / C) * (H + BAR + 12) }))).png().toFile(out);
console.log('written', out);
