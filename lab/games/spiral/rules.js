// A Turn for the Worse: its rules. No renderer here: the game, its checks and the runner that plays by itself
// all read this.
//
// A tower stands in the sea, and a track of planks winds up round it like a giant spiral stair: six turns from
// the foot to a bell. The legs run by themselves, faster as one climbs; one steers across the track (a rail on
// each side: nobody falls off it), jumps — and again in the air, higher and further —, slides, dives back down.
// What is in the way never changes place: it is the same for everybody, and learnt run after run. Each turn
// has its theme, and each is worse than the last:
//   Mind the Gap          holes in the track, and hurdles: jumped
//   Duck!                 boards hung across at the height of the head, slid under; fences across two thirds of
//                         the width, gone round
//   Step Up               crates: one jumps onto the first, then again onto the higher one, and off
//   Clockwork             what moves, by the clock of the world: mills (one arm low, one high), stompers
//                         (two blocks side by side, never down together), hammers that swing across
//   Roll Out the Barrel   barrels dropped from the gallery above roll down the track: jumped, or let by
//   The Works             all of it at speed, and three narrow planks to the bell
// One touch — or a hole — and the attempt is over: one is back at the foot within a second and the clock starts
// again. The time that counts is the time of the attempt that reaches the bell. The inside of the track is the
// shorter way round: who hugs the tower gains on who runs along the rail.
//
// Places on the track: `s` metres up it from the foot, measured along its middle, `u` metres across it from its
// middle (to the right of who runs — the tower is on the left — when positive), `h` metres over its planks.
// Time advances in steps of 1/120 s whatever the frame rate.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const frac = (v) => v - Math.floor(v);
const hash = (n, k = 0) => { const s = Math.sin(n * 127.1 + k * 311.7 + 74.7) * 43758.5453; return s - Math.floor(s); };

export const SPIRAL = {
  name: 'A Turn for the Worse',
  at: { x: 168, z: 84 }, // the middle of the tower, in the south of the bay
  gate: { x: 52, z: 71 }, // where one asks to run: on the sand of the south beach, the tower in sight
  core: 5.2, // m: the radius of the tower itself
  r: 9.6, half: 1.6, // the track: how far its middle is from the middle of the tower, and half its width
  turns: 6, rise: 7.6, // so many turns, each so many metres up (room enough between two for the camera to look in under the one above)
  foot: 3.4, // m over the sea: the planks at the foot
  from: Math.PI, // where the foot is, about the tower (radians; 0 is east, π/2 south): west, facing the beach
  names: ['Mind the Gap', 'Duck!', 'Step Up', 'Clockwork', 'Roll Out the Barrel', 'The Works'],
  step: 1 / 120,
  speed: [6, 7.6], // m/s along the middle of the track: at the foot, at the bell
  side: 4.6, accel: 40, reach: 1.3, // across: m/s, m/s², and how far from the middle the rails let one go
  g: 22, jump: 7, again: 6.4, dive: -11, // m/s²; m/s up on a jump, on a second one in the air; down on a dive
  slide: 0.55, hold: 0.95, rest: 0.15, // s a slide lasts; at most, while the stick is held; and before the next
  coyote: 0.1, buffer: 0.12, // s after an edge during which a jump is still a jump; s a key asked too early is kept
  tall: 1.25, low: 0.6, along: 0.26, across: 0.2, // a runner: standing, sliding; half its length, half its width
  edge: 0.18, lip: 0.22, drop: 1, // m: how far over an edge a foot may be; the step one still gets up; how deep a hole takes one
  bar: { t: 0.15, low: 0.55, high: 0.85, hung: 1.45, top: 2.5 }, // what stands across: half its thickness; the top of a hurdle; the foot of a hung board, and its top; the top of a fence
  ready: 6, fall: 0.5, back: 0.3, // s before the first attempt (time to read the keys; three, two, one); between the end of one and the foot; there before one runs again
  cam: { back: 7.4, out: 3.9, up: 5.8, ahead: 2.8 }, // the camera: so far behind (m of arc), outside the middle of the track (beyond its rail), above; looking so far ahead
};
const S = SPIRAL;
/** Metres of track a turn, along its middle; and from the foot to the bell. */
export const TURN = TAU * S.r, LENGTH = S.turns * TURN;

