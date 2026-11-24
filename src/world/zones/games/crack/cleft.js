// Between a Rock: its rules. No renderer here: the game, its checks and the climber that plays by itself all
// read this.
//
// A cleft runs up the sea cliff at the south end of the bay, forty metres from the planks at its foot to its
// lip. One goes up it from wall to wall: a kick off one wall carries across to the other, where one holds a
// moment — then slides. Who does nothing goes down. It gets harder with height, five stretches of eight metres,
// each ending at a net stretched across the cleft: one goes up through it, and it catches whoever falls.
//   The Squeeze         narrow, rough rock: every kick gains a good deal. Nothing to mind.
//   The Brambles        thorns on the walls, which throw off whoever lands in them: one has to choose where
//                       one lands — kick sooner or later, plain or steep
//   The Polish          wider; lengths of polished rock, where one hardly holds and slides fast
//   The Moss            wider still; wet moss, on which one does not hold at all
//   The Rain of Stones  the widest — a kick hardly gains a metre — and stones come down the walls
// A kick with "up" held is steeper: more height in a narrow place, less than nothing in a wide one. "Down" lets
// go: one slides fast, to kick from lower. A kick taken while sliding is weaker by half the speed of the slide:
// he who hesitates is lost. Whoever is thrown off flies back across; what they catch there is theirs to keep.
//
// Places: `x` metres across from the middle of the cleft (to the right, as one looks into it from the sea),
// `y` metres up it from the planks. The cleft leans back against the cliff (CLEFT.lean): see climbPose.
// Time advances in steps of 1/120 s whatever the frame rate.

