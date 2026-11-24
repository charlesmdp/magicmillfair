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
// Variables (wrangler.jsonc): MAX_PLAYERS (250 per room), TICK_MS (100), ALLOWED_ORIGINS (default: same host),
// NPC_MODEL; secrets: ANTHROPIC_API_KEY (without it the characters use the lines kept in the game), ADMIN_KEY
// (the administrator's key; without it nobody is the administrator), SCORE_SECRET (optional: signs the notes
// of the game runs; drawn and kept by the notebook otherwise); for tests only: STALE_MS, DEBUG, BUILD_ID.
//
// The rooms tell the notebook how many they hold (when it changes, a few seconds apart at the most): the
// notebook thus knows which rooms there are, can say something to all of them at once (what is released, a
// word from the owner: server/release.js), and how many visitors are connected. Only that number is kept.
import { DurableObject } from 'cloudflare:workers';
import { Room as Relay, MAX_FRAME, NEAR, RANGE, BLAST_EVERY, cleanRoom, originAllowed, parseOrigins } from '../server/protocol.js';
import { Limiter, LIMITS, BODY_MAX, allowed, parseBody, mayPost, bodyMax } from '../server/api.js';
import { stripeConfig } from '../server/stripe.js';
import { restMailer } from '../server/mail.js';
import { route, banned, addBan } from '../server/routes.js';
import { randomId, sameSecret, bearerKey } from '../server/token.js';
import { NPC_MODEL, cleanTalk, npcReply } from '../server/npc.js';
import { adminOf, looksNamed, nameAdmin } from '../server/admins.js';
import { cleanGeo, packGeo, unpackGeo } from '../server/visitors.js';

const BUILD = 'X-Fair-Build'; // which version of the game is online: read by the Worker from its own files, told to the notebook
const REPORT_MS = 5000; // a room tells the notebook how many it holds at most this often (at once when it fills from empty, or empties)

