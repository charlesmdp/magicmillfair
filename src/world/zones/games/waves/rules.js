// Big Tsunami: its rules. No renderer here: the game, its checks and the runner that plays by itself all read this.
//
// A bank of sand lies just off the beach, sixteen metres wide and nine deep, a lagoon behind it. The sea comes in
// over it, wave after wave, and one holds the bank: one runs where one likes, jumps, jumps again in the air.
// The waves are of five kinds, each read from far by its shape:
//   a roller     low, from one end of the bank to the other: a hop
//   a sweeper    a crest that comes at an angle and sweeps the bank from one side to the other: a hop, in time
//   a wall       tall, with one low end: two jumps, or a hop at its low end
//   a breaker    tall, but it covers only a part of the width: one runs round it
//   a great one  far too tall for two jumps, with one low gap: one finds the gap and hops through it
// and the rollers also come by twos and threes, close together, like a skipping rope.
//
// A wave that catches one does not end the run: it knocks one down and carries one towards the beach, the
// further the taller it stood there; the backwash pulls one out again a little, one gets up and runs back. The
// run ends when one is carried off the back of the bank, into the lagoon. So where one stands is what one has
// left: far forward there is room to be thrown back, but the waves stand tallest at the front edge and lose a
// third of their height crossing the bank; at the back they are low, and one mistake is the last.
//
// The sea is the same for everybody — it goes by the clock of the world — and it has a mood that everybody
// shares, on a cycle of two and a half minutes: it lies flat for a moment (the lull), builds, goes wild, ends on
// three great ones while the wild sea goes on, and begins again. One starts whenever one likes — who wants a long
// run waits for the lull, who jumps into the wild sea is thrown about at once; what counts is how long one held.
//
// Places: `s` metres out from the beach (the bank lies from `back` to `front`), `u` metres across (to the right
// of who looks out to sea when positive). Time advances in steps of 1/120 s whatever the frame rate.

export const WAVES = {
  name: 'Big Tsunami',
  from: { x: 47, z: -60 }, yaw: 1.2217, // the root, at the water's edge, and the way out to sea (0 looks south: this is east, a little south)
  back: 6, front: 15, half: 8, // the bank: from so far to so far out; so far to each side of its middle
  edge: 0.35, // m: how near its edges one runs
  step: 1 / 120,
  run: 6.5, accel: 60, air: 28, // m/s; how fast one gets there on the sand and in the air (m/s²)
  g: 22, jump: 7.4, again: 7.0, // m/s², m/s up: a jump (a metre and a quarter), and the second one in the air
  far: 50, end: 4, reach: 2.5, // m out: where the waves rise out of the sea, where they die; m beyond the bank that a crest goes on, each side
  swell: 0.3, // far out a wave is this much lower than at the front edge of the bank
  loss: 1 / 3, // of its height: what a wave loses crossing the bank
  knee: 0.35, // m: lower than this where one is, a wave only wets
  clear: 0.8, // feet this high, as a share of the height of the crest, are over it
  thick: [0.3, 0.12], // m: how far each side of its crest a wave reaches: so much, and so much per metre of height
  carry: 1.8, // m one is carried per metre of wave
  fling: 12, slow: [0.25, 0.6], // m/s: how fast the tallest fling one at first; s: how fast the push dies away, at the least and at the most
  lying: 0.75, // a wave that finds one down already carries one this share as far
  down: [0.85, 0.22], // s without control after a hit: so much, and so much per metre of wave
  wash: [0.55, 1.5], // the backwash, once the push is spent: it lasts so long, and pulls seaward this fast (m/s, for a wave of 1.5 m and more)
  off: 0.25, // m behind the back edge: carried so far, one is off the bank
  close: 0.2, // m: over a crest by less than this is a narrow escape
  grace: 2.5, // s: one gets ready — what comes by in that time does not count
  start: 10.5, // m out: where a run begins
  // ---- the mood of the sea, by the second of its cycle: flat until `lull`, building until `wild`, wild until
  // `greats`, then the great ones
  cycle: 150, lull: 13, wild: 100, greats: 130,
  pause: [2.0, 0.78], // s between one wave (or one set) and the next: when the sea begins to build, when it is wild
  tall: [0.5, 1], // from so wild on (0 … 1), a wall or a breaker comes after so many small ones (a set counts for one) at the most
  kinds: {
    roller: { h: [0.95, 1.15], v: 7.2 }, // h: m tall at the front edge of the bank; v: m/s
    sweeper: { h: [1.0, 1.25], tall: [1.6, 1.85], v: 6.6, k: [0.42, 0.62] }, // k: m further out per metre across (its angle); tall: the ones of a wild sea
    wall: { h: [2.6, 3.2], wild: 0.1, v: 5.4, low: [4.6, 3.6], floor: 0.9, edge: 1.6 }, // low: m of its low end (building, wild); floor: how tall it stands there
    breaker: { h: [2.6, 3.2], wild: 0.1, v: 6.0, cover: [0.5, 0.64], edge: 1.2 }, // cover: the share of the width it covers
    great: { h: 4.6, v: 4.4, gap: 1.9, floor: 0.75, edge: 1.4, every: 5.5, last: 3, quiet: [2.2, 1.0], after: 1.5 }, // gap: half the width of its gap; the cycle ends on `last` of them, `every` s apart
  },
  set: [0.9, 0.74], // s between the rollers of a set: building, wild
  // the runner that plays by itself: how far ahead it looks (s; `far`: for a great one), how often it thinks
  // again (s), how long a wave that becomes the next one takes it to take in (s), how far off its timing may be
  // (s), where it stands between waves, what it takes on with one jump and with two (m, feet)
  bot: { sight: 2.2, far: 3.4, think: 0.1, react: 0.3, late: 0.1, home: 12.5, hop: 1.0, twice: 1.9 },
};

