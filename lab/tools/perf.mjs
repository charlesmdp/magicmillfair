// What the games of the extras cost a browser: what is drawn (calls, triangles) from a few places with them off
// and on, what each takes to build, what they take every frame when nobody plays them.
//   node lab/tools/perf.mjs [low|balanced]      (low is far quicker without a graphics card; figures are means of 8 frames)
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { createServer } = await import(pathToFileURL(ROOT + '/node_modules/vite/dist/node/index.js').href);
const { chromium } = createRequire(ROOT + '/package.json')('playwright');
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5207, strictPort: false, host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 900, height: 600 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?q=${process.argv[2] || 'balanced'}`);
await page.waitForSelector('.card.ready', { timeout: 240000 });
await page.fill('#mmf-name', 'Meter');
await page.click('.go');
await page.waitForFunction(() => window.__mmf && window.__mmf.input.enabled, null, { timeout: 60000 });
const frames = (n) => page.evaluate((n) => new Promise((res) => { const app = window.__mmf, t = app.frames + n; const tick = () => (app.frames >= t ? res() : requestAnimationFrame(tick)); tick(); }), n);
await page.evaluate(() => { window.__mmf.engine.adaptive = false; });
const VIEWS = [
  ['on the beach, looking at the cliff (cleft, mine mouth)', [100, 6, 95], [112, 15, 115]],
  ['from the bay: the whole cliff and the hill behind', [115, 24, 66], [115, 20, 116]],
  ['on the plaza of the pier, looking inland', [60, 8, 20], [0, 8, 0]],
  ['by the great pond (pond, boats, slope)', [-150, 16, 30], [-125, 12, 85]],
  ['far away, looking away from all of it', [-200, 30, -150], [-260, 20, -260]],
  ['far away, looking towards the hill of the cave', [-100, 45, -100], [90, 30, 250]],
];
const look = async ([, from, to]) => {
  await page.evaluate(([[x, y, z], [tx, ty, tz]]) => { const a = window.__mmf, yaw = Math.atan2(tx - x, tz - z), pitch = Math.atan2(ty - y, Math.hypot(tx - x, tz - z)); a.player.teleport(tx, tz, 0); a.setCam(x, y, z, (yaw * 180) / Math.PI + 180, (pitch * 180) / Math.PI); }, [from, to]);
  await frames(12);
  return page.evaluate(() => { const p = window.__mmf.engine.perf; return { calls: p.calls, tris: p.triangles }; });
};
for (const v of VIEWS) await look(v); // (a first visit of each place: the world settles)
const zones0 = await page.evaluate(() => window.__mmf.world.zones.length);
const built = await page.evaluate(async () => {
  const a = window.__mmf, out = {}, bake = a.world.bakeShadows.bind(a.world);
  let baking = 0;
  a.world.bakeShadows = () => { const t = performance.now(); bake(); baking += performance.now() - t; };
  a.extras ||= {};
  for (const id of ['slide', 'pond', 'boats', 'hill', 'crack', 'hollow']) {
    const mod = await import(`/src/extras/${id}.js`);
    baking = 0;
    const t = performance.now(); a.extras[id] = mod.attach(a); const ms = performance.now() - t - baking, g = a.extras[id].group;
    let meshes = 0, tris = 0;
    g?.traverse((o) => { if (o.isMesh) { meshes++; const geo = o.geometry; tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3; } });
    out[id] = { ms: Math.round(ms), bake: Math.round(baking), meshes, tris: Math.round(tris) };
  }
  return out;
});
await frames(10);
const IDS = ['slide', 'pond', 'boats', 'hill', 'crack', 'hollow'];
const show = (ids) => page.evaluate(([ids, all]) => { const a = window.__mmf; for (const id of all) a.extras[id].group.visible = ids.includes(id); }, [ids, IDS]);
// (the engine draws its shadows and the mirror of the water one frame in two: what is drawn is the mean of eight frames)
const read = async () => { await frames(4); return page.evaluate(() => new Promise((res) => { const a = window.__mmf, p = a.engine.perf; let n = 0, calls = 0, tris = 0, last = a.frames; const tick = () => { if (a.frames !== last) { last = a.frames; calls += p.calls; tris += p.triangles; n++; } if (n >= 8) res({ calls: Math.round(calls / n), tris: Math.round(tris / n) }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); })); };
const NEW = ['pond', 'boats', 'hill', 'crack', 'hollow'];
const inside = (on) => page.evaluate((on) => { window.__mmf.extras.hollow.inside.visible = on; }, on);
const table = [];
for (const v of VIEWS) {
  await look(v);
  const row = { name: v[0] };
  await show([]); row.none = await read();
  await show(IDS); row.all = await read();
  await show(NEW); row.recent = await read();
  await show(['crack']); row.crack = await read();
  await show(['hollow']); row.mouth = await read(); // (the cave as it is now: only the mouth of the mine is drawn)
  await inside(true); row.cave = await read(); await inside(false); // (and as it was: the whole cave handed to the graphics card)
  table.push(row);
  console.log(JSON.stringify(row));
}
// what they take every frame when nobody plays: the time spent in their part of the world's update
const idle = await page.evaluate(async (n0) => {
  const a = window.__mmf, zs = a.world.zones.slice(n0); let spent = 0, n = 0;
  for (const z of zs) { const u = z.update.bind(z); z.update = (...args) => { const t = performance.now(); const r = u(...args); spent += performance.now() - t; return r; }; }
  const t0 = a.frames; await new Promise((res) => { const tick = () => (a.frames >= t0 + 120 ? res() : requestAnimationFrame(tick)); tick(); });
  n = a.frames - t0;
  return { zones: zs.length, perFrame: spent / n };
}, zones0);
console.log('to build (ms of script; then the shadows baked again), meshes, triangles:'); for (const [k, v] of Object.entries(built)) console.log(' ', k.padEnd(7), String(v.ms).padStart(5), 'ms +', String(v.bake).padStart(5), 'ms', String(v.meshes).padStart(4), 'meshes', String(v.tris).padStart(7), 'triangles');
const d = (r, k) => `+${r[k].calls - r.none.calls} calls, +${r[k].tris - r.none.tris} triangles (+${(((r[k].tris - r.none.tris) / r.none.tris) * 100).toFixed(1)} %)`;
console.log('\nwhat is drawn in a frame (mean of eight):');
for (const r of table) {
  console.log(' ', r.name, `— the game alone: ${r.none.calls} calls, ${r.none.tris} triangles`);
  console.log('      all six games      ', d(r, 'all'));
  console.log('      the five new ones  ', d(r, 'recent'));
  console.log('      the cleft alone    ', d(r, 'crack'));
  console.log('      the cave, hidden   ', d(r, 'mouth'));
  console.log('      the cave, not hidden', d(r, 'cave'));
}
console.log(`\nevery frame, nobody playing: ${idle.perFrame.toFixed(3)} ms in the ${idle.zones} updates of the extras`);
if (errors.length) console.log('errors:', errors.slice(0, 3));
await browser.close(); await server.close();
