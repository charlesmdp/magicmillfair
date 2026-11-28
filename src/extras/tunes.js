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
// For a tune sung in a great room (the Sanctuary's), two more things, which no other tune asks for:
//   hall: { seconds, wet, dry(state) } — a room of its own behind the tune: a tail of so many seconds (a
//        reverberation made once, in numbers: a convolver), `wet` how much goes into it, `dry(state)` how much
//        is heard straight (little from far away: the tail is what reaches the door);
//   choir: n — a standing line sung by n throats a shade apart (`spread`, cents) with one vibrato between them,
//        through the formants of a vowel (`vowels`: one letter of 'aoeui' a note, in turn), and a breath
//        (`breath`: how loud) before each phrase, wherever the line comes back after a rest.

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

  // ------------------------------------------------------------------------------------------------------------
  // The six games of lab/NEWGAMES.md. Their heat is what their rules say of a run — `heatOf(state)` → 0 … 1, exported
  // by the rules of the game — and the time played where the rules say nothing.

  /**
   * War Through the Ages: a march in A minor that grows up with the armies. The stone age has drums and a bone
   * flute; then the low strings march and the brass take the tune; then a choir and a snare; then the ticking and
   * an arpeggio; and for the atom everything, the brass in octaves under cymbals.
   */
  ages: {
    bpm: 108, beats: 4, accel: 0.08, room: 0.18,
    chords: 'Am Am F G Am Am F E C G Am F Dm E Am Am',
    theme: 'a4:1.5 a4:.5 c5 e5 | e5:1.5 d5:.5 c5:2 | a4:1.5 c5:.5 f5 e5 | d5:3 b4 | '
      + 'a4:1.5 a4:.5 c5 e5 | a5:2 g5 e5 | f5:1.5 e5:.5 d5 c5 | b4:3 e4 | '
      + 'g5:1.5 e5:.5 c5 e5 | d5:1.5 b4:.5 g4:2 | a4 c5 e5 a5 | a5:1.5 g5:.5 f5:2 | '
      + 'f5:1.5 e5:.5 d5 f5 | e5:1.5 d5:.5 b4 g#4 | a4:3 e5 | a4:4',
    parts: [
      { kit: 'drum', pattern: 'x:.5 r:.5 r:.5 o:.5 r:.5 r:.5 x:.5 o:.5' },
      { pattern: '1:4', root: 36, wave: 'strings', vel: 0.06, gate: 0.94, attack: 0.09, release: 0.03, cents: -5 },
      { line: 'theme', wave: 'flute', vel: 0.085, to: 0.24, every: 8, gate: 0.85, attack: 0.03, release: 0.06, cents: 5 },
      { pattern: '1:.5 1:.5 8:.5 1:.5 1:.5 8:.5 1:.5 8:.5', root: 36, wave: 'pulse', standing: true, lp: 1700, vel: 0.12, from: 0.2, gate: 0.5, attack: 0.004, release: 0.045 },
      { line: 'theme', wave: 'brass', vel: 0.12, from: 0.24, every: 8, gate: 0.92, attack: 0.025, sustain: 0.8, decay: 0.3, release: 0.03, cents: -6 },
      { pattern: 'c:4', root: 12, wave: 'chord', vel: 0.055, from: 0.45, gate: 0.9, attack: 0.14, release: 0.035 },
      { kit: 'snare', pattern: 'r x:.5 o:.5 r x:.25 o:.25 o:.25 o:.25', vel: 0.8, from: 0.45 },
      { kit: 'hat', pattern: 'o:.5 x:.5 o:.5 x:.5 o:.5 x:.5 o:.5 x:.5', from: 0.7 },
      { pattern: '1:.5 5:.5 8:.5 10:.5 12:.5 10:.5 8:.5 5:.5', root: 60, wave: 'strings', standing: true, lp: 3200, vel: 0.045, from: 0.7, gate: 0.6, attack: 0.004, release: 0.03 },
      { kit: 'cymbal', pattern: 'x:4', mod: [8, 0], from: 0.7 },
      { line: 'theme', shift: -12, wave: 'brass', standing: true, lp: 3000, vel: 0.075, from: 0.95, every: 8, gate: 0.92, attack: 0.03, release: 0.05 },
    ],
    heat: (st, secs, R) => or(R?.heatOf?.(st), secs, 240),
  },

  /**
   * Wild River: a reel in G major, as bright as the water is white — the bass goes boom and the chords answer,
   * a fiddle has the tune, a banjo rolls under it from the first rapids on, and a flute doubles the fiddle high
   * above when the river runs fastest.
   */
  raft: {
    bpm: 138, beats: 4, accel: 0.08, room: 0.12,
    chords: 'G G C G G Em Am D7 G G C G Em C D7 G',
    theme: 'd5:.5 e5:.5 g5 b5 a5:.5 g5:.5 | e5 g5 d5:2 | e5:.5 g5:.5 c6 e6 d6:.5 c6:.5 | b5:1.5 a5:.5 g5:2 | '
      + 'd5:.5 e5:.5 g5 b5 d6 | b5:.5 a5:.5 g5 e5:2 | c6:.5 b5:.5 a5 e5 a5 | f#5:2 a5 d6 | '
      + 'd6:.5 b5:.5 g5 b5 a5:.5 g5:.5 | e5 g5 d5:2 | e5:.5 g5:.5 c6 e6 g6:.5 e6:.5 | d6:1.5 b5:.5 g5:2 | '
      + 'b5:.5 g5:.5 e5 g5 b5 | c6:.5 e6:.5 g6 e6 c6 | d6:.5 c6:.5 a5 f#5 d5 | g5:4',
    parts: [
      { pattern: '1 r 5 r', root: 36, wave: 'bourdon', vel: 0.12, gate: 0.7, attack: 0.006, sustain: 0.6, decay: 0.15, release: 0.03 },
      { pattern: 'r c:.5 r:.5 r c:.5 r:.5', root: 12, wave: 'chord', vel: 0.05, gate: 0.5, attack: 0.005, release: 0.04 },
      { line: 'theme', shift: -12, wave: 'strings', vel: 0.1, from: 0.08, every: 4, gate: 0.85, attack: 0.012, sustain: 0.85, decay: 0.2, release: 0.035, cents: 4 },
      { kit: 'kick', pattern: 'x r x r', vel: 0.8, from: 0.12 },
      { kit: 'snare', pattern: 'o:.5 x:.5 o:.5 x:.5 o:.5 x:.5 o:.5 x:.5', vel: 0.55, from: 0.25 },
      { pattern: '8:.25 5:.25 10:.25 8:.25 12:.25 10:.25 8:.25 5:.25 8:.25 5:.25 10:.25 8:.25 12:.25 10:.25 8:.25 5:.25', root: 60, wave: 'pianoHigh', standing: true, lp: 5000, vel: 0.05, from: 0.4, gate: 0.5, attack: 0.002, release: 0.03 },
      { kit: 'hat', pattern: 'r:.5 x:.5 r:.5 x:.5 r:.5 x:.5 r:.5 x:.5', from: 0.55 },
      { line: 'theme', wave: 'flute', standing: true, glide: 0.012, vel: 0.05, from: 0.75, every: 4, gate: 0.85, attack: 0.02, release: 0.05 },
      { kit: 'cymbal', pattern: 'x:4', mod: [8, 0], vel: 0.7, from: 0.75 },
    ],
    heat: (st, secs, R) => or(R?.heatOf?.(st), secs, 90),
  },

  /**
   * Run the Walls: a tune for a ruin in the sun, in D with its flat second and its raised third — a drone, a hand
   * drum that says dum, tek-tek, dum, tek, a lute plucking the chord, and a flute that turns its notes before
   * it lands on them; strings under it as one gets on.
   */
  walls: {
    bpm: 120, beats: 4, accel: 0.06, room: 0.2,
    chords: 'D D Eb D Gm Gm Eb D D D Cm D Gm Eb D D',
    theme: 'd5:1.5 eb5:.5 f#5 g5 | a5:2 g5:.5 f#5:.5 eb5 | g5:1.5 f#5:.5 eb5 bb4 | d5:4 | '
      + 'd5:.5 g5:.5 bb5 a5 g5 | bb5:1.5 a5:.5 g5:2 | g5:.5 f#5:.5 eb5 g5 bb5 | a5:1.5 f#5:.5 d5:2 | '
      + 'a5:1.5 bb5:.5 c6 d6 | d6:2 c6:.5 bb5:.5 a5 | g5:1.5 eb5:.5 c5 eb5 | f#5:3 a5 | '
      + 'bb5:.5 a5:.5 g5 d5 g5 | g5:.5 f#5:.5 eb5 bb4 eb5 | d5:1.5 eb5:.5 f#5 a5 | d5:4',
    parts: [
      { pattern: '1:4', root: 36, wave: 'strings', vel: 0.065, gate: 0.96, attack: 0.12, release: 0.04, cents: -5 },
      { kit: 'kick', pattern: 'x:.5 r:1.5 x:.5 r:1.5', vel: 0.85 },
      { kit: 'snare', pattern: 'r:.5 o:.5 r:.5 o:.5 r:1 o:.5 r:.5', vel: 0.55 },
      { pattern: '1:.5 5:.5 8:.5 5:.5 1:.5 5:.5 8:.5 5:.5', root: 48, wave: 'pianoHigh', standing: true, lp: 3600, vel: 0.07, from: 0.08, gate: 0.4, attack: 0.002, release: 0.05 },
      { line: 'theme', wave: 'flute', standing: true, glide: 0.022, vel: 0.11, from: 0.15, every: 4, gate: 0.9, attack: 0.02, release: 0.06 },
      { kit: 'hat', pattern: 'r:.5 o:.5 x:.5 o:.5 r:.5 o:.5 x:.5 o:.5', vel: 0.8, from: 0.4 },
      { pattern: 'c:4', root: 12, wave: 'chord', vel: 0.04, from: 0.5, gate: 0.9, attack: 0.2, release: 0.04 },
      { line: 'theme', shift: -12, wave: 'strings', vel: 0.06, from: 0.7, every: 4, gate: 0.9, attack: 0.03, sustain: 0.85, decay: 0.3, release: 0.04, cents: -6 },
      { kit: 'cymbal', pattern: 'x:4', mod: [8, 0], vel: 0.6, from: 0.7 },
    ],
    heat: (st, secs, R) => or(R?.heatOf?.(st), secs, 100),
  },

  /**
   * Robots Can See You: on tiptoe, in C minor, swung — a bass that takes two steps and waits, fingers snapping on
   * two and four, a vibraphone that drops a chord now and then, and a piano that says three notes and holds its
   * breath. Seen, or nearly: the strings shiver and the brushes hurry.
   */
  sneak: {
    bpm: 92, beats: 4, swing: 0.66, room: 0.14,
    chords: 'Cm Cm Fm Cm Ab G7 Cm Cm Fm Fm Cm Cm Ab G7 Cm G7',
    theme: 'c5:.5 r:.5 eb5:.5 r:.5 g5 r | r:2 f#5:.5 g5:.5 r | c5:.5 r:.5 f5:.5 r:.5 ab5 r | g5:.5 f5:.5 eb5 c5 r | '
      + 'ab4:.5 r:.5 c5:.5 r:.5 eb5 r | d5:.5 r:.5 f5:.5 r:.5 b4 r | c5:3 r | r:2 g4:.5 b4:.5 d5 | '
      + 'f5:.5 r:.5 ab5:.5 r:.5 c6 r | r:2 b5:.5 c6:.5 r | eb5:.5 r:.5 g5:.5 r:.5 c6 r | bb5:.5 g5:.5 eb5 c5 r | '
      + 'c5:.5 eb5:.5 ab5 r:2 | b4:.5 d5:.5 g5 r:2 | c5:.5 r:.5 eb5:.5 r:.5 g5:.5 r:.5 c6 | r:2 g5 b4',
    parts: [
      { pattern: '1 r 5 r:.5 7:.5', root: 36, wave: 'bourdon', vel: 0.13, gate: 0.55, attack: 0.008, sustain: 0.5, decay: 0.2, release: 0.04 },
      { kit: 'hat', pattern: 'r x r x', vel: 0.9 },
      { line: 'theme', wave: 'piano', vel: 0.1, from: 0.06, every: 4, gate: 0.7, attack: 0.004, sustain: 0.4, decay: 0.2, release: 0.05 },
      { pattern: 'r:1.5 c:.5 r:2', root: 12, wave: 'chord', vel: 0.04, from: 0.2, gate: 0.6, attack: 0.006, release: 0.2 },
      { kit: 'snare', pattern: 'o:.5 r:.5 o:.5 o:.5 o:.5 r:.5 o:.5 o:.5', vel: 0.35, from: 0.35 },
      { line: 'theme', shift: 12, wave: 'chime', vel: 0.035, from: 0.5, every: 4, gate: 0.5, attack: 0.004, release: 0.12 },
      { pattern: '5:.25 r:.25 5:.25 r:.25 5:.25 r:.25 5:.25 r:.25 5:.25 r:.25 5:.25 r:.25 5:.25 r:.25 5:.25 r:.25', root: 60, wave: 'strings', standing: true, lp: 2600, vel: 0.035, from: 0.7, gate: 0.9, attack: 0.01, release: 0.03 },
      { kit: 'kick', pattern: 'x r:1.5 o:.5 r', vel: 0.6, from: 0.7 },
    ],
    heat: (st, secs, R) => or(R?.heatOf?.(st), secs, 120),
  },

  /**
   * Little Mine Train: the train is the drum — a snare that chuffs in fours, faster as it runs away —, the bass
   * goes boom and the chords chick, a mouth organ has the tune, a banjo joins, and a whistle of two notes blows at
   * the head of every other phrase.
   */
  mine: {
    bpm: 126, beats: 4, accel: 0.2, room: 0.12,
    chords: 'G G C G D7 D7 G G C C G Em Am D7 G G',
    theme: 'b4:1.5 d5:.5 g5:2 | g5:1.5 e5:.5 d5:2 | e5:1.5 g5:.5 c6:2 | b5:3 d5 | '
      + 'f#5:1.5 a5:.5 d6:2 | c6:1.5 a5:.5 f#5:2 | g5:1.5 b5:.5 d6 b5 | g5:4 | '
      + 'e5 g5 c6 e6 | e6:1.5 c6:.5 g5:2 | d5 g5 b5 d6 | b5:1.5 g5:.5 e5:2 | '
      + 'c5:1.5 e5:.5 a5:2 | a5:1.5 f#5:.5 d5:2 | b4:1.5 d5:.5 g5 b5 | g5:4',
    parts: [
      { kit: 'snare', pattern: 'x:.25 o:.25 o:.25 o:.25 x:.25 o:.25 o:.25 o:.25 x:.25 o:.25 o:.25 o:.25 x:.25 o:.25 o:.25 o:.25', vel: 0.5 },
      { pattern: '1 r 5 r', root: 36, wave: 'bourdon', vel: 0.12, gate: 0.7, attack: 0.006, sustain: 0.6, decay: 0.15, release: 0.03 },
      { pattern: 'r c:.5 r:.5 r c:.5 r:.5', root: 12, wave: 'chord', vel: 0.05, from: 0.06, gate: 0.5, attack: 0.005, release: 0.04 },
      { line: 'theme', wave: 'reed', vel: 0.1, from: 0.12, every: 4, gate: 0.88, attack: 0.02, sustain: 0.8, decay: 0.2, release: 0.04, cents: -7 },
      { kit: 'kick', pattern: 'x r x r', vel: 0.9, from: 0.25 },
      { pattern: '8:.25 5:.25 10:.25 8:.25 12:.25 10:.25 8:.25 5:.25 8:.25 5:.25 10:.25 8:.25 12:.25 10:.25 8:.25 5:.25', root: 60, wave: 'pianoHigh', standing: true, lp: 5000, vel: 0.045, from: 0.45, gate: 0.5, attack: 0.002, release: 0.03 },
      { pattern: '12:1.5 r:2.5', root: 60, wave: 'flute', vel: 0.05, mod: [8, 7], from: 0.3, gate: 0.9, attack: 0.03, release: 0.1, cents: 6 },
      { pattern: '10:1.5 r:2.5', root: 60, wave: 'flute', vel: 0.05, mod: [8, 7], from: 0.3, gate: 0.9, attack: 0.03, release: 0.1, cents: -6 },
      { line: 'theme', shift: 12, wave: 'piccolo', standing: true, lp: 6000, vel: 0.03, from: 0.75, every: 4, gate: 0.85, attack: 0.01, release: 0.04 },
      { kit: 'cymbal', pattern: 'x:4', mod: [8, 0], vel: 0.6, from: 0.75 },
    ],
    heat: (st, secs, R) => or(R?.heatOf?.(st), secs, 90),
  },

  /**
   * Hold the Rails!: flat out in F sharp minor — a drum on every beat, a bass that never lets go, the brass
   * calling three notes at a time over it, a saw-toothed arpeggio that climbs and falls like the track, the snare
   * and the cymbals when the speed is at its height.
   */
  coaster: {
    bpm: 164, beats: 4, accel: 0.1, room: 0.16,
    chords: 'F#m F#m D E F#m F#m D C#7 A E Bm D Bm C#7 F#m C#7',
    theme: 'f#5:1.5 a5:1.5 c#6 | b5:1.5 a5:1.5 f#5 | d5:1.5 f#5:1.5 a5 | g#5:2 e5 b5 | '
      + 'f#5:1.5 a5:1.5 c#6 | e6:1.5 c#6:1.5 a5 | d6:1.5 a5:1.5 f#5 | f5:2 g#5 c#6 | '
      + 'e5:1.5 a5:1.5 c#6 | b5:1.5 g#5:1.5 e5 | d5:1.5 f#5:1.5 b5 | a5:2 f#5 d5 | '
      + 'b5:1.5 d6:1.5 f#6 | f5:1.5 g#5:1.5 c#6 | f#5:3 c#5 | f5:1.5 g#5:1.5 b5',
    parts: [
      { pattern: '1:.5 1:.5 8:.5 1:.5 1:.5 8:.5 1:.5 8:.5', root: 36, wave: 'pulse', standing: true, lp: 1900, vel: 0.14, gate: 0.55, attack: 0.004, release: 0.04 },
      { kit: 'kick', pattern: 'x x x x' },
      { pattern: '1:4', root: 36, wave: 'strings', vel: 0.055, gate: 0.94, attack: 0.09, release: 0.03, cents: -5 },
      { line: 'theme', shift: -12, wave: 'brass', vel: 0.12, from: 0.1, every: 4, gate: 0.9, attack: 0.02, sustain: 0.8, decay: 0.3, release: 0.03, cents: -6 },
      { kit: 'hat', pattern: 'r:.5 x:.5 r:.5 x:.5 r:.5 x:.5 r:.5 x:.5', from: 0.2 },
      { pattern: '1:.25 5:.25 8:.25 10:.25 12:.25 10:.25 8:.25 5:.25 1:.25 5:.25 8:.25 10:.25 12:.25 10:.25 8:.25 5:.25', root: 60, wave: 'sawtooth', standing: true, lp: 2400, vel: 0.03, from: 0.35, gate: 0.6, attack: 0.003, release: 0.025 },
      { kit: 'snare', pattern: 'r x r x', from: 0.45 },
      { pattern: 'c:4', root: 12, wave: 'chord', vel: 0.045, from: 0.55, gate: 0.9, attack: 0.12, release: 0.035 },
      { line: 'theme', wave: 'brass', standing: true, lp: 4200, vel: 0.06, from: 0.72, every: 4, gate: 0.9, attack: 0.025, release: 0.05 },
      { kit: 'cymbal', pattern: 'x:4', mod: [8, 0], from: 0.72 },
      { kit: 'snare', pattern: 'r:3 o:.5 x:.5', mod: [4, 3], vel: 0.9, from: 0.72 },
    ],
    heat: (st, secs, R) => or(R?.heatOf?.(st), secs, 120),
  },

  /**
   * The Sanctuary (a place, not a game: src/extras/sanctuary.js plays it for who walks in): a chant for men's
   * voices under the rock, in the first mode on G, slow, with no beat to count — each phrase dies away in the hall
   * before the next begins, and the silences are part of it. Three choirs, each of three throats a shade apart
   * singing vowels (formants), who breathe before they sing: the tenors have the chant; the baritones answer them
   * across the hall, then sing with them in sixths and fifths at the cadences; the basses hold the tonic under them
   * (an ison) and once have a phrase of their own, low, after a far bell has struck once. Under it all, a note one
   * feels more than hears. From the door one hears the tenors, far, mostly the tail of the hall; walking in, the
   * others join, and under the dome it is all there, near. Nothing here is borrowed: written for this hall.
   */
  sanctuary: {
    bpm: 54, beats: 8,
    hall: { seconds: 5.5, wet: 0.7, dry: (st) => 0.22 + 0.68 * sat((st?.inside ?? 0) * 1.3) },
    chords: 'Gm Gm Gm Gm Gm Gm Gm Gm Gm Gm Gm Gm Gm Gm Gm Gm',
    // (the tenors: the chant; they rest while they are answered)
    theme: 'r:2 g3:2 a3 bb3 c4:2 | d4:4 c4 bb3 a3:2 | r:8 | r:8 | r:2 d4:2 e4 f4 g4:2 | f4:2 e4 d4 d4:4 | c4:2 d4:2 bb3:2 a3:2 | g3:5 r:3 | '
      + 'r:8 | r:8 | r:2 a3:2 c4:2 d4:2 | f4:3 e4 d4:2 c4:2 | d4:5 r:3 | r:2 bb3:2 c4 bb3 a3:2 | g3:2 a3:2 bb3:2 a3:2 | g3:5 r:3',
    parts: [
      { line: 'theme', wave: 'reed', standing: true, choir: 3, spread: 9, vibrato: 10, vowels: 'aoeaouaeo', breath: 0.05, lp: 420, glide: 0.07, vel: 0.42, every: 2, gate: 0.97, attack: 0.18, release: 0.45 },
      // (the baritones: the answer, then the cadences with the tenors)
      { line: 'r:8 | r:8 | r:2 d3:2 f3 e3 d3:2 | c3:2 bb2:2 a2:2 g2:2 | r:8 | r:8 | f3:2 f3:2 d3:2 d3:2 | d3:5 r:3 | '
          + 'r:8 | r:8 | r:8 | a3:3 g3 f3:2 e3:2 | f3:5 r:3 | r:2 g3:2 a3 g3 f3:2 | d3:2 c3:2 d3:2 f3:2 | d3:5 r:3',
        wave: 'reed', standing: true, choir: 3, spread: 8, vibrato: 9, vowels: 'oaeoua', breath: 0.045, lp: 380, glide: 0.08, vel: 0.32, from: 0.3, every: 2, gate: 0.97, attack: 0.2, release: 0.45, cents: -4 },
      // (the basses: the ison under the tenors, and their own low phrase after the bell)
      { line: 'r:8 | r:8 | r:8 | r:8 | g2:8 | g2:8 | f2:4 d2:4 | g2:5 r:3 | r:2 d2:2 f2 g2 a2:2 | bb2:2 a2 g2 f2:2 g2:2 | g2:8 | d2:8 | d2:5 r:3 | r:8 | g2:2 f2:2 d2:2 d2:2 | g2:5 r:3',
        wave: 'reed', standing: true, choir: 3, spread: 7, vibrato: 7, vowels: 'ouoaou', breath: 0.04, lp: 300, glide: 0.1, vel: 0.38, from: 0.45, every: 2, gate: 0.98, attack: 0.25, release: 0.5, cents: 3 },
      // (the note one feels: the tonic two octaves down, where the basses hold theirs)
      { line: 'r:8 | r:8 | r:8 | r:8 | g1:8 | g1:8 | g1:8 | g1:5 r:3 | r:8 | r:8 | g1:8 | d2:8 | d2:5 r:3 | r:8 | g1:8 | g1:5 r:3',
        wave: 'bourdon', standing: true, lp: 170, glide: 0.3, vel: 0.17, from: 0.55, every: 2, gate: 0.98, attack: 1.2, release: 0.8 },
      // (a low bell, far off, once a turn: as the first cadence dies)
      { line: 'r:64 g2:8 r:56', wave: 'chime', vel: 0.12, from: 0.35, gate: 0.99, attack: 0.004, sustain: 0, decay: 2.2, release: 2 },
    ],
    heat: (st) => sat(st?.inside ?? 0),
    level: (st) => sat(0.32 + 0.68 * sat((st?.inside ?? 0) * 1.5)),
  },

  /**
   * The Velvet Gasket (a place, not a game: src/extras/bar.js plays it for who is inside its cave): a slow, sly
   * cabaret number in D minor, swung — brushes on the snare, the hat closing on two and four, a bass that walks,
   * a piano that answers off the beat; and, once the curtain is up, a muted horn that takes its time. Nothing here
   * is borrowed: the tune was written for this room. Its heat is the show (the band alone between two numbers,
   * the horn during one, a cymbal on every fourth bar once the last piece is off); how loud it is, how far inside
   * one stands — a murmur behind the door.
   */
  bar: {
    bpm: 104, beats: 4, swing: 0.66, room: 0.22,
    chords: 'Dm Dm Gm Dm Bb A7 Dm A7 Dm Dm Gm Dm Gm A7 Dm Dm',
    theme: 'r a4:.5 d5:.5 f5:2 | e5:.5 f5:.5 d5 r:2 | r g4:.5 bb4:.5 d5:1.5 c5:.5 | a4:3 r | '
      + 'r bb4:.5 d5:.5 f5 g5 | e5:1.5 c#5:.5 a4:2 | r:.5 d5:.5 f5:.5 d5:.5 a4:2 | g#4:.5 a4:.5 c#5 e5 r | '
      + 'r a4:.5 d5:.5 f5 a5 | ab5:.5 g5:.5 f5 d5 r | r g4:.5 bb4:.5 d5 g5 | f5:1.5 d5:.5 a4:2 | '
      + 'bb4 d5:.5 c5:.5 bb4 g4 | a4 c#5:.5 e5:.5 g5:1.5 f5:.5 | e5:.5 d5:2.5 r | r a4:.5 c5:.5 d5:2',
    parts: [
      {
        line: 'd2 f2 a2 c3 | d3 c3 a2 f2 | g2 bb2 d3 c3 | a2 f2 d2 e2 | bb2 d3 f2 g2 | a2 c#3 e3 g2 | d2 f2 a2 d3 | a2 g2 e2 c#2 | '
          + 'd2 f2 a2 c3 | d3 a2 f2 d2 | g2 bb2 d3 f3 | d3 c3 a2 f2 | g2 a2 bb2 b2 | c#3 a2 g2 e2 | d2 f2 a2 d3 | c3 a2 f2 e2',
        wave: 'pianoLow', vel: 0.17, gate: 0.82, attack: 0.006, sustain: 0.45, decay: 0.22, release: 0.07,
      },
      { kit: 'snare', pattern: 'o o:.5 o:.5 o o:.5 o:.5', vel: 0.55 },
      { kit: 'hat', pattern: 'r x r x', vel: 0.7 },
      { pattern: 'r:1.5 c:.5 r:1.5 c:.5', root: 12, wave: 'chord', vel: 0.05, gate: 0.6, attack: 0.008, release: 0.09 },
      { line: 'theme', wave: 'brass', standing: true, lp: 950, glide: 0.035, vel: 0.1, from: 0.5, every: 8, gate: 0.92, attack: 0.035, release: 0.1, cents: -5 },
      { kit: 'cymbal', pattern: 'x:4', mod: [4, 0], vel: 0.6, from: 0.9 },
    ],
    heat: (st) => sat(st?.heat ?? 0.3),
    level: (st) => sat(0.8 * (st?.inside ?? 0)),
  },
};

