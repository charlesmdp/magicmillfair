// The Nuclear Cave (it was The Hollow Hill: the code still says `hollow`): its rules. No renderer here: the game, its checks and the flyer that plays by itself all
// read this.
//
// A race against the clock, flown under the ground: one lap of a great cave dug in the hill behind the sea
// cliff — a ring of galleries and halls, half a kilometre round, never nearer the open air than a dozen metres
// of rock. One flies by oneself: the flyer goes forward, one only steers (left and right, up and down) and
// chooses when to burst (it is spent, it comes back slowly, and every ring flown through gives some back).
// What one hits — a column, a tooth of rock, a blast door missed — does not end the flight: it throws one aside
// and halves one's speed, and the clock runs on. The walls rub: one loses speed along them. What one flies past
// closely, without touching, gives some burst back — and so do the atoms, little lights that lead into every
// ring: the fast lap is the daring one. The cave was a store of what the world before could not get rid of:
// drums along its walls, pools that glow, pipes, and names to match (`titles`).
//   The Lantern Gallery     a few columns, left and right
//   The Forest of Columns   a hall as wide as a church, full of them
//   The Teeth               rows of rock from the roof, rows from the floor: under, over, under
//   The Screw               once and a quarter round a pillar, going down: the inside is much the shorter way,
//                           and boulders lie on it
//   The Lake                low arches over black water
//   The Curtains            walls of rock with one hole each
//   The Narrows             no room: the walls are the thing to miss
//   The Crystal Hall        beams of crystal across, and the way home
//
// Places: `s` metres along the middle line of the cave (the lap is `course().length` long), `u` metres to the
// right of it, `v` metres above it. The cave is an ellipse round its line, `a` wide and `b` high (half sizes),
// cut by a flat floor three quarters of the way down.
// The inside of a bend is shorter: at the same speed one gains on who flies the middle.
// Time advances in steps of 1/120 s whatever the frame rate.

export const HOLLOW = {
  name: 'The Nuclear Cave',
  step: 1 / 120,
  cruise: 18, burst: 27, accel: 6, // m/s by itself, and bursting; how fast speed comes back
  agility: 12, snap: 60, // m/s across and up at most; how fast one gets there (m/s²)
  body: 0.42, skin: 0.18, // the flyer, as a ball; and how far the rough of the rock comes in from where the wall is drawn (what one sees is what one hits)
  floor: 0.75, // the cave has a floor: flat, so much of its half height under its middle line
  crash: { keep: 0.5, least: 8, stun: 0.35, aside: 6, shield: 0.7 }, // what a hit leaves of the speed; for how long one hardly steers; and for how long nothing else knocks one (a curtain apart)
  rub: 0.9, bump: 5, // along a wall: so much of the speed lost a second; and a wall met faster than this across is a knock
  gauge: { time: 3.2, fill: 16, ring: 0.3 }, // s of burst in a full gauge; s for it to come back by itself; what a ring gives back
  ring: { r: 2.1, kick: 4 }, // a ring: its radius, and the push it gives (m/s, soon gone)
  close: { reach: 0.9, give: 0.14 }, // a thing flown past within so much of touching it: so much burst back (once a lap for each)
  atom: { r: 1.25, give: 0.045, lead: [13, 10, 7, 4] }, // the atoms: taken within so much; what each gives back; how far before its ring each one is
  // what each stretch is called (the names of the nodes, below, are the ones the code goes by)
  titles: { 'The Start Hall': 'The Airlock', 'The Lantern Gallery': 'The Waste Gallery', 'The Forest of Columns': 'The Cooling Hall', 'The Teeth': 'The Teeth', 'The Screw': 'The Centrifuge',
    'The Lake': 'The Cooling Pond', 'The Curtains': 'The Blast Doors', 'The Narrows': 'The Service Duct', 'The Crystal Hall': 'The Core', 'The Way Home': 'The Way Out' },
  count: 3, // s of count before the off
  water: 7.4, // m above the sea: the level of the lake (and of whatever part of the cave is lower)
  mouth: { x: 89.4, z: 110.6, yaw: 0 }, // outside: before the mouth of the mine at the foot of the cliff, where one asks
};

// ---------------------------------------------------------------------------------------------- the line of the cave

