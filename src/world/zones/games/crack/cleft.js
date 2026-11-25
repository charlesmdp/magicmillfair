// Between a Rock: its rules. No renderer here: the game, its checks and the climber that plays by itself all
// read this.
//
// Two needles of rock stand in the sea before the cliff at the south end of the bay, and between them a cleft:
// forty metres from the planks at its foot to the top. One goes up it from wall to wall. It is played like any
// game of walls:
//   · left and right: one walks on a ledge and steers a little in the air;
//   · the jump: off the planks or a ledge it is a jump; off a wall it is a kick, which carries across to the
//     other wall and up — more than a metre and a half where the cleft is narrow, hardly a metre at the top;
//   · a wall one touches is held, by itself: one slides down it slowly — fast where water runs down the rock —
//     and "down", or holding away from it, lets go;
//   · the skill is the kick: given at once — within a fifth of a second of catching the wall — it is a sharp
//     kick, which carries higher; sharp kicks in a row are a streak, and the fast way up.
// Ledges of rock jut from the walls: one stands on them, and they stop what comes down their wall. For stones
// come down, by the clock of the world — along a wall or down the middle, more of them the higher one is — and a
// stone knocks one off: for a moment one holds nothing, and falls. They come down the walls only, never the
// middle, and a mark shows on which wall the next one is: one is on the other wall when it passes. There is no net: who falls catches a wall
// again, or lands on a ledge, or goes back to the planks. The clock runs from the first jump to the top.
//
// Places: `x` metres across from the middle of the cleft (to the right, as one looks into it from the sea),
// `y` metres up from the planks. Time advances in steps of 1/120 s whatever the frame rate.

