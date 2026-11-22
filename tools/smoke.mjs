// Dev tool: drives the real application in headless Chromium (welcome screen, walking, free camera,
// touch layout) and saves screenshots in tools/preview/smoke/. Fails when the page reports an error.
// usage: node tools/smoke.mjs [--q=low] [--mobile] [--steps=12]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools/preview/smoke');
fs.mkdirSync(OUT, { recursive: true });
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const mobile = !!opt.mobile;
const steps = +(opt.steps || 12);
const tag = mobile ? 'mobile' : 'desktop';

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5198, strictPort: false, host: '127.0.0.1' } });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const context = await browser.newContext(mobile
  ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36' }
  : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await context.addInitScript(() => { try { for (const k of ['mmf.run', 'mmf.follow']) if (localStorage.getItem(k) === null) localStorage.setItem(k, '0'); } catch { /* no storage */ } }); // (the tests walk with Shift to run, and turn the camera themselves)
const page = await context.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const frames = (n) => page.evaluate((n) => { const app = window.__mmf; const target = app.frames + n; return new Promise((res) => { const tick = () => (app.frames >= target ? res() : requestAnimationFrame(tick)); tick(); }); }, n);
const shot = (name) => page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) });
const where = () => page.evaluate(() => { const a = window.__mmf, p = a.player.pos; return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), anim: a.player.anim, calls: a.engine.perf.calls, tris: a.engine.perf.triangles, tier: a.engine.tierId, phone: a.engine.tier.phone }; });

let failed = false;
try {
  await page.goto(`http://127.0.0.1:${port}/${opt.q === 'auto' ? '' : `?q=${opt.q || 'low'}`}`);
  await page.waitForSelector('.card.ready', { timeout: 240000 });
  await frames(3);
  await shot('1-welcome');
  await page.fill('#mmf-name', 'Testeur');
  await page.click('.swatches button:nth-child(3)');
  await page.click('.go');
  await frames(steps * 2);
  await shot('2-start');
  const a = await where();
  if (mobile) {
    // drag the virtual stick upwards
    const box = await page.locator('.stick-zone').boundingBox();
    const sx = box.x + 90, sy = box.y + box.height - 90;
    const cdp = await context.newCDPSession(page);
    const touchEvent = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await touchEvent('touchStart', sx, sy);
    await touchEvent('touchMove', sx, sy - 60);
    await frames(steps);
    await shot('3-walk');
    await touchEvent('touchEnd', sx, sy - 60);
  } else {
    await page.keyboard.down('KeyW');
    await frames(steps);
    await shot('3-walk');
    await page.keyboard.up('KeyW');
  }
  const b = await where();
  const moved = Math.hypot(b.x - a.x, b.z - a.z);
  console.log(`start ${JSON.stringify(a)}`);
  console.log(`after walking ${JSON.stringify(b)} (moved ${moved.toFixed(2)} m)`);
  if (moved < 0.5) { failed = true; console.log('FAIL: the character did not move'); }
  await page.click('[data-act="camera"]');
  await frames(3);
  await shot('4-free');
  await page.click('[data-act="settings"]');
  await frames(3);
  await shot('5-settings');
  await page.click('[data-act="settings"]');
  await page.click('[data-act="camera"]');
  await frames(4);
  await shot('6-back');
  // the minimap opens the large map; a click closes it
  await page.click('.minimap');
  await frames(3);
  await shot('7-map');
  const open = await page.evaluate(() => document.querySelector('.bigmap').classList.contains('on'));
  await page.click('.bigmap');
  await frames(2);
  const closed = await page.evaluate(() => !document.querySelector('.bigmap').classList.contains('on'));
  console.log(`large map: opened ${open}, closed ${closed}`);
  if (!open || !closed) { failed = true; console.log('FAIL: the large map did not open and close'); }
} catch (err) {
  failed = true;
  console.log('FAIL:', err.message);
  await shot('error').catch(() => {});
}
const appError = await page.evaluate(() => window.__mmf?.error).catch(() => null);
if (appError) { failed = true; console.log('APP ERROR:', appError); }
if (logs.length) { console.log([...new Set(logs)].slice(0, 20).join('\n')); failed = true; }
await browser.close();
await server.close();
console.log(failed ? 'smoke test FAILED' : 'smoke test passed');
process.exit(failed ? 1 : 0);
