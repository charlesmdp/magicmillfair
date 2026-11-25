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
const siteOf = (site) => (/^https?:\/\/[^\s<>"]+$/.test(site || '') ? site : '');
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

const RARELY = 'We write very rarely: a welcome, a thank-you for the Game Pass, and a code when a new password is asked for. No newsletter, no tracking.';

/** The welcome to whoever has just made an account with an address. `site`: the address of the game. */
export function welcomeMail(site, name) {
  const where = siteOf(site);
  const keeps = ['Everything you buy, on every browser you sign in from', 'Your days in a row, and the animals of light they unlock', 'Your robot: its colours and what it wears', 'Your scores, under your own name'];
  const first = 'The big wheel at the end of the pier. Mostly Up (it is mostly up). And a word with Billy the alligator, life coach.';
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
