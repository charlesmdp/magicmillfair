// Two visitors and the extra `dive`: what each sees of the other under the water. Builds the site, starts the
// game's own server (rooms, relay), throws the switch `dive` as the owner does, opens two browsers (Alice, Bob) and
// checks — with a picture of each screen — that a diver is shown to the other at their true depth (not pulled back
// to the surface), that two divers see each other, and that who is in the cave is not named through its rock.
// usage: node tools/dive-duo.mjs [--out=<folder>] [--q=low]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { stubOutside } from './lib/outside.mjs';
import { DEEP, toWorld, strand } from '../src/world/zones/places/deep/plan.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split(/=(.*)/s); return [k, v ?? true]; }));
const OUT = path.resolve(opt.out || path.join(ROOT, 'lab/games/shots/duo/dive'));
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8840 + Math.floor(Math.random() * 40), KEY = 'dive-duo-key';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };

await build({ root: ROOT, logLevel: 'error', define: { __TEST__: 'true' } });
const store = path.join(OUT, 'store.json');
fs.rmSync(store, { force: true });
const server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ADMIN_KEY: KEY, SCORES_FILE: store, FREE_ROOMS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
for (let i = 0; i < 300; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/healthz`)).ok) break; } catch { /* not up yet */ } await sleep(100); }
const set = await fetch(`http://127.0.0.1:${PORT}/api/release`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` }, body: JSON.stringify({ set: { dive: true } }) });
check('the server keeps the switch `dive`, thrown as the owner throws it', set.status === 200 && (await set.json().catch(() => ({}))).release?.dive === true);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'] });
const logs = [];
async function visitor(name, swatch) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  await stubOutside(context);
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/api\/|404|Failed to load resource/.test(m.text())) logs.push(`[${name}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => logs.push(`[${name}] ${e.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/?q=${opt.q || 'low'}`);
  await page.waitForSelector('.card.ready', { timeout: 600000 });
  await page.mouse.click(5, 5);
  await page.fill('#mmf-name', name, { timeout: 300000 });
  await page.click(`.swatches button:nth-child(${swatch})`);
  await page.click('.go');
  await page.waitForFunction(() => window.__mmf && window.__mmf.input.enabled, null, { timeout: 300000 });
  await page.waitForFunction(() => !!window.__mmf.dive, null, { timeout: 300000 });
  return { name, page };
}
/** What `v` knows of the other visitor: where the relay says they are, and where their robot is drawn. */
const sees = (v) => v.page.evaluate(() => {
  const a = window.__mmf, p = a.player.pos, o = [...a.presence.peers.values()][0], it = o && a.avatars.items.get(o.id), r = it?.character.root;
  return { me: [p.x, p.y, p.z], diving: !!a.dive.diving(), under: a.dive.place.under, other: o ? { name: o.name, at: [o.x, o.y, o.z], anim: o.anim, visible: !!o.visible, tagOff: !!o.tagOff, drawn: r ? [r.position.x, r.position.y, r.position.z] : null, shown: !!r?.visible, tag: it ? it.tag.style.display !== 'none' : null } : null };
});
const r1 = (a) => a.map((v) => +v.toFixed(1));
try {
  // (one after the other: the machine is shared)
  const alice = await visitor('Alice', 2), bob = await visitor('Bob', 3);
  // before the arch, six metres apart, at the surface: the relay tells each about the other
  const [ax, az] = toWorld(DEEP.mouth.u + 9, DEEP.mouth.w - 3), [bx, bz] = toWorld(DEEP.mouth.u + 9, DEEP.mouth.w + 3);
  const look = (fx, fz, tx, tz) => Math.atan2(fx - tx, fz - tz); // (the camera of one who stands at f and looks at t)
  await alice.page.evaluate(([x, z]) => window.__mmf.player.teleport(x, z, 0), [ax, az]);
  await bob.page.evaluate(([x, z]) => window.__mmf.player.teleport(x, z, 0), [bx, bz]);
  for (const v of [alice, bob]) await v.page.waitForFunction(() => window.__mmf.player.pos.y > -1.12 && !window.__mmf.hud.noteEl.classList.contains('show'), null, { timeout: 120000 }); // (afloat, and the words of the gate read)
  await sleep(2500);
  let a = await sees(alice), b = await sees(bob);
  check('at the surface each sees the other swim', !!a.other?.visible && !!b.other?.visible && a.other.anim === 4 && Math.abs(a.other.at[1] + 1.05) < 0.3, { Alice: r1(a.me), Bob: r1(b.me) });
  // Alice goes under, four and a half metres down; Bob stays at the surface and looks at her
  await alice.page.evaluate(([x, z, yaw]) => window.__mmf.dive.put(x, -5.4, z, yaw, -0.1), [ax, az, look(ax, az, bx, bz) + 0.5]);
  await bob.page.evaluate(([x, z, yaw]) => { const m = window.__mmf; m.rig.pitch = -0.5; m.rig.snap(m.player.pos, yaw); }, [bx, bz, look(bx, bz, ax, az)]);
  await sleep(3000);
  a = await sees(alice); b = await sees(bob);
  check('Alice dives: Bob, at the surface, is told where she is — at her true depth — and her robot is drawn there, not pulled back to the surface', a.diving && Math.abs(b.other.at[1] - a.me[1]) < 0.3 && b.other.at[1] < -4 && Math.abs(b.other.drawn[1] - a.me[1]) < 0.4 && b.other.shown && b.other.anim === 4, { Alice: r1(a.me), BobIsTold: r1(b.other.at), drawnAt: r1(b.other.drawn) });
  await bob.page.screenshot({ path: path.join(OUT, 'bob-over-alice.png') });
  // Bob dives too: face to face, six metres apart
  await bob.page.evaluate(([x, z, yaw]) => window.__mmf.dive.put(x, -5.4, z, yaw, -0.08), [bx, bz, look(bx, bz, ax, az) + 0.5]);
  await alice.page.evaluate(([x, z, yaw]) => window.__mmf.dive.put(x, -5.4, z, yaw, -0.08), [ax, az, look(ax, az, bx, bz) + 0.5]);
  await sleep(3500);
  a = await sees(alice); b = await sees(bob);
  check('two divers see each other under the water, each where the other is', a.diving && b.diving && a.under && b.under && a.other.shown && b.other.shown && Math.abs(a.other.drawn[1] - b.me[1]) < 0.4 && Math.abs(b.other.drawn[1] - a.me[1]) < 0.4 && Math.hypot(a.other.drawn[0] - b.me[0], a.other.drawn[2] - b.me[2]) < 0.6, { AliceSeesBobAt: r1(a.other.drawn), Bob: r1(b.me), BobSeesAliceAt: r1(b.other.drawn), Alice: r1(a.me) });
  await Promise.all([alice.page.screenshot({ path: path.join(OUT, 'alice-sees-bob.png') }), bob.page.screenshot({ path: path.join(OUT, 'bob-sees-alice.png') })]);
  // Alice in the chamber, on the strand; Bob outside: her name is not shown through the rock — then Bob joins her
  const [sx, sz] = toWorld(DEEP.rest.u, DEEP.rest.w), [tx, tz] = toWorld(DEEP.rest.u + 2.5, DEEP.rest.w - 1.2), y = strand(DEEP.rest.u, DEEP.rest.w) + 0.05;
  await alice.page.evaluate(([x, z, y]) => { const m = window.__mmf; m.dive.rise(); m.player.teleport(x, z, 0, y); }, [sx, sz, y]);
  await bob.page.evaluate(() => window.__mmf.dive.rise());
  await sleep(3000);
  b = await sees(bob);
  check('Alice is in the chamber, Bob outside in the sea: her name is not written over the rock', b.other.tagOff && b.other.tag === false && !b.under, { Alice: r1(b.other.at) });
  await bob.page.evaluate(([x, z, y, yaw]) => { const m = window.__mmf; m.player.teleport(x, z, yaw + Math.PI, y); m.rig.pitch = -0.15; m.rig.snap(m.player.pos, yaw + 0.5); }, [tx, tz, strand(DEEP.rest.u + 2.5, DEEP.rest.w - 1.2) + 0.05, look(tx, tz, sx, sz)]);
  await sleep(3000);
  b = await sees(bob);
  check('Bob joins her on the strand: he sees her there, by her name', !b.other.tagOff && b.other.shown && Math.abs(b.other.drawn[1] - y) < 0.3, { BobSeesAliceAt: r1(b.other.drawn) });
  await bob.page.screenshot({ path: path.join(OUT, 'bob-and-alice-in-the-chamber.png') });
  check('nothing complained', logs.length === 0, [...new Set(logs)].slice(0, 4).join(' | '));
} catch (err) { check('the two visitors got through', false, err.message); } finally {
  await browser.close();
  try { server.kill(); } catch { /* gone */ }
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed — pictures in ${OUT}`);
process.exit(failed ? 1 : 0);
