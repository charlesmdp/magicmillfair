// How one goes down the slide. No renderer here: the game, the tests and the bot share this.
//
// A rider is somewhere along a line of the course (`s` metres from its start) and somewhere across the trough
// (`u`: metres from its middle along its surface, to the right when positive). Water runs down the middle of a
// plain trough, and stands over the whole floor where the slide opens out: in it one is carried along, out of
// it — up the walls — one drags, so the game is to keep to the water. A bend throws the rider up its outer wall.
// One steers, lies back (faster, steers less), brakes and jumps — over the rolls that lie across the water, some
// of them sliding from side to side, over the arms that turn above it, and, off the ramp at its lip, over a gap
// between two troughs. A whirlpool draws in whoever comes near it, and holds and spins whoever rides into it.
// In the long pool the water is slack — one plunges into it and is slowed — and great propellers lie on it, as
// wide as it is: one passes between their blades, on the side where they go one's way, or jumps one; a blade
// that comes the other way throws back whoever it catches, and so do the buffers that stand in the pool.
//
// Over the rim one is out of the trough — not out of the ride: the ring and its rider really fly, steered a
// little, and whatever trough they come down into — the same one further on, a pipe beside it, a turn of the
// slide below, which costs most of one's speed — they ride on from there. Only who has found none when the
// count runs out (RIDE.out), or has come down on the ground or in the sea, is put back at the last arch, with
// the clock running.
//
// And the slide itself falls: in the Cascade the trough ends in the air, three times, and goes on lower, as a
// pool — deep water, in which one comes down softly from however high. Beside the pools hang the mouths of
// other pipes, higher: who steers the fall comes down in one of them, and rides what it carries — sparks, each
// a quarter of a second off one's time, or water that runs harder, with arrows that throw one forward. Where
// two pipes run so close that only a low rim parts them, one goes over it from the one into the other, at will.
//
// Time advances in steps of 1/120 s whatever the frame rate: the same run takes the same time on every device.
// What moves in the trough moves by the clock of the ride itself.
import { SLIDE, WALL, lineAt, lineOf, frameAt, rimAt, gapAt, across, sliderAt, spinnerAt, propAt, refAt, overRim } from './track.js';

export const RIDE = {
  step: 1 / 120,
  g: 9.81,
  drag: 0.012, // air and water: what settles the speed (about 19 m/s in the water, half of that out of it)
  friction: 0.012,
  push: 3.4, // m/s²: what the water gives to who rides in it
  slack: { push: 0.35, drag: 2.2 }, // where the water is slack (the long pool): what is left of its push, and how much more it holds back
  plunge: { speed: 10.5, keep: 0.2 }, // plunging into the long pool: of what one has over that speed, so much is left
  rub: 2.6, // m/s²: what a wall takes, at the rim
  edge: 0.74, // radians up a wall: where it begins to rub, and the curl of the rim to push back
  lip: 12, // rad/s² for each radian beyond `edge`
  tuck: 0.8, // of the drag, lying back
  brake: 7, // m/s² taken off, sitting up
  steer: 15.2, // m/s² across the trough, at full lock
  damp: 3.6, // how fast a swing across the trough dies out (1/s)
  air: 0.8, // how much of the steering is left in the air (a jump can be aimed)
  glide: 0.8, // …and how much of what stills a swing across the trough
  drift: 0.2, // …and how much of a bend throws one aside while in the air (the trough turns away underneath)
  jump: 3.8, // m/s up, off the water (three quarters of a metre high, not quite a second in the air)
  kick: 3.5, // m/s up, given by the ramp at the lip of a gap
  carry: 3.2, // m/s: the water alone takes one down at least this fast
  top: 34, // m/s: nobody goes faster
  whirl: { time: 1.3, speed: 3.5, pull: 16 }, // caught in a whirlpool: held so long, let go at that speed; how hard it draws in (m/s², at its eye)
  bar: 0.4, // what is left of the speed after running into a roll
  arm: 0.45, // …into the arm of a spinner
  block: 0.4, // …into a block, into the hub of a propeller
  blade: 0.5, // how much of the speed one runs into a blade with it gives back
  bounce: { speed: 11, time: 0.55, fade: 3.2 }, // off a buffer: thrown back at that speed (m/s), for so long, slowing so fast (1/s)
  again: 1.2, // s before the same thing can be run into again
  out: 1.6, // s one may be out of a trough: the time to come down into one — any — or one is put back
  deep: 12, // m: fallen further than that below where one left the trough, one is lost — no turn of the slide below is that near
  fall: { wing: 8 }, // off a lip, off the end of a pipe — a fall the course is made of: steering in the air (m/s² across)
  hop: 0.85, // of one's speed across, what is left over a low rim
  boost: 6.5, // m/s: what the arrows of light on the water of a pipe give
  spark: { reach: 0.95, worth: 0.25 }, // caught within so many metres of one's hips; s off one's time for each
  rest: 0.7, // s one is left where one came down, on the ground or in the sea, before being put back
  wing: 4, // m/s² across, steering in the air out of the trough
  airbrake: 5, // m/s² taken off, sitting up in the air
  tip: 2.4, // m/s: who goes over the rim goes outwards at least this fast
  hard: 11, // m/s: falling faster than that into a trough (from six metres up), one is flattened…
  flat: 0.4, // …and keeps so much of one's speed
  settle: 1.2, // s one must stay in the trough one has come down into before the arches flown over count
  mercy: 3, // times in a row put back at the same arch after which one is put back at the next
  back: 10, // m/s: the speed one is put back with
  body: 0.3, // m: half the width of a rider, for what they run into
  seat: 0.3, // m: how far a rider's hips are over what they ride on
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * A rider at the top, not yet gone: see stepRide. `under(x, z, out)`, when given, tells what a rider who has
 * left the trough comes down onto there, if no trough: out.y (how high it is) and out.wet (water, or the
 * ground) — without it, the sea is everywhere.
 */
export function startRide(course, { under = null } = {}) {
  return {
    line: -1, s: 0.5, u: 0, w: 0, v: 0, h: 0, vh: 0, clock: 0, acc: 0, mark: 0, stun: 0, spin: 0, turn: 0, eye: null, wantJump: 0, floor: 0,
    kb: 0, kbv: 0, // thrown back (by a buffer, a blade): for so long yet, at that speed
    dip: null, // (the long pool one has plunged into)
    settle: 0, // (just down from a flight: for so long yet the arches one flew over are not one's own — see alight)
    // out of the trough: { x, y, z, vx, vy, vz, t, kind: 'side' (over the rim) | 'gap' (short of the far lip) |
    // 'off' (off the end of a pipe) | 'end' (off the end of the slide), side, wet (in the water), down (on the
    // ground), hit (when it came down), from (how far down the course it left) }
    fly: null,
    falls: 0, // times put back at an arch
    hops: 0, skipped: 0, // times out of a trough and down into one again; the metres of the course so skipped
    lanes: 0, boosts: 0, sparks: 0, got: new Set(), // times over a low rim; arrows ridden over; sparks caught, and which
    bumps: 0, caught: 0, jumps: 0, over: false, ended: false, time: 0, took: [],
    cool: new Map(), // (what has just been run into: not again before…)
    fellAt: -1, again: 0, // (the arch one was last put back at, and how many times running)
    next: new Map(), // (which things of each line come next: the lists are sorted along their line)
    course, under,
  };
}

function thingsOf(course, id) {
  if (!course._byLine) {
    course._byLine = new Map();
    course.things.forEach((t, index) => { if (!course._byLine.has(t.line)) course._byLine.set(t.line, []); course._byLine.get(t.line).push({ ...t, index }); });
    for (const list of course._byLine.values()) list.sort((p, q) => p.s - q.s);
  }
  return course._byLine.get(id) || [];
}

/**
 * Advances a ride by `dt` seconds. `input`: { steer (-1 left … 1 right), tuck, brake, jump (true on the frame it
 * is asked) }. `events`, when given, is filled with what happened: { type: 'jump' | 'kick' | 'land' (hard: how
 * hard; hop: back in a trough after having left one — then line, gain (the metres of the course skipped), from
 * (the kind of the flight) and flat (from so high that most of the speed is gone)) | 'bar' (a roll, a slider) | 'arm' (a spinner) | 'block' | 'hub' | 'blade' (back:
 * thrown back by it) | 'bump' (a buffer) | 'plunge' | 'whirl' | 'free' | 'out' (kind: 'side' | 'gap' | 'off' |
 * 'end') | 'splash' | 'thud' | 'back' (late: the count ran out in the air) | 'mark' | 'fork' | 'join' | 'finish'
 * | 'end', … }. Returns the ride.
 */
export function stepRide(st, dt, input, events) {
  if (input?.jump) st.wantJump = 0.14; // (asked a moment too early, a jump still goes off on touching the water)
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= RIDE.step) { st.acc -= RIDE.step; sub(st, RIDE.step, input, events); }
  return st;
}

