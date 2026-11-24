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
//   GET  /api/limits                      → { limits: { room, total, minute }, base, on }   an administrator
//   POST /api/limits { room, total, minute } | { reset: true }   the owner: how many connections one address may have
//
// So many connections from one address (a school, a café, a phone network share one): `room` in one room,
// `total` in all of them, `minute` new ones a minute — wide, and the owner's to change (0: no limit of that
// kind). A connection over one of them is told which ({t:'limit',of,max}) and hung up on; the owner is never
// counted. Who is connected from where is counted in memory and written nowhere.
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
//   connections(ip, room)   optional: how many connections that address has — [in that room, in all] — where the
//                       host can count them itself (the Node server: its rooms are in its memory)
//   crowd               …or, where it cannot (the notebook of the Worker): what the rooms said (newCrowd, noteCrowd)
//   addressLimits       false: no limit by address at all (ADDRESS_LIMITS=0: tests that all come from one address)
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
import { keptOut } from './bans.js';
import { itemsOf, holderOf, passLive } from './accounts.js';
import { wardrobeFrom } from './wardrobe.js';

const KEY = 'rooms:rules';
const PASS_MS = 60_000; // how long the owner's note is good for
const out = (status, body, headers = {}) => ({ status, body, headers });
const asked = (s) => (typeof s === 'string' && s.trim() ? cleanRoom(s) : '');

// ---- so many connections from one address
export const ADDRESS_LIMITS = { room: 30, total: 60, minute: 120 };
const LIMITS_KEY = 'door:limits', HELD_MS = 10_000, DEVICE = /^[A-Za-z0-9_-]{16,64}$/;
const whole = (v, d) => (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) ? Math.max(0, Math.min(100_000, Math.floor(Number(v)))) : d);
export const cleanLimits = (kept, base = ADDRESS_LIMITS) => ({ room: whole(kept?.room, base.room), total: whole(kept?.total, base.total), minute: whole(kept?.minute, base.minute) });
/** The limits as they stand (0: no limit of that kind) — null where the host has switched them all off. */
export async function addressLimits(ctx) { return ctx.addressLimits === false ? null : cleanLimits(await ctx.store.get(LIMITS_KEY)); }

/** Who is connected from where, as far as the rooms have said: in memory, written nowhere. */
export const newCrowd = () => ({ rooms: new Map(), held: [] });
/** A room says how many connections each address has in it ({ address: n }). */
export function noteCrowd(crowd, room, by, now) {
  const here = new Map();
  for (const [ip, n] of Object.entries(by && typeof by === 'object' ? by : {})) if (Number.isInteger(n) && n > 0) here.set(ip, n);
  if (here.size) crowd.rooms.set(room, here); else crowd.rooms.delete(room);
  // (those the door let into that room before it said this are in its count — or never came. One who was let in
  // while the word was on its way is missed until the room speaks again: for a moment the limit is a little wide)
  crowd.held = crowd.held.filter((h) => now - h.at < HELD_MS && h.room !== room);
}
/** How many connections an address has: [in that room, in all]. */
export function crowdOf(crowd, ip, room, now) {
  let here = crowd.rooms.get(room)?.get(ip) || 0, all = 0;
  for (const by of crowd.rooms.values()) all += by.get(ip) || 0;
  for (const h of crowd.held) if (h.ip === ip && now - h.at < HELD_MS) { all++; if (h.room === room) here++; }
  return [here, all];
}
const connectionsOf = (ctx, ip, room, now) => (ctx.connections ? ctx.connections(ip, room) : ctx.crowd ? crowdOf(ctx.crowd, ip, room, now) : [0, 0]);

/**
 * What a browser may be seen wearing ({ m, left }: see wardrobe.js) — what it bought, what its account holds, the
 * Game Pass, the free day of the light jetpack. Null where nothing is sold: everything is everybody's.
 */
export async function wardrobeOf(ctx, dev) {
  if (!ctx.stripe?.mode) return null;
  const now = ctx.now();
  if (!DEVICE.test(dev || '')) return wardrobeFrom([], false, now - 365 * 86_400_000, now); // (a browser without a name has nothing)
  const holder = await holderOf(ctx.store, dev);
  return wardrobeFrom(await itemsOf(ctx.store, dev), passLive(holder.pass, now), holder.first, now);
}

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
 * A connection asks to enter `room` — from the address `ip`, the browser `dev`, with `pass` (the owner's note)
 * when it has one. → { banned: kept out, and told so · max: how many the room may hold · pass: the note is good
 * (this connection gets in even when the room is full, and is counted in no limit) · closed: that name is not a
 * room one may open · limit: { of: 'room' | 'total' | 'minute', max } — that address has too many connections
 * already · mute: kept out in silence (bans.js) · wear: what they may be seen wearing (wardrobe.js; null: no check) }.
 */
export async function knock(ctx, { room, pass, ip = '', dev = '' }) {
  const now = ctx.now(), rules = await roomRules(ctx);
  let owner = false;
  if (typeof pass === 'string' && pass) { const p = await verify(await ctx.secret(), pass); owner = !!p && p.o === 1 && p.r === room && Number.isFinite(p.x) && p.x > now; }
  const kept = owner ? '' : await keptOut(ctx, ip, dev);
  if (kept === 'out') return { banned: true, max: rules.max, pass: false, closed: false };
  const closed = !owner && !commonIndex(room) && (await readRelease(ctx)).release.freeRooms === false;
  let limit = null;
  const limits = owner || closed || !ip ? null : await addressLimits(ctx);
  if (limits) {
    const [here, all] = connectionsOf(ctx, ip, room, now);
    if (limits.room && here >= limits.room) limit = { of: 'room', max: limits.room };
    else if (limits.total && all >= limits.total) limit = { of: 'total', max: limits.total };
    else if (limits.minute && !ctx.limiter.allow(`conn:${ip}`, limits.minute, 60_000, now)) limit = { of: 'minute', max: limits.minute };
    else ctx.crowd?.held.push({ ip, room, at: now });
  }
  return { banned: false, max: rules.max, pass: owner, closed, ...(limit && { limit }), ...(kept === 'quiet' && { mute: true }), wear: await wardrobeOf(ctx, dev) };
}

/** The paths above. `owner`: the owner's own key came with the request. Returns an answer, or null for another path. */
export async function doorRoute(req, ctx, owner) {
  const { method, path, query, body } = req, now = ctx.now();
  if (path !== '/api/door' && path !== '/api/rooms' && path !== '/api/rooms/rules' && path !== '/api/limits') return null;
  const reading = method === 'GET' || method === 'HEAD';

  if (path === '/api/limits') {
    if (!req.admin) return out(403, { error: 'Forbidden.' });
    if (method === 'POST') {
      if (!owner) return out(403, { error: 'Only the owner sets the limits.' });
      if (!body || typeof body !== 'object') return out(400, { error: 'Nothing to change.' });
      if (body.reset === true) await ctx.store.delete(LIMITS_KEY);
      else {
        const kept = (await ctx.store.get(LIMITS_KEY)) || {}, next = {};
        for (const k of Object.keys(ADDRESS_LIMITS)) { const v = whole(Object.hasOwn(body, k) ? body[k] : kept[k], undefined); if (v !== undefined) next[k] = v; }
        if (!Object.keys(next).length) return out(400, { error: 'Nothing to change.' });
        await ctx.store.put(LIMITS_KEY, next);
      }
    } else if (!reading) return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD, POST' });
    return out(200, { limits: cleanLimits(await ctx.store.get(LIMITS_KEY)), base: ADDRESS_LIMITS, on: ctx.addressLimits !== false });
  }

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
