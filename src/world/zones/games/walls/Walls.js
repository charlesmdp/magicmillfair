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
import { WALLS, LENGTH, PLAN, course, placeAt, floorAt, hallAt, stretchOf, bladeAt, spikesAt, startRun, stepRun, botInput, trodAt } from './rules.js';

const S = WALLS, H = S.half, C = S.at, TAU = Math.PI * 2;
const OUT = H + 0.4; // the outer edge of the way: its kerb
const DEEP = -S.base - 1; // under the rock
// the top of the wall on the left of each side, and what is under the way there: the rock, or the terrace of the lap outside
const TOPS = [7, 11, 14.9, 14.9, 17, 27.5, 27.5, 27.5, 27.5], UNDER = [DEEP, DEEP, DEEP, DEEP, 7, 11, 14.9, 14.9, 17];
const SAND = [1.22, 1.04, 0.76], PALE = [1.42, 1.27, 0.98], DUSK = [0.86, 0.7, 0.5], BLUE = [0.1, 0.4, 1.35], SKY = [0.55, 0.85, 1.5], GREEN = [0.1, 0.8, 0.36], LIME = [0.6, 1.4, 0.5], RED = [1.25, 0.08, 0.08], GOLD = [1.7, 1.2, 0.18], WHITE = [1.6, 1.55, 1.45], DARK = [0.16, 0.13, 0.11];
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
    const stone = core.get('paving'), pave = stone, paint = core.get('matte'), rock = core.get('rock'), glow = core.get('glow');
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

    // ---- the rock it stands on: out of the sea, flat enough on top
    {
      const N = 40, A = 30, B = 36, ring = (k, y, j) => Array.from({ length: N }, (_, i) => { const a = (i / N) * TAU, r = k * (1 + 0.07 * Math.sin(i * 2.3 + j) + 0.05 * Math.sin(i * 5.1 + 1.7)) / Math.pow(Math.abs(Math.cos(a) / A) ** 4 + Math.abs(Math.sin(a) / B) ** 4, 0.25); return V(C.x + Math.cos(a) * r, y + 0.5 * Math.sin(i * 3.1 + j), C.z + Math.sin(a) * r); });
      const rings = [ring(0.86, 1.6, 0), ring(0.98, 0.5, 1), ring(1.08, -2.5, 2), ring(1.3, -9.5, 3)], tones = [[1.25, 1.12, 0.92], [1.0, 0.9, 0.76], [0.8, 0.74, 0.66], [0.6, 0.58, 0.56]];
      for (let j = 0; j + 1 < rings.length; j++) for (let i = 0; i < N; i++) { const i1 = (i + 1) % N; rock.quad(rings[j + 1][i1], rings[j + 1][i], rings[j][i], rings[j][i1], { colors: [mul(tones[j + 1], 1), mul(tones[j + 1], 1), mul(tones[j], 1), mul(tones[j], 1)] }); }
      const mid = V(C.x, 1.9, C.z);
      for (let i = 0; i < N; i++) rock.tint(...tones[0], 1).tri(mid, rings[0][(i + 1) % N], rings[0][i]);
    }

    // ---- the wall on the left of every side, its terrace, its parapet; a round turret at every corner
    PLAN.forEach((p, i) => {
      const k = i >> 1;
      if (p.kind === 'line') {
        const T = TOPS[k], lo = UNDER[k] - 0.3, s1 = Math.min(p.s1, LENGTH + 2.2), keep = k >= 5, back = keep ? 9.5 : 3.75;
        wallFace(stone, p.s0, s1, -H, lo, T, 1, SAND, { seed: k });
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
        const T = Math.max(TOPS[k], TOPS[k + 1]) + 2.6, lo = Math.min(UNDER[k], UNDER[k + 1]) - 0.3, c = placeAt(p.s0, -S.plan.r, _q), r = S.plan.r - H, n = Math.round((T - lo) / 0.9);
        for (let j = 0; j < n; j++) stone.tint(...mul(SAND, (0.72 + 0.34 * Math.min(1, (j / n) * 1.6)) * (0.92 + 0.14 * hash(j + k * 9)))).cylinder(c.x, S.base + lo + ((T - lo) * j) / n, c.z, r, r, (T - lo) / n, 22, { capTop: false, capBottom: false });
        stone.tint(...PALE, 1).cylinder(c.x, S.base + T - 0.7, c.z, r + 0.22, r + 0.22, 0.45, 22, { capTop: true });
        stone.tint(...mul(SAND, 0.9), 1).cylinder(c.x, S.base + T - 0.25, c.z, r, r, 0.01, 22, { capTop: true });
        // (a broken crown of merlons)
        for (let m = 0; m < 9; m++) if (hash(m * 3.3 + k) > 0.28) { const a = (m / 9) * TAU, h = 0.7 + 0.6 * hash(m + k * 5); stone.tint(...PALE, 1).place(c.x + Math.cos(a) * (r - 0.1), S.base + T - 0.25, c.z + Math.sin(a) * (r - 0.1), -a).box(-0.3, 0, -0.55, 0.3, h, 0.55).pop(); }
      }
    });
    // ---- the keep's roof ends in a ruined tower beyond the last floor: a drum, a dark door, a broken crown, a flag
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
      const pa = before(t), pb = after(t);
      if (!pa || pa.y1 < t.y0 - 0.01 || pa.form === 'crumble' || pa.form === 'ledge') cross(stone, t.s0, -H, OUT, pa && pa.form !== 'crumble' && pa.form !== 'ledge' ? pa.y1 : lo(t.s0), t.y0, -1, SAND, 0.5, 1);
      if (!pb || pb.form === 'crumble' || pb.form === 'ledge') cross(stone, s1, -H, OUT, lo(s1), t.y0, 1, DUSK, 0.5, 1);
    }
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
    // ---- the saves: a line of gold and white across the way, a banner on a mast, a sign
    saves.forEach((v, n) => {
      for (let j = 0; j < 8; j++) { const u0 = -H + ((H + OUT) * j) / 8, u1 = -H + ((H + OUT) * (j + 1)) / 8; top(paint, v.s - 0.16, v.s + 0.16, u0, u1, v.y + 0.012, j % 2 ? GOLD : WHITE); }
      // (a banner of gold cloth down the wall, and a sign that stands out from it over the way: the open side stays clear)
      wallFace(paint, v.s - 0.45, v.s + 0.45, -H + 0.04, v.y + 1.2, v.y + 3.9, 1, GOLD, { plain: true });
      wallFace(paint, v.s - 0.45, v.s + 0.45, -H + 0.05, v.y + 3.55, v.y + 3.9, 1, WHITE, { plain: true });
      paint.tint(...GOLD, 1).tri(P(v.s - 0.45, -H + 0.04, v.y + 1.2), P(v.s, -H + 0.04, v.y + 0.75), P(v.s + 0.45, -H + 0.04, v.y + 1.2));
      if (n) { const p = P(v.s + 0.6, -H + 1.25, v.y + 3.92); paint.tint(...DARK, 1).beam(P(v.s + 0.6, -H, v.y + 4.05), P(v.s + 0.6, -H + 2.4, v.y + 4.05), 0.07, 0.07); stakeSign(this.group, paint, p.x, p.y, p.z, placeAt(v.s, 0, _q).yaw + Math.PI, `SAVE ${n + 1} · ${v.name.toUpperCase()}`, { w: 2.1, h: 0.46, up: -0.17, back: '#0f3d2a' }); }
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
      b.tint(...DARK, 1).box(-0.05, -L + 0.5, -0.05, 0.05, 0, 0.05);
      b.tint(...RED, 1).rod(V(0, -L, -0.05), V(0, -L, 0.05), 0.78, 18);
      b.tint(...WHITE, 1).rod(V(0, -L, -0.06), V(0, -L, 0.06), 0.3, 12);
      for (let m = 0; m < 10; m++) { const a = (m / 10) * TAU; b.tint(...WHITE, 1).place(Math.cos(a) * 0.78, -L + Math.sin(a) * 0.78, 0, 0, 0, a).box(-0.05, -0.1, -0.03, 0.2, 0.1, 0.03).pop(); }
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
      const parts = new Parts(), b = parts.get('paving'), d = parts.get('matte');
      b.tint(...PALE, 1).box(-OUT + 0.04, -0.22, -0.62, H - 0.04, 0, 0.62);
      for (const [x0, z0, x1, z1] of [[-1.2, -0.5, -0.3, 0.1], [-0.3, 0.1, 0.2, -0.3], [0.2, -0.3, 1.1, 0.4], [-0.3, 0.1, -0.5, 0.55]]) d.tint(0.5, 0.4, 0.3, 1).beam(V(x0, 0.004, z0), V(x1, 0.004, z1), 0.05, 0.006);
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
      q.m.visible = drop < 30;
      q.m.position.set(q.x, q.y - drop + (age >= 0 && !drop ? Math.sin(age * 90) * 0.025 : 0), q.z); q.m.rotation.z = drop * 0.04; q.m.updateMatrixWorld(true);
    }
  }

  /** Every frame: what moves is where the clock says — only while somebody is near enough to see it. */
  update(dt, time, cam) {
    const st = this.session?.state;
    if (!st && cam && (cam.position.x - C.x) ** 2 + (cam.position.z - C.z) ** 2 > 320 * 320) return;
    this._place(st ? st.t0 + st.total : this.clock() / 1000, st);
  }

  /**
   * A run is asked for: the player is put at the start of the way, and stands there — the clock waits for the
   * first step. Returns the session — the driver of the player: step(dt, player, control), camera(camera, dt),
   * line, over (`score`: the time to the top, ms), ended, drop(player), close(), auto (true: it runs by itself).
   */
  open(player, io) {
    const st = startRun(this.clock() / 1000), events = [], input = { run: 0, side: 0, jump: false }, pose = {}, { saves } = course();
    const K = { acc: 0, camY: null, camU: 0, hall: 0, after: 0, spin: 0, lean: 0 };
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
        // ---- where the runner is, and how it holds itself
        placeAt(st.s, st.u, pose);
        const wind = st.mode === 'rewind', mode = wind ? st.rm : st.mode, down = st.down > 0;
        let x = pose.x, y = S.base + st.y, z = pose.z, yaw = pose.yaw, pitch = 0, roll = 0, anim = ANIM.idle;
        if (mode === 'wall') {
          // (along the wall: the feet on the stone, the body leaning out from it)
          const d = wind ? Math.sign(st.u) || -1 : st.side;
          roll = d * 0.62; anim = ANIM.run; x += -pose.dz * d * 0.12; z += pose.dx * d * 0.12; y += 0.1;
        } else if (mode === 'climb') {
          // (up the stone: two or three steps on it, leaning back — then over its edge)
          const up = st.y < st.top - S.climb.hands + 1e-6 && !wind;
          pitch = up ? -1.05 : -0.5 * (1 - clamp(st.ct / S.climb.pull, 0, 1)); anim = up ? ANIM.run : ANIM.jump;
        } else if (mode === 'pole') {
          // (hanging from the bar, swinging under it)
          const a = Math.sin(st.pt * 6.5) * 0.75;
          pitch = a; anim = ANIM.jump; x += pose.dx * Math.sin(a) * 0.9; z += pose.dz * Math.sin(a) * 0.9; y += (1 - Math.cos(a)) * 0.6;
        } else if (mode === 'air') { anim = ANIM.jump; yaw -= clamp(st.vu / S.side, -1, 1) * 0.35; }
        else if (down) { anim = st.why === 'fall' ? ANIM.jump : ANIM.dead; }
        else {
          const v = Math.abs(st.vs);
          anim = st.over || st.wait > 0 ? ANIM.idle : v > 3.6 ? ANIM.run : v > 0.3 || Math.abs(st.vu) > 1 ? ANIM.walk : ANIM.idle;
          yaw -= clamp(st.vu / S.side, -1, 1) * 0.3;
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
        return 62;
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
