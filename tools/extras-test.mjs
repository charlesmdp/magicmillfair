// Checks of two extras (src/extras): the game in figures (server/stats.js, src/extras/stats.js, the page
// /opendata) and the caves as safe places (src/extras/caves.js). Without a browser: the counting — sums only,
// nobody twice, nothing absurd let in, the owner alone sets what was before. Then in a headless browser
// (unless --no-browser): with every switch off the game is the game as it was; switched on, the browser counts
// what its visitor does and tells the server, the settings open the figures, a cave puts the chat on "Nearby"
// and what is said nearby does not go through its roof.
// usage: node tools/extras-test.mjs [--no-browser]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { statsRoute, noteSale } from '../server/stats.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };

// ------------------------------------------------------------------------------------------------ the counting
{
  const mem = new Map();
  let now = Date.UTC(2026, 10, 23, 10, 0, 0); // (a Monday)
  const ctx = { store: { get: async (k) => (mem.has(k) ? structuredClone(mem.get(k)) : undefined), put: async (k, v) => { mem.set(k, structuredClone(v)); }, delete: async (k) => { mem.delete(k); } }, now: () => now };
  const post = (device, d, extra = {}, geo) => statsRoute({ method: 'POST', path: '/api/stats', body: { device, d, color: 0, kind: 'computer', os: 'macOS', from: 'direct', ...extra }, geo }, ctx);
  const get = async () => (await statsRoute({ method: 'GET', path: '/api/stats' }, ctx)).body;
  const A = 'a'.repeat(22), B = 'b'.repeat(22);
  const first = await post(A, { keys: 120, metres: 300, secs: 60, moving: 40, blasts: 1 }, { color: 5 }, { cc: 'FR', city: 'Paris' });
  const soon = await post(A, { keys: 5, secs: 5 });
  let s = await get();
  check('what a browser did is added to the sums; told again too soon, it is not counted twice', first.body.counted && !soon.body.counted && s.keys === 120 && s.km === 0.3 && s.minutes === 1 && s.blasts === 1 && s.people === 1 && s.here === 1, `${s.keys} keys, ${s.km} km, ${s.minutes} min`);
  now += 61_000;
  await post(A, { keys: 1e9, metres: 9e9, secs: 9e9, moving: 9e9, blasts: 99 }, { color: 16 }, { cc: 'FR' });
  await post(B, { keys: 10, metres: 50, secs: 30, moving: 10 }, { color: 5, kind: 'phone', os: 'iOS', from: 'Reddit' }, { cc: 'US' });
  s = await get();
  check('nothing absurd is let in: no more than what can be done in the time since', s.keys < 120 + 10 + 66 * 30 + 21 && s.km < 0.3 + 0.05 + 66 * 0.04 + 0.001 && s.minutes <= 3 && s.blasts === 2, `${s.keys} keys, ${s.km} km, ${s.minutes} min, ${s.blasts} presses`);
  check('a robot is counted in the colour it is in now; devices, systems, where from, countries', s.colors[5] === 1 && s.colors[16] === 1 && s.colors.reduce((a, b) => a + b, 0) === 2 && s.kinds.length === 2 && s.os.find((q) => q.name === 'iOS')?.count === 1 && s.from.find((q) => q.name === 'Reddit')?.count === 1 && s.countries === 2, JSON.stringify({ colors: s.colors.map((v, i) => (v ? `${i}:${v}` : '')).filter(Boolean), kinds: s.kinds, from: s.from }));
  check('visitors: here now, today, this week, this month, ever — nobody twice', s.here === 2 && s.today === 2 && s.week === 2 && s.month === 2 && s.people === 2);
  const no = await statsRoute({ method: 'POST', path: '/api/stats/set', body: { money: 100 } }, ctx), yes = await statsRoute({ method: 'POST', path: '/api/stats/set', body: { money: 250.5, passes: 7, people: 5000 }, admin: true }, ctx);
  await noteSale(ctx.store, { cents: 1900, pass: true }, now);
  s = await get();
  check('the owner alone sets what was before the counting began; the shop adds its sales', no.status === 403 && yes.status === 200 && s.money === 269.5 && s.passes === 8 && s.people === 5000, `$${s.money}, ${s.passes} passes`);
  now += 8 * 86_400_000;
  await post(A, { keys: 1, secs: 10 }, { color: 16 });
  s = await get();
  check('eight days later, in another month: one visitor that day, that week, that month; those of before are no longer "here"', s.here === 1 && s.today === 1 && s.week === 1 && s.month === 1 && s.people === 5000 && s.days.length === 2, `${s.days.map((d) => `${d.day}: ${d.visitors}`).join(', ')}`);
  const junk = [await statsRoute({ method: 'POST', path: '/api/stats', body: { device: 'x' } }, ctx), await statsRoute({ method: 'POST', path: '/api/stats', body: null }, ctx), await statsRoute({ method: 'DELETE', path: '/api/stats' }, ctx)];
  check('what is not a count is refused; other paths are left to the rest of the API', junk[0].status === 400 && junk[1].status === 400 && junk[2].status === 405 && (await statsRoute({ method: 'GET', path: '/api/scores' }, ctx)) === null);
  check('only sums are kept, and for each device the day it was last counted: no name, no address', [...mem.keys()].every((k) => /^stats:(all|days|live|dev:[ab]{22})$/.test(k)) && !JSON.stringify([...mem.values()]).includes('Paris'), [...mem.keys()].join(', '));
}

