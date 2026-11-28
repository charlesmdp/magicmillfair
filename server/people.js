// Everybody who has an account, for the owner (the page /admin, "People") — and what the fair knows of those who
// have none. The owner's alone: an address is personal data, and no other administrator is shown one. Nothing
// here changes anything: it only reads.
//
//   GET /api/people?filter=all|email|password|google&q=<a name, an address>&page=1&size=50
//       → { total, counts: { all, email, password, google, waiting }, filter, q, matched, page, pages, size, at,
//           accounts: [{ name, how, email, created, last, days, best, items, pass, devices }]   (the newest first),
//           guests: { keeps, kept, signed, people, visits: [{ at, name, cc, city, n }] } }
//       how: how they sign in — 'password', 'google', 'both', 'email' (an address and no password yet: a link to
//         choose one was mailed), 'none'; last: when they last came (ms: a day, as their days in a row count it — or
//         when a browser last signed in); days: their days in a row as they stood at that visit (0 once the run is
//         over), best: the longest ever; items: how many things the account owns, pass: 'paid' | 'gift' | '';
//         devices: how many browsers are signed in.
//       filter: 'email' those that have an address · 'password' a name and a password, nothing else · 'google' those
//         Google opens. counts: of every account, whatever is looked for (waiting: no password yet).
//       guests: what is known of who never made an account — the visits of browsers that are signed in to none,
//         among the last `kept` visits the fair remembers (visitors.js keeps `keeps` at the most: when, the name the
//         robot wore, the country and the town); `people`: how many browsers the figures have ever counted (stats.js).
//         That is all there is: a name that is only typed stays in the browser that typed it.
//   GET /api/people?…&format=csv      every account that matches (not one page), as a table for a spreadsheet:
//                                     name, e-mail, signs in with, made, last seen
//   GET /api/people?…&format=emails   → { emails: [the addresses of every account that matches] }
//   …&fresh=1                         the accounts are read again now (otherwise what was read less than half a
//                                     minute ago is used: turning a page, typing in the box)
//
// The accounts are read a few hundred at a time (store.list(prefix, { after, limit })), and only a line of each is
// held: the records themselves are never all in memory at once, however many there are.
const out = (status, body, headers = {}) => ({ status, body, headers });
const DAY = 86_400_000, CHUNK = 500, FRESH = 30_000, SIZE = 50, SIZE_MAX = 200;
const FILTERS = { all: () => true, email: (r) => !!r.email, password: (r) => r.how === 'password' && !r.email, google: (r) => r.how === 'google' || r.how === 'both' };
/** How an account is signed in to, in words (the table for a spreadsheet says it so). */
export const HOW = { password: 'password', google: 'Google', both: 'password and Google', email: 'link by e-mail (no password yet)', none: 'nothing (no password, no Google, no address)' };

/** The line of an account, as the list holds it. */
function lineOf(a, now) {
  const visit = a.visit && Number.isInteger(a.visit.day) ? a.visit : null, today = Math.floor(now / DAY);
  const pass = a.pass ? (a.pass.gift ? (a.pass.until > now ? 'gift' : '') : 'paid') : '';
  return {
    name: String(a.name || ''), email: typeof a.email === 'string' ? a.email : '',
    how: a.hash && a.google ? 'both' : a.hash ? 'password' : a.google ? 'google' : a.email ? 'email' : 'none',
    created: Number(a.created) || 0,
    last: Math.max(Number(a.seen) || 0, visit ? visit.day * DAY : 0, Number(a.created) || 0),
    // (their day is the day at their place: one that came "yesterday" there may be two days back here — after that the run is over)
    days: visit && visit.day >= today - 2 ? visit.days || 0 : 0, best: visit?.best || 0,
    items: Array.isArray(a.items) ? a.items.length : 0, pass, devices: Array.isArray(a.devices) ? a.devices.length : 0,
  };
}

/** Every account, read a few hundred at a time: `each(record)` is called once for each. */
async function everyAccount(store, each) {
  const seen = new Set();
  for (let after = '', more = true; more;) {
    const chunk = await store.list('acct:', { after, limit: CHUNK });
    let fresh = 0, last = after;
    for (const [key, acct] of chunk) {
      if (key > last) last = key;
      if (seen.has(key) || !acct || typeof acct !== 'object' || !acct.name) continue;
      seen.add(key); fresh++;
      each(acct);
    }
    // (a store that does not page hands everything at once, and again when asked for more: nothing new, and it ends)
    more = chunk.length >= CHUNK && fresh > 0 && last > after;
    after = last;
  }
}

