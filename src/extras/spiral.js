// Spiral of Death as an extra: plugged into the running game from outside, through what the game exposes (plug.js), so
// that the game without it is exactly the game as it was. Its switch: RELEASE in src/app/config.js (off as it is
// delivered); its board of scores: main.js (LAB_GAMES, LAB_BOARD) and server/scores.js.
import { Spiral } from '../world/zones/games/spiral/Spiral.js';
import * as rules from '../world/zones/games/spiral/rules.js';
import { plug } from './plug.js';

const { SPIRAL } = rules;

/** Stands the tower in the bay of `app` (the game, once it runs) and lets the player run up it. Returns it. */
export function attach(app) {
  const tower = new Spiral(app.world).build();
  app.world.bakeShadows(); // (the tower was not there when the shadows of what never moves were drawn)
  const back = SPIRAL.back === 'landing' ? `a save at every landing, every ${Math.round(rules.heightOf(rules.LANDINGS[0]))} m up: one touch, and you are back on the last one you reached (before the first: at the foot)` : 'one touch: back to the foot';
  return plug(app, tower, {
    id: 'spiral', rules,
    label: () => `Run up ${SPIRAL.name}`,
    leave: 'Leave the tower',
    left: 'Tower left.',
    keys: (touch) => (touch
      ? `Stick up: run — let go: stop · stick aside: across the track — the tower side is the shorter way · the arrow jumps, as far as the run before it — again in the air: higher, further · stick down: slide — standing: duck — in the air: dive · yellow: jump — red: slide under — navy: go round · gold: a springboard, run onto it · ${back}`
      : `W: run — let go: stop · A / D: across the track — the tower side is the shorter way · Space: jump, as far as the run before it — again in the air: higher, further · S: slide — standing: duck — in the air: dive · yellow: jump — red: slide under — navy: go round · gold: a springboard, run onto it · ${back} · E: leave — H: these keys again`),
  });
}
