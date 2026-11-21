// The music, written down. Every tune here was composed for this game: none is borrowed.
// Notes are text (see `melody` in synth.js): 'g5:2' is a G of the fifth octave held two beats, 'r' a rest,
// '|' a bar line (for the eye only). Chords are one name per bar.

/**
 * The waltz of the fairground organ (3/4, one bar a second). Three strains of two eight-bar phrases each:
 * the turning tune in G, a livelier one in E minor, and a singing trio in C whose last bar leads back to G.
 */
export const WALTZ = {
  bpm: 174,
  intro: 'G',
  phrases: {
    A1: ['G G Am D7 G Em A7 D7', 'd5 b4 d5 | g5:2 f#5 | e5 c5 e5 | a5:2 g5 | b5 a5 g5 | e5:2 g5 | c#5 e5 g5 | f#5:2 a4'],
    A2: ['G G Am D7 G C D7 G', 'd5 b4 d5 | g5:2 f#5 | e5 c5 e5 | a5:2 c6 | d6:2 b5 | c6 g5 e5 | d5 f#5 a5 | g5:2 r'],
    B1: ['Em Em B7 B7 Em Am D7 G', 'e5:.5 f#5:.5 g5 b5 | b5:.5 a5:.5 g5 e5 | d#5:.5 e5:.5 f#5 a5 | a5:.5 g5:.5 f#5 d#5 | e5:.5 f#5:.5 g5 b5 | c6:2 a5 | f#5:.5 g5:.5 a5 c6 | b5:2 r'],
    B2: ['Em Em B7 B7 C G D7 G', 'e5:.5 f#5:.5 g5 b5 | b5:.5 a5:.5 g5 e5 | d#5:.5 e5:.5 f#5 a5 | a5:.5 g5:.5 f#5 d#5 | e5:.5 f#5:.5 g5 c6 | d6:2 b5 | c6:.5 b5:.5 a5 f#5 | g5:2 r'],
    C1: ['C C G7 G7 G7 G7 C C', 'g5:2 e5 | c6:3 | b5:2 g5 | d6:3 | f6 d6 b5 | a5:2 g5 | e5 g5 c6 | e6:2 r'],
    C2: ['C C7 F Fm C G7 C D7', 'g5:2 e5 | bb5:3 | a5:2 f5 | ab5:3 | g5 e5 g5 | b5 d6 f6 | e6:3 | d6:2 a5'],
  },
  form: ['A1', 'A2', 'B1', 'B2', 'A1', 'A2', 'C1', 'C2'],
};

/**
 * The music of the climb (4/4, D minor): sixteen bars of chords — the low strings and the pulse play them
 * from the first stone on — and the theme the brass brings in half-way up. Its notes fall on the same
 * three-three-two accents as the pulse; the last two bars, in A major, pull back to the beginning.
 */
export const CLIMB = {
  bpm: 132,
  chords: 'Dm Bb F C Dm Bb C Dm Bb C Dm Dm Bb C A A',
  theme: 'd5:1.5 f5:1.5 e5 | d5:1.5 bb4:1.5 d5 | c5:1.5 f5:1.5 a5 | g5:3 e5 | f5:1.5 a5:1.5 g5 | f5:1.5 d5:1.5 f5 | e5:1.5 g5:1.5 e5 | d5:4 | '
    + 'd5:1.5 f5:1.5 bb5 | a5:1.5 g5:1.5 e5 | f5:1.5 a5:1.5 d6 | d6:3 a5 | bb5:1.5 a5:1.5 f5 | e5:1.5 g5:1.5 c6 | c#6:1.5 b5:1.5 a5 | a5:1.5 e5:1.5 c#5',
};

/**
 * The quiet music has no score: a felt piano picks a few notes of a five-note scale (D E F# A B) over a soft
 * chord, waits, picks again. Here are the scale (MIDI numbers, low to high) and the chords it wanders
 * through: the wave that sings the chord (see WAVES), its root, a low piano note, and the notes a phrase may
 * come to rest on (pitch classes, C = 0).
 */
export const CALM = {
  ladder: [57, 59, 62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86],
  fields: [
    { wave: 'padAdd9', root: 55, bass: 43, rest: [2, 11, 9] }, // G: the brightest
    { wave: 'padAdd9', root: 50, bass: 38, rest: [2, 6, 9, 4] }, // D: home
    { wave: 'padMinor', root: 47, bass: 47, rest: [11, 2, 6] }, // B minor: a shadow
    { wave: 'padSus', root: 45, bass: 45, rest: [9, 4, 11] }, // A, left open
    { wave: 'padSus', root: 52, bass: 40, rest: [4, 11, 6] }, // E, left open
  ],
};

/**
 * The run is won: a short fanfare in D major (the climb was in D minor). [note, beat it starts on, length in
 * beats] at 132 beats a minute; the last note is held over a full chord.
 */
export const FANFARE = {
  beat: 60 / 132,
  tune: [['d5', 0, 0.7], ['d5', 0.75, 0.25], ['f#5', 1, 0.9], ['e5', 2, 0.45], ['f#5', 2.5, 0.45], ['g5', 3, 0.45], ['a5', 3.5, 0.45], ['d6', 4, 3]],
  chord: [['d4', 4, 3], ['f#4', 4, 3], ['a4', 4, 3], ['d3', 4, 3]],
  drums: [0, 2, 4],
};
/** The run is lost: the D minor chord falls apart, and the last note sags. */
export const LAMENT = { beat: 60 / 132, tune: [['a4', 0, 0.45], ['f4', 0.5, 0.45], ['d4', 1, 0.7], ['bb3', 1.75, 1.6]] };
