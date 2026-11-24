// Dev tool: a delivery from end to end, with a visitor in the world. Builds the site twice — two versions, each
// with its own name — serves the first on the Node server and plays a visitor; then throws the owner's switches
// (what is released), asks every page to refresh, and at last replaces the server by one that serves the second
// version, as a delivery does (every connection is cut): the page must notice, say so, wait for a safe moment,
// load itself again and bring the visitor back to the same spot in the same room — with what is new, once.
// The owner's part is played at the back office (the page /admin), opened with the key: the switches are thrown
// from there, a word is said to every room, a line is refused on a board, somebody is kept out, the figures set.
// Also: a plain build (what goes online) leaves nothing of the game on the page for a console to pick up.
// usage: node tools/update-test.mjs [--q=low]      (npm run test:update)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { stubOutside } from './lib/outside.mjs';
import { sign, randomId } from '../server/token.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
import { botFlight } from '../src/world/zones/games/hollow/tunnel.js'; // (the lab's: the lap its own bot flies)

const PORT = 8797, BASE = `http://127.0.0.1:${PORT}`, ADMIN_KEY = 'update-test-admin-key', SCORE_SECRET = 'update-test-score-secret';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mmf-update-test-'));
const ONE = 'aaaaaaa', TWO = 'bbbbbbb';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

/** A build of the site that says it is version `commit` (what the host's build variables say on a delivery). */
async function make(commit, dir, test = true) {
  process.env.GITHUB_SHA = `${commit}0000000000000000000000000000000000`.slice(0, 40);
  delete process.env.WORKERS_CI_COMMIT_SHA; delete process.env.CF_PAGES_COMMIT_SHA;
  await build({ root: ROOT, logLevel: 'error', ...(test && { define: { __TEST__: 'true' } }), build: { outDir: dir, emptyOutDir: true } });
}

let server = null, serverLog = '';
async function serve(dist) {
  server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ADMIN_KEY, SCORE_SECRET, FREE_ROOMS: '1', DIST_DIR: dist, SCORES_FILE: path.join(TMP, 'store.json'), BUILD_ID: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', (d) => { serverLog += d; });
  server.stderr.on('data', (d) => { serverLog += d; });
  for (let i = 0; i < 300; i++) { try { if ((await fetch(`${BASE}/healthz`)).ok) return; } catch { /* not up yet */ } await sleep(100); }
  throw new Error(`the server did not start:\n${serverLog}`);
}
const stop = () => new Promise((resolve) => { if (!server || server.exitCode !== null) return resolve(); server.once('exit', resolve); server.kill('SIGTERM'); });
const api = async (target, body) => { const res = await fetch(`${BASE}${target}`, { method: body ? 'POST' : 'GET', headers: { ...(body && { 'content-type': 'application/json' }), authorization: `Bearer ${ADMIN_KEY}`, origin: BASE }, ...(body && { body: JSON.stringify(body) }) }); return { status: res.status, body: await res.json().catch(() => null) }; };

