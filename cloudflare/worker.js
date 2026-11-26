// Atomic Oasis on Cloudflare: one Worker. The built site (dist/) is served by Cloudflare's static assets;
// this script only answers /ws (multiplayer presence), /api/presence, /api/scores (the leaderboards),
// /api/npc (the characters one can talk to) and /healthz.
//
// Each room is a Durable Object running the very relay of the Node server (../server/protocol.js). It is
// written to sleep whenever nobody moves: connections stay open while the object hibernates, the clients'
// pings are answered by Cloudflare itself, and what a newcomer must know about each visitor travels in the
// socket attachments, so nothing is lost when the object is unloaded.
//
// One more object of the same class, named "~api" (no room can have that name), is the game's notebook: it
// keeps in its storage what the game remembers — the leaderboards, how many days in a row each device came
// back — and counts how often each address calls the API. The same code answers on the Node server
// (../server/routes.js, scores.js, npc.js, api.js).
// Variables (wrangler.jsonc): MAX_PLAYERS (200 per room), TICK_MS (100), ALLOWED_ORIGINS (default: same host),
// NPC_MODEL; secrets: ANTHROPIC_API_KEY (without it the characters use the lines kept in the game), ADMIN_KEY
// (the administrator's key; without it nobody is the administrator), SCORE_SECRET (optional: signs the notes
// of the game runs; drawn and kept by the notebook otherwise); for tests only: STALE_MS, DEBUG, BUILD_ID, FREE_ROOMS.
//
// The rooms tell the notebook how many they hold (when it changes, a few seconds apart at the most): the
// notebook thus knows which rooms there are, can say something to all of them at once (what is released, a
// word from the owner: server/release.js), and how many visitors are connected. Only that number is kept.
// It is also the door (server/door.js, rooms.js): it says which room a newcomer goes to, and the Worker asks
// it before each connection how many that room may hold, whether the caller is kept out, whether this is the
// owner (who always gets in) — one question, answered at once.
import { DurableObject } from 'cloudflare:workers';
import { Room as Relay, MAX_FRAME, NEAR, RANGE, BLAST_EVERY, cleanRoom, originAllowed, parseOrigins } from '../server/protocol.js';
import { Limiter, LIMITS, BODY_MAX, allowed, parseBody, mayPost, bodyMax } from '../server/api.js';
import { stripeConfig } from '../server/stripe.js';
import { restMailer } from '../server/mail.js';
import { route, addBan } from '../server/routes.js';
import { knock, roomRules, settle, wardrobeOf, newCrowd, noteCrowd } from '../server/door.js';
import { mayBeNamed } from '../server/accounts.js';
import { noteChat } from '../server/chatlog.js';
import { noteRoom, staleRooms, packDirectory, readDirectory } from '../server/rooms.js';
import { isUserRoom } from '../server/urooms.js';
import { randomId, sameSecret, bearerKey } from '../server/token.js';
import { NPC_MODEL, cleanTalk, npcReply } from '../server/npc.js';
import { adminOf, looksNamed, nameAdmin } from '../server/admins.js';
import { cleanGeo, packGeo, unpackGeo } from '../server/visitors.js';

const BUILD = 'X-Fair-Build'; // which version of the game is online: read by the Worker from its own files, told to the notebook
const MAX = 'X-Fair-Max', PASS = 'X-Fair-Pass'; // what the door said of a connection: how many the room may hold, and that it is the owner's
const WEAR = 'X-Fair-Wear', MUTE = 'X-Fair-Mute'; // …what this visitor may be seen wearing ("m.left": wardrobe.js), and that they are kept out in silence
const HOST = 'X-Fair-Host'; // …and that they are the owner of that room (a room a player made: server/urooms.js)
const shape = (dir) => Object.entries(dir.rooms).filter(([, r]) => r.n > 0).map(([name, r]) => `${name}:${r.phase}`).sort().join(',');
const REPORT_MS = 5000; // a room tells the notebook how many it holds at most this often (at once when it fills from empty, or empties)
const AGAIN_MS = 5 * 60_000; // …and again after this long, changed or not, when something happens in it: a notebook that forgot hears of it

