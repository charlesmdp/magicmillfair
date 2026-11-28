// The sales: one list of everything that was bought — a hat, the Game Pass, a room, a sponsor's place, a bid —
// and the way to give a payment back, in whole or in part. The owner's alone (the tab "Sales" of /admin:
// public/admin/sales.js). Both hosts answer through salesRoute() (see routes.js).
//
//   GET  /api/sales?q=…&before=…        → { mode, stripe, sales: [a line each, the newest first], more, before,
//                                          totals: { count, sums: [{ currency, paid, back }] }, hidden, fill }
//                                          (q: a name, an e-mail, a thing, a reference of Stripe; totals: of every
//                                          sale that matches, not only of the lines sent; hidden: how many sales
//                                          of the other mode — test, live — are not counted)
//   GET  /api/sales?look=<id>            → { sale, look }   one sale as Stripe has it now: what is left to give back,
//                                          and what giving it back will do to what was bought (said in words)
//   POST /api/sales { refund: <id>, all: true | amount: cents, reason?, keep?, token }
//                                        → { ok, refunded, full, took, kept, stopped, unstopped, uncredited, sale }
//   POST /api/sales { fetch: true }      → { done, seen, added, updated, other }   a page more of what Stripe
//                                          remembers is written in the list (each call goes on from the last)
//
// The rules of a refund. A payment is given back by Stripe and by nobody else; what Stripe refuses changes
// nothing here. Never more than what is left of the payment — asked of Stripe at that very moment, not believed
// from the page. What is paid by the month is given back a month at a time: the latest invoice paid. A FULL
// refund (nothing is left of the payment) takes back what was bought — the thing leaves the wardrobe (unless it
// was paid twice: the other payment still holds it), a Game Pass ends now, a room falls asleep, a sponsor's place
// is freed; what is paid by the month stops being charged — unless the owner says they keep it (`keep`). A
// PARTIAL refund changes nothing else. The same click said twice is one refund: `token` is drawn by the page
// once per intention, kept with the refund, and is Stripe's idempotency key; and one sale is given back by one
// request at a time.
//
// The ledger. shop.js tells of each sale as Stripe says it was paid (noteSold), of each payment it gives back by
// itself — outbid, too late, taken down — (noteBack), and hands on what else Stripe says (heard: a month more, a
// subscription that ended, a refund made in Stripe itself, a dispute). Nothing here ever stands in the way of a
// sale: what cannot be written is logged and forgotten.
//
// Kept: `sale:<id>` → one record a sale (id: Stripe's name of its payment page, cs_…) — { id, at, item, life,
// device, account (its name when it was bought), amount, currency, test, pay, sub, customer, invoice, paid and
// paidAt (the payment the line shows: of what is paid by the month, the latest), total and months (all that came
// in), back (all that went back), backNow (…of the payment the line shows), ended, taken, kept, lost, dispute,
// log: [the last few things that happened to it: { at, cents, by, why, token, re }] }; `saleref:<pi_… | sub_…>`
// → { id } (the sale a payment or a subscription belongs to); `sales:fill` → where the reading of Stripe's own
// list stands. The address a buyer gave Stripe is never kept (the privacy page says so): it is asked of Stripe
// when it is needed. One record a sale: nothing here grows with the number of sales.
import { describe, forLife, CURRENCY } from './catalog.js';
import { itemOf, PASS } from './items.js';
import { accountOf, sameOwner } from './accounts.js';
import { noteRefund } from './stats.js';
import { refundPayment, endSubscription } from './stripe.js';
import { roomOfAccount, sleepRoom, userRoom } from './urooms.js';
import { cleanEmail } from './mail.js';
import { leaveNote, tellSponsor, tellOwnerRefund, release, placeOf, cleanText } from './shop.js';

const out = (status, body, headers = {}) => ({ status, body, headers });
const DEVICE = /^[A-Za-z0-9_-]{16,64}$/, TOKEN = /^[A-Za-z0-9_-]{8,64}$/;
const KEY = 'sale:', REF = 'saleref:', FILL = 'sales:fill';
/** Lines sent at a time; things remembered of one sale; payment pages read from Stripe at a time (a Worker may ask so much in one request). */
const PAGE = 50, LOG = 12, FILL_PAGE = 20;
const idOf = (v) => (typeof v === 'string' ? v : typeof v?.id === 'string' ? v.id : '');
const is = (v, p) => typeof v === 'string' && new RegExp(`^${p}_[A-Za-z0-9_]{4,250}$`).test(v);
const cents = (v) => (Number.isInteger(v) && v > 0 ? v : 0);
const ms = (seconds) => (Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0);
const said = (err) => String(err?.message || err).slice(0, 200);
/** $9.99, $30, 12.50 EUR — from cents. */
export const money = (c, currency = CURRENCY) => (String(currency || CURRENCY).toLowerCase() === 'usd' ? `$${(c / 100).toFixed(2).replace(/\.00$/, '')}` : `${(c / 100).toFixed(2)} ${String(currency).toUpperCase()}`);

// ---------------------------------------------------------------------------------------------- what was bought

/** The thing sold, as the catalog has it now (null: nothing of that name is sold any more). */
const soldOf = (e) => { const named = describe(e.item); return named && e.life ? forLife(named) || named : named; };

