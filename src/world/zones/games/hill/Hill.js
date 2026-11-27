// Jump the Logs: what is seen of it and how it is climbed. Its rules are in slope.js; here it is built — the
// ropes along the slope, the arch of the start and the bell at the top, the lines where the barrels and the
// boulders are stopped, what rolls — and a climb is run: a session that drives the player (see
// PlayerController.driver). What rolls is drawn from the clock of the world: everybody sees the same.
// Each of the four stretches has a colour — green at the foot, then yellow, orange, red by the bell —: its kerbs
// along both sides, the line at its foot and its sign; and whatever rolls wears the colour of the stretch where
// it is stopped (the line of its colour: it never goes past it). So, in a stretch, what can reach one wears its
// colour or the colours below it.
import * as THREE from 'three';
import { Parts } from '../../../props/MeshBuilder.js';
import { LAYER } from '../../../../render/Shadows.js';
import { ANIM } from '../../../../player/Character.js';
import { canvasBoard } from '../Boards.js';
import { formatTime } from '../course.js';
import { HILL, nextStart, startClimb, stepClimb, slopeAt, rolling, botInput, stretchOf } from './slope.js';
import { sharedNow } from '../../../../net/api.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CREAM = [1.3, 1.17, 0.9], RED = [0.95, 0.1, 0.12], GOLD = [1.5, 1.05, 0.2], ROPE = [1.1, 0.95, 0.7], NAVY = [0.07, 0.07, 0.2], YELLOW = [1.6, 1.3, 0.12];
const TONES = { Red: '#e23b2e', Blue: '#2f7fe6', Green: '#2fae4f', Yellow: '#f2c14e', Purple: '#9a5be0', Orange: '#f08a24' };
// the colours of the four stretches, from the foot to the bell: as paint, as written, as said
const STAGE = [[0.15, 0.85, 0.3], [1.6, 1.3, 0.12], [1.6, 0.55, 0.06], [0.95, 0.1, 0.12]];
const STAGE_HEX = ['#2fae4f', '#f2c14e', '#f08a24', '#e23b2e'], STAGE_NAME = ['green', 'yellow', 'orange', 'red'];
/** The stretch where a thing that rolls is stopped (its colour): 1 … 4 — what `stretchOf(t.end)` says, counted without a list. */
const stageOf = (t) => (t.end >= HILL.tiers[2] ? 4 : t.end >= HILL.tiers[1] ? 3 : t.end >= HILL.tiers[0] ? 2 : 1);
// (how many of each can be rolling at once — over hours of the clock: 17 logs, 10 barrels, 10 boulders —, with room to spare)
const ROLLING = { log: 22, barrel: 14, boulder: 14 };

