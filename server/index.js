// Magic Mill Fair — production server: static files from dist/ plus the multiplayer presence relay on /ws.
// The server has no authority over the game: every client shares its own avatar state and the server only
// batches those states to the other members of the room at a fixed tick.
// Environment: PORT (8787), HOST (0.0.0.0), TICK_HZ (12), MAX_PLAYERS (250, per room), DIST_DIR (../dist) and
// ALLOWED_ORIGINS (comma separated origins allowed to open the WebSocket; default: same host and localhost).
// The relay itself (protocol, validation, batching) is in ./protocol.js, shared with the Cloudflare version.
// It also answers the game's small API (./routes.js): the leaderboards, the visits… (kept in SCORES_FILE, by
// default data/scores.json) and the characters one can talk to (/api/npc, when ANTHROPIC_API_KEY is set;
// NPC_MODEL picks the model). ADMIN_KEY is the administrator's key (none: nobody is the administrator).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { WebSocketServer } from 'ws';
import { Room, MAX_FRAME, NEAR, RANGE, cleanRoom, originAllowed, parseOrigins } from './protocol.js';
import { Limiter, LIMITS, BODY_MAX, allowed, parseBody, mayPost, bodyMax } from './api.js';
import { stripeConfig } from './stripe.js';
import { route, banned, addBan } from './routes.js';
import { adminOf, looksNamed, nameAdmin } from './admins.js';
import { geoFromHeaders } from './visitors.js';
import { randomId, sameSecret } from './token.js';
import { NPC_MODEL, cleanTalk, npcReply } from './npc.js';

const env = (name, def, min, max) => {
  const n = Number(process.env[name]);
  return process.env[name] && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(process.env.DIST_DIR || path.join(ROOT, 'dist'));
const PORT = Math.floor(env('PORT', 8787, 0, 65535));
const HOST = process.env.HOST || '0.0.0.0';
const TICK_HZ = env('TICK_HZ', 12, 1, 60);
const MAX_PLAYERS = Math.floor(env('MAX_PLAYERS', 250, 1, 4096)); // per room
const ALLOWED_ORIGINS = parseOrigins(process.env.ALLOWED_ORIGINS);
const HEARTBEAT_MS = 15000;
const SCORES_FILE = path.resolve(process.env.SCORES_FILE || path.join(ROOT, 'data', 'scores.json'));
const NPC = { apiKey: process.env.ANTHROPIC_API_KEY || '', model: process.env.NPC_MODEL || NPC_MODEL };
const ADMIN_KEY = process.env.ADMIN_KEY || '';
// behind a proxy that says where each visitor comes from (Cloudflare's "visitor location" headers): GEO_HEADERS=1
const GEO_HEADERS = /^(1|true|yes)$/i.test(process.env.GEO_HEADERS || '');
const geoOf = (req) => (GEO_HEADERS ? geoFromHeaders((name) => req.headers[name]) : null);

const now = () => Math.round(performance.now());
const splitUrl = (url) => String(url || '/').split(/\?(.*)/s); // → [path, query]

// ---------------------------------------------------------------------------------------------- static files

const MIME = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', map: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8', svg: 'image/svg+xml', gltf: 'model/gltf+json', png: 'image/png',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon', woff2: 'font/woff2',
  bin: 'application/octet-stream', wasm: 'application/wasm', glb: 'model/gltf-binary',
};
const TEXTUAL = /^text\/|json|svg/; // worth compressing on the fly
const ZIP_MAX_FILE = 16 << 20; // larger files are streamed as they are
const gzip = promisify(zlib.gzip), brotli = promisify(zlib.brotliCompress);
const zipCache = new Map(); // "encoding|file" → { tag: "mtime|size", job: Promise<Buffer|null> }

// Content-hashed file names never change: Vite's name-AbCd1234.ext (8 base64url characters). Hand-written names
// hardly ever mix an upper-case letter with lower-case ones or digits there; a miss only costs a revalidation.
function isHashed(name) {
  const hash = /-([\w-]{8})(?:\.[a-z\d]+){1,2}$/i.exec(name)?.[1] || '';
  return /[A-Z]/.test(hash) && /[a-z\d]/.test(hash);
}