const NOTEBOOK = '~api'; // the object that keeps the scores (room names are [a-z0-9_-] only)
const GEO = 'X-Fair-Geo'; // where a request comes from, as Cloudflare knows it: set by the Worker below, and by nobody else
// The request, handed on to an object with where it comes from (whatever the caller wrote in that header is dropped).
const withGeo = (request, url) => {
  const headers = new Headers(request.headers), cf = request.cf || {};
  const geo = packGeo(cleanGeo({ cc: cf.country, city: cf.city, region: cf.region }));
  if (geo) headers.set(GEO, geo); else headers.delete(GEO);
  for (const name of [BUILD, MAX, PASS, WEAR, MUTE, HOST]) headers.delete(name);
  return new Request(url || request.url, new Request(request, { headers }));
};

// The version of the files this Worker serves (dist/version.json, written by the build): asked of the files
// themselves, and kept a minute — a new delivery starts a new Worker anyway.
const version = { at: 0, commit: '' };
async function buildId(env, origin) {
  if (env.BUILD_ID) return String(env.BUILD_ID);
  const t = Date.now();
  if (t - version.at > 60_000 && env.ASSETS) {
    version.at = t;
    try { const res = await env.ASSETS.fetch(new Request(new URL('/version.json', origin))); version.commit = res.ok ? String((await res.json()).commit || '') : ''; } catch { version.commit = ''; }
  }
  return version.commit;
}

const PING = '{"t":"ping"}', PONG = '{"t":"pong"}'; // answered without waking the room
const STALE_MS = 150000; // a connection silent for that long is a ghost (background tabs ping at least once a minute)
const EPOCH = Date.UTC(2026, 0, 1); // relay clock = ms since then: stays continuous across sleeps and restarts

