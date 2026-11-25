// Head Over Heels: its rules. No renderer here: the game, its checks and the runner that plays by itself all
// read this.
//
// A machine stands in the sea along the south side of the pier: a tall frame in which painted girders travel
// from right to left, as the scenery does in the flying theatre. One runs in it on the spot, a third of the way
// from its left end, faster and faster, and has one key: it turns gravity over. One then falls up to the
// underside of what is above — or back down onto what is below — and runs on there, head down. Gravity is turned
// over only while one's feet are on a girder (or have just left it), never in the air.
//
// Running into the end of a girder does not end the run at once: the girder holds one back while the others go
// by, and pushes one towards the left end of the machine. Freed in time — gravity turned over, most often — one
// runs a little faster than the girders go by until one is back in one's place. Pushed out at the left end,
// fallen out below or above, one is put back at the last flag after a moment (the machine winds back), and the
// clock runs on. Sparks hang along the less obvious ways: each one caught takes a quarter of a second off.
//
// Places: `s` metres along the course from its start, `y` metres above the sea; `scroll` is the metre of the
// course at the left end of the machine. Seen from the side a girder is a box { from, to, bottom, top }. The
// runner is a box too, `body.tall` high: its feet are the end gravity pulls towards. Time advances in steps of
// 1/120 s whatever the frame rate; nothing here is drawn by lot.
import { pierToWorld } from '../../../src/world/layout/layout.js';

const THICK = 0.5, RISE = 3, BASE = 3, TOOTH = 1.8; // m: a girder; from one level to the next; the underside of the lowest; a block
const under = (level) => BASE + RISE * level, over = (level) => under(level) + THICK;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const FLIP = {
  name: 'Head Over Heels',
  along: 60, side: 34, // where the left end of the machine stands, in the frame of the pier (pierToWorld): ten metres off the south edge of its head
  window: 46, place: 15, // m: how much of the course the machine shows; where one runs in it, from its left end
  length: 700, // m, from the start to the arch of the end
  apart: 70, // m from a flag to the next: a stretch
  step: 1 / 120,
  speed: [7, 17], // m/s: how fast the girders go by at the start, at the end (it grows with the metres run)
  gain: 0.25, // behind one's place, one runs so much faster than they go by
  g: 60, fast: 22, // m/s², and the most one falls at (m/s): from the lowest girder to the highest in three quarters of a second
  body: { half: 0.3, tall: 1.7, ledge: 0.12, graze: 0.04 }, // the runner; what the end of a girder forgives: so much at the feet, so much at the head
  buffer: 0.14, coyote: 0.08, // s: a key pressed so long before the feet touch still counts; and so long after they have left
  count: 3, every: 10, // s: the least before one runs; a start every so often on the clock everybody shares
  fall: { out: 0.8, hold: 0.6 }, // s: out for so long (the machine winds back), then standing at the flag so long
  low: 1.3, high: 20.2, // m: below, one has fallen out of the machine; above, one is gone
  spark: { reach: 0.95, worth: 0.25 }, // caught within so many metres of the middle of the body; s off the clock for each
  levels: { count: 6, base: BASE, rise: RISE, thick: THICK, tooth: TOOTH }, // girder k: from base + k × rise up to that + thick
  gate: { along: 28.8, side: 34 }, // where one asks to run, on the sand of the south beach
  stretches: [], flags: [], girders: [], sparks: [], // the course: written below
};
const HB = FLIP.body.tall / 2, HALF = FLIP.body.half;

/** How fast the girders go by when the metre `s` of the course is at one's place. */
export const speedAt = (s) => FLIP.speed[0] + (FLIP.speed[1] - FLIP.speed[0]) * clamp(s / FLIP.length, 0, 1);
// (a run nothing holds back: the metre one is at so many seconds after the start, and the other way round)
const RATE = (FLIP.speed[1] - FLIP.speed[0]) / FLIP.length;
export const metresAfter = (t) => (t <= 0 ? FLIP.speed[0] * t : (FLIP.speed[0] / RATE) * Math.expm1(RATE * t));
export const secondsTo = (s) => (s <= 0 ? s / FLIP.speed[0] : Math.log1p((RATE * s) / FLIP.speed[0]) / RATE);
/** How long a fall of `d` metres takes, counted in steps as the run counts it. */
const fallTime = (d) => { let v = 0, y = 0, n = 0; while (y < d - 1e-9) { v = Math.min(FLIP.fast, v + FLIP.g * FLIP.step); y += v * FLIP.step; n++; } return n * FLIP.step; };

