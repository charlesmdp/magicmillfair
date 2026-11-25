// A Turn for the Worse: its rules. No renderer here: the game, its checks and the runner that plays by itself
// all read this.
//
// A tower stands in the sea, and a track of planks winds up round it like a giant spiral stair: nineteen turns
// from the foot to a bell, 146 m over it. One runs up it as the stick asks: pushed up, the legs run — a little faster as one climbs
// —; let go, they stop within a quarter of a second; and nobody runs back down. One steers across the track (a
// rail on each side: nobody falls off it), jumps — and again in the air, higher and further —, slides, dives
// back down, ducks when standing. So one may stop before what moves, read it, and go: the clock is what that
// costs — it starts with the first step of an attempt, not before: thinking at the foot is free.
// A jump is as long as the run before it: in the air one keeps the speed one left the planks with, and the
// stick adds only a little. From a standstill one jump crosses no hole and clears no hurdle: a step or two of
// run-up does, and so does the second jump. A slide wants a run as well; who stands before a hung board ducks,
// then goes — getting up takes a moment, and that moment takes one under it.
// What is in the way never changes place: it is the same for everybody, and learnt run after run. Each turn
// has its theme, and each is worse than the last:
//   Mind the Gap          holes in the track, and hurdles: jumped
//   Duck!                 boards hung across at the height of the head, slid under; fences across two thirds of
//                         the width, gone round
//   Step Up               crates: one jumps onto the first, then again onto the higher one, and off
//   Clockwork             what moves, by the clock of the world: mills (one arm low, one high), stompers
//                         (two blocks side by side, never down together), hammers that swing across
//   Roll Out the Barrel   barrels dropped from the gallery above roll down the track: jumped, or let by — they
//                         come at who stands still as well
//   The Works             all of it, and three narrow planks
//   Give Way              planks that give way a moment after one sets foot on them: one keeps running
//   Spring Tide           springboards before holes too long for any jump: one runs onto them, and is thrown over
//   Three High            stairs of three crates, the last one off with a jump
//   Up and Down           bars that go up and down by the clock: low, jumped; high, slid under — in rhythm
//   Gusts                 a wind that pushes one across the track in gusts, shown by streamers, where half of
//                         it is missing: one steers against it
//   Against the Grain     belts that carry one back down to the hole one has just jumped: one keeps running
//   Sliding Doors         walls across the track, each with one door that slides from rail to rail: one goes
//                         through it
//   Cannonade             balls shot across the track from the wall of the tower, low (jumped) or high (slid under)
//   Tightrope             planks a foot wide over nothing, one after the other, never in line
//   Low Bridge            boards hung from a cable come down the track: slid under, or ducked
//   Pistons               rams that shoot across the track, from the tower or from the rail, and draw back
//   Clock of Hammers      hammers four in a row, each a beat after the one before
//   The Last Straw        a little of everything, then planks a foot wide that give way, to the bell
// One touch — or a hole — and the attempt is over: one is back at the foot within a second, and the clock waits
// there for the first step (`back: 'foot'`). Every three turns there is a landing — a short level stretch with
// nothing on it, a painted line and a flag —: a breather; and, with `back: 'landing'`, where one is put back
// after a touch, the clock running on. The time that counts is the time of the attempt that reaches the bell.
// The inside of the track is the shorter way round: who hugs the tower gains on who runs along the rail.
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
  turns: 19, rise: 7.68, // so many turns, each so many metres up (room enough between two for the camera to look in under the one above)
  foot: 3.4, // m over the sea: the planks at the foot
  from: Math.PI, // where the foot is, about the tower (radians; 0 is east, π/2 south): west, facing the beach
  names: ['Mind the Gap', 'Duck!', 'Step Up', 'Clockwork', 'Roll Out the Barrel', 'The Works', 'Give Way', 'Spring Tide', 'Three High', 'Up and Down', 'Gusts', 'Against the Grain', 'Sliding Doors', 'Cannonade', 'Tightrope', 'Low Bridge', 'Pistons', 'Clock of Hammers', 'The Last Straw'],
  // the landings: at the end of the third turn, then at the start of the seventh, the tenth … the nineteenth; so
  // long, level. Who touches something is put back at the foot ('foot'), or at the last landing reached ('landing')
  landings: [3, 6, 9, 12, 15, 18], land: 5, back: 'foot',
  step: 1 / 120,
  speed: [6, 7.6], // m/s along the middle of the track, the stick full up: at the foot, at the bell
  start: 0.3, stop: 0.25, // s from standing to that speed; and from it to standing, the stick let go
  push: 5.5, // m/s²: all the stick adds in the air — there one keeps the speed one left the planks with
  keep: 0.2, slow: 2, // s the speed one ran at is still that of a slide (the stick goes through its middle on its way down); m/s under which stick down is a duck, not a slide
  stay: 0.6, // s one stays low after a duck: getting up takes a moment — time to go under what one ducked for
  side: 4.6, accel: 40, reach: 1.3, // across: m/s, m/s², and how far from the middle the rails let one go
  g: 22, jump: 7, again: 6.4, dive: -11, // m/s²; m/s up on a jump, on a second one in the air; down on a dive
  slide: 0.55, hold: 0.95, rest: 0.15, // s a slide lasts; at most, while the stick is held; and before the next
  coyote: 0.1, buffer: 0.12, // s after an edge during which a jump is still a jump; s a key asked too early is kept
  tall: 1.25, low: 0.6, along: 0.26, across: 0.2, // a runner: standing, sliding; half its length, half its width
  edge: 0.18, lip: 0.22, drop: 1, // m: how far over an edge a foot may be; the step one still gets up; how deep a hole takes one
  bar: { t: 0.15, low: 0.55, high: 0.85, hung: 1.45, top: 2.5 }, // what stands across: half its thickness; the top of a hurdle; the foot of a hung board, and its top; the top of a fence
  fall: 0.5, ready: 0.3, // s between the end of an attempt and the foot; there before the legs answer again
  spring: { up: 12, v: 11 }, // a springboard: m/s up, and along the track (wherever across it), it throws one at
  crumble: 0.55, // s a plank that gives way holds after one sets foot on it
  cam: { back: 7.4, out: 3.9, up: 5.8, ahead: 2.25 }, // the camera: so far behind (m of arc), outside the middle of the track (beyond its rail), above; looking so far ahead (as it looked at a run when its eye trailed: the same picture, standing or running)
};
const S = SPIRAL;
/** Metres of track a turn, along its middle; and from the foot to the bell. */
export const TURN = TAU * S.r, LENGTH = S.turns * TURN;

