// Checks of signing in with Google (server/google.js, server/accounts.js), without a browser and without Google:
// the game's own server is started with the two secrets of it and told that "Google" is a small server of this
// test — one page where the visitor is sent, one address where the code that comes back is exchanged.
// usage: node tools/google-test.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { googleConfig, readIdToken } from '../server/google.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const PORT = 8840 + Math.floor(Math.random() * 40), GPORT = PORT + 50, SITE = `http://127.0.0.1:${PORT}`, FAKE = `http://127.0.0.1:${GPORT}`;
const ID = 'test-client-id.apps.googleusercontent.com', SECRET = 'test-client-secret';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims) => `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}.c2lnbmF0dXJl`;
const now = () => Math.floor(Date.now() / 1000);

// ---- "Google": /auth sends the visitor straight back with a code; /token exchanges it. The code says who signs in.
const asked = [];
const PEOPLE = { marie: { sub: '100000000000000000001', email: 'marie@example.org' }, zoe: { sub: '100000000000000000002', email: 'zoe@example.org' }, paul: { sub: '100000000000000000003', email: 'paul@example.org' } };
const fake = http.createServer((req, res) => {
  const url = new URL(req.url, FAKE);
  if (url.pathname === '/auth') { asked.push(Object.fromEntries(url.searchParams)); res.writeHead(200, { 'content-type': 'text/plain' }); res.end('the page of Google'); return; }
  if (url.pathname === '/token' && req.method === 'POST') {
    let text = '';
    req.on('data', (d) => { text += d; });
    req.on('end', () => {
      const f = new URLSearchParams(text), code = f.get('code') || '', who = PEOPLE[code.split(':')[0]];
      const ok = f.get('client_id') === ID && f.get('client_secret') === SECRET && f.get('grant_type') === 'authorization_code' && f.get('redirect_uri') === `${SITE}/api/google/callback`;
      if (!ok || !who || code.endsWith(':refused')) { res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"error":"invalid_grant"}'); return; }
      const claims = { iss: 'https://accounts.google.com', aud: code.endsWith(':other') ? 'somebody-else' : ID, sub: who.sub, email: who.email, email_verified: true, exp: now() + (code.endsWith(':old') ? -3600 : 3600) };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ access_token: 'x', id_token: jwt(claims) }));
    });
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => fake.listen(GPORT, '127.0.0.1', r));

