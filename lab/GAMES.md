# The seven games with a gate

Seven games made in the lab and tried by their owner, who asked for them to be put in the game. **They are
extras of the game now, each behind a switch of its own, off as the game is delivered**: with its switch off
nothing of a game is loaded, built or shown, and the game is the game as it was. The owner throws the switches on
the page `/admin` (`RELEASE` in `src/app/config.js`; the server keeps them and tells every browser at once).
They borrow the *mechanics* of games one knows — never their look, their names or their levels.

| Switch | What it is | Where it stands | Its checks |
|---|---|---|---|
| `waves` | **Big Tsunami** — a bank of sand off the beach and the sea of everybody: one runs, jumps, is thrown back by what catches one, for as long as one can | the north beach: a bank at about (57, -56), the arch at (40.4, -62.4) | `node tools/waves-test.mjs` (36) |
| `lava` | **No Touch Lava!** — the lava only rises, columns come up out of it: one keeps to the summits, and keeps a way on | a small volcano east of the head of the pier, at (188, 8); the gate on the deck of the pier head at (142.4, 13.3) | `node tools/lava-test.mjs` (36) |
| `hive` | **Bee Fly** — four combs of wax over the sea: the cell one sets foot on gives way | the north of the bay: combs at (84, -84), the gate on the beach at (43.5, -79.5) | `node tools/hive-test.mjs` (30) |
| `flip` | **Mostly Up & Down** — one runs on the spot in a machine of travelling girders, and one key turns gravity over | a tall frame in the sea along the south side of the pier; the gate on the south beach at (41.1, 42.8) | `node tools/flip-test.mjs` (45) |
| `spiral` | **Spiral of Death** — a track wound round a tower: obstacles worse every turn, up to the bell | a tower in the south of the bay, at (168, 84); the gate on the south beach at (52, 71) | `node tools/spiral-test.mjs` (52) |
| `cars` | **Karting Simulator** — radio-controlled cars raced on a table, seen from above | the meadow south of the acid pond: a table at (-243.5, -55.8), the arch at (-243.5, -45.9) | `node tools/cars-test.mjs` (40) |
| `golf` | **Balthazar Golf** — nine holes of crazy golf round the acid pond | round the acid pond (-236, -82); the gate at (-225.5, -75.6) | `node tools/golf-test.mjs` (52) |