// ---------------------------------------------------------------------------
// The course. It is written in seconds, along the way one is meant to take, because seconds are what one plays:
// a fall from a level to the next takes as long at the end as at the start, and so does the moment one has to
// turn gravity over in. The seconds are then turned into metres: the girders grow longer as the speed does.
//
//   run(s)        one runs on for so long
//   flip(level)   one turns gravity over here, and lands under (or on) the girder of that level. The girder one
//                 leaves ends so that `window` seconds are left to do it in, half before this moment and half
//                 after; the one landed on begins where the earliest of those flips lands. { tooth }: a block
//                 on the girder says when instead of its end (the girder goes on under it); { brink }: a spark
//                 where one still is at the last of those moments, for who waits
//   drop(level)   the girder ends here and one falls off it, onto (or up to) the girder of that level, which
//                 begins a moment before; { spark }: a spark in the fall
//   stretch(name) a flag, every seventy metres: one comes to it on one's feet; the stretch that begins is named
//   girder, stud, fang, spark: what is added by the way, so many seconds from this moment
function write() {
  const R = FLIP, girders = [], sparks = [], stretches = [], flags = [];
  const m = (t) => Math.round(metresAfter(t) * 100) / 100;
  const lay = (level, a, b) => { girders.push({ from: m(a), to: m(b), bottom: under(level), top: over(level), level, kind: 'girder' }); };
  /** A block that stands on a girder (`up`) or hangs under it: one passes it on the other side. */
  const block = (level, up, from, long) => { girders.push(up ? { from, to: from + long, bottom: over(level), top: over(level) + TOOTH, level, kind: 'stud' } : { from, to: from + long, bottom: under(level) - TOOTH, top: under(level), level, kind: 'fang' }); };
  const lane = (level, up) => (up ? over(level) + HB : under(level) - HB);
  // the moment written, the level one is on, which way up (-1: on it, 1: under it), when its girder began, the window
  let t = 0, level = 0, g = -1, since = secondsTo(-R.place - 2), w = 1;
  const c = {
    window: (s) => { w = s; return c; },
    run: (s) => { t += s; return c; },
    flip: (to, o = {}) => {
      const n = (to - level) * -g, ww = o.w ?? w, v = speedAt(metresAfter(t));
      if (n < 1 || to < 0 || to >= R.levels.count) throw new Error(`no flip from level ${level} to ${to} at ${t.toFixed(2)} s`);
      const tau = fallTime(RISE * n - THICK - R.body.tall);
      if (o.tooth) {
        // (one must be clear of the top of the block by the time one is at it)
        const from = m(t + ww / 2 + fallTime(TOOTH) + R.step) + HALF + 0.02, long = o.tooth === true ? 1.4 : o.tooth;
        block(level, g < 0, from, long);
        lay(level, since, secondsTo(from + long) + 0.3);
      } else lay(level, since, t + ww / 2 - R.coyote - HALF / v - R.step);
      if (o.brink) sparks.push([m(t + ww / 2 - 0.03), lane(level, g < 0)]);
      since = t - ww / 2 + tau; t += tau; level = to; g = -g;
      return c;
    },
    drop: (to, o = {}) => {
      const n = (to - level) * g, left = t + HALF / speedAt(metresAfter(t));
      if (n < 1 || to < 0 || to >= R.levels.count) throw new Error(`no drop from level ${level} to ${to} at ${t.toFixed(2)} s`);
      lay(level, since, t);
      if (o.spark) sparks.push([m(left + 0.2), lane(level, g < 0) + g * 0.5 * R.g * 0.04]);
      since = t - (o.lap ?? 0.12); t = left + fallTime(RISE * n); level = to;
      return c;
    },
    stretch: (name) => {
      const at = stretches.length * R.apart, when = secondsTo(at);
      if (g > 0 || (at > 0 && when < t + 0.3)) throw new Error(`no room for the flag of "${name}": ${(t + 0.3 - when).toFixed(2)} s too many before it`);
      t = when; stretches.push({ from: at, name }); flags.push({ s: at, level });
      return c;
    },
    girder: (lv, a, b) => { lay(lv, t + a, t + b); return c; },
    stud: (lv, a, long = 1.4) => { block(lv, true, m(t + a), long); return c; },
    fang: (lv, a, long = 1.4) => { block(lv, false, m(t + a), long); return c; },
    /** A spark so many seconds from here, where one's middle is when one runs on the girder of that level (`up`) or under it. */
    spark: (a, lv, up = true) => { sparks.push([m(t + a), lane(lv, up)]); return c; },
    end: () => {
      if (g > 0 || secondsTo(R.length) < t + 0.3) throw new Error('no room for the arch of the end');
      lay(level, since, secondsTo(R.length + R.window));
      // girders of a level that run into one another are one girder
      girders.sort((a, b) => a.level - b.level || (a.kind === 'girder' ? 0 : 1) - (b.kind === 'girder' ? 0 : 1) || a.from - b.from);
      const list = [];
      for (const q of girders) { const p = list[list.length - 1]; if (p && q.kind === 'girder' && p.kind === 'girder' && p.level === q.level && q.from <= p.to + 0.01) p.to = Math.max(p.to, q.to); else list.push(q); }
      R.girders = list.sort((a, b) => a.from - b.from);
      R.sparks = sparks.sort((a, b) => a[0] - b[0]);
      R.stretches = stretches; R.flags = flags;
    },
  };
  return c;
}

