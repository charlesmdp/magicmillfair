// The shop and the sponsors: what a visitor owns (hats, the jetpack), who holds each place that can be
// sponsored (the panel of a game, the backdrop of the shooting gallery, a gondola of the wheel, a sky
// village) and what is shown there — and the plaques of the companions round the golden dog, which are
// places like the others, paid once and kept. Both hosts answer through shopRoute() (see routes.js).
//
//   GET    /api/shop?device=…                          → { mode, prices, owned, slots, pass, trial, now, pk? }
//                                                      (slots: what each place shows; with it, for a sponsor's
//                                                      place, `pays`: { amount, monthly, total } in cents — what
//                                                      its sponsor pays, for the wall of thanks: see paysOf)
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
//   POST   /api/sponsors  { slot, approve } | { slot, set: { title, subtitle, url, logo, bg, paid } }   (bg: the colour of the panel, #rrggbb;
//                                                      paid: what a sponsor entered by hand has paid, in cents — 0: not said)
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
import { describe, forLife, publicPrices, nextBid, AUCTION, CURRENCY } from './catalog.js';
import { createCheckout, createPortal, verifyWebhook, refundPayment, endSubscription, fetchCheckout } from './stripe.js';
import { noteSale, noteRefund } from './stats.js';
import { readRelease } from './release.js';
import { BOARDS as SCORE_BOARDS } from './scores.js';
import { accountOf, addItem, holderOf, itemsOf, passLive, sameOwner } from './accounts.js';
import { quietOnes } from './bans.js';
import { PASS, TRIAL, itemOf } from './items.js';
import { userRoomsOn, roomOfAccount, openRoom, sleepRoom } from './urooms.js';
import { cleanEmail, mailLater, passMail, sponsorMail } from './mail.js';
import { maskWords } from './decency.js';

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
/**
 * Is what this slot shows hidden from everybody but its holder (a sponsor, the author of a plaque, who is kept
 * out in silence: bans.js)? Returns the test — most of the time nobody is, and it looks nothing up.
 */
async function hiddenBy(ctx) {
  const quiet = await quietOnes(ctx);
  if (!quiet.dev.size && !quiet.acct.size) return async () => false;
  const names = new Map();
  return async (s) => {
    if (!s?.by) return false;
    if (quiet.dev.has(s.by)) return true;
    if (!quiet.acct.size) return false;
    if (!names.has(s.by)) names.set(s.by, ((await accountOf(ctx.store, s.by))?.name || '').toLowerCase());
    return quiet.acct.has(names.get(s.by));
  };
}
const selves = async (ctx, device) => { const acct = DEVICE.test(device || '') ? await accountOf(ctx.store, device) : null; return new Set(acct ? [...acct.devices, device] : device ? [device] : []); };
const logoUrl = (id, version, draft) => `/api/logo?slot=${encodeURIComponent(id)}${draft ? '&draft=1' : ''}&v=${version}`;
const shown = (id, s) => ({ title: s.title || '', subtitle: s.subtitle || '', url: s.url || '', logo: s.logo ? logoUrl(id, s.logo) : null, ...(s.bg && { bg: s.bg }), ...(s.url && { clicks: s.clicks || 0 }) }); // (clicks: how many times its site was opened from here)
/** What awaits approval, as it is told: its picture is an address (`keep`: no new picture — the one already shown stays). */
const draftOf = (id, s) => (s.draft ? { ...s.draft, logo: s.draft.logo > 0 ? logoUrl(id, s.draft.logo, true) : null, ...(s.draft.logo === -1 && { keep: true }) } : null);

const MONTH = 30.4375 * 86_400_000;
/**
 * What the sponsor of a place pays, for the wall of thanks: { amount (cents: the bid, or the price of a month),
 * monthly, total (cents put in so far) } — or null: a plaque for a companion (no sponsor's), or a place the
 * administrator filled by hand without saying what was paid. A bid counts for what was bid; a place held by
 * the month counts every month begun since it was taken. Amounts only: who pays is said nowhere.
 */
