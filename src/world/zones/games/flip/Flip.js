// Head Over Heels: what is seen of it and how it is run. Its rules are in rules.js; here it is built — a machine
// on piles in the sea, along the south side of the pier: two striped towers, beams between them above and below,
// and between the beams the girders of the course, which come out of the right tower and go into the left one
// as the runner runs on the spot (the flying theatre does the same with its scenery). Every girder is a magnet,
// red on top (one stands on it), blue underneath (one hangs from it, head down); blocks in yellow and navy that
// one passes on the other side; flags, sparks, the name of each stretch going by — and a run is run: a session
// that drives the player (see PlayerController.driver), seen from the sea, side on, the whole machine in view,
// the pier and the big wheel behind. Nobody running, it shows the first seconds of the latest start: friends
// who leave together see the same girders, the machine moving the same for all of them. The other visitors in
// the machine (io.peers) are other runners: each is made a box of the course, solid for one's own run. (They see
// one upright even when one runs head down: the network of the game does not carry which way up one is.)
import * as THREE from 'three';
import { Parts } from '../../../props/MeshBuilder.js';
import { staticCaster } from '../../../../render/Shadows.js';
import { surfaceMaterial } from '../../../../render/SurfaceMaterial.js';
import { ANIM } from '../../../../player/Character.js';
import { canvasBoard } from '../Boards.js';
import { formatTime } from '../course.js';
import { PIER, pierToWorld } from '../../../layout/layout.js';
import { V, clamp, gateArch, worldClock, nextStart, STARTS } from '../gates.js';
import { FLIP, FLAGS, startRun, stepRun, frameAt, speedAt, stretchAt, scoreOf, lagOf, chaseAt, scrollAfter, boxOf, botInput } from './rules.js';

const CREAM = [1.32, 1.2, 0.95], RED = [1.0, 0.1, 0.1], BLUE = [0.16, 0.5, 2.0], NAVY = [0.07, 0.08, 0.2], YELLOW = [1.7, 1.3, 0.1], GOLD = [1.5, 1.05, 0.2];
// (what carries the girders stands behind them and is seen through them: pale, so that it is not taken for something to run into)
const STEEL = [0.5, 0.54, 0.62], PALE = [0.86, 0.9, 0.98], WHITE = [1.5, 1.5, 1.45], BLACK = [0.05, 0.05, 0.06];
const TONES = [RED, YELLOW, [0.15, 0.85, 0.35], [0.75, 0.3, 1.0]]; // the pennants of the flags
const W = FLIP.window; // m: the machine between its towers
const D = 0.9; // m: half the depth of a girder (the runner runs along its middle)
const LOW = 1.5, TOP = 20.7; // m: the underside of the beams below, of the beams above
const POOL = 480; // boxes: what the girders in the machine are made of at any moment
const HB = FLIP.body.tall / 2;
const P = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (k) => k * k * (3 - 2 * k);

