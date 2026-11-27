// Balthazar Golf: its rules. No renderer here: the game, its checks and the player that plays by itself all
// read this.
//
// Nine holes of crazy golf on a little walk round the pond of acid of the north-western meadow, each the valley
// in miniature: the big red button, the swan pond, the temple stairs, the water mill, the floating stones of Mostly
// Up, the golden dog, the big wheel of the pier, a plank over the acid and the island with its boulder. Each is
// felt in a striped kerb, raised half a metre and more over the meadow, and a real hole of crazy golf: levels
// joined by ramps and stairs, humps and mounds, a green that falls away, doors in walls, sand that holds the ball
// back and ice that lets it slide, water and acid that cost a stroke, a ramp to jump from, stones to hop, pipes
// that carry the ball elsewhere, things that go by the clock — and nearly always two ways, a long safe one and a
// short one that is not. None is holed by putting straight down its lane, and no stroke is strong enough to play a
// hole in one go: one plays it in stages. One putts: the stick turns the aim left and right, a gauge swings up
// and down by itself (held back, the stick slows it), and the jump hits at the strength the gauge shows. On the
// tee the aim is the tee's own axis, straight down the lane; further on it points along the way to the cup. The
// ball rolls and slows on the felt, runs down what slopes, flies off what ends in the air, comes back off a
// cushion with most of its speed, and drops into the cup when it crosses it slowly enough (a fast one lips out).
// Off the bed, in the water or in the acid, it is put back where it was hit from, with one stroke more. Nine
// strokes at most a hole, then on to the next. The fewer strokes the better; the time of the round breaks ties.
//
// Places: each hole has a frame of its own, in metres from its tee: the hole lies towards -z, `x` is to the right
// of who looks down it, `y` is counted from its felt. `at` (its tee) and `yaw` (its heading: 0 north, a quarter
// turn west) put it in the world. What moves by itself — the swan, the mill wheel, the big wheels — is where the
// clock of the world says: the same for everybody. Time advances in steps of 1/120 s whatever the frame rate.
import { scoreOf, formatScore } from './score.js';

