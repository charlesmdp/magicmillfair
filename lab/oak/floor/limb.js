// Out on a Limb, tried again — one floor of it: its rules. No renderer here: the lab page, the checks and the
// climber that plays by itself all read this.
//
// What the first try asked — walking a round branch to the centimetre, under a camera lost in the leaves — is
// gone. Round an old snag, four limbs, each curling round it a little higher than the last:
//   · on a limb one cannot fall: one goes along it, forwards or back, and that is all;
//   · the game is the jump from limb to limb: a ring of light shows where it would end — green on a limb,
//     red in the net — and one still steers a little in the air;
//   · one limb sways, one is dead wood that cracks under who lingers on it;
//   · a net hangs under it all: a miss costs a few seconds, not the climb;
//   · the camera is put by the game, outside the tree: nothing ever comes between it and the climber.
// A plate at the foot of the first limb starts the clock, a bell at the end of the last stops it.
//
// Places are counted from the foot of the trunk: so far from its axis (m), so far round it (degrees, 0 towards
// the gate, growing the way one climbs), so high above the ground (m). Time advances in steps of 1/120 s
// whatever the frame rate.

export const LIMB = {
  name: 'Out on a Limb', place: 'The Old Snag',
  at: { x: -110, z: 162 }, // where the snag stands: in the clearing, behind the old tree
  trunk: { r: 1.7, top: 1.2, h: 12.5 },
  gate: { away: 12.5 }, // where one asks to climb, towards the old tree
  net: { y: 2.3, r: 9.5 },
  // each limb leaves the trunk and curls round it: what one walks is its curl, from `from` to `to` degrees, `r`
  // m from the axis, rising from the first height to the second
  limbs: [
  // (they keep to the sides away from the old tree, whose crown reaches over the gate: the camera stays in the open)
    { name: 'the first limb', from: 61, to: 105, r: 5.3, y: [4.0, 4.2] },
    { name: 'the limb that sways', from: 129, to: 171, r: 5.3, y: [4.95, 5.05], sway: { amp: 0.3, period: 2.8 } },
    { name: 'the dead limb', from: 195, to: 231, r: 5.3, y: [5.9, 5.95], dead: true },
    { name: 'the limb of the bell', from: 255, to: 299, r: 5.3, y: [6.85, 7.0], bell: true },
  ],
  step: 1 / 120,
  g: 15, jump: 6.5, // m/s², m/s up
  walk: 4.2, accel: 18, // m/s along a limb, and how fast one gets there (m/s²)
  air: 6, fly: 6.2, // m/s² of steering in the air; m/s over the ground at most
  catch: 0.8, under: 0.6, over: 0.1, // a limb catches who comes down within so far of its line (m), no lower than that under its top
  inner: 0.15, // m from where a limb begins: as far back as one goes on it
  crack: 1.3, back: 5, // s the dead limb holds; s before it has grown back
  held: 0.9, // s one lies in the net before being put back
};

const RAD = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

let laid = null;
/** The limbs, laid once: [{ ...limb, line: [{ x, y, z, s }] (metres from the foot of the trunk), length }]. */
export function limbs() {
  if (laid) return laid;
  laid = LIMB.limbs.map((limb, index) => {
    const line = [], n = Math.ceil((limb.to - limb.from) / 3);
    let s = 0;
    for (let k = 0; k <= n; k++) {
      // (0° is towards the gate, -z; one climbs towards the right of who looks at the tree from outside)
      const t = k / n, a = (limb.from + (limb.to - limb.from) * t) * RAD, q = { x: -limb.r * Math.sin(a), y: limb.y[0] + (limb.y[1] - limb.y[0]) * t, z: -limb.r * Math.cos(a), s: 0 };
      if (k) s += Math.hypot(q.x - line[k - 1].x, q.y - line[k - 1].y, q.z - line[k - 1].z);
      q.s = s;
      line.push(q);
    }
    return { ...limb, index, line, length: s };
  });
  return laid;
}

/** How far a limb is lifted by its swaying at `clock`, `s` metres along it (m). */
const swayAt = (limb, s, clock) => (limb.sway ? limb.sway.amp * Math.sin((clock / limb.sway.period) * Math.PI * 2) * (1 - 0.6 * (s / limb.length)) : 0); // (most where one lands on it)
/** The place of a limb `s` metres along it at `clock`: { x, y, z, tx, ty, tz (the way it goes) }, from the foot of the trunk. */
export function limbAt(limb, s, clock, out = {}) {
  const L = limb.line;
  s = clamp(s, 0, limb.length);
  let i = 0;
  while (i < L.length - 2 && L[i + 1].s < s) i++;
  const a = L[i], b = L[i + 1], span = b.s - a.s || 1, t = (s - a.s) / span;
  out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t + swayAt(limb, s, clock); out.z = a.z + (b.z - a.z) * t;
  out.tx = (b.x - a.x) / span; out.ty = (b.y - a.y) / span; out.tz = (b.z - a.z) / span;
  return out;
}