// Compressed copy of a file, computed once per (file, mtime, encoding); null when it would not be smaller.
function compressed(file, st, encoding) {
  const key = `${encoding}|${file}`, tag = `${st.mtimeMs}|${st.size}`;
  let entry = zipCache.get(key);
  if (!entry || entry.tag !== tag) {
    const job = fs.promises.readFile(file)
      .then((raw) => (encoding === 'br' ? brotli(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } }) : gzip(raw, { level: 9 })))
      .then((buf) => (buf.length < st.size ? buf : null));
    job.catch(() => zipCache.delete(key));
    zipCache.set(key, (entry = { tag, job }));
  }
  return entry.job;
}

function reply(req, res, status, body, headers = {}) {
  const data = Buffer.from(body);
  const base = { 'Content-Type': MIME.txt, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  res.writeHead(status, { ...base, ...headers, 'Content-Length': data.length });
  res.end(req.method === 'HEAD' ? undefined : data);
}

async function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return reply(req, res, 400, 'Bad request.\n'); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(DIST, rel);
  if (rel.includes('\0') || !file.startsWith(DIST + path.sep)) return reply(req, res, 403, 'Forbidden.\n'); // path traversal
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st || !st.isFile()) {
    const built = await fs.promises.stat(DIST).then((s) => s.isDirectory(), () => false);
    if (built) return reply(req, res, 404, 'Page introuvable.\n');
    return reply(req, res, 503, 'The site has not been built yet: run "npm run build", then reload this page.\n');
  }
  const ext = path.extname(file).slice(1).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const textual = TEXTUAL.test(type);
  const immutable = ext !== 'html' && rel.startsWith('/assets/') && isHashed(path.basename(file));
  const headers = {
    'Content-Type': type,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', // no-cache = revalidate (ETag)
    ETag: `W/"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`,
    'Last-Modified': st.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
    ...(textual && { Vary: 'Accept-Encoding' }),
  };
  if (req.headers['if-none-match'] === headers.ETag) return res.writeHead(304, headers).end();
  const accepted = String(req.headers['accept-encoding'] || '');
  const encoding = !textual || st.size > ZIP_MAX_FILE ? '' : /\bbr\b/.test(accepted) ? 'br' : /\bgzip\b/.test(accepted) ? 'gzip' : '';
  const body = encoding ? await compressed(file, st, encoding).catch(() => null) : null;
  if (body) headers['Content-Encoding'] = encoding;
  headers['Content-Length'] = body ? body.length : st.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') res.end();
  else if (body) res.end(body);
  else pipeline(fs.createReadStream(file), res, () => {});
}

// ------------------------------------------------------------------------------------------------- the API

// What the game keeps (leaderboards, visits…): one JSON file of keys and values, read once, rewritten whole
// (through a temporary file) when something changes.
const store = {
  data: null,
  writing: Promise.resolve(),
  async load() {
    if (!this.data) {
      try { this.data = JSON.parse(await fs.promises.readFile(SCORES_FILE, 'utf8')); } catch { this.data = {}; }
      if (!this.data || typeof this.data !== 'object' || Array.isArray(this.data)) this.data = {};
      // (the first version kept { sky: [...] })
      for (const [k, v] of Object.entries(this.data)) if (!k.includes(':') && Array.isArray(v)) { this.data[`board:${k}`] = v; delete this.data[k]; }
    }
    return this.data;
  },
  async get(key) { return (await this.load())[key]; },
  async put(key, value) { (await this.load())[key] = value; return this.save(); },
  async delete(key) { delete (await this.load())[key]; return this.save(); },
  save() {
    const text = JSON.stringify(this.data);
    this.writing = this.writing.then(async () => {
      await fs.promises.mkdir(path.dirname(SCORES_FILE), { recursive: true });
      await fs.promises.writeFile(`${SCORES_FILE}.tmp`, text);
      await fs.promises.rename(`${SCORES_FILE}.tmp`, SCORES_FILE);
    }).catch((err) => console.error('[store]', err.message));
    return this.writing;
  },
};
const limiter = new Limiter();
const LIMIT_DAY = LIMITS.npcDay;
const STRIPE = stripeConfig(process.env);
const api = {
  store, limiter, now: () => Date.now(), stripe: STRIPE,
  flags: { npc: !!NPC.apiKey, admin: !!ADMIN_KEY, shop: STRIPE.mode || 'off' },
  // the secret that signs the notes of the runs: given (SCORE_SECRET), or drawn once and kept with the rest
  async secret() {
    if (!this._secret) {
      this._secret = process.env.SCORE_SECRET || (await store.get('secret'));
      if (!this._secret) await store.put('secret', (this._secret = randomId(32)));
    }
    return this._secret;
  },
};

