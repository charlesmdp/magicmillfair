// One-shot effects, all synthesised: each is a handful of oscillators that glide and bursts of noise through a
// sweeping filter, made when the effect is asked for and gone when it has rung out.
import { midi, midiHz, noiseGain, blockRate } from './synth.js';
import { FANFARE, LAMENT } from './tunes.js';

const VOICES = 40; // never more oscillators and noise bursts than this at once
const GAP = 0.04; // the same effect asked twice within this many seconds is played once

// The partials of a big bell: [ratio to the note struck, level, how long it rings (time constant)].
const BELL = [[0.5, 0.12, 0.5], [1, 0.2, 0.42], [1.19, 0.12, 0.33], [1.5, 0.08, 0.25], [2, 0.14, 0.22], [2.51, 0.06, 0.16], [3.01, 0.05, 0.12], [4.07, 0.03, 0.08]];
const RISE = [523.3, 659.3, 784, 1046.5]; // c e g c: someone gets up again
const SWELL = [293.7, 440, 587.3, 740, 880]; // fifths piled up: an animal of light appears
const LAP = [1046.5, 1318.5, 1568, 2093];

/**
 * The recipes. `s.tone(t, wave, f0, f1, glide, level, attack, hold, release)`: an oscillator that slides from
 * f0 to f1 Hz in `glide` s, swells (time constant `attack`), holds until `t + hold`, dies away (`release`).
 * `s.noise(t, colour, filter, f0, f1, Q, level, attack, hold, release)`: noise through a filter that sweeps from
 * f0 to f1. Levels: the peak of a tone, the loudness (RMS) of a noise; 1 = full scale.
 */
