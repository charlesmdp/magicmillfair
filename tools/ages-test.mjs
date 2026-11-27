// Checks of War Through the Ages, without a browser: the stage stands in the west meadow on ground that is nearly
// level, clear of the cars' table, its gate on grass one can walk to; the five ages hold together — three robots
// each, a turret, a great blow, prices that rise and gold that keeps pace with them; the six buttons do what they
// say (a price, a time to come back, a door, three places for turrets, the next age when the experience is there,
// a base that keeps its wounds); on the road robots march and fight by themselves — nobody is served first, the
// sturdy ones go in front, shooters shoot over shoulders and bombard a base over those who fight at its gate, a
// turret shoots the first that comes near; every fall is experience for both sides and gold for the other; the
// other general plays by the same rules, keeps a fifth of its gold and holds its council; the same war for the
// same seed, at any frame rate; the player that plays by itself wins with a person's limits, a newcomer wins in
// four or five minutes, a clumsy one usually loses, who hammers one button or does nothing always does; and the
// board of scores is the one these wars give.
// usage: node tools/ages-test.mjs
import { check, done, ground } from './lib/check.mjs';
import { BOARDS as SERVER } from '../server/scores.js';
import { BOUNDS } from '../src/world/layout/layout.js';
import { CARS } from '../src/world/zones/games/cars/rules.js';
import { AGES, W, ERAS, BUTTONS, GENERAL, ACE, NEWCOMER, BOARD, GATE, spot, along, roadOf, startWar, putRobot, offer, press, stepWar, acePlay, newcomerPlay, clumsyPlay, masherPlay, idlePlay, warRun } from '../src/world/zones/games/ages/rules.js';

const STEP = AGES.step, L = W.road, H = AGES.half;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const dpsOf = (d) => d.dmg / d.every;
/** A war in which the other general sleeps (it never looks at the road), with or without the turrets of the start. */
const asleep = (turrets = false) => { const st = startWar(1); st.ai = { next: 1e9 }; if (!turrets) for (const s of st.sides) s.turrets = s.turrets.map(() => null); return st; };
/** Puts a column on the road: `letters` (B S H, the first in front), its first robot `p` metres from its own gate. */
const column = (st, i, letters, p, era = 0) => [...letters].map((c) => { const k = 'BSH'.indexOf(c), d = ERAS[era].units[k]; p -= d.len / 2; const u = putRobot(st, i, era, k, p); p -= d.len / 2 + W.gap; return u; });
/** Runs `st` for `secs` (or until `stop(st)`), `each(st)` before every step. Returns the events, each with its second (`t`). */
const run = (st, secs, each, stop) => { const ev = [], seen = []; for (let t = 0; t < secs - 1e-9 && !st.over; t += STEP) { each?.(st); stepWar(st, STEP, ev); for (const e of ev) seen.push({ ...e, t: st.clock }); ev.length = 0; if (stop?.(st)) break; } return seen; };
const names = (s) => s.units.map((u) => 'BSH'[u.def.k]).join('');
const share = (s) => s.hp / ERAS[s.age].base;
const median = (list) => [...list].sort((a, b) => a - b)[list.length >> 1];

