// Accounts. Nobody needs one to play: a visitor is the random name their browser gave itself (its "device").
// An account — a name and a password, nothing else — is for keeping things: what was bought, the days in a
// row, the look of the robot. A browser that signs in is attached to the account; from then on what it owns
// and what it earns belong to the account, and any other browser that signs in finds it all.
//
//   GET  /api/account?device=…                               → { account: null | { name, profile } }
//   POST /api/account  { action, device, … }
//        create  { name, password, profile? }                → { account, recovery }   (the recovery code: shown once)
//        login   { name, password }                          → { account }
//        logout  {}                                          → { account: null }
//        save    { profile }                                 → { account }             (the look, kept for other browsers)
//        reset   { name, code, password }                    → { account }             (a new password, with the recovery code
//                                                                                       — or with the code that was mailed)
//   and, where the host can send e-mail (mail.js) — elsewhere no address is ever kept:
//        create  { …, email? }                               the account carries an address (and is welcomed there: mail.js)
//        email   { email, password }                         → { account }   (signed in: the address is given, changed, or — '' — taken away)
//        mailcode { name }                                   → { ok }        (a code is mailed to the address of that account, if it has
//                                                                            one: good for half an hour, once. The answer never tells.)
//
// Passwords are never kept: only a salted PBKDF2-SHA256 of them (100,000 rounds — the most the Workers
// runtime allows), compared without telling where they differ. The recovery code is kept the same way. Ten
// wrong passwords in a row close an account for a quarter of an hour; an address may try a handful a minute.
//
// Kept: `acct:<name in lower case>` → { name, salt, hash, code, created, devices: [device…], items: [what was
// bought], visit: { day, days, best }, profile: { name, color, hat, paint, trail, size }, fails, lock,
// pass: the Game Pass ({ sub, customer, since } — or { gift: true, until }), first: when they first came (ms),
// email (an address, when one was given), mail: { code, until } (the code that was mailed), mailed: [when] };
// `dev:<device>` → { acct } (the account a browser is attached to). A browser without an account keeps the
// same `pass` and `first` in its own record, `own:<device>` (see shop.js).
import { randomId, sameSecret } from './token.js';
import { cleanName } from './protocol.js';
import { nameOk } from './decency.js';
import { COLORS, sizeOf } from './items.js';
import { cleanEmail, maskEmail, codeMail, mailLater, welcomeMail } from './mail.js';

const enc = new TextEncoder();
const ROUNDS = 100_000, DEVICES = 12, FAILS = 10, LOCK = 15 * 60_000;
/** A code that was mailed lasts `MAIL_CODE`; an account is sent one every `MAIL_GAP` at the most, `MAIL_DAY` a day. */
const MAIL_CODE = 30 * 60_000, MAIL_GAP = 2 * 60_000, MAIL_DAY = 5;
const DEVICE = /^[A-Za-z0-9_-]{16,64}$/;
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const out = (status, body, headers = {}) => ({ status, body, headers });

async function hashOf(secret, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: ROUNDS }, key, 256));
}

/** A secret as it is kept — the password of a room, like those of the accounts: { salt, hash }, never the secret itself. */
export const keepSecret = async (secret) => { const salt = randomId(16); return { salt, hash: await hashOf(secret, salt) }; };
/** Is `secret` the one that was kept? (Compared without telling where they differ.) */
export const isSecret = async (secret, kept) => !!kept && typeof secret === 'string' && secret.length > 0 && secret.length <= 100 && sameSecret(await hashOf(secret, kept.salt), kept.hash);

