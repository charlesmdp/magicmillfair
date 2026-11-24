// The Little Regatta as an extra: plugged into the running game from outside, through what the game exposes
// (window.__mmf), so that no file of the game is changed and the game without it is exactly the game as it was.
// See index.js (the switches) and lab/INTEGRATION.md (its board of scores).
import { Boats } from '../world/zones/games/boats/Boats.js';
import { REGATTA } from '../world/zones/games/boats/water.js';

const KEY = 'mmf.boats.best';

/** Lays the course on the Great Pond of `app` (the game, once it runs) and lets the player race on it. Returns it. */
export function attach(app) {
  const { world, player, hud } = app;
  const boats = new Boats(world).build();
  world.bakeShadows(); // (the stand and the buoys were not there when the shadows of what never moves were drawn)
  const read = () => { try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch { return 0; } };
  boats.setBest(read());

  let race = null, saved = false;
  const io = {
    play: (name, options) => app.audio?.play(name, options),
    note: (text) => hud.note(text, 3000),
    splash: (x, y, z, strength) => world.ripples?.splash(app.engine.time, x, y, z, strength),
  };
  const leave = (finished) => {
    if (!race) return;
    const s = race;
    race = null; saved = false;
    app.fair.fov = null;
    hud.setRun(null);
    s.drop(player);
    if (!finished) hud.note('Race left.', 2500);
    player.vel.set(0, 0, 0);
    app.rig.snap(player.pos, player.yaw + Math.PI);
  };
  const start = () => {
    if (race || app.fair.session || player.dead || player.driver) return;
    race = boats.open(player, io);
    player.driver = race;
    app.audio?.play('teleport');
    hud.note(app.input.isTouch ? 'Your boat is the red one · stick up: ahead · stick aside: the helm · the arrow: a burst of speed · between the buoys, red to port'
      : 'Your boat is the red one · W: ahead, S: astern · A / D: the helm · Space: a burst of speed · between the buoys · E: leave', 9000);
  };
  world.actionSources.push((p) => {
    if (race) return race.over ? null : { label: 'Leave the race', run: () => leave(false) };
    return boats.near(p.pos.x, p.pos.z) ? { label: `Race ${REGATTA.name}`, run: start } : null;
  });
  // every frame, after the game has moved the player and its own camera
  world.zones.push({
    update: (dt, time, camera) => {
      if (!race) return;
      if (player.dead || player.driver !== race) { leave(false); return; }
      app.fair.fov = race.camera(camera, dt);
      camera.updateMatrixWorld();
      hud.setRun(race.line);
      if (race.over && !saved) {
        saved = true;
        const ms = race.time, best = read();
        if (ms && (!best || ms < best)) { try { localStorage.setItem(KEY, String(ms)); } catch { /* no storage */ } boats.setBest(ms); hud.note(best ? 'Your best time yet!' : 'A first time on the board.', 5000); }
        if (ms) app.boatsDone?.(ms, race.place); // (for whoever keeps a board of the best times)
      }
      if (race.ended) leave(true);
    },
  });
  Object.assign(app, { boats, raceBoats: start, leaveBoats: leave, boatRace: () => race });
  return boats;
}
