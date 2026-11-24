// The Bee's Knees: its rules. No renderer here: the game, its checks and the player that plays by itself all read
// this.
//
// Three round combs of wax hang one above the other over the sea, in the north of the bay. One runs on them, and
// the cell one sets foot on gives way: it holds a moment — a little less on each comb down — and drops, whether
// one is still on it or not; it does not come back. Through a hole one falls to the comb below; from the last
// one, into the sea, and that is the run: how long one held.
//
// One is not alone up there: on each comb a bee takes the wax apart by itself, cell after cell, on a path drawn
// from the seed of the run — where it lands, the cell gives way as under a foot. Some cells are capped: they hold
// much longer — the one in the middle of the top comb is: one begins there, with the time to look round. And on
// the two lower combs a few hold royal jelly: the first foot on one is thrown back up to the comb above (through
// its wax: a comb stops only what comes down on it) — once; after that it is a cell like another, and a bee that
// got there first has eaten it.
//
// Places: metres from the middle of the combs, `x` to the east and `z` to the south; `y` over the sea. The stick
// is read along the way the camera looks (HIVE.view): up runs away from it. Time advances in steps of 1/120 s
// whatever the frame rate.

export const HIVE = {
  name: "The Bee's Knees",
  at: { x: 84, z: -84 }, // the middle of the combs, over the sea
  gate: { x: 43.5, z: -79.5, yaw: 1.68 }, // where one asks to play, on the sand between the last parasol of the beach and its lounge, looking out at the combs (a heading of the valley: 0 looks south)
  view: -Math.PI / 2, // the way the camera looks, and "up" on the stick: west, back towards the beach and the valley
  levels: [19, 13, 7], // the floor of each comb over the sea: the top one first
  cell: 1.1, // from the middle of a cell to one of its corners
  radius: 7, // a comb is every cell whose middle is within so far of its own
  delay: [0.6, 0.5, 0.4], // s a cell holds once touched, comb by comb
  capped: 2, caps: 0.13, // … and a capped one, on any comb; the share of them
  jelly: 3, throw: 17.6, // cells of royal jelly on each comb but the top one; how hard they throw (m/s up: seven metres)
  step: 1 / 120,
  run: 6, accel: 42, air: 18, // m/s; how fast one gets there on the wax, and in the air (m/s²)
  g: 22, jump: 7.3, // m/s², m/s up: a little over a metre high, two thirds of a second in the air
  foot: 0.22, // one still stands with the feet so far over the edge of a cell
  coyote: 0.1, buffer: 0.12, // s: a jump still granted after the wax has gone; asked so long before it can be
  drone: { every: 1.3, first: [2.4, 3.6, 4.8] }, // a bee lands on a cell every so many seconds; its first, comb by comb
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hash = (n, k = 0) => { const s = Math.sin(n * 127.1 + k * 311.7 + 74.7) * 43758.5453; return s - Math.floor(s); };
const S3 = Math.sqrt(3), R = HIVE.cell;
/** From the middle of a cell to the middle of one of its sides, and to the middle of the next cell. */
export const APOTHEM = (R * S3) / 2, PITCH = R * S3;

// ---- the cells of a comb (the three are alike): pointed hexagons, their neighbours across their six sides
const key = (q, r) => (q + 64) * 128 + (r + 64), SIDES = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
/** The cells: { q, r (their rank on the comb), x, z (their middle) }, row after row. */
export const CELLS = [];
{
  const n = Math.ceil(HIVE.radius / (R * 1.5)) + 1;
  for (let r = -n; r <= n; r++) for (let q = -2 * n; q <= 2 * n; q++) { const x = PITCH * (q + r / 2), z = R * 1.5 * r; if (Math.hypot(x, z) <= HIVE.radius + 1e-6) CELLS.push({ q, r, x, z }); }
}
const N = CELLS.length, INDEX = new Map(CELLS.map((c, i) => [key(c.q, c.r), i]));
const CX = Float64Array.from(CELLS, (c) => c.x), CZ = Float64Array.from(CELLS, (c) => c.z);
const index = (q, r) => INDEX.get(key(q, r)) ?? -1;
/** The cells next to each cell, and those one cell further (a jump away). */
export const NEAR = CELLS.map((c) => SIDES.map(([dq, dr]) => index(c.q + dq, c.r + dr)).filter((i) => i >= 0));
const RING2 = CELLS.map((c, i) => { const out = new Set(); for (const j of NEAR[i]) for (const k of NEAR[j]) if (k !== i && !NEAR[i].includes(k)) out.add(k); return [...out].sort((a, b) => a - b); });
/** The cell in the middle of a comb: on the top one, where one stands when the run begins. */
export const START = index(0, 0);
const RIM = CELLS.map((_, i) => i).filter((i) => NEAR[i].length < 6);

/** How far (x, z) is from the middle of a cell, as its sides count it: within APOTHEM, one is over the cell. */
const reachOf = (dx, dz) => Math.max(Math.abs(dx), Math.abs(dx * 0.5 + dz * (S3 / 2)), Math.abs(dx * 0.5 - dz * (S3 / 2)));
const _ax = [0, 0];
function axial(x, z) {
  const fq = ((x * S3) / 3 - z / 3) / R, fr = ((2 / 3) * z) / R, fs = -fq - fr;
  let q = Math.round(fq), r = Math.round(fr); const s = Math.round(fs), dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  _ax[0] = q; _ax[1] = r;
  return _ax;
}
/** The cell (x, z) is over — whether it still stands or not —, or -1 beyond the edge of the comb. */
export function cellAt(x, z) { const a = axial(x, z); return index(a[0], a[1]); }
/** Brings (x, z) back onto the comb when it is beyond its outer cells: nobody leaves a comb sideways. */
function keepIn(x, z, out) {
  const a = axial(x, z), q = a[0], r = a[1];
  let best = -1, least = Infinity;
  for (const [dq, dr] of SIDES) { const j = index(q + dq, r + dr); if (j < 0) continue; const h = reachOf(x - CX[j], z - CZ[j]); if (h < least) { least = h; best = j; } }
  if (best < 0) { const k = (HIVE.radius - R) / Math.hypot(x, z); out.x = x * k; out.z = z * k; return out; } // (far out: never, a step at a time)
  const k = (APOTHEM * 0.997) / least;
  out.x = CX[best] + (x - CX[best]) * k; out.z = CZ[best] + (z - CZ[best]) * k;
  return out;
}

/**
 * What each cell of each comb is — 0: plain wax; 1: capped (it holds longer); 2: royal jelly (it throws one back
 * up) —, the same for every run: one learns where the jelly is.
 */
export const KIND = HIVE.levels.map((_, c) => {
  const kind = new Uint8Array(N);
  if (c > 0) {
    // the jelly: neither in the middle nor on the rim, and well apart
    const order = CELLS.map((_, i) => i).filter((i) => { const d = Math.hypot(CX[i], CZ[i]); return d > 2.4 && d < 5.4; }).sort((a, b) => hash(a, 40 + c) - hash(b, 40 + c)), picked = [];
    for (const i of order) { if (picked.length >= HIVE.jelly) break; if (picked.every((j) => Math.hypot(CX[i] - CX[j], CZ[i] - CZ[j]) > 5)) picked.push(i); }
    for (const i of picked) kind[i] = 2;
  }
  for (let i = 0; i < N; i++) if (!kind[i] && i !== START && hash(i, 20 + c) < HIVE.caps) kind[i] = 1;
  if (!c) kind[START] = 1; // (where the run begins: capped, so that one has the time to look round)
  return kind;
});
/** How long a cell of comb `c` holds once touched (s). */
export const holds = (c, i) => (KIND[c][i] === 1 ? HIVE.capped : HIVE.delay[c]);

// the stick: "up" runs the way the camera looks, "right" to its right
const FX = Math.sin(HIVE.view), FZ = Math.cos(HIVE.view), RX = -FZ, RZ = FX;

/**
 * A run, on the middle of the top comb. `seed`: what the paths of the bees are drawn from. Its state: where one
 * is (x, y, z), `ground` and `on` (the comb one stands on, or stood on last), `cell` (the one under the feet, -1
 * in the air), `drop[comb][cell]` (the second of the run when the cell drops: Infinity while nothing touched it),
 * `drone[comb]` ({ at: the cell the bee sits on, to: the one it flies to, next: when it lands there }), `over` and
 * `time` (ms) once one is in the sea.
 */
export function startRun(seed = 1) {
  return {
    seed, x: CX[START], z: CZ[START], y: HIVE.levels[0], vx: 0, vz: 0, vy: 0, face: HIVE.view, ground: true, on: 0, cell: START,
    coyote: 0, want: 0, clock: 0, acc: 0, over: false, time: 0, mine: 0, jumps: 0, throws: 0, falls: 0, low: 0,
    drop: HIVE.levels.map(() => new Float64Array(N).fill(Infinity)),
    drone: HIVE.levels.map((_, c) => ({ at: -1, to: RIM[Math.floor(hash(seed, 60 + c) * RIM.length) % RIM.length], next: HIVE.drone.first[c], k: 0 })),
  };
}
/** Has this cell dropped? */
export const gone = (st, c, i) => st.clock >= st.drop[c][i];
/** How many cells of comb `c` still stand. */
export function standing(st, c) { let n = 0; for (let i = 0; i < N; i++) if (st.clock < st.drop[c][i]) n++; return n; }

/** The cell of comb `c` that carries who is at (x, z): the one under them, else one whose edge is under their feet; -1: none. */
function support(st, c, x, z) {
  const i = cellAt(x, z), drop = st.drop[c];
  if (i < 0) return -1;
  if (st.clock < drop[i]) return i;
  let best = -1, least = HIVE.foot;
  for (const j of NEAR[i]) { if (st.clock >= drop[j]) continue; const d = reachOf(x - CX[j], z - CZ[j]) - APOTHEM; if (d < least) { least = d; best = j; } }
  return best;
}

/** A foot on a cell: untouched, it starts to give way — or, royal jelly, throws one back up. */
function stepOn(st, c, i, events) {
  if (st.drop[c][i] !== Infinity) return;
  st.mine++;
  if (KIND[c][i] === 2) {
    st.drop[c][i] = st.clock + HIVE.delay[c];
    st.vy = HIVE.throw; st.ground = false; st.cell = -1; st.coyote = 0; st.throws++;
    events?.push({ type: 'throw', comb: c, cell: i });
    return;
  }
  st.drop[c][i] = st.clock + holds(c, i);
  events?.push({ type: 'touch', comb: c, cell: i });
}

/** The bee of comb `c` lands where it was flying to — the cell gives way — and chooses where it flies next. */
function droneStep(st, c, events) {
  const d = st.drone[c], drop = st.drop[c];
  if (d.to >= 0) {
    d.at = d.to;
    if (drop[d.at] === Infinity) { drop[d.at] = d.next + holds(c, d.at); events?.push({ type: 'bee', comb: c, cell: d.at }); }
  }
  d.k++;
  // a cell next to it that nothing has touched, drawn from the seed; when there is none, the nearest one anywhere
  const near = d.at < 0 ? [] : NEAR[d.at].filter((j) => drop[j] === Infinity);
  if (near.length) d.to = near[Math.floor(hash(st.seed * 7.13 + c * 101, d.k) * near.length) % near.length];
  else {
    let best = -1, least = Infinity;
    for (let j = 0; j < N; j++) { if (drop[j] !== Infinity) continue; const l = d.at < 0 ? 0 : Math.hypot(CX[j] - CX[d.at], CZ[j] - CZ[d.at]); if (l < least - 1e-9) { least = l; best = j; } }
    d.to = best; // (-1: nothing is left for it on this comb)
  }
  d.next += HIVE.drone.every;
}

/**
 * Advances a run by `dt` seconds. `input`: { x (-1 … 1, to the right of the camera), y (-1 … 1, away from it),
 * jump (true on the frame it is asked) }. `events`: { type: 'touch' | 'bee' (comb, cell) | 'jump' | 'land' (comb)
 * | 'fall' (comb) | 'throw' (comb, cell) | 'sea' (time) }.
 */
export function stepRun(st, dt, input, events) {
  if (input?.jump) st.want = HIVE.buffer;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= HIVE.step && !st.over) { st.acc -= HIVE.step; sub(st, HIVE.step, input, events); }
  return st;
}

