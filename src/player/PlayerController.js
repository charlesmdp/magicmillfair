// Third-person character controller: walk, run, jump, swim, sit, ride, fly a little, with simple collisions.
import * as THREE from 'three';
import { ANIM, SEAT } from './Character.js';

const WALK = 4.4, RUN = 8.2, SWIM = 3.1, SWIM_FAST = 5.3, JUMP = 5.4, GRAVITY = 15, RADIUS = 0.38, STEP = 0.62;
const CLIMB = 1.35; // the steepest bare ground one can walk up (metres up per metre forward: about 53°)
const SLIDE = 1.7; // steeper than that nobody stands: one slides down (cliffs are not climbed by hopping either)
const REACH = 0.6; // slopes are measured over that distance ahead, never over one frame's stride (which shrinks as the frame rate rises)
const EASE = 0.7; // from that slope up, one climbs more and more slowly (half speed at the limit)
const OK = 0, BLOCKED = 1, STEEP = 2;
export const JET = { time: 1.5, thrust: 27, max: 7 }; // seconds of fuel, upward acceleration, top climbing speed
/** The light jetpack: three tenths of a second of thrust (it lifts three metres or so), and so long between two goes. */
export const JET_LITE = { time: 0.3, every: 15 };
const QUAD = { speed: 15.5, cruise: 9.5 };
const DEATH = 3.6; // seconds between dying and standing again

/**
 * A place to sit, from the middle of its seat (x, z) at height y, for someone facing `yaw`. What a seat
 * holds is where the avatar's feet go: { x, y, z, yaw, pose, label, exit: [x, z] }.
 */
export function seatAt(x, y, z, yaw, extra = {}) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  return { x: x + fx * SEAT.back, y: y - SEAT.under, z: z + fz * SEAT.back, yaw, pose: ANIM.sit, label: 'Sit', exit: [x + fx * 0.95, z + fz * 0.95], ...extra };
}

export class PlayerController {
  /**
   * @param {import('./Character.js').Character} character
   * @param {import('../world/Collision.js').Collision} collision
   * @param {import('../world/WorldData.js').WorldData} data
   */
  constructor(character, collision, data, input) {
    this.character = character;
    this.collision = collision;
    this.data = data;
    this.input = input;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.grounded = true;
    this.swimming = false;
    this.anim = ANIM.idle;
    this.speed = 0;
    this._p = { x: 0, z: 0 };
    this._g = { x: 0, z: 0 };
    this._ground = 0; // the ground under the feet at the end of the last frame
    this.sliding = false;
    this.seat = null; // what the player sits or lies on
    this._seatTime = 0;
    this._at = { x: 0, y: 0, z: 0, yaw: 0 };
    this.splashed = 0; // set to the entry speed when the player has just dropped into water (read and cleared by the effects)
    this.dead = null; // { t, cause, respawn: [x, z, yaw] } while lying there
    this.riding = false; // on the quad
    /** While set, this moves the player instead of the keys: { step(dt, player, control) } (the quad of the race). */
    this.driver = null;
    this.pitch = 0; this.roll = 0; // how what is ridden leans (the race)
    this.jet = 0; // seconds of jetpack burn left
    this.tank = JET.time; // seconds of fuel a full tank holds (the light jetpack: a third of it)
    this.fuel = this.tank;
    this.gravity = 1; // (cheats)
    this.boost = 1;
    this.hop = 1; // how high one jumps
    this.grip = 1; // how well the feet hold the ground (below 1: it is ice)
    this.cheat = false; // true while a cheat changes how one moves (the games then keep no record)
    this.autoRun = false; // a setting: run unless Shift is held, instead of the other way round
    this.diving = false; // head first into deep water, from high up
    this._peak = 0; // the highest the feet have been since they left the ground
    this._plunge = 0; // seconds under water left after a dive
    this.cross = false; // sitting on the ground, legs crossed — or 'lie': lying on it (anywhere: see sitOnGround, lieOnGround)
    this.noJet = false; // "jump" was pressed in the air and no jetpack answered (read and cleared by the game)
    this.jetEvery = 0; // seconds a jetpack needs between two goes (0: none — the light one needs some)
    this.jetCool = 0; // …and how many of them are left to wait
    this.jetWait = 0; // "jump" was pressed in the air too soon: how long is left (read and cleared by the game)
    this._sink = 0; // …and how fast one is still going down
    /** May the jetpack be used here? Set by the game (caves and some places say no). */
    this.canFly = () => true;
    /** Called with (cause) when the player dies, and with the place when they stand again. */
    this.onDeath = null;
    this.onRespawn = null;
  }

