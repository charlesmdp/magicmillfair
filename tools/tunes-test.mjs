// The checks of the games' music (src/extras/tunes.js), without a browser: node tools/tunes-test.mjs
// Every tune is read; the player is run against a pretend sound engine that writes down every note it is asked
// for, and what it wrote is held against the score.
import { check, done } from './lib/check.mjs';
import { TUNES, score, tunePlayer, AHEAD, LEAD, DUCK } from '../src/extras/tunes.js';
import * as spiral from '../src/world/zones/games/spiral/rules.js';
import * as waves from '../src/world/zones/games/waves/rules.js';
import * as hive from '../src/world/zones/games/hive/rules.js';
import * as lava from '../src/world/zones/games/lava/rules.js';
import * as flip from '../src/world/zones/games/flip/rules.js';
import * as cars from '../src/world/zones/games/cars/rules.js';
import * as golf from '../src/world/zones/games/golf/rules.js';

const IDS = ['spiral', 'waves', 'hive', 'lava', 'flip', 'cars', 'golf'];
// (the rules of each game: the player is handed them with the run, as plug.js does — a tune imports none)
const RULES = { spiral, waves, hive, lava, flip, cars, golf };
const MOST = 8; // notes at once, at the most (of the 24 the game's music shares), counted as the game counts them
check('a tune for each of the seven games', IDS.every((id) => TUNES[id]), Object.keys(TUNES).join(' '));

// ---------- every tune there is reads — those of the games that are still being built among them
for (const id of Object.keys(TUNES)) {
  let sc = null, why = '';
  try { sc = score(TUNES[id]); } catch (e) { why = e.message; }
  if (!IDS.includes(id)) check(`${id}: its score reads, sixteen bars, every note in a sensible range`, sc && sc.bars === 16 && sc.events.every((e) => e.hz > 10 && e.hz < 8000 && e.len > 0 && (e.midi === null || (e.midi >= 24 && e.midi <= 100))), why || `${sc?.events.length} notes, ${TUNES[id].bpm} bpm`);
}

// ---------- the scores
for (const id of IDS) {
  const tune = TUNES[id];
  let sc = null, why = '';
  try { sc = score(tune); } catch (e) { why = e.message; }
  check(`${id}: its score reads (every line and every pattern adds up to its bars)`, sc, why || `${sc?.bars} bars of ${tune.beats}, ${sc?.events.length} notes, ${tune.bpm} bpm`);
  if (!sc) continue;
  check(`${id}: sixteen bars or so`, sc.bars >= 12 && sc.bars <= 32, sc.bars);
  const pitched = sc.events.filter((e) => e.midi !== null), lo = Math.min(...pitched.map((e) => e.midi)), hi = Math.max(...pitched.map((e) => e.midi));
  check(`${id}: every note in a sensible range`, lo >= 28 && hi <= 100 && sc.events.every((e) => e.hz > (e.midi === null && !e.wave.match(/^(maj|min|dom)/) ? 25 : 10) && e.hz < 8000 && e.len > 0), `MIDI ${lo} … ${hi}`);
  check(`${id}: every note inside its turn`, sc.events.every((e) => e.beat >= 0 && e.beat < sc.length && e.bar < sc.bars), sc.length);
  // (the tunes written as an orchestra have more of them — but their drums and their standing players take no voice)
  const voiced = sc.parts.filter((p) => !p.kit && !p.standing).length;
  check(`${id}: a handful of parts that take a voice`, voiced >= 3 && voiced <= 7 && sc.parts.length <= 14, `${voiced} of ${sc.parts.length}`);
}

// ---------- the player, against a pretend sound engine
function fakeApp({ music = 0.6, muted = false, state = 'running' } = {}) {
  const gain = (v) => { const g = { gain: { value: v, targets: [], setTargetAtTime(x, t) { this.targets.push([x, t]); }, cancelScheduledValues() {} }, connected: 0, connect() { g.connected++; }, disconnect() { g.connected = 0; } }; return g; };
  const tones = [];
  const ctx = { currentTime: 0, sampleRate: 48000, state, createGain: () => gain(1) };
  const audio = {
    ctx, levels: { sound: 0.8, music }, muted, musicBus: gain(1),
    music: { ducked: 1, duck: gain(1), shapes: { warm() {} }, tone: (out, wave, hz, t, dur, vel, attack, sustain, decay, release) => { tones.push({ out, wave, hz, t, dur, vel, release, now: ctx.currentTime }); return {}; } },
  };
  return { app: { audio }, audio, ctx, tones };
}
const duckOf = (audio) => audio.music.duck.gain.targets.at(-1)?.[0] ?? 1;

