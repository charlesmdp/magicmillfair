// The shop, seen from the game: what this visitor owns, who sponsors what, and the way to the payment page.
// The server decides everything (server/shop.js, server/catalog.js); while it has no payment key — or when
// there is no server at all — the shop is closed and everything is free, as before.
import { hasApi, sharedNow } from './api.js';
import { deviceId } from './device.js';
import { passGives } from '../../server/items.js';

const BASE = import.meta.env.BASE_URL;

/** A request to the API that tells what went wrong: { ok, status, body }. Never throws. */
async function ask(path, { method = 'GET', body, key } = {}) {
  if (!(await hasApi())) return { ok: false, status: 0, body: null };
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...(body !== undefined && { 'content-type': 'application/json' }), ...(key && { Authorization: `Bearer ${encodeURIComponent(key)}` }) },
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
    this.prices = { tarp: 9900, gondola: 2900, plaque: 2000, village: [], items: {}, auction: { start: 100, max: 1_000_000 } };
    this.notes = []; // what happened while the visitor was away (outbid, refunded): said once
    this.owned = new Set();
    /** slot → { state: 'live' | 'taken', mine, title, subtitle, url, logo (an address), draft } */
    this.slots = {};
    this.everything = false; // the administrator has it all
    this.pass = null; // the Game Pass, while it is held: { since, gift?, until?, managed? }
    this.trial = null; // { item, until }: what everybody has for a day after their first visit
    this.pk = ''; // Stripe's publishable key, where the payment form can be shown inside the game
    /** (item, secret) → true once the form is shown inside the game, false when it cannot be (set by the game). */
    this.onEmbed = null;
  }

  /** Is the Game Pass theirs (or is everything free, or are they the administrator)? */
  get hasPass() { return !this.open || this.everything || (!!this.pass && (!this.pass.until || this.pass.until > sharedNow())); }
  /** How long the free day of `item` still lasts, in ms (0: over, or there never was one). */
  trialLeft(item) { return this.trial && this.trial.item === item ? Math.max(0, this.trial.until - sharedNow()) : 0; }
  /** Really theirs: bought, given — or everything is free. */
  has(item) { return !this.open || this.everything || this.owned.has(item); }
  /** Not theirs, but lent: 'pass' (the Game Pass gives it) or 'trial' (their free day); null otherwise. */
  lent(item) { return this.has(item) ? null : this.pass && this.hasPass && passGives(item) ? 'pass' : this.trialLeft(item) > 0 ? 'trial' : null; }

  get open() { return !!this.mode; }

  /** Asks the server where things stand. Resolves to this. */
  async load() {
    const res = await ask(`api/shop?device=${deviceId()}`);
    if (res.ok && res.body) {
      this.mode = res.body.mode || null;
      Object.assign(this.prices, res.body.prices || {});
      this.owned = new Set(res.body.owned || []);
      this.slots = res.body.slots || {};
      if (Array.isArray(res.body.notes)) this.notes.push(...res.body.notes.map(String));
      this.pass = res.body.pass && typeof res.body.pass === 'object' ? res.body.pass : null;
      this.trial = res.body.trial && Number.isFinite(res.body.trial.until) ? { item: String(res.body.trial.item || ''), until: res.body.trial.until } : null;
      this.pk = typeof res.body.pk === 'string' && /^pk_(test|live)_/.test(res.body.pk) ? res.body.pk : '';
    }
    return this;
  }

  /** May this visitor use that item ('jetpack', 'hat:crown')? Theirs, or lent by the pass or the free day. Everything, while nothing is sold. */
  owns(item) { return this.has(item) || !!this.lent(item); }

  /** What an item costs, in cents (a village: give its tier). */
  cost(item, tier = 0) { const type = item.split(':')[0]; return type === 'village' ? this.prices.village[tier] || 0 : this.prices.items?.[item] ?? this.prices[type] ?? 0; }

  /** The least that can be bid for an auctioned place, in cents: what beats its sponsor, or the first bid. */
  least(slot) { return this.slots[slot]?.next || this.prices.auction?.start || 100; }

  /**
   * Off to the payment (`bid`, in cents: for a place that is auctioned): Stripe's form inside the game where
   * that can be, Stripe's own page otherwise. Resolves to an error to show when it could not be opened, to
   * null otherwise (the form is up, or the page leaves).
   */
  async buy(item, bid) {
    if (this.pk && this.onEmbed) {
      const here = await ask('api/checkout', { method: 'POST', body: { item, device: deviceId(), ...(bid && { bid }), embed: true } });
      if (here.ok && typeof here.body?.secret === 'string') { if (await this.onEmbed(item, here.body.secret)) return null; }
      else if (here.status >= 400 && here.status < 500 && here.body?.error) return here.body.error; // (refused: Stripe's page would be refused too)
      // (the form could not be shown here: Stripe's own page, as before)
    }
    const res = await ask('api/checkout', { method: 'POST', body: { item, device: deviceId(), ...(bid && { bid }) } });
    if (res.ok && res.body && /^https:\/\//.test(res.body.url || '')) { window.location.assign(res.body.url); return null; }
    return res.body?.error || (res.status === 0 ? 'The shop cannot be reached.' : 'The payment page could not be opened.');
  }

  /** Off to Stripe's page where the Game Pass is looked after — or stopped. Resolves to an error to show, or the page leaves. */
  async portal(what = '') {
    // (`what`: 'room' — the subscription of one's own room, rather than the Game Pass)
    const res = await ask('api/portal', { method: 'POST', body: { device: deviceId(), ...(what && { what }) } });
    if (res.ok && res.body && /^https:\/\//.test(res.body.url || '')) { window.location.assign(res.body.url); return null; }
    return res.body?.error || 'That page could not be opened.';
  }

  /** The administrator gives something away: `what` = { item } or { pass: days }. Resolves to null, or to what is wrong. */
  async gift(key, device, what) {
    const res = await ask('api/gift', { method: 'POST', key, body: { device, ...what } });
    return res.ok ? null : res.body?.error || 'It could not be given.';
  }

  /** The holder of a place says what to show there. Resolves to null, or to what is wrong. */
  async fill(slot, { title, subtitle, url, logo }, key) {
    const res = await ask('api/sponsor', { method: 'POST', key, body: { slot, device: deviceId(), title, subtitle, url, ...(logo ? { logo } : { keepLogo: true }) } });
    return res.ok ? null : res.body?.error || 'It could not be saved.';
  }

  /** The administrator fills a place by hand (shown at once). Resolves to null, or to what is wrong. */
  async set(slot, { title, subtitle, url, logo, bg }, key) {
    const res = await ask('api/sponsors', { method: 'POST', key, body: { slot, set: { title, subtitle, url, ...(logo && { logo }), ...(bg !== undefined && { bg }) } } });
    return res.ok ? null : res.body?.error || 'It could not be saved.';
  }

  /** The administrator: every place, with what awaits approval. */
  async all(key) { const res = await ask('api/sponsors', { key }); return res.ok ? res.body.slots : null; }
  /** The administrator approves (or refuses) what the holder of a place asked to show. */
  async decide(slot, approve, key) { return (await ask('api/sponsors', { method: 'POST', key, body: { slot, approve } })).ok; }
}

/**
 * A picture the visitor chose, redrawn small on a canvas (so that only pixels leave this browser): base64, or
 * null. A logo stays whole, as a PNG (it may be see-through); a `photo` is cut square about its middle and
 * sent as a JPEG, which is what suits a photograph.
 */
export async function logoData(file, side = 256, photo = false) {
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 8_000_000) return null;
  try {
    const bitmap = await createImageBitmap(file);
    for (const s of [side, 192, 128, 96]) {
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
      if (photo) {
        const cut = Math.min(bitmap.width, bitmap.height), px = Math.max(1, Math.min(s, cut));
        canvas.width = px; canvas.height = px;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, px, px);
        ctx.drawImage(bitmap, (bitmap.width - cut) / 2, (bitmap.height - cut) / 2, cut, cut, 0, 0, px, px);
      } else {
        const k = Math.min(1, s / Math.max(bitmap.width, bitmap.height)), w = Math.max(1, Math.round(bitmap.width * k)), h = Math.max(1, Math.round(bitmap.height * k));
        canvas.width = w; canvas.height = h;
        ctx.drawImage(bitmap, 0, 0, w, h);
      }
      const data = (photo ? canvas.toDataURL('image/jpeg', 0.86) : canvas.toDataURL('image/png')).split(',')[1] || '';
      if (data && data.length * 0.75 < 88_000) return data;
    }
  } catch { /* not a picture after all */ }
  return null;
}

/** The address of a picture of theirs that awaits approval, as this browser may ask for it. */
export const ownDraft = (url) => (url ? `${url}&device=${deviceId()}` : null);

/**
 * A picture from the server, ready to be painted on a sign (null if it cannot be had). `key`: the
 * administrator's, for a picture only they may see yet — sent with the request, never in an address.
 */
export function loadImage(url, key = '') {
  return new Promise((resolve) => {
    if (!url || !/^\/api\/logo\?/.test(url)) { resolve(null); return; }
    const img = new Image(), src = `${BASE}${url.slice(1)}`;
    let made = '';
    const done = (v) => { if (made) URL.revokeObjectURL(made); resolve(v); };
    img.onload = () => done(img);
    img.onerror = () => done(null);
    if (!key) { img.src = src; return; }
    fetch(src, { headers: { Authorization: `Bearer ${encodeURIComponent(key)}` } })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => { if (!blob) { resolve(null); return; } made = URL.createObjectURL(blob); img.src = made; })
      .catch(() => resolve(null));
  });
}
