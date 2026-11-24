// The Little Regatta: its rules. No renderer here: the game, its checks and the boats that sail by themselves
// all read this.
//
// Radio-controlled boats race on the Great Pond: three laps of a course of gates — two buoys each — that turns
// before the circuit of The Endless Pond, runs west along the deck, through the neck of the pond into its far
// half, round, and back along the south bank. One steers one's own from the bank, against the clock and against
// three boats that sail by themselves. A boat is driven like a small fast thing on water: it takes a moment to
// gather way, it slides when thrown into a turn, it bounces off the bank, off the buoys and off the others;
// a burst of speed is there for the asking when it has had time to come back.
//
// Headings are counted the way the valley's are: 0 looks south (+z), and they grow turning left. Time advances
// in steps of 1/120 s whatever the frame rate.
import { PONDS } from '../../../layout/layout.js';

export const REGATTA = {
  name: 'The Little Regatta',
  laps: 3,
  level: PONDS[0].level, // the water
  // the gates, in the order they are taken: the middle of each (the first is the start, and the line)
  gates: [[-146, 66.5], [-137.5, 62], [-137.5, 52], [-144, 49], [-157, 49.5], [-169, 51.5], [-180, 56], [-190, 63], [-197, 72], [-195, 82], [-187, 79], [-183, 69.5], [-172, 64], [-159, 65.5]],
  width: 6.4, // m between the two buoys of a gate
  stand: { from: [-146, 71], towards: [0.25, 1] }, // where one steers from: the bank reached from there, going that way (found when it is built)
  // where no boat goes: the circuit of The Endless Pond, the deck on its piles
  keepOut: [{ x: -124.5, z: 56, r: 9.3 }],
  box: { x0: -161.2, x1: -143.8, z0: 30.8, z1: 44.2 },
  step: 1 / 120,
  top: 10.5, accel: 10, back: 3.5, // m/s flat out; m/s² ahead, astern
  turn: 2.1, grip: 3.0, // rad/s at the helm, with way on; how fast a slide dies out (1/s)
  burst: { gain: 1.32, time: 1.6, wait: 7 }, // a burst: so much faster, for so long, and back after so long
  radius: 0.5, buoy: 0.42, // of a boat, of a buoy (m), for what runs into what
  shallow: 0.3, // m of water a boat needs
  grid: [[-1.5, -2.2], [1.5, -3.6], [-1.5, -5.0], [1.5, -6.4]], // where the boats start from: across (m, right of the course), and along (behind the line)
  bots: [{ name: 'Blue', skill: 0.9 }, { name: 'Yellow', skill: 0.94 }, { name: 'Green', skill: 0.975 }],
};

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const turnTo = (from, to) => { let d = (to - from) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };

let laid = null;
/**
 * The course, laid once: { gates: [{ x, z, dx, dz (the way one goes through it), yaw, left, right ([x, z] of its
 * buoys), s (metres from the start, along the line) }], line: [{ x, z, s }] (the way round, a point every half
 * metre or so), length }.
 */
export function course() {
  if (laid) return laid;
  const G = REGATTA.gates, n = G.length, line = [];
  // a smooth way round through the middles of the gates (Catmull-Rom, closed)
  const at = (i, t) => {
    const p0 = G[(i + n - 1) % n], p1 = G[i], p2 = G[(i + 1) % n], p3 = G[(i + 2) % n], t2 = t * t, t3 = t2 * t;
    return [0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
  };
  const marks = [];
  let s = 0, prev = null;
  for (let i = 0; i < n; i++) {
    const steps = Math.max(8, Math.round(Math.hypot(G[(i + 1) % n][0] - G[i][0], G[(i + 1) % n][1] - G[i][1]) * 2));
    for (let k = 0; k < steps; k++) {
      const [x, z] = at(i, k / steps);
      if (prev) s += Math.hypot(x - prev[0], z - prev[1]);
      if (k === 0) marks.push(line.length);
      line.push({ x, z, s });
      prev = [x, z];
    }
  }
  const length = s + Math.hypot(line[0].x - prev[0], line[0].z - prev[1]);
  const gates = marks.map((m) => {
    const a = line[(m + line.length - 1) % line.length], b = line[(m + 1) % line.length], p = line[m], d = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const dx = (b.x - a.x) / d, dz = (b.z - a.z) / d, h = REGATTA.width / 2;
    // (to the right of the way one goes: (-dz, dx) turned the valley's way is (-cos, sin) of the heading)
    const yaw = Math.atan2(dx, dz), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    return { x: p.x, z: p.z, dx, dz, yaw, rx, rz, left: [p.x - rx * h, p.z - rz * h], right: [p.x + rx * h, p.z + rz * h], s: p.s, at: m };
  });
  laid = { gates, line, length };
  return laid;
}

/** Where the way round is `s` metres from the start: { x, z }. */
export function lineAt(s, out = {}) {
  const C = course(), L = C.line, n = L.length;
  s = ((s % C.length) + C.length) % C.length;
  let lo = 0, hi = n - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (L[mid].s <= s) lo = mid; else hi = mid - 1; }
  const a = L[lo], b = L[(lo + 1) % n], span = (lo + 1 < n ? b.s : C.length) - a.s, t = span > 0 ? (s - a.s) / span : 0;
  out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t;
  return out;
}