// ---------------------------------------------------------------------------------------------- the score

/** The first three formants of the vowels a man sings (Hz): a choir's line goes through those of its vowel. */
const VOWELS = { a: [700, 1150, 2500], o: [460, 820, 2450], u: [330, 700, 2400], e: [520, 1650, 2450], i: [300, 2100, 2900] };
/** A room in numbers: two channels of noise that die away in `seconds` (60 dB), darker as they die. Made once a context. */
const halls = new WeakMap();
function hallOf(ctx, seconds) {
  let byLength = halls.get(ctx);
  if (!byLength) halls.set(ctx, (byLength = new Map()));
  if (byLength.has(seconds)) return byLength.get(seconds);
  const rate = ctx.sampleRate, n = Math.ceil(seconds * rate), buf = ctx.createBuffer(2, n, rate), pre = Math.floor(0.022 * rate);
  let seed = 977;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let y = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / rate, k = 0.75 * Math.exp(-t / (seconds * 0.22)) + 0.06; // (the stone gives back less and less of the high)
      y += k * (rnd() - y);
      d[i] = y * Math.exp((-6.9 * t) / seconds) * Math.min(1, t / 0.06 + 0.25);
    }
    for (const [ms, v] of [[11, 0.5], [19, 0.36], [31, 0.3], [47, 0.22], [71, 0.16]]) d[Math.floor(((ms + c * 3) * rate) / 1000)] += v * (c ? -1 : 1); // (the first walls)
  }
  byLength.set(seconds, buf);
  return buf;
}

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
  let dry = null, breath = null, sung = null, rest = []; // (a tune sung in a hall: what is heard straight, the breath, the vowel of each note, where each line last stopped)

  /**
   * What a tune written as an orchestra needs besides notes: a little of the room behind the game's music, its
   * drums (one low oscillator and one loop of noise through three filters: nothing is made per hit, but a cymbal),
   * and an oscillator for each of its standing lines. Made with the bus; where the sound engine cannot make them
   * (a build without sound, the checks), the tune plays without.
   */
  const build = (a) => {
    const ctx = a.ctx, m = a.music;
    kit = null; lines = []; nodes = []; dry = null; breath = null; rest = [];
    const gain = (v, to) => { const g = ctx.createGain(); g.gain.value = v; g.connect(to); nodes.push(g); return g; };
    if (tune.hall) {
      // (its own room: straight to the music, and into the tail)
      try {
        dry = gain(1, a.musicBus); bus.connect(dry);
        const cv = ctx.createConvolver();
        cv.buffer = hallOf(ctx, tune.hall.seconds); cv.connect(a.musicBus); nodes.push(cv);
        bus.connect(gain(tune.hall.wet ?? 0.5, cv));
      } catch { if (!dry) bus.connect(a.musicBus); }
    }
    try { if (tune.room && m.send) bus.connect(gain(tune.room, m.send)); } catch { /* no room: dry */ }
    if (sc.parts.some((p) => p.breath)) {
      // (one loop of noise, through the shape of a breath, struck before a phrase)
      try { const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(); src.buffer = m.bank.get('white'); src.loop = true; f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 0.7; breath = gain(0, bus); src.connect(f); f.connect(breath); src.start(); nodes.push(src, f); } catch { breath = null; }
    }
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
      if (p.choir) { try { lines[i] = choir(ctx, m, p, gain); } catch { lines[i] = null; } return; }
      try {
        const o = ctx.createOscillator(), g = ctx.createGain();
        if (WAVES[p.wave]) m.shapes.dress(o, p.wave); else o.type = p.wave;
        g.gain.value = 0;
        let out = bus;
        if (p.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = p.lp; f.Q.value = 0.8; f.connect(bus); nodes.push(f); out = f; }
        if (p.cents && o.detune) o.detune.value = p.cents; // (a shade out of tune with the others: many players, not one)
        o.connect(g); g.connect(out); o.start();
        nodes.push(o, g);
        lines[i] = { o, g };
      } catch { lines[i] = null; }
    });
  };
  /**
   * A line sung by a choir: `p.choir` throats a shade apart, one vibrato for them all, through a body (what is low
   * in a voice) and three formants (its vowel) into one envelope. Answers as a standing player does, and more.
   */
  const choir = (ctx, m, p, gain) => {
    const g = gain(0, bus), mix = ctx.createGain(), n = p.choir, os = [], forms = [];
    mix.gain.value = 1 / n; nodes.push(mix);
    const filter = (type, hz, q, level) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = hz; f.Q.value = q; mix.connect(f); f.connect(gain(level, g)); nodes.push(f); return f; };
    filter('lowpass', p.lp || 380, 0.5, 0.55);
    const v0 = VOWELS[(p.vowels || 'a')[0]] || VOWELS.a;
    for (let k = 0; k < 3; k++) forms.push(filter('bandpass', v0[k], [5, 8, 11][k], [2.2, 1.5, 0.8][k]));
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    depth.gain.value = p.vibrato ?? 9; lfo.frequency.value = 4.7 + 0.4 * (Math.abs(p.cents || 0) % 3); lfo.connect(depth); lfo.start(); nodes.push(lfo, depth);
    for (let k = 0; k < n; k++) {
      const o = ctx.createOscillator();
      if (WAVES[p.wave]) m.shapes.dress(o, p.wave); else o.type = p.wave;
      o.detune.value = (p.cents || 0) + (k - (n - 1) / 2) * (p.spread ?? 8);
      depth.connect(o.detune); o.connect(mix); o.start();
      nodes.push(o); os.push(o);
    }
    const frequency = { setTargetAtTime: (v, t, c) => os.forEach((o) => o.frequency.setTargetAtTime(v, t, c)), setValueAtTime: (v, t) => os.forEach((o) => o.frequency.setValueAtTime(v, t)) };
    return { o: { frequency }, g, forms };
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
      setTimeout(() => { try { g.disconnect(); } catch { /* already gone */ } for (const n of made) { try { n.stop?.(); } catch { /* not started, or stopped */ } try { n.disconnect(); } catch { /* gone */ } } }, tune?.hall ? 600 + tune.hall.seconds * 1000 : 600); // (the tail of a hall rings out first)
      bus = null; kit = null; lines = []; nodes = []; dry = null; breath = null;
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
          if (l?.forms) {
            // (a choir: the vowel of this note; a breath first, where the line comes back after a rest)
            const v = VOWELS[sung?.get(e)] || VOWELS.a;
            l.forms.forEach((f, k) => f.frequency.setTargetAtTime(v[k], when - 0.05, 0.07));
            if (breath && p.breath && !(rest[e.part] > at - 1.5)) { breath.gain.setTargetAtTime(p.breath * (0.7 + 0.3 * heat), when - 0.42, 0.07); breath.gain.setTargetAtTime(0, when - 0.12, 0.09); }
            rest[e.part] = at + e.len;
          }
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
      // (the vowels of the choirs: one a note, in turn, as each line is written)
      sung = null;
      if (sc.parts.some((p) => p.choir)) { sung = new Map(); const count = []; for (const e of sc.events) { const p = sc.parts[e.part]; if (!p.choir) continue; const vs = (p.vowels || 'a').replace(/\s/g, ''), k = (count[e.part] = (count[e.part] ?? -1) + 1); sung.set(e, vs[k % vs.length]); } }
      began = typeof performance !== 'undefined' ? performance.now() : Date.now();
      try { const a = sound(); if (a?.music.shapes?.warm) a.music.shapes.warm([...new Set(sc.events.map((e) => e.wave))].filter((w) => WAVES[w])); } catch { /* no matter */ }
    },
    tick() {
      if (!tune) return;
      try {
        const a = sound();
        if (!a) return;
        if (!(a.levels.music > 0) || a.muted || (!a.offline && a.ctx.state && a.ctx.state !== 'running')) { if (ducking || bus) release(); t = null; return; }
        if (!bus) { bus = a.ctx.createGain(); bus.gain.value = 1; if (!tune.hall) bus.connect(a.musicBus); build(a); }
        const now = a.ctx.currentTime;
        duck(a, now);
        const secs = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - began) / 1000;
        let heat = 0;
        try { heat = sat(tune.heat ? tune.heat(run?.state, secs, rules) : 0); } catch { heat = sat(secs / 120); }
        // (a tune may say how loud it is, from the same state: the music of a place, nearer or further)
        if (tune.level) { try { bus.gain.setTargetAtTime(sat(tune.level(run?.state, secs, rules)), now, 0.35); } catch { /* as it was */ } }
        if (dry && tune.hall?.dry) { try { dry.gain.setTargetAtTime(sat(tune.hall.dry(run?.state)), now, 0.5); } catch { /* as it was */ } }
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