/** Thrown off one's line by something run into: `keep` of the speed is left, and one is tossed up a little. */
function bump(st, keep, toss) {
  st.v = Math.max(RIDE.carry, st.v * keep); st.stun = 0.5;
  if (toss) { st.vh = toss; st.h = Math.max(st.h, 0.02); }
}

const _p = {}, _x = {}, _o = {}, _hips = {};
function sub(st, dt, input, events) {
  const course = st.course, R = SLIDE.radius;
  if (!st.over) st.clock += dt;
  if (st.fly) { flight(st, dt, input, events); return; }
  if (st.stun > 0) st.stun -= dt;
  if (st.wantJump > 0) st.wantJump -= dt;
  if (st.settle > 0) st.settle -= dt;
  const line = lineOf(course, st.line), p = lineAt(line, st.s, _p);
  const gp = RIDE.g * Math.sqrt(Math.max(0, 1 - p.ty * p.ty)); // what of gravity presses into the trough
  // (where the trough narrows, its walls come in and bring along whoever is on them, as high up as they were)
  if (p.F < st.floor) { const reach = p.F + Math.max(0, Math.abs(st.u) - st.floor); if (Math.abs(st.u) > reach) st.u = (st.u < 0 ? -1 : 1) * reach; }
  st.floor = p.F;

  // ---- thrown back by a buffer or a blade: back up the pool, round and round, then left to the water again
  if (st.kb > 0) {
    st.kb -= dt; st.turn += dt * 9;
    st.s = Math.max(0.5, st.s - st.kbv * dt); st.kbv *= Math.max(0, 1 - RIDE.bounce.fade * dt);
    st.u += st.w * dt; st.w *= Math.max(0, 1 - 2.5 * dt);
    const side = st.u < 0 ? -1 : 1, limit = rimAt(line, st.s, side) - 0.3;
    if (Math.abs(st.u) > limit) { st.u = side * limit; st.w = 0; }
    if (st.kb <= 0) { st.turn = 0; st.v = RIDE.carry; }
    return;
  }

  // ---- held in a whirlpool: drawn to its eye, spun on the spot, then let go, slow
  if (st.spin > 0) {
    st.spin -= dt; st.turn += dt * 10;
    st.v += (RIDE.whirl.speed - st.v) * Math.min(1, dt * 6);
    st.u += (st.eye.u - st.u) * Math.min(1, dt * 5); st.s += (st.eye.s - st.s) * Math.min(1, dt * 5); st.w = 0;
    if (st.spin <= 0) { st.turn = 0; st.v = RIDE.whirl.speed; st.cool.set(st.eye.index, st.clock + 2.5); events?.push({ type: 'free' }); }
    return;
  }
  const steer = clamp(input?.steer || 0, -1, 1), tuck = !!input?.tuck && st.stun <= 0, brake = !!input?.brake;

  // ---- the whirlpools about: they draw in who is on the water, and hold who comes to their eye
  const list = thingsOf(course, st.line), cooled = (t) => (st.cool.get(t.index) || 0) > st.clock;
  let n = st.next.get(st.line) || 0, pullU = 0, pullS = 0;
  while (n < list.length && list[n].s < st.s - 8) n++;
  st.next.set(st.line, n);
  if (st.h < 0.3) {
    for (let q = n; q < list.length && list[q].s < st.s + 4; q++) {
      const t = list[q];
      if (t.kind !== 'whirl' || cooled(t)) continue;
      const ds = t.s - st.s, du = t.u - st.u, d = Math.hypot(ds, du);
      if (d < t.core) {
        st.caught++;
        Object.assign(st, { spin: RIDE.whirl.time, eye: { s: t.s, u: t.u, index: t.index }, turn: 0, h: 0, vh: 0, w: 0 });
        events?.push({ type: 'whirl', index: t.index });
        return;
      }
      if (d < t.reach) { const f = (RIDE.whirl.pull * (1 - d / t.reach)) / d; pullU += du * f; pullS += ds * f; }
    }
  }

  // ---- a jump, off the water
  if (st.wantJump > 0 && st.h <= 0 && st.stun <= 0) { st.vh = RIDE.jump; st.h = 1e-3; st.wantJump = 0; st.jumps++; events?.push({ type: 'jump' }); }

  // ---- up and down: off a crest or a jump, and over a gap, where nothing holds one up
  const hole = gapAt(course, st.line, st.s), press = gp + st.v * st.v * p.kv; // (kv < 0 over a crest: the trough falls away)
  if (hole) {
    st.vh -= press * dt; st.h += st.vh * dt;
    if (st.h < -0.45) { leave(st, 'gap', events); return; }
  } else if (st.h < 0) {
    // (out of a gap a little low: onto the lip of the next trough, with a bump)
    st.h = 0; st.vh = 0; st.v *= 0.85; events?.push({ type: 'land', hard: 5 });
  } else {
    if (st.h <= 0 && press < -0.6) { st.h = 1e-3; st.vh = 0; }
    if (st.h > 0) {
      st.vh -= press * dt; st.h += st.vh * dt;
      if (st.h <= 0) { st.h = 0; if (st.vh < -1.2) events?.push({ type: 'land', hard: -st.vh }); st.vh = 0; }
    }
  }
  const afloat = st.h > 0.05;

  // ---- across the trough
  const uBefore = st.u, X = across(p.F, st.u, _x), A = X.tilt + p.bank, swing = st.v * st.v * p.k * Math.cos(A);
  let au;
  if (afloat) au = swing * RIDE.drift + steer * RIDE.steer * RIDE.air;
  else {
    au = -gp * Math.sin(A) + swing + steer * RIDE.steer * (tuck ? 0.75 : 1) * clamp(st.v / 6, 0.35, 1) + pullU;
    const beyond = Math.abs(X.tilt) - RIDE.edge;
    if (beyond > 0) au -= Math.sign(st.u) * beyond * RIDE.lip * R; // the curl of the rim pushes back — up to a point
  }
  st.w += (au - RIDE.damp * (afloat ? RIDE.glide : 1) * st.w) * dt;
  st.u += st.w * dt;
  if (!hole) {
    const side = st.u < 0 ? -1 : 1, limit = rimAt(line, st.s, side);
    if (Math.abs(st.u) > limit) {
      // over the rim: out of the trough…
      if (limit > p.F + WALL - 0.05) { leave(st, 'side', events); return; }
      // …or over a low rim, into the pipe that runs beside. (The ridge between two troughs, where a shortcut leaves or joins, only guides.)
      const o = overRim(course, line, st.s, side, _o);
      if (o) {
        Object.assign(st, { line: o.line.id, s: o.s, u: o.u, w: st.w * RIDE.hop, floor: 0 });
        st.lanes++;
        if (o.line.id >= 0 && st.took[st.took.length - 1] !== o.line.id) st.took.push(o.line.id);
        events?.push({ type: 'lane', line: o.line.id, quiet: o.d < 1.6 }); // (where the pipes run into one another, nothing is said)
        return;
      }
      st.u = side * limit;
      if (st.w * side > 0) st.w *= -0.25;
    }
  }

  // ---- down the slope: carried in the water, dragging up the walls; where the water is slack it carries less and holds back more
  let acc = -RIDE.g * p.ty; // (ty < 0 going down)
  if (!afloat && !hole) {
    const dry = Math.max(0, Math.abs(st.u) - p.F); // how far up a wall
    acc += RIDE.push * (line.rush || 1) * (1 - (1 - RIDE.slack.push) * p.S) * (1 - smooth(SLIDE.stream, SLIDE.shore, dry)) + pullS; // (a pipe runs harder)
    acc -= RIDE.friction * gp + RIDE.drag * (1 + (RIDE.slack.drag - 1) * p.S) * (tuck ? RIDE.tuck : 1) * st.v * st.v + RIDE.rub * smooth(RIDE.edge * R, WALL, dry);
    if (brake) acc -= RIDE.brake;
  }
  st.v = clamp(st.v + acc * dt, RIDE.carry, RIDE.top);
  const before = st.s;
  st.s += (st.v * dt) / Math.max(0.6, 1 + p.k * X.off); // the inside of a bend is the shorter way
  // ---- into the long pool: the still water takes most of the speed one comes with (once: on touching it)
  if (st.line < 0 && !afloat) {
    for (const z of course.mills) {
      if (st.dip === z || st.s < z.plunge || st.s > z.plunge + 14) continue;
      st.dip = z;
      if (st.v > RIDE.plunge.speed) { const was = st.v; st.v = RIDE.plunge.speed + (st.v - RIDE.plunge.speed) * RIDE.plunge.keep; events?.push({ type: 'plunge', lost: was - st.v }); }
    }
  }

  // ---- what lies in the water, what moves over it
  for (let q = n; q < list.length && list[q].s < st.s + 6; q++) {
    const t = list[q];
    if (t.kind === 'whirl') continue;
    const cold = cooled(t);
    if (t.kind === 'bar' || t.kind === 'slider') {
      if (cold || !(before < t.s && st.s >= t.s && st.h < t.h)) continue;
      const at = t.kind === 'slider' ? sliderAt(t, st.clock) : t.u;
      if (Math.abs(st.u - at) >= t.half + RIDE.body) continue;
      // into a roll: over it all the same, tumbling, most of the speed gone
      bump(st, RIDE.bar, 2.2); st.bumps++; st.cool.set(t.index, st.clock + RIDE.again);
      events?.push({ type: 'bar', index: t.index });
    } else if (t.kind === 'spinner') {
      if (cold || st.h >= t.h) continue;
      const th = spinnerAt(t, st.clock), es = Math.cos(th) * t.len, eu = Math.sin(th) * t.len, ps = st.s - t.s, pu = st.u - t.u;
      const k = clamp((ps * es + pu * eu) / (t.len * t.len), -1, 1);
      if (Math.hypot(ps - es * k, pu - eu * k) >= RIDE.body + 0.14) continue;
      // caught by an arm: knocked the way it turns
      bump(st, RIDE.arm, 2.2); st.bumps++; st.cool.set(t.index, st.clock + RIDE.again);
      st.w += clamp(((2 * Math.PI) / t.period) * k * es, -3, 3);
      events?.push({ type: 'arm', index: t.index });
    } else if (t.kind === 'block') {
      const front = t.s - t.len / 2, reach = t.half + RIDE.body;
      if (cold || st.h >= t.h || Math.abs(st.u - t.u) >= reach) continue;
      if (before < front && st.s >= front && Math.abs(uBefore - t.u) < reach) {
        // straight into it: stopped short, and shoved to the nearer side
        const sg = st.u < t.u ? -1 : 1;
        bump(st, RIDE.block, 0); st.bumps++; st.cool.set(t.index, st.clock + 0.3);
        st.u = t.u + sg * (reach + 0.03); st.w = sg * 1.5;
        events?.push({ type: 'block', index: t.index });
      } else if (st.s > front && before < t.s + t.len / 2) {
        // against its side: one slides along it
        const sg = uBefore < t.u ? -1 : 1;
        st.u = t.u + sg * reach;
        if (st.w * sg < 0) st.w = 0;
      }
    } else if (t.kind === 'boost') {
      // arrows of light on the water: who rides over them is thrown forward
      if (cold || st.h > 0.3 || st.s < t.s - t.len / 2 || before > t.s + t.len / 2 || Math.abs(st.u - t.u) >= t.half + RIDE.body) continue;
      st.v = Math.min(RIDE.top, st.v + RIDE.boost); st.boosts++; st.cool.set(t.index, st.clock + 2);
      events?.push({ type: 'boost', index: t.index });
    } else if (t.kind === 'bumper') {
      // a buffer: round, too tall to jump. Run into from the front, it throws one back up the pool, and aside;
      // on its flank one slides round it
      const ps = st.s - t.s, pu = st.u - t.u, d = Math.hypot(ps, pu) || 1e-6, reach = t.r + RIDE.body;
      if (d >= reach) continue;
      let ns = ps / d, nu = pu / d;
      st.s += ns * (reach - d + 0.01); st.u += nu * (reach - d + 0.01);
      if (st.v * ns + st.w * nu >= 0) continue; // (going away from it)
      if (ns < -0.5) {
        if (Math.abs(nu) < 0.25) { nu = (pu || st.u || 1) < 0 ? -0.25 : 0.25; ns = -Math.sqrt(1 - nu * nu); } // (dead on: to one side all the same)
        Object.assign(st, { kb: RIDE.bounce.time, kbv: RIDE.bounce.speed * -ns, w: clamp(st.w + nu * RIDE.bounce.speed * 0.8, -7, 7), v: RIDE.carry, h: 0, vh: 0, turn: 0, stun: 0.3 });
        st.bumps++; st.cool.set(t.index, st.clock + 0.5);
        events?.push({ type: 'bump', index: t.index });
        return;
      }
      const into = st.v * ns + st.w * nu; // (< 0)
      st.w = clamp(st.w - nu * into * 1.2, -6, 6); st.v = Math.max(RIDE.carry, st.v * 0.97);
      if (!cold && into < -3) { st.cool.set(t.index, st.clock + 0.6); events?.push({ type: 'bump', index: t.index, graze: true }); }
    } else if (t.kind === 'prop') {
      // a propeller: a hub, and blades as long as the pool is wide, all of it low enough to be jumped. Its hub
      // stops one short. A blade knocks one the way it goes: on the side where it goes down the slide it only
      // slows who runs into the back of it, or shoves on who it catches up; on the other it comes at one, and
      // throws one back.
      const ps = st.s - t.s, pu = st.u - t.u, r = Math.hypot(ps, pu) || 1e-6;
      if (r > t.len + RIDE.body || st.h >= t.h) continue;
      if (r < t.hub + RIDE.body) {
        const ns = ps / r, nu = pu / r, push = t.hub + RIDE.body - r + 0.01;
        st.s += ns * push; st.u += nu * push;
        if (st.v * ns + st.w * nu < 0) {
          st.w = clamp(st.w + (nu < 0 ? -1 : 1) * 2.2, -6, 6);
          if (!cold) { bump(st, RIDE.block, 0); st.bumps++; st.cool.set(t.index, st.clock + 0.5); events?.push({ type: 'hub', index: t.index }); }
        }
        continue;
      }
      const turnOf = (2 * Math.PI) / t.blades, om = (2 * Math.PI) / t.period, phi = Math.atan2(pu, ps);
      // (how far round from the nearest blade one is: radians, positive further round the way angles grow)
      let da = (((phi - propAt(t, st.clock)) % turnOf) + turnOf) % turnOf;
      if (da > turnOf / 2) da -= turnOf;
      const reach = t.thick / 2 + RIDE.body, off = Math.abs(Math.sin(da)) * r;
      if (Math.abs(da) > 1 || off >= reach) continue;
      const th = phi - da, sg = da < 0 ? -1 : 1, ns = -Math.sin(th) * sg, nu = Math.cos(th) * sg; // (out of the blade, towards the rider)
      const rel = (st.v + om * pu) * ns + (st.w - om * ps) * nu; // (the blade moves at (-om·pu, om·ps) there)
      st.s += ns * (reach - off + 0.01); st.u += nu * (reach - off + 0.01);
      if (rel >= 0) continue; // (going apart)
      const dv = -rel * (1 + RIDE.blade), vs = st.v + ns * dv;
      st.w = clamp(st.w + nu * dv, -6, 6);
      const back = vs < 0;
      if (back) Object.assign(st, { kb: RIDE.bounce.time * 0.8, kbv: clamp(-vs, 3, 12), v: RIDE.carry, h: 0, vh: 0, turn: 0, stun: 0.3 });
      else { st.v = clamp(vs, RIDE.carry, RIDE.top); st.stun = Math.max(st.stun, 0.25); }
      if (!cold) { st.bumps++; st.cool.set(t.index, st.clock + 0.6); events?.push({ type: 'blade', index: t.index, back, hard: -rel }); }
      if (back) return;
    }
  }

  // ---- the sparks that hang over the water
  const here = st.line < 0 ? st.s : refAt(line, st.s);
  if (here > course.sparks.from && here < course.sparks.to) { const q = ridePose(st, _hips); sparkle(st, q.x + q.ux * RIDE.seat, q.y + q.uy * RIDE.seat, q.z + q.uz * RIDE.seat, events); }
  // ---- the arches: passed in whatever pipe
  while (st.settle <= 0 && st.mark + 1 < course.marks.length && here >= course.marks[st.mark + 1].s) { st.mark++; events?.push({ type: 'mark', mark: st.mark }); }

  // ---- the lip of a gap, of a fall, forks, the end
  if (st.line < 0) {
    // (a fall: the trough ends, and one goes on in the air — down into the pool below, or wherever one steers)
    for (const f of course.falls) if (before < f.from && st.s >= f.from) { leave(st, 'fall', events, f); return; }
    for (const g of course.gaps) {
      // (the ramp at the lip: it throws one up — a little more for who jumps on it, never over the moon)
      if (before < g.from && st.s >= g.from && st.h < 0.5) { st.vh = Math.min(Math.max(st.vh, 0) + RIDE.kick, RIDE.kick + 1.5); st.h = Math.max(st.h, 0.02); events?.push({ type: 'kick' }); }
    }
    for (const f of course.forks) {
      if (before < f.from && st.s >= f.from && st.u * f.side > 0) {
        st.line = f.id; st.s -= f.from; st.took.push(f.id);
        events?.push({ type: 'fork', fork: f.id });
        return;
      }
    }
    if (st.s >= course.finish) {
      // the end of the trough: the clock stops, and one goes on into the sea — each spark is a quarter of a second off
      st.over = true; st.time = Math.round(Math.max(0, st.clock - st.sparks * RIDE.spark.worth) * 1000);
      events?.push({ type: 'finish', time: st.time });
      leave(st, 'end', events);
    }
  } else if (st.s >= line.length) {
    // the end of a pipe: off it, into the air; the end of a shortcut, of a river: back on the main line
    if (line.end === 'off') { leave(st, 'off', events, line); return; }
    st.s = line.to + (st.s - line.length); st.line = -1; st.u += line.shift || 0;
    events?.push({ type: 'join', fork: line.id });
  }
}

