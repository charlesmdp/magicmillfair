// The wall of thanks: in the cliff west of the meadow of the acid pond, a great tablet as if cut into the
// rock — THANKS TO THOSE COMPANIES, THE GAME IS FREE FOR YOU! — and under it everyone who sponsors the fair,
// the one who puts in the most first (who counts, and in which order: app/thanks.js).
//
// The tablet is in the rock: it reads the cliff in section and follows it — its face bends with the rock, half
// a metre proud of it — and from its edges a buttress of faceted rock, the stone of the boulders around, runs
// back into the cliff: a swelling of the rock face, dressed flat where the words are cut. One sheet for all of
// it (a canvas, painted when the list changes and not otherwise) on one mesh; the buttress goes with the rest
// of the rock of the fair.
//
//   wall.set(rows, info)   rows: what rankSponsors() gives, `logo` being a picture already loaded (or null);
//                          info: { open, from, gondola, backdrop } — the words of the invitation ("from $1"…)
//   wall.shown             what is on it right now: { title, cols, rows: [{ rank, name, figure, unit, site, clicks }], ghosts, page, pages }
//   wall.turn()            when the sponsors do not fit on one face (more than 28): the next page of them
//                          (the game calls it every dozen seconds)
//
// Nothing a sponsor wrote is ever anything but text painted on that sheet; a logo is a picture served by the
// game (the same safe way as on the panels: net/Shop.js loadImage).
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';
import { THANKS_WALL } from '../../layout/layout.js';

