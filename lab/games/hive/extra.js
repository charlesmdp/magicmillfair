// The Bee's Knees as a trial of the lab: plugged into the running game from outside (see ../kit.js), so that no
// file of the game is changed. Only the lab page has a switch for it.
import { plug } from '../kit.js';
import { formatTime } from '../../../src/world/zones/games/course.js';
import { Hive } from './Hive.js';
import { HIVE, BOARD } from './rules.js';

/** Hangs the combs over the sea of `app` (the game, once it runs) and lets the player run on them. Returns the hive. */
export function attach(app) {
  const hive = new Hive(app.world).build();
  app.world.bakeShadows(); // (the masts, the hoops and the skep were not there when the shadows of what never moves were drawn)
  return plug(app, hive, {
    id: 'hive',
    name: HIVE.name,
    board: BOARD,
    sub: 'four combs over the sea · how long one held',
    more: true, // (the longer one held, the better)
    format: (ms) => `Held ${formatTime(ms)}`,
    label: () => `Play ${HIVE.name}`,
    leave: 'Leave the combs',
    left: 'Run left.',
    keys: (touch) => (touch
      ? 'Stick: run · the arrow jumps · the wax you set foot on gives way: keep moving · mind the bees: they take it apart too · amber caps hold longer · pink jelly throws you back up, once'
      : 'W A S D: run · Space jumps · the wax you set foot on gives way: keep moving · mind the bees: they take it apart too · amber caps hold longer · pink jelly throws you back up, once · E: leave · H: these keys again'),
  });
}
