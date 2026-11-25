# Seven games being tried

Seven games made in the lab, for their owner to try and judge. **Nothing of them is in the game**: every file is in
this folder, and only the lab page switches them on (`lab/lab.js`: "★ …", and an arrow that takes one to each).
They borrow the *mechanics* of games one knows — never their look, their names or their levels. Five were made
first; their owner tried them, four were reworked after what was said (the waves, the lava, the gravity runner,
the spiral), the combs got a floor more, and two were added (the cars, the golf).

| Switch | What it is | Where it stands | Its checks |
|---|---|---|---|
| `waves` | **Wave Goodbye** — a bank of sand off the beach and the sea of everybody: one runs, jumps, is thrown back by what catches one, for as long as one can | the north beach: a bank at about (57, -56), the arch at (40.4, -62.4) | `node lab/games/waves/test.mjs` (35) |
| `lava` | **Thin Crust** — the lava only rises, columns come up out of it: one keeps to the summits, and keeps a way on | a small volcano east of the head of the pier, at (188, 8); the gate on the deck of the pier head at (142.4, 13.3) | `node lab/games/lava/test.mjs` (34) |
| `hive` | **The Bee's Knees** — four combs of wax over the sea: the cell one sets foot on gives way | the north of the bay: combs at (84, -84), the gate on the beach at (43.5, -79.5) | `node lab/games/hive/test.mjs` (29) |
| `flip` | **Head Over Heels** — one runs on the spot in a machine of travelling girders, and one key turns gravity over | a tall frame in the sea along the south side of the pier; the gate on the south beach at (41.1, 42.8) | `node lab/games/flip/test.mjs` (36) |
| `spiral` | **A Turn for the Worse** — a track wound round a tower: obstacles worse every turn, one touch and it is the foot again | a tower in the south of the bay, at (168, 84); the gate on the south beach at (52, 71) | `node lab/games/spiral/test.mjs` (33) |
| `cars` | **Round the Bend** — radio-controlled cars raced on a table, seen from above | the meadow north of the acid pond: a table at (-243.5, -55.8), the arch at (-243.5, -45.9) | `node lab/games/cars/test.mjs` (34) |
| `golf` | **Par for the Course** — nine holes of crazy golf round the acid pond | round the acid pond (-236, -82); the gate at (-225.5, -75.6) | `node lab/games/golf/test.mjs` (42) |

`node lab/games/browser-test.mjs` plays all seven in the running game, in a headless browser: before a game is
attached nothing of it is in the world; attached it is built, its board of scores by its gate, offered there,
played to the end by its own bot, its score told, kept and on its board, the player let go at the gate; left
half-way it leaves nothing behind.

**Each has its board of scores, as the games of the fair have**: the stand is the fair's own (today, this week,
this month, all time, under a marquee of bulbs — `GamesZone.scoreStand`), its lists are kept as the game keeps
them (by the server when it knows the board — the lab's own server does: `lab/worker.js` —, in this browser
otherwise), and a score goes there the way the game puts one (`app.scoreGame`: the note that says where one
stands, the line in the chat). All of that is done by the plug of this folder (`kit.js`), from the line each
game says in its rules (`BOARD`); no file of the game is changed.

**What the checks prove is that each game can be played — a bot does it — not that it is a pleasure to play.**
That is the owner's to say, game by game.

## How each is made

A folder for each, four files (see the top of `kit.js`, which they share):

- `rules.js` — its rules, without a renderer: time in steps of 1/120 s, a player that plays by itself;
- `<Name>.js` — what is seen of it, and a session that drives the player (the shape of `Hill.js`, of `Hollow.js`);
- `extra.js` — `attach(app)`: builds it in the running game and plugs it in (`plug`, in `kit.js`);
- `test.mjs` — its checks, without a browser; the last line it prints is its line for the boards of scores.

`kit.js` holds what they share (the plug into the game, the starts on the shared clock, the arch where one asks
to play, a sign on a stake), `check.mjs` what their checks share (the lines PASS / FAIL, the ground of the world).
`shots.mjs` takes pictures of a game in the running game: `node lab/games/shots.mjs waves far=30,26,-78,-115,-28
gate=gate a=play:8` (its top says how).

## Trying them

There is no site of the lab online. Two ways to have one:

- **Plain files, anywhere**: `node lab/tools/static-site.mjs <folder>` builds the lab page as a folder of plain
  files that works from any address and without a server (no rooms, no boards: one plays alone) —
  `lab/vite.static.config.js` is its build.
- **A Worker of its own on Cloudflare**, with multiplayer and boards: `lab/wrangler.jsonc` (three steps, at the end
  of `lab/INTEGRATION.md`). It is built again at every push to the lab's branch.

