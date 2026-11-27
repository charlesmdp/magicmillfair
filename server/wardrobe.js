// What a visitor may be seen wearing. The relay only carries numbers — a colour, a "kit" (paint, trail, pet), a
// look (hat, jetpack flame, size) — and a browser that has been tampered with could set them to anything. Here
// they are brought back to what the browser, or its account, really has (the Game Pass and the free day of the
// light jetpack included): what is not owned is shown as the plain robot. The shop is what knows (accounts.js);
// the relay is given the wardrobe when a connection arrives, and asks again when the browser says something
// was bought ({t:'own'}). Nothing here stops a tampered browser from showing itself what it likes: it is what
// the others see that is checked.
import { PAINTS, TRAILS, PETS, FREE_COLORS, TRIAL, passGives, packKit, unpackKit, hatOf, HAT_BITS } from './items.js';

/** The hats, in the order their number travels in (src/player/Cosmetics.js: HATS — a test checks the two agree). */
export const HAT_IDS = ['none', 'cap', 'straw', 'beanie', 'tophat', 'cowboy', 'crown', 'wizard', 'pirate', 'viking', 'chef', 'propeller', 'party', 'halo', 'jester', 'antlers', 'sombrero', 'mortarboard', 'cone'];
/** The gesture a firework travels under (src/main.js). */
export const FIREWORK = 31;
// What shows on an avatar, one bit each — a wardrobe is one number; bit 30 is the Game Pass. The first
// twenty-nine bits are what was sold when a wardrobe fitted in thirty-one: the twelve hats and the nine paints of
// then, in their places for good. What came after — and what will come — takes the bits from 31 up, in the order
// it came: a hat or a paint added to the end of its list finds its bit by itself. A number holds fifty-three
// bits: room for twenty-two things after the pass, fifteen of them taken (a test counts).
const FIRST_HATS = 12, FIRST_PAINTS = 9;
const hat = (h) => `hat:${h}`, paint = (p) => `paint:${p}`;
const SEEN = ['jetpack', 'jetlite', 'fireworks', ...HAT_IDS.slice(1, 1 + FIRST_HATS).map(hat), ...PAINTS.slice(1, 1 + FIRST_PAINTS).map(paint), ...TRAILS.slice(1).map((t) => `trail:${t}`), ...PETS.slice(1).map((p) => `pet:${p}`)];
const LATER = [...HAT_IDS.slice(1 + FIRST_HATS).map(hat), ...PAINTS.slice(1 + FIRST_PAINTS).map(paint)];
const PASS = 2 ** 30;
const BIT = new Map([...SEEN.map((id, i) => [id, 2 ** i]), ...LATER.map((id, i) => [id, 2 ** (31 + i)])]);
/** How many bits a wardrobe takes, the pass included (it must stay a whole number a browser can hold: 53 at the most). */
export const WARDROBE_BITS = 31 + LATER.length;
// (a wardrobe is too wide for the bitwise operators, which stop at thirty-two bits: these do the same by arithmetic)
const has = (m, bit) => Math.floor(m / bit) % 2 === 1;

/**
 * The wardrobe of a visitor: { m: one bit per thing owned that shows, and one for the pass; left: ms of the
 * free day of the light jetpack that remain }. `items`: what is owned; `pass`: the Game Pass is in force;
 * `first`: when they first came (0: just now).
 */
export function wardrobeFrom(items, pass, first, now) {
  let m = pass ? PASS : 0;
  for (const id of items || []) { const bit = BIT.get(id); if (bit && !has(m, bit)) m += bit; }
  return { m, left: Math.max(0, (first || now) + TRIAL.ms - now) };
}
/** A wardrobe as it came from somewhere else, made safe: { m, left }, or null. */
export const cleanWardrobe = (w) => (w && Number.isSafeInteger(w.m) && w.m >= 0 ? { m: w.m, left: Number.isFinite(w.left) && w.left > 0 ? Math.min(w.left, TRIAL.ms) : 0 } : null);

// `w`: a wardrobe as the relay keeps it ({ m, t: when the free day ends, on the relay's own clock }), `true` for
// whoever may wear anything (an administrator), `undefined` where nobody checks (a host that gives no wardrobe).
const holds = (w, id) => (BIT.has(id) && has(w.m, BIT.get(id))) || (has(w.m, PASS) && passGives(id));
const free = (w) => w === undefined || w === true;

/** A colour (0-31): the second sixteen come with the pass. */
export const fitColor = (color, w) => (free(w) || color < FREE_COLORS || has(w.m, PASS) ? color : color - FREE_COLORS);
/** A kit (see items.js: packKit): a paint, a trail, a pet that are not owned are none. */
export function fitKit(kit, w) {
  if (free(w)) return kit;
  let { paint, trail, pet } = unpackKit(kit);
  if (paint && !(PAINTS[paint] && holds(w, `paint:${PAINTS[paint]}`))) paint = 0;
  if (trail && !(TRAILS[trail] && holds(w, `trail:${TRAILS[trail]}`))) trail = 0;
  if (pet && !(PETS[pet] && holds(w, `pet:${PETS[pet]}`))) pet = 0;
  return packKit({ paint, trail, pet });
}
/**
 * A look (the 16 bits of src/player/Character.js: packLook): a hat that is not owned comes off, the flame of a
 * jetpack nobody has goes out, a size that comes with the pass goes back to the usual one. The rest — a bouquet,
 * a quad, a disguise, what the secret words do — is everybody's.
 */
export function fitLook(f, w, now) {
  if (free(w)) return f;
  const worn = hatOf(f);
  if (worn && !(HAT_IDS[worn] && holds(w, `hat:${HAT_IDS[worn]}`))) f &= ~HAT_BITS;
  if ((f & 16) && !(holds(w, 'jetpack') || holds(w, 'jetlite') || w.t > now)) f &= ~16;
  const size = ((f >> 8) & 3) | (((f >> 13) & 1) << 2);
  if (size >= 1 && size <= 3 && !has(w.m, PASS)) f &= ~0x2300;
  return f;
}
/** May a firework be lit (the box of fireworks is bought)? */
export const mayLight = (w) => free(w) || holds(w, 'fireworks');
