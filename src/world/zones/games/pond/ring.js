// The Endless Pond: its rules. No renderer here: the game, its checks and the bot that proves it can be played
// all read this.
//
// A small circuit on the Great Pond, round a post: an outer ring of stones, an inner ring of rafts of logs. One
// runs round it without stopping — the legs do it — and each lap is run a little faster than the last. It is
// not only a matter of jumping the gaps:
//   · the stones never move, the rafts drift round the other way: the gaps of the inner ring are never where
//     they were — and the inner ring is the shorter way round, so a lap is over sooner there;
//   · one changes ring with a step to the side, jumps (a second jump in the air carries further), and dives
//     back down when a jump would carry too far;
//   · two arms turn about the post, one for each ring: a low beam that goes one's way over the logs — jumped —
//     and, the other way, a curtain of lanterns that hangs over the stones — slid under. Whichever comes, the
//     other ring is clear of it;
//   · fireflies hang over the rings: three of them caught make a lily pad, and a lily pad puts back on the
//     circuit, once, who falls in.
// The run ends in the water. What moves — the rafts, the arms, the fireflies — moves by the clock of the world,
// the same for everybody: those who run together see the same pond.
//
// Places are angles about the middle of the circuit (radians, growing the way one runs); time advances in steps
// of 1/120 s whatever the frame rate.
import { PONDS } from '../../../layout/layout.js';

const TAU = Math.PI * 2;
export const POND = {
  name: 'The Endless Pond',
  x: -124.5, z: 56, // the middle of the circuit, on the Great Pond
  level: PONDS[0].level, // the water
  top: 0.24, // how far over the water one runs
  rings: [6.8, 4.9], // the stones, the logs: metres from the middle (a circuit not fourteen metres across)
  stones: 24, holes: [4, 9, 13, 18, 22], // the outer ring: so many places, and which of them are missing
  rafts: 5, raft: 0.77, drift: -0.16, // the inner ring: so many rafts, each so long (radians), drifting so fast (rad/s)
  speed: [4.8, 0.045, 13], // m/s on the first lap; how much more each lap (of the first); never more than
  step: 1 / 120,
  g: 20, jump: 5.6, again: 5.0, dive: -9, // m/s²; m/s up on a jump, on a second one in the air; down on a dive
  slide: 0.45, rest: 0.2, // s a slide lasts (a jump ends it), and before the next
  swap: 0.26, hop: 0.26, // s a step to the other ring takes, and how high it goes (m)
  edge: 0.2, // m: how far over the edge of a stone a foot may still be
  arms: [
    { high: false, turn: 0.34, phase: 2.2, from: 0.22, to: 0.48, near: 0.9, far: 5.85 }, // the low beam: rad/s (one's way), how high it is over what one runs on, and from where to where it reaches (m from the middle)
    { high: true, turn: -0.5, phase: 5.0, from: 1.05, to: 1.32, near: 5.85, far: 7.7 }, // the curtain, the other way
  ],
  beam: 0.13, body: 0.22, // half the thickness of an arm; half a runner's
  clear: 0.5, over: 1.34, // m: how high the feet must be to clear the low arm; and to go over the high one
  fly: { every: 9, high: 1.0, near: 0.75, lily: 3, most: 3 }, // a firefly moves every so many s; how high it hangs; how near one catches it; how many make a lily pad; lily pads kept at most
  safe: 1.2, // s after being put back by a lily pad during which nothing can happen
};

const wrap = (a) => { a %= TAU; return a < 0 ? a + TAU : a; };
/** The difference between two angles, from -π to π. */
const turnTo = (from, to) => { let d = (to - from) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; };
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** How fast one runs on lap `lap` (0 for the first), m/s. */
export const speedAt = (lap) => Math.min(POND.speed[2], POND.speed[0] * (1 + POND.speed[1] * lap));
/** How far round the rafts have drifted at `clock` seconds of the world's clock (radians). */
export const driftAt = (clock) => POND.drift * clock;
/** Where an arm points at `clock` (radians). */
export const armAt = (arm, clock) => arm.phase + arm.turn * clock;
/** The firefly of the moment: { n, a, ring } — it moves every few seconds. */
export function fireflyAt(clock, out = {}) {
  const n = Math.floor(clock / POND.fly.every);
  out.n = n; out.a = hash(n) * TAU; out.ring = hash(n + 0.37) < 0.45 ? 1 : 0;
  return out;
}

/** Is there something to run on at angle `a` of ring `ring` (0: the stones, 1: the logs) at `clock`? `slack`: how far over an edge a foot may be (m). */
export function support(ring, a, clock, slack = POND.edge) {
  const r = POND.rings[ring], give = slack / r;
  if (ring === 0) {
    // a stone fills its place; the missing ones leave a gap from edge to edge
    const slot = TAU / POND.stones, at = wrap(a) / slot;
    for (const k of [Math.floor(wrap(a + give) / slot) % POND.stones, Math.floor(wrap(a - give) / slot) % POND.stones, Math.floor(at) % POND.stones]) if (!POND.holes.includes(k)) return true;
    return false;
  }
  const pitch = TAU / POND.rafts, rel = wrap(a - driftAt(clock)) % pitch; // (each raft begins a pitch after the last)
  return rel <= POND.raft + give || rel >= pitch - give;
}

