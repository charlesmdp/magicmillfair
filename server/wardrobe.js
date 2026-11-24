// What a visitor may be seen wearing. The relay only carries numbers — a colour, a "kit" (paint, trail, pet), a
// look (hat, jetpack flame, size) — and a browser that has been tampered with could set them to anything. Here
// they are brought back to what the browser, or its account, really has (the Game Pass and the free day of the
// light jetpack included): what is not owned is shown as the plain robot. The shop is what knows (accounts.js);
// the relay is given the wardrobe when a connection arrives, and asks again when the browser says something
// was bought ({t:'own'}). Nothing here stops a tampered browser from showing itself what it likes: it is what
// the others see that is checked.
import { PAINTS, TRAILS, PETS, FREE_COLORS, TRIAL, passGives } from './items.js';

/** The hats, in the order their number travels in (src/player/Cosmetics.js: HATS — a test checks the two agree). */
export const HAT_IDS = ['none', 'cap', 'straw', 'beanie', 'tophat', 'cowboy', 'crown', 'wizard', 'pirate', 'viking', 'chef', 'propeller', 'party'];
/** The gesture a firework travels under (src/main.js). */
export const FIREWORK = 31;
// What shows on an avatar, one bit each — a wardrobe is one number; the last bit is the Game Pass.
const SEEN = ['jetpack', 'jetlite', 'fireworks', ...HAT_IDS.slice(1).map((h) => `hat:${h}`), ...PAINTS.slice(1).map((p) => `paint:${p}`), ...TRAILS.slice(1).map((t) => `trail:${t}`), ...PETS.slice(1).map((p) => `pet:${p}`)];
const BIT = new Map(SEEN.map((id, i) => [id, 2 ** i])), PASS = 2 ** 30;

/**
 * The wardrobe of a visitor: { m: one bit per thing owned that shows, and one for the pass; left: ms of the
 * free day of the light jetpack that remain }. `items`: what is owned; `pass`: the Game Pass is in force;
 * `first`: when they first came (0: just now).
 */
export function wardrobeFrom(items, pass, first, now) {
  let m = pass ? PASS : 0;
  for (const id of items || []) m |= BIT.get(id) || 0;
  return { m, left: Math.max(0, (first || now) + TRIAL.ms - now) };
}
/** A wardrobe as it came from somewhere else, made safe: { m, left }, or null. */
export const cleanWardrobe = (w) => (w && Number.isInteger(w.m) && w.m >= 0 && w.m < 2 ** 31 ? { m: w.m, left: Number.isFinite(w.left) && w.left > 0 ? Math.min(w.left, TRIAL.ms) : 0 } : null);

// `w`: a wardrobe as the relay keeps it ({ m, t: when the free day ends, on the relay's own clock }), `true` for
// whoever may wear anything (an administrator), `undefined` where nobody checks (a host that gives no wardrobe).
const holds = (w, id) => (w.m & (BIT.get(id) || 0)) !== 0 || ((w.m & PASS) !== 0 && passGives(id));
const free = (w) => w === undefined || w === true;

/** A colour (0-31): the second sixteen come with the pass. */
export const fitColor = (color, w) => (free(w) || color < FREE_COLORS || (w.m & PASS) !== 0 ? color : color - FREE_COLORS);
/** A kit (see items.js: packKit): a paint, a trail, a pet that are not owned are none. */
export function fitKit(kit, w) {
  if (free(w)) return kit;
  let paint = kit & 7, trail = (kit >> 3) & 7, pet = (kit >> 6) & 3;
  if (paint && !(PAINTS[paint] && holds(w, `paint:${PAINTS[paint]}`))) paint = 0;
  if (trail && !(TRAILS[trail] && holds(w, `trail:${TRAILS[trail]}`))) trail = 0;
  if (pet && !(PETS[pet] && holds(w, `pet:${PETS[pet]}`))) pet = 0;
  return paint | (trail << 3) | (pet << 6);
}
/**
 * A look (the 16 bits of src/player/Character.js: packLook): a hat that is not owned comes off, the flame of a
 * jetpack nobody has goes out, a size that comes with the pass goes back to the usual one. The rest — a bouquet,
 * a quad, a disguise, what the secret words do — is everybody's.
 */
export function fitLook(f, w, now) {
  if (free(w)) return f;
  const hat = ((f >> 1) & 7) | (((f >> 12) & 1) << 3);
  if (hat && !(HAT_IDS[hat] && holds(w, `hat:${HAT_IDS[hat]}`))) f &= ~0x100e;
  if ((f & 16) && !(holds(w, 'jetpack') || holds(w, 'jetlite') || w.t > now)) f &= ~16;
  const size = ((f >> 8) & 3) | (((f >> 13) & 1) << 2);
  if (size >= 1 && size <= 3 && (w.m & PASS) === 0) f &= ~0x2300;
  return f;
}
/** May a firework be lit (the box of fireworks is bought)? */
export const mayLight = (w) => free(w) || holds(w, 'fireworks');
