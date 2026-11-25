// The Endless Pond: what is seen of it and how it is run. Its rules are in ring.js; here it is built — three
// circuits on the Great Pond: their stones, the rafts of logs that drift, their posts and the arms that turn
// or swing about them, the fireflies, the lines of stones from one pond to the next, the jetty and its gate,
// the board — and a run is run.
//
// Like the race and the slide, a run is a session that drives the player (see PlayerController.driver): the
// game opens it, calls its camera every frame, reads its line for the screen. Nothing here knows about the
// keyboard, the network or the leaderboards. Several visitors may run at once: each has their own run, and
// what moves on the ponds moves by the clock of the world, the same for all.
import * as THREE from 'three';
import { Parts } from '../../../props/MeshBuilder.js';
import { LAYER } from '../../../../render/Shadows.js';
import { ANIM } from '../../../../player/Character.js';
import { canvasBoard } from '../Boards.js';
import { formatTime } from '../course.js';
import { POND, waysOf, startRun, stepRun, runPose, score, driftAt, armAt, fireflyAt, botInput, fairStart } from './ring.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const RED = [0.95, 0.1, 0.12], WHITE = [1.6, 1.6, 1.55], NAVY = [0.07, 0.07, 0.2], YELLOW = [1.6, 1.3, 0.12], GOLD = [1.5, 1.05, 0.2], CREAM = [1.3, 1.17, 0.9], TEAL = [0.12, 0.7, 0.78];
const LAMP = [GOLD, [0.4, 1.3, 1.5], [1.5, 0.45, 1.2]]; // the lantern on the post of each pond
const HEIGHTS = { low: [0.14, 0.36], high: [1.05, 1.32], wall: [0.12, 2.25] }; // from where to where an arm reaches, over what one runs on
const hash = (n) => { const s = Math.sin(n * 91.7 + 13.3) * 43758.5453; return s - Math.floor(s); };

