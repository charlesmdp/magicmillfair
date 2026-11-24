// Presence: who else is in the room and where to draw them this frame. Nothing here is authoritative: every
// client just shares its own avatar state. Modes: 'online' (WebSocket server, see server/index.js), 'local'
// (tabs of the same browser, through a BroadcastChannel) or 'offline' (solo).
// A transport (./transports) is `new T(target, { onopen, onmessage, onclose })`, handlers receiving the transport
// first: open() starts and keeps connecting, send(msg) takes the client → server messages of the protocol,
// onmessage delivers the server → client ones, close() stops for good.
import { Track, wrapAngle } from './interp.js';
import { BroadcastTransport } from './transports/BroadcastTransport.js';
import { WebSocketTransport } from './transports/WebSocketTransport.js';
import { deviceId } from './device.js';

const BUILD = typeof __BUILD__ !== 'undefined' && /^[0-9a-f]{4,12}$/.test(__BUILD__.commit || '') ? __BUILD__.commit : ''; // which version this page is (said with the hello)
const SEND_MS = 1000 / 12; // own state goes out at ~12 Hz…
const KEEPALIVE_MS = 2000; // …or every 2 s while nothing changes (unless the relay asks for another period, or none)
const UNSEEN_MS = 500; // …and only twice a second while nobody is close enough to be told about us (the relay says so)
const FALLBACK_MS = 2500; // no server after that long: same-browser presence takes over
const PROBE_MS = 30000; // then the same-origin server is probed again at this period
const MAX_SHARDS = 16; // (no door to ask — a server from before there was one —: how many rooms in a row are tried when they are full)
const DOOR_MS = 4000; // the door is given this long to say which room
const TURNS = 6; // rooms that say no in a row before a pause

const now = () => performance.now();
const round = (v, k) => Math.round(v * k) / k;
const int = (v, max, def = 0) => (Number.isInteger(v) && v >= 0 && v <= max ? v : def);

/** Display name: no control characters or angle brackets, single spaces, at most 16 characters. */
export function cleanName(name, fallback = 'Visitor') {
  const s = typeof name === 'string' ? name.replace(/\s+/g, ' ').replace(/[\p{C}<>]/gu, '').replace(/ {2,}/g, ' ').trim() : '';
  return [...s].slice(0, 16).join('').trim() || fallback;
}

/** Chat line as the relay accepts it: one line, no control characters, at most 200 characters. */
export function cleanChat(text) {
  const s = typeof text === 'string' ? text.replace(/\s+/g, ' ').replace(/\p{C}/gu, '').replace(/ {2,}/g, ' ').trim() : '';
  return [...s].slice(0, 200).join('').trim();
}

