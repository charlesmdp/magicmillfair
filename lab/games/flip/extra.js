// Head Over Heels as a trial of the lab: plugged into the running game from outside, through what the game
// exposes, so that no file of the game is changed. See lab/games/kit.js (what a game is, and `plug`).
import { formatTime } from '../../../src/world/zones/games/course.js';
import { plug } from '../kit.js';
import { Flip } from './Flip.js';
import { FLIP, BOARD } from './rules.js';

/** Stands the machine in the sea along the pier of `app` (the game, once it runs) and lets the player run in it. Returns it. */
export function attach(app) {
  const flip = new Flip(app.world).build();
  app.world.bakeShadows(); // (the machine was not there when the shadows of what never moves were drawn)
  return plug(app, flip, {
    id: 'flip',
    name: FLIP.name,
    // (a start every ten seconds on the clock everybody shares: who asks together leaves together)
    label: (game) => { const next = game.nextStart(); return `Run ${FLIP.name} — ${next.name} start in ${Math.max(1, Math.ceil(next.wait))} s`; },
    // (four short lines: the panel that shows them hangs over the top of the machine for a few seconds)
    keys: (touch) => `You run on the spot: ${touch ? 'the arrow' : 'Space'} turns gravity over (feet on a girder or on another runner) · a girder or a runner in your way holds you back: get free before the left tower · out, you drop back in after a moment, 3 s added — a spark takes a quarter of a second off${touch ? '' : ' · E: leave — H: these keys again'}`,
    leave: 'Leave the run',
    left: 'Run left.',
    format: formatTime,
    board: BOARD,
    sub: 'a thousand metres of girders · the machine\'s time, 3 s for each fall, a quarter of a second off for each spark',
  });
}
