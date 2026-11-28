// The e-mails, as the owner looks after them from the back office (the page /admin, "E-mails": the owner's alone)
// — and the one door every message leaves by.
//
//   GET  /api/mails                                   → { mail (can this server send e-mail at all), me (where the
//                                                        owner's tests go), notify (where the owner is told of new
//                                                        sponsors: shop.js), kinds: [each kind of message: what it is,
//                                                        when it leaves and to whom, whether it is switched off, its
//                                                        sentences and what was typed in their place, the cases it has],
//                                                        log: [what left lately, the newest first], keeps }
//   POST /api/mails { kind, off }                     a kind is switched off (true), or on again
//   POST /api/mails { kind, words: { <sentence>: text | null } }   the owner's words for sentences of that kind
//                                                        (null: back to the original) — refused, and nothing kept,
//                                                        when one of them cannot be used (mail.js checkWords)
//   POST /api/mails { preview: { kind, form, words } }   → { subject, text, html, used, broken }: that message as it
//                                                        would leave with these words — nothing is kept
//   POST /api/mails { send: { kind, form, words } }   that message, with made-up values, to the owner's own address
//   POST /api/mails { me }                            the owner's own address, for those tests ('' forgets it)
//
// THE DOOR. Whoever sends a message calls ctx.mail (or mailLater, which does): mailDoor(ctx) — called by route()
// for every request — stands there once and for all, in front of the mailer the host gave. A message that comes
// with its kind (the builders of mail.js say it: { kind, args, form }) is then:
//   · not sent at all when its kind is switched off — except the two that must always leave (LOCKED: the code to set
//     a new password, the link to choose a first one);
//   · written again with the owner's words, where some were typed for that kind;
//   · handed to the mailer;
//   · and noted on the list of what left: when, which kind, to whom, whether the mailer took it — or why not.
// Nothing leaves any other way: neither the switches, nor the words, nor the list can be gone round.
//
// The list keeps no address. For an account it keeps its name — the back office shows the address that account has
// at the moment it is looked at; for a buyer without an account, whose address is asked of Stripe for one message
// and kept nowhere (the privacy page says so), it keeps nothing of who it was. The owner's own address is the owner's.
//
// Kept: `mailset` → { off: { <kind>: true }, words: { <kind>: { <sentence>: text } }, me }; `maillog` → the last
// MAIL_LOG messages, [{ at, kind, form?, state: 'sent' | 'off' | 'failed', error?, test?, to (the owner's own
// address) | acct (the name of an account; paid: at the address given at the payment, not at the account's) | guest }].
// (Neither begins with "mail:" — those are the addresses of the accounts: accounts.js.)
import { MAILS, buildMail, checkWords, cleanEmail } from './mail.js';
import { PASS } from './items.js';
import { PRICES } from './catalog.js';
import { LEGAL } from '../src/app/legal.js';

const out = (status, body, headers = {}) => ({ status, body, headers });
const SET = 'mailset', LOG = 'maillog';
/** How many messages the list of what left remembers. */
export const MAIL_LOG = 200;
/** The kinds that are always sent, and why (said to the owner, in the place of their switch). */
export const LOCKED = {
  code: 'Always sent: it is how somebody who forgot their password gets back into their account.',
  invite: 'Always sent: this link is how an account made with a name and an address gets its password.',
};
/** The kinds that go to the owner (at the address given in the back office: shop.js). */
const TO_OWNER = new Set(['ownerSale', 'ownerRefund']);

