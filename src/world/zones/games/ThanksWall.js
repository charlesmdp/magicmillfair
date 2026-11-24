// The wall of thanks: in the cliff west of the meadow of the acid pond, a great tablet as if cut into the
// rock — THANKS TO THOSE COMPANIES, THE GAME IS FREE FOR YOU! — and under it everyone who sponsors the fair,
// the one who puts in the most first (who counts, and in which order: app/thanks.js).
//
// The tablet lies on the rock: it finds the lean of the cliff by itself and sits just proud of it, in a frame
// of rough blocks of the same stone as the boulders around. One sheet for all of it (a canvas, painted when
// the list changes and not otherwise) and one mesh; the frame goes with the rest of the rock of the fair.
//
//   wall.set(rows, info)   rows: what rankSponsors() gives, `logo` being a picture already loaded (or null);
//                          info: { open, from, gondola, backdrop } — the words of the invitation ("from $1"…)
//   wall.shown             what is on it right now: { title, cols, rows: [{ rank, name, figure, unit, where }], ghosts }
//
// Nothing a sponsor wrote is ever anything but text painted on that sheet; a logo is a picture served by the
// game (the same safe way as on the panels: net/Shop.js loadImage).
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';
import { THANKS_WALL } from '../../layout/layout.js';

const SERIF = "Georgia, 'Times New Roman', serif", SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const CW = 1536, CH = 608; // (the sheet: 93 pixels a metre)
export const THANKS_TITLE = ['THANKS TO THOSE COMPANIES,', 'THE GAME IS FREE FOR YOU!'];
/** How many sponsors fit, and how: up to `max` of them in `cols` columns of `rows`. */
const LAYOUTS = [{ max: 3, cols: 1, rows: 3 }, { max: 8, cols: 2, rows: 4 }, { max: 15, cols: 3, rows: 5 }, { max: 28, cols: 4, rows: 7 }];
const MEDALS = [['#f3cf63', '#8a5a00', 'rgba(236, 190, 70, 0.26)'], ['#e9edf2', '#5c6470', 'rgba(232, 236, 242, 0.24)'], ['#e0a473', '#7a3f14', 'rgba(214, 140, 86, 0.22)']]; // gold, silver, bronze: leaf, shade, wash
const INK = '#40372e', FAINT = '#5d5348', LIP = 'rgba(255, 248, 232, 0.6)', SHADE = 'rgba(26, 20, 14, 0.5)';