/** The list: a line for each account (the newest first), how many of each sort, and the visits of who has none. */
async function readPeople(ctx) {
  const store = ctx.store, now = ctx.now(), lines = [];
  const recent = ((await store.get('visitors:recent')) || []).filter((v) => v && typeof v === 'object');
  // (which of the last visits were made from a browser that is signed in: told by the beginning of its identifier,
  // which is all a visit keeps of it)
  const wanted = new Set(recent.map((v) => v.dev)), signed = new Set();
  await everyAccount(store, (acct) => {
    lines.push(lineOf(acct, now));
    for (const d of Array.isArray(acct.devices) ? acct.devices : []) { const start = String(d).slice(0, 8); if (wanted.has(start)) signed.add(start); }
  });
  lines.sort((a, b) => b.created - a.created || (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
  const counts = { all: lines.length, email: 0, password: 0, google: 0, waiting: 0 };
  for (const r of lines) { for (const f of ['email', 'password', 'google']) if (FILTERS[f](r)) counts[f]++; if (r.how === 'email') counts.waiting++; }
  const visits = recent.filter((v) => !signed.has(v.dev)).map((v) => ({ at: Number(v.at) || 0, name: String(v.name || ''), cc: String(v.cc || ''), city: String(v.city || ''), n: Number(v.n) || 1 })).reverse();
  const people = Number((await store.get('stats:all'))?.people) || 0;
  return { at: now, lines, counts, guests: { keeps: 300, kept: recent.length, signed: recent.length - visits.length, people, visits } };
}

// (a cell of the table: quoted when it must be — and never begun with what a spreadsheet would take for a formula)
const cell = (v) => { const s = /^[=+\-@\t\r]/.test(String(v)) ? `'${v}` : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const stamp = (ms) => (ms ? new Date(ms).toISOString().slice(0, 19).replace('T', ' ') : '');
const BOM = String.fromCharCode(0xfeff);
/** The accounts as a table for a spreadsheet (UTF-8, with the mark Excel wants to read it so). */
export const peopleCsv = (lines) => `${BOM}${[['name', 'e-mail', 'signs in with', 'made (UTC)', 'last seen (UTC)'], ...lines.map((r) => [r.name, r.email, HOW[r.how] || r.how, stamp(r.created), stamp(r.last).slice(0, 10)])].map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`;

/** Answers /api/people (the owner alone); returns nothing for any other path. */
export async function peopleRoute(req, ctx) {
  if (req.path !== '/api/people') return null;
  if (!req.owner) return out(403, { error: 'Only the owner.' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
  if (typeof ctx.store.list !== 'function') return out(501, { error: 'This server cannot list its accounts.' });
  const q = req.query, now = ctx.now();
  if (!ctx.people || q.get('fresh') === '1' || now - ctx.people.at > FRESH || now < ctx.people.at) ctx.people = await readPeople(ctx);
  const { lines, counts, guests, at } = ctx.people;
  const filter = Object.hasOwn(FILTERS, q.get('filter') || '') ? q.get('filter') : 'all', find = (q.get('q') || '').trim().toLowerCase().slice(0, 80);
  const matching = lines.filter((r) => FILTERS[filter](r) && (!find || r.name.toLowerCase().includes(find) || r.email.includes(find)));
  if (q.get('format') === 'csv') {
    return { status: 200, bytes: new TextEncoder().encode(peopleCsv(matching)), headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="atomic-oasis-accounts-${new Date(now).toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } };
  }
  if (q.get('format') === 'emails') return out(200, { emails: matching.filter((r) => r.email).map((r) => r.email) });
  const size = Math.min(SIZE_MAX, Math.max(1, Math.floor(Number(q.get('size')) || SIZE))), pages = Math.max(1, Math.ceil(matching.length / size));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(q.get('page')) || 1)));
  return out(200, { total: lines.length, counts, filter, q: find, matched: matching.length, page, pages, size, at, accounts: matching.slice((page - 1) * size, page * size), guests });
}
