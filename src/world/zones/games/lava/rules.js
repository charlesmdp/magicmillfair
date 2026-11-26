// No Touch Lava!: its rules. No renderer here: the game, its checks and the player that plays by itself all read this.
//
// A small volcano east of the pier; deep in its crater a pool of lava, and standing in the lava sixty-one columns
// of basalt, six-sided. One runs and jumps on their tops. Heights are counted in levels: a jump climbs one level,
// never two; any drop is fine. The lava only rises — one level at a time, in pulses, faster and faster — and a
// column whose top it reaches is covered: whoever stands on it is out. Before each rise new columns come up out
// of the lava: a glow shows where (the whiter, the higher it will stand), then they rise, to at least one level
// above where the lava is about to be, sometimes two, three or four. No column ever goes down. So the field
// becomes a relief of terraces and summits that keeps climbing: what matters is to be high enough and to have a
// way on from where one is. The score is how long one held.
//
// A round leaves every ten seconds on the clock everybody shares, and what comes up in a round is drawn from its
// number: the same for everybody who takes that start, something else for the next one.
//
// What is fair in it: the columns of a pulse come as small hills — a stair up from ground that is dry, a summit,
// lower steps round it, some of them missing; small hills, most of them one or two levels over the lava to come,
// so that one has to move on at nearly every pulse. For the first eleven rises (a minute) the stairs are sure: from
// every column of the largest dry region one can walk, a step up at a time, to the largest region there will be
// after the rise, in the time left once the columns are up. Later the hills are fewer and narrower, the notice
// shorter, the stairs less and less sure; after the eighteenth rise nothing comes up any more. Twice after the
// minute the lava rises two levels hard on each other (a double rise, said two pulses ahead): what comes up before
// it stands over both. And there are lone tall columns from early on — out of reach, or with no way on: to read
// the relief is the game.
//
// Places on the field: x metres east and z metres south of its middle. Heights: metres over the lava as it is
// when the round begins (a level is LAVA.lv of them). Time is counted from the start of the round (before it:
// negative, and nothing moves), and advances in steps of 1/120 s whatever the frame rate.

export const LAVA = {
  name: 'No Touch Lava!',
  at: { x: 188, z: 8 }, // the middle of the field: in the open sea, east of the head of the pier
  level: 0.9, // the lava as a round begins, metres above the sea
  look: [-1, 0], // the way the camera looks, on the plan (x, z): west, towards the pier — "up" on the stick goes that way
  rings: 4, R: 1.45, // sixty-one columns: so many rings round the middle one; a column from its middle to a corner (m)
  lv: 0.9, // m: one level — the top of a column of level n stands n levels over the lava of the start
  top: 22, // no column ever stands higher than so many levels: the crater holds that much lava, and no more
  every: 10, // s: a round leaves every so often
  step: 1 / 120,
  run: 6.9, accel: 54, air: 31, // m/s; how fast one gets there on a column, in the air (m/s²)
  g: 26, jump: 8.07, // m/s², m/s up: a metre and a quarter, quickly — one level is jumped, two are not
  stepUp: 0.3, coyote: 0.1, // m that the feet take without a jump; s after the edge during which a jump still counts
  burn: 0.15, // m over the lava: lower than that, one is in it
  first: 6.5, quickest: 3, quick: 100, // s: the first rise, and from one rise to the next to begin with; from one to the next in the end; when that is reached
  surge: 0.6, // s: the lava takes so long to rise one level
  settle: 0.25, notice: [2.0, 0.6, 0.11], // s: after a rise, before the glows; a glow lasts so long to begin with, never less than, and so much less rise after rise
  rise: 0.5, // s: a column takes so long to come up
  fair: 11, last: 18, // the first so many rises have a sure way on; after so many, nothing comes up any more
  twice: [13, 17], again: 1.3, // the rises to these levels come hard on the one before (so many s after it): nothing comes up between the two, and what comes up before them stands over both
};

/**
 * The volcano that holds it (Lava.js builds it so). The crater opens by `flare` metres for each metre up; `rim`:
 * its crest, metres above the sea, about — nowhere more than `low` under that at its lip, nor more than `tall` over
 * it at the teeth of rock that stand on it; `foot`: where the cone meets the sea, metres from the middle, about;
 * `within`: nothing of it is further out than that.
 */
export const CONE = { flare: 0.2, rim: LAVA.level + LAVA.top * LAVA.lv + 2.7, low: 1.65, tall: 5.7, foot: 26, within: 26.9 };

export const UNDER = 0, GLOW = 1, RISING = 2, UP = 3;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const S3 = Math.sqrt(3);