/** The sparks within reach of a rider whose hips are at (x, y, z): caught, once each. */
function sparkle(st, x, y, z, events) {
  const list = st.course.sparks, reach = RIDE.spark.reach * RIDE.spark.reach;
  for (let k = 0; k < list.length; k++) {
    const q = list[k], dx = q.x - x, dy = q.y - y, dz = q.z - z;
    if (dx * dx + dy * dy + dz * dz >= reach || st.got.has(k)) continue;
    st.got.add(k); st.sparks++;
    events?.push({ type: 'spark', index: k });
  }
}

/**
 * Out of the trough: over its rim ('side'), short of the far lip of a gap ('gap'), off the lip of a fall
 * ('fall': `what` is the fall), off the end of a pipe ('off': `what` is the pipe) or of the slide ('end').
 * From here on one flies (see flight), the way one was going.
 */
function leave(st, kind, events, what = null) {
  const q = ridePose(st, {}), side = st.u < 0 ? -1 : 1, v = st.v * (kind === 'gap' ? 0.5 : 1); // (what catches on the far lip of a gap takes half the speed)
  // down the line, across it (o: up the wall, away from the middle), out of the surface
  const wall = kind === 'end' ? 0 : st.w * side, up = kind === 'end' ? 0 : st.vh;
  let vx = q.fx * v + q.ox * wall + q.ux * up, vy = q.fy * v + q.oy * wall + q.uy * up, vz = q.fz * v + q.oz * wall + q.uz * up;
  if (kind === 'side') {
    // tipped over the rim: outwards at least so fast, and a little up — clear of it
    const flat = Math.hypot(q.ux, q.uz) || 1, ox = -q.ux / flat, oz = -q.uz / flat, out = vx * ox + vz * oz;
    if (out < RIDE.tip) { vx += ox * (RIDE.tip - out); vz += oz * (RIDE.tip - out); }
    vy = Math.max(vy, q.fy * v + 1.2);
  } else if (kind === 'end') vy += 1.2;
  const sp = Math.hypot(vx, vz) || 1, lift = RIDE.seat;
  const fly = {
    x: q.x + q.ux * lift, y: q.y + q.uy * lift, z: q.z + q.uz * lift, vx, vy, vz, t: 0, hit: 0, side, kind, wet: false, down: false,
    yaw: q.yaw, pitch: q.pitch, roll: q.roll, dx: vx / sp, dz: vz / sp, // (the way it goes over the ground: kept once it lies still)
    from: rideProgress(st), speed: st.v,
    // (how long it may last; `sure`: a fall the course is made of — off a lip, off the end of one of its pipes:
    // one steers it harder, and where one comes down the arches passed are one's own at once; `at`: which)
    y0: q.y, out: (kind === 'fall' || kind === 'off') && what?.out ? what.out : RIDE.out, sure: (kind === 'fall' || kind === 'off') && !!what?.out, at: what ? what.key || what.id : '',
    // (not straight back into the trough one has just left: over its rim one is out, and short of a lip one has run into it)
    bar: { line: st.line, s: st.s, until: kind === 'gap' ? 0.7 : 0.15 },
  };
  Object.assign(st, { fly, h: 0, vh: 0, w: 0, spin: 0, turn: 0, wantJump: 0, kb: 0 });
  events?.push({ type: 'out', kind, side, sure: fly.sure, at: fly.at });
}