/** A climber on the plate at the foot of the first limb: see stepClimb. */
export function startClimb() {
  const st = { on: 0, s: LIMB.inner + 0.3, v: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, clock: 0, acc: 0, started: false, t0: 0, over: false, time: 0, last: 0, falls: 0, jumps: 0, net: 0, crack: -1, gone: -1, want: 0 };
  place(st);
  return st;
}
const _p = {};
function place(st) { const p = limbAt(limbs()[st.on], st.s, st.clock, _p); st.x = p.x; st.y = p.y; st.z = p.z; return p; }

/**
 * Advances a climb by `dt` seconds. `input`: { x, z (which way one pushes, over the ground: on a limb what of it
 * goes along the limb counts; in the air it steers), jump (true on the frame it is asked) }. `events`, when given,
 * is filled with what happened: { type: 'go' | 'jump' | 'land' (limb) | 'creak' | 'crack' | 'net' | 'back' (limb) |
 * 'bell' (time) }. Returns the climb.
 */
export function stepClimb(st, dt, input, events) {
  if (input?.jump) st.want = 0.12;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= LIMB.step && !st.over) { st.acc -= LIMB.step; sub(st, LIMB.step, input, events); }
  return st;
}

function sub(st, dt, input, events) {
  const P = LIMB, L = limbs(), ix = input?.x || 0, iz = input?.z || 0;
  st.clock += dt;
  if (st.want > 0) st.want -= dt;
  // ---- the dead limb: it cracks under who has stood on it long enough, and grows back
  if (st.crack >= 0 && st.clock >= st.crack) {
    st.crack = -1; st.gone = st.clock + P.back;
    events?.push({ type: 'crack' });
    if (st.on >= 0 && L[st.on].dead) { st.on = -1; st.vx = st.vz = 0; st.vy = -1; }
  }
  if (st.gone >= 0 && st.clock >= st.gone) st.gone = -1;
  // ---- in the net: held a moment, then put back at the foot of the limb one had left
  if (st.net > 0) {
    st.net -= dt;
    if (st.net <= 0) { st.on = L[st.last].dead && st.gone >= 0 ? st.last - 1 : st.last; st.s = P.inner + 0.3; st.v = 0; st.last = st.on; place(st); events?.push({ type: 'back', limb: st.on }); }
    return;
  }
  if (st.on >= 0) {
    // ---- on a limb: along it, as fast as one pushes that way; no further than its two ends
    const limb = L[st.on], p = limbAt(limb, st.s, st.clock, _p), flat = Math.hypot(p.tx, p.tz) || 1, hx = p.tx / flat, hz = p.tz / flat;
    const push = clamp(ix * hx + iz * hz, -1, 1), want = push * P.walk;
    st.v += clamp(want - st.v, -P.accel * dt, P.accel * dt);
    // (at an end one goes no further — but who runs at it and jumps keeps the speed they came with)
    st.s = clamp(st.s + st.v * dt, P.inner, limb.length - 0.12);
    if (!st.started && Math.abs(st.v) > 0.3) { st.started = true; st.t0 = st.clock; events?.push({ type: 'go' }); }
    if (Math.abs(st.v) > 0.3) st.yaw = Math.atan2(hx * Math.sign(st.v), hz * Math.sign(st.v));
    place(st);
    if (limb.bell && st.s >= limb.length - 0.6 && st.started) { st.over = true; st.time = Math.round((st.clock - st.t0) * 1000); events?.push({ type: 'bell', time: st.time }); return; }
    if (st.want > 0) {
      // a jump: up, and on the way one was going (from a standstill, the way one faces)
      const go = Math.abs(st.v) > 0.5 ? st.v : 0, fx = go ? hx : Math.sin(st.yaw), fz = go ? hz : Math.cos(st.yaw), v = go || 1.2;
      st.vx = fx * v; st.vz = fz * v; st.vy = P.jump; st.last = st.on; st.on = -1; st.want = 0; st.jumps++;
      if (!st.started) { st.started = true; st.t0 = st.clock; events?.push({ type: 'go' }); }
      events?.push({ type: 'jump' });
    }
    return;
  }
  // ---- in the air: steered a little, down onto a limb — or into the net
  st.vx += ix * P.air * dt; st.vz += iz * P.air * dt;
  const sp = Math.hypot(st.vx, st.vz);
  if (sp > P.fly) { st.vx *= P.fly / sp; st.vz *= P.fly / sp; }
  if (sp > 0.5) st.yaw = Math.atan2(st.vx, st.vz);
  st.vy -= P.g * dt;
  st.x += st.vx * dt; st.y += st.vy * dt; st.z += st.vz * dt;
  const hit = st.vy <= 0 ? limbUnder(st.x, st.y, st.z, st.clock, st.gone >= 0) : null;
  if (hit) {
    st.on = hit.limb.index; st.s = hit.s; st.v = 0; st.vx = st.vy = st.vz = 0;
    place(st);
    events?.push({ type: 'land', limb: st.on });
    if (hit.limb.dead && st.crack < 0) { st.crack = st.clock + P.crack; events?.push({ type: 'creak' }); }
    return;
  }
  if (st.y <= P.net.y) { st.y = P.net.y; st.vx = st.vy = st.vz = 0; st.net = P.held; st.falls++; events?.push({ type: 'net' }); }
}

