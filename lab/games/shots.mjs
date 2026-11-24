// Pictures of the games of this folder, taken in the running game (a headless browser), to look at what was built.
//
//   node lab/games/shots.mjs <id>[,<id>…] [--q=medium] [--size=1280x720] [--out=<folder>] shot…
//
// A shot is
//   name=x,y,z,yaw,pitch     the free camera, put there (degrees, as tools/shots.mjs: yaw 0 looks north, 90 west,
//                            180 south, -90 east; pitch -89 straight down)
//   name=play:seconds        the game is started and plays by itself (session.auto); the picture is taken so
//                            many seconds later, through the game's own camera, with the line of the run
//   name=gate                the player standing at the gate, seen from behind
// The first id is the game that is played. Pictures go to lab/games/shots/ (not kept in the repository).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stubOutside } from '../../tools/lib/outside.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split(/=(.*)/s).slice(0, 2)));
const plain = args.filter((a) => !a.startsWith('--')), ids = (plain[0] || '').split(',').filter(Boolean), shots = plain.slice(1).map((a) => { const [name, v = 'gate'] = a.split(/=(.*)/s); return { name, v }; });
if (!ids.length || !shots.length) { console.log('usage: node lab/games/shots.mjs <id>[,<id>…] name=x,y,z,yaw,pitch | name=play:seconds | name=gate …'); process.exit(1); }
const OUT = path.resolve(opt.out || path.join(ROOT, 'lab/games/shots'));
fs.mkdirSync(OUT, { recursive: true });
const [W, H] = (opt.size || '1280x720').split('x').map(Number);

const { chromium } = createRequire(import.meta.url)('playwright');
const { createServer } = await import('vite');
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5230, strictPort: false, host: '127.0.0.1', hmr: false, watch: null } }); // (nothing is watched: a file saved meanwhile does not load the page again)
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-vsync'] });
const context = await browser.newContext({ viewport: { width: W, height: H } });
await stubOutside(context);
const page = await context.newPage(), logs = [];
page.on('console', (m) => { if (m.type() === 'error' && !/api\/|404|Failed to load resource/.test(m.text())) logs.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?q=${opt.q || 'medium'}`);
  await page.waitForSelector('.card.ready', { timeout: 240000 });
  await page.mouse.click(5, 5); // (the story told as the page opens is cut short: a click reveals the gate)
  await page.fill('#mmf-name', 'Player', { timeout: 180000 });
  await page.click('.go', { timeout: 180000 });
  await page.waitForFunction(() => window.__mmf && window.__mmf.input.enabled, null, { timeout: 60000 });
  const frames = (n) => page.evaluate((n) => new Promise((res) => { const app = window.__mmf, t = app.frames + n; const tick = () => (app.frames >= t ? res() : requestAnimationFrame(tick)); tick(); }), n);
  for (const id of ids) await page.evaluate((id) => import(`/lab/games/${id}/extra.js`).then((m) => m.attach(window.__mmf)), id);
  await frames(6);
  const id = ids[0];
  for (const s of shots) {
    if (s.v.startsWith('play:')) {
      const secs = Number(s.v.slice(5)) || 5;
      await page.evaluate((id) => { const a = window.__mmf, g = a.labGames[id]; a.setMode?.('walk', true); if (!g.run()) { a.player.teleport(g.game.gate.x, g.game.gate.z, g.game.gate.yaw); g.start(); } const r = g.run(); if (r) r.auto = true; }, id);
      await page.waitForTimeout(secs * 1000);
      await frames(2);
    } else if (s.v === 'gate') {
      await page.evaluate((id) => { const a = window.__mmf, g = a.labGames[id]; g.leave(false); a.setMode?.('walk', true); const t = g.game.gate; a.player.teleport(t.x - Math.sin(t.yaw) * 3, t.z - Math.cos(t.yaw) * 3, t.yaw); a.rig.snap(a.player.pos, t.yaw + Math.PI); }, id);
      await frames(8);
    } else {
      await page.evaluate(([id, c]) => { const a = window.__mmf; a.labGames[id]?.leave(false); a.setCam(...c); }, [id, s.v.split(',').map(Number)]);
      await frames(8);
    }
    await page.screenshot({ path: path.join(OUT, `${s.name}.png`) });
    const info = await page.evaluate((id) => { const a = window.__mmf, r = a.labGames[id]?.run(), p = a.engine.perf; return { line: r ? r.line : '', calls: p.calls, tris: p.triangles }; }, id);
    console.log(`${s.name}: ${JSON.stringify(info)}`);
  }
  if (logs.length) console.log([...new Set(logs)].slice(0, 20).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
