// How one goes down the slide. No renderer here: the game, the tests and the bot share this.
//
// A rider is somewhere along a line of the course (`s` metres from its start) and somewhere across the trough
// (`u`: metres from its middle along its surface, to the right when positive). Water runs down the middle of a
// plain trough, and stands over the whole floor where the slide opens out: in it one is carried along, out of
// it — up the walls — one drags, so the game is to keep to the water. A bend throws the rider up its outer wall,
// and over the rim is out: the ring and its rider really leave the trough, fall, and are put back at the last
// arch with the clock running. One steers, lies back (faster, steers less), brakes and jumps — over the rolls
// that lie across the water, some of them sliding from side to side, over the arms that turn above it, and, off
// the ramp at its lip, over a gap between two troughs. Blocks are too tall to jump: one goes round them, and
// between the rows of them that part the lanes. A whirlpool draws in whoever comes near it, and holds and spins
// whoever rides into it.
//
// Time advances in steps of 1/120 s whatever the frame rate: the same run takes the same time on every device.
// What moves in the trough moves by the clock of the ride itself.
import { SLIDE, WALL, lineAt, frameAt, rimAt, gapAt, across, sliderAt, spinnerAt } from './track.js';

export const RIDE = {
  step: 1 / 120,
  g: 9.81,
  drag: 0.012, // air and water: what settles the speed (about 19 m/s in the water, half of that out of it)
  friction: 0.012,
  push: 3.4, // m/s²: what the water gives to who rides in it
  rub: 2.6, // m/s²: what a wall takes, at the rim
  edge: 0.74, // radians up a wall: where it begins to rub, and the curl of the rim to push back
  lip: 12, // rad/s² for each radian beyond `edge`
  tuck: 0.8, // of the drag, lying back
  brake: 7, // m/s² taken off, sitting up
  steer: 15.2, // m/s² across the trough, at full lock
  damp: 3.6, // how fast a swing across the trough dies out (1/s)
  air: 0.8, // how much of the steering is left in the air (a jump can be aimed, and does not carry one over the edge)
  glide: 0.8, // …and how much of what stills a swing across the trough
  drift: 0.2, // …and how much of a bend throws one aside while in the air (the trough turns away underneath)
  jump: 3.8, // m/s up, off the water (three quarters of a metre high, not quite a second in the air)
  kick: 3.5, // m/s up, given by the ramp at the lip of a gap
  carry: 3.2, // m/s: the water alone takes one down at least this fast
  top: 34, // m/s: nobody goes faster
  whirl: { time: 1.3, speed: 3.5, pull: 16 }, // caught in a whirlpool: held so long, let go at that speed; how hard it draws in (m/s², at its eye)
  bar: 0.4, // what is left of the speed after running into a roll
  arm: 0.45, // …into the arm of a spinner
  block: 0.4, // …into a block
  nose: 0.55, // …into the end of a row of blocks
  again: 1.2, // s before the same thing can be run into again
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
    line: -1, s: 0.5, u: 0, w: 0, v: 0, h: 0, vh: 0, clock: 0, acc: 0, mark: 0, stun: 0, spin: 0, turn: 0, eye: null, wantJump: 0, floor: 0,
    // out of the trough: { x, y, z, vx, vy, vz, t, kind: 'side' | 'gap' | 'end', side, wet (in the water), down (on the ground) }
    fly: null,
    falls: 0, bumps: 0, caught: 0, jumps: 0, knocks: 0, over: false, ended: false, time: 0, took: [],
    cool: new Map(), // (what has just been run into: not again before…)
    fellAt: -1, again: 0, // (the arch one was last put back at, and how many times running)
    next: new Map(), // (which things of each line come next: the lists are sorted along their line)
    course, under,
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
 * is asked) }. `events`, when given, is filled with what happened: { type: 'jump' | 'kick' | 'land' | 'bar' (a
 * roll, a slider) | 'arm' (a spinner) | 'block' | 'nose' (the end of a row of blocks) | 'wall' (its side) |
 * 'whirl' | 'free' | 'out' (kind: 'side' | 'gap' | 'end') | 'splash' | 'thud' | 'back' | 'mark' | 'fork' | 'join'
 * | 'finish' | 'end', … }. Returns the ride.
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

