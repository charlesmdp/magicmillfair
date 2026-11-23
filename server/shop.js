// The shop and the sponsors: what a visitor owns (hats, the jetpack), who holds each place that can be
// sponsored (the panel of a game, the backdrop of the shooting gallery, a gondola of the wheel, a sky
// village) and what is shown there — and the plaques of the companions round the golden dog, which are
// places like the others, paid once and kept. Both hosts answer through shopRoute() (see routes.js).
//
//   GET    /api/shop?device=…                          → { mode, prices, owned, slots, pass, trial, now, pk? }
//                                                      (pk: Stripe's publishable key, where the payment form can
//                                                      be shown inside the game)
//                                                      (pass: null | { since, until?, gift? } — the Game Pass;
//                                                      trial: { until } — the light jetpack, free for a day
//                                                      after the first visit; now: the clock of the server)
//   POST   /api/portal    { device }                   → { url }   Stripe's page to look after — or stop — the pass
//   POST   /api/gift      { device, item } | { device, pass: days }   the administrator gives something away
//   POST   /api/checkout  { item, device, bid?, embed? } → { url }   the payment page of Stripe for that item
//                                                      (bid, in cents: for the panel of a game, which is auctioned;
//                                                      embed: the form inside the game, where it can be → { secret })
//   POST   /api/stripe/webhook                         Stripe tells what was paid (signed: see stripe.js)
//   POST   /api/sponsor   { slot, device, title, subtitle, url, logo }   the holder of a place says what to show
//   GET    /api/logo?slot=…                            the picture of a place (draft=1: the one awaiting approval)
//   GET    /api/sponsors                               the administrator: every place, drafts included
//   POST   /api/sponsors  { slot, approve } | { slot, set: { title, subtitle, url, logo, bg } }   (bg: the colour of the panel, #rrggbb)
//   DELETE /api/sponsors?slot=…                        the administrator frees a place
//
// Who is who: a visitor is the random name their browser gave itself (`device`, see src/net/device.js); one who
// has signed in to an account (accounts.js) is all the browsers of that account at once: what any of them
// bought or holds is theirs on each. What is paid is only ever learnt from Stripe (the webhook), never from
// the browser.
//
// What a sponsor sends is not trusted:
// - nothing is shown before the administrator has approved it;
// - text is cut to one short line without markup, a link must be https;
// - a picture must be a PNG, a JPEG or a WebP (told by its first bytes, not by what it claims), at most 90 KB
//   and 1024 pixels a side; it is served as that kind of picture and nothing else (no sniffing, no scripts,
//   never as a page), and the game only ever paints it on a sign.
//
// The panel of a game is auctioned (catalog.js). A bid is one payment; the highest holds the panel until
// somebody pays more: the newcomer takes the place (what was shown there goes), and the one who held it gets
// the whole of their payment back from Stripe, without anybody lifting a finger. A bid that arrives too late
// (somebody else paid more in the meantime) is refunded the same way. Every refund is written down; one that
// Stripe refuses (a payment older than about six months) is kept for the administrator to settle by hand.
//
// Kept: `own:<device>` → { items: [...], notes: [what happened while they were away] }; `slots` → { <slot>:
// { by, sub, at, state: 'paid' | 'live', title, subtitle, url, logo (a version number, 0: none), draft: { title,
// subtitle, url, logo }, bid (cents) and pay (the payment to give back): for an auctioned place } };
// `logo:<slot>` and `logo:<slot>:draft` → { type, data (base64) }; `refunds` → the last hundred, [{ pay, amount,
// at, why, ok, error }].
import { allowed } from './api.js';
import { describe, publicPrices, nextBid, AUCTION, CURRENCY } from './catalog.js';
import { createCheckout, createPortal, verifyWebhook, refundPayment } from './stripe.js';
import { accountOf, addItem, holderOf, itemsOf, passLive, sameOwner } from './accounts.js';
import { PASS, TRIAL, itemOf } from './items.js';

const out = (status, body, headers = {}) => ({ status, body, headers });
const DEVICE = /^[A-Za-z0-9_-]{16,64}$/;
export const LOGO_MAX = 90_000; // bytes of a picture
const SIDE_MAX = 1024;

