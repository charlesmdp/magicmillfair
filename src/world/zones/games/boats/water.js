// The Little Regatta: its rules. No renderer here: the game, its checks and the boats that sail by themselves
// all read this.
//
// Radio-controlled boats race on the Great Pond: three laps of a course of gates — two buoys each — that turns
// before the circuit of The Endless Pond, runs west along the deck, through the neck of the pond into its far
// half, round, and back along the south bank. One steers one's own from the bank, against the clock, against
// three boats that sail by themselves — and against whoever left with the same start. A boat is driven like a
// small fast thing on water: it takes a moment to gather way, it slides when thrown into a turn, it bounces off
// the bank, off the buoys and off the boats that sail by themselves; a burst of speed is there for the asking
// when it has had time to come back.
//
// A start every ten seconds, on the clock everybody shares, each with a name: whoever asks for the same one
// leaves at the same instant. The three boats that sail by themselves are the same for everybody of one start —
// they are worked out from its number, they are stepped by that clock, and a visitor's boat does not push them
// off their way (it takes the whole of the bump): so every screen shows the same race. The boats of the other
// visitors are not run into: each is where its owner's screen says it is, a few times a second.
//
// Headings are counted the way the valley's are: 0 looks south (+z), and they grow turning left. Time advances
// in steps of 1/120 s whatever the frame rate. The sines and the square roots are the game's own (core.js): the
// same digits on every machine, so that the boats that sail by themselves are where they are for everybody.
import { PONDS } from '../../../layout/layout.js';
import { sin, cos, hypot, rngOf } from '../core.js';

export const REGATTA = {
  name: 'The Little Regatta',
  laps: 3,
  level: PONDS[0].level, // the water
  // the gates, in the order they are taken: the middle of each (the first is the start, and the line)
  gates: [[-146, 66.5], [-137.5, 62], [-137.5, 52], [-144, 49], [-157, 49.5], [-169, 51.5], [-180, 56], [-190, 63], [-197, 72], [-195, 82], [-187, 79], [-183, 69.5], [-172, 64], [-159, 65.5]],
  width: 6.4, // m between the two buoys of a gate
  stand: { from: [-146, 71], towards: [0.25, 1] }, // where one steers from: the bank reached from there, going that way (found when it is built)
  // where no boat goes: the circuit of The Endless Pond, the deck on its piles
  keepOut: [{ x: -124.5, z: 56, r: 9.3 }, { x: -130.5, z: 69.5, r: 5.3 }, { x: -116.5, z: 31, r: 11.4 }], // (the three circuits of The Endless Pond)
  box: { x0: -161.2, x1: -143.8, z0: 30.8, z1: 44.2 },
  step: 1 / 120,
  top: 10.5, accel: 10, back: 3.5, // m/s flat out; m/s² ahead, astern
  turn: 2.1, grip: 3.0, // rad/s at the helm, with way on; how fast a slide dies out (1/s)
  burst: { gain: 1.32, time: 1.6, wait: 7 }, // a burst: so much faster, for so long, and back after so long
  radius: 0.5, buoy: 0.42, // of a boat, of a buoy (m), for what runs into what
  close: 0.9, bump: 1.2, // a visitor's boat and one that sails by itself: how near their middles may come (m), and from what speed into one another a touch is a bump (m/s)
  shallow: 0.3, // m of water a boat needs
  // the starts: one every so many seconds on the clock everybody shares, and how long before it one may still
  // join (s); their names, in turn (signal flags — not the colours of the boats)
  every: 10, late: 0.5,
  starts: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'],
  // where the boats start from: across (m, right of the course), and along (behind the line) — the three that
  // sail by themselves, then the visitors abreast behind them, each as far from the line as the others
  grid: [[-1.5, -2.2], [1.5, -3.6], [-1.5, -5.0]],
  row: { along: -6.4, across: [-2.1, -0.7, 0.7, 2.1] },
  // the boats that sail by themselves: how good each is, and the side of the way round it keeps to (m to the
  // right of it: the faster ones pass the slower ones without a bump — the inside of the course is the shorter
  // way, which is why Blue needs less skill than Yellow to be the slower of the two). Each ends 2 % later than
  // it first did: about 50.2, 48.9 and 47.5 s. And how much better or worse each is from one start to the next
  // (a share of its skill)
  bots: [{ name: 'Blue', skill: 0.865, lane: -1.1 }, { name: 'Yellow', skill: 0.944, lane: 0.95 }, { name: 'Green', skill: 0.956, lane: 0 }],
  mood: 0.015,
};

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * The angle whose sine and cosine are in the proportion s : c — what the language calls atan2(s, c), with the
 * same digits on every machine: a first guess, then two steps of Newton with the game's own sine and cosine.
 */
