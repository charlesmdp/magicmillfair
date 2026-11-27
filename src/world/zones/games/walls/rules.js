// Run the Walls: its rules. No renderer here: the game, its checks and the runner that plays by itself all
// read this.
//
// A ruin of pale stone stands on a rock in the sea, and one crosses it from its foot to the top of its tower by
// what its walls allow. The way winds round it and inwards like a snail's shell, three hundred metres of it,
// always the wall on the left and the sky on the right. One runs as the stick asks and jumps with the one
// button; the rest is what the stone is painted for:
//   a band of BLUE stone along a wall   run along this: jump at it at a run and one runs on along it, in a
//                                       shallow arc, for a little over a second — over what no jump crosses.
//                                       The button kicks off it, to the wall across when there is one
//   a face of GREEN stone across the way  climb this: run straight at it and one runs two or three steps up
//                                       it, catches its edge and pulls up — no button. An edge one falls just
//                                       short of is caught the same way
//   a GOLD bar across a gap             swing round this: jump into it, and the button lets go — thrown far
//   RED                                 this hurts: blades that swing across, spikes that come up in time
//   pale cracked slabs                  give way a moment after one sets foot on them: one keeps running
//   a ledge along the wall              shuffled along, the back to the stone: nobody steps off its side
// And time winds back: a fall, a blade, a spike — and one's robot goes back along its own path to the last
// sure footing, and goes on from there. Three such in reserve, filled again at each save (there are twelve, one
// at the head of each stretch); with none left, it is back to the last save. The clock never stops: what a
// mistake costs is time. It starts with the first step.
//
// Places: `s` metres along the way from its start, `u` metres across it from its middle (positive: to the right
// of who runs, the open side; the wall is at -half), `y` metres over the foot of the ruin. Time advances in steps
// of 1/120 s whatever the frame rate. What moves keeps time on the clock everybody shares.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const frac = (v) => v - Math.floor(v);

export const WALLS = {
  name: 'Run the Walls',
  at: { x: 258, z: 100 }, // the middle of the ruin, in the sea off the south beach
  gate: { x: 64, z: 84 }, // where one asks to run: on the sand of the south beach, the ruin in sight across the water
  base: 6, // m over the sea: the foot of the way
  half: 1.7, reach: 1.45, // the way: half its width; how far from its middle one goes (the wall, a kerb)
  // its plan: a snail's shell of straight sides, each turned left into the next by a quarter circle
  plan: { a: 42, b: 30, inset: 7.5, r: 5, sides: 9 },
  // the top of the wall on the left of each side (m over the foot of the ruin): the terrace the next lap in stands on;
  // the turret at a corner rises `turret` over the higher of its two walls
  tops: [7, 11, 14.9, 14.9, 17, 27.5, 27.5, 27.5, 27.5], turret: 2.6,
  step: 1 / 120,
  speed: 7, back: 3.2, start: 0.22, stop: 0.18, // m/s forward, backward; s from standing to that speed, and back
  side: 4.6, accel: 40, // across: m/s, m/s²
  g: 24, jump: 8.4, leap: 6, push: 10, // m/s²; m/s up; the least a jump with the stick up goes forward; m/s² the stick adds in the air
  coyote: 0.25, buffer: 0.18, // s after an edge (or a wall) during which a jump is still a jump; s a press asked too early is kept
  edge: 0.2, lip: 0.36, // m a foot may be over an edge; the step one walks up
  wall: { t: 1.15, v: 7.4, g: 5.2, up: [1.6, 3.4], touch: 0.5, least: 2.5, kick: [5.4, 7.6], lock: 0.8, lead: 0.7 }, // a run along a wall: s it lasts, m/s, how it sags, the speed up it begins with, how near the wall one must be, the least speed, the kick (across, up), s the kick carries one across whatever the stick says, m before the band one may take it
  climb: { v: 6.2, reach: 3.5, hands: 1.05, pull: 0.3, in: 0.55 }, // up a wall: m/s, the highest edge caught from below, how far under an edge the hands catch it, s to pull up, m beyond the face one stands then
  pole: { up: 2.35, catch: 0.75, lo: 2.15, hi: 0.15, hang: 1.35, least: 0.16, v: 7.8, vy: 6.6 }, // a bar: m over the floor before it; how near, how far under it it is caught; where one hangs; s before one can let go; how one is thrown
  crumble: 0.6, shuffle: 3.4, // s a slab that gives way holds; m/s along a ledge
  fall: 3.6, down: 0.6, ready: 0.2, // m under the last footing a fall is a fall; s on the ground with no rewind left; s before the legs answer again
  rewinds: 3, trail: 4, wind: 2, // in reserve; a place kept every so many steps; how fast time runs back
  tall: 1.3, along: 0.28, across: 0.22, // a runner
  cam: { back: 6.2, out: 3.5, up: 3.3, ahead: 1.8, hall: { out: 0.3, up: 5.4 } }, // the camera: behind, on the open side, above — between two walls it comes in over the middle of the way
  names: ['First Steps', 'Along the Wall', 'Up the Wall', 'Wall to Wall', 'The Bars', 'Blades and Spikes', 'Giving Way', 'The Ledge', 'Run and Climb', 'The Roofless Hall', 'Thin Ice', 'The Tower'],
};
const S = WALLS, H = S.half, R = S.reach;