export const CLEFT = {
  name: 'Between a Rock',
  at: { x: 115, z: 106.5 }, // the middle of the cleft at its foot: one looks into it from the north, over the water
  floor: 1.3, // m above the sea: the planks one starts from
  height: 40,
  wide: [[0, 3.0], [10, 3.2], [22, 3.7], [32, 4.2], [40, 4.6]], // how wide it is at a few heights (between them: in proportion)
  // the planks: a landing before the cleft [x0, z0, x1, z1], the planks between the needles (how far in), the walkway from the sand
  landing: [111.4, 99.0, 118.6, 102.9], deep: 3.6, way: { a: [98.6, 109.5], b: [111.6, 100.9], half: 0.75 },
  step: 1 / 120, g: 24,
  body: 0.3, tall: 1.6,
  walk: 4.2, grip: 40, // m/s on a ledge; and how fast one gets there (m/s²)
  jump: 9.2, kick: [6.2, 9.2], // m/s up off a ledge; across and up off a wall
  air: 10, most: 6.6, lock: 0.22, // steering in the air (m/s²), never faster across than `most`; for so long after a kick nothing steers against it
  slide: { hold: 0.9, free: 0.9, wet: 5.5, drop: 8 }, // m/s down a wall: it is held by itself (pushing towards it changes nothing); where water runs; letting go
  sharp: 0.2, bonus: 1.12, // a kick given within so long of catching a wall is a sharp one: so much more speed upwards
  brake: 30, // m/s²: how hard a wall brakes a fall
  away: 0.14, // s of holding away from a wall before one lets go of it
  coyote: 0.1, buffer: 0.13, // s after leaving a wall or a ledge during which the jump still goes; and before touching one
  stun: 0.75, // s after a stone during which one holds nothing and steers nothing
  // the ledges: which wall (-1 the left one), how high their top is, how far they jut out
  ledges: [
    { side: 1, y: 5.0, out: 1.05 }, { side: -1, y: 9.6, out: 1.1 }, { side: 1, y: 14.4, out: 1.15 },
    { side: -1, y: 19.6, out: 1.2 }, { side: 1, y: 25.2, out: 1.25 }, { side: -1, y: 30.6, out: 1.3 },
    { side: 1, y: 35.4, out: 1.2 },
  ],
  ledge: 0.5, // how thick a ledge is
  // where water runs down the rock: which wall, from where to where. Up to the last ledge it is always the wall
  // under the next ledge: the wall across, from which one kicks up onto that ledge, is dry — one can wait there.
  wet: [{ side: -1, y0: 16.4, y1: 18.8 }, { side: 1, y0: 21.8, y1: 24.4 }, { side: -1, y0: 27.2, y1: 29.8 }, { side: 1, y0: 32.2, y1: 34.6 }, { side: -1, y0: 36.6, y1: 38.4 }],
  // the stones: one every so many seconds; how fast; how big; none below `low`, half of them none below `mid`
  rocks: { every: 1.7, speed: 8.5, r: 0.34, from: 47, low: 13, mid: 26 },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hash = (n, k = 0) => { const s = Math.sin(n * 91.3 + k * 47.7 + 12.9) * 43758.5453; return s - Math.floor(s); };

/** How wide the cleft is at a height (m). */
export function wideAt(y) {
  const W = CLEFT.wide;
  if (y <= W[0][0]) return W[0][1];
  for (let i = 1; i < W.length; i++) if (y <= W[i][0]) { const t = (y - W[i - 1][0]) / (W[i][0] - W[i - 1][0]), s = t * t * (3 - 2 * t); return W[i - 1][1] + (W[i][1] - W[i - 1][1]) * s; }
  return W[W.length - 1][1];
}
/** Where a wall is at a height: how far from the middle (m, positive). */
export const wallAt = (side, y) => wideAt(y) / 2;
/** Does water run down a wall at a height? */
export function wetAt(side, y) { for (const w of CLEFT.wet) if (w.side === side && y >= w.y0 && y < w.y1) return true; return false; }
/** A ledge as a box: { x0, x1 (across), y0, y1 (its top) }. */
export function ledgeBox(l, out = {}) {
  const w = wallAt(l.side, l.y);
  out.x0 = l.side > 0 ? w - l.out : -w; out.x1 = l.side > 0 ? w : -w + l.out; out.y0 = l.y - CLEFT.ledge; out.y1 = l.y;
  return out;
}

/**
 * The stone number `n`: { n, lane (-1 down the left wall, 0 down the middle, 1 down the right wall), x, y, gone }
 * at `clock` (s of the world's clock) — `gone` once it has broken up: on the first ledge of its wall, or where
 * the stones stop. One leaves the top every `rocks.every` seconds.
 */
export function rockAt(n, clock, out = {}) {
  const R = CLEFT.rocks, age = clock - n * R.every, lane = hash(n) < 0.5 ? -1 : 1; // (down a wall, never down the middle: the other wall is always safe)
  let stop = hash(n, 3) < 0.5 ? R.mid : R.low;
  if (lane) for (const l of CLEFT.ledges) if (l.side === lane && l.y > stop) stop = l.y + R.r; // (it breaks on the first ledge of its wall)
  const y = R.from - R.speed * age;
  out.n = n; out.lane = lane; out.y = Math.max(y, stop); out.stop = stop; out.gone = age < 0 || y < stop;
  out.x = lane * (wallAt(lane, clamp(out.y, 0, CLEFT.height)) - 0.42) + (lane ? 0 : (hash(n, 5) - 0.5) * 0.9);
  return out;
}
/** Calls `each(rock)` for every stone that is on its way down at `clock`. */
export function rocks(clock, each, out = {}) {
  const R = CLEFT.rocks, last = Math.floor(clock / R.every), span = Math.ceil((R.from - R.low) / R.speed / R.every);
  for (let n = last - span; n <= last; n++) { const r = rockAt(n, clock, out); if (!r.gone) each(r); }
}

/** A climber on the planks at the foot of the cleft: see stepClimb. `t0`: the clock of the world then (s). */
export function startClimb(t0 = 0) {
  // (`held`: for how long the wall has been held; `streak`: sharp kicks in a row; `sharps`: sharp kicks in all; `most`: the longest streak)
  return { x: 0, y: 0, vx: 0, vy: 0, wall: 0, on: -1, ground: true, face: 1, stun: 0, lock: 0, away: 0, coyote: 0, last: 0, want: 0, clock: 0, acc: 0, t0, started: false, go: 0, over: false, time: 0, top: 0, hits: 0, kicks: 0, falls: 0, wet: false, held: 9, streak: 0, sharps: 0, most: 0 };
}

/**
 * Advances a climb by `dt` seconds. `input`: { x (-1 left … 1 right), y (-1: let go of the wall), jump (true on
 * the frame it is asked) }. `events`: { type: 'go' | 'jump' | 'kick' (sharp, streak) | 'cling' (wet) | 'land' (ledge: its number,
 * -1 the planks; fell: how far) | 'bonk' | 'hit' (a stone) | 'top' (time) }.
 */
export function stepClimb(st, dt, input, events) {
  if (input?.jump) st.want = CLEFT.buffer;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= CLEFT.step - 1e-9 && !st.over) { st.acc -= CLEFT.step; sub(st, CLEFT.step, input, events); }
  return st;
}

