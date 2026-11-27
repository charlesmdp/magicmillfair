// Robots Can See You: its rules, without a renderer (the game, its checks and the player that plays by itself
// read them). A yard of alleys on a quay — containers, crates, sandbags — five rooms in a row, and what watches
// them: robots on their rounds, each with a cone of sight; cameras that sweep; a searchlight whose pool of light
// crosses the open yard; beams of light that blink across an alley. One slips through, picks up three cores (each
// opens a gate) and reaches the door at the far end.
//
//   the stick walks (pushed fully while standing: one runs — fast, and HEARD: a robot within earshot turns to look)
//   the button toggles crouching: slow, silent, and hidden behind what is low (crates, sandbags, tall grass)
//
// Seen, a meter fills: full after half a second in plain sight (longer at the far end of a cone, at once at arm's
// length) — caught: back to the last save, seconds added. Out of sight it empties. The rounds go by the clock
// everybody shares (`now`, seconds): the same for everybody, learnt run after run; only where a robot LOOKS can be
// turned for a moment, by a noise. Time in steps of 1/120 s; nothing random.
//
// The frame of the yard: x to the right of who looks along it (-15 … 15), z towards who looks: one starts at
// z = +31 and the door out is at z = -32. A heading is atan2(x, z): 0 looks towards +z, π the way one goes.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (a) => { a %= TAU; return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a; };
/** A number in [0, 1) drawn from two whole numbers. */
export const rnd = (a, b = 0) => { let h = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul((b | 0) + 0x7F4A7C15, 0x85EBCA6B)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };

export const SNEAK = {
  name: 'Robots Can See You',
  at: { x: 104, z: 80 }, // the middle of the yard, on its quay in the south of the bay
  yaw: -Math.PI / 2, // the way the yard is turned: one goes through it eastwards, out to sea
  deck: 1.5, // m over the sea: the floor of the yard
  gate: { x: 60, z: 80 }, // where one asks to play: on the sand, at the foot of the quay
  half: { x: 15, z: 32 },
  step: 1 / 120,
  body: 0.34, // m: the radius of whoever sneaks
  run: 5.2, walk: 2.7, crouch: 1.9, // m/s
  full: 0.85, // of the stick: pushed so far while standing, one runs
  accel: 38, // m/s²
  noise: 6, // m: how far a run is heard
  grab: 0.95, // m: a core is picked up from so near
  see: { range: 8, half: 0.5, near: 1.3, fill: 0.5, far: 1.15, drain: 0.8, touch: 0.75 }, // a robot's cone: m, rad; s to fill the meter (in plain sight, at the far end), s to empty it
  cam: { range: 10.5, half: 0.3 },
  light: { r: 2.7, fill: 0.45 },
  alert: { hold: 1.5, turn: 5.5, back: 3.5 }, // a robot that hears: looks so long towards the noise, turns so fast (rad/s)
  penalty: 10, // s added each time one is caught
  freeze: 1.3, // s one stands caught before being put back
  react: 0.25, // s: the player that plays by itself moves so long after it has seen its moment
  limit: 1790, // s (with the seconds added): after that the run is called off
};
const S = SNEAK, STEP = S.step;

// ------------------------------------------------------------------------------------------------ the yard

/** What stands in the yard: boxes in plan. k: 'tall' (hides always, stops), 'low' (hides who crouches, stops), 'grass' (hides who crouches, is walked through). */
export const BOXES = [];
const T = (x0, z0, x1, z1, look = 'cont') => { BOXES.push({ x0, z0, x1, z1, k: 'tall', look }); };
const L = (x0, z0, x1, z1, look = 'crate') => { BOXES.push({ x0, z0, x1, z1, k: 'low', look }); };
const G = (x0, z0, x1, z1) => { BOXES.push({ x0, z0, x1, z1, k: 'grass', look: 'grass' }); };
const GATE = (n, x0, z0, x1, z1) => { BOXES.push({ x0, z0, x1, z1, k: 'tall', look: 'gate', gate: n }); };

// the fence round the yard, and the walls between its rooms (their doors: 2.6 m)
T(-15.4, -32.4, -15, 32.4, 'fence'); T(15, -32.4, 15.4, 32.4, 'fence'); T(-15, 32, 15, 32.4, 'fence');
T(-15, -32.4, -1.3, -32, 'fence'); T(1.3, -32.4, 15, -32, 'fence'); GATE(3, -1.3, -32.3, 1.3, -32.1);
T(-15, 18.7, 9.7, 19.3, 'wall'); T(12.3, 18.7, 15, 19.3, 'wall');
T(-15, 5.7, -12.3, 6.3, 'wall'); T(-9.7, 5.7, 15, 6.3, 'wall'); GATE(1, -12.3, 5.85, -9.7, 6.15);
T(-15, -6.3, 9.7, -5.7, 'wall'); T(12.3, -6.3, 15, -5.7, 'wall');
T(-15, -19.3, -12.3, -18.7, 'wall'); T(-9.7, -19.3, 15, -18.7, 'wall'); GATE(2, -12.3, -19.15, -9.7, -18.85);

