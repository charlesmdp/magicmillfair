// Magic Mill Fair — production server: static files from dist/ plus the multiplayer presence relay on /ws.
// The server has no authority over the game: every client shares its own avatar state and the server only
// batches those states to the other members of the room at a fixed tick.
//
// Protocol (JSON text frames)
//   client → server   {t:'hello',name,color,v:1}   {t:'s',p:[x,y,z,yaw],a,f}   {t:'e',e}   {t:'ping',c}
//   server → client   {t:'welcome',id,now,tick,peers:[{id,name,color,p,a,f}]}   {t:'join',id,name,color}
//                     {t:'leave',id}   {t:'u',now,s:[[id,x,y,z,yaw,a,f,age]]}   {t:'e',id,e}
//                     {t:'pong',c,now}   {t:'full'}
//   `now` is the server clock (ms since start). `age` (ms) tells how long before `now` a state was received:
//   clients rebuild smooth motion from `now - age`. A `join` for an id already known is a rename.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { WebSocketServer } from 'ws';

const env = (name, def, min, max) => {
  const n = Number(process.env[name]);
  return process.env[name] && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(process.env.DIST_DIR || path.join(ROOT, 'dist'));
const PORT = Math.floor(env('PORT', 8787, 0, 65535));
const HOST = process.env.HOST || '0.0.0.0';
const TICK_HZ = env('TICK_HZ', 12, 1, 60);
const MAX_PLAYERS = Math.floor(env('MAX_PLAYERS', 48, 1, 4096)); // per room
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().toLowerCase().replace(/\/+$/, '')).filter(Boolean);
const MAX_FRAME = 2048; // bytes
const RATE = 40, BURST = RATE * 2; // messages per second, averaged over 2 s (token bucket)
const HEARTBEAT_MS = 15000;

const now = () => Math.round(performance.now());
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, k) => Math.round(v * k) / k;
const int = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : 0);
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
  res.writeHead(status, { 'Content-Type': MIME.txt, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers, 'Content-Length': data.length });
  res.end(req.method === 'HEAD' ? undefined : data);
}

async function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return reply(req, res, 400, 'Requête invalide.\n'); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(DIST, rel);
  if (rel.includes('\0') || !file.startsWith(DIST + path.sep)) return reply(req, res, 403, 'Accès refusé.\n'); // path traversal
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st || !st.isFile()) {
    const built = await fs.promises.stat(DIST).then((s) => s.isDirectory(), () => false);
    if (built) return reply(req, res, 404, 'Page introuvable.\n');
    return reply(req, res, 503, 'Le site n’est pas encore construit : lancez « npm run build », puis rechargez la page.\n');
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

async function onRequest(req, res) {
  const [pathname] = splitUrl(req.url);
  if (req.method !== 'GET' && req.method !== 'HEAD') return reply(req, res, 405, 'Méthode non autorisée.\n', { Allow: 'GET, HEAD' });
  if (pathname === '/healthz') return reply(req, res, 200, 'ok');
  if (pathname === '/api/presence') return reply(req, res, 200, JSON.stringify(census()), { 'Content-Type': MIME.json });
  if (pathname === '/ws') return reply(req, res, 426, 'Point d’entrée WebSocket.\n', { Upgrade: 'websocket' });
  return serveStatic(req, res, pathname);
}

// ------------------------------------------------------------------------------------------------- presence

const rooms = new Map(); // room id → Map(player id → player)
let nextId = 1;

const cleanRoom = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48) || 'main';

// Display name: no control characters or angle brackets, single spaces, at most 16 characters.
function cleanName(name) {
  const s = typeof name === 'string' ? name.replace(/\s+/g, ' ').replace(/[\p{C}<>]/gu, '').replace(/ {2,}/g, ' ').trim() : '';
  return [...s].slice(0, 16).join('').trim() || 'Visiteur';
}

function census() {
  const counts = [...rooms.values()].map((room) => [...room.values()].filter((p) => p.joined).length).filter(Boolean);
  return { rooms: counts.length, players: counts.reduce((sum, n) => sum + n, 0) };
}

// Browsers always send Origin on a WebSocket handshake; other clients can forge it anyway, so none is fine.
function originAllowed(req) {
  const origin = String(req.headers.origin || '').toLowerCase().replace(/\/+$/, '');
  if (!origin) return true;
  if (ALLOWED_ORIGINS.length) return ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin);
  let url;
  try { url = new URL(origin); } catch { return false; }
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
  return url.host === host || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

function send(p, text) {
  if (p.ws.readyState !== 1) return;
  if (p.ws.bufferedAmount > 1 << 20) p.ws.terminate(); // hopelessly slow reader
  else p.ws.send(text);
}
function broadcast(room, text, except) {
  for (const p of room.values()) if (p.joined && p !== except) send(p, text);
}

