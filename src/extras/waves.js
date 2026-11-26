// Big Tsunami as an extra: plugged into the running game from outside, through what the game exposes (plug.js), so
// that the game without it is exactly the game as it was. Its switch: RELEASE in src/app/config.js (off as it is
// delivered); its board of scores: main.js (LAB_GAMES, LAB_BOARD) and server/scores.js.
import { plug } from './plug.js';
import { Waves } from '../world/zones/games/waves/Waves.js';
import * as rules from '../world/zones/games/waves/rules.js';

const { WAVES } = rules;

/** Lays the bank of sand off the beach of `app` (the game, once it runs) and lets the player jump in. Returns it. */
export function attach(app) {
  const waves = new Waves(app.world).build();
  app.world.bakeShadows();
  return plug(app, waves, {
    id: 'waves', rules,
    more: true, // (the score is how long one held)
    // (the arch says the mood of the sea: who wants a long run waits for the lull)
    label: (game) => `Jump in — ${WAVES.name} — ${game.moodLine()}`,
    leave: 'Leave the bank', left: 'Back on the beach.',
    keys: (touch) => (touch
      ? 'Stick: run anywhere on the bank · the arrow jumps (again in the air: higher) · a low wave: hop it · a tall one: two jumps, its low end, or round it · a great one: only through its gap · a wave that catches you throws you back: off the back, it is over'
      : 'W A S D: run anywhere on the bank · Space jumps (again in the air: higher) · a low wave: hop it · a tall one: two jumps, its low end, or round it · a great one: only through its gap · a wave that catches you throws you back: off the back, it is over · E: leave · H: these keys again'),
  });
}
