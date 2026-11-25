// Round the Bend: its rules. No renderer here: the game, its checks and the cars that drive by themselves all read
// this.
//
// A table stands in the meadow by the acid pond, and on it a circuit of tarmac for radio-controlled cars: a long
// straight past the stand with a pad that kicks, a fast sweep with sand on its outside, a flick right and left, a
// ramp to fly off, a hairpin, a patch of oil, a second hairpin the other way and a third back to the straight —
// boards all round, so that nobody leaves the tarmac for long. One stands at the stand, the remote in hand, and
// looks down at the whole of it: the stick says where the car should go ON THE PICTURE — up is away from the
// stand —, the car turns its nose that way and pulls; let go and it brakes. The nose turns faster than the tyres
// can follow: thrown into a bend the car slides, and what slides is lost. The jump is a short boost, which comes
// back by itself.
//
// A race is three laps from a standing start, against the clock and against three cars that drive by themselves;
// one starts last. Sixteen gates across the track are passed in their order, or the lap does not count. The score
// is the time of the three laps (ms), counted from the green light.
//
// Places: metres from the middle of the table, `x` to the east and `z` to the south. Along the lap: samples of
// the centre line (TRACK.ds apart, counted from the line), and `l`, metres to the left of it. Headings as in the
// valley: 0 looks south. Time advances in steps of 1/120 s whatever the frame rate.

export const CARS = {
  name: 'Round the Bend',
  at: { x: -243.5, z: -55.8 }, // the middle of the table, in the meadow
  half: { x: 13.5, z: 7.8 }, // half its width, half its depth
  rise: 0.6, // its top stands so far over the highest ground under it: the grass of the meadow is tall
  gate: { x: -243.5, z: -45.9, yaw: Math.PI }, // where one asks to play: on the grass before the stand, looking at the table (a heading of the valley: 0 looks south)
  stand: { z: -47.25, w: 2.8, d: 1.5, up: 0.5 }, // the stand against the table, where one's robot is while one drives: its middle, its size, its height over the grass
  view: Math.PI, // "up" on the stick and on the picture: north, away from the stand
  step: 1 / 120,
  laps: 3, limit: 180, // a race; the second after which it is called off
  gates: 16,
  road: 1.15, wall: 1.45, body: 0.2, // half the tarmac; the boards, from the centre line; a car, as the boards and the other cars feel it
  top: 7.5, accel: 9.5, brake: 7.5, coast: 3.2, // m/s flat out; m/s² from rest; lost when the stick is let go; lost over the top speed with the stick full
  grip: 13, slide: 0.3, over: 1.8, turn: 5.5, // m/s² the tyres hold across — and the share of it lost once the car slides; how much faster the nose turns than they can follow; rad/s at most
  boost: { time: 0.9, top: 10.5, accel: 17, back: 4 }, // the jump: so long, so fast; the seconds before it is there again
  pad: { kick: 3.2, top: 11 }, cap: 11.5, // the pad on the straight: m/s more, up to so much; nothing ever goes faster than the cap
  verge: { top: 0.6, grip: 0.7, drag: 5 }, sand: { top: 0.45, grip: 0.6, drag: 9 }, // off the tarmac, in the sand: the share of the speed and of the grip left, m/s² lost
  oil: { time: 0.7, grip: 1.2, spin: 10 }, // on oil: so long without the tyres, the nose going round (rad/s)
  ramp: { length: 1.4, high: 0.3 }, g: 9.8,
  bounce: 0.45, rub: 0.25, // off a board: the share of the speed given back; what rubbing along it costs
};

const C = CARS, STEP = C.step, TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hash = (n, k = 0) => { const s = Math.sin(n * 127.1 + k * 311.7 + 74.7) * 43758.5453; return s - Math.floor(s); };
const wrap = (a) => { a %= TAU; return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a; };

// ---- the centre line: a polygon whose corners are rounded — [x, z, radius] —, gone round with the stand on
// one's right: east along the straight first. Two corners a diameter apart make a hairpin.
const SHAPE = [
  [11.6, 5.9, 5.1], [11.6, -4.3, 5.1], // the sweep
  [4.2, -4.3, 3], [1.4, -5.9, 3], // the flick
  [-11.6, -5.9, 2], [-11.6, -1.9, 2], // the first hairpin, to the left
  [1, -1.9, 1.9], [1, 1.9, 1.9], // the second, to the right
  [-11.6, 1.9, 2], [-11.6, 5.9, 2], // the third, back to the straight
];
const LINE = [-5, 5.9]; // the line across the straight: where the lap is counted from

