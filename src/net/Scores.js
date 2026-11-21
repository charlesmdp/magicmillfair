// The leaderboards of the fair's games: kept by the server when there is one (/api/scores, see
// server/scores.js), in this browser otherwise (a site served as plain files has nowhere to write).
// Four lists per board — today, this week, this month, all time — each [{ name, score }], best first.
import { BOARDS, periodKeys } from '../../server/scores.js';
import { callApi } from './api.js';

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

  /** The four lists: { day, week, month, all }. */
  async tops() {
    const body = await callApi(`api/scores?board=${this.board}`);
    return body ? Scores._tops(body) : this._local();
  }

  /** A run begins: the server notes when (a score only counts with that note). Never throws, need not be awaited. */
  async start() {
    this.run = null;
    const body = await callApi('api/run', { method: 'POST', body: { board: this.board } });
    this.run = body && typeof body.run === 'string' ? body.run : null;
  }

  /** Record a score. Resolves to { tops, rank (1 = first, 0 = not listed), best (a personal best), shared (kept by the server) }. */
  async submit(name, score) {
    const run = this.run;
    this.run = null;
    const body = run ? await callApi('api/scores', { method: 'POST', body: { board: this.board, name, score, run } }) : null;
    if (body && (body.tops || body.top)) return { tops: Scores._tops(body), rank: body.rank, best: body.best, shared: true };
    const all = local.get(this.board);
    const mine = all.filter((e) => e.name.toLowerCase() === name.toLowerCase());
    const best = !mine.some((e) => (this.asc ? e.score <= score : e.score >= score));
    all.push({ name, score, at: Date.now() });
    local.set(this.board, all);
    const tops = this._local();
    return { tops, rank: tops.all.findIndex((e) => e.name.toLowerCase() === name.toLowerCase()) + 1, best, shared: false };
  }
}
