// The music of the games with a gate (plug.js): one tune for each, and the player that plays it while a run is on.
// They are written the way the climb's music is (src/audio/tunes.js: CLIMB): a tempo, one chord a bar, a theme
// in note names. Around them, a few parts that play the chords: a bass, an arpeggio, a stab, a drum. Each part
// comes in once the run has warmed up enough (its `from`, on the tune's `heat`: 0 … 1, read from the state the
// game's rules keep — `heat(state, seconds, rules)`: the rules are those of the game that plays, handed over with
// the run, so that the tune of one game loads nothing of another), and only on a bar line — the theme on the first
// bar of its phrase.
//
// The notes are written a third of a second ahead on the audio clock, through the game's own `music.tone` (they
// share its 24 voices: each tune keeps to a handful at once), into a bus of the player's own that goes to the
// "music" bus. While a tune plays, the world's own music steps well back; it is given back when the run ends.
import { midiHz, melody, chord, chordVoice, chordHz, noiseGain, WAVES } from '../audio/synth.js';

export const AHEAD = 0.3; // s: how far ahead of the audio clock the notes are written
export const LEAD = 0.05; // s: the first note of a tune, after the tick that starts it
export const DUCK = 0.1; // how loud the world's own music stays while a tune plays
const FADE = 0.04; // s: the time constant of the fade when a tune stops
/** How loud the drums of the kit play (as the climb's: LEVEL in src/audio/Music.js). */
const KIT = { drum: 0.3, slap: 0.1, hat: 0.03, snare: 0.07, cymbal: 0.07 };

const sat = (v) => (v > 0 ? (v < 1 ? v : 1) : 0); // (NaN gives 0)
/** A number read from a state, or the time since the run began when there is none (a state the rules changed). */
const or = (v, secs, span) => (Number.isFinite(v) ? sat(v) : sat(secs / span));

// How the parts are written. A theme or a written line is text, as in src/audio/tunes.js. A pattern is one bar
// that is played over every chord: '1:.5 5:.5 8' — the degrees of the chord (1 its root, 3 its third, major or
// minor as the chord is, 5, 6, 7 its flat seventh, 8 the octave, 10, 12), 'c' the whole chord on one oscillator
// (see chordVoice in synth.js), 'x' a hit at the part's own pitch, 'r' a rest; ':' and a length in beats.
// A part: { line: 'theme' | text, or pattern, root (MIDI note of a pattern's C), wave, vel, from (the heat it
// comes in at; `to`: the heat it makes way at), every (bars: it comes in or out only on these bar lines), gate (how much of each length is
// held), attack, sustain, decay, release, cents, shift (semitones, a written line) }.
// Two more kinds of part, for the tunes that are written as the climb's orchestra is (Music.js: Epic) — they take
// none of the 24 voices the game's music shares:
//   kit: 'drum' | 'kick' | 'hat' | 'snare' | 'cymbal' — drums made of a low note that drops and of filtered noise;
//        their pattern is hits: 'x' a full one, 'o' a soft one, 'r' a rest (`vel`: how hard, 1 unless said);
//   standing: true — a line of one note at a time on an oscillator that never stops (each note re-tunes and
//        strikes it; `lp`: a low-pass over it, Hz; `glide`: it slides to each note, in so many seconds — a voice):
//        the pulse of the low strings, an arpeggio, somebody humming.
// `mod: [n, r]`: a part that plays only in the bars whose number leaves r when divided by n (a run into every
// fourth bar line, a cymbal at the head of every eighth). `room` (a tune): how much of it goes to the room behind
// the game's music (its two echoes: Music.send) — none unless said.

