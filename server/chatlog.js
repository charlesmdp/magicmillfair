// What was said in the chat, for the administrators to read (the page /admin, "Chat"). The relay passes each
// line on as before and forgets it; the host hands it here, and the last lines are kept for a while: who said it
// (the name over their robot), in which room, to whom (those nearby, the whole room, the "important" channel),
// when — and whether it came from somebody kept out in silence, whom nobody else read. Kept apart with each line,
// and never shown — not even to the administrators —: the browser and the address it came from, so that an
// administrator can put its author out, or keep them out, from the line itself. They go with the line (a ban made
// from it keeps them, unseen, until it is lifted: bans.js). What is said to a character (Billy) is not chat and
// never comes here.
//
//   GET    /api/chatlog?before=<n>&limit=<1…300>   an administrator → { lines: [{ n, t, room, name, text, to, muted, filtered,
//                                                  by ('admin' | 'owner': who said it), act (it can be acted upon) }]
//                                                  (the newest first), more: are there older ones, keeps: { lines, days } }
//   POST   /api/chatlog { n, act, hours, quiet, address }   an administrator, about the author of line n:
//                                                  act 'kick' → put out at once (they may come back: { out });
//                                                  'move' → sent back to the common rooms, not back in that room
//                                                  for an hour (a room of its own only); 'ban' → kept out, by their
//                                                  browser (and the account it is signed in to; their address too
//                                                  with `address`), for `hours` (0: for good), told so at once — or
//                                                  in silence (`quiet`). Never the owner.
//   DELETE /api/chatlog                            the owner → { ok } : everything kept is forgotten at once
//
// Kept: `chat` → { head, tail, n, ends: { <page>: when its last line was said } } and `chat:<page>` → the lines
// of that page, [[n, t, room, name, text, flags, who?], …] (flags: 1 nearby, 2 important, 4 muted, 8 the others
// read it with words hidden, 16 said by an administrator, 32 by the owner; who: [browser, address, relay id, when
// they arrived]). A page holds CHAT_KEEP.page lines; the oldest pages go when more than CHAT_KEEP.lines are kept,
// or when their last line is older than CHAT_KEEP.days. The privacy page says so (src/app/legal.js): change both
// together.
export const CHAT_KEEP = { lines: 5000, days: 14, page: 200 };

import { addBan } from './bans.js';
import { accountOf } from './accounts.js';
import { commonIndex } from './rooms.js';

const KEY = 'chat', DAY = 86_400_000, NEAR = 1, LOUD = 2, MUTED = 4, HID = 8, ADMIN = 16, OWNER = 32;
/** Who said a line, as it is kept with it (never shown): [browser, address, relay id, when they arrived] — or null. */
const whoOf = (l) => {
  const d = typeof l?.dev === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(l.dev) ? l.dev : '', i = typeof l?.ip === 'string' && /^[0-9a-fA-F:.]{2,64}$/.test(l.ip) ? l.ip : '';
  return d || i || Number.isInteger(l?.id) ? [d, i, Number.isInteger(l?.id) ? l.id : 0, Number.isFinite(l?.since) ? l.since : 0] : null;
};
const out = (status, body, headers = {}) => ({ status, body, headers });
const pageKey = (p) => `${KEY}:${p}`;
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

async function metaOf(store) {
  const m = await store.get(KEY);
  return m && Number.isInteger(m.head) && Number.isInteger(m.tail) ? { head: m.head, tail: m.tail, n: Number.isInteger(m.n) ? m.n : 0, ends: m.ends && typeof m.ends === 'object' ? m.ends : {} } : { head: 0, tail: 0, n: 0, ends: {} };
}

async function append(ctx, room, lines) {
  const store = ctx.store, now = ctx.now(), meta = await metaOf(store);
  let page = (await store.get(pageKey(meta.head))) || [];
  if (!Array.isArray(page)) page = [];
  for (const l of lines) {
    const said = text(l?.text, 240), name = text(l?.name, 40);
    if (!said) continue;
    if (page.length >= CHAT_KEEP.page) { await store.put(pageKey(meta.head), page); meta.head++; page = []; }
    const t = Number.isFinite(l.t) ? l.t : now;
    const who = whoOf(l);
    page.push([++meta.n, t, text(room, 64), name, said, (l.near ? NEAR : 0) | (l.important ? LOUD : 0) | (l.muted ? MUTED : 0) | (l.hid ? HID : 0) | (l.rank === 'owner' ? OWNER : l.rank === 'admin' ? ADMIN : 0), ...(who ? [who] : [])]);
    meta.ends[meta.head] = t;
  }
  await store.put(pageKey(meta.head), page);
  // the oldest pages go: too many lines kept, or lines too old
  const pages = Math.ceil(CHAT_KEEP.lines / CHAT_KEEP.page);
  while (meta.tail < meta.head && (meta.head - meta.tail + 1 > pages || (meta.ends[meta.tail] || 0) < now - CHAT_KEEP.days * DAY)) {
    await store.delete(pageKey(meta.tail));
    delete meta.ends[meta.tail];
    meta.tail++;
  }
  await store.put(KEY, meta);
}

/**
 * Lines said in `room` join the log: [{ t (ms), name, text, near, important, muted }]. One writer at a time: the
 * hosts call this as lines come, and each call waits for the one before it.
 */
