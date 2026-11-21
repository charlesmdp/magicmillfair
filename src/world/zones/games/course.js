// The course of the Sky Stones, worked out from the way the avatar really jumps (see PlayerController): each
// jump asks for a share of what a careful jump can do — a third at the foot, all of it near the top (where the
// take-off must be within half a metre of the edge of the stone).
// No dependency on the renderer: the tests walk the same course.
import { CLIMB } from '../../layout/layout.js';

const RUN = 8.2, JUMP = 5.4, GRAVITY = 15; // as in PlayerController
const lerp = (a, b, t) => a + (b - a) * t;
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** How far a running jump carries, after `runup` metres to gather speed, when landing `rise` metres higher. */
export function reach(runup, rise) {
  const dt = 1 / 240;
  let x = 0, v = 0;
  for (let t = 0; x < runup && t < 3; t += dt) { v += (RUN - v) * (1 - Math.exp(-dt * 11)); x += v * dt; }
  const disc = JUMP * JUMP - 2 * GRAVITY * rise;
  if (disc < 0) return 0;
  const T = (JUMP + Math.sqrt(disc)) / GRAVITY;
  let d = 0;
  for (let s = 0; s < T; s += dt) { v += (RUN - v) * (1 - Math.exp(-dt * 3)); d += v * dt; }
  return d;
}

/** How thick a stone is (rest platforms are slabs). */
export const stoneDepth = (st) => (st.beam ? 0.3 : st.top || st.rest ? 0.9 : 0.4 + st.r * 0.55);

/**
 * The stones, from the lawn to the top:
 * [{ x, y, z, r, s (0 at the foot, 1 at the top), ratio (how hard the jump to it is), rest?, top?, beam?: { yaw, half, hw } }].
 */
