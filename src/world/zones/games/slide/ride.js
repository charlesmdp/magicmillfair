// How one goes down the slide. No renderer here: the game, the tests and the bot share this.
//
// A rider is somewhere along a line of the course (`s` metres from its start) and somewhere across the trough
// (`a`: radians round the half pipe from its bottom, to the right when positive). Gravity pulls down the slope
// and back to the bottom of the pipe; a bend throws the rider up its outer side; the water never lets anyone
// stop. One steers across the trough, tucks to go faster (and steer less), brakes. Buoys cost most of the
// speed; strips of light give some; where the outer side is cut low, going too wide is flying out — and one is
// put back at the last arch, the clock still running.
//
// Time advances in steps of 1/120 s whatever the frame rate: the same run takes the same time on every device.
import { SLIDE, lineAt, frameAt, rimAt } from './track.js';

export const RIDE = {
  step: 1 / 120,
  g: 9.81,
  drag: 0.0036, // air and water: what settles the speed on a given slope (about 17 m/s on 12 %)
  friction: 0.012,
  tuck: 0.7, // of the drag, lying back
  brake: 7, // m/s² taken off, sitting up
  steer: 6.5, // rad/s² across the trough, at full lock
  body: 0.3, // m: half the width of a rider, for what they run into
  damp: 3.6, // how fast a swing across the trough dies out (1/s)
  carry: 3.2, // m/s: the water alone takes one down at least this fast
  top: 34, // m/s: nobody goes faster
  buoy: 0.45, // what is left of the speed after a buoy
  boost: { time: 1.0, push: 9.5 }, // a strip of light: so many m/s² for so long
  out: 1.7, // s out of the trough before one is put back
  back: 7, // m/s: the speed one is put back with
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** A rider at the top, not yet gone: see stepRide. */
export function startRide(course) {
  return {
    line: -1, s: 0.5, a: 0, w: 0, v: 0, h: 0, vh: 0, clock: 0, acc: 0, mark: 0, out: 0, stun: 0, boost: 0, scrape: 0,
    falls: 0, bumps: 0, boosts: 0, over: false, time: 0, hit: new Set(), took: [],
    // (which things of each line come next: the lists are sorted along their line)
    next: new Map(), course,
  };
}

const lineOf = (course, id) => (id < 0 ? course.main : course.forks[id]);
function thingsOf(course, id) {
  if (!course._byLine) {
    course._byLine = new Map();
    course.things.forEach((t, index) => { if (!course._byLine.has(t.line)) course._byLine.set(t.line, []); course._byLine.get(t.line).push({ ...t, index }); });
    for (const list of course._byLine.values()) list.sort((p, q) => p.s - q.s);
  }
  return course._byLine.get(id) || [];
}
/** Is the side of the trough cut low where the rider is (and on which side)? 0, or -1 / 1. */
export function lowSide(course, line, s) {
  if (line >= 0) return 0;
  for (const o of course.open) if (s >= o.from && s <= o.to) return o.side;
  return 0;
}

const _p = {};
/**
 * Advances a ride by `dt` seconds. `input`: { steer (-1 left … 1 right), tuck, brake }. `events`, when given, is
 * filled with what happened: { type: 'buoy' | 'boost' | 'out' | 'back' | 'mark' | 'fork' | 'join' | 'land' |
 * 'scrape' | 'finish', … }. Returns the ride.
 */
export function stepRide(st, dt, input, events) {
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= RIDE.step) { st.acc -= RIDE.step; sub(st, RIDE.step, input, events); }
  return st;
}