function onConnection(ws, roomId) {
  ws.on('error', () => {}); // e.g. oversized frame: ws closes the socket itself (1009)
  let room = rooms.get(roomId);
  if (room && room.size >= MAX_PLAYERS) { ws.send('{"t":"full"}'); return ws.close(1013, 'full'); }
  if (!room) rooms.set(roomId, (room = new Map()));
  const p = {
    id: nextId++, ws, name: 'Visiteur', color: 0, joined: false, alive: true, tokens: BURST, stamp: now(),
    state: null, row: '', at: 0, dirty: false, rested: true, // last state, its serialised row, when it came, relay flags
  };
  room.set(p.id, p);
  ws.on('pong', () => { p.alive = true; });
  ws.on('message', (data, isBinary) => {
    try { onMessage(room, p, data, isBinary); } catch (err) { console.error('[presence]', err); }
  });
  ws.on('close', () => {
    room.delete(p.id);
    if (p.joined) broadcast(room, `{"t":"leave","id":${p.id}}`);
    if (!room.size && rooms.get(roomId) === room) rooms.delete(roomId);
  });
}

function onMessage(room, p, data, isBinary) {
  const t = now();
  p.alive = true;
  p.tokens = Math.min(BURST, p.tokens + ((t - p.stamp) * RATE) / 1000) - 1;
  p.stamp = t;
  if (p.tokens < 0) return p.ws.terminate(); // flooding
  if (isBinary) return;
  let m;
  try { m = JSON.parse(data.toString()); } catch { return; }
  if (!m || typeof m !== 'object') return;
  if (m.t === 'hello') onHello(room, p, m);
  else if (m.t === 'ping') send(p, `{"t":"pong","c":${Number.isFinite(m.c) ? m.c : 0},"now":${t}}`);
  else if (!p.joined) return;
  else if (m.t === 's') onState(p, m, t);
  else if (m.t === 'e' && Number.isInteger(m.e) && m.e >= 0 && m.e <= 31) broadcast(room, `{"t":"e","id":${p.id},"e":${m.e}}`, p);
}

function onHello(room, p, m) {
  const name = cleanName(m.name), color = int(m.color, 15);
  if (p.joined && name === p.name && color === p.color) return;
  p.name = name; p.color = color;
  if (!p.joined) {
    p.joined = true;
    const peers = [...room.values()].filter((o) => o.joined && o !== p)
      .map((o) => ({ id: o.id, name: o.name, color: o.color, ...(o.state && { p: o.state.slice(0, 4), a: o.state[4], f: o.state[5] }) }));
    send(p, JSON.stringify({ t: 'welcome', id: p.id, now: now(), tick: Math.round(1000 / TICK_HZ), peers }));
  }
  broadcast(room, JSON.stringify({ t: 'join', id: p.id, name, color }), p);
}

function onState(p, m, t) {
  const v = m.p;
  if (!Array.isArray(v) || v.length < 4 || !v.slice(0, 4).every(Number.isFinite)) return;
  const state = [
    round(clamp(v[0], -2000, 2000), 100), round(clamp(v[1], -100, 500), 100), round(clamp(v[2], -2000, 2000), 100),
    round(Math.atan2(Math.sin(v[3]), Math.cos(v[3])), 1000), int(m.a, 15), int(m.f, 255),
  ];
  const row = `[${p.id},${state.join(',')}`; // closed with its age when the tick sends it
  if (row !== p.row) { p.row = row; p.state = state; p.at = t; p.dirty = true; p.rested = false; }
  // First repeat after a relayed change: relay it once more, so that clients know the player has stopped.
  else if (!p.rested && !p.dirty) { p.rested = true; p.at = t; p.dirty = true; }
}

// Sends every room the states that changed since the last tick; nobody gets its own state back.
function tick() {
  const t = now();
  for (const room of rooms.values()) {
    const ids = [], rows = [];
    for (const p of room.values()) if (p.dirty) { p.dirty = false; ids.push(p.id); rows.push(`${p.row},${t - p.at}]`); }
    if (!rows.length) continue;
    const head = `{"t":"u","now":${t},"s":[`;
    const all = `${head}${rows.join(',')}]}`;
    for (const p of room.values()) {
      if (!p.joined || p.ws.bufferedAmount > 1 << 16) continue; // states are disposable: skip slow readers
      const own = ids.indexOf(p.id);
      if (own < 0) send(p, all);
      else if (rows.length > 1) send(p, `${head}${rows.filter((_, i) => i !== own).join(',')}]}`);
    }
  }
}

// ws-level ping: a socket that showed no sign of life since the previous round died silently.
function heartbeat() {
  for (const room of rooms.values()) for (const p of room.values()) {
    if (!p.alive) { p.ws.terminate(); continue; }
    p.alive = false;
    p.ws.ping();
  }
}

// ------------------------------------------------------------------------------------------------ bootstrap

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME, perMessageDeflate: false });
const server = http.createServer((req, res) => {
  onRequest(req, res).catch((err) => { console.error('[http]', err); if (!res.headersSent) res.writeHead(500); res.end(); });
});

server.on('upgrade', (req, socket, head) => {
  const [pathname, query] = splitUrl(req.url);
  if (pathname === '/ws' && originAllowed(req)) {
    return wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, cleanRoom(new URLSearchParams(query).get('room'))));
  }
  socket.on('error', () => {});
  socket.end(`HTTP/1.1 ${pathname === '/ws' ? '403 Forbidden' : '404 Not Found'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
});

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Le port ${PORT} est déjà utilisé (changez PORT).` : err);
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
  console.log(`Magic Mill Fair — http://localhost:${port} (présence : ws://localhost:${port}/ws, ${TICK_HZ} Hz, ${MAX_PLAYERS} joueurs max par salon)`);
});
