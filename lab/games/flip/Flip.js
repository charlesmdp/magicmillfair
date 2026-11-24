// Head Over Heels: what is seen of it and how it is run. Its rules are in rules.js; here it is built — a line
// of girders hung from a gantry on piles over the sea, along the south side of the pier: every girder a magnet,
// red on top (one stands on it), blue underneath (one hangs from it, head down); blocks in yellow and navy
// that one passes on the other side; flags, sparks, bulbs — and a run is run: a session that drives the player
// (see PlayerController.driver), seen from the sea, side on, the pier and the big wheel behind.
import * as THREE from 'three';
import { Parts } from '../../../src/world/props/MeshBuilder.js';
import { staticCaster } from '../../../src/render/Shadows.js';
import { surfaceMaterial } from '../../../src/render/SurfaceMaterial.js';
import { ANIM } from '../../../src/player/Character.js';
import { canvasBoard } from '../../../src/world/zones/games/Boards.js';
import { formatTime } from '../../../src/world/zones/games/course.js';
import { PIER } from '../../../src/world/layout/layout.js';
import { V, clamp, gateArch } from '../kit.js';
import { FLIP, FLAGS, startRun, stepRun, lineAt, speedAt, stretchAt, scoreOf, botInput } from './rules.js';

const CREAM = [1.32, 1.2, 0.95], RED = [1.0, 0.1, 0.1], BLUE = [0.16, 0.5, 2.0], NAVY = [0.07, 0.08, 0.2], YELLOW = [1.7, 1.3, 0.1], GOLD = [1.5, 1.05, 0.2];
// (what carries the rail stands behind the line and is seen through it: pale, so that it is not taken for something to run into)
const STEEL = [0.5, 0.54, 0.62], PALE = [0.86, 0.9, 0.98], WHITE = [1.5, 1.5, 1.45], BLACK = [0.05, 0.05, 0.06];
const TONES = [RED, YELLOW, [0.15, 0.85, 0.35], [0.75, 0.3, 1.0]]; // the pennants of the flags
const W = 0.9; // m: half the depth of a girder (the runner runs along its middle)
const TOP = 10.6; // m: the underside of the rail the girders hang from
const HB = FLIP.body.tall / 2;
const P = (x, y, z) => new THREE.Vector3(x, y, z);