/**
 * A runner on the first stone, not yet gone: see stepRun. `clock`: the clock of the world at that moment (s) —
 * what moves on the pond moves by it.
 */
export function startRun(clock = 0) {
  return {
    a: 0, turned: 0, ring: 0, to: 0, swap: 0, h: 0, vh: 0, jumps: 0, slide: -1, safe: 0, lap: 0, v: POND.speed[0],
    flies: 0, lilies: 0, caught: -1, saved: 0, clock: 0, t0: clock, acc: 0, over: false, time: 0, laps: 0, why: '',
    want: { jump: 0, down: 0, side: 0 },
  };
}

/**
 * Advances a run by `dt` seconds. `input`: { jump, down (true on the frame they are asked), side (-1 towards the
 * stones, 1 towards the logs, on the frame it is asked) }. `events`, when given, is filled with what happened:
 * { type: 'jump' | 'again' (the second jump) | 'dive' | 'land' | 'slide' | 'swap' | 'lap' (lap, v) | 'fly' (flies)
 * | 'lily' (a lily pad earned) | 'saved' (put back by one: why) | 'fall' (why: 'gap' | 'low' | 'high', laps) }.
 */
export function stepRun(st, dt, input, events) {
  if (input?.jump) st.want.jump = 0.12; // (asked a moment too early, it still goes off on landing)
  if (input?.down) st.want.down = 0.12;
  if (input?.side) st.want.side = input.side;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= POND.step && !st.over) { st.acc -= POND.step; sub(st, POND.step, events); }
  return st;
}