// (numbers drawn from whole numbers only: the same on every device, to the last bit)
const stream = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ---------------------------------------------------------------------------------------------- the field

/**
 * The columns: { q, r (its place in the comb), x, z (its middle), ring (how far from the middle one), n (those
 * that touch it), far (those one column further: { i, gap (true when a whole column lies between), via (what the
 * jump goes over: that column — or the two it passes between) }) }.
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
  for (const c of CELLS) {
    for (const [dq, dr] of NEAR) { const i = at(c.q + dq, c.r + dr); if (i >= 0) c.n.push(i); }
    // (two steps the same way: over the column between; two different steps: between the two columns that touch both)
    for (let a = 0; a < 6; a++) for (const b of [a, (a + 1) % 6]) {
      const i = at(c.q + NEAR[a][0] + NEAR[b][0], c.r + NEAR[a][1] + NEAR[b][1]);
      if (i >= 0) c.far.push({ i, gap: a === b, via: (a === b ? [a] : [a, b]).map((k) => at(c.q + NEAR[k][0], c.r + NEAR[k][1])) });
    }
  }
}
const N = CELLS.length;
/** Whether the rise to level `k` comes hard on the one before (a double rise: nothing comes up between the two). */
export const twice = (k) => LAVA.twice.includes(k);
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

// ---------------------------------------------------------------------------------------------- the lava

/** When each rise begins (s from the start of a round): PULSES[k - 1] for the rise to level k. The same in every round. */
export const PULSES = [];
{ let t = LAVA.first; for (let k = 1; k <= LAVA.top; k++) { PULSES.push(t); t += twice(k + 1) ? LAVA.again : lerp(LAVA.first, LAVA.quickest, clamp(t / LAVA.quick, 0, 1)); } }

/** The board of scores: how long one held, ms — nobody holds longer than the lava takes to cover the highest a column may stand. */
export const BOARD = { order: 'desc', min: 1000, max: Math.ceil(PULSES[LAVA.top - 1] + LAVA.surge) * 1000 };

/**
 * The pulse that follows the rise to level `k` (k ≥ 1): when its columns glow, begin to rise, are up; when the
 * lava rises next (`at`), and the time left once they are up (`left`), s.
 */
export function pulseOf(k) {
  if (twice(k + 1)) { const at = PULSES[k]; return { glow: at, rise: at, up: at, at, left: 0 }; } // (between the two rises of a double: nothing)
  const L = LAVA, glow = PULSES[k - 1] + L.surge + L.settle, rise = glow + Math.max(L.notice[1], L.notice[0] - L.notice[2] * (k - 1)), up = rise + L.rise, at = PULSES[k];
  return { glow, rise, up, at, left: at - up };
}

/** How many rises have begun at `t`. */
export function risesAt(t) { let k = 0; while (k < PULSES.length && t >= PULSES[k]) k++; return k; }

/** How high the lava of a round is at `t`, in levels: whole between two rises; it stops once it has covered everything. */
export function lavaAt(round, t) {
  let k = 0;
  while (k < round.high && t >= PULSES[k]) k++;
  if (k === 0) return 0;
  const u = (t - PULSES[k - 1]) / LAVA.surge;
  return u >= 1 ? k : k - 1 + u * u * (3 - 2 * u);
}

// ---------------------------------------------------------------------------------------------- reading a relief

/**
 * The dry regions of a field of `levels` (one for each column) with the lava at level `lava`: columns that touch,
 * both dry, no more than a level apart — ground one walks about on. { of (the region of each column; -1: covered),
 * size (of each region), most (the largest; the first of them when several are as large; -1: nothing is dry) }.
 */
export function regionsOf(levels, lava) {
  const of = new Int16Array(N).fill(-1), size = [], stack = [];
  let most = -1;
  for (let s = 0; s < N; s++) {
    if (levels[s] <= lava || of[s] >= 0) continue;
    const id = size.length;
    let n = 0;
    of[s] = id; stack.push(s);
    while (stack.length) { const a = stack.pop(); n++; for (const b of CELLS[a].n) if (of[b] < 0 && levels[b] > lava && Math.abs(levels[b] - levels[a]) <= 1) { of[b] = id; stack.push(b); } }
    size.push(n);
    if (most < 0 || n > size[most]) most = id;
  }
  return { of, size, most };
}

/** What a move takes at a run (s): to the next column, up a level onto it, over a missing column, between two columns. */
export const PACE = { step: 0.37, up: 0.46, gap: 0.8, between: 0.7 };

