// Checks of The Hollow Hill, without a browser: the cave lies whole under the hill — rock over it everywhere,
// its floor above the sea, never crossing itself; the lap is a closed ring, its bends are flyable; what is in
// the way is in the cave and always leaves a way; one flies by oneself, bursts on a gauge that the rings fill,
// gains on the inside of a bend, cannot leave the cave; what one hits all but stops one and never ends the
// flight; a flyer that looks ahead laps clean, one that does not steer is knocked about a dozen times.
// usage: node tools/hollow-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { BOUNDS } from '../src/world/layout/layout.js';
import { HOLLOW, course, tunnelAt, tunnelPoint, stretchAt, startFlight, stepFlight, flightPose, botInput, naiveInput, botFlight } from '../src/world/zones/games/hollow/tunnel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const H = HOLLOW, C = course(), L = C.length;
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/world/world.json'), 'utf8'));
const { data, info } = await sharp(path.join(ROOT, 'public/assets/world/height.png')).raw().toBuffer({ resolveWithObject: true });
const [lo, hi] = meta.heightRange, N = info.width, half = N / 2;
const height = (x, z) => { const i = (Math.floor(Math.min(half - 1, Math.max(-half, z)) + half) * N + Math.floor(Math.min(half - 1, Math.max(-half, x)) + half)) * info.channels; return ((data[i] * 256 + data[i + 1]) / 65535) * (hi - lo) + lo; };
const T = new Float32Array(fs.readFileSync(path.join(ROOT, 'public/assets/world/trees.bin')).buffer.slice(0));
const S = Object.fromEntries(C.stretches.map((q) => [q.name, q]));
/** A flyer already off, at a place of the cave, at cruising speed. */
const flying = (s, u = 0, v = 0, more = {}) => Object.assign(startFlight(), { gone: true, wait: 0, s, u, v, speed: H.cruise, stretch: stretchAt(s) }, more);
/** Flies `secs` with what `drive(st, input, t)` asks; returns the events. */
const run = (st, secs, drive, stop) => { const input = { x: 0, y: 0, burst: false }, events = [], seen = []; for (let t = 0; t < secs && !st.over; t += H.step) { drive?.(st, input, t); events.length = 0; stepFlight(st, H.step, input, events); seen.push(...events.map((e) => ({ ...e, at: t }))); if (stop?.(st, events)) break; } return seen; };
/** How near the middle line of a thing a place across the cave is, less its thickness there (curtains apart). */
const clear = (t, u, v) => { const eu = t.u2 - t.u1, ev = t.v2 - t.v1, l2 = eu * eu + ev * ev, w = l2 > 1e-9 ? Math.min(1, Math.max(0, ((u - t.u1) * eu + (v - t.v1) * ev) / l2)) : 0; return Math.hypot(u - t.u1 - eu * w, v - t.v1 - ev * w) - (t.r1 + (t.r2 - t.r1) * w); };

