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
    this.google = false; // can one sign in with Google here? (the server was given what it takes: server/google.js)
    this.viaGoogle = false; // is this account one that Google stands for?
    this.passwordless = false; // …and has it no password of its own?
    this.invited = false; // …because it was made with a name and an address, and the link to choose one was mailed
  }

  _take(body) { const a = body?.account || null; this.name = a ? a.name : null; this.profile = a ? a.profile : null; this.email = (a && a.email) || ''; this.viaGoogle = !!(a && a.google); this.passwordless = !!(a && a.passwordless); this.invited = !!(a && a.invited); }
  _wrong(res) { return res.body?.error || (res.status === 0 ? 'The server cannot be reached.' : 'It did not work. Try again.'); }

  /** Is this browser signed in? Resolves to this. */
  async load() {
    const api = await hasApi();
    this.available = !!api;
    this.mail = !!api?.mail;
    this.google = !!api?.google;
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

  /**
   * A new account from a name and an address — no password yet: the server makes it, signs this browser in and
   * mails a link to choose one (where it sends e-mail). Resolves to {} or { error, field ('name' | 'email': what
   * the error is about), same (the account that has this address already) }.
   */
  async join(name, email, profile) {
    const res = await post({ action: 'join', name, email, profile });
    if (!res.ok) return { error: this._wrong(res), field: res.body?.field || '', same: res.body?.same || '' };
    this._take(res.body);
    return {};
  }

  /** The link of that message: whose password it lets one choose — the name of the account, or '' when the link is no good any more. */
  async whose(token) {
    if (!(await hasApi())) return '';
    try { const res = await fetch(`${BASE}api/account?pw=${encodeURIComponent(token)}`); return res.ok ? String((await res.json()).name || '') : ''; } catch { return ''; }
  }

  /** …and the password is chosen: this browser is signed in. Resolves to {} or { error }. */
  async setPassword(token, password) {
    const res = await post({ action: 'setpw', token, password });
    if (!res.ok) return { error: this._wrong(res) };
    this._take(res.body);
    return {};
  }

  /** The link to choose a password is mailed again to the address of the account one is signed in to. Resolves to {} or { error }. */
  async invite() {
    const res = await post({ action: 'invite' });
    return res.ok ? {} : { error: this._wrong(res) };
  }

  /** Is that name free, and may it be worn? Resolves to { ok, free } — or null when nobody could say (no server, too many questions). */
  async free(name) {
    if (!(await hasApi())) return null;
    try { const res = await fetch(`${BASE}api/account?free=${encodeURIComponent(name)}`); return res.ok ? await res.json() : null; } catch { return null; }
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

  /**
   * Leaves the game for Google's page, where the visitor says who they are; the page comes back with a claim in
   * its address (?google=…: see `claim`). `name`: the name asked for, should this make a new account.
   */
  toGoogle(name = '') { location.assign(`${BASE}api/google/start${name ? `?name=${encodeURIComponent(name)}` : ''}`); }

  /**
   * Back from Google: claims what it said for this browser — signs in to the account Google stands for, or makes
   * one under `name`. Resolves to { created } or { error, needName (a name has to be chosen first: the claim waits) }.
   */
  async claim(claim, name, profile) {
    const res = await post({ action: 'google', claim, ...(name && { name }), profile });
    // (`suggest`: a name to put in the field — what stands before the @ of the Google address; `same`: the account
    // that has this very address already, to sign in to)
    if (!res.ok) return { error: this._wrong(res), needName: !!res.body?.needName, suggest: res.body?.suggest || '', same: res.body?.same || '' };
    this._take(res.body);
    return { created: !!res.body.created };
  }

  async logout() { await post({ action: 'logout' }); this.name = null; this.profile = null; this.email = ''; this.viaGoogle = false; this.passwordless = false; this.invited = false; }

  /** Keeps the look of the robot on the account (nothing happens for a guest). */
  async save(profile) { if (this.name) { const res = await post({ action: 'save', profile }); if (res.ok) this.profile = profile; } }
}
