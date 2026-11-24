// The Endless Pond: its rules. No renderer here: the game, its checks and the bot that proves it can be played
// all read this.
//
// Three circuits on the Great Pond, one after the other. On each one runs round and round without stopping —
// the legs do it — on stones that never move and on rafts of logs that drift, and jumps the gaps.
//   The First Pond   one ring of stones, one arm that turns: a low beam, jumped. Fifteen seconds of it, and the
//                    way to the next pond opens: one runs out along a line of stones by oneself.
//   The Second Pond  two rings: stones outside, rafts inside (the shorter way round), an arm for each — a
//                    curtain that turns over the stones, slid under, and a gate that swings over the rafts,
//                    neither jumped nor slid under: one steps out to the stones when it comes. And a stretch of
//                    the stones is missing, far too long to jump: there one steps in to the rafts. Twenty seconds.
//   The Last Pond    three rings, four arms, and it goes faster and faster: there one holds as long as one can.
// One never starts anywhere but on the first pond. One changes ring with a step to the side, jumps (a second
// jump in the air carries further), dives back down when a jump would carry too far, slides. Fireflies hang
// over the rings: three of them caught make a lily pad, and a lily pad puts back on the circuit, once, who
// falls in. The run ends in the water; what it is worth is how long one held (the ways between ponds are not
// counted). What moves — the rafts, the arms, the fireflies — moves by the clock of the world, the same for all.
//
// Places are angles about the middle of a circuit (radians, growing the way one runs); time advances in steps
// of 1/120 s whatever the frame rate.
import { PONDS } from '../../../layout/layout.js';

const TAU = Math.PI * 2;
export const POND = {
  name: 'The Endless Pond',
  level: PONDS[0].level, // the water
  top: 0.24, // how far over the water one runs
  step: 1 / 120,
  g: 20, jump: 5.6, again: 5.0, dive: -9, // m/s²; m/s up on a jump, on a second one in the air; down on a dive
  slide: 0.45, rest: 0.2, // s a slide lasts (a jump ends it), and before the next
  swap: 0.26, hop: 0.26, // s a step to another ring takes, and how high it goes (m)
  edge: 0.2, // m: how far over the edge of a stone a foot may still be
  beam: 0.13, body: 0.22, // half the thickness of an arm; half a runner's
  clear: 0.5, over: 1.34, // m: how high the feet must be to clear a low arm; and to go over a high one
  fly: { every: 9, high: 1.0, near: 0.75, lily: 3, most: 3 }, // a firefly moves every so many s; how high it hangs; how near one catches it; how many make a lily pad; lily pads kept at most
  safe: 1.2, // s after being put back by a lily pad during which nothing can happen
  grace: 1.0, // s on coming onto a pond during which nothing can happen either (an arm may be right there)
  haste: 1.7, bridge: 6.5, // on the way out of a pond one runs so much faster; and so fast along the stones to the next (m/s)
  from: [-126.4, 74.0], // the bank one comes from: the jetty leads from there to the first pond
  // Each pond: its middle, how long one runs on it (s; the last: as long as one can), how fast (m/s at first; how
  // much more each lap — or, on the last, each second; never more than), its rings from the outside in — stones
  // (so many places, and which are missing) or rafts (so many, each so long in radians, drifting so fast in
  // rad/s) — and its arms: 'low' (jumped), 'high' (slid under, or jumped very high), 'wall' (neither: one is on
  // another ring when it comes). An arm turns (`turn` rad/s from `phase`) or swings (`swing`: about which
  // angle, how far each way, how fast), and reaches from `near` to `far` metres from the middle.
  ponds: [
    {
      name: 'The First Pond', x: -130.5, z: 69.5, time: 15, speed: [4.6, 0, 4.6],
      rings: [{ r: 4.0, stones: 14, holes: [3, 7, 11] }],
      arms: [{ kind: 'low', turn: -0.45, phase: 4.2, near: 0.8, far: 4.9 }],
    },
    {
      name: 'The Second Pond', x: -124.5, z: 56, time: 20, speed: [5.2, 0.045, 7],
      rings: [{ r: 6.8, stones: 24, holes: [1, 4, 19, 20, 21, 22, 23] }, { r: 4.9, rafts: 5, raft: 0.92, drift: -0.16 }], // (whole where the gate swings, and for a good run before the long gap)
      arms: [
        { kind: 'high', turn: -0.5, phase: 5.0, near: 5.85, far: 7.7 },
        { kind: 'wall', swing: [2.9, 0.9, 0.55], near: 4.0, far: 5.85 }, // (it swings where the stones are whole: one steps out, and back in before the stones stop)
      ],
    },
    {
      name: 'The Last Pond', x: -116.5, z: 31, time: Infinity, speed: [5.6, 0.011, 13], perSecond: true,
      rings: [{ r: 8.8, stones: 31, holes: [3, 8, 13, 17, 22, 23, 24, 25, 26, 29] }, { r: 6.7, rafts: 6, raft: 0.74, drift: -0.14 }, { r: 4.6, rafts: 4, raft: 1.05, drift: 0.2 }],
      arms: [
        { kind: 'low', turn: 0.3, phase: 1.0, near: 3.7, far: 7.6 },
        { kind: 'high', turn: -0.45, phase: 4.0, near: 7.8, far: 9.7 }, // (over the stones only: where they are missing, the rafts are not under two arms at once)
        { kind: 'wall', swing: [5.3, 0.9, 0.5], near: 3.7, far: 5.6 },
        { kind: 'wall', swing: [0.6, 0.8, 0.42], near: 7.9, far: 9.7 },
      ],
    },
  ],
};