export class Flip {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'flip';
    this.session = null;
    this.best = 0;
    // the heading of who runs the line (a heading of the valley: 0 looks south), and the plan of the line
    this.yaw = Math.PI / 2 - PIER.heading;
    this._p = {};
  }

  /** A place of the line in the world: `s` along it, `y` over the sea, `aside` to the south of it. */
  at(s, y = 0, aside = 0, out = V(0, 0, 0)) { const p = lineAt(s, aside, this._p); return out.set(p.x, y, p.z); }

  build() {
    const world = this.world, mats = world.materials, R = FLIP, cast = staticCaster(world.engine.tier);
    // ---- the line is built in a frame of its own: x along it, y up, z towards the sea side (who looks at it)
    const line = (this.line = new THREE.Group());
    line.name = 'flip-line';
    const o = lineAt(0, 0);
    line.position.set(o.x, 0, o.z);
    line.rotation.y = -PIER.heading;
    const parts = new Parts(), paint = parts.get('paint'), matte = parts.get('matte'), piles = parts.get('woodWet'), glow = parts.get('glow');
    // the girders: a cream web between a red flange and a blue one, a navy plate on each end
    for (const g of R.girders) {
      if (g.kind === 'stud' || g.kind === 'fang') {
        // a block to be passed on the other side: bands of yellow and navy, a point towards who comes
        const n = 3, h = (g.top - g.bottom) / n;
        for (let k = 0; k < n; k++) paint.tint(...(k % 2 ? NAVY : YELLOW), 1).box(g.from, g.bottom + k * h, -W + 0.12, g.to, g.bottom + (k + 1) * h, W - 0.12);
        continue;
      }
      paint.tint(...CREAM, 1).box(g.from + 0.08, g.bottom + 0.08, -W + 0.1, g.to - 0.08, g.top - 0.08, W - 0.1, { faces: 'yYzZ' });
      paint.tint(...RED, 1).box(g.from, g.top - 0.08, -W, g.to, g.top, W);
      paint.tint(...BLUE, 1).box(g.from, g.bottom, -W, g.to, g.bottom + 0.08, W);
      for (const x of [g.from, g.to - 0.08]) paint.tint(...NAVY, 1).box(x, g.bottom + 0.08, -W + 0.04, x + 0.08, g.top - 0.08, W - 0.04);
      // (hung from the rail above by two rods, at its back)
      const hang = g.to - g.from > 2 ? [g.from + 0.5, g.to - 0.5] : [(g.from + g.to) / 2];
      for (const x of hang) if (x > -5.5) matte.tint(...STEEL, 1).rod(P(x, g.top, -W + 0.06), P(x, TOP, -W + 0.06), 0.03, 5, { caps: false });
    }
    // the rail the girders hang from, and the gallows that carry it: two piles in the sea, a mast, an arm over the line
    const x0 = -6, x1 = R.length + 3.4;
    paint.tint(...NAVY, 1).box(x0, TOP, -W - 0.12, x1, TOP + 0.3, -W + 0.24);
    const bents = [];
    for (let x = -4; x <= x1; x += 15.2) bents.push(x);
    for (const x of bents) {
      const w = this.at(x, 0, -4.6), bed = Math.min(-0.6, this.data.heightAt(w.x, w.z)) - 0.7;
      for (const z of [-3.9, -5.3]) piles.tint(0.95, 0.9, 0.85, 1).cylinder(x, bed, z, 0.2, 0.17, 2.6 - bed, 8);
      piles.tint(0.95, 0.9, 0.85, 1).beam(P(x, 2.25, -5.6), P(x, 2.25, -3.6), 0.22, 0.22);
      paint.tint(...PALE, 1).box(x - 0.1, 2.36, -4.7, x + 0.1, TOP + 0.95, -4.5);
      paint.tint(...PALE, 1).box(x - 0.09, TOP + 0.5, -4.6, x + 0.09, TOP + 0.72, -W + 0.3);
      paint.tint(...PALE, 1).beam(P(x, TOP - 1.9, -4.6), P(x, TOP + 0.5, -2.2), 0.1, 0.1);
      paint.tint(...STEEL, 1).box(x - 0.07, TOP + 0.3, -W - 0.05, x + 0.07, TOP + 0.5, -W + 0.2);
      paint.tint(...GOLD, 1).place(x, TOP + 0.95, -4.6).lathe([[0.001, 0.3], [0.1, 0.25], [0.15, 0.13], [0.1, 0.02], [0.001, 0]], 8).pop();
    }
    // a string of bulbs under the rail, sagging from arm to arm
    for (let k = 0; k + 1 < bents.length; k++) {
      const a = bents[k], b = bents[k + 1], n = 9;
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const t = i / n, p = P(a + (b - a) * t, TOP - 0.1 - 1.5 * t * (1 - t), -W - 0.3);
        if (prev) matte.tint(...BLACK, 1).rod(prev, p, 0.012, 4, { caps: false });
        if (i > 0 && i < n) glow.tint(...(i % 2 ? [1.5, 1.2, 0.5] : [1.5, 0.5, 0.4]), 1).place(p.x, p.y - 0.1, p.z).lathe([[0.001, -0.09], [0.075, -0.05], [0.09, 0.02], [0.05, 0.08], [0.001, 0.1]], 6).pop();
        prev = p;
      }
    }
    // the flags: a pole at the back of the girder, a pennant
    FLAGS.forEach((f, k) => {
      paint.tint(...CREAM, 1).cylinder(f.s, f.y, -W + 0.12, 0.035, 0.03, 2.5, 6);
      const tone = TONES[k % TONES.length], a = P(f.s + 0.03, f.y + 2.45, -W + 0.12), b = P(f.s + 0.03, f.y + 1.85, -W + 0.12), c = P(f.s + 1.0, f.y + 2.15, -W + 0.12);
      paint.tint(...tone, 1).tri(a, b, c).tri(a, c, b);
    });
    // the start: stairs from the sand up to the deck, a horseshoe magnet over it
    {
      const from = -11, run = 5, foot = this.at(from, 0, 0), y0 = this.data.heightAt(foot.x, foot.z) - 0.1, top = R.levels.floor, n = 10, rise = (x) => y0 + ((top - y0) * (x - from)) / run;
      for (let k = 0; k < n; k++) { const xa = from + (run * k) / n; paint.tint(...(k % 2 ? CREAM : RED), 1).box(xa, rise(xa + run / n) - 0.12, -W, xa + run / n + 0.03, rise(xa + run / n), W); }
      for (const z of [-W + 0.05, W - 0.05]) { paint.tint(...NAVY, 1).beam(P(from, y0 + 0.95, z), P(from + run, top + 0.95, z), 0.07, 0.07); for (const x of [from + 0.1, from + run / 2, from + run - 0.05]) paint.tint(...NAVY, 1).box(x - 0.04, rise(x) - 0.2, z - 0.04, x + 0.04, rise(x) + 0.95, z + 0.04); }
      const cx = 1, cy = TOP + 2.3, r = 0.85, n2 = 12;
      for (let i = 0; i < n2; i++) { const a0 = (i / n2) * Math.PI, a1 = ((i + 1) / n2) * Math.PI; paint.tint(...RED, 1).rod(P(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, -W + 0.06), P(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, -W + 0.06), 0.2, 8); }
      for (const side of [-1, 1]) { paint.tint(...RED, 1).rod(P(cx + side * r, cy, -W + 0.06), P(cx + side * r, cy - 0.75, -W + 0.06), 0.2, 8); paint.tint(...WHITE, 1).rod(P(cx + side * r, cy - 0.75, -W + 0.06), P(cx + side * r, cy - 1.25, -W + 0.06), 0.2, 8); }
      paint.tint(...STEEL, 1).box(cx - 0.05, TOP + 0.3, -W, cx + 0.05, cy + r - 0.15, -W + 0.12);
    }
    // the end: black and white squares along the last girder, an arch, a bell
    {
      const g = R.girders[R.girders.length - 1], n = 6, h = (g.top - g.bottom - 0.16) / 2, y = g.bottom + 0.08;
      for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) paint.tint(...((i + j) % 2 ? WHITE : BLACK), 1).box(R.length - 1.5 + i * 0.5, y + j * h, W - 0.1, R.length - 1.0 + i * 0.5, y + (j + 1) * h, W - 0.07, { faces: 'Z' });
      for (const z of [-W + 0.1, W - 0.1]) for (let hh = g.top, k = 0; hh < g.top + 3.9; hh += 0.5, k++) paint.tint(...(k % 2 ? CREAM : NAVY), 1).cylinder(R.length, hh, z, 0.1, 0.1, Math.min(0.5, g.top + 3.9 - hh), 8);
      paint.tint(...NAVY, 1).box(R.length - 0.1, g.top + 3.9, -W, R.length + 0.1, g.top + 4.15, W);
      paint.tint(...GOLD, 1).place(R.length, g.top + 3.35, 0).lathe([[0.03, 0.45], [0.16, 0.4], [0.27, 0.12], [0.37, -0.04], [0.41, -0.12]], 10).pop();
    }
    line.add(parts.toMeshes(mats, { name: 'flip-gantry', layers: cast }));
    // the name of each stretch, on the rail over where it begins (read from the sea, as the run is seen)
    R.stretches.forEach((stretch, k) => {
      const board = canvasBoard(512, 80, (ctx, w, h) => {
        ctx.fillStyle = '#12122e'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 4; ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = "700 46px Georgia, 'Times New Roman', serif";
        ctx.fillText(`${k + 1} · ${stretch.name.toUpperCase()}`, w / 2, h / 2 + 2, w * 0.92);
      }, 3.6, 0.5625, { both: true });
      board.mesh.position.set(stretch.from + 2.6, TOP + 0.6, -W + 0.3); board.mesh.name = 'flip-stretch';
      line.add(board.mesh);
    });
    // ---- the sparks: one mesh for all of them, turned and bobbed by the clock; one's own catches are hidden
    const spark = new Parts();
    spark.get('paint').tint(1.7, 1.25, 0.15, 1).lathe([[0.001, -0.46], [0.3, 0], [0.001, 0.46]], 4);
    this.sparkMat = surfaceMaterial({ name: 'flip-spark', rough: 0.35, spec: 0.3, emissive: [1.15, 0.72, 0.04] });
    const sparks = (this.sparks = new THREE.InstancedMesh(spark.get('paint').build(), this.sparkMat, R.sparks.length));
    sparks.name = 'flip-sparks'; sparks.frustumCulled = false; sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    line.add(sparks);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._sc = new THREE.Vector3();
    this._sparks(0, 0);
    this.group.add(line);
    // ---- the gate, on the sand before the stairs: where one asks to run; one's own best under it
    const gp = this.at(R.gate, 0, 0), gy = this.data.heightAt(gp.x, gp.z);
    this.gate = { x: gp.x, y: gy, z: gp.z, yaw: this.yaw };
    const here = new Parts();
    gateArch(this.group, here.get('paint'), gp.x, gy, gp.z, this.yaw, R.name.toUpperCase(), 'RUN THE GIRDERS · ONE KEY TURNS GRAVITY OVER', { tone: BLUE, ink: '#12122e' });
    this.group.add(here.toMeshes(mats, { name: 'flip-gate', layers: cast }));
    this.board = canvasBoard(512, 96, (ctx, w, h) => {
      ctx.fillStyle = '#12122e'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 5; ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 44px system-ui, sans-serif';
      ctx.fillText(this.best ? `YOUR BEST  ${formatTime(this.best)}` : 'NO TIME OF YOURS YET', w / 2, h / 2 + 2, w * 0.9);
    }, 2.6, 0.49, { both: true });
    this.board.mesh.position.set(gp.x, gy + 2.05, gp.z); this.board.mesh.rotation.y = this.yaw; this.board.mesh.name = 'flip-best';
    this.group.add(this.board.mesh);
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    return this;
  }

  setBest(ms) { this.best = ms || 0; this.board?.redraw(); }
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.4 * 2.4; }

  /** Puts the sparks where the clock says (they turn, they bob); those of `got` (bits) are not shown. */
  _sparks(clock, got) {
    const m = this._m, list = FLIP.sparks;
    for (let k = 0; k < list.length; k++) {
      const shown = !(got & (1 << k)), sc = shown ? 1 + 0.12 * Math.sin(clock * 5 + k * 1.7) : 0.0001;
      this._e.set(0, clock * 2.4 + k, 0);
      m.compose(P(list[k][0], list[k][1] + (shown ? 0.07 * Math.sin(clock * 3 + k) : 0), 0), this._q.setFromEuler(this._e), this._sc.set(sc, sc, sc));
      this.sparks.setMatrixAt(k, m);
    }
    this.sparks.instanceMatrix.needsUpdate = true;
  }

  /**
   * A run is asked for: the player is put on the deck at the start, and runs after a count of three. `io`:
   * { play, note, splash }. Returns the session — the driver of the player: see lab/games/kit.js. `auto`: true (it
   * runs by itself, any way to the end) or 'keen' (by itself, after every spark).
   */
  open(player, io) {
    const R = FLIP, st = startRun(R.count), events = [], input = { flip: false };
    // what is shown that the rules do not keep: how far round the runner has turned, where it tumbles after a fall
    const S = { turn: 0, want: 0, cam: 0, look: null, after: 0, acc: 0, fall: null, touch: false }, pos = V(0, 0, 0), t = V(0, 0, 0);
    const session = {
      flip: this, over: false, ended: false, score: 0, time: 0, line: '', riding: false, anim: ANIM.idle, state: st, auto: false,
      step: (dt, pl, control) => {
        const inp = pl.input;
        S.touch = !!inp?.isTouch;
        if (session.auto) {
          S.acc += Math.min(dt, 0.25);
          while (S.acc >= R.step && !st.over) { S.acc -= R.step; botInput(st, input, session.auto === 'keen' ? 'keen' : 'mid'); stepRun(st, R.step, input, events); }
        } else {
          input.flip = control && !!inp.jump;
          if (!st.over) stepRun(st, dt, input, events);
        }
        for (const e of events) {
          if (e.type === 'tick') io.play('tick');
          else if (e.type === 'go') io.play('start');
          else if (e.type === 'flip') { io.play('jump', { volume: 0.6 }); S.want += Math.PI; }
          else if (e.type === 'land') io.play('land', { volume: clamp(e.v / 16, 0.25, 0.8) });
          else if (e.type === 'spark') io.play('pick');
          else if (e.type === 'flag') io.play('checkpoint');
          else if (e.type === 'fall') {
            S.fall = { kind: e.kind, t: 0, s: st.s, c: st.c, vy: e.kind === 'crash' ? 2 : st.vy, wet: false };
            io.play(e.kind === 'crash' ? 'hit' : 'fail');
            io.note(e.kind === 'crash' ? 'Into the end of a girder!' : e.kind === 'sea' ? 'Into the sea!' : 'Lost in the sky!');
          } else if (e.type === 'back') { S.fall = null; S.turn = S.want = 0; io.play('respawn'); }
          else if (e.type === 'end') { io.play('bell'); io.play('victory', { volume: 0.7 }); io.note(`The end of the line! ${formatTime(e.time)}`, 4000); }
        }
        events.length = 0;
        // ---- where the runner is shown: it turns about the middle of its body on the way over
        const f = S.fall;
        if (f) {
          // tumbling: thrown back from a girder and down into the sea; or on down, or on up
          f.t += dt;
          const up = f.kind === 'sky', g = f.kind === 'crash' ? 22 : R.g;
          const y = f.c + f.vy * f.t + (up ? 0.5 : -0.5) * g * f.t * f.t, s = f.s - (f.kind === 'crash' ? 2.6 * f.t : 0);
          if (!up && y < 0.3 && !f.wet) { f.wet = true; this.at(s, 0, 0, pos); io.splash(pos.x, 0, pos.z, 1.2); io.play('splash'); }
          S.turn += dt * 9;
          this.at(s, Math.max(-2.4, y) - HB * Math.cos(S.turn), -HB * Math.sin(S.turn), pos);
        } else {
          S.turn += clamp(S.want - S.turn, -dt * 15, dt * 15);
          this.at(st.s, st.c - HB * Math.cos(S.turn), -HB * Math.sin(S.turn), pos);
        }
        pl.pos.copy(pos); pl.yaw = this.yaw; pl.pitch = 0; pl.roll = S.turn % (Math.PI * 2);
        const running = st.wait <= 0 && !(st.out > 0) && !(st.hold > 0) && !st.over;
        pl.speed = running ? speedAt(st.s) : 0; pl.grounded = st.on >= 0;
        session.anim = f ? ANIM.jump : !running ? ANIM.idle : st.on >= 0 ? ANIM.run : ANIM.jump;
        this._sparks(st.clock + st.wait, st.got);
        if (st.over) { S.after += dt; if (!session.over) { session.over = true; session.time = session.score = st.time; } if (S.after > 2.2) session.ended = true; }
        const n = st.sparks, falls = st.falls;
        session.line = st.wait > 0 ? `${R.name} · ${Math.max(1, Math.ceil(st.wait))}…`
          : st.over ? `${R.name} · ${formatTime(st.time)} · ${n} spark${n === 1 ? '' : 's'}${falls ? `, ${falls} fall${falls === 1 ? '' : 's'}` : ', not a fall'}`
            : `${formatTime(scoreOf(st))} · ${R.stretches[stretchAt(st.s)].name}${n ? ` · ${n} spark${n === 1 ? '' : 's'}` : ''}${falls ? ` · ${falls} fall${falls === 1 ? '' : 's'}` : ''}`;
      },
      /**
       * The camera: out at sea, side on, a little ahead of the runner. Further out on a screen held upright (to
       * see as far ahead), and on one played with a finger: the line then fits between what the game shows in
       * the corners of such a screen.
       */
      camera: (cam, dt) => {
        const v = speedAt(st.s), ahead = st.s + (st.wait > 0 || st.hold > 0 ? 3 : 1.6 + 0.5 * v), fov = 50, aspect = cam.aspect || 1.6;
        S.cam = S.look === null ? ahead : S.cam + (ahead - S.cam) * Math.min(1, dt * (st.out > 0 ? 3 : 7));
        const half = Math.tan((fov * Math.PI) / 360) * aspect, finger = S.touch && aspect > 1;
        const away = finger ? 27 : clamp(11.5 / half, 16.5, 34), mid = (R.levels.floor + R.levels.ceiling) / 2 + (finger ? 0.7 : 0.25);
        this.at(S.cam, mid + 0.35, away, t);
        cam.position.copy(t); cam.up.set(0, 1, 0);
        S.look = this.at(S.cam, mid, 0, S.look || V(0, 0, 0));
        cam.lookAt(S.look);
        return fov;
      },
      /** The run is over (or left): the player is put back on the sand, before the gate. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x - Math.sin(this.yaw) * 1.2, this.gate.z - Math.cos(this.yaw) * 1.2, this.yaw); session.close(); },
      close: () => { if (this.session === session) this.session = null; player.pitch = 0; player.roll = 0; this._sparks(this._clock || 0, 0); },
    };
    this.session = session;
    io.play('tick');
    if (this.world.engine.camera.aspect < 1) io.note('Turn the screen on its side: you will see further ahead.', 4500);
    session.step(0, player, false);
    return session;
  }

  /** Every frame, played or not: the sparks turn (while one runs, the session shows one's own). */
  update(dt) { this._clock = (this._clock || 0) + dt; if (!this.session) this._sparks(this._clock, 0); }
}