/** The pieces of the lap, from the line: { len, x, z (where it begins), dx, dz (its heading there), curve (1/m: positive turns left, 0 a straight) }. */
function lay() {
  const n = SHAPE.length, pieces = [];
  const corners = SHAPE.map(([x, z, r], i) => {
    const p = SHAPE[(i + n - 1) % n], q = SHAPE[(i + 1) % n];
    let ax = x - p[0], az = z - p[1], bx = q[0] - x, bz = q[1] - z;
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    ax /= la; az /= la; bx /= lb; bz /= lb;
    const turn = Math.acos(clamp(ax * bx + az * bz, -1, 1));
    return { x, z, r, ax, az, bx, bz, turn, t: r * Math.tan(turn / 2), side: ax * bz - az * bx < 0 ? 1 : -1 };
  });
  const line = (x0, z0, x1, z1) => { const len = Math.hypot(x1 - x0, z1 - z0); if (len > 1e-9) pieces.push({ len, x: x0, z: z0, dx: (x1 - x0) / len, dz: (z1 - z0) / len, curve: 0 }); };
  let x = LINE[0], z = LINE[1];
  for (const c of corners) {
    const ax = c.x - c.ax * c.t, az = c.z - c.az * c.t;
    line(x, z, ax, az);
    pieces.push({ len: c.r * c.turn, x: ax, z: az, dx: c.ax, dz: c.az, curve: c.side / c.r });
    x = c.x + c.bx * c.t; z = c.z + c.bz * c.t;
  }
  line(x, z, LINE[0], LINE[1]);
  return pieces;
}
const PIECES = lay(), LENGTH = PIECES.reduce((a, p) => a + p.len, 0);
const M = Math.round(LENGTH / 0.2 / 4) * 4, DS = LENGTH / M;
const PX = new Float64Array(M), PZ = new Float64Array(M), TX = new Float64Array(M), TZ = new Float64Array(M), NX = new Float64Array(M), NZ = new Float64Array(M), CURVE = new Float64Array(M);
{
  let i = 0, from = 0;
  for (let k = 0; k < M; k++) {
    const s = k * DS;
    while (i + 1 < PIECES.length && s >= from + PIECES[i].len) { from += PIECES[i].len; i++; }
    const p = PIECES[i], a = s - from;
    if (!p.curve) { PX[k] = p.x + p.dx * a; PZ[k] = p.z + p.dz * a; TX[k] = p.dx; TZ[k] = p.dz; } else {
      const side = Math.sign(p.curve), r = 1 / Math.abs(p.curve), f = a / r, cs = Math.cos(f), sn = Math.sin(f);
      PX[k] = p.x + side * r * p.dz + r * (-side * p.dz * cs + p.dx * sn); PZ[k] = p.z - side * r * p.dx + r * (side * p.dx * cs + p.dz * sn);
      TX[k] = side * p.dz * sn + p.dx * cs; TZ[k] = -side * p.dx * sn + p.dz * cs;
    }
    NX[k] = TZ[k]; NZ[k] = -TX[k]; CURVE[k] = p.curve; // (N: to the left of the way one goes)
  }
}
/** The lap: `m` samples of its centre line `ds` apart — where each is (x, z), the way one goes there (tx, tz), what is to its left (nx, nz), how it bends (curve, 1/m: positive to the left). */
export const TRACK = { m: M, ds: DS, length: LENGTH, x: PX, z: PZ, tx: TX, tz: TZ, nx: NX, nz: NZ, curve: CURVE };

/** The sample nearest to (x, z), looked for all round the lap. */
export function nearest(x, z) { let best = 0, least = Infinity; for (let k = 0; k < M; k++) { const d = (x - PX[k]) ** 2 + (z - PZ[k]) ** 2; if (d < least) { least = d; best = k; } } return best; }
/**
 * Where (x, z) is along the lap, looked for from the sample `k` it was at: out.k (the nearest sample), out.s (the
 * same, with its fraction), out.l (metres to the left of the centre line).
 */
export function locate(x, z, k, out) {
  let d = (x - PX[k]) ** 2 + (z - PZ[k]) ** 2;
  for (let n = 0; n < M; n++) { const j = k + 1 === M ? 0 : k + 1, e = (x - PX[j]) ** 2 + (z - PZ[j]) ** 2; if (e < d) { k = j; d = e; } else break; }
  for (let n = 0; n < M; n++) { const j = k === 0 ? M - 1 : k - 1, e = (x - PX[j]) ** 2 + (z - PZ[j]) ** 2; if (e < d) { k = j; d = e; } else break; }
  const ox = x - PX[k], oz = z - PZ[k];
  out.k = k; out.s = k + (ox * TX[k] + oz * TZ[k]) / DS; out.l = ox * NX[k] + oz * NZ[k];
  return out;
}
const _at = { k: 0, s: 0, l: 0 };

