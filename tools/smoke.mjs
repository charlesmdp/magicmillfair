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
  // (the legal notice: who publishes the site — the company and how to reach it — and who hosts it)
  await page.evaluate(() => document.querySelector('.legal-tabs [data-doc="notice"]').click());
  const notice = await page.evaluate(() => ({ tab: document.querySelector('.legal-tabs .on')?.textContent, text: document.querySelector('.legal-body').textContent }));
  await page.evaluate(() => document.querySelector('.legal-x').click());
  const legalClosed = await page.evaluate(() => !document.querySelector('.legal').classList.contains('on'));
  console.log(`small print: ${JSON.stringify({ extras, legal, terms, notice: { tab: notice.tab, chars: notice.text.length }, legalClosed })}`);
  if (!extras.full || extras.links !== 'Terms of use,Privacy,Legal notice' || !extras.counted || !legal.open || legal.panel || legal.tab !== 'Privacy' || legal.sections < 5 || legal.names !== 4 || terms.tab !== 'Terms of use' || terms.sections < 5
    || notice.tab !== 'Legal notice' || !/MY BIG LEO/.test(notice.text) || !/SIREN 880 338 827/.test(notice.text) || !/Cloudflare, Inc\./.test(notice.text) || !/101 Townsend Street/.test(notice.text) || !legalClosed) { failed = true; console.log('FAIL: the small print, the full screen control or the script that counts the visits'); }
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
  // who has been here — a name, a colour chosen — is not shown the card again: straight into the world, as they
  // were (the tools' pages ask for it with ?back; ?welcome shows the card all the same)
  {
    const again = await context.newPage();
    await again.goto(`${page.url().split('?')[0]}?q=low&back=1`);
    await again.waitForFunction(() => window.__mmf?.ready && document.querySelector('.splash')?.classList.contains('done'), null, { timeout: 240000 });
    const back = await again.evaluate(() => ({ card: document.querySelector('.card')?.classList.contains('ready'), hud: document.querySelector('.hud').classList.contains('on'), name: window.__mmf.hud.nameInput?.value ?? null, walking: window.__mmf.state?.mode ?? null }));
    // (one browser, one visitor — app/OneTab.js: this second tab came into the world, so the first one steps aside —
    // its place in the room let go, silent, nothing drawn, the card that says so —; "Play here" takes the game back,
    // and the other tab steps aside in turn; when the tab that plays goes, the one aside says so)
    const side = (p) => p.evaluate(async () => {
      const a = window.__mmf, f0 = a.frames;
      await new Promise((r) => setTimeout(r, 700));
      return { away: a.hud.away, card: !document.querySelector('.elsewhere').hidden, words: document.querySelector('.elsewhere p').textContent, asleep: !!a.presence?.asleep, input: a.input.enabled, still: a.frames === f0, playing: a.tab.playing, mute: a.audio.away, status: a.presence?.mode };
    });
    const plays = (p) => p.evaluate(async () => {
      const a = window.__mmf, f0 = a.frames;
      for (let i = 0; i < 100 && a.frames < f0 + 4; i++) await new Promise((r) => setTimeout(r, 100)); // (a few frames drawn: it moves again)
      return { away: a.hud.away, asleep: !!a.presence?.asleep, input: a.input.enabled, moving: a.frames >= f0 + 4, playing: a.tab.playing, mute: a.audio.away };
    });
    await page.waitForFunction(() => window.__mmf.hud.away, null, { timeout: 15000 }).catch(() => {});
    const aside = await side(page), playsThere = await plays(again);
    // (Enter on the card of the first tab: it takes the game back, the second steps aside)
    await page.bringToFront();
    await page.keyboard.press('Enter');
    await again.waitForFunction(() => window.__mmf.hud.away, null, { timeout: 15000 }).catch(() => {});
    const takenBack = await plays(page), asideThere = await side(again);
    // (a click on the card of the second: it plays again; then it goes back to the welcome card — the first says so)
    await again.bringToFront();
    await again.click('.elsewhere .play-here');
    await page.waitForFunction(() => window.__mmf.hud.away, null, { timeout: 15000 }).catch(() => {});
    await again.goto(`${page.url().split('?')[0]}?q=low&back=1&welcome=1`);
    await again.waitForSelector('.card.ready', { timeout: 240000 });
    const asked = await again.evaluate(() => !document.querySelector('.splash').classList.contains('done'));
    await page.waitForFunction(() => /was closed/.test(document.querySelector('.elsewhere p').textContent), null, { timeout: 15000 }).catch(() => {});
    const closed = await side(page);
    await again.close();
    await page.bringToFront();
    await page.click('.elsewhere .play-here');
    const taken = await plays(page);
    console.log(`back again: ${JSON.stringify({ back, asked })}`);
    if (back.card || !back.hud || !asked) { failed = true; console.log('FAIL: a visitor who comes back is shown the card again (or ?welcome no longer shows it)'); }
    console.log(`two tabs: ${JSON.stringify({ aside, playsThere, takenBack, asideThere, closed, taken })}`);
    const steppedAside = (s) => s.away && s.card && s.asleep && !s.input && s.still && !s.playing && s.mute && s.status === 'away';
    const playing = (s) => !s.away && !s.asleep && s.input && s.moving && s.playing && !s.mute;
    if (!steppedAside(aside) || !/you are playing there/.test(aside.words) || !playing(playsThere) || !playing(takenBack) || !steppedAside(asideThere) || !steppedAside(closed) || !/was closed/.test(closed.words) || !playing(taken)) { failed = true; console.log('FAIL: two tabs of one browser are one visitor — the one that came last plays, the other steps aside (silent, still, out of the room) until "Play here" (a click or Enter), and says so when the one that plays goes'); }
  }
  // the two cards that make an offer in full (an account, the Game Pass): shown when asked for, they say what
  // they offer, keep the page from doing anything else meanwhile, and Escape closes them. The emotes behind the
  // smile come with the pictures of the animals; the map stars the big attractions; the settings have the
  // switch of the camera that stays behind (off unless asked for)
  {
    const cards = [];
    for (const kind of ['account', 'pass']) {
      await page.evaluate((kind) => { window.__took = 'open'; window.__mmf.pitch(kind, true).then((v) => { window.__took = v; }); }, kind);
      await page.waitForFunction(() => document.querySelector('.pitch')?.classList.contains('on'), null, { timeout: 8000 });
      const card = await page.evaluate(() => { const b = document.querySelector('.pitch'); return { title: b.querySelector('h2').textContent, perks: b.querySelectorAll('.perks li').length, yes: b.querySelector('.yes').textContent, busy: window.__mmf.busyNow() }; });
      await page.keyboard.press('Escape');
      await frames(2);
      cards.push({ ...card, closed: await page.evaluate(() => !document.querySelector('.pitch').classList.contains('on') && window.__took === false) });
    }
    await page.click('[data-act="emote"]');
    await frames(3);
    const emotes = await page.evaluate(() => {
      const box = document.querySelector('.emotes'), drawn = [...box.querySelectorAll('.beast .pic canvas')].filter((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 12) return true; return false; }).length;
      // (after the ten animals, the mushroom cloud: last, locked until every relic is found, its picture greyed)
      const cloud = box.querySelector('.zoo .beast.cloud');
      return { on: box.classList.contains('on'), beasts: box.querySelectorAll('.beast').length, drawn, cloud: cloud && { last: cloud === box.querySelector('.zoo').lastElementChild, locked: cloud.classList.contains('locked'), words: cloud.textContent, pic: !!cloud.querySelector('.pic canvas') } };
    });
    await page.click('[data-act="emote"]');
    const more = await page.evaluate(() => ({ stars: (window.__mmf.hud.attractions || []).map((a) => a.id).join(), behind: document.querySelector('[data-set="behind"]')?.getAttribute('aria-pressed') }));
    console.log(`offers, emotes, stars: ${JSON.stringify({ cards, emotes, more })}`);
    if (cards.length !== 2 || cards.some((c) => !c.title || c.perks < 3 || !c.yes || !c.busy || !c.closed) || !/account/i.test(cards[0].yes) || !/Game Pass/.test(cards[1].yes)
      || !emotes.on || emotes.beasts !== 11 || emotes.drawn < 1 || !emotes.cloud?.last || !emotes.cloud.locked || !/of 25 relics/.test(emotes.cloud.words) || !emotes.cloud.pic || more.stars !== 'climb,race,wing' || more.behind !== 'false') { failed = true; console.log('FAIL: the cards that make an offer, the pictures of the animals in the emotes, the stars of the map or the switch of the camera'); }
  }
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
