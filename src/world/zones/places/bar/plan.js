// The Velvet Gasket — its plan, in numbers and words alone (no renderer): where it stands, what is said there,
// what a number of its show is made of. Shared by what builds it (Bar.js), by the extra (src/extras/bar.js) and
// by the checks.
//
// A cabaret of robots in a cave of its own, under the southern slopes: one pays in flowers, one drinks oil
// ("Alcooil": the owner's own word — alcool + oil), and what the star of the house takes off on its little stage
// is hardware — a hat, a plate, a panel of her casing — until a smaller robot steps out of the shell. Asked for
// by the owner on 28 November 2026 ("un bar de strip tease pour robots où faut payer avec des fleurs, avec de
// l'alcooil, dans une grotte, caché"): a joke, and a clean one.
//
// The gallery runs due south from its mouth (x = AX all along, z grows as one walks in): everything below is
// written in the axes of the world.
export const AX = -65;
/** The floor of the room (m); the doorstep is a hand higher, level with the ground outside. */
export const FLOOR = 33.3;

export const BAR = {
  id: 'bar', name: 'The Velvet Gasket',
  // The cave, as the layout writes one (CAVES): [x, z, half width, floor, height of the roof]. A low passage, the
  // door, a vestibule, then the room — low and vaulted — and the stage at its far end.
  cave: {
    id: 'bar', name: 'The Velvet Gasket', open: 2.6,
    nodes: [
      [AX, 177.8, 1.7, 33.45, 2.7], [AX, 181.6, 1.6, 33.4, 2.6], [AX, 185.2, 1.65, 33.35, 2.6], [AX, 188.2, 2.6, FLOOR, 3.1],
      [AX, 192.6, 6.3, FLOOR, 4.6], [AX, 198.6, 6.9, FLOOR, 4.9], [AX, 204.4, 6.3, FLOOR, 4.7], [AX, 209.2, 4.8, FLOOR, 4.3],
    ],
    lights: [], // (its light is its own: see LAMPS)
  },
  mouth: { x: AX, y: 33.45, z: 177.8 },
  // What the game calls the place (not on the map: `hidden`) — the caves' rule names it when one walks in.
  zone: { id: 'bar', name: 'The Velvet Gasket', x: AX, z: 195, r: 18, hidden: true },
  // Outside: nothing but a slab of rock fallen from the face, two boulders, and a small red lantern behind them
  // that is lit only for who comes near.
  lantern: { x: -66.55, y: 35.6, z: 177.25, seen: 22 },
  slab: { x: -64.9, z: 174.7, w: 5.0, h: 4.4, t: 1.5, yaw: 0.06, lean: 0.16 },
  rocks: [[-69.5, 175.2, 1.35, 3], [-60.2, 174.5, 1.25, 11]], // x, z, size, which lump
  // The door, across the passage; its leaf swings into the vestibule. The hatch is in the plank wall beside it.
  door: { z: 185.6, x0: -66.1, x1: -64.95, height: 2.05, reach: 2.7 },
  hatch: { x: -64.1, y: 1.42, w: 0.46, h: 0.2 },
  doorman: { name: 'Hinge', title: 'Doorman', x: -64.1, z: 186.45 },
  cover: 3, // flowers
  // The counter, along the east wall; the barman behind it, the bottles behind him, the slate over them.
  counter: { x: -60.7, z0: 192.9, z1: 198.3, height: 1.06, depth: 0.62, reach: 1.7 },
  barman: { name: 'Sump', title: 'Barman', x: -59.75, z: 195.6 },
  most: 3, // drinks a night
  sway: 60, // seconds the world sways after a glass
  // The stage, at the far end.
  stage: { x0: -68.3, x1: -61.7, z0: 204.3, z1: 208.6, height: 0.55, reach: 2.6 },
  star: { name: 'Miss Peony Piston', title: 'Tonight', x: AX, z: 206.5 },
  // Round tables, each with its lamp; the chairs look at the stage. `guest`: a robot of the house sits there
  // (its colour, its hat, its paint); the others are free.
  tables: [[-68.6, 199.6], [-63.4, 200.7], [-66.9, 195.0]],
  chairs: [
    { x: -69.5, z: 198.6, yaw: 0.35, guest: { color: 2, hat: 'cowboy' } }, { x: -67.6, z: 198.5, yaw: -0.2, guest: { color: 5, hat: 'party', paint: 'disco' } }, { x: -68.7, z: 200.9, yaw: 0.1 },
    { x: -64.4, z: 199.7, yaw: 0.25, guest: { color: 9, hat: 'beanie' } }, { x: -62.5, z: 199.8, yaw: -0.3 }, { x: -63.3, z: 202.0, yaw: 0 },
    { x: -67.9, z: 194.0, yaw: 0.3 }, { x: -65.9, z: 194.1, yaw: -0.25, guest: { color: 12, hat: 'sombrero', paint: 'candy' } },
  ],
};

