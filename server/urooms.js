// Rooms that players make for themselves. Built, and delivered switched off: while the release switch
// `userRooms` (src/app/config.js) is off, nothing here answers — no path, no room, nothing sold.
//
// A room of one's own is bought in the shop, by the month (catalog.js: 'room'), from a browser that is signed
// in to an account: one room for an account. It is reached by its link only (?room=own-xxxxxxxx: it is in no
// list), holds fifty, and is kept — its name, its owner, its password, its boards of scores — even when
// nobody is in it. No sky village hangs over it: those are the common rooms' (the page sees to that).
//
//   GET  /api/myroom?device=…   → { room: null | { id, name, locked, state: 'live' | 'asleep', since, until?,
//                                 managed }, price }   (`price`: what a room costs a month, in cents)
//   POST /api/myroom { device, name?, password?, reset? }   its owner: a new name, a password ('' : none any
//                                 more), its boards emptied (reset: true)   → { room }
//   POST /api/room/enter { room, device, password? }
//        → { room, label, ticket, member, host, max, locked }
//        401 { locked: true, wrong? }   it has a password: none was given, or not the right one
//        404                            there is no such room · 423 { asleep: true, until }   it is asleep
//   GET  /api/urooms            an administrator: every room, [{ id, name, owner, state, since, until?, locked }]
//
// Getting in. The password of a room is kept as those of the accounts are (never as it was typed), and never
// travels in an address: it is exchanged here for a `ticket` — a note signed for that browser and that room,
// good for a minute — and the relay lets nobody into a room of this kind without one (door.js: knock). Its
// owner needs no password. With the ticket comes a `member` note, good for twelve hours: a score made in the
// room goes on the room's own boards with it (routes.js) — and on the world's, as any score does. Ten wrong
// passwords in a row close the door of a room for a quarter of an hour (its owner still gets in).
//
// Its owner (the account that pays for it) may rename it, set or remove its password, empty its boards, and
// put a visitor out (the relay: protocol.js — whoever is put out stays out for an hour).
//
// When the subscription ends (Stripe says so: shop.js) the room falls asleep: nobody gets in, nothing is lost.
// Thirty days later it is freed: its name, its boards. Paying again in the meantime wakes it as it was.
//
// Kept: `urooms` → { <id>: { o: owner (lower case), s: 'live' | 'asleep', z: when it fell asleep } } (which
// rooms there are); `uroom:<id>` → { id, name, owner, since, sub, customer, state, asleep, pw: { salt, hash } |
// null, fails, lock }; `uboard:<id>:<board>` → the boards of a room (as `board:<board>`: scores.js);
// `sub:<subscription>` → { room } (so that its end finds the room).
import { allowed } from './api.js';
import { readRelease } from './release.js';
import { accountOf, keepSecret, isSecret } from './accounts.js';
import { sign, verify } from './token.js';
import { BOARDS } from './scores.js';

/** How many a room holds, how long it sleeps before it is freed, how long a ticket and a member's note last (ms). */
export const USER_ROOM = { max: 50, sleep: 30 * 86_400_000, ticket: 60_000, member: 12 * 3600_000 };
const KEY = 'urooms', FAILS = 10, LOCK = 15 * 60_000;
const DEVICE = /^[A-Za-z0-9_-]{16,64}$/;
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // (nothing that is mistaken for something else when read aloud)
const out = (status, body, headers = {}) => ({ status, body, headers });