const SERIF = "Georgia, 'Times New Roman', serif", SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const CW = 2048, CH = 732, K = CW / 1536; // (the sheet: 73 pixels a metre; K: its measures were first drawn 1536 wide)
export const THANKS_TITLE = ['THANKS TO THOSE COMPANIES,', 'THE GAME IS FREE FOR YOU!'];
/** How many sponsors fit, and how: up to `max` of them in `cols` columns of `rows`. */
const LAYOUTS = [{ max: 3, cols: 1, rows: 3 }, { max: 8, cols: 2, rows: 4 }, { max: 15, cols: 3, rows: 5 }, { max: 28, cols: 4, rows: 7 }];
const MEDALS = [['#f3cf63', '#8a5a00', 'rgba(236, 190, 70, 0.26)'], ['#e9edf2', '#5c6470', 'rgba(232, 236, 242, 0.24)'], ['#e0a473', '#7a3f14', 'rgba(214, 140, 86, 0.22)']]; // gold, silver, bronze: leaf, shade, wash
const INK = '#3a3129', FAINT = '#51473d', RUST = '#7c2c12', BRONZE = '#4f3a10', LIP = 'rgba(255, 248, 232, 0.6)', SHADE = 'rgba(26, 20, 14, 0.5)';

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
  for (let i = 0; i < 18; i++) {
    const y = rnd() * h, t = 10 + rnd() * 46, lean = (rnd() - 0.5) * 40;
    g.fillStyle = rnd() < 0.55 ? `rgba(52, 44, 36, ${0.015 + rnd() * 0.03})` : `rgba(255, 246, 228, ${0.015 + rnd() * 0.028})`;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 96; x <= w; x += 96) g.lineTo(x, y + (x / w) * lean + Math.sin(x * 0.011 + i) * 3);
    for (let x = w; x >= 0; x -= 96) g.lineTo(x, y + t + (x / w) * lean + Math.sin(x * 0.013 + i * 2) * 3);
    g.closePath(); g.fill();
  }
  for (let i = 0; i < 70; i++) { // large stains
    const r = 70 + rnd() * 170;
    g.fillStyle = rnd() < 0.5 ? `rgba(40, 34, 28, ${0.02 + rnd() * 0.03})` : `rgba(255, 250, 238, ${0.018 + rnd() * 0.026})`;
    g.beginPath(); g.ellipse(rnd() * w, rnd() * h, r * (1 + rnd() * 0.8), r * 0.7, rnd() * 3, 0, 6.3); g.fill();
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
  const B = Math.round(15 * K), side = (pts, style) => { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fillStyle = style; g.fill(); };
  side([[0, 0], [w, 0], [w - B, B], [B, B]], 'rgba(20, 16, 12, 0.46)');
  side([[0, 0], [B, B], [B, h - B], [0, h]], 'rgba(20, 16, 12, 0.32)');
  side([[0, h], [B, h - B], [w - B, h - B], [w, h]], 'rgba(255, 248, 232, 0.34)');
  side([[w, 0], [w, h], [w - B, h - B], [w - B, B]], 'rgba(255, 248, 232, 0.2)');
  const under = g.createLinearGradient(0, B, 0, B + 46 * K);
  under.addColorStop(0, 'rgba(20, 16, 12, 0.22)'); under.addColorStop(1, 'rgba(20, 16, 12, 0)');
  g.fillStyle = under; g.fillRect(B, B, w - 2 * B, 46 * K);
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

/** One line of the list, in its cell. `r`: a sponsor ({ name, tagline, site, clicks, note, figure, unit, logo }); `ghost`: an invitation instead ({ …, where }). */
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
  carve(ctx, `#${rank}`, x + pad + rw / 2, mid, medal ? INK : FAINT, 1.5);
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
    carve(ctx, r.figure, right, fy, ghost ? FAINT : RUST, 1.6); // (what is paid: in rust, as on the list this one is modelled on)
    let uw = 0;
    if (r.unit) { ctx.font = `700 ${Math.max(9, Math.round(h * 0.18))}px ${SANS}`; uw = ctx.measureText(r.unit).width; carve(ctx, r.unit, right, y + h * 0.72, FAINT, 1); }
    right -= Math.max(fw, uw) + h * 0.16;
  }
  // who it is
  const tx = px + s + h * 0.2, tw = Math.max(20, right - tx);
  ctx.textAlign = 'left';
  // (under the name: its site and how many times it was opened from the game — an invitation says where to ask)
  const small = (ghost ? [r.where, r.note] : [r.site, r.site && r.clicks ? `${r.clicks} click${r.clicks === 1 ? '' : 's'}` : '', r.note]).filter(Boolean).join(' · ');
  if (rich) {
    carve(ctx, fit(ctx, r.name, tw, Math.round(h * 0.31), 700, SERIF, 12), tx, y + h * (r.tagline ? 0.27 : 0.36), ghost ? FAINT : INK, 1.7);
    if (r.tagline) { const t = fit(ctx, r.tagline, tw, Math.round(h * 0.2), 600, SANS, 10); carve(ctx, t, tx, y + h * 0.545, FAINT, 1); }
    if (small) { const t = fit(ctx, small, tw, Math.round(h * 0.17), 800, SANS, 9); carve(ctx, t, tx, y + h * (r.tagline ? 0.79 : 0.68), ghost ? FAINT : BRONZE, 1); }
  } else {
    carve(ctx, fit(ctx, r.name, tw, Math.round(h * 0.36), 700, SERIF, 11), tx, y + h * (small ? 0.34 : 0.5), ghost ? FAINT : INK, 1.4);
    if (small) { const t = fit(ctx, small, tw, Math.round(h * 0.24), 800, SANS, 9); carve(ctx, t, tx, y + h * 0.72, ghost ? FAINT : BRONZE, 1); }
  }
}

/**
 * Paints the tablet. rows: the sponsors, ranked; info: { open, from, gondola, backdrop }.
 * Returns what was painted: { title, cols, rows: [{ rank, name, figure, unit, site, clicks }], ghosts, page, pages }.
 * `page`: when they do not all fit on one face, which page of them (they are ranked across the pages).
 */
