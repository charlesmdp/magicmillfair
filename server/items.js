// What a visitor can own, once and for good. One list for both sides: the server reads the prices in it (and
// nothing the browser says about them), the game dresses its shop with the rest.
//
//   id      what is bought and kept: 'jetpack', 'hat:crown', 'paint:gold', 'trail:confetti'…
//   price   in cents (US dollars)
//   group   the shelf of the shop: gear, hats, paint, trails, fun
//   rarity  how the card is dressed: uncommon, rare, epic, legendary
//   blurb   what the card says
//
// Nothing here changes how well anybody plays against the others: the two jetpacks are for wandering (the
// games do without them), the rest is for show.
export const ITEMS = [
  { id: 'jetpack', name: 'Jetpack', price: 3000, group: 'gear', rarity: 'legendary', blurb: 'Jump again in the air and fly: a second and a half of thrust, refilled every time you land. For the rooftops, the cliffs and the showing off.' },
  { id: 'jetlite', name: 'Jetpack Lite', price: 500, group: 'gear', rarity: 'rare', blurb: 'The same idea with a third of the tank: half a second of thrust. Enough for a ledge, a wall, a second thought.' },
  { id: 'fireworks', name: 'Box of fireworks', price: 1500, group: 'fun', rarity: 'epic', blurb: 'Never empty. Press V: a rocket goes up, bursts, and everybody around looks at the sky. The end of the world deserves a party.' },

  { id: 'hat:crown', name: 'Crown', price: 999, group: 'hats', rarity: 'legendary', blurb: 'Solid gold, five points. Somebody has to be in charge of what is left.' },
  { id: 'hat:wizard', name: 'Wizard hat', price: 999, group: 'hats', rarity: 'epic', blurb: 'Tall, pointed, starred. Does nothing. Looks like it does everything.' },
  { id: 'hat:tophat', name: 'Top hat', price: 999, group: 'hats', rarity: 'rare', blurb: 'For the ringmaster in you.' },
  { id: 'hat:cowboy', name: 'Cowboy hat', price: 999, group: 'hats', rarity: 'rare', blurb: 'Wide brim, high crown. Pairs well with a quad.' },
  { id: 'hat:straw', name: 'Straw hat', price: 999, group: 'hats', rarity: 'uncommon', blurb: 'The beach is the last one on Earth: dress for it.' },
  { id: 'hat:cap', name: 'Cap', price: 999, group: 'hats', rarity: 'uncommon', blurb: 'A cap. It is a good cap.' },
  { id: 'hat:beanie', name: 'Beanie', price: 999, group: 'hats', rarity: 'uncommon', blurb: 'Warm ears on a robot: pure luxury.' },

  { id: 'paint:gold', name: 'Gold plating', price: 1900, group: 'paint', rarity: 'legendary', blurb: 'Your whole robot, plated in gold. Tasteful? No. Magnificent? Yes.' },
  { id: 'paint:chrome', name: 'Chrome finish', price: 1500, group: 'paint', rarity: 'epic', blurb: 'Polished like a bumper: the valley, the sea and the big wheel slide over you.' },
  { id: 'paint:atomic', name: 'Atomic glow', price: 1200, group: 'paint', rarity: 'epic', blurb: 'A healthy green glow that pulses gently. The doctor says it is fine. The doctor glows too.' },
  { id: 'paint:candy', name: 'Candy paint', price: 900, group: 'paint', rarity: 'rare', blurb: 'Your colour drifts through the whole rainbow, slowly, for ever.' },

  { id: 'trail:fallout', name: 'Fallout trail', price: 1200, group: 'trails', rarity: 'epic', blurb: 'Green sparks float up behind you wherever you run. Perfectly safe. Probably.' },
  { id: 'trail:confetti', name: 'Confetti trail', price: 900, group: 'trails', rarity: 'rare', blurb: 'Every step is a parade: paper of all colours flutters behind you.' },
  { id: 'trail:stardust', name: 'Stardust trail', price: 700, group: 'trails', rarity: 'rare', blurb: 'A wake of golden sparkles, like a comet with legs.' },
  { id: 'trail:bubbles', name: 'Bubble trail', price: 500, group: 'trails', rarity: 'uncommon', blurb: 'Soap bubbles drift up behind you. Nobody can stay grumpy near bubbles.' },
];

const BY_ID = new Map(ITEMS.map((it) => [it.id, it]));
/** The item of that id, or undefined. */
export const itemOf = (id) => BY_ID.get(id);

// What an avatar shows besides its hat travels as one small number, its "kit" (see packKit): the paint,
// the trail, and a place kept for a companion.
export const PAINTS = ['none', 'gold', 'chrome', 'atomic', 'candy'];
export const TRAILS = ['none', 'stardust', 'confetti', 'bubbles', 'fallout'];
export const PETS = ['none', 'pup'];
/** { paint, trail, pet } (numbers in the lists above) → 0..255 */
export const packKit = ({ paint = 0, trail = 0, pet = 0 } = {}) => (paint & 7) | ((trail & 7) << 3) | ((pet & 3) << 6);
export const unpackKit = (k) => ({ paint: k & 7, trail: (k >> 3) & 7, pet: (k >> 6) & 3 });