/** A name for an account: 3 to 16 letters, digits, spaces, dashes or underscores; '' when it is not one. */
export function accountName(text) {
  const s = typeof text === 'string' ? text.normalize('NFKC').replace(/\s+/g, ' ').trim() : '';
  return /^[\p{L}\p{N}][\p{L}\p{N} _-]{1,14}[\p{L}\p{N}]$/u.test(s) && nameOk(s) ? s : '';
}
const keyOf = (name) => `acct:${name.toLowerCase()}`;
/** Is that the name of an account (whatever its capitals)? */
export const isAccountName = async (store, name) => !!accountName(name) && !!(await store.get(keyOf(accountName(name))));
/** The names the fair gives to who has not chosen one ("Visitor 42"): never the name of an account. */
const GUEST_NAME = /^visitor \d+$/i;
const goodPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 100;
/** The look of a robot, as an account keeps it (anything else is dropped). */
function cleanProfile(p) {
  if (!p || typeof p !== 'object') return null;
  const word = (v) => (typeof v === 'string' && /^[a-z]{1,16}$/.test(v) ? v : 'none');
  return { name: cleanName(p.name || ''), color: Number.isInteger(p.color) && p.color >= 0 && p.color < COLORS ? p.color : 0, hat: word(p.hat), paint: word(p.paint), trail: word(p.trail), size: sizeOf(p.size) };
}
// (a code to write down: twelve characters that cannot be mistaken for one another)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function recoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b, i) => `${i && i % 4 === 0 ? '-' : ''}${ALPHABET[b % 32]}`).join('');
}
const cleanCode = (text) => String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** The account a browser is attached to (its record), or null. */
export async function accountOf(store, device) {
  if (!DEVICE.test(device || '')) return null;
  const link = await store.get(`dev:${device}`);
  if (!link?.acct) return null;
  const acct = await store.get(`acct:${link.acct}`);
  return acct && acct.devices?.includes(device) ? acct : null;
}

/**
 * May this browser be seen under that name — over its robot, in the chat? Yes, unless it is the name of an
 * account the browser is not signed in to: the name of an account is its owner's alone (the relay asks, for
 * each name a visitor takes). Nothing is kept for it: the accounts are the list.
 */
export async function mayBeNamed(store, device, name) {
  const n = accountName(name);
  if (!n || GUEST_NAME.test(n)) return true;
  const acct = await store.get(keyOf(n));
  if (!acct) return true;
  const mine = await accountOf(store, device);
  return !!mine && mine.name.toLowerCase() === acct.name.toLowerCase();
}

/** Do these two browsers belong to the same visitor (the same browser, or two attached to one account)? */
export async function sameOwner(store, a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const [la, lb] = [await store.get(`dev:${a}`), await store.get(`dev:${b}`)];
  return !!la?.acct && la.acct === lb?.acct;
}

/** What a browser owns: what it bought itself, and what its account holds. */
export async function itemsOf(store, device) {
  const own = ((await store.get(`own:${device}`)) || {}).items || [], acct = await accountOf(store, device);
  return acct ? [...new Set([...(acct.items || []), ...own])] : own;
}

/** Something was bought from this browser: it goes to its account when it has one, to the browser otherwise. True when it was new. */
export async function addItem(store, device, item, now) {
  const acct = await accountOf(store, device);
  if (acct) {
    if ((acct.items || []).includes(item)) return false;
    await store.put(keyOf(acct.name), { ...acct, items: [...(acct.items || []), item] });
    return true;
  }
  const rec = (await store.get(`own:${device}`)) || { items: [] };
  if (rec.items.includes(item)) return false;
  await store.put(`own:${device}`, { ...rec, items: [...rec.items, item], at: now });
  return true;
}

/**
 * What is kept about a visitor besides what they own — their Game Pass, when they first came: on the account
 * of a browser that is signed in, on the browser's own record otherwise. Returns { pass, first, save(fields) }.
 */
export async function holderOf(store, device) {
  const acct = await accountOf(store, device);
  if (acct) return { pass: acct.pass || null, first: acct.first || 0, account: acct.name, save: (fields) => store.put(keyOf(acct.name), { ...acct, ...fields }) };
  const rec = (await store.get(`own:${device}`)) || { items: [] };
  return { pass: rec.pass || null, first: rec.first || 0, account: '', save: (fields) => store.put(`own:${device}`, { ...rec, ...fields }) };
}

/** Is this pass in force at `now`? (One that is paid by the month lasts until Stripe says it ended; a gift, until its day.) */
export const passLive = (pass, now) => !!pass && (pass.gift ? pass.until > now : true);

/** The days in a row of a browser are those of its account, when it has one: reads / writes the right record. */
export async function visitRecord(store, device) {
  const acct = await accountOf(store, device);
  return acct ? { seen: acct.visit || (await store.get(`visit:${device}`)) || null, save: (next) => store.put(keyOf(acct.name), { ...acct, visit: next }) }
    : { seen: (await store.get(`visit:${device}`)) || null, save: (next) => store.put(`visit:${device}`, next) };
}