const RECIPES = {
  __proto__: null,
  jump(s, t) {
    s.tone(t, 'sine', 250, 520, 0.13, 0.2, 0.012, 0.07, 0.035);
    s.noise(t, 'white', 'bandpass', 900, 2200, 0.8, 0.035, 0.012, 0.05, 0.03);
  },
  land(s, t) {
    s.tone(t, 'sine', 135, 52, 0.09, 0.38, 0.003, 0.02, 0.05);
    s.noise(t, 'pink', 'lowpass', 650, 250, 0.7, 0.09, 0.002, 0.015, 0.04);
  },
  splash(s, t) {
    s.noise(t, 'white', 'bandpass', 2400, 700, 0.7, 0.11, 0.004, 0.05, 0.14);
    s.noise(t, 'pink', 'lowpass', 520, 200, 0.7, 0.1, 0.004, 0.03, 0.09);
    for (let i = 0; i < 3; i++) { const f = 900 + 900 * s.rand(); s.tone(t + 0.12 + i * 0.07 + 0.03 * s.rand(), 'sine', f, f * 1.6, 0.04, 0.07, 0.002, 0.012, 0.03); } // drops falling back
  },
  dive(s, t) {
    s.noise(t, 'white', 'bandpass', 3000, 500, 0.6, 0.13, 0.004, 0.12, 0.3);
    s.noise(t, 'brown', 'lowpass', 320, 90, 0.7, 0.2, 0.005, 0.08, 0.22); // the body going under
    s.noise(t + 0.15, 'white', 'highpass', 4200, 4200, 0.7, 0.045, 0.06, 0.3, 0.3); // foam
    for (let i = 0; i < 5; i++) { const f = 380 + 500 * s.rand(); s.tone(t + 0.3 + i * 0.11 + 0.05 * s.rand(), 'sine', f, f * 1.7, 0.05, 0.08, 0.003, 0.015, 0.035); } // bubbles coming up
  },
  jet(s, t) {
    s.noise(t, 'pink', 'bandpass', 500, 1500, 1.2, 0.1, 0.04, 1.3, 0.07);
    s.noise(t, 'white', 'highpass', 3000, 3000, 0.7, 0.04, 0.04, 1.3, 0.07);
    s.tone(t, 'pulse', 62, 96, 1.3, 0.12, 0.03, 1.3, 0.07);
  },
  pick(s, t) {
    s.noise(t, 'white', 'bandpass', 3000, 3000, 1, 0.02, 0.002, 0.008, 0.015); // the stem snaps
    s.tone(t, 'sine', 990, 1320, 0.04, 0.15, 0.002, 0.012, 0.06);
    s.tone(t + 0.06, 'sine', 1480, 1480, 0, 0.09, 0.002, 0.012, 0.09);
  },
  eat(s, t) {
    s.noise(t, 'white', 'bandpass', 1800, 1200, 1.5, 0.03, 0.003, 0.02, 0.02);
    s.tone(t + 0.02, 'sine', 380, 190, 0.08, 0.26, 0.006, 0.05, 0.025);
    s.tone(t + 0.14, 'sine', 210, 330, 0.07, 0.22, 0.006, 0.045, 0.025);
  },
  // a firework: the rocket leaving with a whistle, then its burst and the crackle that follows
  rocket(s, t) {
    s.noise(t, 'white', 'bandpass', 1400, 4200, 2.5, 0.07, 0.01, 0.9, 0.25);
    s.tone(t, 'sine', 900, 2300, 1.1, 0.05, 0.02, 0.9, 0.2);
  },
  bang(s, t) {
    s.tone(t, 'sine', 150, 46, 0.25, 0.4, 0.002, 0.05, 0.22);
    s.noise(t, 'pink', 'lowpass', 2600, 500, 0.7, 0.2, 0.002, 0.06, 0.35);
    for (let i = 0; i < 7; i++) s.noise(t + 0.18 + i * 0.07 + 0.05 * s.rand(), 'white', 'highpass', 3600, 3600, 0.7, 0.045, 0.002, 0.012, 0.05); // the crackle
  },
  // the big red button: the clunk of the press and a hand-cranked siren winding up…
  press(s, t) {
    s.tone(t, 'sine', 190, 70, 0.07, 0.4, 0.002, 0.02, 0.06);
    s.noise(t, 'pink', 'lowpass', 900, 300, 0.7, 0.1, 0.002, 0.02, 0.05);
    s.tone(t + 0.15, 'pulse', 220, 660, 1.5, 0.11, 0.2, 1.6, 0.35);
    s.tone(t + 0.15, 'pulse', 223, 668, 1.5, 0.08, 0.2, 1.6, 0.35);
  },
  // …and, when the blast wave arrives: a crack, a thump felt in the chest, a roar that rolls away over the hills
  boom(s, t) {
    s.noise(t, 'white', 'highpass', 1800, 500, 0.7, 0.12, 0.002, 0.05, 0.22);
    s.tone(t, 'sine', 72, 24, 2.2, 0.44, 0.004, 0.7, 0.8);
    s.tone(t + 0.08, 'sine', 44, 30, 3.4, 0.2, 0.05, 2.4, 0.9);
    s.noise(t, 'brown', 'lowpass', 440, 70, 0.7, 0.3, 0.01, 2.6, 1.0);
    s.noise(t + 0.7, 'pink', 'lowpass', 210, 60, 0.7, 0.16, 0.4, 4.4, 1.0);
  },
  wasted(s, t) {
    s.tone(t, 'sine', 92, 36, 0.5, 0.5, 0.004, 0.1, 0.28);
    s.tone(t, 'brass', 73.4, 69.3, 1.2, 0.18, 0.02, 0.6, 0.3); // two low notes that grate against each other, sinking
    s.tone(t, 'brass', 103.8, 98, 1.2, 0.15, 0.02, 0.6, 0.3);
    s.noise(t, 'brown', 'lowpass', 420, 120, 0.7, 0.12, 0.01, 0.3, 0.35);
  },
  respawn(s, t) {
    for (let i = 0; i < 4; i++) s.tone(t + i * 0.07, 'pianoHigh', RISE[i], RISE[i], 0, 0.13, 0.004, 0.03, 0.13);
    s.noise(t, 'white', 'bandpass', 1500, 5000, 1.5, 0.025, 0.1, 0.15, 0.12);
  },
  teleport(s, t) {
    for (let i = 0; i < 6; i++) { const f = 700 * 1.31 ** i; s.tone(t + i * 0.05, 'sine', f, f * 1.6, 0.8, 0.06, 0.03, 0.4, 0.17); } // a shimmer that rises
    s.noise(t, 'white', 'bandpass', 900, 6000, 2, 0.045, 0.15, 0.5, 0.13);
    s.tone(t, 'sine', 180, 90, 0.5, 0.13, 0.02, 0.3, 0.12);
  },
  chat(s, t) {
    s.tone(t, 'sine', 740, 880, 0.03, 0.1, 0.003, 0.03, 0.035);
    s.tone(t + 0.07, 'sine', 1109, 1109, 0, 0.06, 0.003, 0.02, 0.05);
  },
  emote(s, t) { s.noise(t, 'white', 'bandpass', 500, 2600, 1.5, 0.07, 0.06, 0.1, 0.06); },
  rank(s, t) {
    for (let i = 0; i < 5; i++) s.tone(t + i * 0.08, 'pianoHigh', SWELL[i], SWELL[i] * 1.006, 2, 0.075, 0.3, 1.1, 0.22);
    s.noise(t, 'white', 'bandpass', 4000, 9000, 3, 0.02, 0.5, 1, 0.22);
    s.tone(t, 'sine', 73.4, 73.4, 0, 0.2, 0.4, 0.9, 0.22);
  },
  click(s, t) {
    s.tone(t, 'sine', 1500, 900, 0.015, 0.11, 0.001, 0.004, 0.012);
    s.noise(t, 'white', 'highpass', 5000, 5000, 0.7, 0.012, 0.001, 0.003, 0.004);
  },
  start(s, t) {
    s.tone(t, 'brass', 392, 392, 0, 0.16, 0.015, 0.12, 0.05); // a horn call, two notes…
    s.tone(t + 0.15, 'brass', 523.3, 523.3, 0, 0.18, 0.015, 0.4, 0.07);
    s.tone(t + 0.15, 'sine', 1046.5, 1046.5, 0, 0.1, 0.002, 0.01, 0.45); // …and a bell on the second
    s.tone(t + 0.15, 'sine', 2888, 2888, 0, 0.05, 0.002, 0.01, 0.3);
    s.tone(t + 0.15, 'sine', 5651, 5651, 0, 0.025, 0.002, 0.01, 0.2);
  },
  tick(s, t) {
    s.tone(t, 'sine', 1100, 1100, 0, 0.18, 0.001, 0.004, 0.02);
    s.tone(t, 'sine', 1650, 1650, 0, 0.07, 0.001, 0.003, 0.012);
  },
  checkpoint(s, t) {
    s.tone(t, 'pianoHigh', 784, 784, 0, 0.15, 0.003, 0.02, 0.12);
    s.tone(t + 0.09, 'pianoHigh', 1174.7, 1174.7, 0, 0.16, 0.003, 0.02, 0.16);
  },
  victory(s, t) {
    const b = FANFARE.beat;
    for (const [name, at, len] of FANFARE.tune) { const hz = midiHz(midi(name)); s.tone(t + at * b, 'brass', hz, hz, 0, 0.15, 0.02, len * b * 0.9, 0.05); }
    for (const [name, at, len] of FANFARE.chord) { const hz = midiHz(midi(name)); s.tone(t + at * b, 'brass', hz, hz, 0, 0.085, 0.03, len * b * 0.9, 0.07); }
    for (const at of FANFARE.drums) s.tone(t + at * b, 'sine', 150, 70, 0.12, 0.32, 0.002, 0.03, 0.1); // kettledrums
    s.noise(t + 4 * b, 'white', 'highpass', 5000, 5000, 0.7, 0.05, 0.005, 0.1, 0.4); // a cymbal on the last chord
  },
  fail(s, t) {
    const b = LAMENT.beat, tune = LAMENT.tune;
    for (let i = 0; i < tune.length; i++) {
      const [name, at, len] = tune[i], hz = midiHz(midi(name));
      s.tone(t + at * b, 'brass', hz, i === tune.length - 1 ? hz * 0.89 : hz, len * b, 0.17, 0.025, len * b * 0.9, 0.06); // (the last note sags)
    }
    s.tone(t + 1.75 * b, 'sine', 110, 50, 0.3, 0.3, 0.004, 0.05, 0.12);
  },
  score(s, t) {
    s.tone(t, 'triangle', 660, 880, 0.05, 0.16, 0.003, 0.04, 0.02);
    s.tone(t + 0.06, 'triangle', 1320, 1320, 0, 0.14, 0.003, 0.03, 0.05);
  },
  shot(s, t) {
    s.tone(t, 'sine', 520, 140, 0.05, 0.38, 0.001, 0.008, 0.028); // the cork leaves the barrel
    s.noise(t, 'white', 'bandpass', 1400, 1400, 1, 0.085, 0.001, 0.005, 0.018);
  },
  hit(s, t) {
    s.noise(t, 'white', 'highpass', 4000, 4000, 0.7, 0.03, 0.001, 0.003, 0.004);
    s.tone(t, 'sine', 1320, 1320, 0, 0.15, 0.001, 0.005, 0.22); // a tin plate: partials that are no chord
    s.tone(t, 'sine', 2257, 2257, 0, 0.09, 0.001, 0.005, 0.16);
    s.tone(t, 'sine', 3815, 3815, 0, 0.05, 0.001, 0.005, 0.11);
    s.tone(t, 'sine', 5544, 5544, 0, 0.028, 0.001, 0.005, 0.07);
  },
  miss(s, t) {
    s.noise(t, 'white', 'bandpass', 1500, 500, 1.2, 0.035, 0.02, 0.04, 0.045);
    s.tone(t + 0.03, 'sine', 200, 130, 0.06, 0.12, 0.004, 0.02, 0.035);
  },
  whack(s, t) {
    s.tone(t, 'sine', 165, 58, 0.07, 0.46, 0.002, 0.015, 0.055);
    s.noise(t, 'pink', 'lowpass', 900, 500, 0.7, 0.09, 0.001, 0.008, 0.028);
  },
  mole(s, t) {
    s.tone(t, 'sine', 300, 120, 0.03, 0.18, 0.001, 0.006, 0.02);
    s.tone(t + 0.015, 'sine', 600, 1900, 0.06, 0.17, 0.004, 0.045, 0.025);
  },
  squirt(s, t) {
    s.noise(t, 'white', 'bandpass', 3200, 4500, 2, 0.07, 0.01, 0.26, 0.025);
    s.noise(t, 'pink', 'bandpass', 900, 1300, 3, 0.035, 0.01, 0.26, 0.025);
  },
  gulp(s, t) {
    s.tone(t, 'sine', 300, 150, 0.07, 0.28, 0.005, 0.045, 0.02);
    s.tone(t + 0.09, 'sine', 160, 260, 0.06, 0.22, 0.005, 0.04, 0.02);
  },
  bell(s, t) {
    s.noise(t, 'white', 'bandpass', 2500, 2500, 1, 0.04, 0.001, 0.006, 0.006); // the clapper
    for (const [ratio, level, ring] of BELL) s.tone(t, 'sine', 392 * ratio, 392 * ratio, 0, level * 0.85, 0.002, 0.01, ring);
  },
  boost(s, t) {
    s.noise(t, 'pink', 'bandpass', 300, 3200, 1.5, 0.1, 0.12, 0.35, 0.05);
    s.tone(t, 'pulse', 110, 330, 0.45, 0.1, 0.05, 0.35, 0.045);
  },
  drift(s, t) {
    s.noise(t, 'white', 'bandpass', 1900, 1500, 9, 0.09, 0.02, 0.42, 0.035); // rubber on the road: two narrow, sliding bands
    s.noise(t, 'white', 'bandpass', 2700, 2150, 10, 0.05, 0.02, 0.42, 0.035);
  },
  lap(s, t) { for (let i = 0; i < 4; i++) s.tone(t + i * 0.07, 'pianoHigh', LAP[i], LAP[i], 0, i === 3 ? 0.08 : 0.12, 0.003, 0.02, 0.1); },
  cheer(s, t) {
    // a few throats rising together, and hands clapping
    for (let i = 0; i < 5; i++) { const f = 190 + 240 * s.rand(), d = 0.25 + 0.2 * s.rand(); s.tone(t + 0.5 * s.rand(), 'reed', f, f * 1.3, d, 0.42, 0.04, d, 0.05, s.throat(800 + 500 * s.rand(), 4)); }
    for (let i = 0; i < 9; i++) s.noise(t + 0.1 + 1.1 * s.rand(), 'white', 'bandpass', 1800, 1800, 1.2, 0.05, 0.001, 0.006, 0.012);
  },
  rage(s, t) {
    const throat = s.throat(620, 2);
    s.tone(t, 'reed', 96, 72, 0.6, 0.5, 0.03, 0.5, 0.05, throat); // two low reeds a little apart: the growl is their beating
    s.tone(t, 'reed', 119, 91, 0.6, 0.45, 0.03, 0.5, 0.05, throat);
    s.tone(t + 0.62, 'sine', 140, 70, 0.08, 0.25, 0.004, 0.03, 0.04);
  },
  coin(s, t) {
    s.tone(t, 'sine', 2637, 2637, 0, 0.11, 0.001, 0.004, 0.035);
    s.tone(t, 'sine', 3951, 3951, 0, 0.06, 0.001, 0.004, 0.03);
    s.tone(t + 0.07, 'sine', 3520, 3520, 0, 0.13, 0.001, 0.004, 0.2);
    s.tone(t + 0.07, 'sine', 5274, 5274, 0, 0.06, 0.001, 0.004, 0.14);
  },
};