// ---- room A (z 32 … 19): one patrol to wait for, along an alley between two rows of containers
T(-15, 27.1, -6.5, 29.5); T(-4, 27.1, 15, 29.5);
T(-15, 21.5, 3, 23.9); T(5.5, 21.5, 15, 23.9);
L(-1.2, 26.3, 0.2, 27.1); L(8.4, 23.9, 9.8, 24.6);
// ---- room B (19 … 6): two robots go round a block, one after the other; core 1 in a notch of the block
T(9.4, 17.3, 9.7, 18.7, 'fence'); T(12.3, 17.3, 12.6, 18.7, 'fence'); // (the porch of its door)
T(12.6, 6.3, 15, 18.7); T(-15, 6.3, -12.6, 15.2); T(-15, 17.6, -12.6, 18.7); T(-15, 15.2, -14.2, 17.6); // (a pocket at the corner)
T(-7.4, 9.9, 9, 13.3); T(-9, 9.9, -7.4, 11.2);
T(-9, 13.3, -5, 14.9); T(-2.5, 13.3, 2.5, 14.9); T(5, 13.3, 9, 14.9);
// ---- room C (6 … -6): a camera over a square crossed behind sandbags; a beam of light across an alley; a second camera
T(-12.6, 4.3, -12.3, 5.7, 'fence'); T(-9.7, 4.3, -9.4, 5.7, 'fence');
L(-10, 0.6, -2, 1.3, 'bags');
T(-15, -5.7, -9.5, -3.3); G(-14.6, -2.6, -12.2, 2.2);
T(0, 1.5, 15, 5.7); T(0, -5.7, 9, -1.5);
L(10.3, -2.6, 12.6, -1.9, 'crate');
// ---- room D (-6 … -19): the open yard — the searchlight, a robot that turns on the spot; core 2 behind sandbags
T(9.4, -7.7, 9.7, -6.3, 'fence'); T(12.3, -7.7, 12.6, -6.3, 'fence');
T(0.4, -14.5, 2.8, -9.6); L(-8, -9.6, 0.4, -8.9, 'bags');
T(-9.5, -15.5, -7.1, -10.5);
L(6.4, -10.6, 7.6, -9.8, 'crate'); L(5.2, -15.4, 6.4, -14.2, 'crate');
T(3, -18.7, 9, -16.9); G(-3.6, -18.4, 0.4, -16.4);
// ---- room E (-19 … -32): a guard that listens, a beam, a patrol along the last alley; core 3 at its far end
T(-12.6, -20.7, -12.3, -19.3, 'fence'); T(-9.7, -20.7, -9.4, -19.3, 'fence');
T(-15, -27.7, -6.5, -22.9); T(8, -27.7, 10.5, -22.9); T(13, -27.7, 15, -22.9); T(10.5, -26.1, 13, -22.9);
T(-3.5, -27.7, 0.5, -22.9); T(3, -27.7, 5, -22.9); T(0.5, -26.1, 3, -22.9);
L(-9.6, -31.2, -8.2, -30.5, 'crate'); L(8.6, -31.9, 10, -31.2, 'crate');

/** The three cores: each opens a gate (the box of BOXES with the same number). */
export const CORES = [{ x: -8.2, z: 12.25, gate: 1 }, { x: -4, z: -7.9, gate: 2 }, { x: 11.75, z: -26.9, gate: 3 }];
/** The gates, by their number - 1: where each stands (its middle), and the core that opens it. */
export const GATES = BOXES.filter((b) => b.gate).sort((a, b) => a.gate - b.gate).map((b) => ({ n: b.gate, x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, box: b }));
/** The saves: the start, then the door of each room. */
export const SAVES = [{ x: -11, z: 30.8 }, { x: 11, z: 18.2 }, { x: -11, z: 5.0 }, { x: 11, z: -7.2 }, { x: -11, z: -20.1 }];
export const ROOMS = ['The first alley', 'Round the block', 'The camera and the beam', 'The open yard', 'The last alley'];
export const DOOR = { x: 0, z: -32.2 }; // the door out
export const TOWER = { x: 14.2, z: -12.5 }; // where the searchlight stands

