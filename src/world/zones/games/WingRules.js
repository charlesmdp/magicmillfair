// The rules of the flying theatre (Flappy Robot), and nothing else: no stage, no cloth, no sound. The page shows a
// flight (Wing.js); the server plays it again (server/replay.js) — both with this.
//
// A flight is stepped 120 times a second, always by the same amount: the same flaps at the same steps give the
// same flight, to the last digit, on any machine. What is written down of a flight is therefore very little:
// how many steps it lasted, and at which steps one flapped (see packFlight).
import { WING } from '../../layout/layout.js';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// the stage, in its own frame: x across (to the right of who looks at it), y up, z towards the audience
export const HALF = WING.width / 2, FLOOR = 0.7, TOP = FLOOR + WING.height, ROOF = TOP + 2.5, DEPTH = 3.5, WALL = 0.5;
export const PLANE = -1.05, FLYER = -2.4; // how deep one flies, and where across the stage
export const COLUMN = { r: 0.42, lip: 0.56, length: 3.0, apart: 5.2, from: HALF - 0.55, count: 3 };
export const GRAVITY = 15, FLAP = 5.5, BODY = 0.4, WAVES = FLOOR + 0.44, CEILING = TOP - 0.25; // (BODY: the ring round the flyer; WAVES: the line of foam)
/** How fast the scenery goes by, and how wide the gap is, after `n` pairs of columns. */
export const speedAt = (n) => Math.min(6.2, 3.6 + n * 0.075), gapAt = (n) => Math.max(1.8, 2.45 - n * 0.02);
/** Where the flyer waits before its first flap. */
export const START_Y = FLOOR + WING.height * 0.55;

export const TICK = 1 / 120;
/** What a step can bring (bits): the flight began, a flap, a pair of columns passed, the flyer hit something, it fell in the waves, the flight is over. */
export const BEGAN = 1, FLAPPED = 2, PASSED = 4, HIT = 8, SPLASH = 16, OVER = 32;

/**
 * A flight, from its seed. `pairs`: the three pairs of columns it moves ({ x, y, gap, passed } each — the
 * page gives those it shows; without them it makes its own). Returns { S (the state: y, vy, flying, fallen,
 * score, over, ticks, scrolled…), pairs, tick(flap) → what happened (bits above) }. Nothing moves before the
 * first flap: the first step is the one that takes off.
 */
export function flightOf(seed, pairs = [{}, {}, {}]) {
  const S = { y: START_Y, vy: 0, t: 0, flying: false, fallen: 0, hit: 0, beat: 0, score: 0, over: false, ticks: 0, scrolled: 0, seed: seed | 0 };
  // (the gaps: never two far apart in height one after the other — what can be flown, however fast it goes)
  let lastY = S.y;
  const rnd = () => { S.seed = (S.seed * 1664525 + 1013904223) | 0; return (S.seed >>> 8) / 16777216; };
  const next = () => {
    const gap = gapAt(S.score + 2), lo = WAVES + 0.41 + gap / 2, hi = CEILING - 0.3 - gap / 2;
    lastY = clamp(lastY + (rnd() * 2 - 1) * 1.9, lo, hi);
    return { y: lastY, gap };
  };
  // the stage is cleared: the first pair comes in from the right after a moment
  pairs.forEach((p, k) => Object.assign(p, next(), { x: COLUMN.from + 3.5 + k * COLUMN.apart, passed: false }));
  const tick = (flap) => {
    if (S.over) return 0;
    let ev = 0;
    S.ticks++;
    S.t += TICK;
    S.beat = Math.max(0, S.beat - TICK * 3.2);
    if (S.fallen) {
      // the fall: straight down into the waves, and the flight is over
      S.vy -= GRAVITY * 1.5 * TICK; S.y += S.vy * TICK;
      if (S.y < WAVES - 0.5) { if (S.fallen === 1) { S.fallen = 2; ev |= SPLASH; } if (S.t - S.hit > 0.9) { S.over = true; ev |= OVER; } S.y = Math.max(S.y, FLOOR - 0.6); }
      return ev;
    }
    if (flap) { if (!S.flying) { S.flying = true; ev |= BEGAN; } S.vy = FLAP; S.beat = 1; ev |= FLAPPED; }
    if (!S.flying) return ev;
    S.vy -= GRAVITY * TICK; S.y += S.vy * TICK;
    if (S.y > CEILING - BODY) { S.y = CEILING - BODY; S.vy = Math.min(S.vy, 0); } // (the pelmet: one bumps one's head, no more)
    // the scenery goes by; a pair that leaves on the left comes back on the right, with the next gap
    const d = speedAt(S.score) * TICK;
    S.scrolled += d;
    let last = -Infinity;
    for (const p of pairs) last = Math.max(last, p.x);
    for (const p of pairs) {
      p.x -= d;
      if (p.x < -COLUMN.from) { p.x = Math.max(COLUMN.from, last - d + COLUMN.apart); last = p.x + d; Object.assign(p, next(), { passed: false }); }
    }
    let hit = S.y - BODY < WAVES;
    for (const p of pairs) {
      const dx = p.x - FLYER;
      if (Math.abs(dx) < COLUMN.lip + BODY * 0.9 && (S.y - BODY < p.y - p.gap / 2 || S.y + BODY > p.y + p.gap / 2)) hit = true;
      if (!p.passed && dx < -COLUMN.lip) { p.passed = true; S.score++; ev |= PASSED; }
    }
    if (hit) { S.fallen = 1; S.hit = S.t; S.vy = Math.max(S.vy, 2.5); ev |= HIT; }
    return ev;
  };
  return { S, pairs, tick };
}

/**
 * What is written down of a flight: 16-bit words — how many steps it lasted (two words, low first), then, for
 * each flap, how many steps after the one before (0xffff: no flap for that long yet, go on counting).
 */
export function flightLog() {
  const words = [0, 0];
  let since = 0, ticks = 0;
  return {
    /** a step is about to be taken (`flap`: with a flap) */
    step(flap) {
      ticks++;
      if (flap) { while (since >= 0xffff) { words.push(0xffff); since -= 0xffff; } words.push(since); since = 0; }
      since++;
    },
    words() { words[0] = ticks & 0xffff; words[1] = (ticks >>> 16) & 0xffff; return words; },
  };
}

/** A flight played again from its seed and its log: { score, over, steps, seconds }. */
export function replayFlight(seed, words) {
  const flight = flightOf(seed), total = Math.min((words[0] | (words[1] << 16)) >>> 0, 120 * 3600);
  let at = 0, k = 2, wait = 0;
  // (the step at which the next flap falls: the words say how long after the one before)
  const nextFlap = () => { let w = 0; while (k < words.length && words[k] === 0xffff) { w += 0xffff; k++; } if (k >= words.length) return Infinity; w += words[k++]; return w; };
  let due = nextFlap();
  for (; at < total && !flight.S.over; at++) {
    const flap = wait === due;
    flight.tick(flap);
    if (flap) { wait = 0; due = nextFlap(); }
    wait++;
  }
  return { score: flight.S.score, over: flight.S.over, steps: at, seconds: at * TICK };
}
