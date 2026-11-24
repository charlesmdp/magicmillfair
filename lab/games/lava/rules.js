// Thin Crust: its rules. No renderer here: the game, its checks and the player that plays by itself all read this.
//
// A crater on an islet east of the pier, a pool of lava in it, and standing in the lava sixty-one columns of
// basalt, six-sided, at three heights. One runs and jumps on their tops. A column warns — it glows, it trembles —
// then sinks; some come back, fewer and fewer of them. Whoever touches the lava is out: the score is how long
// one held.
//
// A round leaves every ten seconds on the clock everybody shares, and what the columns do in a round is drawn
// from its number: the same for everybody who takes that start, something else for the next one. Nothing in it
// is unfair for the first minute: a column that warns always has a neighbour that outlives it, no higher than
// one step. After that there is only something to jump to, and in the end not even that.
//
// Places on the field: x metres east and z metres south of its middle; heights are counted from the lava.
// Time is counted from the start of the round (before it: negative, and every column stands), and advances in
// steps of 1/120 s whatever the frame rate.

export const LAVA = {
  name: 'Thin Crust',
  at: { x: 188, z: 8 }, // the middle of the field: in the open sea, east of the head of the pier
  level: 0.9, // the lava, metres above the sea
  look: [-1, 0], // the way the camera looks, on the plan (x, z): west, at the pier over the rim — "up" on the stick goes that way
  rings: 4, R: 1.45, // sixty-one columns: so many rings round the middle one; a column from its middle to a corner (m)
  tops: [1.0, 1.9, 2.8], // how high a column stands over the lava, at each of its three heights (m)
  every: 10, // s: a round leaves every so often
  step: 1 / 120,
  run: 6.3, accel: 46, air: 24, // m/s; how fast one gets there on a column, in the air (m/s²)
  g: 22, jump: 7.42, // m/s², m/s up: a metre and a quarter — one step of the columns is jumped, two are not
  stepUp: 0.3, coyote: 0.1, // m that the feet take without a jump; s after the edge during which a jump still counts
  burn: 0.15, // m over the lava: lower than that, one is in it
  rise: 0.6, sink: 0.7, // s: a column takes so long to come up, to go down
  grace: 2.5, // s: nothing warns before
  fair: 62, reach: 80, end: 240, // s: until then a column that warns has a neighbour to step to; until then one to jump to; after the last, nothing rises again
};

export const GONE = 0, RISING = 1, UP = 2, WARN = 3, SINKING = 4;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const S3 = Math.sqrt(3);

// (numbers drawn from whole numbers only: the same on every device, to the last bit)
const hash = (a, b = 0) => { let h = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul((b | 0) + 0x7F4A7C15, 0x85EBCA6B)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
const stream = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ---------------------------------------------------------------------------------------------- the field

/**
 * The columns: { q, r (its place in the comb), x, z (its middle), ring (how far from the middle one), n (those
 * that touch it), far (those one column further: `gap` true when a whole column lies between) }.
 */
export const CELLS = [];
const KEY = new Map();
{
  const N = LAVA.rings;
  for (let r = -N; r <= N; r++) for (let q = -N; q <= N; q++) {
    if (Math.abs(q + r) > N) continue;
    KEY.set(q * 100 + r, CELLS.length);
    CELLS.push({ q, r, x: S3 * LAVA.R * (q + r / 2), z: 1.5 * LAVA.R * r, ring: Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)), n: [], far: [] });
  }
  const at = (q, r) => { const i = KEY.get(q * 100 + r); return i === undefined ? -1 : i; };
  const NEAR = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
  const FAR = [[2, 0, 1], [1, 1, 0], [0, 2, 1], [-1, 2, 0], [-2, 2, 1], [-2, 1, 0], [-2, 0, 1], [-1, -1, 0], [0, -2, 1], [1, -2, 0], [2, -2, 1], [2, -1, 0]];
  for (const c of CELLS) {
    for (const [dq, dr] of NEAR) { const i = at(c.q + dq, c.r + dr); if (i >= 0) c.n.push(i); }
    for (const [dq, dr, gap] of FAR) { const i = at(c.q + dq, c.r + dr); if (i >= 0) c.far.push({ i, gap: !!gap }); }
    c.turn = 0;
  }
  // (where each is round its ring, 0 to 1 from the east going by the south: counted, not measured with an angle)
  const WALK = [[-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0], [0, 1]];
  for (let k = 1; k <= N; k++) { let q = k, r = 0, i = 0; for (const [dq, dr] of WALK) for (let s = 0; s < k; s++) { CELLS[at(q, r)].turn = i++ / (6 * k); q += dq; r += dr; } }
}
/** How far the field reaches from its middle (m): the corners of its outermost columns. */
export const FIELD = S3 * LAVA.R * LAVA.rings + LAVA.R;