// x, y, z of the middle line, half width, half height — and the name of the stretch that begins there
const NODES = (() => {
  const n = [
    [106, 20, 150, 9.5, 7, 'The Start Hall'], [97, 20, 141, 9, 7], [84, 19.5, 143, 6.5, 5],
    [74, 20.5, 157, 6, 5, 'The Lantern Gallery'], [63, 21, 170, 6, 5], [52, 22, 185, 6.5, 5.5],
    [40, 24, 208, 15, 10, 'The Forest of Columns'],
    [36, 27.5, 238, 7, 6, 'The Teeth'], [44, 31.5, 262, 6.5, 5.4],
  ];
  // The Screw: once and a quarter round a pillar, twenty metres down
  for (let d = 180, k = 0; d >= -270; d -= 30, k++) { const t = (d * Math.PI) / 180; n.push([66 + 16 * Math.cos(t), 32.25 - (180 - d) * 0.045, 276 + 16 * Math.sin(t), 6.5, 5.2, k === 0 ? 'The Screw' : '']); }
  n.push([80, 11.6, 293.5, 6.5, 5.2, ''], // (out from under the screw before the cave widens)
    [100, 11, 295, 13, 6, 'The Lake'], [124, 11, 296, 14, 6], [146, 11.5, 291, 12, 6],
    [158, 13, 278, 7, 6, 'The Curtains'], [160, 15, 263, 6.5, 5.5], [147, 16, 252, 6.5, 5.5], [133, 17, 242, 6, 5],
    [124, 17, 234, 4.4, 4, 'The Narrows'], [116, 17.5, 225, 4.2, 4], [116, 18, 214, 4.2, 4], [109, 18.5, 205, 4.6, 4.2],
    [102, 19, 190, 11, 8, 'The Crystal Hall'], [101, 19.5, 172, 11, 8],
    [106, 20, 161, 7, 6, 'The Way Home']);
  return n;
})();
const DS = 0.5; // m between two samples of the line

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

let line = null;
/** The middle line, sampled every half metre round the lap, with its frame and how it bends. */
function sampled() {
  if (line) return line;
  const n = NODES, N = n.length, raw = [], marks = [], P = (k) => n[((k % N) + N) % N];
  const gap = (a, b) => Math.sqrt(Math.max(1e-3, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])));
  for (let i = 0; i < N; i++) {
    // (a smooth curve through the nodes, which does not overshoot where they are unevenly spaced)
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), t1 = gap(p0, p1), t2 = t1 + gap(p1, p2), t3 = t2 + gap(p2, p3);
    const m = Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]) / 0.2);
    marks.push(raw.length);
    for (let j = 0; j < m; j++) {
      const t = t1 + ((t2 - t1) * j) / m, q = [];
      for (let c = 0; c < 5; c++) {
        const A1 = ((t1 - t) * p0[c] + t * p1[c]) / t1, A2 = ((t2 - t) * p1[c] + (t - t1) * p2[c]) / (t2 - t1), A3 = ((t3 - t) * p2[c] + (t - t2) * p3[c]) / (t3 - t2);
        const B1 = ((t2 - t) * A1 + t * A2) / t2, B2 = ((t3 - t) * A2 + (t - t1) * A3) / (t3 - t1);
        q.push(((t2 - t) * B1 + (t - t1) * B2) / (t2 - t1));
      }
      raw.push(q);
    }
  }
  const cum = [0];
  for (let i = 1; i <= raw.length; i++) { const a = raw[i - 1], b = raw[i % raw.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])); }
  const length = cum[raw.length], M = Math.round(length / DS), ds = length / M, pts = [];
  for (let k = 0, i = 0; k < M; k++) {
    const s = k * ds;
    while (cum[i + 1] < s) i++;
    const f = (s - cum[i]) / (cum[i + 1] - cum[i] || 1), a = raw[i], b = raw[(i + 1) % raw.length];
    pts.push(a.map((v, c) => v + (b[c] - v) * f));
  }
  const at = (k) => pts[((k % M) + M) % M], frames = [];
  for (let k = 0; k < M; k++) {
    const a = at(k - 1), b = at(k + 1), l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l, tz = (b[2] - a[2]) / l;
    const h = Math.hypot(tx, tz), rx = -tz / h, rz = tx / h; // (its right: level; its up: square to both)
    frames.push({ x: pts[k][0], y: pts[k][1], z: pts[k][2], a: pts[k][3], b: pts[k][4], tx, ty, tz, rx, ry: 0, rz, ux: -rz * ty, uy: rz * tx - rx * tz, uz: rx * ty, ku: 0, kv: 0 });
  }
  for (let k = 0; k < M; k++) {
    // how it bends: to the right (ku > 0) or the left, up (kv > 0) or down — a tenth of a metre of bend per metre is a tight turn
    const f = frames[k], p = frames[(k + 6) % M], q = frames[(k - 6 + M) % M], dx = (p.tx - q.tx) / (12 * ds), dy = (p.ty - q.ty) / (12 * ds), dz = (p.tz - q.tz) / (12 * ds);
    f.ku = dx * f.rx + dz * f.rz; f.kv = dx * f.ux + dy * f.uy + dz * f.uz;
  }
  const nodeS = marks.map((m) => cum[m]), mid = (i) => (i === 0 ? (nodeS[N - 1] + length) / 2 - length : (nodeS[i - 1] + nodeS[i]) / 2);
  const stretches = [];
  n.forEach((p, i) => { if (p[5]) stretches.push({ name: p[5], from: mid(i), node: i }); });
  stretches.forEach((q, i) => { q.to = i + 1 < stretches.length ? stretches[i + 1].from : length + stretches[0].from; });
  line = { frames, length, ds, M, nodeS, stretches };
  return line;
}