export function paysOf(id, s, now) {
  const what = describe(id);
  if (!s || !what || what.kind !== 'slot' || what.plaque) return null;
  if (what.auction && s.pay && s.bid > 0) return { amount: s.bid, monthly: false, total: s.bid };
  if (!what.auction && s.sub) return { amount: what.amount, monthly: true, total: what.amount * (1 + Math.max(0, Math.floor((now - (s.at || now)) / MONTH))) };
  return s.paid > 0 ? { amount: s.paid, monthly: false, total: s.paid } : null;
}

/**
 * What was paid for becomes theirs (called from the webhook; safe to call twice). `customer`: who pays, at Stripe.
 * `once` (cents): it was bought for good — a gondola, a room — and this is what was paid: no subscription holds
 * it, and nothing ends it.
 */
export async function grant(ctx, item, device, sub = null, customer = null, account = '', once = 0) {
  const what = describe(item);
  if (!what || !DEVICE.test(device || '')) return false;
  if (what.kind === 'room') {
    // a room of one's own (urooms.js): made for the account that paid — or woken, if that account had one asleep
    const acct = (typeof account === 'string' && account) || (await accountOf(ctx.store, device))?.name || '';
    const room = await openRoom(ctx, acct, typeof sub === 'string' ? sub : '', typeof customer === 'string' ? customer : '', once > 0);
    if (!room) return false;
    if (room.sub) await ctx.store.put(`sub:${room.sub}`, { room: room.id, device, at: ctx.now() });
    await leaveNote(ctx, device, `Your room is ready: "${room.name}"${once > 0 ? ' — yours for good' : ''}. Its link is in "Who is here" — only those you give it to can come.`);
    return true;
  }
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
  slots[item] = { ...(slots[item] || { state: 'paid', logo: 0 }), by: device, sub: typeof sub === 'string' ? sub : null, ...(typeof customer === 'string' && customer && { customer }), ...(once > 0 && { paid: once, life: true }), at: ctx.now() };
  await ctx.store.put('slots', slots);
  return true;
}

/**
 * A word of thanks, by e-mail, to whoever has just taken the Game Pass — where the host sends e-mail and an
 * address is known: the one of their account or, failing that, the one they gave at the payment (used for
 * this message and kept nowhere). It leaves without anybody waiting for it; once per payment (the caller sees to it).
 */
async function thankForPass(ctx, o, site) {
  if (!ctx.mail) return;
  const acct = await accountOf(ctx.store, o.metadata?.device);
  const to = acct?.email || cleanEmail(o.customer_details?.email || o.customer_email || '');
  if (to) mailLater(ctx, { to, ...passMail(site || '', acct?.name || '', { perks: PASS.perks, cents: PASS.price }) });
}

/** A word for a visitor who is not there: they are told the next time their browser asks about the shop. */
async function leaveNote(ctx, device, text) {
  if (!DEVICE.test(device || '')) return;
  const rec = (await ctx.store.get(`own:${device}`)) || { items: [] };
  await ctx.store.put(`own:${device}`, { ...rec, notes: [...(rec.notes || []), text].slice(-5) });
}

/** Gives a payment back, and writes it down (a refund that fails is kept for the administrator). */
// What was kept when something was taken down — or could not be given back — given back after all: the owner's
// choice, from the list of refunds. True when Stripe did it, false when it refused, null when there is no such payment.
async function refundLater(ctx, cfg, pay) {
  const list = (await ctx.store.get('refunds')) || [], entry = [...list].reverse().find((e) => e.pay === pay && !e.ok);
  if (!entry) return null;
  try { await refundPayment(cfg, pay, entry.why, ctx.fetch || fetch); entry.ok = true; entry.at = ctx.now(); delete entry.kept; delete entry.error; } catch (err) { entry.error = String(err.message || err).slice(0, 160); console.error('[shop] refund', entry.error); }
  await ctx.store.put('refunds', list);
  if (entry.ok) {
    await noteRefund(ctx.store, { cents: entry.amount }, ctx.now()).catch(() => {});
    if (entry.by) await leaveNote(ctx, entry.by, 'The fair has refunded your payment in full.');
  }
  return entry.ok;
}