{
  // ---- where it is: under the hill
  let rock = [99], low = [99], wetFrom = Infinity, wetTo = -Infinity;
  const f = {}, p = {};
  for (let s = 0; s < L; s += 1) {
    tunnelAt(s, f);
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, q = tunnelPoint(s, Math.cos(a) * (f.a + 1.2), Math.sin(a) * (f.b + 1.2), p), r = height(q.x, q.z) - q.y; if (r < rock[0]) rock = [r, s]; }
    const floor = f.y - f.b * H.floor - 0.4;
    if (floor < low[0]) low = [floor, s];
    if (f.water > -f.b * H.floor) { wetFrom = Math.min(wetFrom, s); wetTo = Math.max(wetTo, s); }
  }
  check('the cave lies whole under the hill: rock over its roof everywhere', rock[0] > 8, `never less than ${rock[0].toFixed(1)} m of it (at ${rock[1]} m round the lap)`);
  check('its floor is above the sea, and it stays inside the map', low[0] > 3 && (() => { for (let s = 0; s < L; s += 5) { tunnelAt(s, f); if (Math.abs(f.x) > half - 40 || Math.abs(f.z) > half - 40) return false; } return true; })(), `lowest floor ${low[0].toFixed(1)} m above the sea`);
  check('the lake is where the cave is lowest, and nowhere else', wetFrom > S['The Screw'].to - 12 && wetTo < S['The Curtains'].from + 14 && wetTo - wetFrom > 45, `water from ${wetFrom} to ${wetTo} m; The Lake from ${S['The Lake'].from.toFixed(0)} to ${S['The Lake'].to.toFixed(0)}`);
  let near = [99];
  for (let s1 = 0; s1 < L; s1 += 2) { const a = tunnelAt(s1, {}); for (let s2 = s1 + 30; s2 < L; s2 += 2) { if (L - s2 + s1 < 30) continue; const b = tunnelAt(s2, {}), d = Math.hypot(a.x - b.x, a.z - b.z), dy = Math.abs(a.y - b.y), gap = Math.hypot(Math.max(0, d - a.a - b.a), Math.max(0, dy - a.b - b.b)); if (gap < near[0]) near = [gap, s1, s2]; } }
  check('it never crosses itself: rock is left between two passes (the Screw winds over itself)', near[0] > 1.8, `${near[0].toFixed(1)} m at the nearest (${near[1]} m and ${near[2]} m round the lap)`);
}
{
  // ---- the lap: a closed ring one can fly
  const a = tunnelAt(L - 0.001, {}), b = tunnelAt(0, {}), c = tunnelAt(-3, {}), d = tunnelAt(L - 3, {});
  let bend = 0, lift = 0, square = 0, steep = 0, thin = 99, wide = 0;
  for (let s = 0; s < L; s += 0.5) { const f = tunnelAt(s, {}); bend = Math.max(bend, Math.abs(f.ku)); lift = Math.max(lift, Math.abs(f.kv)); steep = Math.max(steep, Math.abs(f.ty)); thin = Math.min(thin, f.a, f.b); wide = Math.max(wide, f.a); square = Math.max(square, Math.abs(f.tx * f.rx + f.tz * f.rz), Math.abs(f.tx * f.ux + f.ty * f.uy + f.tz * f.uz), Math.abs(Math.hypot(f.ux, f.uy, f.uz) - 1), Math.abs(f.ry)); }
  check('the lap is a closed ring, half a kilometre round', L > 500 && L < 620 && Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.01 && Math.hypot(c.x - d.x, c.z - d.z) < 1e-6, `${L.toFixed(0)} m`);
  check('its frame is true everywhere (right is level, up is square to the way), and it never climbs steeply', square < 0.02 && steep < 0.25, `steepest ${(Math.asin(steep) * 180 / Math.PI).toFixed(0)}°`);
  check('its bends can be flown: none tighter than eight metres; halls of thirty metres, a narrows of eight', bend < 0.125 && lift < 0.03 && thin > 3.6 && thin < 4.2 && wide > 14, `tightest ${(1 / bend).toFixed(1)} m; from ${(thin * 2).toFixed(1)} m to ${(wide * 2).toFixed(0)} m wide`);
  const names = C.stretches.map((q) => q.name), cover = C.stretches.every((q, i) => q.to > q.from && (i === 0 || Math.abs(q.from - C.stretches[i - 1].to) < 1e-6)) && Math.abs(C.stretches[C.stretches.length - 1].to - (L + C.stretches[0].from)) < 1e-6;
  check('ten stretches, end to end, round the lap; one knows which one is in', names.length === 10 && cover && stretchAt(1) === 0 && stretchAt(L - 1) === 0 && C.stretches[stretchAt(S['The Lake'].from + 5)].name === 'The Lake' && C.stretches[stretchAt(L + S['The Teeth'].from + 5)].name === 'The Teeth', names.join(' · '));
}
{
  // ---- what is in the way
  const kinds = {}, f = {}; let outside = 0, bare = [];
  for (const t of C.things) { kinds[t.kind] = (kinds[t.kind] || 0) + 1; tunnelAt(t.s, f); if (t.kind === 'curtain') { if (Math.hypot(t.u / (f.a - 1), t.v / (f.b - 1)) > 1 || t.r < H.body + 1.4) outside++; } else if (Math.min(Math.abs(t.u1), Math.abs(t.u2)) > f.a || Math.min(Math.abs(t.v1), Math.abs(t.v2)) > f.b + 0.01) outside++; }
  for (const q of C.stretches.slice(1)) if (!C.things.some((t) => t.s >= q.from && t.s < q.to)) bare.push(q.name);
  check('columns, teeth of rock, boulders, arches, curtains, beams of crystal: every stretch has its own, the Start Hall has none', Object.keys(kinds).length === 7 && !outside && bare.length === 0 && !C.things.some((t) => t.s < S['The Start Hall'].to || t.s > L + S['The Start Hall'].from), JSON.stringify(kinds));
  // a way through, every metre: a place across the cave with a good metre of air round the flyer
  let tight = [99, 0];
  for (let s = S['The Start Hall'].to; s < L; s += 0.5) {
    tunnelAt(s, f);
    const A = f.a - H.body - H.skin, B = f.b - H.body - H.skin, low = Math.max(-f.b * H.floor + H.body + 0.25, f.water + 0.4), here = C.things.filter((t) => Math.abs(t.s - s) < (t.kind === 'curtain' ? 0.6 : Math.max(t.r1, t.r2) + H.body));
    let best = -9;
    for (let u = -A; u <= A; u += 0.25) for (let v = low; v <= B; v += 0.25) {
      if ((u / A) ** 2 + (v / B) ** 2 > 1) continue;
      let room = 9;
      for (const t of here) room = Math.min(room, t.kind === 'curtain' ? t.r - Math.hypot(u - t.u, v - t.v) : clear(t, u, v));
      if (room > best) best = room;
    }
    if (best < tight[0]) tight = [best, s];
  }
  check('there is always a way: everywhere a place across the cave with room round the flyer', tight[0] > H.body + 0.5, `at the tightest ${tight[0].toFixed(2)} m from the rock (the flyer is ${H.body} m), ${tight[1].toFixed(0)} m round the lap`);
  let blocked = 0;
  for (const r of C.rings) { tunnelAt(r.s, f); const A = f.a - H.body - H.skin, B = f.b - H.body - H.skin; if ((r.u / A) ** 2 + (r.v / B) ** 2 > 1 || r.v < f.water + 0.4) blocked++; for (const t of C.things) if (t.kind !== 'curtain' && Math.abs(t.s - r.s) < Math.max(t.r1, t.r2) + H.body && clear(t, r.u, r.v) < H.body + 0.15) blocked++; }
  check('eighteen rings, each with its middle in the clear', C.rings.length === 18 && blocked === 0);
}
{
  // ---- flying
  const s0 = 3; // (nothing in the Start Hall: a place to try the flight itself)
  const wait = startFlight(), ev = run(wait, 5, null, (q, e) => e.some((x) => x.type === 'go'));
  check('a count of three, and one is off by oneself', ev[ev.length - 1]?.type === 'go' && Math.abs(ev[ev.length - 1].at - H.count) < 0.02 && wait.s < 2.2 && wait.clock <= H.step + 1e-9);
  const cruise = flying(3), burst = flying(3);
  run(cruise, 2.5); run(burst, 2.5, (q, inp) => { inp.burst = true; });
  check('one cruises at eighteen metres a second, and bursts at twenty-seven', Math.abs(cruise.speed - H.cruise) < 0.01 && Math.abs(burst.speed - H.burst) < 0.01 && burst.s > cruise.s + 15, `${cruise.speed.toFixed(1)} and ${burst.speed.toFixed(1)} m/s`);
  const spent = flying(3), dry = flying(3, 0, 0, { gauge: 0.05 }), back = flying(3, 0, 0, { gauge: 0 });
  run(spent, 1, (q, inp) => { inp.burst = true; }); run(dry, 1, (q, inp) => { inp.burst = true; }); run(back, 1.5);
  check('the burst is a gauge: a full one lasts three seconds, an empty one is back by itself in sixteen; with none, no burst', Math.abs(spent.gauge - (1 - 1 / H.gauge.time)) < 0.01 && Math.abs(back.gauge - 1.5 / H.gauge.fill) < 0.01 && dry.speed < H.burst - 4 && !dry.bursting, `${(spent.gauge * 100).toFixed(0)} % left after a second of it; ${(back.gauge * 100).toFixed(0)} % back after a second and a half`);
  const ring = C.rings[0], through = flying(ring.s - 3, ring.u, ring.v, { gauge: 0.2 }), beside = flying(ring.s - 3, ring.u + ring.r + 0.3, ring.v, { gauge: 0.2 });
  const e1 = run(through, 0.6), e2 = run(beside, 0.6);
  check('a ring flown through gives a third of the gauge back, and a push; flown beside, nothing', e1.filter((e) => e.type === 'ring').length === 1 && through.gauge > 0.5 && through.extra > 1 && !e2.some((e) => e.type === 'ring') && beside.gauge < 0.25);
  // the inside of a bend: in the Screw, between two boulders
  const from = S['The Screw'].from + (S['The Screw'].to - S['The Screw'].from) * 0.35, mid = flying(from, 0, 2.2), inside = flying(from, -4.2, 2.2), outside = flying(from, 4.2, 2.2);
  run(mid, 0.6); run(inside, 0.6); run(outside, 0.6);
  check('the inside of a bend is the shorter way: in the Screw one gains a quarter on who flies the middle', !inside.hits && !mid.hits && (inside.s - from) > (mid.s - from) * 1.2 && (outside.s - from) < (mid.s - from) * 0.9, `${(inside.s - from).toFixed(1)} m inside, ${(mid.s - from).toFixed(1)} m in the middle, ${(outside.s - from).toFixed(1)} m outside, in the same time`);
  const right = flying(s0), up = flying(s0), down = flying(s0), f = {};
  run(right, 1.6, (q, inp) => { inp.x = 1; }); run(up, 1.6, (q, inp) => { inp.y = 1; }); run(down, 1.6, (q, inp) => { inp.y = -1; });
  tunnelAt(right.s, f);
  check('one cannot leave the cave: the walls, the roof and the floor hold, and rubbing them costs speed', Math.abs(right.u - (f.a - H.body - H.skin)) < 0.3 && right.speed < H.cruise * 0.75 && up.v > 0 && up.v <= tunnelAt(up.s, {}).b - H.body - H.skin + 0.1 && down.v >= -tunnelAt(down.s, {}).b * H.floor + H.body && right.rub > 0.5, `against the wall at ${right.u.toFixed(1)} m of ${f.a.toFixed(1)}, down to ${right.speed.toFixed(1)} m/s`);
  const lake = flying(S['The Lake'].from + 20, 6, 0); run(lake, 0.8, (q, inp) => { inp.y = -1; });
  check('over the lake one skims the water, and it drags', lake.wet && Math.abs(lake.v - (tunnelAt(lake.s, {}).water + 0.4)) < 0.01 && lake.speed < H.cruise);
}
{
  // ---- what one hits
  const col = C.things.find((t) => t.kind === 'column'), st = flying(col.s - 9, col.u1, 0);
  const ev = run(st, 1.0), hit = ev.find((e) => e.type === 'crash');
  const after = flying(col.s - 9, col.u1, 0); run(after, 0.52);
  const on = flying(col.s - 9, col.u1, 0); run(on, 2.6);
  check('a column met head on all but stops one, and throws one aside — and the flight goes on', !!hit && hit.kind === 'column' && st.hits === 1 && after.speed <= H.cruise * H.crash.keep + 0.6 && Math.abs(after.u - col.u1) > col.r1 + H.body - 0.05 && !on.over && on.s > col.s + 12 && on.speed > after.speed + 6, `down to ${after.speed.toFixed(1)} m/s, ${(Math.abs(after.u - col.u1)).toFixed(2)} m aside; ${on.speed.toFixed(1)} m/s again two seconds on`);
  const cur = C.things.find((t) => t.kind === 'curtain'), good = flying(cur.s - 6, cur.u, cur.v), bad = flying(cur.s - 6, cur.u + cur.r + 1.2, cur.v - 1);
  const eg = run(good, 0.6), eb = run(bad, 0.6);
  check('a curtain is passed by its hole; who misses it is stopped, and goes through the hole all the same', !eg.some((e) => e.type === 'crash') && eb.some((e) => e.type === 'crash' && e.kind === 'curtain') && bad.s > cur.s && Math.hypot(bad.u - cur.u, bad.v - cur.v) < cur.r && bad.hits === 1);
  const arch = C.things.find((t) => t.kind === 'arch'), under = flying(arch.s - 6, 0, arch.v1 - arch.r1 - H.body - 0.4), over = flying(arch.s - 6, 0, arch.v1 + arch.r1 + H.body + 0.4), into = flying(arch.s - 6, 0, arch.v1);
  run(under, 0.6); run(over, 0.6); run(into, 0.6);
  check('an arch over the lake is flown under or over', under.hits === 0 && over.hits === 0 && into.hits === 1, `the arch at ${arch.v1} m, ${arch.r1} m thick`);
  const tooth = C.things.find((t) => t.kind === 'stalactite'), tip = flying(tooth.s - 6, tooth.u2, tooth.v2 - H.body - 0.5), root = flying(tooth.s - 6, tooth.u1, tooth.v1 - 1.5);
  run(tip, 0.6); run(root, 0.6);
  check('a tooth of rock is thick at its root and thin at its tip: one passes just under it', tip.hits === 0 && root.hits === 1);
  const twice = flying(tooth.s - 6, tooth.u1, tooth.v1 - 1.5), e2 = run(twice, 1.0);
  check('one knock at a time: thrown against the next tooth of the row, one is not knocked again', e2.filter((e) => e.type === 'crash').length === 1 && twice.s > tooth.s + 1, `${e2.filter((e) => e.type === 'crash').length} knock in a row of three teeth`);
}
{
  // ---- the same asks, the same flight; the flyers that play by themselves
  const one = startFlight(), two = startFlight(), acts = [], inp = { x: 0, y: 0, burst: false };
  for (let k = 0; k < 120 * 9; k++) { botInput(one, inp); acts.push({ ...inp }); stepFlight(one, H.step, inp, null); }
  for (let k = 0; k < acts.length;) { const n = 1 + (k % 5); for (let j = 0; j < n && k < acts.length; j++, k++) stepFlight(two, H.step, acts[k], null); }
  check('the same asks give the same flight, however the time is cut', Math.abs(one.s - two.s) < 1e-9 && one.u === two.u && one.hits === two.hits, `${one.s.toFixed(2)} m after nine seconds`);
  const t0 = Date.now(), bot = botFlight(), naive = botFlight(naiveInput);
  check('a flyer that looks ahead laps clean, through most of the rings', bot.over && bot.hits === 0 && bot.rings >= 10 && bot.time > 19000 && bot.time < 30000 && bot.rub < 0.5, `${(bot.time / 1000).toFixed(2)} s, ${bot.rings} rings, top speed ${bot.top.toFixed(0)} m/s (worked out in ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  check('one who does not steer is knocked about a dozen times and takes half as long again — but gets round', naive.over && naive.hits >= 8 && naive.time > bot.time * 1.4, `${(naive.time / 1000).toFixed(1)} s, ${naive.hits} knocks`);
  const st = startFlight(), seen = run(st, 60, (q, i) => botInput(q, i)), go = seen.find((e) => e.type === 'go'), over = seen.find((e) => e.type === 'over'), order = seen.filter((e) => e.type === 'stretch').map((e) => e.n);
  check('the clock starts at the off and stops at the line, one lap on; the stretches come in order', !!go && !!over && st.time === Math.round(st.clock * 1000) && Math.abs(over.at - go.at - st.time / 1000) < 0.02 && st.s >= L && st.s < L + 1 && order.join() === '1,2,3,4,5,6,7,8,9,0');
  const pose = flightPose(flying(S['The Lake'].from + 10, 2, -1), {}), mid = tunnelPoint(S['The Lake'].from + 10, 2, -1, {});
  check('the flyer is where the rules say it is, heading the way the cave goes', Math.hypot(pose.x - mid.x, pose.y - mid.y, pose.z - mid.z) < 1e-9 && Math.abs(pose.roll) < 1e-9 && Number.isFinite(pose.yaw + pose.pitch));
  console.log(`\n  a rule for the board of its best times:  hollow: { order: 'asc', min: ${Math.floor((bot.time * 0.7) / 1000) * 1000}, max: 600_000 }   (the bot's lap: ${(bot.time / 1000).toFixed(2)} s)`);
}
{
  // ---- outside: the mouth of the mine
  const M = H.mouth, inside = (x, z) => { let c = false; for (let i = 0, j = BOUNDS.length - 1; i < BOUNDS.length; j = i++) if ((BOUNDS[j][1] > z) !== (BOUNDS[i][1] > z) && x < ((BOUNDS[i][0] - BOUNDS[j][0]) * (z - BOUNDS[j][1])) / (BOUNDS[i][1] - BOUNDS[j][1]) + BOUNDS[j][0]) c = !c; return c; };
  let trees = 0; for (let i = 0; i + 5 < T.length; i += 6) { const dx = T[i] - M.x, dz = T[i + 1] - M.z; if (Math.abs(dx) < 1.9 && dz > -2.6 && dz < 2.4) trees++; }
  const here = height(M.x, M.z), behind = height(M.x, M.z + 5.5);
  check('one asks before the mouth of a mine at the foot of the cliff: dry ground one can walk to, the cliff behind, no tree in the way', inside(M.x, M.z) && inside(M.x, M.z - 2) && here > 2 && behind > here + 5 && trees === 0, `ground at ${here.toFixed(1)} m, ${behind.toFixed(0)} m five steps behind`);
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
