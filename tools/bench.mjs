// Dev tool: runs the built-in benchmark tour (?bench) for each quality tier in headless Chromium and prints
// a table. Headless Chromium renders in software here, so frame times only compare tiers with each other;
// draw calls, triangle counts and script time are the meaningful numbers. For real frame rates, open
// the site with ?bench=1 on the target device.
// usage: node tools/bench.mjs [--tiers=low,medium,high] [--frames=24] [--size=1280x720] [--mobile]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const tiers = String(opt.tiers || 'low,medium,high').split(',');
const frames = +(opt.frames || 24);
const [W, H] = String(opt.size || (opt.mobile ? '844x390' : '1280x720')).split('x').map(Number);

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5197, strictPort: false, host: '127.0.0.1' } });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const rows = [];
for (const tier of tiers) {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, ...(opt.mobile ? { isMobile: true, hasTouch: true } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/?q=${tier}&bench=${frames}`);
  try {
    await page.waitForFunction(() => window.__mmf && (window.__mmf.bench || window.__mmf.error), null, { timeout: 900000 });
  } catch { errors.push('timeout'); }
  const r = await page.evaluate(() => window.__mmf.bench || { error: window.__mmf.error });
  if (r && !r.error) rows.push({ tier, 'script ms': r.cpuAvg, 'script max': r.cpuMax, calls: r.callsAvg, 'calls max': r.callsMax, 'tris (k)': Math.round(r.trisAvg / 1000), 'tris max (k)': Math.round(r.trisMax / 1000), 'frame ms (software)': Math.round(r.msAvg), pixels: `${r.width}x${r.height}`, 'run s': Math.round((Date.now() - t0) / 1000) });
  else console.log(`${tier}: failed`, r?.error || errors.join(' | '));
  if (errors.length) console.log(`${tier}: ${errors.join(' | ')}`);
  await context.close();
}
console.table(rows);
await browser.close();
await server.close();
