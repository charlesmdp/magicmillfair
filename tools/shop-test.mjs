// Dev tool: the shop from end to end, in the real game. Builds the site, starts the Node server with test keys
// and a stand-in for Stripe, and plays a visitor who buys a hat, then a sponsor who takes the panel of a game,
// fills it in (a logo with it), and the administrator who approves it.
// usage: node tools/shop-test.mjs [--q=low]      (npm run test:shop)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { signWebhook } from '../server/stripe.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const PORT = 8795, STRIPE_PORT = 8796, BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_KEY = 'shop-test-admin-key', STRIPE_KEY = 'sk_test_shoptest', HOOK = 'whsec_shoptest';
// (a real picture, bigger than the game keeps: it is redrawn smaller before it leaves the browser)
const LOGO = await require('sharp')({ create: { width: 640, height: 400, channels: 4, background: '#c0392b' } }).png().toBuffer();

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

// a stand-in for Stripe: it hands out payment pages
const asked = [];
const stripe = http.createServer((req, res) => {
  let text = '';
  req.on('data', (d) => { text += d; });
  req.on('end', () => { asked.push(new URLSearchParams(text)); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id: `cs_test_${asked.length}`, url: `https://checkout.stripe.test/pay/${asked.length}` })); });
});
await new Promise((resolve) => stripe.listen(STRIPE_PORT, '127.0.0.1', resolve));

