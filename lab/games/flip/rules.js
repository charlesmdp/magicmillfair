// Head Over Heels: its rules. No renderer here: the game, its checks and the runner that plays by itself all
// read this.
//
// A line of painted girders on pylons over the sea, along the south side of the pier. One runs along it by
// oneself, faster and faster, and has one key: it turns gravity over. One then falls up to the underside of what
// is above — or back down onto what is below — and runs on there, head down. Gravity is turned over only while
// one's feet are on a girder (or have just left it), never in the air. Running into the end of a girder, falling
// into the sea or up into the sky is a fall: one is put back at the last flag after a moment, and the clock runs
// on. Sparks hang along the less obvious ways: each one caught takes a quarter of a second off the clock.
//
// Places on the line: `s` metres along it from its start, `y` metres above the sea. Seen from the side a girder
// is a box { from, to, bottom, top }. The runner is a box too, `body.tall` high: its feet are the end gravity
// pulls towards. Time advances in steps of 1/120 s whatever the frame rate; nothing here is drawn by lot.
import { pierToWorld } from '../../../src/world/layout/layout.js';

const T = 0.5; // m: how thick a girder is
const F = 3.6, C = 8.5, M = 5.8; // the top of the floor, the underside of the ceiling, the underside of a girder half-way
const floor = (from, to, top = F) => ({ from, to, bottom: top - T, top, kind: 'floor' });
const ceiling = (from, to, bottom = C) => ({ from, to, bottom, top: bottom + T, kind: 'ceiling' });
const mid = (from, to, bottom = M) => ({ from, to, bottom, top: bottom + T, kind: 'mid' });
/** A block that stands on the floor, and one that hangs from the ceiling: one passes them on the other side. */
const stud = (from, long = 1.2) => ({ from, to: from + long, bottom: F, top: F + 1.8, kind: 'stud' });
const fang = (from, long = 1.2) => ({ from, to: from + long, bottom: C - 1.8, top: C, kind: 'fang' });