/** Room id as the server accepts it, [a-z0-9_-]{1,48}; '' when nothing usable is left. */
export function cleanRoom(room) {
  return String(room ?? '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
}

/** How a room is called on the screen: the common rooms are "Room 1", "Room 2"…; any other goes by its name. */
export function roomLabel(room) {
  const m = /^main(?:-([1-9]\d{0,3}))?$/.exec(String(room || ''));
  return m ? `Room ${m[1] || 1}` : String(room || '');
}

function stored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

// ws(s):// URL of the presence endpoint for a room; `raw` may be relative or http(s). Null when unusable.
// (`dev`: the random name of this browser — what a ban holds on to, besides the address)
// (`pass`: the owner's note for that room — see server/door.js — never the key itself)
function wsUrl(raw, room, dev, pass) {
  try {
    const url = new URL(raw, typeof location !== 'undefined' ? location.href : undefined);
    if (/^https?:$/.test(url.protocol)) url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('room', room);
    if (dev) url.searchParams.set('dev', dev);
    if (pass) url.searchParams.set('pass', pass);
    return url.href;
  } catch { return null; }
}

// The API of the server whose relay is at `raw` (…/ws): …/api/<path>. Null when unusable.
function apiUrl(raw, path) {
  try {
    const url = new URL(raw, typeof location !== 'undefined' ? location.href : undefined);
    if (/^wss?:$/.test(url.protocol)) url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = url.pathname.replace(/ws\/?$/, '') + path;
    url.search = '';
    return url;
  } catch { return null; }
}

export class Presence {
  /**
   * @param {{ room?: string, back?: string, name?: string, color?: number, url?: string }} [options]
   * `room`: a room asked for by its name (else the one the address names with ?room=, if any); `back`: the room
   * this visitor was in a moment ago (a refresh, a new version) — gone back to if it has room.
   */
  constructor({ room, back, name, color, kit = 0, url } = {}) {
    this._page = typeof location !== 'undefined' ? location : { search: '', pathname: '', protocol: '' };
    this._query = new URLSearchParams(this._page.search);
    this._url = url;
    // Which room: the door of the server decides (server/door.js, rooms.js) — the common rooms are shared out
    // between the visitors; a room asked for by its name is the one, if it has room. `room` is the one in use
    // (before the door has answered: the one asked for), `label` what it is called on the screen.
    this._want = cleanRoom(room) || cleanRoom(this._query.get('room')) || cleanRoom(this._page.pathname.replace(/\/index\.html?$/i, '').replace(/_/g, '-'));
    this._back = cleanRoom(back);
    this.room = this._back || this._want || 'main';
    this._not = []; // rooms that have just said they were full
    this._turn = this._turned = 0; // (which question to the door is the current one; rooms that said no in a row)
    this._said = null; // what the door said with the room in use (told with the 'room' event)
    this.name = cleanName(name ?? stored('mmf.name'), '') || `Visitor ${10 + Math.floor(Math.random() * 90)}`;
    this.color = int(color, 31, int(parseInt(stored('mmf.color'), 10), 31, Math.floor(Math.random() * 16)));
    this.kit = int(kit, 255); // what the avatar shows besides its hat: its paint, its trail (see server/items.js)
    this._persist();
    this.id = 0; // own id in the room (0 until connected)
    this.mode = 'offline';
    this.device = deviceId();
    // (a name for this page, for as long as it is open: when its line drops and it connects again, the relay
    // knows it is the same page and lets the old connection go — nobody is seen twice)
    this.session = `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    this.admin = false; // the relay has recognised an administrator's key
    this.owner = false; // …the owner's
    this.badge = false; // an administrator who wants it known (the relay tells the others once the key is recognised)
    this.blastReadyAt = 0; // when the big red button may be pressed again (Date.now() clock; 0: now)
    this.kicked = null; // { ban } once the administrator has put this visitor out
    /**
     * Everybody else in the room. `visible`: drawn (the relay tells us about them in detail); `far`: in the
     * room but too far, or too many, for that — only x and z are known then, roughly, for the maps.
     * @type {Map<number, { id, name, color, x, y, z, yaw, anim, flags, speed, visible, far }>}
     */
    this.peers = new Map();
    this._tracks = new Map(); // peer id → Track
    this._on = {}; // event type → Set of listeners
    this._ws = this._bc = this._tr = null; // WebSocket transport, BroadcastChannel transport, the one in use
    this._interval = SEND_MS;
    this._keepalive = KEEPALIVE_MS;
    this._local = [0, 0, 0, 0, 0, 0]; // x, y, z, yaw, anim, flags
    this._hasLocal = this._started = this._disposed = false;
    this._due = this._sentAt = this._repeats = this._timer = 0;
    this._sentKey = this._status = '';
    this._chat = 5; this._chatAt = now(); // same allowance as the relay: five lines in a row, then one every 2 s
    this._seen = true; // is anyone close enough to be told about us? (see `w` in the protocol)
    this._key = ''; // the administrator's key, when this visitor has one
  }

  /** Players in the room, self included. */
  get count() { return this.peers.size + 1; }
  /** What the room in use is called on the screen. */
  get label() { return roomLabel(this.room); }

  /**
   * Events: 'status' { mode, count }, 'join' peer, 'leave' peer, 'emote' { id, emote }, 'chat' { id, peer, text,
   * near }, 'identity' peer (renamed), 'admin' { ok }, 'who' { list } (the administrator's view of the room),
   * 'kicked' { ban }, 'room' { room, label, why, moved, full?, gone?, closed? } (a room was entered — `full`:
   * the room asked for had no room, `gone`: it is no more, `closed`: that name is not a room),
   * 'quiet' { to, label, n } (this room has gone quiet: room `to` holds `n` and has room).
   */
  on(type, fn) { (this._on[type] ||= new Set()).add(fn); return this; }
  off(type, fn) { this._on[type]?.delete(fn); return this; }

  /** Picks a transport: explicit server, else same-origin server, else other tabs, else solo. Never throws. */
  connect() {
    if (this._started || this._disposed) return this;
    this._started = true;
    try {
      const explicit = this._url || (import.meta.env && import.meta.env.VITE_WS_URL) || this._query.get('ws');
      const target = explicit || /^https?:$/.test(this._page.protocol) ? wsUrl(explicit || '/ws', this.room, this.device) : null;
      if (target) {
        this._dial = (room, pass) => new WebSocketTransport(wsUrl(explicit || '/ws', room, this.device, pass), this._handlers('online'), { probeEvery: explicit ? 0 : PROBE_MS });
        this._api = (path) => apiUrl(explicit || '/ws', path);
        this._enter({ want: this._want, back: this._back }); // (the door says which room; the relay is then dialled, and keeps retrying in the background)
      }
      this._fallback(target ? FALLBACK_MS : 0);
    } catch (err) { console.warn('[presence]', err); }
    return this;
  }

  // Asks the door which room (server/door.js). Null when there is no door to ask: a server from before there
  // was one, plain files, no network, or too many questions.
  async _askDoor({ want, back, not } = {}) {
    const url = this._api?.('api/door');
    if (!url || typeof fetch !== 'function') return null;
    if (want) url.searchParams.set('want', want);
    if (back) url.searchParams.set('back', back);
    if (not && not.length) url.searchParams.set('not', not.join(','));
    const stop = typeof AbortController === 'function' ? new AbortController() : null, timer = setTimeout(() => stop?.abort(), DOOR_MS);
    try {
      // (the owner's key, when this visitor has it: the door answers with a note that lets them into a full room)
      const res = await fetch(url, { cache: 'no-store', ...(stop && { signal: stop.signal }), ...(this._key && { headers: { Authorization: `Bearer ${encodeURIComponent(this._key)}` } }) });
      const body = res.ok && /json/.test(res.headers.get('content-type') || '') ? await res.json() : null;
      return body && typeof body.room === 'string' && body.room && cleanRoom(body.room) === body.room ? body : null;
    } catch { return null; } finally { clearTimeout(timer); }
  }

  // Enters a room: the door is asked which, then its relay is dialled (the transport keeps retrying by itself).
  async _enter(ask) {
    const turn = ++this._turn;
    const a = await this._askDoor(ask);
    if (turn !== this._turn || this._disposed || this.kicked || !this._dial) return;
    let room = a?.room;
    if (!room) {
      // no door: the room asked for — and, when it has said it was full, the next one ("<room>-2", "<room>-3"…)
      const base = ask.back || ask.want || 'main';
      this._shard = ask.not && ask.not.length ? ((this._shard || 1) % MAX_SHARDS) + 1 : 1;
      room = this._shard === 1 ? base : `${base.slice(0, 44)}-${this._shard}`;
    }
    this._said = { ...this._said, ...(a && { why: a.why, ...(a.full && { full: a.full }), ...(a.gone && { gone: a.gone }), ...(a.closed && { closed: a.closed }) }) };
    if (this._ws) this._ws.close();
    this.room = room;
    this._ws = this._dial(room, a?.pass);
    this._ws.open();
  }

  /**
   * Leaves this room for another, without loading the page again: the avatar stays where it stands. The door
   * is asked first; when that room has no room, or is no more, nothing changes and the 'room' event says why
   * (`full` or `gone`, with `moved: false`). Resolves to true when the other room is being entered.
   */
  async switchRoom(name) {
    const want = cleanRoom(name);
    if (!want || want === this.room || !this._dial || this._disposed || this.kicked) return false;
    const turn = ++this._turn;
    const a = await this._askDoor({ want });
    if (turn !== this._turn || this._disposed || this.kicked) return false;
    if (a && a.room !== want) {
      this._emit('room', { room: this.room, label: this.label, why: '', moved: false, ...(a.full ? { full: want } : { gone: want }) });
      return false;
    }
    // (out of the room one was in: those who were there are no longer seen)
    const was = this._ws;
    this._ws = this._tr = null;
    if (was) was.close();
    for (const id of [...this.peers.keys()]) this._leave(id);
    this._back = this.room; // (should the other room say no after all, this one is gone back to)
    this._want = want; this._not = []; this._said = a ? { why: a.why } : null;
    this.room = want;
    this.id = 0;
    this._changed();
    this._ws = this._dial(want, a?.pass);
    this._ws.open();
    this._fallback(FALLBACK_MS * 4);
    return true;
  }

  /** The rooms one may change to: [{ name, label, players, quiet? }] (the common rooms), or null when there is nobody to ask. */
  async rooms() {
    const url = this._api?.('api/rooms');
    if (!url || typeof fetch !== 'function' || this.mode !== 'online') return null;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const body = res.ok && /json/.test(res.headers.get('content-type') || '') ? await res.json() : null;
      return body && Array.isArray(body.rooms) ? body.rooms.filter((r) => r && typeof r.name === 'string' && Number.isFinite(r.players)).map((r) => ({ name: r.name, label: roomLabel(r.name), players: r.players, quiet: !!r.quiet })) : null;
    } catch { return null; }
  }

  /** Call every frame with the local avatar state; sends are throttled and skipped while nothing changes. */
  setLocal(x, y, z, yaw, anim = 0, flags = 0) {
    const l = this._local;
    l[0] = x; l[1] = y; l[2] = z; l[3] = yaw; l[4] = anim; l[5] = flags;
    this._hasLocal = true;
    this._flush(now());
  }

  /** Tells the others that a score of ours has just gone on a board ('sky', 'race', 'shoot'…): they fetch it. */
  sendScore(board) { if (this._tr && /^[a-z]{2,8}$/.test(board)) this._tr.send({ t: 'g', b: board }); }

  /** One-shot emote (0..31) shown to the others. */
  sendEmote(n) {
    const e = int(Math.trunc(n), 31, -1);
    if (e >= 0 && this._tr) this._tr.send({ t: 'e', e });
  }

  /**
   * One chat line for the room. Returns the text as sent ('' when empty, or when lines come too fast: the
   * relay would not pass them on either). Nothing is stored anywhere: who is not there does not get it.
   */
  sendChat(text, near = false, important = false) {
    const m = cleanChat(text), t = now();
    this._chat = Math.min(5, this._chat + (t - this._chatAt) / 2000);
    this._chatAt = t;
    if (!m || this._chat < 1) return '';
    if (important && !this.admin) return ''; // (the relay would not mark it either)
    this._chat -= 1;
    // (`near`: only those within 20 m get it; `important`: an administrator's line, shown to all in another colour)
    if (this._tr) this._tr.send(important ? { t: 'c', m, i: 1 } : near ? { t: 'c', m, n: 1 } : { t: 'c', m });
    return m;
  }

  /** The administrator's key ('' to give it up): the relay answers with an 'admin' event. */
  setAdminKey(key) {
    this._key = String(key || '');
    if (!this._key) { this.admin = this.owner = false; return; }
    if (this._tr && this.mode === 'online') this._tr.send({ t: 'admin', key: this._key });
  }
  /** The administrator: who is in the room (answered by a 'who' event), put someone out, keep them out. */
  who() { if (this.admin && this._tr) this._tr.send({ t: 'who' }); }
  kick(id) { if (this.admin && this._tr) this._tr.send({ t: 'kick', id }); }
  ban(id, hours = 0) { if (this.admin && this._tr) this._tr.send({ t: 'ban', id, h: hours }); }
  /**
   * The big red button. True when the relay was asked (it answers the whole room with a 'blast' event, or
   * this visitor alone with 'blastWait' when it is too soon); false when there is no relay to ask.
   */
  sendBlast() {
    if (!this._tr || this.mode !== 'online') return false;
    this._tr.send({ t: 'n' });
    return true;
  }
  /** Names that visitor an administrator (their browser is handed a key of its own: a 'promoted' event there). */
  promote(id) { if (this.admin && this._tr) this._tr.send({ t: 'promote', id }); }
  /** Tells that visitor's game that the shop has something new for them (a gift of the administrator: see /api/gift). */
  gifted(id) { if (this.admin && this._tr) this._tr.send({ t: 'gift', id }); }
  /** The owner has taken the title away (see /api/admins): whoever holds that key in this room loses it at once. */
  demote(key) { if (this.owner && this._tr) this._tr.send({ t: 'demote', key }); }

  /** An administrator lets it be known (a badge on their name, for everybody around), or no longer does. */
  setBadge(on) {
    if (this.badge === !!on) return;
    this.badge = !!on;
    if (this._tr) this._tr.send(this._hello());
  }

  setIdentity(name, color, kit = this.kit) {
    this.kit = int(kit, 255);
    this.name = cleanName(name, this.name);
    this.color = int(color, 31, this.color);
    this._persist();
    if (this._tr) this._tr.send(this._hello());
  }

  /**
   * Call every frame: moves every peer to its interpolated state. Playout follows the real clock (remote
   * players keep their real speed even when the game clamps or pauses its own dt), so `dtSeconds` is unused.
   */
  update(dtSeconds) {
    const t = now();
    for (const [id, peer] of this.peers) this._tracks.get(id).sample(t, peer);
    this._flush(t);
  }

  dispose() {
    this._disposed = true;
    this._turn++;
    clearTimeout(this._timer);
    for (const tr of [this._ws, this._bc]) if (tr) tr.close();
    this._ws = this._bc = this._tr = null;
    this.peers.clear();
    this._tracks.clear();
    this._on = {};
  }

  _emit(type, arg) {
    for (const fn of this._on[type] || []) {
      try { fn(arg); } catch (err) { console.error(err); } // a faulty listener must not break networking
    }
  }
  _persist() {
    try { localStorage.setItem('mmf.name', this.name); localStorage.setItem('mmf.color', String(this.color)); } catch { /* no storage */ }
  }
  _hello() { return { t: 'hello', name: this.name, color: this.color, v: 2, dev: this.device, s: this.session, ...(this.kit && { k: this.kit }), ...(BUILD && { b: BUILD }), ...(this.badge && { ad: 1 }) }; }

  _handlers(mode) {
    return {
      onopen: (tr) => tr.send(this._hello()),
      onmessage: (tr, m) => {
        try { this._message(tr, mode, m); } catch (err) { console.warn('[presence]', err); }
      },
      onclose: (tr) => {
        if (this.kicked) return; // put out: no coming back through the window
        if ((tr.full || tr.shut) && tr !== this._tr) return this._overflow(tr); // turned away: a full room, or a name that is not a room
        if (tr !== this._tr) return;
        this._tr = null; // peers stay frozen for a moment: a quick reconnection will not make them blink
        this._fallback(FALLBACK_MS);
      },
    };
  }

  // Still without a server after `delay` ms: use the BroadcastChannel, or declare the session offline.
  _fallback(delay) {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      if (this._tr || this._disposed) return;
      try {
        this._bc = new BroadcastTransport(this.room, this._handlers('local'));
        this._bc.open(); // throws where BroadcastChannel is missing
      } catch {
        this._bc = null;
        this._welcome(null, 'offline', { id: 0 });
      }
    }, delay);
  }

  // The room is full, or its name is not a room: back to the door, which is told (after a few rooms in a row
  // have said no — the fair is full, or the door cannot be reached — a pause, then again from the start).
  _overflow(tr) {
    if (tr !== this._ws || !this._dial) return;
    const room = this.room, shut = !!tr.shut;
    tr.close();
    this._ws = null;
    if (shut) { if (this._want === room) this._want = ''; if (this._back === room) this._back = ''; this._said = { ...this._said, closed: room }; }
    else if (room === this._want) this._said = { ...this._said, full: room };
    this._not = [...new Set([...this._not, room])].slice(-10);
    const go = () => { if (!this._disposed && !this.kicked) this._enter({ want: this._want, back: this._back === room ? '' : this._back, not: this._not }); };
    if (++this._turned % TURNS === 0) { this._not = []; this._shard = 0; setTimeout(go, 8000); } else go();
  }

  _message(tr, mode, m) {
    if (!m || typeof m !== 'object' || this._disposed) return;
    if (m.t === 'full') { if (tr !== this._tr) tr.full = true; return; } // (acted upon when the relay then hangs up, see onclose)
    if (m.t === 'closed') { if (tr !== this._tr) tr.shut = true; return; } // (that name is not a room one may open: the same)
    if (m.t === 'kicked') return this._out(!!m.ban);
    if (m.t === 'welcome') {
      if (Number.isInteger(m.id)) this._welcome(tr, mode, m);
    } else if (tr !== this._tr) return;
    else if (m.t === 'u') this._states(m);
    else if (m.t === 'm') this._far(m);
    else if (m.t === 'w') this._seen = !!m.n;
    else if (m.t === 'r') this._emit('release', { release: m.r && typeof m.r === 'object' ? m.r : null, build: typeof m.v === 'string' ? m.v : '', refresh: Number.isFinite(m.f) ? m.f : 0 }); // (what is released has changed)
    else if (m.t === 'say') { const text = cleanChat(m.m); if (text) this._emit('announce', { text }); } // (a word from the fair, to every room)
    else if (m.t === 'quiet') { const to = cleanRoom(m.to); if (to && to !== this.room) this._emit('quiet', { to, label: roomLabel(to), n: Number.isFinite(m.n) ? Math.max(0, Math.floor(m.n)) : 0 }); } // (this room has gone quiet: another has room)
    else if (m.t === 'admin') { this.admin = !!m.ok; this.owner = this.admin && !!m.owner; this._emit('admin', { ok: this.admin, owner: this.owner, out: !!m.out }); }
    else if (m.t === 'gift') this._emit('gift', { by: cleanName(m.by || '') });
    else if (m.t === 'promoted') { if (typeof m.key === 'string' && m.key) this._emit('promoted', { key: m.key, by: cleanName(m.by || '') }); else this._emit('promoted', { id: m.id }); }
    else if (m.t === 'who') { if (Array.isArray(m.list)) this._emit('who', { list: m.list, now: m.now }); }
    else if (m.t === 'join') {
      if (this._join(m)) this._changed();
    } else if (m.t === 'leave') {
      if (this._leave(m.id)) this._changed();
    } else if (m.t === 'e' && this.peers.has(m.id) && int(m.e, 31, -1) >= 0) this._emit('emote', { id: m.id, emote: m.e });
    else if (m.t === 'n' && mode === 'online') {
      // the big red button went off (for everybody), or it is too soon (for who pressed it)
      const wait = Number.isFinite(m.wait) ? Math.max(0, m.wait) : 0;
      this.blastReadyAt = Date.now() + wait;
      if (Number.isInteger(m.id)) this._emit('blast', { id: m.id, self: m.id === this.id, peer: this.peers.get(m.id) || null, since: 0 });
      else this._emit('blastWait', { wait });
    } else if (m.t === 'g' && this.peers.has(m.id) && typeof m.b === 'string') this._emit('score', { id: m.id, peer: this.peers.get(m.id), board: m.b });
    else if (m.t === 'c' && this.peers.has(m.id)) {
      const text = cleanChat(m.m);
      if (text) this._emit('chat', { id: m.id, peer: this.peers.get(m.id), text, near: !!m.n, important: !!m.i });
    }
  }

  // A transport is ready (or none will be: tr = null): adopt it and make `peers` match its list, so that
  // newcomers join, the missing leave and the others (kept through a short disconnection) just carry on.
  _welcome(tr, mode, m) {
    clearTimeout(this._timer);
    if (this._bc && tr !== this._bc) { this._bc.close(); this._bc = null; }
    if (tr) tr.full = tr.shut = false;
    this._tr = tr; this.mode = mode; this.id = m.id;
    if (tr && mode === 'online') {
      // a room was entered: said once for each (with what the door had to say about the one that was asked for)
      const said = this._said || {}, moved = this._in !== this.room;
      this._said = null; this._not = []; this._turned = 0;
      this._want = this.room; // (from now on this is the room one comes back to, and whose door one knocks at again)
      if (moved || said.full || said.gone || said.closed) {
        this._in = this._back = this.room;
        this._emit('room', { room: this.room, label: this.label, why: said.why || '', moved, ...(said.full && said.full !== this.room && { full: said.full }), ...(said.gone && { gone: said.gone }), ...(said.closed && { closed: said.closed }) });
      }
    }
    this._interval = Math.max(SEND_MS, Number.isFinite(m.tick) ? m.tick : 0);
    // `idle`: how often to repeat an unchanged state. 0 = never (a relay that keeps the last state of everyone
    // and sleeps while its room is quiet); absent = our default (tabs talking to each other need it).
    this._keepalive = Number.isFinite(m.idle) && m.idle >= 0 ? m.idle : KEEPALIVE_MS;
    const stamp = Number.isFinite(m.now) ? m.now : now(), kept = new Set();
    for (const info of Array.isArray(m.peers) ? m.peers : []) if (this._join(info, stamp)) kept.add(info.id);
    for (const id of [...this.peers.keys()]) if (!kept.has(id)) this._leave(id);
    this._changed();
    this._sentKey = ''; this._due = 0; // share our own state right away
    this._seen = true;
    // (the big red button: when it is ready again; a show that is still going on is joined in the middle)
    this.blastReadyAt = 0;
    if (mode === 'online' && Array.isArray(m.blast) && Number.isFinite(m.blast[0])) {
      this.blastReadyAt = Date.now() + Math.max(0, m.blast[0]);
      if (Number.isFinite(m.blast[1]) && m.blast[1] < 50_000) this._emit('blast', { id: 0, self: false, peer: null, since: m.blast[1] / 1000 });
    }
    this.admin = this.owner = false;
    if (tr && mode === 'online' && this._key) tr.send({ t: 'admin', key: this._key });
    this._flush(now());
    this._emit('welcome', { mode }); // (a relay was reached — again, perhaps, after a delivery restarted it)
  }

  // Put out by the administrator: everything stops, and stays stopped.
  _out(ban) {
    this.kicked = { ban };
    this._turn++;
    clearTimeout(this._timer);
    for (const tr of [this._ws, this._bc]) if (tr) tr.close();
    this._ws = this._bc = this._tr = null;
    for (const id of [...this.peers.keys()]) this._leave(id);
    this.mode = 'offline';
    this._changed();
    this._emit('kicked', { ban });
  }

  // Adds a peer, or updates the identity of a known one. `stamp` (server time) is only given by a welcome.
  _join(info, stamp) {
    if (!info || !Number.isInteger(info.id) || info.id === this.id) return false;
    const name = cleanName(info.name), color = int(info.color, 31), kit = int(info.k, 255), admin = info.ad === 1; // (admin: an administrator who lets it be known)
    let peer = this.peers.get(info.id);
    const known = !!peer;
    if (!known) this.peers.set(info.id, (peer = { id: info.id, name, color, kit, admin, x: 0, y: 0, z: 0, yaw: 0, anim: 0, flags: 0, speed: 0, visible: false, far: false }));
    if (!known || stamp !== undefined) {
      // A welcome starts a new timeline (the server clock may have restarted): never reuse an old track.
      const track = new Track(this._interval), t = now();
      this._tracks.set(peer.id, track);
      // The state the server knows is of unknown age: date it one interval back so that live states follow it.
      if (Array.isArray(info.p)) track.push(stamp - this._interval, t, info.p[0], info.p[1], info.p[2], info.p[3], int(info.a, 15), int(info.f, 65535));
      track.sample(t, peer);
    }
    if (!known) this._emit('join', peer);
    else if (peer.name !== name || peer.color !== color || peer.kit !== kit || peer.admin !== admin) {
      peer.name = name; peer.color = color; peer.kit = kit; peer.admin = admin;
      this._emit('identity', peer);
    }
    return true;
  }

  _leave(id) {
    const peer = this.peers.get(id);
    if (!peer) return false;
    this.peers.delete(id);
    this._tracks.delete(id);
    this._emit('leave', peer);
    return true;
  }

  _changed() {
    const status = `${this.mode} ${this.count}`;
    if (status === this._status) return;
    this._status = status;
    this._emit('status', { mode: this.mode, count: this.count });
  }

  // {t:'u', now, s:[[id, x, y, z, yaw, anim, flags, age?], …], g?: [id, …]}: each state was captured at
  // `now - age`; `g` lists the peers the relay will no longer tell us about (too far, or too many closer ones).
  _states(m) {
    if (!Array.isArray(m.s)) return;
    const t = now(), base = Number.isFinite(m.now) ? m.now : t;
    for (const r of m.s) {
      const track = Array.isArray(r) ? this._tracks.get(r[0]) : null;
      if (!track) continue;
      const peer = this.peers.get(r[0]);
      if (peer) peer.far = false;
      track.push(base - (r[7] > 0 ? r[7] : 0), t, r[1], r[2], r[3], r[4], int(r[5], 15), int(r[6], 65535));
    }
    if (Array.isArray(m.g)) {
      for (const id of m.g) {
        const peer = this.peers.get(id);
        if (!peer) continue;
        // (a fresh track: when they come near again they appear where they are, not where they were)
        this._tracks.set(id, new Track(this._interval));
        peer.visible = false; peer.far = true;
      }
    }
  }

  // {t:'m', p:[id, x, z, …]}: roughly where everybody is. Only used for those we are not told about in detail.
  _far(m) {
    if (!Array.isArray(m.p)) return;
    for (let i = 0; i + 2 < m.p.length; i += 3) {
      const peer = this.peers.get(m.p[i]);
      if (!peer || peer.visible || !Number.isFinite(m.p[i + 1]) || !Number.isFinite(m.p[i + 2])) continue;
      peer.far = true; peer.x = m.p[i + 1]; peer.z = m.p[i + 2];
    }
  }

  // Sends the local state when its slot is due: at ~12 Hz while it changes, twice more once it stops (so the
  // others know we stand still instead of extrapolating), then only as a keep-alive, if the relay wants one.
  _flush(t) {
    const l = this._local;
    if (t < this._due || !this._tr || !this._hasLocal || ![l[0], l[1], l[2], l[3]].every(Number.isFinite)) return;
    const every = this._seen ? this._interval : Math.max(this._interval, UNSEEN_MS); // (nobody near: no hurry)
    this._due = Math.max(this._due + every, t + every / 2);
    const p = [round(l[0], 100), round(l[1], 100), round(l[2], 100), round(wrapAngle(l[3]), 1000)];
    const a = int(Math.trunc(l[4]), 15), f = int(Math.trunc(l[5]), 65535);
    const key = `${p}|${a}|${f}`;
    if (key !== this._sentKey) this._repeats = 0;
    else if (this._repeats >= 2 && (!this._keepalive || t - this._sentAt < this._keepalive)) return;
    else this._repeats++;
    this._sentKey = key; this._sentAt = t;
    this._tr.send({ t: 's', p, a, f });
  }
}
