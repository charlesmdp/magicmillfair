// Checks of the extra `dive` (src/extras/dive.js): diving under the water, and the Diver's Rest — the secret cave
// under the sea (src/world/zones/places/deep/). First its rock alone, without a browser: the only way in is under
// the water, a diver's body goes through, there is air in the chamber and none in the passage, the game's own
// walker is shut out of it — and kept in it. Then in the running game (a headless browser): with its switch off
// nothing of it is asked for, loaded or in the world; switched on, a bot swims out, is offered to dive, goes under
// — the camera with it —, finds the arch, swims the passage, comes up in the chamber, is told so, walks the strand,
// looks at the helmet; then swims back out and up: the ordinary swimming and camera are as before, and nothing is
// left behind. The shark keeps its water.
// usage: node tools/dive-test.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stubOutside } from './lib/outside.mjs';
import { ground } from './lib/check.mjs';
import { DEEP, WAY, WALL, CELL, solid, hull, hollow, grid, mesh, walls, top, strand, inChamber, airOver, toWorld, toLocal } from '../src/world/zones/places/deep/plan.js';
import { BOUNDS, SEA_REACH, SHARK } from '../src/world/layout/layout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const r1 = (v) => +v.toFixed(1), r2 = (v) => +v.toFixed(2);

// ---------------------------------------------------------------------------------------------- the rock alone
{
  const bed = await ground(), [cx, cz] = [DEEP.at.x, DEEP.at.z];
  let lo = Infinity, hi = -Infinity;
  for (let a = 0; a < 6.28; a += 0.3) for (const r of [0, 6, 12, 16]) { const h = bed(cx + Math.cos(a) * r, cz + Math.sin(a) * r); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  check('it stands in deep water: the bed of the bay is nearly seven metres down, or more, all round it', hi < -6.7 && lo > -8.5, `${r1(lo)} … ${r1(hi)} m`);
  // (the open sea is the shark's: the rock and the water before its arch are out of its reach)
  const within = (bd, x, z) => { let inside = false; for (let i = 0, j = bd.length - 1; i < bd.length; j = i++) if ((bd[j][1] > z) !== (bd[i][1] > z) && x < ((bd[i][0] - bd[j][0]) * (z - bd[j][1])) / (bd[i][1] - bd[j][1]) + bd[j][0]) inside = !inside; return inside; };
  const edges = [];
  for (const bd of [BOUNDS, ...SEA_REACH]) {
    let area = 0;
    for (let i = 0; i < bd.length; i++) { const a = bd[i], c = bd[(i + 1) % bd.length]; area += a[0] * c[1] - c[0] * a[1]; }
    for (let i = 0; i < bd.length; i++) {
      const a = bd[i], c = bd[(i + 1) % bd.length], mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2, l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1, t = area > 0 ? 1 : -1, nx = ((c[1] - a[1]) / l) * t, nz = (-(c[0] - a[0]) / l) * t;
      if ([BOUNDS, ...SEA_REACH].some((o) => o !== bd && within(o, mx + nx * 2, mz + nz * 2))) continue;
      if (bed(mx, mz) < -2 && bed(mx + nx * 20, mz + nz * 20) < -3 && bed(mx + nx * 42, mz + nz * 42) < -3) edges.push([a[0], a[1], c[0], c[1]]);
    }
  }
  const toEdge = (x, z) => { let best = Infinity; for (const [ax, az, bx, bz] of edges) { const dx = bx - ax, dz = bz - az; let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1); t = t < 0 ? 0 : t > 1 ? 1 : t; best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return best; };
  const before = toWorld(DEEP.mouth.u + 8, DEEP.mouth.w);
  check('the rock, and the water eight metres before its arch, are out of the shark\'s reach — and inside the sea one may swim', toEdge(cx, cz) > SHARK.far + DEEP.r && toEdge(...before) > SHARK.far + 3 && within(BOUNDS, ...before), `the middle ${r1(toEdge(cx, cz))} m from the open sea, before the arch ${r1(toEdge(...before))} (the shark: ${SHARK.far})`);

  // the hollow, flooded from the air of the chamber on a grid of half a metre: where does it lead?
  const S = 0.5, R = DEEP.r, n = Math.round((2 * R) / S) + 1, ny = Math.round((DEEP.high - DEEP.low) / S) + 1;
  const flood = (seed, pass, lid) => {
    const seen = new Uint8Array(n * ny * n), at = (i, j, k) => (k * ny + j) * n + i, start = [Math.round((seed[0] + R) / S), Math.round((seed[1] - DEEP.low) / S), Math.round((seed[2] + R) / S)], stack = [start];
    let out = false, count = 0;
    seen[at(...start)] = 1;
    while (stack.length) {
      const [i, j, k] = stack.pop(), u = -R + i * S, y = DEEP.low + j * S, w = -R + k * S;
      count++;
      if (hull(u, y, w) > 1.5) { out = true; continue; } // (clear of the stack: the open sea, the sky)
      for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const p = i + a, q = j + b, r = k + c;
        if (p < 0 || q < 0 || r < 0 || p >= n || q >= ny || r >= n || seen[at(p, q, r)]) continue;
        const yy = DEEP.low + q * S;
        if (yy > lid.hi || yy < (lid.lo ?? -Infinity)) continue;
        seen[at(p, q, r)] = 1;
        if (pass(-R + p * S, yy, -R + r * S)) stack.push([p, q, r]);
      }
    }
    return { out, count };
  };
  const air = [DEEP.pool.u, 1.5, DEEP.pool.w], open = (u, y, w) => solid(u, y, w) > 0;
  check('from the air of the chamber one gets out to the sea …', flood(air, open, { hi: Infinity }).out);
  const dry = flood(air, open, { hi: Infinity, lo: -4 });
  check('… but not without going more than four metres under the water: nothing of the cave opens at the surface, or above it', !dry.out, `${dry.count} cells of air and water reached over -4 m, all of them inside`);
  check('a diver\'s body goes all the way through: the passage is wide enough everywhere', flood([DEEP.pool.u, -1.4, DEEP.pool.w], (u, y, w) => solid(u, y, w) >= 0.75 && y < -0.2, { hi: Infinity }).out);
  // (the arch: where the hollow comes out through the face of the stack)
  let crown = -Infinity;
  for (let u = DEEP.mouth.u - 4; u <= DEEP.mouth.u + 3; u += 0.25) for (let w = -4; w <= 4; w += 0.25) for (let y = -8; y <= -1; y += 0.1) if (hollow(u, y, w) < 0 && Math.abs(hull(u, y, w)) < 0.3) crown = Math.max(crown, y);
  const sill = bed(...toWorld(DEEP.mouth.u, DEEP.mouth.w));
  check('its arch is at the foot of the rock: it stands on the bed, and its crown is some four metres under the waterline', crown < -3.6 && crown - sill > 2.6 && sill < -6.7, `from the bed (${r1(sill)} m) to ${r1(crown)} m`);
  const airs = { pool: airOver(DEEP.pool.u, -1.2, DEEP.pool.w), passage: WAY.slice(1, 3).map(([u, y, w]) => airOver(u, y, w)), chimney: airOver(WAY[3][0], WAY[3][1], WAY[3][2]), sea: airOver(20, -3, 0), head: solid(DEEP.rest.u, strand(DEEP.rest.u, DEEP.rest.w) + 1.8, DEEP.rest.w) };
  check('air over the pool — and over the chimney that comes up into it —, none over the passage, the open sea beyond; and room to stand on the strand', airs.pool && airs.chimney && airs.passage.every((v) => !v) && airs.sea && airs.head > 0.6, { ...airs, head: r2(airs.head) });
  check('the strand is dry sand at its middle, the pool is deep where the chimney comes up', strand(DEEP.rest.u, DEEP.rest.w) > 0.3 && strand(DEEP.pool.u, DEEP.pool.w) < -2 && inChamber(DEEP.rest.u, DEEP.rest.w) && inChamber(DEEP.pool.u, DEEP.pool.w), `strand ${r2(strand(DEEP.rest.u, DEEP.rest.w))} m, pool ${r2(strand(DEEP.pool.u, DEEP.pool.w))} m`);

  // the game's own walker and swimmer: a ring of obstacles shuts the chamber, from both sides
  const ring = walls(), free = (u, w) => { for (const [a, b] of ring) if ((u - a) ** 2 + (w - b) ** 2 < (WALL + 0.38) ** 2) return false; return true; };
  const walk = (seed) => { const g = 0.25, m = Math.round((2 * R + 6) / g) + 1, seen = new Uint8Array(m * m), stack = [[Math.round((seed[0] + R + 3) / g), Math.round((seed[1] + R + 3) / g)]]; let out = false, cells = 0; seen[stack[0][1] * m + stack[0][0]] = 1; while (stack.length) { const [i, k] = stack.pop(), u = -R - 3 + i * g, w = -R - 3 + k * g; cells++; if (u * u + w * w > (R + 1) ** 2) { out = true; continue; } for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const p = i + a, q = k + b; if (p < 0 || q < 0 || p >= m || q >= m || seen[q * m + p]) continue; seen[q * m + p] = 1; if (free(-R - 3 + p * g, -R - 3 + q * g)) stack.push([p, q]); } } return { out, area: cells * g * g }; };
  const inside = walk([DEEP.rest.u, DEEP.rest.w]);
  check('a walker on the strand cannot walk out through the rock, a swimmer outside cannot swim in', !inside.out && inside.area > 45, `${ring.length} obstacles; ${r1(inside.area)} m² of pool and strand to be in`);
  check('who drops onto the rock stands on it: it has a top over its hollow, and none out at sea', top(0, 0) > 5 && top(DEEP.rest.u, DEEP.rest.w) > 3.5 && top(DEEP.r - 0.6, 0) === null, `${r1(top(0, 0))} m over the middle`);
  const m = mesh(), g = grid();
  check('what is drawn of it: one mesh outside, one inside, 24,000 triangles at the most together', m.rock.length / 3 > 6000 && (m.rock.length + m.cave.length) / 3 <= 24000 && m.cave.length / 3 > 2500, `${m.rock.length / 3} outside, ${m.cave.length / 3} inside, on a grid of ${g.nx} × ${g.ny} × ${g.nz} (${CELL} m)`);
}