export const GOLF = {
  name: 'Balthazar Golf',
  acid: { x: -236, z: -82, r: 4.2 }, // the pond (ACID of the layout: the checks compare them)
  gate: { x: -225.5, z: -75.6, yaw: -1.87 }, // where one asks to play, south-east of the pond, looking at it (a heading of the valley: 0 looks south)
  stand: { x: -225.2, z: -71.3, yaw: 1.27 }, // the board of scores: on the left of the gate (as one looks through it), facing those who come; not on the right, where the acid puts back those it dissolved
  step: 1 / 120,
  ball: 0.085, cup: 0.19, // their radius (m): a ball one sees from above the whole hole
  take: 1.7, // m/s: the fastest ball the cup takes, when it crosses its very middle
  friction: 1.6, // m/s²: what the felt takes from a rolling ball
  g: 9.8, slope: 7, // m/s²: in the air; down a slope (a rolling ball takes five sevenths of it)
  cushion: 0.8, // the share of its speed a cushion gives back
  kerb: 0.14, // m: how high a kerb stands over the felt (a ball that flies higher goes over it)
  raise: 0.5, // m: how high the felt stands, at least, over the meadow
  sweep: 1.1, slow: 0.4, // s: the gauge from nothing to full; its pace when the stick is held back
  reach: [0.4, 11], // m on level felt: the least and the most of the gauge (the most is less near the cup): no stroke carries a ball up three flights of stairs, or through sand and up a ramp
  turn: [0.3, 2.4, 1.7], // rad/s: how fast the aim turns at first, how much faster each second the stick is held, at most
  most: 9, // strokes a hole
  wait: { tee: 0.9, lost: 0.9, holed: 1.5, picked: 1.2 }, // s: before one may aim, before the ball is back, before the next hole
  cycle: 1386, // s: after so long everything that moves is back where it was (the clock of the world is read modulo this)
};
/** The board of scores: strokes × 1000 + seconds (at most 999). Nine holes in one each, at best; nine times nine strokes, at worst. */
export const BOARD = { order: 'asc', min: 9000, max: 81999 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hash = (n, k = 0) => { const s = Math.sin(n * 127.1 + k * 311.7 + 74.7) * 43758.5453; return s - Math.floor(s); };
const STEP = GOLF.step, R = GOLF.ball, CUP2 = GOLF.cup * GOLF.cup, F = GOLF.friction, G = GOLF.g, TAU = Math.PI * 2;
const SPEED = 9.4; // m/s: no ball goes faster (less than its own radius a step: it never passes through a kerb)
const RISE = 0.3, CATCH = 0.12; // m: the steepest face a rolling ball still follows, step after step; how far under a felt a flying ball may come and still land on it
/** What a surface does to the roll: sand holds the ball back, ice (and steel, and wet boards) lets it slide. */
export const RUB = { sand: 3.2, ice: 0.28 };

// ---- the shapes of the beds
const box = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const round = (cx, cz, r, n, off = 0) => Array.from({ length: n }, (_, k) => [cx + Math.sin(((k + off) / n) * TAU) * r, cz - Math.cos(((k + off) / n) * TAU) * r]);
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
/** From 0 at `a` to 1 at `b`, smoothly (a ramp, a tier, the side of a mound). */
const step = (v, a, b) => smooth((v - a) / (b - a));
/** A hump: 1 at its middle, 0 from `u` = 1 on, level at both. */
const bump = (u) => (u <= -1 || u >= 1 ? 0 : (1 - u * u) * (1 - u * u));
/** The stairs of the temple: three flights of 32 cm, each a smooth rise over 80 cm (their middles). */
export const STAIRS = [-3.6, -6.5, -9.4];
const stairs = (x, z) => 0.32 * (step(z, STAIRS[0] + 0.4, STAIRS[0] - 0.4) + step(z, STAIRS[1] + 0.4, STAIRS[1] - 0.4) + step(z, STAIRS[2] + 0.4, STAIRS[2] - 0.4));
/** The boardwalk below the pier: level with the deck where one comes down to it and where one comes back up, half a metre under it between the two. */
const walk = (x, z) => -0.5 * step(z, -1.7, -3.2) * (1 - step(z, -9.4, -10.4));
/** The ramp before the swan pond, on the right of the lane: it rises a quarter of a metre in one, steeper and steeper, and ends in the air. */
const kicker = (x, z) => (z > -1.6 || z < -2.72 ? 0 : 0.24 * (1.6 + z) * (1.6 + z) * (z < -2.6 ? 1 - step(z, -2.6, -2.72) : 1) * step(x, 0.15, 0.4));
/** The dog's hill: the lane runs down 60 cm before its legs. */
const hill = (x, z) => -0.6 * smooth((-1.6 - z) / 1.4);
/** The ramp of the ninth: the last two metres of its lane rise half a metre, and end in the air. */
const ramp = (x, z) => (z < -5.6 ? 0.25 * (-5.6 - z) : 0);
const ISLE = round(0, -10.2, 1.3, 20, 0.5); // (a side of it, not a corner, faces the ramp)
const ALL = [0, 1, 2, 3];
/** The dog's bowl: an octagon, a side of it to the tee. */
export const BOWL = round(0, -6.7, 0.24, 8, 0.5);

/**
 * The nine holes, each after a place of the valley (`place`), in miniature. `beds`: the felt — `poly` (its
 * outline), `open` (the sides without a kerb), `air` (the sides with nothing under them), `y` (how high it lies
 * over the felt of the tee), `h` (its relief: any shape that has no step in it — a face may be as steep as one
 * likes), `look` ('deck': planks; 'stone': a floating stone). `blocks`: what stands on the felt (x0, z0, x1, z1,
 * height). `walls`: more cushions (x, z, x, z, height — and, for the face of a level over a lower one, the height
 * of its foot: a ball above it goes over and down, one below comes back off it). `bumpers`: (x, z, radius).
 * `pools`: water — round (x, z, radius) or with straight sides (x0, z0, x1, z1): a ball that rolls into it is
 * lost. `zones`: surfaces (`kind`: 'sand' slows, 'ice' slides, 'kick' only says that the ramp there is one to
 * jump from; `poly`). `pipes`: `in` (the mouth: x, z; `r` its radius), `out`, `aim` and `speed` (how it comes
 * out), `time` (s inside). `movers`: what goes by the clock. `links`: what the felt alone does not join — a hop, a
 * jump (x, z → x, z, as so many metres). `view`: how far the camera turns from the heading of the hole. `acid`:
 * the pond is its hazard. At the tee the aim is the tee's own axis, straight down the lane: on no hole is that
 * the line. Par is what the player with a person's hand needs (see the end of this file, and tools/golf-test.mjs).
 */
export const HOLES = [
  // 1 — three buttons that kick, in a triangle one threads; a wall across the lane with its door on the right, in a bed of sand that goes on up the ramp; a green half a step up, crowned, the cup on its left
  { name: 'The Big Red Button', place: 'the big red button', tip: 'between the buttons (they kick), through the door on the right, up the sandy ramp onto the green', par: 3, at: [-230, -73.5], yaw: Math.PI / 2, cup: [-0.6, -9.75],
    beds: [{ poly: [[-1.3, 1.2], [1.3, 1.2], [1.3, -9.7], [0.4, -10.6], [-1.3, -10.6]], h: (x, z) => 0.32 * step(z, -7.3, -8.3) + 0.1 * bump(Math.hypot(x + 0.1, z + 9.6) / 1.1) }],
    bumpers: [[0, -3.3, 0.36], [-0.72, -4.9, 0.3], [0.72, -4.9, 0.3]],
    walls: [[-1.3, -6.2, 0.45, -6.2, 0.3]],
    zones: [{ kind: 'sand', poly: box(-1.3, -5.9, 1.3, -8.3) }] },
  // 2 — the short way: off the ramp, over the pond (too soft: in it), down into the sand; the long one: round by the left, where the swan glides; the green is a terrace with no kerb behind it
  { name: 'The Swan Pond', place: 'the great pond and its swans', tip: 'off the ramp and over the pond — or round by the left, when the swan has passed; no kerb behind the green', par: 3, at: [-244, -73.5], yaw: Math.PI / 2, cup: [-0.7, -10.7], view: -0.15,
    beds: [{ poly: box(-1.5, 1.2, 1.5, -11.8), open: [2], h: (x, z) => kicker(x, z) + 0.3 * step(z, -8.2, -9.0) }],
    pools: [[0.35, -4.1, 1.0]],
    zones: [{ kind: 'kick', poly: box(0.3, -1.6, 1.5, -2.7) }, { kind: 'sand', poly: box(-1.5, -5.4, 1.5, -7.4) }],
    movers: [{ kind: 'slide', look: 'swan', z: -4.1, x0: -0.1, hw: 0.28, hd: 0.15, amp: 1.05, period: 7, phase: 0.1, high: 0.4 }],
    links: [[0.9, -2.4, 0.9, -5.5, 2.2]] },
  // 3 — three flights of stairs, a balustrade across each landing with its door on the other side from the one before, a basin in a dead corner, the cup inside the temple's three walls
  { name: 'The Temple Stairs', place: 'the waterfall and the stairway to the temple', tip: 'three flights up, a door on each landing (too soft and it rolls back down); the cup is inside the temple, which opens to the back', par: 3, at: [-254, -78.2], yaw: 0, cup: [-0.3, -11.5],
    beds: [{ poly: box(-1.3, 1.2, 1.3, -12.6), h: stairs }],
    // (a balustrade on each landing; and the three walls of the temple round the cup, open to the back)
    walls: [[-0.4, -5.4, 1.3, -5.4, 0.7], [-1.3, -8.3, 0.4, -8.3, 0.7], [-0.9, -10.9, 0.3, -10.9, 0.7], [-0.9, -10.9, -0.9, -11.95, 0.7], [0.3, -10.9, 0.3, -11.95, 0.7]],
    pools: [[0.75, -4.7, 0.36]] },
  // 4 — the short way: under the paddles and through the door, gently: the mill pond lies just behind it; the long one: round by the left, over a ridge; the green is a tier up
  { name: 'The Water Mill', place: 'the old mill and its water wheel', tip: 'under the paddles, through the door — softly: the mill pond is behind it — or round by the left, over the ridge', par: 4, at: [-250.5, -95.5], yaw: -Math.PI / 2, cup: [0.55, -11.5],
    beds: [{ poly: [[-1.3, 1.2], [1.3, 1.2], [1.3, -12.4], [-1.3, -12.4], [-1.3, -9.2], [-4.2, -9.2], [-4.2, -1.4], [-1.3, -1.4]], h: (x, z) => (x < -1.45 ? 0.35 * bump((z + 5.3) / 1.6) : 0) + (z < -9.6 ? 0.25 * step(z, -9.6, -10.3) : 0) }],
    blocks: [[-1.3, -5.9, -0.35, -4.7, 1.3], [0.35, -5.9, 1.3, -4.7, 1.3], [-1.6, -7.8, -1.3, -2.8, 0.3]],
    pools: [[-0.55, -7.7, 0.55, -6.8]],
    zones: [{ kind: 'sand', poly: box(-4.2, -2.1, -1.6, -3.3) }, { kind: 'sand', poly: box(-4.2, -7.9, -3.1, -9.2) }],
    movers: [{ kind: 'wheel', n: 4, z: -4.0, r: 1.0, up: 1.08, hw: 0.45, hd: 0.05, period: 6, max: 0.33, high: 0.4 }] },
  // 5 — stones in the air, each lower than the last, a kerb behind each to stop the ball: straight on, then left, then on down to the green stone; the short way hops the widest gap from the first stone straight into the green's sand
  { name: 'The Floating Stones', place: 'the floating stones of Mostly Up', tip: 'hop on, then left, then on: a kerb behind each stone stops the ball — or one long hop over the right of the first stone', par: 3, at: [-235, -99.8], yaw: -Math.PI / 2, cup: [-0.2, -10.0], floor: -1.8, lift: 0.3,
    beds: [
      { poly: box(-1.1, 1.2, 1.1, -2.0), open: [2], air: [2] },
      { poly: [[-0.9, -2.35], [0.9, -2.35], [0.9, -4.4], [0, -4.4], [-0.9, -4.4]], y: -0.2, open: [0, 2, 4], air: [0, 1, 2, 3, 4], look: 'stone' },
      { poly: box(-2.65, -3.0, -1.25, -6.2), y: -0.4, open: [1, 2], air: ALL, look: 'stone' },
      { poly: [[-2.65, -6.55], [-1.1, -6.55], [-1.1, -6.0], [0.9, -6.0], [0.9, -10.6], [-1.0, -10.6], [-1.0, -8.8], [-2.65, -8.8]], y: -0.8, open: [0, 1, 2], air: [0, 1, 2, 3, 4, 5, 6, 7], look: 'stone' }],
    zones: [{ kind: 'sand', poly: box(-1.1, -6.0, 0.9, -8.8) }],
    links: [[0, -1.8, 0, -2.55, 0.75], [-0.7, -3.6, -1.45, -3.6, 0.75], [-1.9, -6.0, -1.9, -6.75, 0.75], [0.45, -4.2, 0.45, -6.2, 3.0]] },
  // 6 — down the hill, between the dog's paws, off the corner, through the door of a wall — or into the kennel pipe on the way down; the cup stands on a mound that falls away all round
  { name: 'The Golden Dog', place: 'the golden dog on its cliff', tip: 'down the hill and under the dog, off the corner, through the door — or into the pipe on the right of the hill; the cup is on top of the mound', par: 3, at: [-221.5, -97.5], yaw: -2.03, cup: [-4.7, -7.8], view: -0.55,
    beds: [{ poly: [[-1.2, 1.2], [1.2, 1.2], [1.2, -7.8], [-0.2, -9.2], [-6, -9.2], [-6, -6.4], [-1.2, -6.4]], h: (x, z) => hill(x, z) + 0.42 * bump(Math.hypot(x + 4.7, z + 7.8) / 1.3) }],
    blocks: [[-1.2, -5.0, -0.5, -4.3, 1.0], [0.5, -5.0, 1.2, -4.3, 1.0]],
    // (its bowl, in the way of who putts straight; and the wall across the way to the mound, its door at the top)
    walls: [...BOWL.map((p, k) => [...p, ...BOWL[(k + 1) % 8], 0.22, -0.6]), [-2.6, -9.2, -2.6, -7.55, 0.3, -0.6]],
    zones: [{ kind: 'sand', poly: [[-1.2, -5.5], [1.2, -5.5], [1.2, -7.8], [-0.2, -9.2], [-1.2, -9.2]] }],
    pipes: [{ in: [0.88, -2.9], out: [-1.5, -8.6], aim: -Math.PI / 2, speed: 1.3, r: 0.19 }] },
  // 7 — the pier: no rail between the wheels (off its left side, the sea), the gondolas come down across the lane, a hump-back between the two; a boardwalk below on the right is the long way; sand, then the pier head: a plate of steel with nothing behind it nor on its left
  { name: 'The Big Wheel', place: 'the grand pier and its big wheel', tip: 'between the gondolas and over the hump, no rail to the sea — or down to the boardwalk on the right; the pier head is polished steel: it slides, and nothing stops the ball at its end', par: 3, at: [-209.5, -86.5], yaw: 1.3, cup: [-0.9, -11.3],
    beds: [
      { poly: [[-1.2, 1.2], [1.2, 1.2], [1.2, -0.3], [1.2, -1.7], [1.2, -9.4], [1.2, -10.5], [1.2, -11.4], [1.2, -12.4], [-1.2, -12.4], [-1.2, -9.4], [-1.2, -2.0]], open: [2, 3, 4, 5, 6, 7, 8, 9], air: [6, 7, 8, 9], look: 'deck', h: (x, z) => 0.35 * bump((z + 5.6) / 1.1) },
      { poly: box(1.2, -0.3, 2.4, -11.4), open: [3], look: 'deck', h: walk }],
    blocks: [[-1.2, -3.65, -0.55, -3.35, 0.9], [0.55, -3.65, 1.2, -3.35, 0.9], [-1.2, -7.85, -0.55, -7.55, 0.9], [0.55, -7.85, 1.2, -7.55, 0.9]],
    walls: [[1.2, -2.5, 1.2, -9.7, 0.45, -0.5]],
    zones: [{ kind: 'ice', poly: box(-1.2, -9.6, 1.2, -12.4) }, { kind: 'sand', poly: box(-1.2, -8.5, 1.2, -9.5) }],
    movers: [
      { kind: 'sail', look: 'gondola', n: 6, z: -3.5, r: 2.2, up: 2.75, hw: 0.28, hd: 0.2, period: 14, max: 0.22, high: 0.45 },
      { kind: 'sail', look: 'gondola', n: 6, z: -7.7, r: 2.2, up: 2.75, hw: 0.28, hd: 0.2, period: 11, max: 0.22, high: 0.45 }] },
  // 8 — the plank over the acid, a wrecking ball swinging across it; the long way is the sandy shore on the right; the green is crowned, with nothing on its acid sides
  { name: 'The Plank', place: 'the acid pond', tip: 'the plank has no kerb and a ball swings across it — or round by the sandy shore; sand where the plank lands, no kerb on the acid side of the green', par: 4, at: [-231, -84.9], yaw: Math.PI / 2, cup: [1.0, -10.4], acid: true, floor: -0.7,
    beds: [
      { poly: [[-1.2, 1.2], [1.2, 1.2], [1.2, -0.6], [1.2, -1.8], [0.32, -1.8], [-0.32, -1.8], [-1.2, -1.8]], open: [2, 4] },
      { poly: box(-0.32, -1.75, 0.32, -8.05), open: ALL, air: ALL, look: 'deck' },
      { poly: [[-0.9, -8], [-0.32, -8], [0.32, -8], [1.7, -8], [1.7, -8.4], [1.7, -9.6], [1.7, -11.6], [-0.9, -11.6]], open: [1, 4, 6, 7], air: [6, 7], h: (x, z) => 0.26 * bump(Math.hypot(x - 0.9, z + 10.3) / 1.5) },
      { poly: [[1.2, -0.6], [3.4, -0.6], [3.4, -9.6], [1.7, -9.6], [1.7, -8.4], [2.2, -8.4], [2.2, -1.8], [1.2, -1.8]], open: [3, 7], h: (x, z) => 0.22 * bump((z + 5.0) / 1.5) }],
    zones: [{ kind: 'sand', poly: box(2.2, -2.6, 3.4, -4.4) }, { kind: 'sand', poly: box(2.2, -6.0, 3.4, -7.6) }, { kind: 'sand', poly: box(-0.9, -8.0, 1.7, -9.0) }],
    movers: [{ kind: 'slide', look: 'ball', z: -4.9, x0: 0, hw: 0.22, hd: 0.22, amp: 1.0, period: 5.5, phase: 0, high: 0.5 }] },
  // 9 — a boulder rolls across the run-up; up the ramp, over the acid, onto the island (boards only right behind it), where the cup lies in a nest of low walls open to the back; the long way: a pocket of sand on the right and the smugglers' pipe, which comes out on the island
  { name: 'The Acid Test', place: 'the island and its rolling boulder', tip: 'past the boulder, up the ramp, over the acid, onto the island — or the pipe in the sandy pocket on the right; the cup is in a nest that opens to the back', par: 4, at: [-246.2, -82], yaw: -Math.PI / 2, cup: [0.2, -10.6], acid: true, floor: -0.75, lift: 0.1,
    beds: [
      { poly: [[-1.1, 1.2], [1.1, 1.2], [1.1, -1.4], [3.0, -1.4], [3.0, -4.4], [1.1, -4.4], [1.1, -5.6], [1.1, -7.6], [-1.1, -7.6], [-1.1, -5.6]], open: [7], h: ramp },
      { poly: ISLE, y: -0.42, air: ISLE.map((_, k) => k), isle: true }],
    blocks: [[1.1, -4.4, 1.25, -2.5, 0.3]],
    // (the back of the island is boarded up, but only right behind it; and the cup lies in a nest of three low walls that opens to those boards: one comes at it from behind, or off them)
    walls: [...[17, 18, 19, 0, 1].map((k) => [...ISLE[k], ...ISLE[(k + 1) % 20], 0.9]), [-0.25, -10.3, 0.65, -10.3, 0.3], [-0.25, -10.3, -0.25, -10.8, 0.3], [0.65, -10.3, 0.65, -10.8, 0.3]],
    zones: [{ kind: 'sand', poly: box(1.3, -1.4, 3.0, -2.9) }],
    pipes: [{ in: [1.62, -4.0], out: [-0.8, -10.2], aim: Math.PI / 2, speed: 0.9, time: 1.6, r: 0.2 }],
    movers: [{ kind: 'slide', look: 'boulder', z: -3.4, x0: 0, hw: 0.3, hd: 0.3, amp: 0.72, period: 4.5, phase: 0.3, high: 0.6 }],
    links: [[0, -7.4, 0, -9.3, 2.5]] },
];

/**
 * The grounds round the holes (world x, z): the path of planks (broken lines: from the gate round all nine holes,
 * with a spur to each tee), the poles that carry the bunting and its bulbs (strung from one to the next, in
 * runs), the benches and the tubs of flowers ([x, z, heading: where one looks, 0 north]), and the ticket kiosk
 * beside the gate. Nothing of it stands on a bed or near the acid.
 */
export const GROUNDS = {
  path: [
    [[-225.9, -75.4], [-228.3, -75.6], [-241.7, -75.6], [-254.0, -76.1], [-251.9, -76.3], [-252.0, -77.4], [-252.0, -92.8], [-252.6, -93.5], [-237.4, -93.5], [-236.9, -97.4], [-236.9, -97.6], [-224.0, -97.6], [-223.1, -98.3]],
    [[-226.8, -75.5], [-228.2, -73.5]],
    [[-241.7, -75.6], [-241.8, -73.5]],
    [[-252.6, -93.5], [-252.6, -95.5]],
    [[-236.9, -97.6], [-236.9, -99.8]],
    [[-209.9, -97.9], [-212.0, -92.4], [-207.4, -88.0], [-207.6, -86.3], [-207.6, -84.6], [-208.8, -83.8], [-222.0, -87.9], [-228.6, -86.6], [-229.2, -84.9]],
    [[-222.0, -87.9], [-225.2, -82.2], [-226.4, -77.6], [-225.9, -75.4]],
    [[-242.0, -87.3], [-248.2, -87.0], [-248.2, -82.0], [-248.4, -75.9]]],
  poles: [[-227.4, -76.8], [-232.6, -76.4], [-238.4, -76.5], [-244.4, -76.7], [-250.4, -77.0], [-224.4, -78.0], [-223.2, -82.8], [-221.6, -87.0]],
  runs: [[0, 1, 2, 3, 4], [0, 5, 6, 7]],
  benches: [[-246.6, -77.7, 0], [-236.6, -91.6, Math.PI], [-219.4, -84.3, 2.6]],
  tubs: [[-224.7, -77.2, 0], [-226.4, -73.6, 0], [-251.0, -76.4, 0], [-206.9, -84.7, 0], [-238.2, -92.4, 0], [-249.4, -86.0, 0]],
  kiosk: [-222.3, -77.4, -1.87],
};

// ---- each hole made ready: its frame, its beds, its cushions, its surfaces, its pipes
/** Makes a hole ready to be played: `i` is its number (0 … 8). (The checks make a bare practice bed with it.) */
export function prepare(H, i) {
  H.n = i;
  H.cos = Math.cos(H.yaw); H.sin = Math.sin(H.yaw);
  H.floor ??= -0.6;
  H.tee = [0, 0];
  H.walls ||= []; H.blocks ||= []; H.bumpers ||= []; H.movers ||= []; H.links ||= []; H.pools ||= []; H.zones ||= []; H.pipes ||= [];
  // (how far from its middle a mover can stop a ball, along the lane: a paddle of the wheel swings to and fro)
  for (const m of H.movers) m.band = m.hd + (m.kind === 'wheel' ? m.r * Math.sin(m.max) : 0);
  const walls = [];
  const wall = (ax, az, bx, bz, bed, high, base) => { const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); walls.push({ ax, az, dx, dz, il2: 1 / (l * l), nx: -dz / l, nz: dx / l, x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz), bed, high, base }); };
  for (const bed of H.beds) {
    bed.y ||= 0; bed.open ||= []; bed.air ||= [];
    bed.n = bed.poly.length;
    bed.xs = Float64Array.from(bed.poly, (p) => p[0]); bed.zs = Float64Array.from(bed.poly, (p) => p[1]);
    bed.x0 = Math.min(...bed.xs); bed.x1 = Math.max(...bed.xs); bed.z0 = Math.min(...bed.zs); bed.z1 = Math.max(...bed.zs);
    for (let k = 0; k < bed.n; k++) if (!bed.open.includes(k)) wall(...bed.poly[k], ...bed.poly[(k + 1) % bed.n], bed, GOLF.kerb);
  }
  // (a block stands on the bed under its middle; a wall on the island or the first bed, or from the height it gives: the face of a level over a lower one)
  for (const [x0, z0, x1, z1, high] of H.blocks) { const bed = bedAt(H, (x0 + x1) / 2, (z0 + z1) / 2, 99) || H.beds[0]; wall(x0, z0, x1, z0, bed, high); wall(x1, z0, x1, z1, bed, high); wall(x1, z1, x0, z1, bed, high); wall(x0, z1, x0, z0, bed, high); }
  for (const [ax, az, bx, bz, high, base] of H.walls) wall(ax, az, bx, bz, H.beds.find((b) => b.isle) || H.beds[0], high, base);
  H.cushions = walls;
  for (const z of H.zones) { z.n = z.poly.length; z.xs = Float64Array.from(z.poly, (q) => q[0]); z.zs = Float64Array.from(z.poly, (q) => q[1]); z.x0 = Math.min(...z.xs); z.x1 = Math.max(...z.xs); z.z0 = Math.min(...z.zs); z.z1 = Math.max(...z.zs); z.rub = RUB[z.kind] || 1; }
  for (const q of H.pipes) { q.r ??= 0.22; q.time ??= 1.2; q.speed ??= 1.6; q.max ??= 4.5; q.steps = Math.round(q.time / STEP); }
  if (H.acid) H.acid = [...toLocal(H, GOLF.acid.x, GOLF.acid.z), GOLF.acid.r];
  return H;
}

