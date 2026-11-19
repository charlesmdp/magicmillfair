// Free-flying camera for exploring the world (keyboard + mouse/touch look).
import * as THREE from 'three';

export class FreeCamera {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('../core/Input.js').Input} input
   * @param {(x:number,z:number)=>number} groundAt
   */
  constructor(camera, input, groundAt) {
    this.camera = camera;
    this.input = input;
    this.groundAt = groundAt;
    this.yaw = 0; this.pitch = -0.2;
    this.vel = new THREE.Vector3();
    this.speed = 14;
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._f = new THREE.Vector3(); this._r = new THREE.Vector3();
  }

  setPose(x, y, z, yaw, pitch) {
    this.camera.position.set(x, y, z);
    this.yaw = yaw; this.pitch = pitch;
    this.vel.set(0, 0, 0);
    this._apply();
  }

  /** Adopt the current camera orientation (when switching from another mode). */
  syncFromCamera() {
    this._e.setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = this._e.y; this.pitch = this._e.x;
  }

  _apply() {
    this._e.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this._e);
  }

  update(dt) {
    const inp = this.input;
    const look = inp.consumeLook();
    this.yaw -= look.x;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - look.y));
    this._apply();
    const boost = inp.run ? 4 : 1;
    const f = this._f.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const r = this._r.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const target = new THREE.Vector3()
      .addScaledVector(f, inp.move.y)
      .addScaledVector(r, inp.move.x);
    target.y += inp.rise;
    if (target.lengthSq() > 1) target.normalize();
    target.multiplyScalar(this.speed * boost);
    this.vel.lerp(target, 1 - Math.exp(-dt * 7));
    const p = this.camera.position;
    p.addScaledVector(this.vel, dt);
    const lim = 900;
    p.x = Math.max(-lim, Math.min(lim, p.x));
    p.z = Math.max(-lim, Math.min(lim, p.z));
    const g = this.groundAt(p.x, p.z) + 0.6;
    if (p.y < g) { p.y = g; if (this.vel.y < 0) this.vel.y = 0; }
    if (p.y > 420) p.y = 420;
  }
}
