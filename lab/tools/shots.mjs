// Pictures of the lab page (the game with the switches one chooses). usage:
//   node lab/tools/shots.mjs <out dir> "<switches: pond=1&slide=0…>" [--size=1280x720] [--do="js run in the page before the pictures"] shot ...
// a shot is  name=fromX,fromY,fromZ,toX,toY,toZ  (the free camera, metres of the world)
//        or  name@secs  (the picture is taken as the game shows it, after waiting so many seconds of the page's own clock)
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), OUT = process.argv[2], QUERY = process.argv[3] || '';
const { createServer } = await import(pathToFileURL(ROOT + '/node_modules/vite/dist/node/index.js').href);
const { chromium } = createRequire(import.meta.url)('playwright');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(4), opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split(/=(.*)/s).slice(0, 2)));
const shots = args.filter((a) => !a.startsWith('--'));
const [W, H] = (opt.size || '1280x720').split('x').map(Number);
const server = await createServer({ configFile: path.join(ROOT, 'lab/vite.config.js'), logLevel: 'error', server: { port: 5241, strictPort: false, host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-vsync'] });
const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
await page.addInitScript(() => {
  const real = performance.now.bind(performance);
  let virtual = null;
  performance.now = () => (virtual === null ? real() : virtual);
  window.__clock = { start() { virtual = real(); }, tick(ms) { virtual += ms; } };
});
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) logs.push(`[error] ${m.text().slice(0, 400)}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 5).join('\n')}`));
await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/lab/?q=${opt.q || 'balanced'}&${QUERY}`);
await page.waitForSelector('.card.ready', { timeout: 240000 });
await page.fill('#mmf-name', 'Rider');
await page.click('.swatches button:nth-child(2)');
await page.click('.go');
await page.waitForFunction(() => window.__mmf && window.__mmf.lab && window.__mmf.extras, null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.evaluate(() => { const a = window.__mmf; a.engine.adaptive = false; a.setMode('walk', true); window.__clock.start(); });
const frames = (n, ms = 50) => page.evaluate(async ([n, ms]) => { const a = window.__mmf; for (let i = 0; i < n; i++) { window.__clock.tick(ms); const t = a.frames + 1; await new Promise((res) => { const tick = () => (a.frames >= t ? res() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }); } }, [n, ms]);
if (opt.do) console.log('do:', JSON.stringify(await page.evaluate((code) => { try { return new Function(`return (${code})`)()(window.__mmf); } catch (e) { return String(e.stack || e); } }, opt.do)));
for (const s of shots) {
  if (s.includes('@')) {
    const [head, secs] = s.split('@'), [name, held] = head.split('~'), keys = held ? held.split('+') : [];
    for (const k of keys) await page.keyboard.down(k);
    await frames(Math.round(+secs * 20), 50);
    for (const k of keys) await page.keyboard.up(k);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log(name, JSON.stringify(await page.evaluate(() => { const a = window.__mmf, p = a.player; return { x: +p.pos.x.toFixed(1), y: +p.pos.y.toFixed(1), z: +p.pos.z.toFixed(1), line: document.querySelector('.run, .hud-run, #run')?.textContent || '' }; })));
    continue;
  }
  const [name, v] = s.split('='), [x, y, z, tx, ty, tz] = v.split(',').map(Number);
  await page.evaluate(([x, y, z, tx, ty, tz]) => {
    const a = window.__mmf, yaw = Math.atan2(tx - x, tz - z), pitch = Math.atan2(ty - y, Math.hypot(tx - x, tz - z));
    a.player.teleport(tx, tz, 0);
    a.setCam(x, y, z, (yaw * 180) / Math.PI + 180, (pitch * 180) / Math.PI);
  }, [x, y, z, tx, ty, tz]);
  await frames(8, 50);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(name, 'taken');
}
if (logs.length) console.log(logs.slice(0, 10).join('\n'));
await browser.close(); await server.close();
