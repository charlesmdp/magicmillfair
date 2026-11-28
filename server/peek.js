// A sponsor's form fills itself from the sponsor's own site. The sponsor types the address of their site and
// presses "Fill it in from my site": this server reads that one page and answers with the three things the page
// says of itself — a name, a line, an icon — and nothing else of it. The form is filled with them, every field
// still theirs to change; nothing is kept here, and nothing is saved until they save the form as before
// (shop.js: /api/sponsor).
//
//   POST /api/sponsor/peek { url, name?, line? }  → { ok, url, name, line, icon: { type, data (base64) } | null,
//                                                     from: { name, line, icon } }
//        (name, line: how many letters the form has room for — 28 and 40 as /api/sponsor keeps them, or fewer)
//        (from: where each was found — 'og:site_name' | 'og:title' | 'title' | 'address'; 'description' |
//         'og:description'; 'apple-touch-icon' | 'icon' | 'og:image' | 'favicon.ico' — '' for what was not)
//
// What is looked for (readPage): the name the site gives itself (og:site_name), or else the title of the page
// without its tail ("Acme Bikes | Handmade since 1980" → "Acme Bikes"); its description, cut to the room there is
// at the end of a sentence, of a clause or of a word; and the best icon it names — the largest of its
// apple-touch-icons and PNG or SVG icons, else the picture it shows when shared (og:image), else /favicon.ico.
//
// The address is typed by a stranger, and it is this server that goes there. So:
// - https only, on its usual port, with nobody's name or password in it — and a name of the public web: no
//   number in place of a name (an IP address, however it is written), no name without a dot, no `localhost`, no
//   `.local`, `.internal`, `.test` or the like (siteUrl);
// - a page that sends elsewhere is followed three times at the most, and each address it sends to is checked
//   the same way before anything goes there;
// - six seconds for the page, six more for its icon; 400 KB of the page are read and no more (what a page says
//   of itself is at its top), 600 KB for an icon (a heavier one is left where it is);
// - nothing of anybody goes with the request: no cookie, no address of the game, a plain User-Agent;
// - of the page, only the three things come back: its words cleaned as a sponsor's own are (cleanText of
//   shop.js: one line, no markup), its icon as the bytes of a picture — told by its first bytes, not by what the
//   site says it is. The browser redraws that picture on a canvas: only pixels are ever sent to /api/sponsor;
// - how often: LIMITS.peek for one address, LIMITS.peekDay for everybody together (api.js).
// (On Cloudflare a Worker cannot reach a private network at all. On a Node host, a public name that points at a
// private address is stopped by the certificate it would have to show for that name — and by nothing else.)
import { allowed, LIMITS } from './api.js';
import { cleanText, cleanUrl } from './shop.js';
import { maskWords } from './decency.js';

const out = (status, body, headers = {}) => ({ status, body, headers });
/** The limits of it all: ms, bytes, how many redirections, how many icons are tried, how many letters. */
export const PEEK = { timeout: 6000, page: 400_000, icon: 600_000, redirects: 3, tries: 4, name: 28, line: 40 };
const AGENT = 'Mozilla/5.0 (compatible; link-preview)';
// (names that are nobody's on the public web: a machine's own, a house's, the inside of a company)
const NOT_PUBLIC = /(^|\.)(localhost|local|localdomain|internal|intranet|private|corp|home|lan|test|invalid|arpa|onion)$/;

/** Why something could not be had: 'address', 'slow', 'page', 'elsewhere', 'redirects', 'error', 'unreachable'. */
class Refused extends Error { constructor(why) { super(why); this.why = why; } }

