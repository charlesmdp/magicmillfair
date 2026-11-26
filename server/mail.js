// E-mails. The game sends very few of them, and only to whoever gave an address: a welcome when an account is
// made with one (welcomeMail), a word of thanks when the Game Pass is taken (passMail), and a code to set a
// new password (codeMail). No newsletter, no tracking: no picture is fetched from anywhere, no link is
// counted — the look of the fair is drawn in the message itself. How a message leaves is the business of the
// host — it hands the API a function, ctx.mail({ to, subject, text, html }) — and where there is none no
// e-mail is ever sent, and nobody is asked for an address.
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

/** The message that carries a code to set a new password. `site`: the address of the game; `minutes`: how long the code lasts. */
export function codeMail(site, name, code, minutes) {
  const where = /^https?:\/\/[^\s<>"]+$/.test(site || '') ? site : '';
  const text = [
    `Hello ${name},`, '',
    `Somebody — you, we hope — asked for a new password for the account "${name}" at Atomic Oasis.`, '',
    `Your code: ${code}`, '',
    `It is good for ${minutes} minutes, and for one use. In the game: Settings, Your account, "Forgot the password" — type the code there, and the new password.`, '',
    'If it was not you, do nothing: the password has not changed.',
    ...(where ? ['', where] : []),
  ].join('\n');
  const html = `<div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;padding:24px;color:#1b1840">
<h1 style="font-size:22px;margin:0 0 16px">Atomic Oasis</h1>
<p>Hello ${esc(name)},</p>
<p>Somebody — you, we hope — asked for a new password for the account “${esc(name)}”.</p>
<p style="margin:22px 0;padding:16px;border:2px dashed #c99a3a;border-radius:10px;background:#fff8e6;font:700 24px 'Courier New',monospace;letter-spacing:2px;text-align:center">${esc(code)}</p>
<p>It is good for ${minutes} minutes, and for one use. In the game: Settings, Your account, “Forgot the password” — type the code there, and the new password.</p>
<p style="color:#5b5870">If it was not you, do nothing: the password has not changed.</p>
${where ? `<p><a href="${esc(where)}" style="color:#8a5a00">${esc(where)}</a></p>` : ''}</div>`;
  return { subject: 'Your code for Atomic Oasis', text, html };
}

// ---- the two messages in the colours of the fair -----------------------------------------------------------
// Everything is in the message: tables and inline styles (what mail readers show), the sign of the fair as a
// character, no picture, no font and no script from anywhere. Each has its twin in plain text.
// (never one that carries a name before an @: "https://fair.example@elsewhere.example" goes elsewhere)
const siteOf = (site) => { if (!/^https?:\/\/[^\s<>"]+$/.test(site || '')) return ''; try { const u = new URL(site); return u.username || u.password ? '' : site; } catch { return ''; } };
const INK = '#1b1840', GOLD = '#c99a3a', SUN = '#ffe14d';
const para = (html) => `<p style="margin:0 0 14px">${html}</p>`;
const bullets = (lines) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${lines.map((l) => `<tr><td style="vertical-align:top;padding:3px 9px 3px 0;color:${GOLD};font-size:15px;line-height:1.5">&#10022;</td><td style="padding:3px 0;font:15px/1.5 Georgia,'Times New Roman',serif;color:${INK}">${esc(l)}</td></tr>`).join('')}</table>`;
const ticket = (title, inner) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;border:2px dashed ${GOLD};border-radius:12px;background:#fff8e6"><tr><td style="padding:15px 18px 13px">
<div style="margin:0 0 7px;font:700 12px/1.2 Arial,Helvetica,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:#8a5a00">${esc(title)}</div>${inner}</td></tr></table>`;

/** The dress of a message: the marquee of the fair, a hazard stripe, the words, a way back, and why it came. */
function dressed({ title, preview, body, site, button, why }) {
  const where = siteOf(site);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#1a1244">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${esc(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a1244"><tr><td align="center" style="padding:22px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#fbf7ec;border-radius:14px;overflow:hidden">
<tr><td align="center" style="padding:26px 24px 22px;background:#3a1c78;background-image:linear-gradient(135deg,#5a2a8f 0%,#2a1764 100%)">
<div style="display:inline-block;width:54px;height:54px;border-radius:50%;background:${SUN};color:${INK};font:30px/54px Arial,Helvetica,sans-serif;text-align:center">&#9762;</div>
<div style="margin-top:11px;font:italic 900 30px/1 'Arial Black',Impact,'Helvetica Neue',Arial,sans-serif;letter-spacing:.5px;text-transform:uppercase;color:${SUN}">Atomic <span style="color:#ffffff">Oasis</span></div>
<div style="margin-top:9px;font:700 11px/1.4 Arial,Helvetica,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#d9cff5">The world ended; the fair did not</div>
</td></tr>
<tr><td style="height:10px;font-size:0;line-height:0;background:#f2c14e;background-image:repeating-linear-gradient(-45deg,${INK} 0,${INK} 12px,${SUN} 12px,${SUN} 24px)">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 6px;font:16px/1.55 Georgia,'Times New Roman',serif;color:${INK}">${body}</td></tr>
${where ? `<tr><td align="center" style="padding:6px 28px 28px"><a href="${esc(where)}" style="display:inline-block;padding:14px 28px;border-radius:10px;background:${SUN};border-bottom:4px solid #c9a300;color:${INK};font:900 15px/1 'Arial Black',Arial,Helvetica,sans-serif;letter-spacing:.5px;text-transform:uppercase;text-decoration:none">${esc(button)}</a></td></tr>` : ''}
<tr><td style="padding:17px 28px 21px;background:#f1ead8;border-top:1px solid #e2d6b8;font:12px/1.55 Arial,Helvetica,sans-serif;color:#6b6480">${why}${where ? `<br><a href="${esc(where)}" style="color:#8a5a00">${esc(where.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>` : ''}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

const RARELY = 'We write very rarely: a welcome, a thank-you, a code when a new password is asked for — and a word when something happens to what you paid for (outbid, refunded, taken down). No newsletter, no tracking.';

/** The welcome to whoever has just made an account with an address. `site`: the address of the game. */
export function welcomeMail(site, name) {
  const where = siteOf(site);
  const keeps = ['Everything you buy, on every browser you sign in from', 'Your days in a row, and the animals of light they unlock', 'Your robot: its colours and what it wears', 'Your scores, under your own name'];
  const first = 'The big wheel at the end of the pier. Mostly Up (it is mostly up). And a word with Billy the AI, the alligator life coach.';
  const lost = 'Forgot the password one day? In the game: Settings, Your account, "Forgot the password" — a code comes to this address.';
  const text = [
    `Welcome to Atomic Oasis, ${name}!`, '',
    'Your account is made. The fair is still standing, the big wheel still turns, and the Geiger counters are only ticking politely.', '',
    'What your account keeps for you:', ...keeps.map((k) => `- ${k}`), '',
    lost, '',
    `Where to start: ${first}`, '',
    'See you at the fair,', 'Atomic Oasis — made by a guy on a couch, not by a multinational.',
    ...(where ? ['', where] : []), '',
    `You get this message because an account named "${name}" was made at Atomic Oasis with this address. ${RARELY}`,
    'Not you? Somebody typed your address by mistake: ignore this message, nothing else will follow.',
  ].join('\n');
  const html = dressed({
    title: 'Welcome to Atomic Oasis', preview: 'Your account is made. The Geiger counters are only ticking politely.', site, button: 'Back to the fair',
    body: `<h1 style="margin:0 0 14px;font:700 26px/1.2 Georgia,'Times New Roman',serif;color:${INK}">Welcome, ${esc(name)}!</h1>
${para('Your account is made. The fair is still standing, the big wheel still turns, and the Geiger counters are only ticking politely.')}
${ticket('What your account keeps for you', bullets(keeps))}
${para(esc(lost).replace('&#34;Forgot the password&#34;', '<b>“Forgot the password”</b>'))}
${para(`<b>Where to start:</b> ${esc(first)}`)}
${para('See you at the fair,<br><i>Atomic Oasis — made by a guy on a couch, not by a multinational.</i>')}`,
    why: `You get this message because an account named “${esc(name)}” was made at Atomic Oasis with this address. ${esc(RARELY)}<br>Not you? Somebody typed your address by mistake: ignore this message, nothing else will follow.`,
  });
  return { subject: `Welcome to Atomic Oasis, ${name}`, text, html };
}

/**
 * The word of thanks to whoever has just sponsored something, or had a plaque engraved. `place`: what it is, in
 * words ("the board of Mostly Up", "gondola 3 of the big wheel"); `cents`: what was paid; `monthly`: it is paid
 * by the month; `auction`: it is kept until somebody bids more; `plaque`: a plaque for a companion (`wall`: on the
 * wall of the companions, round the dog, not at its feet); `life`: it was bought for good, paid once (a gondola, a
 * beach hut).
 */
export function sponsorMail(site, name, { place = '', cents = 0, monthly = false, auction = false, plaque = false, wall = false, life = false } = {}) {
  const spot = wall ? 'on the wall of the companions by the golden dog' : 'at the feet of the golden dog';
  const where = siteOf(site), hello = name ? `Thank you, ${name}!` : 'Thank you!';
  const sum = cents > 0 ? `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}${monthly ? ' a month' : ''}` : '';
  const got = plaque ? `A plaque ${spot} is reserved, for good${sum ? ` (${sum})` : ''}.` : `You now sponsor ${place}${sum ? ` (${sum})` : ''}.`;
  const next = plaque
    ? 'What goes on it — a name, a few words, a picture — is asked for in the game, at the plaque itself: "Have your plaque engraved". It is engraved once the fair has looked at it.'
    : 'What you gave before paying — your name, a line, your link, your logo — goes up as soon as you are back in the game. To change it, walk up to your place or open the Trading Post: "Set up your panel".';
  const keep = plaque ? '' : auction
    ? 'You paid once, and you keep the panel until somebody bids more. That day you are refunded in full, automatically, and they take your place.'
    : monthly ? 'It is paid by the month, on Stripe. Stop whenever you like — in the game, at your place: "Look after it, or stop it" — and the place is free again at the end of the month you paid for.'
      : life ? 'You paid once, and it is yours for good: nothing to renew, nothing to stop — it stays up for as long as the fair stands.' : '';
  const why = 'Sponsors are why Atomic Oasis is free for everybody. It is not made by a multinational, but by a guy on a couch: you have just made his day — for real.';
  const because = `You get this message because something was paid for at Atomic Oasis with this address${name ? ` (account "${name}")` : ''}. ${RARELY}`;
  const text = [hello, '', got, '', next, ...(keep ? ['', keep] : []), '', why, ...(where ? ['', where] : []), '', because].join('\n');
  const html = dressed({
    title: plaque ? 'Their plaque is reserved' : 'You are a sponsor of Atomic Oasis', preview: plaque ? `A plaque ${spot} — thank you.` : `You now sponsor ${place} — thank you.`, site, button: 'Back to the fair',
    body: `<h1 style="margin:0 0 14px;font:700 26px/1.2 Georgia,'Times New Roman',serif;color:${INK}">${esc(hello)}</h1>
${para(`<b>${esc(got)}</b>`)}
${para(esc(next))}
${keep ? para(esc(keep)) : ''}
${para(esc(why))}`,
    why: esc(because),
  });
  return { subject: plaque ? 'Their plaque is reserved — thank you' : `You sponsor ${place} — thank you`, text, html };
}

/**
 * The word of thanks to whoever has just taken the Game Pass. `name`: their account, '' when they have none;
 * `perks`: what the pass gives (items.js); `cents`: what a month of it costs.
 */
export function passMail(site, name, { perks = [], cents = 0 } = {}) {
  const where = siteOf(site), hello = name ? `Thank you, ${name}!` : 'Thank you!';
  const month = cents > 0 ? `$${(cents / 100).toFixed(2).replace(/\.00$/, '')} a month` : 'by the month';
  const why = 'It keeps the servers on and pays one entrepreneur: Atomic Oasis is not made by a multinational, but by a guy on a couch. You have just made his day — for real.';
  const stop = `It is paid ${month}, on Stripe. Stop whenever you like — in the game: the item shop, the Game Pass, "Look after it, or stop it". It then lasts until the end of the month you paid for, and what you bought before stays yours.`;
  const effects = 'Known side effects: a bigger robot, an unreasonable number of hats, and a faint, healthy glow.';
  const tip = name ? '' : 'A tip: make an account in the game (Settings — it is free) and the pass follows you to your other browsers.';
  const text = [
    hello, '',
    'Your Game Pass is on. Reload the game if it is open: everything below is already yours.', '',
    why, '',
    'What the pass gives you:', ...perks.map((k) => `- ${k}`), '',
    effects, '',
    stop,
    ...(tip ? ['', tip] : []),
    ...(where ? ['', where] : []), '',
    `You get this message because the Game Pass of Atomic Oasis was paid for with this address${name ? ` (account "${name}")` : ''}. ${RARELY}`,
  ].join('\n');
  const html = dressed({
    title: 'Your Game Pass is on', preview: 'Your Game Pass is on — thank you. Known side effects: a faint, healthy glow.', site, button: 'Put it to use',
    body: `<h1 style="margin:0 0 14px;font:700 26px/1.2 Georgia,'Times New Roman',serif;color:${INK}">${esc(hello)}</h1>
${para('<b>Your Game Pass is on.</b> Reload the game if it is open: everything below is already yours.')}
${para(esc(why))}
${ticket('Admit one robot · what the pass gives you', bullets(perks))}
${para(`<i>${esc(effects)}</i>`)}
${para(esc(stop).replace('&#34;Look after it, or stop it&#34;', '<b>“Look after it, or stop it”</b>'))}
${tip ? para(esc(tip)) : ''}`,
    why: `You get this message because the Game Pass of Atomic Oasis was paid for with this address${name ? ` (account “${esc(name)}”)` : ''}. ${esc(RARELY)}`,
  });
  return { subject: 'Your Game Pass is on — thank you', text, html };
}

/**
 * To the owner of the fair — at the address they gave in the back office (shop.js, /api/notify) —: a place has just
 * been paid for. `place`: what it is, in words; `cents`: what was paid; `monthly`, `auction`, `plaque`, `life` as for
 * sponsorMail; `account`: the name of the buyer's account, if they have one. Nothing of the buyer's address: the
 * payment itself is in Stripe. `test`: the message sent to try the address. `lost`: paid for, but not given —
 * somebody had the place already —: to be refunded in Stripe.
 */
export function ownerSaleMail(site, { place = '', cents = 0, monthly = false, auction = false, plaque = false, life = false, account = '', test = false, lost = false } = {}) {
  const where = siteOf(site), back = where ? `${where.replace(/\/$/, '')}/admin#sponsors` : '';
  const sum = cents > 0 ? `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}${monthly ? ' a month' : ''}` : '';
  // (a place bought for good is already named so — "…, for good" —: the sum only says that it was paid once)
  const what = test ? 'This is a test: this address will be told of every new sponsor.'
    : lost ? `Paid, but not given: ${place}${sum ? ` — ${sum}` : ''}. Somebody else had it already.`
      : plaque ? `A plaque has just been bought: ${place}${sum ? ` — ${sum}, once` : ''}.`
        : `New sponsor: ${place}${sum ? ` — ${sum}${auction ? ', the highest bid' : life ? ', once' : ''}` : ''}.`;
  const who = test ? '' : account ? `Their account: ${account}.` : 'They have no account (a guest).';
  const next = test ? '' : lost ? 'Nothing was given to them, and nothing was given back: refund them in Stripe (and, if it is paid by the month, cancel the subscription there).'
    : plaque ? 'What goes on it is sent from the game, and waits for your approval in the back office.'
      : 'What their place shows goes up as soon as they say it (it may already be there). You can change it, or take it down, in the back office.';
  const subject = test ? 'Atomic Oasis: new sponsors will be told here' : lost ? `To refund — ${place} was paid for, but somebody had it` : plaque ? `A plaque was bought — ${place}` : `New sponsor — ${place}${sum ? ` — ${sum}` : ''}`;
  const why = 'You get this message because this address was given in the back office of Atomic Oasis, to be told of new sponsors. Remove it there to stop.';
  const text = [what, ...(who ? ['', who] : []), ...(next ? ['', next] : []), ...(back ? ['', `The back office: ${back}`] : []), '', why].join('\n');
  const html = dressed({
    title: subject, preview: what, site: back || site, button: 'Open the back office',
    body: `<h1 style="margin:0 0 14px;font:700 24px/1.25 Georgia,'Times New Roman',serif;color:${INK}">${esc(test ? 'It works' : lost ? 'Paid, but not given' : plaque ? 'A plaque was bought' : 'A new sponsor')}</h1>
${para(`<b>${esc(what)}</b>`)}
${who ? para(esc(who)) : ''}
${next ? para(esc(next)) : ''}`,
    why,
  });
  return { subject, text, html };
}

const dollars = (cents) => (cents > 0 ? `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}` : '');

/**
 * To a sponsor — at the address of their account or, failing that, the one they gave at the payment (shop.js asks
 * Stripe for it when it is needed; it is kept nowhere) —: something happened to what they paid for. `kind`:
 *   'outbid'    somebody bid more for their place (`cents`: what they had bid; `refunded`: Stripe gave it back —
 *               otherwise Stripe refused, and it waits on the fair's list of refunds to settle)
 *   'late'      their bid came too late (somebody bid more just before): given back the same way
 *   'top'       a big attraction: another of its five places now went for more — or as much, `tie`, and comes
 *               first of the five —, and has the big panel over its board of scores; they keep their place among
 *               the five, on the board beside it (`cents`: what the big panel went for; `first`: their place comes
 *               first, so as much would take it back)
 *   'down'      the fair took their place down (`refunded`: the money given back; `monthly`: paid by the month, and
 *               Stripe has stopped it — nothing more will be charged; `plaque`)
 *   'refunded'  the fair gave back, after all, what was kept when it was taken down
 * `place`: what it is, in words ("the board of Shell Shock"; for 'top', the name of the attraction). `contact`: where
 * to write about it.
 */
export function sponsorNoticeMail(site, name, { kind = 'outbid', place = '', cents = 0, refunded = false, monthly = false, plaque = false, tie = false, first = false, contact = '' } = {}) {
  const where = siteOf(site), sum = dollars(cents), hello = name ? `Hello, ${name}.` : 'Hello.';
  const it = plaque ? 'plaque' : 'panel', settle = 'It may take a few days to show on your statement.';
  const given = (what) => (refunded ? `${what}${sum ? ` of ${sum}` : ''} has been refunded in full. ${settle}` : `Stripe could not refund ${what.toLowerCase()}${sum ? ` of ${sum}` : ''} automatically: it is on the fair's list of refunds to settle.`);
  const words = {
    outbid: {
      subject: `You were outbid on ${place}`,
      lead: `Somebody bid more for ${place}.`,
      body: [given('Your bid'), 'Want it back? Bid again, from the game: walk up to its board of scores.'],
    },
    late: {
      subject: `Your bid for ${place} came too late`,
      lead: `Somebody bid more for ${place} just before you.`,
      body: [given('Your payment'), 'You can bid again, from the game: walk up to its board of scores.'],
    },
    top: {
      subject: `The big panel of ${place} has a new sponsor`,
      lead: `Another sponsor of ${place} put in ${tie ? 'as much as you, and their place comes first among the five' : 'more than you'}: the big panel over its board of scores now shows them.`,
      body: ['You keep your place among the five, on the board beside it.', `The big panel goes to whoever of the five put in the most (when two put in as much, to the place that comes first): it would take ${sum ? (first ? `${sum} or more` : `more than ${sum}`) : 'more than they did'} to have it back.`],
    },
    down: {
      subject: `Your ${it} was taken down`,
      lead: `The fair took your ${it} down: ${place}.`,
      body: [monthly ? (refunded ? `The month you had paid has been refunded, and nothing more will be charged for it. ${settle}` : 'Nothing more will be charged for it.')
        : refunded ? `Your payment${sum ? ` of ${sum}` : ''} has been refunded in full. ${settle}` : ''].filter(Boolean),
    },
    refunded: {
      subject: 'Your payment has been refunded',
      lead: `The fair has refunded your payment${sum ? ` of ${sum}` : ''}${place ? ` for ${place}` : ''}.`,
      body: [settle],
    },
  }[kind] || { subject: 'About your place at Atomic Oasis', lead: place, body: [] };
  if (contact) words.body.push(`A question about it? Write to ${contact}.`);
  const because = `You get this message because something was paid for at Atomic Oasis with this address${name ? ` (account "${name}")` : ''}. ${RARELY}`;
  const text = [hello, '', words.lead, ...words.body.flatMap((b) => ['', b]), ...(where ? ['', where] : []), '', because].join('\n');
  const html = dressed({
    title: words.subject, preview: words.lead, site, button: 'Back to the fair',
    body: `<h1 style="margin:0 0 14px;font:700 24px/1.25 Georgia,'Times New Roman',serif;color:${INK}">${esc(hello)}</h1>
${para(`<b>${esc(words.lead)}</b>`)}
${words.body.map((b) => para(esc(b))).join('\n')}`,
    why: esc(because),
  });
  return { subject: words.subject, text, html };
}

/**
 * To the owner — at the address they gave in the back office —: money was given back (`ok`), or Stripe refused to
 * (`error`: what it said; a payment then waits in the back office, under Refunds). `reason`: 'outbid', 'raised' (the
 * holder raised their own bid: the first payment goes back), 'late', 'down' (taken down: `monthly`, the month that was
 * running — `asked`: the owner asked for it to be given back), 'later' (given back from the back office).
 * `unstopped`: a place paid by the month was taken down, and Stripe would not stop what is paid for it (`error`).
 */
export function ownerRefundMail(site, { cents = 0, place = '', reason = '', monthly = false, ok = true, error = '', asked = true, unstopped = false } = {}) {
  const where = siteOf(site), back = where ? `${where.replace(/\/$/, '')}/admin#sponsors` : '', sum = dollars(cents) || 'a payment';
  const why = { outbid: `its holder was outbid on ${place}`, raised: `its holder raised their own bid on ${place}`, late: `a bid for ${place} came too late`, down: monthly ? `${place} was taken down — the month that was running` : `${place} was taken down`, later: `given back from the back office${place ? ` — ${place}` : ''}` }[reason] || place;
  let what = ok ? `Refunded: ${sum} — ${why}.` : `Stripe refused to refund ${sum} — ${why}: ${error || 'no reason given'}.`;
  let next = ok ? (reason === 'raised' ? 'Nothing to do: their new bid stands.' : 'The sponsor is told too (by e-mail where an address is known, and in the game).')
    : monthly ? 'Nothing was given back: give the month back in Stripe itself, if you still mean to.'
      : 'Nothing was given back. It waits in the back office, under Refunds: give it back from there, or in Stripe itself.';
  let subject = ok ? `Refunded — ${sum} — ${place || 'a payment'}` : `A refund failed — ${place || 'a payment'}`;
  if (unstopped) {
    subject = `A subscription could not be stopped — ${place || 'a place'}`;
    what = `${place ? `${place[0].toUpperCase()}${place.slice(1)}` : 'A place'} was taken down, but Stripe would not stop what is paid for it every month: ${error || 'no reason given'}.`;
    next = `It may go on being charged: cancel the subscription in Stripe itself${asked ? ', and give the month back there' : ''}.`;
  }
  const tail = 'You get this message because this address was given in the back office of Atomic Oasis, to be told of new sponsors. Remove it there to stop.';
  const text = [what, '', next, ...(back ? ['', `The back office: ${back}`] : []), '', tail].join('\n');
  const html = dressed({
    title: subject, preview: what, site: back || site, button: 'Open the back office',
    body: `<h1 style="margin:0 0 14px;font:700 24px/1.25 Georgia,'Times New Roman',serif;color:${INK}">${esc(unstopped ? 'A subscription still runs' : ok ? 'A refund' : 'A refund failed')}</h1>
${para(`<b>${esc(what)}</b>`)}
${para(esc(next))}`,
    why: tail,
  });
  return { subject, text, html };
}
