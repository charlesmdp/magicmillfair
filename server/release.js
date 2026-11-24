// What is released, and telling everybody. The code of a novelty is delivered switched off; the owner switches
// it on (the page /admin) and every browser is told at once, without a new delivery. This file keeps the
// switches (their names and what they are worth before anybody decided: RELEASE in src/app/config.js), says
// which version of the game is online, and passes on what the owner wants said to every room.
//
//   GET  /api/release            → { release, refresh, build, time }     (anybody: nothing here is secret)
//   POST /api/release  { set: { slide: true, sky: 'soon' }, refresh: true }   the owner only
//                                → the same answer, after the change; every room is told ({t:'r'}, see protocol.js)
//                                (`refresh`: every page is asked to load itself again, at a safe moment)
//   POST /api/announce { text }  an administrator: a line said in every room at once ({t:'say'})
//
// Kept under one key, `release`: { set: { … only what the owner decided … }, refresh: when everybody was last
// asked to refresh (ms) }. What the host provides (ctx): build() → the version of the files it serves ('' when
// it cannot tell), push(message) → tells every room, resolves to how many rooms were told; releaseBase →
// optional: what a switch is worth on this host where nobody decided ({ freeRooms: true } on a test server).
import { RELEASE, cleanRelease } from '../src/app/config.js';
import { cleanChat } from './protocol.js';

const KEY = 'release';
const out = (status, body, headers = {}) => ({ status, body, headers });

/** The switches as they stand ({ release, refresh }): what the owner decided, over what the host and the code say. */
export async function readRelease(ctx) {
  const kept = (await ctx.store.get(KEY)) || {};
  return { release: cleanRelease(kept.set, cleanRelease(ctx.releaseBase)), refresh: Number.isFinite(kept.refresh) ? kept.refresh : 0 };
}

/** What a browser is told about releases and versions: with the status, when it asks, and when something changes. */
export async function releaseNews(ctx) {
  const { release, refresh } = await readRelease(ctx);
  let build = '';
  try { build = String((await ctx.build?.()) || '').slice(0, 40); } catch { build = ''; }
  return { release, refresh, build };
}

/** The message that tells a room (see protocol.js: {t:'r', r: the switches, v: the version online, f: refresh}). */
export const releaseMessage = (news) => ({ t: 'r', r: news.release, v: news.build, f: news.refresh });

/** The paths above. `owner`: the owner's own key came with the request. Returns an answer, or null for another path. */
export async function releaseRoute(req, ctx, owner) {
  const { method, path, body } = req, now = ctx.now();
  if (path === '/api/announce') {
    if (!req.admin) return out(403, { error: 'Forbidden.' });
    if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const text = cleanChat(body?.text);
    if (!text) return out(400, { error: 'Nothing to say.' });
    const rooms = ctx.push ? await ctx.push({ t: 'say', m: text }) : 0;
    return out(200, { said: text, rooms: rooms || 0 });
  }
  if (path !== '/api/release') return null;
  if (method === 'GET' || method === 'HEAD') return out(200, { ...(await releaseNews(ctx)), time: now });
  if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD, POST' });
  if (!owner) return out(403, { error: 'Only the owner decides what is released.' });
  if (!body || typeof body !== 'object') return out(400, { error: 'Nothing to change.' });
  const kept = (await ctx.store.get(KEY)) || {}, set = { ...(kept.set && typeof kept.set === 'object' ? kept.set : {}) };
  if (body.set && typeof body.set === 'object') {
    for (const k of Object.keys(RELEASE)) {
      if (!Object.hasOwn(body.set, k)) continue;
      // (only what is one of its values is taken; what is wrong is refused, not guessed)
      const one = cleanRelease({ [k]: body.set[k] }, { [k]: undefined })[k];
      if (one === undefined) return out(400, { error: `Not a value for "${k}".` });
      set[k] = one;
    }
  }
  const next = { set, refresh: body.refresh === true ? now : Number.isFinite(kept.refresh) ? kept.refresh : 0 };
  await ctx.store.put(KEY, next);
  const news = await releaseNews(ctx);
  const rooms = ctx.push ? await ctx.push(releaseMessage(news)) : 0;
  return out(200, { ...news, time: now, rooms: rooms || 0 });
}
