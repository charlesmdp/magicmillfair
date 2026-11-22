// Dev tool: gameplay checks in headless Chromium — walking onto the pier, crossing a footbridge, climbing the
// garden steps, being stopped by the mountains and by a wall, swimming, the stairway and the temple, the
// terraces above the waterfall, the secret cove, the sky villages and their gate, the island (its wall, its
// walkways, its boulder), sitting and lying down, the big wheel, the caves, chat and
// emotes and commands, the climb (a bot makes every jump of the course; the clock, the board), the tower from
// which it is watched, a dive, the mushrooms, the acid pond and the
// shark, changing the quality tier (page reload at the same spot) — and the download size.
// usage: node tools/walk-test.mjs [--q=low]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools/preview/walk');
fs.mkdirSync(OUT, { recursive: true });
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5194, strictPort: false, host: '127.0.0.1' } });
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
// (the test runs with Shift and turns the camera itself: as when a visitor has switched both helps off)
await context.addInitScript(() => { try { for (const k of ['mmf.run', 'mmf.follow']) if (localStorage.getItem(k) === null) localStorage.setItem(k, '0'); } catch { /* no storage */ } });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push(e.message));

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };
const frames = (n) => page.evaluate((n) => { const app = window.__mmf; const target = app.frames + n; return new Promise((res) => { const tick = () => (app.frames >= target ? res() : requestAnimationFrame(tick)); tick(); }); }, n);
const state = () => page.evaluate(() => { const p = window.__mmf.player; return { x: p.pos.x, y: p.pos.y, z: p.pos.z, swimming: p.swimming, grounded: p.grounded, anim: p.anim }; });
/** Put the player somewhere, facing `heading` degrees (0 = north, 90 = west, 180 = south, 270 = east). */
const place = (x, z, heading) => page.evaluate(([x, z, h]) => {
  const app = window.__mmf, yaw = (h * Math.PI) / 180;
  app.player.teleport(x, z, yaw + Math.PI);
  app.rig.snap(app.player.pos, yaw);
}, [x, z, heading]);
const walk = async (n, run = false) => {
  if (run) await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await frames(n);
  await page.keyboard.up('KeyW');
  if (run) await page.keyboard.up('ShiftLeft');
  await frames(2);
};

