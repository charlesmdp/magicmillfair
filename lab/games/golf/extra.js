// Par for the Course as a trial of the lab: plugged into the running game from outside (see ../kit.js), so that no
// file of the game is changed. Nine holes of crazy golf round the acid pond of the north-western meadow.
import { plug } from '../kit.js';
import { Golf } from './Golf.js';
import { GOLF, BOARD, formatScore } from './rules.js';

/** Builds the nine holes beside the acid pond (in the running game, once it runs) and puts the gate to them where it stands. Returns the game. */
export function attach(app) {
  const golf = new Golf(app.world).build();
  app.world.bakeShadows(); // (the kerbs, the mill and the stakes were not there when the shadows of what never moves were drawn)
  return plug(app, golf, {
    id: 'golf',
    name: GOLF.name,
    board: BOARD,
    sub: 'nine holes of the valley in miniature, round the acid pond · the fewest strokes',
    format: formatScore,
    label: () => `Play ${GOLF.name}`,
    leave: 'Leave the course',
    left: 'Round left.',
    keys: (touch) => (touch
      ? 'Stick left / right: aim the line of dots · stick back: slows the gauge · the arrow (jump) putts at the strength the gauge shows · near the cup a slow ball drops, a fast one lips out · the swan pond, the gaps and the acid cost a stroke · seven strokes at most a hole'
      : 'A D (or the arrows): aim the line of dots · S: slows the gauge · Space putts at the strength the gauge shows · near the cup a slow ball drops, a fast one lips out · the swan pond, the gaps and the acid cost a stroke · seven strokes at most a hole · E: leave · H: these keys again'),
  });
}
