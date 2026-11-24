// The common rooms: how many there are, how many visitors each holds, and which one a newcomer is sent to — so
// that nobody is alone in a room while another is crowded. No authority over what happens in a room (that is
// protocol.js): only the door. Shared by the Node server and the notebook of the Worker (door.js answers the
// requests); tools/rooms-sim.mjs plays a whole day with it.
//
// The rules (ROOM_RULES — settings, not constants: the owner changes them from the back office):
//   max    200  a room never holds more (the relay refuses at the door; the owner always gets in)
//   open    50  a new room is opened once every room that takes newcomers holds this many; until then the
//               newcomers go to the rooms that are short of it, the shorter the likelier
//   start   20  a room that is starting takes every newcomer until it holds this many: it fills fast
//   low      8  a room that has fallen to this few while a livelier one has room takes no newcomer any more,
//               and its visitors are offered to join the other — nobody is ever moved
//   merge  0.6  …the same for the smallest room when all would fit, with room to spare (this share of `open`
//               each), in one room fewer: at low tide the rooms come together again
//
// A room is 'starting' (the door has just opened it: it has not reached `start` yet), 'live', or 'quiet' (it
// takes no newcomer; it comes back to life when a new room would otherwise be opened). Only the door opens a
// room: one that is first heard of because somebody is in it (reached by its address, or found again after the
// host forgot everything) is quiet until one more room is needed. A room that is still starting after four
// minutes and holds few is treated as one that empties. Whoever comes back — a refresh, a new version, a line
// that dropped — finds their room again if it has room; a friend's link leads to the friend's room if it has
// room.
//
// A directory is plain data, kept by the host: { rooms: { name: { n, old, phase, held: [ms…], at, since } } } —
// `n` as the room last said (`at`: when), `held`: when the door last sent somebody there (they are on their way:
// counted until the room says so itself), `since`: when it was opened or woken. Only common rooms take part in
// the sharing: 'main', 'main-2', 'main-3'… Any other name is a room of its own, reached by its name alone.

export const ROOM_RULES = { max: 200, open: 50, start: 20, low: 8, merge: 0.6 };
export const MAX_COMMON = 256; // how many common rooms there may be ('main' … 'main-256')
export const STALE_MS = 90_000; // a room not heard from for this long is worth asking again (a host that is told late)
const HOLD_MS = 12_000; // somebody sent to a room counts there for this long, until the room has said so itself
const STALL_MS = 4 * 60_000; // a room still starting after this long, with few in it, is one that empties
const OVERFLOW = 16; // a room of one's own that is full overflows into "name-2" … "name-16"
const AGAIN_MS = 5 * 60_000; // those who stayed in a room gone quiet are offered another again this often
const LIMITS = { max: [2, 4096], open: [1, 4096], start: [0, 4096], low: [0, 4096], merge: [0, 1] };

/** Rules made clean: numbers within reason, and in an order that makes sense (low ≤ start ≤ open ≤ max). */
export function cleanRules(given, base = ROOM_RULES) {
  const r = { ...ROOM_RULES, ...base };
  if (given && typeof given === 'object') for (const k of Object.keys(LIMITS)) { const v = Number(given[k]); if (given[k] !== undefined && given[k] !== null && given[k] !== '' && Number.isFinite(v)) r[k] = k === 'merge' ? v : Math.floor(v); }
  for (const k of Object.keys(LIMITS)) r[k] = Math.min(LIMITS[k][1], Math.max(LIMITS[k][0], r[k]));
  r.open = Math.min(r.open, r.max); r.start = Math.min(r.start, r.open); r.low = Math.min(r.low, r.start);
  return r;
}

export const COMMON = 'main';
/** The name of the k-th common room (1: 'main'), and which one a name is (0: not a common room). */
export const commonName = (k) => (k <= 1 ? COMMON : `${COMMON}-${k}`);
export const commonIndex = (name) => { const m = /^main(?:-([1-9]\d{0,3}))?$/.exec(String(name || '')); const k = !m ? 0 : m[1] ? Number(m[1]) : 1; return m && (m[1] ? k >= 2 : true) && k <= MAX_COMMON ? k : 0; };
/** How a room is called on the screen. */
export const roomLabel = (name) => { const k = commonIndex(name); return k ? `Room ${k}` : String(name || ''); };

