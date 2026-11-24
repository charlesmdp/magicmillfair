// What the games of the booths are made of that owes nothing to the 3D library, nor to a browser: numbers,
// the frame of a booth, a ray against a plane, a generator of random numbers that starts from a seed — and the
// clock of a session (how a game is stepped, what a step is given). The server replays a game with exactly
// this (server/replay.js): the rules of a game are the same code wherever they run.
//
// Two things a game needs do come from its host: vectors and geometries. The page gives the real ones
// (kit.js); the server gives ones that do nothing — it only wants the score.

export const host = {
  /** (x, y, z) → a vector */
  V: null,
  /** (fill, material) → a geometry built in one go */
  geometry: null,
  /** true where somebody is looking: what is only there to be seen can be skipped where nobody is */
  shown: true,
};

// ------------------------------------------------------------------------------------------- the same digits everywhere
//
// A sine, an exponential, a power: the language lets a browser give the last digit as it likes, and two of them
// do not always agree. The rules of the games use these instead — made of + − × ÷ and square roots only, which
// are the same on every machine — so that a game played again elsewhere goes exactly the same way.
// (Accurate to the fifteenth digit or so; x in radians, as far as thousands of turns.)
const PIO2_HI = 1.5707963267341256, PIO2_LO = 6.077100506506192e-11, TWO_OVER_PI = 0.6366197723675814;
const sinK = (r) => { const z = r * r; return r + r * z * (-1.66666666666666324348e-01 + z * (8.33333333332248946124e-03 + z * (-1.98412698298579493134e-04 + z * (2.75573137070700676789e-06 + z * (-2.50507602534068634195e-08 + z * 1.58969099521155010221e-10))))); };
const cosK = (r) => { const z = r * r; return 1 - 0.5 * z + z * z * (4.16666666666666019037e-02 + z * (-1.38888888888741095749e-03 + z * (2.48015872894767294178e-05 + z * (-2.75573143513906633035e-07 + z * (2.08757232129817482790e-09 + z * -1.13596475577881948265e-11))))); };
// (x = k quarter turns + r, r within an eighth of a turn of zero: the sine or the cosine of r, with its sign)
const turned = (x, shift) => {
  const k = Math.round(x * TWO_OVER_PI), r = (x - k * PIO2_HI) - k * PIO2_LO, q = (((k + shift) % 4) + 4) % 4;
  return q === 0 ? sinK(r) : q === 1 ? cosK(r) : q === 2 ? -sinK(r) : -cosK(r);
};
export const sin = (x) => turned(x, 0), cos = (x) => turned(x, 1);
const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INV_LN2 = 1.44269504088896338700;
export const exp = (x) => {
  if (!(x > -700)) return x < 0 ? 0 : x; // (so small it is nothing — or not a number at all)
  if (x > 700) return Infinity;
  // x = k × ln 2 + r: the series of e^r (r is small: thirteen terms give every digit), then × 2^k
  const k = Math.round(x * INV_LN2), r = (x - k * LN2_HI) - k * LN2_LO;
  let term = 1, sum = 1;
  for (let n = 1; n <= 13; n++) { term *= r / n; sum += term; }
  for (let i = Math.abs(k), two = k < 0 ? 0.5 : 2; i > 0; i--) sum *= two;
  return sum;
};
export const hypot = (a, b, c = 0) => Math.sqrt(a * a + b * b + c * c);
/** A list shuffled in place with the dice `roll` — the same shuffle wherever it runs (a sort by chance is not: browsers sort differently). */
export const shuffle = (list, roll) => { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(roll() * (i + 1)), was = list[i]; list[i] = list[j]; list[j] = was; } return list; };

export const V = (x, y, z) => host.V(x, y, z);
export const geometry = (fill, material = 'paint') => host.geometry(fill, material);
export const lerp = (a, b, t) => a + (b - a) * t, clamp01 = (t) => Math.min(1, Math.max(0, t));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** A booth in its own frame: half its width, its back wall, the front of its counter (one plays from z = FRONT + 1). */
export const HALF = 3, BACK = -4, FRONT = 1.0;
export const WHITE = [0.97, 0.95, 0.9], WOOD = [0.9, 0.8, 0.66], GOLD = [1.5, 1.05, 0.25];

/** A disc facing +Z, of radius 1, in rings of colour (from the rim to the middle). */
export function disc(b, rings, sides = 14) {
  rings.forEach(([r, c], k) => {
    const pts = [];
    for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2; pts.push(V(cos(a) * r, sin(a) * r, k * 0.012)); }
    b.tint(c[0], c[1], c[2], 1).poly(pts);
  });
}

/** Where the pointer's ray (`aim`: { o, d }, in the frame of the booth) meets the plane z = `z`: [x, y], or null. */
export const hitZ = (aim, z) => { if (Math.abs(aim.d.z) < 1e-5) return null; const u = (z - aim.o.z) / aim.d.z; return u > 0 ? [aim.o.x + aim.d.x * u, aim.o.y + aim.d.y * u] : null; };
/** …and the plane y = `y`: [x, z], or null. */
export const hitY = (aim, y) => { if (Math.abs(aim.d.y) < 1e-5) return null; const u = (y - aim.o.y) / aim.d.y; return u > 0 ? [aim.o.x + aim.d.x * u, aim.o.z + aim.d.z * u] : null; };