export const FLIP = {
  name: 'Head Over Heels',
  along: 42, side: 34, // where the line begins, in the frame of the pier (pierToWorld): ten metres off the south edge of its head
  length: 158, // m, from the start to the arch of the end
  step: 1 / 120,
  speed: [5.2, 8.5], // m/s: at the start, at the end (it grows with the metres run)
  g: 40, // m/s²: it is a fairground, not a planet
  body: { half: 0.3, tall: 1.7, thin: 0.07 }, // the runner; `thin`: how much of its half width the end of a girder forgives
  buffer: 0.14, coyote: 0.08, // s: a key pressed so long before the feet touch still counts; and so long after they have left
  count: 3, // s before one runs
  fall: { out: 0.9, hold: 0.5 }, // s: out for so long after a fall, then standing at the flag so long
  sea: 0.2, sky: 15, // m: below, one is in the sea; above, one is gone
  spark: { reach: 0.95, worth: 0.25 }, // caught within so many metres of the middle of the body; s off the clock for each
  levels: { floor: F, ceiling: C, mid: [M, M + T], thick: T },
  gate: -13.2, // m along the line (before its start): where one asks to run, on the sand of the south beach
  // ---- the course: five stretches, a flag at the start of each of the first four
  stretches: [
    { from: 0, name: 'Easy Does It' }, { from: 38, name: 'The Steps' }, { from: 80.5, name: 'In Step' },
    { from: 116, name: 'The Teeth' }, { from: 143, name: 'The Dash' },
  ],
  flags: [0, 38, 80.5, 116],
  girders: [
    // Easy Does It: the floor stops under a ceiling that goes on; then a block on the floor
    floor(-6, 14), ceiling(8, 36), floor(20, 46), stud(27),
    // The Steps: nobody climbs a step — one goes round it by the ceiling; then down them, and a block again
    ceiling(40, 49.5), floor(46, 56, 4.8), ceiling(51.5, 60.5), floor(56, 64.5, 6.0),
    floor(63.5, 70, 4.8), floor(69, 86.5), ceiling(71, 80.5), stud(76.5, 1.8),
    // In Step: short girders, above and below in turn; one half-way that hands one on to the ceiling
    ceiling(87.5, 93), floor(94, 101), mid(100, 105), ceiling(104, 112.5),
    // The Teeth: a tunnel where blocks stand out from the floor and the ceiling in turn
    floor(109.5, 147.5), ceiling(119, 143), stud(125, 1.8), fang(130.2, 1.8), stud(135.4), fang(140.2),
    // The Dash: up, down, and the arch
    ceiling(148, 152.5), floor(153.5, 161),
  ],
  // [s, y]: what hangs in the air for who wants it
  sparks: [
    [10.5, C - 0.85], [23.5, F + 0.85], [33, C - 0.85],
    [48, C - 0.85], [59, C - 0.85], [77.4, F + 1.8 + 0.85],
    [90, C - 0.85], [102.5, M - 0.85], [108, C - 0.85],
    [125.9, F + 1.8 + 0.85], [128.5, F + 0.85], [131.1, C - 1.8 - 0.85], [137.8, C - 0.85],
    [151.5, C - 0.85],
  ],
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const G = FLIP.girders, HB = FLIP.body.tall / 2;
// (what is near a place of the line: the girders by stretches of two metres)
const BUCKET = 2, LOW = -8, buckets = [];
for (let k = 0; k * BUCKET + LOW < FLIP.length + 10; k++) { const a = k * BUCKET + LOW - 1, b = a + BUCKET + 2; buckets.push(G.map((g, i) => (g.to > a && g.from < b ? i : -1)).filter((i) => i >= 0)); }
const near = (s) => buckets[clamp(Math.floor((s - LOW) / BUCKET), 0, buckets.length - 1)];
/** The flags: where each stands, and the girder one is put back on. */
export const FLAGS = FLIP.flags.map((s) => { const on = G.findIndex((g) => g.kind === 'floor' && g.from <= s - 0.5 && g.to >= s + 3); return { s, y: G[on].top, on }; });

/** How fast one runs at metre `s`. */
export const speedAt = (s) => FLIP.speed[0] + (FLIP.speed[1] - FLIP.speed[0]) * clamp(s / FLIP.length, 0, 1);
/** The stretch of metre `s`: its number. */
export const stretchAt = (s) => { let k = 0; while (k + 1 < FLIP.stretches.length && s >= FLIP.stretches[k + 1].from) k++; return k; };
/** Where a place of the line is on the plan: { x, z }; `aside`: metres to the south of it (towards who looks at it from the sea). */
export function lineAt(s, aside = 0, out = {}) { const p = pierToWorld(FLIP.along + s, FLIP.side + aside); out.x = p[0]; out.z = p[1]; return out; }

/**
 * A runner on the line. `count`: seconds before it runs. Its state: s; c (the height of the middle of its body);
 * g (-1: gravity pulls down, 1: up); on (the girder under — or over — its feet, -1 in the air); vy; clock (s since
 * it ran); out, hold (after a fall); flag (the last one passed); falls, flips, sparks (caught), got (which).
 */
export function startRun(count = FLIP.count) {
  return { s: 0, c: FLAGS[0].y + HB, g: -1, on: FLAGS[0].on, vy: 0, coy: 0, want: 0, pend: false, wait: count, clock: 0, acc: 0, out: 0, hold: 0, kind: '', flag: 0, falls: 0, flips: 0, sparks: 0, got: 0, over: false, time: 0 };
}
/** The runner put back at flag `k`, as after a fall. */
export function backAt(st, k) {
  const f = FLAGS[k];
  Object.assign(st, { s: f.s, c: f.y + HB, g: -1, on: f.on, vy: 0, coy: 0, want: 0, pend: false, out: 0, hold: 0, flag: k });
  return st;
}
/** The feet of the runner: the end of its body gravity pulls towards. */
export const feetOf = (st) => st.c + st.g * HB;
/** The time that counts, in ms: the clock, less what the sparks took off it. */
export const scoreOf = (st) => Math.max(0, Math.round((st.clock - st.sparks * FLIP.spark.worth) * 1000));

/**
 * Advances a run by `dt` seconds. `input`: { flip (true on the frame the key is pressed) }. `events`:
 * { type: 'tick' (n) | 'go' | 'flip' (up) | 'land' (v, up) | 'spark' (n) | 'flag' (n) | 'fall' (kind: 'crash' |
 * 'sea' | 'sky') | 'back' (flag) | 'end' (time) }.
 */
export function stepRun(st, dt, input, events) {
  if (input?.flip) st.pend = true;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= FLIP.step && !st.over) { st.acc -= FLIP.step; tick(st, events); }
  return st;
}

