// Run the Walls as an extra: plugged into the running game from outside, through what the game exposes (plug.js),
// so that the game without it is exactly the game as it was. Its switch: RELEASE in src/app/config.js (off as it
// is delivered); its board of scores: main.js (LAB_GAMES, LAB_BOARD) and server/scores.js.
import { Walls } from '../world/zones/games/walls/Walls.js';
import * as rules from '../world/zones/games/walls/rules.js';
import { plug } from './plug.js';

const { WALLS } = rules;

/** Stands the ruin in the bay of `app` (the game, once it runs) and lets the player run its walls. Returns it. */
export function attach(app) {
  const ruin = new Walls(app.world).build();
  app.world.bakeShadows(); // (the ruin was not there when the shadows of what never moves were drawn)
  const tail = `blue band on a wall: jump at it at a run, and you run along it — the same button kicks off it, to the wall across · green stone: run straight at it, up you go · gold bar: jump into it, the button lets go · red hurts · a fall winds time back: ${WALLS.rewinds} in reserve, filled again at each save`;
  return plug(app, ruin, {
    id: 'walls', rules,
    label: () => `${WALLS.name}: into the ruin`,
    leave: 'Leave the ruin',
    left: 'Ruin left.',
    keys: (touch) => (touch
      ? `Stick up: run — aside: across the way, the wall is on the left · the arrow: jump · ${tail}`
      : `W: run — A / D: across the way, the wall is on the left — S: step back · Space: jump · ${tail} · E: leave — H: these keys again`),
  });
}