export class Flip {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'flip';
    this.session = null;
    this.best = 0;
    this.clock = worldClock;
    // the heading of who runs in the machine (a heading of the valley: 0 looks south)
    this.yaw = Math.PI / 2 - PIER.heading;
    this._p = {};
  }

  /** A place of the machine in the world: `x` from its left end, `y` over the sea, `aside` to the south of it. */
  at(x, y = 0, aside = 0, out = V(0, 0, 0)) { const p = frameAt(x, aside, this._p); return out.set(p.x, y, p.z); }

  build() {
    const world = this.world, mats = world.materials, R = FLIP, cast = staticCaster(world.engine.tier);
    // ---- the machine is built in a frame of its own: x along it, y up, z towards the sea side (who looks at it)
    const frame = (this.frame = new THREE.Group());
    frame.name = 'flip-machine';
    const o = frameAt(0, 0);
    frame.position.set(o.x, 0, o.z);
    frame.rotation.y = -PIER.heading;
    const parts = new Parts(), paint = parts.get('paint'), matte = parts.get('matte'), piles = parts.get('woodWet'), glow = parts.get('glow');
    const bed = (x, z) => { const w = this.at(x, 0, z); return Math.min(-0.6, this.data.heightAt(w.x, w.z)) - 0.7; };
    // the two towers, in bands: the girders come out of the right one (navy) and go into the left one (red: who
    // is pushed as far as that is out)
    for (const [x0, x1, left] of [[-1.4, 0, true], [W, W + 1.4, false]]) {
      const n = 12, h = (TOP + 0.9 - LOW) / n;
      for (let k = 0; k < n; k++) paint.tint(...(k % 2 ? CREAM : left ? RED : NAVY), 1).box(x0, LOW + k * h, -1.25, x1, LOW + (k + 1) * h, 1.25);
      for (const z of [-0.9, 0.9]) for (const x of [x0 + 0.3, x1 - 0.3]) { const y = bed(x, z); piles.tint(0.95, 0.9, 0.85, 1).cylinder(x, y, z, 0.22, 0.19, LOW + 0.1 - y, 8); }
      paint.tint(...GOLD, 1).place((x0 + x1) / 2, TOP + 0.9, 0).lathe([[0.001, 0.8], [0.24, 0.66], [0.38, 0.32], [0.26, 0.05], [0.001, 0]], 8).pop();
    }
    // the beams between them, a pair above and a pair below (the runner that falls out passes between the two of a pair)
    for (const y of [LOW, TOP]) for (const z of [-1.25, 0.65]) paint.tint(...NAVY, 1).box(0, y, z, W, y + 0.6, z + 0.6);
    for (let k = 1; k < 6; k++) {
      const x = (k * W) / 6;
      for (const y of [LOW, TOP]) paint.tint(...PALE, 1).box(x - 0.1, y + 0.2, -0.65, x + 0.1, y + 0.4, 0.65);
      // (a thin post behind the girders, from the beams below to those above)
      matte.tint(...PALE, 1).box(x - 0.05, LOW + 0.6, -1.2, x + 0.05, TOP, -1.1);
    }
    for (const x of [W / 3, (2 * W) / 3]) {
      for (const z of [-0.95, 0.95]) { const y = bed(x, z); piles.tint(0.95, 0.9, 0.85, 1).cylinder(x, y, z, 0.2, 0.17, LOW - 0.1 - y, 8); }
      piles.tint(0.95, 0.9, 0.85, 1).beam(P(x, LOW - 0.12, -1.3), P(x, LOW - 0.12, 1.3), 0.24, 0.24);
    }
    // the rails the girders travel along, one behind each level
    for (let k = 0; k < R.levels.count; k++) { const y = R.levels.base + k * R.levels.rise + R.levels.thick / 2; matte.tint(...STEEL, 1).box(0, y - 0.05, -1.12, W, y + 0.05, -1.02); }
    // bulbs along the beam above, a horseshoe magnet over the name of the machine
    for (let i = 0; i < 24; i++) glow.tint(...(i % 2 ? [1.5, 1.2, 0.5] : [1.5, 0.5, 0.4]), 1).place(1 + (i * (W - 2)) / 23, TOP - 0.1, 1.36).lathe([[0.001, -0.11], [0.09, -0.06], [0.11, 0.02], [0.06, 0.1], [0.001, 0.12]], 6).pop();
    {
      const cx = W / 2, cy = TOP + 3.05, r = 0.6, n = 12, z = 0.95;
      for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI, a1 = ((i + 1) / n) * Math.PI; paint.tint(...RED, 1).rod(P(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, z), P(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, z), 0.16, 8); }
      for (const side of [-1, 1]) { paint.tint(...RED, 1).rod(P(cx + side * r, cy, z), P(cx + side * r, cy - 0.5, z), 0.16, 8); paint.tint(...WHITE, 1).rod(P(cx + side * r, cy - 0.5, z), P(cx + side * r, cy - 0.85, z), 0.16, 8); }
      for (const x of [cx - 3.2, cx + 3.2]) paint.tint(...STEEL, 1).box(x - 0.06, TOP + 0.6, 0.8, x + 0.06, TOP + 1.9, 0.92);
    }
    frame.add(parts.toMeshes(mats, { name: 'flip-frame', layers: cast }));
    const name = canvasBoard(1024, 160, (ctx, w, h) => {
      ctx.fillStyle = '#12122e'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 7; ctx.strokeRect(7, 7, w - 14, h - 14);
      ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = "700 92px Georgia, 'Times New Roman', serif";
      ctx.fillText(R.name.toUpperCase(), w / 2, h / 2 + 4, w * 0.92);
    }, 8, 1.25, { both: true });
    name.mesh.position.set(W / 2, TOP + 1.4, 0.95); name.mesh.name = 'flip-name';
    frame.add(name.mesh);
    // ---- what travels: every girder in the machine is a few boxes of one mesh, cut at the towers
    const unit = new Parts();
    unit.get('paint').tint(1, 1, 1, 1).box(0, 0, 0, 1, 1, 1);
    const boxes = (this.boxes = new THREE.InstancedMesh(unit.get('paint').build(), mats.paint, POOL));
    boxes.name = 'flip-girders'; boxes.frustumCulled = false; boxes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    boxes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 3), 3); boxes.instanceColor.setUsage(THREE.DynamicDrawUsage);
    frame.add(boxes);
    // the flags (a pole at the back of the girder, a pennant: one of each colour is enough, a flag at a time goes by)
    this.flags = TONES.map((tone) => {
      const f = new Parts(), p = f.get('paint'), a = P(0.03, 2.45, -D + 0.12), b = P(0.03, 1.85, -D + 0.12), c = P(1.0, 2.15, -D + 0.12);
      p.tint(...CREAM, 1).cylinder(0, 0, -D + 0.12, 0.035, 0.03, 2.5, 6);
      p.tint(...tone, 1).tri(a, b, c).tri(a, c, b);
      const g = f.toMeshes(mats, { name: 'flip-flag' });
      g.visible = false; frame.add(g);
      return g;
    });
    // the name of each stretch, which goes by under the beams above as the stretch begins
    this.signs = R.stretches.map((stretch, k) => {
      const board = canvasBoard(512, 80, (ctx, w, h) => {
        ctx.fillStyle = '#12122e'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 4; ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = "700 46px Georgia, 'Times New Roman', serif";
        ctx.fillText(`${k + 1} · ${stretch.name.toUpperCase()}`, w / 2, h / 2 + 2, w * 0.92);
      }, 4.8, 0.75, { both: true });
      board.mesh.name = 'flip-stretch'; board.mesh.visible = false;
      frame.add(board.mesh);
      return board.mesh;
    });
    // the end: an arch on the last girder, a bell, black and white squares along the girder under it
    {
      const e = new Parts(), p = e.get('paint'), n = 6, h = 0.17;
      for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) p.tint(...((i + j) % 2 ? WHITE : BLACK), 1).box(-1.5 + i * 0.5, -0.42 + j * h, D + 0.005, -1.0 + i * 0.5, -0.42 + (j + 1) * h, D + 0.03, { faces: 'Z' });
      for (const z of [-D + 0.1, D - 0.1]) for (let y = 0, k = 0; y < 3.9; y += 0.5, k++) p.tint(...(k % 2 ? CREAM : NAVY), 1).cylinder(0, y, z, 0.1, 0.1, Math.min(0.5, 3.9 - y), 8);
      p.tint(...NAVY, 1).box(-0.1, 3.9, -D, 0.1, 4.15, D);
      p.tint(...GOLD, 1).place(0, 3.35, 0).lathe([[0.03, 0.45], [0.16, 0.4], [0.27, 0.12], [0.37, -0.04], [0.41, -0.12]], 10).pop();
      this.arch = e.toMeshes(mats, { name: 'flip-arch' });
      this.arch.visible = false; frame.add(this.arch);
    }
    // ---- the sparks: one mesh for all of them, turned and bobbed by the clock; one's own catches are hidden
    const spark = new Parts();
    spark.get('paint').tint(1.7, 1.25, 0.15, 1).lathe([[0.001, -0.46], [0.3, 0], [0.001, 0.46]], 4);
    this.sparkMat = surfaceMaterial({ name: 'flip-spark', rough: 0.35, spec: 0.3, emissive: [1.15, 0.72, 0.04] });
    const sparks = (this.sparks = new THREE.InstancedMesh(spark.get('paint').build(), this.sparkMat, R.sparks.length));
    sparks.name = 'flip-sparks'; sparks.frustumCulled = false; sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    frame.add(sparks);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._sc = new THREE.Vector3(); this._v = new THREE.Vector3();
    this._clock = 0;
    this.group.add(frame);
    frame.updateMatrixWorld(true);
    this._inv = frame.matrixWorld.clone().invert(); // (from the world to the frame of the machine: where the other runners are in it)
    this._show(this._idle(this.clock()), null);
    // ---- the gate, on the sand of the south beach, the machine out at sea before it: where one asks to run;
    // one's own best under it
    const gp = pierToWorld(R.gate.along, R.gate.side), gy = this.data.heightAt(gp[0], gp[1]);
    this.gate = { x: gp[0], y: gy, z: gp[1], yaw: this.yaw };
    const here = new Parts();
    gateArch(this.group, here.get('paint'), gp[0], gy, gp[1], this.yaw, R.name.toUpperCase(), 'RUN IN THE MACHINE · ONE KEY TURNS GRAVITY OVER', { tone: BLUE, ink: '#12122e' });
    this.group.add(here.toMeshes(mats, { name: 'flip-gate', layers: cast }));
    this.board = canvasBoard(512, 96, (ctx, w, h) => {
      ctx.fillStyle = '#12122e'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 5; ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 44px system-ui, sans-serif';
      ctx.fillText(this.best ? `YOUR BEST  ${formatTime(this.best)}` : 'NO TIME OF YOURS YET', w / 2, h / 2 + 2, w * 0.9);
    }, 2.6, 0.49, { both: true });
    this.board.mesh.position.set(gp[0], gy + 2.05, gp[1]); this.board.mesh.rotation.y = this.yaw; this.board.mesh.name = 'flip-best';
    this.group.add(this.board.mesh);
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    return this;
  }

  setBest(ms) { this.best = ms || 0; this.board?.redraw(); }
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.4 * 2.4; }
  /** The start one who asks now leaves with: { n, name, at (ms of the shared clock), wait (s) }. */
  nextStart() { return nextStart(this.clock(), FLIP.every, STARTS, FLIP.count); }

  /**
   * What the machine shows when nobody runs in it here: the run of the latest start, as far as it has got (it
   * moves the same for every runner of a start) — and, three seconds before the next start, it winds back to the beginning: who
   * waits for that start is seen standing where the others see the first girder.
   */
  _idle(now) {
    const R = FLIP, t = (((now / 1000) % R.every) + R.every) % R.every, shown = R.every - R.count;
    return t < shown ? scrollAfter(t) : scrollAfter(shown) + (scrollAfter(0) - scrollAfter(shown)) * ease(clamp((t - shown) / 0.7, 0, 1));
  }

  /**
   * Puts in the machine what of the course is between its towers when the metre `scroll` is at its left end:
   * the girders (cut at the towers), the sparks (not those of `got`), the flag, the name of the stretch, the arch.
   */
  _show(scroll, got) {
    const R = FLIP, m = this.boxes.instanceMatrix.array, tint = this.boxes.instanceColor.array;
    let n = 0;
    const put = (x0, y0, z0, x1, y1, z1, c) => {
      if (n >= POOL) return;
      const i = n * 16, j = n * 3;
      m[i] = x1 - x0; m[i + 5] = y1 - y0; m[i + 10] = z1 - z0; m[i + 12] = x0; m[i + 13] = y0; m[i + 14] = z0;
      tint[j] = c[0]; tint[j + 1] = c[1]; tint[j + 2] = c[2];
      n++;
    };
    for (const g of R.girders) {
      const x0 = g.from - scroll, x1 = g.to - scroll;
      if (x1 < 0.03 || x0 > W - 0.03) continue;
      const a = Math.max(0, x0), b = Math.min(W, x1);
      if (g.kind !== 'girder') {
        // a block to be passed on the other side, or the pillar of a hollow frame: bands of yellow and navy
        const n = g.kind === 'post' ? Math.max(3, Math.round((g.top - g.bottom) / 0.7) | 1) : 3, h = (g.top - g.bottom) / n, e = g.kind === 'post' ? 0.2 : 0.12;
        for (let k = 0; k < n; k++) put(a, g.bottom + k * h, -D + e, b, g.bottom + (k + 1) * h, D - e, k % 2 ? NAVY : YELLOW);
        continue;
      }
      // a cream web between a red flange and a blue one, a navy plate on each end that is in the machine
      const in0 = x0 >= 0, in1 = x1 <= W;
      if (b - a > 0.2) put(a + (in0 ? 0.08 : 0), g.bottom + 0.08, -D + 0.1, b - (in1 ? 0.08 : 0), g.top - 0.08, D - 0.1, CREAM);
      put(a, g.top - 0.08, -D, b, g.top, D, RED);
      put(a, g.bottom, -D, b, g.bottom + 0.08, D, BLUE);
      if (in0) put(a, g.bottom + 0.08, -D + 0.04, Math.min(b, a + 0.08), g.top - 0.08, D - 0.04, NAVY);
      if (in1) put(Math.max(a, b - 0.08), g.bottom + 0.08, -D + 0.04, b, g.top - 0.08, D - 0.04, NAVY);
    }
    // (yellow marks along the beams, which go by with the girders: how fast the machine turns is seen even
    // where it is empty)
    for (let x = 2 - ((((scroll % 2) + 2) % 2)); x < W - 0.7; x += 2) for (const y of [LOW + 0.22, TOP + 0.22]) put(Math.max(0, x), y, 1.25, x + 0.7, y + 0.16, 1.27, YELLOW);
    this.boxes.count = n;
    this.boxes.instanceMatrix.needsUpdate = true; this.boxes.instanceColor.needsUpdate = true;
    // the sparks turn and bob
    const mm = this._m, list = R.sparks, clock = this._clock;
    for (let k = 0; k < list.length; k++) {
      const x = list[k][0] - scroll, shown = !(got && got[k]) && x > 0.45 && x < W - 0.45, sc = shown ? 1 + 0.12 * Math.sin(clock * 5 + k * 1.7) : 0.0001;
      this._e.set(0, clock * 2.4 + k, 0);
      mm.compose(this._v.set(shown ? x : 1, list[k][1] + (shown ? 0.07 * Math.sin(clock * 3 + k) : 0), 0), this._q.setFromEuler(this._e), this._sc.set(sc, sc, sc));
      this.sparks.setMatrixAt(k, mm);
    }
    this.sparks.instanceMatrix.needsUpdate = true;
    // the flag in the machine, the name of the stretch (which unrolls out of the right tower and rolls into the left one), the arch
    for (const f of this.flags) f.visible = false;
    for (let k = 0; k < FLAGS.length; k++) { const x = FLAGS[k].s - scroll; if (x > 0.3 && x < W - 1.2) { const f = this.flags[k % this.flags.length]; f.position.set(x, FLAGS[k].y, 0); f.visible = true; } }
    for (let k = 0; k < this.signs.length; k++) {
      const s = this.signs[k], left = R.stretches[k].from + 1.6 - scroll, a = Math.max(0.05, left), b = Math.min(W - 0.05, left + 4.8);
      s.visible = b - a > 0.1;
      if (s.visible) { s.position.set((a + b) / 2, TOP - 0.75, 0); s.scale.x = (b - a) / 4.8; }
    }
    const x = R.length - scroll;
    this.arch.visible = x > 0.4 && x < W - 0.4;
    if (this.arch.visible) this.arch.position.set(x, R.finish, 0);
  }

  /**
   * A run is asked for: the player is put in the machine, on the first girder, and runs with the next start of
   * the clock everybody shares. `io`: { play, note, splash, peers }. Returns the session — the driver of the player:
   * see src/extras/plug.js. `auto`: true (it runs by itself, any way to the end) or 'keen' (by itself, after every
   * spark). The run goes by that clock, not by the frames: who leaves with the same start is at the same girder.
   */
  open(player, io) {
    const R = FLIP, start = this.nextStart(), st = startRun(start.wait), events = [], input = { flip: false };
    // what is shown that the rules do not keep: how far round the runner has turned, where it tumbles after a
    // fall, how it drops back in; the other runners as last seen (for which way they move)
    const S = { turn: 0, want: 0, after: 0, acc: 0, last: this.clock(), press: false, fall: null, drop: 0, touch: false, seen: new Map(), boxes: [] }, pos = V(0, 0, 0), t = V(0, 0, 0), look = V(0, 0, 0), here = V(0, 0, 0);
    /** The other runners: the visitors seen inside the machine, each a box in one's own run (what is seen of them is a tenth of a second late). */
    const others = (real) => {
      const list = S.boxes, now = this.clock();
      list.length = 0;
      for (const p of io.peers?.() || []) {
        here.set(p.x, p.y, p.z).applyMatrix4(this._inv);
        if (here.x < 0.3 || here.x > W - 0.3 || Math.abs(here.z) > 1.3 || here.y < R.low || here.y > R.high) continue;
        const was = S.seen.get(p.id), prev = was && now - was.at < 300 ? was.box : null;
        const box = boxOf(p.id, here.x, here.y, st.scroll, prev, prev ? Math.max(real, 1e-3) : 0, 0.1);
        S.seen.set(p.id, { box, at: now });
        list.push(box);
      }
      return list;
    };
    const session = {
      flip: this, over: false, ended: false, score: 0, time: 0, line: '', riding: false, anim: ANIM.idle, state: st, auto: false, start, scroll: st.scroll,
      step: (dt, pl, control) => {
        const inp = pl.input, now = this.clock(), real = clamp((now - S.last) / 1000, 0, 0.25);
        S.last = now;
        S.touch = !!inp?.isTouch;
        if (control && inp?.jump) S.press = true;
        S.acc += real;
        const boxes = others(real);
        while (S.acc >= R.step && !st.over) {
          S.acc -= R.step;
          if (session.auto) botInput(st, input, session.auto === 'keen' ? 'keen' : 'mid'); else { input.flip = S.press; S.press = false; }
          stepRun(st, R.step, input, events, boxes);
        }
        for (const e of events) {
          if (e.type === 'tick') { if (e.n <= 3) io.play('tick'); }
          else if (e.type === 'go') io.play('start');
          else if (e.type === 'flip') { io.play('jump', { volume: 0.6 }); S.want += Math.PI; }
          else if (e.type === 'land') io.play('land', { volume: clamp(e.v / 22, 0.25, 0.8) });
          else if (e.type === 'bump') io.play('hit', { volume: e.by === 'runner' ? 0.3 : 0.5 });
          else if (e.type === 'spark') io.play('pick');
          else if (e.type === 'flag') io.play('checkpoint');
          else if (e.type === 'fall') {
            S.fall = { kind: e.kind, t: 0, x: st.s - st.scroll, c: st.c, vy: e.kind === 'left' ? 3 : st.vy, wet: false };
            io.play(e.kind === 'left' ? 'hit' : 'fail');
            io.note(`${e.kind === 'left' ? 'Pushed out of the machine!' : e.kind === 'sea' ? 'Out below, into the sea!' : 'Lost in the sky!'} +${R.fall.cost} s`);
          } else if (e.type === 'back') { S.fall = null; S.drop = 0.3; S.turn = S.want = st.g > 0 ? Math.PI : 0; io.play('respawn'); }
          else if (e.type === 'end') { io.play('bell'); io.play('victory', { volume: 0.7 }); io.note(`Through the arch! ${formatTime(e.time)}`, 4000); }
        }
        events.length = 0;
        // ---- where the machine is, between two steps of the rules: it never winds back, whatever befalls one
        const running = st.wait <= 0 && !(st.out > 0) && !st.over, v = speedAt(st.scroll + R.place), lead = running ? S.acc : 0;
        session.scroll = Math.min(R.length - R.place, st.scroll + (st.wait <= 0 && !st.over ? v * S.acc : 0));
        // ---- where the runner is shown: it turns about the middle of its body on the way over
        const f = S.fall;
        if (f) {
          // tumbling: thrown out in front of the left tower and down into the sea; or on down, or on up
          f.t += real;
          const up = f.kind === 'sky', y = f.c + f.vy * f.t + (up ? 0.5 : -0.5) * (f.kind === 'left' ? 34 : R.g) * f.t * f.t, x = f.kind === 'left' ? Math.max(0.4, f.x) : f.x, aside = f.kind === 'left' ? Math.min(3.4, 7 * f.t) : 0;
          if (!up && y < 0.3 && !f.wet) { f.wet = true; this.at(x, 0, aside, pos); io.splash(pos.x, 0, pos.z, 1.2); io.play('splash'); }
          S.turn += real * 9;
          this.at(x, Math.max(-2.4, y) - HB * Math.cos(S.turn), aside - HB * Math.sin(S.turn), pos);
        } else {
          S.turn += clamp(S.want - S.turn, -real * 18, real * 18);
          // (dropping back in after a fall: from a little way off, the way its feet point)
          S.drop = Math.max(0, S.drop - real);
          const x = st.s - st.scroll - (st.held ? v * lead : lagOf(st) > 1e-6 ? -v * lead * chaseAt(lagOf(st)) : 0), y = st.c + (running && st.on === -1 ? st.vy * lead : 0) - st.g * 1.6 * (S.drop / 0.3) ** 2;
          this.at(x, y - HB * Math.cos(S.turn), -HB * Math.sin(S.turn), pos);
        }
        pl.pos.copy(pos); pl.yaw = this.yaw; pl.pitch = 0; pl.roll = S.turn % (Math.PI * 2);
        pl.speed = running ? v : 0; pl.grounded = st.on !== -1;
        session.anim = f ? ANIM.jump : !running ? ANIM.idle : st.on !== -1 ? ANIM.run : ANIM.jump;
        if (st.over) { S.after += real; if (!session.over) { session.over = true; session.time = session.score = st.time; } if (S.after > 2.2) session.ended = true; }
        // (the time on it is the machine's, the same for everybody of the start, three seconds for each fall, less the sparks)
        const n = st.sparks, falls = st.falls, fell = `${falls} fall${falls === 1 ? '' : 's'} (+${falls * R.fall.cost} s)`;
        session.line = st.wait > 0 ? `${R.name} · ${start.name} start in ${Math.max(1, Math.ceil(st.wait))}…`
          : st.over ? `${R.name} · ${formatTime(st.time)} · ${n} spark${n === 1 ? '' : 's'}, ${falls ? fell : 'not a fall'}`
            : `${formatTime(scoreOf(st))} · ${R.stretches[stretchAt(st.s)].name}${n ? ` · ${n} spark${n === 1 ? '' : 's'}` : ''}${falls ? ` · ${fell}` : ''}${st.out > 0 ? ' · back in a moment' : ''}`;
      },
      /**
       * The camera: out at sea, side on, and it does not move — the whole machine in view, from the tower one
       * is pushed out at to the tower the girders come out of. On a screen too narrow for that (one held
       * upright) it keeps the left tower in view and shows as far ahead as it can.
       */
      camera: (cam) => {
        const fov = 50, aspect = cam.aspect || 1.6, half = Math.tan((fov * Math.PI) / 360) * aspect, need = W / 2 + 3.4;
        const away = clamp((need / half) * (S.touch && aspect > 1 ? 1.08 : 1), 27, 54), wide = away * half, cx = wide >= need ? W / 2 : wide - 3.4;
        this.at(cx, 11.6, away, t);
        cam.position.copy(t); cam.up.set(0, 1, 0);
        cam.lookAt(this.at(cx, 11.0, 0, look));
        return fov;
      },
      /** The run is over (or left): the player is put back on the sand, before the gate. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x - Math.sin(this.yaw) * 1.2, this.gate.z - Math.cos(this.yaw) * 1.2, this.yaw); session.close(); },
      close: () => { if (this.session === session) this.session = null; player.pitch = 0; player.roll = 0; },
    };
    this.session = session;
    io.play('tick');
    if (this.world.engine.camera.aspect < 1) io.note('Turn the screen on its side: you will see the whole machine.', 4500);
    session.step(0, player, false);
    return session;
  }

  /** Every frame, played or not: the girders go by — one's own run if one runs, the latest start otherwise; the sparks turn. */
  update(dt) {
    this._clock += dt;
    const s = this.session;
    this._show(s ? s.scroll : this._idle(this.clock()), s ? s.state.got : null);
  }
}
