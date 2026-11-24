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