const wrap = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };
/** The difference between two angles, from -π to π. */
const turnTo = (from, to) => { let d = (to - from) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

let ways = null;
/**
 * The ways between the ponds, worked out once: for pond `n`, { out (the angle one leaves it by), in (the angle
 * one comes onto it by), length (of the line of stones to the next), dx, dz (its direction) }.
 */
export function waysOf() {
  if (ways) return ways;
  const P = POND.ponds;
  ways = P.map((p, n) => {
    const q = P[n + 1], prev = P[n - 1], w = { out: 0, in: 0, length: 0, dx: 0, dz: 0 };
    if (q) { const d = Math.hypot(q.x - p.x, q.z - p.z); w.out = wrap(Math.atan2(q.z - p.z, q.x - p.x)); w.dx = (q.x - p.x) / d; w.dz = (q.z - p.z) / d; w.length = d - p.rings[0].r - q.rings[0].r; }
    w.in = prev ? wrap(Math.atan2(prev.z - p.z, prev.x - p.x)) : wrap(Math.atan2(POND.from[1] - p.z, POND.from[0] - p.x));
    return w;
  });
  return ways;
}

/** How fast one runs on a pond: on lap `lap` of it (0 for the first), `t` seconds into it; m/s. */
export const speedAt = (pond, lap, t = 0) => Math.min(pond.speed[2], pond.speed[0] * (1 + pond.speed[1] * (pond.perSecond ? t : lap)));
/** How far round the rafts of a ring have drifted at `clock` seconds of the world's clock (radians). */
export const driftAt = (ring, clock) => (ring.drift || 0) * clock;
/** Where an arm points at `clock` (radians). */
export const armAt = (arm, clock) => (arm.swing ? arm.swing[0] + arm.swing[1] * Math.sin(arm.swing[2] * clock) : arm.phase + arm.turn * clock);
/** The firefly of the moment over a pond: { n, a, ring } — it moves every few seconds. */
export function fireflyAt(pond, clock, out = {}) {
  const n = Math.floor(clock / POND.fly.every);
  out.n = n; out.a = hash(n) * TAU; out.ring = Math.min(pond.rings.length - 1, Math.floor(hash(n + 0.37) * pond.rings.length));
  return out;
}

/** Is there something to run on at angle `a` of a ring of a pond at `clock`? `slack`: how far over an edge a foot may be (m). */
export function support(pond, ring, a, clock, slack = POND.edge) {
  const R = pond.rings[ring], give = slack / R.r;
  if (R.stones) {
    // a stone fills its place; the missing ones leave a gap from edge to edge
    const slot = TAU / R.stones;
    for (const k of [Math.floor(wrap(a + give) / slot) % R.stones, Math.floor(wrap(a - give) / slot) % R.stones, Math.floor(wrap(a) / slot) % R.stones]) if (!R.holes.includes(k)) return true;
    return false;
  }
  const pitch = TAU / R.rafts, rel = wrap(a - driftAt(R, clock)) % pitch; // (each raft begins a pitch after the last)
  return rel <= R.raft + give || rel >= pitch - give;
}

/**
 * A runner on the first stone of the first pond, not yet gone: see stepRun. `clock`: the clock of the world at
 * that moment (s) — what moves on the ponds moves by it. `stage`: the pond to begin on (the game always begins
 * on the first; the checks begin where they need to).
 */
export function startRun(clock = 0, stage = 0) {
  return {
    stage, mode: 'run', t: 0, held: 0, u: 0,
    a: waysOf()[stage].in, turned: 0, ring: 0, to: 0, swap: 0, h: 0, vh: 0, jumps: 0, slide: -1, safe: POND.grace, lap: 0, v: POND.ponds[stage].speed[0],
    flies: 0, lilies: 0, caught: -1, saved: 0, clock: 0, t0: clock, acc: 0, over: false, time: 0, laps: 0, why: '',
    want: { jump: 0, down: 0, side: 0 },
  };
}

/**
 * Advances a run by `dt` seconds. `input`: { jump, down (true on the frame they are asked), side (-1 towards the
 * outside, 1 towards the middle, on the frame it is asked) }. `events`, when given, is filled with what happened:
 * { type: 'jump' | 'again' (the second jump) | 'dive' | 'land' | 'slide' | 'swap' | 'lap' (lap, v) | 'fly' (flies)
 * | 'lily' (a lily pad earned) | 'saved' (put back by one: why) | 'through' (a pond is done: its number) |
 * 'bridge' (off along the stones) | 'pond' (onto the next: its number) | 'fall' (why: 'gap' | 'low' | 'high' |
 * 'wall'; held: ms) }.
 */
export function stepRun(st, dt, input, events) {
  if (input?.jump) st.want.jump = 0.12; // (asked a moment too early, it still goes off on landing)
  if (input?.down) st.want.down = 0.12;
  if (input?.side) st.want.side = input.side;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= POND.step - 1e-9 && !st.over) { st.acc -= POND.step; sub(st, POND.step, events); }
  return st;
}

