// Checks of Robots Can See You, without a browser: its quay stands in the sea of the south bay, its gate on the sand;
// the yard holds together — everything inside its fence, five rooms, three cores each behind what it opens, a way
// through that can be walked; the cones stop at what hides (and at what is low for who crouches); the meter fills
// in half a second in plain sight, slower far away, at once at arm's length, and empties out of sight; a run is
// heard and a robot turns to look, crouching is not; caught, one is put back at the last save with ten seconds
// more; the gates open with their cores; the hiding places of the way are never seen, whatever the clock; the
// player that plays by itself gets through unseen from any moment of the rounds, a clumsy one that runs everywhere
// is caught again and again and still ends at the door, standing still wins nothing; the same at 30 and 144 frames.
// usage: node tools/sneak-test.mjs
import { check, done, ground } from './lib/check.mjs';
import { BOARDS as SERVER } from '../server/scores.js';
import { SNEAK, BOXES, CORES, GATES, SAVES, ROOMS, DOOR, TOWER, VIEWERS, ROBOTS, ROUTE, SHORTEST, BOARD, poseAt, sight, clear, rateAt, seeRate, reach, startRun, stepRun, timeOf, coresOf, progressOf, heatOf, botInput, botRun, rnd } from '../src/world/zones/games/sneak/rules.js';

const S = SNEAK, STEP = S.step, TAU = Math.PI * 2;
const fmt = (ms) => `${(ms / 1000).toFixed(1)} s`;
const wrap = (a) => { a %= TAU; return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a; };
/** The yard's frame → the world's (as Sneak.js does). */
const toWorld = (x, z) => [S.at.x + x * Math.cos(S.yaw) + z * Math.sin(S.yaw), S.at.z - x * Math.sin(S.yaw) + z * Math.cos(S.yaw)];
/** Runs `st` for `secs` with what `drive(st, input, t)` holds; → the events, each with its second. */
const run = (st, secs, drive, stop) => {
  const input = { x: 0, y: 0, jump: false }, events = [], seen = [];
  for (let t = 0; t < secs - 1e-9; t += STEP) { input.jump = false; drive?.(st, input, t); stepRun(st, STEP, input, events); for (const e of events) seen.push({ ...e, at: st.now }); events.length = 0; if (stop?.(st, seen)) break; }
  return seen;
};
/** A run with one put at (x, z), all cores held or none. */
const put = (x, z, { now = 0, crouch = false, cores = 0 } = {}) => { const st = startRun(now); st.x = x; st.z = z; st.crouch = crouch; st.cores = cores; return st; };
const solidAt = (x, z, r, cores = 7) => BOXES.some((b) => (b.gate ? !(cores & (1 << (b.gate - 1))) : b.k !== 'grass') && x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r && Math.hypot(x - Math.min(b.x1, Math.max(b.x0, x)), z - Math.min(b.z1, Math.max(b.z0, z))) < r);