export const newDirectory = () => ({ rooms: {} });
const entry = (dir, name, now, phase = 'starting') => (dir.rooms[name] ||= { n: 0, old: 0, phase, held: [], at: now, since: now });
/** How many a room holds, those on their way included. */
export const headCount = (r, now) => r.n + r.held.filter((t) => now - t < HOLD_MS).length;
/** Forgets the rooms that hold nobody and expect nobody. */
function prune(dir, now) { for (const [name, r] of Object.entries(dir.rooms)) if (!r.n && !r.held.some((t) => now - t < HOLD_MS)) delete dir.rooms[name]; }

/** A room says how many it holds (`old`: of whom on an older version of the game). Empty: it is forgotten. */
export function noteRoom(dir, name, n, old = 0, now = Date.now(), rules = ROOM_RULES) {
  if (typeof name !== 'string' || !name || !Number.isFinite(n)) return;
  n = Math.max(0, Math.floor(n));
  if (!dir.rooms[name] && !n) return;
  // (a room the door did not open takes no newcomer until one more room is needed: see the top of this file)
  const known = !!dir.rooms[name], r = entry(dir, name, now, 'quiet'), grew = n - r.n;
  if (!known) r.offered = now; // (…and its visitors are not offered another at once: they chose it)
  // (those who were on their way have arrived: no longer counted twice)
  if (grew > 0) r.held.splice(0, grew);
  r.held = r.held.filter((t) => now - t < HOLD_MS);
  r.n = n; r.old = Math.max(0, Math.floor(old) || 0); r.at = now;
  if (r.phase === 'starting' && r.n >= rules.start) r.phase = 'live';
  if (!r.n && !r.held.length) delete dir.rooms[name];
}

/** The rooms that have not been heard from for a while (a host that is told, rather than one that knows, asks them again). */
export const staleRooms = (dir, now = Date.now(), after = STALE_MS) => Object.entries(dir.rooms).filter(([, r]) => r.n > 0 && now - (r.at || 0) > after).map(([name]) => name);

/** The common rooms of a directory, in order: [{ name, k, r }]. */
const commons = (dir) => Object.entries(dir.rooms).map(([name, r]) => ({ name, k: commonIndex(name), r })).filter((c) => c.k).sort((a, b) => a.k - b.k);

/**
 * Puts the rooms in order: a room that has fallen to `low` while a livelier one has room goes quiet, and so does
 * the smallest when everybody would fit in one room fewer. Returns the rooms that have just gone quiet, each
 * with the room its visitors may be offered (never an emptier one): [{ name, to, n }] — and, now and then
 * (`again`), those that are still quiet and hold a few who stayed.
 */
export function tidy(dir, rules = ROOM_RULES, now = Date.now()) {
  const gone = [];
  prune(dir, now);
  for (let guard = 0; guard < 64; guard++) {
    const count = (c) => headCount(c.r, now);
    const taking = commons(dir).filter((c) => c.r.phase !== 'quiet' && count(c) > 0);
    if (taking.length < 2) break;
    const total = taking.reduce((s, c) => s + count(c), 0);
    // (a room the door has just opened is given its time: it is filling)
    const smallest = taking.filter((c) => c.r.phase === 'live' || now - (c.r.since || 0) > STALL_MS).sort((a, b) => count(a) - count(b) || b.k - a.k)[0];
    if (!smallest) break;
    const few = count(smallest) <= rules.low, fits = total <= rules.open * rules.merge * (taking.length - 1);
    if (!few && !fits) break;
    // where to: a room that holds at least as many, and has room for all of them — the least crowded of those
    // that are well alive, the fullest otherwise
    const to = whereTo(taking.filter((c) => c !== smallest), count(smallest), rules, now);
    if (!to) break;
    smallest.r.phase = 'quiet'; smallest.r.offered = now;
    gone.push({ name: smallest.name, to: to.name, n: headCount(to.r, now) });
  }
  // those who stayed in a room gone quiet: reminded, now and then, that a livelier room has room
  const all = commons(dir), taking = all.filter((c) => c.r.phase !== 'quiet' && headCount(c.r, now) > 0);
  for (const c of all) {
    if (c.r.phase !== 'quiet' || !c.r.n || c.r.n >= rules.start || now - (c.r.offered || 0) < AGAIN_MS) continue;
    const to = whereTo(taking, headCount(c.r, now), rules, now);
    if (to) { c.r.offered = now; gone.push({ name: c.name, to: to.name, n: headCount(to.r, now), again: true }); }
  }
  return gone;
}

