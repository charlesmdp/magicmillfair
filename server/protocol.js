// The presence relay, independent of where it runs: server/index.js (Node, `ws`) and cloudflare/worker.js
// (a Durable Object) both drive this same Room, so the two can never speak different dialects.
// No authority over the game: every client shares its own avatar state and a room hands those states on.
//
// Protocol (JSON text frames)
//   client → server   {t:'hello',name,color,v:2,dev?,k?}   {t:'s',p:[x,y,z,yaw],a,f}   {t:'e',e}   {t:'c',m,n?}
//                     (k: the "kit" of the avatar — its paint, its trail… one number from 0 to 255, see items.js;
//                     it comes back as `k` in `join` and in the peers of `welcome`, when it is not 0)
//                     {t:'g',b}   a score of mine has just gone on board b (relayed as {t:'g',id,b})
//                     {t:'n'}     the big red button: answered {t:'n',id,wait} to the whole room when it goes
//                                 off (wait: ms before the next one), {t:'n',wait} to the sender when it is too soon
//                     {t:'ping',c}   {t:'admin',key}   and, from an administrator: {t:'who'}   {t:'kick',id}
//                     {t:'ban',id,h}   {t:'promote',id} (names that visitor an administrator)   {t:'demote',key}
//                     (the owner: the administrator whose key has that id is one no more)   {t:'c',m,i:1} (a
//                     line on the "important" channel: relayed to the whole room, marked as such)
//   server → client   {t:'welcome',id,now,tick,idle?,near,blast?:[ms before the button is ready, ms since it went off],
//                     peers:[{id,name,color,p,a,f}]}   {t:'join',id,name,color}
//                     {t:'leave',id}   {t:'u',now,s:[[id,x,y,z,yaw,a,f,age]],g?:[id]}   {t:'e',id,e}
//                     {t:'c',id,m,n?}   {t:'m',p:[id,x,z,…]}   {t:'w',n}   {t:'pong',c,now}   {t:'full'}
//                     {t:'admin',ok,owner?,out?} (out: the title was taken away)   {t:'who',list:[{id,name,ip,ua,dev,since,cc,city,admin}]}
//                     {t:'kicked',ban}   {t:'promoted',key,by} (to who has just been named: the key of their
//                     own)   {t:'promoted',id} (to who named them)
//   `c` is a chat line: relayed as it comes, never stored, never sent back to its author; with `n` it only goes
//   to those within CHAT_NEAR metres of who says it.
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

export const MAX_FRAME = 2048; // bytes
export const RATE = 40, BURST = RATE * 2; // messages per second, averaged over 2 s (token bucket)
export const CHAT_MAX = 200; // characters in a chat line
export const CHAT_BURST = 5, CHAT_EVERY = 2000; // chat lines: five in a row, then one every two seconds
export const CHAT_NEAR = 20; // m: how far a line said "to those nearby" carries
export const NEAR = 40, RANGE = 220; // how many others one is told about in detail, and from how far (m)
export const BLAST_EVERY = 15 * 60_000; // ms between two presses of the big red button, for a whole room
const AREA_MS = 400, MAP_MS = 2000; // how often the circles and the map are worked out
const KEY_TRIES = 5; // wrong administrator keys a connection may send

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

