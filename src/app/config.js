// Switches of the game that are decided here, not by the visitor.
export const FEATURES = {
  // Who may leave their avatar and fly the camera about: 'everyone', or 'admin' (the administrator alone —
  // the button and the F key are then hidden from everybody else).
  freeCamera: 'admin',
  // The Sky Gate — the ring on the lawn that carries visitors to the villages on the mountains. While this is
  // false it is not built and nothing offers the journey (the villages stay where they are, to be looked at
  // from below). ?sky=1 at the end of the address shows it to whoever types it.
  skyGate: false,
  // What a village costs, written by its name on the large map (false: its name alone).
  mapPrices: false,
};

/** Is the Sky Gate there for this visitor? */
export const skyGateOpen = () => FEATURES.skyGate || (typeof location !== 'undefined' && /[?&]sky=1\b/.test(location.search));
