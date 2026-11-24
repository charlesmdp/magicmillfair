// Wave Goodbye as a trial of the lab: plugged into the running game from outside (see ../kit.js), so that no
// file of the game is changed. Only the lab page switches it on (lab/lab.js).
import { formatTime } from '../../../src/world/zones/games/course.js';
import { plug } from '../kit.js';
import { Waves } from './Waves.js';
import { WAVES } from './rules.js';

/** Lays the bar of sand out from the beach of `app` (the game, once it runs) and lets the player wade in. Returns it. */
export function attach(app) {
  const waves = new Waves(app.world).build();
  app.world.bakeShadows();
  return plug(app, waves, {
    id: 'waves', more: true, format: formatTime,
    label: () => `Wade in — ${WAVES.name}`,
    leave: 'Leave the sea', left: 'Back on the sand.',
    keys: (touch) => (touch ? 'The backwash draws you out, slowly · stick aside: along the crest · the arrow jumps (again in the air: higher) · a wave lower than your knees only wets · the great ones: get to their low end'
      : 'The backwash draws you out, slowly · A / D: along the crest · Space jumps (again in the air: higher) · a wave lower than your knees only wets · the great ones: get to their low end · E: leave · H: these keys again'),
  });
}