/** The column a point of the field is over: its number, or -1 beyond the last ring. */
export function cellAt(x, z) {
  const fq = (S3 / 3 * x - z / 3) / LAVA.R, fr = (2 / 3 * z) / LAVA.R, fs = -fq - fr;
  let q = Math.round(fq), r = Math.round(fr);
  const s = Math.round(fs), dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  const i = KEY.get(q * 100 + r);
  return i === undefined ? -1 : i;
}

// ---------------------------------------------------------------------------------------------- a round

const TARGET = [[0, 61], [10, 61], [25, 50], [45, 34], [60, 20], [75, 10], [90, 5], [110, 3], [150, 2], [1e9, 2]];
/** How many columns the round would have standing at `t`. */
export function targetAt(t) {
  for (let k = 1; k < TARGET.length; k++) if (t <= TARGET[k][0]) { const [t0, n0] = TARGET[k - 1], [t1, n1] = TARGET[k]; return Math.round(lerp(n0, n1, (t - t0) / (t1 - t0))); }
  return 2;
}
/** For how long a column that begins to warn at `t` warns before it sinks (s). */
export const warnTime = (t) => (t < 20 ? 1.4 : t < 70 ? 1.4 - 0.65 * ((t - 20) / 50) : Math.max(0.55, 0.75 - (t - 70) * 0.004));
/** For how long a column may stand, at `t`, before it warns whatever else goes on (s). */
const stayTime = (t) => (t < 15 ? Infinity : Math.max(2.2, 22 - (t - 15) * 0.26));

const DT = 0.25; // the round is written down every quarter of a second
const DIRS = [[1, 0], [S3 / 2, 0.5], [0.5, S3 / 2], [0, 1], [-0.5, S3 / 2], [-S3 / 2, 0.5], [-1, 0], [-S3 / 2, -0.5], [-0.5, -S3 / 2], [0, -1], [0.5, -S3 / 2], [S3 / 2, -0.5]];
const mod = (a, n) => ((a % n) + n) % n;

const _rounds = new Map();
/**
 * The round that leaves with start number `n`: { n, lives, acts }. `lives[c]`: what column `c` does, one life
 * after the other — { level (0, 1, 2), rise, up (it comes up between the two), warn, sink (it warns between the
 * two), gone (it goes down between the last two) }, in seconds from the start; Infinity for what never comes.
 * `acts`: what the round is made of, in turn ({ kind, from, to }) — for whoever wants to say it.
 */
