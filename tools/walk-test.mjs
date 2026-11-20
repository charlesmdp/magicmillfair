// Dev tool: gameplay checks in headless Chromium — walking onto the pier, crossing a footbridge, climbing the
// garden steps, being stopped by the mountains and by a wall, swimming, changing the quality tier (page reload
// at the same spot) — and the download size.
// usage: node tools/walk-test.mjs [--q=low]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools/preview/walk');
fs.mkdirSync(OUT, { recursive: true });
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5194, strictPort: false, host: '127.0.0.1' } });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push(e.message));

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const frames = (n) => page.evaluate((n) => { const app = window.__mmf; const target = app.frames + n; return new Promise((res) => { const tick = () => (app.frames >= target ? res() : requestAnimationFrame(tick)); tick(); }); }, n);
const state = () => page.evaluate(() => { const p = window.__mmf.player; return { x: p.pos.x, y: p.pos.y, z: p.pos.z, swimming: p.swimming, grounded: p.grounded, anim: p.anim }; });
/** Put the player somewhere, facing `heading` degrees (0 = north, 90 = west, 180 = south, 270 = east). */
const place = (x, z, heading) => page.evaluate(([x, z, h]) => {
  const app = window.__mmf, yaw = (h * Math.PI) / 180;
  app.player.teleport(x, z, yaw + Math.PI);
  app.rig.snap(app.player.pos, yaw);
}, [x, z, heading]);
const walk = async (n, run = false) => {
  if (run) await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await frames(n);
  await page.keyboard.up('KeyW');
  if (run) await page.keyboard.up('ShiftLeft');
  await frames(2);
};