try {
  await page.goto(`http://127.0.0.1:${port}/?q=${opt.q || 'low'}`);
  await page.waitForSelector('.card.ready', { timeout: 240000 });
  const dl = await page.evaluate(() => {
    const list = performance.getEntriesByType('resource').filter((e) => e.name.includes('/assets/'));
    return { files: list.length, bytes: list.reduce((n, e) => n + (e.encodedBodySize || 0), 0) };
  });
  console.log(`download: ${(dl.bytes / 1048576).toFixed(1)} MB in ${dl.files} asset files (tier ${opt.q || 'low'})`);
  await page.click('.go');
  await frames(30); // the opening camera glide
  const layout = await page.evaluate(async () => {
    const L = await import('/src/world/layout/layout.js');
    const w = window.__mmf.world;
    const decks = (w.mill.platforms || []).filter((p) => p.type === 'deck').map((p) => ({ a: p.a, b: p.b, width: p.width, camber: p.camber }));
    return { pier: L.PIER, decks: decks.filter((p) => p.camber > 0), stairs: decks.filter((p) => p.camber === 0), pondBig: L.LEVELS.pondBig, bounds: w.data.meta.bounds };
  });

  // --- the pier: from the plaza, run along its axis
  const P = layout.pier, ch = Math.cos(P.heading), sh = Math.sin(P.heading);
  const heading = ((Math.atan2(-ch, -sh) * 180) / Math.PI + 360) % 360; // camera yaw whose forward is the pier axis
  await place(P.rootX - ch * 8, P.rootZ - sh * 8, heading);
  await frames(3);
  const p0 = await state();
  await walk(46, true);
  const p1 = await state();
  const along = (p1.x - P.rootX) * ch + (p1.z - P.rootZ) * sh;
  check('walks from the plaza onto the pier deck', along > 12 && Math.abs(p1.y - P.deckY) < 0.5, `along the pier ${along.toFixed(1)} m, height ${p1.y.toFixed(2)} (deck ${P.deckY}), started at ${p0.y.toFixed(2)}`);
  await page.screenshot({ path: path.join(OUT, 'pier.png') });
  // the railing stops a walker heading sideways
  await place(P.rootX + ch * 60, P.rootZ + sh * 60, (heading + 90) % 360);
  await frames(3);
  await walk(40, true);
  const p2 = await state();
  const across = -(p2.x - P.rootX) * sh + (p2.z - P.rootZ) * ch;
  check('the pier railing holds', Math.abs(across) < P.width / 2 && Math.abs(p2.y - P.deckY) < 0.6, `offset from the axis ${across.toFixed(2)} m (half width ${P.width / 2})`);

  // --- a footbridge
  if (layout.decks.length) {
    const d = layout.decks[0];
    const dx = d.b.x - d.a.x, dz = d.b.z - d.a.z, len = Math.hypot(dx, dz);
    const h = ((Math.atan2(-dx / len, -dz / len) * 180) / Math.PI + 360) % 360;
    await place(d.a.x - (dx / len) * 1.6, d.a.z - (dz / len) * 1.6, h);
    await frames(3);
    let top = -1e9;
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 14; i++) { await frames(2); top = Math.max(top, (await state()).y); }
    await page.keyboard.up('KeyW');
    const p3 = await state();
    const t = ((p3.x - d.a.x) * dx + (p3.z - d.a.z) * dz) / (len * len);
    check('crosses a footbridge on its deck', t > 0.9 && top > Math.min(d.a.y, d.b.y) - 0.1, `progress ${(t * 100).toFixed(0)} %, highest point ${top.toFixed(2)} (deck ends ${d.a.y.toFixed(2)} / ${d.b.y.toFixed(2)})`);
    await page.screenshot({ path: path.join(OUT, 'bridge.png') });
  }

  // --- garden steps: climbed on their treads, from the foot to the upper terrace
  if (layout.stairs.length) {
    const d = layout.stairs[0];
    const dx = d.b.x - d.a.x, dz = d.b.z - d.a.z, len = Math.hypot(dx, dz);
    const h = ((Math.atan2(-dx / len, -dz / len) * 180) / Math.PI + 360) % 360;
    await place(d.a.x - (dx / len) * 1.2, d.a.z - (dz / len) * 1.2, h);
    await frames(3);
    const y0 = (await state()).y;
    let mid = null;
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 12; i++) { await frames(2); const st = await state(); const t = ((st.x - d.a.x) * dx + (st.z - d.a.z) * dz) / (len * len); if (t > 0.35 && t < 0.65 && !mid) mid = { t, y: st.y }; }
    await page.keyboard.up('KeyW');
    const st = await state();
    const expected = mid ? d.a.y + (d.b.y - d.a.y) * mid.t : 0;
    check('climbs the garden steps on their treads', st.y > d.b.y - 0.25 && !!mid && Math.abs(mid.y - expected) < 0.3, `from ${y0.toFixed(2)} to ${st.y.toFixed(2)} (top ${d.b.y.toFixed(2)})${mid ? `, half way ${mid.y.toFixed(2)} for ${expected.toFixed(2)}` : ''}`);
  }

  // --- the mountains: the valley cannot be left
  const inside = (x, z) => { let inn = false; const b = layout.bounds; for (let i = 0, j = b.length - 1; i < b.length; j = i++) { if ((b[j][1] > z) !== (b[i][1] > z) && x < ((b[i][0] - b[j][0]) * (z - b[j][1])) / (b[i][1] - b[j][1]) + b[j][0]) inn = !inn; } return inn; };
  await place(-88, -168, 0); // on the lane, facing the mountains to the north
  await frames(3);
  await walk(50, true);
  const m1 = await state();
  await place(-262, 20, 90); // at the foot of the western crags, facing them
  await frames(3);
  await walk(50, true);
  const m2 = await state();
  const near = (x, z) => inside(x, z) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => inside(x + a * 0.6, z + c * 0.6));
  check('the mountains cannot be crossed', near(m1.x, m1.z) && near(m2.x, m2.z) && m1.z > -186 && m2.x > -292, `north: ${m1.x.toFixed(1)}, ${m1.z.toFixed(1)} · west: ${m2.x.toFixed(1)}, ${m2.z.toFixed(1)}`);

  // --- swimming in the big pond
  await place(-170, 62, 200);
  await frames(8);
  const s0 = await state();
  await walk(12);
  const s1 = await state();
  check('swims in the pond', s0.swimming && s1.swimming && Math.abs(s1.y - (layout.pondBig - 1.05)) < 0.25 && Math.hypot(s1.x - s0.x, s1.z - s0.z) > 1, `depth of the body ${(layout.pondBig - s1.y).toFixed(2)} m under the surface, moved ${Math.hypot(s1.x - s0.x, s1.z - s0.z).toFixed(1)} m`);
  await page.screenshot({ path: path.join(OUT, 'swim.png') });

  // --- walls: walking into the house does not go through
  const house = await page.evaluate(async () => (await import('/src/world/layout/layout.js')).MILL.house);
  await place(house.x + 14, house.z - 4, 90); // east of the house, facing west
  await frames(3);
  await walk(40, true);
  const w1 = await state();
  const lx = (w1.x - house.x) * Math.cos(house.yaw) - (w1.z - house.z) * Math.sin(house.yaw);
  const lz = (w1.x - house.x) * Math.sin(house.yaw) + (w1.z - house.z) * Math.cos(house.yaw);
  check('the house walls stop the walker', !(Math.abs(lx) < house.width / 2 && Math.abs(lz) < house.length / 2), `position in the house frame ${lx.toFixed(1)}, ${lz.toFixed(1)}`);

  // --- the stairway: a flight climbed on its steps, then the village and its lookout wall
  const places = await page.evaluate(async () => {
    const L = await import('/src/world/layout/layout.js');
    return { stairs: L.STAIRWAY.points, village: L.VILLAGE, beam: L.islandPath(L.ISLAND.beams[2]), islandY: L.ISLAND.y1, caves: L.CAVES.map((c) => ({ id: c.id, nodes: c.nodes })), wheel: L.pierToWorld(L.PIER.wheel.along - 2.8, 0.5) };
  });
  const prompt = () => page.evaluate(() => [...document.querySelectorAll('.prompt.on span')].map((e) => e.textContent));
  const toward = (ax, az, bx, bz) => ((Math.atan2(-(bx - ax), -(bz - az)) * 180) / Math.PI + 360) % 360; // camera heading to walk from a to b
  {
    const [a, b2] = places.stairs;
    await place(a[0], a[1], toward(a[0], a[1], b2[0], b2[1]));
    await frames(3);
    const y0 = (await state()).y;
    await walk(46, true);
    const s1 = await state();
    check('climbs a flight of the stairway', Math.abs(y0 - a[2]) < 0.3 && Math.abs(s1.y - b2[2]) < 0.4 && Math.hypot(s1.x - b2[0], s1.z - b2[1]) < 2.5, `from ${y0.toFixed(1)} to ${s1.y.toFixed(1)} (corner at ${b2[2]})`);
    const top = places.stairs.at(-1), V = places.village;
    await place(top[0], top[1], 90); // from the top of the steps, west into the village
    await frames(3);
    await walk(24, true);
    const v1 = await state();
    await place(-357.5, 42, 270); // then east, into the wall of the lookout
    await frames(3);
    await walk(30, true);
    const v2 = await state();
    check('reaches the temple through its gate; the wall of the lookout holds', Math.abs(v1.y - V.y) < 0.3 && v1.x < top[0] - 8 && v2.x < -353.6 && Math.abs(v2.y - V.y) < 0.3, `walked to x ${v1.x.toFixed(1)} at ${v1.y.toFixed(1)} m; stopped at x ${v2.x.toFixed(1)}`);
    // up the steps of the great hall, onto its plinth; its walls hold
    const hall = await page.evaluate(() => {
      const app = window.__mmf, { player, input } = app, dt = 1 / 60;
      const go = (dx, dz, n) => { for (let f = 0; f < n; f++) { input.move.x = dx; input.move.y = -dz; input.run = false; input.jump = false; player.update(dt, 0, true); } input.move.x = 0; input.move.y = 0; };
      return import('/src/world/layout/layout.js').then((L) => {
        const H = L.VILLAGE.temple.hall, c = Math.cos(H.yaw), sn = Math.sin(H.yaw);
        const W = (lx, lz) => [H.x + lx * c + lz * sn, H.z - lx * sn + lz * c];
        const [sx, sz] = W(H.plinth + 4.5, 0.9), [tx, tz] = W(0, 0.9);
        player.teleport(sx, sz, 0);
        const y0 = player.pos.y;
        const l = Math.hypot(tx - sx, tz - sz);
        go((tx - sx) / l, (tz - sz) / l, 200);
        const lx = (player.pos.x - H.x) * c - (player.pos.z - H.z) * sn;
        return { y0, y: player.pos.y, want: L.VILLAGE.y + 0.94, front: lx, plinth: H.plinth };
      });
    });
    check('climbs the steps of the great hall and stops at its wall', Math.abs(hall.y0 - (hall.want - 0.9)) < 0.3 && Math.abs(hall.y - hall.want) < 0.12 && hall.front > 4.6 && hall.front < hall.plinth, `from ${hall.y0.toFixed(2)} up to ${hall.y.toFixed(2)} (plinth ${hall.want.toFixed(2)}), ${hall.front.toFixed(2)} m in front of the middle`);
  }

  // --- above the great waterfall: up the steps beside it, from terrace to terrace, then off the brink
  {
    const up = await page.evaluate(() => {
      const app = window.__mmf, { player, input, world } = app, dt = 1 / 60;
      const go = (dx, dz, n, run = true) => { for (let f = 0; f < n; f++) { input.move.x = dx; input.move.y = -dz; input.run = run; input.jump = false; player.update(dt, 0, true); } input.move.x = 0; input.move.y = 0; input.run = false; };
      return import('/src/world/layout/layout.js').then((L) => {
        const F = L.FALLS, out = { flights: [], levels: F.levels.map((t) => t.y) };
        for (const st of F.stairs) {
          const [a] = st.points;
          player.teleport(a[0], a[1], 0);
          const start = player.pos.y;
          for (let k = 0; k + 1 < st.points.length; k++) {
            const p = st.points[k], q = st.points[k + 1];
            for (let f = 0; f < 400 && Math.hypot(q[0] - player.pos.x, q[1] - player.pos.z) > 0.5; f++) { const dx = q[0] - player.pos.x, dz = q[1] - player.pos.z, l = Math.hypot(dx, dz); go(dx / l, dz / l, 1); }
            void p;
          }
          const end = st.points.at(-1);
          out.flights.push({ from: start, want0: st.points[0][2], to: player.pos.y, want: end[2], off: Math.hypot(end[0] - player.pos.x, end[1] - player.pos.z) });
        }
        // from the last flight, into the high clearing: its meadow, its lake (shallow), its fire
        {
          const G = L.GLADE, legs = [];
          for (const q of [[G.fire[0] - 3, G.fire[1] - 3], [-362.5, 189], [G.x + G.rx + 12, G.z]]) { for (let f = 0; f < 700 && Math.hypot(q[0] - player.pos.x, q[1] - player.pos.z) > 0.7; f++) { const dx = q[0] - player.pos.x, dz = q[1] - player.pos.z, l = Math.hypot(dx, dz); go(dx / l, dz / l, 1); } legs.push({ x: player.pos.x, y: player.pos.y, z: player.pos.z, swimming: player.swimming, wading: !!player.wading }); }
          out.glade = { legs, y: G.y, edge: Math.hypot((player.pos.x - G.x) / G.rx, (player.pos.z - G.z) / G.rz), seats: world.seats.filter((s) => Math.hypot(s.x - G.x, s.z - G.z) < 32).length, zone: L.ZONES.find((z) => z.id === 'glade')?.name, torrents: world.sky.torrents || 0 };
        }
        // wading in the top pool
        const pool = world.data.meta.streams.find((s) => s.id === 'torrent').samples.find((q) => Math.abs(q[2] - 46.25) < 0.12 && q[3] > 7);
        player.teleport(pool[0], pool[1], 0);
        for (let f = 0; f < 30; f++) go(0, 0, 1);
        out.pool = { y: player.pos.y, water: world.data.waterAt(pool[0], pool[1]), wading: player.wading, swimming: player.swimming };
        // from the lowest terrace, east over the brink of the great fall
        const lip = world.data.meta.streams.find((s) => s.id === 'torrent');
        void lip;
        player.teleport(-296, 123.2, 0);
        const y0 = player.pos.y;
        let dived = false, swam = false;
        for (let f = 0; f < 150; f++) { go(1, 0.08, 1); dived ||= player.diving; swam ||= player.swimming; }
        for (let f = 0; f < 200; f++) { go(0, 0, 1); swam ||= player.swimming; }
        out.leap = { y0, y: player.pos.y, x: player.pos.x, z: player.pos.z, walkable: world.collision.walkable(player.pos.x, player.pos.z), cave: !!player.cave, dived, swam, water: world.data.waterAt(player.pos.x, player.pos.z) };
        // …and out of the pool on foot, to the shore where the steps start
        for (let f = 0; f < 600 && Math.hypot(-277.5 - player.pos.x, 114.6 - player.pos.z) > 0.7; f++) { const dx = -277.5 - player.pos.x, dz = 114.6 - player.pos.z, l = Math.hypot(dx, dz); go(dx / l, dz / l, 1); }
        out.ashore = { x: player.pos.x, y: player.pos.y, z: player.pos.z, swimming: player.swimming };
        return out;
      });
    });
    const okFlights = up.flights.every((f) => Math.abs(f.from - f.want0) < 0.35 && Math.abs(f.to - f.want) < 0.35 && f.off < 1.2);
    check('climbs the steps beside the falls, from terrace to terrace', okFlights && up.flights.length === 4 && Math.abs(up.flights[2].to - up.levels[2]) < 0.4, up.flights.map((f) => `${f.from.toFixed(1)} → ${f.to.toFixed(1)} (${f.want})`).join(', '));
    check('the last flight leads to the high clearing: a meadow to walk, a lake to wade in, a wood that holds one in, places to sit', Math.abs(up.glade.legs[0].y - up.glade.y) < 0.9 && !up.glade.legs[0].swimming && up.glade.legs[1].wading && !up.glade.legs[1].swimming && up.glade.edge < 1.02 && up.glade.edge > 0.8 && up.glade.seats >= 14 && up.glade.zone === 'The High Clearing' && up.glade.torrents > 100, JSON.stringify(up.glade));
    check('wades in the top pool, leaps from the lowest terrace into the pool of the great fall', up.pool.water > 45.5 && up.pool.y < up.pool.water && (up.pool.wading || up.pool.swimming) && Math.abs(up.leap.y0 - up.levels[0]) < 0.3 && up.leap.y < 13.5 && up.leap.x > -288 && up.leap.walkable && !up.leap.cave, JSON.stringify({ pool: up.pool, leap: up.leap }));
    check('the leap ends in a swan dive into deep water; one walks out of the pool where the steps start', up.leap.dived && up.leap.swam && up.leap.y < up.leap.water && !up.ashore.swimming && up.ashore.y > 12.3 && Math.hypot(up.ashore.x + 277.5, up.ashore.z - 114.6) < 1, JSON.stringify({ leap: up.leap, ashore: up.ashore }));
  }

  // --- the secret cove: swum to along the foot of the cliffs, without waking the shark
  {
    const cove = await page.evaluate(() => {
      const app = window.__mmf, { player, input, world } = app, g = world.games, dt = 1 / 30;
      const go = (dx, dz, n) => { for (let f = 0; f < n; f++) { input.move.x = dx; input.move.y = -dz; input.run = true; input.jump = false; player.update(dt, 0, true); g._tickShark(dt, f * dt, player); } input.move.x = 0; input.move.y = 0; input.run = false; };
      return import('/src/world/layout/layout.js').then((L) => {
        const route = [[150, 100], [176, 118], [200, 140], [214, 160], [213, 174], [203, 184], [193, 190], [184, 194], [179, 196]];
        player.teleport(route[0][0], route[0][1], 0);
        for (let f = 0; f < 60; f++) go(0, 0, 1);
        const out = { swam: player.swimming, minFar: 1e9, modes: new Set() };
        for (const q of route.slice(1)) {
          for (let f = 0; f < 600 && Math.hypot(q[0] - player.pos.x, q[1] - player.pos.z) > 1.2; f++) { const dx = q[0] - player.pos.x, dz = q[1] - player.pos.z, l = Math.hypot(dx, dz); go(dx / l, dz / l, 1); out.minFar = Math.min(out.minFar, g.seaEdgeDistance(player.pos.x, player.pos.z)); out.modes.add(g.sharkState.mode); }
        }
        for (let f = 0; f < 30; f++) go(0, 0, 1);
        const zone = L.ZONES.find((z) => z.id === 'cove');
        return { swam: out.swam, minFar: out.minFar, modes: [...out.modes], dead: !!player.dead, x: player.pos.x, y: player.pos.y, z: player.pos.z, swimming: player.swimming, d: Math.hypot(player.pos.x - L.COVE.x, player.pos.z - L.COVE.z), hidden: zone.hidden === true, seats: world.seats.filter((s) => Math.hypot(s.x - L.COVE.x, s.z - L.COVE.z) < 14).length };
      });
    });
    await frames(30);
    const named = await page.evaluate(() => document.querySelector('.hud .zone').textContent);
    check('swims round the cape to the secret cove and lands on its beach; the shark stays away', cove.swam && !cove.dead && !cove.swimming && cove.y > 0.3 && cove.d < 9 && cove.minFar > 30 && cove.modes.join() === 'patrol' && cove.hidden && cove.seats >= 18 && named === 'The Secret Cove', JSON.stringify({ ...cove, named }));
  }

  // --- the cave behind the fall that drops into the sea: only a swimmer finds it, along the foot of the cliffs
  {
    const den = await page.evaluate(() => {
      const app = window.__mmf, { player, input, world } = app, g = world.games, dt = 1 / 30;
      const go = (dx, dz, n) => { for (let f = 0; f < n; f++) { input.move.x = dx; input.move.y = -dz; input.run = true; input.jump = false; player.update(dt, 0, true); g._tickShark(dt, f * dt, player); } input.move.x = 0; input.move.y = 0; input.run = false; };
      const to = (q, max = 900) => { for (let f = 0; f < max && Math.hypot(q[0] - player.pos.x, q[1] - player.pos.z) > 0.8; f++) { const dx = q[0] - player.pos.x, dz = q[1] - player.pos.z, l = Math.hypot(dx, dz); go(dx / l, dz / l, 1); out.minFar = Math.min(out.minFar, g.seaEdgeDistance(player.pos.x, player.pos.z)); out.modes.add(g.sharkState.mode); } };
      const out = { minFar: 1e9, modes: new Set() };
      return import('/src/world/layout/layout.js').then((L) => {
        const cave = L.CAVES.find((c) => c.id === 'sea'), [mx, mz] = cave.nodes[0], [nx, nz] = cave.nodes[1], l = Math.hypot(nx - mx, nz - mz), ox = (mx - nx) / l, oz = (mz - nz) / l; // out of the mouth
        player.teleport(95, -122, 0);
        for (let f = 0; f < 60; f++) go(0, 0, 1);
        out.swam = player.swimming;
        // elsewhere the foot of the cliffs cannot be reached
        for (const q of [[105, -140], [128, -152], [150, -172]]) to(q);
        for (let f = 0; f < 200; f++) go(-0.7, -0.7, 1);
        out.wall = { x: player.pos.x, z: player.pos.z, h: world.data.heightAt(player.pos.x, player.pos.z), swimming: player.swimming };
        for (const q of [[152, -173], [166, -190], [mx + ox * 13, mz + oz * 13], [mx + ox * 6, mz + oz * 6]]) to(q);
        out.before = { swimming: player.swimming, cave: !!player.cave };
        for (const q of [[mx + ox * 0.5, mz + oz * 0.5], [nx, nz], ...cave.nodes.slice(2, 5).map((n) => [n[0], n[1]])]) to(q);
        const room = cave.nodes[4], zone = L.ZONES.find((z) => z.id === 'sea');
        Object.assign(out, { x: player.pos.x, y: player.pos.y, z: player.pos.z, cave: player.cave?.name || null, floor: room[3], d: Math.hypot(player.pos.x - room[0], player.pos.z - room[1]), dead: !!player.dead, swimming: player.swimming, hidden: zone.hidden === true, modes: [...out.modes], seats: world.seats.filter((s) => Math.hypot(s.x - room[0], s.z - room[1]) < 8).length });
        return out;
      });
    });
    await frames(30);
    const named = await page.evaluate(() => document.querySelector('.hud .zone').textContent);
    check('swims along the northern cliffs, through the fall into the cave behind it; the shark stays away', den.swam && den.wall.swimming && den.wall.h < -1 && den.before.swimming && !den.before.cave && den.cave === 'sea' && !den.dead && !den.swimming && Math.abs(den.y - den.floor) < 0.3 && den.d < 2 && den.minFar > 30 && den.modes.join() === 'patrol' && den.hidden && den.seats >= 3 && named === "The Smugglers' Den", JSON.stringify({ ...den, named }));
  }

  // --- the sky villages: carried there from the Sky Gate, and back through the ring
  {
    const g = await page.evaluate(() => {
      const s = window.__mmf.sky, seats = window.__mmf.world.seats, prices = {};
      for (const v of s.villages) (prices[v.price] ||= []).push(v.y);
      const tiers = Object.keys(prices).map(Number).sort((a, b) => a - b);
      return {
        gate: s.gate, n: s.villages.length, names: s.villages.map((v) => v.name), tiers, each: tiers.map((t) => prices[t].length),
        rising: tiers.every((t, k) => k === 0 || Math.min(...prices[t]) >= Math.max(...prices[tiers[k - 1]])),
        seats: Math.min(...s.villages.map((v) => seats.filter((q) => Math.hypot(q.x - v.x, q.z - v.z) < 12.5).length)), hire: s.villages.filter((v) => v.forHire).length,
      };
    });
    await place(g.gate.arrive[0], g.gate.arrive[1], 0);
    await frames(4);
    const offered = await prompt();
    await page.keyboard.press('KeyE');
    await page.waitForSelector('.chooser.on', { timeout: 5000 });
    const listed = await page.evaluate(() => [...document.querySelectorAll('.chooser .list button b')].map((b) => b.textContent));
    await page.click('.chooser .list button:nth-child(8)');
    await frames(30);
    const there = await page.evaluate(() => {
      const m = window.__mmf, p = m.player.pos, v = m.sky.villageAt(p.x, p.z);
      // which way the camera looks: at the valley?
      const f = new m.THREE.Vector3(); m.engine.camera.getWorldDirection(f);
      const toValley = v ? Math.hypot(-60 - p.x, 10 - p.z) : 1;
      return { village: v && v.name, y: p.y, want: v && v.y, grounded: m.player.grounded, zone: document.querySelector('.hud .zone').textContent, open: document.querySelector('.chooser').classList.contains('on'), facing: v ? (f.x * (-60 - p.x) + f.z * (10 - p.z)) / toValley : 0, walkable: m.world.collision.walkable(p.x, p.z) };
    });
    // the edge of the shelf holds; then back through the ring
    const back = await page.evaluate(() => {
      const m = window.__mmf, { player, input } = m, dt = 1 / 60, v = m.sky.villageAt(player.pos.x, player.pos.z);
      const go = (dx, dz, n) => { for (let f = 0; f < n; f++) { input.move.x = dx; input.move.y = -dz; input.run = true; input.jump = false; player.update(dt, 0, true); } input.move.x = 0; input.move.y = 0; input.run = false; };
      go(Math.sin(v.yaw + 0.7), Math.cos(v.yaw + 0.7), 240); // towards the valley, a little to the side of the bench
      const edge = Math.hypot(player.pos.x - v.x, player.pos.z - v.z), y = player.pos.y;
      player.teleport(v.ring[0] + Math.sin(v.yaw) * 1.6, v.ring[1] + Math.cos(v.yaw) * 1.6, 0);
      return { edge, y, vy: v.y };
    });
    // at the board of a village for hire: what it costs
    const hire = await page.evaluate(() => {
      const m = window.__mmf, v = m.sky.villageAt(m.player.pos.x, m.player.pos.z) || m.sky.villages[7];
      m.player.teleport(v.board[0] - Math.sin(v.yaw) * 1.6, v.board[1] - Math.cos(v.yaw) * 1.6, v.yaw);
      return { name: v.name, price: v.price, motto: v.motto };
    });
    await frames(6);
    const board = await prompt();
    await page.evaluate(() => { const m = window.__mmf, v = m.sky.villageAt(m.player.pos.x, m.player.pos.z); m.player.teleport(v.ring[0] + Math.sin(v.yaw) * 1.6, v.ring[1] + Math.cos(v.yaw) * 1.6, 0); });
    await frames(4);
    const ring = await prompt();
    await page.keyboard.press('KeyE');
    await frames(20);
    const home = await page.evaluate(() => { const m = window.__mmf, p = m.player.pos; return { d: Math.hypot(p.x - m.sky.gate.x, p.z - m.sky.gate.z), village: m.sky.villageAt(p.x, p.z), byId: m.sky.find('eagle-rest')?.name, byNumber: m.sky.find('50')?.name }; });
    check('fifty villages: ten prices, five villages at each, the higher the dearer; twenty places to sit in each; the board of one for hire says what it costs', g.n === 50 && g.tiers.join() === '19,49,99,199,499,999,1999,3999,7999,9999' && g.each.every((k) => k === 5) && g.rising && g.seats >= 20 && g.hire === 50 && board.some((b) => b.startsWith(`Buy ${hire.name}`) && b.includes('a month')) && /^For sale · \$[\d,]+ a month$/.test(hire.motto), JSON.stringify({ tiers: g.tiers, each: g.each, rising: g.rising, seats: g.seats, hire, board }));
    check('the Sky Gate offers fifty villages; one is carried to the one chosen, facing the valley', offered.includes('Travel to a sky village') && g.n === 50 && listed.length === 50 && there.village === listed[7] && Math.abs(there.y - there.want) < 0.5 && there.grounded && there.zone === there.village && !there.open && there.facing > 0.5 && there.walkable, JSON.stringify({ offered, there }));
    check('nobody walks off a village; its ring leads back to the valley', back.edge < 12.6 && Math.abs(back.y - back.vy) < 0.6 && ring.includes('Back to the valley') && ring.includes('Another village') && home.d < 4 && !home.village && home.byId === 'Eagle Rest' && home.byNumber === g.names[49], JSON.stringify({ back, ring, home }));
  }

  // --- the island: its wall is not climbed, its walkways hold, and the boulder flattens whoever stays on the path
  {
    const isl = await page.evaluate(async () => {
      const L = await import('/src/world/layout/layout.js');
      const app = window.__mmf, { player, input, world } = app, g = world.games, dt = 1 / 60;
      const out = {};
      const at = (u) => L.islandPath(u);
      const still = (n) => { for (let f = 0; f < n; f++) { input.move.x = 0; input.move.y = 0; input.jump = false; player.update(dt, 0, true); } };
      const go = (dx, dz, n, run = false) => { for (let f = 0; f < n; f++) { input.move.x = dx; input.move.y = -dz; input.run = run; input.jump = false; player.update(dt, 0, true); } input.move.x = 0; input.move.y = 0; input.run = false; };
      // the wall, between two hollows: walking and hopping into it leads nowhere
      const w = at(0.45);
      player.teleport(w.x, w.z, 0); still(5);
      out.pathY = player.pos.y; out.pathWant = w.y;
      for (let k = 0; k < 6; k++) { go(-w.nx, -w.nz, 40, true); input.jump = true; player.update(dt, 0, true); go(-w.nx, -w.nz, 40, true); }
      still(60);
      out.wall = { up: player.pos.y - w.y, inward: (w.x - player.pos.x) * w.nx + (w.z - player.pos.z) * w.nz };
      // out on a walkway (the first station: two walkways joined by a third along the cliff)
      const slabs = world.places.platforms.filter((q) => q.type === 'slab' && q.hw === 0.3);
      const outer = slabs[2]; // the one along the cliff
      const s0 = slabs[0];
      player.teleport(s0.x, s0.z, 0); still(5);
      out.walkway = { y: player.pos.y, want: s0.y, grounded: player.grounded };
      // walk along it to its far end, then onto the outer one
      const yaw = s0.yaw, ox = Math.sin(yaw), oz = Math.cos(yaw);
      const sign = Math.sign((outer.x - s0.x) * ox + (outer.z - s0.z) * oz) || 1;
      go(ox * sign, oz * sign, 70);
      still(10);
      out.outer = { y: player.pos.y, want: outer.y, d: Math.hypot(player.pos.x - outer.x, player.pos.z - outer.z), grounded: player.grounded };
      // the rope on the sea side holds: keep walking out
      go(ox * sign, oz * sign, 90, true);
      still(10);
      out.rope = { y: player.pos.y, grounded: player.grounded };
      // the boulder: frozen where it passes that station (its clock is the time of day)
      const station = at(L.ISLAND.beams[0]);
      const travel = L.ISLAND_LENGTH / L.BOULDER.speed, when = (1 - L.ISLAND.beams[0]) * travel * 1000;
      const left = g.boulderState(when), c = g.boulderAt;
      out.boulder = { left, off: Math.hypot(c.x - station.x, c.z - station.z), y: c.y - station.y };
      const deaths = [];
      const died = (x, y, z) => { player.dead = null; player.pos.set(x, y, z); player.grounded = true; g._tickBoulder(player, when); const d = player.dead ? player.dead.cause : null; if (player.dead) { deaths.push(player.dead.respawn); player.dead = null; document.body.classList.remove('dead'); } return d; };
      out.safeOuter = died(player.pos.x, player.pos.y, player.pos.z);
      // in the hollow nearest to it (inside the rock, off the path)
      const hollow = at(0.1), HW = L.ISLAND.width / 2;
      const whenH = (1 - 0.1) * travel * 1000;
      g.boulderState(whenH);
      const hx = hollow.x - hollow.nx * (HW + 1.6), hz = hollow.z - hollow.nz * (HW + 1.6);
      player.dead = null; player.pos.set(hx, hollow.y, hz); g._tickBoulder(player, whenH);
      out.safeHollow = player.dead ? player.dead.cause : null; player.dead = null;
      // on the path itself
      g.boulderState(when);
      out.onPath = died(station.x, station.y, station.z);
      out.respawn = deaths[0] ? { x: deaths[0][0], z: deaths[0][1], walkable: world.collision.walkable(deaths[0][0], deaths[0][1]), y: world.collision.spawnHeight(deaths[0][0], deaths[0][1]) } : null;
      player.teleport(-100, -40, 0);
      return out;
    });
    check('the island wall is not climbed, by walking or by hopping', Math.abs(isl.pathY - isl.pathWant) < 0.25 && isl.wall.up < 0.9 && isl.wall.inward < 6, `ended ${isl.wall.up.toFixed(2)} m above the path, ${isl.wall.inward.toFixed(2)} m into the rock side`);
    check('walks out on a walkway over the drop; the rope on the sea side holds', Math.abs(isl.walkway.y - isl.walkway.want) < 0.05 && isl.walkway.grounded && Math.abs(isl.outer.y - isl.outer.want) < 0.05 && isl.outer.grounded && isl.rope.grounded && Math.abs(isl.rope.y - isl.outer.want) < 0.05, JSON.stringify({ walkway: isl.walkway, outer: isl.outer, rope: isl.rope }));
    check('the boulder flattens whoever stands on the path, spares the walkway and the hollow', isl.onPath === 'Flattened by the boulder' && isl.safeOuter === null && isl.safeHollow === null && isl.boulder.off < 0.5 && !!isl.respawn && isl.respawn.walkable && isl.respawn.y > 0.3, JSON.stringify({ onPath: isl.onPath, outer: isl.safeOuter, hollow: isl.safeHollow, boulder: isl.boulder, respawn: isl.respawn }));
  }

  // --- sitting down to work on a beanbag, lying in a hammock
  {
    const spot = await page.evaluate(() => { const w = window.__mmf.world, s = w.seats.find((q) => q.work), h = w.seats.find((q) => q.pose === 6); return { s: [s.x, s.z], h: [h.x, h.z] }; });
    await place(spot.s[0] + 0.5, spot.s[1] + 0.9, 0);
    await frames(3);
    const offered = await prompt();
    await page.keyboard.press('KeyE');
    await frames(10);
    const sat = await page.evaluate(() => { const a = window.__mmf; return { anim: a.player.anim, seat: !!a.player.seat, laptop: !!a.me.laptop?.visible }; });
    await page.keyboard.press('KeyL');
    await frames(4);
    const closed = await page.evaluate(() => ({ anim: window.__mmf.player.anim, laptop: !!window.__mmf.me.laptop?.visible }));
    await page.keyboard.press('KeyE');
    await frames(6);
    const up = await page.evaluate(() => !!window.__mmf.player.seat);
    check('sits on a beanbag with a laptop, closes it, gets up', offered.includes('Sit down') && sat.seat && sat.anim === 7 && sat.laptop && closed.anim === 5 && !closed.laptop && !up, `${JSON.stringify(offered)} → ${JSON.stringify(sat)} → ${JSON.stringify(closed)}`);
    await place(spot.h[0] + 1.1, spot.h[1] + 0.3, 0);
    await frames(3);
    const offer2 = await prompt();
    await page.keyboard.press('KeyE');
    await frames(10);
    const lying = await page.evaluate(() => window.__mmf.player.anim);
    await page.keyboard.press('Space');
    await frames(6);
    check('lies down in a hammock, jumps out of it', offer2.includes('Lie down') && lying === 6 && !(await page.evaluate(() => !!window.__mmf.player.seat)), `${JSON.stringify(offer2)}, pose ${lying}`);
  }

  // --- the big wheel: boarded from the platform when a car comes by
  {
    await place(places.wheel[0], places.wheel[1], 270);
    await frames(3);
    // (a car is only at the platform for a moment: it is boarded the very frame it is offered, and followed up)
    const ride = await page.evaluate(() => new Promise((res) => {
      const app = window.__mmf, t0 = performance.now(), out = { offered: false, y0: app.player.pos.y };
      const tick = () => {
        const p = [...document.querySelectorAll('.prompt.on span')].map((e) => e.textContent);
        if (!app.player.seat && p.includes('Board the wheel')) { out.offered = true; out.y0 = app.player.pos.y; app.hud.emit('interact'); }
        const up = !!app.player.seat && app.player.pos.y > out.y0 + 0.35;
        if (up || performance.now() - t0 > 120000) return res({ ...out, seat: !!app.player.seat, y: app.player.pos.y, anim: app.player.anim });
        requestAnimationFrame(tick);
      };
      tick();
    }));
    check('boards a car of the big wheel and goes up with it', ride.offered && ride.seat && ride.anim === 5 && ride.y > ride.y0 + 0.3, `from ${ride.y0.toFixed(2)} to ${ride.y.toFixed(2)} m`);
    await page.evaluate(() => window.__mmf.player.teleport(0, 4.3, 0)); // (down again)
  }

  // --- caves: into one of them from the field, stopped by its wall; through the waterfall into the grotto
  {
    await place(-32, -164, 0);
    await frames(3);
    await walk(46, true);
    const c1 = await page.evaluate(() => { const p = window.__mmf.player; return { x: p.pos.x, y: p.pos.y, z: p.pos.z, cave: p.cave?.name || null, cam: window.__mmf.engine.camera.position.y }; });
    await page.evaluate(() => { window.__mmf.rig.yaw += Math.PI / 2; });
    await walk(34, true);
    const c2 = await state();
    const north = places.caves.find((c) => c.id === 'north').nodes;
    const room = north[3];
    check('walks into a cave; its walls and its roof hold', c1.cave === 'north' && c1.z < -186 && Math.abs(c1.y - room[3]) < 0.4 && c1.cam < room[3] + room[4] + 0.2 && Math.hypot(c2.x - room[0], c2.z - room[1]) < room[2] + 0.6, `at z ${c1.z.toFixed(1)}, floor ${c1.y.toFixed(2)}, camera ${c1.cam.toFixed(1)}; ${Math.hypot(c2.x - room[0], c2.z - room[1]).toFixed(1)} m from the middle of a ${room[2]} m room`);
    await place(-280.5, 122.4, 90);
    await frames(3);
    const pool = await state();
    await walk(70, true);
    const g = await page.evaluate(() => { const p = window.__mmf.player; return { x: p.pos.x, y: p.pos.y, cave: p.cave?.name || null, wading: !!p.wading, swimming: p.swimming }; });
    check('swims across the pool and walks through the waterfall into the grotto', pool.swimming && g.cave === 'grotto' && g.x < -292 && !g.wading && !g.swimming, `x ${g.x.toFixed(1)}, y ${g.y.toFixed(2)}`);
  }

  // --- chat and the animals of light
  {
    await place(0, 4.3, 90);
    await frames(3);
    await page.keyboard.press('Enter');
    await frames(3);
    const typing = await page.evaluate(() => document.activeElement === document.querySelector('.chat input'));
    await page.keyboard.type('Hello valley');
    await page.keyboard.press('Enter');
    await frames(4);
    const said = await page.evaluate(() => ({ log: [...document.querySelectorAll('.chat .log p')].map((e) => e.textContent), bubble: document.querySelector('.tag.self .bubble')?.textContent, focus: document.activeElement === document.querySelector('.chat input') }));
    check('Enter opens the chat, the line shows in the log and over the avatar', typing && said.log.some((l) => l.endsWith('Hello valley')) && said.bubble === 'Hello valley' && !said.focus, JSON.stringify(said));
    // a gesture on a key, an emote by its name; the animals of light are earned by coming back day after day
    await page.keyboard.press('Digit7');
    await frames(3);
    const cheer = await page.evaluate(() => !!window.__mmf.me.move);
    const command = async (text) => { await page.keyboard.press('Enter'); await frames(2); await page.keyboard.type(text); await page.keyboard.press('Enter'); await frames(4); };
    await command('/tiger');
    const locked = await page.evaluate(() => ({ active: window.__mmf.rank.active.length, note: document.querySelector('.hud .note').textContent }));
    await page.evaluate(() => { window.__mmf.who.days = 30; });
    await command('/tiger');
    const emote = await page.evaluate(() => { const r = window.__mmf.rank; return { active: r.active.length, kind: r.active[0]?.kind }; });
    await command('/help');
    const unknown = await page.evaluate(() => [...document.querySelectorAll('.chat .log p')].pop()?.textContent || '');
    check('a key cheers; an animal of light is summoned by name once enough days in a row have earned it', cheer && locked.active === 0 && /day 30 in a row/.test(locked.note) && /29 more days/.test(locked.note) && emote.active === 1 && emote.kind === 'tiger', JSON.stringify({ cheer, locked, emote }));
    check('an unknown command says nothing of the secret ones', /Unknown command\.$/.test(unknown), unknown);
    // stuck somewhere: /kill, then back on one's feet at the mill
    await command('/kill');
    const gone = await page.evaluate(() => ({ dead: window.__mmf.player.dead?.cause, screen: document.body.classList.contains('dead') }));
    await page.evaluate(() => { const p = window.__mmf.player; for (let i = 0; i < 300 && p.dead; i++) p.update(1 / 30, 0, true); });
    await frames(3);
    const back = await page.evaluate(async () => { const L = await import('/src/world/layout/layout.js'), p = window.__mmf.player; return { alive: !p.dead, d: Math.hypot(p.pos.x - L.SPAWN.x, p.pos.z - L.SPAWN.z), screen: document.body.classList.contains('dead') }; });
    check('/kill is the way out when stuck: WASTED, then back at the mill', !!gone.dead && gone.screen && back.alive && back.d < 1 && !back.screen, JSON.stringify({ gone, back }));
  }

  // --- the climb: a bot takes every jump of the course with the real controller; the clock, the board
  {
    const climb = await page.evaluate(() => {
      const app = window.__mmf, { player, input, world } = app, g = world.games, c = g.course, dt = 1 / 60;
      const step = (dx, dz, jump) => { input.move.x = dx; input.move.y = -dz; input.run = true; input.jump = !!jump; player.update(dt, 0, true); g._tickClimb(dt, player); };
      const onStone = (st) => {
        if (!player.grounded || Math.abs(player.pos.y - st.y) > 0.02) return false;
        if (st.beam) { const cs = Math.cos(st.beam.yaw), sn = Math.sin(st.beam.yaw), dx = player.pos.x - st.x, dz = player.pos.z - st.z; return Math.abs(dx * cs - dz * sn) <= st.beam.hw + 1e-3 && Math.abs(dx * sn + dz * cs) <= st.beam.half + 1e-3; }
        return (player.pos.x - st.x) ** 2 + (player.pos.z - st.z) ** 2 <= st.r * st.r + 1e-3;
      };
      const putOn = (st, x, z) => { player.pos.set(x, st.y, z); player.vel.set(0, 0, 0); player.grounded = true; player.swimming = false; player.jet = 0; player.seat = null; };
      // one jump from a to b: `margin` before the edge, using `share` of the room there is to run
      const jump = (a, b, margin, share) => {
        const tx = b.beam ? b.x - Math.sin(b.beam.yaw) * (b.beam.half - 0.5) : b.x, tz = b.beam ? b.z - Math.cos(b.beam.yaw) * (b.beam.half - 0.5) : b.z;
        let sx, sz, ex, ez;
        if (a.beam) {
          const hx = Math.sin(a.beam.yaw), hz = Math.cos(a.beam.yaw);
          sx = a.x - hx * a.beam.half * (2 * share - 1); sz = a.z - hz * a.beam.half * (2 * share - 1);
          ex = a.x + hx * a.beam.half; ez = a.z + hz * a.beam.half;
        } else {
          const dx = tx - a.x, dz = tz - a.z, l = Math.hypot(dx, dz);
          sx = a.x - (dx / l) * a.r * (2 * share - 1) * 0.98; sz = a.z - (dz / l) * a.r * (2 * share - 1) * 0.98;
          ex = a.x + (dx / l) * a.r; ez = a.z + (dz / l) * a.r;
        }
        putOn(a, sx, sz);
        let jumped = false;
        for (let f = 0; f < 900; f++) {
          const p = player.pos, gx = jumped ? tx : ex, gz = jumped ? tz : ez;
          const dx = gx - p.x, dz = gz - p.z, l = Math.hypot(dx, dz) || 1;
          const doJump = !jumped && player.grounded && l <= margin + Math.hypot(player.vel.x, player.vel.z) * dt;
          if (jumped && player.grounded) return onStone(b);
          step(l > 0.05 ? dx / l : 0, l > 0.05 ? dz / l : 0, doJump);
          if (doJump) jumped = true;
          if (p.y < Math.min(a.y, b.y) - 4) return false;
        }
        return false;
      };
      const ways = [];
      for (const m of [0.08, 0.2, 0.35, 0.5, 0.7, 1.0]) for (const s of [1, 0.85, 0.7, 0.5]) ways.push([m, s]);
      const out = { stones: c.length, height: c[c.length - 1].y - g.start.y, stuck: [], firstTry: 0 };
      // the jetpack is refused all around the lawn
      out.noFly = !player.canFly({ x: g.start.x, y: 20, z: g.start.z });
      player.teleport(g.start.x, g.start.z, 0);
      player.pos.y = g.start.y; // (on the lawn: a stone hangs over the plate)
      for (let f = 0; f < 20; f++) step(0, 0, false);
      out.ready = g.run.state;
      out.line0 = document.querySelector('.hud .run').textContent;
      for (let f = 0; f < 600 && !onStone(c[0]); f++) { const dx = c[0].x - player.pos.x, dz = c[0].z - player.pos.z, l = Math.hypot(dx, dz) || 1; step(dx / l, dz / l, false); }
      out.running = g.run.state;
      for (let i = 1; i < c.length; i++) {
        let ok = false, n = 0;
        for (const [m, s] of ways) { n++; if ((ok = jump(c[i - 1], c[i], m, s))) break; }
        if (!ok) { out.stuck.push(i); putOn(c[i], c[i].x, c[i].z); } else if (n === 1) out.firstTry++;
      }
      for (let f = 0; f < 10; f++) step(0, 0, false);
      out.state = g.run.state; out.clock = g.run.t; out.clean = g.run.clean;
      out.line = document.querySelector('.hud .run').textContent;
      out.name = app.presence ? app.presence.name : null;
      return out;
    });
    await frames(6); // the time goes to the board (kept in this browser: the test has no server)
    const board = await page.evaluate(() => { const g = window.__mmf.world.games; return { top: g.scores, note: document.querySelector('.hud .note').textContent }; });
    check('the climb can be done: a bot makes every jump', climb.stuck.length === 0 && climb.stones > 140 && climb.height > 85, `${climb.stones} stones, ${climb.height.toFixed(1)} m, ${climb.firstTry} jumps at the first try, stuck at [${climb.stuck.join(', ')}]`);
    check('the clock starts on leaving the plate and stops at the top; no jetpack there', climb.noFly && climb.ready === 'ready' && /^Ready/.test(climb.line0) && climb.running === 'running' && climb.state === 'done' && climb.clean && /^Top reached in \d+:\d\d\.\d\d!$/.test(climb.line), JSON.stringify({ ready: climb.ready, running: climb.running, state: climb.state, line: climb.line, noFly: climb.noFly }));
    check('the time is written on the board at the gate, in its four lists', ['day', 'week', 'month', 'all'].every((p) => board.top?.[p]?.length === 1 && Math.abs(board.top[p][0].score - climb.clock * 1000) < 2) && /#1 of all time/.test(board.note), JSON.stringify(board));
  }

  // --- what kills: the acid pond, the shark; the end-of-the-road screen
  {
    const acid = await page.evaluate(() => {
      const app = window.__mmf, { player, input, world } = app, g = world.games, dt = 1 / 60;
      const quiet = () => { input.move.x = 0; input.move.y = 0; input.run = false; input.jump = false; };
      player.teleport(g.acid.x + 9, g.acid.z, 0);
      const rim = player.pos.y - g.acid.y;
      player.pos.set(g.acid.x, g.acid.y + 1.5, g.acid.z); player.grounded = false; player.vel.set(0, 0, 0);
      for (let f = 0; f < 120 && !player.dead; f++) { quiet(); player.update(dt, 0, true); g.update(dt, f * dt, null); }
      return { rim, cause: player.dead ? player.dead.cause : null, screen: document.body.classList.contains('dead'), text: document.querySelector('.wasted span').textContent, word: document.querySelector('.wasted b').textContent };
    });
    await frames(3);
    const back = await page.evaluate(() => {
      const app = window.__mmf, { player, input, world } = app, g = world.games, dt = 1 / 60;
      for (let f = 0; f < 260; f++) { input.move.x = 0; input.move.y = 0; input.jump = false; player.update(dt, 0, true); }
      return { alive: !player.dead, screen: document.body.classList.contains('dead'), away: Math.hypot(player.pos.x - g.acid.x, player.pos.z - g.acid.z), walkable: world.collision.walkable(player.pos.x, player.pos.z), anim: player.anim };
    });
    check('falling into the acid pond is the end: WASTED, then back on one\'s feet nearby', acid.cause === 'Dissolved in acid' && acid.screen && acid.word === 'WASTED' && acid.text === 'Dissolved in acid' && back.alive && !back.screen && back.away > 6 && back.away < 20 && back.walkable, JSON.stringify({ acid, back }));
    const shark = await page.evaluate(() => {
      const app = window.__mmf, { player, input, world } = app, g = world.games, dt = 1 / 30;
      const quiet = () => { input.move.x = 0; input.move.y = 0; input.run = false; input.jump = false; };
      // deep water, twelve metres inside the line where the sea ends for swimmers
      const e = g.seaEdges[Math.floor(g.seaEdges.length / 2)], mx = (e[0] + e[2]) / 2, mz = (e[1] + e[3]) / 2;
      let nx = -(e[3] - e[1]), nz = e[2] - e[0];
      const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
      if (!world.collision.walkable(mx + nx * 12, mz + nz * 12)) { nx = -nx; nz = -nz; }
      const x = mx + nx * 12, z = mz + nz * 12;
      player.teleport(x, z, 0);
      for (let f = 0; f < 90; f++) { quiet(); player.update(dt, 0, true); }
      const out = { swimming: player.swimming, depth: world.data.waterAt(x, z) - world.data.heightAt(x, z), far: g.seaEdgeDistance(x, z), t: 0 };
      const notes = [], ev = g.events;
      g.events = { ...ev, note: (t) => notes.push(t) };
      for (let f = 0; f < 30 * 40 && !player.dead; f++) { quiet(); player.update(dt, 0, true); g._tickShark(dt, f * dt, player); out.t += dt; }
      g.events = ev;
      out.cause = player.dead ? player.dead.cause : null; out.warned = notes[0] || null;
      // and the line itself cannot be swum across
      const respawn = player.dead ? player.dead.respawn : null;
      out.respawn = respawn ? { walkable: world.collision.walkable(respawn[0], respawn[1]), y: world.collision.spawnHeight(respawn[0], respawn[1]) } : null;
      for (let f = 0; f < 240; f++) { quiet(); player.update(dt, 0, true); }
      out.alive = !player.dead;
      return out;
    });
    check('swimming out to where the sea ends brings the shark', shark.swimming && shark.far < 30 && /fin/.test(shark.warned || '') && shark.cause === 'Eaten by the shark' && shark.t < 15 && !!shark.respawn && shark.respawn.walkable && shark.respawn.y > 0.2 && shark.alive, JSON.stringify(shark));
  }

  // --- the fair: the four booths of the pier, played by a bot through the pointer; the race, driven by a bot
  {
    await place(98, 0, 0);
    await frames(3);
    const offered = await page.evaluate(() => { const m = window.__mmf, b = m.world.games.booths.list[0]; m.player.teleport(b.stand[0], b.stand[1], b.stand[2]); return b.name; });
    await frames(6);
    const ask = await prompt();
    const fair = await page.evaluate(() => {
      const app = window.__mmf, { input, world, engine } = app, cam = engine.camera, T = app.THREE, g = world.games, out = {};
      const v = new T.Vector3(), m = new T.Matrix4(), dt = 1 / 30;
      const point = (w) => { v.copy(w).project(cam); input.pointer.x = (v.x * 0.5 + 0.5) * window.innerWidth; input.pointer.y = (-v.y * 0.5 + 0.5) * window.innerHeight; };
      for (const booth of g.booths.list) {
        app.playBooth(booth);
        const s = app.fair.session, dyn = booth.dyn;
        let n = 0, sight = false, hidden = false;
        for (; n < 30 * 70 && app.fair.session === s && !s.over; n++) {
          input.pointer.down = false;
          if (s.t >= 0) {
            if (booth.id === 'shoot') {
              const mesh = dyn.children.find((c) => c.isInstancedMesh);
              let best = null, bd = 9; // a target that stands, the nearest to the middle
              for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); const e = m.elements; if (Math.hypot(e[0], e[1], e[2]) < 0.05 || Math.abs(e[9]) > 0.3 * Math.hypot(e[8], e[9], e[10])) continue; if (Math.abs(e[12]) < bd) { bd = Math.abs(e[12]); best = new T.Vector3(e[12], e[13], e[14]); } }
              if (best && n % 12 === 0) { point(best.applyMatrix4(booth.group.matrixWorld)); input._clicks++; }
            } else if (booth.id === 'mole') {
              const t = dyn.children.find((c) => c.name.endsWith(':mole') && c.visible && c.scale.y > 0.99 && c.geometry.attributes.position.count < 150); // (not a rabbit: its ears make it a bigger mesh)
              if (t && n % 8 === 0) { point(new T.Vector3(t.position.x, t.position.y + 0.35, t.position.z).applyMatrix4(booth.group.matrixWorld)); input._clicks++; }
            } else if (booth.id === 'milk') {
              const clown = dyn.children.find((c) => c.name.endsWith(':clown'));
              point(new T.Vector3(clown.position.x, clown.position.y - 0.3, clown.position.z).applyMatrix4(booth.group.matrixWorld));
              input.pointer.down = true;
            } else if (s.gauge !== null && s.gauge > 0.9) input._clicks++;
          }
          app.fairStep(dt);
          if (n === 150) { sight = document.querySelector('.sight').classList.contains('on'); hidden = !app.me.root.visible; }
        }
        const line = s.line, score = s.score, over = s.over;
        for (let k = 0; k < 80 && app.fair.session; k++) app.fairStep(dt);
        out[booth.id] = { score, over, line, sight, hidden, seconds: n * dt, closed: !app.fair.session, shown: app.me.root.visible };
      }
      input.pointer.down = false;
      return out;
    });
    await frames(20);
    const boards = await page.evaluate(() => Object.fromEntries(Object.entries(window.__mmf.fair.boards).map(([k, b]) => [k, b._local().all[0]?.score || 0])));
    check('the four booths of the pier are offered at their counters and played with the pointer: targets, moles, the clown, the bell', ask.includes(`Play ${offered}`) && fair.shoot.score > 300 && fair.mole.score > 100 && fair.milk.score > 150 && fair.bell.score >= 4000 && fair.bell.score <= 9999 && ['shoot', 'mole', 'milk'].every((id) => fair[id].over && fair[id].sight && fair[id].hidden && fair[id].seconds > 47 && fair[id].closed && fair[id].shown) && fair.bell.over && !fair.bell.sight && fair.bell.closed, JSON.stringify(fair));
    check('each score goes on the board of its booth', ['shoot', 'mole', 'milk', 'bell'].every((id) => boards[id] === fair[id].score), JSON.stringify(boards));
    // the race
    const race = await page.evaluate(() => {
      const app = window.__mmf, { input, world, player } = app, r = world.games.race, dt = 1 / 60;
      player.teleport(r.paddock.x, r.paddock.z, 0);
      return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const ask = [...document.querySelectorAll('.prompt.on span')].map((e) => e.textContent);
        app.playRace();
        const s = app.fair.session, S = s.state, laps = [];
        let n = 0, air = 0, boost = 0, top = 0, still = 0;
        for (; n < 60 * 150 && app.fair.session === s && !s.over; n++) {
          const ahead = r.at(S.s + 7 + Math.hypot(S.vx, S.vz) * 0.45), want = Math.atan2(ahead.x - S.x, ahead.z - S.z), err = Math.atan2(Math.sin(want - S.yaw), Math.cos(want - S.yaw));
          input.move.x = Math.max(-1, Math.min(1, -err * 2.4)); input.move.y = Math.abs(err) > 0.9 ? 0.3 : 1; input.run = false; input.jump = false; // (a heading grows turning left)
          app.fairStep(dt);
          if (S.count > 0 && Math.hypot(S.vx, S.vz) < 0.01) still++;
          if (!S.grounded) air++; if (S.boost > 0) boost++; top = Math.max(top, Math.hypot(S.vx, S.vz));
          if (s.laps !== laps.length) laps.push(+S.clock.toFixed(2));
        }
        input.move.x = 0; input.move.y = 0;
        const out = { ask, over: s.over, time: s.time, laps, air, boost, top, still, riding: player.riding, quad: !!player.driver };
        for (let k = 0; k < 60 * 4 && app.fair.session; k++) app.fairStep(dt);
        out.after = { closed: !app.fair.session, riding: player.riding, driver: !!player.driver, d: Math.hypot(player.pos.x - r.start.x, player.pos.z - r.start.z) };
        res(out);
      })));
    });
    await frames(20);
    const best = await page.evaluate(() => window.__mmf.fair.boards.race._local().all[0]?.score || 0);
    check('the quad race: asked for in the paddock, three laps against the clock, the pads and the ramp on the way, the time on the board', race.ask.some((t) => t.startsWith('Race:')) && race.over && race.laps.length === 3 && race.time > 35000 && race.time < 90000 && race.still > 150 && race.air > 30 && race.boost > 100 && race.top > 24 && race.riding && race.quad && race.after.closed && !race.after.riding && !race.after.driver && best === race.time, JSON.stringify(race));
  }

  // --- the big red button at the top of the island: a show far out at sea, then a quarter of an hour of patience
  {
    const red = await page.evaluate(() => new Promise((res) => {
      const app = window.__mmf, { player, hud, blast, world } = app, b = world.places.button, out = {};
      const prompts = () => [...document.querySelectorAll('.prompt.on span')].map((e) => e.textContent);
      localStorage.removeItem('mmf.blast'); app.bomb.readyAt = 0;
      player.teleport(b.x - 1.3, b.z + 0.2, Math.PI / 2);
      app.rig.snap(player.pos, -Math.PI / 2);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        out.ask = prompts();
        out.height = player.pos.y;
        app.input.emit?.('interact');
        if (!app.bomb.fuse) app.pressButton();
        out.fuse = app.bomb.fuse;
        out.said = [...document.querySelectorAll('.chat .log p')].map((p) => p.textContent).slice(-1)[0];
        const t0 = performance.now();
        const wait = () => {
          if (blast.active && blast.t > 0.2) {
            out.active = true; out.t = blast.t; out.visible = blast.group.visible;
            out.flash = Number(document.querySelector('.flash').style.opacity) || 0;
            out.again = prompts();
            // (the rest of the show is not waited for: it is cut short here)
            blast.t = 61.9;
            requestAnimationFrame(() => requestAnimationFrame(() => { out.over = !blast.active && !blast.group.visible; out.exposure = app.blast._exposure; res(out); }));
          } else if (performance.now() - t0 > 20000) res(out);
          else requestAnimationFrame(wait);
        };
        wait();
      }));
    }));
    check('the big red button: asked for at the top of the island, a siren, then the show; no other for a quarter of an hour',
      red.ask?.includes('Press the big red button') && red.height > 30 && red.fuse > 0 && /pressed the big red button/.test(red.said || '') && red.active && red.visible && red.flash > 0.05 && /recharging · 1[45]:\d\d/.test((red.again || []).join()) && red.over,
      JSON.stringify(red));
  }

  // --- quality change: the page reloads and resumes where we were
  await place(-121.8, -40, 184);
  await frames(3);
  const before = await state();
  await page.click('[data-act="settings"]');
  await Promise.all([page.waitForNavigation({ timeout: 240000 }), page.click('.quality [data-q="medium"]')]);
  await page.waitForFunction(() => window.__mmf && window.__mmf.ready && window.__mmf.player, null, { timeout: 240000 });
  await frames(4);
  const after = await state();
  const tier = await page.evaluate(() => window.__mmf.engine.tierId);
  const welcome = await page.evaluate(() => document.querySelector('.splash').classList.contains('done'));
  check('changing the quality resumes at the same spot, without the welcome screen', tier === 'medium' && welcome && Math.hypot(after.x - before.x, after.z - before.z) < 0.5, `tier ${tier}, moved ${Math.hypot(after.x - before.x, after.z - before.z).toFixed(2)} m`);
} catch (err) {
  check('scenario ran to the end', false, err.message.split('\n')[0]);
  await page.screenshot({ path: path.join(OUT, 'error.png') }).catch(() => {});
}
if (errors.length) console.log([...new Set(errors)].slice(0, 12).join('\n'));
await browser.close();
await server.close();
const ok = !results.includes(false) && !errors.length;
console.log(ok ? `walk test passed (${results.length} checks)` : 'walk test FAILED');
process.exit(ok ? 0 : 1);