export const CLEFT = {
  name: 'Between a Rock', place: 'The Cleft',
  at: { x: 115, z: 109.9 }, // the middle of the cleft at its foot; one looks into it from the north, over the water
  lean: (15 * Math.PI) / 180, // how far it leans back from upright, against the cliff
  floor: 1.3, // m above the sea: the planks one starts from
  back: 1.15, open: 0.5, // its back wall, so far behind the climber; and how it opens outwards: so much wider a metre nearer the sea
  // the planks: a landing before the cleft [x0, z0, x1, z1] and the walkway to it from the sand of the beach
  landing: [112.0, 106.0, 118.0, 108.55], way: { a: [98.6, 109.5], b: [112.3, 107.2], half: 0.75 },
  height: 40,
  sections: [
    { name: 'The Squeeze', to: 8, wide: 3.0 },
    { name: 'The Brambles', to: 16, wide: 3.4 },
    { name: 'The Polish', to: 24, wide: 3.8 },
    { name: 'The Moss', to: 32, wide: 4.3 },
    { name: 'The Rain of Stones', to: 40, wide: 4.8 },
  ],
  step: 1 / 120, g: 20,
  kick: [6.2, 8.2], high: [4.4, 9.4], off: [4.6, 8.4], // m/s across and up: a kick off a wall; the same with "up" held; a jump off a net
  body: 0.3, tall: 1.6, chest: 0.8,
  grip: { rock: 0.24, polish: 0.1, moss: 0 }, // s one holds where one lands before the slide begins
  slide: { rock: 1.5, polish: 3.2, moss: 5.5 }, // m/s down each kind of wall
  slip: 0.5, // a kick taken while sliding loses so much of the speed of the slide
  drop: 2.6, // letting go: so many times the slide
  walk: 2.4, // m/s on a net
  thrown: [4.4, 2.0], // thrown off: back across at so much, with a little hop
  rain: { every: 2.1, speed: 9, above: 8, from: 31.5, reach: 0.8 }, // a stone down one wall or the other every so many seconds of the world's clock
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hash = (n, k = 0) => { const s = Math.sin(n * 91.3 + k * 47.7 + 12.9) * 43758.5453; return s - Math.floor(s); };
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// What the walls are made of, from the planks up (the rest is rock): [from, to, kind] on the left wall and on
// the right one (as one looks into the cleft). The thorns never face one another, and leave the lip alone.
const LEFT = [
  [10.5, 11.4, 'thorn'], [13.7, 14.6, 'thorn'],
  [17.4, 19.2, 'polish'], [20.5, 21.3, 'thorn'], [22.0, 23.6, 'polish'],
  [25.2, 26.8, 'moss'], [28.1, 28.9, 'thorn'], [29.6, 31.3, 'moss'],
  [33.7, 34.4, 'thorn'], [35.0, 36.6, 'polish'], [37.5, 38.2, 'thorn'],
];
const RIGHT = [
  [12.0, 12.9, 'thorn'], [15.1, 15.8, 'thorn'],
  [18.2, 19.0, 'thorn'], [19.6, 21.5, 'polish'], [22.7, 23.4, 'thorn'],
  [24.6, 25.9, 'moss'], [26.9, 27.6, 'thorn'], [28.4, 30.2, 'moss'], [30.8, 31.5, 'thorn'],
  [32.8, 34.3, 'polish'], [35.6, 36.3, 'thorn'], [37.0, 38.5, 'polish'],
];

let laid = null;
/** The cleft, laid once: { patches: { '-1': [{ y0, y1, kind }], '1': […] }, nets: [y…] }. */
export function cleft() {
  if (laid) return laid;
  const list = (rows) => rows.map(([y0, y1, kind]) => ({ y0, y1, kind }));
  laid = { patches: { '-1': list(LEFT), 1: list(RIGHT) }, nets: CLEFT.sections.slice(0, -1).map((q) => q.to) };
  return laid;
}

/** How wide the cleft is at a height (m). */
export function wideAt(y) {
  const S = CLEFT.sections;
  let w = S[0].wide;
  for (let i = 1; i < S.length; i++) w += (S[i].wide - S[i - 1].wide) * smooth(S[i - 1].to - 1.2, S[i - 1].to + 1.2, y);
  return w;
}
/** Where a wall is at a height: how far from the middle (m, positive). */
export function wallAt(side, y) { return wideAt(y) / 2; }
/** What a wall is made of at a height: 'rock' | 'polish' | 'moss' | 'thorn'. */
export function kindAt(side, y) { for (const p of cleft().patches[side]) if (y >= p.y0 && y < p.y1) return p.kind; return 'rock'; }
/** The stretch a height is in (its number, from 0). */
export function sectionAt(y) { const n = CLEFT.sections.findIndex((q) => y < q.to); return n < 0 ? CLEFT.sections.length - 1 : n; }
/**
 * The stone that comes down a wall at `clock` (s of the world's clock), if one is on its way:
 * { n, side, y } or null. It is seen in the sky above the lip before it is in the cleft.
 */
export function rainAt(clock, out = {}) {
  const R = CLEFT.rain, n = Math.floor(clock / R.every), y = CLEFT.height + R.above - R.speed * (clock - n * R.every);
  if (y < R.from - 1.5) return null;
  out.n = n; out.side = hash(n) < 0.5 ? -1 : 1; out.y = y;
  return out;
}

/** A climber on the planks at the foot of the cleft: see stepClimb. `t0`: the clock of the world then (s). */
export function startClimb(t0 = 0) {
  return { x: 0, y: 0, vx: 0, vy: 0, side: 0, stand: true, face: 1, grip: 0, flung: false, clock: 0, acc: 0, t0, started: false, go: 0, over: false, time: 0, top: 0, base: 0, falls: 0, kicks: 0, want: 0, section: 0 };
}

/**
 * Advances a climb by `dt` seconds. `input`: { x (-1 left … 1 right: on a net one walks, and jumps that way),
 * y (1: a kick will be a steep one; -1: let go and slide fast), jump (true on the frame it is asked) }.
 * `events`: { type: 'go' | 'kick' (high) | 'hold' (kind) | 'net' (n: on a net, or on the planks: 0) | 'thorn' |
 * 'rain' | 'fall' (from, to) | 'section' (n) | 'top' (time) }.
 */
export function stepClimb(st, dt, input, events) {
  if (input?.jump) st.want = 0.14;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= CLEFT.step - 1e-9 && !st.over) { st.acc -= CLEFT.step; sub(st, CLEFT.step, input, events); }
  return st;
}

function thrown(st, away, events, type) {
  Object.assign(st, { side: 0, stand: false, vx: away * CLEFT.thrown[0], vy: CLEFT.thrown[1], grip: 0, flung: true });
  events?.push({ type });
}
function land(st, y, n, events) {
  if (st.top - y > 3) { st.falls++; events?.push({ type: 'fall', from: st.top, to: y }); }
  Object.assign(st, { y, vx: 0, vy: 0, side: 0, stand: true, flung: false, top: y, base: n });
  events?.push({ type: 'net', n });
}
/** Is the stone of the rain on a climber who is on the wall `side` at `y`? */
function stoned(st, side, y) {
  if (y < CLEFT.rain.from - 2) return false;
  const r = rainAt(st.t0 + st.clock, _r);
  return !!r && r.side === side && Math.abs(r.y - (y + CLEFT.chest)) < CLEFT.rain.reach;
}
const _r = {};

