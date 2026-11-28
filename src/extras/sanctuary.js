// The Sanctuary as an extra: a great hall of stone dug into the cliff of the west meadow — a mosque, a church and
// a synagogue under one dome, its front in a court cut into the rock — plugged into the running game from outside
// (its switch: RELEASE in src/app/config.js, off as it is delivered; with it off nothing of it is loaded, built or
// shown, and the cliff is whole). No game there: one walks in and looks; its music — a chant of three choirs
// under the rock, in a hall of its own (TUNES.sanctuary) — plays for who is inside, louder as one walks in.
// See lab/NEWGAMES.md and src/world/zones/places/sanctuary/.
import { Sanctuary } from '../world/zones/places/sanctuary/Sanctuary.js';
import { tunePlayer } from './tunes.js';

/** Builds the hall in the world of `app` (the game, once it runs), and plays its music for who walks in. Returns it. */
export function attach(app) {
  const place = new Sanctuary(app.world).build();
  app.world.bakeShadows();
  const tune = tunePlayer(app), heard = { inside: 0 };
  let playing = false;
  app.world.zones.push({
    update: (dt, time, camera) => {
      place.update(dt, time, camera);
      const p = app.player.pos, k = app.player.driver ? 0 : place.inside(p.x, p.y, p.z);
      heard.inside += (k - heard.inside) * 0.05;
      if (!playing && k > 0.02) { tune.play('sanctuary', { state: heard }); playing = true; }
      if (playing) { tune.tick(); if (k <= 0 && heard.inside < 0.01) { tune.stop(); playing = false; } }
    },
  });
  app.sanctuary = place;
  return place;
}
