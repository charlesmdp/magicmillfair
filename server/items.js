// What a visitor can own, once and for good. One list for both sides: the server reads the prices in it (and
// nothing the browser says about them), the game dresses its shop with the rest.
//
//   id      what is bought and kept: 'jetpack', 'hat:crown', 'paint:gold', 'trail:confetti'…
//   price   in cents (US dollars)
//   group   the shelf of the shop: gear, hats, paint, trails, fun
//   rarity  how the card is dressed: uncommon, rare, epic, legendary
//   blurb   what the card says
//   retired no longer sold (the trails): whoever bought it keeps it and can wear it; the shop shows it to nobody else
//
// Nothing here changes how well anybody plays against the others: the two jetpacks are for wandering (the
// games do without them), the rest is for show.
//
// The Game Pass (PASS) is not owned: it is held by the month. While it lasts its holder has every hat (those
// that come later too) and the light jetpack, picks the size of their robot among four, and its colour among two more
// rows. And everybody has the light jetpack for a day after their first visit (TRIAL): a taste of it.
export const ITEMS = [
  { id: 'jetpack', name: 'Jetpack', price: 3000, group: 'gear', rarity: 'legendary', blurb: 'Jump again in the air and fly: a second and a half of thrust, refilled every time you land. For the rooftops, the cliffs and the showing off.' },
  { id: 'jetlite', name: 'Jetpack Lite', price: 500, group: 'gear', rarity: 'rare', blurb: 'The same idea with a small tank: a third of a second of thrust, and fifteen seconds to get its breath back. Enough for a ledge, a wall, a second thought.' },
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
  { id: 'hat:halo', name: 'Halo', price: 999, group: 'hats', rarity: 'legendary', blurb: 'A ring of light that floats over your head and follows you about. Nobody checked whether you had earned it. Nobody is left to check.' },
  { id: 'hat:jester', name: "Jester's hat", price: 999, group: 'hats', rarity: 'epic', blurb: 'Three tails, three bells, two colours that should never have met. Somebody has to laugh at the end of the world: it may as well be at you.' },
  { id: 'hat:antlers', name: 'Antlers', price: 999, group: 'hats', rarity: 'epic', blurb: 'Ten points, on a headband. The deer of the valley are made of light now; these are the last ones made of anything.' },
  { id: 'hat:sombrero', name: 'Sombrero', price: 999, group: 'hats', rarity: 'rare', blurb: 'A brim so wide it has its own weather. The sun never sets on the last beach on Earth: bring shade.' },
  { id: 'hat:mortarboard', name: 'Graduation cap', price: 999, group: 'hats', rarity: 'rare', blurb: 'A square board, a gold tassel. Every school on Earth closed the same afternoon: you may as well say you finished.' },
  { id: 'hat:cone', name: 'Traffic cone', price: 999, group: 'hats', rarity: 'uncommon', blurb: 'Orange, two white bands, found on a road that goes nowhere now. There is no traffic left to direct. You direct it anyway.' },

  { id: 'paint:gold', name: 'Gold plating', price: 1900, group: 'paint', rarity: 'legendary', blurb: 'Your whole robot, plated in gold: facets that catch the sky, and gold dust that glitters as you move. Tasteful? No. Magnificent? Yes.' },
  { id: 'paint:chrome', name: 'Chrome finish', price: 1500, group: 'paint', rarity: 'epic', blurb: 'A mirror on legs: the blue of the sky on your head, the horizon in a white line, the grass under your chin.' },
  { id: 'paint:atomic', name: 'Atomic glow', price: 1200, group: 'paint', rarity: 'epic', blurb: 'A dark shell, and under it something that glows: green veins that breathe, a rim of light round you. The doctor says it is fine. The doctor glows too.' },
  { id: 'paint:candy', name: 'Candy paint', price: 900, group: 'paint', rarity: 'rare', blurb: 'Candy-cane stripes in five flavours — raspberry, lemon, mint, blueberry, bubble gum — lacquered, and turning slowly round you.' },
  { id: 'paint:galaxy', name: 'Galaxy', price: 1600, group: 'paint', rarity: 'legendary', blurb: 'A night sky wrapped round a robot: nebulas that drift, stars that twinkle. The sky fell; somebody had to wear it.' },
  { id: 'paint:lava', name: 'Meltdown', price: 1400, group: 'paint', rarity: 'epic', blurb: 'A crust of black slag and, in its cracks, the fire of the core, crawling as you walk. Do not hug anybody.' },
  { id: 'paint:plasma', name: 'Plasma', price: 1300, group: 'paint', rarity: 'epic', blurb: 'Filaments of violet and cyan chase one another over a dark shell. Somewhere, a physicist weeps with joy.' },
  { id: 'paint:disco', name: 'Mirror ball', price: 1200, group: 'paint', rarity: 'epic', blurb: 'A thousand little mirrors, each with a colour of its own, twinkling as you turn. The party is wherever you stand.' },
  { id: 'paint:hazard', name: 'Hazard stripes', price: 700, group: 'paint', rarity: 'rare', blurb: 'Yellow and black, from top to toe. At last you are clearly labelled.' },
  { id: 'paint:holo', name: 'Holographic', price: 1800, group: 'paint', rarity: 'legendary', blurb: 'Every colour at once, sliding over you as you move, like oil on water. The sea looked like this for a week. On you it is lovely.' },
  { id: 'paint:marble', name: 'Marble & gold', price: 1700, group: 'paint', rarity: 'legendary', blurb: 'White marble, grey veins, and every crack mended with gold. A statue of yourself, by yourself: the museums are gone, somebody has to be the collection.' },
  { id: 'paint:tuxedo', name: 'Tuxedo', price: 1500, group: 'paint', rarity: 'epic', blurb: 'A dinner suit, painted on: black jacket, satin lapels, white shirt front, bow tie, cuffs and gloves. The world ended; the dress code did not.' },
  { id: 'paint:circuit', name: 'Circuit board', price: 1300, group: 'paint', rarity: 'epic', blurb: 'Your insides, worn outside: green board, gold traces, signals running along them, a few lamps that blink. The lamps mean nothing. Probably.' },
  { id: 'paint:frost', name: 'Deep frost', price: 1200, group: 'paint', rarity: 'epic', blurb: 'Blue ice from head to toe, snow on your head and shoulders, crystals that catch the sun. Nuclear winter, the collector\u2019s edition.' },
  { id: 'paint:sunset', name: 'Last sunset', price: 1100, group: 'paint', rarity: 'epic', blurb: 'The sky of the last evening, from the first stars down to the embers, and the sun going into the sea on your chest. The prettiest sunset in history. There was a reason.' },
  { id: 'paint:tiger', name: 'Tiger', price: 900, group: 'paint', rarity: 'rare', blurb: 'Orange, black stripes, a white belly. The last tiger on Earth is a robot, and frankly it is an improvement: this one waves.' },
  { id: 'paint:camo', name: 'Camouflage', price: 800, group: 'paint', rarity: 'rare', blurb: 'Four shades of woodland and a star stencilled on the chest. Nobody will see you coming. Everybody will hear you: you are made of tin.' },
  { id: 'paint:rust', name: 'Rust bucket', price: 700, group: 'paint', rarity: 'rare', blurb: 'Old paint that flakes, rust in bloom, rivets that weep orange. You look left out in the rain since the war — and you paid for it.' },

  { id: 'trail:fallout', name: 'Fallout trail', price: 1200, group: 'trails', retired: true, rarity: 'epic', blurb: 'Green sparks float up behind you wherever you run. Perfectly safe. Probably.' },
  { id: 'trail:confetti', name: 'Confetti trail', price: 900, group: 'trails', retired: true, rarity: 'rare', blurb: 'Every step is a parade: paper of all colours flutters behind you.' },
  { id: 'trail:stardust', name: 'Stardust trail', price: 700, group: 'trails', retired: true, rarity: 'rare', blurb: 'A wake of golden sparkles, like a comet with legs.' },
  { id: 'trail:bubbles', name: 'Bubble trail', price: 500, group: 'trails', retired: true, rarity: 'uncommon', blurb: 'Soap bubbles drift up behind you. Nobody can stay grumpy near bubbles.' },
];

