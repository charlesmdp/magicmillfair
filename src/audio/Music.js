// The music: three moods that cross-fade — a quiet one everywhere (a felt piano over soft chords, made up as it
// goes), the waltz of the fairground organ around the pier, and the orchestra of the climb, which builds with
// the height reached. Notes are written to the audio clock a third of a second ahead; a mood nobody hears
// plays nothing at all.
import { PIER, pierToWorld } from '../world/layout/layout.js';
import { sat, smooth, midiHz, melody, chord, chordVoice, chordHz, noiseGain } from './synth.js';
import { WALTZ, CLIMB, CALM } from './tunes.js';

const AHEAD = 0.3; // how far ahead of the audio clock the notes are written
const VOICES = 24; // never more notes than this at once (those written ahead count)

// How loud each instrument plays (peak of one note, 1 = full scale): the mix of the music is tuned here.
const LEVEL = {
  pad: 0.045, piano: 0.17, pianoBass: 0.15,
  tune: 0.15, second: 0.07, oom: 0.13, pah: 0.085, bell: 0.05, tremulant: 0.07,
  pulse: 0.15, strings: 0.06, drum: 0.3, slap: 0.1, hat: 0.03, snare: 0.07, brass: 0.13, choir: 0.07, cymbal: 0.07,
};

const COS = Math.cos(PIER.heading), SIN = Math.sin(PIER.heading), [WHEEL_X, WHEEL_Z] = pierToWorld(PIER.wheel.along);
/** How much of the fair is heard at (x, z): all of it by the big wheel, less along the pier, fading out along the promenade. */
export function fairness(x, z) {
  const along = sat(((x - PIER.rootX) * COS + (z - PIER.rootZ) * SIN) / PIER.length) * PIER.length;
  const off = Math.hypot(x - PIER.rootX - along * COS, z - PIER.rootZ - along * SIN); // how far from the line of the pier
  return smooth(115, 12, off) ** 1.3 * (0.72 + 0.28 * smooth(95, 22, Math.hypot(x - WHEEL_X, z - WHEEL_Z)));
}

/** A chord name → what the players need: the wave and frequency that sing it (see chordVoice), its bass notes, its notes. */
const chords = new Map();
function harmony(name) {
  let c = chords.get(name);
  if (!c) {
    const { pc, kind } = chord(name), root = midiHz(48 + pc); // (the root in the octave below middle C)
    const bass = 36 + pc < 40 ? 48 + pc : 36 + pc, fifth = bass + 7 > 52 ? bass - 5 : bass + 7; // (between E2 and E3)
    const tones = (kind === 'min' ? [0, 3, 7] : kind === 'dom' ? [0, 4, 7, 10] : [0, 4, 7]).map((i) => (pc + i) % 12);
    chords.set(name, (c = { pc, kind, wave: chordVoice(kind, root), hz: chordHz(kind, root), bass, fifth, low: 36 + pc > 43 ? 24 + pc : 36 + pc, tones }));
  }
  return c;
}
/** The nearest note of a chord at least a minor third under `note`: a second voice that never jars. */
function under(note, tones) {
  for (let d = 3; d <= 9; d++) if (tones.includes((note - d) % 12)) return note - d;
  return 0;
}

