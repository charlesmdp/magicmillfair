// The sound of each place: looped textures of filtered noise (the sea, the falls, the brooks, the wind) whose
// levels follow the listener, a few passing voices (birds, a gull, crickets and frogs, drips in the caves),
// and the player's own noises (steps, strokes, the quad). The nodes are made once; a texture that cannot be
// heard is unplugged, and then costs nothing at all.
import { MILL, DAM, LEVELS, frameToWorld } from '../world/layout/layout.js';
import { sat, smooth, reach, drift, blockRate, noiseGain } from './synth.js';

const AHEAD = 0.3; // swells and ripples are written this far ahead of the audio clock
const AUDIBLE = 0.012; // a texture under this share of its loudest is not worth running

// How loud each sound is at its loudest (RMS for the textures, peak for the voices; 1 = full scale).
// The whole mix of the ambience is tuned here.
const LEVEL = {
  crash: 0.12, fizz: 0.05, wash: 0.055, lap: 0.04,
  roar: 0.115, cascade: 0.05, babble: 0.045, bubbles: 0.5, paddle: 0.04,
  wind: 0.08, leaves: 0.026, alpine: 0.022,
  step: 0.06, engine: 0.075,
  bird: 0.035, gull: 0.12, cricket: 0.018, frog: 0.3, drip: 0.14, creak: 0.5,
};

// Footsteps, by what the feet are on: the thud (filter, Hz, Q, level, decay in seconds), then the grain on
// top of it (filter, Hz, Q, level, decay, attack). `swim` is an arm going through the water.
const STEPS = {
  grass: ['lowpass', 300, 0.7, 0.55, 0.045, 'bandpass', 2400, 0.6, 0.3, 0.05, 0.012],
  wood: ['bandpass', 185, 5, 1.0, 0.06, 'bandpass', 1400, 1.2, 0.3, 0.022, 0.002],
  stone: ['lowpass', 240, 0.7, 0.4, 0.03, 'bandpass', 3300, 1.1, 0.6, 0.02, 0.002],
  sand: ['lowpass', 220, 0.7, 0.35, 0.05, 'bandpass', 1800, 0.5, 0.5, 0.09, 0.02],
  water: ['bandpass', 480, 1.0, 0.7, 0.1, 'bandpass', 2700, 0.6, 0.75, 0.15, 0.012],
  swim: ['lowpass', 380, 0.7, 0.5, 0.14, 'bandpass', 1300, 0.7, 0.8, 0.2, 0.07],
};

const [WHEEL_X, WHEEL_Z] = frameToWorld(MILL.house, DAM.wheel.lx, DAM.wheel.lz), WHEEL_Y = LEVELS.court;
const BIRD = 0, GULL = 1, POND = 2, DRIP = 3, CREAK = 4; // the passing voices, each with the time of its next call

export class Ambience {
  /**
   * @param out where it all goes (the "sound" bus)
   * @param bank the looped noises; @param shapes the oscillator waves; @param map SoundMap, or null: open country
   * @param data the WorldData (only asked what the ground is made of, when the game does not say)
   */
  constructor(ctx, out, bank, shapes, map, data, rand) {
    Object.assign(this, { ctx, bank, shapes, map, data, rand });
    const rate = ctx.sampleRate;
    const gain = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
    const filter = (type, hz, q, to) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.Q.value = q; blockRate(f.frequency); f.connect(to); return f; };
    // one strand of a texture: a noise ('pinkS': the pink one, in stereo) through a filter; `unit` brings it to a level of 1
    const strand = (noise, type, hz, q, to) => { const f = filter(type, hz, q, to); return { noise, head: f, filter: f, hz, unit: noiseGain(noise.replace('S', ''), type, hz, q, rate) }; };
    // a texture: its strands, the gain that sets its level (`scale` × 0..1), and where that gain is plugged in while it can be heard
    this.layers = [];
    const layer = (name, strands, g, scale, to) => { const l = { name, strands, g, scale, to, on: false, level: 0, idle: 0, rest: null }; this.layers.push(l); return l; };
    const simple = (name, noise, type, hz, q, level, to) => { const g = gain(0), s = strand(noise, type, hz, q, g); return layer(name, [s], g, s.unit * level, to); };

