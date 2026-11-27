// Checks of Wild River, without a browser: the river is long, wide and falls all the way, and never meets
// itself; the headland it comes down stands in the sea against the northern cliffs, clear of the dog, of the
// slide and of where one swims, and holds its water; the stream carries, the raft has weight, a brace saves a
// knock, a fall taken sideways turns it over — and costs seconds, never the run; a crew with a person's limits
// runs it clean, a clumsy one gets down it badly, and nobody wins by doing nothing.
// usage: node tools/raft-test.mjs            (its last line is its line for server/scores.js)
import { ground } from './lib/check.mjs';
import { RAFT, raftCourse, riverAt, riverPoint, riverNear, currentAt, startRun, stepRun, raftPose, raftLine, botInput, botRun, fastest } from '../src/world/zones/games/raft/rules.js';
import { raftLand, LAND } from '../src/world/zones/games/raft/land.js';
import { BOUNDS, SEA_REACH, NORTH } from '../src/world/layout/layout.js';
import { slideCourse, SLIDE } from '../src/world/zones/games/slide/track.js';
import { BOARDS } from '../server/scores.js';

const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const K = RAFT, course = raftCourse(), land = raftLand(course), height = await ground();
const inside = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
const sec = (ms) => `${(ms / 1000).toFixed(1)} s`;
/** A raft put at metre `s`, `u` across, going at `v`, pointing `a` off the stream. */
const put = (s, u = 0, v = 5, a = 0) => { const st = startRun(course); Object.assign(st, { s, u, vs: v, a }); st.flag = Math.max(0, course.flags.findLastIndex((f) => f.s <= s)); st.nextRock = Math.max(0, course.rocks.findIndex((r) => r.s > s - 5)); st.nextLedge = course.ledges.findIndex((l) => l.s > s); if (st.nextLedge < 0) st.nextLedge = course.ledges.length; return st; };
/** Runs it `secs` seconds: `drive(st, input, t)` fills the input (a brace asked there is one press). Returns what happened. */
const run = (st, secs, drive, stop) => { const input = { x: 0, y: 0, brace: false }, events = [], seen = []; for (let t = 0; t < secs && !st.over; t += K.step) { input.brace = false; drive?.(st, input, t); stepRun(st, K.step, input, events); for (const e of events) seen.push({ ...e, t, s: st.s }); events.length = 0; if (stop?.(st, seen)) break; } return seen; };
const stretch = (name) => course.stretches.find((q) => q.name === name);
const P = course.points;

