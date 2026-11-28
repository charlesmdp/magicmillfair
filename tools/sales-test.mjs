// Automated check of the list of the sales and of their refunds (server/sales.js), against a stand-in for Stripe
// (tools/lib/stripe.mjs). No browser, no port: the routes are called as the two hosts call them, Stripe's calls
// are answered in memory, and Stripe's own words (its webhook) are signed as Stripe signs them.
// usage: node tools/sales-test.mjs      → one PASS/FAIL line per check, exit code 1 when anything fails
import { route } from '../server/routes.js';
import { signWebhook, stripeConfig } from '../server/stripe.js';
import { nameAdmin } from '../server/admins.js';
import { standIn } from './lib/stripe.mjs';

let failures = 0, total = 0;
function check(name, ok, detail) {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `  → ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}

const HOOK = 'whsec_salestest', SITE = 'https://fair.test', DAY = 86_400_000;
const dev = (name) => `${name}-browser-0123456789`.slice(0, 24).padEnd(20, '0');
const draw = () => `t${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 8)}`;

/** A fair of its own: an empty store, a stand-in for Stripe, a clock — and the calls the tests make of them. */
function fair({ live = false } = {}) {
  const key = live ? 'sk_live_salestest' : 'sk_test_salestest', stripe = standIn({ key });
  const mem = new Map(), mails = [], pushed = [], pending = [], clock = { t: Date.UTC(2026, 9, 1, 12) };
  const store = {
    get: async (k) => (mem.has(k) ? structuredClone(mem.get(k)) : undefined), put: async (k, v) => { mem.set(k, structuredClone(v)); }, delete: async (k) => { mem.delete(k); },
    list: async (prefix = '') => [...mem].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)]),
  };
  const ctx = {
    store, limiter: { allow: () => true }, now: () => clock.t, flags: {}, secret: async () => 'a-secret', build: () => 'test',
    stripe: stripeConfig({ STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: HOOK, STRIPE_API: 'https://stripe.test' }), fetch: stripe.fetch,
    mail: async (m) => { mails.push(m); }, later: (work) => { pending.push(work); }, push: async (m) => { pushed.push(m); return 1; },
  };
  const f = { stripe, mem, mails, pushed, clock, ctx, store, adminKey: '' };
  /** A request to the API: as the owner, a named administrator, or a visitor. */
  f.call = async (method, path, { body = null, as = 'owner', query = '' } = {}) => route({ method, path, query: new URLSearchParams(query), body, client: '127.0.0.1', admin: as === 'owner', bearer: as === 'admin' ? f.adminKey : '', raw: body ? JSON.stringify(body) : null, signature: '', site: SITE }, ctx);
  /** Stripe tells the server something. */
  f.hook = async (event) => { const raw = JSON.stringify(event); return route({ method: 'POST', path: '/api/stripe/webhook', query: new URLSearchParams(), body: JSON.parse(raw), client: 'stripe', admin: false, bearer: '', raw, signature: await signWebhook(HOOK, raw, clock.t), site: SITE }, ctx); };
  /** Something is paid at Stripe, a little later than the last thing — and Stripe says so (unless `quiet`). */
  f.buy = async (what, { quiet = false } = {}) => { clock.t += 60_000; const o = stripe.sell({ at: clock.t, live, ...what }); if (!quiet) await f.hook(stripe.event('checkout.session.completed', o)); return o; };
  f.sales = async (query = '') => (await f.call('GET', '/api/sales', { query })).body;
  f.line = async (id) => (await f.sales()).sales.find((s) => s.id === id);
  f.look = async (id) => (await f.call('GET', '/api/sales', { query: `look=${id}` })).body;
  f.refund = (id, what = { all: true }, as = 'owner') => f.call('POST', '/api/sales', { body: { refund: id, token: draw(), ...what }, as });
  f.settle = async () => { while (pending.length) await pending.shift(); };
  f.account = async (device, name, email = '') => f.call('POST', '/api/account', { body: { action: 'create', device, name, password: 'correct horse battery', ...(email && { email }) }, as: 'visitor' });
  f.kept = () => JSON.stringify([...mem]);
  return f;
}
/** What does not change when nothing is to change: the list, what everybody owns, the money given back, the figures. */
const frozen = (f) => JSON.stringify([...f.mem].filter(([k]) => /^(sale:|own:|acct:|slots$|refunds$|stats:all$|uroom|sub:)/.test(k)));

// ---------------------------------------------------------------------------------- the list, kept as it is sold
async function testLedger() {
  const f = fair(), ada = dev('ada'), bob = dev('bob');
  await f.call('POST', '/api/release', { body: { set: { userRooms: true } } });
  await f.call('POST', '/api/notify', { body: { email: 'owner@fair.test' } });
  await f.account(ada, 'Ada', 'ada@example.org');
  const hat = await f.buy({ item: 'hat:tophat', device: bob, amount: 999, email: 'bob@example.org' });
  const pass = await f.buy({ item: 'pass', device: ada, amount: 1900, monthly: true, email: 'ada@example.org' });
  const room = await f.buy({ item: 'room', device: ada, amount: 5900, monthly: true, account: 'Ada', email: 'ada@example.org' });
  const month = await f.buy({ item: 'gondola:3', device: bob, amount: 2900, monthly: true, email: 'bob@example.org' });
  const good = await f.buy({ item: 'gondola:4', device: ada, amount: 19900, life: true, email: 'ada@example.org' });
  const plaque = await f.buy({ item: 'plaque:5', device: bob, amount: 2000, email: 'bob@example.org' });
  const bid = await f.buy({ item: 'board:spiral', device: ada, amount: 500, bid: 500, email: 'ada@example.org' });
  await f.settle();
  const all = await f.sales(), by = (o) => all.sales.find((s) => s.id === o.id);
  check('sales: each thing Stripe says was paid is one line of the list, the newest first', all.sales.length === 7 && all.sales.map((s) => s.id).join() === [bid, plaque, good, month, room, pass, hat].map((o) => o.id).join(), all.sales.map((s) => s.what));
  check('sales: a line says what was bought in plain words', by(hat).what === 'Top hat' && by(pass).what === 'Game Pass — monthly' && by(room).what === 'A room of one\'s own — monthly' && by(month).what === 'Gondola 3 — monthly' && by(good).what === 'Gondola 4 — for good' && by(plaque).what === 'Plaque no. 5 for a companion' && by(bid).what === 'Bid on the panel of Spiral of Death', all.sales.map((s) => s.what));
  check('sales: …who bought it — the name and the address of the account, or a browser without an account by the first characters of its name, never the whole of it',
    by(pass).who.name === 'Ada' && by(pass).who.email === 'ada@example.org' && by(hat).who.name === '' && by(hat).who.email === '' && by(hat).who.short === bob.slice(0, 8) && !JSON.stringify(all).includes(bob) && !JSON.stringify(all).includes(ada), [by(pass).who, by(hat).who]);
  check('sales: …how much, in which currency, that it is paid — and where to look at it in Stripe (a payment; of what is paid by the month, its subscription)',
    by(hat).amount === 999 && by(hat).currency === 'usd' && by(hat).state === 'paid' && by(hat).left === 999 && by(hat).can === true && by(hat).link === `https://dashboard.stripe.com/test/payments/${hat.payment_intent}`
    && by(pass).monthly && by(pass).months === 1 && by(pass).total === 1900 && by(pass).link === `https://dashboard.stripe.com/test/subscriptions/${pass.subscription}` && by(good).life === true && by(good).monthly === false, [by(hat), by(pass)]);
  const sum = [999, 1900, 5900, 2900, 19900, 2000, 500].reduce((a, b) => a + b, 0);
  check('sales: the total at the top counts what is listed: how many, how much was paid, how much went back', all.totals.count === 7 && all.totals.sums.length === 1 && all.totals.sums[0].currency === 'usd' && all.totals.sums[0].paid === sum && all.totals.sums[0].back === 0 && all.mode === 'test' && all.stripe === true, all.totals);

  // said twice by Stripe, and once more as the buyer comes back: still one line
  await f.hook(f.stripe.event('checkout.session.completed', hat));
  const back = await f.call('POST', '/api/checkout/confirm', { body: { session: hat.id }, as: 'visitor' });
  check('sales: a payment Stripe tells of twice — and that the buyer coming back tells of again — is one line', back.status === 200 && back.body.paid === true && (await f.sales()).totals.count === 7, back.body);

  // the search: a name, an address, a thing — and an address only Stripe knows, asked of Stripe and kept nowhere
  const find = async (q) => (await f.sales(`q=${encodeURIComponent(q)}`));
  const byName = await find('ada'), byThing = await find('gondola'), byWords = await find('top hat'), byMail = await find('ADA@example.org'), byStripe = await find('bob@example.org'), none = await find('nobody at all');
  check('sales: the search finds a name, a thing in its plain words, the address of an account — and counts only what it found',
    byName.totals.count === 4 && byName.sales.every((s) => s.who.name === 'Ada') && byThing.totals.count === 2 && byWords.totals.count === 1 && byWords.sales[0].id === hat.id && byMail.totals.count === 4 && none.totals.count === 0 && none.sales.length === 0
    && byThing.totals.sums[0].paid === 2900 + 19900, [byName.totals, byThing.totals, byWords.totals, byMail.totals, none.totals]);
  check('sales: an address given only to Stripe is found by asking Stripe for it — shown on the lines it paid for, and kept nowhere',
    byStripe.totals.count === 3 && byStripe.sales.every((s) => s.who.email === 'bob@example.org' && s.who.name === '') && !f.kept().includes('bob@example.org'), [byStripe.totals, f.kept().includes('bob@example.org')]);

  // a month more, an end
  const before = await f.line(pass.id);
  f.clock.t += 30 * DAY;
  const second = f.stripe.bill(pass.subscription, 1900, f.clock.t);
  await f.hook(f.stripe.event('invoice.paid', second));
  await f.hook(f.stripe.event('invoice.paid', second));
  const after = await f.line(pass.id);
  check('sales: a month more of what is paid by the month is the payment its line shows from then on — counted once, though Stripe say it twice', before.months === 1 && after.months === 2 && after.total === 3800 && after.paid === 1900 && after.paidAt === Math.floor(f.clock.t / 1000) * 1000 && after.state === 'paid', after);
  await f.hook(f.stripe.event('customer.subscription.deleted', { id: month.subscription }));
  const ended = await f.line(month.id);
  check('sales: a subscription that ended is said on its line', ended.ended > 0 && ended.state === 'paid' && !(await f.line(pass.id)).ended, ended);

  // the automatic refunds of the auctions
  const higher = await f.buy({ item: 'board:spiral', device: bob, amount: 700, bid: 700, email: 'bob@example.org' });
  await f.settle();
  const outbid = await f.line(bid.id), holds = await f.line(higher.id);
  check('sales: a bid that is outbid is given back by the shop itself, and its line says so — who did it, and that nothing is left to give back',
    outbid.state === 'refunded' && outbid.back === 500 && outbid.left === 0 && outbid.can === false && outbid.log.length === 1 && outbid.log[0].by === 'auction' && outbid.log[0].cents === 500 && holds.state === 'paid' && f.stripe.refunds.length === 1, outbid);
  const again = await f.refund(bid.id);
  check('sales: …and it cannot be given back a second time', again.status === 409 && /Nothing is left/.test(again.body.error) && f.stripe.refunds.length === 1, again.body);

  // paid, and not given: somebody had the place already
  const late = await f.buy({ item: 'gondola:4', device: bob, amount: 2900, monthly: true, email: 'bob@example.org' });
  const lost = await f.line(late.id), seen = await f.look(late.id);
  check('sales: a place paid for that somebody had already is on the list as paid and not given, for the owner to give back', lost.lost === true && lost.state === 'paid' && lost.can === true && seen.look.held === false && /could not be given/.test(seen.look.take), [lost, seen.look]);
  const settled = await f.refund(late.id);
  const slots = f.mem.get('slots');
  check('sales: …given back in full, its subscription is stopped and the place stays with who holds it', settled.status === 200 && settled.body.took === false && settled.body.stopped === true && f.stripe.cancelled.includes(late.subscription) && slots['gondola:4']?.by === ada, settled.body);
}