    // what comes from outside is heard as it is — or, under the rock, as a rumble through one more filter
    const outdoor = (this.outdoor = gain(1));
    this.clear = gain(1, out);
    this.dull = gain(0, out);
    this.muffle = filter('lowpass', 480, 0.5, this.dull);
    outdoor.connect(this.clear);
    this.inside = false; // (the muffled way is only plugged in under the rock)
    this.insideIdle = 0;
    this.duck = 1;
    this.near = out; // one's own noises, and the cave itself, are heard as they are

    // --- the sea. On a beach: each swell gathers, breaks (crash), and the water runs back down the sand (fizz).
    let g = gain(0);
    this.crash = strand('pinkS', 'lowpass', 1200, 0.5, (this.crashEnv = gain(0, g)));
    this.fizz = strand('whiteS', 'bandpass', 5200, 0.45, (this.fizzEnv = gain(0, g)));
    this.crashPeak = this.crash.unit * LEVEL.crash;
    this.fizzPeak = this.fizz.unit * LEVEL.fizz;
    this.waves = layer('waves', [this.crash, this.fizz], g, 1, outdoor);
    this.waves.rest = (t) => {
      // unplugged: forget the swells that were still to come
      for (const p of [this.crashEnv.gain, this.fizzEnv.gain, this.crash.filter.frequency]) p.cancelScheduledValues(t);
      this.crashEnv.gain.setValueAtTime(0.13 * this.crashPeak, t);
      this.fizzEnv.gain.setValueAtTime(0.06 * this.fizzPeak, t);
      this.crash.filter.frequency.setValueAtTime(420, t);
    };
    this.waves.rest(0);
    this.nextWave = 0;
    // at the foot of the cliffs, out at sea, far from a beach: a deeper, steadier wash
    this.wash = simple('wash', 'brown', 'lowpass', 520, 0.5, LEVEL.wash, outdoor);
    // right over the water (the piles of the pier, a swimmer): it laps
    g = gain(0);
    this.lapStrand = strand('pink', 'bandpass', 500, 2.5, (this.lapEnv = gain(0, g)));
    this.lap = layer('lap', [this.lapStrand], g, 1, outdoor);
    this.lapPeak = this.lapStrand.unit * LEVEL.lap;
    this.nextLap = 0;

    // --- falling and running water
    g = gain(0);
    this.roarStrand = strand('pinkS', 'lowpass', 2500, 0.5, g);
    this.roar = layer('roar', [this.roarStrand, { noise: 'brown', head: gain(0.7, this.roarStrand.filter) }], g, this.roarStrand.unit * LEVEL.roar, outdoor);
    this.cascade = simple('cascade', 'whiteS', 'bandpass', 3200, 0.5, LEVEL.cascade, outdoor);
    // a brook: a soft hiss, and two narrow filters that never stay on a note — the gurgle
    g = gain(0);
    const trimmed = (noise, type, hz, q, level) => strand(noise, type, hz, q, gain(noiseGain(noise, type, hz, q, rate) * level, g));
    this.bubbleA = trimmed('white', 'bandpass', 800, 7, LEVEL.bubbles);
    this.bubbleB = trimmed('white', 'bandpass', 2200, 8, LEVEL.bubbles * 0.7);
    this.babble = layer('babble', [trimmed('pink', 'bandpass', 1900, 0.5, 1), this.bubbleA, this.bubbleB], g, LEVEL.babble, outdoor);
    this.flip = 0;
    // the paddles of the mill wheel coming down into the race
    g = gain(0);
    const slosh = strand('pink', 'bandpass', 1300, 0.8, (this.paddleEnv = gain(0, g)));
    this.paddle = layer('paddle', [slosh], g, 1, outdoor);
    this.paddlePeak = slosh.unit * LEVEL.paddle;
    this.nextPaddle = 0;

    // --- the wind: its body, the leaves it stirs, and the thin whistle of the heights
    this.wind = simple('wind', 'pinkS', 'bandpass', 480, 0.7, LEVEL.wind, outdoor);
    this.leaves = simple('leaves', 'whiteS', 'bandpass', 4600, 0.5, LEVEL.leaves, outdoor);
    this.alpine = simple('alpine', 'pink', 'bandpass', 700, 3.5, LEVEL.alpine, outdoor);