/** A place of a hole, in the world: [x, z]. */
export function toWorld(H, x, z, out = [0, 0]) { out[0] = H.at[0] + x * H.cos + z * H.sin; out[1] = H.at[1] - x * H.sin + z * H.cos; return out; }
/** A place of the world, in the frame of a hole: [x, z]. */
export function toLocal(H, wx, wz, out = [0, 0]) { const dx = wx - H.at[0], dz = wz - H.at[1]; out[0] = dx * H.cos - dz * H.sin; out[1] = dx * H.sin + dz * H.cos; return out; }
/** The heading (0 north, a quarter turn west) of an aim of a hole (0 down the hole, turning right). */
export const headingOf = (H, aim) => H.yaw - aim;

function inPoly(bed, x, z) {
  const X = bed.xs, Z = bed.zs;
  let c = false;
  for (let i = 0, j = bed.n - 1; i < bed.n; j = i++) if ((Z[i] > z) !== (Z[j] > z) && x < ((X[j] - X[i]) * (z - Z[i])) / (Z[j] - Z[i]) + X[i]) c = !c;
  return c;
}
let _fy = 0; // (the height of the felt bedAt found)
/** The bed under (x, z) — the highest whose felt is not above `top` —, or null: nothing is built there. */
function bedAt(H, x, z, top) {
  let best = null;
  _fy = -Infinity;
  for (let i = 0; i < H.beds.length; i++) {
    const bed = H.beds[i];
    if (x < bed.x0 || x > bed.x1 || z < bed.z0 || z > bed.z1 || !inPoly(bed, x, z)) continue;
    const y = bed.h ? bed.y + bed.h(x, z) : bed.y;
    if (y <= top && y > _fy) { _fy = y; best = bed; }
  }
  return best;
}
/** Is (x, z) of a hole in its water — or within `pad` of it? (A pool is round: x, z, radius; or a basin with straight sides: x0, z0, x1, z1.) */
export function wet(H, x, z, pad = 0) {
  for (let i = 0; i < H.pools.length; i++) {
    const q = H.pools[i];
    if (q.length === 3 ? (x - q[0]) * (x - q[0]) + (z - q[1]) * (z - q[1]) < (q[2] + pad) * (q[2] + pad) : x > q[0] - pad && x < q[2] + pad && z > q[1] - pad && z < q[3] + pad) return true;
  }
  return false;
}
/** How much the surface at (x, z) of a hole holds a rolling ball back: 1 on felt, more on sand, less on ice. */
export function rubAt(H, x, z) {
  for (let i = 0; i < H.zones.length; i++) { const q = H.zones[i]; if (q.rub !== 1 && x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1 && inPoly(q, x, z)) return q.rub; }
  return 1;
}
/** The height of the felt at (x, z) of a hole (-Infinity: none). */
export function feltAt(H, x, z) { bedAt(H, x, z, 99); return _fy; }
/** The level of the felt of the tee of a hole, over the sea: its felt stands `GOLF.raise` over the highest ground under it (no blade of the meadow comes through). `ground(x, z)`: the ground of the world. */
export function levelOf(H, ground) {
  let top = -Infinity;
  const w = [0, 0];
  for (const bed of H.beds) {
    if (bed.isle) continue; // (it stands in the pond)
    for (let k = 0; k < bed.n; k++) {
      const a = bed.poly[k], b = bed.poly[(k + 1) % bed.n], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
      for (let i = 0; i < n; i++) { const x = a[0] + ((b[0] - a[0]) * i) / n, z = a[1] + ((b[1] - a[1]) * i) / n; toWorld(H, x, z, w); if (!bed.air.includes(k) || !H.acid) top = Math.max(top, ground(w[0], w[1]) - bed.y - (bed.h ? bed.h(x, z) : 0)); }
    }
    for (let x = bed.x0 + 0.25; x < bed.x1; x += 0.5) for (let z = bed.z0 + 0.25; z < bed.z1; z += 0.5) { if (!inPoly(bed, x, z) || (H.acid && bed.air.length)) continue; toWorld(H, x, z, w); top = Math.max(top, ground(w[0], w[1]) - bed.y - (bed.h ? bed.h(x, z) : 0)); }
  }
  return top + GOLF.raise + (H.lift || 0);
}