/** One step of 1/120 s. */
export function tick(st, events) {
  const R = FLIP, dt = R.step, press = st.pend;
  st.pend = false;
  if (st.over) return;
  if (st.wait > 0) {
    // the count: nothing moves
    const before = Math.ceil(st.wait - 1e-9);
    st.wait -= dt;
    if (st.wait <= 1e-9) { st.wait = 0; events?.push({ type: 'go' }); } else if (Math.ceil(st.wait - 1e-9) !== before) events?.push({ type: 'tick', n: Math.ceil(st.wait - 1e-9) });
    return;
  }
  st.clock += dt;
  if (st.out > 0) {
    // fallen: out for a moment, then back at the last flag
    st.out -= dt;
    if (st.out <= 0) { backAt(st, st.flag); st.hold = R.fall.hold; events?.push({ type: 'back', flag: st.flag }); }
    return;
  }
  if (st.hold > 0) { st.hold -= dt; return; }
  // ---- the key: gravity turns over, if one's feet are on something (or have only just left it)
  if (press) st.want = R.buffer;
  if (st.want > 0 && (st.on >= 0 || st.coy > 0)) {
    st.g = -st.g; st.on = -1; st.vy = 0; st.coy = 0; st.want = 0; st.flips++;
    events?.push({ type: 'flip', up: st.g > 0 });
  } else if (st.want > 0) st.want -= dt;
  // ---- along the line
  st.s += speedAt(st.s) * dt;
  const half = R.body.half, list = near(st.s);
  // ---- still carried? (a girder that goes on at the same height takes over)
  if (st.on >= 0) {
    const g = G[st.on];
    if (st.s - half > g.to || st.s + half < g.from) {
      const face = st.g < 0 ? g.top : g.bottom;
      let next = -1;
      for (const i of list) { const h = G[i]; if (i !== st.on && Math.abs((st.g < 0 ? h.top : h.bottom) - face) < 1e-6 && st.s + half >= h.from && st.s - half <= h.to) { next = i; break; } }
      if (next >= 0) st.on = next; else { st.on = -1; st.vy = 0; st.coy = R.coyote; }
    }
  }
  // ---- in the air: one falls the way gravity pulls, onto the first face met
  if (st.on < 0) {
    if (st.coy > 0) st.coy -= dt;
    st.vy += st.g * R.g * dt;
    const f0 = st.c + st.g * HB, f1 = f0 + st.vy * dt;
    let hit = -1, face = 0;
    for (const i of list) {
      const h = G[i];
      if (st.s + half < h.from || st.s - half > h.to) continue;
      const y = st.g < 0 ? h.top : h.bottom;
      if (st.g < 0 ? f0 >= y - 1e-9 && f1 <= y : f0 <= y + 1e-9 && f1 >= y) { if (hit < 0 || (st.g < 0 ? y > face : y < face)) { hit = i; face = y; } }
    }
    if (hit >= 0) { const v = Math.abs(st.vy); st.c = face - st.g * HB; st.vy = 0; st.on = hit; st.coy = 0; events?.push({ type: 'land', v, up: st.g > 0 }); } else st.c += st.vy * dt;
  }
  // ---- into the end of a girder, into the sea, into the sky
  const lo = st.c - HB, hi = st.c + HB, thin = half - R.body.thin;
  let kind = '';
  for (const i of list) { const h = G[i]; if (st.s + thin > h.from && st.s - thin < h.to && hi > h.bottom + 0.04 && lo < h.top - 0.04) { kind = 'crash'; break; } }
  if (!kind && lo < R.sea) kind = 'sea';
  if (!kind && st.c > R.sky) kind = 'sky';
  if (kind) { st.out = R.fall.out; st.kind = kind; st.falls++; st.want = 0; events?.push({ type: 'fall', kind }); return; }
  // ---- sparks, flags, the end
  for (let k = 0; k < R.sparks.length; k++) {
    const p = R.sparks[k];
    if (p[0] > st.s + 1.5) break;
    if (p[0] < st.s - 1.5 || (st.got & (1 << k))) continue;
    if (Math.hypot(p[0] - st.s, p[1] - st.c) < R.spark.reach) { st.got |= 1 << k; st.sparks++; events?.push({ type: 'spark', n: k }); }
  }
  while (st.flag + 1 < FLAGS.length && st.s >= FLAGS[st.flag + 1].s) { st.flag++; events?.push({ type: 'flag', n: st.flag }); }
  if (st.s >= R.length) { st.over = true; st.time = scoreOf(st); events?.push({ type: 'end', time: st.time }); }
}

// ---------------------------------------------------------------------------
// The runner that plays by itself — the proof that the line can be run. It knows the whole of what can happen:
// from any moment a decision can be made (the feet on a girder), what turning gravity over leads to and what
// running on leads to, to the end of the line. `value` is the most sparks that can still be caught from there
// without a fall (-1: no way to the end).

