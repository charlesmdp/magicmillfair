// Dev tool: render screenshots of the world in headless Chromium.
// usage: node tools/shots.mjs [--q=high] [--size=1280x720] [--frames=6] [--query=a=b&c=d] name=x,y,z,yaw,pitch ...
// Output: tools/preview/shots/<name>.png
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools/preview/shots');
fs.mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split(/=(.*)/s).slice(0, 2)));
const shots = args.filter((a) => !a.startsWith('--')).map((a) => { const [name, v] = a.split('='); return { name, cam: v.split(',').map(Number) }; });
const [W, H] = (opt.size || '1280x720').split('x').map(Number);
const frames = +(opt.frames || 5);
const dpr = +(opt.dpr || 1);

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5199, strictPort: false, host: '127.0.0.1' } });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-vsync'],
});
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, ...(opt.mobile ? { isMobile: true, hasTouch: true } : {}) });
const page = await context.newPage();
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const first = shots[0]?.cam || [-60, 36, -52, 215, -18];
const url = `http://127.0.0.1:${port}/?q=${opt.q || 'high'}&shot=1&cam=${first.join(',')}${opt.query ? '&' + opt.query : ''}`;
const t0 = Date.now();
await page.goto(url);
try {
  await page.waitForFunction(() => window.__mmf && (window.__mmf.ready || window.__mmf.error), null, { timeout: 240000 });
} catch (e) {
  console.log('timeout waiting for the app');
}
const err = await page.evaluate(() => window.__mmf?.error);
if (err) console.log('APP ERROR:', err);
console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (const s of shots) {
  const t1 = Date.now();
  await page.evaluate(([c, n]) => {
    const app = window.__mmf;
    app.setCam(...c);
    const target = app.frames + n;
    return new Promise((res) => { const tick = () => (app.frames >= target ? res() : requestAnimationFrame(tick)); tick(); });
  }, [s.cam, frames]);
  await page.screenshot({ path: path.join(OUT, `${s.name}.png`) });
  const stats = await page.evaluate(() => { const p = window.__mmf.engine.perf; return { calls: p.calls, tris: p.triangles, ms: Math.round(p.ms) }; });
  console.log(`${s.name}: ${JSON.stringify(stats)} (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
}
if (logs.length) console.log([...new Set(logs)].slice(0, 30).join('\n'));
await browser.close();
await server.close();