// The text of a small request body (null when it is too long).
function readBody(req, max = BODY_MAX) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    // (what comes after the limit is read and dropped, so that the answer can still be sent; far too much: hang up)
    req.on('data', (c) => { size += c.length; if (size > Math.max(max * 4, BODY_MAX * 64)) req.destroy(); else if (size <= max) chunks.push(c); });
    req.on('end', () => resolve(size > max ? null : Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

async function onApi(req, res, pathname, query) {
  const json = (status, body, headers) => reply(req, res, status, JSON.stringify(body), { 'Content-Type': MIME.json, ...headers });
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const client = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
  const reading = req.method === 'GET' || req.method === 'HEAD';
  // (Stripe is no browser: what it sends is told by its signature, not by where it comes from)
  if (!reading && pathname !== '/api/stripe/webhook' && !mayPost(req.headers.origin, host, ALLOWED_ORIGINS)) return json(403, { error: 'Forbidden.' });
  if (pathname === '/api/npc') {
    if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    if (!NPC.apiKey) return json(501, { reply: null, error: 'No model is configured for the characters.' });
    const talk = cleanTalk(parseBody(await readBody(req)));
    if (!talk) return json(400, { error: 'Not a conversation.' });
    if (!allowed(limiter, 'npc', client) || !limiter.allow('npc:day', ...LIMIT_DAY)) return json(429, { reply: null, error: 'Too many requests.' }, { 'Retry-After': '60' });
    return json(200, { reply: await npcReply(NPC, talk) });
  }
  const bearer = /^Bearer (.+)$/.exec(String(req.headers.authorization || ''))?.[1] || '';
  const max = bodyMax(pathname), raw = reading ? null : await readBody(req, max);
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || (req.socket.encrypted ? 'https' : 'http');
  const out = await route({
    method: req.method, path: pathname, query: new URLSearchParams(query), client,
    body: reading ? null : parseBody(raw, max), admin: sameSecret(bearer, ADMIN_KEY), bearer, geo: geoOf(req),
    raw, signature: String(req.headers['stripe-signature'] || ''), site: `${proto}://${host}`,
  }, api);
  if (out.bytes) return reply(req, res, out.status, out.bytes, out.headers);
  return json(out.status, out.body, out.headers);
}

async function onRequest(req, res) {
  const [pathname, query] = splitUrl(req.url);
  if (pathname.startsWith('/api/') && pathname !== '/api/presence') return onApi(req, res, pathname, query);
  if (req.method !== 'GET' && req.method !== 'HEAD') return reply(req, res, 405, 'Method not allowed.\n', { Allow: 'GET, HEAD' });
  if (pathname === '/healthz') return reply(req, res, 200, 'ok');
  if (pathname === '/api/presence') {
    // ?room=x: head count of one room (the only form the Cloudflare version offers); otherwise the whole server
    const room = new URLSearchParams(query).get('room');
    const body = room === null ? census() : { room: cleanRoom(room), players: rooms.get(cleanRoom(room))?.joined || 0 };
    return reply(req, res, 200, JSON.stringify(body), { 'Content-Type': MIME.json });
  }
  if (pathname === '/ws') return reply(req, res, 426, 'WebSocket endpoint.\n', { Upgrade: 'websocket' });
  return serveStatic(req, res, pathname);
}

// ------------------------------------------------------------------------------------------------- presence

const rooms = new Map(); // room id → Room
let nextId = 1;

// What a Room needs from this host (see ./protocol.js). Connections are `ws` sockets.
const io = {
  max: MAX_PLAYERS,
  // (in a crowd, each visitor is told in detail about the NEAR nearest within RANGE metres: see protocol.js)
  near: Math.floor(env('NEAR', NEAR, 1, 1000)), range: env('RANGE', RANGE, 10, 5000),
  tick: Math.round(1000 / TICK_HZ),
  now,
  id: () => nextId++,
  send(ws, text) {
    if (ws.readyState !== 1) return;
    if (ws.bufferedAmount > 1 << 20) ws.terminate(); // hopelessly slow reader
    else ws.send(text);
  },
  drop: (ws) => ws.terminate(), // flooding; the close event then removes the player
  // put out by the administrator: closed politely (the reason is delivered), then for good
  kick: (ws, code, reason) => { try { ws.close(code, reason); } catch { /* already closing */ } setTimeout(() => ws.terminate(), 2000).unref(); },
  busy: (ws) => ws.bufferedAmount > 1 << 16,
  // whose key: the owner's (ADMIN_KEY), or that of an administrator the owner or another has named
  admin: (key) => (sameSecret(key, ADMIN_KEY) ? { rank: 'owner', id: '' } : looksNamed(key) ? adminOf(store, '', key) : false),
  promote: (who) => nameAdmin(store, who, Date.now()),
  ban: (who) => { addBan(api, who).catch((err) => console.error('[ban]', err.message)); },
};

function census() {
  const counts = [...rooms.values()].map((room) => room.joined).filter(Boolean);
  return { rooms: counts.length, players: counts.reduce((sum, n) => sum + n, 0) };
}

function onConnection(ws, roomId, from) {
  ws.on('error', () => {}); // e.g. oversized frame: ws closes the socket itself (1009)
  if (from.banned) { ws.send('{"t":"kicked","ban":true}'); return ws.close(4003, 'banned'); }
  let room = rooms.get(roomId);
  if (!room) rooms.set(roomId, (room = new Room(io)));
  const p = room.add(ws, undefined, from);
  if (!p) { ws.send('{"t":"full"}'); return ws.close(1013, 'full'); }
  ws.on('pong', () => { p.alive = true; });
  ws.on('message', (data, isBinary) => {
    try { room.receive(ws, isBinary ? null : data.toString()); } catch (err) { console.error('[presence]', err); }
  });
  ws.on('close', () => {
    room.remove(ws);
    if (!room.size && rooms.get(roomId) === room) rooms.delete(roomId);
  });
}

// Sends every room the states that changed since the last tick.
function tick() {
  for (const room of rooms.values()) room.flush();
}

// ws-level ping: a socket that showed no sign of life since the previous round died silently.
function heartbeat() {
  for (const room of rooms.values()) for (const p of room.players.values()) {
    if (!p.alive) { p.conn.terminate(); continue; }
    p.alive = false;
    p.conn.ping();
  }
}

// ------------------------------------------------------------------------------------------------ bootstrap

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME, perMessageDeflate: false });
const server = http.createServer((req, res) => {
  onRequest(req, res).catch((err) => { console.error('[http]', err); if (!res.headersSent) res.writeHead(500); res.end(); });
});

