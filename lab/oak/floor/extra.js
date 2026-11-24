// Out on a Limb, tried again — one floor of it, plugged into the running game from outside like the extras of the
// game (src/extras), but kept in the lab: it is a trial, for its owner to say whether climbing is a pleasure now.
import { Floor } from './Floor.js';
import { LIMB } from './limb.js';
import { keysHelp } from '../../../src/extras/help.js';

const KEY = 'mmf.limb.best';

export function attach(app) {
  const { world, player, hud } = app;
  const floor = new Floor(world).build();
  world.bakeShadows();
  const read = () => { try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch { return 0; } };
  floor.setBest(read());
  let climb = null, saved = false;
  const io = { play: (name, options) => app.audio?.play(name, options), note: (text) => text && hud.note(text, 3000) };
  const leave = (rang) => {
    if (!climb) return;
    const s = climb;
    climb = null; saved = false;
    app.fair.fov = null;
    hud.setRun(null);
    s.drop(player);
    keysHelp(app).clear();
    if (!rang) hud.note('Climb left.', 2500);
    player.vel.set(0, 0, 0);
    app.rig.snap(player.pos, player.yaw + Math.PI);
  };
  const start = () => {
    if (climb || app.fair.session || player.dead || player.driver) return;
    climb = floor.open(player, io);
    player.driver = climb;
    app.audio?.play('teleport');
    keysHelp(app).set(app.input.isTouch ? 'On a limb you cannot fall: push along it · the arrow jumps · the green ring is where a jump would end · in the air you still steer'
      : 'On a limb you cannot fall: D (or W) goes along it · Space jumps · the green ring is where a jump would end · in the air you still steer · E: leave · H: these keys again');
  };
  world.actionSources.push((p) => {
    if (climb) return climb.over ? null : { label: 'Leave the climb', run: () => leave(false) };
    return floor.near(p.pos.x, p.pos.z) ? { label: `Climb ${LIMB.name}`, run: start } : null;
  });
  world.zones.push({
    update: (dt, time, camera) => {
      if (!climb) return;
      if (player.dead || player.driver !== climb) { leave(false); return; }
      app.fair.fov = climb.camera(camera, dt);
      camera.updateMatrixWorld();
      hud.setRun(climb.line);
      if (climb.over && !saved) {
        saved = true;
        const ms = climb.time, best = read();
        if (ms && (!best || ms < best)) { try { localStorage.setItem(KEY, String(ms)); } catch { /* no storage */ } floor.setBest(ms); }
      }
      if (climb.ended) leave(true);
    },
  });
  Object.assign(app, { limb: floor, climbLimb: start, leaveLimb: leave, limbClimb: () => climb });
  return floor;
}