// --------------------------------------------------------------------------------------- "older": fifty at a time
async function testPaging() {
  const f = fair(), who = dev('zoe');
  for (let i = 0; i < 120; i++) await f.buy({ item: i % 2 ? 'hat:cap' : 'hat:beanie', device: `${who.slice(0, 16)}${String(i).padStart(4, '0')}`, amount: 999 });
  const one = await f.sales(), two = await f.sales(`before=${encodeURIComponent(one.before)}`), three = await f.sales(`before=${encodeURIComponent(two.before)}`), four = await f.sales(`before=${encodeURIComponent(three.before)}`);
  const ids = new Set([...one.sales, ...two.sales, ...three.sales].map((s) => s.id)), times = [...one.sales, ...two.sales, ...three.sales].map((s) => s.at);
  check('sales: the list comes fifty lines at a time, the older ones on asking — every sale once, in order, and the total counts them all from the first page',
    one.sales.length === 50 && one.more && two.sales.length === 50 && two.more && three.sales.length === 20 && !three.more && four.sales.length === 0 && !four.more && ids.size === 120 && times.every((t, i) => !i || t <= times[i - 1]) && one.totals.count === 120 && one.totals.sums[0].paid === 120 * 999 && three.totals.count === 120,
    [one.sales.length, two.sales.length, three.sales.length, four.sales.length, ids.size, one.totals]);
  const caps = await f.sales('q=cap'), more = await f.sales(`q=cap&before=${encodeURIComponent(caps.before)}`);
  check('sales: …and so does a search', caps.totals.count === 60 && caps.sales.length === 50 && caps.more && more.sales.length === 10 && !more.more && more.sales.every((s) => s.what === 'Cap'), [caps.totals, more.sales.length]);
  const records = [...f.mem.keys()].filter((k) => k.startsWith('sale:')), biggest = Math.max(...records.map((k) => JSON.stringify(f.mem.get(k)).length));
  check('sales: the list is kept one record a sale: none grows with the number of sales', records.length === 120 && biggest < 900, [records.length, biggest]);
}

