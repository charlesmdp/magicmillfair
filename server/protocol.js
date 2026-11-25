// The presence relay, independent of where it runs: server/index.js (Node, `ws`) and cloudflare/worker.js
// (a Durable Object) both drive this same Room, so the two can never speak different dialects.
// No authority over the game: every client shares its own avatar state and a room hands those states on.
//
// Protocol (JSON text frames)
//   client → server   {t:'hello',name,color,v:2,dev?,k?,s?,b?,ad?}   {t:'s',p:[x,y,z,yaw],a,f}   {t:'e',e}   {t:'c',m,n?}
//                     (ad: 1 — an administrator who wants it known: once the relay has recognised their key, the
//                     others are told so — `ad` in `join` and in the peers of `welcome` — and show a badge; from
//                     anybody else it changes nothing)
//                     (b: which version of the game the page is — a few letters; the owner is told how many
//                     are still on an older one)
//                     (s: a name the page gave itself when it opened. A page that says hello again — its line
//                     dropped without the relay noticing: a laptop that slept, a change of network — replaces
//                     the connection it had before, so that nobody is ever seen twice)
//                     (k: the "kit" of the avatar — its paint, its trail… one number from 0 to 255, see items.js;
//                     it comes back as `k` in `join` and in the peers of `welcome`, when it is not 0)
//                     {t:'g',b}   a score of mine has just gone on board b (relayed as {t:'g',id,b})
//                     {t:'n'}     the big red button: answered {t:'n',id,wait} to the whole room when it goes
//                                 off (wait: ms before the next one), {t:'n',wait} to the sender when it is too soon
//                     {t:'own'}   something was bought, or given: the relay asks again what this visitor has
//                     (what an avatar shows — colour, kit, look — is brought back to that: see wardrobe.js)
//                     {t:'v',k,n,d}   a thing I steer in a game, which is not my avatar — a boat of the regatta:
//                     its kind (k: 0 to 15, which game), the run it belongs to (n: a whole number — the start
//                     one left with), and up to eight numbers (d: where it is, how it goes — the game knows).
//                     Handed on as {t:'v',id,k,n,d} to those within THING_REACH metres of who steers it
//                     {t:'ping',c}   {t:'admin',key}   and, from an administrator: {t:'who'}   {t:'kick',id}
//                     {t:'ban',id,h,q?} (q: in silence — the visitor stays, and is no longer heard: see below)
//                     {t:'promote',id} (names that visitor an administrator)   {t:'demote',key}
//                     {t:'gift',id} (that visitor has been given something: their game asks the shop again)
//                     (the owner: the administrator whose key has that id is one no more)   {t:'c',m,i:1} (a
//                     line on the "important" channel: relayed to the whole room, marked as such)
//   server → client   {t:'welcome',id,now,tick,idle?,near,blast?:[ms before the button is ready, ms since it went off],
//                     peers:[{id,name,color,p,a,f}]}   {t:'join',id,name,color}
//                     {t:'leave',id}   {t:'u',now,s:[[id,x,y,z,yaw,a,f,age]],g?:[id]}   {t:'e',id,e}   {t:'v',id,k,n,d}
//                     {t:'c',id,m,n?}   {t:'m',p:[id,x,z,…]}   {t:'w',n}   {t:'pong',c,now}   {t:'full'}
//                     {t:'admin',ok,owner?,out?} (out: the title was taken away)   {t:'who',list:[{id,name,ip,ua,dev,since,cc,city,admin}]}
//                     {t:'r',r,v,f}   what is released (r: the switches), the version online (v) and when
//                     every page was last asked to refresh (f) — said to a whole room when the owner changes
//                     something; {t:'say',m}   a word from the fair to every room (server/release.js). A
//                     browser that does not know these two ignores them.
//                     {t:'quiet',to,n}   this room has gone quiet: room `to` holds `n` visitors and has room for
//                     everybody here (the door's offer, see rooms.js — nobody is moved)
//                     {t:'closed'}   said instead of a welcome, before hanging up: that name is not a room one
//                     may open (door.js: the switch freeRooms)
//                     {t:'limit',of,max}   said instead of a welcome, before hanging up: too many connections from
//                     this address already (of: 'room', 'total' or 'minute' — door.js)
//                     {t:'kicked',ban}   {t:'promoted',key,by} (to who has just been named: the key of their
//                     own)   {t:'promoted',id} (to who named them)   {t:'gift',by} (to who was given something:
//                     nothing is given by this message — the shop is, and it only believes the administrator)
//   `color` is a number from 0 to 31 (the last sixteen come with the Game Pass: the shop decides who may wear
//   them, the relay only carries the number); `f`, the look of the avatar, is 16 bits (see packLook).
//   `c` is a chat line: relayed as it comes, never stored, never sent back to its author; with `n` it only goes
//   to those within CHAT_NEAR metres of who says it.
//   `v` is a thing one steers: the relay looks at its shape and at nothing else (whole numbers in their bounds,
//   finite numbers that are not huge — carried to the hundredth), hands on THING_RATE of them a second from
//   one visitor at the most, keeps nothing of it, and tells nobody what a visitor kept out in silence steers.
//   `now` is the relay clock (ms). `age` (ms) tells how long before `now` a state was received: clients rebuild
//   smooth motion from `now - age`. A `join` for an id already known is a rename. `tick` is the batching period
//   (clients need not send faster); `idle`, when present, is how often an unchanged state should be repeated
//   as a keep-alive (0 = never).
//
// A crowd. Up to `near` others, a room simply tells everybody everything. Beyond that each visitor is told in
// detail about the `near` visitors closest to them (within `range` metres): what one receives no longer grows
// with the crowd. `g` lists those who have left that circle (they are no longer drawn); `m`, every couple of
// seconds, gives the whereabouts of everybody for the map; `w` tells a visitor whether anyone is close enough
// to be told about them (nobody: their state may be sent less often).
//
// An administrator is whoever sends a right key (the host checks it: io.admin — the owner's, or the key of
// someone the owner or another administrator has named). They may ask who is there (address, browser, device,
// country), put someone out (kick) or keep them out (ban: the host keeps the list), name another visitor
// administrator (the host draws the key: io.promote), and speak on the "important" channel. Only the owner
// takes the title away, and nobody but the owner puts the owner out.
//
// Kept out in silence (`mute`: the host says so when the connection arrives, or an administrator does it from the
// room). The visitor notices nothing: they play, move and wave as before, and everybody sees them — but what
// they write is relayed to nobody, a score of theirs is announced to nobody, the big red button only goes
// off on their own screen, and what they steer in a game (a boat) is shown to nobody.

