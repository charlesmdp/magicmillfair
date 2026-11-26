// Bouncy Rock as an extra: plugged into the running game from outside, through what the game exposes
// (window.__mmf), so that no file of the game is changed and the game without it is exactly the game as it was.
// See index.js (the switches) and lab/INTEGRATION.md (its board of scores).
import { Cleft } from '../world/zones/games/crack/Cleft.js';
import { CLEFT } from '../world/zones/games/crack/cleft.js';
import { keysHelp } from './help.js';

const KEY = 'mmf.crack.best';

/** Builds the cleft in the sea cliff of `app` (the game, once it runs) and lets the player climb it. Returns it. */
export function attach(app) {
  const { world, player, hud } = app;
  const rock = new Cleft(world).build();
  world.bakeShadows();
  const read = () => { try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch { return 0; } };
  rock.setBest(read());
  let climb = null, saved = false;
  const io = { play: (name, options) => app.audio?.play(name, options), note: (text) => hud.note(text, 2800) };
  const leave = (rang) => {
    if (!climb) return;
    const s = climb;
    climb = null; saved = false;
    app.fair.fov = null;
    hud.setRun(null);
    keysHelp(app).clear();
    s.drop(player);
    if (!rang) hud.note('Climb left.', 2500);
    player.vel.set(0, 0, 0);
    app.rig.snap(player.pos, player.yaw + Math.PI);
  };
  const start = () => {
    if (climb || app.fair.session || player.dead || player.driver) return;
    climb = rock.open(player, io);
    player.driver = climb;
    app.audio?.play('teleport');
    keysHelp(app).set(app.input.isTouch ? 'Walk to a wall and jump: you hold it by yourself · the arrow again: a kick across to the other wall, and up · kick the moment you touch — a sharp kick goes higher, and they add up · the stick steers in the air; down lets go · near the top, stones come down the wall with the red mark: be on the other one'
      : 'Walk to a wall (A / D) and jump (Space): you hold it by yourself · Space again: a kick across to the other wall, and up · kick the moment you touch — a sharp kick goes higher, and they add up · A / D steer in the air; S lets go · near the top, stones come down the wall with the red mark: be on the other one · E: leave · H: these keys again');
  };
  world.actionSources.push((p) => {
    if (climb) return climb.over ? null : { label: 'Leave the climb', run: () => leave(false) };
    if (!rock.near(p.pos.x, p.pos.z, p.pos.y)) return null;
    return { label: `Climb ${CLEFT.name}`, run: start };
  });
  world.zones.push({
    update: (dt, time, camera) => {
      rock.update(time);
      if (!climb) return;
      if (player.dead || player.driver !== climb) { leave(false); return; }
      app.fair.fov = climb.camera(camera, dt);
      camera.updateMatrixWorld();
      hud.setRun(climb.line);
      if (climb.over && !saved) {
        saved = true;
        const ms = climb.time, best = read();
        if (ms && (!best || ms < best)) { try { localStorage.setItem(KEY, String(ms)); } catch { /* no storage */ } rock.setBest(ms); hud.note(best ? 'Your best climb yet!' : 'A first time on the board.', 5000); }
        if (ms) app.crackDone?.(ms); // (for whoever keeps a board of the best times)
      }
      if (climb.ended) leave(true);
    },
  });
  Object.assign(app, { cleft: rock, climbCleft: start, leaveCleft: leave, cleftClimb: () => climb });
  return rock;
}
