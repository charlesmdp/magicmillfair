// The extras: what can be switched on over the game as it stands, each on its own — a ride, a rule, a page of
// figures. Nothing of an extra is loaded unless it is switched on, and none changes a file of the game: each
// plugs itself into the running game through what the game exposes (window.__mmf). With every switch off,
// the game is the game as it was.
//
//   import('./extras/index.js').then(({ loadExtras }) => loadExtras(app, { slide: false, caves: true, stats: true }));
//
// An extra is a module with `attach(app)`, which returns what it built (kept in app.extras[id]).
export const EXTRAS = {
  slide: { name: 'Mostly Down — the water slide', load: () => import('./slide.js') },
  pond: { name: 'The Endless Pond — three ponds: fifteen seconds, twenty, then as long as one can', load: () => import('./pond.js') },
  boats: { name: 'Harbor Heaven — radio-controlled boats on the pond', load: () => import('./boats.js') },
  hill: { name: 'Jump the Logs — up the slope while logs roll down it', load: () => import('./hill.js') },
  crack: { name: 'Bouncy Rock — up a cleft between two needles of rock, from wall to wall', load: () => import('./crack.js') },
  hollow: { name: 'The Nuclear Cave — a race flown under the ground, one lap against the clock', load: () => import('./hollow.js') },
  waves: { name: 'Big Tsunami — the sea comes in over a bank of sand: jump what comes', load: () => import('./waves.js') },
  lava: { name: 'No Touch Lava! — basalt columns in a crater, and lava that only rises', load: () => import('./lava.js') },
  hive: { name: "Bee Fly — four combs over the sea: the cell one stands on gives way", load: () => import('./hive.js') },
  flip: { name: 'Mostly Up & Down — one runs by oneself, and turns gravity over', load: () => import('./flip.js') },
  spiral: { name: 'Spiral of Death — a track wound round a tower, up to its bell', load: () => import('./spiral.js') },
  cars: { name: 'Karting Simulator — radio-controlled cars raced on a table, seen from above', load: () => import('./cars.js') },
  golf: { name: 'Balthazar Golf — nine holes of crazy golf round the acid pond', load: () => import('./golf.js') },
  ages: { name: 'War Through the Ages — two armies on one road, from the stone age to the atom: units, turrets, and an age to reach before the other does', load: () => import('./ages.js') },
  raft: { name: 'Wild River — a raft down a mountain river to the sea: rapids, rocks, falls', load: () => import('./raft.js') },
  walls: { name: 'Run the Walls — a ruin one crosses by running along its walls, from wall to wall, and winding time back after a fall', load: () => import('./walls.js') },
  sneak: { name: 'Robots Can See You — alleys patrolled by robots that see: one slips through unseen', load: () => import('./sneak.js') },
  mine: { name: 'Little Mine Train — a mine cart through the mountains: lean, brake, jump the gaps', load: () => import('./mine.js') },
  coaster: { name: 'Hold the Rails! — a roller coaster one drives oneself through every mountain: stray from the rails and one falls', load: () => import('./coaster.js') },
  sanctuary: { name: 'The Sanctuary — a great hall of stone: a church, a mosque and a synagogue under one roof', load: () => import('./sanctuary.js') },
  caves: { name: 'The caves are safe places: nearby chat only', load: () => import('./caves.js') },
  stats: { name: 'The game in figures: counters, the page /opendata', load: () => import('./stats.js') },
};

/** Switches on what `on` says ({ id: true }); returns what was built, by id. One that fails leaves the others alone. */
export async function loadExtras(app, on = {}) {
  const built = (app.extras ||= {});
  for (const id of Object.keys(EXTRAS)) {
    if (!on[id] || built[id]) continue;
    try { built[id] = (await (await EXTRAS[id].load()).attach(app)) || true; } catch (err) { console.error(`[extras] ${id}:`, err); }
  }
  return built;
}