export class Music {
  /** @param out where it goes (the "music" bus); @param bank the looped noises; @param shapes the oscillator waves */
  constructor(ctx, out, bank, shapes, rand) {
    Object.assign(this, { ctx, bank, shapes, rand });
    const gain = (this.gain = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; });
    this.duck = gain(1, out); // the music steps back a little while a game is played
    this.ducked = 1;
    // a little room behind the quiet music and the orchestra: two echoes answering each other, left and right
    this.send = gain(1);
    this.wet = gain(0.32);
    const a = ctx.createDelay(1), b = ctx.createDelay(1), damp = ctx.createBiquadFilter();
    a.delayTime.value = 0.31; b.delayTime.value = 0.47;
    damp.type = 'lowpass'; damp.frequency.value = 2400;
    this.send.connect(a); a.connect(damp); damp.connect(gain(0.42, b)); b.connect(gain(0.42, a));
    if (ctx.createStereoPanner) {
      const left = ctx.createStereoPanner(), right = ctx.createStereoPanner();
      left.pan.value = -0.55; right.pan.value = 0.55;
      damp.connect(left); b.connect(right); left.connect(this.wet); right.connect(this.wet);
    } else { damp.connect(this.wet); b.connect(this.wet); }
    this.room = false; // (plugged in only while something plays into it)
    this.roomIdle = 0;
    // the notes in the air: when each ends, and its oscillator (so that it can be cut short)
    this.ends = new Float64Array(VOICES);
    this.nodes = new Array(VOICES).fill(null);
    this.calm = new Calm(this);
    this.fair = new Fair(this);
    this.epic = new Epic(this);
  }

  /**
   * One note: an oscillator through its own envelope, gone when the note is over. The level swells to `vel`
   * (time constant `attack`), settles at `sustain` × that (time constant `decay`), and from `t + dur` dies
   * away (time constant `release`). Returns the oscillator, or null when every voice is taken.
   */
  tone(out, wave, hz, t, dur, vel, attack, sustain, decay, release, cents) {
    const ends = this.ends;
    let i = 0;
    while (i < VOICES && ends[i] > t) i++;
    if (i === VOICES) return null;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), e = g.gain, end = t + dur + release * 5;
    this.shapes.dress(o, wave);
    o.frequency.value = hz;
    if (cents) o.detune.value = cents;
    e.value = 0;
    e.setTargetAtTime(vel, t, attack);
    if (sustain < 1) e.setTargetAtTime(vel * sustain, t + attack * 4, decay);
    e.setTargetAtTime(0, t + dur, release);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(end);
    ends[i] = end; this.nodes[i] = o;
    return o;
  }

  /** How many notes are sounding or written ahead (for the performance figures). */
  voices(now) { let n = 0; for (let i = 0; i < VOICES; i++) if (this.ends[i] > now) n++; return n; }

  /** A few times a second: which mood for this place, and the notes of the next third of a second. */
  run(now, L) {
    const climbing = typeof L.climb === 'number', fair = climbing ? 0 : fairness(L.x, L.z);
    this.shapes.tick();
    this._mood(this.epic, climbing ? 1 : 0, now, climbing ? 0.25 : 0.5);
    this._mood(this.fair, fair, now, 0.7);
    this._mood(this.calm, climbing ? 0 : (1 - fair) * (1 - fair), now, 0.9);
    const ducked = (L.game ? 0.55 : 1) * (L.dead ? 0.5 : 1);
    if (ducked !== this.ducked) { this.ducked = ducked; this.duck.gain.setTargetAtTime(ducked, now, 0.3); }
    if (this.calm.on || this.epic.on) { if (!this.room) { this.wet.connect(this.duck); this.room = true; } this.roomIdle = 0; }
    else if (this.room && ++this.roomIdle > 48) { this.wet.disconnect(); this.room = false; } // (once the echoes have died)
    const until = now + AHEAD;
    if (this.calm.on) this.calm.play(now, until);
    if (this.fair.on) this.fair.play(now, until, fair);
    if (this.epic.on) this.epic.play(now, until, L.climb);
  }

  _mood(m, v, now, tau) {
    if (v > 0.004) {
      if (!m.on) { m.on = true; m.begin(now); }
      m.quiet = 0;
    } else {
      v = 0;
      if (m.on && ++m.quiet > 28) { m.on = false; m.end(); } // silent for a few seconds: stop playing
    }
    if (Math.abs(v - m.level) > 0.01) { m.bus.gain.setTargetAtTime(v, now, tau); m.level = v; }
  }

  /** Music switched off: every note is cut, every player stops. */
  silence() {
    const now = this.ctx.currentTime;
    for (const m of [this.calm, this.fair, this.epic]) {
      if (m.on) { m.on = false; m.end(); }
      m.level = 0; m.quiet = 0;
      m.bus.gain.cancelScheduledValues(0); m.bus.gain.value = 0;
    }
    for (let i = 0; i < VOICES; i++) {
      if (this.ends[i] > now) { try { this.nodes[i].stop(); } catch { /* already stopped */ } }
      this.ends[i] = 0; this.nodes[i] = null;
    }
    if (this.room) { this.wet.disconnect(); this.room = false; }
  }
}

