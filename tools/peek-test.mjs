// Checks of the form of a sponsor that fills itself from the sponsor's own site (server/peek.js), without a browser
// and without the web: "the web" is a handful of stand-in sites of this test, handed to the server in place of fetch
// (ctx.fetch, as for Stripe). What is checked: the three things found on a typical page — a name, a line, an icon —,
// on a page that only has a title, icons named by relative addresses, a site that sends elsewhere (three times, not
// four; never somewhere the server will not go), every address that is refused before anything is fetched, a page
// that is too big, a site that is too slow, markup in what a page says of itself, what goes with a request (nothing
// of anybody), what comes back (never the page), and how often one address may ask.
// usage: node tools/peek-test.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { check, done, ROOT } from './lib/check.mjs';
import { Limiter, LIMITS } from '../server/api.js';
import { route } from '../server/routes.js';
import { PEEK, siteUrl, fit, nameIn, readPage, pictureType, peek, peekRoute } from '../server/peek.js';

// ---- pictures, real ones: a PNG, the same inside a .ico, a JPEG, a WebP, a GIF, an SVG
const PNG = await sharp({ create: { width: 180, height: 180, channels: 4, background: '#c0392b' } }).png().toBuffer();
const SMALL = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#2b6cc0' } }).png().toBuffer();
const JPEG = await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#3b7a57' } }).jpeg().toBuffer();
const WEBP = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#f2c14e' } }).webp().toBuffer();
const GIF = await sharp({ create: { width: 16, height: 16, channels: 4, background: '#888888' } }).gif().toBuffer();
const ICO = Buffer.concat([Buffer.from([0, 0, 1, 0, 1, 0, 32, 32, 0, 0, 1, 0, 32, 0]), (() => { const b = Buffer.alloc(8); b.writeUInt32LE(SMALL.length, 0); b.writeUInt32LE(22, 4); return b; })(), SMALL]);
const SVG = Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<!-- a wheel -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#c0392b"/></svg>');
const b64 = (bytes) => Buffer.from(bytes).toString('base64');

// ---- the web: 'https://host/path' → what answers there. Everything asked of it is written down.
const sites = new Map(), asked = [];
const web = async (url, init = {}) => {
  asked.push({ url, init });
  const u = new URL(url), page = sites.get(`${u.origin}${u.pathname}`);
  return page ? page(u, init) : new Response('<title>Not found</title>nothing here', { status: 404, headers: { 'content-type': 'text/html' } });
};
const html = (text, type = 'text/html; charset=utf-8') => () => new Response(text, { headers: { 'content-type': type } });
const picture = (bytes, type) => () => new Response(bytes, { headers: { 'content-type': type } });
const sends = (to, status = 302) => () => new Response(null, { status, headers: { location: to } });
/** `total` bytes served a piece at a time, `top` first: how much was really taken, and whether the reader walked away, is counted. */
const stream = (top, total, type, tally) => () => {
  let sent = 0;
  const first = Buffer.from(top), piece = Buffer.alloc(16384, 0x20);
  return new Response(new ReadableStream({
    pull(c) { const chunk = sent === 0 && first.length ? first : piece; sent += chunk.length; tally.sent = sent; c.enqueue(new Uint8Array(chunk)); if (sent >= total) c.close(); },
    cancel() { tally.cancelled = true; },
  }, { highWaterMark: 0 }), { headers: { 'content-type': type } });
};
const fetchedOf = (host) => asked.filter((a) => new URL(a.url).hostname === host).map((a) => new URL(a.url).pathname);

// ---- the server, as far as this route needs it: something to keep things in (nothing must be), the limits, the web
const kept = new Map();
let writes = 0, address = 0;
const store = { get: async (k) => kept.get(k), put: async (k, v) => { writes++; kept.set(k, v); }, delete: async (k) => { writes++; kept.delete(k); }, list: async (p = '') => [...kept].filter(([k]) => k.startsWith(p)) };
const ctx = { store, limiter: new Limiter(), now: () => Date.now(), flags: {}, secret: async () => 'peek-test', fetch: web };
/** A sponsor presses the button (each from an address of their own, unless one is given: the limits have a check of their own). */
const press = (url, { from = `10.2.${Math.floor(address / 250)}.${(address++ % 250) + 1}`, ...more } = {}) => peekRoute({ method: 'POST', path: '/api/sponsor/peek', query: new URLSearchParams(), body: { url, ...more }, client: from }, ctx);

