// The sound of the game: the right ambience in each place, music that follows where one is and what one does,
// and one-shot effects. Everything is synthesised with the Web Audio API — there is not one audio file.
//
//   const audio = new Soundscape({ data });   // nothing is started: browsers forbid sound before a gesture
//   audio.unlock();                           // from a click, a key or a touch (as often as one likes)
//   audio.setLevels({ sound: 0.8, music: 0.6 });
//   audio.update(dt, listener);               // every frame
//   audio.play('splash');
//
// How it is made: Ambience.js (the places), Music.js and tunes.js (the three musics), Effects.js (the
// one-shots), SoundMap.js (what the baked world maps say about each place), synth.js (shared parts).
import { SoundMap } from './SoundMap.js';
import { Ambience } from './Ambience.js';
import { Music } from './Music.js';
import { Effects, SOUNDS } from './Effects.js';
import { NoiseBank, WaveBank, randomSource, compressorMakeup, softClip } from './synth.js';

export { SOUNDS };

const TICK = 0.125; // the mix is worked out again, and the next notes written, 8 times a second
const LIMITER = { threshold: -9, knee: 6, ratio: 10, attack: 0.004, release: 0.18 }; // gentle: only the loudest moments touch it
const HEADROOM = 1; // master trim, should the whole game be too loud or too quiet

/** A setting 0..1 → a gain. Squared: half-way on a slider sounds like half as loud. */
const curve = (level) => level * level;
const level01 = (v, was) => (v === undefined ? was : Math.min(1, Math.max(0, Number(v) || 0)));

export class Soundscape {
  /**
   * @param {object} options
   * @param options.data the WorldData of the game (heightAt, waterAt, canopyShadeAt, meta): the places are read from it
   * @param [options.context] an AudioContext or OfflineAudioContext to use instead of making one (tests)
   * @param [options.seed] makes the random choices repeatable (tests)
   * @param [options.ambience] false: no ambience at all, only music and effects (tests)
   */
  constructor({ data = null, context = null, seed, ambience = true } = {}) {
    this.data = data;
    this.ctx = context;
    this.offline = !!context && typeof context.startRendering === 'function'; // rendered ahead of time: never suspended or resumed here
    this.owned = !context;
    this.seed = seed === undefined ? (Math.random() * 0xffffffff) >>> 0 : seed >>> 0;
    this.wantAmbience = ambience;
    this.levels = { sound: 0.8, music: 0.6 };
    this.unlocked = false; // a gesture has been seen
    this.hidden = false; // the page is in the background
    this.live = false; // update() and play() have something to do
    this.master = null; // the graph, built at the first unlock()
    this.ambience = this.music = this.effects = null;
    this.jobs = []; // heavy preparation, cut in slices: one per frame
    this.job = 0;
    this.took = []; // how long each slice took (ms)
    this.last = -1;
    this.timer = 0;
    this.disposed = false;
    this._visibility = () => this._hide(document.hidden);
  }

  /** True while nothing can be heard: not unlocked yet, both levels at zero, or the browser holds the sound back. */
  get muted() { return !this.master || !(this.levels.sound > 0 || this.levels.music > 0) || (!this.offline && this.ctx.state !== 'running'); }