On a computer: `npx vite --config lab/vite.config.js`, then `/lab/`.

## When one of them is wanted in the game

It becomes an extra like the others — a switch, off to begin with:

1. its folder goes beside the other games (`src/world/zones/games/<id>/`: `rules.js`, `<Name>.js`), its plug to
   `src/extras/<id>.js` (with `kit.js` beside it, or what it uses of it), its checks to `tools/<id>-test.mjs`, and a
   line in `EXTRAS` (`src/extras/index.js`) — all of it the lab's, to do when its owner says so;
2. the game's own session then adds the switch (`RELEASE` in `src/app/config.js`, `EXTRA` in `src/main.js`), the
   board of scores on its server (the line each `test.mjs` prints, in `server/scores.js`; its name in
   `server/catalog.js`) and, if it wants to keep that board itself, `app.<id>Done = (score) => scoreGame('<id>', …)`
   — the plug then tells it the score instead of putting it on the board itself. Until `server/scores.js` knows a
   board, the game's own server refuses its scores: they are kept in the browser only.

## The games, one by one

### Wave Goodbye (`waves`)

*Rebuilt after its owner tried the first one ("c'est nul : more fun, better physics, movement, bigger waves").*

A bank of sand sixteen metres wide and nine deep lies off the north beach, a lagoon behind it, a neck of sand
to the beach (the arch at (40.4, -62.4)). The sea comes in over it, **the same for everybody** — it goes by
the clock of the world — and one jumps in **whenever one likes**. One runs anywhere on the bank (6.5 m/s),
jumps (1.25 m), jumps again in the air (2.4 m), steers in the air. Five kinds of wave, seen coming for five to
eight seconds: a roller (a metre, fast: a hop; they also come by twos and threes), a sweeper (its crest at an
angle: it crosses the bank from one side to the other), a wall (2.6 to 3.5 m, one low end: two jumps, or a hop
at the low end), a breaker (as tall, over half to two thirds of the width: one runs round it), and a great one
(4.6 m, slow, announced by a horn and by the sea drawing back: only through its one gap).

**A wave that catches one does not end the run**: it knocks one down and carries one towards the lagoon — 1.8 m
for every metre of wave —, head over heels; the backwash pulls a little seaward; one is up after a second or
so. Off the back of the bank, it is over: the score is how long one held. So where one stands is what one has
left: far forward there is room to be thrown back, but the waves stand tallest on the front edge and lose a
third crossing the bank.

