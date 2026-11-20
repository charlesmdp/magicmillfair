// Third-person character controller: walk, run, jump, swim, with simple collisions.
import * as THREE from 'three';
import { ANIM } from './Character.js';

const WALK = 4.4, RUN = 8.2, SWIM = 2.6, JUMP = 5.4, GRAVITY = 15, RADIUS = 0.38, STEP = 0.62;

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
  }

  teleport(x, z, yaw = 0) {
    this.pos.set(x, this.collision.groundAt(x, z, 1e4), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.grounded = true;
    this._sync();
  }

  _sync() {
    const r = this.character.root;
    r.position.copy(this.pos);
    r.rotation.y = this.yaw;
  }

  /**
   * @param camYaw heading of the camera (radians), movement is relative to it
   * @param control false while something else reads the inputs (free camera): the character just stands
   */
  update(dt, camYaw, control = true) {
    const inp = this.input;
    const pos = this.pos, vel = this.vel;
    // desired horizontal velocity, relative to where the camera looks
    const f = control ? inp.move.y : 0, s = control ? inp.move.x : 0;
    const sin = Math.sin(camYaw), cos = Math.cos(camYaw);
    let wx = -sin * f + cos * s, wz = -cos * f - sin * s;
    const wl = Math.hypot(wx, wz);
    const terrain = this.data.heightAt(pos.x, pos.z);
    const water = this.data.waterAt(pos.x, pos.z);
    const depth = water > -500 ? water - terrain : -1;
    // deep enough and low enough: float
    this.swimming = depth > 1.2 && pos.y < water - 0.55;
    const wading = !this.swimming && depth > 0.25 && pos.y < water;
    const top = this.swimming ? SWIM : (inp.run ? RUN : WALK) * (wading ? 0.6 : 1);
    this.wading = wading;
    if (wl > 1e-3) { wx = (wx / Math.max(wl, 1)) * top; wz = (wz / Math.max(wl, 1)) * top; } else { wx = 0; wz = 0; }
    const k = 1 - Math.exp(-dt * (this.grounded || this.swimming ? 11 : 3));
    vel.x += (wx - vel.x) * k; vel.z += (wz - vel.z) * k;

    // try to move, sliding along obstacles and refusing steps that are too high
    const tryMove = (dx, dz) => {
      const p = this._p;
      p.x = pos.x + dx; p.z = pos.z + dz;
      this.collision.resolve(p, RADIUS, pos.y);
      this.collision.confine(p); // the mountains and the open sea
      const g = this.collision.groundAt(p.x, p.z, pos.y + 0.3);
      if ((this.grounded || this.swimming) && g - pos.y > STEP && !(this.swimming && g < water + 0.4)) return false;
      if (!this.grounded && !this.swimming && g > pos.y + 0.25) return false;
      pos.x = p.x; pos.z = p.z;
      return true;
    };
    // in short steps, so that a slow frame cannot carry the walker through a thin obstacle (railings, walls)
    const dist = Math.hypot(vel.x, vel.z) * dt;
    const steps = Math.max(1, Math.ceil(dist / 0.22));
    const dx = (vel.x * dt) / steps, dz = (vel.z * dt) / steps;
    for (let i = 0; i < steps && (dx || dz); i++) {
      if (tryMove(dx, dz)) continue;
      const okX = tryMove(dx, 0), okZ = tryMove(0, dz);
      if (!okX) vel.x = 0;
      if (!okZ) vel.z = 0;
      if (!okX && !okZ) break;
    }

    // vertical motion
    const ground = this.collision.groundAt(pos.x, pos.z, pos.y + 0.3);
    if (this.swimming) {
      const target = water - 1.05;
      pos.y += (target - pos.y) * Math.min(1, dt * 5);
      vel.y = 0;
      this.grounded = false;
      if (ground > pos.y) { pos.y = ground; this.swimming = false; this.grounded = true; }
    } else if (this.grounded) {
      if (control && inp.jump) { vel.y = JUMP; this.grounded = false; }
      else if (ground < pos.y - 0.45) { this.grounded = false; vel.y = 0; }
      else pos.y += (ground - pos.y) * Math.min(1, dt * 22);
    } else {
      vel.y -= GRAVITY * dt;
      pos.y += vel.y * dt;
      if (pos.y <= ground && vel.y <= 0) { pos.y = ground; vel.y = 0; this.grounded = true; }
      // falling into deep water
      if (depth > 1.2 && pos.y < water - 0.9) { this.swimming = true; vel.y = 0; }
    }

    // face the way we are going
    const sp = Math.hypot(vel.x, vel.z);
    this.speed = sp;
    if (sp > 0.4) {
      const target = Math.atan2(vel.x, vel.z);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 12);
    }
    this.anim = this.swimming ? ANIM.swim : !this.grounded ? ANIM.jump : sp > 5.6 ? ANIM.run : sp > 0.5 ? ANIM.walk : ANIM.idle;
    this.character.setAnim(this.anim, sp);
    this.character.update(dt);
    this._sync();
  }
}