/**
 * A race about to start: the visitor's boat (the first) and those that sail by themselves, on the grid behind
 * the line. `depth(x, z)`: how much water there is at a place (m) — the bank is where there is too little.
 */
export function startRace(depth) {
  const C = course(), g = C.gates[0];
  const boat = (k, bot) => {
    const [across, along] = REGATTA.grid[k];
    return {
      x: g.x + g.rx * across + g.dx * along, z: g.z + g.rz * across + g.dz * along, yaw: g.yaw, vx: 0, vz: 0, helm: 0, way: 0,
      gate: 0, lap: 0, passed: 0, done: false, time: 0, burst: 0, ready: REGATTA.burst.wait * 0.5, bumps: 0, aground: 0, missed: false,
      bot, name: bot ? bot.name : 'You', skill: bot ? bot.skill : 1, s: -(-along), seed: k * 1.7,
    };
  };
  // (the visitor starts from the back of the grid: there is something to catch up with)
  return { clock: 0, acc: 0, boats: [boat(REGATTA.bots.length, null), ...REGATTA.bots.map((b, i) => boat(i, b))], depth, over: false, time: 0, place: 0, finished: 0 };
}

/**
 * Advances a race by `dt` seconds. `input`: what the visitor's boat is asked — { throttle (-1 astern … 1 ahead),
 * helm (-1 to port … 1 to starboard), burst (true on the frame it is asked) }. `events`, when given, is filled
 * with what happened to the visitor's boat: { type: 'gate' (n, lap) | 'lap' (lap, time) | 'missed' | 'bank' |
 * 'buoy' | 'boat' | 'burst' | 'finish' (time, place) }. Returns the race.
 */
export function stepRace(race, dt, input, events) {
  if (input?.burst) race.boats[0].want = 0.2;
  race.acc += Math.min(dt, 0.25);
  while (race.acc >= REGATTA.step) { race.acc -= REGATTA.step; sub(race, REGATTA.step, input, events); }
  return race;
}

