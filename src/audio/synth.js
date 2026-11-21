// Building blocks shared by the ambience, the music and the effects: random numbers, looped noise, oscillator
// waves, note names, the master limiter. Nothing here knows about the game.

export const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** 0 at a, 1 at b, eased in between (a may be the larger one: then it falls). */
export const smooth = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
/**
 * How loud a source is `d` metres away: 1 at its foot, a half at `half` metres, and nothing at all from `far`
 * on — so that a layer nobody can hear is really switched off.
 */
export const reach = (d, half, far) => (d >= far ? 0 : (half / (half + d)) * (1 - (d / far) * (d / far)));
/** A slow, never-repeating swell in 0..1 (three sines that do not agree): gusts, the breathing of the sea. */
export const drift = (t, a, b, c) => 0.5 + 0.24 * Math.sin(t * a) + 0.16 * Math.sin(t * b + 1.7) + 0.1 * Math.sin(t * c + 4.1);

/** Random numbers in [0, 1) from a seed (mulberry32): the test tool renders the same sound twice. */
export function randomSource(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Notes

const SEMITONE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
export const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
/** 'f#5', 'bb4', 'c6' → MIDI number (c4 = 60). */
export function midi(name) {
  let n = SEMITONE[name[0]], i = 1;
  for (; name[i] === '#' || (name[i] === 'b' && i < name.length - 1); i++) n += name[i] === '#' ? 1 : -1;
  return n + 12 * (parseInt(name.slice(i), 10) + 1);
}
/** 'G', 'Am', 'D7', 'Bb', 'F#m' → { pc: pitch class of the root, kind: 'maj' | 'min' | 'dom' }. */
export function chord(name) {
  let pc = SEMITONE[name[0].toLowerCase()], i = 1;
  if (name[i] === '#') { pc++; i++; } else if (name[i] === 'b') { pc--; i++; }
  const rest = name.slice(i);
  return { pc: (pc + 12) % 12, kind: rest === 'm' ? 'min' : rest === '7' ? 'dom' : 'maj' };
}
/**
 * A line of music written as text: 'd5 b4 d5 | g5:2 f#5 | r:3' — note names, ':' and a length in beats
 * (1 when left out), 'r' for a rest, '|' between bars (only there for the eye). Gives, bar by bar, the list of
 * [onset in the bar, MIDI number, length], lengths in beats.
 */
export function melody(text, beatsPerBar) {
  const bars = [];
  let at = 0;
  for (const token of text.split(/\s+/)) {
    if (!token || token === '|') continue;
    const [name, len = '1'] = token.split(':'), beats = parseFloat(len), bar = Math.floor(at / beatsPerBar + 1e-6);
    while (bars.length <= bar) bars.push([]);
    if (name !== 'r') bars[bar].push([at - bar * beatsPerBar, midi(name), beats]);
    at += beats;
  }
  return bars;
}

// ---------------------------------------------------------------------------
// Oscillator waves. Each is a list of harmonic levels (the fundamental first).

/** { harmonic number: level } → list. Used for the chords sung by ONE oscillator: see `chordVoice`. */
const H = (map) => { const list = []; for (const k in map) { while (list.length < k) list.push(0); list[k - 1] = map[k]; } return list; };
/** A chord whose notes are the harmonics `tones` of one low fundamental, each doubled softly at the octave. */
const stack = (tones) => { const map = {}; for (const h of tones) { map[h] = 1; } for (const h of tones) if (!map[h * 2]) map[h * 2] = 0.28; return H(map); };

export const WAVES = {
  // a felt piano: the higher the note, the purer
  pianoLow: [1, 0.5, 0.3, 0.16, 0.1, 0.06, 0.04, 0.02],
  piano: [1, 0.36, 0.14, 0.06, 0.025],
  pianoHigh: [1, 0.2, 0.05],
  // soft pads: root, fifth, ninth and tenth (or twelfth) of one fundamental; a minor seventh chord
  padAdd9: H({ 4: 1, 6: 0.8, 9: 0.5, 10: 0.6, 8: 0.18, 12: 0.12 }),
  padSus: H({ 4: 1, 6: 0.8, 9: 0.5, 12: 0.5, 8: 0.18 }),
  padMinor: H({ 10: 1, 15: 0.8, 18: 0.5, 24: 0.55, 20: 0.18 }),
  // the pipes of the fairground organ
  flute: [1, 0.3, 0.09, 0.04],
  principal: [1, 0.55, 0.3, 0.18, 0.1, 0.06, 0.03],
  reed: [1, 0.85, 0.7, 0.55, 0.42, 0.3, 0.22, 0.15, 0.1, 0.06],
  piccolo: [0.45, 1, 0.1, 0.35, 0, 0.1],
  bourdon: [1, 0.3, 0.32, 0.1, 0.12, 0.04, 0.05],
  chime: [1, 0, 0, 0.3, 0, 0, 0.12],
  // its chords, in the three positions of a triad and the four of a seventh (see `chordVoice`)
  maj0: stack([4, 5, 6]), maj1: stack([5, 6, 8]), maj2: stack([6, 8, 10]),
  dom0: stack([4, 5, 6, 7]), dom1: stack([5, 6, 7, 8]), dom2: stack([6, 7, 8, 10]),
  min0: stack([10, 12, 15]), min1: stack([12, 15, 20]), min2: stack([15, 20, 24]),
  // the orchestra of the climb
  brass: [1, 0.8, 0.62, 0.46, 0.33, 0.23, 0.16, 0.11, 0.07, 0.04],
  strings: [1, 0.55, 0.4, 0.28, 0.2, 0.15, 0.11, 0.08, 0.06, 0.045, 0.035, 0.025],
  pulse: [1, 0.6, 0.45, 0.3, 0.25, 0.18, 0.14, 0.1],
  // throats and beaks
  gull: [1, 0.9, 0.75, 0.5, 0.45, 0.3, 0.2, 0.12],
  frog: [1, 0.9, 0.9, 0.8, 0.7, 0.7, 0.6, 0.5, 0.5, 0.4, 0.3, 0.3],
};

/**
 * A triad or a seventh chord as ONE oscillator: the notes of a major chord are harmonics 4, 5 and 6 of a
 * fundamental two octaves under its root (4:5:6:7 with the seventh, 10:12:15 for a minor chord), so a wave
 * that only has those harmonics sings the whole chord, in tune like a barbershop. `root` is the root's
 * frequency in the octave below middle C; the position is chosen so that the chord sits around middle C.
 * Returns the wave name; the oscillator frequency is root / 4 (major, seventh) or root / 10 (minor).
 */
export function chordVoice(kind, root) {
  const third = kind === 'min' ? 1.2 : 1.25, floor = 185;
  return kind + (root >= floor ? 0 : root * third >= floor ? 1 : 2);
}
export const chordHz = (kind, root) => root / (kind === 'min' ? 10 : 4);

/** The oscillator waves of one audio context, made when first asked for. */
export class WaveBank {
  constructor(ctx) { this.ctx = ctx; this.made = {}; this.queue = []; }
  /**
   * Waves that will be needed soon. Making one takes the browser most of a millisecond: `tick()` makes one per
   * call, so that they do not all fall on the frame of their first note.
   */
  warm(names) { for (const n of names) if (!this.made[n] && !this.queue.includes(n)) this.queue.push(n); }
  tick() { if (this.queue.length) this.get(this.queue.shift()); }
  get(name) {
    let w = this.made[name];
    if (!w) {
      const list = WAVES[name], real = new Float32Array(list.length + 1), imag = new Float32Array(list.length + 1);
      imag.set(list, 1);
      w = this.made[name] = this.ctx.createPeriodicWave(real, imag);
    }
    return w;
  }
  /** Give an oscillator one of the waves above, or a built-in shape ('sine', 'triangle'…). */
  dress(osc, name) { if (WAVES[name]) osc.setPeriodicWave(this.get(name)); else osc.type = name; }
}

// ---------------------------------------------------------------------------
// Noise: three buffers made once and looped for ever. Their lengths share no common measure, so layers that
// read different ones never fall into step.

export const NOISE_RMS = 0.2;
const NOISE_SECONDS = { white: 3.1, pink: 4.3, brown: 5.9 };

/** One of the noises, made in two goes (`part` 0 then 1) so that no frame waits for a whole buffer. */
function noiseMaker(ctx, color, seed) {
  const rate = ctx.sampleRate, n = Math.round(NOISE_SECONDS[color] * rate);
  const seam = color === 'white' ? 0 : Math.round(0.08 * rate), lead = 4096; // (the filters settle during `lead`)
  const raw = new Float32Array(n + seam), half = raw.length >> 1;
  const red = 1 - Math.exp((-2 * Math.PI * 150) / rate); // brown: flat under 150 Hz, then 6 dB less per octave
  let s = (Math.imul(seed, 2654435761) >>> 0) || 1, b0 = 0, b1 = 0, b2 = 0, sum = 0;
  return (part) => {
    for (let i = part ? half : -lead, end = part ? raw.length : half; i < end; i++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; // xorshift: several times quicker than Math.random, and repeatable
      const w = s / 2147483648;
      let v = w;
      if (color === 'pink') {
        // (Paul Kellet's three-pole filter: 3 dB less per octave)
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        v = b0 + b1 + b2 + w * 0.1848;
      } else if (color === 'brown') v = b0 += (w - b0) * red;
      if (i >= 0) { raw[i] = v; sum += v * v; }
    }
    if (!part) return null;
    const k = NOISE_RMS / Math.sqrt(sum / raw.length);
    const buffer = ctx.createBuffer(1, n, rate), d = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) {
      let v = raw[i];
      // the end of the take is folded over its beginning: the loop has no seam to thump on
      if (i < seam) { const f = i / seam; v = v * Math.sqrt(f) + raw[n + i] * Math.sqrt(1 - f); }
      v *= k;
      d[i] = v > 1 ? 1 : v < -1 ? -1 : v;
    }
    return buffer;
  };
}

