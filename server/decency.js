// What may not be said in the chat, nor worn as a name, at the fair — for both sides: the relay masks and
// refuses (it is the one that counts), the page does the same to what it shows of one's own.
//
//   maskChat(text) → the line with every address of a site, and every word or phrase of the list, replaced by
//                    ********. Plain swearing is left alone: it is slurs, strong insults thrown at somebody,
//                    threats, calls to hurt oneself and slogans of hate that go.
//   maskWords(text) → the same without touching addresses (the words of a sponsor's panel).
//   nameOk(name)   → may a robot be called that? No address of a site, no "http", no @ — and none of the
//                    words of the list, nor the swear words the chat lets pass.
//
// The words themselves are not written here — nobody who opens the code of the game reads a list of them:
// only their fingerprints are (a hash of each word once folded: lower case, accents off, digits read as the
// letters they stand for, a letter repeated three times or more read as twice). A word is looked for whole,
// with or without a plural; the longest and least ambiguous ones are also found inside a longer word. To add
// words: `node tools/decency.mjs` prints the fingerprints of what it is given (see there).
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
/** A word as it is compared: lower case, no accents, digits as letters, no letter more than twice in a row. */
export const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[013457@$]/g, (c) => LEET[c]).replace(/(.)\1{2,}/g, '$1$1');
/** The fingerprint of a folded word, or of folded words with one space between them. */
export const print = (s) => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); } return (x >>> 0).toString(36); };

const set = (s) => new Set(s.split(' '));
// (whole words; phrases of two to PHRASE words; words also found inside longer ones, and how long they are;
// words that only a name may not hold)
const WORDS = set('1032mzp 10yzs8e 11sx6ip 125u7pk 12ehn81 14fkbtf 14oshhs 15fvo3p 19mj789 1b14trk 1ddoja5 1eaqa9n 1eww7cd 1fc3q8l 1fhzz46 1gglqc1 1hoc0u7 1mc1123 1ogqgnx 1p1uv49 1p3zm3i 1smf5ui 1ul1uk4 1vngl4n 1wfnhou 1wktobu 1x6y0cl 1ycbij3 2q5bi9 4a2xs8 5kl94a 8ntpvt 9qwfiv cu748w dzzt2u f79hgw fee1dy gkza80 iaifv6 jyg210 k3an6t kbo9sv mboo57 pc1mej qe0pv8 rkfry0 rozh1b tg06pa u74m7v w1l9s4 wn47zj x1gwtw ykn8e7 ymsbi2 yy78ri');
const PHRASES = set('1130iep 11kt6df 1375vkw 13ozumn 14ec6oy 19r6pqh 1anwnwz 1bd2m6e 1c7jgwg 1ez8we4 1g3j4m7 1gvv976 1mpsv46 1nxxznc 1od7x2t 1p1eof7 1qenple 1s2vqz6 1xn1p2p 1y7iylp 24n7k3 4bcx8n 8j4hsh alnoxd dessqm g39aog hrl6wx lsq9j7 rz0u9d x7awol'), PHRASE = 4;
const LONG = set('1032mzp 11sx6ip 125u7pk 14oshhs 15fvo3p 19mj789 1akm78h 1eaqa9n 1hoc0u7 1ul1uk4 1wktobu 1ycbij3 4a2xs8 8ntpvt 9qwfiv cu748w f79hgw fee1dy kbo9sv mboo57 pc1mej rkfry0 w1l9s4 x1gwtw'), SIZES = [6,7,8,9,10];
const MILD = set('11r9el9 122v6pi 14h9oi0 1aphvlf 1b111oc 1c8m2wt 1c9yn3z 1fcbu2d 1m24kth 1mb5nmv 1npkzk5 1ob5fz3 1py54ae 1ry26ve dn85c5 gt37k ngd4e0 nqjrfq q4atx2 s31e38');
// (the same words with no letter doubled at all: compared with a word whose letters were stretched — "biiiig")
const SQUEEZED = set('1032mzp 10yzs8e 125u7pk 12ehn81 12nqjhu 14fkbtf 1biz868 1bzzl5m 1ddoja5 1eaqa9n 1eww7cd 1fc3q8l 1fhzz46 1fp1q5f 1gepina 1gglqc1 1hoc0u7 1io3708 1lsnoc6 1mc1123 1p1uv49 1p3zm3i 1pui64u 1smf5ui 1ul1uk4 1wfnhou 1wktobu 1ycbij3 2q5bi9 5kl94a 8ntpvt 8wcyt8 alxa6s cu748w dzzt2u f79hgw fee1dy fufiw0 iaifv6 jyg210 k3an6t kbo9sv mboo57 pc1mej qzk4k3 rkfry0 rozh1b tg06pa u74m7v w1l9s4 wn47zj ykn8e7 ymsbi2 yy78ri'), SQMILD = set('11r9el9 122v6pi 14h9oi0 15qojne 1aphvlf 1b111oc 1c8m2wt 1c9yn3z 1fcbu2d 1m24kth 1mb5nmv 1npkzk5 1py54ae 1ry26ve dn85c5 gt37k ngd4e0 nqjrfq q4atx2 s31e38');