// ---------------------------------------------------------------------------------------------- out of the trough

const CELL = 6, cellOf = (i, j) => (i + 4096) * 8192 + j + 4096;
/** Every place of every line where there is a trough, by squares of the plan: what one may come down into. */
function troughs(course) {
  if (course._grid) return course._grid;
  const grid = new Map(), reach = SLIDE.radius * Math.sin(SLIDE.rim) + 1;
  for (const line of course.lines) {
    for (const p of line.points) {
      if (p.tag.gap) continue;
      const f = frameAt(p), r = p.F + reach, spot = { line, p, side: f.side, up: f.up };
      for (let i = Math.floor((p.x - r) / CELL); i <= Math.floor((p.x + r) / CELL); i++) {
        for (let j = Math.floor((p.z - r) / CELL); j <= Math.floor((p.z + r) / CELL); j++) {
          const key = cellOf(i, j);
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(spot);
        }
      }
    }
  }
  return (course._grid = grid);
}

const _hit = { spot: null, s: 0, u: 0, tilt: 0 };
/**
 * The trough a rider flying at (x, y, z) has come down into, if any: their hips are within reach of its surface
 * (RIDE.seat over it, or lower by what a step of the fall takes). `bar`: { line, s }: not that line, near there.
 * Returns { spot: { line, p (the sample), side, up }, s, u, tilt } — the same object every time — or null.
 */