// ---------------------------------------------------------------------------
// The plan: where metre `s` of the way is in the world
const PIECES = (() => {
  const { a, b, inset, r, sides } = S.plan, list = [];
  // (the first side runs south along the west face — the one the beach sees —, then east, north, west, and inwards)
  let x = -(b / 2 + r), z = -a / 2, dx = 0, dz = 1, s = 0;
  for (let k = 0; k < sides; k++) {
    const len = (k % 2 ? b : a) - inset * (k < 3 ? 0 : Math.floor((k - 1) / 2)); // (each lap is `inset` inside the one before)
    list.push({ kind: 'line', s0: s, s1: s + len, x, z, dx, dz });
    x += dx * len; z += dz * len; s += len;
    if (k === sides - 1) break;
    // (a quarter turn to the left: its middle is `r` to the left)
    const lx = dz, lz = -dx, cx = x + lx * r, cz = z + lz * r, arc = (Math.PI / 2) * r;
    list.push({ kind: 'arc', s0: s, s1: s + arc, cx, cz, dx, dz, lx, lz, r });
    x = cx + dx * r; z = cz + dz * r; s += arc;
    [dx, dz] = [lx, lz];
  }
  return list;
})();
/** Where the sides and the corners of the way begin and end (metres along it). */
export const PLAN = PIECES.map((p) => ({ kind: p.kind, s0: p.s0, s1: p.s1 }));
/** Where a place of the way is in the world: { x, z, yaw (the way one runs there), dx, dz } — `u` across, to the right. */
export function placeAt(s, u = 0, out = {}) {
  let p = PIECES[0];
  for (const q of PIECES) { p = q; if (s < q.s1) break; }
  let x, z, dx, dz;
  if (p.kind === 'line') { const d = s - p.s0; dx = p.dx; dz = p.dz; x = p.x + dx * d; z = p.z + dz * d; }
  else {
    const a = (s - p.s0) / p.r, c = Math.cos(a), n = Math.sin(a);
    dx = p.dx * c + p.lx * n; dz = p.dz * c + p.lz * n;
    x = p.cx - (p.lx * c - p.dx * n) * p.r; z = p.cz - (p.lz * c - p.dz * n) * p.r;
  }
  // (to the right of who runs: (-dz, dx))
  out.x = S.at.x + x - dz * u; out.z = S.at.z + z + dx * u; out.dx = dx; out.dz = dz; out.yaw = Math.atan2(dx, dz);
  return out;
}