// ---------------------------------------------------------------------------- what Stripe remembers of the past
async function testFill() {
  const f = fair(), ada = dev('ada'), bob = dev('bob'), old = f.clock.t - 200 * DAY, s = f.stripe;
  await f.account(ada, 'Ada', 'ada@example.org');
  // the past, at Stripe: forty-five things bought once, three by the month, payment pages never paid, payments of something else
  const past = [];
  for (let i = 0; i < 45; i++) past.push(s.sell({ item: ['hat:crown', 'jetpack', 'paint:gold', 'plaque:9', 'board:cups'][i % 5], device: i % 3 ? bob : ada, amount: 500 + i, at: old + i * DAY, email: i % 3 ? 'bob@example.org' : 'ada@example.org' }));
  const long = s.sell({ item: 'pass', device: ada, amount: 1900, monthly: true, months: 3, at: old + 50 * DAY }), stopped = s.sell({ item: 'gondola:7', device: bob, amount: 2900, monthly: true, months: 2, at: old + 51 * DAY }), fresh = s.sell({ item: 'tarp:shoot', device: bob, amount: 9900, monthly: true, at: old + 52 * DAY });
  Object.assign(s.subs.get(stopped.subscription), { status: 'canceled', ended_at: Math.floor((old + 120 * DAY) / 1000) });
  for (let i = 0; i < 4; i++) s.abandon({ item: 'hat:cap', device: bob, amount: 999, at: old + (60 + i) * DAY });
  for (let i = 0; i < 2; i++) { const o = s.sell({ item: 'x', device: bob, amount: 4200, at: old + (70 + i) * DAY }); o.metadata = { order: 'a-shop-of-something-else' }; }
  s.payments.get(past[3].payment_intent).refunded = past[3].amount_total; // (given back in Stripe, in full)
  s.payments.get(past[4].payment_intent).refunded = 100; // (…and in part)
  // five of them the list knows already: Stripe said so when they were paid
  for (const o of [past[40], past[41], past[42], long, fresh]) await f.hook(s.event('checkout.session.completed', o));
  await f.settle();
  const known = (await f.sales()).totals.count, owned = JSON.stringify([...f.mem].filter(([k]) => /^(own:|acct:|slots$)/.test(k)));

  const calls = [];
  let last = null, asked = s.asked.length;
  for (let i = 0; i < 10 && !(last?.body?.done); i++) {
    last = await f.call('POST', '/api/sales', { body: { fetch: true } });
    calls.push({ status: last.status, ...last.body, asked: s.asked.length - asked });
    asked = s.asked.length;
  }
  const all = await f.sales(), by = (o) => all.sales.find((x) => x.id === o.id) || null;
  // (the lines of the first page — every one, asked for page after page)
  const everyLine = async () => { const lines = []; let page = await f.sales(); for (;;) { lines.push(...page.sales); if (!page.more) return lines; page = await f.sales(`before=${encodeURIComponent(page.before)}`); } };
  const lines = await everyLine(), line = (o) => lines.find((x) => x.id === o.id) || null;
  check('fill: "Fetch what Stripe remembers" reads Stripe\'s list a page at a time — each press goes on from the last — until its end',
    known === 5 && calls.length === 3 && calls.every((c) => c.status === 200) && calls[0].done === false && calls[1].done === false && calls[2].done === true && calls[2].seen === 50 && calls[2].added === 43 && calls[2].other === 2, calls);
  check('fill: …within what a Worker may ask in one request (one page of twenty, and a question for each thing paid by the month)', calls.every((c) => c.asked <= 21) && calls.reduce((n, c) => n + c.asked, 0) === 3 + 3, calls.map((c) => c.asked));
  check('fill: the past is in the list — every thing this game sold, once; payment pages never paid and payments of something else are left out', all.totals.count === 48 && lines.length === 48 && new Set(lines.map((x) => x.id)).size === 48 && lines.every((x) => x.what !== 'x'), [all.totals.count, lines.length]);
  check('fill: a line found at Stripe says when it was bought, by whom, and what Stripe knows of it since: given back in full, or in part',
    line(past[0]).at === Math.floor(old / 1000) * 1000 && line(past[0]).who.name === 'Ada' && line(past[1]).who.name === '' && line(past[3]).state === 'refunded' && line(past[3]).back === past[3].amount_total && line(past[3]).log[0].by === 'stripe' && line(past[4]).state === 'part' && line(past[4]).back === 100 && line(past[4]).left === past[4].amount_total - 100, [line(past[0]), line(past[3]), line(past[4])]);
  check('fill: what is paid by the month is one line: every month that was paid, the latest as the payment it shows — and its end',
    line(long).months === 3 && line(long).total === 5700 && line(long).paid === 1900 && line(long).paidAt > line(long).at && !line(long).ended && line(stopped).months === 2 && line(stopped).total === 5800 && line(stopped).ended === Math.floor((old + 120 * DAY) / 1000) * 1000 && line(fresh).months === 1, [line(long), line(stopped)]);
  check('fill: it gives nothing and takes nothing back: what everybody owns is as it was', JSON.stringify([...f.mem].filter(([k]) => /^(own:|acct:|slots$)/.test(k))) === owned);

  // pressed again: nothing is doubled, nothing changes
  const snapshot = JSON.stringify([...f.mem].filter(([k]) => /^sale(ref)?:/.test(k)));
  let twice = null;
  for (let i = 0; i < 10 && !(twice?.body?.done); i++) twice = await f.call('POST', '/api/sales', { body: { fetch: true } });
  const again = await f.sales();
  check('fill: pressed a second time, it reads the list again and doubles nothing', twice.status === 200 && twice.body.done === true && twice.body.added === 0 && twice.body.updated === 0 && twice.body.seen === 50 && again.totals.count === 48 && JSON.stringify([...f.mem].filter(([k]) => /^sale(ref)?:/.test(k))) === snapshot && again.fill.done > 0, [twice.body, again.totals]);

  // Stripe out of reach in the middle: the next press goes on from where it stopped
  const g = fair();
  for (let i = 0; i < 45; i++) g.stripe.sell({ item: 'hat:cap', device: bob, amount: 999, at: old + i * DAY });
  const first = await g.call('POST', '/api/sales', { body: { fetch: true } });
  g.stripe.down = true;
  const cut = await g.call('POST', '/api/sales', { body: { fetch: true } });
  g.stripe.down = false;
  const second = await g.call('POST', '/api/sales', { body: { fetch: true } }), third = await g.call('POST', '/api/sales', { body: { fetch: true } });
  check('fill: when Stripe cannot be asked it says so, and the next press goes on from where it stopped', first.body.seen === 20 && cut.status === 502 && /goes on from where it stopped/.test(cut.body.error) && second.body.seen === 40 && third.body.seen === 45 && third.body.done === true && (await g.sales()).totals.count === 45, [first.body, cut.body, second.body, third.body]);
  const both = await Promise.all([g.call('POST', '/api/sales', { body: { fetch: true } }), g.call('POST', '/api/sales', { body: { fetch: true } })]);
  check('fill: pressed twice at the same moment, one reading goes on and the other is told to wait', both.map((r) => r.status).sort().join() === '200,409' && (await g.sales()).totals.count === 45, both.map((r) => r.body));
}

