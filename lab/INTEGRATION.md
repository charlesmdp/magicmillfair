# The extras: what is on this branch, and what it takes to make each part of the game

Everything here was added **without changing a file of the game**: only new files. Four things can be switched
on over the game as it stands, each on its own, and with every switch off the game is exactly the game as it was.

| Switch | What it is | Its files | Its checks |
|---|---|---|---|
| `slide` | **Mostly Down**, the water slide (third version: lanes, a pool of whirlpools, things that move) | `src/world/zones/games/slide/`, `src/extras/slide.js` | `node tools/slide-test.mjs` (69) |
| `oak` | **Out on a Limb**, the climb up the Great Oak (the old tree, twice as tall) | `src/world/zones/games/oak/`, `src/extras/oak.js`, `tools/oak-course.mjs` | `node tools/oak-test.mjs` (25) |
| `caves` | The caves are safe places: nearby chat only | `src/extras/caves.js` | `node tools/extras-test.mjs` (15, with the next) |
| `stats` | The game in figures: counters, the page `/opendata`, a line in the settings | `src/extras/stats.js`, `server/stats.js`, `public/opendata/`, `public/opendate/` | the same |

Also here: the icon (`lab/favicon/`, the "reactor" colours), the lab page with its switches (`lab/`), a server
for the lab (`lab/worker.js`, `lab/wrangler.jsonc`).

## Switching them on in the game: one line

An extra is a module with `attach(app)`: it plugs itself into the running game through what the game already
exposes (`window.__mmf`). `src/extras/index.js` loads those that are switched on — nothing of the others is
downloaded. In `src/main.js`, once the game runs (after `app.ready = true`):

```js
import('./extras/index.js').then(({ loadExtras }) => loadExtras(app, { slide: false, oak: false, caves: true, stats: true }));
```

That object is the whole of "with or without the slide, with or without the oak": it can sit in
`src/app/config.js` (`FEATURES.extras`), or come from the server (`/api/status`) so that a game is opened
without a new build. Releasing the slide one day and the oak the next is changing a `false` into a `true`.

Each can also be built into the game properly (its own lines in `GamesZone.js` and `main.js`): for the slide
that is described below; for the others the extra is the integration.

## Trying them

```bash
npx vite --config lab/vite.config.js
```

then open `/lab/`. It is the whole game, with a small panel ("LABO") of four switches and two buttons that take
one to the slide and to the oak. The switches are also in the address: `/lab/?slide=0&oak=1`. On that page
anyone may fly the camera (F).

## Mostly Down — the water slide

1,160 m from the rim of the cliffs above the golden dog down to the sea. The third version adds, to the stream,
the jump, the whirlpools and the gaps of the second:

- **Three lanes** (56 m): rows of blocks part the trough, which opens out to twice its width; each lane has its
  own things in it (rolls to jump, bars that slide across, arms that turn, blocks to go round). One picks a lane
  quickly; where a row of blocks stops, nine metres are open: whoever aims well changes lane.
- **A pool of three whirlpools** (27 m, sunk under the stream): a way between them, for who finds it.
- **Whirlpools that are holes**, not pictures: a funnel of water that turns, with a lip of foam; five more sit in
  small pools on the outside of bends, where a rider who lets go is carried.
- **Things that move**: bars sliding from side to side, arms turning about a post — on the clock of the ride, the
  same for everybody.
- **Wider and narrower places**: the trough is 4.3 m across where it is plain, 8.5 m at the lanes.

Times (`botRun`): a careful rider 0:59.4, a bold one through both shortcuts 0:50.7, someone who touches nothing
1:39 (into 3 whirlpools and 18 other things).

To build it into the game rather than switch it on, the session follows the pattern of the race:
`open(player, io)` returns a session that is also the driver of the player —
`{ step(dt, player, control), camera(camera, dt), line, over, time (ms), ended, exit, drop(player), close() }` —
and `src/extras/slide.js` (60 lines) is exactly what `main.js` has to do with it: `over` (the clock has stopped:
send the score), then `ended` a second later (`session.drop(player)`: in the sea, facing the beach). Its board:
`this.slide.board = this.scoreStand('slide', spot.x, spot.z, spot.yaw, { title: 'MOSTLY DOWN', sub: 'from the top to the sea · best times', format: formatTime })`
with `spot = this.slide.boardSpot` and `new Slide(world, { board: false })`.