try {
  await page.goto(`http://127.0.0.1:${port}/?q=${opt.q || 'low'}`);
  await page.waitForSelector('.card.ready', { timeout: 240000 });
  const dl = await page.evaluate(() => {
    const list = performance.getEntriesByType('resource').filter((e) => e.name.includes('/assets/'));
    return { files: list.length, bytes: list.reduce((n, e) => n + (e.encodedBodySize || 0), 0) };
  });
  console.log(`download: ${(dl.bytes / 1048576).toFixed(1)} MB in ${dl.files} asset files (tier ${opt.q || 'low'})`);
  await page.click('.go');
  await frames(30); // the opening camera glide
  const layout = await page.evaluate(async () => {
    const L = await import('/src/world/layout/layout.js');
    const w = window.__mmf.world;
    const decks = (w.mill.platforms || []).filter((p) => p.type === 'deck').map((p) => ({ a: p.a, b: p.b, width: p.width, camber: p.camber }));
    return { pier: L.PIER, decks: decks.filter((p) => p.camber > 0), stairs: decks.filter((p) => p.camber === 0), pondBig: L.LEVELS.pondBig, bounds: w.data.meta.bounds };
  });

  // --- the pier: from the plaza, run along its axis
  const P = layout.pier, ch = Math.cos(P.heading), sh = Math.sin(P.heading);
  const heading = ((Math.atan2(-ch, -sh) * 180) / Math.PI + 360) % 360; // camera yaw whose forward is the pier axis
  await place(P.rootX - ch * 8, P.rootZ - sh * 8, heading);
  await frames(3);
  const p0 = await state();
  await walk(46, true);
  const p1 = await state();
  const along = (p1.x - P.rootX) * ch + (p1.z - P.rootZ) * sh;
  check('walks from the plaza onto the pier deck', along > 12 && Math.abs(p1.y - P.deckY) < 0.5, `along the pier ${along.toFixed(1)} m, height ${p1.y.toFixed(2)} (deck ${P.deckY}), started at ${p0.y.toFixed(2)}`);
  await page.screenshot({ path: path.join(OUT, 'pier.png') });
  // the railing stops a walker heading sideways
  await place(P.rootX + ch * 60, P.rootZ + sh * 60, (heading + 90) % 360);
  await frames(3);
  await walk(40, true);
  const p2 = await state();
  const across = -(p2.x - P.rootX) * sh + (p2.z - P.rootZ) * ch;
  check('the pier railing holds', Math.abs(across) < P.width / 2 && Math.abs(p2.y - P.deckY) < 0.6, `offset from the axis ${across.toFixed(2)} m (half width ${P.width / 2})`);

  // --- a footbridge
  if (layout.decks.length) {
    const d = layout.decks[0];
    const dx = d.b.x - d.a.x, dz = d.b.z - d.a.z, len = Math.hypot(dx, dz);
    const h = ((Math.atan2(-dx / len, -dz / len) * 180) / Math.PI + 360) % 360;
    await place(d.a.x - (dx / len) * 1.6, d.a.z - (dz / len) * 1.6, h);
    await frames(3);
    let top = -1e9;
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 14; i++) { await frames(2); top = Math.max(top, (await state()).y); }
    await page.keyboard.up('KeyW');
    const p3 = await state();
    const t = ((p3.x - d.a.x) * dx + (p3.z - d.a.z) * dz) / (len * len);
    check('crosses a footbridge on its deck', t > 0.9 && top > Math.min(d.a.y, d.b.y) - 0.1, `progress ${(t * 100).toFixed(0)} %, highest point ${top.toFixed(2)} (deck ends ${d.a.y.toFixed(2)} / ${d.b.y.toFixed(2)})`);
    await page.screenshot({ path: path.join(OUT, 'bridge.png') });
  }

  // --- garden steps: climbed on their treads, from the foot to the upper terrace
  if (layout.stairs.length) {
    const d = layout.stairs[0];
    const dx = d.b.x - d.a.x, dz = d.b.z - d.a.z, len = Math.hypot(dx, dz);
    const h = ((Math.atan2(-dx / len, -dz / len) * 180) / Math.PI + 360) % 360;
    await place(d.a.x - (dx / len) * 1.2, d.a.z - (dz / len) * 1.2, h);
    await frames(3);
    const y0 = (await state()).y;
    let mid = null;
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 12; i++) { await frames(2); const st = await state(); const t = ((st.x - d.a.x) * dx + (st.z - d.a.z) * dz) / (len * len); if (t > 0.35 && t < 0.65 && !mid) mid = { t, y: st.y }; }
    await page.keyboard.up('KeyW');
    const st = await state();
    const expected = mid ? d.a.y + (d.b.y - d.a.y) * mid.t : 0;
    check('climbs the garden steps on their treads', st.y > d.b.y - 0.25 && !!mid && Math.abs(mid.y - expected) < 0.3, `from ${y0.toFixed(2)} to ${st.y.toFixed(2)} (top ${d.b.y.toFixed(2)})${mid ? `, half way ${mid.y.toFixed(2)} for ${expected.toFixed(2)}` : ''}`);
  }

  // --- the mountains: the valley cannot be left
  const inside = (x, z) => { let inn = false; const b = layout.bounds; for (let i = 0, j = b.length - 1; i < b.length; j = i++) { if ((b[j][1] > z) !== (b[i][1] > z) && x < ((b[i][0] - b[j][0]) * (z - b[j][1])) / (b[i][1] - b[j][1]) + b[j][0]) inn = !inn; } return inn; };
  await place(-88, -168, 0); // on the lane, facing the mountains to the north
  await frames(3);
  await walk(50, true);
  const m1 = await state();
  await place(-262, 20, 90); // at the foot of the western crags, facing them
  await frames(3);
  await walk(50, true);
  const m2 = await state();
  const near = (x, z) => inside(x, z) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => inside(x + a * 0.6, z + c * 0.6));
  check('the mountains cannot be crossed', near(m1.x, m1.z) && near(m2.x, m2.z) && m1.z > -186 && m2.x > -292, `north: ${m1.x.toFixed(1)}, ${m1.z.toFixed(1)} · west: ${m2.x.toFixed(1)}, ${m2.z.toFixed(1)}`);

  // --- swimming in the big pond
  await place(-170, 62, 200);
  await frames(8);
  const s0 = await state();
  await walk(12);
  const s1 = await state();
  check('swims in the pond', s0.swimming && s1.swimming && Math.abs(s1.y - (layout.pondBig - 1.05)) < 0.25 && Math.hypot(s1.x - s0.x, s1.z - s0.z) > 1, `depth of the body ${(layout.pondBig - s1.y).toFixed(2)} m under the surface, moved ${Math.hypot(s1.x - s0.x, s1.z - s0.z).toFixed(1)} m`);
  await page.screenshot({ path: path.join(OUT, 'swim.png') });

  // --- walls: walking into the house does not go through
  const house = await page.evaluate(async () => (await import('/src/world/layout/layout.js')).MILL.house);
  await place(house.x + 14, house.z - 4, 90); // east of the house, facing west
  await frames(3);
  await walk(40, true);
  const w1 = await state();
  const lx = (w1.x - house.x) * Math.cos(house.yaw) - (w1.z - house.z) * Math.sin(house.yaw);
  const lz = (w1.x - house.x) * Math.sin(house.yaw) + (w1.z - house.z) * Math.cos(house.yaw);
  check('the house walls stop the walker', !(Math.abs(lx) < house.width / 2 && Math.abs(lz) < house.length / 2), `position in the house frame ${lx.toFixed(1)}, ${lz.toFixed(1)}`);

  // --- quality change: the page reloads and resumes where we were
  await place(-121.8, -40, 184);
  await frames(3);
  const before = await state();
  await page.click('[data-act="settings"]');
  await Promise.all([page.waitForNavigation({ timeout: 240000 }), page.click('.quality [data-q="medium"]')]);
  await page.waitForFunction(() => window.__mmf && window.__mmf.ready && window.__mmf.player, null, { timeout: 240000 });
  await frames(4);
  const after = await state();
  const tier = await page.evaluate(() => window.__mmf.engine.tierId);
  const welcome = await page.evaluate(() => document.querySelector('.splash').classList.contains('done'));
  check('changing the quality resumes at the same spot, without the welcome screen', tier === 'medium' && welcome && Math.hypot(after.x - before.x, after.z - before.z) < 0.5, `tier ${tier}, moved ${Math.hypot(after.x - before.x, after.z - before.z).toFixed(2)} m`);
} catch (err) {
  check('scenario ran to the end', false, err.message.split('\n')[0]);
  await page.screenshot({ path: path.join(OUT, 'error.png') }).catch(() => {});
}
if (errors.length) console.log([...new Set(errors)].slice(0, 12).join('\n'));
await browser.close();
await server.close();
const ok = !results.includes(false) && !errors.length;
console.log(ok ? `walk test passed (${results.length} checks)` : 'walk test FAILED');
process.exit(ok ? 0 : 1);