// --------------------------------------------------------------- a full refund of each kind of thing, and what it takes back
async function testFull() {
  const f = fair(), s = f.stripe, ada = dev('ada'), bob = dev('bob'), cy = dev('cy'), dee = dev('dee'), eve = dev('eve'), fay = dev('fay'), gus = dev('gus');
  await f.call('POST', '/api/release', { body: { set: { userRooms: true } } });
  await f.call('POST', '/api/notify', { body: { email: 'owner@fair.test' } });
  await f.account(ada, 'Ada', 'ada@example.org');
  await f.account(fay, 'Fay');
  const money = () => f.mem.get('stats:all')?.money || 0, passes = () => f.mem.get('stats:all')?.passes || 0, notes = (d) => f.mem.get(`own:${d}`)?.notes || [];

  // ---- a hat, bought from a browser without an account
  const hat = await f.buy({ item: 'hat:tophat', device: bob, amount: 999, email: 'bob@example.org' });
  await f.settle();
  const seen = await f.look(hat.id), earned = money();
  f.mails.length = 0; f.pushed.length = 0;
  const done = await f.refund(hat.id, { all: true, reason: 'Bought by <b>mistake</b>\n— asked by e-mail' });
  await f.settle();
  const line = await f.line(hat.id), made = s.refunds.at(-1);
  check('refund: before anything is given back, the owner reads what is left of the payment (asked of Stripe), who paid (the address given to Stripe, shown and not kept) and what will happen to what was bought',
    seen.look.asked === true && seen.look.left === 999 && seen.look.paid === 999 && seen.look.held === true && /leaves their wardrobe/.test(seen.look.take) && /They keep the Top hat/.test(seen.look.keep) && seen.sale.who.email === 'bob@example.org' && !f.kept().includes('bob@example.org'), seen);
  check('refund: a hat given back in full — Stripe is asked once, for all of it, with what it is and the owner\'s reason; the answer says what was done',
    done.status === 200 && done.body.ok && done.body.refunded === 999 && done.body.full === true && done.body.took === true && done.body.kept === false && s.refunds.length === 1 && made.amount === 999 && made.pay === hat.payment_intent && made.metadata.why === 'Top hat — given back by the owner' && made.metadata.reason === 'Bought by b mistake /b — asked by e-mail', [done.body, made]);
  check('refund: …the hat leaves the wardrobe of the browser that bought it, and every page is told to ask the shop again', !(f.mem.get(`own:${bob}`).items || []).includes('hat:tophat') && f.pushed.some((m) => m.t === 'shop'), [f.mem.get(`own:${bob}`), f.pushed]);
  check('refund: …its line says refunded, taken back, by whom and why; nothing is left to give back', line.state === 'refunded' && line.back === 999 && line.left === 0 && line.can === false && line.taken > 0 && line.log.length === 1 && line.log[0].by === 'owner' && line.log[0].cents === 999 && line.log[0].why === 'Bought by b mistake /b — asked by e-mail' && line.log[0].took === true, line);
  const kept = f.mem.get('refunds') || [];
  check('refund: …it is in the shop\'s list of the money given back, and off what the game earned', kept.length === 1 && kept[0].ok === true && kept[0].amount === 999 && kept[0].pay === hat.payment_intent && /^Top hat — given back by the owner: Bought by b mistake/.test(kept[0].why) && earned - money() === 999, [kept, earned, money()]);
  const told = f.mails.find((m) => m.to === 'bob@example.org'), owner = f.mails.find((m) => m.to === 'owner@fair.test');
  check('refund: …the buyer is told — a note in the game at their next visit, an e-mail at the address they gave Stripe — and so is the owner',
    notes(bob).at(-1) === 'The fair has refunded your payment of $9.99 in full: the Top hat is no longer yours.' && told?.subject === 'Your payment has been refunded' && /refunded your payment of \$9\.99 for the Top hat/.test(told.text) && /^Refunded — \$9\.99 — Top hat/.test(owner?.subject || '') && /given back from the back office — Top hat/.test(owner.text), [notes(bob), told?.text, owner?.subject]);

  // ---- a hat on an account, worn
  const crown = await f.buy({ item: 'hat:crown', device: ada, amount: 999 }), gold = await f.buy({ item: 'paint:gold', device: ada, amount: 1900 });
  await f.call('POST', '/api/account', { body: { action: 'save', device: ada, profile: { name: 'Ada', color: 3, hat: 'crown', paint: 'gold', trail: 'none', size: 'normal' } }, as: 'visitor' });
  const worn = f.mem.get('acct:ada').profile.hat, off = await f.refund(crown.id);
  check('refund: a hat of an account leaves the account — and the look it remembers no longer wears it; what else it owns and wears stays',
    worn === 'crown' && off.status === 200 && off.body.took === true && !f.mem.get('acct:ada').items.includes('hat:crown') && f.mem.get('acct:ada').items.includes('paint:gold') && f.mem.get('acct:ada').profile.hat === 'none' && f.mem.get('acct:ada').profile.paint === 'gold', f.mem.get('acct:ada'));
  await f.refund(gold.id);

  // ---- paid twice: one payment given back leaves the thing theirs
  const once = await f.buy({ item: 'hat:wizard', device: cy, amount: 999 }), twice = await f.buy({ item: 'hat:wizard', device: cy, amount: 999 });
  const double = await f.look(twice.id), one = await f.refund(twice.id);
  const still = (f.mem.get(`own:${cy}`).items || []).includes('hat:wizard'), alone = await f.look(once.id), two = await f.refund(once.id);
  check('refund: a thing paid for twice stays theirs when one of the two payments is given back — said before, and done so; the second one takes it back',
    double.look.twice === true && /paid for the Wizard hat twice/.test(double.look.take) && one.status === 200 && one.body.took === false && still && notes(cy).at(-2) === 'The fair has refunded your payment of $9.99 in full.'
    && alone.look.twice !== true && alone.look.held === true && two.body.took === true && !(f.mem.get(`own:${cy}`).items || []).includes('hat:wizard'), [double.look, one.body, alone.look, two.body]);

  // ---- "and let them keep it"
  const jet = await f.buy({ item: 'jetpack', device: dee, amount: 3000 });
  const gift = await f.refund(jet.id, { all: true, keep: true }), giftLine = await f.line(jet.id);
  check('refund: "…and let them keep it" gives the whole payment back and takes nothing', gift.status === 200 && gift.body.full && gift.body.kept === true && gift.body.took === false && (f.mem.get(`own:${dee}`).items || []).includes('jetpack') && giftLine.state === 'refunded' && giftLine.kept === true && !giftLine.taken && notes(dee).at(-1) === 'The fair has refunded your payment of $30 in full — and you keep the Jetpack.', [gift.body, giftLine, notes(dee)]);

  // ---- the Game Pass: the latest month, and the pass ends now
  const pass = await f.buy({ item: 'pass', device: eve, amount: 1900, monthly: true, email: 'eve@example.org' });
  f.clock.t += 30 * DAY; await f.hook(s.event('invoice.paid', s.bill(pass.subscription, 1900, f.clock.t)));
  f.clock.t += 30 * DAY; const third = s.bill(pass.subscription, 1900, f.clock.t); // (a month Stripe never told of)
  const held = !!f.mem.get(`own:${eve}`).pass, sold = passes(), earnedPass = money(), view = await f.look(pass.id);
  check('refund: of what is paid by the month, the payment that can be given back is the latest invoice paid — asked of Stripe, even when its webhook never told of that month',
    view.look.paid === 1900 && view.look.left === 1900 && view.look.at === Math.floor(f.clock.t / 1000) * 1000 && view.sale.months === 3 && view.sale.total === 5700 && view.look.active === true && /Game Pass ends now/.test(view.look.take) && /subscription is cancelled/.test(view.look.take) && /charged again next month/.test(view.look.keep), view);
  const ends = await f.refund(pass.id), passLine = await f.line(pass.id), credit = s.credits.at(-1);
  check('refund: the Game Pass given back in full — the latest month goes back (by a credit note on its invoice), the pass ends now, its subscription is cancelled',
    held && ends.status === 200 && ends.body.refunded === 1900 && ends.body.took === true && ends.body.stopped === true && credit?.invoice === third.id && s.refunds.at(-1).amount === 1900 && s.refunds.at(-1).pay === third.payment_intent && s.cancelled.includes(pass.subscription) && f.mem.get(`own:${eve}`).pass === null && !f.mem.has(`sub:${pass.subscription}`), [ends.body, credit, f.mem.get(`own:${eve}`)]);
  check('refund: …its line says so — the months before stay paid — and a Game Pass leaves the figures', passLine.state === 'refunded' && passLine.back === 1900 && passLine.total === 5700 && passLine.ended > 0 && passLine.taken > 0 && sold - passes() === 1 && earnedPass - money() === 1900, [passLine, sold, passes()]);
  const said = notes(eve).length;
  await f.hook(s.event('customer.subscription.deleted', { id: pass.subscription }));
  check('refund: …and when Stripe then says the subscription ended, the buyer is not told a second time', notes(eve).length === said && notes(eve).at(-1) === 'The fair has refunded your payment of $19 in full: your Game Pass has ended.', notes(eve));

  // ---- the Game Pass, kept
  const pass2 = await f.buy({ item: 'pass', device: gus, amount: 1900, monthly: true });
  const stays = await f.refund(pass2.id, { all: true, keep: true });
  check('refund: a month of the Game Pass given back with "let them keep it": the pass goes on, and so does its subscription', stays.status === 200 && stays.body.kept && !stays.body.stopped && !!f.mem.get(`own:${gus}`).pass && !s.cancelled.includes(pass2.subscription) && s.subs.get(pass2.subscription).status === 'active', [stays.body, f.mem.get(`own:${gus}`)]);

  // ---- a room, by the month and for good
  const room = await f.buy({ item: 'room', device: ada, amount: 5900, monthly: true, account: 'Ada' });
  const roomId = Object.keys(f.mem.get('urooms'))[0], awake = f.mem.get(`uroom:${roomId}`).state, sleeps = await f.refund(room.id);
  check('refund: a room given back in full falls asleep now, and its subscription is cancelled', awake === 'live' && sleeps.status === 200 && sleeps.body.took && sleeps.body.stopped && f.mem.get(`uroom:${roomId}`).state === 'asleep' && s.cancelled.includes(room.subscription) && /your room has fallen asleep/.test(notes(ada).at(-1)), [sleeps.body, f.mem.get(`uroom:${roomId}`)]);
  const forGood = await f.buy({ item: 'room', device: fay, amount: 19900, life: true, account: 'Fay' });
  const fayRoom = Object.keys(f.mem.get('urooms')).find((id) => f.mem.get('urooms')[id].o === 'fay'), wasLife = f.mem.get(`uroom:${fayRoom}`), goodNight = await f.refund(forGood.id);
  check('refund: …and so does a room bought for good', wasLife.state === 'live' && wasLife.life === true && goodNight.body.took === true && goodNight.body.stopped === false && f.mem.get(`uroom:${fayRoom}`).state === 'asleep', [goodNight.body, f.mem.get(`uroom:${fayRoom}`)]);

  // ---- a sponsor's place: by the month, for good, a plaque, a bid
  const month = await f.buy({ item: 'gondola:3', device: bob, amount: 2900, monthly: true }), life = await f.buy({ item: 'hut:4', device: bob, amount: 9950, life: true }), plaque = await f.buy({ item: 'plaque:5', device: cy, amount: 2000 }), bid = await f.buy({ item: 'board:cups', device: dee, amount: 800, bid: 800 });
  await f.settle();
  const had = Object.keys(f.mem.get('slots')).sort().join(), free = await f.look(month.id);
  f.pushed.length = 0;
  const m1 = await f.refund(month.id), l1 = await f.refund(life.id), p1 = await f.refund(plaque.id), b1 = await f.refund(bid.id);
  check('refund: a sponsor\'s place given back in full is freed — held by the month (its subscription is cancelled), bought for good, a plaque, a bid that holds a panel — and every room is told',
    had === 'board:cups,gondola:3,hut:4,plaque:5' && /Gondola 3 of the big wheel is freed/.test(free.look.take) && [m1, l1, p1, b1].every((r) => r.status === 200 && r.body.took === true) && m1.body.stopped === true && !l1.body.stopped && Object.keys(f.mem.get('slots')).length === 0 && s.cancelled.includes(month.subscription) && f.pushed.filter((m) => m.t === 'shop').length === 4 && /gondola 3 of the big wheel has been let go/.test(notes(bob).at(-2)), [had, free.look, m1.body, l1.body, p1.body, b1.body, Object.keys(f.mem.get('slots'))]);

  // ---- a place that is no longer theirs
  const mine = await f.buy({ item: 'gondola:9', device: bob, amount: 2900, monthly: true });
  await f.call('DELETE', '/api/sponsors', { query: 'slot=gondola:9' }); // (taken down by the fair, the money kept)
  const yours = await f.buy({ item: 'gondola:9', device: cy, amount: 2900, monthly: true });
  const gone = await f.look(mine.id), paidBack = await f.refund(mine.id);
  // …and a place bought once, taken down, then bought again by the same buyer: the later payment holds it
  const first = await f.buy({ item: 'plaque:30', device: gus, amount: 2000 });
  await f.call('DELETE', '/api/sponsors', { query: 'slot=plaque:30' });
  const second = await f.buy({ item: 'plaque:30', device: gus, amount: 2000 });
  const older = await f.look(first.id), olderBack = await f.refund(first.id), stillTheirs = !!f.mem.get('slots')['plaque:30'], newer = await f.refund(second.id);
  check('refund: a plaque taken down and bought again by the same buyer stays theirs when the first payment is given back — the second one frees it',
    older.look.held === false && olderBack.status === 200 && olderBack.body.took === false && stillTheirs && newer.body.took === true && !f.mem.get('slots')['plaque:30'], [older.look, olderBack.body, newer.body]);
  // …and what is paid by the month whose subscription Stripe no longer knows: it has ended, and its last month can still go back
  const gone2 = await f.buy({ item: 'hut:9', device: gus, amount: 1450, monthly: true });
  const lastMonth = s.invoices.get(gone2.invoice);
  s.subs.delete(gone2.subscription);
  const ghost = await f.look(gone2.id), ghostBack = await f.refund(gone2.id);
  check('refund: a subscription Stripe no longer knows has ended — its latest month is still given back, and nothing is asked to stop', ghost.look.asked === true && ghost.look.active === false && ghost.look.left === 1450 && ghostBack.status === 200 && ghostBack.body.stopped === false && !ghostBack.body.unstopped && s.payments.get(lastMonth.payment_intent).refunded === 1450 && (await f.line(gone2.id)).ended > 0, [ghost.look, ghostBack.body]);
  check('refund: a place taken down since, and sold again, stays with its new holder when the old payment is given back', gone.look.held === false && /no longer theirs/.test(gone.look.take) && paidBack.status === 200 && paidBack.body.took === false && f.mem.get('slots')['gondola:9'].sub === yours.subscription, [gone.look, paidBack.body]);
}

