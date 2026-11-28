// A stand-in for Stripe, for the tests of the sales and their refunds (tools/sales-test.mjs) and for looking at
// the back office with a list that is not empty (tools/sales-shots.mjs). It keeps payment pages, payments,
// subscriptions and their invoices in memory, and answers the calls server/stripe.js and server/sales.js make —
// as Stripe does where it matters to them: a list is read a page at a time, the newest first; a refund is
// counted on its payment and refused past what is left of it; the same idempotency key is answered once; a
// payment can be too old, disputed, or more than the balance holds; Stripe can be out of reach.
//
//   const stripe = standIn({ key })      what it is asked with (anything else is refused, as a wrong key is)
//   stripe.fetch(url, init)              the calls, without a network: hand it to the server as `ctx.fetch`
//   await stripe.listen(port)            …or over HTTP, for a server started with STRIPE_API=http://127.0.0.1:<port>
//   stripe.sell({ item, device, amount, monthly, months, life, account, email, at, tax })
//                                        → a payment page that was paid, as Stripe would tell of it
//   stripe.event(type, object)           → an event to sign and post to /api/stripe/webhook
//   stripe.charge(pi), stripe.bill(sub, amount, at)   the charge of a payment; a month more of a subscription
import http from 'node:http';

const MONTH = 30 * 86_400_000;

