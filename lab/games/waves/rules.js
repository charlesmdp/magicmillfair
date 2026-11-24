// Wave Goodbye: its rules. No renderer here: the game, its checks and the wader that plays by itself all read this.
//
// A bar of sand runs out from the beach into the bay, and the sea comes in over it, wave after wave. One wades in
// whenever one likes; the backwash draws one out, slowly, and one jumps what comes: left and right along the
// crest, a jump, a second jump in the air. A wave that catches one carries one back to the beach, and that is the
// run: what counts is how long one held.
//
// The sea is the same for everybody — it goes by the clock of the world — and it does not know who is in it:
// every wave comes in at the same speed, on the beats of one rhythm, some of them two beats running. What makes
// a run harder as it goes is where one stands: a wave loses height as it runs up the sand, and one that is lower
// than one's knees only wets. So by the beach one hops knee-high rollers and a low breaker now and then;
// twenty-five metres out the ripples begin to matter too, and everything stands taller with every metre —
// until, towards the tip, the sea asks for more than a jump can give. Nobody holds for ever: the question is
// how long.
// A crest is never level: it stands higher at one end, and a great one can only be jumped at its low end. The
// great ones come alone, and never two in a few seconds; what comes two beats running is small.
//
// Places on the bar: `s` metres out from the line of the start, `u` metres across it (to the right of who looks
// out to sea when positive). Time advances in steps of 1/120 s whatever the frame rate.

