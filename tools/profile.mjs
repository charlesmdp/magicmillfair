// Dev tool: where does a frame go? At a few viewpoints of the benchmark tour, measures the script time of
// each system and the draw calls / triangles each one contributes (by hiding it).
// usage: node tools/profile.mjs [--q=low] [--frames=6] [--size=1280x720] [--mobile]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const [W, H] = String(opt.size || (opt.mobile ? '844x390' : '1280x720')).split('x').map(Number);
const frames = +(opt.frames || 6);
const VIEWS = { mill: 0.04, court: 0.1, pond: 0.27, valley: 0.5, promenade: 0.66, pier: 0.8, wheel: 0.93 };

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5196, strictPort: false, host: '127.0.0.1' } });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, ...(opt.mobile ? { isMobile: true, hasTouch: true } : {}) })).newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/?q=${opt.q || 'low'}&shot=1`);
await page.waitForFunction(() => window.__mmf && (window.__mmf.ready || window.__mmf.error), null, { timeout: 300000 });

const result = await page.evaluate(async ([views, frames]) => {
  const app = window.__mmf, { world, engine } = app;
  const { Benchmark } = await import('/src/app/Benchmark.js');
  const tour = new Benchmark(engine, world);
  const wait = (n) => { const target = app.frames + n; return new Promise((res) => { const tick = () => (app.frames >= target ? res() : requestAnimationFrame(tick)); tick(); }); };
  const groups = { terrain: [world.terrain.mesh], backdrop: [world.backdrop.mesh], water: [world.water.group], forest: [world.forest.group], grass: [world.grass.group], scatter: [world.scatter.group], mill: [world.mill.group], pier: [world.pier.group], rocks: [world.rocks.group], birds: [world.birds.mesh] };
  const out = {};
  app.setCam(0, 50, 0, 0, 0);
  for (const [name, u] of Object.entries(views)) {
    // the free camera would overwrite the pose: place it through the tour, then copy into the free camera
    tour.pose(u, engine.camera);
    app.free.syncFromCamera();
    await wait(frames);
    world.profile = {};
    await wait(frames);
    const prof = world.profile; world.profile = null;
    const n = prof.frames || 1;
    const row = { calls: engine.perf.calls, tris: engine.perf.triangles, script: {} };
    for (const [k, v] of Object.entries(prof)) if (k !== 'frames') row.script[k] = +(v / n).toFixed(2);
    row.by = {};
    for (const [g, list] of Object.entries(groups)) {
      for (const o of list) o.visible = false;
      await wait(2);
      row.by[g] = { calls: row.calls - engine.perf.calls, tris: row.tris - engine.perf.triangles };
      for (const o of list) o.visible = true;
    }
    await wait(1);
    out[name] = row;
  }
  return out;
}, [VIEWS, frames]);

for (const [name, r] of Object.entries(result)) {
  console.log(`\n== ${name}: ${r.calls} calls, ${Math.round(r.tris / 1000)}k triangles`);
  console.log('   script ms  ' + Object.entries(r.script).map(([k, v]) => `${k} ${v}`).join(' · '));
  console.log('   share      ' + Object.entries(r.by).map(([k, v]) => `${k} ${v.calls}c/${Math.round(v.tris / 1000)}k`).join(' · '));
}
await browser.close();
await server.close();
