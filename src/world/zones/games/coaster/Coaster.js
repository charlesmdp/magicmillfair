// Hold the Rails!: what is seen of it and how it is played. The line and the car are in rules.js; here they are
// built — a wooden coaster on painted trestle bents standing on the rock of the three ranges, its station at
// the back of the north beach, its lifts, the pylons with a flag, the boards before what is broken, the
// terminus in the meadow — and a run is run: a session that drives the player (see src/extras/plug.js), the
// car under it, and the cars of whoever else rides.
//
// What reads at a glance, and never changes: the two bright rails are where the wheels go; the red boards along
// the ends of the sleepers are the edge — beyond them one falls; yellow and black is a gap: fast over its ramp;
// red and white arrows say which rail is missing: keep to the other; blue between the rails is a chain: hands
// off, look at the valley; a green flag on a pylon is a save.
import * as THREE from 'three';
import { Parts, MeshBuilder } from '../../../props/MeshBuilder.js';
import { LAYER } from '../../../../render/Shadows.js';
import { distanceCuller } from '../../../props/StaticBatch.js';
import { ANIM } from '../../../../player/Character.js';
import { canvasBoard } from '../Boards.js';
import { formatTime } from '../course.js';
import { gateArch, nextStart, STARTS, worldClock } from '../gates.js';
import { COASTER, course, railAt, frameAt, railNear, rampAt, startRun, stepRun, carPose, botInput } from './rules.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const CREAM = [1.3, 1.2, 0.98], WHITE = [1.55, 1.52, 1.42], RED = [0.95, 0.1, 0.12], EDGE = [1.5, 0.13, 0.08], GOLD = [1.5, 1.05, 0.2], NAVY = [0.07, 0.07, 0.2];
const YELLOW = [1.6, 1.3, 0.12], BLACK = [0.06, 0.06, 0.07], GREEN = [0.12, 0.8, 0.28], STEEL = [1.35, 1.4, 1.5], BLUE = [0.12, 0.45, 1.1], TIMBER = [0.9, 0.8, 0.66], RAIL = [0.42, 0.1, 0.08];
const CHUNK = 60, BENT = 6.5; // metres of line to a piece of the coaster; metres between two bents
const VALLEY = { x: -40, z: 10 }; // about the middle of the valley: what a lift looks at

const _f = { fwd: [0, 0, 0], side: [0, 0, 0], up: [0, 0, 0] }, _p = {};
/** A place of the deck: at the sample `p` with its frame `f`, `u` metres to the right, `h` over the rails, `a` metres on along them. */
const on = (p, f, u, h, a = 0, out = V(0, 0, 0)) => out.set(p.x + f.side[0] * u + f.up[0] * h + f.fwd[0] * a, p.y + f.side[1] * u + f.up[1] * h + f.fwd[1] * a, p.z + f.side[2] * u + f.up[2] * h + f.fwd[2] * a);

