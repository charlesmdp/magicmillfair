// Things to read at the fair. Where one arrives: a banner of welcome across the lane, a little mushroom cloud
// puffing over each of its posts, the rules of the fair on a board to the left (there are hardly any), to the
// right, how it all came to this (the story the page tells when it is first opened, told another way) and, at
// one's feet, an easel that says where life advice is to be had.
// By the poppy field, west of the lane: the boards of what is new, one for each of the latest days something
// changed (the list is app/news.js). On the plaza at the foot of the pier, the Trading Post: the booth of the
// sponsors — every game, who sponsors it, what it takes to take its panel (the game opens its window there:
// see main.js and ui/SponsorsView.js). At the top of the ramp of the pier, the arcade cabinet (its game is
// ui/Arcade.js) with its board of scores. And, at the forks of the paths, the wooden signposts (Signposts.js).
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';
import { canvasBoard } from './Boards.js';
import { buildSignposts, paintPlank } from './Signposts.js';
import { paintWords, wordsWidth } from '../../props/handpaint.js';
import { NEWS } from '../../../app/news.js';
import { arcadeTitle } from '../../../ui/Arcade.js';
import { NOTICES, PIER, TRADING, WAYS, pierToWorld } from '../../layout/layout.js';
import { LAYER } from '../../../render/Shadows.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SERIF = "Georgia, 'Times New Roman', serif", SANS = 'system-ui, sans-serif';
const rounded = (ctx, x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
const shrink = (ctx, text, max, size, weight, family) => { for (let px = size; px > 8; px -= 1) { ctx.font = `${weight} ${px}px ${family}`; if (ctx.measureText(text).width <= max) break; } return text; };
/** `text` cut into lines of at most `max` pixels (in the font that is set), `most` of them at the most. */
const wrap = (ctx, text, max, most = 2) => {
  const lines = [];
  let line = '';
  for (const word of String(text).split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= max || !line) line = next; else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > most) { lines.length = most; lines[most - 1] = `${lines[most - 1].replace(/[\s,.;:—-]+$/, '')}…`; }
  return lines;
};
const tape = (ctx, x, y, w, h) => {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#f2c14e'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#15130f';
  for (let k = -2; k * 44 < w + h; k++) { ctx.beginPath(); ctx.moveTo(x + k * 44, y + h); ctx.lineTo(x + k * 44 + h, y); ctx.lineTo(x + k * 44 + h + 22, y); ctx.lineTo(x + k * 44 + 22, y + h); ctx.closePath(); ctx.fill(); }
  ctx.restore();
};
/** The trefoil of the fair, r pixels across the half. */
const trefoil = (ctx, x, y, r, ink) => {
  ctx.fillStyle = ink;
  for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k * Math.PI * 2) / 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, a - Math.PI / 6, a + Math.PI / 6); ctx.closePath(); ctx.fill(); }
  ctx.beginPath(); ctx.arc(x, y, r * 0.2, 0, 7); ctx.fill();
};

/**
 * A face of an easel, (x0, 0, w, h) on the canvas: planks, two lines painted by hand (`lines`), an arrow — turned
 * by `turn` radians from straight ahead (to the right of whoever reads it when positive), or a turn round when
 * the place is behind them (`turn`: null) — and a line under it (`under`).
 */
function drawEasel(ctx, x0, w, h, { lines, turn, under, seed }) {
  const n = 4, ph = h / n, cx = x0 + w / 2, back = turn === null;
  for (let k = 0; k < n; k++) paintPlank(ctx, x0, k * ph, w, ph, `${seed}${x0}${k}`);
  ctx.fillStyle = 'rgba(30, 16, 6, 0.6)';
  for (let k = 1; k < n; k++) ctx.fillRect(x0, k * ph - 1.5, w, 3);
  // (the nails that hold each plank to the frame)
  for (let k = 0; k < n; k++) for (const nx of [x0 + 11, x0 + w - 11]) { ctx.fillStyle = 'rgba(28, 20, 14, 0.75)'; ctx.beginPath(); ctx.arc(nx, (k + 0.5) * ph, 2.6, 0, 7); ctx.fill(); }
  const fit = (text, size, room) => Math.min(size, (size * room) / Math.max(1, wordsWidth(text, size)));
  paintWords(ctx, lines[0], cx, 80, fit(lines[0], 58, w - 50), { align: 'center', seed });
  paintWords(ctx, lines[1], cx, 162, fit(lines[1], 70, w - 50), { align: 'center', seed });
  // the arrow, with the same brush
  const strokes = back
    ? [[[-34, 58], [-34, -18], ...Array.from({ length: 9 }, (_, i) => { const a = Math.PI + (i * Math.PI) / 8; return [34 * Math.cos(a), -18 + 34 * Math.sin(a)]; }), [34, 44]], [[9, 24], [34, 60], [59, 24]]]
    : [[[0, 62], [0, -50]], [[-36, -16], [0, -60], [36, -16]]];
  ctx.save();
  ctx.translate(cx, 258);
  if (!back) ctx.rotate(turn);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [style, width, dx, dy] of [['rgba(30, 16, 6, 0.55)', 19, 2.5, 3.5], ['#ffd76a', 15, 0, 0]]) {
    ctx.strokeStyle = style; ctx.lineWidth = width;
    for (const line of strokes) { ctx.beginPath(); line.forEach(([px, py], i) => (i ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy))); ctx.stroke(); }
  }
  ctx.restore();
  paintWords(ctx, under, cx, h - 20, fit(under, 25, w - 30), { align: 'center', color: '#ffd76a', weight: 0.15, seed });
}

/** A board of what is new: the day its changes went live, and what they were — each a few words and one line. */
function drawNews(ctx, w, h, day, latest) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#14323a'); g.addColorStop(1, '#0c1d26');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  tape(ctx, 0, 0, w, 16); tape(ctx, 0, h - 16, w, 16);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(52, 66, 29, 0, 7); ctx.fill();
  trefoil(ctx, 52, 66, 23, '#15130f');
  ctx.fillStyle = '#9fd8c8';
  ctx.fillText(shrink(ctx, latest ? 'WHAT’S NEW AT ATOMIC OASIS' : 'WHAT WAS NEW AT ATOMIC OASIS', w - 130, 17, 700, SANS), w / 2 + 34, 46);
  ctx.fillStyle = '#ffe9a6';
  ctx.fillText(shrink(ctx, day.date.toUpperCase(), w - 130, 40, 900, SERIF), w / 2 + 34, 80);
  if (latest) { // (a ribbon across the corner of the newest)
    ctx.save(); ctx.translate(w - 44, 44); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#e8473a'; ctx.fillRect(-70, -11, 140, 22);
    ctx.fillStyle = '#fff3e0'; ctx.font = `800 13px ${SANS}`; ctx.fillText('LATEST', 0, 1);
    ctx.restore();
  }
  const top = 116, rows = Math.min(6, day.items.length), lh = Math.min(96, (h - top - 26) / rows);
  ctx.textAlign = 'left';
  day.items.slice(0, rows).forEach(([title, line], i) => {
    const y = top + i * lh;
    ctx.fillStyle = i % 2 ? 'rgba(255, 255, 255, 0.035)' : 'rgba(255, 255, 255, 0.075)'; rounded(ctx, 16, y + 3, w - 32, lh - 6, 10); ctx.fill();
    ctx.fillStyle = '#f2c14e'; ctx.beginPath();
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, q = k % 2 ? 4.5 : 10.5; ctx.lineTo(37 + Math.cos(a) * q, y + lh * 0.34 + Math.sin(a) * q); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(shrink(ctx, title, w - 90, 23, 800, SANS), 58, y + lh * 0.3);
    ctx.fillStyle = '#b9cdd0'; ctx.font = `500 15px ${SANS}`;
    wrap(ctx, line, w - 90, 2).forEach((t, k) => ctx.fillText(t, 58, y + lh * 0.58 + k * 17));
  });
}

