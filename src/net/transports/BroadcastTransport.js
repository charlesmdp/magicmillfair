// Same-browser fallback: tabs of one origin find each other through a BroadcastChannel, without any server.
// It turns what the tabs say into the server's messages (welcome / join / leave / u / e), so the façade cannot
// tell the difference. Every message on the channel carries its sender's identity and last state:
// { t: 'hello' | 'u' | 'e' | 'c' | 'v' | 'leave', id, name, color, now, s: [[id, x, y, z, yaw, anim, flags]] | [], e?, m?, k?, n?, d? }
// where `now` is the sender's own clock (each peer track measures its offset).

const TIMEOUT = 5000; // ms of silence after which a peer is gone
const KEEPALIVE = 2000; // ms of silence of our own after which we say hello again
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
    this.seen = new Map(); // peer id → { at, name, color }
    this.me = { name: '', color: 0, s: [] }; // repeated in every message
    this.spoke = this.swept = this.timer = 0;
    this.bye = () => this._post('leave');
  }

  /** Throws where BroadcastChannel is not available. */
  open() {
    if (this.bc) return;
    this.bc = new BroadcastChannel(`mmf-presence-${this.room}`);
    this.bc.onmessage = (ev) => this._receive(ev.data);
    this.swept = clock();
    this.timer = setInterval(() => this._sweep(), 1000);
    this.timer.unref?.(); // Node (tests): do not keep the process alive
    if (typeof addEventListener === 'function') { addEventListener('pagehide', this.bye); addEventListener('beforeunload', this.bye); }
    this.handlers.onopen?.(this);
    this._up({ t: 'welcome', id: this.id, now: Math.round(clock()), tick: 0, peers: [] }); // peers show up as they answer
  }

  /** Takes the client → server messages of the protocol (hello, s, e). */
  send(msg) {
    if (!this.bc || !msg) return false;
    if (msg.t === 'hello') { this.me.name = msg.name; this.me.color = msg.color; this._post('hello'); }
    else if (msg.t === 's') { this.me.s = [[this.id, ...msg.p, msg.a, msg.f]]; this._post('u'); }
    else if (msg.t === 'e') this._post('e', msg.e);
    else if (msg.t === 'c') this._post('c', undefined, msg.m, msg.n ? { n: 1, at: this.me.s[0]?.slice(1, 4) } : undefined);
    else if (msg.t === 'v') this._post('v', undefined, undefined, { k: msg.k, n: msg.n, d: msg.d }); // (a thing one steers: a boat of the regatta)
    return true;
  }

  close() {
    if (!this.bc) return;
    this.bye();
    clearInterval(this.timer);
    if (typeof removeEventListener === 'function') { removeEventListener('pagehide', this.bye); removeEventListener('beforeunload', this.bye); }
    this.handlers = {};
    this.bc.close();
    this.bc = null;
  }

  _up(msg) { this.handlers.onmessage?.(this, msg); }

  _post(t, e, m, near) {
    this.spoke = clock();
    try { this.bc.postMessage({ t, id: this.id, ...this.me, now: Math.round(this.spoke), e, m, ...near }); } catch { /* channel closed */ }
  }

  _receive(m) {
    if (!m || !['hello', 'u', 'e', 'c', 'v', 'leave'].includes(m.t) || !Number.isInteger(m.id) || m.id === this.id) return;
    const peer = this.seen.get(m.id);
    if (m.t === 'leave') {
      if (this.seen.delete(m.id)) this._up({ t: 'leave', id: m.id });
      return;
    }
    // Anybody heard is in the room: no handshake to miss, a tab that was timed out is back with its next message.
    this.seen.set(m.id, { at: clock(), name: m.name, color: m.color });
    if (!peer || peer.name !== m.name || peer.color !== m.color) this._up({ t: 'join', id: m.id, name: m.name, color: m.color });
    const row = Array.isArray(m.s) ? m.s[0] : null;
    // A state repeated by a hello or an emote is not fresh: only a newcomer takes it, as a starting point.
    if (Array.isArray(row) && row[0] === m.id && (m.t === 'u' || !peer)) this._up({ t: 'u', now: m.now, s: [row] });
    if (m.t === 'e') this._up({ t: 'e', id: m.id, e: m.e });
    if (m.t === 'v') this._up({ t: 'v', id: m.id, k: m.k, n: m.n, d: m.d });
    if (m.t === 'c') {
      // (a line said to those nearby: within 20 m of where we are, as the relay would have it)
      const mine = this.me.s[0], far = m.n && (!mine || !Array.isArray(m.at) || Math.hypot(mine[1] - m.at[0], mine[2] - m.at[1], mine[3] - m.at[2]) > 20);
      if (!far) this._up(m.n ? { t: 'c', id: m.id, m: m.m, n: 1 } : { t: 'c', id: m.id, m: m.m });
    }
    if (m.t === 'hello' && !peer) this._post('hello'); // a newcomer: tell it who and where we are
  }

  // Every second. Frame loops stop in hidden tabs but timers do not: keep saying that we are here.
  _sweep() {
    const t = clock();
    if (t - this.spoke > KEEPALIVE) this._post('hello');
    const stalled = t - this.swept > 2500; // this tab was asleep: read the queued messages before judging anyone
    this.swept = t;
    if (stalled) return;
    for (const [id, peer] of this.seen) {
      if (t - peer.at <= TIMEOUT) continue;
      this.seen.delete(id);
      this._up({ t: 'leave', id });
    }
  }
}