/** How fast the legs run at metre `s`, the stick full up (m/s, along the middle of the track). */
export const speedAt = (s) => lerp(S.speed[0], S.speed[1], clamp(s / LENGTH, 0, 1));
/** Where each landing begins (metres along the track): at the end of the third turn, else at the start of its turn. */
export const LANDINGS = S.landings.map((n) => (n === 3 ? n * TURN - S.land - 0.06 : n * TURN + 0.3));
const landIn = (k) => LANDINGS.find((a) => a >= k * TURN && a < (k + 1) * TURN);
/**
 * How high the planks are at metre `s` (over the sea). Each turn climbs `rise`; on a landing the planks are
 * level, and the rest of its turn a little steeper.
 */
export function trackY(s) {
  const k = Math.floor(s / TURN), x = s - k * TURN, a = k >= 0 && k < S.turns ? landIn(k) : undefined;
  if (a === undefined) return S.foot + (S.rise * s) / TURN;
  return S.foot + k * S.rise + (S.rise * (x - clamp(s - a, 0, S.land))) / (TURN - S.land);
}
/** How steep the planks are at metre `s` (rise over run). */
export const slopeAt = (s) => (trackY(s + 0.01) - trackY(s - 0.01)) / 0.02;
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
/**
 * The time nobody can beat (ms): the whole track along the inner rail, the stick full up, nothing in the way —
 * but the springboards, which throw one faster than the legs run (from the board to a little past the hole).
 */
