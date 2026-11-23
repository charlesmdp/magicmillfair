// Checks of the Great Oak ("Out on a Limb"). Without a browser: the course that is written down (route.js) is
// the one tree.js gives today, it holds together — every jump within what the avatar can do and harder with
// the height, branches one has to walk along, dead wood that leaves the time to cross it, nothing of the tree
// or of the course in the way of a body, the nets under everything, no way to skip a branch. Then in a
// headless browser (unless --no-browser): the old tree is the old tree until the extra is switched on, the
// giant stands where it should, a bot climbs it with the real controller — every branch walked, every jump
// taken, the dead wood breaking under it in its own time — the clock runs from the plate to the bell, dead
// wood breaks and grows back, a net catches a fall, the jetpack stays off.
// usage: node lab/oak/oak-test.mjs [--no-browser]
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OAK, oakCourse, readRoute, holdHeight, netHeight, widthAt } from './tree.js';
import { ROUTE } from './route.js';
import { reach } from '../../src/world/zones/games/course.js';
import { oakTree, written } from './oak-course.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };

const tree = await oakTree(), course = readRoute(ROUTE), { holds, jumps, nets } = course;
const branches = holds.filter((h) => h.kind === 'branch'), fungi = holds.filter((h) => h.kind === 'fungus'), decks = holds.filter((h) => h.kind === 'deck');
const partOf = (y) => nets.filter((n) => y > n.y + 0.05).length;
const G = course.ground;

// --------------------------------------------------------------------------------------- what is written down
{
  const again = written(oakCourse({ skeleton: tree.skeleton, ground: tree.ground, seed: OAK.seed, tries: 1 }), tree);
  check('the course that is written down is the one tree.js gives today (else: node lab/oak/oak-course.mjs)', JSON.stringify(again) === JSON.stringify(ROUTE), `seed ${ROUTE.seed}, ${(JSON.stringify(ROUTE).length / 1024).toFixed(0)} KB`);
  const P = tree.model.wood0.getAttribute('position');
  check('it was worked out for the old tree as the forest builds it', P.count === ROUTE.model.wood && ROUTE.model.probes.every(([i, x, y, z]) => Math.hypot(P.getX(i) - x, P.getY(i) - y, P.getZ(i) - z) < 0.01) && ROUTE.cut.every(([first, count]) => first > 0 && first + count <= P.count) && ROUTE.cards.every((k) => k * 4 < ROUTE.model.leaf),
    `${ROUTE.cut.length} small branches and ${ROUTE.cards.length} of ${ROUTE.model.leaf / 4} leaf cards taken off it; its trunk and its ${tree.skeleton.filter((b) => b.level === 1).length} great limbs are left alone: ${ROUTE.cut.every(([first]) => tree.skeleton.find((b) => b.first === first)?.level >= 2)}`);
}

// ------------------------------------------------------------------------------------------------- the whole
{
  check('twice the old tree, twenty metres towards the mountain', OAK.scale === 2.1 && Math.hypot(OAK.at.x - OAK.from.x, OAK.at.z - OAK.from.z) === 20 && tree.ground(0, 40) > tree.ground(0, -40) + 3, `${(tree.model.height * OAK.scale).toFixed(1)} m tall (the old tree: ${(tree.model.height * 1.05).toFixed(1)} m); the ground rises ${(tree.ground(0, 40) - tree.ground(0, -40)).toFixed(1)} m across it, towards the south`);
  check('from a plate on the ground to the crow\'s nest, three nets on the way', Math.abs(course.start.y - tree.ground(course.start.x, course.start.z)) < 0.02 && decks.length === 4 && decks.every((d, k) => d.level === k + 1 && Math.abs(d.y - G - [...OAK.nets, OAK.top][k]) < 1e-6) && course.top.y - G === OAK.top && course.top.y < tree.model.height * OAK.scale - 1,
    `${holds.length} holds: ${branches.length} branches, ${fungi.length} fungi, ${decks.length} decks; nets at ${OAK.nets.join(', ')} m, the nest at ${OAK.top} m (the top of the leaves: ${(tree.model.height * OAK.scale - G).toFixed(1)} m)`);
  // (from each hold to the next: a jump, a step — or, from a deck, the branch that leaves it: one walks onto it)
  const order = holds.every((h, k) => k === holds.length - 1 || h.kind === 'deck' || jumps.some((j) => j.from === k && j.to === k + 1)) && jumps.every((j) => j.to === j.from + 1);
  const offDeck = decks.slice(0, 3).every((d) => { const b = holds[d.i + 1]; return b.kind === 'branch' && Math.abs(b.pts[0].y - d.y) < 0.06 && holdHeight(d, b.pts[0].x, b.pts[0].z) !== null; });
  check('one way up: each hold leads to the next; from a deck one walks onto the branch that leaves it', order && offDeck && holds.every((h, k) => !k || h.y > holds[k - 1].y - 1.6), `${jumps.length} jumps and steps`);
}