// ---- what goes by the clock of the world
const _mv = { x: 0, z: 0, hw: 0, hd: 0, ux: 0, uz: 0, on: false, turn: 0 };
/**
 * Where a mover of a hole is at the second `tw` of the clock of the world: { x, z (its middle), hw, hd (half its
 * width and depth), ux, uz (m/s, across and along the lane), on (is it in the way of a ball?), turn (a wheel: how
 * far it has turned, rad) }. A sliding thing (the swan) goes from side to side. Of a wheel that turns across the
 * lane (the big wheel: `sail`) only the gondola that comes down through the lane counts, while it is low enough to
 * stop a ball; of a wheel that turns along it (the mill: `wheel`), the paddle that sweeps the felt, towards the tee.
 */
export function moverAt(m, tw, out = {}) {
  const t = tw / m.period;
  out.z = m.z; out.hw = m.hw; out.hd = m.hd; out.uz = 0;
  if (m.kind === 'slide') {
    const a = TAU * (t - Math.floor(t) + m.phase);
    out.x = (m.x0 || 0) + m.amp * Math.sin(a); out.ux = ((m.amp * TAU) / m.period) * Math.cos(a); out.on = true; out.turn = 0;
  } else {
    const a = TAU * (t - Math.floor(t)), q = TAU / (m.n || 4), e = a + q / 2 - Math.floor((a + q / 2) / q) * q - q / 2, w = ((m.r * TAU) / m.period) * Math.cos(e);
    out.turn = a; out.on = Math.abs(e) < m.max;
    if (m.kind === 'wheel') { out.x = 0; out.ux = 0; out.z = m.z + m.r * Math.sin(e); out.uz = w; } else { out.x = m.r * Math.sin(e); out.ux = w; }
  }
  return out;
}

// ---- the ball
/** A ball at rest at (x, z) of a hole. */
export function ballAt(H, x, z, b = {}) { b.x = x; b.z = z; b.y = feltAt(H, x, z); b.vx = 0; b.vz = 0; b.vy = 0; b.air = false; b.lip = false; b.pipe = -1; b.wait = 0; return b; }

function collide(H, b, tw, ev) {
  // the cushions: the kerbs of the beds, the walls of the mill, the paws of the dog, the dog's bowl, the boards of the island
  const W = H.cushions;
  for (let i = 0; i < W.length; i++) {
    const w = W[i];
    if (b.x < w.x0 - R || b.x > w.x1 + R || b.z < w.z0 - R || b.z > w.z1 + R) continue;
    const t = clamp(((b.x - w.ax) * w.dx + (b.z - w.az) * w.dz) * w.il2, 0, 1), px = w.ax + w.dx * t, pz = w.az + w.dz * t, ex = b.x - px, ez = b.z - pz, d2 = ex * ex + ez * ez;
    if (d2 >= R * R) continue;
    const base = w.base !== undefined ? w.base : w.bed.h ? w.bed.y + w.bed.h(px, pz) : w.bed.y;
    if (b.y >= base + w.high || b.y < base - 0.3) continue; // (over it, or already under the bed)
    const d = Math.sqrt(d2), nx = d > 1e-9 ? ex / d : w.nx, nz = d > 1e-9 ? ez / d : w.nz;
    b.x = px + nx * R; b.z = pz + nz * R;
    const vn = b.vx * nx + b.vz * nz;
    if (vn < 0) { const k = (1 + GOLF.cushion) * vn; b.vx -= k * nx; b.vz -= k * nz; if (ev && vn < -0.5) ev.push({ type: 'bounce', speed: -vn }); }
  }
  // the button: it gives back more than it gets
  for (let i = 0; i < H.bumpers.length; i++) {
    const m = H.bumpers[i], ex = b.x - m[0], ez = b.z - m[1], rr = m[2] + R, d2 = ex * ex + ez * ez;
    if (d2 >= rr * rr || b.y > 0.45) continue;
    const d = Math.sqrt(d2) || 1, nx = ex / d, nz = ez / d;
    b.x = m[0] + nx * rr; b.z = m[1] + nz * rr;
    const vn = b.vx * nx + b.vz * nz;
    if (vn < 0) {
      const out = Math.max(-vn * 1.15, 2.6);
      b.vx += (out - vn) * nx; b.vz += (out - vn) * nz;
      const s = Math.hypot(b.vx, b.vz); if (s > SPEED) { b.vx *= SPEED / s; b.vz *= SPEED / s; }
      if (ev) ev.push({ type: 'bump', n: i, speed: out });
    }
  }
  // what moves: the swan shoves the ball along; a gondola, a paddle stop it (or send it back)
  for (let i = 0; i < H.movers.length; i++) {
    const m = H.movers[i];
    if (b.y > m.high || b.z < m.z - m.band - R || b.z > m.z + m.band + R) continue;
    const v = moverAt(m, tw, _mv);
    if (!v.on) continue;
    const qx = clamp(b.x, v.x - v.hw, v.x + v.hw), qz = clamp(b.z, v.z - v.hd, v.z + v.hd), ex = b.x - qx, ez = b.z - qz, d2 = ex * ex + ez * ez;
    if (d2 >= R * R) continue;
    let nx, nz, push;
    if (d2 > 1e-12) { const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; push = R - d; } else {
      // (its middle is inside the wall: out by the nearest face)
      const px = v.hw - Math.abs(b.x - v.x), pz = v.hd - Math.abs(b.z - v.z);
      if (pz < px) { nx = 0; nz = b.z < v.z ? -1 : 1; push = pz + R; } else { nx = b.x < v.x ? -1 : 1; nz = 0; push = px + R; }
    }
    b.x += nx * push; b.z += nz * push;
    const vn = (b.vx - v.ux) * nx + (b.vz - v.uz) * nz;
    if (vn < 0) { const k = (1 + GOLF.cushion) * vn; b.vx -= k * nx; b.vz -= k * nz; const s = Math.hypot(b.vx, b.vz); if (s > SPEED) { b.vx *= SPEED / s; b.vz *= SPEED / s; } if (ev && vn < -0.5) ev.push({ type: 'bounce', speed: -vn, moving: true }); }
  }
}

