// What plugs one of the games with a gate into the running game — Big Tsunami, No Touch Lava!, Bee Fly, Head
// Over Heels, Spiral of Death, Karting Simulator, Balthazar Golf (src/world/zones/games/<id>: see gates.js
// there). Each is an extra behind a switch of its own (index.js; RELEASE in src/app/config.js): nothing of it is
// loaded while its switch is off, and the game without it is the game as it was.
//
// What a game is, for `plug` (the shape of Hill.js, of Hollow.js…):
//
//   game.build()               → itself; adds one group, named after its id, to world.scene
//   game.gate                  { x, y, z, yaw }: where one asks to play, on ground that can be walked
//   game.near(x, z)            is one close enough to ask?
//   game.update(dt, time, cam) every frame, played or not (what goes by the clock of the world)
//   game.setBest(score)        one's own best, for a board of the game's own if it has one
//   game.open(player, io)      → a session, the driver of the player (see PlayerController.driver):
//       step(dt, player, control)   moves the player
//       camera(camera, dt)          places the camera; returns its field of view (degrees)
//       line                        the line of the run (the HUD shows it)
//       over, score                 the score is known (ms): it is told and kept, once
//       ended                       the session is finished: the player is let go (drop)
//       auto                        set to true: it plays by itself (the checks do)
//       state                       its state, as the rules keep it
//       anim, riding: false         how the avatar holds itself
//       drop(player, done)          lets the player go, where one should be then; close()
//       instance (optional)         which run of the game this is, when not `start.n`: those who share it see each other
//       tell() (optional)           → up to six numbers the others are told with it, a few times a second
//   io: { play(name, options), note(text, ms), splash(x, y, z, strength), peers() (the other visitors in sight),
//         mates() (those of them who share one's run: [{ id, peer, run, d }]), live() (the run most play now) }
//   game.crowd (given by plug): { of(), live(), watch(run) } — who plays the game now, for what it shows to who only watches
//
// Its board of scores is the game's to keep, as for every extra that is a game (main.js: LAB_GAMES, LAB_BOARD —
// the stand by the gate, its sponsor's panel, the star on the map; server/scores.js: what a score is). The stand
// is put to the right of the gate unless the game says where: game.boardSpot = { x, z, yaw (the way its face
// looks) }; the board of its five sponsors, beside it on the side away from the gate, unless the game says where:
// game.rollSpot = { x, z }. What `plug` gives the game for it: app.<id>Run() — the run that is on, or null — and, when a run is
// over, app.<id>Done(score, state).
import { keysHelp } from './help.js';
import { TUNES, tunePlayer } from './tunes.js';
import { mates } from './mates.js';

/**
 * Plugs a game into the running game: the action at its gate, the session while it is played, the line of the
 * run, its keys, its music, one's own best (kept in the browser).
 *   o.id      its id (its switch, the name of its group, its board)
 *   o.label   (game) → what the action at the gate says
 *   o.keys    (touch, session) → its keys, " · " between them (see help.js)
 *   o.more    true: the higher score is the better one (a time one held); else the lower (a time one took)
 *   o.leave, o.left   what the action says while one plays, and the note when one has left
 *   o.rules   its rules (the module): its music reads from them how far a run has come (tunes.js)
 */