export function fastest() {
  const fly = course().things.filter((t) => t.kind === 'spring').map((t) => [t.s0, t.s1 + 18]);
  let t = 0;
  for (let s = 0; s < LENGTH; s += 0.05) t += 0.05 / Math.max(speedAt(s) * (S.r / (S.r - S.reach)), fly.some(([a, b]) => s >= a && s < b) ? S.spring.v : 0);
  return Math.round(t * 1000);
}

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
//   crumble { u0, u1 }: a plank that gives way `S.crumble` s after one first sets foot on it
//   spring  a springboard: who steps on it is thrown up and along (`S.spring`)
//   lift    { s, period, phase, lo, hi }: a bar right across, its foot going from `lo` (jumped) to `hi` (slid under)
//   wind    { dir, period, phase, push }: in gusts, one is pushed across the track, towards the rail (dir 1) or the tower
//   belt    { v }: planks that carry who stands on them back down the track
//   door    { s, period, phase, amp, gap }: a wall across, with one door `gap` wide that slides from side to side
//   cannon  { s, period, phase, y, r, v }: a ball shot across from the tower every period, its middle `y` over the planks
//   trolley { every, v, off }: boards hung at the height of the head, from a cable, come down from s1 to s0
//   ram     { s, side, period, phase }: a block that shoots across from the tower (side -1) or the rail (1), and back
// Some have a `form` too: a kind of thing done a new way (stairs three high, planks a foot wide, hammers in a row).
let made = null;
export function course() {
  if (made) return made;
  const H = S.half, T = S.bar.t, things = [];
  const add = (o) => { o.id = things.length; things.push(o); return o; };
  const hole = (s, len, u0 = -H, u1 = H, form) => add({ kind: 'hole', s0: s, s1: s + len, u0, u1, ...(form ? { form } : {}) });
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
  const plank = (s, len, c, w = 1.2, form) => { hole(s, len, -H, c - w / 2, form); hole(s, len, c + w / 2, H, form); };
  /** `n` planks a metre long that give way, from metre `s`, `u0` to `u1` across. Returns where they end. */
  const crumbles = (s, n, u0 = -H, u1 = H, form) => { for (let k = 0; k < n; k++) add({ kind: 'crumble', s0: s + k, s1: s + k + 1, u0, u1, ...(form ? { form } : {}) }); return s + n; };
  /** A springboard, and the hole it throws one over: too long for any jump. */
  const spring = (s, len = 10.4) => { add({ kind: 'spring', s0: s, s1: s + 0.8 }); hole(s + 1.1, len); };
  /** Stairs three high, and a hole behind them: off the top with a jump. */
  const stack = (s, a = 2.4) => { crate(s, a, 0.9); crate(s + a, a, 1.8); add({ kind: 'crate', form: 'stack', s0: s + 2 * a, s1: s + 3 * a, u0: -H, u1: H, top: 2.7 }); hole(s + 3 * a, 4.4); };
  const lift = (s, period, phase) => add({ kind: 'lift', s, s0: s - 0.1, s1: s + 0.1, period, phase, lo: 0.25, hi: 0.95, th: 0.3 });
  const wind = (s0, s1, dir, period, phase = 0) => add({ kind: 'wind', s0, s1, dir, period, phase, push: 2.6 });
  const belt = (s0, s1, v = 2) => add({ kind: 'belt', s0, s1, v });
  const door = (s, period, phase) => add({ kind: 'door', s, s0: s - 0.08, s1: s + 0.08, period, phase, amp: 0.85, gap: 1.3, top: 2.5 });
  const cannon = (s, high, period, phase) => add({ kind: 'cannon', s, s0: s - 0.3, s1: s + 0.3, period, phase, y: high ? 1.12 : 0.3, r: 0.25, v: 9, high });
  const trolley = (s0, s1, every, v, off = 0) => add({ kind: 'trolley', s0, s1, every, v, off, y0: S.bar.high, y1: S.bar.hung });
  const ram = (s, side, period, phase) => add({ kind: 'ram', s, s0: s - 0.45, s1: s + 0.45, side, period, phase, top: 2.6 });
  /** Four hammers in a row, each a beat after the one before: met at a run, each is where the first one was. */
  const row = (s, period, phase = 0) => { for (let k = 0; k < 4; k++) hammer(s + 2.5 * k, period, phase - (TAU / period) * (2.5 * k) / 7).form = 'clock'; };
  /** Planks a foot wide over nothing, the middle `c` across. */
  const rope = (s, len, c) => plank(s, len, c, 0.35, 'rope');
  /** The same, giving way. */
  const crope = (s, len, c) => { hole(s, len, -H, c - 0.175); hole(s, len, c + 0.175, H); crumbles(s, Math.ceil(len), c - 0.175, c + 0.175, 'rope'); };
  const bare = []; // (where the track is only planks over nothing: no rails there)

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
  plank(344.6, 5.2, 0.85, 1); hole(349.8, 2.2); plank(352, 4.6, -0.85, 1); hole(356.6, 1.9); plank(358.5, 6 * TURN - 358.5, 0, 1.2);
  bare.push([343.2, 6 * TURN]);
  let b = 6 * TURN; // (where the turn begins)
  // ---- 7 · Give Way: (a landing first) planks that give way under who stops
  crumbles(b + 9, 5); low(b + 19.5); crumbles(b + 24, 5); hole(b + 34, 2.4); crumbles(b + 40, 5); high(b + 50); low(b + 56.5);
  // ---- 8 · Spring Tide: holes no jump crosses, a springboard before each
  b = 7 * TURN;
  spring(b + 3); low(b + 20); crumbles(b + 24, 6); spring(b + 33.5); crumbles(b + 49, 7); high(b + 59);
  // ---- 9 · Three High
  b = 8 * TURN;
  stack(b + 4.5); high(b + 22); crumbles(b + 25.5, 8); stack(b + 36.5); fence(b + 53.5, 1); low(b + 58.3);
  // ---- 10 · Up and Down: (a landing) bars in rhythm, each low when the next is high
  b = 9 * TURN;
  for (let k = 0; k < 4; k++) lift(b + 8 + 4 * k, 2.6, k % 2 ? 0.5 : 0);
  low(b + 25); lift(b + 30, 2.2, 0.2); lift(b + 34, 2.2, 0.7); crumbles(b + 38, 9);
  for (let k = 0; k < 3; k++) lift(b + 51 + 4 * k, 2.4, k % 2 ? 0.6 : 0.1);
  // ---- 11 · Gusts: towards the rail, where the track is missing by the rail
  b = 10 * TURN;
  wind(b + 1, b + 59, 1, 3.4);
  hole(b + 5, 4, 0, H); low(b + 12.5); hole(b + 16, 4, 0, H); hole(b + 22.5, 3.5, -H, -0.45); high(b + 29); hole(b + 33, 4, 0, H);
  crumbles(b + 38, 9); hole(b + 49, 4, 0, H); low(b + 55.5); hole(b + 58, 2, 0, H);
  // ---- 12 · Against the Grain: belts that carry one back to the hole behind them
  b = 11 * TURN;
  hole(b + 3, 2.4); belt(b + 5.4, b + 17.4); low(b + 11.5);
  hole(b + 20.5, 2.4); belt(b + 22.9, b + 34.9); high(b + 29);
  crumbles(b + 37.5, 10); hole(b + 48.5, 2.4); belt(b + 50.9, b + 59.9); low(b + 55.5);
  // ---- 13 · Sliding Doors: (a landing) walls, each with a door that slides
  b = 12 * TURN;
  // (each row a wave: who goes through the first door at a run finds the next one nearly where the first was)
  const doors = (s, n, period, phase) => { for (let k = 0; k < n; k++) door(s + 4 * k, period, phase - k * ((TAU / period) * (4 / 7.1) - 0.25)); };
  doors(b + 9, 3, 3.4, 0); fence(b + 22, -1); doors(b + 27, 2, 3, 0.5);
  crumbles(b + 35, 9); doors(b + 47, 3, 3.2, 1); low(b + 59.8);
  // ---- 14 · Cannonade: balls across, low and high
  b = 13 * TURN;
  cannon(b + 4.5, false, 1.7, 0); cannon(b + 8, true, 1.7, 0.5); low(b + 13.5); cannon(b + 19, false, 1.5, 0.25); cannon(b + 23, true, 1.5, 0.75);
  crumbles(b + 26.5, 8); hole(b + 36.5, 2.4); cannon(b + 41, true, 1.8, 0.1); cannon(b + 45, false, 1.8, 0.6); door(b + 49, 3.4, 0.4); cannon(b + 53, false, 1.6, 0.3); high(b + 57.5);
  // ---- 15 · Tightrope: planks a foot wide, never in line
  b = 14 * TURN;
  rope(b + 3, 6, -0.45); hole(b + 9, 1.8); rope(b + 10.8, 5.5, 0.45); rope(b + 16.3, 5, -0.45); bare.push([b + 3, b + 21.3]);
  low(b + 26.5); crumbles(b + 30.5, 5);
  rope(b + 37, 5, 0); hole(b + 42, 1.6); rope(b + 43.6, 5.5, -0.85); bare.push([b + 37, b + 49.1]); high(b + 55);
  // ---- 16 · Low Bridge: (a landing) boards come down the track on a cable
  b = 15 * TURN;
  trolley(b + 8, b + 27, 3.4, 3.5); low(b + 13); low(b + 20.5); crumbles(b + 29, 10);
  trolley(b + 40, b + 59, 3.2, 3.5, 0.7); low(b + 44); hole(b + 50, 2.4); low(b + 56);
  // ---- 17 · Pistons
  b = 16 * TURN;
  // (each row a wave: who passes the first as it draws back finds the next drawing back as well, at a run)
  const rams = (s, sides, period, phase) => sides.forEach((side, k) => ram(s + 4 * k, side, period, phase - (4 * k) / 7.2 / period));
  rams(b + 4, [-1, 1, -1], 2.4, 0); low(b + 17); rams(b + 22, [1, -1], 2.2, 0.3); crumbles(b + 30, 8);
  rams(b + 42, [-1, 1, -1], 2.6, 0.6); high(b + 54.5); hole(b + 58, 1.8);
  // ---- 18 · Clock of Hammers
  b = 17 * TURN;
  row(b + 4, 2.4, 0); low(b + 16.8); crumbles(b + 21, 6); row(b + 30, 2.2, 1.5); high(b + 42.5); row(b + 46.5, 2.4, 3); low(b + 59.5);
  // ---- 19 · The Last Straw: (a landing) a little of everything, then planks a foot wide that give way, to the bell
  b = 18 * TURN;
  crumbles(b + 8, 4); door(b + 15, 3.2, 0); lift(b + 20, 2.4, 0.3); cannon(b + 24.5, false, 1.6, 0.2); ram(b + 29, -1, 2.4, 0.4);
  crope(b + 34, 6, 0); hole(b + 40, 1.6); crope(b + 41.6, 6, -0.45); hole(b + 47.6, 1.6); crope(b + 49.2, LENGTH + 0.5 - (b + 49.2), 0); bare.push([b + 34, LENGTH]);

  // (what hangs from the turn above, and how far below it: the hammers, the hatches of the barrels)
  for (const t of things) {
    if (t.kind === 'hammer') t.L = trackY(t.s + TURN) - trackY(t.s) - 1.7;
    if (t.kind === 'barrels') { t.drop = trackY(t.s1 + TURN) - trackY(t.s1) - 1.5; t.lead = Math.sqrt((2 * t.drop) / S.g); }
  }
  // (what is near a place, found at once: the things that reach into each four metres of track, with room to spare)
  const cells = [];
  for (let i = 0; i <= Math.ceil(LENGTH / 4) + 1; i++) cells.push(things.filter((t) => t.s1 > i * 4 - 2.5 && t.s0 < i * 4 + 6.5));
  const turns = S.names.map((name, n) => ({ n, name, from: n * TURN, to: (n + 1) * TURN, things: things.filter((t) => (t.s0 + t.s1) / 2 >= n * TURN && (t.s0 + t.s1) / 2 < (n + 1) * TURN) }));
  made = { things, cells, turns, length: LENGTH, bare };
  return made;
}
/**
 * Its line for the boards of scores: the time of the attempt that rings the bell (ms), the lower the better.
 * No finish is faster than `min`; who stops and waits takes as long as it takes — a quarter of an hour at most
 * is counted.
 */
