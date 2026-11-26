// Checks of Harbor Heaven, without a browser: the course lies on water deep enough, clear of the bank, of the
// deck and of The Endless Pond; a boat is driven as it should be — it gathers way, turns, slides, bounces off
// the bank and the buoys, has its burst —; the gates are taken in order, between their buoys; the boats that
// sail by themselves get round three laps without running aground, the better ones sooner; it is the same race
// on every device. And, since one races with the others: a start every ten seconds, with a name, joined until
// the last moment; the visitors abreast behind the line; the boats that sail by themselves the same for
// everybody of one start whatever a visitor does to them, a little different from one start to the next, each
// 2 % slower than it first was; a race that is where the shared clock says, however the screen stutters; what
// is said of a boat to the others.
// usage: node tools/boats-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { REGATTA, course, lineAt, startRace, stepRace, runTo, botHelm, ranking, nextStart, startOf, angleOf, tellBoat, heardBoat } from '../src/world/zones/games/boats/water.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const fmt = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
const R = REGATTA, C = course();
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/world/world.json'), 'utf8'));
const { data, info } = await sharp(path.join(ROOT, 'public/assets/world/height.png')).raw().toBuffer({ resolveWithObject: true });
const [lo, hi] = meta.heightRange, N = info.width, half = N / 2;
const height = (x, z) => { const i = (Math.floor(Math.min(half - 1, Math.max(-half, z)) + half) * N + Math.floor(Math.min(half - 1, Math.max(-half, x)) + half)) * info.channels; return ((data[i] * 256 + data[i + 1]) / 65535) * (hi - lo) + lo; };
const depth = (x, z) => R.level - height(x, z);
/** A race run for `secs` (or until `stop`); `drive(race, input, t)` steers the visitor's boat. Returns what happened to it. */
const sailOn = (race, secs, drive, stop) => {
  const input = { throttle: 0, helm: 0, burst: false }, events = [], seen = [];
  for (let t = 0; t < secs; t += R.step) { input.burst = false; drive?.(race, input, t); stepRace(race, R.step, input, events); for (const e of events) seen.push({ ...e, at: t }); events.length = 0; if (stop?.(race, seen)) break; }
  return seen;
};
/** The visitor's boat alone on the water at (x, z), looking `yaw`. */
const alone = (x, z, yaw) => { const race = startRace(depth); race.boats.length = 1; Object.assign(race.boats[0], { x, z, yaw, vx: 0, vz: 0 }); return race; };

// ------------------------------------------------------------------------------------------------ the course
{
  let shallow = 1e9, where = null, edge = 1e9;
  for (const p of C.line) for (const off of [-R.width / 2 - 0.6, 0, R.width / 2 + 0.6]) {
    const q = C.line[(C.line.indexOf(p) + 1) % C.line.length], d = Math.hypot(q.x - p.x, q.z - p.z) || 1, x = p.x - ((q.z - p.z) / d) * off, z = p.z + ((q.x - p.x) / d) * off, dep = depth(x, z);
    if (dep < shallow) { shallow = dep; where = [Math.round(x), Math.round(z)]; }
  }
  for (const p of C.line) {
    for (const k of R.keepOut) edge = Math.min(edge, Math.hypot(p.x - k.x, p.z - k.z) - k.r);
    edge = Math.min(edge, Math.max(R.box.x0 - p.x, p.x - R.box.x1, R.box.z0 - p.z, p.z - R.box.z1));
  }
  check('the way round lies on water deep enough, the width of a gate and more', shallow > 0.7, `${shallow.toFixed(1)} m at the shallowest (${where})`);
  check('it keeps clear of the deck on its piles and of The Endless Pond', edge > 1.6, `${edge.toFixed(1)} m at the nearest`);
  const legs = C.gates.map((g, i) => { const n = C.gates[(i + 1) % C.gates.length]; return Math.hypot(n.x - g.x, n.z - g.z); });
  check('a dozen gates, a few boat-lengths apart, three laps of a hundred and fifty metres or so', C.gates.length >= 10 && Math.min(...legs) > 6.5 && Math.max(...legs) < 22 && C.length > 120 && C.length < 200 && R.laps === 3, `${C.gates.length} gates, ${C.length.toFixed(0)} m a lap, legs of ${Math.min(...legs).toFixed(0)} to ${Math.max(...legs).toFixed(0)} m`);
  check('every buoy floats', C.gates.every((g) => depth(...g.left) > 0.4 && depth(...g.right) > 0.4));
  const g0 = C.gates[0], grid = startRace(depth).boats;
  check('four boats on the grid, behind the line, on the water', grid.length === 4 && grid.every((b) => (b.x - g0.x) * g0.dx + (b.z - g0.z) * g0.dz < -1.5 && depth(b.x, b.z) > 0.6));
}

