// Signs drawn on a canvas and hung in the world: the scoreboards of the games (four lists: today, this week,
// this month, all time) and the sponsor panels that go with them ("your brand here" until someone takes it).
import * as THREE from 'three';

const SERIF = "Georgia, 'Times New Roman', serif", SANS = 'system-ui, sans-serif';
export const PERIODS = [['day', 'TODAY'], ['week', 'THIS WEEK'], ['month', 'THIS MONTH'], ['all', 'ALL TIME']];

/** A flat sign drawn with a canvas: { mesh, redraw(), canvas }. `draw(ctx, w, h)` paints it. */
export function canvasBoard(w, h, draw, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }));
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

/**
 * The scoreboard of a game. `lists`: { day, week, month, all }, each [{ name, score }] best first (null while
 * they have not been fetched); `format(score)` writes a score (a time, points).
 */
export function drawScores(ctx, w, h, { title, sub, lists, format }) {
  ctx.fillStyle = '#16211b'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillStyle = '#f2c14e';
  ctx.fillText(shrink(ctx, title, w - 60, 56, 700, SERIF), w / 2, 56);
  ctx.fillStyle = '#cfc7b2';
  ctx.fillText(shrink(ctx, sub, w - 60, 26, 600, SANS), w / 2, 102);
  const top = 134, pw = (w - 24) / 2, ph = (h - top - 14) / 2, rows = 5, lh = (ph - 62) / rows;
  PERIODS.forEach(([key, label], k) => {
    const x0 = 12 + (k % 2) * pw, y0 = top + Math.floor(k / 2) * ph;
    ctx.fillStyle = k === 3 ? '#243a2c' : '#1d2c23'; ctx.fillRect(x0 + 6, y0 + 4, pw - 12, ph - 8);
    ctx.fillStyle = '#e9785a'; ctx.font = `700 28px ${SANS}`; ctx.textAlign = 'center';
    ctx.fillText(label, x0 + pw / 2, y0 + 30);
    const list = lists ? lists[key] : null;
    if (!list || !list.length) {
      ctx.fillStyle = '#8f9a8c'; ctx.font = `500 24px ${SANS}`;
      ctx.fillText(list ? (key === 'all' ? 'Be the first!' : 'Nobody yet') : '…', x0 + pw / 2, y0 + ph / 2 + 10);
      return;
    }
    ctx.font = `600 31px ${SANS}`;
    list.slice(0, rows).forEach((e, i) => {
      const y = y0 + 62 + lh * (i + 0.5);
      ctx.fillStyle = i === 0 ? '#f2c14e' : i < 3 ? '#f6f1e4' : '#cfc7b2';
      const score = format(e.score);
      ctx.textAlign = 'right'; ctx.fillText(score, x0 + pw - 22, y);
      ctx.textAlign = 'left'; ctx.fillText(`${i + 1}.`, x0 + 20, y);
      ctx.fillText(fit(ctx, e.name, pw - 100 - ctx.measureText(score).width), x0 + 62, y);
    });
  });
}

/**
 * A sponsor panel. `sponsor`: null (the panel is for hire) or { title, subtitle, logo: an image ready to be
 * drawn }. `what` says what is sponsored ("this game", "this gondola"…), `price` what it costs.
 */
export function drawSponsor(ctx, w, h, sponsor, { what = 'this game', price = '' } = {}) {
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
  ctx.fillStyle = '#fbf7ec'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = Math.max(4, h * 0.03); ctx.strokeRect(4, 4, w - 8, h - 8);
  let x0 = w * 0.06;
  if (sponsor.logo) {
    const s = h * 0.76, iw = sponsor.logo.width || 1, ih = sponsor.logo.height || 1, k = Math.min(s / iw, s / ih);
    try { ctx.drawImage(sponsor.logo, x0 + (s - iw * k) / 2, (h - ih * k) / 2, iw * k, ih * k); } catch { /* a broken picture: the text alone */ }
    x0 += s + w * 0.04;
  }
  const tw = w - x0 - w * 0.05, cx = x0 + tw / 2;
  ctx.fillStyle = '#1c2a22';
  ctx.fillText(shrink(ctx, sponsor.title || '', tw, Math.round(h * (sponsor.subtitle ? 0.3 : 0.38)), 700, SERIF), cx, h * (sponsor.subtitle ? 0.4 : 0.5));
  if (sponsor.subtitle) { ctx.fillStyle = '#5b6b5f'; ctx.fillText(shrink(ctx, sponsor.subtitle, tw, Math.round(h * 0.15), 500, SANS), cx, h * 0.72); }
}
