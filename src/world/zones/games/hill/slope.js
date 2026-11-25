// Uphill Battle: its rules. No renderer here: the game, its checks and the climber that plays by itself all read
// this.
//
// A long open slope between the Great Pond and the old tree. One runs up it as fast as one can while things
// roll down it: logs, lying across — jumped, or gone round —, barrels that wander from side to side — too tall
// to jump —, boulders — wide, and no jumping those either. It gets harder as one climbs, in four stretches:
// everything is let go at the top, and at the foot of each stretch a part of what comes down is stopped (a
// line of stakes across the slope). The first stretch sees a log now and then and nothing else; the second,
// more logs and the first barrels; the third, boulders too; the last, everything that is let go — there is
// always something coming. What hits one carries one back down a few metres: nobody is sent back to the start.
//
// What rolls is let go by the clock of the world, the same for everybody, and the climbs leave together, every
// ten seconds, each start with its name: friends who take the same one run up side by side, with the same logs
// coming at them.
//
// Places on the slope: `s` metres up it from the line of the start, `u` metres across it from its middle (to the
// right of who climbs when positive). Time advances in steps of 1/120 s whatever the frame rate.

export const HILL = {
  name: 'Uphill Battle',
  from: { x: -133, z: 89 }, yaw: 0.14, // the middle of the start line, and the way up (a heading of the valley: 0 looks south)
  length: 66, half: 4.6, // m up the slope; m to each side
  every: 10, starts: ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange'], // a start every so many seconds, each with its name
  step: 1 / 120,
  // (it is a slog: one climbs slower than one steps aside — the slope is not rushed, it is read: where to be, when)
  run: 3.6, side: 5.8, back: 3, accel: 34, // m/s up, across, back down; how fast one gets there (m/s²)
  g: 18, jump: 6.3, // m/s², m/s up: a little over a metre high
  body: 0.35, // half the width of a climber
  period: 0.4, // s between two things let go at the top: there is always something coming
  // The lines where part of what comes down is stopped (m up the slope): four stretches. `pass`, for each kind:
  // of those that reach a line, the share that goes on below it (the lowest line first) — a barrel never passes
  // the first line, a boulder never the second. So, a second: 0.4 things on the first stretch (logs), 0.9 on
  // the second, 1.6 on the third, 2.5 on the last.
  tiers: [16.5, 33, 49.5],
  kinds: {
    log: { share: 0.5, r: 0.42, speed: [7, 9.5], wide: [3, 5.2], end: -3, clear: 0.72, pass: [0.6, 0.7, 0.75] }, // lying across: so wide; cleared by feet that high
    barrel: { share: 0.3, r: 0.55, speed: [9, 11.5], sway: 1.7, end: 16.5, pass: [0, 0.5, 0.6] }, // it wanders so far to each side
    boulder: { share: 0.2, r: 1.1, speed: [5.5, 7], end: 33, pass: [0, 0, 0.5] },
  },
  knock: { time: 1.0, keep: 0.8, safe: 0.5 }, // hit: carried down so long, at so much of the thing's speed; then left alone so long
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hash = (n, k = 0) => { const s = Math.sin(n * 127.1 + k * 311.7 + 74.7) * 43758.5453; return s - Math.floor(s); };
const lerp = (a, b, t) => a + (b - a) * t;

/** The start one who asks at `now` (ms of the shared clock) leaves with: { n, name, at (ms), wait (s) } — the first one far enough ahead to get on the line. */
export function nextStart(now, least = 3) {
  const every = HILL.every * 1000, n = Math.ceil((now + least * 1000) / every);
  return { n, name: HILL.starts[((n % HILL.starts.length) + HILL.starts.length) % HILL.starts.length], at: n * every, wait: (n * every - now) / 1000 };
}

/**
 * The n-th thing let go at the top, at `clock` (s of the world's clock): { n, kind, r, s, u, half (how far to each
 * side of `u` it reaches), v, end (where it is stopped), alive, turn (how far it has rolled, radians) } — the same
 * for everybody.
 */
export function thingAt(n, clock, out = {}) {
  const H = HILL, pick = hash(n, 1), kind = pick < H.kinds.log.share ? 'log' : pick < H.kinds.log.share + H.kinds.barrel.share ? 'barrel' : 'boulder', K = H.kinds[kind];
  const age = clock - n * H.period, v = lerp(K.speed[0], K.speed[1], hash(n, 2));
  out.n = n; out.kind = kind; out.r = K.r; out.v = v;
  out.s = H.length + 3 - v * age;
  out.half = kind === 'log' ? lerp(K.wide[0], K.wide[1], hash(n, 3)) / 2 : K.r;
  const room = H.half - out.half - (kind === 'log' ? 0 : 0.2);
  out.u = (hash(n, 4) * 2 - 1) * room;
  if (kind === 'barrel') out.u = clamp(out.u + K.sway * Math.sin(age * 1.9 + hash(n, 5) * 6.28), -room, room);
  // (where it is stopped: the first line, coming down, that it does not pass — or the foot of its kind)
  let end = K.end;
  for (let k = H.tiers.length - 1; k >= 0; k--) if (hash(n, 6 + k) >= K.pass[k]) { end = H.tiers[k]; break; }
  out.end = end;
  out.alive = age >= 0 && out.s > end;
  out.turn = (v * age) / K.r;
  return out;
}

/** The stretch of the slope one is on, `s` metres up it: 1 (the foot) … 4 (the top). */
export const stretchOf = (s) => 1 + HILL.tiers.filter((t) => s >= t).length;

/** Calls `each(thing)` for everything that is rolling at `clock` (the thing is the same object every time). */
export function rolling(clock, each) {
  const H = HILL, last = Math.floor(clock / H.period), first = last - Math.ceil((H.length + 8) / (5.5 * H.period));
  for (let n = first; n <= last; n++) { const t = thingAt(n, clock, _t); if (t.alive) each(t); }
}
const _t = {};

/** A climber on the line. `t0`: the clock of the world when they leave (s). `u`: where across the line. */
export function startClimb(t0 = 0, u = 0) {
  return { s: 0.4, u, vs: 0, vu: 0, h: 0, vh: 0, knock: 0, kv: 0, safe: 0, hits: 0, jumps: 0, clock: 0, acc: 0, t0, over: false, time: 0, want: 0 };
}

/**
 * Advances a climb by `dt` seconds. `input`: { up (-1 back … 1 up the slope), side (-1 … 1), jump (true on the
 * frame it is asked) }. `events`: { type: 'jump' | 'land' | 'hit' (kind) | 'up' (on one's feet again) | 'top' (time) }.
 */
export function stepClimb(st, dt, input, events) {
  if (input?.jump) st.want = 0.12;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= HILL.step && !st.over) { st.acc -= HILL.step; sub(st, HILL.step, input, events); }
  return st;
}