/** Plays a tune for `secs` of the audio clock, ticking at uneven steps (as frames come); returns what was written. */
function playFor(id, heatState, secs, opts) {
  const f = fakeApp(opts), p = tunePlayer(f.app);
  p.play(id, { state: heatState }, RULES[id]);
  const seen = { maxAhead: 0, ducked: null, last: 0 };
  let k = 0;
  while (f.ctx.currentTime < secs) {
    const before = f.tones.length;
    p.tick(); seen.last = f.ctx.currentTime;
    for (let i = before; i < f.tones.length; i++) seen.maxAhead = Math.max(seen.maxAhead, f.tones[i].t - f.ctx.currentTime);
    if (seen.ducked === null && f.tones.length) seen.ducked = duckOf(f.audio);
    f.ctx.currentTime += [1 / 60, 1 / 30, 1 / 144, 0.05][k++ % 4];
  }
  return { f, p, seen };
}

// a run whose heat is pinned: every part on, or only those that play from the start
const HOT = { hot: true }, COLD = { cold: true };
const pin = (tune, s) => { const heat = tune.heat; tune.heat = () => (s === HOT ? 1 : 0); return () => { tune.heat = heat; }; };

for (const id of IDS) {
  const tune = TUNES[id], sc = score(tune);
  for (const [state, name] of [[HOT, 'every part'], [COLD, 'the first parts']]) {
    const undo = pin(tune, state), heat = state === HOT ? 1 : 0;
    const spb = 60 / (tune.bpm * (1 + (tune.accel || 0) * heat)), turn = sc.length * spb;
    const secs = 3 * turn + 0.5;
    const { f, p, seen } = playFor(id, state, secs);
    // what the score says should have been written by then: every note of the parts that are on, three turns and a bit
    const expected = [];
    for (let k = 0; k < 4; k++) for (const e of sc.events) {
      const at = LEAD + (k * sc.length + e.beat) * spb;
      if (at < seen.last + AHEAD - 1e-7 && (sc.parts[e.part].from || 0) <= heat && heat < (sc.parts[e.part].to ?? 2) && !sc.parts[e.part].kit && !sc.parts[e.part].standing) expected.push([at, e.hz]);
    }
    // every expected note once, at its time, nothing else: the last tick wrote up to its own clock and a third of a second
    const order = (a, b) => a[0] - b[0] || a[1] - b[1];
    const got = f.tones.map((n) => [n.t, n.hz]).sort(order);
    expected.sort(order);
    let wrong = Math.abs(got.length - expected.length);
    for (let i = 0; i < Math.min(got.length, expected.length); i++) if (Math.abs(got[i][0] - expected[i][0]) > 1e-6 || Math.abs(got[i][1] - expected[i][1]) > 1e-6) wrong++;
    check(`${id}, ${name}: three turns written note for note, no gap, nothing twice`, wrong === 0 && got.length > 20, `${got.length} notes of ${expected.length}, ${wrong} wrong (${secs.toFixed(1)} s)`);
    check(`${id}, ${name}: never written more than a third of a second ahead`, seen.maxAhead <= AHEAD + 1e-9, seen.maxAhead.toFixed(3));
    // notes at once, as the game's music counts them (until five release times after a note's end)
    const marks = [];
    for (const n of f.tones) { marks.push([n.t, 1]); marks.push([n.t + n.dur + n.release * 5, -1]); }
    marks.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let now = 0, most = 0; for (const [, d] of marks) { now += d; most = Math.max(most, now); }
    check(`${id}, ${name}: a handful of notes at once at the most`, most <= MOST, most);
    check(`${id}, ${name}: the world's music steps back while it plays`, seen.ducked !== null && Math.abs(seen.ducked - DUCK) < 1e-9, seen.ducked);
    check(`${id}, ${name}: every note into the tune's own bus, plugged into the music bus`, f.tones.every((n) => n.out === f.tones[0].out) && f.tones[0].out.connected === 1, '');
    const bus = f.tones[0].out;
    p.stop();
    check(`${id}, ${name}: stopped, it fades out at once and gives the world its music back`, bus.gain.targets.at(-1)?.[0] === 0 && duckOf(f.audio) === 1 && !p.playing, `world back to ${duckOf(f.audio)}`);
    const n = f.tones.length; p.tick(); f.ctx.currentTime += 1; p.tick();
    check(`${id}, ${name}: nothing written once stopped`, f.tones.length === n, '');
    undo();
  }
}

