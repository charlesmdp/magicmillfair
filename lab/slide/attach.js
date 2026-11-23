// The lab's way of trying the water slide: it is plugged into the running game from outside, through what the
// game exposes (window.__mmf), so that no file of the game is changed. Once the slide is part of the game
// itself (see INTEGRATION.md) this file is no longer needed.
import { Slide } from '../../src/world/zones/games/slide/Slide.js';
import { SLIDE } from '../../src/world/zones/games/slide/track.js';
import { botRun } from '../../src/world/zones/games/slide/ride.js';

const KEY = 'mmf.slide.best';

/** Builds the slide in the world of `app` (the game, once it runs) and lets the player ride it. Returns the slide. */
export function attachSlide(app) {
  const { world, player, hud } = app;
  const slide = new Slide(world).build();
  world.bakeShadows(); // (the slide was not there when the shadows of what never moves were drawn)
  const read = () => { try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch { return 0; } };
  const par = [['The careful bot', botRun(slide.course, 'careful').time], ['The bold bot', botRun(slide.course, 'bold').time]];
  slide.setTimes(read(), par);

  let ride = null, after = 0;
  const io = {
    play: (name, options) => app.audio?.play(name, options),
    note: (text) => hud.note(text, 3200),
    go: () => {},
  };
  const leave = (finished) => {
    if (!ride) return;
    const s = ride;
    ride = null; after = 0;
    s.close();
    player.driver = null; player.riding = false; player.vel.set(0, 0, 0);
    app.fair.fov = null;
    hud.setRun(null);
    const [x, z, yaw] = finished ? s.exit : [slide.gate.x + Math.sin(slide.gate.yaw) * 2.6, slide.gate.z + Math.cos(slide.gate.yaw) * 2.6, slide.gate.yaw];
    player.teleport(x, z, yaw);
    app.rig.snap(player.pos, yaw + Math.PI);
    if (!finished) hud.note('Ride left.', 2500);
  };
  const start = () => {
    if (ride || app.fair.session || player.dead) return;
    ride = slide.open(player, io);
    player.driver = ride;
    app.audio?.play('teleport');
    hud.note(app.input.touch ? 'The stick steers across the slide · up: lie back, faster · down: brake' : 'A / D or the arrows steer · W or Shift: lie back, faster · S: brake · E: leave', 7000);
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
      if (ride.over) {
        if (after === 0) {
          const ms = ride.time, best = read();
          if (!best || ms < best) { try { localStorage.setItem(KEY, String(ms)); } catch { /* no storage */ } slide.setTimes(ms); hud.note(best ? 'Your best time yet!' : 'A first time on the board.', 5000); }
        }
        if ((after += dt) > 3.6) leave(true);
      }
    },
  });
  Object.assign(app, { slide, rideSlide: start, leaveSlide: leave, slideRide: () => ride });
  return slide;
}

// On the lab page, or when this module is loaded into the running game: wait for the game, then plug in.
const wait = () => {
  const app = window.__mmf;
  if (app && app.ready && app.world && app.player && app.fair) { if (!app.slide) attachSlide(app); } else setTimeout(wait, 120);
};
wait();