const B = { brink: true }, TB = { tooth: true, brink: true }, TOOTHED = { tooth: true }, LIT = { spark: true };
write()
  // one girder below and one above, far apart in time; then the whole height of the machine, there and back.
  // Two short girders off the way, a spark at each: down to one and up again, while there is time
  .stretch('Easy Does It').window(1)
  .run(1.8).flip(2, B).girder(0, 0.34, 1.1).spark(0.75, 0).run(1.5).flip(0, B).run(1.3).flip(5, B).girder(3, 0.45, 1.05).spark(0.75, 3).run(1.0).flip(0, B)
  // stairs: one goes up them head down, falling from the underside of a step to the next, and down them on one's
  // feet; a floor under them for who lets go
  .stretch('The Steps').window(0.8)
  .run(1.0).flip(1, B).girder(0, 1.03, 5.65).run(0.5).drop(2).run(0.35).drop(3, LIT).run(0.35).drop(4).run(0.35).drop(5, LIT).run(0.6).flip(3, B).run(0.4).drop(2, LIT).run(0.35).drop(1).run(0.35).drop(0, LIT)
  // floor and ceiling as far apart as they go, an island half-way, single blocks in the air between the ways;
  // then a block on the floor
  .stretch('The Long Drop').window(0.65)
  .run(0.7).flip(5, B).girder(3, 0.31, 0.46).run(0.6).flip(1, B).run(0.5).flip(5, B).girder(2, 0.31, 0.46).run(0.6).flip(0).run(0.5).flip(2, TB).run(0.4).flip(0, B)
  // short girders, above and below in turn, each pair a level higher
  .stretch('In Step').window(0.55)
  .run(0.7).flip(2).run(0.4).flip(0, B).run(0.4).flip(3, B).run(0.4).flip(1).run(0.4).flip(4, B).run(0.4).flip(2, B).run(0.3).drop(1).run(0.25).drop(0)
  // a tunnel where blocks stand out from the floor and the ceiling in turn
  .stretch('The Teeth').window(0.5)
  .run(0.7).flip(2, TOOTHED).run(0.3).flip(0, TB).run(0.3).flip(2, TB).run(0.3).flip(0, TOOTHED).run(0.3).flip(2, TB).run(0.3).flip(0, TB).run(0.3).flip(2, TOOTHED).run(0.3).flip(0, B)
  // nobody climbs a step: one goes round each by the underside of the next but one; then down them all
  .stretch('Upstairs Downstairs').window(0.45)
  .run(0.45).flip(2).run(0.28).flip(1, B).run(0.28).flip(3).run(0.28).flip(2, B).run(0.28).flip(4, B).run(0.28).flip(3, B).run(0.25).drop(2).run(0.25).drop(1, LIT).run(0.25).drop(0)
  // islands in the open, long ways between them
  .stretch('Open Air').window(0.4)
  .run(0.4).flip(4, B).run(0.22).flip(1).run(0.22).flip(5, B).run(0.22).flip(2, B).run(0.22).flip(4).run(0.22).flip(0, B)
  // a taller tunnel, its teeth further apart; then a low one
  .stretch('The Comb').window(0.35)
  .run(0.45).flip(3, TB).run(0.25).flip(0, TOOTHED).run(0.25).flip(3, TB).run(0.25).flip(0, TB).run(0.25).flip(2, TOOTHED).run(0.25).flip(0, B)
  // the whole height again, at twice the speed
  .stretch('Sea to Sky').window(0.3)
  .run(0.45).flip(5, B).girder(3, 0.15, 0.3).run(0.3).flip(1).run(0.3).flip(5, B).girder(3, 0.15, 0.3).run(0.3).flip(0, B)
  // a patter of short hops, and the arch
  .stretch('The Dash').window(0.28)
  .run(0.4).flip(1).run(0.23).flip(0, B).run(0.23).flip(1).run(0.23).flip(0, B).run(0.23).flip(2).run(0.23).flip(1, B).run(0.23).flip(2).run(0.23).flip(1, B)
  .end();

