# The extras: what is on this branch, and what it takes to make each part of the game

Everything here was added **without changing a file of the game**: only new files. Eight things can be switched
on over the game as it stands, each on its own, and with every switch off the game is exactly the game as it was.

| Switch | What it is | Its files | Its checks |
|---|---|---|---|
| `slide` | **Mostly Down**, the water slide | `src/world/zones/games/slide/`, `src/extras/slide.js` | `node tools/slide-test.mjs` |
| `pond` | **The Endless Pond**, three circuits on the Great Pond: fifteen seconds, twenty, then as long as one can | `src/world/zones/games/pond/`, `src/extras/pond.js` | `node tools/pond-test.mjs` (29) |
| `boats` | **The Little Regatta**, radio-controlled boats racing on the Great Pond | `src/world/zones/games/boats/`, `src/extras/boats.js` | `node tools/boats-test.mjs` (18) |
| `hill` | **Uphill Battle**, up a long slope while logs, barrels and boulders roll down it | `src/world/zones/games/hill/`, `src/extras/hill.js` | `node tools/hill-test.mjs` (12) |
| `crack` | **Between a Rock**, up a cleft between two needles of rock, from wall to wall | `src/world/zones/games/crack/`, `src/extras/crack.js` | `node tools/crack-test.mjs` (27) |
| `hollow` | **The Nuclear Cave** (it was The Hollow Hill), a race flown under the ground, one lap against the clock | `src/world/zones/games/hollow/`, `src/extras/hollow.js` | `node tools/hollow-test.mjs` (32) |
| `caves` | The caves are safe places: nearby chat only | `src/extras/caves.js` | `node tools/extras-test.mjs` (15, with the next) |
| `stats` | The game in figures: counters, the page `/opendata`, a line in the settings | `src/extras/stats.js`, `server/stats.js`, `public/opendata/`, `public/opendate/` | the same |

`node tools/games-test.mjs` (16) plays the cleft, the cave, the slope and the first two ponds in the running game, in a
headless browser: with every switch off nothing of them is there; switched on they are built, offered at their gates,
played by their own bots, and the player is let go where it should be.

Also here: the icon (`lab/favicon/`, the "reactor" colours), the lab page with its switches (`lab/`), a server
for the lab (`lab/worker.js`, `lab/wrangler.jsonc`). What else lies under `lab/` is the lab's own (trials that
are not offered to the game: `lab/oak/floor/` is one floor of the oak, tried again — on a limb one cannot fall,
the game is the jump from limb to limb with a ring of light that shows where it ends, the camera stays outside
the tree; `node lab/oak/floor/test.mjs`).

**Seven more games are extras of the game, each behind a switch that is off as delivered** — Wave Goodbye
(`waves`: a bank of sand and the sea of everybody), Thin Crust (`lava`: the lava rises, columns come up out of
it), The Bee's Knees (`hive`: four combs of wax that give way underfoot), Head Over Heels (`flip`: a runner who
turns gravity over in a machine of travelling girders), A Turn for the Worse (`spiral`: a track wound round a
tower), Round the Bend (`cars`: radio-controlled cars seen from above) and Par for the Course (`golf`: nine holes
of crazy golf round the acid pond). They were tried on this page first, then put in the game when their owner
asked: their files are with the other games (`src/world/zones/games/<id>/`, `src/extras/<id>.js`,
`tools/<id>-test.mjs`), the game keeps their boards of scores as it does for the six games above, and
`lab/GAMES.md` says what each is and how it is checked.

## Switching them on in the game: one line

An extra is a module with `attach(app)`: it plugs itself into the running game through the `app` object (the
one the game keeps in `window.__mmf`). `src/extras/index.js` loads those that are switched on — nothing of the
others is downloaded. In `src/main.js`, once the game runs (after `app.ready = true`):

```js
import('./extras/index.js').then(({ loadExtras }) => loadExtras(app, { slide: false, pond: false, boats: false, hill: false, crack: false, hollow: false, caves: true, stats: true }));
```

That object is the whole of "with or without the slide": it can sit in `src/app/config.js`, or come from the
server so that a game is opened without a new build. Releasing the slide is changing a `false` into a `true`.
`loadExtras` can be called again later with more switched on: what is new is attached to the running game.

On the game's branch as it stands this is done already, from the switches of a release: `RELEASE` in
`src/app/config.js` and the list `EXTRA` in `src/main.js` — which know `slide`, `caves` and `stats` only. A game
of this page becomes one more switch by adding its name to both (`pond`, `boats`, `hill`, `crack`, `hollow`:
`false` to begin with). This branch merges into that one without a conflict, and its checks pass there.