const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rounded = (ctx, x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
/** Sets the largest font up to `size` px in which `text` fits `max` px (never under `least`), and returns the text — cut short if it still does not fit. */
function fit(ctx, text, max, size, weight, family, least = 9) {
  let s = String(text ?? ''), px = size;
  for (; px > least; px -= 1) { ctx.font = `${weight} ${px}px ${family}`; if (ctx.measureText(s).width <= max) return s; }
  ctx.font = `${weight} ${px}px ${family}`;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}
/** Letters cut into the stone: the lower lip of the cut catches the light, its upper wall is in shade. */
function carve(ctx, text, x, y, fill = INK, deep = 2) {
  ctx.fillStyle = LIP; ctx.fillText(text, x + deep * 0.6, y + deep);
  ctx.fillStyle = SHADE; ctx.fillText(text, x - deep * 0.3, y - deep * 0.55);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
/** The same, with leaf in the cut (gold by default). */
function gild(ctx, text, x, y, size, [leaf, shade] = MEDALS[0], deep = 2) {
  ctx.fillStyle = LIP; ctx.fillText(text, x + deep * 0.6, y + deep);
  ctx.fillStyle = shade; ctx.fillText(text, x - deep * 0.35, y - deep * 0.6);
  const g = ctx.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  g.addColorStop(0, shade); g.addColorStop(0.3, leaf); g.addColorStop(0.62, '#fff3c4'); g.addColorStop(1, leaf);
  ctx.fillStyle = g; ctx.fillText(text, x, y);
}

/** The dressed face of the rock, without a word on it: painted once and kept. */
function stone(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'), rnd = rng(1124);
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#a39a8d'); base.addColorStop(0.5, '#978d80'); base.addColorStop(1, '#887e72');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  // the beds of the rock: long soft bands, a little out of level
  for (let i = 0; i < 48; i++) {
    const y = rnd() * h, t = 3 + rnd() * 17, lean = (rnd() - 0.5) * 28;
    g.fillStyle = rnd() < 0.55 ? `rgba(52, 44, 36, ${0.03 + rnd() * 0.06})` : `rgba(255, 246, 228, ${0.03 + rnd() * 0.05})`;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 96; x <= w; x += 96) g.lineTo(x, y + (x / w) * lean + Math.sin(x * 0.011 + i) * 3);
    for (let x = w; x >= 0; x -= 96) g.lineTo(x, y + t + (x / w) * lean + Math.sin(x * 0.013 + i * 2) * 3);
    g.closePath(); g.fill();
  }
  for (let i = 0; i < 520; i++) { // stains
    const r = 8 + rnd() * 46;
    g.fillStyle = rnd() < 0.5 ? `rgba(40, 34, 28, ${0.02 + rnd() * 0.035})` : `rgba(255, 250, 238, ${0.02 + rnd() * 0.03})`;
    g.beginPath(); g.ellipse(rnd() * w, rnd() * h, r * (1.2 + rnd()), r * 0.55, (rnd() - 0.5) * 0.5, 0, 6.3); g.fill();
  }
  for (let i = 0; i < 9000; i++) { // grain
    g.fillStyle = rnd() < 0.5 ? `rgba(30, 26, 22, ${0.05 + rnd() * 0.1})` : `rgba(255, 252, 244, ${0.05 + rnd() * 0.09})`;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.6, 1 + rnd() * 1.2);
  }
  for (let i = 0; i < 6; i++) { // a few cracks, from an edge inwards
    const down = rnd() < 0.5, pts = [[rnd() * w, down ? 0 : h]];
    for (let k = 0, n = 5 + Math.floor(rnd() * 7); k < n; k++) { const [x, y] = pts[pts.length - 1]; pts.push([x + (rnd() - 0.5) * 70, y + (down ? 1 : -1) * (12 + rnd() * 38)]); }
    for (const [dx, style, width] of [[1.3, 'rgba(255, 248, 232, 0.2)', 1.2], [0, 'rgba(38, 32, 26, 0.36)', 1.4]]) {
      g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x + dx, y + dx) : g.moveTo(x + dx, y + dx)));
      g.strokeStyle = style; g.lineWidth = width; g.stroke();
    }
  }
  // its edges: the face is cut into the rock — the upper and left walls of the cut in shade, the others lit
  const B = 15, side = (pts, style) => { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = style; g.fill(); };
  side([[0, 0], [w, 0], [w - B, B], [B, B]], 'rgba(20, 16, 12, 0.46)');
  side([[0, 0], [B, B], [B, h - B], [0, h]], 'rgba(20, 16, 12, 0.32)');
  side([[0, h], [B, h - B], [w - B, h - B], [w, h]], 'rgba(255, 248, 232, 0.34)');
  side([[w, 0], [w, h], [w - B, h - B], [w - B, B]], 'rgba(255, 248, 232, 0.2)');
  const under = g.createLinearGradient(0, B, 0, B + 46);
  under.addColorStop(0, 'rgba(20, 16, 12, 0.22)'); under.addColorStop(1, 'rgba(20, 16, 12, 0)');
  g.fillStyle = under; g.fillRect(B, B, w - 2 * B, 46);
  g.strokeStyle = 'rgba(30, 24, 18, 0.4)'; g.lineWidth = 1.5; g.strokeRect(B + 0.5, B + 0.5, w - 2 * B - 1, h - 2 * B - 1);
  return c;
}