// ------------------------------------------------------------------------------------------------ what watches

const heading = (a, b) => Math.atan2(b[0] - a[0], b[1] - a[1]);
/** A round: the robot walks from point to point (and back, or round and round), turning at each. → its timeline. */
function patrol(pts, { speed = 2.2, turn = 2.6, loop = false, phase = 0, pause = 0.25 } = {}) {
  const order = loop ? [...pts, pts[0]] : [...pts, ...pts.slice(0, -1).reverse()], segs = [];
  const first = heading(order[0], order[1]);
  let yaw = first;
  const spin = (p, to) => { const d = wrap(to - yaw); if (Math.abs(d) > 1e-6) segs.push({ x0: p[0], z0: p[1], x1: p[0], z1: p[1], y0: yaw, y1: yaw + d, dur: pause + Math.abs(d) / turn, hold: pause }); yaw = to; };
  for (let i = 0; i + 1 < order.length; i++) {
    const a = order[i], b = order[i + 1], h = heading(a, b);
    spin(a, h);
    segs.push({ x0: a[0], z0: a[1], x1: b[0], z1: b[1], y0: h, y1: h, dur: Math.hypot(b[0] - a[0], b[1] - a[1]) / speed, hold: 0 });
  }
  spin(order[order.length - 1], first);
  let t = 0; for (const s of segs) { s.t = t; t += s.dur; }
  return { segs, period: t, phase };
}
/** A robot that stands and turns on the spot, all the way round in `period` s (or does not turn at all). */
function post(x, z, yaw, period = 0, phase = 0) {
  return { segs: [{ x0: x, z0: z, x1: x, z1: z, y0: yaw, y1: yaw + (period ? TAU : 0), dur: period || 60, hold: 0, t: 0 }], period: period || 60, phase };
}
const RING = [[-10.8, 16.4], [10.8, 16.4], [10.8, 8.1], [-10.8, 8.1]], ROUND = patrol(RING, { speed: 2.3, loop: true });
/**
 * What watches, in the order of the rooms. kind 'robot': a cone that walks (and hears); 'cam': a cone that sweeps
 * from a pole; 'light': the searchlight — a pool of light that goes to and fro, seen from its tower; 'beam': a line
 * of light across an alley, on and off.
 */
export const VIEWERS = [
  { kind: 'robot', room: 0, ...patrol([[-13, 25.5], [13, 25.5]], { speed: 2.2 }) },
  { kind: 'robot', room: 1, ...ROUND, phase: 0 },
  { kind: 'robot', room: 1, ...ROUND, phase: ROUND.period / 2 },
  { kind: 'robot', room: 3, ...post(-4, -12.5, 0, 9), spins: true },
  { kind: 'robot', room: 4, ...post(-1, -21.1, Math.PI / 2), still: true },
  { kind: 'robot', room: 4, ...patrol([[-13, -29.8], [13, -29.8]], { speed: 2.2 }) },
  { kind: 'cam', room: 2, x: -6, z: -5.3, base: 0, amp: 0.9, period: 9, phase: 0 },
  { kind: 'cam', room: 2, x: 14.6, z: 1.2, base: -2.6, amp: 0.45, period: 7, phase: 0.3, range: 8.5 },
  { kind: 'light', room: 3, x0: 7, z0: -8.6, x1: 7, z1: -16.5, period: 9, phase: 0 },
  { kind: 'beam', room: 2, x0: 4.5, z0: -1.5, x1: 4.5, z1: 1.5, on: 1.5, off: 1.7, phase: 0 },
  { kind: 'beam', room: 4, x0: -6.5, z0: -25.3, x1: -3.5, z1: -25.3, on: 1.3, off: 1.6, phase: 0.8 },
];
VIEWERS.forEach((v, i) => { v.i = i; if (v.kind === 'robot') { v.range = S.see.range; v.half = S.see.half; } if (v.kind === 'cam') { v.range ??= S.cam.range; v.half = S.cam.half; } if (v.kind === 'light') v.r = S.light.r; });
export const ROBOTS = VIEWERS.filter((v) => v.kind === 'robot').length; // (the robots come first: their index is that of what they look at)