What to know: time advances in steps of 1/120 s whatever the frame rate (the same run on every device); tuning
is `RIDE` in `ride.js` and `SLIDE` / `COURSE` in `track.js`, then `node tools/slide-test.mjs`; nobody walks on
the deck or in the trough (no collider); other visitors are seen sliding but in their ring only on one's own
screen; not tried on a real phone.

## Out on a Limb — the Great Oak

The old tree of the clearing, **twice as tall (70 m) and twenty metres towards the mountain**, and a way up it:
66 m from a plate on the ground to a crow's nest and its bell, against the clock.

- **Branches one walks along**, out from the stem to their tip, then — a jump from tip to tip — back in along
  the next: 30 of them, straight, L, C, S, Z, hooks. One has to walk each to reach the next.
- **Dead wood** (9 branches, none at the foot, four in the top quarter): bare and grey, no leaf on it. It creaks
  when one sets foot on it and breaks 1.0 to 1.9 s later — the time to run its length and half a second — then
  grows back six seconds after.
- **Bracket fungi** for steps round the stem (35), six of them up through each deck.
- **Three nets** (11, 30 and 48 m) with a deck round the stem: a fall ends in the net below, never on the ground
  from higher than the first. A slip costs a part of the climb.
- **Harder with the height**: jumps from tip to tip from 36 % to 65 % of what a running jump can do, branches
  from 1.2 m to 0.8 m wide, more dead wood, less time on it. 184 m to walk on branches in all.
- On foot only, no jetpack at the tree; a cheat on (as for Mostly Up) and the time is not a record.

How it is made:

- `giant.js` moves and grows **the forest's own tree** in the running game (its matrices, its far picture, its
  place in the forest's grid, its trunk in the collisions) and takes off it the 55 small branches and 58 leaf
  cards that hang in the way; its trunk and its seven great limbs are left alone — the way goes round them, and
  they are solid. With the extra off, nothing of this happens: the old tree stands where it stood.
- `tree.js` works the way out from the tree's own skeleton (read back from its mesh): a search that takes a
  second or two and that two browsers might not finish the same way. So it is run once —
  `node tools/oak-course.mjs` — and **written down** (`route.js`, 53 KB): the game reads that, the same for
  everybody. After a change to `tree.js`, or to the old tree in `TreeBuilder.js`: run the tool again, then
  `node tools/oak-test.mjs` (which fails if what is written is not what `tree.js` gives). `--seed=N` tries
  another course; the seed kept is in `OAK.seed`.