export class Pond {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'pond';
    this.session = null;
    this.best = 0; // this visitor's best run: how long they held (ms)
    /** The clock of the world (s): what moves on the ponds moves by it, the same for everybody. */
    this.clock = () => (performance.timeOrigin + performance.now()) / 1000;
  }

  build() {
    const world = this.world, mats = world.materials, cast = [LAYER.STATIC_CASTER], P = POND, y0 = P.level, top = y0 + P.top, W = waysOf();
    const parts = new Parts(), rock = parts.get('rock'), wood = parts.get('woodDeck'), wet = parts.get('woodWet'), paint = parts.get('paint'), dark = parts.get('woodDark');
    const stone = (x, z, w, k, sunk = 1.6) => { const g = 0.92 + 0.14 * hash(k + 7); rock.tint(g, g * 0.98, g * 0.95, 1).place(x, y0, z, hash(k + 3) * TAU).lathe([[0, -sunk], [w * 0.7, -sunk], [w * 0.95, -0.35], [w, 0.06], [w * 0.9, P.top - 0.03], [w * 0.5, P.top], [0, P.top]], 9).pop(); };
    const pivot = (pond, name, build) => { const p = new Parts(); build(p); const g = p.toMeshes(mats, { name, layers: [] }); g.position.set(pond.x, 0, pond.z); this.group.add(g); return g; };
    this.pivots = P.ponds.map((pond, n) => {
      // ---- the rings of stones: flat boulders, each in its place, none where a place is missing
      pond.rings.forEach((R, ri) => {
        if (!R.stones) return;
        const slot = TAU / R.stones;
        for (let k = 0; k < R.stones; k++) if (!R.holes.includes(k)) { const a = (k + 0.5) * slot; stone(pond.x + Math.cos(a) * R.r, pond.z + Math.sin(a) * R.r, (slot * R.r) / 2 - 0.05 + 0.05 * hash(k + n * 50), k + n * 100 + ri * 40); }
      });
      // ---- the post in the middle, on its rock, a lantern at its head
      rock.tint(0.95, 0.93, 0.9, 1).place(pond.x, y0, pond.z).lathe([[0, -2.4], [1.2, -2.4], [1.05, -0.2], [0.8, 0.28], [0.3, 0.42], [0, 0.42]], 10).pop();
      dark.tint(1, 1, 1, 1).cylinder(pond.x, y0 + 0.3, pond.z, 0.2, 0.15, 2.5, 10);
      paint.tint(...LAMP[n], 1).place(pond.x, y0 + 3.0, pond.z).lathe([[0.0, -0.24], [0.2, -0.15], [0.26, 0], [0.2, 0.15], [0.0, 0.24]], 8).pop();
      // ---- what moves, each about the middle: the rafts of logs…
      const rafts = pond.rings.filter((R) => R.rafts).map((R) => ({ ring: R, g: pivot(pond, 'pond-rafts', (p) => {
        const logs = p.get('woodWet'), ties = p.get('woodDark'), pitch = TAU / R.rafts, parts3 = Math.max(2, Math.round((R.raft * R.r) / 1.25));
        for (let k = 0; k < R.rafts; k++) for (let j = 0; j < parts3; j++) {
          // (short lengths, two logs abreast: they follow the ring)
          const b0 = k * pitch + (R.raft * j) / parts3, b1 = k * pitch + (R.raft * (j + 1)) / parts3, tone = 0.86 + 0.2 * hash(k * 5 + j + n * 9), bm = (b0 + b1) / 2;
          for (const dr of [-0.33, 0.33]) logs.tint(tone, tone, tone, 1).rod(V(Math.cos(b0) * (R.r + dr), y0 + P.top - 0.3, Math.sin(b0) * (R.r + dr)), V(Math.cos(b1) * (R.r + dr), y0 + P.top - 0.3, Math.sin(b1) * (R.r + dr)), 0.3, 8);
          ties.tint(1, 1, 1, 1).rod(V(Math.cos(bm) * (R.r - 0.6), y0 + P.top - 0.06, Math.sin(bm) * (R.r - 0.6)), V(Math.cos(bm) * (R.r + 0.6), y0 + P.top - 0.06, Math.sin(bm) * (R.r + 0.6)), 0.05, 5);
        }
      }) }));
      // …and the arms: a low beam (jumped), a curtain hanging from a boom (slid under), a gate (neither: one is elsewhere)
      const arms = pond.arms.map((arm, i) => ({ arm, g: pivot(pond, `pond-arm${i}`, (p) => {
        const b = p.get('paint'), n8 = 8, yb = y0 + P.top, [h0, h1] = HEIGHTS[arm.kind];
        if (arm.kind === 'low') {
          for (let k = 0; k < n8; k++) b.tint(...(k % 2 ? WHITE : RED), 1).box(arm.near + ((arm.far - arm.near) * k) / n8, yb + h0, -P.beam, arm.near + ((arm.far - arm.near) * (k + 1)) / n8, yb + h1, P.beam);
          b.tint(...NAVY, 1).rod(V(0.2, yb + 0.35, 0), V(arm.near, yb + 0.35, 0), 0.05, 5, { caps: false });
          b.tint(...YELLOW, 1).place(arm.far - 0.12, y0 + 0.02, 0).lathe([[0, -0.22], [0.2, -0.16], [0.26, 0], [0.2, 0.16], [0, 0.22]], 8).pop(); // (a float under its end)
        } else if (arm.kind === 'high') {
          b.tint(...NAVY, 1).rod(V(0, y0 + 2.75, 0), V(arm.far + 0.3, y0 + 2.5, 0), 0.07, 6);
          for (let k = 0; k < n8; k++) b.tint(...(k % 2 ? NAVY : YELLOW), 1).box(arm.near + ((arm.far - arm.near) * k) / n8, yb + h0, -P.beam * 0.6, arm.near + ((arm.far - arm.near) * (k + 1)) / n8, yb + h1, P.beam * 0.6);
          for (const r of [arm.near + 0.1, (arm.near + arm.far) / 2, arm.far - 0.1]) b.tint(...NAVY, 1).rod(V(r, yb + h1, 0), V(r, y0 + 2.62, 0), 0.025, 4, { caps: false });
        } else {
          // (a gate: boards from the water to over one's head, red and white, a lamp on it — nothing gets by)
          b.tint(...NAVY, 1).rod(V(0, y0 + 2.95, 0), V(arm.far + 0.25, y0 + 2.7, 0), 0.08, 6);
          for (let k = 0; k < 5; k++) b.tint(...(k % 2 ? WHITE : RED), 1).box(arm.near, yb + h0 + ((h1 - h0) * k) / 5, -P.beam, arm.far, yb + h0 + ((h1 - h0) * (k + 1)) / 5, P.beam);
          for (const r of [arm.near + 0.06, arm.far - 0.06]) b.tint(...NAVY, 1).rod(V(r, y0 - 0.2, 0), V(r, y0 + 2.8, 0), 0.05, 5, { caps: false });
          p.get('glow').tint(1.5, 0.25, 0.1, 1).place((arm.near + arm.far) / 2, y0 + 2.75, 0).lathe([[0, -0.14], [0.12, 0], [0, 0.14]], 6).pop();
        }
      }) }));
      // the firefly: a spark of light
      const firefly = pivot(pond, 'pond-firefly', (p) => { p.get('glow').tint(1.2, 1.5, 0.5, 1).lathe([[0, -0.13], [0.1, -0.08], [0.13, 0], [0.1, 0.08], [0, 0.13]], 8); });
      // ---- the stones that lead on to the next pond
      if (W[n].length > 0) for (let u = 1.15, k = 0; u < W[n].length - 0.6; u += 1.45, k++) { const d = pond.rings[0].r + u; stone(pond.x + W[n].dx * d, pond.z + W[n].dz * d, 0.5 + 0.08 * hash(k + n), k + 300 + n * 20, 1.2); }
      return { rafts, arms, firefly };
    });
    // ---- the jetty: planks on piles from the bank to the first stone of the first pond, and the gate at its head
    const first = P.ponds[0], R = first.rings[0].r, ox = Math.cos(W[0].in), oz = Math.sin(W[0].in);
    let reach = R + 0.9;
    while (reach < R + 30 && this.data.depthAt(first.x + ox * reach, first.z + oz * reach) > 0.05) reach += 0.25;
    const a = V(first.x + ox * (R + 0.95), y0 + 0.25, first.z + oz * (R + 0.95)), b = V(first.x + ox * (reach + 1.2), y0 + 0.25, first.z + oz * (reach + 1.2));
    wood.tint(1, 1, 1, 1).beam(a, b, 1.4, 0.1);
    for (let u = R + 1.4; u < reach + 0.9; u += 1.9) for (const sgn of [-0.6, 0.6]) wet.tint(0.9, 0.9, 0.9, 1).cylinder(first.x + ox * u - oz * sgn, y0 - 2.8, first.z + oz * u + ox * sgn, 0.09, 0.09, 2.8 + 0.2, 6);
    const gx = b.x - ox * 0.3, gz = b.z - oz * 0.3, gy = Math.max(y0 + 0.3, this.data.heightAt(gx, gz));
    for (const sgn of [-1.0, 1.0]) for (let y = 0, k = 0; y < 2.8; y += 0.56, k++) paint.tint(...(k % 2 ? CREAM : TEAL), 1).cylinder(gx - oz * sgn, gy + y, gz + ox * sgn, 0.11, 0.11, 0.56, 8);
    this.gate = { x: gx + ox * 0.9, z: gz + oz * 0.9, y: this.data.heightAt(gx + ox * 0.9, gz + oz * 0.9), yaw: Math.atan2(-ox, -oz) }; // (one faces the ponds)
    // ---- where one waits before setting off: the end of the jetty, a step from the first stone — and a lamp on a
    // post beside it, green when the moment is a fair one (ring.js: fairStart), red when it is not
    this.wait = { x: first.x + ox * (R + 1.45), z: first.z + oz * (R + 1.45), y: y0 + 0.3, yaw: Math.atan2(-ox, -oz) };
    {
      const lx = first.x + ox * (R + 1.2) - oz * 1.05, lz = first.z + oz * (R + 1.2) + ox * 1.05;
      wet.tint(0.9, 0.9, 0.9, 1).cylinder(lx, y0 - 2.6, lz, 0.07, 0.06, 2.6 + 1.55, 6);
      paint.tint(...NAVY, 1).cylinder(lx, y0 + 1.5, lz, 0.13, 0.13, 0.36, 8);
      const lamp = (name, tone) => { const p = new Parts(); p.get('glow').tint(...tone, 1).lathe([[0, -0.15], [0.12, -0.1], [0.15, 0], [0.12, 0.1], [0, 0.15]], 8); const g = p.toMeshes(mats, { name, layers: [] }); g.position.set(lx, y0 + 1.68, lz); g.visible = false; this.group.add(g); return g; };
      this.lamps = { go: lamp('pond-lamp-go', [0.25, 1.7, 0.4]), wait: lamp('pond-lamp-wait', [1.8, 0.22, 0.16]) };
    }
    this.group.add(parts.toMeshes(mats, { name: 'pond-ring', layers: cast }));
    const sign = canvasBoard(512, 128, (ctx, w, h) => {
      ctx.fillStyle = '#12343b'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = "700 54px Georgia, 'Times New Roman', serif"; ctx.fillText(P.name.toUpperCase(), w / 2, 50, w * 0.9);
      ctx.fillStyle = '#f2c14e'; ctx.font = '600 22px system-ui, sans-serif'; ctx.fillText('THREE PONDS · ON THE LAST, HOLD AS LONG AS YOU CAN', w / 2, 98, w * 0.9);
    }, 2.3, 0.575, { both: true });
    sign.mesh.position.set(gx, gy + 3.05, gz); sign.mesh.rotation.y = Math.atan2(ox, oz); sign.mesh.name = 'pond-sign';
    this.group.add(sign.mesh);
    // the board of this visitor's best run, beside the gate
    this.board = canvasBoard(512, 300, (ctx, w, h) => this._drawBoard(ctx, w, h), 1.7, 1.0, { both: true });
    const bx = gx + ox * 0.6 - oz * 2.4, bz = gz + oz * 0.6 + ox * 2.4;
    this.board.mesh.position.set(bx, this.data.heightAt(bx, bz) + 1.35, bz); this.board.mesh.rotation.y = Math.atan2(ox, oz) - 0.35; this.board.mesh.name = 'pond-board';
    this.group.add(this.board.mesh);
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    this._place(this.clock(), -1, -1);
    return this;
  }

  _drawBoard(ctx, w, h) {
    ctx.fillStyle = '#12343b'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 8; ctx.strokeRect(7, 7, w - 14, h - 14);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2c14e'; ctx.font = '600 30px system-ui, sans-serif'; ctx.fillText('YOUR BEST RUN', w / 2, 62);
    ctx.fillStyle = '#ffffff'; ctx.font = '700 88px Georgia, serif'; ctx.fillText(this.best ? formatTime(this.best) : '—', w / 2, 152);
    ctx.fillStyle = '#bfe8ee'; ctx.font = '500 28px system-ui, sans-serif'; ctx.fillText(this.best ? 'held before the water' : 'not run yet', w / 2, 236);
  }

  /** This visitor's best run (ms held): what the board by the gate shows. */
  setBest(ms) { this.best = ms || 0; this.board?.redraw(); }

  /** Is the player standing at the gate, where one asks to run? */
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.0 * 2.0; }

  /** Puts what moves where it is at `clock`; `caught`: the firefly this visitor has already caught on pond `stage` (not shown). */
  _place(clock, caught, stage) {
    const f = this._fly || (this._fly = {});
    if (this.lamps) { const fair = fairStart(clock); this.lamps.go.visible = fair; this.lamps.wait.visible = !fair; }
    POND.ponds.forEach((pond, n) => {
      const pv = this.pivots[n];
      for (const r of pv.rafts) { r.g.rotation.y = -driftAt(r.ring, clock); r.g.position.y = Math.sin(clock * 1.3 + n) * 0.02; r.g.updateMatrixWorld(true); } // (about y an angle of the plan turns the other way)
      for (const a of pv.arms) { a.g.rotation.y = -armAt(a.arm, clock); a.g.updateMatrixWorld(true); }
      const fly = fireflyAt(pond, clock, f), r = pond.rings[fly.ring].r;
      pv.firefly.visible = !(n === stage && fly.n === caught);
      pv.firefly.position.set(pond.x + Math.cos(fly.a) * r, POND.level + POND.top + POND.fly.high + 0.65 + Math.sin(clock * 3.1) * 0.08, pond.z + Math.sin(fly.a) * r);
      pv.firefly.updateMatrixWorld(true);
    });
  }

  /**
   * A run starts: the player is put on the first stone of the first pond; three, two, one… `io`: { play(sound,
   * options), note(text), splash(x, y, z, strength) }. Returns the session — it is also the driver of the player:
   *   step(dt, player, control), camera(camera, dt) → the angle of view, line (for the screen), over (in the
   *   water: `held` is how long one held, in ms; `stage` the pond reached), ended (a moment later: the game lets
   *   go — see `drop`), drop(player) (the player swims from where they fell), close(), auto (true: it plays by itself).
   */
  open(player, io) {
    const P = POND, pose = {}, events = [], input = { jump: false, down: false, side: 0 };
    let st = startRun(this.clock());
    // (`count`: not gone yet — the runner waits on the jetty for as long as the player likes; `wait`: for how long
    // they have; `lead`: the step from the jetty onto the first stone, once gone; `no`: the last jump asked on red)
    const S = { count: 1, wait: 0, lead: 0, no: -9, cam: null, look: V(0, 0, 0), fov: 62, was: { x: 0, y: 0 }, after: 0, shake: 0, acc: 0, yaw: null };
    const LEAD = 0.24;
    const _t = V(0, 0, 0);
    const session = {
      pond: this, over: false, ended: false, held: 0, stage: 0, time: 0, line: '', riding: false, anim: ANIM.idle, state: st, auto: false,
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
          // (the beam turns by the clock of the world: one picks one's moment — on a jump, while the lamp is green.
          // Playing by itself, it goes at the first green.)
          S.wait += dt;
          const fair = fairStart(this.clock()), asked = S.wait > 0.4 && (session.auto ? fair : input.jump);
          if (asked && fair) { S.count = 0; S.lead = LEAD; io.play('start'); st = session.state = startRun(this.clock()); }
          else if (asked && S.wait - S.no > 0.6) { S.no = S.wait; io.play('fail', { volume: 0.35 }); io.note('Not yet — set off when the lamp is green.'); }
        } else if (session.auto) {
          // (playing by itself, it decides at every step of the run, as the checks do)
          S.acc += Math.min(dt, 0.25);
          while (S.acc >= P.step && !st.over) { S.acc -= P.step; botInput(st, input); stepRun(st, P.step, input, events); }
        } else if (!st.over) stepRun(st, dt, input, events);
        for (const e of events) this._tell(e, st, io, S);
        events.length = 0;
        runPose(st, pose);
        if (S.count > 0) { pose.x = this.wait.x; pose.y = this.wait.y; pose.z = this.wait.z; pose.yaw = this.wait.yaw; }
        else if (S.lead > 0) {
          // (the step from the jetty onto the first stone: a small hop, while the legs find their pace)
          S.lead = Math.max(0, S.lead - dt);
          const k = S.lead / LEAD;
          pose.x += (this.wait.x - pose.x) * k; pose.z += (this.wait.z - pose.z) * k; pose.y += (this.wait.y - pose.y) * k + 0.22 * Math.sin(Math.PI * (1 - k));
        }
        const pond = P.ponds[st.stage];
        if (st.over) {
          // in the water: where they fell, then the game lets go
          S.after += dt;
          if (!session.over) { session.over = true; session.held = score(st); session.stage = st.stage; session.time = st.time; io.splash?.(pose.x, P.level, pose.z, 6); }
          pl.pos.set(pose.x, P.level - Math.min(1.0, S.after * 2.2), pose.z);
          session.anim = ANIM.swim;
          if (S.after > 1.1) session.ended = true;
        } else {
          pl.pos.set(pose.x, pose.y - (st.slide > 0 ? 0.28 : 0), pose.z);
          session.anim = S.count > 0 ? ANIM.idle : st.slide > 0 ? ANIM.sit : (st.feet ?? 0) > 0.05 ? ANIM.jump : ANIM.run;
        }
        // (the way they face: turned smoothly where the run turns a corner — onto the stones between two ponds, off them)
        if (S.yaw === null) S.yaw = pose.yaw;
        let d = pose.yaw - S.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); S.yaw += d * Math.min(1, dt * 14);
        pl.yaw = S.yaw; pl.pitch = st.slide > 0 && !st.over ? -0.5 : 0; pl.roll = 0;
        pl.speed = S.count > 0 || st.over ? 0 : st.v; pl.grounded = true;
        this._place(S.count > 0 ? this.clock() : st.t0 + st.clock, st.caught, st.stage);
        const left = P.fly.lily - (st.flies % P.fly.lily), lilies = `${st.lilies} lily pad${st.lilies === 1 ? '' : 's'}`;
        session.line = S.count > 0 ? `${P.name} · ${fairStart(this.clock()) ? 'the lamp is green: jump to set off!' : 'wait for the green lamp…'}`
          : st.over ? `${P.name} · held ${formatTime(score(st))}${st.stage < 2 ? ` · pond ${st.stage + 1}` : ''}`
            : st.mode !== 'run' ? `On to ${P.ponds[st.stage + 1]?.name || 'the next pond'}…`
              : st.stage < 2 ? `Pond ${st.stage + 1} of 3 · ${Math.max(1, Math.ceil(pond.time - st.t))} s to the next · ${lilies}`
                : `${pond.name} · held ${formatTime(Math.round(st.t * 1000))} · ${Math.round(st.v * 3.6)} km/h · ${lilies} · ${left} firefl${left === 1 ? 'y' : 'ies'} to the next`;
      },
      /**
       * The camera of a run: outside the circuit, behind the runner and high above, looking across the whole
       * pond — the runner at the foot of the picture, the rings and the arms in sight, what comes on one side.
       * It goes round with the runner, higher on a larger pond and as they go faster; between two ponds it
       * follows along the stones.
       */
      camera: (cam, dt) => {
        const pond = P.ponds[st.stage], r0 = pond.rings[0].r, fast = Math.min(1, Math.max(0, st.v - 4.6) / 8);
        if (st.mode === 'bridge') {
          const w = waysOf()[st.stage];
          _t.set(pose.x - w.dx * 7.5, P.level + 5.6, pose.z - w.dz * 7.5);
          if (!S.cam) S.cam = _t.clone(); else S.cam.lerp(_t, Math.min(1, dt * 3));
          _t.set(pose.x + w.dx * 5, P.level + 0.4, pose.z + w.dz * 5);
        } else {
          const a = st.a, r = pose.r ?? r0, far = r + 4.4 + 0.14 * r0 + 1.5 * fast;
          _t.set(pond.x + Math.cos(a - 0.3) * far, P.level + 4.6 + 0.3 * r0 + 2.5 * fast, pond.z + Math.sin(a - 0.3) * far);
          if (!S.cam) S.cam = _t.clone(); else S.cam.lerp(_t, Math.min(1, dt * (st.t < 1 ? 2.5 : 6)));
          _t.set(pond.x + Math.cos(a + 0.8) * 0.3 * r0, P.level + 0.2, pond.z + Math.sin(a + 0.8) * 0.3 * r0);
        }
        S.look.lerp(_t, S.look.lengthSq() ? Math.min(1, dt * (st.mode === 'run' && st.t > 1 ? 8 : 3.5)) : 1);
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
    else if (e.type === 'lap') io.play('checkpoint', { volume: 0.4 });
    else if (e.type === 'fly') io.play('bell', { volume: 0.5, rate: 1.5 });
    else if (e.type === 'lily') { io.play('boost', { volume: 0.6 }); io.note('A lily pad: it will put you back on, once.'); }
    else if (e.type === 'saved') { io.play('squirt', { volume: 0.7 }); S.shake = 0.8; io.note(`Saved by a lily pad! ${e.lilies} left.`); }
    else if (e.type === 'through') { io.play('victory', { volume: 0.5 }); io.note(`${POND.ponds[e.n].name} is done — on to the next!`); }
    else if (e.type === 'pond') { io.play('start'); io.note(e.n === 1 ? 'The Second Pond: where the stones stop, step inside — and out again when the gate swings over the rafts.' : 'The Last Pond: three rings, and faster and faster. Hold as long as you can!'); }
    else if (e.type === 'fall') { io.play('splash'); io.play('fail', { volume: 0.6 }); io.note(e.why === 'gap' ? 'In the water!' : e.why === 'low' ? 'Tripped by the beam!' : e.why === 'wall' ? 'Swept off by the gate!' : 'Swept off by the curtain!'); }
  }

  /** Every frame: with nobody running here, what moves follows the clock of the world. */
  update() { if (!this.session) this._place(this.clock(), -1, -1); }
}