/** Is that the name of a room of this kind (whether there is one or not)? */
export const isUserRoom = (name) => /^own-[a-z0-9]{8}$/.test(String(name || ''));
/** Are the rooms of the players switched on? */
export const userRoomsOn = async (ctx) => (await readRelease(ctx)).release.userRooms === true;
const newId = () => `own-${[...crypto.getRandomValues(new Uint8Array(8))].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;
/** The name of a room, as it is shown: one line, no markup, at most 28 characters. */
export const cleanRoomName = (text) => String(text ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28);
const goodPassword = (p) => typeof p === 'string' && p.length >= 4 && p.length <= 60;

const emptyBoards = async (ctx, id) => { for (const b of Object.keys(BOARDS)) await ctx.store.delete(`uboard:${id}:${b}`); };

/** Which rooms there are — those that have slept for thirty days are freed first: their record, their boards. */
async function indexOf(ctx) {
  const idx = (await ctx.store.get(KEY)) || {}, now = ctx.now();
  let changed = false;
  for (const [id, e] of Object.entries(idx)) {
    if (e.s !== 'asleep' || now - (e.z || 0) < USER_ROOM.sleep) continue;
    await emptyBoards(ctx, id);
    await ctx.store.delete(`uroom:${id}`);
    delete idx[id];
    changed = true;
  }
  if (changed) await ctx.store.put(KEY, idx);
  return idx;
}

/** The record of a room that exists (asleep or not), or null. */
export async function userRoom(ctx, id) {
  if (!isUserRoom(id)) return null;
  const rec = (await ctx.store.get(`uroom:${id}`)) || null;
  // (asleep for thirty days: it is no more — the next look at the list frees it)
  return rec && rec.state === 'asleep' && ctx.now() - (rec.asleep || 0) >= USER_ROOM.sleep ? null : rec;
}

/** The room an account pays for (its record), or null. */
export async function roomOfAccount(ctx, account) {
  const idx = await indexOf(ctx), key = String(account || '').toLowerCase(), id = Object.keys(idx).find((k) => idx[k].o === key);
  return id ? (await ctx.store.get(`uroom:${id}`)) || null : null;
}

/**
 * A room was paid for (shop.js, on Stripe's word): made for that account — or woken as it was, when the account
 * had one asleep. `sub`, `customer`: the subscription and who pays, at Stripe. Returns its record (null: no account).
 */
export async function openRoom(ctx, account, sub = '', customer = '') {
  if (typeof account !== 'string' || !account) return null;
  const now = ctx.now(), idx = await indexOf(ctx), key = account.toLowerCase();
  let id = Object.keys(idx).find((k) => idx[k].o === key), rec = id ? await ctx.store.get(`uroom:${id}`) : null;
  if (rec && rec.sub && rec.sub !== sub) await ctx.store.delete(`sub:${rec.sub}`);
  if (!rec) {
    do { id = newId(); } while (idx[id]);
    rec = { id, name: cleanRoomName(`${account}'s room`), owner: account, since: now, pw: null, fails: 0, lock: 0 };
  }
  rec = { ...rec, sub: typeof sub === 'string' ? sub : '', customer: typeof customer === 'string' ? customer : '', state: 'live', asleep: 0 };
  await ctx.store.put(`uroom:${id}`, rec);
  idx[id] = { o: key, s: 'live', z: 0 };
  await ctx.store.put(KEY, idx);
  if (rec.sub) await ctx.store.put(`sub:${rec.sub}`, { room: id, at: now });
  return rec;
}

/** The subscription of a room has ended: it falls asleep (kept for thirty days). True when a room fell asleep. */
export async function sleepRoom(ctx, id) {
  const rec = await userRoom(ctx, id);
  if (!rec || rec.state === 'asleep') return false;
  const now = ctx.now(), idx = (await ctx.store.get(KEY)) || {};
  if (rec.sub) await ctx.store.delete(`sub:${rec.sub}`);
  await ctx.store.put(`uroom:${id}`, { ...rec, state: 'asleep', asleep: now, sub: '' });
  idx[id] = { o: rec.owner.toLowerCase(), s: 'asleep', z: now };
  await ctx.store.put(KEY, idx);
  return true;
}

/** Somebody asks to enter a room: the ticket and what goes with it, or why not (see the top of this file). */
export async function enterRoom(ctx, { room, device, password }) {
  const rec = await userRoom(ctx, room), now = ctx.now();
  if (!rec) return out(404, { error: 'There is no such room.' });
  if (rec.state !== 'live') return out(423, { error: 'This room is asleep: nobody pays for it any more.', asleep: true, until: (rec.asleep || now) + USER_ROOM.sleep });
  const acct = await accountOf(ctx.store, device), host = !!acct && acct.name.toLowerCase() === rec.owner.toLowerCase();
  if (rec.pw && !host) {
    if (rec.lock > now) return out(429, { error: 'Too many wrong passwords: the door of this room is closed for a quarter of an hour.', locked: true }, { 'Retry-After': String(Math.ceil((rec.lock - now) / 1000)) });
    if (typeof password !== 'string' || !password) return out(401, { error: 'This room has a password.', locked: true, label: rec.name });
    if (!(await isSecret(password, rec.pw))) {
      const fails = (rec.fails || 0) + 1;
      await ctx.store.put(`uroom:${room}`, { ...rec, fails: fails >= FAILS ? 0 : fails, lock: fails >= FAILS ? now + LOCK : 0 });
      return out(401, { error: 'Not the password of this room.', locked: true, wrong: true, label: rec.name });
    }
    if (rec.fails) await ctx.store.put(`uroom:${room}`, { ...rec, fails: 0, lock: 0 });
  }
  const secret = await ctx.secret();
  return out(200, {
    room, label: rec.name, host, max: USER_ROOM.max, locked: !!rec.pw,
    ticket: await sign(secret, { u: 1, r: room, d: device, ...(host && { h: 1 }), x: now + USER_ROOM.ticket }),
    member: await sign(secret, { m: 1, r: room, d: device, x: now + USER_ROOM.member }),
  });
}

