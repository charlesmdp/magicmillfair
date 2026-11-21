// What the game sells, and for how much. This is the only place where prices are decided: the browser is
// shown them (GET /api/shop) and never tells the server what something costs.
//
//   hat:<id>        a hat, once                      (the ids of src/player/Cosmetics.js)
//   jetpack         the jetpack, once
//   board:<id>      the sponsor's panel over the board of a game, by the month
//   tarp:shoot      the backdrop of the shooting gallery, by the month
//   gondola:<n>     a gondola of the big wheel (1 to 24), by the month
//   village:<id>    a sky village, by the month: ten prices, the higher the village the dearer
//
// The first two are things a visitor owns; the others are places ("slots") that one sponsor holds at a time.
import { SPONSORS, sponsorId, VILLAGE_PRICES } from '../src/world/layout/sponsors.js';
import { SKY_TIERS } from './sky-tiers.js';

export const CURRENCY = 'usd';
/** Prices in cents. */
export const PRICES = { hat: 999, jetpack: 3000, board: 4900, tarp: 9900, gondola: 2900 };
export const HATS = { cap: 'Cap', straw: 'Straw hat', beanie: 'Beanie', tophat: 'Top hat', cowboy: 'Cowboy hat', crown: 'Crown', wizard: 'Wizard hat' };
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
  if (type === 'jetpack' && id === undefined) return { item, kind: 'own', amount: PRICES.jetpack, monthly: false, name: 'Magic Mill Fair — the jetpack' };
  if (type === 'hat' && Object.hasOwn(HATS, id)) return { item, kind: 'own', amount: PRICES.hat, monthly: false, name: `Magic Mill Fair — ${HATS[id]}` };
  if (type === 'board' && Object.hasOwn(BOARDS, id)) return { item, kind: 'slot', amount: PRICES.board, monthly: true, name: `Magic Mill Fair — sponsor of ${BOARDS[id]}` };
  if (item === 'tarp:shoot') return { item, kind: 'slot', amount: PRICES.tarp, monthly: true, name: 'Magic Mill Fair — the backdrop of Bullseye Alley' };
  if (type === 'gondola' && /^[1-9]\d?$/.test(id || '') && +id <= GONDOLAS) return { item, kind: 'slot', amount: PRICES.gondola, monthly: true, name: `Magic Mill Fair — gondola ${id} of the big wheel` };
  if (type === 'village' && VILLAGES.has(id)) { const v = VILLAGES.get(id); return { item, kind: 'slot', amount: VILLAGE_PRICES[v.tier] * 100, monthly: true, name: `Magic Mill Fair — the sky village ${v.name}` }; }
  return null;
}

/** The prices, as the game shows them (in cents). */
export const publicPrices = () => ({ currency: CURRENCY, ...PRICES, village: VILLAGE_PRICES.map((p) => p * 100) });
