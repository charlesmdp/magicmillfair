// What the five games of this folder share. They are trials: tried on the lab page only (lab/lab.js), nothing
// of them is part of the game. Each has a folder of its own:
//
//   rules.js   its rules, without a renderer: the game, its checks and the player that plays by itself read them
//   <Name>.js  what is seen of it and how it is played: a class with the shape below
//   extra.js   attach(app): builds it in the running game and plugs it in with `plug`, below
//   test.mjs   its checks, without a browser: node lab/games/<id>/test.mjs
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
//   io: { play(name, options), note(text, ms), splash(x, y, z, strength) }
import * as THREE from 'three';
import { canvasBoard } from '../../src/world/zones/games/Boards.js';
import { keysHelp } from '../../src/extras/help.js';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** The clock everybody shares (ms): what moves by itself, and the starts, are counted on it. */
export const worldClock = () => performance.timeOrigin + performance.now();

/**
 * Plugs a game into the running game: the action at its gate, the session while it is played, the line of the
 * run, its keys, one's own best (kept in the browser) and the score told to whoever keeps a board
 * (`app.<id>Done?.(score, state)`).
 *   o.id      its id (the switch of the lab, the name of its group)
 *   o.label   (game) → what the action at the gate says
 *   o.keys    (touch, session) → its keys, " · " between them (see src/extras/help.js)
 *   o.more    true: the higher score is the better one (a time one held); else the lower (a time one took)
 *   o.leave, o.left   what the action says while one plays, and the note when one has left
 *   o.format  (score) → how it is written in the note of a best score
 */
export function plug(app, game, o) {
  const { world, player, hud } = app, KEY = `mmf.${o.id}.best`;
  const read = () => { try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch { return 0; } };
  game.setBest?.(read());
  let run = null, saved = false, told = false;
  const io = {
    play: (name, options) => app.audio?.play(name, options),
    note: (text, ms = 2600) => hud.note(text, ms),
    splash: (x, y, z, strength = 1) => world.ripples?.splash(app.engine.time, x, y, z, strength),
  };
  const leave = (done) => {
    if (!run) return;
    const s = run;
    run = null; saved = false;
    app.fair.fov = null;
    hud.setRun(null);
    keysHelp(app).clear();
    s.drop(player, !!done);
    if (!done) hud.note(o.left || 'Game left.', 2500);
    player.vel.set(0, 0, 0);
    app.rig.snap(player.pos, player.yaw + Math.PI);
  };
  const start = () => {
    if (run || app.fair.session || player.dead || player.driver) return null;
    run = game.open(player, io);
    player.driver = run;
    app.audio?.play('teleport');
    keysHelp(app).set(o.keys(!!app.input.isTouch, run));
    // (the keys are said in full the first time one plays; after that they would only hide what comes, try after
    // try: the panel is shut again at once — its small button and the H key still show them)
    if (told) document.querySelector('button[title="Show the keys of this game again"]')?.click();
    told = true;
    return run;
  };
  world.actionSources.push((p) => {
    if (run) return run.over ? null : { label: o.leave || 'Leave the game', run: () => leave(false) };
    return game.near(p.pos.x, p.pos.z) ? { label: o.label(game), run: start } : null;
  });
  // every frame, after the game has moved the player and its own camera
  world.zones.push({
    update: (dt, time, camera) => {
      game.update?.(dt, time, camera);
      if (!run) return;
      if (player.dead || player.driver !== run) { leave(false); return; }
      app.fair.fov = run.camera(camera, dt);
      camera.updateMatrixWorld();
      hud.setRun(run.line);
      if (run.over && !saved) {
        saved = true;
        const score = Math.round(run.score || 0), best = read();
        if (score && (!best || (o.more ? score > best : score < best))) {
          try { localStorage.setItem(KEY, String(score)); } catch { /* no storage */ }
          game.setBest?.(score);
          hud.note(`${o.format ? `${o.format(score)} — ` : ''}${best ? 'your best yet!' : 'a first score of your own.'}`, 5000);
        }
        if (score) app[`${o.id}Done`]?.(score, run.state); // (for whoever keeps a board of the best scores)
      }
      if (run.ended) leave(true);
    },
  });
  (app.labGames ||= {})[o.id] = { game, start, leave, run: () => run };
  return game;
}