## Trying them

```bash
npx vite --config lab/vite.config.js
```

then open `/lab/`. It is the whole game, with a small panel ("LABO") of switches and, beside each game, an arrow
that takes one to it. (`node lab/tools/static-site.mjs <folder>` builds the same page as a folder of plain files
that can be put on any host and opened without a server: see `lab/vite.static.config.js`.) The switches are also in the address: `/lab/?slide=0&caves=1`. On that page the visitor is the
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

## The Endless Pond

Three circuits along the east bank of the Great Pond, one after the other; a jetty leads to the first, and one
never begins anywhere else. On each the legs run by themselves, on stones that never move and on rafts of logs
that drift, and one jumps the gaps (again in the air: further), dives back down, slides, steps to the next ring.

| | rings | arms | for how long |
|---|---|---|---|
| The First Pond | one, of stones | a low beam (jumped) | 15 s |
| The Second Pond | stones outside, rafts inside | a curtain over the stones (slid under), a gate that swings over the rafts (neither jumped nor slid under) | 20 s |
| The Last Pond | stones, rafts, rafts | a low beam, a curtain, two gates — and faster each second, to thirteen metres a second | as long as one can |

On the second pond one has to change ring whether one wants to or not: a stretch of its stones is missing, far too
long to jump — there one is on the rafts — and when the gate swings over the rafts one is on the stones. When a
pond's time is up one runs out to a line of stones and along it to the next by oneself: nothing can happen on the
way, and it is not counted. Fireflies caught make lily pads, which put back on the circuit, once, who falls in.
What moves goes by the clock of the world: several visitors run at once, each with their own run.