import { fitColor, fitKit, fitLook, mayLight, cleanWardrobe, FIREWORK } from './wardrobe.js';

export const MAX_FRAME = 2048; // bytes
export const RATE = 40, BURST = RATE * 2; // messages per second, averaged over 2 s (token bucket)
export const CHAT_MAX = 200; // characters in a chat line
export const CHAT_BURST = 5, CHAT_EVERY = 2000; // chat lines: five in a row, then one every two seconds
export const CHAT_NEAR = 20; // m: how far a line said "to those nearby" carries
export const NEAR = 40, RANGE = 220; // how many others one is told about in detail, and from how far (m)
export const BLAST_EVERY = 15 * 60_000; // ms between two presses of the big red button, for a whole room
export const THING_MAX = 8, THING_LIMIT = 1e7; // a thing one steers ({t:'v'}): how many numbers it is told with, and how large one may be
export const THING_RATE = 8, THING_BURST = 8; // …how many of them a second are handed on from one visitor (eight in a row at the most)
export const THING_REACH = 160; // …and how far from who steers it (m)
const AREA_MS = 400, MAP_MS = 2000; // how often the circles and the map are worked out
const KEY_TRIES = 5; // wrong administrator keys a connection may send
const OUT_MS = 3600_000; // put out of a room by its owner: for this long

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, k) => Math.round(v * k) / k;
export const int = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : 0);

/** Room id: [a-z0-9_-]{1,48}, 'main' when nothing usable is left. */
export const cleanRoom = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48) || 'main';

/** Display name: no control characters or angle brackets, single spaces, at most 16 characters. */
export function cleanName(name) {
  const s = typeof name === 'string' ? name.replace(/\s+/g, ' ').replace(/[\p{C}<>]/gu, '').replace(/ {2,}/g, ' ').trim() : '';
  return [...s].slice(0, 16).join('').trim() || 'Visitor';
}

/** Chat line: one line, no control characters, single spaces, at most CHAT_MAX characters ('' when nothing is left). */
export function cleanChat(text) {
  const s = typeof text === 'string' ? text.replace(/\s+/g, ' ').replace(/\p{C}/gu, '').replace(/ {2,}/g, ' ').trim() : '';
  return [...s].slice(0, CHAT_MAX).join('').trim();
}

/** The random name a browser gives itself (see src/net/Visits.js): '' when it does not look like one. */
export const cleanDevice = (s) => (typeof s === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(s) ? s : '');
/** Which version of the game a page says it is (the short name of a commit); '' when it does not look like one. */
export const cleanBuild = (s) => (typeof s === 'string' && /^[0-9a-f]{4,12}$/.test(s) ? s : '');
/** The name a page gave itself when it opened; '' when it is not one. */
export const cleanSession = (s) => (typeof s === 'string' && /^[A-Za-z0-9_-]{8,32}$/.test(s) ? s : '');

/** Avatar state of an `s` message, bounded and rounded: [x, y, z, yaw, anim, flags], or null when malformed. */
export function cleanState(m) {
  const v = m.p;
  if (!Array.isArray(v) || v.length < 4 || !v.slice(0, 4).every(Number.isFinite)) return null;
  return [
    round(clamp(v[0], -2000, 2000), 100), round(clamp(v[1], -100, 500), 100), round(clamp(v[2], -2000, 2000), 100),
    round(Math.atan2(Math.sin(v[3]), Math.cos(v[3])), 1000), int(m.a, 15), int(m.f, 65535),
  ];
}

