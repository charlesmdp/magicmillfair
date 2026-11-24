// The Little Regatta: what is seen of it and how it is raced. Its rules are in water.js; here it is built — the
// buoys of the gates, the banner of the line, the four boats, the stand on the bank one steers from, the
// board — and a race is run.
//
// Like the quad race and the slide, a race is a session that drives the player (see PlayerController.driver):
// the player stays at the stand, the camera rides behind their boat, the game reads the session's line for the
// screen. Nothing here knows about the keyboard, the network or the leaderboards. (The boats are seen only by
// who races: each visitor has a race of their own.)
import * as THREE from 'three';
import { Parts } from '../../../props/MeshBuilder.js';
import { LAYER } from '../../../../render/Shadows.js';
import { ANIM } from '../../../../player/Character.js';
import { canvasBoard } from '../Boards.js';
import { formatTime } from '../course.js';
import { REGATTA, course, startRace, stepRace, botHelm, ranking } from './water.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RED = [0.95, 0.1, 0.12], WHITE = [1.6, 1.6, 1.55], NAVY = [0.07, 0.07, 0.2], YELLOW = [1.6, 1.3, 0.12], BLUE = [0.16, 0.36, 1.0], GREEN = [0.15, 0.85, 0.3], CREAM = [1.3, 1.17, 0.9], DARK = [0.05, 0.06, 0.08];
const HULLS = [RED, BLUE, YELLOW, GREEN]; // the visitor's, then the three that sail by themselves
const PLACES = ['1st', '2nd', '3rd', '4th'];