// ---------------------------------------------------------------------------------------------- the river
{
  const kinds = new Set(course.stretches.map((q) => q.kind)), drops = P.map((p, i) => (i ? P[i - 1].y - p.y : 0));
  check('a long river: six hundred metres or more, in a good many stretches', course.length >= 600 && course.stretches.length >= 12, `${course.length.toFixed(0)} m in ${course.stretches.length} stretches, ${course.drop.toFixed(1)} m down`);
  check('it falls all the way to the sea: never a metre of it runs uphill, and it ends a hand above the waves', drops.every((d) => d > -1e-6) && P[P.length - 1].y > 0.1 && P[P.length - 1].y < 0.8, `from ${P[0].y.toFixed(1)} m to ${P[P.length - 1].y.toFixed(2)} m`);
  const wide = P.filter((p) => course.stretches[p.stretch].kind !== 'narrows').map((p) => p.hw * 2), tight = P.filter((p) => course.stretches[p.stretch].kind === 'narrows').map((p) => p.hw * 2);
  check('it is wide — eight to twelve metres and more, a river, not a flume — but in its narrows', Math.min(...wide) >= 8 && Math.max(...wide) <= 24 && Math.min(...tight) >= 6, `${Math.min(...wide).toFixed(1)} to ${Math.max(...wide).toFixed(1)} m; ${Math.min(...tight).toFixed(1)} m in the narrows`);
  let least = 1e9;
  for (let i = 0; i < P.length; i += 2) for (let j = i + 90; j < P.length; j += 2) least = Math.min(least, Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z));
  check('it never meets itself: two reaches are never nearer than a canyon wall is thick', least > 30, `${least.toFixed(1)} m at the nearest`);
  const slopes = P.filter((p) => !course.ledges.some((l) => p.s > l.s - 1 && p.s < l.s + l.run + 1)).map((p) => p.slope);
  check('between its falls it is a river one rafts: nowhere steeper than one in six', Math.max(...slopes) < 0.17, `${(Math.max(...slopes) * 100).toFixed(0)} % at the steepest, ${((course.drop - course.ledges.reduce((a, l) => a + l.h, 0)) / course.length * 100).toFixed(1)} % on the whole`);
  check('eight kinds of moment at least: slack water, riffles, rocks, a bend with its waves, narrows, a hole, a fork round an island, falls — a great one at the end',
    kinds.size >= 7 && course.rocks.length >= 20 && course.ledges.length >= 5 && course.waves.length >= 5 && course.holes.length >= 2 && course.shoals.length >= 2 && course.islands.length === 1
    && course.ledges[course.ledges.length - 1].h >= 8 && course.ledges[course.ledges.length - 1].s > course.length - 60,
    `${[...kinds].join(', ')} · ${course.rocks.length} rocks, ${course.ledges.length} falls (${course.ledges.map((l) => l.h).join(', ')} m), ${course.waves.length} trains of waves, ${course.holes.length} holes, ${course.shoals.length} gravel bars`);
  const gaps = course.flags.slice(1).map((f, i) => f.s - course.flags[i].s);
  check('a flag at every pool: a save never further than a hundred and fifty metres on, the last one under the great fall', course.flags.length >= 6 && Math.max(...gaps) < 150 && course.flags[course.flags.length - 1].s > course.ledges[course.ledges.length - 1].s, `${course.flags.length} flags, ${Math.round(Math.max(...gaps))} m apart at the most`);
  check('easy first, harder as it goes: nothing in the way in the Cauldron, the first fall after 150 m, the great one last', course.rocks[0].s > 30 && course.ledges[0].s > 150 && course.ledges[0].h < course.ledges[course.ledges.length - 1].h);
  const again = JSON.stringify(course.rocks) === JSON.stringify(raftCourse().rocks);
  check('what is in the way never moves: the river is the same for everybody, try after try', again);
}

