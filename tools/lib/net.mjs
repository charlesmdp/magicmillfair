// Helpers shared by the network tests (tools/net-test.mjs for the Node relay, tools/cf-test.mjs for Cloudflare).
import http from 'node:http';
import net from 'node:net';
import { WebSocket } from 'ws';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function until(cond, ms = 3000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(10)) if (cond()) return true;
  return !!cond();
}

export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

export function request(port, target, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: target, method, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

// Raw protocol client: records every message it receives.
export class Client {
  constructor(port, room, options = {}) {
    this.msgs = [];
    this.waiters = [];
    this.id = 0;
    this.code = null; // close code once closed
    const { dev, ...wsOptions } = options; // `dev`: the name the browser gave itself, as the game passes it
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws${room ? `?room=${encodeURIComponent(room)}` : '?'}${dev ? `&dev=${dev}` : ''}`, wsOptions);
    this.opened = new Promise((resolve) => {
      this.ws.once('open', () => resolve(true));
      this.ws.once('error', () => resolve(false));
      this.ws.once('unexpected-response', (req, res) => {
        this.status = res.statusCode;
        req.destroy();
        resolve(false);
      });
    });
    this.closed = new Promise((resolve) => this.ws.once('close', (code) => resolve((this.code = code))));
    this.ws.on('error', () => {});
    this.ws.on('message', (data) => {
      let m;
      try { m = JSON.parse(data.toString()); } catch { m = { t: '?', raw: data.toString() }; }
      this.msgs.push(m);
      this.waiters = this.waiters.filter((w) => !w(m));
    });
  }

  send(msg) {
    this.ws.send(typeof msg === 'string' || Buffer.isBuffer(msg) ? msg : JSON.stringify(msg));
  }

  // First message matching `pred` (already received or yet to come); null after `ms`.
  wait(pred, ms = 2000) {
    const hit = this.msgs.find(pred);
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), ms);
      this.waiters.push((m) => pred(m) && (clearTimeout(timer), resolve(m), true));
    });
  }

  async hello(name, color = 0, dev, session) {
    await this.opened;
    this.send({ t: 'hello', name, color, v: 2, ...(dev && { dev }), ...(session && { s: session }) });
    const welcome = await this.wait((m) => m.t === 'welcome');
    this.id = welcome ? welcome.id : 0;
    return welcome;
  }

  rows(id) {
    return this.msgs.filter((m) => m.t === 'u').flatMap((m) => m.s).filter((r) => id === undefined || r[0] === id);
  }

  close() {
    this.ws.close();
    return this.closed;
  }
}