/** The start one who asks at `now` (ms of the shared clock) leaves with: { n, name, at (ms), wait (s) } — the first far enough ahead. */
export function nextStart(now, every, names, least = 3) {
  const ms = every * 1000, n = Math.ceil((now + least * 1000) / ms);
  return { n, name: names[((n % names.length) + names.length) % names.length], at: n * ms, wait: (n * ms - now) / 1000 };
}
export const STARTS = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange'];

const CREAM = [1.3, 1.17, 0.9];
/**
 * An arch where one asks to play: two striped posts and a board that says the name of the game (read from both
 * sides). (x, z): its middle, on the ground at height `y`; `yaw`: the way one goes through it (0 looks south).
 * `paint`: a builder of the material 'paint' (Parts.get('paint')); the board is added to `group`.
 */
export function gateArch(group, paint, x, y, z, yaw, title, sub = '', { tone = [0.95, 0.1, 0.12], width = 3.4, height = 3.2, ink = '#3a1410' } = {}) {
  const rx = -Math.cos(yaw), rz = Math.sin(yaw), top = y + height;
  for (const side of [-1, 1]) {
    const px = x + rx * side * width / 2, pz = z + rz * side * width / 2;
    for (let h = y - 0.4, k = 0; h < top; h += 0.55, k++) paint.tint(...(k % 2 ? CREAM : tone), 1).cylinder(px, h, pz, 0.11, 0.11, Math.min(0.55, top - h), 8);
    paint.tint(1.5, 1.05, 0.2, 1).place(px, top, pz).lathe([[0.001, 0.26], [0.1, 0.22], [0.14, 0.12], [0.1, 0.02], [0.001, 0]], 8).pop();
  }
  const board = canvasBoard(1024, 160, (ctx, w, h) => {
    ctx.fillStyle = ink; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 7; ctx.strokeRect(7, 7, w - 14, h - 14);
    ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // (the board runs behind the two posts: what is written keeps between them)
    const room = w * (width - 0.5) / (width + 0.5);
    ctx.font = "700 76px Georgia, 'Times New Roman', serif"; ctx.fillText(title, w / 2, sub ? 62 : 84, room);
    if (sub) { ctx.fillStyle = '#f2c14e'; ctx.font = '600 30px system-ui, sans-serif'; ctx.fillText(sub, w / 2, 124, room); }
  }, width + 0.5, (width + 0.5) * 0.15625, { both: true });
  board.mesh.position.set(x, top - 0.42, z); board.mesh.rotation.y = yaw; board.mesh.name = 'gate-board';
  group.add(board.mesh);
  return board;
}

/** A small flat sign on a stake (a distance, a warning): added to `group`; returns its board. */
export function stakeSign(group, wood, x, y, z, yaw, text, { w = 1.1, h = 0.42, up = 1.5, back = '#12122e', ink = '#f6e7b8' } = {}) {
  wood.tint(0.9, 0.85, 0.8, 1).cylinder(x, y - 0.4, z, 0.05, 0.045, up + 0.4, 6);
  const board = canvasBoard(256, 96, (ctx, cw, ch) => {
    ctx.fillStyle = back; ctx.fillRect(0, 0, cw, ch); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 5; ctx.strokeRect(5, 5, cw - 10, ch - 10);
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 46px system-ui, sans-serif'; ctx.fillText(text, cw / 2, ch / 2 + 2, cw * 0.88);
  }, w, h, { both: true });
  board.mesh.position.set(x, y + up, z); board.mesh.rotation.y = yaw; board.mesh.name = 'stake-sign';
  group.add(board.mesh);
  return board;
}
