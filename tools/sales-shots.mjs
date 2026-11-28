// Dev tool: the tab "Sales" of the back office, looked at. Starts the Node server with a stand-in for Stripe
// (tools/lib/stripe.mjs), sells a dozen things of every kind — a hat, the Game Pass over three months, a room, a
// gondola by the month and for good, a plaque, bids — gives some of it back, leaves older sales at Stripe alone
// (for "Fetch what Stripe remembers"), then opens /admin in headless Chromium with the owner's key and takes
// pictures: the tab, the dialog of a refund (all of it, a part, a subscription), the tax code, a telephone.
// usage: node tools/sales-shots.mjs [--out=tools/preview/sales] [--dist=dist]
//        (--dist=public: the page as it is in the sources, without building the site first)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signWebhook } from '../server/stripe.js';
import { freePort } from './lib/net.mjs';
import { standIn } from './lib/stripe.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split(/=(.*)/s).slice(0, 2)));
const OUT = path.resolve(opt.out || path.join(ROOT, 'tools/preview/sales'));
fs.mkdirSync(OUT, { recursive: true });
const ADMIN_KEY = 'sales-shots-owner-key', KEY = 'sk_test_salesshots', HOOK = 'whsec_salesshots', DAY = 86_400_000;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mmf-sales-shots-'));

const stripe = standIn({ key: KEY }), stripePort = await freePort(), fake = await stripe.listen(stripePort);
const port = await freePort(), BASE = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ADMIN_KEY, STRIPE_SECRET_KEY: KEY, STRIPE_WEBHOOK_SECRET: HOOK, STRIPE_API: `http://127.0.0.1:${stripePort}`, SCORES_FILE: path.join(TMP, 'store.json'), MAIL_FILE: path.join(TMP, 'mails.jsonl'), DIST_DIR: path.resolve(ROOT, opt.dist || 'dist'), ADDRESS_LIMITS: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
server.stdout.on('data', (d) => { log += d; });
server.stderr.on('data', (d) => { log += d; });
const stop = () => { try { server.kill('SIGTERM'); } catch { /* gone */ } fake.close(); fs.rmSync(TMP, { recursive: true, force: true }); };
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${BASE}/healthz`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }

const api = async (method, target, body, key = ADMIN_KEY) => { const res = await fetch(`${BASE}${target}`, { method, headers: { ...(key && { Authorization: `Bearer ${key}` }), ...(body && { 'Content-Type': 'application/json' }) }, ...(body && { body: JSON.stringify(body) }) }); return { status: res.status, body: await res.json().catch(() => null) }; };
const hook = async (type, object) => { const raw = JSON.stringify(stripe.event(type, object)); return (await fetch(`${BASE}/api/stripe/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': await signWebhook(HOOK, raw) }, body: raw })).status; };
const dev = (name) => `${name}-browser-0123456789`.slice(0, 24).padEnd(20, '0');
const now = Date.now(), ago = (days, hours = 0) => now - days * DAY - hours * 3600_000;
/** Something is paid, and Stripe says so — every month of it, for what is paid by the month. */
const buy = async (what) => {
  const o = stripe.sell(what);
  await hook('checkout.session.completed', o);
  if (o.subscription) for (const v of [...stripe.invoices.values()].filter((x) => x.subscription === o.subscription && x.billing_reason === 'subscription_cycle').sort((a, b) => a.created - b.created)) await hook('invoice.paid', v);
  return o;
};
let browser = null;
const refund = (id, what) => api('POST', '/api/sales', { refund: id, token: `shots${Math.random().toString(36).slice(2, 14)}`, ...what });

