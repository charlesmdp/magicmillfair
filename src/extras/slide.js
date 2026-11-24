// The water slide ("Mostly Down") as an extra: it is plugged into the running game from outside, through what
// the game exposes (window.__mmf), so that no file of the game is changed and the game without it is exactly
// the game as it was. See index.js (the switches) and lab/slide/INTEGRATION.md (the board of scores).
import { Slide } from '../world/zones/games/slide/Slide.js';
import { SLIDE } from '../world/zones/games/slide/track.js';
import { botRun } from '../world/zones/games/slide/ride.js';

const KEY = 'mmf.slide.best';

/** Builds the slide in the world of `app` (the game, once it runs) and lets the player ride it. Returns the slide. */
export function attach(app) {
  const { world, player, hud } = app;
  const slide = new Slide(world).build();
  world.bakeShadows(); // (the slide was not there when the shadows of what never moves were drawn)
  const read = () => { try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch { return 0; } };
  const par = [['The careful bot', botRun(slide.course, 'careful').time], ['The bold bot', botRun(slide.course, 'bold').time]];
  slide.setTimes(read(), par);

  let ride = null, saved = false;
  const io = {
    play: (name, options) => app.audio?.play(name, options),
    note: (text) => hud.note(text, 3200),
    go: () => {},
    splash: (x, y, z, strength) => world.ripples?.splash(app.engine.time, x, y, z, strength),
  };
  const leave = (finished) => {
    if (!ride) return;
    const s = ride;
    ride = null; saved = false;
    app.fair.fov = null;
    hud.setRun(null);
    if (finished) s.drop(player); // in the sea where the slide ends, facing the beach: one swims back
    else {
      s.close();
      player.driver = null; player.riding = false;
      player.teleport(slide.gate.x + Math.sin(slide.gate.yaw) * 2.6, slide.gate.z + Math.cos(slide.gate.yaw) * 2.6, slide.gate.yaw);
      hud.note('Ride left.', 2500);
    }
    player.vel.set(0, 0, 0);
    app.rig.snap(player.pos, player.yaw + Math.PI);
  };
  const start = () => {
    if (ride || app.fair.session || player.dead) return;
    ride = slide.open(player, io);
    player.driver = ride;
    app.audio?.play('teleport');
    hud.note(app.input.isTouch ? 'Keep to the water · the stick steers · the arrow jumps · up: lie back, faster · down: brake'
      : 'Keep to the water · A / D or the arrows steer · Space jumps · W or Shift: lie back, faster · S: brake · E: leave', 8000);
  };
  world.actionSources.push((p) => {
    if (ride) return ride.over ? null : { label: 'Leave the slide', run: () => leave(false) };
    return slide.near(p.pos.x, p.pos.z) ? { label: `Ride ${SLIDE.name}`, run: start } : null;
  });
  // every frame, after the game has moved the player and its own camera: the slide's camera, the clock of the
  // screen, what is too far to draw — and the end of a ride
  world.zones.push({
    update: (dt, time, camera) => {
      slide.update(dt, time, camera);
      if (!ride) return;
      if (player.dead || player.driver !== ride) { leave(false); return; }
      app.fair.fov = ride.camera(camera, dt);
      camera.updateMatrixWorld();
      hud.setRun(ride.line);
      if (ride.over && !saved) {
        // the clock has stopped at the end of the trough: the time is kept while the rider flies on into the sea
        saved = true;
        const ms = ride.time, best = read();
        if (ms && (!best || ms < best)) { try { localStorage.setItem(KEY, String(ms)); } catch { /* no storage */ } slide.setTimes(ms); hud.note(best ? 'Your best time yet!' : 'A first time on the board.', 5000); }
        if (ms) app.slideDone?.(ms); // (for whoever keeps a board of the best times)
      }
      if (ride.ended) leave(true);
    },
  });
  Object.assign(app, { slide, rideSlide: start, leaveSlide: leave, slideRide: () => ride });
  return slide;
}