/** A ball that stops in the way of what moves is put just clear of it (towards the tee, before the wheels). */
function settle(H, b) {
  for (const m of H.movers) {
    const band = m.band + R + 0.03;
    if (Math.abs(b.z - m.z) < band) b.z = m.z + (m.kind !== 'slide' || b.z >= m.z ? band : -band);
  }
}

export const ROLLS = 0, RESTS = 1, HOLED = 2, ACID = 3, OUT = 4, WATER = 5;
/**
 * Advances a ball of hole `H` by one step of 1/120 s; `tw`: the second of the clock of the world at the end of
 * the step. Returns ROLLS, RESTS (it has stopped), HOLED, ACID, WATER or OUT (it is lost: in the acid, in the
 * water of a hole, or off the bed).
 * `events`: { type: 'bounce' (speed) | 'bump' | 'land' (speed) | 'lip' }.
 */
export function ballStep(H, b, tw, ev) {
  const dt = STEP;
  if (b.pipe >= 0) {
    // in a pipe: it comes out at the other end, after a moment, the way the pipe points
    if (--b.wait > 0) return ROLLS;
    const q = H.pipes[b.pipe];
    b.x = q.out[0]; b.z = q.out[1]; b.y = feltAt(H, b.x, b.z); b.vx = Math.sin(q.aim) * q.speed; b.vz = -Math.cos(q.aim) * q.speed; b.vy = 0; b.air = false;
    if (ev) ev.push({ type: 'out', n: b.pipe });
    b.pipe = -1;
    return ROLLS;
  }
  if (b.air) {
    // in the air: it comes down on felt that was under it — or on nothing
    const y0 = b.y;
    b.vy -= G * dt; b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
    collide(H, b, tw, ev);
    if (bedAt(H, b.x, b.z, y0 + CATCH) && b.y <= _fy) {
      const hit = -b.vy;
      b.y = _fy;
      if (hit > 1.4) { b.vy = hit * 0.32; b.vx *= 0.86; b.vz *= 0.86; if (ev) ev.push({ type: 'land', speed: hit }); } else {
        // (down on the felt: from now on it follows it, down a slope as well as on the level)
        b.air = false; const y = b.y; b.vy = bedAt(H, b.x + b.vx * dt, b.z + b.vz * dt, y + 0.06) ? (_fy - y) / dt : 0;
      }
    } else if (b.y < H.floor) return H.acid && (b.x - H.acid[0]) ** 2 + (b.z - H.acid[1]) ** 2 < H.acid[2] * H.acid[2] ? ACID : OUT;
    return ROLLS;
  }
  // on the felt: the slope pulls it, the felt slows it (sand more, ice less)
  const bed = bedAt(H, b.x, b.z, b.y + 0.06), F = H.zones.length ? GOLF.friction * rubAt(H, b.x, b.z) : GOLF.friction;
  let ax = 0, az = 0;
  if (bed && bed.h) { const e = 0.01; ax = (-GOLF.slope * (bed.h(b.x + e, b.z) - bed.h(b.x - e, b.z))) / (2 * e); az = (-GOLF.slope * (bed.h(b.x, b.z + e) - bed.h(b.x, b.z - e))) / (2 * e); }
  const sp = Math.hypot(b.vx, b.vz), pull = Math.hypot(ax, az);
  if (sp < 0.04) {
    if (pull <= F) { b.vx = 0; b.vz = 0; settle(H, b); return RESTS; }
    const k = ((pull - F) / pull) * dt; b.vx += ax * k; b.vz += az * k;
  } else {
    const ox = b.vx, oz = b.vz, f = (F * dt) / sp;
    b.vx += ax * dt - ox * f; b.vz += az * dt - oz * f;
    if (b.vx * ox + b.vz * oz <= 0 && pull <= F) { b.vx = 0; b.vz = 0; settle(H, b); return RESTS; }
    const s2 = b.vx * b.vx + b.vz * b.vz; if (s2 > SPEED * SPEED) { const k = SPEED / Math.sqrt(s2); b.vx *= k; b.vz *= k; } // (down a long slope)
  }
  b.x += b.vx * dt; b.z += b.vz * dt;
  collide(H, b, tw, ev);
  if (!bedAt(H, b.x, b.z, b.y + RISE)) { b.air = true; return ROLLS; } // (off an edge without a kerb)
  const fall = b.y + b.vy * dt - 0.5 * G * dt * dt;
  if (_fy < fall - 1e-5) { b.air = true; b.y = fall; b.vy -= G * dt; return ROLLS; } // (the felt drops away faster than it falls: off a crest, off a lip)
  b.vy = Math.min((_fy - b.y) / dt, 0.6 * Math.hypot(b.vx, b.vz), 3.5); b.y = _fy; // (it rises as the felt does — but a face too steep to be a ramp does not throw it into the sky)
  if (H.pools.length && wet(H, b.x, b.z)) return WATER;
  // a pipe takes a ball that rolls into its mouth (not one that flies over it at full speed)
  for (let i = 0; i < H.pipes.length; i++) {
    const q = H.pipes[i], ex = b.x - q.in[0], ez = b.z - q.in[1];
    if (ex * ex + ez * ez < q.r * q.r && b.vx * b.vx + b.vz * b.vz <= q.max * q.max) { b.pipe = i; b.wait = q.steps; b.x = q.in[0]; b.z = q.in[1]; b.vx = 0; b.vz = 0; b.vy = 0; if (ev) ev.push({ type: 'pipe', n: i }); return ROLLS; }
  }
  // the cup: it takes a ball that crosses it slowly enough — the nearer its middle, the faster that may be
  const cx = b.x - H.cup[0], cz = b.z - H.cup[1], d2 = cx * cx + cz * cz;
  if (d2 < CUP2) {
    const s = Math.hypot(b.vx, b.vz);
    if (s <= GOLF.take * Math.sqrt(1 - d2 / CUP2)) { b.x = H.cup[0]; b.z = H.cup[1]; b.y -= 0.12; b.vx = 0; b.vz = 0; b.vy = 0; return HOLED; }
    // (too fast: it lips out — bent towards the middle, and slowed)
    const k = (9 * dt) / GOLF.cup, slow = 1 - 3 * dt;
    b.vx = (b.vx - cx * k) * slow; b.vz = (b.vz - cz * k) * slow;
    if (!b.lip) { b.lip = true; if (ev) ev.push({ type: 'lip', speed: s }); }
  } else b.lip = false;
  return ROLLS;
}

