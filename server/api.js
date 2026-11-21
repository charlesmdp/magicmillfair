// The small HTTP API of the game, shared by the Node server and the Cloudflare Worker: who may ask, how often,
// and what a request looks like once read. The routes themselves are in routes.js (with scores.js) and npc.js.
import { originAllowed } from './protocol.js';

export const BODY_MAX = 4096; // bytes of JSON a POST may carry

/** Counts what each client does: allow(key, max, windowMs) is true while `key` stays under `max` per window. */
export class Limiter {
  constructor() { this.hits = new Map(); this.swept = 0; }

  allow(key, max, windowMs, now = Date.now()) {
    if (now - this.swept > 60_000) {
      this.swept = now;
      for (const [k, h] of this.hits) if (now - h.since > h.window) this.hits.delete(k);
    }
    let h = this.hits.get(key);
    if (!h || now - h.since > windowMs) this.hits.set(key, (h = { since: now, count: 0, window: windowMs }));
    return ++h.count <= max;
  }
}

/** How often one address may do what (per route). */
export const LIMITS = {
  scores: [[8, 60_000], [90, 3600_000]], // a climb takes minutes, a game at a booth less than one
  run: [[30, 60_000], [400, 3600_000]], // a note for each start (the start plate of the climb is left often)
  visit: [[10, 60_000], [60, 3600_000]],
  npc: [[10, 60_000], [120, 3600_000]],
  npcDay: [3000, 24 * 3600_000], // everyone together: a ceiling on what the key can spend in a day
};

export function allowed(limiter, route, client, now) {
  // (every window is counted, even when an earlier one already says no)
  return LIMITS[route].map(([max, window]) => limiter.allow(`${route}:${window}:${client}`, max, window, now)).every(Boolean);
}

/** JSON text → object, or null (too long, not JSON, not an object). */
export function parseBody(text) {
  if (typeof text !== 'string' || text.length > BODY_MAX) return null;
  try { const v = JSON.parse(text); return v && typeof v === 'object' ? v : null; } catch { return null; }
}

/** A page of another site must not post in a visitor's name (browsers always say where a POST comes from). */
export const mayPost = (origin, host, allowedOrigins) => originAllowed(origin, host, allowedOrigins);