// ---------------------------------------------------------------------------
// The quiet music. Nothing is written down but the scale and the chords (see CALM): every phrase is new.

const STEPS = [-2, -1, -1, 1, 1, 2, 3]; // how a phrase moves along the scale
const NEAREST = [0, 1, -1, 2, -2];

class Calm {
  constructor(m) {
    this.m = m;
    this.bus = m.gain(0, m.duck);
    this.bus.connect(m.gain(0.5, m.send));
    this.level = 0; this.on = false; this.quiet = 0;
    this.field = -1;
    this.len = 0; // the last phrase: its notes (steps of the scale) and their lengths
    this.deg = new Int8Array(8);
    this.dur = new Float32Array(8);
    this.nextChord = this.nextPhrase = 0;
  }
  begin(t) {
    this.m.shapes.warm(['padAdd9', 'pianoLow', 'piano', 'padSus', 'padMinor', 'pianoHigh']);
    this.nextChord = t + 0.05; this.nextPhrase = t + 2 + 3 * this.m.rand();
  }
  end() {}

  play(now, until) {
    if (this.nextChord < until) this._chord(Math.max(this.nextChord, now + 0.02));
    if (this.nextPhrase < until) this._phrase(Math.max(this.nextPhrase, now + 0.02));
  }

  /** A new colour under the piano: one soft chord fades in while the last one fades out. */
  _chord(t) {
    const m = this.m, r = m.rand, n = CALM.fields.length;
    let i = (r() * n) | 0;
    if (i === this.field) i = (i + 1 + ((r() * (n - 1)) | 0)) % n; // never the same twice running
    this.field = i;
    const f = CALM.fields[i], len = 13 + 8 * r(), hz = midiHz(f.root) / (f.wave === 'padMinor' ? 10 : 4);
    // two oscillators a hair apart: the chord breathes
    m.tone(this.bus, f.wave, hz, t, len, LEVEL.pad, 1.5, 1, 0, 1.6, -4);
    m.tone(this.bus, f.wave, hz, t, len, LEVEL.pad, 1.5, 1, 0, 1.6, 4);
    this._key(f.bass, t + 0.4 + r(), LEVEL.pianoBass * (0.6 + 0.4 * r()));
    this.nextChord = t + len - 1.5;
  }

  /** A few notes of the piano, then a long silence. */
  _phrase(t) {
    const m = this.m, r = m.rand, ladder = CALM.ladder, deg = this.deg, dur = this.dur, roll = r();
    let n = this.len;
    if (!n || roll < 0.45) {
      // a new shape: a few steps up and down the scale
      n = 2 + ((r() * 4) | 0);
      for (let i = 0, d = 4 + ((r() * 5) | 0); i < n; i++) {
        deg[i] = d; dur[i] = 1 + ((r() * 3) | 0);
        d += STEPS[(r() * STEPS.length) | 0];
        d = d < 2 ? 3 : d > 11 ? 10 : d;
      }
    } else if (roll < 0.8) {
      // the last one again, a step higher or lower
      const shift = r() < 0.5 ? -1 : 1;
      for (let i = 0; i < n; i++) deg[i] = Math.min(12, Math.max(1, deg[i] + shift));
    } else if (n > 2) {
      // only its tail, slower
      deg[0] = deg[n - 2]; deg[1] = deg[n - 1]; dur[0] = 2 + (r() < 0.5 ? 1 : 0); n = 2;
    }
    this.len = n;
    // it comes to rest on a note of the chord underneath
    const rest = CALM.fields[this.field < 0 ? 1 : this.field].rest;
    for (const k of NEAREST) { const d = deg[n - 1] + k; if (d >= 1 && d <= 12 && rest.includes(ladder[d] % 12)) { deg[n - 1] = d; break; } }
    const unit = 0.42 + 0.1 * r(), soft = 0.55 + 0.45 * r();
    let at = t;
    for (let i = 0; i < n; i++) {
      const v = LEVEL.piano * soft * (0.7 + 0.3 * r());
      this._key(ladder[deg[i]], at + 0.02 * r(), v);
      if (i === n - 1 && r() < 0.3) this._key(ladder[Math.max(0, deg[i] - 2)], at + 0.03, v * 0.6); // now and then two notes together
      at += dur[i] * unit;
    }
    if (r() < 0.2) this._key(ladder[deg[n - 1]] + 12, at + unit, LEVEL.piano * soft * 0.35); // or the last note again, far above
    this.nextPhrase = at + 3.5 + 7.5 * r();
  }