/** What a sale is, in plain words: "Top hat", "Game Pass — monthly", "Gondola 3 — for good", "Bid on the panel of Spiral of Death". */
export function wordsOf(e) {
  const item = String(e.item || ''), [type, id = ''] = item.split(':'), how = e.life ? 'for good' : 'monthly', what = describe(item);
  if (itemOf(item)) return itemOf(item).name;
  if (item === PASS.id) return `${PASS.name} — monthly`;
  if (item === 'room') return `A room of one's own — ${how}`;
  if (type === 'board') return `Bid on the panel of ${what?.label || id}`;
  if (type === 'gondola') return `Gondola ${id} — ${how}`;
  if (type === 'hut') return `Beach hut ${id} — ${how}`;
  if (type === 'tarp') return 'The backdrop of Bullseye Alley — monthly';
  if (type === 'village') return `${what ? what.name.replace(/^Atomic Oasis — the /, 'The ') : `The sky village ${id}`} — monthly`;
  if (type === 'plaque') return `Plaque no. ${id} for a companion`;
  return item || 'Something';
}
/** …and in a sentence: "the Top hat", "the Game Pass", "your room", "gondola 3 of the big wheel". */
const thingOf = (e) => { const what = describe(e.item); return !what ? `"${e.item}"` : what.kind === 'room' ? 'the room' : what.kind === 'own' || what.kind === 'pass' ? `the ${placeOf(what)}` : placeOf(what); };

// ------------------------------------------------------------------------------------------------- the ledger

const read = async (ctx, id) => (id ? (await ctx.store.get(KEY + id)) || null : null);
const write = (ctx, e) => ctx.store.put(KEY + e.id, e);
/** The sale a payment (pi_…) or a subscription (sub_…) belongs to, or null. */
async function byRef(ctx, ref) { const r = ref ? await ctx.store.get(REF + ref) : null; return r?.id ? read(ctx, r.id) : null; }
const point = async (ctx, ref, id) => { if (ref && (await ctx.store.get(REF + ref))?.id !== id) await ctx.store.put(REF + ref, { id }); };
/** Something happened to a sale: written at the end of what is remembered of it (the last few). */
const logged = (e, line) => [...(e.log || []), line].slice(-LOG);

/** A payment page Stripe says was paid, as the ledger keeps it. `o`: the page (a Checkout Session). */
function fromSession(o, cfg, now) {
  const m = o.metadata || {}, sold = describe(m.item), life = !!m.life && !!forLife(sold);
  const amount = Number.isInteger(o.amount_total) && o.amount_total >= 0 ? o.amount_total : (life ? forLife(sold) : sold)?.amount || 0;
  const at = ms(o.created) || now, sub = idOf(o.subscription);
  return {
    id: idOf(o.id), at, item: String(m.item || '').slice(0, 60), ...(life && { life: true }), device: DEVICE.test(m.device || '') ? m.device : '', account: typeof m.account === 'string' ? m.account.slice(0, 40) : '',
    amount, currency: String(o.currency || CURRENCY).toLowerCase().slice(0, 8), test: typeof o.livemode === 'boolean' ? !o.livemode : cfg?.mode !== 'live',
    pay: idOf(o.payment_intent), sub, customer: idOf(o.customer), invoice: idOf(o.invoice),
    paid: amount, paidAt: at, total: amount, months: sub ? 1 : 0, back: 0, backNow: 0, log: [],
  };
}

/**
 * Stripe says a payment page was paid (shop.js: completed — the webhook, or the buyer coming back): the sale is
 * written in the list, once. Safe to call twice. Resolves to its name in the list ('' when it could not be written).
 */