/** Text someone typed, made fit to show: one line, no markup, at most `max` characters. */
export const cleanText = (text, max) => String(text ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** A colour someone chose, as #rrggbb; '' otherwise. */
export const cleanColor = (text) => { const t = String(text ?? '').trim().toLowerCase(); return /^#[0-9a-f]{6}$/.test(t) ? t : ''; };

/** A web address someone gave: https, nobody's name or password in it; '' otherwise. */
export function cleanUrl(text) {
  try {
    const u = new URL(String(text ?? '').trim());
    return u.protocol === 'https:' && !u.username && !u.password && u.hostname.includes('.') && u.href.length <= 200 ? u.href : '';
  } catch { return ''; }
}

/** A picture someone sent, as base64: { type, data } if it is a PNG, a JPEG or a WebP of a reasonable size; null otherwise. */
export function cleanLogo(base64) {
  if (typeof base64 !== 'string' || base64.length > LOGO_MAX * 1.4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  let b;
  try { b = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)); } catch { return null; }
  if (b.length < 32 || b.length > LOGO_MAX) return null;
  const text = (i, n) => String.fromCharCode(...b.subarray(i, i + n));
  let type = '', w = 0, h = 0;
  if (b[0] === 0x89 && text(1, 3) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a && text(12, 4) === 'IHDR') {
    type = 'image/png';
    w = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0; h = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0;
  } else if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    type = 'image/jpeg';
    // its size is in the first "start of frame" segment
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) break;
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { h = (b[i + 5] << 8) | b[i + 6]; w = (b[i + 7] << 8) | b[i + 8]; break; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
  } else if (text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    type = 'image/webp';
    const kind = text(12, 4);
    if (kind === 'VP8X') { w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16)); h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16)); }
    else if (kind === 'VP8 ') { w = (b[26] | (b[27] << 8)) & 0x3fff; h = (b[28] | (b[29] << 8)) & 0x3fff; }
    else if (kind === 'VP8L') { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); w = 1 + (v & 0x3fff); h = 1 + ((v >>> 14) & 0x3fff); }
  }
  if (!type || !w || !h || w > SIDE_MAX || h > SIDE_MAX) return null;
  return { type, data: base64 };
}

const bytesOf = (data) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
const slotsOf = async (ctx) => (await ctx.store.get('slots')) || {};
const ownedBy = (ctx, device) => itemsOf(ctx.store, device);
/** The browsers that are this visitor: this one, and the others of its account. */
const selves = async (ctx, device) => { const acct = DEVICE.test(device || '') ? await accountOf(ctx.store, device) : null; return new Set(acct ? [...acct.devices, device] : device ? [device] : []); };
const logoUrl = (id, version, draft) => `/api/logo?slot=${encodeURIComponent(id)}${draft ? '&draft=1' : ''}&v=${version}`;
const shown = (id, s) => ({ title: s.title || '', subtitle: s.subtitle || '', url: s.url || '', logo: s.logo ? logoUrl(id, s.logo) : null, ...(s.bg && { bg: s.bg }) });
/** What awaits approval, as it is told: its picture is an address (`keep`: no new picture — the one already shown stays). */
const draftOf = (id, s) => (s.draft ? { ...s.draft, logo: s.draft.logo > 0 ? logoUrl(id, s.draft.logo, true) : null, ...(s.draft.logo === -1 && { keep: true }) } : null);

/** What was paid for becomes theirs (called from the webhook; safe to call twice). `customer`: who pays, at Stripe. */
export async function grant(ctx, item, device, sub = null, customer = null) {
  const what = describe(item);
  if (!what || !DEVICE.test(device || '')) return false;
  if (what.kind === 'own') {
    await addItem(ctx.store, device, item, ctx.now());
    return true;
  }
  if (what.kind === 'pass') {
    // the Game Pass: held for as long as it is paid (the day Stripe says the subscription ended, it is taken back)
    const holder = await holderOf(ctx.store, device);
    await holder.save({ pass: { sub: typeof sub === 'string' ? sub : '', customer: typeof customer === 'string' ? customer : '', since: ctx.now() } });
    // (who holds which subscription: so that its end finds them, on whichever record the pass is kept)
    if (typeof sub === 'string' && sub) await ctx.store.put(`sub:${sub}`, { device, account: holder.account.toLowerCase(), at: ctx.now() });
    return true;
  }
  if (what.auction) return false; // (an auctioned place is taken by a bid: takeBid)
  const slots = await slotsOf(ctx);
  if (slots[item] && !(await sameOwner(ctx.store, slots[item].by, device))) return false; // (somebody else got there first: for the administrator to sort out)
  slots[item] = { ...(slots[item] || { state: 'paid', logo: 0 }), by: device, sub: typeof sub === 'string' ? sub : null, at: ctx.now() };
  await ctx.store.put('slots', slots);
  return true;
}