  /** One key of the felt piano: a soft blow, a quick fall, a long ring (longer for low notes). */
  _key(note, t, v) {
    const r = this.m.rand;
    this.m.tone(this.bus, note < 55 ? 'pianoLow' : note < 76 ? 'piano' : 'pianoHigh', midiHz(note), t, 0.25, v, 0.007, 0.45, 0.22, 1.9 - (note - 57) * 0.03, (r() - 0.5) * 5);
  }
}

// ---------------------------------------------------------------------------
// The fairground organ: a waltz. Oom on the first beat (a deep pipe), pah-pah on the next two (the chord,
// one oscillator), the tune on top; stops, second voice and bells change from one phrase to the next.

let waltz = null;
function waltzScore() {
  if (!waltz) {
    waltz = { intro: harmony(WALTZ.intro) };
    for (const name in WALTZ.phrases) { const [names, tune] = WALTZ.phrases[name]; waltz[name] = { chords: names.split(' ').map(harmony), bars: melody(tune, 3) }; }
  }
  return waltz;
}

class Fair {
  constructor(m) {
    this.m = m;
    this.bus = m.gain(0, m.duck);
    // heard from afar the fair is only its low notes: the filter opens as one walks up to it
    this.far = m.ctx.createBiquadFilter();
    this.far.type = 'lowpass'; this.far.frequency.value = 900; this.far.connect(this.bus);
    this.hz = 900;
    this.pipes = m.gain(1, this.far); // every pipe goes through the tremulant
    this.level = 0; this.on = false; this.quiet = 0;
    this.lfo = null;
    this.beat = 60 / WALTZ.bpm;
    this.t = 0; this.bar = 0; this.b = 0; this.at = 0; this.pass = 0;
    this.alt = false;
    this.stop = 'principal'; this.duet = false; this.bells = false; this.phrase = null;
  }

  begin(t) {
    const m = this.m, ctx = m.ctx;
    this.song = waltzScore();
    m.shapes.warm(['bourdon', 'maj0', 'principal', 'min0', 'dom2', 'flute', 'min1', 'dom0', 'maj2', 'chime', 'piccolo', 'reed', 'maj1']);
    // the tremulant: a slow wobble of the wind that feeds all the pipes
    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 6.1;
    this.depth = m.gain(LEVEL.tremulant, this.pipes.gain);
    this.lfo.connect(this.depth);
    this.lfo.start(t);
    this.t = t + 0.12; this.bar = -2; this.b = 0; // (two bars of oom-pah-pah before the tune)
    this._register();
  }
  end() { this.lfo.stop(); this.lfo.disconnect(); this.depth.disconnect(); this.lfo = this.depth = null; }

