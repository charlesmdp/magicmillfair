// Who runs the fair. Its owner holds ADMIN_KEY (a secret of the host, never kept here). The owner — and
// whoever they name — may name other visitors administrators: the visitor's browser is handed a key of its own
// (32 random bytes, drawn here), and only the SHA-256 of that key is kept, under `admins`:
//
//   { <id: the first 12 characters of the hash>: { hash, name (as they were called), by (who named them), at } }
//
// A named administrator does what the owner does (see who is here and where from, put someone out, approve
// a sponsor's panel, speak on the "important" channel, name others), except two things that stay the
// owner's: taking the title away from somebody, and being put out by another administrator.
import { randomId, sameSecret } from './token.js';
import { cleanName } from './protocol.js';

const enc = new TextEncoder();
const PREFIX = 'adm_';
export const MAX_ADMINS = 50;

const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hashOf = async (key) => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(key))));

/** Does this key look like one handed to a named administrator? (the store is only read for those) */
export const looksNamed = (key) => typeof key === 'string' && key.startsWith(PREFIX) && key.length <= 128;

/**
 * Whose key is this? { rank: 'owner' | 'admin', id } or null. `ownerKey` is the secret of the host ('' when
 * the host has checked it already).
 */
export async function adminOf(store, ownerKey, key) {
  if (typeof key !== 'string' || !key || key.length > 256) return null;
  if (ownerKey && sameSecret(key, ownerKey)) return { rank: 'owner', id: '' };
  if (!looksNamed(key)) return null;
  const all = await store.get('admins');
  if (!all || typeof all !== 'object') return null;
  const hash = await hashOf(key), id = hash.slice(0, 12), entry = Object.hasOwn(all, id) ? all[id] : null;
  return entry && sameSecret(entry.hash, hash) ? { rank: 'admin', id } : null;
}

/** Names an administrator: the key to hand to their browser (it is not kept), or null when there are too many. */
export async function nameAdmin(store, { name, by }, now) {
  const all = { ...((await store.get('admins')) || {}) };
  if (Object.keys(all).length >= MAX_ADMINS) return null;
  const key = `${PREFIX}${randomId(32)}`, hash = await hashOf(key);
  all[hash.slice(0, 12)] = { hash, name: cleanName(name || ''), by: cleanName(by || ''), at: now };
  await store.put('admins', all);
  return { key, id: hash.slice(0, 12) };
}

/** The named administrators, the latest first: [{ id, name, by, at }] (never a key, never a hash). */
export async function listAdmins(store) {
  const all = (await store.get('admins')) || {};
  return Object.entries(all).map(([id, e]) => ({ id, name: e.name, by: e.by, at: e.at })).sort((a, b) => b.at - a.at);
}

/** Takes the title away (the owner's doing). True when there was someone by that id. */
export async function removeAdmin(store, id) {
  const all = { ...((await store.get('admins')) || {}) };
  if (typeof id !== 'string' || !Object.hasOwn(all, id)) return false;
  delete all[id];
  await store.put('admins', all);
  return true;
}
