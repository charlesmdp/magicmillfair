// The game's small API, as far as it only needs somewhere to keep things: the leaderboards and the notes of the
// runs (scores.js), the visits (how many days in a row a visitor came back), what the administrator may do,
// and what is switched on. The Node server and the notebook of the Cloudflare Worker both answer through
// route(); the characters one talks to (npc.js) call a model and are answered by the hosts themselves.
//
//   GET  /api/status                          → { ok, npc, admin, shop, mail, time, release, refresh, build }   (what is
//                                                configured — no secret —, what is released and which version is online)
//   GET | POST /api/release, POST /api/announce    the switches of what is released, a word to every room (release.js)
//   GET  /api/door, GET /api/rooms, POST /api/rooms/rules    which room a visitor goes to, the rooms, their rules (door.js)
//   GET | POST /api/stats, POST /api/stats/set     the game in figures (stats.js)
//   POST /api/visit  { device, tz }           → { days, best, today }             (see visit())
//   GET | POST | DELETE /api/scores, POST /api/run                                 (see scores.js)
//   GET  /api/admin                           → { ok, owner, boards }   (with an administrator's key: Authorization: Bearer …)
//   GET | DELETE /api/admins                  the administrators the owner and the others have named (admins.js)
//   GET  /api/visitors                        where the visitors come from, for the administrators (visitors.js)
//   GET | POST | DELETE /api/bans             the administrator's list of who is kept out (see below)
//   GET | POST /api/account                   an account to keep what was bought and earned (accounts.js)
//   GET | POST /api/sales                     the owner alone: everything that was bought, and a payment given back (sales.js)
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
//        later(promise): optional — what goes on once the answer is given (an e-mail leaving), where the host must be told,
//        build(): the version of the files the host serves, push(message): tells every room (release.js),
//        here(): how many visitors are connected (stats.js),
//        directory(), keep(), tell(room, message), maxPlayers: the rooms and their door (door.js) }
// An answer is { status, body, headers }, or { status, bytes, headers } for a picture.
import { allowed } from './api.js';
import { BOARDS, PERIODS, addScore, cleanScore, removeScore, runFits, topsOf, topsWith, wouldRank, wouldEnter } from './scores.js';
import { replayable, replay, agrees } from './replay.js';
import { randomId, sign, verify } from './token.js';
import { cleanName } from './protocol.js';
import { shopRoute, notifyRoute } from './shop.js';
import { adminOf, listAdmins, removeAdmin } from './admins.js';
import { cleanGeo, noteVisit, visitorsReport } from './visitors.js';
import { accountRoute, visitRecord, accountOf, isAccountName } from './accounts.js';
import { googleRoute } from './google.js';
import { localDay, visit } from './visits.js';
import { readRelease, releaseNews, releaseRoute } from './release.js';
import { doorRoute } from './door.js';
import { chatLogRoute } from './chatlog.js';
import { banned, addBan, bansRoute, anyQuiet, keptOut } from './bans.js';
import { statsRoute } from './stats.js';
import { BOARDS as GAME_NAMES, PRICES } from './catalog.js';
import { uroomsRoute, memberOf, userRoom, userRoomsOn, isUserRoom } from './urooms.js';
import { salesRoute } from './sales.js';

const out = (status, body, headers = {}) => ({ status, body, headers });

export { localDay, visit };

const DEVICE = /^[A-Za-z0-9_-]{16,64}$/;

// (who is kept out, and how: bans.js)
export { banned, addBan };

async function used(ctx, nonce, expires) {
  // notes already spent, until they would have expired anyway
  const now = ctx.now(), spent = Object.fromEntries(Object.entries((await ctx.store.get('runs:used')) || {}).filter(([, exp]) => exp > now));
  if (Object.hasOwn(spent, nonce)) return true;
  spent[nonce] = expires;
  await ctx.store.put('runs:used', spent);
  return false;
}

// The boards from before scores belonged to accounts are put away, once: `board0:<id>` (see scores.js).
const ERA = 1, CLAIM_MS = 30 * 60_000;
function newEra(ctx) {
  ctx.era ||= (async () => {
    if (((await ctx.store.get('scores:era')) || {}).v >= ERA) return;
    for (const id of Object.keys(BOARDS)) {
      const old = await ctx.store.get(`board:${id}`);
      if (!old || (await ctx.store.get(`board0:${id}`))) continue;
      await ctx.store.put(`board0:${id}`, old);
      await ctx.store.delete(`board:${id}`);
    }
    await ctx.store.put('scores:era', { v: ERA, at: ctx.now() });
  })().catch((err) => { ctx.era = null; throw err; });
  return ctx.era;
}

