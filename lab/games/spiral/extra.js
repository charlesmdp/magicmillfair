// A Turn for the Worse as a trial of the lab: plugged into the running game from outside (see ../kit.js), so
// that no file of the game is changed. Only the lab page switches it on.
import { Spiral } from './Spiral.js';
import { SPIRAL, BOARD } from './rules.js';
import { formatTime } from '../../../src/world/zones/games/course.js';
import { plug } from '../kit.js';

/** Stands the tower in the bay of `app` (the game, once it runs) and lets the player run up it. Returns it. */
export function attach(app) {
  const tower = new Spiral(app.world).build();
  app.world.bakeShadows(); // (the tower was not there when the shadows of what never moves were drawn)
  const back = SPIRAL.back === 'landing' ? 'one touch: back to the last landing' : 'one touch: back to the foot';
  return plug(app, tower, {
    id: 'spiral',
    name: SPIRAL.name,
    board: BOARD,
    sub: SPIRAL.back === 'landing' ? 'nineteen turns up to the bell · from the first step, falls and all' : 'nineteen turns up to the bell · from the first step, in one attempt',
    label: () => `Run up ${SPIRAL.name}`,
    leave: 'Leave the tower',
    left: 'Tower left.',
    format: formatTime,
    keys: (touch) => (touch
      ? `Stick up: run — let go: stop · stick aside: across the track — the tower side is the shorter way · the arrow jumps, as far as the run before it — again in the air: higher, further · stick down: slide — standing: duck — in the air: dive · yellow: jump — red: slide under — navy: go round · gold: a springboard, run onto it · ${back}`
      : `W: run — let go: stop · A / D: across the track — the tower side is the shorter way · Space: jump, as far as the run before it — again in the air: higher, further · S: slide — standing: duck — in the air: dive · yellow: jump — red: slide under — navy: go round · gold: a springboard, run onto it · ${back} · E: leave — H: these keys again`),
  });
}
