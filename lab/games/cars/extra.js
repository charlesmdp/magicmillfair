// Round the Bend as a trial of the lab: plugged into the running game from outside (see ../kit.js), so that no file
// of the game is changed. Only the lab page has a switch for it.
import { plug } from '../kit.js';
import { formatTime } from '../../../src/world/zones/games/course.js';
import { Cars } from './Cars.js';
import { CARS, BOARD } from './rules.js';

/** Sets the table in the meadow by the acid pond (the game, once it runs) and lets the player race on it. Returns the game. */
export function attach(app) {
  const cars = new Cars(app.world).build();
  app.world.bakeShadows(); // (the table and its stand were not there when the shadows of what never moves were drawn)
  return plug(app, cars, {
    id: 'cars',
    name: CARS.name,
    board: BOARD,
    sub: 'three laps of the table · the fastest time',
    format: (ms) => formatTime(ms),
    label: () => `Play ${CARS.name}`,
    leave: 'Leave the track',
    left: 'You left the track.',
    keys: (touch) => (touch
      ? 'Stick: steer — the car goes where you point on the screen · the arrow is a short boost, which comes back · three laps, the gates in their order · yellow pad: a kick · sand and oil: slow and slippery · orange ramp: a jump'
      : 'W A S D or arrows: steer — the car goes where you point on the screen · Space: a short boost, which comes back · three laps, the gates in their order · yellow pad: a kick · sand and oil: slow and slippery · orange ramp: a jump · E: leave · H: these keys again'),
  });
}
