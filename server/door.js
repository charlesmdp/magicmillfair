// The door of the fair: which room a visitor is sent to (rooms.js decides), the list of the rooms for whoever
// wants to change, and the settings of it all. The Node server and the notebook of the Worker both answer
// through doorRoute(); both also ask knock() before a connection enters a room.
//
//   GET  /api/door?want=&back=&not=a,b   → { room, label, why, full?, gone?, closed?, pass? }
//        want: a room asked for by its name (a friend's link) · back: the room one was in a moment ago (a
//        refresh, a new version) · not: rooms that have just said they were full
//        full: the room that was asked for and had no room · gone: the common room asked for is no more ·
//        closed: that name is not a room one may open (see `freeRooms` below) · pass: for the owner, a note
//        that is good for a minute and lets them into that room even when it is full
//   GET  /api/rooms                       → { rooms: [{ name, label, players, quiet? }], max }   the common rooms, for anybody;
//        an administrator (their key with the request) gets every room — [{ name, label, players, old, phase? }] —
//        with { players, old, build, rules, base }
//   POST /api/rooms/rules { max, open, start, low, merge } | { reset: true }   the owner: the settings of the door
//
// What is per room: who one sees, the chat, the gestures, the big red button. What is common to all: the
// boards of scores, the shop and the accounts, the sponsors and the plaques, what is released, a word from
// the owner, the figures.
//
// What the host provides (ctx), besides what routes.js lists:
//   directory()         the rooms as rooms.js keeps them, as fresh as the host can make them
//   keep(structure)     optional: the directory has changed (`structure`: a room came, went, or changed phase)
//   tell(room, message) optional: says something to one room (the offer made to a room gone quiet: {t:'quiet'})
//   maxPlayers          the most a room may hold, as the host was started (MAX_PLAYERS): the owner's `max`
//                       can be lower, never higher
//   settleLater()       optional: a host that hears from its rooms a few seconds late (the Worker) puts them in
//                       order itself, once every room that changed has said so — here nothing is done at once
//
// The release switch `freeRooms` (src/app/config.js): off — as the fair is delivered — only the common rooms
// exist, for everybody but the owner; switched on, any name written in the address is a room of its own.
import { allowed } from './api.js';
import { cleanRoom } from './protocol.js';
import { sign, verify } from './token.js';
import { readRelease, releaseNews } from './release.js';
import { ROOM_RULES, cleanRules, assign, tidy, openRooms, allRooms, commonIndex, roomLabel } from './rooms.js';

const KEY = 'rooms:rules';
const PASS_MS = 60_000; // how long the owner's note is good for
const out = (status, body, headers = {}) => ({ status, body, headers });
const asked = (s) => (typeof s === 'string' && s.trim() ? cleanRoom(s) : '');

/** The rules as the host starts with them (its MAX_PLAYERS over the defaults). */
export const baseRules = (ctx) => cleanRules({}, { ...ROOM_RULES, ...(Number.isFinite(ctx.maxPlayers) && { max: ctx.maxPlayers }) });
/** The rules of the door as they stand: what the owner set, over what the host was started with. */
export async function roomRules(ctx) {
  const base = baseRules(ctx), kept = await ctx.store.get(KEY);
  const rules = cleanRules(kept, base);
  // (the owner's `max` only lowers what the host allows)
  return rules.max > base.max ? cleanRules({ ...kept, max: base.max }, base) : rules;
}

/** The same, when a request gives the occasion: at once where the host knows its rooms exactly, a little later where it is told late. */
const settleSoon = (ctx, dir, rules, now) => (ctx.settleLater ? ctx.settleLater() : settle(ctx, dir, rules, now));

/** Puts the rooms in order and offers another room to those of a room gone quiet (see rooms.js: tidy). */
export async function settle(ctx, dir, rules, now = ctx.now()) {
  dir ||= await ctx.directory(); rules ||= await roomRules(ctx);
  const gone = tidy(dir, rules, now);
  if (gone.length) {
    await ctx.keep?.(true);
    if (ctx.tell) await Promise.all(gone.map((q) => Promise.resolve().then(() => ctx.tell(q.name, { t: 'quiet', to: q.to, n: q.n })).catch(() => {})));
  }
  return gone;
}