/** How fast the legs run at metre `s` (m/s, along the middle of the track). */
export const speedAt = (s) => lerp(S.speed[0], S.speed[1], clamp(s / LENGTH, 0, 1));
/** How high the planks are at metre `s` (over the sea). */
export const trackY = (s) => S.foot + (S.rise * s) / TURN;
/** Where a place of the track is in the world: { x, y, z (on the planks), a (its angle about the tower), yaw (the way one runs there) }. */
export function spiralAt(s, u = 0, out = {}) {
  const a = S.from - s / S.r, r = S.r + u;
  out.a = a; out.x = S.at.x + Math.cos(a) * r; out.z = S.at.z + Math.sin(a) * r; out.y = trackY(s); out.yaw = Math.PI - a;
  return out;
}
/**
 * How far up the track the camera sees past the tower (metres along the middle), for a runner `u` across: the
 * line of sight that grazes the wall. (The camera rides `cam.back` behind and `cam.out` outside the middle.)
 */
export function sightAhead(u = 0) { const cr = S.r + S.cam.out; return S.r * (-S.cam.back / cr + Math.acos(S.core / cr) + Math.acos(S.core / (S.r + u))); }
/** The time nobody can beat (ms): the whole track along the inner rail, nothing in the way. */
export function fastest() { let t = 0; for (let s = 0; s < LENGTH; s += 0.05) t += 0.05 / (speedAt(s) * (S.r / (S.r - S.reach))); return Math.round(t * 1000); }