// Where the visitors of a room of `n` may be offered to go, among `rooms`: a room that is alive (not one the
// door has only just opened), where at least as many really are (those on their way do not count) and which has
// room for all of them — the least crowded of those that are well alive, the fullest otherwise.
function whereTo(rooms, n, rules, now) {
  const count = (c) => headCount(c.r, now), fit = rooms.filter((c) => c.r.phase === 'live' && c.r.n >= n && count(c) + n <= rules.max);
  return fit.filter((c) => c.r.n >= rules.start).sort((a, b) => count(a) - count(b) || a.k - b.k)[0] || fit.sort((a, b) => count(b) - count(a) || a.k - b.k)[0] || null;
}

/**
 * Which room for somebody at the door. `ask`: { want: a room asked for by name (a friend's link), back: the
 * room they were in a moment ago, not: [rooms that have just turned them away], owner: the owner of the game }.
 * Returns { room, why: 'back' | 'asked' | 'starting' | 'shared' | 'new' | 'own', full: the room that was asked
 * for and had no room, gone: the common room that was asked for and is no more (they are told) } — and counts
 * them on their way there.
 */
export function assign(dir, rules = ROOM_RULES, ask = {}, now = Date.now(), rnd = Math.random) {
  const not = new Set(ask.not || []), hold = (name, why, extra = {}) => { entry(dir, name, now).held.push(now); return { room: name, why, ...extra }; };
  const has = (name) => !not.has(name) && (ask.owner || (dir.rooms[name] ? headCount(dir.rooms[name], now) : 0) < rules.max);
  let full = '', gone = '';
  for (const [name, why] of [[ask.back, 'back'], [ask.want, 'asked']]) {
    if (typeof name !== 'string' || !name) continue;
    if (!commonIndex(name)) {
      if (has(name)) return hold(name, why === 'back' ? 'back' : 'own');
      full ||= name;
      // (a room of one's own that is full: those who follow gather next door — "name-2", "name-3"… — as they always did)
      if (why === 'asked') for (let k = 2; k <= OVERFLOW; k++) { const next = `${name.slice(0, 44)}-${k}`; if (has(next)) return hold(next, 'own', { full }); }
      continue;
    }
    // (a common room: gone back to, or joined by its name, as long as it exists and has room)
    if (dir.rooms[name] && has(name)) return hold(name, why);
    if (dir.rooms[name]) full ||= name; else if (why === 'asked') gone ||= name;
  }
  const extra = { ...(full && { full }), ...(gone && { gone }) };
  // (putting the rooms in order — which goes quiet, who is offered another — is not done here: the host does
  // it when it knows how many each room holds, see door.js: settle)
  prune(dir, now);
  const all = commons(dir), count = (c) => headCount(c.r, now), free = (c) => !not.has(c.name) && count(c) < rules.max;
  // (a room that has started, those on their way counted: it is alive — the room itself may say so late)
  for (const c of all) if (c.r.phase === 'starting' && count(c) >= rules.start) c.r.phase = 'live';
  const taking = all.filter((c) => c.r.phase !== 'quiet' && free(c));
  // a room that is starting takes everybody (the fullest of them first: it is the nearest to being alive)
  const starting = taking.filter((c) => c.r.phase === 'starting').sort((a, b) => count(b) - count(a) || a.k - b.k)[0];
  if (starting) return hold(starting.name, 'starting', extra);
  if (taking.length && taking.some((c) => count(c) < rules.open)) {
    // shared between the rooms that have room — those that are short of `open` first, the shorter the likelier
    // (a room that holds `open` or more gets next to nobody until the others have caught up: no room swells
    // while another is thin)
    const weights = taking.map((c) => (Math.max(0, rules.open - count(c)) + 1) ** 2), sum = weights.reduce((s, w) => s + w, 0);
    let pick = rnd() * sum, chosen = taking[taking.length - 1];
    for (let i = 0; i < taking.length; i++) { pick -= weights[i]; if (pick < 0) { chosen = taking[i]; break; } }
    return hold(chosen.name, 'shared', extra);
  }
  // every room that takes newcomers is lively enough (or there is none): one more — a quiet one first, woken up
  const quiet = all.filter((c) => c.r.phase === 'quiet' && free(c)).sort((a, b) => count(b) - count(a) || a.k - b.k)[0];
  if (quiet) { quiet.r.phase = count(quiet) >= rules.start ? 'live' : 'starting'; quiet.r.since = now; return hold(quiet.name, 'new', extra); }
  let k = 1;
  while (k <= MAX_COMMON && (dir.rooms[commonName(k)] || not.has(commonName(k)))) k++;
  // (every room there may be is open and full: the least crowded of them — its relay will say when there is room)
  if (k > MAX_COMMON) { const least = all.filter((c) => !not.has(c.name)).sort((a, b) => count(a) - count(b))[0] || all[0]; return hold(least ? least.name : COMMON, 'shared', extra); }
  entry(dir, commonName(k), now).phase = rules.start > 0 ? 'starting' : 'live';
  return hold(commonName(k), 'new', extra);
}

