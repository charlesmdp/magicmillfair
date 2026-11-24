// The referee: a game played again by the server from what the page wrote down — the seed the server drew when
// the run started, and what the player did: every step the pointer took at a booth (src/world/zones/games/
// core.js), when one flapped in the flying theatre (WingRules.js), which keys were down at the arcade cabinet
// (src/ui/ArcadeRules.js). The rules are the very code the page runs; what a page shows (meshes, sounds) is
// replaced here by things that do nothing.
//
//   replayable(board)               is that a game the server can play again?
//   replay(board, seed, logText)    → { score, over, steps, seconds } or null (not a log, not such a game)
//   agrees(board, claimed, played)  does the game end, and with the score that was claimed?
//
// A score is only replayed when it would enter the first five of one of its lists (routes.js): replaying costs a
// few milliseconds of processor, and most scores change nothing on a board.
//
// What a replay proves: that this score comes out of a game really played with that seed, to its end — the
// targets were where the seed put them, the clicks landed on them. It does not prove a person played: a program
// that plays well still plays. The rules are written to give the same digits on every machine (their own sine,
// their own dice, steps of a written length): the score is asked for exactly.
import { host, replaySession, unpackLog } from '../src/world/zones/games/core.js';
import { STALLS, STALL_GAMES } from '../src/world/zones/games/Stalls.js';
import { PIER_BOOTHS, PIER_GAMES } from '../src/world/zones/games/PierGames.js';
import { replayFlight } from '../src/world/zones/games/WingRules.js';
import { replayRun } from '../src/ui/ArcadeRules.js';

// What stands for a builder, a geometry, a material where nobody looks: anything can be asked of it, nothing happens.
const NOTHING = new Proxy(function nothing() {}, {
  get: (target, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'then' ? undefined : NOTHING),
  set: () => true, apply: () => NOTHING, construct: () => NOTHING,
});
// …and for a mesh: what a game sets every step is plain and fast; the rest is NOTHING.
const triple = () => ({ x: 0, y: 0, z: 0, set() { return this; }, setScalar() { return this; }, copy() { return this; } });
const stand = () => Object.setPrototypeOf({ visible: false, position: triple(), scale: triple(), rotation: triple(), geometry: null, count: 0, setMatrixAt() {}, instanceMatrix: { needsUpdate: false } }, NOTHING);
// A vector, for the little arithmetic a rule may do with one (anything else would be a mistake: it throws).
class Vec {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vec(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  addScaledVector(v, k) { this.x += v.x * k; this.y += v.y * k; this.z += v.z * k; return this; }
  setScalar(k) { this.x = this.y = this.z = k; return this; }
  crossVectors(a, b) { const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x; this.x = x; this.y = y; this.z = z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(k) { this.x *= k; this.y *= k; this.z *= k; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
  distanceTo(v) { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
}

/** The games the server can play again: id → { def, make() → the game, headless }. */
const GAMES = new Map();
const headless = (def, factory) => () => {
  // (the page gives vectors and geometries of its own: here, vectors that only count and geometries that are not built)
  host.V = (x, y, z) => new Vec(x, y, z);
  host.geometry = () => NOTHING;
  host.shown = false;
  return factory({ get: () => NOTHING }, { ...def, x: 0, y: 0, z: 0, group: NOTHING, dyn: NOTHING }, stand, { pool: stand, dynamic: stand, M4: () => NOTHING, Q: () => NOTHING, E: () => NOTHING });
};
for (const def of PIER_BOOTHS) GAMES.set(def.id, { def, make: headless(def, PIER_GAMES[def.id]) });
for (const def of STALLS) GAMES.set(def.id, { def, make: headless(def, STALL_GAMES[def.id]) });

/** (for the tests: the game itself, as the server makes it) */
export const __make = (board) => GAMES.get(board);

// …and the two games that are not booths: (seed, words) → { score, over, steps, seconds }
const OTHERS = new Map([['wing', replayFlight], ['run', replayRun]]);

/** Is that a game the server can play again? */
export const replayable = (board) => GAMES.has(board) || OTHERS.has(board);

/** Plays a game again from its log. Returns { score, over, steps, seconds }, or null when there is nothing to play. */
export function replay(board, seed, logText) {
  if (!replayable(board) || !Number.isInteger(seed)) return null;
  const words = unpackLog(logText);
  if (!words || !words.length) return null;
  const entry = GAMES.get(board);
  return entry ? replaySession(entry.def, entry.make(), seed, words) : OTHERS.get(board)(seed, words);
}

/**
 * Does the game that was played again end — and with the very score that was claimed? (A log that stops
 * before the end of its game proves nothing: one could stop it at its best moment.)
 */
export function agrees(board, claimed, played) {
  return !!played && played.over === true && played.score === claimed;
}
