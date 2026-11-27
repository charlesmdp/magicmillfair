// What the seven games with a gate share to build themselves — Big Tsunami, No Touch Lava!, Bee Fly, Head
// Over Heels, Spiral of Death, Karting Simulator, Balthazar Golf: the arch one asks to play under, a small
// sign on a stake, the clock everybody shares and the starts counted on it. Each of them has a folder of its own
// here, and three files elsewhere:
//
//   <id>/rules.js            its rules, without a renderer: the game, its checks and the player that plays by itself read them
//   <id>/<Name>.js           what is seen of it and how it is played: a class with the shape src/extras/plug.js says
//   src/extras/<id>.js       attach(app): builds it in the running game and plugs it in (its switch: RELEASE in src/app/config.js)
//   tools/<id>-test.mjs      its checks, without a browser: node tools/<id>-test.mjs
import * as THREE from 'three';
import { canvasBoard } from './Boards.js';
import { sharedNow } from '../../../net/api.js';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/**
 * The clock everybody shares (ms): what moves by itself, and the starts, are counted on it. It is the server's
 * (net/api.js) — not this device's, which may be seconds from another's: two visitors would then see two seas.
 */
export const worldClock = sharedNow;

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