// ---- what lies on the tarmac: each a stretch of the lap — from the sample k0, n samples long — between two
// distances to the left of the centre line
const stretch = (x, z, len, l0, l1) => ({ k0: nearest(x, z), n: Math.round(len / DS), l0, l1 });
/** The pad on the straight, on the side one takes the sweep from: it kicks whoever drives over it. */
export const PAD = stretch(-1.5, 5.9, 1.2, -1.05, -0.15);
/** The sand, on the outside of the sweep. */
export const SAND = stretch(6.5 + 5.1 * Math.sin(0.61), 0.8 + 5.1 * Math.cos(0.61), 6.7, -C.road, -0.45);
/** The ramp, across the straight of the far side: it rises the way one goes, and ends in the air. */
export const RAMP = stretch(-1.5, -5.9, C.ramp.length, -1.1, 1.1);
/** The oil, before the second hairpin, on the side one would cut it from. */
export const OIL = stretch(-4.4, -1.9, 1.1, -0.95, -0.15);
/** Is the place (s: samples along the lap, l) on this stretch? */
export const inZone = (zone, s, l) => { let d = s - zone.k0; d -= Math.floor(d / M) * M; return d < zone.n && l >= zone.l0 && l <= zone.l1; };
/** How high the ramp stands at (s, l): 0 anywhere else. */
export function rampAt(s, l) { let d = s - RAMP.k0; d -= Math.floor(d / M) * M; return d < RAMP.n && l >= RAMP.l0 && l <= RAMP.l1 ? (d / RAMP.n) * C.ramp.high : 0; }
/** How long a car that leaves the lip of the ramp at `v` m/s is in the air (s). */
export const flight = (v) => { const up = (C.ramp.high / C.ramp.length) * v; return (up + Math.sqrt(up * up + 2 * C.g * C.ramp.high)) / C.g; };

// ---- the gates: lines across the track, from board to board, passed in their order; the first is the line
const NG = C.gates;
/** The sample each gate stands at. */
export const GATE = Array.from({ length: NG }, (_, j) => Math.round((j * M) / NG));
/** The two ends of gate `j`, on the boards. */
export const gateEnds = (j) => { const k = GATE[j]; return [PX[k] + NX[k] * C.wall, PZ[k] + NZ[k] * C.wall, PX[k] - NX[k] * C.wall, PZ[k] - NZ[k] * C.wall]; };
const segPoint = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
/**
 * What nobody goes under: from a gate to the next one, at least the gap between the two lines (they never
 * cross); so much for a lap, three times that for a race, and nothing goes faster than the cap.
 */
export const SHORTEST = GATE.reduce((sum, _, j) => { const a = gateEnds(j), b = gateEnds((j + 1) % NG); return sum + Math.min(segPoint(a[0], a[1], b[0], b[1], b[2], b[3]), segPoint(a[2], a[3], b[0], b[1], b[2], b[3]), segPoint(b[0], b[1], a[0], a[1], a[2], a[3]), segPoint(b[2], b[3], a[0], a[1], a[2], a[3])); }, 0);
/**
 * The board of scores of the game: the time of the three laps (ms). The least is what the shortest way through the
 * gates would take at the cap; the most, the second after which a race is called off.
 */
export const BOARD = { order: 'asc', min: Math.floor((C.laps * SHORTEST) / C.cap) * 1000, max: C.limit * 1000 };