// A browser joins an account: what it had (bought, its days in a row) goes with it.
async function attach(store, acct, device, now) {
  const mine = (await store.get(`own:${device}`)) || {}, own = mine.items || [], seen = await store.get(`visit:${device}`);
  const devices = [...(acct.devices || []).filter((d) => d !== device), device];
  for (const gone of devices.splice(0, Math.max(0, devices.length - DEVICES))) await store.delete(`dev:${gone}`); // (the oldest browsers are let go)
  const visit = !acct.visit || (seen && (seen.day > acct.visit.day || (seen.day === acct.visit.day && seen.days > acct.visit.days))) ? seen || acct.visit || null : acct.visit;
  // (a pass paid from this browser follows it; the earliest first visit of the two is the account's)
  const pass = passLive(acct.pass, now) ? acct.pass : passLive(mine.pass, now) ? mine.pass : null;
  const first = Math.min(acct.first || Infinity, mine.first || Infinity, acct.created || Infinity);
  const next = { ...acct, devices, items: [...new Set([...(acct.items || []), ...own])], visit: visit ? { ...visit, best: Math.max(visit.best || 0, acct.visit?.best || 0, seen?.best || 0) } : null, fails: 0, lock: 0, seen: now, pass, first: Number.isFinite(first) ? first : now };
  await store.put(keyOf(acct.name), next);
  await store.put(`dev:${device}`, { acct: acct.name.toLowerCase(), at: now });
  // (a pass that came with this browser: its subscription is now the account's too)
  if (pass && pass.sub && pass === mine.pass) await store.put(`sub:${pass.sub}`, { device, account: acct.name.toLowerCase(), at: now });
  return next;
}
const shown = (acct) => ({ name: acct.name, profile: acct.profile || null, devices: (acct.devices || []).length, ...(acct.email && { email: maskEmail(acct.email) }) });

