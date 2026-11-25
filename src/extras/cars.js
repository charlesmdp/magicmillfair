// Round the Bend as an extra: plugged into the running game from outside, through what the game exposes (plug.js), so
// that the game without it is exactly the game as it was. Its switch: RELEASE in src/app/config.js (off as it is
// delivered); its board of scores: main.js (LAB_GAMES, LAB_BOARD) and server/scores.js.
import { plug } from './plug.js';
import { Cars } from '../world/zones/games/cars/Cars.js';
import * as rules from '../world/zones/games/cars/rules.js';

const { CARS } = rules;

/** Sets the table in the meadow by the acid pond (the game, once it runs) and lets the player race on it. Returns the game. */
export function attach(app) {
  const cars = new Cars(app.world).build();
  app.world.bakeShadows(); // (the table and its stand were not there when the shadows of what never moves were drawn)
  return plug(app, cars, {
    id: 'cars', rules,
    label: () => `Play ${CARS.name}`,
    leave: 'Leave the track',
    left: 'You left the track.',
    keys: (touch) => (touch
      ? 'Stick up: go forward, the way the car faces · Stick down: brake, then reverse · Stick left / right: turn the car to its left / right · Arrow button: a boost that comes back · Fast into a bend: drift; straighten up for a burst · Fire jets: drive past on their far side'
      : 'W or ↑: go forward, the way the car faces · S or ↓: brake, then reverse · A D or ← →: turn the car to its left / right · Space: a boost that comes back · Fast into a bend: drift; straighten up for a burst · E: leave · H: these keys again'),
  });
}