export function plug(app, game, o) {
  const { world, player, hud } = app, KEY = `mmf.${o.id}.best`;
  const read = () => { try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch { return 0; } };
  game.setBest?.(read());
  let run = null, saved = false, told = false, eye = null, withNow = '';
  // who plays this game now, and who shares one's own run of it (mates.js): only those are shown while one plays
  const crowd = mates(app);
  /** Which run of the game a session is: a start, a round — 0 when the game is one place for everybody. */
  const instanceOf = (s) => (Number.isFinite(s.instance) ? s.instance : Number.isFinite(s.start?.n) ? s.start.n : 0);
  const tune = TUNES[o.id] ? tunePlayer(app) : null; // its music while a run is on (tunes.js)
  const io = {
    play: (name, options) => app.audio?.play(name, options),
    note: (text, ms = 2600) => hud.note(text, ms),
    splash: (x, y, z, strength = 1) => world.ripples?.splash(app.engine.time, x, y, z, strength),
    // the other visitors one sees, where the game shows them at this moment: [{ id, name, x, y, z, yaw }] — a game
    // in which players get in each other's way reads them (what the network carries: a tenth of a second late)
    peers: () => { const list = []; if (app.presence) for (const p of app.presence.peers.values()) if (p.visible && !p.far && !p.hidden) list.push(p); return list; },
    // those of them who share one's run of this game — the same start, the same round: [{ id, peer, run, d }]
    // (`d`: the numbers their own session tells, see `tell` below); `all`: whoever plays this game, in any run
    mates: (all = false) => crowd.of(o.id).filter((m) => (all || m.mine) && m.peer.visible && !m.peer.far),
    // the run most of those who play now are in — to join them rather than leave alone: { run, n, d } or null
    live: () => crowd.live(o.id),
  };
  const leave = (done) => {
    if (!run) return;
    const s = run;
    run = null; saved = false; withNow = '';
    crowd.quiet();
    tune?.stop();
    app.fair.fov = null;
    hud.setRun(null);
    keysHelp(app).clear();
    s.drop(player, !!done);
    // (a game may have turned the camera about its own axis — a view from straight above does —: it is given back upright)
    if (eye) { eye.up.set(0, 1, 0); eye.updateMatrixWorld(); }
    if (!done) hud.note(o.left || 'Game left.', 2500);
    player.vel.set(0, 0, 0);
    app.rig.snap(player.pos, player.yaw + Math.PI);
  };
  const start = () => {
    if (run || app.fair.session || player.dead || player.driver) return null;
    run = game.open(player, io);
    player.driver = run;
    app.audio?.play('teleport');
    tune?.play(o.id, run, o.rules);
    keysHelp(app).set(o.keys(!!app.input.isTouch, run));
    // (the keys are said in full the first time one plays; after that they would only hide what comes, try after
    // try: the panel is shut again at once — its small button and the H key still show them)
    if (told) document.querySelector('button[title="Show the keys of this game again"]')?.click();
    told = true;
    return run;
  };
  // (asked before the world's own actions: at its gate and while it is played, the game is what the E key means —
  // not the flower one happens to stand by)
  world.actionSources.unshift((p) => {
    if (run) return run.over ? null : { label: o.leave || 'Leave the game', run: () => leave(false) };
    return game.near(p.pos.x, p.pos.z) ? { label: o.label(game), run: start } : null;
  });
  // every frame, after the game has moved the player and its own camera
  world.zones.push({
    update: (dt, time, camera) => {
      game.update?.(dt, time, camera);
      if (!run) return;
      if (player.dead || player.driver !== run) { leave(false); return; }
      eye = camera;
      app.fair.fov = run.camera(camera, dt);
      camera.updateMatrixWorld();
      // (the others are told which run this is, a few times a second — and what the session says of itself:
      // session.tell() → up to six numbers; the line of the run says who shares it)
      crowd.say(o.id, instanceOf(run), run.tell?.() || []);
      const names = crowd.names(o.id), w = names.length ? ` · with ${names.length > 2 ? `${names.length} others` : names.join(' and ')}` : '';
      if (w !== withNow) { if (w && !withNow) hud.note(`${names.join(', ')} ${names.length > 1 ? 'play' : 'plays'} with you.`, 2600); withNow = w; }
      hud.setRun(run.line ? run.line + w : run.line);
      tune?.tick();
      if (run.over && !saved) {
        saved = true;
        const score = Math.round(run.score || 0), best = read();
        if (score && (!best || (o.more ? score > best : score < best))) { try { localStorage.setItem(KEY, String(score)); } catch { /* no storage */ } game.setBest?.(score); }
        if (score) app[`${o.id}Done`]?.(score, run.state); // (for whoever keeps the board of the game)
      }
      if (run.ended) leave(true);
    },
  });
  // (what the game asks, to know that a run is on — and what the checks play it with)
  app[`${o.id}Run`] = () => run;
  (app.labGames ||= {})[o.id] = { game, start, leave, run: () => run };
  // (the game may ask who plays it even while nobody here does: to show those who only watch the run that is on)
  game.crowd = { of: () => crowd.of(o.id), live: () => crowd.live(o.id), watch: (n) => crowd.watch(o.id, n) };
  return game;
}
