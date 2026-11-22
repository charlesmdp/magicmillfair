// The shop, seen from the game: what this visitor owns, who sponsors what, and the way to the payment page.
// The server decides everything (server/shop.js, server/catalog.js); while it has no payment key — or when
// there is no server at all — the shop is closed and everything is free, as before.
import { hasApi } from './api.js';
import { deviceId } from './device.js';

const BASE = import.meta.env.BASE_URL;

/** A request to the API that tells what went wrong: { ok, status, body }. Never throws. */
async function ask(path, { method = 'GET', body, key } = {}) {
  if (!(await hasApi())) return { ok: false, status: 0, body: null };
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...(body !== undefined && { 'content-type': 'application/json' }), ...(key && { Authorization: `Bearer ${key}` }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return { ok: res.ok, status: res.status, body: /json/.test(res.headers.get('content-type') || '') ? await res.json() : null };
  } catch { return { ok: false, status: 0, body: null }; }
}

/** $9.99, $30, $1,999 — from cents. */
export const price = (cents) => { const d = Math.floor(cents / 100), c = cents % 100, s = String(d); return `$${s.length > 3 ? `${s.slice(0, -3)},${s.slice(-3)}` : s}${c ? `.${String(c).padStart(2, '0')}` : ''}`; };

export class Shop {
  constructor() {
    this.mode = null; // 'test' | 'live' when things are sold
    this.prices = { board: 4900, tarp: 9900, gondola: 2900, village: [], items: {} };
    this.owned = new Set();
    /** slot → { state: 'live' | 'taken', mine, title, subtitle, url, logo (an address), draft } */
    this.slots = {};
    this.everything = false; // the administrator has it all
  }

  get open() { return !!this.mode; }

  /** Asks the server where things stand. Resolves to this. */
  async load() {
    const res = await ask(`api/shop?device=${deviceId()}`);
    if (res.ok && res.body) {
      this.mode = res.body.mode || null;
      Object.assign(this.prices, res.body.prices || {});
      this.owned = new Set(res.body.owned || []);
      this.slots = res.body.slots || {};
    }
    return this;
  }

  /** Does this visitor have that item ('jetpack', 'hat:crown')? Everything, while nothing is sold. */
  owns(item) { return !this.open || this.everything || this.owned.has(item); }

  /** What an item costs, in cents (a village: give its tier). */
  cost(item, tier = 0) { const type = item.split(':')[0]; return type === 'village' ? this.prices.village[tier] || 0 : this.prices.items?.[item] ?? this.prices[type] ?? 0; }

  /** Off to the payment page. Resolves to an error to show when it could not be opened (otherwise the page leaves). */
  async buy(item) {
    const res = await ask('api/checkout', { method: 'POST', body: { item, device: deviceId() } });
    if (res.ok && res.body && /^https:\/\//.test(res.body.url || '')) { window.location.assign(res.body.url); return null; }
    return res.body?.error || (res.status === 0 ? 'The shop cannot be reached.' : 'The payment page could not be opened.');
  }

  /** The holder of a place says what to show there. Resolves to null, or to what is wrong. */
  async fill(slot, { title, subtitle, url, logo }, key) {
    const res = await ask('api/sponsor', { method: 'POST', key, body: { slot, device: deviceId(), title, subtitle, url, ...(logo ? { logo } : { keepLogo: true }) } });
    return res.ok ? null : res.body?.error || 'It could not be saved.';
  }

  /** The administrator fills a place by hand (shown at once). Resolves to null, or to what is wrong. */
  async set(slot, { title, subtitle, url, logo }, key) {
    const res = await ask('api/sponsors', { method: 'POST', key, body: { slot, set: { title, subtitle, url, ...(logo && { logo }) } } });
    return res.ok ? null : res.body?.error || 'It could not be saved.';
  }

  /** The administrator: every place, with what awaits approval. */
  async all(key) { const res = await ask('api/sponsors', { key }); return res.ok ? res.body.slots : null; }
  /** The administrator approves (or refuses) what the holder of a place asked to show. */
  async decide(slot, approve, key) { return (await ask('api/sponsors', { method: 'POST', key, body: { slot, approve } })).ok; }
}

/** A picture the visitor chose, redrawn small on a canvas (so that only pixels leave this browser): base64 PNG, or null. */
export async function logoData(file, side = 256) {
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 8_000_000) return null;
  try {
    const bitmap = await createImageBitmap(file);
    for (const s of [side, 192, 128, 96]) {
      const k = Math.min(1, s / Math.max(bitmap.width, bitmap.height)), w = Math.max(1, Math.round(bitmap.width * k)), h = Math.max(1, Math.round(bitmap.height * k));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      const data = canvas.toDataURL('image/png').split(',')[1] || '';
      if (data && data.length * 0.75 < 88_000) return data;
    }
  } catch { /* not a picture after all */ }
  return null;
}

/** A picture from the server, ready to be painted on a sign (null if it cannot be had). */
export function loadImage(url) {
  return new Promise((resolve) => {
    if (!url || !/^\/api\/logo\?/.test(url)) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `${BASE}${url.slice(1)}`;
  });
}