// ============================================================================================ a typical page
sites.set('https://acme-bikes.example/', html(`<!doctype html><html lang="en"><head><meta charset="utf-8">
  <title>Acme Bikes | Handmade bicycles since 1980</title>
  <meta name="description" content="Handmade bicycles, cargo bikes and trailers, built to order in our workshop since 1980.">
  <meta property="og:site_name" content="Acme Bikes">
  <meta property="og:title" content="Handmade bicycles since 1980">
  <meta property="og:description" content="Another description, for when the page is shared.">
  <meta property="og:image" content="https://cdn.acme-bikes.example/share.jpg">
  <link rel="stylesheet" href="/style.css">
  <link rel="shortcut icon" href="/favicon.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="mask-icon" href="/mask.svg" color="#000000">
  <script>document.write('<title>Not this one</title><meta name="description" content="nor this">');</script>
  <!-- <meta property="og:site_name" content="Nor this"> -->
  </head><body><h1>Welcome</h1><p>WHAT-THE-PAGE-SAYS-BELOW-ITS-TOP: prices, addresses, everything else.</p></body></html>`));
sites.set('https://acme-bikes.example/icon-192.png', picture(PNG, 'image/png'));
sites.set('https://acme-bikes.example/apple-touch-icon.png', picture(PNG, 'image/png'));
sites.set('https://acme-bikes.example/favicon-32.png', picture(SMALL, 'image/png'));
sites.set('https://acme-bikes.example/favicon.ico', picture(ICO, 'image/x-icon'));
sites.set('https://cdn.acme-bikes.example/share.jpg', picture(JPEG, 'image/jpeg'));
{
  const res = await press('https://acme-bikes.example/'), b = res.body;
  check('a typical page: the name the site gives itself, its description cut where a clause ends, and the largest icon it declares — each with a word for where it was found',
    res.status === 200 && b.ok === true && b.name === 'Acme Bikes' && b.from.name === 'og:site_name' && b.line === 'Handmade bicycles' && b.from.line === 'description'
    && b.icon?.type === 'image/png' && b.icon.data === b64(PNG) && b.from.icon === 'icon' && fetchedOf('acme-bikes.example').join() === '/,/icon-192.png' && b.url === 'https://acme-bikes.example/',
    { name: b.name, line: b.line, from: b.from, fetched: fetchedOf('acme-bikes.example') });
  const text = JSON.stringify(b);
  check('only the three things come back — never the page: an address, a name, a line, an icon, and where each came from; nothing is kept on the server',
    Object.keys(b).sort().join() === 'from,icon,line,name,ok,url' && Object.keys(b.from).sort().join() === 'icon,line,name' && Object.keys(b.icon).sort().join() === 'data,type'
    && !/WHAT-THE-PAGE|Welcome|stylesheet|Not this|Nor this|nor this/.test(text) && writes === 0, { keys: Object.keys(b), writes });
  const went = asked.filter((a) => /acme-bikes/.test(a.url));
  const plain = went.every(({ init }) => { const h = new Headers(init.headers); return init.method === 'GET' && init.redirect === 'manual' && init.signal instanceof AbortSignal && !init.body && !init.credentials && ![...h.keys()].some((k) => /cookie|referer|origin|authorization|from|forwarded/i.test(k)) && !/@|https?:|www\.|\.(com|io|org|net|fr)\b/i.test(h.get('user-agent') || '') && (h.get('user-agent') || '').length > 8; });
  check('nothing of anybody goes with a request: no cookie, no address of the game, no word of who asks — a plain User-Agent, and a redirection is never followed blindly', plain, { agent: new Headers(went[0].init.headers).get('user-agent'), headers: [...new Headers(went[0].init.headers).keys()] });
}