// ---------- as the run warms up, the parts come in on their bar lines, never in the middle of a phrase
for (const id of ['hive', 'cars', 'golf', 'waves']) { // (tunes whose tempo does not change with the heat: the beat of a note is read from its time)
  const tune = TUNES[id], sc = score(tune), heat = tune.heat, spb = 60 / tune.bpm;
  let h = 0;
  tune.heat = () => h;
  const f = fakeApp(), p = tunePlayer(f.app);
  p.play(id, {});
  for (; f.ctx.currentTime < 2 * sc.length * spb; f.ctx.currentTime += 1 / 60) { h = Math.min(1, f.ctx.currentTime / (1.5 * sc.length * spb)); p.tick(); }
  p.stop(); tune.heat = heat;
  // which part each note is (by its pitch and wave, at its beat), and where each part was first heard
  const first = new Map();
  for (const n of f.tones) {
    const beat = Math.round(((n.t - LEAD) / spb) * 1000) / 1000, inTurn = ((beat % sc.length) + sc.length) % sc.length;
    const e = sc.events.find((x) => Math.abs(x.beat - inTurn) < 1e-3 && Math.abs(x.hz - n.hz) < 1e-6 && x.wave === n.wave);
    if (e && !first.has(e.part)) first.set(e.part, { e, beat });
  }
  const bad = [];
  for (const [part, { e, beat }] of first) {
    const every = sc.parts[part].every || 1, bar = Math.floor(beat / sc.beats + 1e-9), segment = bar - (bar % every);
    // the first note of the part in its phrase
    const head = sc.events.find((x) => x.part === part && x.bar >= segment % sc.bars);
    if (head !== e && sc.parts[part].from) bad.push(`${part}@${bar}`);
  }
  check(`${id}: as it warms up every part comes in at the head of its phrase`, first.size === sc.parts.filter((q) => !q.kit && !q.standing).length && !bad.length, bad.join(' ') || `${first.size} parts`);
}

