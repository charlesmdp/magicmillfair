### Wild River (`raft`)

*Asked for on 26 November 2026: "a rafting in a river" — a raft, a paddle, rapids, rocks, falls, down to the sea.*

A river of its own comes down a headland of rock that stands in the sea against the foot of the northern
cliffs, north of the golden dog (x 258…516, z -512…-357; nobody walks or swims there). A fall 140 m high drops
from a spring at the brink of the real cliff into its top pool, **the Cauldron**; from there the river winds
through its own canyon — three long reaches and two hairpins, **648 m, 53.5 m down, 8.6 to 13 m wide** (6.6 m in
its narrows, 23 m where it forks round an island) — and goes over a last fall of 9.6 m into a lagoon open to the
sea. One asks to play on the sand at the north end of the beach, at (51.5, -116.5), 21 m from the gate of the
slide: a raft on trestles stands by the arch. One is taken up to the Cauldron, and let go at the gate again.

**Why a headland of its own, and not the mountains.** The brief asked for the bed to be laid just above the
ground along a way where the ground falls by itself. The ground north of the valley does not offer one: it is
hummocks ten to thirty metres high every thirty metres on slopes of 60 to 100 %, with no valley, and the only
free way out to the sea is the top of a cliff 157 m high (the slide and the sea fall hold the rest of that coast).
Searched on the height map from that brink: a course of 700 m at a rafting slope rides on banks 21 m tall at the
median and 40 m at the worst — a channel on stilts; the way the ground really falls is 260 to 300 m long at
30 %. So, as the cleft does with its needles, the river has its own rock, laid in the sea: nothing of the world
is dug or changed, and the real cliff rises behind it — and out of the water of the Cauldron.

**The raft has weight.** The stream carries (2 m/s in a pool, 5 in a rapid, 6.5 in the narrows; quick down the
middle and towards the outside of a bend, slack along the banks); **stick up paddles on, stick down holds
water, stick aside steers** — the crew brings the raft round to where it is pointed in two thirds of a second,
and a bend throws it towards its outer bank. **One button: BRACE.** Pressed in the half second before a rock or
the lip of a fall, it saves the knock (the crew holds on: nobody paddles meanwhile — who braces all the time
goes slower, not safer). A knock takes most of the speed and the paddles for a moment, and spins the raft.
**Taken sideways by a fall or by a great wave, or unbraced over the great fall, the raft goes over**: one swims
two seconds and is back in it at the last flag — there is one at every pool, six in all —, the clock running:
seconds lost, never the run (three times over from the same flag: put back at the next).

Seventeen stretches, easy first: The Cauldron (slack water), First Riffles, **The Rock Garden** (boulders now
on the left, now on the right), Otter Pool, **The Step** (a fall of 2.4 m: the first brace), **The Big Bend**
(a hairpin: a train of waves along its outer bank, a gravel bar inside it that grounds), Heron Pool, **The
Narrows** (6.6 m between walls, the quickest water, rocks at the walls), **The Chute** (3 m, and under it a
white boil that holds a raft: one punches through it straight and paddling, or goes round it by the tongue on
the left), Boulder Alley, Kingfisher Pool, **The Hairpin** (a great wave across it, taken head on), **The
Fork** (to the left of the island the quick water and a rock to thread, to its right the long quiet way), Last
Chance, **The Staircase** (three ledges, a boil under the second), **The Great Fall**, The Lagoon. What reads
at a glance: grey rock in the stream is gone round; yellow and black boards on the banks are a fall — BRACE;
white boiling water holds; pale gravel grounds; a green flag is a save. Nothing moves: the river is the same
for everybody, try after try.

**Several rafts.** A start every ten seconds on the clock everybody shares, each with its name; the river is
one place for everybody (`instance: 0`), so every raft on it is seen whatever its start: `update()` puts a
raft under each visitor who plays (`game.crowd.of()`), on the water where its robot is, turned turtle when
that visitor says it is in the water (`tell()`: how far down the river, and whether swimming). Rafts do not
run into each other.

The crew that plays by itself follows the way down from wherever it is (the quickest water that keeps clear of
the rocks, never asking more than a quarter of a metre across for a metre down), goes straight over the falls
and braces a quarter of a second before each lip. With a person's limits — it sees what comes 0.25 s late —
it runs the river clean at its first try in **90.4 s** (six braces, each 0.22 to 0.26 s before it was needed,
in a window 0.55 s wide; never knocked, never over, never held; 10.6 m/s at the fastest). A clumsy crew — half
a second late, weaving, bracing for one fall in two — gets down in 133 s, knocked eleven times and over three.
Adrift, a raft takes 222 s (twenty knocks, three times over); paddling straight ahead, 144 s. The quickest
water all the way, paddled flat out, would take 85.2 s. For the game's boards:
`raft: { order: 'asc', min: 85_000, max: 900_000 }`.

What it adds to the world (only when it is on): one group, `raft` — the ground of the headland (a lattice of
1.6 m in 60 pieces, each drawn with a quarter of its points beyond 150 m), the water, the falls, some 230
boulders and 490 trees and bushes of its own in six instanced meshes, the gantries, the flags, the gate — and
nine rafts kept apart. No collision: nobody can get there.

**What it does not do, and what nobody has seen.** *Nobody has held the stick*: the weight of the raft, the
lateness of its turning and the half second of the brace are judgements checked by a bot, not felt by a hand —
its owner should say first whether it is too heavy or too easy. **The great fall that feeds it cannot be seen
from the north beach**: the cape of the golden dog stands between; it is seen from the Golden Cove, from the
dog's ledge, from the top of the slide and from the sea. Two real players have not been tried together: the
other rafts were only checked by putting a place of the world back on the river. The river is not drawn on the
map (the map draws the slide's line only: one line of `attractions()` in `src/main.js` would do it). Its trees
are its own, plain ones — not the forest's. Beyond the headland to the north the cliffs of the world are only a
backdrop, and look it from the river's first reach.