/**
 * The cave at `s` metres along its line (any number: the lap goes round): fills `out` with its middle (x, y, z),
 * its direction (tx…), its right (rx…) and its up (ux…), its half width `a` and half height `b`, how it bends
 * (`ku` to the right, `kv` upwards, per metre) and `water`: how high the lake stands there, from the middle
 * line (lower than -b where the cave is dry).
 */
export function tunnelAt(s, out = {}) {
  const L = sampled(), k0 = Math.floor(s / L.ds), f = s / L.ds - k0, p = L.frames[((k0 % L.M) + L.M) % L.M], q = L.frames[(((k0 + 1) % L.M) + L.M) % L.M];
  for (const key of KEYS) out[key] = p[key] + (q[key] - p[key]) * f;
  out.water = (HOLLOW.water - out.y) / out.uy;
  return out;
}
const KEYS = ['x', 'y', 'z', 'a', 'b', 'tx', 'ty', 'tz', 'rx', 'ry', 'rz', 'ux', 'uy', 'uz', 'ku', 'kv'];
const _f = {};
/** A place of the cave in the world: `u` to the right of its line at `s`, `v` above it. */
export function tunnelPoint(s, u, v, out = {}) {
  const f = tunnelAt(s, _f);
  out.x = f.x + f.rx * u + f.ux * v; out.y = f.y + f.ry * u + f.uy * v; out.z = f.z + f.rz * u + f.uz * v;
  return out;
}

// ---------------------------------------------------------------------------------------------- what is in it

let laid = null;
/**
 * The course, laid once: { length (m, one lap), stretches: [{ name, from, to }], things: what one must not hit,
 * rings: [{ s, u, v, r }] }. A thing is a stick of rock in the plane across the cave at `s` — from (u1, v1),
 * `r1` thick, to (u2, v2), `r2` thick: a column, a tooth, an arch, a beam, a boulder — or a curtain
 * ({ kind: 'curtain', s, u, v, r }: a wall across with one hole).
 */