// ---------------------------------------------------------------------------------------------- where it stands
{
  // the water, and the real ground under it
  let poke = -1e9, at = null, out = 0, n = 0;
  const q = {};
  for (let s = 0; s <= course.length; s += 1) {
    const p = riverAt(course, s);
    for (let u = -p.hw - 1; u <= p.hw + 1; u += 1) { riverPoint(course, s, u, q); n++; const over = height(q.x, q.z) - p.y; if (over > poke) { poke = over; at = [q.x, q.z]; } if (Math.abs(q.x) > 510 || Math.abs(q.z) > 510) out++; }
  }
  check('nothing of the world is dug, and none of it comes through the water: the real ground lies under the river everywhere', poke < -0.5 && out === 0, `${(-poke).toFixed(1)} m under it at the least, at (${at.map((v) => v.toFixed(0)).join(', ')})`);
  // the headland: what it keeps clear of
  const dog = NORTH.ledge, slide = slideCourse();
  let nearDog = 1e9, nearSlide = 1e9, swim = 0, walk = 0, west = 1e9, seam = 0;
  const o = {};
  for (let x = land.x0; x <= land.x1; x += 2) for (let z = land.z0; z <= land.z1; z += 2) {
    land.at(x, z, o);
    if (o.h < -1) continue;
    nearDog = Math.min(nearDog, Math.hypot(Math.max(0, Math.abs(x - dog.x) - dog.rx), Math.max(0, Math.abs(z - dog.z) - dog.rz)));
    if (SEA_REACH.some((poly) => inside(poly, x, z))) swim++;
    if (inside(BOUNDS, x, z)) walk++;
    if (z < -512) seam++; // (beyond the northern edge of the world's own ground: the cliffs there are only a backdrop)
    west = Math.min(west, x);
  }
  for (const line of slide.lines) for (const p of line.points) { const d = land.at(p.x, p.z, o); if (d.h > -1) nearSlide = 0; else nearSlide = Math.min(nearSlide, -d.sea); }
  check('the headland keeps clear: of the ledge of the golden dog, of the slide, of every water one swims in and of the ground one walks', nearDog > 38 && nearSlide > 25 && swim === 0 && walk === 0 && seam === 0, `${nearDog.toFixed(0)} m from the ledge, ${nearSlide.toFixed(0)} m from the slide in plan`);
  // the canyon holds the river, and the land stands in the sea or against the cliff
  let low = 1e9, bed = -1e9, float = 0;
  for (let s = 2; s < course.length - 1; s += 2) {
    const p = riverAt(course, s), shape = LAND.own[course.stretches[P[Math.round(s)].stretch].name] || LAND.kind[course.stretches[P[Math.round(s)].stretch].kind];
    for (const side of [-1, 1]) {
      riverPoint(course, s, side * (p.hw + 1.2), q); low = Math.min(low, land.at(q.x, q.z, o).h - p.y);
      riverPoint(course, s, side * (p.hw - 1.5), q); bed = Math.max(bed, land.at(q.x, q.z, o).h - p.y);
    }
    void shape;
  }
  for (let x = land.x0; x <= land.x1; x += 3) for (let z = land.z0; z <= land.z1; z += 3) { land.at(x, z, o); if (o.h > 0.5 && o.sea > 0 && o.sea < 1 && height(x, z) > 2 && x > land.foot(z) + 8) float++; }
  check('the canyon holds its river: a bank above the water on both sides all the way, the bed under it', low > 0.05 && bed < -0.02, `banks ${low.toFixed(2)} m over the water at the least, the bed ${(-bed).toFixed(2)} m under it at the least`);
  let tall = 0, green = 0, total = 0;
  for (let x = land.x0; x <= land.x1; x += 3) for (let z = land.z0; z <= land.z1; z += 3) { land.at(x, z, o); if (o.h < 0.3) continue; total++; if (o.kind === 3 || o.kind === 1) green++; tall = Math.max(tall, o.h); }
  check('it is land, not a wall: tops and banks one could plant make up a good part of it', green / total > 0.3 && tall > 50 && tall < 80, `${Math.round((green / total) * 100)} % of it tops and banks, ${tall.toFixed(0)} m at its highest, ${total * 9} m² in all`);
  // the gate
  const G = K.gate, sg = SLIDE.gate, sc = slide;
  const gy = height(G.x, G.z), fx = Math.sin(sg.yaw), fz = Math.cos(sg.yaw), board = { x: sg.x - fz * 4.4 + fx * 0.4, z: sg.z + fx * 4.4 + fz * 0.4 };
  const dGate = Math.hypot(G.x - sg.x, G.z - sg.z), dBoard = Math.hypot(G.x - board.x, G.z - board.z), dLand = Math.hypot(G.x - sc.splash.x, G.z - sc.splash.z);
  check('one asks to play on the sand at the north end of the beach: ground one walks, dry, clear of the gate, the board and the landing of the slide', inside(BOUNDS, G.x, G.z) && gy > 0.6 && gy < 6 && dGate > 14 && dBoard > 12 && dLand > 25, `(${G.x}, ${G.z}), ${gy.toFixed(1)} m over the sea; ${dGate.toFixed(0)} m from the slide's gate, ${dBoard.toFixed(0)} m from its board, ${dLand.toFixed(0)} m from where its riders land`);
}

