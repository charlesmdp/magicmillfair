// Who is kept out of the fair, and how. By address, by browser (the random name it gave itself), by account —
// for a time or for good — in one of two ways:
//   out      the visitor is told so and turned away at the door (the relay refuses the connection);
//   quiet    in silence: the visitor notices nothing. They play, and everybody sees them — but what they write
//            is heard by nobody, their scores show on their own screen only, what they sponsor is not shown,
//            and the big red button only goes off for them (protocol.js, routes.js, shop.js).
//
//   GET    /api/bans                                           → { bans: [{ kind, key, until, name, at, quiet? }] }
//   POST   /api/bans { ip?, dev?, acct?, name?, hours?, quiet? }  → the same list (hours 0: for good)
//   DELETE /api/bans?ip=… | dev=… | acct=…                     → { removed }
//   (an administrator's key with each; from a room, an administrator does the same with {t:'ban'}: protocol.js)
// A silence set, or lifted, here holds at once for a visitor who is connected: the host tells its rooms
// (ctx.hush({ ip, dev }, on) — by account, it holds from their next connection).
//
// Kept under one key, `bans`: { ip: { address: entry }, dev: { device: entry }, acct: { name: entry } },
// entry = { until (ms, 0 = for good), name (as they were called), at, quiet? }. A browser that is signed in
// when it is kept out takes its account with it: the ban follows it to its other browsers.
import { cleanName } from './protocol.js';
import { accountOf, accountName } from './accounts.js';

const out = (status, body, headers = {}) => ({ status, body, headers });
const DEVICE = /^[A-Za-z0-9_-]{16,64}$/, ADDRESS = /^[0-9a-fA-F:.]{2,64}$/;
const KINDS = ['ip', 'dev', 'acct'];

const liveBans = (bans, now) => {
  const live = { ip: {}, dev: {}, acct: {} };
  for (const kind of KINDS) for (const [k, e] of Object.entries(bans?.[kind] || {})) if (e && (e.until === 0 || e.until > now)) live[kind][k] = e;
  return live;
};

/** How this visitor is kept out: 'out', 'quiet' (see the top of this file) or '' — by address, by browser, by the account of that browser. */
export async function keptOut(ctx, ip, dev) {
  const bans = await ctx.store.get('bans');
  if (!bans) return '';
  const live = liveBans(bans, ctx.now()), hits = [];
  if (ip && Object.hasOwn(live.ip, ip)) hits.push(live.ip[ip]);
  if (dev && Object.hasOwn(live.dev, dev)) hits.push(live.dev[dev]);
  if (dev && Object.keys(live.acct).length) {
    const acct = await accountOf(ctx.store, dev);
    if (acct && Object.hasOwn(live.acct, acct.name.toLowerCase())) hits.push(live.acct[acct.name.toLowerCase()]);
  }
  return hits.some((e) => !e.quiet) ? 'out' : hits.length ? 'quiet' : '';
}
/** Is this address, or this browser, turned away at the door? */
export const banned = async (ctx, ip, dev) => (await keptOut(ctx, ip, dev)) === 'out';
/** Is anybody kept out in silence at all? (Most of the time nobody is: nothing more needs to be looked up.) */
export async function anyQuiet(ctx) {
  const bans = await ctx.store.get('bans');
  if (!bans) return false;
  const live = liveBans(bans, ctx.now());
  return KINDS.some((kind) => Object.values(live[kind]).some((e) => e.quiet));
}
/** The browsers and the accounts that are kept out in silence: { dev: Set, acct: Set } (what they sponsor is not shown). */
export async function quietOnes(ctx) {
  const live = liveBans(await ctx.store.get('bans'), ctx.now());
  const pick = (kind) => new Set(Object.entries(live[kind]).filter(([, e]) => e.quiet).map(([k]) => k));
  return { dev: pick('dev'), acct: pick('acct') };
}

/** Keeps an address, a browser and / or an account out for `hours` (0: for good); `quiet`: in silence. Returns how many were added. */
export async function addBan(ctx, { ip, dev, acct, name, hours, quiet }) {
  const now = ctx.now(), bans = liveBans(await ctx.store.get('bans'), now);
  const h = Math.max(0, Math.min(87600, Number(hours) || 0));
  const entry = { until: h > 0 ? now + h * 3600_000 : 0, name: cleanName(name || ''), at: now, ...(quiet && { quiet: true }) };
  let added = 0;
  if (typeof ip === 'string' && ADDRESS.test(ip)) { bans.ip[ip] = entry; added++; }
  if (typeof dev === 'string' && DEVICE.test(dev)) {
    bans.dev[dev] = entry; added++;
    // (a browser that is signed in: its account is kept out with it)
    const signed = await accountOf(ctx.store, dev);
    if (signed) bans.acct[signed.name.toLowerCase()] = entry;
  }
  const account = accountName(acct);
  if (account) { bans.acct[account.toLowerCase()] = entry; added++; }
  if (added) await ctx.store.put('bans', bans);
  return added;
}

/** /api/bans (see the top of this file); null for any other path. */
export async function bansRoute(req, ctx) {
  const { method, path, query, body } = req, now = ctx.now();
  if (path !== '/api/bans') return null;
  if (!req.admin) return out(403, { error: 'Forbidden.' });
  const bans = liveBans(await ctx.store.get('bans'), now);
  if (method === 'POST') {
    if (!(await addBan(ctx, body || {}))) return out(400, { error: 'Nobody to keep out.' });
    if (body.quiet) await Promise.resolve(ctx.hush?.({ ip: typeof body.ip === 'string' ? body.ip : '', dev: typeof body.dev === 'string' ? body.dev : '' }, true)).catch(() => {});
  } else if (method === 'DELETE') {
    let had = 0;
    for (const kind of KINDS) {
      const k = kind === 'acct' ? (query.get('acct') || '').toLowerCase() : query.get(kind) || '';
      if (!k || !Object.hasOwn(bans[kind], k)) continue;
      // (a silence that is lifted: they are heard again at once)
      if (bans[kind][k].quiet && kind !== 'acct') await Promise.resolve(ctx.hush?.({ [kind]: k }, false)).catch(() => {});
      delete bans[kind][k]; had++;
    }
    if (had) await ctx.store.put('bans', bans);
    return out(200, { removed: had });
  } else if (method !== 'GET' && method !== 'HEAD') return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD, POST, DELETE' });
  const live = liveBans(await ctx.store.get('bans'), now);
  return out(200, { bans: KINDS.flatMap((kind) => Object.entries(live[kind]).map(([key, e]) => ({ kind, key, ...e }))) });
}