const G = FLIP.girders;
// (what is near a place of the course: the girders by stretches of two metres)
const BUCKET = 2, LOW = -(FLIP.place + 4), buckets = [];
for (let k = 0; k * BUCKET + LOW < FLIP.length + FLIP.window + 4; k++) { const a = k * BUCKET + LOW - 1, b = a + BUCKET + 2; buckets.push(G.map((g, i) => (g.to > a && g.from < b ? i : -1)).filter((i) => i >= 0)); }
const near = (s) => buckets[clamp(Math.floor((s - LOW) / BUCKET), 0, buckets.length - 1)];
/** The flags: where each stands, and the girder one is put back on. */
export const FLAGS = FLIP.flags.map((f) => { const on = G.findIndex((g) => g.kind === 'girder' && g.level === f.level && g.from <= f.s - 0.5 && g.to >= f.s + 3); return { s: f.s, y: G[on].top, on, level: f.level }; });

/** The stretch of metre `s`: its number. */
export const stretchAt = (s) => { let k = 0; while (k + 1 < FLIP.stretches.length && s >= FLIP.stretches[k + 1].from) k++; return k; };
/** Where a place of the machine is on the plan: { x, z }. `x`: metres from its left end; `aside`: metres to the south of it (towards who looks at it from the sea). */
export function frameAt(x, aside = 0, out = {}) { const p = pierToWorld(FLIP.along + x, FLIP.side + aside); out.x = p[0]; out.z = p[1]; return out; }
/** The metre of the course at the left end of the machine, so many seconds after a start, for a run nothing holds back. */
export const scrollAfter = (t) => metresAfter(Math.min(t, secondsTo(FLIP.length))) - FLIP.place;

/**
 * A runner in the machine. `count`: seconds before it runs. Its state: s; scroll; c (the height of the middle of
 * its body); g (-1: gravity pulls down, 1: up); on (the girder under — or over — its feet, -1 in the air); vy;
 * held (the end of a girder is holding it back); clock (s since it ran); out, hold (after a fall); flag (the last
 * one passed); falls, flips, sparks (caught), got (which: 1 for each caught).
 */
export function startRun(count = FLIP.count) {
  const f = FLAGS[0];
  return { s: f.s, scroll: f.s - FLIP.place, c: f.y + HB, g: -1, on: f.on, vy: 0, coy: 0, want: 0, pend: false, held: false, wait: count, clock: 0, acc: 0, out: 0, hold: 0, kind: '', flag: 0, falls: 0, flips: 0, sparks: 0, got: new Uint8Array(FLIP.sparks.length), next: 0, over: false, time: 0 };
}
/** The runner put back at flag `k`, as after a fall: the machine is wound back with it. */
export function backAt(st, k) {
  const f = FLAGS[k];
  Object.assign(st, { s: f.s, scroll: f.s - FLIP.place, c: f.y + HB, g: -1, on: f.on, vy: 0, coy: 0, want: 0, pend: false, held: false, out: 0, hold: 0, flag: k, next: 0 });
  return st;
}
/** The feet of the runner: the end of its body gravity pulls towards. */
export const feetOf = (st) => st.c + st.g * HB;
/** How far behind its place the runner is (m). */
export const lagOf = (st) => st.scroll + FLIP.place - st.s;
/** The time that counts, in ms: the clock, less what the sparks took off it. */
export const scoreOf = (st) => Math.max(0, Math.round((st.clock - st.sparks * FLIP.spark.worth) * 1000));

