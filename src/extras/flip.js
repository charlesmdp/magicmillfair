// Mostly Up & Down as an extra: plugged into the running game from outside, through what the game exposes (plug.js), so
// that the game without it is exactly the game as it was. Its switch: RELEASE in src/app/config.js (off as it is
// delivered); its board of scores: main.js (LAB_GAMES, LAB_BOARD) and server/scores.js.
import { plug } from './plug.js';
import { Flip } from '../world/zones/games/flip/Flip.js';
import * as rules from '../world/zones/games/flip/rules.js';

const { FLIP } = rules;

/** Stands the machine in the sea along the pier of `app` (the game, once it runs) and lets the player run in it. Returns it. */
export function attach(app) {
  const flip = new Flip(app.world).build();
  app.world.bakeShadows(); // (the machine was not there when the shadows of what never moves were drawn)
  return plug(app, flip, {
    id: 'flip', rules,
    // (a start every ten seconds on the clock everybody shares: who asks together leaves together)
    label: (game) => { const next = game.nextStart(); return `Run ${FLIP.name} — ${next.name} start in ${Math.max(1, Math.ceil(next.wait))} s`; },
    // (four short lines: the panel that shows them hangs over the top of the machine for a few seconds)
    keys: (touch) => `You run on the spot: ${touch ? 'the arrow' : 'Space'} turns gravity over (feet on a girder or on another runner) · a girder or a runner in your way holds you back: get free before the left tower · out, you drop back in after a moment, 3 s added — a spark takes a quarter of a second off${touch ? '' : ' · E: leave — H: these keys again'}`,
    leave: 'Leave the run',
    left: 'Run left.',
  });
}