// ---------------------------------------------------------------------------
// The course: what stands in the way, turn after turn. Every thing has { kind, s0, s1 } (where it begins and
// ends along the track) and, by kind:
//   hole    { u0, u1 }: no planks there
//   low     { s, u0, u1, y0, y1 }: a hurdle — jumped (or gone round, when it does not span the track)
//   high    the same, hung at the height of the head: slid under (who jumps twice, and well, goes over it)
//   fence   the same, from the planks up: gone round
//   crate   { u0, u1, top }: stood on; run into below its top, it ends the attempt
//   mill    { s, turn (rad/s), phase, arm }: a post in the middle of the track, a low arm on one side — jumped —
//           and a high one on the other — slid under —, turning by the clock of the world
//   stomp   { period, phase, share, up }: two blocks side by side over the inner and the outer half, each down
//           for `share` of the period, half a period apart: never both
//   hammer  { s, period, phase, amp, head }: a head that swings across the track
//   barrels { every, v, off, lanes }: one is dropped at s1 every so many seconds and rolls down to s0
let made = null;
export function course() {
  if (made) return made;
  const H = S.half, T = S.bar.t, things = [];
  const add = (o) => { things.push(o); return o; };
  const hole = (s, len, u0 = -H, u1 = H) => add({ kind: 'hole', s0: s, s1: s + len, u0, u1 });
  const bar = (kind, s, u0, u1) => add({ kind, s, s0: s - T, s1: s + T, u0, u1, y0: kind === 'high' ? S.bar.high : 0, y1: kind === 'low' ? S.bar.low : kind === 'high' ? S.bar.hung : S.bar.top });
  const low = (s, u0 = -H, u1 = H) => bar('low', s, u0, u1), high = (s, u0 = -H, u1 = H) => bar('high', s, u0, u1);
  /** A fence across two thirds of the track: `side` -1 leaves the way by the rail (the tower side is shut), 1 the way by the tower. */
  const fence = (s, side) => bar('fence', s, side < 0 ? -H : -0.4, side < 0 ? 0.4 : H);
  const crate = (s, len, top, u0 = -H, u1 = H) => add({ kind: 'crate', s0: s, s1: s + len, u0, u1, top });
  /** Two crates in a row, the second twice as high: jumped onto, then again. */
  const stairs = (s, a = 2.4, b = 2.6) => { crate(s, a, 0.9); crate(s + a, b, 1.8); };
  const mill = (s, period, phase = 0) => add({ kind: 'mill', s, s0: s - 1.7, s1: s + 1.7, turn: TAU / period, phase, arm: 1.45, r: 0.1, high: 1.25 });
  const stomp = (s, period, phase = 0) => add({ kind: 'stomp', s0: s, s1: s + 1.6, period, phase, share: 0.25, up: 3.3 });
  const hammer = (s, period, phase = 0) => add({ kind: 'hammer', s, s0: s - 0.25, s1: s + 0.25, period, phase, amp: 1.15, head: 0.5 });
  const barrels = (s0, s1, every, v, off = 0) => add({ kind: 'barrels', s0, s1, every, v, off, r: 0.4, wide: 0.55, lanes: [-0.95, 0, 0.95] });
  /** A plank `w` wide, its middle `c` across: the track is missing on both sides of it. */
  const plank = (s, len, c, w = 1.2) => { hole(s, len, -H, c - w / 2); hole(s, len, c + w / 2, H); };

  // ---- 1 · Mind the Gap: holes and hurdles, well apart
  hole(14, 2); low(24); hole(33, 2.6); low(43);
  hole(50, 2.4, -H, 0.3); // (half a hole: jumped, or gone round by the rail)
  low(56.5);
  // ---- 2 · Duck!: boards to slide under, fences to go round
  high(66); low(73.5); high(80);
  fence(87, -1); fence(93.5, 1);
  hole(100, 2.8); high(106.5); low(112.5); high(118);
  // ---- 3 · Step Up: crates
  crate(126, 3, 0.9);
  stairs(134.5);
  fence(146, -1);
  crate(151, 3, 0.9, 0, H); hole(151, 3, -H, 0); // (a crate by the rail, nothing beside it)
  stairs(160.5); hole(165.5, 3.4); // (off the high crate with a jump: the track is missing behind it)
  high(175);
  // ---- 4 · Clockwork: what moves
  mill(187.5, 3.0, 0.4); low(193.5);
  stomp(198.5, 2.2, 0.1); high(204.5);
  hammer(209.5, 2.6, 1.0); hole(214.5, 2.6); low(221.5);
  mill(227, 2.4, 2.2); stomp(232.5, 1.9, 0.55);
  hammer(238.5, 2.2, 3.1);
  // ---- 5 · Roll Out the Barrel: they are dropped from the gallery above, and roll down into a hole
  hole(243.6, 2.6); barrels(246.2, 270, 1.5, 5, 0);
  high(255); high(263.5);
  low(273.5);
  hole(277.2, 2.6); barrels(279.8, 299, 1.15, 5.6, 0.4);
  high(287); high(293.5);
  // ---- 6 · The Works: all of it at speed, then three planks to the bell
  hole(305, 2.6); high(312.6);
  stairs(318.5, 2.4, 2.6); hole(323.5, 3.6);
  mill(331.5, 2.0, 0.9);
  fence(336.5, 1); fence(341.6, -1);
  hole(343.2, 1.4, -H, 0.35); // (the track is already going: only the side by the rail is left, to the first plank)
  plank(344.6, 5.2, 0.85, 1); hole(349.8, 2.2); plank(352, 4.6, -0.85, 1); hole(356.6, 1.9); plank(358.5, LENGTH - 358.5 + 0.5, 0, 1.2);

  // (what is near a place, found at once: the things that reach into each four metres of track, with room to spare)
  const cells = [];
  for (let i = 0; i <= Math.ceil(LENGTH / 4) + 1; i++) cells.push(things.filter((t) => t.s1 > i * 4 - 2.5 && t.s0 < i * 4 + 6.5));
  const turns = S.names.map((name, n) => ({ n, name, from: n * TURN, to: (n + 1) * TURN, things: things.filter((t) => (t.s0 + t.s1) / 2 >= n * TURN && (t.s0 + t.s1) / 2 < (n + 1) * TURN) }));
  made = { things, cells, turns, length: LENGTH };
  return made;
}
const NONE = [];
const near = (s) => course().cells[Math.max(0, Math.floor(s / 4))] || NONE;