function sub(st, dt, events) {
  const P = POND, pond = P.ponds[st.stage], now = st.t0 + st.clock, way = waysOf()[st.stage];
  st.clock += dt;
  if (st.mode === 'bridge') {
    // ---- along the stones to the next pond: nothing to do but run
    st.u += P.bridge * dt; st.v = P.bridge;
    st.feet = 0.16 * Math.abs(Math.sin(st.u * 2.1)); // (a hop from stone to stone)
    if (st.u >= way.length) {
      st.stage++; st.mode = 'run'; st.t = 0; st.u = 0;
      Object.assign(st, { a: waysOf()[st.stage].in, turned: 0, lap: 0, ring: 0, to: 0, swap: 0, h: 0, vh: 0, jumps: 0, slide: -1, safe: POND.grace, feet: 0 });
      st.want.jump = st.want.down = 0; st.want.side = 0;
      events?.push({ type: 'pond', n: st.stage });
    }
    return;
  }
  if (st.safe > 0) st.safe -= dt;
  const out = st.mode === 'out', grounded = st.h <= 0 && st.swap <= 0;
  if (out) {
    // ---- the pond is done: one goes round to where the stones lead on, on the outer ring, and nothing is in the way
    st.want.jump = st.want.down = 0; st.want.side = 0;
    if (st.ring > 0 && grounded) { st.to = st.ring - 1; st.swap = P.swap; }
  } else {
    st.t += dt; st.held += dt;
    // ---- what is asked: to another ring, up, down
    if (st.want.side && st.swap <= 0) {
      const to = st.ring + (st.want.side > 0 ? 1 : -1);
      if (to >= 0 && to < pond.rings.length && grounded) { st.to = to; st.swap = P.swap; if (st.slide > 0) st.slide = 0; events?.push({ type: 'swap', to }); } // (a step aside ends a slide, as a jump does)
      st.want.side = 0;
    }
    if (st.want.jump > 0) {
      st.want.jump -= dt;
      if (grounded) { st.vh = P.jump; st.h = 1e-3; st.jumps = 1; st.want.jump = 0; if (st.slide > 0) st.slide = 0; events?.push({ type: 'jump' }); }
      else if (st.h > 0 && st.jumps === 1 && st.swap <= 0) { st.vh = Math.max(st.vh, P.again); st.jumps = 2; st.want.jump = 0; events?.push({ type: 'again' }); }
    }
    if (st.want.down > 0) {
      st.want.down -= dt;
      if (grounded && st.slide <= -P.rest) { st.slide = P.slide; st.want.down = 0; events?.push({ type: 'slide' }); }
      else if (st.h > 0.15 && st.vh > P.dive) { st.vh = P.dive; st.want.down = 0; events?.push({ type: 'dive' }); }
    }
  }
  if (st.slide > -P.rest) st.slide -= dt;
  // ---- round the circuit: as fast as the pond asks, on the ring one is on (half-way between two in a step aside)
  let t = 0;
  if (st.swap > 0) { st.swap -= dt; t = 1 - Math.max(0, st.swap) / P.swap; if (st.swap <= 0) { st.ring = st.to; t = 0; } }
  const r = st.swap > 0 ? pond.rings[st.ring].r + (pond.rings[st.to].r - pond.rings[st.ring].r) * t : pond.rings[st.ring].r;
  st.v = speedAt(pond, st.lap, st.t) * (out ? P.haste : 1);
  const da = (st.v / r) * dt, a0 = st.a;
  st.a = wrap(st.a + da); st.turned += da; st.r = r;
  const lap = Math.floor(st.turned / TAU);
  if (lap > st.lap) { st.lap = lap; st.laps++; if (!out) events?.push({ type: 'lap', lap, v: speedAt(pond, lap, st.t) }); }
  // ---- up and down
  if (st.h > 0) {
    st.vh -= P.g * dt; st.h += st.vh * dt;
    if (st.h <= 0) { st.h = 0; st.vh = 0; st.jumps = 0; events?.push({ type: 'land' }); }
  }
  const feet = st.swap > 0 ? Math.max(st.h, P.hop * Math.sin(Math.PI * t)) : st.h; // (a step aside is a small hop)
  st.feet = feet;
  if (out) {
    // (over a gap on the way out: a hop, by itself)
    if (feet <= 0 && !support(pond, st.ring, st.a, now)) st.feet = 0.3;
    if (st.ring === 0 && st.swap <= 0 && st.h <= 0) { const d0 = turnTo(a0, way.out), d1 = turnTo(st.a, way.out); if (d0 >= 0 && d1 < 0) { st.a = way.out; st.mode = 'bridge'; st.u = 0; events?.push({ type: 'bridge' }); } }
    return;
  }
  // ---- the pond is done when its time is up (the last one never is)
  if (st.t >= pond.time) { st.mode = 'out'; st.slide = -1; events?.push({ type: 'through', n: st.stage }); return; }
  if (st.safe > 0) return;
  // ---- the firefly of the moment: caught by who jumps under it
  const fly = fireflyAt(pond, now, _fly);
  if (fly.n !== st.caught && fly.ring === (st.swap > 0 && t > 0.5 ? st.to : st.ring) && feet > 0.2 && Math.abs(turnTo(st.a, fly.a)) * r < P.fly.near) {
    st.caught = fly.n; st.flies++;
    events?.push({ type: 'fly', flies: st.flies });
    if (st.flies % P.fly.lily === 0 && st.lilies < P.fly.most) { st.lilies++; events?.push({ type: 'lily', lilies: st.lilies }); }
  }
  // ---- the arms: a low one is jumped, a high one slid under, a wall is neither
  for (const arm of pond.arms) {
    if (r > arm.far || r < arm.near || Math.abs(turnTo(armAt(arm, now), st.a)) * r > P.beam + P.body) continue;
    if (arm.kind === 'high' ? (st.slide > 0 && feet < 0.2) || feet > P.over : arm.kind === 'low' && feet > P.clear) continue;
    return fall(st, arm.kind, events);
  }
  // ---- nothing underfoot: in
  if (st.h <= 0 && st.swap <= 0 && !support(pond, st.ring, st.a, now)) fall(st, 'gap', events);
}
const _fly = {};

