// Dev tool: listens to the sound engine (src/audio/) without ears. In headless Chromium, with the real baked
// world, it renders a set of listener scenarios through an OfflineAudioContext (the engine is driven exactly
// as the game drives it: update() sixty times a second), measures what comes out — peak, loudness, frequency
// bands, how the loudness moves over time, how tonal it is — and fails when something that should be heard is
// silent, when it clips, or when a place does not sound like itself. It also renders every one-shot effect,
// and measures what update() costs on a live context.
//
// usage: flock /tmp/mmf-browser.lock node tools/audio-test.mjs [--only=beach,pier] [--seconds=20] [--wav]
//        [--no-effects] [--no-live] [--no-scenarios]
//   --wav   also writes each render to tools/preview/audio/*.wav, to listen to
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const OUT = path.join(ROOT, 'tools/preview/audio');
if (opt.wav) fs.mkdirSync(OUT, { recursive: true });

// The page the test runs in: empty, served by the same Vite server as the game, so that the modules and the
// baked maps load exactly as they do there. (Its own cache folder: other tools may be running Vite too.)
const ISOLATED = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' }; // an isolated page gets a finer clock: the timings need it
const server = await createServer({
  root: ROOT,
  logLevel: 'error',
  cacheDir: path.join(ROOT, 'node_modules/.vite-audio'),
  server: {
    port: 5193, strictPort: false, host: '127.0.0.1',
    headers: ISOLATED,
  },
  plugins: [{
    name: 'audio-test-page',
    configureServer(s) {
      s.middlewares.use('/audio-test.html', (req, res) => {
        for (const [k, v] of Object.entries({ 'Content-Type': 'text/html', ...ISOLATED })) res.setHeader(k, v);
        res.end('<!doctype html><meta charset="utf-8"><title>audio test</title>');
      });
    },
  }],
});
await server.listen();
const port = server.httpServer.address().port;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push(`[console] ${m.text().slice(0, 300)}`); });
page.on('pageerror', (e) => problems.push(`[page] ${e.message}`));
await page.exposeFunction('report', (line) => console.log(line));
await page.exposeFunction('saveWav', (name, base64) => fs.writeFileSync(path.join(OUT, `${name}.wav`), Buffer.from(base64, 'base64')));

let failures = 1;
const started = Date.now();
try {
  await page.goto(`http://127.0.0.1:${port}/audio-test.html`);
  failures = await page.evaluate(pageMain, {
    only: typeof opt.only === 'string' ? opt.only.split(',') : null,
    seconds: +(opt.seconds || 20),
    wav: !!opt.wav,
    scenarios: !opt['no-scenarios'], effects: !opt['no-effects'], live: !opt['no-live'],
  });
} catch (err) {
  console.log('FAIL:', err.message);
}
if (problems.length) { console.log([...new Set(problems)].slice(0, 20).join('\n')); failures++; }
await browser.close();
await server.close();
console.log(`${failures ? `audio test FAILED (${failures})` : 'audio test passed'} in ${((Date.now() - started) / 1000).toFixed(0)} s`);
process.exit(failures ? 1 : 0);

// ---------------------------------------------------------------------------
// Everything below runs in the page.