export function standIn({ key = 'sk_test_standin' } = {}) {
  const s = {
    key, sessions: new Map(), payments: new Map(), subs: new Map(), invoices: new Map(),
    refunds: [], credits: [], cancelled: [], portals: [], sent: [], asked: [], replies: new Map(),
    /** What can be given back before Stripe says the balance is short (cents). */
    balance: Infinity,
    /** Out of reach: true, or (method, path) → true for the calls that never arrive. */
    down: false,
    /** Stripe's newer API: an invoice no longer names its payment. */
    modern: false,
    /** Credit notes are refused (the money is then given back the plain way). */
    refuseCredit: false,
    /** Called with each call that was answered, before its answer is handed back: (method, path, reply). */
    after: null,
    n: 0,
  };
  const next = (p) => `${p}_standin${String(++s.n).padStart(4, '0')}`;
  const secs = (t) => Math.floor(t / 1000);
  const no = (status, message, code = '') => ({ status, body: { error: { type: 'invalid_request_error', message, ...(code && { code }) } } });
  const ok = (body) => ({ status: 200, body });
  const usd = (c) => `$${(c / 100).toFixed(2)}`;

  // ---- what is kept
  /** The charge of a payment, as Stripe shows it. */
  s.charge = (pi) => { const p = s.payments.get(pi); return p ? { id: `ch_${p.id.slice(3)}`, object: 'charge', amount: p.amount, amount_captured: p.amount, amount_refunded: p.refunded, refunded: p.refunded >= p.amount, disputed: !!p.disputed, payment_intent: p.id, currency: 'usd', billing_details: { email: p.email || null }, receipt_email: null } : null; };
  const paymentOf = (p, deep) => ({ id: p.id, object: 'payment_intent', amount: p.amount, amount_received: p.amount, currency: 'usd', status: 'succeeded', created: p.created, latest_charge: deep ? s.charge(p.id) : `ch_${p.id.slice(3)}` });
  const invoiceOf = (v) => { const copy = { ...v }; if (s.modern) delete copy.payment_intent; return copy; };
  const pay = (amount, at, email) => { const p = { id: next('pi'), amount, refunded: 0, created: secs(at), email, disputed: false, old: false }; s.payments.set(p.id, p); return p; };
  /** A month of a subscription is paid: its invoice, and the payment of it. */
  s.bill = (sub, amount, at = Date.now(), reason = 'subscription_cycle') => {
    const held = s.subs.get(sub), p = pay(amount, at, held.email), id = next('in');
    const v = { id, object: 'invoice', number: `STAND-${s.n}`, status: 'paid', billing_reason: reason, subscription: sub, customer: held.customer, customer_email: held.email || null, payment_intent: p.id, amount_paid: amount, total: amount, total_excluding_tax: amount, currency: 'usd', created: secs(at), status_transitions: { paid_at: secs(at) }, post_payment_credit_notes_amount: 0, hosted_invoice_url: `https://invoice.stripe.test/i/${id}`, invoice_pdf: `https://pay.stripe.test/invoice/${id}/pdf`, lines: { object: 'list', has_more: false, data: [{ id: next('il'), quantity: 1, amount }] } };
    s.invoices.set(id, v); p.invoice = id; held.latest_invoice = id;
    return v;
  };
  /**
   * Something was paid: the payment page, its payment — or, by the month, its subscription and an invoice a month
   * (`months`, the first at `at`). `tax`: paid while the VAT was on (a payment made once has an invoice too).
   */
  s.sell = ({ item, device, amount, monthly = false, months = 1, life = false, account = '', email = 'buyer@example.org', at = Date.now(), bid = 0, tax = false, live = false, id = '' }) => {
    const cs = id || next('cs');
    const o = {
      id: cs, object: 'checkout.session', status: 'complete', payment_status: 'paid', mode: monthly ? 'subscription' : 'payment', amount_total: amount, currency: 'usd', created: secs(at), livemode: live,
      client_reference_id: device, customer: next('cus'), customer_details: { email }, payment_intent: null, subscription: null, invoice: null,
      metadata: { item, device, ...(account && { account }), ...(life && { life: '1' }), ...(bid && { bid: String(bid) }) },
    };
    if (monthly) {
      const sub = next('sub');
      s.subs.set(sub, { id: sub, object: 'subscription', status: 'active', customer: o.customer, email, latest_invoice: null, ended_at: null, canceled_at: null, metadata: { item, device } });
      o.subscription = sub;
      for (let m = 0; m < months; m++) { const v = s.bill(sub, amount, at + m * MONTH, m ? 'subscription_cycle' : 'subscription_create'); if (!m) o.invoice = v.id; }
    } else {
      const p = pay(amount, at, email);
      o.payment_intent = p.id;
      if (tax) {
        const id2 = next('in');
        s.invoices.set(id2, { id: id2, object: 'invoice', number: `STAND-${s.n}`, status: 'paid', subscription: null, customer: o.customer, payment_intent: p.id, amount_paid: amount, total: amount, total_excluding_tax: Math.round(amount / 1.2), currency: 'usd', created: secs(at), status_transitions: { paid_at: secs(at) }, post_payment_credit_notes_amount: 0, lines: { object: 'list', has_more: false, data: [{ id: next('il'), quantity: 1, amount }] } });
        o.invoice = id2; p.invoice = id2;
      }
    }
    s.sessions.set(cs, o);
    return o;
  };
  /** A payment page that was opened and never paid (Stripe lists those too). */
  s.abandon = ({ item, device, amount, at = Date.now() }) => { const cs = next('cs'); const o = { id: cs, object: 'checkout.session', status: 'expired', payment_status: 'unpaid', mode: 'payment', amount_total: amount, currency: 'usd', created: secs(at), livemode: false, customer: null, customer_details: null, payment_intent: null, subscription: null, invoice: null, metadata: { item, device } }; s.sessions.set(cs, o); return o; };
  /** An event, as Stripe would send it. */
  s.event = (type, object) => ({ id: next('evt'), object: 'event', type, data: { object } });

  // ---- money given back
  function giveBack(p, amount, how) {
    if (p.old) return no(400, 'This payment is too old to be refunded.', 'charge_expired_for_refund');
    if (p.disputed && p.disputed !== 'won') return no(400, `Charge ch_${p.id.slice(3)} has been charged back; cannot issue a refund.`, 'charge_disputed'); // ('won': its charge still says it was disputed)
    const left = p.amount - p.refunded, sum = amount ?? left;
    if (left <= 0) return no(400, `Charge ch_${p.id.slice(3)} has already been refunded.`, 'charge_already_refunded');
    if (!Number.isInteger(sum) || sum < 1) return no(400, 'Invalid positive integer', 'parameter_invalid_integer');
    if (sum > left) return no(400, `Refund amount (${usd(sum)}) is greater than unrefunded amount on charge (${usd(left)})`, 'amount_too_large');
    if (sum > s.balance) return no(400, 'Insufficient funds in your Stripe balance to refund this amount.', 'insufficient_funds');
    p.refunded += sum; s.balance -= sum;
    const r = { id: next('re'), object: 'refund', amount: sum, payment_intent: p.id, charge: `ch_${p.id.slice(3)}`, status: 'succeeded', ...how };
    s.refunds.push({ ...r, pay: p.id });
    return ok(r);
  }

  // ---- the calls
  function answer(method, target, headers, text) {
    const url = new URL(target, 'https://stripe.test'), path = url.pathname, q = url.searchParams, form = new URLSearchParams(text || '');
    s.asked.push({ method, path, query: q, form, key: headers['idempotency-key'] || '' });
    if (headers.authorization !== `Bearer ${s.key}`) return { status: 401, body: { error: { type: 'invalid_request_error', message: 'Invalid API Key provided' } } };
    const meta = (f) => Object.fromEntries([...f].filter(([k]) => /^metadata\[\w+\]$/.test(k)).map(([k, v]) => [k.slice(9, -1), v]));
    const wants = (name) => q.getAll('expand[]').includes(name);
    let m;

    if (path === '/v1/checkout/sessions' && method === 'GET') {
      // the payment pages, the newest first, a page at a time
      let list = [...s.sessions.values()].sort((a, b) => b.created - a.created || (a.id < b.id ? 1 : -1));
      if (q.get('payment_intent')) list = list.filter((o) => o.payment_intent === q.get('payment_intent'));
      if (q.get('subscription')) list = list.filter((o) => o.subscription === q.get('subscription'));
      if (q.get('status')) list = list.filter((o) => o.status === q.get('status'));
      if (q.get('customer_details[email]')) list = list.filter((o) => o.customer_details?.email === q.get('customer_details[email]'));
      if (q.get('starting_after')) { const i = list.findIndex((o) => o.id === q.get('starting_after')); if (i < 0) return no(400, `No such checkout.session: '${q.get('starting_after')}'`, 'resource_missing'); list = list.slice(i + 1); }
      const limit = Math.min(100, Math.max(1, Number(q.get('limit')) || 10)), page = list.slice(0, limit);
      return ok({ object: 'list', url: '/v1/checkout/sessions', has_more: list.length > limit, data: page.map((o) => ({
        ...o,
        ...(o.payment_intent && (wants('data.payment_intent') || wants('data.payment_intent.latest_charge')) && { payment_intent: paymentOf(s.payments.get(o.payment_intent), wants('data.payment_intent.latest_charge')) }),
        ...(o.subscription && wants('data.subscription') && { subscription: { ...s.subs.get(o.subscription) } }),
      })) });
    }
    if ((m = /^\/v1\/checkout\/sessions\/(cs_\w+)$/.exec(path)) && method === 'GET') return s.sessions.has(m[1]) ? ok(s.sessions.get(m[1])) : no(404, `No such checkout.session: '${m[1]}'`, 'resource_missing');
    if ((m = /^\/v1\/payment_intents\/(pi_\w+)$/.exec(path)) && method === 'GET') return s.payments.has(m[1]) ? ok(paymentOf(s.payments.get(m[1]), wants('latest_charge'))) : no(404, `No such payment_intent: '${m[1]}'`, 'resource_missing');
    if ((m = /^\/v1\/customers\/(cus_\w+)$/.exec(path)) && method === 'GET') { const o = [...s.sessions.values()].find((x) => x.customer === m[1]); return ok({ id: m[1], object: 'customer', email: o?.customer_details?.email || null }); }
    if (path === '/v1/invoices' && method === 'GET') {
      let list = [...s.invoices.values()].sort((a, b) => b.created - a.created || (a.id < b.id ? 1 : -1));
      if (q.get('subscription')) list = list.filter((v) => v.subscription === q.get('subscription'));
      if (q.get('customer')) list = list.filter((v) => v.customer === q.get('customer'));
      if (q.get('status')) list = list.filter((v) => v.status === q.get('status'));
      const limit = Math.min(100, Math.max(1, Number(q.get('limit')) || 10));
      return ok({ object: 'list', has_more: list.length > limit, data: list.slice(0, limit).map(invoiceOf) });
    }
    if ((m = /^\/v1\/invoices\/(in_\w+)(\/send)?$/.exec(path))) {
      if (!s.invoices.has(m[1])) return no(404, `No such invoice: '${m[1]}'`, 'resource_missing');
      if (m[2] && method === 'POST') s.sent.push(m[1]);
      return ok(invoiceOf(s.invoices.get(m[1])));
    }
    if ((m = /^\/v1\/subscriptions\/(sub_\w+)$/.exec(path))) {
      const sub = s.subs.get(m[1]);
      if (!sub) return no(404, `No such subscription: '${m[1]}'`, 'resource_missing');
      if (method === 'DELETE') {
        if (sub.stuck) return no(400, 'This subscription cannot be cancelled just now.');
        if (sub.status === 'canceled') return no(404, `No such subscription: '${m[1]}'`, 'resource_missing');
        Object.assign(sub, { status: 'canceled', ended_at: secs(Date.now()), canceled_at: secs(Date.now()) });
        s.cancelled.push(sub.id);
        return ok({ ...sub });
      }
      if (wants('latest_invoice.payment_intent')) {
        if (s.modern) return no(400, 'This property cannot be expanded (latest_invoice.payment_intent).');
        const v = s.invoices.get(sub.latest_invoice);
        return ok({ ...sub, latest_invoice: v ? { ...v, payment_intent: { id: v.payment_intent } } : null });
      }
      return ok({ ...sub });
    }
    if (path === '/v1/billing_portal/sessions' && method === 'POST') { s.portals.push({ customer: form.get('customer'), back: form.get('return_url') }); return ok({ id: next('bps'), url: `https://billing.stripe.test/p/session/${s.portals.length}` }); }
    if (path === '/v1/checkout/sessions' && method === 'POST') {
      // a payment page is asked for: it is not paid yet (the test says when: stripe.sessions.get(id))
      const id = next('cs'), month = form.get('mode') === 'subscription';
      s.sessions.set(id, { id, object: 'checkout.session', status: 'open', payment_status: 'unpaid', mode: form.get('mode'), amount_total: Number(form.get('line_items[0][price_data][unit_amount]')), currency: form.get('line_items[0][price_data][currency]') || 'usd', created: secs(Date.now()), livemode: false, customer: null, customer_details: null, payment_intent: null, subscription: null, invoice: null, metadata: meta(form), month });
      return ok(form.get('ui_mode') === 'embedded' ? { id, client_secret: `${id}_secret`, url: null } : { id, url: `https://checkout.stripe.test/pay/${id}` });
    }

    // (what moves money is answered once for one idempotency key, as Stripe does)
    const again = headers['idempotency-key'] ? s.replies.get(headers['idempotency-key']) : null;
    if (again) return again;
    const once = (reply) => { if (headers['idempotency-key']) s.replies.set(headers['idempotency-key'], reply); return reply; };
    if (path === '/v1/refunds' && method === 'POST') {
      const p = s.payments.get(form.get('payment_intent'));
      if (!p) return once(no(404, `No such payment_intent: '${form.get('payment_intent')}'`, 'resource_missing'));
      return once(giveBack(p, form.has('amount') ? Number(form.get('amount')) : undefined, { metadata: meta(form), key: headers['idempotency-key'] || '' }));
    }
    if (path === '/v1/credit_notes' && method === 'POST') {
      const v = s.invoices.get(form.get('invoice')), p = v ? s.payments.get(v.payment_intent) : null, sum = Number(form.get('refund_amount'));
      if (!v || !p || s.refuseCredit) return once(no(400, 'Credit notes cannot be made just now.'));
      // ("refund_amount" gives back the latest payment of the invoice: Stripe refuses it once a refund was made of that payment)
      if (p.refunded > 0) return once(no(400, 'A refund was already issued for the payment of this invoice: create the refund, then link it to the credit note.'));
      const done = giveBack(p, sum, { metadata: meta(form), key: headers['idempotency-key'] || '', credit: v.id });
      if (done.status !== 200) return once(done);
      v.post_payment_credit_notes_amount += sum;
      const note = { id: next('cn'), object: 'credit_note', invoice: v.id, total: sum, refund: done.body.id, metadata: meta(form) };
      s.credits.push({ ...note, line: form.get('lines[0][invoice_line_item]') || '', amount: form.get('amount') || '', key: headers['idempotency-key'] || '' });
      return once(ok(note));
    }
    return no(404, `Unrecognized request URL (${method}: ${path}).`);
  }

  const lost = (method, path) => (typeof s.down === 'function' ? s.down(method, path) : !!s.down);
  /** The calls, without a network (ctx.fetch). */
  s.fetch = async (url, init = {}) => {
    const u = new URL(String(url)), method = String(init.method || 'GET').toUpperCase(), headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    if (lost(method, u.pathname)) throw new TypeError('fetch failed');
    const reply = answer(method, u.pathname + u.search, headers, typeof init.body === 'string' ? init.body : '');
    if (s.after) await s.after(method, u.pathname, reply);
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
  };
  /** …or over HTTP (STRIPE_API=http://127.0.0.1:<port>). Resolves to the server (its .close() stops it). */
  s.listen = (port) => new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let text = '';
      req.on('data', (d) => { text += d; });
      req.on('end', async () => {
        const path = String(req.url || '').split('?')[0];
        if (lost(req.method, path)) return req.socket.destroy();
        const reply = answer(req.method, req.url, req.headers, text);
        if (s.after) await s.after(req.method, path, reply);
        res.writeHead(reply.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(reply.body));
      });
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
  return s;
}
