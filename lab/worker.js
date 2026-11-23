// The lab's server: the game's own Worker (cloudflare/worker.js), as it stands, with what the extras add on the
// server side — without changing a file of it. Deployed as a Worker of its own (lab/wrangler.jsonc): its own
// rooms and its own notebook, nothing shared with the game that is online.
import game, { Room as GameRoom } from '../cloudflare/worker.js';

export class Room extends GameRoom {}

export default game;
