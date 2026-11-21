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
    this.lift = 0;
  }

  /** Camera heading used to interpret movement input. */
  get heading() { return this.yaw; }

  snap(target, yaw) {
    this.yaw = yaw;
    this._focus.copy(target).setY(target.y + 1.45);
    this._first = true;
    this._snapped = true;
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
    // underground: the camera stays in the gallery (or looks in from the open, through its mouth)
    const under = !!this.collision.caveAt(f.x, f.z, f.y - 1.4);
    if (under) {
      for (let i = 1; i <= 12; i++) {
        const t = (i / 12) * dist;
        if (!this.collision.walkable(f.x + dx * t, f.z + dz * t)) { dist = Math.max(0.5, t - dist / 12 - 0.3); break; }
      }
    }
    // The ground in the way (looking downhill, a bank, a deck): lift the camera over it rather than closing in.
    // (from inside a cave, the water running over the ground above is not in the way)
    const floor = (x, z) => (under && this.collision.caveAt(x, z, f.y - 1.4) ? this.collision.groundAt(x, z, f.y) : Math.max(this.collision.groundAt(x, z, f.y), this.data.waterAt(x, z)));
    let lift = 0;
    for (let i = 1; i <= 6; i++) {
      const t = (i / 6) * dist;
      const g = floor(f.x + dx * t, f.z + dz * t) + 0.45;
      const y = f.y + dy * t;
      if (y < g) lift = Math.max(lift, ((g - y) * dist) / t);
    }
    const maxLift = dist * 0.9;
    if (lift > maxLift) { dist = Math.max(0.8, dist * Math.max(0.3, maxLift / lift)); lift = maxLift; } // a wall of ground: come closer too
    this.lift += (lift - this.lift) * (1 - Math.exp(-dt * (lift > this.lift ? 14 : 4)));
    if (this._snapped) { this.lift = lift; this.current = dist; this._snapped = false; }
    this.current += (dist - this.current) * (dist < this.current ? 1 : 1 - Math.exp(-dt * 5));
    const c = this.camera;
    c.position.set(f.x + dx * this.current, f.y + dy * this.current + this.lift * Math.min(1, this.current / dist), f.z + dz * this.current);
    // never sit inside a trunk, a post or a wall
    const q = this._q;
    q.x = c.position.x; q.z = c.position.z;
    this.collision.resolve(q, 0.45, c.position.y - 1.1);
    c.position.x = q.x; c.position.z = q.z;
    const g = floor(c.position.x, c.position.z) + 0.3;
    if (c.position.y < g) c.position.y = g;
    // …and under its roof
    const cave = under ? this.collision.caveAt(c.position.x, c.position.z, f.y - 1.4) : null;
    if (cave) c.position.y = Math.min(c.position.y, Math.max(g, cave.ceilingAt(c.position.x, c.position.z) - 0.35));
    c.lookAt(f.x, f.y + 0.1, f.z);
  }
}