// ---- what moves, by the clock of the world (`now`: seconds)
/** Which way the low arm of a mill points (radians in the plane of the track: 0 up the track, π/2 towards the rail); the high arm points the other way. */
export const millAngle = (m, now) => m.phase + m.turn * now;
/** How high over the planks the foot of a block of a stomper is. `side`: -1 the block over the tower side, 1 the one by the rail. */
export function stompAt(t, now, side) {
  const p = frac(now / t.period + t.phase + (side > 0 ? 0.5 : 0));
  return p < 0.035 ? t.up * (1 - p / 0.035) : p < t.share ? 0 : p < t.share + 0.16 ? (t.up * (p - t.share)) / 0.16 : t.up;
}
/** How soon a block of a stomper comes down (0 as it does … 1 just after it has gone up again): the block trembles when this is small. */
export const stompSoon = (t, now, side) => 1 - frac(now / t.period + t.phase + (side > 0 ? 0.5 : 0));
/** Where across the track the head of a hammer is. */
export const hammerAt = (t, now) => t.amp * Math.sin((TAU * now) / t.period + t.phase);
/** How far a barrel drops from the hatch under the gallery above (m), and how long before it lands it shows (s). */
const DROP = S.rise - 1.5, LEAD = Math.sqrt((2 * DROP) / S.g);
const laneOf = (t, n) => { const k = Math.floor(hash(n, 3) * 3), prev = Math.floor(hash(n - 1, 3) * 3); return t.lanes[k === prev ? (k + 1) % 3 : k]; };
/**
 * The n-th barrel of a stretch at `now`: { n, s, u, alive (it is on the planks, rolling), fall (how high over
 * them it still is, dropped from the gallery: it shows a moment before it lands), turn (how far it has rolled) }.
 */
export function barrelAt(t, n, now, out = {}) {
  const age = now - t.off - n * t.every;
  out.n = n; out.u = laneOf(t, n); out.s = t.s1 - t.v * Math.max(0, age);
  out.alive = age >= 0 && out.s > t.s0;
  out.fall = age < 0 ? Math.min(DROP, 0.5 * S.g * age * age) : 0;
  out.shown = age > -LEAD && out.s > t.s0 - 0.6;
  out.turn = (t.v * Math.max(0, age)) / t.r;
  return out;
}
/** Calls `each(barrel)` for every barrel of a stretch that shows at `now` (the same object every time). */
export function barrelsOf(t, now, each) {
  const last = Math.floor((now - t.off + LEAD) / t.every), first = Math.ceil((now - t.off - (t.s1 - t.s0 + 0.6) / t.v) / t.every);
  for (let n = first; n <= last; n++) { const b = barrelAt(t, n, now, _b); if (b.shown) each(b); }
}
const _b = {};

// ---------------------------------------------------------------------------
// A run

/** What one stands on at a place of the track: 0 on its planks, the top of a crate, -Infinity over a hole. */
export function floorAt(s, u) {
  const e = S.edge, H = S.half;
  let top = 0, gone = false;
  for (const t of near(s)) {
    if (t.kind === 'crate') { if (s >= t.s0 && s <= t.s1 + e && u >= t.u0 && u <= t.u1 && t.top > top) top = t.top; }
    // (a foot may be a little over an edge — not over the side of the track: the rails are there)
    else if (t.kind === 'hole' && s > t.s0 + e && s < t.s1 - e && u > (t.u0 > -H ? t.u0 + e : -9) && u < (t.u1 < H ? t.u1 - e : 9)) gone = true;
  }
  return top > 0 ? top : gone ? -Infinity : 0;
}