const memo = new Map();
const keyOf = (q) => `${Math.round(q.s * 2e4)}|${q.g}|${q.on}|${Math.round(q.c * 1e4)}|${Math.round(q.vy * 1e3)}|${q.coy > 0 ? Math.round(q.coy * 1e4) : 0}`;
/** From a moment a decision can be made, on to the next one (or to the end, or to a fall): turning gravity over now, or not. */
function advance(q, press) {
  const p = { ...q, pend: press, bot: null, acc: 0 };
  tick(p, null);
  while (!p.over && !(p.out > 0) && p.on < 0 && !(p.coy > 0)) tick(p, null);
  return p;
}
/** What a move is worth: the sparks it catches plus what can be caught after it; -1 if it ends in a fall. */
function worth(q, p) {
  if (p.out > 0) return -1;
  if (p.over) return p.sparks - q.sparks;
  const v = value(p);
  return v < 0 ? -1 : p.sparks - q.sparks + v;
}
function value(q0) {
  const path = [];
  let cur = q0, res = 0;
  for (;;) {
    const k = keyOf(cur), known = memo.get(k);
    if (known !== undefined) { res = known; break; }
    const nxt = advance(cur, false);
    path.push({ k, q: cur, gain: nxt.sparks - cur.sparks, end: nxt.over, dead: nxt.out > 0 });
    if (nxt.over || nxt.out > 0) break;
    cur = nxt;
  }
  for (let i = path.length - 1; i >= 0; i--) {
    const e = path[i];
    const stay = e.end ? e.gain : e.dead ? -1 : res < 0 ? -1 : e.gain + res;
    res = Math.max(stay, worth(e.q, advance(e.q, true)));
    memo.set(e.k, res);
  }
  return res;
}

/**
 * The next time gravity is to be turned over from `st`, a moment a decision can be made: { s (flip once there;
 * null: never again), width (s: for how long in a row that flip would do) }. `mode`: 'mid' (the middle of the
 * time it can be done in — any way to the end will do), 'late' (the last moment), 'early' (the first of that
 * run of moments), 'keen' (the way that catches the most sparks, in the middle of the longest time it leaves).
 */
function plan(st, mode) {
  const keen = mode === 'keen', list = [];
  let cur = { ...st, bot: null, acc: 0, pend: false, want: 0 };
  for (let n = 0; n < 6000; n++) {
    const v = value(cur);
    if (v < 0) break; // (no way on from here: nothing to plan)
    const fw = worth(cur, advance(cur, true)), nxt = advance(cur, false), sw = worth(cur, nxt);
    const flipOk = keen ? fw === v : fw >= 0, stayOk = keen ? sw === v : sw >= 0;
    list.push({ s: cur.s, clock: cur.clock, flipOk });
    if (!stayOk) {
      // gravity has to be turned over by now: the run of moments that would do ends here
      let a = list.length - 1, b = a;
      while (a > 0 && list[a - 1].flipOk) a--;
      if (keen) {
        // (after every spark: the longest run of moments that leave them all within reach, wherever it is)
        for (let i = 0, from = -1; i <= list.length; i++) {
          if (i < list.length && list[i].flipOk) { if (from < 0) from = i; continue; }
          if (from >= 0 && list[i - 1].clock - list[from].clock > list[b].clock - list[a].clock) { a = from; b = i - 1; }
          from = -1;
        }
      }
      const m = mode === 'late' ? b : mode === 'early' ? a : (a + b) >> 1;
      return { s: list[m].s, width: list[b].clock - list[a].clock + FLIP.step };
    }
    if (nxt.over) break;
    cur = nxt;
  }
  return { s: null, width: 0 };
}

/** The input of the runner that plays by itself, for the step to come: { flip }. Its memory is kept in `st.bot`. */
export function botInput(st, out = { flip: false }, mode = 'mid') {
  out.flip = false;
  if (st.over || st.wait > 0 || st.out > 0 || st.hold > 0 || !(st.on >= 0 || st.coy > 0)) return out;
  const bot = st.bot || (st.bot = { plan: null, life: -1, windows: [] });
  if (bot.life !== st.falls) { bot.life = st.falls; bot.plan = null; }
  if (!bot.plan) bot.plan = plan(st, mode);
  if (bot.plan.s !== null && st.s >= bot.plan.s - 1e-7) { out.flip = true; bot.windows.push(bot.plan.width); bot.plan = null; }
  return out;
}

/** Runs the line with the bot: { time (ms), clock (s), falls, flips, sparks, windows (s, one for each flip), over }. */
export function botRun(mode = 'mid', limit = 120) {
  const st = startRun(0), input = { flip: false };
  for (let t = 0; t < limit && !st.over; t += FLIP.step) { botInput(st, input, mode); stepRun(st, FLIP.step, input, null); }
  return { time: st.time, clock: st.clock, falls: st.falls, flips: st.flips, sparks: st.sparks, windows: st.bot ? st.bot.windows : [], over: st.over };
}

/** For a runner put back at flag `k`: the most sparks that can still be caught on the way to the end without a fall (-1: no way there). */
export function fromFlag(k) { return value(backAt(startRun(0), k)); }