function sub(st, dt, input, events) {
  const course = st.course, R = SLIDE.radius;
  if (!st.over) st.clock += dt;
  if (st.out > 0) {
    // out of the trough: a moment in the air, then back at the last arch
    st.out -= dt;
    st.h += st.vh * dt; st.vh -= RIDE.g * dt;
    if (st.out <= 0) {
      const m = course.marks[st.mark];
      Object.assign(st, { line: -1, s: m.s + 0.5, a: 0, w: 0, v: RIDE.back, h: 0, vh: 0, out: 0, stun: 0.3, boost: 0 });
      events?.push({ type: 'back', mark: st.mark });
    }
    return;
  }
  const line = lineOf(course, st.line), p = lineAt(line, st.s, _p);
  const level = Math.sqrt(Math.max(0, 1 - p.ty * p.ty)), gp = RIDE.g * level; // what of gravity presses into the trough
  const steer = st.over ? 0 : clamp(input?.steer || 0, -1, 1), tuck = !st.over && !!input?.tuck && st.stun <= 0, brake = st.over || !!input?.brake;
  if (st.stun > 0) st.stun -= dt;

  // ---- up off the water over a crest, and down again
  const press = gp + st.v * st.v * p.kv; // (kv < 0 over a crest: the trough falls away)
  if (st.h <= 0 && press < -0.6) { st.h = 1e-3; st.vh = 0; }
  if (st.h > 0) {
    st.vh -= press * dt; st.h += st.vh * dt;
    if (st.h <= 0) { st.h = 0; if (st.vh < -1.2) { st.v *= 0.97; events?.push({ type: 'land', hard: -st.vh }); } st.vh = 0; }
  }
  const afloat = st.h > 0.05;

  // ---- across the trough
  const A = st.a + p.bank;
  let aa = afloat ? 0 : (-gp * Math.sin(A) + st.v * st.v * p.k * Math.cos(A)) / R;
  if (!afloat) aa += steer * RIDE.steer * (tuck ? 0.72 : 1) * clamp(st.v / 6, 0.35, 1);
  st.w += (aa - RIDE.damp * st.w) * dt;
  st.a += st.w * dt;
  const low = lowSide(course, st.line, st.s), side = Math.sign(st.a), limit = rimAt(line, st.s, side);
  if (Math.abs(st.a) > limit) {
    if (low === side && !st.over && limit < SLIDE.low + 0.12) {
      // over the low side: out
      st.out = RIDE.out; st.falls++; st.vh = 3.5; st.h = 0.4; st.boost = 0;
      events?.push({ type: 'out', side });
      return;
    }
    st.a = side * limit;
    if (st.w * side > 0) st.w *= -0.25;
    // rubbing along the rim costs speed — not the ridge between two troughs, which only guides
    if (limit > SLIDE.rim - 0.02) {
      st.v *= 1 - 0.9 * dt;
      if ((st.scrape -= dt) <= 0) { st.scrape = 0.35; events?.push({ type: 'scrape', side }); }
    }
  }

  // ---- down the slope
  let acc = -RIDE.g * p.ty; // (ty < 0 going down)
  if (!afloat) {
    acc -= RIDE.friction * gp + RIDE.drag * (tuck ? RIDE.tuck : 1) * st.v * st.v;
    if (brake) acc -= RIDE.brake;
    if (st.over) acc -= 3 + 0.6 * st.v; // the water of the run-out
  }
  if (st.boost > 0) { st.boost -= dt; acc += RIDE.boost.push; }
  st.v = clamp(st.v + acc * dt, st.over ? 0 : RIDE.carry, RIDE.top);
  const before = st.s;
  st.s += (st.v * dt) / Math.max(0.6, 1 + p.k * R * Math.sin(st.a)); // the inside of a bend is the shorter way

  // ---- what lies in the trough
  if (!afloat || st.h < 0.7) {
    const list = thingsOf(course, st.line);
    let n = st.next.get(st.line) || 0;
    while (n < list.length && list[n].s + (list[n].length || 0) < before - 1) n++;
    st.next.set(st.line, n);
    for (let q = n; q < list.length && list[q].s < st.s + 1; q++) {
      const t = list[q];
      if (st.hit.has(t.index)) continue;
      if (t.kind === 'buoy') {
        if (Math.abs(st.s - t.s) < 0.8 && Math.abs(st.a - t.a) * R < t.r + RIDE.body) {
          st.hit.add(t.index); st.bumps++;
          st.v = Math.max(RIDE.carry, st.v * RIDE.buoy); st.w += (st.a >= t.a ? 1 : -1) * 2.4; st.stun = 0.55; st.boost = 0;
          events?.push({ type: 'buoy', index: t.index });
        }
      } else if (t.kind === 'boost') {
        if (st.s >= t.s && st.s <= t.s + t.length && Math.abs(st.a - t.a) < t.half && !st.over) {
          st.hit.add(t.index); st.boosts++; st.boost = RIDE.boost.time;
          events?.push({ type: 'boost', index: t.index });
        }
      }
    }
  }

  // ---- forks, arches, the end
  if (st.line < 0) {
    for (const f of course.forks) {
      if (before < f.from && st.s >= f.from && st.a * f.side > 0) {
        st.line = f.id; st.s -= f.from; st.took.push(f.id);
        events?.push({ type: 'fork', fork: f.id });
        return;
      }
    }
    while (st.mark + 1 < course.marks.length && st.s >= course.marks[st.mark + 1].s) { st.mark++; events?.push({ type: 'mark', mark: st.mark }); }
    if (!st.over && st.s >= course.finish) { st.over = true; st.time = Math.round(st.clock * 1000); events?.push({ type: 'finish', time: st.time }); }
    if (st.s >= course.length - 0.6) { st.s = course.length - 0.6; st.v = 0; }
  } else if (st.s >= line.length) {
    st.s = line.to + (st.s - line.length); st.line = -1;
    while (st.mark + 1 < course.marks.length && st.s >= course.marks[st.mark + 1].s) st.mark++;
    events?.push({ type: 'join', fork: line.id });
  }
}