/** The little plate of a sponsor, let into the stone: their picture, or the first letter of their name. */
function plate(ctx, x, y, s, logo, name, ghost) {
  const r = s * 0.2;
  ctx.fillStyle = SHADE; rounded(ctx, x - 1.5, y - 2, s, s, r); ctx.fill();
  ctx.fillStyle = LIP; rounded(ctx, x + 1.5, y + 2, s, s, r); ctx.fill();
  let drawn = false;
  if (logo && !ghost) {
    ctx.save();
    rounded(ctx, x, y, s, s, r); ctx.clip();
    ctx.fillStyle = '#f6f1e6'; ctx.fillRect(x, y, s, s);
    const iw = logo.width || 1, ih = logo.height || 1, k = Math.min((s * 0.84) / iw, (s * 0.84) / ih);
    try { ctx.drawImage(logo, x + (s - iw * k) / 2, y + (s - ih * k) / 2, iw * k, ih * k); drawn = true; } catch { /* a broken picture: their letter instead */ }
    ctx.restore();
  }
  if (drawn) return;
  ctx.fillStyle = ghost ? '#8b8175' : '#7b7166'; rounded(ctx, x, y, s, s, r); ctx.fill();
  ctx.textAlign = 'center';
  ctx.font = `700 ${Math.round(s * 0.56)}px ${SERIF}`;
  carve(ctx, ghost ? '+' : (String(name || '?').trim()[0] || '?').toUpperCase(), x + s / 2, y + s * 0.53, ghost ? FAINT : INK, 1.5);
}

/** One line of the list, in its cell. `r`: a sponsor ({ name, tagline, where, note, figure, unit, logo }); `ghost`: an invitation instead. */
function line(ctx, x, y, w, h, rank, r, ghost) {
  const pad = Math.max(6, h * 0.1), medal = !ghost && rank <= 3 ? MEDALS[rank - 1] : null, rich = h >= 60;
  if (medal) { ctx.fillStyle = medal[2]; rounded(ctx, x, y + 2, w, h - 4, h * 0.22); ctx.fill(); ctx.strokeStyle = 'rgba(40, 32, 24, 0.3)'; ctx.lineWidth = 1.2; ctx.stroke(); }
  else if (ghost) { ctx.setLineDash([h * 0.14, h * 0.1]); ctx.strokeStyle = 'rgba(40, 32, 24, 0.42)'; ctx.lineWidth = 1.6; rounded(ctx, x + 1, y + 3, w - 2, h - 6, h * 0.22); ctx.stroke(); ctx.setLineDash([]); }
  else { ctx.fillStyle = 'rgba(30, 24, 18, 0.3)'; ctx.fillRect(x + pad, y + h - 1.5, w - 2 * pad, 1.2); ctx.fillStyle = 'rgba(255, 248, 232, 0.4)'; ctx.fillRect(x + pad, y + h - 0.3, w - 2 * pad, 1); }
  ctx.textBaseline = 'middle';
  // its rank
  const rw = h * 0.74, mid = y + h / 2;
  ctx.textAlign = 'center';
  ctx.font = `800 ${Math.round(h * (rank > 9 ? 0.3 : 0.36))}px ${SERIF}`;
  if (medal) gild(ctx, `#${rank}`, x + pad + rw / 2, mid, h * 0.36, medal, 1.6); else carve(ctx, `#${rank}`, x + pad + rw / 2, mid, FAINT, 1.4);
  // its plate
  const s = h * 0.7, px = x + pad + rw + h * 0.04;
  plate(ctx, px, y + (h - s) / 2, s, r.logo, r.name, ghost);
  // what it pays, on the right
  let right = x + w - pad - 2;
  if (r.figure) {
    ctx.textAlign = 'right';
    const size = Math.round(h * (rich ? 0.36 : 0.4));
    ctx.font = `800 ${size}px ${SERIF}`;
    const fw = ctx.measureText(r.figure).width, fy = r.unit ? y + h * 0.38 : mid;
    if (ghost) carve(ctx, r.figure, right, fy, FAINT, 1.5); else gild(ctx, r.figure, right, fy, size, MEDALS[0], 1.6);
    let uw = 0;
    if (r.unit) { ctx.font = `700 ${Math.max(9, Math.round(h * 0.18))}px ${SANS}`; uw = ctx.measureText(r.unit).width; carve(ctx, r.unit, right, y + h * 0.72, FAINT, 1); }
    right -= Math.max(fw, uw) + h * 0.16;
  }
  // who it is
  const tx = px + s + h * 0.2, tw = Math.max(20, right - tx);
  ctx.textAlign = 'left';
  const small = [r.where, r.note].filter(Boolean).join(' · ');
  if (rich) {
    carve(ctx, fit(ctx, r.name, tw, Math.round(h * 0.31), 700, SERIF, 12), tx, y + h * (r.tagline ? 0.27 : 0.36), ghost ? FAINT : INK, 1.7);
    if (r.tagline) { const t = fit(ctx, r.tagline, tw, Math.round(h * 0.19), 500, SANS, 10); carve(ctx, t, tx, y + h * 0.54, FAINT, 1); }
    if (small) { const t = fit(ctx, small, tw, Math.round(h * 0.165), 700, SANS, 9); carve(ctx, t, tx, y + h * (r.tagline ? 0.78 : 0.68), ghost ? FAINT : '#6a4a12', 1); }
  } else {
    carve(ctx, fit(ctx, r.name, tw, Math.round(h * 0.36), 700, SERIF, 11), tx, y + h * (small ? 0.34 : 0.5), ghost ? FAINT : INK, 1.4);
    if (small) { const t = fit(ctx, small, tw, Math.round(h * 0.24), 700, SANS, 9); carve(ctx, t, tx, y + h * 0.72, ghost ? FAINT : '#6a4a12', 1); }
  }
}

