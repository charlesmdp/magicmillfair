// How one goes down the slide. No renderer here: the game, the tests and the bot share this.
//
// A rider is somewhere along a line of the course (`s` metres from its start) and somewhere across the trough
// (`a`: radians round the pipe from its bottom, to the right when positive). A stream runs down the middle: in
// it one is carried along, out of it one drags — so the game is to keep to the water. A bend throws the rider
// up its outer side, and over the edge is out: the ring and its rider really leave the trough, fall, and are
// put back at the last arch with the clock running. One steers, lies back (faster, steers less), brakes and
// jumps — over the rolls that lie across the stream, over the whirlpools that hold whoever rides into them,
// and, off the ramp at its lip, over a gap between two troughs (fast enough, the ramp alone will do).
//
// Time advances in steps of 1/120 s whatever the frame rate: the same run takes the same time on every device.
import { SLIDE, lineAt, frameAt, rimAt, gapAt } from './track.js';

export const RIDE = {
  step: 1 / 120,
  g: 9.81,
  drag: 0.012, // air and water: what settles the speed (about 19 m/s in the stream, half of that beside it)
  friction: 0.012,
  push: 3.4, // m/s²: what the stream gives to who rides in it
  shore: 0.6, // radians: beyond the water (SLIDE.stream), where nothing is left of its push
  rub: 2.6, // m/s²: what the dry side takes, at the rim
  edge: 0.74, // radians: where the side begins to rub, and the curl of the rim to push back
  lip: 12, // rad/s² for each radian beyond `edge`
  tuck: 0.8, // of the drag, lying back
  brake: 7, // m/s² taken off, sitting up
  steer: 7.15, // rad/s² across the trough, at full lock
  damp: 3.6, // how fast a swing across the trough dies out (1/s)
  air: 0.8, // how much of the steering is left in the air (a jump can be aimed, and does not carry one over the edge)
  glide: 0.8, // …and how much of what stills a swing across the trough
  drift: 0.2, // …and how much of a bend throws one aside while in the air (the trough turns away underneath)
  jump: 3.8, // m/s up, off the water (three quarters of a metre high, not quite a second in the air)
  kick: 3.5, // m/s up, given by the ramp at the lip of a gap
  carry: 3.2, // m/s: the water alone takes one down at least this fast
  top: 34, // m/s: nobody goes faster
  whirl: { time: 1.3, speed: 3.5 }, // caught in a whirlpool: held so long, let go at that speed
  bar: 0.4, // what is left of the speed after running into a roll
  out: 1.9, // s out of the trough before one is put back
  mercy: 3, // falls in a row from the same arch after which one is put back at the next
  back: 10, // m/s: the speed one is put back with
  body: 0.3, // m: half the width of a rider, for what they run into
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * A rider at the top, not yet gone: see stepRide. `under(x, z, out)`, when given, tells what a rider who has
 * left the trough falls onto there: out.y (how high it is) and out.wet (water, or the ground) — without it,
 * the sea is everywhere. (Only what is seen of a fall depends on it: never the time of a run.)
 */
export function startRide(course, { under = null } = {}) {
  return {
    line: -1, s: 0.5, a: 0, w: 0, v: 0, h: 0, vh: 0, clock: 0, acc: 0, mark: 0, stun: 0, spin: 0, turn: 0, eye: 0, wantJump: 0,
    // out of the trough: { x, y, z, vx, vy, vz, t, kind: 'side' | 'gap' | 'end', side, wet (in the water), down (on the ground) }
    fly: null,
    falls: 0, bumps: 0, caught: 0, jumps: 0, over: false, ended: false, time: 0, hit: new Set(), took: [],
    fellAt: -1, again: 0, // (the arch one was last put back at, and how many times running)
    // (which things of each line come next: the lists are sorted along their line)
    next: new Map(), course, under,
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

/**
 * Advances a ride by `dt` seconds. `input`: { steer (-1 left … 1 right), tuck, brake, jump (true on the frame it
 * is asked) }. `events`, when given, is filled with what happened: { type: 'jump' | 'kick' | 'land' | 'bar' |
 * 'whirl' | 'free' | 'out' (kind: 'side' | 'gap' | 'end') | 'splash' | 'thud' | 'back' | 'mark' | 'fork' | 'join' |
 * 'finish' | 'end', … }. Returns the ride.
 */
export function stepRide(st, dt, input, events) {
  if (input?.jump) st.wantJump = 0.14; // (asked a moment too early, a jump still goes off on touching the water)
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= RIDE.step) { st.acc -= RIDE.step; sub(st, RIDE.step, input, events); }
  return st;
}

const _p = {};
function sub(st, dt, input, events) {
  const course = st.course, R = SLIDE.radius;
  if (!st.over) st.clock += dt;
  if (st.fly) { flight(st, dt, events); return; }
  if (st.stun > 0) st.stun -= dt;
  if (st.wantJump > 0) st.wantJump -= dt;
  const line = lineOf(course, st.line), p = lineAt(line, st.s, _p);
  const gp = RIDE.g * Math.sqrt(Math.max(0, 1 - p.ty * p.ty)); // what of gravity presses into the trough

  // ---- held in a whirlpool: spun on the spot, then let go, slow
  if (st.spin > 0) {
    st.spin -= dt; st.turn += dt * 10;
    st.v += (RIDE.whirl.speed - st.v) * Math.min(1, dt * 6);
    st.a += (st.eye - st.a) * Math.min(1, dt * 5); st.w = 0;
    st.s += 0.9 * dt;
    if (st.spin <= 0) { st.turn = 0; st.v = RIDE.whirl.speed; events?.push({ type: 'free' }); }
    return;
  }
  const steer = clamp(input?.steer || 0, -1, 1), tuck = !!input?.tuck && st.stun <= 0, brake = !!input?.brake;

  // ---- a jump, off the water
  if (st.wantJump > 0 && st.h <= 0 && st.stun <= 0) { st.vh = RIDE.jump; st.h = 1e-3; st.wantJump = 0; st.jumps++; events?.push({ type: 'jump' }); }

  // ---- up and down: off a crest or a jump, and over a gap, where nothing holds one up
  const hole = gapAt(course, st.line, st.s), press = gp + st.v * st.v * p.kv; // (kv < 0 over a crest: the trough falls away)
  if (hole) {
    st.vh -= press * dt; st.h += st.vh * dt;
    if (st.h < -0.45) { fall(st, 'gap', events); return; }
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
  const A = st.a + p.bank, swing = (st.v * st.v * p.k * Math.cos(A)) / R;
  let aa;
  if (afloat) aa = swing * RIDE.drift + steer * RIDE.steer * RIDE.air;
  else {
    aa = (-gp * Math.sin(A)) / R + swing + steer * RIDE.steer * (tuck ? 0.75 : 1) * clamp(st.v / 6, 0.35, 1);
    const beyond = Math.abs(st.a) - RIDE.edge;
    if (beyond > 0) aa -= Math.sign(st.a) * beyond * RIDE.lip; // the curl of the rim pushes back — up to a point
  }
  st.w += (aa - RIDE.damp * (afloat ? RIDE.glide : 1) * st.w) * dt;
  st.a += st.w * dt;
  if (!hole) {
    const side = Math.sign(st.a) || 1, limit = rimAt(line, st.s, side);
    if (Math.abs(st.a) > limit) {
      // over the rim: out. (The ridge between two troughs, where a shortcut leaves or joins, only guides.)
      if (limit > SLIDE.rim - 0.02) { fall(st, 'side', events); return; }
      st.a = side * limit;
      if (st.w * side > 0) st.w *= -0.25;
    }
  }

  // ---- down the slope: carried in the stream, dragging beside it
  let acc = -RIDE.g * p.ty; // (ty < 0 going down)
  if (!afloat && !hole) {
    const x = Math.abs(st.a);
    acc += RIDE.push * (1 - smooth(SLIDE.stream, RIDE.shore, x));
    acc -= RIDE.friction * gp + RIDE.drag * (tuck ? RIDE.tuck : 1) * st.v * st.v + RIDE.rub * smooth(RIDE.edge, SLIDE.rim, x);
    if (brake) acc -= RIDE.brake;
  }
  st.v = clamp(st.v + acc * dt, RIDE.carry, RIDE.top);
  const before = st.s;
  st.s += (st.v * dt) / Math.max(0.6, 1 + p.k * R * Math.sin(st.a)); // the inside of a bend is the shorter way

  // ---- what lies in the stream
  const list = thingsOf(course, st.line);
  let n = st.next.get(st.line) || 0;
  while (n < list.length && list[n].s < before - 2) n++;
  st.next.set(st.line, n);
  for (let q = n; q < list.length && list[q].s < st.s + 2; q++) {
    const t = list[q];
    if (st.hit.has(t.index)) continue;
    if (t.kind === 'whirl') {
      if (st.h < 0.3 && Math.hypot(st.s - t.s, (st.a - t.a) * R) < t.r - 0.1) {
        st.hit.add(t.index); st.caught++;
        Object.assign(st, { spin: RIDE.whirl.time, eye: t.a, turn: 0, h: 0, vh: 0 });
        events?.push({ type: 'whirl', index: t.index });
        return;
      }
    } else if (before < t.s && st.s >= t.s && Math.abs(st.a - t.a) < t.half + RIDE.body / R && st.h < t.h) {
      // into a roll: over it all the same, tumbling, most of the speed gone
      st.hit.add(t.index); st.bumps++;
      st.v = Math.max(RIDE.carry, st.v * RIDE.bar); st.stun = 0.5; st.vh = 2.2; st.h = Math.max(st.h, 0.02);
      events?.push({ type: 'bar', index: t.index });
    }
  }

  // ---- the lip of a gap, forks, arches, the end
  if (st.line < 0) {
    for (const g of course.gaps) {
      if (before < g.from && st.s >= g.from && st.h < 0.5) { st.vh = Math.max(st.vh, 0) + RIDE.kick; st.h = Math.max(st.h, 0.02); events?.push({ type: 'kick' }); }
    }
    for (const f of course.forks) {
      if (before < f.from && st.s >= f.from && st.a * f.side > 0) {
        st.line = f.id; st.s -= f.from; st.took.push(f.id);
        events?.push({ type: 'fork', fork: f.id });
        return;
      }
    }
    while (st.mark + 1 < course.marks.length && st.s >= course.marks[st.mark + 1].s) { st.mark++; events?.push({ type: 'mark', mark: st.mark }); }
    if (st.s >= course.finish) {
      // the end of the trough: the clock stops, and one goes on into the sea
      st.over = true; st.time = Math.round(st.clock * 1000);
      events?.push({ type: 'finish', time: st.time });
      fall(st, 'end', events);
    }
  } else if (st.s >= line.length) {
    st.s = line.to + (st.s - line.length); st.line = -1;
    while (st.mark + 1 < course.marks.length && st.s >= course.marks[st.mark + 1].s) st.mark++;
    events?.push({ type: 'join', fork: line.id });
  }
}

/** Out of the trough: over its side, short of the far lip of a gap, or off its end. From here on, a free fall. */
function fall(st, kind, events) {
  const q = ridePose(st, {}), side = Math.sign(st.a) || 1;
  // (what catches on the rim, or on the far lip of a gap, takes some of the speed)
  const keep = kind === 'side' ? 0.8 : kind === 'gap' ? 0.5 : 1, v = st.v * keep;
  const fly = { x: q.x + q.ux * 0.3, y: q.y + q.uy * 0.3, z: q.z + q.uz * 0.3, vx: q.fx * v, vy: q.fy * v, vz: q.fz * v, t: 0, side, kind, wet: false, down: false, yaw: q.yaw, pitch: q.pitch, roll: q.roll };
  if (kind === 'side') {
    // tipped over the rim: thrown outwards, hardly up — and down the outside of the trough
    const flat = Math.hypot(q.ux, q.uz) || 1, out = Math.max(3, Math.abs(st.w) * SLIDE.radius * 0.8);
    fly.vx -= (q.ux / flat) * out; fly.vz -= (q.uz / flat) * out; fly.vy = Math.max(fly.vy, 0) + 1.6;
  } else if (kind === 'gap') { fly.vx += q.ux * st.vh; fly.vy += q.uy * st.vh; fly.vz += q.uz * st.vh; } else fly.vy += 1.2;
  const sp = Math.hypot(fly.vx, fly.vz) || 1;
  fly.dx = fly.vx / sp; fly.dz = fly.vz / sp; // (the way it goes over the ground: kept once it lies still)
  Object.assign(st, { fly, h: 0, vh: 0, w: 0, spin: 0, turn: 0, wantJump: 0 });
  if (kind !== 'end') st.falls++;
  events?.push({ type: 'out', kind, side });
}

const SEA = { y: 0, wet: true }, _u = { y: 0, wet: true };
function flight(st, dt, events) {
  const f = st.fly;
  f.t += dt;
  if (f.wet) {
    // afloat: carried on a little, slower and slower
    const k = Math.max(0, 1 - 4 * dt);
    f.x += f.vx * dt * 0.25; f.z += f.vz * dt * 0.25; f.vx *= k; f.vz *= k;
  } else if (!f.down) {
    f.vy -= RIDE.g * dt;
    f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
    const u = st.under ? st.under(f.x, f.z, _u) : SEA, floor = u.y + (u.wet ? 0.1 : 0.3);
    if (f.y <= floor) {
      f.y = floor;
      if (u.wet) { f.wet = true; events?.push({ type: 'splash', x: f.x, y: u.y, z: f.z, kind: f.kind }); }
      else { f.down = true; f.vx = f.vy = f.vz = 0; events?.push({ type: 'thud', x: f.x, y: u.y, z: f.z, kind: f.kind }); }
    }
  }
  if (f.kind === 'end') {
    if ((f.wet || f.down || f.t > 4) && !st.ended) { st.ended = true; events?.push({ type: 'end', x: f.x, z: f.z }); }
    return;
  }
  if (f.t >= RIDE.out) {
    // back at the last arch — or, the third time running from the same one, at the next: nobody is left stuck
    // before a gap or a bend they cannot manage (three falls cost more time than the way between two arches)
    const marks = st.course.marks;
    if (st.mark === st.fellAt) st.again++; else { st.fellAt = st.mark; st.again = 1; }
    const on = st.again >= RIDE.mercy && st.mark + 1 < marks.length;
    if (on) { st.mark++; st.again = 0; }
    Object.assign(st, { fly: null, line: -1, s: marks[st.mark].s + 0.5, a: 0, w: 0, v: RIDE.back, h: 0, vh: 0, stun: 0.3 });
    events?.push({ type: 'back', mark: st.mark, on });
  }
}

const _f = { side: [0, 0, 0], up: [0, 0, 0] }, _q = {};
/**
 * Where the rider is in the world, and how they sit: { x, y, z (on the water of the trough), yaw, pitch (nose
 * down when negative), roll (leaning to the right when positive), fx, fy, fz (the way the line goes), ux, uy, uz
 * (out of the trough, where the rider is on it), ox, oy, oz (up the side of the trough, away from its middle),
 * flying (out of the trough: then x, y, z are where the fall has taken the rider's hips, `tumble` is how long it
 * has lasted, and yaw, pitch and roll say how they turn over as they go), wet, down (the fall is over: in the
 * water, on the ground) }.
 */
export function ridePose(st, out = {}) {
  if (st.fly) {
    const f = st.fly, sp = Math.hypot(f.vx, f.vz), still = f.wet || f.down;
    out.x = f.x; out.y = f.y; out.z = f.z; out.yaw = f.yaw;
    if (still) { out.pitch = 0; out.roll = 0; }
    else if (f.kind === 'side') {
      // over the rim: the ring goes on turning the way it rode up the side, right over
      out.pitch = f.pitch * Math.max(0, 1 - f.t * 2);
      out.roll = f.roll + f.side * Math.min(f.t * 4.5, 3.6);
    } else {
      const k = Math.min(1, f.t * 4);
      out.pitch = f.pitch + (Math.max(-1.1, Math.atan2(f.vy, sp) * 0.7) - f.pitch) * k;
      out.roll = f.roll * (1 - k);
    }
    out.fx = f.dx; out.fy = 0; out.fz = f.dz; out.ux = 0; out.uy = 1; out.uz = 0; out.ox = 0; out.oy = 0; out.oz = 0;
    out.k = 0; out.slope = 0; out.bank = 0; out.flying = true; out.tumble = still ? 0 : f.t; out.wet = f.wet; out.down = f.down;
    return out;
  }
  const course = st.course, R = SLIDE.radius, line = lineOf(course, st.line), p = lineAt(line, st.s, _q), f = frameAt(p, _f);
  const sn = Math.sin(st.a), cs = Math.cos(st.a), off = R * sn, lift = R * (1 - cs) + st.h;
  out.x = p.x + f.side[0] * off + f.up[0] * lift;
  out.y = p.y + f.side[1] * off + f.up[1] * lift;
  out.z = p.z + f.side[2] * off + f.up[2] * lift;
  out.yaw = p.yaw + st.turn; out.pitch = Math.asin(clamp(p.ty, -1, 1)); out.roll = st.a + p.bank;
  out.fx = p.tx; out.fy = p.ty; out.fz = p.tz;
  // (the normal of the pipe where the rider sits: towards its axis; and the way up its side from there)
  out.ux = f.up[0] * cs - f.side[0] * sn; out.uy = f.up[1] * cs - f.side[1] * sn; out.uz = f.up[2] * cs - f.side[2] * sn;
  const sg = Math.sign(st.a) || 1;
  out.ox = (f.side[0] * cs + f.up[0] * sn) * sg; out.oy = (f.side[1] * cs + f.up[1] * sn) * sg; out.oz = (f.side[2] * cs + f.up[2] * sn) * sg;
  out.k = p.k; out.slope = p.slope; out.bank = p.bank; out.flying = false; out.tumble = 0; out.wet = false; out.down = false;
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
 *   careful  keeps to the stream, goes round the whirlpools, jumps the rolls and the gaps, never takes a shortcut
 *   bold     the same lying back, jumping the whirlpools too where the trough is straight, through every shortcut
 *   { bold, cuts }  the two choices apart (lying back or not; the shortcuts or not)
 * Returns the input for stepRide.
 */
export function botInput(st, how = 'careful', out = { steer: 0, tuck: false, brake: false, jump: false }) {
  out.steer = 0; out.tuck = false; out.brake = false; out.jump = false;
  if (st.fly || st.spin > 0) return out;
  const course = st.course, R = SLIDE.radius, cfg = typeof how === 'string' ? { bold: how !== 'careful', cuts: how === 'bold' } : how;
  const bold = cfg.bold, line = lineOf(course, st.line), p = lineAt(line, st.s, _q);
  const gp = RIDE.g * Math.sqrt(Math.max(0, 1 - p.ty * p.ty)), apex = (st.v * RIDE.jump) / gp; // how far one travels before the top of a jump
  let want = 0, tuck = bold, brake = false;
  // what lies ahead in the stream: only what comes first matters
  const list = thingsOf(course, st.line);
  for (const t of list) {
    const d = t.s - st.s;
    if (d < -0.5 || st.hit.has(t.index)) continue;
    if (d > st.v * 1.5 + 6) break;
    const bendy = Math.abs(lineAt(line, t.s, {}).k) > 0.02;
    if (t.kind === 'bar' || (bold && !bendy)) {
      // over it: off the water so as to be highest above it
      if (d <= apex + 0.3 && d > 0.2 && st.h <= 0) out.jump = true;
    } else {
      // round it, on the side one is already on (the outside of the bend, all else being equal: the bend helps)
      const sgn = Math.abs(st.a - t.a) > 0.08 ? Math.sign(st.a - t.a) : (p.k > 0 ? 1 : -1);
      want = t.a + (sgn * (t.r + 0.25)) / R; // (clear of it by a hand, and no nearer the rim than need be)
      tuck = false;
      if (!bold && d < st.v * 0.7 && Math.abs(want - st.a) > 0.25) brake = true;
    }
    break;
  }
  if (st.line < 0) {
    // a gap ahead: fast enough, the ramp does it; else (and always, for the careful) a jump right at the lip
    for (const g of course.gaps) {
      const d = g.from - st.s, need = ((g.to - g.from) * gp) / (2 * RIDE.kick) + 1.5;
      if (d > 0 && d < st.v * 1.2) { want = 0; if (d <= st.v * 0.05 + 0.3 && st.h <= 0 && (!bold || st.v < need)) out.jump = true; }
    }
    // a shortcut ahead: whatever lies in the stream, the bold rider is on its side when it leaves, the careful
    // one well on the other
    for (const f of course.forks) {
      const d = f.from - st.s;
      if (d > -1 && d < st.v * 2.2 + 6) {
        if (cfg.cuts) {
          want = f.side * Math.max(0.3, want * f.side);
          // (too fast, a bend throws one away from the inside, where a shortcut leaves: slow down until it can be reached)
          const A = want + p.bank, needed = Math.abs(gp * Math.sin(A) - st.v * st.v * p.k * Math.cos(A)) / (R * RIDE.steer);
          if (needed > 0.8 || (st.a * f.side < 0.12 && d < st.v * 0.9)) { brake = true; tuck = false; }
        } else { want = -f.side * Math.max(0.24, -want * f.side); tuck = false; }
      }
    }
  }
  // steer: what holds the rider at `want` against the bend, plus what closes the gap
  const A = want + p.bank, hold = (gp * Math.sin(A) - st.v * st.v * p.k * Math.cos(A)) / (R * RIDE.steer);
  out.steer = clamp((st.h > 0.05 ? 0 : hold) + (want - st.a) * 5 - st.w * 1.1, -1, 1);
  out.tuck = tuck && !brake; out.brake = brake;
  return out;
}

/** Rides the whole course with the bot: { time (ms), falls, bumps, caught, jumps, took (the shortcuts), top (m/s), over }. */
export function botRun(course, how = 'careful', limit = 900) {
  const st = startRide(course), input = { steer: 0, tuck: false, brake: false, jump: false };
  let top = 0;
  for (let t = 0; t < limit && !st.over; t += RIDE.step) {
    botInput(st, how, input);
    if (input.jump) st.wantJump = 0.14;
    sub(st, RIDE.step, input, null);
    if (st.v > top) top = st.v;
  }
  return { time: st.time, falls: st.falls, bumps: st.bumps, caught: st.caught, jumps: st.jumps, took: st.took, top, over: st.over };
}
