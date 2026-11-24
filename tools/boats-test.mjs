// Checks of The Little Regatta, without a browser: the course lies on water deep enough, clear of the bank, of the
// deck and of The Endless Pond; a boat is driven as it should be — it gathers way, turns, slides, bounces off
// the bank and the buoys, has its burst —; the gates are taken in order, between their buoys; the boats that
// sail by themselves get round three laps without running aground, the better ones sooner; it is the same race
// on every device.
// usage: node tools/boats-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { REGATTA, course, lineAt, startRace, stepRace, botHelm, ranking } from '../src/world/zones/games/boats/water.js';

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
  console.log(`      for the board of scores: slide-like, the less the better — boats: { order: 'asc', min: ${Math.floor((fin.time * 0.8) / 1000) * 1000}, max: 1800_000 }`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
