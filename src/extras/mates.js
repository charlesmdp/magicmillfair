// Who plays what, with whom. Several visitors can be in one game at once — and must see one thing: those who
// share a run (the same round of the lava, the same start of the machine) are shown to each other, with their
// names; those who are in the same game but in another run — on other columns, at another metre — are not: one
// would see a robot run on nothing. Each browser says a few times a second which run of which game it is in,
// through the small message the relay hands on to those near (Presence.sendThing: the one the boats use).
//
//   const m = mates(app);
//   m.say(id, run, numbers)   while a run of game `id` is on: `run` is its instance — a start, a round; 0 when the
//                             game is one place for everybody (the sea of the waves) —, then up to six numbers of
//                             its own (which way up one is, how far one has come)
//   m.quiet()                 the run is over
//   m.of(id)                  → [{ id (of the visitor), peer, run, d (its numbers), mine (true: the same run as one's own) }]
//   m.names(id)               → the names of those who share one's run
//   m.watch(id, run)          one only watches game `id`, and is shown its run `run`: said every frame it is so
//   m.frame()                 every frame: who is hidden (see above), who is not any more
const KIND = 15; // (the relay's "kind" of this message: the boats have 1)
const SILENT = 2500; // ms without a word: that visitor is not in a game any more
// (the place of a game in this list is its number on the wire: only ever add at the end)
const GAMES = ['waves', 'lava', 'hive', 'flip', 'spiral', 'cars', 'golf', 'ages', 'raft', 'walls', 'sneak', 'mine', 'coaster', 'slide', 'pond', 'hill', 'crack', 'hollow', 'boats'];

export function mates(app) {
  if (app.mates) return app.mates;
  const heard = new Map(); // visitor → { game, run, d, at }
  const watched = new Map(); // game → { run, at }: the run of it one is shown while one only watches
  let wired = null, mine = null, told = 0;
  const wire = () => {
    const p = app.presence;
    if (!p || wired === p) return;
    wired = p;
    p.on('thing', (e) => {
      if (e.kind !== KIND || !Array.isArray(e.d)) return;
      const game = GAMES[e.d[0]];
      if (game) heard.set(e.id, { game, run: e.run, d: e.d.slice(1), at: performance.now() });
    });
    p.on('leave', (peer) => heard.delete(peer.id));
  };
  const fresh = (h) => performance.now() - h.at < SILENT;
  const m = {
    say(game, run, numbers = []) {
      wire();
      const k = GAMES.indexOf(game), n = Math.max(0, Math.floor(run) || 0) % 0xffffffff;
      mine = { game, run: n };
      const t = performance.now();
      if (k < 0 || t - told < 320) return;
      told = t;
      app.presence?.sendThing?.(KIND, n, [k, ...numbers.slice(0, 6).map((v) => (Number.isFinite(v) ? v : 0))]);
    },
    quiet() { mine = null; told = 0; m.frame(); },
    /** One does not play `game`, but is shown its run `run` (the round the others are in): only those of that run are seen in it. Said every frame it is so. */
    watch(game, run) { watched.set(game, { run, at: performance.now() }); },
    of(game) {
      wire();
      const list = [], peers = app.presence?.peers;
      if (!peers) return list;
      for (const [id, h] of heard) {
        if (h.game !== game || !fresh(h)) continue;
        const peer = peers.get(id);
        if (peer) list.push({ id, peer, run: h.run, d: h.d, mine: !!mine && mine.game === game && mine.run === h.run });
      }
      return list;
    },
    names(game) { return m.of(game).filter((o) => o.mine).map((o) => o.peer.name); },
    /** The run of `game` that most of those who play it now are in (to join them, or to watch them): { run, n, d } or null. */
    live(game) {
      const count = new Map();
      for (const o of m.of(game)) { const c = count.get(o.run) || { run: o.run, n: 0, d: o.d }; c.n++; count.set(o.run, c); }
      let best = null;
      for (const c of count.values()) if (!best || c.n > best.n || (c.n === best.n && c.run > best.run)) best = c;
      return best;
    },
    frame() {
      const peers = app.presence?.peers;
      if (!peers) return;
      for (const [id, h] of heard) if (!fresh(h)) heard.delete(id);
      for (const peer of peers.values()) {
        const h = heard.get(peer.id);
        // (hidden: in my game, but not in my run — or in a game I watch, but not in the run I am shown. Who merely
        // walks by, or plays something else, is seen as ever)
        let hide = false;
        if (h && mine && mine.game === h.game) hide = h.run !== mine.run;
        else if (h) { const w = watched.get(h.game); hide = !!w && performance.now() - w.at < 500 && h.run !== w.run; }
        if (hide !== !!peer.hidden) peer.hidden = hide;
      }
    },
  };
  app.mates = m;
  app.world.zones.push({ update: () => m.frame() });
  return m;
}
