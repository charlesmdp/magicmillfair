### Hold the Rails! (`coaster`)

*Asked for on 26 November 2026: "fais un jeu Montagne russe que tu conduis toi même en essayant de rester dans
les rails, si tu t'éloignes trop des rails, tu tombes. ça passe dans toutes nos montagnes".*

A wooden coaster on white trestle bents goes round the three ranges of the valley — **2,419 m of rail (2,210 m
on the map), from 5.6 m over the sea to 226 m** — and one drives its car. Its **station** stands at the back of
the north beach, on the grass between the east loop of the quad track and the sand (the rails begin at
(38, -129) and run north; a platform, a red and cream roof on striped posts, bulbs, bunting), its **gate** just
south of it at (38, -125), 27 m from the gate of the slide and 16 m from the river's. One sits in the car that
waits there, and is let go at the gate again when the run is over.

**The way it goes.** *The First Lift*: the chain takes the car straight up the face of the northern mountain
(48°) and on round to the west, to 172 m — 162 m up in 17 s, and the camera goes round in front to look back
over the car at the beach, the pier and the bay. *The Runaway*: a level breath, the first drop (34 m), a gap of
7 m on it that nobody misses. *The Flank*: west along the northern range at 140 to 160 m, on trestles 4 to 16 m
tall — north of the bare terraces where the Little Mine Train runs in the open, and well over them —, a stretch
with the right rail missing. *The Second Lift*, up to the heights of the north-west (225 m). *The High Line*,
level along the top of everything, the left rail missing for 30 m. **The Whirl**: once round on the shoulder of
the mountain, the way in 9 m over the way out — or, for who leans to the left where the board in black and
white stands, **the Plunge**: 49 m of rail instead of 186, an S of 13 m down a slope of 47°. *The Western Wall*:
a crest that lifts the car off its weight, then 50 m down. *The Switchback*, across the slope and back, 50 m
behind the Lost Temple and 40 m over it. **The Hollow**: over a brink, 58 m down at 52°, a gap of 16 m flown on
the way up the other side. Round the south-west, *the Last Lift* (to 150 m), then the last kilometre, east along
the southern range: **the Rattler** (a drop, then bends of 30 m left, right, left, six of them), a rail missing,
**the Horseshoe** (a U of 18 m that drops 25 m with the whole bay in front), **the Leap** (a gap of 12 m that
needs the burst), and **the Dive**: 45 m down through the trees, the right rail missing on the way, under the
arch of the finish at the edge of the meadow south of Mostly Up, where the brakes of the terminus stop the car
(at (40, 137)).

**The car is not held by the rails.** It is somewhere along the line and somewhere across it. Speed pushes it
to the outside of every bend — nothing below the speed the bend's lean was made for (16 m/s), more and more
above it; a bend of 55 m leaning 24° pushes at 5.6 m/s² at 24 m/s, 10.5 if it lay flat —; a crest lightens it
(down to three tenths of its weight: the stick bites as much less), a dip weighs on it; **the stick left and
right brings it back** (9.5 m/s², against rails that hold a little: nothing centres the car by itself); **stick
forward lets it run** (a push that fades by 23 m/s), **stick back brakes** (10 m/s²). **Further across than the
sleepers are wide — 1.5 m from the middle over the first kilometre, 1 m over the last — it falls**, and is put
back on the rails at the last pylon with a green flag (twenty of them, never more than 129 m of rails one has
to hold apart), rolling, the clock running: seconds lost, never the run. Three falls running from the same
flag: one is carried on to the next. **The one button is a burst of speed** (9 m/s² for 1.1 s) **that comes
back** after five seconds — and is at hand again at every flag. On a lift the chain does everything.

What reads at a glance, and never changes: the two bright rails are where the wheels go; **the red boards along
the ends of the sleepers are the edge** — the sleepers are as wide as the car may stray, so the track itself
narrows as the game hardens —; yellow and black is a gap: fast over its ramp (two need 18 m/s; who brakes on
the way falls short); red and white arrows say which rail is missing: keep to the other; blue between the
rails is a chain; black and white is a fork; a green flag is a save. Where one's wheels are: the car itself
slides across the rails; near the edge its outer wheel throws sparks, the red board beside it glows white hot
and the mark of the gauge turns red. The gauge is a thing of the game's own at the foot of the screen: the
width of the sleepers, the two rails, the car's mark — its half red where a rail is missing — and whether the
burst is back. The camera rides behind and well above the car, over the rails (nothing of the trestle is ever
between), and looks at the rails just ahead of it: the line runs up the screen from the car, bend after bend.