// ------------------------------------------------------------------------------------------- a part of a payment
async function testPart() {
  const f = fair(), s = f.stripe, gus = dev('gus'), hal = dev('hal');
  const jet = await f.buy({ item: 'jetpack', device: gus, amount: 3000, email: 'gus@example.org' });
  const earned = f.mem.get('stats:all').money;
  const part = await f.refund(jet.id, { amount: 1000, reason: 'A gesture' });
  await f.settle();
  const line = await f.line(jet.id);
  check('part: a part of a payment is given back — that sum is asked of Stripe — and nothing else changes: the thing stays theirs',
    part.status === 200 && part.body.refunded === 1000 && part.body.full === false && part.body.took === false && s.refunds.at(-1).amount === 1000 && s.payments.get(jet.payment_intent).refunded === 1000 && f.mem.get(`own:${gus}`).items.includes('jetpack') && earned - f.mem.get('stats:all').money === 1000, [part.body, s.refunds.at(-1)]);
  check('part: …its line says partly refunded, how much, and what is left; the buyer is told how much of what',
    line.state === 'part' && line.back === 1000 && line.left === 2000 && line.can === true && !line.taken && f.mem.get(`own:${gus}`).notes.at(-1) === 'The fair has refunded $10 of what you paid for the Jetpack.' && /for the Jetpack — \$10 of the \$30 you paid/.test(f.mails.find((m) => m.to === 'gus@example.org')?.text || ''), [line, f.mem.get(`own:${gus}`).notes]);
  const still = frozen(f), n = s.refunds.length;
  const over = await f.refund(jet.id, { amount: 2500 });
  check('part: never more than what is left — refused before Stripe is asked to give anything back, and nothing changes', over.status === 409 && /more than what is left of this payment: \$20/.test(over.body.error) && over.body.left === 2000 && s.refunds.length === n && frozen(f) === still, over.body);
  const bad = [];
  for (const amount of [0, -500, 12.5, 'ten', null]) bad.push((await f.refund(jet.id, { amount })).status);
  const missing = await f.call('POST', '/api/sales', { body: { refund: jet.id, amount: 500 } }), nobody = await f.refund('cs_nothing_of_the_kind', { amount: 500 });
  check('part: a sum that is not one — nothing, less than nothing, half a cent, a word — is refused; so is a refund without its token, and one of a sale that is not', bad.join() === '400,400,400,400,400' && missing.status === 400 && nobody.status === 404 && s.refunds.length === n && frozen(f) === still, [bad, missing.body, nobody.body]);
  const more = await f.refund(jet.id, { amount: 500 }), rest = await f.look(jet.id), last = await f.refund(jet.id, { all: true });
  const end = await f.line(jet.id);
  check('part: a second part, then all that is left: the last one makes it a full refund, and takes the thing back', more.status === 200 && rest.look.left === 1500 && rest.look.back === 1500 && last.status === 200 && last.body.refunded === 1500 && last.body.full === true && last.body.took === true && s.payments.get(jet.payment_intent).refunded === 3000 && !f.mem.get(`own:${gus}`).items.includes('jetpack') && end.state === 'refunded' && end.back === 3000 && end.log.map((l) => l.cents).join() === '1000,500,1500', [more.body, rest.look, last.body, end]);
  const exact = await f.buy({ item: 'hat:cap', device: hal, amount: 999 });
  const typed = await f.refund(exact.id, { amount: 999 });
  check('part: the whole sum typed as a part is a full refund all the same', typed.status === 200 && typed.body.full === true && typed.body.took === true && !f.mem.get(`own:${hal}`).items.includes('hat:cap'), typed.body);

  // a payment made while the VAT was on: it has an invoice, and a refund is a credit note on it
  const taxed = await f.buy({ item: 'fireworks', device: hal, amount: 1500, tax: true });
  const some = await f.refund(taxed.id, { amount: 300 }), note = s.credits.at(-1);
  check('part: a part of a payment that has an invoice is given back by a credit note of that sum on it', some.status === 200 && note?.invoice === taxed.invoice && note.total === 300 && note.amount === '300' && s.payments.get(taxed.payment_intent).refunded === 300 && !some.body.uncredited, [some.body, note]);
  const credits = s.credits.length, another = await f.refund(taxed.id, { amount: 200 });
  check('part: …when Stripe refuses the credit note (it makes one refund per payment that way), the money goes back the plain way and the owner is told a credit note is still to be made',
    another.status === 200 && s.credits.length === credits && s.payments.get(taxed.payment_intent).refunded === 500 && /already issued/.test(another.body.uncredited || '') && /already issued/.test(f.mem.get('refunds').at(-1).uncredited || ''), [another.body, f.mem.get('refunds').at(-1)]);
  // …and when nobody knows what became of the credit note, the money is not sent a second way
  const taxed2 = await f.buy({ item: 'paint:candy', device: hal, amount: 900, tax: true });
  const still2 = frozen(f), posts = () => s.asked.filter((a) => a.method === 'POST' && a.path === '/v1/refunds').length, plainBefore = posts();
  s.down = (method, path) => path === '/v1/credit_notes';
  const lostNote = await f.refund(taxed2.id, { amount: 400 });
  s.down = false;
  check('part: when Stripe does not answer about a credit note, nobody knows whether the money went back: it is not sent a second way, the owner is told to look in Stripe, and nothing changes here',
    lostNote.status === 502 && /nobody knows whether the money went back/.test(lostNote.body.error) && lostNote.body.refused === false && posts() === plainBefore && s.payments.get(taxed2.payment_intent).refunded === 0 && frozen(f) === still2, lostNote.body);
}

