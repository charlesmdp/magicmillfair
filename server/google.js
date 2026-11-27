// Signing in with Google — for who would rather not make up one more password. Nothing changes for the others:
// an account is still a name of the game (server/accounts.js); Google only says "this is the same person as last
// time". What is kept of it: the number Google gives that person for this site (`sub`), and — only where the
// host sends e-mail, as for the other accounts — their address. Nothing else is asked of Google, nothing is read
// there, and the game never sees a Google password.
//
// It is switched on by two secrets of the host: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (an "OAuth client" of
// the kind "Web application", whose authorised redirect URI is https://<the site>/api/google/callback). Without
// them nothing of this exists: /api/status says `google: false`, and the game shows no button.
//
//   GET /api/google/start[?name=…]        → 302 to Google (the visitor chooses an account there)
//   GET /api/google/callback?code&state   → 302 back to the game, /?google=<a claim>  (or =no, =expired, =failed)
//   POST /api/account { action: 'google', device, claim, name?, profile? }    → { account, created }   (accounts.js)
//
// Why a claim rather than signing the browser in at once: the game knows a browser by a name it keeps for
// itself (its "device"), which is not a cookie — so the page that comes back from Google could not prove which
// browser it is. Instead the answer of Google is put aside for five minutes under a random name, that name is
// handed to the page that comes back, and that page — the game, in the browser that really went to Google —
// claims it for its own device. Nobody who sends somebody a link gets anything out of it. A cookie, set when
// one leaves for Google and checked on the way back, sees to the other half: an answer of Google cannot be
// slipped into another visitor's browser.
import { randomId, sign, verify } from './token.js';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth', TOKEN = 'https://oauth2.googleapis.com/token';
const STATE_MS = 10 * 60_000, CLAIM_MS = 5 * 60_000, COOKIE = 'mmf_g';
const out = (status, body, headers = {}) => ({ status, body, headers });
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const digest = async (text) => b64(await crypto.subtle.digest('SHA-256', enc.encode(text)));

/** What the host was given: { id, secret, auth, token } — or null: signing in with Google is not set up. (GOOGLE_AUTH, GOOGLE_TOKEN: the tests' stand-ins for Google.) */
export function googleConfig(env = {}) {
  const id = String(env.GOOGLE_CLIENT_ID || '').trim(), secret = String(env.GOOGLE_CLIENT_SECRET || '').trim();
  return id && secret ? { id, secret, auth: String(env.GOOGLE_AUTH || AUTH), token: String(env.GOOGLE_TOKEN || TOKEN) } : null;
}

const cookieOf = (header, name) => { for (const part of String(header || '').split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) return v.join('='); } return ''; };
const setCookie = (site, value, age) => `${COOKIE}=${value}; Max-Age=${age}; Path=/api/google; HttpOnly; SameSite=Lax${String(site).startsWith('https:') ? '; Secure' : ''}`;

/**
 * Who Google says this is: { sub, email (only one Google has checked) } — or null. The token is read, not
 * its signature: it was handed over by Google itself, over TLS, in exchange for the secret of this site — the one
 * case in which Google's own guide says the signature need not be checked. Who it is for, who made it and
 * whether it is still good are checked.
 */
export function readIdToken(jwt, clientId, now) {
  if (typeof jwt !== 'string' || jwt.length > 8192) return null;
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  let p;
  try { p = JSON.parse(dec.decode(Uint8Array.from(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))); } catch { return null; }
  if (!p || typeof p !== 'object') return null;
  if (p.iss !== 'https://accounts.google.com' && p.iss !== 'accounts.google.com') return null;
  if (p.aud !== clientId || typeof p.sub !== 'string' || !/^[0-9A-Za-z_-]{3,64}$/.test(p.sub)) return null;
  if (!Number.isFinite(p.exp) || p.exp * 1000 < now - 60_000) return null;
  const email = p.email_verified === true || p.email_verified === 'true' ? String(p.email || '').slice(0, 160) : '';
  return { sub: p.sub, email };
}

/** The claims that wait: { id: { sub, email, want, until } }, less those that waited too long. */
const waiting = async (store, now) => Object.fromEntries(Object.entries((await store.get('gclaims')) || {}).filter(([, c]) => c && c.until > now));

/** The claim `id`, while it waits: what Google said — { sub, email, want } — or null. */
export async function readClaim(store, id, now) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) return null;
  return (await waiting(store, now))[id] || null;
}
/** …and it is spent: nobody can use it again. */
export async function dropClaim(store, id, now) {
  const all = await waiting(store, now);
  delete all[id];
  await store.put('gclaims', all);
}

/** Answers /api/google/start and /api/google/callback; returns nothing for any other path. `limited(name)`: has this address asked too often? */
export async function googleRoute(req, ctx, limited) {
  if (req.path !== '/api/google/start' && req.path !== '/api/google/callback') return null;
  const g = ctx.google, now = ctx.now(), site = req.site || '';
  if (req.method !== 'GET' && req.method !== 'HEAD') return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
  // (back to the game, with a word for it in the address — and the cookie of the trip is over)
  const home = (word) => out(302, { google: word }, { Location: `${site}/?google=${encodeURIComponent(word)}`, 'Set-Cookie': setCookie(site, '', 0) });
  if (!g) return req.path === '/api/google/start' ? home('off') : out(501, { error: 'Signing in with Google is not set up on this server.' });
  const secret = await ctx.secret(), back = `${site}/api/google/callback`;

  if (req.path === '/api/google/start') {
    if (limited('account')) return out(429, { error: 'Too many tries: wait a minute.' }, { 'Retry-After': '60' });
    const nonce = randomId(18), want = String(req.query.get('name') || '').slice(0, 24);
    const state = await sign(secret, { g: 1, h: await digest(nonce), exp: now + STATE_MS, n: want });
    // (`openid email`: who it is, and the address Google has checked — no name, no picture, no contacts, nothing to read later)
    const ask = new URLSearchParams({ client_id: g.id, redirect_uri: back, response_type: 'code', scope: 'openid email', state, prompt: 'select_account' });
    return out(302, { to: 'google' }, { Location: `${g.auth}?${ask}`, 'Set-Cookie': setCookie(site, nonce, Math.round(STATE_MS / 1000)) });
  }

  // ---- back from Google
  if (req.query.get('error')) return home('no'); // (the visitor said no there, or closed the page)
  const st = await verify(secret, req.query.get('state') || ''), nonce = cookieOf(req.cookie, COOKIE);
  if (!st || st.g !== 1 || !(st.exp > now) || !nonce || st.h !== (await digest(nonce))) return home('expired');
  const code = req.query.get('code') || '';
  if (!code || code.length > 1024) return home('no');
  let token = null;
  try {
    const res = await fetch(g.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams({ code, client_id: g.id, client_secret: g.secret, redirect_uri: back, grant_type: 'authorization_code' }).toString() });
    token = res.ok ? await res.json() : null;
    if (!res.ok) console.error('[google] the exchange was refused:', res.status);
  } catch (err) { console.error('[google]', String(err?.message || err).slice(0, 160)); }
  const who = token ? readIdToken(token.id_token, g.id, now) : null;
  if (!who) return home('failed');
  const claim = randomId(24), all = await waiting(ctx.store, now);
  all[claim] = { sub: who.sub, email: who.email, want: String(st.n || ''), until: now + CLAIM_MS };
  await ctx.store.put('gclaims', all);
  return home(claim);
}