const _b = {}, _r = {};
function sub(st, dt, input, events) {
  const C = CLEFT, ix = st.stun > 0 ? 0 : clamp(input?.x || 0, -1, 1), iy = st.stun > 0 ? 0 : input?.y || 0;
  st.clock += dt;
  if (st.want > 0) st.want -= dt;
  if (st.stun > 0) st.stun -= dt;
  if (st.lock > 0) st.lock -= dt;
  if (st.coyote > 0) st.coyote -= dt;
  const x0 = st.x, y0 = st.y;
  if (st.ground) {
    // ---- on the planks or on a ledge: one walks, and jumps
    st.vx += clamp(ix * C.walk - st.vx, -C.grip * dt, C.grip * dt);
    st.x += st.vx * dt;
    if (Math.abs(ix) > 0.2) st.face = ix < 0 ? -1 : 1;
    const half = wallAt(1, st.y + 0.8) - C.body;
    if (st.x > half) { st.x = half; st.vx = 0; } else if (st.x < -half) { st.x = -half; st.vx = 0; }
    if (st.on >= 0) { const b = ledgeBox(C.ledges[st.on], _b); if (st.x + C.body <= b.x0 + 1e-6 || st.x - C.body >= b.x1 - 1e-6) { st.ground = false; st.on = -1; st.coyote = C.coyote; st.last = 0; } } // (off its end: not a toe left on it)
    if (st.ground && st.want > 0 && st.stun <= 0) leap(st, 0, events);
  } else if (st.wall) {
    // ---- on a wall: one slides — slowly holding towards it, faster with nothing held, fast where it is wet
    const side = st.wall;
    st.held += dt;
    st.wet = wetAt(side, st.y + 0.8);
    const target = iy < -0.5 ? C.slide.drop : st.wet ? C.slide.wet : ix * side > 0.3 ? C.slide.hold : C.slide.free;
    st.vy += clamp(-target - st.vy, -C.g * dt, C.brake * dt);
    st.y += st.vy * dt;
    st.x = side * (wallAt(side, st.y + 0.8) - C.body); st.vx = 0;
    st.away = ix * side < -0.3 ? st.away + dt : 0;
    if (st.want > 0) leap(st, side, events);
    else if (st.away > C.away) { st.wall = 0; st.vx = -side * 1.2; st.coyote = C.coyote; st.last = side; st.away = 0; } // (let go)
  } else {
    // ---- in the air
    if (st.want > 0 && st.coyote > 0 && st.stun <= 0) leap(st, st.last, events);
    st.vy -= C.g * dt;
    if (ix && !(st.lock > 0 && ix * st.vx < 0)) { const want = ix * C.most; if ((want - st.vx) * ix > 0) st.vx += ix * Math.min(C.air * dt, Math.abs(want - st.vx)); }
    st.x += st.vx * dt; st.y += st.vy * dt;
  }
  // ---- the ledges: one lands on them, knocks one's head under them, runs into their end
  if (!st.ground) {
    for (let n = 0; n < C.ledges.length; n++) {
      const b = ledgeBox(C.ledges[n], _b);
      if (st.x + C.body <= b.x0 || st.x - C.body >= b.x1 || st.y >= b.y1 + 1e-6 || st.y + C.tall <= b.y0) continue; // (clear of it)
      if (y0 >= b.y1 - 1e-6 && st.vy > 0) continue; // (leaving it upwards)
      if (y0 >= b.y1 - 1e-6 && st.vy <= 0) { land(st, b.y1, n, events); break; } // (from above: onto it)
      if (y0 + C.tall <= b.y0 + 1e-6 && st.vy > 0) { st.y = b.y0 - C.tall; st.vy = 0; events?.push({ type: 'bonk' }); continue; } // (from below: one's head)
      // (from the side: its end — one steps up onto it when one's feet are nearly there, else it is in the way)
      if (st.y > b.y1 - 0.45 && !st.wall) { land(st, b.y1, n, events); break; }
      const side = C.ledges[n].side;
      st.x = side > 0 ? b.x0 - C.body : b.x1 + C.body; if (st.vx * side > 0) st.vx = 0;
    }
  }
  if (!st.ground) {
    if (st.y <= 0 && st.vy <= 0) land(st, 0, -1, events);
    else if (!st.wall) {
      // ---- a wall: caught, unless a stone has just knocked one off
      for (const side of [-1, 1]) {
        const reach = wallAt(side, st.y + 0.8) - C.body;
        if (st.x * side < reach || st.vx * side < 0) continue; // (not the wall one has just kicked off)
        st.x = side * reach;
        if (st.stun > 0) { if (st.vx * side > 0) st.vx = -st.vx * 0.3; continue; }
        st.wall = side; st.vx = 0; st.away = 0; st.face = side; st.held = 0; if (st.vy > 0) st.vy *= 0.4;
        st.wet = wetAt(side, st.y + 0.8);
        events?.push({ type: 'cling', wet: st.wet });
      }
    }
  }
  // ---- the stones
  if (st.stun <= 0 && st.y > C.rocks.low - 3) {
    rocks(st.t0 + st.clock, (r) => {
      if (st.stun > 0 || Math.abs(r.x - st.x) > C.rocks.r + C.body || r.y < st.y - C.rocks.r || r.y > st.y + C.tall + C.rocks.r) return;
      const away = st.wall ? -st.wall : Math.sign(st.x - r.x) || 1;
      Object.assign(st, { wall: 0, ground: false, on: -1, stun: C.stun, vx: away * 2.4, vy: Math.min(st.vy, -2.5), coyote: 0, streak: 0 });
      st.hits++;
      events?.push({ type: 'hit', n: r.n });
    }, _r);
  }
  // ---- how high; the top
  if (st.y > st.top) st.top = st.y;
  if (st.y >= C.height - 0.1 && !st.over) { st.over = true; st.time = Math.round((st.clock - st.go) * 1000); events?.push({ type: 'top', time: st.time }); }
  void x0;
}