// ------------------------------------------------------------------------------------------ what Stripe refuses
async function testRefused() {
  const f = fair(), s = f.stripe, ivy = dev('ivy');
  const sell = async (item) => f.buy({ item, device: ivy, amount: 999 });
  const old = await sell('hat:cap'), poor = await sell('hat:straw'), fought = await sell('hat:beanie'), dark = await sell('hat:pirate'), silent = await sell('hat:viking'), done = await sell('hat:chef');
  const still = frozen(f), n = s.refunds.length;
  s.payments.get(old.payment_intent).old = true;
  const tooOld = await f.refund(old.id);
  check('refused: a payment too old for Stripe to give back — said in plain words, and nothing changes', tooOld.status === 409 && tooOld.body.refused === true && /^Stripe says this payment is too old to be given back\. Nothing was changed/.test(tooOld.body.error) && frozen(f) === still && s.refunds.length === n, tooOld.body);
  s.balance = 500;
  const short = await f.refund(poor.id);
  s.balance = Infinity;
  check('refused: not enough money in the Stripe balance — said in plain words, and nothing changes', short.status === 409 && /not enough money in your Stripe balance/.test(short.body.error) && frozen(f) === still && s.refunds.length === n, short.body);
  s.payments.get(fought.payment_intent).disputed = true;
  const disputed = await f.refund(fought.id);
  check('refused: a payment the buyer\'s bank is disputing — said in plain words, and nothing changes', disputed.status === 409 && /bank is disputing this payment/.test(disputed.body.error) && frozen(f) === still && s.refunds.length === n, disputed.body);
  s.down = true;
  const unreachable = await f.refund(dark.id), blind = await f.look(dark.id);
  s.down = false;
  check('refused: Stripe out of reach — nothing is asked, nothing changes; the dialog then shows the figures the fair keeps, and says so', unreachable.status === 502 && /Stripe could not be asked\. Nothing was changed/.test(unreachable.body.error) && frozen(f) === still && blind.look.asked === false && /could not be asked just now/.test(blind.look.error) && blind.look.left === 999, [unreachable.body, blind.look]);
  s.down = (method, path) => path === '/v1/refunds';
  const lost = await f.refund(silent.id, { amount: 300 });
  s.down = false;
  check('refused: Stripe silent at the very moment of giving back — nobody knows: said as such, never as a refusal, and nothing changes', lost.status === 502 && lost.body.refused === false && /nobody knows whether the money went back/.test(lost.body.error) && frozen(f) === still, lost.body);
  // given back in Stripe itself meanwhile: the list learns it, and nothing more is given back
  s.payments.get(done.payment_intent).refunded = 999;
  const already = await f.refund(done.id), line = await f.line(done.id);
  check('refused: a payment given back in Stripe itself meanwhile — nothing is left: nothing more is given back, nothing is taken, and its line now says what Stripe did',
    already.status === 409 && /Nothing is left of this payment/.test(already.body.error) && s.refunds.length === n && f.mem.get(`own:${ivy}`).items.includes('hat:chef') && line.state === 'refunded' && line.log[0].by === 'stripe' && !line.taken, [already.body, line]);
  // Stripe changes its mind between the look and the refund (another refund slipped in)
  const raced = await sell('hat:party');
  s.after = async (method, path) => { if (path.startsWith('/v1/payment_intents/')) s.payments.get(raced.payment_intent).refunded = 999; };
  const beaten = await f.refund(raced.id);
  s.after = null;
  check('refused: …and when Stripe itself says it was already given back, that is what the owner reads', beaten.status === 409 && /^Stripe says this payment was already given back\. Nothing was changed\.$/.test(beaten.body.error) && f.mem.get(`own:${ivy}`).items.includes('hat:party'), beaten.body);
  const noRef = await f.hook({ type: 'checkout.session.completed', data: { object: { id: 'cs_without_a_payment', payment_status: 'paid', amount_total: 999, metadata: { item: 'hat:propeller', device: ivy } } } });
  const blank = await f.refund('cs_without_a_payment');
  check('refused: a sale whose payment Stripe never named cannot be given back from here, and says where to', noRef.status === 200 && blank.status === 409 && /give it back in Stripe itself/.test(blank.body.error) && (await f.line('cs_without_a_payment')).can === false, blank.body);
  const shut = fair();
  shut.ctx.stripe = { mode: null };
  const closed = await shut.call('POST', '/api/sales', { body: { refund: 'cs_x', all: true, token: draw() } });
  check('refused: without a Stripe key nothing can be given back (the list is still read)', closed.status === 501 && (await shut.call('GET', '/api/sales')).status === 200, closed.body);
}