export class Coaster {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.course = course();
    this.group = new THREE.Group();
    this.group.name = 'coaster';
    this.session = null;
    this.best = 0;
    /** The clock everybody shares (ms): the starts are counted on it. */
    this.clock = worldClock;
  }

  build() {
    const world = this.world, c = this.course;
    this.mats = world.materials;
    const G = COASTER.gate;
    this.gate = { x: G.x, y: this.data.heightAt(G.x, G.z), z: G.z, yaw: G.yaw };
    this.felled = this._clearing(c);
    this._bents(c);
    this._pieces = [];
    for (const line of [c, ...c.forks]) for (let from = 0; from < line.length - 1; from += CHUNK) this._piece(line, from, Math.min(line.length, from + CHUNK));
    this._marks(c);
    this._station(c);
    this._cars();
    this.group.updateMatrixWorld(true);
    const far = world.engine.tier.phone ? 0.7 : 1;
    this._near = 170 * far; // within that distance a piece of the coaster is drawn in full
    this._cull = distanceCuller(this.group, [[/^coaster-(near|far)/, Infinity], [/^coaster-(flag|sign)/, 260 * far], [/^coaster-marks/, 420 * far], [/^coaster-station|gate-board/, 520], [/./, 900]]);
    world.scene.add(this.group);
    return this;
  }

  /**
   * The trees of the forest that stand in the way of the rails are taken out while the game is on: those whose
   * crown would reach over the rails (within five metres of the middle of the line — further for a tall one: its
   * crown is wider) and whose top comes up to the cars. (The forest has no way to be asked for
   * that: its lists are reached into — the cells its near trees are drawn from, the billboards of the far ones,
   * what its shadows are baked from; and the trunk of each lets go of who walks, the way the world lets go of a
   * thing taken away while the game runs.) Returns how many.
   */
  _clearing(c) {
    const forest = this.world.forest;
    if (!forest?.grid || !forest.info || !forest.matrices) return 0;
    const near = {}, gone = new Set(), q = {};
    for (const list of forest.grid.values()) for (let k = list.length - 1; k >= 0; k--) {
      const i = list[k], o = i * 6, x = forest.info[o], z = forest.info[o + 2], tall = 2 * forest.info[o + 3], on2 = railNear(c, x, z, null, 13, near);
      if (!on2 || on2.d > Math.max(5, 2.5 + 0.32 * tall)) continue;
      if (railAt(on2.line, on2.s, q).y - forest.info[o + 1] > tall + 1) continue; // (the rails pass over its top)
      list.splice(k, 1); forest.matrices.fill(0, i * 16, i * 16 + 16); gone.add(`${x},${z}`);
    }
    for (const sp of forest.species || []) {
      const at = sp?.impostor?.geometry?.attributes?.iPos;
      if (!at) continue;
      sp.trees.forEach((tr, j) => { if (gone.has(`${tr.x},${tr.z}`)) at.setW(j, 0); });
      at.needsUpdate = true;
    }
    for (const sp of forest.species || []) if (sp) for (const v of sp.variants || []) for (const slot of [v.wood0, v.leaf0, v.lod1]) if (slot) slot.sum = -1;
    for (const circle of this.world.collision?.circles || []) if (gone.has(`${circle[0]},${circle[1]}`)) circle[3] = 1e9;
    return gone.size;
  }

  /** The sample of a line at metre `s`, its rails lifted by the ramp of a gap; its frame in `f`. */
  _at(line, s, f = _f, out = {}) { const p = railAt(line, s, out); p.y += rampAt(line, s); frameAt(p, f); return p; }

  // -------------------------------------------------------------------------------------------- the trestle
  /** Where the bents stand: every so many metres of the main line and of each fork — not in a gap, nor where another stretch of the line passes underneath. */
  _bents(c) {
    const d = this.data;
    this.bents = [];
    for (const line of [c, ...c.forks]) {
      const n = Math.max(1, Math.round(line.length / BENT)), list = [];
      for (let i = 0; i <= n; i++) {
        const s = (line.length * i) / n;
        if (line.gaps.some((g) => s > g.from + 0.6 && s < g.to - 0.6)) continue;
        const p = this._at(line, s), f = _f, top = V(p.x - f.up[0] * 0.62, p.y - f.up[1] * 0.62, p.z - f.up[2] * 0.62), hx = -p.tz, hz = p.tx;
        // (another stretch of the line under this one: no leg comes down through it)
        let under = false;
        for (const other of [c, ...c.forks]) for (let j = 0; j < other.points.length && !under; j += 2) { const o = other.points[j]; if ((other !== line || Math.abs(o.s - s) > 30) && o.y < p.y - 3 && (o.x - p.x) ** 2 + (o.z - p.z) ** 2 < 36) under = true; }
        if (under) continue;
        const legs = [-1, 1].map((sg) => {
          const head = V(top.x + f.side[0] * sg * 1.45, top.y + f.side[1] * sg * 1.45, top.z + f.side[2] * sg * 1.45);
          let h = Math.max(0.5, head.y - d.heightAt(head.x, head.z)), fx = head.x, fz = head.z;
          for (let k = 0; k < 2; k++) { const out = Math.min(5.5, h / 8); fx = head.x + hx * sg * out; fz = head.z + hz * sg * out; h = Math.max(0.5, head.y - d.heightAt(fx, fz)); }
          return { head, foot: V(fx, head.y - h - 0.7, fz), h };
        });
        list.push({ line, s, top, legs, h: Math.max(legs[0].h, legs[1].h) });
      }
      this.bents.push(...list);
      line._bents = list;
    }
  }

  /** The timber of the bents between two metres of a line, into `b` — in full, or plainly (`far`). */
  _timber(b, line, from, to, far) {
    const list = line._bents.filter((q) => q.s >= from && q.s < to), next = (q) => line._bents[line._bents.indexOf(q) + 1];
    const at = (leg, drop) => leg.head.clone().lerp(leg.foot, clamp(drop / (leg.h + 0.7), 0, 1));
    for (const q of list) {
      const [L, R] = q.legs, tall = Math.min(L.h, R.h), levels = Math.floor((tall - 1.2) / 6), tone = q.h > 26 ? 0.94 : 1;
      b.tint(WHITE[0] * tone, WHITE[1] * tone, WHITE[2] * tone, 1);
      for (const leg of q.legs) b.beam(leg.foot, leg.head, far ? 0.32 : 0.24, far ? 0.32 : 0.24, { faces: 'xXyY' });
      b.beam(L.head, R.head, 0.24, 0.3, { faces: far ? 'xXyY' : 'xXyYzZ' });
      // girts across, a cross in each bay; ribbons along, to the next bent
      const n2 = next(q), along = n2 && n2.s - q.s < BENT * 1.6 ? Math.min(levels, Math.floor((Math.min(n2.legs[0].h, n2.legs[1].h) - 1.2) / 6)) : -1;
      for (let k = 1; k <= levels; k++) {
        const a0 = at(L, k * 6), a1 = at(R, k * 6);
        if (!far || k % 2 === 0) b.tint(...WHITE, 1).beam(a0, a1, far ? 0.22 : 0.14, 0.22, { faces: 'xXyY' });
        if (!far) { const u0 = at(L, (k - 1) * 6 + 0.3), u1 = at(R, (k - 1) * 6 + 0.3); b.tint(...CREAM, 1).beam(u0, a1, 0.1, 0.16, { faces: 'xXyY' }).beam(u1, a0, 0.1, 0.16, { faces: 'xXyY' }); }
        if (k <= along && !far) for (const sg of [0, 1]) b.tint(...CREAM, 1).beam(at(q.legs[sg], k * 6), at(n2.legs[sg], k * 6), 0.1, 0.2, { faces: 'xXyY' });
      }
      if (far && levels >= 1) b.tint(...CREAM, 1).beam(at(L, 0.3), at(R, levels * 6), 0.2, 0.2, { faces: 'xXyY' });
    }
  }

  // -------------------------------------------------------------------------------------------- the deck
  /** A plank between two samples (each [p, f]): from `u0` to `u1` across, from `h0` to `h1` over the rails; `faces`: T top, B bottom, L left, R right. */
  _plank(b, A, B, u0, u1, h0, h1, faces, tone, u0b = u0, u1b = u1) {
    const [p, f] = A, [q, g] = B, c = [...tone, 1];
    const al = on(p, f, u0, h0).clone(), ar = on(p, f, u1, h0).clone(), bl = on(q, g, u0b, h0).clone(), br = on(q, g, u1b, h0).clone();
    const cl = on(p, f, u0, h1).clone(), cr = on(p, f, u1, h1).clone(), dl = on(q, g, u0b, h1).clone(), dr = on(q, g, u1b, h1).clone();
    // (the line goes from A to B; its right is u > 0: see the frame — a face is laid counter-clockwise seen from outside)
    if (faces.includes('T')) b.quad(cl, cr, dr, dl, { color: c });
    if (faces.includes('B')) b.quad(ar, al, bl, br, { color: c });
    if (faces.includes('R')) b.quad(ar, br, dr, cr, { color: c });
    if (faces.includes('L')) b.quad(bl, al, cl, dl, { color: c });
  }

  /** A sleeper across the line at metre `s`: from `u0` to `u1`. */
  _sleeper(b, line, s, u0, u1, tone) {
    const p = this._at(line, s, _f, _p), f = _f, c = [...tone, 1], h0 = -0.36, h1 = -0.22, a = 0.14;
    const k = (u, h, d) => on(p, f, u, h, d).clone();
    const lbb = k(u0, h0, -a), rbb = k(u1, h0, -a), lbf = k(u0, h0, a), rbf = k(u1, h0, a), ltb = k(u0, h1, -a), rtb = k(u1, h1, -a), ltf = k(u0, h1, a), rtf = k(u1, h1, a);
    // (top, back, front, right end, left end — each laid counter-clockwise seen from outside)
    b.quad(ltb, rtb, rtf, ltf, { color: c }).quad(lbb, rbb, rtb, ltb, { color: c }).quad(lbf, ltf, rtf, rbf, { color: c }).quad(rbb, rbf, rtf, rtb, { color: c }).quad(lbf, lbb, ltb, ltf, { color: c });
  }

  /**
   * A piece of the coaster: the deck and the timber between two metres of a line, twice — in full for who is
   * near (rails, sleepers, the red boards of the edge, stringers, every bent with its crosses), and plainly for
   * who is far (two rails, the legs).
   */
  _piece(line, from, to) {
    const near = new Parts(), far = new Parts(), K = COASTER, R = K.rail;
    const gap = (s) => line.gaps.some((g) => s > g.from + 1e-6 && s < g.to - 1e-6), lost = (s, sg) => line.lost.some((g) => g.side === sg && s > g.from - 1e-6 && s < g.to + 1e-6);
    const lift = (s) => line.lifts.some((l) => s >= l.from - 1 && s <= l.to + 1), ramp = (s) => line.gaps.some((g) => s > g.from - g.run - 0.5 && s <= g.from + 0.01);
    const sample = (s) => { const f = { fwd: [0, 0, 0], side: [0, 0, 0], up: [0, 0, 0] }; return [this._at(line, s, f, {}), f]; };
    // ---- near: a section every metre and a half or so, cut at the lips of the gaps
    const cuts = [from, to, ...line.gaps.flatMap((g) => [g.from, g.to]), ...line.lost.flatMap((g) => [g.from, g.to])].filter((s) => s >= from && s <= to).sort((a, b) => a - b);
    const paint = near.get('paint'), wood = near.get('woodDark'), timber = near.get('woodPaint');
    for (let n = 0; n + 1 < cuts.length; n++) {
      const a = cuts[n], z = cuts[n + 1], mid = (a + z) / 2;
      if (z - a < 0.05 || gap(mid)) continue;
      const steps = Math.max(1, Math.round((z - a) / 1.5));
      let A = sample(a);
      for (let i = 1; i <= steps; i++) {
        const s1 = lerp(a, z, i / steps), B = sample(s1), m = lerp(a, z, (i - 0.5) / steps), la = A[0].lim, lb = B[0].lim;
        for (const sg of [-1, 1]) {
          if (lost(m, sg)) continue;
          // a rail: bright on top, where the wheels go — dark down its sides
          this._plank(paint, A, B, sg * R - 0.11, sg * R + 0.11, -0.02, 0, 'T', STEEL);
          this._plank(paint, A, B, sg * R - 0.11, sg * R + 0.11, -0.22, -0.02, 'LR', RAIL);
          // the red board of the edge, on the ends of the sleepers
          this._plank(paint, A, B, sg * la - (sg > 0 ? 0.04 : 0.3), sg * la + (sg > 0 ? 0.3 : 0.04), -0.22, -0.15, sg > 0 ? 'TR' : 'TL', EDGE, sg * lb - (sg > 0 ? 0.04 : 0.3), sg * lb + (sg > 0 ? 0.3 : 0.04));
          // a stringer under the rail
          if (i % 2) { const s2 = lerp(a, z, Math.min(steps, i + 1) / steps), C = i + 1 <= steps ? sample(s2) : B; this._plank(timber, A, C, sg * R - 0.13, sg * R + 0.13, -0.62, -0.36, sg > 0 ? 'RB' : 'LB', CREAM); }
        }
        if (lift(m)) this._plank(paint, A, B, -0.2, 0.2, -0.22, -0.12, 'T', Math.round(m / 1.5) % 2 ? BLUE : NAVY);
        A = B;
      }
      // the sleepers: as wide as the car may stray — half of them where a rail is missing
      const count = Math.max(1, Math.round((z - a) / 1.25));
      for (let i = 0; i < count; i++) {
        const s = lerp(a, z, (i + 0.5) / count), lim = railAt(line, s, _p).lim, w = lim + 0.3, l = lost(s, -1), r = lost(s, 1);
        const tone = ramp(s) ? (i % 2 ? YELLOW : BLACK) : TIMBER;
        this._sleeper(ramp(s) ? paint : wood, line, s, l ? -0.25 : -w, r ? 0.25 : w, tone);
      }
    }
    // (the lips of a gap: a board in yellow and black across the end of the rails, on both sides of the hole)
    for (const g of line.gaps) for (const [s, d] of [[g.from, -0.2], [g.to, 0.2]]) {
      if (s < from || s >= to) continue;
      const lim = railAt(line, s, _p).lim + 0.3;
      for (let k = 0; k < 6; k++) this._sleeper(paint, line, s + d, lerp(-lim, lim, k / 6), lerp(-lim, lim, (k + 1) / 6), k % 2 ? YELLOW : BLACK);
    }
    this._timber(timber, line, from, to, false);
    // ---- far: two rails, a board under them, the legs
    const fp = far.get('paint'), ft = far.get('woodPaint');
    for (let n = 0; n + 1 < cuts.length; n++) {
      const a = cuts[n], z = cuts[n + 1], mid = (a + z) / 2;
      if (z - a < 0.05 || gap(mid)) continue;
      const steps = Math.max(1, Math.round((z - a) / 5));
      let A = sample(a);
      for (let i = 1; i <= steps; i++) {
        const B = sample(lerp(a, z, i / steps)), m = lerp(a, z, (i - 0.5) / steps);
        for (const sg of [-1, 1]) if (!lost(m, sg)) this._plank(fp, A, B, sg * R - 0.2, sg * R + 0.2, -0.3, 0, sg > 0 ? 'TR' : 'TL', RAIL);
        this._plank(ft, A, B, -R, R, -0.62, -0.3, 'B', CREAM);
        A = B;
      }
    }
    this._timber(ft, line, from, to, true);
    const tag = `${line === this.course ? 'm' : `f${this.course.forks.indexOf(line)}`}-${Math.round(from)}`;
    const a = near.toMeshes(this.mats, { name: `coaster-near-${tag}`, layers: [LAYER.STATIC_CASTER] }), b = far.toMeshes(this.mats, { name: `coaster-far-${tag}`, layers: [LAYER.STATIC_CASTER] });
    if (!b.children.length) return;
    a.visible = false;
    const box = new THREE.Box3().setFromObject(b), ball = box.getBoundingSphere(new THREE.Sphere());
    this._pieces.push({ near: a, far: b, x: ball.center.x, y: ball.center.y, z: ball.center.z, r: ball.radius });
    this.group.add(a, b);
  }

  // -------------------------------------------------------------------------------------------- what stands along the line
  /** The pylons with a flag, the boards before a gap and before a missing rail, the arch of the finish. */
  _marks(c) {
    const parts = new Parts(), paint = parts.get('paint'), timber = parts.get('woodPaint'), cloth = parts.get('doubleSided'), glow = parts.get('glow');
    const hang = (board, at, yaw, name) => { board.mesh.position.copy(at); board.mesh.rotation.y = yaw; board.mesh.name = name; this.group.add(board.mesh); };
    const sample = (s) => { const f = { fwd: [0, 0, 0], side: [0, 0, 0], up: [0, 0, 0] }; return [this._at(c, s, f, {}), f]; };
    /** A post beside the line at metre `s`, `u` across: from under the deck to `h` over the rails. Returns its top. */
    const post = (s, u, h, tones, r = 0.09) => {
      const [p, f] = sample(s), foot = on(p, f, u, -0.7).clone(), top = V(foot.x, p.y + h, foot.z);
      for (let y = foot.y, k = 0; y < top.y; y += 0.7, k++) paint.tint(...tones[k % tones.length], 1).cylinder(foot.x, y, foot.z, r, r, Math.min(0.7, top.y - y), 7);
      timber.tint(...CREAM, 1).beam(on(p, f, Math.sign(u) * 0.9, -0.5).clone(), foot, 0.14, 0.14, { faces: 'xXyY' });
      return { top, p, f };
    };
    // ---- a flag: a tall striped pylon on the right of the line, a green pennant, a board that says SAVE
    c.flags.forEach((fl, n) => {
      if (!n) return;
      const lim = railAt(c, fl.s, _p).lim, { top, p } = post(fl.s, lim + 1.3, 5.2, [GREEN, WHITE], 0.11);
      paint.tint(...GOLD, 1).place(top.x, top.y, top.z).lathe([[0.001, 0.3], [0.12, 0.25], [0.17, 0.13], [0.12, 0.02], [0.001, 0]], 8).pop();
      cloth.tint(...GREEN, 1).tri(V(top.x, top.y - 0.1, top.z), V(top.x, top.y - 1.3, top.z), V(top.x + p.tx * 1.9, top.y - 0.7, top.z + p.tz * 1.9));
      const board = canvasBoard(256, 96, (ctx, w, h) => { ctx.fillStyle = '#0e3b22'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 5; ctx.strokeRect(5, 5, w - 10, h - 10); ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 46px system-ui, sans-serif'; ctx.fillText(`SAVE ${n}`, w / 2, h / 2 + 2, w * 0.88); }, 1.5, 0.56, { both: true });
      hang(board, V(top.x, top.y - 2.1, top.z), p.yaw, 'coaster-flag-sign');
    });
    // ---- before a gap: chevrons in yellow and black on both sides, twice — and the word
    const warn = (text, back, ink, arrow) => canvasBoard(256, 256, (ctx, w, h) => {
      ctx.fillStyle = back; ctx.fillRect(0, 0, w, h); ctx.fillStyle = ink;
      if (arrow) { ctx.save(); ctx.translate(w / 2, 100); ctx.scale(arrow, 1); ctx.beginPath(); ctx.moveTo(-92, -26); ctx.lineTo(20, -26); ctx.lineTo(20, -70); ctx.lineTo(100, 0); ctx.lineTo(20, 70); ctx.lineTo(20, 26); ctx.lineTo(-92, 26); ctx.fill(); ctx.restore(); }
      else for (let k = 0; k < 3; k++) { ctx.beginPath(); const y = 150 - k * 52; ctx.moveTo(26, y + 44); ctx.lineTo(w / 2, y); ctx.lineTo(w - 26, y + 44); ctx.lineTo(w - 26, y + 70); ctx.lineTo(w / 2, y + 26); ctx.lineTo(26, y + 70); ctx.fill(); }
      ctx.fillStyle = ink; ctx.fillRect(0, h - 58, w, 58); ctx.fillStyle = back; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 40px system-ui, sans-serif'; ctx.fillText(text, w / 2, h - 27, w - 16);
    }, 1.5, 1.5, { both: true });
    for (const g of c.gaps) for (const back of [34, 12]) for (const sg of [-1, 1]) {
      const s = Math.max(1, g.from - back), lim = railAt(c, s, _p).lim, { top, p } = post(s, sg * (lim + 1.2), 2.6, [YELLOW, BLACK]);
      hang(warn(g.need > 15 ? 'JUMP — FAST!' : 'JUMP', '#f5c518', '#16161c', 0), V(top.x, top.y - 0.4, top.z), p.yaw, 'coaster-sign-gap');
    }
    // ---- before a missing rail: an arrow in red and white, on the side one keeps to
    for (const g of c.lost) for (const back of [30, 6]) {
      const s = Math.max(1, g.from - back), lim = railAt(c, s, _p).lim, { top, p } = post(s, -g.side * (lim + 1.2), 2.6, [RED, WHITE]);
      hang(warn(g.side < 0 ? 'KEEP RIGHT' : 'KEEP LEFT', '#f4f1e8', '#c8141c', g.side < 0 ? 1 : -1), V(top.x, top.y - 0.4, top.z), p.yaw + Math.PI, 'coaster-sign-lost');
      // (the end of the rail that is left out: a stop in red and white)
      const [q, f] = sample(g.from - 0.1);
      for (let k = 0; k < 3; k++) paint.tint(...(k % 2 ? WHITE : RED), 1).beam(on(q, f, g.side * COASTER.rail, k * 0.22).clone(), on(q, f, g.side * COASTER.rail, k * 0.22 + 0.22).clone(), 0.3, 0.3, { faces: 'xXyY' });
    }
    // ---- before a fork: a board in black and white on its side — the short way, the hard one
    for (const f of c.forks) for (const back of [34, 9]) {
      const s = Math.max(1, f.from - back), lim = railAt(c, s, _p).lim, { top, p } = post(s, f.side * (lim + 1.5), 3.1, [BLACK, WHITE]);
      const board = canvasBoard(512, 300, (ctx, w, h) => {
        ctx.fillStyle = '#16161c'; ctx.fillRect(0, 0, w, h);
        for (let k = 0; k < 16; k++) { ctx.fillStyle = k % 2 ? '#16161c' : '#f4f1e8'; ctx.fillRect(k * 32, 0, 32, 26); ctx.fillStyle = k % 2 ? '#f4f1e8' : '#16161c'; ctx.fillRect(k * 32, h - 26, 32, 26); }
        ctx.fillStyle = '#f5c518'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 62px system-ui, sans-serif'; ctx.fillText(f.side < 0 ? '◀ SHORT WAY' : 'SHORT WAY ▶', w / 2, 100, w - 30);
        ctx.fillStyle = '#f4f1e8'; ctx.font = '700 44px system-ui, sans-serif'; ctx.fillText(`${f.name.toUpperCase()} · HARD`, w / 2, 172, w - 30);
        ctx.font = '600 34px system-ui, sans-serif'; ctx.fillText(f.side < 0 ? 'lean left to take it' : 'lean right to take it', w / 2, 232, w - 30);
      }, 2.9, 1.7, { both: true });
      hang(board, V(top.x, top.y - 0.3, top.z), p.yaw + Math.PI, 'coaster-sign-fork');
    }
    // ---- the finish: an arch over the line, a banner
    {
      const lim = railAt(c, c.finish, _p).lim, a = post(c.finish, -(lim + 1.3), 7.6, [NAVY, WHITE], 0.13), b = post(c.finish, lim + 1.3, 7.6, [NAVY, WHITE], 0.13);
      for (const t of [a.top, b.top]) paint.tint(...GOLD, 1).place(t.x, t.y, t.z).lathe([[0.001, 0.3], [0.12, 0.25], [0.17, 0.13], [0.12, 0.02], [0.001, 0]], 8).pop();
      const banner = canvasBoard(1024, 220, (ctx, w, h) => { ctx.fillStyle = '#1b1340'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 10; ctx.strokeRect(10, 10, w - 20, h - 20); ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = "700 130px Georgia, 'Times New Roman', serif"; ctx.fillText('FINISH', w / 2, h / 2 + 6); }, 2 * lim + 2.2, (2 * lim + 2.2) * 0.215, { both: true });
      hang(banner, a.top.clone().lerp(b.top, 0.5).add(V(0, -0.5, 0)), a.p.yaw, 'coaster-sign-finish');
    }
    // ---- over the foot of each lift: a blue board
    for (const l of c.lifts) {
      const lim = railAt(c, l.from, _p).lim, a = post(l.from + 3, -(lim + 1.3), 7.4, [BLUE, WHITE], 0.11), b = post(l.from + 3, lim + 1.3, 7.4, [BLUE, WHITE], 0.11);
      const banner = canvasBoard(512, 128, (ctx, w, h) => { ctx.fillStyle = '#0e2a66'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 7; ctx.strokeRect(7, 7, w - 14, h - 14); ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 60px system-ui, sans-serif'; ctx.fillText('LIFT · HANDS OFF', w / 2, h / 2 + 3, w - 40); }, 2 * lim + 2.2, (2 * lim + 2.2) * 0.25, { both: true });
      hang(banner, a.top.clone().lerp(b.top, 0.5).add(V(0, -0.45, 0)), a.p.yaw, 'coaster-sign-lift');
      for (let k = 0; k <= 6; k++) { const q = a.top.clone().lerp(b.top, k / 6); glow.tint(1.6, 1.3, 0.6, 1).place(q.x, q.y + 0.12, q.z).lathe([[0.001, -0.08], [0.07, -0.03], [0.07, 0.03], [0.001, 0.08]], 5).pop(); }
    }
    this.group.add(parts.toMeshes(this.mats, { name: 'coaster-marks', layers: [] }));
  }

  /** The station at the back of the north beach — a platform, a roof on striped posts, bulbs and bunting — its gate, and the buffers of the terminus. */
  _station(c) {
    const parts = new Parts(), paint = parts.get('paint'), deck = parts.get('woodDeck'), timber = parts.get('woodPaint'), cloth = parts.get('doubleSided'), glow = parts.get('glow'), d = this.data, G = this.gate;
    gateArch(this.group, paint, G.x, G.y, G.z, G.yaw, COASTER.name.toUpperCase(), 'A CAR LEAVES EVERY TEN SECONDS · THE RAILS DO NOT HOLD IT: YOU DO', { tone: RED, width: 3.8 });
    // the platform: planks on both sides of the rails over the first metres of the line, steps down to the sand
    const a = this._at(c, 0.5, { fwd: [0, 0, 0], side: [0, 0, 0], up: [0, 0, 0] }, {}), y = a.y - 0.24, x0 = a.x - 4.2, x1 = a.x + 4.2, z1 = a.z + 1.2, z0 = a.z - 16;
    for (const [xa, xb] of [[x0, a.x - 1.75], [a.x + 1.75, x1]]) deck.tint(1, 0.93, 0.8, 1).box(xa, y - 0.16, z0, xb, y, z1);
    for (let k = 1; k <= 4; k++) deck.tint(0.95, 0.88, 0.76, 1).box(x0, y - 0.16 - k * 0.42, z1 + (k - 1) * 0.5, x1, y - k * 0.42, z1 + k * 0.5);
    timber.tint(...CREAM, 1).box(x0, d.heightAt(a.x, a.z) - 0.6, z0, x0 + 0.2, y - 0.16, z1).box(x1 - 0.2, d.heightAt(a.x, a.z) - 0.6, z0, x1, y - 0.16, z1);
    // the roof: six striped posts, a ridge, two slopes in red and cream bands
    const top = y + 4.5;
    for (const px of [x0 + 0.3, x1 - 0.3]) for (const pz of [z0 + 0.4, (z0 + z1) / 2 - 1.5, z1 - 3.6]) {
      for (let h = y, k = 0; h < top; h += 0.6, k++) paint.tint(...(k % 2 ? CREAM : RED), 1).cylinder(px, h, pz, 0.1, 0.1, Math.min(0.6, top - h), 8);
      paint.tint(...GOLD, 1).place(px, top, pz).lathe([[0.001, 0.26], [0.1, 0.22], [0.14, 0.12], [0.1, 0.02], [0.001, 0]], 8).pop();
    }
    for (let k = 0; k < 8; k++) {
      const za = lerp(z0 - 0.4, z1 - 3.4, k / 8), zb = lerp(z0 - 0.4, z1 - 3.4, (k + 1) / 8), tone = k % 2 ? CREAM : RED;
      cloth.tint(...tone, 1).quad(V(x0 - 0.5, top - 0.1, zb), V(x0 - 0.5, top - 0.1, za), V(a.x, top + 1.5, za), V(a.x, top + 1.5, zb)).quad(V(a.x, top + 1.5, zb), V(a.x, top + 1.5, za), V(x1 + 0.5, top - 0.1, za), V(x1 + 0.5, top - 0.1, zb));
    }
    timber.tint(...WHITE, 1).beam(V(a.x, top + 1.5, z0 - 0.5), V(a.x, top + 1.5, z1 - 3.3), 0.16, 0.2);
    // bulbs along the eaves, bunting from the gate to the roof
    for (const px of [x0 - 0.5, x1 + 0.5]) for (let k = 0; k <= 12; k++) glow.tint(1.6, 1.3, 0.6, 1).place(px, top - 0.2, lerp(z0 - 0.3, z1 - 3.5, k / 12)).lathe([[0.001, -0.09], [0.08, -0.03], [0.08, 0.03], [0.001, 0.09]], 5).pop();
    for (const sg of [-1, 1]) for (let k = 0; k < 9; k++) {
      const from = V(G.x + sg * 1.9, G.y + 3.2, G.z), to = V(a.x + sg * 4.4, top - 0.1, z1 - 3.4), sag = (t) => from.clone().lerp(to, t).add(V(0, -0.5 * Math.sin(Math.PI * t), 0)), q0 = sag(k / 9), q1 = sag((k + 1) / 9);
      paint.tint(0.3, 0.26, 0.22, 1).rod(q0, q1, 0.015, 4, { caps: false });
      cloth.tint(...[RED, CREAM, YELLOW, GREEN, BLUE][k % 5], 1).tri(q0, q1, q0.clone().lerp(q1, 0.5).add(V(0, -0.42, 0)));
    }
    // the buffers at the end of the line, and a platform beside the last metres
    {
      const f = { fwd: [0, 0, 0], side: [0, 0, 0], up: [0, 0, 0] }, e = this._at(c, c.length - 0.6, f, {});
      for (const sg of [-1, 1]) paint.tint(...RED, 1).beam(on(e, f, sg * COASTER.rail, -0.2).clone(), on(e, f, sg * COASTER.rail, 0.9).clone(), 0.3, 0.3);
      paint.tint(...WHITE, 1).beam(on(e, f, -1.2, 0.75).clone(), on(e, f, 1.2, 0.75).clone(), 0.3, 0.3);
      for (let s = c.length - 20; s < c.length - 1; s += 2) { const g = { fwd: [0, 0, 0], side: [0, 0, 0], up: [0, 0, 0] }, q = this._at(c, s, g, {}), r = this._at(c, s + 2, _f, {}); deck.tint(1, 0.93, 0.8, 1).quad(on(q, g, -3.6, -0.24).clone(), on(q, g, -1.5, -0.24).clone(), on(r, _f, -1.5, -0.24).clone(), on(r, _f, -3.6, -0.24).clone()); }
    }
    this.group.add(parts.toMeshes(this.mats, { name: 'coaster-station', layers: [LAYER.STATIC_CASTER] }));
  }

  // -------------------------------------------------------------------------------------------- the cars
  /** The shape of a car: a painted tub on four wide rollers, a bench, a bar, a lamp. Its nose looks along +z; its floor is on the rails at y = 0. */
  _carShape(tone, trim) {
    const parts = new Parts(), b = parts.get('paint'), dark = parts.get('matte'), glow = parts.get('glow');
    // the rollers: as wide as the rails are far from the tub — they are what slides across
    for (const z of [-0.85, 0.85]) for (const sx of [-1, 1]) { dark.tint(0.12, 0.12, 0.14, 1).rod(V(sx * 0.5, 0.2, z), V(sx * 1.0, 0.2, z), 0.2, 10); b.tint(...trim, 1).rod(V(sx * 1.0, 0.2, z), V(sx * 1.04, 0.2, z), 0.11, 8); }
    dark.tint(0.16, 0.14, 0.14, 1).box(-0.5, 0.16, -1.2, 0.5, 0.32, 1.2);
    // the tub
    for (const sx of [-1, 1]) { b.tint(...tone, 1).box(sx > 0 ? 0.56 : -0.68, 0.3, -1.25, sx > 0 ? 0.68 : -0.56, 0.82, 0.95); b.tint(...trim, 1).box(sx > 0 ? 0.54 : -0.7, 0.82, -1.27, sx > 0 ? 0.7 : -0.54, 0.88, 0.97); }
    b.tint(...tone, 1).box(-0.68, 0.3, -1.3, 0.68, 1.12, -1.2);
    b.tint(...trim, 1).box(-0.7, 1.12, -1.32, 0.7, 1.18, -1.18);
    // the nose: it narrows and comes down, a lamp at its tip
    for (let k = 0; k < 4; k++) { const z0 = 0.95 + k * 0.14, w = 0.68 - k * 0.12, h = 0.78 - k * 0.1; b.tint(...(k % 2 ? trim : tone), 1).box(-w, 0.3, z0, w, h, z0 + 0.14); }
    glow.tint(1.7, 1.5, 0.9, 1).place(0, 0.5, 1.53).lathe([[0.001, -0.12], [0.1, -0.06], [0.1, 0.06], [0.001, 0.12]], 6).pop();
    // the bench and the bar
    b.tint(...CREAM, 1).box(-0.54, 0.32, -1.15, 0.54, 0.5, -0.45).box(-0.54, 0.5, -1.2, 0.54, 1.02, -1.05);
    b.tint(...GOLD, 1).rod(V(-0.6, 0.86, 0.1), V(0.6, 0.86, 0.1), 0.035, 6);
    b.tint(0.12, 0.12, 0.14, 1).box(-0.54, 0.3, -0.45, 0.54, 0.34, 0.95);
    return [...parts.map].filter(([, q]) => !q.empty).map(([key, q]) => ({ key, geo: q.build() }));
  }

  _carMesh(name, shape) {
    const g = new THREE.Group();
    g.name = name; g.matrixAutoUpdate = false; g.visible = false;
    for (const { key, geo } of shape) { const m = new THREE.Mesh(geo, this.mats[key]); m.name = `${name}:${key}`; m.frustumCulled = false; g.add(m); }
    return g;
  }

  /** One's own car, a few more for the others who ride, the one that waits in the station — and what shows where the wheels are: sparks, and a board of the edge that glows. */
  _cars() {
    const red = this._carShape(RED, GOLD), blue = this._carShape([0.1, 0.32, 0.85], WHITE);
    this.mine = this._carMesh('coaster-mine', red);
    this.others = Array.from({ length: 8 }, (_, i) => this._carMesh(`coaster-other-${i}`, blue));
    this.show = this._carMesh('coaster-show', red);
    const p = carPose(startRun(this.course));
    this._place(this.show, p.x, p.y, p.z, p.yaw, p.pitch, p.roll);
    // the sparks: a handful of small bright shards, thrown from the outer wheel
    const N = 28, geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 9), nrm = new Float32Array(N * 9), col = new Float32Array(N * 12), uv = new Float32Array(N * 6);
    for (let i = 0; i < N * 3; i++) { nrm[i * 3 + 1] = 1; col.set(i % 3 ? [2.6, 1.5, 0.3, 1] : [3, 2.6, 1.6, 1], i * 4); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    this.sparks = new THREE.Mesh(geo, this.mats.glow);
    this.sparks.name = 'coaster-sparks'; this.sparks.frustumCulled = false; this.sparks.visible = false; this.sparks.matrixAutoUpdate = false;
    this._shards = Array.from({ length: N }, () => ({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0 }));
    // the board that glows: three metres of the edge, red hot, beside the car that strays
    const hot = new MeshBuilder();
    hot.tint(3, 0.5, 0.12, 1).box(-0.24, -0.02, -3, 0.24, 0.05, 3);
    hot.tint(3.2, 2.2, 0.7, 1).box(-0.09, 0.05, -2.2, 0.09, 0.09, 2.2);
    this.hot = new THREE.Mesh(hot.build(), this.mats.glow);
    this.hot.name = 'coaster-hot'; this.hot.frustumCulled = false; this.hot.visible = false; this.hot.matrixAutoUpdate = false;
    // (added to the scene itself: what culls the group by distance leaves them alone)
    this.world.scene.add(this.mine, this.show, this.sparks, this.hot, ...this.others);
  }

  /** Puts a car where it is: its floor on the rails at (x, y, z), heading `yaw`, nose up by `pitch`, leaning to the left by `roll`. */
  _place(mesh, x, y, z, yaw, pitch = 0, roll = 0) {
    const e = this._e || (this._e = new THREE.Euler(0, 0, 0, 'YXZ')), q = this._q || (this._q = new THREE.Quaternion()), p = this._v || (this._v = V(0, 0, 0)), one = this._one || (this._one = V(1, 1, 1));
    mesh.matrix.compose(p.set(x, y, z), q.setFromEuler(e.set(-pitch, yaw, -roll)), one);
    mesh.matrixWorld.copy(mesh.matrix);
    for (const c of mesh.children) c.matrixWorld.copy(mesh.matrix);
    mesh.visible = true;
  }

  setBest(ms) { this.best = ms || 0; }
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.4 * 2.4; }
  /** The start one who asks now would leave with (see gates.js). */
  nextStart() { return nextStart(this.clock(), COASTER.every, STARTS); }

  // -------------------------------------------------------------------------------------------- a run
  /** The gauge of the run: where the car is across the rails, and whether the burst is back. A small thing of the game's own, on the screen. */
  _gauge() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom, 0px));transform:translateX(-50%);width:min(40vw,320px);height:20px;pointer-events:none;z-index:6;font:700 11px system-ui,sans-serif;color:#f6e7b8;text-shadow:0 1px 2px #000';
    el.innerHTML = '<div style="position:absolute;inset:0;border-radius:11px;border:2px solid #f6e7b8;overflow:hidden;background:linear-gradient(90deg,#e0261c 0,#e0261c 15%,rgba(20,16,30,.62) 15%,rgba(20,16,30,.62) 85%,#e0261c 85%)"><i style="position:absolute;left:25%;top:0;bottom:0;width:3px;background:#dfe6f2;opacity:.85"></i><i style="position:absolute;left:75%;top:0;bottom:0;width:3px;margin-left:-3px;background:#dfe6f2;opacity:.85"></i></div><b style="position:absolute;top:-4px;width:14px;height:24px;margin-left:-7px;border-radius:5px;background:#ffd23c;border:2px solid #1b1340;box-sizing:border-box;left:50%"></b><span style="position:absolute;left:0;right:0;top:-18px;text-align:center;white-space:nowrap"></span>';
    (document.getElementById('ui') || document.body).appendChild(el);
    const dot = el.querySelector('b'), text = el.querySelector('span'), bar = el.firstChild;
    let last = '';
    return {
      set: (u, room, lim, cool, lifted, edge = 0) => {
        // (the bar is the width of the sleepers; the red ends are where the sparks fly; where a rail is missing, its half is red)
        dot.style.left = `${clamp(50 + (u / lim) * 50, 0, 100).toFixed(1)}%`;
        const hot = edge > 0.3; if (hot !== dot._hot) { dot._hot = hot; dot.style.background = hot ? '#ff3b1f' : '#ffd23c'; dot.style.boxShadow = hot ? '0 0 12px 4px rgba(255,90,30,.9)' : 'none'; }
        const half = room[1] - room[0] < lim * 1.5 ? (room[0] > -lim + 0.01 ? 'L' : 'R') : '', key = `${half}${cool > 0 ? Math.ceil(cool) : 0}${lifted ? 'l' : ''}`;
        if (key === last) return;
        last = key;
        bar.style.background = half === 'L' ? 'linear-gradient(90deg,#e0261c 0,#e0261c 54%,rgba(20,16,30,.62) 54%,rgba(20,16,30,.62) 85%,#e0261c 85%)' : half === 'R' ? 'linear-gradient(90deg,#e0261c 0,#e0261c 15%,rgba(20,16,30,.62) 15%,rgba(20,16,30,.62) 46%,#e0261c 46%)' : 'linear-gradient(90deg,#e0261c 0,#e0261c 15%,rgba(20,16,30,.62) 15%,rgba(20,16,30,.62) 85%,#e0261c 85%)';
        text.textContent = lifted ? 'the chain has you — look at the valley' : cool > 0 ? `burst in ${Math.ceil(cool)}…` : '⚡ BURST READY';
        text.style.opacity = cool > 0 ? '0.7' : '1';
      },
      remove: () => el.remove(),
    };
  }

  /**
   * A run is asked for: the player is sat in the car that waits in the station, and leaves with the next start.
   * `io`: { play, note, mates }. Returns the session — the driver of the player (see src/extras/plug.js): step,
   * camera, line, start, over (`score`, ms), ended, drop, close, auto (true: a steady hand drives it by itself),
   * instance (0: the line is one place for everybody), tell() (how far along it one is, how far across, whether
   * falling, how fast).
   */
  open(player, io) {
    const c = this.course, K = COASTER, start = this.nextStart(), st = startRun(c, { wait: Math.max(0.05, start.wait) });
    const events = [], input = { x: 0, y: 0, boost: false }, pose = {}, S = { cam: null, look: V(0, 0, 0), fov: 62, shake: 0, after: 0, acc: 0, view: 0, stretch: -1, gone: false, time: 0, x: 0, spark: 0, room: [0, 0] };
    const t = V(0, 0, 0), t2 = V(0, 0, 0), q1 = {}, q2 = {}, q3 = {}, fr = { fwd: [0, 0, 0], side: [0, 0, 0], up: [0, 0, 0] }, gauge = this._gauge();
    this.show.visible = false;
    const session = {
      coaster: this, over: false, ended: false, score: 0, time: 0, line: '', riding: false, anim: ANIM.sit, state: st, auto: false, start, instance: 0,
      tell: () => [Math.round(st.s), Math.round(st.u * 100) / 100, st.fall > 0 ? 1 : 0, Math.round(st.v)],
      step: (dt, pl, control) => {
        const inp = pl.input, wait = (start.at - this.clock()) / 1000;
        S.time += dt;
        // (the start goes by the clock everybody shares: the rules count the last moment down)
        if (!S.gone) { if (wait > 0.05) st.wait = wait; }
        if (session.auto) {
          S.acc += Math.min(dt, 0.25);
          while (S.acc >= K.step) { S.acc -= K.step; botInput(st, 'steady', input); stepRun(st, K.step, input, events); }
        } else {
          // (a key is all or nothing: the stick it stands for comes over in a tenth of a second)
          S.x += clamp((control ? clamp(inp.move.x, -1, 1) : 0) - S.x, -dt * 9, dt * 9);
          input.x = S.x; input.y = control ? clamp(inp.move.y, -1, 1) : 0; input.boost = control && !!inp.jump;
          stepRun(st, dt, input, events);
        }
        for (const e of events) this._tell(e, st, io, S);
        events.length = 0;
        // ---- where the car is, and how it stands
        carPose(st, pose);
        if (st.fall <= 0) { S.pitch = S.pitch === undefined ? pose.pitch : S.pitch + (pose.pitch - S.pitch) * Math.min(1, dt * 14); S.roll = S.roll === undefined ? pose.roll : S.roll + (pose.roll - S.roll) * Math.min(1, dt * 14); pose.pitch = S.pitch; pose.roll = S.roll; } else { S.pitch = undefined; S.roll = undefined; }
        const falling = st.fall > 0, shake = st.fall <= 0 && st.wait <= 0 ? 0.012 * clamp(st.v / 25, 0, 1.3) * Math.sin(S.time * 41) : 0;
        this._place(this.mine, pose.x, pose.y + shake, pose.z, pose.yaw, pose.pitch, pose.roll + (falling ? 0 : clamp(-st.vu * 0.05, -0.12, 0.12)));
        // ---- the rider, on the bench
        const sy = Math.sin(pose.yaw), cy = Math.cos(pose.yaw), cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch);
        pl.pos.set(pose.x - sy * cp * 0.62 - sy * sp * 0.36, pose.y + 0.36 * cp - 0.62 * sp + shake, pose.z - cy * cp * 0.62 - cy * sp * 0.36);
        pl.yaw = pose.yaw; pl.pitch = -pose.pitch * 0.9; pl.roll = falling ? 0 : -pose.roll; pl.speed = st.v; pl.grounded = true;
        session.anim = ANIM.sit;
        // ---- where the wheels are: sparks from the outer one near the edge, the board of the edge red hot beside it
        const room = this._room(st, S.room), side = Math.sign(st.u - (room[0] + room[1]) / 2) || 1, left = side > 0 ? room[1] - st.u : st.u - room[0]; // (how far the car is from the end of the sleepers on the side it strays to)
        const edge = falling || st.lifted || st.wait > 0 || st.over ? 0 : clamp(1 - left / (pose.lim * 0.55), 0, 1);
        this._hot(st, edge, side, side > 0 ? room[1] : room[0]);
        if (edge > 0.3 && st.v > 4) { S.spark += dt * (30 + 110 * edge); while (S.spark > 1) { S.spark -= 1; this._spark(pose, side, st.v); } if (edge > 0.75) S.shake = Math.max(S.shake, 0.12); }
        this._sparkle(dt);
        if (S.gone) gauge.set(falling ? 0 : st.u, room, pose.lim, st.cool, st.lifted, edge);
        // ---- the line of the run
        const here = c.stretches.findIndex((z) => st.s >= z.from && st.s < z.to);
        if (here !== S.stretch && here >= 0 && S.gone) { S.stretch = here; if (here > 0 && !st.over) io.note(c.stretches[here].name, 2000); }
        if (st.over && !session.over) { session.over = true; session.time = st.time; session.score = st.time; }
        if (st.over) { S.after += dt; if (S.after > 4.2) session.ended = true; }
        const falls = st.falls ? ` · ${st.falls} fall${st.falls > 1 ? 's' : ''}` : '';
        session.line = !S.gone ? `${K.name} · ${start.name} start in ${Math.max(1, Math.ceil(st.wait))}…`
          : st.over ? `${K.name} · ${formatTime(st.time)}${falls}`
            : `${formatTime(Math.round(st.clock * 1000))} · ${c.stretches[Math.max(0, here)].name} · ${Math.round(st.v * 3.6)} km/h · ${Math.max(0, Math.round(c.finish - st.s))} m to go${falls}`;
      },
      /**
       * The camera: behind the car and above the rails, looking down the line at what comes — it keeps over the
       * track, so nothing of the trestle comes between. On a lift it goes round in front and looks back over the
       * car at the valley; it is behind again before the top. While one falls it stays where it was, and watches.
       */
      camera: (cam, dt) => {
        const line = st.line, q = st.q, falling = st.fall > 0;
        if (!falling) {
          // (the rails so far behind, so far ahead — off a fork onto the line it left, or the line it comes back to)
          const rails = (d, out) => (line !== c && q + d < 0 ? railAt(c, Math.max(0.2, line.from + q + d), out) : line !== c && q + d > line.length ? railAt(c, line.to + q + d - line.length, out) : railAt(line, clamp(q + d, 0.2, line.length - 0.5), out));
          const flat = 1 / Math.sqrt(1 + pose.rise * pose.rise), back = (8.2 + st.v * 0.07) * (0.35 + 0.65 * flat), pb = rails(-back, q1), pa = rails((4.5 + st.v * 0.1) * flat, q2);
          // (on a lift: from in front, a little to the mountain side, looking back over the car at the valley)
          const lift = line.lifts.find((l) => q >= l.from && q < l.to), view = lift && (lift.to - q) / K.chain > 2.4 && q - lift.from > 5 ? 1 : 0;
          S.view += (view - S.view) * Math.min(1, dt * (view ? 1.3 : 2.2));
          const v = smooth(0, 1, S.view);
          // (well above the rails behind — as high over them as the slope asks — and looking at the rails just ahead of the car:
          // the car sits a little under the middle of the screen, the line runs on from it to the top, bend after bend)
          // (…and never lower than a little over the car: up a slope the rails ahead are seen over it)
          t.set(pb.x, Math.max(pb.y + (4.9 + st.v * 0.03) * Math.sqrt(1 + pb.rise * pb.rise), pose.y + 2.7), pb.z);
          t2.set(pa.x, pa.y + 0.3, pa.z);
          if (v > 0.001) {
            // (it keeps over the sleepers: beside them the trees stand)
            const pf = rails(6.5 * flat, q3), away = (Math.sign(-pf.tz * (pf.x - VALLEY.x) + pf.tx * (pf.z - VALLEY.z)) || 1) * 1.5;
            const vx = VALLEY.x - pose.x, vz = VALLEY.z - pose.z, vl = Math.hypot(vx, vz) || 1;
            t.lerp(V(pf.x - pf.tz * away, Math.max(pf.y, pose.y) + 3, pf.z + pf.tx * away), v);
            t2.lerp(V(pose.x + (vx / vl) * 4, pose.y + 0.6, pose.z + (vz / vl) * 4), v);
          }
          if (!S.cam) { S.cam = t.clone(); S.look.copy(t2); } else { S.cam.lerp(t, Math.min(1, dt * 7)); S.look.lerp(t2, Math.min(1, dt * 9)); }
        } else S.look.lerp(t2.set(pose.x, pose.y, pose.z), Math.min(1, dt * 6));
        cam.position.copy(S.cam);
        if (S.shake > 0) { S.shake = Math.max(0, S.shake - dt * 2.4); cam.position.x += (Math.random() - 0.5) * S.shake * 0.4; cam.position.y += (Math.random() - 0.5) * S.shake * 0.4; }
        cam.up.set(0, 1, 0); cam.lookAt(S.look);
        S.fov += (60 + 16 * clamp((st.v - 8) / 26, 0, 1) + (st.boost > 0 ? 6 : 0) - S.fov) * Math.min(1, dt * 3);
        return S.fov;
      },
      /** The run is over, or left: the player is let go at the gate. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x, this.gate.z, this.gate.yaw); session.close(); },
      close: () => { if (this.session === session) this.session = null; player.pitch = 0; player.roll = 0; this.mine.visible = false; this.sparks.visible = false; this.hot.visible = false; this.show.visible = true; gauge.remove(); },
    };
    this.session = session;
    void fr;
    session.step(0, player, false);
    return session;
  }

  /** How far across a car may be where a run is (see roomAt of the rules): [left, right]. */
  _room(st, out) {
    const lim = railAt(st.line, st.q, _p).lim;
    out[0] = -lim; out[1] = lim;
    for (const g of st.line.lost) if (st.q >= g.from - 12 && st.q <= g.to) { if (g.side < 0) out[0] = COASTER.lost.keep; else out[1] = -COASTER.lost.keep; }
    return out;
  }

  /** The board of the edge, red hot beside a car that strays: the nearer the edge, the brighter. */
  _hot(st, edge, side, end) {
    if (edge <= 0.02) { this.hot.visible = false; return; }
    const p = this._at(st.line, st.q, _f, _p), f = _f, m = this.hot.matrix, k = (0.5 + 1.1 * edge) * (edge > 0.75 ? 1 + 0.25 * Math.sin(performance.now() * 0.03) : 1), u = end + side * 0.13;
    m.set(-f.side[0] * k, f.up[0] * k, f.fwd[0], p.x + f.side[0] * u + f.up[0] * -0.13,
      -f.side[1] * k, f.up[1] * k, f.fwd[1], p.y + f.side[1] * u + f.up[1] * -0.13,
      -f.side[2] * k, f.up[2] * k, f.fwd[2], p.z + f.side[2] * u + f.up[2] * -0.13, 0, 0, 0, 1);
    this.hot.matrixWorld.copy(m); this.hot.visible = true;
  }

  /** A spark leaves the outer wheel. */
  _spark(pose, side, v) {
    const s = this._shards.find((q) => q.life <= 0);
    if (!s) return;
    const sy = Math.sin(pose.yaw), cy = Math.cos(pose.yaw), rx = -cy * side, rz = sy * side;
    s.x = pose.x + rx * 0.8 + sy * (Math.random() - 0.5) * 1.6; s.y = pose.y + 0.05; s.z = pose.z + rz * 0.8 + cy * (Math.random() - 0.5) * 1.6;
    s.vx = rx * (1.5 + 2.5 * Math.random()) + sy * v * 0.35; s.vy = 2.5 + 4 * Math.random(); s.vz = rz * (1.5 + 2.5 * Math.random()) + cy * v * 0.35; s.life = 0.35 + 0.3 * Math.random();
    this.sparks.visible = true;
  }

  _sparkle(dt) {
    if (!this.sparks.visible) return;
    const pos = this.sparks.geometry.attributes.position;
    let any = false;
    this._shards.forEach((s, i) => {
      if (s.life > 0) { s.life -= dt; s.vy -= 9.81 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; any = true; }
      const y = s.life > 0 ? s.y : -999, k = 0.2;
      pos.setXYZ(i * 3, s.x, y + k, s.z); pos.setXYZ(i * 3 + 1, s.x - s.vx * 0.03 - k, y - s.vy * 0.03, s.z - s.vz * 0.03); pos.setXYZ(i * 3 + 2, s.x - s.vx * 0.03 + k, y - s.vy * 0.03, s.z - s.vz * 0.03 + k);
    });
    pos.needsUpdate = true;
    if (!any) this.sparks.visible = false;
  }

  /** What happened in a step of the run, told to who plays. */
  _tell(e, st, io, S) {
    const c = this.course;
    if (e.type === 'tick') io.play('tick');
    else if (e.type === 'go') { S.gone = true; io.play('start'); io.note('The chain takes you up. At the top the rails stop holding: lean against every bend.', 4200); }
    else if (e.type === 'lift') { io.play('click'); if (st.s > 100) io.note('A lift: hands off — look at the valley.', 2400); }
    else if (e.type === 'top') io.play('jet', { volume: 0.3 });
    else if (e.type === 'boost') { io.play('boost', { volume: 0.7 }); S.shake = Math.max(S.shake, 0.25); }
    else if (e.type === 'edge') io.play('drift', { volume: 0.5 });
    else if (e.type === 'air') { io.play('jump', { volume: 0.7 }); }
    else if (e.type === 'land') { io.play('land', { volume: clamp(0.4 + e.hard * 0.06, 0.4, 1) }); S.shake = Math.max(S.shake, clamp(0.3 + e.hard * 0.05, 0.3, 0.9)); io.note('Over!', 1100); }
    else if (e.type === 'fork') io.play('click');
    else if (e.type === 'fall') { io.play('fail', { volume: 0.8 }); io.play('wasted', { volume: 0.4 }); S.shake = 1; io.note(e.why === 'gap' ? 'Short! A gap wants speed: let it run, and burst before the ramp.' : e.why === 'rail' ? 'No rail there! Keep to the side of the one that is left.' : 'Off the rails! Lean against the bend — and brake before the sharp ones.', 2800); }
    else if (e.type === 'back') { io.play('respawn'); S.cam = null; S.view = 0; io.note(e.on ? 'Carried on to the next flag — on you go.' : `Back on the rails at ${c.flags[e.flag].name}.`, 2200); }
    else if (e.type === 'flag') { io.play('checkpoint', { volume: 0.6 }); }
    else if (e.type === 'finish') { io.play('victory'); io.play('bell', { volume: 0.6 }); io.note(`The terminus! ${formatTime(e.time)}${st.falls ? '' : ' — not one fall'}`, 4200); }
  }

  /** Every frame, in every browser that has the game on: what is far is drawn plainly; a car is put under whoever else rides. */
  update(dt, time, camera) {
    if (!camera || !this._cull) return;
    const cam = camera.position;
    for (const p of this._pieces) {
      const d = Math.hypot(cam.x - p.x, cam.y - p.y, cam.z - p.z) - p.r, near = d < this._near, far = !near && d < 3000;
      if (p.near.visible !== near) p.near.visible = near;
      if (p.far.visible !== far) p.far.visible = far;
    }
    this._cull(cam);
    // ---- the others: whoever rides now, on the rails where its robot is
    let used = 0;
    const who = this.crowd?.of() || [], at = this._near1 || (this._near1 = {});
    for (const m of who) {
      const p = m.peer;
      if (used >= this.others.length || !p || !p.visible || p.far || p.hidden) continue;
      const on2 = railNear(this.course, p.x, p.z, p.y - 0.4, 9, at);
      if (!on2) continue;
      const r = railAt(on2.line, on2.s, _p), falling = m.d?.[2] > 0;
      this._place(this.others[used++], p.x + Math.sin(p.yaw) * 0.62, p.y - 0.36, p.z + Math.cos(p.yaw) * 0.62, falling ? p.yaw + time * 3 : r.yaw, falling ? -0.6 : Math.atan(r.rise), falling ? time * 5 : r.bank);
    }
    for (let i = used; i < this.others.length; i++) this.others[i].visible = false;
  }
}

export { COASTER };
