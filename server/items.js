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
//
// The Game Pass (PASS) is not owned: it is held by the month. While it lasts its holder has every hat (those
// that come later too) and the light jetpack, may be tiny or giant, and picks their colour among two more
// rows. And everybody has the light jetpack for a day after their first visit (TRIAL): a taste of it.
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
  { id: 'hat:pirate', name: 'Pirate hat', price: 999, group: 'hats', rarity: 'epic', blurb: 'A tricorn with a skull on it. The sea is right there, and so is the shark: mind your manners.' },
  { id: 'hat:viking', name: 'Viking helmet', price: 999, group: 'hats', rarity: 'epic', blurb: 'Iron, two horns. Historians say the horns are a myth. Historians were not asked.' },
  { id: 'hat:chef', name: "Chef's hat", price: 999, group: 'hats', rarity: 'rare', blurb: 'Tall, white, pleated. You cannot cook, you have no mouth, and you look magnificent.' },
  { id: 'hat:propeller', name: 'Propeller cap', price: 999, group: 'hats', rarity: 'rare', blurb: 'The propeller really turns. It lifts nothing but the mood.' },
  { id: 'hat:party', name: 'Party hat', price: 999, group: 'hats', rarity: 'uncommon', blurb: 'A paper cone, a pompom. Every day since the end of the world is somebody\u2019s birthday.' },

  { id: 'paint:gold', name: 'Gold plating', price: 1900, group: 'paint', rarity: 'legendary', blurb: 'Your whole robot, plated in gold: facets that catch the sky, and gold dust that glitters as you move. Tasteful? No. Magnificent? Yes.' },
  { id: 'paint:chrome', name: 'Chrome finish', price: 1500, group: 'paint', rarity: 'epic', blurb: 'A mirror on legs: the blue of the sky on your head, the horizon in a white line, the grass under your chin.' },
  { id: 'paint:atomic', name: 'Atomic glow', price: 1200, group: 'paint', rarity: 'epic', blurb: 'A dark shell, and under it something that glows: green veins that breathe, a rim of light round you. The doctor says it is fine. The doctor glows too.' },
  { id: 'paint:candy', name: 'Candy paint', price: 900, group: 'paint', rarity: 'rare', blurb: 'Candy-cane stripes in five flavours — raspberry, lemon, mint, blueberry, bubble gum — lacquered, and turning slowly round you.' },

  { id: 'trail:fallout', name: 'Fallout trail', price: 1200, group: 'trails', rarity: 'epic', blurb: 'Green sparks float up behind you wherever you run. Perfectly safe. Probably.' },
  { id: 'trail:confetti', name: 'Confetti trail', price: 900, group: 'trails', rarity: 'rare', blurb: 'Every step is a parade: paper of all colours flutters behind you.' },
  { id: 'trail:stardust', name: 'Stardust trail', price: 700, group: 'trails', rarity: 'rare', blurb: 'A wake of golden sparkles, like a comet with legs.' },
  { id: 'trail:bubbles', name: 'Bubble trail', price: 500, group: 'trails', rarity: 'uncommon', blurb: 'Soap bubbles drift up behind you. Nobody can stay grumpy near bubbles.' },
];

/** The Game Pass: held by the month. `perks`: what the shop says it gives (the order of the card). */
export const PASS = {
  id: 'pass', name: 'Game Pass', price: 1900,
  perks: [
    'Every hat of the shop — and every hat to come',
    'The Jetpack Lite, for as long as you hold the pass',
    'Be tiny or be giant, whenever you like',
    'Two more rows of colours for your robot, black included',
    'Coming: the weather of where you live, with its day and its night',
  ],
  why: 'It keeps the servers on and pays one entrepreneur: Atomic Oasis is not made by a multinational, but by a guy on a couch. Thank you for real.',
};
/** What a holder of the pass has without owning it. */
export const passGives = (id) => id === 'jetlite' || (typeof id === 'string' && id.startsWith('hat:'));
/** The sizes a holder of the pass may take (the number travels in the look of the avatar: see Character.js). */
export const SIZES = ['normal', 'tiny', 'giant'];
export const SIZE_SCALE = [1, 0.45, 2.3];
/** Everybody has this for a while after their first visit (ms): a taste. */
export const TRIAL = { item: 'jetlite', ms: 24 * 3600_000 };
/** How many colours a robot can be: the first sixteen are everybody's, the others come with the pass. */
export const COLORS = 32, FREE_COLORS = 16;

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
