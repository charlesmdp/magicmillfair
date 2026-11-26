// Is there a server behind this site — the game's small API (server/routes.js) — or only files? Asked once,
// with a plain GET, so that a site of plain files is not sent requests it can only answer with errors.

let asked = null, ahead = 0, none = false; // (`ahead`: how far the server's clock is ahead of this device's, ms; `none`: asked, and there is no server)

/** Resolves to what the server says of itself ({ ok, npc, admin, shop, time }), or to null when there is none. */
export function hasApi() {
  if (!asked) {
    const sent = Date.now();
    asked = fetch(`${import.meta.env.BASE_URL}api/status`)
      .then(async (res) => {
        const body = res.ok && /json/.test(res.headers.get('content-type') || '') ? await res.json() : null;
        // (the answer was written about half way between the question and its arrival)
        if (body && body.ok === true && Number.isFinite(body.time)) ahead = body.time - (sent + Date.now()) / 2;
        return body && body.ok === true ? body : null;
      })
      .catch(() => null);
    asked.then((body) => { none = !body; });
  }
  return asked;
}

/** Is it known, here and now, that there is no server behind this site? (false: there is one, or nobody asked yet) */
export const noApi = () => none;

/**
 * The time it is for everybody (ms): the server's clock, as near as one request can tell — the same on every
 * device to a tenth of a second or so, whatever its own clock says. Without a server: this device's clock.
 */
export const sharedNow = () => Date.now() + ahead;

const RELAY_EPOCH = Date.UTC(2026, 0, 1); // (the relay of Cloudflare counts its milliseconds from there: cloudflare/worker.js)
let best = -Infinity, older = -Infinity, turned = 0;
/**
 * The relay said what time it is by its clock (ms), as it does ten times a second. Where that clock is the
 * server's (it counts from RELAY_EPOCH), this is a far better measure than the one request above: the message
 * that took the least time on its way says how far ahead the server is to a few hundredths of a second — so that
 * what two visitors see "at the same moment" (a wave, a start, a column that comes up) is the same moment.
 * The clock is never made to jump: it is brought there a few milliseconds at a time.
 */
export function heardRelay(relayNow) {
  const t = Date.now(), s = relayNow + RELAY_EPOCH - t; // (how far ahead, less what the message took to come)
  if (!Number.isFinite(s) || Math.abs(s - ahead) > 3000) return; // (a relay that counts from its own start — the Node server —, or a message held up for seconds)
  if (t - turned > 30000) { older = best; best = -Infinity; turned = t; } // (the last half minute or so counts: clocks drift)
  if (s > best) best = s;
  ahead += Math.max(-4, Math.min(4, Math.max(best, older) - ahead));
}

/** Is this an administrator's key? { ok, owner, dead } — `dead`: the server said no (not merely out of reach). Never throws. */
export async function checkAdminKey(key) {
  if (!(await hasApi())) return { ok: false, owner: false, dead: false };
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/admin`, { headers: { Authorization: `Bearer ${encodeURIComponent(key)}` } });
    const body = res.ok && /json/.test(res.headers.get('content-type') || '') ? await res.json() : null;
    return { ok: body?.ok === true, owner: body?.owner === true, dead: res.status === 403 };
  } catch { return { ok: false, owner: false, dead: false }; }
}

/** A JSON request to the API: the parsed answer when it is a JSON 2xx, else null. Never throws. */
export async function callApi(path, { method = 'GET', body, key } = {}) {
  if (!(await hasApi())) return null;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${path}`, {
      method,
      headers: { ...(body !== undefined && { 'content-type': 'application/json' }), ...(key && { Authorization: `Bearer ${encodeURIComponent(key)}` }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return res.ok && /json/.test(res.headers.get('content-type') || '') ? await res.json() : null;
  } catch { return null; }
}