export function makeRound(n) {
  const kept = _rounds.get(n);
  if (kept) return kept;
  const L = LAVA, rnd = stream(Math.imul(n | 0, 2654435761) ^ 0x51ED270B), N = CELLS.length;
  const lives = CELLS.map(() => []), last = (c) => lives[c][lives[c].length - 1];
  // ---- how high each stands to begin with: a few knolls, away from the middle where everybody starts
  const level = new Array(N).fill(0);
  for (let k = 0, knolls = 3 + Math.floor(rnd() * 3); k < knolls; k++) {
    const c = Math.floor(rnd() * N), high = rnd() < 0.6;
    if (CELLS[c].ring < 2) continue;
    for (const i of CELLS[c].n) if (CELLS[i].ring >= 2) level[i] = Math.max(level[i], 1);
    level[c] = high ? 2 : Math.max(level[c], 1);
  }
  for (let c = 0; c < N; c++) lives[c].push({ level: level[c], rise: -1e9, up: -1e9, warn: Infinity, sink: Infinity, gone: Infinity });
  let alive = N; // those that stand, or are to come back

  const standing = (c, t) => { const l = last(c); return !!l && l.warn === Infinity && l.up <= t; };
  /** Is there, for the life `lx` of column `x` that sinks, somewhere to go: a column that outlives it, within reach? */
  const escape = (x, lx, wide) => {
    const s = lx.sink, top = L.tops[lx.level];
    const holds = (y, up) => { for (let k = lives[y].length - 1; k >= 0; k--) { const l = lives[y][k]; if (l.up <= s - 0.35 && l.sink >= s + 0.55 && L.tops[l.level] <= top + up) return true; } return false; };
    for (const y of CELLS[x].n) if (holds(y, 0.95)) return true;
    if (wide) for (const f of CELLS[x].far) if (holds(f.i, f.gap ? 0.05 : 0.95)) return true;
    return false;
  };
  /** The life of column `x` that warns at `t` and has not begun to sink, if it has one. */
  const warned = (x, t) => { for (let k = lives[x].length - 1; k >= 0; k--) { const l = lives[x][k]; if (l.warn !== Infinity && l.warn <= t && l.sink > t) return l; if (l.gone <= t) break; } return null; };
  let solid = N; // those that stand and do not warn, at the moment the round is being written
  /** Column `c` begins to warn at `t`, if that is fair to who stands on it and on those round it. `back`: s before it comes back. */
  const warn = (c, t, back) => {
    const l = last(c);
    if (!l || l.warn !== Infinity || l.up > t) return false;
    // (never too many down at once: six in ten of what the round has in mind stand firm, for as long as it has much in mind)
    if (t < 75 && solid - 1 < Math.round(targetAt(t) * 0.62)) return false;
    l.warn = t; l.sink = t + warnTime(t); l.gone = l.sink + L.sink;
    const wide = t >= L.fair;
    let ok = escape(c, l, wide);
    // (…and whoever is on a column round it that warns already must still have theirs)
    if (ok) for (const x of wide ? CELLS[c].n.concat(CELLS[c].far.map((f) => f.i)) : CELLS[c].n) { const lx = warned(x, t); if (lx && !escape(x, lx, lx.warn >= L.fair)) { ok = false; break; } }
    // (unfair — nowhere to go from it, or from a neighbour — it does not happen… until late, and then more and more)
    if (!ok && (t < L.reach || rnd() >= Math.min(1, (t - L.reach) / 45))) { l.warn = l.sink = l.gone = Infinity; return false; }
    alive--; solid--;
    // ---- does it come back? Less and less: the round has a number of columns in mind, and the rim goes first
    const over = alive + 1 - targetAt(t + 3);
    if (over > 0 && rnd() < Math.min(1, over / 6) * (0.45 + 0.2 * CELLS[c].ring)) return true;
    let where = c, lv = l.level;
    const rise = l.gone + back;
    if (rise >= L.end) return true;
    if (t >= 45) {
      // later it comes back somewhere else: by a column that stands, then anywhere
      const free = (y) => { const ly = last(y); return y !== c && (!ly || (ly.gone !== Infinity && ly.gone <= rise - 0.2)); };
      const near = t < 75 ? rnd() < 0.5 : rnd() < Math.max(0.2, 1 - (t - 75) / 50), other = t >= 75 || near;
      if (other) {
        const pool = [];
        for (let y = 0; y < N; y++) if (free(y) && (!near || CELLS[y].n.some((z) => standing(z, t)) || (t >= 75 && CELLS[y].far.some((f) => standing(f.i, t))))) pool.push(y);
        if (pool.length) where = pool[Math.floor(rnd() * pool.length)];
      }
      const p = rnd();
      lv = p < 0.6 ? 0 : p < 0.9 ? 1 : 2;
    }
    lives[where].push({ level: lv, rise, up: rise + L.rise, warn: Infinity, sink: Infinity, gone: Infinity });
    alive++;
    return true;
  };

  // ---- the acts, one after the other
  const acts = [], KINDS = ['pick', 'sweep', 'thirds', 'rings', 'rim'];
  let act = null, was = '';
  const next = (t) => {
    if (t < 8) return { kind: 'teach', from: t, to: 8, back: 2.5 };
    // (late in the round there are too few left for figures: they go one by one, of old age, and now and then a line crosses)
    let kind = was;
    if (t >= 75) kind = was === 'wait' && rnd() < 0.5 ? 'sweep' : 'wait';
    else while (kind === was) kind = KINDS[Math.floor(rnd() * KINDS.length)];
    was = kind;
    const a = { kind, from: t, to: t + 6, back: 3 };
    if (kind === 'pick') { a.to = t + 5 + Math.floor(rnd() * 3); a.each = t < 35 ? 3 : 2; }
    else if (kind === 'sweep') { a.dir = DIRS[Math.floor(rnd() * DIRS.length)]; a.v = lerp(2.2, 4.5, clamp(t / 75, 0, 1)); a.to = t + Math.ceil((2 * FIELD + 2) / a.v / DT) * DT; a.back = 0.5; }
    else if (kind === 'thirds' || kind === 'rings') {
      // (the next lot goes when the last is back: a warning, down, away, up again, and a breath)
      a.back = kind === 'thirds' ? 0.8 : 0.6;
      a.each = Math.ceil((warnTime(t) + L.sink + a.back + L.rise + 0.4) / DT);
      a.lots = kind === 'thirds' ? 3 : 4; a.turn = Math.floor(rnd() * a.lots);
      a.to = t + a.each * a.lots * DT;
    } else if (kind === 'rim') { a.angle = Math.floor(rnd() * 12); a.to = t + 5; a.back = 4; }
    else a.to = t + 5; // ('wait')
    return a;
  };
  const ticks = Math.round((L.end - L.grace) / DT);
  for (let i = 0; i <= ticks; i++) {
    const t = L.grace + i * DT;
    if (!act || t >= act.to) { if (act) acts.push({ kind: act.kind, from: act.from, to: act.to }); act = next(t); }
    const k = Math.round((t - act.from) / DT), up = [];
    for (let c = 0; c < N; c++) if (standing(c, t)) up.push(c);
    solid = up.length;
    const draw = (many) => { for (let m = 0; m < many && up.length; m++) { const j = Math.floor(rnd() * up.length), c = up[j]; up.splice(j, 1); warn(c, t, act.back + rnd() * 2.5); } };
    if (act.kind === 'teach') {
      // three columns, one at a time, by the middle where everybody stands: this is how it goes
      if (k % 7 === 0) { const pool = up.filter((c) => CELLS[c].ring === 1 || CELLS[c].ring === 2); if (pool.length) warn(pool[Math.floor(rnd() * pool.length)], t, act.back); }
    } else if (act.kind === 'pick') {
      if (k % act.each === 0) draw(t > 40 ? 2 : 1);
    } else if (act.kind === 'sweep') {
      // a line crosses the field: what it passes warns, and is back soon after — a ditch one column wide to jump
      const p = -FIELD - 1 + act.v * (t - act.from), [dx, dz] = act.dir;
      for (const c of up) { const s = CELLS[c].x * dx + CELLS[c].z * dz; if (s > p - act.v * DT && s <= p) warn(c, t, act.back); }
    } else if (act.kind === 'thirds') {
      // one column in three, all at once, then the next third
      if (k % act.each === 0) { const ph = mod(act.turn + k / act.each, 3); for (const c of up) if (mod(CELLS[c].q - CELLS[c].r, 3) === ph) warn(c, t, act.back); }
    } else if (act.kind === 'rings') {
      // a whole ring, then another
      if (k % act.each === 0) { const ring = [4, 2, 3, 1][mod(act.turn + k / act.each, 4)]; for (const c of up) if (CELLS[c].ring === ring || (ring === 1 && CELLS[c].ring === 0)) warn(c, t, act.back); } // (the middle one goes with the innermost ring)
    } else if (act.kind === 'rim') {
      // the outermost that stand, going round
      const far = up.reduce((m, c) => Math.max(m, CELLS[c].ring), 0), rim = up.filter((c) => CELLS[c].ring === far);
      const turn = (c) => mod(CELLS[c].turn - act.angle / 12, 1);
      rim.sort((a, b) => turn(a) - turn(b) || a - b);
      for (const c of rim.slice(0, 2)) warn(c, t, act.back);
    }
    // ---- and nothing stands for ever: between the figures, the oldest warn in their turn
    const limit = stayTime(t);
    if (limit !== Infinity && act.kind !== 'thirds' && act.kind !== 'rings' && act.kind !== 'sweep') {
      const old = [];
      for (let c = 0; c < N; c++) if (standing(c, t)) { const age = t - Math.max(0, last(c).up); if (age > limit * (0.75 + 0.5 * hash(c, n))) old.push([age, c]); }
      old.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
      for (const [, c] of old.slice(0, t > 60 ? 3 : 2)) warn(c, t, 2 + rnd() * 2);
    }
  }
  if (act) acts.push({ kind: act.kind, from: act.from, to: act.to });
  // ---- the end: what still stands goes down, and nothing comes back
  for (let c = 0; c < N; c++) { const l = last(c); if (l && l.warn === Infinity) { l.warn = Math.max(L.end, l.up); l.sink = l.warn + warnTime(L.end); l.gone = l.sink + L.sink; } }
  const round = { n, lives, acts };
  if (_rounds.size > 24) _rounds.delete(_rounds.keys().next().value);
  _rounds.set(n, round);
  return round;
}