/** Where a watcher is at `t` (s of the shared clock) and where it looks, by its round alone: out.x, out.z, out.yaw (a light: the middle of its pool; a beam: out.on, out.soon — s before it comes on). */
export function poseAt(v, t, out = {}) {
  if (v.kind === 'robot') {
    let u = (t + v.phase) % v.period; if (u < 0) u += v.period;
    let s = v.segs[v.segs.length - 1];
    for (let i = 0; i < v.segs.length; i++) if (u < v.segs[i].t + v.segs[i].dur) { s = v.segs[i]; break; }
    const k = clamp((u - s.t) / s.dur, 0, 1), ky = s.hold ? clamp((u - s.t - s.hold) / (s.dur - s.hold), 0, 1) : k;
    out.x = s.x0 + (s.x1 - s.x0) * k; out.z = s.z0 + (s.z1 - s.z0) * k; out.yaw = wrap(s.y0 + (s.y1 - s.y0) * ky);
    out.moving = s.x0 !== s.x1 || s.z0 !== s.z1;
  } else if (v.kind === 'cam') {
    out.x = v.x; out.z = v.z; out.yaw = v.base + v.amp * Math.sin(TAU * (t / v.period + v.phase));
  } else if (v.kind === 'light') {
    const u = 0.5 - 0.5 * Math.cos(TAU * (t / v.period + v.phase));
    out.x = v.x0 + (v.x1 - v.x0) * u; out.z = v.z0 + (v.z1 - v.z0) * u; out.yaw = 0;
  } else {
    const p = v.on + v.off; let u = (t + v.phase) % p; if (u < 0) u += p;
    out.on = u < v.on; out.soon = out.on ? 0 : p - u; out.left = out.on ? v.on - u : 0;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ what hides

const opaque = (b, crouched, cores) => (b.gate ? !(cores & (1 << (b.gate - 1))) : b.k === 'tall' || crouched);
const solid = (b, cores) => (b.gate ? !(cores & (1 << (b.gate - 1))) : b.k !== 'grass');
/** How far along the straight line from (ax, az) to (bx, bz) — 0 … 1 — something hides what is behind it; 1: nothing does. */
export function sight(ax, az, bx, bz, crouched = false, cores = 0) {
  const dx = bx - ax, dz = bz - az;
  let best = 1;
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    if (!opaque(b, crouched, cores)) continue;
    let t0 = 0, t1 = best;
    if (dx > -1e-12 && dx < 1e-12) { if (ax <= b.x0 || ax >= b.x1) continue; } else {
      let u = (b.x0 - ax) / dx, w = (b.x1 - ax) / dx; if (u > w) { const q = u; u = w; w = q; }
      if (u > t0) t0 = u; if (w < t1) t1 = w; if (t0 >= t1) continue;
    }
    if (dz > -1e-12 && dz < 1e-12) { if (az <= b.z0 || az >= b.z1) continue; } else {
      let u = (b.z0 - az) / dz, w = (b.z1 - az) / dz; if (u > w) { const q = u; u = w; w = q; }
      if (u > t0) t0 = u; if (w < t1) t1 = w; if (t0 >= t1) continue;
    }
    best = t0;
  }
  return best;
}
/** Is (bx, bz) seen from (ax, az): nothing that hides in between? */
export const clear = (ax, az, bx, bz, crouched, cores) => sight(ax, az, bx, bz, crouched, cores) >= 1;

/** How fast the meter fills (1/s) for one seen by a robot or a camera from `d` m, its cone `range` long: at once at arm's length. */
export function rateAt(d, range) {
  if (d < S.see.near) return Infinity;
  const u = clamp((d / range - 0.55) / 0.45, 0, 1);
  return 1 / (S.see.fill + (S.see.far - S.see.fill) * u * u * (3 - 2 * u));
}
const _beam = (v, x, z) => { const ex = v.x1 - v.x0, ez = v.z1 - v.z0, k = clamp(((x - v.x0) * ex + (z - v.z0) * ez) / (ex * ex + ez * ez), 0, 1); return Math.hypot(x - v.x0 - ex * k, z - v.z0 - ez * k); };
/**
 * Does watcher `v`, placed as `p` says (poseAt; p.yaw: where it looks), see whoever is at (x, z)? → how fast the
 * meter fills (1/s): 0 unseen, Infinity caught at once. `wide`, `far`: a margin, for who plans.
 */
export function seeRate(v, p, x, z, crouched, cores, wide = 0, far = 0) {
  if (v.kind === 'beam') return p.on && _beam(v, x, z) < S.body + far ? Infinity : 0;
  if (v.kind === 'light') {
    if (Math.hypot(x - p.x, z - p.z) > v.r + far) return 0;
    return clear(TOWER.x, TOWER.z, x, z, crouched, cores) ? 1 / S.light.fill : 0;
  }
  const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
  if (d > v.range + far) return 0;
  if (v.kind === 'robot' && d < S.see.touch + far) return Infinity; // (one walked into it)
  if (Math.abs(wrap(Math.atan2(dx, dz) - p.yaw)) > v.half + wide) return 0;
  if (!clear(p.x, p.z, x, z, crouched, cores)) return 0;
  return rateAt(d, v.range);
}
/** How far a ray from (ox, oz) towards heading `yaw` goes before something hides the rest: at most `max` m. */
export function reach(ox, oz, yaw, max, crouched = false, cores = 0) {
  return max * sight(ox, oz, ox + Math.sin(yaw) * max, oz + Math.cos(yaw) * max, crouched, cores);
}

// ------------------------------------------------------------------------------------------------ a run

/** A run begins: at the start, standing; `now`: the shared clock (s) as it begins. Its time is counted from the first step. */
export function startRun(now = 0) {
  return {
    now, clock: 0, started: false, acc: 0, press: false,
    x: SAVES[0].x, z: SAVES[0].z, vx: 0, vz: 0, face: Math.PI, crouch: false, noise: 0, speed: 0,
    meter: 0, tense: 0, watched: -1, sees: new Uint8Array(VIEWERS.length), by: -1,
    look: new Float32Array(ROBOTS), alert: new Float32Array(ROBOTS), ax: new Float32Array(ROBOTS), az: new Float32Array(ROBOTS), fresh: true,
    caught: 0, backs: 0, freeze: 0, save: 0, cores: 0, over: false, out: false, time: 0, bot: null,
  };
}
/** What a run has cost so far (ms): its clock, and the seconds added each time one was caught. */
export const timeOf = (st) => Math.round((st.clock + st.caught * S.penalty) * 1000);
/** How many cores one holds. */
export const coresOf = (st) => (st.cores & 1) + ((st.cores >> 1) & 1) + ((st.cores >> 2) & 1);
/** How far a run has come, 0 … 1: the saves reached and the cores held. */
export const progressOf = (st) => (st.over && !st.out ? 1 : (st.save + coresOf(st)) / (SAVES.length + CORES.length));
/** For its music, 0 … 1: how near one is to being caught (and was, a moment ago), and a little of how far one has got. */
export const heatOf = (st) => clamp(0.1 + 0.22 * progressOf(st) + 0.68 * Math.max(st.meter, st.tense), 0, 1);

const _p = {};
/** Where robot `i` looks now: its round, unless a noise turned its head. */
export function lookOf(st, i, t = st.now) { return st.alert[i] > 0 || st.look[i] !== st.look[i] ? st.look[i] : poseAt(VIEWERS[i], t, _p).yaw; }

function collide(st) {
  const r = S.body;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i];
    if (st.x < b.x0 - r || st.x > b.x1 + r || st.z < b.z0 - r || st.z > b.z1 + r || !solid(b, st.cores)) continue;
    const cx = clamp(st.x, b.x0, b.x1), cz = clamp(st.z, b.z0, b.z1), dx = st.x - cx, dz = st.z - cz, d = Math.hypot(dx, dz);
    if (d >= r) continue;
    if (d > 1e-6) { st.x = cx + (dx / d) * r; st.z = cz + (dz / d) * r; } else {
      // (inside it: out by the nearest side)
      const l = st.x - b.x0, rr = b.x1 - st.x, n = st.z - b.z0, f = b.z1 - st.z, m = Math.min(l, rr, n, f);
      if (m === l) st.x = b.x0 - r; else if (m === rr) st.x = b.x1 + r; else if (m === n) st.z = b.z0 - r; else st.z = b.z1 + r;
    }
  }
}

