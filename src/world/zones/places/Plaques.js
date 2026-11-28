// The plaques of the companions: brass plates fixed round the plinth of the golden dog, two rows of them, one
// for each pet somebody loves enough to want up here — the one asleep on their sofa tonight as much as the one
// they miss: a name, a few words, a picture if they sent one (what is written there is the business of the
// shop: a plaque is a place like the others, `plaque:<n>`, paid once). It is no graveyard, and the board that
// stands by the plates says so before anybody reads one (COMPANIONS, drawCompanions).
//
// All of them are one mesh painted from one picture (an atlas: a cell per plaque). The picture is only made
// when somebody comes up to the ledge, and thrown away when they have gone: it costs nothing to those who
// never climb. A picture sent for a plaque is fetched when its cell is painted, and not kept.
import * as THREE from 'three';
import { loadImage } from '../../../net/Shop.js';
import { paintWords, wordsWidth } from '../../props/handpaint.js';

export const CELL_W = 256, CELL_H = 128;
const COLS = 8;
const SERIF = "Georgia, 'Times New Roman', serif";
const NEAR = 150, FAR = 230; // metres from the plinth: the picture is made within the first, dropped beyond the second
/** The plates: their size, how far above the foot of the plinth each row is centred, the part of the round left to the tablet. */
const PLATE = { w: 0.93, h: 0.48, rows: [1.3, 0.74], keep: 29 * (Math.PI / 180), off: 0.014 };

const rounded = (ctx, x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
const paw = (ctx, cx, cy, r) => { ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.35, r * 0.62, r * 0.5, 0, 0, 7); ctx.fill(); for (const [ox, oy] of [[-0.66, -0.18], [-0.24, -0.62], [0.24, -0.62], [0.66, -0.18]]) { ctx.beginPath(); ctx.ellipse(cx + ox * r, cy + oy * r, r * 0.21, r * 0.27, ox * 0.5, 0, 7); ctx.fill(); } };
/** The largest font up to `size` px in which `text` fits `max` px. */
const fitFont = (ctx, text, max, size, least, style) => { let px = size; for (; px > least; px -= 1) { ctx.font = `${style} ${px}px ${SERIF}`; if (ctx.measureText(text).width <= max) break; } ctx.font = `${style} ${px}px ${SERIF}`; return px; };
/** `text` cut into at most `most` lines of `max` pixels (in the font that is set). */
const wrap = (ctx, text, max, most) => {
  const lines = [];
  let line = '';
  for (const word of String(text).split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= max || !line) line = next; else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > most) { lines.length = most; let last = lines[most - 1]; while (last.length > 1 && ctx.measureText(`${last}…`).width > max) last = last.slice(0, -1); lines[most - 1] = `${last}…`; }
  return lines;
};
/** Words cut in the metal: dark, with a line of light under them. */
const engrave = (ctx, text, x, y) => { ctx.fillStyle = 'rgba(255, 246, 205, 0.6)'; ctx.fillText(text, x + 1, y + 1.2); ctx.fillStyle = '#35220a'; ctx.fillText(text, x, y); };

/**
 * What the board by the plates says, to whoever comes up to them: a plate is for a companion one loves — here
 * with them or missed, the same —, and the place is a celebration of them. (`how`: the way to have one.)
 */
export const COMPANIONS = {
  title: 'THE GOOD COMPANIONS',
  lines: ['Asleep on your sofa tonight,', 'or missed every day:', 'a plate here is for both.'],
  ribbon: 'AN ODE TO LIFE',
  aside: 'They cannot read. Tell them anyway.',
  how: 'A plate for yours, for good: step up to one that is still bare.',
};

/**
 * The board of the companions, painted (1024 × 752 for a board of 2.4 m by 1.76: its three lines are letters of
 * fifteen centimetres, read from the top of the stair): a page of warm paper in a brown frame, as the story of
 * the fair is told at its gate — its title painted by hand, a paw on either side; the three lines; a red ribbon
 * across; and, smaller, a word of advice and the way to have a plate.
 */