/**
 * What column `c` of a round is doing at `t`: { state (GONE, RISING, UP, WARN, SINKING), top (m over the lava;
 * far below it when there is none), level, k (how far through the warning, the sinking, the rising: 0 to 1) }.
 */
export function columnAt(round, c, t, out = {}) {
  const lives = round.lives[c], L = LAVA;
  out.state = GONE; out.top = -9; out.level = 0; out.k = 0;
  for (let i = lives.length - 1; i >= 0; i--) {
    const l = lives[i];
    if (t < l.rise) continue;
    if (t >= l.gone) break;
    const top = L.tops[l.level];
    out.level = l.level;
    if (t < l.up) { const k = (t - l.rise) / L.rise; out.state = RISING; out.k = k; out.top = -0.5 + (top + 0.5) * (1 - (1 - k) * (1 - k)); }
    else if (t < l.warn) { out.state = UP; out.top = top; }
    else if (t < l.sink) { out.state = WARN; out.k = (t - l.warn) / (l.sink - l.warn); out.top = top; }
    else { const k = (t - l.sink) / L.sink; out.state = SINKING; out.k = k; out.top = top - (top + 0.5) * k * k; }
    break;
  }
  return out;
}
const _c = {};
/** How high the top of column `c` is at `t` (m over the lava; -9 when there is none). */
export const topAt = (round, c, t) => (c < 0 ? -9 : columnAt(round, c, t, _c).top);
/** How many columns can be stood on at `t` (up, or warning). */
export function standingAt(round, t) { let n = 0; for (let c = 0; c < CELLS.length; c++) { const s = columnAt(round, c, t, _c).state; if (s === UP || s === WARN) n++; } return n; }