function tick(st, input, events) {
  st.now += STEP;
  if (st.started) st.clock += STEP;
  const now = st.now;
  // ---- caught: one stands a moment, then is put back at the last save
  if (st.freeze > 0) {
    st.freeze -= STEP;
    if (st.freeze <= 0) {
      const s = SAVES[st.save];
      st.x = s.x; st.z = s.z; st.vx = 0; st.vz = 0; st.crouch = false; st.meter = 0; st.noise = 0; st.speed = 0; st.backs++; st.by = -1; st.watched = -1;
      st.sees.fill(0); st.alert.fill(0);
      events?.push({ type: 'back', save: st.save });
    }
  } else {
    // ---- the button: down, or up again
    if (st.press) { st.crouch = !st.crouch; events?.push({ type: st.crouch ? 'crouch' : 'stand' }); }
    // ---- the stick
    let ix = input.x || 0, iy = input.y || 0, m = Math.hypot(ix, iy);
    if (m > 1) { ix /= m; iy /= m; m = 1; }
    const moving = m > 0.12, running = moving && !st.crouch && m >= S.full;
    if (moving && !st.started) { st.started = true; events?.push({ type: 'step' }); }
    const top = !moving ? 0 : st.crouch ? S.crouch * Math.min(1, m / 0.7) : running ? S.run : S.walk * Math.min(1, m / 0.6);
    const tx = moving ? (ix / m) * top : 0, tz = moving ? (-iy / m) * top : 0, a = S.accel * STEP;
    st.vx += clamp(tx - st.vx, -a, a); st.vz += clamp(tz - st.vz, -a, a);
    st.x += st.vx * STEP; st.z += st.vz * STEP;
    collide(st);
    st.speed = Math.hypot(st.vx, st.vz);
    if (st.speed > 0.4) st.face = Math.atan2(st.vx, st.vz);
    st.noise = running && st.speed > S.walk + 0.4 ? S.noise : 0;
  }
  st.press = false;
  // ---- the robots: where each looks — its round, or towards a noise it heard
  for (let i = 0; i < ROBOTS; i++) {
    const v = VIEWERS[i], p = poseAt(v, now, _p);
    if (st.fresh) st.look[i] = p.yaw;
    if (st.noise > 0 && Math.hypot(st.x - p.x, st.z - p.z) < st.noise) {
      if (st.alert[i] <= 0) events?.push({ type: 'heard', by: i });
      st.alert[i] = S.alert.hold; st.ax[i] = st.x; st.az[i] = st.z;
    }
    if (st.alert[i] > 0) {
      st.alert[i] -= STEP;
      const d = wrap(Math.atan2(st.ax[i] - p.x, st.az[i] - p.z) - st.look[i]), w = S.alert.turn * STEP;
      st.look[i] = wrap(st.look[i] + clamp(d, -w, w));
      if (st.alert[i] <= 0) st.alert[i] = -1; // (it turns back)
    } else if (st.alert[i] < 0) {
      const d = wrap(p.yaw - st.look[i]), w = S.alert.back * STEP;
      if (Math.abs(d) <= w) { st.look[i] = p.yaw; st.alert[i] = 0; } else st.look[i] = wrap(st.look[i] + Math.sign(d) * w);
    } else st.look[i] = p.yaw;
  }
  st.fresh = false;
  if (st.freeze > 0 || st.over) return;
  // ---- who sees one: the meter
  let rate = 0, by = -1;
  for (let i = 0; i < VIEWERS.length; i++) {
    const v = VIEWERS[i], p = poseAt(v, now, _p);
    if (i < ROBOTS) p.yaw = st.look[i];
    const r = seeRate(v, p, st.x, st.z, st.crouch, st.cores);
    st.sees[i] = r > 0 ? 1 : 0;
    if (r > rate) { rate = r; by = i; }
  }
  if (rate > 0) {
    if (st.watched < 0) events?.push({ type: 'seen', by });
    st.watched = by; st.by = by;
    st.meter = rate === Infinity ? 1 : Math.min(1, st.meter + rate * STEP);
  } else { st.watched = -1; st.meter = Math.max(0, st.meter - STEP / S.see.drain); }
  st.tense = Math.max(st.meter, st.tense - STEP / 5);
  if (st.meter >= 1) {
    st.caught++; st.freeze = S.freeze; st.vx = 0; st.vz = 0; st.noise = 0; st.speed = 0;
    events?.push({ type: 'caught', by, n: st.caught });
    if (timeOf(st) >= S.limit * 1000) { st.over = true; st.out = true; events?.push({ type: 'out' }); }
    return;
  }
  // ---- the cores, the saves, the door
  for (let k = 0; k < CORES.length; k++) {
    if (st.cores & (1 << k)) continue;
    const c = CORES[k];
    if (Math.hypot(st.x - c.x, st.z - c.z) < S.grab) { st.cores |= 1 << k; events?.push({ type: 'core', n: k + 1, gate: c.gate }); }
  }
  for (let k = st.save + 1; k < SAVES.length; k++) if (Math.hypot(st.x - SAVES[k].x, st.z - SAVES[k].z) < 1.5) { st.save = k; events?.push({ type: 'save', n: k }); }
  if (st.z < -S.half.z - 0.6) { st.over = true; st.time = timeOf(st); events?.push({ type: 'finish', time: st.time, caught: st.caught }); }
  else if (timeOf(st) >= S.limit * 1000) { st.over = true; st.out = true; events?.push({ type: 'out' }); }
}