// ------------------------------------------------------------------------------------------------- the jumps
{
  let worst = 0, high = 0, bad = [];
  for (const j of jumps) {
    const A = holds[j.from], B = holds[j.to];
    if (j.ratio === 0) { if (j.rise > 0.6 || j.gap > 2.4) bad.push(`${j.from}: step ${j.rise.toFixed(2)}`); continue; } // (walked up)
    const e0 = A.kind === 'branch' ? A.hw * 0.8 : A.kind === 'fungus' ? A.edge : 0.5, e1 = B.kind === 'branch' ? (B.knot || B.hw) * 0.8 : B.kind === 'fungus' ? B.edge : 0.5;
    const can = reach(j.runup, Math.max(j.rise, 0)) - 0.12, share = (j.gap - e0 - e1) / can;
    worst = Math.max(worst, share); high = Math.max(high, j.rise);
    if (share > 0.86 || j.rise > 0.86) bad.push(`${j.from}→${j.to}: ${share.toFixed(2)} of a jump, ${j.rise.toFixed(2)} up`);
  }
  check('every jump is within what the avatar can do, with something to spare', !bad.length, bad.length ? bad.slice(0, 5).join('; ') : `the longest asks for ${Math.round(worst * 100)} % of a running jump, the highest lands ${high.toFixed(2)} m up`);
  const tips = jumps.filter((j) => holds[j.from].kind === 'branch' && holds[j.to].kind === 'branch');
  const mean = (list) => list.reduce((a, b) => a + b, 0) / Math.max(1, list.length);
  // (how much of a running jump each asks for, between the edges one stands on)
  const share = (j) => (j.gap - holds[j.from].hw * 0.8 - (holds[j.to].knot || holds[j.to].hw) * 0.8) / (reach(j.runup, Math.max(j.rise, 0)) - 0.12);
  const byPart = [0, 1, 2, 3].map((k) => mean(tips.filter((j) => partOf(j.a.y) === k).map(share)));
  const wide = [0, 1, 2, 3].map((k) => mean(branches.filter((h) => partOf(h.y) === k).map((h) => h.hw * 2)));
  check('harder with the height: longer jumps from tip to tip, onto narrower branches', byPart[3] > byPart[0] + 0.15 && byPart.every((v, k) => !k || v > byPart[k - 1]) && wide.every((v, k) => !k || v < wide[k - 1]) && Math.abs(wide[0] / 2 - widthAt(0.1)) < 0.05,
    `from tip to tip: ${byPart.map((v) => `${Math.round(v * 100)} %`).join(' → ')} of a running jump; branches ${wide.map((v) => v.toFixed(2)).join(' → ')} m wide`);
}