// ---------------------------------------------------------------------------
// The course. Every thing has { kind, s0, s1 } and, by kind:
//   floor   { y0, y1, u0, u1, form }: what one stands on (y0 ≠ y1: worn steps); form 'crumble' gives way,
//           'ledge' is a ledge along the wall
//   face    { s, y0, y1 }: where the floor steps up — climbed (it is what the floors say; kept for who draws it)
//   wall    { side (-1 the wall on the left, 1 one that stands on the right), y0, y1 }: a band one runs along
//   pole    { s, y }: a bar across the way
//   blade   { s, period, phase, mid, amp, y }: a blade that swings across the way
//   spikes  { u0, u1, period, phase, share, y }: spikes that come up through the floor `share` of the time
let made = null;
export function course() {
  if (made) return made;
  const things = [], saves = [], halls = [];
  const add = (o) => { o.id = things.length; things.push(o); return o; };
  let s = 0, y = 0;
  const floor = (len, o) => { if (len > 1e-6) add({ kind: 'floor', s0: s, s1: s + len, y0: y, y1: y, u0: -H, u1: H, ...o }); s += Math.max(0, len); };
  const to = (at, o) => floor(at - s, o);
  const gap = (len) => { s += len; };
  const up = (h) => { add({ kind: 'face', s, s0: s - 0.3, s1: s + 0.3, y0: y, y1: y + h }); y += h; };
  const stairs = (len, h) => { add({ kind: 'floor', form: 'stairs', s0: s, s1: s + len, y0: y, y1: y + h, u0: -H, u1: H }); s += len; y += h; };
  const band = (side, a, b, hi = 3.6) => { const t = add({ kind: 'wall', side, s0: a, s1: b, y0: y + 0.35, y1: y + hi }); if (side > 0) halls.push([a, b]); return t; };
  const pole = (at) => add({ kind: 'pole', s: at, s0: at - 0.8, s1: at + 0.8, y: y + S.pole.up });
  const crumble = (n, len = 1.3) => { for (let k = 0; k < n; k++) floor(len, { form: 'crumble' }); };
  const ledge = (len, w = 0.85) => floor(len, { form: 'ledge', u1: -H + w });
  const spikes = (a, len, period, phase, u0 = -H, u1 = H) => add({ kind: 'spikes', s0: a, s1: a + len, u0, u1, period, phase, share: 0.42, y });
  const blade = (at, period, phase, mid = 0, amp = 2.5) => add({ kind: 'blade', s: at, s0: at - 0.4, s1: at + 0.4, period, phase, mid, amp, y });
  const save = (at = s + 1.2) => saves.push({ s: at, y, n: saves.length, name: S.names[saves.length] });
  const corner = (k) => { const p = PLAN.filter((q) => q.kind === 'arc')[k]; to(p.s0); stairs(p.s1 - p.s0, 1); };

  // ---- 1 · First Steps: a hole, a step one runs up, a wider hole
  save(1.5); floor(8); gap(2.2); floor(4.3); up(1); floor(4); gap(2.8); floor(2.7);
  // ---- 2 · Along the Wall: two gaps no jump crosses, a band of blue stone along each
  save(); to(28.5); band(-1, 27.3, 36.2); gap(6.5); corner(0);
  to(52); band(-1, 50.8, 60.7); gap(7.5); floor(3.5);
  // ---- 3 · Up the Wall: faces of green stone, the last one beyond a hole
  save(60.7); to(64); up(2.6); floor(5); up(3); floor(4); gap(2.6); up(1.3); corner(1);
  // ---- 4 · Wall to Wall: a wall stands on the right as well — kick from one to the other
  save(); to(91.5); band(-1, 90.3, 99.5, 4.6); band(1, 101, 109, 4.6); gap(16); floor(4);
  // ---- 5 · The Bars: a gold bar over each gap
  save(108.6); pole(114.6); gap(7.5); floor(2.8); pole(124.9); gap(7.2); corner(2);
  // ---- 6 · Blades and Spikes: what keeps time
  save(); spikes(142, 2.2, 2.4, 0); blade(148, 2.6, 0.2); spikes(151.5, 2.2, 2.4, 0.5); blade(156.5, 2.6, 0.55); corner(3);
  // ---- 7 · Giving Way: slabs that hold a moment
  save(); to(171); crumble(5); gap(2.4); crumble(3); floor(2.2);
  // ---- 8 · The Ledge: along the wall over nothing, a blade that reaches it
  save(184.6); ledge(9); blade(190.5, 2.8, 0.1, 0.7, 2.1); floor(3);
  // ---- 9 · Run and Climb: off the wall, onto a landing, up a face
  up(2.8); corner(4);
  save(); to(212.5); band(-1, 211.3, 220.2); gap(6.5); floor(3); up(2.8); corner(5);
  // ---- 10 · The Roofless Hall: wall to wall to wall
  save(); to(236); band(-1, 234.8, 242, 6.6); band(1, 244.2, 251.5, 6.6); band(-1, 250.5, 259, 6.6); gap(22); corner(6);
  // ---- 11 · Thin Ice: slabs that give way under a blade — one waits before them, not on them
  save(268.9); to(269.6); crumble(4); blade(272.3, 2.6, 0.3); corner(7);
  // ---- 12 · The Tower: up a face, a bar to a higher floor, up the last face
  save(); to(285.5); up(3); floor(3); pole(291.4); gap(6.5); up(1.2); floor(2.2); up(3); floor(5);

  const length = 300;
  const cells = [];
  for (let i = 0; i <= Math.ceil((length + 8) / 4) + 1; i++) cells.push(things.filter((t) => t.s1 > i * 4 - 3 && t.s0 < i * 4 + 7));
  made = { things, cells, saves, halls, length, top: y };
  return made;
}
export const LENGTH = 300;
const NONE = [];
const near = (s) => course().cells[Math.max(0, Math.floor(s / 4))] || NONE;
/** Which stretch metre `s` is in (0 for the first). */
export function stretchOf(s) { const v = course().saves; let k = 0; for (let i = 0; i < v.length; i++) if (s >= v[i].s - 1.5) k = i; return k; }
/** How much the way is a hall at metre `s` (0 … 1): a wall stands on the right there — the camera comes in between the two. */
export function hallAt(s) {
  let k = 0;
  const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
  for (const [a, b] of course().halls) k = Math.max(k, Math.min(smooth((s - (a - 10)) / 8), smooth(((b + S.cam.back + 6.5) - s) / 6)));
  return k;
}

// ---- what moves, by the clock everybody shares (`now`: seconds)
/** Where across the way the head of a blade is. */
export const bladeAt = (t, now) => t.mid + t.amp * Math.sin((TAU * now) / t.period + t.phase * TAU);
/** How far the spikes are out (0 in the floor … 1 up): up `share` of the time, their points showing a moment before. */
export function spikesAt(t, now) {
  const p = frac(now / t.period + t.phase);
  return p < t.share ? Math.min(1, p / 0.04) : p < t.share + 0.06 ? 1 - (p - t.share) / 0.06 : p > 0.84 ? 0.16 * Math.min(1, (p - 0.84) / 0.04) : 0;
}

// ---------------------------------------------------------------------------
// A run

