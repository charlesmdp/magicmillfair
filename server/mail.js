// E-mails. The game sends very few of them, and only to whoever gave an address: a welcome when an account is
// made with one (welcomeMail), a link to choose a first password (inviteMail), a word of thanks when the Game Pass
// is taken or a place sponsored (passMail, sponsorMail), a word when something happens to what a sponsor paid for
// (sponsorNoticeMail), a code to set a new password (codeMail) — and, to the owner, a line for each sale and each
// refund (ownerSaleMail, ownerRefundMail). No newsletter, no tracking: no picture is fetched from anywhere, no link
// is counted — the look of the fair is drawn in the message itself. How a message leaves is the business of the
// host — it hands the API a function, ctx.mail({ to, subject, text, html }) — and where there is none no
// e-mail is ever sent, and nobody is asked for an address.
//
// The words of the messages are a table (MAILS, below): each sentence of each message is a line of it — its
// subject, its title, each paragraph, the label of its button, its signature — and the builders only put them in
// their place. The owner can change any of them in the back office (the tab "E-mails": server/mails.js keeps what
// was typed, and puts it in the place of the line of the table); what is typed there is text, never markup.
// Every message leaves by one door (mails.js: its switch, its words, the list of what left): a builder says which
// kind it made and with what ({ kind, args, form } next to { subject, text, html }), so that the door can tell.
//
//   Through Cloudflare's Email Service, on either host, with three secrets and nothing else to set up:
//     MAIL_FROM                 an address of a domain that was onboarded to Email Service (hello@your-domain)
//     CLOUDFLARE_ACCOUNT_ID     the account that domain belongs to (32 characters)
//     CLOUDFLARE_EMAIL_TOKEN    an API token of that account with the permission "Email Sending: Edit"
//   (restMailer below: their REST API. See the README: "E-mails".)
//   Cloudflare (cloudflare/worker.js) can also use a `send_email` binding named EMAIL, with MAIL_FROM.
//   Node (server/index.js): with MAIL_FILE set, each message is written to that file as a line of JSON
//   instead of being sent: to try things out, and for the tests.