/** The common rooms, as a visitor may be shown them: [{ name, label, players, quiet }], in their order. */
export const openRooms = (dir) => commons(dir).filter((c) => c.r.n > 0).map((c) => ({ name: c.name, label: roomLabel(c.name), players: c.r.n, ...(c.r.phase === 'quiet' && { quiet: true }) }));
/** Every room that holds somebody, for the administrators: [{ name, label, players, old, phase }] (the common ones first). */
export const allRooms = (dir) => Object.entries(dir.rooms).filter(([, r]) => r.n > 0).map(([name, r]) => ({ name, label: roomLabel(name), players: r.n, old: r.old || 0, ...(commonIndex(name) && { phase: r.phase }) }))
  .sort((a, b) => (commonIndex(a.name) || 1e9) - (commonIndex(b.name) || 1e9) || b.players - a.players || a.name.localeCompare(b.name));

/** A directory as it is kept (those on their way are not), and read again — also from how it was first kept ({ name: { n, old } }). */
export const packDirectory = (dir) => ({ v: 2, rooms: Object.fromEntries(Object.entries(dir.rooms).filter(([, r]) => r.n > 0).map(([name, r]) => [name, { n: r.n, old: r.old || 0, phase: r.phase, at: r.at || 0, since: r.since || 0 }])) });
export function readDirectory(kept, first, now = Date.now()) {
  const dir = newDirectory();
  const take = (name, r, phase) => {
    const n = typeof r === 'number' ? r : Number(r?.n);
    if (typeof name !== 'string' || !name || !Number.isInteger(n) || n <= 0) return;
    dir.rooms[name] = { n, old: Number.isInteger(r?.old) && r.old > 0 ? r.old : 0, phase: ['starting', 'live', 'quiet'].includes(r?.phase) ? r.phase : phase, held: [], at: Number.isFinite(r?.at) ? r.at : now, since: Number.isFinite(r?.since) ? r.since : now };
  };
  if (kept && kept.v === 2 && kept.rooms && typeof kept.rooms === 'object') for (const [name, r] of Object.entries(kept.rooms)) take(name, r, 'quiet');
  else if (first && typeof first === 'object') for (const [name, r] of Object.entries(first)) take(name, r, 'quiet');
  return dir;
}