// =================================================================================== which name, which line
sites.set('https://chez-lulu.example/', html('<html><head><title>Chez Lulu – Boulangerie &amp; p&acirc;tisserie &#224; Lyon &#x2014; depuis 1962</title></head><body>Du pain.</body></html>'));
sites.set('https://chez-lulu.example/favicon.ico', picture(ICO, 'image/vnd.microsoft.icon'));
sites.set('https://bare.example/', html('<html><head><title>Bare &amp; Sons</title></head><body></body></html>'));
sites.set('https://www.nothing.example/', html('<html><body><p>No head, no title: a page that says nothing of itself.</p></body></html>'));
{
  const lulu = (await press('https://chez-lulu.example/')).body, bare = (await press('https://bare.example/')).body, www = (await press('https://www.nothing.example/')).body;
  check('a page with only a <title>: its name is the title without its tail, there is no line, and the icon is the one every site may have at its root (/favicon.ico) — told by its bytes',
    lulu.name === 'Chez Lulu' && lulu.from.name === 'title' && lulu.line === '' && lulu.from.line === '' && lulu.icon?.type === 'image/x-icon' && lulu.icon.data === b64(ICO) && lulu.from.icon === 'favicon.ico',
    { name: lulu.name, from: lulu.from, icon: lulu.icon?.type });
  check('…and without an icon anywhere the words still come: a name, no icon ("no usable icon found: upload yours" is then what the form says); a page that says nothing of itself is called by its address',
    bare.name === 'Bare & Sons' && bare.icon === null && bare.from.icon === '' && www.name === 'nothing.example' && www.from.name === 'address' && www.line === '' && www.icon === null,
    { bare: [bare.name, bare.icon], www: [www.name, www.from] });
  const names = [
    ['Acme Bikes | Handmade since 1980', 'acmebikes.example', 'Acme Bikes'], ['Home | Acme Bikes', 'acmebikes.example', 'Acme Bikes'], ['Home - The Shop', 'elsewhere.example', 'The Shop'],
    ['Bikes | The Bike Shop', 'thebikeshop.example', 'The Bike Shop'], ['Acme: handmade bicycles', 'x.example', 'Acme'], ['Jean–Pierre Bakery', 'x.example', 'Jean–Pierre Bakery'],
    ['Open at 9:00 – Acme', 'acme.example', 'Acme'], ['Handmade since 1980 · ACME', 'shop.acme.example', 'ACME'], ['Just a title', 'x.example', 'Just a title'], ['', 'x.example', ''],
  ].map(([title, host, want]) => [title, nameIn(title, host), want]);
  check('the name in a title: the part of it that is the name of the site as its address has it; otherwise the first part — the last when the first only says "Home"', names.every(([, got, want]) => got === want), names.filter(([, got, want]) => got !== want));
  const cuts = [
    ['Handmade bicycles, cargo bikes and trailers, built to order in our workshop since 1980.', 40, 'Handmade bicycles'], ['We bake. We deliver. Every day in Paris since 1990, rain or shine.', 40, 'We bake. We deliver'],
    ['Hungry? We deliver! Pizza baked in a wood oven since 1990', 40, 'Hungry? We deliver!'], ['Welcome to the wonderful world of Acme Bikes and Friends', 28, 'Welcome to the wonderful…'],
    ['Acme Bikes builds handmade bicycles in Lyon', 39, 'Acme Bikes builds handmade bicycles in…'], ['Supercalifragilisticexpialidociousness of the highest order', 20, 'Supercalifragilisti…'], ['Short and whole', 40, 'Short and whole'], ['', 40, ''],
  ].map(([text, max, want]) => [fit(text, max), want, max]);
  check('a line too long for the form is cut where a sentence ends, or a clause — failing that at a word, with "…" to show there was more; never longer than the room there is', cuts.every(([got, want, max]) => got === want && got.length <= max), cuts.filter(([got, want]) => got !== want));
}
sites.set('https://long.example/', html(`<html><head><title>${'The Remarkably Long Name Of A Shop That Never Ends '.repeat(3)}</title><meta name="description" content="${'word '.repeat(80)}"></head></html>`));
{
  const usual = (await press('https://long.example/')).body, village = (await press('https://long.example/', { name: 22, line: 34 })).body, odd = (await press('https://long.example/', { name: 'x', line: 9999 })).body, tiny = (await press('https://long.example/', { name: 2, line: -5 })).body;
  check('what is found is cut to the room the form has: 28 letters of name and 40 of line, as a panel keeps them — fewer when the form asks for fewer (a sky village: 22 and 34), never more',
    usual.name.length <= 28 && usual.name.length > 14 && usual.line.length <= 40 && usual.line.length > 20 && village.name.length <= 22 && village.line.length <= 34 && village.line.length > 20 && odd.name === usual.name && odd.line === usual.line && tiny.name === usual.name && tiny.line === usual.line
    && [PEEK.name, PEEK.line].join() === '28,40', { usual: [usual.name, usual.line.length], village: [village.name, village.line.length] });
}

// ================================================================================== markup, entities, alphabets
sites.set('https://markup.example/', html(`<html><head><title>&lt;b&gt;Bold&lt;/b&gt; &amp;amp; <i>Sons</i></title>
  <meta name="description" content="&lt;b&gt;Bikes&lt;/b&gt; &lt;script&gt;alert(1)&lt;/script&gt; <img src=x onerror=alert(1)> for
\t all &#0; ages, 3 &lt; 5 &#62; 4">
  <meta property="og:site_name" content='<a href="https://evil.example/">Evil &lt;Corp&gt;</a>'></head></html>`));
sites.set('https://latin.example/', () => new Response(Buffer.from('<html><head><title>Caf\xe9 des Amis</title><meta name="description" content="Cr\xeapes \xe0 toute heure"></head></html>', 'latin1'), { headers: { 'content-type': 'text/html; charset=ISO-8859-1' } }));
sites.set('https://meta-charset.example/', () => new Response(Buffer.from('<html><head><meta charset="windows-1252"><title>Th\xe9 &eacute;pic&eacute; &yuml;</title></head></html>', 'latin1'), { headers: { 'content-type': 'text/html' } }));
{
  const m = (await press('https://markup.example/')).body, l = (await press('https://latin.example/')).body, c = (await press('https://meta-charset.example/')).body;
  check('markup in what a page says of itself is taken out, as from a sponsor\'s own words: no tag, no < or >, one line — whether it was written as markup or spelled out with entities',
    m.name === 'Evil' && m.line === 'Bikes alert(1) for all ages, 3 5 4' && !/[<>\n\t\u0000]/.test(m.name + m.line), { name: m.name, line: m.line });
  check('accents come through: a page in another alphabet than UTF-8 (said by the site, or by the page), and letters spelled out with entities', l.name === 'Café des Amis' && l.line === 'Crêpes à toute heure' && c.name === 'Thé épicé ÿ', { latin: [l.name, l.line], meta: c.name });
}