const number = (value, def, min, max) => {
  const n = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
// A frame is limited in bytes; only strings long enough to possibly exceed it are measured.
const tooBig = (message) => (typeof message === 'string'
  ? message.length > MAX_FRAME || (message.length * 3 > MAX_FRAME && new TextEncoder().encode(message).length > MAX_FRAME)
  : message.byteLength > MAX_FRAME);

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.started = Date.now();
    this.swept = this.started;
    this.timer = null;
    this.tickMs = Math.round(number(env.TICK_MS, 100, 20, 1000));
    this.staleMs = number(env.STALE_MS, STALE_MS, 1000, 3600000);
    this.relay = new Relay({
      max: Math.floor(number(env.MAX_PLAYERS, 200, 1, 4096)),
      near: Math.floor(number(env.NEAR, NEAR, 1, 1000)), range: number(env.RANGE, RANGE, 10, 5000), // (a crowd: see protocol.js)
      tick: this.tickMs,
      idle: 0, // no keep-alive states: an idle room must receive nothing, so that it can sleep
      now: () => Date.now() - EPOCH,
      send: (ws, text) => { try { ws.send(text); } catch { /* closing */ } },
      drop: (ws, code, reason) => this.drop(ws, code, reason),
      save: (p) => { try { p.conn.serializeAttachment({ id: p.id, name: p.name, color: p.color, kit: p.kit, joined: p.joined, state: p.state, ip: p.ip, ua: p.ua, dev: p.dev, sid: p.sid, build: p.build, admin: p.admin ? p.rank || 'owner' : false, key: p.key, cc: p.cc, city: p.city, since: p.since, badge: !!p.badge, wear: p.wear, wdev: p.wdev, want: p.want, look: p.look, mute: !!p.mute, ...(p.host && { host: true }), ...(p.tdev && { tdev: p.tdev }) }); } catch { /* closing */ } },
      // what a browser may be seen wearing: the notebook knows (asked again when the browser says something was bought)
      wardrobe: (dev) => this.notebook('/wardrobe', { dev }).then((r) => (r && 'wear' in r ? r.wear : undefined)),
      // …and under which name: the name of an account is for who is signed in to it (the notebook knows the accounts)
      named: (dev, name) => this.notebook('/named', { dev, name }).then((r) => !(r && r.mine === false)),
      // what is said in the chat is kept a while for the administrators (chatlog.js): handed to the notebook, a
      // few lines at a time
      said: (line) => {
        (this.saidLines ||= []).push({ ...line, t: Date.now() });
        if (this.saidLines.length >= 40) this.tellSaid(); else this.saidTimer ||= setTimeout(() => this.tellSaid(), 1500);
      },
      wake: () => { this.report(); this.arm(); }, // (somebody came in once their name was looked up; something waits to be flushed)
      // whose key: the owner's (the secret ADMIN_KEY), or that of an administrator who was named (the notebook knows them)
      admin: (key) => (sameSecret(key, (env.ADMIN_KEY || '').trim()) ? { rank: 'owner', id: '' } : looksNamed(key) ? this.notebook('/admin-key', { key }).then((r) => r?.who || null) : false),
      promote: (who) => this.notebook('/promote', who).then((r) => r?.made || null),
      // the big red button: when it last went off outlives the sleep of the room (and is forgotten once it may go off again)
      fired: (at) => { ctx.waitUntil(Promise.all([ctx.storage.put('blastAt', at), ctx.storage.setAlarm(Date.now() + BLAST_EVERY + 5000)]).catch(() => {})); },
      // who was put out of the room and may not come back in for a while: that too outlives its sleep
      outed: (list) => { ctx.waitUntil(ctx.storage.put('outs', list).catch(() => {})); },
      // the list of who is kept out is the notebook's (every room asks it)
      ban: (who) => ctx.waitUntil(env.ROOMS.get(env.ROOMS.idFromName(NOTEBOOK)).fetch(new Request('https://notebook/ban', { method: 'POST', body: JSON.stringify(who) })).catch(() => {})),
    });
    // Back from hibernation: the sockets are still connected, their owners are described by the attachments.
    const sockets = ctx.getWebSockets().map((ws) => ({ ws, known: ws.deserializeAttachment() }));
    for (const { ws, known } of sockets.sort((a, b) => (a.known?.id || 0) - (b.known?.id || 0))) { // in order of arrival
      if (!known || !Number.isInteger(known.id)) { this.drop(ws, 1011, 'lost'); continue; }
      // (its real last sign of life is the last ping Cloudflare answered for it, see sweep())
      this.relay.add(ws, known).seen = ctx.getWebSocketAutoResponseTimestamp(ws) ? 0 : this.started;
    }
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    this.name = ''; // (a room: the name it goes by — told by the Worker with each connection, kept through sleeps)
    this.live = ''; // (…and which version of the game is online, as the Worker last said)
    this.told = { n: -1, old: -1, at: 0 }; // (what the notebook was last told of this room)
    ctx.blockConcurrencyWhile(async () => {
      const at = await ctx.storage.get('blastAt'); if (Number.isFinite(at)) this.relay.blastAt = at;
      this.relay.keepOuts(await ctx.storage.get('outs'));
      const name = await ctx.storage.get('room'); if (typeof name === 'string') this.name = name;
      const live = await ctx.storage.get('live'); if (typeof live === 'string') this.live = live;
    });
  }

  /** Tells the notebook how many this room holds, when that has changed (see the top of this file). */
  report(now = false) {
    if (!this.name) return;
    const t = Date.now(), was = this.told;
    if (!now && was.n > 0 && t - was.at < REPORT_MS) {
      // (nobody is counted more often than that: what has changed meanwhile is said a little later — even if
      // nothing else happens here to say it)
      this.later ||= setTimeout(() => { this.later = null; this.report(true); }, REPORT_MS);
      return;
    }
    const { players: n, old } = this.relay.census(this.live);
    was.at = t;
    if (n === was.n && old === was.old && t - (was.said || 0) < AGAIN_MS) return;
    was.n = n; was.old = old; was.said = t;
    // (with how many connections each address has here: the door counts them, and keeps them nowhere)
    this.ctx.waitUntil(this.notebook('/room', { room: this.name, n, old, by: this.relay.addresses() }).then((heard) => {
      if (heard && heard.ok) return;
      // (the notebook did not hear: said again a little later)
      was.n = -1;
      this.later ||= setTimeout(() => { this.later = null; this.report(true); }, REPORT_MS);
    }));
  }

  /** The big red button may go off again: nothing is kept of the last time. */
  async alarm() { await this.ctx.storage.delete('blastAt'); }

  /** Asks the notebook something only the rooms and the Worker may ask (a path that is not reachable from outside). */
  /** The lines of chat that wait go to the notebook. */
  tellSaid() {
    clearTimeout(this.saidTimer); this.saidTimer = null;
    const lines = this.saidLines || [];
    this.saidLines = [];
    if (lines.length && this.name) this.notebook('/said', { room: this.name, lines });
  }

  async notebook(path, body) {
    try { return await (await this.env.ROOMS.get(this.env.ROOMS.idFromName(NOTEBOOK)).fetch(new Request(`https://notebook${path}`, { method: 'POST', body: JSON.stringify(body) }))).json(); } catch { return null; }
  }

  // The notebook (see the top of this file): what the game keeps, and the rate limits. `client` is the caller's address.
  async api(request, url) {
    const limiter = (this.limiter ||= new Limiter());
    const client = url.searchParams.get('client') || '';
    if (url.pathname === '/limit') {
      // may this address talk to a character once more? (and has the day's ceiling been reached?)
      const ok = allowed(limiter, 'npc', client) && limiter.allow('npc:day', ...LIMITS.npcDay);
      return Response.json({ ok });
    }
    const store = { get: (key) => this.ctx.storage.get(key), put: (key, value) => this.ctx.storage.put(key, value), delete: (key) => this.ctx.storage.delete(key) };
    const env = this.env, storage = this.ctx.storage, stripe = (this.stripe ||= stripeConfig(env));
    const mail = env.EMAIL && env.MAIL_FROM ? (m) => env.EMAIL.send({ from: String(env.MAIL_FROM), to: m.to, subject: m.subject, text: m.text, html: m.html }) : restMailer(env);
    if (request.headers.has(BUILD)) this.build = request.headers.get(BUILD) || '';
    const ctx = (this.apiCtx ||= {
      limiter, now: () => Date.now(),
      // which version is online (the Worker says so with each request); a word to every room; how many are connected
      build: () => this.build || '',
      push: (message) => this.tellRooms(JSON.stringify(message)),
      here: async () => Object.values((await this.directory(false)).rooms).reduce((sum, r) => sum + r.n, 0),
      // the rooms and their door (server/door.js): the directory, writing it down, a word to one room
      maxPlayers: Math.floor(number(env.MAX_PLAYERS, 200, 1, 4096)),
      releaseBase: /^(1|true|yes)$/i.test(String(env.FREE_ROOMS || '')) ? { freeRooms: true } : undefined, // (tests only: the rooms by address open where the owner decided nothing)
      // who is connected from where, as the rooms say it (in memory only) — and no limit by address at all in the tests that ask for it
      crowd: (this.crowd ||= newCrowd()),
      // kept out in silence from now on, or no longer: every room is told (bans.js)
      hush: async (who, on) => {
        const dir = await this.directory(false), text = JSON.stringify({ ...who, on: !!on });
        await Promise.all(Object.keys(dir.rooms).map((name) => this.env.ROOMS.get(this.env.ROOMS.idFromName(name)).fetch(new Request('https://room/hush', { method: 'POST', body: text })).catch(() => {})));
      },
      // put out from the back office (chatlog.js): every room — or the one named — is told; how many were put out
      oust: async (who, how) => {
        const dir = await this.directory(false), names = who.room ? (dir.rooms[who.room] ? [who.room] : []) : Object.keys(dir.rooms), text = JSON.stringify({ ...who, how });
        const said = await Promise.all(names.map((name) => this.env.ROOMS.get(this.env.ROOMS.idFromName(name)).fetch(new Request('https://room/oust', { method: 'POST', body: text })).then((r) => r.json()).catch(() => null)));
        return said.reduce((sum, r) => sum + (Number(r?.n) || 0), 0);
      },
      ...(/^(0|false|off|no)$/i.test(String(env.ADDRESS_LIMITS || '')) && { addressLimits: false }),
      directory: () => this.directory(),
      keep: (structure) => this.keep(structure),
      settleLater: () => this.settleSoon(),
      tell: (name, message) => this.tellRoom(name, JSON.stringify(message)),
      store, stripe,
      // e-mails leave through Cloudflare's Email Service: with its binding (EMAIL) where the Worker has one,
      // through its REST API with three secrets otherwise (see server/mail.js)
      mail,
      later: (work) => this.ctx.waitUntil(work), // (a message that leaves while its request is answered: mail.js)
      flags: { npc: !!env.ANTHROPIC_API_KEY, admin: !!env.ADMIN_KEY, shop: stripe.mode || 'off', mail: !!mail },
      // the secret that signs the notes of the runs: given, or drawn once and kept here
      secret: async () => {
        if (!this.signing) {
          this.signing = env.SCORE_SECRET || (await storage.get('secret'));
          if (!this.signing) await storage.put('secret', (this.signing = randomId(32)));
        }
        return this.signing;
      },
    });
    // (asked by the Worker and by the rooms only: these paths are not reachable from outside)
    if (url.pathname === '/room') {
      // a room says how many it holds: the door takes note, and puts its rooms in order
      const said = (await request.json().catch(() => null)) || {};
      if (typeof said.room === 'string' && said.room && Number.isInteger(said.n)) {
        const dir = await this.directory(false), rules = await roomRules(ctx);
        noteRoom(dir, said.room, said.n, Number.isInteger(said.old) ? said.old : 0, Date.now(), rules);
        noteCrowd(ctx.crowd, said.room, said.by, Date.now());
        this.settleSoon();
        await this.keep();
      }
      return Response.json({ ok: true });
    }
    if (url.pathname === '/knock') {
      // a connection is about to enter a room: is the caller kept out (and how), how many may the room hold, is
      // this the owner, is that name a room, has that address too many connections, what may they be seen wearing
      const q = url.searchParams;
      return Response.json(await knock(ctx, { room: q.get('room') || '', pass: q.get('pass') || '', ip: q.get('ip') || '', dev: q.get('dev') || '', ticket: q.get('ticket') || '' }));
    }
    if (url.pathname === '/wardrobe') return Response.json({ wear: await wardrobeOf(ctx, ((await request.json().catch(() => null)) || {}).dev || '') });
    if (url.pathname === '/said') { const b = (await request.json().catch(() => null)) || {}; await noteChat(ctx, String(b.room || ''), Array.isArray(b.lines) ? b.lines : []); return Response.json({ ok: true }); }
    if (url.pathname === '/named') { const b = (await request.json().catch(() => null)) || {}; return Response.json({ mine: await mayBeNamed(store, String(b.dev || ''), String(b.name || '')) }); }
    if (url.pathname === '/ban') return Response.json({ added: await addBan({ store, now: () => Date.now(), push: (message) => this.tellRooms(JSON.stringify(message)) }, (await request.json().catch(() => null)) || {}) }); // (push: a silence on a sponsor changes what the others see — bans.js)
    if (url.pathname === '/admin-key') return Response.json({ who: await adminOf(store, '', ((await request.json().catch(() => null)) || {}).key) });
    if (url.pathname === '/promote') return Response.json({ made: await nameAdmin(store, (await request.json().catch(() => null)) || {}, Date.now()) });
    const reading = request.method === 'GET' || request.method === 'HEAD';
    let body = null, raw = null;
    if (!reading) {
      const max = bodyMax(url.pathname), text = await request.text();
      if (text.length <= max) { raw = text; body = parseBody(text, max); }
    }
    const bearer = bearerKey(request.headers.get('Authorization'));
    const out = await route({
      method: request.method, path: url.pathname, query: url.searchParams, body, client, admin: sameSecret(bearer, (env.ADMIN_KEY || '').trim()), bearer, // (a space or a new line pasted with the secret does not count)
      geo: unpackGeo(request.headers.get(GEO)), raw, signature: request.headers.get('Stripe-Signature') || '', site: url.origin,
    }, ctx);
    if (out.bytes) return new Response(out.bytes, { status: out.status, headers: out.headers });
    return Response.json(out.body, { status: out.status, headers: { 'Cache-Control': 'no-store', ...out.headers } });
  }

  /**
   * The notebook: the rooms that hold somebody, as the door keeps them (server/rooms.js). What is written down
   * is which rooms there are and what the door makes of each; how many each holds is in memory only — when the
   * notebook has been unloaded (a quiet moment is enough), every room is asked again. `fresh`: so is a room
   * that has not been heard from for a while — it may have emptied without a word (a delivery drops every
   * connection, and the room with them).
   */
  async directory(fresh = true) {
    const cold = !this.dir;
    if (cold) {
      const kept = await this.ctx.storage.get('directory');
      this.dir = readDirectory(kept, kept ? null : await this.ctx.storage.get('rooms')); // ('rooms': as it was first kept)
      this.dirShape = shape(this.dir);
      for (const r of Object.values(this.dir.rooms)) r.at = 0; // (not heard from since: asked below)
    }
    const dir = this.dir, t = Date.now(), stale = fresh || cold ? staleRooms(dir, t).slice(0, 64) : [];
    if (stale.length) {
      for (const name of stale) dir.rooms[name].at = t; // (asked once, not by every request that comes meanwhile)
      const rules = await roomRules(this.apiCtx || { store: { get: (key) => this.ctx.storage.get(key) }, maxPlayers: Math.floor(number(this.env.MAX_PLAYERS, 200, 1, 4096)) });
      await Promise.all(stale.map(async (name) => {
        try {
          const c = await (await this.env.ROOMS.get(this.env.ROOMS.idFromName(name)).fetch(new Request('https://room/count'))).json();
          noteRoom(dir, name, c.players || 0, c.old || 0, Date.now(), rules);
        } catch { /* that room cannot be reached just now */ }
      }));
      await this.keep();
    }
    return dir;
  }

  /**
   * Puts the rooms in order (which goes quiet, who is offered another: server/door.js) a moment after the last
   * word from a room — once every room that has changed has said so: a room says how many it holds a few
   * seconds late, and a decision taken on half of the news would offer a room that has just emptied.
   */
  settleSoon() {
    clearTimeout(this.settling);
    this.settling = setTimeout(async () => {
      this.settling = null;
      try { await settle(this.apiCtx); await this.keep(); } catch (err) { console.error('[door]', String(err && err.message ? err.message : err).slice(0, 160)); }
    }, REPORT_MS + 1500);
  }

  /** Writes the directory down when a room came, went or changed phase (how many each holds is not kept: see above). */
  async keep() {
    if (!this.dir) return;
    const now = shape(this.dir);
    if (now === this.dirShape) return;
    this.dirShape = now;
    await this.ctx.storage.put('directory', packDirectory(this.dir));
  }

  /** The notebook says something to one room; resolves to how many heard it there. */
  async tellRoom(name, text) {
    const dir = await this.directory(false);
    try {
      const res = await this.env.ROOMS.get(this.env.ROOMS.idFromName(name)).fetch(new Request('https://room/push', { method: 'POST', body: text }));
      const { players: n, old = 0 } = await res.json();
      // (a room that turned out to be empty — its visitors were dropped by a delivery — is forgotten)
      if (dir.rooms[name] && (n !== dir.rooms[name].n || old !== dir.rooms[name].old)) noteRoom(dir, name, n, old, Date.now());
      return n;
    } catch { return 0; } // (that room cannot be reached just now)
  }

  /** The notebook says something to every room that holds somebody; resolves to how many rooms heard it. */
  async tellRooms(text) {
    const dir = await this.directory(false);
    const heard = await Promise.all(Object.keys(dir.rooms).map((name) => this.tellRoom(name, text)));
    await this.keep();
    return heard.filter((n) => n > 0).length;
  }

  // Reached through the Worker below: a WebSocket handshake, a head count, or the notebook.
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || ['/limit', '/knock', '/ban', '/admin-key', '/promote', '/room', '/wardrobe', '/named', '/said'].includes(url.pathname)) return this.api(request, url);
    if (url.pathname === '/hush') {
      // the notebook says who is kept out in silence from now on, or no longer (not reachable from outside)
      const w = (await request.json().catch(() => null)) || {};
      return Response.json({ n: this.relay.hush({ ip: typeof w.ip === 'string' ? w.ip : '', dev: typeof w.dev === 'string' ? w.dev : '', devs: Array.isArray(w.devs) ? w.devs.filter((d) => typeof d === 'string').slice(0, 12) : [] }, !!w.on) });
    }
    if (url.pathname === '/oust') {
      // the notebook says who is put out from the back office (not reachable from outside)
      const w = (await request.json().catch(() => null)) || {}, devs = Array.isArray(w.devs) ? w.devs.filter((d) => typeof d === 'string').slice(0, 12) : [];
      return Response.json({ n: this.relay.oust({ dev: typeof w.dev === 'string' ? w.dev : '', devs, ...(Number.isInteger(w.id) && { id: w.id, since: Number(w.since) }) }, ['kick', 'ban', 'move'].includes(w.how) ? w.how : 'kick') });
    }
    if (url.pathname === '/push') {
      // the notebook has something to say to everybody here (not reachable from outside)
      this.relay.broadcast(await request.text());
      return Response.json(this.relay.census(this.live));
    }
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      this.sweep();
      return Response.json({ ...this.relay.census(this.live), ...(this.env.DEBUG ? { up: Date.now() - this.started } : {}) });
    }
    // (the name this room goes by: the Worker says it with each connection)
    const named = cleanRoom(url.searchParams.get('room'));
    if (named !== this.name) { this.name = named; this.ctx.waitUntil(this.ctx.storage.put('room', named)); }
    const live = request.headers.get(BUILD) || '';
    if (live && live !== this.live) { this.live = live; this.ctx.waitUntil(this.ctx.storage.put('live', live)); }
    this.sweep();
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    // (what the door said, through the Worker: how many this room may hold just now, and whether this is the owner — who always gets in)
    const max = Math.floor(number(request.headers.get(MAX) || undefined, this.relay.io.max, 1, 4096)), pass = request.headers.get(PASS) === '1';
    if (!pass && this.relay.size >= max) {
      // Full: said on an ordinary socket, closed at once (it never becomes one of the room's connections).
      server.accept();
      server.send('{"t":"full"}');
      server.close(1013, 'full');
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server);
    // (…what this visitor may be seen wearing, and whether they are kept out in silence)
    const worn = /^(\d{1,10})\.(\d{1,9})$/.exec(request.headers.get(WEAR) || '');
    const p = this.relay.add(server, undefined, { ip: request.headers.get('CF-Connecting-IP') || '', ua: request.headers.get('User-Agent') || '', ...unpackGeo(request.headers.get(GEO)), max, pass,
      dev: url.searchParams.get('dev') || '', ...(worn && { wear: { m: Number(worn[1]), left: Number(worn[2]) } }), mute: request.headers.get(MUTE) === '1', host: request.headers.get(HOST) === '1' });
    p.seen = Date.now();
    this.relay.io.save(p);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    if (tooBig(message)) return this.drop(ws, 1009, 'too big');
    const p = this.relay.players.get(ws);
    if (p) p.seen = Date.now();
    this.relay.receive(ws, typeof message === 'string' ? message : null);
    this.report();
    this.arm();
  }

  // States are batched: one timer per burst of activity, none while the room is quiet. (In a crowd the relay
  // may ask for another round — its circles and its map lag a little behind what moves — then goes quiet.)
  arm() {
    if (!this.relay.pending || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.relay.flush();
      this.sweep();
      this.arm();
    }, this.tickMs);
  }

  webSocketClose(ws) { this.drop(ws, 1000, 'bye'); }
  webSocketError(ws) { this.drop(ws, 1011, 'error'); }

  /** Forgets a connection (the others are told) and closes it. */
  drop(ws, code, reason) {
    this.relay.remove(ws);
    try { ws.close(code, reason); } catch { /* already closed */ }
    this.report(this.relay.size === 0); // (the last one out: said at once — nothing more will happen here to say it later)
  }

  /** Closes connections that have shown no sign of life for a long time (phones that lost their network…). */
  sweep() {
    const t = Date.now();
    if (t - this.swept < Math.min(15000, this.staleMs / 2)) return;
    this.swept = t;
    for (const p of [...this.relay.players.values()]) {
      const ping = this.ctx.getWebSocketAutoResponseTimestamp(p.conn);
      if (t - Math.max(p.seen || 0, ping ? ping.getTime() : 0) > this.staleMs) this.drop(p.conn, 1001, 'stale');
    }
  }
}

