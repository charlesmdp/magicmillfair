// Dev tool: a whole day at the door of the fair, played with the real rules (server/rooms.js). Visitors arrive
// (few at night, many in the evening), stay a while, leave; some come back to their room after a refresh, some
// follow a friend's link, and those of a room gone quiet are offered another — six in ten accept, and three in
// ten of those who stayed each time it is offered again, five minutes apart. The rooms say how
// many they hold a few seconds late, as the real ones do. Writes, for each scenario, a picture of the size of
// every room through the day (tools/preview/rooms-<scenario>.svg and .png) and prints what matters: how many
// rooms, the largest, and how much of everybody's time was spent in a room too empty to feel alive — next to
// what the old door did (fill a room, then the next).
// usage: node tools/rooms-sim.mjs [--peak=300] [--seed=1] [--rules=open:50,start:20,low:8]      (npm run sim:rooms)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { ROOM_RULES, cleanRules, newDirectory, noteRoom, tidy, assign, commonIndex, roomLabel } from '../server/rooms.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools/preview');
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const RULES = cleanRules(opt.rules ? Object.fromEntries(String(opt.rules).split(',').map((kv) => kv.split(':'))) : {});
const REPORT_S = 5; // a room says how many it holds this many seconds late, at the most

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const expo = (rnd, mean) => -Math.log(1 - rnd()) * mean;

/** How busy the fair is at hour h (0 to 24), from 0 to 1: asleep at five in the morning, full in the evening. */
const tide = (h) => 0.06 + 0.94 * Math.max(0, Math.sin(((h - 7) / 17) * Math.PI)) ** 1.6 * (h >= 7 ? 1 : 0);

/**
 * One day. `door(dir, ask, now, rnd)` → the room a newcomer is sent to. Returns the size of every room at each
 * minute and the figures of the day.
 */
function day({ peak, seed, door, rules, old = false }) {
  const rnd = rng(seed), dir = newDirectory(), rooms = new Map(); // name → Set of visitors (the truth; the directory hears of it late)
  const visitors = [], series = [], names = [];
  const STAY = 14 * 60; // an average visit, in seconds
  const rate = (t) => (peak * tide(t / 3600)) / STAY; // arrivals a second for `peak` visitors at the height of the evening
  const figures = { arrivals: 0, turned: 0, moved: 0, offered: 0, lonely: 0, thin: 0, time: 0, largest: 0, most: 0, peak: 0, friends: 0, friendsFull: 0, back: 0, backLost: 0 };
  const enter = (v, room, now) => { if (!rooms.has(room)) { rooms.set(room, new Set()); if (!names.includes(room)) names.push(room); } rooms.get(room).add(v); v.room = room; v.at = now; };
  const leave = (v) => { const set = rooms.get(v.room); set?.delete(v); if (set && !set.size) rooms.delete(v.room); v.room = null; };
  const arrive = (v, ask, now) => {
    for (let tries = 0; tries < 6; tries++) {
      const a = door(dir, ask, now, rnd);
      if ((rooms.get(a.room)?.size || 0) < rules.max || ask.owner) { enter(v, a.room, now); return a; }
      figures.turned++; (ask.not ||= []).push(a.room); // (full at the door: asked again, that room apart)
    }
    return null;
  };
  for (let t = 0; t < 86400; t++) {
    const now = t * 1000;
    // arrivals
    // (so many a second on average: each whole one arrives, the rest is a chance)
    for (let due = rate(t); due > 0; due -= 1) {
      if (rnd() >= Math.min(1, due)) continue;
      const v = { id: visitors.length, until: t + Math.min(4 * 3600, rnd() < 0.4 ? expo(rnd, 3 * 60) : rnd() < 0.85 ? expo(rnd, 16 * 60) : expo(rnd, 55 * 60)), refresh: rnd() < 0.12 ? t + expo(rnd, 6 * 60) : Infinity, room: null };
      visitors.push(v); figures.arrivals++;
      const ask = {};
      // (one in fifteen follows a friend's link: the room of somebody who is there)
      if (!old && rnd() < 1 / 15 && rooms.size) { const all = [...rooms.keys()]; ask.want = all[Math.floor(rnd() * all.length)]; figures.friends++; }
      const a = arrive(v, ask, now);
      if (a?.full) figures.friendsFull++;
    }
    // departures, refreshes
    for (const v of visitors) {
      if (!v.room) continue;
      if (t >= v.until) { leave(v); continue; }
      if (t >= v.refresh) { v.refresh = Infinity; const was = v.room; leave(v); figures.back++; const a = arrive(v, old ? {} : { back: was }, now); if (a && a.room !== was) figures.backLost++; }
    }
    // the rooms say how many they hold (late), and the door puts them in order: a room gone quiet offers another
    if (t % REPORT_S === 0) {
      for (const name of new Set([...Object.keys(dir.rooms), ...rooms.keys()])) noteRoom(dir, name, rooms.get(name)?.size || 0, 0, now, rules);
      if (!old) for (const q of tidy(dir, rules, now)) {
        // (six in ten accept the first time; of those who stayed, three in ten each time it is offered again)
        for (const v of [...(rooms.get(q.name) || [])]) { figures.offered++; if (rnd() < (q.again ? 0.3 : 0.6)) { v.moveAt = t + 5 + Math.floor(rnd() * 40); v.moveTo = q.to; } }
      }
    }
    for (const v of visitors) if (v.room && v.moveAt && t >= v.moveAt) { const to = v.moveTo; v.moveAt = 0; if ((rooms.get(to)?.size || 0) < rules.max && to !== v.room) { leave(v); enter(v, to, now); figures.moved++; } }
    // the figures: how everybody's time was spent
    let here = 0;
    for (const set of rooms.values()) { here += set.size; figures.largest = Math.max(figures.largest, set.size); if (set.size < rules.low) figures.lonely += set.size; if (set.size < rules.start) figures.thin += set.size; }
    figures.time += here; figures.peak = Math.max(figures.peak, here); figures.most = Math.max(figures.most, rooms.size);
    if (t % 60 === 0) series.push(Object.fromEntries([...rooms].map(([name, set]) => [name, set.size])));
    // (the day's visitors who have left are forgotten: the loop stays short)
    if (t % 600 === 599) for (let i = visitors.length - 1; i >= 0; i--) if (!visitors[i].room) visitors.splice(i, 1);
  }
  return { series, names, figures };
}