- `Oak.js` builds what is added (a leader up to the top, the branches in the tree's own bark with moss where one
  walks, small tufts of the tree's own leaves, fungi, decks, nets, the nest, the gate) and times the climb. What
  happens is told through `oak.events` — `{ line, note, sound, started, finished(ms, clean) }` — like the other
  games.

Cost: 31 KB of code and course once compressed; built in half a second; 36,000 triangles and 28 meshes, hidden
beyond 200 to 420 m.

To make the move of the tree permanent instead (the layout's line `[-110, 138, 'elder', 1.05]` → `[-110, 158, 'elder', 2.1]`,
then the bakers): the extra would then find the tree already there and only prune it — but the forest gives
each tree a height of its own (±6 %) and one of two shapes at random; the extra sets both, which the layout
cannot. Leaving it to the extra is simpler.

Not done: the board of the best climbs (see below); others see one climb, but dead wood breaks on one's own
screen only; the round map (a picture drawn once) still shows the tree where it stood, twenty metres north;
not tried on a real phone.

## The caves are safe places

In a cave (what the game itself means by it: `player.cave`, under its roof — not on the mountain or on a stair
above it) the chat is on **"Nearby"** and stays there (an administrator's "Important" apart); a note and a line
in the chat say so on the way in: *"The Hidden Grotto: a safe place. In here only those nearby hear you…"*. And
what is said nearby **does not go through the rock**: a line "to those nearby" is shown only when both are in
the same cave or both outside — the server sends it to everybody within twenty metres, the browser of whoever
is on the steps above the grotto drops it.

To have the server itself not send it (rather than each browser not show it), `Room.around()` in
`server/protocol.js` would need to know the caves; it does not today.

## The game in figures

- `src/extras/stats.js` counts in the browser — keys (and taps), metres, time played, time on the move, one's own
  presses of the big red button — keeps its own sums, and tells the server about once a minute, with what the
  robot is counted as: its colour, phone / tablet / computer, the system, where the visitor first came from
  (the site that sent them, or `?utm_source=`). It adds "The game in figures" to the settings (the cogwheel),
  which opens the page in a window.
- `server/stats.js` keeps **sums only**: `GET /api/stats` gives them; `POST /api/stats` adds to them (a device
  is not counted twice, nor more than can be done in the time since it last said so);
  `POST /api/stats/set` — the owner's key — sets what was before the counting began
  (`{ "money": 1234.5, "passes": 12, "people": 5000 }`).
- `public/opendata/index.html` is the page (`/opendata`; `/opendate` leads to it): visitors now, today, this week,
  this month, ever; countries; keys, kilometres, hours played and on the move; presses of the button; what the
  shop earned and the Game Passes sold; robots by colour; devices, systems, where visitors come from; the last
  thirty days; and one's own figures. Without a server it says so and shows one's own.

Three lines make it part of the game's server:

1. `server/routes.js`, in `route()` before the shop: `const stats = await statsRoute(req, ctx); if (stats) return stats;`
   (`import { statsRoute } from './stats.js';`).
2. `server/shop.js`, where a payment is granted: `await noteSale(ctx.store, { cents, pass })` (`cents`: what
   came in, in cents of a dollar; `pass`: true when it is a Game Pass) — until then "earned" and "Game Passes
   sold" stay at what the owner set.
3. `server/api.js`: `/api/stats` is posted by `sendBeacon`, with `Content-Type: application/json`; nothing to
   change unless the limits per address should cover it too (the module has its own: one count per device every
   twenty seconds).

"Countries" also counts those of the visits the game has always noted (`visitors:days`, ninety days).

## The boards of the best times

Both games keep one's best time in the browser and show it on a board of their own. For the game's boards:

- `server/scores.js`, in `BOARDS`: `slide: { order: 'asc', min: 39_000, max: 3600_000 }` (the bold bot needs
  50.7 s) and `oak: { order: 'asc', min: 45_000, max: 6 * 3600_000 }` (the test's bot, which never hesitates,
  needs about 80 s). `server/catalog.js`: their names. `lab/worker.js` does this for the lab's server.
- `src/main.js`: `app.slideDone = (ms) => scoreGame('slide', SLIDE.name, ms, formatTime(ms))` and
  `app.oakDone = (ms) => scoreGame('oak', OAK.name, ms, formatTime(ms))` — the extras call them when a run ends —
  after `fair.boards.slide = new Scores('slide')` and the like, as for the race.

## The icon

`lab/favicon/`: the wheel in the colours of a reactor (four files). To adopt it, copy them over those of
`public/` (`favicon.svg`, `favicon-32.png`, `icon-192.png`, `apple-touch-icon.png`).

## The lab, and being its administrator

The lab page is the game plus the switches. Served as a static site it has no server: no rooms, no boards, no
administrator (hence the camera for everybody there). `lab/wrangler.jsonc` makes it a Worker of its own
(`magicmillfair-lab`: its own rooms and notebook, nothing shared with the game that is online):

1. In Cloudflare: *Workers & Pages → Create → Import a repository*, this repository, this branch; deploy command
   `npx wrangler deploy --config lab/wrangler.jsonc`.
2. *Settings → Variables and Secrets*: add the secret `ADMIN_KEY` (any long word).
3. In the lab's chat: `/admin <that word>`.