export async function noteSold(ctx, cfg, o) {
  try {
    if (!o || typeof o.metadata?.item !== 'string') return '';
    const now = ctx.now(), fresh = fromSession(o, cfg, now);
    // (a page without a name — Stripe always gives one; the tests do not —: that of its payment, or one drawn here)
    fresh.id ||= fresh.pay || fresh.sub || `x_${now.toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
    const old = await read(ctx, fresh.id);
    if (!old) {
      if (!fresh.account) fresh.account = (await accountOf(ctx.store, fresh.device))?.name || '';
      await write(ctx, fresh);
    } else if (['pay', 'sub', 'customer', 'invoice'].some((k) => !old[k] && fresh[k])) {
      // (said again — by Stripe itself, or as the buyer comes back — with a reference the first word did not carry)
      await write(ctx, { ...old, pay: old.pay || fresh.pay, sub: old.sub || fresh.sub, customer: old.customer || fresh.customer, invoice: old.invoice || fresh.invoice });
    }
    await point(ctx, fresh.pay, fresh.id);
    await point(ctx, fresh.sub, fresh.id);
    return fresh.id;
  } catch (err) { console.error('[sales] a sale', said(err)); return ''; }
}

/** …paid, but what was bought could not be given (somebody had the place already): for the owner to give back. */
export async function noteLost(ctx, id) {
  try { const e = await read(ctx, id); if (e && !e.lost) await write(ctx, { ...e, lost: true }); } catch (err) { console.error('[sales] a sale', said(err)); }
}

/**
 * A payment was given back by the shop itself (shop.js: outbid, too late, taken down, given back later) — in
 * full — or Stripe refused to (`ok` false: `error`). `pay` or `sub`: which; `cents`: how much; `by`: 'auction',
 * 'fair' (taken down) or 'owner'. Written on its sale, if the list has it.
 */
export async function noteBack(ctx, { pay = '', sub = '', cents: sum = 0, by = 'fair', why = '', ok = true, error = '' } = {}) {
  try {
    const e = (await byRef(ctx, pay)) || (await byRef(ctx, sub));
    if (!e) return;
    const now = ctx.now(), line = { at: now, cents: cents(sum), by, ...(why && { why: String(why).slice(0, 120) }) };
    if (!ok) { await write(ctx, { ...e, log: logged(e, { ...line, failed: String(error || 'Stripe refused').slice(0, 160) }) }); return; }
    await write(ctx, given(e, e.paid, line));
  } catch (err) { console.error('[sales] a refund', said(err)); }
}

/**
 * Money went back: `upTo` cents of the payment the line shows are given back by now (Stripe counts them together,
 * and so does this: what Stripe itself told first — its webhook may speak before the request that asked — is not
 * counted twice; its line takes the name of who asked). → the record to write.
 */
function given(e, upTo, line) {
  const goal = Math.min(Math.max(upTo, 0), Math.max(e.paid, e.backNow));
  if (goal <= e.backNow) {
    // (already counted, on Stripe's own word: that line is this refund)
    const log = [...(e.log || [])], i = log.findLastIndex((l) => l.by === 'stripe' && !l.failed);
    if (i >= 0 && line.by !== 'stripe') log[i] = { ...log[i], ...line, at: log[i].at, cents: log[i].cents };
    return { ...e, log };
  }
  const more = goal - e.backNow;
  return { ...e, back: (e.back || 0) + more, backNow: goal, log: logged(e, { ...line, cents: more }) };
}

/** What else Stripe says (shop.js hands every event of its webhook on): a month more, an end, a refund made at Stripe, a dispute. */
export async function heard(ctx, cfg, event) {
  try {
    const o = event?.data?.object || {}, now = ctx.now(), type = String(event?.type || '');
    if (type === 'invoice.paid' && o.billing_reason === 'subscription_cycle') {
      // a month more of something held by the month: it is the payment its line shows from now on
      const e = await byRef(ctx, idOf(o.subscription) || idOf(o.parent?.subscription_details?.subscription)), paid = cents(o.amount_paid), at = ms(o.status_transitions?.paid_at) || ms(o.created) || now;
      if (!e || !paid || e.invoice === o.id || at <= e.paidAt) return;
      const pay = idOf(o.payment_intent);
      await write(ctx, { ...e, months: (e.months || 1) + 1, total: (e.total || 0) + paid, paid, paidAt: at, invoice: idOf(o.id), pay, backNow: 0 });
      await point(ctx, pay, e.id);
    } else if (type === 'customer.subscription.deleted') {
      const e = await byRef(ctx, idOf(o.id));
      if (e && !e.ended) await write(ctx, { ...e, ended: ms(o.ended_at) || now });
    } else if (type === 'charge.refunded') {
      // money given back at Stripe: by the shop itself (it writes it down too: counted once), or by hand in Stripe
      const e = await byRef(ctx, idOf(o.payment_intent));
      if (e && e.pay === idOf(o.payment_intent) && cents(o.amount_refunded) > e.backNow) await write(ctx, given(e, cents(o.amount_refunded), { at: now, cents: 0, by: 'stripe' }));
    } else if (type.startsWith('charge.dispute.')) {
      // the buyer's bank takes the payment back (a "chargeback"): said on the line; lost, it is money gone back
      const e = await byRef(ctx, idOf(o.payment_intent));
      if (!e) return;
      const was = e.dispute || {}, lost = o.status === 'lost';
      let next = { ...e, dispute: { at: was.at || now, status: String(o.status || '').slice(0, 40), amount: cents(o.amount), reason: String(o.reason || '').slice(0, 40), ...((was.counted || lost) && { counted: true }) } };
      if (lost && !was.counted) next = given(next, next.backNow + cents(o.amount), { at: now, cents: 0, by: 'dispute' });
      await write(ctx, next);
    }
  } catch (err) { console.error('[sales] an event', said(err)); }
}

// ------------------------------------------------------------------------------------------- what the page reads

/** Every sale of the list. */
const everySale = async (ctx) => (ctx.store.list ? (await ctx.store.list(KEY)).map(([, e]) => e).filter((e) => e && typeof e.id === 'string') : []);

/**
 * Who bought: the account the browser is signed in to now — or the one it was in when it bought — with its
 * address when it gave one; a browser without an account otherwise (the first characters of its name).
 */
async function people(ctx) {
  const accts = new Map(), devs = new Map();
  if (ctx.store.list) {
    for (const [k, a] of await ctx.store.list('acct:')) if (a?.name) accts.set(k.slice(5), a);
    for (const [k, d] of await ctx.store.list('dev:')) if (d?.acct) devs.set(k.slice(4), d.acct);
  }
  return (e) => {
    const now = accts.get(devs.get(e.device)), a = (now?.devices?.includes(e.device) && now) || accts.get(String(e.account || '').toLowerCase());
    return { name: a?.name || '', email: a?.email || '', short: String(e.device || '').slice(0, 8) };
  };
}

/** Where a payment is looked at in Stripe's own dashboard, when its reference is known. */
const stripeLink = (e) => {
  const base = `https://dashboard.stripe.com/${e.test ? 'test/' : ''}`;
  return is(e.pay, 'pi') ? `${base}payments/${e.pay}` : is(e.sub, 'sub') ? `${base}subscriptions/${e.sub}` : '';
};

/** A sale as the page shows it (never the whole name of a browser, never a reference but in the link). */
function shown(e, who) {
  const what = soldOf(e), left = Math.max(0, (e.paid || 0) - (e.backNow || 0)), d = e.dispute, open = !!d && !['won', 'lost', 'warning_closed'].includes(d.status);
  return {
    id: e.id, at: e.at, who, what: wordsOf(e), kind: what?.kind || '', monthly: !!e.sub, life: !!e.life,
    amount: e.amount || 0, currency: e.currency || CURRENCY, paid: e.paid || 0, paidAt: e.paidAt || e.at, total: e.total || 0, months: e.months || 0,
    back: e.back || 0, left,
    // (where it stands: paid · part of it given back · all of it given back — of what is paid by the month, the latest payment)
    state: open ? 'disputed' : !e.backNow ? 'paid' : left ? 'part' : 'refunded', backNow: e.backNow || 0,
    ...(e.ended && { ended: e.ended }), ...(e.taken && { taken: e.taken }), ...(e.kept && { kept: true }), ...(e.lost && { lost: true }), ...(e.test && { test: true }),
    ...(d && { dispute: { status: d.status, amount: d.amount, at: d.at } }),
    link: stripeLink(e),
    // (can it be given back from here: something is left of it, and Stripe knows which payment it is)
    can: left > 0 && !open && (is(e.pay, 'pi') || is(e.sub, 'sub')),
    log: (e.log || []).map((l) => ({ at: l.at, cents: l.cents || 0, by: l.by, ...(l.why && { why: l.why }), ...(l.failed && { failed: l.failed }), ...(l.kept && { kept: true }), ...(l.took && { took: true }) })),
  };
}

const newest = (a, b) => b.at - a.at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

async function listSales(req, ctx, cfg) {
  const q = cleanText(req.query.get('q'), 80).toLowerCase(), before = /^(\d{1,16}):(.{1,300})$/.exec(req.query.get('before') || '');
  const mode = cfg.mode || null, who = await people(ctx), sales = await everySale(ctx);
  // (the sales of the other mode — the test payments, once the shop sells for real — are neither listed nor counted)
  const mine = mode ? sales.filter((e) => !!e.test === (mode === 'test')) : sales;
  // (somebody's address at Stripe: asked of Stripe now, for this search — and kept nowhere)
  const asked = new Map();
  if (q && cfg.key && cleanEmail(q) === q) {
    try {
      const res = await (ctx.fetch || fetch)(`${cfg.api}/v1/checkout/sessions?customer_details[email]=${encodeURIComponent(q)}&limit=100`, { headers: { Authorization: `Bearer ${cfg.key}` }, signal: AbortSignal.timeout(8000) });
      for (const s of (await res.json().catch(() => null))?.data || []) if (typeof s?.id === 'string') asked.set(s.id, q);
    } catch { /* Stripe cannot be asked just now: the search goes on with what is kept here */ }
  }
  const lines = [];
  for (const e of mine) {
    const w = who(e);
    if (asked.has(e.id) && !w.email) w.email = asked.get(e.id);
    if (q && !asked.has(e.id) && !`${w.name} ${w.email} ${w.short} ${wordsOf(e)} ${e.item} ${e.id} ${e.pay} ${e.sub}`.toLowerCase().includes(q)) continue;
    lines.push([e, w]);
  }
  lines.sort((a, b) => newest(a[0], b[0]));
  const sums = new Map();
  for (const [e] of lines) { const s = sums.get(e.currency || CURRENCY) || { currency: e.currency || CURRENCY, paid: 0, back: 0 }; s.paid += e.total || 0; s.back += e.back || 0; sums.set(s.currency, s); }
  const from = before ? lines.findIndex(([e]) => e.at < Number(before[1]) || (e.at === Number(before[1]) && e.id < before[2])) : 0;
  const page = from < 0 ? [] : lines.slice(from, from + PAGE), last = page[page.length - 1]?.[0];
  const fill = (await ctx.store.get(FILL)) || null;
  return out(200, {
    mode, stripe: !!cfg.mode, sales: page.map(([e, w]) => shown(e, w)), more: from >= 0 && from + PAGE < lines.length, before: last ? `${last.at}:${last.id}` : '',
    totals: { count: lines.length, sums: [...sums.values()] }, hidden: sales.length - mine.length,
    fill: fill ? { at: fill.at || 0, done: fill.done || 0, seen: fill.seen || 0, added: fill.added || 0, updated: fill.updated || 0 } : null,
  });
}

// ---------------------------------------------------------------------------------------------- asking Stripe

/** A question to Stripe: the answer, or an error that carries Stripe's `code` and `status` (0: it could not be reached). */
async function ask(ctx, cfg, path) {
  let res;
  try { res = await (ctx.fetch || fetch)(`${cfg.api}${path}`, { headers: { Authorization: `Bearer ${cfg.key}` }, signal: AbortSignal.timeout(8000) }); } catch (err) { throw Object.assign(new Error(`Stripe cannot be reached: ${said(err)}`), { status: 0 }); }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) throw Object.assign(new Error(`Stripe: ${body?.error?.message || res.status}`), { status: res.status, code: String(body?.error?.code || '') });
  return body;
}
const enc = encodeURIComponent;
/** The charge of a payment as Stripe returns it with `latest_charge` — or, before Stripe had that, its list of charges. */
const chargeOf = (pi) => (pi?.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : pi?.charges?.data?.[0]) || null;
/** The invoices paid of a subscription, the latest first: how many months, how much in all, the latest one. */
async function monthsOf(ctx, cfg, sub) {
  const list = (await ask(ctx, cfg, `/v1/invoices?subscription=${enc(sub)}&status=paid&limit=100`)).data || [], paid = list.filter((v) => cents(v?.amount_paid));
  return { months: paid.length, total: paid.reduce((n, v) => n + v.amount_paid, 0), latest: paid[0] || null };
}