/** An address someone typed, in lower case; '' when it does not look like one. */
export function cleanEmail(text) {
  const t = String(text ?? '').trim().toLowerCase();
  return t.length <= 120 && /^[a-z0-9._%+-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(t) && !t.includes('..') ? t : '';
}

/**
 * How to send an e-mail through Cloudflare's REST API — async ({ to, subject, text, html }) → void, throwing
 * when Cloudflare says no — or null when the three secrets are not all there. `env`: the variables of the host.
 */
export function restMailer(env = {}, fetcher = fetch) {
  const from = cleanEmail(env.MAIL_FROM), account = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim(), token = String(env.CLOUDFLARE_EMAIL_TOKEN || '').trim();
  if (!from || !/^[0-9a-f]{32}$/i.test(account) || token.length < 20 || /\s/.test(token)) return null;
  const api = String(env.CLOUDFLARE_API || 'https://api.cloudflare.com').replace(/\/+$/, '');
  return async ({ to, subject, text, html }) => {
    const res = await fetcher(`${api}/client/v4/accounts/${account}/email/sending/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, text, html }),
    });
    if (res.ok) return;
    // (Cloudflare's own reason, with its number: 10101 a token it does not know, 10102 a token without the
    // permission to send, 10105 an account whose plan does not send)
    const said = (await res.json().catch(() => null))?.errors?.[0];
    throw new Error(`Cloudflare e-mail: ${said ? `${said.code ?? ''} ${said.message ?? ''}`.trim() : res.status}`);
  };
}

/**
 * Sends a message without anybody waiting for it: the request that caused it is answered meanwhile. Never
 * throws; a message that could not leave is written in the log and forgotten. (`ctx.later`: where the host
 * must be told that something is still going on once the answer is given.)
 */
export function mailLater(ctx, message) {
  if (!ctx?.mail) return;
  let sent;
  try { sent = Promise.resolve(ctx.mail(message)); } catch (err) { sent = Promise.reject(err); }
  sent = sent.catch((err) => { console.error('[mail]', String(err?.message || err).slice(0, 160)); });
  ctx.later?.(sent);
}

/** An address with most of it hidden, to show its owner which one it is: j•••@e•••.org */
export const maskEmail = (email) => String(email || '').replace(/^(.)[^@]*@(.)[^.]*/, '$1•••@$2•••');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---- the sentences ---------------------------------------------------------------------------------------------
// A sentence is text with {placeholders} — {name}, {place}, {price}… — put in their place when the message is
// built. Words between [square brackets] that hold a placeholder are left out when what it stands for is not
// known: "Thank you[, {name}]!" is "Thank you, Ada!" — and "Thank you!" for a buyer without an account.
// (Brackets round plain words are just brackets.)

/** A sentence, read: its pieces — text, { v: a placeholder }, { opt: pieces left out when one of theirs is empty } — or null when a { or a } is out of place. */
function read(template) {
  const out = [], holder = /\{([A-Za-z]+)\}/y;
  let text = '';
  const flush = () => { if (text) { out.push(text); text = ''; } };
  for (let i = 0; i < template.length;) {
    const c = template[i];
    if (c === '{') {
      holder.lastIndex = i;
      const m = holder.exec(template);
      if (!m) return null;
      flush(); out.push({ v: m[1] }); i += m[0].length;
      continue;
    }
    if (c === '}') return null;
    if (c === '[') {
      const end = template.indexOf(']', i + 1), inner = end < 0 ? '' : template.slice(i + 1, end);
      if (inner.includes('{') && !inner.includes('[')) {
        const opt = read(inner);
        if (!opt) return null;
        flush(); out.push({ opt }); i = end + 1;
        continue;
      }
    }
    text += c; i++;
  }
  flush();
  return out;
}
/** The placeholders a sentence uses. */
const named = (pieces, into = new Set()) => { for (const p of pieces) { if (p.v) into.add(p.v); else if (p.opt) named(p.opt, into); } return into; };
/**
 * What stands for a placeholder: a value — or a function that makes it when a sentence asks for it (a word that is
 * itself a sentence of the table: "a payment", "{amount} a month" — it is only read where it shows).
 */
const standsFor = (vars, name) => { const v = vars[name]; return String((typeof v === 'function' ? v() : v) ?? ''); };
/** A sentence with its placeholders filled in. `lit`: what becomes of its own words; `val`: of what stands for a placeholder. */
function fill(pieces, vars, lit, val) {
  let s = '';
  for (const p of pieces) {
    if (typeof p === 'string') s += lit(p);
    else if (p.v) s += val(standsFor(vars, p.v));
    else if ([...named(p.opt)].every((n) => standsFor(vars, n) !== '')) s += fill(p.opt, vars, lit, val);
  }
  return s;
}
const same = (s) => s;
/** What was typed, made fit for a message in HTML: nothing of it is markup, and its new lines are new lines. */
const typedHtml = (s) => esc(s).replace(/\n/g, '<br>');

/**
 * What the owner typed for a sentence, looked at: { ok, text (as it is kept: no control character, one line where
 * the sentence is one), pieces } — or { ok: false, why } when it cannot be used: not a sentence of that message,
 * too long, empty where the message cannot do without it, a { or a } out of place, a placeholder that sentence
 * does not have, a placeholder it cannot do without. A sentence that cannot be used never breaks a message: the
 * line of the table is sent in its place (wordsOf).
 */
export function checkWords(kind, id, typed) {
  const f = Object.hasOwn(MAILS, kind) && Object.hasOwn(MAILS[kind].fields, id) ? MAILS[kind].fields[id] : null;
  if (!f || typeof typed !== 'string') return { ok: false, why: 'Not a sentence of this message.' };
  let text = typed.normalize('NFC').replace(/\r\n?/g, '\n').replace(/(?!\n)[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ');
  text = f.line ? text.replace(/\s+/g, ' ').trim() : text.replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const max = f.line ? 200 : 1500;
  if (text.length > max) return { ok: false, why: `Too long: ${max} characters at the most.` };
  if (!text) return f.must ? { ok: false, why: 'This one cannot be left empty: the message needs it.' } : { ok: true, text, pieces: [] };
  const pieces = read(text);
  if (!pieces) return { ok: false, why: 'A { or a } is out of place: a placeholder is written like {name}.' };
  const used = named(pieces), may = { ...MAILS[kind].vars, ...f.own };
  for (const n of used) if (!Object.hasOwn(may, n)) return { ok: false, why: `{${n}} is not a placeholder this sentence can use.` };
  for (const n of f.needs || []) if (!used.has(n)) return { ok: false, why: `This line must keep {${n}}: without it the message is of no use.` };
  return { ok: true, text, pieces };
}

/**
 * The words of a message of that kind, as its builder asks for them: t(id) for the plain text, h(id) for the
 * HTML. `over` — what the owner typed in the back office, { sentence: text } — stands in the place of a line
 * of the table when it can be used (checkWords): as text in both, escaped in the HTML. Otherwise the line of the
 * table does (its `html`, where the table has one: the same sentence with a few words in bold, or said a little
 * differently). `used`: a Set that is told which sentences were asked for.
 */
function wordsOf(kind, over, used) {
  const fields = MAILS[kind].fields;
  let vars = {};
  const pick = (id) => {
    const f = fields[id];
    used?.add(id);
    if (over && typeof over[id] === 'string') { const typed = checkWords(kind, id, over[id]); if (typed.ok) return { typed: typed.pieces }; }
    return (f.read ||= { text: read(f.text), html: f.html ? read(f.html) : null });
  };
  return {
    /** What the placeholders stand for from now on. */
    set(more) { vars = { ...vars, ...more }; return this; },
    t(id, more) { const p = pick(id); return fill(p.typed || p.text, more ? { ...vars, ...more } : vars, same, same); },
    h(id, more) {
      const p = pick(id), v = more ? { ...vars, ...more } : vars;
      return p.typed ? fill(p.typed, v, typedHtml, esc) : p.html ? fill(p.html, v, same, esc) : fill(p.text, v, esc, esc);
    },
  };
}

// ---- the dress of the messages in the colours of the fair ----------------------------------------------------
// Everything is in the message: tables and inline styles (what mail readers show), the sign of the fair as a
// character, no picture, no font and no script from anywhere. Each has its twin in plain text.
// (never one that carries a name before an @: "https://fair.example@elsewhere.example" goes elsewhere)
const siteOf = (site) => { if (!/^https?:\/\/[^\s<>"]+$/.test(site || '')) return ''; try { const u = new URL(site); return u.username || u.password ? '' : site; } catch { return ''; } };
const INK = '#1b1840', GOLD = '#c99a3a', SUN = '#ffe14d';
// (what these are given is HTML already — a sentence of the table, or what was typed, escaped: wordsOf().h)
const para = (html) => `<p style="margin:0 0 14px">${html}</p>`;
const maybe = (html) => (html ? para(html) : '');
const heading = (html, size = '26px/1.2') => `<h1 style="margin:0 0 14px;font:700 ${size} Georgia,'Times New Roman',serif;color:${INK}">${html}</h1>`;
const bullets = (lines) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${lines.map((l) => `<tr><td style="vertical-align:top;padding:3px 9px 3px 0;color:${GOLD};font-size:15px;line-height:1.5">&#10022;</td><td style="padding:3px 0;font:15px/1.5 Georgia,'Times New Roman',serif;color:${INK}">${l}</td></tr>`).join('')}</table>`;
const ticket = (title, inner) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;border:2px dashed ${GOLD};border-radius:12px;background:#fff8e6"><tr><td style="padding:15px 18px 13px">
<div style="margin:0 0 7px;font:700 12px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:#8a5a00">${title}</div>${inner}</td></tr></table>`;
/** The paragraphs of a twin in plain text: each a few lines, an empty line between two — what is empty is left out. */
const blocks = (...paragraphs) => paragraphs.map((lines) => lines.filter(Boolean).join('\n')).filter(Boolean).join('\n\n');
const dollars = (cents) => (cents > 0 ? `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}` : '');
const capital = (s) => (s ? `${s[0].toUpperCase()}${s.slice(1)}` : s);

/**
 * The dress of a message: the marquee of the fair, a hazard stripe, the words, a way back, and why it came.
 * `title`: text (never seen: the name of the page); `preview`, `body`, `button`, `why`: HTML already.
 */
function dressed({ title, preview, body, site, button, why }) {
  const where = siteOf(site);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#1a1244">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${preview}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a1244"><tr><td align="center" style="padding:22px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#fbf7ec;border-radius:14px;overflow:hidden">
<tr><td align="center" style="padding:26px 24px 22px;background:#3a1c78;background-image:linear-gradient(135deg,#5a2a8f 0%,#2a1764 100%)">
<div style="display:inline-block;width:54px;height:54px;border-radius:50%;background:${SUN};color:${INK};font:30px/54px Arial,Helvetica,sans-serif;text-align:center">&#9762;</div>
<div style="margin-top:11px;font:italic 900 30px/1 'Arial Black',Impact,'Helvetica Neue',Arial,sans-serif;letter-spacing:.5px;text-transform:uppercase;color:${SUN}">Atomic <span style="color:#ffffff">Oasis</span></div>
<div style="margin-top:9px;font:700 11px/1.4 Arial,Helvetica,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#d9cff5">The world ended; the fair did not</div>
</td></tr>
<tr><td style="height:10px;font-size:0;line-height:0;background:#f2c14e;background-image:repeating-linear-gradient(-45deg,${INK} 0,${INK} 12px,${SUN} 12px,${SUN} 24px)">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 6px;font:16px/1.55 Georgia,'Times New Roman',serif;color:${INK}">${body}</td></tr>
${where ? `<tr><td align="center" style="padding:6px 28px 28px"><a href="${esc(where)}" style="display:inline-block;padding:14px 28px;border-radius:10px;background:${SUN};border-bottom:4px solid #c9a300;color:${INK};font:900 15px/1 'Arial Black',Arial,Helvetica,sans-serif;letter-spacing:.5px;text-transform:uppercase;text-decoration:none">${button}</a></td></tr>` : ''}
<tr><td style="padding:17px 28px 21px;background:#f1ead8;border-top:1px solid #e2d6b8;font:12px/1.55 Arial,Helvetica,sans-serif;color:#6b6480">${why}${where ? `<br><a href="${esc(where)}" style="color:#8a5a00">${esc(where.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>` : ''}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// ---- the table of the words -----------------------------------------------------------------------------------
// MAILS[kind] = { vars: the placeholders any sentence of that message may use (and what each stands for),
//   fields: { <sentence>: { label (what the back office calls it), text (the sentence, as it is sent while nothing
//     was typed in its place), html (the same in the HTML of the message, where it differs: a few words in bold,
//     other quotation marks, a shorter wording under the marquee — markup is allowed here, and only here),
//     line (it is one line: a subject, a title, a button), must (the message cannot do without it),
//     only ('text' | 'html': the twin it is in, when it is not in both), own (placeholders of this sentence alone),
//     needs (those it cannot do without), note (when it is used, said to the owner) } },
//   build(w, …the arguments of its builder) → { subject, text, html, form? } }
const RARELY = 'We write very rarely: a welcome, a thank-you, a code when a new password is asked for — and a word when something happens to what you paid for (outbid, refunded, taken down). No newsletter, no tracking.';
const SOON = 'It may take a few days to show on your statement.';
const SIGNED = { bye: { label: 'Goodbye', text: 'See you at the fair,', line: true }, signature: { label: 'Signature', text: 'Atomic Oasis — made by a guy on a couch, not by a multinational.', line: true } };
const PAID_WHY = { label: 'Why this message came (under the message)', text: `You get this message because something was paid for at Atomic Oasis with this address[ (account "{name}")]. ${RARELY}` };
const OWNER_WHY = { label: 'Why this message came (under the message)', text: 'You get this message because this address was given in the back office of Atomic Oasis, to be told of new sponsors. Remove it there to stop.' };
const PER_MONTH = { label: 'How a price by the month is written', text: '{amount} a month', line: true, own: { amount: 'the sum, in dollars ($29)' }, note: 'It makes {price} when the place is paid by the month.' };
const BACK_LINE = { label: 'The line of the back office', text: 'The back office: {link}', line: true, only: 'text', own: { link: 'the address of the back office' }, note: 'In the dressed message, the button goes there.' };
/** The signature of a message: "See you at the fair," and, in italics, who signs. */
const signed = (w) => maybe([w.h('bye'), w.h('signature') && `<i>${w.h('signature')}</i>`].filter(Boolean).join('<br>'));

export const MAILS = {
  // The message that carries a code to set a new password. `site`: the address of the game; `minutes`: how long the code lasts.
  code: {
    vars: { name: 'the name of the account', minutes: 'how long the code is good for, in minutes' },
    fields: {
      subject: { label: 'Subject', text: 'Your code for Atomic Oasis', line: true, must: true },
      title: { label: 'Title', text: 'Atomic Oasis', line: true, only: 'html' },
      hello: { label: 'Greeting', text: 'Hello {name},', line: true },
      asked: { label: 'What was asked', text: 'Somebody — you, we hope — asked for a new password for the account "{name}" at Atomic Oasis.', html: 'Somebody — you, we hope — asked for a new password for the account “{name}”.' },
      codeLine: { label: 'The line of the code', text: 'Your code: {code}', line: true, must: true, only: 'text', own: { code: 'the code itself' }, needs: ['code'], note: 'In the dressed message, the code stands in a box of its own.' },
      how: { label: 'How to use it', text: 'It is good for {minutes} minutes, and for one use. In the game: Settings, Your account, "Forgot the password" — type the code there, and the new password.', html: 'It is good for {minutes} minutes, and for one use. In the game: Settings, Your account, “Forgot the password” — type the code there, and the new password.' },
      notyou: { label: 'If it was not them', text: 'If it was not you, do nothing: the password has not changed.' },
    },
    build(w, site, name, code, minutes) {
      const where = /^https?:\/\/[^\s<>"]+$/.test(site || '') ? site : '';
      w.set({ name, code, minutes });
      const p = (id, style = '') => { const h = w.h(id); return h ? `<p${style}>${h}</p>` : null; }, title = w.h('title');
      const text = blocks([w.t('hello')], [w.t('asked')], [w.t('codeLine')], [w.t('how')], [w.t('notyou')], [where]);
      const html = [`<div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;padding:24px;color:#1b1840">`,
        title ? `<h1 style="font-size:22px;margin:0 0 16px">${title}</h1>` : null,
        p('hello'), p('asked'),
        `<p style="margin:22px 0;padding:16px;border:2px dashed #c99a3a;border-radius:10px;background:#fff8e6;font:700 24px 'Courier New',monospace;letter-spacing:2px;text-align:center">${esc(code)}</p>`,
        p('how'), p('notyou', ' style="color:#5b5870"'),
        `${where ? `<p><a href="${esc(where)}" style="color:#8a5a00">${esc(where)}</a></p>` : ''}</div>`].filter((line) => line !== null).join('\n');
      return { subject: w.t('subject'), text, html };
    },
  },

  // The welcome to whoever has just made an account with an address. `site`: the address of the game.
  welcome: {
    vars: { name: 'the name of the account' },
    fields: {
      subject: { label: 'Subject', text: 'Welcome to Atomic Oasis, {name}', line: true, must: true },
      preview: { label: 'The line mail readers show after the subject', text: 'Your account is made. The Geiger counters are only ticking politely.', line: true, only: 'html' },
      title: { label: 'Title', text: 'Welcome to Atomic Oasis, {name}!', html: 'Welcome, {name}!', line: true },
      intro: { label: 'First paragraph', text: 'Your account is made. The fair is still standing, the big wheel still turns, and the Geiger counters are only ticking politely.' },
      keepsTitle: { label: 'Title of the list', text: 'What your account keeps for you:', html: 'What your account keeps for you', line: true },
      keep1: { label: 'The list — first line', text: 'Everything you buy, on every browser you sign in from', line: true },
      keep2: { label: 'The list — second line', text: 'Your days in a row, and the animals of light they unlock', line: true },
      keep3: { label: 'The list — third line', text: 'Your robot: its colours and what it wears', line: true },
      keep4: { label: 'The list — fourth line', text: 'Your scores, under your own name', line: true },
      lost: { label: 'If the password is forgotten', text: 'Forgot the password one day? In the game: Settings, Your account, "Forgot the password" — a code comes to this address.', html: 'Forgot the password one day? In the game: Settings, Your account, <b>“Forgot the password”</b> — a code comes to this address.' },
      start: { label: 'Where to start', text: 'Where to start: The big wheel at the end of the pier. Mostly Up (it is mostly up). And a word with Billy the AI, the alligator life coach.', html: '<b>Where to start:</b> The big wheel at the end of the pier. Mostly Up (it is mostly up). And a word with Billy the AI, the alligator life coach.' },
      ...SIGNED,
      button: { label: 'The button', text: 'Back to the fair', line: true, must: true, only: 'html' },
      why: { label: 'Why this message came (under the message)', text: `You get this message because an account named "{name}" was made at Atomic Oasis with this address. ${RARELY}`, html: `You get this message because an account named “{name}” was made at Atomic Oasis with this address. ${RARELY}` },
      notyou: { label: 'If it was not them', text: 'Not you? Somebody typed your address by mistake: ignore this message, nothing else will follow.' },
    },
    build(w, site, name) {
      const where = siteOf(site), keeps = ['keep1', 'keep2', 'keep3', 'keep4'];
      w.set({ name });
      const text = blocks([w.t('title')], [w.t('intro')], [w.t('keepsTitle'), ...keeps.map((k) => w.t(k)).filter(Boolean).map((k) => `- ${k}`)], [w.t('lost')], [w.t('start')], [w.t('bye'), w.t('signature')], [where], [w.t('why'), w.t('notyou')]);
      const html = dressed({
        title: 'Welcome to Atomic Oasis', preview: w.h('preview'), site, button: w.h('button'),
        body: [w.h('title') && heading(w.h('title')), maybe(w.h('intro')), ticket(w.h('keepsTitle'), bullets(keeps.map((k) => w.h(k)).filter(Boolean))), maybe(w.h('lost')), maybe(w.h('start')), signed(w)].filter(Boolean).join('\n'),
        why: [w.h('why'), w.h('notyou')].filter(Boolean).join('<br>'),
      });
      return { subject: w.t('subject'), text, html };
    },
  },

  // The message to whoever has just given a name and an address ("How should we call you?", or at the moment of
  // paying): the account is made already — this carries the link to choose its password. `link`: the address that
  // opens the game on the card where the password is typed (good for `days` days, once); `site`: the game.
  invite: {
    vars: { name: 'the name of the account', days: 'how long the link is good for, in days' },
    fields: {
      subject: { label: 'Subject', text: '{name}, choose your password for Atomic Oasis', line: true, must: true },
      preview: { label: 'The line mail readers show after the subject', text: 'Your account is made. One thing is left: choose a password.', line: true, only: 'html' },
      title: { label: 'Title', text: 'Welcome to Atomic Oasis, {name}!', html: 'Welcome, {name}!', line: true },
      intro: { label: 'First paragraph', text: 'Your account is made, and the browser you played in is signed in. One thing is left: choose a password, so that you can come back from any other browser.', html: 'Your account is made, and the browser you played in is signed in. One thing is left: <b>choose a password</b>, so that you can come back from any other browser.' },
      linkLine: { label: 'The line of the link', text: 'Choose your password: {link}', line: true, must: true, only: 'text', own: { link: 'the link that lets them choose their password' }, needs: ['link'], note: 'In the dressed message, the button goes there.' },
      button: { label: 'The button', text: 'Choose my password', line: true, must: true, only: 'html' },
      lasts: { label: 'How long the link lasts', text: 'The link is good for {days} days, and for one use.' },
      keepsTitle: { label: 'Title of the list', text: 'What your account keeps for you:', html: 'What your account keeps for you', line: true },
      keep1: { label: 'The list — first line', text: 'Your name: nobody else can play, chat or score under it', line: true },
      keep2: { label: 'The list — second line', text: 'Everything you buy, on every browser you sign in from', line: true },
      keep3: { label: 'The list — third line', text: 'Your scores of the week, the month and all time', line: true },
      keep4: { label: 'The list — fourth line', text: 'Your days in a row, and your robot as you dressed it', line: true },
      runout: { label: 'If the link has run out', text: 'No password yet and the link has run out? In the game: Settings, Your account, "Forgot the password" — a code comes to this address.', only: 'text' },
      ...SIGNED,
      why: { label: 'Why this message came (under the message)', text: `You get this message because an account named "{name}" was made at Atomic Oasis with this address. ${RARELY}`, html: `You get this message because an account named “{name}” was made at Atomic Oasis with this address. ${RARELY}` },
      notyou: { label: 'If it was not them', text: 'Not you? Somebody typed your address by mistake: ignore this message — without the link nobody can choose a password, and nothing else will follow.' },
    },
    build(w, site, name, link, days = 7) {
      const where = siteOf(site), go = /^https?:\/\/[^\s<>"]+$/.test(link || '') ? link : '', keeps = ['keep1', 'keep2', 'keep3', 'keep4'];
      w.set({ name, days, link: go });
      const text = blocks([w.t('title')], [w.t('intro')], go ? [w.t('linkLine')] : [], go ? [w.t('lasts')] : [], [w.t('keepsTitle'), ...keeps.map((k) => w.t(k)).filter(Boolean).map((k) => `- ${k}`)], [w.t('runout')], [w.t('bye'), w.t('signature')], [where], [w.t('why'), w.t('notyou')]);
      const door = go ? [`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:6px 0 18px"><a href="${esc(go)}" style="display:inline-block;padding:14px 28px;border-radius:10px;background:${SUN};border-bottom:4px solid #c9a31c;font:700 16px/1 Arial,Helvetica,sans-serif;color:${INK};text-decoration:none">${w.h('button')}</a></td></tr></table>`,
        w.h('lasts') && para(`<span style="color:#6b6480;font-size:14px">${w.h('lasts')}</span>`)].filter(Boolean).join('\n') : '';
      const html = dressed({
        title: 'Choose your password', preview: w.h('preview'), site: '', button: '',
        // (the line of the door stays, empty, when there is no link to give: as the message was always written)
        body: [w.h('title') && heading(w.h('title')), maybe(w.h('intro')), door, ticket(w.h('keepsTitle'), bullets(keeps.map((k) => w.h(k)).filter(Boolean))), signed(w)].filter((line, i) => line || i === 2).join('\n'),
        why: [w.h('why'), w.h('notyou')].filter(Boolean).join('<br>'),
      });
      return { subject: w.t('subject'), text, html };
    },
  },

  // The word of thanks to whoever has just sponsored something, or had a plaque engraved. `place`: what it is, in
  // words ("the board of Mostly Up", "gondola 3 of the big wheel"); `cents`: what was paid; `monthly`: it is paid
  // by the month; `auction`: it is kept until somebody bids more; `plaque`: a plaque for a companion (`wall`: on the
  // wall of the companions, round the dog, not at its feet); `life`: it was bought for good, paid once (a gondola, a
  // beach hut).
  sponsor: {
    vars: { name: 'the name of their account (nothing for a buyer without one)', place: 'what was sponsored, in words (the board of Mostly Up)', price: 'what was paid ($29 a month, $40) — nothing when it is not known' },
    fields: {
      subject: { label: 'Subject', text: 'You sponsor {place} — thank you', line: true, must: true },
      plaqueSubject: { label: 'Subject', text: 'Their plaque is reserved — thank you', line: true, must: true },
      preview: { label: 'The line mail readers show after the subject', text: 'You now sponsor {place} — thank you.', line: true, only: 'html' },
      plaquePreview: { label: 'The line mail readers show after the subject', text: 'A plaque {spot} — thank you.', line: true, only: 'html', own: { spot: 'where the plaque is (the sentence “Where a plaque is”)' } },
      hello: { label: 'Title', text: 'Thank you[, {name}]!', line: true },
      got: { label: 'What they have', text: 'You now sponsor {place}[ ({price})].' },
      plaqueGot: { label: 'What they have', text: 'A plaque {spot} is reserved, for good[ ({price})].', own: { spot: 'where the plaque is (the sentence “Where a plaque is”)' } },
      spotFeet: { label: 'Where a plaque is — at the feet of the dog', text: 'at the feet of the golden dog', line: true, note: 'It makes {spot} in the two sentences above.' },
      spotWall: { label: 'Where a plaque is — on the wall', text: 'on the wall of the companions by the golden dog', line: true, note: 'It makes {spot} in the two sentences above.' },
      perMonth: PER_MONTH,
      next: { label: 'What happens next', text: 'What you gave before paying — your name, a line, your link, your logo — goes up as soon as you are back in the game. To change it, walk up to your place or open the Trading Post: "Set up your panel".' },
      plaqueNext: { label: 'What happens next', text: 'What goes on it — a name, a few words, a picture — is asked for in the game, at the plaque itself: "Have your plaque engraved". It is engraved once the fair has looked at it.' },
      keepAuction: { label: 'How long it is kept — won with a bid', text: 'You paid once, and you keep the panel until somebody bids more. That day you are refunded in full, automatically, and they take your place.' },
      keepMonth: { label: 'How long it is kept — paid by the month', text: 'It is paid by the month, on Stripe. Stop whenever you like — in the game, at your place: "Look after it, or stop it" — and the place is free again at the end of the month you paid for.' },
      keepLife: { label: 'How long it is kept — bought for good', text: 'You paid once, and it is yours for good: nothing to renew, nothing to stop — it stays up for as long as the fair stands.' },
      thanks: { label: 'Why it matters', text: 'Sponsors are why Atomic Oasis is free for everybody. It is not made by a multinational, but by a guy on a couch: you have just made his day — for real.' },
      button: { label: 'The button', text: 'Back to the fair', line: true, must: true, only: 'html' },
      why: PAID_WHY,
    },
    build(w, site, name, { place = '', cents = 0, monthly = false, auction = false, plaque = false, wall = false, life = false } = {}) {
      const where = siteOf(site), amount = dollars(cents), id = (x) => (plaque ? `plaque${capital(x)}` : x);
      w.set({ name, place, amount });
      w.set({ price: () => (amount && monthly ? w.t('perMonth') : amount), spot: () => (plaque ? w.t(wall ? 'spotWall' : 'spotFeet') : '') });
      const keep = plaque ? '' : auction ? 'keepAuction' : monthly ? 'keepMonth' : life ? 'keepLife' : '';
      const text = blocks([w.t('hello')], [w.t(id('got'))], [w.t(id('next'))], [keep && w.t(keep)], [w.t('thanks')], [where], [w.t('why')]);
      const html = dressed({
        title: plaque ? 'Their plaque is reserved' : 'You are a sponsor of Atomic Oasis', preview: w.h(id('preview')), site, button: w.h('button'),
        // (the line of "how long it is kept" stays, empty, for a place that has none: as the message was always written)
        body: [heading(w.h('hello')), maybe(w.h(id('got')) && `<b>${w.h(id('got'))}</b>`), maybe(w.h(id('next'))), keep ? maybe(w.h(keep)) : '', maybe(w.h('thanks'))].join('\n'),
        why: w.h('why'),
      });
      return { subject: w.t(id('subject')), text, html, form: plaque ? 'plaque' : 'place' };
    },
  },

  // The word of thanks to whoever has just taken the Game Pass. `name`: their account, '' when they have none;
  // `perks`: what the pass gives (items.js); `cents`: what a month of it costs.
  pass: {
    vars: { name: 'the name of their account (nothing for a buyer without one)', price: 'what the pass costs ($19 a month)' },
    fields: {
      subject: { label: 'Subject', text: 'Your Game Pass is on — thank you', line: true, must: true },
      preview: { label: 'The line mail readers show after the subject', text: 'Your Game Pass is on — thank you. Known side effects: a faint, healthy glow.', line: true, only: 'html' },
      hello: { label: 'Title', text: 'Thank you[, {name}]!', line: true },
      on: { label: 'First paragraph', text: 'Your Game Pass is on. Reload the game if it is open: everything below is already yours.', html: '<b>Your Game Pass is on.</b> Reload the game if it is open: everything below is already yours.' },
      thanks: { label: 'Why it matters', text: 'It keeps the servers on and pays one entrepreneur: Atomic Oasis is not made by a multinational, but by a guy on a couch. You have just made his day — for real.' },
      perksTitle: { label: 'Title of the list of what the pass gives', text: 'What the pass gives you:', html: 'Admit one robot · what the pass gives you', line: true, note: 'The list itself is what the Game Pass gives: it is written with the pass, not here.' },
      effects: { label: 'Side effects', text: 'Known side effects: a bigger robot, an unreasonable number of hats, and a faint, healthy glow.' },
      stop: { label: 'How to stop it', text: 'It is paid {price}, on Stripe. Stop whenever you like — in the game: the item shop, the Game Pass, "Look after it, or stop it". It then lasts until the end of the month you paid for, and what you bought before stays yours.', html: 'It is paid {price}, on Stripe. Stop whenever you like — in the game: the item shop, the Game Pass, <b>“Look after it, or stop it”</b>. It then lasts until the end of the month you paid for, and what you bought before stays yours.' },
      perMonth: { ...PER_MONTH, note: 'It makes {price}.' },
      byMonth: { label: 'How the price is written when it is not known', text: 'by the month', line: true, note: 'It makes {price} then.' },
      tip: { label: 'A tip', text: 'A tip: make an account in the game (Settings — it is free) and the pass follows you to your other browsers.', note: 'Only to a buyer without an account.' },
      button: { label: 'The button', text: 'Put it to use', line: true, must: true, only: 'html' },
      why: { label: 'Why this message came (under the message)', text: `You get this message because the Game Pass of Atomic Oasis was paid for with this address[ (account "{name}")]. ${RARELY}`, html: `You get this message because the Game Pass of Atomic Oasis was paid for with this address[ (account “{name}”)]. ${RARELY}` },
    },
    build(w, site, name, { perks = [], cents = 0 } = {}) {
      const where = siteOf(site), amount = dollars(cents);
      w.set({ name, amount });
      w.set({ price: () => w.t(amount ? 'perMonth' : 'byMonth') });
      const text = blocks([w.t('hello')], [w.t('on')], [w.t('thanks')], [w.t('perksTitle'), ...perks.map((k) => `- ${k}`)], [w.t('effects')], [w.t('stop')], [name ? '' : w.t('tip')], [where], [w.t('why')]);
      const html = dressed({
        title: 'Your Game Pass is on', preview: w.h('preview'), site, button: w.h('button'),
        // (the line of the tip stays, empty, for who has an account: as the message was always written)
        body: [heading(w.h('hello')), maybe(w.h('on')), maybe(w.h('thanks')), ticket(w.h('perksTitle'), bullets(perks.map(esc))), maybe(w.h('effects') && `<i>${w.h('effects')}</i>`), maybe(w.h('stop')), name ? '' : maybe(w.h('tip'))].join('\n'),
        why: w.h('why'),
      });
      return { subject: w.t('subject'), text, html };
    },
  },

  // To the owner of the fair — at the address they gave in the back office (shop.js, /api/notify) —: a place has just
  // been paid for. `place`: what it is, in words; `cents`: what was paid; `monthly`, `auction`, `plaque`, `life` as for
  // sponsorMail; `account`: the name of the buyer's account, if they have one. Nothing of the buyer's address: the
  // payment itself is in Stripe. `test`: the message sent to try the address. `lost`: paid for, but not given —
  // somebody had the place already —: to be refunded in Stripe.
  ownerSale: {
    vars: { place: 'what was paid for, in words (the board of Mostly Up)', price: 'what was paid ($29 a month, $40) — nothing when it is not known', account: 'the name of the buyer\'s account (nothing for a guest)' },
    fields: {
      subject: { label: 'Subject', text: 'New sponsor — {place}[ — {price}]', line: true, must: true },
      plaqueSubject: { label: 'Subject', text: 'A plaque was bought — {place}', line: true, must: true },
      lostSubject: { label: 'Subject', text: 'To refund — {place} was paid for, but somebody had it', line: true, must: true },
      testSubject: { label: 'Subject', text: 'Atomic Oasis: new sponsors will be told here', line: true, must: true },
      title: { label: 'Title', text: 'A new sponsor', line: true, only: 'html' },
      plaqueTitle: { label: 'Title', text: 'A plaque was bought', line: true, only: 'html' },
      lostTitle: { label: 'Title', text: 'Paid, but not given', line: true, only: 'html' },
      testTitle: { label: 'Title', text: 'It works', line: true, only: 'html' },
      what: { label: 'What happened — a place paid by the month, or once', text: 'New sponsor: {place}[ — {price}].' },
      whatBid: { label: 'What happened — a place won with a bid', text: 'New sponsor: {place}[ — {price}, the highest bid].' },
      whatLife: { label: 'What happened — a place bought for good', text: 'New sponsor: {place}[ — {price}, once].' },
      plaqueWhat: { label: 'What happened', text: 'A plaque has just been bought: {place}[ — {price}, once].' },
      lostWhat: { label: 'What happened', text: 'Paid, but not given: {place}[ — {price}]. Somebody else had it already.' },
      testWhat: { label: 'What it says', text: 'This is a test: this address will be told of every new sponsor.' },
      who: { label: 'Who bought — with an account', text: 'Their account: {account}.' },
      guest: { label: 'Who bought — without an account', text: 'They have no account (a guest).' },
      next: { label: 'What happens next', text: 'What their place shows goes up as soon as they say it (it may already be there). You can change it, or take it down, in the back office.' },
      plaqueNext: { label: 'What happens next', text: 'What goes on it is sent from the game, and waits for your approval in the back office.' },
      lostNext: { label: 'What to do', text: 'Nothing was given to them, and nothing was given back: refund them in Stripe (and, if it is paid by the month, cancel the subscription there).' },
      perMonth: PER_MONTH,
      backLine: BACK_LINE,
      button: { label: 'The button', text: 'Open the back office', line: true, must: true, only: 'html' },
      why: OWNER_WHY,
    },
    build(w, site, { place = '', cents = 0, monthly = false, auction = false, plaque = false, life = false, account = '', test = false, lost = false } = {}) {
      const where = siteOf(site), back = where ? `${where.replace(/\/$/, '')}/admin#sponsors` : '', amount = dollars(cents);
      const form = test ? 'test' : lost ? 'lost' : plaque ? 'plaque' : 'new', id = (x) => (form === 'new' ? x : `${form}${capital(x)}`);
      w.set({ place, amount, account, link: back });
      w.set({ price: () => (amount && monthly ? w.t('perMonth') : amount) });
      // (a place bought for good is already named so — "…, for good" —: the sum only says that it was paid once)
      const what = form === 'new' ? (auction ? 'whatBid' : life ? 'whatLife' : 'what') : id('what'), who = test ? '' : account ? 'who' : 'guest', next = test ? '' : id('next');
      const subject = w.t(id('subject'));
      const text = blocks([w.t(what)], [who && w.t(who)], [next && w.t(next)], [back && w.t('backLine')], [w.t('why')]);
      const html = dressed({
        title: subject, preview: w.h(what), site: back || site, button: w.h('button'),
        // (a line each for who bought and for what comes next — empty in the test: as the message was always written)
        body: [heading(w.h(id('title')), '24px/1.25'), maybe(w.h(what) && `<b>${w.h(what)}</b>`), who ? maybe(w.h(who)) : '', next ? maybe(w.h(next)) : ''].join('\n'),
        why: w.h('why'),
      });
      return { subject, text, html, form };
    },
  },

  // To a sponsor — at the address of their account or, failing that, the one they gave at the payment (shop.js asks
  // Stripe for it when it is needed; it is kept nowhere) —: something happened to what they paid for. `kind`:
  //   'outbid'    somebody bid more for their place (`cents`: what they had bid; `refunded`: Stripe gave it back —
  //               otherwise Stripe refused, and it waits on the fair's list of refunds to settle)
  //   'late'      their bid came too late (somebody bid more just before): given back the same way
  //   'top'       a big attraction: another of its five places now went for more — or as much, `tie`, and comes
  //               first of the five —, and has the big panel over its board of scores; they keep their place among
  //               the five, on the board beside it (`cents`: what the big panel went for; `first`: their place comes
  //               first, so as much would take it back)
  //   'down'      the fair took their place down (`refunded`: the money given back; `monthly`: paid by the month, and
  //               Stripe has stopped it — nothing more will be charged; `plaque`)
  //   'refunded'  the fair gave back, after all, what was kept when it was taken down
  // `place`: what it is, in words ("the board of Shell Shock"; for 'top', the name of the attraction). `contact`: where
  // to write about it.
  sponsorNotice: {
    vars: { name: 'the name of their account (nothing for a buyer without one)', place: 'the place, in words (the board of Shell Shock)', price: 'the sum, in dollars ($7) — nothing when it is not known' },
    fields: {
      hello: { label: 'Title', text: 'Hello[, {name}].', line: true },
      outbidSubject: { label: 'Subject', text: 'You were outbid on {place}', line: true, must: true },
      outbidLead: { label: 'What happened', text: 'Somebody bid more for {place}.' },
      outbidBack: { label: 'Their money — given back', text: `Your bid[ of {price}] has been refunded in full. ${SOON}` },
      outbidKept: { label: 'Their money — Stripe could not give it back', text: 'Stripe could not refund your bid[ of {price}] automatically: it is on the fair\'s list of refunds to settle.' },
      outbidAgain: { label: 'What they can do', text: 'Want it back? Bid again, from the game: walk up to its board of scores.' },
      lateSubject: { label: 'Subject', text: 'Your bid for {place} came too late', line: true, must: true },
      lateLead: { label: 'What happened', text: 'Somebody bid more for {place} just before you.' },
      lateBack: { label: 'Their money — given back', text: `Your payment[ of {price}] has been refunded in full. ${SOON}` },
      lateKept: { label: 'Their money — Stripe could not give it back', text: 'Stripe could not refund your payment[ of {price}] automatically: it is on the fair\'s list of refunds to settle.' },
      lateAgain: { label: 'What they can do', text: 'You can bid again, from the game: walk up to its board of scores.' },
      topSubject: { label: 'Subject', text: 'The big panel of {place} has a new sponsor', line: true, must: true },
      topLead: { label: 'What happened — another put in more', text: 'Another sponsor of {place} put in more than you: the big panel over its board of scores now shows them.' },
      topLeadTie: { label: 'What happened — another put in as much, and comes first', text: 'Another sponsor of {place} put in as much as you, and their place comes first among the five: the big panel over its board of scores now shows them.' },
      topKeep: { label: 'What they keep', text: 'You keep your place among the five, on the board beside it.' },
      topBack: { label: 'What it would take — more than the other', text: 'The big panel goes to whoever of the five put in the most (when two put in as much, to the place that comes first): it would take more than {price} to have it back.' },
      topBackFirst: { label: 'What it would take — as much is enough (their place comes first)', text: 'The big panel goes to whoever of the five put in the most (when two put in as much, to the place that comes first): it would take {price} or more to have it back.' },
      topBackUnknown: { label: 'What it would take — when the sum is not known', text: 'The big panel goes to whoever of the five put in the most (when two put in as much, to the place that comes first): it would take more than they did to have it back.' },
      downSubject: { label: 'Subject — a panel', text: 'Your panel was taken down', line: true, must: true },
      downSubjectPlaque: { label: 'Subject — a plaque', text: 'Your plaque was taken down', line: true, must: true },
      downLead: { label: 'What happened — a panel', text: 'The fair took your panel down: {place}.' },
      downLeadPlaque: { label: 'What happened — a plaque', text: 'The fair took your plaque down: {place}.' },
      downBack: { label: 'Their money — given back', text: `Your payment[ of {price}] has been refunded in full. ${SOON}` },
      downMonthBack: { label: 'Their money — paid by the month, the month given back', text: `The month you had paid has been refunded, and nothing more will be charged for it. ${SOON}` },
      downMonth: { label: 'Their money — paid by the month, stopped', text: 'Nothing more will be charged for it.' },
      refundedSubject: { label: 'Subject', text: 'Your payment has been refunded', line: true, must: true },
      refundedLead: { label: 'What happened', text: 'The fair has refunded your payment[ of {price}][ for {place}].' },
      refundedSoon: { label: 'When they will see it', text: SOON },
      contact: { label: 'Where to write', text: 'A question about it? Write to {contact}.', own: { contact: 'the address of the fair, as the legal notice gives it' }, note: 'Only where the fair has given an address to write to.' },
      button: { label: 'The button', text: 'Back to the fair', line: true, must: true, only: 'html' },
      why: PAID_WHY,
    },
    build(w, site, name, { kind = 'outbid', place = '', cents = 0, refunded = false, monthly = false, plaque = false, tie = false, first = false, contact = '' } = {}) {
      const where = siteOf(site), price = dollars(cents);
      w.set({ name, place, price, contact });
      const said = {
        outbid: () => ['outbidSubject', 'outbidLead', [refunded ? 'outbidBack' : 'outbidKept', 'outbidAgain']],
        late: () => ['lateSubject', 'lateLead', [refunded ? 'lateBack' : 'lateKept', 'lateAgain']],
        top: () => ['topSubject', tie ? 'topLeadTie' : 'topLead', ['topKeep', price ? (first ? 'topBackFirst' : 'topBack') : 'topBackUnknown']],
        down: () => [plaque ? 'downSubjectPlaque' : 'downSubject', plaque ? 'downLeadPlaque' : 'downLead', monthly ? [refunded ? 'downMonthBack' : 'downMonth'] : refunded ? ['downBack'] : []],
        refunded: () => ['refundedSubject', 'refundedLead', ['refundedSoon']],
      };
      const known = Object.hasOwn(said, kind), [subjectId, leadId, body] = known ? said[kind]() : ['', '', []];
      if (contact) body.push('contact');
      // (a kind nobody has heard of: the place, and nothing else — the fair makes none)
      const subject = known ? w.t(subjectId) : 'About your place at Atomic Oasis', lead = known ? w.t(leadId) : place, leadHtml = known ? w.h(leadId) : esc(place);
      const text = [w.t('hello'), lead, ...body.map((b) => w.t(b)), where, w.t('why')].filter((line, i) => line || (i === 1 && !known)).join('\n\n');
      const html = dressed({
        title: subject, preview: leadHtml, site, button: w.h('button'),
        body: [heading(w.h('hello'), '24px/1.25'), para(`<b>${leadHtml}</b>`), body.map((b) => w.h(b)).filter(Boolean).map(para).join('\n')].join('\n'),
        why: w.h('why'),
      });
      return { subject, text, html, form: known ? kind : 'other' };
    },
  },

  // To the owner — at the address they gave in the back office —: money was given back (`ok`), or Stripe refused to
  // (`error`: what it said; a payment then waits in the back office, under Refunds). `reason`: 'outbid', 'raised' (the
  // holder raised their own bid: the first payment goes back), 'late', 'down' (taken down: `monthly`, the month that was
  // running — `asked`: the owner asked for it to be given back), 'later' (given back from the back office).
  // `unstopped`: a place paid by the month was taken down, and Stripe would not stop what is paid for it (`error`).
  ownerRefund: {
    vars: { place: 'the place, in words (the board of Shell Shock) — nothing when it is not known', price: 'the sum, in dollars ($4) — or “a payment” when it is not known' },
    fields: {
      subject: { label: 'Subject', text: 'Refunded — {price} — {what}', line: true, must: true, own: { what: 'the place — or “a payment” when it is not known' } },
      failedSubject: { label: 'Subject', text: 'A refund failed — {what}', line: true, must: true, own: { what: 'the place — or “a payment” when it is not known' } },
      unstoppedSubject: { label: 'Subject', text: 'A subscription could not be stopped — {what}', line: true, must: true, own: { what: 'the place — or “a place” when it is not known' } },
      title: { label: 'Title', text: 'A refund', line: true, only: 'html' },
      failedTitle: { label: 'Title', text: 'A refund failed', line: true, only: 'html' },
      unstoppedTitle: { label: 'Title', text: 'A subscription still runs', line: true, only: 'html' },
      done: { label: 'What happened', text: 'Refunded: {price} — {why}.', own: { why: 'the reason (one of the sentences “The reason”)' } },
      failed: { label: 'What happened', text: 'Stripe refused to refund {price} — {why}: {error}.', own: { why: 'the reason (one of the sentences “The reason”)', error: 'what Stripe said' } },
      unstopped: { label: 'What happened', text: '{Place} was taken down, but Stripe would not stop what is paid for it every month: {error}.', own: { Place: 'the place, with a capital — or “A place”', error: 'what Stripe said' } },
      whyOutbid: { label: 'The reason — outbid', text: 'its holder was outbid on {place}', line: true, note: 'It makes {why} in “What happened”.' },
      whyRaised: { label: 'The reason — they raised their own bid', text: 'its holder raised their own bid on {place}', line: true, note: 'It makes {why} in “What happened”.' },
      whyLate: { label: 'The reason — a bid that came too late', text: 'a bid for {place} came too late', line: true, note: 'It makes {why} in “What happened”.' },
      whyDown: { label: 'The reason — taken down', text: '{place} was taken down', line: true, note: 'It makes {why} in “What happened”.' },
      whyDownMonth: { label: 'The reason — taken down, paid by the month', text: '{place} was taken down — the month that was running', line: true, note: 'It makes {why} in “What happened”.' },
      whyLater: { label: 'The reason — given back from the back office', text: 'given back from the back office[ — {place}]', line: true, note: 'It makes {why} in “What happened”.' },
      noReason: { label: 'When Stripe gave no reason', text: 'no reason given', line: true, note: 'It makes {error} then.' },
      aPayment: { label: 'When the sum or the place is not known', text: 'a payment', line: true, note: 'It makes {price} and {what} then.' },
      aPlace: { label: 'When the place is not known', text: 'a place', line: true, note: 'It makes {what} and {Place} then.' },
      toldToo: { label: 'What happens next', text: 'The sponsor is told too (by e-mail where an address is known, and in the game).' },
      raisedNext: { label: 'What happens next', text: 'Nothing to do: their new bid stands.' },
      failedNext: { label: 'What to do', text: 'Nothing was given back. It waits in the back office, under Refunds: give it back from there, or in Stripe itself.' },
      failedMonthNext: { label: 'What to do', text: 'Nothing was given back: give the month back in Stripe itself, if you still mean to.' },
      uncredited: { label: 'When its invoice still wants a credit note', text: 'Its invoice still wants its credit note — Stripe would not make it ({error}): make it in Stripe, on that invoice, without refunding a second time (the money has been given back).', own: { error: 'what Stripe said' }, note: 'It follows “What happens next”, on the same line.' },
      unstoppedNext: { label: 'What to do', text: 'It may go on being charged: cancel the subscription in Stripe itself.' },
      unstoppedNextAsked: { label: 'What to do', text: 'It may go on being charged: cancel the subscription in Stripe itself, and give the month back there.' },
      backLine: BACK_LINE,
      button: { label: 'The button', text: 'Open the back office', line: true, must: true, only: 'html' },
      why: OWNER_WHY,
    },
    build(w, site, { cents = 0, place = '', reason = '', monthly = false, ok = true, error = '', asked = true, unstopped = false, uncredited = '' } = {}) {
      const where = siteOf(site), back = where ? `${where.replace(/\/$/, '')}/admin#sponsors` : '';
      w.set({ place, link: back });
      w.set({ price: () => dollars(cents) || w.t('aPayment') });
      const reasons = { outbid: 'whyOutbid', raised: 'whyRaised', late: 'whyLate', down: monthly ? 'whyDownMonth' : 'whyDown', later: 'whyLater' };
      const form = unstopped ? 'unstopped' : ok ? 'refunded' : 'failed';
      let subject, what, whatHtml, next, nextHtml;
      if (unstopped) {
        const more = { what: () => place || w.t('aPlace'), Place: () => capital(place || w.t('aPlace')), error: () => error || w.t('noReason') }, then = asked ? 'unstoppedNextAsked' : 'unstoppedNext';
        [subject, what, whatHtml, next, nextHtml] = [w.t('unstoppedSubject', more), w.t('unstopped', more), w.h('unstopped', more), w.t(then), w.h(then)];
      } else {
        const more = { what: () => place || w.t('aPayment'), why: () => (Object.hasOwn(reasons, reason) ? w.t(reasons[reason]) : place), error: () => error || w.t('noReason') };
        const then = ok ? (reason === 'raised' ? 'raisedNext' : 'toldToo') : monthly ? 'failedMonthNext' : 'failedNext';
        [subject, what, whatHtml, next, nextHtml] = [w.t(ok ? 'subject' : 'failedSubject', more), w.t(ok ? 'done' : 'failed', more), w.h(ok ? 'done' : 'failed', more), w.t(then), w.h(then)];
        // (given back, but the invoice of that payment still wants its credit note: Stripe refused to make it)
        if (ok && uncredited) [next, nextHtml] = [[next, w.t('uncredited', { error: uncredited })].filter(Boolean).join(' '), [nextHtml, w.h('uncredited', { error: uncredited })].filter(Boolean).join(' ')];
      }
      const text = blocks([what], [next], [back && w.t('backLine')], [w.t('why')]);
      const html = dressed({
        title: subject, preview: whatHtml, site: back || site, button: w.h('button'),
        body: [heading(w.h(form === 'refunded' ? 'title' : `${form}Title`), '24px/1.25'), maybe(whatHtml && `<b>${whatHtml}</b>`), maybe(nextHtml)].join('\n'),
        why: w.h('why'),
      });
      return { subject, text, html, form };
    },
  },
};

/**
 * A message of that kind, built: { subject, text, html, form? }. `args`: what its builder is given (below);
 * `over`: the sentences the owner changed for that kind, { sentence: text } (mails.js keeps them); `used`: a Set
 * that is told which sentences of the table this message is made of.
 */
export function buildMail(kind, args, over, used) {
  return MAILS[kind].build(wordsOf(kind, over, used), ...args);
}
// What a builder hands back: the message as the table writes it — and which kind it is, made with what, so that
// the door every message leaves by (mails.js) can put the owner's words in it, and say which kind left.
const made = (kind, args) => ({ ...buildMail(kind, args), kind, args });

/** The message that carries a code to set a new password. `site`: the address of the game; `minutes`: how long the code lasts. */
export const codeMail = (site, name, code, minutes) => made('code', [site, name, code, minutes]);
/** The welcome to whoever has just made an account with an address. `site`: the address of the game. */
export const welcomeMail = (site, name) => made('welcome', [site, name]);
/** The link to choose a first password, to whoever has just given a name and an address (see MAILS.invite). */
export const inviteMail = (site, name, link, days) => made('invite', [site, name, link, days]);
/** The word of thanks to whoever has just sponsored something, or had a plaque engraved (see MAILS.sponsor). */
export const sponsorMail = (site, name, what) => made('sponsor', [site, name, what]);
/** The word of thanks to whoever has just taken the Game Pass (see MAILS.pass). */
export const passMail = (site, name, what) => made('pass', [site, name, what]);
/** To the owner of the fair: a place has just been paid for (see MAILS.ownerSale). */
export const ownerSaleMail = (site, what) => made('ownerSale', [site, what]);
/** To a sponsor: something happened to what they paid for (see MAILS.sponsorNotice). */
export const sponsorNoticeMail = (site, name, what) => made('sponsorNotice', [site, name, what]);
/** To the owner: money was given back, or Stripe refused to (see MAILS.ownerRefund). */
export const ownerRefundMail = (site, what) => made('ownerRefund', [site, what]);