/**
 * How long the walk is (s, at a run) from each column to the nearest of the columns `to`, on a field of `levels`
 * with the lava at `lava`: a step to a column that touches, no more than one level up (any drop is fine); and —
 * with `jumps` — a jump over one missing column to a top no higher, or between two columns, one level up at most
 * (what is jumped over no higher than where one leaves from). Infinity: no way.
 */
export function walks(levels, lava, to, jumps = true) {
  const d = new Float64Array(N).fill(Infinity);
  for (const c of to) d[c] = 0;
  for (let changed = true; changed;) {
    changed = false;
    for (let a = 0; a < N; a++) {
      const la = levels[a];
      if (la <= lava) continue;
      let best = d[a];
      for (const b of CELLS[a].n) { const lb = levels[b]; if (lb > lava && lb <= la + 1) { const w = d[b] + (lb > la ? PACE.up : PACE.step); if (w < best) best = w; } }
      if (jumps) for (const f of CELLS[a].far) {
        const lb = levels[f.i];
        if (lb <= lava || lb > la + (f.gap ? 0 : 1) || !f.via.every((m) => m < 0 || levels[m] <= la)) continue;
        const w = d[f.i] + (f.gap ? PACE.gap : PACE.between);
        if (w < best) best = w;
      }
      if (best < d[a] - 1e-12) { d[a] = best; changed = true; }
    }
  }
  return d;
}

/**
 * The way on, before a rise. `before`: the levels as they stood when the lava came to `lava`; `after`: as they
 * stand once the columns of the pulse are up. From every column of the largest dry region, the walk to the
 * largest region there will be once the lava is one level higher, and to any ground that stays dry.
 * { from (the columns of that region), to (those of the region to come), on (s: the longest of the walks to it),
 *   dry (s: the longest of the walks to ground that stays dry) }.
 */
export function wayOn(before, after, lava, jumps = true) {
  const A = regionsOf(before, lava), B = regionsOf(after, lava + 1), from = [], to = [], safe = [];
  for (let c = 0; c < N; c++) { if (A.most >= 0 && A.of[c] === A.most) from.push(c); if (B.most >= 0 && B.of[c] === B.most) to.push(c); if (after[c] > lava + 1) safe.push(c); }
  const d = walks(after, lava, to, jumps), e = walks(after, lava, safe, jumps);
  let on = 0, dry = 0;
  for (const c of from) { on = Math.max(on, d[c]); dry = Math.max(dry, e[c]); }
  return { from, to, on, dry };
}

// ---------------------------------------------------------------------------------------------- a round

const SUMMIT = [0.3, 0.42, 0.2, 0.08]; // how high a summit stands over the lava to come: one level, two, three, four
const pick = (rnd, weights) => { let p = rnd(); for (let i = 0; i < weights.length; i++) { p -= weights[i]; if (p < 0) return i; } return weights.length - 1; };

/**
 * The columns that come up before the rise to level k + 1: a Map column → level. `tops`: the levels as they
 * stand, `reg`: their dry regions. `sure`: a minute has not gone by — the hills are many and wide, each against
 * dry ground; `more` (0 to 1): more of them still (asked when what was drawn left somebody without a way on).
 */