// ----------------------------------------------------------------------------------------------- a double click
async function testTwice() {
  const f = fair(), s = f.stripe, jo = dev('jo');
  const a = await f.buy({ item: 'jetpack', device: jo, amount: 3000 }), b = await f.buy({ item: 'hat:cap', device: jo, amount: 999 }), c = await f.buy({ item: 'paint:gold', device: jo, amount: 1900 });
  const token = draw();
  const both = await Promise.all([f.refund(a.id, { amount: 1000, token }), f.refund(a.id, { amount: 1000, token })]);
  check('twice: the same click said twice at the same moment is one refund — the second request is turned away while the first is at Stripe', both.map((r) => r.status).sort().join() === '200,409' && both.find((r) => r.status === 409).body.busy === true && s.refunds.length === 1 && s.payments.get(a.payment_intent).refunded === 1000 && (await f.line(a.id)).back === 1000, both.map((r) => r.body));
  const replay = await f.refund(a.id, { amount: 1000, token }), line = await f.line(a.id);
  check('twice: …and said again later, it is answered "done" without anything more being given back', replay.status === 200 && replay.body.again === true && s.refunds.length === 1 && line.back === 1000 && line.log.length === 1, replay.body);
  const two = await Promise.all([f.refund(b.id), f.refund(b.id)]), third = await f.refund(b.id);
  check('twice: two full refunds of one payment asked at once, from two pages, give it back once; a third finds nothing left', two.map((r) => r.status).sort().join() === '200,409' && third.status === 409 && /Nothing is left/.test(third.body.error) && s.payments.get(b.payment_intent).refunded === 999 && s.refunds.filter((r) => r.pay === b.payment_intent).length === 1, [two.map((r) => r.body), third.body]);
  // Stripe's own word of a refund (its webhook) comes before the request that asked for it is answered: counted once
  s.after = async (method, path, reply) => { if (path === '/v1/refunds' && reply.status === 200) await f.hook(s.event('charge.refunded', s.charge(c.payment_intent))); };
  const raced = await f.refund(c.id, { amount: 700, reason: 'A scratch on the gold' });
  s.after = null;
  const told = await f.line(c.id);
  check('twice: when Stripe tells of a refund before the request that asked for it has been answered, it is counted once — and its line keeps who asked, and why', raced.status === 200 && told.back === 700 && told.left === 1200 && told.log.length === 1 && told.log[0].by === 'owner' && told.log[0].cents === 700 && told.log[0].why === 'A scratch on the gold', told);
  await f.hook(s.event('charge.refunded', s.charge(c.payment_intent)));
  check('twice: …nor when Stripe says it once more afterwards', (await f.line(c.id)).back === 700 && (await f.line(c.id)).log.length === 1);
}

// ---------------------------------------------------------------------------------------------- who may ask
async function testWho() {
  const f = fair(), s = f.stripe, kim = dev('kim');
  f.adminKey = (await nameAdmin(f.store, { name: 'Mod', by: 'Owner' }, f.clock.t)).key;
  const hat = await f.buy({ item: 'hat:cap', device: kim, amount: 999 });
  const still = frozen(f), statuses = {};
  for (const as of ['visitor', 'admin']) {
    statuses[as] = [
      (await f.call('GET', '/api/sales', { as })).status, (await f.call('GET', '/api/sales', { as, query: `look=${hat.id}` })).status,
      (await f.refund(hat.id, { all: true }, as)).status, (await f.refund(hat.id, { amount: 100 }, as)).status, (await f.call('POST', '/api/sales', { body: { fetch: true }, as })).status,
      (await f.call('DELETE', '/api/sales', { as })).status,
    ].join();
  }
  const named = await f.call('GET', '/api/admin', { as: 'admin' });
  check('who: the list of the sales, a look at one, a refund and the reading of Stripe\'s list are the owner\'s alone — a visitor is refused, and so is an administrator the owner has named; nothing changes, Stripe is asked nothing',
    statuses.visitor === '403,403,403,403,403,403' && statuses.admin === '403,403,403,403,403,403' && named.status === 200 && named.body.owner === false && frozen(f) === still && s.refunds.length === 0 && !s.asked.some((x) => x.path.startsWith('/v1/payment_intents') || x.path.startsWith('/v1/checkout/sessions') && x.method === 'GET'), [statuses, named.body]);
  const owner = [(await f.call('GET', '/api/sales')).status, (await f.call('GET', '/api/sales', { query: `look=${hat.id}` })).status, (await f.call('PUT', '/api/sales')).status, (await f.call('POST', '/api/sales', { body: { nothing: true } })).status, (await f.refund(hat.id)).status].join();
  check('who: the owner reads, looks and gives back; what is not a request of the list is refused', owner === '200,200,405,400,200', owner);
}