// ---- how far from the cup: the way round the kerbs, on a grid
const CELL = 0.2, CLEAR = 0.15, CLIMB = 0.17; // (m: a place of the grid to the next one, at most so much higher)
/** The map of a hole: for each place of a grid, how far the cup is by the felt (and which place comes next on the way). */
function mapOf(H) {
  if (H.map) return H.map;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const bed of H.beds) { x0 = Math.min(x0, bed.x0); x1 = Math.max(x1, bed.x1); z0 = Math.min(z0, bed.z0); z1 = Math.max(z1, bed.z1); }
  const i0 = Math.floor(x0 / CELL) - 1, j0 = Math.floor(z0 / CELL) - 1, nx = Math.ceil(x1 / CELL) + 2 - i0, nz = Math.ceil(z1 / CELL) + 2 - j0, N = nx * nz;
  const ok = new Uint8Array(N), dist = new Float64Array(N).fill(Infinity), next = new Int32Array(N).fill(-1), leap = new Uint8Array(N), ht = new Float32Array(N);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = (i + i0) * CELL, z = (j + j0) * CELL;
    if (!bedAt(H, x, z, 99)) continue;
    const y = (ht[j * nx + i] = _fy);
    let free = true;
    for (const w of H.cushions) {
      const t = clamp(((x - w.ax) * w.dx + (z - w.az) * w.dz) * w.il2, 0, 1); if (Math.hypot(x - w.ax - w.dx * t, z - w.az - w.dz * t) >= CLEAR) continue;
      const base = w.base !== undefined ? w.base : w.bed.h ? w.bed.y + w.bed.h(x, z) : w.bed.y;
      if (y < base + w.high && y >= base - 0.3) { free = false; break; } // (a kerb of another level is not in the way of this one)
    }
    for (const m of H.bumpers) if (Math.hypot(x - m[0], z - m[1]) < m[2] + CLEAR) free = false;
    if (wet(H, x, z, CLEAR)) free = false;
    for (const k of H.blocks) if (x > Math.min(k[0], k[2]) && x < Math.max(k[0], k[2]) && z > Math.min(k[1], k[3]) && z < Math.max(k[1], k[3])) free = false;
    if (free) ok[j * nx + i] = 1;
  }
  const M = (H.map = { H, i0, j0, nx, nz, ok, dist, next, leap, ht });
  const node = (x, z) => nearest(M, x, z);
  // from the cup outwards (the links are taken backwards: they lead to the cup, not from it)
  const from = new Map();
  for (const [ax, az, bx, bz, cost] of [...H.links, ...H.pipes.map((q) => [...q.in, ...q.out, 0.6])]) { const a = node(ax, az), b = node(bx, bz); if (a >= 0 && b >= 0) (from.get(b) || from.set(b, []).get(b)).push([a, cost]); }
  const heap = [], put = (d, n) => { heap.push([d, n]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const take = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let c = 2 * k + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++; if (heap[k][0] <= heap[c][0]) break; [heap[k], heap[c]] = [heap[c], heap[k]]; k = c; } } return top; };
  const c0 = node(H.cup[0], H.cup[1]);
  dist[c0] = Math.hypot((c0 % nx + i0) * CELL - H.cup[0], (Math.floor(c0 / nx) + j0) * CELL - H.cup[1]); put(dist[c0], c0);
  while (heap.length) {
    const [d, n] = take();
    if (d > dist[n]) continue;
    const i = n % nx, j = (n - i) / nx;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const m = b * nx + a; if (!ok[m] || ht[n] - ht[m] > CLIMB) continue; // (one comes down a drop, not up it)
      const nd = d + CELL * (di && dj ? Math.SQRT2 : 1);
      if (nd < dist[m]) { dist[m] = nd; next[m] = n; leap[m] = 0; put(nd, m); }
    }
    for (const [m, cost] of from.get(n) || []) if (d + cost < dist[m]) { dist[m] = d + cost; next[m] = n; leap[m] = 1; put(dist[m], m); }
  }
  return M;
}
/** Is there a cushion between (ax, az) and (bx, bz), for a ball on felt `y` high? */
function cut(H, ax, az, bx, bz, y) {
  const ex = bx - ax, ez = bz - az;
  for (const w of H.cushions) {
    if (Math.max(ax, bx) < w.x0 || Math.min(ax, bx) > w.x1 || Math.max(az, bz) < w.z0 || Math.min(az, bz) > w.z1) continue;
    const den = ex * w.dz - ez * w.dx; if (Math.abs(den) < 1e-12) continue;
    const t = ((w.ax - ax) * w.dz - (w.az - az) * w.dx) / den, u = ((w.ax - ax) * ez - (w.az - az) * ex) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) continue;
    const px = w.ax + w.dx * u, pz = w.az + w.dz * u, base = w.base !== undefined ? w.base : w.bed.h ? w.bed.y + w.bed.h(px, pz) : w.bed.y;
    if (y < base + w.high && y >= base - 0.3) return true;
  }
  return false;
}
/** The place of the grid nearest to (x, z) that can be stood on — on the same side of every cushion (-1: none within three quarters of a metre). */
function nearest(M, x, z) {
  const ci = Math.round(x / CELL) - M.i0, cj = Math.round(z / CELL) - M.j0;
  for (let tries = 0; tries < 8; tries++) {
    let best = -1, least = Infinity;
    for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
      const i = ci + di, j = cj + dj, n = j * M.nx + i; if (i < 0 || j < 0 || i >= M.nx || j >= M.nz || !M.ok[n] || _ban.includes(n)) continue;
      const d = Math.hypot((i + M.i0) * CELL - x, (j + M.j0) * CELL - z) + (M.dist[n] === Infinity ? 0 : M.dist[n]);
      if (d < least) { least = d; best = n; }
    }
    if (best < 0 || !cut(M.H, x, z, (best % M.nx + M.i0) * CELL, (Math.floor(best / M.nx) + M.j0) * CELL, M.ht[best])) { _ban.length = 0; return best; }
    _ban.push(best);
  }
  _ban.length = 0;
  return -1;
}
const _ban = [];
/** How far the cup is from (x, z) by the felt, round the kerbs (m; 60: one cannot get there from here). */
export function farFrom(H, x, z) {
  const M = mapOf(H), n = nearest(M, x, z);
  if (n < 0 || M.dist[n] === Infinity) return 60;
  return M.dist[n] + Math.hypot((n % M.nx + M.i0) * CELL - x, (Math.floor(n / M.nx) + M.j0) * CELL - z);
}
/** Is the straight line from (ax, az) to (bx, bz) free for a ball: on felt all the way, clear of the cushions, of the button and of the water? */
function clearLine(H, ax, az, bx, bz) {
  const l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / 0.1));
  for (let k = 1; k <= n; k++) {
    const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
    if (!bedAt(H, x, z, 99)) return false;
    const y = _fy;
    for (const w of H.cushions) {
      if (x < w.x0 - R || x > w.x1 + R || z < w.z0 - R || z > w.z1 + R) continue;
      const t = clamp(((x - w.ax) * w.dx + (z - w.az) * w.dz) * w.il2, 0, 1); if (Math.hypot(x - w.ax - w.dx * t, z - w.az - w.dz * t) >= R * 0.9 || k >= n) continue;
      const base = w.base !== undefined ? w.base : w.bed.h ? w.bed.y + w.bed.h(x, z) : w.bed.y;
      if (y < base + w.high && y >= base - 0.3) return false;
    }
    for (const m of H.bumpers) if (Math.hypot(x - m[0], z - m[1]) < m[2] + R) return false;
    if (wet(H, x, z, R)) return false;
  }
  return true;
}
/** Where to aim from (x, z) to follow the way to the cup: the cup itself when the line to it is free, else the furthest place of the way one can see. */
export function wayFrom(H, x, z, out = [0, 0]) {
  const M = mapOf(H);
  out[0] = H.cup[0]; out[1] = H.cup[1];
  if (clearLine(H, x, z, out[0], out[1])) return out;
  let n = nearest(M, x, z), seen = false;
  for (let k = 0; k < 400 && n >= 0; k++) {
    const px = (n % M.nx + M.i0) * CELL, pz = (Math.floor(n / M.nx) + M.j0) * CELL;
    if (Math.hypot(px - x, pz - z) > 0.3) { if (clearLine(H, x, z, px, pz)) { out[0] = px; out[1] = pz; seen = true; } else if (seen) break; }
    if (M.leap[n]) { if (!seen || (out[0] === px && out[1] === pz)) { out[0] = px + (px - x) * 0.01; out[1] = pz + (pz - z) * 0.01; } break; } // (a jump: one aims at where it begins)
    n = M.next[n];
  }
  return out;
}
/** The aim (0 down the hole, turning right, rad) that follows the way to the cup from (x, z). */
export function aimFrom(H, x, z) { const w = wayFrom(H, x, z, _w); return Math.atan2(w[0] - x, -(w[1] - z)); }
const _w = [0, 0];

/**
 * How far along the aim a ball would be stopped: by the first cushion, the button or a foot of the mill, or by
 * the end of the felt or the edge of the water — within `far` metres. Returns that distance; `out`: where ([x, z]) and the way it would come
 * back ([dx, dz]; 0, 0 when nothing sends it back).
 */
export function sightLine(H, x, z, aim, far, out) {
  const dx = Math.sin(aim), dz = -Math.cos(aim);
  let best = far, nx = 0, nz = 0;
  for (const w of H.cushions) {
    // the line of the cushion, pushed out by the radius of the ball towards where the ball is
    const side = (x - w.ax) * w.nx + (z - w.az) * w.nz >= 0 ? 1 : -1, ox = w.ax + w.nx * R * side, oz = w.az + w.nz * R * side, den = dx * w.dz - dz * w.dx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((ox - x) * w.dz - (oz - z) * w.dx) / den, u = ((ox - x) * dz - (oz - z) * dx) / den;
    if (!(t > 1e-6 && t < best && u >= -0.02 && u <= 1.02)) continue;
    // (a kerb of another level — over the ball there, or under it — does not stop it)
    const hx = x + dx * Math.max(0, t - 0.06), hz = z + dz * Math.max(0, t - 0.06), fy = feltAt(H, hx, hz), base = w.base !== undefined ? w.base : w.bed.h ? w.bed.y + w.bed.h(hx, hz) : w.bed.y;
    if (fy > -Infinity && (fy >= base + w.high || fy < base - 0.3)) continue;
    best = t; nx = w.nx * side; nz = w.nz * side;
  }
  for (const m of H.bumpers) {
    const ex = m[0] - x, ez = m[1] - z, along = ex * dx + ez * dz, off2 = ex * ex + ez * ez - along * along, rr = (m[2] + R) * (m[2] + R);
    if (along <= 0 || off2 >= rr) continue;
    const t = along - Math.sqrt(rr - off2);
    if (t > 1e-6 && t < best) { best = t; nx = (x + dx * t - m[0]) / (m[2] + R); nz = (z + dz * t - m[1]) / (m[2] + R); }
  }
  // (the end of the felt, where no kerb stops the ball)
  for (let t = 0.1; t < best; t += 0.1) if (!bedAt(H, x + dx * t, z + dz * t, 99) || wet(H, x + dx * t, z + dz * t)) { best = t; nx = 0; nz = 0; break; }
  if (out) { out[0] = x + dx * best; out[1] = z + dz * best; const vn = dx * nx + dz * nz; out[2] = nx || nz ? dx - 2 * vn * nx : 0; out[3] = nx || nz ? dz - 2 * vn * nz : 0; }
  return best;
}