export const BOARD = { order: 'asc', min: Math.floor(fastest() / 1000) * 1000, max: 900_000 };
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
const smooth = (x) => { const k = clamp(x, 0, 1); return k * k * (3 - 2 * k); };
/** How high over the planks the foot of the bar of a lift is: low (`lo`) a little over a third of the time, high (`hi`) as long, and between. */
export function liftAt(t, now) {
  const p = frac(now / t.period + t.phase), k = p < 0.36 ? 0 : p < 0.5 ? smooth((p - 0.36) / 0.14) : p < 0.86 ? 1 : 1 - smooth((p - 0.86) / 0.14);
  return lerp(t.lo, t.hi, k);
}
/** How hard the wind blows (0 … 1): a gust a little under half the period, calm the rest. */
export function gustAt(t, now) { const p = frac(now / t.period + t.phase); return p < 0.1 ? smooth(p / 0.1) : p < 0.42 ? 1 : p < 0.52 ? 1 - smooth((p - 0.42) / 0.1) : 0; }
/** Where across the track the middle of the door of a wall is. */
export const doorAt = (t, now) => t.amp * Math.sin((TAU * now) / t.period + t.phase);
/** Where across the track the ball of a cannon is (from the wall of the tower towards the sea): the same ball every period. */
export const cannonAt = (t, now) => S.core - S.r + 0.3 + t.v * frac(now / t.period + t.phase) * t.period;
/** How far across the track a ram has come from its side (0 … the whole width): out fast, a moment there, back slower, a while in. */
export function ramAt(t, now) {
  const p = frac(now / t.period + t.phase), E = 2 * S.half + 0.1;
  return p < 0.1 ? E * smooth(p / 0.1) : p < 0.3 ? E : p < 0.55 ? E * (1 - smooth((p - 0.3) / 0.25)) : 0;
}
/** Calls `each(s, n)` for every board of a cable that is on its way down at `now`. */
export function trolleysOf(t, now, each) {
  const last = Math.floor((now - t.off) / t.every), first = Math.ceil((now - t.off - (t.s1 - t.s0) / t.v) / t.every);
  for (let n = first; n <= last; n++) { const s = t.s1 - t.v * (now - t.off - n * t.every); if (s > t.s0 && s <= t.s1) each(s, n); }
}
/** How far a barrel drops from the hatch under the gallery above (m), and how long before it lands it shows (s). */
const laneOf = (t, n) => { const k = Math.floor(hash(n, 3) * 3), prev = Math.floor(hash(n - 1, 3) * 3); return t.lanes[k === prev ? (k + 1) % 3 : k]; };
/**
 * The n-th barrel of a stretch at `now`: { n, s, u, alive (it is on the planks, rolling), fall (how high over
 * them it still is, dropped from the gallery: it shows a moment before it lands), turn (how far it has rolled) }.
 */
export function barrelAt(t, n, now, out = {}) {
  const age = now - t.off - n * t.every;
  out.n = n; out.u = laneOf(t, n); out.s = t.s1 - t.v * Math.max(0, age);
  out.alive = age >= 0 && out.s > t.s0;
  out.fall = age < 0 ? Math.min(t.drop, 0.5 * S.g * age * age) : 0;
  out.shown = age > -t.lead && out.s > t.s0 - 0.6;
  out.turn = (t.v * Math.max(0, age)) / t.r;
  return out;
}
/** Calls `each(barrel)` for every barrel of a stretch that shows at `now` (the same object every time). */
export function barrelsOf(t, now, each) {
  const last = Math.floor((now - t.off + t.lead) / t.every), first = Math.ceil((now - t.off - (t.s1 - t.s0 + 0.6) / t.v) / t.every);
  for (let n = first; n <= last; n++) { const b = barrelAt(t, n, now, _b); if (b.shown) each(b); }
}
const _b = {};

