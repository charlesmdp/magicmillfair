// The random name a browser gives itself, once, and keeps in its storage. It says nothing about who is
// visiting: it lets the server count the days in a row a visitor has come back, and hold on to a ban.
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export function deviceId() {
  let id = get('mmf.device');
  if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
    const bytes = new Uint8Array(16);
    (globalThis.crypto || { getRandomValues: (b) => b.forEach((_, i) => { b[i] = Math.floor(Math.random() * 256); }) }).getRandomValues(bytes);
    id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    set('mmf.device', id);
  }
  return id;
}
