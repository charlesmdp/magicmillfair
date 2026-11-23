// The game in figures, for everybody to see (the page /opendata, and the same window in the game): how many
// keys were pressed, how far the robots have walked, for how long, how many came — today, this week, this
// month, ever — from how many countries, on what, from where, in which colours, how often the big red button
// was pressed, what the shop has sold.
//
// Nothing here says anything of anybody: only sums are kept, and, for each device (the random name a browser
// gave itself), the day it was last counted and what it was last counted as — so that nobody is counted twice.
//
//   POST /api/stats      { device, d: { keys, metres, secs, moving, blasts }, color, kind, os, from }
//                        what one browser did since it last said so (the game says so about once a minute)
//   GET  /api/stats      → the figures (see report())
//   POST /api/stats/set  { money, passes, people, since }   the owner only: what was before the counting began
//
// Kept: stats:all (the sums), stats:days (the last days), stats:live (who was heard from in the last minutes),
// stats:dev:<device> (see above). The shop tells of a sale with noteSale().
import { cleanGeo } from './visitors.js';

const DEVICE = /^[A-Za-z0-9_-]{16,64}$/;
const DAYS = 400, LIVE = 150_000, EVERY = 20_000; // days kept; how long one stays "here now"; the least between two posts of a device
const COLORS = 64;
const out = (status, body, headers = {}) => ({ status, body, headers });
const num = (v, max) => (Number.isFinite(v) && v > 0 ? Math.min(max, v) : 0);
const word = (s, max = 24) => (typeof s === 'string' ? s.replace(/[^\w .:+-]/g, '').trim().slice(0, max) : '');

