// Dev tool: drives the real application in headless Chromium (welcome screen, walking, free camera,
// touch layout) and saves screenshots in tools/preview/smoke/. Fails when the page reports an error.
// usage: node tools/smoke.mjs [--q=low] [--mobile] [--steps=12]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { stubOutside } from './lib/outside.mjs';

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
await stubOutside(context);
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
  // the flying camera is the administrator's: a visitor has neither the button nor the key
  const fly = await page.evaluate(() => getComputedStyle(document.querySelector('[data-act="camera"]')).display);
  await page.keyboard.press('KeyF');
  await frames(3);
  const stillWalking = await page.evaluate(() => !document.querySelector('[data-act="camera"]').classList.contains('on') && window.__mmf.player.pos.distanceTo(window.__mmf.engine.camera.position) < 12);
  if (fly !== 'none' || !stillWalking) { failed = true; console.log(`FAIL: the flying camera is offered to a visitor (button ${fly}, walking ${stillWalking})`); }
  await page.click('[data-act="settings"]');
  await frames(3);
  await shot('5-settings');
  await page.click('[data-act="settings"]');
  await frames(4);
  await shot('6-back');
  // the settings also lead to the small print (terms of use, privacy) and, where the browser allows it, to full
  // screen; the page carries the script that counts the visits, after the game's own
  await page.click('[data-act="settings"]');
  const extras = await page.evaluate(() => {
    const scripts = [...document.scripts], own = scripts.findIndex((s) => s.type === 'module'), counter = scripts.findIndex((s) => s.dataset.site && /verify\.js$/.test(s.src));
    return { full: !!document.querySelector('[data-act="fullscreen"]') && !!document.querySelector('.full-row [data-fs]'), links: [...document.querySelectorAll('.legal-links button')].map((b) => b.textContent).join(), counted: counter >= 0 && (own < 0 || counter > own) && scripts[counter].defer };
  });
  await page.evaluate(() => document.querySelector('.legal-links [data-legal="privacy"]').click());
  await frames(2);
  const legal = await page.evaluate(() => { const text = document.querySelector('.legal-body').textContent; return { open: document.querySelector('.legal').classList.contains('on'), panel: document.querySelector('.hud .panel').classList.contains('on'), tab: document.querySelector('.legal-tabs .on')?.textContent, sections: document.querySelectorAll('.legal-body section').length, names: ['Cloudflare', 'Stripe', 'Anthropic', 'ship-or-die'].filter((n) => text.includes(n)).length }; });
  await shot('8-privacy');
  // nothing of the sky villages while they are hidden (the owner's switch; no server here: hidden): no gate, no
  // village on the mountains, no name on the map, not a word from the alligator
  const sky = await page.evaluate(async () => {
    const m = window.__mmf, g = m.world.sky, { Npc } = await import('/src/npc/Npc.js');
    const said = new Set();
    for (let k = 0; k < 40; k++) said.add(new Npc('alligator')._canned('where is the sky gate, the village?'));
    return { stage: g.stage, villages: g.villages.length, meshes: g.group.children.length, gate: !!g.gate.hidden, word: [...said].some((t) => /sky gate|village/i.test(t)), places: !document.querySelector('.bigmap .mega').hidden };
  });
  console.log('the sky:', JSON.stringify(sky));
  if (sky.stage !== 'hidden' || sky.villages || sky.meshes || !sky.gate || sky.word || sky.places) throw new Error(`the sky villages are hidden, yet something of them shows: ${JSON.stringify(sky)}`);
  await page.evaluate(() => document.querySelector('.legal-tabs [data-doc="terms"]').click());
  const terms = await page.evaluate(() => ({ tab: document.querySelector('.legal-tabs .on')?.textContent, sections: document.querySelectorAll('.legal-body section').length }));
  await page.evaluate(() => document.querySelector('.legal-x').click());
  const legalClosed = await page.evaluate(() => !document.querySelector('.legal').classList.contains('on'));
  console.log(`small print: ${JSON.stringify({ extras, legal, terms, legalClosed })}`);
  if (!extras.full || extras.links !== 'Terms of use,Privacy' || !extras.counted || !legal.open || legal.panel || legal.tab !== 'Privacy' || legal.sections < 5 || legal.names !== 4 || terms.tab !== 'Terms of use' || terms.sections < 5 || !legalClosed) { failed = true; console.log('FAIL: the small print, the full screen control or the script that counts the visits'); }
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
  // the story of the opening is told once: the browser that has heard it goes straight to the gate the next time
  // (?intro=1 tells it once more). The page tells a robot nothing: this visitor says it is not one.
  if (!mobile) {
    const fresh = await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
    await stubOutside(fresh);
    await fresh.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }); });
    const visitor = await fresh.newPage();
    const look = () => visitor.evaluate(() => ({ told: document.querySelector('.splash').classList.contains('told'), kept: localStorage.getItem('mmf.told') }));
    await visitor.goto(`http://127.0.0.1:${port}/?q=low`, { waitUntil: 'domcontentloaded' });
    const first = await look();
    await visitor.keyboard.press('Escape');
    const heard = await look();
    await visitor.reload({ waitUntil: 'domcontentloaded' });
    const second = await look();
    await visitor.goto(`http://127.0.0.1:${port}/?q=low&intro=1`, { waitUntil: 'domcontentloaded' });
    const asked = await look();
    await fresh.close();
    console.log(`the story: ${JSON.stringify({ first, heard, second, asked })}`);
    if (first.told || first.kept || !heard.told || heard.kept !== '1' || !second.told || asked.told) { failed = true; console.log('FAIL: the story of the opening is told once — then only when asked for'); }
  }
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
