// Head Over Heels as a trial of the lab: plugged into the running game from outside, through what the game
// exposes, so that no file of the game is changed. See lab/games/kit.js (what a game is, and `plug`).
import { formatTime } from '../../../src/world/zones/games/course.js';
import { plug } from '../kit.js';
import { Flip } from './Flip.js';
import { FLIP } from './rules.js';

/** Hangs the line of girders along the pier of `app` (the game, once it runs) and lets the player run it. Returns it. */
export function attach(app) {
  const flip = new Flip(app.world).build();
  app.world.bakeShadows(); // (the gantry was not there when the shadows of what never moves were drawn)
  return plug(app, flip, {
    id: 'flip',
    label: () => `Run ${FLIP.name}`,
    // (four short lines: the panel that shows them hangs over the top of the line for a few seconds)
    keys: (touch) => (touch
      ? 'You run by yourself · the arrow turns gravity over (feet on a girder only) · a spark takes time off, a fall puts you back at a flag'
      : 'You run by yourself · Space turns gravity over (feet on a girder only) · a spark takes time off, a fall puts you back at a flag · E: leave — H: these keys again'),
    leave: 'Leave the run',
    left: 'Run left.',
    format: formatTime,
  });
}
