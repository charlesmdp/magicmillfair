// Diving, as an extra (its switch: `dive` in RELEASE, src/app/config.js — off as it is delivered; with it off
// nothing of it is loaded, built or drawn). Where the water is deep a swimmer can go under — the prompt says
// "Dive" (E, or a tap) — and swims freely in three dimensions: forward is where the camera looks, down and up
// with it; Space and C go straight up and down; coming up to the surface, where there is air over it, gives the
// ordinary swimming back. Under the water it looks like under the water, and somewhere under the bay there is a
// cave to find: the Diver's Rest (src/world/zones/places/deep/: plan.js is its rock, Deep.js what is seen).
//
// Plugged in from outside (window.__mmf): no file of the game is changed. What it borrows from the running game:
//   player.driver        the diver is driven, as in the games (PlayerController._driven): the others see a swimmer
//                        at their true depth — the game's own message of where one is carries it;
//   interact.update      wrapped, to offer "Dive" to a swimmer (the game offers its actions to walkers only);
//   rig.update           wrapped: the camera follows the diver under the water (the game's keeps over it), and near
//                        the rock no camera — a walker's, a swimmer's — ever looks through it;
//   ripples.trail        wrapped: no rings on the water over a visitor who swims deep under it;
//   the open sea stays the shark's: one cannot go under within its reach, nor dive into it.
import * as THREE from 'three';
import { ANIM } from '../player/Character.js';
import { SHARK } from '../world/layout/layout.js';
import { Deep, HELMET } from '../world/zones/places/deep/Deep.js';
import { DEEP, WAY, toLocal, toWorld, solid, away, airOver, inChamber } from '../world/zones/places/deep/plan.js';
import { keysHelp } from './help.js';

const DEPTH = 3; // m of water it takes to go under
const SWIM = 3.3, FAST = 5.6; // m/s under the water; with Shift
const BODY = 0.9; // the middle of a diver over their feet (player.pos), and …
const ROOM = 0.55; // … how much room it takes: the rock is kept that far
const FLOAT = 1.05; // how far under the surface the feet of a swimmer are (PlayerController)
const FOUND = 'mmf.dive.found';
const CA = Math.cos(DEEP.yaw), SA = Math.sin(DEEP.yaw);
const ZERO = { x: 0, y: 0 };