// ---------------------------------------------------------------------------------------------- the stream, the raft
{
  const pool = stretch('Otter Pool'), mid = (pool.from + pool.to) / 2;
  const speed = (y) => { const st = put(pool.from + 2, 0, 3); run(st, 2.5, (q, input) => { input.y = y; }); return st.vs; };
  const drift = speed(0), on = speed(1), hold = speed(-1);
  check('the stream carries; paddling goes faster than it, holding water slower', drift > 1 && on > drift + 1.5 && hold < drift - 1, `in a pool: ${drift.toFixed(1)} m/s adrift, ${on.toFixed(1)} paddling, ${hold.toFixed(1)} holding water`);
  const p = riverAt(course, stretch('The Rock Garden').from + 3);
  check('the water runs quickest down the middle and slack along the banks', currentAt(course, p, 0) > currentAt(course, p, p.hw - 0.5) * 1.6);
  // a raft has weight: it turns late, and a bend throws it out
  const st = put(mid - 8, 0, 3); let t60 = 0;
  run(st, 3, (q, input, t) => { input.x = 1; input.y = 1; if (!t60 && q.a > 0.5) t60 = t; });
  const bendOf = stretch('The Big Bend'), b = put(bendOf.from + 4, 0, 6); run(b, 4, (q, input) => { input.y = 1; }, (q) => q.s > bendOf.from + 30);
  check('a raft has weight: it comes round late to where it is pointed, and a bend throws it towards its outer bank', t60 > 0.25 && t60 < 1.2 && b.u < -1.2, `${t60.toFixed(2)} s to come round thirty degrees; ${(-b.u).toFixed(1)} m out after 26 m of the bend, unsteered`);
  const a = put(mid - 8, 0, 3), c = put(mid - 8, 0, 3);
  run(a, 2.2, (q, input) => { input.x = 1; input.y = 1; }); run(c, 2.2, (q, input) => { input.x = 1; });
  check('one steers: the stick takes the raft across — further with the paddles in', a.u > 2 && c.u > 0.8 && a.u > c.u, `${a.u.toFixed(1)} m across in 2.2 s paddling, ${c.u.toFixed(1)} m adrift`);
}

// ---------------------------------------------------------------------------------------------- the rocks, the brace
{
  // (a raft let go straight at a rock, adrift: when it runs into it is found first; then the same again, braced so long before)
  const r = course.rocks.find((q) => q.s > stretch('The Rock Garden').from), from = r.s - 9;
  const into = (at) => { const st = put(from, r.u + 0.9, 6.5); const seen = run(st, 4, (q, input, t) => { if (at !== null && !q.pressed && t >= at) { input.brace = true; q.pressed = true; } }, (q, ev) => ev.some((e) => e.type === 'rock')); return { st, e: seen.find((e) => e.type === 'rock') }; };
  const bare = into(null), hit = bare.e ? bare.e.t : 0, early = into(hit - 0.3), justin = into(hit - 0.5), toosoon = into(hit - 0.9);
  check('a rock run into knocks: most of the speed gone, the paddles lost for a moment, the raft spun', bare.e && !bare.e.braced && bare.st.stun > 0.5 && Math.abs(bare.st.w) > 0.8 && bare.st.knocks === 1, bare.e ? `into it at ${bare.e.hard.toFixed(1)} m/s` : 'no rock met');
  check('BRACE, pressed just before, saves the knock — anywhere in the half second before, not a second before', early.e?.braced && early.st.knocks === 0 && justin.e?.braced && justin.st.knocks === 0 && toosoon.e && !toosoon.e.braced && toosoon.st.knocks === 1, `the brace holds ${K.brace.hold} s`);
  // the button is an edge: held down, it braces once; and bracing all the time is not a way to go
  const steady = put(stretch('Otter Pool').from + 1, 0, 3), mash = put(stretch('Otter Pool').from + 1, 0, 3);
  run(steady, 4, (q, input) => { input.y = 1; }); run(mash, 4, (q, input) => { input.y = 1; input.brace = true; });
  check('who braces all the time does not paddle: it is slower, not safer', mash.s < steady.s - 2 && mash.braces >= 3, `${(steady.s - mash.s).toFixed(1)} m lost in 4 s`);
  // nothing pins a raft: left to the stream on any side of the river, it gets by every rock
  let stuck = 0;
  for (const u0 of [-4, -2, 0, 2, 4]) { const st = put(stretch('First Riffles').from, u0, 3); let far = st.s, since = 0; run(st, 200, null, (q) => { if (q.s > far + 0.5) { far = q.s; since = 0; } else since += K.step; if (since > 25) { stuck++; return true; } return q.s > stretch('The Great Fall').from; }); }
  check('nothing pins a raft: left to the stream, on any side of the river, it gets by every rock and the island', stuck === 0, `${stuck} of 5 stuck`);
}