const _hit = { limb: null, s: 0 }, _q = {};
/** The limb that catches someone whose feet are at (x, y, z), if any: { limb, s }. `broken`: the dead limb is gone. */
function limbUnder(x, y, z, clock, broken) {
  let best = null, least = LIMB.catch;
  for (const limb of limbs()) {
    if (limb.dead && broken) continue;
    for (let s = LIMB.inner; s <= limb.length; s += 0.2) {
      const p = limbAt(limb, s, clock, _q), d = Math.hypot(x - p.x, z - p.z);
      if (d < least && y <= p.y + LIMB.over && y >= p.y - LIMB.under) { least = d; best = limb; _hit.s = s; }
    }
  }
  if (!best) return null;
  _hit.limb = best;
  return _hit;
}

/**
 * Where a jump ends if nothing more is pressed: { ok (on a limb), limb (which), x, y, z } — for someone in the air,
 * or (`now`: true) for someone on a limb who would jump this instant. What the game marks with a ring of light.
 */
export function climbFall(st, now = false, out = {}) {
  const P = LIMB;
  let x = st.x, y = st.y, z = st.z, vx = st.vx, vy = st.vy, vz = st.vz;
  if (st.on >= 0) {
    if (!now) return null;
    const p = limbAt(limbs()[st.on], st.s, st.clock, _p), flat = Math.hypot(p.tx, p.tz) || 1, go = Math.abs(st.v) > 0.5 ? st.v : 0, v = go || 1.2;
    vx = (go ? p.tx / flat : Math.sin(st.yaw)) * v; vz = (go ? p.tz / flat : Math.cos(st.yaw)) * v; vy = P.jump;
  } else if (st.net > 0) return null;
  for (let t = 0, dt = 1 / 60; t < 3; t += dt) {
    vy -= P.g * dt; x += vx * dt; y += vy * dt; z += vz * dt;
    const hit = vy <= 0 ? limbUnder(x, y, z, st.clock + t, st.gone >= 0) : null;
    if (hit && !(st.on >= 0 && hit.limb.index === st.on)) { const p = limbAt(hit.limb, hit.s, st.clock + t, _q); out.ok = true; out.limb = hit.limb.index; out.x = p.x; out.y = p.y; out.z = p.z; return out; }
    if (y <= P.net.y) { out.ok = false; out.limb = -1; out.x = x; out.y = P.net.y; out.z = z; return out; }
  }
  return null;
}

/**
 * A climber that plays by itself — the proof that the floor can be climbed. It goes along each limb, and jumps
 * the moment a jump would end on the next. Returns the input for stepClimb.
 */
export function botInput(st, out = { x: 0, z: 0, jump: false }) {
  out.x = 0; out.z = 0; out.jump = false;
  if (st.on < 0 || st.over || st.net > 0) return out;
  const limb = limbs()[st.on], p = limbAt(limb, st.s, st.clock, _p), flat = Math.hypot(p.tx, p.tz) || 1;
  out.x = p.tx / flat; out.z = p.tz / flat;
  if (limb.bell) return out;
  const end = climbFall(st, true, _f);
  if (end && end.ok && end.limb === st.on + 1 && Math.abs(st.v) > LIMB.walk * 0.9) out.jump = true;
  return out;
}
const _f = {};

/** Climbs the floor with the bot: { time (ms), falls, jumps, over }. */
export function botClimb(limit = 120) {
  const st = startClimb(), input = { x: 0, z: 0, jump: false };
  for (let t = 0; t < limit && !st.over; t += LIMB.step) { botInput(st, input); stepClimb(st, LIMB.step, input, null); }
  return { time: st.time, falls: st.falls, jumps: st.jumps, over: st.over };
}
