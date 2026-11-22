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
import { sameSecret } from './token.js';

const enc = new TextEncoder();
const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** What is configured: { mode: 'test' | 'live' | null, key, webhook, api }. `env`: the variables of the host. */
export function stripeConfig(env = {}) {
  const one = env.STRIPE_SECRET_KEY || '', test = env.STRIPE_TEST_SECRET_KEY || '', live = env.STRIPE_LIVE_SECRET_KEY || '';
  const kind = (key) => (/^(sk|rk)_live_/.test(key) ? 'live' : /^(sk|rk)_test_/.test(key) ? 'test' : null);
  let mode = String(env.STRIPE_MODE || '').toLowerCase();
  if (mode !== 'test' && mode !== 'live') mode = live ? 'live' : test ? 'test' : kind(one);
  const key = mode === 'live' ? live || (kind(one) === 'live' ? one : '') : mode === 'test' ? test || (kind(one) === 'test' ? one : '') : '';
  if (!key) return { mode: null, key: '', webhook: '', api: '' };
  const webhook = (mode === 'live' ? env.STRIPE_LIVE_WEBHOOK_SECRET : env.STRIPE_TEST_WEBHOOK_SECRET) || env.STRIPE_WEBHOOK_SECRET || '';
  return { mode, key, webhook, api: String(env.STRIPE_API || 'https://api.stripe.com').replace(/\/+$/, '') };
}

/**
 * Asks Stripe for a payment page. `what`: { item, name, amount (cents), monthly, currency }, `device`: who buys,
 * `site`: the address of the game (the visitor comes back to it). Resolves to { id, url }; throws on failure.
 */
export async function createCheckout(cfg, what, device, site, fetcher = fetch, extra = {}) {
  const form = new URLSearchParams();
  form.set('mode', what.monthly ? 'subscription' : 'payment');
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', what.currency);
  form.set('line_items[0][price_data][unit_amount]', String(what.amount));
  form.set('line_items[0][price_data][product_data][name]', what.name);
  if (what.monthly) form.set('line_items[0][price_data][recurring][interval]', 'month');
  form.set('client_reference_id', device);
  form.set('metadata[item]', what.item);
  form.set('metadata[device]', device);
  for (const [k, v] of Object.entries(extra)) form.set(`metadata[${k}]`, String(v));
  if (what.monthly) { form.set('subscription_data[metadata][item]', what.item); form.set('subscription_data[metadata][device]', device); }
  form.set('success_url', `${site}/?paid=${encodeURIComponent(what.item)}`);
  form.set('cancel_url', `${site}/?paid=`);
  const res = await fetcher(`${cfg.api}/v1/checkout/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || typeof body.url !== 'string') throw new Error(`Stripe: ${body?.error?.message || res.status}`);
  return { id: String(body.id || ''), url: body.url };
}

/**
 * Gives a payment back in full (`pay`: its payment intent). Asking twice refunds once. Throws when Stripe says no
 * (a card payment can be refunded for about six months).
 */
export async function refundPayment(cfg, pay, why = '', fetcher = fetch) {
  const form = new URLSearchParams({ payment_intent: pay, reason: 'requested_by_customer' });
  if (why) form.set('metadata[why]', why);
  const res = await fetcher(`${cfg.api}/v1/refunds`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `refund-${pay}` },
    body: form.toString(),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) throw new Error(`Stripe: ${body?.error?.message || res.status}`);
  return { id: String(body.id || '') };
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