const _p = {}, _x = {};
function sub(st, dt, input, events) {
  const course = st.course, R = SLIDE.radius;
  if (!st.over) st.clock += dt;
  if (st.fly) { flight(st, dt, events); return; }
  if (st.stun > 0) st.stun -= dt;
  if (st.wantJump > 0) st.wantJump -= dt;
  const line = lineOf(course, st.line), p = lineAt(line, st.s, _p);
  const gp = RIDE.g * Math.sqrt(Math.max(0, 1 - p.ty * p.ty)); // what of gravity presses into the trough
  // (where the trough narrows, its walls come in and bring along whoever is on them, as high up as they were)
  if (p.F < st.floor) { const reach = p.F + Math.max(0, Math.abs(st.u) - st.floor); if (Math.abs(st.u) > reach) st.u = (st.u < 0 ? -1 : 1) * reach; }
  st.floor = p.F;

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
      // over the rim: out. (The ridge between two troughs, where a shortcut leaves or joins, only guides.)
      if (limit > p.F + WALL - 0.05) { fall(st, 'side', events); return; }
      st.u = side * limit;
      if (st.w * side > 0) st.w *= -0.25;
    }
  }

  // ---- down the slope: carried in the water, dragging up the walls
  let acc = -RIDE.g * p.ty; // (ty < 0 going down)
  if (!afloat && !hole) {
    const dry = Math.max(0, Math.abs(st.u) - p.F); // how far up a wall
    acc += RIDE.push * (1 - smooth(SLIDE.stream, SLIDE.shore, dry)) + pullS;
    acc -= RIDE.friction * gp + RIDE.drag * (tuck ? RIDE.tuck : 1) * st.v * st.v + RIDE.rub * smooth(RIDE.edge * R, WALL, dry);
    if (brake) acc -= RIDE.brake;
  }
  st.v = clamp(st.v + acc * dt, RIDE.carry, RIDE.top);
  const before = st.s;
  st.s += (st.v * dt) / Math.max(0.6, 1 + p.k * X.off); // the inside of a bend is the shorter way

  // ---- what lies in the water, what moves over it
  for (let q = n; q < list.length && list[q].s < st.s + 3; q++) {
    const t = list[q];
    if (t.kind === 'whirl' || cooled(t)) continue;
    if (t.kind === 'bar' || t.kind === 'slider') {
      if (!(before < t.s && st.s >= t.s && st.h < t.h)) continue;
      const at = t.kind === 'slider' ? sliderAt(t, st.clock) : t.u;
      if (Math.abs(st.u - at) >= t.half + RIDE.body) continue;
      // into a roll: over it all the same, tumbling, most of the speed gone
      bump(st, RIDE.bar, 2.2); st.bumps++; st.cool.set(t.index, st.clock + RIDE.again);
      events?.push({ type: 'bar', index: t.index });
    } else if (t.kind === 'spinner') {
      if (st.h >= t.h) continue;
      const th = spinnerAt(t, st.clock), es = Math.cos(th) * t.len, eu = Math.sin(th) * t.len, ps = st.s - t.s, pu = st.u - t.u;
      const k = clamp((ps * es + pu * eu) / (t.len * t.len), -1, 1);
      if (Math.hypot(ps - es * k, pu - eu * k) >= RIDE.body + 0.14) continue;
      // caught by an arm: knocked the way it turns
      bump(st, RIDE.arm, 2.2); st.bumps++; st.cool.set(t.index, st.clock + RIDE.again);
      st.w += clamp(((2 * Math.PI) / t.period) * k * es, -3, 3);
      events?.push({ type: 'arm', index: t.index });
    } else if (t.kind === 'block') {
      const front = t.s - t.len / 2, reach = t.half + RIDE.body;
      if (st.h >= t.h || Math.abs(st.u - t.u) >= reach) continue;
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
    }
  }
  // ---- the rows of blocks that part the lanes
  if (st.line < 0 && course.walls.length) {
    for (const wl of course.walls) {
      if (wl.to < before || wl.from > st.s) continue;
      const reach = wl.half + RIDE.body;
      if (st.h >= wl.h || Math.abs(st.u - wl.u) >= reach) continue;
      if (before < wl.from && Math.abs(uBefore - wl.u) < reach) {
        // onto the end of a row: knocked aside, a good part of the speed gone
        const sg = st.u < wl.u ? -1 : 1;
        st.v = Math.max(RIDE.carry, st.v * RIDE.nose); st.stun = 0.35; st.knocks++;
        st.u = wl.u + sg * (reach + 0.02); st.w = sg * 2;
        events?.push({ type: 'nose' });
      } else {
        // against its side: it guides (and takes a little speed while one leans on it)
        const sg = uBefore < wl.u ? -1 : 1;
        st.u = wl.u + sg * reach;
        if (st.w * sg < 0) { if (Math.abs(st.w) > 1.5) { st.knocks++; events?.push({ type: 'wall' }); } st.w *= -0.3; }
        st.v = Math.max(RIDE.carry, st.v * (1 - 0.5 * dt));
      }
    }
  }

  // ---- the lip of a gap, forks, arches, the end
  if (st.line < 0) {
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
  const q = ridePose(st, {}), side = st.u < 0 ? -1 : 1;
  // (what catches on the rim, or on the far lip of a gap, takes some of the speed)
  const keep = kind === 'side' ? 0.8 : kind === 'gap' ? 0.5 : 1, v = st.v * keep;
  const fly = { x: q.x + q.ux * 0.3, y: q.y + q.uy * 0.3, z: q.z + q.uz * 0.3, vx: q.fx * v, vy: q.fy * v, vz: q.fz * v, t: 0, side, kind, wet: false, down: false, yaw: q.yaw, pitch: q.pitch, roll: q.roll };
  if (kind === 'side') {
    // tipped over the rim: thrown outwards, hardly up — and down the outside of the trough
    const flat = Math.hypot(q.ux, q.uz) || 1, out = Math.max(3, Math.abs(st.w) * 0.8);
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
    Object.assign(st, { fly: null, line: -1, s: marks[st.mark].s + 0.5, u: 0, w: 0, v: RIDE.back, h: 0, vh: 0, stun: 0.3 });
    st.next.clear();
    events?.push({ type: 'back', mark: st.mark, on });
  }
}