function troughAt(course, x, y, z, bar) {
  const cell = troughs(course).get(cellOf(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!cell) return null;
  const R = SLIDE.radius, open = R * Math.sin(SLIDE.rim);
  let least = Infinity;
  for (const c of cell) {
    const p = c.p, dx = x - p.x, dy = y - p.y, dz = z - p.z, along = dx * p.tx + dy * p.ty + dz * p.tz;
    if (Math.abs(along) > 0.6 * c.line.step) continue;
    const lat = dx * c.side[0] + dy * c.side[1] + dz * c.side[2], e = Math.abs(lat) - p.F;
    if (e > open || Math.abs(lat) >= least) continue;
    const a = e <= 0 ? 0 : Math.asin(e / R), over = dx * c.up[0] + dy * c.up[1] + dz * c.up[2] - R * (1 - Math.cos(a)) - RIDE.seat;
    if (over > 0.02 || over < -0.5) continue;
    const s = p.s + along;
    if (bar && c.line.id === bar.line && Math.abs(s - bar.s) < 12) continue;
    least = Math.abs(lat);
    _hit.spot = c; _hit.s = clamp(s, 0.05, c.line.length - 0.05); _hit.tilt = (lat < 0 ? -1 : 1) * a; _hit.u = e <= 0 ? lat : (lat < 0 ? -1 : 1) * (p.F + R * a);
  }
  return least < Infinity ? _hit : null;
}

/** Put back at the last arch — or, the third time running at the same one, at the next: nobody is left stuck. */
function putBack(st, events, late) {
  const marks = st.course.marks;
  if (st.mark === st.fellAt) st.again++; else { st.fellAt = st.mark; st.again = 1; }
  const on = st.again >= RIDE.mercy && st.mark + 1 < marks.length;
  if (on) { st.mark++; st.again = 0; }
  Object.assign(st, { fly: null, line: -1, s: marks[st.mark].s + 0.5, u: 0, w: 0, v: RIDE.back, h: 0, vh: 0, stun: 0.3, kb: 0, dip: null, settle: 0 });
  st.falls++;
  st.next.clear();
  events?.push({ type: 'back', mark: st.mark, on, late: !!late });
}

const SEA = { y: 0, wet: true }, _u = { y: 0, wet: true };
/** A step of a flight out of the trough: steered a little, until a trough is found, or the ground, or the count runs out. */
function flight(st, dt, input, events) {
  const f = st.fly, course = st.course;
  f.t += dt;
  if (f.wet) {
    // afloat: carried on a little, slower and slower
    const k = Math.max(0, 1 - 4 * dt);
    f.x += f.vx * dt * 0.25; f.z += f.vz * dt * 0.25; f.vx *= k; f.vz *= k;
  } else if (!f.down) {
    const sp = Math.hypot(f.vx, f.vz);
    if (f.kind !== 'end' && input && sp > 0.5) {
      // in the air one still steers (across the way one goes: to the right is (-dz, dx)), and brakes, sitting up
      const dx = f.vx / sp, dz = f.vz / sp, steer = clamp(input.steer || 0, -1, 1);
      const wing = f.sure ? RIDE.fall.wing : RIDE.wing;
      f.vx += (-dz * steer * wing - (input.brake && sp > 2 ? dx * RIDE.airbrake : 0)) * dt;
      f.vz += (dx * steer * wing - (input.brake && sp > 2 ? dz * RIDE.airbrake : 0)) * dt;
    }
    f.vy -= RIDE.g * dt;
    f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
    if (sp > 1) { f.dx = f.vx / sp; f.dz = f.vz / sp; }
    if (f.kind !== 'end' && f.from > course.sparks.from - 40 && f.from < course.sparks.to) sparkle(st, f.x, f.y, f.z, events);
    if (f.kind !== 'end' && alight(st, events)) return;
    const u = st.under ? st.under(f.x, f.z, _u) : SEA, floor = u.y + (u.wet ? 0.1 : 0.3);
    if (f.y <= floor) {
      f.y = floor; f.hit = f.t;
      if (u.wet) { f.wet = true; events?.push({ type: 'splash', x: f.x, y: u.y, z: f.z, kind: f.kind }); }
      else { f.down = true; f.vx = f.vy = f.vz = 0; events?.push({ type: 'thud', x: f.x, y: u.y, z: f.z, kind: f.kind }); }
    }
  }
  if (f.kind === 'end') {
    if ((f.wet || f.down || f.t > 4) && !st.ended) { st.ended = true; events?.push({ type: 'end', x: f.x, z: f.z }); }
    return;
  }
  const still = f.wet || f.down;
  if (still ? f.t >= f.hit + RIDE.rest : f.t >= f.out || (!f.sure && f.y0 - f.y > RIDE.deep)) putBack(st, events, !still);
}

/** Has the flight come down into a trough? Then the ride goes on from there (true). */
function alight(st, events) {
  const f = st.fly, course = st.course, hit = troughAt(course, f.x, f.y, f.z, f.t < f.bar.until ? f.bar : null);
  if (!hit) return false;
  const { line, p, side, up } = hit.spot, sn = Math.sin(hit.tilt), cs = Math.cos(hit.tilt);
  // out of its surface there, and across it to the right
  const nx = up[0] * cs - side[0] * sn, ny = up[1] * cs - side[1] * sn, nz = up[2] * cs - side[2] * sn;
  const into = -(f.vx * nx + f.vy * ny + f.vz * nz);
  if (into < -0.5) return false; // (on the way up through it: not caught)
  const along = f.vx * p.tx + f.vy * p.ty + f.vz * p.tz, cross = f.vx * (side[0] * cs + up[0] * sn) + f.vy * (side[1] * cs + up[1] * sn) + f.vz * (side[2] * cs + up[2] * sn);
  const sg = hit.u < 0 ? -1 : 1, limit = rimAt(line, hit.s, sg) - 0.03;
  Object.assign(st, {
    fly: null, line: line.id, s: hit.s, u: Math.abs(hit.u) > limit ? sg * limit : hit.u, w: clamp(cross, -7, 7), v: clamp(along, RIDE.carry, RIDE.top),
    h: 0, vh: 0, floor: p.F, spin: 0, turn: 0, kb: 0,
  });
  // (down from high up, one is flattened: most of the speed is gone — unless the water is deep there: the pool
  // under a fall, the mouth of a pipe; and so it is against the way the water runs)
  const soft = !!p.soft, flat = -f.vy > RIDE.hard && !soft;
  if (flat) { st.v = Math.max(RIDE.carry, st.v * RIDE.flat); st.stun = 0.6; }
  if (along < 0) st.stun = 0.5;
  st.next.clear();
  // (the arches flown over are one's own only once one has stayed in the trough a moment: who bounces out of
  // it again, or is thrown off it, goes back to the arch they had)
  st.settle = f.sure ? 0 : RIDE.settle;
  const gain = Math.max(0, rideProgress(st) - f.from - f.speed * f.t);
  if (line.id >= 0 && st.took[st.took.length - 1] !== line.id) st.took.push(line.id);
  st.hops++;
  st.skipped += gain;
  events?.push({ type: 'land', hard: into, hop: true, line: line.id, gain, from: f.kind, flat, soft, sure: f.sure });
  return true;
}

const _fall = {};
/**
 * Where a rider who is out of the trough comes down if they steer no more: { ok (in a trough), x, y, z, nx, ny,
 * nz (out of what they come down on), line (when ok), t (seconds from now), air (nowhere: the count runs out
 * first) } — or null when they are not flying (or have come down). What the game marks, for who aims.
 */
export function rideFall(st, out = _fall) {
  const f = st.fly;
  if (!f || f.kind === 'end' || f.wet || f.down) return null;
  const course = st.course, dt = 1 / 90;
  let x = f.x, y = f.y, z = f.z, vy = f.vy;
  out.ok = false; out.air = false; out.nx = 0; out.ny = 1; out.nz = 0; out.line = -2;
  for (let t = f.t; t < f.out && (f.sure || f.y0 - y <= RIDE.deep); t += dt) {
    vy -= RIDE.g * dt; x += f.vx * dt; y += vy * dt; z += f.vz * dt;
    const hit = troughAt(course, x, y, z, t < f.bar.until ? f.bar : null);
    if (hit) {
      const { line, side, up } = hit.spot, sn = Math.sin(hit.tilt), cs = Math.cos(hit.tilt);
      out.nx = up[0] * cs - side[0] * sn; out.ny = up[1] * cs - side[1] * sn; out.nz = up[2] * cs - side[2] * sn;
      if (-(f.vx * out.nx + vy * out.ny + f.vz * out.nz) >= -0.5) {
        out.ok = true; out.line = line.id; out.t = t - f.t;
        out.x = x - out.nx * RIDE.seat; out.y = y - out.ny * RIDE.seat; out.z = z - out.nz * RIDE.seat;
        return out;
      }
    }
    const u = st.under ? st.under(x, z, _u) : SEA;
    if (y <= u.y + 0.2) { out.x = x; out.y = u.y; out.z = z; out.nx = 0; out.ny = 1; out.nz = 0; out.t = t - f.t; return out; }
  }
  out.x = x; out.y = y; out.z = z; out.t = f.out - f.t; out.air = true;
  return out;
}

const _f = { side: [0, 0, 0], up: [0, 0, 0] }, _q = {}, _y = {}, _y2 = {};
/**
 * Where the rider is in the world, and how they sit: { x, y, z (on the water of the trough), yaw, pitch (nose
 * down when negative), roll (leaning to the right when positive), fx, fy, fz (the way the line goes), ux, uy, uz
 * (out of the trough, where the rider is on it), ox, oy, oz (up the wall of the trough, away from its middle),
 * wide (half the width of the floor there, m),
 * flying (out of the trough: then x, y, z are where the flight has taken the rider's hips, `tumble` is how long
 * it has lasted, `left` how long it may still last, fx, fz the way it goes over the ground, and yaw, pitch and
 * roll say how they hold themselves as they go), wet, down (the flight is over: in the water, on the ground) }.
 */
export function ridePose(st, out = {}) {
  if (st.fly) {
    const f = st.fly, sp = Math.hypot(f.vx, f.vz), still = f.wet || f.down, k = Math.min(1, f.t * 4);
    out.x = f.x; out.y = f.y; out.z = f.z;
    // (they face the way they fly, nose down as they fall, and come level again: ready to ride on)
    const heading = Math.atan2(f.dx, f.dz);
    out.yaw = f.kind === 'end' ? f.yaw : f.yaw + Math.atan2(Math.sin(heading - f.yaw), Math.cos(heading - f.yaw)) * k;
    if (still) { out.pitch = 0; out.roll = 0; }
    else {
      out.pitch = f.pitch + (Math.max(-0.9, Math.atan2(f.vy, sp) * 0.6) - f.pitch) * k;
      out.roll = f.roll * (1 - k);
    }
    out.fx = f.dx; out.fy = 0; out.fz = f.dz; out.ux = 0; out.uy = 1; out.uz = 0; out.ox = 0; out.oy = 0; out.oz = 0;
    out.k = 0; out.slope = 0; out.bank = 0; out.wide = 0; out.flying = true; out.tumble = still ? 0 : f.t; out.wet = f.wet; out.down = f.down;
    out.left = f.kind === 'end' || still ? 0 : Math.max(0, f.out - f.t); out.sure = !!f.sure;
    return out;
  }
  const course = st.course, line = lineOf(course, st.line), p = lineAt(line, st.s, _q), f = frameAt(p, _f), X = across(p.F, st.u, _y);
  const sn = Math.sin(X.tilt), cs = Math.cos(X.tilt), lift = X.lift + st.h;
  out.x = p.x + f.side[0] * X.off + f.up[0] * lift;
  out.y = p.y + f.side[1] * X.off + f.up[1] * lift;
  out.z = p.z + f.side[2] * X.off + f.up[2] * lift;
  out.yaw = p.yaw + st.turn; out.pitch = Math.asin(clamp(p.ty, -1, 1)); out.roll = X.tilt + p.bank;
  out.fx = p.tx; out.fy = p.ty; out.fz = p.tz;
  // (the way out of the surface where the rider sits; and the way up the wall from there, away from the middle)
  out.ux = f.up[0] * cs - f.side[0] * sn; out.uy = f.up[1] * cs - f.side[1] * sn; out.uz = f.up[2] * cs - f.side[2] * sn;
  const sg = st.u < 0 ? -1 : 1;
  out.ox = (f.side[0] * cs + f.up[0] * sn) * sg; out.oy = (f.side[1] * cs + f.up[1] * sn) * sg; out.oz = (f.side[2] * cs + f.up[2] * sn) * sg;
  out.k = p.k; out.slope = p.slope; out.bank = p.bank; out.wide = p.F; out.flying = false; out.tumble = 0; out.wet = false; out.down = false; out.left = 0; out.sure = false;
  return out;
}

/**
 * How far down the course a rider is, in metres of the main line (a shortcut counts as the stretch it replaces,
 * a pipe as what it runs beside; out of the trough, as where they left it).
 */
export function rideProgress(st) {
  if (st.fly) return st.fly.from;
  return st.line < 0 ? st.s : refAt(lineOf(st.course, st.line), st.s);
}

// ---------------------------------------------------------------------------------------------- a rider that steers by itself

const _sw = { hub: false };
/**
 * Making for `c` metres across, at `v` m/s, from where the rider is now: how long (s) before a blade of that
 * propeller, or its hub (then _sw.hub), is run into — or Infinity when one gets by. `room`: how much to spare
 * (m). `jump`: a jump taken that many seconds from now (what is met while it is high enough does not count).
 */
function sweep(t, st, c, v, room = 0.22, jump = -9) {
  const reach = t.len + RIDE.body, far = t.s + reach - st.s;
  _sw.hub = false;
  if (far <= 0) return Infinity;
  const turnOf = (2 * Math.PI) / t.blades, way = c - st.u, sg = way < 0 ? -1 : 1, dist = Math.abs(way);
  for (let tau = 0, end = far / v; tau <= end; tau += 0.025) {
    // (across at four metres a second or so, once the turn has bitten — and no further out than the padding
    // of the walls beside it lets one be)
    const ps = st.s + v * tau - t.s, pu = clamp(st.u + sg * Math.min(dist, Math.max(0, 4.2 * (tau - 0.12))) - t.u, 0.4 - t.len, t.len - 0.4), r = Math.hypot(ps, pu);
    if (r > reach) continue;
    if (tau > jump + 0.2 && tau < jump + 0.58) continue;
    if (r < t.hub + RIDE.body + room) { _sw.hub = true; return tau; }
    let da = (((Math.atan2(pu, ps) - propAt(t, st.clock + tau)) % turnOf) + turnOf) % turnOf;
    if (da > turnOf / 2) da -= turnOf;
    if (Math.abs(da) < 1 && Math.abs(Math.sin(da)) * r < t.thick / 2 + RIDE.body + room) return tau;
  }
  return Infinity;
}
/**
 * What making for `c` across costs at that propeller: nothing when one gets by; a little when a jump over one
 * blade does it (then _sw.jump: in how long to take it); a great deal when something is run into all the same.
 */
function propCost(t, st, c, v) {
  _sw.jump = -9;
  const tau = sweep(t, st, c, v);
  if (tau === Infinity) return 0;
  if (tau < 0.2 || st.h > 0.05) return _sw.hub ? 400 : 300; // (the hub stops one short: worse than a blade)
  const at = Math.max(0, tau - 0.37);
  if (sweep(t, st, c, v, 0.22, at) < Infinity) return 300;
  _sw.jump = at;
  return 25;
}

// The ways through the Cascade and the Three Rivers, for a rider that steers by itself: at each fall (and off
// the end of the Balcony), the pipe to come down in; beside the rivers, the one to be in.
const WAYS = { sparks: { B: 'L2', C: 'L3', L2: 'L3', river: 'L3' }, rush: { C: 'R3', river: 'R3' } };
const sideOf = (course, key) => course.sides.find((ln) => ln.key === key) || null;

/** How far to the right of the middle of `line` the place (x, z) is, where the line passes nearest to it (m). */
function offLine(line, x, z) {
  let best = null, least = Infinity;
  for (const p of line.points) { const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z); if (d < least) { least = d; best = p; } }
  return (x - best.x) * -Math.cos(best.yaw) + (z - best.z) * Math.sin(best.yaw);
}

