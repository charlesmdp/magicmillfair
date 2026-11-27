// Run the Walls: what is seen of it and how it is run. Its rules are in rules.js; here the ruin is built — a
// stepped citadel of pale sandstone on a rock in the bay: the way winds round it and inwards, lap over lap, a
// wall always on its left, a round turret at every corner, a keep in the middle and a tower over it — and a run
// is a session that drives the player (see PlayerController.driver). The camera rides behind the runner, on the
// open side and above: nothing is ever between it and the runner; where a wall stands on the right as well, it
// comes in over the middle of the way, between the two.
//
// What the stone says never changes: a band of BLUE along a wall is run along; a face of GREEN across the way
// is run up; a GOLD bar is swung round; RED hurts (blades, spikes); pale cracked slabs give way.
import * as THREE from 'three';
import { Parts } from '../../../props/MeshBuilder.js';
import { LAYER } from '../../../../render/Shadows.js';
import { ANIM } from '../../../../player/Character.js';
import { canvasBoard } from '../Boards.js';
import { formatTime } from '../course.js';
import { V, clamp, lerp, worldClock, gateArch, stakeSign } from '../gates.js';
import { WALLS, LENGTH, PLAN, course, placeAt, floorAt, hallAt, stretchOf, bladeAt, spikesAt, startRun, stepRun, botInput, trodAt, onLedge } from './rules.js';