// ---------------------------------------------------------------------------------------------- a run

/** Somebody on the field of round `n`, `wait` seconds before it leaves, on column `cell` (the middle one unless said). */
export function startRun(n, wait = 0, cell = -1) {
  const round = makeRound(n), c = CELLS[cell >= 0 ? cell : cellAt(0, 0)];
  return { n, round, x: c.x, z: c.z, h: topAt(round, cellAt(c.x, c.z), -wait), vx: 0, vz: 0, vh: 0, ground: true, coyote: 0, want: 0, face: Math.atan2(LAVA.look[0], LAVA.look[1]), clock: -wait, acc: 0, over: false, time: 0, jumps: 0 };
}

/**
 * Advances a run by `dt` seconds. `input`: { x (-1 … 1: to the right of the way the camera looks), y (-1 … 1:
 * away from the camera), jump (true on the frame it is asked) }. `events`: { type: 'jump' | 'land' | 'out' (time, ms) }.
 */
export function stepRun(st, dt, input, events) {
  if (input?.jump) st.want = 0.14;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= LAVA.step && !st.over) { st.acc -= LAVA.step; sub(st, LAVA.step, input, events); }
  return st;
}

function sub(st, dt, input, events) {
  const L = LAVA, R = st.round, [fx, fz] = L.look, rx = -fz, rz = fx; // (to the right of the way one looks: (-z, x) of it)
  st.clock += dt;
  const t = st.clock;
  if (st.want > 0) st.want -= dt;
  if (st.coyote > 0) st.coyote -= dt;
  // ---- across the field: as one pushes
  let ix = clamp(input?.x || 0, -1, 1), iy = clamp(input?.y || 0, -1, 1);
  const il = Math.sqrt(ix * ix + iy * iy);
  if (il > 1) { ix /= il; iy /= il; }
  const wx = (fx * iy + rx * ix) * L.run, wz = (fz * iy + rz * ix) * L.run, a = (st.ground ? L.accel : L.air) * dt;
  const ex = wx - st.vx, ez = wz - st.vz, el = Math.sqrt(ex * ex + ez * ez);
  if (el <= a) { st.vx = wx; st.vz = wz; } else { st.vx += (ex / el) * a; st.vz += (ez / el) * a; }
  if (st.vx * st.vx + st.vz * st.vz > 0.6) st.face = Math.atan2(st.vx, st.vz);
  // ---- a jump
  if (st.want > 0 && (st.ground || st.coyote > 0)) { st.vh = L.jump; st.ground = false; st.coyote = 0; st.want = 0; st.jumps++; events?.push({ type: 'jump' }); }
  // ---- the side of a column higher than the feet is a wall
  const wall = (x, z) => topAt(R, cellAt(x, z), t) > st.h + L.stepUp;
  let nx = st.x + st.vx * dt, nz = st.z + st.vz * dt;
  if (wall(nx, nz)) {
    if (!wall(nx, st.z)) { nz = st.z; st.vz = 0; } else if (!wall(st.x, nz)) { nx = st.x; st.vx = 0; } else { nx = st.x; nz = st.z; st.vx = 0; st.vz = 0; }
  }
  const far = Math.sqrt(nx * nx + nz * nz), lim = FIELD + 1.1; // (the rock of the crater)
  if (far > lim) { nx *= lim / far; nz *= lim / far; }
  st.x = nx; st.z = nz;
  // ---- up and down: on a column one goes where it goes; off it one falls
  const top = topAt(R, cellAt(st.x, st.z), t);
  if (st.ground) {
    if (top >= st.h - 0.35) st.h = top; else { st.ground = false; st.coyote = L.coyote; st.vh = 0; }
  }
  if (!st.ground) {
    st.vh -= L.g * dt; st.h += st.vh * dt;
    if (st.vh <= 0 && st.h <= top && st.h >= top - 0.45 && top > L.burn) { st.h = top; st.vh = 0; st.ground = true; events?.push({ type: 'land' }); }
  }
  if (st.h <= L.burn) { st.h = Math.max(st.h, -0.2); st.over = true; st.time = Math.max(0, Math.round(t * 1000)); events?.push({ type: 'out', time: st.time }); }
}

