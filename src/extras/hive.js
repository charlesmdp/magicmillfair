// The Bee's Knees as an extra: plugged into the running game from outside, through what the game exposes (plug.js), so
// that the game without it is exactly the game as it was. Its switch: RELEASE in src/app/config.js (off as it is
// delivered); its board of scores: main.js (LAB_GAMES, LAB_BOARD) and server/scores.js.
import { plug } from './plug.js';
import { Hive } from '../world/zones/games/hive/Hive.js';
import * as rules from '../world/zones/games/hive/rules.js';

const { HIVE } = rules;

/** Hangs the combs over the sea of `app` (the game, once it runs) and lets the player run on them. Returns the hive. */
export function attach(app) {
  const hive = new Hive(app.world).build();
  app.world.bakeShadows(); // (the masts, the hoops and the skep were not there when the shadows of what never moves were drawn)
  return plug(app, hive, {
    id: 'hive', rules,
    more: true, // (the longer one held, the better)
    label: () => `Play ${HIVE.name}`,
    leave: 'Leave the combs',
    left: 'Run left.',
    keys: (touch) => (touch
      ? 'Stick: run · the arrow jumps · the wax you set foot on gives way: keep moving · mind the bees: they take it apart too · amber caps hold longer · pink jelly throws you back up, once'
      : 'W A S D: run · Space jumps · the wax you set foot on gives way: keep moving · mind the bees: they take it apart too · amber caps hold longer · pink jelly throws you back up, once · E: leave · H: these keys again'),
  });
}