/**
 * The run goes on by `dt` s — in steps of 1/120 s, whatever the frames are. input: { x, y: the stick (y up: the
 * way one goes), jump: the button, pressed }. What happens is added to `events`: step, crouch, stand, heard, seen,
 * caught, back, core, save, finish, out.
 */
export function stepRun(st, dt, input, events = null) {
  if (input.jump) st.press = true;
  if (st.over) return st;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= STEP - 1e-9 && !st.over) { st.acc -= STEP; tick(st, input, events); }
  return st;
}

// ------------------------------------------------------------------------------------------------ the player that plays by itself

/**
 * The way through, from point to point (straight lines one can walk). h: a place where nothing sees one — it
 * waits there for its moment; low: one gets there crouched (and waits crouched).
 */
export const ROUTE = [
  // room A
  { x: -11, z: 30.8, h: 1 }, { x: -5.25, z: 30.8 }, { x: -5.25, z: 28.4, h: 1 }, { x: -5.25, z: 26.5 }, { x: 4.25, z: 24.5 }, { x: 4.25, z: 22.5, h: 1 },
  { x: 4.25, z: 20.4 }, { x: 11, z: 20.4 }, { x: 11, z: 18.2, h: 1 },
  // room B
  { x: 11, z: 16.7 }, { x: 3.75, z: 15.9 }, { x: 3.75, z: 13.9, h: 1 }, { x: 3.75, z: 15.9 }, { x: -3.75, z: 15.9 }, { x: -3.75, z: 13.9, h: 1 },
  { x: -3.75, z: 15.9 }, { x: -13.5, z: 16.4, h: 1 }, { x: -11.4, z: 16.2 }, { x: -10.8, z: 12.25 }, { x: -8.2, z: 12.25, h: 1 }, { x: -10.9, z: 12.25 }, { x: -11, z: 7.4 }, { x: -11, z: 5.0, h: 1 },
  // room C
  { x: -11, z: 3.6 }, { x: -9.4, z: 1.9, low: 1, h: 1 }, { x: -2.4, z: 1.9, low: 1, h: 1 }, { x: 0.6, z: 0.2 }, { x: 3.0, z: 0, h: 1 }, { x: 7.0, z: 0.5, h: 1 },
  { x: 9.5, z: -0.9 }, { x: 9.6, z: -3.3 }, { x: 11.3, z: -3.3, low: 1, h: 1 }, { x: 11, z: -5.0 }, { x: 11, z: -7.2, h: 1 },
  // room D
  { x: 11, z: -8.5 }, { x: 3.5, z: -11.4, h: 1 }, { x: 3.4, z: -8.0 }, { x: -0.5, z: -7.9, low: 1, h: 1 }, { x: -4, z: -7.9, low: 1, h: 1 }, { x: -7.6, z: -7.9, low: 1, h: 1 },
  { x: -11.6, z: -8.4 }, { x: -12.2, z: -13, h: 1 }, { x: -11, z: -17.3 }, { x: -11, z: -20.1, h: 1 },
  // room E
  { x: -11, z: -21.5 }, { x: -5, z: -21.7 }, { x: -5, z: -24, h: 1 }, { x: -5, z: -26.4, h: 1 }, { x: -5, z: -28.6 }, { x: 1.75, z: -28.6 }, { x: 1.75, z: -26.9, h: 1 },
  { x: 1.75, z: -28.6 }, { x: 6.5, z: -28.6 }, { x: 6.5, z: -26.4, h: 1 }, { x: 6.5, z: -28.6 }, { x: 11.75, z: -28.6 }, { x: 11.75, z: -26.9, h: 1 },
  { x: 11.75, z: -28.6 }, { x: 6.5, z: -28.6 }, { x: 6.5, z: -26.4, h: 1 }, { x: 6.5, z: -28.6 }, { x: 1.75, z: -28.6 }, { x: 1.75, z: -26.9, h: 1 },
  { x: 1.75, z: -28.8 }, { x: 0, z: -30.6 }, { x: 0, z: -33.4 },
];
SAVES.forEach((s) => { s.node = ROUTE.findIndex((n) => Math.hypot(n.x - s.x, n.z - s.z) < 0.01); });

