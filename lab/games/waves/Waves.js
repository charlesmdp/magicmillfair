// Wave Goodbye: what is seen of it and how it is played. Its rules are in rules.js; here it is built — the bar of
// sand that runs out from the beach, the stakes that say how far out one is, the arch where one wades in, the
// waves — and a wade is run: a session that drives the player (see PlayerController.driver). The waves are drawn
// from the clock of the world: everybody sees the same sea.
import * as THREE from 'three';
import { Parts, MeshBuilder } from '../../../src/world/props/MeshBuilder.js';
import { LAYER } from '../../../src/render/Shadows.js';
import { ANIM } from '../../../src/player/Character.js';
import { surfaceMaterial } from '../../../src/render/SurfaceMaterial.js';
import { formatTime } from '../../../src/world/zones/games/course.js';
import { V, clamp, lerp, worldClock, gateArch, stakeSign } from '../kit.js';
import { WAVES, heightAt, coming, startWade, stepWade, barAt, ahead, botInput } from './rules.js';

const TOP = 0.22; // m over the sea: the top of the bar, where one stands
const POOL = 18, ACROSS = 15, REACH = 10; // waves drawn at once; points along a crest; how far beyond the bar a crest goes on (m)
// a wave cut across, from its back to its front: [metres towards the sea (times its size), share of its height]
const PROFILE = [[1.9, 0], [0.95, 0.42], [0.3, 0.9], [-0.18, 1], [-0.5, 0.78], [-0.74, 0.34], [-0.98, 0]];
const SEA = [0.16, 0.6, 0.66], GREEN = [0.24, 0.74, 0.74], LIGHT = [0.5, 0.92, 0.88], FOAM = [1.05, 1.06, 1.05];
const PENNANTS = [[1.5, 0.25, 0.2], [1.5, 1.1, 0.15], [0.2, 0.75, 1.3], [1.4, 0.45, 0.1], [0.5, 1.2, 0.4], [1.3, 0.3, 1.0]];
const mix = (a, b, t, out) => { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; return out; };