/** A word for a visitor who is not there: they are told the next time their browser asks about the shop. */
async function leaveNote(ctx, device, text) {
  if (!DEVICE.test(device || '')) return;
  const rec = (await ctx.store.get(`own:${device}`)) || { items: [] };
  await ctx.store.put(`own:${device}`, { ...rec, notes: [...(rec.notes || []), text].slice(-5) });
}

/** Gives a payment back, and writes it down (a refund that fails is kept for the administrator). */
async function refund(ctx, cfg, pay, amount, why) {
  const entry = { pay, amount, at: ctx.now(), why, ok: true };
  try { await refundPayment(cfg, pay, why, ctx.fetch || fetch); } catch (err) { entry.ok = false; entry.error = String(err.message || err).slice(0, 160); console.error('[shop] refund', entry.error); }
  await ctx.store.put('refunds', [...((await ctx.store.get('refunds')) || []), entry].slice(-100));
  return entry.ok;
}

/**
 * A bid has been paid for an auctioned place: the highest takes it, the other is refunded. `pay`: the payment
 * (so that it can be given back one day), `amount`: what Stripe says was paid, in cents. Safe to call twice.
 */
export async function takeBid(ctx, cfg, item, device, amount, pay) {
  const what = describe(item);
  if (!what?.auction || !DEVICE.test(device || '') || !Number.isInteger(amount) || amount <= 0 || typeof pay !== 'string' || !pay) return false;
  const slots = await slotsOf(ctx), cur = slots[item];
  if (cur && cur.pay === pay) return true; // (Stripe said it twice)
  if (cur && amount <= (cur.bid || 0)) {
    // somebody paid more while this one was at the payment page: it is given back at once
    await refund(ctx, cfg, pay, amount, `too late for ${item}`);
    await leaveNote(ctx, device, `Somebody bid more for ${what.label} just before you: your payment has been refunded.`);
    return false;
  }
  // (who raises their own bid keeps what they show; a newcomer starts from an empty panel)
  const again = !!cur && (await sameOwner(ctx.store, cur.by, device));
  slots[item] = again ? { ...cur, by: device, bid: amount, pay, at: ctx.now() } : { by: device, sub: null, at: ctx.now(), state: 'paid', logo: 0, bid: amount, pay };
  await ctx.store.put('slots', slots);
  if (cur) {
    if (!again) {
      await ctx.store.delete(`logo:${item}`);
      await ctx.store.delete(`logo:${item}:draft`);
      await leaveNote(ctx, cur.by, `You were outbid on ${what.label}: ${cur.pay ? 'your payment has been refunded in full' : 'the panel has a new sponsor'}.`);
    }
    if (cur.pay) await refund(ctx, cfg, cur.pay, cur.bid || 0, `outbid on ${item}`);
  }
  return true;
}

async function release(ctx, slots, id) {
  delete slots[id];
  await ctx.store.put('slots', slots);
  await ctx.store.delete(`logo:${id}`);
  await ctx.store.delete(`logo:${id}:draft`);
}