/** When runner `st` first set foot on the slab `id` that gives way (s of its run), or undefined. */
export const trodAt = (st, id) => { for (const k of st?.trod || NONE) if (k.id === id) return k.at; return undefined; };
const gone = (st, t) => { const at = trodAt(st, t.id); return at !== undefined && st.total - at >= S.crumble; };
const _f = { y: -Infinity, t: null };
/** What is under a place: the height of the floor there (-Infinity over nothing — or over a slab that gave way under `st`). `floorAt.t`: that floor. */
export function floorAt(s, u, st) {
  const e = S.edge;
  let top = -Infinity; _f.t = null;
  for (const t of near(s)) {
    if (t.kind !== 'floor' || s < t.s0 - e || s > t.s1 + e || u < t.u0 - e || u > t.u1 + e) continue;
    if (t.form === 'crumble' && st && gone(st, t)) continue;
    const y = t.y0 === t.y1 ? t.y0 : lerp(t.y0, t.y1, clamp((s - t.s0) / (t.s1 - t.s0), 0, 1));
    if (y > top) { top = y; _f.t = t; }
  }
  _f.y = top;
  return top;
}
const wallFor = (st, d, slack = 0) => { for (const t of near(st.s)) if (t.kind === 'wall' && t.side === d && st.s >= t.s0 - S.wall.lead - slack && st.s <= t.s1 + slack && st.y >= t.y0 - 0.75 && st.y <= t.y1 + 0.4) return t; return null; };

/** Is the runner on a ledge, the back to the stone? */
export const onLedge = (st) => st.mode === 'ground' && (floorAt(st.s, st.u, st), _f.t)?.form === 'ledge';

/** A runner at the start, standing. `t0`: the shared clock then (s). The clock of the run waits for the first step. */
export function startRun(t0 = 0) {
  const c = course();
  return {
    s: c.saves[0].s, u: 0, y: 0, vs: 0, vu: 0, vy: 0, mode: 'ground', side: 0, wt: 0, coy: 0, wcoy: 0, wside: 0, kick: 0, lastWall: 0, lastPole: -1, pole: -1, pt: 0,
    top: 0, face: 0, ct: 0, cy: 0, gy: 0, gt: 0, sprung: false, want: 0, wait: 0, down: 0, why: '', home: 0, rew: S.rewinds, used: 0, outs: 0, homes: 0,
    going: false, clock: 0, total: 0, t0, n: 0, acc: 0, best: 0, over: false, time: 0, trod: [], trail: [], ri: 0, rf: 0, rs: 1, rm: 'ground',
  };
}
/** How far a run has come (0 … 1): what its music follows. */
export const heatOf = (st) => clamp(Math.max(st?.s || 0, st?.best || 0) / LENGTH, 0, 1);
/** The time nobody can beat (ms): the whole way at the speed a bar throws one at, the fastest there is. */
export const fastest = () => Math.round((LENGTH - course().saves[0].s) / S.pole.v * 1000);
/** Its line for the boards of scores: the time from the first step to the top of the tower (ms), the lower the better. */
export const BOARD = { order: 'asc', min: Math.floor(fastest() / 1000) * 1000, max: 1800_000 };

/**
 * Advances a run by `dt` seconds. `input`: { run (-1 back … 1 forward), side (-1 towards the wall … 1 towards the
 * open side), jump (true on the frame the button goes down) }. `events`, when given, is filled with what happened:
 * { type: 'go' | 'jump' | 'land' | 'wall' (side) | 'kick' | 'off' (a wall let go of) | 'climb' | 'catch' (an edge)
 * | 'up' (pulled up) | 'bar' | 'swing' | 'tread' (a slab that gives way) | 'out' (why: 'fall' | 'blade' |
 * 'spikes'; s) | 'rewind' (left) | 'back' (s) | 'home' (back at a save: s) | 'save' (n, name) | 'end' (time) }.
 */
export function stepRun(st, dt, input, events) {
  if (input?.jump) st.want = S.buffer;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= S.step - 1e-9 && !st.over) { st.acc -= S.step; sub(st, S.step, input, events); }
  return st;
}

function jumpOff(st, run, events) {
  st.vy = S.jump; st.mode = 'air'; st.coy = 0; st.wcoy = 0; st.want = 0; st.sprung = true;
  if (run > 0.3) st.vs = Math.max(st.vs, S.leap * run);
  events?.push({ type: 'jump' });
}
function kickOff(st, d, events) {
  st.vy = S.wall.kick[1]; st.vu = -d * S.wall.kick[0]; st.vs = Math.max(st.vs, S.wall.v); st.mode = 'air'; st.kick = S.wall.lock; st.lastWall = d; st.wcoy = 0; st.coy = 0; st.want = 0; st.sprung = true;
  events?.push({ type: 'kick', side: d });
}
function climbUp(st, top, face, events) {
  st.mode = 'climb'; st.top = top; st.face = face; st.ct = 0; st.cy = st.y; st.vs = st.vu = st.vy = 0; st.s = face; st.want = 0;
  events?.push({ type: top - st.y <= S.climb.hands ? 'catch' : 'climb' });
}
function land(st, G, events) {
  st.y = G; st.vy = 0; st.mode = 'ground'; st.lastWall = 0; st.lastPole = -1; st.kick = 0; st.wcoy = 0; st.gt = 0;
  events?.push({ type: 'land' });
}

