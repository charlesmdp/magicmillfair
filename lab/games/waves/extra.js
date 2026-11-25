// Wave Goodbye as a trial of the lab: plugged into the running game from outside (see ../kit.js), so that no
// file of the game is changed. Only the lab page switches it on (lab/lab.js).
import { formatTime } from '../../../src/world/zones/games/course.js';
import { plug } from '../kit.js';
import { Waves } from './Waves.js';
import { WAVES, BOARD } from './rules.js';

/** Lays the bank of sand off the beach of `app` (the game, once it runs) and lets the player jump in. Returns it. */
export function attach(app) {
  const waves = new Waves(app.world).build();
  app.world.bakeShadows();
  return plug(app, waves, {
    id: 'waves', more: true, format: formatTime,
    name: WAVES.name,
    board: BOARD,
    sub: 'a bank of sand, the sea of everybody · how long one held',
    // (the arch says the mood of the sea: who wants a long run waits for the lull)
    label: (game) => `Jump in — ${WAVES.name} — ${game.moodLine()}`,
    leave: 'Leave the bank', left: 'Back on the beach.',
    keys: (touch) => (touch
      ? 'Stick: run anywhere on the bank · the arrow jumps (again in the air: higher) · a low wave: hop it · a tall one: two jumps, its low end, or round it · a great one: only through its gap · a wave that catches you throws you back: off the back, it is over'
      : 'W A S D: run anywhere on the bank · Space jumps (again in the air: higher) · a low wave: hop it · a tall one: two jumps, its low end, or round it · a great one: only through its gap · a wave that catches you throws you back: off the back, it is over · E: leave · H: these keys again'),
  });
}
