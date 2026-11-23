// E-mails. The game sends very few of them: a code to set a new password, to whoever gave their account an
// address. How a message leaves is the business of the host — it hands the API a function, ctx.mail({ to,
// subject, text, html }) — and where there is none no e-mail is ever sent, and nobody is asked for an address.
//
//   Cloudflare (cloudflare/worker.js): the `send_email` binding of their Email Service, named EMAIL, and a
//   variable MAIL_FROM — an address of a domain that was onboarded there (see the README: "E-mails").
//   Node (server/index.js): nothing is sent. With MAIL_FILE set, each message is written to that file as a
//   line of JSON instead: to try things out, and for the tests.

/** An address someone typed, in lower case; '' when it does not look like one. */
export function cleanEmail(text) {
  const t = String(text ?? '').trim().toLowerCase();
  return t.length <= 120 && /^[a-z0-9._%+-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(t) && !t.includes('..') ? t : '';
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
