// What the game sells, and for how much. This is the only place where prices are decided: the browser is
// shown them (GET /api/shop) and never tells the server what something costs.
//
//   what a visitor owns, once and for good: the list of items.js (two jetpacks, the hats, paints, trails,
//   a box of fireworks) — 'jetpack', 'hat:crown', 'paint:gold'…
//   board:<id>      the sponsor's panel over the board of a game: an auction. A bid is paid once; whoever
//                   bids more takes the panel, and the one who held it is refunded in full (see shop.js)
//   tarp:shoot      the backdrop of the shooting gallery, by the month
//   gondola:<n>     a gondola of the big wheel (1 to 24), by the month
//   village:<id>    a sky village, by the month: ten prices, the higher the village the dearer
//
// The first are things a visitor owns; the others are places ("slots") that one sponsor holds at a time.
import { SPONSORS, sponsorId, VILLAGE_PRICES } from '../src/world/layout/sponsors.js';
import { ITEMS, itemOf } from './items.js';
import { SKY_TIERS } from './sky-tiers.js';

export const CURRENCY = 'usd';
/** Prices of the places, in cents (what one owns: see items.js). */
export const PRICES = { tarp: 9900, gondola: 2900 };
/** The auction of the panels of the games: the first bid, the most that can be bid, and what the next bid must be. */
export const AUCTION = { start: 100, max: 1_000_000 };
/** The least that beats `bid` (cents): one dollar more, or a tenth more when that is larger (in whole dollars). */
export const nextBid = (bid = 0) => (bid > 0 ? bid + Math.max(100, Math.ceil(bid / 1000) * 100) : AUCTION.start);
export const BOARDS = { sky: 'Mostly Up', race: 'Quadmania', shoot: 'Bullseye Alley', mole: 'Whack-a-Mole', milk: 'Feed the Clown', bell: 'Ring the Bell' };
export const GONDOLAS = 24;
const VILLAGES = new Map(SPONSORS.map((s, i) => [sponsorId(s), { name: s.name, tier: SKY_TIERS[i] ?? 0 }]));

/**
 * What an item is, or null when nothing of that name is sold:
 * { item, kind: 'own' | 'slot', amount (cents), monthly, name (what the buyer reads on the payment page) }.
 */
export function describe(item) {
  if (typeof item !== 'string' || item.length > 60) return null;
  const [type, id, more] = item.split(':');
  if (more !== undefined) return null;
  const own = itemOf(item);
  if (own) return { item, kind: 'own', amount: own.price, monthly: false, name: `Atomic Oasis — ${own.name}` };
  if (type === 'board' && Object.hasOwn(BOARDS, id)) return { item, kind: 'slot', auction: true, amount: AUCTION.start, monthly: false, label: BOARDS[id], name: `Atomic Oasis — sponsor of ${BOARDS[id]} (your bid)` };
  if (item === 'tarp:shoot') return { item, kind: 'slot', amount: PRICES.tarp, monthly: true, name: 'Atomic Oasis — the backdrop of Bullseye Alley' };
  if (type === 'gondola' && /^[1-9]\d?$/.test(id || '') && +id <= GONDOLAS) return { item, kind: 'slot', amount: PRICES.gondola, monthly: true, name: `Atomic Oasis — gondola ${id} of the big wheel` };
  if (type === 'village' && VILLAGES.has(id)) { const v = VILLAGES.get(id); return { item, kind: 'slot', amount: VILLAGE_PRICES[v.tier] * 100, monthly: true, name: `Atomic Oasis — the sky village ${v.name}` }; }
  return null;
}

/** The prices, as the game shows them (in cents). */
export const publicPrices = () => ({ currency: CURRENCY, ...PRICES, auction: AUCTION, village: VILLAGE_PRICES.map((p) => p * 100), items: Object.fromEntries(ITEMS.map((it) => [it.id, it.price])) });