// ---- the line a car that drives by itself follows: the one that bends least between the edges of the tarmac
// (clear of the sand and of the oil), and how fast each place of it can be taken
const ROOM = C.road - 0.33, LO = new Float64Array(M).fill(-ROOM), HI = new Float64Array(M).fill(ROOM);
for (const zone of [SAND, OIL]) for (let n = -3; n < zone.n + 3; n++) { const k = (((zone.k0 + n) % M) + M) % M; if (zone.l1 < 0.3) LO[k] = Math.max(LO[k], zone.l1 + 0.3); else HI[k] = Math.min(HI[k], zone.l0 - 0.3); }
const OFF = new Float64Array(M), SPEED = new Float64Array(M), FREE = new Uint8Array(M);
{
  // (found on every fourth sample: each in its turn is put where the line bends least between its four
  // neighbours — the square of its bend, along its own length: where its places lie closer, on the inside of a
  // bend, a bend weighs more — again and again; then it is drawn through all of them)
  const W = 4, n = M / W, o = new Float64Array(n), w = new Float64Array(n).fill(1), X = (i) => PX[i * W] + NX[i * W] * o[i], Z = (i) => PZ[i * W] + NZ[i * W] * o[i];
  for (let it = 0; it < 1500; it++) {
    if (it % 8 === 0) for (let i = 0; i < n; i++) { const a = (i + n - 1) % n, b = (i + 1) % n; w[i] = (2 * W * DS / (Math.hypot(X(i) - X(a), Z(i) - Z(a)) + Math.hypot(X(b) - X(i), Z(b) - Z(i)))) ** 3; }
    for (let i = 0; i < n; i++) {
      const a2 = (i + n - 2) % n, a1 = (i + n - 1) % n, b1 = (i + 1) % n, b2 = (i + 2) % n, k = i * W, sum = w[a1] + 4 * w[i] + w[b1];
      const gx = (w[a1] * (2 * X(a1) - X(a2)) + 2 * w[i] * (X(a1) + X(b1)) + w[b1] * (2 * X(b1) - X(b2))) / sum, gz = (w[a1] * (2 * Z(a1) - Z(a2)) + 2 * w[i] * (Z(a1) + Z(b1)) + w[b1] * (2 * Z(b1) - Z(b2))) / sum;
      o[i] += (clamp((gx - PX[k]) * NX[k] + (gz - PZ[k]) * NZ[k], LO[k], HI[k]) - o[i]) * 0.9;
    }
  }
  for (let k = 0; k < M; k++) {
    const i = Math.floor(k / W), t = k / W - i, p0 = o[(i + n - 1) % n], p1 = o[i], p2 = o[(i + 1) % n], p3 = o[(i + 2) % n];
    OFF[k] = clamp(p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0))), LO[k], HI[k]);
  }
  // how it bends: the circle through three of its places
  const LX = (k) => PX[k] + NX[k] * OFF[k], LZ = (k) => PZ[k] + NZ[k] * OFF[k];
  for (let k = 0; k < M; k++) {
    const a = (k + M - 5) % M, b = (k + 5) % M, ux = LX(k) - LX(a), uz = LZ(k) - LZ(a), vx = LX(b) - LX(k), vz = LZ(b) - LZ(k);
    const bend = (2 * Math.abs(ux * vz - uz * vx)) / (Math.hypot(ux, uz) * Math.hypot(vx, vz) * Math.hypot(ux + vx, uz + vz));
    SPEED[k] = Math.min(C.boost.top, Math.sqrt((0.9 * C.grip) / Math.max(bend, 1e-6)));
  }
  // … and one brakes in time for what comes
  const slow = 0.8 * C.brake, back = () => { for (let i = 2 * M - 1; i >= 0; i--) { const k = i % M, j = (k + 1) % M; SPEED[k] = Math.min(SPEED[k], Math.sqrt(SPEED[j] ** 2 + 2 * slow * DS)); } };
  back();
  // (in the air nothing brakes: off the lip of the ramp no faster than what the place one comes down at allows)
  const lip = RAMP.k0 + RAMP.n;
  let off = 3; for (let v = C.boost.top; v > 3; v -= 0.1) { if (v <= SPEED[(lip + Math.ceil((v * flight(v)) / DS) + 2) % M]) { off = v; break; } }
  for (let k = RAMP.k0 - 2; k <= lip; k++) SPEED[(k + M) % M] = Math.min(SPEED[(k + M) % M], off);
  back();
  // where the boost is worth it — 2: flat out for a good while; 1: long enough to get past a car — and no ramp on the way
  const far = Math.round(8 / DS), near = Math.round(4.5 / DS), ramp = Math.round(13 / DS);
  for (let k = 0; k < M; k++) {
    const to = (((RAMP.k0 - k) % M) + M) % M;
    let n = 0; while (n < far && SPEED[(k + n) % M] >= C.top + (n < near ? 0.6 : 1.6)) n++;
    FREE[k] = to < ramp || to > M - RAMP.n ? 0 : n >= far ? 2 : n >= near ? 1 : 0;
  }
}
/** The line of the cars that drive by themselves: `off` (metres to the left of the centre line, sample by sample) and `speed` (m/s it can be taken at). */
export const RACING = { off: OFF, speed: SPEED, lo: LO, hi: HI };

// ---- who drives by itself: `pace` (the share of what its line allows), `top` (of the top speed), `wander` (how
// far it strays from its line, m), `boost` (does it use it), `delay` (how long it sleeps at the green light)
/** The player that plays by itself: the checks, and `session.auto`. */
export const ACE = { name: 'you', pace: 1, top: 1, wander: 0, boost: true, delay: 0 };
/** The three rivals, as they stand on the grid: the best in front. */
export const RIVALS = [
  { name: 'Blue', pace: 0.87, top: 0.95, wander: 0.1, boost: false, delay: 0.06 },
  { name: 'Yellow', pace: 0.81, top: 0.925, wander: 0.2, boost: false, delay: 0.2 },
  { name: 'White', pace: 0.75, top: 0.9, wander: 0.3, boost: false, delay: 0.32 },
];

