// Out on a Limb, tried again — one floor of it: what is seen and how it is climbed. Its rules are in limb.js;
// here it is built — the old snag, its four limbs, the net, the plate and the bell, the gate — and a climb is
// run: a session that drives the player (see PlayerController.driver), with a camera put outside the tree.
import * as THREE from 'three';
import { Parts } from '../../../src/world/props/MeshBuilder.js';
import { LAYER } from '../../../src/render/Shadows.js';
import { ANIM } from '../../../src/player/Character.js';
import { canvasBoard } from '../../../src/world/zones/games/Boards.js';
import { formatTime } from '../../../src/world/zones/games/course.js';
import { LIMB, limbs, limbAt, startClimb, stepClimb, climbFall, botInput } from './limb.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const RAD = Math.PI / 180, TAU = Math.PI * 2;
const CREAM = [1.3, 1.17, 0.9], RED = [0.95, 0.1, 0.12], GOLD = [1.5, 1.05, 0.2], BARK = [0.82, 0.76, 0.68], PALE = [1.25, 1.2, 1.1], ROPE = [1.1, 0.95, 0.7];

export class Floor {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'limb';
    this.session = null;
    this.best = 0;
  }

  build() {
    const world = this.world, mats = world.materials, P = LIMB, L = limbs();
    const bx = P.at.x, bz = P.at.z, by = this.data.heightAt(bx, bz);
    this.base = V(bx, by, bz);
    const parts = new Parts(), bark = parts.get('woodDark'), deck = parts.get('woodDeck'), matte = parts.get('matte'), paint = parts.get('paint');
    // ---- the snag: a great dead trunk, broken off at the top
    bark.tint(...BARK, 1).place(bx, by, bz).lathe([[P.trunk.r + 0.9, -0.8], [P.trunk.r + 0.35, 0.5], [P.trunk.r, 2.0], [P.trunk.r - 0.15, 7], [P.trunk.top, P.trunk.h - 1.2], [P.trunk.top - 0.25, P.trunk.h], [P.trunk.top * 0.55, P.trunk.h + 0.9], [0, P.trunk.h + 0.5]], 12).pop();
    // ---- the limbs: each leaves the trunk and curls round it; what one walks is the curl, flat on top
    const limbParts = (limb) => {
      const p = new Parts(), b = p.get('woodDark'), top = p.get('woodDeck'), tone = limb.dead ? PALE : BARK, n = limb.line.length;
      const a0 = (limb.from - 9) * RAD, root = V(-(P.trunk.r - 0.2) * Math.sin(a0), limb.y[0] - 0.9, -(P.trunk.r - 0.2) * Math.cos(a0)), first = limb.line[0];
      b.tint(...tone, 1).rod(root, V(first.x, first.y - 0.34, first.z), 0.42, 8, { r1: 0.36 });
      for (let k = 0; k + 1 < n; k++) {
        const a = limb.line[k], c = limb.line[k + 1], r0 = 0.36 - 0.1 * (k / n), r1 = 0.36 - 0.1 * ((k + 1) / n);
        b.tint(...tone, 1).rod(V(a.x, a.y - r0, a.z), V(c.x, c.y - r1, c.z), r0, 8, { r1, caps: k === n - 2 });
        // (the top of it, planed flat: where the feet go)
        const d = Math.hypot(c.x - a.x, c.z - a.z) || 1, px = (-(c.z - a.z) / d) * 0.26, pz = ((c.x - a.x) / d) * 0.26;
        top.tint(...(limb.dead ? [1.15, 1.1, 1.0] : [1.05, 1.0, 0.9]), 1).quad(V(a.x - px, a.y, a.z - pz), V(a.x + px, a.y, a.z + pz), V(c.x + px, c.y, c.z + pz), V(c.x - px, c.y, c.z - pz), { normal: V(0, 1, 0) });
        top.quad(V(a.x + px, a.y, a.z + pz), V(a.x - px, a.y, a.z - pz), V(c.x - px, c.y, c.z - pz), V(c.x + px, c.y, c.z + pz), { normal: V(0, 1, 0) });
      }
      const g = p.toMeshes(mats, { name: `limb-${limb.index}`, layers: [] });
      g.position.copy(this.base);
      this.group.add(g);
      return g;
    };
    this.limbs = L.map(limbParts);
    // ---- the net: rings and spokes of rope under it all, held by eight poles
    const net = by + P.net.y, ring = (r, n = 40) => { for (let k = 0; k < n; k++) matte.tint(...ROPE, 1).rod(V(bx + Math.cos((k / n) * TAU) * r, net, bz + Math.sin((k / n) * TAU) * r), V(bx + Math.cos(((k + 1) / n) * TAU) * r, net, bz + Math.sin(((k + 1) / n) * TAU) * r), 0.03, 4, { caps: false }); };
    for (const r of [2.3, 3.5, 4.7, 5.9, 7.1, 8.3, P.net.r]) ring(r);
    for (let k = 0; k < 24; k++) matte.tint(...ROPE, 1).rod(V(bx + Math.cos((k / 24) * TAU) * 1.8, net, bz + Math.sin((k / 24) * TAU) * 1.8), V(bx + Math.cos((k / 24) * TAU) * P.net.r, net, bz + Math.sin((k / 24) * TAU) * P.net.r), 0.03, 4, { caps: false });
    for (let k = 0; k < 8; k++) { const x = bx + Math.cos((k / 8) * TAU) * P.net.r, z = bz + Math.sin((k / 8) * TAU) * P.net.r, g = this.data.heightAt(x, z); bark.tint(...BARK, 1).cylinder(x, g - 0.3, z, 0.13, 0.1, net - g + 0.7, 7); }
    // ---- the plate one leaves, the bell one rings
    const first = L[0].line[1], last = L[3].line[L[3].line.length - 1];
    paint.tint(...RED, 1).cylinder(bx + first.x, by + first.y + 0.005, bz + first.z, 0.34, 0.34, 0.03, 14);
    paint.tint(...GOLD, 1).place(bx + last.x, by + last.y + 1.75, bz + last.z).lathe([[0.03, 0.34], [0.12, 0.3], [0.2, 0.08], [0.29, -0.04], [0.31, -0.1]], 10).pop();
    bark.tint(...BARK, 1).rod(V(bx + last.x * 0.5, by + last.y + 2.3, bz + last.z * 0.5), V(bx + last.x * 1.02, by + last.y + 2.12, bz + last.z * 1.02), 0.07, 6);
    // ---- the gate, towards the old tree: two posts and the name
    const gz = bz - P.gate.away, gy = this.data.heightAt(bx, gz);
    this.gate = { x: bx, y: gy, z: gz, yaw: 0 };
    for (const dx of [-1.3, 1.3]) for (let y = 0, k = 0; y < 2.9; y += 0.58, k++) paint.tint(...(k % 2 ? CREAM : [0.35, 0.55, 0.2]), 1).cylinder(bx + dx, gy + y, gz, 0.12, 0.12, 0.58, 8);
    this.group.add(parts.toMeshes(mats, { name: 'limb-snag', layers: [LAYER.STATIC_CASTER] }));
    this.sign = canvasBoard(512, 150, (ctx, w, h) => {
      ctx.fillStyle = '#1f2a14'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = "700 54px Georgia, 'Times New Roman', serif"; ctx.fillText(P.name.toUpperCase(), w / 2, 50, w * 0.9);
      ctx.fillStyle = '#f2c14e'; ctx.font = '600 21px system-ui, sans-serif'; ctx.fillText('ONE FLOOR TO TRY · FROM THE PLATE TO THE BELL', w / 2, 92, w * 0.9);
      ctx.fillStyle = '#ffffff'; ctx.font = '600 24px ui-monospace, Menlo, monospace'; ctx.fillText(this.best ? `your best  ${formatTime(this.best)}` : 'no climb yet', w / 2, 124, w * 0.9);
    }, 3.0, 0.88, { both: true });
    this.sign.mesh.position.set(bx, gy + 3.2, gz); this.sign.mesh.name = 'limb-sign';
    this.group.add(this.sign.mesh);
    // the ring of light that shows where a jump would end: green on a limb, red in the net
    const mark = (tone, name) => {
      const p = new Parts(), b = p.get('glow');
      b.tint(...tone, 1);
      for (let k = 0; k < 24; k++) { const a0 = (k / 24) * TAU, a1 = ((k + 1) / 24) * TAU; b.quad(V(Math.sin(a0) * 0.5, 0, Math.cos(a0) * 0.5), V(Math.sin(a0) * 0.85, 0, Math.cos(a0) * 0.85), V(Math.sin(a1) * 0.85, 0, Math.cos(a1) * 0.85), V(Math.sin(a1) * 0.5, 0, Math.cos(a1) * 0.5), { normal: V(0, 1, 0) }); }
      b.cylinder(0, 0, 0, 0.06, 0.02, 2.2, 5);
      const g = p.toMeshes(mats, { name, layers: [] });
      g.visible = false;
      this.group.add(g);
      return g;
    };
    this.mark = { ok: mark([0.25, 1.3, 0.3], 'limb-mark-ok'), bad: mark([1.3, 0.12, 0.1], 'limb-mark-bad') };
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    return this;
  }

  setBest(ms) { this.best = ms || 0; this.sign?.redraw(); }
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.2 * 2.2; }

  /**
   * A climb starts: the player is put on the plate. `io`: { play(sound, options), note(text) }. Returns the session
   * — the driver of the player: step(dt, player, control), camera(camera, dt), line, over (`time` in ms), ended,
   * drop(player), close(), auto (true: it climbs by itself).
   */
  open(player, io) {
    const P = LIMB, L = limbs(), B = this.base, st = startClimb(), events = [], input = { x: 0, z: 0, jump: false }, fall = {};
    const S = { cam: null, look: V(0, 0, 0), after: 0, acc: 0, told: new Set() }, _t = V(0, 0, 0), _p = {};
    const session = {
      floor: this, over: false, ended: false, time: 0, line: '', riding: false, anim: ANIM.idle, state: st, auto: false,
      step: (dt, pl, control) => {
        const inp = pl.input, mx = control ? inp.move.x : 0, my = control ? inp.move.y : 0;
        // which way one pushes, as the camera — outside the tree, looking in — shows it; on a limb, "forwards" is along it
        const d = Math.hypot(st.x, st.z) || 1, ox = st.x / d, oz = st.z / d, rx = oz, rz = -ox; // (to the right of who looks in)
        if (session.auto) {
          S.acc += Math.min(dt, 0.25);
          while (S.acc >= P.step && !st.over) { S.acc -= P.step; botInput(st, input); stepClimb(st, P.step, input, events); }
        } else {
          if (st.on >= 0) { const p = limbAt(L[st.on], st.s, st.clock, _p), flat = Math.hypot(p.tx, p.tz) || 1; input.x = rx * mx + (p.tx / flat) * my; input.z = rz * mx + (p.tz / flat) * my; }
          else { input.x = rx * mx - ox * my; input.z = rz * mx - oz * my; }
          input.jump = control && !!inp.jump;
          if (!st.over) stepClimb(st, dt, input, events);
        }
        for (const e of events) this._tell(e, st, io, S);
        events.length = 0;
        pl.pos.set(B.x + st.x, B.y + st.y, B.z + st.z); pl.yaw = st.yaw; pl.pitch = 0; pl.roll = 0;
        pl.speed = st.on >= 0 ? Math.abs(st.v) : 3; pl.grounded = true;
        session.anim = st.net > 0 ? ANIM.sit : st.on < 0 ? ANIM.jump : Math.abs(st.v) > 0.4 ? ANIM.run : ANIM.idle;
        // the limb that sways, the dead one that is gone
        L.forEach((limb, k) => { const g = this.limbs[k]; g.position.y = B.y + (limb.sway ? limb.sway.amp * 0.8 * Math.sin((st.clock / limb.sway.period) * TAU) : 0); g.visible = !(limb.dead && st.gone >= 0); g.updateMatrixWorld(true); });
        // where a jump would end — the one one is in, or the one one would take this instant
        const end = st.over ? null : climbFall(st, true, fall);
        this.mark.ok.visible = !!end && end.ok; this.mark.bad.visible = !!end && !end.ok && st.on < 0;
        if (end) { const m = end.ok ? this.mark.ok : this.mark.bad, k = st.on >= 0 ? 0.75 : 1 + 0.1 * Math.sin(st.clock * 12); m.position.set(B.x + end.x, B.y + end.y + 0.06, B.z + end.z); m.scale.set(k, 1, k); m.updateMatrixWorld(true); }
        if (st.over) { S.after += dt; if (!session.over) { session.over = true; session.time = st.time; } if (S.after > 2.2) session.ended = true; }
        session.line = st.over ? `${P.name} · ${formatTime(st.time)}` : st.started ? `${P.name} · ${formatTime(Math.round((st.clock - st.t0) * 1000))} · ${st.falls} in the net` : `${P.name} · the clock starts when you move`;
      },
      /** The camera: outside the tree, level with the climber, looking in — nothing is ever between the two. */
      camera: (cam, dt) => {
        const d = Math.hypot(st.x, st.z) || 1, ox = st.x / d, oz = st.z / d, rx = oz, rz = -ox;
        _t.set(B.x + st.x + ox * 6.8 - rx * 1.0, B.y + st.y + 2.5, B.z + st.z + oz * 6.8 - rz * 1.0);
        if (!S.cam) S.cam = _t.clone(); else S.cam.lerp(_t, Math.min(1, dt * 4));
        _t.set(B.x + st.x + rx * 1.6, B.y + st.y + 1.0, B.z + st.z + rz * 1.6);
        S.look.lerp(_t, S.look.lengthSq() ? Math.min(1, dt * 7) : 1);
        cam.position.copy(S.cam); cam.up.set(0, 1, 0); cam.lookAt(S.look);
        return 58;
      },
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.teleport(this.gate.x, this.gate.z - 1.5, Math.PI); session.close(); },
      close: () => { if (this.session === session) this.session = null; this.mark.ok.visible = this.mark.bad.visible = false; this.limbs.forEach((g) => { g.visible = true; g.position.y = B.y; g.updateMatrixWorld(true); }); },
    };
    this.session = session;
    session.step(0, player, false);
    return session;
  }

  _tell(e, st, io, S) {
    const L = limbs();
    if (e.type === 'go') io.play('start', { volume: 0.6 });
    else if (e.type === 'jump') io.play('jump', { volume: 0.6 });
    else if (e.type === 'land') { io.play('land', { volume: 0.5 }); if (!S.told.has(e.limb)) { S.told.add(e.limb); io.note(L[e.limb].sway ? 'This one sways: time the next jump.' : L[e.limb].dead ? 'Dead wood: it will not hold long!' : L[e.limb].bell ? 'To the end of it: the bell!' : ''); } }
    else if (e.type === 'crack') io.play('whack', { volume: 0.8 });
    else if (e.type === 'net') { io.play('land'); io.note('Caught by the net — back to the limb you left.'); }
    else if (e.type === 'back') io.play('respawn', { volume: 0.6 });
    else if (e.type === 'bell') { io.play('bell'); io.play('victory', { volume: 0.7 }); io.note(`The bell! ${formatTime(e.time)}`); }
  }
}
