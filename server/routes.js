// The game's small API, as far as it only needs somewhere to keep things: the leaderboards and the notes of the
// runs (scores.js), the visits (how many days in a row a visitor came back), what the administrator may do,
// and what is switched on. The Node server and the notebook of the Cloudflare Worker both answer through
// route(); the characters one talks to (npc.js) call a model and are answered by the hosts themselves.
//
//   GET  /api/status                          → { ok, npc, admin, shop, mail, time, release, refresh, build }   (what is
//                                                configured — no secret —, what is released and which version is online)
//   GET | POST /api/release, POST /api/announce    the switches of what is released, a word to every room (release.js)
//   GET  /api/rooms                           the rooms and how many each holds, for the administrators
//   GET | POST /api/stats, POST /api/stats/set     the game in figures (stats.js)
//   POST /api/visit  { device, tz }           → { days, best, today }             (see visit())
//   GET | POST | DELETE /api/scores, POST /api/run                                 (see scores.js)
//   GET  /api/admin                           → { ok, owner, boards }   (with an administrator's key: Authorization: Bearer …)
//   GET | DELETE /api/admins                  the administrators the owner and the others have named (admins.js)
//   GET  /api/visitors                        where the visitors come from, for the administrators (visitors.js)
//   GET | POST | DELETE /api/bans             the administrator's list of who is kept out (see below)
//   GET | POST /api/account                   an account to keep what was bought and earned (accounts.js)
//
//   the shop and the sponsors: /api/shop, /api/checkout, /api/stripe/webhook, /api/sponsor(s), /api/logo (see shop.js)
//
// req: { method, path, query (URLSearchParams), body (object | null), client (address), admin (boolean: the
//        owner's key came with the request), bearer (the key that came, for those the owner has named),
//        geo ({ cc, city, region } when the host knows where the request comes from),
//        raw (the body as text, for the paths that need it), signature (Stripe's), site (https://the.game) }
// ctx: { store: { get(key), put(key, value), delete(key) } (may be asynchronous), limiter (api.js),
//        secret(): the signing secret of this deployment, flags: { npc, admin, shop, mail }, now(): ms,
//        stripe: what is configured for payments (stripe.js),
//        mail: async ({ to, subject, text, html }) → sends an e-mail, or null where none can be sent (mail.js),
//        build(): the version of the files the host serves, push(message): tells every room (release.js),
//        here(): how many visitors are connected (stats.js),
//        rooms(): [{ name, players, old }] — the rooms that hold somebody (old: on an older version) }
// An answer is { status, body, headers }, or { status, bytes, headers } for a picture.
import { allowed } from './api.js';
import { BOARDS, addScore, cleanScore, removeScore, runFits, topsOf } from './scores.js';
import { randomId, sign, verify } from './token.js';
import { cleanName } from './protocol.js';
import { shopRoute } from './shop.js';
import { adminOf, listAdmins, removeAdmin } from './admins.js';
import { cleanGeo, noteVisit, visitorsReport } from './visitors.js';
import { accountRoute, visitRecord } from './accounts.js';
import { localDay, visit } from './visits.js';
import { readRelease, releaseNews, releaseRoute } from './release.js';
import { statsRoute } from './stats.js';
import { BOARDS as GAME_NAMES } from './catalog.js';

const out = (status, body, headers = {}) => ({ status, body, headers });

export { localDay, visit };

const DEVICE = /^[A-Za-z0-9_-]{16,64}$/, ADDRESS = /^[0-9a-fA-F:.]{2,64}$/;

// --- Who is kept out: by address and by device (the random name a browser gave itself), for a time or for good.
// Kept under one key: { ip: { address: entry }, dev: { device: entry } }, entry = { until (ms, 0 = for good),
// name (as they were called), at }.
const liveBans = (bans, now) => {
  const out = { ip: {}, dev: {} };
  for (const kind of ['ip', 'dev']) for (const [k, e] of Object.entries(bans?.[kind] || {})) if (e && (e.until === 0 || e.until > now)) out[kind][k] = e;
  return out;
};

/** Is this address, or this device, kept out? */
export async function banned(ctx, ip, dev) {
  const bans = await ctx.store.get('bans');
  if (!bans) return false;
  const live = liveBans(bans, ctx.now());
  return (!!ip && Object.hasOwn(live.ip, ip)) || (!!dev && Object.hasOwn(live.dev, dev));
}

