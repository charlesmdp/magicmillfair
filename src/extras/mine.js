// Little Mine Train as an extra: plugged into the running game from outside, through what the game exposes
// (plug.js), so that the game without it is exactly the game as it was. Its switch: RELEASE in src/app/config.js
// (off as it is delivered); its board of scores: main.js (LAB_GAMES, LAB_BOARD) and server/scores.js.
import { Mine } from '../world/zones/games/mine/Mine.js';
import * as rules from '../world/zones/games/mine/rules.js';
import { plug } from './plug.js';

const { MINE } = rules;

/** Lays the line of the mine over the west mountains of `app` (the game, once it runs) and lets the player ride it. Returns it. */
export function attach(app) {
  const mine = new Mine(app.world).build();
  app.world.bakeShadows(); // (the station and the trestles were not there when the shadows of what never moves were drawn)
  return plug(app, mine, {
    id: 'mine', rules,
    label: (game) => { const next = game.nextStart(); return `Ride the ${MINE.name} — the ${next.name} train leaves in ${Math.max(1, Math.ceil(next.wait))} s`; },
    leave: 'Leave the train', left: 'Train left.',
    keys: (touch, run) => (touch
      ? `You ride the ${run.start.name} train: it follows its rails by itself · stick left / right: LEAN into the bend (blue boards) — a bend taken upright tips the cart off the rails · stick back: BRAKE, before the red boards · stick forward: let it run · the arrow: HOP, at the yellow boards — a gap in the rails, a rock on them · at the green board, lean right for the short way (the hard one) · each nugget takes a quarter of a second off: lean to them, hop to the high ones`
      : `You ride the ${run.start.name} train: it follows its rails by itself · A / D: LEAN into the bend (blue boards) — a bend taken upright tips the cart off the rails · S: BRAKE, before the red boards · W: let it run · Space: HOP, at the yellow boards — a gap in the rails, a rock on them · at the green board, lean right for the short way (the hard one) · each nugget takes a quarter of a second off: lean to them, hop to the high ones · E: leave · H: these keys again`),
  });
}
