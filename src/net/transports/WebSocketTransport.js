// WebSocket transport: speaks the presence protocol with the relay (server/index.js under Node,
// cloudflare/worker.js on Cloudflare) and reconnects on its own.

const CONNECT_TIMEOUT = 10000; // ms before giving up on a handshake
const BACKOFF_MIN = 1000, BACKOFF_MAX = 15000; // reconnection delay: 1 s, doubling up to 15 s (±25 % of jitter)
const STABLE_MS = 5000; // a connection that lasted this long restarts the backoff
const PING_MS = 5000; // application ping: detects links that died without closing

export class WebSocketTransport {
  /**
   * @param {string} url ws(s):// URL, room included
   * @param {{ onopen?: Function, onmessage?: Function, onclose?: Function }} handlers called with (transport[, message])
   * @param {{ probeEvery?: number }} [options] fixed retry period (ms) used until a first connection succeeds
   */
  constructor(url, handlers = {}, { probeEvery = 0 } = {}) {
    this.url = url;
    this.handlers = handlers;
    this.probeEvery = probeEvery;
    this.ws = null;
    this.closed = this.everOpen = false;
    this.openedAt = 0; // 0 while not connected
    this.tries = 0;
    this.timer = this.beat = 0; // handshake timeout or retry delay / ping interval
  }

  open() { if (!this.closed && !this.ws) this._connect(); }

  /** Sends a protocol message; false when not connected (the message is dropped). */
  send(msg) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    try { this.ws.send(JSON.stringify(msg)); return true; } catch { return false; }
  }

  close() {
    this.closed = true;
    this.handlers = {};
    this._drop(this.ws);
  }

  _connect() {
    clearTimeout(this.timer);
    let ws, heard = 0, pinged = 0, checked = 0;
    try { ws = new WebSocket(this.url); } catch { return this._drop(null); } // bad URL, mixed content…
    this.ws = ws;
    // (after a long freeze of the page this timer may run before an `open` that is already queued: one more turn settles it)
    this.timer = setTimeout(() => { this.timer = setTimeout(() => this._drop(ws), 0); }, CONNECT_TIMEOUT);
    ws.onopen = () => {
      clearTimeout(this.timer);
      this.everOpen = true;
      this.openedAt = checked = performance.now();
      this.beat = setInterval(() => {
        const t = performance.now();
        const late = t - checked > PING_MS * 1.5; // frozen or throttled page: the answer may still be queued, no verdict
        checked = t;
        // Nothing came back since the previous ping: the link is dead even if the socket has not noticed.
        if (pinged && heard < pinged && !late) return this._drop(ws);
        pinged = t;
        // Always this exact text: on Cloudflare it is answered at the edge, without waking the room up.
        this.send({ t: 'ping' });
      }, PING_MS);
      this.handlers.onopen?.(this);
    };
    ws.onmessage = (ev) => {
      heard = performance.now();
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m && m.t !== 'pong') this.handlers.onmessage?.(this, m);
    };
    ws.onclose = () => this._drop(ws);
    ws.onerror = () => {}; // a close event always follows
  }

  // Tears a socket down (if it is still the current one) and, unless closed for good, schedules the next attempt.
  _drop(ws) {
    if (ws !== this.ws) return;
    clearTimeout(this.timer);
    clearInterval(this.beat);
    if (ws) {
      this.ws = null;
      ws.onopen = ws.onmessage = ws.onclose = null;
      try { ws.close(); } catch { /* already gone */ }
    }
    const lasted = this.openedAt ? performance.now() - this.openedAt : -1;
    this.openedAt = 0;
    if (lasted >= 0) this.handlers.onclose?.(this);
    if (this.closed) return;
    if (lasted > STABLE_MS) this.tries = 0;
    const delay = this.probeEvery && !this.everOpen ? this.probeEvery : Math.min(BACKOFF_MAX, BACKOFF_MIN * 2 ** this.tries++);
    this.timer = setTimeout(() => this._connect(), delay * (0.75 + Math.random() * 0.5));
  }
}