// ---------------------------------------------------------------------------------------------- the branches
{
  const shapes = branches.reduce((o, h) => (o[h.shape] = (o[h.shape] || 0) + 1, o), {});
  const turns = (h) => { let t = 0; for (let k = 1; k < h.line.length; k++) t += Math.abs(h.line[k].h - h.line[k - 1].h); return t; };
  check('branches one has to walk along: straight ones, and ones that turn — an L, an S, a hook', Object.keys(shapes).length >= 5 && ['L', 'S', 'U'].every((q) => shapes[q] >= 2) && branches.filter((h) => turns(h) > 1).length > branches.length * 0.6,
    `${Object.entries(shapes).map(([k, v]) => `${v} ${k}`).join(', ')}; ${branches.reduce((a, h) => a + h.len, 0).toFixed(0)} m to walk in all, ${Math.min(...branches.map((h) => h.len)).toFixed(1)} to ${Math.max(...branches.map((h) => h.len)).toFixed(1)} m each`);
  const slope = Math.max(...branches.map((h) => { let m = 0; for (let k = 1; k < h.pts.length; k++) m = Math.max(m, Math.abs(h.pts[k].y - h.pts[k - 1].y) / Math.max(0.05, Math.hypot(h.pts[k].x - h.pts[k - 1].x, h.pts[k].z - h.pts[k - 1].z))); return m; }));
  check('they rise as branches do, never steeply; out from the stem, then back to it', slope < 0.62 && branches.every((h, k) => h.root === (k % 2 ? 'end' : 'start')), `the steepest: ${Math.round(slope * 100)} %`);
  const dead = branches.filter((h) => h.fragile), deadBy = [0, 1, 2, 3].map((k) => dead.filter((h) => partOf(h.y) === k).length);
  const tight = dead.map((h) => h.fragile - h.len / 8.2);
  check('dead wood: none at the foot, more and more towards the top', dead.length >= 6 && deadBy[0] === 0 && deadBy[3] >= deadBy[1] && deadBy[2] + deadBy[3] > deadBy[1], `${dead.length} of ${branches.length} branches: ${deadBy.join(' / ')} from the ground up`);
  check('dead wood holds long enough to be crossed at a run, and not much longer', dead.every((h) => h.fragile > h.len / 6.4 + 0.15 && h.fragile < h.len / 6.2 + 0.7) && Math.min(...tight) > 0.4, `it breaks ${Math.min(...dead.map((h) => h.fragile)).toFixed(2)} to ${Math.max(...dead.map((h) => h.fragile)).toFixed(2)} s after one has set foot on it: ${Math.min(...tight).toFixed(2)} s more, at the least, than running its length takes`);
}

// ------------------------------------------------------------------------------------------- room for a body
{
  // the wood of the tree (but its trunk): capsules; a body is 0.38 m round and 1.7 m tall
  const caps = [];
  tree.skeleton.forEach((b, index) => {
    if (!b.level) return;
    const cut = ROUTE.cut.find(([first]) => first === b.first);
    for (let i = 0; i + 1 < b.pts.length; i++) { if (cut && (cut[3] === 0 || i + 1 >= cut[3])) break; caps.push({ a: b.pts[i], b: b.pts[i + 1], level: b.level }); }
  });
  const clear = (x, y, z) => { let m = 9; for (const o of caps) { const dx = o.b.x - o.a.x, dy = o.b.y - o.a.y, dz = o.b.z - o.a.z, t = Math.min(1, Math.max(0, ((x - o.a.x) * dx + (y - o.a.y) * dy + (z - o.a.z) * dz) / (dx * dx + dy * dy + dz * dz || 1))); m = Math.min(m, Math.hypot(x - o.a.x - dx * t, y - o.a.y - dy * t, z - o.a.z - dz * t) - (o.a.r + (o.b.r - o.a.r) * t)); } return m; };
  let least = 9, where = '';
  const body = (p, name) => { for (const h of [0.5, 1.1, 1.7]) { const c = clear(p.x, p.y + h, p.z); if (c < least) { least = c; where = name; } } };
  for (const h of holds) { if (h.kind === 'branch') h.pts.forEach((p) => body(p, `branch ${h.i}`)); else if (h.kind === 'fungus') body(h.at, `fungus ${h.i}`); }
  for (const j of jumps) for (let u = 0.2; u < 0.9; u += 0.2) body({ x: j.a.x + (j.b.x - j.a.x) * u, y: j.a.y + (j.b.y - j.a.y) * u + 0.5, z: j.a.z + (j.b.z - j.a.z) * u }, `jump ${j.from}`);
  check('nothing of the tree in the way: where one walks, stands and jumps, its wood keeps clear of a body', least > 0.38, `the nearest wood left on the tree is ${least.toFixed(2)} m from the middle of a body (${where})`);
  // what the game refuses (Collision.blocked): a solid hold over the knees of someone on another
  let over = [];
  const solid = holds.filter((h) => h.kind === 'branch' || h.kind === 'fungus');
  for (const a of solid) for (const p of a.kind === 'branch' ? a.pts : [a.at]) for (const b of solid) {
    if (b === a) continue;
    const top = holdHeight(b, p.x, p.z);
    if (top !== null && p.y + 0.3 < top - 0.45 && p.y + 1.5 > top - (b.kind === 'branch' ? 0.5 : 0.3)) over.push(`${b.i} over ${a.i}`);
  }
  check('nor of the course itself: no hold hangs over the knees of someone on another', !over.length, over.length ? [...new Set(over)].slice(0, 6).join(', ') : `${solid.length} holds`);
  let near = 9;
  for (const h of branches) for (const p of h.pts) { const c = course.stem(p.y); near = Math.min(near, Math.hypot(p.x - c.x, p.z - c.z) - c.r); }
  check('the stem is where one starts and ends each branch, not in the middle of it', near > 0.4, `where one walks is never nearer than ${near.toFixed(2)} m to the bark`);
}