  /** Which pipes for the phrase that starts: never quite the same from one time round to the next. */
  _register() {
    const r = this.m.rand, name = WALTZ.form[this.at % WALTZ.form.length], strain = name[0], second = name[1] === '2', odd = (this.pass & 1) === 1;
    this.phrase = this.song[name];
    this.stop = strain === 'A' ? (odd && second ? 'reed' : 'principal') : strain === 'B' ? (odd !== second ? 'flute' : 'piccolo') : second ? 'principal' : 'flute';
    if (r() < 0.15) this.stop = 'reed';
    this.duet = strain === 'C' ? r() < 0.8 : second ? r() < 0.65 : r() < 0.15;
    this.bells = second ? r() < 0.6 : odd && r() < 0.4;
  }

  _advance() {
    if (++this.b < 3) return;
    this.b = 0;
    if (++this.bar < 8) return;
    this.bar = 0;
    if (this.at % WALTZ.form.length === WALTZ.form.length - 1) this.pass++;
    this.at++;
    this._register();
  }

  play(now, until, near) {
    if (this.t < now) {
      // the page stalled: jump to where the tune would be by now rather than play catch-up
      const skip = Math.ceil((now + 0.03 - this.t) / this.beat);
      for (let i = 0; i < skip; i++) this._advance();
      this.t += skip * this.beat;
    }
    for (; this.t < until; this.t += this.beat) { this._beat(this.t); this._advance(); }
    const hz = 700 + 9500 * near * near;
    if (Math.abs(hz - this.hz) > 0.05 * this.hz) { this.hz = hz; this.far.frequency.setTargetAtTime(hz, now, 0.5); }
  }

  _beat(t) {
    const m = this.m, r = m.rand, beat = this.beat, bar = this.bar, b = this.b, out = this.pipes;
    const c = bar < 0 ? this.song.intro : this.phrase.chords[bar];
    if (b === 0) {
      // oom: the root — or the fifth, when the chord of the last bar goes on
      this.alt = bar !== 0 && (bar < 0 ? bar === -1 : this.phrase.chords[bar - 1] === c) && !this.alt;
      m.tone(out, 'bourdon', midiHz(this.alt ? c.fifth : c.bass), t, beat * 0.8, LEVEL.oom, 0.012, 1, 0, 0.05, 0);
    } else m.tone(out, c.wave, c.hz, t, beat * 0.42, LEVEL.pah, 0.008, 1, 0, 0.04, 0); // pah, pah
    if (bar < 0) return;
    const notes = this.phrase.bars[bar];
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n[0] < b || n[0] >= b + 1) continue;
      const at = t + (n[0] - b) * beat, len = n[2] * beat * 0.9 - 0.03, cents = (r() - 0.5) * 14; // (no two pipes quite in tune)
      const o = m.tone(out, this.stop, midiHz(n[1]), at, len, LEVEL.tune, 0.014, 1, 0, 0.035, cents);
      if (o) { o.detune.setValueAtTime(cents - 30, at); o.detune.setTargetAtTime(cents, at, 0.02); } // a pipe speaks a little flat at first
      if (this.duet) { const second = under(n[1], c.tones); if (second) m.tone(out, 'flute', midiHz(second), at, len, LEVEL.second, 0.014, 1, 0, 0.035, -cents); }
      if (this.bells && (n[0] === 0 || n[2] >= 2)) m.tone(out, 'chime', midiHz(n[1] + 12), at, 0.04, LEVEL.bell, 0.003, 1, 0, 0.22, 0);
    }
  }
}

// ---------------------------------------------------------------------------
// The orchestra of the climb. From the first stone: a pulse of low strings (three-three-two) and held basses.
// From a quarter of the way up: the big drum. From half-way: the theme, on the brass. Near the top: everything
// — the brass in octaves, a choir, snare and cymbals, the pulse twice as fast.

let climb = null;
function climbScore() {
  if (!climb) climb = { chords: CLIMB.chords.split(' ').map(harmony), theme: melody(CLIMB.theme, 4) };
  return climb;
}

