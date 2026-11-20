// Presence: who else is in the room and where to draw them this frame. Nothing here is authoritative: every
// client just shares its own avatar state. Modes: 'online' (WebSocket server, see server/index.js), 'local'
// (tabs of the same browser, through a BroadcastChannel) or 'offline' (solo).
// A transport (./transports) is `new T(target, { onopen, onmessage, onclose })`, handlers receiving the transport
// first: open() starts and keeps connecting, send(msg) takes the client → server messages of the protocol,
// onmessage delivers the server → client ones, close() stops for good.
import { Track, wrapAngle } from './interp.js';
import { BroadcastTransport } from './transports/BroadcastTransport.js';
import { WebSocketTransport } from './transports/WebSocketTransport.js';

const SEND_MS = 1000 / 12; // own state goes out at ~12 Hz…
const KEEPALIVE_MS = 2000; // …or every 2 s while nothing changes (unless the relay asks for another period, or none)
const FALLBACK_MS = 2500; // no server after that long: same-browser presence takes over
const PROBE_MS = 30000; // then the same-origin server is probed again at this period

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
function wsUrl(raw, room) {
  try {
    const url = new URL(raw, typeof location !== 'undefined' ? location.href : undefined);
    if (/^https?:$/.test(url.protocol)) url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('room', room);
    return url.href;
  } catch { return null; }
}

export class Presence {
  /** @param {{ room?: string, name?: string, color?: number, url?: string }} [options] */
  constructor({ room, name, color, url } = {}) {
    this._page = typeof location !== 'undefined' ? location : { search: '', pathname: '', protocol: '' };
    this._query = new URLSearchParams(this._page.search);
    this._url = url;
    this.room = cleanRoom(room) || cleanRoom(this._query.get('room'))
      || cleanRoom(this._page.pathname.replace(/\/index\.html?$/i, '').replace(/_/g, '-')) || 'main';
    this.name = cleanName(name ?? stored('mmf.name'), '') || `Visitor ${10 + Math.floor(Math.random() * 90)}`;
    this.color = int(color, 15, int(parseInt(stored('mmf.color'), 10), 15, Math.floor(Math.random() * 16)));
    this._persist();
    this.id = 0; // own id in the room (0 until connected)
    this.mode = 'offline';
    /** @type {Map<number, { id, name, color, x, y, z, yaw, anim, flags, speed, visible }>} */
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
  }

  /** Players in the room, self included. */
  get count() { return this.peers.size + 1; }

  /** Events: 'status' { mode, count }, 'join' peer, 'leave' peer, 'emote' { id, emote }, 'chat' { id, peer, text }, 'identity' peer (renamed). */
  on(type, fn) { (this._on[type] ||= new Set()).add(fn); return this; }
  off(type, fn) { this._on[type]?.delete(fn); return this; }