export async function attach(app) {
  const { world, player, hud, input, rig } = app, data = world.data, col = world.collision;
  const place = await new Deep(world).build();
  place.show(false, false, 0);
  world.bakeShadows(); // (the rock shades the sea round it, and its own inside)
  const [cx, cz] = [DEEP.at.x, DEEP.at.z];
  const vel = new THREE.Vector3(), n = { u: 0, y: 0, w: 0 }, q = { x: 0, z: 0 }, _p = new THREE.Vector3();
  const waterAt = (x, z) => { const w = data.waterAt(x, z); return w > -500 ? w : null; };
  const far = (x, z) => Math.hypot(x - cx, z - cz); // m from the middle of the rock, on the plan
  /** The rock at a point of the world: metres to its face (negative inside it) — a large number far from it. */
  const rock = (x, y, z) => { if (far(x, z) > DEEP.r + 3) return 99; const [u, w] = toLocal(x, z); return solid(u, y, w); };
  const games = world.games;
  /** Is (x, z) in the water of the shark — or so near that it could come? */
  const sharky = (x, z) => !!games.seaEdges?.length && games.seaEdgeDistance(x, z) < SHARK.far;
  let found = false;
  try { found = localStorage.getItem(FOUND) === '1'; } catch { /* no storage */ }

  // ---------------------------------------------------------------------------------------------- the diver
  let dive = null, told = false, trail = 0;
  /** The driver of the player while they are under (PlayerController.driver). */
  const session = () => ({
    riding: false, anim: ANIM.swim, t: 0, up: false, done: false, air: 0, warned: -9,
    step(dt, pl, control) {
      const s = this, pos = pl.pos, level = waterAt(pos.x, pos.z);
      s.t += dt;
      if (level === null) { s.done = true; return; } // (put somewhere dry meanwhile)
      // what is asked: forward is where the camera looks, down and up with it; Space and C straight up and down
      const mv = control ? input.move : ZERO, cp = Math.cos(rig.pitch), sy = Math.sin(rig.yaw), cy = Math.cos(rig.yaw);
      let wx = -sy * cp * mv.y + cy * mv.x, wy = Math.sin(rig.pitch) * mv.y + (control ? input.rise : 0), wz = -cy * cp * mv.y - sy * mv.x;
      if (s.up) { if (mv.x || mv.y || (control && input.rise < 0)) s.up = false; else wy = 1; } // ("back up": straight up, until one swims again)
      const l = Math.hypot(wx, wy, wz), top = control && input.run !== pl.autoRun ? FAST : SWIM, k = 1 - Math.exp(-dt * 4);
      if (l > 1) { wx /= l; wy /= l; wz /= l; }
      vel.x += (wx * top - vel.x) * k; vel.y += (wy * top - vel.y) * k; vel.z += (wz * top - vel.z) * k;
      if (control && input.jump && input.isTouch) vel.y = Math.max(vel.y, 0) + 2.4; // (a phone has no key to hold: its arrow kicks one up)
      const steps = Math.max(1, Math.ceil((vel.length() * dt) / 0.2));
      for (let i = 0; i < steps; i++) {
        pos.x += (vel.x * dt) / steps; pos.y += (vel.y * dt) / steps; pos.z += (vel.z * dt) / steps;
        // what stops a swimmer stops a diver: what stands in the water, the edge of the sea — and the shark's water
        q.x = pos.x; q.z = pos.z;
        col.resolve(q, 0.38, pos.y); col.confine(q);
        if (sharky(q.x, q.z)) { const e = games._nearestEdge(q.x, q.z), d = e.d || 1; q.x = e.x + ((q.x - e.x) / d) * SHARK.far; q.z = e.z + ((q.z - e.z) / d) * SHARK.far; if (s.t - s.warned > 6) { s.warned = s.t; hud.note('The open sea is the shark\'s. Not that way.', 3200); } }
        pos.x = q.x; pos.z = q.z;
        // the rock, kept at arm's length whichever way it faces: its walls, its roofs, the floor of its pool
        if (far(pos.x, pos.z) < DEEP.r + 1) for (let pass = 0; pass < 2; pass++) {
          const [u, w] = toLocal(pos.x, pos.z), d = solid(u, pos.y + BODY, w);
          if (d >= ROOM) break;
          away(u, pos.y + BODY, w, n);
          const dx = n.u * CA - n.w * SA, dz = n.u * SA + n.w * CA, into = vel.x * dx + vel.y * n.y + vel.z * dz;
          pos.x += dx * (ROOM - d); pos.y += n.y * (ROOM - d); pos.z += dz * (ROOM - d);
          if (into < 0) { vel.x -= dx * into; vel.y -= n.y * into; vel.z -= dz * into; }
        }
        // the bed under, the surface over: reached where there is air over it, the dive is over
        const bed = data.heightAt(pos.x, pos.z) + 0.5 - BODY, lid = (waterAt(pos.x, pos.z) ?? level) - FLOAT;
        if (pos.y < bed) { pos.y = bed; if (vel.y < 0) vel.y = 0; }
        if (pos.y >= lid) {
          pos.y = lid; if (vel.y > 0) vel.y = 0;
          const [u, w] = toLocal(pos.x, pos.z);
          if (s.t > 0.7 && airOver(u, pos.y + BODY, w)) { s.done = true; break; }
        }
      }
      // the body points where it goes — head first on the way down —, and turns to the way it swims
      const h = Math.hypot(vel.x, vel.z), sp = vel.length();
      if (h > 0.4) { const d = Math.atan2(vel.x, vel.z) - pl.yaw; pl.yaw += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, dt * 8); }
      pl.pitch += ((sp > 0.3 ? Math.atan2(-vel.y, Math.max(h, 0.8)) * 0.85 : 0) - pl.pitch) * Math.min(1, dt * 5);
      pl.speed = sp; pl.grounded = false;
      for (s.air += dt * (1.2 + sp * 2); s.air > 1; s.air--) place.bubble(pos.x + Math.sin(pl.yaw) * 0.5, pos.y + 1.2, pos.z + Math.cos(pl.yaw) * 0.5, level, 1, 0.3);
    },
  });
  /** May one go under here? In water deep enough, swimming, out of the shark's reach. */
  const canDive = () => {
    if (!player.swimming || player.driver || player.dead || player.seat || app.fair?.session || player._plunge > 0) return false;
    const { x, z } = player.pos, level = waterAt(x, z);
    return level !== null && level - data.heightAt(x, z) >= DEPTH && !sharky(x, z);
  };
  /** Under one goes. */
  const go = () => {
    if (dive || !canDive()) return false;
    dive = session();
    vel.set(player.vel.x * 0.6, -2.8, player.vel.z * 0.6);
    player.driver = dive;
    if (app.kit) { trail = app.kit.trail; app.kit.trail = 0; } // (a trail of sparks is of the air)
    const p = player.pos;
    world.ripples?.splash(app.engine.time, p.x, waterAt(p.x, p.z) ?? 0, p.z, 3);
    app.audio?.play('dive', { volume: 0.55 });
    place.bubble(p.x, p.y + 0.6, p.z, (waterAt(p.x, p.z) ?? 0), 14, 0.9, 0.1);
    keysHelp(app).set(input.isTouch
      ? 'The stick swims where you look: look down to go down · the arrow kicks you up · "Back up" brings you to the surface'
      : 'W: swim where you look — look down to go down · S, A, D: back, sideways · Space: up · C: down · Shift: faster · E: straight back up to the surface · H: these keys again');
    if (told) document.querySelector('button[title="Show the keys of this game again"]')?.click(); // (said in full once: see plug.js)
    told = true;
    return true;
  };
  /** The dive is over: the player is given back to the game — a swimmer at the surface, as before. */
  const rise = () => {
    if (!dive) return;
    const mine = player.driver === dive;
    dive = null;
    if (app.kit && app.kit.trail === 0) app.kit.trail = trail;
    keysHelp(app).clear();
    player.pitch = 0;
    if (!mine) return; // (something else has the player now: it is theirs)
    player.driver = null;
    player.vel.set(vel.x, 0, vel.z);
    const p = player.pos, level = waterAt(p.x, p.z);
    if (level !== null) { world.ripples?.splash(app.engine.time, p.x, level, p.z, 1.6); app.audio?.play('splash', { volume: 0.35 }); }
  };

  // "Dive" for a swimmer, "Back up" for a diver: the first thing the E key — or a tap — does there
  const interact = app.interact, offer = interact.update.bind(interact);
  interact.update = (active) => {
    offer(active);
    if (!active) return;
    let a = null;
    if (dive) { const p = player.pos, [u, w] = toLocal(p.x, p.z); if (!dive.up && airOver(u, p.y + BODY, w)) a = { label: 'Back up to the surface', run: () => { if (dive) dive.up = true; } }; }
    else if (canDive()) a = { label: 'Dive', run: go };
    if (!a) return;
    interact.actions.unshift(a);
    hud.setPrompt(0, a.label); hud.setPrompt(1, interact.actions[1]?.label || null);
  };
  // on the strand: the helmet has a word to say, as the relics of the world before do (it is not one of the thirty)
  const [hx, hz] = toWorld(place.helmet.u, place.helmet.w);
  world.actionSources.unshift((p) => ((p.pos.x - hx) ** 2 + (p.pos.z - hz) ** 2 < 2.2 * 2.2 && Math.abs(p.pos.y - place.helmet.y) < 1.5 ? { label: `Look at ${HELMET.label}`, run: () => { hud.note(HELMET.text, 14000); app.audio?.play('tick'); } } : null));

  // ---------------------------------------------------------------------------------------------- the camera
  // How far an eye can stand back from `f` the way (dx, dy, dz) without the rock or the bed between: up to `want`.
  const clear = (f, dx, dy, dz, want) => {
    let ok = 0.25;
    for (let t = Math.min(want, 0.5); ; t = Math.min(want, t + 0.3)) {
      const x = f.x + dx * t, y = f.y + dy * t, z = f.z + dz * t;
      if (rock(x, y, z) < 0.42 || y < data.heightAt(x, z) + 0.4) break;
      ok = t;
      if (t >= want) break;
    }
    return ok;
  };
  const view = { mix: 0, dist: 5 }, f = new THREE.Vector3(), follow = rig.update.bind(rig);
  rig.update = (dt, target, walker) => {
    follow(dt, target, walker);
    const cam = rig.camera, g = rig._focus;
    view.mix = Math.min(1, Math.max(0, view.mix + (dive ? dt : -dt) / 0.45));
    const k = view.mix * view.mix * (3 - 2 * view.mix), near = far(g.x, g.z) < DEEP.r + 18;
    if (k <= 0 && !near) return;
    f.set(g.x, g.y - (1.45 - BODY) * k, g.z);
    if (k > 0) {
      // the view of a diver: round the body wherever the look goes, under the water as over it
      const cp = Math.cos(rig.pitch), dx = Math.sin(rig.yaw) * cp, dy = -Math.sin(rig.pitch), dz = Math.cos(rig.yaw) * cp;
      const room = clear(f, dx, dy, dz, Math.min(rig.distance, 6.5));
      view.dist += (room - view.dist) * (room < view.dist ? 1 : 1 - Math.exp(-dt * 4));
      cam.position.lerp(_p.set(f.x + dx * view.dist, f.y + dy * view.dist, f.z + dz * view.dist), k);
    }
    if (near) {
      // no eye looks through the rock: one that would be in it, or behind it, is brought back before its face
      const dx = cam.position.x - f.x, dy = cam.position.y - f.y, dz = cam.position.z - f.z, d = Math.hypot(dx, dy, dz) || 1;
      if (d > 0.6) { const room = clear(f, dx / d, dy / d, dz / d, d); if (room < d - 0.01) cam.position.set(f.x + (dx / d) * room, f.y + (dy / d) * room, f.z + (dz / d) * room); }
    }
    // the picture is never cut by the swell: an eye in it goes just over, or just under
    const level = waterAt(cam.position.x, cam.position.z);
    if (level !== null && k > 0 && cam.position.y > level - 0.5 && cam.position.y < level + 0.42 && data.heightAt(cam.position.x, cam.position.z) < level - 1) cam.position.y = cam.position.y > level - 0.04 && f.y > level - 1.6 ? level + 0.42 : level - 0.5;
    cam.lookAt(f.x, f.y + 0.1, f.z);
  };

  // ---------------------------------------------------------------------------------------------- the others
  // no rings on the water over who swims deep under it (RemoteAvatars draws them for every swimmer)
  const ripples = world.ripples, rings = ripples.trail.bind(ripples);
  ripples.trail = (key, time, dt, x, y, z, speed, swim) => { const peer = key ? app.presence?.peers.get(key) : null; if (!(peer && peer.y < y - 1.7)) rings(key, time, dt, x, y, z, speed, swim); };
  const hushed = new Set(); // whose name is not shown: in the cave, while one is not

  // ---------------------------------------------------------------------------------------------- the sound
  let dull = null;
  /** Under the water what one hears is dull: the whole of the sound goes through a low-pass filter meanwhile. */
  const muffle = (on) => {
    const a = app.audio;
    if (!a?.out || !a.ctx || on === !!dull?.on) return; // (its graph is built at the first gesture)
    try {
      if (!dull) { dull = { node: a.ctx.createBiquadFilter(), on: false }; dull.node.type = 'lowpass'; dull.node.frequency.value = 620; dull.node.Q.value = 0.5; dull.node.connect(a.ctx.destination); }
      a.out.disconnect(); a.out.connect(on ? dull.node : a.ctx.destination); dull.on = on;
    } catch { /* no sound */ }
  };

  // ---------------------------------------------------------------------------------------------- every frame
  const [mx, mz] = toWorld(DEEP.mouth.u - 1.2, DEEP.mouth.w);
  let inAir = false, thread = 0, ring = 0;
  world.zones.push({
    update: (dt, time, camera) => {
      if (dive && (dive.done || player.dead || player.driver !== dive)) rise();
      const cam = camera.position, p = player.pos, level = waterAt(cam.x, cam.z);
      const inside = place.inside(p.x, p.y + BODY, p.z), eye = inside || place.inside(cam.x, cam.y, cam.z);
      place.update(dt, time, camera, level, eye);
      muffle(place.under);
      // come up in the chamber: it is said — once and for all the first time (kept in this browser), in a word after
      const air = inside && !dive && p.y > -FLOAT - 0.1 && inChamber(...toLocal(p.x, p.z));
      if (air && !inAir) {
        if (!found) { found = true; try { localStorage.setItem(FOUND, '1'); } catch { /* no storage */ } hud.note(`You have found ${DEEP.name}: a pocket of air under the rock. Nobody has come up here in a very long time.`, 9000); app.audio?.play('tick'); } else hud.note(`${DEEP.name}.`, 2600);
      }
      inAir = air;
      const near = far(cam.x, cam.z) < 75;
      if (near) {
        // the hint: a thread of bubbles from the arch — under the water one sees it rise, over it the rings where it breaks the surface
        if (place.under) { for (thread += dt * 5; thread > 1; thread--) place.bubble(mx, DEEP.mouth.y + 1.4, mz, 0, 1, 0.5, 0.06); } else if ((ring += dt) > 2.4) { ring = 0; ripples.splash(time, mx + (Math.random() - 0.5) * 0.8, 0, mz + (Math.random() - 0.5) * 0.8, 0.35); }
      }
      // the others: who is under leaves bubbles too; who is in the cave is not named through its rock
      const peers = app.presence?.peers;
      if (peers) for (const o of peers.values()) {
        if (!o.visible) continue;
        const hide = !eye && place.inside(o.x, o.y + BODY, o.z);
        if (hide) { if (!hushed.has(o.id)) { hushed.add(o.id); o.tagOff = true; } } else if (hushed.delete(o.id)) o.tagOff = false;
        if (place.under && o.anim === ANIM.swim && Math.random() < dt * 4) { const lv = waterAt(o.x, o.z); if (lv !== null && o.y < lv - 1.7 && Math.hypot(o.x - cam.x, o.z - cam.z) < 40) place.bubble(o.x, o.y + 1.2, o.z, lv, 1, 0.3); }
      }
    },
  });

  /** A diver put at a spot of the world (the checks and the pictures do): under the water there, the camera behind them. */
  const put = (x, y, z, yaw = 0, pitch = -0.1) => {
    rise();
    player.teleport(x, z, yaw + Math.PI, y);
    player.swimming = true; player.grounded = false;
    dive = session(); dive.t = 1; vel.set(0, 0, 0);
    player.driver = dive;
    rig.pitch = pitch; rig.snap(player.pos, yaw); view.mix = 1; view.dist = 4;
    return dive;
  };
  // (the way through the cave, in the world: from before the arch to the pool — for who checks it)
  const way = [[DEEP.mouth.u + 7, DEEP.mouth.y, DEEP.mouth.w + 0.4], ...WAY.map(([u, y, w]) => [u, y, w]), [DEEP.pool.u, -1.0, DEEP.pool.w]].map(([u, y, w]) => { const [x, z] = toWorld(u, w); return [x, y - BODY, z]; });
  return (app.dive = { place, go, rise, put, way, canDive, diving: () => dive, found: () => found, view });
}
