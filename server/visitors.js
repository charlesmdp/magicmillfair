// Where the visitors come from, for the administrator: the country and the town the host knows for each
// visit (Cloudflare tells its Workers; nobody else is asked, and no address is sent anywhere), counted by day
// and kept with the last visits.
//
//   visitors:days    { 'YYYY-MM-DD': { n: page loads, u: visitors (devices) that day, by: { FR: 12, … } } }   (90 days)
//   visitors:recent  [{ at, dev (the first 8 characters of the device), name, cc, city, region, n }]           (the last 300)
//
// A device that comes back within half an hour is the same visit (its line is brought up to date).
import { cleanName } from './protocol.js';

const DAYS = 90, RECENT = 300, SAME_VISIT = 30 * 60_000;
const text = (s, max) => (typeof s === 'string' ? s.replace(/[\p{C}<>]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** What a host says of where a request comes from → { cc, city, region } (cc: two capital letters), or null. */
export function cleanGeo(geo) {
  if (!geo || typeof geo !== 'object') return null;
  const cc = typeof geo.cc === 'string' && /^[A-Za-z]{2}$/.test(geo.cc) ? geo.cc.toUpperCase() : '';
  if (!cc || cc === 'XX') return null; // (XX: the host does not know)
  return { cc, city: text(geo.city, 60), region: text(geo.region, 60) };
}

/** "FR|Paris|Île-de-France" (each part URI-encoded) ↔ geo: how the hosts hand it on in a header. */
export const packGeo = (geo) => (geo ? [geo.cc, geo.city, geo.region].map((s) => encodeURIComponent(s || '')).join('|') : '');
export function unpackGeo(header) {
  if (typeof header !== 'string' || !header || header.length > 600) return null;
  try { const [cc, city, region] = header.split('|').map(decodeURIComponent); return cleanGeo({ cc, city, region }); } catch { return null; }
}

/**
 * Where a request comes from, read in the headers a proxy in front of the server may add (Cloudflare's
 * "visitor location" headers). `header(name)` gives a header. Only to be trusted behind such a proxy.
 */
export const geoFromHeaders = (header) => cleanGeo({ cc: String(header('cf-ipcountry') || ''), city: utf8(String(header('cf-ipcity') || '')), region: utf8(String(header('cf-region') || '')) });
// (a header is read one byte per character: what was sent as UTF-8 is put back together)
function utf8(s) {
  if (!/[\x80-\xff]/.test(s) || /[^\x00-\xff]/.test(s)) return s;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(s, (c) => c.charCodeAt(0))); } catch { return s; }
}

/** Counts a visit. `first`: this device had not come yet today. */
export async function noteVisit(store, { device, name, geo, first }, now) {
  const day = new Date(now).toISOString().slice(0, 10), cc = geo?.cc || '??';
  const days = { ...((await store.get('visitors:days')) || {}) };
  const d = days[day] ? { ...days[day], by: { ...days[day].by } } : { n: 0, u: 0, by: {} };
  d.n++;
  if (first) { d.u++; d.by[cc] = (d.by[cc] || 0) + 1; }
  days[day] = d;
  const keep = Object.keys(days).sort().slice(-DAYS);
  await store.put('visitors:days', Object.fromEntries(keep.map((k) => [k, days[k]])));
  const recent = [...((await store.get('visitors:recent')) || [])], dev = String(device).slice(0, 8);
  const last = recent.findLast?.((r) => r.dev === dev) ?? [...recent].reverse().find((r) => r.dev === dev);
  const who = name ? cleanName(name) : '';
  if (last && now - last.at < SAME_VISIT) Object.assign(last, { at: now, n: (last.n || 1) + 1, ...(who && { name: who }), ...(geo && { cc: geo.cc, city: geo.city, region: geo.region }) });
  else recent.push({ at: now, dev, name: who, cc: geo?.cc || '', city: geo?.city || '', region: geo?.region || '', n: 1 });
  await store.put('visitors:recent', recent.slice(-RECENT));
}

/** What the administrator is shown: the days (the latest first), the countries over those days, the last visits. */
export async function visitorsReport(store, now, { days: span = 30, recent: count = 120 } = {}) {
  const all = (await store.get('visitors:days')) || {}, recent = (await store.get('visitors:recent')) || [];
  const days = Object.keys(all).sort().reverse().slice(0, span).map((day) => ({ day, n: all[day].n || 0, u: all[day].u || 0, by: all[day].by || {} }));
  const countries = {};
  for (const d of days) for (const [cc, n] of Object.entries(d.by)) countries[cc] = (countries[cc] || 0) + n;
  return {
    now, today: new Date(now).toISOString().slice(0, 10), days,
    countries: Object.entries(countries).map(([cc, n]) => ({ cc, n })).sort((a, b) => b.n - a.n),
    recent: recent.slice(-count).reverse(),
  };
}