/**
 * The payment a line shows, as Stripe has it now: { paid, back (given back already), pay, invoice, at, email (the
 * address given at the payment: shown, never kept), active (what is paid by the month still runs), disputed,
 * months, total }. Throws when Stripe cannot be asked.
 */
async function look(ctx, cfg, e) {
  const seen = { paid: e.paid || 0, back: e.backNow || 0, pay: e.pay || '', invoice: e.invoice || '', at: e.paidAt || e.at, email: '', active: false, disputed: false, months: e.months || 0, total: e.total || 0 };
  if (is(e.sub, 'sub')) {
    const all = await monthsOf(ctx, cfg, e.sub), v = all.latest;
    if (v) Object.assign(seen, { months: all.months, total: all.total, invoice: idOf(v.id), paid: v.amount_paid, at: ms(v.status_transitions?.paid_at) || ms(v.created) || seen.at, pay: idOf(v.payment_intent), back: cents(v.post_payment_credit_notes_amount), email: typeof v.customer_email === 'string' ? v.customer_email : '' });
    const sub = await ask(ctx, cfg, `/v1/subscriptions/${enc(e.sub)}`);
    seen.active = !['canceled', 'incomplete_expired'].includes(sub.status);
    if (!seen.active) seen.ended = ms(sub.ended_at) || ms(sub.canceled_at) || ctx.now();
  }
  if (is(seen.pay, 'pi')) {
    const ch = chargeOf(await ask(ctx, cfg, `/v1/payment_intents/${enc(seen.pay)}?expand[]=latest_charge`));
    if (ch) Object.assign(seen, { paid: cents(ch.amount_captured ?? ch.amount) || seen.paid, back: cents(ch.amount_refunded), disputed: !!ch.disputed && !ch.refunded, email: ch.billing_details?.email || ch.receipt_email || seen.email });
  }
  return seen;
}