/**
 * A runner at the foot of the track, about to go: see stepRun. `t0`: the clock of the world then (s) — what moves
 * on the track moves by it.
 */
export function startRun(t0 = 0) {
  return {
    s: 0, u: 0, vu: 0, h: 0, vh: 0, air: false, jumps: 0, coyote: 0, slide: -1, slid: 0, v: S.speed[0], turn: 0,
    clock: 0, total: 0, t0, n: 0, acc: 0, attempt: 1, outs: 0, best: 0, down: 0, why: '', wait: S.ready,
    over: false, time: 0, want: { jump: 0, down: 0 },
  };
}

/**
 * Advances a run by `dt` seconds. `input`: { side (-1 towards the tower … 1 towards the rail), jump, down (true
 * on the frame they are asked), crouch (the stick is held down) }. `events`, when given, is filled with what
 * happened: { type: 'go' (attempt) | 'jump' | 'again' (the second jump) | 'dive' | 'land' | 'slide' | 'turn' (n)
 * | 'out' (why: 'hole' | 'low' | 'high' | 'fence' | 'crate' | 'mill' | 'stomp' | 'hammer' | 'barrel'; s, attempt)
 * | 'foot' (back at the foot: attempt) | 'top' (time, attempt) }.
 */
export function stepRun(st, dt, input, events) {
  if (input?.jump) st.want.jump = S.buffer; // (asked a moment too early, it still goes off on landing)
  if (input?.down) st.want.down = S.buffer;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= S.step - 1e-9 && !st.over) { st.acc -= S.step; sub(st, S.step, input, events); }
  return st;
}