function sub(st, dt, events) {
  const P = POND, now = st.t0 + st.clock;
  st.clock += dt;
  if (st.safe > 0) st.safe -= dt;
  const grounded = st.h <= 0 && st.swap <= 0;
  // ---- what is asked: to the other ring, up, down
  if (st.want.side && st.swap <= 0) {
    const to = st.want.side > 0 ? 1 : 0;
    if (to !== st.ring && grounded && st.slide <= 0) { st.to = to; st.swap = P.swap; events?.push({ type: 'swap', to }); }
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
  if (st.slide > -P.rest) st.slide -= dt;
  // ---- round the circuit: as fast as the lap asks, on the ring one is on (half-way between the two in a step aside)
  let t = 0;
  if (st.swap > 0) { st.swap -= dt; t = 1 - Math.max(0, st.swap) / P.swap; if (st.swap <= 0) { st.ring = st.to; t = 0; } }
  const r = st.swap > 0 ? P.rings[st.ring] + (P.rings[st.to] - P.rings[st.ring]) * t : P.rings[st.ring];
  st.v = speedAt(st.lap);
  const da = (st.v / r) * dt;
  st.a = wrap(st.a + da); st.turned += da; st.r = r;
  const lap = Math.floor(st.turned / TAU);
  if (lap > st.lap) { st.lap = lap; st.laps = lap; events?.push({ type: 'lap', lap, v: speedAt(lap) }); }
  // ---- up and down
  if (st.h > 0) {
    st.vh -= P.g * dt; st.h += st.vh * dt;
    if (st.h <= 0) { st.h = 0; st.vh = 0; st.jumps = 0; events?.push({ type: 'land' }); }
  }
  const feet = st.swap > 0 ? Math.max(st.h, P.hop * Math.sin(Math.PI * t)) : st.h; // (a step aside is a small hop)
  st.feet = feet;
  if (st.safe > 0) return;
  // ---- the firefly of the moment: caught by who jumps under it
  const fly = fireflyAt(now, _fly);
  if (fly.n !== st.caught && fly.ring === (st.swap > 0 && t > 0.5 ? st.to : st.ring) && feet > 0.2 && Math.abs(turnTo(st.a, fly.a)) * r < P.fly.near) {
    st.caught = fly.n; st.flies++;
    events?.push({ type: 'fly', flies: st.flies });
    if (st.flies % P.fly.lily === 0 && st.lilies < P.fly.most) { st.lilies++; events?.push({ type: 'lily', lilies: st.lilies }); }
  }
  // ---- the arms: the low one is jumped, the high one slid under
  for (const arm of P.arms) {
    if (r > arm.far || r < arm.near || Math.abs(turnTo(armAt(arm, now), st.a)) * r > P.beam + P.body) continue;
    if (arm.high ? (st.slide > 0 && feet < 0.2) || feet > P.over : feet > P.clear) continue;
    return fall(st, arm.high ? 'high' : 'low', events);
  }
  // ---- nothing underfoot: in
  if (st.h <= 0 && st.swap <= 0 && !support(st.ring, st.a, now)) fall(st, 'gap', events);
}
const _fly = {};

/** In the water — unless a lily pad is left: then put back on the circuit, a little further on. */
function fall(st, why, events) {
  if (st.lilies > 0) {
    st.lilies--; st.saved++;
    // (onto what comes next on the ring one was on, with a hop)
    const now = st.t0 + st.clock, r = POND.rings[st.ring];
    let a = st.a;
    for (let k = 0; k < 400 && !(support(st.ring, a, now + POND.safe, -0.35) && support(st.ring, a + 0.5 / r, now + POND.safe, -0.35)); k++) a += 0.01;
    st.turned += wrap(a - st.a); st.a = wrap(a);
    Object.assign(st, { h: 1e-3, vh: 3.2, jumps: 2, slide: -1, swap: 0, to: st.ring, safe: POND.safe });
    events?.push({ type: 'saved', why, lilies: st.lilies });
    return;
  }
  st.over = true; st.why = why; st.time = Math.round(st.clock * 1000);
  st.laps = st.turned / TAU;
  events?.push({ type: 'fall', why, laps: st.laps });
}

/** Where a runner is: { x, y, z (their feet), yaw (the way they run), r }. */
export function runPose(st, out = {}) {
  const r = st.r ?? POND.rings[st.ring];
  out.x = POND.x + Math.cos(st.a) * r; out.z = POND.z + Math.sin(st.a) * r;
  out.y = POND.level + POND.top + (st.feet ?? 0);
  out.yaw = -st.a; // (the way angles grow: (-sin a, cos a))
  out.r = r;
  return out;
}

/** What a run is worth: its laps, to a tenth. */
export const score = (st) => Math.floor((st.turned / TAU) * 10) / 10;

// ---------------------------------------------------------------------------------------------- a runner that plays by itself

const copy = (st) => ({ ...st, want: { ...st.want }, bot: null, acc: 0 });
const MOVES = [{ jump: true }, { down: true }, { side: 1 }, { side: -1 }];
const HORIZON = 1.5;
/** Runs `q` on with nothing pressed until `until` (of its own clock): how far it got (it may be over). */
function coast(q, until) { while (!q.over && q.clock < until - 1e-9) stepRun(q, POND.step, null, null); return q; }
/**
 * What to press, and when, for a runner to last `HORIZON` seconds more: [{ at (of the run's clock), move }] — or
 * null when nothing was found. Tried in the order a player would: nothing; then, a little before what would
 * end the run, a jump, a slide, a step aside; then the same again after that move.
 */
function plan(st, until, depth, budget) {
  const dead = coast(copy(st), until);
  if (!dead.over && dead.saved === st.saved) return [];
  if (depth <= 0) return null;
  const end = dead.over ? dead.clock : st.clock + 0.01;
  for (let at = end - 0.04; at >= Math.max(st.clock, end - 0.9) - 1e-9; at -= 0.045) {
    const here = coast(copy(st), at);
    if (here.over) continue;
    for (const move of MOVES) {
      if (budget.left-- <= 0) return null;
      const q = copy(here);
      stepRun(q, POND.step, { jump: false, down: false, side: 0, ...move }, null);
      if (q.over || q.saved > st.saved) continue;
      const rest = plan(q, until, depth - 1, budget);
      if (rest) return [{ at: here.clock, move }, ...rest];
    }
  }
  return null;
}
/**
 * A runner that plays by itself — the proof that the circuit can be run, lap after lap. It thinks a second and
 * a half ahead: when doing nothing would end in the water it looks for what to press, and when, to get through.
 * `keen`: it also jumps for the fireflies that are on its way. Returns the input for stepRun.
 */
export function botInput(st, out = { jump: false, down: false, side: 0 }, keen = true) {
  out.jump = false; out.down = false; out.side = 0;
  if (st.over) return out;
  const bot = st.bot || (st.bot = { acts: [], safeTo: 0, next: 0 });
  if (st.clock >= bot.next || (!bot.acts.length && st.clock > bot.safeTo - 0.6)) {
    // (what was planned holds as long as nothing else is pressed: looked at again every tenth of a second)
    bot.next = st.clock + 0.1;
    const found = plan(st, st.clock + HORIZON, 3, { left: 900 });
    if (found) { bot.acts = found; bot.safeTo = st.clock + HORIZON; }
    else if (!bot.acts.length) bot.acts = plan(st, st.clock + 0.7, 2, { left: 600 }) || [];
    if (keen && found && !found.length && st.h <= 0 && st.swap <= 0) {
      // (nothing to do: a firefly just ahead on this ring is jumped for, if the run goes on as well after it)
      const fly = fireflyAt(st.t0 + st.clock, _fly2), ahead = turnTo(st.a, fly.a) * POND.rings[st.ring];
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

/** Runs with the bot until it falls in (or `limit` seconds): { laps, time (ms), flies, saved, why }. */
export function botRun(clock = 0, limit = 600, keen = true) {
  const st = startRun(clock), input = { jump: false, down: false, side: 0 };
  for (let t = 0; t < limit && !st.over; t += POND.step) { botInput(st, input, keen); stepRun(st, POND.step, input, null); }
  return { laps: st.turned / TAU, time: Math.round(st.clock * 1000), flies: st.flies, saved: st.saved, why: st.why, over: st.over };
}
