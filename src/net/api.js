// Is there a server behind this site — the game's small API (server/routes.js) — or only files? Asked once,
// with a plain GET, so that a site of plain files is not sent requests it can only answer with errors.

let asked = null;

/** Resolves to what the server says of itself ({ ok, npc, admin, shop, time }), or to null when there is none. */
export function hasApi() {
  asked ||= fetch(`${import.meta.env.BASE_URL}api/status`)
    .then(async (res) => {
      const body = res.ok && /json/.test(res.headers.get('content-type') || '') ? await res.json() : null;
      return body && body.ok === true ? body : null;
    })
    .catch(() => null);
  return asked;
}

/** A JSON request to the API: the parsed answer when it is a JSON 2xx, else null. Never throws. */
export async function callApi(path, { method = 'GET', body, key } = {}) {
  if (!(await hasApi())) return null;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${path}`, {
      method,
      headers: { ...(body !== undefined && { 'content-type': 'application/json' }), ...(key && { Authorization: `Bearer ${key}` }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    return res.ok && /json/.test(res.headers.get('content-type') || '') ? await res.json() : null;
  } catch { return null; }
}