const _bot = { throttle: 0, helm: 0, burst: false }, IDLE = { throttle: 0, helm: 0, burst: false }, _p = {};
function sub(race, dt, input, events) {
  const R = REGATTA, C = course(), G = C.gates;
  race.clock += dt;
  for (const b of race.boats) {
    const mine = b === race.boats[0], ev = mine ? events : null;
    const ask = b.bot ? sail(race, b, _bot) : input || IDLE;
    const top = R.top * b.skill, burst = b.burst > 0;
    // ---- the helm: it answers with way on (and the other way going astern). The boat turns; what it was
    // doing goes on a moment the way it was going — it slides
    b.helm += (clamp(ask.helm || 0, -1, 1) - b.helm) * Math.min(1, dt * 9);
    b.yaw -= b.helm * R.turn * clamp(Math.abs(b.way) / 3.5, 0.2, 1) * (b.way < -0.3 ? -1 : 1) * dt; // (to starboard is turning right: headings grow turning left)
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), rx = -fz, rz = fx;
    let vf = b.vx * fx + b.vz * fz, vs = b.vx * rx + b.vz * rz;
    // ---- way: the screw pushes, the water holds back, a slide dies out
    const want = b.done ? 0 : clamp(ask.throttle || 0, -1, 1), push = want >= 0 ? R.accel * b.skill * want * (burst ? 1.7 : 1) : R.back * want;
    const limit = top * (burst ? R.burst.gain : 1);
    vf += (push - (R.accel * b.skill) * (vf * Math.abs(vf)) / (limit * limit) * (burst && want > 0 ? 1.7 : 1) - (b.done ? vf * 1.2 : 0)) * dt;
    vs *= Math.max(0, 1 - R.grip * dt);
    b.vx = fx * vf + rx * vs; b.vz = fz * vf + rz * vs; b.way = vf;
    // ---- a burst, when it is asked and has come back
    if (b.burst > 0) b.burst -= dt; else if (b.ready > 0) b.ready -= dt;
    if (b.want > 0) b.want -= dt;
    if ((mine ? b.want > 0 : ask.burst) && b.burst <= 0 && b.ready <= 0 && !b.done) { b.burst = R.burst.time; b.ready = R.burst.wait; b.want = 0; ev?.push({ type: 'burst' }); }
    // ---- on: unless the bank, a buoy, the circuit or the deck is in the way
    const px = b.x, pz = b.z;
    b.x += b.vx * dt; b.z += b.vz * dt;
    let hit = null, nx = 0, nz = 0;
    if (race.depth(b.x, b.z) < R.shallow) {
      // (the bank: the way back to deeper water is the way out)
      const e = 0.6; nx = race.depth(b.x + e, b.z) - race.depth(b.x - e, b.z); nz = race.depth(b.x, b.z + e) - race.depth(b.x, b.z - e);
      hit = 'bank';
    }
    for (const k of R.keepOut) { const dx = b.x - k.x, dz = b.z - k.z; if (dx * dx + dz * dz < k.r * k.r) { hit = 'bank'; nx = dx; nz = dz; } }
    if (b.x > R.box.x0 && b.x < R.box.x1 && b.z > R.box.z0 && b.z < R.box.z1) {
      hit = 'bank';
      const out = [[b.x - R.box.x0, -1, 0], [R.box.x1 - b.x, 1, 0], [b.z - R.box.z0, 0, -1], [R.box.z1 - b.z, 0, 1]].sort((p, q) => p[0] - q[0])[0];
      nx = out[1]; nz = out[2];
    }
    if (!hit) for (const g of G) for (const q of [g.left, g.right]) { const dx = b.x - q[0], dz = b.z - q[1]; if (dx * dx + dz * dz < (R.radius + R.buoy) ** 2) { hit = 'buoy'; nx = dx; nz = dz; } }
    if (hit) {
      const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      b.x = px + nx * 0.02; b.z = pz + nz * 0.02;
      const into = b.vx * nx + b.vz * nz;
      if (into < 0) { b.vx -= 1.5 * into * nx; b.vz -= 1.5 * into * nz; b.vx *= 0.6; b.vz *= 0.6; }
      if (b.aground <= 0) { b.bumps++; ev?.push({ type: hit }); }
      b.aground = 0.4;
    } else if (b.aground > 0) b.aground -= dt;
    // ---- the gate that comes: through it, between its buoys, the right way
    if (!b.done) {
      const g = G[b.gate], was = (px - g.x) * g.dx + (pz - g.z) * g.dz, now = (b.x - g.x) * g.dx + (b.z - g.z) * g.dz;
      if (was < 0 && now >= 0) {
        if (Math.abs((b.x - g.x) * g.rx + (b.z - g.z) * g.rz) < R.width / 2 + 0.3) {
          b.missed = false;
          if (b.gate === 0 && b.passed > 0) {
            b.lap++;
            if (b.lap >= R.laps) { b.done = true; b.time = Math.round(race.clock * 1000); b.place = ++race.finished; if (mine) { race.over = true; race.time = b.time; race.place = b.place; } ev?.push({ type: 'finish', time: b.time, place: b.place }); }
            else ev?.push({ type: 'lap', lap: b.lap, time: Math.round(race.clock * 1000) });
          } else ev?.push({ type: 'gate', n: b.gate, lap: b.lap });
          b.passed++; b.gate = (b.gate + 1) % G.length;
        } else if (!b.missed) { b.missed = true; ev?.push({ type: 'missed', n: b.gate }); }
      }
    }
    // (how far round it is: for who is ahead of whom)
    const g = G[b.gate], togo = Math.hypot(g.x - b.x, g.z - b.z);
    b.s = b.passed === 0 ? -togo : (b.lap * C.length + (b.gate === 0 ? C.length : g.s)) - togo;
  }
  // ---- boats that touch push one another apart
  for (let i = 0; i < race.boats.length; i++) for (let j = i + 1; j < race.boats.length; j++) {
    const a = race.boats[i], b = race.boats[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1e-6, need = REGATTA.radius * 2;
    if (d >= need) continue;
    const nx = dx / d, nz = dz / d, push = (need - d) / 2, rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
    if (rel < 0) { a.vx += nx * rel * 0.5; a.vz += nz * rel * 0.5; b.vx -= nx * rel * 0.5; b.vz -= nz * rel * 0.5; if (i === 0 && a.aground <= 0) { a.aground = 0.4; events?.push({ type: 'boat' }); } }
  }
}

/** How a boat that sails by itself steers: for a point of the way round a little ahead of it, easing off when it has to turn hard. */
function sail(race, b, out) {
  const C = course(), G = C.gates, g = G[b.gate];
  // (where it is along the way: the gate it makes for, less how far it still is from it)
  const here = (b.gate === 0 && b.passed > 0 ? C.length : g.s) - Math.hypot(g.x - b.x, g.z - b.z);
  const ahead = lineAt(here + 4.5 + Math.abs(b.way) * 0.55, _p), want = Math.atan2(ahead.x - b.x, ahead.z - b.z), off = turnTo(b.yaw, want);
  out.helm = clamp(-off * 2.4 + Math.sin(race.clock * 0.9 + b.seed) * 0.05 * (1 - b.skill) * 8, -1, 1);
  out.throttle = race.clock < 0 ? 0 : Math.abs(off) > 0.75 ? 0.45 : 1;
  out.burst = Math.abs(off) < 0.12 && b.ready <= 0;
  return out;
}

/** Steers the visitor's boat as one that sails by itself would (for the checks, a film): the input for stepRace. */
export function botHelm(race, out = { throttle: 0, helm: 0, burst: false }) { const o = sail(race, race.boats[0], _bot); out.throttle = o.throttle; out.helm = o.helm; out.burst = o.burst; return out; }

/** Who is where: the boats, the first first. */
export const ranking = (race) => [...race.boats].sort((a, b) => (a.done && b.done ? a.time - b.time : a.done ? -1 : b.done ? 1 : b.s - a.s));
