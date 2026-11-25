// Round the Bend: its rules. No renderer here: the game, its checks and the cars that drive by themselves all read
// this.
//
// A table stands in the meadow by the acid pond, and on it a circuit of tarmac for radio-controlled cars: a long
// straight past the stand with a pad that kicks, a fast sweep with sand on its outside, a flick right and left, a
// ramp to fly off, a hairpin, a patch of oil, a second hairpin the other way and a third back to the straight —
// boards all round, so that nobody leaves the tarmac for long. One stands at the stand, the remote in hand, and
// looks down at the whole of it. The remote is that of a real radio-controlled car, and it speaks to the CAR, not
// to the picture: up is the throttle — the car goes the way its nose points —, down brakes and then backs it up,
// left and right turn it to its own left and right. Let go of everything and it rolls to a stop.
//
// The nose turns faster than the tyres can follow: thrown into a bend at speed the tail steps out and the car
// slides — a drift —, held with the throttle and caught with the wheel turned the other way. While it slides, it
// builds sparks under its tyres (yellow, then orange, then blue); once it straightens up they are let go as a short
// burst of speed, the stronger the longer the slide. The jump is a short boost, which comes back by itself.
//
// Fire: a hoop of fire stands over the lip of the ramp (it is only seen: one flies through it), and a few jets
// beside the track burst on the clock of the race — the same for every car — once the first lap is under way;
// driven through while it burns, a car loses much of its speed and is blackened for a moment.
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
  view: Math.PI, // "up" on the picture: north, away from the stand (the camera turns it for a phone held upright)
  step: 1 / 120,
  laps: 3, limit: 180, // a race; the second after which it is called off
  gates: 16,
  road: 1.15, wall: 1.45, body: 0.2, // half the tarmac; the boards, from the centre line; a car, as the boards and the other cars feel it
  top: 7.5, accel: 9.5, brake: 7.5, coast: 3.2, reverse: 3, // m/s flat out; m/s² from rest; m/s² of the brake; lost when the stick is let go (and over the top speed); m/s backwards at most
  grip: 13, slide: 0.55, over: 1.8, turn: 5.5, wheel: 0.5, lag: 12, // m/s² the tyres hold across — and the share of it lost once the car slides; how much faster the nose can turn than they follow; rad/s at most; the tightest circle at a crawl (m); how quickly the nose answers the wheel (1/s)
  drift: { on: 2, off: 0.8, yaw: 1.15, heat: [0.3, 0.75, 1.3], time: [0.35, 0.6, 0.9], top: [9, 10, 11], accel: 16 }, // a slide: begins over so many m/s across, ends under; the tail swings so much more; seconds of slide for yellow, orange and blue sparks; the burst each lets go: so long, up to so fast, so hard
  boost: { time: 0.9, top: 10.5, accel: 17, back: 4 }, // the jump: so long, so fast; the seconds before it is there again
  pad: { kick: 3.2, top: 11 }, cap: 11.5, // the pad on the straight: m/s more, up to so much; nothing ever goes faster than the cap
  verge: { top: 0.6, grip: 0.7, drag: 5 }, sand: { top: 0.45, grip: 0.6, drag: 9 }, // off the tarmac, in the sand: the share of the speed and of the grip left, m/s² lost
  oil: { time: 0.7, grip: 1.2, spin: 10 }, // on oil: so long without the tyres, the nose going round (rad/s)
  ramp: { length: 1.4, high: 0.3 }, g: 9.8,
  bounce: 0.45, rub: 0.25, // off a board: the share of the speed given back; what rubbing along it costs
  fire: { every: 3.2, burst: 0.8, warn: 0.7, from: 15, keep: 0.55, time: 1.2 }, // the jets: a burst every so many seconds, so long, glowing so long before; quiet before the second `from`; what a burst leaves of the speed; how long the car stays black
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
export const RAMP = stretch(-2.5, -5.9, C.ramp.length, -1.1, 1.1);
/** The oil, before the second hairpin, on the side one would cut it from. */
export const OIL = stretch(-4.4, -1.9, 1.1, -0.95, -0.15);
/**
 * The jets of fire, standing on the boards of a straight: each burns across its own side of the tarmac, from the
 * board to a little short of the middle — the other side stays clear. `side`: 1 on the left of the way one goes.
 */
