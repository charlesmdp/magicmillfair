// The Endless Pond: what is seen of it and how it is run. Its rules are in ring.js; here it is built — the
// stones, the rafts of logs that drift, the post and its two arms, the firefly, the jetty and its gate, the
// board — and a run is run.
//
// Like the race and the slide, a run is a session that drives the player (see PlayerController.driver): the
// game opens it, calls its camera every frame, reads its line for the screen. Nothing here knows about the
// keyboard, the network or the leaderboards. Several visitors may run at once: each has their own run, and
// what moves on the pond moves by the clock of the world, the same for all.
import * as THREE from 'three';
import { Parts } from '../../../props/MeshBuilder.js';
import { LAYER } from '../../../../render/Shadows.js';
import { ANIM } from '../../../../player/Character.js';
import { canvasBoard } from '../Boards.js';
import { POND, startRun, stepRun, runPose, score, driftAt, armAt, fireflyAt, botInput } from './ring.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const RED = [0.95, 0.1, 0.12], WHITE = [1.6, 1.6, 1.55], NAVY = [0.07, 0.07, 0.2], YELLOW = [1.6, 1.3, 0.12], GOLD = [1.5, 1.05, 0.2], CREAM = [1.3, 1.17, 0.9], TEAL = [0.12, 0.7, 0.78];
const hash = (n) => { const s = Math.sin(n * 91.7 + 13.3) * 43758.5453; return s - Math.floor(s); };

