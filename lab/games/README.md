# Five games being tried

Five games made in the lab, for their owner to try and judge. **Nothing of them is in the game**: every file is in
this folder, and only the lab page switches them on (`lab/lab.js`: "NOUVEAU · …", and a button that takes one to
each). They borrow the *mechanics* of games one knows — never their look, their names or their levels.

| Switch | What it is | Where it stands | Its checks |
|---|---|---|---|
| `waves` | **Wave Goodbye** — the sea comes in over a bar of sand: one is drawn out, and jumps what comes, for as long as one can | the north beach: a bar from (47, -60) to (103, -39) | `node lab/games/waves/test.mjs` (21) |
| `lava` | **Thin Crust** — basalt columns that warn, then sink into the lava of a crater: the last ground standing | an islet east of the head of the pier, at (188, 8); the gate on the deck of the pier head at (142.4, 13.3) | `node lab/games/lava/test.mjs` (24) |
| `hive` | **The Bee's Knees** — three combs of wax over the sea: the cell one sets foot on gives way | the north of the bay: combs at (84, -84), the gate on the beach at (43.5, -79.5) | `node lab/games/hive/test.mjs` (28) |
| `flip` | **Head Over Heels** — one runs by oneself along a line of girders, and one key turns gravity over | along the south side of the pier, over the sea: (54, 44) to (211, 61); the gate on the south beach at (41.1, 42.8) | `node lab/games/flip/test.mjs` (26) |
| `spiral` | **A Turn for the Worse** — a track wound round a tower: obstacles worse every turn, one touch and it is the foot again | a tower in the south of the bay, at (168, 84); the gate on the south beach at (52, 71) | `node lab/games/spiral/test.mjs` (24) |

`node lab/games/browser-test.mjs` plays all five in the running game, in a headless browser: before a game is
attached nothing of it is in the world; attached it is built, offered at its gate, played to the end by its own
bot, its score told and kept, the player let go at the gate; left half-way it leaves nothing behind.

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
   board of scores (the line each `test.mjs` prints, in `server/scores.js`; its name in `server/catalog.js`) and
   `app.<id>Done = (ms) => scoreGame('<id>', …)` — the plug calls it when a run ends.

## The games, one by one

### Wave Goodbye (`waves`)

A bar of sand runs sixty metres out from the north beach. The sea comes in over it, wave after wave, **the same
for everybody** (it goes by the clock of the world): every wave at the same speed, on the beats of one rhythm,
some two beats running. One wades in **whenever one likes**; the backwash draws one out, slowly (0.42 m/s), and
one jumps what comes — left and right along the crest, a jump, a second one in the air. A wave that catches one
carries one back to the beach, under the arch, where one can wade in again at once. The score is how long one
held.

What makes a run harder as it goes is where one stands, not the sea: a wave loses height as it runs up the sand,
and one lower than the knees only wets (it has no white crest: **a white crest says "jump"**). So by the
beach one hops knee-high rollers and a low breaker now and then; twenty-seven metres out the ripples matter
too, and everything stands taller with every metre — until, in the last ten metres, the sea asks for more than
two jumps can give. Nobody holds for ever. A crest is never level: it stands higher at one end, and a great one
(one every twenty seconds or so, said before it comes) can only be jumped at its low end. What comes two beats
running is small; the great ones come alone. Stakes say how far out one is; a golden float marks one's best.

The wader that plays by itself holds 124 to 146 s (52 to 60 m out); who stands there is carried off in 3 to
9 s; who only hammers the jump in seven. For the game's boards: `waves: { order: 'desc', min: 2500, max: 300_000 }`.

To tune: `WAVES` in `rules.js` — `drift` (how fast one is drawn out), `grow` (how tall the sea stands, metre by
metre), `beat` and `sets` (its rhythm), `kinds` (how tall, how lopsided), `knee`, `clear`.

What it adds to the world (only when it is on): the bar, its stakes, the arch, the waves (one group, `waves`;
the sand and the water are two materials of its own) — and, so that one can walk out on the bar at any time,
one `collision.addPlatform` (the waves only matter to who has waded in under the arch).

### Thin Crust (`lava`)

A crater on an islet of rock in the open sea, east of the head of the pier ((188, 8); one asks to play on the
deck of the pier head, a little before its rail, at (142.4, 13.3)), a pool of lava in it, and standing in the
lava sixty-one columns of basalt, six-sided, at three heights. One runs and jumps on their tops (a jump takes
one step of the columns, not two; it crosses one missing column, not two). A column **warns — it glows, it
trembles — then sinks**; some come back, fewer and fewer of them. Whoever touches the lava is out: the score
is how long one held.

**A round leaves every ten seconds** on the clock everybody shares, each start with its name (as on the slope
of Uphill Battle), and what the columns do in a round is drawn from its number: the same for everybody who
takes that start, something else for the next one — the rim first, rings, a sweep across, thirds, one by one.
A browser that is not playing shows the latest round, so that the field lives for who watches from the pier.
Nothing in it is unfair to begin with: nothing warns before two and a half seconds; a warning lasts 1.4 s for
the first quarter of a minute, never under half a second after; for 35 s a column that warns has a neighbour
to step to, then, to a minute, at least one to jump to. After that the field thins out (twelve columns at a
minute, three at a minute and a half) and every round ends.