/** Random numbers in [0, 1) that are always the same for the same seed (a whole number). */
export function rngOf(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** The generator a game draws from: seeded when the game is played for a score, the device's own otherwise. */
export const dice = (seed) => (Number.isInteger(seed) ? rngOf(seed) : Math.random);

// ------------------------------------------------------------------------------------------- a session, step by step
//
// A game at a booth is stepped with what the pointer does: where it aims (a direction, in the frame of the
// booth, from where the game is watched) and whether it is pressed. So that the server can play the very same
// game again, every step is written down as it is taken — and taken with what was written, not with what was
// measured: a step lasts a whole number of tenths of a millisecond, a direction is three whole numbers. A game
// is stepped 75 times a second at the most (a faster screen shows the same step twice).
//
//   a log: [dt, dx, dy, dz, flags] × n, as 16-bit numbers — dt in 0.1 ms; d × 32767; flags: clicks (0-7) |
//   pressed (8) | aiming (16). In text: base64 of those bytes (see packLog).

export const STEP_MIN = 1 / 75, STEP_MAX = 0.1, WORDS = 5, DIR = 32767;
/**
 * How long a game waits for the seed the server is drawing before it begins with the device's own dice (ms):
 * long enough for a slow device on a slow line — a game that began without its seed cannot be played again by
 * the server — and nothing at all when the device knows it is off line.
 */
export const seedWait = () => (typeof navigator !== 'undefined' && navigator.onLine === false ? 0 : 8000);
// (where nobody listens — a replay — the sounds and the words of a game go nowhere)
const QUIET = { play() {}, note() {}, strike() {} };

/**
 * The clock of a game played at a booth: `def` is the booth ({ id, name, seconds: 0 for a game that ends by
 * itself }), `game` what its factory returned, `seed` what the server drew. Returns the session:
 * { t, over, score, gauge, line, tick(dt, d, clicks, down, io): one step as it is given, words: the log so far }.
 * The three seconds before a game with a clock are steps like the others (the game idles through them).
 */
export function sessionOf(def, game, seed) {
  game.reset(seed);
  const o = { x: game.view.pos[0], y: game.view.pos[1], z: game.view.pos[2] }, d = { x: 0, y: 0, z: -1 }, aim = { o, d, clicks: 0, down: false };
  const s = { t: def.seconds ? -3 : 0, clock: 0, over: false, score: 0, gauge: null, line: '', words: [] };
  /** One step: `q` its five words (see above) — taken as written. */
  s.take = (q0, q1, q2, q3, q4, heard) => {
    if (s.over) return;
    const io = heard || QUIET;
    const dt = q0 / 10000, was = s.t;
    s.t += dt; s.clock += dt;
    if (def.seconds && s.t < 0) {
      if (Math.ceil(-s.t) !== Math.ceil(-was) || was === -3) io.play('tick');
      s.line = `${def.name} · ${Math.ceil(-s.t)}…`;
      game.step(dt, -1, s.clock, null, io);
      return;
    }
    if (was < 0) { s.t = 0; io.play('start'); }
    d.x = q1 / DIR; d.y = q2 / DIR; d.z = q3 / DIR;
    aim.clicks = q4 & 7; aim.down = (q4 & 8) !== 0;
    game.step(dt, s.t, s.clock, q4 & 16 ? aim : null, io);
    s.score = game.score;
    s.gauge = game.gauge ?? null;
    if (def.seconds) {
      const left = Math.max(0, def.seconds - s.t);
      s.line = `${def.name} · ${game.score} pts · ${Math.ceil(left)} s`;
      if (left <= 5 && Math.ceil(left) !== Math.ceil(def.seconds - was) && left > 0) io.play('tick', { volume: 0.6 });
      if (left <= 0) s.over = true;
    } else {
      s.line = `${def.name} · ${game.line ? game.line() : `best ${game.score} · ${game.left} blow${game.left === 1 ? '' : 's'} left`}`;
      if (game.over) s.over = true;
    }
  };
  /** A step of `dt` seconds with the pointer aiming along (dx, dy, dz) — or nowhere (`aiming` false): written down, then taken. */
  s.tick = (dt, dx, dy, dz, clicks, down, aiming, io) => {
    const q0 = Math.max(1, Math.min(Math.round(STEP_MAX * 10000), Math.round(dt * 10000)));
    const q1 = Math.round(clamp(dx, -1, 1) * DIR), q2 = Math.round(clamp(dy, -1, 1) * DIR), q3 = Math.round(clamp(dz, -1, 1) * DIR);
    const q4 = Math.min(7, Math.max(0, clicks | 0)) | (down ? 8 : 0) | (aiming ? 16 : 0);
    if (s.words.length < WORDS * 60000) s.words.push(q0, q1 & 0xffff, q2 & 0xffff, q3 & 0xffff, q4);
    s.take(q0, q1, q2, q3, q4, io);
  };
  return s;
}

const signed = (w) => (w > 32767 ? w - 65536 : w);
/** A game played again from its log (16-bit words, see above): the score it ends with, whether it ended, how many steps it took. */
export function replaySession(def, game, seed, words) {
  const s = sessionOf(def, game, seed);
  let n = 0;
  for (let i = 0; i + WORDS <= words.length && !s.over; i += WORDS, n++) s.take(words[i], signed(words[i + 1]), signed(words[i + 2]), signed(words[i + 3]), words[i + 4], null);
  return { score: s.score, over: s.over, steps: n, seconds: s.clock };
}

/** A log as text (base64 of its 16-bit words, low byte first), and back; null when the text is not one. */
export function packLog(words) {
  const bytes = new Uint8Array(words.length * 2);
  for (let i = 0; i < words.length; i++) { bytes[i * 2] = words[i] & 255; bytes[i * 2 + 1] = (words[i] >> 8) & 255; }
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
export function unpackLog(text, most = 400_000) {
  if (typeof text !== 'string' || text.length > most || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null;
  let raw;
  try { raw = atob(text); } catch { return null; }
  if (raw.length % 2) return null;
  const words = new Array(raw.length / 2);
  for (let i = 0; i < words.length; i++) words[i] = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8);
  return words;
}