// --------------------------------------------------------------- what Stripe says by itself: refunds, disputes
async function testHeard() {
  const f = fair(), s = f.stripe, lea = dev('lea');
  const a = await f.buy({ item: 'hat:cap', device: lea, amount: 999 }), b = await f.buy({ item: 'jetpack', device: lea, amount: 3000 }), c = await f.buy({ item: 'paint:gold', device: lea, amount: 1900 });
  s.payments.get(a.payment_intent).refunded = 300;
  await f.hook(s.event('charge.refunded', s.charge(a.payment_intent)));
  await f.hook(s.event('charge.refunded', s.charge(a.payment_intent)));
  const part = await f.line(a.id);
  check('heard: a refund made in Stripe itself is written on its line when Stripe tells of it — once — and takes nothing back', part.state === 'part' && part.back === 300 && part.left === 699 && part.log.length === 1 && part.log[0].by === 'stripe' && part.log[0].cents === 300 && f.mem.get(`own:${lea}`).items.includes('hat:cap') && (await f.sales()).totals.sums[0].back === 300, part);
  // a dispute: said on the line, nothing can be given back while it runs; lost, the money went back
  const dispute = (status, amount) => ({ id: 'dp_1', object: 'dispute', payment_intent: b.payment_intent, charge: `ch_${b.payment_intent.slice(3)}`, amount, currency: 'usd', reason: 'fraudulent', status });
  await f.hook(s.event('charge.dispute.created', dispute('needs_response', 3000)));
  s.payments.get(b.payment_intent).disputed = true;
  const open = await f.line(b.id), tried = await f.refund(b.id);
  check('heard: a dispute is said on its line, and the payment cannot be given back while it runs', open.state === 'disputed' && open.dispute.amount === 3000 && open.can === false && tried.status === 409 && /disputing/.test(tried.body.error), [open, tried.body]);
  await f.hook(s.event('charge.dispute.closed', dispute('lost', 3000)));
  await f.hook(s.event('charge.dispute.closed', dispute('lost', 3000)));
  const lost = await f.line(b.id);
  check('heard: a dispute lost is money gone back: counted once, by whom it went', lost.state === 'refunded' && lost.back === 3000 && lost.left === 0 && lost.can === false && lost.dispute.status === 'lost' && lost.log.filter((l) => l.by === 'dispute').length === 1, lost);
  const d2 = (status) => ({ id: 'dp_2', object: 'dispute', payment_intent: c.payment_intent, amount: 1900, reason: 'product_not_received', status });
  await f.hook(s.event('charge.dispute.created', d2('needs_response')));
  await f.hook(s.event('charge.dispute.closed', d2('won')));
  const won = await f.line(c.id);
  s.payments.get(c.payment_intent).disputed = 'won'; // (its charge goes on saying it was disputed)
  const after = await f.look(c.id), back = await f.refund(c.id, { amount: 400 });
  check('heard: a dispute won leaves the payment paid, and it can be given back again', won.state === 'paid' && won.back === 0 && won.can === true && won.dispute.status === 'won' && after.look.disputed === false && back.status === 200 && (await f.line(c.id)).back === 400, [won, after.look, back.body]);
  const stray = await f.hook(s.event('charge.refunded', { id: 'ch_of_nothing', payment_intent: 'pi_of_nothing_here', amount_refunded: 500 }));
  check('heard: what Stripe says of a payment the list does not have is let go', stray.status === 200 && (await f.sales()).totals.count === 3);
  const forged = await f.call('POST', '/api/stripe/webhook', { body: s.event('charge.refunded', { ...s.charge(c.payment_intent), amount_refunded: 1900 }), as: 'visitor' });
  check('heard: …and what does not carry Stripe\'s signature changes nothing', forged.status === 400 && (await f.line(c.id)).back === 400, forged.body);
}

// ---------------------------------------------------------- test payments and real ones; Stripe's newer invoices
async function testModes() {
  const f = fair({ live: true }), s = f.stripe, max = dev('max');
  const real = await f.buy({ item: 'hat:cap', device: max, amount: 999 });
  const trial = s.sell({ item: 'jetpack', device: max, amount: 3000, at: f.clock.t, live: false });
  await f.hook(s.event('checkout.session.completed', trial));
  const all = await f.sales();
  check('modes: once the shop sells for real, the test payments are neither listed nor counted — and the page is told how many are left out', all.mode === 'live' && all.totals.count === 1 && all.sales[0].id === real.id && all.totals.sums[0].paid === 999 && all.hidden === 1 && all.sales[0].link === `https://dashboard.stripe.com/payments/${real.payment_intent}` && !all.sales[0].test, all);

  // Stripe's newer API: an invoice no longer names its payment — a month is given back through its invoice alone
  const g = fair(), ned = dev('ned');
  g.stripe.modern = true;
  const pass = await g.buy({ item: 'pass', device: ned, amount: 1900, monthly: true });
  const view = await g.look(pass.id), part = await g.refund(pass.id, { amount: 400 }), line = await g.line(pass.id);
  check('modes: where Stripe\'s invoices no longer name their payment, a month is still given back — through a credit note on its invoice', view.look.asked && view.look.left === 1900 && part.status === 200 && g.stripe.credits.length === 1 && g.stripe.credits[0].total === 400 && line.state === 'part' && line.back === 400 && line.left === 1500, [view.look, part.body, line]);
  const still = frozen(g), second = await g.refund(pass.id, { amount: 300 });
  check('modes: …and what Stripe then refuses (a second part that way) is said, and changes nothing', second.status === 409 && second.body.refused === true && /^Stripe refused: A refund was already issued/.test(second.body.error) && frozen(g) === still, second.body);
  const stuck = await g.buy({ item: 'gondola:2', device: ned, amount: 2900, monthly: true });
  g.stripe.subs.get(stuck.subscription).stuck = true;
  await g.call('POST', '/api/notify', { body: { email: 'owner@fair.test' } });
  g.mails.length = 0;
  const kept = await g.refund(stuck.id);
  await g.settle();
  check('modes: a month given back whose subscription Stripe will not stop: the place is freed all the same, and the owner is told it may go on being charged', kept.status === 200 && kept.body.took === true && kept.body.stopped === false && /cannot be cancelled/.test(kept.body.unstopped) && !g.mem.get('slots')['gondola:2'] && g.mails.some((m) => /^A subscription could not be stopped/.test(m.subject)), [kept.body, g.mails.map((m) => m.subject)]);
}

for (const test of [testLedger, testPaging, testFill, testFull, testPart, testRefused, testTwice, testWho, testHeard, testModes]) {
  try { await test(); } catch (err) { check(`${test.name}: no unexpected error`, false, String(err && err.stack ? err.stack : err)); }
}
console.log(`\n${total - failures}/${total} checks passed`);
process.exit(failures ? 1 : 0);