// A connection is about to enter a room: is this address or this device kept out, how many may the room hold,
// is this the owner, is that name a room at all? The notebook knows (asked once per connection).
async function knockAt(env, ip, dev, room, pass, ticket = '') {
  try {
    const res = await env.ROOMS.get(env.ROOMS.idFromName(NOTEBOOK)).fetch(new Request(`https://notebook/knock?ip=${encodeURIComponent(ip)}&dev=${encodeURIComponent(dev)}&room=${encodeURIComponent(room)}&pass=${encodeURIComponent(pass)}&ticket=${encodeURIComponent(ticket)}`));
    return (await res.json()) || {};
  } catch { return {}; } // (the notebook cannot be reached: let them in — the room has its own limit)
}
// Said on an ordinary socket, closed at once (it never becomes one of a room's connections).
function turnedAway(text, code, reason) {
  const pair = new WebSocketPair();
  pair[1].accept();
  pair[1].send(text);
  pair[1].close(code, reason);
  return new Response(null, { status: 101, webSocket: pair[0] });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (!env.ROOMS) return new Response('Multiplayer presence is not configured.\n', { status: 501 });
      if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
        return new Response('WebSocket endpoint.\n', { status: 426, headers: { Upgrade: 'websocket' } });
      }
      if (!originAllowed(request.headers.get('Origin'), url.host, parseOrigins(env.ALLOWED_ORIGINS))) return new Response(null, { status: 403 });
      // kept out by the administrator? and what the door says of that room
      const ip = request.headers.get('CF-Connecting-IP') || '', dev = url.searchParams.get('dev') || '';
      const room = cleanRoom(url.searchParams.get('room'));
      const door = await knockAt(env, ip, dev, room, url.searchParams.get('pass') || '', url.searchParams.get('ticket') || '');
      if (door.banned) return turnedAway('{"t":"kicked","ban":true}', 4003, 'banned');
      if (door.closed) return turnedAway('{"t":"closed"}', 1013, 'closed'); // (not a room one may open)
      // (a room a player made: nobody in without a good ticket — nor when the door could not be asked)
      if (door.locked || (isUserRoom(room) && door.seen !== true)) return turnedAway('{"t":"locked"}', 1013, 'locked');
      if (door.limit) return turnedAway(JSON.stringify({ t: 'limit', of: String(door.limit.of), max: Number(door.limit.max) || 0 }), 1013, 'limit'); // (too many from that address)
      const asked = withGeo(request);
      asked.headers.set(BUILD, await buildId(env, url.origin)); // (the room is told which version is online: it counts who is not on it)
      if (Number.isFinite(door.max)) asked.headers.set(MAX, String(door.max));
      if (door.pass) asked.headers.set(PASS, '1');
      if (door.wear && Number.isInteger(door.wear.m)) asked.headers.set(WEAR, `${door.wear.m}.${Math.max(0, Math.floor(Number(door.wear.left) || 0))}`);
      if (door.mute) asked.headers.set(MUTE, '1');
      if (door.host) asked.headers.set(HOST, '1');
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(asked);
    }
    if (url.pathname === '/healthz') return new Response('ok');
    if (url.pathname === '/api/presence') {
      if (!env.ROOMS) return Response.json({ room: null, players: 0 });
      const room = cleanRoom(url.searchParams.get('room'));
      const count = await env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(new Request('https://room/count'));
      return Response.json({ room, ...(await count.json()) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.pathname.startsWith('/api/')) {
      const json = (status, body, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
      const post = request.method === 'POST', reading = request.method === 'GET' || request.method === 'HEAD';
      // (Stripe is no browser: what it sends is told by its signature, not by where it comes from)
      if (!reading && url.pathname !== '/api/stripe/webhook' && !mayPost(request.headers.get('Origin'), url.host, parseOrigins(env.ALLOWED_ORIGINS))) return json(403, { error: 'Forbidden.' });
      if (!env.ROOMS) return json(501, { error: 'Not configured.' });
      const notebook = env.ROOMS.get(env.ROOMS.idFromName(NOTEBOOK));
      const client = request.headers.get('CF-Connecting-IP') || '';
      if (url.pathname !== '/api/npc') {
        // everything the game keeps is in the notebook (which is told, each time, which version is online)
        const to = new URL(request.url);
        to.searchParams.set('client', client);
        const asked = withGeo(request, to);
        asked.headers.set(BUILD, await buildId(env, url.origin));
        return notebook.fetch(asked);
      }
      if (!post) return json(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
      if (!env.ANTHROPIC_API_KEY) return json(501, { reply: null, error: 'No model is configured for the characters.' });
      const text = await request.text();
      const talk = cleanTalk(text.length <= BODY_MAX ? parseBody(text) : null);
      if (!talk) return json(400, { error: 'Not a conversation.' });
      const may = await (await notebook.fetch(new Request(`https://notebook/limit?client=${encodeURIComponent(client)}`))).json();
      if (!may.ok) return json(429, { reply: null, error: 'Too many requests.' }, { 'Retry-After': '60' });
      return json(200, { reply: await npcReply({ apiKey: env.ANTHROPIC_API_KEY, model: env.NPC_MODEL || NPC_MODEL }, talk) });
    }
    // Anything else that is not a file of the site (the files themselves never reach this script).
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found.\n', { status: 404 });
  },
};
