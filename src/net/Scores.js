// The leaderboards of the fair's games: kept by the server when there is one (/api/scores, see
// server/scores.js), in this browser otherwise (a site served as plain files has nowhere to write).
// Four lists per board — today, this week, this month, all time — each [{ name, score }], best first.
import { BOARDS, periodKeys } from '../../server/scores.js';
import { callApi } from './api.js';
import { deviceId } from './device.js';

// A score made without an account is on the list of the day only: the server gives a note with it, good for
// half an hour — handed back once an account has been made, the score counts for the other lists after all.
const CLAIMS = 'mmf.claims';
const claims = {
  get() { try { return (JSON.parse(sessionStorage.getItem(CLAIMS)) || []).filter((c) => c && typeof c.note === 'string' && c.until > Date.now()); } catch { return []; } },
  set(list) { try { sessionStorage.setItem(CLAIMS, JSON.stringify(list.slice(-20))); } catch { /* private mode */ } },
};

const PERIODS = ['day', 'week', 'month', 'all'];
const local = {
  // [{ name, score, at }] (the first version kept { name, ms })
  get(board) {
    try { return (JSON.parse(localStorage.getItem(`mmf.scores.${board}`)) || []).map((e) => ({ name: String(e.name), score: e.score ?? e.ms, at: e.at || 0 })).filter((e) => Number.isFinite(e.score)); } catch { return []; }
  },
  set(board, list) { try { localStorage.setItem(`mmf.scores.${board}`, JSON.stringify(list.slice(-300))); } catch { /* private mode */ } },
};

export class Scores {
  constructor(board) {
    this.board = board;
    this.asc = BOARDS[board].order === 'asc';
    this.run = null; // the note of the run in progress (see start())
  }

  // the lists as this browser alone knows them
  _local(now = Date.now()) {
    const keys = periodKeys(now), all = local.get(this.board), tops = {};
    for (const p of PERIODS) {
      const best = new Map();
      for (const e of all) {
        if (p !== 'all' && periodKeys(e.at)[p] !== keys[p]) continue;
        const k = e.name.toLowerCase(), was = best.get(k);
        if (!was || (this.asc ? e.score < was.score : e.score > was.score)) best.set(k, e);
      }
      tops[p] = [...best.values()].sort((a, b) => (this.asc ? a.score - b.score : b.score - a.score)).slice(0, 10).map((e) => ({ name: e.name, score: e.score }));
    }
    return tops;
  }

  static _tops(body) {
    if (body.tops) return body.tops;
    return { day: [], week: [], month: [], all: (body.top || []).map((e) => ({ name: e.name, score: e.score ?? e.ms })) }; // (an older server)
  }

  /** The lists of every board, asked for in one go: { sky: { day, week, month, all }, race: … }. */
  static async every() {
    const body = await callApi(`api/scores?board=all&device=${deviceId()}`), out = {};
    for (const id of Object.keys(BOARDS)) out[id] = body && body.boards && body.boards[id] ? Scores._tops(body.boards[id]) : new Scores(id)._local();
    return out;
  }

  /** The four lists: { day, week, month, all }. */
  async tops() {
    const body = await callApi(`api/scores?board=${this.board}&device=${deviceId()}`);
    return body ? Scores._tops(body) : this._local();
  }

  /**
   * A run begins: the server notes when (a score only counts with that note) and draws the seed of the game —
   * what is left to chance in a game of the booths comes from it, so that the server can play the game again.
   * Resolves to { seed } (null: no server, or none given). Never throws, need not be awaited.
   */
  async start() {
    this.run = null;
    const body = await callApi('api/run', { method: 'POST', body: { board: this.board } });
    this.run = body && typeof body.run === 'string' ? body.run : null;
    return this.run && Number.isInteger(body.seed) ? { seed: body.seed } : null;
  }

  /**
   * The scores made as a guest in the last half hour are claimed for the account this browser has just signed
   * in to. Resolves to { claimed: [board…], boards: { id: tops } } (nothing claimed: both empty). Never throws.
   */
  static async claim() {
    const kept = claims.get();
    if (!kept.length) return { claimed: [], boards: {} };
    const body = await callApi('api/scores/claim', { method: 'POST', body: { device: deviceId(), claims: kept.map((c) => c.note) } });
    if (!body || !Array.isArray(body.claimed)) return { claimed: [], boards: {} };
    claims.set([]);
    return { claimed: body.claimed, boards: Object.fromEntries(Object.entries(body.boards || {}).map(([id, b]) => [id, Scores._tops(b)])) };
  }

  /**
   * Record a score. Resolves to { tops, rank (1 = first, 0 = not listed), best (a personal best), shared (kept
   * by the server) } — and, for a visitor without an account: guest: true, day (their rank today), would
   * ({ week, month, all }: where the score would stand with an account; 0: not among the ten shown). `taken`:
   * the server would not take it — that name is the name of somebody's account. `log`: the game as it was
   * played (a game of the booths: see Booths.js), which the server plays again before it believes a great score.
   */
  async submit(name, score, log = null) {
    const run = this.run;
    this.run = null;
    let body = null, taken = false;
    if (run) {
      // (asked without callApi: a refusal has something to say here)
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}api/scores`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ board: this.board, name, score, run, device: deviceId(), ...(typeof log === 'string' && { log }) }) });
        const said = /json/.test(res.headers.get('content-type') || '') ? await res.json() : null;
        if (res.ok) body = said; else taken = res.status === 409 && said?.taken === true;
      } catch { /* no server within reach */ }
    }
    if (body && (body.tops || body.top)) {
      if (body.guest && typeof body.claim === 'string') claims.set([...claims.get().filter((c) => c.board !== this.board), { board: this.board, note: body.claim, until: Date.now() + 29 * 60_000 }]);
      return { tops: Scores._tops(body), rank: body.rank, best: body.best, shared: true, ...(body.guest && { guest: true, day: body.day || 0, would: body.would || {} }) };
    }
    if (taken) return { tops: await this.tops(), rank: 0, best: false, shared: true, taken: true };
    const all = local.get(this.board);
    const mine = all.filter((e) => e.name.toLowerCase() === name.toLowerCase());
    const best = !mine.some((e) => (this.asc ? e.score <= score : e.score >= score));
    all.push({ name, score, at: Date.now() });
    local.set(this.board, all);
    const tops = this._local();
    return { tops, rank: tops.all.findIndex((e) => e.name.toLowerCase() === name.toLowerCase()) + 1, best, shared: false };
  }
}
