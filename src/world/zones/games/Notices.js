// Things to read at the fair. Where one arrives: a banner of welcome across the lane, a little mushroom cloud
// puffing over each of its posts, and the rules of the fair on a board to the left (there are hardly any).
// By the poppy field, west of the lane: the boards of what is new, one for each of the latest days something
// changed (the list is app/news.js). On the way to the mill: the booth of the sponsors — every game, who
// sponsors it, what it takes to take its panel (the game opens the list there: see main.js). And, at the top
// of the ramp of the pier, the arcade cabinet (its game is ui/Arcade.js) with its board of scores.
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';
import { canvasBoard } from './Boards.js';
import { NEWS } from '../../../app/news.js';
import { arcadeTitle } from '../../../ui/Arcade.js';
import { NOTICES, PIER, pierToWorld } from '../../layout/layout.js';

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
  ctx.fillStyle = '#9fd8c8'; ctx.font = `600 14.5px ${SANS}`;
  ctx.fillText('The news of the fair: on the boards by the poppies, behind you.', w / 2, h - foot + 46, w - 40);
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
  // the left of who reads them), each on two posts under a little roof, a lamp at each end
  const n = NOTICES.news, days = NEWS.slice(0, 3), newsAt = [];
  days.forEach((day, i) => {
    const k = i - (days.length - 1) / 2, W = 2.2, H = 2.75;
    // (on an arc: each turned a little towards the one in the middle)
    const yaw = n.yaw - k * 0.2, ax = Math.cos(n.yaw), az = -Math.sin(n.yaw), fx = Math.sin(n.yaw), fz = Math.cos(n.yaw);
    const x = n.x + ax * k * n.gap + fx * k * k * 0.45, z = n.z + az * k * n.gap + fz * k * k * 0.45, y = zone.ground(x, z);
    const board = canvasBoard(560, 700, (ctx, w, h) => drawNews(ctx, w, h, day, i === 0), W, H, { both: true });
    board.mesh.position.set(x, y + 0.7 + H / 2, z);
    board.mesh.rotation.y = yaw;
    board.mesh.name = `notice-news${i}`;
    meshes.push(board.mesh);
    for (const b of [wood, paint, cloth, glow]) b.place(x, y, z, yaw);
    for (const s of [-1, 1]) {
      wood.tint(1.05, 0.92, 0.75, 1).box(s * (W / 2 + 0.1) - 0.08, -0.5, -0.08, s * (W / 2 + 0.1) + 0.08, 0.7 + H + 0.35, 0.08, { tile: 1 });
      glow.tint(1.0, 0.86, 0.5, 1).place(s * (W / 2 + 0.1), 0.7 + H + 0.42, 0).lathe([[0.0, 0.0], [0.1, 0.05], [0.12, 0.17], [0.06, 0.27], [0.0, 0.3]], 7).pop();
    }
    wood.tint(1.05, 0.92, 0.75, 1).box(-W / 2 - 0.2, 0.7 + H + 0.04, -0.06, W / 2 + 0.2, 0.7 + H + 0.16, 0.06, { tile: 1 });
    for (let q = 0; q < 8; q++) { // (a striped canopy over it)
      const c = q % 2 ? [0.97, 0.95, 0.9] : [0.1, 0.55, 0.6], x0 = -W / 2 - 0.3 + (q * (W + 0.6)) / 8, x1 = x0 + (W + 0.6) / 8;
      cloth.tint(c[0], c[1], c[2], 1).quad(V(x0, 0.7 + H + 0.2, 0.55), V(x1, 0.7 + H + 0.2, 0.55), V(x1, 0.7 + H + 0.5, 0), V(x0, 0.7 + H + 0.5, 0)).quad(V(x1, 0.7 + H + 0.2, -0.55), V(x0, 0.7 + H + 0.2, -0.55), V(x0, 0.7 + H + 0.5, 0), V(x1, 0.7 + H + 0.5, 0));
    }
    for (const b of [wood, paint, cloth, glow]) b.pop();
    const bx = Math.cos(yaw), bz = -Math.sin(yaw);
    for (const s of [-1, 1]) zone.colliders.push({ type: 'circle', x: x + bx * s * (W / 2 + 0.1), z: z + bz * s * (W / 2 + 0.1), r: 0.2 });
    newsAt.push({ x: x + Math.sin(yaw) * 2.2, z: z + Math.cos(yaw) * 2.2, date: day.date });
  });
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
  {
    const W = 2.3, H = 2.9, board = canvasBoard(580, 732, drawRules, W, H, { both: true });
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
    for (const b of [wood, paint, cloth, glow]) b.pop();
    zone.colliders.push({ type: 'box', x: a.x, z: a.z, hw: 2.15, hl: 1.4, yaw: a.yaw });
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
  zone._add(parts, 'notices');
  for (const m of meshes) zone.group.add(m);
  const front = (p, d) => ({ x: p.x + Math.sin(p.yaw) * d, z: p.z + Math.cos(p.yaw) * d });
  return {
    news: newsAt, // (where one stands to read each board, the newest first: [{ x, z, date }])
    welcome: { x: wl.x, z: wl.z }, rules: front(ru, 2.2),
    arcade: { ...front({ x: cx, z: cz, yaw: cyaw }, 1.2), yaw: cyaw + Math.PI, reach: 1.8, board: runBoard },
    ads: { ...front(a, 2.4), reach: 2.6, set(rows) { state.rows = rows; ads.redraw(); } },
    update(pos, time = 0) {
      for (const m of meshes) m.visible = (pos.x - m.position.x) ** 2 + (pos.z - m.position.z) ** 2 < 230 * 230;
      // (the little clouds: a new picture seven times a second, while somebody is near enough to see them)
      if (puffs && (pos.x - puffs.x) ** 2 + (pos.z - puffs.z) ** 2 < 90 * 90) {
        const f = Math.floor(time * 7) % FRAMES;
        if (f !== puffs.frame) { puffs.frame = f; puffs.textures[0].offset.x = f / FRAMES; puffs.textures[1].offset.x = ((f + 5) % FRAMES) / FRAMES; }
      }
    },
  };
}