/**
 * A connection asks to enter `room` (with `pass`, the owner's note, when it has one). → { max: how many the
 * room may hold, pass: the note is good — this connection gets in even when the room is full —, closed: that
 * name is not a room one may open }.
 */
export async function knock(ctx, { room, pass }) {
  const now = ctx.now(), rules = await roomRules(ctx);
  let owner = false;
  if (typeof pass === 'string' && pass) { const p = await verify(await ctx.secret(), pass); owner = !!p && p.o === 1 && p.r === room && Number.isFinite(p.x) && p.x > now; }
  const closed = !owner && !commonIndex(room) && (await readRelease(ctx)).release.freeRooms === false;
  return { max: rules.max, pass: owner, closed };
}

/** The paths above. `owner`: the owner's own key came with the request. Returns an answer, or null for another path. */
export async function doorRoute(req, ctx, owner) {
  const { method, path, query, body } = req, now = ctx.now();
  if (path !== '/api/door' && path !== '/api/rooms' && path !== '/api/rooms/rules') return null;
  const reading = method === 'GET' || method === 'HEAD';

  if (path === '/api/rooms/rules') {
    if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (!owner) return out(403, { error: 'Only the owner sets the rules of the rooms.' });
    if (!body || typeof body !== 'object') return out(400, { error: 'Nothing to change.' });
    const base = baseRules(ctx);
    if (body.reset === true) await ctx.store.delete(KEY);
    else {
      const kept = (await ctx.store.get(KEY)) || {}, next = {};
      for (const k of Object.keys(ROOM_RULES)) { const v = Object.hasOwn(body, k) ? body[k] : kept[k]; if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) next[k] = Number(v); }
      if (!Object.keys(next).length) return out(400, { error: 'Nothing to change.' });
      // (kept as they will be read: within reason, in an order that makes sense, never above what the host allows)
      const clean = cleanRules({ ...next, ...(next.max > base.max && { max: base.max }) }, base);
      await ctx.store.put(KEY, Object.fromEntries(Object.keys(next).map((k) => [k, clean[k]])));
    }
    const rules = await roomRules(ctx);
    await settleSoon(ctx, null, rules, now);
    return out(200, { rules, base });
  }

  if (!reading) return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
  const rules = await roomRules(ctx), dir = ctx.directory ? await ctx.directory() : { rooms: {} };

  if (path === '/api/rooms') {
    if (!req.admin) return out(200, { rooms: openRooms(dir), max: rules.max });
    const rooms = allRooms(dir);
    return out(200, { rooms, players: rooms.reduce((sum, r) => sum + r.players, 0), old: rooms.reduce((sum, r) => sum + (r.old || 0), 0), build: (await releaseNews(ctx)).build, rules, base: baseRules(ctx) });
  }

  // the door itself
  if (!allowed(ctx.limiter, 'door', req.client, now)) return out(429, { error: 'Too many requests.' }, { 'Retry-After': '30' });
  let want = asked(query.get('want')), back = asked(query.get('back')), closed = '';
  const not = String(query.get('not') || '').split(',').map(asked).filter(Boolean).slice(0, 12);
  if (!owner && (await readRelease(ctx)).release.freeRooms === false) {
    // (only the common rooms exist: another name is not a room)
    if (want && !commonIndex(want)) { closed = want; want = ''; }
    if (back && !commonIndex(back)) { closed ||= back; back = ''; }
  }
  await settleSoon(ctx, dir, rules, now);
  const a = assign(dir, rules, { want, back, not, owner }, now);
  await ctx.keep?.(a.why === 'new');
  return out(200, {
    room: a.room, label: roomLabel(a.room), why: a.why,
    ...(a.full && { full: a.full, fullLabel: roomLabel(a.full) }), ...(a.gone && { gone: a.gone, goneLabel: roomLabel(a.gone) }), ...(closed && { closed }),
    // (the owner always gets in: a note for that room, good for a minute — the key itself never goes in an address)
    ...(owner && { pass: await sign(await ctx.secret(), { o: 1, r: a.room, x: now + PASS_MS }) }),
  });
}