export function drawThanks(ctx, w, h, bare, rows = [], info = {}, page = 0) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(bare, 0, 0, w, h);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  // the two lines of the title: cut deep, the second with leaf in the cut
  const one = fit(ctx, THANKS_TITLE[0], w - 150 * K, Math.round(70 * K), 900, SERIF, 30);
  carve(ctx, one, w / 2, 70 * K, INK, 3.2 * K);
  const size = parseInt(ctx.font.match(/(\d+)px/)[1], 10);
  ctx.font = `900 ${size}px ${SERIF}`;
  gild(ctx, fit(ctx, THANKS_TITLE[1], w - 150 * K, size, 900, SERIF, 30), w / 2, 146 * K, size, MEDALS[0], 3.2 * K);
  // a rule under them, an atom in its middle
  const ry = 196 * K;
  for (const [x0, x1] of [[110 * K, w / 2 - 44 * K], [w / 2 + 44 * K, w - 110 * K]]) { ctx.fillStyle = 'rgba(30, 24, 18, 0.5)'; ctx.fillRect(x0, ry - 1.5, x1 - x0, 2); ctx.fillStyle = 'rgba(255, 248, 232, 0.5)'; ctx.fillRect(x0, ry + 0.5, x1 - x0, 1.5); }
  ctx.strokeStyle = INK; ctx.lineWidth = 2 * K;
  for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(w / 2, ry, 26 * K, 9.5 * K, (k * Math.PI) / 3, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = MEDALS[0][0]; ctx.beginPath(); ctx.arc(w / 2, ry, 5 * K, 0, Math.PI * 2); ctx.fill();
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
  // (more of them than a face holds: the wall has pages, and turns them)
  const pages = Math.max(1, Math.ceil(rows.length / cells)), at = ((page % pages) + pages) % pages, base = at * cells;
  if (rows.length > cells) list = rows.slice(base, base + cells);
  else if (rows.length && rows.length < cells) ghosts.push(invite); // (a place left: the next one is invited)
  const top = 218 * K, bottom = h - 62 * K, gap = lay.cols > 1 ? 26 * K : 0, inner = lay.cols === 1 ? Math.round(w * 0.6) : w - 150 * K;
  const cw = (inner - gap * (lay.cols - 1)) / lay.cols, x0 = (w - inner) / 2, rh = (bottom - top) / lay.rows;
  const cell = (i) => [x0 + Math.floor(i / lay.rows) * (cw + gap), top + (i % lay.rows) * rh];
  list.forEach((r, i) => { const [x, y] = cell(i); line(ctx, x, y + 2, cw, rh - 4, base + i + 1, r, false); });
  ghosts.forEach((r, k) => { const i = list.length + k; if (i >= cells) return; const [x, y] = cell(i); line(ctx, x, y + 2, cw, rh - 4, i + 1, r, true); });
  // how to be on it
  ctx.textAlign = 'center';
  const foot = pages > 1 ? `PAGE ${at + 1} OF ${pages}  ·  ${rows.length} SPONSORS, THE MOST GENEROUS FIRST  ·  STEP UP TO THE WALL TO OPEN THEIR SITES` : rows.length ? `YOUR BRAND HERE?  ASK AT THE TRADING POST, AT THE FOOT OF THE PIER${info.open && info.from ? `  ·  ${String(info.from).toUpperCase()}` : ''}` : 'THE TRADING POST IS AT THE FOOT OF THE PIER  ·  EVERY SPONSOR IS THANKED HERE, THE MOST GENEROUS FIRST';
  carve(ctx, fit(ctx, foot, w - 160 * K, Math.round(21 * K), 800, SANS, 11), w / 2, h - 38 * K, FAINT, 1.2 * K);
  return { title: THANKS_TITLE.join(' '), cols: lay.cols, rows: list.map((r, i) => ({ rank: base + i + 1, name: r.name, figure: r.figure, unit: r.unit, site: r.site || '', clicks: r.clicks || 0 })), ghosts: Math.min(ghosts.length, cells - list.length), page: at, pages };
}

/**
 * Builds the wall in the games zone. Returns { x, z (where one stands to read it), face: { x, y, z, yaw, tilt,
 * width, height }, points (nine points of its face: corners, middles — [x, y, z]), shown, set(rows, info) }.
 */