export function drawCompanions(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#f8ecd2'); g.addColorStop(1, '#ecd7a8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // (the paper has seen the sea air: a few stains, always the same)
  let seed = 20261128;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let k = 0; k < 22; k++) { ctx.fillStyle = `rgba(150, 105, 50, ${0.018 + rnd() * 0.03})`; ctx.beginPath(); ctx.ellipse(rnd() * w, rnd() * h, 20 + rnd() * 80, 12 + rnd() * 44, rnd() * 3, 0, 7); ctx.fill(); }
  ctx.strokeStyle = '#6b4423'; ctx.lineWidth = 14; ctx.strokeRect(11, 11, w - 22, h - 22);
  ctx.strokeStyle = '#d9a63a'; ctx.lineWidth = 4; ctx.strokeRect(25, 25, w - 50, h - 50);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // its title, painted by hand, a paw on either side
  const size = Math.min(74, (74 * (w - 250)) / Math.max(1, wordsWidth(COMPANIONS.title, 74))), tw = wordsWidth(COMPANIONS.title, size);
  paintWords(ctx, COMPANIONS.title, w / 2, 128, size, { align: 'center', color: '#7a1f17', shade: 'rgba(255, 244, 214, 0.6)', seed: 'companions' });
  ctx.fillStyle = '#c98a1e';
  for (const sgn of [-1, 1]) { ctx.save(); ctx.translate(w / 2 + sgn * (tw / 2 + 58), 90); ctx.rotate(sgn * 0.22); paw(ctx, 0, 0, 27); ctx.restore(); }
  ctx.strokeStyle = 'rgba(107, 68, 35, 0.6)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(150, 170); ctx.lineTo(w / 2 - 30, 170); ctx.moveTo(w / 2 + 30, 170); ctx.lineTo(w - 150, 170); ctx.stroke();
  ctx.fillStyle = '#7a1f17'; paw(ctx, w / 2, 168, 12);
  // the three lines: what the place is for
  ctx.fillStyle = '#35220f';
  COMPANIONS.lines.forEach((t, i) => { fitFont(ctx, t, w - 110, 68, 30, 'italic 700'); ctx.fillText(t, w / 2, 242 + i * 81); });
  // a ribbon across, its ends cut in a swallow tail
  const ry = 460, rh = 96, rx = 150, tail = 34;
  ctx.fillStyle = '#5c1711';
  for (const sgn of [-1, 1]) { const x0 = sgn < 0 ? rx - 46 : w - rx + 46, x1 = sgn < 0 ? rx + 30 : w - rx - 30; ctx.beginPath(); ctx.moveTo(x0, ry + 16); ctx.lineTo(x1, ry + 16); ctx.lineTo(x1, ry + rh + 16); ctx.lineTo(x0, ry + rh + 16); ctx.lineTo(x0 - sgn * tail, ry + rh / 2 + 16); ctx.closePath(); ctx.fill(); }
  const rg = ctx.createLinearGradient(0, ry, 0, ry + rh);
  rg.addColorStop(0, '#b93226'); rg.addColorStop(1, '#8a1f18');
  ctx.fillStyle = rg; ctx.fillRect(rx, ry, w - 2 * rx, rh);
  ctx.strokeStyle = 'rgba(255, 226, 150, 0.75)'; ctx.lineWidth = 2.5; ctx.strokeRect(rx + 9, ry + 9, w - 2 * rx - 18, rh - 18);
  const rs = Math.min(56, (56 * (w - 2 * rx - 90)) / Math.max(1, wordsWidth(COMPANIONS.ribbon, 56)));
  paintWords(ctx, COMPANIONS.ribbon, w / 2, ry + rh / 2 + rs / 2, rs, { align: 'center', color: '#fff0c4', shade: 'rgba(40, 8, 4, 0.55)', seed: 'ode' });
  // smaller: a word of advice, and the way to have a plate
  ctx.fillStyle = '#4a2f14'; fitFont(ctx, COMPANIONS.aside, w - 160, 44, 22, 'italic 600'); ctx.fillText(COMPANIONS.aside, w / 2, 612);
  ctx.fillStyle = '#7b5a36'; fitFont(ctx, COMPANIONS.how, w - 110, 29, 16, '700'); ctx.fillText(COMPANIONS.how, w / 2, 676);
}

