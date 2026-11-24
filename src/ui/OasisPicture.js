// The picture of "A room of your own" in the item shop: an oasis at dusk — a pool, two palms, a garland of
// the fair between them — and the visitor's own robot standing on its bank. Drawn here, with nothing fetched;
// the robot is the photograph the shop takes of it (ui/Preview.js), in the colours it has right now.

const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** How much larger than the picture the robot is asked for (it stands big, its feet on the bank). */
export const OASIS_ROBOT = 1.15;

/**
 * The picture, `w` by `h` pixels. `robot`: a canvas of the robot, transparent round it, `OASIS_ROBOT` times the
 * size of the picture (or null: the oasis alone).
 */
export function oasisPicture(w, h, robot = null) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'), rnd = rng(59);
  // the evening sky, a few stars, the sun going down behind the dunes
  const sky = g.createLinearGradient(0, 0, 0, h * 0.6);
  sky.addColorStop(0, '#241a66'); sky.addColorStop(0.42, '#7d3a92'); sky.addColorStop(0.78, '#ff8559'); sky.addColorStop(1, '#ffd27a');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 28; i++) { const y = rnd() * h * 0.3; g.fillStyle = `rgba(255, 255, 255, ${0.35 + rnd() * 0.55 - y / h})`; g.beginPath(); g.arc(rnd() * w, y, w * (0.003 + rnd() * 0.004), 0, 7); g.fill(); }
  const sx = w * 0.7, sy = h * 0.5, glow = g.createRadialGradient(sx, sy, 0, sx, sy, w * 0.42);
  glow.addColorStop(0, 'rgba(255, 244, 176, 0.9)'); glow.addColorStop(0.3, 'rgba(255, 196, 110, 0.4)'); glow.addColorStop(1, 'rgba(255, 170, 90, 0)');
  g.fillStyle = glow; g.fillRect(0, 0, w, h * 0.7);
  g.fillStyle = '#fff3b4'; g.beginPath(); g.arc(sx, sy, w * 0.105, 0, 7); g.fill();
  // the dunes, far then near
  const dune = (y0, y1, y2, style) => { g.fillStyle = style; g.beginPath(); g.moveTo(0, h * y0); g.bezierCurveTo(w * 0.3, h * y1, w * 0.62, h * y2, w, h * y0 * 0.985); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill(); };
  dune(0.555, 0.47, 0.6, '#b9603c');
  dune(0.6, 0.66, 0.535, '#d98a4c');
  const sand = g.createLinearGradient(0, h * 0.62, 0, h);
  sand.addColorStop(0, '#f1c17a'); sand.addColorStop(1, '#c98a4a');
  dune(0.64, 0.6, 0.67, sand);
  // the pool: the sky in it, and the last of the sun
  const px = w * 0.5, py = h * 0.675, rx = w * 0.43, ry = h * 0.062;
  g.fillStyle = 'rgba(120, 70, 30, 0.35)'; g.beginPath(); g.ellipse(px, py + h * 0.006, rx * 1.04, ry * 1.16, 0, 0, 7); g.fill();
  const water = g.createLinearGradient(0, py - ry, 0, py + ry);
  water.addColorStop(0, '#ffb07a'); water.addColorStop(0.35, '#58d6cc'); water.addColorStop(1, '#17879c');
  g.fillStyle = water; g.beginPath(); g.ellipse(px, py, rx, ry, 0, 0, 7); g.fill();
  g.save(); g.beginPath(); g.ellipse(px, py, rx, ry, 0, 0, 7); g.clip();
  g.fillStyle = 'rgba(255, 244, 190, 0.75)';
  for (let k = 0; k < 6; k++) { const yy = py - ry * 0.55 + k * ry * 0.27, half = w * (0.07 - k * 0.008) * (0.7 + rnd() * 0.6); g.fillRect(sx - half - w * 0.04 + rnd() * w * 0.02, yy, half * 2, Math.max(1, h * 0.004)); }
  g.restore();
  // two palms against the light, a garland of the fair between their heads
  const INKY = '#16302a';
  const palm = (bx, by, tx, ty, s) => {
    g.strokeStyle = '#3a2416'; g.lineCap = 'round'; g.lineWidth = s * 0.05;
    g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + (tx - bx) * 0.05, (by + ty) / 2, tx, ty); g.stroke();
    for (const [a, len, k] of [[-2.95, 1, 0], [-2.4, 0.92, 1], [-1.85, 0.8, 0], [-1.3, 0.84, 1], [-0.75, 0.94, 0], [-0.2, 1, 1], [0.3, 0.78, 0], [3.5, 0.8, 1]]) {
      const L = s * 0.34 * len, ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L + s * 0.13 * len; // (each frond droops at its end)
      g.fillStyle = k ? INKY : '#1f4a3a';
      g.beginPath(); g.moveTo(tx, ty);
      g.quadraticCurveTo(tx + Math.cos(a) * L * 0.62, ty + Math.sin(a) * L * 0.62 - s * 0.075, ex, ey);
      g.quadraticCurveTo(tx + Math.cos(a) * L * 0.5, ty + Math.sin(a) * L * 0.5 + s * 0.03, tx, ty);
      g.fill();
    }
    g.fillStyle = '#2a1a10'; for (const d of [-1, 1]) { g.beginPath(); g.arc(tx + d * s * 0.022, ty + s * 0.028, s * 0.02, 0, 7); g.fill(); }
  };
  const A = [w * 0.17, h * 0.2], B = [w * 0.86, h * 0.29];
  palm(w * 0.1, h * 0.71, A[0], A[1], w);
  palm(w * 0.93, h * 0.67, B[0], B[1], w * 0.8);
  g.strokeStyle = 'rgba(30, 20, 30, 0.75)'; g.lineWidth = Math.max(1, w * 0.005);
  const sag = h * 0.12, at = (t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t + sag * 4 * t * (1 - t)];
  g.beginPath(); for (let i = 0; i <= 24; i++) { const [x, y] = at(i / 24); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
  const BULBS = ['#ff5a4f', '#ffe14d', '#3fe0c5', '#ff8ad8', '#ffffff'];
  for (let i = 1; i < 10; i++) {
    const [x, y] = at(i / 10), col = BULBS[i % BULBS.length], r = w * 0.013;
    const halo = g.createRadialGradient(x, y + r, 0, x, y + r, r * 4.5);
    halo.addColorStop(0, `${col}aa`); halo.addColorStop(1, `${col}00`);
    g.fillStyle = halo; g.beginPath(); g.arc(x, y + r, r * 4.5, 0, 7); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(x, y + r, r, 0, 7); g.fill();
  }
  // its owner on the bank, a shadow at their feet (the sun is behind them)
  const fy = h * 0.745;
  g.fillStyle = 'rgba(70, 36, 20, 0.38)'; g.beginPath(); g.ellipse(w * 0.47, fy + h * 0.012, w * 0.2, h * 0.02, 0, 0, 7); g.fill();
  if (robot) {
    // (in the photograph the robot's feet are a little above three quarters of the way down: they go on the bank)
    const rw = w * OASIS_ROBOT, rh = h * OASIS_ROBOT;
    g.drawImage(robot, (w - rw) / 2, fy - rh * 0.767, rw, rh);
  }
  return c;
}