server.on('upgrade', (req, socket, head) => {
  const [pathname, query] = splitUrl(req.url);
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (pathname === '/ws' && originAllowed(req.headers.origin, host, ALLOWED_ORIGINS)) {
    // who is knocking: the address, the browser, the name the browser gave itself (what a ban holds on to)
    const q = new URLSearchParams(query);
    const from = { ip: String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '', ua: String(req.headers['user-agent'] || ''), ...geoOf(req) };
    return banned(api, from.ip, q.get('dev') || '').catch(() => false).then((out) => {
      from.banned = out;
      wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, cleanRoom(q.get('room')), from));
    });
  }
  socket.on('error', () => {});
  socket.end(`HTTP/1.1 ${pathname === '/ws' ? '403 Forbidden' : '404 Not Found'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
});

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${PORT} is already in use (set PORT to another one).` : err);
  process.exit(1);
});

const timers = [setInterval(tick, 1000 / TICK_HZ), setInterval(heartbeat, HEARTBEAT_MS)];

function shutdown() {
  timers.forEach(clearInterval);
  for (const ws of wss.clients) ws.close(1001);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, HOST, () => {
  const { port } = server.address();
  console.log(`Magic Mill Fair — http://localhost:${port} (presence: ws://localhost:${port}/ws, ${TICK_HZ} Hz, up to ${MAX_PLAYERS} players per room)`);
});
