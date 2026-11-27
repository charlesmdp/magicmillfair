// Wild River as an extra: plugged into the running game from outside, through what the game exposes (plug.js), so
// that the game without it is exactly the game as it was. Its switch: RELEASE in src/app/config.js (off as it is
// delivered); its board of scores: main.js (LAB_GAMES, LAB_BOARD) and server/scores.js.
import { Raft } from '../world/zones/games/raft/Raft.js';
import * as rules from '../world/zones/games/raft/rules.js';
import { plug } from './plug.js';

const { RAFT } = rules;

/** Stands the headland of the river in the sea of `app` (the game, once it runs) and lets the player raft down it. Returns it. */
export function attach(app) {
  const river = new Raft(app.world).build();
  app.world.bakeShadows(); // (the gate on the beach was not there when the shadows of what never moves were drawn)
  return plug(app, river, {
    id: 'raft', rules,
    label: (game) => { const next = game.nextStart(); return `Raft down ${RAFT.name} — ${next.name} start in ${Math.max(1, Math.ceil(next.wait))} s`; },
    leave: 'Leave the river', left: 'River left.',
    keys: (touch, run) => (touch
      ? `You leave with the ${run.start.name} start · stick up: paddle on — down: hold water · stick aside: steer — the raft turns late: start early · the arrow: BRACE, just before a rock or a fall — it saves the knock · take the falls straight and the great waves head on: sideways, the raft goes over, and you are back at the last flag · the white boil under a fall holds: paddle hard through it, or go round · pale gravel grounds`
      : `You leave with the ${run.start.name} start · W: paddle on — S: hold water · A / D: steer — the raft turns late: start early · Space: BRACE, just before a rock or a fall — it saves the knock · take the falls straight and the great waves head on: sideways, the raft goes over, and you are back at the last flag · the white boil under a fall holds: paddle hard through it, or go round · pale gravel grounds · E: leave · H: these keys again`),
  });
}