/** In the water — unless a lily pad is left: then put back on the circuit, a little further on. */
function fall(st, why, events) {
  const pond = POND.ponds[st.stage];
  if (st.lilies > 0) {
    st.lilies--; st.saved++;
    // (it carries one for a moment, and sets one down where there will be something to run on then: on the ring
    // one was on if that will do, on the nearest other if not)
    const now = st.t0 + st.clock, order = pond.rings.map((_, k) => k).sort((p, q) => Math.abs(p - st.ring) - Math.abs(q - st.ring));
    const lands = (k) => [POND.safe - 0.05, POND.safe + 0.12, POND.safe + 0.26, POND.safe + 0.4].every((t) => support(pond, k, st.a + (st.v * t) / pond.rings[k].r, now + t, -0.2));
    const ring = order.find(lands) ?? st.ring;
    Object.assign(st, { ring, to: ring, r: pond.rings[ring].r, h: 1e-3, vh: 3.2, jumps: 2, slide: -1, swap: 0, safe: POND.safe });
    events?.push({ type: 'saved', why, lilies: st.lilies });
    return;
  }
  st.over = true; st.why = why; st.time = Math.round(st.held * 1000);
  events?.push({ type: 'fall', why, held: st.time, stage: st.stage });
}

/** Where a runner is: { x, y, z (their feet), yaw (the way they run), r, pond (the one they are on, or leaving) }. */
export function runPose(st, out = {}) {
  const pond = POND.ponds[st.stage], way = waysOf()[st.stage];
  out.pond = st.stage;
  out.y = POND.level + POND.top + (st.feet ?? 0);
  if (st.mode === 'bridge') {
    const r0 = pond.rings[0].r + st.u;
    out.x = pond.x + way.dx * r0; out.z = pond.z + way.dz * r0; out.yaw = Math.atan2(way.dx, way.dz); out.r = r0;
    return out;
  }
  const r = st.r ?? pond.rings[st.ring].r;
  out.x = pond.x + Math.cos(st.a) * r; out.z = pond.z + Math.sin(st.a) * r;
  out.yaw = -st.a; // (the way angles grow: (-sin a, cos a))
  out.r = r;
  return out;
}

