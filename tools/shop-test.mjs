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
    // (back from the payment page one is in the world at once, where one stood: there is no card to pass)
    await page.waitForFunction(() => document.querySelector('.card.ready') || (window.__mmf && window.__mmf.ready && document.querySelector('.splash.done')), null, { timeout: 240000 });
    if (await page.evaluate(() => !document.querySelector('.splash.done'))) await page.click('.go');
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
  const crown = await card('hat:crown'), jet = await card('jetpack'), lite = await card('jetlite'), gold = await card('paint:gold'), bubbles = await card('trail:bubbles'), lava = await card('paint:lava'), fire = await card('fireworks');
  const device = await page.evaluate(() => localStorage.getItem('mmf.device'));
  check('the item shop: its own icon, shelves of cards with a picture and a price — two jetpacks ($30, $5), hats, nine paints, fireworks; the trails are no longer sold: nobody who has not bought one sees them',
    shelves.titles.join() === 'Game Pass,Gear,Paint jobs,Just for fun,Hats,Sponsor a game' && shelves.cards >= 26 && /Test mode/.test(shelves.mode) && crown?.tag === '$9.99' && crown.picture && /legendary/.test(crown.cls)
    && jet?.tag === '$30' && lite?.tag === 'Free today' && gold?.tag === '$19' && !bubbles && lava?.tag === '$14' && lava.picture && fire?.tag === '$15', // (the light jetpack: a taste of it on the first day)
    JSON.stringify({ shelves, crown, jet, lite, gold, bubbles, lava, fire }));
  const offer = await pick('hat:crown');
  const worn = await page.evaluate(() => window.__mmf.me.look?.hat);
  // (they stand somewhere of their own choosing when they leave for the payment page: they come back there)
  await page.evaluate(() => { const m = window.__mmf; m.player.teleport(-64, -22, 0); });
  const stood = await page.evaluate(() => { const p = window.__mmf.player.pos; return [p.x, p.z]; });
  await Promise.all([page.waitForURL('https://checkout.stripe.test/**', { timeout: 20000 }), page.click('.shop .detail .acts .buy')]);
  check('a hat that is not theirs can be bought, not worn; the button leads to the payment page of Stripe', offer.title === 'Crown' && offer.acts.join() === 'Buy · $9.99' && /Test mode/.test(offer.fine) && worn === 0 && asked[0]?.get('metadata[item]') === 'hat:crown' && asked[0].get('metadata[device]') === device && asked[0].get('line_items[0][price_data][unit_amount]') === '999' && asked[0].get('mode') === 'payment', JSON.stringify({ offer, worn, asked: String(asked[0]).slice(0, 300) }));
  // (Stripe says it was paid; the visitor comes back: the hat is on their head at once)
  const hook = await pay('hat:crown', device);
  await enter('&paid=hat%3Acrown');
  await page.waitForFunction(() => window.__mmf.me.look?.hat === 6, null, { timeout: 30000 });
  const backAt = await page.evaluate(() => { const m = window.__mmf, p = m.player.pos; return { x: p.x, z: p.z, card: !document.querySelector('.splash.done'), said: [...document.querySelectorAll('.chat .log p')].map((e) => e.textContent).filter((t) => /It is yours/.test(t)).length }; });
  check('back from the payment page they are in the world at once, where they stood when they left — no card to pass —, and what they bought is said in the chat, where it stays', !backAt.card && Math.hypot(backAt.x - stood[0], backAt.z - stood[1]) < 2 && backAt.said === 1, JSON.stringify({ stood, backAt }));
  // …and on their head for the others too — which a hat that was not bought is not: the relay checks what each
  // visitor has (server/wardrobe.js). A stranger joins the room and says they wear a crown as well.
  const seenWorn = await (async () => {
    await page.waitForFunction(() => window.__mmf.presence?.mode === 'online' && window.__mmf.presence.id > 0, null, { timeout: 30000 });
    const room = await page.evaluate(() => window.__mmf.presence.room), me = await page.evaluate(() => window.__mmf.presence.id), CROWN = 6 << 1;
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?room=${room}&dev=stranger-0123456789abcdef`), looks = new Map();
    let id = 0;
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'welcome') { id = m.id; for (const p of m.peers) if (Number.isInteger(p.f)) looks.set(p.id, p.f); }
      if (m.t === 'u') for (const r of m.s) looks.set(r[0], r[6]);
    });
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    ws.send(JSON.stringify({ t: 'hello', name: 'Stranger', color: 3, v: 2, dev: 'stranger-0123456789abcdef' }));
    for (let k = 0; k < 100 && !id; k++) await new Promise((r) => setTimeout(r, 100));
    const at = await page.evaluate(() => { const p = window.__mmf.player.pos; return [p.x + 1.5, p.y, p.z + 1.5]; });
    ws.send(JSON.stringify({ t: 's', p: [...at, 0], a: 0, f: CROWN }));
    await page.keyboard.down('KeyW'); await frames(6); await page.keyboard.up('KeyW'); // (a step: the page says where it is, and what it wears)
    let theirs = null, mine = null;
    for (let k = 0; k < 150 && (theirs === null || mine === undefined || mine === null); k++) {
      await new Promise((r) => setTimeout(r, 100));
      theirs = await page.evaluate((id) => { const p = window.__mmf.presence.peers.get(id); return p && p.visible ? p.flags : null; }, id);
      mine = looks.get(me);
    }
    ws.close();
    return { theirs, mine, crown: CROWN };
  })();
  check('what is worn shows to the others when it was bought, and only then: the crown that was paid for is seen on its buyer — a stranger who says they wear one is seen without', ((seenWorn.mine >> 1) & 7) === 6 && seenWorn.theirs !== null && (seenWorn.theirs & 0x100e) === 0, JSON.stringify(seenWorn));
  await page.click('.shop-icon');
  await page.waitForSelector('.shop.on', { timeout: 20000 });
  const got = await pick('hat:crown'), crown2 = await card('hat:crown'), cowboy = await card('hat:cowboy');
  await page.click('.shop .detail .acts button'); // (take it off)
  await frames(3);
  const off = await page.evaluate(() => ({ hat: window.__mmf.me.look?.hat, tag: document.querySelector('.shop .card[data-item="hat:crown"] .price').textContent, url: location.search }));
  // the light jetpack: bought, it flies — a third as long as the real one
  await page.evaluate(() => { const p = window.__mmf.presence, own = p.own.bind(p); window.__owns = 0; p.own = () => { window.__owns++; own(); }; });
  await pay('jetlite', device);
  await page.evaluate(() => window.__mmf.refreshShop());
  const toldRelay = await page.evaluate(() => window.__owns); // (something new is theirs: the relay is told to ask again what they have)
  const tank = await page.evaluate(() => { const a = window.__mmf; return { tank: a.player.tank, lite: a.shop.owns('jetlite'), full: a.shop.owns('jetpack'), canFly: a.player.canFly(a.player.pos), tag: document.querySelector('.shop .card[data-item="jetlite"] .price').textContent }; });
  await page.keyboard.press('Escape');
  await frames(3);
  const closed = await page.evaluate(() => !document.querySelector('.shop').classList.contains('on'));
  check('back from the payment page the hat is theirs and on their head; it comes off and goes back on in the shop; the others are still for sale', hook === 200 && got.acts.join() === 'Take it off' && crown2.tag === 'Equipped' && cowboy.tag === '$9.99' && off.hat === 0 && off.tag === 'Owned' && !/paid/.test(off.url) && closed, JSON.stringify({ got, crown2, cowboy, off, closed }));
  check('the light jetpack is on as soon as it is theirs, with its small tank (a third of a second of thrust) — and the relay is told that something new is theirs', tank.lite && !tank.full && tank.canFly && Math.abs(tank.tank - 0.3) < 0.01 && tank.tag === 'Equipped' && toldRelay === 1, JSON.stringify({ ...tank, toldRelay }));

  // ---- a sponsor: the panel of the shooting gallery goes to the highest bidder, from a dollar
  const slot = await page.evaluate(() => { const m = window.__mmf, s = m.world.sponsorSlots.find((q) => q.id === 'board:shoot'); m.player.teleport(s.x, s.z, 0); return { x: s.x, z: s.z }; });
  await frames(8);
  const free = await prompts();
  await page.keyboard.press('KeyE');
  await page.waitForSelector('.chooser.on .fields', { timeout: 20000 });
  // (what the panel will show is asked for before the payment — a name, a line, a site, a logo —, then the bid)
  const bidForm = await page.evaluate(() => ({ title: document.querySelector('.chooser h2').textContent, lead: document.querySelector('.chooser .lead').textContent, fields: document.querySelectorAll('.chooser .fields input').length, value: [...document.querySelectorAll('.chooser .fields input')].pop().value, save: document.querySelector('.chooser .fields .save').textContent }));
  { const f = page.locator('.chooser .fields input'); await f.nth(0).fill('Acme <b>Robotics</b>'); await f.nth(1).fill('Friendly machines since 1999'); await f.nth(2).fill('https://acme.example/'); await f.nth(3).setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: LOGO }); await f.nth(4).fill('3'); }
  asked.length = 0;
  await Promise.all([page.waitForURL('https://checkout.stripe.test/**', { timeout: 20000 }), page.click('.chooser .fields .save')]);
  const bidAsked = asked[0];
  // (Stripe says the bid was paid; the visitor comes back: the panel is theirs)
  await pay('board:shoot', device, null, { amount: 300, pay: 'pi_shoptest_1' });
  await enter('&paid=board%3Ashoot');
  await page.waitForFunction(() => window.__mmf.shop.slots['board:shoot']?.mine, null, { timeout: 30000 });
  // (…and what they said it should show went up by itself, the moment it was theirs)
  await page.waitForFunction(() => window.__mmf.shop.slots['board:shoot']?.state === 'live', null, { timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.chat .log p')].some((p) => /Paid, and up/.test(p.textContent)), null, { timeout: 30000 });
  const upAtOnce = await page.evaluate(() => ({ title: window.__mmf.shop.slots['board:shoot'].title, logo: !!window.__mmf.shop.slots['board:shoot'].logo, kept: localStorage.getItem('mmf.sponsor'), chat: [...document.querySelectorAll('.chat .log p')].map((p) => p.textContent).filter((t) => /Paid, and up/.test(t)).length }));
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
  check('the panel of a game is auctioned: "Sponsor … · from $1" at its board; what it will show is asked for first (a name, a line, a site, a logo), then the bid, paid once on Stripe; back in the game the panel is theirs and up at once, as they said — and "Set up your panel" changes it',
    free.includes('Sponsor this game · from $1') && /Bullseye Alley/.test(bidForm.title) && /refunded in full/.test(bidForm.lead) && bidForm.fields === 5 && bidForm.value === '1' && bidForm.save === 'Go to payment'
    && bidAsked?.get('metadata[item]') === 'board:shoot' && bidAsked.get('metadata[bid]') === '300' && bidAsked.get('line_items[0][price_data][unit_amount]') === '300' && bidAsked.get('mode') === 'payment' && mine.includes('Set up your panel')
    && upAtOnce.title === 'Acme b Robotics /b' && upAtOnce.logo && upAtOnce.kept === null && upAtOnce.chat === 1,
    JSON.stringify({ free, bidForm, asked: String(bidAsked).slice(0, 200), mine, slot, upAtOnce }));
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
  await page.waitForFunction(() => /Done: it is shown to everyone/.test(document.querySelector('.hud .note')?.textContent || ''), null, { timeout: 20000 }); // (it was up already: what is waited for is the word that it was saved)
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
  // ---- (first) a gondola is taken: its sponsor is seen on the car itself — both ends, facing outwards — the Trading
  // Post says which car it is, and the wall of thanks has them
  {
    const bare7 = await page.evaluate(() => window.__mmf.world.pier.gondolaShown(7));
    await pay('gondola:7', device, 'sub_test_gondola_7');
    const filled = await (await fetch(`${BASE}/api/sponsor`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slot: 'gondola:7', device, title: 'Seven Seas Ice Cream', subtitle: 'on the pier since ever', url: 'https://ice.example' }) })).json();
    await page.evaluate(() => window.__mmf.refreshShop());
    await page.waitForFunction(() => window.__mmf.world.pier.gondolaShown(7), null, { timeout: 30000 });
    await frames(3);
    const car = await page.evaluate(() => {
      const pier = window.__mmf.world.pier, mesh = pier.wheelPivot.children.find((c) => c.name === 'big-wheel-banners'), pos = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
      // (a banner of a car, in the frame of the wheel — whose x runs along the pier: which way it faces, which way its words run, how wide it is)
      const quad = (n, side) => {
        const o = ((n - 1) * 2 + side) * 4, P = (k) => [pos.getX(o + k), pos.getY(o + k), pos.getZ(o + k)], a = P(0), b = P(1), d = P(3);
        const nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]);
        return { faces: Math.sign(nx), runs: Math.sign((b[2] - a[2]) * (uv.getX(o + 1) - uv.getX(o))), wide: +Math.abs(b[2] - a[2]).toFixed(2), x: Math.sign(a[0]) };
      };
      return { shore: quad(7, 0), sea: quad(7, 1), free: quad(8, 0), shown: [7, 8].map((n) => pier.gondolaShown(n)).join() };
    });
    await page.evaluate(() => window.__mmf.openTrading());
    await page.waitForSelector('.tp-car[data-id="gondola:7"] canvas', { timeout: 120000 });
    const post7 = await page.evaluate(() => {
      const c = document.querySelector('.tp-car[data-id="gondola:7"]'), k = c.querySelector('canvas'), px = k.getContext('2d').getImageData(0, 0, k.width, k.height).data;
      let lit = 0;
      for (let i = 0; i < px.length; i += 400) if (px[i] + px[i + 1] + px[i + 2] > 60) lit++;
      return { name: c.querySelector('h3').textContent, tag: c.querySelector('.tp-tag').textContent, who: c.querySelector('.tp-who').textContent, price: c.querySelector('.tp-price')?.textContent || '', title: document.querySelector('.tp-also-w').textContent, cars: document.querySelectorAll('.tp-car').length, lit };
    });
    await page.evaluate(() => window.__mmf.sponsorsView.close());
    const row = await page.evaluate(async () => {
      const wall = window.__mmf.world.games.thanks, mine = () => wall.shown?.rows.find((r) => r.name === 'Seven Seas Ice Cream');
      for (let i = 0; i < 100 && !mine(); i++) await new Promise((r) => setTimeout(r, 100));
      return mine() || null;
    });
    check('a gondola that is taken shows its sponsor on the car — a board wider than the car on both ends, each facing outwards with its words running the right way, a free car keeping the small invitation — the Trading Post says which car it is, with a photograph of it, and the wall of thanks has them at "$29 a month", with their site and its clicks rather than where they are',
      filled.ok === true && bare7 === false && car.shown === 'true,false' && car.shore.x === -1 && car.shore.faces === -1 && car.sea.x === 1 && car.sea.faces === 1 && car.shore.runs * car.shore.faces === -1 && car.sea.runs * car.sea.faces === -1
      && car.shore.wide > 3 && car.sea.wide > 3 && car.free.wide < 2.2 && car.free.faces === -1
      && post7.name === 'Gondola 7' && /Seven Seas Ice Cream/.test(post7.who) && /\$29 a month/.test(post7.price) && /1 of 24 gondolas sponsored/.test(post7.title) && post7.cars === 1 && post7.lit > 200
      && row?.figure === '$29' && row.unit === 'a month' && !('where' in row) && typeof row.site === 'string' && row.clicks === 0,
      JSON.stringify({ filled, bare7, car, post7, row }));
  }
  await page.evaluate(() => window.__mmf.adminKey(''));
  // ---- a gondola for good. At the stand of the wheel a free gondola is taken by the month, or bought once: the
  // buyer chooses. Bought, it is theirs with no subscription behind it. And the administrator — who was only ever
  // offered to fill a gondola in by hand — is offered the same two ways to pay, with that third one.
  {
    const toStand = async () => { await page.evaluate(() => { const m = window.__mmf, b = m.world.pier.sponsorBooth; m.setMode?.('walk', true); m.player.teleport(b[0], b[1], 0); }); await frames(8); await page.keyboard.press('KeyE'); await page.waitForFunction(() => document.querySelectorAll('.chooser.on .list button').length === 24, null, { timeout: 20000 }); };
    const pick = async (n) => { await page.evaluate((n) => document.querySelectorAll('.chooser .list button')[n - 1].click(), n); await page.waitForFunction((n) => document.querySelector('.chooser.on h2')?.textContent === `Gondola ${n}`, n, { timeout: 20000 }); return page.evaluate(() => ({ lead: document.querySelector('.chooser .lead').textContent, list: [...document.querySelectorAll('.chooser .list button')].map((b) => b.textContent) })); };
    await toStand();
    const free9 = await page.evaluate(() => document.querySelectorAll('.chooser .list button')[8].textContent);
    const ways = await pick(9);
    await page.screenshot({ path: path.join(ROOT, 'tools/preview/shop-gondola-ways.png') });
    await page.evaluate(() => [...document.querySelectorAll('.chooser .list button')].find((b) => /For good/.test(b.textContent)).click());
    await page.waitForSelector('.chooser.on .fields', { timeout: 20000 });
    const form9 = await page.evaluate(() => ({ title: document.querySelector('.chooser h2').textContent, lead: document.querySelector('.chooser .lead').textContent, save: document.querySelector('.chooser .fields .save').textContent }));
    { const f = page.locator('.chooser .fields input'); await f.nth(0).fill('Nine Lives Cat Cafe'); await f.nth(1).fill('purring since the end of the world'); await f.nth(2).fill('https://cats.example/'); }
    asked.length = 0;
    await Promise.all([page.waitForURL('https://checkout.stripe.test/**', { timeout: 20000 }), page.click('.chooser .fields .save')]);
    const asked9 = asked[0];
    // (Stripe says it was paid — once: there is no subscription —, and the visitor comes back)
    await tell({ type: 'checkout.session.completed', data: { object: { id: 'cs_shoptest_g9', payment_status: 'paid', subscription: null, customer: 'cus_shoptest_9', amount_total: 19900, metadata: { item: 'gondola:9', device, life: '1' } } } });
    await enter('&paid=gondola%3A9');
    await page.waitForFunction(() => window.__mmf.shop.slots['gondola:9']?.state === 'live', null, { timeout: 30000 });
    await page.waitForFunction(() => window.__mmf.world.pier.gondolaShown(9), null, { timeout: 30000 });
    const mine9 = await page.evaluate(() => { const m = window.__mmf, v = m.shop.slots['gondola:9']; return { mine: !!v.mine, life: !!v.life, manage: !!v.manage, title: v.title, pays: v.pays }; });
    await toStand();
    const held9 = await page.evaluate(() => [8, 9].map((k) => document.querySelectorAll('.chooser .list button')[k].textContent));
    await page.keyboard.press('Escape');
    await frames(3);
    // (the administrator, at a gondola nobody holds)
    await page.evaluate((key) => window.__mmf.adminKey(key), ADMIN_KEY);
    await page.waitForFunction(() => window.__mmf.who?.admin, null, { timeout: 20000 });
    await toStand();
    const owner = await pick(10);
    await page.keyboard.press('Escape');
    await frames(3);
    await page.evaluate(() => window.__mmf.adminKey(''));
    await page.waitForFunction(() => !window.__mmf.who?.admin, null, { timeout: 20000 });
    check('a gondola is taken by the month or bought for good, as one chooses: the stand says both prices; "for good" asks what the banner should show, then for one payment of $199 — no subscription —; back from it the gondola is theirs for good, its banner up, with nothing to look after; and the administrator is offered both ways to pay as well as filling it in',
      /Free · \$29 a month, or \$199 for good/.test(free9) && ways.list.join(' | ') === 'By the month · $29Stop whenever you like | For good · $199Paid once — yours to keep' && /pay once/.test(ways.lead)
      && form9.title === 'Buy gondola 9 of the big wheel' && /\$199, once, and it is yours for good/.test(form9.lead) && form9.save === 'Go to payment · $199, once'
      && asked9?.get('mode') === 'payment' && asked9.get('line_items[0][price_data][unit_amount]') === '19900' && asked9.get('line_items[0][price_data][recurring][interval]') === null && asked9.get('metadata[item]') === 'gondola:9' && asked9.get('metadata[life]') === '1'
      && mine9.mine && mine9.life && !mine9.manage && mine9.title === 'Nine Lives Cat Cafe' && mine9.pays?.amount === 19900 && mine9.pays.monthly === false
      && /Yours for good: set it up/.test(held9[0]) && /Free · \$29 a month, or \$199 for good/.test(held9[1])
      && owner.list.length === 3 && owner.list.some((t) => /^Fill it in \(administrator\)/.test(t)) && owner.list.some((t) => /^By the month · \$29/.test(t)) && owner.list.some((t) => /^For good · \$199/.test(t)),
      JSON.stringify({ free9, ways, form9, asked9: asked9 && Object.fromEntries(asked9), mine9, held9, owner }));
  }
  // ---- the list of thanks, at the foot of the wall: every sponsor one under the other — their rank, their logo or
  // their initials, their name and the line under it, where they are and their site, what they put in — readable
  {
    await page.evaluate(() => window.__mmf.openThanks());
    await page.waitForSelector('.chooser.on .list.thanks .sp', { timeout: 20000 });
    await page.waitForFunction(() => [...document.querySelectorAll('.chooser .list.thanks .mark img')].every((i) => i.complete), null, { timeout: 20000 }).catch(() => {});
    const thanks = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.chooser .list.thanks .sp')].map((b) => ({ rank: b.querySelector('.rank').textContent, name: b.querySelector('.name').textContent, line: b.querySelector('.line')?.textContent || '', meta: b.querySelector('.meta')?.textContent || '', figure: b.querySelector('.figure')?.textContent || '', unit: b.querySelector('.unit')?.textContent || '', logo: !!b.querySelector('.mark img'), mono: b.querySelector('.mark.mono')?.textContent || '', top: b.className, high: b.getBoundingClientRect().height }));
      return { title: document.querySelector('.chooser h2').textContent, lead: document.querySelector('.chooser .lead').textContent, close: document.querySelector('.chooser .close').textContent, rows, markup: !!document.querySelector('.chooser .list.thanks .name b') };
    });
    await page.screenshot({ path: path.join(ROOT, 'tools/preview/shop-thanks.png') });
    await page.keyboard.press('Escape');
    await frames(3);
    const shut = await page.evaluate(() => ({ on: !!document.querySelector('.chooser.on'), thanks: !!document.querySelector('.chooser .list.thanks'), close: document.querySelector('.chooser .close').textContent }));
    const nine = thanks.rows.find((r) => r.name === 'Nine Lives Cat Cafe'), seas = thanks.rows.find((r) => r.name === 'Seven Seas Ice Cream'), acme = thanks.rows.find((r) => /Acme/.test(r.name));
    check('the list of thanks is one to read: every sponsor one under the other, the most generous first — its rank in gold for the first, its logo (or its initials), its name and the line under it, where it is and its site, what it put in; Escape closes it',
      thanks.title === 'Thanks to them, the game is free' && /sponsors keep Atomic Oasis free/.test(thanks.lead) && thanks.close === 'Close' && thanks.rows.length >= 3 && thanks.rows[0].name === 'Nine Lives Cat Cafe' && thanks.rows[0].rank === '1' && /top1/.test(thanks.rows[0].top)
      && nine.figure === '$199' && nine.line === 'purring since the end of the world' && /Gondola 9/.test(nine.meta) && /cats\.example ↗/.test(nine.meta) && nine.mono === 'NL'
      && seas?.figure === '$29' && /a month/.test(seas.unit) && seas.line === 'on the pier since ever' && /Gondola 7/.test(seas.meta)
      && !!acme && acme.logo && /Shooting|Bullseye/.test(acme.meta) && !thanks.markup && thanks.rows.every((r) => r.high >= 58)
      && !shut.on && !shut.thanks && shut.close === 'Stay here', JSON.stringify({ thanks, shut }));
  }
  // ---- a beach hut: the panel on its roof, by the month or for good — half what a gondola costs. It is offered on
  // the sand by the hut itself; taken, its panel grows wider than the roof, a face to the sea and one to the
  // boardwalk; the Trading Post lists the twenty-six and photographs the one that is held; the wall of thanks has it
  {
    await page.evaluate(() => window.__mmf.setMode?.('walk', true));
    const count = await page.evaluate(() => window.__mmf.world.pier.huts);
    // (on the sand between the boardwalk and hut 5, facing it)
    await page.evaluate(() => { const m = window.__mmf, s = m.world.pier.hutSpots[4]; m.player.teleport(s.x - Math.sin(s.yaw) * 2.1, s.z - Math.cos(s.yaw) * 2.1, s.yaw); });
    await frames(8);
    const offered = await prompts();
    const bare = await page.evaluate(() => window.__mmf.world.pier.hutShown(5));
    await pay('hut:5', device, 'sub_test_hut_5');
    const filled = await (await fetch(`${BASE}/api/sponsor`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slot: 'hut:5', device, title: 'Sandy Toes Surf School', subtitle: 'lessons at low tide', url: 'https://surf.example' }) })).json();
    await page.evaluate(() => window.__mmf.refreshShop());
    await page.waitForFunction(() => window.__mmf.world.pier.hutShown(5), null, { timeout: 30000 });
    await frames(8);
    const held = await prompts();
    const board = await page.evaluate(() => {
      const pier = window.__mmf.world.pier, mesh = pier.group.getObjectByName('beach-hut-banners'), pos = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
      // (a panel of a hut, in the world: which way it faces — +1 towards the sea —, which way its words run for who
      // looks at it — +1 from left to right —, how wide it is, how high its foot is over the floor of the hut)
      const quad = (n, side) => {
        const s = pier.hutSpots[n - 1], o = ((n - 1) * 2 + side) * 4, P = (k) => [pos.getX(o + k), pos.getY(o + k), pos.getZ(o + k)], a = P(0), b = P(1), d = P(3);
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
        const N = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        return { faces: Math.sign(N[0] * Math.sin(s.yaw) + N[2] * Math.cos(s.yaw)), runs: Math.sign((e1[0] * N[2] - e1[2] * N[0]) * (uv.getX(o + 1) - uv.getX(o))), wide: +Math.hypot(...e1).toFixed(2), low: +(Math.min(a[1], b[1]) - s.y).toFixed(2) };
      };
      return { sea: quad(5, 0), shore: quad(5, 1), free: quad(6, 0), shown: [5, 6].map((n) => pier.hutShown(n)).join() };
    });
    await page.evaluate(() => window.__mmf.openTrading());
    await page.waitForSelector('.tp-hut[data-id="hut:5"] canvas', { timeout: 120000 });
    const post5 = await page.evaluate(() => {
      const c = document.querySelector('.tp-hut[data-id="hut:5"]'), k = c.querySelector('canvas'), px = k.getContext('2d').getImageData(0, 0, k.width, k.height).data;
      let lit = 0;
      for (let i = 0; i < px.length; i += 400) if (px[i] + px[i + 1] + px[i + 2] > 60) lit++;
      c.scrollIntoView({ block: 'center' });
      return { name: c.querySelector('h3').textContent, who: c.querySelector('.tp-who').textContent, price: c.querySelector('.tp-price')?.textContent || '', title: document.querySelector('.tp-also-b').textContent, huts: document.querySelectorAll('.tp-hut').length, extra: [...document.querySelectorAll('.tp-extra')].map((x) => x.textContent).find((t) => /beach huts/.test(t)) || '', lit };
    });
    await frames(3);
    await page.screenshot({ path: path.join(ROOT, 'tools/preview/shop-trading-huts.png') });
    await page.evaluate(() => [...document.querySelectorAll('.tp-extra button')].find((b) => b.textContent === 'Choose a beach hut').click());
    await page.waitForFunction(() => document.querySelectorAll('.chooser.on .list button').length === 26, null, { timeout: 20000 });
    const list = await page.evaluate(() => [4, 5].map((k) => document.querySelectorAll('.chooser .list button')[k].textContent));
    await page.evaluate(() => document.querySelectorAll('.chooser .list button')[8].click());
    await page.waitForFunction(() => document.querySelector('.chooser.on h2')?.textContent === 'Beach hut 9', null, { timeout: 20000 });
    const ways = await page.evaluate(() => ({ lead: document.querySelector('.chooser .lead').textContent, list: [...document.querySelectorAll('.chooser .list button')].map((b) => b.textContent) }));
    await page.keyboard.press('Escape');
    await frames(3);
    const row = await page.evaluate(async () => {
      const wall = window.__mmf.world.games.thanks, mine = () => wall.shown?.rows.find((r) => r.name === 'Sandy Toes Surf School');
      for (let i = 0; i < 100 && !mine(); i++) await new Promise((r) => setTimeout(r, 100));
      return mine() || null;
    });
    check('a beach hut is offered on the sand by the hut itself, by the month or for good, for half what a gondola costs; taken, its panel grows wider than the roof — a face to the sea and one to the boardwalk, each read from left to right, over the ridge —, a free hut keeping its small invitation; the Trading Post lists the twenty-six with their price and photographs the one that is held; the wall of thanks has it at "$14.50 a month"',
      count === 26 && offered.join(' | ') === 'Sponsor beach hut 5 · $14.50 a month | Buy beach hut 5 for good · $99.50, once' && bare === false && filled.ok === true && held.includes('Set up your panel')
      && board.shown === 'true,false' && board.sea.faces === 1 && board.shore.faces === -1 && board.sea.runs === 1 && board.shore.runs === 1 && board.sea.wide > 2 && board.free.wide < 1.7 && board.sea.low >= 2.75
      && post5.name === 'Beach hut 5' && /Sandy Toes Surf School/.test(post5.who) && post5.price === '$14.50 a month, or $99.50 for good' && /1 of 26 beach huts sponsored/.test(post5.title) && post5.huts === 1 && post5.lit > 200
      && /25 free · \$14\.50 a month, or \$99\.50 for good/.test(post5.extra)
      && /Yours: set it up/.test(list[0]) && /Free · \$14\.50 a month, or \$99\.50 for good/.test(list[1]) && ways.list.join(' | ') === 'By the month · $14.50Stop whenever you like | For good · $99.50Paid once — yours to keep' && /pay once/.test(ways.lead)
      && row?.figure === '$14.50' && row.unit === 'a month',
      JSON.stringify({ count, offered, bare, filled, held, board, post5, list, ways, row }));
  }
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
  // (scores belong to accounts: made as a guest, a score is on the board of the day — and when it would be among
  // the ten of a longer list, its author is offered an account. The offer leads to the card.)
  // (the visitor really plays the bell: the server plays the game again before it believes a great score)
  await page.evaluate(() => new Promise((done) => {
    const a = window.__mmf, booth = a.world.games.booths.list.find((b) => b.id === 'bell');
    a.playBooth(booth);
    const tick = () => {
      const s = a.fair.session;
      if (!s) return done(true);
      if (!s.over && s.gauge !== null && s.gauge > 0.85) a.input._clicks++;
      requestAnimationFrame(tick);
    };
    tick();
  }));
  await page.waitForSelector('.offer-bar.on', { timeout: 20000 });
  const struck = await page.evaluate(() => window.__mmf.fair.tops.bell.day[0].score);
  const asGuestScore = await page.evaluate(() => ({ offer: document.querySelector('.offer-bar .offer-text').textContent, yes: document.querySelector('.offer-bar .offer-yes').textContent, note: document.querySelector('.hud .note').textContent, tops: window.__mmf.fair.tops.bell }));
  await page.click('[data-act="settings"]');
  const guestSays = await page.evaluate(() => document.querySelector('.acct-info').textContent);
  await page.click('[data-act="settings"]');
  await frames(2);
  await page.click('.offer-bar .offer-yes');
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
  // (the score made a moment ago as a guest counts for the account: the page handed back the note the server gave)
  await page.waitForFunction(() => [...document.querySelectorAll('.chat .log p')].some((e) => /now counts for the week, the month and all time, under the name Shop Tester/.test(e.textContent)), null, { timeout: 30000 });
  const claimedScore = { page: await page.evaluate(() => window.__mmf.fair.tops.bell), server: (await (await fetch(`${BASE}/api/scores?board=bell`)).json()).tops };
  check('a score made without an account is on the board of the day, and its author is offered an account ("You would be #1 of all time"); the offer opens the card, and once the account is made the score counts for the week, the month and all time under its name',
    /You would be #1 of all time — create an account to keep it/.test(asGuestScore.offer) && asGuestScore.yes === 'Create an account' && /#1 today/.test(asGuestScore.note) && struck > 0 && asGuestScore.tops.day[0]?.score === struck && asGuestScore.tops.all.length === 0
    && ['week', 'month', 'all'].every((p) => claimedScore.server[p][0]?.name === 'Shop Tester' && claimedScore.server[p][0].score === struck) && claimedScore.page.all[0]?.name === 'Shop Tester', JSON.stringify({ asGuestScore, claimedScore }));
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
    // the welcome card of a first visit: only what is everybody's — sixteen colours, no size to choose, not a word
    // of the Game Pass (nothing on it looks like something to sell)
    await p3.waitForFunction(() => document.querySelectorAll('.splash .swatches button.locked').length === 16, null, { timeout: 30000 });
    const card0 = await p3.evaluate(() => {
      const seen = (e) => !!e && e.getClientRects().length > 0, sw = [...document.querySelectorAll('.splash .swatches button')];
      return { colours: sw.filter(seen).length, extra: sw.slice(16).some(seen), row: seen(document.querySelector('.splash .swatches .passrow')), sizes: seen(document.querySelector('.splash .sizes')), labels: [...document.querySelectorAll('.splash .form label')].filter(seen).map((l) => l.textContent).join(), picked: sw.findIndex((b) => b.getAttribute('aria-pressed') === 'true'), words: document.querySelector('.splash .form').innerText };
    });
    await p3.screenshot({ path: path.join(ROOT, 'tools/preview/shop-first-card.png') });
    await p3.click('.go');
    await p3.waitForFunction(() => window.__mmf && window.__mmf.ready && window.__mmf.player && window.__mmf.shop.open, null, { timeout: 60000 });
    const dev3 = await p3.evaluate(() => localStorage.getItem('mmf.device'));
    const day1 = await p3.evaluate(() => { const a = window.__mmf; return { color: a.me.colorIndex, size: a.me.size, lent: a.shop.lent('jetlite'), has: a.shop.has('jetlite'), canFly: a.player.canFly(a.player.pos), tank: a.player.tank, hours: a.shop.trialLeft('jetlite') / 3600_000, pass: a.shop.hasPass, first: Date.now() - Number(localStorage.getItem('mmf.first')) }; });
    check('a newcomer: the welcome card shows only what is everybody\'s — sixteen colours, no size to choose, not a word of the Game Pass; the light jetpack is theirs for a day',
      card0.colours === 16 && !card0.extra && !card0.row && !card0.sizes && card0.labels === 'Your name,Colour' && card0.picked < 16 && !/Game Pass|Pocket|Jumbo|Titan/.test(card0.words) && day1.first >= 0 && day1.first < 600_000 && day1.color < 16 && day1.size === 1 && !day1.pass && day1.lent === 'trial' && !day1.has && day1.canFly && Math.abs(day1.tank - 0.3) < 0.01 && day1.hours > 23 && day1.hours <= 24,
      JSON.stringify({ card0, day1 }));
    // the pass in the shop: what it gives, what it costs; the button leads to Stripe, by the month
    await p3.click('.shop-icon');
    await p3.waitForSelector('.shop.on', { timeout: 20000 });
    // (what is inside is on the banner of the pass itself, read without opening it: five lines, each in sight, none cut off)
    const inside3 = await p3.evaluate(() => {
      const c = document.querySelector('.shop .card[data-item="pass"]'), box = c.getBoundingClientRect(), list = c.querySelector('.inside');
      const lines = [...(list?.querySelectorAll('i') || [])].map((i) => { const r = i.getBoundingClientRect(), b = i.querySelector('b'); return { what: b.textContent, more: i.querySelector('span')?.textContent || '', seen: r.width > 0 && r.height > 0 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && r.left >= box.left - 1 && r.right <= box.right + 1, cut: b.scrollWidth > b.clientWidth + 1 }; });
      return { head: list?.querySelector('em')?.textContent || '', shown: !!list && getComputedStyle(list).display !== 'none' && list.getClientRects().length > 0, lines, picked: document.querySelector('.shop .card.picked')?.dataset.item || '' };
    });
    await p3.screenshot({ path: path.join(ROOT, 'tools/preview/shop-pass-banner.png') });
    // (…and on a phone: the five lines in a column beside the ticket, the price under them)
    await p3.setViewportSize({ width: 390, height: 760 });
    await frames3(4);
    const phone3 = await p3.evaluate(() => { const c = document.querySelector('.shop .card[data-item="pass"]'), box = c.getBoundingClientRect(), foot = c.querySelector('.foot').getBoundingClientRect(); return [...c.querySelectorAll('.inside i')].map((i) => { const r = i.getBoundingClientRect(), b = i.querySelector('b'); return r.width > 0 && r.top >= box.top - 1 && r.bottom <= foot.top + 2 && r.right <= box.right + 1 && b.scrollWidth <= b.clientWidth + 1; }); });
    await p3.screenshot({ path: path.join(ROOT, 'tools/preview/shop-pass-banner-phone.png') });
    await p3.setViewportSize({ width: 960, height: 560 });
    await frames3(4);
    const tag0 = await card3('pass'), liteTag = await card3('jetlite'), offer3 = await pick3('pass');
    asked.length = 0;
    await Promise.all([p3.waitForURL('https://checkout.stripe.test/**', { timeout: 20000 }), p3.click('.shop .detail .acts .buy')]);
    const form3 = asked[0];
    check('the Game Pass has its own shelf, and its banner says what is inside without being opened — five lines, each in sight, none cut off —; opened: what it gives, a word from who makes the game, $19 a month — paid on Stripe as a subscription',
      inside3.shown && inside3.head === 'What is inside' && inside3.lines.length === 5 && inside3.lines.every((l) => l.seen && !l.cut) && phone3.length === 5 && phone3.every(Boolean) && inside3.lines.map((l) => l.what).join() === 'Every hat,The Jetpack Lite,Four sizes,16 more colours,Your own weather' && inside3.picked !== 'pass'
      && tag0 === '$19 a month' && liteTag === 'Free today' && offer3.acts.join() === 'Get the pass · $19 a month' && offer3.perks === 5 && /guy on a couch/.test(offer3.why)
      && form3?.get('mode') === 'subscription' && form3.get('line_items[0][price_data][unit_amount]') === '1900' && form3.get('line_items[0][price_data][recurring][interval]') === 'month' && form3.get('metadata[item]') === 'pass' && form3.get('metadata[device]') === dev3,
      JSON.stringify({ inside3, phone3, tag0, liteTag, offer3, form: form3?.toString().slice(0, 220) }));
    // Stripe says it was paid; back in the game: black, the largest size, a hat that was never bought
    const paid3 = await pay('pass', dev3, 'sub_pass_shop', null, 'cus_shop');
    await p3.goto(`${BASE}/?q=${opt.q || 'low'}&paid=pass&welcome`); // (back from the payment page one is in the world at once: the card is asked for here, to pick on it)
    await p3.waitForSelector('.card.ready', { timeout: 240000 });
    await p3.waitForFunction(() => document.querySelectorAll('.splash .swatches button.locked').length === 0 && document.querySelectorAll('.splash .sizes button.locked').length === 0, null, { timeout: 30000 });
    // (with the pass, the card has all of it: the thirty-two colours, the four sizes)
    const card1 = await p3.evaluate(() => { const seen = (e) => !!e && e.getClientRects().length > 0; return { colours: [...document.querySelectorAll('.splash .swatches button')].filter(seen).length, sizes: [...document.querySelectorAll('.splash .sizes button')].filter(seen).map((b) => b.textContent).join() }; });
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
      paid3 === 200 && card1.colours === 32 && card1.sizes === 'Pocket,Classic,Jumbo,Titan' && with3.color === 16 && Math.abs(with3.size - 1.2) < 0.01 && hatTag === 'With your pass' && hat3.acts.join() === 'Equip,Keep it · $9.99' && with3.hat === 9 && with3.lite === 'pass' && with3.pass && passTag === 'Active' && /Look after it/.test(held3.acts.join()),
      JSON.stringify({ paid3, card1, with3: { ...with3, told: with3.told.slice(-160) }, hatTag, hat3, passTag, held3 }));
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
    // (it is said on the bar of the proposals, with a button that opens the payment of the pass)
    const note3 = await p3.evaluate(() => { const bar = document.querySelector('.offer-bar'); return bar?.classList.contains('on') ? `${bar.querySelector('.offer-text').textContent} [${bar.querySelector('.offer-yes').textContent}]` : document.querySelector('.hud .note').textContent; });
    await third.close();
    check('when the subscription ends the pass is handed back (colour, size, hat) and they are told; a day after the first visit the free jetpack is over, and asking for it says where to get one',
      ended3 === 200 && after3.color === 0 && after3.size === 1 && after3.hat === 0 && !after3.pass && after3.lite === 'trial' && after3.told === 1 && over3.lent === null && !over3.canFly && said3.noJet && /your free day of flying/.test(note3) && /Jetpack Lite is \$5/.test(note3) && /comes with the Game Pass \(\$19 a month/.test(note3) && /\[Get the Game Pass\]$/.test(note3),
      JSON.stringify({ ended3, after3, over3, said3, note3 }));
  }
  // ---- a room of one's own (server/urooms.js — switched on for this part, as the owner would): bought by the month
  // with an account, set up from "Who is here", reached by its link; a friend is asked for its password; a score
  // made there goes on the boards of the room and on the world's; its owner puts the friend out
  {
    const flip = async (set) => (await fetch(`${BASE}/api/release`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ADMIN_KEY}` }, body: JSON.stringify({ set }) })).json();
    const until = async (fn, ms = 20000) => { for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 150))) { const v = await fn(); if (v) return v; } return fn(); };
    const visitor = async () => {
      const context = await browser.newContext({ viewport: { width: 960, height: 560 }, deviceScaleFactor: 1 });
      // (a robot of a colour of its own — green —: its picture on the card of the room is read against the evening
      // sky, and a robot drawn at random in pink stood out from it too little to be told apart)
      await context.addInitScript(() => { try { if (!localStorage.getItem('mmf.color')) localStorage.setItem('mmf.color', '3'); } catch { /* no storage */ } });
      await context.route('https://checkout.stripe.test/**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>pay</title>the payment page' }));
      const p = await context.newPage();
      p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) logs.push(m.text().slice(0, 300)); });
      p.on('pageerror', (e) => logs.push(e.message));
      // (back from the payment page one is in the world at once, where one stood: there is no card to pass then)
      const go = async (query = '') => { await p.goto(`${BASE}/?q=${opt.q || 'low'}${query}`); await p.waitForFunction(() => document.querySelector('.card.ready') || (window.__mmf && window.__mmf.ready && document.querySelector('.splash.done')), null, { timeout: 240000 }); if (await p.evaluate(() => !document.querySelector('.splash.done'))) await p.click('.go'); await p.waitForFunction(() => window.__mmf && window.__mmf.ready && window.__mmf.player, null, { timeout: 60000 }); };
      const roomButton = (label) => p.evaluate((label) => { const b = [...document.querySelectorAll('.roster .acts button')].find((e) => e.textContent === label); if (b) b.click(); return !!b; }, label);
      const said = () => p.evaluate(() => `${[...document.querySelectorAll('.chat .log p')].map((e) => e.textContent).join(' | ')} | ${document.querySelector('.hud .note').textContent}`);
      return { context, p, go, roomButton, said };
    };
    const owner = await visitor(), o = owner.p;
    await owner.go();
    const devO = await o.evaluate(() => localStorage.getItem('mmf.device'));
    // (an account first: a room takes one — made here as the card of the settings makes it)
    await o.evaluate(async (device) => { await fetch('/api/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create', device, name: 'Roomy', password: 'a long password' }) }); }, devO);
    await owner.go();
    await o.waitForFunction(() => document.querySelector('.shop-icon').classList.contains('selling'), null, { timeout: 20000 });
    await o.click('.pill.players');
    await o.waitForSelector('.roster.on', { timeout: 20000 });
    const offRoster = await o.evaluate(() => [...document.querySelectorAll('.roster .rooms h3')].map((h) => h.textContent).join());
    await o.click('.roster .close');
    await o.click('.shop-icon');
    await o.waitForSelector('.shop.on', { timeout: 20000 });
    const offShelves = await o.evaluate(() => [...document.querySelectorAll('.shop .shelf h3')].map((h) => h.textContent).join());
    // switched on (the owner of the game throws the switch): the card is there at once, without loading the page again
    await flip({ userRooms: true });
    const cardOn = await until(() => o.evaluate(() => { const c = document.querySelector('.shop .card[data-item="room"]'); return c ? { tag: c.querySelector('.price').textContent, shelf: [...document.querySelectorAll('.shop .shelf h3')].map((h) => h.textContent).pop() } : null; }));
    // (its picture: an oasis at dusk — the evening sky, the pool — and the visitor's own robot on the bank)
    const roomPic = await o.evaluate(() => { const k = document.querySelector('.shop .card[data-item="room"] canvas'); if (!k) return null; const g = k.getContext('2d'), at = (x, y) => [...g.getImageData(Math.round(k.width * x), Math.round(k.height * y), 1, 1).data].slice(0, 3); const pool = [0.08, 0.14, 0.86, 0.9].map((x) => at(x, 0.69)).sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0]; return { size: `${k.width}x${k.height}`, sky: at(0.5, 0.03), water: pool, robot: at(0.5, 0.45), beside: at(0.27, 0.45) }; }); // (the pool: looked for on both sides of the robot, whose hands hang over the middle of it)
    // (who has no room is told what one is in "Who is here": a card — its picture, its own high scores first, the
    // two ways to pay for it — whose button leads to the shop)
    await o.keyboard.press('Escape');
    await o.click('.pill.players');
    await o.waitForSelector('.roster.on .room-offer', { timeout: 20000 });
    const ad4 = await o.evaluate(() => { const c = document.querySelector('.roster .room-offer'); return { head: [...document.querySelectorAll('.roster .rooms h3')].map((h) => h.textContent).join(), title: c.querySelector('b').textContent, lead: c.querySelector('.lead').textContent, perks: [...c.querySelectorAll('li')].map((e) => e.textContent), prices: [...c.querySelectorAll('.prices span')].map((e) => e.textContent), act: c.querySelector('.acts button').textContent, art: !!c.querySelector('.art canvas'), wide: c.getBoundingClientRect().width <= document.querySelector('.roster').getBoundingClientRect().width }; });
    await o.screenshot({ path: path.join(ROOT, 'tools/preview/shop-room-offer.png') });
    await o.click('.roster .room-offer .acts button');
    await o.waitForSelector('.shop.on', { timeout: 20000 });
    const adShop = await o.evaluate(() => ({ roster: document.querySelector('.roster').classList.contains('on'), picked: document.querySelector('.shop .card.picked')?.dataset.item || '' }));
    check('who has no room of their own is told what one is in "Who is here": a card with its picture — friends only; their own high scores first, fifty of them at once, a password —, by the month or for good; its button opens the shop on it',
      /A room of your own/.test(ad4.head) && ad4.title === 'Friends only' && /you give its link to whoever you like/.test(ad4.lead) && ad4.perks.length === 3 && /^Your own high scores/.test(ad4.perks[0]) && /50/.test(ad4.perks[1]) && /password/.test(ad4.perks[2])
      && ad4.prices.join(' | ') === '$59 a month | $199 once — yours for good' && ad4.act === 'See it in the shop' && ad4.art && ad4.wide && !adShop.roster && adShop.picked === 'room', JSON.stringify({ ad4, adShop }));
    await o.evaluate(() => document.querySelector('.shop .card[data-item="room"]').click());
    const offer4 = await o.evaluate(() => ({ title: document.querySelector('.shop .detail h3').textContent, acts: [...document.querySelectorAll('.shop .detail .acts button')].map((b) => b.textContent), perks: document.querySelectorAll('.shop .detail .perks li').length, fine: document.querySelector('.shop .detail .fine').textContent }));
    const n4 = asked.length;
    await Promise.all([o.waitForURL(/checkout\.stripe\.test/, { timeout: 20000 }), o.evaluate(() => document.querySelector('.shop .detail .acts button').click())]);
    const form4 = asked[n4];
    check('a room of one\'s own: nothing of it while it is switched off; switched on, its card is in the shop at once — $59 a month or $199 for good, what it gives — with a button for each way to pay; the first leads to the payment page, as a subscription for that account',
      !/room of your own/i.test(offRoster) && !/room of your own/i.test(offShelves) && cardOn?.tag === '$59 a month · or $199 for good' && cardOn.shelf === 'A room of your own' && offer4.title === 'A room of your own' && offer4.acts.join() === 'Get a room · $59 a month,Buy it for good · $199, once' && offer4.perks === 6 && /thirty days/.test(offer4.fine) && /Or for good: \$199, once, and it never falls asleep/.test(offer4.fine)
      && form4?.get('mode') === 'subscription' && form4.get('line_items[0][price_data][unit_amount]') === '5900' && form4.get('metadata[item]') === 'room' && form4.get('metadata[account]') === 'Roomy',
      JSON.stringify({ offRoster, offShelves, cardOn, offer4, form: form4?.toString().slice(0, 260) }));
    check('the card of a room of one\'s own has its picture: an oasis — the evening sky, the pool — with the visitor\'s own robot standing on its bank',
      !!roomPic && roomPic.size === '216x252' && roomPic.sky[2] > 80 && roomPic.sky[2] > roomPic.sky[0] + 30 && roomPic.water[1] > roomPic.water[0] + 40
      && roomPic.robot.reduce((sum, v, i) => sum + Math.abs(v - roomPic.beside[i]), 0) > 60, JSON.stringify(roomPic));
    // Stripe says it was paid; back in the game the room is theirs: "Who is here" has its link and its settings
    const paid4 = await tell({ type: 'checkout.session.completed', data: { object: { id: 'cs_room_shop', payment_status: 'paid', amount_total: 5900, subscription: 'sub_room_shop', customer: 'cus_room_shop', metadata: { item: 'room', device: devO, account: 'Roomy' } } } });
    await owner.go('&paid=room');
    const told4 = await until(async () => { const t = await owner.said(); return /"Roomy's room" is yours/.test(t) ? t : null; });
    await o.click('.pill.players');
    await o.waitForSelector('.roster.on', { timeout: 20000 });
    const mine4 = await until(() => o.evaluate(() => { const row = [...document.querySelectorAll('.roster .who.room.mine')].find((r) => /Roomy/.test(r.textContent)); return row ? { name: row.querySelector('b').textContent, sub: row.querySelector('small').textContent, acts: [...row.querySelectorAll('.acts button')].map((b) => b.textContent), rows: document.querySelectorAll('.roster .who.room.mine').length } : null; }));
    // its name and its password, from the form
    await owner.roomButton('Name, password');
    await o.waitForSelector('.chooser.on', { timeout: 20000 });
    await o.fill('.chooser .fields label:nth-of-type(1) input', 'The Den');
    await o.fill('.chooser .fields label:nth-of-type(2) input', 'open sesame');
    await o.click('.chooser .save');
    const kept4 = await until(() => o.evaluate(async () => { const r = (await (await fetch(`/api/myroom?device=${localStorage.getItem('mmf.device')}`)).json()).room; return r && r.name === 'The Den' && r.locked ? r : null; }));
    check('once Stripe says it is paid the room is theirs: "Who is here" has it — its link, its name, its password, its boards, its subscription; a name and a password are given from a form',
      paid4 === 200 && !!told4 && mine4?.name === "Roomy's room" && mine4.rows === 1 && /Yours · reached by its link only · up to 50 visitors · no password/.test(mine4.sub) && mine4.acts.join() === 'Go there,Copy its link,Name, password,Empty its boards,Subscription' && kept4?.name === 'The Den' && kept4.locked === true && /^own-[a-z0-9]{8}$/.test(kept4.id),
      JSON.stringify({ paid4, told4: (told4 || '').slice(-120), mine4, kept4 }));
    // its owner goes there by its link (no password asked of them); a friend opens the same link: the password is asked for
    const id = kept4.id;
    await owner.go(`&room=${id}`);
    const inO = await until(() => o.evaluate((id) => { const a = window.__mmf; return a.presence && a.presence.mode === 'online' && a.presence.room === id ? { room: a.presence.room, label: a.presence.label, host: a.presence.host, own: a.presence.inOwn } : null; }, id));
    const friend = await visitor(), f = friend.p;
    await friend.go(`&room=${id}`);
    await f.waitForSelector('.chooser.on', { timeout: 30000 });
    const asked1 = await f.evaluate(() => ({ title: document.querySelector('.chooser h2').textContent, lead: document.querySelector('.chooser .lead').textContent, kind: document.querySelector('.chooser .fields input').type }));
    await f.fill('.chooser .fields input', 'open says me');
    await f.press('.chooser .fields input', 'Enter');
    const asked2 = await until(() => f.evaluate(() => (document.querySelector('.chooser.on') && /not its password/.test(document.querySelector('.chooser .lead').textContent) ? document.querySelector('.chooser .lead').textContent : null)));
    await f.fill('.chooser .fields input', 'open sesame');
    await f.press('.chooser .fields input', 'Enter');
    const inF = await until(() => f.evaluate((id) => { const a = window.__mmf; return a.presence && a.presence.mode === 'online' && a.presence.room === id && a.presence.count === 2 ? { room: a.presence.room, label: a.presence.label, host: a.presence.host, count: a.presence.count, address: location.search } : null; }, id));
    const seen4 = await until(() => o.evaluate(() => (window.__mmf.presence.count === 2 ? [...window.__mmf.presence.peers.values()].map((p) => p.name) : null)));
    const saidF = await friend.said();
    check('its owner goes there by its link and is asked nothing; a friend who opens the link is asked for the password — a wrong one is refused, the right one lets them in, and the two see each other in a room that is theirs alone',
      inO?.host === true && inO.own === true && inO.label === 'The Den' && asked1.title === '"The Den" has a password' && asked1.kind === 'password' && /Type it to come in/.test(asked1.lead) && !!asked2 && inF?.host === false && inF.label === 'The Den' && /room=own-/.test(inF.address) && !/sesame/.test(inF.address)
      && seen4?.length === 1 && /a room of its own: only those who were given its link are here/.test(saidF), JSON.stringify({ inO, asked1, asked2, inF, seen4, saidF: saidF.slice(-200) }));
    // the friend really plays the bell: the score goes on the boards of the room — and on the world's
    await f.evaluate(() => new Promise((done) => {
      const a = window.__mmf, booth = a.world.games.booths.list.find((b) => b.id === 'bell');
      a.playBooth(booth);
      const tick = () => {
        const s = a.fair.session;
        if (!s) return done(true);
        if (!s.over && s.gauge !== null && s.gauge > 0.85) a.input._clicks++;
        requestAnimationFrame(tick);
      };
      tick();
    }));
    const boardsF = await until(() => f.evaluate(() => { const a = window.__mmf, r = a.fair.roomTops.bell, w = a.fair.tops.bell; return r && r.day.length ? { room: r.day, world: w.day, name: a.presence.name } : null; }));
    const boardsO = await until(() => o.evaluate(() => { const r = window.__mmf.fair.roomTops.bell; return r && r.day.length ? r.day : null; }));
    const world4 = await (await fetch(`${BASE}/api/scores?board=bell`)).json();
    // (a picture of the board of the bell, as it stands in a room of one's own: the room on the left, the world on the right)
    await f.evaluate(() => { const m = window.__mmf, mesh = m.fair.stands.bell.board.mesh, ry = mesh.rotation.y, p = mesh.position; m.setCam(p.x + 5.2 * Math.sin(ry), p.y, p.z + 5.2 * Math.cos(ry), (ry * 180) / Math.PI, 0); });
    await new Promise((r) => setTimeout(r, 2500));
    await f.screenshot({ path: path.join(ROOT, 'tools/preview/shop-room-board.png') });
    await f.evaluate(() => window.__mmf.setMode('walk', true));
    check('a score made in a room of one\'s own goes on the boards of the room and on the world\'s: the friend sees both, the owner sees it arrive on the board of the room',
      boardsF?.room.length === 1 && boardsF.room[0].name === boardsF.name && boardsF.world.some((e) => e.name === boardsF.name && e.score === boardsF.room[0].score) && boardsO?.[0]?.score === boardsF.room[0].score && world4.tops.day.some((e) => e.score === boardsF.room[0].score) && !world4.room,
      JSON.stringify({ boardsF, boardsO, world: world4.tops.day }));
    // its owner puts the friend out: back to the rooms of the fair, and told so
    await o.click('.pill.players');
    await o.waitForSelector('.roster.on', { timeout: 20000 });
    const hostActs = await until(() => o.evaluate(() => { const b = [...document.querySelectorAll('.roster .list .acts button')].map((e) => e.textContent); return b.length ? b : null; }));
    await owner.roomButton('Put out');
    const outF = await until(() => f.evaluate(() => { const a = window.__mmf; return a.presence.mode === 'online' && /^main/.test(a.presence.room) && /room=main/.test(location.search) ? { room: a.presence.room, address: location.search, own: a.presence.inOwn } : null; }));
    const saidOut = await friend.said();
    const backIn = await f.evaluate(async (id) => { const r = await fetch('/api/room/enter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ room: id, device: localStorage.getItem('mmf.device'), password: 'open sesame' }) }); return r.status; }, id);
    check('the owner of the room puts a visitor out from "Who is here": the visitor is back in a room of the fair, and told why',
      hostActs.join() === 'Put out' && /^main/.test(outF?.room || '') && outF.own === false && /room=main/.test(outF.address) && /The owner of "The Den" has put you out of it/.test(saidOut) && backIn === 200,
      JSON.stringify({ hostActs, outF, saidOut: saidOut.slice(-160), backIn }));
    // ---- a room for good: the friend who was put out buys one of their own, once — no subscription, and it is said so
    {
      const devF = await f.evaluate(() => localStorage.getItem('mmf.device'));
      await f.evaluate(async (device) => { await fetch('/api/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create', device, name: 'Goody', password: 'another long password' }) }); }, devF);
      await friend.go();
      await f.waitForFunction(() => document.querySelector('.shop-icon').classList.contains('selling'), null, { timeout: 20000 });
      await f.click('.shop-icon');
      await f.waitForSelector('.shop.on .card[data-item="room"]', { timeout: 20000 });
      await f.evaluate(() => document.querySelector('.shop .card[data-item="room"]').click());
      const nG = asked.length;
      await Promise.all([f.waitForURL(/checkout\.stripe\.test/, { timeout: 20000 }), f.evaluate(() => [...document.querySelectorAll('.shop .detail .acts button')].find((b) => /for good/.test(b.textContent)).click())]);
      const formG = asked[nG];
      const paidG = await tell({ type: 'checkout.session.completed', data: { object: { id: 'cs_room_good', payment_status: 'paid', amount_total: 19900, subscription: null, customer: 'cus_room_good', metadata: { item: 'room', device: devF, account: 'Goody', life: '1' } } } });
      await friend.go('&paid=room');
      const toldG = await until(async () => { const t = await friend.said(); return /"Goody's room"/.test(t) ? t : null; });
      await f.click('.pill.players');
      await f.waitForSelector('.roster.on', { timeout: 20000 });
      const mineG = await until(() => f.evaluate(() => { const row = [...document.querySelectorAll('.roster .who.room.mine')].find((r) => /Goody/.test(r.textContent)); return row ? { sub: row.querySelector('small').textContent, acts: [...row.querySelectorAll('.acts button')].map((b) => b.textContent), offer: !!document.querySelector('.roster .room-offer') } : null; }));
      const recG = await f.evaluate(async () => (await (await fetch(`/api/myroom?device=${localStorage.getItem('mmf.device')}`)).json()));
      // (a subscription that ends elsewhere leaves it awake)
      await tell({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_room_shop_other' } } });
      const stillG = await f.evaluate(async () => (await (await fetch(`/api/myroom?device=${localStorage.getItem('mmf.device')}`)).json()).room?.state);
      check('a room may be bought for good instead: the second button of its card asks for one payment of $199 — no subscription —; paid, the room is theirs for good: "Who is here" says so, there is no subscription to look after, and nothing puts it to sleep',
        formG?.get('mode') === 'payment' && formG.get('line_items[0][price_data][unit_amount]') === '19900' && formG.get('line_items[0][price_data][recurring][interval]') === null && formG.get('metadata[item]') === 'room' && formG.get('metadata[life]') === '1' && formG.get('metadata[account]') === 'Goody'
        && paidG === 200 && !!toldG && /Yours for good · reached by its link only/.test(mineG?.sub || '') && mineG.acts.join() === 'Go there,Copy its link,Name, password,Empty its boards' && !mineG.offer
        && recG.room?.life === true && recG.room.managed === false && recG.price === 5900 && recG.life === 19900 && stillG === 'live',
        JSON.stringify({ form: formG?.toString().slice(0, 300), paidG, toldG: (toldG || '').slice(-140), mineG, recG, stillG }));
    }
    await flip({ userRooms: false });
    await friend.context.close();
    await owner.context.close();
  }
  // ---- the card of the Game Pass comes by itself — six times at the most: 15 min, 1 h, 2 h, a day, two days and
  // three days after the first visit, each time with words of its own (src/app/pitches.js). Who comes back the
  // next day with only the first seen gets the card of the next day (the two of the first day are passed), and
  // not again in that visit; the administrator's link shows the six in turn
  {
    const ctx5 = await browser.newContext({ viewport: { width: 960, height: 560 }, deviceScaleFactor: 1 });
    await ctx5.addInitScript(() => { if (!sessionStorage.getItem('mmf.test.set')) { sessionStorage.setItem('mmf.test.set', '1'); localStorage.setItem('mmf.name', 'Wanderer'); localStorage.setItem('mmf.first', String(Date.now() - 25 * 3600_000)); localStorage.setItem('mmf.passcards', '1'); } });
    const p5 = await ctx5.newPage();
    p5.on('pageerror', (e) => logs.push(e.message));
    await p5.goto(`${BASE}/?q=${opt.q || 'low'}&pitch=1&back=1`); // (?pitch: the cards come by themselves on this page; ?back: a visitor who has been here)
    await p5.waitForFunction(() => window.__mmf && window.__mmf.ready && window.__mmf.player && window.__mmf.shop.open && window.__mmf.input.enabled, null, { timeout: 240000 });
    await p5.evaluate(() => window.__mmf.playedFor(100)); // (a minute and a half played in this visit)
    await p5.waitForFunction(() => document.querySelector('.pitch.on')?.dataset.kind === 'pass', null, { timeout: 60000 });
    const card5 = await p5.evaluate(() => { const b = document.querySelector('.pitch'); return { eyebrow: b.querySelector('.eyebrow').textContent, title: b.querySelector('h2').textContent, perks: [...b.querySelectorAll('.perks li')].map((li) => [li.querySelector('b')?.textContent || '', li.querySelector('span')?.textContent || '']), tag: b.querySelector('.cost').textContent, costSeen: b.querySelector('.cost').getClientRects().length > 0, oneRow: Math.abs(b.querySelector('.yes').getBoundingClientRect().top - b.querySelector('.no').getBoundingClientRect().top) < 12, fits: b.querySelector('.sheet').scrollHeight <= b.querySelector('.sheet').clientHeight + 1, yes: b.querySelector('.yes').textContent, no: b.querySelector('.no').textContent, seen: localStorage.getItem('mmf.passcards') }; });
    await p5.waitForTimeout(1200); // (its buttons wake up after a moment)
    await p5.screenshot({ path: path.join(ROOT, 'tools/preview/shop-pass-card.png') });
    await p5.keyboard.press('Escape');
    await p5.waitForFunction(() => !document.querySelector('.pitch.on'), null, { timeout: 10000 });
    // (played on, in the same visit: it does not come again)
    await p5.evaluate(() => window.__mmf.playedFor(400));
    await p5.waitForTimeout(4000);
    const again5 = await p5.evaluate(() => ({ kind: document.querySelector('.pitch.on')?.dataset.kind || '', seen: localStorage.getItem('mmf.passcards') }));
    if (again5.kind) await p5.keyboard.press('Escape');
    // (the administrator's link: the six cards, in turn, then the first again)
    const shown5 = [];
    for (let k = 0; k < 7; k++) {
      await p5.evaluate(() => window.__mmf.hud.emit('show', 'pass'));
      await p5.waitForFunction(() => document.querySelector('.pitch.on'), null, { timeout: 10000 });
      shown5.push(await p5.evaluate(() => document.querySelector('.pitch h2').textContent));
      await p5.keyboard.press('Escape');
      await p5.waitForFunction(() => !document.querySelector('.pitch.on'), null, { timeout: 10000 });
    }
    const after5 = await p5.evaluate(() => localStorage.getItem('mmf.passcards'));
    await ctx5.close();
    check('the card of the Game Pass comes by itself at its times — back the next day with only the first seen, one gets the card of the next day, the two of the first day passed —: what the pass gives in five tiles, its price, words of its own and a way to say no of its own; not again in that visit; the administrator\'s link shows the six in turn, counting nothing',
      card5.eyebrow === 'You came back' && card5.title === 'Back the next day. The oasis noticed.' && card5.perks.length === 5 && card5.perks.every(([w, m]) => w && m) && card5.perks[0][0] === 'Every hat'
      && card5.tag === '$19 a month · stop whenever you like' && card5.costSeen && card5.oneRow && card5.fits && card5.yes === 'Get the Game Pass · $19 a month' && card5.no === 'Maybe tomorrow' && card5.seen === '4'
      && again5.kind !== 'pass' && again5.seen === '4' && new Set(shown5.slice(0, 6)).size === 6 && shown5[6] === shown5[0] && shown5[0] === 'You clearly like it here.' && after5 === '4',
      JSON.stringify({ card5, again5, shown5, after5 }));
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