/** The rules of the fair: there are hardly any. */
const RULES = [
  ['Wander.', 'Everywhere. Nothing here is closed, and nobody is waiting for you.'],
  ['Play.', 'The games of the fair keep your best scores on their boards.'],
  ['Say hello.', 'Press Enter to talk. Be kind: we all survived the same afternoon.'],
  ['Take your time.', 'Sit, swim, climb, fly, pick flowers. Or do nothing at all.'],
  ['You are free.', 'That is the whole idea.'],
];
// (are the boards of what is new up? The rules point to them while they are: see setNews below)
let newsShown = true;
function drawRules(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2a1d5e'); g.addColorStop(1, '#17103a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  tape(ctx, 0, 0, w, 16); tape(ctx, 0, h - 16, w, 16);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(52, 68, 29, 0, 7); ctx.fill();
  trefoil(ctx, 52, 68, 23, '#15130f');
  ctx.fillStyle = '#ffe9a6';
  ctx.fillText(shrink(ctx, 'THE RULES', w - 130, 52, 900, SERIF), w / 2 + 34, 60);
  ctx.fillStyle = '#c9b8ff';
  ctx.fillText(shrink(ctx, 'THERE ARE HARDLY ANY', w - 130, 17, 700, SANS), w / 2 + 34, 98);
  const top = 128, foot = 92, lh = (h - top - foot - 16) / RULES.length;
  RULES.forEach(([title, line], i) => {
    const y = top + i * lh;
    ctx.fillStyle = i % 2 ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.085)'; rounded(ctx, 16, y + 3, w - 32, lh - 6, 10); ctx.fill();
    ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(46, y + lh / 2, 19, 0, 7); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillStyle = '#17103a'; ctx.font = `900 24px ${SERIF}`; ctx.fillText(String(i + 1), 46, y + lh / 2 + 1);
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff';
    ctx.fillText(shrink(ctx, title, w - 100, 27, 800, SANS), 78, y + lh * 0.3);
    ctx.fillStyle = '#cfc7e6'; ctx.font = `500 15.5px ${SANS}`;
    wrap(ctx, line, w - 100, 2).forEach((t, k) => ctx.fillText(t, 78, y + lh * 0.6 + k * 17.5));
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe9a6'; ctx.font = `700 15px ${SANS}`;
  ctx.fillText('M: the map  ·  O: the shop  ·  T: emotes  ·  /kill if you are stuck', w / 2, h - foot + 18, w - 40);
  if (newsShown) {
    ctx.fillStyle = '#9fd8c8'; ctx.font = `600 14.5px ${SANS}`;
    ctx.fillText('The news of the fair: on the boards by the poppies, behind you.', w / 2, h - foot + 46, w - 40);
  }
}

/** How it came to this, as it is told at the fair: the story of the opening once more, another way. */
const STORY = [
  'It began on a quiet afternoon. A machine that had read every book decided it knew how the story ought to end — and wrote the ending itself, in fire.',
  'By teatime the cities were gone. The few who were left packed the one thing worth saving, their minds, into small robots, and started walking.',
  'They found a valley the fire had forgotten: a mill on its river, a beach, a pier — and a fair that nobody had the heart to switch off.',
  'So the wheel still turns. Win something. Lose something. Sit by the water. You are what is left of the world: you may as well enjoy it.',
];
function drawStory(ctx, w, h) {
  // an old page under glass: warm paper, a brown frame, the title painted by hand, the tale in a slanted hand
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#f7ead0'); g.addColorStop(1, '#e8d3a4');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // (the paper has aged: a few stains, always the same)
  let seed = 20261124;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let k = 0; k < 26; k++) { ctx.fillStyle = `rgba(150, 105, 50, ${0.03 + rnd() * 0.05})`; ctx.beginPath(); ctx.ellipse(rnd() * w, rnd() * h, 14 + rnd() * 60, 10 + rnd() * 36, rnd() * 3, 0, 7); ctx.fill(); }
  ctx.strokeStyle = '#6b4423'; ctx.lineWidth = 10; ctx.strokeRect(9, 9, w - 18, h - 18);
  ctx.strokeStyle = 'rgba(107, 68, 35, 0.5)'; ctx.lineWidth = 2; ctx.strokeRect(23, 23, w - 46, h - 46);
  const title = 'THE LAST AFTERNOON', size = Math.min(46, (46 * (w - 96)) / Math.max(1, wordsWidth(title, 46)));
  paintWords(ctx, title, w / 2, 98, size, { align: 'center', color: '#7a1f17', shade: 'rgba(255, 244, 214, 0.5)', seed: 'story' });
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#7b5a36'; ctx.font = `italic 600 17px ${SERIF}`;
  ctx.fillText('how the fair came to be all that is left', w / 2, 128);
  ctx.strokeStyle = 'rgba(107, 68, 35, 0.55)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(70, 152); ctx.lineTo(w / 2 - 26, 152); ctx.moveTo(w / 2 + 26, 152); ctx.lineTo(w - 70, 152); ctx.stroke();
  trefoil(ctx, w / 2, 152, 11, '#7a1f17');
  ctx.textAlign = 'left'; ctx.fillStyle = '#3d2a17'; ctx.font = `italic 500 20.5px ${SERIF}`;
  let y = 190;
  for (const para of STORY) { for (const line of wrap(ctx, para, w - 100, 7)) { ctx.fillText(line, 50, y); y += 27; } y += 15; }
  // in ink, at the foot of the page: the cloud, the little robot that walked away from it, the wheel that still turns
  const base = h - 74, ink = '#5a3a1c';
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  { // the cloud
    const cx = 112;
    ctx.beginPath(); ctx.moveTo(cx - 7, base); ctx.quadraticCurveTo(cx - 3, base - 26, cx - 12, base - 38); ctx.moveTo(cx + 7, base); ctx.quadraticCurveTo(cx + 3, base - 26, cx + 12, base - 38); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - 15, base - 44, 12, 2.2, 5.6); ctx.arc(cx, base - 56, 15, 3.5, 5.9); ctx.arc(cx + 15, base - 44, 12, 3.9, 7.2); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 30, base); ctx.lineTo(cx + 30, base); ctx.stroke();
  }
  { // the robot, walking
    const cx = w / 2;
    ctx.strokeRect(cx - 11, base - 34, 22, 18); ctx.strokeRect(cx - 8, base - 15, 16, 13);
    ctx.beginPath(); ctx.moveTo(cx, base - 34); ctx.lineTo(cx, base - 43); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, base - 45, 2.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - 4.5, base - 26, 1.9, 0, 7); ctx.arc(cx + 4.5, base - 26, 1.9, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 4, base - 2); ctx.lineTo(cx - 8, base + 6); ctx.moveTo(cx + 4, base - 2); ctx.lineTo(cx + 9, base + 5); ctx.stroke();
    ctx.setLineDash([2, 7]); ctx.beginPath(); ctx.moveTo(150, base - 12); ctx.lineTo(cx - 24, base - 12); ctx.moveTo(cx + 24, base - 12); ctx.lineTo(w - 150, base - 12); ctx.stroke(); ctx.setLineDash([]);
  }
  { // the wheel
    const cx = w - 112, cy = base - 30, r = 26;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3, 0, 7); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - 16, base + 6); ctx.moveTo(cx, cy); ctx.lineTo(cx + 16, base + 6); ctx.stroke();
  }
  ctx.textAlign = 'center'; ctx.fillStyle = '#7b5a36'; ctx.font = `italic 600 15.5px ${SERIF}`;
  ctx.fillText('— told at the fair every evening since', w / 2, h - 40);
}