const _d = { aim: 0, tuck: false, brake: false, jump: false, air: 0, flying: false, line: -1, at: 0 }, _bf = {}, _bo = {};
/**
 * A rider that steers by itself — the proof that the course can be ridden, and the times to beat. `how`:
 *   careful  keeps to the water, goes round the whirlpools and the buffers, between the blades of the
 *            propellers, jumps what can be jumped, never takes a shortcut; over a fall, straight on into the pool
 *   bold     the same lying back, through every shortcut
 *   { bold, cuts, way, lag }  the choices apart: lying back or not; the shortcuts or not; `way`: 'sparks' (at the
 *            falls, into the pipes that carry sparks, and on down the Spark Run) or 'rush' (into the Rapids) —
 *            else the pools and the river in the middle; `lag`: a person's hands — what it decides (where
 *            across to be, a jump, lying back, sitting up, how to steer a fall) is done so many seconds later,
 *            and it allows a quarter of a second for it
 * It looks a second or so ahead, weighs where across the trough it would be best to be when it gets to what
 * lies there, and steers for that. It never leaves the trough of its own will — except over a low rim, into the
 * river it is after. Returns the input for stepRide.
 */
export function botInput(st, how = 'careful', out = { steer: 0, tuck: false, brake: false, jump: false }) {
  out.steer = 0; out.tuck = false; out.brake = false; out.jump = false;
  if (st.spin > 0 || st.kb > 0) return out;
  const cfg = typeof how === 'string' ? (how === 'careful' ? CAREFUL : BOLD) : how && how !== true ? how : CAREFUL, lag = cfg.lag || 0;
  let d = lag ? { aim: 0, tuck: false, brake: false, jump: false, air: 0, flying: false, line: -1, at: 0 } : _d;
  d.flying = !!st.fly; d.line = st.line; d.jump = false; d.air = 0;
  if (st.fly) soar(st, cfg, d); else decide(st, cfg, d);
  if (lag) {
    // a person's hands: what is decided now is done `lag` seconds later
    const b = st.bot || (st.bot = { q: [], now: null });
    d.at = st.clock + lag; b.q.push(d);
    let jump = false;
    while (b.q.length && b.q[0].at <= st.clock + 1e-9) { b.now = b.q.shift(); jump = jump || b.now.jump; }
    if (!(d = b.now)) return out;
    out.jump = jump;
  } else out.jump = d.jump;
  if (st.fly) { out.steer = d.flying ? d.air : 0; return out; }
  // steer: what holds the rider at what it makes for against the bend, plus what closes the gap (what was
  // decided in the air, or in another pipe, says nothing of where to be in this one: the middle, meanwhile)
  const course = st.course, line = lineOf(course, st.line), p = lineAt(line, st.s, _q), gp = RIDE.g * Math.sqrt(Math.max(0, 1 - p.ty * p.ty));
  const stale = d.flying || d.line !== st.line, goal = stale ? 0 : d.aim, X = across(p.F, goal, _y), A = X.tilt + p.bank, hold = (gp * Math.sin(A) - st.v * st.v * p.k * Math.cos(A)) / RIDE.steer;
  out.steer = clamp((st.h > 0.05 ? 0 : hold) + (goal - st.u) * 2.35 - st.w * 0.52, -1, 1);
  out.tuck = !stale && d.tuck && !d.brake; out.brake = !stale && d.brake;
  return out;
}
const CAREFUL = { bold: false, cuts: false }, BOLD = { bold: true, cuts: true };

