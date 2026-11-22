// Emblems for the villages that have one (see layout/sponsors.js: `emblem`): each is a list of filled shapes,
// as SVG path data, drawn in a square that runs from -100 to 100. The fill 'brand' is the colour of the village.
export const EMBLEMS = {
  // an orca leaping out of a speech bubble
  orca: [
    { fill: 'brand', d: 'M0 -90 C54 -90 96 -54 96 -8 C96 38 54 72 0 72 C-12 72 -24 70 -35 67 L-80 98 L-66 50 C-86 36 -96 16 -96 -8 C-96 -54 -54 -90 0 -90 Z' },
    { fill: '#0b1320', d: 'M-62 22 C-50 -30 2 -60 44 -42 C66 -32 78 -14 72 2 C54 22 8 32 -28 28 C-42 28 -54 26 -62 22 Z' },
    { fill: '#0b1320', d: 'M-56 24 C-72 8 -86 4 -96 10 C-88 16 -84 22 -82 28 C-88 38 -86 50 -78 58 C-74 42 -66 32 -52 28 Z' },
    { fill: '#0b1320', d: 'M-16 -44 C-12 -64 -4 -78 10 -86 C8 -70 12 -58 22 -50 Z' },
    { fill: '#0b1320', d: 'M24 20 C18 38 4 50 -10 52 C-4 42 0 30 2 22 Z' },
    { fill: '#ffffff', d: 'M70 0 C52 18 10 28 -24 26 C0 16 30 8 52 -6 C60 -6 66 -4 70 0 Z' },
    { fill: '#ffffff', d: 'M27 -29 C33 -37 47 -39 53 -33 C49 -25 35 -21 27 -29 Z' },
  ],
};

/** Draws the emblem `name` on a canvas, in a square of `size` px centred on (cx, cy). */
export function drawEmblem(ctx, name, cx, cy, size, brand = '#1565d8') {
  const shapes = EMBLEMS[name];
  if (!shapes) return false;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 200, size / 200);
  for (const s of shapes) { ctx.fillStyle = s.fill === 'brand' ? brand : s.fill; ctx.fill(new Path2D(s.d)); }
  ctx.restore();
  return true;
}
