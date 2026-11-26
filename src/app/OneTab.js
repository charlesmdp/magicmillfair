// One browser, one visitor. Two tabs of the same browser are the same person (the same name, the same purchases):
// only one of them plays — the one opened, or taken back, last. The others step aside: they let their place in the
// room go (nobody sees them, they see nobody), fall silent and stop drawing, and say "Open in another tab — play
// here"; a click there takes the game back, and the tab that had it steps aside in turn.
//
// The tabs speak to each other through a BroadcastChannel (the same browser, the same site: nothing goes through
// the network). Where there is none — or with ?tabs=many in the address, to try the game in several tabs at once —
// every tab plays, as before.
//
// Which claim is the last is counted on a clock of their own: a claim is later than every claim its tab has heard
// of (and than the time of day), so that "Play here" always wins — even in a tab that stayed open while the
// computer slept, whatever the clocks of the tabs say. A page that starts in the background (reloaded by itself
// for a new version, opened behind the others) first asks whether another tab plays, and steps aside if one does:
// it does not take the game from the tab one is looking at.
//
//   const tab = oneTab({ away, back, told })   away(): this tab must step aside; back(): it has the game again;
//                                                told('playing' | 'closed'): what a tab that stepped aside hears of
//                                                the one that plays — another one plays, or it was closed
//   tab.start()                                this page comes into the world: plays, unless (in the background)
//                                                another tab already does
//   tab.play()                                 this tab takes the game ("Play here"): the others step aside
//   tab.playing                                does this tab have the game?
const CHANNEL = 'mmf.tab';
const ASK_MS = 400; // (how long a page that starts in the background waits for a tab that plays to say so)

export function oneTab({ away = () => {}, back = () => {}, told = () => {}, many = false } = {}) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  let at = 0, seen = 0, playing = false, aside = false, asking = null, channel = null;
  if (!many) { try { channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null; } catch { channel = null; } }
  const post = (m) => { try { channel?.postMessage({ ...m, id }); } catch { /* the channel is closing */ } };
  const stepAside = () => { playing = false; if (!aside) { aside = true; away(); } };
  if (channel) {
    channel.onmessage = (e) => {
      const m = e.data;
      if (!m || typeof m !== 'object' || m.id === id) return;
      if (Number.isFinite(m.at)) seen = Math.max(seen, m.at);
      if (m.t === 'play' || m.t === 'here') {
        if (asking) { const done = asking; asking = null; done(true); return; } // (a page starting in the background: another tab plays)
        if (playing && m.t === 'play') {
          // (another tab took the game after this one did: this one steps aside — or, having taken it later, says so again)
          if (m.at > at || (m.at === at && m.id > id)) stepAside(); else post({ t: 'play', at });
        } else if (aside) told('playing');
      } else if (m.t === 'ask') {
        if (playing) post({ t: 'here', at });
      } else if (m.t === 'bye') {
        if (aside && !asking) told('closed');
      }
    };
    // (the tab that plays is closed, or goes to another page: the others are told — they say so, and wait for a click)
    addEventListener('pagehide', () => { if (playing) post({ t: 'bye' }); });
  }
  const tab = {
    get playing() { return playing; },
    /** This tab takes the game: the others step aside. */
    play() {
      asking = null;
      playing = true;
      at = Math.max(Date.now(), seen + 1);
      seen = at;
      post({ t: 'play', at });
      if (aside) { aside = false; back(); }
    },
    /**
     * This page comes into the world. In the foreground, it plays; in the background, only if no other tab does —
     * meanwhile it is aside without saying so (the page keeps its presence asleep: main.js), then either says that
     * it stepped aside (away) or plays (back).
     */
    start() {
      if (!channel || typeof document === 'undefined' || document.visibilityState !== 'hidden') { tab.play(); return; }
      aside = true;
      new Promise((done) => { asking = done; post({ t: 'ask' }); setTimeout(() => done(false), ASK_MS); })
        .then((other) => { asking = null; if (playing) return; if (other) away(); else tab.play(); });
    },
  };
  return tab;
}