// ------------------------------------------------------------------------------------------------ a boat
{
  const open = lineAt(C.gates[1].s + 3), g = C.gates[1];
  // it gathers way, up to its speed; a burst takes it beyond, for a moment, and comes back
  const run = alone(C.gates[4].x, C.gates[4].z, C.gates[4].yaw), seen = sailOn(run, 3, (r, i) => { i.throttle = 1; i.helm = 0; }), b = run.boats[0];
  const flat = Math.hypot(b.vx, b.vz);
  check('flat out, a boat gathers way up to its speed', flat > R.top * 0.9 && flat <= R.top * 1.01, `${(flat * 3.6).toFixed(0)} km/h after three seconds`);
  void seen;
  const burst = alone(C.gates[4].x, C.gates[4].z, C.gates[4].yaw); burst.boats[0].ready = 0;
  let fast = 0;
  const ev = sailOn(burst, 4.2, (r, i, t) => { i.throttle = 1; i.burst = t > 3 && t < 3.01; fast = Math.max(fast, Math.hypot(r.boats[0].vx, r.boats[0].vz)); });
  const again = sailOn(burst, 2, (r, i, t) => { i.throttle = 1; i.burst = t > 0.5 && t < 0.51; });
  check('a burst takes it faster for a moment, and is not there again at once', ev.some((e) => e.type === 'burst') && fast > Math.min(R.top * 1.1, flat + 0.5) && !again.some((e) => e.type === 'burst'), `${(fast * 3.6).toFixed(0)} km/h in the burst`);
  // the helm: it turns the boat, the right way, and the boat slides
  const turn = alone(open.x, open.z, g.yaw); let slip = 0;
  sailOn(turn, 2.2, (r, i, t) => { i.throttle = 1; i.helm = t > 1.2 ? 1 : 0; const q = r.boats[0]; slip = Math.max(slip, Math.abs(q.vx * -Math.cos(q.yaw) + q.vz * Math.sin(q.yaw))); });
  const turned = turn.boats[0].yaw - g.yaw;
  check('the helm to starboard turns it to the right, and it slides as it turns', turned < -0.8 && slip > 0.8, `${(-turned * 57.3).toFixed(0)}° in a second, sliding at up to ${slip.toFixed(1)} m/s`);
  // astern
  const back = alone(open.x, open.z, g.yaw); sailOn(back, 1.5, (r, i) => { i.throttle = -1; });
  check('it goes astern, slowly', back.boats[0].way < -1 && back.boats[0].way > -R.top / 2);
  // the bank: it bounces off, and is not left in it
  const ashore = alone(-150, 72, 0); let least = 9;
  const hit = sailOn(ashore, 6, (r, i) => { i.throttle = 1; least = Math.min(least, depth(r.boats[0].x, r.boats[0].z)); });
  check('driven at the bank, it bounces off it and stays afloat', hit.some((e) => e.type === 'bank') && least > 0.1, `${hit.filter((e) => e.type === 'bank').length} bounces, never in less than ${least.toFixed(2)} m of water`);
  // a buoy
  const gb = C.gates[2], at = alone(gb.left[0] - gb.dx * 4, gb.left[1] - gb.dz * 4, gb.yaw);
  const hb = sailOn(at, 2.5, (r, i) => { i.throttle = 1; });
  check('a buoy is not sailed through', hb.some((e) => e.type === 'buoy'));
}