// ---------------------------------------------------------------------------------------------------- the nets
{
  let out = 0, worst = 0, gaps = 0;
  for (const h of holds) {
    if (h.kind === 'deck' || h.y < nets[0].y) continue;
    const n = nets[partOf(h.y) - 1];
    for (const p of h.kind === 'branch' ? h.pts : [h.at]) {
      const d = Math.hypot(p.x - n.x, p.z - n.z);
      worst = Math.max(worst, d);
      if (d > n.r1 - 0.8) out++;
      if (d < n.r0 && holdHeight(decks[n.level - 1], p.x, p.z) === null) gaps++;
    }
  }
  check('a fall ends in the net below: every branch above a net is over it', out === 0 && nets.every((n, k) => n.level === k + 1 && netHeight(n, n.x + n.r0 + 0.01, n.z) !== null && netHeight(n, n.x + n.r1 + 0.01, n.z) === null && Math.abs(netHeight(n, n.x + (n.r0 + n.r1) / 2, n.z) - (n.y - n.sag)) < 0.02),
    `the furthest one walks from the stem above a net: ${worst.toFixed(1)} m; the nets reach ${nets[0].r1} m (${gaps} places by the stem are over the way up through a deck: a fall there ends on its steps)`);
  const fall = Math.max(...holds.filter((h) => h.kind !== 'deck').map((h) => h.y - (partOf(h.y) ? nets[partOf(h.y) - 1].y : G)));
  check('so that a slip costs a part of the climb, never all of it', fall < 19, `at most ${fall.toFixed(1)} m down`);
}

// ------------------------------------------------------------------------------------------------ no way round
{
  // from anywhere on a hold, can one reach a hold further on than the next? (a jump: up to 1.15 m higher, as far as a run carries)
  const spots = (h) => (h.kind === 'branch' ? h.pts.filter((_, k) => k % 2 === 0) : h.kind === 'fungus' ? [h.at] : []);
  const edge = (h) => (h.kind === 'branch' ? h.hw : h.kind === 'fungus' ? h.r * 0.6 : 0);
  const skips = [];
  for (let i = 0; i < holds.length; i++) for (let k = i + 2; k < Math.min(holds.length, i + 9); k++) {
    const A = holds[i], B = holds[k];
    if (A.kind === 'deck' || B.kind === 'deck' || partOf(A.y) !== partOf(B.y)) continue;
    let best = 9;
    for (const p of spots(A)) for (const q of spots(B)) { const rise = q.y - p.y; if (rise > 1.15) continue; best = Math.min(best, Math.hypot(q.x - p.x, q.z - p.z) - edge(A) - edge(B) - reach(4, Math.max(0, rise))); }
    // (two fungi, or a fungus and the branch after the next hop: a longer hop instead of two short ones is no shortcut worth the name)
    if (best < 0 && (A.kind === 'branch' && B.kind === 'branch')) skips.push(`${i}→${k}`);
  }
  check('no branch can be skipped: from one branch, no other than the next is within a jump', skips.length === 0, skips.length ? skips.join(', ') : 'checked from every branch to the eight holds after the next');
}