export function course() {
  if (laid) return laid;
  const L = sampled(), H = HOLLOW, things = [], rings = [], S = Object.fromEntries(L.stretches.map((q) => [q.name, q])), f = {};
  const at = (name, t) => S[name].from + (S[name].to - S[name].from) * t;
  /** How far up the cave goes at `u` across (where a column meets the roof); and where its floor is. */
  const roof = (s, u) => { tunnelAt(s, f); return f.b * Math.sqrt(Math.max(0.05, 1 - (u / f.a) ** 2)); };
  const ground = (s) => -tunnelAt(s, f).b * H.floor;
  const stick = (kind, s, u1, v1, r1, u2, v2, r2 = r1) => things.push({ kind, s, u1, v1, r1, u2, v2, r2 });
  const column = (s, u, r) => stick('column', s, u, ground(s), r, u, roof(s, u), r);
  const tooth = (s, u, r, tip, down) => stick(down ? 'stalactite' : 'stalagmite', s, u, down ? roof(s, u) : ground(s), r, u, tip, 0.2);
  const ring = (s, u, v) => rings.push({ s, u, v, r: H.ring.r });
  let g = 'The Lantern Gallery';
  column(at(g, 0.2), -2.3, 0.9); column(at(g, 0.42), 2.3, 1.0); column(at(g, 0.64), -0.6, 0.9); column(at(g, 0.86), 3.1, 0.8); column(at(g, 0.86), -3.3, 0.8);
  ring(at(g, 0.53), 1.6, 0.4);
  g = 'The Forest of Columns';
  [[0.14, [[-9.5, 1.3], [-3.6, 1.0], [2.4, 1.4], [8.2, 1.1]]], [0.5, [[-11.5, 1.0], [-6, 1.5], [0, 1.2], [6, 1.0], [11.4, 1.3]]], [0.86, [[-8.6, 1.2], [-2.6, 1.0], [3.4, 1.5], [9, 1.1]]]]
    .forEach(([t, row]) => row.forEach(([u, r]) => column(at(g, t), u, r)));
  ring(at(g, 0.32), -3, 0.8); ring(at(g, 0.68), 0.4, -1.6);
  g = 'The Teeth';
  [[0.1, true], [0.28, false], [0.46, true], [0.64, false], [0.82, true]].forEach(([t, down], k) => {
    // (a row of three across, hanging to the middle or standing up to it; a way round it at one side, close to the wall)
    for (const u of [-3.4 + (k % 2 ? 1.1 : 0), 0.2 + (k % 2 ? 1.1 : 0), k % 2 ? -3.4 : 3.6]) tooth(at(g, t), u, 1.45, down ? 0.5 : -0.5, down);
  });
  ring(at(g, 0.37), 0.6, 2.4); ring(at(g, 0.73), 0.9, 2.3);
  g = 'The Screw';
  // (it turns to the left all the way: the left is the inside. A boulder on the inside, now low, now high.)
  [[0.13, -3.3, -1.2, 1.5], [0.3, -3.6, 1.6, 1.4], [0.47, -3.0, -2.0, 1.6], [0.64, -3.5, 1.0, 1.5], [0.81, -3.1, -1.6, 1.5]].forEach(([t, u, v, r]) => stick('boulder', at(g, t), u, v, r, u, v, r));
  tooth(at(g, 0.22), 2.8, 1.3, 0.2, true); tooth(at(g, 0.56), 3.0, 1.3, 0.4, true); tooth(at(g, 0.73), 2.2, 1.2, -0.4, false);
  ring(at(g, 0.215), -3.3, 1.3); ring(at(g, 0.39), -3.5, -1.5); ring(at(g, 0.725), -3.4, -1.7);
  g = 'The Lake';
  const arch = (t, v, r) => { const s = at(g, t); tunnelAt(s, f); stick('arch', s, -f.a, v, r, f.a, v, r); }; // (a bridge of rock from wall to wall)
  arch(0.2, 1.7, 1.0); arch(0.44, -2.5, 0.95); column(at(g, 0.63), -4.2, 1.4); column(at(g, 0.63), 5.2, 1.3); tooth(at(g, 0.63), 0.6, 1.5, -0.2, true); arch(0.84, 0.8, 1.05);
  ring(at(g, 0.31), -3, -2.3); ring(at(g, 0.53), 3.2, 1.6); ring(at(g, 0.74), 0.4, -2.4);
  g = 'The Curtains';
  for (const [t, u, v, r] of [[0.16, -2.2, 1.0, 2.35], [0.47, 2.3, -0.9, 2.25], [0.78, -0.6, 1.3, 2.2]]) { things.push({ kind: 'curtain', s: at(g, t), u, v, r }); ring(at(g, t) + 1.2, u, v); }
  column(at(g, 0.31), 1.2, 0.9); column(at(g, 0.63), -1.6, 0.9);
  g = 'The Narrows';
  tooth(at(g, 0.3), 1.3, 0.9, 0.5, true); tooth(at(g, 0.68), -1.3, 0.9, 0.5, true);
  ring(at(g, 0.5), 0, -0.9);
  g = 'The Crystal Hall';
  stick('beam', at(g, 0.2), -9, -6.5, 0.85, 5, 6.5); stick('beam', at(g, 0.46), 9, -6.5, 0.9, -4, 6.8); stick('beam', at(g, 0.72), -10, 0.8, 0.8, 10, -0.6);
  column(at(g, 0.33), 5, 1.0); column(at(g, 0.59), -5.5, 1.1);
  ring(at(g, 0.33), -3.6, -2.2); ring(at(g, 0.59), 3.2, 2.6); ring(at(g, 0.86), 0, 3.0);
  g = 'The Way Home';
  column(at(g, 0.45), -2.9, 0.8); column(at(g, 0.45), 2.9, 0.8);
  things.sort((p, q) => p.s - q.s); rings.sort((p, q) => p.s - q.s);
  things.forEach((t, i) => { t.id = i; t.reach = t.kind === 'curtain' ? 0.6 : Math.max(t.r1, t.r2) + H.body; });
  rings.forEach((r, i) => { r.id = i; });
  // the atoms: a few lights before every ring, coming in from nearer the middle of the cave — none inside a thing
  const atoms = [];
  for (const r of rings) for (const back of H.atom.lead) {
    const s = (((r.s - back) % L.length) + L.length) % L.length, k = 1 - back / 30, u = r.u * k, v = r.v * k;
    const inside = things.some((t) => {
      let d = Math.abs(s - t.s); if (d > L.length / 2) d = L.length - d;
      if (t.kind === 'curtain') return d < 0.8 && Math.hypot(u - t.u, v - t.v) > t.r - 0.9;
      const eu = t.u2 - t.u1, ev = t.v2 - t.v1, l2 = eu * eu + ev * ev, w = l2 > 1e-9 ? clamp(((u - t.u1) * eu + (v - t.v1) * ev) / l2, 0, 1) : 0;
      return d < 2.2 && Math.hypot(u - (t.u1 + eu * w), v - (t.v1 + ev * w)) < t.r1 + (t.r2 - t.r1) * w + 1.1;
    });
    const here = tunnelAt(s, {}); // (and none in the rock, nor in the water: the cave is not as wide everywhere)
    if (!inside && (u / (here.a - 0.9)) ** 2 + (v / (here.b - 0.9)) ** 2 <= 1 && v >= here.water + 0.6 && v >= -here.b * H.floor + 0.7) atoms.push({ s, u, v });
  }
  atoms.sort((p, q) => p.s - q.s).forEach((a, i) => { a.id = i; });
  laid = { length: L.length, stretches: L.stretches.map((q) => ({ name: q.name, from: q.from, to: q.to })), things, rings, atoms };
  return laid;
}