// ---- a round
/** The strength the gauge shows (0 … 1): up, then down, then up again. */
export const gaugeOf = (phase) => (phase < 1 ? phase : 2 - phase);
/** How fast the aim turns (rad/s, the stick pushed fully) once the stick has been held `held` seconds the same way. */
export const turnRate = (held) => Math.min(GOLF.turn[2], GOLF.turn[0] + GOLF.turn[1] * held);
/** The speed (m/s) a ball leaves with, at strength `p` (0 … 1) of a gauge whose most is `far` metres of level felt. */
export const speedOf = (p, far) => Math.sqrt(2 * F * (GOLF.reach[0] + (far - GOLF.reach[0]) * p));
/** The most of the gauge (m of level felt) for a ball `d` metres from the cup: near the cup the gauge is finer. */
export const reachFor = (d) => clamp(2.2 * d + 2.5, 5, GOLF.reach[1]);

/**
 * A round, on the first tee. `t0`: the second of the clock of the world when it begins (what moves is read
 * there). Its state: `hole` (0 … 8), `phase` ('tee': the ball is put down; 'aim'; 'roll'; 'lost': in the acid or
 * off the bed; 'holed'; 'picked': seven strokes, the ball is picked up), `ball`, `from` (where it was hit from),
 * `aim` (rad: 0 down the hole, turning right), `gauge` (its phase, 0 … 2), `far` (its most, m), `strokes` (hole
 * by hole), `total`, `clock` (s), and at the end `over`, `time` (s) and `score`.
 */
export function startRound(t0 = 0) {
  const st = { t0, clock: 0, acc: 0, steps: 0, hole: 0, phase: 'tee', wait: GOLF.wait.tee, strokes: new Array(HOLES.length).fill(0), holed: new Array(HOLES.length).fill(false), total: 0, ball: {}, from: [0, 0], aim: 0, held: 0, dir: 0, gauge: 0, since: 0, far: GOLF.reach[1], power: 0, want: false, over: false, time: 0, score: 0, lost: 0, clumsy: 0, skill: 0, bot: null };
  ballAt(HOLES[0], 0, 0, st.ball);
  return st;
}
/** The score of a round: strokes × 1000 + seconds (at most 999). */
export { scoreOf, formatScore }; // (written in score.js: the game reads them without the rest)
/** The line of the run: "hole 4 of 9 · par 3 · stroke 2 · 11 so far". */
export function lineOf(st) {
  if (st.over) return `${GOLF.name} · ${formatScore(st.score)}`;
  const H = HOLES[st.hole], n = st.strokes[st.hole];
  return `hole ${st.hole + 1} of ${HOLES.length} · par ${H.par} · stroke ${Math.min(GOLF.most, st.phase === 'aim' || st.phase === 'tee' ? n + 1 : Math.max(1, n))} · ${st.total} so far`;
}

function aimAgain(st) {
  const H = HOLES[st.hole], b = st.ball;
  st.phase = 'aim'; st.gauge = 0; st.since = 0; st.held = 0; st.dir = 0;
  // (on the tee the aim is the tee's own axis, straight down the lane: the line is the player's to find; further on it points along the way)
  st.aim = b.x === 0 && b.z === 0 ? 0 : aimFrom(H, b.x, b.z);
  st.far = reachFor(farFrom(H, b.x, b.z));
}
function nextHole(st, events) {
  st.hole++;
  if (st.hole >= HOLES.length) { st.hole = HOLES.length - 1; st.over = true; st.phase = 'over'; st.score = scoreOf(st.total, st.time); if (events) events.push({ type: 'over', score: st.score, strokes: st.total, time: st.time }); return; }
  teeOff(st, st.hole);
  if (events) events.push({ type: 'tee', hole: st.hole });
}
/** The ball of a round is put down on the tee of hole `n` (the rules do it from hole to hole; the pictures of the holes ask for one at will). */
export function teeOff(st, n) {
  st.hole = n; st.bot = null; st.lost = 0;
  ballAt(HOLES[n], 0, 0, st.ball);
  st.from[0] = 0; st.from[1] = 0; st.aim = 0;
  st.phase = 'tee'; st.wait = GOLF.wait.tee;
}
function pickUp(st, events) { st.phase = 'picked'; st.wait = GOLF.wait.picked; st.time = st.clock; if (events) events.push({ type: 'picked', hole: st.hole, strokes: st.strokes[st.hole] }); }

/**
 * Advances a round by `dt` seconds. `input`: { x (-1 … 1: turns the aim), y (-1 … 1: held back, it slows the
 * gauge), jump (true on the frame it is asked: hits) }. `events`: those of the ball, and { type: 'tee' (hole) |
 * 'hit' (power, speed) | 'rest' | 'lost' (what: 'acid' | 'water' | 'out', x, z, y) | 'back' | 'holed' (hole, strokes, par)
 * | 'picked' (hole) | 'over' (score, strokes, time) }.
 */
export function stepRound(st, dt, input, events) {
  if (input?.jump) st.want = true;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= STEP && !st.over) { st.acc -= STEP; sub(st, input, events); st.want = false; }
  return st;
}

