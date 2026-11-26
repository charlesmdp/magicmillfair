// Jump the Logs as an extra: plugged into the running game from outside, through what the game exposes
// (window.__mmf), so that no file of the game is changed and the game without it is exactly the game as it was.
// See index.js (the switches) and lab/INTEGRATION.md (its board of scores).
import { Hill } from '../world/zones/games/hill/Hill.js';
import { HILL } from '../world/zones/games/hill/slope.js';
import { keysHelp } from './help.js';

const KEY = 'mmf.hill.best';

/** Lays the slope out in the world of `app` (the game, once it runs) and lets the player climb it. Returns it. */
export function attach(app) {
  const { world, player, hud } = app;
  const hill = new Hill(world).build();
  world.bakeShadows();
  const read = () => { try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch { return 0; } };
  hill.setBest(read());
  let climb = null, saved = false;
  const io = { play: (name, options) => app.audio?.play(name, options), note: (text) => hud.note(text, 2600) };
  const leave = (rang) => {
    if (!climb) return;
    const s = climb;
    climb = null; saved = false;
    app.fair.fov = null;
    hud.setRun(null);
    keysHelp(app).clear();
    s.drop(player, rang);
    if (!rang) hud.note('Climb left.', 2500);
    player.vel.set(0, 0, 0);
    app.rig.snap(player.pos, player.yaw + Math.PI);
  };
  const start = () => {
    if (climb || app.fair.session || player.dead || player.driver) return;
    climb = hill.open(player, io);
    player.driver = climb;
    app.audio?.play('teleport');
    keysHelp(app).set(app.input.isTouch ? `You leave with the ${climb.start.name} start · stick: up the slope, and aside — you step aside faster than you climb: read what comes, and be elsewhere · the arrow jumps (the logs: not the barrels, not the boulders) · four stretches, four colours: quiet at the foot (green), everything at once near the bell (red) — what rolls stops at the line of its colour · what hits you carries you back down`
      : `You leave with the ${climb.start.name} start · W: up the slope · A / D: aside — you step aside faster than you climb: read what comes, and be elsewhere · Space jumps (the logs: not the barrels, not the boulders) · four stretches, four colours: quiet at the foot (green), everything at once near the bell (red) — what rolls stops at the line of its colour · what hits you carries you back down · E: leave · H: these keys again`);
  };
  world.actionSources.push((p) => {
    if (climb) return climb.over ? null : { label: 'Leave the climb', run: () => leave(false) };
    if (!hill.near(p.pos.x, p.pos.z)) return null;
    const next = hill.nextStart();
    return { label: `Play ${HILL.name} — ${next.name} start in ${Math.max(1, Math.ceil(next.wait))} s`, run: start };
  });
  world.zones.push({
    update: (dt, time, camera) => {
      hill.update();
      if (!climb) return;
      if (player.dead || player.driver !== climb) { leave(false); return; }
      app.fair.fov = climb.camera(camera, dt);
      camera.updateMatrixWorld();
      hud.setRun(climb.line);
      if (climb.over && !saved) {
        saved = true;
        const ms = climb.time, best = read();
        if (ms && (!best || ms < best)) { try { localStorage.setItem(KEY, String(ms)); } catch { /* no storage */ } hill.setBest(ms); hud.note(best ? 'Your best climb yet!' : 'A first time on the board.', 5000); }
        if (ms) app.hillDone?.(ms); // (for whoever keeps a board of the best times)
      }
      if (climb.ended) leave(true);
    },
  });
  Object.assign(app, { hill, climbHill: start, leaveHill: leave, hillClimb: () => climb });
  return hill;
}