The sea has a mood everybody shares, on a cycle of two and a half minutes: flat for thirteen seconds, building
to a hundred, wild to a hundred and thirty, then three great ones; the arch says where it is ("the sea:
building, wild in 45 s"). Who jumps into the wild sea is out in seconds; who wants a long run waits for the
lull.

A bot with a person's limits (one wave at a time, a third of a second to take in the next) holds 115 s from
the lull (the middle of three hundred runs; nine in ten are lost in the wild part, one in a hundred holds a
whole cycle) and 61 s from any moment; who stands still is carried off in 6 s. For the game's boards:
`waves: { order: 'desc', min: 2500, max: 900_000 }`.

What it adds to the world (only when it is on): the bank and its neck, the arch, the waves, foam and spray
(one group, `waves`) and one `collision.addPlatform`, so that one can walk out on the bank at any time.
What its maker could not see again after the last changes to its look: the whiter crests, the darker wet sand,
the runner lifted onto the water as it tumbles — to be looked at first.

### Thin Crust (`lava`)

*Reworked after its owner tried it ("the lava only rises, columns come up, one keeps to the summits").*

A small volcano stands in the sea east of the head of the pier ((188, 8); one asks to play on the deck of the
pier head, at (142.4, 13.3)); deep in its crater a pool of lava, and standing in it sixty-one columns of basalt,
six-sided. One runs and jumps on their tops. Heights are counted in levels: a jump climbs one level, never two;
any drop is fine. **The lava only rises** — a level at a time, in pulses, faster and faster — and a column
whose top it reaches is covered: whoever stands on it is out. Before each rise **new columns come up out of the
lava**: a glow shows where (the whiter, the higher), then they rise to at least one level above where the lava
is about to be, sometimes two, three or four. No column ever goes down. So the field becomes a relief of
terraces and summits that keeps climbing: what matters is to be high enough *and* to have a way on from where
one is. The score is how long one held; the camera follows the level.

A round leaves every ten seconds on the clock everybody shares, each start with its name, and what comes up in
a round is drawn from its number: the same for everybody who takes that start. What is fair in it: the columns
of a pulse come as small hills — a stair up from dry ground, a summit, lower steps round it, some missing. For
the first eight rises (a minute) the stairs are sure; later the hills are fewer and narrower, the notice
shorter; after the eighteenth rise nothing comes up any more. Lone tall columns, out of reach or with no way
on, are there from early on: to read the relief is the game.

Its bot held 90 s in the running game; who stands still is out at the first or second rise. For the game's
boards: `lava: { order: 'desc', min: 1000, max: 128_000 }`.

What it does not do: two visitors who took different starts stand in the same crater with different columns
under them (each browser draws its own round) — only those who leave together see the same thing.

### The Bee's Knees (`hive`)

Four round combs of wax, fifty-five cells each, hang one above the other over the sea in the north of the bay
(25, 19, 13 and 7 m up — the fourth was asked for by its owner after trying three), from a great crook of
timber with a straw skep at its tip; one asks to play on the sand of the north beach, at (43.5, -79.5). One
runs on the combs, and **the cell one sets foot on gives way**: it holds a moment — 0.65 s on the top comb,
then 0.6, 0.5 and 0.4 on the lowest — and drops, whether one is still on it or not; it does not come back.
Through a hole one falls to the comb below; from the last one, into the sea, and that is the run: how long one
held. A run is one's own, and starts when one asks.

One is not alone up there: on each comb a bee takes the wax apart by itself, on a path drawn from the seed of
the run — so nobody can stand and wait. Amber caps hold two seconds; on the three lower combs three cells of
royal jelly throw the first foot that touches them back up to the comb above, once. The camera looks down from
behind, towards the beach; the comb over one's head is hidden, those below are dimmed so that a hole reads as
a hole.

The bot holds 61 to 75 s over the twelve seeds of the checks; who stands still is in the sea in 6.5 s. A run
has an end whatever one does: the bees have landed on every cell by 76 s. For the game's boards:
`hive: { order: 'desc', min: 6000, max: 90_000 }`.

What it does not do: the broken cells are each player's own — another visitor is seen running on whole combs
and falling through solid wax, and friends do not break each other's cells (reading the place of the other
robots could do it: not tried). Runs differ by seed, so the board has some luck in it.

### Head Over Heels (`flip`)

*Reworked after its owner tried it ("four or five times as long, more room, a rhythm that quickens").*

A machine stands in the sea along the south side of the pier, ten metres off its head: a tall striped frame in
which painted girders travel from right to left, as the scenery does in the flying theatre (one asks to play on
the sand of the south beach, at (41.1, 42.8)). One runs in it on the spot, a third of the way from its left
end, faster and faster (7 m/s at the start, 17 at the end, over some 700 m of course), and has **one key: it
turns gravity over**. One then falls up to the underside of what is above — or back down onto what is below —
and runs on there, head down, in a space sixteen metres high with five or six levels of girders. Gravity is
turned over only while one's feet are on a girder (or have just left it), never in the air.

**Running into the end of a girder does not end the run at once**: the girder holds one back while the others
go by, and pushes one towards the left end of the machine. Freed in time — gravity turned over, most often —
one runs a little faster than the girders until one is back in one's place. Pushed out at the left end, or
fallen out above or below, one is put back at the last flag (the machine winds back) and the clock runs on.
Sparks hang along the less obvious ways: each one caught takes a quarter of a second off — they are what tells
the runs apart.

A start every ten seconds on the shared clock, each with its name: those who leave together see the same
girders, and a browser that is not playing shows the latest start. The bot's run: 56.6 s in the running game.
For the game's boards: `flip: { order: 'asc', min: 50000, max: 600000 }`.