function hills(k, tops, reg, rnd, sure, more) {
  const L = LAVA, plan = new Map(), base = k + 1 + (twice(k + 2) ? 1 : 0); // (`base`: the lava to come — two levels more before a double rise)
  const level = (c) => (plan.has(c) ? plan.get(c) : tops[c]), free = (c) => tops[c] <= k && !plan.has(c), put = (c, lv) => plan.set(c, Math.min(L.top, lv));
  const late = sure ? 0 : clamp((k - L.fair) / (L.last - 1 - L.fair), 0, 1); // (0 to 1: how far from the minute to the last pulse)
  // (while the stairs are sure: three hills or four, small ones, less and less wide; later one or two, or none)
  const count = sure ? 3 + (rnd() < (k <= 3 ? 0.5 : 0.25) ? 1 : 0) + (more > 0.3 ? 1 : 0) + (more > 0.65 ? 1 : 0) : rnd() < 1 - 0.55 * late ? (rnd() < 0.55 - 0.55 * late ? 2 : 1) : 0;
  const keep = sure ? [0.5 - 0.03 * (k - 1) + 0.5 * more, 0.22 - 0.02 * (k - 1) + 0.6 * more] : [0.42 - 0.32 * late, 0.16 * (1 - late)], joined = sure ? 1 : 0.9 - 0.7 * late;
  const order = reg.size.map((s, id) => id).sort((a, b) => (b === reg.most) - (a === reg.most) || reg.size[b] - reg.size[a] || a - b); // (the regions, the largest first)
  for (let h = 0; h < count; h++) {
    // ---- where its stair begins: against the largest dry region — or, later, another one, or anywhere in the lava
    const id = !order.length ? -1 : sure || rnd() < joined ? order[0] : rnd() < 0.5 ? order[Math.floor(rnd() * order.length)] : -1;
    const feet = [];
    for (let c = 0; c < N; c++) if (free(c) && (id < 0 || CELLS[c].n.some((a) => reg.of[a] === id))) feet.push(c);
    if (!feet.length) continue;
    // ---- the stair: one level over the lava to come, then a level higher at each step, to the summit
    let c = feet[Math.floor(rnd() * feet.length)], lv = base + 1;
    const high = 1 + pick(rnd, SUMMIT);
    put(c, lv);
    for (let s = 1; s < high; s++) {
      const on = CELLS[c].n.filter(free);
      if (!on.length) break;
      c = on[Math.floor(rnd() * on.length)];
      put(c, ++lv);
    }
    // ---- lower steps round the summit, some of them missing (round a summit of one level: a terrace)
    const top = level(c), ring = [];
    for (const x of CELLS[c].n) if (free(x) && rnd() < keep[0]) { put(x, Math.max(base + 1, top - 1)); ring.push(x); }
    for (const x of ring) { const low = level(x) - 1; if (low > base) for (const y of CELLS[x].n) if (free(y) && rnd() < keep[1]) put(y, low); }
  }
  // ---- to begin with, a causeway from the next regions to the largest — three columns at the most, a level over
  // the lava to come — where one can be laid: who climbed the wrong knoll is not left on an island at once
  if (sure) for (const id of order.slice(1, 3)) {
    if (reg.size[id] < 2 || rnd() > 0.85) continue;
    const from = new Int16Array(N).fill(-2), deep = new Int8Array(N), queue = [];
    for (let c = 0; c < N; c++) if (free(c) && CELLS[c].n.some((a) => reg.of[a] === id)) { from[c] = -1; deep[c] = 1; queue.push(c); }
    let end = -1;
    for (let i = 0; i < queue.length && end < 0; i++) {
      const c = queue[i];
      // (it lands against ground of the largest region that stays dry, or against a hill that is coming up there)
      if (CELLS[c].n.some((a) => (reg.of[a] === order[0] || plan.has(a)) && level(a) > base && level(a) <= base + 2)) end = c;
      else if (deep[c] < 3) for (const x of CELLS[c].n) if (free(x) && from[x] === -2) { from[x] = c; deep[x] = deep[c] + 1; queue.push(x); }
    }
    for (let c = end; c >= 0; c = from[c]) put(c, base + 1);
  }
  // ---- a spire, now and then: a thin stair that leads out into the lava, to a tall summit with nothing round it
  // — tempting, and a dead end unless something else comes up there
  if ((sure ? k >= 2 && rnd() < 0.45 : rnd() < 0.35 * (1 - late))) {
    const feet = [];
    for (let c = 0; c < N; c++) if (free(c) && CELLS[c].n.some((a) => tops[a] > k)) feet.push(c);
    if (feet.length) {
      let c = feet[Math.floor(rnd() * feet.length)], lv = base + 1;
      put(c, lv);
      for (let s = 1, long = 3 + (rnd() < 0.5 ? 1 : 0); s < long; s++) {
        // (each step to the column with the least dry ground round it)
        let on = [], least = 99;
        for (const x of CELLS[c].n) { if (!free(x)) continue; let n = 0; for (const y of CELLS[x].n) if (y !== c && level(y) > k) n++; if (n < least) { least = n; on = [x]; } else if (n === least) on.push(x); }
        if (!on.length) break;
        c = on[Math.floor(rnd() * on.length)];
        put(c, ++lv);
      }
    }
  }
  // ---- and lone tall columns: out in the lava, or against ground too low to climb them from
  const lone = sure ? (k >= 2 && rnd() < 0.5 ? 1 : 0) : (rnd() < 0.4 + 0.5 * late ? 1 : 0) + (late > 0.4 && rnd() < 0.5 ? 1 : 0);
  for (let i = 0; i < lone; i++) {
    const out = [], any = [];
    for (let c = 0; c < N; c++) if (free(c)) { any.push(c); if (CELLS[c].n.every((a) => level(a) <= k)) out.push(c); }
    const pool = out.length && rnd() < 0.7 ? out : any;
    if (!pool.length) break;
    put(pool[Math.floor(rnd() * pool.length)], base + 2 + pick(rnd, [0.3, 0.4, 0.3]));
  }
  return plan;
}