    // --- the player: two bursts of noise per step, shaped by the ground
    g = gain(1);
    const thud = strand('pink', 'lowpass', 300, 0.7, (this.thudEnv = gain(0, g))), grain = strand('white', 'bandpass', 2400, 0.6, (this.grainEnv = gain(0, g)));
    this.steps = layer('steps', [thud, grain], g, 1, this.near);
    this.shoes = {};
    for (const k in STEPS) { const s = STEPS[k]; this.shoes[k] = { s, thud: noiseGain('pink', s[0], s[1], s[2], rate) * s[3] * LEVEL.step, grain: noiseGain('white', s[5], s[6], s[7], rate) * s[8] * LEVEL.step }; }
    this.shoe = '';
    this.ground = 'grass';
    this.stride = 0;
    this.engine = null;
    this.weights = new Float32Array(8);

    // --- passing voices come from the left, the middle or the right
    this.pans = ctx.createStereoPanner ? [-0.65, 0, 0.65].map((p) => { const n = ctx.createStereoPanner(); n.pan.value = p; n.connect(outdoor); return n; }) : [outdoor];
    // in the caves: a drip rings on, thrown back by the rock…
    this.echoIn = gain(1);
    const delay = ctx.createDelay(0.5), damp = ctx.createBiquadFilter(), back = gain(0.58, delay);
    delay.delayTime.value = 0.23;
    damp.type = 'lowpass'; damp.frequency.value = 2000;
    this.echoIn.connect(delay); delay.connect(damp); damp.connect(back);
    this.echoOut = gain(0.55);
    damp.connect(this.echoOut);
    this.steps.g.connect(gain(0.5, this.echoIn)); // …and so do one's own steps