const _k = { x: 0, z: 0 };
function sub(st, dt, input, events) {
  const H = HIVE;
  st.clock += dt;
  if (st.want > 0) st.want -= dt;
  if (st.coyote > 0) st.coyote -= dt;
  for (let c = 0; c < H.levels.length; c++) while (st.clock >= st.drone[c].next) droneStep(st, c, events);
  // ---- across: as one pushes, along the way the camera looks
  let ix = clamp(input?.x || 0, -1, 1), iy = clamp(input?.y || 0, -1, 1);
  const il = Math.hypot(ix, iy); if (il > 1) { ix /= il; iy /= il; }
  const a = (st.ground ? H.accel : H.air) * dt;
  let dx = (FX * iy + RX * ix) * H.run - st.vx, dz = (FZ * iy + RZ * ix) * H.run - st.vz;
  const dl = Math.hypot(dx, dz); if (dl > a) { dx *= a / dl; dz *= a / dl; }
  st.vx += dx; st.vz += dz;
  let x = st.x + st.vx * dt, z = st.z + st.vz * dt;
  if (cellAt(x, z) < 0) { keepIn(x, z, _k); x = _k.x; z = _k.z; }
  st.x = x; st.z = z;
  if (st.vx * st.vx + st.vz * st.vz > 0.4) st.face = Math.atan2(st.vx, st.vz);
  // ---- on a comb: the cell that carries one, or none
  if (st.ground) {
    const i = support(st, st.on, x, z);
    if (i < 0) { st.ground = false; st.cell = -1; st.coyote = H.coyote; st.falls++; events?.push({ type: 'fall', comb: st.on }); } else { st.cell = i; stepOn(st, st.on, i, events); }
  }
  // ---- a jump: off the wax, or a moment after it has gone
  if (st.want > 0 && (st.ground || st.coyote > 0)) { st.vy = H.jump; st.ground = false; st.cell = -1; st.coyote = 0; st.want = 0; st.jumps++; events?.push({ type: 'jump' }); }
  if (st.ground) return;
  // ---- in the air: a comb stops only what comes down on it
  st.vy -= H.g * dt;
  const y0 = st.y, y1 = y0 + st.vy * dt;
  st.y = y1;
  if (st.vy <= 0) {
    for (let c = 0; c < H.levels.length; c++) {
      const L = H.levels[c];
      if (!(y0 >= L && y1 < L)) continue;
      const i = support(st, c, x, z);
      if (i < 0) continue;
      st.y = L; st.vy = 0; st.ground = true; st.on = c; st.cell = i; st.low = Math.max(st.low, c);
      events?.push({ type: 'land', comb: c });
      stepOn(st, c, i, events);
      return;
    }
  }
  if (st.y <= 0) { st.y = 0; st.over = true; st.time = Math.round(st.clock * 1000); events?.push({ type: 'sea', time: st.time }); }
}

