// Payments go through Stripe Checkout: the server asks Stripe for a payment page, the visitor pays there (the
// game never sees a card), and Stripe tells the server when it is done (a signed "webhook"). Nothing here
// needs a library: two HTTPS calls and an HMAC, which run the same on Node and in a Cloudflare Worker.
//
// Keys (never in the repository — see the README: "The shop"):
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET                    one pair: test keys to try, live keys to sell
// or both pairs at once, and a switch:
//   STRIPE_TEST_SECRET_KEY, STRIPE_TEST_WEBHOOK_SECRET
//   STRIPE_LIVE_SECRET_KEY, STRIPE_LIVE_WEBHOOK_SECRET
//   STRIPE_MODE = test | live                                   (by default: live when the live key is there)
// and, to show the payment form inside the game instead of sending the visitor to Stripe's page:
//   STRIPE_PUBLISHABLE_KEY (or STRIPE_TEST_PUBLISHABLE_KEY, STRIPE_LIVE_PUBLISHABLE_KEY)   pk_test_… / pk_live_…
//   (it is not a secret — Stripe means it to be read by browsers — but it must be the one of the same mode)
import { sameSecret } from './token.js';

/** The version of Stripe's API a payment form shown inside the game is asked with (the one this was written against). */
export const EMBED_VERSION = '2025-03-31.basil';

const enc = new TextEncoder();
const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** What is configured: { mode: 'test' | 'live' | null, key, webhook, api, publishable }. `env`: the variables of the host. */
export function stripeConfig(env = {}) {
  const one = env.STRIPE_SECRET_KEY || '', test = env.STRIPE_TEST_SECRET_KEY || '', live = env.STRIPE_LIVE_SECRET_KEY || '';
  const kind = (key) => (/^(sk|rk)_live_/.test(key) ? 'live' : /^(sk|rk)_test_/.test(key) ? 'test' : null);
  let mode = String(env.STRIPE_MODE || '').toLowerCase();
  if (mode !== 'test' && mode !== 'live') mode = live ? 'live' : test ? 'test' : kind(one);
  const key = mode === 'live' ? live || (kind(one) === 'live' ? one : '') : mode === 'test' ? test || (kind(one) === 'test' ? one : '') : '';
  if (!key) return { mode: null, key: '', webhook: '', api: '', publishable: '' };
  const webhook = (mode === 'live' ? env.STRIPE_LIVE_WEBHOOK_SECRET : env.STRIPE_TEST_WEBHOOK_SECRET) || env.STRIPE_WEBHOOK_SECRET || '';
  // (the publishable key counts only if it is one, and of the mode that is on)
  const pub = String((mode === 'live' ? env.STRIPE_LIVE_PUBLISHABLE_KEY : env.STRIPE_TEST_PUBLISHABLE_KEY) || env.STRIPE_PUBLISHABLE_KEY || '').trim();
  const publishable = pub.startsWith(`pk_${mode}_`) && /^[A-Za-z0-9_]{12,200}$/.test(pub) ? pub : '';
  return { mode, key, webhook, api: String(env.STRIPE_API || 'https://api.stripe.com').replace(/\/+$/, ''), publishable };
}

/**
 * The VAT, where the owner has switched it on in the back office (`tax`: { on, code }; shop.js): Stripe Tax works
 * out what is due where the buyer is — out of the price, which includes it (a bid is what is paid) —, a business may
 * give its VAT number (and owes the VAT itself, where the law says so), and every payment made once gets an invoice,
 * as what is paid by the month does anyway. `code`: the kind of thing sold, in Stripe's words (txcd_…; none: the one
 * chosen in Stripe's settings). Stripe Tax must have been set up in Stripe first: the address of the business, its
 * registrations. Where it was not, Stripe refuses the page (see createCheckout).
 */
function taxed(form, what, tax) {
  form.set('automatic_tax[enabled]', 'true');
  form.set('tax_id_collection[enabled]', 'true');
  if (tax.code) form.set('line_items[0][price_data][product_data][tax_code]', tax.code);
  if (!what.monthly) { form.set('invoice_creation[enabled]', 'true'); form.set('customer_creation', 'always'); }
}