async function refund(ctx, cfg, pay, amount, why) {
  const entry = { pay, amount, at: ctx.now(), why, ok: true };
  try { await refundPayment(cfg, pay, why, ctx.fetch || fetch); } catch (err) { entry.ok = false; entry.error = String(err.message || err).slice(0, 160); console.error('[shop] refund', entry.error); }
  await ctx.store.put('refunds', [...((await ctx.store.get('refunds')) || []), entry].slice(-100));
  if (entry.ok) await noteRefund(ctx.store, { cents: amount }, ctx.now()).catch(() => {}); // (the figures: what the shop earned)
  return entry.ok;
}

/** Has this payment been counted already? (Stripe may say the same thing twice.) The last few hundred are remembered. */
/** What a place is called in a sentence: "the board of Mostly Up", "gondola 3 of the big wheel"… */
const placeOf = (sold) => (sold.label ? `the board of ${sold.label}` : sold.name.replace(/^Atomic Oasis — /, ''));
// (what the whole fair is told when a new sponsor's panel goes up: its name, the place — and due praise)
const CHEERS = [
  (n, p) => `${n} now sponsors ${p}! Praise be to the gods of the Atomic Oasis: the fair stays free.`,
  (n, p) => `Rejoice! ${n} is the new sponsor of ${p}. The gods of the nuclear oasis are pleased — and so is the electricity bill.`,
  (n, p) => `Glory to the gods of the Atomic Oasis! ${n} has just sponsored ${p}. Go and thank them: the fair stays free.`,
];

/**
 * A word of thanks, by e-mail, to whoever has just sponsored something — where the host sends e-mail and an
 * address is known: the one of their account or, failing that, the one they gave at the payment (used for
 * this message and kept nowhere). Once per payment (the caller sees to it).
 */
async function thankSponsor(ctx, o, site, sold) {
  if (!ctx.mail) return;
  const acct = await accountOf(ctx.store, o.metadata?.device);
  const to = acct?.email || cleanEmail(o.customer_details?.email || o.customer_email || '');
  if (to) mailLater(ctx, { to, ...sponsorMail(site || '', acct?.name || '', { place: placeOf(sold), cents: Number.isInteger(o.amount_total) ? o.amount_total : 0, monthly: !!sold.monthly, auction: !!sold.auction, plaque: !!sold.plaque, life: !!sold.life }) });
}

/**
 * Stripe says a payment page was completed and paid — by itself (the webhook), or asked as the buyer comes
 * back (/api/checkout/confirm): what was bought is given; the first time it is said, the sale is counted, the
 * buyer thanked. Safe to call twice. → was it given? (The fair is told of a new sponsor when its panel goes up:
 * see /api/sponsor.)
 */
async function completed(ctx, cfg, o, site) {
  const now = ctx.now();
  // (the figures: what came in, once — a bid that comes too late is given back at once, and counted as given back)
  // (bought for good — a gondola, a room —: the payment page was asked for with `life`, and carries it)
  const named = describe(o.metadata?.item), sold = named && o.metadata?.life ? forLife(named) : named, fresh = sold ? await firstTime(ctx, o.id) : false; // (fresh: it is said for the first time)
  if (!sold) return false;
  if (fresh) await noteSale(ctx.store, { cents: Number.isInteger(o.amount_total) ? o.amount_total : 0, pass: sold.kind === 'pass' }, now).catch(() => {});
  const got = sold.auction ? await takeBid(ctx, cfg, o.metadata.item, o.metadata?.device, o.amount_total, o.payment_intent)
    : await grant(ctx, o.metadata?.item, o.metadata?.device, o.subscription, o.customer, o.metadata?.account, sold.life ? (Number.isInteger(o.amount_total) && o.amount_total > 0 ? o.amount_total : sold.amount) : 0);
  if (got && fresh && sold.kind === 'pass') await thankForPass(ctx, o, site);
  if (got && fresh && sold.kind === 'slot') await thankSponsor(ctx, o, site, sold).catch(() => {});
  return got;
}