function sub(st, dt, input, events) {
  st.n++; st.total += dt;
  const now = st.t0 + st.total;
  if (st.down > 0) {
    // ---- the attempt is over: a moment — down the hole, or on one's back — then at the foot again
    st.down -= dt;
    if (st.why === 'hole') { st.vh -= S.g * dt; st.h += st.vh * dt; }
    if (st.down <= 0) {
      Object.assign(st, { s: 0, u: 0, vu: 0, h: 0, vh: 0, air: false, jumps: 0, coyote: 0, slide: -1, slid: 0, clock: 0, turn: 0, wait: S.back, attempt: st.attempt + 1, v: S.speed[0] });
      st.want.jump = st.want.down = 0;
      events?.push({ type: 'foot', attempt: st.attempt });
    }
    return;
  }
  if (st.wait > 0) { st.wait -= dt; st.want.jump = st.want.down = 0; if (st.wait <= 0) events?.push({ type: 'go', attempt: st.attempt }); return; }
  st.clock += dt;
  // ---- what is asked: up, down
  if (st.want.jump > 0) {
    st.want.jump -= dt;
    if (!st.air || st.coyote > 0) { st.vh = S.jump; st.air = true; st.jumps = 1; st.coyote = 0; st.want.jump = 0; if (st.slide > 0) st.slide = 0; events?.push({ type: 'jump' }); }
    else if (st.jumps < 2) { st.vh = Math.max(st.vh, S.again); st.jumps = 2; st.want.jump = 0; events?.push({ type: 'again' }); }
  }
  if (st.want.down > 0) {
    st.want.down -= dt;
    if (!st.air) { if (st.slide <= -S.rest) { st.slide = S.slide; st.slid = 0; st.want.down = 0; events?.push({ type: 'slide' }); } }
    else if (st.vh > S.dive) { st.vh = S.dive; st.want.down = 0; events?.push({ type: 'dive' }); }
  }
  if (st.slide > 0) {
    st.slid += dt; st.slide -= dt;
    if (st.slide <= 0 && input?.crouch && st.slid < S.hold) st.slide = dt; // (it goes on a little while the stick is held)
  } else if (st.slide > -S.rest) st.slide -= dt;
  // ---- up the track, as fast as the tower asks — and the inside is the shorter way round
  st.v = speedAt(st.s);
  st.s += st.v * (S.r / (S.r + st.u)) * dt;
  // ---- across it: as one pushes, between the rails
  const wu = clamp(input?.side || 0, -1, 1) * S.side;
  st.vu += clamp(wu - st.vu, -S.accel * dt, S.accel * dt);
  st.u += st.vu * dt;
  if (st.u > S.reach) { st.u = S.reach; if (st.vu > 0) st.vu = 0; } else if (st.u < -S.reach) { st.u = -S.reach; if (st.vu < 0) st.vu = 0; }
  // ---- up and down: the planks, the top of a crate, or nothing
  const G = floorAt(st.s, st.u);
  if (st.air) {
    st.vh -= S.g * dt; st.h += st.vh * dt;
    if (st.coyote > 0) st.coyote -= dt;
    if (st.h < G - S.lip) return out(st, G > 0 ? 'crate' : 'hole', events); // (into the face of a crate; against the far edge of a hole)
    if (st.h <= G && st.vh <= 0) {
      st.h = G; st.vh = 0; st.air = false; st.jumps = 0; st.coyote = 0;
      events?.push({ type: 'land' });
      if (input?.crouch && st.slide <= -S.rest) { st.slide = S.slide; st.slid = 0; events?.push({ type: 'slide' }); } // (the stick held down in the air: one lands sliding)
    } else if (st.h < -S.drop) return out(st, 'hole', events);
  } else if (G < st.h - 1e-6) { st.air = true; st.vh = 0; st.jumps = 0; st.coyote = S.coyote; if (st.slide > 0) st.slide = 0; } // (off an edge)
  else if (G > st.h + S.lip) return out(st, 'crate', events);
  else st.h = G;
  // ---- the bell
  if (st.s >= LENGTH) { st.s = LENGTH; st.best = LENGTH; st.over = true; st.time = Math.round(st.clock * 1000); events?.push({ type: 'top', time: st.time, attempt: st.attempt }); return; }
  if (st.s > st.best) st.best = st.s;
  const turn = Math.min(S.turns - 1, Math.floor(st.s / TURN));
  if (turn !== st.turn) { st.turn = turn; events?.push({ type: 'turn', n: turn }); }
  // ---- what stands or moves in the way
  const why = touch(st, now);
  if (why) out(st, why, events);
}

/** What the runner is touching at `now` ('' when nothing): one touch ends the attempt. */
function touch(st, now) {
  const s = st.s, u = st.u, h = st.h, top = h + (st.slide > 0 && !st.air ? S.low : S.tall), A = S.along, W = S.across;
  for (const t of near(s)) {
    if (t.kind === 'hole' || t.kind === 'crate' || s + 2 < t.s0 || s - 2 > t.s1) continue;
    if (t.kind === 'low' || t.kind === 'high' || t.kind === 'fence') {
      if (s + A > t.s0 && s - A < t.s1 && u + W > t.u0 && u - W < t.u1 && h < t.y1 && top > t.y0) return t.kind;
    } else if (t.kind === 'mill') {
      const ds = s - t.s;
      if (Math.abs(ds) < t.r + A && Math.abs(u) < t.r + W) return 'mill'; // (its post)
      const a = millAngle(t, now), cs = Math.cos(a), cu = Math.sin(a), along = ds * cs + u * cu, off = Math.abs(u * cs - ds * cu);
      if (off < 0.33 && Math.abs(along) < t.arm + 0.2 && (along > 0 ? h < S.bar.low : top > S.bar.high && h < t.high)) return 'mill';
    } else if (t.kind === 'stomp') {
      if (s + A > t.s0 && s - A < t.s1 && ((u - W < -0.05 && stompAt(t, now, -1) < top) || (u + W > 0.05 && stompAt(t, now, 1) < top))) return 'stomp';
    } else if (t.kind === 'hammer') {
      if (Math.abs(s - t.s) < 0.25 + A && Math.abs(u - hammerAt(t, now)) < t.head + W) return 'hammer';
    } else if (t.kind === 'barrels') {
      const last = Math.floor((now - t.off) / t.every), first = Math.ceil((now - t.off - (t.s1 - t.s0) / t.v) / t.every);
      for (let n = first; n <= last; n++) {
        const sb = t.s1 - t.v * (now - t.off - n * t.every);
        if (sb > t.s0 && Math.abs(s - sb) < t.r + 0.2 && Math.abs(u - laneOf(t, n)) < t.wide + W && h < 2 * t.r - 0.1) return 'barrel';
      }
    }
  }
  return '';
}