/**
 * Paints the tablet. rows: the sponsors, ranked; info: { open, from, gondola, backdrop }.
 * Returns what was painted: { title, cols, rows: [{ rank, name, figure, unit, where }], ghosts, more }.
 */
export function drawThanks(ctx, w, h, bare, rows = [], info = {}) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bare, 0, 0, w, h);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  // the two lines of the title: cut deep, the second with leaf in the cut
  const one = fit(ctx, THANKS_TITLE[0], w - 150, 70, 900, SERIF, 30);
  carve(ctx, one, w / 2, 70, INK, 3.2);
  const size = parseInt(ctx.font.match(/(\d+)px/)[1], 10);
  ctx.font = `900 ${size}px ${SERIF}`;
  gild(ctx, fit(ctx, THANKS_TITLE[1], w - 150, size, 900, SERIF, 30), w / 2, 146, size, MEDALS[0], 3.2);
  // a rule under them, an atom in its middle
  const ry = 196;
  for (const [x0, x1] of [[110, w / 2 - 44], [w / 2 + 44, w - 110]]) { ctx.fillStyle = 'rgba(30, 24, 18, 0.5)'; ctx.fillRect(x0, ry - 1.5, x1 - x0, 2); ctx.fillStyle = 'rgba(255, 248, 232, 0.5)'; ctx.fillRect(x0, ry + 0.5, x1 - x0, 1.5); }
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(w / 2, ry, 26, 9.5, (k * Math.PI) / 3, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = MEDALS[0][0]; ctx.beginPath(); ctx.arc(w / 2, ry, 5, 0, Math.PI * 2); ctx.fill();
  // the list
  const invite = { name: 'YOUR BRAND HERE', tagline: info.open ? 'The panel of a game goes to the highest bid' : 'Sponsoring opens soon', where: 'ASK AT THE TRADING POST', note: '', figure: info.open && info.from ? info.from : '', unit: '', logo: null };
  const ghosts = [];
  let list = rows;
  if (!rows.length) {
    // nobody yet: three places to take, and how
    ghosts.push(invite,
      { name: 'OR HERE', tagline: 'A gondola of the big wheel, in sight of the whole bay', where: 'AT THE STAND OF THE WHEEL', note: '', figure: info.open ? info.gondola || '' : '', unit: info.open && info.gondola ? 'a month' : '', logo: null },
      { name: 'OR HERE', tagline: 'The whole backdrop of the shooting gallery', where: 'ON THE PIER', note: '', figure: info.open ? info.backdrop || '' : '', unit: info.open && info.backdrop ? 'a month' : '', logo: null });
  }
  const lay = LAYOUTS.find((l) => Math.max(rows.length, ghosts.length) <= l.max) || LAYOUTS[LAYOUTS.length - 1];
  const cells = lay.cols * lay.rows;
  let more = 0;
  if (rows.length > cells) { more = rows.length - (cells - 1); list = rows.slice(0, cells - 1); }
  else if (rows.length && rows.length < cells) ghosts.push(invite); // (a place left: the next one is invited)
  const top = 218, bottom = h - 62, gap = lay.cols > 1 ? 26 : 0, inner = lay.cols === 1 ? Math.round(w * 0.64) : w - 150;
  const cw = (inner - gap * (lay.cols - 1)) / lay.cols, x0 = (w - inner) / 2, rh = (bottom - top) / lay.rows;
  const cell = (i) => [x0 + Math.floor(i / lay.rows) * (cw + gap), top + (i % lay.rows) * rh];
  list.forEach((r, i) => { const [x, y] = cell(i); line(ctx, x, y + 2, cw, rh - 4, i + 1, r, false); });
  ghosts.forEach((r, k) => { const i = list.length + k; if (i >= cells) return; const [x, y] = cell(i); line(ctx, x, y + 2, cw, rh - 4, i + 1, r, true); });
  if (more) {
    const [x, y] = cell(cells - 1);
    ctx.textAlign = 'center'; ctx.font = `700 ${Math.round(rh * 0.34)}px ${SERIF}`;
    carve(ctx, `… and ${more} more`, x + cw / 2, y + rh * 0.38, INK, 1.5);
    ctx.font = `700 ${Math.round(rh * 0.2)}px ${SANS}`;
    carve(ctx, 'ALL OF THEM AT THE TRADING POST', x + cw / 2, y + rh * 0.72, FAINT, 1);
  }
  // how to be on it
  ctx.textAlign = 'center';
  const foot = rows.length ? `YOUR BRAND HERE?  ASK AT THE TRADING POST, AT THE FOOT OF THE PIER${info.open && info.from ? `  ·  ${String(info.from).toUpperCase()}` : ''}` : 'THE TRADING POST IS AT THE FOOT OF THE PIER  ·  EVERY SPONSOR IS THANKED HERE, THE MOST GENEROUS FIRST';
  carve(ctx, fit(ctx, foot, w - 160, 21, 800, SANS, 11), w / 2, h - 38, FAINT, 1.2);
  return { title: THANKS_TITLE.join(' '), cols: lay.cols, rows: list.map((r, i) => ({ rank: i + 1, name: r.name, figure: r.figure, unit: r.unit, where: r.where })), ghosts: Math.min(ghosts.length, cells - list.length), more };
}