async function firstTime(ctx, id) {
  if (typeof id !== 'string' || !id) return true;
  const seen = (await ctx.store.get('sales:seen')) || [];
  if (seen.includes(id)) return false;
  await ctx.store.put('sales:seen', [...seen, id].slice(-300));
  return true;
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

/** What the holder of a place asked to show is shown: its words, its link, its picture. */
async function publish(ctx, slots, id) {
  const s = slots[id];
  if (!s?.draft) return;
  if (s.draft.logo > 0) { await ctx.store.put(`logo:${id}`, await ctx.store.get(`logo:${id}:draft`)); s.logo = s.draft.logo; }
  else if (s.draft.logo === 0) { await ctx.store.delete(`logo:${id}`); s.logo = 0; }
  Object.assign(s, { state: 'live', title: s.draft.title, subtitle: s.draft.subtitle, url: s.draft.url });
  await ctx.store.delete(`logo:${id}:draft`);
  s.draft = null;
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
    const device = query.get('device') || '', mine = DEVICE.test(device), slots = await slotsOf(ctx), view = {}, me = mine ? await selves(ctx, device) : new Set(), hidden = await hiddenBy(ctx);
    for (const [id, s] of Object.entries(slots)) {
      // (what somebody kept out in silence had put up is shown to them alone)
      view[id] = s.state === 'live' && (me.has(s.by) || !(await hidden(s))) ? { state: 'live', ...shown(id, s) } : { state: 'taken' };
      if (describe(id)?.auction) Object.assign(view[id], { bid: s.bid || 0, next: nextBid(s.bid || 0) }); // (what it went for, what beats it)
      if (view[id].state === 'live') { const pays = paysOf(id, s, now); if (pays) view[id].pays = pays; } // (what its sponsor pays: with what they show, never without)
      if (mine && me.has(s.by)) Object.assign(view[id], { mine: true, paid: true, draft: draftOf(id, s), ...(s.sub && s.customer && { manage: true }), ...(s.life && { life: true }) }); // (manage: held by the month — its subscription can be looked after)
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
    // (`what: 'room'`: the subscription of their room, rather than the Game Pass)
    const mine = body.what === 'room' && (await userRoomsOn(ctx)) && holder.account ? await roomOfAccount(ctx, holder.account) : null;
    // (`what: '<a place>'`: the subscription of a place they hold by the month — a gondola, a backdrop, a village)
    const place = typeof body.what === 'string' && body.what.includes(':') ? (await slotsOf(ctx))[body.what] : null;
    const theirs = place && place.customer && (await selves(ctx, device)).has(place.by);
    const customer = theirs ? place.customer : body.what === 'room' ? (mine?.state === 'live' && mine.customer) || '' : place ? '' : passLive(holder.pass, now) ? holder.pass.customer || '' : '';
    if (!customer) return out(404, { error: 'There is no subscription to look after.' });
    try {
      return out(200, await createPortal(cfg, customer, req.site || '', ctx.fetch || fetch));
    } catch (err) {
      console.error('[shop]', err.message);
      return out(502, { error: 'That page could not be opened. Try again in a moment.' });
    }
  }

  if (path === '/api/checkout') {
    if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (!cfg.mode) return out(501, { error: 'The shop is not open.' });
    if (limited('checkout')) return busy;
    // (`life`: a gondola or a room bought for good, paid once, instead of held by the month — the buyer's choice)
    const what = body?.life === true ? forLife(describe(body?.item)) : describe(body?.item), device = body?.device;
    if (!what || !DEVICE.test(device || '') || itemOf(what.item)?.retired) return out(400, { error: 'Nothing of that name is sold.' }); // (what is retired is no longer sold)
    // (a sky village is only for hire once the sky is open: the owner's switch)
    if (what.item.startsWith('village:') && (await readRelease(ctx)).release.sky !== 'open') return out(400, { error: 'Nothing of that name is sold.' });
    // (…and the panel of a game that waits for its switch, once that game is on: its board does not exist before)
    if (what.item.startsWith('board:')) { const sw = SCORE_BOARDS[what.game || what.item.slice(6)]?.release; if (sw && !(await readRelease(ctx)).release[sw]) return out(400, { error: 'Nothing of that name is sold.' }); }
    if (what.kind === 'own' && (await ownedBy(ctx, device)).includes(what.item)) return out(409, { error: 'You already have it.' });
    if (what.kind === 'pass') { const holder = await holderOf(ctx.store, device); if (passLive(holder.pass, now) && !holder.pass.gift) return out(409, { error: 'You already have the pass.' }); }
    let extra = {};
    if (what.kind === 'room') {
      // a room of one's own: while they are switched on, for an account, one each
      if (!(await userRoomsOn(ctx))) return out(400, { error: 'Nothing of that name is sold.' });
      const acct = await accountOf(ctx.store, device);
      if (!acct) return out(403, { error: 'A room takes an account: create one first (it is free).', account: true });
      if ((await roomOfAccount(ctx, acct.name))?.state === 'live') return out(409, { error: 'You already have a room.' });
      extra = { account: acct.name };
    }
    if (what.auction) {
      // an auction: the bid must beat what the place went for (and be a sum Stripe can take)
      const bid = Math.round(Number(body.bid)), least = nextBid((await slotsOf(ctx))[what.item]?.bid || 0);
      if (!Number.isFinite(bid) || bid < least) return out(409, { error: `The bid must be at least $${(least / 100).toFixed(2).replace(/\.00$/, '')}.`, next: least });
      if (bid > AUCTION.max) return out(400, { error: 'That is more than can be bid here.' });
      what.amount = bid;
      extra = { bid };
    } else if (what.kind === 'slot' && (await slotsOf(ctx))[what.item]) return out(409, { error: 'Somebody already has it.' });
    if (what.life) extra = { ...extra, life: 1 };
    try {
      const embed = body.embed === true && !!cfg.publishable; // (the form inside the game: only where its key was given)
      const session = await createCheckout(cfg, { ...what, currency: CURRENCY }, device, req.site || '', ctx.fetch || fetch, extra, embed);
      return out(200, embed ? { secret: session.secret, id: session.id } : { url: session.url });
    } catch (err) {
      console.error('[shop]', err.message);
      return out(502, { error: 'The payment page could not be opened. Try again in a moment.' });
    }
  }

  if (path === '/api/click') {
    // A visitor opens the site of a sponsor from the game — at its place, at the Trading Post, at the wall of
    // thanks: counted on the place (and so for the sponsor: the wall adds up the places of each). The same
    // address counts once every ten minutes for a place; a place that changes hands starts again from nothing.
    if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (limited('click')) return busy;
    const slots = await slotsOf(ctx), id = body?.slot, s = typeof id === 'string' && Object.hasOwn(slots, id) ? slots[id] : null;
    if (!s || s.state !== 'live' || !s.url) return out(404, { error: 'Nothing to count.' });
    const seen = (ctx.clicked ||= new Map()), key = `${req.client}|${id}`, last = seen.get(key) || 0;
    if (now - last >= 600_000) {
      if (seen.size > 5000) seen.clear();
      seen.set(key, now);
      s.clicks = (s.clicks || 0) + 1;
      await ctx.store.put('slots', slots);
    }
    return out(200, { ok: true, clicks: s.clicks || 0 });
  }

  if (path === '/api/checkout/confirm') {
    // The buyer is back from the payment page: Stripe is asked whether that page was paid, and what was bought
    // is given at once — without waiting for Stripe to say so by itself (and where no webhook was set at all).
    // Nothing the browser says is believed: only the session Stripe returns for the id it brings back.
    if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (!cfg.mode) return out(501, { error: 'The shop is not open.' });
    if (limited('checkout')) return busy;
    let o = null;
    try { o = await fetchCheckout(cfg, body?.session, ctx.fetch || fetch); } catch (err) { console.error('[shop]', err.message); return out(502, { error: 'Stripe could not be asked. Try again in a moment.' }); }
    if (!o) return out(404, { error: 'No such payment.' });
    const paid = o.status === 'complete' && (o.payment_status === 'paid' || o.payment_status === 'no_payment_required');
    if (!paid) return out(200, { ok: false, paid: false });
    const given = await completed(ctx, cfg, o, req.site);
    return out(200, { ok: true, paid: true, given: !!given, item: typeof o.metadata?.item === 'string' ? o.metadata.item : '' });
  }

  if (path === '/api/stripe/webhook') {
    if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const event = cfg.webhook ? await verifyWebhook(cfg.webhook, req.raw, req.signature, now) : null;
    if (!event) return out(400, { error: 'Not from Stripe.' });
    const o = event.data?.object || {};
    if (event.type === 'checkout.session.completed' && (o.payment_status === 'paid' || o.payment_status === 'no_payment_required')) {
      await completed(ctx, cfg, o, req.site);
    } else if (event.type === 'invoice.paid' && o.billing_reason === 'subscription_cycle') {
      // a month more of something held by the month (where Stripe is asked to tell of these): money in, nothing new sold
      if (Number.isInteger(o.amount_paid) && o.amount_paid > 0 && (await firstTime(ctx, o.id))) await noteSale(ctx.store, { cents: o.amount_paid }, now).catch(() => {});
    } else if (event.type === 'customer.subscription.deleted') {
      // the subscription ended: the place is free again — or the Game Pass is handed back
      const slots = await slotsOf(ctx), id = Object.keys(slots).find((k) => slots[k].sub && slots[k].sub === o.id);
      if (id) await release(ctx, slots, id);
      const held = typeof o.id === 'string' ? await ctx.store.get(`sub:${o.id}`) : null;
      if (held?.room) {
        // a room of one's own: it falls asleep — nothing is lost for thirty days (urooms.js)
        if (await sleepRoom(ctx, held.room)) await leaveNote(ctx, held.device, 'Your room has fallen asleep: nobody can enter it. It is kept for thirty days — pay for it again and it wakes as it was.');
        await ctx.store.delete(`sub:${o.id}`);
      } else if (held) {
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
    // (what is shown at once to everybody holds none of the words the chat hides: decency.js)
    const draft = { title: maskWords(cleanText(body.title, 28)), subtitle: maskWords(cleanText(body.subtitle, 40)), url: plaque ? '' : cleanUrl(body.url), logo: 0 };
    if (!draft.title) return out(400, { error: 'A name is needed.' });
    if (!plaque && body.url && !draft.url) return out(400, { error: 'The link must start with https://' });
    if (body.logo) {
      const logo = cleanLogo(body.logo);
      if (!logo) return out(400, { error: 'The picture must be a PNG, a JPEG or a WebP of at most 90 KB.' });
      await ctx.store.put(`logo:${id}:draft`, logo);
      draft.logo = now;
    } else if (body.keepLogo && (s.draft?.logo || s.logo)) draft.logo = s.draft?.logo || -1; // (-1: the picture already shown stays)
    s.draft = draft;
    // A sponsor is shown at once — the owner looks afterwards, and takes down what should not be there (the
    // page /admin). A plaque for a companion waits for the fair to have looked at it.
    const first = !plaque && s.state !== 'live' && !req.admin; // (a new sponsor's panel goes up: the whole fair is told)
    if (!plaque) await publish(ctx, slots, id);
    await ctx.store.put('slots', slots);
    if (first && ctx.push) { const what = describe(id); if (what) await Promise.resolve(ctx.push({ t: 'say', m: CHEERS[Math.floor(Math.random() * CHEERS.length)](draft.title, placeOf(what)) })).catch(() => {}); }
    return out(200, { ok: true, state: plaque ? 'pending' : 'live' });
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
    let taken = null; // (what was taken down by this very request, if anything: { removed, refunded, stopped })
    if (method === 'POST' && typeof body?.refund === 'string') {
      // the owner gives back what was kept when something was taken down (or what Stripe had refused to give back)
      if (!req.owner) return out(403, { error: 'Only the owner gives money back.' });
      const done = await refundLater(ctx, cfg, body.refund);
      if (done === null) return out(404, { error: 'No such payment waits to be given back.' });
      taken = { refunded: done };
    } else if (method === 'POST') {
      const id = body?.slot;
      if (typeof id !== 'string' || !describe(id) || describe(id).kind !== 'slot') return out(400, { error: 'No such place.' });
      if (body.set) {
        // the administrator fills a place by hand (a sponsor who paid some other way)
        const title = cleanText(body.set.title, 28);
        if (!title) return out(400, { error: 'A name is needed.' });
        const s = (slots[id] ||= { by: 'admin', sub: null, at: now, logo: 0 });
        Object.assign(s, { state: 'live', title, subtitle: cleanText(body.set.subtitle, 40), url: describe(id).plaque ? '' : cleanUrl(body.set.url), draft: null });
        if (body.set.bg !== undefined) s.bg = cleanColor(body.set.bg); // (the colour behind it: the administrator's choice, never the sponsor's)
        // (what a sponsor who paid some other way has paid, for the wall of thanks: the administrator's word)
        if (body.set.paid !== undefined) { const paid = Math.round(Number(body.set.paid)); if (paid > 0 && paid <= 100_000_000) s.paid = paid; else delete s.paid; }
        if (body.set.logo) {
          const logo = cleanLogo(body.set.logo);
          if (!logo) return out(400, { error: 'The picture must be a PNG, a JPEG or a WebP of at most 90 KB.' });
          await ctx.store.put(`logo:${id}`, logo);
          s.logo = now;
        }
      } else {
        const s = slots[id];
        if (!s || !s.draft) return out(404, { error: 'Nothing awaits approval there.' });
        if (body.approve) await publish(ctx, slots, id);
        else { await ctx.store.delete(`logo:${id}:draft`); s.draft = null; }
      }
      await ctx.store.put('slots', slots);
    } else if (method === 'DELETE') {
      const id = query.get('slot') || '';
      if (!slots[id]) return out(404, { error: 'No such place.' });
      // The administrator takes a sponsor down. Nothing is given back by itself: the money is kept unless the
      // owner says otherwise — `refund=1`: a bid is given back in full, and of a place paid by the month the month
      // that is running. A place paid by the month stops being paid from now on in any case. A bid that was
      // kept is written down with the refunds: the owner can still give it back later.
      const gone = slots[id], back = query.get('refund') === '1';
      if (back && !req.owner) return out(403, { error: 'Only the owner gives money back.' });
      let refunded = false, stopped = false;
      if (gone.pay && back) refunded = await refund(ctx, cfg, gone.pay, gone.bid || 0, `removed from ${id}`);
      else if (gone.pay) await ctx.store.put('refunds', [...((await ctx.store.get('refunds')) || []), { pay: gone.pay, amount: gone.bid || 0, at: now, why: `taken down from ${id}`, ok: false, kept: true, by: gone.by }].slice(-100));
      if (gone.sub && cfg.key) {
        try { const done = await endSubscription(cfg, gone.sub, back, ctx.fetch || fetch); stopped = true; refunded = refunded || done.refunded; } catch (err) { console.error('[shop] subscription', String(err.message || err).slice(0, 160)); }
      }
      const what = describe(id)?.plaque ? 'plaque' : 'panel';
      await leaveNote(ctx, gone.by, gone.pay && refunded ? `The fair took your ${what} down: your payment has been refunded in full.`
        : stopped ? `The fair took your ${what} down: ${refunded ? 'the month you paid has been refunded, and ' : ''}nothing more will be charged for it.` : `The fair took your ${what} down.`);
      await release(ctx, slots, id);
      taken = { removed: id, refunded, stopped };
    } else if (!reading) return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD, POST, DELETE' });
    return out(200, {
      ...taken,
      // (the money given back — and what was kept, or could not be given back: `kept`, `ok: false`)
      refunds: ((await ctx.store.get('refunds')) || []).slice(-30).reverse().map(({ by, ...r }) => r),
      slots: Object.fromEntries(Object.entries(slots).map(([id, s]) => [id, { state: s.state, by: s.by, sub: !!s.sub, at: s.at, ...(s.bid && { bid: s.bid }), ...(s.paid && { paid: s.paid }), ...shown(id, s), draft: draftOf(id, s) }])),
    });
  }
  return null;
}
