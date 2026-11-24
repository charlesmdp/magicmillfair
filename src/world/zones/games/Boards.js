// Signs drawn on a canvas and hung in the world: the scoreboards of the games (four lists: today, this week,
// this month, all time — a marquee of light bulbs, medals for the first three) and the sponsor panels that go
// with them ("your brand here" until someone takes it).
import * as THREE from 'three';

const SERIF = "Georgia, 'Times New Roman', serif", SANS = 'system-ui, sans-serif';
export const PERIODS = [['day', 'TODAY'], ['week', 'THIS WEEK'], ['month', 'THIS MONTH'], ['all', 'ALL TIME']];

/**
 * A flat sign drawn with a canvas: { mesh, redraw(), canvas }. `draw(ctx, w, h)` paints it. `both`: it reads
 * the right way round from behind too (a second face, back to back with the first: what stands in the open
 * and is walked round — a banner over a track, a board of scores). Without it the back shows the front
 * through, as in a mirror: for what has its back to a wall.
 */
export function canvasBoard(w, h, draw, width, height, { both = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, side: both ? THREE.FrontSide : THREE.DoubleSide, toneMapped: false }));
  if (both) { const back = new THREE.Mesh(mesh.geometry, mesh.material); back.rotation.y = Math.PI; back.position.z = -0.03; mesh.add(back); }
  const redraw = () => { draw(canvas.getContext('2d'), w, h); texture.needsUpdate = true; };
  redraw();
  return { mesh, redraw, canvas };
}

const fit = (ctx, text, max) => { let s = String(text); while (s.length > 1 && ctx.measureText(s).width > max) s = s.slice(0, -1); return s; };
/** Sets the largest font up to `size` px in which `text` fits `max` px, and returns the text. */
const shrink = (ctx, text, max, size, weight, family) => {
  for (let px = size; px > 8; px -= 2) { ctx.font = `${weight} ${px}px ${family}`; if (ctx.measureText(text).width <= max) break; }
  return text;
};