export class NoiseBank {
  constructor(ctx, seed) { this.ctx = ctx; this.seed = seed; this.made = {}; this.makers = {}; }
  _maker(color) { return this.makers[color] || (this.makers[color] = noiseMaker(this.ctx, color, this.seed + color.length)); }
  /** The buffer of a noise ('white', 'pink', 'brown'): made on the spot if `jobs` has not been through yet. */
  get(color) {
    if (!this.made[color]) { const make = this._maker(color); if (!this.begun?.[color]) make(0); this.made[color] = make(1); this.makers[color] = null; }
    return this.made[color];
  }
  /** The same work as slices to run one per frame. */
  jobs() {
    const list = [];
    this.begun = {};
    for (const color in NOISE_SECONDS) {
      list.push(() => { if (!this.made[color] && !this.begun[color]) { this._maker(color)(0); this.begun[color] = true; } }, () => this.get(color));
    }
    return list;
  }
}

/**
 * The gain that brings one of the noises above, once through a filter, to a level (RMS) of about 1: the
 * narrower the filter, the less gets through. With it the levels written in the mixer and in the effects are
 * what is heard, whatever the filter. An estimate from the shape of each spectrum (a few dB at worst).
 */
export function noiseGain(color, type, hz, q, rate) {
  const nyquist = rate / 2, f = Math.min(hz, nyquist * 0.98);
  // share of the power of each noise that lies under a frequency
  const under = (x) => (color === 'white' ? x / nyquist : color === 'pink' ? sat(Math.log2(Math.max(x, 12) / 12) / Math.log2(nyquist / 12)) : Math.atan(x / 150) / Math.atan(nyquist / 150));
  let share;
  if (type === 'lowpass') share = under(f);
  else if (type === 'highpass') share = 1 - under(f);
  else { const w = (f / Math.max(q, 0.2)) * 0.79; share = under(Math.min(nyquist, f + w)) - under(Math.max(0, f - w)); } // (band-pass: its width in noise terms is π/2 · f/Q)
  return 1 / (NOISE_RMS * Math.sqrt(Math.max(share, 1e-4)));
}

