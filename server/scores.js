// Leaderboards of the fair's games, independent of where they are kept: server/index.js (a JSON file) and
// cloudflare/worker.js (the storage of a Durable Object) both go through this (see routes.js).
//
//   GET    /api/scores?board=sky[&device=]          → { board, tops: { day, week, month, all }, top }
//   GET    /api/scores?board=all[&device=]          → { boards: { sky: { tops, top }, race: … } }
//   POST   /api/run     { board }                   → { run }      a signed note of when the run started
//   POST   /api/scores  { board, name, score, run, device } → { board, tops, top, rank, best }
//          …and, for a visitor without an account: { guest: true, day, would: { week, month, all }, claim }
//   POST   /api/scores/claim { device, claims: [claim…] }   → { claimed: [board…], boards }
//   DELETE /api/scores?board=sky&name=Somebody      → { removed }  (the administrator only)
//
// Scores belong to accounts. Everybody plays, and sees their score — but:
//   - with an account (free), a score goes on the four lists under the name of the account, whatever name the
//     robot goes by: nobody else can write under it (409 { taken } for a visitor who plays under that name);
//   - without one, it goes on the list of the day only. The answer says where it would stand in the others
//     (`would`: 1 = first, 0 = beyond the ten that are shown) and carries a `claim` — a note signed by the
//     server, good for half an hour: the page hands it back once an account has been made, and the score
//     counts for the week, the month and all time after all. Nothing is kept about the guest meanwhile.
// The boards from before scores belonged to accounts were written under free names: they are put away, once
// (`board0:<id>`, shown nowhere, deleted by nobody), and the lists start again.
// A visitor who is kept out in silence (bans.js) plays on: their scores are kept apart (`shadow:<device>`) and
// mixed into the lists they are shown — theirs alone (`device`, with a GET, says who is asking).
//
// Each list holds one line per name, best first: [{ name, score }]. `top` is the all-time list again, as the
// first version of the game expects it ({ name, ms }). Four lists per board: the day, the week (from Monday),
// the month — all three by the UTC calendar — and all time.
//
// Scores come from the players' own browsers: there is no referee. What is believed is bounded (see BOARDS),
// and a score only counts with the note of its run, handed out by this server when the run started: the time
// between the note and the score must fit the game (a climb announced as 150 s cannot arrive 20 s after its
// start; a 45-second game cannot be over in 10). A note is used once. The administrator can take a line off.
import { cleanName } from './protocol.js';

/**
 * board id → what a score is. order 'asc': a time in ms, the lower the better, and the run lasted about that
 * long (or `length` ms at least, where the time is not that of the whole run); order 'desc': points, and the
 * game lasts `length` ms (never less), plus `each` ms for every point where points take time to make.
 * min / max: what is believed. `added` (order 'asc'): how much of a time may be penalties put on the clock — a
 * run cannot have lasted less than its time less that much.
 */
