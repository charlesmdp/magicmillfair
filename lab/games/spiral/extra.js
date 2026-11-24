// A Turn for the Worse as a trial of the lab: plugged into the running game from outside (see ../kit.js), so
// that no file of the game is changed. Only the lab page switches it on.
import { Spiral } from './Spiral.js';
import { SPIRAL } from './rules.js';
import { formatTime } from '../../../src/world/zones/games/course.js';
import { plug } from '../kit.js';

/** Stands the tower in the bay of `app` (the game, once it runs) and lets the player run up it. Returns it. */
export function attach(app) {
  const tower = new Spiral(app.world).build();
  app.world.bakeShadows(); // (the tower was not there when the shadows of what never moves were drawn)
  return plug(app, tower, {
    id: 'spiral',
    label: () => `Run up ${SPIRAL.name}`,
    leave: 'Leave the tower',
    left: 'Tower left.',
    format: formatTime,
    keys: (touch) => (touch
      ? 'The legs run by themselves · stick aside: across the track — the tower side is the shorter way · the arrow jumps — again in the air: higher · stick down: slide — in the air: dive · yellow: jump — red: slide under — navy: go round · one touch: back to the foot'
      : 'The legs run by themselves · A / D: across the track — the tower side is the shorter way · Space: jump — again in the air: higher · S: slide — in the air: dive · yellow: jump — red: slide under — navy: go round · one touch: back to the foot · E: leave — H: these keys again'),
  });
}