const _f = { side: [0, 0, 0], up: [0, 0, 0] }, _q = {}, _y = {}, _y2 = {};
/**
 * Where the rider is in the world, and how they sit: { x, y, z (on the water of the trough), yaw, pitch (nose
 * down when negative), roll (leaning to the right when positive), fx, fy, fz (the way the line goes), ux, uy, uz
 * (out of the trough, where the rider is on it), ox, oy, oz (up the wall of the trough, away from its middle),
 * wide (half the width of the floor there, m),
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
      // over the rim: the ring goes on turning the way it rode up the wall, right over
      out.pitch = f.pitch * Math.max(0, 1 - f.t * 2);
      out.roll = f.roll + f.side * Math.min(f.t * 4.5, 3.6);
    } else {
      const k = Math.min(1, f.t * 4);
      out.pitch = f.pitch + (Math.max(-1.1, Math.atan2(f.vy, sp) * 0.7) - f.pitch) * k;
      out.roll = f.roll * (1 - k);
    }
    out.fx = f.dx; out.fy = 0; out.fz = f.dz; out.ux = 0; out.uy = 1; out.uz = 0; out.ox = 0; out.oy = 0; out.oz = 0;
    out.k = 0; out.slope = 0; out.bank = 0; out.wide = 0; out.flying = true; out.tumble = still ? 0 : f.t; out.wet = f.wet; out.down = f.down;
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
  out.k = p.k; out.slope = p.slope; out.bank = p.bank; out.wide = p.F; out.flying = false; out.tumble = 0; out.wet = false; out.down = false;
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
 *   careful  keeps to the water, goes round the whirlpools and the blocks, jumps what can be jumped, never takes
 *            a shortcut
 *   bold     the same lying back, through every shortcut
 *   { bold, cuts }  the two choices apart (lying back or not; the shortcuts or not)
 * It looks a second or so ahead, weighs where across the trough it would be best to be when it gets to what
 * lies there, and steers for that. Returns the input for stepRide.
 */