// ------------------------------------------------------------------------------------------------ the gates, the laps
{
  // between its buoys a gate counts; beside them it does not — and the next ones wait
  const g1 = C.gates[1], inside = alone(g1.x - g1.dx * 3, g1.z - g1.dz * 3, g1.yaw), wide = alone(g1.x - g1.dx * 3 + g1.rx * (R.width / 2 + 1.4), g1.z - g1.dz * 3 + g1.rz * (R.width / 2 + 1.4), g1.yaw);
  inside.boats[0].gate = wide.boats[0].gate = 1; inside.boats[0].passed = wide.boats[0].passed = 1;
  const a = sailOn(inside, 1.5, (r, i) => { i.throttle = 1; }), b = sailOn(wide, 1.5, (r, i) => { i.throttle = 1; });
  check('a gate is taken between its buoys; beside them it is missed, and it is still the one to take', a.some((e) => e.type === 'gate' && e.n === 1) && inside.boats[0].gate === 2 && b.some((e) => e.type === 'missed') && wide.boats[0].gate === 1);
  // three laps by the helm of a boat that sails by itself: every gate, no bank, a time
  const race = startRace(depth), helm = {}, seen = sailOn(race, 200, (r, i) => { botHelm(r, helm); i.throttle = helm.throttle; i.helm = helm.helm; i.burst = helm.burst; }, (r) => r.boats.every((q) => q.done));
  const me = race.boats[0], laps = seen.filter((e) => e.type === 'lap'), fin = seen.find((e) => e.type === 'finish');
  check('three laps, every gate in order, and the clock stops on the line', !!fin && laps.length === R.laps - 1 && me.passed === C.gates.length * R.laps + 1 && race.over && race.time === fin.time, fin ? `${fmt(fin.time)}, laps at ${laps.map((e) => fmt(e.time)).join(' and ')}` : 'never finished');
  check('…without running aground', seen.filter((e) => e.type === 'bank').length === 0 && seen.filter((e) => e.type === 'buoy').length <= 1, `${me.bumps} bumps`);
  const order = ranking(race), times = race.boats.map((q) => q.time);
  check('the boats that sail by themselves get round too, the better ones sooner — and can be beaten', race.boats.every((q) => q.done) && times[1] > times[2] && times[2] > times[3] && times[0] < times[1] && order[0].done, race.boats.map((q) => `${q.name} ${fmt(q.time)}`).join(' · '));
  check('none of them runs aground more than once or twice', race.boats.slice(1).every((q) => q.bumps <= 3), race.boats.slice(1).map((q) => q.bumps).join(', '));
  // the same race at any frame rate
  const timeAt = (dt) => { const r = startRace(depth), h = {}; let acc = 0; for (let t = 0; t < 200 && !r.over; t += dt) { acc += dt; while (acc >= R.step && !r.over) { acc -= R.step; botHelm(r, h); stepRace(r, R.step, h, null); } } return r.time; };
  const t30 = timeAt(1 / 30), t144 = timeAt(1 / 144);
  check('the same race at 30 and at 144 frames a second', t30 === t144 && t30 > 0, fmt(t30));
  // who does nothing stays on the grid; who goes the wrong way gets nowhere
  const idle = startRace(depth); sailOn(idle, 20, null);
  check('who does nothing gets nowhere while the others go', !idle.over && idle.boats[0].lap === 0 && idle.boats[0].passed <= 1 && idle.boats[1].passed > 3 && ranking(idle)[3] === idle.boats[0]);
  // the board of scores: its floor is under anything a boat can do — flat out all the way, every burst used
  const flat = (R.laps * C.length) / (R.top * (1 + ((R.burst.gain - 1) * R.burst.time) / (R.burst.time + R.burst.wait)));
  check('the floor of the board of scores (37 s) is well under what a boat can do: flat out all the way with every burst, and the helm of a boat that sails by itself', flat > 37 * 1.08 && fin.time > flat * 1000, `${flat.toFixed(1)} s flat out, ${fmt(fin.time)} by that helm`);
  console.log(`      for the board of scores: slide-like, the less the better — boats: { order: 'asc', min: 37_000, max: 1800_000 }`);
}

// ------------------------------------------------------------------------------------------------ the starts
{
  const every = R.every * 1000, t0 = 1_770_000_000_000 - (1_770_000_000_000 % every); // (a round ten seconds of the clock)
  const a = nextStart(t0 + 100), b = nextStart(t0 + every - 600), c = nextStart(t0 + every - 400), d = nextStart(t0 + every + 1);
  const names = Array.from({ length: R.starts.length }, (_, i) => startOf(a.n + i).name);
  check('a start every ten seconds on the clock everybody shares, each with a name; one may join until half a second before it — the name that is shown does not change before that start has left',
    R.every === 10 && R.late === 0.5 && a.n === b.n && a.name === b.name && a.at === t0 + every && Math.abs(a.wait - 9.9) < 1e-9 && Math.abs(b.wait - 0.6) < 1e-9 && c.n === a.n + 1 && c.name !== a.name && Math.abs(c.wait - 10.4) < 1e-9
    && d.n === a.n + 1 && new Set(names).size === R.starts.length && startOf(a.n + R.starts.length).name === a.name,
    `${a.name} in ${a.wait.toFixed(1)} s, still ${b.name} with ${b.wait.toFixed(1)} s to go, then ${c.name}; ${names.join(', ')}`);
  const g0 = C.gates[0], row = R.row.across.map((_, k) => startRace(depth, 5, k).boats[0]), behind = row.map((q) => (q.x - g0.x) * g0.dx + (q.z - g0.z) * g0.dz), apart = Math.hypot(row[1].x - row[0].x, row[1].z - row[0].z);
  check('the visitors start abreast behind the three boats that sail by themselves: four places, each as far from the line as the others, on the water, clear of one another',
    row.length === 4 && behind.every((v) => Math.abs(v - behind[0]) < 1e-9 && v < -6) && row.every((q) => depth(q.x, q.z) > 0.6) && apart > 2 * R.radius && startRace(depth, 5, 6).boats[0].x === row[2].x,
    `${(-behind[0]).toFixed(1)} m behind the line, ${apart.toFixed(1)} m apart, never in less than ${Math.min(...row.map((q) => depth(q.x, q.z))).toFixed(1)} m of water`);
}