/** The lamps of the place: what paints its light. [x, y over the floor, z, power, reach (m), [r, g, b]]. */
export const LAMPS = [
  [AX, 2.35, 185.05, 0.55, 2.6, [1, 0.22, 0.16]], // over the door, outside it: red
  [-65.6, 2.3, 187.6, 0.6, 3.2, [1, 0.6, 0.3]], // the vestibule
  [-68.6, 1.0, 199.6, 0.8, 2.9, [1, 0.36, 0.2]], [-63.4, 1.0, 200.7, 0.8, 2.9, [1, 0.36, 0.2]], [-66.9, 1.0, 195.0, 0.8, 2.9, [1, 0.36, 0.2]], // the tables
  [-60.6, 2.2, 194.2, 0.8, 3.2, [1, 0.66, 0.34]], [-60.6, 2.2, 197.0, 0.8, 3.2, [1, 0.66, 0.34]], // over the counter
  [-60.4, 3.0, 195.6, 0.6, 3.8, [1, 0.14, 0.16]], // the sign
  [AX, 0.75, 204.0, 1.15, 4.6, [1, 0.74, 0.38]], [-67.2, 0.75, 204.1, 0.6, 3.4, [1, 0.74, 0.38]], [-62.8, 0.75, 204.1, 0.6, 3.4, [1, 0.74, 0.38]], // the footlights
  [AX, 3.3, 206.0, 1.25, 3.6, [1, 0.86, 0.7]], // the spot over the stage
  [-71.3, 2.2, 196.4, 0.5, 3.0, [1, 0.26, 0.18]], [-71.1, 2.2, 202.2, 0.5, 3.0, [1, 0.26, 0.18]], [-58.9, 2.2, 201.6, 0.5, 3.0, [1, 0.26, 0.18]], // red lamps on the walls (the last three: Bar.js hangs them)
];

/** The card, as the slate has it (the first line is the house's word for what it pours). */
export const CARD = {
  title: 'ALCOOIL',
  drinks: [
    ['Crude on the Rocks', 'unrefined, like the regulars'],
    ['Two-Stroke Martini', 'shaken, not seized'],
    ['Sunflower Spritz', 'pressed from your flowers'],
    ['Castor Royale', 'for a squeaky evening'],
    ['10W-40 Reserve', 'a good year for viscosity'],
    ['Unleaded Lemonade', 'for small bolts'],
  ],
  foot: 'One flower a glass · three a night',
};