console.log('building two versions…');
await make(ONE, path.join(TMP, 'one'));
await make(TWO, path.join(TMP, 'two'));
await serve(path.join(TMP, 'one'));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const logs = [];
try {
  const context = await browser.newContext({ viewport: { width: 960, height: 560 }, deviceScaleFactor: 1 });
  await stubOutside(context);
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebSocket connection/.test(m.text())) logs.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => logs.push(e.message));
  const ready = () => page.waitForFunction(() => window.__mmf && window.__mmf.ready && window.__mmf.player && window.__mmf.input.enabled && window.__mmf.presence, null, { timeout: 240000 });
  const frames = (n) => page.evaluate((n) => { const app = window.__mmf; const target = app.frames + n; return new Promise((res) => { const tick = () => (app.frames >= target ? res() : requestAnimationFrame(tick)); tick(); }); }, n);
  const state = () => page.evaluate(() => {
    const m = window.__mmf, bar = document.querySelector('.update-bar'), news = document.querySelector('.update-news');
    return {
      build: m.version, x: +m.player.pos.x.toFixed(1), z: +m.player.pos.z.toFixed(1), room: m.presence.room, mode: m.presence.mode, online: m.presence.mode === 'online',
      bar: bar.classList.contains('on') ? bar.querySelector('.update-text').textContent : '', news: news.classList.contains('on') ? news.textContent : '',
      extras: Object.keys(m.extras || {}).sort().join(), figures: !!document.querySelector('.open-figures'), release: m.updates.release, live: m.updates.live,
      splash: !document.querySelector('.splash')?.classList.contains('done'),
    };
  });
  // (a short countdown, as the tools may ask: the game's own is three quarters of a minute)
  await page.goto(`${BASE}/?q=${opt.q || 'low'}&room=fair&count=4`);
  await page.waitForSelector('.card.ready', { timeout: 240000 });
  await page.fill('#mmf-name', 'Traveller');
  await page.click('.go');
  await ready();
  await page.waitForFunction(() => window.__mmf.presence.mode === 'online' && window.__mmf.updates.release && Object.keys(window.__mmf.extras || {}).length >= 2, null, { timeout: 60000 });
  await page.evaluate(() => { const m = window.__mmf; m.player.teleport(-61, -22.5, 1.2); m.rig.snap(m.player.pos, 1.2 + Math.PI); });
  await frames(20);
  const first = await state();
  check('version one, a visitor in the world: nothing asks for a refresh; what is released by default is there (the caves, the figures) and nothing else',
    first.build.includes(ONE) && first.live === ONE && !first.bar && first.online && first.room === 'fair' && first.extras === 'caves,stats' && first.figures && first.release.slide === false, JSON.stringify(first));

  // ---- the back office: a page of its own, opened with the owner's key
  const office = await context.newPage();
  office.on('dialog', (d) => d.accept());
  office.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) logs.push(`[office] ${m.text().slice(0, 300)}`); });
  office.on('pageerror', (e) => logs.push(`[office] ${e.message}`));
  const door = await office.goto(`${BASE}/admin`); // (asked for without its last slash)
  const fence = door.headers()['content-security-policy'] || '';
  await office.fill('#key', 'not-the-key');
  await office.click('#login-form button[type="submit"]');
  await office.waitForSelector('#login-error:not([hidden])', { timeout: 20000 });
  const refusedKey = { text: await office.textContent('#login-error'), shut: await office.evaluate(() => document.getElementById('office').hidden) };
  await office.fill('#key', ADMIN_KEY);
  await office.click('#login-form button[type="submit"]');
  await office.waitForSelector('#office:not([hidden])', { timeout: 20000 });
  await office.waitForFunction(() => document.getElementById('fact-here').textContent === '1' && document.querySelectorAll('#switches .switch').length >= 5, null, { timeout: 30000 });
  const desk = await office.evaluate(() => ({
    url: location.pathname, who: document.getElementById('who').textContent, tabs: [...document.getElementById('tabs').children].map((b) => b.textContent).join(),
    build: document.getElementById('fact-build').textContent, here: document.getElementById('fact-here').textContent, old: document.getElementById('fact-old').textContent,
    switches: [...document.querySelectorAll('#switches .switch')].map((s) => `${s.querySelector('b').textContent}=${s.querySelector('.toggle')?.getAttribute('aria-pressed') ?? s.querySelector('.stages .on')?.textContent}`),
    foreign: [...document.querySelectorAll('script[src], link[href], img[src]')].map((n) => n.src || n.href).filter((u) => !u.startsWith(location.origin)),
  }));
  check('the back office: /admin opens with the owner\'s key and no other; the page is fenced in (nothing from elsewhere, never framed); it says which version is online, how many are connected, and shows every switch as it stands',
    desk.url === '/admin/' && /script-src 'self'/.test(fence) && /frame-ancestors 'none'/.test(fence) && /not recognised/.test(refusedKey.text) && refusedKey.shut && /owner/.test(desk.who) && desk.tabs === 'Releases,Rooms,High scores,Sponsors & plaques,Kept out,Figures,Administrators'
    && desk.build === ONE && desk.here === '1' && desk.old === '0' && desk.switches.includes('The game in figures=true') && desk.switches.includes('Mostly Down — the water slide=false') && desk.switches.includes('The sky villages=Hidden') && !desk.foreign.length, JSON.stringify({ fence, refusedKey, desk }));
  const throwSwitch = (title) => office.evaluate((title) => [...document.querySelectorAll('#switches .switch')].find((s) => s.querySelector('b').textContent === title).querySelector('.toggle').click(), title);

  // ---- a word to every room, said from there
  await office.fill('#announce', 'Fireworks at nine, on the pier!');
  await office.click('#announce-form button[type="submit"]');
  await page.waitForFunction(() => [...document.querySelectorAll('.chat .log > *')].some((l) => /Fireworks at nine/.test(l.textContent)), null, { timeout: 20000 });
  const word = { chat: await page.evaluate(() => [...document.querySelectorAll('.chat .log > *')].map((l) => l.textContent).find((t) => /Fireworks/.test(t))), note: await office.textContent('#announce-note') };
  // ---- the rooms; a line refused on a board; somebody kept out, then let back in; the figures set
  await office.click('#tabs [data-tab="rooms"]');
  await office.waitForFunction(() => document.querySelector('#rooms .item'), null, { timeout: 20000 });
  const roomsSeen = await office.evaluate(() => [...document.querySelectorAll('#rooms .item')].map((r) => r.textContent));
  // (the rules of the door are settings of the back office: a new room at 40 rather than 50, then back to the usual)
  await office.waitForFunction(() => document.getElementById('rule-open').value === '50', null, { timeout: 20000 });
  const usual = await office.evaluate(() => ['max', 'open', 'start', 'low'].map((k) => document.getElementById(`rule-${k}`).value).join());
  await office.fill('#rule-open', '40');
  await office.click('#rules-form button[type=submit]');
  await office.waitForFunction(() => /follows these numbers/.test(document.getElementById('toast').textContent), null, { timeout: 20000 });
  const ruled = (await api('/api/rooms')).body?.rules;
  await office.click('#rules-reset');
  await office.waitForFunction(() => /usual numbers/.test(document.getElementById('toast').textContent), null, { timeout: 20000 });
  const unruled = (await api('/api/rooms')).body?.rules;
  check('the back office: the rules of the rooms are settings — the owner changes when a new room opens, the door follows at once, and "Back to the usual" undoes it',
    usual === '200,50,20,8' && ruled?.open === 40 && ruled.max === 200 && unruled?.open === 50, JSON.stringify({ usual, ruled, unruled }));
  const posted = await fetch(`${BASE}/api/scores`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ board: 'bell', name: 'Cheater', score: 9999, run: await sign(SCORE_SECRET, { b: 'bell', t: Date.now() - 6000, n: randomId(9) }) }) });
  await office.click('#tabs [data-tab="scores"]');
  await office.waitForFunction(() => document.getElementById('board').options.length > 5, null, { timeout: 20000 });
  await office.selectOption('#board', 'bell');
  await office.selectOption('#period', 'day'); // (posted without an account: it is on the list of the day, and on no other)
  // (a great score that came with no game: the server did not believe it — it waits here, with the reason; the owner takes it)
  await office.waitForFunction(() => /Cheater/.test(document.getElementById('flagged').textContent), null, { timeout: 20000 });
  const doubted = await office.evaluate(() => ({ board: /Nobody on this list/.test(document.getElementById('scores').textContent), row: document.querySelector('#flagged .item').textContent }));
  await office.click('#flagged .item button');
  await office.waitForFunction(() => /Cheater/.test(document.getElementById('scores').textContent), null, { timeout: 20000 });
  const line = await office.evaluate(() => ({ boards: document.getElementById('board').options.length, row: document.querySelector('#scores .item').textContent }));
  await office.click('#scores .item button');
  await office.waitForFunction(() => /Nobody on this list/.test(document.getElementById('scores').textContent), null, { timeout: 20000 });
  const struck = (await (await fetch(`${BASE}/api/scores?board=bell`)).json()).tops.all.length;
  await office.click('#tabs [data-tab="bans"]');
  await office.fill('#ban-ip', '203.0.113.9');
  await office.fill('#ban-name', 'Mallory');
  await office.click('#ban-form button[type="submit"]');
  await office.waitForFunction(() => /203\.0\.113\.9/.test(document.getElementById('bans').textContent), null, { timeout: 20000 });
  const keptOut = await office.textContent('#bans');
  await office.click('#bans .item button');
  await office.waitForFunction(() => /Nobody is kept out/.test(document.getElementById('bans').textContent), null, { timeout: 20000 });
  await office.click('#tabs [data-tab="figures"]');
  await office.waitForFunction(() => document.querySelectorAll('#figures .tile').length >= 6, null, { timeout: 20000 });
  await office.fill('#fig-money', '250');
  await office.fill('#fig-passes', '7');
  await office.fill('#fig-people', '5000');
  await office.click('#figures-form button[type="submit"]');
  await office.waitForFunction(() => /\$250/.test(document.getElementById('figures').textContent) && /5000/.test(document.getElementById('figures').textContent), null, { timeout: 20000 });
  await office.screenshot({ path: path.join(ROOT, 'tools/preview/admin-figures.png'), fullPage: true });
  await office.click('#tabs [data-tab="sponsors"]');
  await office.waitForFunction(() => /No sponsor yet/.test(document.getElementById('sponsors').textContent), null, { timeout: 20000 });
  check('the back office: a word said to every room is read in the game; the rooms are listed with who is in them; a great score that came with no game waits for the owner, who takes it — then refuses the line; somebody is kept out and let back in; the figures are set',
    /The fair/.test(word.chat || '') && /Fireworks at nine, on the pier!/.test(word.chat) && /heard in 1 room/.test(word.note) && roomsSeen.length === 1 && /fair/.test(roomsSeen[0]) && /1 visitor/.test(roomsSeen[0])
    && posted.status === 200 && doubted.board && /Cheater/.test(doubted.row) && /no game came with it/.test(doubted.row) && line.boards >= 14 && /Cheater/.test(line.row) && /9,999/.test(line.row) && struck === 0 && /Mallory/.test(keptOut) && /address 203\.0\.113\.9/.test(keptOut),
    JSON.stringify({ word, roomsSeen, posted: posted.status, doubted, line, struck, keptOut: keptOut.slice(0, 80) }));
  await office.click('#tabs [data-tab="releases"]');
  await office.screenshot({ path: path.join(ROOT, 'tools/preview/admin-releases.png'), fullPage: true });

  // ---- the owner throws a switch off: only a refresh can undo what was switched on — said, counted down, done
  await throwSwitch('The game in figures');
  await page.waitForFunction(() => document.querySelector('.update-bar.on'), null, { timeout: 20000 });
  const off = await state();
  await page.waitForFunction(() => !window.__mmf || !window.__mmf.ready, null, { timeout: 30000 }).catch(() => {});
  await ready();
  await page.waitForFunction(() => window.__mmf.updates.release, null, { timeout: 30000 });
  await frames(10);
  const back = await state();
  check('a switch goes off: the bar says the fair has changed and counts down, the page loads itself again — and the visitor is back at the same spot, in the same room, without the welcome card',
    /The fair has changed/.test(off.bar) && /refreshing in \d+ s/.test(off.bar) && Math.hypot(back.x - first.x, back.z - first.z) < 1.5 && back.room === 'fair' && !back.splash && back.extras === 'caves' && !back.figures && !back.bar && !back.news, JSON.stringify({ off: off.bar, back }));

  // ---- …and on again: applied as the game runs, nobody is sent anywhere
  await office.waitForFunction(() => [...document.querySelectorAll('#switches .switch')].some((s) => s.querySelector('b').textContent === 'The game in figures' && s.querySelector('.toggle').getAttribute('aria-pressed') === 'false'), null, { timeout: 20000 });
  await throwSwitch('The game in figures');
  await page.waitForFunction(() => document.querySelector('.open-figures'), null, { timeout: 30000 });
  const on = await state();
  check('a switch goes on: what it releases is there at once, as the game runs — no refresh', on.extras === 'caves,stats' && on.figures && !on.bar && on.release.stats === true, JSON.stringify(on));

  // ---- two of the lab's games, thrown on from the back office like anything else: their files are fetched and
  // they are built as the game runs (in a build made as the delivered one is); each is played by its own bot, and
  // its time is on its board — the server noted when the run began, the game said when it ended
  await throwSwitch('Uphill Battle');
  await throwSwitch('The Hollow Hill');
  await page.waitForFunction(() => { const m = window.__mmf, e = m.extras || {}; return !!(e.hill && e.hollow && m.climbHill && m.flyHollow); }, null, { timeout: 60000 });
  await frames(6);
  const labOn = await state();
  const dayOf = async (id) => ((await api(`/api/scores?board=${id}`)).body.tops?.day || []).map((e) => ({ name: e.name, score: e.score }));
  /** One of them played by its bot, from its gate: what was so meanwhile, and what its board says afterwards. */
  const playLab = async (id, begin, run) => {
    await page.evaluate(([id, begin, run]) => { const m = window.__mmf, g = m.extras[id].gate || m.extras[id].stand; m.player.teleport(g.x, g.z, 0); m[begin](); m[run]().auto = true; }, [id, begin, run]);
    await frames(30);
    const during = await page.evaluate((run) => { const m = window.__mmf; return { on: !!m[run](), busy: m.busyNow(), keys: [...document.querySelectorAll('button')].some((b) => /keys$/.test(b.textContent) && b.style.display !== 'none') }; }, run);
    await page.waitForFunction((run) => !window.__mmf[run](), run, { timeout: 300000 });
    let day = [];
    for (let i = 0; i < 100 && !day.length; i++) { await sleep(200); day = await dayOf(id); }
    return { during, day, free: await page.evaluate(() => !window.__mmf.player.driver && !window.__mmf.busyNow()) };
  };
  const lap = botFlight().time;
  const flown = await playLab('hollow', 'flyHollow', 'hollowFlight');
  const climbed = await playLab('hill', 'climbHill', 'hillClimb');
  const others = { pond: (await api('/api/scores?board=pond')).status, run: (await api('/api/run', { board: 'pond' })).status };
  check('two games of the lab are thrown on from the back office: built as the game runs, no refresh; each is played by its own bot — the page would not refresh meanwhile, the keys are offered — and its time is on its board under the name of the visitor; a game that is still off has no board',
    labOn.extras === 'caves,hill,hollow,stats' && !labOn.bar && labOn.release.hill === true && labOn.release.hollow === true && labOn.release.pond === false
    && flown.during.on && flown.during.busy && flown.during.keys && flown.free && flown.day.length === 1 && flown.day[0].name === 'Traveller' && flown.day[0].score === lap
    && climbed.during.on && climbed.during.busy && climbed.free && climbed.day.length === 1 && climbed.day[0].name === 'Traveller' && climbed.day[0].score > 9000 && climbed.day[0].score < 90000
    && others.pond === 404 && others.run === 400,
    JSON.stringify({ extras: labOn.extras, lap, flown, climbed, others }));
  // ---- and each got what every game of the fair has: a stand by its gate — the four lists, under the panel of
  // a sponsor that is for sale from that moment —, a star on the map, planks at the forks; a game still off has
  // none of it
  const dressed = await page.evaluate(async () => {
    const m = window.__mmf, w = m.world, out = { stands: {}, slots: {} };
    for (const id of ['hill', 'hollow', 'pond']) {
      const st = w.games.stands?.[id], gate = m.extras[id]?.gate, p = st?.board.mesh.position;
      out.stands[id] = st ? { far: +Math.hypot(p.x - gate.x, p.z - gate.z).toFixed(1), dry: w.data.heightAt(p.x, p.z) > 0.5, first: st.lists?.day?.[0]?.name || '' } : null;
      out.slots[id] = (w.sponsorSlots || []).some((q) => q.id === `board:${id}`);
    }
    out.stars = (m.hud.attractions || []).map((a) => a.id).join();
    out.planks = [...new Set((m.labSigns || []).flatMap((p) => p.arms.map((a) => a.to)))].sort().join();
    out.posts = (m.labSigns || []).map((p) => p.id).join();
    return out;
  });
  check('the two games got what every game of the fair has, as the game runs: a stand by the gate with the time just made on it, a panel for a sponsor over it, a star on the map, planks at the forks — and the game that is still off has none of it',
    dressed.stands.hill && dressed.stands.hollow && !dressed.stands.pond && dressed.stands.hill.far > 2 && dressed.stands.hill.far < 12 && dressed.stands.hollow.far > 2 && dressed.stands.hollow.far < 12
    && dressed.stands.hill.dry && dressed.stands.hollow.dry && dressed.stands.hill.first === 'Traveller' && dressed.stands.hollow.first === 'Traveller'
    && dressed.slots.hill && dressed.slots.hollow && !dressed.slots.pond
    && dressed.stars === 'climb,race,wing,hill,hollow' && dressed.planks === 'hill,hollow' && dressed.posts === 'games-arrival,games-plaza,games-pondside,games-shore',
    JSON.stringify(dressed));
  await page.evaluate(([x, z]) => { const m = window.__mmf; m.player.teleport(x, z, 1.2); m.rig.snap(m.player.pos, 1.2 + Math.PI); }, [first.x, first.z]);
  await frames(6);

  // ---- the sky villages, stage by stage: "soon" builds their gate, closed; "open" builds the fifty of them
  const skyNow = () => page.evaluate(() => { const m = window.__mmf, g = m.world.sky; return { stage: g.stage, villages: g.villages.length, gate: !g.gate.hidden, closed: !!g.gate.closed, sign: !!g.group.getObjectByName('skygate-soon'), x: +m.player.pos.x.toFixed(1), z: +m.player.pos.z.toFixed(1) }; });
  const stageTo = async (label) => {
    await office.evaluate((label) => [...document.querySelectorAll('#switches .switch')].find((s) => s.querySelector('b').textContent === 'The sky villages').querySelectorAll('.stages button').forEach((b) => { if (b.textContent === label) b.click(); }), label);
    await page.waitForFunction(() => document.querySelector('.update-bar.on'), null, { timeout: 20000 });
    await page.waitForFunction(() => !window.__mmf || !window.__mmf.ready, null, { timeout: 30000 }).catch(() => {});
    await ready();
    await frames(10);
  };
  const hiddenSky = await skyNow();
  await stageTo('Soon');
  const soonSky = await skyNow();
  await page.evaluate(() => { const m = window.__mmf, g = m.world.sky.gate; m.player.teleport(g.arrive[0], g.arrive[1], g.arrive[2] + Math.PI); });
  await frames(12);
  const soonAsk = await page.evaluate(() => [...document.querySelectorAll('.prompt.on span')].map((e) => e.textContent));
  await page.keyboard.press('KeyE');
  await frames(4);
  const soonSaid = await page.evaluate(() => document.querySelector('.hud .note')?.textContent || '');
  await page.screenshot({ path: path.join(ROOT, 'tools/preview/sky-soon.png') });
  await stageTo('Open');
  const openSky = await skyNow();
  await frames(12);
  const openAsk = await page.evaluate(() => [...document.querySelectorAll('.prompt.on span')].map((e) => e.textContent));
  check('the sky villages come in three stages, thrown from the back office: hidden, nothing of them; soon, their gate stands there, closed, and says so; open, the fifty villages and the journey — each change refreshes the page at the same spot',
    hiddenSky.stage === 'hidden' && !hiddenSky.gate && hiddenSky.villages === 0 && soonSky.stage === 'soon' && soonSky.gate && soonSky.closed && soonSky.sign && soonSky.villages === 0 && Math.hypot(soonSky.x - first.x, soonSky.z - first.z) < 1.5
    && soonAsk.includes('The Sky Gate') && /Soon, the sky will open/.test(soonSaid) && openSky.stage === 'open' && openSky.villages === 50 && openSky.gate && !openSky.closed && !openSky.sign && openAsk.includes('Travel to a sky village'),
    JSON.stringify({ hiddenSky, soonSky, soonAsk, soonSaid, openSky, openAsk }));
  await page.evaluate(([x, z]) => { const m = window.__mmf; m.player.teleport(x, z, 1.2); m.rig.snap(m.player.pos, 1.2 + Math.PI); }, [first.x, first.z]);
  await frames(6);

  // ---- everybody is asked to refresh — but never in the middle of a sentence
  await page.keyboard.press('Enter');
  await page.waitForSelector('.chat.typing', { timeout: 10000 });
  await page.keyboard.type('half a sent');
  await office.click('#refresh-all');
  await page.waitForFunction(() => document.querySelector('.update-bar.on'), null, { timeout: 20000 });
  await sleep(7500); // (the countdown is long over)
  const typing = await state();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__mmf || !window.__mmf.ready, null, { timeout: 30000 }).catch(() => {});
  await ready();
  await frames(10);
  const asked = await state();
  check('everybody is asked to refresh: the page waits for the sentence being typed to be finished, then loads itself again (same spot); once done, it is not asked twice',
    /asks every page to refresh/.test(typing.bar) && /as soon as you have finished/.test(typing.bar) && Math.hypot(typing.x - first.x, typing.z - first.z) < 1.5 && Math.hypot(asked.x - first.x, asked.z - first.z) < 1.5 && asked.room === 'fair' && !asked.bar, JSON.stringify({ typing: typing.bar, asked }));

  // ---- a delivery: the server is replaced by one that serves version two; every connection is cut
  // (once this page has all that is released: the extras are fetched one after the other, the figures last — one
  // still on its way when the server goes would be asked of the next server, which has other files)
  await page.waitForFunction(() => ['caves', 'stats', 'hill', 'hollow'].every((k) => window.__mmf.extras?.[k]), null, { timeout: 120000 });
  await stop();
  await sleep(1500);
  const cut = await page.evaluate(() => window.__mmf.presence.mode);
  await serve(path.join(TMP, 'two'));
  await page.waitForFunction(() => document.querySelector('.update-bar.on'), null, { timeout: 120000 });
  const told = await state();
  await page.click('.update-now');
  await page.waitForFunction(() => window.__mmf && window.__mmf.version && !window.__mmf.version.includes('aaaaaaa'), null, { timeout: 240000 });
  await ready();
  await page.waitForFunction(() => document.querySelector('.update-news.on'), null, { timeout: 30000 }).catch(() => {});
  await frames(10);
  const two = await state();
  check('a delivery cuts every connection: reaching the relay again, the page learns that a new version is online and says so; refreshed, it is version two — same spot, same room — and says what is new',
    told.build.includes(ONE) && told.live === TWO && /A new version of the fair is ready/.test(told.bar) && two.build.includes(TWO) && !two.build.includes(ONE) && Math.hypot(two.x - first.x, two.z - first.z) < 1.5 && two.room === 'fair' && !two.splash && !two.bar && /What’s new/.test(two.news),
    JSON.stringify({ cut, told: { build: told.build, live: told.live, bar: told.bar }, two: { build: two.build, x: two.x, z: two.z, room: two.room, bar: two.bar, news: two.news.slice(0, 60) } }));
  await page.screenshot({ path: path.join(ROOT, 'tools/preview/update-news.png') });
  // (what is new is said once)
  await page.reload();
  await page.waitForSelector('.card.ready', { timeout: 240000 });
  await page.click('.go');
  await ready();
  await frames(10);
  const again = await state();
  check('what is new is said once: an ordinary visit afterwards has neither the card nor the bar', !again.news && !again.bar && again.build.includes(TWO), JSON.stringify({ news: again.news, bar: again.bar }));
  check('no error in the page', logs.length === 0, logs.slice(0, 4).join(' | '));
} catch (err) {
  check('test run', false, String(err && err.stack ? err.stack : err).slice(0, 600));
} finally {
  await browser.close();
  await stop();
}

// ---- what goes online: a plain build leaves nothing of the game on the page
console.log('building what goes online…');
await make('ccccccc', path.join(TMP, 'plain'), false);
const bundle = fs.readdirSync(path.join(TMP, 'plain/assets')).filter((f) => /^index-.*\.js$/.test(f)).map((f) => fs.readFileSync(path.join(TMP, 'plain/assets', f), 'utf8')).join('\n');
const version = JSON.parse(fs.readFileSync(path.join(TMP, 'plain/version.json'), 'utf8'));
check('a plain build — what goes online — leaves nothing of the game on the page for a console to pick up, and says which version it is in version.json',
  bundle.length > 100000 && !bundle.includes('__mmf') && version.commit === 'ccccccc' && fs.readFileSync(path.join(TMP, 'one/version.json'), 'utf8').includes(ONE), JSON.stringify({ size: bundle.length, mmf: bundle.includes('__mmf'), version }));

fs.rmSync(TMP, { recursive: true, force: true });
const failed = results.filter((r) => !r).length;
console.log(failed ? `\nupdate test FAILED (${failed} of ${results.length})` : `\nupdate test passed (${results.length} checks)`);
process.exit(failed ? 1 : 0);