/** What a run is worth: how long one held, in ms (the ways between the ponds are not counted). */
export const score = (st) => Math.round(st.held * 1000);

// ---------------------------------------------------------------------------------------------- a runner that plays by itself

const copy = (st) => ({ ...st, want: { ...st.want }, bot: null, acc: 0 });
const LEAPS = [{ jump: true }, { down: true }], SIDES = [{ side: 1 }, { side: -1 }];
const HORIZON = 1.7; // (s it looks ahead)
/** Runs `q` on with nothing pressed until `until` (of its own clock): how far it got (it may be over). */
function coast(q, until) { const saved = q.saved; q.hurt = 0; while (!q.over && q.clock < until - 1e-9) { stepRun(q, POND.step, null, null); if (!q.hurt && (q.over || q.saved !== saved)) q.hurt = q.clock; } return q; }
/**
 * What to press, and when, for a runner to last `HORIZON` seconds more: [{ at (of the run's clock), move }] — or
 * null when nothing was found. Tried in the order a player would: nothing; then, a little before what would
 * end the run, a jump, a slide, a step aside; then the same again after that move.
 */
function plan(st, until, depth, budget) {
  const dead = coast(copy(st), until);
  if (!dead.over && dead.saved === st.saved) return [];
  if (depth <= 0) return null;
  const end = dead.hurt || st.clock + 0.01; // (when it would fall in — or be saved, which is a lily pad lost)
  const from = Math.max(st.clock, end - 1.5), tries = [];
  // (a step aside is tried from the earliest moment on: it needs room; a jump, a slide, from the latest: they are for the last moment)
  for (let at = from; at <= end - 0.04; at += 0.09) for (const move of SIDES) tries.push([at, move]);
  for (let at = end - 0.04; at >= from - 1e-9; at -= 0.06) for (const move of LEAPS) tries.push([at, move]);
  for (const [at, move] of depth > 1 ? tries : tries.slice().sort((p, q) => q[0] - p[0])) {
    if (budget.left-- <= 0) return null;
    const here = coast(copy(st), at);
    if (here.over || here.saved > st.saved) continue;
    const q = copy(here);
    stepRun(q, POND.step, { jump: false, down: false, side: 0, ...move }, null);
    if (q.over || q.saved > st.saved) continue;
    const rest = plan(q, until, depth - 1, budget);
    if (rest) return [{ at: here.clock, move }, ...rest];
  }
  return null;
}
/**
 * A runner that plays by itself — the proof that the ponds can be run. It thinks a second and a half ahead:
 * when doing nothing would end in the water it looks for what to press, and when, to get through. `keen`: it
 * also jumps for the fireflies that are on its way. Returns the input for stepRun.
 */