export const WAVES = {
  name: 'Wave Goodbye',
  from: { x: 47, z: -60 }, yaw: 1.2217, // the middle of the line of the start, at the water's edge, and the way out to sea (0 looks south: this is east, a little south)
  length: 60, half: 3, // the bar: m out to its tip; m to each side of its middle
  step: 1 / 120,
  drift: 0.42, // m/s: how fast the backwash draws one out
  side: 4.4, accel: 30, // m/s across, and how fast one gets there (m/s²)
  g: 20, jump: 6.6, again: 6.0, // m/s², m/s up: a jump (a little over a metre), and the second one in the air
  speed: 6.5, // m/s: how fast every wave comes in
  far: 30, // m beyond the tip: where the waves rise out of the sea
  beat: 0.55, // s: the rhythm of the sea — a wave may come on each beat
  // the sets, eight beats each: on which beats a wave comes (never three beats running, and none on the last)
  sets: ['10010010', '10100100', '11000100', '10011000', '10100110', '01010100', '10010100', '10000100', '11001100', '10110010'],
  // the waves: how tall at full height (m), how much lower the low end of the crest is; `share`: how many of
  // the waves that come alone
  kinds: {
    ripple: { share: 0.45, h: 0.5, tilt: 0.15 },
    roller: { share: 0.34, h: 0.95, tilt: 0.18 },
    breaker: { share: 0.21, h: 1.6, tilt: 0.22 },
    monster: { h: 2.7, tilt: 0.5 }, // only ever the first wave of a set, and then one time in `great`
  },
  pair: 0.55, // of two that come on beats running, so many are ripples (the others rollers)
  great: 0.3,
  // how much of its full height a wave has `s` metres out: grow[0] + grow[1]·s + grow[2]·s² (two fifths at the
  // line — a roller is knee-high there —, its full height thirty-five metres out, two thirds more at the tip)
  grow: [0.42, 0.011, 0.00016],
  end: -5, fade: 4, // m out from the line: where the waves die, on the sand of the beach, and over how many metres they go down to nothing
  knee: 0.33, // m: lower than this at one's feet, a wave only wets
  clear: 0.85, // feet this high, as a share of the height of the crest, are over it
  thick: [0.3, 0.12], // m: how far each side of its crest a wave reaches: so much, and so much per metre of height
  grace: 2.5, // s: one wades in — what comes by in that time does not count
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hash = (n, k = 0) => { const s = Math.sin(n * 127.1 + k * 311.7 + 74.7) * 43758.5453; return s - Math.floor(s); };

/** Is there a wave on beat `n`? */
const onBeat = (n) => { const W = WAVES, set = W.sets[Math.floor(hash(Math.floor(n / 8), 9) * W.sets.length)]; return set[((n % 8) + 8) % 8] === '1'; };

/**
 * The wave of beat `n` — the same for everybody: { n, on (is there one), kind, h (its full height), dir (which
 * end of its crest is the low one: 1 the right, -1 the left), tilt }. Two that come
 * on beats running are small (ripples, rollers) and lean the same way; a monster is the first wave of its set,
 * and comes alone.
 */
export function waveOf(n, out = {}) {
  const W = WAVES, K = W.kinds;
  out.n = n; out.on = onBeat(n);
  if (!out.on) return out;
  const before = onBeat(n - 1), pick = hash(n, 1);
  let kind;
  if (before || onBeat(n + 1)) kind = pick < W.pair ? 'ripple' : 'roller';
  else if (((n % 8) + 8) % 8 === 0 && hash(n, 3) < W.great) kind = 'monster';
  else kind = pick < K.ripple.share ? 'ripple' : pick < K.ripple.share + K.roller.share ? 'roller' : 'breaker';
  out.kind = kind; out.h = K[kind].h; out.tilt = K[kind].tilt;
  out.dir = hash(before ? n - 1 : n, 2) < 0.5 ? -1 : 1;
  return out;
}

/** Where the crest of the wave of beat `n` is at `clock` (s of the world's clock): metres out from the line. */
export const crestAt = (n, clock) => WAVES.length + WAVES.far - WAVES.speed * (clock - n * WAVES.beat);

/** How tall the wave `w` (see waveOf) stands where its crest is `s` metres out, `u` metres across. */
export function heightAt(w, s, u) {
  const W = WAVES;
  if (!w.on || s <= W.end) return 0;
  const q = clamp(s, 0, W.length), grown = W.grow[0] + W.grow[1] * q + W.grow[2] * q * q;
  const born = clamp((W.length + W.far - s) / 8, 0, 1), dying = clamp((s - W.end) / W.fade, 0, 1); // (it rises out of the sea, and goes down to nothing where it dies)
  return w.h * grown * born * dying * (1 - w.tilt * (0.5 + 0.5 * w.dir * clamp(u / W.half, -1, 1)));
}

/** Calls `each(wave, crest)` for every wave that is on the sea at `clock` (the wave is the same object every time). */
export function coming(clock, each) {
  const W = WAVES, last = Math.floor(clock / W.beat), first = Math.ceil((clock - (W.length + W.far + 6) / W.speed) / W.beat);
  for (let n = first; n <= last; n++) { const w = waveOf(n, _w), crest = crestAt(n, clock); if (w.on && crest > W.end) each(w, crest); }
}
const _w = {}, _x = {}, _b = {};

/** A wader on the line. `t0`: the clock of the world when they wade in (s). `u`: where across the bar. */
export function startWade(t0 = 0, u = 0) {
  const W = WAVES;
  return {
    s: 0, u, vu: 0, h: 0, vh: 0, twice: false, clock: 0, acc: 0, t0, jumped: 0, wet: 0, over: false, time: 0, want: 0, cause: '',
    next: Math.ceil((t0 - (W.length + W.far - 1) / W.speed) / W.beat), // the first beat whose wave is still beyond one
  };
}

/**
 * Advances a wade by `dt` seconds. `input`: { side (-1 … 1), jump (true on the frame it is asked) }. `events`:
 * { type: 'jump' | 'again' | 'land' | 'wet' (a wave too low to matter went by) | 'clear' (kind: one was jumped)
 * | 'out' (kind, time: carried back to the beach) }.
 */
export function stepWade(st, dt, input, events) {
  if (input?.jump) st.want = 0.12;
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= WAVES.step && !st.over) { st.acc -= WAVES.step; sub(st, WAVES.step, input, events); }
  return st;
}