/** The stretch one is in at `s` (its number in course().stretches). */
export function stretchAt(s) {
  const C = course(), m = ((s % C.length) + C.length) % C.length;
  for (let i = C.stretches.length - 1; i >= 0; i--) if (m >= C.stretches[i].from) return m >= C.stretches[C.stretches.length - 1].to ? 0 : i;
  return 0;
}

// ---------------------------------------------------------------------------------------------- the flight

/** A flyer waiting for the off in the Start Hall: see stepFlight. */
export function startFlight() {
  return { s: 2, u: 0, v: 0, vu: 0, vv: 0, speed: 0, extra: 0, gauge: 1, bursting: false, stun: 0, rub: 0, wet: false, wait: HOLLOW.count, gone: false, clock: 0, acc: 0, over: false, time: 0, hits: 0, rings: 0, taken: {}, near: {}, close: 0, got: {}, atoms: 0, shield: 0, stretch: 0, top: 0 };
}

/**
 * Advances a flight by `dt` seconds. `input`: { x (-1 left … 1 right), y (-1 down … 1 up), burst (held) }.
 * `events`: { type: 'go' | 'crash' (kind) | 'knock' (a wall met hard) | 'close' (a thing flown past closely) | 'ring' |
 * 'atom' (id) | 'stretch' (n) | 'over' (time) }.
 */
