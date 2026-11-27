// Robots Can See You as an extra: plugged into the running game from outside, through what the game exposes
// (plug.js), so that the game without it is exactly the game as it was. Its switch: RELEASE in src/app/config.js
// (off as it is delivered); its board of scores: main.js (LAB_GAMES, LAB_BOARD) and server/scores.js.
import { plug } from './plug.js';
import { Sneak } from '../world/zones/games/sneak/Sneak.js';
import * as rules from '../world/zones/games/sneak/rules.js';

const { SNEAK } = rules;

/** Builds the yard on its quay in the south of the bay (the game, once it runs) and lets the player slip through it. Returns the game. */
export function attach(app) {
  const sneak = new Sneak(app.world).build();
  app.world.bakeShadows(); // (the quay was not there when the shadows of what never moves were drawn)
  return plug(app, sneak, {
    id: 'sneak', rules,
    label: () => `Play ${SNEAK.name}`,
    leave: 'Leave the yard',
    left: 'You left the yard.',
    keys: (touch) => (touch
      ? 'Stick: walk — pushed all the way: run (fast, but robots hear it) · Arrow button: crouch / stand up — slow, silent, hidden behind crates, sandbags and tall grass · Stay out of the cones of light · Pick up the 3 cores, reach the door'
      : 'W A S D or the arrows: run (fast, but robots hear it) · Space: crouch / stand up — slow, silent, hidden behind crates, sandbags and tall grass · Stay out of the cones of light · Pick up the 3 cores, reach the door · E: leave · H: these keys again'),
  });
}
