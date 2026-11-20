// Magic Mill Fair on Cloudflare: one Worker. The built site (dist/) is served by Cloudflare's static assets;
// this script only answers /ws (multiplayer presence), /api/presence and /healthz.
//
// Each room is a Durable Object running the very relay of the Node server (../server/protocol.js). It is
// written to sleep whenever nobody moves: connections stay open while the object hibernates, the clients'
// pings are answered by Cloudflare itself, and what a newcomer must know about each visitor travels in the
// socket attachments, so nothing is lost when the object is unloaded.
// Variables (wrangler.jsonc): MAX_PLAYERS (48 per room), TICK_MS (100), ALLOWED_ORIGINS (default: same host);
// for tests only: STALE_MS, DEBUG.
import { DurableObject } from 'cloudflare:workers';
import { Room as Relay, MAX_FRAME, cleanRoom, originAllowed, parseOrigins } from '../server/protocol.js';

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
      max: Math.floor(number(env.MAX_PLAYERS, 48, 1, 4096)),
      tick: this.tickMs,
      idle: 0, // no keep-alive states: an idle room must receive nothing, so that it can sleep
      now: () => Date.now() - EPOCH,
      send: (ws, text) => { try { ws.send(text); } catch { /* closing */ } },
      drop: (ws, code, reason) => this.drop(ws, code, reason),
      save: (p) => { try { p.conn.serializeAttachment({ id: p.id, name: p.name, color: p.color, joined: p.joined, state: p.state }); } catch { /* closing */ } },
    });
    // Back from hibernation: the sockets are still connected, their owners are described by the attachments.
    const sockets = ctx.getWebSockets().map((ws) => ({ ws, known: ws.deserializeAttachment() }));
    for (const { ws, known } of sockets.sort((a, b) => (a.known?.id || 0) - (b.known?.id || 0))) { // in order of arrival
      if (!known || !Number.isInteger(known.id)) { this.drop(ws, 1011, 'lost'); continue; }
      // (its real last sign of life is the last ping Cloudflare answered for it, see sweep())
      this.relay.add(ws, known).seen = ctx.getWebSocketAutoResponseTimestamp(ws) ? 0 : this.started;
    }
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  // Reached through the Worker below: a WebSocket handshake, or a head count.
  async fetch(request) {
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
    const p = this.relay.add(server);
    p.seen = Date.now();
    this.relay.io.save(p);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    if (tooBig(message)) return this.drop(ws, 1009, 'too big');
    const p = this.relay.players.get(ws);
    if (p) p.seen = Date.now();
    this.relay.receive(ws, typeof message === 'string' ? message : null);
    // States are batched: one timer per burst of activity, none while the room is quiet.
    if (this.relay.pending && !this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.relay.flush();
        this.sweep();
      }, this.tickMs);
    }
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      if (!env.ROOMS) return new Response('Multiplayer presence is not configured.\n', { status: 501 });
      if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
        return new Response('WebSocket endpoint.\n', { status: 426, headers: { Upgrade: 'websocket' } });
      }
      if (!originAllowed(request.headers.get('Origin'), url.host, parseOrigins(env.ALLOWED_ORIGINS))) return new Response(null, { status: 403 });
      const room = cleanRoom(url.searchParams.get('room'));
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
    }
    if (url.pathname === '/healthz') return new Response('ok');
    if (url.pathname === '/api/presence') {
      if (!env.ROOMS) return Response.json({ room: null, players: 0 });
      const room = cleanRoom(url.searchParams.get('room'));
      const count = await env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(new Request('https://room/count'));
      return Response.json({ room, ...(await count.json()) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    // Anything else that is not a file of the site (the files themselves never reach this script).
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found.\n', { status: 404 });
  },
};