// ------------------------------------------------------------------------------------------------ the same race for everybody
{
  const helm = {}, steer = (r, i) => { botHelm(r, helm); i.throttle = helm.throttle; i.helm = helm.helm; i.burst = helm.burst; };
  // (a visitor who rams what it can: for the nearest boat that sails by itself, flat out, every burst)
  const ram = (r, i) => {
    const me = r.boats[0]; let near = null, best = 1e9;
    for (const q of r.boats.slice(1)) { const d2 = (q.x - me.x) ** 2 + (q.z - me.z) ** 2; if (d2 < best) { best = d2; near = q; } }
    i.throttle = 1; i.helm = Math.max(-1, Math.min(1, -angleOf((near.x - me.x) * Math.cos(me.yaw) - (near.z - me.z) * Math.sin(me.yaw), (near.x - me.x) * Math.sin(me.yaw) + (near.z - me.z) * Math.cos(me.yaw)) * 2.4)); i.burst = true;
  };
  const others = (r) => r.boats.slice(1).map((q) => [q.x, q.z, q.yaw, q.vx, q.vz, q.gate, q.lap, q.time].join()).join('|');
  const idle = startRace(depth, 7, 0), raced = startRace(depth, 7, 3), rammed = startRace(depth, 7, 1);
  sailOn(idle, 60, null); sailOn(raced, 60, steer);
  const bumps = sailOn(rammed, 60, ram).filter((e) => e.type === 'boat').length;
  check('the boats that sail by themselves are the same for everybody who left with one start: whatever a visitor does — nothing, a race, ramming them for a minute — they are where they are, to the last digit',
    others(idle) === others(raced) && others(idle) === others(rammed) && bumps >= 1 && idle.boats[1].passed > 20, `${bumps} bump${bumps > 1 ? 's' : ''} of the one who rams (then it rubs along), the three a lap and more round`);
  // a touch: the visitor's boat is turned aside, the other does not move
  {
    const r = startRace(depth, 7, 0), me = r.boats[0], it = r.boats[3], g = C.gates[5];
    for (const q of r.boats.slice(1)) Object.assign(q, { x: q.x + 500, z: q.z }); // (out of the way: far off, on no water at all — they stay where they are put)
    Object.assign(it, { x: g.x, z: g.z, yaw: g.yaw, vx: 0, vz: 0 });
    Object.assign(me, { x: g.x - g.dx * 3 + g.rx * 0.15, z: g.z - g.dz * 3 + g.rz * 0.15, yaw: g.yaw, vx: 0, vz: 0 });
    const was = [it.x, it.z], ev = [], input = { throttle: 1, helm: 0, burst: false };
    let nearest = 9, side = 0;
    for (let t = 0; t < 1.6; t += R.step) { const keep = [it.x, it.z, it.yaw]; stepRace(r, R.step, input, ev); Object.assign(it, { x: keep[0], z: keep[1], yaw: keep[2], vx: 0, vz: 0 }); nearest = Math.min(nearest, Math.hypot(me.x - it.x, me.z - it.z)); side = Math.max(side, Math.abs((me.x - g.x) * g.rx + (me.z - g.z) * g.rz)); }
    const past = (me.x - g.x) * g.dx + (me.z - g.z) * g.dz;
    check('a visitor\'s boat that runs into one of them is turned aside and goes past — the other one is not moved', it.x === was[0] && it.z === was[1] && ev.some((e) => e.type === 'boat') && nearest > R.close - 0.02 && side > 0.6 && past > 1, `a bump, never nearer than ${nearest.toFixed(2)} m, ${side.toFixed(1)} m aside, ${past.toFixed(1)} m past it after a second and a half`);
  }
  // another start is another race; each of the three about 2 % later than it used to be
  const finish = (start) => { const r = startRace(depth, start, 3); sailOn(r, 200, steer, (q) => q.boats.every((x) => x.done)); return r.boats.map((q) => q.time); };
  const t7 = finish(7), t8 = finish(8), again = finish(7);
  const N = 24, sum = [0, 0, 0], lo = [1e9, 1e9, 1e9], hi = [0, 0, 0]; let inOrder = 0, first = 0;
  for (let k = 0; k < N; k++) { const t = finish(177_000_000 + k * 13); t.slice(1).forEach((v, i) => { sum[i] += v; lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v); }); if (t[1] > t[2] && t[2] > t[3]) inOrder++; if (t[0] < Math.min(t[1], t[2], t[3])) first++; }
  const avg = sum.map((v) => v / N), was = [49242, 47900, 46600];
  check('…and a little better or worse from one start to the next: the same start is the same race, another start another',
    t7.join() === again.join() && t7.slice(1).every((v, i) => v !== t8[i + 1]) && lo.every((v, i) => hi[i] - v > 300 && hi[i] - v < 2500), `start 7: ${t7.slice(1).map(fmt).join(' · ')}; start 8: ${t8.slice(1).map(fmt).join(' · ')}`);
  check(`each of them ends about 2 % later than it used to (they were found a little too good), the better ones still sooner, and the helm of one of them in the visitor's boat still beats them`,
    avg.every((v, i) => v / was[i] > 1.012 && v / was[i] < 1.028) && inOrder >= N - 2 && first >= N - 1,
    `${R.bots.map((b, i) => `${b.name} ${fmt(Math.round(avg[i]))} (+${((avg[i] / was[i] - 1) * 100).toFixed(1)} %)`).join(' · ')} over ${N} starts; in the order of their skill ${inOrder} times`);
}

