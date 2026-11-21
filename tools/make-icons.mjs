// Dev tool: renders the bitmap icons of the site from public/favicon.svg (for the browsers and the phones
// that do not take an SVG icon). usage: node tools/make-icons.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const svg = path.join(PUBLIC, 'favicon.svg');
for (const [name, size, pad] of [['favicon-32.png', 32, 0], ['icon-192.png', 192, 0], ['apple-touch-icon.png', 180, 14]]) {
  // (the phone icon sits on a plain night-blue square: phones round its corners themselves)
  const inner = size - pad * 2;
  const art = await sharp(svg, { density: Math.ceil((72 * inner) / 64) * 2 }).resize(inner, inner).png().toBuffer();
  const img = pad ? sharp({ create: { width: size, height: size, channels: 4, background: '#1b1340' } }).composite([{ input: art, left: pad, top: pad }]) : sharp(art);
  await img.png({ compressionLevel: 9 }).toFile(path.join(PUBLIC, name));
  console.log(name);
}
