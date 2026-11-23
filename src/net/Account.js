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
    this.mail = false; // can the server send e-mails (a code to set a new password)?
    this.email = ''; // the address of the account, most of it hidden (j•••@e•••.org); '' when it has none
  }

  _take(body) { const a = body?.account || null; this.name = a ? a.name : null; this.profile = a ? a.profile : null; this.email = (a && a.email) || ''; }
  _wrong(res) { return res.body?.error || (res.status === 0 ? 'The server cannot be reached.' : 'It did not work. Try again.'); }

  /** Is this browser signed in? Resolves to this. */
  async load() {
    const api = await hasApi();
    this.available = !!api;
    this.mail = !!api?.mail;
    if (!this.available) return this;
    try {
      const res = await fetch(`${BASE}api/account?device=${deviceId()}`);
      if (res.ok) this._take(await res.json());
    } catch { /* offline: a guest for now */ }
    return this;
  }

  /** A new account, with this browser in it (`email`: optional, where the server sends e-mail). Resolves to { recovery } (the code to write down), or { error }. */
  async create(name, password, profile, email = '') {
    const res = await post({ action: 'create', name, password, profile, ...(email && { email }) });
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

  /** Asks for a code to be mailed to the address of that account (the answer never tells whether one left). Resolves to {} or { error }. */
  async mailCode(name) {
    const res = await post({ action: 'mailcode', name });
    return res.ok ? {} : { error: this._wrong(res) };
  }

  /** Gives the account an address, changes it, or ('') takes it away — with the password. Resolves to {} or { error }. */
  async setEmail(email, password) {
    const res = await post({ action: 'email', email, password });
    if (!res.ok) return { error: this._wrong(res) };
    this._take(res.body);
    return {};
  }

  async logout() { await post({ action: 'logout' }); this.name = null; this.profile = null; this.email = ''; }

  /** Keeps the look of the robot on the account (nothing happens for a guest). */
  async save(profile) { if (this.name) { const res = await post({ action: 'save', profile }); if (res.ok) this.profile = profile; } }
}