/** Every tune: by the id of its game. */
export const TUNES = {
  /**
   * The spiral: a ride in six-eight, in G minor — the low strings gallop from the first plank, the big drum falls
   * on the two beats of the bar, and the brass sing a tune one can whistle from the second landing on (it comes in
   * anyway after a while, for who is still learning the first turns). Higher up: a choir, something ticking, the
   * chord turning like the stair in sixteenths, the snare and the cymbals, the brass an octave above — and, in
   * sight of the top, the bell. The tempo pulls forward as one climbs. Written the way the climb's orchestra is
   * (src/audio/Music.js: Epic): the same drums, the same room behind it.
   */
  spiral: {
    bpm: 336, beats: 6, accel: 0.1, room: 0.18,
    chords: 'Gm Gm Eb F Gm Gm D D Bb F Gm Eb Cm D Gm D',
    theme: 'g4:2 a4 bb4:2 d5 | d5:3 bb4:2 a4 | g4:2 bb4 eb5:2 d5 | c5:3 a4:3 | '
      + 'g4:2 a4 bb4:2 d5 | g5:3 f5:2 d5 | f#5:2 e5 d5:2 a4 | d5:6 | '
      + 'f5:2 d5 bb4:2 d5 | c5:2 a4 f4:2 a4 | bb4:2 d5 g5:2 f5 | eb5:3 g4:3 | '
      + 'eb5:2 d5 c5:2 eb5 | d5:2 c5 a4:2 f#4 | g4:3 bb4:2 d5 | d5:2 c5 a4:3',
    parts: [
      { pattern: '1 r r 1 r r', root: 36, wave: 'pulse', standing: true, lp: 1700, vel: 0.15, gate: 0.5, attack: 0.004, release: 0.045 },
      { pattern: 'r 8 8 r 8 8', root: 36, wave: 'pulse', standing: true, lp: 1700, vel: 0.085, gate: 0.45, attack: 0.004, release: 0.04 },
      { pattern: '1:6', root: 36, wave: 'strings', vel: 0.065, gate: 0.94, attack: 0.09, release: 0.03, cents: -5 },
      { kit: 'drum', pattern: 'x r r o r r', from: 0.06 },
      { kit: 'drum', pattern: 'r r r r o x', mod: [4, 3], vel: 0.8, from: 0.2 },
      { line: 'theme', wave: 'brass', vel: 0.12, from: 0.14, every: 8, gate: 0.92, attack: 0.025, sustain: 0.8, decay: 0.3, release: 0.03, cents: -6 },
      { pattern: 'c:6', root: 12, wave: 'chord', vel: 0.055, from: 0.22, gate: 0.9, attack: 0.14, release: 0.035 },
      { kit: 'hat', pattern: 'x o o x o o', from: 0.36 },
      { pattern: '1:.5 5:.5 8:.5 10:.5 12:.5 10:.5 8:.5 5:.5 1:.5 5:.5 8:.5 5:.5', root: 60, wave: 'strings', standing: true, lp: 3200, vel: 0.05, from: 0.48, gate: 0.6, attack: 0.004, release: 0.03 },
      { kit: 'snare', pattern: 'r r r x r r', from: 0.6 },
      { kit: 'cymbal', pattern: 'x:6', mod: [8, 0], from: 0.6 },
      { line: 'theme', shift: 12, wave: 'brass', standing: true, lp: 4200, vel: 0.06, from: 0.72, every: 8, gate: 0.92, attack: 0.03, release: 0.05 },
      { pattern: '8:6', root: 60, wave: 'chime', vel: 0.04, from: 0.88, every: 2, gate: 0.4, attack: 0.003, release: 0.1 },
    ],
    // the metres climbed — and, for who keeps falling in the first turns, the time spent: the tune is not kept from them
    heat: (st, secs, R) => Math.max(or(st?.s / (R?.LENGTH ?? NaN), secs, 150), 0.3 * sat(secs / 50)),
  },

  /**
   * The waves: a barcarolle in D major, in six-eight, that rolls like the sea on the bank: a harp rocking over
   * the chords, a soft pad, and the flute's tune once one has held a while; the longer one holds, the more joins in.
   */
  waves: {
    bpm: 216, beats: 6,
    chords: 'D G D A D G Em A Bm G D A G A D D',
    theme: 'f#5:3 a5:2 f#5 | g5:2 b5 d6:3 | a5:2 f#5 d5:2 e5 | e5:6 | '
      + 'f#5:3 a5:2 d6 | d6:2 b5 g5:2 b5 | a5:2 g5 e5:2 g5 | a5:3 c#5:3 | '
      + 'd5:2 f#5 b5:3 | b5:2 a5 g5:2 d5 | f#5:2 e5 d5:2 a5 | a5:2 g5 e5:3 | '
      + 'd5:2 g5 b5:2 d6 | c#6:2 b5 a5:2 g5 | f#5:3 e5:2 a4 | d5:6',
    parts: [
      { pattern: '1:3 5:2 8', root: 36, wave: 'bourdon', vel: 0.1, gate: 0.8, attack: 0.02, sustain: 0.6, decay: 0.4, release: 0.05 },
      { pattern: '1 5 8 10 8 5', root: 60, wave: 'piano', vel: 0.05, gate: 1, attack: 0.004, sustain: 0.3, decay: 0.2, release: 0.03 },
      { pattern: 'c:6', root: 12, wave: 'chord', vel: 0.035, from: 0.2, gate: 0.88, attack: 0.4, release: 0.04 },
      { line: 'theme', wave: 'flute', vel: 0.1, from: 0.3, every: 4, gate: 0.9, attack: 0.03, release: 0.04, cents: 4 },
      { pattern: 'r:3 x:3', hz: 5600, wave: 'triangle', vel: 0.012, from: 0.65, gate: 0.05, attack: 0.002, release: 0.03 },
    ],
    heat: (st, secs) => or(st?.clock / 100, secs, 100), // the sea only gets rougher: how long one has held
  },

  /**
   * The hive: a busy swing in G minor. A walking bass from the first cell, stabs on two and four, a ticking
   * cymbal, and a tune that buzzes about the hive on a reed — doubled a little out of tune, like wings, as one
   * goes down the combs.
   */
  hive: {
    bpm: 150, beats: 4, swing: 0.66,
    chords: 'Gm Gm Cm Gm Cm Cm Gm Gm D7 Cm Gm D7 Gm Cm D7 Gm',
    theme: 'g4:.5 a4:.5 bb4:.5 b4:.5 d5 bb4 | g4:.5 bb4:.5 d5:.5 f5:.5 g5:2 | eb5:.5 d5:.5 c5:.5 eb5:.5 g5 eb5 | d5:3 r | '
      + 'c5:.5 d5:.5 eb5:.5 e5:.5 f5 g5 | g5:.5 f5:.5 eb5:.5 c5:.5 eb5:2 | d5:.5 c#5:.5 d5:.5 f5:.5 g5 bb5 | a5:.5 bb5:.5 a5:.5 g5:.5 d5:2 | '
      + 'f#5:.5 g5:.5 a5:.5 c6:.5 a5 f#5 | g5:.5 eb5:.5 c5:.5 g4:.5 c5:2 | bb4:.5 d5:.5 g5:.5 bb5:.5 a5 g5 | f#5:.5 a5:.5 d5:.5 c5:.5 a4:2 | '
      + 'g4:.5 bb4:.5 d5:.5 g5:.5 bb5:.5 a5:.5 g5 | eb5:.5 g5:.5 c6:.5 bb5:.5 g5 eb5 | d5:.5 f#5:.5 a5:.5 c6:.5 d6:.5 c6:.5 a5 | g5:2 r:2',
    parts: [
      { pattern: '1 3 5 6', root: 36, wave: 'bourdon', vel: 0.12, gate: 0.85, attack: 0.008, sustain: 0.6, decay: 0.2, release: 0.03 },
      { pattern: 'r c:.5 r:1.5 c:.5 r:.5', root: 12, wave: 'chord', vel: 0.05, from: 0.12, gate: 0.6, attack: 0.006, release: 0.05 },
      { pattern: 'x x:.5 x:.5 x x:.5 x:.5', hz: 6200, wave: 'triangle', vel: 0.014, from: 0.25, gate: 0.06, attack: 0.002, release: 0.03 },
      { line: 'theme', wave: 'reed', vel: 0.075, from: 0.4, every: 4, gate: 0.75, attack: 0.01, sustain: 0.7, decay: 0.15, release: 0.025, cents: -8 },
      { line: 'theme', wave: 'sawtooth', vel: 0.022, from: 0.7, every: 4, gate: 0.75, attack: 0.01, sustain: 0.7, decay: 0.15, release: 0.025, cents: 14 },
    ],
    // down the combs (the lowest one has stood on), and the time held
    heat: (st, secs) => (Number.isFinite(st?.low) ? sat(0.55 * st.low / 3 + 0.45 * sat(st.clock / 75)) : sat(secs / 90)),
  },

  /**
   * The lava: low and slow in C minor, with the flat second that makes it smoulder. A heartbeat in the drum and
   * a held chord from the start; as the lava rises the bass starts to throb, the brass sings low, a bell ticks
   * high above, and the tempo tightens.
   */
  lava: {
    bpm: 90, beats: 4, accel: 0.4,
    chords: 'Cm Cm Db Cm Cm Cm Ab G Fm Fm Db Cm Ab Ab G G',
    theme: 'c4:3 eb4 | d4:2 db4:2 | c4:4 | r:2 g3 c4 | eb4:3 g4 | f4:2 eb4:2 | eb4:2 c4:2 | d4:4 | '
      + 'f4:3 ab4 | g4:2 f4:2 | f4:2 ab4:2 | g4:4 | ab4:2 c5:2 | eb5:3 db5 | d5:2 b4:2 | g4:4',
    parts: [
      { pattern: 'x:1 x:.5 r:2.5', hz: 48, wave: 'sine', vel: 0.3, gate: 0.25, attack: 0.003, sustain: 0.3, decay: 0.06, release: 0.06 },
      { pattern: '1:4', root: 36, wave: 'strings', vel: 0.07, gate: 0.88, attack: 0.3, release: 0.04, cents: -5 },
      { pattern: 'c:4', root: 0, wave: 'chord', vel: 0.04, from: 0.12, gate: 0.88, attack: 0.5, release: 0.04 },
      { pattern: '1:.5 1:.5 8:.5 1:.5 1:.5 1:.5 8:.5 1:.5', root: 36, wave: 'pulse', vel: 0.09, from: 0.3, gate: 0.6, attack: 0.005, release: 0.016 },
      { line: 'theme', wave: 'brass', vel: 0.1, from: 0.5, every: 4, gate: 0.92, attack: 0.05, sustain: 0.8, decay: 0.3, release: 0.05, cents: -4 },
      { pattern: '8 5 8 5', root: 72, wave: 'chime', vel: 0.03, from: 0.75, gate: 0.2, attack: 0.003, release: 0.07 },
    ],
    // how high the lava stands, in levels (a dozen is about as high as a long run sees)
    heat: (st, secs, R) => (st?.round && R?.lavaAt ? or(R.lavaAt(st.round, st.clock) / 12, secs, 90) : sat(secs / 90)),
  },

  /**
   * The flip: the sister of the climb's music, for a machine in which up and down change places. In E minor, at a
   * run: the bass turns over on every eighth — low, high, low, high —, a drum beats the runner's feet, and the brass
   * play a tune that goes up, four notes and an answer — and comes back upside down: every other phrase is the one
   * before it, mirrored. Then the off-beats, the snare, an arpeggio that runs up and falls back, cymbals, the brass
   * in octaves; the tempo tightens with the girders. (Drums and room: as the climb's orchestra — Music.js, Epic.)
   */
  flip: {
    bpm: 150, beats: 4, accel: 0.12, room: 0.16,
    chords: 'Em Em C D Em Em C B G D Am Em Am B Em B',
    theme: 'e4 g4 b4 e5 | d5:1.5 b4:.5 g4:2 | c5 e5 g5 e5 | f#5:2 d5:2 | '
      + 'e5 b4 g4 e4 | f#4:1.5 g4:.5 b4:2 | g5 e5 c5 e5 | d#5:2 b4:2 | '
      + 'b4 d5 g5 b5 | a5:1.5 f#5:.5 d5:2 | c5 e5 a5 c6 | b5:2 g5:2 | '
      + 'c6 a5 e5 c5 | b4:1.5 d#5:.5 f#5:2 | e5 b4 g4 b4 | b4:2 d#5 f#5',
    parts: [
      { pattern: '1:.5 8:.5 1:.5 8:.5 1:.5 8:.5 5:.5 8:.5', root: 36, wave: 'pulse', standing: true, lp: 1800, vel: 0.13, gate: 0.55, attack: 0.004, release: 0.04 },
      { pattern: '1:4', root: 36, wave: 'strings', vel: 0.06, gate: 0.94, attack: 0.09, release: 0.03, cents: -5 },
      { kit: 'kick', pattern: 'x x x x', from: 0.03 },
      { pattern: 'c:4', root: 12, wave: 'chord', vel: 0.05, from: 0.1, gate: 0.9, attack: 0.12, release: 0.035 },
      { line: 'theme', wave: 'brass', vel: 0.12, from: 0.12, every: 4, gate: 0.9, attack: 0.02, sustain: 0.8, decay: 0.3, release: 0.03, cents: -6 },
      { kit: 'hat', pattern: 'r:.5 x:.5 r:.5 x:.5 r:.5 x:.5 r:.5 x:.5', from: 0.25 },
      { pattern: '1:.25 3:.25 5:.25 8:.25 10:.25 12:.25 10:.25 8:.25 5:.25 3:.25 1:.25 3:.25 5:.25 8:.25 5:.25 3:.25', root: 60, wave: 'strings', standing: true, lp: 3400, vel: 0.045, from: 0.4, gate: 0.6, attack: 0.003, release: 0.025 },
      { kit: 'snare', pattern: 'r x r x', from: 0.45 },
      { kit: 'snare', pattern: 'r:3 o:.5 x:.5', mod: [4, 3], vel: 0.9, from: 0.55 },
      { kit: 'cymbal', pattern: 'x:4', mod: [8, 0], from: 0.55 },
      { line: 'theme', shift: -12, wave: 'brass', standing: true, lp: 3000, vel: 0.075, from: 0.7, every: 4, gate: 0.9, attack: 0.025, release: 0.05 },
      { kit: 'hat', pattern: 'o:.25 r:.25 r:.25 o:.25 o:.25 r:.25 r:.25 o:.25 o:.25 r:.25 r:.25 o:.25 o:.25 r:.25 r:.25 o:.25', vel: 0.7, from: 0.8 },
    ],
    heat: (st, secs, R) => or(st?.s / (R?.FLIP?.length ?? NaN), secs, 85), // how far the machine has carried one
  },

  /**
   * The cars: a rocking boogie in E on the bass, a cheeky riff that answers it, a back beat; more of it each lap.
   */
  cars: {
    bpm: 144, beats: 4,
    chords: 'E E E E A A E E B A E B E A B B',
    theme: 'r:2 g5:.5 g#5:.5 b5 | e5:.5 g5:.5 g#5:.5 e5:.5 b4:2 | r:2 g5:.5 g#5:.5 b5 | d6:.5 b5:.5 g#5:.5 e5:.5 e5:2 | '
      + 'r:2 c6:.5 c#6:.5 e6 | a5:.5 c6:.5 c#6:.5 a5:.5 e5:2 | r:2 g5:.5 g#5:.5 b5 | e6:.5 d6:.5 b5:.5 g#5:.5 e5:2 | '
      + 'f#5:.5 a5:.5 b5:.5 d#6:.5 f#6:2 | e6:.5 c#6:.5 a5:.5 c#6:.5 e6:2 | g#5:.5 b5:.5 e6:.5 g#5:.5 b5 e5 | d#5:.5 f#5:.5 a5:.5 b5:.5 r:2 | '
      + 'r:2 g5:.5 g#5:.5 b5 | c#6:.5 e6:.5 c#6:.5 a5:.5 e5:2 | f#5 a5 b5 d#6 | b5:3 r',
    parts: [
      { pattern: '1:.5 5:.5 6:.5 5:.5 7:.5 5:.5 6:.5 5:.5', root: 36, wave: 'pulse', vel: 0.12, gate: 0.8, attack: 0.004, release: 0.03 },
      { pattern: 'x r x r', hz: 58, wave: 'sine', vel: 0.26, gate: 0.2, attack: 0.002, sustain: 0.3, decay: 0.05, release: 0.04 },
      { pattern: 'r x r x', hz: 4200, wave: 'triangle', vel: 0.018, from: 0.2, gate: 0.05, attack: 0.002, release: 0.04 },
      { line: 'theme', wave: 'reed', vel: 0.08, from: 0.3, every: 4, gate: 0.8, attack: 0.008, sustain: 0.75, decay: 0.12, release: 0.04 },
      { pattern: 'r:.5 c:.5 r:1.5 c:.5 r', root: 12, wave: 'chord', vel: 0.045, from: 0.6, gate: 0.5, attack: 0.005, release: 0.05 },
    ],
    // the laps one has behind one (the last lap is the loudest), and the first seconds off the line
    heat: (st, secs, R) => {
      const c = st?.cars?.[0], laps = R?.CARS?.laps;
      if (!c || !laps || !R.lapsDone) return sat(secs / 120);
      return sat(0.25 * sat(st.clock / 20) + 0.75 * sat(R.lapsDone(c) / Math.max(1, laps - 1)));
    },
  },

  /**
   * The golf: a light, jaunty walk in F major that takes its time: oom-pah under a flute, a bell answering it on
   * the back nine.
   */
  golf: {
    bpm: 108, beats: 4, swing: 0.6,
    chords: 'F F C7 F Bb F C7 C7 F F Bb Bb F C7 F F',
    theme: 'c5 f5 a5:1.5 g5:.5 | f5:2 c5:2 | bb4 c5 e5:1.5 d5:.5 | c5:2 a4:2 | d5 f5 bb5:1.5 a5:.5 | a5 g5 f5:2 | g5 e5 c5 e5 | g5:3 r | '
      + 'c5 f5 a5:1.5 g5:.5 | f5:2 a5:2 | bb5 d6 bb5:1.5 a5:.5 | g5:2 f5 d5 | c5 f5 a5 c6 | bb5 g5 e5 c5 | f5:2 a4 c5 | f5:3 r',
    parts: [
      { pattern: '1:2 5:2', root: 36, wave: 'bourdon', vel: 0.11, gate: 0.4, attack: 0.008, sustain: 0.6, decay: 0.15, release: 0.05 },
      { pattern: 'r c r c', root: 12, wave: 'chord', vel: 0.045, gate: 0.35, attack: 0.006, release: 0.05 },
      { line: 'theme', wave: 'flute', vel: 0.1, every: 4, gate: 0.8, attack: 0.02, release: 0.06, cents: 3 },
      { pattern: 'r:3 x:.5 x:.5', hz: 5200, wave: 'triangle', vel: 0.012, from: 0.3, gate: 0.05, attack: 0.002, release: 0.03 },
      { line: 'theme', shift: 12, wave: 'chime', vel: 0.03, from: 0.55, every: 8, gate: 0.5, attack: 0.004, release: 0.08 },
    ],
    heat: (st, secs, R) => or(st?.hole / ((R?.HOLES?.length ?? NaN) - 1), secs, 400), // the holes played
  },

  /**
   * The Sanctuary (a place, not a game: src/extras/sanctuary.js plays it for who walks in): a slow gospel in D flat,
   * in twelve-eight — the deep pedal of an organ and its chords from the door on; then a bass voice that hums the
   * tune, sliding from note to note; a piano rocking in threes; a heartbeat of a drum; and, under the dome, the
   * choir that takes the tune up an octave above the hum, a held third over it, a bell at the head of each phrase.
   * The fourth chord turns minor before it comes home, and the last two bars are an amen. Its heat is how far
   * inside one stands; so is how loud it is.
   */
  sanctuary: {
    bpm: 168, beats: 12, room: 0.34,
    chords: 'Db Db7 Gb Gbm Db Bbm Ebm Ab7 Db Db7 Gb Gbm Db Ab7 Gb Db',
    theme: 'f4:6 eb4:3 db4:3 | f4:6 ab4:3 b4:3 | bb4:9 ab4:3 | a4:6 gb4:6 | f4:9 eb4:3 | db4:6 f4:6 | gb4:6 eb4:3 gb4:3 | f4:3 eb4:9 | '
      + 'ab4:6 f4:3 ab4:3 | b4:6 ab4:6 | bb4:6 db5:6 | db5:3 a4:9 | ab4:6 f4:6 | gb4:6 eb4:6 | gb4:3 f4:3 eb4:3 db4:3 | db4:12',
    parts: [
      { pattern: '1:12', root: 24, wave: 'flute', vel: 0.11, gate: 0.97, attack: 0.5, release: 0.12 },
      { pattern: '1:12', root: 36, wave: 'bourdon', vel: 0.1, gate: 0.97, attack: 0.4, release: 0.12 },
      { pattern: 'c:12', root: 0, wave: 'chord', vel: 0.05, gate: 0.96, attack: 0.6, release: 0.1, cents: -6 },
      { pattern: 'c:12', root: 12, wave: 'chord', vel: 0.028, from: 0.08, gate: 0.96, attack: 0.7, release: 0.1, cents: 7 },
      { line: 'theme', shift: -12, wave: 'reed', standing: true, lp: 620, glide: 0.07, vel: 0.2, from: 0.15, every: 8, gate: 0.94, attack: 0.09, release: 0.16 },
      { pattern: '1 5 8 10 8 5 1 5 8 10 8 5', root: 48, wave: 'piano', vel: 0.045, from: 0.3, gate: 1, attack: 0.006, sustain: 0.35, decay: 0.3, release: 0.08 },
      { kit: 'drum', pattern: 'x:6 o:6', vel: 0.4, from: 0.4 },
      { line: 'theme', wave: 'principal', standing: true, lp: 1500, glide: 0.06, vel: 0.07, from: 0.55, every: 8, gate: 0.94, attack: 0.12, release: 0.2 },
      { pattern: '3:12', root: 60, wave: 'principal', standing: true, lp: 1300, glide: 0.15, vel: 0.04, from: 0.7, gate: 0.96, attack: 0.3, release: 0.25 },
      { pattern: '8:12', root: 60, wave: 'chime', vel: 0.035, mod: [8, 0], from: 0.7, gate: 0.3, attack: 0.004, release: 0.5 },
    ],
    heat: (st) => sat(st?.inside ?? 0),
    level: (st) => sat(0.2 + 0.65 * sat((st?.inside ?? 0) * 1.6)),
  },
};