export async function route(req, ctx) {
  const { method, path, query, body, client } = req, now = ctx.now();
  const limited = (name) => !allowed(ctx.limiter, name, client, now);
  const busy = out(429, { error: 'Too many requests.' }, { 'Retry-After': '60' });

  if (path === '/api/status') return out(200, { ok: true, ...ctx.flags, time: now, ...(await releaseNews(ctx)) });

  // who is asking: the owner (the host has recognised its key), an administrator the owner or another has
  // named (their key is looked up here), or a visitor
  const owner = !!req.admin;
  req.owner = owner; // (money is given back by the owner alone: shop.js)
  if (!owner && req.bearer) req.admin = !!(await adminOf(ctx.store, '', req.bearer));

  // (with the boards of scores — their names, and what a score on each is: the back office lists them)
  if (path === '/api/admin') return req.admin ? out(200, { ok: true, owner, boards: Object.keys(BOARDS).map((id) => ({ id, name: GAME_NAMES[id] || id, unit: BOARDS[id].unit || (BOARDS[id].order !== 'asc' ? 'points' : BOARDS[id].max <= 10_000 ? 'ms' : 'time') })) }) : out(403, { error: 'Forbidden.' });

  // which room a visitor is sent to, the rooms and how many each holds, the rules of it all (door.js)
  const door = await doorRoute(req, ctx, owner);
  if (door) return door;

  // what is released, a word to every room (release.js)
  const released = await releaseRoute(req, ctx, owner);
  if (released) return released;
  // the rooms that players make for themselves (urooms.js — nothing answers while they are switched off)
  const mine = await uroomsRoute(req, ctx, PRICES.room, PRICES.roomLife);
  if (mine) return mine;
  // (a board of scores can wait for its game to be released: until then it is as if it did not exist)
  const shut = async (board) => { const sw = BOARDS[board]?.release; return !!sw && !(await readRelease(ctx)).release[sw]; };
  // (the version of the game online, in a few characters — '' when the host cannot tell)
  const versionNow = async () => { try { return String((await ctx.build?.()) || '').slice(0, 12); } catch { return ''; } };

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

  // who is kept out — by address, by browser, by account; told so, or in silence (bans.js)
  const kept = await bansRoute(req, ctx);
  if (kept) return kept;
  // what was said in the chat lately, for the administrators (chatlog.js)
  const said = await chatLogRoute(req, ctx, owner);
  if (said) return said;
  // where the owner is told of new sponsors (shop.js)
  const told = await notifyRoute(req, ctx);
  if (told) return told;
  // …and the list of the sales, with their refunds: the owner's alone (sales.js)
  const sales = await salesRoute(req, ctx);
  if (sales) return sales;

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
    // (with the seed of the game: what a game of the booths leaves to chance is drawn from it — the server can
    // then play the game again from what the page wrote down: replay.js)
    // (…and with the version online: a game that began before a delivery and ended after it was played by rules
    // that may have changed since)
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    return out(200, { run: await sign(await ctx.secret(), { b: body.board, t: now, n: randomId(9), s: seed, v: await versionNow() }), seed });
  }

  if (path === '/api/scores' || path === '/api/scores/claim') {
    await newEra(ctx);
    const browser = (d) => (typeof d === 'string' && DEVICE.test(d) ? d : '');
    // (kept out in silence: what they score is theirs to see alone — most of the time nobody is, and nothing is looked up)
    const hushed = async (device) => (await anyQuiet(ctx)) && (await keptOut(ctx, client, device)) === 'quiet';
    const shadowOf = async (device) => (device ? (await ctx.store.get(`shadow:${device}`)) || null : null);

    if (path === '/api/scores/claim') {
      // an account has just been made: the scores of the last half hour, made as a guest, count for it after all
      if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
      if (limited('scores')) return busy;
      const device = browser(body?.device), acct = device ? await accountOf(ctx.store, device) : null;
      if (!acct) return out(403, { error: 'Sign in first.' });
      const hush = await hushed(device), own = hush ? (await shadowOf(device)) || {} : null, claimed = [], boards = {};
      for (const token of Array.isArray(body.claims) ? body.claims.slice(0, 20) : []) {
        const c = typeof token === 'string' ? await verify(await ctx.secret(), token) : null;
        if (!c || c.c !== 1 || !Object.hasOwn(BOARDS, c.b) || !Number.isFinite(c.s) || !(c.x > now) || typeof c.n !== 'string' || (await shut(c.b))) continue;
        if (await used(ctx, `claim:${c.n}`, c.x)) continue;
        if (hush) own[c.b] = addScore(own[c.b], c.b, { name: acct.name, score: c.s }, now).state;
        else {
          await ctx.store.put(`board:${c.b}`, addScore(await ctx.store.get(`board:${c.b}`), c.b, { name: acct.name, score: c.s }, now).state);
          // (made in a room a player made: it counts on the boards of that room as well)
          if (typeof c.r === 'string' && (await userRoomsOn(ctx)) && (await userRoom(ctx, c.r))?.state === 'live') await ctx.store.put(`uboard:${c.r}:${c.b}`, addScore(await ctx.store.get(`uboard:${c.r}:${c.b}`), c.b, { name: acct.name, score: c.s }, now).state);
        }
        if (!claimed.includes(c.b)) claimed.push(c.b);
      }
      if (hush && claimed.length) await ctx.store.put(`shadow:${device}`, own);
      for (const id of claimed) boards[id] = hush ? topsWith(await ctx.store.get(`board:${id}`), own[id], id, now) : topsOf(await ctx.store.get(`board:${id}`), now);
      return out(200, { claimed, boards, name: acct.name });
    }

    if (method === 'GET' || method === 'HEAD') {
      const board = query.get('board') || 'sky', device = browser(query.get('device')), own = await shadowOf(device);
      const from = async (key, id) => { const stored = await ctx.store.get(key); return own?.[id] ? topsWith(stored, own[id], id, now) : topsOf(stored, now); };
      const show = (id) => from(`board:${id}`, id);
      // (asked from a room a player made, with the note of a member: the boards of that room come with the world's)
      // (an administrator — their key with the request — reads the boards of any room a player made)
      const inRoom = (req.admin && isUserRoom(query.get('room'))) || (await memberOf(ctx, query.get('room') || '', device, query.get('member') || '')) ? query.get('room') : '';
      if (board === 'all') {
        // every board at once (the game asks for them all when it starts)
        const boards = {}, theirs = {};
        for (const id of Object.keys(BOARDS)) if (!(await shut(id))) { boards[id] = await show(id); if (inRoom) theirs[id] = await from(`uboard:${inRoom}:${id}`, id); }
        return out(200, { boards, ...(inRoom && { room: { id: inRoom, boards: theirs } }) });
      }
      if (!Object.hasOwn(BOARDS, board) || (await shut(board))) return out(404, { error: 'Unknown board.' });
      return out(200, { board, ...(await show(board)), ...(inRoom && { room: { id: inRoom, ...(await from(`uboard:${inRoom}:${board}`, board)) } }) });
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
    // whose score: that of the account this browser is signed in to — or a guest's, who is on the list of the
    // day only, and never under the name of an account
    const device = browser(body.device), acct = device ? await accountOf(ctx.store, device) : null, guest = !acct;
    const name = acct ? acct.name : score.name;
    if (guest && (await isAccountName(ctx.store, name))) return out(409, { error: 'That name belongs to an account: sign in to play under it, or pick another name.', taken: true });
    if (await used(ctx, note.n, note.t + BOARDS[score.board].max + 3600_000)) return out(400, { error: 'Not a score: this run was already counted.' });
    const stored = await ctx.store.get(`board:${score.board}`), periods = guest ? ['day'] : PERIODS, line = { name, score: score.score };
    // (made in a room a player made — the note of a member came with it: it goes on the boards of that room too)
    const inRoom = (await memberOf(ctx, body.room, device, body.member)) ? body.room : '';
    const roomKey = inRoom ? `uboard:${inRoom}:${score.board}` : '', roomStored = inRoom ? await ctx.store.get(roomKey) : null;
    let added, tops, theirs = null;
    // A game that would enter the first five of one of its lists — the world's, or those of the room it was made
    // in — is played again by the server (replay.js), from
    // the seed of its note and what the page wrote down of the game. A score that does not come out of it is
    // refused without a word — its author sees it on the board, nobody else does — and listed for the owner
    // (GET /api/flagged): a name, a score, the reason. Nothing of the game itself is kept, believed or not.
    let doubt = '';
    if (replayable(score.board) && (wouldEnter(stored, score.board, score.score, periods, 5, now) || (inRoom && wouldEnter(roomStored, score.board, score.score, periods, 5, now)))) {
      let played = null, broke = false;
      try { played = Number.isInteger(note.s) ? replay(score.board, note.s, body.log) : null; } catch { broke = true; }
      if (!agrees(score.board, score.score, played)) {
        doubt = broke ? 'its game could not be played again' : !played ? 'no game came with it' : `played again, it gives ${played.score}${played.over ? '' : ' and does not end'}`;
        if (typeof note.v === 'string' && note.v !== (await versionNow())) doubt += ' (a delivery came during this game: its rules may have changed)';
      }
    }
    if (doubt) {
      const kept = ((await ctx.store.get('flagged')) || []).slice(-39);
      kept.push({ id: randomId(6), board: score.board, name, score: score.score, at: now, why: doubt, guest, ...(inRoom && { room: inRoom }) });
      await ctx.store.put('flagged', kept);
    }
    // (…and a score that is not believed is kept apart like those of a visitor kept out in silence: theirs to see)
    if (doubt || (await hushed(device))) {
      const own = (await shadowOf(device)) || {};
      added = addScore(own[score.board], score.board, line, now, periods);
      if (device) await ctx.store.put(`shadow:${device}`, { ...own, [score.board]: added.state });
      tops = topsWith(stored, added.state, score.board, now);
      added.rank = tops.tops.all.findIndex((e) => e.name.toLowerCase() === name.toLowerCase()) + 1;
      added.day = tops.tops.day.findIndex((e) => e.name.toLowerCase() === name.toLowerCase()) + 1;
      if (inRoom) theirs = topsWith(roomStored, added.state, score.board, now); // (…on the boards of the room as well: theirs to see)
    } else {
      added = addScore(stored, score.board, line, now, periods);
      await ctx.store.put(`board:${score.board}`, added.state);
      tops = topsOf(added.state, now);
      if (inRoom) { const r = addScore(roomStored, score.board, line, now, periods); await ctx.store.put(roomKey, r.state); theirs = { ...topsOf(r.state, now), rank: r.rank, day: r.day }; }
    }
    return out(200, {
      board: score.board, ...tops, rank: added.rank, best: added.best,
      // (a guest: where they stand today, where they would stand with an account — and a note to claim it with)
      ...(guest && { guest: true, day: added.day, would: wouldRank(stored, score.board, score.score, now), claim: await sign(await ctx.secret(), { c: 1, b: score.board, s: score.score, x: now + CLAIM_MS, n: randomId(9), ...(inRoom && { r: inRoom }) }) }),
      // (the boards of the room it was made in)
      ...(theirs && { room: { id: inRoom, ...theirs } }),
    });
  }

  if (path === '/api/flagged') {
    // the scores the server did not believe (see above): the owner looks, then takes each onto its board — or lets it go
    if (!req.admin) return out(403, { error: 'Forbidden.' });
    let kept = (await ctx.store.get('flagged')) || [];
    if (method === 'POST') {
      const one = kept.find((f) => f.id === body?.id);
      if (!one) return out(404, { error: 'No such score.' });
      if (body.accept === true && Object.hasOwn(BOARDS, one.board)) {
        const state = addScore(await ctx.store.get(`board:${one.board}`), one.board, { name: one.name, score: one.score }, now, one.guest ? ['day'] : PERIODS).state;
        await ctx.store.put(`board:${one.board}`, state);
        // (made in a room a player made, if that room is still there: on its boards too)
        if (one.room && (await userRoom(ctx, one.room))?.state === 'live') await ctx.store.put(`uboard:${one.room}:${one.board}`, addScore(await ctx.store.get(`uboard:${one.room}:${one.board}`), one.board, { name: one.name, score: one.score }, now, one.guest ? ['day'] : PERIODS).state);
      }
      kept = kept.filter((f) => f !== one);
      await ctx.store.put('flagged', kept);
    } else if (method !== 'GET' && method !== 'HEAD') return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD, POST' });
    return out(200, { flagged: kept.map((f) => ({ id: f.id, board: f.board, name: f.name, score: f.score, at: f.at, why: f.why, guest: !!f.guest, ...(f.room && { room: true }) })).reverse() });
  }

  // an account, to keep things from one browser to the next (accounts.js)
  const google = await googleRoute(req, ctx, limited);
  if (google) return google;
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
