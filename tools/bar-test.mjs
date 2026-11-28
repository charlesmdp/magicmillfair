// Checks of The Velvet Gasket (src/extras/bar.js), the hidden cabaret of robots: its plan alone (the number and its
// steps, how a bouquet is spent), then the running game (a headless browser): with its switch off there is no cave,
// no hole in the ground, no robot; switched on (with the caves' rule), the cave is dug and one walks into it under
// the ground, the doorman refuses who has no flowers and takes three from who has, a glass takes a flower and the
// world sways for a minute and stops, the barman serves three and no more, a flower lands on the stage, the number
// goes through its steps, the tune plays inside and stops outside, the chat is "Nearby" inside — and one leaves it
// clean.
// usage: node tools/bar-test.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stubOutside } from './lib/outside.mjs';
import { BAR, AX, FLOOR, SHOW, LINES, showAt, flowersOf, spend } from '../src/world/zones/places/bar/plan.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const T = SHOW.number + SHOW.pause;

// ---- the plan alone (no browser)
{
  const steps = [];
  for (let t = 0; t < T; t += 0.25) { const s = showAt(t * 1000).step; if (steps[steps.length - 1] !== s) steps.push(s); }
  check('the number goes through its steps in order, then a pause', steps.join(' ') === 'roll fans hat plate chest back drums out bow curtain pause', steps.join(' '));
  const a = showAt(30000), b = showAt((T * 7 + 30) * 1000);
  check('and comes round again: the same step at the same moment of every turn, the curtain up during a number and down in the pause', a.step === b.step && a.n === b.n && b.turn === 7 && a.curtain === 1 && showAt((SHOW.number + 10) * 1000).curtain === 0 && showAt(0).curtain === 0);
  const look = { bouquet: true, kinds: ['poppy', 'daisy', 'cornflower', 'poppy', 'daisy'] }, gone = spend(look, 3), none = spend(look, 3), last = spend(look, 2);
  check('a bouquet is spent from its last flowers; what it does not hold is not taken; spent to nothing, there is no bouquet', gone?.join() === 'cornflower,poppy,daisy' && none === null && last?.join() === 'poppy,daisy' && look.bouquet === false && look.kinds === undefined && flowersOf(look) === 0, { gone, none, last, look });
}