const _f = { side: [0, 0, 0], up: [0, 0, 0] }, _q = {};
/**
 * Where the rider is in the world, and how they sit: { x, y, z (on the water of the trough), yaw, pitch (nose
 * down when negative), roll (leaning to the right when positive), fx, fy, fz (the way the line goes), ux, uy, uz
 * (out of the trough, where the rider is on it) }.
 */
export function ridePose(st, out = {}) {
  const course = st.course, R = SLIDE.radius, line = lineOf(course, st.line), p = lineAt(line, st.s, _q), f = frameAt(p, _f);
  const sn = Math.sin(st.a), cs = Math.cos(st.a), off = R * sn, lift = R * (1 - cs) + Math.max(0, st.h);
  out.x = p.x + f.side[0] * off + f.up[0] * lift;
  out.y = p.y + f.side[1] * off + f.up[1] * lift;
  out.z = p.z + f.side[2] * off + f.up[2] * lift;
  out.yaw = p.yaw; out.pitch = Math.asin(clamp(p.ty, -1, 1)); out.roll = st.a + p.bank;
  out.fx = p.tx; out.fy = p.ty; out.fz = p.tz;
  // (the normal of the pipe where the rider sits: towards its axis)
  out.ux = f.up[0] * cs - f.side[0] * sn; out.uy = f.up[1] * cs - f.side[1] * sn; out.uz = f.up[2] * cs - f.side[2] * sn;
  out.k = p.k; out.slope = p.slope; out.bank = p.bank;
  return out;
}

/** How far down the course a rider is, in metres of the main line (a fork counts as the stretch it replaces). */
export function rideProgress(st) {
  if (st.line < 0) return st.s;
  const f = st.course.forks[st.line];
  return f.from + (st.s / f.length) * (f.to - f.from);
}

/**
 * A rider that steers by itself — the proof that the course can be ridden, and the times to beat. `how`:
 *   careful  steers round what lies ahead, brakes before a low side, never takes a shortcut
 *   bold     the same, lying back wherever the trough has both its sides, through every shortcut and strip of light
 * Returns the input for stepRide.
 */