// An address of a site: "http://…", "www.…", or a name with a well-known ending — the endings that are also
// everyday words ("so.fun", "ok.me") only count when a path follows.
const STRONG = 'com|net|org|io|fr|tv|xyz|ru|uk|biz|eu|cc|ly', WEAK = 'gg|me|it|in|be|us|es|de|ca|co|ch|nl|pl|br|jp|cn|app|dev|info|shop|link|site|online|club|live|store|tech|top|vip|fun|game|games|world|pro';
const SITE = new RegExp(`(?:https?:\\/\\/|www\\.)\\S+|\\b[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:(?:${STRONG})\\b(?:\\/\\S*)?|(?:${WEAK})\\/\\S*)`, 'gi');
const SITE_IN_NAME = new RegExp(`https?|www\\.|:\\/\\/|\\.(?:${STRONG}|${WEAK})(?![a-z])`, 'i');
const STARS = '********';
const TOKEN = /[\p{L}\p{N}@$]+/gu;

/** Is this folded word one of the list (`name`: or one a name may not hold; `stretched`: it was written with a letter three times or more)? */
function bad(f, name, stretched = false) {
  for (const v of [f, f.length > 3 && /[sxz]$/.test(f) ? f.slice(0, -1) : '', f.length > 4 && f.endsWith('es') ? f.slice(0, -2) : '']) {
    if (!v) continue;
    const k = print(v);
    if (WORDS.has(k) || (name && MILD.has(k))) return true;
  }
  for (const n of SIZES) for (let i = 0; i + n <= f.length; i++) if (LONG.has(print(f.substr(i, n)))) return true;
  if (stretched) {
    const q = f.replace(/(.)\1+/g, '$1');
    for (const v of [q, q.length > 3 && /[sxz]$/.test(q) ? q.slice(0, -1) : '']) if (v && (SQUEEZED.has(print(v)) || (name && SQMILD.has(print(v))))) return true;
  }
  return false;
}

/** The words of a text: [{ a, b (where it is), f (folded) }]. */
function words(s) {
  const out = [];
  for (const m of s.matchAll(TOKEN)) out.push({ a: m.index, b: m.index + m[0].length, f: fold(m[0]), long: /(.)\1{2,}/i.test(m[0]) });
  return out;
}

/** The spans of `s` that hold a word or a phrase of the list: [[from, to], …], in order, none overlapping. */
function spans(s, name = false) {
  const t = words(s), hit = new Array(t.length).fill(false), out = [];
  for (let n = Math.min(PHRASE, t.length); n >= 2; n--) {
    for (let i = 0; i + n <= t.length; i++) {
      let free = true, key = t[i].f;
      for (let k = 0; k < n; k++) { if (hit[i + k]) free = false; if (k) key += ` ${t[i + k].f}`; }
      if (!free || !PHRASES.has(print(key))) continue;
      for (let k = 0; k < n; k++) hit[i + k] = true;
      out.push([t[i].a, t[i + n - 1].b]);
    }
  }
  t.forEach((w, i) => { if (!hit[i] && bad(w.f, name, w.long)) out.push([w.a, w.b]); });
  return out.sort((p, q) => p[0] - q[0]);
}

/** A text with the words and the phrases of the list replaced by ******** (what a sponsor's panel says: its site may stay). */
export function maskWords(text) {
  if (typeof text !== 'string' || !text) return '';
  let out = '', at = 0;
  for (const [a, b] of spans(text)) { out += text.slice(at, a) + STARS; at = b; }
  return out + text.slice(at);
}

/** A chat line with the addresses of sites and the words of the list replaced by ********. */
export function maskChat(text) {
  return typeof text === 'string' && text ? maskWords(text.replace(SITE, STARS)) : '';
}

/** May a robot (an account, a line of a board) be called that? */
export function nameOk(name) {
  if (typeof name !== 'string') return false;
  if (name.includes('@') || SITE_IN_NAME.test(name)) return false;
  if (spans(name, true).length) return false;
  // (spelt out with spaces or dots between the letters)
  const glued = fold(name.replace(/[^\p{L}\p{N}$]/gu, ''));
  return !(glued && bad(glued, true, /(.)\1{2,}/i.test(name)));
}