export function stepFlight(st, dt, input, events) {
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= HOLLOW.step - 1e-9 && !st.over) { st.acc -= HOLLOW.step; sub(st, HOLLOW.step, input, events); }
  return st;
}

const _t = {};
function sub(st, dt, input, events) {
  const H = HOLLOW, C = course();
  if (!st.gone) { st.wait -= dt; if (st.wait > 0) return; st.gone = true; st.speed = H.cruise * 0.5; events?.push({ type: 'go' }); }
  st.clock += dt;
  if (st.stun > 0) st.stun -= dt;
  if (st.shield > 0) st.shield -= dt;
  const f = tunnelAt(st.s, _t);
  // ---- the burst and the speed
  st.bursting = !!input?.burst && st.gauge > 0 && st.stun <= 0;
  st.gauge = st.bursting ? Math.max(0, st.gauge - dt / H.gauge.time) : Math.min(1, st.gauge + dt / H.gauge.fill);
  st.speed += clamp((st.bursting ? H.burst : H.cruise) - st.speed, -H.accel * 1.5 * dt, H.accel * (st.bursting ? 2.2 : 1) * dt);
  st.extra = Math.max(0, st.extra - 2.5 * dt);
  // ---- steering
  const k = st.stun > 0 ? 0.35 : st.bursting ? 0.85 : 1, ix = clamp(input?.x || 0, -1, 1), iy = clamp(input?.y || 0, -1, 1);
  st.vu += clamp(ix * H.agility * k - st.vu, -H.snap * dt, H.snap * dt);
  st.vv += clamp(iy * H.agility * k - st.vv, -H.snap * dt, H.snap * dt);
  st.u += st.vu * dt; st.v += st.vv * dt;
  // ---- forward: the inside of a bend is the shorter way
  const s0 = st.s;
  st.s += ((st.speed + st.extra) * dt) / Math.max(0.55, 1 - f.ku * st.u - f.kv * st.v);
  // ---- the walls: one cannot go through them, and one loses speed along them
  const A = f.a - H.body - H.skin, B = f.b - H.body - H.skin, e = (st.u / A) ** 2 + (st.v / B) ** 2;
  let rubbing = false;
  if (e > 1) {
    const q = 1 / Math.sqrt(e); st.u *= q; st.v *= q;
    let nu = st.u / (A * A), nv = st.v / (B * B); const nl = Math.hypot(nu, nv) || 1; nu /= nl; nv /= nl;
    const out = st.vu * nu + st.vv * nv;
    if (out > 0) { st.vu -= out * nu; st.vv -= out * nv; if (out > H.bump && st.stun <= 0) { st.speed *= 0.8; events?.push({ type: 'knock' }); } }
    rubbing = true;
  }
  st.wet = false;
  const low = -f.b * H.floor + H.body + 0.4; // (clear of what lies on the floor)
  if (st.v < low) { st.v = low; if (st.vv < 0) st.vv = 0; rubbing = true; }
  if (st.v < f.water + 0.4) { st.v = f.water + 0.4; if (st.vv < 0) st.vv = 0; st.wet = true; st.speed -= st.speed * 0.5 * dt; }
  if (rubbing) { st.speed -= st.speed * H.rub * dt; st.rub += dt; }
  // ---- what is in the way
  const L = C.length, lap = Math.floor(st.s / L), m = st.s - lap * L, m0 = s0 - Math.floor(s0 / L) * L;
  for (const t of C.things) {
    let d = m - t.s; if (d > L / 2) d -= L; else if (d < -L / 2) d += L;
    if (Math.abs(d) > t.reach + 0.5 || (st.shield > 0 && t.kind !== 'curtain')) continue;
    if (t.kind === 'curtain') {
      // a wall across with one hole: it is met when its plane is crossed
      let d0 = m0 - t.s; if (d0 > L / 2) d0 -= L; else if (d0 < -L / 2) d0 += L;
      if (!(d0 < 0 && d >= 0)) continue;
      const du = st.u - t.u, dv = st.v - t.v, far = Math.hypot(du, dv), room = t.r - H.body;
      if (far <= room) continue;
      st.u = t.u + (du / far) * (room - 0.1); st.v = t.v + (dv / far) * (room - 0.1); st.vu = 0; st.vv = 0;
      hit(st, t, events);
      continue;
    }
    // a stick: how near its middle line is the flyer?
    const eu = t.u2 - t.u1, ev = t.v2 - t.v1, l2 = eu * eu + ev * ev, w = l2 > 1e-9 ? clamp(((st.u - t.u1) * eu + (st.v - t.v1) * ev) / l2, 0, 1) : 0;
    const qu = t.u1 + eu * w, qv = t.v1 + ev * w, r = t.r1 + (t.r2 - t.r1) * w + H.body, du = st.u - qu, dv = st.v - qv;
    if (d * d + du * du + dv * dv >= r * r) {
      // (not touched — but flown past closely: some burst back, once a lap for each thing)
      let d0 = m0 - t.s; if (d0 > L / 2) d0 -= L; else if (d0 < -L / 2) d0 += L;
      if (d0 < 0 && d >= 0 && st.near[t.id] !== lap && du * du + dv * dv < (r + H.close.reach) ** 2) { st.near[t.id] = lap; st.close++; st.gauge = Math.min(1, st.gauge + H.close.give); events?.push({ type: 'close', kind: t.kind }); }
      continue;
    }
    // thrown aside, away from it: across the cave, whichever way is nearer
    const far = Math.hypot(du, dv);
    let nu = far > 0.05 ? du / far : l2 > 1e-9 ? -ev / Math.sqrt(l2) : 0, nv = far > 0.05 ? dv / far : l2 > 1e-9 ? eu / Math.sqrt(l2) : 1;
    if (far <= 0.05 && nu * st.u + nv * st.v > 0) { nu = -nu; nv = -nv; } // (dead on: towards the middle of the cave)
    st.u = qu + nu * (r + 0.05); st.v = qv + nv * (r + 0.05); st.vu = nu * H.crash.aside; st.vv = nv * H.crash.aside;
    hit(st, t, events);
  }
  // ---- the rings
  for (const r of C.rings) {
    if (st.taken[r.id] === lap) continue;
    let d = m - r.s; if (d > L / 2) d -= L; else if (d < -L / 2) d += L;
    let d0 = m0 - r.s; if (d0 > L / 2) d0 -= L; else if (d0 < -L / 2) d0 += L;
    if (!(d0 < 0 && d >= 0) || Math.hypot(st.u - r.u, st.v - r.v) > r.r) continue;
    st.taken[r.id] = lap; st.rings++; st.gauge = Math.min(1, st.gauge + H.gauge.ring); st.extra = Math.max(st.extra, H.ring.kick);
    events?.push({ type: 'ring', id: r.id });
  }
  // ---- the atoms
  for (const a of C.atoms) {
    if (st.got[a.id] === lap) continue;
    let d = m - a.s; if (d > L / 2) d -= L; else if (d < -L / 2) d += L;
    if (d < 0 || d > 2) continue;
    let d0 = m0 - a.s; if (d0 > L / 2) d0 -= L; else if (d0 < -L / 2) d0 += L;
    if (d0 >= 0 || Math.hypot(st.u - a.u, st.v - a.v) > H.atom.r) continue;
    st.got[a.id] = lap; st.atoms++; st.gauge = Math.min(1, st.gauge + H.atom.give);
    events?.push({ type: 'atom', id: a.id });
  }
  // ---- where one is: the stretch, the end of the lap
  if (st.speed + st.extra > st.top) st.top = st.speed + st.extra;
  const n = stretchAt(st.s);
  if (n !== st.stretch) { st.stretch = n; events?.push({ type: 'stretch', n }); }
  if (st.s >= L) { st.over = true; st.time = Math.round(st.clock * 1000); events?.push({ type: 'over', time: st.time }); }
}
function hit(st, t, events) {
  const H = HOLLOW;
  st.speed = Math.max(H.crash.least, st.speed * H.crash.keep); st.extra = 0; st.stun = H.crash.stun; st.shield = H.crash.shield; st.hits++;
  events?.push({ type: 'crash', kind: t.kind });
}

