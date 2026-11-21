// Leaderboards of the fair's games, independent of where they are kept: server/index.js (a JSON file) and
// cloudflare/worker.js (the storage of a Durable Object) both go through this.
//
//   GET  /api/scores?board=sky            → { board, top: [{ name, ms }] }            (the ten best, best first)
//   POST /api/scores  { board, name, ms }  → { board, top, rank, best }                 (rank: 1 = first; best: a personal best)
//
// One line per name: a better time replaces the previous one, a worse one changes nothing. Times come from the
// players' own browsers: there is no referee, only bounds on what is believed (see BOARDS).
import { cleanName } from './protocol.js';

/** board id → the fastest time believed and the slowest worth keeping (ms). */
export const BOARDS = {
  sky: { min: 100_000, max: 6 * 3600_000 }, // the Sky Stones: a bot that never misses needs about 150 s
};
export const KEPT = 200, SHOWN = 10;

const key = (name) => name.toLowerCase();

/** The line a POST asks to add, or null when it makes no sense. */
export function cleanScore(body) {
  if (!body || typeof body !== 'object' || !Object.hasOwn(BOARDS, body.board)) return null;
  const { min, max } = BOARDS[body.board];
  const ms = Math.round(Number(body.ms));
  if (!Number.isFinite(ms) || ms < min || ms > max) return null;
  if (typeof body.name !== 'string' || !body.name.trim()) return null;
  return { board: body.board, name: cleanName(body.name), ms };
}

/** Adds a time to a board (an array of { name, ms, at }, best first). Returns { list, rank, best }. */
export function addScore(list, { name, ms }, at = Date.now()) {
  list = Array.isArray(list) ? list.filter((e) => e && typeof e.name === 'string' && Number.isFinite(e.ms)) : [];
  const mine = list.find((e) => key(e.name) === key(name));
  const best = !mine || ms < mine.ms;
  if (best) {
    list = list.filter((e) => e !== mine);
    list.push({ name, ms, at });
    list.sort((a, b) => a.ms - b.ms || a.at - b.at);
    list = list.slice(0, KEPT);
  }
  const rank = list.findIndex((e) => key(e.name) === key(name)) + 1; // 0: did not make the list
  return { list, rank, best };
}

export const topOf = (list) => (Array.isArray(list) ? list.slice(0, SHOWN).map((e) => ({ name: e.name, ms: e.ms })) : []);

/**
 * Answers a request on /api/scores. `store` keeps one value per board: { get(board) → list | undefined, put(board, list) },
 * both may be asynchronous. Returns { status, body }.
 */
export async function scoresRoute({ method, query, body }, store) {
  if (method === 'GET' || method === 'HEAD') {
    const board = query.get('board') || 'sky';
    if (!Object.hasOwn(BOARDS, board)) return { status: 404, body: { error: 'Unknown board.' } };
    return { status: 200, body: { board, top: topOf(await store.get(board)) } };
  }
  if (method !== 'POST') return { status: 405, body: { error: 'Method not allowed.' } };
  const score = cleanScore(body);
  if (!score) return { status: 400, body: { error: 'Not a score.' } };
  const { list, rank, best } = addScore(await store.get(score.board), score);
  if (best) await store.put(score.board, list);
  return { status: 200, body: { board: score.board, top: topOf(list), rank, best } };
}