export const BOARDS = {
  sky: { order: 'asc', min: 100_000, max: 6 * 3600_000 }, // the climb: a bot that never misses needs about 150 s
  race: { order: 'asc', min: 42_000, max: 3600_000 }, // three laps on a quad: a bot that never lifts needs about 54 s; boosted all the way round (nobody is) it would take 45
  shoot: { order: 'desc', min: 1, max: 9999, length: 45_000 }, // the shooting gallery
  mole: { order: 'desc', min: 1, max: 9999, length: 45_000 }, // whack-a-mole
  milk: { order: 'desc', min: 1, max: 9999, length: 45_000 }, // milk for the clown
  bell: { order: 'desc', min: 1, max: 9999, length: 4_000 }, // the high striker: the best of three blows of the mallet
  wing: { order: 'desc', min: 1, max: 2000, each: 800 }, // the flying theatre: a point for each pair of columns passed, and no pair comes in less than 0.8 s
  // the six booths along the walk of the pier (see src/world/zones/games/Stalls.js)
  hoop: { order: 'desc', min: 1, max: 9999, length: 45_000 }, // baskets in 45 seconds
  stack: { order: 'desc', min: 1, max: 9999, length: 3_000, each: 10 }, // a tower: 35 points a floor at the very most, and no floor can be dropped in less than 0.4 s
  geiger: { order: 'desc', min: 1, max: 9999, length: 4_000, each: 30 }, // a sequence remembered: it has to be shown, then repeated
  fish: { order: 'desc', min: 1, max: 9999, length: 45_000 }, // fish brought up in 45 seconds
  scram: { order: 'asc', min: 130, max: 3000, length: 9_000 }, // the average of five reaction times, in ms: nobody is under 130 — and five alarms take their time
  cups: { order: 'desc', min: 1, max: 9999, length: 5_000, each: 25 }, // the cup that hides the core: every round has to be watched
  // Mostly Down, the water slide (an extra: src/extras/slide.js): from the top to the sea. `release`: the board
  // only exists once that switch is on (src/app/config.js: RELEASE)
  slide: { order: 'asc', min: 40_000, max: 3600_000, release: 'slide' }, // (its fastest bot — lying back, both shortcuts, every spark — needs 74.6 s)
  // …and the lab's other games (src/extras), each behind its own switch — the rules are those its checks print:
  // The Endless Pond is scored by how long one held, in ms (the more the better: `unit` says it is a time, and
  // a run cannot be over sooner than it claims to have lasted); the others are times, the less the better
  pond: { order: 'desc', min: 1000, max: 3600_000, each: 1, unit: 'time', release: 'pond' },
  boats: { order: 'asc', min: 37_000, max: 1800_000, release: 'boats' }, // Harbor Heaven: three laps
  hill: { order: 'asc', min: 18_000, max: 600_000, release: 'hill' }, // Jump the Logs: from the arch to the bell (run flat out with nothing in the way: 18.3 s)
  crack: { order: 'asc', min: 7000, max: 1800_000, release: 'crack' }, // Bouncy Rock: forty metres of cleft
  hollow: { order: 'asc', min: 15_000, max: 600_000, release: 'hollow' }, // The Nuclear Cave: one lap of the cave
  // …and the seven games with a gate (src/extras/plug.js), each behind its own switch. Three are scored by how
  // long one held (as the pond is), three by a time; the golf by its strokes — a thousand for each — then by the
  // seconds of the round (`unit`: the back office writes it "31 strokes (2:07)"). The figures are those the
  // checks of each game print (tools/<id>-test.mjs holds them against this table).
  waves: { order: 'desc', min: 2500, max: 900_000, each: 1, unit: 'time', release: 'waves' }, // Big Tsunami
  lava: { order: 'desc', min: 1000, max: 98_000, each: 1, unit: 'time', release: 'lava' }, // No Touch Lava!: nobody holds longer than the lava takes to cover the highest column
  hive: { order: 'desc', min: 6000, max: 90_000, each: 1, unit: 'time', release: 'hive' }, // Bee Fly: the bees see to it that no comb lasts longer
  // Mostly Up & Down: the time the machine takes is the same for all (`length`); one's time is that, 3 s more for
  // each fall, a quarter of a second less for each spark — so a time may be well over what the run lasted (`added`)
  flip: { order: 'asc', min: 67_000, max: 600_000, length: 84_000, added: 600_000, release: 'flip' },
  spiral: { order: 'asc', min: 144_000, max: 900_000, release: 'spiral' }, // Spiral of Death: from the first step to the bell
  cars: { order: 'asc', min: 16_000, max: 180_000, release: 'cars' }, // Karting Simulator: three laps of the table
  golf: { order: 'asc', min: 9000, max: 63_999, unit: 'strokes', release: 'golf' }, // Balthazar Golf: nine holes, seven strokes a hole at most
  // …and six more (lab/NEWGAMES.md), each behind its own switch: times, the less the better. (Until a game is built
  // the figures only hold its place; its checks print the true ones.)
  ages: { order: 'asc', min: 20_000, max: 1800_000, release: 'ages' }, // War Through the Ages
  raft: { order: 'asc', min: 20_000, max: 1800_000, release: 'raft' }, // Wild River
  walls: { order: 'asc', min: 20_000, max: 1800_000, release: 'walls' }, // Run the Walls
  sneak: { order: 'asc', min: 20_000, max: 1800_000, release: 'sneak' }, // Robots Can See You
  mine: { order: 'asc', min: 20_000, max: 1800_000, release: 'mine' }, // Little Mine Train
  coaster: { order: 'asc', min: 20_000, max: 1800_000, release: 'coaster' }, // Hold the Rails!
  run: { order: 'desc', min: 1, max: 60_000, length: 2_000, each: 12 }, // the arcade cabinet: metres run (52 a second at the fastest), and 25 for an isotope now and then
};
export const KEPT = { all: 200, month: 100, week: 100, day: 100 }, SHOWN = 10;
export const PERIODS = ['day', 'week', 'month', 'all'];
const SLACK = 20_000; // ms of grace between the clocks of the server and of a browser (a slow network, a slow phone)