export function climbCourse() {
  const rnd = mulberry32(7741), C = CLIMB, H = C.height, out = [];
  const a0 = -Math.PI / 2 + 0.35;
  let x = C.x + Math.cos(a0) * 9.5, z = C.z + Math.sin(a0) * 9.5, y = C.y + 0.5;
  out.push({ x, y, z, r: 1.75, s: 0, ratio: 0 });
  // where the next jump starts: the edge of what one stands on, the room there is to run; after a plank, its axis
  let edge = 1.75, runup = 2 * 1.75 - 0.35, count = 0, nextRest = 0.25, sinceBeam = 0, axis = null;
  // would a stone there be in the way of those already laid (or they in the way of the jump to it)?
  const clash = (st, fx, fz) => {
    for (let i = 0; i < out.length - 1; i++) {
      const o = out[i], dy = st.y - o.y;
      // the stones one has just left are only in the way if the new one sits on them
      if (i >= out.length - 4) { if (Math.hypot(o.x - st.x, o.z - st.z) < o.r + st.r + 0.3) return true; continue; }
      if (Math.abs(dy) > 3.0 + stoneDepth(dy > 0 ? st : o)) continue; // room for someone standing and jumping
      const dx = st.x - fx, dz = st.z - fz, l2 = dx * dx + dz * dz || 1;
      let t = ((o.x - fx) * dx + (o.z - fz) * dz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (Math.hypot(o.x - fx - dx * t, o.z - fz - dz * t) < o.r + st.r + 1.0) return true;
    }
    return false;
  };
  while (y < C.y + H - 0.62) {
    const s = (y - C.y) / H;
    count++; sinceBeam++;
    const rest = s >= nextRest;
    const beam = !rest && !axis && s > 0.22 && sinceBeam >= 8 && rnd() < 0.5;
    const r2 = rest ? 2.2 : lerp(1.6, 0.5, s ** 0.8) * (0.92 + 0.16 * rnd());
    let rise = s < 0.1 ? 0.42 + 0.14 * rnd() : 0.5 + 0.32 * rnd();
    if (!rest && !beam && !axis && s > 0.4 && rnd() < 0.14) rise = -0.2 - 0.3 * rnd(); // a step down: harder to judge
    // the crux before each rest, then an easy jump onto it
    const crux = !rest && nextRest - s < 0.012;
    const ratio = Math.min(1.0, lerp(0.3, 0.98, s ** 1.25) * (rest ? 0.75 : crux ? 1.05 : 0.95 + 0.1 * rnd()));
    const gap = Math.max(0.5, ratio * (reach(runup, Math.max(rise, 0)) - 0.12));
    // which way: round the middle of the lawn, weaving in and out; straight on after a plank (one runs along it)
    const rho = Math.hypot(x - C.x, z - C.z) || 1, ex = (x - C.x) / rho, ez = (z - C.z) / rho;
    const want = 8.8 + 1.6 * Math.sin(count * 0.37) + (count % 2 ? 1 : -1) * lerp(0.2, 0.6, s);
    const drift = Math.max(-0.75, Math.min(0.75, (want - rho) / 3));
    const base = axis ? Math.atan2(axis[0], axis[1]) : Math.atan2(-ez + ex * drift, ex + ez * drift);
    const half = beam ? 1.6 + 0.9 * rnd() : 0, size = beam ? half : r2;
    let placed = null;
    // (the wanted heading first, then a little more to either side; closer if nothing else will do)
    for (let shrink = 1; shrink > 0.55 && !placed; shrink -= 0.12) {
      const d = (beam ? gap * 0.8 : gap) * shrink + edge + size;
      for (let k = 0; k < (axis ? 7 : 15) && !placed; k++) {
        const a = base + (k ? (k % 2 ? 1 : -1) * 0.14 * Math.ceil(k / 2) : 0);
        const hx = Math.sin(a), hz = Math.cos(a);
        const st = { x: x + hx * d, y: y + rise, z: z + hz * d, r: size };
        if (beam) st.beam = true; else if (rest) st.rest = true;
        const nrho = Math.hypot(st.x - C.x, st.z - C.z);
        if (nrho + size > C.r - 0.4 || nrho < 4.2) continue;
        // (a plank must leave room for the stone that follows it, straight on)
        if (beam && Math.hypot(st.x + hx * (half + 4.6) - C.x, st.z + hz * (half + 4.6) - C.z) > C.r - 2.2) continue;
        if (clash(st, x, z)) continue;
        placed = { st, hx, hz };
      }
    }
    if (!placed) throw new Error(`Sky Stones: no room for stone ${count}`);
    const { st, hx, hz } = placed;
    y += rise;
    st.s = (y - C.y) / H; st.ratio = ratio;
    out.push(st);
    if (beam) {
      // a plank to walk along: narrow, and the next jump starts from its far end, straight on
      st.beam = { yaw: Math.atan2(hx, hz), half, hw: lerp(0.3, 0.2, s) };
      x = st.x + hx * half; z = st.z + hz * half;
      edge = 0; runup = 2 * half - 0.3; sinceBeam = 0; axis = [hx, hz];
      continue;
    }
    if (rest) nextRest += 0.25;
    x = st.x; z = st.z; edge = r2; runup = 2 * r2 - 0.35; axis = null;
  }
  // the top: a wide platform, one last honest jump away, towards the middle of the lawn
  {
    const rho = Math.hypot(x - C.x, z - C.z) || 1, ex = (x - C.x) / rho, ez = (z - C.z) / rho;
    const top = Math.max(C.y + H, y - 0.2), rise = top - y, R = 2.8;
    const d = 0.6 * (reach(runup, Math.max(rise, 0)) - 0.12) + edge + R;
    let hx = -ez - ex * 0.9, hz = ex - ez * 0.9;
    const hl = Math.hypot(hx, hz); hx /= hl; hz /= hl;
    out.push({ x: x + hx * d, y: top, z: z + hz * d, r: R, s: 1, ratio: 0.6, top: true });
  }
  return out;
}

export const formatTime = (ms) => { const t = Math.max(0, ms) / 1000, m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(2).padStart(5, '0')}`; };