// ---------------------------------------------------------------------------------------------- the running game
const { chromium } = createRequire(import.meta.url)('playwright');
const { createServer } = await import('vite');
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5247, strictPort: false, host: '127.0.0.1', hmr: false, watch: null } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
await stubOutside(context);
const page = await context.newPage(), errors = [], asked = [];
page.on('console', (m) => { if (m.type() === 'error' && !/api\/|404|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => asked.push(r.url()));
const OURS = /extras\/dive|places\/deep\//;
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?q=low`);
  await page.waitForSelector('.card.ready', { timeout: 240000 });
  await page.mouse.click(5, 5);
  await page.fill('#mmf-name', 'Player', { timeout: 180000 });
  await page.click('.go', { timeout: 180000 });
  await page.waitForFunction(() => window.__mmf && window.__mmf.input.enabled, null, { timeout: 60000 });
  const frames = (n) => page.evaluate((n) => new Promise((res) => { const app = window.__mmf, t = app.frames + n; const tick = () => (app.frames >= t ? res() : requestAnimationFrame(tick)); tick(); }), n);
  await frames(4);
  const off = await page.evaluate(() => { const a = window.__mmf, u = a.world.water.materials.sea.uniforms; return { group: !!a.world.scene.getObjectByName('dive'), app: !!a.dive, wrapped: Object.hasOwn(a.interact, 'update') || Object.hasOwn(a.rig, 'update') || Object.hasOwn(a.world.ripples, 'trail'), zones: a.world.zones.length, circles: a.world.collision.circles.length, platforms: a.world.collision.platforms.length, seats: a.world.seats.length, noFly: a.world.noFly.length, fog: [u.uFogParams.value.x, u.uFogParams.value.y, u.uFogColor.value.r, u.uFogColor.value.g, u.uFogColor.value.b] }; });
  check('with its switch off — as the game is delivered — nothing of it is in the world, and nothing of the game is wrapped', !off.group && !off.app && !off.wrapped);
  check('… and nothing of it was asked for: not a byte of it is loaded', !asked.some((u) => OURS.test(u)), `${asked.length} requests, none for it`);
  // (a swimmer in deep water is not offered anything, as ever)
  const plain = await page.evaluate(() => { const a = window.__mmf, { player, input } = a; player.teleport(170, 40, 0); for (let f = 0; f < 240; f++) player.update(1 / 60, 0, true); a.interact.update(true); return { swimming: player.swimming, y: player.pos.y, actions: a.interact.actions.length, prompt: a.hud.prompts[0]._text || null }; });
  check('off: a swimmer in deep water is offered nothing', plain.swimming && plain.actions === 0 && !plain.prompt, plain);

  await page.evaluate(() => import('/src/extras/index.js').then(({ loadExtras }) => loadExtras(window.__mmf, { dive: true })).then(() => window.__mmf.extrasBuilt()));
  await frames(6);
  const on = await page.evaluate(() => {
    const a = window.__mmf, g = a.world.scene.getObjectByName('dive'), d = a.dive, c = a.world.collision;
    let meshes = 0; g?.traverse((o) => { if (o.isMesh || o.isPoints) meshes++; });
    return { group: !!g, meshes, triangles: d?.place.triangles, zones: a.world.zones.length, circles: c.circles.length, platforms: c.platforms.length, seats: a.world.seats.length, noFly: a.world.noFly.length, rock: d?.place.rock.visible, cave: d?.place.cave.visible, sea: d?.place.sea.visible, under: d?.place.under, found: d?.found() };
  });
  check('switched on, it is in the scene: one group, a dozen meshes at the most, the rock in view, its cave and the sea from under not drawn', on.group && on.meshes <= 12 && on.rock && !on.cave && !on.sea && !on.under, { meshes: on.meshes, triangles: on.triangles });
  check('the game knows its rock: the obstacles of its walls, two floors (its top, its strand), a seat, no jetpack over it', on.circles - off.circles === walls().length && on.platforms - off.platforms === 2 && on.seats - off.seats === 1 && on.noFly - off.noFly === 1 && on.zones - off.zones === 1, { obstacles: on.circles - off.circles });
  check('nothing was found yet', on.found === false);

  // ---- the bots. Both go by the game's own controller; what they meet on the way is measured at every step.
  await page.evaluate(async () => {
    const a = window.__mmf, plan = await import('/src/world/zones/places/deep/plan.js'), { player, input, rig } = a, dt = 1 / 60;
    const log = () => ({ steps: 0, body: 9, room: 9, eyeOver: 0, deep: 0, notSwim: 0 });
    const note = (m) => {
      const p = player.pos, c = rig.camera.position, [u, w] = plan.toLocal(p.x, p.z), [cu, cw] = plan.toLocal(c.x, c.z), near = Math.hypot(p.x - plan.DEEP.at.x, p.z - plan.DEEP.at.z) < plan.DEEP.r + 4;
      m.steps++;
      if (near) { m.body = Math.min(m.body, plan.solid(u, p.y + 0.9, w)); m.room = Math.min(m.room, plan.solid(cu, c.y, cw)); }
      if (a.dive.diving()) { m.deep = Math.max(m.deep, -p.y); if (p.y < -2.6 && c.y > -0.02 && a.dive.view.mix >= 1 && rig.pitch > -0.5) m.eyeOver++; /* (unless one looks down at oneself from high up) */ if (player.anim !== 4) m.notSwim++; }
    };
    const state = (m) => { const p = player.pos, c = rig.camera.position; return { at: [p.x, p.y, p.z], eye: [c.x, c.y, c.z], swimming: player.swimming, grounded: player.grounded, diving: !!a.dive.diving(), driver: !!player.driver, pitch: player.pitch, ...m }; };
    const still = () => { input.move.x = 0; input.move.y = 0; input.rise = 0; input.run = false; input.jump = false; };
    window.bot = {
      /** At the surface, or on foot: the stick held towards each point in turn. */
      walk(points, { run = true, reach = 0.6, steps = 2400 } = {}) {
        const m = log();
        for (const [tx, tz] of points) for (let f = 0; f < steps; f++) { const dx = tx - player.pos.x, dz = tz - player.pos.z, d = Math.hypot(dx, dz); if (d < reach) break; input.move.x = dx / d; input.move.y = -dz / d; input.run = run; input.jump = false; rig.yaw = 0; player.update(dt, 0, true); rig.update(dt, player.pos, player); note(m); }
        still();
        return state(m);
      },
      /** Under the water: the look turned to each point in turn, the stick forward — and Space or C when it is straight up or down. */
      swim(points, { reach = 0.8, steps = 1500 } = {}) {
        const m = log();
        for (const [tx, ty, tz] of points) for (let f = 0; f < steps && a.dive.diving() && !a.dive.diving().done; f++) {
          const p = player.pos, dx = tx - p.x, dy = ty - p.y, dz = tz - p.z, h = Math.hypot(dx, dz);
          if (Math.hypot(dx, dy, dz) < reach) break;
          rig.yaw = Math.atan2(-dx, -dz); rig.pitch = Math.max(-1.2, Math.min(0.45, Math.atan2(dy, h)));
          input.move.x = 0; input.move.y = h > 0.4 ? 1 : 0; input.rise = Math.abs(dy) > h ? Math.sign(dy) : 0; input.run = false; input.jump = false;
          player.update(dt, rig.yaw, true); rig.update(dt, player.pos, player); note(m);
        }
        still();
        return state(m);
      },
      /** Straight up (Space held) until the dive is over, or so many steps. */
      up(steps = 900) { const m = log(); for (let f = 0; f < steps && a.dive.diving() && !a.dive.diving().done; f++) { input.rise = 1; player.update(dt, rig.yaw, true); rig.update(dt, player.pos, player); note(m); } still(); return state(m); },
      /** What the E key — or a tap — would do now. */
      offered() { a.interact.update(true); return { label: a.interact.actions[0]?.label || null, prompt: a.hud.prompts[0]._text || null }; },
      press() { a.interact.update(true); a.interact.press(0); return state({}); },
      state: () => state({}),
    };
  });
  const B = (fn, ...args) => page.evaluate(([fn, args]) => window.bot[fn](...args), [fn, args]);
  const way = await page.evaluate(() => window.__mmf.dive.way), [ax, , az] = way[0];
  // 1. out to sea, at the surface
  await page.evaluate(() => window.__mmf.player.teleport(150, 46, 0));
  let s = await B('walk', [[ax + 6, az + 2]]);
  check('a bot swims out from the bay to the rock, at the surface: the ordinary swimming', s.swimming && !s.diving && Math.abs(s.at[1] + 1.05) < 0.08 && Math.hypot(s.at[0] - ax - 6, s.at[2] - az - 2) < 1 && s.eye[1] > 0.2, { at: s.at.map(r1), eye: r1(s.eye[1]) });
  let o = await B('offered');
  check('there the prompt says "Dive" (the E key, or a tap)', o.label === 'Dive' && o.prompt === 'Dive', o);
  // 2. under
  s = await B('press');
  check('pressed: the bot is a diver — driven, as in the games — and the keys are said', s.diving && s.driver && await page.evaluate(() => { const b = document.querySelector('button[title="Show the keys of this game again"]'); return !!b && b.style.display !== 'none'; }));
  s = await B('swim', [way[0]]);
  check('it goes down to the foot of the rock, before the arch — six metres under — and the camera goes under with it', s.diving && Math.hypot(s.at[0] - way[0][0], s.at[1] - way[0][1], s.at[2] - way[0][2]) < 1 && s.deep > 6 && s.eyeOver === 0 && s.eye[1] < -1, { at: s.at.map(r1), eye: s.eye.map(r1), framesWithTheEyeOverTheWater: s.eyeOver });
  await frames(5);
  const look = await page.evaluate(() => { const a = window.__mmf, d = a.dive.place, u = a.world.water.materials.sea.uniforms; return { under: d.under, sea: d.sea.visible, cave: d.cave.visible, weed: d.weed.geometry.instanceCount, shoal: d.shoal.geometry.instanceCount, density: u.uFogParams.value.x, fall: u.uFogParams.value.y, blue: u.uFogColor.value.b > u.uFogColor.value.r * 3, bubbles: d.bub.live, calls: a.engine.perf.calls }; });
  check('under the water it looks like under the water: the veil has the colour of the sea, the surface from below, weed, a shoal and bubbles are drawn — and the cave', look.under && look.sea && look.cave && look.density > off.fog[0] * 20 && look.fall === 0 && look.blue && look.weed > 200 && look.shoal > 40 && look.bubbles > 0, { haze: r2(look.density), weed: look.weed, fish: look.shoal, bubbles: look.bubbles, drawCalls: look.calls });
  // 3. through the arch, the passage, up the chimney, into the pool
  s = await B('swim', way.slice(1));
  check('it swims in through the arch, along the passage and up the chimney, into the pool — never in the rock, the camera neither', s.diving && s.body > 0.35 && s.room > 0.2 && s.notSwim === 0 && Math.hypot(s.at[0] - way[way.length - 1][0], s.at[2] - way[way.length - 1][2]) < 1.2 && s.at[1] > -3.2 && s.at[1] < -1.2, { at: s.at.map(r1), nearestTheRock: { body: r2(s.body), eye: r2(s.room) }, steps: s.steps });
  o = await B('offered');
  check('there is air over it there: the prompt says so', o.label === 'Back up to the surface', o);
  s = await B('up');
  await frames(4);
  s = await B('state');
  check('it comes up in the chamber: a swimmer again, in the pool, in the pocket of air', !s.diving && !s.driver && s.swimming && Math.abs(s.at[1] + 1.05) < 0.1 && s.pitch === 0 && inChamber(...toLocal(s.at[0], s.at[2])), { at: s.at.map(r1) });
  const told = await page.evaluate(() => ({ note: window.__mmf.hud.noteEl.textContent, shown: window.__mmf.hud.noteEl.classList.contains('show'), found: window.__mmf.dive.found(), kept: localStorage.getItem('mmf.dive.found') }));
  check('the line shows: the Diver\'s Rest is found — kept in this browser', /You have found The Diver's Rest/.test(told.note) && told.shown && told.found && told.kept === '1', told.note);
  // 4. on the strand
  const rest = toWorld(DEEP.rest.u, DEEP.rest.w);
  s = await B('walk', [rest], { run: false, reach: 0.4 });
  check('it swims to the strand and walks out onto the sand, on its feet', s.grounded && !s.swimming && Math.abs(s.at[1] - strand(DEEP.rest.u, DEEP.rest.w)) < 0.12 && Math.hypot(s.at[0] - rest[0], s.at[2] - rest[1]) < 0.6 && s.room > 0.2, { at: s.at.map(r1), eyeFromTheRock: r2(s.room) });
  await frames(4);
  const inside = await page.evaluate(() => { const a = window.__mmf, d = a.dive.place; return { cave: d.cave.visible, things: d.things.visible, sea: d.sea.visible, under: d.under, veil: d.veil.visible }; });
  check('in the chamber the cave and what is in it are drawn, the sea from under is not', inside.cave && inside.things && !inside.sea && !inside.under && !inside.veil, inside);
  const helmet = await page.evaluate(() => { const a = window.__mmf, h = a.dive.place.helmet; return h; });
  s = await B('walk', [toWorld(helmet.u + 0.9, helmet.w - 0.9)], { run: false, reach: 0.5 });
  o = await B('offered');
  await B('press');
  const said = await page.evaluate(() => window.__mmf.hud.noteEl.textContent);
  check('by the helmet the prompt says "Look at the diving helmet", and it has its word to say', o.label === 'Look at the diving helmet' && /A diving helmet, from before/.test(said), said.slice(0, 60) + '…');
  // (the log: a seat of the game)
  const log = await page.evaluate(() => { const a = window.__mmf, s = a.world.seats[a.world.seats.length - 1]; return [s.x, s.z]; });
  s = await B('walk', [log], { run: false, reach: 0.9 });
  const sat = await page.evaluate(() => { const a = window.__mmf; a.interact.update(true); const label = a.interact.target?.label || null; a.interact.press(0); const seated = !!a.player.seat; for (let f = 0; f < 40; f++) a.player.update(1 / 60, 0, false); const y = a.player.pos.y; a.player.stand(); return { label, seated, y }; });
  check('by the log the prompt says "Sit on the log", and one sits', sat.label === 'Sit on the log' && sat.seated, sat);
  s = await B('walk', [toWorld(DEEP.rest.u - 1, DEEP.rest.w + 9)], { run: false, steps: 500 });
  check('the wall behind the strand stops it: it stays in the chamber', inChamber(...toLocal(s.at[0], s.at[2])) && s.grounded && s.room > 0.2, { at: s.at.map(r1), eyeFromTheRock: r2(s.room) });
  // 5. back out, and up
  const pool = toWorld(DEEP.pool.u, DEEP.pool.w);
  s = await B('walk', [pool], { run: false, reach: 0.7 });
  o = await B('offered');
  check('back in the pool it swims, and is offered to dive again', s.swimming && o.label === 'Dive', { at: s.at.map(r1) });
  await B('press');
  s = await B('swim', [...way].reverse());
  check('it dives, and swims back down the chimney, along the passage and out through the arch', s.diving && s.body > 0.35 && s.room > 0.2 && Math.hypot(s.at[0] - way[0][0], s.at[1] - way[0][1], s.at[2] - way[0][2]) < 1.2, { at: s.at.map(r1), nearestTheRock: { body: r2(s.body), eye: r2(s.room) } });
  s = await B('up');
  await frames(6);
  s = await B('walk', [[s.at[0] + 6, s.at[2] + 3]]);
  await frames(4);
  const after = await page.evaluate(() => {
    const a = window.__mmf, d = a.dive.place, u = a.world.water.materials.sea.uniforms, b = document.querySelector('button[title="Show the keys of this game again"]');
    return { diving: !!a.dive.diving(), driver: !!a.player.driver, swimming: a.player.swimming, y: a.player.pos.y, pitch: a.player.pitch, eye: a.rig.camera.position.y, under: d.under, sea: d.sea.visible, cave: d.cave.visible, fog: [u.uFogParams.value.x, u.uFogParams.value.y, u.uFogColor.value.r, u.uFogColor.value.g, u.uFogColor.value.b], keys: b ? b.style.display : 'none', mix: a.dive.view.mix, trail: a.kit ? a.kit.trail : null };
  });
  check('up at the surface the ordinary swimming and the ordinary camera are as before', !after.diving && !after.driver && after.swimming && Math.abs(after.y + 1.05) < 0.08 && after.pitch === 0 && after.eye > 0.25 && after.mix === 0, { y: r2(after.y), eye: r2(after.eye) });
  check('nothing is left behind: the haze of the world is given back as it was, the sea from under and the cave are not drawn, the keys are put away', !after.under && !after.sea && !after.cave && after.fog.every((v, i) => Math.abs(v - off.fog[i]) < 1e-6) && after.keys === 'none', { haze: after.fog.map((v) => +v.toFixed(4)) });
  o = await B('offered');
  check('and the prompt says "Dive" again', o.label === 'Dive');
  // 6. the shark keeps its water
  const shark = await page.evaluate(() => {
    const a = window.__mmf, { player, input, rig } = a, g = a.world.games, dt = 1 / 60;
    player.teleport(236, 0, 0); for (let f = 0; f < 200; f++) player.update(dt, 0, true);
    const near = { edge: g.seaEdgeDistance(player.pos.x, player.pos.z), swimming: player.swimming, can: a.dive.canDive() };
    a.dive.put(196, -4, -30, -Math.PI / 2, 0);
    for (let f = 0; f < 1200; f++) { rig.yaw = -Math.PI / 2; rig.pitch = 0; input.move.y = 1; player.update(dt, rig.yaw, true); }
    input.move.y = 0;
    const held = { edge: g.seaEdgeDistance(player.pos.x, player.pos.z), x: player.pos.x, note: a.hud.noteEl.textContent };
    a.dive.rise();
    return { near, held };
  });
  check('within the shark\'s reach one is not offered to dive; a diver who swims at the open sea is held at its edge, and told why', shark.near.swimming && shark.near.edge < SHARK.far && !shark.near.can && shark.held.edge > SHARK.far - 0.2 && shark.held.edge < SHARK.far + 1.5 && /shark/.test(shark.held.note), { offTheEdge: r1(shark.near.edge), heldAt: r1(shark.held.edge), note: shark.held.note });
  await frames(4);
  check('nothing complained', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  await server.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