`node tools/play-test.mjs` plays all seven in the running game, in a headless browser: with its switch off
nothing of a game is in the world; switched on the way the game does it, it is built, its board of scores by its
gate (a sponsor's panel over it, its star on the map), offered there, played to the end by its own bot, its score
told, kept and on its board, the player let go at the gate; left half-way it leaves nothing behind.

**Each has its board of scores, as every game of the fair has** — and the game keeps it, as it does for the
other extras that are games: `LAB_GAMES` and `LAB_BOARD` in `src/main.js` (the stand by the gate, the panel of
its sponsors — five places, as at every big attraction —, its star on the map, its plank on the signposts), its
line in `server/scores.js` (what a score is, and what is believed: the figures each `tools/<id>-test.mjs` prints,
which the same checks hold against that table), its name in `server/catalog.js`. Three are scored by how long one
held (waves, lava, hive), three by a time (flip, spiral, cars), the golf by its strokes, then by the seconds of
the round (`src/world/zones/games/golf/score.js`). The time of the machine (flip) carries three seconds for each
fall: the server lets such a time be well over what the run lasted (`added`), never be told before the machine
is through (`length`).

**What the checks prove is that each game can be played — a bot does it — not that it is a pleasure to play.**
That is the owner's to say, game by game.

## How each is made

Four files a game (see the top of `src/extras/plug.js`):

- `src/world/zones/games/<id>/rules.js` — its rules, without a renderer: time in steps of 1/120 s, a player that plays by itself;
- `src/world/zones/games/<id>/<Name>.js` — what is seen of it, and a session that drives the player (the shape of `Hill.js`, of `Hollow.js`);
- `src/extras/<id>.js` — `attach(app)`: builds it in the running game and plugs it in (`plug`, in `src/extras/plug.js`);
- `tools/<id>-test.mjs` — its checks, without a browser; the last line it prints is its line for the boards of scores.

`src/extras/plug.js` plugs a game into the running game (the action at its gate, the session, the keys, the music,
one's own best; it tells the game when a run is on — `app.<id>Run()` — and what its score is — `app.<id>Done`);
`src/world/zones/games/gates.js` holds what the games share to build themselves (the starts on the shared clock,
the arch where one asks to play, a sign on a stake); `tools/lib/check.mjs` what their checks share (the lines
PASS / FAIL, the ground of the world). `src/extras/tunes.js` is their music: a tune for each game, in the notation
of the climb's (`src/audio/tunes.js`), written on the game's own synthesiser while a run is on — the world's music
steps back meanwhile — with voices that come in as the run goes on (each game hands the player its own rules: the
tune of one game loads nothing of another); `node tools/tunes-test.mjs` (175) checks the player and the tunes; `node lab/tools/tune-listen.mjs spiral,flip --out=<folder>` plays a tune on the game's own sound engine, measures it beside the orchestra of the climb and writes it as a .wav to listen to.
`tools/game-shots.mjs` takes pictures of a game in the running game: `node tools/game-shots.mjs waves
far=30,26,-78,-115,-28 gate=gate a=play:8` (its top says how).

## Six more, and a place (lab/NEWGAMES.md)

Asked for on 26 November 2026; each behind a switch that is off. What is built has its own notes:

| Switch | What it is | Its notes | Its checks |
|---|---|---|---|
| `ages` | **War Through the Ages** — two bases on one road, fifteen kinds of robot, five ages, turrets, a great blow each; a stage in the west meadow | `lab/games/ages.md` | `node tools/ages-test.mjs` (42) |
| `raft` | **Wild River** — a raft down 648 m of river on a headland of its own, north of the golden dog: pools, rapids, rocks, a fork, falls | `lab/games/raft.md` | `node tools/raft-test.mjs` (39) |

`node tools/play-test.mjs ages raft` plays them in the running game. Their music is in `src/extras/tunes.js`
(`TUNES.ages`, `TUNES.raft`: the rules of each say how far a run has come, `heatOf`). To come: `walls`, `sneak`,
`mine`, `coaster`, and the place `sanctuary`.

## Several at once: one game, seen the same by all

Asked for by the owner after playing with a friend ("on voit le nom du robot qui bouge sans cesse", "chacun joue
mais pas sur la même carte"). Four things hold for every game of this folder:

- **One clock.** `worldClock()` (`gates.js`) and the clocks of the pond, the cleft and the slope are the server's
  (`sharedNow`, `src/net/api.js`), not the device's — and it is refined by what the relay says ten times a second
  (`heardRelay`: the message that took the least time on its way tells how far ahead the server is, to a few
  hundredths of a second; the clock is never made to jump). Two devices whose clocks are four seconds apart see
  the same waves (`node lab/tools/duo-games.mjs waves --skew=4000`).
- **The names are where the robots are.** The other visitors are placed, and their names laid out, once the world
  has had its turn (`src/main.js`): a game sets its camera there, and the names were being laid out for the camera
  of the walk — beside the robots, never still. A game may also say where a name goes (`peer.tagAt`: over a boat),
  that there is none (`peer.tagOff`), that a robot is head down (`peer.roll`) or not shown (`peer.hidden`):
  `src/net/RemoteAvatars.js`.
- **Who shares a run sees each other; who does not is not shown.** Each browser says a few times a second which run
  of which game it is in (`src/extras/mates.js`, through the small relayed message the boats use). `plug` does it
  for a game: a session's run is `session.instance`, else `session.start.n`, else 0 (one place for everybody);
  `session.tell()` adds up to six numbers. `io.mates()` are those who share one's run, `io.live()` the run most
  play now; the line of the run says "with Bob"; `game.crowd` gives the same to what the game shows to who only
  watches (`crowd.watch(run)`: only those of that run are seen in it).
- **Never two maps in one place.** No Touch Lava!: one crater, one round — who arrives while a round is on joins
  it (until its eleventh rise: later a newcomer would only be put in the lava), on its highest dry column, and is
  scored from then; who only watches sees that round. Mostly Up & Down: friends take the start that is waited for;
  only those of one's start are in one's machine and are solid; a runner who runs head down is drawn so. Bee Fly:
  a run is one's own (the cells that gave way are), so the others are not shown meanwhile. Harbor Heaven: the
  names are over the boats.

`node lab/tools/duo-games.mjs <id> [--late=6] [--at=4,12,25] [--skew=ms]` plays a game with two browsers on the
game's own server and photographs both screens. **What nobody has done: two people playing together.**

## Trying them

- **In the game**: on the page `/admin`, the switch of the game ("Big Tsunami", "No Touch Lava!"…). Every browser is
  told at once; switched off again, the game is gone at the next load of the page.
- **On the lab page**, without touching what is online: `npx vite --config lab/vite.config.js`, then `/lab/` —
  its panel lists them first ("★ …"), with an arrow that takes one to each. `node lab/tools/static-site.mjs
  <folder>` builds that page as a folder of plain files that works from any address and without a server (no
  rooms, no boards: one plays alone); `lab/wrangler.jsonc` deploys it as a Worker of its own (three steps, at the
  end of `lab/INTEGRATION.md`).

## The games, one by one

### Big Tsunami (`waves`)

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

### No Touch Lava! (`lava`)

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

Made a notch livelier after its owner asked: the first rise comes after 6.5 s (it was 9) and the rises close
in to 3 s apart; the lava takes 0.6 s to rise a level and a column half a second to come up; more, smaller
hills at each pulse, so that one moves at every one; one runs at 6.9 m/s (it was 6.3) with more grip in the
air; twice in a round the lava rises two levels in quick succession, said beforehand; the way on is sure for
the first eleven rises.

Its bot held 66 s in the running game; who stands still is out at the first or second rise. For the game's
boards: `lava: { order: 'desc', min: 1000, max: 98_000 }`.

What it does not do: two visitors who took different starts stand in the same crater with different columns
under them (each browser draws its own round) — only those who leave together see the same thing.

### Bee Fly (`hive`)

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

### Mostly Up & Down (`flip`)

*Reworked twice after its owner tried it: first "four or five times as long, more room, a rhythm that quickens",
then "300 m more, more kinds of obstacle, and players who get in each other's way".*

A machine stands in the sea along the south side of the pier, ten metres off its head: a tall striped frame in
which painted girders travel from right to left, as the scenery does in the flying theatre (one asks to play on
the sand of the south beach, at (41.1, 42.8)). One runs in it on the spot, a third of the way from its left
end, faster and faster (7 m/s at the start, 18.5 at the end, over 1000 m of course), and has **one key: it
turns gravity over**. One then falls up to the underside of what is above — or back down onto what is below —
and runs on there, head down, in a space sixteen metres high. Gravity is turned over only while one's feet are
on something (a girder, another runner) or have just left it, never in the air.

Fourteen stretches, a flag every seventy metres: Easy Does It, The Steps, The Long Drop, In Step, **The Frames**
(hollow boxes: one runs under one and on top of the next, floor and ceiling in pieces), The Teeth, Upstairs
Downstairs, **Wide Open** (long girders far apart), **The Scatter** (short girders on four levels between an
unbroken floor and ceiling), Open Air, The Comb, **Crossing Stairs** (a staircase going down crosses one going
up: one hops between them in rhythm), Sea to Sky, The Dash.

**A girder in one's way does not end the run at once**: it holds one back while the others go by, and pushes
one towards the left end of the machine. Freed in time, one runs faster than the girders until one is back in
one's place — the further behind, the faster. **The machine never winds back**: pushed out at the left end, or
fallen out above or below, one drops back in after a moment, and pays for it in time. One's time is the time
the machine takes (84.5 s, the same for everybody) plus 3 s for every fall, less a quarter of a second for
every spark caught.

**Several players**: a start every ten seconds on the shared clock, and those who leave together are in the
same machine at the same metre from first to last. The other runners are solid: one cannot run through
another — running into a back holds one up as the end of a girder does — and one can land on another, on its
head from above, under its feet from below. So two runners with opposite gravities who meet between two
girders stop against each other and run on, each standing on the other; when one turns gravity over, the other
falls on. Who was held up catches up, and queues behind who is ahead. The game reads where the other visitors
are from what the game's network already carries (a tenth of a second late), and is forgiving with it: a
runner is solid only once it has been seen for a moment, and never from inside one.

Its bot: 76.5 s without a fall (76 flips; the tightest moment to flip is half a second wide in the first
third, 0.22 s after); with every one of the 67 sparks, 67.8 s. For the game's boards:
`flip: { order: 'asc', min: 67000, max: 600_000 }`.

What it does not do, and what nobody has seen: **two real players have not been tried** — only runners
simulated by the rules, each fed the other a tenth of a second late. Other visitors see a runner upright even
when it runs head down (the game's network does not carry which way up one is), so the game guesses it from
the girders round them. Runners who leave together start in the same spot and are solid for each other only
once they have parted. A runner of another start is solid where one sees it, though it is at another metre of
the course.

### Spiral of Death (`spiral`)

*Reworked twice after its owner tried it: first "no more running by itself (keep the camera)", then "a hundred
metres higher, and new obstacles".*

A striped helter-skelter stands on a stone plinth in the sea, in the south of the bay ((168, 84); one asks to
play on the sand of the south beach, at (52, 71)), and a track of planks winds up round it like a giant spiral
stair: **nineteen turns, 1146 m of track, from the foot to a bell 146 m higher** — it stands well over the big
wheel. **One runs as the stick asks**: pushed up, the legs run — a little faster as one climbs —; let go, they
stop within a quarter of a second; nobody runs back down. One steers across the track (a rail on each side),
jumps — as far as the run before it, and again in the air —, slides, dives back down, ducks when standing. So
one may stop before what moves, read it, and go: the clock is what that costs, and it starts with the first
step of an attempt.

**What is in the way never changes place** — it is the same for everybody, and learnt run after run — and
every turn has its theme: yellow and black is jumped, red and white is slid under, navy is gone round.

| Turn | | Turn | |
|---|---|---|---|
| 1 | Mind the Gap — holes, hurdles | 11 | Gusts — a wind that pushes one towards the holes, shown by streamers |
| 2 | Duck! — hung boards, fences | 12 | Against the Grain — belts that carry one back |
| 3 | Step Up — crates | 13 | Sliding Doors — walls, each with one door that slides |
| 4 | Clockwork — mills, stompers, hammers | 14 | Cannonade — balls across, jumped or slid under |
| 5 | Roll Out the Barrel — barrels | 15 | Tightrope — planks a foot wide, never in line |
| 6 | The Works — a mix, then narrow planks | 16 | Low Bridge — boards that come down a cable |
| 7 | Give Way — planks that drop after one sets foot on them | 17 | Pistons — rams from the tower or the rail, in waves |
| 8 | Spring Tide — springboards over holes no jump crosses | 18 | Clock of Hammers — rows of four, a beat apart |
| 9 | Three High — a stair of crates, a hole behind | 19 | The Last Straw — a mix, then planks a foot wide that give way, to the bell |
| 10 | Up and Down — bars that go low and high, in rhythm | | |

**A landing is a save.** There are six of them — a short level stretch with nothing in the way, a painted line,
a flag and a green sign "SAVE · 23 m" — every three turns, which is every 23 metres up (23, 46, 69, 92, 115 and
138 m; the bell is at 146). One touch — or a hole — and one is back within a second on the last landing one
reached, the clock running on: the time that counts is the time from the first step to the bell, falls and all
(the line of the run counts the falls and says where one is saved). Before the first landing nothing is saved:
a touch puts one back at the foot, where the clock waits for the first step again. Its owner asked for a save
every thirty metres; the landings were there, level and empty — the only places where one can be put back
without something landing on one's head — so they are the saves: a little closer together than asked. The first
rule (one touch and it is the foot again, the bell in one attempt) is still there behind one constant,
`SPIRAL.back = 'foot'`. The inside of the track is the shorter way round: who hugs the tower gains on who runs
along the rail.

The bot reaches the bell at its first attempt in 161 to 163 s (138 keys, three waits); the tightest moment it
has to act in is 0.29 s wide, half of them 0.41 s or more; the longest wait for something that moves is 2 s.
The fastest finish there can be is 144.9 s. For the game's boards:
`spiral: { order: 'asc', min: 144000, max: 900000 }`.

What its owner should look at first: whether a save every 23 metres makes the climb a pleasure, or too easy.
What nobody has seen: a person falling and being put back on a landing in the running game (the rules check it,
and the bot that plays in the browser never falls), and play beyond the sixth turn in a picture taken while
playing.

### Karting Simulator (`cars`)

*Reworked after its owner drove it ("the up arrow should make it go forward; drift, brighter colours, fire").*

A table stands in the meadow south of the acid pond ((-243.5, -55.8), 27 × 15.6 m), and on it a circuit of
some eighty metres for radio-controlled cars, **seen from straight above** by a camera that does not move: a
toy track in bright colours — a striped green infield, kerbs and tyre walls of six colours, bunting round the
table, a pad that glows, a patch of sand, a ramp under a hoop of fire, a patch of oil. One asks to play under an
arch at (-243.5, -45.9); one's robot stands on a little deck by the table and drives the red car (a white ring
and an arrow over it).

**The car is driven as a radio-controlled car is**: stick up (W, the up arrow) and it goes forward the way it
faces; left and right are the car's own left and right; stick down brakes, then reverses. Thrown into a bend
at speed **it drifts**: the tail steps out, throttle and turning into the bend keep it sliding, straightening
up makes it grip again — and lets go a burst of speed, the stronger the longer the slide (the sparks under the
tyres say how much: yellow, orange, blue), with flames out of the exhaust; skid marks stay on the tarmac a
while. The jump key is a boost that comes back. Three jets of fire beside the straights burn every 3.2 s from
the fifteenth second of a race, on one side of the road only: through a burst one keeps half one's speed.
Three laps over sixteen gates (no corner is cut), a count of three, against the clock and against three cars
that drive by themselves (Blue, Yellow, Pink). The cars are seen only by who races: another visitor sees the
robot standing at the table, not the race.

Its bot: 34.8 s, first every time; the rivals 38, 40.6 and 43.3 s; a clumsy driver 37 to 42 s. For the game's
boards: `cars: { order: 'asc', min: 16_000, max: 180_000 }`.

What nobody has felt yet: the drift under a hand (it was only simulated). The rivals keep to a line that never
drifts nor meets a jet. The table is only seen (one walks through it).

### Balthazar Golf (`golf`)

*Reworked after its owner played it ("make it belong to our world, a little harder, and aim straight at the start").*

Nine holes of crazy golf round the acid pond (inside x -264 … -204, z -114 … -71; the gate, a striped ticket
kiosk and the board of scores make its entrance at (-225.5, -75.6)). **Each hole takes after a place of the
valley**, in miniature and in the paint of the fair; the beds stand half a metre over the meadow on painted
skirts, a path of planks goes from hole to hole, a rope on stakes keeps one off the acid, and there are poles
with bunting and bulbs, benches, flower tubs.

| | | after | par |
|---|---|---|---|
| 1 | The Big Red Button | the big red button: it kicks the ball back | 2 |
| 2 | The Swan Pond | the great pond: one passes on its left once the swan has glided by | 3 |
| 3 | The Temple Stairs | the stairway to the temple: three steps, a soft ball rolls back down | 3 |
| 4 | The Water Mill | the mill: paddles sweep the lane, then a narrow door through it | 3 |
| 5 | The Floating Stones | Mostly Up: the ball must hop two gaps onto lower stones | 3 |
| 6 | The Golden Dog | the golden dog: down a hill, between its legs, off a cushion round the corner | 3 |
| 7 | The Big Wheel | the grand pier: the gondolas of two wheels come down through the lane | 3 |
| 8 | The Plank | the acid pond: a plank 0.8 m wide over it | 4 |
| 9 | The Acid Test | the island and its boulder: a ramp over the acid to an island green | 4 |

The ball is putted: the stick aims (a line of dots shows the way), a gauge swings up and down by itself, the
jump key hits at the strength it shows (stick back slows the gauge). **At the tee the aim points straight down
the lane** — never along the line that holes the ball: on no hole does a putt straight down the lane go in, at
any strength. The ball rolls with friction, follows the slopes, comes back off the cushions, is taken by the
cup when it goes slowly enough; in the water, in the acid or off the bed it comes back where it was hit from,
a stroke more. Seven strokes at most a hole, then on. The score is the strokes, time breaking ties:
`strokes × 1000 + seconds`, written "31 strokes (2:07)". Par is 28.

Its bot aims by playing the putt forward with the rules and still holes every one in one (9 strokes, 55 s) —
which no person will; clumsy bots take 16 to 20 strokes. For the game's boards:
`golf: { order: 'asc', min: 9000, max: 63999 }`.

What nobody knows yet: how hard the holes feel to a person (par 28 is a judgement from the odds of a random
putt, not from play). The meadow's grass pokes through the path of planks in places.