function out(st, why, events) {
  st.down = S.fall; st.why = why; st.outs++;
  if (why !== 'hole') { st.vh = 0; }
  events?.push({ type: 'out', why, s: st.s, attempt: st.attempt });
}

/** Which turn a runner is on (0 for the first), and how high over the foot of the track they have been at most (m). */
export const turnOf = (s) => Math.min(S.turns - 1, Math.max(0, Math.floor(s / TURN)));
export const heightOf = (s) => (S.rise * s) / TURN;

// ---------------------------------------------------------------------------
// A runner that plays by itself — the proof that the bell can be reached. It does not know the course by heart:
// it tries, a second and more ahead, what it could do — steer here or there, a key now or a little later, two
// keys — on a copy of itself, with these very rules, and does what gets furthest. When nothing is in the way it
// leans to the inside, the shorter way.

const LANES = [-1.25, -0.85, -0.45, 0, 0.45, 0.85, 1.25];
const SURE = 168, FAR = 264; // steps: a plan is kept while it lasts so long; it is judged on so long
const copy = (st) => ({ ...st, want: { ...st.want }, bot: null });
const _in = { side: 0, jump: false, down: false, crouch: false };
/** How many steps (of `n`) a copy of `st` lasts with a plan: { u0 (steered to until step `at`), u (after), keys: [{ at, type }] }. */
function lasts(st, plan, n) {
  const q = copy(st);
  for (let k = 0; k < n; k++) {
    _in.side = clamp(((q.n < plan.at ? plan.u0 : plan.u) - q.u) * 5, -1, 1);
    for (const key of plan.keys) if (key.at === q.n) { if (key.type === 'jump') q.want.jump = S.buffer; else q.want.down = S.buffer; }
    sub(q, S.step, _in, null);
    if (q.over) return n + 1; // (the bell: nothing lasts longer)
    if (q.down > 0) return k;
  }
  return n;
}

