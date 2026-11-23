// Things to read on the way from the arrival to the mill: the board of what is new at the fair (what the latest
// updates brought: the list is app/news.js), and the booth of the sponsors — every game, who sponsors it, what
// it takes to take its panel (the game opens the list there: see main.js). And, at the top of the ramp of the
// pier, the arcade cabinet (its game is ui/Arcade.js) with its board of scores.
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

/** The board of what is new: a title, the month, and the latest things — each a few words and one line. */
function drawNews(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#14323a'); g.addColorStop(1, '#0c1d26');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  tape(ctx, 0, 0, w, 20); tape(ctx, 0, h - 20, w, 20);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillStyle = '#f2c14e'; ctx.beginPath(); ctx.arc(70, 84, 38, 0, 7); ctx.fill();
  trefoil(ctx, 70, 84, 30, '#15130f');
  ctx.fillStyle = '#ffe9a6';
  ctx.fillText(shrink(ctx, 'WHAT’S NEW', w - 190, 62, 900, SERIF), w / 2 + 40, 70);
  ctx.fillStyle = '#9fd8c8';
  ctx.fillText(shrink(ctx, `at Atomic Oasis · ${NEWS.date}`.toUpperCase(), w - 190, 21, 700, SANS), w / 2 + 40, 112);
  const top = 148, rows = Math.min(8, NEWS.items.length), lh = (h - top - 34) / rows;
  ctx.textAlign = 'left';
  NEWS.items.slice(0, rows).forEach(([title, line], i) => {
    const y = top + i * lh;
    ctx.fillStyle = i % 2 ? 'rgba(255, 255, 255, 0.035)' : 'rgba(255, 255, 255, 0.075)'; rounded(ctx, 22, y + 3, w - 44, lh - 6, 12); ctx.fill();
    ctx.fillStyle = '#f2c14e'; ctx.beginPath();
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, q = k % 2 ? 6 : 14; ctx.lineTo(50 + Math.cos(a) * q, y + lh * 0.36 + Math.sin(a) * q); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(shrink(ctx, title, w - 120, 29, 800, SANS), 78, y + lh * 0.3);
    ctx.fillStyle = '#b9cdd0'; ctx.font = `500 19px ${SANS}`;
    wrap(ctx, line, w - 120, 2).forEach((s, k) => ctx.fillText(s, 78, y + lh * 0.58 + k * 21));
  });
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
 * Builds them in the games zone. Returns { news: { x, z }, ads: { x, z, reach, set(rows) }, arcade: { x, z,
 * yaw, reach, board }, update(pos) }: `ads` is where one stands to ask at the booth (`set` redraws its
 * board), `arcade` where one stands to play (facing `yaw`), with the board of its scores.
 */
export function buildNotices(zone) {
  const parts = new Parts(), wood = parts.get('woodDark'), paint = parts.get('paint'), cloth = parts.get('doubleSided'), glow = parts.get('glow');
  const meshes = [];
  // ---- what is new: a board on two posts under a little roof, a lamp at each end
  const n = NOTICES.news, ny = zone.ground(n.x, n.z);
  {
    const W = 2.6, H = 3.0, board = canvasBoard(768, 886, drawNews, W, H, { both: true });
    board.mesh.position.set(n.x, ny + 0.75 + H / 2, n.z);
    board.mesh.rotation.y = n.yaw;
    board.mesh.name = 'notice-news';
    meshes.push(board.mesh);
    for (const b of [wood, paint, cloth, glow]) b.place(n.x, ny, n.z, n.yaw);
    for (const s of [-1, 1]) {
      wood.tint(1.05, 0.92, 0.75, 1).box(s * (W / 2 + 0.1) - 0.08, -0.3, -0.08, s * (W / 2 + 0.1) + 0.08, 0.75 + H + 0.35, 0.08, { tile: 1 });
      glow.tint(1.0, 0.86, 0.5, 1).place(s * (W / 2 + 0.1), 0.75 + H + 0.42, 0).lathe([[0.0, 0.0], [0.1, 0.05], [0.12, 0.17], [0.06, 0.27], [0.0, 0.3]], 7).pop();
    }
    wood.tint(1.05, 0.92, 0.75, 1).box(-W / 2 - 0.2, 0.75 + H + 0.04, -0.06, W / 2 + 0.2, 0.75 + H + 0.16, 0.06, { tile: 1 });
    for (let k = 0; k < 10; k++) { // (a striped canopy over it)
      const c = k % 2 ? [0.97, 0.95, 0.9] : [0.1, 0.55, 0.6], x0 = -W / 2 - 0.3 + (k * (W + 0.6)) / 10, x1 = x0 + (W + 0.6) / 10;
      cloth.tint(c[0], c[1], c[2], 1).quad(V(x0, 0.75 + H + 0.2, 0.55), V(x1, 0.75 + H + 0.2, 0.55), V(x1, 0.75 + H + 0.5, 0), V(x0, 0.75 + H + 0.5, 0)).quad(V(x1, 0.75 + H + 0.2, -0.55), V(x0, 0.75 + H + 0.2, -0.55), V(x0, 0.75 + H + 0.5, 0), V(x1, 0.75 + H + 0.5, 0));
    }
    for (const b of [wood, paint, cloth, glow]) b.pop();
    const ax = Math.cos(n.yaw), az = -Math.sin(n.yaw);
    for (const s of [-1, 1]) zone.colliders.push({ type: 'circle', x: n.x + ax * s * (W / 2 + 0.1), z: n.z + az * s * (W / 2 + 0.1), r: 0.2 });
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
    news: front(n, 2.2),
    arcade: { ...front({ x: cx, z: cz, yaw: cyaw }, 1.2), yaw: cyaw + Math.PI, reach: 1.8, board: runBoard },
    ads: { ...front(a, 2.4), reach: 2.6, set(rows) { state.rows = rows; ads.redraw(); } },
    update(pos) { for (const m of meshes) m.visible = (pos.x - m.position.x) ** 2 + (pos.z - m.position.z) ** 2 < 230 * 230; },
  };
}