// ---------------------------------------------------------------------------------------------- a player that plays by itself

const _b = {};
/**
 * Plays by itself — the proof that a round can be held: it stays where it is while that is safe, and when its
 * column warns it goes to the neighbour that will hold longest, jumping a step up or a ditch. Returns the input
 * for stepRun.
 */
export function botInput(st, out = { x: 0, y: 0, jump: false }) {
  const L = LAVA, R = st.round, t = st.clock, [fx, fz] = L.look, rx = -fz, rz = fx;
  out.x = 0; out.y = 0; out.jump = false;
  if (st.over) return out;
  const B = st.bot || (st.bot = { goal: -1, think: -1e9 }), here = cellAt(st.x, st.z);
  /** How long column `y` holds from `after` seconds on (0: it will not be there, or too high). */
  const holds = (y, after, feet, up) => {
    const lives = R.lives[y], at = t + after;
    for (let k = lives.length - 1; k >= 0; k--) { const l = lives[k]; if (l.up <= at && l.sink > at) return L.tops[l.level] <= feet + up ? Math.min(l.sink - at, 8) : 0; }
    return 0;
  };
  const room = (y) => { let n = 0; for (const z of CELLS[y].n) if (holds(z, 0.3, 9, 0) > 1.5) n++; return n; };
  if (st.ground && here >= 0 && t >= B.think) {
    B.think = t + 0.1;
    const feet = st.h, value = (y, after, up) => { const left = holds(y, after, feet, up); return left < 0.7 ? -1 : left + 0.3 * room(y) - 0.04 * Math.sqrt(CELLS[y].x ** 2 + CELLS[y].z ** 2); };
    let best = here, most = value(here, 0, 9) + 0.9;
    for (const y of CELLS[here].n) { const v = value(y, 0.5, 0.95); if (v > most) { most = v; best = y; } }
    if (most < 3.2) for (const f of CELLS[here].far) { const v = value(f.i, 0.95, f.gap ? 0.05 : 0.95) - 0.8; if (v > most) { most = v; best = f.i; } }
    B.goal = best;
  }
  const goal = B.goal >= 0 ? B.goal : here;
  if (goal < 0) return out;
  // ---- towards the middle of the column one is going to
  const C = CELLS[goal], dx = C.x - st.x, dz = C.z - st.z, d = Math.sqrt(dx * dx + dz * dz);
  if (d > 0.12) { const k = Math.min(1, d / 0.5) / d; out.y = (dx * fx + dz * fz) * k; out.x = (dx * rx + dz * rz) * k; }
  // ---- and a jump where the way goes up a step, or over the lava
  if (st.ground && goal !== here && d > 0.4) {
    const ahead = cellAt(st.x + (dx / d) * 0.5, st.z + (dz / d) * 0.5);
    if (ahead !== here) { const top = columnAt(R, ahead, t + 0.08, _b).top; if (top > st.h + L.stepUp - 0.04 || top < st.h - 1.3 || _b.state === SINKING) out.jump = true; }
  }
  return out;
}

/** Who only stands there: the input of somebody who does nothing. */
export function idleInput(st, out = { x: 0, y: 0, jump: false }) { out.x = 0; out.y = 0; out.jump = false; return out; }

/** Plays round `n` with the bot: { time (ms), jumps, over }. */
export function botRun(n, limit = 300) {
  const st = startRun(n, 0), input = { x: 0, y: 0, jump: false };
  for (let t = 0; t < limit && !st.over; t += LAVA.step) { botInput(st, input); stepRun(st, LAVA.step, input, null); }
  return { time: st.time, jumps: st.jumps, over: st.over };
}