export function buildThanksWall(zone) {
  const T = THANKS_WALL, W = T.width, H = T.height, g = zone.ground;
  const nx = Math.sin(T.yaw), nz = Math.cos(T.yaw), tx = Math.cos(T.yaw), tz = -Math.sin(T.yaw);
  const at = (o, y, s) => new THREE.Vector3(T.x + nx * o + tx * s, y, T.z + nz * o + tz * s); // (o: out of the hill, s: along the tablet)
  // The cliff in section, across the tablet: at each step into the hill, the rock where it stands out most
  // along the length of the tablet (the tablet clears all of it), smoothed over a metre.
  const meadow = Math.min(...[11, 13, 15, 17].map((d) => g(T.x + nx * d, T.z + nz * d)));
  const STEP = 0.1, D0 = -8, D1 = 18, raw = [];
  for (let d = D0; d <= D1 + 1e-6; d += STEP) { let top = -Infinity; for (let i = 0; i < 13; i++) top = Math.max(top, g(T.x + tx * (i / 12 - 0.5) * W - nx * d, T.z + tz * (i / 12 - 0.5) * W - nz * d)); raw.push(top); }
  const prof = raw.map((_, i) => { let sum = 0, n = 0; for (let k = -5; k <= 5; k++) if (raw[i + k] !== undefined) { sum += raw[i + k]; n++; } return sum / n; });
  const rockAt = (d) => { const u = Math.min(prof.length - 1.001, Math.max(0, (d - D0) / STEP)), i = Math.floor(u); return prof[i] + (prof[i + 1] - prof[i]) * (u - i); };
  // Its foot: where that rock is `lift` above the meadow. Then up the rock by equal lengths to its head: each row
  // knows the way out of the rock there, and the way up it.
  const NV = 16, PROUD = 0.5, rows = [];
  let d = D0;
  while (d < D1 && rockAt(d) < meadow + T.lift) d += 0.02;
  for (let len = 0, next = 0, pd = d, py = rockAt(d); rows.length <= NV && d < D1; d += 0.02) {
    const y = rockAt(d);
    len += Math.hypot(d - pd, y - py); pd = d; py = y;
    if (len < next) continue;
    const rise = rockAt(d + 0.6) - rockAt(d - 0.6), l = Math.hypot(rise, 1.2);
    rows.push({ o: -d, y, out: [rise / l, 1.2 / l], up: [-1.2 / l, rise / l] });
    next += H / NV;
  }
  while (rows.length <= NV) rows.push(rows[rows.length - 1]); // (never, on this cliff: a rock that would end before the tablet does)
  /** A point of the tablet: row j, `s` along it, `proud` of the rock — and `past` its foot (row 0) or its head (the last row), along the rock. */
  const point = (j, s, proud, past = 0) => { const r = rows[j], k = j === 0 ? -past : past; return at(r.o + r.out[0] * proud + r.up[0] * k, r.y + r.out[1] * proud + r.up[1] * k, s); };

  // the face: a sheet that bends with the rock, straight along its length
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= NV; j++) for (const side of [0, 1]) { const q = point(j, (side - 0.5) * W, PROUD); pos.push(q.x, q.y, q.z); uv.push(side, j / NV); }
  for (let j = 0; j < NV; j++) { const a = j * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  const sheet = new THREE.BufferGeometry();
  sheet.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sheet.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  sheet.setIndex(idx);
  sheet.computeBoundingSphere();
  const canvas = document.createElement('canvas');
  canvas.width = CW; canvas.height = CH;
  const ctx = canvas.getContext('2d'), bare = stone(CW, CH), texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8; // (it is read from below, and it leans back)
  const face = new THREE.Mesh(sheet, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  face.name = 'notice-thanks';
  zone.group.add(face);

  // the buttress: round the face, a lip (the face is cut into it), a rim, a shoulder, and a last ring under the
  // ground — facets of rock between them. The rings go round the face the same way: along its foot, up its
  // right side, back along its head, down its left side.
  const parts = new Parts(), rock = parts.get('rock'), rnd = rng(77), loop = [], NB = 12, D = Math.SQRT1_2;
  for (let i = 0; i <= NB; i++) loop.push({ j: 0, s: (i / NB - 0.5) * W, dir: i === 0 ? [-D, D] : i === NB ? [D, D] : [0, 1] });
  for (let j = 1; j < NV; j++) loop.push({ j, s: W / 2, dir: [1, 0] });
  for (let i = NB; i >= 0; i--) loop.push({ j: NV, s: (i / NB - 0.5) * W, dir: i === 0 ? [-D, D] : i === NB ? [D, D] : [0, 1] });
  for (let j = NV - 1; j >= 1; j--) loop.push({ j, s: -W / 2, dir: [-1, 0] });
  /** A ring: `wide` metres out from the edge of the face, `proud(v)` of the rock (null: sunk under the ground), each with a little chance in it. */
  const ring = (wide, proud, chance = 0) => loop.map((v) => {
    const m = wide * (1 + (rnd() - 0.5) * chance), q = point(v.j, v.s + v.dir[0] * m, proud === null ? 0 : proud(v) + (rnd() - 0.5) * chance * 0.5, v.dir[1] * m);
    if (proud === null) q.y = g(q.x, q.z) - 0.9;
    return q;
  });
  // (no lip along the foot: seen from the meadow, it would stand in front of the last line)
  const lip = (v) => (v.j === 0 ? 0 : 0.32);
  const rings = [ring(0, () => PROUD), ring(0, (v) => PROUD + lip(v)), ring(0.75, (v) => PROUD + (v.j === 0 ? -0.1 : 0.36), 0.3), ring(2.0, () => PROUD * 0.5, 0.45), ring(3.6, null, 0.3)];
  const n = loop.length;
  for (let r = 0; r + 1 < rings.length; r++) {
    const A = rings[r], B = rings[r + 1];
    for (let k = 0; k < n; k++) {
      const k1 = (k + 1) % n, shade = (r === 0 ? 0.46 : 0.6) + rnd() * 0.16; // (the tone of the cliff; the cut round the face in its own shade)
      rock.tint(shade, shade * 0.955, shade * 0.89, 1);
      if (r === 0) { if (lip(loop[k]) + lip(loop[k1]) > 0) { rock.tri(A[k], B[k], B[k1]); rock.tri(A[k], B[k1], A[k1]); } } // (the wall of the cut: it looks at the face)
      else { rock.tri(B[k], B[k1], A[k1]); rock.tri(B[k], A[k1], A[k]); }
    }
  }
  zone._add(parts, 'thanks');

  const c = point(NV / 2, 0, PROUD), lean = Math.atan2(rows[0].o - rows[NV].o, rows[NV].y - rows[0].y);
  const wall = {
    x: T.x + nx * 12, z: T.z + nz * 12,
    face: { x: c.x, y: c.y, z: c.z, yaw: T.yaw, tilt: lean, width: W, height: H },
    points: [0, NV / 2, NV].flatMap((j) => [-0.5, 0, 0.5].map((u) => point(j, u * W, PROUD).toArray())),
    shown: null,
    /** Who is thanked, the most generous first (see the top of this file). Painted again only when something changed. */
    set(list = [], info = {}) {
      const key = JSON.stringify([list.map((r) => [r.name, r.tagline, r.site, r.clicks, r.note, r.figure, r.unit, r.logo ? `${r.logo.width}x${r.logo.height}:${r.logo.src || ''}` : 0]), info]);
      if (key === wall.key) return false;
      wall.key = key;
      wall.list = list; wall.info = info;
      wall.shown = drawThanks(ctx, CW, CH, bare, list, info, wall.page);
      wall.page = wall.shown.page;
      texture.needsUpdate = true;
      return true;
    },
    page: 0, list: [], info: {},
    /** The next page of the sponsors, when they do not fit on one face. → did it turn? */
    turn() {
      if (!wall.shown || wall.shown.pages < 2) return false;
      wall.shown = drawThanks(ctx, CW, CH, bare, wall.list, wall.info, wall.page + 1);
      wall.page = wall.shown.page;
      texture.needsUpdate = true;
      return true;
    },
  };
  wall.set([], {});
  return wall;
}