/** What Stripe says of a sale is written on it: a month the webhook never told of, money given back in Stripe itself, an end. → the record as it is now. */
async function agree(ctx, e, seen) {
  let next = e;
  // (another invoice than the one the line showed: a month more — unless the line never knew which its first one was)
  const month = !!e.sub && !!seen.invoice && seen.invoice !== e.invoice && (e.invoice ? true : seen.at > (e.paidAt || 0) + 86_400_000);
  if (month) next = { ...next, invoice: seen.invoice, paid: seen.paid, paidAt: seen.at, pay: seen.pay, backNow: 0 };
  else if ((seen.pay && !e.pay) || (seen.invoice && !e.invoice)) next = { ...next, pay: e.pay || seen.pay, invoice: e.invoice || seen.invoice };
  if (e.sub && (seen.months > (e.months || 0) || seen.total > (e.total || 0))) next = { ...next, months: Math.max(seen.months, e.months || 0), total: Math.max(seen.total, e.total || 0) };
  if (!e.sub && seen.paid && seen.paid !== e.paid) next = { ...next, paid: seen.paid };
  if (seen.back > (next.backNow || 0)) next = given(next, seen.back, { at: ctx.now(), cents: 0, by: 'stripe' });
  if (seen.ended && !e.ended) next = { ...next, ended: seen.ended };
  if (next !== e) { await write(ctx, next); await point(ctx, next.pay, next.id); }
  return next;
}

// ------------------------------------------------------------------------------- what a full refund takes back

/** The other payments of the same thing by the same buyer that still hold it (paid twice: one given back leaves it theirs). */
async function paidAgain(ctx, e) {
  const others = (await everySale(ctx)).filter((s) => s.id !== e.id && s.item === e.item && !s.taken && !s.lost && (s.paid || 0) > (s.backNow || 0));
  for (const s of others) if (s.device === e.device || (await sameOwner(ctx.store, s.device, e.device)) || (!!s.account && String(s.account).toLowerCase() === String(e.account || '').toLowerCase())) return s;
  return null;
}

/** The records that may hold what a buyer bought: their browser's own, the account it is signed in to, the one it bought under. */
async function holders(ctx, e) {
  const keys = new Set(), sub = e.sub ? await ctx.store.get(`sub:${e.sub}`) : null, acct = await accountOf(ctx.store, e.device);
  if (DEVICE.test(e.device || '')) keys.add(`own:${e.device}`);
  if (sub?.device && DEVICE.test(sub.device)) keys.add(`own:${sub.device}`);
  for (const name of [acct?.name, e.account, sub?.account]) if (name) keys.add(`acct:${String(name).toLowerCase()}`);
  return [...keys];
}

/**
 * Is what was bought still theirs — and what would giving its payment back do? → { held, twice, take (what a full
 * refund does: the sentence the owner reads), keep (what "they keep it" means; '': there is nothing to keep), part
 * (what a part given back does: nothing else) }. Nothing is changed.
 */
async function standing(ctx, e, seen) {
  const s = await standingOf(ctx, e, seen), runs = !!e.sub && (seen ? seen.active : !e.ended);
  return { ...s, part: s.held || s.twice ? `Nothing else changes: they keep ${thingOf(e)}${runs ? ', and its subscription goes on' : ''}.` : `Nothing else changes${runs ? ': its subscription goes on' : ''}.` };
}
async function standingOf(ctx, e, seen) {
  const what = describe(e.item), thing = thingOf(e), month = !!e.sub, runs = month && (seen ? seen.active : !e.ended);
  const stop = runs ? ' Its subscription is cancelled: nothing more is charged.' : '';
  const kept = month && runs ? `They keep ${thing}: the subscription goes on, and is charged again next month.` : `They keep ${thing}.`;
  if (!what) return { held: false, take: 'Nothing else changes: this is no longer sold, and nothing of it can be taken back from here.', keep: '' };
  if (e.lost) return { held: false, take: `They paid for ${thing}, and it could not be given to them — somebody had it already: giving this back takes nothing from anybody.${stop}`, keep: '' };
  if (what.kind === 'own') {
    const again = await paidAgain(ctx, e);
    if (again) return { held: false, twice: true, take: `They paid for ${thing} twice — the other payment stays — so they keep it.`, keep: '' };
    let held = false;
    for (const key of await holders(ctx, e)) if (((await ctx.store.get(key))?.items || []).includes(e.item)) held = true;
    return held ? { held, take: `${cap(thing)} leaves their wardrobe: if they are wearing it, it comes off at once.`, keep: kept } : { held, take: `They no longer have ${thing}: nothing else changes.`, keep: '' };
  }
  if (what.kind === 'pass') {
    let held = false;
    for (const key of await holders(ctx, e)) { const p = (await ctx.store.get(key))?.pass; if (p && !p.gift && (!e.sub || p.sub === e.sub)) held = true; }
    return held ? { held, take: `Their ${PASS.name} ends now: the hats, the sizes and the colours it lends go back.${stop}`, keep: kept } : { held, take: `Their ${PASS.name} has ended already: nothing else changes.${stop}`, keep: '' };
  }
  if (what.kind === 'room') {
    const room = await roomOf(ctx, e);
    return room ? { held: true, take: `Their room falls asleep now: nobody can enter it. It is kept for thirty days, then freed.${stop}`, keep: kept } : { held: false, take: `Their room is asleep or gone already: nothing else changes.${stop}`, keep: '' };
  }
  const s = await placeHeld(ctx, e);
  return s ? { held: true, take: `${cap(thing)} is freed: what it shows comes down, and it can be sold again.${stop}`, keep: kept } : { held: false, take: `${cap(thing)} is no longer theirs: nothing else changes.${stop}`, keep: '' };
}
const cap = (s) => `${s[0].toUpperCase()}${s.slice(1)}`;

