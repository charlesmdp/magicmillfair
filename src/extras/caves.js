// The caves as safe places, as an extra: in a cave, what one says is only heard by those nearby — the chat is
// on "Nearby" for as long as one is inside, and says so on the way in — and what is said in a cave stays in
// it: whoever is not in that cave does not get it, however near (on the steps over the grotto of the
// waterfall, say), and whoever is in it does not get what is said nearby outside.
//
// "In a cave" is what the game itself means by it (PlayerController.cave): under its roof — not on the
// mountain, or on a stair, above it. Plugged in from outside (window.__mmf): no file of the game is changed.
import { ZONES } from '../world/layout/layout.js';

const nameOf = (cave) => ZONES.find((z) => z.id === cave.name)?.name || 'A cave';

export function attach(app) {
  const { world, player, hud } = app, col = world.collision;
  let inside = null, before = 'all', patched = null;
  const hint = () => { if (!hud._chatTo && hud.chatInput) hud.chatInput.placeholder = 'In a cave: only those nearby hear you…'; };
  /** Which cave someone at (x, y, z) is in: the same test as for the visitor. */
  const caveOf = (q) => (Number.isFinite(q?.y) ? col.caveAt(q.x, q.z, q.y) : null);
  // what is said nearby does not go through the rock: a line "to those nearby" is shown only when both are in
  // the same cave, or both outside (announcements and lines to everyone are not concerned)
  const filter = (presence) => {
    if (patched === presence || !presence?._emit) return;
    patched = presence;
    const emit = presence._emit.bind(presence);
    presence._emit = (type, arg) => {
      if (type === 'chat' && arg?.near && !arg.important && caveOf(arg.peer) !== (player.cave || null)) return;
      emit(type, arg);
    };
  };
  world.zones.push({
    update: () => {
      filter(app.presence);
      const cave = player.cave || null;
      if (cave !== inside) {
        if (cave && !inside) before = hud.chatChannel === 'near' ? 'near' : 'all';
        inside = cave;
        if (cave) {
          const text = `${nameOf(cave)}: a safe place. In here only those nearby hear you — the chat stays on "Nearby" until you are out.`;
          hud.note(text, 7000);
          hud.addChat('✦', 5, text, true);
        } else {
          if (hud.chatChannel === 'near' && before !== 'near') hud._channel('all');
          hud.note('Out of the cave: everyone can hear you again.', 3500);
        }
      }
      // no talking to everyone from in here (an administrator's announcements apart)
      if (inside && hud.chatChannel === 'all') { hud._channel('near'); hint(); }
    },
  });
  return { get inside() { return inside; } };
}
