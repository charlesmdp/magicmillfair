// Coming back day after day: the server counts how many days in a row this device has visited (POST
// /api/visit, see server/routes.js) — this browser counts by itself when there is no server to ask.
// The device is a random number drawn here once: it says nothing about who is visiting.
import { localDay, visit } from '../../server/visits.js';
import { deviceId } from './device.js';
import { callApi } from './api.js';

const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

/** Counts today's visit. Resolves to { days (in a row, today included), best, shared (counted by the server) }. Never throws. */
export async function countVisit(name = '') {
  const tz = new Date().getTimezoneOffset();
  const body = await callApi('api/visit', { method: 'POST', body: { device: deviceId(), tz, ...(name && { name }) } });
  if (body && Number.isInteger(body.days)) { set('mmf.visits', JSON.stringify({ day: body.today, days: body.days, best: body.best })); return { days: body.days, best: body.best, shared: true }; }
  // (offline, or a site of plain files: this browser counts by itself)
  let seen = null;
  try { seen = JSON.parse(get('mmf.visits')); } catch { /* nothing kept */ }
  const next = visit(seen, localDay(Date.now(), tz));
  set('mmf.visits', JSON.stringify(next));
  return { days: next.days, best: next.best, shared: false };
}
