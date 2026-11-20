// The presence relay, independent of where it runs: server/index.js (Node, `ws`) and cloudflare/worker.js
// (a Durable Object) both drive this same Room, so the two can never speak different dialects.
// No authority over the game: every client shares its own avatar state and a room batches those states to its
// other members.
//
// Protocol (JSON text frames)
//   client → server   {t:'hello',name,color,v:1}   {t:'s',p:[x,y,z,yaw],a,f}   {t:'e',e}   {t:'ping',c}
//   server → client   {t:'welcome',id,now,tick,idle?,peers:[{id,name,color,p,a,f}]}   {t:'join',id,name,color}
//                     {t:'leave',id}   {t:'u',now,s:[[id,x,y,z,yaw,a,f,age]]}   {t:'e',id,e}
//                     {t:'pong',c,now}   {t:'full'}
//   `now` is the relay clock (ms). `age` (ms) tells how long before `now` a state was received: clients rebuild
//   smooth motion from `now - age`. A `join` for an id already known is a rename. `tick` is the batching period
//   (clients need not send faster); `idle`, when present, is how often an unchanged state should be repeated
//   as a keep-alive (0 = never).

export const MAX_FRAME = 2048; // bytes
export const RATE = 40, BURST = RATE * 2; // messages per second, averaged over 2 s (token bucket)

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, k) => Math.round(v * k) / k;
export const int = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : 0);

/** Room id: [a-z0-9_-]{1,48}, 'main' when nothing usable is left. */
export const cleanRoom = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48) || 'main';

/** Display name: no control characters or angle brackets, single spaces, at most 16 characters. */
export function cleanName(name) {
  const s = typeof name === 'string' ? name.replace(/\s+/g, ' ').replace(/[\p{C}<>]/gu, '').replace(/ {2,}/g, ' ').trim() : '';
  return [...s].slice(0, 16).join('').trim() || 'Visiteur';
}

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
   *   now()    relay clock (ms)
   *   send(connection, text)
   *   drop(connection, code, reason)   close a misbehaving connection (the host then calls remove())
   *   busy(connection)                 optional: true when a reader is too slow for disposable states
   *   save(player)                     optional: called when what a newcomer must know about a player changed
   *   id()                             optional: source of player ids (default: 1, 2, 3… per room)
   */
  constructor(io) {
    this.io = io;
    this.players = new Map(); // connection → player
    this.nextId = 1;
    this.pending = false; // some state waits for the next flush()
  }

  get size() { return this.players.size; }
  /** Players who said hello. */
  get joined() { let n = 0; for (const p of this.players.values()) if (p.joined) n++; return n; }

  /**
   * A connection arrives. Returns its player, or null when the room is full (the host says so and closes).
   * `known` ({ id, name, color, joined, state }) restores a player whose connection outlived the host's memory.
   */
  add(connection, known) {
    if (!known && this.players.size >= this.io.max) return null;
    const p = {
      conn: connection, id: known ? known.id : this.io.id ? this.io.id() : this.nextId, name: 'Visiteur', color: 0, joined: false,
      alive: true, tokens: BURST, stamp: this.io.now(),
      state: null, row: '', at: 0, dirty: false, rested: true, // last state, its serialised row, when it came, relay flags
    };
    if (known) {
      p.name = cleanName(known.name); p.color = int(known.color, 15); p.joined = !!known.joined;
      if (Array.isArray(known.state) && known.state.length === 6 && known.state.every(Number.isFinite)) { p.state = known.state; p.row = `[${p.id},${p.state.join(',')}`; }
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
    else if (m.t === 'e' && Number.isInteger(m.e) && m.e >= 0 && m.e <= 31) this.broadcast(`{"t":"e","id":${p.id},"e":${m.e}}`, p);
  }

  _hello(p, m) {
    const name = cleanName(m.name), color = int(m.color, 15);
    if (p.joined && name === p.name && color === p.color) return;
    p.name = name; p.color = color;
    if (!p.joined) {
      p.joined = true;
      const peers = [...this.players.values()].filter((o) => o.joined && o !== p)
        .map((o) => ({ id: o.id, name: o.name, color: o.color, ...(o.state && { p: o.state.slice(0, 4), a: o.state[4], f: o.state[5] }) }));
      const welcome = { t: 'welcome', id: p.id, now: this.io.now(), tick: this.io.tick, peers };
      if (this.io.idle !== undefined) welcome.idle = this.io.idle;
      this.io.send(p.conn, JSON.stringify(welcome));
    }
    this.broadcast(JSON.stringify({ t: 'join', id: p.id, name, color }), p);
    this.io.save?.(p);
  }

  _state(p, m, t) {
    const state = cleanState(m);
    if (!state) return;
    const row = `[${p.id},${state.join(',')}`; // closed with its age when a flush sends it
    const at = Math.max(t, p.at + 1); // strictly increasing per player: clients order states by time
    if (row !== p.row) { p.row = row; p.state = state; p.at = at; p.dirty = true; p.rested = false; this.io.save?.(p); }
    // First repeat after a relayed change: relay it once more, so that clients know the player has stopped.
    else if (!p.rested && !p.dirty) { p.rested = true; p.at = at; p.dirty = true; }
    else return;
    this.pending = true;
  }

  /** Sends the room the states that changed since the previous flush; nobody gets its own state back. */
  flush() {
    this.pending = false;
    const t = this.io.now();
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
}
