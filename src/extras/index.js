// The extras: what can be switched on over the game as it stands, each on its own — a ride, a rule, a page of
// figures. Nothing of an extra is loaded unless it is switched on, and none changes a file of the game: each
// plugs itself into the running game through what the game exposes (window.__mmf). With every switch off,
// the game is the game as it was.
//
//   import('./extras/index.js').then(({ loadExtras }) => loadExtras(app, { slide: true, oak: false }));
//
// An extra is a module with `attach(app)`, which returns what it built (kept in app.extras[id]).
export const EXTRAS = {
  slide: { name: 'Mostly Down — the water slide', load: () => import('./slide.js') },
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