await build({ root: ROOT, logLevel: 'error' });
fs.rmSync(path.join(ROOT, 'tools/preview/shop-test-store.json'), { force: true }); // (what an earlier run sold is not for sale twice)
const server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ADMIN_KEY, STRIPE_SECRET_KEY: STRIPE_KEY, STRIPE_WEBHOOK_SECRET: HOOK, STRIPE_API: `http://127.0.0.1:${STRIPE_PORT}`, SCORES_FILE: path.join(ROOT, 'tools/preview/shop-test-store.json') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
for (let i = 0; i < 300; i++) { try { if ((await fetch(`${BASE}/healthz`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }
/** Stripe tells the server that `item` was paid by `device`. */
const pay = async (item, device, sub = null) => {
  const raw = JSON.stringify({ type: 'checkout.session.completed', data: { object: { payment_status: 'paid', subscription: sub, metadata: { item, device } } } });
  return (await fetch(`${BASE}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': await signWebhook(HOOK, raw) }, body: raw })).status;
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const logs = [];
try {
  const context = await browser.newContext({ viewport: { width: 960, height: 560 }, deviceScaleFactor: 1 });
  await context.route('https://checkout.stripe.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>pay</title>the payment page' }));
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) logs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => logs.push(e.message));
  const enter = async (query = '') => {
    await page.goto(`${BASE}/?q=${opt.q || 'low'}${query}`);
    await page.waitForSelector('.card.ready', { timeout: 240000 });
    await page.click('.go');
    await page.waitForFunction(() => window.__mmf && window.__mmf.ready && window.__mmf.player, null, { timeout: 60000 });
  };
  const frames = (n) => page.evaluate((n) => { const app = window.__mmf; const target = app.frames + n; return new Promise((res) => { const tick = () => (app.frames >= target ? res() : requestAnimationFrame(tick)); tick(); }); }, n);
  const prompts = () => page.evaluate(() => [...document.querySelectorAll('.prompt.on span')].map((e) => e.textContent));
  const hats = () => page.evaluate(() => [...document.querySelectorAll('[data-hat]')].map((b) => b.textContent));

  // ---- a visitor: hats are for sale; one is bought
  await enter();
  await page.waitForFunction(() => document.querySelector('[data-hat="6"]').textContent.includes('$'), null, { timeout: 20000 });
  const before = await hats(), jet = await page.evaluate(() => document.querySelector('.buy-jet').textContent);
  const device = await page.evaluate(() => localStorage.getItem('mmf.device'));
  check('the hats carry their price, the jetpack too, while the shop is open', before[0] === 'No hat' && before[6] === 'Crown · $9.99' && jet === 'Jetpack · $30', JSON.stringify({ before, jet }));
  await page.evaluate(() => document.querySelector('[data-hat="6"]').click());
  await page.waitForSelector('.chooser.on', { timeout: 20000 });
  const offer = await page.evaluate(() => [...document.querySelectorAll('.chooser .list button')].map((b) => b.textContent));
  const worn = await page.evaluate(() => document.querySelector('[data-hat="6"]').getAttribute('aria-pressed'));
  await Promise.all([page.waitForURL('https://checkout.stripe.test/**', { timeout: 20000 }), page.click('.chooser .list button:nth-child(1)')]);
  check('a hat that is not theirs is offered for sale, not worn; yes leads to the payment page of Stripe', /Buy it · \$9\.99/.test(offer[0]) && /Test mode/.test(offer[0]) && worn !== 'true' && asked[0]?.get('metadata[item]') === 'hat:crown' && asked[0].get('metadata[device]') === device && asked[0].get('line_items[0][price_data][unit_amount]') === '999', JSON.stringify({ offer, worn, asked: asked[0]?.toString().slice(0, 200) }));
  // (Stripe says it was paid; the visitor comes back)
  const hook = await pay('hat:crown', device);
  await enter('&paid=hat%3Acrown');
  await page.waitForFunction(() => document.querySelector('[data-hat="6"]').textContent === 'Crown', null, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('[data-hat="6"]').click());
  await frames(5);
  const after = await page.evaluate(() => ({ pressed: document.querySelector('[data-hat="6"]').getAttribute('aria-pressed'), hat: window.__mmf.me.look?.hat, url: location.search, others: document.querySelector('[data-hat="5"]').textContent }));
  check('back from the payment page the hat is theirs and can be worn; the others are still for sale', hook === 200 && after.pressed === 'true' && !/paid/.test(after.url) && after.others === 'Cowboy hat · $9.99', JSON.stringify(after));

  // ---- a sponsor: the panel of the shooting gallery
  const slot = await page.evaluate(() => { const m = window.__mmf, s = m.world.sponsorSlots.find((q) => q.id === 'board:shoot'); m.player.teleport(s.x, s.z, 0); return { x: s.x, z: s.z }; });
  await frames(8);
  const free = await prompts();
  await pay('board:shoot', device, 'sub_shoptest_1');
  await page.evaluate(() => window.__mmf.refreshShop());
  await frames(8);
  const mine = await prompts();
  check('by the board of a game: "Sponsor … · $49 a month" while it is free, "Set up your panel" once it is theirs', free.some((t) => /^Sponsor this game · \$49 a month$/.test(t)) && mine.includes('Set up your panel'), JSON.stringify({ free, mine, slot }));
  await page.keyboard.press('KeyE');
  await page.waitForSelector('.chooser.on .fields', { timeout: 20000 });
  const inputs = page.locator('.chooser .fields input');
  await inputs.nth(0).fill('Acme <b>Robotics</b>');
  await inputs.nth(1).fill('Friendly machines since 1999');
  await inputs.nth(2).fill('https://acme.example/');
  await inputs.nth(3).setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: LOGO });
  await page.click('.chooser .fields .save');
  await page.waitForFunction(() => window.__mmf.shop.slots['board:shoot']?.draft, null, { timeout: 20000 });
  const sent = await page.evaluate(() => ({ view: window.__mmf.shop.slots['board:shoot'], note: document.querySelector('.hud .note')?.textContent }));
  const publicView = await (await fetch(`${BASE}/api/shop`)).json();
  check('the holder fills the panel in (name, line, link, logo): it awaits approval, nobody else sees it yet', sent.view.draft.title === 'Acme b Robotics /b' && sent.view.draft.url === 'https://acme.example/' && !!sent.view.draft.logo && publicView.slots['board:shoot'].state === 'taken' && !publicView.slots['board:shoot'].title, JSON.stringify({ sent, publicView: publicView.slots }));

  // ---- the administrator approves it, by the panel
  await page.evaluate((key) => window.__mmf.adminKey(key), ADMIN_KEY);
  await page.waitForFunction(() => [...document.querySelectorAll('.prompt.on span')].some((e) => /^Approve/.test(e.textContent)), null, { timeout: 20000 });
  const asks = await prompts();
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__mmf.shop.slots['board:shoot']?.state === 'live', null, { timeout: 20000 });
  await frames(10);
  const live = await page.evaluate(() => ({ view: window.__mmf.shop.slots['board:shoot'], prompts: [...document.querySelectorAll('.prompt.on span')].map((e) => e.textContent) }));
  const logo = await fetch(`${BASE}${live.view.logo}`);
  check('the administrator is offered to approve or refuse it there; approved, it is shown to all, with its link and its logo', asks[0] === 'Approve "Acme b Robotics /b"' && asks[1] === 'Refuse it' && live.view.title === 'Acme b Robotics /b' && logo.status === 200 && logo.headers.get('content-type') === 'image/png' && logo.headers.get('x-content-type-options') === 'nosniff', JSON.stringify({ asks, live, logo: logo.status }));
  await page.screenshot({ path: path.join(ROOT, 'tools/preview/shop-panel.png') });

  // ---- a gondola, at the stand of the wheel
  await page.evaluate(() => { const m = window.__mmf, b = m.world.pier.sponsorBooth; m.player.teleport(b[0], b[1], 0); });
  await frames(8);
  const stand = await prompts();
  await page.keyboard.press('KeyE');
  await page.waitForSelector('.chooser.on', { timeout: 20000 });
  const cars = await page.evaluate(() => [...document.querySelectorAll('.chooser .list button')].map((b) => b.textContent));
  check('the stand of the wheel lists its twenty-four gondolas, free at $29 a month', stand.includes('The gondolas and their sponsors') && cars.length === 24 && /Gondola 7/.test(cars[6]) && /Free · \$29 a month/.test(cars[6]), JSON.stringify({ stand, cars: cars.slice(5, 8) }));
  check('no error in the page', logs.length === 0, logs.join(' | '));
} catch (err) {
  check('the test ran to its end', false, String(err && err.stack ? err.stack : err).slice(0, 600));
} finally {
  await browser.close();
  server.kill();
  stripe.close();
}
if (/error|exception/i.test(serverLog)) check('the server logged no error', false, serverLog.slice(0, 400));
const failed = results.filter((ok) => !ok).length;
console.log(failed ? `\nshop test FAILED (${failed} of ${results.length})` : `\nshop test passed (${results.length} checks)`);
process.exit(failed ? 1 : 0);