const _rounds = new Map();
/**
 * The round that leaves with start number `n`: { n, cols, high, end, pulses }. `cols[c]`: the columns that stand
 * at place `c`, one after the other, each higher than the last — { level, glow, rise, up }: it glows from `glow`,
 * comes up between `rise` and `up` (s from the start; the first of them has always been there). `high`: the
 * highest level any of them has — the lava stops there, at `end`. `pulses[k]`: what came before the rise to
 * level k + 1 — { k, glow, rise, up, at, left, sure, cells } (see pulseOf).
 */
export function makeRound(n) {
  const kept = _rounds.get(n);
  if (kept) return kept;
  const L = LAVA, rnd = stream(Math.imul(n | 0, 2654435761) ^ 0x51ED270B), tops = new Int8Array(N), next = new Int8Array(N);
  // ---- the relief of the start: knolls — a summit, steps round it — away from the middle, which is level and
  // low: that is where everybody starts, and where nobody can stay
  for (let tries = 0; tries < 200; tries++) {
    tops.fill(1);
    for (let i = 0, knolls = 5 + Math.floor(rnd() * 3); i < knolls; i++) {
      const c = Math.floor(rnd() * N), p = rnd(), high = p < 0.2 ? 4 : p < 0.72 ? 3 : 2, wide = rnd(), far = CELLS[c].ring >= 2;
      if (!far) continue;
      tops[c] = Math.max(tops[c], high);
      for (const x of CELLS[c].n) if (CELLS[x].ring >= 2 && (high === 2 ? wide < 0.5 : true)) tops[x] = Math.max(tops[x], Math.max(2, high - 1));
      if (high === 4) for (const x of CELLS[c].n) for (const y of CELLS[x].n) if (CELLS[y].ring >= 2 && rnd() < 0.5) tops[y] = Math.max(tops[y], 2);
    }
    const way = wayOn(tops, tops, 0, false), dry = tops.reduce((s, v) => s + (v > 1 ? 1 : 0), 0);
    if (way.from.includes(cellAt(0, 0)) && way.to.length >= 6 && dry >= 16 && dry <= 30 && way.on <= 0.4 * PULSES[0]) break;
  }
  const cols = Array.from(tops, (level) => [{ level, glow: -1e9, rise: -1e9, up: -1e9 }]);
  const pulses = [{ k: 0, glow: -1e9, rise: -1e9, up: -1e9, at: PULSES[0], left: PULSES[0], sure: true, cells: [] }];
  // ---- pulse after pulse: the lava is at level k; what comes up before it rises to k + 1
  for (let k = 1; k < L.last; k++) {
    const reg = regionsOf(tops, k), P = pulseOf(k), sure = k < L.fair;
    if (twice(k + 1)) { pulses.push({ k, ...P, sure, cells: [] }); continue; } // (between the two rises of a double)
    let plan = null, least = Infinity;
    for (let a = 0, tries = sure ? 150 : 1; a < tries; a++) {
      const drawn = hills(k, tops, reg, rnd, sure, a / 149);
      if (!sure) { plan = drawn; break; }
      // (a way on for everybody of the largest region, with time to spare — or it is drawn again, more of it)
      next.set(tops);
      for (const [c, lv] of drawn) next[c] = lv;
      const way = wayOn(tops, next, k, false), miss = way.to.length < 5 ? 1e9 : way.on - 0.7 * P.left;
      if (miss < least) { least = miss; plan = drawn; }
      if (miss <= 0) break;
    }
    // (there is always something that comes up, to the last pulse: one column at the least, wherever)
    if (!plan.size) { const free = []; for (let c = 0; c < N; c++) if (tops[c] <= k) free.push(c); plan.set(free[Math.floor(rnd() * free.length)], k + 2 + (twice(k + 2) ? 1 : 0) + pick(rnd, [0.6, 0.3, 0.1])); }
    const cells = [...plan.keys()].sort((a, b) => a - b);
    for (const c of cells) { tops[c] = plan.get(c); cols[c].push({ level: tops[c], glow: P.glow, rise: P.rise, up: P.up }); }
    pulses.push({ k, glow: P.glow, rise: P.rise, up: P.up, at: P.at, left: P.left, sure, cells });
  }
  const high = tops.reduce((m, v) => Math.max(m, v), 0), round = { n, cols, high, end: PULSES[high - 1] + L.surge, pulses };
  if (_rounds.size > 24) _rounds.delete(_rounds.keys().next().value);
  _rounds.set(n, round);
  return round;
}