// ================================================================================================= the icons
sites.set('https://rel.example/shop/index.html', html('<html><head><title>Rel</title><link rel="apple-touch-icon" href="img/touch.png"></head></html>'));
sites.set('https://rel.example/shop/img/touch.png', picture(PNG, 'image/png'));
sites.set('https://based.example/shop/', html('<html><head><base href="/static/v2/"><title>Based</title><link rel="icon" type="image/png" href="../img/icon.png"></head></html>'));
sites.set('https://based.example/static/img/icon.png', picture(SMALL, 'image/png'));
sites.set('https://cdn.example/', html('<html><head><title>Cdn</title><link rel=icon type=image/svg+xml href=//static.cdn.example/logo.svg?v=3></head></html>'));
sites.set('https://static.cdn.example/logo.svg', picture(SVG, 'image/svg+xml'));
{
  const rel = (await press('https://rel.example/shop/index.html')).body, based = (await press('https://based.example/shop/')).body, cdn = (await press('https://cdn.example/')).body;
  check('icons named by relative addresses are found where a browser would find them: beside the page, from its <base>, on another host of the site (//…) — an SVG is relayed as one',
    rel.icon?.data === b64(PNG) && rel.from.icon === 'apple-touch-icon' && fetchedOf('rel.example').join() === '/shop/index.html,/shop/img/touch.png'
    && based.icon?.data === b64(SMALL) && fetchedOf('based.example').join() === '/shop/,/static/img/icon.png' && cdn.icon?.type === 'image/svg+xml' && cdn.icon.data === b64(SVG) && cdn.from.icon === 'icon',
    { rel: fetchedOf('rel.example'), based: fetchedOf('based.example'), cdn: [cdn.icon?.type, fetchedOf('static.cdn.example')] });
}
{
  const at = new URL('https://order.example/');
  const order = (head) => readPage(`<html><head>${head}</head></html>`, at).icons.map((i) => `${i.from}:${i.url ? i.url.pathname : 'inline'}`).join(' ');
  const all = order('<meta property="og:image" content="/share.jpg"><link rel="shortcut icon" href="/fav.ico"><link rel="icon" href="/i16.png" sizes="16x16"><link rel="icon" href="/logo.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/touch.png"><link rel="icon" href="/i512.png" sizes="192x192 512x512"><link rel="apple-touch-icon-precomposed" sizes="57x57" href="/t57.png"><link rel="mask-icon" href="/mask.svg"><link rel="icon" href="http://order.example/plain.png"><link rel="icon" href="https://127.0.0.1/local.png">');
  const tie = order('<link rel="icon" sizes="180x180" href="/i180.png"><link rel="apple-touch-icon" sizes="180x180" href="/t180.png">');
  const inline = readPage(`<html><head><link rel="icon" href="data:image/png;base64,${b64(SMALL)}"></head></html>`, at).icons[0];
  check('which icon is the best: the largest declared of the apple-touch-icons and the PNG or SVG icons (an apple-touch-icon that says nothing is 180 pixels, an SVG counts for more than the small ones only); then the picture shown when the page is shared; then its other icons; /favicon.ico last — never a mask-icon, never one at an address the server will not go to',
    all === 'icon:/i512.png apple-touch-icon:/touch.png icon:/logo.svg apple-touch-icon:/t57.png icon:/i16.png og:image:/share.jpg icon:/fav.ico favicon.ico:/favicon.ico' && tie.startsWith('apple-touch-icon:/t180.png icon:/i180.png')
    && inline.from === 'icon' && Buffer.from(inline.bytes).equals(SMALL), { all, tie });
}
// (told by its bytes, not by what the site says; a page served for an icon is not one; a heavy one is left where it is)
const heavy = {};
sites.set('https://picky.example/', html('<html><head><title>Picky</title><link rel="apple-touch-icon" href="/heavy.png"><link rel="icon" type="image/png" sizes="64x64" href="/not-a-picture.png"><link rel="icon" type="image/png" sizes="48x48" href="/gone.png"><meta property="og:image" content="/share.webp"></head></html>'));
sites.set('https://picky.example/heavy.png', stream(PNG, 3_000_000, 'image/png', heavy));
sites.set('https://picky.example/not-a-picture.png', html('<html><title>Oops</title>We could not find that page.</html>', 'image/png'));
sites.set('https://picky.example/share.webp', picture(WEBP, 'text/plain'));
sites.set('https://sorry.example/', html('<html><head><title>Sorry</title></head></html>'));
sites.set('https://sorry.example/favicon.ico', html('<html><title>Sorry</title>This is the page of our errors, served for everything.</html>'));
sites.set('https://many.example/', html(`<html><head><title>Many</title>${[1, 2, 3, 4, 5, 6, 7].map((n) => `<link rel="icon" type="image/png" sizes="${99 - n}x${99 - n}" href="/gone-${n}.png">`).join('')}</head></html>`));
sites.set('https://inline.example/', html(`<html><head><title>Inline</title><link rel="icon" href="data:image/svg+xml,${encodeURIComponent(SVG.toString())}"></head></html>`));
{
  const picky = (await press('https://picky.example/')).body, sorry = (await press('https://sorry.example/')).body, many = (await press('https://many.example/')).body, inline = (await press('https://inline.example/')).body;
  check('an icon is what its first bytes say it is, never what the site says: a heavy one (over 600 KB) is left where it is — the rest of it is not read —, a page served in place of a picture is not a picture, a missing one is passed over; the next is taken',
    picky.icon?.type === 'image/webp' && picky.icon.data === b64(WEBP) && picky.from.icon === 'og:image' && fetchedOf('picky.example').join() === '/,/heavy.png,/not-a-picture.png,/gone.png,/share.webp' && heavy.cancelled === true && heavy.sent <= PEEK.icon + 3 * 16384
    && sorry.name === 'Sorry' && sorry.icon === null && sorry.from.icon === '', { picky: [picky.icon?.type, picky.from.icon, fetchedOf('picky.example')], heavy, sorry: sorry.icon });
  check('four icons are tried at the most; one written into the page itself (data:…) is read without asking anything more of the site',
    many.icon === null && fetchedOf('many.example').length === 1 + PEEK.tries && inline.icon?.type === 'image/svg+xml' && fetchedOf('inline.example').length === 1, { many: fetchedOf('many.example'), inline: inline.icon?.type });
  const kinds = [[PNG, 'image/png'], [JPEG, 'image/jpeg'], [WEBP, 'image/webp'], [GIF, 'image/gif'], [ICO, 'image/x-icon'], [SVG, 'image/svg+xml'], [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>      '), 'image/svg+xml'],
    [Buffer.from('<!doctype html><html><body><svg></svg></body></html>'), ''], [Buffer.from('GIF8'), ''], [Buffer.alloc(64), ''], [Buffer.from('#!/bin/sh\necho not a picture at all\n'), ''], [Buffer.from('{"error":"no such file, sorry"}'), '']].map(([b, want]) => [pictureType(new Uint8Array(b)), want]);
  check('the kinds of picture that are relayed: PNG, JPEG, WebP, GIF, .ico and SVG, each told by how it begins — a page, a script, a few zeroes are none', kinds.every(([got, want]) => got === want), kinds);
}

// ============================================================================================= a site that sends elsewhere
sites.set('https://old.example/', sends('https://www.old.example/', 301));
sites.set('https://www.old.example/', sends('/en', 302));
sites.set('https://www.old.example/en', sends('https://new.example/home/', 307));
sites.set('https://new.example/home/', html('<html><head><title>The New Place</title><link rel="apple-touch-icon" href="touch.png"></head></html>'));
sites.set('https://new.example/home/touch.png', sends('https://img.new.example/touch.png', 302));
sites.set('https://img.new.example/touch.png', picture(PNG, 'image/png'));
sites.set('https://four.example/', sends('https://old.example/'));
for (const [host, to] of [['down', 'http://new.example/home/'], ['number', 'https://127.0.0.1/'], ['six', 'https://[::1]/admin'], ['inside', 'https://printer.local/'], ['itself', 'https://localhost/'], ['port', 'https://new.example:8443/'], ['metadata', 'https://169.254.169.254/latest/meta-data/'], ['file', 'file:///etc/passwd'], ['name', 'https://admin:secret@new.example/home/']]) sites.set(`https://${host}.example/`, sends(to));
sites.set('https://nowhere.example/', () => new Response(null, { status: 302 }));
sites.set('https://trap.example/', html('<html><head><title>Trap</title><link rel="apple-touch-icon" href="/touch.png"><link rel="icon" type="image/png" href="/ok.png"></head></html>'));
sites.set('https://trap.example/touch.png', sends('https://10.0.0.7/secret.png'));
sites.set('https://trap.example/ok.png', picture(SMALL, 'image/png'));
{
  const before = asked.length, moved = await press('https://old.example/'), went = asked.slice(before).map((a) => a.url);
  check('a site that sends elsewhere is followed — three times: the page is read where it is in the end, and its icon found from there (an icon may send elsewhere too)',
    moved.status === 200 && moved.body.name === 'The New Place' && moved.body.icon?.data === b64(PNG) && moved.body.url === 'https://old.example/'
    && went.join(' ') === 'https://old.example/ https://www.old.example/ https://www.old.example/en https://new.example/home/ https://new.example/home/touch.png https://img.new.example/touch.png', went);
  const four = await press('https://four.example/'), none = await press('https://nowhere.example/');
  check('…and not four times: the fair gives up, and says so; a redirection that names no address is no page', four.status === 502 && /door to door/.test(four.body.error) && !four.body.name && fetchedOf('new.example').filter((p) => p === '/home/').length === 1 && none.status === 502, { four: four.body, none: none.body });
  const mark = asked.length, bad = [];
  for (const host of ['down', 'number', 'six', 'inside', 'itself', 'port', 'metadata', 'file', 'name']) bad.push([host, await press(`https://${host}.example/`)]);
  const reached = asked.slice(mark).map((a) => a.url).filter((u) => !/^https:\/\/(down|number|six|inside|itself|port|metadata|file|name)\.example\/$/.test(u));
  check('each address a site sends to is checked like the first, before anything goes there: plain http, a number in place of a name, a machine of the house, another port, a name and a password — none is ever asked for anything',
    bad.every(([, r]) => r.status === 502 && /will not follow/.test(r.body.error) && !r.body.name) && reached.length === 0, { said: bad.filter(([, r]) => r.status !== 502).map(([h, r]) => [h, r.status]), reached });
  const trap = (await press('https://trap.example/')).body;
  check('an icon that sends somewhere the server will not go is passed over — nothing goes there —, and the next one is taken', trap.icon?.data === b64(SMALL) && trap.from.icon === 'icon' && !asked.some((a) => /10\.0\.0\.7/.test(a.url)), { icon: trap.from.icon });
}

// ==================================================================================== the addresses that are refused
{
  const REFUSED = {
    'plain http': ['http://acme-bikes.example/', 'HTTP://ACME-BIKES.EXAMPLE'],
    'not the web at all': ['ftp://acme-bikes.example/', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,<title>x</title>', 'acme-bikes.example', '', '   ', 'https://', 'not an address'],
    'a number in place of a name (IPv4, however it is written)': ['https://127.0.0.1/', 'https://10.0.0.1/', 'https://192.168.1.1/admin', 'https://169.254.169.254/latest/meta-data/', 'https://8.8.8.8/', 'https://2130706433/', 'https://0x7f000001/', 'https://0x7f.1/', 'https://017700000001/', 'https://127.1/', 'https://127.0.0.1./', 'https://①②⑦.⓪.⓪.①/'],
    'a number in place of a name (IPv6)': ['https://[::1]/', 'https://[::ffff:127.0.0.1]/', 'https://[fe80::1]/', 'https://[2001:db8::1]/', 'https://[fd00::1]:443/'],
    'localhost': ['https://localhost/', 'https://LOCALHOST/', 'https://localhost./', 'https://app.localhost/', 'https://localhost:443/'],
    'a name without a dot': ['https://intranet/', 'https://router/login', 'https://nas./'],
    '.local, .internal, .test and the like': ['https://printer.local/', 'https://db.internal/', 'https://staging.test/', 'https://api.corp.internal/', 'https://nas.home/', 'https://box.lan/', 'https://x.intranet/', 'https://PRINTER.LOCAL./', 'https://1.0.0.127.in-addr.arpa/'],
    'a name or a password in the address': ['https://admin:secret@acme-bikes.example/', 'https://admin@acme-bikes.example/', 'https://acme-bikes.example@evil.example/'],
    'another port than 443': ['https://acme-bikes.example:8443/', 'https://acme-bikes.example:80/', 'https://acme-bikes.example:22/', 'https://acme-bikes.example:3000/api'],
  };
  const before = asked.length, wrong = [];
  for (const [why, list] of Object.entries(REFUSED)) for (const url of list) { const r = await press(url); if (r.status !== 400 || !/https:\/\//.test(r.body.error) || r.body.name !== undefined || siteUrl(url) !== null) wrong.push([why, url, r.status]); }
  const others = [await press(undefined), await press(42), await press({ href: 'https://acme-bikes.example/' }), await press(['https://acme-bikes.example/']), await press(`https://acme-bikes.example/${'a'.repeat(3000)}`)];
  check(`an address the server will not go to is refused before anything is fetched (${Object.values(REFUSED).flat().length} of them): ${Object.keys(REFUSED).join('; ')} — and what is not an address at all`,
    wrong.length === 0 && others.every((r) => r.status === 400) && asked.length === before, { wrong, others: others.map((r) => r.status), fetched: asked.length - before });
  const fine = ['https://acme-bikes.example/', 'https://www.acme-bikes.example:443/shop?x=1#top', 'https://acme-bikes.example.', ' https://Shop.Acme-Bikes.Example/a ', 'https://xn--caf-dma.example/', 'https://café.example/', 'https://1.1.1.1.nip.example/'].map((u) => [u, siteUrl(u)?.href || null]);
  check('…and a public site is not: https, its usual port said or not, any path, any name with a dot in it', fine.every(([, href]) => /^https:\/\/[a-z0-9.-]+\//.test(href || '')), fine);
}

// ================================================================================ a page too big, a site too slow
const big = {}, late = {}, buried = {};
sites.set('https://big.example/', stream('<html><head><title>Big And Proud</title><meta name="description" content="A page of three million letters"></head><body>', 3_000_000, 'text/html', big));
sites.set('https://buried.example/', (u, init) => { const top = `<html><head>${' '.repeat(PEEK.page + 50_000)}<title>Too Far Down</title></head>`; return stream(top, top.length + 200_000, 'text/html', buried)(u, init); });
sites.set('https://pdf.example/', picture(Buffer.from('%PDF-1.7 a catalogue'), 'application/pdf'));
sites.set('https://picture.example/', picture(PNG, 'image/png'));
sites.set('https://broken.example/', () => new Response('<title>Oops</title>', { status: 500, headers: { 'content-type': 'text/html' } }));
sites.set('https://denied.example/', () => new Response('<title>Forbidden</title>', { status: 403, headers: { 'content-type': 'text/html' } }));
sites.set('https://dead.example/', () => { throw new TypeError('fetch failed'); });
// (never answers — and lets go when told to; answers, then says nothing more; never answers, and does not listen either)
sites.set('https://slow.example/', (u, init) => new Promise((_, no) => { late.waiting = true; init.signal.addEventListener('abort', () => { late.letGo = true; no(new DOMException('This operation was aborted', 'AbortError')); }); }));
sites.set('https://stalls.example/', () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('<html><head><title>Half A')); } }), { headers: { 'content-type': 'text/html' } }));
sites.set('https://deaf.example/', () => new Promise(() => {}));
sites.set('https://slow-icon.example/', html('<html><head><title>Slow Icon</title><meta name="description" content="The words are quick"><link rel="apple-touch-icon" href="/touch.png"></head></html>'));
sites.set('https://slow-icon.example/touch.png', sites.get('https://deaf.example/'));
sites.set('https://slow-icon.example/favicon.ico', sites.get('https://deaf.example/'));
{
  const b = await press('https://big.example/'), far = await press('https://buried.example/');
  check('a page that is too big: its first 400 KB are read and the rest is left — what a page says of itself is at its top; what is further down is not found',
    b.body.name === 'Big And Proud' && b.body.line === 'A page of three million letters' && big.cancelled === true && big.sent <= PEEK.page + 3 * 16384 && PEEK.page === 400_000
    && far.status === 200 && far.body.name === 'buried.example' && far.body.from.name === 'address' && buried.sent <= PEEK.page + 60_000 + 3 * 16384, { big, buried, far: far.body.name });
  const answers = [await press('https://pdf.example/'), await press('https://picture.example/'), await press('https://broken.example/'), await press('https://denied.example/'), await press('https://dead.example/'), await press('https://unknown.example/')];
  check('what is not a page — a PDF, a picture —, a site that answers with an error, one that cannot be reached: said plainly, and the form is filled in by hand',
    answers.every((r) => r.status === 502 && /by hand/.test(r.body.error) && r.body.name === undefined) && /no page to read/.test(answers[0].body.error) && /did not answer/.test(answers[4].body.error), answers.map((r) => r.body.error));
  const t0 = Date.now(), slow = await press('https://slow.example/'), took = Date.now() - t0;
  check('a site that is too slow: six seconds, and the fair stops waiting — the request is let go of, and the sponsor is told', slow.status === 504 && /too long/.test(slow.body.error) && took >= 5900 && took < 7500 && late.letGo === true && PEEK.timeout === 6000, { took, late, said: slow.body.error });
  const quick = async (url) => { const t = Date.now(); try { return { got: await peek(url, { fetcher: web, timeout: 300 }), took: Date.now() - t }; } catch (err) { return { why: err.why, took: Date.now() - t }; } };
  const stalls = await quick('https://stalls.example/'), deaf = await quick('https://deaf.example/'), icon = await quick('https://slow-icon.example/');
  check('…whether it never answers, answers and then says nothing more, or does not even listen when it is let go of; an icon that is too slow costs the icon, not the words',
    stalls.why === 'slow' && stalls.took < 900 && deaf.why === 'slow' && deaf.took < 900 && icon.got?.name === 'Slow Icon' && icon.got.line === 'The words are quick' && icon.got.icon === null && icon.took < 1200, { stalls, deaf, icon: { ...icon, got: icon.got && [icon.got.name, icon.got.icon] } });
}

// ============================================================================================== how often, and the way in
{
  const from = '203.0.113.9', said = [];
  for (let i = 0; i < LIMITS.peek[0][0] + 2; i++) said.push((await press('https://bare.example/', { from })).status);
  const other = (await press('https://bare.example/', { from: '203.0.113.10' })).status;
  check(`one address may ask ${LIMITS.peek[0][0]} times a minute (${LIMITS.peek[1][0]} an hour): after that it is told to wait, and nothing is fetched for it — another address is not held up`,
    said.slice(0, LIMITS.peek[0][0]).every((s) => s === 200) && said.slice(LIMITS.peek[0][0]).every((s) => s === 429) && other === 200 && LIMITS.peek[0][0] <= 12 && LIMITS.peek[1][0] <= 60, said);
  // (everybody together: a day's ceiling, on a counter of its own — tried here on a server that has just started)
  const fresh = { ...ctx, limiter: new Limiter() }, t = Date.now(), day = [];
  for (let i = 0; i < LIMITS.peekDay[0] + 3; i++) day.push((await peekRoute({ method: 'POST', path: '/api/sponsor/peek', query: new URLSearchParams(), body: { url: 'https://localhost/' }, client: `198.51.${Math.floor(i / 250)}.${i % 250}` }, fresh)).status);
  const tomorrow = (await peekRoute({ method: 'POST', path: '/api/sponsor/peek', query: new URLSearchParams(), body: { url: 'https://localhost/' }, client: '198.51.100.1' }, { ...fresh, now: () => t + 25 * 3600_000 })).status;
  check(`…and everybody together ${LIMITS.peekDay[0]} times a day: a ceiling on what strangers can send the server to fetch — lifted the next day`,
    day.slice(0, LIMITS.peekDay[0]).every((s) => s === 400) && day.slice(LIMITS.peekDay[0]).every((s) => s === 429) && tomorrow === 400 && LIMITS.peekDay[1] === 24 * 3600_000, { first: day[0], last: day.slice(-4), tomorrow });
  // the way in: the routes of the game (routes.js), as both hosts call them
  const through = (method, body) => route({ method, path: '/api/sponsor/peek', query: new URLSearchParams(), body, client: '203.0.113.77' }, ctx);
  const posted = await through('POST', { url: 'https://chez-lulu.example/' }), got = await through('GET', null), other2 = await peekRoute({ method: 'POST', path: '/api/sponsor', query: new URLSearchParams(), body: {}, client: 'x' }, ctx);
  check('the game reaches it through its routes (POST /api/sponsor/peek): asked any other way it says so; it answers no other path — /api/sponsor is still the form being saved',
    posted.status === 200 && posted.body.name === 'Chez Lulu' && got.status === 405 && got.headers.Allow === 'POST' && other2 === null && writes === 0, { posted: posted.status, got: got.status, writes });
}

// ---- …and over HTTP, on the Node server as it runs (only addresses it refuses: this one has the real web behind it)
{
  const PORT = 8900 + Math.floor(Math.random() * 60), SITE = `http://127.0.0.1:${PORT}`, file = path.join(os.tmpdir(), `mmf-peek-test-${process.pid}.json`);
  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true }); // (the server serves the built site: a folder is enough for the API)
  const server = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', SCORES_FILE: file, ADMIN_KEY: '', STRIPE_SECRET_KEY: '', ANTHROPIC_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  server.stderr.on('data', (d) => { log += d; });
  try {
    for (let i = 0; i < 200; i++) { try { if ((await fetch(`${SITE}/healthz`)).ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }
    const call = async (body, origin = SITE) => { const res = await fetch(`${SITE}/api/sponsor/peek`, { method: 'POST', headers: { 'content-type': 'application/json', origin, 'x-forwarded-for': '10.9.0.1' }, body: JSON.stringify(body) }); return { status: res.status, body: await res.json().catch(() => null) }; };
    const local = await call({ url: 'https://localhost/' }), number = await call({ url: 'https://127.0.0.1/' }), plain = await call({ url: `http://127.0.0.1:${PORT}/` }), empty = await call({}), foreign = await call({ url: 'https://localhost/' }, 'https://another-site.example');
    const read = await fetch(`${SITE}/api/sponsor/peek`);
    check('the Node server answers it too: an address it will not go to is refused (itself included), a page of another site cannot ask in a visitor\'s name, and it is asked with POST',
      local.status === 400 && number.status === 400 && plain.status === 400 && empty.status === 400 && /https:\/\//.test(local.body?.error || '') && foreign.status === 403 && read.status === 405 && !/peek|TypeError|Unhandled/.test(log),
      { local, number: number.status, plain: plain.status, empty: empty.status, foreign: foreign.status, read: read.status, log: log.slice(0, 200) });
  } finally { server.kill(); fs.rmSync(file, { force: true }); }
}

done();