// ---------------------------------------------------------------------------------------------- the falls, the waves, the hole
{
  const l = course.ledges[0], over = (a, lead) => { const st = put(l.s - 12, 0, 6, a); const seen = run(st, 8, (q, input) => { if (Math.abs(a) < 0.3) input.y = 1; if (lead !== null && !q.pressed && !q.air && q.s < l.s && (l.s - q.s) / Math.max(1, q.vs) <= lead) { input.brace = true; q.pressed = true; } }, (q, ev) => ev.some((e) => e.type === 'back') || q.s > l.s + 14); return { st, land: seen.find((e) => e.type === 'land'), back: seen.find((e) => e.type === 'back'), seen }; };
  const clean = over(0, 0.3), bare = over(0, null);
  check('a fall, taken straight and braced: clean; unbraced, a knock', clean.land?.clean && clean.st.knocks === 0 && bare.land && !bare.land.clean && bare.st.knocks === 1 && bare.st.swims === 0, `${l.h} m`);
  // (sideways: the raft is turned by hand, and kept so)
  const side = (lead) => { const st = put(l.s - 5, 0, 6, 1.4); const seen = run(st, 8, (q, input) => { if (!q.air && q.s < l.s) { q.a = 1.4; q.w = 0; } if (lead !== null && !q.pressed && q.s < l.s && (l.s - q.s) / Math.max(1, q.vs) <= lead) { input.brace = true; q.pressed = true; } }, (q, ev) => ev.some((e) => e.type === 'back') || q.s > l.s + 14); return { st, seen }; };
  const flipped = side(null), held = side(0.3), back = flipped.seen.find((e) => e.type === 'back');
  check('taken sideways, the raft goes over: one swims, and is back in it at the last flag — seconds lost, never the run', flipped.st.swims === 1 && !!back && Math.abs(flipped.st.s - course.flags[flipped.st.flag].s) < 3 && flipped.st.clock > K.swim && !flipped.st.over && held.st.swims === 0 && held.st.knocks === 1,
    back ? `back at "${course.flags[back.flag].name}" after ${K.swim} s in the water; braced, sideways: only a knock` : 'not put back');
  const great = course.ledges[course.ledges.length - 1], g = (lead) => { const st = put(great.s - 10, 0, 6); const seen = run(st, 9, (q, input) => { input.y = 1; if (lead !== null && !q.pressed && q.s < great.s && (great.s - q.s) / Math.max(1, q.vs) <= lead) { input.brace = true; q.pressed = true; } }, (q, ev) => ev.some((e) => e.type === 'back' || e.type === 'finish')); return { st, seen }; };
  const g1 = g(0.35), g0 = g(null), air = g1.seen.find((e) => e.type === 'land').t - g1.seen.find((e) => e.type === 'lip').t;
  check('the great fall must be braced: braced at its lip one comes down it and into the lagoon, unbraced one goes over', g1.st.swims === 0 && g1.st.over && g0.st.swims === 1, `${great.h} m, ${air.toFixed(1)} s in the air`);
  // three times over from the same flag: put back at the next
  const m = put(great.s - 10, 0, 6); const backs = run(m, 80, (q, input) => { input.y = 1; }).filter((e) => e.type === 'back');
  check('nobody is left stuck: over three times running from the same flag, one is put back at the next', m.over && backs.length === K.mercy && backs[backs.length - 1].on && m.swims === K.mercy, `${backs.length} times over, then the lagoon`);
  // a great wave
  const w = course.waves.find((q) => q.h >= 1), crest = (w.from + w.to) / 2, wu = (w.u0 + w.u1) / 2;
  const wave = (a) => { const st = put(crest - 6, wu, 6, a); run(st, 3, (q) => { if (q.s < crest) { q.a = a; q.w = 0; q.u = wu; q.vu = 0; } }, (q, ev) => ev.some((e) => e.type === 'wave')); return st; };
  check('a great wave is taken head on: sideways, it turns the raft over', wave(0).swims === 0 && wave(1.4).swims === 1, `${w.h} m`);
  // the hole
  const hole = course.holes[0], hu = (hole.u0 + hole.u1) / 2;
  const inHole = (y, a = 0) => { const st = put(hole.from - 1.5, hu, 4, a); st.nextLedge = course.ledges.findIndex((q) => q.s > hole.from); let t0 = -1, t1 = -1; run(st, 9, (q, input, t) => { input.y = y; if (q.held && t0 < 0) t0 = t; if (!q.held && t0 >= 0 && t1 < 0) t1 = t; }, (q) => q.s > hole.to + 4); return { st, held: t0 >= 0 ? (t1 < 0 ? 9 : t1 - t0) : 0 }; };
  const punch = inHole(1), drifted = inHole(0), sidel = inHole(1, 1.3);
  check('the white boil under a fall holds a raft: straight and paddling one punches through it; adrift one is held, and let go in the end; paddling gets one out sooner', punch.held === 0 && punch.st.holds === 0 && drifted.held > 3 && drifted.held <= K.hole.hold + 0.1 && sidel.held > 0.8 && sidel.held < drifted.held - 1,
    `held ${drifted.held.toFixed(1)} s adrift, ${sidel.held.toFixed(1)} s paddling out of it`);
  const g2 = course.shoals[0], bar = put(g2.from + 2, (g2.u0 + g2.u1) / 2, 6); run(bar, 1.5, (q, input) => { input.y = 1; q.u = (g2.u0 + g2.u1) / 2; q.vu = 0; });
  check('a gravel bar grounds what runs onto it', bar.vs < 2.2, `${bar.vs.toFixed(1)} m/s on it, paddling`);
}