function sub(st, dt, input, events) {
  const C = CLEFT, L = cleft(), ix = clamp(input?.x || 0, -1, 1), iy = input?.y || 0;
  st.clock += dt;
  if (st.want > 0) st.want -= dt;
  if (st.stand) {
    // ---- on a net, or on the planks: a few steps either way, and off with a jump towards the wall one faces
    const half = wallAt(1, st.y + C.chest) - C.body;
    st.x = clamp(st.x + ix * C.walk * dt, -half, half);
    if (Math.abs(ix) > 0.3) st.face = ix < 0 ? -1 : 1;
    if (st.want > 0) {
      st.vx = st.face * C.off[0]; st.vy = C.off[1]; st.stand = false; st.side = 0; st.want = 0; st.kicks++;
      if (!st.started) { st.started = true; st.go = st.clock; events?.push({ type: 'go' }); }
      events?.push({ type: 'kick', off: true });
    }
    return;
  }
  const y0 = st.y;
  if (st.side) {
    // ---- on a wall: one holds a moment, then slides — faster letting go
    const kind = kindAt(st.side, st.y + C.chest);
    if (kind === 'thorn') { thrown(st, -st.side, events, 'thorn'); return; }
    if (stoned(st, st.side, st.y)) { thrown(st, -st.side, events, 'rain'); return; }
    if (st.grip > 0) st.grip -= dt;
    const down = st.grip > 0 ? 0 : C.slide[kind] * (iy < -0.5 ? C.drop : 1);
    st.vy += clamp(-down - st.vy, -14 * dt, 14 * dt);
    st.y += st.vy * dt;
    st.x = st.side * (wallAt(st.side, st.y + C.chest) - C.body);
    if (st.want > 0) {
      // a kick: across to the other wall, and up — steeper with "up" held, weaker for the slide one is in
      const k = iy > 0.4 ? C.high : C.kick;
      st.vx = -st.side * k[0]; st.vy = k[1] + C.slip * Math.min(0, st.vy); st.face = -st.side; st.side = 0; st.want = 0; st.kicks++;
      events?.push({ type: 'kick', high: k === C.high });
    }
  } else {
    // ---- in the air
    st.vy -= C.g * dt;
    st.x += st.vx * dt; st.y += st.vy * dt;
    for (const side of [-1, 1]) {
      const reach = wallAt(side, st.y + C.chest) - C.body;
      if (st.x * side < reach || st.y <= 0) continue;
      st.x = side * reach;
      const kind = kindAt(side, st.y + C.chest);
      if (kind === 'thorn') { thrown(st, -side, events, 'thorn'); return; }
      if (stoned(st, side, st.y)) { thrown(st, -side, events, 'rain'); return; }
      st.side = side; st.vx = 0; st.vy *= st.vy > 0 ? 0.15 : 0.3; st.grip = C.grip[kind]; st.flung = false;
      events?.push({ type: 'hold', kind });
    }
  }
  // ---- a net is in the way down, never in the way up; and so are the planks
  if (st.y < y0) {
    for (let n = L.nets.length - 1; n >= 0; n--) if (y0 >= L.nets[n] && st.y < L.nets[n]) { land(st, L.nets[n], n + 1, events); return; }
    if (st.y <= 0) { land(st, 0, 0, events); return; }
  }
  // ---- how high: the stretch one is in, the lip
  if (st.y > st.top) st.top = st.y;
  const n = sectionAt(st.y);
  if (n > st.section) { st.section = n; events?.push({ type: 'section', n }); }
  if (st.y >= C.height - 0.2 && (st.side || st.vy > 0)) { st.over = true; st.time = Math.round((st.clock - st.go) * 1000); events?.push({ type: 'top', time: st.time }); }
}

/**
 * Where a climber is in the world: { x, y, z } (their feet). The cleft leans back: a metre up it is a little
 * less than a metre up, and a little way into the cliff.
 */
export function climbPose(st, out = {}) { return cleftPoint(st.x, st.y, 0, out); }
/** A place of the cleft in the world: `x` across, `y` up it, `d` out of it towards the sea (m). */
export function cleftPoint(x, y, d = 0, out = {}) {
  const C = CLEFT, s = Math.sin(C.lean), c = Math.cos(C.lean);
  out.x = C.at.x - x; out.y = C.floor + y * c + d * s; out.z = C.at.z + y * s - d * c;
  return out;
}

const NONE = { x: 0, y: 0, jump: false };
const copy = (st) => ({ ...st, acc: 0 });
/**
 * Where a kick taken now would end: { side, x, y (of the feet), kind: what one meets there — 'rock' | 'polish' |
 * 'moss' | 'thorn' | 'rain' | 'net' | 'top' }, or null in the air. `high`: a steep kick. This is what the
 * marks on the walls show: one reads the way up before taking it.
 */
