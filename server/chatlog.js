// What was said in the chat, for the administrators to read (the page /admin, "Chat"). The relay passes each
// line on as before and forgets it; the host hands it here, and the last lines are kept for a while: who said it
// (the name over their robot), in which room, to whom (those nearby, the whole room, the "important" channel),
// when — and whether it came from somebody kept out in silence, whom nobody else read. Nothing else: no
// address, no browser, no account. What is said to a character (Billy) is not chat and never comes here.
//
//   GET    /api/chatlog?before=<n>&limit=<1…300>   an administrator → { lines: [{ n, t, room, name, text, to, muted, filtered }]
//                                                  (the newest first), more: are there older ones, keeps: { lines, days } }
//   DELETE /api/chatlog                            the owner → { ok } : everything kept is forgotten at once
//
// Kept: `chat` → { head, tail, n, ends: { <page>: when its last line was said } } and `chat:<page>` → the lines
// of that page, [[n, t, room, name, text, flags], …] (flags: 1 nearby, 2 important, 4 muted, 8 the others read it with words hidden). A page holds
// CHAT_KEEP.page lines; the oldest pages go when more than CHAT_KEEP.lines are kept, or when their last line is
// older than CHAT_KEEP.days. The privacy page says so (src/app/legal.js): change both together.
export const CHAT_KEEP = { lines: 5000, days: 14, page: 200 };

const KEY = 'chat', DAY = 86_400_000, NEAR = 1, LOUD = 2, MUTED = 4, HID = 8;
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
    page.push([++meta.n, t, text(room, 64), name, said, (l.near ? NEAR : 0) | (l.important ? LOUD : 0) | (l.muted ? MUTED : 0) | (l.hid ? HID : 0)]);
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

/** The paths above. `owner`: the owner's own key came with the request. Returns an answer, or null for another path. */
export async function chatLogRoute(req, ctx, owner) {
  const { method, path, query } = req;
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
  if (method !== 'GET' && method !== 'HEAD') return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD, DELETE' });
  await (ctx.chatWrites || Promise.resolve());
  const meta = await metaOf(store), limit = Math.max(1, Math.min(300, Math.floor(Number(query.get('limit')) || 200)));
  const before = Math.floor(Number(query.get('before'))) || Infinity, oldest = now - CHAT_KEEP.days * DAY, lines = [];
  let more = false;
  for (let p = meta.head; p >= meta.tail && !more; p--) {
    const page = await store.get(pageKey(p));
    if (!Array.isArray(page)) continue;
    for (let i = page.length - 1; i >= 0; i--) {
      const [n, t, room, name, said, flags] = page[i];
      if (n >= before || t < oldest) continue;
      if (lines.length >= limit) { more = true; break; }
      lines.push({ n, t, room, name, text: said, to: flags & LOUD ? 'important' : flags & NEAR ? 'nearby' : 'everyone', ...(flags & MUTED && { muted: true }), ...(flags & HID && { filtered: true }) });
    }
  }
  return out(200, { lines, more, keeps: { lines: CHAT_KEEP.lines, days: CHAT_KEEP.days } });
}