function think(st, B) {
  const now = st.n, cur = { u0: B.u0, u: B.u, at: B.at, keys: B.keys };
  const k0 = lasts(st, cur, FAR);
  if (k0 >= SURE) {
    // (all is well: with nothing planned, the inside if the inside does as well)
    if (!B.keys.length && now >= B.at) for (const u of LANES) { if (u >= B.u - 0.05) break; if (lasts(st, { u0: u, u, at: 0, keys: [] }, FAR) >= k0) { B.u0 = B.u = u; break; } }
    return;
  }
  let best = cur, score = k0;
  const tryPlan = (plan) => { const k = lasts(st, plan, FAR); if (k > score || (k === score && plan.keys.length < best.keys.length)) { score = k; best = plan; } return k; };
  const lanes = LANES.slice().sort((a, b) => Math.abs(a - st.u) - Math.abs(b - st.u) || a - b);
  const held = st.n < B.at ? B.u0 : B.u;
  // ---- steering only
  for (const u of lanes) tryPlan({ u0: u, u, at: 0, keys: [] });
  // ---- what was planned, and one key more
  if (score < FAR && B.keys.length) {
    const from = Math.max(now, ...B.keys.map((k) => k.at)) + 6;
    for (const u of lanes) for (const type of ['jump', 'down']) for (let at = from; at <= now + 132 && score < FAR; at += 6) tryPlan({ u0: held, u, at: B.keys[0].at, keys: [...B.keys, { at, type }] });
  }
  // ---- one key: now, or a little later; steering where one was until then, or at once
  if (score < FAR) for (const type of ['jump', 'down']) for (let d = 0; d <= 96 && score < FAR; d += 6) for (const u of lanes) { tryPlan({ u0: u, u, at: 0, keys: [{ at: now + d, type }] }); if (Math.abs(u - held) > 0.2) tryPlan({ u0: held, u, at: now + d, keys: [{ at: now + d, type }] }); }
  // ---- two keys
  if (score < SURE) {
    const two = [['jump', 'jump'], ['jump', 'down'], ['down', 'jump']], some = [held, ...lanes.filter((u) => Math.abs(u - held) > 0.2)];
    for (const [a, b] of two) for (let d = 0; d <= 72 && score < FAR; d += 6) for (let g = 12; g <= 84 && score < FAR; g += 8) for (const u of some) {
      tryPlan({ u0: held, u, at: now + d, keys: [{ at: now + d, type: a }, { at: now + d + g, type: b }] });
    }
  }
  // ---- three keys: up the stairs and off them, a long jump and a slide
  if (score < SURE) {
    const three = [['jump', 'jump', 'jump'], ['jump', 'jump', 'down'], ['jump', 'down', 'jump'], ['down', 'jump', 'jump']];
    for (const [a, b, c] of three) for (let d = 0; d <= 60 && score < FAR; d += 6) for (let g = 12; g <= 72 && score < FAR; g += 10) for (let g2 = 12; g2 <= 72 && score < FAR; g2 += 10) for (const u of [held, ...lanes.slice(0, 3)]) {
      tryPlan({ u0: held, u, at: now + d, keys: [{ at: now + d, type: a }, { at: now + d + g, type: b }, { at: now + d + g + g2, type: c }] });
    }
  }
  B.u0 = best.u0; B.u = best.u; B.at = best.at; B.keys = best.keys.map((k) => ({ ...k }));
}

/** The keys of the runner that plays by itself, for this step: { side, jump, down, crouch }. Call it before every step. */
export function botInput(st, out = { side: 0, jump: false, down: false, crouch: false }) {
  const B = st.bot || (st.bot = { u0: 0, u: 0, at: 0, keys: [], next: 0, attempt: 0 });
  out.side = 0; out.jump = out.down = out.crouch = false;
  if (st.over || st.down > 0) return out;
  if (B.attempt !== st.attempt) { B.attempt = st.attempt; B.u0 = B.u = 0; B.at = 0; B.keys = []; B.next = 0; }
  if (st.wait > 0) return out;
  if (st.n >= B.next) { B.next = st.n + 4; think(st, B); }
  out.side = clamp(((st.n < B.at ? B.u0 : B.u) - st.u) * 5, -1, 1);
  for (let i = B.keys.length - 1; i >= 0; i--) {
    const key = B.keys[i];
    if (key.at <= st.n) { if (key.type === 'jump') out.jump = true; else out.down = true; B.keys.splice(i, 1); }
  }
  return out;
}

/** Runs with the bot from a start at `t0` (the clock of the world, s): { time (ms), attempts, outs, over, keys, clock (s it took in all) }. */
export function botRun(t0 = 0, limit = 400) {
  const st = startRun(t0), input = { side: 0, jump: false, down: false, crouch: false }, events = [];
  let keys = 0;
  for (let t = 0; t < limit && !st.over; t += S.step) { botInput(st, input); if (input.jump || input.down) keys++; stepRun(st, S.step, input, events); }
  return { time: st.time, attempts: st.attempt, outs: st.outs, over: st.over, keys, clock: st.total, why: events.filter((e) => e.type === 'out').map((e) => `${e.why} at ${e.s.toFixed(0)} m`) };
}