/** Keeps an address and / or a device out for `hours` (0: for good). */
export async function addBan(ctx, { ip, dev, name, hours }) {
  const now = ctx.now(), bans = liveBans(await ctx.store.get('bans'), now);
  const h = Math.max(0, Math.min(87600, Number(hours) || 0));
  const entry = { until: h > 0 ? now + h * 3600_000 : 0, name: cleanName(name || ''), at: now };
  let added = 0;
  if (typeof ip === 'string' && ADDRESS.test(ip)) { bans.ip[ip] = entry; added++; }
  if (typeof dev === 'string' && DEVICE.test(dev)) { bans.dev[dev] = entry; added++; }
  if (added) await ctx.store.put('bans', bans);
  return added;
}

async function used(ctx, nonce, expires) {
  // notes already spent, until they would have expired anyway
  const now = ctx.now(), spent = Object.fromEntries(Object.entries((await ctx.store.get('runs:used')) || {}).filter(([, exp]) => exp > now));
  if (Object.hasOwn(spent, nonce)) return true;
  spent[nonce] = expires;
  await ctx.store.put('runs:used', spent);
  return false;
}

export async function route(req, ctx) {
  const { method, path, query, body, client } = req, now = ctx.now();
  const limited = (name) => !allowed(ctx.limiter, name, client, now);
  const busy = out(429, { error: 'Too many requests.' }, { 'Retry-After': '60' });

  if (path === '/api/status') return out(200, { ok: true, ...ctx.flags, time: now, ...(await releaseNews(ctx)) });

  // who is asking: the owner (the host has recognised its key), an administrator the owner or another has
  // named (their key is looked up here), or a visitor
  const owner = !!req.admin;
  if (!owner && req.bearer) req.admin = !!(await adminOf(ctx.store, '', req.bearer));

  // (with the boards of scores — their names, and what a score on each is: the back office lists them)
  if (path === '/api/admin') return req.admin ? out(200, { ok: true, owner, boards: Object.keys(BOARDS).map((id) => ({ id, name: GAME_NAMES[id] || id, unit: BOARDS[id].order !== 'asc' ? 'points' : BOARDS[id].max <= 10_000 ? 'ms' : 'time' })) }) : out(403, { error: 'Forbidden.' });

  if (path === '/api/rooms') {
    // the rooms that hold somebody: how many, and how many of them are still on an older version of the game
    if (!req.admin) return out(403, { error: 'Forbidden.' });
    if (method !== 'GET' && method !== 'HEAD') return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
    const rooms = ((ctx.rooms && (await ctx.rooms())) || []).filter((r) => r.players > 0).sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
    return out(200, { rooms, players: rooms.reduce((sum, r) => sum + r.players, 0), old: rooms.reduce((sum, r) => sum + (r.old || 0), 0), build: (await releaseNews(ctx)).build });
  }

  // what is released, a word to every room (release.js)
  const released = await releaseRoute(req, ctx, owner);
  if (released) return released;
  // (a board of scores can wait for its game to be released: until then it is as if it did not exist)
  const shut = async (board) => { const sw = BOARDS[board]?.release; return !!sw && !(await readRelease(ctx.store)).release[sw]; };

  if (path === '/api/admins') {
    if (!req.admin) return out(403, { error: 'Forbidden.' });
    if (method === 'DELETE') {
      if (!owner) return out(403, { error: 'Only the owner takes the title away.' });
      return out(200, { removed: await removeAdmin(ctx.store, query.get('id') || '') ? 1 : 0, admins: await listAdmins(ctx.store) });
    }
    if (method !== 'GET' && method !== 'HEAD') return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD, DELETE' });
    return out(200, { owner, admins: await listAdmins(ctx.store) });
  }

  if (path === '/api/visitors') {
    if (!req.admin) return out(403, { error: 'Forbidden.' });
    if (method !== 'GET' && method !== 'HEAD') return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
    return out(200, await visitorsReport(ctx.store, now));
  }

  if (path === '/api/bans') {
    if (!req.admin) return out(403, { error: 'Forbidden.' });
    const bans = liveBans(await ctx.store.get('bans'), now);
    if (method === 'POST') {
      if (!(await addBan(ctx, body || {}))) return out(400, { error: 'Nobody to keep out.' });
    } else if (method === 'DELETE') {
      const ip = query.get('ip') || '', dev = query.get('dev') || '';
      const had = (Object.hasOwn(bans.ip, ip) ? (delete bans.ip[ip], 1) : 0) + (Object.hasOwn(bans.dev, dev) ? (delete bans.dev[dev], 1) : 0);
      if (had) await ctx.store.put('bans', bans);
      return out(200, { removed: had });
    } else if (method !== 'GET' && method !== 'HEAD') return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD, POST, DELETE' });
    const live = liveBans(await ctx.store.get('bans'), now);
    return out(200, { bans: ['ip', 'dev'].flatMap((kind) => Object.entries(live[kind]).map(([key, e]) => ({ kind, key, ...e }))) });
  }

  if (path === '/api/visit') {
    if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (limited('visit')) return busy;
    if (!body || !DEVICE.test(body.device || '')) return out(400, { error: 'Not a visit.' });
    const today = localDay(now, body.tz);
    // (the days in a row are those of the account, for a browser that is signed in)
    const record = await visitRecord(ctx.store, body.device), seen = record.seen, next = visit(seen, today);
    // (where from, when the host knows: kept with the visit, and counted for the administrators)
    const geo = cleanGeo(req.geo), first = !seen || seen.day !== next.day;
    if (geo) Object.assign(next, { cc: geo.cc, city: geo.city });
    else if (seen?.cc) Object.assign(next, { cc: seen.cc, city: seen.city || '' });
    if (first || seen.days !== next.days || seen.cc !== next.cc || seen.city !== next.city) await record.save(next);
    await noteVisit(ctx.store, { device: body.device, name: typeof body.name === 'string' ? body.name : '', geo, first }, now);
    return out(200, { days: next.days, best: next.best, today });
  }

  if (path === '/api/run') {
    if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (limited('run')) return busy;
    if (!body || !Object.hasOwn(BOARDS, body.board) || (await shut(body.board))) return out(400, { error: 'Unknown board.' });
    return out(200, { run: await sign(await ctx.secret(), { b: body.board, t: now, n: randomId(9) }) });
  }

  if (path === '/api/scores') {
    if (method === 'GET' || method === 'HEAD') {
      const board = query.get('board') || 'sky';
      if (board === 'all') {
        // every board at once (the game asks for them all when it starts)
        const boards = {};
        for (const id of Object.keys(BOARDS)) if (!(await shut(id))) boards[id] = topsOf(await ctx.store.get(`board:${id}`), now);
        return out(200, { boards });
      }
      if (!Object.hasOwn(BOARDS, board) || (await shut(board))) return out(404, { error: 'Unknown board.' });
      return out(200, { board, ...topsOf(await ctx.store.get(`board:${board}`), now) });
    }
    if (method === 'DELETE') {
      if (!req.admin) return out(403, { error: 'Forbidden.' });
      const board = query.get('board') || '', name = cleanName(query.get('name') || '');
      if (!Object.hasOwn(BOARDS, board)) return out(404, { error: 'Unknown board.' });
      const { state, removed } = removeScore(await ctx.store.get(`board:${board}`), name, now);
      if (removed) await ctx.store.put(`board:${board}`, state);
      return out(200, { board, removed, ...topsOf(state, now) });
    }
    if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD, POST, DELETE' });
    if (limited('scores')) return busy;
    const score = cleanScore(body);
    if (!score || (await shut(score.board))) return out(400, { error: 'Not a score.' });
    const note = await verify(await ctx.secret(), score.run);
    const why = runFits(note, score, now);
    if (why) return out(400, { error: `Not a score: ${why}.` });
    if (await used(ctx, note.n, note.t + BOARDS[score.board].max + 3600_000)) return out(400, { error: 'Not a score: this run was already counted.' });
    const { state, rank, best } = addScore(await ctx.store.get(`board:${score.board}`), score.board, score, now);
    await ctx.store.put(`board:${score.board}`, state);
    return out(200, { board: score.board, ...topsOf(state, now), rank, best });
  }

  // an account, to keep things from one browser to the next (accounts.js)
  const account = await accountRoute(req, ctx, limited);
  if (account) return account;

  // the game in figures (stats.js)
  const stats = await statsRoute(req, ctx);
  if (stats) return stats;

  // the shop, the sponsors (shop.js)
  const shop = await shopRoute(req, ctx);
  if (shop) return shop;

  return out(404, { error: 'Not found.' });
}
