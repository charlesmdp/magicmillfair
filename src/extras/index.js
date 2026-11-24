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
  pond: { name: 'The Endless Pond — round and round, every lap faster', load: () => import('./pond.js') },
  boats: { name: 'The Little Regatta — radio-controlled boats on the pond', load: () => import('./boats.js') },
  hill: { name: 'Uphill Battle — up the slope while logs roll down it', load: () => import('./hill.js') },
  crack: { name: 'Between a Rock — up a cleft of the sea cliff, from wall to wall', load: () => import('./crack.js') },
  hollow: { name: 'The Hollow Hill — a race flown under the ground, one lap against the clock', load: () => import('./hollow.js') },
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