/** Puts a car on the track: `s` metres along the lap from the line, `l` to the left of the centre line, going at `v` the way of the lap. */
export function putCar(c, s, l = 0, v = 0) {
  const f = (((s / DS) % M) + M) % M, k = Math.floor(f) % M, j = (k + 1) % M, t = f - Math.floor(f);
  c.x = PX[k] + (PX[j] - PX[k]) * t + NX[k] * l; c.z = PZ[k] + (PZ[j] - PZ[k]) * t + NZ[k] * l;
  c.yaw = Math.atan2(TX[k], TZ[k]); c.vx = TX[k] * v; c.vz = TZ[k] * v; c.y = 0; c.vy = 0; c.air = false; c.climb = 0;
  locate(c.x, c.z, k, _at); c.k = _at.k; c.s = _at.s; c.s0 = _at.s; c.l = _at.l;
  return c;
}

/**
 * A race on the grid: car 0 is one's own, last; the three rivals before it. `seed`: what the rivals stray by.
 * A car: where it is (x, z; y over the tarmac), how it goes (vx, vz, vy), where its nose points (yaw), along the
 * lap (k, s, l), `slip` (m/s it slides across), `air`, `boost` (s left of it) and `charge` (0 … 1: 1, it is there),
 * `oil` (s left without tyres), `gate` (the gates passed, in their order, since the start), `done`, `time` (ms)
 * and `rank`. The race: `clock` (s since the green light), `view` (the heading of "up" on the stick), `over`,
 * `time` (ms) and `place` once one's own car is home — or `out`, called off.
 */
export function startRace(seed = 1) {
  const cars = [];
  for (let i = 0; i < 4; i++) {
    const slot = i === 0 ? 3 : i - 1, skill = i === 0 ? ACE : RIVALS[i - 1];
    cars.push(putCar({ skill, top: i === 0 ? 1 : skill.top, phase: hash(seed, i) * TAU, slip: 0, drift: false, airT: 0, boost: 0, charge: 1, guard: 0, oil: 0, slick: 0, spin: 0, wrong: 0, gate: 0, done: false, time: 0, rank: 0, walls: 0 }, -(0.9 + 0.9 * slot), slot % 2 ? -0.5 : 0.5));
  }
  return { seed, view: C.view, cars, clock: 0, acc: 0, want: false, over: false, out: false, time: 0, place: 0, finished: 0 };
}
/** The laps a car has behind it, and the one it is on (1 …). */
export const lapsDone = (c) => (c.gate ? Math.floor((c.gate - 1) / NG) : 0);
export const lapOf = (c) => Math.min(C.laps, lapsDone(c) + 1);
/** How far a car has got: the gates passed, and its share of the way to the next. */
const progress = (c) => { if (c.done) return 1e6 - c.rank; let d = GATE[c.gate % NG] - c.s; d -= Math.floor(d / M) * M; return c.gate + clamp(1 - d / (M / NG), 0, 0.999); };
/** The place of car `i` in the race (1: in front). */
export function placeOf(st, i = 0) { const mine = progress(st.cars[i]); let n = 1; for (let j = 0; j < st.cars.length; j++) if (j !== i && progress(st.cars[j]) > mine) n++; return n; }

/**
 * Advances a race by `dt` seconds. `input`: one's stick — { x (-1 … 1, to the right of the picture), y (-1 … 1,
 * up the picture), jump (true on the frame it is asked) }. `events`: { type: 'gate' (car, gate, time) | 'lap'
 * (car, lap: the one that begins) | 'finish' (car, time, place) | 'wall' | 'bump' (car, with, speed) | 'boost' |
 * 'pad' | 'oil' | 'jump' | 'land' | 'drift' | 'wrong' (car) | 'out' }.
 */
export function stepRace(st, dt, input, events) {
  if (input?.jump) st.want = true;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= STEP && !st.out) { st.acc -= STEP; sub(st, input, events); }
  return st;
}