const store = path.join(os.tmpdir(), `mmf-google-test-${process.pid}.json`);
fs.rmSync(store, { force: true });
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true }); // (the server serves the built site: a folder is enough for the API)
const server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', SCORES_FILE: store, GOOGLE_CLIENT_ID: ID, GOOGLE_CLIENT_SECRET: SECRET, GOOGLE_AUTH: `${FAKE}/auth`, GOOGLE_TOKEN: `${FAKE}/token` }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (d) => { log += d; });
server.stderr.on('data', (d) => { log += d; });
for (let i = 0; i < 200; i++) { try { if ((await fetch(`${SITE}/healthz`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }

let address = 0;
/** A request as a browser would make it, from an address of its own (so that the limits by address are not what is tested). */
const call = async (target, { method = 'GET', body, cookie = '', from = `10.1.0.${(address = (address % 250) + 1)}` } = {}) => {
  const res = await fetch(`${SITE}${target}`, { method, redirect: 'manual', headers: { 'x-forwarded-for': from, ...(cookie && { cookie }), ...(body && { 'content-type': 'application/json', origin: SITE }) }, ...(body && { body: JSON.stringify(body) }) });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, to: res.headers.get('location') || '', set: res.headers.get('set-cookie') || '', body: json };
};
const device = (n) => `device-${n}-`.padEnd(24, 'x');
/** One trip to "Google" and back for the person `who` (the code says who): → what the page comes back with (?google=…). */
// (`tamper`: a letter in the middle of the state is changed — not its last one: the last letter of a signature carries
// two bits that mean nothing, and one time in sixteen the state so "touched" was the very same state)
const trip = async (who, { name = '', keepCookie = true, tamper = false, refused = false } = {}) => {
  const start = await call(`/api/google/start${name ? `?name=${encodeURIComponent(name)}` : ''}`);
  const cookie = (start.set.split(';')[0] || ''), state = new URL(start.to).searchParams.get('state');
  const back = await call(refused ? `/api/google/callback?error=access_denied&state=${encodeURIComponent(state)}` : `/api/google/callback?code=${encodeURIComponent(who)}&state=${encodeURIComponent(tamper ? state.replace(/^(.{10})(.)/, (m, a, c) => a + (c === 'A' ? 'B' : 'A')) : state)}`, { cookie: keepCookie ? cookie : '' });
  return { start, back, word: new URL(back.to || `${SITE}/?google=`, SITE).searchParams.get('google') || '' };
};

try {
  // ---- what the pieces say by themselves
  check('without its two secrets there is no signing in with Google; with them, Google\'s own addresses are used unless the tests say otherwise',
    googleConfig({}) === null && googleConfig({ GOOGLE_CLIENT_ID: 'a' }) === null && googleConfig({ GOOGLE_CLIENT_ID: ' a ', GOOGLE_CLIENT_SECRET: 'b' }).id === 'a' && /accounts\.google\.com/.test(googleConfig({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' }).auth) && /oauth2\.googleapis\.com\/token/.test(googleConfig({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' }).token));
  const good = { iss: 'https://accounts.google.com', aud: ID, sub: '42424242', email: 'a@b.org', email_verified: true, exp: now() + 100 };
  check('what Google says is read only when it is for this site, from Google, and still good; an address Google has not checked is not kept',
    readIdToken(jwt(good), ID, Date.now())?.sub === '42424242' && readIdToken(jwt(good), ID, Date.now()).email === 'a@b.org' && readIdToken(jwt({ ...good, email_verified: false }), ID, Date.now()).email === ''
    && readIdToken(jwt({ ...good, aud: 'other' }), ID, Date.now()) === null && readIdToken(jwt({ ...good, iss: 'https://evil.example' }), ID, Date.now()) === null && readIdToken(jwt({ ...good, exp: now() - 3600 }), ID, Date.now()) === null
    && readIdToken('not.a.token', ID, Date.now()) === null && readIdToken(jwt({ ...good, sub: 5 }), ID, Date.now()) === null);

  const status = await call('/api/status');
  check('the server says that one can sign in with Google here', status.body?.ok === true && status.body.google === true, JSON.stringify(status.body?.google));

  // ---- leaving for Google
  const first = await trip('marie', { name: 'Marie' });
  const q = asked[asked.length - 1] || {}, sent = new URL(first.start.to);
  check('leaving: the visitor is sent to Google with the name of this site, the address to come back to, and nothing asked but who they are and their address',
    first.start.status === 302 && `${sent.origin}${sent.pathname}` === `${FAKE}/auth` && sent.searchParams.get('client_id') === ID && sent.searchParams.get('redirect_uri') === `${SITE}/api/google/callback` && sent.searchParams.get('response_type') === 'code' && sent.searchParams.get('scope') === 'openid email' && (sent.searchParams.get('state') || '').length > 40, first.start.to.slice(0, 120));
  check('…and a cookie goes with the trip: for this errand only, out of reach of scripts, ten minutes', /^mmf_g=[A-Za-z0-9_-]{16,}/.test(first.start.set) && /HttpOnly/i.test(first.start.set) && /SameSite=Lax/i.test(first.start.set) && /Path=\/api\/google/i.test(first.start.set) && /Max-Age=600/i.test(first.start.set), first.start.set);
  void q;

  // ---- coming back
  check('coming back: the page is sent to the game with a claim in its address, and the cookie of the trip is over', first.back.status === 302 && first.back.to.startsWith(`${SITE}/?google=`) && /^[A-Za-z0-9_-]{16,64}$/.test(first.word) && /mmf_g=;/.test(first.back.set) && /Max-Age=0/.test(first.back.set), first.back.to);
  const noCookie = await trip('marie', { keepCookie: false }), forged = await trip('marie', { tamper: true }), said = await trip('marie', { refused: true }), refused = await trip('marie:refused'), other = await trip('marie:other'), old = await trip('marie:old');
  check('an answer of Google that comes back without the cookie of the trip, or with a state that was touched, is not taken', noCookie.word === 'expired' && forged.word === 'expired', `${noCookie.word}, ${forged.word}`);
  check('who says no at Google comes back to the game as they were; a code Google will not exchange, a token for another site or a stale one: "it did not work"', said.word === 'no' && refused.word === 'failed' && other.word === 'failed' && old.word === 'failed', `${said.word}, ${refused.word}, ${other.word}, ${old.word}`);

  // ---- the claim: a new account, the first time
  const made = await call('/api/account', { method: 'POST', body: { action: 'google', device: device(1), claim: first.word, profile: { name: 'Marie', color: 3 } } });
  check('the game claims it for its own browser: the first time an account is made under the name asked for, with no password — and this browser is signed in',
    made.status === 200 && made.body?.created === true && made.body.account?.name === 'Marie' && made.body.account.google === true && made.body.account.passwordless === true && made.body.account.devices === 1, JSON.stringify(made.body));
  const seen = await call(`/api/account?device=${device(1)}`), twice = await call('/api/account', { method: 'POST', body: { action: 'google', device: device(9), claim: first.word } });
  check('…the account is this browser\'s from then on, and a claim cannot be spent twice', seen.body?.account?.name === 'Marie' && twice.status === 403, `${seen.body?.account?.name}, ${twice.status}`);
  const pw = await call('/api/account', { method: 'POST', body: { action: 'login', device: device(8), name: 'Marie', password: 'whatever-it-is' } });
  check('an account made with Google has no password: nobody signs in to it with one', pw.status === 403 && /Wrong name or password/.test(pw.body?.error || ''), JSON.stringify(pw.body));

  // ---- the same person, from another browser: signed in to the same account
  const again = await trip('marie'), back = await call('/api/account', { method: 'POST', body: { action: 'google', device: device(2), claim: again.word, name: 'Somebody Else' } });
  check('the same person from another browser is signed in to the same account — whatever name was asked for', back.status === 200 && back.body?.created === false && back.body.account?.name === 'Marie' && back.body.account.devices === 2, JSON.stringify(back.body));

  // ---- a name has to be chosen: the claim waits
  const zoe = await trip('zoe'), none = await call('/api/account', { method: 'POST', body: { action: 'google', device: device(3), claim: zoe.word } });
  const guest = await call('/api/account', { method: 'POST', body: { action: 'google', device: device(3), claim: zoe.word, name: 'Visitor 42' } });
  const taken = await call('/api/account', { method: 'POST', body: { action: 'google', device: device(3), claim: zoe.word, name: 'marie' } });
  const chosen = await call('/api/account', { method: 'POST', body: { action: 'google', device: device(3), claim: zoe.word, name: 'Zoé' } });
  check('no name, a visitor\'s name, a name that is taken: the game is told to ask for one, and the claim waits; with a good name the account is made',
    none.status === 409 && none.body?.needName === true && guest.status === 409 && guest.body?.needName === true && taken.status === 409 && taken.body?.needName === true && /taken/.test(taken.body.error) && chosen.status === 200 && chosen.body?.created === true && chosen.body.account?.name === 'Zoé', `${none.status} ${guest.status} ${taken.status} ${chosen.status} ${JSON.stringify(chosen.body)}`);

  // ---- an account with a password takes Google on
  const mine = await call('/api/account', { method: 'POST', body: { action: 'create', device: device(4), name: 'Paul', password: 'a-long-password' } });
  const paul = await trip('paul'), linked = await call('/api/account', { method: 'POST', body: { action: 'google', device: device(4), claim: paul.word } });
  const paul2 = await trip('paul'), elsewhere = await call('/api/account', { method: 'POST', body: { action: 'google', device: device(5), claim: paul2.word } });
  const still = await call('/api/account', { method: 'POST', body: { action: 'login', device: device(6), name: 'Paul', password: 'a-long-password' } });
  check('a browser that is signed in to an account with a password: Google is added to that account — from another browser Google then opens it, and its password still does',
    mine.status === 200 && linked.status === 200 && linked.body?.created === false && linked.body.account?.name === 'Paul' && linked.body.account.google === true && !linked.body.account.passwordless
    && elsewhere.status === 200 && elsewhere.body?.account?.name === 'Paul' && still.status === 200 && still.body?.account?.name === 'Paul', `${mine.status} ${linked.status} ${elsewhere.status} ${still.status}`);
  const kept = JSON.parse(fs.readFileSync(store, 'utf8')), text = JSON.stringify(kept);
  check('what is kept: which account each Google number stands for — and, on a server that sends no e-mail, no address at all', /goog:100000000000000000001/.test(text) && !/example\.org/.test(text) && !/test-client-secret/.test(text));
  const bogus = await call('/api/account', { method: 'POST', body: { action: 'google', device: device(7), claim: 'x'.repeat(32) } });
  check('a claim nobody was given opens nothing', bogus.status === 403, JSON.stringify(bogus.body));
} catch (err) {
  check('the checks ran to the end', false, String(err?.stack || err).slice(0, 400));
} finally {
  server.kill();
  fake.close();
  fs.rmSync(store, { force: true });
}
const failed = results.filter((r) => !r).length;
if (failed && log) console.log('server output:\n' + log.slice(-1500));
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
