// Dev tool: renders the screenshots of the README into docs/ (1280×720 JPEG, from 1600×900 renders).
// usage: node tools/docs.mjs [name ...]        without names: every view (slow in software rendering)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs');
fs.mkdirSync(OUT, { recursive: true });

// name: [x, y, z, heading°, pitch°] (free camera), or a function run in the page that returns such a pose
const VIEWS = {
  valley: [178, 56, -44, 102, -10.5],
  mill: [-75, 34, -20, 112, -17],
  garden: [-123, 20, -8, 22, -18],
  courtyard: [-100, 17.5, 10, 70, -30],
  pond: [-112, 14.5, 26, 150, -18],
  waterfall: [-262, 14.2, 124.5, 84, 13],
  pier: [-6, 7.5, 3, 264, 6],
  beach: [30, 6, 30, 290, -10],
  seafront: [40, 9, 9, 84, -2],
  // the swans, wherever they are swimming
  swans: () => {
    const B = window.__mmf.world.birds, i = B.birds.findIndex((b) => b.species === 'swan'), m = B.mesh.instanceMatrix.array;
    const x = m[i * 16 + 12], y = m[i * 16 + 13], z = m[i * 16 + 14], a = (200 * Math.PI) / 180;
    return [x + Math.sin(a) * 5, y + 1.5, z + Math.cos(a) * 5, 200, -13];
  },
  // the old tree, from the edge of its clearing
  oldtree: () => {
    const d = window.__mmf.world.data;
    return [-62, d.heightAt(-62, 132) + 2.2, 132, 97, 14];
  },
};

const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const todo = names.length ? names : Object.keys(VIEWS);
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5188, strictPort: false, host: '127.0.0.1' } });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/?q=ultra&shot=1`);
await page.waitForFunction(() => window.__mmf && (window.__mmf.ready || window.__mmf.error), null, { timeout: 300000 });
const frames = (n) => page.evaluate((n) => { const app = window.__mmf; const target = app.frames + n; return new Promise((res) => { const tick = () => (app.frames >= target ? res() : requestAnimationFrame(tick)); tick(); }); }, n);
for (const name of todo) {
  const view = VIEWS[name];
  if (!view) { console.log(`unknown view: ${name}`); continue; }
  const pose = typeof view === 'function' ? await page.evaluate(view) : view;
  await page.evaluate((c) => window.__mmf.setCam(...c), pose);
  await frames(8);
  const png = await page.screenshot();
  await sharp(png).resize(1280, 720).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(OUT, `${name}.jpg`));
  console.log(`docs/${name}.jpg`);
}
await browser.close();
await server.close();