/** The Game Pass: held by the month. `perks`: what the shop says it gives (the order of the card). */
export const PASS = {
  id: 'pass', name: 'Game Pass', price: 1900,
  perks: [
    'Every hat of the shop — and every hat to come',
    'The Jetpack Lite, for as long as you hold the pass',
    'Four sizes for your robot: Pocket, Classic, Jumbo and Titan',
    'Two more rows of colours for your robot, black included',
    'Coming: the weather of where you live, with its day and its night',
  ],
  why: 'It keeps the servers on and pays one entrepreneur: Atomic Oasis is not made by a multinational, but by a guy on a couch. Thank you for real.',
  // (the same five, in a few words each — [what, a word more]: the card that offers it, its banner in the shop)
  summary: [['Every hat', 'and every hat to come'], ['The Jetpack Lite', 'while you hold the pass'], ['Four sizes', 'from Pocket to Titan'], ['16 more colours', 'black included'], ['Your own weather', 'coming soon']],
};
/** What a holder of the pass has without owning it. */
export const passGives = (id) => id === 'jetlite' || (typeof id === 'string' && id.startsWith('hat:'));
/**
 * The sizes of a robot. The first four are the choice of who holds the Game Pass: Classic (everybody's),
 * Pocket (a tenth smaller), Jumbo (a tenth bigger), Titan (a fifth bigger). The others are nobody's choice:
 * what two secret words do for a moment, and how small one is made to fly on the stage of the plaza. The
 * number travels in the look of the avatar (see Character.js).
 */
