// Same-browser fallback: tabs of one origin find each other through a BroadcastChannel, without any server.
// It turns what the tabs say into the server's messages (welcome / join / leave / u / e), so the façade
// cannot tell the difference. On the channel: {t:'hello',id,name,color,re} {t:'u',now,s:[row]} {t:'e',id,e}
// {t:'leave',id}; `now` is the sender's own clock (each peer track measures its offset).

const TIMEOUT = 5000; // ms of silence after which a peer is gone
const REANNOUNCE = 4000; // after being silent that long ourselves, introduce ourselves again first
const clock = () => performance.now();

export class BroadcastTransport {
  /**
   * @param {string} room
   * @param {{ onopen?: Function, onmessage?: Function }} handlers called with (transport[, message])
   */
  constructor(room, handlers = {}) {
    this.room = room;
    this.handlers = handlers;
    this.id = 1 + Math.floor(Math.random() * 0x7ffffffe); // random 31-bit id, never 0
    this.bc = null;
    this.seen = new Map(); // peer id → local time it was last heard
    this.identity = null; // { name, color } from our last hello
    this.state = null; // our last row [id, x, y, z, yaw, anim, flags]
    this.spoke = this.asked = this.swept = this.timer = 0;
    this.bye = () => this._post({ t: 'leave', id: this.id });
  }

  /** Throws where BroadcastChannel is not available. */
  open() {
    if (this.bc) return;
    this.bc = new BroadcastChannel(`mmf-presence-${this.room}`);
    this.bc.onmessage = (ev) => this._receive(ev.data);
    this.swept = clock();
    this.timer = setInterval(() => this._sweep(), 1000);
    this.timer.unref?.(); // Node only (tests): do not keep the process alive
    if (typeof addEventListener === 'function') {
      addEventListener('pagehide', this.bye);
      addEventListener('beforeunload', this.bye);
    }
    this.handlers.onopen?.(this);
    this._up({ t: 'welcome', id: this.id, now: Math.round(clock()), tick: 0, peers: [] }); // peers show up as they answer
  }

  /** Takes the client → server messages of the protocol (hello, s, e). */
  send(msg) {
    if (!this.bc || !msg) return false;
    if (msg.t === 'hello') {
      this.identity = { name: msg.name, color: msg.color };
      this._hello(false);
    } else if (msg.t === 's') {
      if (clock() - this.spoke > REANNOUNCE) this._hello(true); // the others have probably timed us out
      this.state = [this.id, ...msg.p, msg.a, msg.f];
      this._state();
    } else if (msg.t === 'e') this._post({ t: 'e', id: this.id, e: msg.e });
    return true;
  }

  close() {
    if (!this.bc) return;
    this.bye();
    clearInterval(this.timer);
    if (typeof removeEventListener === 'function') {
      removeEventListener('pagehide', this.bye);
      removeEventListener('beforeunload', this.bye);
    }
    this.handlers = {};
    this.bc.close();
    this.bc = null;
  }

  _up(msg) {
    this.handlers.onmessage?.(this, msg);
  }

  _post(msg) {
    try {
      this.bc.postMessage(msg);
      this.spoke = clock();
    } catch { /* channel closed */ }
  }

  // `re` marks an answer, which must not be answered again.
  _hello(re) {
    if (this.identity) this._post({ t: 'hello', id: this.id, name: this.identity.name, color: this.identity.color, re });
  }

  _state() {
    if (this.state) this._post({ t: 'u', now: Math.round(clock()), s: [this.state] });
  }

  _receive(m) {
    if (!m || typeof m !== 'object') return;
    const t = clock();
    const row = m.t === 'u' && Array.isArray(m.s) ? m.s[0] : null;
    const id = Array.isArray(row) ? row[0] : m.id;
    if (!Number.isInteger(id) || id === this.id) return;
    const known = this.seen.has(id);
    if (m.t === 'hello') {
      this.seen.set(id, t);
      this._up({ t: 'join', id, name: m.name, color: m.color });
      if (!m.re) { // a newcomer (or somebody who lost track): tell who and where we are
        this._hello(true);
        this._state();
      }
    } else if (!known) {
      // A stranger is talking: ask everybody to introduce themselves (at most once per second).
      if (m.t !== 'leave' && t - this.asked > 1000) {
        this.asked = t;
        this._hello(false);
      }
    } else if (m.t === 'leave') {
      this.seen.delete(id);
      this._up({ t: 'leave', id });
    } else if (row || m.t === 'e') {
      this.seen.set(id, t);
      this._up(row ? { t: 'u', now: m.now, s: [row] } : { t: 'e', id, e: m.e });
    }
  }

  _sweep() {
    const t = clock();
    const stalled = t - this.swept > 2500; // this tab was asleep: read the queued messages before judging anyone
    this.swept = t;
    if (stalled) return;
    for (const [id, at] of this.seen) {
      if (t - at > TIMEOUT) {
        this.seen.delete(id);
        this._up({ t: 'leave', id });
      }
    }
  }
}