A bot that sees no more than a player holds 45 to 92 s over twelve starts; who only stands there is in the
lava in 11 to 18 s. For the game's boards: `lava: { order: 'desc', min: 1000, max: 243_000 }`.

What it does not do: two visitors who took different starts stand on the same field with different columns
under them (each browser draws its own round) — only those who leave together see the same thing.

### The Bee's Knees (`hive`)

Three round combs of wax, fifty-five cells each, hang one above the other over the sea in the north of the bay
(19, 13 and 7 m up), from a great crook of timber with a straw skep at its tip; one asks to play on the sand
of the north beach, at (43.5, -79.5). One runs on the combs, and **the cell one sets foot on gives way**: it
holds a moment — 0.6 s on the top comb, 0.5 on the middle one, 0.4 on the lowest — and drops, whether one is
still on it or not; it does not come back. Through a hole one falls to the comb below; from the last one, into
the sea, and that is the run: how long one held. A run is one's own, and starts when one asks.

One is not alone up there: on each comb a bee takes the wax apart by itself, a cell every 1.3 s, on a path
drawn from the seed of the run — so nobody can stand and wait. Amber caps hold two seconds; on the two lower
combs three cells of royal jelly throw the first foot that touches them back up to the comb above, once. The
camera looks down from behind, towards the beach; the comb over one's head is hidden, those below are dimmed
so that a hole reads as a hole.

The bot holds 50 to 70 s over the twelve seeds of the checks (39 to 71 over two hundred); who stands still is
in the sea in 5 s, who runs round without looking in about 20. A run has an end whatever one does: the bees
have landed on every cell by 75 s. For the game's boards: `hive: { order: 'desc', min: 5000, max: 80_000 }`.

What it does not do: the broken cells are each player's own — another visitor is seen running on whole combs
and falling through solid wax, and friends do not break each other's cells (reading the place of the other
robots could do it: not tried). Runs differ by seed, so the board has some luck in it.

### Head Over Heels (`flip`)

A line of painted girders on pylons over the sea, 158 m along the south side of the pier, ten metres off the
edge of its head (from (54, 44) to an arch at (211, 61); one asks to play on the sand of the south beach, at
(41.1, 42.8), where painted stairs lead up). One runs along it by oneself, faster and faster (5.2 m/s at the
start, 8.5 at the end), and has **one key: it turns gravity over**. One then falls up to the underside of what
is above — or back down onto what is below — and runs on there, head down. Gravity is turned over only while
one's feet are on a girder (or have just left it), never in the air. Running into the end of a girder, falling
into the sea or up into the sky is a fall: one is put back at the last flag after a moment, and the clock runs
on. The course is fixed, in five stretches that teach, then ask: a gap under a ceiling that goes on, staggered
steps, short girders in rhythm, blocks that stand out from floor and ceiling in turn ("The Teeth"), a dash.

Sparks hang along the less obvious ways: each one caught takes a quarter of a second off the clock. They are
what tells the runs apart — the speed depends only on where one is, so every run without a fall lasts the
same 23.53 s; the plain way catches 7 sparks of the 14.

The bot finishes without a fall (18 flips, 21.78 s on the clock; the tightest moment to flip is 0.42 s wide,
most are 0.8 s); one that goes for every spark makes 20.03 s, and no run can beat it. For the game's boards:
`flip: { order: 'asc', min: 20000, max: 600_000 }`.

What it does not do: **other visitors see the runner upright inside the ceiling** — the game's network does not
carry which way up one is (it would take a message of the game's own). The board has a hard floor at 20.03 s:
the best will tie there. On a phone held upright the view is too narrow (a note asks to turn the screen).

### A Turn for the Worse (`spiral`)

A striped helter-skelter stands on a stone plinth in the sea, in the south of the bay ((168, 84); one asks to
play on the sand of the south beach, at (52, 71)), and a track of planks winds up round it like a giant spiral
stair: six turns of sixty metres from the foot to a bell, forty-six metres higher. The legs run by themselves,
faster as one climbs; one steers across the track (a rail on each side: nobody falls off it), jumps — and again
in the air, higher and further —, slides, dives back down. **What is in the way never changes place**: it is
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

The bot reaches the bell at its first attempt, in 51.2 to 52.4 s; each of the nine things that move was passed
at thirty moments of arrival. For the game's boards: `spiral: { order: 'asc', min: 46000, max: 61000 }` (every
finish there can be lies between the two: all along the tower, all along the rail).

What its owner should look at first: back to the foot every time means some forty seconds of easy turns before
each try at the last one — it may tire before it thrills (a checkpoint a turn, or a way to practise one turn,
would be a choice of rules). The fourth turn asks one to read what moves on the fly.
