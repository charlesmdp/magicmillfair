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
      ? 'Stick up: go forward, the way the car faces · Stick down: brake, then reverse · Stick left / right: turn the car to its left / right · Arrow button: a boost that comes back · Fast into a bend: drift; straighten up for a burst · Fire jets: drive past on their far side'
      : 'W or ↑: go forward, the way the car faces · S or ↓: brake, then reverse · A D or ← →: turn the car to its left / right · Space: a boost that comes back · Fast into a bend: drift; straighten up for a burst · E: leave · H: these keys again'),
  });
}
