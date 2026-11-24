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
// (a photograph, wider than tall: it is cut square before it leaves the browser)
const PHOTO = await require('sharp')({ create: { width: 800, height: 600, channels: 3, background: '#8a5a2b' } }).jpeg().toBuffer();

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

// a stand-in for Stripe: it hands out payment pages
const asked = [];
const stripe = http.createServer((req, res) => {
  let text = '';
  req.on('data', (d) => { text += d; });
  req.on('end', () => {
    const form = new URLSearchParams(text);
    asked.push(form);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // (a form to show inside the game has no page of its own: a secret for Stripe's script instead)
    res.end(JSON.stringify(form.get('ui_mode') === 'embedded' ? { id: `cs_test_${asked.length}`, client_secret: `cs_secret_${asked.length}` } : { id: `cs_test_${asked.length}`, url: `https://checkout.stripe.test/pay/${asked.length}` }));
  });
});
await new Promise((resolve) => stripe.listen(STRIPE_PORT, '127.0.0.1', resolve));

await build({ root: ROOT, logLevel: 'error', define: { __TEST__: 'true' } }); // (__TEST__: the game leaves window.__mmf on the page, as in development)
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
/** Stripe tells the server something (an event of its own). */
const tell = async (event) => {
  const raw = JSON.stringify(event);
  return (await fetch(`${BASE}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': await signWebhook(HOOK, raw) }, body: raw })).status;
};
// (`bid`: { amount, pay } for a place that is auctioned — what Stripe says was paid, and the payment to give back one day;
// `customer`: who pays, for what is paid by the month)
const pay = (item, device, sub = null, bid = null, customer = null) => tell({ type: 'checkout.session.completed', data: { object: { payment_status: 'paid', subscription: sub, customer, ...(bid && { amount_total: bid.amount, payment_intent: bid.pay }), metadata: { item, device } } } });

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
  const card = (id) => page.evaluate((id) => { const c = document.querySelector(`.shop .card[data-item="${id}"]`); return c ? { tag: c.querySelector('.price').textContent, cls: c.className, name: c.querySelector('.foot b').textContent, picture: !!c.querySelector('canvas') } : null; }, id);
  const pick = async (id) => { await page.evaluate((id) => document.querySelector(`.shop .card[data-item="${id}"]`).click(), id); return page.evaluate(() => ({ title: document.querySelector('.shop .detail h3').textContent, acts: [...document.querySelectorAll('.shop .detail .acts button')].map((b) => b.textContent), fine: document.querySelector('.shop .detail .fine').textContent })); };

  // ---- a visitor: the item shop — everything that is sold, with its price; a hat is bought
  await enter();
  await page.waitForFunction(() => document.querySelector('.shop-icon').classList.contains('selling'), null, { timeout: 20000 });
  await page.click('.shop-icon');
  await page.waitForSelector('.shop.on', { timeout: 20000 });
  await frames(3);
  await page.screenshot({ path: path.join(ROOT, 'tools/preview/shop-screen.png') });
  const shelves = await page.evaluate(() => ({ titles: [...document.querySelectorAll('.shop .shelf h3')].map((h) => h.textContent), cards: document.querySelectorAll('.shop .card').length, mode: document.querySelector('.shop .mode').textContent }));
  const crown = await card('hat:crown'), jet = await card('jetpack'), lite = await card('jetlite'), gold = await card('paint:gold'), bubbles = await card('trail:bubbles'), fire = await card('fireworks');
  const device = await page.evaluate(() => localStorage.getItem('mmf.device'));
  check('the item shop: its own icon, shelves of cards with a picture and a price — two jetpacks ($30, $5), hats, paints, trails, fireworks',
    shelves.titles.join() === 'Game Pass,Gear,Paint jobs,Just for fun,Hats,Trails,Sponsor a game' && shelves.cards >= 26 && /Test mode/.test(shelves.mode) && crown?.tag === '$9.99' && crown.picture && /legendary/.test(crown.cls)
    && jet?.tag === '$30' && lite?.tag === 'Free today' && gold?.tag === '$19' && bubbles?.tag === '$5' && fire?.tag === '$15', // (the light jetpack: a taste of it on the first day)
    JSON.stringify({ shelves, crown, jet, lite, gold, bubbles, fire }));
  const offer = await pick('hat:crown');
  const worn = await page.evaluate(() => window.__mmf.me.look?.hat);
  await Promise.all([page.waitForURL('https://checkout.stripe.test/**', { timeout: 20000 }), page.click('.shop .detail .acts .buy')]);
  check('a hat that is not theirs can be bought, not worn; the button leads to the payment page of Stripe', offer.title === 'Crown' && offer.acts.join() === 'Buy · $9.99' && /Test mode/.test(offer.fine) && worn === 0 && asked[0]?.get('metadata[item]') === 'hat:crown' && asked[0].get('metadata[device]') === device && asked[0].get('line_items[0][price_data][unit_amount]') === '999' && asked[0].get('mode') === 'payment', JSON.stringify({ offer, worn, asked: String(asked[0]).slice(0, 300) }));
  // (Stripe says it was paid; the visitor comes back: the hat is on their head at once)
  const hook = await pay('hat:crown', device);
  await enter('&paid=hat%3Acrown');
  await page.waitForFunction(() => window.__mmf.me.look?.hat === 6, null, { timeout: 30000 });
  await page.click('.shop-icon');
  await page.waitForSelector('.shop.on', { timeout: 20000 });
  const got = await pick('hat:crown'), crown2 = await card('hat:crown'), cowboy = await card('hat:cowboy');
  await page.click('.shop .detail .acts button'); // (take it off)
  await frames(3);
  const off = await page.evaluate(() => ({ hat: window.__mmf.me.look?.hat, tag: document.querySelector('.shop .card[data-item="hat:crown"] .price').textContent, url: location.search }));
  // the light jetpack: bought, it flies — a third as long as the real one
  await pay('jetlite', device);
  await page.evaluate(() => window.__mmf.refreshShop());
  const tank = await page.evaluate(() => { const a = window.__mmf; return { tank: a.player.tank, lite: a.shop.owns('jetlite'), full: a.shop.owns('jetpack'), canFly: a.player.canFly(a.player.pos), tag: document.querySelector('.shop .card[data-item="jetlite"] .price').textContent }; });
  await page.keyboard.press('Escape');
  await frames(3);
  const closed = await page.evaluate(() => !document.querySelector('.shop').classList.contains('on'));
  check('back from the payment page the hat is theirs and on their head; it comes off and goes back on in the shop; the others are still for sale', hook === 200 && got.acts.join() === 'Take it off' && crown2.tag === 'Equipped' && cowboy.tag === '$9.99' && off.hat === 0 && off.tag === 'Owned' && !/paid/.test(off.url) && closed, JSON.stringify({ got, crown2, cowboy, off, closed }));
  check('the light jetpack is on as soon as it is theirs, with its small tank (a third of a second of thrust)', tank.lite && !tank.full && tank.canFly && Math.abs(tank.tank - 0.3) < 0.01 && tank.tag === 'Equipped', JSON.stringify(tank));

  // ---- a sponsor: the panel of the shooting gallery goes to the highest bidder, from a dollar
  const slot = await page.evaluate(() => { const m = window.__mmf, s = m.world.sponsorSlots.find((q) => q.id === 'board:shoot'); m.player.teleport(s.x, s.z, 0); return { x: s.x, z: s.z }; });
  await frames(8);
  const free = await prompts();
  await page.keyboard.press('KeyE');
  await page.waitForSelector('.chooser.on .fields', { timeout: 20000 });
  const bidForm = await page.evaluate(() => ({ title: document.querySelector('.chooser h2').textContent, lead: document.querySelector('.chooser .lead').textContent, value: document.querySelector('.chooser .fields input').value, save: document.querySelector('.chooser .fields .save').textContent }));
  await page.locator('.chooser .fields input').first().fill('3');
  asked.length = 0;
  await Promise.all([page.waitForURL('https://checkout.stripe.test/**', { timeout: 20000 }), page.click('.chooser .fields .save')]);
  const bidAsked = asked[0];
  // (Stripe says the bid was paid; the visitor comes back: the panel is theirs)
  await pay('board:shoot', device, null, { amount: 300, pay: 'pi_shoptest_1' });
  await enter('&paid=board%3Ashoot');
  await page.waitForFunction(() => window.__mmf.shop.slots['board:shoot']?.mine, null, { timeout: 30000 });
  await page.evaluate(() => { const m = window.__mmf, s = m.world.sponsorSlots.find((q) => q.id === 'board:shoot'); m.player.teleport(s.x, s.z, 0); });
  await frames(8);
  const mine = await prompts();
  // the same auction from the shop: a shelf with the panel of every game
  await page.click('.shop-icon');
  await page.waitForSelector('.shop.on', { timeout: 20000 });
  const shelf = await page.evaluate(() => ({ title: [...document.querySelectorAll('.shop .shelf h3')].map((h) => h.textContent).pop(), cards: [...document.querySelectorAll('.shop .shelf-sponsor .card')].map((c) => `${c.querySelector('.foot b').textContent}|${c.querySelector('.price').textContent}`) }));
  await page.evaluate(() => document.querySelector('.shop .card[data-item="board:mole"]').click());
  await page.evaluate(() => { const sh = document.querySelector('.shop .shelves'); sh.scrollTop = sh.scrollHeight; });
  await frames(2);
  await page.screenshot({ path: path.join(ROOT, 'tools/preview/shop-sponsors.png') });
  const moleAct = await page.evaluate(() => [...document.querySelectorAll('.shop .detail .acts button')].map((b) => b.textContent));
  await page.keyboard.press('Escape');
  await frames(3);
  check('the panel of a game is auctioned: "Sponsor … · from $1" at its board, a bid typed in, paid once on Stripe; then "Set up your panel"',
    free.includes('Sponsor this game · from $1') && /Bullseye Alley/.test(bidForm.title) && /refunded in full/.test(bidForm.lead) && bidForm.value === '1' && bidForm.save === 'Go to payment'
    && bidAsked?.get('metadata[item]') === 'board:shoot' && bidAsked.get('metadata[bid]') === '300' && bidAsked.get('line_items[0][price_data][unit_amount]') === '300' && bidAsked.get('mode') === 'payment' && mine.includes('Set up your panel'),
    JSON.stringify({ free, bidForm, asked: String(bidAsked).slice(0, 200), mine, slot }));
  check('the shop has a shelf to sponsor a game: the panel of each, what it went for, a button to bid',
    shelf.title === 'Sponsor a game' && shelf.cards.length === 14 && shelf.cards.includes('Flappy Robot|From $1') && shelf.cards.includes('Meltdown Run|From $1') && shelf.cards.includes('Shell Shock|From $1') && shelf.cards.includes('Bullseye Alley|Owned') && shelf.cards.includes('Whack-a-Mole|From $1') && moleAct.join() === 'Bid · from $1', JSON.stringify({ shelf, moleAct }));
  await page.keyboard.press('KeyE');
  await page.waitForSelector('.chooser.on .fields', { timeout: 20000 });
  const inputs = page.locator('.chooser .fields input');
  await inputs.nth(0).fill('Acme <b>Robotics</b>');
  await inputs.nth(1).fill('Friendly machines since 1999');
  await inputs.nth(2).fill('https://acme.example/');
  await inputs.nth(3).setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: LOGO });
  await page.click('.chooser .fields .save');
  await page.waitForFunction(() => window.__mmf.shop.slots['board:shoot']?.state === 'live', null, { timeout: 20000 });
  const sent = await page.evaluate(() => ({ view: window.__mmf.shop.slots['board:shoot'], note: document.querySelector('.hud .note')?.textContent }));
  const publicView = await (await fetch(`${BASE}/api/shop`)).json();
  check('the holder fills the panel in (name, line, link, logo): it is shown at once, to everyone — nothing waits for approval', sent.view.title === 'Acme b Robotics /b' && sent.view.url === 'https://acme.example/' && !!sent.view.logo && !sent.view.draft && /shown to everyone/.test(sent.note || '') && publicView.slots['board:shoot'].state === 'live' && publicView.slots['board:shoot'].title === 'Acme b Robotics /b', JSON.stringify({ sent, publicView: publicView.slots }));

  // ---- as everybody sees it: its link, its logo — a picture and nothing else
  await frames(10);
  const live = await page.evaluate(() => ({ view: window.__mmf.shop.slots['board:shoot'], prompts: [...document.querySelectorAll('.prompt.on span')].map((e) => e.textContent) }));
  const logo = await fetch(`${BASE}${live.view.logo}`);
  check('the panel as everybody sees it: its holder may change it or follow its link; its logo is served as a picture and nothing else', live.prompts.includes('Set up your panel') && live.prompts.includes('Visit Acme b Robotics /b') && logo.status === 200 && logo.headers.get('content-type') === 'image/png' && logo.headers.get('x-content-type-options') === 'nosniff', JSON.stringify({ live, logo: logo.status }));
  await page.screenshot({ path: path.join(ROOT, 'tools/preview/shop-panel.png') });

  // ---- the Trading Post: every game on a card, with who sponsors it; a free panel is bid for from there
  await page.evaluate(() => window.__mmf.adminKey(''));
  await page.evaluate(() => { const m = window.__mmf, a = m.world.games.notices.ads; m.player.teleport(a.x, a.z, Math.PI); });
  await frames(8);
  const postAsk = await prompts();
  await page.keyboard.press('KeyE');
  await page.waitForSelector('.trading.on', { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('.tp-card canvas').length >= 14, null, { timeout: 120000 });
  const post = await page.evaluate(() => {
    const card = (id) => { const c = document.querySelector(`.tp-card[data-id="${id}"]`); return c && { cls: c.className, tag: c.querySelector('.tp-tag').textContent, who: c.querySelector('.tp-who').textContent, logo: c.querySelector('.tp-logo')?.getAttribute('src') || '', price: c.querySelector('.tp-price')?.textContent || '', acts: [...c.querySelectorAll('.tp-acts button')].map((b) => b.textContent) }; };
    return { shoot: card('board:shoot'), mole: card('board:mole'), count: document.querySelector('.tp-count').textContent, wheel: [...document.querySelectorAll('.tp-extra')].map((x) => x.textContent).find((t) => /big wheel/.test(t)) || '', markup: !!document.querySelector('.tp-who b b') };
  });
  await page.screenshot({ path: path.join(ROOT, 'tools/preview/shop-trading.png') });
  await page.evaluate(() => [...document.querySelectorAll('.tp-card[data-id="board:mole"] .tp-acts button')].find((b) => /^Sponsor/.test(b.textContent)).click());
  await page.waitForSelector('.chooser.on .fields', { timeout: 20000 });
  const postBid = await page.evaluate(() => ({ title: document.querySelector('.chooser h2').textContent, open: !!document.querySelector('.trading.on') }));
  await page.keyboard.press('Escape');
  await frames(3);
  check('the Trading Post shows who sponsors what: the holder of a panel sees theirs with its logo, a free game says from how much — and its button asks for a bid',
    postAsk.includes('The games and their sponsors') && /is-mine/.test(post.shoot.cls) && post.shoot.tag === 'Yours' && /Acme b Robotics \/b/.test(post.shoot.who) && post.shoot.logo === live.view.logo && !post.markup
    && /is-free/.test(post.mole.cls) && post.mole.price === 'From $1' && post.mole.acts.join() === 'Sponsor this game · from $1' && /^1 of 14 games sponsored$/.test(post.count) && /24 free · \$29 a month/.test(post.wheel)
    && postBid.title === 'Sponsor Whack-a-Mole' && !postBid.open, JSON.stringify({ postAsk, post, postBid }));

  // ---- a gondola, at the stand of the wheel
  await page.evaluate(() => { const m = window.__mmf, b = m.world.pier.sponsorBooth; m.player.teleport(b[0], b[1], 0); });
  await frames(8);
  const stand = await prompts();
  await page.keyboard.press('KeyE');
  await page.waitForSelector('.chooser.on', { timeout: 20000 });
  const cars = await page.evaluate(() => [...document.querySelectorAll('.chooser .list button')].map((b) => b.textContent));
  check('the stand of the wheel lists its twenty-four gondolas, free at $29 a month', stand.includes('The gondolas and their sponsors') && cars.length === 24 && /Gondola 7/.test(cars[6]) && /Free · \$29 a month/.test(cars[6]), JSON.stringify({ stand, cars: cars.slice(5, 8) }));
  // ---- a plaque for a companion, round the plinth of the golden dog: bought at a bare plate, engraved by who paid, approved, read by all
  await page.keyboard.press('Escape');
  await frames(3);
  await page.evaluate(() => window.__mmf.adminKey(''));
  const atPlate = (n) => page.evaluate((n) => { const m = window.__mmf, q = m.world.places.plaques, w = q.where(n), yaw = Math.atan2(w.x - w.sx, w.z - w.sz); m.player.teleport(w.sx, w.sz, yaw); m.player.pos.y = q.y; m.rig.snap(m.player.pos, yaw + Math.PI); m.rig.yaw = yaw + Math.PI; m.rig.pitch = -0.04; m.rig.distance = 2.4; return { count: q.count, column: q.columnAt(w.sx, w.sz), row: w.row }; }, n);
  const plates = await atPlate(3);
  await frames(10);
  const bare = await prompts();
  await page.keyboard.press('KeyE');
  await page.waitForSelector('.chooser.on', { timeout: 20000 });
  const plateOffer = await page.evaluate(() => ({ title: document.querySelector('.chooser h2').textContent, lead: document.querySelector('.chooser .lead').textContent, buy: document.querySelector('.chooser .list button').textContent }));
  asked.length = 0;
  await Promise.all([page.waitForURL('https://checkout.stripe.test/**', { timeout: 20000 }), page.click('.chooser .list button')]);
  const plateAsked = asked[0];
  await pay('plaque:3', device);
  await enter('&paid=plaque%3A3');
  // (back from the payment page, what goes on the plate is asked for at once)
  await page.waitForSelector('.chooser.on .fields', { timeout: 60000 });
  const plateForm = await page.evaluate(() => ({ title: document.querySelector('.chooser h2').textContent, labels: [...document.querySelectorAll('.chooser .fields label span')].map((e) => e.textContent) }));
  const words = page.locator('.chooser .fields input');
  await words.nth(0).fill('Milou');
  await words.nth(1).fill('2009 – 2024 · he loved the sea');
  await words.nth(2).setInputFiles({ name: 'milou.jpg', mimeType: 'image/jpeg', buffer: PHOTO });
  await page.click('.chooser .fields .save');
  await page.waitForFunction(() => window.__mmf.shop.slots['plaque:3']?.draft && window.__mmf.world.places.plaques.peek(3)?.pending, null, { timeout: 30000 });
  const engraving = await page.evaluate(() => { const m = window.__mmf, p = m.world.places.plaques.peek(3); return { title: p.title, pending: p.pending, picture: p.logo ? `${p.logo.width}x${p.logo.height}` : null, draft: m.shop.slots['plaque:3'].draft }; });
  const plateOthers = (await (await fetch(`${BASE}/api/shop`)).json()).slots['plaque:3'];
  await page.evaluate((key) => window.__mmf.adminKey(key), ADMIN_KEY);
  await atPlate(3);
  await page.waitForFunction(() => [...document.querySelectorAll('.prompt.on span')].some((e) => /^Approve "Milou"/.test(e.textContent)), null, { timeout: 20000 });
  const plateAsks = await prompts();
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__mmf.shop.slots['plaque:3']?.state === 'live' && typeof window.__mmf.world.places.plaques.peek(3)?.logo === 'string', null, { timeout: 20000 });
  await frames(20);
  await new Promise((r) => setTimeout(r, 1500)); // (its picture is fetched, then the plate is painted again)
  await frames(6);
  const plateLive = await page.evaluate(() => { const m = window.__mmf, q = m.world.places.plaques; return { plate: q.peek(3), painted: q.painted, neighbour: q.peek(4) }; });
  const platePic = await fetch(`${BASE}${plateLive.plate.logo}`);
  await page.screenshot({ path: path.join(ROOT, 'tools/preview/shop-plaque.png') });
  check('a plaque for a companion: at a bare plate round the golden dog, "… for your companion · $20", paid once on Stripe; back from the payment page their name, a few words and their picture are asked for at once',
    plates.count === 72 && plates.row === 'upper' && bare[0] === 'The upper plate, for your companion · $20' && bare[1] === 'The lower plate, for your companion · $20' && plateOffer.title === 'A plaque for a companion' && /for as long as the fair stands/.test(plateOffer.lead) && /^Buy it · \$20/.test(plateOffer.buy)
    && plateAsked?.get('metadata[item]') === 'plaque:3' && plateAsked.get('line_items[0][price_data][unit_amount]') === '2000' && plateAsked.get('mode') === 'payment'
    && plateForm.title === 'Their plaque' && plateForm.labels.length === 3 && /Their name/.test(plateForm.labels[0]) && /Their picture/.test(plateForm.labels[2]),
    JSON.stringify({ plates, bare, plateOffer, asked: String(plateAsked).slice(0, 200), plateForm }));
  check('the plate awaits approval: its holder sees it as it will be (marked so), nobody else does; approved by the administrator standing there, it is engraved for all, with the picture',
    engraving.title === 'Milou' && engraving.pending === true && engraving.picture === '256x256' && !engraving.draft.url && plateOthers?.state === 'taken' && !plateOthers.title
    && plateAsks[0] === 'Approve "Milou"' && plateAsks[1] === 'Refuse it' && plateLive.plate.title === 'Milou' && !plateLive.plate.pending && plateLive.painted && plateLive.neighbour === null
    && platePic.status === 200 && platePic.headers.get('content-type') === 'image/jpeg',
    JSON.stringify({ engraving, plateOthers, plateAsks, plateLive, pic: platePic.status }));
  // ---- an account: made from the settings; what was bought, and the look, follow to another browser
  await page.keyboard.press('Escape');
  await frames(3);
  await page.evaluate(() => window.__mmf.equip('hat:crown', true));
  await page.click('[data-act="settings"]');
  const guestSays = await page.evaluate(() => document.querySelector('.acct-info').textContent);
  await page.click('.acct-acts .main');
  await page.waitForSelector('.account.on .sheet[data-mode="create"]', { timeout: 20000 });
  // (what is plainly wrong is said under its field, and nothing is sent)
  await page.fill('.account input[name="name"]', 'x');
  await page.fill('.account input[name="password"]', 'short');
  await page.click('.account .submit');
  const refused = await page.evaluate(() => ({ name: document.querySelector('.account .f-name small').textContent, bad: document.querySelector('.account .f-name').classList.contains('bad'), open: document.querySelector('.account').classList.contains('on'), made: window.__mmf.account.name }));
  await page.fill('.account input[name="name"]', 'Shop Tester');
  await page.fill('.account input[name="password"]', 'correct horse battery');
  await page.fill('.account input[name="again"]', 'correct horse battery');
  const typed = await page.evaluate(() => ({ level: document.querySelector('.account .meter').dataset.level, same: document.querySelector('.account .f-again small').textContent, tab: document.querySelector('.account .tabs .on').textContent }));
  await page.screenshot({ path: path.join(ROOT, 'tools/preview/account-create.png') });
  await page.click('.account .submit');
  await page.waitForSelector('.account .sheet.is-done', { timeout: 30000 });
  const code = await page.evaluate(() => document.querySelector('.account .done code').textContent);
  await page.click('.account .done .ok');
  await page.waitForFunction(() => !document.querySelector('.account').classList.contains('on'), null, { timeout: 20000 });
  await page.click('[data-act="settings"]');
  const signed = await page.evaluate(() => ({ name: window.__mmf.account.name, says: document.querySelector('.acct-info').textContent, acts: [...document.querySelectorAll('.acct-acts button')].map((b) => b.textContent) }));
  await page.click('[data-act="settings"]');
  await new Promise((r) => setTimeout(r, 2200)); // (the look is kept a moment after it changes)
  // another browser: a guest with nothing; signed in, everything is there
  const other = await browser.newContext({ viewport: { width: 960, height: 560 }, deviceScaleFactor: 1 });
  const page2 = await other.newPage();
  page2.on('pageerror', (e) => logs.push(e.message));
  await page2.goto(`${BASE}/?q=${opt.q || 'low'}`);
  await page2.waitForSelector('.card.ready', { timeout: 240000 });
  await page2.click('.go');
  await page2.waitForFunction(() => window.__mmf && window.__mmf.ready && window.__mmf.player && window.__mmf.shop.open, null, { timeout: 60000 });
  const asGuest = await page2.evaluate(() => ({ owned: [...window.__mmf.shop.owned], hat: window.__mmf.me.look.hat, account: window.__mmf.account.name }));
  await page2.click('[data-act="settings"]');
  await page2.evaluate(() => [...document.querySelectorAll('.acct-acts button')].find((b) => b.textContent === 'Sign in').click());
  await page2.waitForSelector('.account.on .sheet[data-mode="login"]', { timeout: 20000 });
  // (a wrong password is said on the card, which stays open)
  await page2.fill('.account input[name="name"]', 'shop tester');
  await page2.fill('.account input[name="password"]', 'not the password');
  await page2.press('.account input[name="password"]', 'Enter');
  await page2.waitForFunction(() => document.querySelector('.account .error').textContent.length > 0, null, { timeout: 30000 });
  const wrongPass = await page2.evaluate(() => ({ says: document.querySelector('.account .error').textContent, open: document.querySelector('.account').classList.contains('on'), who: window.__mmf.account.name }));
  await page2.fill('.account input[name="password"]', 'correct horse battery');
  await page2.press('.account input[name="password"]', 'Enter');
  await page2.waitForFunction(() => window.__mmf.account.name === 'Shop Tester' && window.__mmf.shop.owned.has('hat:crown'), null, { timeout: 30000 });
  const there = await page2.evaluate(() => { const a = window.__mmf; return { owned: [...a.shop.owned].sort(), hat: a.me.look.hat, tank: a.player.tank, mine: !!a.shop.slots['board:shoot']?.mine }; });
  await other.close();
  check('an account is made from the settings, on a card of its own (a name, a password typed twice and weighed, a recovery code shown once): what is wrong is said under its field; the guest becomes somebody',
    /guest/.test(guestSays) && refused.open && refused.bad && /3 to 16/.test(refused.name) && refused.made === null && Number(typed.level) >= 2 && /The same/.test(typed.same) && typed.tab === 'Create an account'
    && /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/.test(code) && signed.name === 'Shop Tester' && /Signed in as Shop Tester/.test(signed.says) && signed.acts.join() === 'Sign out', JSON.stringify({ guestSays: guestSays.slice(0, 60), refused, typed, code: `${code.slice(0, 4)}…`, signed }));
  check('from another browser: a wrong password is said on the card; signed in, what was bought, the hat that was worn and the panel that is sponsored are all there',
    !asGuest.owned.length && asGuest.hat === 0 && asGuest.account === null && wrongPass.open && wrongPass.who === null && wrongPass.says.length > 5 && there.owned.join() === 'hat:crown,jetlite' && there.hat === 6 && Math.abs(there.tank - 0.3) < 0.01 && there.mine, JSON.stringify({ asGuest, wrongPass, there }));
  // ---- a newcomer: the free day of the light jetpack, then the Game Pass — bought, held, ended
  {
    const third = await browser.newContext({ viewport: { width: 960, height: 560 }, deviceScaleFactor: 1 });
    await third.route('https://checkout.stripe.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>pay</title>the payment page' }));
    const p3 = await third.newPage();
    p3.on('pageerror', (e) => logs.push(e.message));
    const frames3 = (n) => p3.evaluate((n) => { const app = window.__mmf; const target = app.frames + n; return new Promise((res) => { const tick = () => (app.frames >= target ? res() : requestAnimationFrame(tick)); tick(); }); }, n);
    const card3 = (id) => p3.evaluate((id) => { const c = document.querySelector(`.shop .card[data-item="${id}"]`); return c ? c.querySelector('.price').textContent : null; }, id);
    const pick3 = async (id) => { await p3.evaluate((id) => document.querySelector(`.shop .card[data-item="${id}"]`).click(), id); return p3.evaluate(() => ({ acts: [...document.querySelectorAll('.shop .detail .acts button')].map((b) => b.textContent), perks: document.querySelectorAll('.shop .detail ul.perks li').length, why: document.querySelector('.shop .detail p.why')?.textContent || '' })); };
    await p3.goto(`${BASE}/?q=${opt.q || 'low'}`);
    await p3.waitForSelector('.card.ready', { timeout: 240000 });
    // the welcome card: the colours and the sizes of the pass are shown, with a padlock
    await p3.waitForFunction(() => document.querySelectorAll('.splash .swatches button.locked').length === 16, null, { timeout: 30000 });
    await p3.click('.splash .swatches button.extra');
    await p3.click('.splash .sizes button:nth-child(3)');
    const card0 = await p3.evaluate(() => ({ sizes: document.querySelectorAll('.splash .sizes button.locked').length, picked: [...document.querySelectorAll('.splash .swatches button')].findIndex((b) => b.getAttribute('aria-pressed') === 'true'), size: document.querySelector('.splash .sizes button[aria-pressed="true"]')?.textContent || '', hint: document.querySelector('.splash .passhint').hidden ? '' : document.querySelector('.splash .passhint').textContent }));
    await p3.click('.go');
    await p3.waitForFunction(() => window.__mmf && window.__mmf.ready && window.__mmf.player && window.__mmf.shop.open, null, { timeout: 60000 });
    const dev3 = await p3.evaluate(() => localStorage.getItem('mmf.device'));
    const day1 = await p3.evaluate(() => { const a = window.__mmf; return { color: a.me.colorIndex, size: a.me.size, lent: a.shop.lent('jetlite'), has: a.shop.has('jetlite'), canFly: a.player.canFly(a.player.pos), tank: a.player.tank, hours: a.shop.trialLeft('jetlite') / 3600_000, pass: a.shop.hasPass }; });
    check('a newcomer: the colours and the sizes of the Game Pass are locked on the welcome card (a word says why); the light jetpack is theirs for a day',
      card0.sizes === 3 && card0.picked < 16 && card0.size === 'Classic' && /Game Pass/.test(card0.hint) && day1.color < 16 && day1.size === 1 && !day1.pass && day1.lent === 'trial' && !day1.has && day1.canFly && Math.abs(day1.tank - 0.3) < 0.01 && day1.hours > 23 && day1.hours <= 24,
      JSON.stringify({ card0, day1 }));
    // the pass in the shop: what it gives, what it costs; the button leads to Stripe, by the month
    await p3.click('.shop-icon');
    await p3.waitForSelector('.shop.on', { timeout: 20000 });
    const tag0 = await card3('pass'), liteTag = await card3('jetlite'), offer3 = await pick3('pass');
    asked.length = 0;
    await Promise.all([p3.waitForURL('https://checkout.stripe.test/**', { timeout: 20000 }), p3.click('.shop .detail .acts .buy')]);
    const form3 = asked[0];
    check('the Game Pass has its own shelf: what it gives, a word from who makes the game, $19 a month — paid on Stripe as a subscription',
      tag0 === '$19 a month' && liteTag === 'Free today' && offer3.acts.join() === 'Get the pass · $19 a month' && offer3.perks === 5 && /guy on a couch/.test(offer3.why)
      && form3?.get('mode') === 'subscription' && form3.get('line_items[0][price_data][unit_amount]') === '1900' && form3.get('line_items[0][price_data][recurring][interval]') === 'month' && form3.get('metadata[item]') === 'pass' && form3.get('metadata[device]') === dev3,
      JSON.stringify({ tag0, liteTag, offer3, form: form3?.toString().slice(0, 220) }));
    // Stripe says it was paid; back in the game: black, the largest size, a hat that was never bought
    const paid3 = await pay('pass', dev3, 'sub_pass_shop', null, 'cus_shop');
    await p3.goto(`${BASE}/?q=${opt.q || 'low'}&paid=pass`);
    await p3.waitForSelector('.card.ready', { timeout: 240000 });
    await p3.waitForFunction(() => document.querySelectorAll('.splash .swatches button.locked').length === 0 && document.querySelectorAll('.splash .sizes button.locked').length === 0, null, { timeout: 30000 });
    await p3.evaluate(() => document.querySelectorAll('.splash .swatches button')[16].click());
    await p3.click('.splash .sizes button:nth-child(4)'); // (the largest: Titan)
    await p3.click('.go');
    await p3.waitForFunction(() => window.__mmf && window.__mmf.ready && window.__mmf.player && window.__mmf.shop.pass, null, { timeout: 60000 });
    await frames3(6);
    await p3.click('.shop-icon');
    await p3.waitForSelector('.shop.on', { timeout: 20000 });
    const hatTag = await card3('hat:viking'), hat3 = await pick3('hat:viking');
    await p3.evaluate(() => document.querySelector('.shop .detail .acts button').click()); // (Equip)
    await frames3(3);
    const passTag = await card3('pass'), held3 = await pick3('pass');
    await p3.keyboard.press('Escape');
    await frames3(4);
    const with3 = await p3.evaluate(() => { const a = window.__mmf; return { color: a.me.colorIndex, size: a.me.size, hat: a.me.look.hat, lite: a.shop.lent('jetlite'), pass: a.shop.hasPass, told: [...document.querySelectorAll('.chat .log p')].map((e) => e.textContent).join(' | ') + ' ' + document.querySelector('.hud .note').textContent }; });
    check('with the pass: black and the largest size are picked on the welcome card, every hat can be worn without being bought, the light jetpack is lent; the pass says it is active',
      paid3 === 200 && with3.color === 16 && Math.abs(with3.size - 1.2) < 0.01 && hatTag === 'With your pass' && hat3.acts.join() === 'Equip,Keep it · $9.99' && with3.hat === 9 && with3.lite === 'pass' && with3.pass && passTag === 'Active' && /Look after it/.test(held3.acts.join()),
      JSON.stringify({ paid3, with3: { ...with3, told: with3.told.slice(-160) }, hatTag, hat3, passTag, held3 }));
    // the subscription ends: back to everybody's colours, the usual size, bare-headed — and they are told
    const ended3 = await tell({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_pass_shop' } } });
    await p3.evaluate(() => window.__mmf.refreshShop());
    await frames3(6);
    const after3 = await p3.evaluate(() => { const a = window.__mmf; return { color: a.me.colorIndex, size: a.me.size, hat: a.me.look.hat, pass: a.shop.hasPass, lite: a.shop.lent('jetlite'), told: [...document.querySelectorAll('.chat .log p')].map((e) => e.textContent).filter((t) => /has ended/.test(t)).length }; });
    // …and a day later the taste of the jetpack is over too: asked for in the air, it says where to get one
    await p3.evaluate(() => { const real = Date.now.bind(Date); Date.now = () => real() + 25 * 3600_000; });
    await p3.evaluate(() => window.__mmf.refreshShop());
    await p3.evaluate(() => document.getElementById('view')?.focus());
    const over3 = await p3.evaluate(() => { const a = window.__mmf; return { lent: a.shop.lent('jetlite'), canFly: a.player.canFly(a.player.pos) }; });
    // (a jump, then "jump" again in the air: driven frame by frame, as the walk test does)
    const said3 = await p3.evaluate(() => {
      const a = window.__mmf, { input, player } = a;
      for (let k = 0; k < 400 && !player.noJet; k++) { input.jump = k === 0 || (k > 3 && !player.grounded); player.update(1 / 60, 0, true); }
      return { noJet: player.noJet, grounded: player.grounded };
    });
    await frames3(4);
    const note3 = await p3.evaluate(() => document.querySelector('.hud .note').textContent);
    await third.close();
    check('when the subscription ends the pass is handed back (colour, size, hat) and they are told; a day after the first visit the free jetpack is over, and asking for it says where to get one',
      ended3 === 200 && after3.color === 0 && after3.size === 1 && after3.hat === 0 && !after3.pass && after3.lite === 'trial' && after3.told === 1 && over3.lent === null && !over3.canFly && said3.noJet && /free day with the jetpack is over/.test(note3) && /Jetpack Lite is \$5/.test(note3) && /Game Pass/.test(note3),
      JSON.stringify({ ended3, after3, over3, said3, note3 }));
  }
  // ---- paying without leaving the game: a server that was given Stripe's publishable key (Stripe's script is a stand-in here)
  {
    const PORT2 = PORT + 2, BASE2 = `http://127.0.0.1:${PORT2}`, STORE2 = path.join(ROOT, 'tools/preview/shop-test-store2.json');
    fs.rmSync(STORE2, { force: true });
    const server2 = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
      env: { ...process.env, PORT: String(PORT2), HOST: '127.0.0.1', ADMIN_KEY, STRIPE_SECRET_KEY: STRIPE_KEY, STRIPE_WEBHOOK_SECRET: HOOK, STRIPE_PUBLISHABLE_KEY: 'pk_test_shoptest', STRIPE_API: `http://127.0.0.1:${STRIPE_PORT}`, SCORES_FILE: STORE2 },
      stdio: 'ignore',
    });
    try {
      for (let i = 0; i < 300; i++) { try { if ((await fetch(`${BASE2}/healthz`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }
      const fourth = await browser.newContext({ viewport: { width: 960, height: 560 }, deviceScaleFactor: 1 });
      await fourth.route('https://checkout.stripe.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>pay</title>the payment page' }));
      // (their script: it shows a form for the secret it is given, and says when it is paid)
      let fetched = 0;
      await fourth.route('https://js.stripe.com/**', (route) => {
        fetched++;
        return route.fulfill({ contentType: 'application/javascript', body: `window.Stripe = (pk) => ({ initEmbeddedCheckout: async ({ fetchClientSecret, onComplete }) => { if (window.__breakStripe) throw new Error('their form is down'); const secret = await fetchClientSecret(); window.__pay = { pk, secret, onComplete, mounted: false, destroyed: false }; return { mount(el) { window.__pay.mounted = true; el.innerHTML = '<p class="stub">card form for ' + secret + '</p>'; }, destroy() { window.__pay.destroyed = true; } }; } });` });
      });
      const p4 = await fourth.newPage();
      p4.on('pageerror', (e) => logs.push(e.message));
      await p4.goto(`${BASE2}/?q=${opt.q || 'low'}`);
      await p4.waitForSelector('.card.ready', { timeout: 240000 });
      await p4.click('.go');
      await p4.waitForFunction(() => window.__mmf && window.__mmf.ready && window.__mmf.player && window.__mmf.shop.open, null, { timeout: 60000 });
      const dev4 = await p4.evaluate(() => localStorage.getItem('mmf.device'));
      await p4.click('.shop-icon');
      await p4.waitForSelector('.shop.on', { timeout: 20000 });
      await p4.evaluate(() => document.querySelector('.shop .card[data-item="hat:cowboy"]').click());
      const before4 = fetched;
      asked.length = 0;
      await p4.click('.shop .detail .acts .buy');
      await p4.waitForSelector('.pay.on .stub', { timeout: 30000 });
      const form4 = await p4.evaluate(() => ({ pay: { pk: window.__pay.pk, secret: window.__pay.secret, mounted: window.__pay.mounted }, text: document.querySelector('.pay .pay-form').textContent, mode: document.querySelector('.pay .pay-mode').textContent, url: location.href, shopBehind: document.querySelector('.shop').classList.contains('on') }));
      await p4.screenshot({ path: path.join(ROOT, 'tools/preview/shop-pay.png') });
      const asked4 = asked[0];
      // (Stripe tells the server it was paid, and its script tells the page: the card closes, the hat arrives — the page never left)
      const raw = JSON.stringify({ type: 'checkout.session.completed', data: { object: { payment_status: 'paid', subscription: null, customer: null, metadata: { item: 'hat:cowboy', device: dev4 } } } });
      await fetch(`${BASE2}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': await signWebhook(HOOK, raw) }, body: raw });
      await p4.evaluate(() => { window.__marker = 1; window.__pay.onComplete(); });
      await p4.waitForFunction(() => window.__mmf.shop.owned.has('hat:cowboy') && window.__mmf.me.look.hat > 0, null, { timeout: 30000 });
      const done4 = await p4.evaluate(() => ({ open: document.querySelector('.pay').classList.contains('on'), destroyed: window.__pay.destroyed, same: window.__marker === 1, hat: window.__mmf.me.look.hat, url: location.href }));
      // when their form cannot be shown: off to Stripe's page, as before
      await p4.evaluate(() => { window.__breakStripe = true; document.querySelector('.shop .card[data-item="hat:pirate"]').click(); });
      asked.length = 0;
      await Promise.all([p4.waitForURL('https://checkout.stripe.test/**', { timeout: 30000 }), p4.click('.shop .detail .acts .buy')]);
      const fall4 = asked.map((f) => f.get('ui_mode') || 'hosted');
      await fourth.close();
      check('with Stripe\'s publishable key the payment form opens on a card inside the game (their script is only fetched then): paid, the card closes and the hat arrives without the page ever leaving; when their form cannot be shown, the visitor goes to Stripe\'s page as before',
        before4 === 0 && fetched === 1 && form4.pay.pk === 'pk_test_shoptest' && /^cs_secret_/.test(form4.pay.secret) && form4.pay.mounted && /card form/.test(form4.text) && /Test mode/.test(form4.mode) && form4.url.startsWith(BASE2) && form4.shopBehind
        && asked4?.get('ui_mode') === 'embedded' && asked4.get('metadata[item]') === 'hat:cowboy' && asked4.get('metadata[device]') === dev4
        && !done4.open && done4.destroyed && done4.same && done4.hat > 0 && done4.url.startsWith(BASE2) && fall4.join() === 'embedded,hosted',
        JSON.stringify({ before4, fetched, form4, asked: String(asked4).slice(0, 160), done4, fall4 }));
    } finally { server2.kill(); }
  }
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