/** Answers /api/account; returns nothing for any other path. `limited(name)`: has this address asked too often? */
export async function accountRoute(req, ctx, limited) {
  if (req.path !== '/api/account') return null;
  const { method, query, body } = req, store = ctx.store, now = ctx.now();
  if (method === 'GET' || method === 'HEAD') {
    const acct = await accountOf(store, query.get('device') || '');
    return out(200, { account: acct ? shown(acct) : null });
  }
  if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD, POST' });
  const device = body?.device, action = body?.action;
  if (!DEVICE.test(device || '')) return out(400, { error: 'Not a browser of the game.' });

  if (action === 'logout') {
    const acct = await accountOf(store, device);
    if (acct) await store.put(keyOf(acct.name), { ...acct, devices: acct.devices.filter((d) => d !== device) });
    await store.delete(`dev:${device}`);
    return out(200, { account: null });
  }
  if (action === 'save') {
    const acct = await accountOf(store, device), profile = cleanProfile(body.profile);
    if (!acct) return out(403, { error: 'Sign in first.' });
    if (!profile) return out(400, { error: 'Nothing to keep.' });
    const next = { ...acct, profile };
    await store.put(keyOf(acct.name), next);
    return out(200, { account: shown(next) });
  }
  if (action !== 'create' && action !== 'login' && action !== 'reset' && action !== 'email' && action !== 'mailcode') return out(400, { error: 'Unknown action.' });
  if (limited('account')) return out(429, { error: 'Too many tries: wait a minute.' }, { 'Retry-After': '60' });
  if (action === 'email') {
    // the address of an account: given, changed or taken away from a browser that is signed in — with the password
    const acct = await accountOf(store, device);
    if (!acct) return out(403, { error: 'Sign in first.' });
    if (!ctx.mail) return out(501, { error: 'This server sends no e-mail.' });
    const email = body.email ? cleanEmail(body.email) : '';
    if (body.email && !email) return out(400, { error: 'That does not look like an e-mail address.' });
    if (acct.lock > now) return out(429, { error: 'Too many wrong tries: this account is closed for a quarter of an hour.' }, { 'Retry-After': String(Math.ceil((acct.lock - now) / 1000)) });
    const pw = String(body.password || '');
    if (!pw || pw.length > 100 || !sameSecret(await hashOf(pw, acct.salt), acct.hash)) {
      const fails = (acct.fails || 0) + 1;
      await store.put(keyOf(acct.name), { ...acct, fails: fails >= FAILS ? 0 : fails, lock: fails >= FAILS ? now + LOCK : 0 });
      return out(403, { error: 'Wrong password.' });
    }
    const { email: _was, mail: _code, ...rest } = acct; // (a code mailed to the old address dies with it)
    const next = { ...rest, ...(email && { email }), fails: 0, lock: 0 };
    await store.put(keyOf(acct.name), next);
    return out(200, { account: shown(next) });
  }
  if (action === 'mailcode') {
    // a code to set a new password, mailed to the address of the account. The answer is the same whether there
    // is such an account, whether it has an address, whether a message left: nobody learns anything by asking.
    const who = accountName(body.name), acct = who ? await store.get(keyOf(who)) : null, said = out(200, { ok: true });
    if (!ctx.mail || !acct?.email) { await hashOf('nobody', 'nobody'); return said; }
    const sent = (acct.mailed || []).filter((t) => now - t < 24 * 3600_000);
    if (sent.length >= MAIL_DAY || (sent.length && now - sent[sent.length - 1] < MAIL_GAP)) { await hashOf('nobody', 'nobody'); return said; }
    const code = recoveryCode();
    await store.put(keyOf(who), { ...acct, mail: { code: await hashOf(cleanCode(code), acct.salt), until: now + MAIL_CODE }, mailed: [...sent, now] });
    try { await ctx.mail({ to: acct.email, ...codeMail(req.site || '', acct.name, code, MAIL_CODE / 60_000) }); } catch (err) { console.error('[mail]', String(err?.message || err).slice(0, 160)); }
    return said;
  }
  const name = accountName(body.name);
  if (!name) return out(400, { error: typeof body.name === 'string' && !nameOk(body.name) ? 'That name cannot be worn here: pick another.' : 'A name is 3 to 16 letters or digits.' });
  const found = await store.get(keyOf(name));

  if (action === 'create') {
    if (!goodPassword(body.password)) return out(400, { error: 'The password needs at least 8 characters.' });
    if (GUEST_NAME.test(name)) return out(400, { error: 'That name is kept for visitors without an account. Pick another.' });
    if (found) return out(409, { error: 'That name is taken.' });
    // (an address is only kept where it can be of use: on a host that sends e-mail)
    const email = ctx.mail && body.email ? cleanEmail(body.email) : '';
    if (ctx.mail && body.email && !email) return out(400, { error: 'That does not look like an e-mail address.' });
    const salt = randomId(16), code = recoveryCode();
    const acct = { name, salt, hash: await hashOf(body.password, salt), code: await hashOf(cleanCode(code), salt), created: now, devices: [], items: [], visit: null, profile: cleanProfile(body.profile), fails: 0, lock: 0, ...(email && { email }) };
    const made = await attach(store, acct, device, now);
    // (a welcome, to whoever gave an address: it leaves while they are answered — nobody waits for it)
    if (email) mailLater(ctx, { to: email, ...welcomeMail(req.site || '', name) });
    return out(200, { account: shown(made), recovery: code });
  }
  // (the same answer whether the name or the password is wrong: nobody learns which names exist)
  const wrong = out(403, { error: action === 'login' ? 'Wrong name or password.' : 'Wrong name or recovery code.' });
  if (!found) { await hashOf(String(body.password || body.code || ''), 'nobody'); return wrong; }
  if (found.lock > now) return out(429, { error: 'Too many wrong tries: this account is closed for a quarter of an hour.' }, { 'Retry-After': String(Math.ceil((found.lock - now) / 1000)) });
  const secret = action === 'login' ? String(body.password || '') : cleanCode(body.code), kept = action === 'login' ? found.hash : found.code;
  const given = secret && secret.length <= 100 ? await hashOf(secret, found.salt) : '';
  // (a new password can also be set with the code that was mailed, while it lasts)
  const byMail = action === 'reset' && !!given && !!found.mail && found.mail.until > now && sameSecret(given, found.mail.code);
  if (!given || !(sameSecret(given, kept) || byMail)) {
    const fails = (found.fails || 0) + 1;
    await store.put(keyOf(name), { ...found, fails: fails >= FAILS ? 0 : fails, lock: fails >= FAILS ? now + LOCK : 0 });
    return wrong;
  }
  let acct = found;
  if (action === 'reset') {
    if (!goodPassword(body.password)) return out(400, { error: 'The password needs at least 8 characters.' });
    acct = { ...found, hash: await hashOf(body.password, found.salt), mail: null }; // (the code that was mailed is spent)
  }
  return out(200, { account: shown(await attach(store, acct, device, now)) });
}