What it does not do: **other visitors see the runner upright inside the ceiling** — the game's network does not
carry which way up one is (it would take a message of the game's own).

### A Turn for the Worse (`spiral`)

A striped helter-skelter stands on a stone plinth in the sea, in the south of the bay ((168, 84); one asks to
play on the sand of the south beach, at (52, 71)), and a track of planks winds up round it like a giant spiral
stair: six turns of sixty metres from the foot to a bell, forty-six metres higher. **One runs as the stick
asks** (its owner asked for that after trying legs that ran by themselves): pushed up, the legs run — a little
faster as one climbs —; let go, they stop within a quarter of a second; nobody runs back down. One steers across
the track (a rail on each side: nobody falls off it), jumps — as far as the run before it, and again in the
air, higher and further —, slides, dives back down, ducks when standing. So one may stop before what moves,
read it, and go: the clock is what that costs, and it starts with the first step of an attempt. **What is in the way never changes place**: it is
the same for everybody, and learnt run after run. Each turn has its theme, and each is worse than the last:

| Turn | | What is in the way |
|---|---|---|
| 1 | Mind the Gap | holes in the track, hurdles: jumped |
| 2 | Duck! | boards hung across, slid under; fences across two thirds of the width, gone round |
| 3 | Step Up | crates: one jumps onto the first, then again onto the higher one, and off |
| 4 | Clockwork | what moves by the clock of the world: mills, stompers, hammers that swing across |
| 5 | Roll Out the Barrel | barrels dropped from the gallery above roll down the track |
| 6 | The Works | all of it at speed, and three narrow planks to the bell |

Yellow and black is jumped, red and white is slid under, navy is gone round. **One touch — or a hole — and the
attempt is over**: one is back at the foot within a second and the clock starts again; the session goes on,
attempt after attempt, until one reaches the bell or leaves. The line of the run says the attempt, the turn and
one's best height so far. The time that counts is the time of the attempt that reaches the bell — and the
inside of the track is the shorter way round: who hugs the tower gains on who runs along the rail (without
that every finish would take exactly the same time).

The bot reaches the bell at its first attempt (51.8 s in the running game). For the game's boards:
`spiral: { order: 'asc', min: 46000, max: 900000 }` (46 s is the fastest finish there can be: all along the tower
at a run).

What its owner should look at first: back to the foot every time means some forty seconds of easy turns before
each try at the last one — it may tire before it thrills (a checkpoint a turn, or a way to practise one turn,
would be a choice of rules). The fourth turn asks one to read what moves on the fly.

### Round the Bend (`cars`)

A table stands in the meadow north of the acid pond ((-243.5, -55.8), 27 × 15.6 m), and on it a circuit of
some eighty metres for radio-controlled cars, **seen from straight above** by a camera that does not move:
red and white kerbs, tyre walls, cones, a chequered line, a yellow pad that kicks, a patch of sand, an orange
ramp, a patch of oil. One asks to play under an arch at (-243.5, -45.9); one's robot stands on a little deck
by the table and drives the red car (a white ring and an arrow over it). **The stick says where the car should
go on the screen** — it turns towards that heading and accelerates; the jump key is a short boost that comes
back. It slides when thrown into a bend, bounces off the walls and off the others, goes straight on over oil.
Three laps over sixteen gates (no corner is cut), a count of three, against the clock and against three cars
that drive by themselves (Blue, Yellow, White). The cars are seen only by who races.

Its bot: 35.2 to 36.3 s over twelve races, first every time; the rivals 38.7, 41.6 and 44.1 s on average; a
clumsy driver 37 to 40 s. For the game's boards: `cars: { order: 'asc', min: 16_000, max: 180_000 }`.

What to look at first: the cars are small at this framing; the table is only seen (one walks through it).

### Par for the Course (`golf`)

Nine holes of crazy golf round the acid pond (inside x -255 … -213, z -99 … -72; the gate at (-225.5, -75.6),
the first tee six metres on), each a bed of felt with a timber kerb, its tee, its cup and flag, its number and
par on a stake, each with one idea, harder as one goes:

| | | par |
|---|---|---|
| 1 | Warm-up — a straight lane | 2 |
| 2 | Round the Corner — played off a slanted cushion | 2 |
| 3 | The Hump — a ridge across: too soft and the ball rolls back | 3 |
| 4 | The Windmill — a door between two piers, sails by the clock of the world | 3 |
| 5 | The Mushrooms — four bumpers that kick | 3 |
| 6 | Down the Drain — a funnel into a pipe that drops onto a raised green | 3 |
| 7 | Sliding Doors — three walls that slide at different paces | 3 |
| 8 | The Plank — no kerb, a deck over the acid | 4 |
| 9 | The Acid Test — a ramp over the acid to an island green | 4 |

The ball is putted: the stick aims (a line of dots shows the way), a gauge swings up and down by itself, the
jump key hits at the strength it shows (stick back slows the gauge). The ball rolls with friction, comes back
off the cushions, is taken by the cup when it goes slowly enough; in the acid or off the bed it comes back
where it was hit from, a stroke more. Seven strokes at most a hole, then on. The whole round is one session;
the score is the strokes, time breaking ties: `strokes × 1000 + seconds`, written "31 strokes (2:07)".

Its bot aims by playing the putt forward with the rules, and holes every one of the nine in one (9 strokes,
53 s) — which no person will; clumsy bots take 14 to 21 strokes. For the game's boards:
`golf: { order: 'asc', min: 9000, max: 63999 }`.

What its maker could not see: the line of dots and the gauge in a picture (the bot hits at once), the swing of
the putter. The meadow's grass pokes through the felt in places.