export function angleOf(s, c) {
  const l = Math.sqrt(s * s + c * c);
  if (!(l > 0)) return 0;
  s /= l; c /= l;
  let a;
  if (Math.abs(s) <= Math.abs(c)) { const t = s / c; a = t / (1 + 0.28 * t * t) + (c < 0 ? (s >= 0 ? Math.PI : -Math.PI) : 0); }
  else { const t = c / s; a = (s > 0 ? Math.PI / 2 : -Math.PI / 2) - t / (1 + 0.28 * t * t); }
  for (let i = 0; i < 2; i++) { const sa = sin(a), ca = cos(a); a -= (sa * c - ca * s) / (ca * c + sa * s); }
  return a;
}

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
    const steps = Math.max(8, Math.round(hypot(G[(i + 1) % n][0] - G[i][0], G[(i + 1) % n][1] - G[i][1]) * 2));
    for (let k = 0; k < steps; k++) {
      const [x, z] = at(i, k / steps);
      if (prev) s += hypot(x - prev[0], z - prev[1]);
      if (k === 0) marks.push(line.length);
      line.push({ x, z, s });
      prev = [x, z];
    }
  }
  const length = s + hypot(line[0].x - prev[0], line[0].z - prev[1]);
  const gates = marks.map((m) => {
    const a = line[(m + line.length - 1) % line.length], b = line[(m + 1) % line.length], p = line[m], d = hypot(b.x - a.x, b.z - a.z) || 1;
    const dx = (b.x - a.x) / d, dz = (b.z - a.z) / d, h = REGATTA.width / 2;
    // (to the right of the way one goes: (-cos, sin) of the heading — and the heading's sine and cosine are dx, dz)
    const yaw = angleOf(dx, dz), rx = -dz, rz = dx;
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

/** The start number `n` (they are counted from the beginning of the clock everybody shares): { n, name, at (ms on that clock) }. */
export function startOf(n) {
  const names = REGATTA.starts;
  return { n, name: names[((n % names.length) + names.length) % names.length], at: n * REGATTA.every * 1000 };
}

/**
 * The start a visitor who asks at `now` (ms, on the clock everybody shares) leaves with: the next one, as long
 * as it is still `least` seconds away — one may join until the last moment, and the name that is shown does not
 * change before that start has left. { n, name, at, wait (seconds until it) }.
 */
export function nextStart(now, least = REGATTA.late) {
  const start = startOf(Math.ceil((now + least * 1000) / (REGATTA.every * 1000)));
  start.wait = (start.at - now) / 1000;
  return start;
}

/**
 * A race about to start: the visitor's boat (the first) and those that sail by themselves, on the grid behind
 * the line. `depth(x, z)`: how much water there is at a place (m) — the bank is where there is too little.
 * `start`: the number of the start it leaves with — the boats that sail by themselves are a little better or
 * worse from one start to the next, and the same for everybody of one start. `slot`: which place of the
 * visitors' row is this visitor's (0 to 3).
 */
export function startRace(depth, start = 0, slot = 3) {
  const R = REGATTA, C = course(), g = C.gates[0];
  const boat = (across, along, bot, k) => {
    const roll = bot ? rngOf((Math.imul(start | 0, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b)) >>> 0) : null;
    return {
      x: g.x + g.rx * across + g.dx * along, z: g.z + g.rz * across + g.dz * along, yaw: g.yaw, vx: 0, vz: 0, helm: 0, way: 0,
      gate: 0, lap: 0, passed: 0, done: false, time: 0, burst: 0, ready: R.burst.wait * 0.5, bumps: 0, aground: 0, missed: false,
      bot, name: bot ? bot.name : 'You', skill: bot ? bot.skill * (1 + (roll() * 2 - 1) * R.mood) : 1, s: along, seed: bot ? roll() * TAU : 0, lane: bot ? bot.lane : 0,
    };
  };
  const mine = R.row.across[((slot % R.row.across.length) + R.row.across.length) % R.row.across.length];
  // (the visitor starts from behind the others: there is something to catch up with)
  return { clock: 0, steps: 0, acc: 0, start, boats: [boat(mine, R.row.along, null, 0), ...R.bots.map((b, i) => boat(R.grid[i][0], R.grid[i][1], b, i))], depth, over: false, time: 0, place: 0, finished: 0 };
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
  while (race.acc >= REGATTA.step) { race.acc -= REGATTA.step; tick(race, input, events); }
  return race;
}

/**
 * Brings a race to `t` seconds after its start — the time it is on the clock everybody shares: whole steps, as
 * many as that takes (never more than `most` in one go: a page that slept catches up over a few frames), so
 * that two screens that left with the same start are at the same step at the same moment. `drive(race, input)`,
 * when given, is asked before each step what the visitor's boat does. Returns the race.
 */
export function runTo(race, t, input, events, drive = null, most = 720) {
  const due = Math.floor(t / REGATTA.step + 1e-6);
  if (input?.burst) race.boats[0].want = 0.2;
  for (let n = 0; race.steps < due && n < most; n++) {
    if (drive) { drive(race, input); if (input.burst) race.boats[0].want = 0.2; } // (asked at this very step: the same race however many steps a frame holds)
    tick(race, input, events);
  }
  return race;
}

/** One step: the clock of a race is the number of its steps (no sum that drifts). */
function tick(race, input, events) {
  race.steps++;
  race.clock = race.steps * REGATTA.step;
  sub(race, REGATTA.step, input, events);
}

const _bot = { throttle: 0, helm: 0, burst: false }, IDLE = { throttle: 0, helm: 0, burst: false }, _p = {}, _q = {};
function sub(race, dt, input, events) {
  const R = REGATTA, C = course(), G = C.gates;
  for (const b of race.boats) {
    const mine = b === race.boats[0], ev = mine ? events : null;
    const ask = b.bot ? sail(race, b, _bot) : input || IDLE;
    const top = R.top * b.skill, burst = b.burst > 0;
    // ---- the helm: it answers with way on (and the other way going astern). The boat turns; what it was
    // doing goes on a moment the way it was going — it slides
    b.helm += (clamp(ask.helm || 0, -1, 1) - b.helm) * Math.min(1, dt * 9);
    b.yaw -= b.helm * R.turn * clamp(Math.abs(b.way) / 3.5, 0.2, 1) * (b.way < -0.3 ? -1 : 1) * dt; // (to starboard is turning right: headings grow turning left)
    const fx = sin(b.yaw), fz = cos(b.yaw), rx = -fz, rz = fx;
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
    if (b.touched > 0) b.touched -= dt;
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
      const l = hypot(nx, nz) || 1; nx /= l; nz /= l;
      b.x = px + nx * 0.02; b.z = pz + nz * 0.02;
      const into = b.vx * nx + b.vz * nz;
      if (into < 0) { b.vx -= 1.5 * into * nx; b.vz -= 1.5 * into * nz; b.vx *= 0.6; b.vz *= 0.6; }
      if (b.aground <= 0) { b.bumps++; ev?.push({ type: hit }); }
      b.aground = 0.4;
    } else if (b.aground > 0) b.aground -= dt;
    // ---- the gate that comes: through it, between its buoys, the right way. (Which side of its line the boat
    // is on is compared with what it was at the last look — not with where the boat was when this step began:
    // another boat may have pushed it over the line in between)
    if (!b.done) {
      const g = G[b.gate], now = (b.x - g.x) * g.dx + (b.z - g.z) * g.dz, was = b.looked === b.gate ? b.side : (px - g.x) * g.dx + (pz - g.z) * g.dz;
      b.looked = b.gate; b.side = now;
      if (was < 0 && now >= 0) {
        if (Math.abs((b.x - g.x) * g.rx + (b.z - g.z) * g.rz) < R.width / 2 + 0.3) {
          b.missed = false;
          if (b.gate === 0 && b.passed > 0) {
            b.lap++;
            if (b.lap >= R.laps) { b.done = true; b.time = Math.round(race.clock * 1000); b.place = ++race.finished; if (mine) { race.over = true; race.time = b.time; race.place = b.place; } ev?.push({ type: 'finish', time: b.time, place: b.place }); }
            else ev?.push({ type: 'lap', lap: b.lap, time: Math.round(race.clock * 1000) });
          } else ev?.push({ type: 'gate', n: b.gate, lap: b.lap });
          b.passed++; b.gate = (b.gate + 1) % G.length; b.looked = -1;
        } else if (!b.missed) { b.missed = true; ev?.push({ type: 'missed', n: b.gate }); }
      }
    }
    // (how far round it is: for who is ahead of whom)
    const g = G[b.gate], togo = hypot(g.x - b.x, g.z - b.z);
    b.s = b.passed === 0 ? -togo : (b.lap * C.length + (b.gate === 0 ? C.length : g.s)) - togo;
  }
  // ---- boats that touch. Two that sail by themselves push one another apart and share the bump. A visitor's
  // boat does not push one of them off its way — theirs is the same race for everybody who left with that
  // start —: it is turned out of the way, sideways, by the side it is already on (and straight back for what
  // that does not undo). Rubbing along one costs nothing; running into one is a bump, and takes most of the way
  // that carried it there
  for (let i = 0; i < race.boats.length; i++) for (let j = i + 1; j < race.boats.length; j++) {
    const a = race.boats[i], b = race.boats[j], dx = b.x - a.x, dz = b.z - a.z, d = hypot(dx, dz) || 1e-6, both = !a.bot === !b.bot, need = both ? REGATTA.radius * 2 : REGATTA.close;
    if (d >= need) continue;
    const nx = dx / d, nz = dz / d, rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (both) {
      const push = (need - d) / 2;
      a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
      if (rel < 0) { a.vx += nx * rel * 0.5; a.vz += nz * rel * 0.5; b.vx -= nx * rel * 0.5; b.vz -= nz * rel * 0.5; }
    } else {
      const me = a.bot ? b : a, it = a.bot ? a : b, o = a.bot ? 1 : -1, ox = o * nx, oz = o * nz; // (ox, oz): from the other boat to this one
      const hx = sin(me.yaw), hz = cos(me.yaw), side = ox * -hz + oz * hx >= 0 ? 1 : -1, px = -hz * side, pz = hx * side, op = ox * px + oz * pz;
      const slide = Math.min(0.04, -d * op + Math.sqrt(d * d * op * op + need * need - d * d));
      me.x += px * slide; me.z += pz * slide;
      const ex = me.x - it.x, ez = me.z - it.z, el = hypot(ex, ez) || 1e-6;
      if (el < need) { me.x += (ex / el) * (need - el); me.z += (ez / el) * (need - el); }
      if (-rel > REGATTA.bump && !(me.touched > 0)) { me.vx -= ox * rel * 0.6; me.vz -= oz * rel * 0.6; if (me === race.boats[0]) events?.push({ type: 'boat' }); }
      me.touched = 0.4;
    }
  }
}

/** How a boat that sails by itself steers: for a point of the way round a little ahead of it, easing off when it has to turn hard. */
function sail(race, b, out) {
  const C = course(), G = C.gates, g = G[b.gate];
  // (where it is along the way: the gate it makes for, less how far it still is from it)
  const here = (b.gate === 0 && b.passed > 0 ? C.length : g.s) - hypot(g.x - b.x, g.z - b.z);
  const far = here + 4.5 + Math.abs(b.way) * 0.55, ahead = lineAt(far, _p), fx = sin(b.yaw), fz = cos(b.yaw);
  let ax = ahead.x - b.x, az = ahead.z - b.z;
  // (its side of the way: so far to the right of where the way goes, there)
  if (b.lane) { const on = lineAt(far + 0.75, _q), dx = on.x - ahead.x, dz = on.z - ahead.z, l = hypot(dx, dz) || 1; ax -= (dz / l) * b.lane; az += (dx / l) * b.lane; }
  // (how far off its heading that point lies: the angle from where it looks to where it wants to go)
  const off = angleOf(ax * fz - az * fx, ax * fx + az * fz);
  out.helm = clamp(-off * 2.4 + sin(race.clock * 0.9 + b.seed) * 0.05 * (1 - b.skill) * 8, -1, 1);
  out.throttle = Math.abs(off) > 0.75 ? 0.45 : 1;
  out.burst = Math.abs(off) < 0.12 && b.ready <= 0;
  return out;
}

/** Steers the visitor's boat as one that sails by itself would (for the checks, a film): the input for stepRace. */
export function botHelm(race, out = { throttle: 0, helm: 0, burst: false }) { const o = sail(race, race.boats[0], _bot); out.throttle = o.throttle; out.helm = o.helm; out.burst = o.burst; return out; }

/** Who is where: the boats, the first first. */
export const ranking = (race) => [...race.boats].sort((a, b) => (a.done && b.done ? a.time - b.time : a.done ? -1 : b.done ? 1 : b.s - a.s));

// ---------------------------------------------------------------------------------------- the others' boats
//
// What a visitor's game says of its boat to the others, a few times a second, and what it makes of what it is
// told: eight numbers, carried by the one message of the game's network for "a thing I steer in a game"
// (server/protocol.js, {t:'v'}; the kind of thing a boat of this regatta is: THING).
export const THING = 1;

/** What is said of a boat: [x, z, heading (within a turn), way (m/s), how far round (m), 1 done + 2 in a burst, the clock of the race (ms), its time (ms, once done)]. */
export function tellBoat(race, b = race.boats[0]) {
  let yaw = b.yaw % TAU; if (yaw > Math.PI) yaw -= TAU; else if (yaw < -Math.PI) yaw += TAU;
  return [b.x, b.z, yaw, b.way, b.s, (b.done ? 1 : 0) | (b.burst > 0 ? 2 : 0), Math.round(race.clock * 1000), b.done ? b.time : 0];
}

/** What is made of what was said of a boat — null when it makes no sense (the pond is not that big, a boat not that fast). */
export function heardBoat(d) {
  if (!Array.isArray(d) || d.length < 8 || !d.every(Number.isFinite)) return null;
  const [x, z, yaw, way, s, flags, t, time] = d;
  if (Math.abs(x) > 600 || Math.abs(z) > 600 || Math.abs(yaw) > 7 || Math.abs(way) > 40 || Math.abs(s) > 1e5 || t < -60_000 || t > 3600_000 || time < 0 || time > 3600_000) return null;
  return { x, z, yaw, way, s, done: !!(flags & 1), burst: !!(flags & 2), t, time };
}