try {
  // ---- the fair, and who buys
  await api('POST', '/api/release', { set: { userRooms: true } });
  await api('POST', '/api/notify', { email: 'owner@example.org' });
  const ada = dev('ada'), bruno = dev('bruno'), chloe = dev('chloe'), dmitri = dev('dmitri'), emma = dev('emma'), acme = dev('acme');
  const account = (device, name, email) => api('POST', '/api/account', { action: 'create', device, name, password: 'a long password', ...(email && { email }) }, '');
  await account(ada, 'Ada Lovelace', 'ada@example.org');
  await account(chloe, 'Chloe', '');
  await account(acme, 'Acme Rockets', 'hello@acme-rockets.example');

  // ---- the past, which only Stripe remembers (before the list was kept)
  for (let i = 0; i < 47; i++) stripe.sell({ item: ['hat:cap', 'hat:straw', 'paint:candy', 'jetlite', 'hat:party', 'fireworks'][i % 6], device: [bruno, emma, dmitri][i % 3], amount: [999, 999, 900, 500, 999, 1500][i % 6], at: ago(170 - i * 2, i % 7), email: ['bruno@example.net', 'emma@example.com', 'dmitri@example.org'][i % 3] });
  stripe.sell({ item: 'pass', device: emma, amount: 1900, monthly: true, months: 4, at: ago(125), email: 'emma@example.com' });
  for (let i = 0; i < 6; i++) stripe.abandon({ item: 'hat:crown', device: bruno, amount: 999, at: ago(100 - i) });

  // ---- what was sold since the list is kept
  const sold = {};
  sold.village = await buy({ item: 'tarp:shoot', device: acme, amount: 9900, monthly: true, months: 2, at: ago(41, 3), email: 'hello@acme-rockets.example' });
  sold.pass = await buy({ item: 'pass', device: ada, amount: 1900, monthly: true, months: 3, at: ago(68, 5), email: 'ada@example.org' });
  sold.room = await buy({ item: 'room', device: ada, amount: 5900, monthly: true, account: 'Ada Lovelace', at: ago(19, 2), email: 'ada@example.org' });
  sold.plaque = await buy({ item: 'plaque:12', device: bruno, amount: 2000, at: ago(17, 6), email: 'bruno@example.net' });
  sold.gondola = await buy({ item: 'gondola:3', device: acme, amount: 2900, monthly: true, at: ago(12, 1), email: 'hello@acme-rockets.example' });
  sold.gondolaLife = await buy({ item: 'gondola:8', device: dmitri, amount: 19900, life: true, at: ago(11, 4), email: 'dmitri@example.org' });
  sold.bid1 = await buy({ item: 'board:spiral', device: chloe, amount: 1200, bid: 1200, at: ago(9, 2), email: 'chloe@example.com' });
  sold.bid2 = await buy({ item: 'board:spiral', device: acme, amount: 2500, bid: 2500, at: ago(8, 7), email: 'hello@acme-rockets.example' }); // (Chloe is outbid: given back by the shop itself)
  sold.jetpack = await buy({ item: 'jetpack', device: bruno, amount: 3000, at: ago(6, 3), email: 'bruno@example.net' });
  sold.crown = await buy({ item: 'hat:crown', device: chloe, amount: 999, at: ago(5, 8), email: 'chloe@example.com' });
  sold.gold = await buy({ item: 'paint:gold', device: emma, amount: 1900, at: ago(4, 2), email: 'emma@example.com' });
  sold.wizard = await buy({ item: 'hat:wizard', device: dmitri, amount: 999, at: ago(3, 5), email: 'dmitri@example.org' });
  sold.lost = await buy({ item: 'gondola:8', device: bruno, amount: 2900, monthly: true, at: ago(2, 9), email: 'bruno@example.net' }); // (somebody has it already)
  sold.tophat = await buy({ item: 'hat:tophat', device: ada, amount: 999, at: ago(1, 4), email: 'ada@example.org' });
  sold.fireworks = await buy({ item: 'fireworks', device: emma, amount: 1500, at: ago(0, 6), email: 'emma@example.com' });
  sold.pirate = await buy({ item: 'hat:pirate', device: chloe, amount: 999, at: ago(0, 2), email: 'chloe@example.com' });
  // …a part given back, a whole given back, a refund made in Stripe itself, a dispute
  await refund(sold.jetpack.id, { amount: 1000, reason: 'A gesture: the jetpack was down for a day' });
  await refund(sold.wizard.id, { all: true, reason: 'Bought twice by mistake' });
  stripe.payments.get(sold.gold.payment_intent).refunded = 1900;
  await hook('charge.refunded', stripe.charge(sold.gold.payment_intent));
  stripe.payments.get(sold.fireworks.payment_intent).disputed = true;
  await hook('charge.dispute.created', { id: 'dp_shots', payment_intent: sold.fireworks.payment_intent, amount: 1500, reason: 'fraudulent', status: 'needs_response' });

  // ---- the back office
  browser = await chromium.launch();
  const problems = [];
  const open = async (width, height, mobile = false) => {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, ...(mobile && { isMobile: true, hasTouch: true }) });
    const page = await context.newPage();
    page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => problems.push(e.message));
    await page.goto(`${BASE}/admin/#sales`);
    await page.fill('#key', ADMIN_KEY);
    await page.click('#login-form button[type="submit"]');
    try { await page.waitForSelector('#sales .sale', { timeout: 15000 }); } catch (err) { await page.screenshot({ path: path.join(OUT, '0-not-opened.png'), fullPage: true }); console.error(JSON.stringify({ problems, tabs: await page.$$eval('#tabs button', (bs) => bs.map((x) => `${x.dataset.tab}:${x.textContent}`)), sales: await page.$eval('#sales', (x) => x.textContent).catch(() => null), hidden: await page.$eval('section[data-tab="sales"]', (x) => x.hidden).catch(() => null) })); throw err; }
    return page;
  };
  const shot = async (page, name, full = true) => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full }); console.log(`${name}.png`); };
  const dialogOf = async (page, what) => { await page.click(`.sale:has(.grow > b:text-is("${what}")) button:text("Refund…")`); await page.waitForFunction(() => !document.getElementById('sale-refund-how').disabled || !document.getElementById('sale-refund-error').hidden, null, { timeout: 15000 }); };

  const page = await open(1240, 900);
  const said = { tab: await page.textContent('#tabs button[data-tab="sales"]'), tabs: await page.$$eval('#tabs button', (bs) => bs.map((b) => b.textContent)), lines: await page.$$eval('#sales .sale', (r) => r.length), tiles: await page.$$eval('#sales-total .tile', (ts) => ts.map((t) => t.textContent)) };
  await shot(page, '1-sales-tab');
  // a refund, all of it: a hat of an account
  await dialogOf(page, 'Top hat');
  await shot(page, '2-refund-all', false);
  // …a part of it
  await page.fill('#sale-refund-amount', '4.50');
  await page.fill('#sale-refund-reason', 'It did not fit');
  await shot(page, '3-refund-part', false);
  // …more than what is left
  await page.fill('#sale-refund-amount', '25');
  await shot(page, '4-refund-too-much', false);
  await page.click('#sale-refund-cancel');
  // …what is paid by the month
  await dialogOf(page, 'Game Pass — monthly');
  await shot(page, '5-refund-game-pass', false);
  await page.check('#sale-refund-keep');
  await shot(page, '6-refund-game-pass-kept', false);
  await page.click('#sale-refund-cancel');
  // …a sponsor's place, and one that was paid for and not given
  await dialogOf(page, 'Gondola 3 — monthly');
  await shot(page, '7-refund-gondola', false);
  await page.click('#sale-refund-cancel');
  await dialogOf(page, 'Gondola 8 — monthly');
  await shot(page, '8-refund-not-given', false);
  await page.click('#sale-refund-cancel');
  // …a part already given back
  await dialogOf(page, 'Jetpack');
  await shot(page, '9-refund-the-rest', false);
  await page.click('#sale-refund-cancel');
  // done for good: the top hat goes back, and the list says so
  await dialogOf(page, 'Top hat');
  await page.fill('#sale-refund-reason', 'Asked for by e-mail');
  await page.click('#sale-refund-go');
  await page.waitForSelector('.toast.on', { timeout: 15000 });
  said.toast = await page.textContent('#toast');
  await page.waitForFunction(() => [...document.querySelectorAll('#sales .sale')].some((r) => r.querySelector('.grow > b')?.textContent === 'Top hat' && /refunded/.test(r.querySelector('.tags')?.textContent || '')), null, { timeout: 15000 });
  await shot(page, '10-after-a-refund', false);
  // the search
  await page.fill('#sales-find', 'acme');
  await page.waitForFunction(() => /match/.test(document.querySelector('#sales-total .tile span')?.textContent || ''), null, { timeout: 15000 });
  await shot(page, '11-search');
  await page.fill('#sales-find', '');
  await page.waitForFunction(() => !/match/.test(document.querySelector('#sales-total .tile span')?.textContent || ''), null, { timeout: 15000 });
  // what Stripe remembers
  said.before = await page.textContent('#sales-total .tile b');
  await page.click('#sales-fetch');
  await page.waitForFunction(() => /^Done/.test(document.getElementById('sales-fetch-said').textContent), null, { timeout: 60000 });
  said.fetched = await page.textContent('#sales-fetch-said');
  await page.waitForFunction((was) => document.querySelector('#sales-total .tile b')?.textContent !== was, said.before, { timeout: 15000 });
  said.after = await page.textContent('#sales-total .tile b');
  await shot(page, '12-fetched-from-stripe');
  await page.click('#sales-more');
  await page.waitForFunction(() => document.querySelectorAll('#sales .sale').length > 50, null, { timeout: 15000 });
  said.older = await page.$$eval('#sales .sale', (r) => r.length);
  // the tax code
  await page.click('#tabs button[data-tab="sponsors"]');
  await page.waitForSelector('#tax-box:not([hidden])', { timeout: 15000 });
  await page.locator('#tax-box').scrollIntoViewIfNeeded();
  await page.locator('#tax-box').screenshot({ path: path.join(OUT, '13-tax-code.png') }); console.log('13-tax-code.png');
  await page.check('input[name="tax-pick"][value="txcd_10201000"]');
  await page.click('#tax-form button[type="submit"]');
  await page.waitForSelector('.toast.on', { timeout: 15000 });
  said.tax = (await api('GET', '/api/tax')).body;
  await page.locator('#tax-box').screenshot({ path: path.join(OUT, '14-tax-code-chosen.png') }); console.log('14-tax-code-chosen.png');
  await page.fill('#tax-code', 'txcd_10103000');
  await page.click('#tax-form button[type="submit"]');
  await page.waitForFunction(() => /off|on/i.test(document.getElementById('tax-said').textContent), null, { timeout: 15000 });
  await page.waitForTimeout(400);
  said.taxOther = (await api('GET', '/api/tax')).body;
  await page.locator('#tax-box').screenshot({ path: path.join(OUT, '15-tax-code-another.png') }); console.log('15-tax-code-another.png');

  // a telephone
  const phone = await open(390, 800, true);
  await shot(phone, '16-phone-sales');
  await phone.click('.sale:has(.grow > b:text-is("Pirate hat")) button:text("Refund…")');
  await phone.waitForFunction(() => !document.getElementById('sale-refund-how').disabled, null, { timeout: 15000 });
  await phone.fill('#sale-refund-amount', '3');
  await shot(phone, '17-phone-refund', false);
  await phone.click('#sale-refund-cancel');
  await phone.click('#tabs button[data-tab="sponsors"]');
  await phone.waitForSelector('#tax-box:not([hidden])', { timeout: 15000 });
  await phone.locator('#tax-box').screenshot({ path: path.join(OUT, '18-phone-tax-code.png') }); console.log('18-phone-tax-code.png');

  // what a named administrator sees: no tab Sales
  const named = (await api('POST', '/api/sales', null, 'nobody')).status;
  console.log(JSON.stringify({ ...said, visitor: named, problems, stripeRefunds: stripe.refunds.length }, null, 1));
} catch (err) {
  console.error(err);
  console.error(log.slice(-2000));
  process.exitCode = 1;
} finally { await browser?.close().catch(() => {}); stop(); }