async function pageMain(opt) {
  const { Soundscape, SOUNDS } = await import('/src/audio/Soundscape.js');
  const { WorldData } = await import('/src/world/WorldData.js');
  const { fairness } = await import('/src/audio/Music.js');
  const synth = await import('/src/audio/synth.js');
  const tunes = await import('/src/audio/tunes.js');
  const layout = await import('/src/world/layout/layout.js');
  const say = (line = '') => window.report(line);
  const data = await new WorldData().load();
  const RATE = 48000, FPS = 60;
  const dB = (v) => (v > 1e-10 ? 20 * Math.log10(v) : -200);
  const pad = (s, n) => String(s).padEnd(n), lead = (s, n) => String(s).padStart(n);
  let failures = 0;
  const fail = (what) => { failures++; return `FAIL ${what}`; };

  // ---------- rendering

  /** What an idle context costs to render with the same stops: taken off the timings below. */
  async function idleCost(seconds) {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE);
    for (let k = 1; k < Math.floor(seconds * FPS); k++) ctx.suspend(k / FPS).then(() => ctx.resume());
    const t0 = performance.now();
    await ctx.startRendering();
    return (performance.now() - t0) / seconds;
  }

  /**
   * Render `seconds` of the engine. `listener(L, t)` moves the listener; `events(audio, t, frame)` may call
   * play(), setLevels()…; both are called before each update(), 60 times a second of audio time.
   */
  async function render({ seconds, levels, listener, events, ambience = true, world = data, seed = 7 }) {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE);
    const audio = new Soundscape({ data: world, context: ctx, seed, ambience });
    audio.setLevels(levels);
    audio.unlock();
    const L = { x: 0, y: 0, z: 0, speed: 0, grounded: true, swimming: false, wading: false, riding: false, dead: false, cave: false, surface: undefined, climb: null, game: null };
    // (`steady`: once the noise and the map of the places are ready, and the first notes have made their waves)
    const run = { updateMs: 0, calls: 0, steadyMs: 0, steadyCalls: 0, worst: 0, limiting: 0, layers: new Set(), moods: new Set(), voices: 0 };
    let frame = 0;
    const step = () => {
      const t = frame / FPS;
      if (listener) listener(L, t);
      if (events) events(audio, t, frame);
      const t0 = performance.now();
      audio.update(1 / FPS, L);
      const ms = performance.now() - t0;
      run.updateMs += ms; run.calls++;
      if (t >= 3) { run.steadyMs += ms; run.steadyCalls++; if (ms > run.worst) run.worst = ms; }
      if (frame % 6 === 0) {
        const s = audio.stats();
        if (s.state !== 'off') {
          if (t >= 3) run.limiting = Math.min(run.limiting, s.limiting); // (the browser's meter starts at −10 dB and takes two seconds to settle)
          s.layers.forEach((l) => run.layers.add(l)); s.moods.forEach((m) => run.moods.add(m)); run.voices = Math.max(run.voices, s.musicVoices + s.effectVoices);
        }
      }
      frame++;
    };
    step();
    for (let k = 1; k < Math.floor(seconds * FPS); k++) ctx.suspend(k / FPS).then(() => { step(); ctx.resume(); });
    const t0 = performance.now();
    run.buffer = await ctx.startRendering();
    run.elapsed = performance.now() - t0;
    run.stats = audio.stats();
    run.audio = audio;
    return run;
  }

  // ---------- measuring

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  /** Averaged power spectrum (Hann window, half overlap). */
  function spectrum(x, N) {
    const win = new Float64Array(N), P = new Float64Array(N / 2), re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    let frames = 0;
    for (let s = 0; s + N <= x.length; s += N / 2, frames++) {
      for (let i = 0; i < N; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 0; k < N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k];
    }
    if (frames) for (let k = 0; k < N / 2; k++) P[k] /= frames;
    return P;
  }
  const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteOf = (hz) => { const m = 69 + 12 * Math.log2(hz / 440), k = Math.round(m); return { midi: k, cents: Math.round((m - k) * 100), name: `${NOTE[((k % 12) + 12) % 12]}${Math.floor(k / 12) - 1}` }; };

  const EDGES = [150, 600, 2400, 9600];
  /** Everything measured on one render, from `from` seconds on (the peak and the bad samples: on all of it). */
  function measure(buffer, from = 2) {
    const A = buffer.getChannelData(0), B = buffer.getChannelData(1), n = A.length, i0 = Math.min(n, Math.floor(from * RATE));
    let peak = 0, bad = 0, sum = 0, ab = 0, aa = 0, bb = 0;
    const mono = new Float32Array(n - i0);
    for (let i = 0; i < n; i++) {
      const a = A[i], b = B[i];
      if (!Number.isFinite(a) || !Number.isFinite(b)) { bad++; continue; }
      const m = Math.max(Math.abs(a), Math.abs(b));
      if (m > peak) peak = m;
      if (i >= i0) { sum += (a * a + b * b) / 2; mono[i - i0] = (a + b) / 2; ab += a * b; aa += a * a; bb += b * b; }
    }
    const rms = Math.sqrt(sum / Math.max(1, n - i0));
    const out = { peak, bad, rms, width: aa && bb ? 1 - ab / Math.sqrt(aa * bb) : 0 };
    // --- frequency bands, brightness, how noise-like
    const N = 4096, P = spectrum(mono, N), hz = RATE / N;
    let total = 0, moment = 0, logs = 0, lin = 0, count = 0;
    const bands = new Array(EDGES.length + 1).fill(0);
    for (let k = 1; k < N / 2; k++) {
      const f = k * hz, p = P[k];
      total += p; moment += p * f;
      let b = 0;
      while (b < EDGES.length && f >= EDGES[b]) b++;
      bands[b] += p;
      if (f > 300 && f < 8000) { logs += Math.log(p + 1e-30); lin += p; count++; }
    }
    out.bands = bands.map((p) => dB(rms * Math.sqrt(p / (total || 1))));
    out.centroid = total ? moment / total : 0;
    out.noise = lin ? Math.exp(logs / count) / (lin / count) : 0; // spectral flatness: 1 = noise, 0 = pure notes
    // --- loudness over time: 0.4 s windows every 0.1 s
    const hop = RATE / 10, env = [];
    for (let s = 0; s + 4 * hop <= mono.length; s += hop) { let e = 0; for (let i = s; i < s + 4 * hop; i++) e += mono[i] * mono[i]; env.push(Math.sqrt(e / (4 * hop))); }
    const sorted = env.slice().sort((a, b) => a - b), q = (f) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))] || 0;
    out.sway = dB(q(0.95)) - dB(q(0.05)); // how far the loudness moves, in dB
    // slow swells: the lag (3 to 12 s) at which the loudness curve best matches itself
    const mean = env.reduce((a, b) => a + b, 0) / (env.length || 1);
    let zero = 0, best = 0, lag = 0;
    for (const e of env) zero += (e - mean) * (e - mean);
    for (let l = 30; l <= Math.min(120, env.length - 30); l++) {
      let c = 0;
      for (let i = 0; i + l < env.length; i++) c += (env[i] - mean) * (env[i + l] - mean);
      c /= zero * (1 - l / env.length) || 1;
      if (c > best) { best = c; lag = l / 10; }
    }
    out.swell = lag; out.swellStrength = best;
    // --- clicks: the biggest jump of level between two neighbouring 20 ms windows (when both can be heard)
    const w = Math.floor(RATE * 0.02);
    let prev = -1, jump = 0;
    for (let s = 0; s + w <= mono.length; s += w) {
      let e = 0;
      for (let i = s; i < s + w; i++) e += mono[i] * mono[i];
      e = Math.sqrt(e / w);
      if (prev > 1e-4 && e > 1e-4) jump = Math.max(jump, Math.abs(dB(e) - dB(prev)));
      prev = e;
    }
    out.jump = jump;
    out.mono = mono;
    return out;
  }

  /** How musical a render is: are the strongest lines of its spectrum notes, and which ones. */
  function tonal(mono) {
    const N = 32768, P = spectrum(mono, N), hz = RATE / N;
    // power on the notes of the keyboard, against power half-way between them
    let on = 0, off = 0;
    const cls = new Array(12).fill(0);
    for (let m = 43; m <= 96; m++) {
      for (const [target, isNote] of [[m, true], [m + 0.5, false]]) {
        const f = 440 * 2 ** ((target - 69) / 12), lo = Math.ceil((f * 2 ** (-22 / 1200)) / hz), hi = Math.floor((f * 2 ** (22 / 1200)) / hz);
        let p = 0;
        for (let k = lo; k <= hi; k++) p += P[k];
        if (isNote) { on += p; cls[m % 12] += p; } else off += p;
      }
    }
    // the strongest lines
    const peaks = [];
    for (let k = Math.ceil(70 / hz); k < Math.floor(3200 / hz); k++) if (P[k] > P[k - 1] && P[k] >= P[k + 1] && P[k] > P[k - 2] && P[k] > P[k + 2]) peaks.push(k);
    peaks.sort((a, b) => P[b] - P[a]);
    const lines = peaks.slice(0, 10).map((k) => { const a = Math.log(P[k - 1] + 1e-30), b = Math.log(P[k]), c = Math.log(P[k + 1] + 1e-30), d = (0.5 * (a - c)) / (a - 2 * b + c || 1); return noteOf((k + d) * hz); });
    // the pulse: the lag (0.15 to 1.6 s) at which the attacks best repeat
    const hop = Math.floor(RATE * 0.01), level = [];
    for (let s = 0; s + hop <= mono.length; s += hop) { let e = 0; for (let i = s; i < s + hop; i++) e += mono[i] * mono[i]; level.push(Math.sqrt(e / hop)); }
    const rise = level.map((v, i) => Math.max(0, v - (level[i - 1] || 0)));
    let best = 0, lag = 0, zero = 0;
    for (const v of rise) zero += v * v;
    for (let l = 15; l <= 160; l++) { let c = 0; for (let i = 0; i + l < rise.length; i++) c += rise[i] * rise[i + l]; c /= zero || 1; if (c > best) { best = c; lag = l / 100; } }
    return { inTune: on / (on + off || 1), cls: cls.map((p) => p / (on || 1)), lines, pulse: lag, pulseStrength: best };
  }

  function wav(buffer) {
    const A = buffer.getChannelData(0), B = buffer.getChannelData(1), n = A.length, bytes = new Uint8Array(44 + n * 4), v = new DataView(bytes.buffer);
    const text = (at, s) => { for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i); };
    text(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); text(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, RATE, true); v.setUint32(28, RATE * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); text(36, 'data'); v.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, A[i])) * 32767, true); v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, B[i])) * 32767, true); }
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  // ---------- the scenarios

  const floor = (x, z) => Math.max(data.heightAt(x, z), data.waterAt(x, z));
  const at = (x, z, more) => (L) => { L.x = x; L.z = z; L.y = floor(x, z); if (more) Object.assign(L, more); };
  const [wheelX, wheelZ] = layout.pierToWorld(layout.PIER.wheel.along, 9);
  const [millX, millZ] = layout.frameToWorld(layout.MILL.house, layout.DAM.wheel.lx + 3.5, layout.DAM.wheel.lz);
  const sky = data.meta.sky[0], cave = layout.CAVES[1].nodes[3], climb = layout.CLIMB;
  const beach = [38, -40];
  // Each: where the listener is, and what must be true of what is heard there: `sound`, `music` and `both`
  // are the measures of the three mixes (see `measure`), `t` the tonal measures of the music alone.
  const SCENARIOS = {
    field: {
      about: 'in the middle of a wheat field',
      listener: at(-74, -128, { surface: 'grass' }),
      check: ({ sound, music }) => [music.moods.has('calm') || 'no quiet music', sound.rms < 0.05 || 'a field should be quiet'],
    },
    beach: {
      about: 'on the sand, a few metres from the water',
      listener: at(...beach, { surface: 'sand' }),
      check: ({ sound }) => [sound.sway > 5 || `the swell hardly moves the loudness (${sound.sway.toFixed(1)} dB)`, sound.layers.has('waves') || 'no waves', sound.noise > 0.2 || 'the sea should be noise'],
    },
    cliffs: {
      about: 'swimming at the foot of the sea cliffs of the southern cape',
      listener: (L) => { L.x = 150; L.z = 112; L.y = -1.05; L.swimming = true; L.grounded = false; L.speed = 1.5; },
      check: ({ sound }) => [sound.layers.has('wash') || 'no surf wash', sound.layers.has('lap') || 'no lapping', sound.probe.surf < 0.3 || `beach waves under a cliff (${sound.probe.surf.toFixed(2)})`, sound.bands[0] + sound.bands[1] > sound.bands[3] + sound.bands[4] || 'the wash should be deep'],
    },
    pier: {
      about: 'on the pier, by the big wheel',
      listener: (L) => { L.x = wheelX; L.z = wheelZ; L.y = layout.PIER.deckY; L.surface = 'wood'; },
      check: ({ sound, music, t }) => [
        music.moods.has('fair') && !music.moods.has('calm') || `moods: ${[...music.moods]}`,
        t.inTune > 0.8 || `not on the notes (${(t.inTune * 100).toFixed(0)} %)`,
        t.waltz >= 7 || `only ${t.waltz} of the 10 strongest lines are notes of the waltz`,
        Math.abs(t.pulse / (60 / tunes.WALTZ.bpm) - Math.round(t.pulse / (60 / tunes.WALTZ.bpm))) < 0.08 || `pulse ${t.pulse} s is not the beat of the waltz`,
        sound.layers.has('lap') || 'no water lapping under the deck',
        music.rms > sound.rms || 'the fair should be louder than the sea here',
      ],
    },
    promenade: {
      about: 'on the promenade, some 55 m from the pier: the fair is coming',
      listener: at(19, -52, { surface: 'wood' }),
      check: ({ music }) => [music.moods.has('fair') && music.moods.has('calm') || `moods: ${[...music.moods]}`],
    },
    woods: {
      about: 'under the trees by the mill garden',
      listener: at(-150, -42, { surface: 'grass' }),
      check: ({ sound }) => [sound.layers.has('leaves') || 'no leaves', sound.bands[3] > sound.bands[1] - 14 || 'the leaves should be heard in the highs', sound.probe.cover > 0.4 || `not much of a wood (cover ${sound.probe.cover.toFixed(2)})`],
    },
    mill: {
      about: 'by the mill wheel',
      listener: at(millX, millZ, { surface: 'stone' }),
      check: ({ sound }) => [sound.layers.has('paddle') || 'no wheel', sound.layers.has('babble') || 'no race'],
    },
    brook: {
      about: 'at the edge of the brook, down the valley',
      listener: at(10, -23.5, { surface: 'grass' }),
      check: ({ sound }) => [sound.layers.has('babble') || 'no babble', sound.probe.babble > 0.4 || `the brook is weak here (${sound.probe.babble.toFixed(2)})`],
    },
    pond: {
      about: 'on the bank of the great pond',
      listener: at(-152, 22, { surface: 'grass' }),
      check: ({ sound }) => [sound.probe.fresh < 12 || `the pond is ${sound.probe.fresh.toFixed(0)} m away`],
    },
    waterfall: {
      about: 'at the foot of the great waterfall',
      listener: at(-277, 117, { surface: 'stone' }),
      check: ({ sound }, all) => [
        sound.layers.has('roar') || 'no roar',
        sound.noise > 0.35 || `not broadband enough (${sound.noise.toFixed(2)})`,
        sound.sway < 4 || `a waterfall does not come and go (${sound.sway.toFixed(1)} dB)`,
        !all.field || sound.rms > all.field.sound.rms * 4 || 'hardly louder than a field',
      ],
    },
    terraces: {
      about: 'on the middle terrace above the great waterfall',
      listener: (L) => { L.x = -318; L.z = 131; L.y = 36.75; L.surface = 'stone'; },
      check: ({ sound }) => [sound.layers.has('cascade') || 'no light falls'],
    },
    cave: {
      about: 'in the chamber of Echo Cave',
      listener: (L) => { L.x = cave[0]; L.z = cave[1]; L.y = cave[3]; L.cave = true; L.surface = 'stone'; },
      check: ({ sound }, all) => [sound.peak > 0.02 || 'no drips', !all.field || sound.centroid < 2500 || 'not muffled', sound.sway > 6 || 'drips should stand out of the quiet'],
    },
    village: {
      about: 'in a sky village, 190 m up',
      listener: (L) => { L.x = sky.x; L.z = sky.z; L.y = sky.y; L.surface = 'grass'; },
      check: ({ sound }) => [sound.layers.has('alpine') || 'no mountain wind', !sound.layers.has('waves') && !sound.layers.has('wash') || 'the sea up here'],
    },
    walk: {
      about: 'walking down the lane to the mill, 4.4 m/s',
      listener: (L, t) => { L.x = -121 + Math.sin(t * 0.3) * 1.5; L.z = -100 + t * 4.4; L.y = floor(L.x, L.z); L.speed = 4.4; L.surface = 'stone'; },
      check: ({ sound }) => [sound.layers.has('steps') || 'no footsteps'],
    },
    climb10: {
      about: 'climbing Mostly Up, a tenth of the way up',
      listener: (L, t) => { L.x = climb.x + 6; L.z = climb.z; L.y = climb.y + climb.height * 0.1; L.climb = 0.1; L.speed = 2; L.surface = 'stone'; },
      check: ({ music, t }) => [music.moods.has('epic') && music.moods.size === 1 || `moods: ${[...music.moods]}`, t.inTune > 0.7 || `not on the notes (${(t.inTune * 100).toFixed(0)} %)`],
    },
    climb90: {
      about: 'climbing Mostly Up, nearly at the top',
      listener: (L, t) => { L.x = climb.x + 6; L.z = climb.z; L.y = climb.y + climb.height * 0.9; L.climb = 0.9; L.speed = 2; L.surface = 'stone'; },
      check: ({ music }, all) => [!all.climb10 || music.rms > all.climb10.music.rms * 1.4 || 'no louder than at the bottom', !all.climb10 || music.bands[3] > all.climb10.music.bands[3] + 3 || 'no brighter than at the bottom'],
    },
    quad: {
      about: 'riding the quad round a field, 6 to 13 m/s',
      listener: (L, t) => { L.x = -60 + 26 * Math.sin(t * 0.36); L.z = -124 + 16 * Math.cos(t * 0.36); L.y = floor(L.x, L.z); L.riding = true; L.speed = 9.5 + 3.5 * Math.sin(t * 0.9); },
      check: ({ sound }, all) => [!all.field || sound.bands[0] > all.field.sound.bands[0] + 10 || 'no engine in the lows', !sound.layers.has('steps') || 'footsteps on a quad'],
    },
    teleport: {
      about: 'on the beach, then carried to a sky village at 8 s',
      listener: (L, t) => { if (t < 8) { L.x = beach[0]; L.z = beach[1]; L.y = floor(...beach); } else { L.x = sky.x; L.z = sky.z; L.y = sky.y; } },
      check: ({ sound }) => [sound.jump < 9 || `a jump of ${sound.jump.toFixed(1)} dB in 20 ms: a click?`],
    },
  };

  const MIXES = { both: { sound: 1, music: 1 }, sound: { sound: 1, music: 0 }, music: { sound: 0, music: 1 } };
  const results = {};

  if (opt.scenarios) {
    const idle = await idleCost(4);
    say(`World loaded; an empty context renders at ${idle.toFixed(1)} ms per second of audio (taken off the "audio" column).`);
    say('');
    say('peak, rms: of the whole mix (1 = full scale). <150 … >9k6: level in each frequency band, dB. bright: centre of the spectrum, Hz.');
    say('noise: 1 = pure noise, 0 = pure notes. sway: how far the loudness moves over time, dB. swell: the slow period it moves with, s (and how clearly, 0..1).');
    say('lim: the most the limiter took off, dB. audio: share of one core the audio thread needs. update: mean / worst cost of one update() call, µs');
    say('(after the first three seconds: the preparation is measured apart, below).');
    say('');
    say(`${pad('scenario', 10)} ${pad('mix', 5)} ${lead('peak', 6)} ${lead('rms dB', 7)} ${lead('<150', 6)} ${lead('-600', 6)} ${lead('-2k4', 6)} ${lead('-9k6', 6)} ${lead('>9k6', 6)} ${lead('bright', 6)} ${lead('noise', 5)} ${lead('sway', 5)} ${lead('swell', 9)} ${lead('lim', 5)} ${lead('audio', 6)} ${lead('update µs', 10)}  heard`);
    for (const name in SCENARIOS) {
      if (opt.only && !opt.only.includes(name)) continue;
      const sc = SCENARIOS[name], res = (results[name] = {});
      for (const mix in MIXES) {
        const run = await render({ seconds: opt.seconds, levels: MIXES[mix], listener: sc.listener });
        const m = Object.assign(measure(run.buffer), { layers: run.layers, moods: run.moods, probe: run.stats.probe, voices: run.voices });
        res[mix] = m;
        const status = [];
        if (m.bad) status.push(fail(`${m.bad} bad samples`));
        if (m.peak >= 0.99) status.push(fail('clips'));
        else if (m.peak > 0.7) status.push('WARN: into the safety net');
        if (m.rms < 1e-3 && !(sc.quiet && sc.quiet.includes(mix))) status.push(fail('silent'));
        if (mix === 'sound' && (run.moods.size || run.stats.musicVoices)) status.push(fail('music is running'));
        if (mix === 'music' && run.layers.size) status.push(fail('ambience is running'));
        const cpu = (run.elapsed - run.updateMs - idle * opt.seconds) / (opt.seconds * 10);
        say(`${pad(name, 10)} ${pad(mix, 5)} ${lead(m.peak.toFixed(3), 6)} ${lead(dB(m.rms).toFixed(1), 7)} ${m.bands.map((b) => lead(b.toFixed(0), 6)).join(' ')} ${lead(m.centroid.toFixed(0), 6)} ${lead(m.noise.toFixed(2), 5)} ${lead(m.sway.toFixed(1), 5)} ${lead(`${m.swell.toFixed(1)} ${m.swellStrength.toFixed(2)}`, 9)} ${lead(run.limiting.toFixed(1), 5)} ${lead(`${Math.max(0, cpu).toFixed(1)} %`, 6)} ${lead(`${((run.steadyMs / (run.steadyCalls || 1)) * 1000).toFixed(1)}/${(run.worst * 1000).toFixed(0)}`, 10)}  ${[...run.layers, ...[...run.moods].map((x) => `♪${x}`)].join(' ')}${run.voices ? ` (${run.voices} voices)` : ''} ${status.join('; ')}`);
        if (opt.wav) await window.saveWav(`${name}-${mix}`, wav(run.buffer));
        if (mix === 'music') {
          const t = (res.t = tonal(m.mono));
          // the notes the waltz may play: those of its tune and of its chords, in any octave
          const waltz = new Set();
          for (const [names, tune] of Object.values(tunes.WALTZ.phrases)) {
            for (const bar of synth.melody(tune, 3)) for (const n of bar) waltz.add(n[1] % 12);
            for (const c of names.split(' ')) { const { pc, kind } = synth.chord(c); for (const i of kind === 'min' ? [0, 3, 7] : kind === 'dom' ? [0, 4, 7, 10] : [0, 4, 7]) waltz.add((pc + i) % 12); }
          }
          t.waltz = t.lines.filter((l) => Math.abs(l.cents) <= 35 && waltz.has(((l.midi % 12) + 12) % 12)).length;
          say(`${pad('', 16)} notes: ${(t.inTune * 100).toFixed(0)} % of the power on the keyboard's notes; strongest lines ${t.lines.map((l) => `${l.name}${l.cents >= 0 ? '+' : ''}${l.cents}`).join(' ')}; pulse ${t.pulse.toFixed(2)} s (${t.pulseStrength.toFixed(2)})`);
        }
        m.mono = null;
      }
      const p = res.sound.probe;
      const verdicts = sc.check(res, results).filter((v) => v !== true);
      say(`${pad('', 16)} ${sc.about}: sea ${p.sea.toFixed(0)} m, surf ${p.surf.toFixed(2)}, pond ${p.fresh.toFixed(0)} m, brook ${p.babble.toFixed(2)}, trees ${p.cover.toFixed(2)}${verdicts.length ? ` — ${verdicts.map((v) => fail(v)).join('; ')}` : ' — as expected'}`);
    }

    // both levels at zero: nothing at all
    {
      const run = await render({ seconds: 3, levels: { sound: 0, music: 0 }, listener: SCENARIOS.pier.listener });
      const m = measure(run.buffer, 0);
      say(`${pad('all off', 16)} peak ${m.peak}, muted ${run.audio.muted}, graph ${run.stats.state}${m.peak === 0 && run.audio.muted && run.stats.state === 'off' ? '' : ` ${fail('should be silent, muted, and not even built')}`}`);
    }
    // sound switched off and on again half-way: it must come back, and the music must not notice
    {
      const run = await render({ seconds: 12, levels: { sound: 1, music: 1 }, listener: SCENARIOS.waterfall.listener, events: (a, t, f) => { if (f === 4 * FPS) a.setLevels({ sound: 0 }); if (f === 8 * FPS) a.setLevels({ sound: 1 }); } });
      const A = run.buffer.getChannelData(0), part = (t0, t1) => { let e = 0; for (let i = t0 * RATE; i < t1 * RATE; i++) e += A[i] * A[i]; return Math.sqrt(e / ((t1 - t0) * RATE)); };
      const a = part(2, 4), b = part(5, 8), c = part(10, 12);
      say(`${pad('sound off/on', 16)} at the waterfall: rms ${dB(a).toFixed(1)} dB, then ${dB(b).toFixed(1)} dB without sound, then ${dB(c).toFixed(1)} dB again${b < a * 0.5 && c > a * 0.6 ? '' : ` ${fail('the ambience did not stop and come back')}`}`);
    }
    // the master chain must leave quiet sound untouched: an effect at volume 1 and 0.25 → a quarter of the level
    {
      const one = async (volume) => measure((await render({ seconds: 1.5, levels: { sound: 1, music: 0 }, ambience: false, events: (a, t, f) => { if (f === 6) a.play('checkpoint', { volume }); } })).buffer, 0).rms;
      const loud = await one(1), soft = await one(0.25);
      say(`${pad('volume', 16)} an effect at 1 and at 0.25: ratio ${(loud / soft).toFixed(2)} (4.00 = the limiter leaves it alone)${Math.abs(loud / soft - 4) < 0.25 ? '' : ` ${fail('the master chain is not transparent')}`}`);
    }
    // the map of the places and the noise: how long each slice of preparation takes
    {
      const run = await render({ seconds: 1, levels: { sound: 1, music: 1 }, listener: SCENARIOS.field.listener });
      say(`${pad('preparation', 16)} one slice per frame: ${run.stats.jobTimes.map((ms) => ms.toFixed(1)).join(' ')} ms; all of the first second's update() calls: ${run.updateMs.toFixed(1)} ms${run.stats.jobsLeft ? ` ${fail('not finished after one second')}` : ''}${run.stats.slowestJob > 30 ? ` ${fail('a slice over 30 ms')}` : ''}`);
    }
  }

  // ---------- the one-shot effects

  if (opt.effects) {
    say('');
    say('One-shot effects, each alone (level 1, no ambience). length: until 50 dB under its peak.');
    say(`${pad('effect', 11)} ${lead('peak', 6)} ${lead('rms dB', 7)} ${lead('length s', 9)} ${lead('bright', 7)} ${lead('voices', 7)}`);
    const one = async (name, options, seconds = 5.5) => {
      const run = await render({ seconds, levels: { sound: 1, music: 0 }, ambience: false, events: (a, t, f) => { if (f === 6) a.play(name, options); } });
      const m = measure(run.buffer, 0), A = run.buffer.getChannelData(0), B = run.buffer.getChannelData(1), floorLevel = m.peak * 10 ** (-50 / 20);
      let last = 0, first = -1, tail = 0, e = 0;
      for (let i = 0; i < A.length; i++) { const v = Math.max(Math.abs(A[i]), Math.abs(B[i])); if (v > floorLevel) { last = i; if (first < 0) first = i; } if (i >= A.length - RATE / 2) tail = Math.max(tail, v); }
      for (let i = Math.max(0, first); i <= last; i++) e += (A[i] * A[i] + B[i] * B[i]) / 2;
      return { ...m, length: first < 0 ? 0 : (last - first) / RATE, tail, loud: Math.sqrt(e / Math.max(1, last - first)), voices: run.voices };
    };
    for (const name of SOUNDS) {
      if (opt.only && !opt.only.includes(name) && !opt.only.includes('effects')) continue;
      const m = await one(name, undefined, name === 'boom' ? 14 : 5.5); // (the blast rolls away over the hills for a while)
      const status = [];
      if (m.bad) status.push(fail('bad samples'));
      if (m.peak >= 0.99) status.push(fail('clips')); else if (m.peak > 0.7) status.push('WARN: into the safety net');
      if (m.peak < 0.02) status.push(fail('cannot be heard'));
      if (m.tail > 1e-4) status.push(fail('does not end'));
      say(`${pad(name, 11)} ${lead(m.peak.toFixed(3), 6)} ${lead(dB(m.loud).toFixed(1), 7)} ${lead(m.length.toFixed(2), 9)} ${lead(m.centroid.toFixed(0), 7)} ${lead(m.voices, 7)}  ${status.join('; ')}`);
      if (opt.wav) await window.saveWav(`fx-${name}`, wav((await render({ seconds: Math.min(5.5, m.length + 0.6), levels: { sound: 1, music: 0 }, ambience: false, events: (a, t, f) => { if (f === 6) a.play(name); } })).buffer));
    }
    if (!opt.only) {
      const plain = await one('score', undefined, 1.5), high = await one('score', { rate: 1.5 }, 1.5), soft = await one('score', { volume: 0.5 }, 1.5);
      say(`score with rate 1.5: brightness × ${(high.centroid / plain.centroid).toFixed(2)}; with volume 0.5: peak × ${(soft.peak / plain.peak).toFixed(2)}${high.centroid > plain.centroid * 1.3 && Math.abs(soft.peak / plain.peak - 0.5) < 0.05 ? '' : ` ${fail('rate or volume ignored')}`}`);
      const none = await render({ seconds: 1, levels: { sound: 1, music: 0 }, ambience: false, events: (a, t, f) => { if (f === 6) { a.play('no such sound'); a.play('toString'); a.play(); } } });
      say(`unknown names: peak ${measure(none.buffer, 0).peak}${measure(none.buffer, 0).peak === 0 ? '' : ` ${fail('they made a sound')}`}`);
    }
  }

  // ---------- a live context: what update() costs, and the life cycle

  if (opt.live) {
    say('');
    const audio = new Soundscape({ data });
    const before = audio.muted;
    audio.play('click'); audio.update(1 / 60, { x: 0, y: 0, z: 0 }); audio.setLevels({ sound: 0.8, music: 0.6 }); // all safe before unlock()
    const built = !!audio.ctx;
    audio.unlock(); audio.unlock();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 40 && audio.ctx.state !== 'running'; i++) await sleep(50);
    say(`live context: muted before unlock ${before}, context made before unlock ${built}, state after unlock ${audio.ctx.state}, ${audio.ctx.sampleRate} Hz, muted ${audio.muted}${before && !built && audio.ctx.state === 'running' && !audio.muted ? '' : ` ${fail('life cycle')}`}`);
    const L = { x: 0, y: 0, z: 0, speed: 0, grounded: true, swimming: false, wading: false, riding: false, dead: false, cave: false, surface: undefined, climb: null, game: null };
    // update() sixty times a second of real time, as the game does, while the listener does something
    // (`warm`: seconds that are run but not counted — each oscillator wave is made once, when first needed)
    const drive = (seconds, move, warm = 0) => new Promise((resolve) => {
      let sum = 0, worst = 0, calls = 0, ticks = 0, tickSum = 0, last = performance.now();
      const start = last, all = [];
      const frame = () => {
        const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000), t = (now - start) / 1000;
        last = now;
        move(L, t);
        const before = audio.last, t0 = performance.now();
        audio.update(dt, L);
        const ms = performance.now() - t0;
        if (t >= warm) {
          sum += ms; calls++; all.push(ms);
          if (ms > worst) worst = ms;
          if (audio.last !== before) { ticks++; tickSum += ms; } // (a call that looked at the mix and the music)
        }
        if (t < warm + seconds) requestAnimationFrame(frame);
        else { all.sort((x, y) => x - y); resolve({ mean: (sum / calls) * 1000, worst: worst * 1000, p99: all[Math.floor(all.length * 0.99)] * 1000, calls, ticks, tick: (tickSum / (ticks || 1)) * 1000, other: ((sum - tickSum) / (calls - ticks || 1)) * 1000, perSecond: sum / seconds }); }
      };
      requestAnimationFrame(frame);
    });
    const show = (what, r) => say(`${pad(what, 46)} ${lead(r.calls, 5)} calls: mean ${lead(r.mean.toFixed(1), 5)} µs (${r.ticks} of them look at the mix: ${r.tick.toFixed(0)} µs each; the others ${r.other.toFixed(1)} µs), 99 % under ${r.p99.toFixed(0)} µs, worst ${r.worst.toFixed(0)} µs; ${r.perSecond.toFixed(2)} ms of script per second${r.mean < 50 ? '' : ` ${fail('more than 0.05 ms a call')}`}`);
    say(`the clock of this page ticks every ${window.crossOriginIsolated ? 5 : 100} µs`);
    const first = await drive(3, at(-74, -128, { surface: 'grass' }));
    say(`${pad('the first 3 s (noise and map being prepared)', 46)} ${lead(first.calls, 5)} calls: mean ${first.mean.toFixed(1)} µs, worst ${first.worst.toFixed(0)} µs; slices of preparation: ${audio.stats().jobTimes.map((ms) => ms.toFixed(1)).join(' ')} ms`);
    show('standing in a field (quiet music)', await drive(12, at(-74, -128, { surface: 'grass' }), 3));
    show('walking along the pier (fair, sea, steps)', await drive(15, (l, t) => { const [x, z] = layout.pierToWorld(20 + (t * 4.4) % 100, 2); Object.assign(l, { x, z, y: layout.PIER.deckY, speed: 4.4, surface: 'wood', climb: null }); }, 6));
    show('running through the woods (quiet music)', await drive(15, (l, t) => { l.x = -150 + 30 * Math.sin(t * 0.25); l.z = -45 + 20 * Math.cos(t * 0.25); l.y = floor(l.x, l.z); l.speed = 8.2; l.surface = 'grass'; }, 4));
    show('climbing, nearly at the top (full orchestra)', await drive(15, (l) => Object.assign(l, { x: climb.x + 6, z: climb.z, y: climb.y + 80, speed: 2, surface: 'stone', climb: 0.9 }), 8));
    const s = audio.stats();
    say(`live graph: state ${s.state}, layers on: ${s.layers.join(' ')}; moods: ${s.moods.join(' ')}; ${s.musicVoices} music voices; limiter ${s.limiting.toFixed(1)} dB`);
    // the life cycle: everything off → asleep; back on → awake; page hidden → asleep; shown → awake; disposed → closed
    const states = [];
    audio.setLevels({ sound: 0, music: 0 }); await sleep(600); states.push(`all off: ${audio.ctx.state}, muted ${audio.muted}`);
    const off = audio.ctx.state === 'suspended' && audio.muted;
    audio.setLevels({ music: 0.6 }); await sleep(300); states.push(`music on again: ${audio.ctx.state}`);
    const on = audio.ctx.state === 'running';
    Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); await sleep(600);
    states.push(`page hidden: ${audio.ctx.state}`);
    const hid = audio.ctx.state === 'suspended';
    Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); await sleep(300);
    states.push(`page shown: ${audio.ctx.state}`);
    const back = audio.ctx.state === 'running';
    audio.dispose(); await sleep(200); states.push(`disposed: ${audio.ctx.state}`);
    say(`life cycle: ${states.join('; ')}${off && on && hid && back && audio.ctx.state === 'closed' ? '' : ` ${fail('life cycle')}`}`);
  }
  return failures;
}
