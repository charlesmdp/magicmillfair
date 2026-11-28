// Every way the fair's e-mails are built, as a list of cases: [kind, the arguments of its builder]. Used by
// tools/people-test.mjs to hold server/mail.js against what the messages said before their words could be changed
// (tools/lib/mail-before.mjs) — the cases the shop and the accounts really make, every switch of each builder in
// turn, and a few hundred drawn at random (always the same ones: the draw is seeded).
const SITES = ['https://fair.example', 'https://fair.example/', 'http://127.0.0.1:8787', '', 'not a site', 'https://someone@elsewhere.example'];
const NAMES = ['Ada', '', 'Zoé d\'Arc', 'R2 <b>&D2</b> "x"', 'Jean-Luc_7'];
const PLACES = ['the board of Mostly Up', 'gondola 3 of the big wheel', 'beach hut 7 by the pier, for good', 'a plaque for a companion, at the feet of the golden dog (no. 12)', '', 'Tom & Jerry\'s <place>'];
const CENTS = [0, 500, 1999, 2900, 19900, 123456];
const BOOL = [false, true];

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** → [[kind, args]…] */
export function mailCases({ random = 400, seed = 20261127 } = {}) {
  const cases = [];
  const add = (kind, ...args) => cases.push([kind, args]);
  const perks = ['Every hat, paint and trail of the shop', 'The two largest sizes', 'A badge next to your name'];

  for (const site of SITES) for (const name of NAMES) {
    add('code', site, name, 'K7QM-2HXP-9WRT', 30);
    add('welcome', site, name);
    add('invite', site, name, `${site}/?pw=abc.def-123_456`, 7);
    add('invite', site, name, 'javascript:alert(1)');
    add('invite', site, name, 'https://fair.example/?pw=a%2Bb&x=<y>', 1);
    add('pass', site, name, { perks, cents: 1900 });
    add('pass', site, name, { perks: [], cents: 0 });
    add('pass', site, name);
  }
  add('code', 'https://fair.example', 'Ada', 'A<B>&"C\'', 5);
  add('code', undefined, 'Ada', 'AAAA-BBBB-CCCC', 30);
  add('welcome', null, 'Ada');
  add('invite', 'https://fair.example', 'Ada', undefined, 3);
  add('invite', 'https://fair.example', 'Ada', '');

  // the thanks to a sponsor, and the word to the owner: every switch
  for (const site of SITES.slice(0, 4)) for (const name of NAMES.slice(0, 4)) for (const cents of [0, 2900]) for (const place of PLACES.slice(0, 2)) {
    for (const [monthly, auction, life, plaque, wall] of [[0, 0, 0, 0, 0], [1, 0, 0, 0, 0], [0, 1, 0, 0, 0], [0, 0, 1, 0, 0], [1, 1, 0, 0, 0], [1, 0, 1, 0, 0], [0, 1, 1, 0, 0], [0, 0, 0, 1, 0], [0, 0, 0, 1, 1], [1, 0, 0, 1, 0], [0, 0, 0, 0, 1], [0, 1, 0, 1, 1]].map((r) => r.map(Boolean))) {
      add('sponsor', site, name, { place, cents, monthly, auction, plaque, wall, life });
    }
  }
  add('sponsor', 'https://fair.example', 'Ada');
  add('sponsor', 'https://fair.example', 'Eve', { place: 'gondola 15 of the big wheel', cents: 19900, life: true });
  for (const site of SITES.slice(0, 4)) for (const account of NAMES.slice(0, 4)) for (const cents of [0, 2900, 1999]) for (const place of PLACES.slice(0, 2)) {
    for (const [monthly, auction, plaque, life, test, lost] of [[0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0], [0, 0, 0, 1, 0, 0], [0, 0, 1, 0, 0, 0], [0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 1], [0, 0, 1, 0, 0, 1], [1, 1, 0, 1, 0, 0], [0, 0, 1, 0, 1, 1]].map((r) => r.map(Boolean))) {
      add('ownerSale', site, { place, cents, monthly, auction, plaque, life, account, test, lost });
    }
  }
  add('ownerSale', 'https://fair.example');
  add('ownerSale', 'https://fair.example', { test: true });

  // what happens to what a sponsor paid for
  for (const site of SITES.slice(0, 4)) for (const name of NAMES.slice(0, 3)) for (const kind of ['outbid', 'late', 'top', 'down', 'refunded', 'unheard-of']) for (const cents of [0, 700]) for (const place of PLACES.slice(0, 1).concat(kind === 'refunded' || kind === 'unheard-of' ? [''] : [])) {
    for (const refunded of BOOL) for (const [monthly, plaque, tie, first] of [[0, 0, 0, 0], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [1, 1, 1, 1]].map((r) => r.map(Boolean))) {
      for (const contact of ['', 'hello@fair.example']) add('sponsorNotice', site, name, { kind, place, cents, refunded, monthly, plaque, tie, first, contact });
    }
  }
  add('sponsorNotice', 'https://fair.example', 'Ada');
  add('sponsorNotice', 'https://fair.example', '', { kind: 'down', place: 'the board of <Shell> & Shock', cents: 700, refunded: true, contact: 'a&b@fair.example' });

  // money given back, or not: the owner's line
  for (const site of SITES.slice(0, 4)) for (const reason of ['outbid', 'raised', 'late', 'down', 'later', '', 'unheard-of']) for (const cents of [0, 400]) for (const place of ['the board of Shell Shock', '']) {
    for (const [monthly, ok, asked, unstopped] of [[0, 1, 1, 0], [1, 1, 1, 0], [0, 0, 1, 0], [1, 0, 1, 0], [0, 1, 0, 1], [1, 0, 1, 1], [1, 1, 1, 1], [0, 0, 0, 0]].map((r) => r.map(Boolean))) {
      for (const [error, uncredited] of [['', ''], ['This payment is too old to be refunded.', ''], ['', 'Credit notes cannot be made just now.'], ['<no> & "why"', 'it\'s <closed>']]) add('ownerRefund', site, { cents, place, reason, monthly, ok, error, asked, unstopped, uncredited });
    }
  }
  add('ownerRefund', 'https://fair.example');

  // …and a few hundred drawn at random
  const rnd = mulberry(seed), pick = (list) => list[Math.floor(rnd() * list.length)], flip = () => rnd() < 0.5;
  for (let i = 0; i < random; i++) {
    const site = pick(SITES), name = pick(NAMES), place = pick(PLACES), cents = pick(CENTS);
    const kind = pick(['code', 'welcome', 'invite', 'sponsor', 'pass', 'ownerSale', 'sponsorNotice', 'ownerRefund']);
    if (kind === 'code') add(kind, site, name, pick(['K7QM-2HXP-9WRT', 'AAAA-BBBB-CCCC']), pick([5, 30, 60]));
    else if (kind === 'welcome') add(kind, site, name);
    else if (kind === 'invite') add(kind, site, name, pick([`${site}/?pw=tok.en`, '', 'ftp://x']), pick([1, 7, 30]));
    else if (kind === 'sponsor') add(kind, site, name, { place, cents, monthly: flip(), auction: flip(), plaque: flip(), wall: flip(), life: flip() });
    else if (kind === 'pass') add(kind, site, name, { perks: flip() ? perks : perks.slice(0, 1).concat('A <b>bold</b> & "quoted" perk'), cents });
    else if (kind === 'ownerSale') add(kind, site, { place, cents, monthly: flip(), auction: flip(), plaque: flip(), life: flip(), account: name, test: rnd() < 0.15, lost: rnd() < 0.3 });
    else if (kind === 'sponsorNotice') add(kind, site, name, { kind: pick(['outbid', 'late', 'top', 'down', 'refunded']), place, cents, refunded: flip(), monthly: flip(), plaque: flip(), tie: flip(), first: flip(), contact: pick(['', 'hello@fair.example']) });
    else add(kind, site, { cents, place, reason: pick(['outbid', 'raised', 'late', 'down', 'later', '']), monthly: flip(), ok: flip(), error: pick(['', 'No such charge', 'a "quoted" <reason>']), asked: flip(), unstopped: rnd() < 0.25, uncredited: pick(['', '', 'Credit notes cannot be made just now.']) });
  }
  return cases;
}

/** The builder of each kind, in a module of builders (server/mail.js, or what it was). */
export const builderOf = (mod, kind) => mod[`${kind}Mail`];

/** Where two texts first differ: a few characters of each, for the report of a check. */
export function firstDifference(a, b) {
  if (a === b) return '';
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `at ${i}: …${JSON.stringify(a.slice(Math.max(0, i - 40), i + 60))} ≠ …${JSON.stringify(b.slice(Math.max(0, i - 40), i + 60))}`;
}