/** The room this sale paid for, while it is awake (null otherwise). */
async function roomOf(ctx, e) {
  const held = e.sub ? await ctx.store.get(`sub:${e.sub}`) : null, acct = e.account || (await accountOf(ctx.store, e.device))?.name || '';
  const rec = held?.room ? await userRoom(ctx, held.room) : acct ? await roomOfAccount(ctx, acct) : null;
  // (a room woken by another payment since is not this sale's)
  return rec && rec.state === 'live' && (e.sub ? rec.sub === e.sub : !rec.sub) ? rec : null;
}
/** The place this sale paid for, while this very payment holds it (null otherwise: outbid, let go, taken down, sold again). */
async function placeHeld(ctx, e) {
  const s = ((await ctx.store.get('slots')) || {})[e.item], what = describe(e.item);
  if (!s || s.by === 'admin') return null;
  if (e.sub) return s.sub === e.sub ? s : null;
  if (what?.auction) return e.pay && s.pay === e.pay ? s : null;
  return !s.sub && (s.by === e.device || (await sameOwner(ctx.store, s.by, e.device))) ? s : null;
}

/**
 * What was bought is taken back (a payment was given back in full). → { took, stopped, unstopped (why Stripe would
 * not stop what is paid by the month: it may go on being charged) }.
 */
async function takeBack(ctx, cfg, e, runs) {
  const what = describe(e.item), store = ctx.store, done = { took: false, stopped: false, unstopped: '' };
  if (!what) return done;
  // (what is paid by the month is stopped first — whatever becomes of the rest, nothing more must be charged)
  if (e.sub && runs) { try { await endSubscription(cfg, e.sub, false, ctx.fetch || fetch); done.stopped = true; } catch (err) { done.unstopped = said(err); console.error('[sales] subscription', done.unstopped); } }
  if (what.kind === 'own') {
    if (await paidAgain(ctx, e)) return done;
    const [type, name] = e.item.split(':');
    for (const key of await holders(ctx, e)) {
      const rec = await store.get(key);
      if (!rec?.items?.includes(e.item)) continue;
      // (…and what an account remembers of the look of its robot no longer wears it)
      const p = rec.profile, worn = p && ['hat', 'paint', 'trail'].includes(type) && p[type] === name;
      await store.put(key, { ...rec, items: rec.items.filter((i) => i !== e.item), ...(worn && { profile: { ...p, [type]: 'none' } }) });
      done.took = true;
    }
  } else if (what.kind === 'pass') {
    for (const key of await holders(ctx, e)) {
      const rec = await store.get(key);
      if (rec?.pass && !rec.pass.gift && (!e.sub || rec.pass.sub === e.sub)) { await store.put(key, { ...rec, pass: null }); done.took = true; }
    }
    if (e.sub) await store.delete(`sub:${e.sub}`); // (its end, when Stripe says it, finds nothing left to do — nor to say twice)
  } else if (what.kind === 'room') {
    const room = await roomOf(ctx, e);
    if (room && (await sleepRoom(ctx, room.id))) done.took = true;
  } else if (await placeHeld(ctx, e)) {
    await release(ctx, (await store.get('slots')) || {}, e.item);
    done.took = true;
  }
  // (every page asks the shop again: the buyer's own takes off what is no longer theirs, and tells the others)
  if (done.took && what.kind !== 'slot' && ctx.push) await Promise.resolve(ctx.push({ t: 'shop' })).catch(() => {});
  return done;
}

// --------------------------------------------------------------------------------------------------- a refund

/** What Stripe refused, in plain words. */
function plain(err) {
  const code = String(err?.code || ''), text = String(err?.message || err || ''), has = (re) => re.test(code) || re.test(text);
  if (code === 'unknown' || err?.status === 0 || err?.status >= 500) return 'Stripe did not answer, so nobody knows whether the money went back. Nothing was changed here: look at this payment in Stripe before trying again.';
  if (has(/already.{0,12}refunded/i)) return 'Stripe says this payment was already given back. Nothing was changed.';
  if (has(/disput|chargeback/i)) return 'Stripe says the buyer\'s bank is disputing this payment: it cannot be given back while that runs. Nothing was changed.';
  if (has(/insufficient|balance/i)) return 'Stripe says there is not enough money in your Stripe balance to give this back. Nothing was changed: add funds in Stripe, or wait for the next sales to come in, then try again.';
  if (has(/too old|expired|no longer (be )?refund|refund window/i)) return 'Stripe says this payment is too old to be given back. Nothing was changed: the money has to be sent another way.';
  if (has(/greater than|exceeds|more than|amount_too_large/i)) return 'Stripe says that is more than what is left of this payment. Nothing was changed.';
  return `Stripe refused: ${text.replace(/^Stripe:\s*/, '').slice(0, 160) || 'no reason given'}. Nothing was changed.`;
}

