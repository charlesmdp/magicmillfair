// Checks of the plane in the sky (src/extras/plane.js): its line by the clock alone (no browser), then in the
// running game (a headless browser) — nothing of it while its switch is off; switched on, hidden between two passes, drawn
// where the clock says during one; whoever looks at it is told what their robot thinks, once a pass, the next
// thought at the next pass, and nothing during a game or when looking elsewhere.
// usage: node tools/plane-test.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stubOutside } from './lib/outside.mjs';
import { PLANE, THOUGHTS, planeAt, lookedAt } from '../src/extras/plane.js';
import { RELEASE, cleanRelease } from '../src/app/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };

// ---- its line, by the clock alone
const P = PLANE, lasts = (2 * P.reach) / P.speed;
check('its switch is on as the game is delivered (the owner asked for it to be there) — and for a server that kept its switches from before the plane existed', RELEASE.plane === true && cleanRelease({ guide: true }).plane === true && cleanRelease({ plane: false }).plane === false);
{
  let ok = true, nearest = Infinity, low = Infinity, high = -Infinity, speed = [];
  for (let pass = 0; pass < 200; pass++) {
    const t0 = pass * P.every * 1000, a = planeAt(t0 + 1000), b = planeAt(t0 + 2000), mid = planeAt(t0 + lasts * 500);
    if (!a || !b || !mid || a.pass !== pass || planeAt(t0 + (lasts + 1) * 1000) !== null || planeAt(t0 + (P.every - 1) * 1000) !== null) { ok = false; break; }
    speed.push(Math.hypot(b.x - a.x, b.z - a.z));
    if (a.y !== b.y || a.yaw !== b.yaw || mid.fade !== 1 || planeAt(t0).fade !== 0) ok = false;
    for (let s = 0; s <= lasts; s += 0.5) { const p = planeAt(t0 + s * 1000); if (!p) continue; nearest = Math.min(nearest, Math.hypot(p.x - P.middle[0], p.z - P.middle[1])); low = Math.min(low, p.y); high = Math.max(high, p.y); }
  }
  check('two hundred passes: one every five minutes, a straight line at one height and one speed, out of the haze and back into it, nothing in the sky between two', ok && speed.every((v) => Math.abs(v - P.speed) < 0.01), { lasts: +lasts.toFixed(1) });
  check('it never passes overhead (one does not look straight up), nor low: a kilometre aside at the least, between 520 and 700 m up', nearest >= P.aside[0] - 1 && nearest <= P.aside[1] + 1 && low >= P.height[0] && high <= P.height[1], { nearest: Math.round(nearest), low: Math.round(low), high: Math.round(high) });
  const a = planeAt(26000), eye = { x: -110, y: 14, z: -24 }, d = Math.hypot(a.x - eye.x, a.y - eye.y, a.z - eye.z), dir = { x: (a.x - eye.x) / d, y: (a.y - eye.y) / d, z: (a.z - eye.z) / d };
  const turned = (deg) => { const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180); return { x: dir.x * c - dir.z * s, y: dir.y, z: dir.x * s + dir.z * c }; };
  check('looked at: in the middle of the view, or a few degrees off — not twenty degrees off, not with one\'s back to it', lookedAt(eye, dir, a) && lookedAt(eye, turned(5), a) && !lookedAt(eye, turned(20), a) && !lookedAt(eye, { x: -dir.x, y: -dir.y, z: -dir.z }, a));
  check('everybody sees the same pass: the same clock gives the same place', JSON.stringify(planeAt(1234567)) === JSON.stringify(planeAt(1234567)));
  check('there are thoughts for several sightings, and the first is the one the owner asked for', THOUGHTS.length >= 5 && /^A plane\?/.test(THOUGHTS[0]) && /supposed to have stopped/.test(THOUGHTS[0]));
}