const NOTEBOOK = '~api'; // the object that keeps the scores (room names are [a-z0-9_-] only)
const GEO = 'X-Fair-Geo'; // where a request comes from, as Cloudflare knows it: set by the Worker below, and by nobody else
// The request, handed on to an object with where it comes from (whatever the caller wrote in that header is dropped).
const withGeo = (request, url) => {
  const headers = new Headers(request.headers), cf = request.cf || {};
  const geo = packGeo(cleanGeo({ cc: cf.country, city: cf.city, region: cf.region }));
  if (geo) headers.set(GEO, geo); else headers.delete(GEO);
  headers.delete(BUILD);
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
      max: Math.floor(number(env.MAX_PLAYERS, 250, 1, 4096)),
      near: Math.floor(number(env.NEAR, NEAR, 1, 1000)), range: number(env.RANGE, RANGE, 10, 5000), // (a crowd: see protocol.js)
      tick: this.tickMs,
      idle: 0, // no keep-alive states: an idle room must receive nothing, so that it can sleep
      now: () => Date.now() - EPOCH,
      send: (ws, text) => { try { ws.send(text); } catch { /* closing */ } },
      drop: (ws, code, reason) => this.drop(ws, code, reason),
      save: (p) => { try { p.conn.serializeAttachment({ id: p.id, name: p.name, color: p.color, kit: p.kit, joined: p.joined, state: p.state, ip: p.ip, ua: p.ua, dev: p.dev, sid: p.sid, build: p.build, admin: p.admin ? p.rank || 'owner' : false, key: p.key, cc: p.cc, city: p.city, since: p.since }); } catch { /* closing */ } },
      // whose key: the owner's (the secret ADMIN_KEY), or that of an administrator who was named (the notebook knows them)
      admin: (key) => (sameSecret(key, (env.ADMIN_KEY || '').trim()) ? { rank: 'owner', id: '' } : looksNamed(key) ? this.notebook('/admin-key', { key }).then((r) => r?.who || null) : false),
      promote: (who) => this.notebook('/promote', who).then((r) => r?.made || null),
      // the big red button: when it last went off outlives the sleep of the room (and is forgotten once it may go off again)
      fired: (at) => { ctx.waitUntil(Promise.all([ctx.storage.put('blastAt', at), ctx.storage.setAlarm(Date.now() + BLAST_EVERY + 5000)]).catch(() => {})); },
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
      const name = await ctx.storage.get('room'); if (typeof name === 'string') this.name = name;
      const live = await ctx.storage.get('live'); if (typeof live === 'string') this.live = live;
    });
  }

  /** Tells the notebook how many this room holds, when that has changed (see the top of this file). */
  report(now = false) {
    if (!this.name) return;
    const t = Date.now(), was = this.told;
    if (!now && was.n > 0 && t - was.at < REPORT_MS) return; // (nobody is counted more often than that)
    const { players: n, old } = this.relay.census(this.live);
    was.at = t;
    if (n === was.n && old === was.old) return;
    was.n = n; was.old = old;
    this.ctx.waitUntil(this.notebook('/room', { room: this.name, n, old }));
  }

  /** The big red button may go off again: nothing is kept of the last time. */
  async alarm() { await this.ctx.storage.delete('blastAt'); }

  /** Asks the notebook something only the rooms and the Worker may ask (a path that is not reachable from outside). */
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
    // (asked by the Worker and by the rooms only: these paths are not reachable from outside)
    if (url.pathname === '/room') {
      // a room says how many it holds
      const said = (await request.json().catch(() => null)) || {}, rooms = await this.directory();
      if (typeof said.room === 'string' && said.room && Number.isInteger(said.n)) {
        if (said.n > 0) rooms[said.room] = { n: said.n, old: Number.isInteger(said.old) ? said.old : 0 }; else delete rooms[said.room];
        await this.ctx.storage.put('rooms', rooms);
      }
      return Response.json({ ok: true });
    }
    if (url.pathname === '/banned') return Response.json({ banned: await banned({ store, now: () => Date.now() }, url.searchParams.get('ip') || '', url.searchParams.get('dev') || '') });
    if (url.pathname === '/ban') return Response.json({ added: await addBan({ store, now: () => Date.now() }, (await request.json().catch(() => null)) || {}) });
    if (url.pathname === '/admin-key') return Response.json({ who: await adminOf(store, '', ((await request.json().catch(() => null)) || {}).key) });
    if (url.pathname === '/promote') return Response.json({ made: await nameAdmin(store, (await request.json().catch(() => null)) || {}, Date.now()) });
    const reading = request.method === 'GET' || request.method === 'HEAD';
    let body = null, raw = null;
    if (!reading) {
      const max = bodyMax(url.pathname), text = await request.text();
      if (text.length <= max) { raw = text; body = parseBody(text, max); }
    }
    const env = this.env, storage = this.ctx.storage, stripe = (this.stripe ||= stripeConfig(env));
    const mail = env.EMAIL && env.MAIL_FROM ? (m) => env.EMAIL.send({ from: String(env.MAIL_FROM), to: m.to, subject: m.subject, text: m.text, html: m.html }) : restMailer(env);
    this.build = request.headers.get(BUILD) || '';
    const ctx = (this.apiCtx ||= {
      limiter, now: () => Date.now(),
      // which version is online (the Worker says so with each request); a word to every room; how many are connected
      build: () => this.build,
      push: (message) => this.tellRooms(JSON.stringify(message)),
      here: async () => Object.values(await this.directory()).reduce((sum, r) => sum + r.n, 0),
      rooms: async () => Object.entries(await this.directory()).map(([name, r]) => ({ name, players: r.n, old: r.old })),
      store, stripe,
      // e-mails leave through Cloudflare's Email Service: with its binding (EMAIL) where the Worker has one,
      // through its REST API with three secrets otherwise (see server/mail.js)
      mail,
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
    const bearer = bearerKey(request.headers.get('Authorization'));
    const out = await route({
      method: request.method, path: url.pathname, query: url.searchParams, body, client, admin: sameSecret(bearer, (env.ADMIN_KEY || '').trim()), bearer, // (a space or a new line pasted with the secret does not count)
      geo: unpackGeo(request.headers.get(GEO)), raw, signature: request.headers.get('Stripe-Signature') || '', site: url.origin,
    }, ctx);
    if (out.bytes) return new Response(out.bytes, { status: out.status, headers: out.headers });
    return Response.json(out.body, { status: out.status, headers: { 'Cache-Control': 'no-store', ...out.headers } });
  }

  /** The notebook: the rooms that hold somebody — how many, and how many of them on an older version ({ name: { n, old } }). */
  async directory() {
    if (!this.rooms) {
      this.rooms = (await this.ctx.storage.get('rooms')) || {};
      for (const [name, r] of Object.entries(this.rooms)) if (typeof r === 'number') this.rooms[name] = { n: r, old: 0 }; // (as it was first kept)
    }
    return this.rooms;
  }

  /** The notebook says something to every room that holds somebody; resolves to how many rooms heard it. */
  async tellRooms(text) {
    const rooms = await this.directory();
    let told = 0, changed = false;
    await Promise.all(Object.keys(rooms).map(async (name) => {
      try {
        const res = await this.env.ROOMS.get(this.env.ROOMS.idFromName(name)).fetch(new Request('https://room/push', { method: 'POST', body: text }));
        const { players: n, old = 0 } = await res.json();
        if (n > 0) told++;
        // (a room that turned out to be empty — its visitors were dropped by a delivery — is forgotten)
        if (n !== rooms[name].n || old !== rooms[name].old) { changed = true; if (n > 0) rooms[name] = { n, old }; else delete rooms[name]; }
      } catch { /* that room cannot be reached just now */ }
    }));
    if (changed) await this.ctx.storage.put('rooms', rooms);
    return told;
  }

  // Reached through the Worker below: a WebSocket handshake, a head count, or the notebook.
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || ['/limit', '/banned', '/ban', '/admin-key', '/promote', '/room'].includes(url.pathname)) return this.api(request, url);
    if (url.pathname === '/push') {
      // the notebook has something to say to everybody here (not reachable from outside)
      this.relay.broadcast(await request.text());
      return Response.json(this.relay.census(this.live));
    }
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      this.sweep();
      return Response.json({ players: this.relay.joined, ...(this.env.DEBUG ? { up: Date.now() - this.started } : {}) });
    }
    // (the name this room goes by: the Worker says it with each connection)
    const named = cleanRoom(url.searchParams.get('room'));
    if (named !== this.name) { this.name = named; this.ctx.waitUntil(this.ctx.storage.put('room', named)); }
    const live = request.headers.get(BUILD) || '';
    if (live && live !== this.live) { this.live = live; this.ctx.waitUntil(this.ctx.storage.put('live', live)); }
    this.sweep();
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    if (this.relay.size >= this.relay.io.max) {
      // Full: said on an ordinary socket, closed at once (it never becomes one of the room's connections).
      server.accept();
      server.send('{"t":"full"}');
      server.close(1013, 'full');
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server);
    const p = this.relay.add(server, undefined, { ip: request.headers.get('CF-Connecting-IP') || '', ua: request.headers.get('User-Agent') || '', ...unpackGeo(request.headers.get(GEO)) });
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

// Is this address or this device kept out? The notebook knows (asked once per connection).
async function isBanned(env, ip, dev) {
  try {
    const res = await env.ROOMS.get(env.ROOMS.idFromName(NOTEBOOK)).fetch(new Request(`https://notebook/banned?ip=${encodeURIComponent(ip)}&dev=${encodeURIComponent(dev)}`));
    return !!(await res.json()).banned;
  } catch { return false; } // (the notebook cannot be reached: let them in)
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
      // kept out by the administrator?
      const ip = request.headers.get('CF-Connecting-IP') || '', dev = url.searchParams.get('dev') || '';
      if (await isBanned(env, ip, dev)) {
        const pair = new WebSocketPair();
        pair[1].accept();
        pair[1].send('{"t":"kicked","ban":true}');
        pair[1].close(4003, 'banned');
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
      const room = cleanRoom(url.searchParams.get('room'));
      const asked = withGeo(request);
      asked.headers.set(BUILD, await buildId(env, url.origin)); // (the room is told which version is online: it counts who is not on it)
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
