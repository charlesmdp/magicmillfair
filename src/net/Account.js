// An account, seen from the game: nobody needs one to play, but a visitor who signs in keeps what they bought,
// their days in a row and the look of their robot from one browser to the next (server/accounts.js).
// Everything goes through the server; this only asks, and remembers the answer.
import { hasApi } from './api.js';
import { deviceId } from './device.js';

const BASE = import.meta.env.BASE_URL;

async function post(body) {
  if (!(await hasApi())) return { ok: false, status: 0, body: null };
  try {
    const res = await fetch(`${BASE}api/account`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, device: deviceId() }) });
    return { ok: res.ok, status: res.status, body: /json/.test(res.headers.get('content-type') || '') ? await res.json() : null };
  } catch { return { ok: false, status: 0, body: null }; }
}

export class Account {
  constructor() {
    this.available = false; // is there a server to keep accounts?
    this.name = null; // the account this browser is signed in to
    this.profile = null; // the look it keeps: { name, color, hat, paint, trail }
  }

  _take(body) { const a = body?.account || null; this.name = a ? a.name : null; this.profile = a ? a.profile : null; }
  _wrong(res) { return res.body?.error || (res.status === 0 ? 'The server cannot be reached.' : 'It did not work. Try again.'); }

  /** Is this browser signed in? Resolves to this. */
  async load() {
    this.available = !!(await hasApi());
    if (!this.available) return this;
    try {
      const res = await fetch(`${BASE}api/account?device=${deviceId()}`);
      if (res.ok) this._take(await res.json());
    } catch { /* offline: a guest for now */ }
    return this;
  }

  /** A new account, with this browser in it. Resolves to { recovery } (the code to write down), or { error }. */
  async create(name, password, profile) {
    const res = await post({ action: 'create', name, password, profile });
    if (!res.ok) return { error: this._wrong(res) };
    this._take(res.body);
    return { recovery: res.body.recovery };
  }

  /** Signs this browser in. Resolves to {} or { error }. */
  async login(name, password) {
    const res = await post({ action: 'login', name, password });
    if (!res.ok) return { error: this._wrong(res) };
    this._take(res.body);
    return {};
  }

  /** A new password, with the recovery code given when the account was made. Resolves to {} or { error }. */
  async reset(name, code, password) {
    const res = await post({ action: 'reset', name, code, password });
    if (!res.ok) return { error: this._wrong(res) };
    this._take(res.body);
    return {};
  }

  async logout() { await post({ action: 'logout' }); this.name = null; this.profile = null; }

  /** Keeps the look of the robot on the account (nothing happens for a guest). */
  async save(profile) { if (this.name) { const res = await post({ action: 'save', profile }); if (res.ok) this.profile = profile; } }
}