// ---------------------------------------------------------------------------
// A run

/** When runner `st` first set foot on the plank `id` that gives way (s of its run), or undefined. */
export const trodAt = (st, id) => { for (const k of st?.trod || NONE) if (k.id === id) return k.at; return undefined; };
/** Has the plank `t` that gives way given way under runner `st`? */
export const gone = (st, t) => { const at = trodAt(st, t.id); return at !== undefined && st.total - at >= S.crumble; };
/**
 * What one stands on at a place of the track: 0 on its planks, the top of a crate, -Infinity over a hole — or
 * over a plank that has given way under runner `st`, when it is given.
 */
export function floorAt(s, u, st) {
  const e = S.edge, H = S.half;
  let top = 0, hole = false;
  for (const t of near(s)) {
    if (t.kind === 'crate') { if (s >= t.s0 && s <= t.s1 + e && u >= t.u0 && u <= t.u1 && t.top > top) top = t.top; }
    // (a foot may be a little over an edge — not over the side of the track: the rails are there)
    else if (t.kind === 'hole' && s > t.s0 + e && s < t.s1 - e && u > (t.u0 > -H ? t.u0 + e : -9) && u < (t.u1 < H ? t.u1 - e : 9)) hole = true;
    // (a plank that has given way is gone to its very ends — the next one gives way as well, under who stands on the seam —
    // and to its very sides: a foot over the edge of the hole beside it stood on it)
    else if (t.kind === 'crumble' && st && s >= t.s0 && s <= t.s1 && u >= t.u0 - e && u <= t.u1 + e && gone(st, t)) hole = true;
  }
  return top > 0 ? top : hole ? -Infinity : 0;
}

/**
 * A runner at the foot of the track, standing: see stepRun. `t0`: the clock of the world then (s) — what moves
 * on the track moves by it. The clock of the attempt (`clock`) waits for the first step (`going`).
 */
export function startRun(t0 = 0) {
  return {
    s: 0, u: 0, vu: 0, h: 0, vh: 0, air: false, jumps: 0, coyote: 0, slide: -1, slid: 0, duck: 0, v: 0, pace: 0, since: 9, turn: 0,
    going: false, clock: 0, total: 0, t0, n: 0, acc: 0, attempt: 1, outs: 0, best: 0, down: 0, why: '', wait: 0,
    over: false, time: 0, want: { jump: 0, down: 0 }, trod: [], home: 0,
  };
}
/** Where one is put back after a touch: the foot, or the last landing reached (`back: 'landing'`). */
export const backTo = (st) => (S.back === 'landing' && st.home > 0 ? st.home + S.land / 2 : 0);