const _cmd = { dx: 0, dz: 1, m: 0, boost: false };
function sub(st, input, events) {
  const cars = st.cars, FX = Math.sin(st.view), FZ = Math.cos(st.view), RX = -FZ, RZ = FX;
  st.clock += STEP;
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    if (i === 0 && !c.done) {
      // one's own: the stick, read on the picture
      const ix = clamp(input?.x || 0, -1, 1), iy = clamp(input?.y || 0, -1, 1), il = Math.hypot(ix, iy);
      if (il < 0.14) { _cmd.m = 0; _cmd.dx = Math.sin(c.yaw); _cmd.dz = Math.cos(c.yaw); } else { _cmd.m = Math.min(1, il); _cmd.dx = (FX * iy + RX * ix) / il; _cmd.dz = (FZ * iy + RZ * ix) / il; }
      _cmd.boost = st.want;
    } else botDrive(st, i, _cmd);
    drive(c, i, _cmd, events);
  }
  st.want = false;
  // ---- car against car: they push each other apart and trade what they close at
  const min = 2 * C.body + 0.04;
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    let dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d >= min || Math.abs(a.y - b.y) > 0.22) continue;
    if (d < 1e-6) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
    const push = (min - d) / 2, close = (a.vx - b.vx) * dx + (a.vz - b.vz) * dz;
    a.x -= dx * push; a.z -= dz * push; b.x += dx * push; b.z += dz * push;
    if (close > 0) { const k = close * 0.75; a.vx -= dx * k; a.vz -= dz * k; b.vx += dx * k; b.vz += dz * k; if (close > 1) events?.push({ type: 'bump', car: i, with: j, speed: close }); }
    hold(a, i, null); hold(b, j, null);
  }
  for (let i = 0; i < cars.length; i++) gates(st, cars[i], i, events);
  if (!st.over && st.clock >= C.limit) { st.over = true; st.out = true; events?.push({ type: 'out' }); }
}

/** Keeps a car between the boards: it is put back, and bounces. */
function hold(c, i, events) {
  locate(c.x, c.z, c.k, _at);
  c.k = _at.k; c.s = _at.s; c.l = _at.l;
  const lim = C.wall - C.body;
  if (Math.abs(c.l) <= lim) return;
  const side = Math.sign(c.l), nx = NX[c.k] * side, nz = NZ[c.k] * side, far = Math.abs(c.l) - lim, out = c.vx * nx + c.vz * nz;
  c.x -= nx * far; c.z -= nz * far; c.l = side * lim;
  if (out <= 0) return;
  const rub = 1 - C.rub * Math.min(1, out / 3), ax = c.vx - nx * out, az = c.vz - nz * out;
  c.vx = ax * rub - nx * out * C.bounce; c.vz = az * rub - nz * out * C.bounce;
  if (out > 1.2) { c.walls++; events?.push({ type: 'wall', car: i, speed: out }); }
}

/** A car for one step: its nose turns the way `cmd` says, it pulls or brakes, its tyres hold what they can. */
function drive(c, i, cmd, events) {
  const dt = STEP;
  c.s0 = c.s;
  if (c.boost > 0) c.boost -= dt; else if (c.charge < 1) c.charge = Math.min(1, c.charge + dt / C.boost.back);
  if (c.guard > 0) c.guard -= dt;
  if (c.slick > 0) c.slick -= dt;
  if (cmd.boost && c.charge >= 1 && !c.done) { c.boost = C.boost.time; c.charge = 0; events?.push({ type: 'boost', car: i }); }
  const speed = Math.hypot(c.vx, c.vz);
  if (c.air) { c.vy -= C.g * dt; c.y += c.vy * dt; c.airT += dt; c.slip = 0; } else {
    // what is under the wheels
    const surf = inZone(SAND, c.s, c.l) ? C.sand : Math.abs(c.l) > C.road ? C.verge : null;
    let grip = C.grip * (surf ? surf.grip : 1);
    // the nose: on oil it goes round by itself; else it turns the way one points, faster than the tyres follow
    if (c.oil > 0) { c.oil -= dt; c.yaw = wrap(c.yaw + c.spin * dt); grip = C.oil.grip; } else if (cmd.m > 0) {
      const d = wrap(Math.atan2(cmd.dx, cmd.dz) - c.yaw), rate = Math.min(C.turn, (C.over * C.grip) / Math.max(speed, 0.5));
      c.yaw = wrap(c.yaw + clamp(d * 14, -rate, rate) * dt);
    }
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    let along = c.vx * fx + c.vz * fz;
    const lx = c.vx - fx * along, lz = c.vz - fz * along, across = Math.hypot(lx, lz);
    // along the nose: towards the speed the stick asks for
    const share = surf ? surf.top : 1, top = C.top * c.top * share, lim = c.boost > 0 ? Math.max(top, C.boost.top * share) : top, want = cmd.m * lim;
    if (along < want) along += Math.min((c.boost > 0 ? C.boost.accel : C.accel) * Math.min(1.3, 1 - along / lim) * (c.oil > 0 ? 0.3 : 1) * dt, want - along);
    else { let drag = C.coast + (1 - cmd.m) * (C.brake - C.coast); if (surf && along > top) drag = Math.max(drag, surf.drag); along -= Math.min(drag * dt, along - want); }
    // across it: the tyres take away what they can hold, the rest slides
    const held = grip * (1 - C.slide * clamp((across - 1.2) / 1.3, 0, 1)) * dt, keep = across > held ? (across - held) / across : 0;
    c.vx = fx * along + lx * keep; c.vz = fz * along + lz * keep; c.slip = across * keep;
    if (!c.drift && c.slip > 2) { c.drift = true; events?.push({ type: 'drift', car: i }); } else if (c.drift && c.slip < 0.8) c.drift = false;
  }
  const now = Math.hypot(c.vx, c.vz);
  if (now > C.cap) { c.vx *= C.cap / now; c.vz *= C.cap / now; }
  c.x += c.vx * dt; c.z += c.vz * dt;
  hold(c, i, events);
  // ---- the ground under it: the ramp lifts it, and lets go of it at the lip
  const h = rampAt(c.s, c.l);
  if (c.air) { if (c.y <= h) { c.y = h; c.vy = 0; c.air = false; c.climb = 0; if (c.airT > 0.12) events?.push({ type: 'land', car: i }); } } else if (h < c.y - 0.02) {
    c.air = true; c.airT = 0; c.vy = c.climb;
    if (c.vy > 0.8) events?.push({ type: 'jump', car: i });
  } else { c.climb = clamp((h - c.y) / dt, 0, (C.ramp.high / C.ramp.length) * now); c.y = h; }
  if (c.air) return;
  // ---- the pad kicks; the oil takes the tyres away
  if (c.guard <= 0 && inZone(PAD, c.s, c.l)) {
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), v = Math.min(C.pad.top, Math.max(now, c.vx * fx + c.vz * fz + C.pad.kick));
    c.guard = 0.6;
    if (v > now) { c.vx = fx * v; c.vz = fz * v; events?.push({ type: 'pad', car: i }); }
  }
  if (c.oil <= 0 && c.slick <= 0 && now > 1.5 && inZone(OIL, c.s, c.l)) { c.oil = C.oil.time; c.slick = 2; c.spin = (c.l > (OIL.l0 + OIL.l1) / 2 ? 1 : -1) * C.oil.spin; events?.push({ type: 'oil', car: i }); }
  // (one's own car, the wrong way round the lap for a good second: it is told)
  if (i === 0 && !c.done) { if (c.vx * TX[c.k] + c.vz * TZ[c.k] < -1.5) { c.wrong += dt; if (c.wrong > 1) { c.wrong = -4; events?.push({ type: 'wrong', car: i }); } } else if (c.wrong > 0) c.wrong = 0; }
}