/** The names `play()` knows. */
export const SOUNDS = Object.freeze(Object.keys(RECIPES));

export class Effects {
  /** @param out where they go (the "sound" bus); @param bank the looped noises; @param shapes the oscillator waves */
  constructor(ctx, out, bank, shapes, rand) {
    Object.assign(this, { ctx, out, bank, shapes, rand });
    this.ends = new Float64Array(VOICES); // when each voice in the air ends…
    this.nodes = new Array(VOICES).fill(null); // …and its source, so that it can be cut short
    this.last = { __proto__: null };
    for (const name of SOUNDS) this.last[name] = -1;
    this.volume = 1;
    this.rate = 1;
  }

  /** Play an effect now. `rate` raises (or lowers) its pitch. Unknown names do nothing. */
  play(name, volume, rate) {
    const recipe = RECIPES[name], now = this.ctx.currentTime;
    if (!recipe || now - this.last[name] < GAP) return;
    this.last[name] = now;
    this.volume = volume; this.rate = rate;
    recipe(this, now + 0.005);
  }

  /** Sound switched off: cut everything short. */
  silence() {
    const now = this.ctx.currentTime;
    for (let i = 0; i < VOICES; i++) {
      if (this.ends[i] > now) { try { this.nodes[i].stop(); } catch { /* already stopped */ } }
      this.ends[i] = 0; this.nodes[i] = null;
    }
  }