/**
 * Advances a run by `dt` seconds. `input`: { side (-1 towards the tower … 1 towards the rail), run (0 … 1: how
 * far the stick is pushed up — the legs go as fast as that, and stop when it is let go), jump, down (true on
 * the frame they are asked), crouch (the stick is held down) }. `events`, when given, is filled with what
 * happened: { type: 'go' (the first step of an attempt: its clock starts) | 'jump' | 'again' (the second jump)
 * | 'dive' | 'land' | 'slide' | 'spring' (thrown by a springboard) | 'turn' (n) | 'out' (why: 'hole' | 'low' |
 * 'high' | 'fence' | 'crate' | 'mill' | 'stomp' | 'hammer' | 'barrel' | 'lift' | 'door' | 'cannon' | 'trolley' |
 * 'ram'; s, attempt) | 'foot' (put back at the foot, or at a landing: attempt, s) | 'top' (time, attempt) }.
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
  const on = S.back === 'landing' && st.going; // (put back at a landing, the clock runs on)
  if (st.down > 0) {
    // ---- the attempt is over: a moment — down the hole, or on one's back — then at the foot again (or at the
    // last landing), standing
    st.down -= dt;
    if (on) st.clock += dt;
    if (st.why === 'hole') { st.vh -= S.g * dt; st.h += st.vh * dt; }
    if (st.down <= 0) {
      const s = backTo(st);
      Object.assign(st, { s, u: 0, vu: 0, h: 0, vh: 0, air: false, jumps: 0, coyote: 0, slide: -1, slid: 0, duck: 0, v: 0, pace: 0, since: 9, going: on, clock: on ? st.clock : 0, turn: turnOf(s), wait: S.ready, attempt: st.attempt + 1, trod: [], home: on ? st.home : 0 });
      st.want.jump = st.want.down = 0;
      events?.push({ type: 'foot', attempt: st.attempt, s });
    }
    return;
  }
  if (st.wait > 0) { st.wait -= dt; if (on) st.clock += dt; st.want.jump = st.want.down = 0; return; }
  const run = clamp(input?.run || 0, 0, 1), crouch = !!input?.crouch, full = speedAt(st.s);
  // ---- what is asked: up, down
  if (st.want.jump > 0) {
    st.want.jump -= dt;
    if (!st.air || st.coyote > 0) { st.vh = S.jump; st.air = true; st.jumps = 1; st.coyote = 0; st.want.jump = 0; st.duck = 0; if (st.slide > 0) st.slide = 0; events?.push({ type: 'jump' }); }
    else if (st.jumps < 2) { st.vh = Math.max(st.vh, S.again); st.jumps = 2; st.want.jump = 0; events?.push({ type: 'again' }); }
  }
  if (st.want.down > 0) {
    st.want.down -= dt;
    if (!st.air) {
      if (st.slide <= -S.rest) {
        // (a slide goes at the speed one ran at a moment ago: the stick passes through its middle on its way
        // down, and the legs have begun to stop — it is not held against them. Too slow for a slide: a duck)
        const pace = st.since <= S.keep ? Math.max(st.v, st.pace) : st.v;
        if (pace >= S.slow) { st.slide = S.slide; st.slid = 0; st.duck = 0; st.v = pace; events?.push({ type: 'slide' }); } else st.duck = S.stay;
        st.want.down = 0;
      }
    } else if (st.vh > S.dive) { st.vh = S.dive; st.want.down = 0; events?.push({ type: 'dive' }); }
  }
  if (st.slide > 0) {
    st.slid += dt; st.slide -= dt;
    if (st.slide <= 0 && crouch && st.slid < S.hold) st.slide = dt; // (it goes on a little while the stick is held)
  } else if (st.slide > -S.rest) st.slide -= dt;
  // ---- a duck: low for as long as the stick is down, when one stands or nearly — and a moment more
  if (st.air) st.duck = 0;
  else if (crouch && st.slide <= 0 && st.v < S.slow) st.duck = S.stay;
  else if (st.duck > 0) st.duck -= dt;
  // ---- up the track, as the stick asks — never back down it. On the planks the legs get to the speed asked
  // in a moment and stop in less; a slide keeps the speed it began with; in the air one keeps one's own, and
  // the stick only adds a little. The inside is the shorter way round.
  const want = full * run;
  if (st.air) { if (want > st.v) st.v = Math.min(want, st.v + S.push * dt); }
  else if (st.slide > 0) { /* (as it began) */ }
  else if (want > st.v) st.v = Math.min(want, st.v + (full / S.start) * dt);
  else if (want < st.v) st.v = Math.max(want, st.v - (full / S.stop) * dt);
  if (run >= 1) { st.pace = st.v; st.since = 0; } else if (st.since < 9) st.since += dt; // (what one ran at, the stick full up: remembered a moment for a slide)
  // (the clock of the attempt starts with its first step: thinking at the foot is free)
  if (!st.going && st.v > 0) { st.going = true; events?.push({ type: 'go', attempt: st.attempt }); }
  if (st.going) st.clock += dt;
  st.s += st.v * (S.r / (S.r + st.u)) * dt;
  // ---- across it: as one pushes, between the rails — and as the wind pushes, in a gust; a belt carries who
  // stands on it back down
  const wu = clamp(input?.side || 0, -1, 1) * S.side;
  st.vu += clamp(wu - st.vu, -S.accel * dt, S.accel * dt);
  st.u += st.vu * dt;
  for (const t of near(st.s)) {
    if (st.s < t.s0 - (t.kind === 'belt' ? 0.5 : 0) || st.s > t.s1) continue; // (a belt carries one over its roller, into the hole behind)
    if (t.kind === 'wind') st.u += t.dir * t.push * gustAt(t, now) * dt;
    else if (t.kind === 'belt' && !st.air && st.h === 0) st.s -= t.v * (S.r / (S.r + st.u)) * dt;
  }
  if (st.u > S.reach) { st.u = S.reach; if (st.vu > 0) st.vu = 0; } else if (st.u < -S.reach) { st.u = -S.reach; if (st.vu < 0) st.vu = 0; }
  // ---- up and down: the planks, the top of a crate, or nothing
  const G = floorAt(st.s, st.u, st);
  if (st.air) {
    st.vh -= S.g * dt; st.h += st.vh * dt;
    if (st.coyote > 0) st.coyote -= dt;
    if (st.h < G - S.lip) return out(st, G > 0 ? 'crate' : 'hole', events); // (into the face of a crate; against the far edge of a hole)
    if (st.h <= G && st.vh <= 0) {
      st.h = G; st.vh = 0; st.air = false; st.jumps = 0; st.coyote = 0;
      events?.push({ type: 'land' });
      if (crouch && st.slide <= -S.rest && st.v >= S.slow) { st.slide = S.slide; st.slid = 0; events?.push({ type: 'slide' }); } // (the stick held down in the air: one lands sliding)
    } else if (st.h < -S.drop) return out(st, 'hole', events);
  } else if (G < st.h - 1e-6) { st.air = true; st.vh = 0; st.jumps = 0; st.coyote = S.coyote; st.duck = 0; if (st.slide > 0) st.slide = 0; } // (off an edge)
  else if (G > st.h + S.lip) return out(st, 'crate', events);
  else st.h = G;
  if (!st.air && st.h === 0) {
    // ---- on the planks: a plank that gives way counts from the first foot set on it; a springboard throws one
    for (const t of near(st.s)) {
      if (st.s < t.s0 - S.edge || st.s > t.s1 + S.edge) continue; // (a foot on the seam of two planks is on both)
      if (t.kind === 'crumble' && st.u >= t.u0 - S.edge && st.u <= t.u1 + S.edge && trodAt(st, t.id) === undefined) {
        st.trod = st.trod.filter((k) => k.s1 > st.s - 3); // (those left behind no longer matter: one never goes back to them)
        st.trod.push({ id: t.id, at: st.total, s1: t.s1 });
      } else if (t.kind === 'spring' && st.s >= t.s0 && st.s <= t.s1) {
        // (it throws one so fast up the track — the same along the rail as by the tower)
        st.vh = S.spring.up; st.air = true; st.jumps = 1; st.coyote = 0; st.duck = 0; st.v = Math.max(st.v, (S.spring.v * (S.r + st.u)) / S.r); if (st.slide > 0) st.slide = 0;
        events?.push({ type: 'spring' });
      }
    }
  }
  for (const a of LANDINGS) if (st.s >= a && a > st.home) st.home = a; // (the last landing reached)
  // ---- the bell
  if (st.s >= LENGTH) { st.s = LENGTH; st.best = LENGTH; st.over = true; st.time = Math.min(BOARD.max, Math.round(st.clock * 1000)); events?.push({ type: 'top', time: st.time, attempt: st.attempt }); return; }
  if (st.s > st.best) st.best = st.s;
  const turn = Math.min(S.turns - 1, Math.floor(st.s / TURN));
  if (turn !== st.turn) { st.turn = turn; events?.push({ type: 'turn', n: turn }); }
  // ---- what stands or moves in the way
  const why = touch(st, now);
  if (why) out(st, why, events);
}

