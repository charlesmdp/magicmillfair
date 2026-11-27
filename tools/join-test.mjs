// Checks of the accounts that begin with a name and an address (server/accounts.js: join, setpw, invite; the name
// asked as it is typed; what signing in with Google does with an address) — without a browser, without Google and
// without a mailer: the game's own server is started with MAIL_FILE (each message is written there instead of
// leaving) and with a small server of this test in the place of Google.
// usage: node tools/join-test.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const PORT = 8900 + Math.floor(Math.random() * 40), GPORT = PORT + 50, SITE = `http://127.0.0.1:${PORT}`, FAKE = `http://127.0.0.1:${GPORT}`;
const ID = 'test-client-id.apps.googleusercontent.com', SECRET = 'test-client-secret';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims) => `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}.c2lnbmF0dXJl`;

// ---- "Google": the code that comes back says who signs in
const PEOPLE = { ada: { sub: '200000000000000000001', email: 'ada.lovelace+fair@example.org' }, bob: { sub: '200000000000000000002', email: 'bob@example.org' }, carl: { sub: '200000000000000000003', email: 'carl@example.org' } };
const fake = http.createServer((req, res) => {
  const url = new URL(req.url, FAKE);
  if (url.pathname === '/auth') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('the page of Google'); return; }
  if (url.pathname === '/token' && req.method === 'POST') {
    let text = '';
    req.on('data', (d) => { text += d; });
    req.on('end', () => {
      const who = PEOPLE[new URLSearchParams(text).get('code') || ''];
      if (!who) { res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"error":"invalid_grant"}'); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ access_token: 'x', id_token: jwt({ iss: 'https://accounts.google.com', aud: ID, sub: who.sub, email: who.email, email_verified: true, exp: Math.floor(Date.now() / 1000) + 3600 }) }));
    });
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => fake.listen(GPORT, '127.0.0.1', r));

const store = path.join(os.tmpdir(), `mmf-join-test-${process.pid}.json`), mails = path.join(os.tmpdir(), `mmf-join-test-${process.pid}.mails`);
fs.rmSync(store, { force: true }); fs.rmSync(mails, { force: true });
// (an account made before the addresses were listed: the list has to find it by itself)
fs.writeFileSync(store, JSON.stringify({ 'acct:old timer': { name: 'Old Timer', salt: 's', hash: 'h', created: 1, devices: [], items: [], email: 'carl@example.org' } }));
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', SCORES_FILE: store, MAIL_FILE: mails, GOOGLE_CLIENT_ID: ID, GOOGLE_CLIENT_SECRET: SECRET, GOOGLE_AUTH: `${FAKE}/auth`, GOOGLE_TOKEN: `${FAKE}/token` }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (d) => { log += d; });
server.stderr.on('data', (d) => { log += d; });
for (let i = 0; i < 200; i++) { try { if ((await fetch(`${SITE}/healthz`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }

let address = 0;
const call = async (target, { method = 'GET', body, cookie = '', from = `10.2.0.${(address = (address % 250) + 1)}` } = {}) => {
  const res = await fetch(`${SITE}${target}`, { method, redirect: 'manual', headers: { 'x-forwarded-for': from, ...(cookie && { cookie }), ...(body && { 'content-type': 'application/json', origin: SITE }) }, ...(body && { body: JSON.stringify(body) }) });
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, to: res.headers.get('location') || '', set: res.headers.get('set-cookie') || '', body: json };
};
const device = (n) => `device-${n}-`.padEnd(24, 'x');
const acct = (body) => call('/api/account', { method: 'POST', body });
const sent = () => (fs.existsSync(mails) ? fs.readFileSync(mails, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** A trip to "Google" and back for `who`: → the claim the page comes back with. */
const trip = async (who) => {
  const start = await call('/api/google/start'), cookie = start.set.split(';')[0] || '', state = new URL(start.to).searchParams.get('state');
  const back = await call(`/api/google/callback?code=${encodeURIComponent(who)}&state=${encodeURIComponent(state)}`, { cookie });
  return new URL(back.to || `${SITE}/?google=`, SITE).searchParams.get('google') || '';
};

try {
  // ---- is that name free?
  const free = await call('/api/account?free=Nina'), guest = await call('/api/account?free=Visitor%2042'), bad = await call('/api/account?free=a'), held = await call('/api/account?free=old%20TIMER');
  check('a name is asked as it is typed: free, a visitor\'s (never an account\'s), not a name, somebody\'s already — whatever its capitals',
    free.body?.ok === true && free.body.free === true && guest.body?.ok === false && guest.body.free === false && bad.body?.ok === false && held.body?.ok === true && held.body.free === false, JSON.stringify([free.body, guest.body, bad.body, held.body]));

  // ---- a name and an address
  const made = await acct({ action: 'join', device: device(1), name: 'Nina', email: 'Nina@Example.org ', profile: { name: 'Nina', color: 2 } });
  check('a name and an address: the account is made at once, this browser is signed in, it has no password yet and a link is on its way',
    made.status === 200 && made.body?.created === true && made.body.account?.name === 'Nina' && made.body.account.passwordless === true && made.body.account.invited === true && made.body.account.email === 'n•••@e•••.org' && made.body.account.devices === 1, JSON.stringify(made.body));
  await wait(200);
  const mail = sent().find((m) => m.to === 'nina@example.org'), link = (mail?.text || '').match(/https?:\/\/\S+\?pw=([A-Za-z0-9._~%-]+)/), token = link ? decodeURIComponent(link[1]) : '';
  check('the message: to that address, "choose your password", with a link of this site in its text and in its dress — and no password in it',
    !!mail && /choose your password/i.test(mail.subject) && !!token && mail.text.includes(`${SITE}/?pw=`) && mail.html.includes(`${SITE}/?pw=`) && /Choose my password/.test(mail.html) && /7 days/.test(mail.text), mail ? mail.subject : 'no message');
  const whose = await call(`/api/account?pw=${encodeURIComponent(token)}`), nobody = await call('/api/account?pw=nonsense');
  check('the link says whose password it lets one choose; a link nobody was given says nothing', whose.status === 200 && whose.body?.name === 'Nina' && nobody.status === 404, `${whose.status} ${JSON.stringify(whose.body)} ${nobody.status}`);
  const noPw = await acct({ action: 'login', device: device(2), name: 'Nina', password: 'anything-at-all' });
  check('until a password is chosen nobody signs in to it with one', noPw.status === 403, JSON.stringify(noPw.body));
  const dupName = await acct({ action: 'join', device: device(3), name: 'nina', email: 'other@example.org' }), dupMail = await acct({ action: 'join', device: device(3), name: 'Ninette', email: 'NINA@example.org' });
  const old = await acct({ action: 'join', device: device(3), name: 'Carlito', email: 'carl@example.org' });
  check('a name that is taken, an address that has an account — one made before the addresses were listed too —: refused, and said where',
    dupName.status === 409 && dupName.body?.field === 'name' && dupMail.status === 409 && dupMail.body?.field === 'email' && dupMail.body.same === 'Nina' && old.status === 409 && old.body?.same === 'Old Timer', `${dupName.status} ${dupMail.status} ${JSON.stringify(old.body)}`);
  const junk = [await acct({ action: 'join', device: device(3), name: 'x', email: 'a@b.org' }), await acct({ action: 'join', device: device(3), name: 'Visitor 7', email: 'a@b.org' }), await acct({ action: 'join', device: device(3), name: 'Fine Name', email: 'not an address' }), await acct({ action: 'join', device: device(1), name: 'Second', email: 'second@example.org' })];
  check('not a name, a visitor\'s name, not an address, a browser that is signed in already: refused', junk[0].status === 400 && junk[0].body?.field === 'name' && junk[1].status === 400 && junk[2].status === 400 && junk[2].body?.field === 'email' && junk[3].status === 400, junk.map((j) => j.status).join(' '));
  const soon = await acct({ action: 'invite', device: device(1) }), stranger = await acct({ action: 'invite', device: device(3) });
  check('the link can be asked for again from the browser that is signed in — not twice in two minutes, and not by a stranger', soon.status === 429 && stranger.status === 403, `${soon.status} ${stranger.status}`);

  // ---- the password is chosen
  const short = await acct({ action: 'setpw', device: device(4), token, password: 'short' });
  const set = await acct({ action: 'setpw', device: device(4), token, password: 'a-good-long-password' });
  const twice = await acct({ action: 'setpw', device: device(5), token, password: 'another-long-password' });
  const now = await acct({ action: 'login', device: device(6), name: 'Nina', password: 'a-good-long-password' });
  check('the link: a password too short is refused and the link still stands; a good one is kept, the browser that opened the link is signed in, and the link is spent',
    short.status === 400 && set.status === 200 && set.body?.account?.name === 'Nina' && !set.body.account.passwordless && !set.body.account.invited && set.body.account.devices === 2 && twice.status === 403 && now.status === 200 && now.body?.account?.name === 'Nina', `${short.status} ${set.status} ${twice.status} ${now.status}`);
  const forged = await acct({ action: 'setpw', device: device(7), token: token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), password: 'a-good-long-password' });
  check('a link that was touched opens nothing', forged.status === 403, JSON.stringify(forged.body));

  // ---- the other way to a first password: the code "Forgot the password" sends
  const lea = await acct({ action: 'join', device: device(10), name: 'Lea', email: 'lea@example.org' });
  await acct({ action: 'logout', device: device(10) });
  await wait(100);
  // (a code is not mailed twice in two minutes to one account: the invitation was the first — so the limit is what answers)
  const asked = await acct({ action: 'mailcode', device: device(11), name: 'Lea' });
  check('an account without a password can ask for a code as any other (the answer never tells)', lea.status === 200 && asked.status === 200 && asked.body?.ok === true, `${lea.status} ${asked.status}`);

  // ---- signing in with Google
  const ada = await trip('ada'), none = await acct({ action: 'google', device: device(20), claim: ada });
  check('with Google, the first time: when a name has to be chosen, what stands before the @ of the address (and before its +) is offered', none.status === 409 && none.body?.needName === true && none.body.suggest === 'ada_lovelace', JSON.stringify(none.body));
  const squat = await acct({ action: 'create', device: device(21), name: 'ada_lovelace', password: 'a-long-password' });
  const next = await acct({ action: 'google', device: device(20), claim: ada, name: 'ada_lovelace' });
  check('…and when somebody has that name: said, with another to offer', squat.status === 200 && next.status === 409 && next.body?.needName === true && /taken/.test(next.body.error) && next.body.suggest === 'ada_lovelace2', JSON.stringify(next.body));
  const kept = await acct({ action: 'google', device: device(20), claim: ada, name: next.body?.suggest });
  check('the name offered, taken as it is: the account is made', kept.status === 200 && kept.body?.created === true && kept.body.account?.name === 'ada_lovelace2', JSON.stringify(kept.body));
  const bob0 = await acct({ action: 'create', device: device(30), name: 'Bobby', password: 'a-long-password', email: 'bob@example.org' });
  const bob = await trip('bob'), same = await acct({ action: 'google', device: device(31), claim: bob, name: 'Robert' });
  check('with Google, an address that is already the address of an account: nothing is made and nothing is joined — the account is named, and how to get in',
    bob0.status === 200 && same.status === 409 && same.body?.same === 'Bobby' && !same.body.needName && /Sign in to it/.test(same.body.error), JSON.stringify(same.body));
  const bobIn = await acct({ action: 'google', device: device(30), claim: bob });
  check('…and from the browser that is signed in to it, the same Google is added to it', bobIn.status === 200 && bobIn.body?.created === false && bobIn.body.account?.name === 'Bobby' && bobIn.body.account.google === true, JSON.stringify(bobIn.body));
  const text = fs.readFileSync(store, 'utf8');
  check('what is kept: the address of each account, once, and which account it is — no password, no link', /"mail:nina@example\.org"/.test(text) && /"mail:carl@example\.org"/.test(text) && !/a-good-long-password/.test(text) && !text.includes(token), '');
} catch (err) {
  check('the checks ran to the end', false, String(err?.stack || err).slice(0, 400));
} finally {
  server.kill();
  fake.close();
  fs.rmSync(store, { force: true }); fs.rmSync(mails, { force: true });
}
const failed = results.filter((r) => !r).length;
if (failed && log) console.log('server output:\n' + log.slice(-1500));
console.log(`\n${results.length - failed}/${results.length} checks passed`);