/**
 * One plate, painted in its cell (256 × 128). `what`: null (nobody's yet), { taken } (somebody's, not engraved
 * yet), or { title, subtitle, pending } with `picture` (an image, or null).
 */
export function drawPlate(ctx, what, picture) {
  const w = CELL_W, h = CELL_H, free = !what, blank = !what || what.taken;
  // the metal: dull bronze while it is nobody's, polished brass once it is somebody's
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  if (free) { g.addColorStop(0, '#6f5836'); g.addColorStop(0.5, '#5e4929'); g.addColorStop(1, '#4b3a20'); }
  else { g.addColorStop(0, '#f6dc8c'); g.addColorStop(0.35, '#dcae4a'); g.addColorStop(0.62, '#f1cf72'); g.addColorStop(1, '#bd8d30'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = free ? '#33260f' : '#6d4c14'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.strokeStyle = free ? 'rgba(255, 230, 170, 0.12)' : 'rgba(255, 250, 220, 0.55)'; ctx.lineWidth = 1.5; rounded(ctx, 8.5, 8.5, w - 17, h - 17, 5); ctx.stroke();
  for (const [sx, sy] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) { // the four screws
    ctx.fillStyle = free ? '#3b2c14' : '#7a5a1c'; ctx.beginPath(); ctx.arc(sx, sy, 3.2, 0, 7); ctx.fill();
    ctx.strokeStyle = free ? '#231908' : '#3f2c0a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx - 2, sy - 1.2); ctx.lineTo(sx + 2, sy + 1.2); ctx.stroke();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (blank) {
    ctx.fillStyle = free ? 'rgba(30, 20, 6, 0.3)' : 'rgba(90, 60, 14, 0.4)';
    paw(ctx, w / 2, h / 2 - (free ? 2 : 14), free ? 24 : 17);
    if (!free) { ctx.font = `italic 600 15px ${SERIF}`; engrave(ctx, what.mine ? 'yours — have it engraved' : 'being engraved…', w / 2, h - 30); }
    return;
  }
  const title = String(what.title || '').toUpperCase(), line = String(what.subtitle || '');
  let x0 = 22, x1 = w - 22;
  if (picture) {
    // their picture, in a frame at the left
    const side = 92, px = 18, py = (h - side) / 2, k = Math.max(side / picture.width, side / picture.height), dw = picture.width * k, dh = picture.height * k;
    ctx.save(); rounded(ctx, px, py, side, side, 7); ctx.clip();
    ctx.fillStyle = '#2a1b0a'; ctx.fillRect(px, py, side, side);
    try { ctx.drawImage(picture, px + (side - dw) / 2, py + (side - dh) / 2, dw, dh); } catch { /* a picture that cannot be painted: the frame stays dark */ }
    ctx.restore();
    ctx.strokeStyle = '#4a3410'; ctx.lineWidth = 2.5; rounded(ctx, px, py, side, side, 7); ctx.stroke();
    x0 = px + side + 10;
  }
  const mid = (x0 + x1) / 2, room = x1 - x0;
  const size = fitFont(ctx, title, room, picture ? 26 : 32, 11, '900');
  ctx.font = `italic 600 ${picture ? 13 : 15}px ${SERIF}`;
  const lines = line ? wrap(ctx, line, room, picture ? 3 : 2) : [], lh = picture ? 15 : 18;
  const block = size + (lines.length ? 12 + lines.length * lh : 0), top = (h - block) / 2;
  ctx.font = `900 ${size}px ${SERIF}`;
  engrave(ctx, title, mid, top + size / 2);
  if (lines.length) {
    // a line with a small paw in the middle, then their words
    const ry = top + size + 6;
    ctx.fillStyle = 'rgba(70, 46, 10, 0.75)'; ctx.fillRect(mid - room * 0.36, ry - 0.75, room * 0.3, 1.5); ctx.fillRect(mid + room * 0.06, ry - 0.75, room * 0.3, 1.5);
    paw(ctx, mid, ry - 1, 4.4);
    ctx.font = `italic 600 ${picture ? 13 : 15}px ${SERIF}`;
    lines.forEach((t, i) => engrave(ctx, t, mid, ry + 6 + lh * (i + 0.5)));
  }
  if (what.pending) {
    // (only the administrator and its holder see it so: it is not shown to anybody else yet)
    ctx.save(); ctx.translate(w - 44, 26); ctx.rotate(0.38);
    ctx.fillStyle = 'rgba(160, 30, 20, 0.92)'; ctx.fillRect(-64, -9, 128, 18);
    ctx.fillStyle = '#fff3e0'; ctx.font = '800 10.5px system-ui, sans-serif'; ctx.fillText('AWAITING APPROVAL', 0, 0.5);
    ctx.restore();
  }
}

/**
 * The plates round a plinth. `at`: { x, y, z, yaw, r } — the middle of the plinth on the ground, which way its
 * tablet looks, the radius of its drum; `count`: how many plates (an even number: two rows).
 * Returns { mesh, count, x, y, z, columnAt(x, z), ids(column), where(n), set(n, what), update(pos) }:
 * - columnAt: the column of plates in front of whoever stands at (x, z) by the drum, or null;
 * - ids(column): its two plates, [{ id: 'plaque:<n>', n, row: 'upper' | 'lower' }];
 * - set(n, what): what plate n shows — null, { taken, mine } or { title, subtitle, logo (an address or an image), pending }.
 */
export function buildPlaques(at, count) {
  const per = count / 2, arc = 2 * Math.PI - 2 * PLATE.keep, pitch = arc / per, r = at.r + PLATE.off, half = PLATE.w / 2 / r;
  const rows = Math.ceil(count / COLS), W = COLS * CELL_W, H = rows * CELL_H;
  // ---- the mesh: each plate is two quads that follow the drum (in the frame of the plinth: its tablet looks to +Z)
  const pos = [], uv = [], idx = [];
  for (let n = 1; n <= count; n++) {
    const k = (n - 1) % per, j = n > per ? 1 : 0, mid = PLATE.keep + (k + 0.5) * pitch, yc = PLATE.rows[j];
    const c = (n - 1) % COLS, row = Math.floor((n - 1) / COLS), base = pos.length / 3;
    const u0 = (c * CELL_W + 1) / W, u1 = ((c + 1) * CELL_W - 1) / W, v1 = 1 - (row * CELL_H + 1) / H, v0 = 1 - ((row + 1) * CELL_H - 1) / H;
    for (let s = 0; s <= 2; s++) {
      const a = mid + (s - 1) * half, x = Math.sin(a) * r, z = Math.cos(a) * r, u = u0 + (u1 - u0) * (s / 2);
      pos.push(x, yc - PLATE.h / 2, z, x, yc + PLATE.h / 2, z);
      uv.push(u, v0, u, v1);
    }
    for (let s = 0; s < 2; s++) { const a = base + s * 2; idx.push(a, a + 2, a + 3, a, a + 3, a + 1); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(idx);
  geometry.computeBoundingSphere();
  const material = new THREE.MeshBasicMaterial({ toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'golden:plaques';
  mesh.position.set(at.x, at.y, at.z);
  mesh.rotation.y = at.yaw;
  mesh.visible = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();

  const data = new Array(count + 1).fill(null);
  let atlas = null, dirty = false, last = 0; // atlas: { canvas, ctx, texture, turn } while the picture exists
  const paint = (n, picture) => {
    const c = (n - 1) % COLS, row = Math.floor((n - 1) / COLS), { ctx } = atlas;
    ctx.save(); ctx.beginPath(); ctx.rect(c * CELL_W, row * CELL_H, CELL_W, CELL_H); ctx.clip(); ctx.translate(c * CELL_W, row * CELL_H);
    drawPlate(ctx, data[n], picture);
    ctx.restore();
    dirty = true;
  };
  /** Paints plate n as it stands; its picture, if it has one, comes after (and is painted when it has come). */
  const show = (n) => {
    const what = data[n], logo = what && !what.taken ? what.logo : null;
    if (logo && typeof logo !== 'string') { paint(n, logo); return; }
    paint(n, null);
    if (!logo) return;
    const mine = atlas;
    loadImage(logo).then((img) => { if (img && atlas === mine && data[n] === what) paint(n, img); });
  };
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    atlas = { canvas, ctx: canvas.getContext('2d'), texture };
    for (let n = 1; n <= count; n++) show(n);
    material.map = texture; material.needsUpdate = true;
    mesh.visible = true;
  };
  const drop = () => {
    mesh.visible = false;
    material.map = null; material.needsUpdate = true;
    atlas.texture.dispose();
    atlas.canvas.width = atlas.canvas.height = 1; // (its memory goes at once)
    atlas = null;
  };
  const cy = Math.cos(at.yaw), sy = Math.sin(at.yaw);
  return {
    mesh, count, x: at.x, y: at.y, z: at.z,
    columnAt(x, z) {
      const dx = x - at.x, dz = z - at.z, d = Math.hypot(dx, dz);
      if (d < at.r || d > at.r + 2.3) return null;
      let a = Math.atan2(dx * cy - dz * sy, dx * sy + dz * cy); // (from the tablet, round by the right of who looks at it)
      if (a < 0) a += 2 * Math.PI;
      if (a < PLATE.keep || a > 2 * Math.PI - PLATE.keep) return null;
      return Math.min(per - 1, Math.floor((a - PLATE.keep) / pitch));
    },
    ids: (k) => [{ id: `plaque:${k + 1}`, n: k + 1, row: 'upper' }, { id: `plaque:${k + 1 + per}`, n: k + 1 + per, row: 'lower' }],
    /** Where plate n is: { x, y, z } of the plate itself, and (sx, sz) where one stands to read it. */
    where(n) {
      const k = (n - 1) % per, a = PLATE.keep + (k + 0.5) * pitch, lx = Math.sin(a), lz = Math.cos(a), wx = lx * cy + lz * sy, wz = -lx * sy + lz * cy;
      return { x: at.x + wx * r, y: at.y + PLATE.rows[n > per ? 1 : 0], z: at.z + wz * r, sx: at.x + wx * (at.r + 1.25), sz: at.z + wz * (at.r + 1.25), row: n > per ? 'lower' : 'upper' };
    },
    set(n, what) {
      if (!(n >= 1 && n <= count)) return;
      data[n] = what || null;
      if (atlas) show(n);
    },
    /** Every frame: the picture is made when somebody comes near, sent to the card a few times a second at most, dropped when they have gone. */
    update(p) {
      const d2 = (p.x - at.x) ** 2 + (p.z - at.z) ** 2;
      if (!atlas) { if (d2 < NEAR * NEAR) make(); return; }
      if (d2 > FAR * FAR) { drop(); return; }
      if (dirty && performance.now() - last > 350) { atlas.texture.needsUpdate = true; dirty = false; last = performance.now(); }
    },
    /** (for the tests) */
    get painted() { return !!atlas; },
    peek: (n) => data[n],
  };
}
