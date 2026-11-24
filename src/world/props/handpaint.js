// Letters painted by hand with a brush, for the wooden signs of the fair. No font file and no font of the
// device: each letter is a few strokes on a grid, drawn with a round brush and never twice quite the same —
// a wobble, a tilt, a hand that presses more or less — but the same on every screen (the wobble is drawn
// from the words themselves). Capitals, figures and a little punctuation; small letters are written as
// capitals, as sign painters do.
//
//   paintWords(ctx, 'QUADMANIA', x, y, size, { color, align })   (x, y): where the line starts, on its baseline
//   wordsWidth('QUADMANIA', size)                                how wide it will be

/** Points along an ellipse, from angle a0 to a1 (degrees, anticlockwise from the right; y goes up). */
const arc = (cx, cy, rx, ry, a0, a1, n = Math.max(3, Math.ceil(Math.abs(a1 - a0) / 30))) => Array.from({ length: n + 1 }, (_, i) => { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
const dot = (x, y) => [[x, y], [x + 0.001, y]];

// Each letter: [its width, ...its strokes]; a stroke is a line through points on a grid one high (0: the line
// the letters stand on, 1: their top).
const G = {
  A: [0.64, [[0, 0], [0.32, 1], [0.64, 0]], [[0.13, 0.36], [0.51, 0.36]]],
  B: [0.58, [[0, 0], [0, 1]], [[0, 1], [0.3, 1], ...arc(0.3, 0.76, 0.22, 0.24, 90, -90), [0, 0.52]], [[0.3, 0.52], ...arc(0.32, 0.26, 0.26, 0.26, 90, -90), [0, 0]]],
  C: [0.62, arc(0.34, 0.5, 0.34, 0.5, 52, 308)],
  D: [0.62, [[0, 0], [0, 1]], [[0, 1], [0.2, 1], ...arc(0.22, 0.5, 0.38, 0.5, 90, -90), [0, 0]]],
  E: [0.54, [[0.54, 1], [0, 1], [0, 0], [0.54, 0]], [[0, 0.52], [0.42, 0.52]]],
  F: [0.52, [[0.52, 1], [0, 1], [0, 0]], [[0, 0.52], [0.4, 0.52]]],
  G: [0.66, [...arc(0.34, 0.5, 0.34, 0.5, 52, 322), [0.64, 0.44], [0.38, 0.44]]],
  H: [0.6, [[0, 0], [0, 1]], [[0.6, 0], [0.6, 1]], [[0, 0.52], [0.6, 0.52]]],
  I: [0.12, [[0.06, 0], [0.06, 1]]],
  J: [0.5, [[0.5, 1], [0.5, 0.28], ...arc(0.26, 0.28, 0.24, 0.28, 0, -180)]],
  K: [0.58, [[0, 0], [0, 1]], [[0.56, 1], [0, 0.42]], [[0.2, 0.6], [0.58, 0]]],
  L: [0.5, [[0, 1], [0, 0], [0.5, 0]]],
  M: [0.84, [[0, 0], [0, 1], [0.42, 0.3], [0.84, 1], [0.84, 0]]],
  N: [0.62, [[0, 0], [0, 1], [0.62, 0], [0.62, 1]]],
  O: [0.72, arc(0.36, 0.5, 0.36, 0.5, 80, 440)],
  P: [0.56, [[0, 0], [0, 1]], [[0, 1], [0.3, 1], ...arc(0.32, 0.73, 0.24, 0.27, 90, -90), [0, 0.46]]],
  Q: [0.72, arc(0.36, 0.5, 0.36, 0.5, 80, 440), [[0.44, 0.24], [0.74, -0.08]]],
  R: [0.6, [[0, 0], [0, 1]], [[0, 1], [0.3, 1], ...arc(0.32, 0.73, 0.24, 0.27, 90, -90), [0, 0.46]], [[0.26, 0.46], [0.6, 0]]],
  S: [0.58, [...arc(0.3, 0.75, 0.27, 0.25, 32, 270), ...arc(0.3, 0.25, 0.29, 0.25, 90, -150).slice(1)]],
  T: [0.62, [[0, 1], [0.62, 1]], [[0.31, 1], [0.31, 0]]],
  U: [0.6, [[0, 1], [0, 0.3], ...arc(0.3, 0.3, 0.3, 0.3, 180, 360), [0.6, 1]]],
  V: [0.62, [[0, 1], [0.31, 0], [0.62, 1]]],
  W: [0.88, [[0, 1], [0.2, 0], [0.44, 0.72], [0.68, 0], [0.88, 1]]],
  X: [0.6, [[0, 1], [0.6, 0]], [[0.6, 1], [0, 0]]],
  Y: [0.6, [[0, 1], [0.3, 0.5], [0.6, 1]], [[0.3, 0.5], [0.3, 0]]],
  Z: [0.6, [[0, 1], [0.6, 1], [0, 0], [0.6, 0]]],
  0: [0.56, arc(0.28, 0.5, 0.28, 0.5, 80, 440)],
  1: [0.34, [[0.02, 0.76], [0.26, 1], [0.26, 0]]],
  2: [0.56, [...arc(0.28, 0.72, 0.26, 0.28, 160, -40), [0.02, 0], [0.56, 0]]],
  3: [0.54, [...arc(0.26, 0.75, 0.25, 0.25, 150, -90), ...arc(0.26, 0.25, 0.28, 0.25, 90, -150).slice(1)]],
  4: [0.58, [[0.42, 0], [0.42, 1], [0, 0.32], [0.58, 0.32]]],
  5: [0.56, [[0.52, 1], [0.08, 1], [0.05, 0.56], ...arc(0.26, 0.3, 0.29, 0.3, 120, -150).slice(1)]],
  6: [0.56, [[0.5, 0.97], [0.3, 0.86], [0.1, 0.6], ...arc(0.28, 0.28, 0.27, 0.28, 180, 540)]],
  7: [0.56, [[0, 1], [0.56, 1], [0.2, 0]]],
  8: [0.56, arc(0.28, 0.76, 0.22, 0.24, -90, 270), arc(0.28, 0.27, 0.27, 0.27, 90, 450)],
  9: [0.56, [...arc(0.28, 0.7, 0.27, 0.29, 0, 360), [0.5, 0.36], [0.36, 0.1], [0.12, 0.0]]],
  '&': [0.64, [[0.6, 0], [0.14, 0.66], [0.12, 0.84], [0.26, 1], [0.4, 0.86], [0.36, 0.68], [0.04, 0.3], [0.06, 0.1], [0.22, 0], [0.4, 0.08], [0.62, 0.42]]],
  "'": [0.14, [[0.08, 1], [0.05, 0.74]]],
  '!': [0.16, [[0.08, 1], [0.08, 0.3]], dot(0.08, 0.02)],
  '?': [0.5, [...arc(0.24, 0.74, 0.23, 0.26, 170, -60), [0.24, 0.42], [0.24, 0.28]], dot(0.24, 0.02)],
  '.': [0.14, dot(0.07, 0.02)],
  ',': [0.16, [[0.1, 0.06], [0.04, -0.14]]],
  ':': [0.14, dot(0.07, 0.02), dot(0.07, 0.5)],
  '·': [0.26, dot(0.13, 0.46)],
  '-': [0.42, [[0.04, 0.42], [0.38, 0.42]]],
  '+': [0.5, [[0.04, 0.45], [0.46, 0.45]], [[0.25, 0.22], [0.25, 0.68]]],
  '/': [0.42, [[0, 0], [0.42, 1]]],
  // an arrow to the right, and one to the left (written > and <)
  '>': [0.9, [[0, 0.45], [0.86, 0.45]], [[0.56, 0.78], [0.88, 0.45], [0.56, 0.12]]],
  '<': [0.9, [[0.9, 0.45], [0.04, 0.45]], [[0.34, 0.78], [0.02, 0.45], [0.34, 0.12]]],
};
const SPACE = 0.36, GAP = 0.17; // (the width of a blank, and the room between two letters, in heights of a letter)

/** Numbers in [0, 1) drawn from a word: always the same for the same word. */
function randomOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let s = h >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const glyph = (ch) => G[ch] || G[ch.toUpperCase()] || null;

/** How wide `text` is when painted `size` pixels high. */
export function wordsWidth(text, size) {
  let w = 0;
  for (const ch of String(text)) { const g = glyph(ch); w += (g ? g[0] + GAP : SPACE) * size; }
  return Math.max(0, w - GAP * size);
}

/**
 * Paints `text` with a brush, its letters `size` pixels high, from (x, y) — the left end of the line the
 * letters stand on ('center' and 'right' put x in the middle, or at the end). `color`: the paint; `shade`: a
 * darker line under it, as paint has an edge; `weight`: how thick the brush is, in heights of a letter;
 * `wobble`: 0 for a steady hand, 1 for a normal one. Returns how wide the line came out.
 */
export function paintWords(ctx, text, x, y, size, { color = '#f6efdc', shade = 'rgba(30, 16, 6, 0.55)', weight = 0.14, wobble = 1, align = 'left', seed = '' } = {}) {
  text = String(text);
  const width = wordsWidth(text, size), rnd = randomOf(`${seed}|${text}`);
  let pen = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // (what each letter gets of its own: a tilt, a step up or down, a size, a brush more or less loaded)
  const letters = [];
  for (const ch of text) {
    const g = glyph(ch);
    if (!g) { pen += SPACE * size; continue; }
    const tilt = (rnd() - 0.5) * 0.11 * wobble, lift = (rnd() - 0.5) * 0.09 * size * wobble, grow = 1 + (rnd() - 0.5) * 0.1 * wobble, press = 1 + (rnd() - 0.5) * 0.28 * wobble;
    const strokes = g.slice(1).map((s) => s.map(([px, py]) => {
      // a point of the letter, nudged a little: no two strokes of a hand are straight
      const jx = (rnd() - 0.5) * 0.045 * wobble, jy = (rnd() - 0.5) * 0.045 * wobble;
      const lx = (px - g[0] / 2 + jx) * grow, ly = (py - 0.5 + jy) * grow;
      const c = Math.cos(tilt), sn = Math.sin(tilt);
      return [pen + (g[0] / 2 + lx * c + ly * sn + ly * 0.06) * size, y - lift - (0.5 - lx * sn + ly * c) * size];
    }));
    letters.push({ strokes, press });
    pen += (g[0] + GAP) * size;
  }
  const lay = (dx, dy, style, more) => {
    ctx.strokeStyle = style;
    for (const l of letters) {
      ctx.lineWidth = Math.max(1, size * weight * l.press + more);
      for (const s of l.strokes) {
        ctx.beginPath();
        ctx.moveTo(s[0][0] + dx, s[0][1] + dy);
        for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0] + dx, s[i][1] + dy);
        ctx.stroke();
      }
    }
  };
  if (shade) lay(size * 0.035, size * 0.05, shade, size * 0.02);
  lay(0, 0, color, 0);
  ctx.restore();
  return width;
}