function sub(st, dt, input, events) {
  const H = HILL, now = st.t0 + st.clock;
  st.clock += dt;
  if (st.want > 0) st.want -= dt;
  if (st.safe > 0) st.safe -= dt;
  if (st.knock > 0) {
    // carried back down by what hit one, then on one's feet again
    st.knock -= dt;
    st.s = Math.max(0.4, st.s - st.kv * dt); st.kv *= Math.max(0, 1 - 1.2 * dt);
    st.u = clamp(st.u + st.vu * dt, -H.half + H.body, H.half - H.body); st.vu *= Math.max(0, 1 - 3 * dt);
    if (st.h > 0) { st.vh -= H.g * dt; st.h = Math.max(0, st.h + st.vh * dt); }
    if (st.knock <= 0) { st.vs = 0; st.safe = H.knock.safe; events?.push({ type: 'up' }); }
    return;
  }
  // ---- up, across: as one pushes
  const up = clamp(input?.up || 0, -1, 1), side = clamp(input?.side || 0, -1, 1);
  const ws = up >= 0 ? up * H.run : up * H.back, wu = side * H.side;
  st.vs += clamp(ws - st.vs, -H.accel * dt, H.accel * dt); st.vu += clamp(wu - st.vu, -H.accel * dt, H.accel * dt);
  st.s = Math.max(0.4, st.s + st.vs * dt);
  st.u = clamp(st.u + st.vu * dt, -H.half + H.body, H.half - H.body);
  // ---- a jump
  if (st.want > 0 && st.h <= 0) { st.vh = H.jump; st.h = 1e-3; st.want = 0; st.jumps++; events?.push({ type: 'jump' }); }
  if (st.h > 0) { st.vh -= H.g * dt; st.h += st.vh * dt; if (st.h <= 0) { st.h = 0; st.vh = 0; events?.push({ type: 'land' }); } }
  if (st.s >= H.length) { st.over = true; st.time = Math.round(st.clock * 1000); events?.push({ type: 'top', time: st.time }); return; }
  // ---- what rolls: a log is cleared by feet high enough, the rest by keeping out of its way
  if (st.safe > 0) return;
  rolling(now, (t) => {
    if (st.knock > 0) return;
    const ds = Math.abs(t.s - st.s), du = Math.abs(t.u - st.u);
    const hit = t.kind === 'log' ? ds < t.r + 0.25 && du < t.half + H.body * 0.6 && st.h < H.kinds.log.clear : Math.hypot(ds, du) < t.r + H.body; // (no jump is high enough for a barrel or a boulder)
    if (!hit) return;
    st.knock = H.knock.time; st.kv = t.v * H.knock.keep; st.vu = (st.u < t.u ? -1 : 1) * 1.5; st.vs = 0; st.vh = 3; st.h = Math.max(st.h, 0.02); st.hits++;
    events?.push({ type: 'hit', kind: t.kind });
  });
}

