// The leaderboards of the fair's games: kept by the server when there is one (GET / POST /api/scores, see
// server/scores.js), in this browser otherwise (a site served as plain files has nowhere to write).

const local = {
  get(board) { try { return JSON.parse(localStorage.getItem(`mmf.scores.${board}`)) || []; } catch { return []; } },
  set(board, list) { try { localStorage.setItem(`mmf.scores.${board}`, JSON.stringify(list)); } catch { /* private mode */ } },
};

export class Scores {
  constructor(board) {
    this.board = board;
    this.url = `${import.meta.env.BASE_URL}api/scores`;
    this.remote = true; // until the server turns out not to keep scores
  }

  async _ask(init) {
    if (!this.remote) return null;
    try {
      const res = await fetch(init ? this.url : `${this.url}?board=${this.board}`, init);
      const body = /json/.test(res.headers.get('content-type') || '') ? await res.json() : null;
      if (res.ok && body && Array.isArray(body.top)) return body;
      if (res.status === 404 || res.status === 405 || res.status === 501 || (res.ok && !body)) this.remote = false; // plain files
    } catch { /* offline: this browser's own list */ }
    return null;
  }

  /** The best times, best first: [{ name, ms }]. */
  async top() {
    const body = await this._ask();
    return body ? body.top : local.get(this.board).slice(0, 10);
  }

  /** Record a time. Resolves to { top, rank (1 = first, 0 = not listed), best (a personal best), shared (kept by the server) }. */
  async submit(name, ms) {
    const body = await this._ask({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ board: this.board, name, ms }) });
    if (body) return { top: body.top, rank: body.rank, best: body.best, shared: true };
    let list = local.get(this.board);
    const mine = list.find((e) => e.name.toLowerCase() === name.toLowerCase());
    const best = !mine || ms < mine.ms;
    if (best) {
      list = list.filter((e) => e !== mine).concat({ name, ms }).sort((a, b) => a.ms - b.ms).slice(0, 50);
      local.set(this.board, list);
    }
    return { top: list.slice(0, 10), rank: list.findIndex((e) => e.name.toLowerCase() === name.toLowerCase()) + 1, best, shared: false };
  }
}