/**
 * Asks Stripe for a payment page. `what`: { item, name, amount (cents), monthly, currency }, `device`: who buys,
 * `site`: the address of the game (the visitor comes back to it). Resolves to { id, url }; throws on failure.
 * `embed`: the form is to be shown inside the game (Stripe's "embedded" Checkout) — resolves to { id, secret }
 * then: what Stripe's script needs to show it. Nobody leaves the game, unless the way of paying needs a page
 * of its own (a bank's): the visitor then comes back the same way as from the payment page. `tax`: the VAT, when
 * it is on (taxed above) — if Stripe refuses the page with it, the page is asked for again without it, and the
 * answer says why (`untaxed`): the sale is not lost, and the owner is told.
 */
export async function createCheckout(cfg, what, device, site, fetcher = fetch, extra = {}, embed = false, tax = null) {
  const form = new URLSearchParams();
  form.set('mode', what.monthly ? 'subscription' : 'payment');
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', what.currency);
  form.set('line_items[0][price_data][unit_amount]', String(what.amount));
  form.set('line_items[0][price_data][product_data][name]', what.name);
  // (a price is what is paid: any tax is in it, whatever Stripe's settings say of prices otherwise)
  form.set('line_items[0][price_data][tax_behavior]', 'inclusive');
  if (what.monthly) form.set('line_items[0][price_data][recurring][interval]', 'month');
  form.set('client_reference_id', device);
  form.set('metadata[item]', what.item);
  form.set('metadata[device]', device);
  for (const [k, v] of Object.entries(extra)) form.set(`metadata[${k}]`, String(v));
  if (what.monthly) { form.set('subscription_data[metadata][item]', what.item); form.set('subscription_data[metadata][device]', device); }
  if (embed) {
    form.set('ui_mode', 'embedded');
    form.set('redirect_on_completion', 'if_required');
    form.set('return_url', `${site}/?paid=${encodeURIComponent(what.item)}&cs={CHECKOUT_SESSION_ID}`);
  } else {
    form.set('success_url', `${site}/?paid=${encodeURIComponent(what.item)}&cs={CHECKOUT_SESSION_ID}`); // (Stripe writes the session there: the game asks about it as the buyer comes back)
    form.set('cancel_url', `${site}/?paid=`);
  }
  const ask = async (f) => {
    const res = await fetcher(`${cfg.api}/v1/checkout/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/x-www-form-urlencoded', ...(embed && { 'Stripe-Version': EMBED_VERSION }) },
      body: f.toString(),
    });
    const body = await res.json().catch(() => null);
    return { res, body, ok: res.ok && !!body && typeof (embed ? body.client_secret : body.url) === 'string' };
  };
  const page = ({ body }) => (embed ? { id: String(body.id || ''), secret: body.client_secret } : { id: String(body.id || ''), url: body.url });
  let untaxed = '';
  if (tax?.on) {
    const withTax = new URLSearchParams(form);
    taxed(withTax, what, tax);
    const got = await ask(withTax);
    if (got.ok) return page(got);
    // (refused for what was asked — Stripe Tax not set up, most likely —: asked again without the VAT. Anything else —
    // Stripe busy, or that cannot answer just now — is not taken for a refusal: the buyer tries again in a moment)
    const why = got.body?.error;
    if (!((got.res.status === 400 || got.res.status === 404) && (!why?.type || why.type === 'invalid_request_error'))) throw new Error(`Stripe: ${why?.message || got.res.status}`);
    untaxed = String(got.body?.error?.message || got.res.status).slice(0, 200);
  }
  const got = await ask(form);
  if (!got.ok) throw new Error(`Stripe: ${got.body?.error?.message || got.res.status}`);
  return { ...page(got), ...(untaxed && { untaxed }) };
}

/** An invoice, as the back office shows it (amounts in cents; `tax`: the VAT in it; `url`: its page at Stripe). */
const invoiceOf = (v) => (v && typeof v.id === 'string' ? {
  id: v.id, number: String(v.number || ''), status: String(v.status || ''), total: Number.isInteger(v.total) ? v.total : 0,
  tax: Number.isInteger(v.total) && Number.isInteger(v.total_excluding_tax) ? v.total - v.total_excluding_tax : Number.isInteger(v.tax) ? v.tax : 0,
  currency: String(v.currency || ''), at: Number.isInteger(v.created) ? v.created * 1000 : 0,
  url: typeof v.hosted_invoice_url === 'string' ? v.hosted_invoice_url : '', pdf: typeof v.invoice_pdf === 'string' ? v.invoice_pdf : '',
} : null);

/**
 * The invoices Stripe made of a payment: `sub`, what is paid by the month (one a month, the last twelve); `pay`, a
 * payment made once (the invoice its payment page made — when the VAT was on); `customer`, failing those (a place
 * bought for good). Resolves to a list, newest first; throws when Stripe cannot be asked.
 */
export async function findInvoices(cfg, { pay = '', sub = '', customer = '' } = {}, fetcher = fetch) {
  const ask = async (url) => {
    const res = await fetcher(url, { headers: { Authorization: `Bearer ${cfg.key}` }, signal: AbortSignal.timeout(8000) });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.error) throw new Error(`Stripe: ${body?.error?.message || res.status}`);
    return body;
  };
  const id = (v, p) => typeof v === 'string' && new RegExp(`^${p}_[A-Za-z0-9_]{4,250}$`).test(v);
  if (id(sub, 'sub')) return ((await ask(`${cfg.api}/v1/invoices?subscription=${encodeURIComponent(sub)}&limit=12`)).data || []).map(invoiceOf).filter(Boolean);
  if (id(pay, 'pi')) {
    const s = (await ask(`${cfg.api}/v1/checkout/sessions?payment_intent=${encodeURIComponent(pay)}&limit=1`)).data?.[0], inv = typeof s?.invoice === 'string' ? s.invoice : s?.invoice?.id;
    if (id(inv, 'in')) return [invoiceOf(await ask(`${cfg.api}/v1/invoices/${encodeURIComponent(inv)}`))].filter(Boolean);
  }
  if (id(customer, 'cus')) return ((await ask(`${cfg.api}/v1/invoices?customer=${encodeURIComponent(customer)}&limit=12`)).data || []).map(invoiceOf).filter(Boolean);
  return [];
}

/** Stripe sends an invoice to its customer, by e-mail, now (one already paid says so: nothing is asked of them). */
export async function sendInvoice(cfg, id, fetcher = fetch) {
  if (typeof id !== 'string' || !/^in_[A-Za-z0-9_]{4,250}$/.test(id)) throw new Error('No such invoice.');
  const res = await fetcher(`${cfg.api}/v1/invoices/${encodeURIComponent(id)}/send`, { method: 'POST', headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: '', signal: AbortSignal.timeout(8000) });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) throw new Error(`Stripe: ${body?.error?.message || res.status}`);
  return invoiceOf(body);
}

/**
 * A payment page as Stripe has it now — to learn that it was paid without waiting to be told (the buyer is
 * back in the game before the webhook, or no webhook was ever set). Resolves to the session, or null.
 */
export async function fetchCheckout(cfg, id, fetcher = fetch) {
  if (typeof id !== 'string' || !/^cs_[A-Za-z0-9_]{4,250}$/.test(id)) return null;
  const res = await fetcher(`${cfg.api}/v1/checkout/sessions/${id}`, { headers: { Authorization: `Bearer ${cfg.key}` } });
  const body = await res.json().catch(() => null);
  return res.ok && body && body.id === id ? body : null;
}

/**
 * The page where a customer looks after what they pay by the month — and stops it (Stripe's "customer
 * portal": it has to be switched on once in the Stripe dashboard). Resolves to { url }; throws on failure.
 */
export async function createPortal(cfg, customer, site, fetcher = fetch) {
  const form = new URLSearchParams({ customer, return_url: `${site}/` });
  const res = await fetcher(`${cfg.api}/v1/billing_portal/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || typeof body.url !== 'string') throw new Error(`Stripe: ${body?.error?.message || res.status}`);
  return { url: body.url };
}

/**
 * The invoice of a payment, when it has one and it is paid: the one its payment page made (`pay`: its payment
 * intent — a payment made while the VAT was on), or `invoice`, known already (a month of a subscription). → { id,
 * total, line (its one line), qty }, or null. Throws when Stripe cannot be asked.
 */
async function paidInvoice(cfg, { pay = '', invoice = '' }, fetcher) {
  const ask = async (url) => {
    const res = await fetcher(url, { headers: { Authorization: `Bearer ${cfg.key}` }, signal: AbortSignal.timeout(8000) });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.error) throw new Error(`Stripe: ${body?.error?.message || res.status}`);
    return body;
  };
  const is = (v, p) => typeof v === 'string' && new RegExp(`^${p}_[A-Za-z0-9_]{4,250}$`).test(v);
  let id = is(invoice, 'in') ? invoice : '';
  if (!id && is(pay, 'pi')) {
    const s = (await ask(`${cfg.api}/v1/checkout/sessions?payment_intent=${encodeURIComponent(pay)}&limit=1`)).data?.[0], v = typeof s?.invoice === 'string' ? s.invoice : s?.invoice?.id;
    if (is(v, 'in')) id = v;
  }
  if (!id) return null;
  const v = await ask(`${cfg.api}/v1/invoices/${encodeURIComponent(id)}`), lines = Array.isArray(v?.lines?.data) ? v.lines.data : [];
  if (v.status !== 'paid' || !Number.isInteger(v.total) || v.total <= 0) return null;
  const one = lines.length === 1 && !v.lines.has_more && typeof lines[0].id === 'string' ? lines[0] : null;
  return { id: v.id, total: v.total, line: one ? one.id : '', qty: one && Number.isInteger(one.quantity) && one.quantity > 0 ? one.quantity : 1 };
}

