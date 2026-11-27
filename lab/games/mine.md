### Little Mine Train (`mine`)

*Asked for on 26 November 2026: "a game like the little train of the mine, that goes through the mountains".*

A train of three ore carts — one's robot sits in the first — leaves a wooden station at the foot of the west
mountains, is hauled up inside the rock, and runs away: **1,100 m, 96 m up and down again, a minute and a half
on the clock**. Its switch is `mine`; with it off nothing of it is loaded or built.

**A ride one drives.** The train follows its rails by itself. What one does, with the stick and one button:

- **lean** (stick left / right) into the bend. A bend taken upright at speed tips the cart — the screen says
  "LEAN LEFT", the cart rolls outwards — and a cart that tips for half a second or so leaves the rails. Leaning
  on a straight costs nothing: one may lean early.
- **brake** (stick back) before what is too sharp for the speed one has: no lean holds a bend taken too fast.
- **let it run** (stick forward) where the line allows.
- **hop** (the button, pressed — an edge): 0.86 s in the air, 0.9 m high, over a gap in the rails or a rock on
  them.
- **choose** at the fork: leaning right as one passes it, one takes the short way — 31 m shorter, broken twice
  with a rock between: three hops in a row —; otherwise the long way round.

Nuggets all along (47: between the rails, beside them — lean to those —, above them — hop) take half a second
each off the time. **Off the rails** — tipped over, into a gap, onto a rock —: 1.7 s on the ground, then back on
the rails at the last signal (a green lamp every sixty metres: nineteen of them), three seconds added; the third
time off after the same signal one is set down at the next. Never the whole run. The score is the time on the
clock, plus three seconds for each time off, less half a second for each nugget.

**What reads at a glance**: the two rails and the sleepers ahead, and a board before each thing to do, two
seconds before it, the same colours every time — **blue with a white arrow: lean that way; red with a white
bar: brake first; yellow and black: hop; green: the fork**. Lamps in the tunnels; the broken ends of a gap are
striped yellow and black.

**The line** (`rules.js`: laid like a toy track — so many metres straight, a bend of so many degrees —, eased,
cut every half metre):

| stretch | from | what it is |
|---|---|---|
| The Station, The Lift | 0 m | out of the platform, into the mountain, hauled 96 m up a steep incline of timber sets and lanterns and round its head: a quarter of a minute, nothing one does matters |
| The High Line | 281 m | out on a terrace 125 m up: two gentle bends that ask for nothing yet, nuggets left and right |
| The Trestle | 308 m | a great timber trestle over the saddle, 78 m long, up to 21 m high, the valley and the sea on the right: nuggets to lean to and to hop to — nothing yet that throws one off |
| The Spiral | 386 m | once and a half round a needle of rock on the next terrace, going down: the first sharp bend — brake, lean left, hold it |
| The Lantern Tunnel | 514 m | down into the ground: a gap in the rails, a rock on them |
| The Fork | 590 m | the long way round three bends, or the short way straight on |
| The Drop | 717 m | 42 m down into the dark, 90 km/h at its foot |
| The Lake | 807 m | black water under the mountain, the line on piles: brake, a bend, a gap, a rock, a hook to the left |
| The Deep Line, The Last Bends | 957 m | four tight bends one after the other, each to be braked for |
| Home | 1,077 m | out of the rock at the foot of the mountain and along it to the platform |

In the open the line runs over the ground of the world, on low timber and on trestles, 4 m and more from every
tree (the mountains are wooded: the terraces it uses north-west of the meadow — x -266 … -147, z -297 … -267 —
are the bare ones). Everything else is **an inside of the game's own**: the ground of the world is not dug.
From outside one sees four mouths of timber, dark behind; who rides is shown the insides (one group, hidden
otherwise), and for them the ground is left out where a tunnel comes up through it (an unseen sheet drawn before
the terrain: `mine-hole`).

**With others**: trains leave ten seconds apart by the shared clock, each with the name of its start (the Red
train, the Blue train…); everybody rides the same line (nothing on it moves or is random), and a train is drawn
under every visitor who rides, wherever they are on it — also for who only watches.

**The drivers that play by themselves** (`botInput`): `steady` reads the boards — it does what it decided a
quarter of a second earlier, leans before the bend, brakes for what is too sharp, hops in the middle of the
moment, takes the long way: round without leaving the rails, 87 s on the clock, 66 s with its nuggets. `bold`
lets it run and takes the short way: 56 s. `clumsy` (half a second late, leans when the bend is under it, brakes
when the cart tips, hops by guess) leaves the rails a few times and gets home. Who does nothing is off at the
first sharp bend — the spiral — again and again, and is home after four minutes.

`node tools/mine-test.mjs` (35 checks; its last line is the line of `server/scores.js`), `node
tools/play-test.mjs mine`.

**What it does not do, what nobody has seen.** The checks prove the line can be ridden — a driver does it — not
that it is a pleasure: nobody has held the stick. In particular: whether half a second of grace before a cart
tips over is right for a person; whether the boards, two seconds ahead, are read in time on a telephone; the
ride on a telephone at all. The others' trains are drawn from what each rider tells three times a second (place,
speed, lean): never seen with two browsers. The sounds are the fair's own (no wheels on rails, no brake). The
lake is a flat sheet with painted light; the insides are rough arches of rock, not a designed cave. The carts
have no couplings and their wheels do not turn. The camera looks over the two carts of ore: they are between it
and the rails just ahead of the first cart.
