// Checks of the two tabs of the back office that are the owner's alone — "People" (server/people.js) and "E-mails"
// (server/mails.js, and the words of server/mail.js) — without a browser:
//   · the words: every e-mail of the fair, built in ten thousand ways, still says byte for byte what it said before
//     its words could be changed (tools/lib/mail-before.mjs is what it said); a sentence the owner types changes
//     that sentence and nothing else; what is typed is text, never markup; a sentence that cannot be used — a
//     placeholder that does not exist, a line emptied that the message cannot do without — is not used at all;
//   · the door every message leaves by, with a store in memory: a kind switched off does not leave, and the list
//     says so; the two that are always sent cannot be switched off; the owner's words go into what leaves; a
//     failure is noted with its reason; the list keeps two hundred messages and never an address but the owner's;
//   · the accounts read a few hundred at a time, on a store that pages and on one that does not;
//   · the two paths on the game's own server (Node; each message written to MAIL_FILE instead of leaving): the
//     list, its filters, its pages, what is looked for, the table for a spreadsheet — for the owner, and for nobody else.
// usage: node tools/people-test.mjs
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as before from './lib/mail-before.mjs';
import * as mail from '../server/mail.js';
import { mailCases, builderOf, firstDifference } from './lib/mail-cases.mjs';
import { MAILS, buildMail, checkWords, mailLater } from '../server/mail.js';
import { ABOUT, LOCKED, MAIL_LOG } from '../server/mails.js';
import { peopleCsv } from '../server/people.js';
import { route } from '../server/routes.js';
import { Limiter } from '../server/api.js';
import { freePort, request, sleep, until } from './lib/net.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' && !ok ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const SITE = 'https://fair.example';