/** Its line for the boards of scores: how long one held (ms), the longer the better. */
export const BOARD = { order: 'desc', min: 2500, max: 900000 };

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const hash = (n, k = 0) => { const s = Math.sin(n * 127.1 + k * 311.7 + 74.7) * 43758.5453; return s - Math.floor(s); };
/** A row of numbers between 0 and 1 that is the same for the same seed. */
const row = (seed) => { let a = Math.imul(seed | 0, 0x9E3779B1) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** How wild the sea is at second `tau` of its cycle: 0 (flat) … 1. */
const levelAt = (tau) => { const W = WAVES; return tau < W.lull ? 0 : tau < W.wild ? 0.2 + 0.6 * (tau - W.lull) / (W.wild - W.lull) : tau < W.greats ? 0.8 + 0.2 * Math.min(1, (tau - W.wild) / 12) : 1; };

/**
 * The mood of the sea at `clock` (s of the world's clock): { name, next (what comes after), wait (s until then),
 * level (0 … 1), tau (the second of the cycle) }.
 */
export function mood(clock, out = {}) {
  const W = WAVES, tau = clock - Math.floor(clock / W.cycle) * W.cycle;
  if (tau < W.lull) { out.name = 'flat'; out.next = 'building'; out.wait = W.lull - tau; }
  else if (tau < W.wild) { out.name = 'building'; out.next = 'wild'; out.wait = W.wild - tau; }
  else if (tau < W.greats) { out.name = 'wild'; out.next = 'great ones'; out.wait = W.greats - tau; }
  else { out.name = 'great ones'; out.next = 'a lull'; out.wait = W.cycle - tau; }
  out.level = levelAt(tau); out.tau = tau;
  return out;
}
/** The same, as the arch says it: "the sea: building, wild in 40 s". */
export const moodLine = (clock) => { const m = mood(clock, _m); return `the sea: ${m.name}, ${m.next} in ${Math.max(1, Math.ceil(m.wait))} s`; };

const _seas = new Map(), _m = {};
/**
 * The waves of cycle `c` of the sea — the same for everybody —, in the order they come:
 *   { id, kind, t (s of the world's clock: when its crest is on the front edge of the bank, in the middle),
 *     h (m tall there), v (m/s), k (its angle: m further out per metre across), set, of (the n-th of so many),
 *     a, b, edge, low, inv: its shape across — between `a` and `b` it stands at its full height and outside at
 *     `low` times that (`inv`: the other way round), going from one to the other over `edge` metres;
 *     dir (a wall: which end is the low one), gap (a great one: where its gap is), born, dies }
 */
export function seaOf(c) {
  let sea = _seas.get(c);
  if (sea) return sea;
  const W = WAVES, K = W.kinds, rnd = row(c), t0 = c * W.cycle, pick = (r) => r[0] + (r[1] - r[0]) * rnd();
  sea = [];
  const add = (kind, tau, o) => {
    const k = K[kind], w = { id: c * 256 + sea.length, kind, t: t0 + tau, h: typeof k.h === 'number' ? k.h : pick(k.h), v: k.v, k: 0, a: -99, b: 99, edge: 1, low: 1, inv: false, set: 0, of: 0, dir: 0, gap: 0, ...o };
    const lag = Math.abs(w.k) * (W.half + W.reach) / w.v;
    w.born = w.t - (W.far - W.front) / w.v - lag; w.dies = w.t + (W.front - W.end) / w.v + lag;
    sea.push(w);
    return w;
  };
  const great = (tau, gap) => add('great', tau, { a: gap - K.great.gap, b: gap + K.great.gap, edge: K.great.edge, low: K.great.floor / K.great.h, inv: true, gap });
  // ---- building, then wild: one wave or one set after the other, closer and taller as the mood rises. The
  // great ones have their moments: one somewhere in the building part, the sea quiet before it, and three at
  // the end of the cycle, each with its gap on the other half of the bank, while the wild sea goes on
  const moments = [W.lull + (W.wild - W.lull) * (0.45 + 0.25 * rnd())];
  for (let i = 0; i < K.great.last; i++) moments.push(W.greats + 3.5 + i * K.great.every);
  let tau = W.lull + 0.4, last = '', small = 0, gap = (rnd() * 2 - 1) * 5.5;
  while (moments.length || tau < W.cycle - 5) {
    const m = levelAt(tau), wild = clamp((m - 0.6) / 0.4, 0, 1), pause = lerp(W.pause[0], W.pause[1], (m - 0.2) / 0.8) * (0.85 + 0.3 * rnd());
    const room = m < 0.8 ? K.great.quiet[0] : K.great.quiet[1];
    if (moments.length && tau > moments[0] - room) {
      tau = Math.max(moments.shift(), tau - pause + room);
      great(tau, gap);
      gap = (gap > 0 ? -1 : 1) * (1 + rnd() * 5);
      tau += K.great.after; last = 'great';
      continue;
    }
    if (tau >= W.cycle - 5) break;
    const lots = [['roller', 2.4 * (1 - m) + 0.3], ['sweeper', 1.3], ['wall', 0.9 + m], ['breaker', 1 + 0.8 * m], ['two', 0.9 + 0.6 * m], ['three', 0.15 + 1.5 * m]].filter((l) => l[0] === 'roller' || l[0] !== last);
    let x = rnd() * lots.reduce((sum, l) => sum + l[1], 0), what = lots[0][0];
    for (const l of lots) { if (x < l[1]) { what = l[0]; break; } x -= l[1]; }
    // (a wild sea never sends three small ones running)
    const tall = what === 'wall' || what === 'breaker';
    if (!tall && wild >= W.tall[0] && small >= W.tall[1]) what = last === 'wall' ? 'breaker' : last === 'breaker' ? 'wall' : rnd() < 0.5 ? 'wall' : 'breaker';
    // (what would still be coming in when a great one is due makes way for a roller)
    const every = lerp(W.set[0], W.set[1], m);
    if (moments.length && tau + (what === 'three' ? 2 * every : what === 'two' ? every : what === 'sweeper' ? 1.5 : 0) > moments[0] - room) what = 'roller';
    small = what === 'wall' || what === 'breaker' ? 0 : small + 1;
    let took = 0;
    if (what === 'roller') add('roller', tau);
    else if (what === 'sweeper') {
      // (its first end is on the bank before `t`, its last after: the pause is counted from end to end)
      const k = (rnd() < 0.5 ? -1 : 1) * pick(K.sweeper.k), lag = Math.abs(k) * W.half / K.sweeper.v, tall = wild > 0 && rnd() < 0.4;
      tau += lag; took = lag;
      add('sweeper', tau, { k, h: pick(tall ? K.sweeper.tall : K.sweeper.h) });
    } else if (what === 'wall') {
      const dir = rnd() < 0.5 ? -1 : 1, low = lerp(K.wall.low[0], K.wall.low[1], m), w = add('wall', tau, { dir, inv: true, edge: K.wall.edge });
      w.h *= 1 + K.wall.wild * wild; w.low = K.wall.floor / w.h;
      if (dir > 0) w.a = W.half - low; else w.b = -(W.half - low);
    } else if (what === 'breaker') {
      const wide = pick(K.breaker.cover) * 2 * W.half, where = rnd(), w = add('breaker', tau, { low: 0, edge: K.breaker.edge });
      w.h *= 1 + K.breaker.wild * wild;
      if (where < 0.32) { const mid = (rnd() - 0.5) * 3; w.a = mid - wide / 2; w.b = mid + wide / 2; } // (in the middle: free at both ends)
      else if (where < 0.66) w.b = -W.half + wide; else w.a = W.half - wide;
    } else {
      const n = what === 'two' ? 2 : 3;
      for (let i = 0; i < n; i++) add('roller', tau + i * every, { set: i + 1, of: n });
      took = (n - 1) * every;
    }
    last = what; tau += took + pause;
  }
  if (_seas.size > 12) _seas.delete(_seas.keys().next().value);
  _seas.set(c, sea);
  return sea;
}

/** The waves that are on the sea at `clock`, or will be within `lead` seconds, or were `trail` seconds ago: `list` is filled and returned. */
export function seaAt(clock, list = [], lead = 0, trail = 0) {
  const c = Math.floor(clock / WAVES.cycle);
  list.length = 0;
  for (let k = c - 1; k <= c + 1; k++) for (const w of seaOf(k)) if (w.born <= clock + lead && w.dies + trail >= clock) list.push(w);
  return list;
}

/** Where the crest of the wave `w` is at `clock`, `u` metres across: metres out. */
export const crestAt = (w, clock, u = 0) => WAVES.front + w.v * (w.t - clock) + w.k * u;

/** The share of its height that the wave `w` has `u` metres across (its low end, its gap, where it stops). */
export function shapeAt(w, u) {
  if (w.low === 1) return 1;
  const x = clamp(Math.min(u - w.a, w.b - u) / w.edge + 0.5, 0, 1), sm = x * x * (3 - 2 * x);
  return w.inv ? 1 + (w.low - 1) * sm : w.low + (1 - w.low) * sm;
}

/**
 * How tall the wave `w` stands when its crest is `s` metres out, `u` metres across: it rises out of the sea,
 * stands up as it comes in, is at its tallest on the front edge of the bank, loses a third crossing it, and
 * dies in the lagoon.
 */
export function heightAt(w, s, u) {
  const W = WAVES;
  if (s <= W.end || s >= W.far) return 0;
  const grown = s >= W.front ? Math.min(1, (W.far - s) / 9) * (1 - W.swell * Math.min(1, (s - W.front) / 16))
    : s >= W.back ? 1 - W.loss * (W.front - s) / (W.front - W.back)
      : (1 - W.loss) * (s - W.end) / (W.back - W.end);
  return w.h * grown * shapeAt(w, u);
}

/** A runner on the bank. `t0`: the clock of the world when the run begins (s). `u`: where across. */
export function startRun(t0 = 0, u = 0) {
  return {
    s: WAVES.start, u, vs: 0, vu: 0, h: 0, vh: 0, twice: false, clock: 0, acc: 0, t0, want: 0,
    down: 0, slow: WAVES.slow[0], wash: 0, washV: 0, hits: 0, cleared: 0, last: '', over: false, time: 0, cause: '',
    near: [], nearAt: -1e9, seen: new Set(), margin: new Map(),
  };
}

/** The waves the runner has to do with now (kept on the run, looked up again four times a second). */
function nearOf(st, now) {
  if (now < st.nearAt) return st.near;
  seaAt(now, st.near, 0.5);
  st.nearAt = now + 0.25;
  if (st.seen.size > 40) { const keep = new Set(); for (const w of st.near) if (st.seen.has(w.id)) keep.add(w.id); st.seen = keep; }
  return st.near;
}

/**
 * Advances a run by `dt` seconds. `input`: { x, y (-1 … 1: to the right, out to sea), jump (true on the frame it
 * is asked) }. `events`: { type: 'jump' | 'again' | 'land' | 'wet' (a wave too low to matter went by) | 'clear'
 * (kind, close: one was got over, or round) | 'hit' (kind, H: how tall it stood, push: how far it carries) |
 * 'up' (on one's feet again) | 'out' (kind, time: carried off the back of the bank) }.
 */
export function stepRun(st, dt, input, events) {
  if (input?.jump) st.want = 0.12;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= WAVES.step && !st.over) { st.acc -= WAVES.step; sub(st, WAVES.step, input, events); }
  return st;
}

