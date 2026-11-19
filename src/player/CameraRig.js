// Third-person orbit camera that follows the player, avoiding the ground and buildings.
import * as THREE from 'three';

export class CameraRig {
  constructor(camera, input, collision, data) {
    this.camera = camera;
    this.input = input;
    this.collision = collision;
    this.data = data;
    this.yaw = Math.PI;
    this.pitch = -0.22;
    this.distance = 7;
    this.current = 7;
    this.target = new THREE.Vector3();
    this._focus = new THREE.Vector3();
    this._first = true;
    this._q = { x: 0, z: 0 };
  }

  /** Camera heading used to interpret movement input. */
  get heading() { return this.yaw; }

  snap(target, yaw) {
    this.yaw = yaw;
    this._focus.copy(target).setY(target.y + 1.45);
    this._first = true;
  }

  update(dt, target) {
    const look = this.input.consumeLook();
    this.yaw -= look.x;
    this.pitch = Math.max(-1.25, Math.min(0.5, this.pitch - look.y));
    this.distance = Math.max(2.2, Math.min(16, this.distance * (1 + this.input.consumeZoom() * 0.09)));

    // follow with a little lag (snappier vertically so jumps read well)
    const fx = target.x, fy = target.y + 1.45, fz = target.z;
    const f = this._focus;
    if (this._first) { f.set(fx, fy, fz); this._first = false; }
    const k = 1 - Math.exp(-dt * 14);
    f.x += (fx - f.x) * k; f.z += (fz - f.z) * k; f.y += (fy - f.y) * (1 - Math.exp(-dt * 9));

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // direction from the focus to the camera
    const dx = Math.sin(this.yaw) * cp, dy = -sp, dz = Math.cos(this.yaw) * cp;
    let dist = this.distance;
    // buildings in the way: come closer
    const hit = this.collision.segment(f.x, f.z, f.x + dx * dist, f.z + dz * dist);
    if (hit < 1) dist = Math.max(0.8, dist * hit - 0.35);
    // keep above the terrain and the water along the boom
    for (let i = 1; i <= 5; i++) {
      const t = (i / 5) * dist;
      const x = f.x + dx * t, z = f.z + dz * t, y = f.y + dy * t;
      const g = Math.max(this.data.heightAt(x, z), this.data.waterAt(x, z)) + 0.35;
      if (y < g) { dist = Math.max(0.8, t * (f.y - g > 0.05 ? Math.min(1, (f.y - g) / (f.y - y + 1e-3)) : 0.5)); break; }
    }
    this.current += (dist - this.current) * (dist < this.current ? 1 : 1 - Math.exp(-dt * 5));
    const c = this.camera;
    c.position.set(f.x + dx * this.current, f.y + dy * this.current, f.z + dz * this.current);
    // never sit inside a trunk, a post or a wall
    const q = this._q;
    q.x = c.position.x; q.z = c.position.z;
    this.collision.resolve(q, 0.45, c.position.y - 1.1);
    c.position.x = q.x; c.position.z = q.z;
    const g = Math.max(this.data.heightAt(c.position.x, c.position.z), this.data.waterAt(c.position.x, c.position.z)) + 0.3;
    if (c.position.y < g) c.position.y = g;
    c.lookAt(f.x, f.y + 0.1, f.z);
  }
}
