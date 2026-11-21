// The quad race: three laps of the gravel track round the wheat fields, against the clock. The quad is driven
// like a kart: it slides when thrown into a bend with the drift button held (and leaves the bend faster for
// it), jumps, flies off the ramp, and is thrown forward by the pads painted on the track.
//
// The track is a path of the world (layout: PATHS 'race'); what stands on it is built here: the arch of the
// start, the line, the pads, the ramp, bales of straw in the bends, the board of the best times.
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';
import { RACE } from '../../layout/layout.js';
import { canvasBoard } from './Boards.js';
import { formatTime } from './course.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// how a quad behaves in the race (metres, seconds)
const TOP = 20, BOOST = 26.5, OFF = 0.55, ACCEL = 13, BRAKE = 20, BACK = 5, GRIP = 10, SLIDE = 2.3, GRAVITY = 24, RADIUS = 0.8;
const RAMP = { length: 5.2, half: 1.7, rise: 1.25 }, PAD = { length: 4.2, half: 1.9 };

export class Race {
  constructor(zone) {
    this.zone = zone;
    this.world = zone.world;
    this.data = zone.data;
    this.session = null;
  }

  build() {
    const path = this.data.meta.paths.find((p) => p.id === 'race');
    if (!path) return this;
    // the line of the track: points about two metres apart, closed; s = metres from the first one
    const raw = path.samples.slice(0, -1), n = raw.length;
    let s = 0;
    this.pts = raw.map((p, i) => {
      const q = raw[(i + 1) % n], l = Math.hypot(q[0] - p[0], q[1] - p[1]), tx = (q[0] - p[0]) / l, tz = (q[1] - p[1]) / l, pt = { x: p[0], z: p[1], y: p[2], s, tx, tz, nx: tz, nz: -tx, l };
      s += l;
      return pt;
    });
    this.length = s;
    this.width = path.width;
    const L = this.length, at = (u) => this.at(((u % 1) + 1) % 1 * L), h = (x, z) => this.data.heightAt(x, z);
    const parts = new Parts(), paint = parts.get('paint'), wood = parts.get('woodDark'), glow = parts.get('glow'), cloth = parts.get('matte');
    // a strip of paint laid on the track from `a` to `b` metres along it, `half` wide: it follows the ground
    const strip = (b, s0, s1, l0, l1, lift = 0.05) => {
      const p0 = this.at(s0), p1 = this.at(s1), c = (p, l) => { const x = p.x + p.nx * l, z = p.z + p.nz * l; return V(x, h(x, z) + lift, z); };
      b.quad(c(p0, l0), c(p0, l1), c(p1, l1), c(p1, l0));
    };

    // ---- the start: an arch over the track, a chequered line under it
    const S0 = RACE.start * L, st = this.at(S0);
    this.start = { s: S0, x: st.x, z: st.z };
    for (let i = 0; i < 10; i++) for (let j = 0; j < 2; j++) {
      const k = (i + j) % 2 ? [0.06, 0.06, 0.07] : [1.5, 1.5, 1.45];
      strip(paint.tint(k[0], k[1], k[2], 1), S0 + j * 0.6, S0 + (j + 1) * 0.6, -this.width / 2 + i * (this.width / 10), -this.width / 2 + (i + 1) * (this.width / 10));
    }
    const HW = this.width / 2 + 0.9, TOPY = 5.4;
    const posts = [-1, 1].map((g) => { const x = st.x + st.nx * g * HW, z = st.z + st.nz * g * HW; return V(x, h(x, z), z); });
    for (const p of posts) {
      for (let k = 0; k < 9; k++) { const c = k % 2 ? [1.5, 1.5, 1.45] : [0.9, 0.12, 0.1]; paint.tint(c[0], c[1], c[2], 1).box(p.x - 0.16, p.y - 0.3 + k * 0.66, p.z - 0.16, p.x + 0.16, p.y - 0.3 + (k + 1) * 0.66, p.z + 0.16); }
      this.zone.colliders.push({ type: 'circle', x: p.x, z: p.z, r: 0.32 });
    }
    const baseY = Math.max(posts[0].y, posts[1].y);
    wood.tint(0.9, 0.12, 0.1, 1).beam(V(posts[0].x, baseY + TOPY, posts[0].z), V(posts[1].x, baseY + TOPY, posts[1].z), 0.2, 0.2);
    const banner = canvasBoard(1024, 150, (ctx, w, hh) => {
      for (const x0 of [0, w - 150]) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#111' : '#f6f1e4'; ctx.fillRect(x0 + i * 75, j * 75, 75, 75); }
      ctx.fillStyle = '#b3541e'; ctx.fillRect(150, 0, w - 300, hh);
      ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = "900 104px Georgia, 'Times New Roman', serif";
      ctx.fillText(RACE.name.toUpperCase(), w / 2, hh / 2 + 6, w - 340);
    }, HW * 2, HW * 2 * (150 / 1024));
    banner.mesh.position.set(st.x, baseY + TOPY - 0.85, st.z);
    banner.mesh.rotation.y = Math.atan2(-st.tx, -st.tz); // it faces those who come up to the line
    banner.mesh.name = 'race:banner';
    this.zone.group.add(banner.mesh);

    // ---- the pads that throw the quad forward: arrows of light on the track
    this.pads = RACE.boosts.map((u) => {
      const s0 = u * L;
      for (let k = 0; k < 3; k++) {
        const a = s0 + k * (PAD.length / 3), tip = a + PAD.length / 3 - 0.25, mid = a + 0.55;
        glow.tint(1.0, 0.62, 0.08, 1);
        for (const g of [-1, 1]) {
          const p0 = this.at(a), p1 = this.at(mid), p2 = this.at(tip), c = (p, l) => { const x = p.x + p.nx * l, z = p.z + p.nz * l; return V(x, h(x, z) + 0.06, z); };
          const A = c(p0, g * PAD.half), B = c(p1, g * PAD.half), C = c(p2, 0), D = c(p1, 0);
          if (g > 0) glow.quad(A, B, C, D); else glow.quad(D, C, B, A);
        }
      }
      return { s: s0 + PAD.length / 2, hot: 0 };
    });

    // ---- the ramp: planks rising over five metres, in the middle of the track (one may go round it)
    {
      const s0 = RACE.jump * L, a = this.at(s0), b = this.at(s0 + RAMP.length), y0 = h(a.x, a.z), y1 = h(b.x, b.z) + RAMP.rise;
      const c = (p, l, y) => V(p.x + p.nx * l, y, p.z + p.nz * l);
      wood.tint(1.1, 0.85, 0.55, 1).quad(c(a, -RAMP.half, y0 + 0.03), c(a, RAMP.half, y0 + 0.03), c(b, RAMP.half, y1), c(b, -RAMP.half, y1), { tile: 1 });
      wood.tint(0.8, 0.6, 0.4, 1).quad(c(b, -RAMP.half, y1), c(b, RAMP.half, y1), c(b, RAMP.half, y1 - RAMP.rise - 0.4), c(b, -RAMP.half, y1 - RAMP.rise - 0.4), { tile: 1 });
      for (const g of [-1, 1]) {
        const A = c(a, g * RAMP.half, y0 + 0.03), B = c(b, g * RAMP.half, y1), C = c(b, g * RAMP.half, y1 - RAMP.rise - 0.4);
        if (g > 0) wood.tri(A, C, B, { tile: 1 }); else wood.tri(A, B, C, { tile: 1 });
        paint.tint(1.5, 1.1, 0.1, 1).beam(c(a, g * RAMP.half, y0 + 0.12), c(b, g * RAMP.half, y1 + 0.09), 0.12, 0.12);
      }
      this.ramp = { ax: a.x, az: a.z, tx: a.tx, tz: a.tz, y0, y1 };
      this.zone.platforms.push({ type: 'custom', clearance: 0.9, heightAt: (x, z) => this.rampAt(x, z) });
    }

    // ---- bales of straw on the outside of the bends
    {
      const pts = this.pts;
      let since = 99;
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[(i + 4) % n], turn = p.tx * q.tz - p.tz * q.tx; // > 0: the track turns towards +n
        since += p.l;
        if (Math.abs(turn) < 0.16 || since < 5.5 || Math.abs(p.s - S0) < 12) continue;
        since = 0;
        const g = turn > 0 ? -1 : 1, x = p.x + p.nx * g * (this.width / 2 + 1.5), z = p.z + p.nz * g * (this.width / 2 + 1.5), y = h(x, z);
        cloth.tint(1.45, 1.15, 0.5, 1).place(x, y, z, Math.atan2(p.tx, p.tz)).box(-0.45, 0, -0.75, 0.45, 0.8, 0.75).pop();
        paint.tint(0.8, 0.14, 0.12, 1).place(x, y, z, Math.atan2(p.tx, p.tz)).box(-0.47, 0.25, -0.2, 0.47, 0.55, 0.2, { faces: 'xXY' }).pop();
        this.zone.colliders.push({ type: 'circle', x, z, r: 0.75, y0: y - 1, y1: y + 1.2 });
      }
    }
    this.zone._add(parts, 'race');