function sub(st, dt, input, events) {
  st.n++; st.total += dt;
  const now = st.t0 + st.total, C = course();
  if (st.going) st.clock += dt;
  if (st.mode === 'rewind') {
    // ---- time winds back: along one's own path, to the last sure footing
    const T = st.trail;
    st.rf += dt * (120 / S.trail) * st.rs;
    const i = st.ri - st.rf;
    if (i <= 0) {
      const p = T[0];
      Object.assign(st, { s: p.s, u: p.u, y: p.y, vs: 0, vu: 0, vy: 0, mode: 'ground', wait: S.ready, lastWall: 0, lastPole: -1, kick: 0, coy: 0, wcoy: 0, want: 0, gy: p.y, gt: 0, trod: [], trail: [p] });
      events?.push({ type: 'back', s: p.s });
    } else {
      const a = T[Math.floor(i)], b = T[Math.min(T.length - 1, Math.floor(i) + 1)], k = i - Math.floor(i);
      st.s = lerp(a.s, b.s, k); st.u = lerp(a.u, b.u, k); st.y = lerp(a.y, b.y, k); st.rm = a.m;
    }
    return;
  }
  if (st.down > 0) {
    // ---- no rewind left: a moment, then the last save
    st.down -= dt;
    if (st.why === 'fall') { st.vy -= S.g * dt; st.y += st.vy * dt; }
    if (st.down <= 0) {
      const v = C.saves[st.home];
      Object.assign(st, { s: v.s, u: 0, y: v.y, vs: 0, vu: 0, vy: 0, mode: 'ground', wait: S.ready, lastWall: 0, lastPole: -1, kick: 0, coy: 0, wcoy: 0, want: 0, gy: v.y, gt: 0, trod: [], rew: S.rewinds, homes: st.homes + 1 });
      if (st.trail) st.trail = [];
      events?.push({ type: 'home', s: v.s, n: st.home });
    }
    return;
  }
  if (st.wait > 0) { st.wait -= dt; st.want = 0; return; }
  const run = clamp(input?.run || 0, -1, 1), side = clamp(input?.side || 0, -1, 1);
  if (st.want > 0) st.want -= dt;
  if (!st.going && (Math.abs(run) > 0.05 || Math.abs(side) > 0.05 || st.want > 0)) { st.going = true; events?.push({ type: 'go' }); }
  const s0 = st.s;

  if (st.mode === 'ground') {
    const F = (floorAt(st.s, st.u, st), _f.t), ledge = F?.form === 'ledge', full = ledge ? S.shuffle : S.speed;
    const want = run >= 0 ? run * full : run * Math.min(S.back, full);
    if (want > st.vs) st.vs = Math.min(want, st.vs + (S.speed / S.start) * dt); else st.vs = Math.max(want, st.vs - (S.speed / S.stop) * dt);
    st.vu += clamp(side * S.side - st.vu, -S.accel * dt, S.accel * dt);
    st.gt += dt; st.gy = st.y;
    if (st.want > 0) jumpOff(st, run, events);
    else {
      st.s = Math.max(0.3, st.s + st.vs * dt); st.u += st.vu * dt;
      // (the wall on the left, a kerb on the right; on a ledge, the stone at one's back and nothing to step into)
      const lo = -R, hi = ledge && st.s > F.s0 - S.edge && st.s < F.s1 + S.edge ? F.u1 - 0.2 : R;
      if (st.u < lo) { st.u = lo; if (st.vu < 0) st.vu = 0; } else if (st.u > hi) { st.u = hi; if (st.vu > 0) st.vu = 0; }
      const G = floorAt(st.s, st.u, st);
      if (G > st.y + S.lip) {
        // (a face: run at, it is run up — its edge within reach; else it stops one)
        if (G - st.y <= S.climb.reach && (st.vs > 1.5 || run > 0.3)) climbUp(st, G, s0, events); else { st.s = s0; st.vs = 0; }
      } else if (G < st.y - S.lip) { st.mode = 'air'; st.vy = 0; st.coy = S.coyote; st.sprung = false; } // (off an edge: a jump is still a jump for a moment)
      else {
        st.y = G;
        const t = _f.t;
        if (t?.form === 'crumble' && trodAt(st, t.id) === undefined) { st.trod = st.trod.filter((k) => k.s1 > st.s - 4); st.trod.push({ id: t.id, at: st.total, s1: t.s1 }); events?.push({ type: 'tread', id: t.id }); }
      }
    }
  } else if (st.mode === 'air') {
    const want = run * S.speed;
    if (want > st.vs) st.vs = Math.min(want, st.vs + S.push * dt); else if (run < -0.2 && want < st.vs) st.vs = Math.max(want * 0.5, st.vs - S.push * dt);
    if (st.kick > 0) st.kick -= dt;
    else {
      // (beside a band, a jump is drawn to the wall unless the stick says otherwise: one need not aim at the stone)
      let pull = 0;
      if (st.sprung && st.vs >= S.wall.least) for (const d of [-1, 1]) if (!pull && st.lastWall !== d && side * d > -0.3 && wallFor(st, d)) pull = d;
      st.vu += clamp((pull || side) * S.side - st.vu, -S.accel * dt, S.accel * dt);
    }
    if (st.coy > 0) st.coy -= dt;
    if (st.wcoy > 0) st.wcoy -= dt;
    if (st.want > 0 && st.coy > 0) { st.y = Math.max(st.y, st.gy - 0.05); jumpOff(st, run, events); }
    else if (st.want > 0 && st.wcoy > 0) kickOff(st, st.wside, events);
    const y0 = st.y;
    st.vy -= S.g * dt; st.y += st.vy * dt; st.s = Math.max(0.3, st.s + st.vs * dt); st.u += st.vu * dt;
    if (st.u < -R) { st.u = -R; if (st.vu < 0) st.vu = 0; } else if (st.u > R) { st.u = R; if (st.vu > 0) st.vu = 0; }
    // ---- a bar: caught as one comes to it
    let done = false;
    for (const t of near(st.s)) {
      if (t.kind !== 'pole' || t.id === st.lastPole || Math.abs(st.s - t.s) > S.pole.catch || st.y < t.y - S.pole.lo || st.y > t.y - S.pole.hi) continue;
      st.mode = 'pole'; st.pole = t.id; st.pt = 0; st.s = t.s; st.y = t.y - S.pole.hang; st.vs = st.vu = st.vy = 0; st.kick = 0; st.lastWall = 0; st.gy = t.y - S.pole.up;
      events?.push({ type: 'bar' }); done = true; break;
    }
    // ---- a wall with a band: taken at a run, when one is against it
    if (!done && st.sprung && st.vs >= S.wall.least) for (const d of [-1, 1]) {
      if (st.lastWall === d || d * st.u < R - S.wall.touch) continue;
      const t = wallFor(st, d);
      if (!t || st.s < t.s0 - S.wall.lead) continue;
      st.mode = 'wall'; st.side = d; st.wt = 0; st.u = d * R; st.vu = 0; st.vy = clamp(st.vy, S.wall.up[0], S.wall.up[1]); st.vs = Math.max(st.vs, S.wall.v); st.kick = 0; st.lastPole = -1;
      events?.push({ type: 'wall', side: d }); done = true; break;
    }
    if (!done) {
      const G = floorAt(st.s, st.u, st);
      if (G > st.y + S.lip && !(y0 >= G - S.lip && st.vy <= 0)) {
        // (the face of a floor: its edge is caught when within reach of the hands — or run up, from further down)
        // (run up from a jump at its foot, where there is a floor to jump from; over nothing, only what the hands reach)
        const foot = floorAt(s0, st.u, st) >= st.gy - 0.5;
        if (st.vs > -0.5 && (G - st.y <= S.climb.hands + 0.25 || (foot && G - st.y <= S.climb.reach))) climbUp(st, G, s0, events); else { st.s = s0; st.vs = 0; }
      } else if (G > -Infinity && st.y <= G && st.vy <= 0) land(st, G, events);
      if (st.mode === 'air' && st.y < st.gy - S.fall) return out(st, 'fall', events);
    }
  } else if (st.mode === 'wall') {
    const d = st.side, W = S.wall;
    st.wt += dt; st.vy -= W.g * dt; st.y += st.vy * dt; st.s += st.vs * dt;
    const t = wallFor(st, d, 0.05);
    if (t && st.y > t.y1) { st.y = t.y1; if (st.vy > 0) st.vy = 0; }
    const G = floorAt(st.s, st.u, st);
    if (st.want > 0) kickOff(st, d, events);
    else if (G > st.y + S.lip) { if (G - st.y <= S.climb.hands + 0.25) climbUp(st, G, s0, events); else { st.s = s0; st.vs = 0; st.mode = 'air'; st.lastWall = d; } }
    else if (G > -Infinity && st.y <= G) land(st, G, events);
    else if (!t || st.wt >= W.t || side * d < -0.6) {
      // (the band ends, or the legs do, or the stick asks: off it — the button still kicks for a moment)
      st.mode = 'air'; st.lastWall = d; st.wcoy = S.coyote; st.wside = d; st.vu = -d * 0.5;
      events?.push({ type: 'off', side: d });
    }
  } else if (st.mode === 'climb') {
    const K = S.climb;
    if (st.y < st.top - K.hands) { st.y = Math.min(st.top - K.hands, st.y + K.v * dt); st.cy = st.y; } // (two or three steps up the stone)
    else {
      if (st.ct === 0) st.cy = st.y;
      st.ct += dt;
      const k = clamp(st.ct / K.pull, 0, 1);
      st.y = lerp(st.cy, st.top, Math.min(1, k * 1.5)); st.s = st.face + K.in * k * k;
      if (k >= 1) { st.mode = 'ground'; st.y = st.top; st.vs = 2.5; st.gt = 0; st.gy = st.y; st.lastWall = 0; st.lastPole = -1; events?.push({ type: 'up' }); }
    }
  } else if (st.mode === 'pole') {
    st.pt += dt;
    const t = C.things[st.pole];
    if (st.want > 0 && st.pt >= S.pole.least) {
      st.mode = 'air'; st.lastPole = t.id; st.s = t.s + 0.3; st.y = t.y - 1.2; st.vs = S.pole.v; st.vy = S.pole.vy; st.vu = 0; st.want = 0; st.sprung = true;
      events?.push({ type: 'swing' });
    }
  }

  // ---- a save reached: the reserve is full again
  for (let k = st.home + 1; k < C.saves.length; k++) if (st.s >= C.saves[k].s && st.mode === 'ground') { st.home = k; st.rew = S.rewinds; events?.push({ type: 'save', n: k, name: C.saves[k].name }); }
  if (st.s > st.best) st.best = st.s;
  // ---- the top of the tower
  if (st.s >= LENGTH && st.mode === 'ground') { st.over = true; st.time = Math.min(BOARD.max, Math.round(st.clock * 1000)); events?.push({ type: 'end', time: st.time }); return; }
  // ---- what hurts
  const why = touch(st, now);
  if (why) return out(st, why, events);
  // ---- the path one came by is kept, from the last sure footing on
  if (st.trail && st.n % S.trail === 0) {
    const p = { s: st.s, u: st.u, y: st.y, m: st.mode, d: st.mode === 'wall' ? st.side : 0 };
    if (st.mode === 'ground' && st.gt > 0.1 && sure(st)) st.trail = [p];
    else { st.trail.push(p); if (st.trail.length > 420) st.trail.splice(1, 60); }
  }
}