/** The old door: the first room until it is full (250), then the next. */
const oldDoor = (dir, ask, now) => { const not = new Set(ask.not || []); for (let k = 1; ; k++) { const name = k === 1 ? 'main' : `main-${k}`; if (!not.has(name) && (dir.rooms[name]?.n || 0) < 250) return { room: name, why: 'old' }; } };
const newDoor = (rules) => (dir, ask, now, rnd) => assign(dir, rules, ask, now, rnd);

const COLORS = ['#f2c14e', '#5ad1c8', '#ff8a6b', '#9b8cff', '#7dff5a', '#ff6bc1', '#6bb8ff', '#ffd27a', '#b0e86b', '#ff9d3c', '#c5b3ff', '#59e0a0'];
function chart(title, sub, { series, names }, rules) {
  const W = 1200, H = 520, L = 56, R = 18, T = 64, B = 44, top = Math.max(rules.open + 20, ...series.map((m) => Math.max(0, ...Object.values(m)))) * 1.08;
  const x = (i) => L + (i / (series.length - 1)) * (W - L - R), y = (v) => H - B - (v / top) * (H - T - B);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, sans-serif"><rect width="${W}" height="${H}" fill="#100c2c"/>`;
  svg += `<text x="${L}" y="28" fill="#ffe9a6" font-size="20" font-weight="700">${title}</text><text x="${L}" y="48" fill="#b3abd6" font-size="13">${sub}</text>`;
  for (let v = 0; v <= top; v += top > 160 ? 50 : top > 80 ? 20 : 10) svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#2f2870" stroke-width="1"/><text x="${L - 8}" y="${y(v) + 4}" fill="#b3abd6" font-size="11" text-anchor="end">${v}</text>`;
  for (let h = 0; h <= 24; h += 2) svg += `<text x="${x(h * 60 * ((series.length - 1) / 1440))}" y="${H - B + 18}" fill="#b3abd6" font-size="11" text-anchor="middle">${String(h).padStart(2, '0')}:00</text>`;
  for (const [v, label, color] of [[rules.open, `a new room opens at ${rules.open}`, '#f2c14e'], [rules.start, `starting: under ${rules.start}`, '#5ad1c8'], [rules.low, `quiet: ${rules.low} or fewer`, '#ff8a6b']]) {
    if (v > top) continue;
    svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="${color}" stroke-width="1" stroke-dasharray="5 5" opacity="0.7"/><text x="${W - R - 4}" y="${y(v) - 4}" fill="${color}" font-size="11" text-anchor="end" opacity="0.9">${label}</text>`;
  }
  names.forEach((name, k) => {
    let d = '', pen = false;
    series.forEach((m, i) => { const v = m[name]; if (v === undefined) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `; pen = true; });
    svg += `<path d="${d}" fill="none" stroke="${COLORS[k % COLORS.length]}" stroke-width="1.8" stroke-linejoin="round"/>`;
  });
  names.slice(0, 14).forEach((name, k) => { svg += `<rect x="${L + k * 78}" y="${H - 14}" width="10" height="10" rx="2" fill="${COLORS[k % COLORS.length]}"/><text x="${L + k * 78 + 14}" y="${H - 5}" fill="#f6f1e4" font-size="11">${commonIndex(name) ? roomLabel(name) : name}</text>`; });
  return `${svg}</svg>`;
}