export const SIZES = ['normal', 'pocket', 'jumbo', 'titan'];
export const SIZE_NAMES = ['Classic', 'Pocket', 'Jumbo', 'Titan'];
export const SIZE_SCALE = [1, 0.9, 1.1, 1.2, 0.45, 2.3, 0.5];
export const SIZE = { mini: 4, maxi: 5, flyer: 6 };
/** (what the sizes were called before there were four) */
export const sizeOf = (word) => (SIZES.includes(word) ? word : word === 'tiny' ? 'pocket' : word === 'giant' ? 'titan' : 'normal');
/** Everybody has this for a while after their first visit (ms): a taste. */
export const TRIAL = { item: 'jetlite', ms: 24 * 3600_000 };
/** How many colours a robot can be: the first sixteen are everybody's, the others come with the pass. */
export const COLORS = 32, FREE_COLORS = 16;

const BY_ID = new Map(ITEMS.map((it) => [it.id, it]));
/** The item of that id, or undefined. */
export const itemOf = (id) => BY_ID.get(id);

// What an avatar shows besides its hat travels as one small number, its "kit" (see packKit): the paint,
// the trail, and a place kept for a companion. Never reorder these lists: append (the numbers travel, and are
// what a browser of an older version of the game knows).
export const PAINTS = ['none', 'gold', 'chrome', 'atomic', 'candy', 'lava', 'plasma', 'hazard', 'disco', 'galaxy', 'tuxedo', 'camo', 'tiger', 'rust', 'frost', 'holo', 'circuit', 'marble', 'sunset'];
export const TRAILS = ['none', 'stardust', 'confetti', 'bubbles', 'fallout']; // (no longer sold: see `retired` above)
export const PETS = ['none', 'pup'];
/**
 * { paint, trail, pet } (numbers in the lists above) → 0..KIT_MAX. The kit was eight bits — four of paint, three
 * of trail, one of companion — until there were more than fifteen paints: the paint has two more bits now, above
 * the others (bits 8 and 9: sixty-three paints), and every number of before means what it meant. A browser of
 * before reads a paint it does not know as none (and a kit over 255 as no kit at all).
 */
export const KIT_MAX = 1023;
export const packKit = ({ paint = 0, trail = 0, pet = 0 } = {}) => (paint & 15) | ((trail & 7) << 4) | ((pet & 1) << 7) | (((paint >> 4) & 3) << 8);
export const unpackKit = (k) => ({ paint: (k & 15) | (((k >> 8) & 3) << 4), trail: (k >> 4) & 7, pet: (k >> 7) & 1 });

// The hat travels in the look of the avatar (the 16 "flags" of its state: src/player/Character.js, packLook), as
// its number in HATS (src/player/Cosmetics.js; HAT_IDS in wardrobe.js). It was four bits (bits 1-3 and 12) until
// there were more than fifteen hats; bit 14 is the fifth: thirty-one hats. With it set, the four old bits say
// 31 minus the number — the hats after the fifteenth count down from 15 there —, so that a browser of before the
// fifth bit, which reads those four alone, finds 15, 14, 13: hats it does not have, and shows none (read
// straight, 17 and 18 would have been a cap and a straw hat on its screen).
export const HAT_BITS = 0x500e;
/** The number of the hat in a look. */
export const hatOf = (f) => { const low = ((f >> 1) & 7) | (((f >> 12) & 1) << 3); return f & 0x4000 ? 31 - low : low; };
/** The look `f` with hat number `hat` (0 to 31) instead of its own. */
export const withHat = (f, hat) => { const h = hat & 31, low = h < 16 ? h : 31 - h; return (f & ~HAT_BITS) | ((low & 7) << 1) | (((low >> 3) & 1) << 12) | (h < 16 ? 0 : 0x4000); };
