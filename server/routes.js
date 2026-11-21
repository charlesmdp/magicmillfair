// The game's small API, as far as it only needs somewhere to keep things: the leaderboards and the notes of the
// runs (scores.js), the visits (how many days in a row a visitor came back), what the administrator may do,
// and what is switched on. The Node server and the notebook of the Cloudflare Worker both answer through
// route(); the characters one talks to (npc.js) call a model and are answered by the hosts themselves.
//
//   GET  /api/status                          → { ok, npc, admin, shop, time }   (what is configured: no secret)
//   POST /api/visit  { device, tz }           → { days, best, today }             (see visit())
//   GET | POST | DELETE /api/scores, POST /api/run                                 (see scores.js)
//   GET  /api/admin                           → { ok }   (with the administrator's key: Authorization: Bearer …)
//
// req: { method, path, query (URLSearchParams), body (object | null), client (address), admin (boolean) }
// ctx: { store: { get(key), put(key, value), delete(key) } (may be asynchronous), limiter (api.js),
//        secret(): the signing secret of this deployment, flags: { npc, admin, shop }, now(): ms }
import { allowed } from './api.js';
import { BOARDS, addScore, cleanScore, removeScore, runFits, topsOf } from './scores.js';
import { randomId, sign, verify } from './token.js';
import { cleanName } from './protocol.js';

const out = (status, body, headers = {}) => ({ status, body, headers });
const DAY = 86400_000;

/** The calendar day (as a number of days since 1970) at a visitor's place: the server's clock, their time zone. */
export const localDay = (at, tzMinutes) => Math.floor((at - Math.max(-840, Math.min(840, Number(tzMinutes) || 0)) * 60_000) / DAY);

/**
 * A visit: how many days in a row this device has come (1 on the first day), and its longest run ever.
 * `seen` is what was kept ({ day, days, best }) or nothing. Returns the new record.
 */
export function visit(seen, day) {
  const was = seen && Number.isInteger(seen.day) ? seen : null;
  const days = !was ? 1 : day === was.day ? was.days : day === was.day + 1 ? was.days + 1 : day > was.day ? 1 : was.days;
  return { day: was ? Math.max(day, was.day) : day, days, best: Math.max(days, was?.best || 0) };
}

const DEVICE = /^[A-Za-z0-9_-]{16,64}$/;

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

  if (path === '/api/status') return out(200, { ok: true, ...ctx.flags, time: now });

  if (path === '/api/admin') return req.admin ? out(200, { ok: true }) : out(403, { error: 'Forbidden.' });

  if (path === '/api/visit') {
    if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (limited('visit')) return busy;
    if (!body || !DEVICE.test(body.device || '')) return out(400, { error: 'Not a visit.' });
    const key = `visit:${body.device}`, today = localDay(now, body.tz);
    const seen = await ctx.store.get(key), next = visit(seen, today);
    if (!seen || seen.day !== next.day || seen.days !== next.days) await ctx.store.put(key, next);
    return out(200, { days: next.days, best: next.best, today });
  }

  if (path === '/api/run') {
    if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (limited('run')) return busy;
    if (!body || !Object.hasOwn(BOARDS, body.board)) return out(400, { error: 'Unknown board.' });
    return out(200, { run: await sign(await ctx.secret(), { b: body.board, t: now, n: randomId(9) }) });
  }

  if (path === '/api/scores') {
    if (method === 'GET' || method === 'HEAD') {
      const board = query.get('board') || 'sky';
      if (!Object.hasOwn(BOARDS, board)) return out(404, { error: 'Unknown board.' });
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
    if (!score) return out(400, { error: 'Not a score.' });
    const note = await verify(await ctx.secret(), score.run);
    const why = runFits(note, score, now);
    if (why) return out(400, { error: `Not a score: ${why}.` });
    if (await used(ctx, note.n, note.t + BOARDS[score.board].max + 3600_000)) return out(400, { error: 'Not a score: this run was already counted.' });
    const { state, rank, best } = addScore(await ctx.store.get(`board:${score.board}`), score.board, score, now);
    await ctx.store.put(`board:${score.board}`, state);
    return out(200, { board: score.board, ...topsOf(state, now), rank, best });
  }

  return out(404, { error: 'Not found.' });
}