const rounded = (ctx, x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
const MEDALS = [['#ffe27a', '#d99a12', '#5a3a00'], ['#f4f6fa', '#9aa3b2', '#2c3340'], ['#f0b98a', '#b0622a', '#42200a']]; // gold, silver, bronze: light, dark, ink
const RIBBONS = { day: ['#e9573f', '#b3261e'], week: ['#2bb3a3', '#14756b'], month: ['#8e6bd8', '#5a3aa6'], all: ['#f6c945', '#c98a10'] };

/**
 * The scoreboard of a game, in the manner of a fairground marquee: a frame of light bulbs, the name of the
 * game in gold, four lists (today, this week, this month, all time) with medals for the first three.
 * `lists`: { day, week, month, all }, each [{ name, score }] best first (null while they have not been
 * fetched); `format(score)` writes a score (a time, points); `me`: the visitor's own name, picked out.
 * `room`: { name, lists } in a room a player made — the board then shows the room on the left and the world
 * on the right, each today and of all time.
 */
export function drawScores(ctx, w, h, { title, sub, lists, format, me, room = null }) {
  // the night behind, rays fanning out from the title
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1b1440'); sky.addColorStop(0.55, '#141a3a'); sky.addColorStop(1, '#0c1226');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, 70);
  for (let k = 0; k < 28; k++) { ctx.rotate((Math.PI * 2) / 28); ctx.fillStyle = k % 2 ? 'rgba(255, 214, 110, 0.055)' : 'rgba(255, 255, 255, 0.02)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-70, 1100); ctx.lineTo(70, 1100); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  // the frame: gold, with a bulb every few fingers
  const gold = ctx.createLinearGradient(0, 0, w, h);
  gold.addColorStop(0, '#f9dc7c'); gold.addColorStop(0.5, '#c8901a'); gold.addColorStop(1, '#f6d266');
  ctx.strokeStyle = gold; ctx.lineWidth = 22; rounded(ctx, 13, 13, w - 26, h - 26, 26); ctx.stroke();
  ctx.strokeStyle = '#5c3a06'; ctx.lineWidth = 2; rounded(ctx, 25, 25, w - 50, h - 50, 18); ctx.stroke();
  const bulb = (x, y, k) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 13);
    g.addColorStop(0, '#fffdf0'); g.addColorStop(0.35, k % 2 ? '#ffe9a6' : '#fff6d6'); g.addColorStop(0.6, 'rgba(255, 196, 70, 0.55)'); g.addColorStop(1, 'rgba(255, 180, 40, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 13, 0, 7); ctx.fill();
  };
  const nx = Math.round((w - 60) / 46), ny = Math.round((h - 60) / 46);
  for (let k = 0; k <= nx; k++) { bulb(30 + (k * (w - 60)) / nx, 13, k); bulb(30 + (k * (w - 60)) / nx, h - 13, k + 1); }
  for (let k = 1; k < ny; k++) { bulb(13, 30 + (k * (h - 60)) / ny, k); bulb(w - 13, 30 + (k * (h - 60)) / ny, k + 1); }
  // the name of the game, in gold on its shadow, a star on either side
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const text = shrink(ctx, title, w - 250, 66, 900, SERIF), tw = ctx.measureText(text).width;
  ctx.lineJoin = 'round'; ctx.lineWidth = 10; ctx.strokeStyle = '#5a0d16'; ctx.strokeText(text, w / 2, 76);
  const tg = ctx.createLinearGradient(0, 44, 0, 108);
  tg.addColorStop(0, '#fff3b8'); tg.addColorStop(0.5, '#f6c945'); tg.addColorStop(1, '#d08a12');
  ctx.fillStyle = tg; ctx.fillText(text, w / 2, 76);
  const star = (x, y, r) => { ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, q = k % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } ctx.closePath(); ctx.fill(); };
  ctx.fillStyle = '#f6c945';
  for (const g of [-1, 1]) { star(w / 2 + g * (tw / 2 + 44), 76, 20); star(w / 2 + g * (tw / 2 + 84), 82, 11); }
  ctx.fillStyle = '#d9d2f0';
  ctx.fillText(shrink(ctx, sub.toUpperCase(), w - 140, 22, 700, SANS), w / 2, 128);
  // the four lists
  const top = 152, gap = 14, pw = (w - 76 - gap) / 2, ph = (h - top - 44 - gap) / 2, rows = 5, head = 46, lh = (ph - head - 14) / rows;
  // (in a room a player made: the room and the world side by side — [which list, its title, where from, how it is dressed])
  const where = room ? String(room.name || 'This room').toUpperCase() : '';
  const panels = room ? [['day', `TODAY · ${where}`, room.lists, 'week'], ['day', 'TODAY · THE WORLD', lists, 'day'], ['all', `ALL TIME · ${where}`, room.lists, 'month'], ['all', 'ALL TIME · THE WORLD', lists, 'all']]
    : PERIODS.map(([key, label]) => [key, label, lists, key]);
  panels.forEach(([period, label, from, key], k) => {
    const x0 = 38 + (k % 2) * (pw + gap), y0 = top + Math.floor(k / 2) * (ph + gap), [c0, c1] = RIBBONS[key];
    ctx.fillStyle = key === 'all' ? 'rgba(74, 52, 8, 0.6)' : 'rgba(8, 10, 28, 0.62)'; rounded(ctx, x0, y0, pw, ph, 16); ctx.fill();
    ctx.strokeStyle = key === 'all' ? 'rgba(246, 201, 69, 0.85)' : 'rgba(255, 255, 255, 0.16)'; ctx.lineWidth = key === 'all' ? 3 : 1.5; rounded(ctx, x0, y0, pw, ph, 16); ctx.stroke();
    // its ribbon
    const rg = ctx.createLinearGradient(0, y0, 0, y0 + head);
    rg.addColorStop(0, c0); rg.addColorStop(1, c1);
    ctx.fillStyle = rg; rounded(ctx, x0 + 14, y0 - 6, pw - 28, head, 10); ctx.fill();
    ctx.fillStyle = key === 'all' ? '#3a2600' : '#fff'; ctx.textAlign = 'center';
    ctx.fillText(shrink(ctx, key === 'all' ? `♛  ${label}  ♛` : label, pw - 52, 26, 800, SANS), x0 + pw / 2, y0 - 6 + head / 2 + 1);
    const list = from ? from[period] : null;
    if (!list || !list.length) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; ctx.font = `600 25px ${SANS}`;
      ctx.fillText(list ? (period === 'all' ? 'Be the first!' : 'Nobody yet — your turn') : '…', x0 + pw / 2, y0 + head + (ph - head) / 2);
      return;
    }
    list.slice(0, rows).forEach((e, i) => {
      const y = y0 + head + 6 + lh * (i + 0.5), mine = !!me && e.name.toLowerCase() === me.toLowerCase();
      if (mine) { ctx.fillStyle = 'rgba(246, 201, 69, 0.2)'; rounded(ctx, x0 + 8, y - lh / 2 + 2, pw - 16, lh - 4, 8); ctx.fill(); ctx.strokeStyle = 'rgba(246, 201, 69, 0.7)'; ctx.lineWidth = 1.5; ctx.stroke(); }
      else if (i % 2 === 0) { ctx.fillStyle = 'rgba(255, 255, 255, 0.045)'; rounded(ctx, x0 + 8, y - lh / 2 + 2, pw - 16, lh - 4, 8); ctx.fill(); }
      // the rank: a medal for the first three
      const bx = x0 + 36;
      if (i < 3) {
        const [light, dark, ink] = MEDALS[i], mg = ctx.createRadialGradient(bx - 5, y - 6, 2, bx, y, 19);
        mg.addColorStop(0, light); mg.addColorStop(1, dark);
        ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(bx, y, 18, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = ink; ctx.font = `900 22px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), bx, y + 1);
      } else { ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'; ctx.font = `700 22px ${SANS}`; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), bx, y + 1); }
      const score = format(e.score);
      ctx.font = `800 ${i === 0 ? 31 : 28}px ${SANS}`; ctx.textAlign = 'right';
      ctx.fillStyle = i === 0 ? '#ffd95e' : mine ? '#fff3b8' : '#ffffff';
      ctx.fillText(score, x0 + pw - 20, y + 1);
      const sw = ctx.measureText(score).width;
      ctx.font = `${mine || i === 0 ? 800 : 600} ${i === 0 ? 30 : 27}px ${SANS}`; ctx.textAlign = 'left';
      ctx.fillStyle = i === 0 ? '#fff3b8' : mine ? '#ffe9a6' : '#e8e6f5';
      ctx.fillText(fit(ctx, e.name, pw - 96 - sw), x0 + 66, y + 1);
    });
  });
}

/** Is this colour (#rrggbb) a dark one? (what is written on it is then written in a light ink) */
const dark = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) < 140; };

/**
 * A sponsor panel. `sponsor`: null (the panel is for hire) or { title, subtitle, logo: an image ready to be
 * drawn, bg: the colour behind it (#rrggbb, the administrator's choice; cream without) }. `what` says what
 * is sponsored ("this game", "this gondola"…), `price` what it costs; `label`: a word written in a ribbon
 * along the top of a panel that has a sponsor ("OUR AWESOME SPONSOR", over the board of a game).
 */
export function drawSponsor(ctx, w, h, sponsor, { what = 'this game', price = '', label = '' } = {}) {
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  if (!sponsor) {
    // for hire: fairground stripes, an invitation
    for (let x = -h, i = 0; x < w; x += 46, i++) {
      ctx.fillStyle = i % 2 ? '#f6e7b8' : '#f2c14e';
      ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.lineTo(x + h + 46, 0); ctx.lineTo(x + 46, h); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(122, 20, 32, 0.93)'; ctx.fillRect(w * 0.06, h * 0.14, w * 0.88, h * 0.72);
    ctx.strokeStyle = '#f6e7b8'; ctx.lineWidth = Math.max(3, h * 0.022); ctx.strokeRect(w * 0.06, h * 0.14, w * 0.88, h * 0.72);
    ctx.fillStyle = '#f6e7b8';
    ctx.fillText(shrink(ctx, 'YOUR BRAND HERE', w * 0.8, Math.round(h * 0.3), 700, SERIF), w / 2, h * 0.42);
    ctx.fillStyle = '#f2c14e';
    ctx.fillText(shrink(ctx, `Sponsor ${what}${price ? ` · ${price}` : ''}`, w * 0.8, Math.round(h * 0.13), 600, SANS), w / 2, h * 0.7);
    return;
  }
  const bg = /^#[0-9a-f]{6}$/.test(sponsor.bg || '') ? sponsor.bg : '#fbf7ec', night = dark(bg);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = Math.max(4, h * 0.03); ctx.strokeRect(4, 4, w - 8, h - 8);
  // (over the board of a game: a ribbon along the top says whose panel this is)
  const top = label ? h * 0.22 : 0, body = h - top;
  if (label) {
    const g = ctx.createLinearGradient(0, 0, 0, top);
    g.addColorStop(0, '#8a1826'); g.addColorStop(1, '#5d0f1a');
    ctx.fillStyle = g; ctx.fillRect(4, 4, w - 8, top);
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(4, top + 2, w - 8, Math.max(2, h * 0.012));
    ctx.fillStyle = '#ffe9a6';
    ctx.fillText(shrink(ctx, `★  ${label}  ★`, w * 0.86, Math.round(top * 0.62), 800, SANS), w / 2, 4 + top / 2 + 1);
  }
  let x0 = w * 0.06;
  if (sponsor.logo) {
    const s = body * 0.76, iw = sponsor.logo.width || 1, ih = sponsor.logo.height || 1, k = Math.min(s / iw, s / ih);
    try { ctx.drawImage(sponsor.logo, x0 + (s - iw * k) / 2, top + (body - ih * k) / 2, iw * k, ih * k); } catch { /* a broken picture: the text alone */ }
    x0 += s + w * 0.04;
  }
  const tw = w - x0 - w * 0.05, cx = x0 + tw / 2;
  ctx.fillStyle = night ? '#fdf8ea' : '#1c2a22';
  ctx.fillText(shrink(ctx, sponsor.title || '', tw, Math.round(body * (sponsor.subtitle ? 0.3 : 0.38)), 700, SERIF), cx, top + body * (sponsor.subtitle ? 0.4 : 0.5));
  if (sponsor.subtitle) { ctx.fillStyle = night ? '#c9d2cb' : '#5b6b5f'; ctx.fillText(shrink(ctx, sponsor.subtitle, tw, Math.round(body * 0.15), 500, SANS), cx, top + body * 0.72); }
}