// ------------------------------------------------------------------------------------------------- in the game
if (!opt['no-browser']) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const { createServer } = await import('vite');
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5198, strictPort: false, host: '127.0.0.1' } });
  await server.listen();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 700 } })).newPage();
  const errors = [], posts = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/api\/|404|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => { if (r.url().includes('/api/stats') && r.method() === 'POST') posts.push(r.url()); });
  try {
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?q=low`);
    await page.waitForSelector('.card.ready', { timeout: 240000 });
    await page.fill('#mmf-name', 'Counter');
    await page.click('.go');
    await page.waitForFunction(() => window.__mmf && window.__mmf.input.enabled, null, { timeout: 60000 });
    const frames = (n) => page.evaluate((n) => new Promise((res) => { const app = window.__mmf, t = app.frames + n; const tick = () => (app.frames >= t ? res() : requestAnimationFrame(tick)); tick(); }), n);
    // a place in a cave, and the ground of the mountain above it
    const spot = await page.evaluate(() => { const { world } = window.__mmf, cave = world.collision.caves[0]; for (let x = -420; x < 300; x += 2) for (let z = -330; z < 330; z += 2) if (cave.contains(x, z) && world.data.heightAt(x, z) > cave.floorAt(x, z) + 2.5) return { x, z, floor: cave.floorAt(x, z), above: world.data.heightAt(x, z), name: cave.name }; return null; });
    const put = (y) => page.evaluate(([x, y, z]) => { const p = window.__mmf.player; p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.grounded = true; }, [spot.x, y, spot.z]);
    await put(spot.floor); await frames(6);
    const off = await page.evaluate(() => ({ channel: window.__mmf.hud.chatChannel, cave: !!window.__mmf.player.cave, figures: !!document.querySelector('.open-figures') }));
    check('with every switch off, the game is the game as it was: in a cave one talks to everyone, the settings have no figures', off.cave && off.channel === 'all' && !off.figures && posts.length === 0, `in the cave "${spot.name}"`);
    await put(spot.above); await frames(4);
    await page.evaluate(() => import('/src/extras/index.js').then(({ loadExtras }) => loadExtras(window.__mmf, { stats: true, caves: true })));
    // ---- the figures
    await page.keyboard.down('KeyW'); await frames(12); await page.keyboard.up('KeyW');
    for (const k of ['KeyA', 'KeyD', 'KeyA']) await page.keyboard.press(k);
    const mine = await page.evaluate(() => { const s = window.__mmf.extras.stats; s.tell(); return { ...s.mine, kept: JSON.parse(localStorage.getItem('mmf.figures')), from: localStorage.getItem('mmf.from') }; });
    await frames(3);
    check('switched on, the browser counts what its visitor does and tells the server', mine.keys >= 4 && mine.metres > 1 && mine.secs > 0.3 && mine.moving > 0.2 && mine.kept?.keys === mine.keys && mine.from === '"direct"' && posts.length === 1, `${mine.keys} keys, ${mine.metres.toFixed(1)} m, ${mine.secs.toFixed(1)} s (${mine.moving.toFixed(1)} s on the move)`);
    await page.click('[data-act="settings"]');
    await page.click('.open-figures');
    const frame = await (await page.waitForSelector('.figures.on iframe')).contentFrame();
    await frame.waitForFunction(() => !document.getElementById('own').hidden, null, { timeout: 15000 });
    const win = await frame.evaluate(() => ({ none: !document.getElementById('none').hidden, keys: document.getElementById('myKeys').textContent, inGame: document.body.classList.contains('in-game') }));
    await page.keyboard.press('Escape');
    const closed = await page.evaluate(() => !document.querySelector('.figures').classList.contains('on') && !document.querySelector('.figures iframe'));
    check('the settings open the figures in a window: the page /opendata itself, with one\'s own figures', win.inGame && Number(win.keys) >= 4 && closed, `without a server it says so (${win.none}) and shows what this device counted: ${win.keys} keys`);
    // ---- the caves
    const notes = await page.evaluate(() => { const hud = window.__mmf.hud; window.__notes = []; const note = hud.note.bind(hud); hud.note = (t, ms) => { window.__notes.push(t); return note(t, ms); }; return true; });
    await put(spot.floor); await frames(6);
    const inside = await page.evaluate(() => { const hud = window.__mmf.hud; return { channel: hud.chatChannel, button: hud.chanBtn.textContent, placeholder: hud.chatInput.placeholder, notes: window.__notes.slice(), log: [...document.querySelectorAll('.chat .log > *')].slice(-1)[0]?.textContent || '' }; });
    await page.evaluate(() => window.__mmf.hud._channel('all')); await frames(3);
    const forced = await page.evaluate(() => window.__mmf.hud.chatChannel);
    check('in a cave the chat is on "Nearby", and stays there; it is said on the way in', notes && inside.channel === 'near' && inside.button === 'Nearby' && /nearby/.test(inside.placeholder) && /safe place/.test(inside.notes[0] || '') && /safe place/.test(inside.log) && forced === 'near', inside.notes[0]);
    const heard = await page.evaluate(async ([x, floor, above, z]) => {
      const app = window.__mmf, hud = app.hud, P = app.presence, shown = [], add = hud.addChat.bind(hud);
      if (!P?._emit) return null;
      hud.addChat = (...a) => { shown.push(a[2]); return add(...a); };
      const mole = { id: 9, name: 'Mole', color: 3, x: x + 1, y: floor, z }, bird = { ...mole, name: 'Bird', y: above };
      P._emit('chat', { id: 9, peer: mole, text: 'cave to cave', near: true });
      P._emit('chat', { id: 9, peer: bird, text: 'roof to cave', near: true });
      P._emit('chat', { id: 9, peer: bird, text: 'to everyone', near: false });
      return shown;
    }, [spot.x, spot.floor, spot.above, spot.z]);
    await put(spot.above); await frames(6);
    const out = await page.evaluate(([x, floor, z]) => {
      const app = window.__mmf, hud = app.hud, P = app.presence, shown = [], add = hud.addChat.bind(hud);
      hud.addChat = (...a) => { shown.push(a[2]); return add(...a); };
      P?._emit?.('chat', { id: 9, peer: { id: 9, name: 'Mole', color: 3, x: x + 1, y: floor, z }, text: 'cave to roof', near: true });
      return { channel: hud.chatChannel, cave: !!app.player.cave, shown, notes: window.__notes.slice(-1)[0] };
    }, [spot.x, spot.floor, spot.z]);
    check('on the mountain (or a stair) above a cave one is not in it: the chat is back to everyone', !out.cave && out.channel === 'all' && /Out of the cave/.test(out.notes || ''), out.notes);
    check('what is said nearby stays on its side of the rock: cave to cave, never through the roof', heard === null || (heard.includes('cave to cave') && heard.includes('to everyone') && !heard.includes('roof to cave') && !out.shown.includes('cave to roof')), heard === null ? 'no presence in this run' : `heard in the cave: ${heard.join(', ')}; heard above it: ${out.shown.join(', ') || 'nothing'}`);
    check('nothing was reported wrong by the browser', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    await server.close();
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} of ${results.length} checks pass.`);
process.exit(failed ? 1 : 0);