// ---------------------------------------------------------------------------------------------- the others, the starts
{
  let worst = 0; const q = {}, o = {};
  for (let s = 5; s < course.length - 5; s += 7) for (const u of [-3, 0, 3]) { riverPoint(course, s, u, q); const back = riverNear(course, q.x, q.z, 14, o); worst = Math.max(worst, back ? Math.hypot(back.s - s, back.u - u) : 99); }
  const st = put(100, 2, 5, 0.3), pose = raftPose(st), there = riverNear(course, pose.x, pose.z);
  check('the others see one\'s raft where one is: a place of the world is found again on the river, anywhere along it', worst < 0.6 && Math.abs(there.s - 100) < 0.5 && Math.abs(there.u - 2) < 0.3 && riverNear(course, K.gate.x, K.gate.z) === null, `${worst.toFixed(2)} m off at the worst`);
  const a = startRun(course, { wait: 4.2, lane: -2 }), ev = run(a, 6, null);
  check('a start every ten seconds: one waits for it in the Cauldron, counted in, and the clock starts with it', K.every === 10 && ev.filter((e) => e.type === 'tick').map((e) => e.n).join() === '3,2,1' && ev.some((e) => e.type === 'go') && Math.abs(a.clock - 1.8) < 0.05 && a.u === -2, `the clock at ${a.clock.toFixed(2)} s, 1.8 s after the start`);
}