/** The level of the column that stands at each place of a round at `t` (`seen`: or that glows there already). */
export function levelsAt(round, t, out = new Int8Array(N), seen = false) {
  for (let c = 0; c < N; c++) { const list = round.cols[c]; let lv = list[0].level; for (let i = 1; i < list.length; i++) if ((seen ? list[i].glow : list[i].up) <= t) lv = list[i].level; out[c] = lv; }
  return out;
}

/**
 * What stands at place `c` of a round at `t`: { state (UNDER: covered; GLOW: one is about to come up there;
 * RISING; UP), level (of the column that is there, or is coming), top (m over the lava of the start), k (how far
 * through the glow, the rising: 0 to 1; once up: for how long, s) }. `lava`: the level of the lava then, when known.
 */
export function columnAt(round, c, t, out = {}, lava = lavaAt(round, t)) {
  const list = round.cols[c], L = LAVA, pool = lava * L.lv;
  let e = list[0];
  for (let i = list.length - 1; i > 0; i--) if (t >= list[i].glow) { e = list[i]; break; }
  out.level = e.level;
  // (its head shows in the lava and swells a little — never so high that one could stand on it — then up it goes)
  if (t < e.rise) { const k = (t - e.glow) / (e.rise - e.glow); out.state = GLOW; out.k = k; out.top = pool + 0.03 + 0.1 * k; }
  else if (t < e.up) { const k = (t - e.rise) / (e.up - e.rise), from = pool + 0.13; out.state = RISING; out.k = k; out.top = from + (e.level * L.lv - from) * (1 - (1 - k) * (1 - k)); }
  else { out.top = e.level * L.lv; out.state = out.top > pool ? UP : UNDER; out.k = t - e.up; }
  return out;
}
const _c = {};
/** How high the top of the column at place `c` is at `t` (m over the lava of the start; far below beyond the field). */
export const topAt = (round, c, t, lava) => (c < 0 ? -99 : columnAt(round, c, t, _c, lava).top);
/** How many columns stand dry at `t`. */
export function dryAt(round, t) { const lava = lavaAt(round, t); let n = 0; for (let c = 0; c < N; c++) { columnAt(round, c, t, _c, lava); if (_c.state === UP || (_c.state === RISING && _c.top > lava * LAVA.lv + LAVA.burn)) n++; } return n; }

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
  const t = st.clock, lava = lavaAt(R, t), pool = lava * L.lv;
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
  const wall = (x, z) => topAt(R, cellAt(x, z), t, lava) > st.h + L.stepUp;
  let nx = st.x + st.vx * dt, nz = st.z + st.vz * dt;
  if (wall(nx, nz)) {
    if (!wall(nx, st.z)) { nz = st.z; st.vz = 0; } else if (!wall(st.x, nz)) { nx = st.x; st.vx = 0; } else { nx = st.x; nz = st.z; st.vx = 0; st.vz = 0; }
  }
  const far = Math.sqrt(nx * nx + nz * nz), lim = FIELD + 1.1; // (the rock of the crater)
  if (far > lim) { nx *= lim / far; nz *= lim / far; }
  st.x = nx; st.z = nz;
  // ---- up and down: on a column one goes where it goes; off it one falls
  const top = topAt(R, cellAt(st.x, st.z), t, lava);
  if (st.ground) {
    if (top >= st.h - 0.35) st.h = top; else { st.ground = false; st.coyote = L.coyote; st.vh = 0; }
  }
  if (!st.ground) {
    st.vh -= L.g * dt; st.h += st.vh * dt;
    if (st.vh <= 0 && st.h <= top && st.h >= top - 0.45 && top > pool + L.burn) { st.h = top; st.vh = 0; st.ground = true; events?.push({ type: 'land' }); }
  }
  // ---- the lava: whoever is down to it is out — in the air, or on a column it covers
  if (st.h <= pool + L.burn) { st.h = Math.max(st.h, pool - 0.2); st.over = true; st.time = Math.max(0, Math.round(t * 1000)); events?.push({ type: 'out', time: st.time }); }
}

// ---------------------------------------------------------------------------------------------- a player that plays by itself

const BOT = { step: 0.42, up: 0.5, gap: 1.1, between: 1.0 }; // s: what its moves take (it backs up before a jump over the lava)
/**
 * It looks about itself: the level every column has or is about to have (a glow says how high), how soon it can
 * be on each — a search from column to column, a step up at a time, over a missing one at a jump, waiting for
 * those that are still coming up, never across what the lava will have covered by then — and where it is best to
 * be: on ground that stays dry after the rise to come, of the largest region there will be then, high on it,
 * with columns round it to go on to. It notes where it is going (`goal`) and the next column of the way (`next`).
 */
