// Two visitors play the same game at once, and what each sees of the other is photographed.
//
//   node lab/tools/duo-games.mjs <id> [--late=6] [--at=4,12,25] [--out=<folder>] [--skew=3500] [--q=low] [--hands] [--slow]
//
// Builds the site, starts the game's own server (rooms, relay), switches the game on as the owner does, opens two
// browsers (Alice, Bob) and lets each start the game — Bob `--late` seconds after Alice — played by the game's own
// bot. A picture of each screen is taken `--at` so many seconds after Alice's start (a-4.png, b-4.png …), and a
// line says where each sees the other. `--skew`: Bob's computer clock is that many ms ahead of Alice's (two
// devices never agree); `--hands`: nobody plays (the bots are off): one stands in the game.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { stubOutside } from '../../tools/lib/outside.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split(/=(.*)/s); return [k, v ?? true]; }));
const id = args.find((a) => !a.startsWith('--'));
if (!id) { console.log('usage: node lab/tools/duo-games.mjs <id> [--late=6] [--at=4,12,25] [--out=folder] [--skew=ms] [--hands]'); process.exit(1); }
const OUT = path.resolve(opt.out || path.join(ROOT, 'lab/games/shots/duo', id)), LATE = +(opt.late ?? 6), AT = String(opt.at || '4,12,25').split(',').map(Number), SKEW = +(opt.skew || 0);
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8795 + Math.floor(Math.random() * 40), KEY = 'duo-games-key';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SLOW = opt.slow ? 4 : 1; // (--slow: a machine that is busy — four times the patience, one visitor after the other)

if (!opt.nobuild) await build({ root: ROOT, logLevel: 'error', define: { __TEST__: 'true' } });
const store = path.join(OUT, 'store.json');
fs.rmSync(store, { force: true });
const server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ADMIN_KEY: KEY, SCORES_FILE: store, FREE_ROOMS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
for (let i = 0; i < 300; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/healthz`)).ok) break; } catch { /* not up yet */ } await sleep(100); }
const set = await fetch(`http://127.0.0.1:${PORT}/api/release`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` }, body: JSON.stringify({ set: Object.fromEntries(id.split(',').map((g) => [g, true])) }) });
console.log('switch:', set.status, JSON.stringify((await set.json().catch(() => ({}))).release?.[id.split(',')[0]]));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'] });
const logs = [];
async function visitor(name, swatch, skew = 0) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  await stubOutside(context);
  if (skew) await context.addInitScript((ms) => { // (this computer's clock is ahead)
    const o = performance.timeOrigin; Object.defineProperty(performance, 'timeOrigin', { get: () => o + ms });
    const D = Date.now.bind(Date); Date.now = () => D() + ms;
  }, skew);
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/api\/|404|Failed to load resource/.test(m.text())) logs.push(`[${name}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => logs.push(`[${name}] ${e.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/?q=${opt.q || 'low'}`);
  await page.waitForSelector('.card.ready', { timeout: 300000 * SLOW });
  await page.mouse.click(5, 5);
  await page.fill('#mmf-name', name, { timeout: 180000 * SLOW });
  await page.click(`.swatches button:nth-child(${swatch})`);
  await page.click('.go');
  await page.waitForFunction(() => window.__mmf && window.__mmf.input.enabled, null, { timeout: 120000 * SLOW });
  return { name, page };
}
const game = id.split(',')[0];
const START = `(id, hands) => { const app = window.__mmf, lab = app.labGames && app.labGames[id]; const old = { boats: 'raceBoats', slide: 'rideSlide', pond: 'runPond', hill: 'climbHill', crack: 'climbCleft', hollow: 'flyHollow' }[id];
  const got = { boats: 'boatRace', slide: 'slideRide', pond: 'pondRun', hill: 'hillClimb', crack: 'cleftClimb', hollow: 'hollowFlight' }[id];
  let run = lab ? lab.start() : old && app[old] ? app[old]() : null; if (!run && got && app[got]) run = app[got](); if (run && !hands) run.auto = true; return !!run; }`;
const sees = (v) => v.page.evaluate(() => { const app = window.__mmf, p = app.player.pos; return { me: [p.x, p.y, p.z].map((n) => +n.toFixed(1)), clock: Math.round(app.worldClock ? app.worldClock() : performance.timeOrigin + performance.now()), others: [...app.presence.peers.values()].map((q) => ({ name: q.name, at: [q.x, q.y, q.z].map((n) => +n.toFixed(1)), visible: q.visible, hidden: !!q.hidden })) }; });
try {
  const [alice, bob] = opt.slow ? [await visitor('Alice', 2), await visitor('Bob', 3, SKEW)] : await Promise.all([visitor('Alice', 2), visitor('Bob', 3, SKEW)]);
  const built = async (v) => v.page.waitForFunction((g) => !!(window.__mmf.extras && window.__mmf.extras[g] && window.__mmf.extras[g] !== true), game, { timeout: 120000 * SLOW }).then(() => true).catch(() => false);
  console.log('built:', await built(alice), await built(bob));
  // (both go to the gate first, so that the relay tells each about the other)
  for (const v of [alice, bob]) await v.page.evaluate((g) => { const app = window.__mmf, e = app.extras[g], at = e.gate || e.stand; if (at) app.player.teleport(at.x + (Math.random() - 0.5) * 2, at.z + (Math.random() - 0.5) * 2, at.yaw || 0); }, game);
  await sleep(2500);
  const t0 = Date.now();
  console.log('Alice starts:', await alice.page.evaluate(`(${START})(${JSON.stringify(game)}, ${!!opt.hands})`));
  let bobIn = false;
  const startBob = async () => { if (bobIn) return; bobIn = true; console.log(`Bob starts (${((Date.now() - t0) / 1000).toFixed(1)} s after):`, await bob.page.evaluate(`(${START})(${JSON.stringify(game)}, ${!!opt.hands})`)); };
  for (const at of [...AT].sort((a, b) => a - b)) {
    if (!bobIn && LATE < at) { await sleep(Math.max(0, t0 + LATE * 1000 - Date.now())); await startBob(); }
    await sleep(Math.max(0, t0 + at * 1000 - Date.now()));
    await Promise.all([alice.page.screenshot({ path: path.join(OUT, `a-${at}.png`) }), bob.page.screenshot({ path: path.join(OUT, `b-${at}.png`) })]);
    const [a, b] = await Promise.all([sees(alice), sees(bob)]);
    console.log(`t=${at}s  Alice ${JSON.stringify(a.me)} sees ${JSON.stringify(a.others)}  |  Bob ${JSON.stringify(b.me)} sees ${JSON.stringify(b.others)}  |  clocks apart ${a.clock - b.clock} ms`);
  }
  if (!bobIn) await startBob();
} catch (err) { console.log('error:', err.message); } finally {
  if (logs.length) console.log('page errors:\n' + [...new Set(logs)].slice(0, 12).join('\n'));
  await browser.close();
  try { server.kill(); } catch { /* gone */ }
  console.log('pictures in', OUT);
}