/** "https://a.example, https://b.example/" → ['https://a.example', 'https://b.example'] */
export const parseOrigins = (text) => String(text || '').split(',').map((s) => s.trim().toLowerCase().replace(/\/+$/, '')).filter(Boolean);

/**
 * May a page from `origin` open the socket served on `host`? Browsers always send Origin on a WebSocket
 * handshake; other clients can forge it anyway, so none is fine. Without an explicit list: same host, or a
 * local development page.
 */
export function originAllowed(origin, host, allowed = []) {
  origin = String(origin || '').toLowerCase().replace(/\/+$/, '');
  if (!origin) return true;
  if (allowed.length) return allowed.includes('*') || allowed.includes(origin);
  let url;
  try { url = new URL(origin); } catch { return false; }
  return url.host === String(host || '').toLowerCase() || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

export class Room {
  /**
   * @param {object} io what the host provides:
   *   max      players allowed in the room
   *   tick     batching period announced to clients (ms)
   *   idle     optional keep-alive period announced to clients (ms, 0 = none)
   *   near     optional: how many others each player is told about in detail (default NEAR)
   *   range    optional: …and from how far, in metres (default RANGE)
   *   now()    relay clock (ms)
   *   send(connection, text)
   *   drop(connection, code, reason)   close a misbehaving connection (the host then calls remove())
   *   kick(connection, code, reason)   optional: close a connection politely, its last message delivered (default: drop)
   *   busy(connection)                 optional: true when a reader is too slow for disposable states
   *   save(player)                     optional: called when what a newcomer must know about a player changed
   *   id()                             optional: source of player ids (default: 1, 2, 3… per room)
   *   admin(key)                       optional: whose key is this? false, true or 'owner', 'admin', or
   *                                    { rank: 'owner' | 'admin', id } — or a promise of one of these (default: nobody's)
   *   promote({ name, by })            optional: names an administrator; resolves to { key, id } (the key to hand over) or null
   *   ban({ ip, dev, name, hours, quiet })   optional: keep someone out from now on (0 hours: for good; quiet: in silence)
   *   wardrobe(dev)                    optional: what that browser has ({ m, left }, see wardrobe.js; null: nothing
   *                                    is sold, everything is everybody's), or a promise of it
   *   wake()                           optional: something is waiting to be flushed that no message brought
   *   fired(at)                        optional: the big red button went off at `at` (relay clock): a host that
   *                                    forgets its rooms keeps it, and gives it back by setting room.blastAt
   */
  constructor(io) {
    this.io = io;
    this.players = new Map(); // connection → player
    this.nextId = 1;
    this.pending = false; // some state waits for the next flush()
    this.near = Math.max(1, io.near ?? NEAR);
    this.range = io.range ?? RANGE;
    this.crowded = false; // more players than `near`: each is told about those around them only
    this.areaAt = this.mapAt = -1e9; // when the circles and the map were last worked out (relay clock)
    this.moved = this.unmapped = false; // someone has moved since the circles / the map were worked out
  }

  get size() { return this.players.size; }
  /** Players who said hello. */
  get joined() { let n = 0; for (const p of this.players.values()) if (p.joined) n++; return n; }
  /** How many are here, and how many of them are not on version `live` ({ players, old }; nobody is old when `live` is not known). */
  census(live = '') { let players = 0, old = 0; for (const p of this.players.values()) if (p.joined) { players++; if (live && p.build !== live) old++; } return { players, old }; }

  /**
   * A connection arrives. Returns its player, or null when the room is full (the host says so and closes).
   * `known` ({ id, name, color, joined, state, ip, ua, dev, sid, admin, since }) restores a player whose connection
   * outlived the host's memory; `from` ({ ip, ua }) is what the host knows of a new one — with `max` when the
   * door has its own idea of how many the room may hold just now, `pass` for the owner, who always gets in,
   * `wear` (and `dev`, the browser it was read for): what this visitor may be seen wearing — without it nothing
   * is checked —, and `mute` for a visitor who is kept out in silence.
   */
  add(connection, known, from) {
    if (!known && !from?.pass && this.players.size >= (Number.isFinite(from?.max) ? from.max : this.io.max)) return null;
    // (`host`: the owner of this room, when it is a room a player made — urooms.js; `tdev`: the browser the
    // door let in, whatever the page then says of itself)
    const t = this.io.now();
    const p = {
      conn: connection, id: known ? known.id : this.io.id ? this.io.id() : this.nextId, name: 'Visitor', color: 0, kit: 0, joined: false,
      alive: true, tokens: BURST, stamp: t, chat: CHAT_BURST, chatAt: t, things: THING_BURST, thingAt: t,
      state: null, row: '', at: 0, dirty: false, rested: true, // last state, its serialised row, when it came, relay flags
      ver: 0, area: null, sent: null, gone: null, watched: undefined, // (a crowd) version of the state, who they are told about, what was sent
      ip: String((known || from)?.ip || '').slice(0, 64), ua: String((known || from)?.ua || '').slice(0, 220), dev: '', sid: '', build: '', admin: false, tries: 0, since: known?.since || t,
      // (an administrator: 'owner' or 'admin', and which named key it was; where the connection comes from)
      rank: '', key: '', cc: String((known || from)?.cc || '').slice(0, 2), city: String((known || from)?.city || '').slice(0, 60),
      // (what they may be seen wearing: { m, t } — t: when the free day of the light jetpack ends, on this clock —,
      // the browser it was read for; the colour, the kit and the look they asked for; kept out in silence)
      wear: undefined, wdev: '', want: [0, 0], look: 0, mute: !!(known || from)?.mute,
      host: !!(known || from)?.host, tdev: cleanDevice((known ? known.tdev : from?.dev) || ''),
    };
    const worn = cleanWardrobe(from?.wear);
    if (worn) { p.wear = { m: worn.m, t: t + worn.left }; p.wdev = cleanDevice(from.dev); }
    if (known) {
      p.name = cleanName(known.name); p.color = int(known.color, 31); p.kit = int(known.kit, 255); p.joined = !!known.joined;
      p.dev = cleanDevice(known.dev); p.sid = cleanSession(known.sid); p.build = cleanBuild(known.build); p.admin = !!known.admin; p.badge = !!known.badge;
      p.rank = !known.admin ? '' : known.admin === 'admin' ? 'admin' : 'owner'; p.key = typeof known.key === 'string' ? known.key.slice(0, 12) : '';
      if (Array.isArray(known.state) && known.state.length === 6 && known.state.every(Number.isFinite)) { p.state = known.state; p.row = `[${p.id},${p.state.join(',')}`; p.ver = 1; }
      if (known.wear && Number.isInteger(known.wear.m) && Number.isFinite(known.wear.t)) { p.wear = { m: known.wear.m, t: known.wear.t }; p.wdev = cleanDevice(known.wdev); }
      // (what they asked for: as it was kept — or, from before it was, what they were shown as)
      p.want = Array.isArray(known.want) ? [int(known.want[0], 31), int(known.want[1], 255)] : [p.color, p.kit];
      p.look = Number.isInteger(known.look) ? known.look & 0xffff : p.state ? p.state[5] : 0;
    }
    if (p.id >= this.nextId) this.nextId = p.id + 1;
    this.players.set(connection, p);
    return p;
  }

  /** Kept out in silence from now on — or no longer (`on`): whoever is here from that address, or with that browser. Returns how many. */
  hush({ ip, dev }, on) {
    let n = 0;
    for (const p of this.players.values()) if ((ip && p.ip === ip) || (dev && p.dev === dev)) { p.mute = !!on; this.io.save?.(p); n++; }
    return n;
  }

  /** How many connections each address has in this room: { address: n } (the door counts them: door.js). */
  addresses() {
    const by = {};
    for (const p of this.players.values()) if (p.ip) by[p.ip] = (by[p.ip] || 0) + 1;
    return by;
  }

  /** The connection is gone (safe to call twice). */
  remove(connection) {
    const p = this.players.get(connection);
    if (!p) return null;
    this.players.delete(connection);
    if (p.joined) this.broadcast(`{"t":"leave","id":${p.id}}`);
    return p;
  }

  broadcast(text, except) {
    for (const p of this.players.values()) if (p.joined && p !== except) this.io.send(p.conn, text);
  }

  /** To those within `reach` metres of `p` (who must have said where they are). */
  around(p, reach, text) {
    if (!p.state) return;
    const [x, y, z] = p.state, r2 = reach * reach;
    for (const o of this.players.values()) {
      if (!o.joined || o === p || !o.state) continue;
      const dx = o.state[0] - x, dy = o.state[1] - y, dz = o.state[2] - z;
      if (dx * dx + dy * dy + dz * dz <= r2) this.io.send(o.conn, text);
    }
  }

  /** One frame from a connection: its text, or anything else for a binary frame (ignored, but counted). */
  receive(connection, text) {
    const p = this.players.get(connection);
    if (!p) return;
    const t = this.io.now();
    p.alive = true;
    p.tokens = Math.min(BURST, p.tokens + ((t - p.stamp) * RATE) / 1000) - 1;
    p.stamp = t;
    if (p.tokens < 0) return this.io.drop(connection, 1008, 'flood');
    if (typeof text !== 'string') return;
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') this._hello(p, m);
    else if (m.t === 'ping') this.io.send(connection, `{"t":"pong","c":${Number.isFinite(m.c) ? m.c : 0},"now":${t}}`);
    else if (!p.joined) return;
    else if (m.t === 's') this._state(p, m, t);
    else if (m.t === 'e' && Number.isInteger(m.e) && m.e >= 0 && m.e <= 31) {
      if (m.e === FIREWORK && !mayLight(this._wear(p))) return; // (a firework from a box nobody bought)
      const out = `{"t":"e","id":${p.id},"e":${m.e}}`;
      if (this.crowded) this.around(p, this.range, out); else this.broadcast(out, p);
    } else if (m.t === 'g' && typeof m.b === 'string' && /^[a-z]{2,8}$/.test(m.b)) {
      // a game was finished: a score has just gone on that board (the others fetch it from the server — nothing
      // of it is taken from this message). At most one every three seconds from each visitor.
      if (p.scored !== undefined && t - p.scored < 3000) return;
      p.scored = t;
      if (!p.mute) this.broadcast(`{"t":"g","id":${p.id},"b":"${m.b}"}`, p);
    } else if (m.t === 'own') this._own(p, t);
    else if (m.t === 'v') this._thing(p, m, t);
    else if (m.t === 'n') this._blast(p, t);
    else if (m.t === 'c') this._chat(p, m, t);
    else if (m.t === 'admin') this._admin(p, m);
    else if (p.admin && (m.t === 'who' || m.t === 'kick' || m.t === 'ban' || m.t === 'promote' || m.t === 'demote' || m.t === 'gift')) this._moderate(p, m);
    else if (p.host && m.t === 'kick') this._putOut(p, m, t);
  }

  // The owner of a room of their own (urooms.js) puts a visitor out: gone, and not back for an hour — by the
  // browser the door let in. Never an administrator. (Kept in the memory of the room, and nowhere else.)
  _putOut(p, m, t) {
    const target = [...this.players.values()].find((o) => o.id === m.id);
    if (!target || target === p || target.admin || target.host || !target.joined) return;
    const dev = target.tdev || target.dev;
    if (dev) { this.outs ||= new Map(); for (const [k, until] of this.outs) if (until <= t) this.outs.delete(k); this.outs.set(dev, t + OUT_MS); }
    this.io.send(target.conn, '{"t":"kicked","ban":false,"host":true}');
    (this.io.kick || this.io.drop)(target.conn, 4001, 'kicked');
  }

  // A thing one steers in a game that is not one's avatar — a boat on the pond: where it is, a few times a
  // second, for those near enough to see it. The relay looks at its shape and at nothing else: a kind (0 to 15),
  // the number of the run it belongs to, one to THING_MAX numbers — finite, not huge, carried to the hundredth.
  // More than THING_RATE a second from one visitor are simply not handed on. Nothing of it is kept; from a
  // visitor kept out in silence it goes to nobody (and the visitor cannot tell).
  _thing(p, m, t) {
    p.things = Math.min(THING_BURST, p.things + ((t - p.thingAt) * THING_RATE) / 1000);
    p.thingAt = t;
    if (p.things < 1 || !Number.isInteger(m.k) || m.k < 0 || m.k > 15 || !Number.isInteger(m.n) || m.n < 0 || m.n > 0xffffffff) return;
    if (!Array.isArray(m.d) || m.d.length < 1 || m.d.length > THING_MAX) return;
    let row = '';
    for (const v of m.d) {
      if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > THING_LIMIT) return;
      row += `${row ? ',' : ''}${round(v, 100)}`;
    }
    p.things -= 1;
    if (!p.mute) this.around(p, THING_REACH, `{"t":"v","id":${p.id},"k":${m.k},"n":${m.n},"d":[${row}]}`);
  }

  // The big red button: one explosion for the whole room, and no other before BLAST_EVERY has gone by.
  _blast(p, t) {
    const left = this.blastAt === undefined ? 0 : this.blastAt + BLAST_EVERY - t;
    if (left > 0) return this.io.send(p.conn, `{"t":"n","wait":${Math.ceil(left)}}`);
    // (kept out in silence: the show is on their screen alone, and the room's button is still ready)
    if (p.mute) return this.io.send(p.conn, `{"t":"n","id":${p.id},"wait":${BLAST_EVERY}}`);
    this.blastAt = t;
    this.io.fired?.(t);
    const text = `{"t":"n","id":${p.id},"wait":${BLAST_EVERY}}`;
    for (const o of this.players.values()) if (o.joined) this.io.send(o.conn, text);
  }

  _chat(p, m, t) {
    // a talkative player is not dropped, only not relayed: five lines in a row, then one every two seconds
    p.chat = Math.min(CHAT_BURST, p.chat + (t - p.chatAt) / CHAT_EVERY);
    p.chatAt = t;
    if (p.chat < 1) return;
    const text = cleanChat(m.m);
    if (!text) return;
    p.chat -= 1;
    if (p.mute) return; // (kept out in silence: nobody hears)
    if (m.i && p.admin) this.broadcast(JSON.stringify({ t: 'c', id: p.id, m: text, i: 1 }), p); // (the "important" channel: an administrator's)
    else if (m.n) this.around(p, CHAT_NEAR, JSON.stringify({ t: 'c', id: p.id, m: text, n: 1 }));
    else this.broadcast(JSON.stringify({ t: 'c', id: p.id, m: text }), p);
  }

  _admin(p, m) {
    if (p.tries >= KEY_TRIES) return this.io.drop(p.conn, 1008, 'key');
    const done = (answer) => {
      if (this.players.get(p.conn) !== p) return; // (gone in the meantime)
      // what a host may answer: false, true or 'owner', 'admin', { rank, id }
      const who = !answer ? null : answer === true ? { rank: 'owner', id: '' } : typeof answer === 'string' ? { rank: answer === 'admin' ? 'admin' : 'owner', id: '' } : answer;
      const ok = !!who;
      if (!ok) p.tries++;
      const was = p.admin;
      p.admin = ok; p.rank = ok ? (who.rank === 'admin' ? 'admin' : 'owner') : ''; p.key = ok ? String(who.id || '').slice(0, 12) : '';
      this.io.send(p.conn, `{"t":"admin","ok":${ok}${p.rank === 'owner' ? ',"owner":true' : ''}}`);
      if (was !== ok) this._shown(p, true); // (an administrator may wear anything, and a badge; one who is no more, only what they have)
      this.io.save?.(p);
    };
    let answer = false;
    try { answer = typeof m.key === 'string' && m.key.length <= 256 ? this.io.admin?.(m.key) : false; } catch { answer = false; }
    if (answer && typeof answer.then === 'function') answer.then(done, () => done(false)); else done(answer);
  }

  _moderate(p, m) {
    if (m.t === 'who') {
      const list = [...this.players.values()].filter((o) => o.joined).map((o) => ({ id: o.id, name: o.name, ip: o.ip, ua: o.ua, dev: o.dev, since: o.since, cc: o.cc, city: o.city, admin: o.rank, ...(o.mute && { muted: true }) }));
      return this.io.send(p.conn, JSON.stringify({ t: 'who', now: this.io.now(), list }));
    }
    if (m.t === 'demote') {
      // the owner has taken the title away from whoever holds that key: they are an administrator no more
      if (p.rank !== 'owner' || typeof m.key !== 'string' || !m.key) return;
      for (const o of this.players.values()) if (o.rank === 'admin' && o.key === m.key) { o.admin = false; o.rank = o.key = ''; this.io.send(o.conn, '{"t":"admin","ok":false,"out":true}'); this._shown(o, true); this.io.save?.(o); }
      return;
    }
    const target = [...this.players.values()].find((o) => o.id === m.id);
    if (m.t === 'gift') { if (target && target.joined) this.io.send(target.conn, JSON.stringify({ t: 'gift', by: p.name })); return; } // (to oneself too)
    if (!target || target === p) return;
    if (m.t === 'promote') {
      if (target.admin || !target.joined || !this.io.promote) return;
      Promise.resolve().then(() => this.io.promote({ name: target.name, by: p.name })).then((made) => {
        if (!made || !made.key || this.players.get(target.conn) !== target) return;
        target.admin = true; target.rank = 'admin'; target.key = String(made.id || '').slice(0, 12);
        this.io.send(target.conn, JSON.stringify({ t: 'promoted', key: made.key, by: p.name }));
        this.io.save?.(target);
        if (this.players.get(p.conn) === p) this.io.send(p.conn, `{"t":"promoted","id":${target.id}}`);
      }).catch(() => {});
      return;
    }
    if (target.rank === 'owner' && p.rank !== 'owner') return; // (nobody but the owner puts the owner out)
    const ban = m.t === 'ban';
    if (ban && m.q) {
      // kept out in silence: they stay, and from now on nobody hears them (see the top of this file)
      this.io.ban?.({ ip: target.ip, dev: target.dev, name: target.name, hours: clamp(Number(m.h) || 0, 0, 87600), quiet: true });
      target.mute = true;
      this.io.save?.(target);
      return;
    }
    if (ban) this.io.ban?.({ ip: target.ip, dev: target.dev, name: target.name, hours: clamp(Number(m.h) || 0, 0, 87600) });
    this.io.send(target.conn, `{"t":"kicked","ban":${ban}}`);
    (this.io.kick || this.io.drop)(target.conn, ban ? 4003 : 4001, ban ? 'banned' : 'kicked');
  }

  // What this visitor may be seen wearing: anything for an administrator, their wardrobe otherwise (none: no check).
  _wear(p) { return p.admin ? true : p.wear; }

  // What the others are told of a visitor: a name, a colour, a kit — and the badge of an administrator who wants it known.
  _card(p) { return JSON.stringify({ t: 'join', id: p.id, name: p.name, color: p.color, ...(p.kit && { k: p.kit }), ...(p.admin && p.badge && { ad: 1 }) }); }

  // What the others see of a visitor is worked out again — what they have has just been read again, or (`rank`)
  // whether they are an administrator has changed: the colour and the kit they asked for, their badge, the look
  // of their last state. The others are told what is no longer the same.
  _shown(p, rank = false) {
    const w = this._wear(p), color = fitColor(p.want[0], w), kit = fitKit(p.want[1], w), told = color !== p.color || kit !== p.kit || (rank && p.badge);
    p.color = color; p.kit = kit;
    if (p.joined && told) this.broadcast(this._card(p), p);
    const look = p.state ? fitLook(p.look, w, this.io.now()) : 0;
    if (p.state && look !== p.state[5]) {
      p.state = [...p.state.slice(0, 5), look];
      p.row = `[${p.id},${p.state.join(',')}`; p.at = Math.max(this.io.now(), p.at + 1); p.dirty = true; p.rested = false; p.ver++;
      this.moved = this.unmapped = this.pending = true;
      this.io.wake?.();
    }
  }

  // Something was bought, or given: what this visitor has is asked again (at most every two seconds).
  _own(p, t, now = false) {
    if (!this.io.wardrobe || !p.dev || (!now && p.asked !== undefined && t - p.asked < 2000)) return;
    p.asked = t;
    Promise.resolve().then(() => this.io.wardrobe(p.dev)).then((given) => {
      if (this.players.get(p.conn) !== p) return; // (gone in the meantime)
      const w = cleanWardrobe(given);
      // (null: nothing is sold here — everything is everybody's, nothing is checked)
      p.wear = w ? { m: w.m, t: this.io.now() + w.left } : given === null ? undefined : p.wear;
      p.wdev = p.dev;
      this._shown(p);
      this.io.save?.(p);
    }).catch(() => {});
  }

  _hello(p, m) {
    const name = cleanName(m.name), badge = m.ad === 1;
    if (!p.dev) p.dev = cleanDevice(m.dev);
    // (put out of this room by its owner less than an hour ago: not back yet)
    if (!p.joined && this.outs && !p.admin && (this.outs.get(p.tdev || p.dev) || 0) > this.io.now()) {
      this.io.send(p.conn, '{"t":"kicked","ban":false,"host":true}');
      return (this.io.kick || this.io.drop)(p.conn, 4001, 'kicked');
    }
    // (the wardrobe that came with the connection is that of the browser named in the address: a hello that
    // names another has nothing until its own has been read)
    if (p.wear && p.wdev !== p.dev) { p.wear = { m: 0, t: 0 }; p.wdev = p.dev; this._own(p, this.io.now(), true); }
    p.want = [int(m.color, 31), int(m.k, 255)];
    const color = fitColor(p.want[0], this._wear(p)), kit = fitKit(p.want[1], this._wear(p));
    if (!p.build) p.build = cleanBuild(m.b);
    if (!p.sid) {
      p.sid = cleanSession(m.s);
      // the same page of the same browser, here already: the connection it had before is not somebody else —
      // it leaves at once (two tabs are two pages: both stay)
      if (p.sid && p.dev) for (const o of [...this.players.values()]) if (o !== p && o.sid === p.sid && o.dev === p.dev) { this.remove(o.conn); this.io.drop(o.conn, 4002, 'again'); }
    }
    if (p.joined && name === p.name && color === p.color && kit === p.kit && badge === p.badge) return;
    p.name = name; p.color = color; p.kit = kit; p.badge = badge;
    if (!p.joined) {
      p.joined = true;
      // (in a crowd, where the others are comes with the first batch of those around)
      const crowded = this.joined > this.near + 1;
      const peers = [...this.players.values()].filter((o) => o.joined && o !== p)
        .map((o) => ({ id: o.id, name: o.name, color: o.color, ...(o.kit && { k: o.kit }), ...(o.admin && o.badge && { ad: 1 }), ...(o.state && !crowded && { p: o.state.slice(0, 4), a: o.state[4], f: o.state[5] }) }));
      const welcome = { t: 'welcome', id: p.id, now: this.io.now(), tick: this.io.tick, near: this.near, peers };
      if (this.io.idle !== undefined) welcome.idle = this.io.idle;
      // (the big red button: how long before it is ready again, how long ago it went off)
      if (this.blastAt !== undefined && this.blastAt + BLAST_EVERY > welcome.now) welcome.blast = [Math.ceil(this.blastAt + BLAST_EVERY - welcome.now), Math.max(0, Math.floor(welcome.now - this.blastAt))];
      this.io.send(p.conn, JSON.stringify(welcome));
      this.pending = true; // (the crowd may have just become one)
    }
    this.broadcast(this._card(p), p);
    this.io.save?.(p);
  }

  _state(p, m, t) {
    const state = cleanState(m);
    if (!state) return;
    p.look = state[5];
    state[5] = fitLook(state[5], this._wear(p), t); // (a hat, a flame, a size that are not theirs are not shown)
    const row = `[${p.id},${state.join(',')}`; // closed with its age when a flush sends it
    const at = Math.max(t, p.at + 1); // strictly increasing per player: clients order states by time
    if (row !== p.row) { p.row = row; p.state = state; p.at = at; p.dirty = true; p.rested = false; p.ver++; this.moved = this.unmapped = true; this.io.save?.(p); }
    // First repeat after a relayed change: relay it once more, so that clients know the player has stopped.
    else if (!p.rested && !p.dirty) { p.rested = true; p.at = at; p.dirty = true; p.ver++; }
    else return;
    this.pending = true;
  }

  /** Sends the room the states that changed since the previous flush; nobody gets its own state back. */
  flush() {
    this.pending = false;
    const t = this.io.now();
    const crowded = this.joined > this.near + 1;
    if (crowded !== this.crowded) {
      // the crowd forms, or thins out: start again from what everybody is known to have
      this.crowded = crowded;
      this.areaAt = this.mapAt = -1e9;
      this.moved = this.unmapped = crowded;
      for (const p of this.players.values()) {
        p.area = p.gone = null; p.sent = crowded ? new Map() : null;
        if (!crowded && p.state) p.dirty = true; // (those who were out of sight of some are shown to all again)
        if (!crowded && p.watched === false) { p.watched = undefined; this.io.send(p.conn, '{"t":"w","n":1}'); }
      }
    }
    if (crowded) return this._flushAround(t);
    const ids = [], rows = [];
    for (const p of this.players.values()) if (p.dirty) { p.dirty = false; ids.push(p.id); rows.push(`${p.row},${Math.max(0, t - p.at)}]`); }
    if (!rows.length) return;
    const head = `{"t":"u","now":${t},"s":[`;
    const all = `${head}${rows.join(',')}]}`;
    for (const p of this.players.values()) {
      if (!p.joined || this.io.busy?.(p.conn)) continue; // states are disposable: skip slow readers
      const own = ids.indexOf(p.id);
      if (own < 0) this.io.send(p.conn, all);
      else if (rows.length > 1) this.io.send(p.conn, `${head}${rows.filter((_, i) => i !== own).join(',')}]}`);
    }
  }

  // A crowd: to each their own batch — the states, changed since they last got them, of those around them.
  // (`pending` stays up while the circles or the map are behind what has moved: the host flushes again,
  // then the room can go quiet)
  _flushAround(t) {
    if (this.moved && t - this.areaAt >= AREA_MS) { this.areaAt = t; this.moved = false; this._areas(); }
    const head = `{"t":"u","now":${t},"s":[`;
    for (const r of this.players.values()) {
      r.dirty = false;
      if (!r.joined || !r.area || this.io.busy?.(r.conn)) continue;
      let rows = '';
      for (const q of r.area) {
        if (r.sent.get(q.id) === q.ver) continue;
        r.sent.set(q.id, q.ver);
        rows += `${rows ? ',' : ''}${q.row},${Math.max(0, t - q.at)}]`;
      }
      if (!rows && !r.gone) continue;
      this.io.send(r.conn, r.gone ? `${head}${rows}],"g":[${r.gone.join(',')}]}` : `${head}${rows}]}`);
      r.gone = null;
    }
    if (this.unmapped && t - this.mapAt >= MAP_MS) {
      // where everybody is, roughly, for the maps (each ignores those it is told about in detail)
      this.mapAt = t; this.unmapped = false;
      let all = '';
      for (const p of this.players.values()) if (p.joined && p.state) all += `${all ? ',' : ''}${p.id},${Math.round(p.state[0])},${Math.round(p.state[2])}`;
      const text = `{"t":"m","p":[${all}]}`;
      for (const p of this.players.values()) if (p.joined && !this.io.busy?.(p.conn)) this.io.send(p.conn, text);
    }
    if (this.moved || this.unmapped) this.pending = true;
  }

  // Who is told about whom: for each player, the `near` nearest others within `range`.
  _areas() {
    const list = [];
    for (const p of this.players.values()) if (p.joined && p.state) { p._n = []; p._d = []; p._w = 0; p.sent ||= new Map(); list.push(p); }
    const K = this.near, R2 = this.range * this.range;
    const take = (a, b, d) => {
      // (a short sorted list: most candidates are turned away by one comparison)
      const ds = a._d, ns = a._n;
      if (ds.length === K && d >= ds[K - 1]) return;
      let i = ds.length;
      while (i > 0 && ds[i - 1] > d) i--;
      ds.splice(i, 0, d); ns.splice(i, 0, b);
      if (ds.length > K) { ds.pop(); ns.pop(); }
    };
    for (let i = 0; i < list.length; i++) {
      const a = list[i], s = a.state;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j], u = b.state, dx = s[0] - u[0], dy = s[1] - u[1], dz = s[2] - u[2], d = dx * dx + dy * dy + dz * dz;
        if (d <= R2) { take(a, b, d); take(b, a, d); }
      }
    }
    for (const p of list) {
      const next = p._n;
      for (const q of next) q._w++;
      if (p.area) {
        // those who are no longer around (those who left the room were announced already)
        for (const q of p.area) if (!next.includes(q)) { p.sent.delete(q.id); if (this.players.get(q.conn) === q) (p.gone ||= []).push(q.id); }
      }
      p.area = next;
      p._n = p._d = null;
    }
    for (const p of list) {
      const w = p._w > 0;
      if (w !== p.watched) { p.watched = w; this.io.send(p.conn, `{"t":"w","n":${w ? 1 : 0}}`); }
    }
  }
}
