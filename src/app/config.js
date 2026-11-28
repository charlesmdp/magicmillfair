// Switches of the game that are decided here, not by the visitor.
export const FEATURES = {
  // Who may leave their avatar and fly the camera about: 'everyone', or 'admin' (the administrator alone —
  // the button and the F key are then hidden from everybody else).
  freeCamera: 'admin',
  // What a village costs, written by its name on the large map (false: its name alone).
  mapPrices: false,
};

// What is released. The code of a novelty is delivered switched off; the owner switches it on from the page
// /admin, the server keeps the switch (server/release.js) and every browser is told at once — no new delivery.
// Below: what each switch is worth where nobody has decided anything yet. A browser with no server behind it
// (plain files, a development page) has nothing switched on: the game as it was. Every future switch goes here.
export const RELEASE = {
  slide: false, // Mostly Down, the water slide (an extra: src/extras)
  pond: false, // The Endless Pond: three circuits on the Great Pond, run for as long as one can (an extra)
  boats: false, // Harbor Heaven: radio-controlled boats racing on the Great Pond (an extra)
  hill: false, // Jump the Logs: up a long slope while logs, barrels and boulders roll down it (an extra)
  crack: false, // Bouncy Rock: up a cleft between two needles of rock, from wall to wall (an extra)
  hollow: false, // The Nuclear Cave (it was The Hollow Hill): a race flown under the ground, one lap against the clock (an extra)
  waves: false, // Big Tsunami: on a bank of sand off the north beach the sea comes in — one holds as long as one can (an extra)
  lava: false, // No Touch Lava!: basalt columns in the crater of a volcano off the pier head, and lava that only rises (an extra)
  hive: false, // Bee Fly: four combs over the sea, and the wax one stands on gives way (an extra)
  flip: false, // Mostly Up & Down: one runs by oneself in a machine along the pier, and turns gravity over (an extra)
  spiral: false, // Spiral of Death: a track wound round a tower in the bay, up to its bell (an extra)
  cars: false, // Karting Simulator: radio-controlled cars raced on a table, seen from above (an extra)
  golf: false, // Balthazar Golf: nine holes of crazy golf round the acid pond (an extra)
  ages: false, // War Through the Ages: two armies on one road, from the stone age to the atom: units, turrets, and an age to reach before the other does (an extra)
  raft: false, // Wild River: a raft down a river in its own canyon, on a headland north of the golden dog, to the sea (an extra)
  walls: false, // Run the Walls: a ruin one crosses by running along its walls, from wall to wall, and winding time back after a fall (an extra)
  sneak: false, // Robots Can See You: alleys patrolled by robots that see: one slips through unseen (an extra)
  mine: false, // Little Mine Train: a mine cart through the mountains: lean, brake, jump the gaps (an extra)
  coaster: false, // Hold the Rails!: a roller coaster one drives oneself through every mountain: stray from the rails and one falls (an extra)
  sanctuary: false, // The Sanctuary: a great hall of stone in the mountain — a church, a mosque and a synagogue under one roof, and its deep music (an extra; a place, not a game)
  guide: true, // Barnaby the butler: a robot in a dinner suit and a top hat by the carport of the mill, who sends whoever arrives to the games — "free to try" (an extra; the owner asked for him to be there)
  plane: true, // a plane in the sky: it crosses high over the oasis every five minutes, and whoever looks at it is told what their robot thinks of it (an extra; the owner asked for it to be there)
  caves: true, // the caves are safe places: only those nearby hear what is said there (an extra)
  stats: true, // the game in figures: the counters and the page /opendata (an extra)
  stars: true, // the stars of the big attractions on the map, with their names (off: the map names its places only)
  newsBoards: true, // the three wooden boards of what is new, by the poppy field (off: taken away at once, in every browser — no refresh)
  plaqueWall: false, // the wall of the companions: 324 more plaques (no. 73 to 396) on four galleries in the cliff round the golden dog, and the stair up to them — shown and sold only while on (off: gone at once, no refresh)
  sky: 'hidden', // the sky villages: 'hidden' (nothing of them), 'soon' (their gate, closed), 'open'
  userRooms: false, // rooms that players make for themselves
  // any name written in the address (?room=a-name) is a room of its own, free. Off — as the fair is delivered —
  // only the common rooms exist, for everybody but the owner. (A server started with FREE_ROOMS=1 has it on
  // where nobody decided: the tests and the development server are.)
  freeRooms: false,
  dive: false, // diving under the water — where it is deep one goes under and swims in three dimensions — and a secret cave under the sea, to be found (an extra; a place, not a game)
};
export const SKY_STAGES = ['hidden', 'soon', 'open'];
/** Switches made clean: only those above, each of its kind; what is missing or wrong is as in `base`. */
export function cleanRelease(given, base = RELEASE) {
  const out = { ...base };
  if (!given || typeof given !== 'object') return out;
  for (const k of Object.keys(RELEASE)) {
    if (k === 'sky') { if (SKY_STAGES.includes(given[k])) out[k] = given[k]; } else if (typeof given[k] === 'boolean') out[k] = given[k];
  }
  return out;
}

/**
 * Does the address ask to see the sky villages ahead of everybody (?sky=1)? Granted to the administrator only —
 * and on a development page (see main.js): for everybody else the switch `sky` above decides.
 */
export const skyAsked = () => typeof location !== 'undefined' && /[?&]sky=1\b/.test(location.search);