/**
 * Builds the wall in the games zone. Returns { x, z (where one stands to read it), face: { x, y, z, yaw, tilt,
 * width, height }, shown, set(rows, info) }.
 */
export function buildThanksWall(zone) {
  const T = THANKS_WALL, W = T.width, H = T.height, g = zone.ground;
  const nx = Math.sin(T.yaw), nz = Math.cos(T.yaw), tx = Math.cos(T.yaw), tz = -Math.sin(T.yaw);
  // the meadow in front of it; then how the rock leans: where the ground reaches the foot of the tablet, and its head
  const meadow = Math.min(...[11, 13, 15, 17].map((d) => g(T.x + nx * d, T.z + nz * d)));
  const RISE = 5.6, yb = meadow + T.lift, N = 9;
  const reach = (s, y) => { for (let d = -10; d < 14; d += 0.1) if (g(T.x + tx * s - nx * d, T.z + tz * s - nz * d) >= y) return d; return 14; };
  let lo = 0, hi = 0;
  for (let i = 0; i < N; i++) { const s = (i / (N - 1) - 0.5) * W; lo += reach(s, yb) / N; hi += reach(s, yb + RISE) / N; }
  const tilt = Math.min(0.7, Math.max(0.26, Math.atan2(hi - lo, RISE))), ct = Math.cos(tilt), st = Math.sin(tilt);
  const into = lo + (H / 2) * st; // (how far into the hill its middle is)
  const c = new THREE.Vector3(T.x - nx * into, yb + (H / 2) * ct, T.z - nz * into);
  const out = new THREE.Vector3(nx * ct, st, nz * ct), up = new THREE.Vector3(-nx * st, ct, -nz * st), along = new THREE.Vector3(tx, 0, tz);
  // …and just proud of it: no corner of the face under the ground
  const p = new THREE.Vector3();
  const buried = () => {
    let worst = -Infinity;
    for (let i = 0; i <= 12; i++) for (let k = 0; k <= 6; k++) {
      p.copy(c).addScaledVector(along, (i / 12 - 0.5) * (W + 1.4)).addScaledVector(up, (k / 6 - 0.5) * (H + 1.4));
      worst = Math.max(worst, g(p.x, p.z) - p.y);
    }
    return worst;
  };
  let proud = 0;
  for (; proud < 3 && buried() > -0.12; proud += 0.05) c.addScaledVector(out, 0.05);

  // the frame: rough blocks of the rock around the face, standing out of the cliff a little more than it
  const parts = new Parts(), rock = parts.get('rock'), rnd = rng(77), back = 1.7 + proud;
  rock.place(c.x, c.y, c.z, T.yaw, -tilt);
  rock.tint(0.8, 0.79, 0.76, 1).box(-W / 2 - 0.5, -H / 2 - 0.5, -back, W / 2 + 0.5, H / 2 + 0.5, -0.04, { faces: 'xXyY' });
  const block = (x0, x1, y0, y1, stand) => {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, k = 0.8 + rnd() * 0.2;
    rock.tint(k, k * 0.985, k * 0.955, 1);
    rock.place(cx, cy, 0, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.05, (rnd() - 0.5) * 0.03);
    rock.box(x0 - cx, y0 - cy, -back, x1 - cx, y1 - cy, stand, { faces: 'xXyYZ' });
    rock.pop();
  };
  const cuts = (a, b, n) => { const at = [a]; for (let i = 1; i < n; i++) at.push(a + ((b - a) * (i + (rnd() - 0.5) * 0.5)) / n); at.push(b); return at; };
  const E = 1.0;
  { const at = cuts(-W / 2 - E, W / 2 + E, 5); for (let i = 0; i < 5; i++) block(at[i], at[i + 1], H / 2 - 0.06, H / 2 + 0.8 + rnd() * 0.4, 0.4 + rnd() * 0.3); } // the lintel
  { const at = cuts(-W / 2 - E, W / 2 + E, 4); for (let i = 0; i < 4; i++) block(at[i], at[i + 1], -H / 2 - 0.75 - rnd() * 0.35, -H / 2 + 0.06, 0.6 + rnd() * 0.35); } // the sill
  for (const side of [-1, 1]) {
    const at = cuts(-H / 2 + 0.06, H / 2 - 0.06, 3);
    for (let i = 0; i < 3; i++) { const far = W / 2 + 0.7 + rnd() * 0.4; block(side < 0 ? -far : W / 2 - 0.06, side < 0 ? -W / 2 + 0.06 : far, at[i], at[i + 1], 0.35 + rnd() * 0.3); }
  }
  rock.pop();
  zone._add(parts, 'thanks');

  // the face
  const canvas = document.createElement('canvas');
  canvas.width = CW; canvas.height = CH;
  const ctx = canvas.getContext('2d'), bare = stone(CW, CH), texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8; // (it is read from below, and it leans back)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  face.position.copy(c);
  face.rotation.order = 'YXZ';
  face.rotation.set(-tilt, T.yaw, 0);
  face.name = 'notice-thanks';
  zone.group.add(face);

  const wall = {
    x: T.x + nx * 10, z: T.z + nz * 10,
    face: { x: c.x, y: c.y, z: c.z, yaw: T.yaw, tilt, width: W, height: H },
    shown: null,
    /** Who is thanked, the most generous first (see the top of this file). Painted again only when something changed. */
    set(rows = [], info = {}) {
      const key = JSON.stringify([rows.map((r) => [r.name, r.tagline, r.where, r.note, r.figure, r.unit, r.logo ? `${r.logo.width}x${r.logo.height}:${r.logo.src || ''}` : 0]), info]);
      if (key === wall.key) return false;
      wall.key = key;
      wall.shown = drawThanks(ctx, CW, CH, bare, rows, info);
      texture.needsUpdate = true;
      return true;
    },
  };
  wall.set([], {});
  return wall;
}
