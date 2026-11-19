// Dev helper: print baked terrain / water heights at world positions. usage: node tools/probe.mjs x,z x,z ...
import sharp from 'sharp';
const load = async (f) => { const { data, info } = await sharp(f).raw().toBuffer({ resolveWithObject: true }); return { data, ch: info.channels, w: info.width }; };
const H = await load('public/assets/world/height.png'), W = await load('public/assets/world/water.png');
const dec = (img, i) => (img.data[i * img.ch] * 256 + img.data[i * img.ch + 1]) / 65535 * 128 - 32;
for (const a of process.argv.slice(2)) {
  const [x, z] = a.split(',').map(Number);
  const i = Math.floor(z + 512) * 1024 + Math.floor(x + 512);
  const wv = W.data[i * W.ch] * 256 + W.data[i * W.ch + 1];
  console.log(`(${x},${z}) terrain=${dec(H, i).toFixed(2)} water=${wv === 0 ? 'none' : dec(W, i).toFixed(2)} shore=${(W.data[i * W.ch + 2] / 255 * 16).toFixed(1)}`);
}