const _q = {};
/** Would one be seen, heard or caught at (x, z) at time `t` — by the rounds alone, with a margin? */
export function danger(st, t, x, z, crouched, noisy) {
  for (let i = 0; i < VIEWERS.length; i++) {
    const v = VIEWERS[i];
    if (v.kind === 'beam') { if (_beam(v, x, z) < S.body + 0.5 && (poseAt(v, t, _q).on || poseAt(v, t - 0.3, _q).on || poseAt(v, t + 0.3, _q).on)) return true; continue; }
    const p = poseAt(v, t, _q);
    if (v.kind === 'robot' && noisy && Math.hypot(x - p.x, z - p.z) < S.noise + 0.7) return true;
    if (seeRate(v, p, x, z, crouched, st.cores, 0.12, 0.6) > 0) return true;
  }
  return false;
}
/** Leaving node `k` after `delay` s, at a run or crouched: does one reach the next hiding place unseen and unheard? */
export function safe(st, k, crouching, delay) {
  let t = st.now + delay, x = ROUTE[k].x, z = ROUTE[k].z;
  for (let j = k + 1; j < ROUTE.length; j++) {
    const n = ROUTE[j], low = crouching || !!n.low, len = Math.hypot(n.x - x, n.z - z), v = (low ? S.crouch : S.run) * 0.96, steps = Math.max(1, Math.ceil(len / (v / 30)));
    for (let s = 1; s <= steps; s++) { const u = s / steps; if (danger(st, t + (u * len) / v, x + (n.x - x) * u, z + (n.z - z) * u, low, !low)) return false; }
    t += len / v + 0.03; x = n.x; z = n.z;
    if (n.h) break;
  }
  return true;
}
/**
 * The player that plays by itself, with a person's limits: it goes from hiding place to hiding place; at each it
 * watches the rounds, and leaves a quarter of a second after it has seen a moment that stays good for a quarter of
 * a second more — at a run if nothing would hear it, crouched if not. `clumsy`: one that runs everywhere and never
 * waits for anything (it stands a moment, as `seed` says, each time it is put back).
 */