const height = await ground();
{
  // ---- where it stands
  const corners = [[-15.4, -32.4], [15.4, -32.4], [15.4, 32.4], [-15.4, 32.4]].map(([x, z]) => toWorld(x, z));
  let hi = -99; for (let x = -15; x <= 15; x += 1) for (let z = -32; z <= 32; z += 1) { const [wx, wz] = toWorld(x, z); hi = Math.max(hi, height(wx, wz)); }
  const xs = corners.map((c) => c[0]), zs = corners.map((c) => c[1]);
  check('the quay stands in the sea of the south bay, south of the pier and of its machine, clear of the shore and of the tower: water under all of it', hi < -0.2 && Math.min(...xs) > 66 && Math.max(...xs) < 146 && Math.min(...zs) > 58 && Math.max(...zs) < 94 && S.deck >= 1 && S.deck <= 2.5, `x ${Math.min(...xs).toFixed(0)} … ${Math.max(...xs).toFixed(0)}, z ${Math.min(...zs).toFixed(0)} … ${Math.max(...zs).toFixed(0)}; the sea bed under it ${hi.toFixed(1)} m at the highest; its floor ${S.deck} m over the sea`);
  const g = S.gate, hg = height(g.x, g.z), tilt = Math.max(...[[1.7, 0], [-1.7, 0], [0, 1.7], [0, -1.7]].map(([ax, az]) => Math.abs(height(g.x + ax, g.z + az) - hg))), [sx, sz] = toWorld(SAVES[0].x, SAVES[0].z);
  check('its gate is on the sand, on ground one walks on, in sight of the quay', hg > 0.4 && hg < 4 && tilt < 0.6 && Math.hypot(g.x - sx, g.z - sz) < 30 && Math.hypot(g.x - 52, g.z - 71) > 9, `(${g.x}, ${g.z}) at ${hg.toFixed(2)} m, ${tilt.toFixed(2)} m of tilt, ${Math.hypot(g.x - sx, g.z - sz).toFixed(0)} m from where one starts; ${Math.hypot(g.x - 52, g.z - 71).toFixed(0)} m from the gate of the spiral`);
}
{
  // ---- the yard
  const inside = BOXES.every((b) => b.x0 < b.x1 && b.z0 < b.z1 && b.x0 >= -15.4 - 1e-9 && b.x1 <= 15.4 + 1e-9 && b.z0 >= -32.4 - 1e-9 && b.z1 <= 32.4 + 1e-9);
  const kinds = { tall: 0, low: 0, grass: 0 }; for (const b of BOXES) kinds[b.k]++;
  check('a yard of 30 × 64 m inside its fence: containers and walls that hide, crates and sandbags that hide who crouches, tall grass one hides in', inside && kinds.tall > 30 && kinds.low >= 6 && kinds.grass >= 2 && S.half.x === 15 && S.half.z === 32, `${BOXES.length} boxes: ${kinds.tall} tall, ${kinds.low} low, ${kinds.grass} of grass`);
  const robots = VIEWERS.filter((v) => v.kind === 'robot'), cams = VIEWERS.filter((v) => v.kind === 'cam'), lights = VIEWERS.filter((v) => v.kind === 'light'), beams = VIEWERS.filter((v) => v.kind === 'beam');
  const rooms = new Set(VIEWERS.map((v) => v.room));
  check('what watches it: robots on their rounds (one turns on the spot, one stands and listens), cameras, one searchlight, beams — something in each of its five rooms', robots.length >= 5 && ROBOTS === robots.length && VIEWERS.slice(0, ROBOTS).every((v) => v.kind === 'robot') && cams.length >= 2 && lights.length === 1 && beams.length >= 2 && rooms.size === 5 && ROOMS.length === 5 && robots.some((v) => v.spins) && robots.some((v) => v.still), `${robots.length} robots, ${cams.length} cameras, ${lights.length} searchlight, ${beams.length} beams`);
  // the rounds are the clock's: the same for everybody, and each comes back to where it began
  const back = VIEWERS.filter((v) => v.kind === 'robot').every((v) => { const a = poseAt(v, 12.3, {}), b = poseAt(v, 12.3 + v.period, {}), c = poseAt(v, 12.3 - 3 * v.period, {}); return Math.hypot(a.x - b.x, a.z - b.z) < 1e-6 && Math.abs(wrap(a.yaw - b.yaw)) < 1e-6 && Math.hypot(a.x - c.x, a.z - c.z) < 1e-6; });
  let jump = 0, inBox = 0; for (const v of VIEWERS.slice(0, ROBOTS)) { let was = poseAt(v, 0, {}); for (let t = 0.05; t < v.period + 0.1; t += 0.05) { const p = poseAt(v, t, {}); jump = Math.max(jump, Math.hypot(p.x - was.x, p.z - was.z) / 0.05); if (solidAt(p.x, p.z, 0.3, 0)) inBox++; was = p; } }
  check('the rounds go by the clock alone: each comes back to where it began, no robot ever jumps or walks through anything', back && jump < 2.6 && inBox === 0, `periods ${VIEWERS.slice(0, ROBOTS).map((v) => v.period.toFixed(1)).join(', ')} s; the fastest ${jump.toFixed(1)} m/s`);
  // the way through: every stretch can be walked (the gates open: one holds their cores by then)
  let blocked = 0, length = 0;
  for (let i = 1; i < ROUTE.length; i++) { const a = ROUTE[i - 1], b = ROUTE[i], len = Math.hypot(b.x - a.x, b.z - a.z); length += len; for (let s = 0; s <= len; s += 0.05) if (solidAt(a.x + (b.x - a.x) * s / len, a.z + (b.z - a.z) * s / len, S.body - 0.02)) { blocked++; if (process.env.DEBUG) console.log('blocked', i, a, b, s); } }
  const nearCore = CORES.every((c) => ROUTE.some((n) => Math.hypot(n.x - c.x, n.z - c.z) < S.grab - 0.2)), savesOn = SAVES.every((s) => s.node >= 0 && ROUTE[s.node].h);
  check('a way through that can be walked from the start to the door: past every core and every save, never through anything', blocked === 0 && nearCore && savesOn && ROUTE[ROUTE.length - 1].z < -S.half.z - 0.6 && length > 150, `${ROUTE.length} points, ${length.toFixed(0)} m; as the crow flies ${SHORTEST.toFixed(0)} m`);
  const order = CORES.every((c, k) => { const g = GATES[k]; return g.n === c.gate && c.z > g.z; }) && GATES[2].box.z0 < -32 && SAVES.every((s, k) => !k || s.z < SAVES[k - 1].z);
  check('three cores, each on the near side of the gate it opens; five saves, one at the door of each room', order && CORES.length === 3 && GATES.length === 3 && SAVES.length === 5, CORES.map((c, k) => `core ${k + 1} at z ${c.z} opens the gate at z ${GATES[k].z.toFixed(1)}`).join('; '));
}
{
  // ---- what hides: the cones stop at it
  const v = VIEWERS[0], p = { x: -13, z: 25.5, yaw: Math.PI / 2 };
  const open = seeRate(v, p, -9, 25.5, false, 0), behind = seeRate(v, p, -9, 28.4, false, 0), back = seeRate(v, p, -14.5, 25.5, false, 0), far = seeRate(v, p, -4.5, 25.5, false, 0), side = seeRate(v, p, -11, 26.9, false, 0);
  check('a robot sees what is in its cone — in front of it, within 8 m, 29° to each side — and not through a container', open > 0 && behind === 0 && back === 0 && far === 0 && side === 0 && Math.abs(reach(-13, 25.5, 0, 8) - 1.6) < 1e-6 && Math.abs(reach(-13, 25.5, Math.PI / 2, 8) - 8) < 1e-6, `in the alley ${open.toFixed(1)}/s; behind the container, behind its back, beyond its reach, beside it: ${behind}, ${back}, ${far}, ${side}`);
  // crates of room A at x -1.2 … 0.2, z 26.3 … 27.1: seen over them standing, hidden behind them crouched
  const q = { x: -6, z: 25.5, yaw: Math.PI / 2 }, stand = seeRate(v, q, 0.7, 26.7, false, 0), low = seeRate(v, q, 0.7, 26.7, true, 0), front = seeRate(v, q, -2, 26.5, true, 0);
  // the tall grass of room C (x -14.6 … -12.2, z -2.6 … 2.2): crouched in it one is not seen, standing one is; it is walked through
  const cam = VIEWERS.find((w) => w.kind === 'cam'), c0 = { x: cam.x, z: cam.z, yaw: Math.atan2(-13.4 - cam.x, 0 - cam.z) }, gs = seeRate(cam, c0, -13.4, 0, false, 0), gl = seeRate(cam, c0, -13.4, 0, true, 0);
  const walk = put(-13.4, 3.4, { cores: 7 }); run(walk, 1.2, (st, i) => { i.y = 1; });
  check('what is low hides who crouches behind it, not who stands; crouched in front of it one is seen; tall grass hides who crouches in it, and is walked through', stand > 0 && low === 0 && front > 0 && gs > 0 && gl === 0 && walk.z < 1.5, `behind the crates: standing ${stand.toFixed(1)}/s, crouched ${low}; in the grass: standing ${gs.toFixed(1)}/s, crouched ${gl}; walked into it to z ${walk.z.toFixed(1)}`);
  // the searchlight is seen from its tower: a crate in its lane casts a shadow for who crouches
  const light = VIEWERS.find((w) => w.kind === 'light'), lp = { x: 7, z: -9.2 }, lit = seeRate(light, lp, 5.7, -8.9, false, 0), shade = seeRate(light, lp, 5.7, -8.9, true, 0), outside = seeRate(light, lp, 7, -14, false, 0);
  const beam = VIEWERS.find((w) => w.kind === 'beam'), on = seeRate(beam, { on: true }, 4.5, 0.4, true, 0), off = seeRate(beam, { on: false }, 4.5, 0.4, true, 0), beside = seeRate(beam, { on: true }, 5.3, 0.4, true, 0);
  check('the searchlight sees who is in its pool of light, but not who crouches in the shadow of a crate; a beam catches at once who crosses it while it is on, crouched or not', lit > 0 && shade === 0 && outside === 0 && on === Infinity && off === 0 && beside === 0 && TOWER.x > 13, `in the pool ${lit.toFixed(1)}/s, in the shadow ${shade}, out of it ${outside}`);
}
{
  // ---- the meter
  const filled = (d, crouch = false) => { const st = put(-13 + d, 25.5, { now: 0, crouch }); const v = VIEWERS[0]; v.phase = 0; let t = 0; const ev = []; const p0 = poseAt(v, 0, {}); for (; t < 3 && !st.caught; t += STEP) { st.now = 1 - STEP; stepRun(st, STEP, { x: 0, y: 0 }, ev); } return { t, p0 }; };
  // (robot 0 at 1 s into its round: it has left (-13, 25.5) eastwards 1 s ago; one stands `d` m ahead of where it is then)
  const at1 = poseAt(VIEWERS[0], 1, {}), near = filled(at1.x + 13 + 1.0).t, mid = filled(at1.x + 13 + 3.5).t, far = filled(at1.x + 13 + 7.6).t;
  check('the meter: full at once at arm\'s length, after half a second in plain sight, after more than a second at the far end of the cone', near <= STEP + 1e-9 && Math.abs(mid - S.see.fill) < 0.03 && far > 0.95 && far < 1.3 && rateAt(1, 8) === Infinity && Math.abs(1 / rateAt(4, 8) - 0.5) < 1e-9, `at 1 m: ${near.toFixed(3)} s; at 3.5 m: ${mid.toFixed(2)} s; at 7.6 m: ${far.toFixed(2)} s`);
  // seen for a quarter of a second, then out of sight: it empties, and one is not caught
  const st = put(at1.x + 3.5, 25.5); let peak = 0; for (let t = 0; t < 0.25; t += STEP) { st.now = 1 - STEP; stepRun(st, STEP, { x: 0, y: 0 }, null); peak = Math.max(peak, st.meter); }
  st.x = -5.25; st.z = 30.8; let empty = 0; for (let t = 0; t < 2 && st.meter > 0; t += STEP) { stepRun(st, STEP, { x: 0, y: 0 }, null); empty = t; }
  check('seen for a moment and gone again: the meter empties, nobody is caught', peak > 0.4 && peak < 0.6 && st.meter === 0 && st.caught === 0 && empty < S.see.drain && heatOf(st) > 0.3, `it rose to ${peak.toFixed(2)}, empty ${empty.toFixed(2)} s later; the music still tense (${heatOf(st).toFixed(2)})`);
}
{
  // ---- the moves: the stick, the button
  const speedOf = (drive, crouch) => { const st = put(-11, 30.8, { crouch }); run(st, 0.8, drive); return st; };
  const ran = speedOf((s, i) => { i.x = 1; }), walked = speedOf((s, i) => { i.x = 0.5; }), crept = speedOf((s, i) => { i.x = 1; }, true), up = speedOf((s, i) => { i.y = 1; });
  check('the stick: pushed fully one runs, gently one walks, crouched one creeps; right is right and up is the way one goes', Math.abs(ran.speed - S.run) < 1e-6 && Math.abs(walked.speed - S.walk * 0.5 / 0.6) < 1e-6 && Math.abs(crept.speed - S.crouch) < 1e-6 && ran.x > -8 && up.z < 30.8 && Math.abs(up.x + 11) < 1e-9 && ran.noise === S.noise && walked.noise === 0 && crept.noise === 0, `${ran.speed.toFixed(1)}, ${walked.speed.toFixed(1)} and ${crept.speed.toFixed(1)} m/s; only the run is heard (${ran.noise} m)`);
  const st = put(-11, 30.8), ev = run(st, 1, (s, i, t) => { i.jump = Math.abs(t - 0.2) < STEP / 2 || Math.abs(t - 0.6) < STEP / 2; }), held = put(-11, 30.8); run(held, 0.5, (s, i, t) => { i.jump = t < STEP; });
  check('the button is pressed, never held: once down, once more up again', ev.filter((e) => e.type === 'crouch').length === 1 && ev.filter((e) => e.type === 'stand').length === 1 && !st.crouch && held.crouch && !st.started, ev.map((e) => e.type).join(', '));
  // a wall stops one; nothing is walked through
  const wall = put(-11, 30.8); run(wall, 3, (s, i) => { i.y = 1; });
  check('a container stops one who walks into it', Math.abs(wall.z - (29.5 + S.body)) < 1e-6 && !solidAt(wall.x, wall.z, S.body - 1e-6, 0), `stopped at z ${wall.z.toFixed(2)}, the container at 29.5`);
}
{
  // ---- noise: a run is heard, and the robot turns to look
  // (the guard of the last room stands at (-1, -21.1) and looks east; one comes from the west, behind its back)
  const g = VIEWERS.findIndex((v) => v.still), from = (drive, crouch) => { const st = put(-9, -21.5, { crouch, cores: 7 }); st.save = 4; const ev = run(st, 2.2, (q, i) => { i.x = 0; if (q.x < -4.6) drive(q, i); }); return { st, ev }; };
  const ranAt = from((s, i) => { i.x = 1; }), crept = from((s, i) => { i.x = 1; }, true), soft = from((s, i) => { i.x = 0.5; });
  const turned = Math.abs(wrap(ranAt.st.look[g] - Math.PI / 2));
  check('a run within 5 m of a robot is heard: it turns to look, and sees; crouched or walking gently, one passes behind its back', ranAt.ev.some((e) => e.type === 'heard' && e.by === g) && turned > 2 && (ranAt.st.caught > 0 || ranAt.st.meter > 0.3) && !crept.ev.some((e) => e.type === 'heard') && crept.st.meter === 0 && !soft.ev.some((e) => e.type === 'heard') && Math.abs(wrap(crept.st.look[g] - Math.PI / 2)) < 1e-6, `at a run: heard, its head turned ${(turned * 57.3).toFixed(0)}°, the meter at ${ranAt.st.meter.toFixed(2)}${ranAt.st.caught ? ' (caught)' : ''}; crouched: ${crept.st.meter}`);
  // … and when the noise stops it turns back to its round
  const st = ranAt.st; run(st, 6, null);
  check('the noise over, the robot turns back to where its round has it', Math.abs(wrap(st.look[g] - Math.PI / 2)) < 1e-6 && st.alert[g] === 0, `${(wrap(st.look[g]) * 57.3).toFixed(0)}°`);
}
{
  // ---- caught: back to the last save, ten seconds more
  const st = put(11, 16.6); st.save = 1; st.started = true; st.clock = 30;
  const r = VIEWERS[1], t0 = (() => { for (let t = 0; t < r.period; t += 0.05) { const p = poseAt(r, t, {}); if (Math.abs(p.z - 16.4) < 0.01 && p.x > 2 && p.x < 3) return t; } return 0; })();
  st.now = t0; const ev = run(st, 4, null, (s, seen) => seen.some((e) => e.type === 'back'));
  const caught = ev.find((e) => e.type === 'caught'), back = ev.find((e) => e.type === 'back');
  check('caught: one stands a moment, is put back at the last save, and ten seconds are added', !!caught && !!back && Math.abs(back.at - caught.at - S.freeze) < 0.02 && st.x === SAVES[1].x && st.z === SAVES[1].z && st.caught === 1 && st.meter === 0 && Math.abs(timeOf(st) - Math.round((st.clock + S.penalty) * 1000)) < 1 && st.backs === 1, caught ? `caught ${(caught.at - t0).toFixed(2)} s after the robot came in sight, back ${(back.at - caught.at).toFixed(2)} s later; ${fmt(timeOf(st))} on the clock` : 'never caught');
  // the gates
  const shut = put(-11, 7.5); run(shut, 1.5, (s, i) => { i.y = 1; });
  const open = put(-11, 7.5, { cores: 1 }); run(open, 1.5, (s, i) => { i.y = 1; });
  const grab = put(-10.8, 12.25); const got = run(grab, 1.5, (s, i) => { i.x = 1; });
  check('a gate stays shut until one holds its core — picked up by walking to it —, then it is walked through; it hides what is behind it while shut', shut.z > 6.3 && open.z < 5.2 && open.save === 2 && got.some((e) => e.type === 'core' && e.n === 1 && e.gate === 1) && grab.cores === 1 && coresOf(grab) === 1 && !clear(-11, 8, -11, 4, false, 0) && clear(-11, 8, -11, 4, false, 1), `shut: stopped at z ${shut.z.toFixed(2)}; open: through to z ${open.z.toFixed(2)}, the save of the next room reached`);
}
{
  // ---- the hiding places of the way: never seen, whatever the clock
  let seen = 0, worst = '';
  for (let k = 0; k < ROUTE.length; k++) {
    const n = ROUTE[k]; if (!n.h) continue;
    for (let t = 0; t < 400; t += 0.07) for (const v of VIEWERS) if (seeRate(v, poseAt(v, t, {}), n.x, n.z, !!n.low, 7) > 0) { seen++; worst = `point ${k} (${n.x}, ${n.z}) by watcher ${v.i} at ${t.toFixed(1)} s`; }
  }
  check('nothing ever sees the hiding places of the way — the saves among them — at any moment of the rounds', seen === 0, seen ? `${seen} times: ${worst}` : `${ROUTE.filter((n) => n.h).length} places, 400 s of the rounds`);
}
let bots = [];
{
  // ---- the player that plays by itself: from any moment of the rounds
  const starts = [0, 3.7, 8.1, 13.3, 17.9, 23, 31.4, 47.7, 64.2, 101.5, 333.3, 7777.7];
  let reacted = Infinity;
  bots = starts.map((now) => { let sawAt = -1; const st = botRun(now, {}, (s, ev) => { for (const e of ev) if (e.type === 'seen') sawAt = s.now; }); return { now, st, time: st.time, caught: st.caught, tense: st.tense }; });
  void reacted;
  const times = bots.map((b) => b.time), ok = bots.every((b) => b.st.over && !b.st.out && b.time > 0);
  const caught = bots.reduce((a, b) => a + b.caught, 0);
  check('the player that plays by itself gets through from twelve different moments of the rounds: three cores, the door — caught once at the very most in all of them', ok && caught <= 1 && bots.every((b) => coresOf(b.st) === 3 && b.st.save === 4 && progressOf(b.st) === 1), `${fmt(Math.min(...times))} to ${fmt(Math.max(...times))}; caught ${caught} times in ${bots.length} runs`);
  check('a run takes two to four minutes of sneaking: long enough, and never the same wait twice', Math.min(...times) > 100_000 && Math.max(...times) < 260_000 && new Set(times).size > 8, times.map(fmt).join(', '));
  // its limits: it never leaves a hiding place less than a quarter of a second after the moment came (it is written so: S.react), and what it does is a person's — the stick and one button
  const st = startRun(5), input = { x: 0, y: 0, jump: false }; let presses = 0, most = 0, steps = 0;
  for (let k = 0; !st.over && k < 400 * 120; k++) { botInput(st, input); if (input.jump) presses++; most = Math.max(most, Math.hypot(input.x, input.y)); stepRun(st, STEP, input, null); steps++; }
  check('it plays with what a person has: a stick never pushed beyond its rim, one button pressed now and then', st.over && most <= 1 + 1e-9 && presses > 4 && presses < 80 && S.react >= 0.25, `${presses} presses of the button in ${fmt(st.time)}`);
}
{
  // ---- a clumsy one, and one who does nothing
  const clumsy = [1, 2, 3].map((seed) => botRun(seed * 11.3, { clumsy: true, seed }));
  const best = Math.max(...bots.map((b) => b.time));
  check('a clumsy player — it runs everywhere, never crouches, never waits — is caught again and again, and still ends at the door: a mistake costs seconds, not the run', clumsy.every((st) => st.over && !st.out && st.caught >= 5 && st.time > best), clumsy.map((st) => `${fmt(st.time)} (caught ${st.caught} times)`).join(', '));
  const idle = startRun(0); run(idle, 120, null);
  const dither = startRun(0); run(dither, 120, (s, i, t) => { i.x = Math.sin(t * 2) > 0 ? 1 : -1; });
  check('standing still wins nothing: no time runs, nothing is reached; nor does walking up and down at the start', !idle.over && !idle.started && idle.clock === 0 && timeOf(idle) === 0 && !dither.over && dither.save === 0 && dither.started, `idle: ${idle.clock} s; up and down: ${dither.clock.toFixed(0)} s on the clock, still in the first room`);
  // forty that push the stick and the button at random: none ever out of the yard or inside anything, none at the door
  let astray = 0, home = 0, caught = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const st = startRun(seed * 3.1), input = { x: 0, y: 0, jump: false };
    for (let k = 0; k < 60 * 120 && !st.over; k++) { const beat = Math.floor(k / 40); input.x = rnd(seed, beat) * 2 - 1; input.y = rnd(seed, beat + 7777) * 2 - 0.6; input.jump = rnd(seed, k + 99999) < 0.004; stepRun(st, STEP, input, null); if (!(Math.abs(st.x) <= 15) || !(st.z <= 32) || solidAt(st.x, st.z, S.body - 0.01, st.cores) || !Number.isFinite(st.x + st.z + st.meter)) astray++; }
    if (st.over) home++; caught += st.caught;
  }
  check('forty players who push the stick and the button at random: never out of the yard, never inside anything, none gets to the door', astray === 0 && home === 0 && caught > 20, `caught ${caught} times between them`);
}
{
  // ---- the same at any number of frames; the music
  const at = (fps) => { const st = startRun(10), input = { x: 0, y: 0, jump: false }; let t = 0; for (let f = 0; f < 6 * fps; f++) { t = f / fps; input.x = t < 1.1 ? 1 : 0; input.y = t >= 1.1 && t < 1.4 ? 1 : 0; input.jump = Math.abs(t - 2) < 0.5 / fps; stepRun(st, 1 / fps, input, null); } return st; };
  const a = at(120), b = at(30), c = at(144);
  check('the same run at 30, 120 and 144 frames a second', Math.hypot(a.x - b.x, a.z - b.z) < 0.25 && Math.hypot(a.x - c.x, a.z - c.z) < 0.25 && a.crouch && b.crouch && c.crouch && Math.abs(a.clock - b.clock) < 0.05 && Math.abs(a.clock - c.clock) < 0.05, `(${a.x.toFixed(2)}, ${a.z.toFixed(2)}), (${b.x.toFixed(2)}, ${b.z.toFixed(2)}), (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`);
  const fresh = startRun(0), tense = startRun(0); tense.meter = 0.9; const far = startRun(0); far.save = 4; far.cores = 7;
  check('for its music: calm at the start, tense when nearly seen, a little more as one gets on — always between 0 and 1', heatOf(fresh) < 0.2 && heatOf(tense) > 0.65 && heatOf(far) > heatOf(fresh) + 0.15 && heatOf(far) < 0.5 && [fresh, tense, far].every((s) => heatOf(s) >= 0 && heatOf(s) <= 1), `${heatOf(fresh).toFixed(2)}, ${heatOf(tense).toFixed(2)}, ${heatOf(far).toFixed(2)}`);
}
{
  // ---- its board
  const least = Math.floor(SHORTEST / S.run) * 1000, best = Math.min(...bots.map((b) => b.time));
  const line = { order: 'asc', min: 20_000, max: 1800_000 };
  check('the board of scores in rules.js: its least under what the shortest way takes at a run, its most over the limit of a run', BOARD.order === line.order && BOARD.min === line.min && BOARD.max === line.max && BOARD.min < least && BOARD.min < best * 0.5 && BOARD.max >= S.limit * 1000, `${SHORTEST.toFixed(0)} m as the crow flies: ${fmt(least)} at a run; ${JSON.stringify(BOARD)}`);
  { const B = SERVER.sneak || {}; check('the server keeps its board by the same line (server/scores.js), behind its switch', B.order === BOARD.order && B.min === BOARD.min && B.max === BOARD.max && B.release === 'sneak', JSON.stringify(B)); }
  console.log(`      for the board of scores: sneak: { order: 'asc', min: 20_000, max: 1800_000 }`);
}
void sight; void DOOR;
done();
