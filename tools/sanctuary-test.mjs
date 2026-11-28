// Checks of the Sanctuary (src/extras/sanctuary.js), in the running game (a headless browser): with its switch off
// nothing of it is in the world and the cliff is whole; switched on, the hall is in the scene, under the rock of
// the cliff but for its court, and the ground is cut there alone; the player, walked by the game's own
// controller from the meadow, goes through the court and up the stair to the doors, reaches the middle under the
// dome — on its floor, not on the slope above — and each of the three chapels, and is stopped by a wall and by
// the rock of the court; `inside()` is 0 far outside, about 0.1 at the doors and 1 under the dome.
// usage: node tools/sanctuary-test.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stubOutside } from './lib/outside.mjs';
import { PLAN, CHAPELS, DOOR, toWorld, armPoint, inside, floorAt, FACE, STAIR_END } from '../src/world/zones/places/sanctuary/plan.js';
import { height } from '../lab/tools/heights.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const arm = (a, u, v) => toWorld(...armPoint(a, u, v));

// ---- the plan alone (no browser)
check('inside() is 0 far outside, about 0.1 at the doors, 1 under the dome', inside(DOOR.x + 60, PLAN.floor, DOOR.z + 60) === 0 && inside(PLAN.at.x, PLAN.floor, PLAN.at.z) === 1 && Math.abs(inside(DOOR.x, DOOR.y, DOOR.z) - 0.1) < 0.05, { far: inside(DOOR.x + 60, PLAN.floor, DOOR.z + 60), door: +inside(DOOR.x, DOOR.y, DOOR.z).toFixed(3), dome: inside(PLAN.at.x, PLAN.floor, PLAN.at.z) });
check('in each chapel one is well inside (the music does not leave): 0.5 or more', CHAPELS.every(({ angle }) => { const [x, z] = arm(angle, 0, PLAN.chord + 1); return inside(x, PLAN.floor, z) >= 0.5; }), CHAPELS.map(({ id, angle }) => { const [x, z] = arm(angle, 0, PLAN.chord + 1); return `${id} ${inside(x, PLAN.floor, z).toFixed(2)}`; }).join(', '));
check('the floor carries under the dome, in the doorway and on the stair, and nowhere outside', floorAt(PLAN.at.x, PLAN.at.z) === PLAN.floor && floorAt(DOOR.x, DOOR.z) === PLAN.floor && floorAt(DOOR.x + 60, DOOR.z + 60) === null);
{
  // (the rock over it, read from the map of the ground: over the crown of every vault and over the dome, but in
  // the court, where it is cut away)
  const over = [], crown = PLAN.spring + PLAN.W;
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (let v = 4; v <= (a === 0 ? FACE - 0.5 : PLAN.chord + PLAN.W); v += 1.5) for (const u of [-PLAN.W, 0, PLAN.W]) { const [x, z] = arm(a, u, v), top = Math.hypot(...armPoint(a, u, v)) < PLAN.R ? PLAN.cornice + PLAN.drum + Math.sqrt(Math.max(0, PLAN.R ** 2 - Math.hypot(...armPoint(a, u, v)) ** 2)) : crown; over.push(height(x, z) - PLAN.floor - top); }
  check('it is dug into the cliff: two metres of rock and more over every vault and over the dome, all of it under the ground but its court', Math.min(...over) >= 2, { leastRock: +Math.min(...over).toFixed(1), points: over.length });
  const [mx, mz] = toWorld(0, PLAN.court.mouth + 2);
  check('its court opens on the meadow at the foot of the cliff: the ground there is no higher than the floor of the court', height(mx, mz) <= PLAN.floor - PLAN.steps.n * 0.2 + 0.5, { ground: +height(mx, mz).toFixed(1), court: +(PLAN.floor - PLAN.steps.n * 0.2).toFixed(1) });
}