/** The jump: off the planks or a ledge (`side` 0), or a kick off the wall `side`. */
function leap(st, side, events) {
  const C = CLEFT;
  if (!st.started) { st.started = true; st.go = st.clock; events?.push({ type: 'go' }); }
  if (side) {
    // (given at once, it is a sharp kick: higher — and one more of a streak; given late, the streak is over)
    const sharp = st.wall === side && st.held <= C.sharp;
    st.streak = sharp ? st.streak + 1 : 0;
    if (sharp) { st.sharps++; if (st.streak > st.most) st.most = st.streak; }
    st.vx = -side * C.kick[0]; st.vy = C.kick[1] * (sharp ? C.bonus : 1); st.lock = C.lock; st.face = -side;
    events?.push({ type: 'kick', sharp, streak: st.streak });
  }
  else { st.vy = C.jump; st.y += st.vy * C.step; events?.push({ type: 'jump' }); }
  Object.assign(st, { wall: 0, ground: false, on: -1, want: 0, coyote: 0, away: 0 });
  st.kicks++;
}
function land(st, y, n, events) {
  const fell = st.top - y;
  if (fell > 4) st.falls++;
  events?.push({ type: 'land', ledge: n, fell: Math.max(0, fell) });
  Object.assign(st, { y, vy: 0, wall: 0, ground: true, on: n, top: y, last: 0, coyote: 0 });
  if (n >= 0) { const b = ledgeBox(CLEFT.ledges[n], _b); st.x = clamp(st.x, b.x0 + 0.02, b.x1 - 0.02); } // (with both feet on it)
}

/** Where a climber is in the world: { x, y, z } (their feet). `d`: so far out of the cleft, towards the sea. */
export function climbPose(st, out = {}) { return cleftPoint(st.x, st.y, 0, out); }
/** A place of the cleft in the world: `x` across, `y` up, `d` out of it towards the sea (m). */
export function cleftPoint(x, y, d = 0, out = {}) { out.x = CLEFT.at.x - x; out.y = CLEFT.floor + y; out.z = CLEFT.at.z - d; return out; }

const NONE = { x: 0, y: 0, jump: false };
const copy = (st) => ({ ...st, acc: 0, bot: null });
/**
 * The way of a jump taken now, with nothing steered: `n` places [x, y] a twentieth of a second apart, until it
 * meets something (or null in the air). This is the arc drawn before the climber: one sees where a kick goes.
 */
export function leapArc(st, n = 12, out = []) {
  out.length = 0;
  if (st.over || st.stun > 0 || (!st.wall && !st.ground)) return null;
  const q = copy(st);
  q.want = 0;
  stepClimb(q, CLEFT.step, { x: 0, y: 0, jump: true }, null);
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < 6 && !q.wall && !q.ground && !q.over; i++) stepClimb(q, CLEFT.step, NONE, null);
    out.push([q.x, q.y]);
    if (q.wall || q.ground || q.over) break;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- climbers that play by themselves