function sub(st, dt, input, events) {
  const W = WAVES;
  st.clock += dt;
  if (st.want > 0) st.want -= dt;
  const now = st.t0 + st.clock;
  if (st.down > 0) {
    // ---- down: carried by the push of the wave, which dies away; then the backwash
    st.down -= dt;
    const k = Math.exp(-dt / st.slow);
    st.vs *= k; st.vu *= k;
    if (st.down <= 0) events?.push({ type: 'up' });
  } else {
    // ---- on one's feet (or in the air): where the stick says
    let x = clamp(input?.x || 0, -1, 1), y = clamp(input?.y || 0, -1, 1);
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    const a = (st.h > 0 ? W.air : W.accel) * dt, du = x * W.run - st.vu, ds = y * W.run - st.vs, d = Math.hypot(du, ds);
    if (d <= a) { st.vu = x * W.run; st.vs = y * W.run; } else { st.vu += (du / d) * a; st.vs += (ds / d) * a; }
    if (st.want > 0) {
      if (st.h <= 0) { st.vh = W.jump; st.h = 1e-3; st.want = 0; st.twice = false; events?.push({ type: 'jump' }); }
      else if (!st.twice) { st.vh = W.again; st.twice = true; st.want = 0; events?.push({ type: 'again' }); }
    }
  }
  if (st.wash > 0) { st.wash -= dt; if (st.wash <= W.wash[0]) st.s += st.washV * dt; }
  st.s += st.vs * dt; st.u += st.vu * dt;
  if (st.h > 0) { st.h += st.vh * dt - 0.5 * W.g * dt * dt; st.vh -= W.g * dt; if (st.h <= 0) { st.h = 0; st.vh = 0; events?.push({ type: 'land' }); } }
  // ---- the edges of the bank: one does not run off it — only a wave takes one off, and only off the back
  const side = W.half - W.edge;
  if (Math.abs(st.u) > side) { st.u = clamp(st.u, -side, side); st.vu = 0; }
  if (st.s > W.front - W.edge) { st.s = W.front - W.edge; if (st.vs > 0) st.vs = 0; }
  if (st.down <= 0 && st.s < W.back + W.edge) { st.s = Math.min(W.back + W.edge, st.s + 3 * dt); if (st.vs < 0) st.vs = 0; }
  if (st.s < W.back - W.off) {
    st.over = true; st.time = Math.round(st.clock * 1000); st.cause = st.last;
    events?.push({ type: 'out', kind: st.last, time: st.time });
    return;
  }
  // ---- the waves: each goes by once — over one's head, under one's feet, or round one
  for (const w of nearOf(st, now)) {
    if (st.seen.has(w.id)) continue;
    const d = crestAt(w, now, st.u) - st.s;
    if (d > 1.2) continue;
    const H = heightAt(w, st.s, st.u), reach = W.thick[0] + W.thick[1] * H;
    if (d > reach) continue;
    if (st.clock <= W.grace) { st.seen.add(w.id); continue; } // (one is getting ready: it does not count)
    if (d < -reach) {
      // (it has gone by)
      st.seen.add(w.id);
      const m = st.margin.get(w.id); st.margin.delete(w.id);
      st.cleared++;
      if (m !== undefined) events?.push({ type: 'clear', kind: w.kind, close: m < W.close });
      else if (H >= 0.08) events?.push({ type: 'wet' });
      else events?.push({ type: 'clear', kind: w.kind, close: Math.max(heightAt(w, st.s, st.u - 1), heightAt(w, st.s, st.u + 1)) >= 1.2 }); // (round it: closely, when it stood tall a step away)
      continue;
    }
    if (H < W.knee) continue;
    const over = st.h - H * W.clear;
    if (over >= 0) { const m = st.margin.get(w.id); if (m === undefined || over < m) st.margin.set(w.id, over); continue; }
    // ---- caught: knocked down and carried the way the wave goes, the further the taller it stands here
    const push = W.carry * H * (st.down > 0 ? W.lying : 1), n = Math.hypot(1, w.k), slow = clamp(push / W.fling, W.slow[0], W.slow[1]);
    if (st.down <= 0) { st.vs = Math.min(st.vs, 0); st.vu = 0; st.slow = slow; } else st.slow = Math.max(st.slow, slow);
    st.vs -= push / st.slow / n; st.vu += (push / st.slow) * (w.k / n);
    if (st.vh > 2) st.vh = 2;
    // (down until the push is spent and the backwash has had its moment)
    st.wash = 2.5 * st.slow + W.wash[0]; st.washV = W.wash[1] * Math.min(1, H / 1.5);
    st.down = Math.max(st.down, W.down[0] + W.down[1] * H, st.wash - 0.15);
    st.hits++; st.last = w.kind; st.seen.add(w.id); st.margin.delete(w.id);
    events?.push({ type: 'hit', kind: w.kind, H, push });
  }
}