/** Is where the runner stands a sure footing: a floor that stays, with room before and behind, and nothing that hurts near? */
function sure(st) {
  const t = (floorAt(st.s, st.u, st), _f.t);
  if (!t || t.form === 'crumble') return false;
  if (Math.abs(floorAt(st.s + 0.9, st.u, st) - st.y) > 0.3 || Math.abs(floorAt(st.s - 0.9, st.u, st) - st.y) > 0.3) return false;
  for (const h of near(st.s)) if ((h.kind === 'spikes' || h.kind === 'blade') && st.s > h.s0 - 1.1 && st.s < h.s1 + 1.1) return false;
  return true;
}

/** What hurts the runner at `now` ('' when nothing). */
function touch(st, now) {
  for (const t of near(st.s)) {
    if (t.kind === 'blade') { if (Math.abs(st.s - t.s) < 0.3 + S.along && Math.abs(st.u - bladeAt(t, now)) < 0.45 + S.across && st.y < t.y + 1.9 && st.y + S.tall > t.y + 0.15) return 'blade'; }
    else if (t.kind === 'spikes') { if (st.s > t.s0 - 0.05 && st.s < t.s1 + 0.05 && st.u > t.u0 - 0.1 && st.u < t.u1 + 0.1 && st.y < t.y + 0.55 * spikesAt(t, now) - 0.12 && st.y > t.y - 0.5) return 'spikes'; }
  }
  return '';
}