function look(st, B, here) {
  const L = LAVA, R = st.round, t = st.clock, lv = B.lv, upAt = B.up, arr = B.arr, prev = B.prev, far = B.far, done = B.done, k = risesAt(t);
  // (as far as it knows the rises go on, each when it is due: it does not know which is the last)
  const cover = (level) => (level <= PULSES.length ? PULSES[level - 1] + 0.25 : Infinity);
  for (let c = 0; c < N; c++) { const list = R.cols[c]; let e = list[0]; for (let i = list.length - 1; i > 0; i--) if (t >= list[i].glow) { e = list[i]; break; } lv[c] = e.level; upAt[c] = e.up; }
  // just after a rise nothing glows yet: it waits where it is to see what comes — unless that is about to go under
  if (k > 0 && t < PULSES[k - 1] + L.surge + L.settle + 0.05 && cover(lv[here]) > t + 1.2) { B.goal = here; B.next = here; B.jump = false; return; }
  arr.fill(Infinity); done.fill(0);
  arr[here] = t; prev[here] = -1;
  for (;;) {
    let a = -1;
    for (let c = 0; c < N; c++) if (!done[c] && arr[c] < Infinity && (a < 0 || arr[c] < arr[a])) a = c;
    if (a < 0) break;
    done[a] = 1;
    const la = lv[a], until = cover(la) + 0.1;
    for (const b of CELLS[a].n) {
      if (done[b] || lv[b] <= k || lv[b] > la + 1) continue;
      const at = Math.max(arr[a] + (lv[b] > la ? BOT.up : BOT.step + 0.07 * Math.min(4, la - lv[b])), upAt[b] + 0.2);
      if (at <= until && at <= cover(lv[b]) - 0.1 && at < arr[b]) { arr[b] = at; prev[b] = a; far[b] = 0; }
    }
    for (const f of CELLS[a].far) {
      const b = f.i;
      if (done[b] || lv[b] <= k || lv[b] > la + (f.gap ? 0 : 1) || !f.via.every((m) => m < 0 || lv[m] <= la)) continue;
      const at = Math.max(arr[a] + (f.gap ? BOT.gap : BOT.between), upAt[b] + 0.2);
      if (at <= until && at <= cover(lv[b]) - 0.1 && at < arr[b]) { arr[b] = at; prev[b] = a; far[b] = 1; }
    }
  }
  // (before a double rise the lava to come is two levels up, not one: it was said, and it reads it so)
  const two = twice(k + 2) ? 1 : 0, F = regionsOf(lv, k + 1 + two), G = regionsOf(lv, k + 2 + two);
  let best = here, most = -Infinity;
  for (let g = 0; g < N; g++) {
    if (arr[g] === Infinity) continue;
    const life = lv[g] - k - two, f = F.of[g], size = f >= 0 ? F.size[f] : 0, deep = G.of[g] >= 0 ? G.size[G.of[g]] : 0;
    let room = 0;
    for (const y of CELLS[g].n) if (lv[y] > k + 1 + two && Math.abs(lv[y] - lv[g]) <= 1) room++;
    // (`climber`: one who does not read the relief — the highest column within reach will do, whatever is round it)
    const v = B.climber ? 25 * life - 6 * (arr[g] - t) + (g === B.goal ? 12 : 0) : B.lazy ? (life >= 2 ? 1000 : 25 * life) - 6 * (arr[g] - t) + (g === B.goal ? 12 : 0)
      : (life >= 2 ? 1000 : 0) + (f >= 0 && f === F.most ? 40 * Math.min(size, 15) : 0) + 8 * Math.min(size, 15) + 25 * Math.min(life, 4) + 3 * Math.min(deep, 8) + 2 * room
        - 6 * (arr[g] - t) - 0.3 * Math.sqrt(CELLS[g].x ** 2 + CELLS[g].z ** 2) + (g === B.goal ? 12 : 0);
    if (v > most) { most = v; best = g; }
  }
  let c = best;
  while (c !== here && prev[c] !== here) c = prev[c];
  // (already stepping over to a column that stands and will stand a while yet, it goes on: no turning back on the edge)
  const o = B.next;
  if (o >= 0 && o !== c && o !== here && !B.jump && CELLS[here].n.includes(o) && upAt[o] <= t && lv[o] > k && lv[o] <= lv[here] + 1 && cover(lv[o]) > t + 1 && (st.x - CELLS[o].x) ** 2 + (st.z - CELLS[o].z) ** 2 < 1.8 * 1.8) return;
  if (c !== B.next) B.back = false;
  B.goal = best; B.next = c; B.jump = c !== here && far[c] === 1;
}