export function botInput(st, how = 'careful', out = { steer: 0, tuck: false, brake: false }) {
  const course = st.course, R = SLIDE.radius, bold = how === 'bold', line = lineOf(course, st.line), p = lineAt(line, st.s, _q);
  const gp = RIDE.g * Math.sqrt(Math.max(0, 1 - p.ty * p.ty));
  // where the rider would settle without steering, here and a little further on
  const rest = (pp, v) => Math.atan2(v * v * pp.k, gp) - pp.bank;
  const ahead = lineAt(line, st.s + st.v * 0.7, {}), low = lowSide(course, st.line, st.s) || lowSide(course, st.line, st.s + st.v * 1.3);
  let want = clamp(rest(p, st.v) * 0.55, -0.5, 0.5); // by default: a little inside of where the bend throws one
  let tuck = bold, brake = false;
  // a low side ahead: keep to the other one, and not too fast
  if (low) {
    want = -low * 0.3;
    const there = lineAt(line, st.s + st.v * 0.6, {}), settle = Math.abs(rest(there, st.v));
    tuck = false;
    brake = settle > SLIDE.low + 0.12 || st.v > (bold ? 19 : 16.5);
  }
  // a shortcut ahead: the bold rider goes for its side, the careful one keeps well away
  if (st.line < 0) for (const f of course.forks) {
    const d = f.from - st.s;
    if (d > 0 && d < st.v * 1.6) { want = bold ? f.side * 0.5 : -f.side * 0.25; if (!bold) tuck = false; }
  }
  // what lies ahead in the trough: the nearest buoys push the line aside, a strip of light draws it (the bold only)
  const list = thingsOf(course, st.line), reach = st.v * (bold ? 1.25 : 1.6) + 4;
  const buoys = [];
  for (const t of list) {
    if (t.s < st.s - 0.5 || t.s > st.s + reach || st.hit.has(t.index)) continue;
    if (t.kind === 'buoy') buoys.push(t);
    else if (bold && !low && Math.abs(t.a - st.a) < 0.9) want = t.a;
  }
  if (buoys.length) {
    // the row of buoys that comes first: aim for the middle of the widest way through, nearest to what was wanted
    const s0 = buoys[0].s, row = buoys.filter((b) => b.s - s0 < 3).map((b) => b.a).sort((x, y) => x - y);
    const lim = low ? SLIDE.low - 0.12 : SLIDE.rim - 0.15, edges = [-lim, ...row, lim], need = (row.length ? buoys[0].r + RIDE.body : 0) / R + 0.06;
    let best = null;
    for (let i = 0; i + 1 < edges.length; i++) {
      const lo = edges[i] + (i === 0 ? 0 : need), hi = edges[i + 1] - (i + 1 === edges.length - 1 ? 0 : need);
      if (hi < lo) continue;
      const aim = clamp(want, lo, hi), cost = Math.abs(aim - want) + Math.abs(aim - st.a) * 0.35;
      if (!best || cost < best.cost) best = { aim, cost };
    }
    if (best) want = best.aim;
    if (!bold && buoys[0].s - st.s < st.v * 0.9 && Math.abs(want - st.a) > 0.3) brake = true;
  }
  // steer: what holds the rider at `want` against the bend, plus what closes the gap
  const A = want + (ahead.bank + p.bank) / 2, hold = (gp * Math.sin(A) - st.v * st.v * p.k * Math.cos(A)) / (R * RIDE.steer);
  out.steer = clamp(hold + (want - st.a) * 3.2 - st.w * 0.9, -1, 1);
  out.tuck = tuck && !brake; out.brake = brake;
  return out;
}

/** Rides the whole course with the bot: { time (ms), falls, bumps, boosts, took (the shortcuts), top (m/s), over }. */
export function botRun(course, how = 'careful', limit = 600) {
  const st = startRide(course), input = { steer: 0, tuck: false, brake: false };
  let top = 0;
  for (let t = 0; t < limit && !st.over; t += RIDE.step) {
    botInput(st, how, input);
    sub(st, RIDE.step, input, null);
    if (st.v > top) top = st.v;
  }
  return { time: st.time, falls: st.falls, bumps: st.bumps, boosts: st.boosts, took: st.took, top, over: st.over };
}