// ---------------------------------------------------------------------------------------------- the score

const DEGREE = { 1: 0, 2: 2, 4: 5, 5: 7, 6: 9, 7: 10, 8: 12, 12: 19 };
/** The semitones of a degree over the root of a chord of this kind. */
const degree = (d, kind) => (d === 3 ? (kind === 'min' ? 3 : 4) : d === 10 ? (kind === 'min' ? 15 : 16) : DEGREE[d]);

/** The drums of the kit: about where each one sounds (Hz) — what the score says of a hit. */
export const KIT_HZ = { drum: 60, kick: 62, hat: 7500, snare: 1900, cymbal: 5200 };
const scores = new Map();
/**
 * A tune as the player reads it: { bars, beats, length (beats of one turn), parts, events } — the events sorted
 * by the beat they start on: { beat, bar, part (its index), wave, hz, midi (null for a chord or a hit), len (beats) }.
 * Throws on a tune it cannot read (the checks read every tune).
 */
export function score(tune) {
  let s = scores.get(tune);
  if (s) return s;
  const names = tune.chords.trim().split(/\s+/), bars = names.length, B = tune.beats, length = bars * B;
  const harmony = names.map((n) => { const c = chord(n); if (!Number.isFinite(c.pc)) throw new Error(`no chord ${n}`); return c; });
  const events = [];
  const swing = (beat) => (tune.swing && Math.abs(beat % 1 - 0.5) < 1e-6 ? Math.floor(beat) + tune.swing : beat);
  tune.parts.forEach((p, part) => {
    const put = (beat, wave, hz, midi, len, v = 1) => { const bar = Math.floor(beat / B + 1e-6); if (!p.mod || bar % p.mod[0] === p.mod[1]) events.push({ beat: swing(beat), bar, part, wave, hz, midi, len, v }); };
    if (p.line) {
      const text = p.line === 'theme' ? tune.theme : p.line, lines = melody(text, B);
      const total = text.split(/\s+/).filter((t) => t && t !== '|').reduce((a, t) => a + parseFloat(t.split(':')[1] || '1'), 0);
      if (Math.abs(total - length) > 1e-6) throw new Error(`a line of ${total} beats over ${length}`);
      lines.forEach((notes, bar) => { for (const [at, m, len] of notes) { const n = m + (p.shift || 0); put(bar * B + at, p.wave, midiHz(n), n, len); } });
    } else {
      const tokens = p.pattern.trim().split(/\s+/).map((t) => { const [k, len = '1'] = t.split(':'); return [k, parseFloat(len)]; });
      const total = tokens.reduce((a, t) => a + t[1], 0);
      if (Math.abs(total - B) > 1e-6) throw new Error(`a pattern of ${total} beats in a bar of ${B}`);
      if (p.kit && !KIT_HZ[p.kit]) throw new Error(`no drum ${p.kit}`);
      harmony.forEach((c, bar) => {
        let at = bar * B;
        for (const [k, len] of tokens) {
          if (p.kit) { if (k === 'x' || k === 'o') put(at, p.kit, KIT_HZ[p.kit], null, len, k === 'x' ? 1 : 0.55); else if (k !== 'r') throw new Error(`no hit ${k}`); }
          else if (k === 'c') { const root = midiHz(48 + c.pc); put(at, chordVoice(c.kind, root), chordHz(c.kind, root) * 2 ** (p.root / 12), null, len); } else if (k === 'x') put(at, p.wave, p.hz, null, len);
          else if (k !== 'r') {
            const d = degree(parseInt(k, 10), c.kind);
            if (d === undefined) throw new Error(`no degree ${k}`);
            const n = p.root + c.pc + d; put(at, p.wave, midiHz(n), n, len);
          }
          at += len;
        }
      });
    }
  });
  events.sort((a, b) => a.beat - b.beat || a.part - b.part);
  scores.set(tune, (s = { bars, beats: B, length, parts: tune.parts, events }));
  return s;
}