async function refundSale(req, ctx, cfg) {
  const b = req.body || {}, id = typeof b.refund === 'string' ? b.refund : '', token = typeof b.token === 'string' ? b.token : '';
  if (!id || id.length > 300) return out(400, { error: 'Which sale?' });
  if (!TOKEN.test(token)) return out(400, { error: 'This page is out of date: load it again, then give the payment back.' });
  // (one sale is given back by one request at a time: a second one, come while Stripe is being asked, is turned away)
  const busy = (ctx.refunding ||= new Set());
  if (busy.has(id)) return out(409, { error: 'This payment is being given back right now: wait for it to finish.', busy: true });
  busy.add(id);
  try {
    let e = await read(ctx, id);
    const who = await people(ctx);
    if (!e) return out(404, { error: 'No such sale.' });
    // (the same click, said twice: it was done the first time)
    if ((e.log || []).some((l) => l.token === token)) return out(200, { ok: true, again: true, sale: shown(e, who(e)) });
    if (!is(e.pay, 'pi') && !is(e.sub, 'sub')) return out(409, { error: 'Stripe\'s reference of this payment is not known here: give it back in Stripe itself.' });
    let seen;
    try { seen = await look(ctx, cfg, e); } catch (err) { console.error('[sales] look', said(err)); return out(502, { error: err.status ? `Stripe would not show this payment (${said(err).replace(/^Stripe:\s*/, '')}). Nothing was changed.` : 'Stripe could not be asked. Nothing was changed: try again in a moment.' }); }
    e = await agree(ctx, e, seen);
    if (seen.disputed) return out(409, { error: plain({ code: 'charge_disputed' }), sale: shown(e, who(e)) });
    const left = Math.max(0, seen.paid - seen.back);
    if (!left) return out(409, { error: 'Nothing is left of this payment to give back.', sale: shown(e, who(e)) });
    const amount = b.all === true ? left : Number(b.amount);
    if (!Number.isInteger(amount) || amount < 1) return out(400, { error: 'How much? A sum in cents, or all of it.' });
    if (amount > left) return out(409, { error: `That is more than what is left of this payment: ${money(left, e.currency)}.`, left, sale: shown(e, who(e)) });
    const full = amount === left, keep = full && b.keep === true, reason = cleanText(b.reason, 200), thing = thingOf(e);
    const why = `${wordsOf(e)} — given back by the owner${full ? '' : ' in part'}`.slice(0, 200);
    let done;
    try {
      // (all of a payment nothing was given back of: asked as such — its invoice, if it has one, is cancelled whole)
      done = await refundPayment(cfg, seen.pay, why, ctx.fetch || fetch, { invoice: e.sub ? seen.invoice : '', amount: full && !seen.back ? 0 : amount, reason, token });
    } catch (err) {
      // (no answer, or an answer that is not one: nobody knows — said as such, never as a refusal)
      const lost = err.code === 'unknown' || !err.status || err.status >= 500;
      console.error('[sales] refund', said(err));
      return out(lost ? 502 : 409, { error: plain(lost ? { code: 'unknown' } : err), refused: !lost });
    }

    // ---- Stripe gave it back: it is written down first — then what was bought is taken back
    const now = ctx.now(), runs = !!e.sub && seen.active;
    const line = { at: now, cents: amount, by: 'owner', ...(reason && { why: reason }), token, ...(done.id && { re: done.id }), ...(keep && { kept: true }) };
    // (read again: Stripe's own word of this refund — its webhook — may have come meanwhile)
    let next = given((await read(ctx, id)) || e, seen.back + amount, line);
    if (!next.log.some((l) => l.token === token)) next = { ...next, log: logged(next, line) }; // (counted already, and no line of Stripe's to put the name on)
    await write(ctx, next);
    let took = { took: false, stopped: false, unstopped: '' };
    if (full && !keep) { try { took = await takeBack(ctx, cfg, e, runs); } catch (err) { console.error('[sales] taking back', said(err)); took.failed = said(err); } }
    if (took.took || keep || took.stopped) {
      next = { ...((await read(ctx, id)) || next) };
      next = { ...next, ...(took.took && { taken: now }), ...(keep && { kept: true }), ...(took.stopped && !next.ended && { ended: now }), log: (next.log || []).map((l) => (l.token === token && took.took ? { ...l, took: true } : l)) };
      await write(ctx, next);
    }
    // (the shop's own list of the money given back — the tab of the sponsors shows it —, and the figures)
    await ctx.store.put('refunds', [...((await ctx.store.get('refunds')) || []), { pay: seen.pay || e.sub, amount, at: now, why: `${why}${reason ? `: ${reason}` : ''}`.slice(0, 240), ok: true, ...(DEVICE.test(e.device || '') && { by: e.device }), ...(done.uncredited && { uncredited: done.uncredited }) }].slice(-100));
    await noteRefund(ctx.store, { cents: amount, pass: took.took && describe(e.item)?.kind === 'pass' }, now).catch(() => {});
    // the buyer is told: in the game at their next visit, and by e-mail where an address is known
    const sum = money(amount, e.currency), gone = { own: `${thing} is no longer yours`, pass: `your ${PASS.name} has ended`, room: 'your room has fallen asleep — it is kept for thirty days', slot: `${thing} has been let go` }[describe(e.item)?.kind] || '';
    await leaveNote(ctx, e.device, !full ? `The fair has refunded ${sum} of what you paid for ${thing}.` : took.took && gone ? `The fair has refunded your payment of ${sum} in full: ${gone}.` : `The fair has refunded your payment of ${sum} in full${keep ? ` — and you keep ${thing}` : ''}.`);
    tellSponsor(ctx, cfg, { device: e.device, pay: seen.pay, customer: e.customer || '', site: req.site || '', kind: 'refunded', place: full ? thing : `${thing} — ${sum} of the ${money(seen.paid, e.currency)} you paid`, cents: full ? amount : 0 });
    await tellOwnerRefund(ctx, { cents: amount, place: wordsOf(e), reason: 'later', ok: true, uncredited: done.uncredited || '' });
    if (took.unstopped) await tellOwnerRefund(ctx, { cents: amount, place: wordsOf(e), reason: 'later', monthly: true, ok: true, asked: false, unstopped: true, error: took.unstopped });
    return out(200, { ok: true, refunded: amount, full, took: took.took, kept: keep, stopped: took.stopped, ...(took.unstopped && { unstopped: took.unstopped }), ...(took.failed && { untaken: took.failed }), ...(done.uncredited && { uncredited: done.uncredited }), sale: shown(next, who(next)) });
  } finally { busy.delete(id); }
}

// ------------------------------------------------------------------------------------- what Stripe remembers

