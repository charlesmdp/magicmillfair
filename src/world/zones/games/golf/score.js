// A score of Balthazar Golf: the strokes first, then how long the round took — strokes × 1000 + seconds (999
// at most). In a file of its own: the game writes such a score on the board without loading the rules of the golf.
/** The score of a round of `strokes` strokes played in `seconds`. */
export const scoreOf = (strokes, seconds) => strokes * 1000 + Math.min(999, Math.max(0, Math.floor(seconds)));
/** How a score is written: "31 strokes (2:07)". */
export function formatScore(score) { const n = Math.floor(score / 1000), s = score % 1000; return `${n} strokes (${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')})`; }
