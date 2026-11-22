// Signed notes the server hands out and recognises later (the start of a game run, for instance): a payload
// and its HMAC-SHA256, both base64url, joined by a dot. Web Crypto: the same code runs on Node and on Workers.
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const keys = new Map(); // secret → CryptoKey

async function keyOf(secret) {
  let k = keys.get(secret);
  if (!k) keys.set(secret, (k = crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])));
  return k;
}

/** 32 random bytes, as text: a secret, a nonce. */
export const randomId = (bytes = 16) => b64(crypto.getRandomValues(new Uint8Array(bytes)));

/** payload (any JSON value) → "payload.signature" */
export async function sign(secret, payload) {
  const body = b64(enc.encode(JSON.stringify(payload)));
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await keyOf(secret), enc.encode(body)));
  return `${body}.${b64(mac)}`;
}

/** The payload of a token signed with `secret`, or null (forged, damaged, not a token). */
export async function verify(secret, token) {
  if (typeof token !== 'string' || token.length > 600) return null;
  const [body, mac, more] = token.split('.');
  if (!body || !mac || more !== undefined) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await keyOf(secret), unb64(mac), enc.encode(body));
    return ok ? JSON.parse(dec.decode(unb64(body))) : null;
  } catch { return null; }
}

/** Compares two secrets without telling, by the time it takes, where they differ. */
/**
 * The key of an "Authorization: Bearer …" header. The game sends it percent-encoded, so that any character
 * can be in a key; a page loaded before that sends it as it is. Spaces round it do not count.
 */
export function bearerKey(header) {
  const raw = /^Bearer\s+(.+)$/i.exec(String(header || ''))?.[1]?.trim() || '';
  if (!/%[0-9a-f]{2}/i.test(raw)) return raw;
  try { return decodeURIComponent(raw); } catch { return raw; }
}

export function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i % y.length];
  return diff === 0;
}
