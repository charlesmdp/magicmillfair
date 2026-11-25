// Checks of the games of the extras in the running game (a headless browser): with every switch off nothing of
// them is there; switched on, each is built without a word of complaint and offers itself at its gate; the
// planks of the cleft carry; the cleft, the cave and the slope are played through by their own bots and let
// the player go where they should, their time told to whoever keeps a board; a game left half-way leaves
// nothing behind; the cave is drawn only for who flies in it; on the ponds one gets from the first to the second.
// usage: node tools/games-test.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { botFlight } from '../src/world/zones/games/hollow/tunnel.js';
import { CLEFT } from '../src/world/zones/games/crack/cleft.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const GAMES = { slide: true, pond: true, boats: true, hill: true, crack: true, hollow: true };

const { chromium } = createRequire(import.meta.url)('playwright');
const { createServer } = await import('vite');
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5199, strictPort: false, host: '127.0.0.1' } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await (await browser.newContext({ viewport: { width: 900, height: 600 } })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/api\/|404|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?q=low`);
  await page.waitForSelector('.card.ready', { timeout: 240000 });
  await page.fill('#mmf-name', 'Player');
  await page.click('.go');
  await page.waitForFunction(() => window.__mmf && window.__mmf.input.enabled, null, { timeout: 60000 });
  const frames = (n) => page.evaluate((n) => new Promise((res) => { const app = window.__mmf, t = app.frames + n; const tick = () => (app.frames >= t ? res() : requestAnimationFrame(tick)); tick(); }), n);
  const count = () => page.evaluate(() => { const a = window.__mmf, c = a.world.collision; return { platforms: c.platforms.length, areas: c.areas.length, groups: ['cleft', 'hollow', 'hill', 'pond'].filter((n) => a.world.scene.getObjectByName(n)).length, hooks: ['climbCleft', 'flyHollow', 'climbHill'].filter((k) => a[k]).length, extras: Object.keys(a.extras || {}).length }; });
  /** What is offered to the player where it stands (the labels of the actions). */
  const offered = () => page.evaluate(() => { const a = window.__mmf; return a.world.actionSources.map((f) => f(a.player)).filter(Boolean).map((x) => x.label); });
  const at = (x, z, yaw = 0) => page.evaluate(([x, z, yaw]) => { const a = window.__mmf; a.setMode?.('walk', true); a.player.teleport(x, z, yaw); return { x: a.player.pos.x, y: a.player.pos.y, z: a.player.pos.z }; }, [x, z, yaw]);

  const before = await count();
  check('with every switch off, nothing of the games is in the world', before.groups === 0 && before.hooks === 0 && before.extras === 0, before);
  const built = await page.evaluate((on) => import('/src/extras/index.js').then(({ loadExtras }) => loadExtras(window.__mmf, on)).then((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v && (v.gate || v.stand) ? 1 : 0]))), GAMES);
  await frames(4);
  const after = await count();
  check('switched on, the six games are built, each with the place where one asks for it', Object.keys(GAMES).every((k) => built[k] === 1) && after.groups === 4 && after.hooks === 3, built);
  check('only the cleft adds to what can be walked on: its planks, and the water round them', after.platforms === before.platforms + 1 && after.areas === before.areas + 1, `${after.platforms - before.platforms} platform, ${after.areas - before.areas} area`);

  // ---- each offers itself at its gate
  const gates = await page.evaluate(() => { const e = window.__mmf.extras, g = (o) => o.gate || o.stand; return Object.fromEntries(Object.keys(e).filter((k) => g(e[k])).map((k) => [k, { x: g(e[k]).x, z: g(e[k]).z }])); });
  const labels = {};
  for (const k of ['hill', 'crack', 'hollow']) { await at(gates[k].x, gates[k].z); await frames(2); labels[k] = (await offered()).join(' | '); }
  check('at its gate each game offers itself', /Climb Uphill Battle/.test(labels.hill) && /Climb Between a Rock/.test(labels.crack) && /Fly The Hollow Hill/.test(labels.hollow), labels);
  const away = await at(0, 0); await frames(2);
  check('and away from them, none does', !(await offered()).some((l) => /Uphill|Between a Rock|Hollow Hill/.test(l)), `at ${away.x.toFixed(0)}, ${away.z.toFixed(0)}`);

  // ---- the cleft: one walks to it, the bot climbs it, one is put back on the planks
  const way = CLEFT.way, mid = await at((way.a[0] + way.b[0]) / 2, (way.a[1] + way.b[1]) / 2), land = await at(gates.crack.x, gates.crack.z);
  check('the walkway and the landing of the cleft carry the player, over the water', Math.abs(mid.y - CLEFT.floor) < 0.02 && Math.abs(land.y - CLEFT.floor) < 0.02, `at ${mid.y.toFixed(2)} m and ${land.y.toFixed(2)} m`);
  // (its ropes hold: a walker pushed every way from eight places of the walkway and of the landing — eight metres each
  // time — never leaves the planks, except by the open end of the walkway, onto the sand; who swims underneath passes)
  const ropes = await page.evaluate((floor) => {
    const m = window.__mmf, col = m.world.collision, deck = m.extras.crack.deck, r = 0.35, out = { off: 0, tried: 0, where: '' };
    for (const [sx, sz] of [[105.1, 105.2], [100.5, 108.2], [110.2, 101.8], [112.5, 100.5], [117.8, 99.8], [115, 102.2], [115, 104.5], [112, 102.4]]) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, p = { x: sx, z: sz };
      for (let i = 0; i < 160; i++) { p.x += Math.cos(a) * 0.05; p.z += Math.sin(a) * 0.05; col.resolve(p, r, floor); }
      out.tried++;
      if (deck.heightAt(p.x, p.z) === null && !(p.x < 99.6)) { out.off++; out.where = `${p.x.toFixed(1)}, ${p.z.toFixed(1)}`; }
    }
    const q = { x: 105.1, z: 107.2 }; for (let i = 0; i < 80; i++) { q.z -= 0.05; col.resolve(q, r, -0.6); }
    out.swam = +(107.2 - q.z).toFixed(1);
    return out;
  }, CLEFT.floor);
  check('nobody falls off them: a walker pushed every way stays on the planks — ropes on both sides of the walkway, the landing closed all round — and who swims underneath passes', ropes.tried === 128 && ropes.off === 0 && ropes.swam > 3.5, `${ropes.tried} pushes, ${ropes.off} off the planks${ropes.where ? ` (${ropes.where})` : ''}, ${ropes.swam} m swum under them`);
  await page.evaluate(() => { const a = window.__mmf; window.__told = {}; a.crackDone = (ms) => { window.__told.crack = ms; }; a.hollowDone = (ms, hits) => { window.__told.hollow = [ms, hits]; }; a.hillDone = (ms) => { window.__told.hill = ms; }; a.climbCleft(); a.cleftClimb().auto = true; });
  await frames(30);
  const during = await page.evaluate(() => { const a = window.__mmf, c = a.cleftClimb(); return { driven: a.player.driver === c, y: a.player.pos.y, line: c.line, keys: [...document.querySelectorAll('button')].some((b) => /keys/.test(b.textContent) && b.style.display !== 'none') }; });
  await page.waitForFunction(() => !window.__mmf.cleftClimb(), null, { timeout: 180000 });
  const done = await page.evaluate(() => { const a = window.__mmf; return { told: window.__told.crack, best: Number(localStorage.getItem('mmf.crack.best')), y: a.player.pos.y, x: a.player.pos.x, z: a.player.pos.z, driver: !!a.player.driver, keys: [...document.querySelectorAll('button')].some((b) => /keys/.test(b.textContent) && b.style.display !== 'none') }; });
  check('the cleft is climbed by its bot in the running game: the keys are offered meanwhile, the time is told and kept', during.driven && during.keys && /m of 40|to a wall/.test(during.line) && done.told > 9000 && done.told < 150000 && done.best === done.told, `${(done.told / 1000).toFixed(1)} s`);
  check('and the climber is put back on the planks before it, free again', !done.driver && !done.keys && Math.abs(done.y - CLEFT.floor) < 0.05 && Math.hypot(done.x - gates.crack.x, done.z - gates.crack.z) < 0.5);

  // ---- the cave: the lap of the bot is the lap the rules foretell
  const lap = botFlight().time;
  await at(gates.hollow.x, gates.hollow.z);
  const hidden = await page.evaluate(() => window.__mmf.extras.hollow.inside.visible);
  await page.evaluate(() => { const a = window.__mmf; a.flyHollow(); a.hollowFlight().auto = true; });
  await page.waitForFunction(() => { const f = window.__mmf.hollowFlight(); return f && f.state.s > 250; }, null, { timeout: 180000 });
  const deep = await page.evaluate(() => { const a = window.__mmf, p = a.player.pos; return { under: a.world.data.heightAt(p.x, p.z) - p.y, line: a.hollowFlight().line, inside: a.extras.hollow.inside.visible }; });
  await page.waitForFunction(() => !window.__mmf.hollowFlight(), null, { timeout: 180000 });
  const out = await page.evaluate(() => { const a = window.__mmf, p = a.player.pos; return { told: window.__told.hollow, best: Number(localStorage.getItem('mmf.hollow.best')), x: p.x, z: p.z, above: p.y - a.world.data.heightAt(p.x, p.z), driver: !!a.player.driver, inside: a.extras.hollow.inside.visible }; });
  check('the cave itself is drawn only for who flies in it: not before, not after (it is under the hill: nobody else could see it)', hidden === false && deep.inside === true && out.inside === false);
  check('the cave is flown by its bot in the running game, deep under the hill; its lap is the lap the rules foretell', deep.under > 20 && /burst|BURST/.test(deep.line) && out.told && out.told[0] === lap && out.told[1] === 0 && out.best === lap, `${(lap / 1000).toFixed(2)} s, ${deep.under.toFixed(0)} m under the ground half-way`);
  check('and the flyer is put back outside, before the mouth of the mine', !out.driver && Math.abs(out.above) < 0.1 && Math.hypot(out.x - gates.hollow.x, out.z - gates.hollow.z) < 0.5);
  // left half-way: nothing stays
  await page.evaluate(() => { const a = window.__mmf; a.flyHollow(); });
  await frames(20);
  const left = await page.evaluate(() => { const a = window.__mmf; a.leaveHollow(false); const p = a.player.pos; return { flight: !!a.hollowFlight(), driver: !!a.player.driver, above: p.y - a.world.data.heightAt(p.x, p.z), fov: a.fair.fov, rings: a.extras.hollow.rings.every((m) => m.visible) && !a.extras.hollow.inside.visible }; });
  check('a flight left half-way leaves nothing behind: the player outside, the camera given back, every ring lit again', !left.flight && !left.driver && Math.abs(left.above) < 0.1 && left.fov === null && left.rings);

  // ---- the ponds: fifteen seconds on the first, then on to the second by oneself
  await at(gates.pond.x, gates.pond.z);
  const pondOffer = (await offered()).join(' | ');
  await page.evaluate(() => { const a = window.__mmf; a.pondDone = (ms, stage) => { window.__told.pond = [ms, stage]; }; a.runPond(); a.pondRun().auto = true; });
  await page.waitForFunction(() => { const r = window.__mmf.pondRun(); return r && r.state.stage === 1 && r.state.mode === 'run' && r.state.t > 1; }, null, { timeout: 180000 });
  const second = await page.evaluate(() => { const a = window.__mmf, r = a.pondRun(), p = a.player.pos; return { line: r.line, held: r.state.held, x: p.x, z: p.z }; });
  check('the ponds: one is offered the run at the gate; fifteen seconds on the first pond, and the runner is on the second by itself', /Endless Pond/.test(pondOffer) && /Pond 2 of 3/.test(second.line) && second.held > 15 && second.held < 18 && Math.hypot(second.x + 124.5, second.z - 56) < 8.5, second.line);
  const quit = await page.evaluate(() => { const a = window.__mmf; a.leavePond(false); return { run: !!a.pondRun(), driver: !!a.player.driver, told: window.__told.pond || null }; });
  check('a run left half-way lets the player go, and is not told as a score', !quit.run && !quit.driver && quit.told === null);

  // ---- the slope: the bot climbs it with the next start
  await at(gates.hill.x, gates.hill.z);
  await page.evaluate(() => { const a = window.__mmf; a.climbHill(); a.hillClimb().auto = true; });
  await page.waitForFunction(() => !window.__mmf.hillClimb(), null, { timeout: 180000 });
  const hill = await page.evaluate(() => ({ told: window.__told.hill, driver: !!window.__mmf.player.driver }));
  check('the slope is climbed by its bot in the running game, and its time told', hill.told > 9000 && hill.told < 90000 && !hill.driver, `${(hill.told / 1000).toFixed(1)} s`);
  // ---- the regatta: asked for at the stand, it leaves with the next named start — on the clock everybody
  // shares —, the boat sails its three laps by itself and its time is told; somebody else's boat that the network
  // speaks of is shown while it races with the same start, and no longer once nothing is heard of it
  await page.evaluate(async () => { const a = window.__mmf; if (!a.extras.boats) { const { loadExtras } = await import('/src/extras/index.js'); await loadExtras(a, { boats: true }); } a.boatsDone = (ms, place) => { window.__told.boats = [ms, place]; }; const s = a.extras.boats.stand; a.player.teleport(s.x, s.z, 0); a.raceBoats(); a.boatRace().auto = true; });
  await frames(6);
  const asked = await page.evaluate(() => { const r = window.__mmf.boatRace(); return { line: r.line, name: r.start.name, wait: (r.start.at - (Date.now())) / 1000 }; });
  await page.waitForFunction(() => window.__mmf.boatRace()?.state.clock > 6, null, { timeout: 120000 });
  const guest = await page.evaluate(async () => {
    const a = window.__mmf, r = a.boatRace(), B = a.extras.boats, me = r.state.boats[0];
    B.heard(4242, r.start.n, [me.x + 3, me.z + 2, me.yaw, 6, me.s - 4, 0, Math.round(r.state.clock * 1000), 0]);
    B.heard(4343, r.start.n + 1, [me.x - 3, me.z - 2, me.yaw, 6, 10, 0, 500, 0]); // (of another start: not in this race)
    await new Promise((res) => setTimeout(res, 400));
    const seen = { same: B.racing(r.start.n), shown: [...B.guests.values()].map((g) => g.hull.visible).join(), line: r.line };
    await new Promise((res) => setTimeout(res, 3200));
    seen.left = B.guests.size;
    return seen;
  });
  await page.waitForFunction(() => !window.__mmf.boatRace(), null, { timeout: 240000 });
  const sailed = await page.evaluate(() => ({ told: window.__told.boats, driver: !!window.__mmf.player.driver }));
  check('the regatta leaves with the next named start, is sailed by its bot in the running game, and its time told; another visitor\'s boat is shown while it races with the same start — one of another start is not —, and no longer once nothing is heard of it',
    /start \w+ leaves in \d+…/.test(asked.line) && asked.wait > -1 && asked.wait <= 10.5 && guest.same === 1 && guest.shown.split(',').sort().join() === 'false,true' && /with 1 other skipper/.test(guest.line) && guest.left === 0
    && sailed.told?.[0] > 40000 && sailed.told[0] < 70000 && sailed.told[1] >= 1 && !sailed.driver,
    JSON.stringify({ asked, guest, sailed }));
  check('nothing was reported wrong by the browser', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} of ${results.length} checks pass.`);
process.exit(failed ? 1 : 0);