Its score is how long one held, in milliseconds (it was laps); the extra calls `app.pondDone?.(ms, pond)` when a
run ends in the water (`pond`: 0, 1 or 2, the one reached). For the game's boards: `pond: { order: 'desc', min: 1000,
max: 3600_000 }` in `BOARDS`, and `app.pondDone = (ms) => scoreGame('pond', POND.name, ms, formatTime(ms))`.
The regatta keeps out of the three circuits (`REGATTA.keepOut`).

## The Little Regatta

Radio-controlled boats on the Great Pond, on the principle of the quad race: three laps of fourteen gates (two
buoys each), from before the circuit of The Endless Pond, west along the deck, through the neck of the pond into
its far half, round, and back along the south bank — a hundred and fifty-seven metres a lap. One steers from a
stand on the south bank, the camera riding low behind one's boat, against the clock and against three boats that
sail by themselves (one starts behind them). A boat gathers way, slides when thrown into a turn, bounces off the
bank, the buoys and the others, and has a burst of speed that comes back after a few seconds — how much of it
there is shows as a gauge at the end of the line of the run.

The boats are seen only by who races: each visitor has a race of their own (showing them to others would take a
message of the game's network, which an extra cannot add). The extra calls `app.boatsDone?.(ms, place)`; for the
game's boards `boats: { order: 'asc', min: 37_000, max: 1800_000 }` (the checks print the rule).

## Uphill Battle

A long open slope between the Great Pond and the old tree, sixty-six metres between two ropes, from an arch to a
bell. One runs up it; things come down it: logs lie across (jumped, or gone round), barrels wander from side to
side, boulders are wide — and neither is jumped. All are let go at the top, but the boulders are stopped two
thirds of the way down and the barrels one third: it gets worse as one climbs. What hits carries one back down a
few metres, never to the start.

**A start every ten seconds, each with its name** (Red, Blue, Green… as for the quad race): what rolls goes by the
clock of the world and the climbs leave together, so friends who take the same start run side by side with the
same logs coming at them. The action at the gate says which start is next and in how long.

The extra calls `app.hillDone?.(ms)`. For the game's boards: `hill: { order: 'asc', min: 9000, max: 600_000 }`
(the checks print the rule).

## Between a Rock

Two needles of layered rock stand in the sea before the cliff at the south end of the bay, and between them a
cleft: forty metres from the planks at its foot to a bell at the top. It is played like any game of walls:

- left and right: one walks on a ledge, steers a little in the air, and holds on to a wall;
- the jump: off the planks or a ledge it is a jump; off a wall it is a kick, which carries across to the other
  wall and up (1.7 m where the cleft is narrow, hardly a metre at the top);
- on a wall one slides: slowly while one holds towards it, faster with nothing held, fast where water runs down
  the rock; "down" lets go. Nobody climbs a single wall.

Seven ledges jut from the walls, to stand on and as roofs: stones come down by the clock of the world — along a
wall or down the middle, none below thirteen metres, more of them the higher one is — and a stone knocks one off:
for a moment one holds nothing, and falls. **There is no net**: who falls catches a wall again, lands on a ledge,
or goes back to the planks. The way of the next jump is drawn in dots before the climber; a trail of stardust
follows a kick. The checks have a climber that reads the cleft (12 to 15 s) and one that only hammers the jump
(it never leaves the planks: it takes a wall).

**What it adds to the world** (only when it is on): the two needles, their ledges, what grows on them, the fall
down the cliff behind (one group, `cleft`; the rock and the leaves are two materials of its own, which give them
a light of their own — the cleft is in the shade of the cliff all day —, and the water is the game's own falling
water, `fallsRibbon`); a walkway on piles from the sand of the beach to a landing before the cleft and the planks
between the needles — and, so that one can walk there, `collision.addPlatform` (the planks), `collision.addArea`
(a polygon round them) and two `collision.addBox` (the feet of the needles).

The extra calls `app.crackDone?.(ms)`. For the game's boards: `crack: { order: 'asc', min: 7000, max: 1800_000 }`.

## The Nuclear Cave

(It was The Hollow Hill. Its name changed, and what one sees and reads; in the code, in the storage and for its
board it is still `hollow`.)

A race flown under the ground: one lap of a great cave dug in the hill behind the sea cliff — a ring of galleries
and halls 558 metres round, from eight to thirty metres wide, never less than nine metres of rock over it, its
floor above the sea. Nothing of it shows outside but the mouth of a mine at the foot of the cliff, by the walkway
of the cleft, where one asks to fly (one is put in the Start Hall; a count of three; at the end one is put back
outside).

One flies by oneself and only steers — left and right, up and down — and bursts, on a gauge shown at the end of
the line of the run: a full one lasts three seconds, it comes back by itself in sixteen, and each of the eighteen
rings flown through gives a third of it back. The inside of a bend is the shorter way: in the Screw one gains a
quarter on who flies the middle. What one hits — columns, teeth of rock from the roof and from the floor, boulders,
arches over the lake, curtains of rock with one hole, beams of crystal — does not end the flight: it throws one
aside and halves one's speed, and the clock runs on. The walls rub. The flyer is thin (0.42 m round): what looks
like a way through is one. And what is flown past closely, without touching it, gives some burst back (a seventh
of the gauge, once a lap for each thing), as do the atoms: fifty-odd little green lights that lead into the rings
(a twentieth each).

The cave is a store of waste now: yellow drums in heaps by the walls and at the feet of the columns, pools that
glow green on the floor and light the rock round them, pipes along two galleries, a warning plate where each
stretch begins — all of it by the walls or on the floor, none of it in the way. The stretches are shown under
other names (`HOLLOW.titles`); the rules keep the old ones.

**The cave itself is drawn only for who flies in it** (`Hollow.inside`, a group made visible when a flight opens
and hidden when it closes): it lies under the hill, nobody else could see any of it, and left visible it was handed
to the graphics card whenever one looked towards the hill — 35 000 triangles and some twenty draw calls for nothing.
Hidden, it costs nothing; only the mouth of the mine is drawn (a few hundred triangles).

Ten stretches, each with its own light (painted in the vertices, like the game's other caves; the mesh casts no
shadow and is not in the shadow pass): The Start Hall, The Lantern Gallery, The Forest of Columns, The Teeth, The
Screw (once and a quarter round a pillar, going down, under glow-worms), The Lake, The Curtains, The Narrows, The
Crystal Hall, The Way Home.

The extra calls `app.hollowDone?.(ms, knocks)`. For the game's boards: `hollow: { order: 'asc', min: 15_000, max: 600_000 }`
(the bot's clean lap is 22.1 s; the checks print the rule). The flyer of another visitor is seen where the game
puts it, as for the slide: each has a flight of their own in the same cave.

## The keys of a game, at any time

While one of these games is on, a small button under the line of the run ("H · keys" — "? keys" on a phone) and
the H key show its keys again, a line for each, in a panel of their own (`src/extras/help.js`: `keysHelp(app).set(text)`
when a game opens, `.clear()` when it closes; the keys are given with " · " between them). The game's own games
could use the same two calls. The note of the game (`hud.note`) is one line, cut short on a narrow screen: that is
why the keys are not said there.

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