**Several cars.** A start every ten seconds on the clock everybody shares, each with its name; the line is one
place for everybody (`instance: 0`), so every car on it is seen whatever its start: `update()` puts a blue car
under each visitor who rides (`game.crowd.of()`), where its robot is, leaning as the rails lean there, and
tumbling when that visitor says it is falling (`tell()`: metres along the line, metres across, falling, speed).
Cars do not run into each other.

The hand that plays by itself leans against each bend as it comes (it knows the push it will meet when its hand
gets there), brakes before the bends that would ask more than six tenths of the stick, keeps to the rail that is
left, bursts where the line is straight and before the Leap. With a person's limits — what it does, it does
0.25 s late — it rides the whole line clean at its first try in **146.6 s** (146.55 s in the running game):
never off the rails, never nearer the edge than 70 % of the tolerance, 6 bursts, 113 km/h at the fastest; it
takes the Whirl. The same hand without the delay, braking later and taking the Plunge: 126.5 s. **The stick
untouched**, the chain takes the car up and the first bend throws it off: 25 falls, carried on flag by flag,
380 s. Flat out all the way by the short way, with nothing pushing the car off: 100.5 s — what nobody can beat.
The Leap needs the burst: from the flag before it, it may be pressed anywhere in 3.3 s. For the game's boards:
`coaster: { order: 'asc', min: 100_000, max: 900_000 }`.

What it adds to the world (only when it is on): one group, `coaster` — the line in pieces of 180 m, each built
twice (within 170 m: rails, sleepers, the red boards, stringers, every bent with its girts and crosses; beyond:
two rails and the legs, drawn out to 3 km so that the coaster is seen on the mountains from anywhere in the
valley), the pylons and boards in one mesh, the station — and ten cars kept apart (one's own, eight for the
others, the one that waits). TRIANGLES. No collision: one walks through the station; nobody can get to the
rest. **It takes 165 trees out of the forest while it is on**: those whose crown would reach over the rails.
The forest has no way to be asked for that, so its lists are reached into from `Coaster.js` (`_clearing`: the
cells its near trees are drawn from, the billboards of the far ones, what its shadows are baked from, and the
trunk of each lets go of who walks, the way the world lets go of a thing taken away): a `forest.clear(x, z, r)`
would be the clean way, and it is the one thing here that leans on how the game is made inside.

**What it does not do, and what nobody has seen.** *Nobody has held the stick*: how hard a bend pushes, how
late the car answers, whether a metre is too little at the end and a metre and a half too much at the start are
judgements checked by a bot, not felt by a hand — and a bot leans against a bend by reading its radius, which a
person only sees coming. On a keyboard the stick is all or nothing (it is eased over a tenth of a second): a
bend that asks for a third of the stick is tapped, not held; this may feel twitchy, and only a hand will say.
Nobody has played it on a telephone; the frame rate on a real device was not measured (the pictures were taken
with a software renderer). DUO. The line is long for a first try: 2 min 27 s clean, three lifts in it (34 s of
chain in all): its owner should say first whether the lifts are a rest or a wait. What is weakest: the last
kilometre runs through the forest of the southern slopes, where trees still stand close on both sides and the
view ahead is shorter than on the bare rock of the north and the west; the sparks are small; the fork's rails
overlap the line's for a few metres where they part and meet (no points are drawn); the terminus is plain (an
arch, buffers, a few planks) and its last metres lie across the edge of a meadow one walks on, at knee height;
the bents stand on the rock without footings and some legs come down steep faces; there is no sound of the
chain or of the wheels (only the game's own effects: a click, a squeal at the edge, the burst); no robot tends
the station; the line is not drawn on the map. The pictures were all taken at the lowest quality.