const { chromium } = createRequire(import.meta.url)('playwright');
const { createServer } = await import('vite');
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5246, strictPort: false, host: '127.0.0.1', hmr: false, watch: null } });
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

  check('with its switch off — as the game is delivered — nothing of it is in the world', await page.evaluate(() => !window.__mmf.world.scene.getObjectByName('sanctuary') && !window.__mmf.sanctuary));
  const ground = () => page.evaluate(() => { const w = window.__mmf.world, T = w.terrain; return { holes: T.material.defines.HOLES || 0, caves: w.places.holes.length, depth: T.mesh.userData.depthMaterial === T.depthMaterial, areas: w.collision.areas.length }; });
  const whole = await ground();
  check('…and the cliff is whole: the ground has the holes of the caves alone, and its shadow none', whole.holes === whole.caves && whole.depth, whole);
  const before = await page.evaluate(() => ({ zones: window.__mmf.world.zones.length, boxes: window.__mmf.world.collision.boxes.length }));
  await page.evaluate(() => import('/src/extras/index.js').then(({ loadExtras }) => loadExtras(window.__mmf, { sanctuary: true })).then(() => window.__mmf.extrasBuilt()));
  await frames(6);
  const built = await page.evaluate(() => { const a = window.__mmf, g = a.world.scene.getObjectByName('sanctuary'); let tris = 0, meshes = 0; g?.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } }); return { group: !!g, tris, meshes, zones: a.world.zones.length, boxes: a.world.collision.boxes.length, door: a.sanctuary?.door, name: a.sanctuary?.name }; });
  check('switched on, the hall is in the scene: one group, few meshes, 60,000 triangles at the most', built.group && built.meshes <= 8 && built.tris > 5000 && built.tris <= 60000, { meshes: built.meshes, triangles: built.tris, boxes: built.boxes - before.boxes });
  check('it says where its doors are', built.door && Math.abs(built.door.x - DOOR.x) < 0.01 && Math.abs(built.door.y - PLAN.floor) < 0.01);
  const cut = await ground(), gone = await page.evaluate(() => window.__mmf.sanctuary.uprooted);
  check('switched on, the ground is cut where its court is (three boxes more), and so is its shadow; one place more to walk in, under the rock', cut.holes === whole.holes + 3 && !cut.depth && cut.areas === whole.areas + 1, cut);
  check('what grew on the ground cut away is gone', gone >= 1, { trees: gone });

  // ---- the player, walked by the game's own controller (as tools/walk-test.mjs does: the stick held towards a point)
  const walk = (from, points) => page.evaluate(([from, points]) => {
    const a = window.__mmf, { player, input } = a, dt = 1 / 60;
    if (from) player.teleport(from[0], from[1], from[2]);
    for (const [tx, tz] of points) for (let f = 0; f < 1500; f++) { const dx = tx - player.pos.x, dz = tz - player.pos.z, d = Math.hypot(dx, dz); if (d < 0.5) break; input.move.x = dx / d; input.move.y = -dz / d; input.run = false; input.jump = false; player.update(dt, 0, true); }
    input.move.x = 0; input.move.y = 0;
    return { x: player.pos.x, y: player.pos.y, z: player.pos.z, inside: a.sanctuary.inside(player.pos.x, player.pos.y, player.pos.z) };
  }, [from, points]);
  const near = (p, [x, z], r = 1) => Math.hypot(p.x - x, p.z - z) < r;
  const meadow = toWorld(0, PLAN.court.mouth + 7), foot = toWorld(0, STAIR_END + 3), mid = [PLAN.at.x, PLAN.at.z];
  let p = await walk([meadow[0], meadow[1], DOOR.yaw], [foot]);
  check('from the meadow one walks into the court cut in the cliff, on its floor', near(p, foot) && Math.abs(p.y - (PLAN.floor - PLAN.steps.n * 0.2)) < 0.15, { at: [p.x, p.y, p.z].map((v) => +v.toFixed(1)) });
  p = await walk(null, [[DOOR.x, DOOR.z]]);
  check('…and up the stair to the doors', near(p, [DOOR.x, DOOR.z]) && Math.abs(p.y - PLAN.floor) < 0.15, { at: [p.x, p.y, p.z].map((v) => +v.toFixed(1)), inside: +p.inside.toFixed(2) });
  p = await walk([DOOR.x, DOOR.z, DOOR.yaw], [mid]);
  check('put before the doors and walked in, the player reaches the middle under the dome — on its floor, and wholly inside', near(p, mid) && Math.abs(p.y - PLAN.floor) < 0.1 && p.inside === 1, { at: [p.x, p.y, p.z].map((v) => +v.toFixed(1)), inside: p.inside });
  for (const { id, angle } of CHAPELS) {
    // (the reading desk stands in the middle of the synagogue: one walks round it)
    const way = id === 'synagogue' ? [arm(angle, 0, 11), arm(angle, 2.9, 12.5), arm(angle, 2.9, 17.5), arm(angle, 0, PLAN.chord + 0.6)] : [arm(angle, 0, PLAN.chord + 0.6)];
    p = await walk([mid[0], mid[1], 0], way);
    check(`from the middle one walks into the ${id}, up to what it turns to`, near(p, way[way.length - 1]) && Math.abs(p.y - PLAN.floor) < 0.1 && p.inside >= 0.5, { at: [p.x, p.y, p.z].map((v) => +v.toFixed(1)), inside: +p.inside.toFixed(2) });
  }
  // (from beyond the round bench, straight at the round wall between two arms)
  const from = toWorld(7 * Math.SQRT1_2, 7 * Math.SQRT1_2), beyond = toWorld(17 * Math.SQRT1_2, 17 * Math.SQRT1_2);
  p = await walk([from[0], from[1], 0], [beyond]);
  const r = Math.hypot(p.x - PLAN.at.x, p.z - PLAN.at.z);
  check('a wall stops one: walking at the round wall between two arms, one stays in the hall', r < PLAN.R && r > PLAN.R - 1.5, { fromTheMiddle: +r.toFixed(2), wall: PLAN.R });
  // (in the court, across it, at its rock)
  const side = toWorld(PLAN.court.half + 6, STAIR_END + 2);
  p = await walk([...toWorld(9, STAIR_END + 2), 0], [side]);
  const lx = (p.x - PLAN.at.x) * Math.cos(PLAN.yaw) - (p.z - PLAN.at.z) * Math.sin(PLAN.yaw);
  check('the rock of the court lets nobody into the cliff', lx < PLAN.court.half && Math.abs(p.y - (PLAN.floor - PLAN.steps.n * 0.2)) < 0.15, { across: +lx.toFixed(2), wall: PLAN.court.half, y: +p.y.toFixed(2) });
  // (on the landing, beside the doorway, straight at the front wall)
  const beside = toWorld(4.4, PLAN.chord + PLAN.T + 1.2);
  p = await walk([beside[0], beside[1], DOOR.yaw], [toWorld(4.4, PLAN.chord - 5)]);
  const lz = (p.x - PLAN.at.x) * Math.sin(PLAN.yaw) + (p.z - PLAN.at.z) * Math.cos(PLAN.yaw);
  check('and the front wall, beside the doors, lets nobody through', lz > PLAN.chord + PLAN.T, { before: +(lz - PLAN.chord - PLAN.T).toFixed(2) });
  // (the round bench stops one too: from the middle, towards a length of it)
  p = await walk([mid[0], mid[1], 0], [toWorld(8 * Math.SQRT1_2, 8 * Math.SQRT1_2)]);
  check('the round bench is solid: one walks round it', Math.hypot(p.x - PLAN.at.x, p.z - PLAN.at.z) < 3.0, { fromTheMiddle: +Math.hypot(p.x - PLAN.at.x, p.z - PLAN.at.z).toFixed(2) });
  await frames(4);
  check('nothing complained', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  await server.close();
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