const pct = (a, b) => `${((100 * a) / Math.max(1, b)).toFixed(1)} %`;
const scenarios = opt.peak ? [[`peak-${opt.peak}`, Number(opt.peak)]] : [['quiet-day', 35], ['busy-day', 300], ['launch-day', 1500]];
fs.mkdirSync(OUT, { recursive: true });
const sharp = (() => { try { return createRequire(import.meta.url)('sharp'); } catch { return null; } })();
console.log(`rules: at most ${RULES.max} a room · a new room opens at ${RULES.open} · starting under ${RULES.start} · quiet at ${RULES.low} or fewer\n`);
for (const [name, peak] of scenarios) {
  const seed = Number(opt.seed) || 1;
  const now = day({ peak, seed, door: newDoor(RULES), rules: RULES }), before = day({ peak, seed, door: oldDoor, rules: { ...RULES, max: 250 }, old: true });
  const f = now.figures, g = before.figures;
  console.log(`${name}: about ${peak} visitors at the height of the evening (${f.arrivals} arrivals in the day, ${f.peak} at once at the most)`);
  console.log(`  this door   up to ${f.most} room${f.most === 1 ? '' : 's'}, the largest ever ${f.largest}; time spent in a room of fewer than ${RULES.low}: ${pct(f.lonely, f.time)}, of fewer than ${RULES.start}: ${pct(f.thin, f.time)}`);
  console.log(`              back after a refresh: ${f.back}, of whom ${f.backLost} not in their room again; friends' links: ${f.friends}, of whom ${f.friendsFull} to a full room; offered another room: ${f.offered}, moved: ${f.moved}; turned away at a full door: ${f.turned}`);
  console.log(`  the old one up to ${g.most} room${g.most === 1 ? '' : 's'}, the largest ever ${g.largest}; time spent in a room of fewer than ${RULES.low}: ${pct(g.lonely, g.time)}, of fewer than ${RULES.start}: ${pct(g.thin, g.time)}\n`);
  for (const [tag, run, rules, title] of [['', now, RULES, 'The rooms through a day'], ['-old', before, { ...RULES, max: 250 }, 'The same day with the old door (fill a room, then the next)']]) {
    const svg = chart(`${title} — about ${peak} visitors at the height of the evening`, tag ? `one room until it holds 250, then another` : `a new room at ${rules.open} · a starting room takes everybody up to ${rules.start} · a room at ${rules.low} or fewer goes quiet · never more than ${rules.max}`, run, rules);
    fs.writeFileSync(path.join(OUT, `rooms-${name}${tag}.svg`), svg);
    if (sharp) await sharp(Buffer.from(svg)).png().toFile(path.join(OUT, `rooms-${name}${tag}.png`));
  }
}
console.log(`pictures: ${path.relative(ROOT, OUT)}/rooms-<scenario>.png (and -old.png for the old door)`);
