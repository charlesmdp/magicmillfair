// Dev tool: end-to-end multiplayer check. Builds the site, starts the production server (static files +
// presence relay), opens two browsers on the same URL and verifies that each visitor sees the other one move.
// usage: node tools/duo.mjs [--q=low] [--steps=10]      Screenshots: tools/preview/duo/
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools/preview/duo');
fs.mkdirSync(OUT, { recursive: true });
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const steps = +(opt.steps || 10);
const PORT = 8791;

await build({ root: ROOT, logLevel: 'error' });
const server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
for (let i = 0; i < 50; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/healthz`)).ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 100));
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'],
});
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const logs = [];

async function visitor(name, swatch) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[${name}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => logs.push(`[${name}] ${e.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/?q=${opt.q || 'low'}`);
  await page.waitForSelector('.card.ready', { timeout: 240000 });
  await page.fill('#mmf-name', name);
  await page.click(`.swatches button:nth-child(${swatch})`);
  await page.click('.go');
  return { name, page, context };
}
const frames = (v, n) => v.page.evaluate((n) => { const app = window.__mmf; const target = app.frames + n; return new Promise((res) => { const tick = () => (app.frames >= target ? res() : requestAnimationFrame(tick)); tick(); }); }, n);
const status = (v) => v.page.evaluate(() => { const p = window.__mmf.presence; return p ? { mode: p.mode, count: p.count, peers: [...p.peers.values()].map((q) => ({ name: q.name, color: q.color, x: q.x, y: q.y, z: q.z, visible: q.visible, anim: q.anim })) } : null; });
const position = (v) => v.page.evaluate(() => { const p = window.__mmf.player.pos; return { x: p.x, y: p.y, z: p.z }; });
const until = async (fn, ms = 60000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, 250)); } };

try {
  const [alice, bob] = await Promise.all([visitor('Alice', 2), visitor('Bob', 3)]);
  const both = await until(async () => { const a = await status(alice), b = await status(bob); return a && b && a.count === 2 && b.count === 2 ? [a, b] : null; });
  check('both visitors are connected and see each other', !!both, both ? `mode ${both[0].mode}/${both[1].mode}` : 'timeout');
  if (both) {
    check('presence goes through the server (online mode)', both[0].mode === 'online' && both[1].mode === 'online');
    check('names and colours are shared', both[0].peers[0].name === 'Bob' && both[1].peers[0].name === 'Alice' && both[1].peers[0].color === 1, JSON.stringify(both[1].peers[0].name));
  }
  // Alice walks straight ahead; Bob stays and watches
  const start = await position(alice);
  await alice.page.keyboard.down('KeyW');
  await frames(alice, steps);
  await alice.page.keyboard.up('KeyW');
  await frames(alice, 3);
  const end = await position(alice);
  const walked = Math.hypot(end.x - start.x, end.z - start.z);
  check('Alice walked', walked > 1, `${walked.toFixed(2)} m`);
  const seen = await until(async () => { const b = await status(bob); const p = b.peers[0]; return p && p.visible && Math.hypot(p.x - end.x, p.z - end.z) < 0.6 ? p : null; }, 30000);
  check('Bob sees Alice where she really is', !!seen, seen ? `off by ${Math.hypot(seen.x - end.x, seen.z - end.z).toFixed(2)} m` : 'never converged');
  await frames(bob, 4);
  await bob.page.screenshot({ path: path.join(OUT, 'bob-sees-alice.png') });
  const tag = await bob.page.evaluate(() => [...document.querySelectorAll('.tag')].map((t) => ({ text: t.textContent, shown: t.style.display !== 'none' })));
  check('a name tag floats above Alice on Bob\'s screen', tag.some((t) => t.text === 'Alice' && t.shown), JSON.stringify(tag));
  // emote
  await alice.page.keyboard.press('Digit1');
  const waved = await until(() => bob.page.evaluate(() => [...window.__mmf.avatars.items.values()].some((it) => it.character.emoting === 'Wave')), 20000);
  check('Bob sees Alice wave', !!waved);
  await alice.page.screenshot({ path: path.join(OUT, 'alice.png') });
  // leaving
  await alice.context.close();
  const alone = await until(async () => { const b = await status(bob); return b.count === 1 ? b : null; }, 20000);
  check('Bob is told when Alice leaves', !!alone);
  const info = await (await fetch(`http://127.0.0.1:${PORT}/api/presence`)).json().catch(() => null);
  check('the server reports its rooms', !!info, JSON.stringify(info));
} catch (err) {
  check('scenario ran to the end', false, err.message);
}
if (logs.length) console.log([...new Set(logs)].slice(0, 20).join('\n'));
await browser.close();
server.kill();
if (results.includes(false) && serverLog) console.log('server output:\n' + serverLog.slice(-2000));
const ok = !results.includes(false) && !logs.length;
console.log(ok ? `duo test passed (${results.length} checks)` : 'duo test FAILED');
process.exit(ok ? 0 : 1);