export class Pond {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'pond';
    this.session = null;
    this.best = 0; // this visitor's best run, in laps
    /** The clock of the world (s): what moves on the pond moves by it, the same for everybody. */
    this.clock = () => (performance.timeOrigin + performance.now()) / 1000;
  }

  build() {
    const world = this.world, mats = world.materials, cast = [LAYER.STATIC_CASTER], P = POND, y0 = P.level, top = y0 + P.top;
    const parts = new Parts(), rock = parts.get('rock'), wood = parts.get('woodDeck'), wet = parts.get('woodWet'), paint = parts.get('paint'), dark = parts.get('woodDark');
    // ---- the stones of the outer ring: flat boulders, each in its place, none where a place is missing
    const slot = TAU / P.stones, R = P.rings[0];
    for (let k = 0; k < P.stones; k++) {
      if (P.holes.includes(k)) continue;
      const a = (k + 0.5) * slot, w = 0.84 + 0.05 * hash(k), g = 0.92 + 0.14 * hash(k + 7);
      rock.tint(g, g * 0.98, g * 0.95, 1).place(P.x + Math.cos(a) * R, y0, P.z + Math.sin(a) * R, hash(k + 3) * TAU);
      rock.lathe([[0, -1.6], [w * 0.7, -1.6], [w * 0.95, -0.35], [w, 0.06], [w * 0.9, P.top - 0.03], [w * 0.5, P.top], [0, P.top]], 9);
      rock.pop();
    }
    // ---- the post in the middle, on its rock, a lantern at its head
    rock.tint(0.95, 0.93, 0.9, 1).place(P.x, y0, P.z).lathe([[0, -2.4], [1.2, -2.4], [1.05, -0.2], [0.8, 0.28], [0.3, 0.42], [0, 0.42]], 10).pop();
    dark.tint(1, 1, 1, 1).cylinder(P.x, y0 + 0.3, P.z, 0.2, 0.15, 2.5, 10);
    paint.tint(...GOLD, 1).place(P.x, y0 + 3.0, P.z).lathe([[0.0, -0.24], [0.2, -0.15], [0.26, 0], [0.2, 0.15], [0.0, 0.24]], 8).pop();
    // ---- the jetty: planks on piles from the bank to the first stone, and the gate at its head
    const out = V(Math.cos(0), 0, Math.sin(0)); // (the first stone is the one towards the east bank)
    let reach = R + 0.9;
    while (reach < R + 30 && this.data.depthAt(P.x + out.x * reach, P.z + out.z * reach) > 0.05) reach += 0.25;
    const x0 = P.x + R + 0.95, x1 = P.x + reach + 1.2, deck = y0 + 0.3;
    wood.tint(1, 1, 1, 1).box(x0, deck - 0.1, P.z - 0.7, x1, deck, P.z + 0.7);
    for (let x = x0 + 0.5; x < x1 - 0.3; x += 1.9) for (const dz of [-0.6, 0.6]) wet.tint(0.9, 0.9, 0.9, 1).cylinder(x, y0 - 2.8, P.z + dz, 0.09, 0.09, 2.8 + 0.24, 6);
    const gx = x1 - 0.3, gy = Math.max(deck, this.data.heightAt(gx, P.z));
    for (const dz of [-1.0, 1.0]) for (let y = 0, k = 0; y < 2.8; y += 0.56, k++) paint.tint(...(k % 2 ? CREAM : TEAL), 1).cylinder(gx, gy + y, P.z + dz, 0.11, 0.11, 0.56, 8);
    this.gate = { x: gx + 0.9, z: P.z, y: this.data.heightAt(gx + 0.9, P.z), yaw: -Math.PI / 2 }; // (one faces the pond: -x)
    this.group.add(parts.toMeshes(mats, { name: 'pond-ring', layers: cast }));
    const sign = canvasBoard(512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#12343b'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = "700 54px Georgia, 'Times New Roman', serif"; ctx.fillText(P.name.toUpperCase(), w / 2, 50, w * 0.9);
      ctx.fillStyle = '#f2c14e'; ctx.font = '600 22px system-ui, sans-serif'; ctx.fillText('ROUND AND ROUND · EVERY LAP A LITTLE FASTER', w / 2, 98, w * 0.9);
    }, 2.3, 0.575, { both: true });
    sign.mesh.position.set(gx, gy + 3.05, P.z); sign.mesh.rotation.y = Math.PI / 2; sign.mesh.name = 'pond-sign';
    this.group.add(sign.mesh);
    // the board of this visitor's best run, beside the gate
    this.board = canvasBoard(512, 300, (ctx, w, h) => this._drawBoard(ctx, w, h), 1.7, 1.0, { both: true });
    this.board.mesh.position.set(gx + 0.6, this.data.heightAt(gx + 0.6, P.z + 2.6) + 1.35, P.z + 2.6); this.board.mesh.rotation.y = Math.PI / 2 - 0.35; this.board.mesh.name = 'pond-board';
    this.group.add(this.board.mesh);

    // ---- what moves, each about the middle: the rafts of the inner ring…
    const pivot = (name, build) => { const p = new Parts(); build(p); const g = p.toMeshes(mats, { name, layers: [] }); g.position.set(P.x, 0, P.z); this.group.add(g); return g; };
    const r1 = P.rings[1], pitch = TAU / P.rafts;
    this.rafts = pivot('pond-rafts', (p) => {
      const logs = p.get('woodWet'), ties = p.get('woodDark');
      for (let k = 0; k < P.rafts; k++) {
        const a0 = k * pitch, n = 3;
        for (let j = 0; j < n; j++) {
          // (three short lengths to a raft, two logs abreast: they follow the ring)
          const b0 = a0 + (P.raft * j) / n, b1 = a0 + (P.raft * (j + 1)) / n, tone = 0.86 + 0.2 * hash(k * 5 + j);
          for (const dr of [-0.33, 0.33]) logs.tint(tone, tone, tone, 1).rod(V(Math.cos(b0) * (r1 + dr), y0 + P.top - 0.3, Math.sin(b0) * (r1 + dr)), V(Math.cos(b1) * (r1 + dr), y0 + P.top - 0.3, Math.sin(b1) * (r1 + dr)), 0.3, 8);
          const bm = (b0 + b1) / 2;
          ties.tint(1, 1, 1, 1).rod(V(Math.cos(bm) * (r1 - 0.6), y0 + P.top - 0.06, Math.sin(bm) * (r1 - 0.6)), V(Math.cos(bm) * (r1 + 0.6), y0 + P.top - 0.06, Math.sin(bm) * (r1 + 0.6)), 0.05, 5);
        }
      }
    });
    // …and the two arms: a low beam over the logs, a curtain of boards hanging from a boom over the stones
    this.arms = P.arms.map((arm, i) => pivot(`pond-arm${i}`, (p) => {
      const b = p.get('paint'), n = 8, yb = y0 + P.top;
      if (!arm.high) {
        for (let k = 0; k < n; k++) b.tint(...(k % 2 ? WHITE : RED), 1).box(0.25 + ((arm.far - 0.25) * k) / n, yb + arm.from, -P.beam, 0.25 + ((arm.far - 0.25) * (k + 1)) / n, yb + arm.to, P.beam);
        // (a float under its end, between the two rings)
        b.tint(...YELLOW, 1).place(arm.far - 0.12, y0 + 0.02, 0).lathe([[0, -0.22], [0.2, -0.16], [0.26, 0], [0.2, 0.16], [0, 0.22]], 8).pop();
      } else {
        b.tint(...NAVY, 1).rod(V(0, y0 + 2.75, 0), V(arm.far + 0.3, y0 + 2.5, 0), 0.07, 6);
        for (let k = 0; k < n; k++) b.tint(...(k % 2 ? NAVY : YELLOW), 1).box(arm.near + ((arm.far - arm.near) * k) / n, yb + arm.from, -P.beam * 0.6, arm.near + ((arm.far - arm.near) * (k + 1)) / n, yb + arm.to, P.beam * 0.6);
        for (const r of [arm.near + 0.1, (arm.near + arm.far) / 2, arm.far - 0.1]) b.tint(...NAVY, 1).rod(V(r, yb + arm.to, 0), V(r, y0 + 2.62, 0), 0.025, 4, { caps: false });
      }
    }));
    // the firefly: a spark of light, and a faint ring under it on the water
    this.firefly = pivot('pond-firefly', (p) => { p.get('glow').tint(1.2, 1.5, 0.5, 1).lathe([[0, -0.13], [0.1, -0.08], [0.13, 0], [0.1, 0.08], [0, 0.13]], 8); });
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    this._place(this.clock(), -1);
    return this;
  }

  _drawBoard(ctx, w, h) {
    ctx.fillStyle = '#12343b'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 8; ctx.strokeRect(7, 7, w - 14, h - 14);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2c14e'; ctx.font = '600 30px system-ui, sans-serif'; ctx.fillText('YOUR BEST RUN', w / 2, 62);
    ctx.fillStyle = '#ffffff'; ctx.font = '700 96px Georgia, serif'; ctx.fillText(this.best ? this.best.toFixed(1) : '—', w / 2, 152);
    ctx.fillStyle = '#bfe8ee'; ctx.font = '500 28px system-ui, sans-serif'; ctx.fillText(this.best ? 'laps before the water' : 'no lap yet', w / 2, 236);
  }

  /** This visitor's best run (laps): what the board by the gate shows. */
  setBest(laps) { this.best = laps || 0; this.board?.redraw(); }

  /** Is the player standing at the gate, where one asks to run? */
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.0 * 2.0; }

  /** Puts what moves where it is at `clock`; `caught`: the firefly this visitor has already caught (not shown). */
  _place(clock, caught) {
    this.rafts.rotation.y = -driftAt(clock); // (about y an angle of the plan turns the other way)
    this.rafts.position.y = Math.sin(clock * 1.3) * 0.02;
    this.arms.forEach((g, i) => { g.rotation.y = -armAt(POND.arms[i], clock); });
    const fly = fireflyAt(clock, this._fly || (this._fly = {})), r = POND.rings[fly.ring];
    this.firefly.visible = fly.n !== caught;
    this.firefly.position.set(POND.x + Math.cos(fly.a) * r, POND.level + POND.top + POND.fly.high + 0.65 + Math.sin(clock * 3.1) * 0.08, POND.z + Math.sin(fly.a) * r);
    for (const g of [this.rafts, ...this.arms, this.firefly]) g.updateMatrixWorld(true);
  }

  /**
   * A run starts: the player is put on the first stone; three, two, one… `io`: { play(sound, options), note(text),
   * splash(x, y, z, strength) }. Returns the session — it is also the driver of the player:
   *   step(dt, player, control), camera(camera, dt) → the angle of view, line (for the screen), over (in the
   *   water: `laps` is the run's, to a tenth), ended (a moment later: the game lets go — see `drop`),
   *   drop(player) (the player swims from where they fell), close(), auto (true: it plays by itself).
   */
  open(player, io) {
    const P = POND, pose = {}, events = [], input = { jump: false, down: false, side: 0 };
    let st = startRun(this.clock());
    const S = { count: 3.2, cam: null, look: V(0, 0, 0), fov: 62, was: { x: 0, y: 0 }, after: 0, shake: 0, acc: 0 };
    const _t = V(0, 0, 0);
    const session = {
      pond: this, over: false, ended: false, laps: 0, time: 0, line: '', riding: false, anim: ANIM.idle, state: st, auto: false,
      step: (dt, pl, control) => {
        const inp = pl.input, mx = control ? inp.move.x : 0, my = control ? inp.move.y : 0;
        if (!session.auto) {
          // (a jump is a press; down and the steps aside are pushes of the stick, each counted once)
          input.jump = control && !!inp.jump;
          input.down = my < -0.5 && S.was.y >= -0.5;
          input.side = mx > 0.5 && S.was.x <= 0.5 ? 1 : mx < -0.5 && S.was.x >= -0.5 ? -1 : 0;
        }
        S.was.x = mx; S.was.y = my;
        if (S.count > 0) {
          const was = S.count;
          S.count -= dt;
          if (Math.ceil(S.count) !== Math.ceil(was) && S.count > 0 && S.count <= 3) io.play('tick');
          if (S.count <= 0) { io.play('start'); st = session.state = startRun(this.clock()); }
        } else if (session.auto) {
          // (playing by itself, it decides at every step of the run, as the checks do)
          S.acc += Math.min(dt, 0.25);
          while (S.acc >= P.step && !st.over) { S.acc -= P.step; botInput(st, input); stepRun(st, P.step, input, events); }
        } else if (!st.over) stepRun(st, dt, input, events);
        for (const e of events) this._tell(e, st, io, S);
        events.length = 0;
        runPose(st, pose);
        if (st.over) {
          // in the water: where they fell, then the game lets go
          S.after += dt;
          if (!session.over) { session.over = true; session.laps = score(st); session.time = st.time; io.splash?.(pose.x, P.level, pose.z, 6); }
          pl.pos.set(pose.x, P.level - Math.min(1.0, S.after * 2.2), pose.z);
          session.anim = ANIM.swim;
          if (S.after > 1.1) session.ended = true;
        } else {
          pl.pos.set(pose.x, pose.y - (st.slide > 0 ? 0.28 : 0), pose.z);
          session.anim = S.count > 0 ? ANIM.idle : st.slide > 0 ? ANIM.sit : (st.feet ?? 0) > 0.05 ? ANIM.jump : ANIM.run;
        }
        pl.yaw = pose.yaw; pl.pitch = st.slide > 0 && !st.over ? -0.5 : 0; pl.roll = 0;
        pl.speed = S.count > 0 || st.over ? 0 : st.v; pl.grounded = true;
        this._place(S.count > 0 ? this.clock() : st.t0 + st.clock, st.caught);
        const left = P.fly.lily - (st.flies % P.fly.lily);
        session.line = S.count > 0 ? `${P.name} · ${Math.ceil(S.count) > 3 ? 'ready' : Math.ceil(S.count)}…`
          : st.over ? `${P.name} · ${score(st).toFixed(1)} laps`
            : `Lap ${st.lap + 1} · ${Math.round(st.v * 3.6)} km/h · ${st.lilies} lily pad${st.lilies === 1 ? '' : 's'} · ${left} firefl${left === 1 ? 'y' : 'ies'} to the next`;
      },
      /**
       * The camera of a run: outside the circuit, behind the runner and high above, looking across the whole
       * pond — the runner at the foot of the picture, both rings and the arms in sight, what comes on one side.
       * It goes round with the runner, higher as they go faster.
       */
      camera: (cam, dt) => {
        const a = st.a, r = pose.r ?? P.rings[0], fast = Math.min(1, (st.v - P.speed[0]) / 8);
        _t.set(P.x + Math.cos(a - 0.3) * (r + 5.2 + 1.5 * fast), P.level + 6.2 + 2.5 * fast, P.z + Math.sin(a - 0.3) * (r + 5.2 + 1.5 * fast));
        if (!S.cam) S.cam = _t.clone(); else S.cam.lerp(_t, Math.min(1, dt * 6));
        _t.set(P.x + Math.cos(a + 0.8) * 2.2, P.level + 0.2, P.z + Math.sin(a + 0.8) * 2.2);
        S.look.lerp(_t, S.look.lengthSq() ? Math.min(1, dt * 8) : 1);
        cam.position.copy(S.cam);
        if (S.shake > 0) { S.shake = Math.max(0, S.shake - dt * 2.5); cam.position.y += (Math.random() - 0.5) * S.shake * 0.3; }
        cam.up.set(0, 1, 0);
        cam.lookAt(S.look);
        S.fov += (64 + 10 * fast - S.fov) * Math.min(1, dt * 3);
        return S.fov;
      },
      /** The run is over and the game lets go: the player is in the pond where they fell, and swims from there. */
      drop: (pl) => {
        pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0;
        pl.teleport(pose.x, pose.z, pose.yaw);
        pl.pos.y = P.level - 1.0; pl.grounded = false;
        session.close();
      },
      close: () => { if (this.session === session) this.session = null; player.pitch = 0; player.roll = 0; },
    };
    this.session = session;
    session.step(0, player, false);
    return session;
  }

  /** What happened in a step of a run, told to the player. */
  _tell(e, st, io, S) {
    if (e.type === 'jump') io.play('jump', { volume: 0.55 });
    else if (e.type === 'again') io.play('jump', { volume: 0.45, rate: 1.3 });
    else if (e.type === 'slide') io.play('drift', { volume: 0.4 });
    else if (e.type === 'lap') { io.play('checkpoint', { volume: 0.6 }); io.note(`Lap ${e.lap + 1} — ${Math.round(e.v * 3.6)} km/h`); }
    else if (e.type === 'fly') io.play('bell', { volume: 0.5, rate: 1.5 });
    else if (e.type === 'lily') { io.play('boost', { volume: 0.6 }); io.note('A lily pad: it will put you back on, once.'); }
    else if (e.type === 'saved') { io.play('squirt', { volume: 0.7 }); S.shake = 0.8; io.note(`Saved by a lily pad! ${e.lilies} left.`); }
    else if (e.type === 'fall') { io.play('splash'); io.play('fail', { volume: 0.6 }); io.note(e.why === 'gap' ? 'In the water!' : e.why === 'low' ? 'Tripped by the beam!' : 'Swept off by the curtain!'); }
  }

  /** Every frame: with nobody running here, what moves follows the clock of the world. */
  update() { if (!this.session) this._place(this.clock(), -1); }
}
