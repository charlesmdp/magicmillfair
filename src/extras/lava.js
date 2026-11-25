// Thin Crust as an extra: plugged into the running game from outside, through what the game exposes (plug.js), so
// that the game without it is exactly the game as it was. Its switch: RELEASE in src/app/config.js (off as it is
// delivered); its board of scores: main.js (LAB_GAMES, LAB_BOARD) and server/scores.js.
import { plug } from './plug.js';
import { Lava } from '../world/zones/games/lava/Lava.js';
import * as rules from '../world/zones/games/lava/rules.js';

const { LAVA } = rules;

/** Raises the volcano in the sea of `app` (the game, once it runs) and lets the player onto its columns. Returns it. */
export function attach(app) {
  const lava = new Lava(app.world).build();
  app.world.bakeShadows(); // (the volcano was not there when the shadows of what never moves were drawn)
  return plug(app, lava, {
    id: 'lava', rules,
    more: true, // (the score is how long one held)
    label: (game) => { const next = game.nextStart(); return `Play ${LAVA.name} — ${next.name} start in ${Math.max(1, Math.ceil(next.wait))} s`; },
    leave: 'Leave the crater', left: 'Round left.',
    keys: (touch, run) => (touch
      ? `You leave with the ${run.start.name} start · stick: run over the columns · the arrow jumps: one level up, never two — or over a gap of one column · the lava only rises, and covers what it reaches · columns come up where it glows: the whiter, the higher · keep high, and keep a way on · now and then a double rise: it is said ahead`
      : `You leave with the ${run.start.name} start · W A S D: run over the columns · Space jumps: one level up, never two — or over a gap of one column · the lava only rises, and covers what it reaches · columns come up where it glows: the whiter, the higher · keep high, and keep a way on · now and then a double rise: it is said ahead · E: leave · H: these keys again`),
  });
}