export function botInput(st, input, { clumsy = false, seed = 1 } = {}) {
  const B = (st.bot ||= { at: 0, go: -1, crouch: false, backs: 0, next: 0, since: st.now, hold: 0 });
  input.x = 0; input.y = 0; input.jump = false;
  if (st.over || st.freeze > 0) return input;
  if (B.backs !== st.backs) { B.backs = st.backs; B.at = SAVES[st.save].node; B.go = -1; B.since = st.now; B.hold = clumsy ? 0.3 + 3 * rnd(seed, st.backs) : 0; B.next = 0; }
  if (B.at >= ROUTE.length - 1) return input;
  if (B.go < 0) {
    if (clumsy) { if (st.now - B.since >= B.hold) { B.go = st.now; B.crouch = false; } }
    else if (st.now >= B.next) {
      B.next = st.now + 0.1;
      const run = safe(st, B.at, false, S.react) && safe(st, B.at, false, 2 * S.react);
      if (run || (safe(st, B.at, true, S.react) && safe(st, B.at, true, 2 * S.react))) { B.go = st.now + S.react; B.crouch = !run; }
    }
    return input;
  }
  if (st.now < B.go) return input;
  const n = ROUTE[B.at + 1], want = !clumsy && (B.crouch || !!n.low);
  if (st.crouch !== want) { input.jump = true; return input; }
  const dx = n.x - st.x, dz = n.z - st.z, d = Math.hypot(dx, dz);
  if (d < 0.1) {
    B.at++;
    if (ROUTE[B.at].h && B.at < ROUTE.length - 1) { B.go = -1; B.since = st.now; B.hold = clumsy ? 0.15 : 0; B.next = 0; }
    return input;
  }
  // (the last steps to a place are taken gently, not to run past it)
  const k = d < 0.35 && !st.crouch ? 0.5 : 1;
  input.x = (dx / d) * k; input.y = (-dz / d) * k;
  return input;
}
/** A whole run by the player that plays by itself, from the shared clock `now`: → its state (st.time: its score, ms). */
export function botRun(now = 0, o = {}, onStep = null) {
  const st = startRun(now), input = { x: 0, y: 0, jump: false }, events = [];
  const most = o.most ?? S.limit + 60;
  for (let k = 0; !st.over && k < most * 120; k++) { botInput(st, input, o); stepRun(st, STEP, input, events); if (onStep) { onStep(st, events); } events.length = 0; }
  return st;
}

/** The least a run can take, m: from the start to each core and gate in their order, as the crow flies. */
export const SHORTEST = (() => { const way = [SAVES[0], SAVES[1], CORES[0], SAVES[2], SAVES[3], CORES[1], SAVES[4], CORES[2], DOOR]; let d = 0; for (let i = 1; i < way.length; i++) d += Math.hypot(way[i].x - way[i - 1].x, way[i].z - way[i - 1].z); return d; })();
/** Its board of scores (server/scores.js): the time from the first step to the door, the seconds of each time caught added. */
export const BOARD = { order: 'asc', min: 20_000, max: 1800_000 };