  teleport(x, z, yaw = 0) {
    this.seat = null;
    this.cross = false;
    this.pos.set(x, this.collision.spawnHeight(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.grounded = true;
    this.sliding = false;
    this.jet = 0;
    this._ground = this.pos.y;
    this._sync();
  }

  /** Thrown into the air at `speed` m/s (a cheat). */
  launch(speed) {
    if (this.dead) return;
    this.seat = null;
    this.riding = false;
    this.grounded = this.swimming = false;
    this.vel.y = speed;
    this._peak = this.pos.y;
  }

  /** Sit (or lie) on a seat: see seatAt(). A seat with at(out) moves (a gondola); `locked` ones are left on purpose only. */
  sit(seat) {
    this.seat = seat;
    this._seatTime = 0;
    this.vel.set(0, 0, 0);
    this.swimming = false;
    this.grounded = true;
    this.riding = false;
    this.jet = 0;
  }

  /** Get up, at the seat's exit when it has one. */
  stand() {
    const s = this.seat;
    if (!s) return;
    this.seat = null;
    const e = typeof s.exit === 'function' ? s.exit() : s.exit;
    if (e) { this.pos.x = e[0]; this.pos.z = e[1]; }
    this.pos.y = this._ground = this.collision.groundAt(this.pos.x, this.pos.z, this.pos.y + 1.4);
    this.vel.set(0, 0, 0);
    this.grounded = true;
    this._sync();
  }

  /**
   * The end, for a few seconds. `cause` is shown on screen; `respawn` = [x, z, heading of the avatar] is where
   * one stands again; `sink` (m/s) lets what one died in swallow the body.
   */
  die(cause, respawn, sink = 0) {
    if (this.dead) return;
    this.seat = null;
    this.riding = false;
    this.diving = false;
    this.jet = 0;
    this.vel.set(0, 0, 0);
    this.dead = { t: 0, cause, respawn, sink };
    this.onDeath?.(cause);
  }

  _dying(dt) {
    const d = this.dead;
    d.t += dt;
    this.speed = 0;
    this.swimming = this.wading = false;
    if (d.sink) this.pos.y -= dt * d.sink;
    this.anim = ANIM.dead;
    this.character.setAnim(this.anim, 0);
    this.character.update(dt);
    this._sync();
    if (d.t >= DEATH) {
      this.dead = null;
      const [x, z, yaw = 0] = d.respawn;
      this.teleport(x, z, yaw);
      this.onRespawn?.(x, z, yaw);
    }
  }

  _seated(dt, control) {
    const s = this.seat, inp = this.input, pos = this.pos;
    this._seatTime += dt;
    const p = s.at ? s.at(this._at) : s;
    const k = this._seatTime < 0.45 ? Math.min(1, dt * 12) : 1; // settle in, then stay put (moving seats included)
    pos.x += (p.x - pos.x) * k; pos.y += (p.y - pos.y) * k; pos.z += (p.z - pos.z) * k;
    let d = p.yaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * k;
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.grounded = true;
    this.swimming = this.wading = false;
    this.anim = s.pose ?? ANIM.sit;
    this.character.setAnim(this.anim, 0);
    this.character.update(dt);
    this._sync();
    // walking away or jumping gets up
    if (control && !s.locked && this._seatTime > 0.6 && (Math.hypot(inp.move.x, inp.move.y) > 0.6 || inp.jump)) this.stand();
  }

  _sync() {
    const r = this.character.root;
    r.position.copy(this.pos);
    if (this.pitch || this.roll || r.rotation.x || r.rotation.z) { r.rotation.order = 'YXZ'; r.rotation.set(this.pitch, this.yaw, this.roll); } else r.rotation.y = this.yaw;
  }

  // In a game that moves the player itself — the race (on a quad: the game reads the keys), the flying
  // theatre (`driver.riding` false, `driver.anim`: how the avatar holds itself)
  _driven(dt, control) {
    this.driver.step(dt, this, control);
    this.vel.set(0, 0, 0);
    this.swimming = this.wading = this.sliding = this.diving = false;
    this.cave = null;
    this.riding = this.driver.riding !== false;
    this.jet = 0;
    this._peak = this.pos.y;
    this.anim = this.driver.anim ?? ANIM.sit;
    this.character.setAnim(this.anim, this.speed);
    this.character.update(dt);
    this._sync();
  }

  /** Slope of the bare ground at (x, z): its gradient goes to `out`, its steepness (metres per metre) is returned. */
  _gradient(x, z, out) {
    const d = this.data, e = 0.7;
    out.x = (d.heightAt(x + e, z) - d.heightAt(x - e, z)) / (2 * e);
    out.z = (d.heightAt(x, z + e) - d.heightAt(x, z - e)) / (2 * e);
    return Math.hypot(out.x, out.z);
  }

  /**
   * @param camYaw heading of the camera (radians), movement is relative to it
   * @param control false while something else reads the inputs (free camera): the character just stands
   */
  /** Lies down on the ground where it stands (or sits). Any step or jump gets up again. */
  lieOnGround() {
    if (!this.cross && !this.sitOnGround()) return false;
    this.cross = 'lie';
    return true;
  }

  /** Sits down on the ground where it stands, legs crossed. Any step or jump gets up again. */
  sitOnGround() {
    if (this.dead || this.seat || this.driver || this.riding || this.swimming || !this.grounded || this.sliding) return false;
    this.cross = true;
    this.vel.set(0, 0, 0);
    return true;
  }

  update(dt, camYaw, control = true) {
    if (this.jetCool > 0) this.jetCool = Math.max(0, this.jetCool - dt);
    if (this.dead) { this.cross = false; return this._dying(dt); }
    if (this.seat) { this.cross = false; return this._seated(dt, control); }
    if (this.driver) { this.cross = false; return this._driven(dt, control); }
    const inp = this.input;
    if (this.cross) {
      // seated on the ground: nothing moves until a step or a jump is asked for
      if (control && (Math.abs(inp.move.x) > 0.2 || Math.abs(inp.move.y) > 0.2 || inp.jump)) this.cross = false;
      else {
        this.speed = 0;
        this.anim = this.cross === 'lie' ? ANIM.lie : ANIM.cross;
        this.character.setAnim(this.anim, 0);
        this.character.update(dt);
        this._sync();
        return;
      }
    }
    const pos = this.pos, vel = this.vel;
    // desired horizontal velocity, relative to where the camera looks
    const f = control ? inp.move.y : 0, s = control ? inp.move.x : 0;
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    let wx = -sin * f + cos * s, wz = -cos * f - sin * s;
    const wl = Math.hypot(wx, wz);
    // under the ground (a cave) the water of the surface above does not count
    this.cave = this.collision.caveAt(pos.x, pos.z, pos.y);
    const terrain = this.cave ? this.cave.floorAt(pos.x, pos.z) : this.data.heightAt(pos.x, pos.z);
    const water = this.cave ? -1000 : this.data.waterAt(pos.x, pos.z);
    const depth = water > -500 ? water - terrain : -1;
    // deep enough and low enough: float
    this.swimming = depth > 1.2 && pos.y < water - 0.55;
    const wading = !this.swimming && depth > 0.25 && pos.y < water;
    if (this.riding && (this.swimming || (depth > 0.7 && pos.y < water))) this.riding = false; // a quad does not float
    const riding = this.riding;
    const fast = control && inp.run !== this.autoRun; // (Shift runs, or walks when running is the habit)
    const top = this.swimming ? (fast ? SWIM_FAST : SWIM)
      : riding ? (fast ? QUAD.speed : QUAD.cruise) * (wading ? 0.5 : 1)
        : (fast ? RUN : WALK) * (wading ? 0.6 : 1) * this.boost;
    this.wading = wading;
    if (wl > 1e-3) { wx = (wx / Math.max(wl, 1)) * top; wz = (wz / Math.max(wl, 1)) * top; } else { wx = 0; wz = 0; }
    // The ground really under the feet. (The avatar's own height eases over steps, so it may be a little off:
    // steps and slopes are judged from the ground itself, which gives the same walk at any frame rate.)
    let here = this.collision.groundAt(pos.x, pos.z, pos.y + 0.3);
    const wasGrounded = this.grounded, fromX = pos.x, fromZ = pos.z;
    // ground too steep to stand on: down it goes, whatever the keys say
    // (the sill of a cave mouth is steep rock too, but it is a doorstep)
    const bare = this.grounded && !this.cave && Math.abs(here - terrain) < 0.02 && !this.swimming && !this.collision.inCave(pos.x, pos.z);
    const wasSliding = this.sliding;
    this.sliding = false;
    if (bare) {
      const g = this._g, steep = this._gradient(pos.x, pos.z, g);
      // (once sliding, one slides on until the ground is clearly gentler: no dithering at the limit)
      if (steep > (wasSliding ? SLIDE * 0.86 : SLIDE)) { this.sliding = true; wx = (-g.x / steep) * 7.5; wz = (-g.z / steep) * 7.5; }
      else if (wx || wz) {
        // uphill, the steeper the slower
        const l = Math.hypot(wx, wz);
        const rise = (this.data.heightAt(pos.x + (wx / l) * REACH, pos.z + (wz / l) * REACH) - terrain) / REACH;
        if (rise > EASE) { const t = Math.min(1, (rise - EASE) / (CLIMB - EASE)), f = 1 - 0.5 * t * t * (3 - 2 * t); wx *= f; wz *= f; }
      }
    }
    const k = 1 - Math.exp(-dt * (this.sliding ? 6 : riding ? 3.2 : this.jet > 0 ? 6 : this.swimming ? 11 : this.grounded ? 11 * this.grip : 3));
    vel.x += (wx - vel.x) * k; vel.z += (wz - vel.z) * k;

    // try to move, sliding along obstacles and refusing steps that are too high
    const col = this.collision;
    const tryMove = (dx, dz) => {
      const p = this._p;
      p.x = pos.x + dx; p.z = pos.z + dz;
      col.resolve(p, RADIUS, pos.y);
      col.confine(p); // the mountains and the open sea
      if (col.blocked(p.x, p.z, pos.y)) return BLOCKED; // the side of a floating stone
      const feet = this.grounded ? Math.max(pos.y, here) : pos.y;
      const g = col.groundAt(p.x, p.z, feet + 0.3);
      if (this.grounded || this.swimming) { if (g - feet > STEP && !(this.swimming && g < water + 0.4)) return BLOCKED; }
      else if (g > pos.y + 0.25) return BLOCKED;
      // bare rock that is too steep is not walked up (steps, decks and cave floors are not bare ground)
      if (this.grounded && !this.sliding && g > here + 1e-4 && Math.abs(g - this.data.heightAt(p.x, p.z)) < 0.02 && !col.inCave(p.x, p.z)) {
        const mx = p.x - pos.x, mz = p.z - pos.z, d = Math.hypot(mx, mz);
        if (d > 1e-6) {
          const qx = pos.x + (mx / d) * REACH, qz = pos.z + (mz / d) * REACH, far = this.data.heightAt(qx, qz);
          if ((far - here) / REACH > CLIMB && Math.abs(col.groundAt(qx, qz, feet + 0.3) - far) < 0.02 && !col.inCave(qx, qz)) return STEEP;
        }
      }
      pos.x = p.x; pos.z = p.z; here = g;
      return OK;
    };
    // in short steps, so that a slow frame cannot carry the walker through a thin obstacle (railings, walls)
    const dist = Math.hypot(vel.x, vel.z) * dt;
    const steps = Math.max(1, Math.ceil(dist / 0.22));
    let dx = (vel.x * dt) / steps, dz = (vel.z * dt) / steps;
    for (let i = 0; i < steps && (dx || dz); i++) {
      const res = tryMove(dx, dz);
      if (res === OK) continue;
      if (res === STEEP) {
        // too steep to go up: what is left of the stride follows the contour line
        const g = this._g, steep = this._gradient(pos.x, pos.z, g);
        if (steep > 1e-3) {
          const ux = g.x / steep, uz = g.z / steep, up = dx * ux + dz * uz, v = vel.x * ux + vel.z * uz;
          if (up > 0) { dx -= up * ux; dz -= up * uz; }
          if (v > 0) { vel.x -= v * ux; vel.z -= v * uz; }
        }
        if (Math.hypot(dx, dz) < 1e-5 || tryMove(dx, dz) !== OK) { vel.x = 0; vel.z = 0; break; }
        continue;
      }
      const okX = tryMove(dx, 0) === OK, okZ = tryMove(0, dz) === OK;
      if (!okX) vel.x = 0;
      if (!okZ) vel.z = 0;
      if (!okX && !okZ) break;
    }

    // vertical motion
    const ground = col.groundAt(pos.x, pos.z, pos.y + 0.3);
    if (this.swimming) {
      if (this._plunge > 0) {
        // a dive carries on under the surface: head first, slowing, a metre or two down — as deep as the bed
        // allows — before one comes back up
        this._plunge -= dt;
        this._sink *= Math.exp(-dt * 3.4);
        pos.y = Math.max(pos.y - this._sink * dt, Math.min(water - 1.05, ground + 0.3));
        if (this._sink < 0.7) this._plunge = 0;
      } else {
        const target = water - 1.05;
        pos.y += (target - pos.y) * Math.min(1, dt * (pos.y < target - 0.4 ? 2.6 : 5)); // (up from a dive: unhurried)
      }
      vel.y = 0;
      this.grounded = false;
      this.diving = this._plunge > 0;
      this.jet = 0;
      if (ground > pos.y) { pos.y = ground; this.swimming = false; this.grounded = true; }
    } else if (this.grounded) {
      this.fuel = this.tank;
      this.jet = 0;
      this.diving = false;
      this._peak = pos.y;
      // the feet follow a slope exactly, and take a step (a tread, a kerb) smoothly
      if (wasGrounded) {
        const lim = Math.hypot(pos.x - fromX, pos.z - fromZ) * 2.5 + 0.01, d = ground - this._ground;
        pos.y += d > lim ? lim : d < -lim ? -lim : d;
      }
      if (control && inp.jump && !this.sliding) { vel.y = JUMP * this.hop * (riding ? 0.75 : 1); this.grounded = false; }
      else if (ground < pos.y - 0.45) { this.grounded = false; vel.y = 0; }
      else pos.y += (ground - pos.y) * (1 - Math.exp(-dt * 22));
    } else {
      // a second press of "jump" in the air lights the jetpack, for as long as its fuel lasts
      const ready = this.jet <= 0 && this.fuel > 0.1 && !riding && this.canFly(pos);
      if (control && inp.jump && ready && this.jetCool > 0) this.jetWait = this.jetCool; // (it has not got its breath back)
      else if (control && inp.jump && ready) { this.jet = this.fuel; this.fuel = 0; vel.y = Math.max(vel.y, 2.5); this.jetCool = this.jetEvery; }
      else if (control && inp.jump && this.jet <= 0 && !riding && !this.swimming) this.noJet = true;
      if (this.jet > 0) {
        this.jet -= dt;
        if (!this.canFly(pos)) this.jet = 0;
        vel.y = Math.min(JET.max, vel.y + JET.thrust * dt);
      }
      vel.y -= GRAVITY * this.gravity * dt;
      pos.y += vel.y * dt;
      if (pos.y > this._peak) this._peak = pos.y;
      // falling from more than ten metres towards deep water: head first, like a swan
      if (!this.diving && vel.y < -3 && this.jet <= 0 && !riding && depth > 1.3 && this._peak - water > 10 && pos.y - water > 2.5) this.diving = true;
      else if (this.diving && depth < 1.25) this.diving = false; // (drifted over the shore)
      if (pos.y <= ground && vel.y <= 0) { pos.y = ground; vel.y = 0; this.grounded = true; this.diving = false; }
      // falling into deep water
      if (depth > 1.2 && pos.y < water - 0.9) {
        this.swimming = true;
        this.splashed = Math.max(1, -vel.y) * (this.diving ? 1.5 : 1);
        this._plunge = this.diving ? 1.1 : 0;
        this._sink = Math.min(9.5, Math.max(4, -vel.y * 0.42)); // how fast one is still going down (m/s)
        this.dived = this.diving; // (read and cleared by the effects)
        this.diving = false;
        vel.y = 0;
      }
    }
    this._ground = ground;

    // face the way we are going; the speed is the one really made (pushing against a wall is not walking)
    const push = Math.hypot(vel.x, vel.z);
    const sp = Math.min(push, Math.hypot(pos.x - fromX, pos.z - fromZ) / Math.max(dt, 1e-4) + 0.4);
    this.speed = sp;
    if (push > 0.4) {
      const target = Math.atan2(vel.x, vel.z);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * (riding ? 5 : 12));
    }
    this.anim = riding ? ANIM.sit : this.swimming && !this.diving ? ANIM.swim : this.diving ? ANIM.dive : !this.grounded ? ANIM.jump : sp > 5.6 ? ANIM.run : sp > 0.5 ? ANIM.walk : ANIM.idle;
    this.character.setAnim(this.anim, sp);
    this.character.update(dt);
    this._sync();
  }
}