/** The gates: the one a car waits for counts when it is crossed the right way; the line, after all the others, is a lap. */
function gates(st, c, i, events) {
  if (c.done) return;
  let d = c.s - c.s0; d -= Math.round(d / M) * M; // samples gone forward in this step
  if (!(d > 0 && d < 4)) return;
  let g = GATE[c.gate % NG] - c.s0; g -= Math.floor(g / M) * M; // … and from where it was to the gate it waits for
  if (g === 0 || g > d) return;
  const t = st.clock - STEP + (g / d) * STEP, gate = c.gate % NG;
  c.gate++;
  events?.push({ type: 'gate', car: i, gate, time: t });
  if (gate) return;
  const laps = (c.gate - 1) / NG;
  if (laps < C.laps) { events?.push({ type: 'lap', car: i, lap: laps + 1, time: t }); return; }
  c.done = true; c.time = Math.round(t * 1000); c.rank = ++st.finished;
  events?.push({ type: 'finish', car: i, time: c.time, place: c.rank });
  if (i === 0 && !st.over) { st.over = true; st.time = c.time; st.place = c.rank; }
}

// ---------------------------------------------------------------------------------------------------------
// A car that drives by itself — the proof that the lap can be driven, and the three rivals. It aims at a place
// of its line a little way ahead, goes as fast as that line allows where it is — braking in time for what comes —,
// passes a car in its way on the side where there is room, and boosts where a straight is long enough.