// what a climber can do where it is: kick (or jump towards a wall), wait a little holding on, let itself slide
const PLAYS = [{ jump: 1 }, { jump: 1, to: -1 }, { jump: 1, to: 1 }, { wait: 0.12 }, { wait: 0.3 }, { wait: 0.6 }, { wait: 0.25, drop: 1 }];
const can = (st, p) => (p.wait ? (st.wall ? true : !p.drop) : st.ground ? !!p.to : !p.to);
/** Plays `play` on a copy, until the climber holds a wall or stands again (or two seconds have gone). */
function after(st, play) {
  const q = copy(st), inp = { x: 0, y: 0, jump: false };
  if (play.wait) { inp.x = q.wall; inp.y = play.drop ? -1 : 0; for (let t = 0; t < play.wait && !q.over && q.stun <= 0; t += CLEFT.step) stepClimb(q, CLEFT.step, inp, null); return q; }
  if (q.ground) {
    // (off a ledge: a run towards its end, the jump, and on towards the wall across)
    inp.x = play.to;
    for (let t = 0; t < 0.5 && q.ground && Math.abs(q.vx) < CLEFT.walk * 0.9; t += CLEFT.step) stepClimb(q, CLEFT.step, inp, null);
    if (!q.ground) return settle(q, inp);
  }
  inp.jump = true; stepClimb(q, CLEFT.step, inp, null); inp.jump = false;
  if (!q.ground && !play.to) inp.x = Math.sign(q.vx); // (towards the wall one is going to: held there)
  return settle(q, inp);
}
function settle(q, inp) {
  for (let t = 0; t < 2.2 && !q.over && !(t > 0.05 && (q.wall || q.ground) && q.stun <= 0); t += CLEFT.step) { if (q.stun > 0) inp.x = q.x < 0 ? -1 : 1; stepClimb(q, CLEFT.step, inp, null); }
  return q;
}
/** How good a place a climber is in: how high, less the time it took and the stones it met; `depth` plays looked into. */
function worth(st, depth, hits) {
  if (st.over) return 200 - st.clock * 0.4;
  const here = st.y - st.clock * 0.4 - (st.hits - hits) * 3 - (st.wall && st.wet ? 0.8 : 0);
  if (depth <= 0) return here;
  let best = here - 1.5; // (doing nothing more is always possible, and never good)
  for (const p of PLAYS) if (can(st, p)) best = Math.max(best, worth(after(st, p), depth - 1, hits));
  return best;
}
/**
 * A climber that plays by itself — the proof that the cleft can be climbed. Each time it holds a wall or stands
 * on a ledge it weighs a kick, a wait and a slide, three plays ahead, stones and all.
 */
export function botInput(st, out = { x: 0, y: 0, jump: false }) {
  out.jump = false;
  if (st.over) { out.x = 0; out.y = 0; return out; }
  const bot = st.bot || (st.bot = { until: 0, play: null, x: 0 });
  if (st.stun > 0) { out.x = st.x < 0 ? -1 : 1; out.y = 0; bot.play = null; return out; } // (knocked off: towards the nearer wall)
  if (!st.wall && !st.ground) { out.x = bot.x || Math.sign(st.vx) || st.face; out.y = 0; return out; }
  if (bot.play && st.clock < bot.until) {
    const p = bot.play;
    if (p.wait) { out.x = st.wall; out.y = p.drop ? -1 : 0; return out; }
    out.x = p.to; out.y = 0;
    if (st.ground && Math.abs(st.vx) >= CLEFT.walk * 0.9) { out.jump = true; bot.x = p.to; bot.play = null; }
    return out;
  }
  let best = null, top = -Infinity;
  for (const p of PLAYS) { if (!can(st, p)) continue; const w = worth(after(st, p), 3, st.hits); if (w > top) { top = w; best = p; } }
  bot.play = best;
  if (best.wait) { bot.until = st.clock + best.wait; out.x = st.wall; out.y = best.drop ? -1 : 0; return out; }
  if (st.ground) { bot.until = st.clock + 0.6; out.x = best.to; out.y = 0; return out; } // (a run first: see above)
  out.x = 0; out.y = 0; out.jump = true; bot.x = -st.wall; bot.play = null;
  return out;
}
/** One who only knows the jump, and hammers it. */
export function naiveInput(st, out = { x: 0, y: 0, jump: false }) { out.x = 0; out.y = 0; out.jump = !st.over && (!!st.wall || st.ground); return out; }

/** Climbs with `play` (the bot, unless told) from `t0` of the world's clock: { time (ms), top (m), hits, kicks, falls, over }. */
export function botClimb(t0 = 0, limit = 240, play = botInput) {
  const st = startClimb(t0), input = { x: 0, y: 0, jump: false };
  let top = 0;
  for (let t = 0; t < limit && !st.over; t += CLEFT.step) { play(st, input); stepClimb(st, CLEFT.step, input, null); if (st.y > top) top = st.y; }
  return { time: st.time, top, hits: st.hits, kicks: st.kicks, falls: st.falls, over: st.over, clock: st.clock };
}