/**
 * A page more of Stripe's own list of the payment pages that were paid, written in the ledger: what the list
 * never heard of is added, what it has is completed (a month, a refund made in Stripe, an end) — never doubled:
 * a sale is one record under Stripe's name of its page. Each call reads one page and goes on from the last;
 * once the end is reached, the next call starts again from the newest. Gives nothing, takes nothing back.
 */
async function fillFromStripe(ctx, cfg) {
  if (ctx.filling) return out(409, { error: 'Stripe\'s list is being read right now: wait for it to finish.', busy: true });
  ctx.filling = true;
  try {
    const now = ctx.now(), kept = (await ctx.store.get(FILL)) || {};
    const run = kept.after && !kept.done ? { ...kept } : { started: now, after: '', seen: 0, added: 0, updated: 0, other: 0 };
    const q = new URLSearchParams({ limit: String(FILL_PAGE), status: 'complete' });
    if (run.after) q.set('starting_after', run.after);
    q.append('expand[]', 'data.payment_intent.latest_charge'); q.append('expand[]', 'data.subscription');
    let page;
    try { page = await ask(ctx, cfg, `/v1/checkout/sessions?${q}`); } catch (err) { console.error('[sales] fill', said(err)); return out(502, { error: err.status ? `Stripe would not give its list: ${said(err).replace(/^Stripe:\s*/, '')}` : 'Stripe could not be asked. Try again in a moment: it goes on from where it stopped.' }); }
    const list = Array.isArray(page.data) ? page.data : [];
    await Promise.all(list.map(async (s) => {
      run.seen++;
      const paid = s?.status === 'complete' && (s.payment_status === 'paid' || s.payment_status === 'no_payment_required');
      // (this game's: a thing and a browser are written on each of its payment pages — stripe.js, createCheckout)
      if (!paid || typeof s.metadata?.item !== 'string' || !DEVICE.test(s.metadata?.device || '') || !idOf(s.id)) { run.other++; return; }
      const fresh = fromSession(s, cfg, now), ch = chargeOf(s.payment_intent), sub = s.subscription && typeof s.subscription === 'object' ? s.subscription : null;
      const seen = { paid: fresh.paid, back: cents(ch?.amount_refunded), pay: fresh.pay, invoice: fresh.invoice, at: fresh.paidAt, months: fresh.months, total: fresh.total, ...(sub && ['canceled', 'incomplete_expired'].includes(sub.status) && { ended: ms(sub.ended_at) || ms(sub.canceled_at) || now }) };
      if (fresh.sub) {
        // (what is paid by the month: every month that was paid — asked once for each, a few at a time)
        try { const all = await monthsOf(ctx, cfg, fresh.sub), v = all.latest; if (v) Object.assign(seen, { months: all.months, total: all.total, invoice: idOf(v.id), paid: v.amount_paid, at: ms(v.status_transitions?.paid_at) || ms(v.created) || seen.at, pay: idOf(v.payment_intent), back: cents(v.post_payment_credit_notes_amount) }); } catch (err) { console.error('[sales] fill', said(err)); }
      }
      const old = await read(ctx, fresh.id);
      if (old) { if ((await agree(ctx, old, seen)) !== old) run.updated++; return; }
      if (!fresh.account) fresh.account = (await accountOf(ctx.store, fresh.device))?.name || '';
      await write(ctx, { ...fresh, from: 'stripe' });
      await point(ctx, fresh.pay, fresh.id);
      await point(ctx, fresh.sub, fresh.id);
      await agree(ctx, { ...fresh, from: 'stripe' }, seen);
      run.added++;
    }));
    const last = idOf(list[list.length - 1]?.id), done = !page.has_more || !last;
    const next = { ...run, after: done ? '' : last, at: now, done: done ? now : 0 };
    await ctx.store.put(FILL, next);
    return out(200, { ok: true, done, seen: next.seen, added: next.added, updated: next.updated, other: next.other });
  } finally { ctx.filling = false; }
}

// -------------------------------------------------------------------------------------------------- the route

/** Answers /api/sales; returns nothing for any other path. */
export async function salesRoute(req, ctx) {
  if (req.path !== '/api/sales') return null;
  if (!req.owner) return out(403, { error: 'Only the owner.' });
  const { method, query } = req, cfg = ctx.stripe || { mode: null };
  if (method === 'GET' || method === 'HEAD') {
    if (!query.has('look')) return listSales(req, ctx, cfg);
    // one sale, as Stripe has it now: what is left of it, and what giving it back will do
    let e = await read(ctx, query.get('look') || '');
    if (!e) return out(404, { error: 'No such sale.' });
    let seen = null, error = '';
    if (!cfg.mode) error = 'The shop is not open: there is no Stripe key on this server.';
    else if (is(e.pay, 'pi') || is(e.sub, 'sub')) { try { seen = await look(ctx, cfg, e); e = await agree(ctx, e, seen); } catch (err) { console.error('[sales] look', said(err)); error = 'Stripe could not be asked just now: these are the figures the fair keeps.'; } }
    const stand = await standing(ctx, e, seen), line = shown(e, (await people(ctx))(e));
    if (seen?.email && !line.who.email) line.who.email = cleanEmail(seen.email); // (the address given at the payment: shown now, kept nowhere)
    return out(200, { sale: line, look: { asked: !!seen, ...(error && { error }), left: seen ? Math.max(0, seen.paid - seen.back) : line.left, paid: seen ? seen.paid : line.paid, back: seen ? seen.back : line.backNow, at: seen ? seen.at : line.paidAt, disputed: !!seen?.disputed, active: seen ? seen.active : !!e.sub && !e.ended, ...stand } });
  }
  if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD, POST' });
  if (!cfg.mode) return out(501, { error: 'The shop is not open: there is no Stripe key on this server.' });
  if (req.body?.fetch === true) return fillFromStripe(ctx, cfg);
  if (req.body?.refund !== undefined) return refundSale(req, ctx, cfg);
  return out(400, { error: 'Nothing to do.' });
}
