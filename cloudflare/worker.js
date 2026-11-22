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
// of the game runs; drawn and kept by the notebook otherwise); for tests only: STALE_MS, DEBUG.
import { DurableObject } from 'cloudflare:workers';
import { Room as Relay, MAX_FRAME, NEAR, RANGE, BLAST_EVERY, cleanRoom, originAllowed, parseOrigins } from '../server/protocol.js';
import { Limiter, LIMITS, BODY_MAX, allowed, parseBody, mayPost, bodyMax } from '../server/api.js';
import { stripeConfig } from '../server/stripe.js';
import { route, banned, addBan } from '../server/routes.js';
import { randomId, sameSecret } from '../server/token.js';
import { NPC_MODEL, cleanTalk, npcReply } from '../server/npc.js';
import { adminOf, looksNamed, nameAdmin } from '../server/admins.js';
import { cleanGeo, packGeo, unpackGeo } from '../server/visitors.js';

const NOTEBOOK = '~api'; // the object that keeps the scores (room names are [a-z0-9_-] only)
const GEO = 'X-Fair-Geo'; // where a request comes from, as Cloudflare knows it: set by the Worker below, and by nobody else
// The request, handed on to an object with where it comes from (whatever the caller wrote in that header is dropped).
const withGeo = (request, url) => {
  const headers = new Headers(request.headers), cf = request.cf || {};
  const geo = packGeo(cleanGeo({ cc: cf.country, city: cf.city, region: cf.region }));
  if (geo) headers.set(GEO, geo); else headers.delete(GEO);
  return new Request(url || request.url, new Request(request, { headers }));
};

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
      save: (p) => { try { p.conn.serializeAttachment({ id: p.id, name: p.name, color: p.color, kit: p.kit, joined: p.joined, state: p.state, ip: p.ip, ua: p.ua, dev: p.dev, admin: p.admin ? p.rank || 'owner' : false, key: p.key, cc: p.cc, city: p.city, since: p.since }); } catch { /* closing */ } },
      // whose key: the owner's (the secret ADMIN_KEY), or that of an administrator who was named (the notebook knows them)
      admin: (key) => (sameSecret(key, env.ADMIN_KEY || '') ? { rank: 'owner', id: '' } : looksNamed(key) ? this.notebook('/admin-key', { key }).then((r) => r?.who || null) : false),
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
    ctx.blockConcurrencyWhile(async () => { const at = await ctx.storage.get('blastAt'); if (Number.isFinite(at)) this.relay.blastAt = at; });
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
    // (asked by the Worker and by the rooms only: these two paths are not reachable from outside)
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
    const ctx = (this.apiCtx ||= {
      limiter, now: () => Date.now(),
      store, stripe,
      flags: { npc: !!env.ANTHROPIC_API_KEY, admin: !!env.ADMIN_KEY, shop: stripe.mode || 'off' },
      // the secret that signs the notes of the runs: given, or drawn once and kept here
      secret: async () => {
        if (!this.signing) {
          this.signing = env.SCORE_SECRET || (await storage.get('secret'));
          if (!this.signing) await storage.put('secret', (this.signing = randomId(32)));
        }
        return this.signing;
      },
    });
    const bearer = /^Bearer (.+)$/.exec(request.headers.get('Authorization') || '')?.[1] || '';
    const out = await route({
      method: request.method, path: url.pathname, query: url.searchParams, body, client, admin: sameSecret(bearer, env.ADMIN_KEY || ''), bearer,
      geo: unpackGeo(request.headers.get(GEO)), raw, signature: request.headers.get('Stripe-Signature') || '', site: url.origin,
    }, ctx);
    if (out.bytes) return new Response(out.bytes, { status: out.status, headers: out.headers });
    return Response.json(out.body, { status: out.status, headers: { 'Cache-Control': 'no-store', ...out.headers } });
  }

  // Reached through the Worker below: a WebSocket handshake, a head count, or the notebook.
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || ['/limit', '/banned', '/ban', '/admin-key', '/promote'].includes(url.pathname)) return this.api(request, url);
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      this.sweep();
      return Response.json({ players: this.relay.joined, ...(this.env.DEBUG ? { up: Date.now() - this.started } : {}) });
    }
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
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(withGeo(request));
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
        // everything the game keeps is in the notebook
        const to = new URL(request.url);
        to.searchParams.set('client', client);
        return notebook.fetch(withGeo(request, to));
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
