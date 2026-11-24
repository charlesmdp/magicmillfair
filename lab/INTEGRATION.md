# The extras: what is on this branch, and what it takes to make each part of the game

Everything here was added **without changing a file of the game**: only new files. Three things can be switched
on over the game as it stands, each on its own, and with every switch off the game is exactly the game as it was.

| Switch | What it is | Its files | Its checks |
|---|---|---|---|
| `slide` | **Mostly Down**, the water slide | `src/world/zones/games/slide/`, `src/extras/slide.js` | `node tools/slide-test.mjs` |
| `caves` | The caves are safe places: nearby chat only | `src/extras/caves.js` | `node tools/extras-test.mjs` (15, with the next) |
| `stats` | The game in figures: counters, the page `/opendata`, a line in the settings | `src/extras/stats.js`, `server/stats.js`, `public/opendata/`, `public/opendate/` | the same |

Also here: the icon (`lab/favicon/`, the "reactor" colours), the lab page with its switches (`lab/`), a server
for the lab (`lab/worker.js`, `lab/wrangler.jsonc`). What else lies under `lab/` is the lab's own (trials that
are not offered to the game).

## Switching them on in the game: one line

An extra is a module with `attach(app)`: it plugs itself into the running game through the `app` object (the
one the game keeps in `window.__mmf`). `src/extras/index.js` loads those that are switched on — nothing of the
others is downloaded. In `src/main.js`, once the game runs (after `app.ready = true`):

```js
import('./extras/index.js').then(({ loadExtras }) => loadExtras(app, { slide: false, caves: true, stats: true }));
```

That object is the whole of "with or without the slide": it can sit in `src/app/config.js`, or come from the
server so that a game is opened without a new build. Releasing the slide is changing a `false` into a `true`.
`loadExtras` can be called again later with more switched on: what is new is attached to the running game.

## Trying them

```bash
npx vite --config lab/vite.config.js
```

then open `/lab/`. It is the whole game, with a small panel ("LABO") of switches and a button that takes one to
the slide. The switches are also in the address: `/lab/?slide=0&caves=1`. On that page the visitor is the
administrator of their own browser (the camera with F, the whole shop, every gesture), and the build defines
`__LAB__` so that the game may go on exposing `window.__mmf` there once it no longer does in production.

## Mostly Down — the water slide

1,160 m from the rim of the cliffs above the golden dog down to the sea: the stream that carries, the walls that
slow, a jump, whirlpools that are holes in the water, gaps to fly over, two shortcuts, things that slide and turn
on the clock of the ride, a long pool of slack water — one plunges into it and is slowed — where three propellers
turn, each as wide as the pool (one gets by when a blade has just passed, or jumps it; a blade that comes at one
throws one back), with buffers between them that throw one back too, then a pool of three whirlpools — and an
end in the sea, a swim from the beach.

**Over the rim one is out of the trough, not out of the ride.** One flies — steering a little, a ring of light
showing where one is going to come down — and whatever trough one comes down into within the count (1.6 s),
one rides on from there; only who has found none is put back at the last arch. Two places are made for it: a
pipe runs beside the long pool, lower ("The Overflow": one jumps the rim of the pool to drop into it, skips the
propellers, and flies off its end back onto the slide); and in the Whirlpool, who slows down and goes over the
inner rim comes down on the turn below, a hundred metres on — flattened: most of the speed is gone. The count
(`RIDE.out` in `ride.js`) is what decides how much of the slide can be skipped: at 1.6 s nothing above the
Whirlpool, and its checks say so (at 2.5 s one could drop from turn to turn of every helix).

**It is still being changed in the lab**: leave its switch off until the owner says so. Its checks say what it
does at any time: `node tools/slide-test.mjs` (87).

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
   (`import { statsRoute } from './stats.js';`). `lab/worker.js` does the same for a Worker.
2. Where a payment is granted: `await noteSale(ctx.store, { cents, pass })` (`cents`: what came in, in cents of
   a dollar; `pass`: true when it is a Game Pass), and where one is given back
   `await noteRefund(ctx.store, { cents, pass })` — until then "earned" and "Game Passes sold" stay at what the
   owner set.
3. Whoever knows how many are connected may say so — `ctx.here = async () => number` — and the page shows that
   instead of its own estimate (the browsers heard from in the last minutes).

"Countries" also counts those of the visits the game has always noted (`visitors:days`, ninety days).

## The board of the slide's best times

The slide keeps one's best time in the browser and shows it on a board of its own. For the game's boards:

- `server/scores.js`, in `BOARDS`: `slide: { order: 'asc', min: 30_000, max: 3600_000 }` (`tools/slide-test.mjs`
  prints the rule from the course as it stands). `server/catalog.js`: its name. `lab/worker.js` does this for
  the lab's server.
- `src/main.js`: `app.slideDone = (ms) => scoreGame('slide', SLIDE.name, ms, formatTime(ms))` — the extra calls
  it when a run ends — after `fair.boards.slide = new Scores('slide')` and the like, as for the race.

## The icon

`lab/favicon/`: the wheel in the colours of a reactor (four files). To adopt it, copy them over those of
`public/` (`favicon.svg`, `favicon-32.png`, `icon-192.png`, `apple-touch-icon.png`).

## The lab, and being its administrator

The lab page is the game plus the switches. Served as a static site it has no server: no rooms, no boards, no
shared figures. `lab/wrangler.jsonc` makes it a Worker of its own (`magicmillfair-lab`: its own rooms and
notebook, nothing shared with the game that is online):

1. In Cloudflare: *Workers & Pages → Create → Import a repository*, this repository, this branch; deploy command
   `npx wrangler deploy --config lab/wrangler.jsonc`.
2. *Settings → Variables and Secrets*: add the secret `ADMIN_KEY` (any long word).
3. In the lab's chat: `/admin <that word>`.
