// The lab's server: the game's own Worker (cloudflare/worker.js), as it stands, with what the extras add on the
// server side — without changing a file of it. Deployed as a Worker of its own (lab/wrangler.jsonc): its own
// rooms and its own notebook, nothing shared with the game that is online.
//
// What is added: the figures (server/stats.js) — /api/stats, answered by the notebook like the rest of the API —
// and, on the boards of scores, a place for the new games.
import game, { Room as GameRoom } from '../cloudflare/worker.js';
import { statsRoute } from '../server/stats.js';
import { BOARDS } from '../server/scores.js';
import { parseBody } from '../server/api.js';
import { bearerKey, sameSecret } from '../server/token.js';
import { unpackGeo } from '../server/visitors.js';
// (the games being tried, lab/games: each says the line of its board in its rules)
import { BOARD as waves } from './games/waves/rules.js';
import { BOARD as lava } from './games/lava/rules.js';
import { BOARD as hive } from './games/hive/rules.js';
import { BOARD as flip } from './games/flip/rules.js';
import { BOARD as spiral } from './games/spiral/rules.js';
import { BOARD as cars } from './games/cars/rules.js';
import { BOARD as golf } from './games/golf/rules.js';

// (the boards the new games would write to, once the game asks for them: see lab/INTEGRATION.md)
BOARDS.slide ||= { order: 'asc', min: 30_000, max: 3600_000 };
// (and those of the games being tried: the lab's own server keeps their boards, as the page asks — lab/games/kit.js)
for (const [id, board] of Object.entries({ waves, lava, hive, flip, spiral, cars, golf })) BOARDS[id] ||= board;

export class Room extends GameRoom {
  async api(request, url) {
    if (url.pathname !== '/api/stats' && !url.pathname.startsWith('/api/stats/')) return super.api(request, url);
    const store = { get: (key) => this.ctx.storage.get(key), put: (key, value) => this.ctx.storage.put(key, value), delete: (key) => this.ctx.storage.delete(key) };
    const reading = request.method === 'GET' || request.method === 'HEAD';
    let body = null;
    if (!reading) { const text = await request.text(); if (text.length <= 4096) body = parseBody(text); }
    const bearer = bearerKey(request.headers.get('Authorization'));
    const out = await statsRoute({
      method: request.method, path: url.pathname, query: url.searchParams, body, client: url.searchParams.get('client') || '',
      admin: sameSecret(bearer, (this.env.ADMIN_KEY || '').trim()), geo: unpackGeo(request.headers.get('X-Fair-Geo')),
    }, { store, now: () => Date.now() });
    return Response.json(out.body, { status: out.status, headers: { 'Cache-Control': 'no-store', ...out.headers } });
  }
}

export default game;