/** Where a place of the bank is on the plan: { x, z }. */
export function bankAt(s, u, out = {}) {
  const W = WAVES, fx = Math.sin(W.yaw), fz = Math.cos(W.yaw);
  out.x = W.from.x + fx * s - fz * u; out.z = W.from.z + fz * s + fx * u; // (to the right of the way out: (-cos, sin) of its heading)
  return out;
}

/**
 * The waves that will be on the runner within `within` seconds and have not gone by, the nearest first:
 * [{ w (see seaOf), t (s until its crest is where the runner is now) }]. `list` is filled and returned.
 */
export function ahead(st, within = 2.5, list = []) {
  const now = st.t0 + st.clock;
  let n = 0;
  for (const w of nearOf(st, now)) {
    if (st.seen.has(w.id)) continue;
    const t = (crestAt(w, now, st.u) - st.s) / w.v;
    if (t > within) continue;
    const e = list[n] || (list[n] = {}); e.w = w; e.t = t; n++;
  }
  list.length = n;
  return list.sort((p, q) => p.t - q.t);
}

/**
 * A runner that plays by itself — the proof that the sea can be held, and a fair picture of somebody good at
 * it rather than of a machine: it deals with one wave at a time, sees it two seconds ahead, takes a moment to
 * take in the next, and its timing is a little off. For the wave that comes it picks the nearest place that
 * asks for the least — round it, a hop, two jumps —, and jumps so as to be at the top over the crest; between
 * waves it goes back to the front part of the bank, where there is room to be thrown back. A sea that leaves
 * it the time, it holds; a wild one is too quick for it.
 * Returns the input for stepRun.
 */