export class Boats {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'boats';
    this.session = null;
    this.best = 0; // this visitor's best time, ms
    this.depth = (x, z) => this.data.depthAt(x, z);
  }

  build() {
    const world = this.world, mats = world.materials, R = REGATTA, C = course(), y0 = R.level;
    const parts = new Parts(), paint = parts.get('paint'), wood = parts.get('woodDeck'), wet = parts.get('woodWet');
    // ---- the gates: two buoys each, red to port and green to starboard, a pennant on each
    const buoy = (x, z, tone) => {
      paint.tint(...tone, 1).place(x, y0, z).lathe([[0, -0.45], [0.3, -0.3], [0.42, -0.02], [0.4, 0.12], [0.22, 0.42], [0.06, 0.5]], 10).pop();
      paint.tint(...WHITE, 1).cylinder(x, y0 + 0.12, z, 0.405, 0.33, 0.1, 10, { capTop: false, capBottom: false });
      paint.tint(...NAVY, 1).cylinder(x, y0 + 0.45, z, 0.025, 0.02, 0.85, 5);
      paint.tint(...tone, 1).box(x, y0 + 1.05, z - 0.012, x + 0.3, y0 + 1.27, z + 0.012);
    };
    C.gates.forEach((g) => { buoy(g.left[0], g.left[1], RED); buoy(g.right[0], g.right[1], GREEN); });
    // ---- the line: a banner over the first gate, between two masts on floats
    const g0 = C.gates[0];
    for (const q of [g0.left, g0.right]) paint.tint(...CREAM, 1).cylinder(q[0] - g0.rx * 0 + (q === g0.left ? -g0.rx : g0.rx) * 0.75, y0, q[1] + (q === g0.left ? -g0.rz : g0.rz) * 0.75, 0.07, 0.05, 3.3, 6);
    const banner = canvasBoard(1024, 96, (ctx, w, h) => {
      ctx.fillStyle = '#12122e'; ctx.fillRect(0, 0, w, h);
      for (let k = 0; k < 24; k++) { ctx.fillStyle = k % 2 ? '#f6e7b8' : '#12122e'; ctx.fillRect(k * (w / 24), 0, w / 24, 14); ctx.fillRect(k * (w / 24) + w / 48, h - 14, w / 24, 14); }
      ctx.fillStyle = '#f2c14e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = "700 52px Georgia, 'Times New Roman', serif"; ctx.fillText(R.name.toUpperCase(), w / 2, h / 2 + 2);
    }, R.width + 1.5, (R.width + 1.5) * (96 / 1024), { both: true });
    banner.mesh.position.set(g0.x, y0 + 2.95, g0.z); banner.mesh.rotation.y = g0.yaw; banner.mesh.name = 'boats-banner';
    this.group.add(banner.mesh);
    // ---- the stand: on the bank nearest the line — a few planks, a desk with its aerial, the board of the best time
    const S = R.stand, tl = Math.hypot(...S.towards), tx = S.towards[0] / tl, tz = S.towards[1] / tl;
    let d = 0;
    while (d < 60 && this.depth(S.from[0] + tx * d, S.from[1] + tz * d) > 0.05) d += 0.25;
    const sx = S.from[0] + tx * (d + 1.6), sz = S.from[1] + tz * (d + 1.6), sy = Math.max(this.data.heightAt(sx, sz), y0 + 0.2), yaw = Math.atan2(-tx, -tz); // (one faces the water)
    this.stand = { x: sx, y: sy + 0.12, z: sz, yaw };
    wood.place(sx, sy, sz, yaw);
    wood.tint(1, 1, 1, 1).box(-1.5, -0.5, -1.2, 1.5, 0.12, 1.2);
    wood.tint(0.85, 0.85, 0.85, 1).box(-0.55, 0.12, 0.75, 0.55, 0.95, 1.1);
    wood.pop();
    paint.place(sx, sy, sz, yaw);
    paint.tint(...NAVY, 1).box(-0.5, 0.95, 0.72, 0.5, 1.0, 1.13);
    paint.tint(...RED, 1).cylinder(-0.3, 1.0, 0.92, 0.035, 0.03, 0.14, 6);
    paint.tint(...DARK, 1).cylinder(0.38, 1.0, 0.92, 0.012, 0.008, 0.9, 4);
    for (const x of [-1.42, 1.42]) paint.tint(...CREAM, 1).cylinder(x, 0.12, -1.12, 0.06, 0.05, 2.5, 6);
    paint.pop();
    wet.tint(0.9, 0.9, 0.9, 1).cylinder(sx, sy - 1.6, sz, 0.1, 0.1, 1.6, 6);
    this.group.add(parts.toMeshes(mats, { name: 'boats-course', layers: [LAYER.STATIC_CASTER] }));
    const sign = canvasBoard(512, 150, (ctx, w, h) => {
      ctx.fillStyle = '#12122e'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = "700 50px Georgia, 'Times New Roman', serif"; ctx.fillText(R.name.toUpperCase(), w / 2, 50, w * 0.9);
      ctx.fillStyle = '#f2c14e'; ctx.font = '600 21px system-ui, sans-serif'; ctx.fillText(`${R.laps} LAPS OF THE POND · A BOAT ON THE RADIO`, w / 2, 92, w * 0.9);
      ctx.fillStyle = '#ffffff'; ctx.font = '600 24px ui-monospace, Menlo, monospace'; ctx.fillText(this.best ? `your best  ${formatTime(this.best)}` : 'no time yet', w / 2, 124, w * 0.9);
    }, 2.84, 0.83, { both: true });
    sign.mesh.position.set(sx - Math.sin(yaw) * 1.12, sy + 2.25, sz - Math.cos(yaw) * 1.12); sign.mesh.rotation.y = yaw; sign.mesh.name = 'boats-sign';
    this.sign = sign;
    this.group.add(sign.mesh);

    // ---- the boats: a hull, a cabin, an aerial with its pennant — a little over a metre long, the bow towards +z
    this.hulls = HULLS.map((tone, k) => {
      const p = new Parts(), b = p.get('paint');
      b.tint(...tone, 1).box(-0.24, -0.06, -0.6, 0.24, 0.15, 0.26).box(-0.17, -0.06, 0.26, 0.17, 0.14, 0.5).box(-0.09, -0.05, 0.5, 0.09, 0.13, 0.68);
      b.tint(...WHITE, 1).box(-0.25, 0.15, -0.6, 0.25, 0.18, 0.26).box(-0.16, 0.18, -0.36, 0.16, 0.33, 0.04);
      b.tint(...DARK, 1).box(-0.15, 0.2, 0.04, 0.15, 0.31, 0.07).box(-0.2, 0.18, -0.58, 0.2, 0.26, -0.44);
      b.tint(...tone, 1).box(-0.26, 0.3, -0.62, 0.26, 0.33, -0.5);
      b.tint(...DARK, 1).cylinder(0.1, 0.33, -0.2, 0.008, 0.006, 0.62, 4);
      b.tint(...tone, 1).box(0.1, 0.83, -0.205, 0.26, 0.95, -0.195);
      const g = p.toMeshes(mats, { name: `boats-boat${k}`, layers: [] });
      this.group.add(g);
      return g;
    });
    // what shows the gate to take: an arrow of light over its middle
    { const p = new Parts(); p.get('glow').tint(1.4, 1.1, 0.25, 1).cylinder(0, 0, 0, 0.0, 0.38, 0.55, 4).cylinder(0, 0.55, 0, 0.13, 0.13, 0.5, 4); this.arrow = p.toMeshes(mats, { name: 'boats-arrow', layers: [] }); this.arrow.visible = false; this.group.add(this.arrow); }
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    this._moor();
    return this;
  }

  /** Puts a boat where it is: on the water, heeling as it turns, nose up with way on. */
  _show(k, b, clock) {
    const g = this.hulls[k], way = b.way || 0;
    g.position.set(b.x, REGATTA.level + 0.03 + Math.sin(clock * 2.3 + k) * 0.015 + Math.min(0.07, Math.abs(way) * 0.006), b.z);
    g.rotation.set(-Math.min(0.16, Math.max(0, way) * 0.014), b.yaw, (b.helm || 0) * Math.min(1, Math.abs(way) / 6) * 0.28, 'YXZ');
    g.updateMatrixWorld(true);
  }

  /** With no race on, the boats lie on the grid behind the line. */
  _moor() { startRace(this.depth).boats.forEach((b, k) => this._show(k, b, k * 3)); this.arrow.visible = false; }

  /** This visitor's best time (ms): what the board of the stand shows. */
  setBest(ms) { this.best = ms || 0; this.sign?.redraw(); }

  /** Is the player standing at the stand, where one asks to race? */
  near(x, z) { return (x - this.stand.x) ** 2 + (z - this.stand.z) ** 2 < 2.2 * 2.2; }

  /**
   * A race starts: the player stays at the stand, their boat is on the grid; three, two, one… `io`: { play(sound,
   * options), note(text), splash(x, y, z, strength) }. Returns the session — it is also the driver of the player:
   *   step(dt, player, control), camera(camera, dt) → the angle of view, line (for the screen), over (the line is
   *   crossed: `time` in ms and `place` are the race's), ended (a moment later: the game lets go — see `drop`),
   *   drop(player), close(), auto (true: the boat sails by itself).
   */
  open(player, io) {
    const R = REGATTA, C = course(), race = startRace(this.depth), events = [], input = { throttle: 0, helm: 0, burst: false };
    const S = { count: 3.4, cam: null, look: V(0, 0, 0), fov: 60, after: 0, shake: 0, wake: 0, acc: 0 }, _t = V(0, 0, 0), me = race.boats[0];
    const session = {
      boats: this, over: false, ended: false, time: 0, place: 0, line: '', riding: false, anim: ANIM.idle, state: race, auto: false,
      step: (dt, pl, control) => {
        const inp = pl.input;
        if (S.count > 0) {
          const was = S.count;
          S.count -= dt;
          if (Math.ceil(S.count) !== Math.ceil(was) && S.count > 0 && S.count <= 3) io.play('tick');
          if (S.count <= 0) io.play('start');
        } else if (session.auto) {
          S.acc += Math.min(dt, 0.25);
          while (S.acc >= R.step) { S.acc -= R.step; botHelm(race, input); stepRace(race, R.step, input, events); }
        } else {
          input.throttle = control ? inp.move.y : 0; input.helm = control ? inp.move.x : 0; input.burst = control && !!inp.jump;
          stepRace(race, dt, input, events);
        }
        for (const e of events) this._tell(e, race, io, S);
        events.length = 0;
        race.boats.forEach((b, k) => this._show(k, b, race.clock));
        // (a little foam behind what moves)
        S.wake -= dt;
        if (S.wake <= 0) { S.wake = 0.22; for (const b of race.boats) if (Math.abs(b.way) > 2.5) io.splash?.(b.x - Math.sin(b.yaw) * 0.6, R.level, b.z - Math.cos(b.yaw) * 0.6, 0.1 + Math.abs(b.way) * 0.014); }
        const g = C.gates[me.gate];
        this.arrow.visible = !me.done;
        this.arrow.position.set(g.x, R.level + 1.5 + Math.sin(race.clock * 4) * 0.12, g.z); this.arrow.rotation.y = race.clock * 2; this.arrow.updateMatrixWorld(true);
        // the player stays at the stand, looking at the water
        pl.pos.set(this.stand.x, this.stand.y, this.stand.z); pl.yaw = this.stand.yaw; pl.pitch = 0; pl.roll = 0; pl.speed = 0; pl.grounded = true;
        if (race.over) {
          S.after += dt;
          if (!session.over) { session.over = true; session.time = race.time; session.place = race.place; }
          if (S.after > 2.6) session.ended = true;
        }
        const place = PLACES[ranking(race).indexOf(me)];
        session.line = S.count > 0 ? `${R.name} · ${Math.ceil(S.count) > 3 ? 'ready' : Math.ceil(S.count)}…`
          : race.over ? `${R.name} · ${formatTime(race.time)} · ${PLACES[race.place - 1]}`
            : `Lap ${Math.min(R.laps, me.lap + 1)}/${R.laps} · ${formatTime(Math.round(race.clock * 1000))} · ${place} · ${Math.round(Math.abs(me.way) * 3.6)} km/h${me.burst > 0 ? ' ▲' : me.ready <= 0 ? ' · burst ready' : ''}`;
      },
      /** The camera of a race: low over the water behind one's boat, looking where it goes. */
      camera: (cam, dt) => {
        const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw), v = Math.abs(me.way);
        _t.set(me.x - fx * (4.2 + v * 0.1), R.level + 1.75 + v * 0.04, me.z - fz * (4.2 + v * 0.1));
        if (!S.cam) S.cam = _t.clone(); else S.cam.lerp(_t, Math.min(1, dt * 5));
        _t.set(me.x + fx * 3.2, R.level + 0.35, me.z + fz * 3.2);
        S.look.lerp(_t, S.look.lengthSq() ? Math.min(1, dt * 9) : 1);
        cam.position.copy(S.cam);
        if (S.shake > 0) { S.shake = Math.max(0, S.shake - dt * 2.5); cam.position.y += (Math.random() - 0.5) * S.shake * 0.25; }
        cam.up.set(0, 1, 0);
        cam.lookAt(S.look);
        S.fov += (60 + v * 1.7 + (me.burst > 0 ? 6 : 0) - S.fov) * Math.min(1, dt * 4);
        return S.fov;
      },
      /** The race is over and the game lets go: the player is where they stood. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.teleport(this.stand.x, this.stand.z, this.stand.yaw); session.close(); },
      close: () => { if (this.session === session) this.session = null; this._moor(); },
    };
    this.session = session;
    session.step(0, player, false);
    return session;
  }

  /** What happened to the visitor's boat in a step of the race, told to the player. */
  _tell(e, race, io, S) {
    if (e.type === 'gate') io.play('checkpoint', { volume: 0.35, rate: 1.3 });
    else if (e.type === 'lap') { io.play('lap'); io.note(`Lap ${e.lap + 1} of ${REGATTA.laps} — ${formatTime(e.time)}`); }
    else if (e.type === 'missed') { io.play('fail', { volume: 0.5 }); io.note('Outside the buoys! Back through that gate.'); }
    else if (e.type === 'bank' || e.type === 'buoy' || e.type === 'boat') { io.play('hit', { volume: e.type === 'boat' ? 0.5 : 0.8 }); S.shake = 0.8; }
    else if (e.type === 'burst') io.play('boost', { volume: 0.8 });
    else if (e.type === 'finish') { io.play('victory'); io.note(`${PLACES[e.place - 1]} — ${formatTime(e.time)}`); }
  }
}