export function botInput(st, how = 'careful', out = { steer: 0, tuck: false, brake: false, jump: false }) {
  out.steer = 0; out.tuck = false; out.brake = false; out.jump = false;
  if (st.fly || st.spin > 0) return out;
  const course = st.course, cfg = typeof how === 'string' ? { bold: how !== 'careful', cuts: how === 'bold' } : how;
  const line = lineOf(course, st.line), p = lineAt(line, st.s, _q);
  const gp = RIDE.g * Math.sqrt(Math.max(0, 1 - p.ty * p.ty)), apex = (st.v * RIDE.jump) / gp; // how far one travels before the top of a jump
  const horizon = Math.max(12, st.v * 1.25), body = RIDE.body;
  let tuck = cfg.bold, brake = false;

  // ---- what is ahead: what is jumped, and what one must be clear of (where across, how wide, how far)
  const clear = []; // { d, u, half, soft (how far its pull is felt), wall }
  for (const t of thingsOf(course, st.line)) {
    const d = t.s - st.s;
    if (d < -2.5) continue;
    if (d > horizon) break;
    if (t.kind === 'bar' || t.kind === 'slider' || t.kind === 'spinner') {
      const span = t.kind === 'bar' ? t.half : t.kind === 'slider' ? t.amp + t.half : t.len;
      if (d > 0.2 && d <= apex + 0.3 && st.h <= 0 && Math.abs(st.u - t.u) < span + body + 0.35) out.jump = true;
    } else if (t.kind === 'block') { if (d > -t.len) clear.push({ d: Math.max(0, d - t.len / 2), u: t.u, half: t.half + body + 0.16, soft: 0 }); }
    else if (!((st.cool.get(t.index) || 0) > st.clock)) {
      clear.push({ d: Math.max(0, d - t.core), u: t.u, half: t.core + 0.5, soft: t.reach });
      // (a whirlpool there was no getting round in time: over it)
      if (d > 0.2 && d <= apex + 0.3 && st.h <= 0 && Math.abs(st.u - t.u) < t.core + 0.45) out.jump = true;
    }
  }
  let lane = null;
  if (st.line < 0) {
    for (const wl of course.walls) if (wl.to > st.s - 0.5 && wl.from < st.s + horizon) clear.push({ d: Math.max(0, wl.from - st.s), u: wl.u, half: wl.half + body + 0.14, soft: 0, wall: wl });
    lane = course.lanes.find((z) => st.s > z.from - horizon && st.s < z.to) || null;
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
  let best = 0, least = Infinity;
  const force = RIDE.steer * (cfg.bold ? 0.75 : 1);
  for (let c = -room; c <= room + 1e-6; c += 0.1) {
    let cost = 0.3 * Math.abs(c - st.u) + 0.45 * Math.abs(c - (st.aim ?? 0));
    // (where the bend would not let one stay, whatever the steering)
    const Xc = across(p.F, c, _y), Ac = Xc.tilt + p.bank, effort = Math.abs(gp * Math.sin(Ac) - st.v * st.v * p.k * Math.cos(Ac)) / force;
    if (effort > 0.8) cost += 40 * (effort - 0.8);
    // (the water: down the middle of a plain trough, down the middle of a lane, anywhere on the floor of a pool)
    if (lane && st.s > lane.from - 6) cost += 1.2 * Math.min(...lane.centres.map((m) => Math.abs(c - m)));
    else cost += (fAhead > 1 ? 0.25 : 1.4) * Math.abs(c);
    if (side === 9) cost += 3 * Math.abs(c);
    else if (side) cost += c * side > (cfg.cuts ? 0.64 : 0.5) ? 0 : 60 + 8 * Math.abs(c - side);
    for (const o of clear) {
      const near = 1 / (1 + (o.d / Math.max(4, st.v * 0.45)) ** 2), gapTo = Math.abs(c - o.u);
      if (o.wall) {
        // (a row of blocks: not on it — and not across it, unless there is time to be across before it begins)
        const cross = (st.u - o.u) * (c - o.u) < 0, time = Math.abs(c - st.u) / 4.5 + 0.15;
        if (gapTo < o.half) cost += 400;
        else if (cross && o.d < st.v * time) cost += 400;
        continue;
      }
      if (gapTo < o.half) cost += 300 * near;
      else {
        if (gapTo < o.half + 0.25) cost += 2.5 * near * (1 - (gapTo - o.half) / 0.25);
        // (nor on the far side of it, when there is no time left to get across before it)
        if ((st.u - o.u) * (c - o.u) < 0 && Math.abs(st.u - o.u) < o.half + 0.4 && o.d < st.v * (Math.abs(c - st.u) / 4.5 + 0.15)) cost += 300 * near;
      }
      if (o.soft && gapTo < o.soft) cost += 5 * near * (1 - gapTo / o.soft);
    }
    if (cost < least) { least = cost; best = c; }
  }
  st.aim = best;
  // (not yet where it must be, and little time left: the careful rider sits up and brakes)
  for (const o of clear) {
    if (o.wall || Math.abs(st.u - o.u) >= o.half) continue;
    if (o.d < st.v * 0.7 && !cfg.bold) brake = true;
    tuck = false;
  }
  if (st.line < 0) {
    // a gap: fast enough, the ramp does it; else (and always, for the careful) a jump right at the lip
    for (const g of course.gaps) {
      const d = g.from - st.s, need = ((g.to - g.from) * gp) / (2 * RIDE.kick) + 1.5;
      if (d > 0 && d <= st.v * 0.05 + 0.3 && st.h <= 0 && (!cfg.bold || st.v < need)) out.jump = true;
    }
    if (fork && cfg.cuts) {
      // (too fast, a bend throws one away from the inside, where a shortcut leaves: slow down until it can be reached)
      const X = across(p.F, best, _y), A = X.tilt + p.bank, needed = Math.abs(gp * Math.sin(A) - st.v * st.v * p.k * Math.cos(A)) / RIDE.steer;
      if (needed > 0.8 || (st.u * fork.side < 0.25 && fork.from - st.s < st.v * 0.9)) { brake = true; tuck = false; }
    } else if (fork) tuck = false;
  }
  // steer: what holds the rider at `best` against the bend, plus what closes the gap
  const X = across(p.F, best, _y), A = X.tilt + p.bank, hold = (gp * Math.sin(A) - st.v * st.v * p.k * Math.cos(A)) / RIDE.steer;
  out.steer = clamp((st.h > 0.05 ? 0 : hold) + (best - st.u) * 2.35 - st.w * 0.52, -1, 1);
  out.tuck = tuck && !brake; out.brake = brake;
  return out;
}

/** Rides the whole course with the bot: { time (ms), falls, bumps, caught, jumps, knocks, took (the shortcuts), top (m/s), over }. */
export function botRun(course, how = 'careful', limit = 900) {
  const st = startRide(course), input = { steer: 0, tuck: false, brake: false, jump: false };
  let top = 0;
  for (let t = 0; t < limit && !st.over; t += RIDE.step) {
    botInput(st, how, input);
    if (input.jump) st.wantJump = 0.14;
    sub(st, RIDE.step, input, null);
    if (st.v > top) top = st.v;
  }
  return { time: st.time, falls: st.falls, bumps: st.bumps, caught: st.caught, jumps: st.jumps, knocks: st.knocks, took: st.took, top, over: st.over };
}