const jet = (x, z, side) => ({ ...stretch(x, z, 0.9, side > 0 ? 0.25 : -C.wall, side > 0 ? C.wall : -0.25), side });
export const JETS = [jet(2.6, 5.9, 1), jet(0.2, -5.9, 1), jet(-6, 1.9, -1)];
/**
 * Where jet `j` is in its round (s since its last burst began), on the clock of the race — the same for every car;
 * -1 while the jets are still quiet. It burns for the first C.fire.burst of a round, and glows C.fire.warn before.
 */
export function jetTime(st, j) {
  const F = C.fire;
  if (st.clock < F.from) return -1;
  const t = st.clock - F.from + (j * F.every) / JETS.length + hash(st.seed, 20 + j) * 0.8;
  return t - Math.floor(t / F.every) * F.every;
}
export const jetOn = (st, j) => { const t = jetTime(st, j); return t >= 0 && t < C.fire.burst; };
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
// (clear of the sand, of the oil and of the jets), and how fast each place of it can be taken
const ROOM = C.road - 0.33, LO = new Float64Array(M).fill(-ROOM), HI = new Float64Array(M).fill(ROOM);
for (const zone of [SAND, OIL, ...JETS]) for (let n = -3; n < zone.n + 3; n++) { const k = (((zone.k0 + n) % M) + M) % M; if (zone.l1 < 0.3) LO[k] = Math.max(LO[k], zone.l1 + 0.3); else HI[k] = Math.min(HI[k], zone.l0 - 0.3); }
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
  { name: 'Blue', pace: 0.93, top: 0.97, wander: 0.1, boost: false, delay: 0.06 },
  { name: 'Yellow', pace: 0.86, top: 0.94, wander: 0.2, boost: false, delay: 0.2 },
  { name: 'Pink', pace: 0.8, top: 0.91, wander: 0.3, boost: false, delay: 0.32 },
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
 * A race on the grid: car 0 is one's own, last; the three rivals before it. `seed`: what the rivals stray by, and
 * when the jets burn. A car: where it is (x, z; y over the tarmac), how it goes (vx, vz, vy), where its nose points
 * (yaw) and how fast it turns (wr, rad/s), along the lap (k, s, l), `slip` (m/s it slides across), `drift` (it
 * slides), `heat` (s of the slide so far) and `level` (its sparks: 0 none, 1 yellow, 2 orange, 3 blue), `turbo` (s
 * left of the burst a slide let go), `air`, `boost` (s left of it) and `charge` (0 … 1: 1, it is there), `oil` (s
 * left without tyres), `scorch` (s left black from a jet), `gate` (the gates passed, in their order, since the
 * start), `done`, `time` (ms) and `rank`. The race: `clock` (s since the green light), `view` (the way "up" on the
 * picture looks: the camera's), `over`, `time` (ms) and `place` once one's own car is home — or `out`, called off.
 */
export function startRace(seed = 1) {
  const cars = [];
  for (let i = 0; i < 4; i++) {
    const slot = i === 0 ? 3 : i - 1, skill = i === 0 ? ACE : RIVALS[i - 1];
    cars.push(putCar({ skill, top: i === 0 ? 1 : skill.top, phase: hash(seed, i) * TAU, slip: 0, drift: false, heat: 0, level: 0, turbo: 0, turboTop: 0, wr: 0, airT: 0, boost: 0, charge: 1, scorch: 0, stuck: 0, backing: 0, guard: 0, oil: 0, slick: 0, spin: 0, wrong: 0, gate: 0, done: false, time: 0, rank: 0, walls: 0 }, -(0.9 + 0.9 * slot), slot % 2 ? -0.5 : 0.5));
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
 * Advances a race by `dt` seconds. `input`: one's remote — { x (-1 … 1: the wheel, to the car's right), y (-1 … 1:
 * up the throttle, down the brake and then backwards), jump (true on the frame it is asked) }. `events`: { type:
 * 'gate' (car, gate, time) | 'lap' (car, lap: the one that begins) | 'finish' (car, time, place) | 'wall' | 'bump'
 * (car, with, speed) | 'spark' (car, level: the sparks of a slide grow) | 'turbo' (car, level: let go) | 'fire' (car,
 * jet) | 'boost' | 'pad' | 'oil' | 'jump' | 'land' | 'drift' | 'wrong' (car) | 'out' }.
 */
export function stepRace(st, dt, input, events) {
  if (input?.jump) st.want = true;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= STEP && !st.out) { st.acc -= STEP; sub(st, input, events); }
  return st;
}