// ---- in the running game
const { chromium } = createRequire(import.meta.url)('playwright');
const { createServer } = await import('vite');
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5247, strictPort: false, host: '127.0.0.1', hmr: false, watch: null } });
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
  check('while its switch is off — the server has said nothing here — nothing of it is in the world', await page.evaluate(() => !window.__mmf.world.scene.getObjectByName('plane') && !window.__mmf.extras?.plane));
  const zones = await page.evaluate(() => window.__mmf.world.zones.length);
  await page.evaluate(() => import('/src/extras/index.js').then(({ loadExtras }) => loadExtras(window.__mmf, { plane: true })));
  check('switched on the way the game does it: one group in the scene, one more thing looked after each frame', await page.evaluate((zones) => { const a = window.__mmf; return a.world.scene.getObjectByName('plane') === a.extras.plane.group && a.world.zones.length === zones + 1; }, zones));
  const frames = (n) => page.evaluate((n) => new Promise((res) => { const app = window.__mmf, t = app.frames + n; const tick = () => (app.frames >= t ? res() : requestAnimationFrame(tick)); tick(); }), n);

  await page.evaluate(() => { localStorage.removeItem('mmf.plane'); const a = window.__mmf.extras.plane; a.seen = 0; a.said = -1; a.clock = () => 200000; });
  await frames(3);
  check('between two passes nothing of it is drawn', await page.evaluate(() => window.__mmf.extras.plane.group.visible === false));
  await page.evaluate(() => { window.__mmf.extras.plane.clock = () => 26000; });
  await frames(3);
  const drawn = await page.evaluate(() => { const a = window.__mmf.extras.plane, g = a.group; let tris = 0, meshes = 0; g.traverse((o) => { if (o.isMesh) { meshes++; tris += o.geometry.getAttribute('position').count / 3; } }); return { visible: g.visible, at: [g.position.x, g.position.y, g.position.z], meshes, tris }; });
  const want = planeAt(26000);
  check('during a pass it is drawn where the clock says: two meshes, a few hundred triangles', drawn.visible && Math.hypot(drawn.at[0] - want.x, drawn.at[1] - want.y, drawn.at[2] - want.z) < 0.01 && drawn.meshes === 2 && drawn.tris > 100 && drawn.tris < 800, { meshes: drawn.meshes, triangles: drawn.tris });

  // (the look of a visitor, stood for by a camera that has only what the plane asks of one: where it is, where it looks)
  const look = (how) => page.evaluate((how) => {
    const app = window.__mmf, a = app.extras.plane, p = a.at(), eye = { x: -110, y: 40, z: -24 };
    const d = Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z), s = how === 'away' ? -1 : 1;
    const cam = { position: eye, getWorldDirection: (v) => v.set((s * (p.x - eye.x)) / d, (s * (p.y - eye.y)) / d, (s * (p.z - eye.z)) / d) };
    const driver = app.player.driver;
    if (how === 'playing') app.player.driver = {};
    app.hud.noteEl.textContent = '';
    for (let i = 0; i < 4; i++) a.zone.update(0.3, 0, cam);
    app.player.driver = driver;
    return { note: app.hud.noteEl.textContent, seen: a.seen, kept: localStorage.getItem('mmf.plane') };
  }, how);
  let r = await look('away');
  check('with one\'s back to it, nothing is said', r.note === '' && r.seen === 0, r);
  r = await look('playing');
  check('during a game, nothing is said', r.note === '' && r.seen === 0, r);
  r = await look('at');
  check('looked at for a moment: the robot thinks aloud — the first thought, and it is counted in the browser', r.note === THOUGHTS[0] && r.seen === 1 && r.kept === '1', r);
  r = await look('at');
  check('once a pass: looking again says nothing more', r.note === '' && r.seen === 1, r);
  await page.evaluate((ms) => { window.__mmf.extras.plane.clock = () => ms; }, P.every * 1000 + 26000);
  await frames(2);
  r = await look('at');
  check('at the next pass, the next thought', r.note === THOUGHTS[1] && r.seen === 2 && r.kept === '2', r);
  await page.evaluate(() => { const a = window.__mmf.extras.plane; a.seen = 40; a.said = -1; });
  r = await look('at');
  check('after the last thought, the last one comes back', r.note === THOUGHTS[THOUGHTS.length - 1], r.note);
  await frames(4);
  check('nothing complained', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  await server.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
