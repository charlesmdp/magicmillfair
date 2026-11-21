// Dev tool: end-to-end multiplayer check. Builds the site, starts the production server (static files +
// presence relay), opens two browsers on the same URL and verifies that each visitor sees the other one move.
// usage: node tools/duo.mjs [--q=low] [--steps=10] [--cloudflare]      Screenshots: tools/preview/duo/
// --cloudflare: the production server is the Cloudflare version (wrangler.jsonc as it is deployed, run by
// `wrangler dev` in the local Workers runtime) instead of the Node one.
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

const CF = !!opt.cloudflare;
let server;
if (CF) {
  // wrangler builds the site itself (build.command of wrangler.jsonc), exactly as a deployment does
  server = spawn(process.execPath, [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--inspector-port', String(PORT + 1), '--show-interactive-dev-session=false'],
    { cwd: ROOT, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
} else {
  await build({ root: ROOT, logLevel: 'error' });
  server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
}
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
const stopServer = () => { try { if (CF) process.kill(-server.pid, 'SIGTERM'); else server.kill(); } catch { /* gone */ } };
for (let i = 0; i < 900; i++) {
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
    check(`presence goes through the ${CF ? 'Cloudflare Worker' : 'Node server'} (online mode)`, both[0].mode === 'online' && both[1].mode === 'online');
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
  // an animal of light
  await alice.page.keyboard.press('Digit8');
  const wolf = await until(() => bob.page.evaluate(() => window.__mmf.rank.active.some((e) => e.kind === 'wolf')), 20000);
  check('Bob sees the wolf Alice summons', !!wolf);
  // chat
  await alice.page.keyboard.press('Enter');
  await frames(alice, 2);
  await alice.page.keyboard.type('Hello Bob!');
  await alice.page.keyboard.press('Enter');
  const heard = await until(() => bob.page.evaluate(() => { const log = [...document.querySelectorAll('.chat .log p')].map((e) => e.textContent); const tag = [...document.querySelectorAll('.tag')].find((t) => t.firstChild && t.textContent.startsWith('Alice')); return log.some((l) => l === 'Alice Hello Bob!') && tag?.querySelector('.bubble')?.textContent === 'Hello Bob!' ? log : null; }), 20000);
  check('Bob reads what Alice says, in the chat and over her head', !!heard, JSON.stringify(heard));
  // sitting down: Alice takes the nearest seat of the world, Bob sees her seated there
  const seat = await alice.page.evaluate(() => { const a = window.__mmf, s = a.world.seats.find((q) => q.work); a.player.teleport(s.x + 0.6, s.z + 0.8, 0); a.rig.snap(a.player.pos, 0); return { x: s.x, z: s.z }; });
  await frames(alice, 4);
  await alice.page.keyboard.press('KeyE');
  const seated = await until(async () => { const b = await status(bob); const p = b.peers[0]; return p && p.anim === 7 && Math.hypot(p.x - seat.x, p.z - seat.z) < 0.5 ? p : null; }, 30000);
  // (visitors who are out of sight are neither drawn nor animated: Bob walks over and looks at her)
  await bob.page.evaluate(([x, z]) => { const a = window.__mmf; a.player.teleport(x + 3, z + 3, 0); a.rig.snap(a.player.pos, Math.PI / 4); }, [seat.x, seat.z]);
  const laptop = seated && await until(() => bob.page.evaluate(() => [...window.__mmf.avatars.items.values()].some((it) => it.character.root.visible && it.character.laptop?.visible)), 10000);
  check('Bob sees Alice sitting at work, laptop on her knees', !!seated && !!laptop, seated ? `pose ${seated.anim}` : 'never seen seated');
  // leaving
  await alice.context.close();
  const alone = await until(async () => { const b = await status(bob); return b.count === 1 ? b : null; }, 20000);
  check('Bob is told when Alice leaves', !!alone);
  const info = await (await fetch(`http://127.0.0.1:${PORT}/api/presence?room=main`)).json().catch(() => null);
  check('the server counts who is left in the room', !!info && info.room === 'main' && info.players === 1, JSON.stringify(info));
} catch (err) {
  check('scenario ran to the end', false, err.message);
}
if (logs.length) console.log([...new Set(logs)].slice(0, 20).join('\n'));
await browser.close();
stopServer();
if (results.includes(false) && serverLog) console.log('server output:\n' + serverLog.slice(-2000));
const ok = !results.includes(false) && !logs.length;
console.log(ok ? `duo test passed (${results.length} checks)` : 'duo test FAILED');
process.exit(ok ? 0 : 1);