    // ---- the paddock: where one asks to race, and the board of the best times
    const side = RACE.paddock, px = st.x + st.nx * side * (HW + 3.2) - st.tx * 5, pz = st.z + st.nz * side * (HW + 3.2) - st.tz * 5;
    this.paddock = { x: st.x + st.nx * side * (HW + 1.6) - st.tx * 2, z: st.z + st.nz * side * (HW + 1.6) - st.tz * 2, r: 4.2 };
    this.board = this.zone.scoreStand('race', px, pz, Math.atan2(st.nx * side, st.nz * side), { title: RACE.name.toUpperCase(), sub: `${RACE.laps} laps of the track on a quad · best times`, format: formatTime, width: 3.0, pixels: 0.85 });
    return this;
  }

  /** The track `s` metres from its first point: { x, z, y, tx, tz (the way one drives), nx, nz (to the right… of the map: see paddock) }. */
  at(s) {
    const pts = this.pts, L = this.length;
    s = ((s % L) + L) % L;
    let lo = 0, hi = pts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pts[mid].s <= s) lo = mid; else hi = mid - 1; }
    const p = pts[lo], q = pts[(lo + 1) % pts.length], t = (s - p.s) / p.l;
    return { x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, y: p.y + (q.y - p.y) * t, tx: p.tx, tz: p.tz, nx: p.tz, nz: -p.tx, i: lo };
  }

  /** Where (x, z) is along the track, looking round the point of index `hint`: { i, s, side (metres off its middle) }. */
  locate(x, z, hint, out = {}) {
    const pts = this.pts, n = pts.length;
    let best = Infinity;
    for (let k = -8; k <= 8; k++) {
      const i = (((hint + k) % n) + n) % n, p = pts[i];
      const t = clamp(((x - p.x) * p.tx + (z - p.z) * p.tz) / p.l, 0, 1), dx = x - p.x - p.tx * p.l * t, dz = z - p.z - p.tz * p.l * t, d = dx * dx + dz * dz;
      if (d < best) { best = d; out.i = i; out.s = p.s + p.l * t; out.side = dx * p.tz - dz * p.tx; }
    }
    return out;
  }

  /** The height of the ramp over (x, z), or null. */
  rampAt(x, z) {
    const r = this.ramp, u = (x - r.ax) * r.tx + (z - r.az) * r.tz, v = (x - r.ax) * r.tz - (z - r.az) * r.tx;
    return u >= 0 && u <= RAMP.length && Math.abs(v) <= RAMP.half ? r.y0 + 0.03 + (r.y1 - r.y0 - 0.03) * (u / RAMP.length) : null;
  }

  /** Is (x, z) in the paddock, where a race is asked for? */
  near(x, z) { return !!this.paddock && (x - this.paddock.x) ** 2 + (z - this.paddock.z) ** 2 < this.paddock.r ** 2; }

  /**
   * A race starts: the player is put on a quad behind the line; three, two, one… `io`: { play(sound, options),
   * note(text), go() (the clock starts) }. Returns the session — it is also the driver of the player (see
   * PlayerController.driver): { step(dt, player, control), camera(camera, dt), line, over, time (ms), close() }.
   */
  open(player, io) {
    const L = this.length, col = this.world.collision, data = this.data;
    const grid = this.at(this.start.s - 4.5);
    const S = {
      x: grid.x, z: grid.z, y: col.groundAt(grid.x, grid.z, 1e4), yaw: Math.atan2(grid.tx, grid.tz), vx: 0, vz: 0, vy: 0, grounded: true,
      count: 3.2, clock: 0, prog: -4.5, i: grid.i, s: this.start.s - 4.5, good: { s: this.start.s - 4.5 }, lost: 0, laps: 0, lapAt: 0,
      drift: 0, charge: 0, boost: 0, sound: 0, cam: null, fov: 62, tilt: 0,
    };
    const loc = {}, p = { x: 0, z: 0 };
    const reset = () => {
      const g = this.at(S.good.s);
      Object.assign(S, { x: g.x, z: g.z, y: col.groundAt(g.x, g.z, 1e4), yaw: Math.atan2(g.tx, g.tz), vx: 0, vz: 0, vy: 0, grounded: true, i: g.i, s: S.good.s, drift: 0, charge: 0, boost: 0, lost: 0 });
      io.play('respawn');
    };
    const session = {
      race: this, over: false, time: 0, line: '', laps: 0, state: S,
      step: (dt, pl, control) => {
        const inp = pl.input;
        let gas = control ? inp.move.y : 0, steer = control ? inp.move.x : 0;
        const wantDrift = control && inp.run, jump = control && inp.jump;
        if (S.count > 0) {
          const was = S.count;
          S.count -= dt;
          if (Math.ceil(S.count) !== Math.ceil(was) && S.count > 0) io.play('tick');
          if (was > 3.1 && S.count <= 3.1) io.play('tick');
          if (S.count <= 0) { io.play('start'); io.go(); } else { gas = 0; steer = 0; }
        } else if (!session.over) S.clock += dt;
        if (session.over) { gas = 0; steer = 0; }
        // ---- the heading, then the speed along it and across it
        const speed = Math.hypot(S.vx, S.vz), f0x = Math.sin(S.yaw), f0z = Math.cos(S.yaw), along0 = S.vx * f0x + S.vz * f0z;
        const drifting = S.grounded && wantDrift && speed > 7 && (S.drift !== 0 || Math.abs(steer) > 0.25);
        if (drifting) { if (!S.drift) S.drift = Math.sign(steer) || 1; S.charge += dt; if ((S.sound -= dt) <= 0) { S.sound = 0.34; io.play('drift', { volume: 0.5 }); } }
        else {
          if (S.drift && S.charge > 0.7) { S.boost = Math.max(S.boost, 0.7 + Math.min(0.9, S.charge * 0.45)); io.play('boost', { volume: 0.8 }); }
          S.drift = 0; S.charge = 0;
        }
        const turn = steer * (drifting ? 2.5 : 1.95) * clamp(Math.abs(along0) / 6, 0, 1) / (1 + 0.016 * Math.max(0, speed - 9)) * (along0 < -0.5 ? -1 : 1);
        if (S.grounded) S.yaw += turn * dt; else S.yaw += turn * 0.35 * dt;
        const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw), rx = fz, rz = -fx;
        let vf = S.vx * fx + S.vz * fz, vl = S.vx * rx + S.vz * rz;
        this.locate(S.x, S.z, S.i, loc);
        const on = Math.abs(loc.side) < this.width / 2 + 0.5, top = (S.boost > 0 ? BOOST : TOP) * (on ? 1 : OFF);
        if (S.boost > 0) S.boost -= dt;
        if (S.grounded) {
          if (gas > 0) { if (vf < top) vf = Math.min(top, vf + ACCEL * gas * (S.boost > 0 ? 1.8 : 1) * dt); } else if (gas < 0) vf = Math.max(-BACK, vf - (vf > 0 ? BRAKE : 6) * -gas * dt);
          vf -= vf * (on ? 0.22 : 1.3) * dt * (gas > 0 ? 0.3 : 1); // rolling to a stop when let go; the grass holds a quad back
          if (vf > top) vf -= (vf - top) * Math.min(1, dt * 2.6);
          vl *= Math.exp(-(drifting ? SLIDE : GRIP) * dt);
        }
        S.vx = vf * fx + vl * rx; S.vz = vf * fz + vl * rz;
        // ---- on the ground of the world: what is solid stops the quad, the edge of the valley too
        p.x = S.x + S.vx * dt; p.z = S.z + S.vz * dt;
        const wx = p.x, wz = p.z;
        col.resolve(p, RADIUS, S.y);
        col.confine(p);
        if ((p.x - wx) ** 2 + (p.z - wz) ** 2 > 1e-6) { const k = Math.exp(-dt * 7); S.vx *= k; S.vz *= k; }
        const before = S.y;
        S.x = p.x; S.z = p.z;
        const ground = col.groundAt(S.x, S.z, S.y + 0.7);
        if (S.grounded) {
          if (jump) { S.vy = 6.4; S.grounded = false; io.play('jump'); }
          else if (ground < S.y - 0.3 && speed > 4) { S.grounded = false; S.vy = Math.max(0, S.slope || 0); } // off a ramp, over a brow
          else { S.y += (ground - S.y) * Math.min(1, dt * 30); S.slope = (S.y - before) / Math.max(dt, 1e-4); }
        }
        if (!S.grounded) {
          S.vy -= GRAVITY * dt; S.y += S.vy * dt;
          if (S.y <= ground) { S.y = ground; S.grounded = true; S.slope = 0; if (S.vy < -5) io.play('land', { volume: 0.8 }); S.vy = 0; }
        }
        // ---- the pads
        for (const pad of this.pads) {
          if (pad.hot > 0) pad.hot -= dt;
          let d = loc.s - pad.s; d -= Math.round(d / L) * L;
          if (pad.hot <= 0 && S.grounded && Math.abs(d) < PAD.length / 2 && Math.abs(loc.side) < PAD.half) { pad.hot = 1.5; S.boost = 1.15; io.play('boost'); }
        }
        // ---- how far round: only what is driven on the track (or right beside it) counts
        if (Math.abs(loc.side) < this.width / 2 + 4) {
          let d = loc.s - S.s; d -= Math.round(d / L) * L;
          S.prog += d; S.s = loc.s; S.i = loc.i; S.lost = 0;
          if (on && S.grounded) S.good.s = loc.s;
        } else if ((S.lost += dt) > 3) { io.note('Back on the track!'); reset(); }
        const water = data.waterAt(S.x, S.z);
        if (water > -500 && water - data.heightAt(S.x, S.z) > 0.6 && S.y < water) { io.note('A quad does not float.'); reset(); }
        if (S.count <= 0 && !session.over) {
          const laps = Math.floor(S.prog / L);
          if (laps > S.laps) {
            S.laps = laps;
            if (laps >= RACE.laps) { session.over = true; session.time = Math.round(S.clock * 1000); io.play('victory'); }
            else { io.play('lap'); io.note(`Lap ${laps}: ${formatTime(Math.round((S.clock - S.lapAt) * 1000))}`); }
            S.lapAt = S.clock;
          }
        }
        session.laps = S.laps;
        // ---- what the player is, as far as the world is concerned
        const slip = clamp(vl / 9, -1, 1);
        pl.pos.set(S.x, S.y, S.z);
        pl.yaw = S.yaw - slip * 0.35; // the quad points into the slide
        S.tilt += ((S.grounded ? -steer * 0.1 * clamp(speed / TOP, 0, 1) - slip * 0.12 : 0) - S.tilt) * Math.min(1, dt * 8);
        pl.roll = S.tilt;
        pl.pitch = S.grounded ? clamp(-(S.slope || 0) / Math.max(4, speed), -0.5, 0.5) * 0.9 : clamp(-S.vy / 26, -0.45, 0.45);
        pl.speed = speed; pl.grounded = S.grounded;
        session.speed = speed;
        const lap = Math.min(RACE.laps, S.laps + 1);
        session.line = S.count > 0 ? `${RACE.name} · ${Math.ceil(S.count) > 3 ? 'ready' : Math.ceil(S.count)}…` : session.over ? `${RACE.name} · ${formatTime(session.time)}` : `Lap ${lap}/${RACE.laps} · ${formatTime(Math.round(S.clock * 1000))} · ${Math.round(speed * 3.6)} km/h${S.boost > 0 ? ' ▲' : ''}`;
      },
      /** The camera of the race: low behind the quad, turning with where it goes rather than where it points. */
      camera: (cam, dt) => {
        const speed = Math.hypot(S.vx, S.vz), going = speed > 3 ? Math.atan2(S.vx, S.vz) : S.yaw;
        // (angles are mixed through their difference, so that the turn of the compass does not matter)
        const target = S.yaw + 0.6 * Math.atan2(Math.sin(going - S.yaw), Math.cos(going - S.yaw));
        if (S.cam === null) S.cam = target;
        S.cam += Math.atan2(Math.sin(target - S.cam), Math.cos(target - S.cam)) * Math.min(1, dt * 5.5);
        const back = 6.0 + speed * 0.06, up = 2.5 + speed * 0.02, fx = Math.sin(S.cam), fz = Math.cos(S.cam);
        let cx = S.x - fx * back, cz = S.z - fz * back, cy = S.y + up;
        const floor = col.groundAt(cx, cz, cy + 2) + 0.6;
        if (cy < floor) cy = floor;
        cam.position.set(cx, cy, cz);
        cam.lookAt(S.x + fx * 4, S.y + 1.1, S.z + fz * 4);
        S.fov += (62 + 15 * clamp(speed / TOP, 0, 1.4) + (S.boost > 0 ? 6 : 0) - S.fov) * Math.min(1, dt * 4);
        return S.fov;
      },
      close: () => { if (this.session === session) this.session = null; player.pitch = 0; player.roll = 0; },
    };
    this.session = session;
    return session;
  }
}