/**
 * Gives a payment back in full (`pay`: its payment intent). Asking twice refunds once. Throws when Stripe says no
 * (a card payment can be refunded for about six months). A payment that has a paid invoice (made while the VAT was
 * on; `invoice`: a month of a subscription) is given back by a credit note on it — the refund and the credit note
 * that cancels the invoice in the books, at once —; if Stripe refuses the credit note, the money is given back all
 * the same, the plain way, and the answer says the credit note is still to be made (`uncredited`: why).
 */
export async function refundPayment(cfg, pay, why = '', fetcher = fetch, { invoice = '' } = {}) {
  let uncredited = '';
  try {
    const inv = await paidInvoice(cfg, { pay, invoice }, fetcher);
    if (inv) {
      const note = new URLSearchParams({ invoice: inv.id, refund_amount: String(inv.total) });
      if (inv.line) { note.set('lines[0][type]', 'invoice_line_item'); note.set('lines[0][invoice_line_item]', inv.line); note.set('lines[0][quantity]', String(inv.qty)); } else note.set('amount', String(inv.total));
      if (why) note.set('metadata[why]', why);
      const res = await fetcher(`${cfg.api}/v1/credit_notes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `credit-${pay || inv.id}` },
        body: note.toString(),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body && !body.error) return { id: String(body.id || ''), credited: true };
      uncredited = String(body?.error?.message || res.status).slice(0, 160);
    }
  } catch (err) { uncredited = String(err.message || err).slice(0, 160); }
  const form = new URLSearchParams({ payment_intent: pay, reason: 'requested_by_customer' });
  if (why) form.set('metadata[why]', why);
  const res = await fetcher(`${cfg.api}/v1/refunds`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `refund-${pay}` },
    body: form.toString(),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) throw new Error(`Stripe: ${body?.error?.message || res.status}`);
  return { id: String(body.id || ''), ...(uncredited && { uncredited }) };
}

/**
 * The address a buyer gave at the payment page — to tell them later what became of what they paid for (outbid,
 * refunded, taken down): asked of Stripe when it is needed, kept nowhere. `pay`: the payment intent of a payment made
 * once; `customer`: the customer of what is paid by the month. Resolves to an address, or '' (never throws; Stripe
 * that does not answer within a few seconds is not waited for).
 */
export async function buyerEmail(cfg, { pay = '', customer = '' } = {}, fetcher = fetch) {
  const ask = async (url) => (await fetcher(url, { headers: { Authorization: `Bearer ${cfg.key}` }, signal: AbortSignal.timeout(4000) })).json().catch(() => null);
  try {
    if (typeof pay === 'string' && /^pi_[A-Za-z0-9_]{4,250}$/.test(pay)) {
      const body = await ask(`${cfg.api}/v1/checkout/sessions?payment_intent=${encodeURIComponent(pay)}&limit=1`);
      const s = Array.isArray(body?.data) ? body.data[0] : null, email = s?.customer_details?.email || s?.customer_email || '';
      if (typeof email === 'string' && email) return email;
    }
    if (typeof customer === 'string' && /^cus_[A-Za-z0-9_]{4,250}$/.test(customer)) {
      const body = await ask(`${cfg.api}/v1/customers/${encodeURIComponent(customer)}`);
      if (typeof body?.email === 'string' && body.email) return body.email;
    }
  } catch { /* Stripe cannot be reached just now: nobody is told by e-mail */ }
  return '';
}

/**
 * Stops, at once, something paid by the month (`sub`: the subscription). With `refund`, the payment of the month
 * that is running is given back too, when Stripe says which it was. Resolves to { refunded }; throws when the
 * subscription cannot be stopped.
 */
export async function endSubscription(cfg, sub, refund = false, fetcher = fetch) {
  const headers = { Authorization: `Bearer ${cfg.key}` }, at = `${cfg.api}/v1/subscriptions/${encodeURIComponent(sub)}`;
  let pay = '', invoice = '';
  if (refund) {
    const seen = await (await fetcher(`${at}?expand[]=latest_invoice.payment_intent`, { headers })).json().catch(() => null);
    const pi = seen?.latest_invoice?.payment_intent, inv = seen?.latest_invoice;
    pay = typeof pi === 'string' ? pi : typeof pi?.id === 'string' ? pi.id : '';
    invoice = typeof inv === 'string' ? inv : typeof inv?.id === 'string' ? inv.id : ''; // (its invoice: given back by a credit note on it)
  }
  const res = await fetcher(at, { method: 'DELETE', headers });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) throw new Error(`Stripe: ${body?.error?.message || res.status}`);
  let refunded = false, uncredited = '';
  if (pay) { try { uncredited = (await refundPayment(cfg, pay, 'taken down by the fair', fetcher, { invoice })).uncredited || ''; refunded = true; } catch { refunded = false; } }
  return { refunded, ...(uncredited && { uncredited }) };
}

/**
 * Is this really Stripe speaking? `raw`: the body exactly as received, `header`: its Stripe-Signature.
 * Returns the event (an object), or null: forged, damaged, or older than `tolerance` seconds.
 */
export async function verifyWebhook(secret, raw, header, now = Date.now(), tolerance = 300) {
  if (!secret || typeof raw !== 'string' || typeof header !== 'string' || header.length > 600) return null;
  let t = '';
  const sigs = [];
  for (const part of header.split(',')) { const [k, v] = part.trim().split('='); if (k === 't') t = v || ''; else if (k === 'v1' && v) sigs.push(v); }
  if (!/^\d{1,12}$/.test(t) || !sigs.length || Math.abs(now / 1000 - Number(t)) > tolerance) return null;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${raw}`)));
  if (!sigs.some((s) => sameSecret(s, mac))) return null;
  try { const event = JSON.parse(raw); return event && typeof event === 'object' ? event : null; } catch { return null; }
}

/** The signature Stripe would put on `raw` (for the tests, and for nothing else). */
export async function signWebhook(secret, raw, at = Date.now()) {
  const t = Math.floor(at / 1000);
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `t=${t},v1=${hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${raw}`)))}`;
}