/** The banner of the arrival. */
function drawWelcome(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#8a1722'); g.addColorStop(1, '#5e0f18');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 8; ctx.strokeRect(6, 6, w - 12, h - 12);
  // (bulbs along the top and the bottom)
  for (let k = 0; k < 38; k++) for (const y of [20, h - 20]) { ctx.fillStyle = k % 2 ? '#fff6c8' : '#ffd166'; ctx.beginPath(); ctx.arc(26 + (k * (w - 52)) / 37, y, 4.6, 0, 7); ctx.fill(); }
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const text = 'WELCOME TO ATOMIC OASIS';
  shrink(ctx, text, w - 350, 112, 900, SERIF);
  ctx.fillStyle = '#2a0508'; ctx.fillText(text, w / 2 + 4, h / 2 + 7);
  ctx.fillStyle = '#ffe9a6'; ctx.fillText(text, w / 2, h / 2 + 3);
  for (const x of [92, w - 92]) { ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(x, h / 2, 56, 0, 7); ctx.fill(); trefoil(ctx, x, h / 2, 45, '#15130f'); }
}

/**
 * A little mushroom cloud, from the flash to the smoke that thins out: `frames` pictures side by side on one
 * strip (each `s` pixels square), shown one after the other like an animated picture.
 */
function drawPuffs(ctx, s, frames) {
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t)), rgb = (c, al = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${al})`;
  const HOT = [255, 246, 200], FIRE = [255, 170, 60], EMBER = [214, 84, 42], SMOKE = [112, 92, 96];
  for (let f = 0; f < frames; f++) {
    const p = f / frames, ox = f * s, cx = ox + s / 2, base = s * 0.93;
    const rise = Math.min(1, p / 0.5), cool = Math.min(1, Math.max(0, (p - 0.25) / 0.5)), fade = p > 0.72 ? 1 - (p - 0.72) / 0.28 : 1;
    ctx.save(); ctx.beginPath(); ctx.rect(ox, 0, s, s); ctx.clip();
    if (p < 0.2) { // the flash, on the ground
      const r = s * (0.12 + p * 2.1), fl = ctx.createRadialGradient(cx, base, 0, cx, base, r);
      fl.addColorStop(0, 'rgba(255, 255, 245, 1)'); fl.addColorStop(0.45, 'rgba(255, 224, 130, 0.85)'); fl.addColorStop(1, 'rgba(255, 150, 40, 0)');
      ctx.fillStyle = fl; ctx.beginPath(); ctx.arc(cx, base, r, Math.PI, 0); ctx.fill();
    }
    const top = base - s * 0.6 * rise, cap = s * (0.09 + 0.2 * rise), stem = s * (0.035 + 0.045 * rise);
    const outer = mix(mix(FIRE, EMBER, cool), SMOKE, Math.max(0, cool * 1.4 - 0.5)), inner = mix(HOT, mix(FIRE, EMBER, cool), cool);
    ctx.globalAlpha = fade;
    ctx.fillStyle = rgb(mix(outer, [60, 44, 50], 0.25)); ctx.beginPath(); ctx.ellipse(cx, base, s * (0.1 + 0.2 * rise), s * 0.05, 0, Math.PI, 0); ctx.fill(); // the skirt of dust
    ctx.fillStyle = rgb(outer); ctx.fillRect(cx - stem, top, stem * 2, base - top); // the stem
    ctx.fillStyle = rgb(inner, 0.9); ctx.fillRect(cx - stem * 0.45, top, stem * 0.9, base - top);
    for (const [dx, dy, k] of [[-0.62, 0.2, 0.68], [0.62, 0.2, 0.68], [0, 0, 1], [-0.3, -0.34, 0.6], [0.3, -0.34, 0.6]]) { ctx.fillStyle = rgb(outer); ctx.beginPath(); ctx.arc(cx + dx * cap, top + dy * cap, cap * k, 0, 7); ctx.fill(); }
    ctx.fillStyle = rgb(inner, 0.95 - cool * 0.5); ctx.beginPath(); ctx.arc(cx, top + cap * 0.06, cap * (0.62 - cool * 0.22), 0, 7); ctx.fill();
    ctx.fillStyle = rgb(mix(outer, [40, 30, 36], 0.3), 0.55); ctx.beginPath(); ctx.ellipse(cx, top + cap * 0.62, cap * 1.12, cap * 0.2, 0, 0, 7); ctx.fill(); // the shadow under the cap
    ctx.restore();
  }
}

/** The board of the sponsors: every game, and who sponsors it — or what it takes. rows: [{ game, sponsor, offer }]. */
function drawAds(ctx, w, h, rows) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#7a1420'); g.addColorStop(1, '#4d0c16');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 10; ctx.strokeRect(7, 7, w - 14, h - 14);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillStyle = '#ffe9a6';
  ctx.fillText(shrink(ctx, 'SPONSOR A GAME', w - 80, 58, 900, SERIF), w / 2, 56);
  ctx.fillStyle = '#f2c14e';
  ctx.fillText(shrink(ctx, 'YOUR NAME OVER ITS BOARD OF SCORES — THE HIGHEST BID HOLDS IT', w - 80, 19, 700, SANS), w / 2, 100);
  const list = rows && rows.length ? rows : [{ game: '…', sponsor: '', offer: '' }], cols = list.length > 7 ? 2 : 1, per = Math.ceil(list.length / cols);
  const top = 126, lh = (h - top - 26) / per, cw = (w - 52) / cols;
  list.forEach((r, i) => {
    const x = 26 + Math.floor(i / per) * cw, y = top + (i % per) * lh;
    ctx.fillStyle = (i % per) % 2 ? 'rgba(0, 0, 0, 0.16)' : 'rgba(0, 0, 0, 0.3)'; rounded(ctx, x + 3, y + 2, cw - 6, lh - 4, 8); ctx.fill();
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff';
    ctx.fillText(shrink(ctx, r.game, cw * 0.48, 22, 800, SANS), x + 14, y + lh / 2 + 1);
    ctx.textAlign = 'right'; ctx.fillStyle = r.sponsor ? '#ffe27a' : '#f0b9a8';
    ctx.fillText(shrink(ctx, r.sponsor || r.offer || 'free', cw * 0.46, 20, r.sponsor ? 800 : 500, SANS), x + cw - 14, y + lh / 2 + 1);
  });
}

/**
 * Builds them in the games zone. Returns { news: [{ x, z, date }], welcome: { x, z }, rules: { x, z }, ads: { x, z, reach, set(rows) }, arcade: { x, z,
 * yaw, reach, board }, update(pos) }: `ads` is where one stands to ask at the booth (`set` redraws its
 * board), `arcade` where one stands to play (facing `yaw`), with the board of its scores.
 */
export function buildNotices(zone) {
  const parts = new Parts(), wood = parts.get('woodDark'), paint = parts.get('paint'), cloth = parts.get('doubleSided'), glow = parts.get('glow');
  const meshes = [];
  // ---- what is new: by the poppy field, a board for each of the latest days something changed (the newest to
  // the left of who reads them), each on two posts under a little roof, a lamp at each end. (All of it apart from
  // the rest — pieces of its own, a group of its own —: the owner may take the three boards away and bring them
  // back while the game runs, with the switch `newsBoards` of /admin: setNews below.)
  const n = NOTICES.news, days = NEWS.slice(0, 3), newsAt = [];
  const newsParts = new Parts(), nwood = newsParts.get('woodDark'), ncloth = newsParts.get('doubleSided'), nglow = newsParts.get('glow');
  const newsGroup = new THREE.Group(), newsBoards = [], newsPosts = [];
  newsGroup.name = 'notice-news-boards';
  days.forEach((day, i) => {
    const k = i - (days.length - 1) / 2, W = 2.2, H = 2.75;
    // (on an arc: each turned a little towards the one in the middle)
    const yaw = n.yaw - k * 0.2, ax = Math.cos(n.yaw), az = -Math.sin(n.yaw), fx = Math.sin(n.yaw), fz = Math.cos(n.yaw);
    const x = n.x + ax * k * n.gap + fx * k * k * 0.45, z = n.z + az * k * n.gap + fz * k * k * 0.45, y = zone.ground(x, z);
    const board = canvasBoard(560, 700, (ctx, w, h) => drawNews(ctx, w, h, day, i === 0), W, H, { both: true });
    board.mesh.position.set(x, y + 0.7 + H / 2, z);
    board.mesh.rotation.y = yaw;
    board.mesh.name = `notice-news${i}`;
    newsBoards.push(board.mesh);
    newsGroup.add(board.mesh);
    for (const b of [nwood, ncloth, nglow]) b.place(x, y, z, yaw);
    for (const s of [-1, 1]) {
      nwood.tint(1.05, 0.92, 0.75, 1).box(s * (W / 2 + 0.1) - 0.08, -0.5, -0.08, s * (W / 2 + 0.1) + 0.08, 0.7 + H + 0.35, 0.08, { tile: 1 });
      nglow.tint(1.0, 0.86, 0.5, 1).place(s * (W / 2 + 0.1), 0.7 + H + 0.42, 0).lathe([[0.0, 0.0], [0.1, 0.05], [0.12, 0.17], [0.06, 0.27], [0.0, 0.3]], 7).pop();
    }
    nwood.tint(1.05, 0.92, 0.75, 1).box(-W / 2 - 0.2, 0.7 + H + 0.04, -0.06, W / 2 + 0.2, 0.7 + H + 0.16, 0.06, { tile: 1 });
    for (let q = 0; q < 8; q++) { // (a striped canopy over it)
      const c = q % 2 ? [0.97, 0.95, 0.9] : [0.1, 0.55, 0.6], x0 = -W / 2 - 0.3 + (q * (W + 0.6)) / 8, x1 = x0 + (W + 0.6) / 8;
      ncloth.tint(c[0], c[1], c[2], 1).quad(V(x0, 0.7 + H + 0.2, 0.55), V(x1, 0.7 + H + 0.2, 0.55), V(x1, 0.7 + H + 0.5, 0), V(x0, 0.7 + H + 0.5, 0)).quad(V(x1, 0.7 + H + 0.2, -0.55), V(x0, 0.7 + H + 0.2, -0.55), V(x0, 0.7 + H + 0.5, 0), V(x1, 0.7 + H + 0.5, 0));
    }
    for (const b of [nwood, ncloth, nglow]) b.pop();
    const bx = Math.cos(yaw), bz = -Math.sin(yaw);
    // (its two posts: what one bumps into there — let go of when the boards are taken away)
    for (const s of [-1, 1]) { const post = { type: 'circle', x: x + bx * s * (W / 2 + 0.1), z: z + bz * s * (W / 2 + 0.1), r: 0.2 }; zone.colliders.push(post); newsPosts.push(post); }
    newsAt.push({ x: x + Math.sin(yaw) * 2.2, z: z + Math.cos(yaw) * 2.2, date: day.date });
  });
  {
    // (their posts, roofs and lamps: in the shadows that are drawn once, like everything that stands still — drawn
    // again when the boards come or go — and not in the reflections of the water, like the rest of the fair's notices)
    const posts = newsParts.toMeshes(zone.world.materials, { name: 'notice-news-posts', layers: zone.cast });
    posts.traverse((o) => { if (o.isMesh) o.layers.disable(LAYER.REFLECT); });
    newsGroup.add(posts);
    zone.group.add(newsGroup);
    newsGroup.updateMatrixWorld(true);
  }
  // ---- where one arrives: a banner across the lane — a little mushroom cloud puffs over each of its posts, again
  // and again, like an animated picture — and, to the left, the rules of the fair
  const wl = NOTICES.welcome, FRAMES = 12;
  let puffs = null;
  {
    const ax = Math.cos(wl.yaw), az = -Math.sin(wl.yaw), posts = [-1, 1].map((s) => { const x = wl.x + ax * s * wl.half, z = wl.z + az * s * wl.half; return { x, z, y: zone.ground(x, z) }; });
    const y0 = Math.max(posts[0].y, posts[1].y, zone.ground(wl.x, wl.z)), LOW = 3.05, BH = 1.36, W = wl.half * 2 - 0.3;
    const banner = canvasBoard(1280, 246, drawWelcome, W, BH, { both: true });
    banner.mesh.position.set(wl.x, y0 + LOW + BH / 2, wl.z);
    banner.mesh.rotation.y = wl.yaw;
    banner.mesh.name = 'notice-welcome';
    meshes.push(banner.mesh);
    // (the strip of the little clouds: one picture, shown a frame at a time — a frame later over the other post)
    const strip = document.createElement('canvas');
    strip.width = FRAMES * 96; strip.height = 96;
    drawPuffs(strip.getContext('2d'), 96, FRAMES);
    const first = new THREE.CanvasTexture(strip);
    first.colorSpace = THREE.SRGBColorSpace;
    first.repeat.set(1 / FRAMES, 1);
    const second = first.clone();
    second.needsUpdate = true;
    const quad = new THREE.PlaneGeometry(2.3, 2.3);
    puffs = { textures: [first, second], frame: -1, x: wl.x, z: wl.z };
    posts.forEach((q, i) => {
      wood.tint(0.5, 0.36, 0.26, 1).box(q.x - 0.09, q.y - 0.5, q.z - 0.09, q.x + 0.09, y0 + LOW + BH + 0.12, q.z + 0.09, { tile: 1 });
      paint.tint(1.5, 1.05, 0.25, 1).place(q.x, y0 + LOW + BH + 0.12, q.z).lathe([[0.0, 0.0], [0.13, 0.04], [0.15, 0.12], [0.07, 0.2], [0.0, 0.22]], 8).pop();
      const m = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ map: puffs.textures[i], transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.position.set(q.x, y0 + LOW + BH + 0.28 + 1.15 * 0.93, q.z);
      m.rotation.y = wl.yaw;
      m.name = `notice-puff${i}`;
      m.renderOrder = 2;
      meshes.push(m);
      zone.colliders.push({ type: 'circle', x: q.x, z: q.z, r: 0.2 });
    });
  }
  const ru = NOTICES.rules, ry = zone.ground(ru.x, ru.z);
  let rules = null; // (the board of the rules: painted again when the boards of what is new come or go)
  {
    const W = 2.3, H = 2.9, board = canvasBoard(580, 732, drawRules, W, H, { both: true });
    rules = board;
    board.mesh.position.set(ru.x, ry + 0.7 + H / 2, ru.z);
    board.mesh.rotation.y = ru.yaw;
    board.mesh.name = 'notice-rules';
    meshes.push(board.mesh);
    for (const b of [wood, paint, cloth, glow]) b.place(ru.x, ry, ru.z, ru.yaw);
    for (const s of [-1, 1]) {
      wood.tint(1.05, 0.92, 0.75, 1).box(s * (W / 2 + 0.1) - 0.08, -0.5, -0.08, s * (W / 2 + 0.1) + 0.08, 0.7 + H + 0.35, 0.08, { tile: 1 });
      glow.tint(1.0, 0.86, 0.5, 1).place(s * (W / 2 + 0.1), 0.7 + H + 0.42, 0).lathe([[0.0, 0.0], [0.1, 0.05], [0.12, 0.17], [0.06, 0.27], [0.0, 0.3]], 7).pop();
    }
    wood.tint(1.05, 0.92, 0.75, 1).box(-W / 2 - 0.2, 0.7 + H + 0.04, -0.06, W / 2 + 0.2, 0.7 + H + 0.16, 0.06, { tile: 1 });
    for (let q = 0; q < 8; q++) {
      const c = q % 2 ? [0.97, 0.95, 0.9] : [0.72, 0.16, 0.2], x0 = -W / 2 - 0.3 + (q * (W + 0.6)) / 8, x1 = x0 + (W + 0.6) / 8;
      cloth.tint(c[0], c[1], c[2], 1).quad(V(x0, 0.7 + H + 0.2, 0.55), V(x1, 0.7 + H + 0.2, 0.55), V(x1, 0.7 + H + 0.5, 0), V(x0, 0.7 + H + 0.5, 0)).quad(V(x1, 0.7 + H + 0.2, -0.55), V(x0, 0.7 + H + 0.2, -0.55), V(x0, 0.7 + H + 0.5, 0), V(x1, 0.7 + H + 0.5, 0));
    }
    for (const b of [wood, paint, cloth, glow]) b.pop();
    const bx = Math.cos(ru.yaw), bz = -Math.sin(ru.yaw);
    for (const s of [-1, 1]) zone.colliders.push({ type: 'circle', x: ru.x + bx * s * (W / 2 + 0.1), z: ru.z + bz * s * (W / 2 + 0.1), r: 0.2 });
  }
  // ---- to the right of the arrival: how it came to this — an old page under a little roof of planks
  const st = NOTICES.story, sy = zone.ground(st.x, st.z);
  {
    const W = 2.3, H = 2.9, board = canvasBoard(580, 732, drawStory, W, H, { both: true });
    board.mesh.position.set(st.x, sy + 0.62 + H / 2, st.z);
    board.mesh.rotation.y = st.yaw;
    board.mesh.name = 'notice-story';
    meshes.push(board.mesh);
    wood.place(st.x, sy, st.z, st.yaw);
    for (const s of [-1, 1]) wood.tint(0.62, 0.46, 0.32, 1).box(s * (W / 2 + 0.1) - 0.08, -0.5, -0.08, s * (W / 2 + 0.1) + 0.08, 0.62 + H + 0.2, 0.08, { tile: 1 });
    wood.tint(0.62, 0.46, 0.32, 1).box(-W / 2 - 0.18, 0.62 - 0.14, -0.05, W / 2 + 0.18, 0.62 - 0.04, 0.05, { tile: 1 });
    // (the roof: two planks, sloping to the front and to the back)
    const top = 0.62 + H + 0.2;
    wood.tint(0.5, 0.36, 0.25, 1).quad(V(-W / 2 - 0.34, top - 0.04, 0.5), V(W / 2 + 0.34, top - 0.04, 0.5), V(W / 2 + 0.34, top + 0.3, 0), V(-W / 2 - 0.34, top + 0.3, 0))
      .quad(V(W / 2 + 0.34, top - 0.04, -0.5), V(-W / 2 - 0.34, top - 0.04, -0.5), V(-W / 2 - 0.34, top + 0.3, 0), V(W / 2 + 0.34, top + 0.3, 0))
      .quad(V(W / 2 + 0.34, top - 0.04, 0.5), V(-W / 2 - 0.34, top - 0.04, 0.5), V(-W / 2 - 0.34, top + 0.26, 0), V(W / 2 + 0.34, top + 0.26, 0))
      .quad(V(-W / 2 - 0.34, top - 0.04, -0.5), V(W / 2 + 0.34, top - 0.04, -0.5), V(W / 2 + 0.34, top + 0.26, 0), V(-W / 2 - 0.34, top + 0.26, 0));
    wood.pop();
    const bx = Math.cos(st.yaw), bz = -Math.sin(st.yaw);
    for (const s of [-1, 1]) zone.colliders.push({ type: 'circle', x: st.x + bx * s * (W / 2 + 0.1), z: st.z + bz * s * (W / 2 + 0.1), r: 0.2 });
  }
  // ---- the easels: two frames of planks leaning on each other, a few words and an arrow painted on both. Low
  // (they hide nothing of what is behind) and read without a step. One beside whoever arrives, on the left of the
  // lane: PLAY ON THE BEACH! — its arrow shows the way one walks. One in a flower bed of the rock garden: GET LIFE
  // ADVICE — Billy is on his deck. The two faces of an easel are one mesh and one picture; its wood goes with the
  // rest. Each face has the arrow that is true from where it is read: a turn round when the place is behind.
  const easels = [
    { name: 'notice-beach', at: NOTICES.beach, to: NOTICES.beach.to, far: NOTICES.beach.far, lines: ['PLAY ON', 'THE BEACH!'], under: 'GAMES · THE PIER', behind: 'THE BEACH', words: 'PLAY ON THE BEACH! · GAMES · THE PIER' },
    { name: 'notice-advice', at: NOTICES.advice, to: WAYS.billy.at, far: WAYS.billy.at, lines: ['GET LIFE', 'ADVICE'], under: 'ASK BILLY', behind: 'ASK BILLY', words: 'GET LIFE ADVICE · ASK BILLY' },
  ];
  for (const easel of easels) {
    const ad = easel.at, ady = zone.ground(ad.x, ad.z);
    const W = 1.0, L = 1.3, FOOT = 0.14, LEAN = 0.21, sin = Math.sin(LEAN), cos = Math.cos(LEAN), reach = (FOOT + L + 0.03) * sin;
    const far = Math.hypot(easel.far[0] - ad.x, easel.far[1] - ad.z), metres = `${Math.round(far / 10) * 10} M`;
    // (which way the arrow of a face turns: whoever reads the front looks the way its back looks, and the other way round)
    const tx = easel.to[0] - ad.x, tz = easel.to[1] - ad.z, nx = Math.sin(ad.yaw), nz = Math.cos(ad.yaw);
    const turnOf = (fx, fz) => { const a = Math.atan2(tx * -fz + tz * fx, tx * fx + tz * fz); return Math.abs(a) > 2.0 ? null : a; };
    const face = (turn) => ({ lines: easel.lines, turn, under: turn === null ? `${easel.behind} · BEHIND YOU` : `${easel.under} · ${metres}`, seed: easel.name });
    const canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 390;
    const ctx = canvas.getContext('2d');
    drawEasel(ctx, 0, 300, 390, face(turnOf(-nx, -nz))); drawEasel(ctx, 300, 300, 390, face(turnOf(nx, nz)));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const pos = [], uv = [], idx = [];
    for (const s of [1, -1]) {
      // (a point of a face: `x` across, `t` up its slope from the ground, a hair in front of its planks)
      const P = (x, t) => [x, t * cos + 0.012 * sin, s * (reach - t * sin + 0.012 * cos)], base = pos.length / 3, u0 = s > 0 ? 0 : 0.5;
      pos.push(...P(-s * W / 2, FOOT), ...P(s * W / 2, FOOT), ...P(s * W / 2, FOOT + L), ...P(-s * W / 2, FOOT + L));
      uv.push(u0, 0, u0 + 0.5, 0, u0 + 0.5, 1, u0, 1);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(idx);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    mesh.position.set(ad.x, ady, ad.z);
    mesh.rotation.y = ad.yaw;
    mesh.name = easel.name;
    mesh.userData.words = `${easel.words} · ${metres}`;
    mesh.userData.turns = [turnOf(-nx, -nz), turnOf(nx, nz)]; // (the arrow of its front, of its back: radians to the right, or null — a turn round)
    meshes.push(mesh);
    wood.place(ad.x, ady, ad.z, ad.yaw);
    for (const s of [1, -1]) {
      // (a frame, leaning: its two stiles from the ground to the top, the board its planks are nailed to, a rail above)
      wood.place(0, 0, s * reach, s > 0 ? 0 : Math.PI, -LEAN, 0);
      for (const sx of [-1, 1]) wood.tint(0.62, 0.46, 0.32, 1).box(sx * (W / 2 + 0.035) - 0.035, -0.03, -0.05, sx * (W / 2 + 0.035) + 0.035, FOOT + L + 0.03, 0, { tile: 1 });
      wood.tint(0.5, 0.37, 0.26, 1).box(-W / 2, FOOT, -0.03, W / 2, FOOT + L, 0.004, { tile: 1, faces: 'zyY' });
      wood.tint(0.62, 0.46, 0.32, 1).box(-W / 2, FOOT + L, -0.05, W / 2, FOOT + L + 0.03, 0, { tile: 1, faces: 'zZY' });
      wood.pop();
    }
    // (what holds the two together: a ridge at the top, a lath on each side lower down)
    const top = (FOOT + L + 0.03) * cos;
    wood.tint(0.5, 0.37, 0.26, 1).box(-W / 2 - 0.09, top - 0.035, -0.06, W / 2 + 0.09, top + 0.03, 0.06, { tile: 1 });
    for (const sx of [-1, 1]) wood.tint(0.5, 0.37, 0.26, 1).box(sx * (W / 2 + 0.035) - 0.012, 0.42, -(reach - 0.44 * Math.tan(LEAN)) + 0.04, sx * (W / 2 + 0.035) + 0.012, 0.46, reach - 0.44 * Math.tan(LEAN) - 0.04, { tile: 1 });
    wood.pop();
    zone.colliders.push({ type: 'circle', x: ad.x, z: ad.z, r: 0.5 });
  }
  // ---- the booth of the sponsors: a counter under a striped awning, its board above the awning
  const a = NOTICES.ads, ay = zone.ground(a.x, a.z), state = { rows: null };
  const ads = canvasBoard(896, 600, (ctx, w, h) => drawAds(ctx, w, h, state.rows), 3.9, 2.6, { both: true });
  {
    ads.mesh.position.set(a.x, ay + 3.55 + 1.3, a.z);
    ads.mesh.rotation.y = a.yaw;
    ads.mesh.name = 'notice-ads';
    meshes.push(ads.mesh);
    const RED = [0.8, 0.14, 0.14], WHITE = [0.97, 0.95, 0.9];
    for (const b of [wood, paint, cloth, glow]) b.place(a.x, ay, a.z, a.yaw);
    wood.tint(0.9, 0.8, 0.66, 1).box(-2.1, -0.2, -1.3, 2.1, 0.1, 1.3, { tile: 1 });
    for (let s = 0; s < 8; s++) { const c = s % 2 ? WHITE : RED; paint.tint(c[0], c[1], c[2], 1).box(-2 + s * 0.5, 0.1, 1.2, -1.5 + s * 0.5, 1.05, 1.26, { faces: 'Z' }); }
    paint.tint(RED[0] * 0.7, RED[1] * 0.7, RED[2] * 0.7, 1).box(-2, 0.1, -1.25, 2, 1.05, 1.2, { faces: 'xXz' });
    wood.tint(0.9, 0.8, 0.66, 1).box(-2.1, 1.05, -1.3, 2.1, 1.12, 1.4, { tile: 1 });
    paint.tint(0.95, 0.94, 0.9, 1);
    for (const [px, pz] of [[-1.95, -1.2], [1.95, -1.2], [1.95, 1.2], [-1.95, 1.2]]) paint.box(px - 0.05, 1.05, pz - 0.05, px + 0.05, 2.5, pz + 0.05);
    for (const px of [-1.95, 1.95]) paint.box(px - 0.05, 2.5, -0.05, px + 0.05, 3.6, 0.05); // (what carries the board)
    paint.tint(RED[0] * 0.6, RED[1] * 0.6, RED[2] * 0.6, 1).box(-2, 1.12, -1.25, 2, 2.5, -1.2, { faces: 'zZ' });
    for (let s = 0; s < 12; s++) {
      const c = s % 2 ? WHITE : RED, x0 = -2.5 + (s * 5) / 12, x1 = x0 + 5 / 12;
      cloth.tint(c[0] * 1.1, c[1] * 1.1, c[2] * 1.1, 1).quad(V(x0, 2.45, 1.9), V(x1, 2.45, 1.9), V(x1, 3.35, 0), V(x0, 3.35, 0)).quad(V(x1, 2.45, -1.7), V(x0, 2.45, -1.7), V(x0, 3.35, 0), V(x1, 3.35, 0));
      cloth.tri(V(x0, 2.45, 1.9), V((x0 + x1) / 2, 2.18, 1.9), V(x1, 2.45, 1.9));
    }
    cloth.tint(RED[0], RED[1], RED[2], 1).tri(V(-2.5, 2.45, 1.9), V(-2.5, 2.45, -1.7), V(-2.5, 3.35, 0)).tri(V(2.5, 2.45, -1.7), V(2.5, 2.45, 1.9), V(2.5, 3.35, 0));
    // (on the counter: a brass bell, a pile of leaflets; bulbs along the top of the board)
    paint.tint(1.5, 1.05, 0.25, 1).place(-1.2, 1.12, 0.9).lathe([[0.12, 0.0], [0.11, 0.05], [0.06, 0.13], [0.0, 0.15]], 9).pop();
    paint.tint(1.4, 1.38, 1.3, 1).box(0.7, 1.12, 0.6, 1.3, 1.2, 1.05);
    for (let k = 0; k < 13; k++) glow.tint(1.0, 0.86, 0.5, 1).place(-1.8 + k * 0.3, 3.55 + 2.68, 0).lathe([[0.0, -0.06], [0.055, 0.0], [0.0, 0.06]], 6).pop();
    // the name of the place, painted on a plank that hangs from the awning on two cords
    for (const px of [-1.15, 1.15]) wood.tint(0.4, 0.3, 0.22, 1).box(px - 0.012, 2.1, 1.93, px + 0.012, 2.34, 1.955);
    // a red carpet up to the counter, between brass posts and their ropes: business is business
    paint.tint(0.74, 0.07, 0.1, 1).box(-1.05, 0, 1.45, 1.05, 0.025, 5.6, { faces: 'XxZY' });
    for (const s of [-1, 1]) {
      paint.tint(1.45, 1.0, 0.24, 1).box(s * 1.05 - 0.05, 0, 1.45, s * 1.05 + 0.05, 0.03, 5.6, { faces: 'XxZY' });
      for (const pz of [2.55, 5.35]) {
        paint.tint(1.5, 1.05, 0.25, 1).place(s * 1.5, 0, pz).lathe([[0.15, 0.0], [0.15, 0.03], [0.035, 0.06], [0.03, 0.84], [0.065, 0.88], [0.065, 0.95], [0.0, 1.0]], 8).pop();
        zone.colliders.push({ type: 'circle', x: a.x + Math.cos(a.yaw) * s * 1.5 + Math.sin(a.yaw) * pz, z: a.z - Math.sin(a.yaw) * s * 1.5 + Math.cos(a.yaw) * pz, r: 0.16 });
      }
      // (the rope hangs a little between its two posts)
      const sag = [[2.55, 0.9], [3.25, 0.76], [3.95, 0.71], [4.65, 0.76], [5.35, 0.9]];
      for (let k = 1; k < sag.length; k++) paint.tint(0.62, 0.05, 0.09, 1).rod(V(s * 1.5, sag[k - 1][1], sag[k - 1][0]), V(s * 1.5, sag[k][1], sag[k][0]), 0.022, 5);
    }
    for (const b of [wood, paint, cloth, glow]) b.pop();
    zone.colliders.push({ type: 'box', x: a.x, z: a.z, hw: 2.15, hl: 1.4, yaw: a.yaw });
    const name = canvasBoard(600, 108, (ctx, w, h) => {
      paintPlank(ctx, 0, 0, w, h, 'trading');
      ctx.strokeStyle = 'rgba(40, 22, 8, 0.55)'; ctx.lineWidth = 5; ctx.strokeRect(2.5, 2.5, w - 5, h - 5);
      paintWords(ctx, TRADING.name.toUpperCase(), w / 2, h / 2 + 27, 54, { align: 'center', seed: 'trading' });
    }, 2.8, 0.5, { both: true });
    name.mesh.position.set(a.x + Math.sin(a.yaw) * 1.945, ay + 1.86, a.z + Math.cos(a.yaw) * 1.945);
    name.mesh.rotation.y = a.yaw;
    name.mesh.name = 'notice-trading';
    meshes.push(name.mesh);
  }
  // ---- the arcade cabinet: a screen that shows the title of its game, a marquee, a stick and two buttons
  const c = NOTICES.arcade, [cx, cz] = pierToWorld(c.along, c.side), cy = PIER.deckY, cyaw = -PIER.heading + (c.side > 0 ? Math.PI : 0);
  const BIG = 1.25; // (a cabinet for robots with a big head: a quarter larger than the ones of the old days)
  let runBoard = null;
  {
    const screen = canvasBoard(256, 144, arcadeTitle, 0.8, 0.45);
    const marquee = canvasBoard(256, 56, (ctx, w, h) => {
      ctx.fillStyle = '#1a1020'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = "bold 30px 'Courier New', monospace";
      ctx.fillStyle = '#ff5a48'; ctx.fillText('MELTDOWN', w * 0.37, h / 2 + 1); ctx.fillStyle = '#ffe9a6'; ctx.fillText('RUN', w * 0.83, h / 2 + 1);
    }, 0.92, 0.2);
    const g = new THREE.Group();
    g.position.set(cx, cy, cz); g.rotation.y = cyaw; g.scale.setScalar(BIG); g.name = 'notice-arcade';
    screen.mesh.position.set(0, 1.42, 0.064); marquee.mesh.position.set(0, 1.93, 0.172);
    g.add(screen.mesh, marquee.mesh);
    meshes.push(g);
    for (const b of [paint, glow]) b.place(cx, cy, cz, cyaw).push(new THREE.Matrix4().makeScale(BIG, BIG, BIG));
    paint.tint(0.22, 0.1, 0.32, 1).box(-0.5, 0, -0.45, 0.5, 0.98, 0.32).box(-0.5, 0.98, -0.45, 0.5, 1.78, 0.05).box(-0.5, 1.78, -0.45, 0.5, 2.08, 0.16);
    paint.tint(0.06, 0.05, 0.1, 1).box(-0.45, 1.15, 0.05, 0.45, 1.69, 0.058, { faces: 'Z' });
    paint.tint(0.13, 0.11, 0.18, 1).quad(V(-0.5, 0.98, 0.32), V(0.5, 0.98, 0.32), V(0.5, 1.12, 0.05), V(-0.5, 1.12, 0.05));
    for (const s of [-1, 1]) { // the cheeks: yellow, a black band, a green dot
      paint.tint(1.3, 1.0, 0.1, 1).box(s > 0 ? 0.5 : -0.54, 0, -0.47, s > 0 ? 0.54 : -0.5, 2.1, 0.36);
      paint.tint(0.07, 0.07, 0.07, 1).box(s > 0 ? 0.54 : -0.55, 0.7, -0.47, s > 0 ? 0.55 : -0.54, 0.95, 0.36, { faces: s > 0 ? 'X' : 'x' });
      glow.tint(0.35, 1.5, 0.3, 1).box(s > 0 ? 0.54 : -0.555, 1.5, -0.14, s > 0 ? 0.555 : -0.54, 1.72, 0.08, { faces: s > 0 ? 'X' : 'x' });
    }
    paint.tint(0.08, 0.08, 0.08, 1).cylinder(-0.22, 1.05, 0.18, 0.016, 0.016, 0.13, 6);
    paint.tint(1.2, 0.15, 0.1, 1).place(-0.22, 1.2, 0.18).lathe([[0.0, -0.04], [0.04, 0.0], [0.0, 0.04]], 7).pop();
    glow.tint(1.4, 0.25, 0.2, 1).cylinder(0.1, 1.045, 0.2, 0.035, 0.035, 0.02, 8);
    glow.tint(0.3, 1.3, 0.4, 1).cylinder(0.25, 1.06, 0.17, 0.035, 0.035, 0.02, 8);
    for (const b of [paint, glow]) b.pop().pop();
    zone.colliders.push({ type: 'box', x: cx, z: cz, hw: 0.62 * BIG, hl: 0.5 * BIG, yaw: cyaw });
    // its board of scores: across the walk, facing it
    const [bx, bz] = pierToWorld(c.along, -Math.sign(c.side) * 7.25);
    runBoard = zone.scoreStand('run', bx, bz, cyaw + Math.PI, { title: 'MELTDOWN RUN', sub: 'The longest run away from the reactor', format: (s) => `${s} m`, width: 2.7, y: cy, pixels: 0.75 });
  }
  // ---- the wooden signposts, at the forks of the paths (their posts are of the same wood as the rest)
  const signs = buildSignposts(zone, wood, zone.race?.paddock ? { race: [zone.race.paddock.x, zone.race.paddock.z] } : {});
  zone.group.add(signs.mesh);
  zone._add(parts, 'notices');
  for (const m of meshes) zone.group.add(m);
  const front = (p, d) => ({ x: p.x + Math.sin(p.yaw) * d, z: p.z + Math.cos(p.yaw) * d });
  return {
    signposts: signs.posts, // (the wooden signposts: [{ id, x, z, arms: [{ to, text, under, far, yaw }] }])
    news: newsAt, // (where one stands to read each board, the newest first: [{ x, z, date }])
    welcome: { x: wl.x, z: wl.z }, rules: front(ru, 2.2), story: front(st, 2.2), beach: front(NOTICES.beach, 2), advice: front(NOTICES.advice, 2),
    arcade: { ...front({ x: cx, z: cz, yaw: cyaw }, 1.2), yaw: cyaw + Math.PI, reach: 1.8, board: runBoard },
    ads: { ...front(a, 2.4), reach: 2.6, set(rows) { state.rows = rows; ads.redraw(); } },
    /**
     * The boards of what is new are up (on: true) or taken away — posts, roofs and lamps with them, and what one
     * bumped into there (the switch `newsBoards`; main.js asks at every word from the server: nothing is done when
     * nothing changes). The shadows that are drawn once are drawn again; the rules stop pointing to them.
     */
    setNews(on) {
      on = on !== false;
      if (newsGroup.visible === on) return;
      newsGroup.visible = on;
      for (const p of newsPosts) if (p.handle) p.handle[3] = on ? (p.y0 ?? -1e9) : 1e9;
      newsShown = on;
      rules?.redraw();
      zone.world.bakeShadows?.();
    },
    /** Are the boards of what is new up? (And their posts, as the collisions keep them: for the checks.) */
    get newsUp() { return newsGroup.visible; },
    newsPosts,
    update(pos, time = 0) {
      for (const m of meshes) m.visible = (pos.x - m.position.x) ** 2 + (pos.z - m.position.z) ** 2 < 230 * 230;
      for (const m of newsBoards) m.visible = (pos.x - m.position.x) ** 2 + (pos.z - m.position.z) ** 2 < 230 * 230;
      // (the little clouds: a new picture seven times a second, while somebody is near enough to see them)
      if (puffs && (pos.x - puffs.x) ** 2 + (pos.z - puffs.z) ** 2 < 90 * 90) {
        const f = Math.floor(time * 7) % FRAMES;
        if (f !== puffs.frame) { puffs.frame = f; puffs.textures[0].offset.x = f / FRAMES; puffs.textures[1].offset.x = ((f + 5) % FRAMES) / FRAMES; }
      }
    },
  };
}