export function kickMark(st, high, out = {}) {
  if (st.over || (!st.side && !st.stand)) return null;
  const q = copy(st), events = [], ask = { x: st.stand ? st.face : 0, y: high ? 1 : 0, jump: true };
  q.want = 0;
  for (let t = 0; t < 1.9; t += CLEFT.step) {
    const x = q.x, y = q.y;
    events.length = 0;
    stepClimb(q, CLEFT.step, t === 0 ? ask : NONE, events);
    const e = events.find((v) => v.type === 'hold' || v.type === 'thorn' || v.type === 'rain' || v.type === 'net' || v.type === 'top');
    if (!e) continue;
    out.kind = e.type === 'hold' ? e.kind : e.type; out.side = e.type === 'net' ? 0 : Math.sign(x) || 1; out.x = x; out.y = e.type === 'net' ? q.y : y;
    return out;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------- climbers that play by themselves

const PLAYS = [{ jump: true }, { jump: true, high: true }, { wait: 0.1 }, { wait: 0.25 }, { wait: 0.2, drop: true }, { jump: true, x: -1 }, { jump: true, x: 1 }];
const can = (st, p) => (st.stand ? !!p.x : !p.x);
/** Plays `play` on a copy, until the climber holds a wall or stands again (or `limit` seconds have gone). */
function after(st, play, limit = 2.2) {
  const q = copy(st);
  if (play.wait) { for (let t = 0; t < play.wait && !q.over && q.side; t += CLEFT.step) stepClimb(q, CLEFT.step, { x: 0, y: play.drop ? -1 : 0, jump: false }, null); return q; }
  const inp = { x: play.x || 0, y: play.high ? 1 : 0, jump: false };
  if (play.x) stepClimb(q, CLEFT.step, inp, null);
  inp.jump = true; stepClimb(q, CLEFT.step, inp, null); inp.jump = false; inp.x = 0;
  for (let t = 0; t < limit && !q.over && !(t > 0.04 && (q.side || q.stand)); t += CLEFT.step) stepClimb(q, CLEFT.step, inp, null);
  return q;
}
/** How good a place a climber is in: how high, less the time it took; with `depth` more plays looked into. */
function worth(st, depth) {
  if (st.over) return 100 - st.clock * 0.35;
  if (depth <= 0 || (!st.side && !st.stand)) return st.y - st.clock * 0.35 - (st.side && kindAt(st.side, st.y + CLEFT.chest) !== 'rock' ? 0.6 : 0);
  let best = -Infinity;
  for (const p of PLAYS) if (can(st, p)) best = Math.max(best, worth(after(st, p), depth - 1));
  return best;
}
/**
 * A climber that plays by itself — the proof that the cleft can be climbed. Each time it holds a wall or stands
 * on a net it weighs a plain kick, a steep one, sliding a little and letting go, three plays ahead.
 */
export function botInput(st, out = { x: 0, y: 0, jump: false }) {
  out.x = 0; out.y = 0; out.jump = false;
  if (st.over || (!st.side && !st.stand)) return out;
  const bot = st.bot || (st.bot = { until: 0, play: null });
  if (st.clock < bot.until) { if (bot.play?.wait) out.y = bot.play.drop ? -1 : 0; else if (bot.play) { out.x = bot.play.x || 0; out.y = bot.play.high ? 1 : 0; } return out; }
  let best = null, top = -Infinity;
  for (const p of PLAYS) { if (!can(st, p)) continue; const w = worth(after(st, p), 2); if (w > top) { top = w; best = p; } }
  bot.play = best;
  if (best.wait) { bot.until = st.clock + best.wait; out.y = best.drop ? -1 : 0; return out; }
  out.x = best.x || 0; out.y = best.high ? 1 : 0; out.jump = true; bot.until = st.clock + 0.03;
  if (st.stand && best.x) st.face = best.x;
  return out;
}
/** One who only knows the kick, and kicks the moment a wall is held: what the cleft does to who does not read it. */
export function naiveInput(st, out = { x: 0, y: 0, jump: false }) {
  out.x = 0; out.y = 0; out.jump = !st.over && (!!st.side || st.stand);
  if (st.stand) out.x = st.x > 0 ? -1 : 1;
  return out;
}

/** Climbs with `play` (the bot, unless told) from `t0` of the world's clock: { time (ms), top (m), falls, kicks, over, thrown }. */
export function botClimb(t0 = 0, limit = 240, play = botInput) {
  const st = startClimb(t0), input = { x: 0, y: 0, jump: false }, events = [];
  let flung = 0;
  for (let t = 0; t < limit && !st.over; t += CLEFT.step) { play(st, input); events.length = 0; stepClimb(st, CLEFT.step, input, events); for (const e of events) if (e.type === 'thorn' || e.type === 'rain') flung++; }
  return { time: st.time, top: Math.max(st.top, st.y), falls: st.falls, kicks: st.kicks, over: st.over, thrown: flung, clock: st.clock };
}
