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

const SEND_MS = 1000 / 12; // own state goes out at ~12 Hz…
const KEEPALIVE_MS = 2000; // …or every 2 s while nothing changes (unless the relay asks for another period, or none)
const UNSEEN_MS = 500; // …and only twice a second while nobody is close enough to be told about us (the relay says so)
const FALLBACK_MS = 2500; // no server after that long: same-browser presence takes over
const PROBE_MS = 30000; // then the same-origin server is probed again at this period
const MAX_SHARDS = 16; // how many rooms in a row are tried when they are full

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

function stored(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

// ws(s):// URL of the presence endpoint for a room; `raw` may be relative or http(s). Null when unusable.
// (`dev`: the random name of this browser — what a ban holds on to, besides the address)
function wsUrl(raw, room, dev) {
  try {
    const url = new URL(raw, typeof location !== 'undefined' ? location.href : undefined);
    if (/^https?:$/.test(url.protocol)) url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('room', room);
    if (dev) url.searchParams.set('dev', dev);
    return url.href;
  } catch { return null; }
}

export class Presence {
  /** @param {{ room?: string, name?: string, color?: number, url?: string }} [options] */
  constructor({ room, name, color, kit = 0, url } = {}) {
    this._page = typeof location !== 'undefined' ? location : { search: '', pathname: '', protocol: '' };
    this._query = new URLSearchParams(this._page.search);
    this._url = url;
    this.room = cleanRoom(room) || cleanRoom(this._query.get('room'))
      || cleanRoom(this._page.pathname.replace(/\/index\.html?$/i, '').replace(/_/g, '-')) || 'main';
    // A room holds a limited number of visitors: when it is full the relay says so, and the next ones gather
    // in "<room>-2", then "<room>-3"… `room` is the one in use, `shard` its number (1 = the room asked for).
    this.baseRoom = this.room;
    this.shard = 1;
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

  /**
   * Events: 'status' { mode, count }, 'join' peer, 'leave' peer, 'emote' { id, emote }, 'chat' { id, peer, text,
   * near }, 'identity' peer (renamed), 'admin' { ok }, 'who' { list } (the administrator's view of the room),
   * 'kicked' { ban }.
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
        this._dial = (room) => new WebSocketTransport(wsUrl(explicit || '/ws', room, this.device), this._handlers('online'), { probeEvery: explicit ? 0 : PROBE_MS });
        this._ws = this._dial(this.room);
        this._ws.open(); // keeps retrying in the background, whatever the fallback does
      }
      this._fallback(target ? FALLBACK_MS : 0);
    } catch (err) { console.warn('[presence]', err); }
    return this;
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
  _hello() { return { t: 'hello', name: this.name, color: this.color, v: 2, dev: this.device, s: this.session, ...(this.kit && { k: this.kit }) }; }

  _handlers(mode) {
    return {
      onopen: (tr) => tr.send(this._hello()),
      onmessage: (tr, m) => {
        try { this._message(tr, mode, m); } catch (err) { console.warn('[presence]', err); }
      },
      onclose: (tr) => {
        if (this.kicked) return; // put out: no coming back through the window
        if (tr.full && tr !== this._tr) return this._overflow(tr); // turned away from a full room
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

  // The room is full: try the next one (after sixteen of them, start again from the first a little later).
  _overflow(tr) {
    if (tr !== this._ws || !this._dial) return;
    tr.close();
    this.shard = this.shard >= MAX_SHARDS ? 1 : this.shard + 1;
    this.room = this.shard === 1 ? this.baseRoom : `${this.baseRoom.slice(0, 44)}-${this.shard}`;
    this._ws = this._dial(this.room);
    if (this.shard === 1) setTimeout(() => { if (!this._disposed) this._ws.open(); }, 8000); else this._ws.open();
  }

  _message(tr, mode, m) {
    if (!m || typeof m !== 'object' || this._disposed) return;
    if (m.t === 'full') { if (tr !== this._tr) tr.full = true; return; } // (acted upon when the relay then hangs up, see onclose)
    if (m.t === 'kicked') return this._out(!!m.ban);
    if (m.t === 'welcome') {
      if (Number.isInteger(m.id)) this._welcome(tr, mode, m);
    } else if (tr !== this._tr) return;
    else if (m.t === 'u') this._states(m);
    else if (m.t === 'm') this._far(m);
    else if (m.t === 'w') this._seen = !!m.n;
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
    if (tr) tr.full = false;
    this._tr = tr; this.mode = mode; this.id = m.id;
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
  }

  // Put out by the administrator: everything stops, and stays stopped.
  _out(ban) {
    this.kicked = { ban };
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
    const name = cleanName(info.name), color = int(info.color, 31), kit = int(info.k, 255);
    let peer = this.peers.get(info.id);
    const known = !!peer;
    if (!known) this.peers.set(info.id, (peer = { id: info.id, name, color, kit, x: 0, y: 0, z: 0, yaw: 0, anim: 0, flags: 0, speed: 0, visible: false, far: false }));
    if (!known || stamp !== undefined) {
      // A welcome starts a new timeline (the server clock may have restarted): never reuse an old track.
      const track = new Track(this._interval), t = now();
      this._tracks.set(peer.id, track);
      // The state the server knows is of unknown age: date it one interval back so that live states follow it.
      if (Array.isArray(info.p)) track.push(stamp - this._interval, t, info.p[0], info.p[1], info.p[2], info.p[3], int(info.a, 15), int(info.f, 65535));
      track.sample(t, peer);
    }
    if (!known) this._emit('join', peer);
    else if (peer.name !== name || peer.color !== color || peer.kit !== kit) {
      peer.name = name; peer.color = color; peer.kit = kit;
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
