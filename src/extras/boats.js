// Harbor Heaven as an extra: plugged into the running game from outside, through what the game exposes
// (window.__mmf), so that no file of the game is changed and the game without it is exactly the game as it was.
// See index.js (the switches) and lab/INTEGRATION.md (its board of scores).
import { Boats } from '../world/zones/games/boats/Boats.js';
import { REGATTA, THING } from '../world/zones/games/boats/water.js';
import { keysHelp } from './help.js';
import { sharedNow } from '../net/api.js';

const KEY = 'mmf.boats.best';

/** Lays the course on the Great Pond of `app` (the game, once it runs) and lets the player race on it. Returns it. */
export function attach(app) {
  const { world, player, hud } = app;
  const boats = new Boats(world).build();
  // (nothing grows in front of the stand — no water lily, no reed, no iris between whoever steers and the course —,
  // nor on it: the plants of the bank and of the shallows give way there, as at the jetty of The Endless Pond — pond.js)
  const s = boats.stand;
  world.scatter?.keepClear?.(s.x + Math.sin(s.yaw) * 4, s.z + Math.cos(s.yaw) * 4, 10);
  world.bakeShadows(); // (the stand and the buoys were not there when the shadows of what never moves were drawn)
  const read = () => { try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch { return 0; } };
  boats.setBest(read());

  let race = null, saved = false;
  const io = {
    play: (name, options) => app.audio?.play(name, options),
    note: (text) => hud.note(text, 3000),
    splash: (x, y, z, strength) => world.ripples?.splash(app.engine.time, x, y, z, strength),
    // (the starts are on the clock everybody shares; the others are told where one's boat is, and one's place on
    // the visitors' row goes by one's number in the room: two who race together seldom start on the same spot)
    clock: sharedNow,
    slot: () => (app.presence?.id || 3) % 4,
    tell: (kind, run, numbers) => app.presence?.sendThing?.(kind, run, numbers),
  };
  // (what the network says of the others' boats: handed to the regatta, which shows them)
  let heard = null, named = new Set();
  const listen = () => { if (app.presence && heard !== app.presence) { heard = app.presence; heard.on('thing', (e) => { if (e.kind === THING) boats.heard(e.id, e.run, e.d); }); } };
  const leave = (finished) => {
    if (!race) return;
    const s = race;
    race = null; saved = false;
    app.fair.fov = null;
    hud.setRun(null);
    s.drop(player);
    keysHelp(app).clear();
    if (!finished) hud.note('Race left.', 2500);
    player.vel.set(0, 0, 0);
    app.rig.snap(player.pos, player.yaw + Math.PI);
  };
  const start = () => {
    if (race || app.fair.session || player.dead || player.driver) return;
    race = boats.open(player, io);
    player.driver = race;
    app.audio?.play('teleport');
    keysHelp(app).set(app.input.isTouch ? 'A start every ten seconds, each with its name: friends who take the same one race together · your boat is the red one · stick up: ahead · stick aside: the helm · the arrow: a burst of speed (the gauge says how much is left) · between the buoys, red to port'
      : 'A start every ten seconds, each with its name: friends who take the same one race together · your boat is the red one · W: ahead, S: astern · A / D: the helm · Space: a burst of speed (the gauge says how much is left) · between the buoys · E: leave · H: these keys again');
  };
  world.actionSources.push((p) => {
    if (race) return race.over ? null : { label: 'Leave the race', run: () => leave(false) };
    return boats.near(p.pos.x, p.pos.z) ? { label: `Race ${REGATTA.name}`, run: start } : null;
  });
  // every frame, after the game has moved the player and its own camera
  world.zones.push({
    update: (dt, time, camera) => {
      listen();
      // (the names: over the boats, not over the robots that steer them from the bank — one's eye is on the water.
      // Who races with another start, whose boat is not shown to one who races, has no name meanwhile)
      const peers = app.presence?.peers, now = new Set();
      if (peers) {
        for (const [id, g] of boats.guests) {
          const p = peers.get(id);
          if (!p) continue;
          now.add(p);
          if (g.hull.visible) { const at = (p.tagAt ||= { x: 0, y: 0, z: 0 }); at.x = g.hull.position.x; at.y = g.hull.position.y + 1.15; at.z = g.hull.position.z; p.tagOff = false; } else { p.tagAt = null; p.tagOff = !!race; }
        }
        for (const p of named) if (!now.has(p)) { p.tagAt = null; p.tagOff = false; }
        named = now;
      }
      if (!race) { boats.update(dt, null); return; } // (from the bank one sees whoever is racing)
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