/** The address of a page this server may go and read, as a URL — or null (see the top of this file). */
export function siteUrl(text) {
  let u;
  if (typeof text !== 'string') return null;
  try { u = new URL(text.trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || u.href.length > 2000) return null;
  const host = u.hostname.toLowerCase().replace(/\.+$/, ''); // ("localhost." is localhost)
  // (a number in place of a name: [::1] keeps its brackets; 127.0.0.1 is digits and dots — and so are 2130706433,
  // 0x7f.1 and 127.1 by now: the parser has already read them as the address they are)
  if (!host.includes('.') || host.startsWith('[') || /^[\d.]+$/.test(host) || NOT_PUBLIC.test(host)) return null;
  return u;
}

/** The first `max` bytes of an answer — and whether there were more (the rest is not read). */
async function firstBytes(res, max) {
  const reader = res.body?.getReader?.(), chunks = [];
  let size = 0;
  if (!reader) { const all = new Uint8Array(await res.arrayBuffer()); return { bytes: all.subarray(0, max), over: all.length > max }; }
  while (size <= max) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.length) { chunks.push(value); size += value.length; }
  }
  if (size > max) reader.cancel().catch(() => {});
  const bytes = new Uint8Array(Math.min(size, max));
  let at = 0;
  for (const c of chunks) { if (at >= bytes.length) break; const part = c.subarray(0, bytes.length - at); bytes.set(part, at); at += part.length; }
  return { bytes, over: size > max };
}

/**
 * One thing fetched from the public web within `ms`: → { url (where it was found in the end), type (what the
 * site says it is), bytes (`max` at the most), over (there was more) }. A redirection is followed by hand — its
 * address checked like the first — PEEK.redirects times at the most. Throws a Refused otherwise.
 */
async function fetchOne(fetcher, first, accept, max, ms) {
  const ctl = new AbortController();
  let timer = 0;
  const late = new Promise((_, no) => { timer = setTimeout(() => { ctl.abort(); no(new Refused('slow')); }, ms); });
  const work = (async () => {
    for (let u = first, hop = 0; ; hop++) {
      const res = await fetcher(u.href, { method: 'GET', redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': AGENT, Accept: accept, 'Accept-Language': 'en' } });
      const sent = res.status >= 300 && res.status < 400 && res.status !== 304;
      if (!sent && res.status >= 200 && res.status < 300) return { url: u, type: String(res.headers.get('content-type') || '').toLowerCase(), ...(await firstBytes(res, max)) };
      const to = sent ? res.headers.get('location') : null;
      try { res.body?.cancel?.()?.catch?.(() => {}); } catch { /* nothing to let go of */ }
      if (!to) throw new Refused('error');
      if (hop >= PEEK.redirects) throw new Refused('redirects');
      let next = null;
      try { next = siteUrl(new URL(to, u).href); } catch { /* not an address at all */ }
      if (!next) throw new Refused('elsewhere');
      u = next;
    }
  })();
  work.catch(() => {}); // (when the time is up first, what was waited for may still fail afterwards: nobody listens any more)
  try { return await Promise.race([work, late]); } catch (err) { throw err instanceof Refused ? err : new Refused('unreachable'); } finally { clearTimeout(timer); }
}

// ---------------------------------------------------------------------------------- what a page says of itself

const LATIN = 'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'.split(' ');
const NAMED = { amp: 38, lt: 60, gt: 62, quot: 34, apos: 39, OElig: 338, oelig: 339, Scaron: 352, scaron: 353, Yuml: 376, ndash: 8211, mdash: 8212, lsquo: 8216, rsquo: 8217, sbquo: 8218, ldquo: 8220, rdquo: 8221, bdquo: 8222, bull: 8226, hellip: 8230, euro: 8364, trade: 8482, ...Object.fromEntries(LATIN.map((n, i) => [n, 160 + i])) };
/** `&amp;`, `&#233;`, `&#xe9;`, `&eacute;` read as the letters they stand for (what is not one of them stays as written). */
const spelled = (text) => String(text).replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,8});?/gi, (all, e) => {
  const code = e[0] !== '#' ? (Object.hasOwn(NAMED, e) ? NAMED[e] : -1) : /^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  return code < 0 ? all : code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ' ';
});
/** Words read on a page, made fit to show as a sponsor's own are: whatever markup they hold taken out, one line, decent. */
const words = (text) => maskWords(cleanText(String(text ?? '').replace(/<[/!?]?[a-z][^>]*>/gi, ' ').replace(/\ufffd/g, ''), 600));

/**
 * Words cut to the room there is: whole when they fit; otherwise as far as the last sentence that fits, or the
 * last clause — and failing those, cut at a word, with "…" to show that there was more.
 */
