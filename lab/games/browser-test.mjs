// Checks of the five games being tried, in the running game (a headless browser): before a game is attached
// nothing of it is in the world; attached, it is built without a word of complaint and offered at its gate;
// played by its own bot, it lets the player go where it should, its score told and kept; left half-way, it
// leaves nothing behind.
// usage: node lab/games/browser-test.mjs [id …]      (waves lava hive flip spiral; all of them when none is named)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stubOutside } from '../../tools/lib/outside.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };

// For each game: what its action says at the gate; `hurry` (run in the page, given the id): what brings the end of
// a run by the bot nearer, where a whole run would take minutes; `score`: what a told score must look like.
const SPECS = {
  waves: {
    offer: /Wade in/,
    // (the wader is put fifty-six metres out, where the sea soon has the better of anybody)
    hurry: async (id) => { const { WAVES: W } = await import('/lab/games/waves/rules.js'); const st = window.__mmf.labGames[id].run().state; st.s = 56; st.clock = 56 / W.drift; st.next = Math.ceil((st.t0 + st.clock - (W.length + W.far - st.s - 1.5) / W.speed) / W.beat); },
    score: (ms) => ms > 100000 && ms < 300000,
    // (the bar can be walked on at any time: its sand carries, twenty metres out as on the beach)
    also: async (page, check) => {
      const y = await page.evaluate(async () => { const { barAt } = await import('/lab/games/waves/rules.js'); const a = window.__mmf, p = barAt(20, 1); a.setMode?.('walk', true); a.player.teleport(p.x, p.z, 0); return { y: a.player.pos.y, swim: !!a.player.swimming }; });
      check('waves: the bar of sand carries who walks out on it', Math.abs(y.y - 0.22) < 0.02 && !y.swim, `${y.y.toFixed(2)} m over the sea, twenty metres out`);
    },
  },
  lava: { offer: /Thin Crust/, score: (ms) => ms > 3000 && ms < 600000 },
  hive: { offer: /Bee/, score: (ms) => ms > 3000 && ms < 600000 },
  flip: { offer: /Head Over Heels/, score: (ms) => ms > 10000 && ms < 600000 },
  spiral: { offer: /Turn for the Worse/, score: (ms) => ms > 20000 && ms < 900000 },
};
const asked = process.argv.slice(2).filter((a) => SPECS[a]), ids = asked.length ? asked : Object.keys(SPECS);

const { chromium } = createRequire(import.meta.url)('playwright');
const { createServer } = await import('vite');
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5240, strictPort: false, host: '127.0.0.1', hmr: false, watch: null } }); // (nothing is watched: a file saved meanwhile does not load the page again)
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
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
  const offered = () => page.evaluate(() => { const a = window.__mmf; return a.world.actionSources.map((f) => f(a.player)).filter(Boolean).map((x) => x.label); });
  const world = () => page.evaluate((ids) => { const a = window.__mmf; return { groups: ids.filter((id) => a.world.scene.getObjectByName(id)).length, games: Object.keys(a.labGames || {}).length, sources: a.world.actionSources.length, zones: a.world.zones.length }; }, ids);
  await page.evaluate(() => { window.__told = {}; });

  const before = await world();
  check('before any of them is attached, nothing of them is in the world', before.groups === 0 && before.games === 0, before);
  for (const id of ids) {
    const spec = SPECS[id];
    const built = await page.evaluate((id) => import(`/lab/games/${id}/extra.js`).then((m) => m.attach(window.__mmf)).then((g) => ({ gate: g.gate, group: !!window.__mmf.world.scene.getObjectByName(id), game: !!window.__mmf.labGames[id] })).catch((e) => ({ error: String(e && e.stack || e).slice(0, 400) })), id);
    await frames(4);
    check(`${id}: built in the running game — one group named after it, a gate`, !built.error && built.group && built.game && Number.isFinite(built.gate?.x), built.error || `gate at (${built.gate.x.toFixed(1)}, ${built.gate.z.toFixed(1)})`);
    if (built.error) continue;
    if (spec.also) await spec.also(page, check);
    // ---- at its gate: offered; on ground one can stand on
    const stand = await page.evaluate((id) => { const a = window.__mmf, g = a.labGames[id].game.gate; a.setMode?.('walk', true); a.player.teleport(g.x, g.z, g.yaw); return { y: a.player.pos.y, gate: g.y }; }, id);
    await frames(3);
    const labels = (await offered()).join(' | ');
    check(`${id}: offered at its gate, which is on ground one stands on`, spec.offer.test(labels) && Math.abs(stand.y - stand.gate) < 0.6 && stand.y > 0.1, `"${labels}" · ${stand.y.toFixed(2)} m over the sea`);
    // ---- left half-way: nothing stays
    const left = await page.evaluate(async (id) => {
      const a = window.__mmf, g = a.labGames[id];
      a[`${id}Done`] = (score) => { window.__told[id] = score; };
      g.start();
      await new Promise((res) => { const t = a.frames + 12; const tick = () => (a.frames >= t ? res() : requestAnimationFrame(tick)); tick(); });
      const during = { driven: a.player.driver === g.run(), line: g.run()?.line || '', keys: [...document.querySelectorAll('button')].some((b) => /keys/.test(b.textContent) && b.style.display !== 'none') };
      g.leave(false);
      return { during, run: !!g.run(), driver: !!a.player.driver, fov: a.fair.fov, told: window.__told[id] ?? null, x: a.player.pos.x, z: a.player.pos.z, keys: [...document.querySelectorAll('button')].some((b) => /keys/.test(b.textContent) && b.style.display !== 'none') };
    }, id);
    check(`${id}: while it is played the player is driven, the line of the run and the keys are shown`, left.during.driven && left.during.line.length > 3 && left.during.keys, left.during.line);
    check(`${id}: left half-way it leaves nothing behind: the player free at the gate, the camera given back, no score told`, !left.run && !left.driver && left.fov === null && left.told === null && !left.keys && Math.hypot(left.x - built.gate.x, left.z - built.gate.z) < 1.5);
    // ---- played by its own bot to the end
    await page.evaluate((id) => { const a = window.__mmf, g = a.labGames[id]; a.player.teleport(g.game.gate.x, g.game.gate.z, g.game.gate.yaw); g.start(); g.run().auto = true; }, id);
    if (spec.hurry) await page.evaluate(spec.hurry, id);
    await page.waitForFunction((id) => !window.__mmf.labGames[id].run(), id, { timeout: 420000, polling: 250 });
    const done = await page.evaluate((id) => { const a = window.__mmf, p = a.player.pos; return { told: window.__told[id] ?? null, best: Number(localStorage.getItem(`mmf.${id}.best`)), driver: !!a.player.driver, x: p.x, z: p.z, fov: a.fair.fov }; }, id);
    check(`${id}: played by its own bot to the end, its score told and kept as one's best`, done.told !== null && spec.score(done.told) && done.best === done.told, done.told === null ? 'no score told' : `${(done.told / 1000).toFixed(1)} s`);
    check(`${id}: and the player is let go at the gate, the camera given back`, !done.driver && done.fov === null && Math.hypot(done.x - built.gate.x, done.z - built.gate.z) < 1.5);
  }
  const after = await world();
  check('each adds one group to the world, one action and one thing that goes by the clock', after.groups === ids.length && after.games === ids.length && after.sources === before.sources + ids.length && after.zones === before.zones + ids.length, after);
  check('nothing was reported wrong by the browser', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} of ${results.length} checks pass.`);
process.exit(failed ? 1 : 0);
