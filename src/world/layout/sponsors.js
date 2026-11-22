// Who lives in the sky villages: fifty small temples perched on the mountains, one for each company that
// wants its own. One line per village, in the order of the `sky` list of world.json (it starts in the
// north-west and goes round by the north and the east to the south-west).
//
//   name   what its sign says, and what the game announces on arriving (at most 22 characters)
//   motto  a second, smaller line on the sign (at most 34 characters)
//   color  [r, g, b] from 0 to 1: its roofs, its flag, its mark on the map
//   url    optional: a web address offered to visitors by the sign ("Visit …"); https only
//   id     optional: what goes in the address of the game to arrive there directly (?village=id);
//          by default the name in lower case, with dashes
//
// Until a village is taken it carries a made-up name and says so (`forHire`), with what it costs.
//
// What a village costs, per month, in US dollars: ten prices, the same number of villages at each. The
// higher a village stands, the dearer it is (the five lowest at the first price, the five highest at the last).
export const VILLAGE_PRICES = [19, 49, 99, 199, 499, 999, 1999, 3999, 7999, 9999];
/** Writes a price: 1999 → "$1,999". */
export const money = (usd) => { const s = String(Math.round(usd)); return `$${s.length > 3 ? `${s.slice(0, -3)},${s.slice(-3)}` : s}`; };
// What the board of a village for hire promises (keep each line short: it is painted on a sign).
export const VILLAGE_PERKS = [
  'Only 50 exist. We ran out of mountains.',
  'Your name on the sign AND on the map',
  'Roofs and flag in your colours. Tasteful?',
  'A link to your website. Clicks may occur.',
  'An address of your own to invite people',
  'Nearby chat stays private. Plot freely.',
];
/** What the brochure says (the board of a village for sale, the list at the Sky Gate). */
export const VILLAGE_PITCH = { title: 'A BRIGHTER TOMORROW!', sub: 'Mountain-top living for the discerning brand', foot: 'Pay for view™ — others sell pay-per-view. We sell the view.' };
const FOR_HIRE = 'This village is for hire';
const tones = [[0.72, 0.16, 0.12], [0.14, 0.38, 0.62], [0.86, 0.6, 0.1], [0.2, 0.5, 0.26], [0.5, 0.24, 0.56], [0.1, 0.5, 0.52], [0.85, 0.38, 0.12], [0.2, 0.25, 0.42]];
const names = [
  'Eagle Rest', 'Cloud End', 'High Meadow', 'Falcon Ledge', 'Mistfold', 'Sun Shelf', 'The Aerie', 'Starwatch', 'Windy Gap', 'Larkrise',
  'Stone Crown', 'Silver Step', 'Far View', 'Thunder Seat', 'Quiet Top', 'Heron Height', 'Old Summit', 'Goat Track', 'Blue Yonder', 'Dawn Terrace',
  'Raven Roost', 'Pine Balcony', 'Ember Ridge', 'Snow Lantern', 'Kite Hill', 'Echo Shelf', 'Long Look', 'Moon Porch', 'Swift Corner', 'Last Light',
  'Amber Watch', 'Cedar Crown', 'Drift Peak', 'Elk Shoulder', 'Fern Gallery', 'Granite Nest', 'Hawk Step', 'Ivory Bluff', 'Juniper Rise', 'Kestrel Point',
  'Lantern Rock', 'Marble Brow', 'North Window', 'Opal Crest', 'Petrel Loft', 'Quartz Landing', 'Rain Shadow', 'Sable Edge', 'Thistle Top', 'Upper Reach',
];

export const SPONSORS = names.map((name, i) => ({ name, motto: FOR_HIRE, color: tones[i % tones.length], forHire: true }));

// Example — a village that has been taken:
// SPONSORS[0] = { name: 'Acme Robotics', motto: 'Friendly machines since 1999', color: [0.1, 0.4, 0.8], url: 'https://example.com', id: 'acme' };

/** The id of a village: given, or made from its name. */
export const sponsorId = (s) => (s.id || s.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