/** Where a place of the slope is on the plan: { x, z }. */
export function slopeAt(s, u, out = {}) {
  const H = HILL, fx = Math.sin(H.yaw), fz = Math.cos(H.yaw);
  out.x = H.from.x + fx * s - fz * u; out.z = H.from.z + fz * s + fx * u; // (to the right of the way up: (-cos, sin) of its heading)
  return out;
}

const _b = {};
/**
 * A climber that plays by itself — the proof that the slope can be climbed. It looks a second and a half up the
 * slope, goes where nothing is coming, and jumps the logs it cannot go round. Returns the input for stepClimb.
 */
export function botInput(st, out = { up: 0, side: 0, jump: false }) {
  const H = HILL, now = st.t0 + st.clock;
  out.up = 1; out.side = 0; out.jump = false;
  if (st.knock > 0) return out;
  const coming = [];
  rolling(now, (t) => { const d = t.s - st.s; if (d > -1 && d < 26) coming.push({ ...t, when: d / (t.v + Math.max(1, st.vs)) }); });
  let best = st.u, least = Infinity;
  for (let c = -H.half + 0.5; c <= H.half - 0.5 + 1e-6; c += 0.3) {
    let cost = Math.abs(c - st.u) * 0.5 + Math.abs(c) * 0.05;
    for (const t of coming) {
      if (t.when > 1.7) continue;
      const u = thingAt(t.n, now + t.when, _b).u, gap = Math.abs(c - u) - t.half - H.body - 0.35, soon = 1 / (0.25 + t.when);
      if (gap < 0) cost += (t.kind === 'log' ? 6 : 40) * soon; // (a log can still be jumped)
      else if (gap < 0.6) cost += (0.6 - gap) * 3 * soon;
      // (no getting across in front of it in time)
      if (gap >= 0 && Math.abs(st.u - u) < t.half + H.body && Math.abs(c - st.u) / H.side > t.when && t.kind !== 'log') cost += 30;
    }
    if (cost < least) { least = cost; best = c; }
  }
  out.side = clamp((best - st.u) * 3, -1, 1);
  for (const t of coming) if (t.kind === 'log' && t.when > 0.12 && t.when < 0.3 && Math.abs(st.u - t.u) < t.half + H.body + 0.2 && st.h <= 0) out.jump = true;
  return out;
}

/** Climbs with the bot from a start at `t0`: { time (ms), hits, jumps, over }. */
export function botClimb(t0 = 0, limit = 180) {
  const st = startClimb(t0), input = { up: 0, side: 0, jump: false };
  for (let t = 0; t < limit && !st.over; t += HILL.step) { botInput(st, input); stepClimb(st, HILL.step, input, null); }
  return { time: st.time, hits: st.hits, jumps: st.jumps, over: st.over };
}
