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
  caves: true, // the caves are safe places: only those nearby hear what is said there (an extra)
  stats: true, // the game in figures: the counters and the page /opendata (an extra)
  sky: 'hidden', // the sky villages: 'hidden' (nothing of them), 'soon' (their gate, closed), 'open'
  userRooms: false, // rooms that players make for themselves
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