const dayOf = (now) => new Date(now).toISOString().slice(0, 10);
const monthOf = (now) => dayOf(now).slice(0, 7);
/** The Monday of the week of `now`, as a day (weeks by the UTC calendar, like the boards of scores). */
const weekOf = (now) => { const d = new Date(now); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

const blank = (now) => ({ since: now, keys: 0, metres: 0, secs: 0, moving: 0, blasts: 0, money: 0, passes: 0, sales: 0, people: 0, colors: [], kind: {}, os: {}, from: {}, cc: {}, weeks: {}, months: {} });
const bump = (map, key, by = 1) => { if (!key) return; map[key] = (map[key] || 0) + by; if (map[key] <= 0) delete map[key]; };

/** What one browser did since it last said so: added to the sums. Returns false when it is not to be counted. */
async function count(ctx, body, geo) {
  const now = ctx.now(), device = body.device, d = body.d && typeof body.d === 'object' ? body.d : {};
  const key = `stats:dev:${device}`, was = await ctx.store.get(key);
  if (was && now - was.at < EVERY) return false; // (too soon after the last one: not counted)
  const all = (await ctx.store.get('stats:all')) || blank(now), days = (await ctx.store.get('stats:days')) || {};
  const day = dayOf(now), week = weekOf(now), month = monthOf(now);
  // what can have been done in the time since: no more (somebody will send a million)
  const span = Math.min(was ? (now - was.at) / 1000 + 5 : 180, 600);
  const secs = num(d.secs, span), add = { secs, moving: num(d.moving, secs), metres: num(d.metres, secs * 40), keys: Math.round(num(d.keys, secs * 30 + 20)), blasts: Math.round(num(d.blasts, 1)) };
  for (const k of Object.keys(add)) all[k] = (all[k] || 0) + add[k];
  const today = (days[day] ||= { u: 0, secs: 0 });
  today.secs += secs;
  // who is counted: once ever, once a day, once a week, once a month
  const me = was || { first: now };
  if (!was) all.people++;
  if (me.day !== day) today.u++;
  if (me.week !== week) bump(all.weeks, week);
  if (me.month !== month) bump(all.months, month);
  // what they are counted as: taken off what they were, put on what they are
  const color = Number.isInteger(body.color) && body.color >= 0 && body.color < COLORS ? body.color : null;
  const now2 = { color, kind: word(body.kind), os: word(body.os), from: word(body.from, 40) || (was ? was.from : ''), cc: cleanGeo(geo)?.cc || (was ? was.cc : '') };
  if (was && was.color !== null && was.color !== undefined) all.colors[was.color] = Math.max(0, (all.colors[was.color] || 0) - 1);
  if (color !== null) all.colors[color] = (all.colors[color] || 0) + 1;
  for (const k of ['kind', 'os', 'from', 'cc']) { if (was) bump(all[k], was[k], -1); bump(all[k], now2[k]); }
  for (let i = 0; i < all.colors.length; i++) all.colors[i] ||= 0;
  // (only so many days, weeks and months are kept)
  for (const k of Object.keys(days).sort().slice(0, -DAYS)) delete days[k];
  for (const k of Object.keys(all.weeks).sort().slice(0, -60)) delete all.weeks[k];
  for (const k of Object.keys(all.months).sort().slice(0, -36)) delete all.months[k];
  const live = (await ctx.store.get('stats:live')) || {};
  live[device.slice(0, 12)] = now;
  for (const k of Object.keys(live)) if (now - live[k] > LIVE) delete live[k];
  await ctx.store.put(key, { ...me, ...now2, at: now, day, week, month });
  await ctx.store.put('stats:all', all);
  await ctx.store.put('stats:days', days);
  await ctx.store.put('stats:live', live);
  return true;
}

/** The figures, as the page shows them. */
export async function report(ctx) {
  const now = ctx.now(), all = (await ctx.store.get('stats:all')) || blank(now), days = (await ctx.store.get('stats:days')) || {}, live = (await ctx.store.get('stats:live')) || {};
  // the countries: those of the visits the game has always counted (visitors.js: the last ninety days), and ours
  const cc = { ...all.cc };
  for (const d of Object.values((await ctx.store.get('visitors:days')) || {})) for (const k of Object.keys(d?.by || {})) cc[k] ||= 0;
  const top = (map, n) => Object.entries(map).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
  return {
    now, since: all.since,
    keys: all.keys, km: Math.round(all.metres) / 1000, minutes: Math.floor(all.secs / 60), hours: Math.round(all.secs / 360) / 10, movingHours: Math.round(all.moving / 360) / 10,
    blasts: all.blasts,
    here: Object.values(live).filter((at) => now - at <= LIVE).length,
    today: days[dayOf(now)]?.u || 0, week: all.weeks[weekOf(now)] || 0, month: all.months[monthOf(now)] || 0, people: all.people,
    countries: Object.keys(cc).length, topCountries: top(all.cc, 12),
    money: Math.round(all.money) / 100, passes: all.passes, sales: all.sales,
    colors: all.colors, kinds: top(all.kind, 6), os: top(all.os, 8), from: top(all.from, 12),
    days: Object.keys(days).sort().slice(-30).map((day) => ({ day, visitors: days[day].u, hours: Math.round(days[day].secs / 360) / 10 })),
  };
}

/** The shop has sold something: `cents` (of a dollar) came in; `pass`: it was a Game Pass. */
export async function noteSale(store, { cents = 0, pass = false } = {}, now = Date.now()) {
  const all = (await store.get('stats:all')) || blank(now);
  all.money += Math.max(0, Math.round(cents) || 0); all.sales = (all.sales || 0) + 1;
  if (pass) all.passes++;
  await store.put('stats:all', all);
}

/** The paths above. `req`, `ctx`: as for route() (routes.js). Returns an answer, or null for another path. */
export async function statsRoute(req, ctx) {
  const { method, path, body } = req;
  if (path === '/api/stats/set') {
    if (!req.admin) return out(403, { error: 'Forbidden.' });
    if (method !== 'POST' || !body) return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const all = (await ctx.store.get('stats:all')) || blank(ctx.now());
    if (Number.isFinite(body.money)) all.money = Math.max(0, Math.round(body.money * 100));
    for (const k of ['passes', 'people', 'since']) if (Number.isFinite(body[k])) all[k] = Math.max(0, Math.round(body[k]));
    await ctx.store.put('stats:all', all);
    return out(200, await report(ctx));
  }
  if (path !== '/api/stats') return null;
  if (method === 'GET' || method === 'HEAD') return out(200, await report(ctx), { 'Cache-Control': 'public, max-age=20' });
  if (method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD, POST' });
  if (!body || !DEVICE.test(body.device || '')) return out(400, { error: 'Not a count.' });
  return out(200, { counted: await count(ctx, body, req.geo) });
}
