// Checks of the toy weapons (src/extras/weapons.js), with two browsers in one room of the game as built: the
// site is built, the game's own server started (rooms, relay), and Alice and Bob walk in. With the switch off —
// as the game is delivered — there is no key, no button, and nothing travels. Switched on as the owner does:
// Alice draws (the C key), puts the sight on Bob a few metres away and clicks: Bob falls as after a strange
// mushroom ("Corked by Alice"), stands again where he fell, and Alice's next shots do nothing while he shimmers.
// Then where nothing happens — by the mill, seated, in a cave, in a game, in The Sanctuary, typing, too far — and
// what a browser that lies gets (a shot claimed from too far, ten in a second): nothing. Barnaby answers a shot
// with a dry word. The duel (ONLY_ARMED), with the zapper. Last, Cara on a phone-sized page, with a finger.
// usage: node tools/weapons-test.mjs [--q=low] [--shots=<folder>]   (--shots: pictures of what each sees)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { stubOutside } from './lib/outside.mjs';
import { freePort } from './lib/net.mjs';
import { SPAWN } from '../src/world/layout/layout.js';
import { PLAN } from '../src/world/zones/places/sanctuary/plan.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split(/=(.*)/s); return [k, v ?? true]; }));
const SHOTS = opt.shots ? path.resolve(String(opt.shots)) : '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const [W, H] = SHOTS ? [960, 540] : [720, 420]; // (a small page draws faster: two browsers share this machine)
const results = [], T0 = Date.now();
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}  (${Math.round((Date.now() - T0) / 1000)} s)`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { for (const end = Date.now() + ms; ;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await sleep(every); } };
const KEY = 'weapons-test-key', THING = 9, FIRE = 7702; // (the kind and the "run" of a shot on the wire: see src/extras/weapons.js)

await build({ root: ROOT, logLevel: 'error', define: { __TEST__: 'true' } }); // (__TEST__: the game leaves window.__mmf on the page)
const PORT = await freePort(), store = path.join(ROOT, 'tools/preview/weapons-test-store.json');
fs.mkdirSync(path.dirname(store), { recursive: true });
fs.rmSync(store, { force: true });
const server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', ADMIN_KEY: KEY, SCORES_FILE: store, FREE_ROOMS: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
for (let i = 0; i < 300; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/healthz`)).ok) break; } catch { /* not up yet */ } await sleep(100); }
const release = (set) => fetch(`http://127.0.0.1:${PORT}/api/release`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` }, body: JSON.stringify({ set }) }); // (what the page /admin does)
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'] });
const errors = [];

async function visitor(name, swatch, phone = false) {
  const context = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: SHOTS ? 2 : 1 } : { viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await stubOutside(context);
  await context.addInitScript(() => { try { for (const k of ['mmf.run', 'mmf.follow']) if (localStorage.getItem(k) === null) localStorage.setItem(k, '0'); } catch { /* no storage */ } }); // (the camera stays where the checks turn it)
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/api\/|404|Failed to load resource/.test(m.text())) errors.push(`[${name}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/?q=${opt.q || 'low'}&room=toys`);
  await page.waitForSelector('.card.ready', { timeout: 300000 });
  if (phone) await page.touchscreen.tap(5, 5); else await page.mouse.click(5, 5); // (the story told as the page opens is cut short)
  await page.fill('#mmf-name', name, { timeout: 180000 });
  await page.click(`.swatches button:nth-child(${swatch})`);
  await page.click('.go');
  await page.waitForFunction(() => window.__mmf && window.__mmf.input.enabled, null, { timeout: 120000 });
  return { name, page, context };
}
const frames = (v, n) => v.page.evaluate((n) => new Promise((res) => { const app = window.__mmf, t = app.frames + n; const tick = () => (app.frames >= t ? res() : requestAnimationFrame(tick)); tick(); }), n);
/** What a visitor's own browser says of it. */
const state = (v) => v.page.evaluate(() => {
  const a = window.__mmf, w = a.extras && a.extras.weapons, p = a.player;
  return { id: (a.presence && a.presence.id) || 0, toy: w ? w.toy : null, shield: w ? +w.shield.toFixed(2) : 0, quiet: w ? w.quiet() : '', loaded: w ? w.loaded : false, dead: p.dead ? p.dead.cause : '', at: [p.pos.x, p.pos.y, p.pos.z].map((n) => +n.toFixed(2)), log: w ? w.log.slice() : [], sight: !!document.querySelector('.sight.on'), game: !!(a.fair && a.fair.session) };
});
const count = (s, what, why) => s.log.filter((e) => e.what === what && (why === undefined || e.why === why)).length;
const put = (v, x, z, yaw = 0, y = null) => v.page.evaluate(([x, z, yaw, y]) => { const a = window.__mmf; a.player.teleport(x, z, yaw, y); a.player.grounded = true; a.rig.snap(a.player.pos, yaw + Math.PI); }, [x, z, yaw, y]);
/** Does `v` see visitor `id` within a metre of (x, z)? (what the relay has handed on) */
const seesAt = (v, id, x, z) => until(() => v.page.evaluate(([id, x, z]) => { const q = window.__mmf.presence.peers.get(id); return !!q && q.visible && Math.hypot(q.x - x, q.z - z) < 1; }, [id, x, z]), 15000);
/**
 * Turns `v`'s camera until its sight is on visitor `id` ('butler': on Barnaby), as a player would — from level,
 * down. True when it is. `off` (radians): then turned that much to one side, and what the sight is on is told again.
 */
const sightOn = (v, id, off = 0) => v.page.evaluate(async ([id, off]) => {
  const a = window.__mmf, w = a.extras.weapons, q = id === 'butler' ? a.extras.guide && a.extras.guide.at : a.presence.peers.get(id), p = a.player.pos;
  if (!q) return false;
  const wait = (n) => new Promise((res) => { const t = a.frames + n; const tick = () => (a.frames >= t ? res() : requestAnimationFrame(tick)); tick(); });
  const on = () => { const m = w.aim(); return id === 'butler' ? m.butler : !!m.peer && m.peer.id === id; };
  const find = async () => {
    a.rig.yaw = Math.atan2(p.x - q.x, p.z - q.z); // (behind oneself, looking at them)
    await wait(2);
    if (on()) return true; // (it was on them already)
    let first = null, last = null;
    for (let pitch = 0.3; pitch >= -0.9 && (first === null || last === null); pitch -= 0.04) {
      a.rig.pitch = pitch; await wait(2);
      if (on()) { if (first === null) first = pitch; } else if (first !== null) last = pitch + 0.04;
    }
    if (first === null) return false;
    a.rig.pitch = (first + (last === null ? first : last)) / 2; await wait(3); // (the middle of where it is on them, not their edge)
    return on();
  };
  const found = await find();
  if (!found || !off) return found;
  a.rig.yaw += off; await wait(3);
  return on();
}, [id, off]);
/** A click on the world, in the middle of the page: what fires the toy. */
const click = async (v) => { await v.page.mouse.click(W / 2, Math.round(H * 0.56)); await frames(v, 2); };
const loaded = (v) => until(() => v.page.evaluate(() => window.__mmf.extras.weapons.loaded), 8000, 80);
/** A shot that `v`'s browser claims without having fired it: "this toy, at that visitor, it lands there". */
const forge = (v, toy, id, at) => v.page.evaluate(([kind, run, toy, id, at]) => window.__mmf.presence.sendThing(kind, run, [toy, id, at[0], at[1] + 1, at[2]]), [THING, FIRE, toy, id, at]);
const shot = async (v, name) => { if (SHOTS) { await frames(v, 2); await v.page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };
/** (for a picture) `v`'s camera, from behind and a little to one side, so that who stands at (x, z) is seen beside its own robot. */
const lookAt = (v, x, z) => v.page.evaluate(([x, z]) => { const a = window.__mmf, p = a.player.pos; a.rig.yaw = Math.atan2(p.x - x, p.z - z) + 0.32; a.rig.pitch = -0.14; a.rig.distance = 4.5; }, [x, z]);
/** Bob's browser, once it has heard a shot at him that it refused for `why` (and he is still up): what it says then. */
const refused = (v, why, n = 1) => until(async () => { const s = await state(v); return count(s, 'shot', why) >= n ? s : null; }, 6000);
const built = async (v, what = 'weapons') => !!(await until(() => v.page.evaluate((what) => { const a = window.__mmf; return what === 'weapons' ? !!(a.extras && a.extras.weapons && a.extras.weapons.fire) : !!a[what]; }, what), 90000));

try {
  const [alice, bob] = await Promise.all([visitor('Alice', 2), visitor('Bob', 3)]);
  // (each has the number the relay gave it, and knows the other by theirs)
  const knows = (v, id) => v.page.evaluate((id) => { const p = window.__mmf.presence; return p.mode === 'online' && p.peers.has(id); }, id);
  const both = await until(async () => { const [a, b] = [await state(alice), await state(bob)]; return a.id && b.id && a.id !== b.id && await knows(alice, b.id) && await knows(bob, a.id) ? [a, b] : null; }, 60000);
  check('Alice and Bob are in one room of the game as built, through its relay', !!both, both ? `visitors ${both[0].id} and ${both[1].id}` : 'timeout');
  const A = both[0].id, B = both[1].id;

  // ---------------------------------------------------------------- off, as the game is delivered
  const heard = (v) => v.page.evaluate((kind) => { const a = window.__mmf; window.__things = []; a.presence.on('thing', (e) => { if (e.kind === kind) window.__things.push(e.run); }); const send = a.presence.sendThing.bind(a.presence); window.__sent = []; a.presence.sendThing = (k, run, d) => { if (k === kind) window.__sent.push(run); return send(k, run, d); }; return true; }, THING);
  await heard(alice); await heard(bob);
  await alice.page.keyboard.press('c'); await alice.page.keyboard.press('n'); await click(alice);
  await sleep(1200);
  const off = await alice.page.evaluate(() => { const a = window.__mmf; return { extra: !!(a.extras && a.extras.weapons), ui: !!document.querySelector('.toys, #toys-style'), group: !!a.world.scene.getObjectByName('weapons'), sight: !!document.querySelector('.sight.on'), sent: window.__sent.length, chunk: performance.getEntriesByType('resource').filter((r) => /weapons/.test(r.name)).length }; });
  const offB = await bob.page.evaluate(() => window.__things.length);
  check('with its switch off — as the game is delivered — there is no key, no button, nothing in the world, and nothing of it is downloaded', !off.extra && !off.ui && !off.group && !off.sight && off.chunk === 0, off);
  check('…and nothing travels: C, N and a click send no message, the other browser hears none', off.sent === 0 && offB === 0, `sent ${off.sent}, heard ${offB}`);

  // ---------------------------------------------------------------- switched on, as the owner does on /admin
  const set = await release({ weapons: true });
  const on = [await built(alice), await built(bob)];
  const made = await alice.page.evaluate(() => { const a = window.__mmf, w = a.extras.weapons; return { button: !!document.querySelector('.toys .toy-draw'), group: !!a.world.scene.getObjectByName('weapons'), toys: w.toys.map((t) => t.id), onlyArmed: w.onlyArmed, safe: w.rules.safe, shield: w.rules.shield, chunk: performance.getEntriesByType('resource').filter((r) => /weapons/.test(r.name)).length }; });
  check('switched on by the owner, every browser of the room has the toys at once — no refresh: a button, and nothing in a hand yet', set.status === 200 && on[0] && on[1] && made.button && made.group && made.toys.length >= 1 && made.onlyArmed === false && made.chunk === 1, made);
  const RANGE = await alice.page.evaluate(() => window.__mmf.extras.weapons.toys.map((t) => t.range)), SLACK = await alice.page.evaluate(() => window.__mmf.extras.weapons.rules.slack);
  const fps = await alice.page.evaluate(() => new Promise((res) => { const a = window.__mmf, f = a.frames, t = performance.now(); setTimeout(() => res(+(((a.frames - f) * 1000) / (performance.now() - t)).toFixed(1)), 2000); }));
  console.log(`      (each browser draws ${fps} frames a second here)`);

  // ---------------------------------------------------------------- by the mill, where everybody arrives: nothing
  await alice.page.keyboard.press('c');
  await frames(alice, 4);
  let a = await state(alice);
  const millFire = await alice.page.evaluate(() => window.__mmf.extras.weapons.fire().why || '');
  check('the C key draws the cork gun — but by the mill, where newcomers arrive, it has no sight and does not fire', a.toy === 0 && a.quiet === 'mill' && !a.sight && millFire === 'mill', { toy: a.toy, quiet: a.quiet, sight: a.sight, fire: millFire });
  // (Bob inside the circle, Alice just outside it, on a line of open, level ground)
  const ray = await alice.page.evaluate(([sx, sz, safe]) => {
    const { data, collision: col } = window.__mmf.world;
    for (let k = 0; k < 64; k++) {
      const ang = (k / 64) * Math.PI * 2, dx = Math.sin(ang), dz = Math.cos(ang), b = [sx + dx * (safe - 5), sz + dz * (safe - 5)], a = [sx + dx * (safe + 5), sz + dz * (safe + 5)];
      let ok = col.segment(a[0], a[1], b[0], b[1]) >= 1 && col.segment(b[0], b[1], a[0], a[1]) >= 1;
      for (let s = -1; s <= 11 && ok; s += 1) { const x = b[0] + dx * s, z = b[1] + dz * s, h = data.heightAt(x, z); ok = col.walkable(x, z) && !col.caveAt(x, z) && data.waterAt(x, z) < h - 0.1 && Math.abs(col.groundAt(x, z, h + 4) - h) < 0.05 && Math.abs(h - data.heightAt(b[0], b[1])) < 0.4; }
      if (ok) return { a, b, yaw: Math.atan2(-dx, -dz) };
    }
    return null;
  }, [SPAWN.x, SPAWN.z, made.safe]);
  if (ray) {
    await put(bob, ray.b[0], ray.b[1], ray.yaw + Math.PI); await put(alice, ray.a[0], ray.a[1], ray.yaw);
    await seesAt(alice, B, ray.b[0], ray.b[1]); await seesAt(bob, A, ray.a[0], ray.a[1]);
    const aimed = await sightOn(alice, B);
    await loaded(alice); await click(alice);
    const said = await refused(bob, 'mill');
    a = await state(alice);
    check('Bob inside the circle of the mill, Alice outside it with her sight on him: her cork flies, and Bob\'s browser says no', aimed && a.quiet === '' && count(a, 'fire') === 1 && !!said && !said.dead && said.quiet === 'mill', { aimed, alice: a.quiet, bob: said ? said.log.slice(-1)[0] : 'no shot heard' });
  } else check('Bob inside the circle of the mill, Alice outside it (no open line found round the mill)', false);

  // ---------------------------------------------------------------- Barnaby the butler cannot be felled
  const by = await alice.page.evaluate(([sx, sz, safe]) => {
    const a = window.__mmf, g = a.extras.guide && a.extras.guide.at, { data, collision: col } = a.world;
    if (!g) return null;
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2, x = g.x + Math.sin(ang) * 7, z = g.z + Math.cos(ang) * 7, h = data.heightAt(x, z);
      if (Math.hypot(x - sx, z - sz) > safe + 3 && col.walkable(x, z) && Math.abs(h - g.y) < 0.5 && data.waterAt(x, z) < h - 0.1 && Math.abs(col.groundAt(x, z, h + 4) - h) < 0.05 && col.segment(x, z, g.x, g.z) >= 1) return { x, z, yaw: Math.atan2(g.x - x, g.z - z) };
    }
    return null;
  }, [SPAWN.x, SPAWN.z, made.safe]);
  if (by) {
    await put(alice, by.x, by.z, by.yaw);
    await frames(alice, 8);
    const aimed = await sightOn(alice, 'butler');
    await loaded(alice); await click(alice);
    const word = await until(() => alice.page.evaluate(() => { const t = window.__mmf.extras.guide.tag, b = t.querySelector('.bubble'); return t.classList.contains('saying') && b && /did not|that way|the staff|elsewhere/.test(b.textContent) ? b.textContent : ''; }), 5000);
    const unheard = await bob.page.evaluate(() => { const b = window.__mmf.extras.guide.tag.querySelector('.bubble'); return !b || !/did not|that way|the staff|elsewhere/.test(b.textContent); });
    check('Barnaby the butler cannot be felled: a shot at him gets a dry word — said to who fired, nobody else', aimed && !!word && unheard, word || { aimed });
  } else check('Barnaby the butler (he is not there, or no open ground by him)', false);

  // ---------------------------------------------------------------- open ground: Alice fires at Bob a few metres away
  const field = await alice.page.evaluate(([sx, sz, safe]) => {
    const a = window.__mmf, { data, collision: col } = a.world, g = a.extras.guide && a.extras.guide.at;
    for (const clearing of [8, 5, 3]) for (let x = -100; x <= 140; x += 3) for (let z = -160; z <= 160; z += 3) for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const h0 = data.heightAt(x, z);
      let ok = col.segment(x, z, x + dx * 46, z + dz * 46) >= 1 && col.segment(x + dx * 46, z + dz * 46, x, z) >= 1;
      for (let s = 0; s <= 46 && ok; s += 1.5) { const px = x + dx * s, pz = z + dz * s, h = data.heightAt(px, pz); ok = Math.abs(h - h0) < 0.5 && col.walkable(px, pz) && !col.caveAt(px, pz) && data.waterAt(px, pz) < h - 0.2 && Math.abs(col.groundAt(px, pz, h + 4) - h) < 0.05 && Math.hypot(px - sx, pz - sz) > safe + 15 && (!g || Math.hypot(px - g.x, pz - g.z) > 20); }
      // (…and no tree, post or wall near where they first stand — the pictures are taken there —, as far as can be had)
      if (ok && !col.circles.some((c) => { const t = Math.max(-2, Math.min(14, (c[0] - x) * dx + (c[1] - z) * dz)); return Math.hypot(c[0] - x - dx * t, c[1] - z - dz * t) < clearing + c[2]; })
        && !col.boxes.some((b) => { const t = Math.max(-2, Math.min(14, (b[0] - x) * dx + (b[1] - z) * dz)); return Math.hypot(b[0] - x - dx * t, b[1] - z - dz * t) < clearing + Math.hypot(b[2], b[3]); })) return { x, z, dx, dz, clearing, y: h0 };
    }
    return null;
  }, [SPAWN.x, SPAWN.z, made.safe]);
  if (!field) throw new Error('no 46 m of open, level ground found for the checks');
  const P = (s) => [field.x + field.dx * s, field.z + field.dz * s], toB = Math.atan2(-field.dx, -field.dz); // (Bob at 0, Alice `s` metres along; `toB`: the way Alice faces to look at him)
  const stand = async (s) => { await put(bob, ...P(0), toB + Math.PI); await put(alice, ...P(s), toB); await seesAt(alice, B, ...P(0)); await seesAt(bob, A, ...P(s)); await frames(alice, 6); };
  await stand(6);
  a = await state(alice);
  const bobSees = await until(() => bob.page.evaluate((id) => { const a = window.__mmf, it = a.avatars.items.get(id), h = a.extras.weapons.heard.get(id); return !!it && !!h && h.toy === 0 && !!it.character.root.getObjectByName('toy-cork'); }, A), 8000);
  check('on open ground the sight is there, and Bob\'s browser shows the cork gun in Alice\'s hand', a.toy === 0 && a.quiet === '' && a.sight && !!bobSees, { quiet: a.quiet, sight: a.sight, bobSees: !!bobSees });
  if (SHOTS) {
    // (a cork caught in the air: fired past Bob, slowed in both browsers and held where it has come a few metres)
    const flying = (v, id) => until(() => v.page.evaluate((id) => { const a = window.__mmf, w = a.extras.weapons, from = id ? a.presence.peers.get(id) : a.player.pos, o = w.group.children.find((q) => q.name === 'toy-shot' && q.visible); if (!o || Math.hypot(o.position.x - from.x, o.position.z - from.z) < 3.5) return false; w.pace = 0; return true; }, id), 20000, 40);
    for (const v of [alice, bob]) await v.page.evaluate(() => { window.__mmf.extras.weapons.pace = 0.2; });
    await alice.page.evaluate(([x, z]) => { const a = window.__mmf, p = a.player.pos; a.rig.yaw = Math.atan2(p.x - x, p.z - z) + 0.3; a.rig.pitch = -0.24; }, P(0));
    await lookAt(bob, ...P(6));
    await frames(alice, 6); await loaded(alice); await click(alice);
    await Promise.all([flying(alice, 0), flying(bob, A)]);
    await shot(alice, 'a-cork-in-flight'); await shot(bob, 'b-sees-cork-in-flight');
    for (const v of [alice, bob]) await v.page.evaluate(() => { window.__mmf.extras.weapons.pace = 60; });
    await sleep(700);
    for (const v of [alice, bob]) await v.page.evaluate(() => { window.__mmf.extras.weapons.pace = 1; });
  }
  let before = await state(bob);
  const fires = count(await state(alice), 'fire');
  const beside = await sightOn(alice, B, 0.065); // (the sight a little to one side of him: with a mouse, that is nobody)
  let aimed = await sightOn(alice, B);
  await shot(alice, 'a-sight-on-bob'); await lookAt(bob, ...P(6)); await shot(bob, 'b-sees-alice-armed');
  await loaded(alice); await click(alice);
  let down = await until(async () => { const s = await state(bob); return s.dead ? s : null; }, 8000);
  check('Alice puts her sight on Bob, six metres away, and clicks: Bob falls, and the line says by whom', aimed && !beside && !!down && down.dead === 'Corked by Alice' && count(down, 'fell') === 1, { aimed, beside, dead: down ? down.dead : '', log: (await state(bob)).log.slice(-2) });
  const seenDown = await until(() => alice.page.evaluate((id) => { const q = window.__mmf.presence.peers.get(id); return !!q && q.anim === 8; }, B), 6000);
  const got = await until(async () => count(await state(alice), 'got') === 1, 6000);
  check('Alice\'s browser sees him lying there, and she is told that he is down', !!seenDown && !!got && count(await state(alice), 'fire') === fires + 1);
  await sleep(500);
  await shot(alice, 'a-sees-bob-fall'); await shot(bob, 'b-falls');
  let up = await until(async () => { const s = await state(bob); return !s.dead ? s : null; }, 20000);
  check('he stands again where he fell, and is out of reach for a few seconds', !!up && Math.hypot(up.at[0] - before.at[0], up.at[2] - before.at[2]) < 0.3 && Math.abs(up.at[1] - before.at[1]) < 0.3 && up.shield > made.shield - 2 && up.quiet === 'shield', up ? { at: up.at, was: before.at, shield: up.shield } : 'still down');
  const shimmer = await until(() => alice.page.evaluate((id) => { const w = window.__mmf.extras.weapons, h = w.heard.get(id); return !!h && h.shield > 0 && !!h.bubble && h.bubble.visible; }, B), 5000);
  check('…and looks it: Alice\'s browser draws the shimmer round him', !!shimmer);
  await shot(alice, 'a-sees-bob-shimmer'); await shot(bob, 'b-shimmers');
  // Alice's next shots do nothing for the time of the protection
  const nopes = [];
  for (let k = 0; k < 2; k++) {
    await loaded(alice); await sightOn(alice, B); await click(alice);
    const no = await refused(bob, 'shield', k + 1);
    nopes.push(!!no && !no.dead);
  }
  const told = await until(async () => count(await state(alice), 'nope', 'shield') >= 1, 4000);
  const still = await state(bob);
  check('Alice\'s next shots do nothing while he shimmers — his browser says no, and hers is told why', nopes.every(Boolean) && !!told && !still.dead && count(still, 'fell') === 1, { shots: nopes, told: !!told, shield: still.shield });
  await until(async () => (await state(bob)).shield === 0, 15000);

  // ---------------------------------------------------------------- typing, seated: left alone
  await bob.page.evaluate(() => window.__mmf.hud.toggleChat(true));
  await loaded(alice); aimed = await sightOn(alice, B); await click(alice);
  let no = await refused(bob, 'menu');
  check('Bob is typing in the chat: a shot does nothing', aimed && !!no && !no.dead, no ? no.log.slice(-1)[0] : { aimed });
  await bob.page.evaluate(() => window.__mmf.hud.toggleChat(false));
  await bob.page.evaluate(() => window.__mmf.player.sitOnGround());
  await until(() => alice.page.evaluate((id) => window.__mmf.presence.peers.get(id).anim === 10, B), 5000);
  await loaded(alice); aimed = await sightOn(alice, B); await click(alice);
  no = await refused(bob, 'seat');
  check('Bob sits down on the ground: a shot does nothing', aimed && !!no && !no.dead && no.quiet === 'seat', no ? no.log.slice(-1)[0] : { aimed });
  await bob.page.evaluate(() => { window.__mmf.player.cross = false; });

  // ---------------------------------------------------------------- too far, and a browser that lies about it
  const far = RANGE[0] + SLACK + 8;
  await stand(far);
  const mark = await state(bob), fired = count(await state(alice), 'fire');
  aimed = await sightOn(alice, B);
  await loaded(alice); await click(alice);
  await sleep(1500);
  let b = await state(bob);
  a = await state(alice);
  check(`${far} m apart — further than the cork gun carries: the sight finds nobody, the cork falls short, Bob stands`, !aimed && count(a, 'fire') === fired + 1 && a.log.filter((e) => e.what === 'fire').pop().at === 0 && !b.dead && count(b, 'shot') === count(mark, 'shot'), { aimed, bob: b.dead || 'up' });
  await forge(alice, 0, B, b.at);
  no = await refused(bob, 'far');
  check('a message forged by Alice\'s browser — "I hit Bob" from there: Bob\'s browser measures the distance itself, and says no', !!no && !no.dead && count(no, 'fell') === 1, no ? no.log.slice(-1)[0] : 'not heard');

  // ---------------------------------------------------------------- hit in the air: the body comes down, and stands on the ground
  await stand(6);
  await loaded(alice); await sleep(1600);
  await bob.page.evaluate(() => { const p = window.__mmf.player; p.pos.y += 9; p.grounded = false; p.vel.set(0, 5, 0); });
  await forge(alice, 0, B, [P(0)[0], field.y + 8, P(0)[1]]);
  down = await until(async () => { const s = await state(bob); return s.dead ? s : null; }, 6000);
  const landed = down && await until(async () => { const s = await state(bob); return s.dead && Math.abs(s.at[1] - field.y) < 0.15 ? s : null; }, 8000);
  up = await until(async () => { const s = await state(bob); return !s.dead ? s : null; }, 20000);
  check('felled in the air, nine metres up: the body comes down to the ground, and he stands again on it', !!down && down.at[1] > field.y + 2 && !!landed && !!up && Math.abs(up.at[1] - field.y) < 0.3 && count(up, 'fell') === 2, { felledAt: down ? down.at[1] : null, ground: field.y, stoodAt: up ? up.at[1] : null });

  // ---------------------------------------------------------------- in a cave: a safe place
  const cave = await alice.page.evaluate(() => {
    const { world } = window.__mmf, col = world.collision;
    for (const c of col.caves) for (let x = -420; x < 300; x += 2) for (let z = -330; z < 330; z += 2) {
      const inside = (px, pz) => c.contains(px, pz) && world.data.heightAt(px, pz) > c.floorAt(px, pz) + 2.5 && !!col.caveAt(px, pz, c.floorAt(px, pz)) && col.walkable(px, pz);
      if (inside(x, z) && inside(x + 4, z) && inside(x + 2, z) && col.segment(x, z, x + 4, z) >= 1) return { x, z, y: c.floorAt(x, z), y2: c.floorAt(x + 4, z) };
    }
    return null;
  });
  if (cave) {
    await put(bob, cave.x, cave.z, Math.PI / 2, cave.y); await put(alice, cave.x + 4, cave.z, -Math.PI / 2, cave.y2);
    await seesAt(alice, B, cave.x, cave.z); await frames(bob, 6);
    a = await state(alice); b = await state(bob);
    const why = await alice.page.evaluate(() => window.__mmf.extras.weapons.fire().why || '');
    await forge(alice, 0, B, b.at);
    no = await refused(bob, 'cave');
    check('in a cave — a safe place — no sight, no shot; and a shot claimed all the same does nothing', a.quiet === 'cave' && b.quiet === 'cave' && !a.sight && why === 'cave' && !!no && !no.dead, { alice: a.quiet, bob: b.quiet, fire: why, heard: no ? no.log.slice(-1)[0] : 'not heard' });
  } else check('in a cave (no cave found)', false);

  // ---------------------------------------------------------------- in The Sanctuary, when it is there
  await release({ sanctuary: true });
  if (await built(alice, 'sanctuary') && await built(bob, 'sanctuary')) {
    await put(bob, PLAN.at.x, PLAN.at.z, Math.PI / 2, PLAN.floor); await put(alice, PLAN.at.x + 4, PLAN.at.z, -Math.PI / 2, PLAN.floor);
    await seesAt(alice, B, PLAN.at.x, PLAN.at.z); await frames(bob, 6);
    a = await state(alice); b = await state(bob);
    const why = await alice.page.evaluate(() => window.__mmf.extras.weapons.fire().why || '');
    await sleep(900);
    await forge(alice, 0, B, b.at);
    no = await refused(bob, 'sanctuary');
    check('The Sanctuary switched on too: under its dome, no sight, no shot, and a shot claimed all the same does nothing', a.quiet === 'sanctuary' && b.quiet === 'sanctuary' && !a.sight && why === 'sanctuary' && !!no && !no.dead, { alice: a.quiet, bob: b.quiet, fire: why, heard: no ? no.log.slice(-1)[0] : 'not heard' });
  } else check('The Sanctuary switched on too (it was not built)', false);

  // ---------------------------------------------------------------- in a game
  await bob.page.evaluate(() => window.__mmf.playArcade());
  b = await until(async () => { const s = await state(bob); return s.game ? s : null; }, 8000);
  if (b) {
    const yaw = await bob.page.evaluate(() => window.__mmf.player.yaw);
    await put(alice, b.at[0] - Math.sin(yaw) * 6, b.at[2] - Math.cos(yaw) * 6, yaw);
    await seesAt(alice, B, b.at[0], b.at[2]); await seesAt(bob, A, b.at[0] - Math.sin(yaw) * 6, b.at[2] - Math.cos(yaw) * 6);
    await loaded(alice); aimed = await sightOn(alice, B); await click(alice);
    if (!aimed) { await sleep(1600); await forge(alice, 0, B, b.at); }
    no = await refused(bob, 'game');
    check('Bob plays a game (the cabinet of the pier): a shot does nothing, and his game goes on', !!no && !no.dead && no.game && no.quiet === 'game', { aimed, heard: no ? no.log.slice(-1)[0] : 'not heard' });
    await bob.page.evaluate(() => window.__mmf.endGame());
  } else check('Bob plays a game (it did not start)', false);

  // ---------------------------------------------------------------- the duel (ONLY_ARMED), with the zapper
  for (const v of [alice, bob]) await v.page.evaluate(() => { window.__mmf.extras.weapons.onlyArmed = true; });
  await stand(5);
  await until(async () => (await state(bob)).shield === 0, 15000);
  if ((await state(alice)).toy < 0) await alice.page.keyboard.press('c'); // (the water by the pier may have put it away)
  for (let k = 0; k < 2 && (await state(alice)).toy !== 1; k++) { await alice.page.keyboard.press('n'); await frames(alice, 4); }
  a = await state(alice);
  const zapSeen = await until(() => bob.page.evaluate((id) => { const it = window.__mmf.avatars.items.get(id); return !!it && !!it.character.root.getObjectByName('toy-zap') && !it.character.root.getObjectByName('toy-cork'); }, A), 6000);
  check('the N key changes the toy: the spark zapper, in her hand in Bob\'s browser too', a.toy === 1 && !!zapSeen);
  await loaded(alice); aimed = await sightOn(alice, B); await click(alice);
  no = await refused(bob, 'unarmed');
  const why = await until(async () => count(await state(alice), 'nope', 'unarmed') >= 1, 4000);
  check('ONLY_ARMED set: Bob has no toy in hand — he is left alone, and Alice is told there is no duel', aimed && !!no && !no.dead && !!why, no ? no.log.slice(-1)[0] : { aimed });
  await bob.page.keyboard.press('c');
  await until(() => alice.page.evaluate((id) => { const h = window.__mmf.extras.weapons.heard.get(id); return !!h && h.toy === 0; }, B), 6000);
  await shot(alice, 'a-duel');
  before = await state(bob);
  await loaded(alice); aimed = await sightOn(alice, B);
  if (SHOTS) for (const v of [alice, bob]) await v.page.evaluate(() => { window.__mmf.extras.weapons.pace = 0.01; }); // (the spark held for the picture)
  await click(alice);
  await shot(alice, 'a-zaps-bob'); await shot(bob, 'b-is-zapped');
  for (const v of [alice, bob]) await v.page.evaluate(() => { window.__mmf.extras.weapons.pace = 1; });
  down = await until(async () => { const s = await state(bob); return s.dead ? s : null; }, 8000);
  check('…Bob draws his own: now the zapper fells him ("Zapped by Alice")', aimed && before.toy === 0 && !!down && down.dead === 'Zapped by Alice' && count(down, 'fell') === 3, { aimed, dead: down ? down.dead : '' });
  // ten shots claimed in a second, while he lies there and as he stands again: not one more fall
  for (let k = 0; k < 10; k++) { await forge(alice, 1, B, before.at); await sleep(100); }
  up = await until(async () => { const s = await state(bob); return !s.dead ? s : null; }, 20000);
  for (let k = 0; k < 10; k++) { await forge(alice, 1, B, before.at); await sleep(100); }
  await sleep(600);
  b = await state(bob);
  check('ten shots claimed in a second while he is down, ten more as he stands: not one more fall', !!up && !b.dead && count(b, 'fell') === 3 && count(b, 'shot', 'down') + count(b, 'shot', 'shield') >= 1 && count(b, 'shot', 'haste') >= 6, { fell: count(b, 'fell'), down: count(b, 'shot', 'down'), shield: count(b, 'shot', 'shield'), tooFast: count(b, 'shot', 'haste') });
  for (const v of [alice, bob]) await v.page.evaluate(() => { window.__mmf.extras.weapons.onlyArmed = false; });

  // ---------------------------------------------------------------- put away, and left clean
  await alice.page.keyboard.press('c'); await bob.page.keyboard.press('c');
  await frames(alice, 4);
  a = await state(alice);
  const gone = await until(() => bob.page.evaluate((id) => { const it = window.__mmf.avatars.items.get(id); return !!it && !it.character.root.getObjectByName('toy-zap') && !it.character.root.getObjectByName('toy-cork'); }, A), 8000);
  const sent = await alice.page.evaluate(() => window.__sent.length);
  await sleep(2500);
  const quietNow = (await alice.page.evaluate(() => window.__sent.length)) === sent;
  check('C again puts it away: no sight, nothing in her hand in Bob\'s browser, and nothing more travels', a.toy === -1 && !a.sight && !!gone && quietNow);
  // (the pop, the bonk, the zap, the tink on a bubble: made by code, in each browser that is near — counted there)
  const ears = (v) => v.page.evaluate(() => { const a = window.__mmf, w = a.extras.weapons; return { sound: !!(a.audio && a.audio.live && a.audio.ctx && a.audio.ctx.state === 'running'), made: w.sounds, mute: w.mute }; });
  const heardA = await ears(alice), heardB = await ears(bob);
  check('the toys are heard: each browser made their sounds as the shots went off and landed, and none failed', heardA.sound && heardB.sound ? heardA.made >= 8 && heardB.made >= 8 && !heardA.mute && !heardB.mute : !heardA.mute && !heardB.mute, heardA.sound && heardB.sound ? `${heardA.made} in Alice's, ${heardB.made} in Bob's` : 'no sound in these browsers: only that nothing failed');
  await alice.context.close();

  // ---------------------------------------------------------------- a phone-sized page, with a finger
  const cara = await visitor('Cara', 4, true);
  await built(cara);
  const C = await until(async () => { const s = await state(cara); return s.id && await knows(bob, s.id) && await knows(cara, B) ? s.id : 0; }, 60000);
  await put(bob, ...P(0), toB + Math.PI); await put(cara, ...P(6), toB);
  await seesAt(cara, B, ...P(0)); await seesAt(bob, C, ...P(6));
  await until(async () => (await state(bob)).shield === 0, 15000);
  // (where a button is on the page, and how wide — null while it is not shown)
  const boxes = () => cara.page.evaluate(() => { const box = (q) => { const e = document.querySelector(q), r = e && e.getBoundingClientRect(); return r && r.width && getComputedStyle(e).visibility !== 'hidden' ? [Math.round(r.left), Math.round(r.top), Math.round(r.width)] : null; }; return { touch: document.querySelector('#ui').classList.contains('touch'), draw: box('.toy-draw'), fire: box('.toy-fire'), line: box('.toy-line') }; });
  const pads = await boxes();
  await cara.page.tap('.toy-draw');
  await frames(cara, 4);
  let c = await state(cara);
  const drawn = await boxes();
  check('on a phone-sized page there are no keys: one round button draws the toy, and a red one appears under it to fire', pads.touch && !!pads.draw && pads.draw[2] >= 44 && !pads.fire && !pads.line && c.toy === 0 && !!drawn.fire && drawn.fire[2] >= 56 && drawn.draw[1] === pads.draw[1], { draw: pads.draw, fire: drawn.fire });
  const helped = await sightOn(cara, B, 0.065); // (the sight a little to one side of him: a finger is helped — the nearest robot in a narrow cone)
  await sleep(SHOTS ? 3600 : 0);
  await shot(cara, 'phone-buttons');
  await loaded(cara);
  await cara.page.tap('.toy-fire');
  down = await until(async () => { const s = await state(bob); return s.dead ? s : null; }, 8000);
  check('…with the sight a little to one side of Bob — where a mouse finds nobody — a finger is helped: the red button fells him', helped && !!down && down.dead === 'Corked by Cara', { helped, dead: down ? down.dead : '' });
  await shot(cara, 'phone-sees-bob-fall');
  await cara.page.tap('.toy-draw'); await frames(cara, 3);
  const second = (await state(cara)).toy;
  await cara.page.tap('.toy-draw'); await frames(cara, 3);
  c = await state(cara);
  check('the same button changes the toy, then puts it away', second === 1 && c.toy === -1 && !(await boxes()).fire);
  check('nothing complained in any browser', errors.length === 0, [...new Set(errors)].slice(0, 4).join(' | '));
} catch (err) {
  check('the checks ran to their end', false, err.message);
  if (serverLog) console.log(serverLog.slice(-600));
} finally {
  await browser.close();
  try { server.kill(); } catch { /* gone */ }
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