/** What car `i` does by itself: cmd.dx, cmd.dz (where its nose should point, in the world), cmd.m (0 … 1: how hard it pulls; 0 brakes), cmd.boost. */
function botDrive(st, i, cmd, skill) {
  const c = st.cars[i], S = skill || c.skill, speed = Math.hypot(c.vx, c.vz);
  cmd.m = 0; cmd.boost = false; cmd.dx = Math.sin(c.yaw); cmd.dz = Math.cos(c.yaw);
  if (st.clock < S.delay) return cmd;
  const pace = c.done ? 0.5 : S.pace, j = (c.k + Math.round((0.9 + speed * 0.2) / DS)) % M;
  let off = OFF[j] + (S.wander ? S.wander * Math.sin(c.k * 0.045 + st.clock * 0.4 + c.phase) : 0);
  let may = SPEED[(c.k + 1) % M] * pace, pass = false;
  // (a car in its way where the road is straight, or beside it anywhere: it keeps to the side it is on — from
  // right behind, the side with more room — and does not drive into its back)
  for (let n = 0; n < st.cars.length; n++) {
    const o = st.cars[n];
    if (n === i || Math.abs(o.y - c.y) > 0.2) continue;
    let ahead = (o.s - c.s) * DS; ahead -= Math.round(ahead / LENGTH) * LENGTH;
    const gap = o.l - c.l, theirs = Math.hypot(o.vx, o.vz);
    if (ahead < -0.45 || ahead > 3 || Math.abs(gap) > 0.75 || (ahead > 0.3 && theirs > speed + 0.5)) continue;
    if (ahead > 0.6 && !FREE[c.k]) { if (ahead < 1.1 && Math.abs(gap) < 0.45) may = Math.min(may, theirs); continue; } // (in a bend it waits behind)
    let side = Math.abs(gap) > 0.12 ? -Math.sign(gap) : o.l > 0 ? -1 : 1;
    if ((side > 0 ? HI[j] - o.l : o.l - LO[j]) < 0.55) side = -side;
    off = o.l + side * 0.8;
    if (ahead > 0 && ahead < 0.6 && Math.abs(gap) < 0.38) may = Math.min(may, theirs);
    if (ahead > 0.3) pass = true;
  }
  off = clamp(off, LO[j], HI[j]);
  const tx = PX[j] + NX[j] * off - c.x, tz = PZ[j] + NZ[j] * off - c.z, tl = Math.hypot(tx, tz) || 1;
  cmd.dx = tx / tl; cmd.dz = tz / tl;
  cmd.m = speed > may + 0.3 ? 0 : clamp(may / (C.top * c.top), 0.2, 1);
  cmd.boost = !!S.boost && !c.done && c.charge >= 1 && !c.air && speed > 3 && FREE[c.k] > (pass ? 0 : 1);
  return cmd;
}
/** The stick that says `cmd`, as the picture is turned. */
function stickOf(st, cmd, out) {
  const FX = Math.sin(st.view), FZ = Math.cos(st.view);
  out.x = (cmd.dx * -FZ + cmd.dz * FX) * cmd.m; out.y = (cmd.dx * FX + cmd.dz * FZ) * cmd.m; out.jump = cmd.boost;
  return out;
}
const _bot = { dx: 0, dz: 1, m: 0, boost: false };
/** One's own car, driven by itself: the stick and the jump. */
export function botInput(st, out = { x: 0, y: 0, jump: false }) { return stickOf(st, botDrive(st, 0, _bot, ACE), out); }
/** Who never touches the stick. */
export function idleInput(st, out = { x: 0, y: 0, jump: false }) { out.x = 0; out.y = 0; out.jump = false; return out; }
/** A driver with a keyboard: what the car that drives by itself would do, but eight ways only, the stick full or let go. */
export function keysInput(st, out = { x: 0, y: 0, jump: false }) {
  botInput(st, out);
  const m = Math.hypot(out.x, out.y), a = Math.round(Math.atan2(out.x, out.y) / (Math.PI / 4)) * (Math.PI / 4), go = m > 0.5 ? 1 : 0;
  out.x = Math.round(Math.sin(a)) * go; out.y = Math.round(Math.cos(a)) * go;
  return out;
}
/** A clumsy driver: the stick always full, at the middle of the road a little way ahead and a little beside it; never lifts, hammers the boost. */
export function clumsyInput(st, out = { x: 0, y: 0, jump: false }) {
  const c = st.cars[0], j = (c.k + 9) % M, off = 0.55 * Math.sin(st.clock * 1.3 + st.seed);
  const tx = PX[j] + NX[j] * off - c.x, tz = PZ[j] + NZ[j] * off - c.z, tl = Math.hypot(tx, tz) || 1;
  _bot.dx = tx / tl; _bot.dz = tz / tl; _bot.m = 1; _bot.boost = true;
  return stickOf(st, _bot, out);
}

/**
 * Runs a race with `play` at one's stick (the car that drives by itself, unless another is given), until every
 * car is home or `secs` have passed: { time (ms; 0: not home), place, over, state, laps (when each of one's laps
 * began, s), order (the gates one passed), events: how many of each }.
 */
export function raceRun(seed = 1, play = botInput, secs = C.limit + 5) {
  const st = startRace(seed), input = { x: 0, y: 0, jump: false }, events = [], count = {}, laps = [], order = [];
  while (st.clock < secs && !st.out && !(st.over && st.cars.every((c) => c.done))) {
    play(st, input); stepRace(st, STEP, input, events);
    for (const e of events) { if (e.car === 0 || e.type === 'out') count[e.type] = (count[e.type] || 0) + 1; if (e.car === 0 && e.type === 'gate') { order.push(e.gate); if (!e.gate) laps.push(e.time); } }
    events.length = 0;
  }
  return { time: st.time, place: st.place, over: st.over, state: st, laps, order, events: count };
}