/** The first event that starts on `beat` (of one turn) or after it. */
function from(events, beat) {
  let lo = 0, hi = events.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (events[mid].beat < beat - 1e-9) lo = mid + 1; else hi = mid; }
  return lo;
}

// ---------------------------------------------------------------------------------------------- the player

/**
 * The player of the games' music. play(id, run) starts the tune of a game for a run (none if it has no tune),
 * tick() writes what comes in the next third of a second (every frame while the run is on), stop() fades it out
 * at once and gives the world its music back. It reads `app.audio` when it plays: in a build without sound, or
 * while the music is off or the sound is held back, it writes nothing.
 */
export function tunePlayer(app) {
  let tune = null, sc = null, run = null, rules = null, began = 0;
  let bus = null, ducking = false, seen = 1;
  let b = 0, t = null, bar = -1; // the beat written up to, the audio time it falls on (null: not started), the last bar line
  let on = [];
  let kit = null, lines = [], nodes = []; // the drums, the players that never stop (by part), and every node made for them

  /**
   * What a tune written as an orchestra needs besides notes: a little of the room behind the game's music, its
   * drums (one low oscillator and one loop of noise through three filters: nothing is made per hit, but a cymbal),
   * and an oscillator for each of its standing lines. Made with the bus; where the sound engine cannot make them
   * (a build without sound, the checks), the tune plays without.
   */
  const build = (a) => {
    const ctx = a.ctx, m = a.music;
    kit = null; lines = []; nodes = [];
    const gain = (v, to) => { const g = ctx.createGain(); g.gain.value = v; g.connect(to); nodes.push(g); return g; };
    try { if (tune.room && m.send) bus.connect(gain(tune.room, m.send)); } catch { /* no room: dry */ }
    try {
      if (sc.parts.some((p) => p.kit) && m.bank?.get && ctx.createBufferSource && ctx.createBiquadFilter && ctx.createOscillator) {
        const rate = ctx.sampleRate, noise = ctx.createBufferSource(), drum = ctx.createOscillator();
        const band = (type, hz, q, to) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.Q.value = q; f.connect(to); nodes.push(f); return f; };
        noise.buffer = m.bank.get('white'); noise.loop = true; noise.start();
        drum.type = 'sine'; drum.start();
        nodes.push(noise, drum);
        const k = { noise, drum, drumEnv: gain(0, bus), slapEnv: gain(0, bus), hatEnv: gain(0, bus), snareEnv: gain(0, bus) };
        drum.connect(k.drumEnv);
        noise.connect(band('lowpass', 1100, 0.7, k.slapEnv)); noise.connect(band('highpass', 7500, 0.7, k.hatEnv)); noise.connect(band('bandpass', 1900, 0.8, k.snareEnv));
        k.slap = noiseGain('white', 'lowpass', 1100, 0.7, rate) * KIT.slap; k.hat = noiseGain('white', 'highpass', 7500, 0.7, rate) * KIT.hat;
        k.snare = noiseGain('white', 'bandpass', 1900, 0.8, rate) * KIT.snare; k.cymbal = noiseGain('white', 'highpass', 5200, 0.7, rate) * KIT.cymbal;
        kit = k;
      }
    } catch { kit = null; }
    sc.parts.forEach((p, i) => {
      if (!p.standing) return;
      try {
        const o = ctx.createOscillator(), g = ctx.createGain();
        if (WAVES[p.wave]) m.shapes.dress(o, p.wave); else o.type = p.wave;
        g.gain.value = 0;
        let out = bus;
        if (p.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = p.lp; f.Q.value = 0.8; f.connect(bus); nodes.push(f); out = f; }
        o.connect(g); g.connect(out); o.start();
        nodes.push(o, g);
        lines[i] = { o, g };
      } catch { lines[i] = null; }
    });
  };
  /** One hit of the kit at `when` (the climb's own drums: Music.js). */
  const hit = (a, which, when, v) => {
    const k = kit;
    if (!k || !(v > 0)) return;
    if (which === 'drum' || which === 'kick') {
      const f = k.drum.frequency, big = which === 'drum';
      f.setValueAtTime(big ? 108 : 124, when); f.exponentialRampToValueAtTime(big ? 46 : 52, when + (big ? 0.11 : 0.07)); // the skin: a note that drops as it rings
      k.drumEnv.gain.setTargetAtTime(KIT.drum * v * (big ? 1 : 0.8), when, 0.002); k.drumEnv.gain.setTargetAtTime(0, when + (big ? 0.03 : 0.018), big ? 0.09 : 0.05);
      k.slapEnv.gain.setTargetAtTime(k.slap * v * (big ? 1 : 0.7), when, 0.001); k.slapEnv.gain.setTargetAtTime(0, when + 0.008, 0.02);
    } else if (which === 'hat') { k.hatEnv.gain.setTargetAtTime(k.hat * v, when, 0.001); k.hatEnv.gain.setTargetAtTime(0, when + 0.004, 0.018); }
    else if (which === 'snare') { k.snareEnv.gain.setTargetAtTime(k.snare * v, when, 0.001); k.snareEnv.gain.setTargetAtTime(0, when + 0.01, 0.05); }
    else if (which === 'cymbal') {
      const ctx = a.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = a.music.bank.get('white');
      f.type = 'highpass'; f.frequency.value = 5200;
      g.gain.value = 0; g.gain.setTargetAtTime(k.cymbal * v, when, 0.004); g.gain.setTargetAtTime(0, when + 0.03, 0.55);
      src.connect(f); f.connect(g); g.connect(bus);
      src.start(when, (a.music.rand?.() ?? 0.5) * 0.2, 2.8);
    }
  };

  const sound = () => {
    const a = app?.audio;
    if (!a || !a.ctx || !a.music || typeof a.music.tone !== 'function' || !a.musicBus || !a.levels) return null;
    return a;
  };
  const latch = (k, heat, first) => {
    const n = ((k % sc.bars) + sc.bars) % sc.bars;
    sc.parts.forEach((p, i) => { if (first || n % (p.every || 1) === 0) on[i] = heat >= (p.from || 0) && heat < (p.to ?? 2); });
  };
  const duck = (a, now) => {
    const m = a.music;
    if (!m.duck) return;
    if (!ducking || m.ducked !== seen) { m.duck.gain.setTargetAtTime(DUCK * Math.min(1, m.ducked ?? 1), now, 0.25); seen = m.ducked; ducking = true; }
  };
  const release = () => {
    const a = sound();
    if (!a) { bus = null; ducking = false; return; }
    const now = a.ctx.currentTime;
    if (ducking && a.music.duck) a.music.duck.gain.setTargetAtTime(a.music.ducked ?? 1, now, 0.4);
    ducking = false;
    if (bus) {
      const g = bus, made = nodes;
      g.gain.cancelScheduledValues?.(now);
      g.gain.setTargetAtTime(0, now, FADE);
      // (…and, once it has faded, what was made for its drums and its standing players is stopped and let go)
      setTimeout(() => { try { g.disconnect(); } catch { /* already gone */ } for (const n of made) { try { n.stop?.(); } catch { /* not started, or stopped */ } try { n.disconnect(); } catch { /* gone */ } } }, 600);
      bus = null; kit = null; lines = []; nodes = [];
    }
  };

  const write = (a, heat) => {
    const ctx = a.ctx, now = ctx.currentTime, until = now + AHEAD, L = sc.length;
    const spb = 60 / (tune.bpm * (1 + (tune.accel || 0) * heat));
    if (t === null) { b = 0; t = now + LEAD; bar = -1; latch(0, heat, true); bar = 0; }
    else if (t < now) { b += (now + LEAD - t) / spb; t = now + LEAD; } // left behind (the tab slept): on from here
    if (t >= until) return;
    const end = b + (until - t) / spb, m = a.music;
    for (let k = Math.floor(b / L); k * L < end; k++) {
      const ev = sc.events;
      for (let i = from(ev, b - k * L); i < ev.length; i++) {
        const e = ev[i], at = k * L + e.beat;
        if (at >= end) break;
        if (at < b) continue; // (written by the last tick: the same sum decides on both sides of the line)
        const abar = k * sc.bars + e.bar;
        if (abar > bar) { for (let j = Math.max(bar + 1, abar - sc.bars); j <= abar; j++) latch(j, heat, false); bar = abar; }
        if (!on[e.part]) continue;
        const p = sc.parts[e.part], when = t + (at - b) * spb, len = e.len * spb * (p.gate ?? 0.9);
        if (p.kit) hit(a, p.kit, when, (p.vel ?? 1) * e.v * (0.8 + 0.2 * heat));
        else if (p.standing) {
          // (a player that never stops: re-tuned and struck)
          const l = lines[e.part];
          if (l) { if (p.glide) l.o.frequency.setTargetAtTime(e.hz, when, p.glide); else l.o.frequency.setValueAtTime(e.hz, when); l.g.gain.setTargetAtTime(p.vel * (0.85 + 0.15 * heat), when, p.attack ?? 0.004); l.g.gain.setTargetAtTime(0, when + Math.max(0.02, len), p.release ?? 0.04); }
        } else m.tone(bus, e.wave, e.hz, when, len, p.vel * (0.85 + 0.15 * heat), p.attack ?? 0.01, p.sustain ?? 1, p.decay ?? 0, p.release ?? 0.05, p.cents || 0);
      }
    }
    // bar lines with no note on them still count
    const last = Math.floor(end / sc.beats - 1e-9);
    if (last > bar) { for (let j = Math.max(bar + 1, last - sc.bars); j <= last; j++) latch(j, heat, false); bar = last; }
    b = end; t = until;
  };

  return {
    /** Plays the tune of game `id` for the run `r`; `R`: the rules of that game (its heat is read from them). */
    play(id, r, R = null) {
      this.stop();
      if (!TUNES[id]) return;
      tune = TUNES[id]; run = r || null; rules = R; t = null; on = [];
      try { sc = score(tune); } catch { tune = null; return; }
      began = typeof performance !== 'undefined' ? performance.now() : Date.now();
      try { const a = sound(); if (a?.music.shapes?.warm) a.music.shapes.warm([...new Set(sc.events.map((e) => e.wave))].filter((w) => WAVES[w])); } catch { /* no matter */ }
    },
    tick() {
      if (!tune) return;
      try {
        const a = sound();
        if (!a) return;
        if (!(a.levels.music > 0) || a.muted || (!a.offline && a.ctx.state && a.ctx.state !== 'running')) { if (ducking || bus) release(); t = null; return; }
        if (!bus) { bus = a.ctx.createGain(); bus.gain.value = 1; bus.connect(a.musicBus); build(a); }
        const now = a.ctx.currentTime;
        duck(a, now);
        const secs = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - began) / 1000;
        let heat = 0;
        try { heat = sat(tune.heat ? tune.heat(run?.state, secs, rules) : 0); } catch { heat = sat(secs / 120); }
        // (a tune may say how loud it is, from the same state: the music of a place, nearer or further)
        if (tune.level) { try { bus.gain.setTargetAtTime(sat(tune.level(run?.state, secs, rules)), now, 0.35); } catch { /* as it was */ } }
        write(a, heat);
      } catch { /* the music never stops a game */ }
    },
    stop() {
      try { release(); } catch { /* nothing to give back */ }
      tune = null; sc = null; run = null; rules = null; t = null; bus = null; ducking = false;
    },
    /** For the checks: what plays now. */
    get playing() { return tune; },
  };
}