function out(st, why, events) {
  st.outs++; st.why = why;
  events?.push({ type: 'out', why, s: st.s });
  if (st.trail && st.rew > 0 && st.trail.length > 0) {
    st.rew--; st.used++; st.rm = st.mode; st.mode = 'rewind'; st.ri = st.trail.length - 1; st.rf = 0;
    // (three seconds of it at the most, at twice the speed: a longer way back is run faster)
    st.rs = Math.max(S.wind, (st.trail.length * S.trail / 120) / 1.5);
    events?.push({ type: 'rewind', left: st.rew });
  } else { st.mode = 'down'; st.down = S.down; if (why !== 'fall') st.vy = 0; }
}

// ---------------------------------------------------------------------------
// A runner that plays by itself — the proof that the top can be reached. It does not know the way by heart: it
// tries, two seconds ahead, what it could do — a lane, the button now or a little later, twice, three times —
// on a copy of itself, with these very rules, and does what lasts. It never presses sooner than a quarter of a
// second after it has decided to (`late`). Where nothing lasts at a run — a blade is in the way — it lets go of
// the stick, if standing lasts, until a way opens. `clumsy`: it presses late, or not at all, now and then.

const LANES = [-1.4, -0.7, 0, 0.7, 1.4];
const SURE = 168, FAR = 276, LATE = 30;
const NEVER = Infinity;
const copy = (st) => ({ ...st, trail: null, bot: null });
const _in = { run: 0, side: 0, jump: false };
const sideFor = (q, lane) => (q.mode === 'wall' || q.mode === 'pole' || q.mode === 'climb' ? 0 : clamp((lane - q.u) * 5, -1, 1));
/** How many steps (of `n`) a copy of `st` lasts with a plan { u, keys: [steps], go }: less when it gets nowhere. */
function lasts(st, plan, n) {
  const q = copy(st), outs = q.outs, from = q.s;
  for (let k = 0; k < n; k++) {
    _in.side = sideFor(q, plan.u); _in.run = q.n >= plan.go ? 1 : 0; _in.jump = false;
    for (const at of plan.keys) if (at === q.n) q.want = S.buffer;
    sub(q, S.step, _in, null);
    if (q.over) return n + 1;
    if (q.outs > outs) return k;
  }
  // (hanging from a bar, or run into something: it lasts, and gets nowhere)
  if (plan.go !== NEVER && (q.mode === 'pole' || q.s < from + 3)) return Math.min(n, SURE - 2);
  return n;
}
function search(st, B, go, cur, k0, deep) {
  const now = st.n, first = now + (B.late ?? LATE);
  let best = cur, score = k0;
  const still = go === 0 && st.mode === 'ground' && st.vs < 1;
  const tryOne = (plan) => { const k = lasts(st, plan, FAR); if (k > score || (k === score && best && plan.keys.length < best.keys.length)) { score = k; best = plan; } return k; };
  // (from a standstill, two ways to go: at once, or with the first press — a leap from where one stands)
  const tryPlan = (plan) => { plan.go = go; const k = tryOne(plan); if (still && score < FAR && plan.keys.length) tryOne({ ...plan, go: plan.keys[0] }); return k; };
  const lanes = LANES.slice().sort((a, b) => Math.abs(a - st.u) - Math.abs(b - st.u));
  const kept = (B.keys || []).filter((k) => k >= now);
  for (const u of lanes) tryPlan({ u, keys: kept.slice() });
  for (const u of lanes) if (score < FAR) tryPlan({ u, keys: [] });
  // ---- what was planned and one press more; one press; two; three
  if (score < FAR && kept.length) { const from = Math.max(first, kept[kept.length - 1] + 12); for (let at = from; at <= now + 150 && score < FAR; at += 6) for (const u of lanes) tryPlan({ u, keys: [...kept, at] }); }
  if (score < FAR) for (let d = 0; d <= 132 && score < FAR; d += 6) for (const u of lanes) tryPlan({ u, keys: [first + d] });
  if (score < SURE && deep >= 2) for (let d = 0; d <= 96 && score < FAR; d += 6) for (let g = 18; g <= 132 && score < FAR; g += 8) for (const u of lanes.slice(0, 3)) tryPlan({ u, keys: [first + d, first + d + g] });
  if (score < SURE && deep >= 3) for (let d = 0; d <= 60 && score < FAR; d += 6) for (let g = 18; g <= 110 && score < FAR; g += 10) for (let g2 = 18; g2 <= 110 && score < FAR; g2 += 10) for (const u of lanes.slice(0, 2)) tryPlan({ u, keys: [first + d, first + d + g, first + d + g + g2] });
  return { plan: best, score };
}
const take = (B, plan) => { if (!plan) return; B.u = plan.u; B.keys = plan.keys.slice(); B.go = plan.go; };