export function fit(text, max) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  for (const end of [/[.!?…](?=\s)/g, /\s[|–—·•]\s|[;:,](?=\s)/g]) {
    let best = null;
    for (const m of t.matchAll(end)) if (m.index <= max - (/[!?]/.test(m[0]) ? 1 : 0)) best = m;
    if (best && best.index >= Math.min(12, max / 2)) return t.slice(0, best.index + (/[!?]/.test(best[0]) ? 1 : 0)).trim();
  }
  const cut = t.slice(0, max - 1), at = /\s/.test(t[max - 1]) ? cut.length : cut.lastIndexOf(' '); // (a word that ends just where the room does is whole)
  return `${(at >= max / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:.|–—·•(-]+$/, '')}…`;
}

const GENERIC = /^(home|home ?page|welcome|accueil|bienvenue|index|start|startseite|inicio|untitled)$/i;
const plain = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
/**
 * The name in the title of a page: a title is often "the name | what it does" — or "Home – the name". Of its
 * parts, the one that is the name of the site as its address has it; otherwise the first (the last when the
 * first only says "Home").
 */
export function nameIn(title, host = '') {
  const parts = String(title || '').split(/\s+[|–—·•»]+\s+|\s+-+\s+|\s*\|\s*|\s*::\s*|:\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return parts[0] || '';
  const labels = String(host).split('.').slice(0, -1).map(plain).filter((l) => l.length >= 3 && l !== 'www');
  const score = (p) => { const q = plain(p); return q.length < 3 ? 0 : Math.max(0, ...labels.map((l) => (l === q ? 1000 : q.includes(l) ? 500 + l.length : l.includes(q) ? q.length : 0))); };
  const own = parts.map((p) => [score(p), p]).sort((a, b) => b[0] - a[0])[0];
  return own[0] > 0 ? own[1] : GENERIC.test(parts[0]) ? parts[parts.length - 1] : parts[0];
}

const TAG = /<(meta|link|base)\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;
const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+)))?/g;
/** The attributes of a tag: { name: value } (names in lower case; the first of a name counts, as in a browser). */
function attrs(text) {
  const a = Object.create(null);
  for (const m of text.matchAll(ATTR)) { const k = m[1].toLowerCase(); if (!(k in a)) a[k] = spelled(m[2] ?? m[3] ?? m[4] ?? ''); }
  return a;
}

/** The largest side a `sizes` attribute declares ("16x16 32x32" → 32), 0 when it declares none. */
const declared = (sizes) => Math.max(0, ...String(sizes || '').toLowerCase().split(/\s+/).map((s) => { const m = /^(\d+)x(\d+)$/.exec(s); return m ? Math.max(Number(m[1]), Number(m[2])) : 0; }));

/** A picture written into the page itself (`data:image/…`), as bytes — or null. */
function inlined(href) {
  const m = /^data:image\/[a-z0-9.+-]+((?:;[^,;]*)*),(.*)$/is.exec(href);
  if (!m || m[2].length > PEEK.icon * 1.4) return null;
  try { return /;base64$/i.test(m[1]) ? Uint8Array.from(atob(m[2].replace(/\s+/g, '')), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(m[2])); } catch { return null; }
}

/**
 * What a page says of itself. `html`: its text (its top is enough); `at`: its address (a URL). → { name, line (as
 * written, not cut yet), from: { name, line }, icons: [{ url | bytes, from }] — the best first }.
 */
