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
const ADMIN_KEY = 'duo-admin-key'; // (what the test server is given as the administrator's key)

const CF = !!opt.cloudflare;
let server;
if (CF) {
  // wrangler builds the site itself (build.command of wrangler.jsonc), exactly as a deployment does
  server = spawn(process.execPath, [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--inspector-port', String(PORT + 1), '--show-interactive-dev-session=false', '--var', `ADMIN_KEY:${ADMIN_KEY}`],
    { cwd: ROOT, env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
} else {
  await build({ root: ROOT, logLevel: 'error' });
  // (its own store, emptied first: a score kept from an earlier run would not be news to anyone)
  const store = path.join(ROOT, 'tools/preview/duo-test-store.json');
  fs.rmSync(store, { force: true });
  server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ADMIN_KEY, SCORES_FILE: store }, stdio: ['ignore', 'pipe', 'pipe'] });
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
  await context.addInitScript(() => { try { for (const k of ['mmf.run', 'mmf.follow']) if (localStorage.getItem(k) === null) localStorage.setItem(k, '0'); } catch { /* no storage */ } }); // (the tests walk with Shift to run, and turn the camera themselves)
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
  // a gesture of encouragement
  await alice.page.keyboard.press('Digit8');
  const clap = await until(() => bob.page.evaluate(() => [...window.__mmf.avatars.items.values()].some((it) => !!it.character.move)), 20000);
  check('Bob sees Alice clap', !!clap);
  // an animal of light (Alice has come often enough to have earned it)
  await alice.page.evaluate(() => { window.__mmf.who.days = 99; });
  await alice.page.keyboard.press('Enter');
  await frames(alice, 2);
  await alice.page.keyboard.type('/wolf');
  await alice.page.keyboard.press('Enter');
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
  // a line for those nearby only (Bob stands three metres from Alice): Tab switches who hears
  await alice.page.keyboard.press('KeyE'); // (Alice gets up)
  await frames(alice, 3);
  await alice.page.keyboard.press('Enter');
  await frames(alice, 2);
  await alice.page.keyboard.press('Tab');
  await alice.page.keyboard.type('psst, Bob');
  await alice.page.keyboard.press('Enter');
  const whisper = await until(() => bob.page.evaluate(() => [...document.querySelectorAll('.chat .log p.near')].map((e) => e.textContent).find((l) => /psst, Bob$/.test(l)) || null), 20000);
  check('a line said to those nearby reaches Bob, marked as such', !!whisper, JSON.stringify(whisper));
  // a game finished by one is seen by the other at once: a line in the chat, the board redrawn
  await alice.page.evaluate(() => window.__mmf.fair.boards.bell.start());
  await new Promise((r) => setTimeout(r, 2600)); // (a game of the striker lasts a few seconds: the server knows)
  await alice.page.evaluate(() => window.__mmf.scoreGame('bell', 'Ring the Bell', 7777, '7,777 on the scale'));
  const live = await until(() => bob.page.evaluate(() => [...document.querySelectorAll('.chat .log p')].map((e) => e.textContent).find((l) => /Ring the Bell: Alice — 7,777 points \(#1 today\)/.test(l)) || null), 20000);
  const shownToBob = await bob.page.evaluate(() => window.__mmf.fair.tops.bell?.day?.[0] || null);
  check('a score made by Alice is shown to Bob as soon as she finishes: a line in the chat, his board up to date', !!live && shownToBob?.name === 'Alice' && shownToBob.score === 7777, JSON.stringify({ live, shownToBob }));
  // who is here: everybody sees the names; the administrator also sees where from, and can put someone out
  await bob.page.click('.pill.players');
  await frames(bob, 3);
  const plain = await bob.page.evaluate(() => ({ rows: [...document.querySelectorAll('.roster .who b')].map((e) => e.textContent), acts: document.querySelectorAll('.roster .acts button').length, more: document.querySelectorAll('.roster .more').length }));
  await bob.page.keyboard.press('Escape');
  check('the head count opens the list of who is here — names only for a visitor', plain.rows.length === 2 && plain.rows.includes('Alice') && plain.rows.some((r) => /^Bob \(you\)$/.test(r)) && plain.acts === 0 && plain.more === 0, JSON.stringify(plain));
  await alice.page.keyboard.press('Enter');
  await frames(alice, 2);
  await alice.page.keyboard.type(`/admin ${ADMIN_KEY}`);
  await alice.page.keyboard.press('Enter');
  await until(() => alice.page.evaluate(() => window.__mmf.who.admin && window.__mmf.presence.admin), 20000);
  await alice.page.click('.pill.players');
  const seenByAdmin = await until(() => alice.page.evaluate(() => { const more = [...document.querySelectorAll('.roster .more')].map((e) => e.textContent); return more.length === 2 ? { more, acts: [...document.querySelectorAll('.roster .acts button')].map((e) => e.textContent) } : null; }), 20000);
  await alice.page.screenshot({ path: path.join(OUT, 'roster-admin.png') });
  check('the administrator also sees the address, the browser and the device of each, and can go to them, name them, kick or ban', !!seenByAdmin && seenByAdmin.more.every((m) => /127\.0\.0\.1|::1/.test(m) && /Chrome \d+ · /.test(m) && /device /.test(m)) && seenByAdmin.acts.join() === 'Go to,Make admin,Kick,Ban 1 h,Ban 1 day,Ban for good', JSON.stringify(seenByAdmin));
  const act = (who, label) => who.page.evaluate((label) => { const b = [...document.querySelectorAll('.roster .acts button')].find((e) => e.textContent === label); if (b) b.click(); return !!b; }, label);
  const apart = () => alice.page.evaluate(() => { const a = window.__mmf, o = [...a.presence.peers.values()][0]; return Math.hypot(o.x - a.player.pos.x, o.z - a.player.pos.z); });
  // the administrator is carried next to a visitor; a click on the large map carries them to that spot
  await bob.page.evaluate(() => { const a = window.__mmf; a.player.teleport(-60, -30, 0); });
  await until(async () => ((await apart()) > 30 ? true : null), 20000);
  const far = await apart();
  await act(alice, 'Go to');
  await frames(alice, 4);
  const close = await apart();
  await alice.page.keyboard.press('KeyM');
  await frames(alice, 4);
  const before = await alice.page.evaluate(() => { const p = window.__mmf.player.pos; return [p.x, p.z]; });
  const box = await alice.page.evaluate(() => { const r = document.querySelector('.bigmap canvas').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  await alice.page.mouse.click(box[0] + box[2] * 0.5, box[1] + box[3] * 0.5);
  await frames(alice, 4);
  const after = await alice.page.evaluate(() => { const a = window.__mmf, p = a.player.pos, v = a.hud.mapView; return { at: [p.x, p.z], centre: [(v.x0 + v.x1) / 2, (v.z0 + v.z1) / 2], open: document.querySelector('.bigmap').classList.contains('on') }; });
  check('the administrator goes where they like: next to a visitor, or to a spot clicked on the large map', far > 30 && close < 3 && !after.open && Math.hypot(after.at[0] - after.centre[0], after.at[1] - after.centre[1]) < 30 && Math.hypot(after.at[0] - before[0], after.at[1] - before[1]) > 5, JSON.stringify({ far, close, before, after }));
  // an announcement on the "important" channel: everybody gets it, in another colour
  await alice.page.keyboard.press('Enter');
  await frames(alice, 2);
  // (Tab goes round the channels: everyone, nearby, and — an administrator's — important)
  for (let k = 0; k < 3 && (await alice.page.evaluate(() => document.querySelector('.chat .chan').textContent)) !== 'Important'; k++) await alice.page.keyboard.press('Tab');
  const channel = await alice.page.evaluate(() => document.querySelector('.chat .chan').textContent);
  await alice.page.keyboard.type('The fair closes at ten');
  await alice.page.keyboard.press('Enter');
  const loud = await until(() => bob.page.evaluate(() => [...document.querySelectorAll('.chat .log p.important')].map((e) => e.textContent).find((l) => /The fair closes at ten$/.test(l)) || null), 20000);
  const bobChannels = await bob.page.evaluate(() => { const a = window.__mmf; a.hud.toggleChat(true); const b = document.querySelector('.chat .chan'), seen = [b.textContent]; b.click(); seen.push(b.textContent); b.click(); seen.push(b.textContent); a.hud.toggleChat(false); return seen; });
  check('the "important" channel: an administrator\'s line reaches everyone in another colour; a visitor has no such channel', channel === 'Important' && /important/.test(loud || '') && bobChannels.join() === 'Everyone,Nearby,Everyone', JSON.stringify({ channel, loud, bobChannels }));
  // naming another administrator: Bob's browser is handed a key of its own; the owner takes the title away
  await alice.page.click('.pill.players');
  await until(() => alice.page.evaluate(() => document.querySelectorAll('.roster .more').length === 2 || null), 20000);
  await act(alice, 'Make admin');
  const named = await until(() => bob.page.evaluate(() => { const a = window.__mmf; return a.who.admin && !a.who.owner && a.presence.admin && /^adm_/.test(localStorage.getItem('mmf.admin') || '') ? [...document.querySelectorAll('.chat .log p')].map((e) => e.textContent).find((l) => /has made you an administrator/.test(l)) || null : null; }), 20000);
  await bob.page.click('.pill.players');
  const bobSees = await until(() => bob.page.evaluate(() => { const rows = [...document.querySelectorAll('.roster .list .who')].map((r) => ({ name: r.querySelector('b').textContent, more: !!r.querySelector('.more'), acts: [...r.querySelectorAll('.acts button')].map((e) => e.textContent).join() })); return rows.length === 2 && rows.every((r) => r.more) && document.querySelector('.roster .admins h3') ? { rows, admins: document.querySelector('.roster .admins').textContent, remove: !!document.querySelector('.roster .admins button') } : null; }), 20000);
  await bob.page.screenshot({ path: path.join(OUT, 'roster-named-admin.png') });
  await bob.page.keyboard.press('Escape');
  const listed = await until(() => alice.page.evaluate(() => { const b = document.querySelector('.roster .admins button'); return b ? document.querySelector('.roster .admins').textContent : null; }), 20000);
  await alice.page.screenshot({ path: path.join(OUT, 'roster-owner.png') });
  await alice.page.evaluate(() => document.querySelector('.roster .admins button').click());
  const unnamed = await until(() => bob.page.evaluate(() => { const a = window.__mmf; return !a.who.admin && !a.presence.admin && !localStorage.getItem('mmf.admin') ? true : null; }), 20000);
  check('one administrator names another: a key of their own, what administrators see — and the owner alone takes the title away',
    !!named && !!bobSees && bobSees.rows.find((r) => /^Alice/.test(r.name))?.acts === 'Go to' && /owner/.test(bobSees.rows.find((r) => /^Alice/.test(r.name)).name) && /Bob/.test(bobSees.admins) && !bobSees.remove && /Bob/.test(listed || '') && !!unnamed,
    JSON.stringify({ named, bobSees, listed, unnamed }));
  await until(() => alice.page.evaluate(() => ([...document.querySelectorAll('.roster .acts button')].some((e) => e.textContent === 'Kick') && !document.querySelector('.roster .admins button')) || null), 20000);
  await act(alice, 'Kick'); // (Bob: the only other visitor)
  const out = await until(() => bob.page.evaluate(() => { const b = document.querySelector('.banner'); return b.classList.contains('on') ? b.textContent : null; }), 20000);
  await bob.page.screenshot({ path: path.join(OUT, 'bob-kicked.png') });
  const left = await until(async () => ((await status(alice)).count === 1 ? true : null), 20000);
  check('kicked: Bob is told so and is out; Alice is alone in the room', /put you out/.test(out || '') && !!left, JSON.stringify(out));
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