// ------------------------------------------------------------------------------------------------ the clock everybody shares
{
  const drive = () => { const h = {}; return (r, i) => { botHelm(r, h); i.throttle = h.throttle; i.helm = h.helm; i.burst = h.burst; }; };
  const state = (r) => r.boats.map((q) => [q.x, q.z, q.yaw, q.way, q.gate].join()).join('|');
  const a = startRace(depth, 9, 2), b = startRace(depth, 9, 2), ia = {}, ib = {}, da = drive(), db = drive();
  for (let t = 0; t < 20;) { t = Math.min(20, t + 1 / 60); runTo(a, t, ia, null, da); }
  const gaps = [0.004, 0.031, 0.25, 0.016, 1.7, 0.009];
  for (let t = 0, k = 0; t < 20; k++) { t = Math.min(20, t + gaps[k % gaps.length]); runTo(b, t, ib, null, db); }
  check('a race is where the clock says it is: a screen at sixty frames a second and one that stutters and sleeps are at the same step, every boat at the same place',
    a.steps === b.steps && a.steps === Math.floor(20 / R.step + 1e-6) && state(a) === state(b) && Math.abs(a.clock - 20) < 1e-9, `${a.steps} steps after twenty seconds`);
  const c = startRace(depth, 9, 2), ic = {}, dc = drive();
  runTo(c, 30, ic, null, dc, 600);
  const once = c.steps; let goes = 1;
  while (c.steps < Math.floor(30 / R.step + 1e-6) && goes < 50) { runTo(c, 30, ic, null, dc, 600); goes++; }
  runTo(c, -3, ic, null, dc); runTo(c, 29, ic, null, dc);
  check('a page that slept catches up over a few goes, and a clock set back does not take a race back', once === 600 && goes === 6 && c.steps === 3600, `${goes} goes for thirty seconds`);
  // what is said of a boat
  const me = a.boats[0], said = tellBoat(a), carried = said.map((v) => Math.round(v * 100) / 100), heard = heardBoat(carried);
  check('what is said of a boat to the others is eight numbers; carried to the hundredth, it is the same boat to a centimetre — and nonsense is not heard',
    said.length === 8 && !!heard && Math.abs(heard.x - me.x) < 0.006 && Math.abs(heard.z - me.z) < 0.006 && Math.abs(Math.sin(heard.yaw) - Math.sin(me.yaw)) < 0.006 && Math.abs(heard.way - me.way) < 0.006 && heard.t === 20000 && heard.done === false
    && heardBoat(said.slice(0, 7)) === null && heardBoat([...said.slice(0, 7), NaN]) === null && heardBoat([5000, ...said.slice(1)]) === null && heardBoat('boat') === null && heardBoat([...said.slice(0, 3), 99, ...said.slice(4)]) === null);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