export function readPage(html, at) {
  // (what is in a comment, a script or a style sheet is not what the page says of itself)
  const text = String(html || '').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  const meta = Object.create(null), links = [];
  let base = at;
  for (const m of text.matchAll(TAG)) {
    const tag = m[1].toLowerCase(), a = attrs(m[2]);
    if (tag === 'meta') { const k = String(a.property || a.name || '').toLowerCase().trim(); if (k && typeof a.content === 'string' && !(k in meta) && words(a.content)) meta[k] = a.content; }
    else if (tag === 'link' && a.rel && a.href) links.push(a);
    else if (tag === 'base' && a.href && base === at) { try { base = new URL(a.href, at); } catch { /* not an address */ } }
  }
  const title = words(spelled(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(text)?.[1] || ''));
  const host = at.hostname.replace(/^www\./, '');
  const [name, nameFrom] = meta['og:site_name'] ? [words(meta['og:site_name']), 'og:site_name']
    : meta['og:title'] && nameIn(words(meta['og:title']), host) ? [nameIn(words(meta['og:title']), host), 'og:title']
    : nameIn(title, host) ? [nameIn(title, host), 'title'] : [host, 'address'];
  const lineFrom = ['description', 'og:description', 'twitter:description'].find((k) => meta[k]) || '';

  // the icons, the best first: (0) its apple-touch-icons and its PNG or SVG icons, the largest declared first — an
  // apple-touch-icon that declares nothing is 180 pixels a side, a PNG 32; an SVG has no size at all, and counts for
  // more than the small ones only: not every browser draws every SVG —, (1) the picture it shows when it is shared,
  // (2) its other icons, (3) the one every site may have at its root
  const icons = [];
  const add = (href, from, rank, size) => {
    const bytes = /^\s*data:/i.test(href) ? inlined(href.trim()) : null;
    let url = null;
    if (!bytes) { try { url = siteUrl(new URL(href, base).href); } catch { /* not an address */ } }
    if ((bytes || url) && !icons.some((i) => url && i.url?.href === url.href)) icons.push({ ...(bytes ? { bytes } : { url }), from, rank, size, n: icons.length });
  };
  for (const a of links) {
    // (what kind of picture it names: what it says it is, the ending of its address, or what it is written with)
    const rel = a.rel.toLowerCase().split(/\s+/), kind = `${String(a.type || '').toLowerCase()} .${(/\.([a-z0-9]+)(?:[?#]|$)/i.exec(a.href)?.[1] || '').toLowerCase()} ${(/^\s*data:(image\/[a-z+]+)/i.exec(a.href)?.[1] || '').toLowerCase()}`;
    const svg = /svg/.test(kind), png = /png/.test(kind), size = declared(a.sizes);
    if (rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed')) add(a.href, 'apple-touch-icon', 0, (size || 180) + 0.5);
    else if (rel.includes('icon')) add(a.href, 'icon', svg || png ? 0 : 2, size || (svg ? 100 : png ? 32 : 0));
  }
  for (const k of ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image']) if (meta[k]) { add(meta[k], 'og:image', 1, 0); break; }
  add('/favicon.ico', 'favicon.ico', 3, 0);
  icons.sort((a, b) => a.rank - b.rank || b.size - a.size || a.n - b.n);
  return { name, line: lineFrom ? words(meta[lineFrom]) : '', from: { name: nameFrom, line: lineFrom === 'twitter:description' ? 'description' : lineFrom }, icons: icons.map(({ url, bytes, from }) => (bytes ? { bytes, from } : { url, from })) };
}

/** The text of a page from its bytes: in the alphabet its site, or the page itself, says it is written in (UTF-8 otherwise). */
function pageText(bytes, type) {
  const top = String.fromCharCode(...bytes.subarray(0, 2048));
  const said = /charset\s*=\s*["']?([\w-]+)/i.exec(type)?.[1] || /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(top)?.[1] || 'utf-8';
  try { return new TextDecoder(said).decode(bytes); } catch { return new TextDecoder().decode(bytes); }
}

/**
 * What kind of picture these bytes are, by what they begin with — never by what a site says they are: 'image/png',
 * 'image/jpeg', 'image/webp', 'image/gif', 'image/x-icon', 'image/bmp', 'image/avif', 'image/svg+xml' — or '':
 * not a picture (the page a site answers with when it has no icon, for one).
 */
export function pictureType(b) {
  if (!b || b.length < 16) return '';
  const s = (i, n) => String.fromCharCode(...b.subarray(i, i + n));
  if (b[0] === 0x89 && s(1, 3) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return 'image/webp';
  if (s(0, 4) === 'GIF8') return 'image/gif';
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0 && b[4] >= 1 && b[4] <= 64 && b[5] === 0) return 'image/x-icon';
  if (s(0, 2) === 'BM' && b[6] === 0 && b[7] === 0 && b[8] === 0 && b[9] === 0) return 'image/bmp';
  if (s(4, 4) === 'ftyp' && /^avi[fs]$/.test(s(8, 4))) return 'image/avif';
  // (an SVG is text: its first tag, after what may stand before it — a declaration, a doctype, comments)
  if (/^\ufeff?\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*|<!doctype[^>]*>\s*)*<svg[\s>]/i.test(new TextDecoder().decode(b.subarray(0, 4096)))) return 'image/svg+xml';
  return '';
}

const base64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

/**
 * What the site at `address` says of itself: { url, name, line, icon: { type, data } | null, from: { name, line,
 * icon } }. Throws (a Refused: `why` says what stood in the way) when the address is not one to go to, or the
 * page cannot be had. `fetcher`: fetch, or what stands in for it; `timeout`: ms for the page, and again for its icon.
 */
export async function peek(address, { fetcher = fetch, timeout = PEEK.timeout, name = PEEK.name, line = PEEK.line } = {}) {
  const first = siteUrl(address);
  if (!first) throw new Refused('address');
  const page = await fetchOne(fetcher, first, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1', PEEK.page, timeout);
  if (page.type && !/^(text\/(html|plain|xml)|application\/(xhtml\+xml|xml))\b/.test(page.type)) throw new Refused('page'); // (a picture, a PDF: not a page)
  const said = readPage(pageText(page.bytes, page.type), page.url);
  // its icon: the best that can be had, and is a picture — a few are tried, within one delay for them all
  let icon = null, iconFrom = '';
  const until = Date.now() + timeout;
  for (const c of said.icons.slice(0, PEEK.tries)) {
    const left = until - Date.now();
    if (left < 100) break;
    try {
      const got = c.bytes ? { bytes: c.bytes, over: c.bytes.length > PEEK.icon } : await fetchOne(fetcher, c.url, 'image/*,*/*;q=0.5', PEEK.icon, left);
      const type = got.over ? '' : pictureType(got.bytes);
      if (type) { icon = { type, data: base64(got.bytes) }; iconFrom = c.from; break; }
    } catch { /* that one cannot be had: the next */ }
  }
  return { url: cleanUrl(first.href), name: fit(said.name, name), line: fit(said.line, line), icon, from: { name: said.from.name, line: said.line ? said.from.line : '', icon: iconFrom } };
}

const SAID = {
  address: [400, 'The fair can only read a public site, at an address that starts with https://'],
  slow: [504, 'That site took too long to answer. Try again — or fill it in by hand.'],
  page: [502, 'There is no page to read at that address. Fill it in by hand.'],
  elsewhere: [502, 'That site sends its visitors somewhere the fair will not follow. Fill it in by hand.'],
  redirects: [502, 'That site sends its visitors from door to door, and the fair gave up. Fill it in by hand.'],
  error: [502, 'That site would not show its page. Check the address — or fill it in by hand.'],
  unreachable: [502, 'That site did not answer. Check the address — or fill it in by hand.'],
};
const room = (asked, most) => { const n = Math.floor(Number(asked)); return n >= 8 && n <= most ? n : most; };

/** Answers POST /api/sponsor/peek; returns nothing for any other path. */
export async function peekRoute(req, ctx) {
  if (req.path !== '/api/sponsor/peek') return null;
  if (req.method !== 'POST') return out(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
  const now = ctx.now();
  if (!allowed(ctx.limiter, 'peek', req.client, now) || !ctx.limiter.allow('peek:day', ...LIMITS.peekDay, now)) return out(429, { error: 'Too many requests.' }, { 'Retry-After': '60' });
  try {
    return out(200, { ok: true, ...(await peek(req.body?.url, { fetcher: ctx.fetch || fetch, name: room(req.body?.name, PEEK.name), line: room(req.body?.line, PEEK.line) })) });
  } catch (err) {
    const [status, error] = SAID[err instanceof Refused ? err.why : 'unreachable'] || SAID.unreachable;
    return out(status, { error });
  }
}