  /** Picks a transport: explicit server, else same-origin server, else other tabs, else solo. Never throws. */
  connect() {
    if (this._started || this._disposed) return this;
    this._started = true;
    try {
      const explicit = this._url || (import.meta.env && import.meta.env.VITE_WS_URL) || this._query.get('ws');
      const target = explicit || /^https?:$/.test(this._page.protocol) ? wsUrl(explicit || '/ws', this.room) : null;
      if (target) {
        this._ws = new WebSocketTransport(target, this._handlers('online'), { probeEvery: explicit ? 0 : PROBE_MS });
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

  /** One-shot emote (0..31) shown to the others. */
  sendEmote(n) {
    const e = int(Math.trunc(n), 31, -1);
    if (e >= 0 && this._tr) this._tr.send({ t: 'e', e });
  }

  /**
   * One chat line for the room. Returns the text as sent ('' when empty, or when lines come too fast: the
   * relay would not pass them on either). Nothing is stored anywhere: who is not there does not get it.
   */
  sendChat(text) {
    const m = cleanChat(text), t = now();
    this._chat = Math.min(5, this._chat + (t - this._chatAt) / 2000);
    this._chatAt = t;
    if (!m || this._chat < 1) return '';
    this._chat -= 1;
    if (this._tr) this._tr.send({ t: 'c', m });
    return m;
  }

  setIdentity(name, color) {
    this.name = cleanName(name, this.name);
    this.color = int(color, 15, this.color);
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
  _hello() { return { t: 'hello', name: this.name, color: this.color, v: 1 }; }

  _handlers(mode) {
    return {
      onopen: (tr) => tr.send(this._hello()),
      onmessage: (tr, m) => {
        try { this._message(tr, mode, m); } catch (err) { console.warn('[presence]', err); }
      },
      onclose: (tr) => {
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

  _message(tr, mode, m) {
    if (!m || typeof m !== 'object' || this._disposed) return;
    if (m.t === 'welcome') {
      if (Number.isInteger(m.id)) this._welcome(tr, mode, m);
    } else if (tr !== this._tr) return;
    else if (m.t === 'u') this._states(m);
    else if (m.t === 'join') {
      if (this._join(m)) this._changed();
    } else if (m.t === 'leave') {
      if (this._leave(m.id)) this._changed();
    } else if (m.t === 'e' && this.peers.has(m.id) && int(m.e, 31, -1) >= 0) this._emit('emote', { id: m.id, emote: m.e });
    else if (m.t === 'c' && this.peers.has(m.id)) {
      const text = cleanChat(m.m);
      if (text) this._emit('chat', { id: m.id, peer: this.peers.get(m.id), text });
    }
  }

  // A transport is ready (or none will be: tr = null): adopt it and make `peers` match its list, so that
  // newcomers join, the missing leave and the others (kept through a short disconnection) just carry on.
  _welcome(tr, mode, m) {
    clearTimeout(this._timer);
    if (this._bc && tr !== this._bc) { this._bc.close(); this._bc = null; }
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
    this._flush(now());
  }

  // Adds a peer, or updates the identity of a known one. `stamp` (server time) is only given by a welcome.
  _join(info, stamp) {
    if (!info || !Number.isInteger(info.id) || info.id === this.id) return false;
    const name = cleanName(info.name), color = int(info.color, 15);
    let peer = this.peers.get(info.id);
    const known = !!peer;
    if (!known) this.peers.set(info.id, (peer = { id: info.id, name, color, x: 0, y: 0, z: 0, yaw: 0, anim: 0, flags: 0, speed: 0, visible: false }));
    if (!known || stamp !== undefined) {
      // A welcome starts a new timeline (the server clock may have restarted): never reuse an old track.
      const track = new Track(this._interval), t = now();
      this._tracks.set(peer.id, track);
      // The state the server knows is of unknown age: date it one interval back so that live states follow it.
      if (Array.isArray(info.p)) track.push(stamp - this._interval, t, info.p[0], info.p[1], info.p[2], info.p[3], int(info.a, 15), int(info.f, 255));
      track.sample(t, peer);
    }
    if (!known) this._emit('join', peer);
    else if (peer.name !== name || peer.color !== color) {
      peer.name = name; peer.color = color;
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

  // {t:'u', now, s:[[id, x, y, z, yaw, anim, flags, age?], …]}: each state was captured at `now - age`.
  _states(m) {
    if (!Array.isArray(m.s)) return;
    const t = now(), base = Number.isFinite(m.now) ? m.now : t;
    for (const r of m.s) {
      const track = Array.isArray(r) ? this._tracks.get(r[0]) : null;
      if (track) track.push(base - (r[7] > 0 ? r[7] : 0), t, r[1], r[2], r[3], r[4], int(r[5], 15), int(r[6], 255));
    }
  }

  // Sends the local state when its slot is due: at ~12 Hz while it changes, twice more once it stops (so the
  // others know we stand still instead of extrapolating), then only as a keep-alive, if the relay wants one.
  _flush(t) {
    const l = this._local;
    if (t < this._due || !this._tr || !this._hasLocal || ![l[0], l[1], l[2], l[3]].every(Number.isFinite)) return;
    this._due = Math.max(this._due + this._interval, t + this._interval / 2);
    const p = [round(l[0], 100), round(l[1], 100), round(l[2], 100), round(wrapAngle(l[3]), 1000)];
    const a = int(Math.trunc(l[4]), 15), f = int(Math.trunc(l[5]), 255);
    const key = `${p}|${a}|${f}`;
    if (key !== this._sentKey) this._repeats = 0;
    else if (this._repeats >= 2 && (!this._keepalive || t - this._sentAt < this._keepalive)) return;
    else this._repeats++;
    this._sentKey = key; this._sentAt = t;
    this._tr.send({ t: 's', p, a, f });
  }
}