/**
 * Advances a run by `dt` seconds. `input`: { flip (true on the frame the key is pressed) }. `events`:
 * { type: 'tick' (n) | 'go' | 'flip' (up) | 'land' (v, up) | 'bump' | 'spark' (n) | 'flag' (n) | 'fall' (kind:
 * 'left' | 'sea' | 'sky') | 'back' (flag) | 'end' (time) }.
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
    // out: for a moment, then back at the last flag
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
  // ---- the girders go by; the runner keeps its place, or makes for it a little faster than they go
  const v = speedAt(st.scroll + R.place);
  st.scroll += v * dt;
  const place = st.scroll + R.place;
  const plain = st.s + v * dt;
  let to = plain < place - 1e-9 ? Math.min(place, plain + v * dt * R.gain) : place;
  // ---- unless the end of one is in its way: that one holds it back
  const list = near(to), lo = st.c - HB, hi = st.c + HB;
  let held = false;
  for (const i of list) {
    const h = G[i];
    if (h.from < st.s + HALF - 1e-9 || h.from >= to + HALF) continue;
    if (st.g < 0 ? lo < h.top - R.body.ledge && hi > h.bottom + R.body.graze : hi > h.bottom + R.body.ledge && lo < h.top - R.body.graze) { to = Math.max(st.s, Math.min(to, h.from - HALF)); held = true; }
  }
  if (held && !st.held) events?.push({ type: 'bump' });
  st.held = held; st.s = to;
  // ---- still carried? (a girder that goes on at the same height takes over)
  if (st.on >= 0) {
    const g = G[st.on];
    if (st.s - HALF > g.to || st.s + HALF < g.from) {
      const face = st.g < 0 ? g.top : g.bottom;
      let next = -1;
      for (const i of list) { const h = G[i]; if (i !== st.on && Math.abs((st.g < 0 ? h.top : h.bottom) - face) < 1e-6 && st.s + HALF >= h.from && st.s - HALF <= h.to) { next = i; break; } }
      if (next >= 0) st.on = next; else { st.on = -1; st.vy = 0; st.coy = R.coyote; }
    }
  }
  // ---- in the air: one falls the way gravity pulls, onto the first face met
  if (st.on < 0) {
    if (st.coy > 0) st.coy -= dt;
    st.vy = clamp(st.vy + st.g * R.g * dt, -R.fast, R.fast);
    const f0 = st.c + st.g * HB, f1 = f0 + st.vy * dt, slack = R.body.ledge + 1e-9;
    let hit = -1, face = 0;
    for (const i of list) {
      const h = G[i];
      if (st.s + HALF <= h.from + 1e-9 || st.s - HALF >= h.to) continue;
      const y = st.g < 0 ? h.top : h.bottom;
      if (st.g < 0 ? f0 >= y - slack && f1 <= y : f0 <= y + slack && f1 >= y) { if (hit < 0 || (st.g < 0 ? y > face : y < face)) { hit = i; face = y; } }
    }
    if (hit >= 0) { const speed = Math.abs(st.vy); st.c = face - st.g * HB; st.vy = 0; st.on = hit; st.coy = 0; events?.push({ type: 'land', v: speed, up: st.g > 0 }); } else st.c += st.vy * dt;
  }
  // ---- pushed out at the left end, fallen out below, gone above
  const kind = st.s - HALF <= st.scroll ? 'left' : st.c - HB < R.low ? 'sea' : st.c + HB > R.high ? 'sky' : '';
  if (kind) { st.out = R.fall.out; st.kind = kind; st.falls++; st.want = 0; st.held = false; events?.push({ type: 'fall', kind }); return; }
  // ---- sparks, flags, the end
  const P = R.sparks;
  while (st.next < P.length && P[st.next][0] < st.s - 1.5) st.next++;
  for (let k = st.next; k < P.length && P[k][0] <= st.s + 1.5; k++) {
    if (st.got[k] || Math.hypot(P[k][0] - st.s, P[k][1] - st.c) >= R.spark.reach) continue;
    // (a list of its own from here on: the runner that plays by itself tries its ways on copies of the run)
    st.got = st.got.slice(); st.got[k] = 1; st.sparks++; events?.push({ type: 'spark', n: k });
  }
  while (st.flag + 1 < FLAGS.length && st.s >= FLAGS[st.flag + 1].s) { st.flag++; events?.push({ type: 'flag', n: st.flag }); }
  if (st.s >= R.length) { st.over = true; st.time = scoreOf(st); events?.push({ type: 'end', time: st.time }); }
}

// ---------------------------------------------------------------------------
// The runner that plays by itself — the proof that the course can be run. It knows the whole of what can happen:
// from any moment a decision can be made (the feet on a girder), what turning gravity over leads to and what
// running on leads to, to the end of the course. `value` is the most sparks that can still be caught from there
// without a fall (-1: no way to the end). It never lets a girder hold it back: for it, that is a fall — so the
// way it proves is one on which one keeps one's place from the start to the end.

const memo = new Map();
const keyOf = (q) => `${Math.round(q.s * 2e4)}|${q.g}|${q.on}|${Math.round(q.c * 1e4)}|${Math.round(q.vy * 1e3)}|${q.coy > 0 ? Math.round(q.coy * 1e4) : 0}|${Math.round(lagOf(q) * 1e4)}`;
const lost = (p) => p.out > 0 || p.held;
/** From a moment a decision can be made, on to the next one (or to the end, or to a fall): turning gravity over now, or not. */
function advance(q, press) {
  const p = { ...q, pend: press, bot: null, acc: 0 };
  tick(p, null);
  while (!p.over && !lost(p) && p.on < 0 && !(p.coy > 0)) tick(p, null);
  return p;
}
/** What a move is worth: the sparks it catches plus what can be caught after it; -1 if it ends in a fall. */
function worth(q, p) {
  if (lost(p)) return -1;
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
    path.push({ k, q: cur, gain: nxt.sparks - cur.sparks, end: nxt.over, dead: lost(nxt) });
    if (nxt.over || lost(nxt)) break;
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
/** Held back by a block, one's feet on a girder: what turning gravity over now is worth (-1: it frees nothing, or leads nowhere). */
function escape(q) {
  const p = { ...q, pend: true, bot: null, acc: 0 };
  tick(p, null);
  while (!p.over && !(p.out > 0) && p.on < 0 && !(p.coy > 0)) tick(p, null);
  return p.out > 0 || p.held ? -1 : p.over ? 0 : value(p);
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
  for (let n = 0; n < 9000; n++) {
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
      const k = mode === 'late' ? b : mode === 'early' ? a : (a + b) >> 1;
      return { s: list[k].s, width: list[b].clock - list[a].clock + FLIP.step };
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
  // (held back — it only ever is when somebody else ran before it: it frees itself if that leads somewhere)
  if (st.held) { bot.plan = null; if (st.on >= 0 && escape(st) >= 0) out.flip = true; return out; }
  if (!bot.plan) bot.plan = plan(st, mode);
  if (bot.plan.s !== null && st.s >= bot.plan.s - 1e-7) { out.flip = true; bot.windows.push({ s: st.s, width: bot.plan.width }); bot.plan = null; }
  return out;
}

/** Runs the course with the bot: { time (ms), clock (s), falls, flips, sparks, windows ({ s, width (s) }, one for each flip), held (steps a girder held it back), over }. */
export function botRun(mode = 'mid', limit = 240) {
  const st = startRun(0), input = { flip: false };
  let held = 0;
  for (let t = 0; t < limit && !st.over; t += FLIP.step) { botInput(st, input, mode); stepRun(st, FLIP.step, input, null); if (st.held) held++; }
  return { time: st.time, clock: st.clock, falls: st.falls, flips: st.flips, sparks: st.sparks, windows: st.bot ? st.bot.windows : [], held, over: st.over };
}

/** For a runner put back at flag `k`: the most sparks that can still be caught on the way to the end without a fall (-1: no way there). */
export function fromFlag(k) { return value(backAt(startRun(0), k)); }

// Its line for the boards of scores: the time to the end, in ms — the less the better. `min`: no run can be
// shorter than that of the runner that catches every spark and is never held back (the checks print it).
export const BOARD = { order: 'asc', min: 40_000, max: 600_000 };
