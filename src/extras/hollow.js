// The Hollow Hill as an extra: plugged into the running game from outside, through what the game exposes
// (window.__mmf), so that no file of the game is changed and the game without it is exactly the game as it was.
// See index.js (the switches) and lab/INTEGRATION.md (its board of scores).
import { Hollow } from '../world/zones/games/hollow/Hollow.js';
import { HOLLOW } from '../world/zones/games/hollow/tunnel.js';
import { keysHelp } from './help.js';

const KEY = 'mmf.hollow.best';

/** Digs the cave under the hill of `app` (the game, once it runs) and lets the player fly it. Returns it. */
export function attach(app) {
  const { world, player, hud } = app;
  const cave = new Hollow(world).build();
  const read = () => { try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch { return 0; } };
  cave.setBest(read());
  let flight = null, saved = false;
  const io = { play: (name, options) => app.audio?.play(name, options), note: (text) => hud.note(text, 3200) };
  const leave = (done) => {
    if (!flight) return;
    const s = flight;
    flight = null; saved = false;
    app.fair.fov = null;
    hud.setRun(null);
    keysHelp(app).clear();
    s.drop(player);
    if (!done) hud.note('Flight left.', 2500);
    player.vel.set(0, 0, 0);
    app.rig.snap(player.pos, player.yaw + Math.PI);
  };
  const start = () => {
    if (flight || app.fair.session || player.dead || player.driver) return;
    flight = cave.open(player, io);
    player.driver = flight;
    app.audio?.play('teleport');
    keysHelp(app).set(app.input.isTouch ? 'You fly by yourself · the stick steers: left, right, up, down · hold the arrow to burst (the gauge is on the line above; the rings fill it) · what you hit all but stops you'
      : 'You fly by yourself · A / D: left, right · W / S: up, down · hold Space (or Shift) to burst — the gauge is on the line above, the rings fill it · what you hit all but stops you · E: leave · H: these keys again');
  };
  world.actionSources.push((p) => {
    if (flight) return flight.over ? null : { label: 'Leave the flight', run: () => leave(false) };
    if (!cave.near(p.pos.x, p.pos.z)) return null;
    return { label: `Fly ${HOLLOW.name}`, run: start };
  });
  world.zones.push({
    update: (dt, time, camera) => {
      if (!flight) return;
      if (player.dead || player.driver !== flight) { leave(false); return; }
      app.fair.fov = flight.camera(camera, dt);
      camera.updateMatrixWorld();
      hud.setRun(flight.line);
      if (flight.over && !saved) {
        saved = true;
        const ms = flight.time, best = read();
        if (ms && (!best || ms < best)) { try { localStorage.setItem(KEY, String(ms)); } catch { /* no storage */ } cave.setBest(ms); hud.note(best ? 'Your best lap yet!' : 'A first time on the board.', 5000); }
        if (ms) app.hollowDone?.(ms, flight.state.hits); // (for whoever keeps a board of the best times)
      }
      if (flight.ended) leave(true);
    },
  });
  Object.assign(app, { hollow: cave, flyHollow: start, leaveHollow: leave, hollowFlight: () => flight });
  return cave;
}