function think(st, B) {
  const now = st.n, cur = { u: B.u, keys: B.keys.filter((k) => k >= now), go: B.go };
  const k0 = lasts(st, cur, FAR);
  if (B.go !== NEVER) {
    if (k0 >= SURE) return;
    const found = search(st, B, 0, cur, k0, 3);
    if (found.score < 60 && st.mode === 'ground') {
      const stand = search(st, B, NEVER, null, -1, 1);
      if (stand.score >= SURE) { take(B, stand.plan); B.stood = 0; B.stops++; return; }
    }
    take(B, found.plan);
    return;
  }
  // ---- standing: is there a way now?
  B.stood += 8;
  const way = search(st, B, 0, null, -1, B.stood > 600 ? 3 : 2);
  if (way.score >= SURE || B.stood > 720) { take(B, way.plan); return; }
  if (k0 >= SURE) return;
  const stand = search(st, B, NEVER, cur, k0, 1);
  take(B, way.score >= stand.score ? way.plan : stand.plan);
}

/** The keys of the runner that plays by itself, for this step: { run, side, jump }. Call it before every step. */
export function botInput(st, out = { run: 0, side: 0, jump: false }) {
  const B = st.bot || (st.bot = { u: 0, keys: [], go: 0, next: 0, life: -1, stood: 0, stops: 0, late: LATE, clumsy: 0, seed: 1, pressed: 0 });
  out.run = 0; out.side = 0; out.jump = false;
  if (st.over || st.mode === 'rewind' || st.down > 0) { B.life = -1; return out; }
  const life = st.used + st.homes;
  if (B.life !== life) { B.life = life; B.u = clamp(st.u, -1.4, 1.4); B.keys = []; B.go = 0; B.next = 0; B.stood = 0; }
  if (st.wait > 0) return out;
  if (st.n >= B.next) { think(st, B); B.next = st.n + (B.go === NEVER ? 8 : 4); }
  out.side = sideFor(st, B.u); out.run = st.n >= B.go ? 1 : 0;
  for (let i = B.keys.length - 1; i >= 0; i--) if (B.keys[i] <= st.n) {
    let at = B.keys[i];
    B.keys.splice(i, 1);
    if (B.clumsy) {
      // (a clumsy hand: now and then the press comes late, or not at all)
      const r = (B.seed = (B.seed * 16807) % 2147483647) / 2147483647;
      if (r < B.clumsy * 0.4) continue;
      if (r < B.clumsy && !B.slip) { B.slip = true; B.keys.push(at + 12 + Math.floor(r * 300) % 36); continue; }
      B.slip = false;
    }
    out.jump = true; B.pressed++;
  }
  return out;
}

/** Runs with the bot from a start at `t0` (the shared clock, s): { time (ms), over, outs, rewinds, homes, keys, stops, clock, why }. */
export function botRun(t0 = 0, limit = 600, clumsy = 0, seed = 7) {
  const st = startRun(t0), input = { run: 0, side: 0, jump: false }, events = [], why = [];
  botInput(st, input); st.bot.clumsy = clumsy; st.bot.seed = seed;
  for (let t = 0; t < limit && !st.over; t += S.step) {
    botInput(st, input); stepRun(st, S.step, input, events);
    for (const e of events) if (e.type === 'out') why.push(`${e.why} at ${e.s.toFixed(0)} m`);
    events.length = 0;
  }
  return { time: st.time, over: st.over, outs: st.outs, rewinds: st.used, homes: st.homes, keys: st.bot.pressed, stops: st.bot.stops, clock: st.total, s: st.s, why };
}