// ---------- the tunes written as an orchestra: their drums and their standing players, on an engine that can make them
{
  const made = { osc: [], hits: 0, cymbals: 0, filters: 0, sends: 0 };
  const full = () => {
    const f = fakeApp(), ctx = f.ctx;
    const param = () => ({ value: 0, sets: [], targets: [], setValueAtTime(v, t) { this.sets.push([v, t]); }, exponentialRampToValueAtTime() {}, setTargetAtTime(v, t) { this.targets.push([v, t]); }, cancelScheduledValues() {} });
    const node = (more) => ({ connect() {}, disconnect() { this.gone = true; }, start() { this.started = true; }, stop() { this.stopped = true; }, ...more });
    ctx.createGain = () => node({ gain: param() });
    ctx.createOscillator = () => { const o = node({ frequency: param(), detune: param(), type: 'sine' }); made.osc.push(o); return o; };
    ctx.createBiquadFilter = () => { made.filters++; return node({ type: '', frequency: param(), Q: param() }); };
    ctx.createBufferSource = () => node({ buffer: null, loop: false, start(when) { this.started = true; if (when > 0) made.cymbals++; } });
    f.audio.music.bank = { get: () => ({}) };
    f.audio.music.send = node({ gain: param(), connect() { made.sends++; } });
    f.audio.music.shapes = { warm() {}, dress(o, w) { o.wave = w; } };
    f.audio.music.rand = () => 0.5;
    f.audio.musicBus = node({ gain: param() });
    return f;
  };
  for (const id of ['spiral', 'flip']) {
    const tune = TUNES[id], sc = score(tune), undo = pin(tune, HOT);
    made.osc.length = 0; made.cymbals = 0; made.filters = 0;
    const f = full(), p = tunePlayer(f.app), spb = 60 / (tune.bpm * (1 + (tune.accel || 0))), secs = 2 * sc.length * spb;
    p.play(id, { state: HOT }, RULES[id]);
    let last = 0;
    for (; f.ctx.currentTime < secs; f.ctx.currentTime += 1 / 60) { p.tick(); last = f.ctx.currentTime; }
    // what the score says of them by then
    const due = (pick) => { let n = 0; for (let k = 0; k < 3; k++) for (const e of sc.events) if (pick(sc.parts[e.part]) && LEAD + (k * sc.length + e.beat) * spb < last + AHEAD - 1e-7) n++; return n; };
    const standing = made.osc.filter((o) => o.wave), drum = made.osc.find((o) => !o.wave);
    const struck = standing.reduce((a, o) => a + o.frequency.sets.length, 0);
    check(`${id}: its standing players are struck where the score says — one oscillator a line, none made per note`, standing.length === sc.parts.filter((q) => q.standing).length && struck === due((q) => q.standing) && struck > 100, `${struck} strikes on ${standing.length} oscillators`);
    check(`${id}: its big drum falls where the score says, on one oscillator and one loop of noise`, !!drum && drum.frequency.sets.length === due((q) => q.kit === 'drum' || q.kit === 'kick') && drum.frequency.sets.length > 20, drum?.frequency.sets.length);
    check(`${id}: a cymbal at the head of every eighth bar, and a little of the room behind the music`, made.cymbals === due((q) => q.kit === 'cymbal') && made.cymbals >= 2 && tune.room > 0, `${made.cymbals} cymbals`);
    const all = [...made.osc];
    p.stop();
    await new Promise((r) => setTimeout(r, 700));
    check(`${id}: stopped, what was made for its drums and its players is stopped and let go`, all.every((o) => o.stopped && o.gone), '');
    undo();
  }
  // the tune of the spiral is not kept from who keeps falling in the first turns
  const cold = spiral.startRun(0);
  check('spiral: who is still at the foot after a minute hears the theme all the same', TUNES.spiral.heat(cold, 60, spiral) >= 0.29 && TUNES.spiral.heat(cold, 2, spiral) < 0.05 && TUNES.spiral.parts.find((q) => q.line === 'theme').from <= 0.29, TUNES.spiral.heat(cold, 60, spiral).toFixed(2));
  // the theme of the flip turns over: every other phrase is the one before, mirrored
  const th = TUNES.flip.theme.split('|').map((bar) => bar.trim().split(/\s+/).map((n) => n.split(':')[0]));
  const up = (bar) => { const m = th[bar].map((n) => ({ c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[n[0]] + (n.includes('#') ? 1 : 0) + 12 * parseInt(n.at(-1), 10))); return Math.sign(m.at(-1) - m[0]); };
  check('flip: its tune goes up, and comes back upside down', up(0) === 1 && up(4) === -1 && up(8) === 1 && up(12) === -1, [0, 4, 8, 12].map(up).join(' '));
}

// ---------- when nothing should be heard
{
  const off = playFor('spiral', HOT, 5, { music: 0 });
  check('nothing written while the music is off', off.f.tones.length === 0 && duckOf(off.f.audio) === 1, off.f.tones.length);
  const muted = playFor('hive', HOT, 5, { muted: true });
  check('nothing written while the sound is muted', muted.f.tones.length === 0 && duckOf(muted.f.audio) === 1, muted.f.tones.length);
  const asleep = playFor('lava', HOT, 5, { state: 'suspended' });
  check('nothing written while the browser holds the sound back', asleep.f.tones.length === 0, asleep.f.tones.length);
  // the music turned off half-way: it stops writing and gives the world back its level; turned on again, it goes on
  const f = fakeApp(), p = tunePlayer(f.app);
  p.play('cars', { state: cars.startRace(1) }, cars);
  for (; f.ctx.currentTime < 2; f.ctx.currentTime += 1 / 60) p.tick();
  f.audio.levels.music = 0;
  const n = f.tones.length;
  for (; f.ctx.currentTime < 4; f.ctx.currentTime += 1 / 60) p.tick();
  const quiet = f.tones.length === n && duckOf(f.audio) === 1;
  f.audio.levels.music = 0.5;
  for (; f.ctx.currentTime < 6; f.ctx.currentTime += 1 / 60) p.tick();
  check('turned off mid-run it falls silent and gives the world back; on again, it goes on from there', quiet && f.tones.length > n && f.tones.slice(n).every((t) => t.t >= 4) && duckOf(f.audio) === DUCK, f.tones.length - n);
  // the world's music changes its own level while a tune plays (Music.run): it is stepped back again
  f.audio.music.ducked = 0.55; p.tick();
  check('the world music is stepped back again when it changes its own level', Math.abs(duckOf(f.audio) - DUCK * 0.55) < 1e-9, duckOf(f.audio));
  p.stop();
  check('…and given back at its own level', duckOf(f.audio) === 0.55, duckOf(f.audio));
}
{
  let threw = '';
  for (const app of [{}, { audio: null }, { audio: {} }, { audio: { ctx: {}, music: {} } }, { audio: { ctx: { currentTime: 0 }, music: { tone: () => { throw new Error('x'); } }, musicBus: {}, levels: { music: 1 } } }]) {
    try { const p = tunePlayer(app); p.play('spiral', null); p.tick(); p.tick(); p.stop(); p.play('nope', {}); p.tick(); p.stop(); } catch (e) { threw = e.message; }
  }
  check('never throws when the sound is not what it expects (a build without sound)', !threw, threw);
  const f = fakeApp(), p = tunePlayer(f.app);
  p.play('nope', {}); p.tick();
  check('a game without a tune plays none', f.tones.length === 0 && !p.playing, '');
}

// ---------- the heat of each tune, on the states its game's rules keep
const range = (id, states) => {
  const hs = states.map((s) => TUNES[id].heat(s, 30, RULES[id]));
  check(`${id}: heat within 0 … 1 on the states of its rules`, hs.every((h) => Number.isFinite(h) && h >= 0 && h <= 1), hs.map((h) => h.toFixed(2)).join(' '));
  return hs;
};
{
  const a = spiral.startRun(0), b = { ...spiral.startRun(0), s: spiral.LENGTH / 2 }, c = { ...spiral.startRun(0), s: spiral.LENGTH };
  const hs = range('spiral', [a, b, c, { ...a, s: -1 }, { ...a, s: spiral.LENGTH * 2 }]);
  // (the metres climbed — and never less than what the time spent gives: thirty seconds in, a little under a fifth)
  const pure = [a, b, c].map((st) => TUNES.spiral.heat(st, 0, spiral));
  check('spiral: heat follows the metres climbed', pure[0] < 0.05 && Math.abs(pure[1] - 0.5) < 0.05 && pure[2] > 0.95 && hs[0] > 0.1 && hs[0] < 0.3 && Math.abs(hs[1] - 0.5) < 0.05, pure.map((h) => h.toFixed(2)).join(' '));
  const st = spiral.startRun(0), inp = { side: 0, run: 0, jump: false, down: false, crouch: false };
  for (let i = 0; i < 60 * 40; i++) { spiral.botInput(st, inp); spiral.stepRun(st, 1 / 60, inp); }
  range('spiral', [st]);
}
{
  const st = waves.startRun(0), inp = { x: 0, y: 0, jump: false };
  for (let i = 0; i < 60 * 30; i++) { waves.botInput(st, inp); waves.stepRun(st, 1 / 60, inp); }
  range('waves', [waves.startRun(0), st, { ...st, clock: 1e4 }]);
}
{
  const st = hive.startRun(3), inp = { x: 0, y: 0, jump: false };
  for (let i = 0; i < 60 * 30; i++) { hive.botInput(st, inp); hive.stepRun(st, 1 / 60, inp); }
  const hs = range('hive', [hive.startRun(1), st, { ...st, low: 3, clock: 200 }]);
  check('hive: heat grows down the combs and with time', hs[0] < hs[2] && hs[2] === 1, '');
}
{
  const st = lava.startRun(5), inp = { x: 0, y: 0, jump: false };
  for (let i = 0; i < 60 * 40; i++) { lava.botInput(st, inp); lava.stepRun(st, 1 / 60, inp); }
  const hs = range('lava', [lava.startRun(5, 3), lava.startRun(5), st, { ...st, clock: 1e4 }]);
  check('lava: heat rises with the lava', hs[0] <= hs[2] && hs[2] <= hs[3] && hs[3] > 0.9, '');
}
{
  const st = flip.startRun(0), inp = { flip: false };
  for (let i = 0; i < 60 * 30; i++) { flip.botInput(st, inp); flip.stepRun(st, 1 / 60, inp); }
  range('flip', [flip.startRun(), st, { ...st, s: flip.FLIP.length * 2 }]);
}
{
  const st = cars.startRace(2), inp = { x: 0, y: 0, jump: false };
  for (let i = 0; i < 60 * 40; i++) { cars.botInput(st, inp); cars.stepRace(st, 1 / 60, inp); }
  range('cars', [cars.startRace(1), st]);
}
{
  const st = golf.startRound(0), inp = { x: 0, y: 0, jump: false };
  for (let i = 0; i < 60 * 40; i++) { golf.botInput(st, inp); golf.stepRound(st, 1 / 60, inp); }
  const hs = range('golf', [golf.startRound(0), st, { ...st, hole: golf.HOLES.length - 1 }]);
  check('golf: heat follows the holes played', hs[0] === 0 && hs[2] === 1, '');
}
for (const id of IDS) range(id, [null, undefined, {}]);

done();