    this.next = new Float64Array(5); // when each passing voice speaks next
    this.probe = { sea: 255, fresh: 255, surf: 0, babble: 0, cover: 0 };
    this.hubs = null;
    this.sources = [];
    this.o = this.g = this.e = null;
  }

  /** Start the looped noises (sound was switched on). Every texture listens to one of them, but only runs once plugged in. */
  start() {
    if (this.hubs) return;
    const ctx = this.ctx, t = ctx.currentTime, hubs = (this.hubs = {}), r = this.rand;
    for (const color of ['white', 'pink', 'brown']) {
      const buffer = this.bank.get(color);
      const play = (from) => { const s = ctx.createBufferSource(); s.buffer = buffer; s.loop = true; s.start(t, from * buffer.duration); this.sources.push(s); return s; };
      const a = (hubs[color] = play(r() * 0.4));
      if (color === 'brown') continue;
      // stereo: the same take read from two places is two different noises, one for each ear
      const m = (hubs[`${color}S`] = ctx.createChannelMerger(2));
      a.connect(m, 0, 0); play(0.5 + r() * 0.4).connect(m, 0, 1);
    }
    for (const l of this.layers) for (const s of l.strands) hubs[s.noise].connect(s.head);
    for (let i = 0; i < this.next.length; i++) this.next[i] = t + 1 + r() * 4;
  }

  /** Sound switched off: every source stops, everything is unplugged. */
  silence() {
    if (!this.hubs) return;
    const t = this.ctx.currentTime;
    for (const s of this.sources) { try { s.stop(); } catch { /* never started */ } s.disconnect(); }
    this.sources.length = 0;
    for (const m of [this.hubs.whiteS, this.hubs.pinkS]) m.disconnect();
    for (const l of this.layers) {
      if (l.on) l.g.disconnect(l.to);
      l.on = false; l.level = 0; l.idle = 0;
      if (l !== this.steps) { l.g.gain.cancelScheduledValues(0); l.g.gain.value = 0; }
      if (l.rest) l.rest(t);
    }
    for (const p of [this.lapEnv, this.paddleEnv, this.thudEnv, this.grainEnv]) { p.gain.cancelScheduledValues(0); p.gain.value = 0; }
    if (this.engine) { const e = this.engine; e.a.stop(); e.b.stop(); e.g.disconnect(); this.engine = null; }
    if (this.inside) { this.outdoor.disconnect(this.muffle); this.echoOut.disconnect(); this.inside = false; }
    this.hubs = null;
  }

  /** Bring a texture to a level (0..1 of its loudest), plugging it in or out as needed. */
  _set(l, v, now, tau) {
    if (v > AUDIBLE) {
      if (!l.on) { l.g.connect(l.to); l.on = true; }
      l.idle = 0;
    } else {
      v = 0;
      if (l.on && ++l.idle > 24) { l.g.disconnect(l.to); l.on = false; if (l.rest) l.rest(now); } // three seconds of silence: unplug it
    }
    // (only speak to the audio thread when the level really moves)
    if (Math.abs(v - l.level) > 0.02 * (v + l.level) + 2e-4) { l.g.gain.setTargetAtTime(v * l.scale, now, tau); l.level = v; }
  }
  /** Slide the filter of a strand to a frequency. */
  _tune(s, hz, now, tau) { if (Math.abs(hz - s.hz) > 0.04 * s.hz) { s.filter.frequency.setTargetAtTime(hz, now, tau); s.hz = hz; } }

  /** A few times a second: where is the listener, what should be heard there. */
  mix(now, L) {
    if (!this.hubs) return;
    const p = this.probe, r = this.rand, x = L.x, y = L.y, z = L.z, cave = !!L.cave, next = this.next;
    if (this.map && this.map.ready) this.map.sample(x, z, p);

    // --- the sea. Height counts as distance: it is far below a cliff top, or the top of the big wheel.
    const up = y > 1.5 ? (y - 1.5) * 0.8 : 0, shore = reach(Math.sqrt(p.sea * p.sea + up * up), 28, 170);
    const surf = (p.surf * 30) / (30 + up); // the waves of the beaches, as heard from here
    const afloat = sat(1 - p.sea / 6) * smooth(16, 5, y); // right over the water: swimming, on the pier, on a walkway of the island
    this._set(this.waves, surf, now, 0.5);
    if (this.waves.on) {
      if (this.nextWave < now) this.nextWave = now + 0.05;
      while (this.nextWave < now + AHEAD) this._wave(this.nextWave);
    }
    // (where the waves break they are the voice of the sea; elsewhere — cliffs, open water — it is the wash)
    this._set(this.wash, ((shore > 0.9 * surf ? shore - 0.9 * surf : 0) + 0.3 * afloat) * (0.75 + 0.25 * drift(now, 0.31, 0.83, 0.13)), now, 0.6);
    this._set(this.lap, afloat, now, 0.4);
    if (this.lap.on) {
      if (this.nextLap < now) this.nextLap = now + 0.1 * r();
      while (this.nextLap < now + AHEAD) {
        const t = this.nextLap, e = this.lapEnv.gain;
        this.lapStrand.filter.frequency.setValueAtTime(320 + 520 * r(), t);
        e.setTargetAtTime(this.lapPeak * (0.4 + 0.6 * r()), t, 0.025);
        e.setTargetAtTime(0, t + 0.07, 0.09 + 0.12 * r());
        this.nextLap = t + 0.35 + r();
      }
    }

    // --- the waterfalls: each is a segment of falling water, heard from its nearest point
    let roar = 0, hiss = 0, bright = 0;
    const falls = this.map ? this.map.falls : null;
    if (falls) {
      for (let i = 0; i < falls.length; i++) {
        const f = falls[i], k = sat(((x - f.x) * f.dx + (y - f.y) * f.dy + (z - f.z) * f.dz) * f.inv);
        const ex = x - f.x - f.dx * k, ey = y - f.y - f.dy * k, ez = z - f.z - f.dz * k, v = reach(Math.sqrt(ex * ex + ey * ey + ez * ez), f.half, f.far);
        roar += v * f.roar; hiss += v * f.hiss;
        if (v * (f.great ? 1 : 0.45) > bright) bright = v * (f.great ? 1 : 0.45);
      }
    }
    this._set(this.roar, roar < 1.25 ? roar : 1.25, now, 0.5);
    if (this.roar.on) this._tune(this.roarStrand, 500 + 7000 * bright, now, 0.5); // from afar only the rumble carries
    this._set(this.cascade, hiss < 1 ? hiss : 1, now, 0.5);
    this._set(this.babble, p.babble, now, 0.4);
    if (this.babble.on) {
      // the gurgle: one of the two narrow filters jumps to another note, each in turn
      if ((this.flip ^= 1)) this.bubbleA.filter.frequency.setTargetAtTime(450 + 1100 * r(), now, 0.07);
      else this.bubbleB.filter.frequency.setTargetAtTime(1500 + 2200 * r(), now, 0.06);
    }
    // the mill wheel: its paddles, and now and then the creak of its timber
    const wheel = reach(Math.sqrt((x - WHEEL_X) * (x - WHEEL_X) + (z - WHEEL_Z) * (z - WHEEL_Z) + (y - WHEEL_Y) * (y - WHEEL_Y)), 9, 60);
    this._set(this.paddle, wheel, now, 0.4);
    if (this.paddle.on) {
      if (this.nextPaddle < now) this.nextPaddle = now + 0.1;
      while (this.nextPaddle < now + AHEAD) {
        const t = this.nextPaddle, e = this.paddleEnv.gain;
        e.setTargetAtTime(this.paddlePeak * (0.6 + 0.4 * r()), t, 0.05);
        e.setTargetAtTime(this.paddlePeak * 0.25, t + 0.16, 0.2);
        this.nextPaddle = t + 0.72 + 0.1 * r();
      }
    }

    // --- the wind: in gusts; leaves where there are trees, a cold whistle on the heights
    const high = smooth(55, 125, y), trees = p.cover * (1 - 0.75 * high), gust = drift(now, 0.23, 0.61, 1.37);
    this._set(this.wind, (0.22 + 0.33 * trees + 0.45 * high) * (0.55 + 0.45 * gust), now, 0.7);
    this._tune(this.wind.strands[0], 380 + 400 * gust - 110 * high, now, 0.8);
    this._set(this.leaves, trees * (0.3 + 0.7 * gust) * (0.85 + 0.3 * r()), now, 0.25); // (the last term: leaves flutter)
    this._set(this.alpine, high * (0.35 + 0.65 * drift(now, 0.17, 0.41, 0.97)), now, 0.8);
    if (this.alpine.on) this._tune(this.alpine.strands[0], 480 + 420 * drift(now, 0.29, 0.13, 0.71), now, 1);

    // --- under the rock everything from outside is muffled; lying dead, it steps back
    const duck = cave ? 0.32 : L.dead ? 0.5 : 1;
    if (duck !== this.duck) {
      this.duck = duck;
      if (cave && !this.inside) { this.outdoor.connect(this.muffle); this.echoOut.connect(this.near); this.inside = true; }
      this.clear.gain.setTargetAtTime(cave ? 0 : duck, now, 0.3);
      this.dull.gain.setTargetAtTime(cave ? duck : 0, now, 0.3);
    }
    if (cave) this.insideIdle = 0;
    else if (this.inside && ++this.insideIdle > 40) { this.outdoor.disconnect(this.muffle); this.echoOut.disconnect(); this.inside = false; } // (once the echo has died)

    // --- passing voices: each waits its turn, and falls silent away from its place
    // (birds: where there are trees — and, more rarely and further off, anywhere in the open country below)
    const life = cave || L.swimming || afloat > 0.5 ? 0 : trees > 0.16 * (1 - high) ? trees : 0.16 * (1 - high);
    if (life > 0.1) { if (next[BIRD] < now) { this._bird(now + 0.05, life); next[BIRD] = now + (2.2 + 7 * (1 - life)) * (0.5 + r()); } }
    else if (next[BIRD] < now + 2) next[BIRD] = now + 2 + 5 * r();
    if (shore > 0.2 && !cave) { if (next[GULL] < now) { this._gull(now + 0.05, shore); next[GULL] = now + 8 + 16 * r(); } }
    else if (next[GULL] < now + 2) next[GULL] = now + 2 + 8 * r();
    const pond = cave || y > 60 ? 0 : smooth(40, 4, p.fresh);
    if (pond > 0.15) { if (next[POND] < now) { if (r() < 0.55) this._cricket(now + 0.05, pond); else this._frog(now + 0.05, pond); next[POND] = now + 4 + 9 * r(); } }
    else if (next[POND] < now + 2) next[POND] = now + 2 + 5 * r();
    if (cave) { if (next[DRIP] < now) { this._drip(now + 0.05); next[DRIP] = now + 1.1 + 3.2 * r(); } }
    else if (next[DRIP] < now + 0.5) next[DRIP] = now + 0.5 + r();
    if (wheel > 0.25 && !cave) { if (next[CREAK] < now) { this._creak(now + 0.05, wheel); next[CREAK] = now + 4.5 + 4 * r(); } }
    else if (next[CREAK] < now + 1) next[CREAK] = now + 1 + 3 * r();

    // --- the player
    this.ground = STEPS[L.surface] ? L.surface : cave ? 'stone' : afloat > 0.5 && y > 2 ? 'wood' : this._guess(x, z);
    const st = this.steps;
    if (st.on && ++st.idle > 24) { st.g.disconnect(st.to); st.on = false; }
    if (L.riding && !L.dead) this._drive(now, L.speed);
    else if (this.engine) this._park(now);
  }

  /** What the feet are on, when the game does not say: read from the ground cover of the baked maps. */
  _guess(x, z) {
    const d = this.data;
    if (!d || !d.surfaceAt) return 'grass';
    const w = d.surfaceAt(x, z, this.weights); // lawn, meadow, forest, dirt, rock, sand, gravel, soil
    return w[5] > 0.4 ? 'sand' : w[4] + w[6] > 0.5 ? 'stone' : 'grass';
  }

  /** One swell on the beach: it gathers, breaks, and the water runs back. The next one comes 6 to 10 s later. */
  _wave(t) {
    const r = this.rand, size = 0.5 + 0.5 * r(), rise = 1 + 0.9 * r();
    const c = this.crashEnv.gain, f = this.crash.filter.frequency, h = this.fizzEnv.gain;
    c.setTargetAtTime(size * this.crashPeak, t, rise / 2.5);
    c.setTargetAtTime(0.13 * this.crashPeak, t + rise, 0.8 + 0.6 * r());
    f.setTargetAtTime(1500 + 2600 * size, t + rise * 0.35, rise / 3.5); // it brightens as it breaks…
    f.setTargetAtTime(420, t + rise, 1.1); // …and is a murmur again
    h.setTargetAtTime(size * this.fizzPeak, t + rise * 0.75, 0.45);
    h.setTargetAtTime(0.06 * this.fizzPeak, t + rise + 1.3, 1 + r());
    this.nextWave = t + 6 + 4 * r();
  }

  // ---------------------------------------------------------------------------
  // The player

  /** Every frame: the walker's feet, the swimmer's arms. Nothing is allocated here. */
  move(dt, L) {
    if (!this.hubs) return;
    const v = L.speed;
    if (L.swimming) {
      // (the stroke of the avatar: two strokes in a cycle of 0.96 s at full rate; see Character.setAnim)
      if ((this.stride += (dt * (0.28 + 0.5 * (v < 5 ? v / 5 : 1))) / 0.479) >= 1) { this.stride = 0; this._step(v, 'swim'); }
    } else if (L.grounded && !L.riding && !L.dead && v > 0.6) {
      // (its feet: a step every 1.1 m when it walks, every 2.97 m when it runs)
      if ((this.stride += (v * dt) / (v > 5.6 ? 2.97 : 1.1)) >= 1) { this.stride = 0; this._step(v, L.wading ? 'water' : this.ground); }
    }
  }

  _step(v, kind) {
    const st = this.steps, r = this.rand, t = this.ctx.currentTime + 0.01;
    if (!st.on) { st.g.connect(st.to); st.on = true; }
    st.idle = 0;
    const shoe = this.shoes[kind], s = shoe.s, thud = st.strands[0].filter, grain = st.strands[1].filter;
    if (kind !== this.shoe) { this.shoe = kind; thud.type = s[0]; thud.Q.value = s[2]; grain.type = s[5]; grain.Q.value = s[7]; }
    thud.frequency.value = s[1] * (0.92 + 0.16 * r()); // (no two steps alike)
    grain.frequency.value = s[6] * (0.85 + 0.3 * r());
    const a = (0.55 + 0.45 * sat(v / 8)) * (0.75 + 0.5 * r());
    this.thudEnv.gain.setTargetAtTime(a * shoe.thud, t, 0.003);
    this.thudEnv.gain.setTargetAtTime(0, t + 0.012, s[4]);
    this.grainEnv.gain.setTargetAtTime(a * shoe.grain, t, s[10]);
    this.grainEnv.gain.setTargetAtTime(0, t + s[10] * 2.5, s[9]);
  }

  /** The quad: two low oscillators an octave apart; pitch, brightness and loudness follow the speed. */
  _drive(now, v) {
    let e = this.engine;
    if (!e) {
      const ctx = this.ctx, a = ctx.createOscillator(), b = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), sub = ctx.createGain();
      a.type = 'sawtooth'; b.type = 'square'; f.type = 'lowpass'; f.Q.value = 1.5; blockRate(f.frequency); g.gain.value = 0; sub.gain.value = 0.45;
      a.frequency.value = 40; b.frequency.value = 20; f.frequency.value = 400;
      a.connect(f); b.connect(sub); sub.connect(f); f.connect(g); g.connect(this.near);
      a.start(now); b.start(now);
      e = this.engine = { a, b, f, g, hz: 0, off: 0 };
    }
    e.off = 0;
    const hz = 40 + v * 5;
    if (Math.abs(hz - e.hz) > 0.4) {
      e.hz = hz;
      e.a.frequency.setTargetAtTime(hz, now, 0.12); e.b.frequency.setTargetAtTime(hz * 0.5, now, 0.12);
      e.f.frequency.setTargetAtTime(420 + v * 95, now, 0.15);
      e.g.gain.setTargetAtTime((0.4 + 0.6 * sat(v / 15)) * LEVEL.engine, now, 0.15);
    }
  }
  _park(now) {
    const e = this.engine;
    if (!e.off) { e.off = now + 1; e.hz = 0; e.g.gain.setTargetAtTime(0, now, 0.12); }
    else if (now > e.off) { e.a.stop(); e.b.stop(); e.g.disconnect(); this.engine = null; }
  }

  // ---------------------------------------------------------------------------
  // Passing voices: an oscillator and its envelope, made for one call and gone after it

  _voice(shape, t, to) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    this.shapes.dress(o, shape);
    g.gain.value = 0;
    o.connect(g); g.connect(to || this.pans[(this.rand() * this.pans.length) | 0]);
    o.start(t);
    this.o = o; this.g = g; this.e = g.gain;
  }
  /** One syllable: the pitch slides from f0 to f1 while the voice swells and dies. Returns when it ends. */
  _syllable(t, f0, f1, dur, level) {
    const f = this.o.frequency, e = this.e;
    f.setValueAtTime(f0, t); f.linearRampToValueAtTime(f1, t + dur);
    e.setTargetAtTime(level, t, dur * 0.12); e.setTargetAtTime(0, t + dur * 0.6, dur * 0.13);
    return t + dur;
  }
  _band(hz, q) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = hz; f.Q.value = q;
    f.connect(this.pans[(this.rand() * this.pans.length) | 0]);
    return f;
  }

  _bird(t, amount) {
    const r = this.rand, kind = (r() * 5) | 0, a = LEVEL.bird * (0.45 + 0.55 * r()) * (0.5 + 0.5 * amount);
    this._voice('sine', t);
    if (kind === 0) { // two notes, high then low, said two or three times
      const hi = 4200 + 600 * r(), lo = hi * 0.76;
      for (let i = 0, n = 2 + ((r() * 2) | 0); i < n; i++) { t = this._syllable(t, hi, hi * 0.98, 0.09, a); t = this._syllable(t + 0.03, lo, lo * 0.97, 0.11, a * 0.9) + 0.07; }
    } else if (kind === 1) { // a warbled phrase
      for (let i = 0, n = 4 + ((r() * 4) | 0); i < n; i++) { const f = 2300 + 2000 * r(); t = this._syllable(t, f, f * (0.8 + 0.5 * r()), 0.07 + 0.1 * r(), a) + 0.02 + 0.05 * r(); }
    } else if (kind === 2) { // a falling trill
      let f = 5400 + 600 * r();
      for (let i = 0, n = 8 + ((r() * 7) | 0); i < n; i++) { t = this._syllable(t, f, f * 0.93, 0.035, a * 0.8) + 0.022; f *= 0.985; }
    } else if (kind === 3) { // a few fluted notes
      for (let i = 0, n = 3 + ((r() * 2) | 0); i < n; i++) { const f = 1500 + 1300 * r(); t = this._syllable(t, f, f * (0.9 + 0.25 * r()), 0.16 + 0.14 * r(), a * 1.2) + 0.06 + 0.1 * r(); }
    } else { // a dove, low and soft
      const f = 430 + 80 * r();
      t = this._syllable(t, f, f * 1.04, 0.24, a * 1.6) + 0.1;
      t = this._syllable(t, f * 1.12, f * 1.02, 0.5, a * 1.6) + 0.12;
      t = this._syllable(t, f, f * 0.95, 0.26, a * 1.3);
    }
    this.o.stop(t + 0.4);
  }

  _gull(t, amount) {
    const r = this.rand, a = LEVEL.gull * (0.35 + 0.65 * r()) * amount;
    this._voice('gull', t, this._band(2300, 1.4)); // (a nasal throat)
    let f = 950 + 220 * r();
    for (let i = 0, n = 2 + ((r() * 3) | 0); i < n; i++) {
      // each cry jumps up, then slides down
      const d = 0.3 + 0.16 * r(), p = this.o.frequency;
      p.setValueAtTime(f, t); p.linearRampToValueAtTime(f * 1.28, t + 0.07); p.linearRampToValueAtTime(f * 0.8, t + d);
      this.e.setTargetAtTime(a, t, 0.03); this.e.setTargetAtTime(0, t + d * 0.65, d * 0.14);
      t += d + 0.07 + 0.1 * r(); f *= 0.95;
    }
    this.o.stop(t + 0.4);
  }

  _cricket(t, amount) {
    const r = this.rand, f = 4100 + 600 * r(), a = LEVEL.cricket * (0.5 + 0.5 * r()) * amount, o2 = this.ctx.createOscillator();
    this._voice('sine', t);
    // two notes a little apart beat against each other: the rasp of the wings
    this.o.frequency.value = f; o2.frequency.value = f + 32 + 10 * r();
    o2.connect(this.g); o2.start(t);
    for (let i = 0, n = 4 + ((r() * 5) | 0); i < n; i++) { this.e.setTargetAtTime(a, t, 0.008); this.e.setTargetAtTime(0, t + 0.065, 0.012); t += 0.42 + 0.2 * r(); }
    this.o.stop(t); o2.stop(t);
  }

  _frog(t, amount) {
    const r = this.rand, a = LEVEL.frog * (0.5 + 0.5 * r()) * amount, f = 78 + 14 * r();
    this._voice('frog', t, this._band(900 + 300 * r(), 2.5));
    t = this._syllable(t, f, f * 1.15, 0.1, a) + 0.05;
    t = this._syllable(t, f * 1.1, f * 1.45, 0.19, a);
    this.o.stop(t + 0.3);
  }

  _drip(t) {
    const r = this.rand, f = 750 + 900 * r();
    this._voice('sine', t, this.near);
    this.g.connect(this.echoIn);
    // a drop closing the water over itself: the note shoots up as it dies
    this.o.frequency.setValueAtTime(f, t); this.o.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.05);
    this.e.setTargetAtTime(LEVEL.drip * (0.4 + 0.6 * r()), t, 0.002); this.e.setTargetAtTime(0, t + 0.012, 0.04);
    this.o.stop(t + 0.4);
  }

  _creak(t, amount) {
    const r = this.rand, f = 38 + 10 * r(), d = 0.7 + 0.5 * r();
    this._voice('frog', t, this._band(700 + 250 * r(), 5));
    // timber under load: slow pulses that hurry up and slow down, heard through the wood
    const p = this.o.frequency;
    p.setValueAtTime(f, t); p.linearRampToValueAtTime(f * 1.5, t + d * 0.5); p.linearRampToValueAtTime(f * 1.15, t + d);
    this.e.setTargetAtTime(LEVEL.creak * amount * (0.5 + 0.5 * r()), t, 0.12); this.e.setTargetAtTime(0, t + d * 0.75, 0.1);
    this.o.stop(t + d + 0.6);
  }
}
