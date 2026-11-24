// The rules of Meltdown Run, the game of the arcade cabinet — and nothing else: no screen, no sound. The page
// shows a run (Arcade.js); the server plays it again (server/replay.js) — both with this.
//
// A run is stepped 120 times a second, always by the same amount: the same keys at the same steps give the same
// run on any machine. What is written down of a run is how long each state of the two keys lasted (packed as
// 16-bit words: [steps, keys] again and again — keys: 1 jump, 2 duck).
import { rngOf } from '../world/zones/games/core.js';

export const W = 480, GROUND = 214, TICK = 1 / 120;
/** What a step can bring (bits): a jump, a landing, an isotope picked up, the crash, five hundred metres more. */
export const JUMPED = 1, LANDED = 2, COIN = 4, CRASHED = 8, CHECKPOINT = 16;
// what comes down the road: [width, height, how high its foot is above the ground]
const KINDS = { drum: [18, 24, 0], stack: [38, 24, 0], tall: [20, 42, 0], pool: [44, 5, 0], drone: [34, 13, 23], high: [34, 13, 58], iso: [10, 10, 52] };

/**
 * A run, from its seed (none: the device's own dice). Returns { s (the state: t, x, speed, y, air, duck,
 * things, score, over, ticks…), tick(keys) → what happened (bits above) }.
 */
export function runOf(seed) {
  const R = Number.isInteger(seed) ? rngOf(seed) : Math.random, rnd = (a, b) => a + R() * (b - a);
  // (`held`: the jump that started the run does not count as a jump)
  const s = { t: 0, x: 0, speed: 190, y: 0, vy: 0, air: false, duck: false, over: false, things: [], next: 420, score: 0, bonus: 0, want: 0, held: true, ticks: 0 };
  const spawn = () => {
    const p = Math.min(1, s.t / 60), r = R();
    const kind = s.t < 6 ? 'drum' : r < 0.26 ? 'drum' : r < 0.42 ? 'stack' : r < 0.55 - 0.05 * p ? 'pool' : r < 0.78 ? 'drone' : r < 0.86 ? 'high' : 'tall';
    const [w, h, up] = KINDS[kind];
    s.things.push({ kind, x: s.x + W + 20, w, h, up, ph: rnd(0, 6) });
    // (an isotope now and then: over a drum for the taking, or in the open)
    if (R() < 0.3) s.things.push({ kind: 'iso', x: s.x + W + 20 + (kind === 'drum' || kind === 'pool' ? w / 2 - 5 : rnd(90, 150)), w: 10, h: 10, up: kind === 'drum' || kind === 'pool' ? 62 : rnd(8, 58), ph: 0 });
    s.next = s.x + W + 20 + s.speed * rnd(0.72, 1.3) + w;
  };
  const tick = (keys) => {
    if (s.over) return 0;
    const dt = TICK, jump = (keys & 1) !== 0, duck = (keys & 2) !== 0;
    let ev = 0;
    s.ticks++;
    s.t += dt;
    s.speed = Math.min(520, 190 + s.t * 5.5);
    s.x += s.speed * dt;
    // jumping (held: higher; asked for a moment before landing: given on landing), ducking (in the air: down faster)
    if (jump && !s.held) s.want = 0.13;
    if (s.want > 0) { if (s.air) s.want -= dt; else { s.want = 0; s.air = true; s.vy = 400; ev |= JUMPED; } }
    s.held = jump;
    s.duck = duck;
    if (s.air) {
      s.vy -= (s.vy > 0 && jump ? 880 : 1500) * dt + (duck ? 1400 * dt : 0);
      s.y += s.vy * dt;
      if (s.y <= 0) { s.y = 0; s.air = false; ev |= LANDED; }
    }
    if (s.x + W + 20 >= s.next) spawn();
    if (s.things.length && s.things[0].x - s.x <= -80) s.things = s.things.filter((o) => o.x - s.x > -80);
    // what the robot runs into, what it picks up
    const low = duck && !s.air, bx0 = s.x + 66, bx1 = s.x + 84, by0 = s.y + 2, by1 = s.y + (low ? 18 : 32);
    for (const o of s.things) {
      if (o.gone) continue;
      const ox0 = o.x + 2, ox1 = o.x + o.w - 2, oy0 = o.up + 1, oy1 = o.up + o.h - 1;
      if (bx1 < ox0 || bx0 > ox1 || by1 < oy0 || by0 > oy1) continue;
      if (o.kind === 'iso') { o.gone = true; s.bonus += 25; ev |= COIN; continue; }
      s.over = true;
      ev |= CRASHED;
      break;
    }
    const was = s.score;
    s.score = Math.floor(s.x / 10) + s.bonus;
    if (Math.floor(s.score / 500) > Math.floor(was / 500)) ev |= CHECKPOINT;
    return ev;
  };
  return { s, tick };
}

/** What is written down of a run: [steps, keys] for each stretch during which the two keys did not change. */
export function runLog() {
  const words = [];
  let keys = 0, count = 0;
  return {
    step(now) { if (now === keys && count < 0xffff) count++; else { if (count) words.push(count, keys); keys = now; count = 1; } },
    words() { return count ? [...words, count, keys] : [...words]; },
  };
}

/** A run played again from its seed and its log: { score, over, steps, seconds }. */
export function replayRun(seed, words) {
  const run = runOf(seed);
  let n = 0;
  for (let i = 0; i + 1 < words.length && !run.s.over && n < 120 * 3600; i += 2) for (let k = 0; k < words[i] && !run.s.over; k++, n++) run.tick(words[i + 1] & 3);
  return { score: run.s.score, over: run.s.over, steps: n, seconds: n * TICK };
}
