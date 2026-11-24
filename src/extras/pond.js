// The Endless Pond as an extra: plugged into the running game from outside, through what the game exposes
// (window.__mmf), so that no file of the game is changed and the game without it is exactly the game as it was.
// See index.js (the switches) and lab/INTEGRATION.md (its board of scores).
import { Pond } from '../world/zones/games/pond/Pond.js';
import { POND } from '../world/zones/games/pond/ring.js';
import { formatTime } from '../world/zones/games/course.js';
import { keysHelp } from './help.js';

const KEY = 'mmf.pond.held'; // (how long one held, in ms: the three ponds are scored by time)

/** Builds the circuit on the Great Pond of `app` (the game, once it runs) and lets the player run it. Returns it. */
export function attach(app) {
  const { world, player, hud } = app;
  const pond = new Pond(world).build();
  world.bakeShadows(); // (the circuit was not there when the shadows of what never moves were drawn)
  const read = () => { try { return parseFloat(localStorage.getItem(KEY)) || 0; } catch { return 0; } };
  pond.setBest(read());

  let run = null, saved = false;
  const io = {
    play: (name, options) => app.audio?.play(name, options),
    note: (text) => hud.note(text, 2600),
    splash: (x, y, z, strength) => world.ripples?.splash(app.engine.time, x, y, z, strength),
  };
  const leave = (fell) => {
    if (!run) return;
    const s = run;
    run = null; saved = false;
    app.fair.fov = null;
    hud.setRun(null);
    keysHelp(app).clear();
    if (fell) s.drop(player); // in the pond where they fell: one swims back
    else {
      s.close();
      player.driver = null; player.riding = false;
      player.teleport(pond.gate.x, pond.gate.z, pond.gate.yaw);
      hud.note('Run left.', 2500);
    }
    player.vel.set(0, 0, 0);
    app.rig.snap(player.pos, player.yaw + Math.PI);
  };
  const start = () => {
    if (run || app.fair.session || player.dead || player.driver) return;
    run = pond.open(player, io);
    player.driver = run;
    app.audio?.play('teleport');
    keysHelp(app).set(app.input.isTouch ? 'The legs run by themselves · the arrow jumps (again in the air: further) · stick down: slide, or dive · stick aside: to the next ring, outwards or inwards · three ponds: 15 s, 20 s, then as long as you can'
      : 'The legs run by themselves · Space jumps (again in the air: further) · S: slide, or dive · A / D: to the next ring, outwards or inwards · three ponds: 15 s, 20 s, then as long as you can · E: leave · H: these keys again');
  };
  world.actionSources.push((p) => {
    if (run) return run.over ? null : { label: 'Leave the pond', run: () => leave(false) };
    return pond.near(p.pos.x, p.pos.z) ? { label: `Run ${POND.name}`, run: start } : null;
  });
  // every frame, after the game has moved the player and its own camera
  world.zones.push({
    update: (dt, time, camera) => {
      pond.update();
      if (!run) return;
      if (player.dead || player.driver !== run) { leave(false); return; }
      app.fair.fov = run.camera(camera, dt);
      camera.updateMatrixWorld();
      hud.setRun(run.line);
      if (run.over && !saved) {
        saved = true;
        const ms = run.held, best = read();
        if (ms > best) { try { localStorage.setItem(KEY, String(ms)); } catch { /* no storage */ } pond.setBest(ms); hud.note(best ? `Held ${formatTime(ms)}: your best run yet!` : `Held ${formatTime(ms)} — a first run on the board.`, 5000); }
        app.pondDone?.(ms, run.stage); // (for whoever keeps a board of the best runs: how long one held, in ms, and the pond reached: 0, 1 or 2)
      }
      if (run.ended) leave(true);
    },
  });
  Object.assign(app, { pond, runPond: start, leavePond: leave, pondRun: () => run });
  return pond;
}
