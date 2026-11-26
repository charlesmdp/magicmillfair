// Who is thanked on the wall of thanks (world/zones/games/ThanksWall.js), and in which order.
//
// Who counts as a sponsor: whoever shows something on the panel of a game, on a gondola of the big wheel, on
// the roof of a beach hut, on the backdrop of the shooting gallery or on a sky village. Not the plaques of the companions round the golden
// dog: those are for pets, and put there by people.
//
// The order: what each has put in so far, the most first. A bid counts for what was bid; a place held by the
// month counts every month begun since it was taken (the server works it out: `pays.total`, see server/shop.js).
// The wall says how each pays — "$29 a month" is never shown as if it were a lump sum. A sponsor nobody is
// known to pay for (a place the administrator filled by hand, without saying what was paid) comes last,
// without a figure. One sponsor with several places is one line: what they pay is added up — and so is how
// many times their site was opened from the game, at any of their places or from the wall itself.
//
// Nothing here is private: a name, a line and a picture are what the sponsor chose to show, and the amounts
// are those of the auction (already told to everybody who bids) and of the price list.

/** A sum in cents, as it is written: 2900 → "$29", 123456 → "$1,234.56". */
export const dollars = (cents) => {
  const d = Math.floor(cents / 100), c = Math.round(cents % 100);
  return `$${String(d).replace(/\B(?=(\d{3})+$)/g, ',')}${c ? `.${String(c).padStart(2, '0')}` : ''}`;
};

/** Where a place is, in a few words. games: { key → the name of the game }. '' for what is no sponsor's place. */
export function placeWords(id, games = {}) {
  const [type, sub] = String(id).split(':');
  if (type === 'board') return games[sub] || 'A game of the fair';
  if (type === 'gondola') return `Gondola ${sub}`;
  if (type === 'hut') return `Beach hut ${sub}`;
  if (type === 'tarp') return `The backdrop of ${games[sub] || 'the shooting gallery'}`;
  if (type === 'village') return 'A village in the sky';
  return '';
}

/** The site of a sponsor, as it is written on the wall: "https://www.acme.example/shop" → "acme.example". */
export const siteWords = (url) => String(url || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[/?#].*$/, '').slice(0, 40);

/**
 * The sponsors of the fair, the one who puts in the most first.
 * slots: what GET /api/shop says — { id: { state, title, subtitle, url, logo, pays: { amount, monthly, total } | undefined } }.
 * → [{ name, tagline, url, site (its site in a few letters), clicks (how often it was opened, all its places together),
 *      first (the id of one of its places), logo (an address, or null), places: [words], where (words), figure ("$29", "$1,200" or ''),
 *      unit ('a month', 'so far' or ''), note (words, or ''), total (cents so far), monthly (cents a month) }]
 */
export function rankSponsors(slots, games = {}) {
  const byName = new Map();
  for (const [id, s] of Object.entries(slots || {})) {
    const words = placeWords(id, games);
    if (!words || !s || s.state !== 'live' || !s.title) continue;
    const key = String(s.title).trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, { name: String(s.title).trim(), tagline: '', url: '', logo: null, places: [], once: 0, monthly: 0, total: 0, clicks: 0, first: id });
    const r = byName.get(key), p = s.pays;
    r.places.push({ id, words });
    if (!r.tagline && s.subtitle) r.tagline = s.subtitle;
    if (!r.url && s.url) { r.url = s.url; r.first = id; } // (a click from the wall is counted on the place that gave the link)
    if (Number.isFinite(s.clicks)) r.clicks += s.clicks;
    if (!r.logo && s.logo) r.logo = s.logo;
    if (p && Number.isFinite(p.amount) && p.amount > 0) {
      if (p.monthly) r.monthly += p.amount; else r.once += p.amount;
      r.total += Number.isFinite(p.total) && p.total > 0 ? p.total : p.amount;
    }
  }
  // (the places of a sponsor: the games first, then the wheel by number, the huts by number, the rest after)
  const kind = (id) => ['board', 'tarp', 'gondola', 'hut', 'village'].indexOf(id.split(':')[0]);
  const rows = [...byName.values()].map((r) => {
    r.places.sort((a, b) => kind(a.id) - kind(b.id) || (parseInt(a.id.split(':')[1], 10) || 0) - (parseInt(b.id.split(':')[1], 10) || 0) || a.words.localeCompare(b.words));
    const places = r.places.map((p) => p.words);
    const where = places.length > 3 ? `${places.slice(0, 2).join(' · ')} · +${places.length - 2} more` : places.join(' · ');
    let figure = '', unit = '', note = '';
    if (r.monthly && !r.once) { figure = dollars(r.monthly); unit = 'a month'; if (r.total > r.monthly) note = `${dollars(r.total)} so far`; }
    else if (r.once && !r.monthly) figure = dollars(r.once);
    else if (r.once && r.monthly) { figure = dollars(r.total); unit = 'so far'; note = `${dollars(r.once)} + ${dollars(r.monthly)} a month`; }
    else note = 'partner of the fair';
    return { name: r.name, tagline: r.tagline, url: r.url, site: siteWords(r.url), clicks: r.clicks, first: r.first, logo: r.logo, places, where, figure, unit, note, total: r.total, monthly: r.monthly };
  });
  return rows.sort((a, b) => b.total - a.total || b.monthly - a.monthly || a.name.localeCompare(b.name));
}
