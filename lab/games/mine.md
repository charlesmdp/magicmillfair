### Little Mine Train (`mine`)

*Asked for on 26 November 2026: "a game like the little train of the mine, that goes through the mountains".*

A train of three ore carts — one's robot sits in the first — leaves a wooden station at the foot of the west
mountains, is hauled up inside the rock, and runs away: **1,035 m, 101 m up and down again, a minute and a
quarter on the clock**. Its switch is `mine`; with it off nothing of it is loaded or built.

**Where.** The station stands on the meadow of the acid pond, in its north-west corner, along the foot of the
mountain: a platform on posts under a striped roof from (-227, -122) to (-239, -108), steps down to the gate at
(-219.9, -113.6) — north of the golf (23 m), and **north of the wall of thanks, not before it** (the first place
tried was: a check keeps it away now). The line goes into the cliff 14 m north of the wall's end, climbs under
the flank to a terrace 125 m up at (-265, -273), runs east in the open to x -148, and comes back under the
mountain: x -329 … -148, z -297 … -102, 25 … 126 m over the sea. In the open it stands on ground nobody walks
(but the station).

**A ride one drives.** The train follows its rails by itself. What one does, with the stick and one button:

- **lean** (stick left / right) into the bend. A bend taken upright at speed tips the cart — the line of the run
  says "LEAN LEFT", the cart rolls outwards — and a cart that tips for half a second or so leaves the rails
  (0.64 s round the spiral at 43 km/h; leaning the wrong way, half that). Leaning on a straight costs nothing:
  one may lean early.
- **brake** (stick back) before what is too sharp for the speed one has: no lean holds a bend taken too fast.
- **let it run** (stick forward) where the line allows.
- **hop** (the button, pressed — an edge): 0.86 s in the air, 0.9 m high, over a gap in the rails or a rock on
  them. The moment to press is 0.6 s wide at the narrowest.
- **choose** at the fork: leaning right as one passes it, one takes the short way — 31 m shorter, broken twice
  with a rock between: three hops in a row —; otherwise the long way round.

Nuggets all along (48: between the rails, beside them — lean to those —, above them — hop) take a quarter of a
second each off the time. **Off the rails** — tipped over, into a gap, onto a rock —: 1.7 s on the ground, then
back on the rails at the last signal (a green lamp every sixty metres or so: thirteen of them), three seconds
added; the third time off after the same signal one is set down at the next. Never the whole run. The score is
the time on the clock, plus three seconds for each time off, less a quarter of a second for each nugget — it is
what the line of the run shows all along.

**What reads at a glance**: the two rails and the sleepers ahead, and a board before each thing to do, a second
and more before it (two, mostly), the same colours every time — **blue with a white arrow: lean that way; red
with a white bar: brake first; yellow and black: hop; green: the fork**. Lamps in the tunnels, on both walls
down the drop; the broken ends of a gap and the sides of a rock are marked yellow.

**The line** (`rules.js`: laid like a toy track — so many metres straight, a bend of so many degrees —, eased,
cut every half metre; the last pieces are laid so that they end where the line began, and one smooth curve under
the mountain joins the two):

| stretch | from | what it is |
|---|---|---|
| The Station, The Lift | 0 m | out of the platform, round into the cliff, hauled 101 m up a steep incline of timber sets and lanterns and round its head: 17 s in all, nothing one does matters |
| The High Line | 294 m | out on a terrace 125 m up: two gentle bends that ask for nothing yet, nuggets left and right |
| The Trestle | 320 m | a great timber trestle over the saddle, 78 m long, up to 21 m high, the valley, the sea and the big wheel on the right: nuggets to lean to and to hop to — nothing yet that throws one off |
| The Spiral | 398 m | once and a half round a needle of granite on the next terrace, going down, the line hung on brackets from the rock: the first sharp bend — brake, lean left, hold it |
| The Lantern Tunnel | 526 m | down into the ground: a gap in the rails, a rock on them |
| The Fork | 603 m | the long way round three bends, or the short way straight on |
| The Drop | 732 m | 48 m down into the dark, lamps flying past, 85 km/h at its foot |
| The Lake | 828 m | black water under the mountain, the line on piles: a gap, a rock, a long hook to the left to brake for |
| The Deep Line, The Last Bends | 922 m | three tight bends down a slope of one in five, each to be braked for |
| Home | 1,016 m | out of the cliff, round a boulder on timber, over the line and on to one's place at the platform |

In the open (295 m) the line runs over the ground of the world, on low timber and on trestles, 4 m and more from
every tree: the mountains are wooded, and the two terraces it uses are the bare ones. Everything else is **an
inside of the game's own**: the ground of the world is not dug. From outside one sees four mouths of timber,
dark behind; who rides is shown the insides (one group, hidden otherwise), and for them the ground is left out
where a tunnel comes up through it (an unseen sheet drawn before the terrain: `mine-hole`).

**With others**: trains leave ten seconds apart by the shared clock, each with the name of its start (the Red
train, the Blue train…); everybody rides the same line (nothing on it moves or is random), and a train is drawn
under every visitor who rides, wherever they are on it — also for who only watches.

**The drivers that play by themselves** (`botInput`): `steady` reads the boards — it does what it decided a
quarter of a second earlier, leans before the bend, brakes for what is too sharp, hops in the middle of the
moment, takes the long way: round without leaving the rails, 79 s on the clock, 68.6 s with its 42 nuggets.
`bold` lets it run and takes the short way: 59.9 s. `clumsy` (half a second late, leans when the bend is under
it, brakes when the cart tips, hops by guess) leaves the rails seven times and gets home in 129 s. Who does
nothing is off at the first sharp bend — the spiral — and again and again: home after 226 s, 24 times off.

`node tools/mine-test.mjs` (36 checks; its last line is the line of `server/scores.js`), `node
tools/play-test.mjs mine`.

**What it does not do, what nobody has seen.** The checks prove the line can be ridden — a driver does it — not
that it is a pleasure: **nobody has held the stick**, on a computer or on a telephone. In particular: whether
half a second of grace before a cart tips over is right for a person; whether the boards are read in time (in
a tunnel the nearest one passes close by the camera, large and askew); whether 17 s of being hauled is too long
the fifth time. The others' trains are drawn from what each rider tells three times a second (place, speed,
lean): never seen with two browsers. A cart off the rails is thrown aside and put back: no tumble worth the
name, no sparks when one brakes, and the sounds are the fair's own (no wheels on rails). The lake is a flat
dark sheet; the insides are rough arches of rock with lanterns, crystals and veins, not designed caves, and the
two ways of the fork are two such arches run into one another. The carts have no couplings and their wheels do
not turn. The camera looks over the two carts of ore: they are between it and the rails just ahead of the
first cart. Coming out of the last tunnel the camera is still inside the rock for a moment while the cart is
out. The station's platform is not a floor one walks on (one is sat in the cart from the gate), and one walks
through its posts. Pictures were taken at the lowest quality only.