export function noteChat(ctx, room, lines) {
  if (!Array.isArray(lines) || !lines.length) return Promise.resolve();
  const next = (ctx.chatWrites || Promise.resolve()).then(() => append(ctx, room, lines.slice(0, 400))).catch((err) => console.error('[chatlog]', String(err?.message || err).slice(0, 160)));
  ctx.chatWrites = next;
  return next;
}

/** The row of line `n`, as it is kept — or null when it is no longer kept. */
async function lineOf(store, n) {
  const meta = await metaOf(store);
  for (let p = meta.head; p >= meta.tail; p--) {
    const page = await store.get(pageKey(p));
    if (!Array.isArray(page) || !page.length || page[0][0] > n) continue;
    return page.find((row) => row[0] === n) || null;
  }
  return null;
}

/** The paths above. `owner`: the owner's own key came with the request. Returns an answer, or null for another path. */
export async function chatLogRoute(req, ctx, owner) {
  const { method, path, query, body } = req;
  if (path !== '/api/chatlog') return null;
  if (!req.admin) return out(403, { error: 'Forbidden.' });
  const store = ctx.store, now = ctx.now();
  if (method === 'DELETE') {
    if (!owner) return out(403, { error: 'Only the owner empties the log.' });
    await (ctx.chatWrites || Promise.resolve());
    const meta = await metaOf(store);
    for (let p = meta.tail; p <= meta.head; p++) await store.delete(pageKey(p));
    await store.put(KEY, { head: meta.head + 1, tail: meta.head + 1, n: meta.n, ends: {} });
    return out(200, { ok: true });
  }
  if (method === 'POST') {
    // an administrator acts on the author of a line: put out, sent back to the common rooms, kept out
    const b = body || {}, act = b.act;
    if (!Number.isInteger(b.n) || !['kick', 'move', 'ban'].includes(act) || (act === 'ban' && !(typeof b.hours === 'number' && Number.isFinite(b.hours) && b.hours >= 0))) return out(400, { error: 'Nothing to do.' });
    await (ctx.chatWrites || Promise.resolve());
    const row = await lineOf(store, b.n);
    if (!row || row[1] < now - CHAT_KEEP.days * DAY) return out(404, { error: 'That line is no longer kept.' });
    const [, , room, name, , flags, who] = row;
    if (flags & OWNER) return out(403, { error: 'That is the owner.' });
    if (!Array.isArray(who)) return out(409, { error: 'That line was said before its author could be acted upon from here.' });
    const [dev, ip, id, since] = who, them = dev ? { dev } : { room, id, since };
    const oust = async (w, how) => Number(await Promise.resolve(ctx.oust?.(w, how)).catch(() => 0)) || 0;
    if (act === 'kick') return out(200, { ok: true, out: await oust(them, 'kick') });
    if (act === 'move') return commonIndex(room) ? out(400, { error: 'That was said in a common room: there is nowhere to send them back to.' }) : out(200, { ok: true, out: await oust({ ...them, room }, 'move') });
    const address = b.address === true && !!ip, quiet = b.quiet === true;
    const acct = dev ? await accountOf(store, dev) : null, devs = (acct?.devices || []).filter((d) => d !== dev);
    // (the ban says which line it came from: what it holds is never shown, and it is lifted as one — bans.js)
    const kept = await addBan(ctx, { ...(dev && { dev }), ...(address && { ip }), name, hours: b.hours, quiet, line: b.n, ...(quiet && { devs }) });
    if (!kept) return out(400, { error: 'Nothing to keep out by: no browser came with that line (tick their address).' });
    if (quiet) { await Promise.resolve(ctx.hush?.({ ip: address ? ip : '', dev, devs }, true)).catch(() => {}); return out(200, { ok: true, out: 0, quiet: true, ...(acct && { account: acct.name }) }); }
    return out(200, { ok: true, out: await oust({ ...them, devs }, 'ban'), ...(acct && { account: acct.name }) });
  }
  if (method !== 'GET' && method !== 'HEAD') return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD, POST, DELETE' });
  await (ctx.chatWrites || Promise.resolve());
  const meta = await metaOf(store), limit = Math.max(1, Math.min(300, Math.floor(Number(query.get('limit')) || 200)));
  const before = Math.floor(Number(query.get('before'))) || Infinity, oldest = now - CHAT_KEEP.days * DAY, lines = [];
  let more = false;
  for (let p = meta.head; p >= meta.tail && !more; p--) {
    const page = await store.get(pageKey(p));
    if (!Array.isArray(page)) continue;
    for (let i = page.length - 1; i >= 0; i--) {
      const [n, t, room, name, said, flags, who] = page[i];
      if (n >= before || t < oldest) continue;
      if (lines.length >= limit) { more = true; break; }
      // (who said it is never sent: only whether an administrator, or the owner, said it — and whether its author can be acted upon)
      lines.push({ n, t, room, name, text: said, to: flags & LOUD ? 'important' : flags & NEAR ? 'nearby' : 'everyone', ...(flags & MUTED && { muted: true }), ...(flags & HID && { filtered: true }), ...(flags & OWNER ? { by: 'owner' } : flags & ADMIN ? { by: 'admin' } : {}), ...(Array.isArray(who) && !(flags & OWNER) && { act: true }) });
    }
  }
  return out(200, { lines, more, keeps: { lines: CHAT_KEEP.lines, days: CHAT_KEEP.days } });
}