/** What the runner is touching at `now` ('' when nothing): one touch ends the attempt. */
function touch(st, now) {
  const s = st.s, u = st.u, h = st.h, top = h + ((st.slide > 0 || st.duck > 0) && !st.air ? S.low : S.tall), A = S.along, W = S.across;
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
    } else if (t.kind === 'lift') {
      const y = liftAt(t, now);
      if (Math.abs(s - t.s) < 0.1 + A && h < y + t.th && top > y) return 'lift';
    } else if (t.kind === 'door') {
      const c = doorAt(t, now);
      if (Math.abs(s - t.s) < 0.08 + A && h < t.top && (u - W < c - t.gap / 2 || u + W > c + t.gap / 2)) return 'door';
    } else if (t.kind === 'cannon') {
      if (Math.abs(s - t.s) < t.r + A && Math.abs(u - cannonAt(t, now)) < t.r + W && h < t.y + t.r - 0.04 && top > t.y - t.r + 0.04) return 'cannon';
    } else if (t.kind === 'ram') {
      const e = ramAt(t, now);
      if (Math.abs(s - t.s) < 0.45 + A && h < t.top && (t.side < 0 ? u - W < -S.half + e : u + W > S.half - e)) return 'ram';
    } else if (t.kind === 'trolley') {
      let hit = false;
      if (h < t.y1 && top > t.y0) trolleysOf(t, now, (sb) => { if (Math.abs(s - sb) < 0.06 + A) hit = true; });
      if (hit) return 'trolley';
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
export function turnOf(s) { return Math.min(S.turns - 1, Math.max(0, Math.floor(s / TURN))); }
export const heightOf = (s) => trackY(s) - S.foot;

// ---------------------------------------------------------------------------
// A runner that plays by itself — the proof that the bell can be reached. It does not know the course by heart:
// it tries, a second and more ahead, what it could do — steer here or there, a key now or a little later, two
// keys — on a copy of itself, with these very rules, and does what gets furthest. It runs with the stick full
// up wherever that works, and leans to the inside, the shorter way, when nothing is in the way. Where nothing
// it can do at a run lasts — something that moves has shut the way —, it lets go of the stick if standing
// lasts, and stands (a hop over a barrel, a step aside) until a way opens: then it goes.

const LANES = [-1.25, -0.85, -0.45, 0, 0.45, 0.85, 1.25];
const SURE = 168, FAR = 264; // steps: a plan is kept while it lasts so long; it is judged on so long
const LATE = 60, PATIENCE = 600; // steps: it stops only for what would end the attempt within so long; it stands no longer than this for a way to open
const NEVER = Infinity; // (the step from which the stick is up, in a plan that stands)
const MOVES = new Set(['mill', 'stomp', 'hammer', 'barrels', 'lift', 'door', 'cannon', 'trolley', 'ram']);
const copy = (st) => ({ ...st, want: { ...st.want }, bot: null }); // (its `trod` is never changed in place: it may be shared)
const _in = { side: 0, run: 0, jump: false, down: false, crouch: false };
/**
 * How many steps (of `n`) a copy of `st` lasts with a plan: { u0 (steered to until step `at`), u (after), keys:
 * [{ at, type }], go (the stick is up from that step on: 0 at a run, NEVER standing) }. A key down is a push of
 * the stick: it is not up on that step.
 */
function lasts(st, plan, n) {
  const q = copy(st);
  for (let k = 0; k < n; k++) {
    _in.side = clamp(((q.n < plan.at ? plan.u0 : plan.u) - q.u) * 5, -1, 1);
    _in.run = q.n >= plan.go ? 1 : 0;
    for (const key of plan.keys) if (key.at === q.n) { if (key.type === 'jump') q.want.jump = S.buffer; else { q.want.down = S.buffer; _in.run = 0; } }
    sub(q, S.step, _in, null);
    if (q.over) return n + 1; // (the bell: nothing lasts longer)
    if (q.down > 0) return k;
  }
  return n;
}

/**
 * The plan that lasts longest from here among those tried — the stick up all along (`go` 0) or let go (NEVER) —,
 * and how long: { plan, score }. `cur`, `k0`: the plan one has, if any, and how long it lasts; `deep`: how many
 * keys at most; `wide`: from a standstill, a key is looked for further ahead, on a coarser grid.
 */
function search(st, B, go, cur, k0, deep, wide) {
  const now = st.n;
  let best = cur, score = k0;
  const tryPlan = (plan) => { plan.go = go; const k = lasts(st, plan, FAR); if (k > score || (k === score && best && plan.keys.length < best.keys.length)) { score = k; best = plan; } return k; };
  const lanes = LANES.slice().sort((a, b) => Math.abs(a - st.u) - Math.abs(b - st.u) || a - b);
  const held = st.n < B.at ? B.u0 : B.u;
  if (deep < 0) { deep = -deep; wide = 'three'; } // (only the three keys: the rest was tried already)
  if (wide !== 'three') {
  // ---- steering only
  for (const u of lanes) tryPlan({ u0: u, u, at: 0, keys: [] });
  // ---- what was planned, and one key more
  if (score < FAR && B.keys.length) {
    const from = Math.max(now, ...B.keys.map((k) => k.at)) + 6;
    for (const u of lanes) for (const type of ['jump', 'down']) for (let at = from; at <= now + 132 && score < FAR; at += 6) tryPlan({ u0: held, u, at: B.keys[0].at, keys: [...B.keys, { at, type }] });
  }
  // ---- one key: now, or a little later; steering where one was until then, or at once
  if (score < FAR) for (const type of ['jump', 'down']) for (let d = 0; d <= (wide ? 168 : 96) && score < FAR; d += wide ? 12 : 6) for (const u of lanes) { tryPlan({ u0: u, u, at: 0, keys: [{ at: now + d, type }] }); if (!wide && Math.abs(u - held) > 0.2) tryPlan({ u0: held, u, at: now + d, keys: [{ at: now + d, type }] }); }
  // ---- two keys (from a standstill: only where one key gets somewhere — else the way is shut, and one waits)
  if (score < SURE && deep >= 2 && (!wide || score >= 48)) {
    const two = [['jump', 'jump'], ['jump', 'down'], ['down', 'jump']], some = [held, ...lanes.filter((u) => Math.abs(u - held) > 0.2)];
    for (const [a, b] of two) for (let d = 0; d <= (wide ? 96 : 72) && score < FAR; d += wide ? 12 : 6) for (let g = 12; g <= (wide ? 108 : 84) && score < FAR; g += wide ? 12 : 8) for (const u of some) {
      tryPlan({ u0: held, u, at: now + d, keys: [{ at: now + d, type: a }, { at: now + d + g, type: b }] });
    }
  }
  }
  // ---- three keys: up the stairs and off them, a long jump and a slide
  if (score < SURE && deep >= 3) {
    const three = [['jump', 'jump', 'jump'], ['jump', 'jump', 'down'], ['jump', 'down', 'jump'], ['down', 'jump', 'jump']];
    for (const [a, b, c] of three) for (let d = 0; d <= 60 && score < FAR; d += 6) for (let g = 12; g <= 72 && score < FAR; g += 10) for (let g2 = 12; g2 <= 72 && score < FAR; g2 += 10) for (const u of [held, ...lanes.slice(0, 3)]) {
      tryPlan({ u0: held, u, at: now + d, keys: [{ at: now + d, type: a }, { at: now + d + g, type: b }, { at: now + d + g + g2, type: c }] });
    }
  }
  return { plan: best, score };
}
const take = (B, plan) => { B.u0 = plan.u0; B.u = plan.u; B.at = plan.at; B.keys = plan.keys.map((k) => ({ ...k })); B.go = plan.go; };

function think(st, B) {
  const now = st.n, cur = { u0: B.u0, u: B.u, at: B.at, keys: B.keys, go: B.go };
  const k0 = lasts(st, cur, FAR);
  if (B.go !== NEVER) {
    // ---- at a run
    if (k0 >= SURE) {
      // (all is well: with nothing planned, the inside if the inside does as well)
      if (!B.keys.length && now >= B.at) for (const u of LANES) { if (u >= B.u - 0.05) break; if (lasts(st, { u0: u, u, at: 0, keys: [], go: 0 }, FAR) >= k0) { B.u0 = B.u = u; break; } }
      return;
    }
    // (where something moves ahead, standing is tried before three keys: they are dear, and seldom what it wants)
    const moves = near(st.s + 4).some((t) => MOVES.has(t.kind) && t.s1 > st.s);
    let found = search(st, B, 0, cur, k0, moves ? 2 : 3, false);
    if (found.score < LATE && now >= B.rush) {
      // (nothing lasts at a run, and the end is near: the stick is let go, if standing lasts — until a way opens)
      const stand = search(st, B, NEVER, null, -1, 2, false);
      if (stand.score >= SURE) { take(B, stand.plan); B.stood = 0; B.stops++; return; }
    }
    if (moves && found.score < SURE) found = search(st, B, 0, found.plan, found.score, -3, false); // (and then three keys)
    take(B, found.plan);
    return;
  }
  // ---- standing: is there a way now? It goes as soon as one lasts — or, having stood long enough, whatever
  B.stood += 8;
  const tired = B.stood > PATIENCE, way = search(st, B, 0, null, -1, tired || k0 < SURE ? 3 : 2, !tired);
  if (way.score >= SURE) { take(B, way.plan); return; }
  if (k0 >= SURE && !tired) return; // (not yet: it stands on)
  // (standing does not last here either: what lasts longest, at a run or not — a hop where one stands, a step aside)
  const stand = k0 >= SURE ? { plan: cur, score: k0 } : search(st, B, NEVER, cur, k0, 2, false);
  if (tired || way.score >= stand.score) { take(B, way.plan); B.rush = now + 240; } else take(B, stand.plan);
}

/** The keys of the runner that plays by itself, for this step: { side, run, jump, down, crouch }. Call it before every step. */
export function botInput(st, out = { side: 0, run: 0, jump: false, down: false, crouch: false }) {
  const B = st.bot || (st.bot = { u0: 0, u: 0, at: 0, keys: [], go: 0, next: 0, attempt: 0, stood: 0, rush: 0, stops: 0 });
  out.side = 0; out.run = 0; out.jump = out.down = out.crouch = false;
  if (st.over || st.down > 0) return out;
  if (B.attempt !== st.attempt) { B.attempt = st.attempt; B.u0 = B.u = 0; B.at = 0; B.keys = []; B.go = 0; B.next = 0; B.stood = 0; B.rush = 0; }
  if (st.wait > 0) return out;
  if (st.n >= B.next) { think(st, B); B.next = st.n + (B.go === NEVER ? 8 : 4); }
  out.side = clamp(((st.n < B.at ? B.u0 : B.u) - st.u) * 5, -1, 1);
  out.run = st.n >= B.go ? 1 : 0;
  for (let i = B.keys.length - 1; i >= 0; i--) {
    const key = B.keys[i];
    if (key.at <= st.n) { if (key.type === 'jump') out.jump = true; else { out.down = true; out.run = 0; } B.keys.splice(i, 1); } // (down is a push of the stick: it is not up on that step)
  }
  return out;
}

/** Runs with the bot from a start at `t0` (the clock of the world, s): { time (ms), attempts, outs, over, keys, stops (times it stood to wait), clock (s it took in all) }. */
export function botRun(t0 = 0, limit = 400) {
  const st = startRun(t0), input = { side: 0, run: 0, jump: false, down: false, crouch: false }, events = [];
  let keys = 0;
  for (let t = 0; t < limit && !st.over; t += S.step) { botInput(st, input); if (input.jump || input.down) keys++; stepRun(st, S.step, input, events); }
  return { time: st.time, attempts: st.attempt, outs: st.outs, over: st.over, keys, stops: st.bot.stops, clock: st.total, why: events.filter((e) => e.type === 'out').map((e) => `${e.why} at ${e.s.toFixed(0)} m`) };
}
