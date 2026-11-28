// Every extra at once (src/extras): the owner may throw all the switches of /admin on together, and each extra was
// checked alone. Here, in the running game (a headless browser), all of them are loaded the way the game loads them,
// in one go; each is built; what two of them cut into the same ground is all there (the mouth of the hidden bar
// and the court of The Sanctuary, both holes in the one terrain); the player is carried to the places where the
// extras crowd (the court, the bar's mouth, the deep water of the dive, the mill where Barnaby and the plane are)
// and the game runs there; nothing complains.
// usage: node tools/all-extras-test.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stubOutside } from './lib/outside.mjs';
import { EXTRAS } from '../src/extras/index.js';
import { BAR } from '../src/world/zones/places/bar/plan.js';
import { DOOR } from '../src/world/zones/places/sanctuary/plan.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };

const { chromium } = createRequire(import.meta.url)('playwright');
const { createServer } = await import('vite');
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5248, strictPort: false, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
await stubOutside(context);
const page = await context.newPage(), errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/api\/|404|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?q=low`);
  await page.waitForSelector('.card.ready', { timeout: 240000 });
  await page.mouse.click(5, 5); // (the story told as the page opens is cut short: a click reveals the gate)
  await page.fill('#mmf-name', 'Player', { timeout: 180000 });
  await page.click('.go', { timeout: 180000 });
  await page.waitForFunction(() => window.__mmf && window.__mmf.input.enabled, null, { timeout: 60000 });
  const frames = (n) => page.evaluate((n) => new Promise((res) => { const app = window.__mmf, t = app.frames + n; const tick = () => (app.frames >= t ? res() : requestAnimationFrame(tick)); tick(); }), n);

  // ---- every switch on, as the game does it when the server says so
  const ids = Object.keys(EXTRAS);
  const t0 = Date.now();
  await page.evaluate((ids) => import('/src/extras/index.js').then(({ loadExtras }) => loadExtras(window.__mmf, Object.fromEntries(ids.map((k) => [k, true])))).then(() => window.__mmf.extrasBuilt()), ids);
  const took = Math.round((Date.now() - t0) / 1000);
  await frames(10);
  const built = await page.evaluate((ids) => ids.filter((k) => !window.__mmf.extras?.[k]), ids);
  check(`all ${ids.length} extras at once: each is built`, built.length === 0, { missing: built, seconds: took });

  // ---- what two extras cut into the one terrain is all there
  const holes = () => page.evaluate(() => (window.__mmf.world.terrain.uniforms.uHoleA?.value || []).map((a) => [+a.x.toFixed(2), +a.y.toFixed(2)]));
  const near = (list, x, z, r) => list.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < r);
  let list = await holes();
  check('the terrain has the hole of the bar\'s mouth and the holes of the court of The Sanctuary, together', near(list, BAR.mouth.x, BAR.mouth.z, 30) && near(list, DOOR.x, DOOR.z, 30), { holes: list.length });

  // ---- the places where the extras crowd: the game runs there
  const visit = async (name, x, z, yaw = 0) => {
    const before = errors.length;
    await page.evaluate(([x, z, yaw]) => { const a = window.__mmf; a.player.teleport(x, z, yaw); a.rig.snap(a.player.pos, yaw + Math.PI); }, [x, z, yaw]);
    await frames(30);
    const p = await page.evaluate(() => { const q = window.__mmf.player.pos; return [q.x, q.y, q.z].map((v) => +v.toFixed(1)); });
    check(`carried to ${name}: the game runs there, nothing complains`, errors.length === before && p.every(Number.isFinite), { at: p, errors: errors.slice(before, before + 2) });
  };
  await visit('the doors of The Sanctuary', DOOR.x, DOOR.z, DOOR.yaw);
  await visit('the mouth of the hidden bar', BAR.mouth.x, BAR.mouth.z + 3);
  await visit('the mill, by Barnaby', -110, -28);
  await visit('the bay, over the Diver\'s Rest', 196, 64);
  list = await holes();
  check('after all that, the two still share the ground', near(list, BAR.mouth.x, BAR.mouth.z, 30) && near(list, DOOR.x, DOOR.z, 30), { holes: list.length });
  await frames(4);
  check('nothing complained', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  await server.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