// ---------------------------------------------------------------------------
// Web Audio odds and ends

/**
 * Let a filter follow its sliding frequency once per block instead of once per sample (browsers otherwise
 * work its coefficients out 48,000 times a second while it moves). Older engines ignore this.
 */
export function blockRate(param) { try { param.automationRate = 'k-rate'; } catch { /* stays as it was */ } return param; }

/**
 * The browsers' compressor adds a fixed "make-up" gain that depends on its settings (they all share the same
 * code): this is that gain, so that it can be taken off again and quiet sound goes through untouched.
 */
export function compressorMakeup(threshold, knee, ratio) {
  const lin = (db) => 10 ** (db / 20), db = (v) => 20 * Math.log10(v);
  const T = lin(threshold), slope = 1 / ratio, end = lin(threshold + knee);
  const curve = (x, k) => (x < T ? x : T + (1 - Math.exp(-k * (x - T))) / k);
  const slopeAt = (x, k) => (x < T ? 1 : (db(curve(x * 1.001, k)) - db(curve(x, k))) / (db(x * 1.001) - db(x)));
  let lo = 0.1, hi = 10000, k = 5;
  for (let i = 0; i < 15; i++) { if (slopeAt(end, k) < slope) hi = k; else lo = k; k = Math.sqrt(lo * hi); }
  const full = threshold + knee >= 0 ? curve(1, k) : lin(db(curve(end, k)) + slope * -(threshold + knee)); // a full-scale signal comes out at this
  return (1 / full) ** 0.6;
}

/** The last safety net after the limiter: straight up to 0.7, then bending over so that nothing reaches 1. */
export function softClip(points = 2049) {
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1, a = Math.abs(x);
    curve[i] = a <= 0.7 ? x : Math.sign(x) * (0.7 + 0.25 * Math.tanh((a - 0.7) / 0.25));
  }
  return curve;
}