export function botInput(st, out = { x: 0, y: 0, jump: false }) {
  const W = WAVES, B = W.bot, bot = st.bot || (st.bot = { list: [], s: B.home, u: st.u, next: 0, hold: 0, id: -1 });
  out.x = 0; out.y = 0; out.jump = false;
  if (st.down > 0 || st.over) { bot.next = 0; return out; }
  const now = st.t0 + st.clock, list = ahead(st, B.far, bot.list);
  for (let i = list.length - 1; i >= 0; i--) if (list[i].t > B.sight && list[i].w.kind !== 'great') list.splice(i, 1); // (the great ones are seen from far)
  // what a wave asks for at a place: 0 (nothing: it only wets there), 1 (a hop), 2.5 (two jumps), 30 and more (too tall)
  const asks = (w, s, u) => { const H = heightAt(w, s, u), need = H * W.clear; return H < W.knee ? 0 : need <= B.hop ? 1 : need <= B.twice ? 2.5 : 30 + need; };
  // ---- where to be (a wave that becomes the next one takes a moment to be taken in)
  const first = list[0];
  if (!first) bot.id = -1; else if (first.w.id !== bot.id) { bot.id = first.w.id; bot.hold = st.clock + B.react; }
  if (st.clock >= bot.next && st.clock >= bot.hold) {
    bot.next = st.clock + B.think;
    bot.s = B.home; bot.u = clamp(st.u, -W.half + 2, W.half - 2);
    if (first) {
      let best = 1e9;
      for (const cs of [B.home, st.s, 10.5, 8.5]) for (let cu = -W.half + 0.5; cu <= W.half - 0.49; cu += 0.6) {
        const dist = Math.hypot(cs - st.s, cu - st.u), t = (crestAt(first.w, now, cu) - cs) / first.w.v;
        if (dist > 0.4 && dist / W.run > t - 0.12) continue; // (not there in time)
        const cost = asks(first.w, cs, cu) + dist * 0.1 + (B.home - cs) * 0.22 + Math.abs(cu) * 0.02;
        if (cost < best) { best = cost; bot.s = cs; bot.u = cu; }
      }
      if (best >= 1e9) { bot.s = st.s; bot.u = st.u; }
    }
  }
  const ds = bot.s - st.s, du = bot.u - st.u, dist = Math.hypot(ds, du);
  if (dist > 0.12) { const k = Math.min(1, dist * 4) / dist; out.x = du * k; out.y = ds * k; }
  // ---- when to jump: for the first wave that will matter where one will be by then
  for (const e of list) {
    const w = e.w;
    // (where one will be when its crest is there: one is on one's way to the place chosen)
    let t = e.t, ps = st.s, pu = st.u;
    for (let i = 0; i < 2; i++) { const f = dist > 1e-3 ? Math.min(1, (W.run * Math.max(0, t)) / dist) : 0; ps = st.s + ds * f; pu = st.u + du * f; t = (crestAt(w, now, pu) - ps) / w.v; }
    const H = heightAt(w, ps, pu);
    if (H < W.knee) continue;
    const need = H * W.clear + 0.08, half = (W.thick[0] + W.thick[1] * H) / w.v, off = (hash(w.id, 5) * 2 - 1) * B.late;
    const T1 = W.jump / W.g, T2 = W.again / W.g;
    if (st.h <= 0) {
      if (t <= (need <= B.hop + 0.08 ? T1 : T1 + T2) + off) out.jump = true;
    } else if (!st.twice) {
      // in the air: is this arc over it? Can one land and jump again in time? Else the second jump, its top on the crest
      const at = (x) => st.h + st.vh * x - 0.5 * W.g * x * x;
      if (Math.min(at(Math.max(0, t - half)), at(t + half)) < need) {
        const land = (st.vh + Math.sqrt(st.vh * st.vh + 2 * W.g * st.h)) / W.g, rise = need < 1.2 ? (W.jump - Math.sqrt(W.jump * W.jump - 2 * W.g * need)) / W.g : 9;
        if (land + rise + half + 0.05 > t && t <= T2 + off) out.jump = true;
      }
    }
    break;
  }
  return out;
}

/** Who stands where the run begins and does nothing; who only hammers the jump. */
export function stillInput(st, out = { x: 0, y: 0, jump: false }) { out.x = 0; out.y = 0; out.jump = false; return out; }
export function hammerInput(st, out = { x: 0, y: 0, jump: false }) { out.x = 0; out.y = 0; out.jump = st.h <= 0; return out; }

/** A run from `t0` with the bot (or with `drive`), for `limit` seconds at the most: { time (ms), hits, cleared, cause, over, s }. */
export function botRun(t0 = 0, limit = 600, drive = botInput) {
  const st = startRun(t0), input = { x: 0, y: 0, jump: false };
  for (let t = 0; t < limit && !st.over; t += WAVES.step) { drive(st, input); stepRun(st, WAVES.step, input, null); }
  return { time: st.over ? st.time : Math.round(st.clock * 1000), hits: st.hits, cleared: st.cleared, cause: st.cause, over: st.over, s: st.s };
}