const height = await ground();
{
  // ---- where it stands
  const corners = [[-H.a, -H.v], [H.a, -H.v], [H.a, H.v], [-H.a, H.v]].map(([a, v]) => spot(a, v));
  const inside = (x, z) => { let n = false; for (let i = 0, j = BOUNDS.length - 1; i < BOUNDS.length; j = i++) if ((BOUNDS[j][1] > z) !== (BOUNDS[i][1] > z) && x < ((BOUNDS[i][0] - BOUNDS[j][0]) * (z - BOUNDS[j][1])) / (BOUNDS[i][1] - BOUNDS[j][1]) + BOUNDS[j][0]) n = !n; return n; };
  const xs = corners.map((c) => c.x), zs = corners.map((c) => c.z);
  // (the cars' table with its stand, and the arch where one asks to race: the nearest of the stage to each)
  const edge = []; for (let a = -H.a; a <= H.a; a += 0.5) for (const v of [-H.v, H.v]) edge.push(spot(a, v));
  const table = Math.min(...edge.map((c) => Math.hypot(c.x - Math.max(CARS.at.x - CARS.half.x, Math.min(CARS.at.x + CARS.half.x, c.x)), c.z - Math.max(CARS.at.z - CARS.half.z, Math.min(CARS.stand.z + CARS.stand.d / 2, c.z))))), arch = Math.min(...edge.map((c) => Math.hypot(c.x - CARS.gate.x, c.z - CARS.gate.z)));
  check('the stage and its gate are in the west meadow, inside what one can walk, clear of the cliff and of the cars\' table', corners.every((c) => inside(c.x, c.z)) && inside(GATE.x, GATE.z) && Math.min(...xs) > -271 && Math.max(...xs) < -245 && Math.min(...zs) > -40 && Math.max(...zs) < 3 && table > 9 && arch > 12 && GATE.x < -236 && Math.hypot(GATE.x - CARS.gate.x, GATE.z - CARS.gate.z) > 25,
    `x ${Math.min(...xs).toFixed(1)} … ${Math.max(...xs).toFixed(1)}, z ${Math.min(...zs).toFixed(1)} … ${Math.max(...zs).toFixed(1)}; ${table.toFixed(1)} m from the cars' table, ${arch.toFixed(1)} m from its arch; the gate at (${GATE.x.toFixed(1)}, ${GATE.z.toFixed(1)})`);
  let lo = 99, hi = -99; for (let a = -H.a; a <= H.a; a += 0.5) for (let v = -H.v; v <= H.v; v += 0.5) { const p = spot(a, v), h = height(p.x, p.z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  check('the ground under it is nearly level, not quite: its top is level, over the grass everywhere', hi - lo < 1 && lo > 28 && AGES.rise >= 0.5 && H.a * 2 >= 30 && H.a * 2 <= 40, `the grass ${lo.toFixed(2)} to ${hi.toFixed(2)} m under a stage ${H.a * 2} m long and ${H.v * 2} m deep; its top at ${(hi + AGES.rise).toFixed(2)} m`);
  const hg = height(GATE.x, GATE.z), tilt = Math.max(...[[1.7, 0], [-1.7, 0], [0, 1.2], [0, -1.2]].map(([ax, az]) => Math.abs(height(GATE.x + ax, GATE.z + az) - hg)));
  const looks = Math.atan2(AGES.at.x - GATE.x, AGES.at.z - GATE.z), off = Math.abs(Math.atan2(Math.sin(looks - GATE.yaw), Math.cos(looks - GATE.yaw)));
  // (the way there from the cars' arch: grass all along, no step)
  let step = 0; for (let n = 0; n < 60; n++) { const f = n / 60, g = (n + 1) / 60, ax = CARS.gate.x + (GATE.x - CARS.gate.x) * f, az = CARS.gate.z + (GATE.z - CARS.gate.z) * f, bx = CARS.gate.x + (GATE.x - CARS.gate.x) * g, bz = CARS.gate.z + (GATE.z - CARS.gate.z) * g; step = Math.max(step, Math.abs(height(ax, az) - height(bx, bz)) / Math.hypot(bx - ax, bz - az)); }
  check('the gate is on grass one can walk to, level, and looks at the middle of the stage from well in front of it', hg > 20 && tilt < 0.35 && off < 0.02 && AGES.gate.v > H.v + 12 && step < 0.35, `${hg.toFixed(2)} m, ${tilt.toFixed(2)} m of tilt under the arch, ${(AGES.gate.v - H.v).toFixed(1)} m in front of the stage; from the cars' arch the grass never climbs more than ${(step * 100).toFixed(0)} %`);
  const ends = [spot(along(0), 0), spot(along(L), 0)];
  check('the road runs along the stage, a base at each end: one\'s own on the left of who looks from the gate', Math.abs(along(0) + L / 2) < 1e-9 && Math.abs(along(L) - L / 2) < 1e-9 && H.a - L / 2 >= 5 && roadOf(1, 0) === L && roadOf(0, 3) === 3 && roadOf(1, 3) === L - 3 && (ends[0].x - GATE.x) * Math.cos(GATE.yaw) - (ends[0].z - GATE.z) * Math.sin(GATE.yaw) > 0, `${L} m from gate to gate, ${(H.a - L / 2).toFixed(0)} m of stage for each base`);
}
{
  // ---- the five ages
  const kinds = ERAS.every((e) => e.units.length === 3 && e.units[0].cost < e.units[1].cost && e.units[1].cost < e.units[2].cost && e.units[1].hp < e.units[0].hp && e.units[0].hp < e.units[2].hp && !e.units[0].range && e.units[1].range > 4 && e.units[2].speed <= 2.4 && e.units[2].len > e.units[0].len);
  check('five ages, each with a brawler, a shooter and a heavy one: the brawler the cheapest, the shooter the frailest and the only one with a long arm to begin with, the heavy one the dearest and the sturdiest', ERAS.length === 5 && BUTTONS.length === 6 && kinds && !ERAS[0].units[2].range && !ERAS[1].units[2].range && ERAS.slice(2).every((e) => e.units[2].range > 2 && e.units[2].range < e.units[1].range),
    ERAS.map((e) => `${e.name}: ${e.units.map((u) => `${u.name} ${u.cost}`).join(', ')}`).join(' · '));
  const up = ERAS.slice(1).map((e, n) => [0, 1, 2].map((k) => [e.units[k].cost / ERAS[n].units[k].cost, e.units[k].hp / ERAS[n].units[k].hp, dpsOf(e.units[k]) / dpsOf(ERAS[n].units[k])]));
  const flat = up.flat(2);
  check('from an age to the next every robot is about twice as strong — it holds twice as much and hits twice as hard — for a little over twice the price', flat.every((r) => r > 1.75 && r < 2.4) && up.every((age) => age.every(([c, h, d]) => h * d > c * 1.4)), `prices × ${Math.min(...up.flat().map((r) => r[0])).toFixed(2)} … ${Math.max(...up.flat().map((r) => r[0])).toFixed(2)}, what they hold × ${Math.min(...up.flat().map((r) => r[1])).toFixed(2)} … ${Math.max(...up.flat().map((r) => r[1])).toFixed(2)}, what they hit × ${Math.min(...up.flat().map((r) => r[2])).toFixed(2)} … ${Math.max(...up.flat().map((r) => r[2])).toFixed(2)}`);
  const pace = ERAS.map((e) => e.units[0].cost / e.income);
  check('gold keeps pace with the prices: at every age a brawler is some three seconds of it, a heavy one a quarter of a minute or so', pace.every((s) => s > 2.4 && s < 3.4) && ERAS.every((e) => e.units[2].cost / e.income > 12 && e.units[2].cost / e.income < 20), ERAS.map((e, n) => `${e.income} a second: ${pace[n].toFixed(1)} s, ${(e.units[2].cost / e.income).toFixed(0)} s`).join(' · '));
  check('a turret and a great blow an age: the turret reaches further than any shooter and costs some five brawlers; the blow fells the brawlers and the shooters of its age, not the heavy one', ERAS.every((e) => e.turret.range > e.units[1].range && e.turret.cost > 4 * e.units[0].cost && e.turret.cost < 6 * e.units[0].cost && e.blow.dmg >= e.units[0].hp && e.blow.dmg < e.units[2].hp / 3) && new Set(ERAS.map((e) => e.blow.name)).size === 5,
    ERAS.map((e) => `${e.turret.name} ${e.turret.cost} · ${e.blow.name}`).join(' | '));
  check('the bases grow with the ages, a little less quickly than what hits them; the experience an age asks for grows with the prices', ERAS.every((e, n) => !n || (e.base > ERAS[n - 1].base * 1.5 && e.base < ERAS[n - 1].base * 1.9)) && ERAS.slice(0, 4).every((e, n) => e.need > 0 && (!n || e.need > ERAS[n - 1].need * 1.9)) && ERAS[4].need === 0, ERAS.map((e) => `${e.base}`).join(' → ') + ` · experience ${ERAS.slice(0, 4).map((e) => e.need).join(', ')}`);
}
{
  // ---- the six buttons
  const st = asleep(true), s = st.sides[0], d = ERAS[0].units;
  const start = { gold: s.gold, lit: [0, 1, 2, 3, 4, 5].map((b) => offer(st, 0, b).ok), turrets: s.turrets.map((t) => (t ? t.era : '-')).join('') };
  check('a war begins with a little gold, a first turret on each base, and nothing else: the brawler and the shooter can be paid for, not the heavy one, nor a second turret; no great blow yet, no next age', start.gold === W.gold && start.lit.join() === 'true,true,false,false,false,false' && start.turrets === '0--' && st.sides[1].turrets[0]?.era === 0 && share(s) === 1 && !s.units.length, `${start.gold} gold; lit: ${BUTTONS.filter((_, b) => start.lit[b]).join(', ')}`);
  const bought = press(st, 0, 0), after = s.gold, again = press(st, 0, 0), fill0 = offer(st, 0, 0).fill;
  run(st, d[0].back / 2); const half = offer(st, 0, 0).fill;
  run(st, d[0].back / 2 + STEP * 2); const back = offer(st, 0, 0);
  check('a button takes its price at once, and is there again after its own time: it fills meanwhile', bought && Math.abs(after - (W.gold - d[0].cost)) < 1e-9 && !again && fill0 === 0 && Math.abs(half - 0.5) < 0.02 && back.fill === 1 && back.ok, `the brawler: ${d[0].cost} gold, back after ${d[0].back} s (half-way after ${(d[0].back / 2).toFixed(1)} s)`);
  // (the door, and the most one may have at once)
  const rich = asleep(); rich.sides[0].gold = 1e6;
  const door = []; for (let n = 0; n < 8; n++) { rich.sides[0].cool.fill(0); door.push(press(rich, 0, 0)); }
  const waiting = rich.sides[0].door.length, why = offer(rich, 0, 0).why;
  run(rich, 30, (q) => { q.sides[0].cool.fill(0); press(q, 0, 0); });
  const most = rich.sides[0].units.length + rich.sides[0].door.length, gaps = rich.sides[0].units.slice(1).map((u, n) => rich.sides[0].units[n].p - u.p);
  check('robots come out of the door one after the other — four may wait inside — and a side never has more than ten at once; on the road they keep their distance', door.join() === 'true,true,true,true,false,false,false,false' && waiting === W.door && why === 'full' && most === W.cap && gaps.every((g) => g >= d[0].len + W.gap - 1e-6), `${waiting} waiting, then "${why}"; ${most} at the most; never nearer than ${Math.min(...gaps).toFixed(2)} m from middle to middle`);
  // (turrets: three places)
  const t = asleep(true), ts = t.sides[0]; ts.gold = 1e6;
  const places = []; for (let n = 0; n < 4; n++) { ts.cool.fill(0); places.push(press(t, 0, 3)); }
  const full = offer(t, 0, 3).why, had = ts.turrets.map((q) => q.era).join('');
  ts.xp = ERAS[0].need; press(t, 0, 5); ts.cool.fill(0);
  const renew = press(t, 0, 3), now1 = ts.turrets.map((q) => q.era).join('');
  check('a base carries three turrets: the fourth is refused — until a new age, whose turret takes the place of the oldest', places.join() === 'true,true,false,false' && full === 'full' && had === '000' && renew && now1.split('').sort().join('') === '001' && Math.abs(1e6 - 2 * ERAS[0].turret.cost - ERAS[1].turret.cost - ts.gold) < 1, `places ${had} → ${now1}`);
  // (the next age)
  const a = asleep(), as = a.sides[0]; as.hp = ERAS[0].base * 0.6; as.xp = ERAS[0].need - 1;
  const early = press(a, 0, 5); as.xp += 21;
  const fillA = offer(a, 0, 5).fill, went = press(a, 0, 5);
  check('the next age: not before the experience is there; then its robots, its turret, its blow and its gold are one\'s own, what was over is kept, and the base keeps its wounds as a share', !early && fillA === 1 && went && as.age === 1 && Math.abs(as.xp - 20) < 1e-9 && Math.abs(share(as) - 0.6) < 1e-9 && offer(a, 0, 0).name === ERAS[1].units[0].name && offer(a, 0, 3).name === ERAS[1].turret.name && offer(a, 0, 4).name === ERAS[1].blow.name && offer(a, 0, 5).name === ERAS[2].name,
    `${ERAS[0].name} → ${ERAS[1].name}: a base at 60 % stays at 60 % (${Math.round(as.hp)} of ${ERAS[1].base})`);
  const last = asleep(); last.sides[0].age = 4; last.sides[0].xp = 1e9;
  check('there is no age after the atom', !press(last, 0, 5) && offer(last, 0, 5).why === 'last' && !press(last, 0, 6) && !press(last, 0, -1));
  // (the great blow)
  const g = asleep(), gs = g.sides[0];
  const [b1, s1, h1] = column(g, 1, 'BSH', 8); h1.p = 3; // (three of the others on the road, far apart from nobody)
  const soon = press(g, 0, 4);
  run(g, W.blowFirst + STEP);
  const called = press(g, 0, 4), hpBefore = [b1.hp, s1.hp, h1.hp], seen = run(g, W.fuse + 0.1, null), fell = seen.filter((e) => e.type === 'fall').length, strike = seen.find((e) => e.type === 'strike');
  const twice = press(g, 0, 4); run(g, W.blowBack - W.fuse - 0.2); const notYet = offer(g, 0, 4).ok; run(g, 0.2); const there = offer(g, 0, 4).ok;
  check('the great blow is not there at once; called, it falls a moment later on every robot the other has on the road — the brawler and the shooter fall, the heavy one is hurt — and comes back slowly', !soon && called && strike && Math.abs(strike.t - (W.blowFirst + STEP + W.fuse)) < 0.05 && strike.n === 3 && fell === 2 && h1.hp === hpBefore[2] - ERAS[0].blow.dmg && g.sides[1].units.length === 1 && !twice && !notYet && there && gs.gold > W.gold,
    `first after ${W.blowFirst} s, ${W.fuse} s to fall, back after ${W.blowBack} s; ${ERAS[0].blow.name}: ${ERAS[0].blow.dmg} to each — the ${ERAS[0].units[2].name} keeps ${h1.hp} of ${hpBefore[2]}`);
}
{
  // ---- the road
  const walk = asleep(), w = putRobot(walk, 0, 0, 0, W.out), d = w.def, hp0 = walk.sides[1].hp;
  const seen = run(walk, 30, null, (q) => q.sides[1].hp < hp0), first = seen.find((e) => e.type === 'base'), due = (L - d.len / 2 - W.out) / d.speed;
  run(walk, 4);
  check('a robot marches along the road by itself, and hits the other\'s base when nobody stands before it', first && first.side === 1 && Math.abs(first.t - due) < 0.5 && Math.abs(w.p - (L - d.len / 2)) < 1e-6 && Math.abs(hp0 - walk.sides[1].hp - Math.round(4.2 / d.every + 1) * d.dmg) <= d.dmg && walk.sides[0].hp === ERAS[0].base, `the ${d.name}: ${due.toFixed(1)} s from its gate to the other's; ${Math.round(hp0 - walk.sides[1].hp)} taken off the base in the four seconds after`);
  // (nobody is served first: the same columns, face to face, fall together)
  const even = ['B', 'BS', 'HSS', 'BBSH'].map((c) => { const q = asleep(); column(q, 0, c, 11); column(q, 1, c, 11); run(q, 90, null, (z) => !z.sides[0].units.length || !z.sides[1].units.length); return q.sides[0].units.length + q.sides[1].units.length; });
  check('nobody is served first: the same column on both sides, face to face, and the last of each falls at the same instant', even.every((n) => n === 0), 'B, BS, HSS and BBSH against themselves: nobody left standing on either side');
  // (the sturdy ones go in front)
  const sort = asleep(); column(sort, 0, 'SSBH', L - 2);
  run(sort, 1.2); const soon = names(sort.sides[0]);
  run(sort, 5);
  const sorted = names(sort.sides[0]), ps = sort.sides[0].units.map((u) => u.p);
  check('the sturdy ones go in front by themselves, wherever a column closes up: a brawler steps past a shooter, a heavy one past whatever is lighter', soon === 'BSSH' && sorted === 'HBSS' && ps.every((p, n) => !n || p < ps[n - 1] - 0.9) && Math.abs(ps[0] - (L - ERAS[0].units[2].len / 2)) < 1e-6, `shooter, shooter, brawler, heavy one at the other's gate — a second later: ${soon}; six seconds later: ${sorted}`);
  // (what a column is worth: the first fights, the shooters behind it shoot over its shoulders)
  const duel = (mine, theirs) => { const q = asleep(); column(q, 0, mine, 11); column(q, 1, theirs, 11); run(q, 120, null, (z) => !z.sides[0].units.length || !z.sides[1].units.length); return [names(q.sides[0]), names(q.sides[1])]; };
  const price = (c) => [...c].reduce((n, x) => n + ERAS[0].units['BSH'.indexOf(x)].cost, 0);
  const mob = asleep(); column(mob, 0, 'BBBBBB', 11); column(mob, 1, 'H', 11);
  const blows = run(mob, 60, null, (z) => !z.sides[0].units.length || !z.sides[1].units.length).filter((e) => e.type === 'hit' && e.side === 0), took = mob.clock, B0 = ERAS[0].units[0];
  const d2 = [names(mob.sides[0]), names(mob.sides[1])], d3 = duel('SSSS', 'H'), d4 = duel('HSSS', 'HH'), d5 = duel('HSS', 'BBSSS');
  check('only the first of a column fights hand to hand: six brawlers hit a heavy one no more often than one would, and do not bring it down, though they cost as much; nor do four shooters without anybody before them', blows.length <= took / B0.every + 6 && blows.length > 15 && d2[0] === '' && d2[1] === 'H' && price('BBBBBB') === price('H') && d3[0] === '' && d3[1] === 'H',
    `six brawlers (${price('BBBBBB')} gold) against a heavy one (${price('H')}): ${blows.length} blows in ${took.toFixed(0)} s — one every ${B0.every} s —, and the heavy one stands`);
  check('shooters behind a sturdy one shoot over its shoulders: a heavy one with three shooters brings down two heavy ones without losing a robot, and with two shooters a column of five that costs nearly as much', d4[1] === '' && d4[0] === 'HSSS' && d5[1] === '' && d5[0] === 'HSS' && price('HSSS') < price('HH'),
    `HSSS (${price('HSSS')} gold) against HH (${price('HH')}): ${d4[0]} left; HSS (${price('HSS')}) against BBSSS (${price('BBSSS')}): ${d5[0]} left`);
  // (at the gate: the shooters bombard the base over those who fight there)
  const siege = asleep(); column(siege, 0, 'BSS', L - 0.2);
  run(siege, 1.5); const guard = putRobot(siege, 1, 0, 2, W.out), base0 = siege.sides[1].hp, hpG = guard.hp;
  const sg = run(siege, 3), onBase = sg.filter((e) => e.type === 'land' && !e.shot.at).length, onGuard = sg.filter((e) => e.type === 'land' && e.shot.at === guard).length, clubbed = sg.filter((e) => e.type === 'hit' && e.side === 0 && e.at === guard).length, rammed = sg.filter((e) => e.type === 'hit' && e.side === 0 && !e.at).length;
  check('at the gate the brawler fights whoever comes out, and the shooters bombard the base over their heads', onBase >= 4 && onGuard === 0 && clubbed >= 2 && rammed === 0 && Math.abs(base0 - siege.sides[1].hp - onBase * ERAS[0].units[1].dmg) < 1e-6 && guard.hp === hpG - clubbed * ERAS[0].units[0].dmg, `in three seconds: ${onBase} stones on the base, none on the heavy one that came out; the brawler hit it ${clubbed} times, the base never`);
  // (a turret)
  const tur = asleep(true); tur.sides[0].turrets = tur.sides[0].turrets.map(() => null);
  const T = ERAS[0].turret, prey = putRobot(tur, 0, 0, 2, W.out); let farthest = 0, firstShot = null;
  const ts = run(tur, 40, null, (q) => { const e = q.shots.find((x) => x.turret >= 0); if (e && !firstShot) { firstShot = L - prey.p - prey.def.len / 2; } return prey.hp < prey.def.hp - 3 * T.dmg; });
  for (const e of ts) if (e.type === 'shot' && e.shot.turret >= 0) farthest = Math.max(farthest, 1);
  const hits = ts.filter((e) => e.type === 'land' && e.shot.turret >= 0 && e.hurt).length;
  check('a turret shoots the first of the others once it is within its reach of the gate, not before', farthest === 1 && firstShot !== null && firstShot <= T.range + 1e-6 && firstShot > T.range - 0.3 && hits >= 3 && prey.hp === prey.def.hp - hits * T.dmg, `the ${T.name}: its first rock when the ${prey.def.name} was ${firstShot?.toFixed(2)} m from the gate (it reaches ${T.range} m)`);
  // (what a fall gives)
  const fall = asleep(), f0 = fall.sides[0], f1 = fall.sides[1]; column(fall, 0, 'H', 11); const victim = column(fall, 1, 'S', 11)[0];
  const g0 = f0.gold, g1 = f1.gold; let at = 0;
  run(fall, 20, null, (q) => { at = q.clock; return !q.sides[1].units.length; });
  const inc = ERAS[0].income * at, c = victim.def.cost;
  check('a robot that falls is experience for both sides — as much as it cost — and gold for the other side only: a share of its price', Math.abs(f0.xp - c) < 1e-9 && Math.abs(f1.xp - c) < 1e-9 && Math.abs(f0.gold - g0 - inc - Math.round(c * W.bounty)) < 0.01 && Math.abs(f1.gold - g1 - inc) < 0.01 && f0.felled === 1 && f1.lost === 1, `a ${victim.def.name} (${c} gold) falls: ${c} of experience each, ${Math.round(c * W.bounty)} gold for who felled it`);
}
{
  // ---- the other general
  const wars = [1, 2, 3, 4, 5, 6].map((seed) => { const st = startWar(seed), ev = [], log = { ready: [], aged: [], turrets: [], most: 0, least: 1e9, worst: 0, presses: 0, last: -1, quickest: 9 }; let owed = false;
    while (!st.over && st.clock < GENERAL.bold - 1) {
      newcomerPlay(st); stepWar(st, STEP, ev);
      const s = st.sides[1];
      if (!owed && s.age < 4 && s.xp >= ERAS[s.age].need) { owed = true; log.ready.push(st.clock); }
      for (const e of ev) { if (e.side !== 1) continue; if (e.type === 'age') { log.aged.push(st.clock); owed = false; } if (e.type === 'turret') log.turrets.push(e.era); if (['buy', 'turret', 'blow', 'age'].includes(e.type)) { if (log.last >= 0) log.quickest = Math.min(log.quickest, st.clock - log.last); log.last = st.clock; log.presses++; } }
      ev.length = 0;
      log.most = Math.max(log.most, s.units.length + s.door.length); log.least = Math.min(log.least, s.gold); log.worst = Math.max(log.worst, s.spent / s.earned);
    }
    return { st, log }; });
  const waits = wars.flatMap(({ log }) => log.aged.map((t, n) => t - log.ready[n]));
  const income = wars.every(({ st }) => { const s = st.sides[1]; return Math.abs(s.gold + s.spent - s.earned) < 1e-6; });
  check('the other general plays by the same rules: it pays for what it sends, never has more than ten robots, and what it has spent and what it has left make what it got', income && wars.every(({ log }) => log.most <= W.cap && log.least >= 0 && log.presses > 20), `${wars.map(({ log }) => log.presses).join(', ')} buttons pressed in ${wars.length} wars`);
  check('it looks at the road about once a second: never two buttons in less than three quarters of a second', wars.every(({ log }) => log.quickest >= GENERAL.every * 0.8 - 1e-6), `never less than ${Math.min(...wars.map(({ log }) => log.quickest)).toFixed(2)} s between two of its buttons`);
  check('it is cautious: a fifth of its gold stays in its coffers, and it holds a long council before each new age — the experience is there for both sides at about the same moment', wars.every(({ log }) => log.worst <= GENERAL.thrift + 0.02) && waits.length >= 10 && waits.every((w) => w >= GENERAL.council - 1e-6 && w < GENERAL.council + 3), `never more than ${(Math.max(...wars.map(({ log }) => log.worst)) * 100).toFixed(0)} % of its gold spent; ${waits.length} new ages, each ${Math.min(...waits).toFixed(1)} to ${Math.max(...waits).toFixed(1)} s after it could`);
  check('it builds turrets as the ages come — one an age at the most, the first in the stone age: it waits for the price of each, and may be in the next age before it has it', wars.every(({ st, log }) => new Set(log.turrets).size === log.turrets.length && log.turrets[0] === 0 && log.turrets.length >= st.sides[1].age - 1 && st.sides[1].turrets.every((t) => t)), wars.map(({ log }) => log.turrets.map((n) => ERAS[n].id).join(', ')).join(' · '));
  // (after `bold` seconds it holds nothing back)
  // (a war that is made to last: both bases mended at every step)
  const late = startWar(3), lv = []; let told = null, before = 0, council = [], owed = 0;
  while (!late.over && late.clock < GENERAL.bold + 90) {
    newcomerPlay(late); stepWar(late, STEP, lv);
    const s = late.sides[1];
    if (!owed && s.age < 4 && s.xp >= ERAS[s.age].need) owed = late.clock;
    for (const e of lv) { if (e.type === 'bold') { told = late.clock; before = s.spent / s.earned; } if (e.type === 'age' && e.side === 1) { if (told) council.push(late.clock - Math.max(owed, told)); owed = 0; } }
    lv.length = 0;
    for (const q of late.sides) q.hp = ERAS[q.age].base;
    if (late.clock < GENERAL.bold - 20 && late.sides[1].age > 2) { late.sides[1].age = 2; late.sides[1].xp = 0; } // (…and the other side kept from the last ages until then, so that one is left for it to take)
  }
  const s1 = late.sides[1];
  check('after six minutes of war it has learnt: its coffers are spent on heavy ones and shooters, and it holds no council any more', told !== null && Math.abs(told - GENERAL.bold) < 2 && before <= GENERAL.thrift + 0.02 && s1.spent / s1.earned > before + 0.05 && council.length >= 1 && council.every((w) => w < 5), `told at ${told?.toFixed(0)} s; it had spent ${(100 * before).toFixed(0)} % of all it ever got, ${(100 * s1.spent / s1.earned).toFixed(0)} % a minute and a half later; its next age ${council.map((w) => w.toFixed(1)).join(', ')} s after it could`);
  const a = warRun(7), b = warRun(7), c = warRun(8), same = (x, y) => x.time === y.time && x.clock === y.clock && x.state.sides.every((s, i) => s.gold === y.state.sides[i].gold && s.hp === y.state.sides[i].hp && s.sent === y.state.sides[i].sent);
  check('the same war for the same seed, another for another', same(a, b) && !same(a, c) && a.won && c.won, `seed 7: ${fmt(a.time / 1000)}; seed 8: ${fmt(c.time / 1000)}`);
  const at = (dt) => { const st = startWar(5); let acc = 0; for (let t = 0; t < 400 && !st.over; t += dt) { acc += dt; while (acc >= STEP && !st.over) { acc -= STEP; acePlay(st); stepWar(st, STEP, null); } } return [st.time, st.sides[0].gold.toFixed(6), st.sides[1].sent].join(); };
  check('the same war at 30 and at 144 frames a second', at(1 / 30) === at(1 / 144) && Number(at(1 / 30).split(',')[0]) > 0);
}
{
  // ---- wars
  const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
  // (the hand of the player that plays by itself: how often it presses, how late it acts)
  const hand = (() => { const st = startWar(2), ev = []; let last = -1, quickest = 9, n = 0, most = 0, sec = -1, inSec = 0; while (!st.over) { acePlay(st); stepWar(st, STEP, ev); for (const e of ev) if (e.side === 0 && ['buy', 'turret', 'blow', 'age'].includes(e.type)) { n++; if (last >= 0) quickest = Math.min(quickest, st.clock - last); last = st.clock; const s = Math.floor(st.clock); if (s === sec) inSec++; else { sec = s; inSec = 1; } most = Math.max(most, inSec); } ev.length = 0; } return { n, quickest, most, secs: st.clock }; })();
  check('the player that plays by itself has a person\'s limits: it looks three times a second, acts on what it saw the time before, and presses one button at a time', Math.abs(ACE.every - 1 / 3) < 1e-9 && hand.quickest >= ACE.every - 1e-6 && hand.most <= 3 && hand.n > 15, `${hand.n} buttons in ${hand.secs.toFixed(0)} s: never two in less than ${hand.quickest.toFixed(2)} s, three in a second at the most`);
  const ace = SEEDS.map((s) => warRun(s)), aceT = ace.map((r) => r.clock);
  check('it wins every war, in two or three minutes, its base hardly touched', ace.every((r) => r.won && r.time === Math.round(r.clock * 1000) && r.clock > 110 && r.clock < 215 && share(r.state.sides[0]) > 0.9), `${ace.length} wars: ${fmt(Math.min(...aceT))} to ${fmt(Math.max(...aceT))}, half of them under ${fmt(median(aceT))}`);
  const agesAce = ace.map((r) => r.state.sides[0].age);
  check('… a shooter, a heavy one, in turn — the heavy ones in front, the shooters bombarding: it has reached the powder age when the other base falls, and built two turrets on the way', ace.every((r, n) => agesAce[n] >= 2 && r.events.turret >= 2 && r.events.blow >= 2 && r.state.sides[0].felled > r.state.sides[0].lost), `ages reached: ${[...new Set(agesAce)].sort().map((n) => ERAS[n].name).join(', ')}; ${Math.round(ace.reduce((n, r) => n + r.state.sides[0].sent, 0) / ace.length)} robots sent a war`);
  const slow = SEEDS.map((s) => warRun(s, newcomerPlay)), slowT = slow.filter((r) => r.won).map((r) => r.clock);
  check('a newcomer — one look a second, a brawler, a shooter, now and then a heavy one, slow to see what is lit — wins too, in four or five minutes: in the atom age', slow.filter((r) => r.won).length >= 38 && median(slowT) > 235 && median(slowT) < 305 && Math.min(...slowT) > Math.max(180, median(aceT)) && Math.max(...slowT) < GENERAL.bold + 60 && slow.filter((r) => r.won && r.state.sides[0].age === 4).length >= 30 && NEWCOMER.every >= 1,
    `${slow.filter((r) => r.won).length} of ${slow.length} won: ${fmt(Math.min(...slowT))} to ${fmt(Math.max(...slowT))}, half of them under ${fmt(median(slowT))}`);
  const clumsy = SEEDS.map((s) => warRun(s, clumsyPlay)), cw = clumsy.filter((r) => r.won);
  check('a clumsy one — any of the six buttons, lit or not, every two seconds or so — usually loses: the other general has learnt before it is through', cw.length <= 6 && clumsy.filter((r) => r.over && !r.won && !r.out).length >= 28 && clumsy.every((r) => r.over), `${cw.length} of ${clumsy.length} won${cw.length ? ` (${cw.map((r) => fmt(r.clock)).join(', ')})` : ''}; ${clumsy.filter((r) => !r.won && !r.out).length} lost their base, ${clumsy.filter((r) => r.out).length} called off`);
  const masher = SEEDS.slice(0, 20).map((s) => warRun(s, masherPlay)), idle = SEEDS.slice(0, 20).map((s) => warRun(s, idlePlay));
  check('who hammers the first button and nothing else loses every war: brawlers alone do not bring a base down, and the other side passes to the next age', masher.every((r) => r.over && !r.won && !r.out && r.time === 0 && r.state.sides[0].age === 0 && r.state.sides[1].age >= 1), `lost in ${fmt(Math.min(...masher.map((r) => r.clock)))} to ${fmt(Math.max(...masher.map((r) => r.clock)))}`);
  check('nothing is won by doing nothing: the base falls in two minutes, and there is no score', idle.every((r) => r.over && !r.won && r.time === 0 && r.clock > 75 && r.clock < 130 && r.state.sides[0].hp === 0 && r.state.sides[0].sent === 0), `lost in ${fmt(Math.min(...idle.map((r) => r.clock)))} to ${fmt(Math.max(...idle.map((r) => r.clock)))}`);
  // (a war nobody wins is called off)
  const still = asleep(); still.clock = W.limit - 1; const off = run(still, 3);
  check('a war that is not over after a quarter of an hour is called off: no score', still.over && still.out && !still.won && still.time === 0 && off.some((e) => e.type === 'off') && Math.abs(still.clock - W.limit) < 0.02);
  // (hands that press anything at any moment: the war stays sane and has an end)
  const rnd = (n, k) => { const v = Math.sin(n * 127.1 + k * 311.7 + 74.7) * 43758.5453; return v - Math.floor(v); };
  let astray = 0, ended = 0, wonWild = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const st = startWar(seed); let k = 0;
    while (!st.over) {
      if (rnd(seed, k++) < 0.2) press(st, 0, Math.floor(rnd(seed, k++) * 8) - 1);
      stepWar(st, STEP * (1 + Math.floor(rnd(seed, k++) * 4)), null);
      for (const s of st.sides) if (!(s.gold >= 0) || !(s.hp >= 0 && s.hp <= ERAS[s.age].base + 1e-6) || s.units.length + s.door.length > W.cap || s.door.length > W.door || s.turrets.length !== W.places || s.units.some((u) => !(u.p >= W.out - 1e-9 && u.p <= L) || !(u.hp > 0)) || !Number.isFinite(s.xp)) astray++;
    }
    if (st.over) ended++; if (st.won) wonWild++;
  }
  check('forty hands that press anything at any moment: the gold never goes under nothing, no robot leaves the road, no base holds more than it can, every war has an end', astray === 0 && ended === 40, `${wonWild} of them won`);
  // ---- the board of scores
  // (the quickest victory of many ways of playing: an order of robots, a turret or none, a great blow sooner or later)
  let quickest = Infinity, tried = 0, wonWays = 0;
  for (let n = 0; n < 160; n++) {
    const r = (k) => rnd(n + 0.5, k), pick = (k, list) => list[Math.floor(r(k) * list.length)];
    const order = Array.from({ length: 1 + Math.floor(r(1) * 4) }, (_, i) => pick(10 + i, [0, 1, 1, 1, 2, 2]));
    const o = { every: 1 / 3, blowMin: pick(2, [2, 3, 4, 5]), blowWorth: pick(3, [0, 2, 4]), near: pick(4, [0, 0.3, 0.7, 1]), turrets: [0, 1, 2, 3, 4].map((a) => (r(20 + a) < 0.25 ? 1 : 0)), turretAt: pick(5, [5, 25]), saveFrom: pick(6, [0.3, 2]), order: [order] };
    for (const seed of [3, 11]) { const w = warRun(seed, (st) => acePlay(st, o), 240); tried++; if (w.won) { wonWays++; quickest = Math.min(quickest, w.clock); } }
  }
  // (what the rules alone forbid: all that can hit a base at once — the first of a column and the shooters whose
  // arm reaches over it —, no age before the experience for it can exist, nobody at the gate before it has walked
  // there; so much of the smallest base a second, at the very most)
  const reach = ERAS.map((e) => Math.max(...[0, 1, 2].map((f) => { const sh = e.units[1]; let d = e.units[f].len + W.gap, n = 0; while (d <= sh.range + 1e-9) { n++; d += sh.len + W.gap; } return dpsOf(e.units[f]) + n * dpsOf(sh); })));
  const fastest = Math.max(...ERAS.flatMap((e) => e.units.map((u) => u.speed)));
  let floor = (L - W.out - 0.45) / fastest, left = ERAS[0].base, fallen = 2 * W.gold / (1 - W.bounty), age = 0, t = 0;
  const needs = ERAS.map((_, n) => ERAS.slice(0, n).reduce((x, e) => x + e.need, 0));
  for (; left > 0; t += 0.01) { fallen += (2 * ERAS[age].income / (1 - W.bounty)) * 0.01; while (age < 4 && fallen >= needs[age + 1]) age++; if (t >= floor) left -= reach[age] * 0.01; }
  floor = t;
  const line = { order: 'asc', min: BOARD.min, max: W.limit * 1000 };
  check('the board of scores in rules.js is the one these wars give: its least is over what the rules alone forbid and well under the quickest victory ever found, its most the second a war is called off', BOARD.order === 'asc' && BOARD.max === W.limit * 1000 && BOARD.min / 1000 > floor && BOARD.min / 1000 < 0.75 * Math.min(quickest, ...aceT) && BOARD.max > Math.max(...slowT) * 1000 && wonWays > 60,
    `whatever one does a base cannot fall before ${floor.toFixed(0)} s; the quickest of ${tried} wars played ${tried / 2} other ways: ${fmt(quickest)} (${wonWays} won in four minutes); ${JSON.stringify(BOARD)}`);
  { const S = SERVER.ages || {}; check('the server keeps its board by the same line (server/scores.js), behind its switch', S.order === BOARD.order && S.min === BOARD.min && S.max === BOARD.max && S.release === 'ages', JSON.stringify(S)); }
  console.log(`      for the board of scores: ages: { order: 'asc', min: ${String(line.min).replace(/000$/, '_000')}, max: ${String(line.max).replace(/000$/, '_000')} }`);
}
done();