function sub(st, input, events) {
  const H = HOLES[st.hole], b = st.ball;
  st.clock += STEP; st.steps++;
  if (st.phase === 'aim') {
    const x = clamp(input?.x || 0, -1, 1), dir = x > 0.02 ? 1 : x < -0.02 ? -1 : 0;
    if (dir && dir === st.dir) st.held += STEP; else { st.held = dir ? STEP : 0; st.dir = dir; }
    st.aim += x * turnRate(st.held) * STEP;
    st.gauge += (STEP / GOLF.sweep) * (1 - (1 - GOLF.slow) * clamp(-(input?.y || 0), 0, 1));
    if (st.gauge >= 2) st.gauge -= 2;
    st.since += STEP;
    if (st.want && st.since >= 0.25) {
      const p = gaugeOf(st.gauge), v = speedOf(p, st.far);
      st.power = p; st.from[0] = b.x; st.from[1] = b.z;
      b.vx = Math.sin(st.aim) * v; b.vz = -Math.cos(st.aim) * v; b.vy = 0; b.lip = false;
      st.strokes[st.hole]++; st.total++; st.phase = 'roll';
      if (events) events.push({ type: 'hit', power: p, speed: v });
    }
  } else if (st.phase === 'roll') {
    const code = ballStep(H, b, st.t0 + st.clock, events);
    if (code === RESTS) { if (events) events.push({ type: 'rest' }); if (st.strokes[st.hole] >= GOLF.most) pickUp(st, events); else aimAgain(st); }
    else if (code === HOLED) { st.phase = 'holed'; st.wait = GOLF.wait.holed; st.holed[st.hole] = true; st.time = st.clock; if (events) events.push({ type: 'holed', hole: st.hole, strokes: st.strokes[st.hole], par: H.par }); }
    else if (code === ACID || code === OUT || code === WATER) {
      // lost: one stroke more (never more than seven), and back where it was hit from
      if (st.strokes[st.hole] < GOLF.most) { st.strokes[st.hole]++; st.total++; }
      st.phase = 'lost'; st.wait = GOLF.wait.lost; st.lost++;
      if (events) events.push({ type: 'lost', what: code === ACID ? 'acid' : code === WATER ? 'water' : 'out', x: b.x, z: b.z, y: b.y });
    }
  } else if (st.phase === 'tee') {
    st.wait -= STEP;
    if (st.wait <= 0) aimAgain(st);
  } else if (st.phase === 'lost') {
    st.wait -= STEP;
    if (st.wait <= 0) { ballAt(H, st.from[0], st.from[1], b); if (events) events.push({ type: 'back' }); if (st.strokes[st.hole] >= GOLF.most) pickUp(st, events); else aimAgain(st); }
  } else if (st.phase === 'holed' || st.phase === 'picked') {
    st.wait -= STEP;
    if (st.wait <= 0) nextHole(st, events);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Players that play by themselves. All three do what one does with one's eyes: they play the putt forward with
// the rules above, for every aim round the way to the cup and every strength the gauge will show in the coming
// swing — and, where something moves, for the very moment of the hit. Then they turn the aim there and wait for
// the gauge.
//  - The perfect one (`st.skill` 0) keeps the putt that ends in the cup, or nearest to it by the felt, makes it
//    finer, and hits it exactly. It is the proof that every hole can be finished, and finds the fewest strokes
//    there can be: bank shots no person would try, holed. It is not what a round is worth.
//  - The one with a person's hand (`st.skill` 1; `st.clumsy`: its seed) knows its hand is not sure: of the best
//    few putts it keeps the one that still ends well a little to either side and a little softer or firmer — the
//    long safe way rather than the short one over the water, unless that one forgives. And then its hand is a
//    person's: the aim a degree or two off, the strength five hundredths of the gauge or so — a finger a
//    twentieth of a second early or late (drawn from the seed and the stroke). Who has lost a ball on a hole
//    plays the next ones there with more room to spare.
//  - The clumsy one (`st.skill` 2) looks less closely, and its hand is worse: some four degrees, some nine hundredths.
/** The hand of each: how far apart the aims it tries (degrees) and how many to either side, how many of the best it weighs, and how unsure its aim (rad) and its strength (a share of it) are. */
export const HANDS = [null, { fan: 4, span: 22, top: 8, aim: 0.03, power: 0.05 }, { fan: 6, span: 15, top: 6, aim: 0.065, power: 0.09 }];
/** A draw from a bell curve (mean 0, spread 1, never beyond 2.5), from a seed. */
const bell = (n, k) => clamp(Math.sqrt(-2 * Math.log(Math.max(1e-9, hash(n, k)))) * Math.cos(TAU * hash(n, k + 17)), -2.5, 2.5);

const THINK = 40, EVERY = 6, SWING = Math.round((2 * GOLF.sweep) / STEP), LIMIT = 2400;
const _b = {};
/** Plays a putt forward: the ball of the round hit along `aim` at the k-th step from now. Returns what it is worth; `B.end`: how it ended. */
function tryPutt(st, B, aim, k) {
  const H = HOLES[st.hole], b = Object.assign(_b, st.ball), v = speedOf(gaugeOf(B.gauge[k]), st.far);
  b.vx = Math.sin(aim) * v; b.vz = -Math.cos(aim) * v; b.vy = 0; b.lip = false;
  let c = B.clock[k], code = ROLLS, n = 0;
  for (; n < LIMIT; n++) { c += STEP; code = ballStep(H, b, st.t0 + c, null); if (code !== ROLLS) break; }
  B.sims++;
  B.end = code;
  if (code === HOLED) return (B.safe ? 3 : 1000) - k * 0.01 - n * 0.001;
  if (code === ACID || code === OUT || code === WATER) return -B.here - 7 * (B.care || 1);
  return -farFrom(H, b.x, b.z) - k * 0.002;
}
/** How many steps it takes to turn the aim by `a` radians. */
function turnSteps(a) {
  const [t0, t1, most] = GOLF.turn, tm = (most - t0) / t1, am = t0 * tm + 0.5 * t1 * tm * tm;
  return Math.ceil((a <= am ? (-t0 + Math.sqrt(t0 * t0 + 2 * t1 * a)) / t1 : tm + (a - am) / most) / STEP) + 3;
}

/** The search, a putt at a time (it is taken up again step after step: the bot thinks while the gauge swings). */
function* search(st, B) {
  const H = HOLES[st.hole], way = aimFrom(H, st.ball.x, st.ball.z), tries = [];
  // the gauge and the clock, step by step, as the round will count them
  let g = st.gauge, c = st.clock;
  B.gauge = [g]; B.clock = [c];
  for (let k = 1; k <= THINK + SWING + 80; k++) { g += STEP / GOLF.sweep; if (g >= 2) g -= 2; c += STEP; B.gauge.push(g); B.clock.push(c); }
  // when to hit: every few steps of a whole swing of the gauge (where nothing moves, each strength once is enough)
  const whens = [], seen = new Set();
  for (let k = THINK + 6; k < THINK + 6 + SWING; k += B.hand ? EVERY * 2 : EVERY) { if (!H.movers.length) { const p = Math.round(gaugeOf(B.gauge[k]) * 26); if (seen.has(p)) continue; seen.add(p); } whens.push(k); }
  const fits = (a, k) => k >= THINK + turnSteps(Math.abs(a - st.aim)) + 1 && k < B.gauge.length - 1;
  const K = B.hand, span = K ? K.span : 24, fan = K ? K.fan : 4, per = SWING / 2; // (steps of the gauge from nothing to full)
  let found = null;
  scan: for (const k of whens) {
    for (let j = 0; j <= span * 2; j++) {
      const a = way + (((j + 1) >> 1) * (j % 2 ? 1 : -1) * fan * Math.PI) / 180;
      if (!fits(a, k)) continue;
      const v = tryPutt(st, B, a, k);
      tries.push({ a, k, v });
      yield;
      if (!B.safe && B.end === HOLED) { found = { a, k, v }; break scan; }
    }
  }
  tries.sort((p, q) => q.v - p.v);
  if (!found && B.safe) {
    // a hand that is not sure: of the best few, the one that still ends well a little to either side and a little softer or firmer
    const top = [];
    for (const t of tries) { if (top.length >= K.top) break; if (top.every((o) => Math.abs(o.a - t.a) > 0.06 || Math.abs(o.k - t.k) > 8)) top.push(t); }
    for (const t of top) {
      const da = K.aim * B.care, dk = Math.max(2, Math.round(K.power * per * B.care));
      let sum = t.v * 2, n = 2;
      for (const [qa, qk] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1.8, 0], [-1.8, 0], [0, 1.8], [0, -1.8], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { const a = t.a + qa * da, k = t.k + Math.round(qk * dk); if (!fits(a, k)) continue; sum += tryPutt(st, B, a, k); n++; yield; }
      t.w = sum / n;
      if (!found || t.w > found.w) found = t;
    }
  } else if (!found) {
    // the best few, made finer: a little to either side, a little earlier or later, by smaller and smaller steps
    const top = [];
    for (const t of tries) { if (top.length >= 4) break; if (top.every((o) => Math.abs(o.a - t.a) > 0.1 || Math.abs(o.k - t.k) > 12)) top.push({ ...t }); }
    fine: for (const t of top) {
      for (const [da, dk] of [[2, 3], [1, 2], [0.5, 1], [0.25, 1], [0.12, 1], [0.06, 1]]) {
        for (let again = 0; again < 2; again++) {
          let better = false;
          for (const [sa, sk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const a = t.a + (sa * da * Math.PI) / 180, k = t.k + sk * dk;
            if (!fits(a, k)) continue;
            const v = tryPutt(st, B, a, k);
            yield;
            if (v > t.v) { t.a = a; t.k = k; t.v = v; better = true; if (B.end === HOLED) { found = t; break fine; } }
          }
          if (!better) break;
        }
      }
      if (!found || t.v > found.v) found = t;
      if (found.v > 900) break;
    }
  }
  found ||= { a: way, k: THINK + 40, v: 0 };
  if (B.safe) {
    // … and then the hand: the aim a little off, the strength a little more or less than meant
    const n = st.clumsy * 31 + st.total * 7 + st.hole * 131;
    found = { ...found };
    found.a += bell(n, 1) * K.aim;
    found.k = clamp(found.k + Math.round(bell(n, 2) * K.power * per), THINK + turnSteps(Math.abs(found.a - st.aim)) + 1, B.gauge.length - 2);
  }
  B.aim = found.a; B.at = B.from + found.k; B.worth = found.v;
}

/** The stick and the jump of the player that plays by itself, for the next step of the round. */
export function botInput(st, out = { x: 0, y: 0, jump: false }) {
  out.x = 0; out.y = 0; out.jump = false;
  if (st.over || st.phase !== 'aim') { st.bot = null; return out; }
  let B = st.bot;
  if (!B || B.stroke !== st.total || B.hole !== st.hole) {
    const H = HOLES[st.hole];
    const hand = st.clumsy ? HANDS[st.skill || 2] : null;
    B = st.bot = { stroke: st.total, hole: st.hole, from: st.steps, safe: !!hand, hand, care: 1 + 0.5 * Math.min(4, st.lost), sims: 0, here: farFrom(H, st.ball.x, st.ball.z), aim: st.aim, at: Infinity, run: null, left: THINK };
    B.run = search(st, B);
    // (so many putts tried at each step that the search is over when the thinking is)
    B.each = Math.ceil(((H.movers.length ? SWING / EVERY : 27) * (hand ? hand.span * 2 + 1 : 49) + 400) / (THINK - 2));
  }
  if (B.run) {
    for (let n = 0; n < B.each; n++) if (B.run.next().done) { B.run = null; break; }
    B.left--;
    if (B.run && B.left <= 0) { while (!B.run.next().done); B.run = null; }
    return out;
  }
  const d = B.aim - st.aim;
  if (Math.abs(d) > 1e-12) {
    // the stick, just so far that the aim gets there
    const dir = d > 0 ? 1 : -1, held = dir === st.dir ? st.held + STEP : STEP;
    out.x = clamp(d / (turnRate(held) * STEP), -1, 1);
    if (Math.abs(out.x) <= 0.02) { out.x = 0; B.aim = st.aim; }
  }
  if (st.steps + 1 >= B.at && Math.abs(B.aim - st.aim - out.x * turnRate(out.x > 0 === st.dir > 0 && st.dir ? st.held + STEP : STEP) * STEP) < 1e-6) out.jump = true;
  return out;
}

/** Plays a round with a bot (`seed` 0: the perfect one; else `skill` 1: a person's hand, 2: a clumsy one, drawn from the seed). Returns its state. `limit`: seconds. */
export function botRound(t0 = 0, seed = 0, limit = 900, events = null, skill = 2) {
  const st = startRound(t0), input = { x: 0, y: 0, jump: false };
  st.clumsy = seed; st.skill = seed ? skill : 0;
  for (let n = 0; n < limit / STEP && !st.over; n++) { botInput(st, input); stepRound(st, STEP, input, events); }
  return st;
}

// (the nine holes are made ready once everything above is defined)
for (const [i, H] of HOLES.entries()) prepare(H, i);