// ------------------------------------------------------------------------------------------------- in the game
if (!opt['no-browser']) {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const { createServer } = await import('vite');
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 5197, strictPort: false, host: '127.0.0.1' } });
  await server.listen();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  // (the bot runs with Shift, as when a visitor has switched "always run" off)
  await context.addInitScript(() => { try { for (const k of ['mmf.run', 'mmf.follow']) if (localStorage.getItem(k) === null) localStorage.setItem(k, '0'); } catch { /* no storage */ } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?q=low`);
    await page.waitForSelector('.card.ready', { timeout: 240000 });
    const before = await page.evaluate(([name, x, z]) => {
      const app = window.__mmf, f = app.world.forest, sp = f.species.find((s) => s && s.name === name);
      let at = null; for (let i = 0; i < f.count; i++) if (f.info[i * 6 + 4] === sp.si && Math.hypot(f.info[i * 6] - x, f.info[i * 6 + 2] - z) < 1) at = [f.info[i * 6], f.info[i * 6 + 2], f.matrices[i * 16 + 5] * Math.max(...sp.models.map((m) => m.height))];
      return { at, oak: !!app.oak, platforms: app.world.collision.platforms.length, fly: app.player.canFly({ x: -110, y: 60, z: 158 }), perf: { calls: app.engine.perf.calls, tris: app.engine.perf.triangles } };
    }, [OAK.species, OAK.from.x, OAK.from.z]);
    check('without the extra, the old tree stands where it always stood', !!before.at && !before.oak && before.at[2] < 45, before.at ? `at ${before.at[0]}, ${before.at[1]}, about ${before.at[2].toFixed(0)} m tall` : 'not found');
    const built = await page.evaluate(() => import('/lab/oak/extra.js').then(async (extra) => { const t = performance.now(); const o = await extra.attach(window.__mmf); let tris = 0, meshes = 0; o.group.traverse((m) => { if (m.isMesh) { meshes++; tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; } }); return { ms: Math.round(performance.now() - t), pruned: o.pruned, base: o.base.toArray(), height: o.giant.height, meshes, tris: Math.round(tris), dead: o.dead.length, platforms: window.__mmf.world.collision.platforms.length, fly: window.__mmf.player.canFly({ x: o.base.x + 3, y: o.base.y + 30, z: o.base.z }), flyAway: window.__mmf.player.canFly({ x: o.base.x + 60, y: o.base.y + 30, z: o.base.z }) }; }));
    check('switched on: the giant stands twenty metres on, twice as tall, pruned where one climbs', built.pruned && Math.hypot(built.base[0] - OAK.at.x, built.base[2] - OAK.at.z) < 1e-6 && Math.abs(built.height - tree.model.height * OAK.scale) < 0.01 && built.platforms === before.platforms + holds.length + nets.length,
      `in ${built.ms} ms; ${built.height.toFixed(1)} m tall; ${built.meshes} meshes and ${built.tris} triangles added, ${built.dead} of them branches that break`);
    check('no jetpack at the tree (it is climbed), as before everywhere else', before.fly && !built.fly && built.flyAway);
    // ---- a bot climbs: every branch walked from where one lands on it, every jump taken, the dead wood on its own clock
    const climb = await page.evaluate(async () => {
      const { holdHeight } = await import('/lab/oak/tree.js');
      const app = window.__mmf, { player, input } = app, oak = app.oak, base = oak.base, course = oak.course, holds = course.holds, dt = 1 / 60, p = player.pos;
      let fast = true;
      const step = (dx, dz, jump) => { input.move.x = dx; input.move.y = -dz; input.run = fast; input.jump = !!jump; player.update(dt, 0, true); oak.tick(dt, player); };
      const on = (h) => { if (!player.grounded) return false; const y = holdHeight(h, p.x - base.x, p.z - base.z); return y !== null && Math.abs(p.y - base.y - y) < 0.04; };
      const put = (q) => { p.set(q.x + base.x, q.y + base.y, q.z + base.z); player.vel.set(0, 0, 0); player.grounded = true; player.swimming = false; player.jet = 0; player.seat = null; };
      const to = (q) => { const dx = q.x + base.x - p.x, dz = q.z + base.z - p.z, l = Math.hypot(dx, dz); return [l, l > 1e-4 ? dx / l : 0, l > 1e-4 ? dz / l : 0]; };
      const fresh = () => { for (const d of oak.dead) { d.state = 'sound'; d.gone = false; d.t = 0; d.pivot.visible = true; d.pivot.position.y = d.y0; d.pivot.quaternion.identity(); d.pivot.scale.setScalar(1); } };
      const leg = (j, m, startAt) => {
        const A = holds[j.from], B = holds[j.to], T = B.kind === 'fungus' ? B.at : j.b;
        fresh(); put(startAt);
        for (let f = 0; f < 3; f++) step(0, 0, false);
        if (!on(A)) return 'not on';
        if (A.kind === 'branch') {
          let k = A.pts.findIndex((q) => q.d >= startAt.d - 1e-6);
          for (let f = 0; f < 900 && k < A.pts.length - 1; f++) {
            const [l, dx, dz] = to(A.pts[k + 1]);
            if (l < 0.3) { k++; continue; }
            if (k + 1 === A.pts.length - 1 && l < m + 0.6) break;
            step(dx, dz, false);
            if (!player.grounded && p.y < A.pts[k].y + base.y - 1.5) return 'fell off';
          }
        }
        let jumped = false, air = 0;
        for (let f = 0; f < 600; f++) {
          const [la, ax, az] = to(j.a), [lb, bx, bz] = to(T), walked = j.ratio === 0;
          const doJump = !walked && !jumped && player.grounded && la <= m + Math.hypot(player.vel.x, player.vel.z) * dt;
          if (jumped && player.grounded) {
            if (!on(B)) return air > 2 ? 'missed' : 'no jump';
            // landed: and it must be possible to stop there (the stick against one's own speed), not only to touch down
            for (let g = 0; g < 30; g++) { const [l, dx, dz] = to(T), v = Math.hypot(player.vel.x, player.vel.z); if (v < 0.25 && l < 0.3) break; const k = Math.min(1, l / 0.5); step(dx * k - (player.vel.x / 8.2) * 0.9, dz * k - (player.vel.z / 8.2) * 0.9, false); }
            return on(B) ? null : 'slid off';
          }
          if (walked && on(B)) return null;
          let dirx = jumped || la < 0.25 || walked ? bx : ax, dirz = jumped || la < 0.25 || walked ? bz : az;
          if (jumped) {
            // (in the air: steer for where one will come down)
            const vy = player.vel.y, disc = vy * vy + 2 * 15 * (p.y - (T.y + base.y)), tl = disc > 0 ? (vy + Math.sqrt(disc)) / 15 : 0;
            const ex = T.x + base.x - (p.x + player.vel.x * tl), ez = T.z + base.z - (p.z + player.vel.z * tl), el = Math.hypot(ex, ez);
            dirx = el > 0.1 ? ex / el : 0; dirz = el > 0.1 ? ez / el : 0;
          }
          step(lb > 0.06 ? dirx : 0, lb > 0.06 ? dirz : 0, doJump);
          if (doJump) jumped = true;
          if (jumped) air++;
          if (p.y < Math.min(j.a.y, j.b.y) + base.y - 3.5) return 'fell';
        }
        return 'time';
      };
      const out = { jumps: course.jumps.length, stuck: [], first: 0 };
      // the clock: on the plate, off it, and (at the end) at the top
      const s = oak.start;
      p.set(s.x, s.y, s.z); player.vel.set(0, 0, 0); player.grounded = true;
      for (let f = 0; f < 20; f++) step(0, 0, false);
      out.ready = oak.run.state; out.line0 = document.querySelector('.hud .run').textContent;
      const first = holds[0].at;
      for (let f = 0; f < 600 && !on(holds[0]); f++) { const [, dx, dz] = to(first); step(dx, dz, false); }
      out.running = oak.run.state; out.onFirst = on(holds[0]);
      let landed = holds[0].at;
      for (const j of course.jumps) {
        const A = holds[j.from];
        let start = A.kind === 'branch' ? A.pts.reduce((b, q) => (Math.hypot(q.x - landed.x, q.z - landed.z) < Math.hypot(b.x - landed.x, b.z - landed.z) ? q : b), A.pts[0]) : landed;
        if (A.kind === 'branch' && start === A.pts[A.pts.length - 1]) start = A.pts[0];
        let why = 'none', n = 0;
        for (const [m, run] of [[0.12, true], [0.3, true], [0.12, false], [0.5, true], [0.3, false], [0.75, true], [0.05, true], [1.0, true], [0.6, false]]) {
          n++; fast = run;
          const dx = j.b.x - j.a.x, dz = j.b.z - j.a.z, l = Math.hypot(dx, dz) || 1, back = A.kind === 'deck' ? 1.6 : (A.edge || 0) * 1.6;
          why = leg(j, m, A.kind === 'branch' ? start : { x: j.a.x - (dx / l) * back, y: A.y, z: j.a.z - (dz / l) * back });
          if (why === 'not on' && A.kind !== 'branch') why = leg(j, m, { x: j.a.x, y: A.y, z: j.a.z });
          if (!why) break;
        }
        if (why) out.stuck.push(`${j.from}→${j.to} (${why})`); else if (n === 1) out.first++;
        landed = holds[j.to].kind === 'fungus' ? holds[j.to].at : j.b;
      }
      for (let f = 0; f < 10; f++) step(0, 0, false);
      Object.assign(out, { state: oak.run.state, clean: oak.run.clean, line: document.querySelector('.hud .run').textContent, best: oak.best, height: p.y - oak.ground });
      // ---- dead wood: it holds as long as it says, then it is gone from under the feet, then it is back
      {
        fresh();
        const d = oak.dead[0], h = d.hold, q = h.pts[h.pts.length >> 1];
        put(q); for (let f = 0; f < 3; f++) step(0, 0, false);
        const t0 = d.state; let held = 0;
        while (!d.gone && held < 600) { step(0, 0, false); held++; }
        for (let f = 0; f < 40; f++) step(0, 0, false);
        const fell = q.y + base.y - p.y; let back = 0;
        while (d.state !== 'sound' && back < 2000) { step(0, 0, false); back++; }
        out.dead = { creaks: t0, held: held * dt, fuse: h.fragile, fell, back: back * dt, again: holdHeight(h, q.x, q.z) !== null && !d.gone && d.pivot.visible };
      }
      // ---- a net: off the tip of a branch above the first one, and down
      {
        const h = holds.find((q) => q.kind === 'branch' && q.root === 'start' && q.y > course.nets[0].y + 4), tip = h.pts[h.pts.length - 1], n = course.nets[0];
        const dx = tip.x - n.x, dz = tip.z - n.z, l = Math.hypot(dx, dz);
        p.set(tip.x + base.x + (dx / l) * 1.2, tip.y + base.y + 0.2, tip.z + base.z + (dz / l) * 1.2); player.vel.set(0, 0, 0); player.grounded = false;
        let f = 0, bounced = false; for (; f < 600; f++) { step(0, 0, false); if (player.vel.y > 1) bounced = true; if (player.grounded && f > 30) break; }
        out.net = { from: tip.y - n.y, landed: p.y - base.y - n.y, bounced, grounded: player.grounded };
      }
      return out;
    });
    check('the climb can be done: a bot walks every branch, makes every jump and stops where it lands, the dead wood breaking in its own time', climb.stuck.length === 0 && climb.jumps === jumps.length && climb.height > OAK.top - 0.1, `${climb.jumps} jumps, ${climb.first} at the first try${climb.stuck.length ? `; stuck at ${climb.stuck.join(', ')}` : ''}`);
    check('the clock starts on leaving the plate and stops at the bell; the time is kept', climb.ready === 'ready' && /^Ready/.test(climb.line0) && climb.onFirst && climb.running === 'running' && climb.state === 'done' && climb.clean && /^Top reached in \d+:\d\d\.\d\d!$/.test(climb.line) && climb.best > 0, JSON.stringify({ ready: climb.ready, line0: climb.line0, onFirst: climb.onFirst, running: climb.running, state: climb.state, clean: climb.clean, line: climb.line, best: climb.best }));
    check('dead wood creaks, breaks when it said it would, and grows back', climb.dead.creaks === 'creaking' && Math.abs(climb.dead.held - climb.dead.fuse) < 0.08 && climb.dead.fell > 1.5 && Math.abs(climb.dead.back - (OAK.back + 0.7)) < 3.5 && climb.dead.again, `held ${climb.dead.held.toFixed(2)} s (${climb.dead.fuse} s), back ${climb.dead.back.toFixed(1)} s after it broke`);
    check('a fall ends in the net, which gives a little', climb.net.grounded && climb.net.bounced && Math.abs(climb.net.landed) < 0.7, `${climb.net.from.toFixed(1)} m down onto the first net`);
    const after = await page.evaluate(() => new Promise((res) => { const app = window.__mmf, o = app.oak; app.setCam(o.base.x, o.ground + 30, o.base.z - 95, 180, -5); const t = app.frames + 8; const tick = () => (app.frames >= t ? res({ calls: app.engine.perf.calls, tris: app.engine.perf.triangles }) : requestAnimationFrame(tick)); tick(); })).catch(() => null);
    if (after) console.log(`      (seen whole from the clearing: ${after.calls} draw calls, ${after.tris} triangles in the frame)`);
    check('nothing was reported wrong by the browser', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    await server.close();
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} of ${results.length} checks pass.`);
process.exit(failed ? 1 : 0);