export class Hill {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'hill';
    this.session = null;
    this.best = 0;
    /** The clock everybody shares (ms): the starts and what rolls are counted on it. */
    this.clock = sharedNow; // (the clock everybody shares: net/api.js)
  }

  /** A place of the slope in the world: its point on the ground. */
  at(s, u, out = V(0, 0, 0)) { const p = slopeAt(s, u, this._p || (this._p = {})); return out.set(p.x, this.data.heightAt(p.x, p.z), p.z); }

  build() {
    const world = this.world, mats = world.materials, H = HILL, parts = new Parts(), bark = parts.get('woodDark'), matte = parts.get('matte'), paint = parts.get('paint');
    // ---- a rope on stakes along both sides
    for (const side of [-1, 1]) {
      let prev = null;
      for (let s = -1; s <= H.length + 2.01; s += 3.5) {
        const p = this.at(s, side * (H.half + 0.5));
        bark.tint(0.9, 0.85, 0.8, 1).cylinder(p.x, p.y - 0.3, p.z, 0.07, 0.055, 1.25, 6);
        const top = V(p.x, p.y + 0.85, p.z);
        if (prev) matte.tint(...ROPE, 1).rod(prev, top, 0.025, 4, { caps: false });
        prev = top;
      }
    }
    // ---- the arch of the start, the arch of the top and its bell
    const arch = (s, tone, text, sub) => {
      const a = this.at(s, -H.half - 0.9), b = this.at(s, H.half + 0.9), y = Math.max(a.y, b.y) + 3.6;
      for (const p of [a, b]) for (let h = p.y - 0.3, k = 0; h < y; h += 0.62, k++) paint.tint(...(k % 2 ? CREAM : tone), 1).cylinder(p.x, h, p.z, 0.13, 0.13, Math.min(0.62, y - h), 8);
      const board = canvasBoard(1024, 128, (ctx, w, hh) => {
        ctx.fillStyle = '#3a1410'; ctx.fillRect(0, 0, w, hh);
        ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, hh - 12);
        ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = "700 60px Georgia, 'Times New Roman', serif"; ctx.fillText(text, w / 2, sub ? 50 : 66, w * 0.92);
        if (sub) { ctx.fillStyle = '#f2c14e'; ctx.font = '600 24px system-ui, sans-serif'; ctx.fillText(sub, w / 2, 100, w * 0.92); }
      }, a.distanceTo(b), a.distanceTo(b) / 8, { both: true });
      board.mesh.position.set((a.x + b.x) / 2, y - 0.2, (a.z + b.z) / 2); board.mesh.rotation.y = H.yaw; board.mesh.name = 'hill-arch';
      this.group.add(board.mesh);
      return { a, b, y, board: board.mesh };
    };
    // (the board of the start bears the name of the game: whoever climbs does not see it — from the line, the camera
    // is behind it and it would hide the slope —, everybody else does; see open)
    this.title = arch(0, RED, H.name.toUpperCase(), `A START EVERY ${H.every} SECONDS · UP TO THE BELL · WHAT ROLLS STOPS AT THE LINE OF ITS COLOUR`).board;
    const top = arch(H.length, NAVY, 'THE TOP', '');
    const bell = this.at(H.length + 0.4, 0);
    paint.tint(...GOLD, 1).place(bell.x, top.y - 1.5, bell.z).lathe([[0.03, 0.4], [0.14, 0.36], [0.24, 0.1], [0.34, -0.05], [0.37, -0.12]], 10).pop();
    // ---- the foot of each stretch, where part of what comes down is stopped: a line painted across in the colour
    // of the stretch above it — what wears that colour stops there —, and a board at the side that says so
    const sign = (s, k, text, sub) => {
      const p = this.at(s, H.half + 1.6);
      bark.tint(0.9, 0.85, 0.8, 1).cylinder(p.x, p.y - 0.3, p.z, 0.08, 0.07, 2.3, 6);
      const board = canvasBoard(512, 160, (ctx, w, hh) => {
        ctx.fillStyle = '#12122e'; ctx.fillRect(0, 0, w, hh);
        ctx.fillStyle = STAGE_HEX[k]; ctx.fillRect(0, 0, 44, hh); ctx.fillRect(w - 44, 0, 44, hh); // (bands of its colour at both ends)
        ctx.strokeStyle = STAGE_HEX[k]; ctx.lineWidth = 8; ctx.strokeRect(4, 4, w - 8, hh - 8);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f6e7b8'; ctx.font = '800 46px system-ui, sans-serif'; ctx.fillText(text, w / 2, hh * 0.38, w - 110);
        ctx.fillStyle = STAGE_HEX[k]; ctx.font = '700 25px system-ui, sans-serif'; ctx.fillText(sub, w / 2, hh * 0.74, w - 110);
      }, 2.2, 0.69, { both: true });
      board.mesh.position.set(p.x, p.y + 1.9, p.z); board.mesh.rotation.y = H.yaw; board.mesh.name = 'hill-sign';
      this.group.add(board.mesh);
    };
    sign(1.2, 0, 'STRETCH 1 · GREEN', 'green rolls all the way down');
    for (const [k, what] of [[0, 'barrels beyond'], [1, 'boulders beyond'], [2, 'everything at once']]) {
      const s = H.tiers[k];
      sign(s, k + 1, `STRETCH ${k + 2} · ${STAGE_NAME[k + 1].toUpperCase()}`, `${STAGE_NAME[k + 1]} stops here · ${what}`);
      for (let u = -H.half; u <= H.half + 0.01; u += 0.92) { const q = this.at(s - 0.4, u); paint.tint(...(Math.round(u / 0.92) % 2 ? STAGE[k + 1] : NAVY), 1).box(q.x - 0.3, q.y + 0.01, q.z - 0.1, q.x + 0.3, q.y + 0.05, q.z + 0.1); }
    }
    // ---- kerbs along both sides, in the colour of each stretch (and cream between): which stretch one is in
    for (const side of [-1, 1]) {
      for (let s = 0, k = 0; s < H.length - 0.2; s += 1, k++) {
        const stage = stretchOf(s + 0.5) - 1, a = this.at(s + 0.05, side * (H.half - 0.12)), b = this.at(s + 0.95, side * (H.half - 0.12));
        a.y += 0.035; b.y += 0.035;
        paint.tint(...(k % 2 ? CREAM : STAGE[stage]), 1).beam(a, b, 0.24, 0.07);
      }
    }
    // ---- the gate, a little before the line: where one asks to climb
    const g = this.at(-3.2, 0);
    this.gate = { x: g.x, y: g.y, z: g.z, yaw: H.yaw };
    this.group.add(parts.toMeshes(mats, { name: 'hill-lane', layers: [LAYER.STATIC_CASTER] }));
    // ---- what rolls: as many of each as can roll at once — one mesh per kind and material, a copy for each thing —,
    // put where the clock says; its painted bands wear the colour of the stretch where it stops, its wood or its rock
    // a shade of its own (each copy's colour: instanceColor)
    this.kinds = {};
    const make = (kind, build) => {
      const p = new Parts(), n = ROLLING[kind], meshes = [];
      build(p);
      for (const [key, b] of p.map) {
        const mesh = new THREE.InstancedMesh(b.build(), mats[key], n);
        mesh.name = `hill-${kind}:${key}`;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        mesh.frustumCulled = false; // (its copies are all over the slope)
        this.group.add(mesh);
        meshes.push({ key, mesh });
      }
      this.kinds[kind] = { meshes };
    };
    const r0 = HILL.kinds.log.r, r1 = HILL.kinds.barrel.r, r2 = HILL.kinds.boulder.r;
    make('log', (p) => {
      p.get('woodDark').tint(1, 0.95, 0.9, 1).rod(V(-0.5, 0, 0), V(0.5, 0, 0), r0, 9);
      p.get('woodDeck').tint(1.1, 1.0, 0.85, 1).rod(V(-0.502, 0, 0), V(0.502, 0, 0), r0 * 0.82, 9);
      for (const x of [-0.36, 0, 0.36]) p.get('paint').tint(1, 1, 1, 1).rod(V(x - 0.035, 0, 0), V(x + 0.035, 0, 0), r0 * 1.05, 9, { caps: false }); // (three painted bands)
    });
    make('barrel', (p) => {
      p.get('woodDeck').tint(1, 0.9, 0.75, 1).rod(V(-0.5, 0, 0), V(-0.17, 0, 0), r1 * 0.9, 10, { r1 }).rod(V(-0.17, 0, 0), V(0.17, 0, 0), r1, 10).rod(V(0.17, 0, 0), V(0.5, 0, 0), r1, 10, { r1: r1 * 0.9 });
      for (const x of [-0.3, 0, 0.3]) p.get('paint').tint(1, 1, 1, 1).rod(V(x - 0.04, 0, 0), V(x + 0.04, 0, 0), r1 * 1.03, 10, { caps: false }); // (its hoops, painted)
    });
    make('boulder', (p) => {
      p.get('rock').tint(1, 1, 1, 1).lathe([[0, -r2], [r2 * 0.62, -r2 * 0.8], [r2 * 0.97, -r2 * 0.25], [r2, r2 * 0.2], [r2 * 0.72, r2 * 0.75], [0, r2 * 0.98]], 8);
      // (a painted band round it, both ways: it shows whichever way the boulder has turned)
      p.get('paint').tint(1, 1, 1, 1).lathe([[r2 * 1.0, -r2 * 0.2], [r2 * 1.03, 0], [r2 * 1.0, r2 * 0.2]], 10);
      p.get('paint').place(0, 0, 0, 0, 0, Math.PI / 2).lathe([[r2 * 0.99, -r2 * 0.12], [r2 * 1.02, 0], [r2 * 0.99, r2 * 0.12]], 10).pop();
    });
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    return this;
  }

  setBest(ms) { this.best = ms || 0; }
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.4 * 2.4; }
  /** The start one who asks now would leave with (see slope.js). */
  nextStart() { const st = nextStart(this.clock()); return { ...st, tone: TONES[st.name] || '#f2c14e' }; }

  /** Puts what rolls where it is at `clock` (s of the shared clock), each thing in the colour of where it stops. */
  _roll(clock) {
    const used = { log: 0, barrel: 0, boulder: 0 }, p = this._rp || (this._rp = V(0, 0, 0)), m = this._rm || (this._rm = new THREE.Matrix4());
    const e = this._re || (this._re = new THREE.Euler(0, 0, 0, 'YXZ')), q = this._rq || (this._rq = new THREE.Quaternion()), sc = this._rs || (this._rs = V(1, 1, 1));
    rolling(clock, (t) => {
      const kind = this.kinds[t.kind], i = used[t.kind];
      if (i >= ROLLING[t.kind]) return;
      used[t.kind]++;
      this.at(t.s, t.u, p);
      p.y += t.r;
      // (it lies across the slope and turns about that axis as it comes down; a boulder tumbles)
      q.setFromEuler(e.set(-t.turn, HILL.yaw, 0, 'YXZ'));
      sc.set(t.kind === 'log' ? t.half * 2 : t.kind === 'barrel' ? 1.25 : 1, 1, 1);
      m.compose(p, q, sc);
      const c = STAGE[stageOf(t) - 1], shade = 0.85 + (0.2 * ((t.n * 37) % 5)) / 5;
      for (const { key, mesh } of kind.meshes) {
        mesh.setMatrixAt(i, m);
        if (key === 'paint') mesh.instanceColor.setXYZ(i, c[0], c[1], c[2]);
        else if (key !== 'woodDeck') mesh.instanceColor.setXYZ(i, shade, shade, shade);
      }
    });
    for (const [name, kind] of Object.entries(this.kinds)) for (const { mesh } of kind.meshes) { mesh.count = used[name]; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
  }
  /** What rolls at `clock` (s of the shared clock; now by default), in the order it is drawn: [{ kind, stage, s }] (for the checks). */
  rollingNow(clock = this.clock() / 1000) {
    const out = [];
    rolling(clock, (t) => out.push({ kind: t.kind, stage: stageOf(t), s: +t.s.toFixed(1) }));
    return out;
  }

  /**
   * A climb is asked for: the player is put on the line and leaves with the next start. `io`: { play, note }.
   * Returns the session — the driver of the player: step(dt, player, control), camera(camera, dt), line, start (its
   * name), over (`time` in ms), ended, drop(player), close(), auto (true: it climbs by itself).
   */
  open(player, io) {
    const H = HILL, start = this.nextStart(), events = [], input = { up: 0, side: 0, jump: false }, u0 = (Math.random() * 2 - 1) * (H.half - 1);
    let st = startClimb(start.at / 1000, u0);
    const S = { gone: false, cam: null, look: V(0, 0, 0), after: 0, acc: 0, last: 9 }, _t = V(0, 0, 0), pos = V(0, 0, 0);
    const session = {
      hill: this, over: false, ended: false, time: 0, line: '', start, riding: false, anim: ANIM.idle, state: st, auto: false,
      step: (dt, pl, control) => {
        const inp = pl.input, wait = (start.at - this.clock()) / 1000;
        if (!S.gone) {
          // (waiting for the start, on the line: one picks one's spot along it — left, right —, not up the slope yet;
          // nothing that rolls touches anybody before the start)
          const lim = H.half - H.body, want = control && !session.auto ? Math.max(-1, Math.min(1, inp.move.x || 0)) * H.side : 0;
          st.vu += Math.max(-H.accel * dt, Math.min(H.accel * dt, want - st.vu));
          const u = st.u + st.vu * dt;
          st.u = Math.max(-lim, Math.min(lim, u));
          if (st.u !== u) st.vu = 0;
          if (Math.ceil(wait) !== S.last && wait > 0 && wait <= 3) { S.last = Math.ceil(wait); io.play('tick'); }
          if (wait <= 0) { const { u: at, vu } = st; S.gone = true; st = session.state = startClimb(start.at / 1000, at); st.vu = vu; st.clock = Math.min(0.25, -wait); io.play('start'); }
        } else if (session.auto) {
          S.acc += Math.min(dt, 0.25);
          while (S.acc >= H.step && !st.over) { S.acc -= H.step; botInput(st, input); stepClimb(st, H.step, input, events); }
        } else {
          input.up = control ? inp.move.y : 0; input.side = control ? inp.move.x : 0; input.jump = control && !!inp.jump;
          if (!st.over) stepClimb(st, dt, input, events);
        }
        for (const e of events) this._tell(e, io);
        events.length = 0;
        this.at(st.s, st.u, pos);
        pl.pos.set(pos.x, pos.y + st.h, pos.z); pl.yaw = H.yaw; pl.roll = 0; pl.pitch = st.knock > 0 ? -1.1 : 0;
        pl.speed = Math.hypot(st.vs, st.vu); pl.grounded = true;
        session.anim = st.knock > 0 ? ANIM.sit : st.h > 0.05 ? ANIM.jump : pl.speed > 0.5 ? ANIM.run : ANIM.idle;
        if (st.over) { S.after += dt; if (!session.over) { session.over = true; session.time = st.time; } if (S.after > 2) session.ended = true; }
        session.line = !S.gone ? `${H.name} · ${start.name} start in ${Math.max(1, Math.ceil(wait))}…`
          : st.over ? `${H.name} · ${formatTime(st.time)}` : `${formatTime(Math.round(st.clock * 1000))} · stretch ${stretchOf(st.s)} of 4 (${STAGE_NAME[stretchOf(st.s) - 1]}) · ${Math.max(0, Math.round(H.length - st.s))} m to the bell${st.hits ? ` · hit ${st.hits} time${st.hits === 1 ? '' : 's'}` : ''}`;
      },
      /** The camera: behind the climber and above, looking up the slope at what comes. */
      camera: (cam, dt) => {
        const back = this.at(Math.max(-6, st.s - 6.2), st.u * 0.7, _t);
        _t.set(back.x, back.y + 3.5, back.z);
        if (!S.cam) S.cam = _t.clone(); else S.cam.lerp(_t, Math.min(1, dt * 6));
        this.at(st.s + 9, st.u * 0.5, _t); _t.y += 1.2;
        S.look.lerp(_t, S.look.lengthSq() ? Math.min(1, dt * 8) : 1);
        cam.position.copy(S.cam); cam.up.set(0, 1, 0); cam.lookAt(S.look);
        return 64;
      },
      /** The climb is over (or left): the player is let go where they are — at the top, or back at the gate. */
      drop: (pl, rang) => { pl.driver = null; pl.riding = false; pl.pitch = 0; const q = rang ? this.at(H.length + 2.5, st.u) : V(this.gate.x, 0, this.gate.z); pl.teleport(q.x, q.z, H.yaw); session.close(); },
      close: () => { if (this.session === session) { this.session = null; if (this.title) this.title.visible = true; } player.pitch = 0; },
    };
    this.session = session;
    if (this.title) this.title.visible = false;
    session.step(0, player, false);
    return session;
  }

  _tell(e, io) {
    if (e.type === 'jump') io.play('jump', { volume: 0.55 });
    else if (e.type === 'hit') { io.play('hit'); io.note(e.kind === 'log' ? 'Rolled over by a log!' : e.kind === 'barrel' ? 'Bowled over by a barrel!' : 'Flattened by a boulder!'); }
    else if (e.type === 'top') { io.play('bell'); io.play('victory', { volume: 0.7 }); io.note(`The top! ${formatTime(e.time)}`); }
  }

  /** Every frame: what rolls is where the clock of the world says. */
  update() { this._roll(this.clock() / 1000); }
}