const _cmd = { steer: 0, throttle: 0, boost: false };
const dead = (v) => { v = clamp(v || 0, -1, 1); return Math.abs(v) < 0.12 ? 0 : v; };
function sub(st, input, events) {
  const cars = st.cars;
  st.clock += STEP;
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    if (i === 0 && !c.done) { _cmd.steer = dead(input?.x); _cmd.throttle = dead(input?.y); _cmd.boost = st.want; } // one's own: the remote, as the car feels it
    else botDrive(st, i, _cmd);
    drive(st, c, i, _cmd, events);
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

/** How fast the nose can turn (rad/s) at `a` m/s along it: tight at a crawl, never more than the tyres allow by far. */
const rateAt = (a, drift) => Math.min(C.turn, a / C.wheel, (C.over * C.grip) / Math.max(a, 0.5)) * (drift ? C.drift.yaw : 1);

/**
 * A car for one step: the wheel turns its nose (backwards the other way round), the throttle pulls it along its
 * nose, the brake stops it and then backs it up; its tyres hold what they can across, the rest slides.
 */
function drive(st, c, i, cmd, events) {
  const dt = STEP, D = C.drift;
  c.s0 = c.s;
  if (c.boost > 0) c.boost -= dt; else if (c.charge < 1) c.charge = Math.min(1, c.charge + dt / C.boost.back);
  if (c.turbo > 0) c.turbo -= dt;
  if (c.guard > 0) c.guard -= dt;
  if (c.slick > 0) c.slick -= dt;
  if (c.scorch > 0) c.scorch -= dt;
  if (cmd.boost && c.charge >= 1 && !c.done) { c.boost = C.boost.time; c.charge = 0; events?.push({ type: 'boost', car: i }); }
  const speed = Math.hypot(c.vx, c.vz), t = cmd.throttle;
  if (c.air) { c.vy -= C.g * dt; c.y += c.vy * dt; c.airT += dt; c.slip = 0; } else {
    // what is under the wheels
    const free = c.oil > 0, v0x = c.vx, v0z = c.vz;
    const surf = inZone(SAND, c.s, c.l) ? C.sand : Math.abs(c.l) > C.road ? C.verge : null;
    let grip = C.grip * (surf ? surf.grip : 1);
    let fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), along = c.vx * fx + c.vz * fz;
    // the nose: on oil it goes round by itself; else the wheel turns it — to the car's own left or right, the other
    // way round when it backs up — and the tyres pushing on make it turn a little even against a board
    if (c.oil > 0) { c.oil -= dt; c.wr = c.spin; c.yaw = wrap(c.yaw + c.spin * dt); grip = C.oil.grip; c.drift = false; c.heat = 0; c.level = 0; } else {
      const back = along < -0.05 || (t < 0 && along < 0.3) ? -1 : 1, want = -cmd.steer * back * rateAt(Math.max(Math.abs(along), 0.6 * Math.abs(t)), c.drift);
      c.wr += (want - c.wr) * Math.min(1, C.lag * dt);
      c.yaw = wrap(c.yaw + c.wr * dt);
    }
    fx = Math.sin(c.yaw); fz = Math.cos(c.yaw); along = c.vx * fx + c.vz * fz;
    const lx = c.vx - fx * along, lz = c.vz - fz * along, across = Math.hypot(lx, lz);
    // along the nose: the throttle pulls towards the speed it asks for; the brake stops, then backs up; let go, it rolls to a stop
    const share = surf ? surf.top : 1, top = C.top * c.top * share, boost = c.boost > 0, turbo = c.turbo > 0;
    const lim = Math.max(top, boost ? C.boost.top * share : 0, turbo ? c.turboTop * share : 0), push = boost ? C.boost.accel : turbo ? D.accel : C.accel * Math.min(1.3, 1 - along / lim);
    if (t > 0 && along < t * lim) along += Math.min(push * (c.oil > 0 ? 0.3 : 1) * dt, t * lim - along);
    else if (t < 0 && along > 0.3) along -= Math.min(C.brake * -t * dt, along);
    else if (t < 0 && along > t * C.reverse) along -= Math.min(C.accel * 0.6 * dt, along - t * C.reverse);
    else { let drag = C.coast; if (surf && along > top) drag = Math.max(drag, surf.drag); const goal = t > 0 ? t * lim : t < 0 ? t * C.reverse : 0; along += clamp(goal - along, -drag * dt, drag * dt); }
    // across it: the tyres take away what they can hold, the rest slides — the more so with the throttle open and
    // the wheel turned into the bend; straightened up, or turned the other way, the tyres bite again
    const into = clamp(cmd.steer * Math.sign(lx * fz - lz * fx), 0, 1);
    const held = grip * (1 - C.slide * clamp((across - 1.2) / 1.3, 0, 1) * (0.6 + 0.4 * Math.max(0, t)) * (0.45 + 0.55 * into)) * dt, keep = across > held ? (across - held) / across : 0;
    c.vx = fx * along + lx * keep; c.vz = fz * along + lz * keep; c.slip = across * keep;
    if (free) { c.vx = v0x * (1 - 0.25 * dt); c.vz = v0z * (1 - 0.25 * dt); c.slip = 0; } // (on oil nothing grips and nothing pulls: it goes on the way it went)
    // the slide: it heats the tyres — yellow, orange, blue sparks —, and straightening up lets them go as a burst
    if (!free) {
      if (!c.drift && c.slip > D.on && speed > 3) { c.drift = true; c.heat = 0; c.level = 0; events?.push({ type: 'drift', car: i }); }
      else if (c.drift && c.slip < D.off) {
        c.drift = false;
        if (c.level) { c.turbo = D.time[c.level - 1]; c.turboTop = D.top[c.level - 1]; events?.push({ type: 'turbo', car: i, level: c.level }); }
        c.heat = 0; c.level = 0;
      }
      if (c.drift && !surf) { c.heat += dt; const lv = c.heat >= D.heat[2] ? 3 : c.heat >= D.heat[1] ? 2 : c.heat >= D.heat[0] ? 1 : 0; if (lv > c.level) { c.level = lv; events?.push({ type: 'spark', car: i, level: lv }); } }
    }
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
  // ---- the pad kicks; the oil takes the tyres away; a jet that burns takes the speed
  if (c.guard <= 0 && inZone(PAD, c.s, c.l)) {
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), v = Math.min(C.pad.top, Math.max(now, c.vx * fx + c.vz * fz + C.pad.kick));
    c.guard = 0.6;
    if (v > now) { c.vx = fx * v; c.vz = fz * v; events?.push({ type: 'pad', car: i }); }
  }
  if (c.oil <= 0 && c.slick <= 0 && now > 1.5 && inZone(OIL, c.s, c.l)) { c.oil = C.oil.time; c.slick = 2; c.spin = (c.l > (OIL.l0 + OIL.l1) / 2 ? 1 : -1) * C.oil.spin; events?.push({ type: 'oil', car: i }); }
  if (c.scorch <= 0) for (let j = 0; j < JETS.length; j++) if (inZone(JETS[j], c.s, c.l) && jetOn(st, j)) {
    c.vx *= C.fire.keep; c.vz *= C.fire.keep; c.scorch = C.fire.time; c.boost = 0; c.turbo = 0; c.drift = false; c.heat = 0; c.level = 0;
    events?.push({ type: 'fire', car: i, jet: j });
    break;
  }
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
// A car that drives by itself — the proof that the lap can be driven, and the three rivals. It holds a remote as
// one does: it aims at a place of its line a little way ahead and turns the wheel to bring its nose round to it,
// takes the throttle up to what that line allows where it is — braking in time for what comes —, passes a car in
// its way on the side where there is room, boosts where a straight is long enough, and backs up when it is stuck.

/**
 * The wheel and the throttle that bring car `c` towards (dx, dz) — a heading in the world, a place `dist` metres
 * away — pulling `go` (0 … 1), or braking when `go` is negative. Stuck for a moment, it backs up, turning.
 */
function steerTo(c, dx, dz, dist, go, cmd) {
  const d = wrap(Math.atan2(dx, dz) - c.yaw), along = c.vx * Math.sin(c.yaw) + c.vz * Math.cos(c.yaw), speed = Math.hypot(c.vx, c.vz);
  if (c.backing > 0) { c.backing -= STEP; cmd.throttle = -0.8; cmd.steer = d >= 0 ? 1 : -1; return cmd; }
  if (speed < 0.5 && go > 0) { if ((c.stuck += STEP) > 0.6) { c.stuck = 0; c.backing = 0.7; } } else if (speed > 1) c.stuck = 0;
  // (the turn that would bring it onto the place it aims at, as the wheel gives it at this speed)
  const v = Math.max(along, 1), rate = rateAt(Math.max(Math.abs(along), 0.6 * Math.abs(go)), c.drift), turn = (2 * v * Math.sin(d)) / Math.max(dist, 0.3) + 0.08 * (2 * v * Math.sin(d) / Math.max(dist, 0.3) - c.wr);
  cmd.steer = clamp(-turn / Math.max(rate, 0.3), -1, 1);
  cmd.throttle = go < 0 ? (along > 0.5 ? -1 : 0) : Math.abs(d) > 1.9 ? 0.4 : go;
  return cmd;
}

/** What car `i` does by itself: cmd.steer, cmd.throttle (as one's remote: -1 … 1), cmd.boost. */
function botDrive(st, i, cmd, skill) {
  const c = st.cars[i], S = skill || c.skill, speed = Math.hypot(c.vx, c.vz);
  cmd.steer = 0; cmd.throttle = 0; cmd.boost = false;
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
  steerTo(c, tx, tz, tl, speed > may + 0.3 ? -1 : clamp(may / (C.top * c.top), 0.2, 1), cmd);
  cmd.boost = !!S.boost && !c.done && c.charge >= 1 && !c.air && speed > 3 && FREE[c.k] > (pass ? 0 : 1);
  return cmd;
}
/** The remote that says `cmd`. */
function stickOf(cmd, out) { out.x = cmd.steer; out.y = cmd.throttle; out.jump = cmd.boost; return out; }
const _bot = { steer: 0, throttle: 0, boost: false };
/** One's own car, driven by itself: the remote and the jump. */
export function botInput(st, out = { x: 0, y: 0, jump: false }) { return stickOf(botDrive(st, 0, _bot, ACE), out); }
/** Who never touches the remote. */
export function idleInput(st, out = { x: 0, y: 0, jump: false }) { out.x = 0; out.y = 0; out.jump = false; return out; }
/** A driver with a keyboard: what the car that drives by itself would do, but with keys — each pressed or not. */
export function keysInput(st, out = { x: 0, y: 0, jump: false }) {
  botInput(st, out);
  // (it taps, as fingers do — a key held or not for a tenth of a second at a time, for a share of the time that
  // says how much it means; what was not given is carried on)
  const c = st.cars[0], beat = Math.floor(st.clock * 10);
  if (c.tapAt !== beat) {
    const x = (c.tapX || 0) + out.x, y = (c.tapY || 0) + out.y;
    c.tapAt = beat; c.keyX = Math.abs(x) > 0.5 ? Math.sign(x) : 0; c.keyY = Math.abs(y) > 0.5 ? Math.sign(y) : 0; c.tapX = x - c.keyX; c.tapY = y - c.keyY;
  }
  out.x = c.keyX; out.y = c.keyY;
  return out;
}
/** A clumsy driver: the throttle always full, the wheel hard over at the middle of the road a little way ahead and a little beside it; never brakes, hammers the boost (it backs up when stuck, as anybody would). */
export function clumsyInput(st, out = { x: 0, y: 0, jump: false }) {
  const c = st.cars[0], j = (c.k + 9) % M, off = 0.55 * Math.sin(st.clock * 1.3 + st.seed);
  const tx = PX[j] + NX[j] * off - c.x, tz = PZ[j] + NZ[j] * off - c.z, tl = Math.hypot(tx, tz) || 1;
  steerTo(c, tx, tz, tl, 1, _bot);
  if (_bot.throttle > 0) { _bot.throttle = 1; _bot.steer = Math.abs(_bot.steer) > 0.25 ? Math.sign(_bot.steer) : _bot.steer; }
  _bot.boost = true;
  return stickOf(_bot, out);
}

/**
 * Runs a race with `play` at one's stick (the car that drives by itself, unless another is given), until every
 * car is home or `secs` have passed: { time (ms; 0: not home), place, over, state, laps (when each of one's laps
 * began, s), order (the gates one passed), events: how many of each }.
 */
export function raceRun(seed = 1, play = botInput, secs = C.limit + 5) {
  const st = startRace(seed), input = { x: 0, y: 0, jump: false }, events = [], count = {}, laps = [], order = [];
  while (st.clock < secs && !st.out && !(st.over && st.cars.every((c) => c.done))) {
    const home = st.cars[0].done; play(st, input); stepRace(st, STEP, input, events);
    for (const e of events) { if (home && e.car === 0) continue; if (e.car === 0 || e.type === 'out') count[e.type] = (count[e.type] || 0) + 1; if (e.car === 0 && e.type === 'gate') { order.push(e.gate); if (!e.gate) laps.push(e.time); } }
    events.length = 0;
  }
  return { time: st.time, place: st.place, over: st.over, state: st, laps, order, events: count };
}
