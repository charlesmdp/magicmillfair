// Who lives in the sky villages: thirty hamlets perched on the mountains, one for each company that wants
// its own. One line per village, in the order of the `sky` list of world.json (it starts in the north-west
// and goes round by the north and the east to the south-west).
//
//   name   what its sign says, and what the game announces on arriving (at most 22 characters)
//   motto  a second, smaller line on the sign (at most 34 characters)
//   color  [r, g, b] from 0 to 1: its roofs and its flag
//   url    optional: a web address offered to visitors by the sign ("Visit …"); https only
//   id     optional: what goes in the address of the game to arrive there directly (?village=id);
//          by default the name in lower case, with dashes
//
// Until a village is taken it carries a made-up name and says so.
const FOR_HIRE = 'This village is for hire';
const tones = [[0.72, 0.16, 0.12], [0.14, 0.38, 0.62], [0.86, 0.6, 0.1], [0.2, 0.5, 0.26], [0.5, 0.24, 0.56], [0.1, 0.5, 0.52], [0.85, 0.38, 0.12], [0.32, 0.34, 0.4]];
const names = [
  'Eagle Rest', 'Cloud End', 'High Meadow', 'Falcon Ledge', 'Mistfold', 'Sun Shelf', 'The Aerie', 'Starwatch', 'Windy Gap', 'Larkrise',
  'Stone Crown', 'Silver Step', 'Far View', 'Thunder Seat', 'Quiet Top', 'Heron Height', 'Old Summit', 'Goat Track', 'Blue Yonder', 'Dawn Terrace',
  'Raven Roost', 'Pine Balcony', 'Ember Ridge', 'Snow Lantern', 'Kite Hill', 'Echo Shelf', 'Long Look', 'Moon Porch', 'Swift Corner', 'Last Light',
];

export const SPONSORS = names.map((name, i) => ({ name, motto: FOR_HIRE, color: tones[i % tones.length] }));

// Example — a village that has been taken:
// SPONSORS[0] = { name: 'Acme Robotics', motto: 'Friendly machines since 1999', color: [0.1, 0.4, 0.8], url: 'https://example.com', id: 'acme' };

/** The id of a village: given, or made from its name. */
export const sponsorId = (s) => (s.id || s.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
