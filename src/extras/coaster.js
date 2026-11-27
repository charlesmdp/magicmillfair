// Hold the Rails! as an extra: plugged into the running game from outside, through what the game exposes
// (plug.js), so that the game without it is exactly the game as it was. Its switch: RELEASE in src/app/config.js
// (off as it is delivered); its board of scores: main.js (LAB_GAMES, LAB_BOARD) and server/scores.js.
import { Coaster } from '../world/zones/games/coaster/Coaster.js';
import * as rules from '../world/zones/games/coaster/rules.js';
import { plug } from './plug.js';

const { COASTER } = rules;

/** Stands the coaster on the mountains of `app` (the game, once it runs) and lets the player ride it. Returns it. */
export function attach(app) {
  const coaster = new Coaster(app.world).build();
  app.world.bakeShadows(); // (the station at the back of the beach was not there when the shadows of what never moves were drawn)
  return plug(app, coaster, {
    id: 'coaster', rules,
    label: (game) => { const next = game.nextStart(); return `Ride ${COASTER.name} — ${next.name} start in ${Math.max(1, Math.ceil(next.wait))} s`; },
    leave: 'Leave the car', left: 'Coaster left.',
    keys: (touch, run) => (touch
      ? `You leave with the ${run.start.name} start · the rails do not hold the car — you do: stick left and right keeps it on them, against every bend · stick up: let it run — down: brake before a sharp bend · the arrow: a BURST of speed, back after five seconds · beyond the red boards you fall, and are back at the last green flag · yellow and black: a gap — fast over its ramp · red and white: a rail is missing — keep to the other · blue: a lift — hands off`
      : `You leave with the ${run.start.name} start · the rails do not hold the car — you do: A / D keep it on them, against every bend · W: let it run — S: brake before a sharp bend · Space: a BURST of speed, back after five seconds · beyond the red boards you fall, and are back at the last green flag · yellow and black: a gap — fast over its ramp · red and white: a rail is missing — keep to the other · blue: a lift — hands off · E: leave · H: these keys again`),
  });
}