/** In the air: steering the fall so that one comes down in the pipe one is after (`d.air`). */
function soar(st, cfg, d) {
  const f = st.fly, key = (WAYS[cfg.way] || {})[f.at], want = key && f.sure ? sideOf(st.course, key) : null;
  if (!want) return;
  // (as a person does: by the ring of light that shows where one is going to come down)
  const fall = rideFall(st, _bf);
  if (!fall) return;
  d.air = clamp(-offLine(want, fall.x, fall.z) * 0.8, -1, 1);
}

/** In a trough: where across to be (`d.aim`), lying back or sitting up, and whether to jump now. */
function decide(st, cfg, D) {
  const course = st.course, lag = Math.min(cfg.lag || 0, 0.25), late = st.v * lag; // (how far one goes before the hands have moved)
  const line = lineOf(course, st.line), p = lineAt(line, st.s, _q);
  const gp = RIDE.g * Math.sqrt(Math.max(0, 1 - p.ty * p.ty)), apex = (st.v * RIDE.jump) / gp; // how far one travels before the top of a jump
  const horizon = Math.max(12, st.v * 1.25), body = RIDE.body;
  // (the turning of a propeller is read for where one will be when the hands have moved)
  const eye = lag ? { s: st.s + late, u: st.u, h: st.h, clock: st.clock + lag } : st;
  let tuck = !!cfg.bold, brake = false, jump = false;

  // ---- what is ahead: what is jumped, and what one must be clear of (where across, how wide, how far)
  const clear = [], props = []; // clear: { d, u, half, soft (how far its pull is felt) }
  let pads = Infinity; // (how far from the middle the padding of the walls leaves room, where one is about to pass some)
  for (const t of thingsOf(course, st.line)) {
    const d = t.s - st.s;
    if (d < (t.kind === 'prop' ? -(t.len + 1) : -2.5)) continue;
    if (d > horizon + (t.kind === 'prop' ? t.len : 0)) break;
    if (t.kind === 'boost') continue; // (arrows of light: ridden over)
    if (t.kind === 'bar' || t.kind === 'slider' || t.kind === 'spinner') {
      const span = t.kind === 'bar' ? t.half : t.kind === 'slider' ? t.amp + t.half : t.len;
      if (d > 0.2 && d <= apex + 0.3 + late && st.h <= 0 && Math.abs(st.u - t.u) < span + body + 0.35) jump = true;
    } else if (t.kind === 'block' && t.pad) { if (d > -t.len && d < Math.max(5, st.v * 0.5)) pads = Math.min(pads, Math.abs(t.u) - t.half - body - 0.2); }
    else if (t.kind === 'block') { if (d > -t.len) clear.push({ d: Math.max(0, d - t.len / 2), u: t.u, half: t.half + body + 0.16, soft: 0 }); }
    else if (t.kind === 'bumper') { if (d > -t.r) clear.push({ d: Math.max(0, d - t.r), u: t.u, half: t.r + body + 0.3, soft: 0 }); }
    else if (t.kind === 'prop') props.push(t);
    else if (!((st.cool.get(t.index) || 0) > st.clock)) {
      clear.push({ d: Math.max(0, d - t.core), u: t.u, half: t.core + 0.5, soft: t.reach });
      // (a whirlpool there was no getting round in time: over it)
      if (d > 0.2 && d <= apex + 0.3 + late && st.h <= 0 && Math.abs(st.u - t.u) < t.core + 0.45) jump = true;
    }
  }

  // ---- where across to be: every place from rim to rim is weighed
  const fAhead = lineAt(line, st.s + Math.min(horizon, 8), _y2).F, room = Math.min(rimAt(line, st.s, -1), rimAt(line, st.s, 1), fAhead + SLIDE.shore) - 0.35;
  let fork = null, side = 0;
  if (st.line < 0) {
    // a shortcut ahead: the bold rider is on its side when it leaves, the careful one well on the other
    for (const f of course.forks) { const d = f.from - st.s; if (d > -1 && d < st.v * 2.2 + 6) { fork = f; side = cfg.cuts ? f.side : -f.side; } }
    // a gap ahead: down the middle
    for (const g of course.gaps) { const d = g.from - st.s; if (d > 0 && d < st.v * 1.2) side = 9; }
  }
  let best = 0, least = Infinity, slowly = false;
  const force = RIDE.steer * (cfg.bold ? 0.75 : 1), slower = Math.max(5, st.v - 2.5);
  for (let c = -room; c <= room + 1e-6; c += 0.1) {
    let cost = 0.3 * Math.abs(c - st.u) + 0.45 * Math.abs(c - (st.aim ?? 0));
    // (where the bend would not let one stay, whatever the steering)
    const Xc = across(p.F, c, _y), Ac = Xc.tilt + p.bank, effort = Math.abs(gp * Math.sin(Ac) - st.v * st.v * p.k * Math.cos(Ac)) / force;
    if (effort > 0.8) cost += 40 * (effort - 0.8);
    // (the water: down the middle of a plain trough, anywhere on the floor of a pool)
    cost += (fAhead > 1 ? 0.25 : 1.4) * Math.abs(c);
    if (side === 9) cost += 3 * Math.abs(c);
    else if (side) cost += c * side > (cfg.cuts ? 0.64 : 0.5) ? 0 : 60 + 8 * Math.abs(c - side);
    for (const o of clear) {
      const near = 1 / (1 + (o.d / Math.max(4, st.v * 0.45)) ** 2), gapTo = Math.abs(c - o.u);
      if (gapTo < o.half) cost += 300 * near;
      else {
        if (gapTo < o.half + 0.25) cost += 2.5 * near * (1 - (gapTo - o.half) / 0.25);
        // (nor on the far side of it, when there is no time left to get across before it)
        if ((st.u - o.u) * (c - o.u) < 0 && Math.abs(st.u - o.u) < o.half + 0.4 && o.d < st.v * (Math.abs(c - st.u) / 4.5 + 0.15)) cost += 300 * near;
      }
      if (o.soft && gapTo < o.soft) cost += 5 * near * (1 - gapTo / o.soft);
    }
    // (a propeller: getting by its blades there — as one goes, or else a little slower; and, all else being
    // equal, on the side where the blades go one's way)
    let now = 0, later = 4;
    for (const t of props) {
      const side = (c - t.u) * t.period > 0 ? 1.2 : 0;
      now += propCost(t, eye, c, st.v) || side;
      if (now >= 300 && slower < st.v - 0.5) later += propCost(t, eye, c, slower) || side;
      else later += 300;
    }
    if (cost + now < least) { least = cost + now; best = c; slowly = false; }
    if (props.length && cost + later < least) { least = cost + later; best = c; slowly = true; }
  }
  st.aim = best;
  // (not yet where it must be, and little time left: the careful rider sits up and brakes)
  for (const o of clear) {
    if (Math.abs(st.u - o.u) >= o.half) continue;
    if (o.d < st.v * 0.7 && !cfg.bold) brake = true;
    tuck = false;
  }
  for (const t of props) {
    // a propeller ahead: no lying back (what comes is timed). A blade in the way of where one is going: over it
    // when the time comes, if that does it; else sitting up, to come to it a little later
    tuck = false;
    const price = propCost(t, eye, best, st.v);
    if (price === 25 && _sw.jump < 0.03 && st.h <= 0 && !slowly) jump = true;
    else if ((slowly || price >= 300) && st.v > 5.5) brake = true;
  }
  if (st.line < 0) {
    // a gap: fast enough, the ramp does it; else (and always, for the careful) a jump right at the lip — but
    // who cannot tell the lip to a quarter of a second leaves it to the ramp whenever that will do
    for (const g of course.gaps) {
      const d = g.from - st.s, need = ((g.to - g.from) * gp) / (2 * RIDE.kick) + 1.5;
      if (d > 0 && d <= st.v * 0.05 + 0.3 + late && st.h <= 0 && (!(cfg.bold || lag) || st.v < need)) jump = true;
    }
    if (fork && cfg.cuts) {
      // (too fast, a bend throws one away from the inside, where a shortcut leaves: slow down until it can be reached)
      const X = across(p.F, best, _y), A = X.tilt + p.bank, needed = Math.abs(gp * Math.sin(A) - st.v * st.v * p.k * Math.cos(A)) / RIDE.steer;
      if (needed > 0.8 || (st.u * fork.side < 0.25 && fork.from - st.s < st.v * 0.9)) { brake = true; tuck = false; }
    } else if (fork) tuck = false;
  }
  let aim = clamp(best, -pads, pads);

  // ---- the pipe one is after (see WAYS)
  const way = WAYS[cfg.way];
  if (way) {
    // a fall ahead, and beside its pool the mouth of that pipe: up the wall on its side, well before the lip —
    // the rest is steered in the air
    if (st.line < 0) for (const f of course.falls) { const d = f.from - st.s, to = way[f.id] && sideOf(course, way[f.id]); if (to && d > 0 && d < st.v * 1.3 + late) { aim = to.side * 1.4; tuck = false; } }
    // a river beside, over a low rim: over it
    const river = sideOf(course, way.river);
    if (river && st.line !== river.id) { const sg = st.line < 0 ? river.side : 0, o = sg && overRim(course, line, st.s, sg, _bo); if (o && o.line === river && o.d > 2) aim = sg * (rimAt(line, st.s, sg) + 0.7); }
  }
  D.aim = aim; D.tuck = tuck && !brake; D.brake = brake; D.jump = jump;
}

/**
 * Rides the whole course with the bot: { time (ms), clock (s), falls, hops, lanes, bumps, caught, jumps, sparks,
 * boosts, took (the lines other than the main one, in the order they were ridden), top (m/s), over }.
 */
export function botRun(course, how = 'careful', limit = 900) {
  const st = startRide(course), input = { steer: 0, tuck: false, brake: false, jump: false };
  let top = 0;
  for (let t = 0; t < limit && !st.over; t += RIDE.step) {
    botInput(st, how, input);
    if (input.jump) st.wantJump = 0.14;
    sub(st, RIDE.step, input, null);
    if (st.v > top) top = st.v;
  }
  return { time: st.time, clock: st.clock, falls: st.falls, hops: st.hops, lanes: st.lanes, bumps: st.bumps, caught: st.caught, jumps: st.jumps, sparks: st.sparks, boosts: st.boosts, took: st.took, top, over: st.over };
}