export class Waves {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'waves';
    this.session = null;
    this.best = 0;
    /** The clock everybody shares (s): the sea goes by it. */
    this.clock = () => worldClock() / 1000;
  }

  /** A place of the bar in the world, `y` metres over the sea. */
  at(s, u, y = TOP, out = V(0, 0, 0)) { const p = barAt(s, u, this._p || (this._p = {})); return out.set(p.x, y, p.z); }

  build() {
    const world = this.world, mats = world.materials, W = WAVES, parts = new Parts(), wood = parts.get('woodWet'), paint = parts.get('paint'), cloth = parts.get('doubleSided');
    // ---- the bar: a long low back of sand, dry on top, going down into the sea on both sides and round its tip
    const sand = new MeshBuilder(), rows = [], wide = W.half + 0.75;
    for (let s = -10; s <= W.length + 5.001; s += 1.25) {
      const w = s < W.length - 3 ? wide : wide * Math.sqrt(Math.max(0, 1 - ((s - (W.length - 3)) / 8) ** 2));
      const dip = s > W.length - 3 ? ((s - (W.length - 3)) / 8) ** 2 * 0.5 : 0; // (the tip goes under)
      rows.push([[-(w + 9), -5], [-(w + 3.4), -1.3], [-(w + 0.9), -0.06], [-w, TOP - 0.04], [0, TOP + 0.05], [w, TOP - 0.04], [w + 0.9, -0.06], [w + 3.4, -1.3], [w + 9, -5]].map(([u, y]) => this.at(s, u, y > 0 ? y - dip : y - dip * 2).clone()));
    }
    const grain = (p) => 0.93 + 0.1 * Math.abs(Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453 % 1); // (no two metres of sand quite alike)
    const tone = (p) => (p.y > 0.08 ? [0.76, 0.65, 0.45] : p.y > -0.3 ? [0.56, 0.47, 0.33] : [0.4, 0.4, 0.3]).map((c) => c * grain(p));
    const n = V(0, 0, 0), a = V(0, 0, 0), b = V(0, 0, 0), ids = rows.map((row, i) => row.map((p, j) => {
      a.subVectors(rows[Math.min(rows.length - 1, i + 1)][j], rows[Math.max(0, i - 1)][j]); b.subVectors(row[Math.min(row.length - 1, j + 1)], row[Math.max(0, j - 1)]);
      n.crossVectors(a, b).normalize(); if (n.y < 0) n.negate();
      return sand.vert(p, n, p.x, p.z, [...tone(p), 1]);
    }));
    const up = (i0, i1, i2) => { a.subVectors(rows0[i1], rows0[i0]); b.subVectors(rows0[i2], rows0[i0]); return a.cross(b).y > 0; }, rows0 = rows.flat(), cols = rows[0].length;
    for (let i = 0; i + 1 < rows.length; i++) for (let j = 0; j + 1 < cols; j++) {
      const p = ids[i][j], q = ids[i + 1][j], r = ids[i + 1][j + 1], t = ids[i][j + 1];
      if (up(i * cols + j, (i + 1) * cols + j, (i + 1) * cols + j + 1)) sand.idx.push(p, q, r, p, r, t); else sand.idx.push(p, r, q, p, t, r);
    }
    this.sandMaterial = surfaceMaterial({ name: 'waves-sand', rough: 0.96, spec: 0.05 });
    const bar = new THREE.Mesh(sand.build(), this.sandMaterial);
    bar.name = 'waves-bar'; bar.matrixAutoUpdate = false;
    this.group.add(bar);
    // ---- stakes every ten metres, a pennant on each, how far out one is on the right-hand ones; a last tall one at the tip
    for (let s = 10, k = 0; s <= W.length + 0.01; s += 10, k++) {
      const last = s >= W.length - 0.01, off = W.half + (last ? 0.5 : 1.25), tall = last ? 3.4 : 2.3;
      for (const side of [-1, 1]) {
        const p = this.at(s, side * off, 0);
        wood.tint(0.95, 0.9, 0.84, 1).cylinder(p.x, -1.4, p.z, 0.06, 0.045, tall + 1.4, 6);
        // (the pennant flies towards the beach: the wind comes off the sea)
        const tip = this.at(s - (last ? 1.2 : 0.75), side * off, tall - 0.2), c = PENNANTS[(k + (side > 0 ? 3 : 0)) % PENNANTS.length];
        cloth.tint(...c, 1).tri(V(p.x, tall, p.z), V(p.x, tall - 0.42, p.z), tip.clone());
        if (side > 0) stakeSign(this.group, wood, p.x, 0.2, p.z, W.yaw, last ? 'THE TIP' : `${s} m`, { w: last ? 1.3 : 0.9, h: 0.36, up: 1.25 });
      }
    }
    // ---- the arch on the sand, where one wades in
    const g = this.at(-7, 0, 0); g.y = Math.max(0.1, this.data.heightAt(g.x, g.z));
    this.gate = { x: g.x, y: g.y, z: g.z, yaw: W.yaw };
    gateArch(this.group, paint, g.x, g.y, g.z, W.yaw, W.name.toUpperCase(), 'WADE IN WHEN YOU LIKE · JUMP WHAT COMES · THE BIG ONES AT THEIR LOW END', { tone: [0.12, 0.5, 0.85], ink: '#0d2a3a', width: 3.6 });
    this.group.add(parts.toMeshes(mats, { name: 'waves-set', layers: [LAYER.STATIC_CASTER] }));
    // ---- one's own best: a golden float out by the bar, as far as one got
    const float = new Parts();
    float.get('paint').tint(1.6, 1.15, 0.2, 1).lathe([[0.001, -0.25], [0.3, -0.12], [0.36, 0.1], [0.2, 0.3], [0.05, 0.36], [0.05, 1.5]], 10);
    float.get('doubleSided').tint(1.6, 1.15, 0.2, 1).tri(V(0, 1.5, 0), V(0, 1.14, 0), V(0, 1.32, 0.6));
    this.mark = float.toMeshes(mats, { name: 'waves-best', layers: [] });
    this.mark.visible = false;
    this.group.add(this.mark);
    // ---- the waves: a few of them, shaped every frame where the clock says
    this.waveMaterial = surfaceMaterial({ name: 'waves-wave', rough: 0.2, spec: 0.6, side: THREE.DoubleSide, emissive: [0.05, 0.2, 0.2] }); // (water lets the light through: its shaded side is never grey)
    const P = PROFILE.length, index = [];
    for (let i = 0; i + 1 < ACROSS; i++) for (let j = 0; j + 1 < P; j++) { const p = i * P + j; index.push(p, p + P, p + 1, p + 1, p + P, p + P + 1); }
    this.pool = [];
    for (let k = 0; k < POOL; k++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ACROSS * P * 3), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(ACROSS * P * 3), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ACROSS * P * 2), 2));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ACROSS * P * 4).fill(1), 4));
      geo.setIndex(index);
      const m = new THREE.Mesh(geo, this.waveMaterial);
      m.name = `waves-wave${k}`; m.frustumCulled = false; m.visible = false; m.matrixAutoUpdate = false;
      this.group.add(m); this.pool.push(m);
    }
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    return this;
  }

  /** One's own best (ms): the golden float is put as far out as that was. */
  setBest(ms) {
    this.best = ms || 0;
    const s = Math.min(WAVES.length, (this.best / 1000) * WAVES.drift);
    this.mark.visible = this.best > 0;
    if (this.best > 0) { this.at(s, -(WAVES.half + 2.2), 0.05, this.mark.position); this.mark.rotation.y = WAVES.yaw; this.mark.updateMatrixWorld(true); }
  }

  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.6 * 2.6; }

  /** Shapes one wave of the pool: `w` (see waveOf) with its crest `crest` metres out. */
  _shape(mesh, w, crest) {
    const W = WAVES, P = PROFILE.length, pos = mesh.geometry.attributes.position, nor = mesh.geometry.attributes.normal, col = mesh.geometry.attributes.color, p = this._q || (this._q = V(0, 0, 0)), c = this._c || (this._c = [0, 0, 0]);
    const span = W.half + REACH;
    for (let i = 0; i < ACROSS; i++) {
      const u = lerp(-span, span, i / (ACROSS - 1)), out = Math.max(0, Math.abs(u) - W.half) / REACH;
      const H = heightAt(w, crest, u) * (1 - out * out), size = 0.5 + 0.5 * H;
      // (a white crest says: this one is to be jumped — lower than the knees it is only a swell; the tall ones are white down their face)
      const white = clamp((H * W.clear - W.knee * 0.85) / (W.knee * 0.4), 0, 1), foam = 0.12 + 0.88 * white, face = white * clamp((H - 0.45) / 0.9, 0.15, 1);
      const lag = out * out * 1.6 + Math.sin(u * 0.55 + w.n * 1.7) * 0.18; // (its ends trail behind, and no crest is straight)
      for (let j = 0; j < P; j++) {
        const k = (i * P + j);
        this.at(crest + lag + PROFILE[j][0] * size, u, -0.14 + PROFILE[j][1] * (H + TOP + 0.14), p);
        pos.setXYZ(k, p.x, p.y, p.z);
        if (j === 0) mix(SEA, GREEN, 0.2, c); else if (j === 1) mix(SEA, GREEN, 0.7, c); else if (j === 2) mix(GREEN, LIGHT, 0.6, c);
        else if (j === 3) mix(LIGHT, FOAM, foam, c); else if (j === 4) mix(LIGHT, FOAM, Math.max(face, foam * 0.5), c); else if (j === 5) mix(GREEN, FOAM, face * 0.8, c); else mix(GREEN, FOAM, 0.2 + 0.5 * white, c);
        col.setXYZW(k, c[0], c[1], c[2], 1);
      }
    }
    // (the normals: from the neighbours along the crest and across it)
    const a = this._a || (this._a = V(0, 0, 0)), b = this._b || (this._b = V(0, 0, 0)), n = this._n || (this._n = V(0, 0, 0));
    const get = (i, j, out) => out.fromBufferAttribute(pos, clamp(i, 0, ACROSS - 1) * P + clamp(j, 0, P - 1));
    for (let i = 0; i < ACROSS; i++) for (let j = 0; j < P; j++) {
      get(i + 1, j, a).sub(get(i - 1, j, n)); get(i, j + 1, b).sub(get(i, j - 1, n));
      n.crossVectors(a, b).normalize(); if (n.y < 0) n.negate();
      nor.setXYZ(i * P + j, n.x, n.y, n.z);
    }
    pos.needsUpdate = nor.needsUpdate = col.needsUpdate = true;
    mesh.visible = true;
  }

  /** Every frame: the sea is where the clock of the world says. */
  update() {
    let used = 0;
    coming(this.clock(), (w, crest) => { const m = this.pool[used]; if (m) { used++; this._shape(m, w, crest); } });
    for (let k = used; k < this.pool.length; k++) this.pool[k].visible = false;
  }

  /**
   * One wades in: the player is put on the sand before the bar, walks into the water and is drawn out. `io`:
   * { play, note, splash }. Returns the session — the driver of the player: step(dt, player, control),
   * camera(camera, dt), line, over (`score`: how long one held, ms), ended, drop(player), close(), auto (true:
   * it plays by itself).
   */
  open(player, io) {
    const W = WAVES, events = [], input = { side: 0, jump: false }, u0 = (Math.random() * 2 - 1) * (W.half - 1);
    const st = startWade(this.clock(), u0), list = [];
    const S = { cam: null, look: V(0, 0, 0), after: 0, acc: 0, warned: -1, back: 0, tumble: 0 }, _t = V(0, 0, 0), pos = V(0, 0, 0);
    const session = {
      waves: this, over: false, ended: false, score: 0, line: '', riding: false, anim: ANIM.walk, state: st, auto: false,
      step: (dt, pl, control) => {
        const inp = pl.input;
        if (!st.over) {
          if (session.auto) {
            S.acc += Math.min(dt, 0.25);
            while (S.acc >= W.step && !st.over) { S.acc -= W.step; botInput(st, input); stepWade(st, W.step, input, events); }
          } else {
            input.side = control ? inp.move.x : 0; input.jump = control && !!inp.jump;
            stepWade(st, dt, input, events);
          }
          // (a great one is said before it is there: its low end is where to be)
          for (const w of ahead(st, 4.2, list)) if (w.kind === 'monster' && w.n > S.warned) { S.warned = w.n; io.note(`A great one! Get to its low end: the ${w.dir > 0 ? 'right' : 'left'}.`, 2600); io.play('tick'); }
        }
        for (const e of events) this._tell(e, io, st);
        events.length = 0;
        let s = st.s, y = TOP + st.h, pitch = 0;
        if (st.over) {
          // carried back to the beach in the foam, then on one's feet on the sand
          S.after += dt;
          const k = Math.min(1, S.after / 1.5), ease = 1 - (1 - k) * (1 - k);
          s = lerp(st.s, -4.5, ease); y = TOP + Math.abs(Math.sin(S.after * 7)) * 0.35 * (1 - k); pitch = -1.25 * (1 - k * k);
          if (!session.over) { session.over = true; session.score = st.time; }
          if (S.after > 2.1) session.ended = true;
        } else if (st.clock < W.grace) s = st.s - (1 - st.clock / W.grace) * 4.5; // (one walks in from the sand)
        this.at(s, st.u, y, pos);
        if (s < 1) pos.y = Math.max(pos.y, this.data.heightAt(pos.x, pos.z) + st.h); // (the sand of the beach itself)
        pl.pos.copy(pos); pl.yaw = W.yaw; pl.roll = 0; pl.pitch = pitch;
        pl.speed = st.over ? 0 : Math.max(1.4, Math.abs(st.vu)); pl.grounded = st.h <= 0;
        session.anim = st.over ? ANIM.sit : st.h > 0.05 ? ANIM.jump : Math.abs(st.vu) > 1.2 ? ANIM.run : ANIM.walk;
        const out = Math.max(0, st.s).toFixed(0);
        session.line = st.over ? `${W.name} · held ${formatTime(st.time)} · ${out} m out`
          : st.clock < W.grace ? `${W.name} · wade in…` : `${formatTime(Math.round(st.clock * 1000))} · ${out} m out · ${st.jumped} jumped`;
      },
      /** The camera: behind the wader, on the side of the beach, and above: looking out at what comes. */
      camera: (cam, dt) => {
        const s = st.over ? lerp(st.s, -4.5, Math.min(1, S.after / 1.5)) : st.s;
        this.at(s - 7.6, st.u * 0.55, 4.7, _t);
        _t.y = Math.max(_t.y, this.data.heightAt(_t.x, _t.z) + 2.2);
        if (!S.cam) S.cam = _t.clone(); else S.cam.lerp(_t, Math.min(1, dt * 5));
        this.at(s + 6.5, st.u * 0.5, 0.2, _t);
        S.look.lerp(_t, S.look.lengthSq() ? Math.min(1, dt * 7) : 1);
        cam.position.copy(S.cam); cam.up.set(0, 1, 0); cam.lookAt(S.look);
        return 62;
      },
      /** The wade is over (or left): the player is put back on the sand under the arch, facing the sea. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x, this.gate.z, W.yaw); session.close(); },
      close: () => { if (this.session === session) this.session = null; player.pitch = 0; },
    };
    this.session = session;
    session.step(0, player, false);
    return session;
  }

  _tell(e, io, st) {
    if (e.type === 'jump') io.play('jump', { volume: 0.5 });
    else if (e.type === 'again') io.play('jump', { volume: 0.7 });
    else if (e.type === 'clear') { if (e.kind === 'monster') { io.play('checkpoint'); io.note('Over the great one!', 1600); } else if (e.kind === 'breaker') io.play('pick', { volume: 0.5 }); }
    else if (e.type === 'out') {
      const p = this.at(st.s, st.u, 0);
      io.play('splash'); io.play('fail'); io.splash?.(p.x, 0, p.z, 5);
      io.note(`${e.kind === 'monster' ? 'Swallowed by a great one' : e.kind === 'breaker' ? 'Bowled over by a breaker' : e.kind === 'roller' ? 'Caught by a roller' : 'Tripped by a ripple'} — held ${formatTime(e.time)}, ${st.s.toFixed(0)} m out.`, 4200);
    }
  }
}