const key = (name) => name.toLowerCase();
const two = (n) => String(n).padStart(2, '0');

/** The names of the day, the week and the month `at` (ms) falls in: { day: '2026-03-09', week: '2026-W11', month: '2026-03', all: 'all' }. */
export function periodKeys(at) {
  const d = new Date(at), y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  // ISO week: the week of a date is the week of its Thursday
  const thu = new Date(Date.UTC(y, m, day));
  thu.setUTCDate(thu.getUTCDate() - ((thu.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((thu - Date.UTC(thu.getUTCFullYear(), 0, 4)) / 604800000);
  return { day: `${y}-${two(m + 1)}-${two(day)}`, week: `${thu.getUTCFullYear()}-W${two(week)}`, month: `${y}-${two(m + 1)}`, all: 'all' };
}

/** The line a POST asks to add ({ board, name, score, run }), or null when it makes no sense. */
export function cleanScore(body) {
  if (!body || typeof body !== 'object' || !Object.hasOwn(BOARDS, body.board)) return null;
  const { min, max } = BOARDS[body.board];
  const score = Math.round(Number(body.score ?? body.ms));
  if (!Number.isFinite(score) || score < min || score > max) return null;
  if (typeof body.name !== 'string' || !body.name.trim()) return null;
  return { board: body.board, name: cleanName(body.name), score, run: typeof body.run === 'string' ? body.run : '' };
}

const lines = (list) => (Array.isArray(list) ? list.filter((e) => e && typeof e.name === 'string' && Number.isFinite(e.score ?? e.ms)).map((e) => ({ name: e.name, score: e.score ?? e.ms, at: e.at || 0 })) : []);

/** What is kept for a board, whatever was stored before (the first version kept one array of { name, ms, at }). */
export function boardState(stored, at = Date.now()) {
  const keys = periodKeys(at), old = Array.isArray(stored) ? { all: stored } : stored && typeof stored === 'object' ? stored : {};
  const state = { v: 2, all: lines(old.all) };
  for (const p of ['day', 'week', 'month']) state[p] = old[p] && old[p].key === keys[p] ? { key: keys[p], list: lines(old[p].list) } : { key: keys[p], list: [] };
  return state;
}

/**
 * Adds a score to the lists of a board — the four of them, or those of `periods` (the day alone, for a visitor
 * without an account). Returns { state, rank, day, best }: rank in the all-time list and in that of the day
 * (1 = first, 0 = not listed), best = a personal best in the widest of those lists.
 */
export function addScore(stored, board, { name, score }, at = Date.now(), periods = PERIODS) {
  const state = boardState(stored, at), asc = BOARDS[board].order === 'asc';
  const better = (a, b) => (asc ? a < b : a > b);
  let best = false;
  for (const p of periods) {
    let list = p === 'all' ? state.all : state[p].list;
    const mine = list.find((e) => key(e.name) === key(name));
    if (mine && !better(score, mine.score)) continue;
    if (p === periods[periods.length - 1]) best = true;
    list = list.filter((e) => e !== mine);
    list.push({ name, score, at });
    list.sort((a, b) => (asc ? a.score - b.score : b.score - a.score) || a.at - b.at);
    list = list.slice(0, KEPT[p]);
    if (p === 'all') state.all = list; else state[p].list = list;
  }
  return { state, rank: state.all.findIndex((e) => key(e.name) === key(name)) + 1, day: state.day.list.findIndex((e) => key(e.name) === key(name)) + 1, best };
}

/** Would this score be among the first `n` of one of these lists (as they stand, whoever makes it)? */
export function wouldEnter(stored, board, score, periods, n = 5, at = Date.now()) {
  const state = boardState(stored, at), asc = BOARDS[board].order === 'asc';
  return periods.some((p) => { const list = p === 'all' ? state.all : state[p].list; return list.filter((e) => (asc ? e.score <= score : e.score >= score)).length < n; });
}

/** Where a score would stand in the lists it is not on: { week, month, all } (1 = first; 0: beyond the ten that are shown). */
export function wouldRank(stored, board, score, at = Date.now()) {
  const state = boardState(stored, at), asc = BOARDS[board].order === 'asc';
  const place = (list) => { const n = list.filter((e) => (asc ? e.score <= score : e.score >= score)).length + 1; return n <= SHOWN ? n : 0; };
  return { week: place(state.week.list), month: place(state.month.list), all: place(state.all) };
}

/** What a board shows to one visitor whose own lines are kept apart (`own`: a state of theirs alone): the lists, with theirs mixed in. */
export function topsWith(stored, own, board, at = Date.now()) {
  const state = boardState(stored, at), mine = boardState(own, at), asc = BOARDS[board].order === 'asc';
  const mix = (a, b) => {
    const by = new Map();
    for (const e of [...a, ...b]) { const was = by.get(key(e.name)); if (!was || (asc ? e.score < was.score : e.score > was.score)) by.set(key(e.name), e); }
    return [...by.values()].sort((x, y) => (asc ? x.score - y.score : y.score - x.score) || x.at - y.at);
  };
  const mixed = { v: 2, all: mix(state.all, mine.all) };
  for (const p of ['day', 'week', 'month']) mixed[p] = { key: state[p].key, list: mix(state[p].list, mine[p].list) };
  return topsOf(mixed, at);
}

/** Takes a name off every list of a board. Returns { state, removed }. */
export function removeScore(stored, name, at = Date.now()) {
  const state = boardState(stored, at);
  let removed = 0;
  const strip = (list) => list.filter((e) => (key(e.name) === key(name) ? (removed++, false) : true));
  state.all = strip(state.all);
  for (const p of ['day', 'week', 'month']) state[p].list = strip(state[p].list);
  return { state, removed };
}

/** What a board shows: { tops: { day, week, month, all }, top } (see the top of this file). */
export function topsOf(stored, at = Date.now()) {
  const state = boardState(stored, at), cut = (list) => list.slice(0, SHOWN).map((e) => ({ name: e.name, score: e.score }));
  const tops = { day: cut(state.day.list), week: cut(state.week.list), month: cut(state.month.list), all: cut(state.all) };
  return { tops, top: tops.all.map((e) => ({ name: e.name, ms: e.score, score: e.score })) };
}

/**
 * Does the note of a run fit the score that claims it? `note` is the payload signed at the start ({ b: board,
 * t: when, n: nonce }), `at` is now. Returns '' when it does, else why not.
 */
export function runFits(note, { board, score }, at = Date.now()) {
  const rule = BOARDS[board];
  if (!note || note.b !== board || !Number.isFinite(note.t) || typeof note.n !== 'string') return 'no run';
  const elapsed = at - note.t;
  if (elapsed < 0 || elapsed > rule.max + 3600_000) return 'expired';
  // (a run may well have lasted longer than its clock says — the game stops while its tab is hidden — never less)
  if (rule.order === 'asc') return elapsed >= Math.max(score - SLACK - (rule.added || 0), (rule.length || 0) - 2000) ? '' : 'the time does not match the run';
  return elapsed >= (rule.length || 0) + (rule.each || 0) * score - 2000 ? '' : 'too soon';
}