function sub(st, dt, input, events) {
  const W = WAVES;
  st.clock += dt;
  if (st.want > 0) st.want -= dt;
  // ---- drawn out by the backwash, as far as the tip; across as one pushes
  st.s = Math.min(W.length, st.s + W.drift * dt);
  const wu = clamp(input?.side || 0, -1, 1) * W.side;
  st.vu += clamp(wu - st.vu, -W.accel * dt, W.accel * dt);
  st.u = clamp(st.u + st.vu * dt, -W.half, W.half);
  if (Math.abs(st.u) >= W.half) st.vu = 0;
  // ---- a jump, and a second one in the air
  if (st.want > 0) {
    if (st.h <= 0) { st.vh = W.jump; st.h = 1e-3; st.want = 0; st.twice = false; events?.push({ type: 'jump' }); }
    else if (!st.twice) { st.vh = W.again; st.twice = true; st.want = 0; events?.push({ type: 'again' }); }
  }
  if (st.h > 0) { st.vh -= W.g * dt; st.h += st.vh * dt; if (st.h <= 0) { st.h = 0; st.vh = 0; events?.push({ type: 'land' }); } }
  // ---- the waves: they go by one after the other, and each either wets, is jumped, or carries one off
  const now = st.t0 + st.clock;
  for (let guard = 0; guard < 8; guard++) {
    const w = waveOf(st.next, _x), crest = crestAt(st.next, now);
    if (!w.on) { if (crest < st.s) { st.next++; continue; } break; } // (no wave on that beat)
    const H = heightAt(w, st.s, st.u), reach = W.thick[0] + W.thick[1] * H;
    if (crest - st.s > reach) break;
    const counts = H * W.clear >= W.knee && st.clock > W.grace;
    if (counts && st.h < H * W.clear) {
      st.over = true; st.time = Math.round(st.clock * 1000); st.cause = w.kind;
      events?.push({ type: 'out', kind: w.kind, time: st.time });
      return;
    }
    if (crest - st.s >= -reach) break; // (it is going by under one's feet)
    if (counts) { st.jumped++; events?.push({ type: 'clear', kind: w.kind }); } else { st.wet++; events?.push({ type: 'wet' }); }
    st.next++;
  }
}

/** Where a place of the bar is on the plan: { x, z }. */
export function barAt(s, u, out = {}) {
  const W = WAVES, fx = Math.sin(W.yaw), fz = Math.cos(W.yaw);
  out.x = W.from.x + fx * s - fz * u; out.z = W.from.z + fz * s + fx * u; // (to the right of the way out: (-cos, sin) of its heading)
  return out;
}

/**
 * The waves that will matter to the wader in the next `within` seconds, the nearest first: [{ n, kind, dir, tilt,
 * t (s until its crest is on them), s (where they will be then), low, high (how tall it will stand at its two
 * ends) }]. `list` is filled and returned.
 */
export function ahead(st, within = 2.5, list = []) {
  const W = WAVES, now = st.t0 + st.clock;
  list.length = 0;
  for (let n = st.next; n < st.next + 40; n++) {
    const t = (crestAt(n, now) - st.s) / (W.speed + W.drift);
    if (t > within) break;
    const w = waveOf(n, _b);
    if (!w.on) continue;
    const s = Math.min(W.length, st.s + W.drift * Math.max(0, t));
    const high = heightAt(w, s, -w.dir * W.half);
    if (high * W.clear < W.knee || st.clock + t <= W.grace) continue;
    list.push({ n, kind: w.kind, dir: w.dir, tilt: w.tilt, h: w.h, on: true, t, s, low: heightAt(w, s, w.dir * W.half), high });
  }
  return list;
}

/** How high the feet are `t` seconds after a jump, with a second one `d` seconds into it (none when `d` < 0), and when one lands: [h, land]. */
function arc(t, d) {
  const W = WAVES, up = (v, x) => v * x - 0.5 * W.g * x * x, air = (2 * W.jump) / W.g;
  if (d < 0 || d >= air) return t <= 0 ? 0 : t < air ? up(W.jump, t) : 0;
  if (t < d) return t <= 0 ? 0 : up(W.jump, t);
  const h2 = up(W.jump, d), x = t - d, h = h2 + up(W.again, x);
  return h > 0 ? h : 0;
}
const landing = (d) => { const W = WAVES, air = (2 * W.jump) / W.g; if (d < 0 || d >= air) return air; const h2 = W.jump * d - 0.5 * W.g * d * d; return d + (W.again + Math.sqrt(W.again * W.again + 2 * W.g * h2)) / W.g; };