// ------------------------------------------------------------------------------------------------- the words
{
  const cases = mailCases(), wrong = [];
  for (const [kind, args] of cases) {
    const was = builderOf(before, kind)(...args), is = builderOf(mail, kind)(...args);
    for (const part of ['subject', 'text', 'html']) if (was[part] !== is[part] && wrong.length < 5) wrong.push(`${kind} ${part} ${JSON.stringify(args).slice(0, 160)} ${firstDifference(String(was[part]), String(is[part]))}`);
  }
  const kinds = [...new Set(cases.map(([kind]) => kind))];
  check(`the words: with nothing typed in the back office, each of the eight kinds of e-mail says what it said before — its subject, its plain text and its HTML, byte for byte, in ${cases.length} cases`,
    cases.length > 5000 && kinds.length === 8 && kinds.every((k) => Object.hasOwn(MAILS, k)) && !wrong.length, wrong);

  const one = mail.sponsorNoticeMail(SITE, 'Ada', { kind: 'outbid', place: 'the board of Mostly Up', cents: 700, refunded: true });
  check('the words: a builder says which kind it made, and with what — so that the door can write it again in the owner\'s words',
    one.kind === 'sponsorNotice' && one.form === 'outbid' && Array.isArray(one.args) && one.args[1] === 'Ada' && mail.codeMail(SITE, 'Ada', 'AAAA-BBBB-CCCC', 30).kind === 'code' && mail.ownerSaleMail(SITE, { test: true }).form === 'test', [one.kind, one.form]);

  // (each case the back office shows, of each kind: the sentences it is made of)
  const forms = Object.entries(ABOUT).flatMap(([kind, about]) => about.forms.map((form) => {
    const used = new Set(), made = buildMail(kind, form.args(SITE), null, used);
    return { kind, form: form.id, args: form.args(SITE), made, used: [...used] };
  }));
  const shown = (kind) => new Set(forms.filter((f) => f.kind === kind).flatMap((f) => f.used));
  const hidden = Object.keys(MAILS).flatMap((kind) => Object.keys(MAILS[kind].fields).filter((id) => !shown(kind).has(id)).map((id) => `${kind}.${id}`));
  check('the words: every kind has its page in the back office — what it is, when it leaves and to whom, the cases it has — and every sentence of the table is in a case that can be looked at',
    Object.keys(MAILS).sort().join() === Object.keys(ABOUT).sort().join() && Object.values(ABOUT).every((a) => a.name && a.when && a.to && a.forms.length && new Set(a.forms.map((f) => f.id)).size === a.forms.length) && !hidden.length
    && Object.values(MAILS).every((m) => Object.values(m.fields).every((f) => f.label && typeof f.text === 'string' && f.text)), hidden);

  // what stands for the placeholders a sentence cannot do without, in the cases of this page
  const NEEDED = { code: 'K7QM-2HXP-9WRT', link: `${SITE}/?pw=a-link-made-up-for-this-page` };
  // A sentence typed in the place of each sentence of each case, one at a time: wherever it shows — the subject, the
  // text, the HTML — it stands in the place of one same sentence, and the rest of the message has not moved.
  const moved = [], unseen = [], raw = [];
  let typedCount = 0;
  // (→ in how many places of `now` what was typed stands; -1 when `now` is not `was` with one same sentence swapped for it)
  const swapped = (typedOut, now, was, capitals = false) => {
    const pieces = now.split(typedOut), n = pieces.length - 1;
    if (!n) return now === was ? 0 : -1;
    const size = (was.length - pieces.reduce((sum, p) => sum + p.length, 0)) / n;
    if (!Number.isInteger(size) || size < 0) return -1;
    const again = pieces.join(was.substr(pieces[0].length, size));
    return again === was || (capitals && again.toLowerCase() === was.toLowerCase()) ? n : -1;
  };
  // ("a place", that one message also writes with a capital, at the head of a sentence)
  const CAPITALS = new Set(['ownerRefund.aPlace']);
  for (const f of forms) for (const id of f.used) {
    const field = MAILS[f.kind].fields[id], needs = (field.needs || []).map((n) => ` {${n}}`).join(''), said = (field.needs || []).map((n) => ` ${NEEDED[n]}`).join('');
    const typed = `«${f.kind}.${id}»${needs}`, out = `«${f.kind}.${id}»${said}`;
    if (!checkWords(f.kind, id, typed).ok) { moved.push(`${f.kind}.${id}: ${checkWords(f.kind, id, typed).why}`); continue; }
    const made = buildMail(f.kind, f.args, { [id]: typed });
    const caps = CAPITALS.has(`${f.kind}.${id}`), n = [swapped(out, made.subject, f.made.subject, caps), swapped(out, made.text, f.made.text, caps), swapped(esc(out), made.html, f.made.html, caps)];
    typedCount++;
    if (n.includes(-1)) moved.push(`${f.kind}/${f.form}.${id} ${n}`);
    if (!n.some((k) => k > 0)) unseen.push(`${f.kind}/${f.form}.${id}`);
    if (field.only === 'text' && n[2] !== 0) moved.push(`${f.kind}.${id} is in the HTML`);
    if (field.only === 'html' && n[1] !== 0) moved.push(`${f.kind}.${id} is in the text`);
    // …and typed with markup: none of it is markup in the message
    const sly = `<i>«${id}»</i> <img src=x onerror=alert(1)> & "q" 'a'${needs}`, slyOut = `<i>«${id}»</i> <img src=x onerror=alert(1)> & "q" 'a'${said}`, bad = buildMail(f.kind, f.args, { [id]: sly });
    if (/<i>«|<img|onerror=alert\(1\)>/.test(bad.html) || (!bad.html.includes(esc(slyOut)) && !bad.text.includes(slyOut) && !bad.subject.includes(slyOut))) raw.push(`${f.kind}/${f.form}.${id}`);
  }
  check(`the words: a sentence typed in the place of one changes that sentence and nothing else — in the subject, the plain text and the HTML, wherever it shows (${typedCount} sentences, each in each case that has it)`, typedCount > 350 && !moved.length && !unseen.length, [moved.slice(0, 6), unseen.slice(0, 6)]);
  check('the words: what is typed is text, never markup — tags, quotes and ampersands typed in any sentence of any message leave escaped in its HTML, as they are in its plain text', !raw.length, raw.slice(0, 8));

  // a sentence that cannot be used is not used: the message leaves as the table writes it
  const broken = [];
  for (const f of forms) for (const id of f.used) {
    for (const typed of ['Hello {nobody} «x»', 'Hello {name «x»', 'Hello } «x»', '{} «x»', 'x'.repeat(1501)]) {
      const made = buildMail(f.kind, f.args, { [id]: typed });
      if (made.subject !== f.made.subject || made.text !== f.made.text || made.html !== f.made.html) broken.push(`${f.kind}/${f.form}.${id} ← ${typed.slice(0, 20)}`);
    }
    const field = MAILS[f.kind].fields[id];
    if (field.must || field.needs) {
      const made = buildMail(f.kind, f.args, { [id]: field.must ? '   ' : 'no placeholder here' });
      if (made.subject !== f.made.subject || made.text !== f.made.text || made.html !== f.made.html) broken.push(`${f.kind}/${f.form}.${id} emptied`);
    }
  }
  const why = [checkWords('welcome', 'intro', 'Hello {nam}'), checkWords('welcome', 'intro', 'Hello {name'), checkWords('welcome', 'subject', ''), checkWords('code', 'codeLine', 'Your code is on its way'), checkWords('invite', 'linkLine', 'Click!'), checkWords('code', 'subject', 'Your code: {code}'), checkWords('invite', 'subject', '{link}'), checkWords('welcome', 'nothing', 'x'), checkWords('nothing', 'subject', 'x'), checkWords('welcome', 'intro', 42)];
  check('the words: a broken placeholder breaks no message — a placeholder that does not exist, a { left open, a line the message cannot do without emptied, the line of the code without its code: the sentence of the table is sent in its place, and the owner is told why',
    !broken.length && why.every((c) => c.ok === false && typeof c.why === 'string' && c.why.length > 10) && /\{nam\}/.test(why[0].why) && /\{code\}/.test(why[3].why) && /\{link\}/.test(why[4].why), [broken.slice(0, 6), why.map((c) => c.ok)]);

  const base = buildMail('welcome', [SITE, 'Ada']);
  const gone = buildMail('welcome', [SITE, 'Ada'], { intro: '', keep2: '', bye: '' }), lines = buildMail('welcome', [SITE, 'Ada'], { intro: 'First line\nSecond line', subject: 'Hello\n{name}\t!' });
  const opt = [buildMail('sponsor', [SITE, 'Ada', { place: 'the tarp', cents: 500 }], { got: '[Atomic Oasis] {place}[ for {price}][ — {name}]' }).text.split('\n\n')[1], buildMail('sponsor', [SITE, '', { place: 'the tarp' }], { got: '[Atomic Oasis] {place}[ for {price}][ — {name}]' }).text.split('\n\n')[1]];
  check('the words: a sentence emptied is left out of the message (no empty paragraph stays); a new line typed is a new line; a subject is one line; words between [brackets] go when what they name is not known — brackets round plain words are brackets',
    !gone.text.includes('The fair is still standing') && !gone.text.includes('animals of light') && !gone.text.includes('See you at the fair') && !/\n\n\n/.test(gone.text) && !/<p[^>]*><\/p>/.test(gone.html) && (gone.html.match(/&#10022;/g) || []).length === 3 && (base.html.match(/&#10022;/g) || []).length === 4
    && lines.text.includes('First line\nSecond line') && lines.html.includes('First line<br>Second line') && lines.subject === 'Hello Ada !'
    && opt[0] === '[Atomic Oasis] the tarp for $5 — Ada' && opt[1] === '[Atomic Oasis] the tarp', [lines.subject, opt]);
}

// -------------------------------------------------------------------------------------------------- the door
// (a store in memory, a mailer that writes down what it is handed — and refuses one address)
function world({ pages = true, mailer = true } = {}) {
  const kept = new Map(), sent = [], waits = [], clock = { t: Date.UTC(2026, 10, 28, 9) }, asked = [];
  const store = {
    get: async (k) => (kept.has(k) ? structuredClone(kept.get(k)) : undefined), put: async (k, v) => { kept.set(k, structuredClone(v)); }, delete: async (k) => { kept.delete(k); },
    list: async (prefix = '', { after = '', limit = 0 } = {}) => {
      const all = [...kept].filter(([k]) => k.startsWith(prefix));
      if (!pages) { asked.push(all.length); return structuredClone(all); } // (a store that only knows the beginning of a key: everything, every time)
      const some = all.filter(([k]) => !after || k > after).sort(([a], [b]) => (a < b ? -1 : 1)).slice(0, limit || Infinity);
      asked.push(some.length);
      return structuredClone(some);
    },
  };
  const ctx = { store, limiter: new Limiter(), now: () => clock.t, secret: async () => 'a-secret', flags: {}, later: (p) => waits.push(p),
    ...(mailer && { mail: async (m) => { if (m.to === 'refused@example.org') throw new Error('Cloudflare e-mail: 10102 no sending to refused@example.org'); sent.push(m); } }) };
  let from = 0;
  const call = (target, { method = 'GET', body = null, owner = true, admin = false } = {}) => {
    const [pathname, query = ''] = target.split('?');
    return route({ method, path: pathname, query: new URLSearchParams(query), body, client: `10.9.0.${(from = (from % 250) + 1)}`, admin: owner, bearer: admin ? 'adm_somebody' : '', site: SITE }, ctx);
  };
  return { kept, sent, waits, clock, ctx, call, asked };
}
const account = (name, more = {}) => ({ name, salt: 's', created: Date.UTC(2026, 10, 1), devices: [], items: [], visit: null, ...more });

{
  const w = world(), { kept, sent, ctx, call } = w;
  kept.set('acct:ada', account('Ada', { hash: 'h', email: 'ada@example.org' }));
  kept.set('acct:bob', account('Bob', { hash: 'h' }));
  kept.set('notify', { email: 'owner@example.org', site: SITE });
  await call('/api/status'); // (any request puts the door in front of the mailer)
  const post = (body, who) => call('/api/mails', { method: 'POST', body, ...who });
  const log = async () => (await call('/api/mails')).body.log;

  await ctx.mail({ to: 'ada@example.org', ...mail.welcomeMail(SITE, 'Ada') });
  const plain = mail.welcomeMail(SITE, 'Ada');
  check('the door: a message is handed to the mailer as its builder wrote it — to, subject, text, HTML, and nothing else — and noted on the list of what left',
    sent.length === 1 && Object.keys(sent[0]).sort().join() === 'html,subject,text,to' && sent[0].subject === plain.subject && sent[0].text === plain.text && sent[0].html === plain.html
    && (await log())[0]?.state === 'sent' && (await log())[0].kind === 'welcome' && (await log())[0].whom.account === 'Ada' && (await log())[0].whom.email === 'ada@example.org', [Object.keys(sent[0] || {}), (await log())[0]]);

  // a kind switched off
  const off = await post({ kind: 'welcome', off: true });
  mailLater(ctx, { to: 'ada@example.org', ...mail.welcomeMail(SITE, 'Ada') });
  await Promise.all(w.waits);
  await ctx.mail({ to: 'ada@example.org', ...mail.passMail(SITE, 'Ada', { perks: ['Every hat'], cents: 1900 }) });
  const offLog = await log(), shownOff = (await call('/api/mails')).body.kinds.find((k) => k.id === 'welcome');
  const on = await post({ kind: 'welcome', off: false });
  await ctx.mail({ to: 'ada@example.org', ...mail.welcomeMail(SITE, 'Ada') });
  check('the door: a kind switched off does not leave — the others do —, the list says it was not sent, and switched on again it leaves',
    off.status === 200 && shownOff.off === true && sent.length === 3 && /^Your Game Pass/.test(sent[1].subject) && offLog[1].state === 'off' && offLog[1].kind === 'welcome' && offLog[0].state === 'sent' && on.status === 200 && /^Welcome/.test(sent[2].subject), [off.status, sent.map((m) => m.subject), offLog.slice(0, 2)]);

  // the two that must always leave
  const lockCode = await post({ kind: 'code', off: true }), lockInvite = await post({ kind: 'invite', off: true });
  kept.set('mailset', { ...kept.get('mailset'), off: { code: true, invite: true } }); // (…and even if the store said so)
  await ctx.mail({ to: 'ada@example.org', ...mail.codeMail(SITE, 'Ada', 'AAAA-BBBB-CCCC', 30) });
  await ctx.mail({ to: 'ada@example.org', ...mail.inviteMail(SITE, 'Ada', `${SITE}/?pw=tok.en`, 7) });
  const locked = (await call('/api/mails')).body.kinds.filter((k) => k.locked);
  check('the door: the code to set a new password and the link to choose a first one cannot be switched off — the back office says why, the server refuses, and they leave whatever the store says',
    Object.keys(LOCKED).sort().join() === 'code,invite' && lockCode.status === 409 && lockInvite.status === 409 && /cannot be switched off/.test(lockCode.body.error) && sent.length === 5 && sent[3].text.includes('AAAA-BBBB-CCCC') && sent[4].text.includes('?pw=tok.en')
    && locked.map((k) => k.id).sort().join() === 'code,invite' && locked.every((k) => k.off === false && k.locked.length > 20), [lockCode.status, lockInvite.status, sent.length]);
  kept.set('mailset', { ...kept.get('mailset'), off: {} });

  // the owner's words
  const bad = await post({ kind: 'welcome', words: { subject: 'Bienvenue {name}', intro: 'Bonjour {prenom}' } });
  const nothingKept = !kept.get('mailset')?.words?.welcome;
  const saved = await post({ kind: 'welcome', words: { subject: ' Bienvenue,\n{name} ', intro: 'Bonjour {name} <b>& co</b>', keep1: null } });
  await ctx.mail({ to: 'ada@example.org', ...mail.welcomeMail(SITE, 'Ada') });
  await ctx.mail({ to: 'ada@example.org', ...mail.passMail(SITE, 'Ada', { perks: ['Every hat'], cents: 1900 }) });
  const mine = sent[5], pass = sent[6], shownMine = (await call('/api/mails')).body.kinds.find((k) => k.id === 'welcome');
  const back = await post({ kind: 'welcome', words: { subject: null, intro: plain.text.split('\n\n')[1] } });
  await ctx.mail({ to: 'ada@example.org', ...mail.welcomeMail(SITE, 'Ada') });
  check('the door: the owner\'s words go into what leaves — a subject and a paragraph changed are changed in the message, escaped in its HTML, and nothing else of it has moved; a sentence that cannot be used is refused, and nothing is kept of what came with it; "back to the original" (or the original typed again) is the original',
    bad.status === 400 && bad.body.field === 'intro' && /\{prenom\}/.test(bad.body.error) && nothingKept && saved.status === 200 && saved.body.kind.forms[0].subject === 'Bienvenue, Robin'
    && mine.subject === 'Bienvenue, Ada' && mine.text === plain.text.replace(plain.text.split('\n\n')[1], 'Bonjour Ada <b>& co</b>') && mine.html.includes('Bonjour Ada &#60;b&#62;&#38; co&#60;/b&#62;') && !mine.html.includes('<b>& co')
    && pass.text === mail.passMail(SITE, 'Ada', { perks: ['Every hat'], cents: 1900 }).text && shownMine.fields.find((f) => f.id === 'intro').typed === 'Bonjour {name} <b>& co</b>' && shownMine.fields.find((f) => f.id === 'keep1').typed === undefined
    && back.status === 200 && !kept.get('mailset').words.welcome && sent[7].subject === plain.subject && sent[7].html === plain.html, [bad.status, bad.body, saved.status, mine?.subject, back.status, kept.get('mailset')]);

  // looked at before it is kept
  const draft = await post({ preview: { kind: 'sponsorNotice', form: 'topTie', words: { hello: 'Salut[, {name}] !', topKeep: 'Oops {nope}' } } });
  const guest = await post({ preview: { kind: 'sponsorNotice', form: 'guest', words: { hello: 'Salut[, {name}] !' } } });
  const long = await post({ preview: { kind: 'welcome', form: 'welcome', words: { intro: 'é'.repeat(1400), lost: 'è'.repeat(1400), start: 'à'.repeat(1400) } } });
  check('the back office: a message is looked at with the words being typed before anything is kept — its subject, its text, its HTML, the sentences that case is made of, and which of the words typed cannot be used',
    draft.status === 200 && draft.body.text.startsWith('Salut, Robin !\n\n') && draft.body.html.includes('Salut, Robin !') && /as much as you/.test(draft.body.text) && draft.body.used.includes('topLeadTie') && !draft.body.used.includes('topLead') && Object.keys(draft.body.broken).join() === 'topKeep'
    && draft.body.text.includes('You keep your place among the five') && guest.body.text.startsWith('Salut !\n\n') && !kept.get('mailset').words.sponsorNotice && long.status === 200 && long.body.text.includes('é'.repeat(1400)), [draft.status, draft.body.broken, guest.body?.text?.slice(0, 20), long.status]);

  // "send me this one"
  const nowhere = await post({ send: { kind: 'welcome', form: 'welcome' } });
  const notMail = await post({ me: 'not an address' }), me = await post({ me: ' Me@Example.org ' });
  await post({ kind: 'sponsor', off: true });
  const before8 = sent.length, test = await post({ send: { kind: 'sponsor', form: 'wall', words: { thanks: 'Merci <3' } } });
  const got = sent[before8], testLog = (await log())[0];
  check('the back office: "send me this one" sends that case, with made-up values and the words as they are typed, to the owner\'s own address — once it is said where; its subject begins with [Test]; it leaves even while its kind is switched off, by the same door, and the list says it was a test',
    nowhere.status === 400 && notMail.status === 400 && me.status === 200 && me.body.me === 'me@example.org' && test.status === 200 && test.body.to === 'me@example.org' && sent.length === before8 + 1 && got.to === 'me@example.org' && got.subject === '[Test] Their plaque is reserved — thank you'
    && got.text.includes('Merci <3') && got.html.includes('Merci &#60;3') && /on the wall of the companions/.test(got.text) && Object.keys(got).sort().join() === 'html,subject,text,to' && testLog.test === true && testLog.state === 'sent' && testLog.whom.you === true && testLog.whom.email === 'me@example.org'
    && !kept.get('mailset').words.sponsor, [nowhere.status, notMail.status, me.body, test.status, got?.subject, testLog]);
  await post({ kind: 'sponsor', off: false });

  // a mailer that says no
  let threw = '';
  kept.set('acct:rita', account('Rita', { hash: 'h', email: 'refused@example.org' }));
  try { await ctx.mail({ to: 'refused@example.org', ...mail.codeMail(SITE, 'Rita', 'AAAA-BBBB-CCCC', 30) }); } catch (err) { threw = err.message; }
  const complain = console.error, complaints = [];
  console.error = (...said) => complaints.push(said.join(' ')); // (what the server writes in its own log, as before)
  mailLater(ctx, { to: 'refused@example.org', ...mail.welcomeMail(SITE, 'Rita') }); // (…and nobody is made to wait, nor told)
  await Promise.all(w.waits);
  console.error = complain;
  const failed = (await log()).slice(0, 2);
  check('the door: a message the mailer refuses is noted with the reason — an address in that reason is not kept — and whoever sent it hears of it as before',
    /10102/.test(threw) && complaints.length === 1 && /^\[mail\] .*10102/.test(complaints[0]) && failed.every((l) => l.state === 'failed' && /10102/.test(l.error) && !/@/.test(l.error) && l.whom.account === 'Rita' && l.whom.email === 'refused@example.org') && failed[0].kind === 'welcome' && failed[1].kind === 'code', [threw, failed]);

  // to whom: an account, a buyer without one, the owner
  await ctx.mail({ to: 'paid-with@example.net', ...mail.sponsorMail(SITE, '', { place: 'the tarp', cents: 9900, monthly: true }) });
  await ctx.mail({ to: 'paid-with@example.net', ...mail.sponsorNoticeMail(SITE, 'Bob', { kind: 'outbid', place: 'the board of Mostly Up', cents: 700, refunded: true }) }); // (Bob's account has no address: the one given at the payment)
  await ctx.mail({ to: 'owner@example.org', ...mail.ownerRefundMail(SITE, { cents: 700, place: 'the board of Mostly Up', reason: 'outbid' }) });
  await ctx.mail({ to: 'ada@example.org', subject: 'By hand', text: 'x', html: '<p>x</p>' });
  const whom = (await log()).slice(0, 4).map((l) => l.whom), written = JSON.stringify(kept.get('maillog'));
  kept.set('acct:ada', account('Ada', { hash: 'h', email: 'ada@new.example' }));
  const moved = (await log()).find((l) => l.whom.account === 'Ada')?.whom.email;
  check('the list of what left keeps no address but the owner\'s own: an account is kept by its name — and shown with the address it has now —, a buyer without an account as just that (their address is asked of Stripe for one message, and kept nowhere), and nothing of a code, a link or a subject',
    whom[3].guest === true && !whom[3].email && whom[2].account === 'Bob' && whom[2].paid === true && !whom[2].email && whom[1].you === true && whom[1].email === 'owner@example.org' && Object.keys(whom[0]).length === 0
    && !/paid-with|ada@|refused@|AAAA-BBBB|tok\.en|Bienvenue|subject/.test(written) && /owner@example\.org/.test(written) && /me@example\.org/.test(written) && moved === 'ada@new.example', [whom, written.slice(0, 300), moved]);

  // the test of the address of the new sponsors (the tab "Sponsors"), while that kind is switched off
  await post({ kind: 'ownerSale', off: true });
  const told = await call('/api/notify', { method: 'POST', body: { test: true } });
  await post({ kind: 'ownerSale', off: false });
  const toldOn = await call('/api/notify', { method: 'POST', body: { test: true } });
  check('the door: "Send a test" under Sponsors says why nothing comes while the messages about new sponsors are switched off — and sends it once they are on again',
    told.status === 502 && /switched off/.test(told.body.error) && toldOn.status === 200 && sent.at(-1).to === 'owner@example.org' && /new sponsors will be told here/.test(sent.at(-1).subject), [told.status, told.body, toldOn.status]);

  // bounded
  const many = [], had = sent.length;
  for (let i = 0; i < MAIL_LOG + 40; i++) many.push(ctx.mail({ to: 'ada@new.example', ...mail.welcomeMail(SITE, 'Ada') }));
  await Promise.all(many);
  const full = kept.get('maillog'), left = sent.length - had;
  w.clock.t += 60_000;
  await ctx.mail({ to: 'ada@new.example', ...mail.codeMail(SITE, 'Ada', 'AAAA-BBBB-CCCC', 30) });
  const after = kept.get('maillog'), shownLog = (await call('/api/mails')).body;
  check(`the list of what left is bounded: of ${MAIL_LOG + 40} messages leaving at once every one is handed to the mailer and noted (none loses its line to another), ${MAIL_LOG} are kept, and the next one pushes the oldest out`,
    MAIL_LOG === 200 && left === MAIL_LOG + 40 && full.length === MAIL_LOG && full.every((l) => l.kind === 'welcome' && l.state === 'sent') && after.length === MAIL_LOG && after.at(-1).kind === 'code' && shownLog.log.length === MAIL_LOG && shownLog.log[0].kind === 'code' && shownLog.keeps === MAIL_LOG, [left, full.length, after.length, shownLog.log.length]);

  // for the owner, and for nobody else
  const stranger = [await call('/api/mails', { owner: false }), await call('/api/mails', { owner: false, method: 'POST', body: { kind: 'welcome', off: true } }), await call('/api/people', { owner: false })];
  kept.set('admins', { abc: { hash: 'never-this', name: 'Somebody', by: 'owner', at: 1 } });
  const named = [await call('/api/mails', { owner: false, admin: true }), await call('/api/people', { owner: false, admin: true })];
  check('the owner\'s alone: without the owner\'s key neither the e-mails nor the accounts are shown, and nothing is changed', [...stranger, ...named].every((r) => r.status === 403 && !r.body.kinds && !r.body.accounts) && !kept.get('mailset').off.welcome, [...stranger, ...named].map((r) => r.status));

  const silent = world({ mailer: false });
  const none = await silent.call('/api/mails'), cannot = await silent.call('/api/mails', { method: 'POST', body: { send: { kind: 'welcome', form: 'welcome' } } }), look = await silent.call('/api/mails', { method: 'POST', body: { preview: { kind: 'welcome', form: 'welcome' } } });
  check('the back office: on a server that sends no e-mail the messages can still be read and their words changed — it says that none leaves, and sends no test', none.status === 200 && none.body.mail === false && none.body.kinds.length === 8 && cannot.status === 501 && look.status === 200 && look.body.html.includes('Welcome, Robin!'), [none.status, none.body.mail, cannot.status, look.status]);
}

// ----------------------------------------------------------------------------- the accounts, a few hundred at a time
{
  const fill = (w, n) => { for (let i = 0; i < n; i++) w.kept.set(`acct:player ${String(i).padStart(4, '0')}`, account(`Player ${String(i).padStart(4, '0')}`, { created: Date.UTC(2026, 0, 1) + i * 60_000, ...(i % 3 === 0 ? { hash: 'h' } : i % 3 === 1 ? { hash: 'h', email: `p${i}@example.org` } : { google: `g${i}`, email: `p${i}@gmail.example` }), devices: [`dev${String(i).padStart(5, '0')}-xxxxxxxxxxxx`] })); };
  const paged = world(), whole = world({ pages: false }), exact = world({ pages: false });
  fill(paged, 1203); fill(whole, 1203); fill(exact, 500);
  for (const w of [paged, whole, exact]) w.kept.set('other:record', { name: 'Not an account' });
  const a = await paged.call('/api/people?size=200&page=7'), b = await whole.call('/api/people?size=200&page=7'), c = await exact.call('/api/people?size=3');
  const first = await paged.call('/api/people?size=5');
  check('the accounts are read a few hundred at a time — never all the records at once — on a store that pages; a store that only knows the beginning of a key gives the same list, each account once',
    a.status === 200 && a.body.total === 1203 && a.body.pages === 7 && a.body.accounts.length === 3 && paged.asked.length === 3 && Math.max(...paged.asked) === 500 && JSON.stringify(a.body.accounts) === JSON.stringify(b.body.accounts) && b.body.total === 1203 && c.body.total === 500
    && first.body.accounts.map((r) => r.name).join() === 'Player 1202,Player 1201,Player 1200,Player 1199,Player 1198' && JSON.stringify(a.body.counts) === JSON.stringify({ all: 1203, email: 802, password: 401, google: 401, waiting: 0 }), [a.body.total, a.body.pages, paged.asked, b.body.total, c.body.total, a.body.counts]);

  // what was read is used for half a minute (a page turned, a letter typed), then read again — or at once when asked
  const reads = paged.asked.length;
  await paged.call('/api/people?size=5&page=2'); await paged.call('/api/people?q=player%200007');
  const still = paged.asked.length;
  paged.kept.set('acct:zed', account('Zed', { hash: 'h', created: paged.clock.t }));
  const stale = await paged.call('/api/people?q=zed'), fresh = await paged.call('/api/people?q=zed&fresh=1');
  paged.kept.set('acct:yan', account('Yan', { hash: 'h', created: paged.clock.t + 1 }));
  paged.clock.t += 31_000;
  const later = await paged.call('/api/people?q=yan');
  check('the list: turning a page or typing in the box does not read the accounts again; they are read again when asked, and after half a minute', still === reads && stale.body.matched === 0 && fresh.body.matched === 1 && fresh.body.total === 1204 && later.body.matched === 1, [reads, still, stale.body.matched, fresh.body.matched, later.body.matched]);
}

// ------------------------------------------------------------------------------- on the game's own server (Node)
const ADMIN_KEY = 'people-test-owner-key', NAMED = 'adm_people-test-a-named-administrator';
const hashOf = (key) => crypto.createHash('sha256').update(key).digest('base64url');
const storeFile = path.join(os.tmpdir(), `mmf-people-test-${process.pid}.json`), mailFile = path.join(os.tmpdir(), `mmf-people-test-${process.pid}.mails`);
fs.rmSync(storeFile, { force: true }); fs.rmSync(mailFile, { force: true });
const T0 = Date.now() - 40 * 86_400_000, today = Math.floor(Date.now() / 86_400_000);
// thirty-three accounts of every sort, made one hour apart: #0 the oldest
const seeded = {};
const SORTS = [
  (i) => ({ hash: 'h' }), // a name and a password
  (i) => ({ hash: 'h', email: `player${i}@example.org` }), // …with an address
  (i) => ({ google: `10000000000000000${String(i).padStart(4, '0')}`, email: `player${i}@gmail.example` }), // Google
  (i) => ({ email: `player${i}@example.net`, invite: { n: 'x', until: Date.now() + 86_400_000 }, mailed: [Date.now()] }), // a name and an address: no password yet
  (i) => ({ hash: 'h', google: `20000000000000000${String(i).padStart(4, '0')}`, email: `player${i}@both.example` }), // both
  (i) => ({ google: `30000000000000000${String(i).padStart(4, '0')}` }), // Google, on a server that kept no address
];
for (let i = 0; i < 33; i++) {
  const name = `Player ${String(i).padStart(2, '0')}`;
  seeded[`acct:${name.toLowerCase()}`] = { name, salt: 's', created: T0 + i * 3600_000, devices: Array.from({ length: (i % 3) + 1 }, (_, d) => `seed${String(i).padStart(4, '0')}-browser-${d}-xxxx`), items: ['hat:crown', 'paint:gold', 'trail:stars'].slice(0, i % 4), visit: i % 5 === 4 ? null : { day: today - (i % 7), days: (i % 6) + 1, best: (i % 6) + 4 },
    ...(i === 7 && { pass: { sub: 'sub_x', customer: 'cus_x', since: T0 } }), ...(i === 8 && { pass: { gift: true, until: Date.now() + 86_400_000 } }), ...(i === 9 && { pass: { gift: true, until: Date.now() - 1000 } }), ...SORTS[i % SORTS.length](i) };
}
seeded['visitors:recent'] = [
  { at: Date.now() - 5 * 3600_000, dev: 'seed0003', name: 'Player 03', cc: 'FR', city: 'Paris', region: 'Île-de-France', n: 2 },
  { at: Date.now() - 3 * 3600_000, dev: 'guest-aa', name: 'Momo', cc: 'BE', city: 'Liège', region: '', n: 4 },
  { at: Date.now() - 2 * 3600_000, dev: 'guest-bb', name: 'Visitor 42', cc: '', city: '', region: '', n: 1 },
  { at: Date.now() - 1 * 3600_000, dev: 'seed0010', name: 'Player 10', cc: 'CA', city: 'Montréal', region: 'Quebec', n: 1 },
];
seeded['stats:all'] = { since: T0, people: 512, money: 0, passes: 0, sales: 0, keys: 0, metres: 0, secs: 0, moving: 0, blasts: 0, colors: [], kind: {}, os: {}, from: {}, cc: {}, weeks: {}, months: {} };
seeded.admins = { [hashOf(NAMED).slice(0, 12)]: { hash: hashOf(NAMED), name: 'Named', by: 'Owner', at: T0 } };
fs.writeFileSync(storeFile, JSON.stringify(seeded));
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const port = await freePort(), HERE = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', SCORES_FILE: storeFile, MAIL_FILE: mailFile, ADMIN_KEY, ALLOWED_ORIGINS: '', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
server.stdout.on('data', (d) => { output += d; });
server.stderr.on('data', (d) => { output += d; });
try {
  for (let i = 0; i < 200; i++) { try { if ((await request(port, '/healthz')).status === 200) break; } catch { /* not up yet */ } await sleep(50); }
  let from = 0;
  const ask = async (target, { method = 'GET', body, key = ADMIN_KEY } = {}) => {
    const res = await request(port, target, { method, headers: { 'x-forwarded-for': `10.8.0.${(from = (from % 250) + 1)}`, ...(key && { authorization: `Bearer ${encodeURIComponent(key)}` }), ...(body && { 'content-type': 'application/json', origin: HERE }) }, ...(body && { body: JSON.stringify(body) }) });
    let json = null;
    try { json = JSON.parse(res.body.toString()); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, text: res.body.toString(), body: json };
  };
  const outbox = () => (fs.existsSync(mailFile) ? fs.readFileSync(mailFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const device = (n) => `people-test-${n}-`.padEnd(24, 'x');

  // ---- People
  const nobody = await ask('/api/people', { key: '' }), wrong = await ask('/api/people', { key: 'not-the-key' }), named = await ask('/api/people', { key: NAMED }), isAdmin = await ask('/api/admin', { key: NAMED });
  check('People: for the owner alone — a stranger, a wrong key, and an administrator the owner has named (who opens the rest of the back office) are refused, and shown nothing',
    nobody.status === 403 && wrong.status === 403 && named.status === 403 && isAdmin.status === 200 && isAdmin.body.owner === false && [nobody, wrong, named].every((r) => !/example\.(org|net)|Player/.test(r.text)), [nobody.status, wrong.status, named.status, isAdmin.status]);

  const all = await ask('/api/people');
  const player = (n) => all.body.accounts.find((r) => r.name === `Player ${String(n).padStart(2, '0')}`);
  const p10 = player(10), p7 = player(7), p8 = player(8), p9 = player(9), p28 = player(28), p3 = player(3), p1 = player(1), p19 = player(19);
  check('People: every account, the newest first — its name, how it signs in, its address in full, when it was made and last came, its days in a row, what it owns and the Game Pass, how many browsers — and how many of each sort',
    all.status === 200 && all.body.total === 33 && all.body.accounts.length === 33 && all.body.accounts[0].name === 'Player 32' && all.body.accounts[32].name === 'Player 00' && all.body.accounts.every((r, i, list) => !i || list[i - 1].created > r.created)
    && JSON.stringify(all.body.counts) === JSON.stringify({ all: 33, email: 22, password: 6, google: 16, waiting: 5 })
    && p10.how === 'both' && p10.email === 'player10@both.example' && p10.created === T0 + 10 * 3600_000 && p10.devices === 2 && p10.items === 2 && p3.how === 'email' && p3.email === 'player3@example.net'
    // (their days in a row: as they stood when they last came — yesterday: two, and five at the best; three days ago: the run is over; never came back: none)
    && p1.how === 'password' && p1.email === 'player1@example.org' && p1.days === 2 && p1.best === 5 && p1.last === (today - 1) * 86_400_000 && p3.days === 0 && p3.best === 7 && p3.last === (today - 3) * 86_400_000 && p19.days === 0 && p19.best === 0 && p19.last === p19.created
    && p7.pass === 'paid' && p8.pass === 'gift' && p9.pass === '' && p28.how === 'both' && player(5).how === 'google' && player(5).email === ''
    && !/"hash"|"salt"|"google":"|seed0003-browser/.test(all.text), [all.status, all.body?.counts, p10, p3, p1, p19]);

  const withMail = await ask('/api/people?filter=email'), pwOnly = await ask('/api/people?filter=password'), goog = await ask('/api/people?filter=google'), junk = await ask('/api/people?filter=everything');
  check('People: the filters — with an e-mail; a name and a password, nothing else; Google — and their counts are those of the top of the page',
    withMail.body.matched === 22 && withMail.body.accounts.every((r) => r.email) && pwOnly.body.matched === 6 && pwOnly.body.accounts.every((r) => r.how === 'password' && !r.email) && goog.body.matched === 16 && goog.body.accounts.every((r) => r.how === 'google' || r.how === 'both') && junk.body.filter === 'all' && junk.body.matched === 33
    && withMail.body.counts.email === 22 && goog.body.counts.google === 16, [withMail.body.matched, pwOnly.body.matched, goog.body.matched, junk.body.filter]);

  const byName = await ask('/api/people?q=PLAYER%201'), byMail = await ask('/api/people?q=%40gmail.example'), byBoth = await ask('/api/people?filter=google&q=both.example'), none = await ask('/api/people?q=nobody-at-all');
  check('People: looked for by a piece of a name or of an address, whatever its capitals — within the filter chosen',
    byName.body.matched === 10 && byName.body.accounts.every((r) => /^Player 1\d$/.test(r.name)) && byMail.body.matched === 6 && byMail.body.accounts.every((r) => r.email.endsWith('@gmail.example')) && byBoth.body.matched === 5 && none.body.matched === 0 && none.body.accounts.length === 0 && none.body.total === 33, [byName.body.matched, byMail.body.matched, byBoth.body.matched, none.body.matched]);

  const pages = [await ask('/api/people?size=10'), await ask('/api/people?size=10&page=2'), await ask('/api/people?size=10&page=3'), await ask('/api/people?size=10&page=4'), await ask('/api/people?size=10&page=99'), await ask('/api/people?size=100000')];
  const seen = pages.slice(0, 4).flatMap((p) => p.body.accounts.map((r) => r.name));
  check('People: by pages — ten at a time, four pages for thirty-three, each account once and in order; a page past the last is the last; a page is two hundred accounts at the most',
    pages[0].body.pages === 4 && pages.slice(0, 3).every((p) => p.body.accounts.length === 10) && pages[3].body.accounts.length === 3 && new Set(seen).size === 33 && seen.join() === all.body.accounts.map((r) => r.name).join() && pages[4].body.page === 4 && pages[4].body.accounts.length === 3 && pages[5].body.size === 200, [pages.map((p) => [p.body.page, p.body.pages, p.body.accounts.length])]);

  const csv = await ask('/api/people?format=csv&filter=email&q=player%201'), rows = csv.text.slice(1).trim().split('\r\n'), whole = await ask('/api/people?format=csv');
  const stamp = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  check('People: the table for a spreadsheet — what the filter and the box show, every page of it: name, e-mail, how they sign in, made, last seen; a file to download, for the owner alone',
    csv.status === 200 && /^text\/csv/.test(csv.headers['content-type']) && /attachment; filename="atomic-oasis-accounts-\d{4}-\d\d-\d\d\.csv"/.test(csv.headers['content-disposition']) && csv.headers['cache-control'] === 'no-store' && csv.text.charCodeAt(0) === 0xfeff
    && rows[0] === 'name,e-mail,signs in with,made (UTC),last seen (UTC)' && rows.length === 1 + 6 && rows[1] === `Player 19,player19@example.org,password,${stamp(T0 + 19 * 3600_000)},${stamp(T0 + 19 * 3600_000).slice(0, 10)}`
    && rows[2] === `Player 16,player16@both.example,password and Google,${stamp(T0 + 16 * 3600_000)},${new Date((today - 2) * 86_400_000).toISOString().slice(0, 10)}`
    && rows.some((r) => r.startsWith('Player 15,player15@example.net,link by e-mail (no password yet),')) && rows.some((r) => r.startsWith('Player 14,player14@gmail.example,Google,'))
    && whole.text.trim().split('\r\n').length === 34 && (await ask('/api/people?format=csv', { key: NAMED })).status === 403 && (await ask('/api/people?format=csv', { key: '' })).status === 403
    && peopleCsv([{ name: 'A "quoted", name', email: '=cmd@x.org', how: 'password', created: 0, last: 0 }]).includes('"A ""quoted"", name",\'=cmd@x.org,password,,'), [csv.status, csv.headers['content-type'], csv.headers['content-disposition'], rows.slice(0, 3)]);

  const emails = await ask('/api/people?format=emails&filter=google');
  check('People: the addresses of those shown, to copy — every page of them, and only theirs', emails.status === 200 && emails.body.emails.length === 11 && emails.body.emails.every((e) => /@(gmail|both)\.example$/.test(e)) && (await ask('/api/people?format=emails', { key: NAMED })).status === 403, [emails.status, emails.body?.emails?.length]);

  const guests = all.body.guests;
  check('People: of who never made an account, what the fair keeps and no more — among the last visits it remembers, those of browsers signed in to no account: when, the name the robot wore, where from; never an address, never the browser',
    guests.keeps === 300 && guests.kept === 4 && guests.signed === 2 && guests.people === 512 && guests.visits.length === 2 && guests.visits[0].name === 'Visitor 42' && guests.visits[1].name === 'Momo' && guests.visits[1].cc === 'BE' && guests.visits[1].city === 'Liège' && guests.visits[1].n === 4
    && Object.keys(guests.visits[0]).sort().join() === 'at,cc,city,n,name' && !/guest-aa|guest-bb/.test(all.text), guests);

  // an account made in the game shows on the list (read again when asked)
  const joined = await ask('/api/account', { method: 'POST', key: '', body: { action: 'join', device: device(1), name: 'Nina', email: 'nina@example.org' } });
  const made = await ask('/api/account', { method: 'POST', key: '', body: { action: 'create', device: device(2), name: 'Omar', password: 'a-long-password' } });
  const again = await ask('/api/people?fresh=1&size=2');
  check('People: an account made in the game is on the list the next time it is read — a name and an address: "no password yet"; a name and a password: just that',
    joined.status === 200 && made.status === 200 && again.body.total === 35 && again.body.accounts[0].name === 'Omar' && again.body.accounts[0].how === 'password' && again.body.accounts[0].email === '' && again.body.accounts[1].name === 'Nina' && again.body.accounts[1].how === 'email' && again.body.accounts[1].email === 'nina@example.org' && again.body.accounts[1].devices === 1 && again.body.counts.waiting === 6, [joined.status, made.status, again.body?.accounts]);
  const beforeLook = fs.readFileSync(storeFile, 'utf8');
  await ask('/api/people?fresh=1'); await ask('/api/people?format=csv'); await ask('/api/people?format=emails');
  check('People: looking changes nothing — the store is as it was', fs.readFileSync(storeFile, 'utf8') === beforeLook);

  // ---- E-mails
  const refused = [await ask('/api/mails', { key: '' }), await ask('/api/mails', { key: NAMED }), await ask('/api/mails', { key: NAMED, method: 'POST', body: { kind: 'welcome', off: true } }), await ask('/api/mails', { key: '', method: 'POST', body: { send: { kind: 'welcome' } } })];
  const mails = await ask('/api/mails');
  await until(() => outbox().some((m) => m.to === 'nina@example.org'));
  const invite = outbox().find((m) => m.to === 'nina@example.org');
  check('E-mails: for the owner alone — the eight kinds of message, each with what it is, when it leaves and to whom, its sentences and their placeholders, its cases; the two that are always sent say why; the link mailed to Nina is on the list of what left',
    refused.every((r) => r.status === 403 && !r.body?.kinds) && mails.status === 200 && mails.body.mail === true && mails.body.kinds.length === 8 && mails.body.kinds.every((k) => k.name && k.when && k.to && k.fields.length >= 7 && k.forms.length >= 1 && k.forms.every((f) => f.subject && f.fields.length >= 5) && Object.keys(k.vars).length >= 1)
    && mails.body.kinds.filter((k) => k.locked).map((k) => k.id).sort().join() === 'code,invite' && mails.body.kinds.find((k) => k.id === 'code').fields.find((f) => f.id === 'codeLine').own.code && mails.body.kinds.find((k) => k.id === 'welcome').fields.find((f) => f.id === 'lost').original.includes('“Forgot the password”')
    && !!invite && Object.keys(invite).sort().join() === 'at,html,subject,text,to' && mails.body.log[0].kind === 'invite' && mails.body.log[0].state === 'sent' && mails.body.log[0].whom.account === 'Nina' && mails.body.log[0].whom.email === 'nina@example.org', [refused.map((r) => r.status), mails.status, mails.body?.log?.[0]]);

  // switched off: an account made with an address gets no welcome; the link to choose a password still leaves
  const off = await ask('/api/mails', { method: 'POST', body: { kind: 'welcome', off: true } });
  const pia = await ask('/api/account', { method: 'POST', key: '', body: { action: 'create', device: device(3), name: 'Pia', password: 'a-long-password', email: 'pia@example.org' } });
  const quin = await ask('/api/account', { method: 'POST', key: '', body: { action: 'join', device: device(4), name: 'Quin', email: 'quin@example.org' } });
  await until(() => outbox().some((m) => m.to === 'quin@example.org'));
  await sleep(150);
  const offLog = (await ask('/api/mails')).body.log;
  check('E-mails: the welcome switched off — an account made with an address is made, gets no welcome, and the list says it was not sent; the link to choose a first password leaves all the same',
    off.status === 200 && pia.status === 200 && quin.status === 200 && !outbox().some((m) => m.to === 'pia@example.org') && outbox().filter((m) => m.to === 'quin@example.org' && /choose your password/.test(m.subject)).length === 1
    && offLog.find((l) => l.whom.account === 'Pia')?.state === 'off' && offLog.find((l) => l.whom.account === 'Quin')?.state === 'sent' && (await ask('/api/mails', { method: 'POST', body: { kind: 'invite', off: true } })).status === 409, [off.status, pia.status, outbox().map((m) => m.to), offLog.slice(0, 2)]);

  // on again, in the owner's words
  await ask('/api/mails', { method: 'POST', body: { kind: 'welcome', off: false } });
  const words = await ask('/api/mails', { method: 'POST', body: { kind: 'welcome', words: { subject: 'Bienvenue à Atomic Oasis, {name}', title: 'Bienvenue, {name} !', intro: 'Votre compte est fait. <La fête> continue & les compteurs Geiger restent polis.' } } });
  const rose = await ask('/api/account', { method: 'POST', key: '', body: { action: 'create', device: device(5), name: 'Rose', password: 'a-long-password', email: 'rose@example.org' } });
  await until(() => outbox().some((m) => m.to === 'rose@example.org'));
  const welcome = outbox().find((m) => m.to === 'rose@example.org'), usual = mail.welcomeMail(HERE, 'Rose');
  check('E-mails: the owner\'s words leave in the next welcome — its subject, its title and its first paragraph are those typed (escaped in the HTML), and the rest of the message is as it always was',
    words.status === 200 && rose.status === 200 && welcome?.subject === 'Bienvenue à Atomic Oasis, Rose' && welcome.text.startsWith('Bienvenue, Rose !\n\nVotre compte est fait. <La fête> continue & les compteurs Geiger restent polis.\n\nWhat your account keeps for you:')
    && welcome.html.includes('>Bienvenue, Rose !</h1>') && welcome.html.includes('Votre compte est fait. &#60;La fête&#62; continue &#38; les compteurs Geiger restent polis.') && !welcome.html.includes('<La fête>')
    && welcome.text.split('\n\n').slice(2).join('\n\n') === usual.text.split('\n\n').slice(2).join('\n\n') && welcome.html.split('What your account keeps for you')[1] === usual.html.split('What your account keeps for you')[1], [words.status, welcome?.subject, welcome?.text.slice(0, 120)]);

  // "send me this one", from the page
  const meSaved = await ask('/api/mails', { method: 'POST', body: { me: 'boss@example.org' } });
  const test = await ask('/api/mails', { method: 'POST', body: { send: { kind: 'ownerRefund', form: 'failed' } } });
  const tested = outbox().find((m) => m.to === 'boss@example.org');
  check('E-mails: "send me this one" — a refund Stripe refused, with made-up values, comes to the address the owner gave, its subject marked [Test]; the address is kept for the next time',
    meSaved.status === 200 && test.status === 200 && test.body.to === 'boss@example.org' && tested?.subject === '[Test] A refund failed — the board of Mostly Up' && /too old to be refunded/.test(tested.text) && (await ask('/api/mails')).body.me === 'boss@example.org' && test.body.log[0].test === true, [meSaved.status, test.status, tested?.subject]);

  const kept = fs.readFileSync(storeFile, 'utf8'), logKept = JSON.stringify(JSON.parse(kept).maillog);
  check('E-mails: what is kept — the owner\'s words, which kinds are off, the owner\'s own address; and a list of what left that holds no address of anybody else, no link and no code',
    /"mailset"/.test(kept) && /Bienvenue à Atomic Oasis/.test(kept) && /boss@example\.org/.test(logKept) && !/nina@|pia@|quin@|rose@|\?pw=/.test(logKept) && JSON.parse(kept).maillog.length === 5, logKept.slice(0, 400));
} catch (err) {
  check('the checks ran to the end', false, String(err?.stack || err).slice(0, 600));
} finally {
  server.kill();
  fs.rmSync(storeFile, { force: true }); fs.rmSync(mailFile, { force: true }); fs.rmSync(`${storeFile}.tmp`, { force: true });
}
const failed = results.filter((r) => !r).length;
if (failed && output) console.log(`server output:\n${output.slice(-1500)}`);
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