/**
 * What the door makes of a ticket for that room and that browser: { room: there is such a room, awake · ok: the
 * ticket is good · host: it is its owner's }.
 */
export async function ticketFor(ctx, room, dev, ticket) {
  const rec = await userRoom(ctx, room);
  if (!rec || rec.state !== 'live') return { room: false, ok: false, host: false };
  const p = typeof ticket === 'string' && ticket ? await verify(await ctx.secret(), ticket) : null;
  const ok = !!p && p.u === 1 && p.r === room && p.d === dev && Number.isFinite(p.x) && p.x > ctx.now();
  return { room: true, ok, host: ok && p.h === 1 };
}

/** Is this the note of a member of that room (see `member` above), for that browser — and is the room awake? */
export async function memberOf(ctx, room, dev, note) {
  if (!isUserRoom(room) || !(await userRoomsOn(ctx))) return false;
  const p = typeof note === 'string' && note ? await verify(await ctx.secret(), note) : null;
  if (!p || p.m !== 1 || p.r !== room || p.d !== dev || !(p.x > ctx.now())) return false;
  const rec = await userRoom(ctx, room);
  return !!rec && rec.state === 'live';
}

const shown = (rec) => ({ id: rec.id, name: rec.name, locked: !!rec.pw, state: rec.state, since: rec.since, ...(rec.state === 'asleep' && { until: (rec.asleep || 0) + USER_ROOM.sleep }), managed: !!rec.customer });

/** The paths above. `price`: what a room costs (catalog.js). Returns an answer, or null for another path — or while the switch is off. */
export async function uroomsRoute(req, ctx, price = 0) {
  const { method, path, query, body } = req;
  if (path !== '/api/myroom' && path !== '/api/room/enter' && path !== '/api/urooms') return null;
  if (!(await userRoomsOn(ctx))) return null; // (switched off: as if these paths did not exist)
  const now = ctx.now(), reading = method === 'GET' || method === 'HEAD';
  const limited = (name) => !allowed(ctx.limiter, name, req.client, now);
  const busy = out(429, { error: 'Too many requests.' }, { 'Retry-After': '60' });

  if (path === '/api/urooms') {
    if (!req.admin) return out(403, { error: 'Forbidden.' });
    if (!reading) return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
    const rooms = [];
    for (const id of Object.keys(await indexOf(ctx))) { const rec = await ctx.store.get(`uroom:${id}`); if (rec) rooms.push({ ...shown(rec), owner: rec.owner }); }
    return out(200, { rooms: rooms.sort((a, b) => b.since - a.since), max: USER_ROOM.max });
  }

  if (path === '/api/room/enter') {
    if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (limited('enter')) return busy;
    if (!body || !isUserRoom(body.room) || !DEVICE.test(body.device || '')) return out(400, { error: 'Not a room.' });
    return enterRoom(ctx, { room: body.room, device: body.device, password: body.password });
  }

  // the room of the account this browser is signed in to
  const device = reading ? query.get('device') || '' : body?.device;
  if (!DEVICE.test(device || '')) return out(400, { error: 'Not a browser of the game.' });
  const acct = await accountOf(ctx.store, device);
  let rec = acct ? await roomOfAccount(ctx, acct.name) : null;
  if (reading) return out(200, { room: rec ? shown(rec) : null, price, account: !!acct });
  if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD, POST' });
  if (limited('myroom')) return busy;
  if (!acct) return out(403, { error: 'Sign in first.' });
  if (!rec) return out(404, { error: 'You have no room.' });
  const next = { ...rec };
  if (body.name !== undefined) {
    const name = cleanRoomName(body.name);
    if (name.length < 2) return out(400, { error: 'A name of a few letters is needed.' });
    next.name = name;
  }
  if (body.password !== undefined) {
    if (body.password === '' || body.password === null) next.pw = null;
    else if (!goodPassword(body.password)) return out(400, { error: 'A password is 4 to 60 characters.' });
    else next.pw = await keepSecret(body.password);
    next.fails = 0; next.lock = 0;
  }
  if (body.reset === true) await emptyBoards(ctx, rec.id);
  if (body.name !== undefined || body.password !== undefined) await ctx.store.put(`uroom:${rec.id}`, (rec = next));
  return out(200, { room: shown(rec), ...(body.reset === true && { reset: true }) });
}