const S = WALLS, H = S.half, C = S.at, TAU = Math.PI * 2;
const OUT = H + 0.4; // the outer edge of the way: its kerb
const DEEP = -S.base - 1; // under the rock
// the top of the wall on the left of each side, and what is under the way there: the rock, or the terrace of the lap outside
const TOPS = S.tops, UNDER = TOPS.map((_, k) => (k < 4 ? DEEP : TOPS[k - 4]));
const SAND = [1.32, 1.13, 0.83], PALE = [1.5, 1.35, 1.05], DUSK = [0.9, 0.74, 0.53], BLUE = [0.1, 0.4, 1.35], SKY = [0.55, 0.85, 1.5], GREEN = [0.1, 0.8, 0.36], LIME = [0.6, 1.4, 0.5], RED = [1.25, 0.08, 0.08], GOLD = [1.7, 1.2, 0.18], WHITE = [1.6, 1.55, 1.45], DARK = [0.16, 0.13, 0.11];
const LEAF = [[0.2, 0.5, 0.13], [0.34, 0.72, 0.2], [0.14, 0.38, 0.12]], CLOTH = [[1.25, 0.16, 0.12], [1.55, 1.42, 1.12], [0.12, 0.42, 1.2], [1.6, 1.15, 0.2], [0.14, 0.75, 0.36]];
const WHY = { fall: 'A fall!', blade: 'Caught by a blade!', spikes: 'Onto the spikes!' };
const _p = {}, _q = {};
/** A point of the way: metre `s`, `u` across (to the right), `y` over the foot of the ruin. */
const P = (s, u = 0, y = 0) => { placeAt(s, u, _p); return V(_p.x, S.base + y, _p.z); };
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k, 1];
const hash = (n) => { const x = Math.sin(n * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };
/** Which piece of the plan metre `s` is on: { k (the side, or the corner after it), arc }. */
const pieceOf = (s) => { let i = 0; while (i < PLAN.length - 1 && s >= PLAN[i].s1) i++; return { k: i >> 1, arc: i % 2 === 1, p: PLAN[i] }; };
const underAt = (s) => { const { k, arc } = pieceOf(s); return arc ? Math.min(UNDER[k], UNDER[k + 1]) : UNDER[k]; };
/** Where to cut a stretch of the way so that each piece is straight enough: the corners in metres. */
const cuts = (a, b) => {
  const out = [a];
  for (const p of PLAN) {
    if (p.s1 <= a || p.s0 >= b) continue;
    const lo = Math.max(a, p.s0), hi = Math.min(b, p.s1), n = p.kind === 'arc' ? Math.max(1, Math.ceil((hi - lo) / 1.05)) : 1;
    for (let k = 1; k <= n; k++) out.push(lo + ((hi - lo) * k) / n);
  }
  if (out[out.length - 1] < b - 1e-6) out.push(b);
  return out.filter((v, i) => i === 0 || v - out[i - 1] > 1e-6);
};

export class Walls {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'walls';
    this.session = null;
    this.best = 0;
    /** The clock everybody shares (ms): the blades and the spikes keep time on it. */
    this.clock = worldClock;
  }

  build() {
    const world = this.world, mats = world.materials, core = new Parts(), { things, saves } = course();
    const stone = core.get('paving'), pave = stone, paint = core.get('matte'), rock = core.get('rock'), glow = core.get('glow'), cloth = core.get('doubleSided');
    const bands = things.filter((t) => t.kind === 'wall');
    const of = (kind, form) => things.filter((t) => t.kind === kind && (form === undefined || t.form === form));
    const num = (v, s) => (typeof v === 'function' ? v(s) : v);
    /**
     * A face of stone along the way, `u` across, from `lo` to `hi` (numbers, or what metre `s` says), seen from the
     * right (`face` 1) or from the left (-1): laid in courses, darker at its foot — the light is in the vertices.
     */
    const wallFace = (b, s0, s1, u, lo, hi, face, tone, o = {}) => {
      const cs = cuts(s0, s1), span = Math.max(num(hi, s0) - num(lo, s0), num(hi, s1) - num(lo, s1)), n = o.plain ? 1 : Math.max(1, Math.round(span / 0.9));
      for (let i = 0; i + 1 < cs.length; i++) for (let j = 0; j < n; j++) {
        const sa = cs[i], sb = cs[i + 1], la = num(lo, sa), lb = num(lo, sb), ha = num(hi, sa), hb = num(hi, sb);
        if (ha - la < 0.01 && hb - lb < 0.01) continue;
        const f0 = j / n, f1 = (j + 1) / n, k = o.plain ? 1 : 0.9 + 0.16 * hash(j * 3.7 + Math.round(s0) * 0.31 + (o.seed || 0));
        const g = (f) => mul(tone, k * (o.plain ? 1 : 0.7 + 0.36 * Math.min(1, f * 1.6)));
        const a = P(sa, u, lerp(la, ha, f0)), bb = P(sb, u, lerp(lb, hb, f0)), c = P(sb, u, lerp(lb, hb, f1)), d = P(sa, u, lerp(la, ha, f1));
        if (face > 0) b.quad(a, bb, c, d, { colors: [g(f0), g(f0), g(f1), g(f1)], u0: sa, v0: lerp(la, ha, f0) });
        else b.quad(bb, a, d, c, { colors: [g(f0), g(f0), g(f1), g(f1)], u0: -sb, v0: lerp(lb, hb, f0) });
      }
    };
    /** A face across the way at metre `s`, from u0 to u1 and y0 to y1, looking back down the way (`face` -1) or up it (1). */
    const cross = (b, s, u0, u1, y0, y1, face, tone, k0 = 0.7, k1 = 1) => {
      if (y1 - y0 < 0.01) return;
      const a = P(s, u0, y0), bb = P(s, u1, y0), c = P(s, u1, y1), d = P(s, u0, y1), cols = [mul(tone, k0), mul(tone, k0), mul(tone, k1), mul(tone, k1)];
      if (face < 0) b.quad(a, bb, c, d, { colors: cols }); else b.quad(bb, a, d, c, { colors: cols });
    };
    /** The top of something along the way: from u0 to u1 at height `y` (a number, or what metre `s` says). */
    const top = (b, s0, s1, u0, u1, y, tone, o = {}) => {
      const cs = cuts(s0, s1);
      for (let i = 0; i + 1 < cs.length; i++) { const sa = cs[i], sb = cs[i + 1]; b.tint(...tone, 1).quad(P(sa, u0, num(y, sa)), P(sa, u1, num(y, sa)), P(sb, u1, num(y, sb)), P(sb, u0, num(y, sb)), { u0: u0, v0: sa, ...o }); }
    };

    /** An arch on a face along the way: dark inside, a pale roll round it — `u` the face, seen from the right (1) or the left (-1). */
    const arch = (c, r, yBot, yTop, u, face, dark = 0.4) => {
      const yc = yTop - r, e = face * 0.025, pts = [P(c - face * r, u + e, yBot), P(c + face * r, u + e, yBot)];
      for (let m = 0; m <= 8; m++) { const a = (m / 8) * Math.PI; pts.push(P(c + face * r * Math.cos(a), u + e, yc + r * Math.sin(a))); }
      for (let m = 1; m + 1 < pts.length; m++) stone.quad(pts[0], pts[m], pts[m + 1], pts[m + 1], { colors: [mul(DUSK, dark * 1.5), mul(DUSK, dark * (pts[m].y > pts[0].y + 0.1 ? 0.8 : 1.5)), mul(DUSK, dark * 0.8), mul(DUSK, dark * 0.8)] });
      for (let m = 0; m < 8; m++) { const a0 = (m / 8) * Math.PI, a1 = ((m + 1) / 8) * Math.PI; stone.tint(...PALE, 1).rod(P(c + r * Math.cos(a0), u + face * 0.09, yc + r * Math.sin(a0)), P(c + r * Math.cos(a1), u + face * 0.09, yc + r * Math.sin(a1)), 0.11, 5); }
      for (const d of [-1, 1]) stone.tint(...PALE, 1).rod(P(c + d * r, u + face * 0.09, yBot), P(c + d * r, u + face * 0.09, yc), 0.11, 5);
    };
    /** A vine down a face along the way, from `y` down `len` at the most: a few tongues of leaves. */
    const vine = (s, u, y, len, face) => {
      for (let m = 0; m < 9; m++) {
        const c = s + (m - 4) * 0.2 + (hash(s + m) - 0.5) * 0.16, w = 0.07 + 0.09 * hash(s * 3 + m), l = len * (0.3 + 0.7 * hash(s * 7 + m)), uu = u + face * (0.04 + 0.008 * m);
        const a = P(c - face * w * 0.2, uu, y - l), b = P(c + face * w * 0.2, uu, y - l), cc = P(c + face * w, uu, y + 0.12), d = P(c - face * w, uu, y + 0.12);
        paint.quad(a, b, cc, d, { colors: [mul(LEAF[m % 3], 0.8), mul(LEAF[m % 3], 0.8), mul(LEAF[(m + 1) % 3], 1.15), mul(LEAF[(m + 1) % 3], 1.15)] });
        // (leaves, left and right in turn down the stem)
        for (let q = 0, yy = y - 0.15; yy > y - l + 0.1; yy -= 0.34, q++) { const d2 = (q % 2 ? 1 : -1) * face, tone = mul(LEAF[(m + q) % 3], 0.9 + 0.3 * hash(q + m)); paint.tint(...tone).tri(...(d2 * face > 0 ? [P(c, uu, yy - 0.1), P(c + d2 * 0.24, uu, yy - 0.14), P(c, uu, yy + 0.1)] : [P(c, uu, yy + 0.1), P(c + d2 * 0.24, uu, yy - 0.14), P(c, uu, yy - 0.1)])); }
      }
    };
    /** Bunting from mast to mast along the top of a wall: the little flags of the fair. */
    const bunting = (s0, s1, y, u) => {
      const n = Math.max(1, Math.round((s1 - s0) / 9.5)), span = (s1 - s0) / n;
      for (let k = 0; k <= n; k++) { const p = P(s0 + k * span, u, y); paint.tint(...WHITE, 1).cylinder(p.x, p.y, p.z, 0.05, 0.035, 2.7, 5); paint.tint(...GOLD, 1).cube(p.x, p.y + 2.75, p.z, 0.14, 0.14, 0.14); }
      for (let k = 0; k < n; k++) {
        let prev = P(s0 + k * span, u, y + 2.6);
        for (let m = 0; m < 14; m++) {
          const f = (m + 0.5) / 14, s = s0 + (k + f) * span, yy = y + 2.6 - 1.25 * 4 * f * (1 - f), p = P(s, u, yy);
          paint.tint(...DARK, 1).beam(prev, p, 0.025, 0.025); prev = p;
          cloth.tint(...CLOTH[(m + k) % 5], 1).tri(P(s - 0.19, u, yy), P(s + 0.19, u, yy), P(s, u, yy - 0.46));
        }
        paint.tint(...DARK, 1).beam(prev, P(s0 + (k + 1) * span, u, y + 2.6), 0.025, 0.025);
      }
    };
    /** How high the way is at metre `s` (over a gap: the floor before it). */
    const pathY = (s) => { let y = 0; for (const t of things) if (t.kind === 'floor' && t.s0 <= s) y = t.s1 >= s ? lerp(t.y0, t.y1, clamp((s - t.s0) / (t.s1 - t.s0), 0, 1)) : t.y1; return y; };

    // ---- the rock it stands on: out of the sea, flat enough on top
    {
      const N = 40, A = 30, B = 36, ring = (k, y, j) => Array.from({ length: N }, (_, i) => { const a = (i / N) * TAU, r = k * (1 + 0.07 * Math.sin(i * 2.3 + j) + 0.05 * Math.sin(i * 5.1 + 1.7)) / Math.pow(Math.abs(Math.cos(a) / A) ** 4 + Math.abs(Math.sin(a) / B) ** 4, 0.25); return V(C.x + Math.cos(a) * r, y + 0.5 * Math.sin(i * 3.1 + j), C.z + Math.sin(a) * r); });
      const rings = [ring(0.86, 1.6, 0), ring(0.98, 0.5, 1), ring(1.08, -2.5, 2), ring(1.3, -9.5, 3)], tones = [[1.02, 0.95, 0.84], [0.92, 0.85, 0.74], [0.74, 0.7, 0.64], [0.56, 0.55, 0.53]];
      for (let j = 0; j + 1 < rings.length; j++) for (let i = 0; i < N; i++) { const i1 = (i + 1) % N; rock.quad(rings[j + 1][i1], rings[j + 1][i], rings[j][i], rings[j][i1], { colors: [mul(tones[j + 1], 1), mul(tones[j + 1], 1), mul(tones[j], 1), mul(tones[j], 1)] }); }
      const mid = V(C.x, 1.9, C.z);
      for (let i = 0; i < N; i++) rock.tint(...tones[0], 1).tri(mid, rings[0][(i + 1) % N], rings[0][i]);
      // (boulders on its shore, where the sea has thrown them)
      for (let i = 0; i < 16; i++) {
        const q = rings[1][Math.floor(hash(i * 3.3) * N)], k = 0.9 + 0.12 * hash(i * 1.9), r = 0.8 + 1.7 * hash(i * 7.1), g = 0.8 + 0.4 * hash(i * 5.3);
        rock.tint(1.0 * g, 0.94 * g, 0.84 * g, 1).place(C.x + (q.x - C.x) * k, q.y - 0.3, C.z + (q.z - C.z) * k, hash(i) * 6).lathe([[0.001, 0], [r, r * 0.08], [r * 1.12, r * 0.45], [r * 0.8, r * 0.85], [0.001, r]], 7).pop();
      }
    }

    // ---- the wall on the left of every side, its terrace, its parapet; a round turret at every corner
    PLAN.forEach((p, i) => {
      const k = i >> 1;
      if (p.kind === 'line') {
        const T = TOPS[k], lo = UNDER[k] - 0.3, s1 = Math.min(p.s1, LENGTH + 2.2), keep = k >= 5, back = keep ? 9.5 : 3.75, s0 = k ? p.s0 : -5;
        wallFace(stone, s0, s1, -H, lo, T, 1, SAND, { seed: k });
        if (!k) { cross(stone, s0, -H - back, -H, lo, T, -1, SAND, 0.6, 1); top(pave, s0, p.s0, -H - back, -H, T, mul(SAND, 0.92)); }
        if (k >= 4) top(pave, p.s0 - 0.5, s1 + 0.5, -H, OUT, UNDER[k] - 0.02, mul(DUSK, 0.62)); // (under an inner lap, the terrace of the lap outside: the bottom of its gaps)
        // (windows high in it, dark, where there is room over the heads and over the bands; vines down from its top)
        for (let row = 0; row < (keep ? 2 : 1); row++) for (let s = p.s0 + 2.4; s < s1 - 1.4; s += 4.2) {
          const yTop = T - 1.0 - row * 3.5, yBot = yTop - 1.9;
          if (yBot < Math.max(pathY(s - 1.5), pathY(s + 1.5)) + 4.4 || bands.some((t) => t.side < 0 && s > t.s0 - 1.2 && s < t.s1 + 1.2 && t.y1 > yBot - 0.6)) continue;
          arch(s, 0.5, yBot, yTop, -H, 1, 0.3);
          wallFace(stone, s - 0.75, s + 0.75, -H + 0.16, yBot - 0.2, yBot, 1, PALE, { plain: true }); top(stone, s - 0.75, s + 0.75, -H, -H + 0.16, yBot, PALE);
        }
        for (let s = p.s0 + 1.5 + 3 * hash(k * 7.7); s < s1 - 1.5; s += 4.5 + 5 * hash(s * 1.3 + k)) {
          const room = Math.min(...[-1, 0, 1].map((d) => T - Math.max(pathY(s + d) + 2.7, ...bands.filter((t) => t.side < 0 && s > t.s0 - 1.5 && s < t.s1 + 1.5).map((t) => t.y1 + 0.5))));
          if (room > 1) vine(s, -H, T - 0.5, Math.min(room, 1.6 + 3.2 * hash(s * 2.1)), 1);
        }
        if (k < 5) bunting(p.s0 + 0.8, s1 - 0.8, T + 0.2, -H - 0.3);
        // (a string course under its top, proud of the wall; the terrace behind; a parapet with gaps where it has fallen)
        wallFace(stone, p.s0, s1, -H + 0.14, T - 0.5, T - 0.15, 1, PALE, { plain: true });
        top(stone, p.s0, s1, -H, -H + 0.14, T - 0.15, PALE);
        top(pave, p.s0, s1, -H - back, -H, T, mul(SAND, 0.92));
        for (let s = p.s0 + 0.6; s + 1.5 < s1; s += 2.4) {
          const h = hash(s * 1.7 + k) > 0.3 ? 0.9 + 0.5 * hash(s + k) : 0.25;
          wallFace(stone, s, s + 1.5, -H, T, T + h, 1, mul(PALE, 0.96), { plain: true }); wallFace(stone, s, s + 1.5, -H - 0.5, T, T + h, -1, mul(DUSK, 1.1), { plain: true });
          top(stone, s, s + 1.5, -H - 0.5, -H, T + h, PALE); cross(stone, s, -H - 0.5, -H, T, T + h, -1, SAND); cross(stone, s + 1.5, -H - 0.5, -H, T, T + h, 1, SAND);
        }
      } else {
        const T = Math.max(TOPS[k], TOPS[k + 1]) + S.turret, lo = Math.min(UNDER[k], UNDER[k + 1]) - 0.3, c = placeAt(p.s0, -S.plan.r, _q), r = S.plan.r - H, n = Math.round((T - lo) / 0.9);
        for (let j = 0; j < n; j++) stone.tint(...mul(SAND, (0.72 + 0.34 * Math.min(1, (j / n) * 1.6)) * (0.92 + 0.14 * hash(j + k * 9)))).cylinder(c.x, S.base + lo + ((T - lo) * j) / n, c.z, r, r, (T - lo) / n, 22, { capTop: false, capBottom: false });
        stone.tint(...PALE, 1).cylinder(c.x, S.base + T - 0.7, c.z, r + 0.22, r + 0.22, 0.45, 22, { capTop: true });
        stone.tint(...mul(SAND, 0.9), 1).cylinder(c.x, S.base + T - 0.25, c.z, r, r, 0.01, 22, { capTop: true });
        // (a broken crown of merlons)
        for (let m = 0; m < 9; m++) if (hash(m * 3.3 + k) > 0.28) { const a = (m / 9) * TAU, h = 0.7 + 0.6 * hash(m + k * 5); stone.tint(...PALE, 1).place(c.x + Math.cos(a) * (r - 0.1), S.base + T - 0.25, c.z + Math.sin(a) * (r - 0.1), -a).box(-0.3, 0, -0.55, 0.3, h, 0.55).pop(); }
      }
    });
    // ---- beyond the last floor, over the keep, a ruined tower: a drum, a broken crown, a flag
    {
      const c = placeAt(LENGTH + 5.4, -1.2, _q), r = 3.3, T = 36.5, lo = 27.2;
      for (let j = 0; j < 10; j++) stone.tint(...mul(SAND, 0.8 + 0.03 * j + 0.08 * hash(j * 5.1)), 1).cylinder(c.x, S.base + lo + ((T - lo) * j) / 10, c.z, r, r - (j > 7 ? 0.1 : 0), (T - lo) / 10, 20, { capTop: j === 9 });
      for (let m = 0; m < 8; m++) if (hash(m * 2.1) > 0.35) { const a = (m / 8) * TAU; stone.tint(...PALE, 1).place(c.x + Math.cos(a) * (r - 0.2), S.base + T, c.z + Math.sin(a) * (r - 0.2), -a).box(-0.3, 0, -0.6, 0.3, 0.9 + hash(m) * 0.8, 0.6).pop(); }
      paint.tint(...WHITE, 1).cylinder(c.x, S.base + T, c.z, 0.06, 0.05, 4.2, 6);
      const f = V(c.x, S.base + T + 4.1, c.z);
      for (const flip of [1, -1]) { const tri = [f, V(f.x - 2.4, f.y - 0.5, f.z + 0.5), V(f.x, f.y - 1, f.z)]; paint.tint(...RED, 1).tri(...(flip > 0 ? tri : [tri[0], tri[2], tri[1]])); }
    }

    // ---- the floors: blocks of stone from what is under the way up to it; worn steps round the corners
    const floors = of('floor'), before = (t) => floors.find((q) => Math.abs(q.s1 - t.s0) < 1e-6), after = (t) => floors.find((q) => Math.abs(q.s0 - t.s1) < 1e-6);
    for (const t of floors) {
      if (t.form === 'crumble') continue;
      const yAt = (s) => lerp(t.y0, t.y1, clamp((s - t.s0) / (t.s1 - t.s0), 0, 1));
      if (t.form === 'ledge') {
        // (a ledge: a course of stone proud of the wall, on corbels)
        top(pave, t.s0, t.s1, -H, t.u1, t.y0, PALE); wallFace(stone, t.s0, t.s1, t.u1, t.y0 - 0.3, t.y0, 1, PALE, { plain: true });
        for (let s = t.s0 + 0.5; s < t.s1; s += 1.5) for (const [d, w] of [[0.3, t.u1 + H], [0.62, (t.u1 + H) * 0.55]]) { wallFace(stone, s - 0.2, s + 0.2, -H + w, t.y0 - d - 0.3, t.y0 - d, 1, SAND, { plain: true }); cross(stone, s - 0.2, -H, -H + w, t.y0 - d - 0.3, t.y0 - d, -1, DUSK); cross(stone, s + 0.2, -H, -H + w, t.y0 - d - 0.3, t.y0 - d, 1, DUSK); }
        continue;
      }
      const lo = (s) => underAt(Math.min(s, LENGTH + 2)) - 0.3, s1 = t.s1;
      if (t.form === 'stairs') {
        // (worn steps: eight to the flight, their edges pale)
        const n = 8, d = (t.s1 - t.s0) / n;
        for (let j = 0; j < n; j++) {
          const sa = t.s0 + j * d, sb = sa + d, y = yAt(sb - d * 0.25), y0 = j ? yAt(sa - d * 0.25) : t.y0;
          top(pave, sa, sb, -H, OUT, y, j % 2 ? SAND : mul(SAND, 1.06)); cross(stone, sa, -H, OUT, y0, y, -1, PALE, 0.8, 1.05);
          wallFace(stone, sa, sb, OUT, lo, y, 1, SAND, { seed: j });
        }
        continue;
      }
      top(pave, t.s0, s1, -H, OUT, t.y0, SAND);
      // (its kerb on the open side: a pale edge one reads the way by)
      top(stone, t.s0, s1, H + 0.08, OUT, t.y0 + 0.16, PALE); wallFace(stone, t.s0, s1, H + 0.08, t.y0, t.y0 + 0.16, -1, PALE, { plain: true });
      wallFace(stone, t.s0, s1, OUT, lo, t.y0 + 0.16, 1, SAND, { seed: t.id });
      wallFace(stone, t.s0, s1, OUT + 0.13, t.y0 - 0.34, t.y0 - 0.04, 1, PALE, { plain: true }); top(stone, t.s0, s1, OUT, OUT + 0.13, t.y0 - 0.04, PALE);
      if (s1 - t.s0 >= 2.6) {
        // (pilasters down to what it stands on, an arch between each two)
        const n = Math.max(1, Math.round((s1 - t.s0) / 3.4)), bay = (s1 - t.s0) / n, low = lo((t.s0 + s1) / 2), yTop = t.y0 - 0.85, yBot = Math.max(low + 0.2, yTop - 4.4), w = 0.3;
        for (let k = 0; k <= n; k++) { const s = clamp(t.s0 + k * bay, t.s0 + w, s1 - w); wallFace(stone, s - w, s + w, OUT + 0.2, low, t.y0 - 0.34, 1, PALE, { seed: k }); cross(stone, s - w, OUT, OUT + 0.2, low, t.y0 - 0.34, -1, SAND, 0.6, 1); cross(stone, s + w, OUT, OUT + 0.2, low, t.y0 - 0.34, 1, DUSK, 0.6, 1); }
        if (yTop - yBot > 1.7) for (let k = 0; k < n; k++) arch(t.s0 + (k + 0.5) * bay, Math.min(bay / 2 - 0.55, (yTop - yBot) * 0.6), yBot, yTop, OUT, 1);
        for (let k = 0; k < n; k++) if (hash(t.id * 3.1 + k) > 0.55) vine(t.s0 + (k + 0.5) * bay + (hash(t.id + k) - 0.5), OUT + 0.14, t.y0 + 0.1, 1 + 2.4 * hash(t.id * 1.7 + k), 1);
      }
      const pa = before(t), pb = after(t);
      if (!pa || pa.y1 < t.y0 - 0.01 || pa.form === 'crumble' || pa.form === 'ledge') cross(stone, t.s0, -H, OUT, pa && pa.form !== 'crumble' && pa.form !== 'ledge' ? pa.y1 : lo(t.s0), t.y0, -1, SAND, 0.5, 1);
      if (!pb || pb.form === 'crumble' || pb.form === 'ledge') cross(stone, s1, -H, OUT, lo(s1), t.y0, 1, DUSK, 0.5, 1);
    }
    // (behind the start the way is broken off: a stump of it, so that one does not begin on the brink)
    top(pave, -5, 0, -H, OUT, 0, SAND); top(stone, -5, 0, H + 0.08, OUT, 0.16, PALE); wallFace(stone, -5, 0, OUT, DEEP - 0.3, 0.16, 1, SAND, { seed: 91 }); cross(stone, -5, -H, OUT, DEEP - 0.3, 0, -1, SAND, 0.5, 1);
    // ---- a face of green stone: what one runs up — a panel proud of it, arrows up
    for (const t of of('face')) {
      const s = t.s - 0.03;
      cross(paint, s, -H + 0.12, H - 0.12, t.y0 + 0.1, t.y1 - 0.08, -1, GREEN, 0.75, 1.1);
      cross(paint, s + 0.01, -H + 0.12, H - 0.12, t.y1 - 0.08, t.y1 + 0.001, -1, LIME, 1, 1);
      top(paint, t.s - 0.03, t.s + 0.3, -H + 0.12, H - 0.12, t.y1 + 0.012, LIME);
      for (const u of [-0.85, 0, 0.85]) for (let y = t.y0 + 0.5; y + 0.5 < t.y1; y += 0.85) for (const d of [-1, 1]) paint.tint(...LIME, 1).beam(P(s - 0.02, u, y + 0.34), P(s - 0.02, u + d * 0.3, y), 0.03, 0.12);
    }
    // ---- a band of blue stone: what one runs along — on the wall on the left, or on a wall that stands on the right
    for (const t of of('wall')) {
      const u = t.side < 0 ? -H + 0.03 : H - 0.03, f = t.side < 0 ? 1 : -1, mid = Math.min(t.y1, t.y0 + 2.3);
      if (t.side > 0) {
        // (the wall itself: a slab of the hall that is left standing, its head broken)
        const a = t.s0 - 0.7, b = t.s1 + 0.7, lo = underAt((a + b) / 2) - 0.3, hi = (s) => t.y1 + 0.9 + 0.5 * Math.sin(s * 1.9) + (hash(Math.floor(s)) > 0.6 ? 0.5 : 0);
        for (let s = a; s < b - 1e-6; s += 1.45) { const e = Math.min(b, s + 1.45), h = hi(s); wallFace(stone, s, e, H, lo, h, -1, SAND, { seed: s }); wallFace(stone, s, e, H + 0.6, lo, h, 1, mul(SAND, 0.95), { seed: s + 3 }); top(stone, s, e, H, H + 0.6, h, PALE); cross(stone, s, H, H + 0.6, lo, h, -1, SAND, 0.6, 1); cross(stone, e, H, H + 0.6, lo, h, 1, DUSK, 0.6, 1); }
      }
      wallFace(paint, t.s0, t.s1, u, t.y0 - 0.15, mid, f, BLUE, { plain: true });
      if (t.y1 > mid) wallFace(paint, t.s0, t.s1, u, mid, t.y1, f, mul(SKY, 0.9), { plain: true });
      for (const y of [t.y0 - 0.15, mid - 0.09]) wallFace(paint, t.s0, t.s1, u + (t.side < 0 ? 0.015 : -0.015), y, y + 0.09, f, WHITE, { plain: true });
      // (arrows along it, the way one runs)
      for (let s = t.s0 + 0.9; s + 0.8 < t.s1; s += 1.7) for (const d of [-1, 1]) paint.tint(...SKY, 1).beam(P(s + 0.55, u + (t.side < 0 ? 0.03 : -0.03), t.y0 + 1.05), P(s, u + (t.side < 0 ? 0.03 : -0.03), t.y0 + 1.05 + d * 0.42), 0.14, 0.03);
    }
    // ---- a gold bar across a gap, on a bracket from the wall
    for (const t of of('pole')) {
      paint.tint(...GOLD, 1).rod(P(t.s, -H - 0.1, t.y), P(t.s, OUT + 0.15, t.y), 0.075, 10);
      for (const u of [-H + 0.02, OUT + 0.15]) { const p = P(t.s, u, t.y); paint.tint(...GOLD, 1).place(p.x, p.y, p.z).lathe([[0.001, -0.17], [0.13, -0.1], [0.17, 0], [0.13, 0.1], [0.001, 0.17]], 8).pop(); }
      stone.tint(...DUSK, 1).beam(P(t.s, -H, t.y + 1.5), P(t.s, OUT + 0.15, t.y + 0.05), 0.12, 0.12);
      stone.tint(...DUSK, 1).beam(P(t.s, -H, t.y + 1.5), P(t.s, -H, t.y - 0.6), 0.2, 0.2);
    }
    // ---- the saves: a line of gold and white across the way, a banner of gold cloth down the wall, a plaque
    this.plaques = [];
    saves.forEach((v, n) => {
      for (let j = 0; j < 8; j++) { const u0 = -H + ((H + OUT) * j) / 8, u1 = -H + ((H + OUT) * (j + 1)) / 8; top(paint, v.s - 0.16, v.s + 0.16, u0, u1, v.y + 0.012, j % 2 ? GOLD : WHITE); }
      // (a banner of gold cloth down the wall, and a sign that stands out from it over the way: the open side stays clear)
      wallFace(paint, v.s - 0.45, v.s + 0.45, -H + 0.04, v.y + 1.2, v.y + 3.45, 1, GOLD, { plain: true });
      paint.tint(...GOLD, 1).tri(P(v.s - 0.45, -H + 0.04, v.y + 1.2), P(v.s, -H + 0.04, v.y + 0.75), P(v.s + 0.45, -H + 0.04, v.y + 1.2));
      if (hallAt(v.s) < 0.01 && hallAt(v.s + 12) < 0.01 && TOPS[pieceOf(v.s).k] - v.y > 4.9 && !bands.some((t) => t.s0 > v.s - 3 && t.s0 < v.s + 10)) {
        const a = v.s - 1.8, b = v.s + 1.8, tones = [CLOTH[n % 2 ? 2 : 0], CLOTH[1]], yw = v.y + 4.25, yo = v.y + 3.62, uo = 0.75;
        for (let j = 0; j < 8; j++) {
          const sa = a + ((b - a) * j) / 8, sb = a + ((b - a) * (j + 1)) / 8;
          cloth.tint(...tones[j % 2], 1).quad(P(sa, -H + 0.04, yw), P(sa, uo, yo), P(sb, uo, yo), P(sb, -H + 0.04, yw));
          cloth.tint(...tones[j % 2], 1).tri(P(sa, uo, yo), P((sa + sb) / 2, uo + 0.05, yo - 0.3), P(sb, uo, yo));
        }
        for (const s of [a, b]) paint.tint(...DARK, 1).beam(P(s, uo, yo), P(s, -H, yw + 0.55), 0.03, 0.03);
      }
      { const p = P(v.s, -H + 0.07, v.y + 3.68 + 0.39), q = placeAt(v.s, 0, _q); this.plaques.push(stakeSign(this.group, paint, p.x, p.y, p.z, Math.atan2(-q.dz, q.dx), `${n + 1} · ${v.name.toUpperCase()}`, { w: 2.3, h: 0.46, up: -0.39, back: '#0f3d2a' }).mesh); }
    });
    // ---- the top of the tower: a brazier of gold
    {
      const p = P(LENGTH + 0.9, 0, course().top);
      stone.tint(...PALE, 1).cylinder(p.x, p.y, p.z, 0.5, 0.36, 0.8, 10, { capTop: true });
      paint.tint(...GOLD, 1).place(p.x, p.y + 0.8, p.z).lathe([[0.2, 0], [0.62, 0.3], [0.7, 0.52], [0.6, 0.56], [0.001, 0.3]], 12).pop();
      glow.tint(1.6, 0.9, 0.3, 1).place(p.x, p.y + 1.25, p.z).lathe([[0.001, 0.75], [0.2, 0.42], [0.36, 0.12], [0.22, -0.02], [0.001, -0.02]], 8).pop();
      this.top = p;
    }
    const built = core.toMeshes(mats, { name: 'walls-ruin', layers: [LAYER.STATIC_CASTER, LAYER.REFLECT] });
    this.group.add(built);

    // ---- what moves. The blades: a pendulum each, hung from a beam out of the wall, red, swinging across the way
    const L = 4.4;
    this.blades = of('blade').map((t) => {
      const parts = new Parts(), b = parts.get('matte');
      // (a crescent on a rod — red, its edge white —, open above: what is behind it stays in sight)
      const cy = -L + 0.12, Ro = 0.9, Ri = 0.4, at2 = (r, a, z) => V(Math.cos(a) * r, cy + Math.sin(a) * r, z);
      b.tint(...DARK, 1).box(-0.05, cy - Ri, -0.05, 0.05, 0, 0.05);
      for (let m = 0; m < 12; m++) {
        const a0 = Math.PI * (1 + (0.5 + m) / 13 - 0.5 / 13), a1 = Math.PI * (1 + (1.5 + m) / 13 - 0.5 / 13), thin = (a) => Ri + (Ro - Ri) * (1 - Math.min(1, Math.abs(a - 1.5 * Math.PI) / (0.5 * Math.PI)) ** 3 * 0.85);
        for (const z of [-0.035, 0.035]) {
          const q = [at2(thin(a0), a0, z), at2(Ro - 0.07, a0, z), at2(Ro - 0.07, a1, z), at2(thin(a1), a1, z)], e = [at2(Ro - 0.07, a0, z), at2(Ro, a0, 0), at2(Ro, a1, 0), at2(Ro - 0.07, a1, z)];
          if (z > 0) { b.tint(...RED, 1).quad(q[0], q[1], q[2], q[3]); b.tint(...WHITE, 1).quad(e[0], e[1], e[2], e[3]); } else { b.tint(...RED, 1).quad(q[3], q[2], q[1], q[0]); b.tint(...WHITE, 1).quad(e[3], e[2], e[1], e[0]); }
        }
      }
      b.tint(...GOLD, 1).rod(V(0, cy - Ri - 0.02, -0.07), V(0, cy - Ri - 0.02, 0.07), 0.12, 8);
      const m = parts.toMeshes(mats, { name: 'walls-blade', layers: [] }), at = placeAt(t.s, t.mid, {}), y = S.base + t.y + L + 1.05;
      m.position.set(at.x, y, at.z); m.rotation.order = 'YXZ'; m.rotation.y = at.yaw; m.traverse((o) => { o.matrixAutoUpdate = true; });
      this.group.add(m);
      // (its beam, out of the wall — and a red line on the floor where it sweeps)
      const fixed = new Parts(), st = fixed.get('matte');
      st.tint(...DARK, 1).beam(P(t.s, -H - 0.2, t.y + L + 1.05), P(t.s, Math.max(t.mid, 0) + 0.5, t.y + L + 1.05), 0.2, 0.24);
      st.tint(...DARK, 1).beam(P(t.s, -H, t.y + L - 0.9), P(t.s, Math.max(t.mid, 0), t.y + L + 0.95), 0.12, 0.12);
      const F = floorAt(t.s, -1.3) > -Infinity ? [-H, floorAt(t.s, 0) > -Infinity ? OUT : -0.85] : null;
      if (F) for (let j = 0; j < 8; j++) { const u0 = lerp(F[0], F[1], j / 8), u1 = lerp(F[0], F[1], (j + 1) / 8); if (j % 2 === 0) st.tint(...RED, 1).quad(P(t.s - 0.12, u0, t.y + 0.014), P(t.s - 0.12, u1, t.y + 0.014), P(t.s + 0.12, u1, t.y + 0.014), P(t.s + 0.12, u0, t.y + 0.014)); }
      this.group.add(fixed.toMeshes(mats, { name: 'walls-blade-beam', layers: [LAYER.STATIC_CASTER] }));
      return { t, m, L };
    });
    // The spikes: a field of red points that comes up through a plate
    this.spikes = of('spikes').map((t) => {
      const parts = new Parts(), b = parts.get('matte'), at = placeAt((t.s0 + t.s1) / 2, 0, {}), len = t.s1 - t.s0;
      for (let z = -len / 2 + 0.22; z < len / 2; z += 0.4) for (let x = -H + 0.25; x < H; x += 0.42) { b.tint(...RED, 1).cylinder(x, 0, z, 0.1, 0.012, 0.55, 6, { capTop: false, capBottom: false }); }
      const m = parts.toMeshes(mats, { name: 'walls-spikes', layers: [] });
      m.position.set(at.x, S.base + t.y - 0.55, at.z); m.rotation.y = at.yaw; m.traverse((o) => { o.matrixAutoUpdate = true; });
      this.group.add(m);
      const fixed = new Parts(), st = fixed.get('matte');
      st.tint(...mul(DARK, 1.6), 1).quad(P(t.s0, -H, t.y + 0.01), P(t.s0, H, t.y + 0.01), P(t.s1, H, t.y + 0.01), P(t.s1, -H, t.y + 0.01));
      for (const [a, b2] of [[t.s0 - 0.14, t.s0], [t.s1, t.s1 + 0.14]]) st.tint(...RED, 1).quad(P(a, -H, t.y + 0.014), P(a, H, t.y + 0.014), P(b2, H, t.y + 0.014), P(b2, -H, t.y + 0.014));
      this.group.add(fixed.toMeshes(mats, { name: 'walls-spikes-plate', layers: [] }));
      return { t, m, y: S.base + t.y };
    });
    // The slabs that give way: pale, cracked, each a piece of its own — they tremble, then drop
    {
      const parts = new Parts(), b = parts.get('paving'), d = b;
      b.tint(...PALE, 1).box(-OUT + 0.04, -0.22, -0.62, H - 0.04, 0, 0.62);
      for (const [x0, z0, x1, z1] of [[-1.2, -0.5, -0.3, 0.1], [-0.3, 0.1, 0.2, -0.3], [0.2, -0.3, 1.1, 0.4], [-0.3, 0.1, -0.5, 0.55]]) d.tint(0.3, 0.24, 0.18, 1).beam(V(x0, 0.004, z0), V(x1, 0.004, z1), 0.05, 0.006);
      const proto = parts.toMeshes(mats, { name: 'walls-slab', layers: [] });
      this.slabs = of('floor', 'crumble').map((t) => {
        const m = proto.clone(), at = placeAt((t.s0 + t.s1) / 2, 0, {});
        m.position.set(at.x, S.base + t.y0, at.z); m.rotation.y = at.yaw; m.scale.set(1, 1, (t.s1 - t.s0) / 1.3); m.traverse((o) => { o.matrixAutoUpdate = true; });
        this.group.add(m);
        return { t, m, x: at.x, y: S.base + t.y0, z: at.z };
      });
    }
    // ---- the path one came by, shown while time winds back; a shadow under the runner
    this.trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.9, depthTest: false }));
    this.trail.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(424 * 3), 3));
    this.trail.frustumCulled = false; this.trail.visible = false; this.trail.renderOrder = 6; this.trail.name = 'walls-trail';
    this.group.add(this.trail);
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2; this.blob.visible = false; this.blob.renderOrder = 5; this.blob.name = 'walls-blob';
    this.group.add(this.blob);

    // ---- the gate, on the south beach, looking at the ruin; one's best time beside it
    const gx = S.gate.x, gz = S.gate.z, gy = this.data.heightAt(gx, gz), yaw = Math.atan2(C.x - gx, C.z - gz), gate = new Parts();
    gateArch(this.group, gate.get('paint'), gx, gy, gz, yaw, S.name.toUpperCase(), 'ALONG THE WALLS OF THE RUIN TO THE TOP OF ITS TOWER · A FALL WINDS TIME BACK', { width: 4, tone: [0.1, 0.4, 1.2] });
    this.group.add(gate.toMeshes(mats, { name: 'walls-gate', layers: [LAYER.STATIC_CASTER] }));
    this.board = canvasBoard(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#10243a'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 8; ctx.strokeRect(7, 7, w - 14, h - 14);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f2c14e'; ctx.font = '600 30px system-ui, sans-serif'; ctx.fillText('YOUR BEST TIME TO THE TOP', w / 2, 56, w * 0.9);
      ctx.fillStyle = '#ffffff'; ctx.font = '700 84px Georgia, serif'; ctx.fillText(this.best ? formatTime(this.best) : '—', w / 2, 138);
      ctx.fillStyle = '#c9d2ff'; ctx.font = '500 26px system-ui, sans-serif'; ctx.fillText(this.best ? 'from the first step, falls and all' : 'nobody has stood on the tower yet', w / 2, 214, w * 0.9);
    }, 1.7, 0.85, { both: true });
    const bx = gx + Math.cos(yaw) * 3.1 - Math.sin(yaw) * 0.6, bz = gz - Math.sin(yaw) * 3.1 - Math.cos(yaw) * 0.6;
    this.board.mesh.position.set(bx, this.data.heightAt(bx, bz) + 1.25, bz); this.board.mesh.rotation.y = yaw - 0.3; this.board.mesh.name = 'walls-board';
    this.group.add(this.board.mesh);
    this.gate = { x: gx, y: gy, z: gz, yaw };
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    this._place(this.clock() / 1000, null);
    return this;
  }

  /** This visitor's best time to the top (ms): what the board by the gate shows. */
  setBest(ms) { this.best = ms || 0; this.board?.redraw(); }
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.4 * 2.4; }

  /** Puts what moves where it is at `now` (s of the shared clock); the slabs, where the run `st` has left them. */
  _place(now, st) {
    for (const { t, m, L } of this.blades) { m.rotation.z = -Math.asin(clamp((bladeAt(t, now) - t.mid) / L, -1, 1)); m.updateMatrixWorld(true); }
    for (const { t, m, y } of this.spikes) { const k = spikesAt(t, now); m.position.y = y - 0.55 + 0.55 * k + (k > 0.1 && k < 0.2 ? Math.sin(now * 80) * 0.012 : 0); m.updateMatrixWorld(true); }
    for (const q of this.slabs) {
      const at = st ? trodAt(st, q.t.id) : undefined, age = at === undefined ? -1 : st.total - at, drop = age > S.crumble ? 0.5 * S.g * (age - S.crumble) ** 2 : 0;
      if (q.age === age && age < 0) continue;
      q.age = age;
      q.m.visible = drop < 30 && this.shown !== false;
      q.m.position.set(q.x, q.y - drop + (age >= 0 && !drop ? Math.sin(age * 90) * 0.025 : 0), q.z); q.m.rotation.z = drop * 0.04; q.m.updateMatrixWorld(true);
    }
  }

  /** Every frame: what moves is where the clock says — only while somebody is near enough to see it. */
  update(dt, time, cam) {
    const st = this.session?.state, d2 = cam ? (cam.position.x - C.x) ** 2 + (cam.position.z - C.z) ** 2 : 0, near = !!st || d2 < 110 * 110;
    // (the plaques of the saves and the slabs are small: drawn from near only)
    if (near !== this.shown) { this.shown = near; for (const m of this.plaques) m.visible = near; for (const q of this.slabs) q.m.visible = near; }
    if (!st && d2 > 320 * 320) return;
    this._place(st ? st.t0 + st.total : this.clock() / 1000, st);
  }

  /**
   * A run is asked for: the player is put at the start of the way, and stands there — the clock waits for the
   * first step. Returns the session — the driver of the player: step(dt, player, control), camera(camera, dt),
   * line, over (`score`: the time to the top, ms), ended, drop(player), close(), auto (true: it runs by itself).
   */
  open(player, io) {
    const st = startRun(this.clock() / 1000), events = [], input = { run: 0, side: 0, jump: false }, pose = {}, { saves } = course();
    const K = { acc: 0, camY: null, camU: 0, hall: 0, after: 0, lean: 0, hint: -1, rush: 0 };
    const _c = V(0, 0, 0), _l = V(0, 0, 0);
    const session = {
      walls: this, over: false, ended: false, score: 0, time: 0, line: '', riding: false, anim: ANIM.idle, state: st, auto: false,
      step: (dt, pl, control) => {
        const inp = pl.input;
        if (session.auto) {
          K.acc += Math.min(dt, 0.25);
          while (K.acc >= S.step && !st.over) { K.acc -= S.step; botInput(st, input); stepRun(st, S.step, input, events); }
        } else {
          // (the stick: up runs, down steps back, aside goes across — to the left is towards the wall; the button jumps)
          const mx = control ? inp.move.x : 0, my = control ? inp.move.y : 0;
          input.run = my > 0 ? clamp((my - 0.12) / 0.45, 0, 1) : clamp((my + 0.3) / 0.5, -1, 0); input.side = clamp(mx / 0.6, -1, 1); input.jump = control && !!inp.jump;
          if (!st.over) stepRun(st, dt, input, events);
        }
        for (const e of events) this._tell(e, st, io);
        events.length = 0;
        // (who hangs from a bar and does not know how to leave it is told, once a hang)
        if (st.mode === 'pole' && st.pt > 1.3 && K.hint !== st.pole && !session.auto) { K.hint = st.pole; io.note('Hanging from the bar — the jump button lets go, and throws you on.', 2600); } else if (st.mode !== 'pole') K.hint = -1;
        // ---- where the runner is, and how it holds itself
        placeAt(st.s, st.u, pose);
        const wind = st.mode === 'rewind', mode = wind ? st.rm : st.mode, down = st.down > 0;
        let x = pose.x, y = S.base + st.y, z = pose.z, yaw = pose.yaw, pitch = 0, roll = 0, anim = ANIM.idle;
        if (mode === 'wall') {
          // (along the wall: the feet on the stone, the body leaning out from it)
          const d = wind ? Math.sign(st.u) || -1 : st.side;
          roll = -d * 0.62; anim = ANIM.run; x += -pose.dz * d * 0.2; z += pose.dx * d * 0.2; y += 0.1;
        } else if (mode === 'climb') {
          // (up the stone: two or three steps on it, leaning back — then over its edge)
          const up = st.y < st.top - S.climb.hands + 1e-6 && !wind;
          pitch = up ? -1.05 : -0.5 * (1 - clamp(st.ct / S.climb.pull, 0, 1)); anim = up ? ANIM.run : ANIM.jump;
        } else if (mode === 'pole') {
          // (hanging from the bar, swinging under it)
          const a = Math.sin(st.pt * 6.5) * 0.75;
          pitch = a; anim = ANIM.jump; x += pose.dx * Math.sin(a) * 0.9; z += pose.dz * Math.sin(a) * 0.9; y += (1 - Math.cos(a)) * 0.6 - 0.4;
        } else if (mode === 'air') { anim = ANIM.jump; yaw -= clamp(st.vu / S.side, -1, 1) * 0.35; }
        else if (down) { anim = st.why === 'fall' ? ANIM.jump : ANIM.dead; }
        else {
          const v = Math.abs(st.vs);
          anim = st.over || st.wait > 0 ? ANIM.idle : v > 3.6 ? ANIM.run : v > 0.3 || Math.abs(st.vu) > 1 ? ANIM.walk : ANIM.idle;
          // (on a ledge one shuffles along, the back to the stone; else one turns a little the way one steers)
          if (onLedge(st)) { yaw -= 1.25; anim = v > 0.3 ? ANIM.walk : ANIM.idle; x += pose.dz * 0.12; z -= pose.dx * 0.12; } else yaw -= clamp(st.vu / S.side, -1, 1) * 0.3;
        }
        K.lean += (roll - K.lean) * Math.min(1, dt * 14);
        pl.pos.set(x, y, z); pl.yaw = yaw; pl.pitch = pitch; pl.roll = K.lean;
        pl.speed = wind || down || st.over || st.wait > 0 ? 0 : Math.max(Math.abs(st.vs), Math.abs(st.vu) * 0.6); pl.grounded = true;
        session.anim = anim;
        // (its shadow, on the floor under it — none over a gap)
        const G = floorAt(st.s, st.u, st);
        this.blob.visible = Number.isFinite(G) && G <= st.y + 0.4 && !down;
        if (this.blob.visible) { const k = clamp(1 - (st.y - G) / 4, 0.4, 1); this.blob.position.set(pose.x, S.base + G + 0.03, pose.z); this.blob.scale.setScalar(k); this.blob.updateMatrixWorld(true); }
        // (the path one came by, while time winds back)
        if (wind && !this.trail.visible) {
          const pos = this.trail.geometry.attributes.position, T = st.trail, n = Math.min(T.length, 424);
          for (let i = 0; i < n; i++) { const p = P(T[i].s, T[i].u, T[i].y + 0.7); pos.setXYZ(i, p.x, p.y, p.z); }
          pos.needsUpdate = true; this.trail.geometry.setDrawRange(0, n); this.trail.visible = true;
        } else if (!wind && this.trail.visible) this.trail.visible = false;
        if (st.over) { K.after += dt; if (!session.over) { session.over = true; session.score = session.time = st.time; } if (K.after > 3) session.ended = true; }
        const n = stretchOf(Math.max(st.s, saves[st.home].s)), left = `${'◆'.repeat(st.rew)}${'◇'.repeat(S.rewinds - st.rew)} rewinds`;
        session.line = st.over ? `${S.name} · the top of the tower in ${formatTime(st.time)} · ${st.outs ? `${st.outs} fall${st.outs > 1 ? 's' : ''}` : 'not one fall'}`
          : !st.going ? `${S.name} · the clock starts with your first step · ${left}`
            : `${n + 1} of ${saves.length} · ${S.names[n]} · ${formatTime(Math.round(st.clock * 1000))} · ${left} · ${Math.round(st.s)} of ${LENGTH} m`;
      },
      /**
       * The camera: behind the runner along the way, on the open side and above, looking ahead along the wall —
       * between two walls it comes in over the middle of the way. It follows the floor one stands on, not a jump.
       */
      camera: (cam, dt) => {
        const D = S.cam, h = hallAt(st.s), ground = st.mode === 'ground' || st.mode === 'climb' ? st.y : Math.max(st.gy, Math.min(st.y, st.gy + 4) - 1.2);
        if (K.camY === null || Math.abs(ground - K.camY) > 9) { K.camY = ground; K.camU = st.u; K.hall = h; }
        K.camY += (ground - K.camY) * Math.min(1, dt * 3.2);
        K.camU += (st.u - K.camU) * Math.min(1, dt * 4);
        K.hall += (h - K.hall) * Math.min(1, dt * 5);
        const out = lerp(D.out, D.hall.out, K.hall), up = lerp(D.up, D.hall.up, K.hall);
        placeAt(st.s - D.back, out + K.camU * 0.3, pose);
        _c.set(pose.x, S.base + K.camY + up, pose.z);
        placeAt(st.s + D.ahead, K.camU * 0.6 - 0.3 * (1 - K.hall), pose);
        _l.set(pose.x, S.base + K.camY + 1.1 + Math.max(0, st.y - K.camY) * 0.45, pose.z);
        cam.position.copy(_c); cam.up.set(0, 1, 0); cam.lookAt(_l);
        // (between two walls it looks wider; along a wall, and thrown from a bar, a little wider still: the rush of it)
        K.rush += ((st.mode === 'wall' || (st.mode === 'air' && st.vs > S.speed + 0.2) ? 1 : 0) - K.rush) * Math.min(1, dt * 5);
        return lerp(62, 72, K.hall) + 5 * K.rush;
      },
      /** The run is over (the top), or left: the player is put back at the gate. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x, this.gate.z, this.gate.yaw); session.close(); },
      close: () => { if (this.session === session) this.session = null; this.blob.visible = false; this.trail.visible = false; player.pitch = 0; player.roll = 0; this._place(this.clock() / 1000, null); },
    };
    this.session = session;
    session.step(0, player, false);
    return session;
  }

  _tell(e, st, io) {
    if (e.type === 'jump') io.play('jump', { volume: 0.5 });
    else if (e.type === 'kick') io.play('jump', { volume: 0.55, rate: 1.3 });
    else if (e.type === 'wall') io.play('land', { volume: 0.3, rate: 1.4 });
    else if (e.type === 'land' || e.type === 'up') io.play('land', { volume: 0.35 });
    else if (e.type === 'bar') io.play('land', { volume: 0.4, rate: 1.7 });
    else if (e.type === 'swing') io.play('jump', { volume: 0.6, rate: 0.8 });
    else if (e.type === 'go') io.play('start', { volume: 0.6 });
    else if (e.type === 'out') io.play(e.why === 'fall' ? 'fail' : 'hit');
    else if (e.type === 'rewind') { io.play('teleport', { volume: 0.6, rate: 1.5 }); io.note(`${WHY[st.why] || 'Out!'} Time winds back — ${e.left ? `${e.left} more in reserve` : 'that was the last in reserve'}.`, 1900); }
    else if (e.type === 'home') { io.play('respawn', { volume: 0.6 }); io.note(`${WHY[st.why] || 'Out!'} No rewind left: back to the save, the reserve full again.`, 2400); }
    else if (e.type === 'save') { io.play('checkpoint', { volume: 0.8 }); io.note(`Saved · ${e.n + 1} of ${S.names.length}: ${e.name} — three rewinds in reserve`, 2600); }
    else if (e.type === 'end') { io.play('victory', { volume: 0.7 }); io.note(`The top of the tower! ${formatTime(e.time)}`, 5000); }
  }
}
