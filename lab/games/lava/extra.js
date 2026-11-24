// Thin Crust as an extra of the lab: plugged into the running game from outside, through what the game exposes,
// so that no file of the game is changed. See ../kit.js (what a game of this folder is, and `plug`).
import { formatTime } from '../../../src/world/zones/games/course.js';
import { plug } from '../kit.js';
import { Lava } from './Lava.js';
import { LAVA } from './rules.js';

/** Raises the islet in the sea of `app` (the game, once it runs) and lets the player onto its columns. Returns it. */
export function attach(app) {
  const lava = new Lava(app.world).build();
  app.world.bakeShadows(); // (the islet was not there when the shadows of what never moves were drawn)
  return plug(app, lava, {
    id: 'lava',
    more: true, // (the score is how long one held)
    format: formatTime,
    label: (game) => { const next = game.nextStart(); return `Play ${LAVA.name} — ${next.name} start in ${Math.max(1, Math.ceil(next.wait))} s`; },
    leave: 'Leave the crater', left: 'Round left.',
    keys: (touch, run) => (touch
      ? `You leave with the ${run.start.name} start · stick: run over the columns · the arrow jumps (one step up, or over a missing column) · a column that glows and trembles is about to sink · the lava: out`
      : `You leave with the ${run.start.name} start · W A S D: run over the columns · Space jumps (one step up, or over a missing column) · a column that glows and trembles is about to sink · the lava: out · E: leave · H: these keys again`),
  });
}