/** Where the bee of comb `c` is: { x, z, up (over the wax, m), flying (0 … 1 of its hop), at, to }. It hops during the last half second before it lands. */
export function droneAt(st, c, out = {}) {
  const d = st.drone[c], hop = 0.55, left = d.next - st.clock, f = d.to < 0 ? 0 : clamp(1 - left / hop, 0, 1), k = f * f * (3 - 2 * f);
  // (before its first cell it comes in from beyond the rim)
  const ax = d.at >= 0 ? CX[d.at] : d.to >= 0 ? CX[d.to] * 1.45 : 0, az = d.at >= 0 ? CZ[d.at] : d.to >= 0 ? CZ[d.to] * 1.45 : 0;
  const bx = d.to >= 0 ? CX[d.to] : ax, bz = d.to >= 0 ? CZ[d.to] : az;
  out.x = ax + (bx - ax) * k; out.z = az + (bz - az) * k; out.up = 0.35 + Math.sin(Math.PI * f) * 0.9 + (d.at < 0 ? (1 - k) * 2.5 : 0);
  out.flying = f; out.at = d.at; out.to = d.to; out.heading = Math.atan2(bx - ax, bz - az);
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// A player that plays by itself — the proof that one can hold. It stands on a cell for as long as the wax lets
// it, then jumps to an untouched one — the one that leaves it the most to come back to: the cell with the fewest
// untouched cells round it —, takes the jelly when the comb above is still worth going back to, and when nothing
// is left within a jump waits for the drop over the best of the comb below.

/** When who is in the air comes down to the level `L`, in seconds (Infinity: never — they do not reach it). */
const fallTime = (st, L) => { const h = st.y - L, d = st.vy * st.vy + 2 * HIVE.g * h; return d < 0 ? Infinity : (st.vy + Math.sqrt(d)) / HIVE.g; };
/** How far one gets across in the air in `t` seconds, starting from rest. */
const airReach = (t) => { const t1 = HIVE.run / HIVE.air; return (t < t1 ? 0.5 * HIVE.air * t * t : 0.5 * HIVE.air * t1 * t1 + HIVE.run * (t - t1)) * 0.85; };
const untouched = (st, c, j) => st.drop[c][j] === Infinity;
const roundFree = (st, c, j, but = -1) => { let n = 0; for (const k of NEAR[j]) if (k !== but && untouched(st, c, k)) n++; return n; };

/** The best cell of comb `c` to come down on from (x, z), `t` seconds from now: -1 when none can be reached. */
function landing(st, c, x, z, t) {
  const reach = airReach(t) + APOTHEM * 0.6, when = st.clock + t;
  let best = -1, most = -Infinity;
  for (let j = 0; j < N; j++) {
    if (st.drop[c][j] <= when + 0.05) continue;
    const d = Math.hypot(CX[j] - x, CZ[j] - z);
    if (d > reach) continue;
    const fresh = untouched(st, c, j), score = (fresh ? 10 + roundFree(st, c, j) : st.drop[c][j] - when) - d * 0.6 - (st.drone[c].to === j ? 6 : 0) - (KIND[c][j] === 2 ? 4 : 0);
    if (score > most) { most = score; best = j; }
  }
  return best;
}

/** Pushes the stick so as to be at (gx, gz) in `t` seconds (the stick is read along the camera). */
function steer(st, gx, gz, t, out) {
  const k = 1 / Math.max(t, 0.09), wx = (gx - st.x) * k, wz = (gz - st.z) * k;
  // (the speed asked for, as a share of the run; a little more than the difference, to get there)
  let ux = (wx - st.vx * 0.35) / HIVE.run, uz = (wz - st.vz * 0.35) / HIVE.run;
  const l = Math.hypot(ux, uz); if (l > 1) { ux /= l; uz /= l; }
  out.y = ux * FX + uz * FZ; out.x = ux * RX + uz * RZ;
  return out;
}

export function botInput(st, out = { x: 0, y: 0, jump: false }) {
  out.x = 0; out.y = 0; out.jump = false;
  if (st.over) return out;
  const H = HIVE, B = st.bot || (st.bot = { goal: -1, comb: 0 });
  if (st.ground) {
    const c = st.on, i = st.cell, left = st.drop[c][i] - st.clock;
    const within = (j) => NEAR[i].includes(j) || RING2[i].includes(j);
    if (!(B.comb === c && B.goal >= 0 && B.goal !== i && untouched(st, c, B.goal) && within(B.goal)) || st.drone[c].to === B.goal) {
      // where next: an untouched cell within a jump — the fewest untouched cells round it first, a cell next
      // to this one rather than one further, never where the bee is about to land
      let best = -1, least = Infinity;
      const weigh = (j, far) => {
        if (!untouched(st, c, j)) return;
        const n = roundFree(st, c, j, i);
        let cost = (n === 0 ? 7 : n) + (far ? 3.2 : 0) + (st.drone[c].to === j ? 30 : 0);
        if (KIND[c][j] === 2) { let up = 0; for (let k = 0; k < N; k++) if (untouched(st, c - 1, k) && Math.hypot(CX[k] - CX[j], CZ[k] - CZ[j]) < 3.6) up++; cost += up >= 4 ? -5 : 9; }
        if (cost < least) { least = cost; best = j; }
      };
      for (const j of NEAR[i]) weigh(j, false);
      for (const j of RING2[i]) weigh(j, true);
      B.goal = best; B.comb = c;
    }
    if (B.goal < 0) {
      // nothing within a jump on this comb: at the last moment, a jump out towards the best of a comb below
      // (a jump, then the fall: over a second in the air — most of that comb is within reach)
      let below = -1;
      for (let d = c + 1; d < H.levels.length && below < 0; d++) below = landing(st, d, st.x, st.z, H.jump / H.g + Math.sqrt((2 * (H.levels[c] + (H.jump * H.jump) / (2 * H.g) - H.levels[d])) / H.g));
      const bx = below < 0 ? CX[i] : CX[below], bz = below < 0 ? CZ[i] : CZ[below], l = Math.hypot(bx - CX[i], bz - CZ[i]) || 1, k = Math.min(1, 0.55 / l);
      if (below < 0 || left > 0.06) return steer(st, CX[i] + (bx - CX[i]) * k, CZ[i] + (bz - CZ[i]) * k, 0.12, out);
      steer(st, bx, bz, 0.3, out);
      out.jump = true;
      return out;
    }
    const gx = CX[B.goal], gz = CZ[B.goal], far = !NEAR[i].includes(B.goal), l = Math.hypot(gx - CX[i], gz - CZ[i]);
    if (left > (far ? 0.2 : 0.06)) return steer(st, CX[i] + ((gx - CX[i]) / l) * 0.45, CZ[i] + ((gz - CZ[i]) / l) * 0.45, 0.12, out); // (stay put, a little towards it)
    // a cell further away is run at, and jumped from the edge
    if (far && left > 0.03 && reachOf(st.x - CX[i], st.z - CZ[i]) < APOTHEM - 0.14) return steer(st, gx, gz, 0.05, out);
    steer(st, gx, gz, 0.3, out);
    out.jump = true;
    return out;
  }
  // ---- in the air: the comb that comes next under the feet, and where on it
  const top = st.vy > 0 ? st.y + (st.vy * st.vy) / (2 * H.g) : st.y;
  for (let c = 0; c < H.levels.length; c++) {
    if (top < H.levels[c] || (st.vy <= 0 && st.y < H.levels[c])) continue;
    const t = fallTime(st, H.levels[c]);
    if (!(B.comb === c && B.goal >= 0 && st.drop[c][B.goal] > st.clock + t + 0.02 && Math.hypot(CX[B.goal] - st.x, CZ[B.goal] - st.z) < airReach(t) + APOTHEM + 1.2)) { B.goal = landing(st, c, st.x, st.z, t); B.comb = c; }
    if (B.goal >= 0) return steer(st, CX[B.goal], CZ[B.goal], t - 0.04, out);
  }
  return out;
}

/** Who never touches the stick. */
export function idleInput(st, out = { x: 0, y: 0, jump: false }) { out.x = 0; out.y = 0; out.jump = false; return out; }
/** Who only hammers the jump. */
export function hammerInput(st, out = { x: 0, y: 0, jump: false }) { out.x = 0; out.y = 0; out.jump = st.ground; return out; }
/** Who runs round without looking, and jumps now and then. */
export function runnerInput(st, out = { x: 0, y: 0, jump: false }) { const a = st.clock * 0.9 + st.seed; out.x = Math.sin(a); out.y = Math.cos(a); out.jump = st.ground && Math.floor(st.clock * 2) % 2 === 0; return out; }

/** Plays a run with `play` (the bot, unless another is given): { time (ms), mine, jumps, throws, falls, over, state }. */
export function botRun(seed = 1, limit = 600, play = botInput) {
  const st = startRun(seed), input = { x: 0, y: 0, jump: false };
  for (let t = 0; t < limit && !st.over; t += HIVE.step) { play(st, input); stepRun(st, HIVE.step, input, null); }
  return { time: st.time, mine: st.mine, jumps: st.jumps, throws: st.throws, falls: st.falls, over: st.over, state: st };
}