const settingsOf = async (store) => {
  const s = (await store.get(SET)) || {};
  return { off: s.off && typeof s.off === 'object' ? s.off : {}, words: s.words && typeof s.words === 'object' ? s.words : {}, me: cleanEmail(s.me || '') };
};
const said = (err) => String(err?.message || err).replace(/[^\s<>"'()]+@[^\s<>"'()]+/g, '(an address)').slice(0, 160);

/** A line is added to the list of what left (one at a time: two messages leaving together both get theirs). Never throws. */
function noteMail(ctx, entry) {
  const write = async () => {
    try { await ctx.store.put(LOG, [...((await ctx.store.get(LOG)) || []), entry].slice(-MAIL_LOG)); } catch (err) { console.error('[mail] the list of what left', said(err)); }
  };
  return (ctx.mailNoted = (ctx.mailNoted || Promise.resolve()).then(write));
}

/** To whom a message goes, as the list keeps it: never the address of anybody but the owner (see the top of this file). */
async function whomOf(ctx, kind, args, to, test) {
  if (test || TO_OWNER.has(kind)) return { to: cleanEmail(to) };
  if (!kind) return {}; // (a message that does not say what it is: nothing is known of whom it is for)
  const name = typeof args?.[1] === 'string' ? args[1] : '';
  const acct = name ? await ctx.store.get(`acct:${name.toLowerCase()}`) : null;
  return acct ? { acct: acct.name, ...(acct.email !== to && { paid: 1 }) } : { guest: 1 };
}

/** One message at the door: see the top of this file. Resolves once it has left (or was not to leave); throws what the mailer threw. */
async function leave(ctx, send, message) {
  const { kind: its, args, form: as, test, ...mail } = message || {};
  const kind = typeof its === 'string' && Object.hasOwn(MAILS, its) ? its : '', form = kind && typeof as === 'string' ? as.slice(0, 24) : '';
  // (a store that cannot be read stops no message: it leaves as its builder wrote it)
  const set = await settingsOf(ctx.store).catch(() => ({ off: {}, words: {}, me: '' }));
  const whom = await whomOf(ctx, kind, args, mail.to, test).catch(() => ({}));
  const note = (state, more) => noteMail(ctx, { at: ctx.now(), kind, ...(form && { form }), ...whom, state, ...(test && { test: 1 }), ...more });
  if (kind && !test && set.off[kind] && !Object.hasOwn(LOCKED, kind)) {
    await note('off');
    // (the owner trying the address of the new sponsors, under "Sponsors": told why nothing comes)
    if (kind === 'ownerSale' && form === 'test') throw new Error('this kind of message is switched off (the tab “E-mails”)');
    return;
  }
  let leaving = mail;
  const words = kind && !test && Array.isArray(args) ? set.words[kind] : null;
  if (words && typeof words === 'object' && Object.keys(words).length) {
    try { const made = buildMail(kind, args, words); leaving = { ...mail, subject: made.subject, text: made.text, html: made.html }; } catch (err) { console.error('[mail] the words of the owner', said(err)); }
  }
  try { await send(leaving); } catch (err) { await note('failed', { error: said(err) }); throw err; }
  await note('sent');
}

/**
 * The door is put in front of the mailer of this host, once: from then on ctx.mail is the door (see the top of
 * this file). Where the host sends no e-mail there is nothing to stand in front of.
 */
export function mailDoor(ctx) {
  if (!ctx || typeof ctx.mail !== 'function' || ctx.mail.door) return;
  const send = ctx.mail;
  ctx.mail = Object.assign((message) => leave(ctx, send, message), { door: true });
}

// ---- what the back office shows ---------------------------------------------------------------------------------
// Each kind in plain words — what it is called, when it leaves, to whom — and the cases it has (`forms`): each a
// message of that kind with made-up values, to look at, to change the words of, to send oneself.
const ROBIN = 'Robin', PLACE = {
  board: 'the board of Mostly Up', gondola: 'gondola 3 of the big wheel', hut: 'beach hut 7 by the pier, for good',
  plaque: 'a plaque for a companion, at the feet of the golden dog (no. 12)', wall: 'a plaque for a companion, on the wall of the companions by the golden dog (no. 80)',
};
const BUYER = 'The address of their account — or, for a buyer without an account, the address they gave at the payment (asked of Stripe for this message, and kept nowhere).';
const TOO_OLD = 'This payment is too old to be refunded.';
const notice = (site, what, name = ROBIN) => [site, name, { contact: LEGAL.contact, ...what }];
export const ABOUT = {
  welcome: {
    name: 'The welcome', when: 'Once, when an account is made with a password and an address — or with Google.', to: 'The address of the new account.',
    forms: [{ id: 'welcome', name: 'The welcome', args: (site) => [site, ROBIN] }],
  },
  invite: {
    name: 'The link to choose a first password', when: 'When an account is made with a name and an address only (“How should we call you?”, or at the moment of paying) — and again when its owner asks for the link once more. The link is good for a week, once.', to: 'The address they gave.',
    forms: [{ id: 'invite', name: 'The link', args: (site) => [site, ROBIN, `${site}/?pw=a-link-made-up-for-this-page`, 7] }],
  },
  code: {
    name: 'The code to set a new password', when: 'When somebody who forgot their password asks for a code by e-mail (Settings, Your account, “Forgot the password”). The code is good for half an hour, once.', to: 'The address of that account.',
    forms: [{ id: 'code', name: 'The code', args: (site) => [site, ROBIN, 'K7QM-2HXP-9WRT', 30] }],
  },
  pass: {
    name: 'Thanks for the Game Pass', when: 'Once, when somebody takes the Game Pass.', to: BUYER,
    forms: [
      { id: 'account', name: 'To somebody who has an account', args: (site) => [site, ROBIN, { perks: PASS.perks, cents: PASS.price }] },
      { id: 'guest', name: 'To a buyer without an account', args: (site) => [site, '', { perks: PASS.perks, cents: PASS.price }] },
      { id: 'unpriced', name: 'Rare — when the price is not known', args: (site) => [site, ROBIN, { perks: PASS.perks, cents: 0 }] },
    ],
  },
  sponsor: {
    name: 'Thanks to a sponsor', when: 'Once, when somebody pays for a sponsor\'s place, or for a plaque.', to: BUYER,
    forms: [
      { id: 'month', name: 'A place paid by the month', args: (site) => [site, ROBIN, { place: PLACE.gondola, cents: PRICES.gondola, monthly: true }] },
      { id: 'bid', name: 'The panel of a game, won with a bid', args: (site) => [site, ROBIN, { place: PLACE.board, cents: 4000, auction: true }] },
      { id: 'life', name: 'A place bought for good', args: (site) => [site, ROBIN, { place: PLACE.hut, cents: PRICES.hutLife, life: true }] },
      { id: 'plaque', name: 'A plaque at the feet of the golden dog', args: (site) => [site, ROBIN, { place: PLACE.plaque, cents: PRICES.plaque, plaque: true }] },
      { id: 'wall', name: 'A plaque on the wall of the companions', args: (site) => [site, ROBIN, { place: PLACE.wall, cents: PRICES.plaque, plaque: true, wall: true }] },
      { id: 'guest', name: 'To a buyer without an account', args: (site) => [site, '', { place: PLACE.gondola, cents: PRICES.gondola, monthly: true }] },
    ],
  },
  sponsorNotice: {
    name: 'A word to a sponsor about their place', when: 'When something happens to what a sponsor paid for: outbid, a bid that came too late, the big panel of an attraction taken by another, taken down, refunded.', to: BUYER,
    forms: [
      { id: 'outbid', name: 'Outbid — their bid given back', args: (site) => notice(site, { kind: 'outbid', place: PLACE.board, cents: 4000, refunded: true }) },
      { id: 'outbidKept', name: 'Outbid — Stripe could not give the bid back', args: (site) => notice(site, { kind: 'outbid', place: PLACE.board, cents: 4000 }) },
      { id: 'late', name: 'A bid that came too late — given back', args: (site) => notice(site, { kind: 'late', place: PLACE.board, cents: 4000, refunded: true }) },
      { id: 'lateKept', name: 'A bid that came too late — Stripe could not give it back', args: (site) => notice(site, { kind: 'late', place: PLACE.board, cents: 4000 }) },
      { id: 'top', name: 'The big panel went to another, who put in more', args: (site) => notice(site, { kind: 'top', place: 'Mostly Up', cents: 5000 }) },
      { id: 'topTie', name: 'The big panel went to another, who put in as much and comes first', args: (site) => notice(site, { kind: 'top', place: 'Mostly Up', cents: 5000, tie: true }) },
      { id: 'topFirst', name: 'The big panel went to another — as much would take it back', args: (site) => notice(site, { kind: 'top', place: 'Mostly Up', cents: 5000, first: true }) },
      { id: 'down', name: 'A panel taken down — the bid given back', args: (site) => notice(site, { kind: 'down', place: PLACE.board, cents: 4000, refunded: true }) },
      { id: 'downKept', name: 'A panel taken down — the money kept', args: (site) => notice(site, { kind: 'down', place: PLACE.board, cents: 4000 }) },
      { id: 'downMonth', name: 'A place paid by the month taken down — the month given back', args: (site) => notice(site, { kind: 'down', place: PLACE.gondola, monthly: true, refunded: true }) },
      { id: 'downStopped', name: 'A place paid by the month taken down — nothing more charged', args: (site) => notice(site, { kind: 'down', place: PLACE.gondola, monthly: true }) },
      { id: 'downPlaque', name: 'A plaque taken down — the money given back', args: (site) => notice(site, { kind: 'down', place: PLACE.plaque, cents: PRICES.plaque, plaque: true, refunded: true }) },
      { id: 'refunded', name: 'Refunded after all, from the back office', args: (site) => notice(site, { kind: 'refunded', place: PLACE.board, cents: 4000 }) },
      { id: 'guest', name: 'To a buyer without an account (outbid)', args: (site) => notice(site, { kind: 'outbid', place: PLACE.board, cents: 4000, refunded: true }, '') },
      { id: 'topUnknown', name: 'Rare — the big panel went to another, for a sum that is not known', args: (site) => notice(site, { kind: 'top', place: 'Mostly Up' }) },
    ],
  },
  ownerSale: {
    name: 'To you: a new sponsor', when: 'Each time a sponsor\'s place or a plaque is paid for — and when you press “Send a test” under Sponsors.', to: 'You, at the address saved under Sponsors (“E-mail me each new sponsor at”).',
    forms: [
      { id: 'month', name: 'A place paid by the month', args: (site) => [site, { place: PLACE.gondola, cents: PRICES.gondola, monthly: true, account: ROBIN }] },
      { id: 'bid', name: 'The panel of a game, won with a bid — by a guest', args: (site) => [site, { place: PLACE.board, cents: 4000, auction: true }] },
      { id: 'life', name: 'A place bought for good', args: (site) => [site, { place: PLACE.hut, cents: PRICES.hutLife, life: true, account: ROBIN }] },
      { id: 'plaque', name: 'A plaque', args: (site) => [site, { place: PLACE.plaque, cents: PRICES.plaque, plaque: true, account: ROBIN }] },
      { id: 'lost', name: 'Paid for, but somebody had the place already', args: (site) => [site, { place: PLACE.gondola, cents: PRICES.gondola, monthly: true, account: ROBIN, lost: true }] },
      { id: 'test', name: 'The test (“Send a test”, under Sponsors)', args: (site) => [site, { test: true }] },
    ],
  },
  ownerRefund: {
    name: 'To you: a refund', when: 'Each time money is given back — or when Stripe refuses to give it back, or to stop a subscription.', to: 'You, at the same address.',
    forms: [
      { id: 'outbid', name: 'Given back — its holder was outbid', args: (site) => [site, { cents: 4000, place: PLACE.board, reason: 'outbid' }] },
      { id: 'raised', name: 'Given back — its holder raised their own bid', args: (site) => [site, { cents: 4000, place: PLACE.board, reason: 'raised' }] },
      { id: 'late', name: 'Given back — a bid that came too late', args: (site) => [site, { cents: 4000, place: PLACE.board, reason: 'late' }] },
      { id: 'down', name: 'Given back — a panel taken down', args: (site) => [site, { cents: 4000, place: PLACE.board, reason: 'down' }] },
      { id: 'downMonth', name: 'Given back — the month of a place taken down', args: (site) => [site, { cents: PRICES.gondola, place: PLACE.gondola, reason: 'down', monthly: true }] },
      { id: 'later', name: 'Given back from the back office', args: (site) => [site, { cents: 4000, place: PLACE.board, reason: 'later' }] },
      { id: 'credit', name: 'Given back — but its invoice still wants a credit note', args: (site) => [site, { cents: 4000, place: PLACE.board, reason: 'outbid', uncredited: 'Credit notes cannot be made just now.' }] },
      { id: 'failed', name: 'Stripe refused to give it back', args: (site) => [site, { cents: 4000, place: PLACE.board, reason: 'outbid', ok: false, error: TOO_OLD }] },
      { id: 'failedMonth', name: 'Stripe refused to give a month back', args: (site) => [site, { cents: PRICES.gondola, place: PLACE.gondola, reason: 'down', monthly: true, ok: false, error: TOO_OLD }] },
      { id: 'unstopped', name: 'A subscription Stripe would not stop', args: (site) => [site, { place: PLACE.gondola, monthly: true, unstopped: true, asked: false, error: 'This subscription cannot be cancelled just now.' }] },
      { id: 'unstoppedAsked', name: 'A subscription Stripe would not stop — its month was to be given back', args: (site) => [site, { place: PLACE.gondola, monthly: true, unstopped: true, error: 'This subscription cannot be cancelled just now.' }] },
      { id: 'unknown', name: 'Rare — when the sum, the place or Stripe\'s reason is not known', args: (site) => [site, { reason: 'later', ok: false }] },
      { id: 'unplaced', name: 'Rare — a subscription not stopped, for a place that is not known', args: (site) => [site, { unstopped: true }] },
    ],
  },
};
/** What the builders call the case they made (mail.js: `form`), in a few words, for the list of what left. */
const CASES = {
  sponsor: { plaque: 'a plaque' },
  ownerSale: { plaque: 'a plaque', lost: 'paid, but not given', test: 'the test' },
  sponsorNotice: { outbid: 'outbid', late: 'a bid too late', top: 'the big panel', down: 'taken down', refunded: 'refunded' },
  ownerRefund: { failed: 'refused by Stripe', unstopped: 'a subscription not stopped' },
};

/** A sentence of the table as the owner is shown it: what the reader of the dressed message reads (no markup). */
const originalOf = (f) => (f.html ? f.html.replace(/<[^>]+>/g, '') : f.text);
const plainQuotes = (s) => s.replace(/[“”]/g, '"');
/** The words the owner is typing, laid over those that are kept: { sentence: text } (null: back to the original). */
function laid(kept, typing) {
  const words = { ...(kept && typeof kept === 'object' ? kept : {}) };
  for (const [id, text] of Object.entries(typing && typeof typing === 'object' ? typing : {})) { if (text === null) delete words[id]; else if (typeof text === 'string') words[id] = text; }
  return words;
}
/** The sentences among `words` that cannot be used, and why: { sentence: why } (the original is sent in their place). */
const brokenIn = (kind, words) => Object.fromEntries(Object.entries(words).filter(([id]) => Object.hasOwn(MAILS[kind].fields, id)).map(([id, text]) => [id, checkWords(kind, id, text)]).filter(([, c]) => !c.ok).map(([id, c]) => [id, c.why]));
const formOf = (kind, id) => ABOUT[kind].forms.find((f) => f.id === id) || ABOUT[kind].forms[0];

/** One kind, as the back office shows it (with the words that are kept for it, and whether it is switched off). */
function shown(kind, set, site) {
  const about = ABOUT[kind], table = MAILS[kind], words = set.words[kind] && typeof set.words[kind] === 'object' ? set.words[kind] : {};
  return {
    id: kind, name: about.name, when: about.when, to: about.to, locked: LOCKED[kind] || '', off: !!set.off[kind] && !Object.hasOwn(LOCKED, kind),
    vars: table.vars, broken: brokenIn(kind, words),
    fields: Object.entries(table.fields).map(([id, f]) => {
      const original = originalOf(f);
      return { id, label: f.label, original, ...(plainQuotes(original) !== f.text && { twin: f.text }), ...(f.line && { line: true }), ...(f.must && { must: true }), ...(f.only && { only: f.only }), ...(f.note && { note: f.note }), ...(f.own && { own: f.own }), ...(f.needs && { needs: f.needs }), ...(typeof words[id] === 'string' && { typed: words[id] }) };
    }),
    forms: about.forms.map((form) => { const used = new Set(), made = buildMail(kind, form.args(site), words, used); return { id: form.id, name: form.name, subject: made.subject, fields: Object.keys(table.fields).filter((id) => used.has(id)) }; }),
  };
}

/** The list of what left, as the owner reads it: the newest first, each with the address its account has now. */
async function readLog(ctx) {
  const log = [...((await ctx.store.get(LOG)) || [])].reverse(), emails = new Map();
  for (const e of log) if (e.acct && !e.paid && !emails.has(e.acct)) emails.set(e.acct, (await ctx.store.get(`acct:${String(e.acct).toLowerCase()}`))?.email || '');
  return log.map((e) => ({
    at: e.at, kind: e.kind || '', name: ABOUT[e.kind]?.name || 'Another message', ...(CASES[e.kind]?.[e.form] && { form: CASES[e.kind][e.form] }), state: e.state, ...(e.error && { error: e.error }), ...(e.test && { test: true }),
    whom: e.to ? { you: true, email: e.to } : e.acct ? { account: e.acct, ...(e.paid ? { paid: true } : { email: emails.get(e.acct) || '' }) } : e.guest ? { guest: true } : {},
  }));
}

/** Answers /api/mails (the owner alone); returns nothing for any other path. */
export async function mailsRoute(req, ctx) {
  if (req.path !== '/api/mails') return null;
  if (!req.owner) return out(403, { error: 'Only the owner.' });
  const { method, body } = req, store = ctx.store, site = req.site || '', set = await settingsOf(store);
  const all = async () => ({ mail: !!ctx.mail, me: set.me, notify: cleanEmail((await store.get('notify'))?.email || ''), kinds: Object.keys(ABOUT).map((kind) => shown(kind, set, site)), log: await readLog(ctx), keeps: MAIL_LOG });
  if (method === 'GET' || method === 'HEAD') return out(200, await all());
  if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD, POST' });
  const b = body && typeof body === 'object' ? body : {};
  const save = (next) => store.put(SET, { off: next.off, words: next.words, ...(next.me && { me: next.me }), at: ctx.now() });

  if (typeof b.me === 'string') {
    const me = b.me.trim() ? cleanEmail(b.me) : '';
    if (b.me.trim() && !me) return out(400, { error: 'That does not look like an e-mail address.' });
    await save({ ...set, me });
    return out(200, { ok: true, me });
  }

  const asked = b.preview || b.send;
  if (asked && typeof asked === 'object') {
    // a message of that kind with made-up values, written with the words that are kept and — over them — those being typed
    const kind = Object.hasOwn(ABOUT, asked.kind) ? asked.kind : '';
    if (!kind) return out(400, { error: 'There is no such kind of message.' });
    const words = laid(set.words[kind], asked.words), used = new Set(), made = buildMail(kind, formOf(kind, asked.form).args(site), words, used);
    if (b.preview) return out(200, { subject: made.subject, text: made.text, html: made.html, used: Object.keys(MAILS[kind].fields).filter((id) => used.has(id)), broken: brokenIn(kind, words) });
    if (!ctx.mail) return out(501, { error: 'This server sends no e-mail.' });
    if (!set.me) return out(400, { error: 'Say first where your tests are to be sent (at the top of this page).' });
    // (through the door, like every message — marked as a test: it leaves even while its kind is switched off, as it is written here)
    try { await ctx.mail({ to: set.me, subject: `[Test] ${made.subject}`, text: made.text, html: made.html, kind, form: made.form, test: true }); } catch (err) { return out(502, { error: `It could not be sent: ${said(err)}` }); }
    return out(200, { ok: true, sent: true, to: set.me, log: await readLog(ctx) });
  }

  const kind = Object.hasOwn(ABOUT, b.kind) ? b.kind : '';
  if (!kind) return out(400, { error: 'There is no such kind of message.' });
  if (typeof b.off === 'boolean') {
    if (b.off && Object.hasOwn(LOCKED, kind)) return out(409, { error: `This one cannot be switched off. ${LOCKED[kind]}` });
    const off = { ...set.off };
    if (b.off) off[kind] = true; else delete off[kind];
    await save({ ...set, off });
    return out(200, { ok: true, kind, off: b.off });
  }
  if (b.words && typeof b.words === 'object') {
    const fields = MAILS[kind].fields, mine = { ...(set.words[kind] && typeof set.words[kind] === 'object' ? set.words[kind] : {}) };
    for (const [id, typed] of Object.entries(b.words)) {
      if (!Object.hasOwn(fields, id)) return out(400, { error: 'That is not a sentence of this message.', field: id });
      if (typed === null) { delete mine[id]; continue; }
      const looked = checkWords(kind, id, typed);
      if (!looked.ok) return out(400, { error: `“${fields[id].label}”: ${looked.why}`, field: id, why: looked.why });
      // (the original typed again is the original)
      if (looked.text === fields[id].text || looked.text === originalOf(fields[id])) delete mine[id]; else mine[id] = looked.text;
    }
    const words = { ...set.words };
    if (Object.keys(mine).length) words[kind] = mine; else delete words[kind];
    await save({ ...set, words });
    return out(200, { ok: true, kind: shown(kind, { ...set, words }, site) });
  }
  return out(400, { error: 'Nothing to do.' });
}