const { chromium } = createRequire(import.meta.url)('playwright');
const { createServer } = await import('vite');
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5251, strictPort: false, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
await stubOutside(context);
const page = await context.newPage(), errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/api\/|404|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?q=low`);
  await page.waitForSelector('.card.ready', { timeout: 240000 });
  await page.mouse.click(5, 5); // (the story told as the page opens is cut short: a click reveals the gate)
  await page.fill('#mmf-name', 'Player', { timeout: 180000 });
  await page.click('.go', { timeout: 180000 });
  await page.waitForFunction(() => window.__mmf && window.__mmf.input.enabled, null, { timeout: 60000 });
  const frames = (n) => page.evaluate((n) => new Promise((res) => { const app = window.__mmf, t = app.frames + n; const tick = () => (app.frames >= t ? res() : requestAnimationFrame(tick)); tick(); }), n);

  // ---- off, as the game is delivered
  const seen = (B) => {
    const a = window.__mmf, t = a.world.terrain.uniforms, m = new a.THREE.Matrix4(), p = new a.THREE.Vector3(), q = new a.THREE.Quaternion(), s = new a.THREE.Vector3();
    let robots = 0, boulder = false;
    a.world.scene.traverse((o) => { if (/^bar-(doorman|barman|mini|guest-\d+)$/.test(o.name)) robots++; });
    for (const mesh of a.world.rocks.group.children) for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); m.decompose(p, q, s); if (s.x > 0 && Math.hypot(p.x - B.ax, p.z - B.mz) < 1.6) boulder = true; }
    return {
      group: !!a.world.scene.getObjectByName('bar'), api: !!a.bar, robots, boulder,
      hole: (t.uHoleA?.value || []).some((h) => Math.abs(h.x - B.ax) < 4 && Math.abs(h.y - B.mz) < 4),
      cave: a.world.collision.caveAt(B.ax, 196, B.floor + 0.6)?.name || null,
    };
  };
  const B = { ax: AX, mz: BAR.mouth.z, floor: FLOOR };
  const off = await page.evaluate(([fn, B]) => (0, eval)(fn)(B), [seen.toString(), B]);
  off.zone = await page.evaluate(() => import('/src/world/layout/layout.js').then((L) => L.ZONES.some((z) => z.id === 'bar')));
  check('with its switch off — as the game is delivered — no cave, no hole in the ground, no robot, no place of that name, and the boulder of the valley stands where it stood', !off.group && !off.api && !off.robots && !off.hole && !off.cave && !off.zone && off.boulder, off);

  // ---- on (with the caves' rule)
  await page.evaluate(() => import('/src/extras/index.js').then(({ loadExtras }) => loadExtras(window.__mmf, { caves: true, bar: true })).then(() => window.__mmf.extrasBuilt()));
  await frames(6);
  const on = await page.evaluate(([fn, B]) => (0, eval)(fn)(B), [seen.toString(), B]);
  on.zone = await page.evaluate(() => import('/src/world/layout/layout.js').then((L) => L.ZONES.find((z) => z.id === 'bar')?.hidden === true));
  const weight = await page.evaluate(() => { const g = window.__mmf.world.scene.getObjectByName('bar'); let tris = 0, meshes = 0; g.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } }); return { meshes, tris: Math.round(tris), cleared: window.__mmf.bar.place.cleared }; });
  check('switched on, the cave is dug: its rooms in the scene, a hole in the ground at its mouth, a gallery under it, seven robots of the house — and its name is kept off the map', on.group && on.api && on.hole && on.cave === 'bar' && on.robots === 7 && on.zone, { ...on, ...weight });
  check('the boulder of the valley that stood in the mouth is gone, the one that leaned into the passage is pushed aside', !on.boulder && weight.cleared.length === 2 && weight.cleared.some((c) => !c.to) && weight.cleared.some((c) => c.to && Math.abs(c.to[0] - AX) > Math.abs(c.at[0] - AX)), weight.cleared);

  // ---- the visitor, walked by the game's own controller (as tools/walk-test.mjs does: the stick held towards a point); the place is stepped as the game steps it
  await page.evaluate(() => {
    const a = window.__mmf, said = (window.__said = []), bubbles = (window.__bubbles = []), sent = (window.__sent = []);
    const add = a.hud.addChat.bind(a.hud), say = a.hud.say.bind(a.hud);
    a.hud.addChat = (who, c, text, ...r) => { said.push([who, text]); return add(who, c, text, ...r); };
    a.hud.say = (tag, text, ...r) => { bubbles.push(text); return say(tag, text, ...r); };
    if (a.presence?.sendEmote) { const e = a.presence.sendEmote.bind(a.presence); a.presence.sendEmote = (i) => { sent.push(i); return e(i); }; }
    window.__clock = 30; a.bar.clock = () => window.__clock * 1000;
    a.look.bouquet = false; a.look.kinds = undefined;
  });
  const walk = (from, points, secs = 0) => page.evaluate(([from, points, secs]) => {
    const a = window.__mmf, { player, input } = a, dt = 1 / 60;
    if (from) player.teleport(from[0], from[1], from[2]);
    const tick = () => { player.update(dt, 0, true); a.bar.step(dt); window.__clock += dt; };
    for (const [tx, tz] of points) for (let f = 0; f < 1500; f++) { const dx = tx - player.pos.x, dz = tz - player.pos.z, d = Math.hypot(dx, dz); if (d < 0.35) break; input.move.x = dx / d; input.move.y = -dz / d; input.run = false; input.jump = false; tick(); }
    input.move.x = 0; input.move.y = 0;
    for (let f = 0; f < secs * 60; f++) tick();
    const p = player.pos;
    return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), cave: player.cave?.name || null, ground: +a.world.data.heightAt(p.x, p.z).toFixed(2), action: a.bar.action()?.label || null };
  }, [from, points, secs]);
  const D = BAR.door;
  let p = await walk([-63.5, 165, 0], [[-62.0, 172.5], [-62.0, 176.3], [-64.7, 178.4], [AX, D.z - 0.3]]);
  check('from the clearing one walks round the slab, into the mouth and down the passage under the ground, up to the door — which stops one', p.cave === 'bar' && p.z > D.z - 1.2 && p.z < D.z && p.y < p.ground - 1, p);
  check('without flowers, what the door offers is to knock', p.action === 'Knock on the hatch', p.action);
  let r = await page.evaluate(() => { const a = window.__mmf; window.__said.length = 0; const ok = a.bar.action().run(); return { ok, said: window.__said.map((s) => s.join(': ')), paid: a.bar.state.paid, open: a.bar.place.door.open }; });
  check('…and the doorman refuses, and says where flowers grow', !r.ok && !r.paid && !r.open && r.said.includes(`${BAR.doorman.name}: ${LINES.where}`), r.said);
  r = await page.evaluate(() => { const a = window.__mmf; a.look.bouquet = true; a.look.kinds = ['poppy', 'daisy']; window.__said.length = 0; const label = a.bar.action().label, ok = a.bar.action().run(); return { label, ok, said: window.__said.map((s) => s[1]), kinds: a.look.kinds.length, paid: a.bar.state.paid }; });
  check('with two flowers he still refuses — the cover is three — and takes none', r.label === 'Knock on the hatch' && !r.ok && !r.paid && r.kinds === 2 && r.said.includes(LINES.few(2)), r);
  r = await page.evaluate(() => { const a = window.__mmf; a.look.kinds = ['poppy', 'daisy', 'cornflower', 'poppy', 'buttercup', 'daisy']; const label = a.bar.action().label, ok = a.bar.action().run(); return { label, ok, kinds: a.look.kinds.length, bouquet: a.look.bouquet, paid: a.bar.state.paid }; });
  check('with six flowers he takes three, and the door opens', r.label === `Pay the cover: ${BAR.cover} flowers` && r.ok && r.paid && r.kinds === 3 && r.bouquet, r);
  p = await walk(null, [], 1.2);
  p = await walk(null, [[AX - 0.3, 190.5]]);
  check('through the door one walks into the room', p.cave === 'bar' && p.z > 190 && Math.abs(p.y - FLOOR) < 0.2, p);
  await frames(8);
  r = await page.evaluate(() => ({ playing: window.__mmf.bar.playing, chat: window.__mmf.hud.chatChannel }));
  check('inside, the tune of the house plays, and the chat is on "Nearby" (the caves\' rule)', r.playing && r.chat === 'near', r);

  // ---- the counter
  p = await walk(null, [[-62.3, 194.7]]);
  check('at the counter, a glass is offered for a flower', p.action === 'A glass of Alcooil: 1 flower', p);
  r = await page.evaluate(() => {
    const a = window.__mmf; window.__said.length = 0; window.__bubbles.length = 0; window.__sent.length = 0;
    const ok = a.bar.action().run(), kinds = a.look.kinds.length, rolls = [];
    for (let f = 0; f < 60 * 8; f++) { a.bar.step(1 / 60); if (f % 30 === 0) rolls.push(a.bar.state.roll); }
    return { ok, kinds, drinks: a.bar.state.drinks, sway: +a.bar.state.sway.toFixed(1), most: Math.max(...rolls.map(Math.abs)), hic: window.__bubbles.includes('hic!'), sent: window.__sent.length, said: window.__said.map((s) => s[0]) };
  });
  check('a glass takes a flower; the robot raises it (the others see it: an emote), hiccups, and the world starts to sway — gently', r.ok && r.kinds === 2 && r.drinks === 1 && r.sway > 40 && r.most > 0.005 && r.most < 0.05 && r.hic && r.said.includes(BAR.barman.name) && (r.sent > 0 || !(await page.evaluate(() => !!window.__mmf.presence?.sendEmote))), r);
  r = await page.evaluate(() => { const a = window.__mmf; for (let f = 0; f < 60 * 55; f++) a.bar.step(1 / 60); return { sway: a.bar.state.sway, roll: a.bar.state.roll }; });
  check('a minute later the world stands still again', r.sway === 0 && r.roll === 0, r);
  r = await page.evaluate(() => {
    const a = window.__mmf; a.look.kinds = ['poppy', 'daisy', 'cornflower', 'poppy']; window.__said.length = 0;
    const two = a.bar.action().run(), three = a.bar.action().run(), label = a.bar.action().label, four = a.bar.action().run();
    for (let f = 0; f < 60 * 62; f++) a.bar.step(1 / 60);
    return { two, three, label, four, drinks: a.bar.state.drinks, kinds: a.look.kinds.length, said: window.__said.map((s) => s[1]), sway: a.bar.state.sway };
  });
  check('three glasses a night: at the fourth the barman says it is enough oil, and takes no flower', r.two && r.three && !r.four && r.drinks === 3 && r.kinds === 2 && r.label === 'Ask for one more glass' && r.said.includes(LINES.enough) && r.sway === 0, r);

  // ---- the stage
  p = await walk(null, [[AX - 0.3, 197], [AX - 0.3, BAR.stage.z0 - 1.0]]);
  check('before the stage, a flower is offered to it', p.action === 'Throw a flower on the stage', p);
  r = await page.evaluate((F) => {
    const a = window.__mmf, place = a.bar.place, star = place.star.group; window.__clock = 30;
    for (let f = 0; f < 10; f++) a.bar.step(1 / 60);
    const yaw0 = star.rotation.y, before = a.look.kinds.length, ok = a.bar.action().run(), spins = [];
    for (let f = 0; f < 60 * 1.5; f++) { a.bar.step(1 / 60); spins.push(star.rotation.y); }
    const f = place.tossed[place.tossed.length - 1]?.m.position, S = a.bar.plan.stage;
    return { ok, taken: before - a.look.kinds.length, thrown: a.bar.state.thrown, lies: !!f && f.z > S.z0 && f.z < S.z1 && Math.abs(f.y - (F + S.height + 0.06)) < 0.2, y: f?.y, spun: Math.max(...spins.map((s) => Math.abs(s - yaw0))) > 1.5 };
  }, FLOOR);
  check('a flower thrown flies and lies on the boards; she spins with a flourish (the room cheers)', r.ok && r.taken === 1 && r.thrown === 1 && r.lies && r.spun, r);
  r = await page.evaluate((t) => { const a = window.__mmf; window.__clock = t; for (let f = 0; f < 10; f++) a.bar.step(1 / 60); const before = a.look.kinds.length, ok = a.bar.action().run(); return { ok, kept: a.look.kinds.length === before }; }, SHOW.number + 10);
  check('with the curtain down, a flower is kept for the next number', r.ok === false && r.kept, r);

  // ---- the number, step by step (the clock of the show set, the place stepped)
  r = await page.evaluate((SH) => {
    const a = window.__mmf, place = a.bar.place, star = place.star, events = [], off = [];
    const go = (from, to) => { for (window.__clock = from; window.__clock < to; window.__clock += 1 / 30) for (const e of a.bar.step(1 / 30)) events.push(e.what); };
    go(SH.number + 20, SH.number + 30); // (in the pause: the curtain down)
    const closed = place.curtain[0].scale.x;
    const start = (SH.number + SH.pause) * 3;
    go(start, start + 0.5);
    const rest = star.pieces.map((pc) => pc.m.position.clone());
    go(start + 0.5, start + 20);
    const open = place.curtain[0].scale.x;
    for (let i = 0; i < 4; i++) { go(window.__clock, start + SH.off[i] + 1.6); off.push(+star.pieces[i].m.position.distanceTo(rest[i]).toFixed(2)); }
    go(window.__clock, start + SH.off[4] + 3);
    const shell = Math.abs(star.halves[0].g.position.x), mini = place.robots.mini.root.visible, cogs = star.cogs.every((c) => c.visible);
    go(window.__clock, start + SH.number + 5);
    return { closed, open, off, shell, mini, cogs, events, after: place.curtain[0].scale.x, miniAfter: place.robots.mini.root.visible };
  }, SHOW);
  check('the number: the curtain rises, four pieces come off one by one and land on the boards, the shell opens and a smaller robot steps out; the curtain comes down', r.closed === 1 && r.open < 0.3 && r.off.every((d) => d > 0.4) && r.shell > 0.5 && r.mini && r.after === 1 && !r.miniAfter, r);
  check('and is told as it goes: the curtain, the drums, each piece, the last, the bow', r.events.join(' ') === 'open off off off off roll out bow', r.events.join(' '));

  // ---- out, and clean
  p = await walk(null, [[AX - 0.3, 191], [AX, 184.5], [-64.7, 178.4], [-62.0, 176.3], [-62.0, 170]], 2);
  await frames(8);
  r = await page.evaluate(() => { const a = window.__mmf; return { playing: a.bar.playing, chat: a.hud.chatChannel, roll: a.bar.state.roll, action: a.bar.action(), labels: [...document.querySelectorAll('.tag')].filter((e) => /Hinge|Sump|Peony/.test(e.textContent) && e.style.display !== 'none').length, inside: a.world.scene.getObjectByName('bar-inside').visible }; });
  check('out of the cave and on the grass again: the tune has stopped, the chat is for everyone again, nothing sways, nothing is offered, no name is shown', !p.cave && !r.playing && r.chat === 'all' && r.roll === 0 && !r.action && r.labels === 0, { at: p, ...r });
  check('no error in the page', !errors.length, errors.slice(0, 5).join(' | '));
} finally {
  await browser.close();
  await server.close();
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