/** Where a flyer is in the world and how it lies: { x, y, z, yaw, pitch, roll }. */
export function flightPose(st, out = {}) {
  const f = tunnelAt(st.s, _t), H = HOLLOW;
  out.x = f.x + f.rx * st.u + f.ux * st.v; out.y = f.y + f.uy * st.v; out.z = f.z + f.rz * st.u + f.uz * st.v;
  out.yaw = Math.atan2(f.tx, f.tz) - (st.vu / H.agility) * 0.25;
  out.pitch = Math.asin(clamp(f.ty, -1, 1)) + (st.vv / H.agility) * 0.3;
  out.roll = (st.vu / H.agility) * 0.7;
  return out;
}

// ---------------------------------------------------------------------------------------------- flyers that play by themselves

const copy = (st) => ({ ...st, taken: { ...st.taken }, acc: 0 });
/** The asks of a flyer that makes for (u, v) across the cave. */
function towards(st, u, v, out) {
  out.x = clamp((u - st.u) * 1.6 - st.vu * 0.1, -1, 1); out.y = clamp((v - st.v) * 1.6 - st.vv * 0.1, -1, 1);
  return out;
}
/** What `secs` of making for (u, v) are worth: the way made, less what is hit and rubbed, plus the rings. */
function worth(st, u, v, burst, secs) {
  const q = copy(st), inp = { x: 0, y: 0, burst }, s0 = q.s, hits = q.hits, rings = q.rings, rub = q.rub;
  for (let t = 0; t < secs && !q.over; t += HOLLOW.step) { towards(q, u, v, inp); sub(q, HOLLOW.step, inp, null); }
  return q.s - s0 - (q.hits - hits) * 45 - (q.rub - rub) * 14 + (q.rings - rings) * 7 - (q.wet ? 1 : 0);
}
/**
 * A flyer that plays by itself — the proof that the lap can be flown clean. Ten times a second it weighs a
 * score of places to make for across the cave (and the next ring), a second and a half ahead, and bursts when
 * that is safe.
 */
