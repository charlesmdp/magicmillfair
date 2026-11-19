// Dev helper: contact sheet of images. usage: node tools/contact.mjs out.png cols cell file1 file2 ...
import sharp from 'sharp';
const [out, cols, cell, ...files] = process.argv.slice(2);
const C = +cols, S = +cell;
const rows = Math.ceil(files.length / C);
const comps = await Promise.all(files.map(async (f, i) => ({ input: await sharp(f).resize(S, S, { fit: 'fill' }).removeAlpha().png().toBuffer(), left: (i % C) * S, top: Math.floor(i / C) * S })));
await sharp({ create: { width: C * S, height: rows * S, channels: 3, background: '#202020' } }).composite(comps).png().toFile(out);
console.log(out);