class Epic {
  constructor(m) {
    this.m = m;
    this.bus = m.gain(0, m.duck);
    this.bus.connect(m.gain(0.16, m.send));
    this.level = 0; this.on = false; this.quiet = 0;
    this.eighth = 30 / CLIMB.bpm;
    this.t = 0; this.step = 0;
    this.p = 0; // the height reached (0..1), smoothed
    this.lead = this.full = false;
    this.kit = null;
  }

  /** The players who never stop: made when the climb starts, gone when it ends. Each note only re-tunes and re-strikes them. */
  begin(t) {
    const m = this.m, ctx = m.ctx, rate = ctx.sampleRate, bus = this.bus;
    this.score = climbScore();
    m.shapes.warm(['pulse', 'strings', 'min2', 'maj0', 'maj1', 'maj2', 'brass']);
    const osc = (wave) => { const o = ctx.createOscillator(); m.shapes.dress(o, wave); o.start(t); return o; };
    const band = (type, hz, q, to) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.Q.value = q; f.connect(to); return f; };
    const pulse = osc('pulse'), drum = osc('sine'), noise = ctx.createBufferSource();
    noise.buffer = m.bank.get('white'); noise.loop = true; noise.start(t);
    const k = (this.kit = { pulse, drum, noise, pulseEnv: m.gain(0, bus), drumEnv: m.gain(0, bus), slapEnv: m.gain(0, bus), hatEnv: m.gain(0, bus), snareEnv: m.gain(0, bus) });
    pulse.connect(band('lowpass', 1700, 0.8, k.pulseEnv));
    drum.connect(k.drumEnv);
    noise.connect(band('lowpass', 1100, 0.7, k.slapEnv));
    noise.connect(band('highpass', 7500, 0.7, k.hatEnv));
    noise.connect(band('bandpass', 1900, 0.8, k.snareEnv));
    k.slap = noiseGain('white', 'lowpass', 1100, 0.7, rate) * LEVEL.slap;
    k.hat = noiseGain('white', 'highpass', 7500, 0.7, rate) * LEVEL.hat;
    k.snare = noiseGain('white', 'bandpass', 1900, 0.8, rate) * LEVEL.snare;
    this.t = t + 0.12; this.step = 0; this.p = -1;
    this.lead = this.full = false;
  }
  end() {
    const k = this.kit;
    for (const n of [k.pulse, k.drum, k.noise]) { n.stop(); n.disconnect(); }
    for (const g of [k.pulseEnv, k.drumEnv, k.slapEnv, k.hatEnv, k.snareEnv]) g.disconnect();
    this.kit = null;
  }

  play(now, until, height) {
    const h = typeof height === 'number' ? sat(height) : this.p;
    this.p = this.p < 0 ? h : this.p + (h - this.p) * 0.25; // (the orchestra does not jump with every stone)
    if (this.t < now) { const skip = Math.ceil((now + 0.03 - this.t) / this.eighth); this.step = (this.step + skip) % 128; this.t += skip * this.eighth; }
    for (; this.t < until; this.t += this.eighth) { this._eighth(this.t, this.step); this.step = (this.step + 1) % 128; }
  }

  /** One eighth note of the sixteen bars. */
  _eighth(t, s) {
    const m = this.m, k = this.kit, E = this.eighth, bar = s >> 3, e = s & 7, c = this.score.chords[bar], p = this.p, bus = this.bus;
    // newcomers wait for a bar line — the theme, for the start of its eight bars
    if (e === 0) { if ((bar & 7) === 0) this.lead = p > 0.47; if ((bar & 3) === 0) this.full = p > 0.77; }
    const full = this.full, accent = e === 0 || e === 3 || e === 6;

    // the pulse: the root, an octave higher on the accents
    this._strike(k.pulse, k.pulseEnv, t, midiHz(c.low + (accent && e ? 24 : 12)), LEVEL.pulse * (accent ? 1 : 0.55) * (0.75 + 0.25 * p), 0.004, 0.05, 0.045);
    if (full) this._strike(k.pulse, k.pulseEnv, t + E / 2, midiHz(c.low + 12), LEVEL.pulse * 0.45, 0.004, 0.04, 0.04);
    // the basses hold the root and its fifth through the bar, and swell with the height
    if (e === 0) {
      const v = LEVEL.strings * (0.6 + 0.4 * p), len = E * 8 - 0.06;
      m.tone(bus, 'strings', midiHz(c.low), t, len, v, 0.09, 1, 0, 0.12, -5);
      m.tone(bus, 'strings', midiHz(c.low + 7), t, len, v * 0.8, 0.09, 1, 0, 0.12, 5);
      if (full) m.tone(bus, c.wave, c.hz * 2, t, len, LEVEL.choir, 0.14, 1, 0, 0.15, 0); // the choir: the whole chord, one oscillator
      if (full && (bar & 7) === 0) this._cymbal(t);
    }
    // the big drum: three-three-two, and a run into every fourth bar line
    const drums = smooth(0.2, 0.3, p);
    if (drums > 0) {
      const hit = e === 0 ? 1 : e === 3 ? 0.7 : e === 6 ? 0.8 : (bar & 3) === 3 && (e === 7 || (e === 5 && p > 0.5)) ? 0.6 : 0;
      if (hit) {
        const v = hit * drums, f = k.drum.frequency;
        f.setValueAtTime(108, t); f.exponentialRampToValueAtTime(46, t + 0.11); // the skin: a note that drops as it rings
        k.drumEnv.gain.setTargetAtTime(LEVEL.drum * v, t, 0.002); k.drumEnv.gain.setTargetAtTime(0, t + 0.03, 0.09);
        k.slapEnv.gain.setTargetAtTime(k.slap * v, t, 0.001); k.slapEnv.gain.setTargetAtTime(0, t + 0.008, 0.02);
      }
    }
    // from half-way up: something ticking on top, and the theme
    const ticks = smooth(0.45, 0.55, p);
    if (ticks > 0) {
      k.hatEnv.gain.setTargetAtTime(k.hat * ticks * (e & 1 ? 1 : 0.5), t, 0.001); k.hatEnv.gain.setTargetAtTime(0, t + 0.004, 0.018);
      if (full) { k.hatEnv.gain.setTargetAtTime(k.hat * 0.5, t + E / 2, 0.001); k.hatEnv.gain.setTargetAtTime(0, t + E / 2 + 0.004, 0.012); }
    }
    if (full && (e === 2 || e === 6)) { k.snareEnv.gain.setTargetAtTime(k.snare, t, 0.001); k.snareEnv.gain.setTargetAtTime(0, t + 0.01, 0.05); }
    if (this.lead) {
      const notes = this.score.theme[bar];
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        if (n[0] * 2 !== e) continue;
        const len = n[2] * 2 * E * 0.92;
        m.tone(bus, 'brass', midiHz(n[1]), t, len, LEVEL.brass, 0.025, 0.8, 0.3, 0.06, -6);
        if (full) m.tone(bus, 'brass', midiHz(n[1] - 12), t, len, LEVEL.brass * 0.8, 0.03, 0.8, 0.3, 0.06, 6); // in octaves
      }
    }
  }

  /** Re-tune a standing oscillator and strike it. */
  _strike(o, env, t, hz, v, attack, hold, release) {
    o.frequency.setValueAtTime(hz, t);
    env.gain.setTargetAtTime(v, t, attack);
    env.gain.setTargetAtTime(0, t + hold, release);
  }

  _cymbal(t) {
    const ctx = this.m.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.m.bank.get('white');
    f.type = 'highpass'; f.frequency.value = 5200;
    g.gain.value = 0;
    g.gain.setTargetAtTime(noiseGain('white', 'highpass', 5200, 0.7, ctx.sampleRate) * LEVEL.cymbal, t, 0.004);
    g.gain.setTargetAtTime(0, t + 0.03, 0.55);
    s.connect(f); f.connect(g); g.connect(this.bus);
    s.start(t, this.m.rand() * 0.2, 2.8);
  }
}