  /**
   * Call from a user gesture (click, key, touch): starts the sound, or wakes it up again — browsers only allow
   * sound from there, and a phone may put it to sleep at any time. Costs nothing when all is well.
   */
  unlock() {
    if (this.disposed) return;
    this.unlocked = true;
    if (!(this.levels.sound > 0 || this.levels.music > 0)) return; // everything is off: nothing to wake
    if (!this.ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return; // no Web Audio here: the game stays silent
      try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch { try { this.ctx = new AC(); } catch { return; } }
    }
    if (!this.master) this._build();
    if (!this.offline && !this.hidden && this.ctx.state !== 'running') {
      try { const p = this.ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch { /* not from a gesture: the next one will do */ }
    }
    this._refresh();
  }

  /** `sound` (ambience and effects) and `music`, each 0..1. Zero stops that family altogether; both at zero put the audio to sleep. */
  setLevels({ sound, music } = {}) {
    const l = this.levels, hadSound = l.sound > 0, hadMusic = l.music > 0;
    l.sound = level01(sound, l.sound);
    l.music = level01(music, l.music);
    if (!this.master) { if (this.unlocked && !hadSound && !hadMusic) this.unlock(); return; } // (it was all off when the gesture came)
    const now = this.ctx.currentTime;
    this.soundBus.gain.setTargetAtTime(curve(l.sound), now, 0.05);
    this.musicBus.gain.setTargetAtTime(curve(l.music), now, 0.05);
    if (hadSound && !(l.sound > 0)) { this.ambience?.silence(); this.effects.silence(); }
    if (hadMusic && !(l.music > 0)) this.music.silence();
    if (l.sound > 0 && !hadSound) this._prepare();
    if (this.offline) { this._refresh(); return; }
    clearTimeout(this.timer);
    if (l.sound > 0 || l.music > 0) { if (this.unlocked && !this.hidden && this.ctx.state !== 'running') this.unlock(); }
    else this.timer = setTimeout(() => { if (!(l.sound > 0 || l.music > 0) && this.ctx.state === 'running') this.ctx.suspend(); }, 300); // (after the fade)
    this._refresh();
  }

  /**
   * Every frame. `listener`: { x, y, z, speed, grounded, swimming, wading, riding, dead, cave, surface, climb, game }.
   * Nearly nothing happens here: the mix and the music are only looked at 8 times a second.
   */
  update(dt, listener) {
    if (!this.live || !listener) return;
    if (this.job < this.jobs.length) this._work();
    const ambience = this.ambience;
    if (ambience && this.levels.sound > 0) ambience.move(dt, listener);
    const now = this.ctx.currentTime;
    if (now - this.last < TICK) return;
    if (!this.offline && this.ctx.state !== 'running') return; // held back by the browser: the clock stands still
    this.last = now;
    if (ambience && this.levels.sound > 0) ambience.mix(now, listener);
    if (this.levels.music > 0) this.music.run(now, listener);
  }

  /** A one-shot effect (see SOUNDS). options: { volume = 1, rate = 1 } — `rate` raises the pitch. */
  play(name, options) {
    if (!this.live || !(this.levels.sound > 0) || (!this.offline && this.ctx.state !== 'running')) return;
    this.effects.play(name, options && options.volume !== undefined ? options.volume : 1, options && options.rate !== undefined ? options.rate : 1);
  }

  /** Figures for the curious (and for the test tool): what is running right now. Not for every frame. */
  stats() {
    if (!this.master) return { state: 'off' };
    const now = this.ctx.currentTime;
    return {
      state: this.ctx.state, time: now, sampleRate: this.ctx.sampleRate,
      layers: this.ambience ? this.ambience.layers.filter((l) => l.on).map((l) => l.name) : [],
      musicVoices: this.music.voices(now), effectVoices: this.effects.voices(now),
      moods: ['calm', 'fair', 'epic'].filter((m) => this.music[m].on),
      limiting: this.limiter.reduction, // dB taken off by the limiter right now (0 = untouched)
      slowestJob: Math.max(0, ...this.took), jobTimes: this.took.slice(), jobsLeft: this.jobs.length - this.job, // (the preparation, slice by slice: ms)
      probe: this.ambience ? { ...this.ambience.probe } : null,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.live = false;
    clearTimeout(this.timer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._visibility);
    if (!this.master) return;
    this.ambience?.silence(); this.effects.silence(); this.music.silence();
    this.out.disconnect();
    if (this.owned) this.ctx.close().catch(() => {});
  }

  // ---------------------------------------------------------------------------

  /** The graph: two families → a gentle limiter → a safety net → the speakers. Cheap; the heavy parts are queued. */
  _build() {
    const ctx = this.ctx, gain = (v, to) => { const g = ctx.createGain(); g.gain.value = v; g.connect(to); return g; };
    this.out = gain(HEADROOM, ctx.destination); // (also fades to nothing before the page goes to sleep)
    const net = ctx.createWaveShaper();
    net.curve = softClip();
    net.connect(this.out);
    const lim = (this.limiter = ctx.createDynamicsCompressor());
    for (const k in LIMITER) lim[k].value = LIMITER[k];
    // (the browser's compressor adds a fixed gain that depends on its settings: take it off again)
    lim.connect(gain(1 / compressorMakeup(LIMITER.threshold, LIMITER.knee, LIMITER.ratio), net));
    this.master = lim;
    this.soundBus = gain(curve(this.levels.sound), lim);
    this.musicBus = gain(curve(this.levels.music), lim);
    const rand = (this.rand = randomSource(this.seed));
    this.bank = new NoiseBank(ctx, this.seed);
    this.shapes = new WaveBank(ctx);
    this.effects = new Effects(ctx, this.soundBus, this.bank, this.shapes, rand);
    this.music = new Music(ctx, this.musicBus, this.bank, this.shapes, rand);
    if (!this.offline) {
      // old iPhones only wake their audio when a sound is started from the gesture itself: one silent sample
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      s.connect(ctx.destination);
      s.start(0);
      if (typeof document !== 'undefined') { document.addEventListener('visibilitychange', this._visibility); this.hidden = document.hidden; }
    }
    if (this.levels.sound > 0) this._prepare();
  }

  /** Queue what the ambience needs — noise, the map of the places — the first time sound is on. */
  _prepare() {
    if (!this.wantAmbience) return;
    if (this.ambience) { this.jobs.push(() => this.ambience.start()); return; }
    const map = this.data ? new SoundMap(this.data) : null;
    this.ambience = new Ambience(this.ctx, this.soundBus, this.bank, this.shapes, map, this.data, this.rand);
    this.jobs.push(...this.bank.jobs());
    this.jobs.push(() => { if (this.levels.sound > 0) this.ambience.start(); });
    if (map) this.jobs.push(...map.jobs());
  }

  /** One slice of preparation per frame, so that no frame is held up. */
  _work() {
    const t0 = performance.now();
    this.jobs[this.job++]();
    this.took.push(performance.now() - t0);
    if (this.job === this.jobs.length) { this.jobs.length = 0; this.job = 0; }
  }

  _refresh() { this.live = !this.disposed && !!this.master && !this.hidden && (this.levels.sound > 0 || this.levels.music > 0); }

  /** The page went to the background (or came back): fade out and sleep, wake and fade in. */
  _hide(hidden) {
    if (this.disposed || !this.master || this.offline) return;
    this.hidden = hidden;
    const ctx = this.ctx, g = this.out.gain;
    clearTimeout(this.timer);
    if (hidden) {
      g.setTargetAtTime(0, ctx.currentTime, 0.04);
      this.timer = setTimeout(() => { if (this.hidden && ctx.state === 'running') ctx.suspend(); }, 250);
    } else {
      if (this.levels.sound > 0 || this.levels.music > 0) { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch { /* the next gesture will do */ } }
      g.cancelScheduledValues(0);
      g.setValueAtTime(0, ctx.currentTime);
      g.setTargetAtTime(HEADROOM, ctx.currentTime, 0.12);
    }
    this._refresh();
  }
}