/** What is said. */
export const LINES = {
  where: 'No flowers, no show. They grow wild in the meadows — poppies, daisies, cornflowers. Pick three and knock again.',
  few: (n) => `That is ${n === 1 ? 'one flower' : `${n} flowers`}. The cover is three. The meadows are full of them.`,
  welcome: 'Three flowers. In you go — and mind your head, the roof is low.',
  back: 'You again. The cover is paid: in you go.',
  peek: ['Password? There is none. The cover is three flowers.', 'Evening. Three flowers, and the door opens.', 'Hands where I can see them. Flowers in them, ideally.'],
  drink: (name) => `One ${name}. Mind the fumes.`,
  dry: 'No flower, no glass. One flower a glass: house rule.',
  enough: 'That is enough oil for one night. Come back when your gears have settled.',
  barman: ['What will it be? One flower a glass.', 'The card is on the slate. All of it is oil.', 'We press the flowers, you see. Nothing is wasted here.'],
  down: 'The curtain is down. Keep your flower for the next number.',
  none: 'A flower for the stage? You have none left. They grow in the meadows.',
  thrown: 'Bravo! A flower lands on the stage.',
  announce: 'Ladies and gentlebots: Miss Peony Piston!',
  pieces: ['Oh! My hat.', 'Whoops — a shoulder plate.', 'My chest panel! Mind the cogs.', 'My back plate… yes: I am wound by hand.', 'Ta-da!'],
  bow: 'Thank you, thank you. She is here every two minutes.',
};

/**
 * The show: a number, then a pause, for ever — by the clock everybody shares, so that everybody in the room sees
 * the same step at the same moment. Seconds from the start of a turn.
 */
export const SHOW = {
  number: 84, pause: 36,
  rise: [1.5, 4.5], // the curtain goes up…
  fall: [79, 83], // …and comes down
  // what comes off, and when: the hat, a shoulder plate, the chest panel, the back plate — and the shell itself
  off: [14, 25, 36, 47, 61],
  pieces: ['hat', 'plate', 'chest', 'back', 'shell'],
  roll: [[0, 3], [58, 61]], // the drum rolls
  turn: [43.5, 51.5], // she shows her back
  bow: 73,
};
const ramp = (a, b, x) => (x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a));
export const smooth = (a, b, x) => { const t = ramp(a, b, x); return t * t * (3 - 2 * t); };
const STEPS = ['roll', 'fans', 'hat', 'plate', 'chest', 'back', 'drums', 'out', 'bow', 'curtain', 'pause'];
/**
 * Where the show is at `ms` of the clock: { t (s into the turn), on (a number is playing), step (its name), n (how
 * many pieces are off: 0 … 5), curtain (0 down … 1 up), turn (the turn's number) }.
 */
export function showAt(ms) {
  const T = SHOW.number + SHOW.pause, s = ms / 1000, turn = Math.floor(s / T), t = s - turn * T;
  const on = t < SHOW.number;
  let n = 0;
  if (on) for (const at of SHOW.off) if (t >= at) n++;
  const curtain = on ? smooth(SHOW.rise[0], SHOW.rise[1], t) * (1 - smooth(SHOW.fall[0], SHOW.fall[1], t)) : 0;
  let step = 'pause';
  if (on) step = t < SHOW.roll[0][1] ? 'roll' : t >= SHOW.fall[0] ? 'curtain' : t >= SHOW.bow ? 'bow' : n === 5 ? 'out' : t >= SHOW.roll[1][0] ? 'drums' : STEPS[1 + n];
  return { t, on, step, n, curtain, turn };
}

/** How many flowers a bouquet holds: what was picked — or, for a bouquet somebody gave, the seven it is drawn with. */
export const GIVEN = ['poppy', 'cornflower', 'buttercup', 'daisy', 'foxglove', 'lavender', 'poppy'];
export const flowersOf = (look) => (!look?.bouquet ? 0 : look.kinds?.length ? look.kinds.length : GIVEN.length);
/** Takes `n` flowers out of the bouquet (the last ones picked); returns their kinds, or null if it holds fewer. */
export function spend(look, n) {
  if (flowersOf(look) < n) return null;
  const kinds = look.kinds?.length ? look.kinds : GIVEN, left = kinds.slice(0, kinds.length - n), gone = kinds.slice(kinds.length - n);
  // (a bouquet is spent as the game spends one: no flower left, no bouquet — the plaques and the dog do the same)
  if (left.length) look.kinds = left; else { look.bouquet = false; look.kinds = undefined; }
  return gone;
}

/** The vault of the gallery, as Caves.js builds it: its height `d` metres aside of the axis, where the gallery is `r` wide and `roof` high. */
export const vault = (roof, r, d) => roof * Math.max(0, 1 - (d / r) ** 2) ** 0.275;