/**
 * Plays by itself — the proof that a round can be held. It knows nothing a player does not see: the columns that
 * stand, those that glow or are coming up, how soon the lava is due. See `look` for what it makes of it; here it
 * goes where it decided, column after column: through the middle of the side two columns share, a jump where the
 * way goes up, a wait short of the edge for a column that is not up yet, a few steps back and a run before a jump
 * over the lava. Returns the input for stepRun. (`st.bot.every`: how often it looks about itself, s — a tenth of
 * a second unless said; the checks try a slower one.)
 */
export function botInput(st, out = { x: 0, y: 0, jump: false }) {
  const L = LAVA, R = st.round, t = st.clock, [fx, fz] = L.look, rx = -fz, rz = fx;
  out.x = 0; out.y = 0; out.jump = false;
  if (st.over) return out;
  const B = st.bot || (st.bot = {}), here = cellAt(st.x, st.z);
  if (!B.lv) Object.assign(B, { goal: -1, next: -1, jump: false, back: false, think: -1e9, every: B.every || 0.1, lv: new Int8Array(N), up: new Float64Array(N), arr: new Float64Array(N), prev: new Int16Array(N), far: new Uint8Array(N), done: new Uint8Array(N) });
  if (st.ground && here >= 0 && t >= B.think) { B.think = t + B.every; look(st, B, here); }
  const goal = B.next >= 0 ? B.next : here;
  if (goal < 0) return out;
  const C = CELLS[goal], pool = lavaAt(R, t) * L.lv;
  let tx = C.x, tz = C.z;
  if (here >= 0 && goal !== here && !st.ground) {
    // (in the air over ground, bound for a column that is not out of the lava yet: it comes down where it is)
    if (!B.jump && topAt(R, goal, t + 0.1) < pool + 0.45 && topAt(R, here, t) > pool + 0.45) { tx = CELLS[here].x; tz = CELLS[here].z; }
  } else if (here >= 0 && goal !== here) {
    const H = CELLS[here];
    if (B.jump) {
      // (over the lava: from the middle of its column, at a run)
      // (and not before the column it jumps to is up)
      if (!B.back) { tx = H.x; tz = H.z; if ((st.x - H.x) ** 2 + (st.z - H.z) ** 2 < 0.09 && B.up[goal] <= t + 0.3) B.back = true; }
    } else {
      const ex = (H.x + C.x) / 2, ez = (H.z + C.z) / 2, top = topAt(R, goal, t + 0.1), px = st.x + (C.x - st.x) * 0.3, pz = st.z + (C.z - st.z) * 0.3, over = cellAt(px, pz);
      // (a neighbour that is not out of the lava yet: one waits for it short of the edge; and one goes to it through
      // the middle of the side the two share, not across the corner of a third)
      if (top < pool + 0.45) { tx = H.x + (ex - H.x) * 0.5; tz = H.z + (ez - H.z) * 0.5; }
      else if (over !== here && over !== goal) { tx = ex; tz = ez; }
    }
  }
  const dx = tx - st.x, dz = tz - st.z, d = Math.sqrt(dx * dx + dz * dz);
  if (d > 0.12) { const k = Math.min(1, d / 0.5) / d; out.y = (dx * fx + dz * fz) * k; out.x = (dx * rx + dz * rz) * k; }
  // ---- and a jump where the way goes up a level, or leaves the column for the lava
  if (st.ground && here >= 0 && goal !== here && d > 0.4) {
    const ahead = cellAt(st.x + (dx / d) * 0.5, st.z + (dz / d) * 0.5);
    if (ahead !== here) { if (B.jump ? B.back : topAt(R, ahead, t + 0.08) > st.h + L.stepUp - 0.04) out.jump = true; }
  }
  return out;
}

/** Who only stands there: the input of somebody who does nothing. */
export function idleInput(st, out = { x: 0, y: 0, jump: false }) { out.x = 0; out.y = 0; out.jump = false; return out; }

/**
 * Plays round `n` with the bot (`every`: how often it looks about itself, s; `climber`: it only goes for the
 * highest column within reach, without reading what is round it): { time (ms), jumps, over }.
 */
export function botRun(n, limit = 200, every = 0.1, climber = false) {
  const st = startRun(n, 0), input = { x: 0, y: 0, jump: false };
  st.bot = { every, climber };
  for (let t = 0; t < limit && !st.over; t += LAVA.step) { botInput(st, input); stepRun(st, LAVA.step, input, null); }
  return { time: st.time, jumps: st.jumps, over: st.over };
}