/** Avatar state of an `s` message, bounded and rounded: [x, y, z, yaw, anim, flags], or null when malformed. */
export function cleanState(m) {
  const v = m.p;
  if (!Array.isArray(v) || v.length < 4 || !v.slice(0, 4).every(Number.isFinite)) return null;
  return [
    round(clamp(v[0], -2000, 2000), 100), round(clamp(v[1], -100, 500), 100), round(clamp(v[2], -2000, 2000), 100),
    round(Math.atan2(Math.sin(v[3]), Math.cos(v[3])), 1000), int(m.a, 15), int(m.f, 255),
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
   *   ban({ ip, dev, name, hours })    optional: keep someone out from now on (0 hours: for good)
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

  /**
   * A connection arrives. Returns its player, or null when the room is full (the host says so and closes).
   * `known` ({ id, name, color, joined, state, ip, ua, dev, admin, since }) restores a player whose connection
   * outlived the host's memory; `from` ({ ip, ua }) is what the host knows of a new one.
   */
  add(connection, known, from) {
    if (!known && this.players.size >= this.io.max) return null;
    const t = this.io.now();
    const p = {
      conn: connection, id: known ? known.id : this.io.id ? this.io.id() : this.nextId, name: 'Visitor', color: 0, kit: 0, joined: false,
      alive: true, tokens: BURST, stamp: t, chat: CHAT_BURST, chatAt: t,
      state: null, row: '', at: 0, dirty: false, rested: true, // last state, its serialised row, when it came, relay flags
      ver: 0, area: null, sent: null, gone: null, watched: undefined, // (a crowd) version of the state, who they are told about, what was sent
      ip: String((known || from)?.ip || '').slice(0, 64), ua: String((known || from)?.ua || '').slice(0, 220), dev: '', admin: false, tries: 0, since: known?.since || t,
      // (an administrator: 'owner' or 'admin', and which named key it was; where the connection comes from)
      rank: '', key: '', cc: String((known || from)?.cc || '').slice(0, 2), city: String((known || from)?.city || '').slice(0, 60),
    };
    if (known) {
      p.name = cleanName(known.name); p.color = int(known.color, 15); p.kit = int(known.kit, 255); p.joined = !!known.joined;
      p.dev = cleanDevice(known.dev); p.admin = !!known.admin;
      p.rank = !known.admin ? '' : known.admin === 'admin' ? 'admin' : 'owner'; p.key = typeof known.key === 'string' ? known.key.slice(0, 12) : '';
      if (Array.isArray(known.state) && known.state.length === 6 && known.state.every(Number.isFinite)) { p.state = known.state; p.row = `[${p.id},${p.state.join(',')}`; p.ver = 1; }
    }
    if (p.id >= this.nextId) this.nextId = p.id + 1;
    this.players.set(connection, p);
    return p;
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
      const out = `{"t":"e","id":${p.id},"e":${m.e}}`;
      if (this.crowded) this.around(p, this.range, out); else this.broadcast(out, p);
    } else if (m.t === 'g' && typeof m.b === 'string' && /^[a-z]{2,8}$/.test(m.b)) {
      // a game was finished: a score has just gone on that board (the others fetch it from the server — nothing
      // of it is taken from this message). At most one every three seconds from each visitor.
      if (p.scored !== undefined && t - p.scored < 3000) return;
      p.scored = t;
      this.broadcast(`{"t":"g","id":${p.id},"b":"${m.b}"}`, p);
    } else if (m.t === 'n') this._blast(p, t);
    else if (m.t === 'c') this._chat(p, m, t);
    else if (m.t === 'admin') this._admin(p, m);
    else if (p.admin && (m.t === 'who' || m.t === 'kick' || m.t === 'ban' || m.t === 'promote' || m.t === 'demote')) this._moderate(p, m);
  }

  // The big red button: one explosion for the whole room, and no other before BLAST_EVERY has gone by.
  _blast(p, t) {
    const left = this.blastAt === undefined ? 0 : this.blastAt + BLAST_EVERY - t;
    if (left > 0) return this.io.send(p.conn, `{"t":"n","wait":${Math.ceil(left)}}`);
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
      p.admin = ok; p.rank = ok ? (who.rank === 'admin' ? 'admin' : 'owner') : ''; p.key = ok ? String(who.id || '').slice(0, 12) : '';
      this.io.send(p.conn, `{"t":"admin","ok":${ok}${p.rank === 'owner' ? ',"owner":true' : ''}}`);
      this.io.save?.(p);
    };
    let answer = false;
    try { answer = typeof m.key === 'string' && m.key.length <= 256 ? this.io.admin?.(m.key) : false; } catch { answer = false; }
    if (answer && typeof answer.then === 'function') answer.then(done, () => done(false)); else done(answer);
  }

  _moderate(p, m) {
    if (m.t === 'who') {
      const list = [...this.players.values()].filter((o) => o.joined).map((o) => ({ id: o.id, name: o.name, ip: o.ip, ua: o.ua, dev: o.dev, since: o.since, cc: o.cc, city: o.city, admin: o.rank }));
      return this.io.send(p.conn, JSON.stringify({ t: 'who', now: this.io.now(), list }));
    }
    if (m.t === 'demote') {
      // the owner has taken the title away from whoever holds that key: they are an administrator no more
      if (p.rank !== 'owner' || typeof m.key !== 'string' || !m.key) return;
      for (const o of this.players.values()) if (o.rank === 'admin' && o.key === m.key) { o.admin = false; o.rank = o.key = ''; this.io.send(o.conn, '{"t":"admin","ok":false,"out":true}'); this.io.save?.(o); }
      return;
    }
    const target = [...this.players.values()].find((o) => o.id === m.id);
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
    if (ban) this.io.ban?.({ ip: target.ip, dev: target.dev, name: target.name, hours: clamp(Number(m.h) || 0, 0, 87600) });
    this.io.send(target.conn, `{"t":"kicked","ban":${ban}}`);
    (this.io.kick || this.io.drop)(target.conn, ban ? 4003 : 4001, ban ? 'banned' : 'kicked');
  }

  _hello(p, m) {
    const name = cleanName(m.name), color = int(m.color, 15), kit = int(m.k, 255);
    if (!p.dev) p.dev = cleanDevice(m.dev);
    if (p.joined && name === p.name && color === p.color && kit === p.kit) return;
    p.name = name; p.color = color; p.kit = kit;
    if (!p.joined) {
      p.joined = true;
      // (in a crowd, where the others are comes with the first batch of those around)
      const crowded = this.joined > this.near + 1;
      const peers = [...this.players.values()].filter((o) => o.joined && o !== p)
        .map((o) => ({ id: o.id, name: o.name, color: o.color, ...(o.kit && { k: o.kit }), ...(o.state && !crowded && { p: o.state.slice(0, 4), a: o.state[4], f: o.state[5] }) }));
      const welcome = { t: 'welcome', id: p.id, now: this.io.now(), tick: this.io.tick, near: this.near, peers };
      if (this.io.idle !== undefined) welcome.idle = this.io.idle;
      // (the big red button: how long before it is ready again, how long ago it went off)
      if (this.blastAt !== undefined && this.blastAt + BLAST_EVERY > welcome.now) welcome.blast = [Math.ceil(this.blastAt + BLAST_EVERY - welcome.now), Math.max(0, Math.floor(welcome.now - this.blastAt))];
      this.io.send(p.conn, JSON.stringify(welcome));
      this.pending = true; // (the crowd may have just become one)
    }
    this.broadcast(JSON.stringify({ t: 'join', id: p.id, name, color, ...(kit && { k: kit }) }), p);
    this.io.save?.(p);
  }

  _state(p, m, t) {
    const state = cleanState(m);
    if (!state) return;
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