export function botInput(st, out = { jump: false, down: false, side: 0 }, keen = true) {
  out.jump = false; out.down = false; out.side = 0;
  if (st.over || st.mode !== 'run') return out;
  const bot = st.bot || (st.bot = { acts: [], safeTo: 0, next: 0 });
  if (st.clock >= bot.next || (!bot.acts.length && st.clock > bot.safeTo - 0.6)) {
    // (what was planned holds as long as nothing else is pressed: looked at again every tenth of a second)
    bot.next = st.clock + 0.1;
    // (when doing nothing would end in the water within the horizon, a way is looked for that lasts well past that
    // moment — longer than the longest jump, so that a jump into a gap too long is never taken for a way through —
    // with the fewest moves first: one, then two, then three)
    const ahead = coast(copy(st), st.clock + HORIZON);
    let found = [];
    if (ahead.hurt) { found = null; for (let d = 1; d <= 3 && !found; d++) found = plan(st, ahead.hurt + 1.25, d, { left: 700 * d }); }
    if (found) { bot.acts = found; bot.safeTo = st.clock + HORIZON; }
    else if (!bot.acts.length) bot.acts = plan(st, st.clock + 0.7, 2, { left: 600 }) || [];
    if (keen && found && !found.length && st.h <= 0 && st.swap <= 0) {
      // (nothing to do: a firefly just ahead on this ring is jumped for, if the run goes on as well after it)
      const pond = POND.ponds[st.stage], fly = fireflyAt(pond, st.t0 + st.clock, _fly2), ahead = turnTo(st.a, fly.a) * pond.rings[st.ring].r;
      if (fly.n !== st.caught && fly.ring === st.ring && ahead > 0.3 && ahead < st.v * 0.32) {
        const q = copy(st);
        stepRun(q, POND.step, { jump: true, down: false, side: 0 }, null);
        if (plan(q, st.clock + HORIZON, 2, { left: 300 })) { out.jump = true; bot.next = st.clock; return out; }
      }
    }
  }
  if (bot.acts.length && bot.acts[0].at <= st.clock + 1e-9) { Object.assign(out, bot.acts.shift().move); bot.next = st.clock; }
  return out;
}
const _fly2 = {};

/** Runs with the bot until it falls in (or `limit` seconds): { held (ms), stage, time (s of the run), flies, saved, why, over }. */
export function botRun(clock = 0, limit = 600, keen = true, stage = 0) {
  const st = startRun(clock, stage), input = { jump: false, down: false, side: 0 };
  for (let t = 0; t < limit && !st.over; t += POND.step) { botInput(st, input, keen); stepRun(st, POND.step, input, null); }
  return { held: Math.round(st.held * 1000), stage: st.stage, time: st.clock, flies: st.flies, saved: st.saved, why: st.why, over: st.over, v: st.v };
}