// ---------------------------------------------------------------------------------------------- the crews
let line = '';
{
  const steady = botRun(course, 'steady'), keen = botRun(course, 'keen'), clumsy = botRun(course, 'clumsy'), least = fastest(course);
  const nothing = botRun(course, (st, input) => { input.x = 0; input.y = 0; input.brace = false; }, 400), paddling = botRun(course, (st, input) => { input.x = 0; input.y = 1; input.brace = false; }, 400);
  const margin = Math.min(...steady.margins);
  check('a crew with a person\'s limits — it sees what comes a quarter of a second late — runs the river clean at its first try: never knocked, never over, never held', steady.over && steady.knocks === 0 && steady.swims === 0 && steady.holds === 0, `${sec(steady.time)}, ${steady.braces} braces, ${steady.top.toFixed(1)} m/s at the fastest`);
  check('it never needs a moment narrower than a quarter of a second: a brace holds for more than half a second, and each of its braces came well inside that', K.brace.hold >= 0.5 && steady.braces === steady.saves && steady.wasted === 0 && margin > 0.15 && Math.max(...steady.margins) < K.brace.hold - 0.15, `the brace holds ${K.brace.hold} s; its braces came ${margin.toFixed(2)} to ${Math.max(...steady.margins).toFixed(2)} s before they were needed`);
  check('a clean run takes a minute and a half or so', steady.time > 75_000 && steady.time < 125_000, steady.stretches.filter((q, i) => i % 3 === 0).map((q) => `${q.name} at ${q.t} s`).join(' · '));
  check('the same crew without the delay does no worse, and nobody beats the quickest water paddled flat out', keen.over && keen.knocks === 0 && keen.time < steady.time + 2500 && least < keen.time && least < steady.time, `keen ${sec(keen.time)}; flat out down the quickest water ${sec(least)}`);
  check('a clumsy crew — half a second late, weaving, bracing for one fall in two — gets down it all the same, knocked about and over more than once: seconds lost, never the run', clumsy.over && clumsy.knocks >= 3 && clumsy.swims >= 1 && clumsy.time > steady.time + 15_000, `${sec(clumsy.time)}: ${clumsy.knocks} knocks, ${clumsy.swims} times over`);
  check('nobody wins by doing nothing: adrift, or paddling straight ahead, a raft is knocked from rock to rock and takes far longer', nothing.over && paddling.over && nothing.time > steady.time * 1.8 && paddling.time > steady.time * 1.3 && nothing.knocks > 5 && paddling.knocks > 5, `adrift ${sec(nothing.time)} (${nothing.knocks} knocks, ${nothing.swims} times over); paddling straight ahead ${sec(paddling.time)} (${paddling.knocks} knocks, ${paddling.swims} times over)`);
  const way = raftLine(course);
  let across = 0; for (let i = 1; i < way.line.length; i++) across = Math.max(across, Math.abs(way.line[i] - way.line[i - 1]));
  check('the way down asks nothing a raft cannot do: never more than a quarter of a metre across for a metre down', way.cost[Math.floor(course.flags[0].s) * Math.round(25 / 0.25 + 1) + Math.round(12.5 / 0.25)] < Infinity && across <= 0.2501, `${across.toFixed(2)} m across a metre at the most`);
  const min = Math.floor(least / 1000) * 1000, max = 900_000;
  check('what the board of scores believes is what the river allows', BOARDS.raft.order === 'asc' && BOARDS.raft.min === min && BOARDS.raft.max === max && steady.time > BOARDS.raft.min && nothing.time < BOARDS.raft.max, `server/scores.js: min ${BOARDS.raft.min}, max ${BOARDS.raft.max}`);
  line = `raft: { order: 'asc', min: ${min.toLocaleString('en').replace(/,/g, '_')}, max: ${max.toLocaleString('en').replace(/,/g, '_')} }`;
}

// (the count, then — last — the line for server/scores.js)
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
console.log(line);
process.exit(failed ? 1 : 0);
