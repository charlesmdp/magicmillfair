// Balthazar Golf as an extra: plugged into the running game from outside, through what the game exposes (plug.js), so
// that the game without it is exactly the game as it was. Its switch: RELEASE in src/app/config.js (off as it is
// delivered); its board of scores: main.js (LAB_GAMES, LAB_BOARD) and server/scores.js.
import { plug } from './plug.js';
import { Golf } from '../world/zones/games/golf/Golf.js';
import * as rules from '../world/zones/games/golf/rules.js';

const { GOLF } = rules;

/** Builds the nine holes beside the acid pond (in the running game, once it runs) and puts the gate to them where it stands. Returns the game. */
export function attach(app) {
  const golf = new Golf(app.world).build();
  app.world.bakeShadows(); // (the kerbs, the mill and the stakes were not there when the shadows of what never moves were drawn)
  return plug(app, golf, {
    id: 'golf', rules,
    label: () => `Play ${GOLF.name}`,
    leave: 'Leave the course',
    left: 'Round left.',
    // (the keys, and no more than a screen held upright can show without hiding the hole: what sand, ice and pipes
    // do is said again by the note of each hole that has them)
    keys: (touch) => (touch
      ? 'Stick left / right: aim · stick forward, held: the whole hole from above · stick back: slows the gauge · the arrow (jump): putt, as hard as the gauge shows · sand slows, ice slides, a pipe carries the ball · water, a gap, acid: a stroke lost'
      : 'A D (or the arrows): aim · W, held: the whole hole from above · S: slows the gauge · Space: putt, as hard as the gauge shows · sand slows, ice slides, a pipe carries the ball · water, a gap, acid: a stroke lost · E: leave · H: these keys again'),
  });
}
