// Listens to the music of a game without ears, and writes it down to be listened to with them.
//
//   node lab/tools/tune-listen.mjs <id>[,<id>…] [--out=<folder>] [--seconds=14] [--heats=0.05,0.5,1]
//
// In a headless browser, on the game's own sound engine (an OfflineAudioContext, driven sixty times a second as
// the game drives it), the tune of each game is played at a few "heats" (how far a run has come: 0 … 1) and what
// comes out is measured — its peak, its loudness, where its energy is — beside the orchestra of the climb at the
// same heights, which is the music the owner likes. With --out, each is also written as a .wav file, and one
// more that goes through the whole tune as a run warms up (<id>.wav): something to listen to before the game is online.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const ids = (args.find((a) => !a.startsWith('--')) || '').split(',').filter(Boolean);
if (!ids.length) { console.log('usage: node lab/tools/tune-listen.mjs <id>[,<id>…] [--out=folder] [--seconds=14] [--heats=0.05,0.5,1]'); process.exit(1); }
const OUT = opt.out ? path.resolve(opt.out) : null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: ROOT, logLevel: 'error', cacheDir: path.join(ROOT, 'node_modules/.vite-tunes'),
  server: { port: 5197, strictPort: false, host: '127.0.0.1', hmr: false, watch: null },
  plugins: [{ name: 'tune-page', configureServer(s) { s.middlewares.use('/tune-listen.html', (req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><title>tunes</title><body></body>'); }); } }],
});
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[page]', e.message));
await page.exposeFunction('report', (line) => console.log(line));
await page.exposeFunction('saveWav', (name, base64) => { if (OUT) fs.writeFileSync(path.join(OUT, `${name}.wav`), Buffer.from(base64, 'base64')); });
try {
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tune-listen.html`);
  await page.evaluate(pageMain, { ids, seconds: +(opt.seconds || 14), heats: String(opt.heats || '0.05,0.5,1').split(',').map(Number), wav: !!OUT, long: +(opt.long || 46) });
} catch (err) { console.log('FAIL:', err.message); }
await browser.close();
await server.close();
if (OUT) console.log('written to', OUT);

async function pageMain(o) {
  const { Soundscape } = await import('/src/audio/Soundscape.js');
  const { WorldData } = await import('/src/world/WorldData.js');
  const { TUNES, tunePlayer } = await import('/src/extras/tunes.js');
  const say = (l = '') => window.report(l);
  const data = await new WorldData().load();
  const RATE = 48000, FPS = 60, dB = (v) => (v > 1e-10 ? 20 * Math.log10(v) : -200);

  /** `seconds` of the engine; `each(audio, t)` before every update (the listener stands in a field, far from the fair). */
  async function render(seconds, climb, each) {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE);
    const audio = new Soundscape({ data, context: ctx, seed: 7, ambience: false });
    audio.setLevels({ sound: 0.8, music: 0.6 });
    audio.unlock();
    const L = { x: -62, y: 12, z: -124, speed: 0, grounded: true, swimming: false, wading: false, riding: false, dead: false, cave: false, surface: undefined, climb: null, game: null };
    let frame = 0;
    const step = () => { const t = frame / FPS; L.climb = typeof climb === 'function' ? climb(t) : climb; if (each) each(audio, t); audio.update(1 / FPS, L); frame++; };
    step();
    for (let k = 1; k < Math.floor(seconds * FPS); k++) ctx.suspend(k / FPS).then(() => { step(); ctx.resume(); });
    return ctx.startRendering();
  }
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) { const ang = (-2 * Math.PI) / len; for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) { const wr = Math.cos(ang * k), wi = Math.sin(ang * k), a = i + k, b = a + len / 2, xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; } }
  }
  /** Peak, loudness (from `from` s on), the level in five bands, and how much the loudness moves (the beat). */
  function measure(buf, from = 2) {
    const a = buf.getChannelData(0), b = buf.getChannelData(1), i0 = Math.floor(from * RATE), n = a.length;
    let peak = 0, sum = 0, bad = 0;
    for (let i = 0; i < n; i++) { const m = Math.max(Math.abs(a[i]), Math.abs(b[i])); if (m > peak) peak = m; if (!(m <= 1)) bad++; if (i >= i0) sum += (a[i] * a[i] + b[i] * b[i]) / 2; }
    const rms = Math.sqrt(sum / Math.max(1, n - i0)), N = 8192, edges = [150, 600, 2400, 9600], bands = [0, 0, 0, 0, 0];
    for (let s = i0; s + N <= n; s += N) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = (a[s + i] + b[s + i]) * 0.5 * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      fft(re, im);
      for (let k = 1; k < N / 2; k++) { const hz = (k * RATE) / N, p = re[k] * re[k] + im[k] * im[k]; let j = 0; while (j < 4 && hz >= edges[j]) j++; bands[j] += p; }
    }
    const total = bands.reduce((x, y) => x + y, 0) || 1, win = Math.floor(RATE * 0.05), env = [];
    for (let s = i0; s + win <= n; s += win) { let e = 0; for (let i = 0; i < win; i++) e += a[s + i] * a[s + i]; env.push(dB(Math.sqrt(e / win))); }
    env.sort((x, y) => x - y);
    return { peak, bad, rms, bands: bands.map((p) => dB(rms * Math.sqrt(p / total))), sway: env.length ? env[Math.floor(env.length * 0.95)] - env[Math.floor(env.length * 0.2)] : 0 };
  }
  function wav(buf, gain = 1) {
    const n = buf.length, a = buf.getChannelData(0), b = buf.getChannelData(1), out = new DataView(new ArrayBuffer(44 + n * 4));
    const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, RATE, true); out.setUint32(28, RATE * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, a[i] * gain)) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, b[i] * gain)) * 32767, true); }
    let bin = ''; const bytes = new Uint8Array(out.buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  const line = (name, m) => `${name.padEnd(26)} peak ${m.peak.toFixed(3)}${m.bad ? ` (${m.bad} BAD SAMPLES)` : ''}  loud ${dB(m.rms).toFixed(1)} dB  bands <150 ${m.bands[0].toFixed(0)} · <600 ${m.bands[1].toFixed(0)} · <2k4 ${m.bands[2].toFixed(0)} · <9k6 ${m.bands[3].toFixed(0)} · above ${m.bands[4].toFixed(0)}  beat ${m.sway.toFixed(1)} dB`;

  say('the orchestra of the climb (the music to match):');
  for (const h of o.heats) say('  ' + line(`climb at ${h}`, measure(await render(o.seconds, h))));
  for (const id of o.ids) {
    const tune = TUNES[id];
    if (!tune) { say(`${id}: no tune`); continue; }
    say(`${id}: ${tune.bpm} to the minute, ${tune.beats} to the bar, ${tune.parts.length} parts`);
    const heat = tune.heat;
    for (const h of o.heats) {
      tune.heat = () => h;
      const p = tunePlayer({ audio: null }), app = { audio: null };
      const player = tunePlayer(app);
      const buf = await render(o.seconds, null, (audio) => { if (!app.audio) { app.audio = audio; player.play(id, { state: { inside: h } }, null); } player.tick(); });
      void p;
      say('  ' + line(`${id} at ${h}`, measure(buf)));
    }
    if (o.wav) {
      // the whole of it, as a run warms up: forty-five seconds from the first note to everything
      const secs = +(o.long || 46), app = { audio: null }, player = tunePlayer(app);
      let now = 0;
      const st = { inside: 0 };
      tune.heat = () => Math.min(1, now / 38);
      const buf = await render(secs, null, (audio, t) => { now = t; st.inside = Math.min(1, t / 38); if (!app.audio) { app.audio = audio; player.play(id, { state: st }, null); } player.tick(); });
      const m = measure(buf, 1);
      await window.saveWav(id, wav(buf, Math.min(4, 0.9 / Math.max(0.05, m.peak))));
      say(`  written: ${id}.wav (${secs} s, the run warming up from nothing to everything; made ${(Math.min(4, 0.9 / Math.max(0.05, m.peak))).toFixed(1)} times louder for listening)`);
    }
    tune.heat = heat;
  }
}
