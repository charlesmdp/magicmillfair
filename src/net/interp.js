// Snapshot interpolation for remote players.
// Pure module: no browser globals, every time is passed in (ms), so it runs as is under Node (tools/net-test.mjs).

export const TELEPORT = 12; // m between two snapshots: snap instead of gliding
export const EXTRAPOLATE = 200; // ms of dead reckoning once the buffer runs dry
const DELAY_MIN = 100; // ms
const DELAY_MAX = 250;
const LEAK = 0.001; // the clock offset estimate may sink by 1 ms per second (follows clock drift)
const SLEW = 0.15; // the playout clock runs at most 15 % faster or slower than real time
const RESYNC = 400; // ms: beyond that error the playout clock jumps instead of slewing
const BLEND = 100; // ms: time constant used to absorb a correction
const SPEED_TAU = 120; // ms: smoothing of the reported speed

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Wraps an angle to [-PI, PI). */
export function wrapAngle(a) {
  const r = (a + Math.PI) % (Math.PI * 2);
  return r < 0 ? r + Math.PI : r - Math.PI;
}

/**
 * Motion of one remote player, rebuilt from timestamped snapshots.
 * Snapshots carry the sender's (or server's) clock; each track measures its own offset to the local clock on
 * the least delayed packets and plays back `delay` ms behind them, so latency and clock bases do not matter.
 */
export class Track {
  /** @param {number} interval nominal time between two snapshots (ms) */
  constructor(interval = 1000 / 12) {
    this.interval = interval;
    this.buf = []; // { t, x, y, z, yaw, anim, flags, snap } ordered by t (sender clock)
    this.offset = 0; // sender clock - local clock
    this.jitter = 0; // ms: how late snapshots tend to arrive (fast attack, slow release)
    this.clock = NaN; // playout position on the sender clock
    this.speed = 0; // m/s, horizontal, smoothed
    this.heard = 0; // local time of the last accepted snapshot
    this.sampled = 0; // local time of the last sample()
    this.fresh = false; // a snapshot arrived since the last sample()
    this.dry = false; // the last sample() ran past the newest snapshot
    this.shown = false;
    this.x = this.y = this.z = this.yaw = 0; // what the last sample() returned
    this.ex = this.ey = this.ez = this.eyaw = 0; // correction being blended out
  }

  /** Playout delay (ms): about 120 ms at 12 Hz, more when snapshots arrive irregularly. */
  get delay() {
    return clamp(this.interval * 1.45 + this.jitter, DELAY_MIN, DELAY_MAX);
  }

  /** Adds a snapshot stamped `t` (sender clock) and received at `now` (local clock). False when rejected. */
  push(t, now, x, y, z, yaw, anim = 0, flags = 0) {
    if (![t, now, x, y, z, yaw].every(Number.isFinite)) return false;
    const buf = this.buf;
    const last = buf[buf.length - 1];
    if (last && t <= last.t) return false; // stale or duplicate
    const d = t - now;
    if (last) {
      this.offset = Math.max(d, this.offset - (now - this.heard) * LEAK);
      const late = this.offset - d;
      this.jitter += (late - this.jitter) * (late > this.jitter ? 0.25 : 0.05);
    } else this.offset = d;
    this.heard = now;
    const snap = !!last && Math.hypot(x - last.x, y - last.y, z - last.z) > TELEPORT;
    if (last && t - last.t > this.interval * 2.5) {
      // Silence after a confirmed rest (two equal snapshots): the peer only left its spot just before `t`.
      const prev = buf[buf.length - 2];
      const rested = !prev || (prev.x === last.x && prev.y === last.y && prev.z === last.z && prev.yaw === last.yaw);
      if (rested) buf.push({ ...last, t: t - this.interval, snap: false });
    }
    buf.push({ t, x, y, z, yaw, anim, flags, snap });
    if (buf.length > 32) buf.shift();
    this.fresh = true;
    return true;
  }

  /** Writes what to draw at local time `now` into `out`: x, y, z, yaw, anim, flags, speed, visible. */
  sample(now, out) {
    const buf = this.buf;
    if (!buf.length) {
      out.visible = false;
      return out;
    }
    const dt = this.shown ? Math.max(0, now - this.sampled) : 0;
    this.sampled = now;
    // Playout clock: real time, slewed towards (now + offset - delay); it only jumps when far off.
    const target = now + this.offset - this.delay;
    const err = target - (this.clock + dt);
    this.clock = Math.abs(err) < RESYNC ? this.clock + dt + clamp(err, -SLEW * dt, SLEW * dt) : target;
    const clock = this.clock;
    while (buf.length > 2 && buf[1].t <= clock) buf.shift();
    const a = buf[0];
    const b = buf[1];
    let { x, y, z, yaw } = a;
    let cur = a;
    let dry = false;
    if (b && clock >= b.t) {
      // Buffer ran dry: dead-reckon (horizontally) with the last velocity for a short while, then hold.
      const k = b.snap ? 0 : Math.min(clock - b.t, EXTRAPOLATE) / Math.max(b.t - a.t, this.interval / 2);
      x = b.x + (b.x - a.x) * k;
      z = b.z + (b.z - a.z) * k;
      y = b.y;
      yaw = b.yaw;
      cur = b;
      dry = true;
    } else if (b && clock > a.t) {
      if (!b.snap) { // a teleport is not interpolated: stay on `a`, then jump
        const k = (clock - a.t) / (b.t - a.t);
        x += (b.x - a.x) * k;
        y += (b.y - a.y) * k;
        z += (b.z - a.z) * k;
        yaw += wrapAngle(b.yaw - a.yaw) * k; // shortest arc
      }
    } else dry = !b && clock > a.t;
    if (this.fresh && this.dry && this.shown) {
      // New data ends a dry spell: keep the peer where it was drawn and blend the error out instead of popping.
      this.ex = this.x - x;
      this.ey = this.y - y;
      this.ez = this.z - z;
      this.eyaw = wrapAngle(this.yaw - yaw);
      if (Math.hypot(this.ex, this.ey, this.ez) > TELEPORT) this.ex = this.ey = this.ez = this.eyaw = 0;
    }
    this.fresh = false;
    this.dry = dry;
    const fade = Math.exp(-dt / BLEND);
    x += this.ex *= fade;
    y += this.ey *= fade;
    z += this.ez *= fade;
    yaw = wrapAngle(yaw + (this.eyaw *= fade));
    if (dt > 0) {
      // Reported speed follows what is actually drawn; a jump is not motion.
      const step = Math.hypot(x - this.x, z - this.z);
      if (step < TELEPORT / 2) this.speed += ((step / dt) * 1000 - this.speed) * (1 - Math.exp(-dt / SPEED_TAU));
      if (this.speed < 0.01) this.speed = 0;
    }
    this.x = out.x = x;
    this.y = out.y = y;
    this.z = out.z = z;
    this.yaw = out.yaw = yaw;
    this.shown = true;
    out.anim = cur.anim;
    out.flags = cur.flags;
    out.speed = this.speed;
    out.visible = true;
    return out;
  }
}