  /** How many voices are in the air (for the performance figures). */
  voices(now) { let n = 0; for (let i = 0; i < VOICES; i++) if (this.ends[i] > now) n++; return n; }

  _take(node, start, end) {
    const ends = this.ends;
    let i = 0;
    while (i < VOICES && ends[i] > start) i++;
    if (i === VOICES) return false;
    ends[i] = end; this.nodes[i] = node;
    return true;
  }

  tone(t, wave, f0, f1, glide, level, attack, hold, release, to = this.out) {
    const ctx = this.ctx, o = ctx.createOscillator(), end = t + hold + release * 6, k = this.rate;
    if (!this._take(o, t, end)) return;
    const g = ctx.createGain();
    this.shapes.dress(o, wave);
    o.frequency.setValueAtTime(f0 * k, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1 * k, t + glide);
    g.gain.value = 0;
    g.gain.setTargetAtTime(level * this.volume, t, attack);
    g.gain.setTargetAtTime(0, t + hold, release);
    o.connect(g); g.connect(to);
    o.start(t); o.stop(end);
  }

  noise(t, color, type, f0, f1, q, level, attack, hold, release) {
    const ctx = this.ctx, s = ctx.createBufferSource(), end = t + hold + release * 6, k = this.rate;
    if (!this._take(s, t, end)) return;
    const f = ctx.createBiquadFilter(), g = ctx.createGain(), buffer = this.bank.get(color);
    s.buffer = buffer; s.loop = true;
    f.type = type; f.Q.value = q;
    blockRate(f.frequency).setValueAtTime(f0 * k, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1 * k, t + hold + release * 2);
    g.gain.value = 0;
    g.gain.setTargetAtTime(level * this.volume * noiseGain(color, type, Math.sqrt(f0 * f1) * k, q, ctx.sampleRate), t, attack);
    g.gain.setTargetAtTime(0, t + hold, release);
    s.connect(f); f.connect(g); g.connect(this.out);
    s.start(t, this.rand() * (buffer.duration - 0.05)); s.stop(end);
  }

  /** A resonance to sing through: makes a voice of an oscillator. */
  throat(hz, q) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = hz * this.rate; f.Q.value = q;
    f.connect(this.out);
    return f;
  }
}