export function botInput(st, out = { x: 0, y: 0, burst: false }) {
  const bot = st.bot || (st.bot = { until: -1, u: 0, v: 0, burst: false });
  if (!st.gone || st.over) { out.x = 0; out.y = 0; out.burst = false; return out; }
  if (st.clock >= bot.until) {
    bot.until = st.clock + 0.1;
    const f = tunnelAt(st.s + 6, {}), A = f.a - HOLLOW.body - HOLLOW.skin - 0.3, B = f.b - HOLLOW.body - HOLLOW.skin - 0.3, low = Math.max(-f.b * HOLLOW.floor + HOLLOW.body + 0.6, f.water + 0.9), C = course(), L = C.length;
    const spots = [[bot.u, bot.v]];
    for (const pu of [-0.85, -0.5, -0.18, 0.18, 0.5, 0.85]) for (const pv of [-0.8, -0.4, 0, 0.4, 0.8]) spots.push([pu * A, Math.max(low, pv * B)]);
    const m = st.s % L;
    for (const r of C.rings) { let d = r.s - m; if (d < -L / 2) d += L; if (d > 0 && d < 30) spots.push([r.u, r.v]); }
    let best = -Infinity;
    for (const [u, v] of spots) { const w = worth(st, u, v, false, 1.5) + (u === bot.u && v === bot.v ? 0.6 : 0); if (w > best) { best = w; bot.u = u; bot.v = v; } }
    bot.burst = st.gauge > 0.04 && st.stun <= 0 && worth(st, bot.u, bot.v, true, 1.7) > best + 1;
  }
  towards(st, bot.u, bot.v, out); out.burst = bot.burst;
  return out;
}
/** One who does not steer. */
export function naiveInput(st, out = { x: 0, y: 0, burst: false }) { out.x = 0; out.y = 0; out.burst = false; return out; }

/** Flies a lap with `play` (the bot, unless told): { time (ms), hits, rings, top, over, rub }. */
export function botFlight(play = botInput, limit = 240) {
  const st = startFlight(), input = { x: 0, y: 0, burst: false };
  for (let t = 0; t < limit && !st.over; t += HOLLOW.step) { play(st, input); sub(st, HOLLOW.step, input, null); }
  return { time: st.time, hits: st.hits, rings: st.rings, top: st.top, over: st.over, rub: st.rub, s: st.s };
}
