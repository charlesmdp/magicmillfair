// The Great Oak ("Out on a Limb"), plugged into the running game from outside like the extras of the game
// (src/extras) — but kept in the lab: it is not good enough to be offered to the game (see README.md), and only
// the lab page has a switch for it. Without it the old tree stands where it always stood.
import { Oak } from './Oak.js';
import { OAK } from './tree.js';

const KEY = 'mmf.oak.best';

/** Grows the oak in the world of `app` (the game, once it runs) and times who climbs it. Returns the oak. */
export function attach(app) {
  const { world, player, hud } = app;
  const oak = new Oak(world).build();
  world.bakeShadows(); // (the giant was not there when the shadows of what never moves were drawn)
  const read = () => { try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch { return 0; } };
  oak.setBest(read());
  oak.events = {
    line: (text) => hud.setRun(text),
    note: (text, ms) => hud.note(text, ms || 3200),
    sound: (name, options) => app.audio?.play(name, options),
    started: () => app.audio?.play('start'),
    finished: (ms, clean) => {
      app.audio?.play('victory');
      if (!clean) { hud.note('Top reached — with a cheat on: no record.', 4200); return; }
      const best = read();
      if (!best || ms < best) { try { localStorage.setItem(KEY, String(ms)); } catch { /* no storage: the time is not kept */ } oak.setBest(ms); }
      hud.note(!best || ms < best ? `${OAK.name}: your best climb!` : `${OAK.name}: at the top.`, 4200);
      app.oakDone?.(ms); // (for whoever keeps a board of the best climbs)
    },
  };
  // no jetpack at the tree: it is climbed
  const fly = player.canFly;
  player.canFly = (pos) => fly(pos) && !oak.near(pos.x, pos.z);
  // every frame, after the game has moved the player
  world.zones.push({ update: (dt, time, camera) => { oak.update(dt, time, camera); oak.tick(dt, player); } });
  app.oak = oak;
  return oak;
}