/** Answers the paths above; returns nothing for any other path. */
export async function shopRoute(req, ctx) {
  const { method, path, query, body } = req, now = ctx.now(), cfg = ctx.stripe || { mode: null };
  const limited = (name) => !allowed(ctx.limiter, name, req.client, now);
  const busy = out(429, { error: 'Too many requests.' }, { 'Retry-After': '60' });
  const reading = method === 'GET' || method === 'HEAD';

  if (path === '/api/shop') {
    if (!reading) return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
    const device = query.get('device') || '', mine = DEVICE.test(device), slots = await slotsOf(ctx), view = {}, me = mine ? await selves(ctx, device) : new Set();
    for (const [id, s] of Object.entries(slots)) {
      view[id] = s.state === 'live' ? { state: 'live', ...shown(id, s) } : { state: 'taken' };
      if (describe(id)?.auction) Object.assign(view[id], { bid: s.bid || 0, next: nextBid(s.bid || 0) }); // (what it went for, what beats it)
      if (mine && me.has(s.by)) Object.assign(view[id], { mine: true, paid: true, draft: draftOf(id, s) });
    }
    // (what happened while they were away — outbid, refunded — is said once)
    let notes = [];
    if (mine) { const rec = await ctx.store.get(`own:${device}`); if (rec?.notes?.length) { notes = rec.notes; await ctx.store.put(`own:${device}`, { ...rec, notes: [] }); } }
    // the Game Pass, and the taste of the light jetpack everybody gets for a day after their first visit
    let pass = null, trial = null;
    if (mine) {
      const holder = await holderOf(ctx.store, device);
      let first = holder.first;
      if (!first) { first = now; await holder.save({ first }); }
      if (passLive(holder.pass, now)) pass = { since: holder.pass.since || 0, ...(holder.pass.gift && { gift: true, until: holder.pass.until }), ...(holder.pass.customer && { managed: true }) };
      trial = { item: TRIAL.item, until: first + TRIAL.ms };
    }
    return out(200, { mode: cfg.mode || null, prices: publicPrices(), owned: mine ? await ownedBy(ctx, device) : [], slots: view, pass, trial, now, ...(notes.length && { notes }), ...(cfg.publishable && { pk: cfg.publishable }) });
  }

  if (path === '/api/gift') {
    // the administrator gives something away: a thing to keep, or the pass for so many days
    if (!req.admin) return out(403, { error: 'Forbidden.' });
    if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const device = body?.device;
    if (!DEVICE.test(device || '')) return out(400, { error: 'Nobody to give it to.' });
    if (body.pass !== undefined) {
      const days = Math.round(Number(body.pass));
      if (!(days >= 1 && days <= 3660)) return out(400, { error: 'For how many days?' });
      const holder = await holderOf(ctx.store, device);
      if (passLive(holder.pass, now) && !holder.pass.gift) return out(409, { error: 'They already pay for the pass.' });
      // (given again while a gift still runs: the days are added to what is left)
      const from = passLive(holder.pass, now) ? holder.pass.until : now;
      await holder.save({ pass: { gift: true, since: holder.pass?.since || now, until: from + days * 86_400_000 } });
      await leaveNote(ctx, device, `A gift from the fair: the ${PASS.name} for ${days} day${days === 1 ? '' : 's'}. Enjoy!`);
      return out(200, { ok: true, gave: PASS.id, days });
    }
    const it = itemOf(body.item);
    if (!it) return out(400, { error: 'Nothing of that name can be given.' });
    const fresh = await addItem(ctx.store, device, it.id, now);
    if (fresh) await leaveNote(ctx, device, `A gift from the fair: ${it.name}. Enjoy!`);
    return out(200, { ok: true, gave: it.id, fresh });
  }

  if (path === '/api/portal') {
    if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (!cfg.mode) return out(501, { error: 'The shop is not open.' });
    if (limited('portal')) return busy;
    const device = body?.device;
    if (!DEVICE.test(device || '')) return out(400, { error: 'Not a browser of the game.' });
    const holder = await holderOf(ctx.store, device);
    if (!passLive(holder.pass, now) || !holder.pass.customer) return out(404, { error: 'There is no subscription to look after.' });
    try {
      return out(200, await createPortal(cfg, holder.pass.customer, req.site || '', ctx.fetch || fetch));
    } catch (err) {
      console.error('[shop]', err.message);
      return out(502, { error: 'That page could not be opened. Try again in a moment.' });
    }
  }

  if (path === '/api/checkout') {
    if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (!cfg.mode) return out(501, { error: 'The shop is not open.' });
    if (limited('checkout')) return busy;
    const what = describe(body?.item), device = body?.device;
    if (!what || !DEVICE.test(device || '')) return out(400, { error: 'Nothing of that name is sold.' });
    if (what.kind === 'own' && (await ownedBy(ctx, device)).includes(what.item)) return out(409, { error: 'You already have it.' });
    if (what.kind === 'pass') { const holder = await holderOf(ctx.store, device); if (passLive(holder.pass, now) && !holder.pass.gift) return out(409, { error: 'You already have the pass.' }); }
    let extra = {};
    if (what.auction) {
      // an auction: the bid must beat what the place went for (and be a sum Stripe can take)
      const bid = Math.round(Number(body.bid)), least = nextBid((await slotsOf(ctx))[what.item]?.bid || 0);
      if (!Number.isFinite(bid) || bid < least) return out(409, { error: `The bid must be at least $${(least / 100).toFixed(2).replace(/\.00$/, '')}.`, next: least });
      if (bid > AUCTION.max) return out(400, { error: 'That is more than can be bid here.' });
      what.amount = bid;
      extra = { bid };
    } else if (what.kind === 'slot' && (await slotsOf(ctx))[what.item]) return out(409, { error: 'Somebody already has it.' });
    try {
      const embed = body.embed === true && !!cfg.publishable; // (the form inside the game: only where its key was given)
      const session = await createCheckout(cfg, { ...what, currency: CURRENCY }, device, req.site || '', ctx.fetch || fetch, extra, embed);
      return out(200, embed ? { secret: session.secret } : { url: session.url });
    } catch (err) {
      console.error('[shop]', err.message);
      return out(502, { error: 'The payment page could not be opened. Try again in a moment.' });
    }
  }

  if (path === '/api/stripe/webhook') {
    if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const event = cfg.webhook ? await verifyWebhook(cfg.webhook, req.raw, req.signature, now) : null;
    if (!event) return out(400, { error: 'Not from Stripe.' });
    const o = event.data?.object || {};
    if (event.type === 'checkout.session.completed' && (o.payment_status === 'paid' || o.payment_status === 'no_payment_required')) {
      if (describe(o.metadata?.item)?.auction) await takeBid(ctx, cfg, o.metadata.item, o.metadata?.device, o.amount_total, o.payment_intent);
      else await grant(ctx, o.metadata?.item, o.metadata?.device, o.subscription, o.customer);
    } else if (event.type === 'customer.subscription.deleted') {
      // the subscription ended: the place is free again — or the Game Pass is handed back
      const slots = await slotsOf(ctx), id = Object.keys(slots).find((k) => slots[k].sub && slots[k].sub === o.id);
      if (id) await release(ctx, slots, id);
      const held = typeof o.id === 'string' ? await ctx.store.get(`sub:${o.id}`) : null;
      if (held) {
        let ended = false;
        for (const key of [held.account && `acct:${held.account}`, held.device && `own:${held.device}`]) {
          const rec = key ? await ctx.store.get(key) : null;
          if (rec?.pass && rec.pass.sub === o.id) { await ctx.store.put(key, { ...rec, pass: null }); ended = true; }
        }
        if (ended) await leaveNote(ctx, held.device, `Your ${PASS.name} has ended. Thank you for having held it!`);
        await ctx.store.delete(`sub:${o.id}`);
      }
    }
    return out(200, { received: true });
  }

  if (path === '/api/sponsor') {
    if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (limited('sponsor')) return busy;
    const slots = await slotsOf(ctx), id = body?.slot, s = typeof id === 'string' ? slots[id] : null;
    if (!s || !(req.admin || (DEVICE.test(body.device || '') && (await selves(ctx, body.device)).has(s.by)))) return out(403, { error: 'This place is not yours.' });
    const plaque = !!describe(id)?.plaque; // (a plaque for a companion: a name, a few words, a picture — never a link)
    const draft = { title: cleanText(body.title, 28), subtitle: cleanText(body.subtitle, 40), url: plaque ? '' : cleanUrl(body.url), logo: 0 };
    if (!draft.title) return out(400, { error: 'A name is needed.' });
    if (!plaque && body.url && !draft.url) return out(400, { error: 'The link must start with https://' });
    if (body.logo) {
      const logo = cleanLogo(body.logo);
      if (!logo) return out(400, { error: 'The picture must be a PNG, a JPEG or a WebP of at most 90 KB.' });
      await ctx.store.put(`logo:${id}:draft`, logo);
      draft.logo = now;
    } else if (body.keepLogo && (s.draft?.logo || s.logo)) draft.logo = s.draft?.logo || -1; // (-1: the picture already shown stays)
    s.draft = draft;
    await ctx.store.put('slots', slots);
    return out(200, { ok: true, state: 'pending' });
  }

  if (path === '/api/logo') {
    if (!reading) return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
    const id = query.get('slot') || '', draft = query.get('draft') === '1', s = (await slotsOf(ctx))[id];
    if (!s || (draft ? !(req.admin || (await selves(ctx, query.get('device') || '')).has(s.by)) : s.state !== 'live')) return out(404, { error: 'Not found.' });
    const logo = await ctx.store.get(draft ? `logo:${id}:draft` : `logo:${id}`);
    if (!logo || !/^image\/(png|jpeg|webp)$/.test(logo.type)) return out(404, { error: 'Not found.' });
    return {
      status: 200, bytes: bytesOf(logo.data),
      headers: {
        'Content-Type': logo.type, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Disposition': 'inline; filename="logo"', 'Cross-Origin-Resource-Policy': 'same-origin', 'Cache-Control': draft ? 'no-store' : 'public, max-age=600',
      },
    };
  }

  if (path === '/api/sponsors') {
    if (!req.admin) return out(403, { error: 'Forbidden.' });
    const slots = await slotsOf(ctx);
    if (method === 'POST') {
      const id = body?.slot;
      if (typeof id !== 'string' || !describe(id) || describe(id).kind !== 'slot') return out(400, { error: 'No such place.' });
      if (body.set) {
        // the administrator fills a place by hand (a sponsor who paid some other way)
        const title = cleanText(body.set.title, 28);
        if (!title) return out(400, { error: 'A name is needed.' });
        const s = (slots[id] ||= { by: 'admin', sub: null, at: now, logo: 0 });
        Object.assign(s, { state: 'live', title, subtitle: cleanText(body.set.subtitle, 40), url: describe(id).plaque ? '' : cleanUrl(body.set.url), draft: null });
        if (body.set.bg !== undefined) s.bg = cleanColor(body.set.bg); // (the colour behind it: the administrator's choice, never the sponsor's)
        if (body.set.logo) {
          const logo = cleanLogo(body.set.logo);
          if (!logo) return out(400, { error: 'The picture must be a PNG, a JPEG or a WebP of at most 90 KB.' });
          await ctx.store.put(`logo:${id}`, logo);
          s.logo = now;
        }
      } else {
        const s = slots[id];
        if (!s || !s.draft) return out(404, { error: 'Nothing awaits approval there.' });
        if (body.approve) {
          if (s.draft.logo > 0) { await ctx.store.put(`logo:${id}`, await ctx.store.get(`logo:${id}:draft`)); s.logo = s.draft.logo; }
          else if (s.draft.logo === 0) { await ctx.store.delete(`logo:${id}`); s.logo = 0; }
          Object.assign(s, { state: 'live', title: s.draft.title, subtitle: s.draft.subtitle, url: s.draft.url });
        }
        await ctx.store.delete(`logo:${id}:draft`);
        s.draft = null;
      }
      await ctx.store.put('slots', slots);
    } else if (method === 'DELETE') {
      const id = query.get('slot') || '';
      if (!slots[id]) return out(404, { error: 'No such place.' });
      // (a sponsor the administrator takes off an auctioned panel gets their bid back)
      if (slots[id].pay) { const gone = slots[id]; await refund(ctx, cfg, gone.pay, gone.bid || 0, `removed from ${id}`); await leaveNote(ctx, gone.by, 'The fair took your panel down: your payment has been refunded in full.'); }
      await release(ctx, slots, id);
    } else if (!reading) return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD, POST, DELETE' });
    return out(200, {
      refunds: ((await ctx.store.get('refunds')) || []).slice(-30).reverse(),
      slots: Object.fromEntries(Object.entries(slots).map(([id, s]) => [id, { state: s.state, by: s.by, sub: !!s.sub, at: s.at, ...(s.bid && { bid: s.bid }), ...shown(id, s), draft: draftOf(id, s) }])),
    });
  }
  return null;
}