/**
 * A wader that plays by itself — the proof that the sea can be held. It goes to the low end of the tall crests,
 * and jumps as late as it can: it tries when to leave the sand, and when to jump again in the air, so as to be
 * over every crest that comes before it could land and leave again. Returns the input for stepWade.
 */
export function botInput(st, out = { side: 0, jump: false }) {
  const W = WAVES, bot = st.bot || (st.bot = { again: -1, list: [] });
  out.side = 0; out.jump = false;
  const list = ahead(st, 2.6, bot.list);
  // ---- where to stand: at the low end of the great one if one comes, else of the first tall one
  let lead = null;
  for (const w of list) if (w.kind === 'monster') { lead = w; break; }
  if (!lead) for (const w of list) if (w.high * W.clear > 0.72) { lead = w; break; }
  const want = lead ? lead.dir * (W.half - 0.25) : clamp(st.u, -W.half + 0.6, W.half - 0.6);
  out.side = clamp((want - st.u) * 5, -1, 1);
  // (how tall each will stand where one is, or where one will be by then — the taller of the two —, a little more
  // for safety; how long its crest takes to go by)
  for (const w of list) {
    const u = st.u + clamp(want - st.u, -W.side * w.t * 0.9, W.side * w.t * 0.9), H = Math.max(heightAt(w, w.s, u), w === lead ? 0 : heightAt(w, w.s, st.u));
    w.need = H * W.clear + 0.13; w.half = (W.thick[0] + W.thick[1] * H) / (W.speed + W.drift) + 0.025;
  }
  if (st.h > 0) {
    // in the air: the second jump at the moment that was chosen — or, with none chosen, when it is needed
    if (st.twice) return out;
    const now = st.clock;
    if (bot.again >= 0) { if (now >= bot.again) { out.jump = true; bot.again = -1; } return out; }
    const w = list[0];
    if (w && w.t <= 0.3 && st.h + st.vh * w.t - 0.5 * W.g * w.t * w.t < w.need) out.jump = true;
    return out;
  }
  bot.again = -1;
  if (!list.length || list[0].t > 0.75) return out;
  // on the sand: the latest moment to leave it that still clears what comes
  const ok = (t1, d) => {
    const land = t1 + landing(d);
    for (const w of list) {
      if (w.t - w.half >= land + (w.need <= 0.92 ? 0.36 : 0.6)) break; // (back on the sand in time to deal with it, and with what follows)
      if (w.t + w.half < t1) return false;
      for (const t of [w.t - w.half, w.t, w.t + w.half]) if (arc(t - t1, d) < w.need) return false;
    }
    return true;
  };
  let best = null;
  for (let t1 = 0.6; t1 >= -1e-9 && !best; t1 -= 1 / 60) {
    if (ok(Math.max(0, t1), -1)) { best = { t1, d: -1 }; break; }
    for (let d = 0.04; d < 0.64; d += 0.02) if (ok(Math.max(0, t1), d)) { best = { t1, d }; break; }
  }
  if (best) { if (best.t1 <= 1 / 60 + 1e-6) { out.jump = true; bot.again = best.d >= 0 ? st.clock + best.d : -1; } return out; }
  // (nothing clears it all: the plain way — up when the first is nearly on one)
  if (list[0].t <= (list[0].need <= 0.92 ? 0.31 : 0.56)) out.jump = true;
  return out;
}

/** Who only hammers the jump, and never moves: what the sea does to them is what a first try looks like. */
export function naiveInput(st, out = { side: 0, jump: false }) { out.side = 0; out.jump = st.h <= 0; return out; }

/** Wades in at `t0` with the bot (or with `drive`): { time (ms), s (m out), jumped, cause, over }. */
export function botWade(t0 = 0, limit = 900, drive = botInput) {
  const st = startWade(t0), input = { side: 0, jump: false };
  for (let t = 0; t < limit && !st.over; t += WAVES.step) { drive(st, input); stepWade(st, WAVES.step, input, null); }
  return { time: st.over ? st.time : Math.round(st.clock * 1000), s: st.s, jumped: st.jumped, cause: st.cause, over: st.over };
}
