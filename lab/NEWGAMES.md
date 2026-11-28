# Six more games and a place — the brief of whoever builds one

Asked for by the owner of the game on 26 November 2026, in one breath: a war of two armies through the ages, a
raft down a river, a ruin crossed by running along its walls, alleys where robots see one, a little mine train,
a roller coaster one drives oneself, and a great building of stone. Each is an **extra behind a switch of its
own, off as the game is delivered** (`RELEASE` in `src/app/config.js`): with its switch off nothing of it is
loaded, built or shown.

Their ids are declared everywhere already (the switch, `EXTRAS` in `src/extras/index.js`, the lists of
`src/main.js`, the names and boards of `server/catalog.js` and `server/scores.js`, the page `/admin`, the lab
page) and `src/extras/<id>.js` is an empty shell: **building a game is filling its own files**.

| id | name | what it is | board |
|---|---|---|---|
| `ages` | War Through the Ages | two bases on one road, units that march and fight by themselves, turrets, five ages | fastest victory |
| `raft` | Wild River | a raft down a mountain river to the sea: rapids, rocks, falls | best time |
| `walls` | Run the Walls | a ruin crossed by running along its walls, from wall to wall; a fall winds time back | best time |
| `sneak` | Robots Can See You | alleys patrolled by robots that see: slip through unseen | best time |
| `mine` | Little Mine Train | a mine cart through the mountains: lean, brake, jump the gaps | best time |
| `coaster` | Hold the Rails! | a roller coaster one drives oneself through every mountain: stray from the rails and one falls | best time |
| `sanctuary` | The Sanctuary | a great hall of stone — a church, a mosque and a synagogue under one roof — and its deep music | (a place) |

## Read first

- `lab/GAMES.md`, "How each is made": four files a game, and the tools. The top of `src/extras/plug.js`: the
  shape of a game and of its session. `src/world/zones/games/gates.js`: the arch, the shared clock, the starts.
- One game close to yours, whole: `spiral/` (a long course, obstacles, saves, a camera that never has anything
  between it and the player), `lava/` (a field, starts shared by name), `cars/` (a table seen from above, a
  panel of its own), `hill/`, `hollow/` (an inside drawn only for who plays), `slide/` (a ride 1,160 m long laid
  over the ground of the world).
- `tools/lib/check.mjs` (the lines PASS / FAIL, the ground of the world), `tools/game-shots.mjs` (pictures of a
  game in the running game — look at every picture you take), `lab/tools/heights.mjs` (the height of the ground:
  `node lab/tools/heights.mjs grid x0 x1 z0 z1 step`).

## What you deliver

- `src/world/zones/games/<id>/rules.js` — the rules, without a renderer: time in steps of 1/120 s, nothing
  random that is not drawn from a seed or from the shared clock, and **a player that plays by itself with a
  person's limits** (it reacts a quarter of a second late, never needs a moment narrower than 0.25 s). A second,
  clumsy player shows that the game is not won by doing nothing.
- `src/world/zones/games/<id>/<Name>.js` — what is seen of it and how it is played (the shape `plug.js` says).
- `src/extras/<id>.js` — `attach(app)` (replace the shell).
- `tools/<id>-test.mjs` — its checks, without a browser; **the last line it prints is its line for
  `server/scores.js`** (`<id>: { order: 'asc', min: …, max: … }`: `min` a little under what nobody can beat).
- `lab/games/<id>.md` — its section for `lab/GAMES.md`, in the same manner: what it is, where it stands, what
  the bot does, **what it does not do and what nobody has seen**.
- Its own lines, and only those, in the shared lists: `LAB_BOARD` in `src/main.js` (title, sub, where the board
  stands), its line of `server/scores.js`, of `SWITCH` in `public/admin/admin.js`, of `SPECS` in
  `tools/play-test.mjs` (then `node tools/play-test.mjs <id>` passes). Its music is written already
  (`TUNES.<id>` in `src/extras/tunes.js`: `plug` plays it by itself, given `rules` in its options); what it asks
  of you is one function exported by your rules, **`heatOf(state)` → 0 … 1**: how far a run has come, or how
  tense it is (the instruments come in with it).
- Nothing else is touched: not another game, not the ground of the world, not a file of the game. If the game
  itself has to change, say so in your report.

Commit as you go, on your own branch, in the manner of the repository's messages (what changed for whoever
plays, in one sentence). Do not push.

## What the owner has said of the games before these — it is the brief

He is not a developer; he plays, on a computer and on a telephone, and says what he feels. Of the first tries:
"moche, pas ergonomique, injouable, pas fun"; "c'est nul: more fun, better physics, bigger waves"; "four or five
times as long, more room, a rhythm that quickens"; "more kinds of obstacle"; "the up arrow should make it go
forward"; "make it belong to our world". So:

- **Keys anybody knows, at once**: the stick (W A S D, the arrows) and Space; on a telephone a stick and *one*
  button, which is an edge (pressed), never held. Everything must be playable with that. The keys are said in
  one line a thing (`keys` of `plug`).
- **One reads the screen at a glance**: what one stands on, what kills, where one goes next. Strong, plain
  colours with a meaning that never changes (in the spiral: yellow and black is jumped, red and white is slid
  under, navy is gone round). Nothing is ever between the camera and the player; the camera does not turn by
  itself in a way one has to fight.
- **It is beautiful**, and belongs to this world: a fair by the sea in a valley after the atom — painted timber,
  bulbs and bunting, stone, rust, robots. Layered shapes, light painted into the vertices, no flat cardboard.
  Take pictures (`tools/game-shots.mjs`), look at them as he would, and build again what is ugly.
- **Long and varied**: a good player's first clean run takes a minute or two; eight kinds of moment at least,
  easy first, harder as it goes, a rhythm that quickens. **A mistake costs seconds, not the run**: saves along
  the way.
- **Fair**: what is in the way never moves place between two tries, or is seen coming.
- **With others**: several play at once. What moves by itself goes by the clock everybody shares
  (`worldClock()` of `gates.js`) or is drawn from the number of a start (`nextStart`), so that it is **the same
  for everybody, whenever one arrived**. Where the player rides something (a raft, a cart), the others must see
  it too: `update()` runs in every browser that has the game on, and `io.peers()` says where the other visitors
  are — draw the raft under whoever is on the river. Never two players on two different maps in one place.
- **Light**: one group in the scene, few meshes (`Parts`, `MeshBuilder`), nothing at all while the switch is
  off, next to nothing each frame while nobody plays; what is inside a mountain is drawn only for who is in it.
  Sixty thousand triangles in view at the most; the far parts of a long ride are culled.
- **What the checks prove is that it can be played — a bot does it — not that it is a pleasure.** Say so, and
  say what you could not see.

Where things stand already (keep clear of them; look before you build — a picture from above tells): the mill
(-122, -6) and its valley down to the seafront (24, -6); the Great Pond (-168, 70) with the pond game on its east
shore and the boats; the pier (from (16, 6) east, 132 m; the wheel on its head) with the machine of *Mostly Up
& Down* along its south side and the volcano of the lava at (188, 8); the north beach (the waves at (57, -56),
the combs at (84, -84), the island at (150, -84)); the south beach (the spiral's tower at (168, 84), the cleft at
(115, 106), the mine mouth of the Nuclear Cave at (89, 111), whose cave lies under x 36…160, z 141…296); *Mostly
Up* at (0, 80); the slope of the logs; the acid pond (-236, -82) with the golf and the cars' table (-243, -56);
the wheat fields (-62, -124), Lookout Hill (-2, -90), the quad track; in the north-east the Golden Cove
(212, -296), the golden dog, the sea fall (168, -208), the Smugglers' Den (150, -217) and the slide, which comes
down from the cliffs there to the sea; in the west the Stairway (-312, 60), the Lost Temple (-380, 36), the
waterfall (-268, 116) and its torrent up to the High Clearing (-357, 193); the secret cove (178, 196). One walks
inside `BOUNDS` (`src/world/layout/layout.js`). **Built since**: War Through the Ages — a stage of 36 × 8 m in the
west meadow at (-259, -19), its gate at (-240, -13), just south of the cars' table; Wild River — a headland of
its own in the sea against the northern cliffs (x 258…524, z -511…-351), its gate on the north beach at
(51.5, -116.5), 21 m from the slide's; Robots Can See You — a quay in the south of the bay (x 74…138,
z 60…90), its gate on the south beach at (60, 80); the Sanctuary — at (-189, -124), a dome and two towers up to
y 50 or so. **Being built as this is written** (not in this branch yet): Run the Walls — a ruin on a rock in the
sea off the south beach, at (258, 100); Little Mine Train — a station at (-263, -60) and a line of 1,100 m in
and over the north-west mountains (x -438…-212, z -263…-27, y 31…105). The mountains beyond — north of
z -250, south of z 250, west of x -290, up to ±500 — are ground nobody walks: a ride may go there. The sea is
free: several games stand in it.

## The games, one by one

### War Through the Ages (`ages`)

Two bases at the two ends of one road. Gold comes with time and with each enemy that falls; with it one sends
**units that march and fight by themselves** (three kinds an age: a brawler, a shooter, a heavy one) and builds
**turrets** on one's base (a few places). What one's army kills is experience: enough of it and one **passes to
the next age** — five of them, from sticks and stones to the atom, each with its units, its turret, and a
**great blow** that comes back slowly (stones from the sky … the atom). The base of the other falls: won. The
other side is played by the game, and does not cheat (same gold, same prices): it must be beatable by a
newcomer in four or five minutes and give a good player a reason to go faster. Score: the time of the victory.

Seen from the side, as a long toy battlefield (a table, a stage: see how the cars' table is done), with a camera
that does not move by itself; the armies are small robots dressed for their age. **What one buys is on a panel
of the game's own** (buttons with a price that fill as they come back — a finger and a mouse press them; the
keys 1 … 6 do the same). One's robot stands at the table; nothing of the battle is seen by the others yet.

### Wild River (`raft`)

A raft, a paddle, and a river that comes down a mountain to the sea in six hundred metres or more: slack water
where one learns, rapids, rocks that stop and spin, standing waves that throw, a hole that holds, narrows, forks
round an island, falls — a great one at the end. The stream carries; **the stick steers and paddles** (forward
paddles on, back holds water), with weight: a raft slides and turns late. **The button is "brace"**: pressed
just before a rock or a fall it saves the knock. Taken sideways by a fall or a great wave, the raft goes over:
one swims, climbs back, and has lost seconds. A flag at each pool is a save. Several leave together (a start
every ten seconds, by name) and see each other's rafts.

It is a *river*, not a flume: wide (eight to twelve metres), banks of rock and earth with trees, water with
foam where it breaks (`src/world/water/Falls.js`, the stream of the slide). The ground of the world cannot be
dug: lay the bed a little above it, along a way where the ground falls by itself (follow the slope, as water
would; `lab/tools/heights.mjs`), and let the banks go down into the ground. The mountains north of the valley
are free; the slide and the Golden Cove are not.

### Run the Walls (`walls`)

A ruin of pale stone — arcades, a hall without a roof, a tower — crossed from one end to the other by what the
walls allow: **running along a wall** (one jumps at it at a run and runs on along it for a second, in an arc),
**from wall to wall** across a gap, **up a wall** to a ledge one grabs, swinging round a pole, columns one hops,
blades and spikes that keep time, floors that give way. And **time winds back**: a fall, or a blade, and the last
three seconds run backwards before one's eyes to the last sure footing (three such in reserve, filled again at
each save; none left: back to the save). The camera stays on the open side of the course: the ruin is built for
it, wall on one side, sky on the other.

### Robots Can See You (`sneak`)

A yard of alleys — crates, containers, sheds — and robots on their rounds. **Each has a cone of sight drawn on
the ground**; cameras sweep, a searchlight crosses the yard, a beam of light blinks. One goes through, picks up
three cores, and reaches the door. **Stick: walk; held gently or with the button: crouch** (slow, silent, hidden
behind what is low). Running is heard: a ring on the ground says how far. Seen for more than half a second:
caught, back to the last save, seconds lost. Seen from high up, three quarters, so that the alleys read as a
map. The rounds go by the shared clock: the same for everybody, learnt run after run; several can slip through
together.

### Little Mine Train (`mine`)

A small train of ore carts leaves a station at the foot of the west mountains, is hauled up inside the rock,
and runs away: tunnels (drawn only for who rides), trestles over the gullies, a spiral, a drop into the dark, a
lake under the mountain. **The stick leans the cart** (into the bend, or it tips and leaves the rails) and
**brakes** (back) before what is too sharp; **the button hops** it over a gap in the rails or a rock on them;
at a fork one leans to choose — the short way is the hard one. Nuggets along the line take a little off the
time. Off the rails: back on them at the last signal, seconds lost. Several trains leave ten seconds apart.

### Hold the Rails! (`coaster`)

A roller coaster that goes round every mountain of the valley — north, west, south: two or three kilometres —
**and that one drives**: the car is not held by the rails, the stick keeps it on them. The line bends, banks,
dips; speed pushes one out of every bend; **further than a metre or so from the rails, one falls** (and is put
back at the last pylon with a flag, seconds lost). The button is a burst of speed that comes back. What reads at
a glance: the two rails and the sleepers ahead, a mark of where one's wheels are on them, sparks when one is at
the edge. Gaps one jumps, a rail missing on one side, forks. The first kilometre forgives, the last does not.
Lifts between the ranges give the eyes a rest and the view. Keep it over ground nobody walks, or well above it.

### The Sanctuary (`sanctuary`)

"A great building of stone, very beautiful — in the mountain if need be — in which one sees a mosque, a church
and a synagogue, with a very deep gospel music." One great hall under a dome, cut into or built against the
rock, reached on foot: a façade one sees from far, tall doors, and inside three chapels of equal dignity round
the middle — an apse with an altar, a rose window and benches; a prayer hall with its niche, its pulpit of
steps, carpets and a lattice of stars; an ark with its scrolls, a reading desk, a lamp of seven branches. Light
comes down from the dome and through coloured glass (painted into the vertices and with a few glowing panes: no
new kind of light). No game there: one walks in, looks, sits. The symbols are drawn with care and none above
another. `src/world/zones/places/Temple.js` and `Caves.js` show how a place one walks into is built (floors as
platforms, an inside under the ground). Its music is written afterwards (the deep choir): leave the place where
it is heard (`sanctuary.inside(x, y, z)`).

### A plane in the sky (`plane`)

"Rajouter avion dans le ciel et quand on le regarde on a un message en mode « bizarre un avion, tout était censé
s'être arrêté »" — only if the game weighs next to nothing more. Every five minutes an airliner crosses high over
the oasis (520 to 700 m up, a kilometre aside at the least: never overhead), from one haze to the other in about
fifty seconds, a white trail behind it. Whoever keeps it in the middle of their view for a moment reads what
their robot thinks — "A plane?… Strange. Everything was supposed to have stopped." —, once a pass, a new thought
at each of the first sightings (`THOUGHTS`, counted in the browser: `mmf.plane`), never during a game nor under
a roof of rock. Where the plane is comes from the server's clock alone (`planeAt(ms)`): everybody sees the same
pass at the same moment, and nothing is sent. Its switch is **on as the game is delivered** (the owner asked for
it to be there). What it weighs: `src/extras/plane.js` (4.4 KB, 2.2 KB once packed), two meshes of 168 triangles in
all, drawn one minute in five. `node tools/plane-test.mjs` (17).

### Diving, and the Diver's Rest (`dive`)

Asked for on 28 November 2026: "to be able to dive under the water, and a secret cave under the water — behind
a toggle, so that the game is no heavier without it". Not a game: a way of moving, and a place to find. Switch
`dive` (`RELEASE`), **off as delivered**: with it off nothing of it is asked for, loaded, built or drawn, and no
file of the game runs a line more.

**Diving.** Where the water is three metres deep or more, a swimmer is offered "Dive" (the E key, or a tap on the
prompt). Under, one swims in three dimensions: the stick goes where the camera looks — down and up with it —,
Space and C go straight up and down, Shift is faster; on a telephone the stick and the look do it all, the arrow
kicks one up, and the prompt "Back up to the surface" brings one up. Reaching the surface where there is air
over it gives the ordinary swimming back. No gauge of air: a robot does not breathe. The open sea stays the
shark's: within its reach (`SHARK.far`, 46 m from where the sea ends) one is not offered to dive, and a diver is
held at that line.

**Under the water** (only while the camera is under it): a veil of colour that thickens with the depth — the
haze of the world itself, lent the colour of the water and given back —, the surface seen from below with its
net of light, bubbles from every diver, weed on the bed and a shoal round the rock (one instanced mesh each),
the sound dulled by a low-pass filter. The game's mirrored view of the world is not rendered meanwhile: a frame
under the water costs less than one above it.

**The Diver's Rest.** A stack of rock in the south-east of the bay, **its middle at (202, 58)**, on a bed seven
metres down: 20 m across, 8 m over the sea, solid to the eye from the shore and from above. Its arch is at its
foot, on the side away from the beaches — **at (206, 69), its crown four metres under the waterline** —; a
passage runs fourteen metres under the rock to a chimney that comes up into the pool of a chamber: a pocket of
air, a strand of sand **at about (197, 58)**, crystals that glow, a log to sit on, and a copper diving helmet
from before which has its word to say (it is not one of the thirty relics). A line says one has found it, kept
in the browser (`mmf.dive.found`); nothing is on the map. The hint, for who looks: a thread of bubbles from the
arch — rings on the water where it breaks the surface — and a glow over the arch.

The ground of the world cannot be dug while the game runs (its caves are baked), so the rock is its own:
`src/world/zones/places/deep/plan.js` is ONE function that says where it is solid, from which everything is
drawn — its mesh (surface nets), what stops a diver, the ring of obstacles and the two floors the game's own
walker meets, what no camera may cross. `Deep.js` is what is seen; `src/extras/dive.js` plugs it in from outside:
the diver is a driver of the player (as in the games), and three methods of the running game are wrapped —
`interact.update` (the prompt for a swimmer), `rig.update` (the camera goes under; near the rock no camera
looks through it), `ripples.trail` (no rings over who swims deep). The others see a diver at their true depth:
the game's own message of where one is carries it.

Its checks: `node tools/dive-test.mjs` (39: the rock alone — the only way in is under four metres of water, a
body goes through, the walker is shut out and in —, then a bot in the running game that swims out, dives, finds
the arch, comes up in the chamber, walks the strand, and swims back out and up; the shark keeps its water) and
`node tools/dive-duo.mjs` (7: two visitors — a diver is drawn for the other at their true depth, two divers see
each other, who is in the cave is not named through its rock; a picture of each screen). Pictures:
`node tools/game-shots.mjs dive mouth=209.4,-5.5,81.3,15.5,-2` (the free camera goes under the water while the
switch is on).

### Toy weapons (`weapons`)

"Des armes — quand je tire sur un robot, ça le « tue » (momentanément, comme lorsqu'on mange un champignon).
Activable par token." (the owner, 28 November 2026). Not a game and not a place: the toys of a fair that anybody
can draw anywhere, `src/extras/weapons.js`. A **cork gun** (slow and long: 28 m, a second and a half to push the
next cork in, the cork flies and has to be aimed) and a **spark zapper** (quick and short: 9 m, at once, again
half a second later). A robot that is hit falls exactly as after a strange mushroom (`player.die`: the same
screen, "Corked by Alice"), lies there 3.6 s, stands again where it fell — on the very floor it lay on, having
come down to the ground if it was hit in the air — and is then **out of reach for six seconds**, in a bubble
that shimmers. No blood, nothing military: tin, brass, a cork with a red end.

- **Its switch**: `weapons`, off as delivered (page /admin: "Toy weapons"). Off: nothing of it is downloaded,
  no key, no button, nothing travels.
- **Keys**: `C` draws the toy and puts it away, `N` changes it, a click on the world fires where the sight
  looks (at once while the mouse is locked; otherwise a click that did not drag the view). The sight is the
  game's own, above the middle of the screen — one's own robot stands in the middle. **On a phone**: one round
  button by the pads (the cork gun, then the zapper, then away) and a red one under it that fires; a finger is
  helped — the robot nearest the sight within a narrow cone (`cone`, radians) is the one.
- **Who decides that a robot falls: the browser of the one who is hit**, from what it knows itself (`judge()`):
  where it stands and what it is doing, where *the relay* places the one who shot (never what the message
  says), the toy's range plus four metres, whether a building or the ground stands between, and that the toy
  was not heard again sooner than half its reload. A shot is a small message through `Presence.sendThing`
  (kind 9; no change to the protocol): "this toy, at that visitor, it lands there" — everybody near draws it,
  the one it names decides, then says "I fell, by whom" (or, once a second at the most, why not).
- **Where toys do nothing** — neither firing nor being hit (`quiet()`): in a game (`fair.session`,
  `player.driver`, the timed climb), seated or on a ride, in the water, in a cave, in The Sanctuary, within
  **25 m of where newcomers arrive** (`SPAWN`: x −121.8, z −60), on who is typing or in a menu, on who lies
  there or has just stood up. Barnaby cannot be felled: he shakes his head and says a dry word to who fired.
- **`ONLY_ARMED`** (a constant at the top of the file, `false`): set to `true`, only those who have their own
  toy drawn can be felled — a duel between the willing.
- **What it reaches into** (no file of the game is changed): `Character._keep` / `_ik` (the right hand is put on
  the grip after the robot has been animated), `world.sparks._spawn`, `audio.effects` (its four sounds are made
  there), `RemoteAvatars.update` (wrapped: the others' arms are bent after they have been animated).
- **What it weighs**: `src/extras/weapons.js` (21 KB, 9.7 KB once packed), downloaded only when the switch is
  on; each toy is a few boxes and cylinders, its sounds are made by code.
- **Its checks**: `node tools/weapons-test.mjs [--shots=<folder>]` (31 checks) — the game as built, its own server, two
  browsers in one room (then a third, phone-sized, with a finger): off, on, the mill, Barnaby, a fall and the
  shimmer, typing, seated, too far, a forged shot, a fall from nine metres up, a cave, The Sanctuary, a game,
  the duel, ten shots claimed in a second.

### The Velvet Gasket, a hidden cabaret of robots (`bar`)

Asked for on 28 November 2026: "un bar de strip tease pour robots où faut payer avec des fleurs (vu qu'elles
servaient à rien), avec de l'alcooil, mets le dans une grotte, caché". A joke, and a clean one: what comes off on
its stage is hardware. Not a game: a place to find. Switch `bar` (`RELEASE`), **off as delivered**: with it off
nothing of it is loaded, built or drawn — no cave, no hole in the ground, no robot, the boulders as they were.

**Where.** A cave of its own under the southern slopes, **its mouth at (-65, 177.8)**, facing north, sixty metres
south-east of the Old Tree: from the mill, walk south past the Great Pond to the Old Tree, then on to the south-east,
to the foot of the rock face, where a slab of fallen rock stands between two boulders. The mouth is behind the slab;
a small red lantern over it is lit only for who comes within 22 m. Not on the map (its place is `hidden` and added
after the map is made), no sign, and Barnaby does not speak of it. The gallery runs due south (x = -65): a low
passage, the door at z = 185.6, the room from z = 188 to 209, its floor at 33.3, a dozen metres and more under the grass.

**Inside.** A doorman, Hinge, behind his hatch: the cover is three flowers (the bouquet in hand, spent from its last
flowers as the plaques and the golden dog spend one); without them he says where flowers grow. Then a low vaulted
room in red and gold: a counter (the barman, Sump, the bottles of "Alcooil", the card of drinks on a slate, a
red sign), three round tables with four robots of the house sitting at them and four free chairs, three stools — one
sits on any — and a little stage with its curtain, footlights and a night sky. The show goes by the server's clock
(everybody in the room sees the same moment): a number of 84 s, then 36 s of pause, for ever — a drum roll, Miss
Peony Piston dances with two fans of feathers and takes off her hat, a shoulder plate, her chest panel (cogs), her
back plate (her key), and on the last roll her shell opens and a smaller robot steps out, dances and bows. E (or the
prompt, on a phone) by the stage throws a flower: she spins, the room cheers. At the counter a glass costs a flower:
the robot raises it (a "cheer" emote, which the others see), says "hic!" now and then, and for a minute the world
sways a little (2° at the most, after the third; not at all for who asked their device for less motion); three a night. Its tune
(`TUNES.bar`: a slow swung cabaret in D minor, brushes, a walking bass, a muted horn once the curtain is up) is
heard only in the cave, faintly behind the door. With the extra `caves` on, it is a safe place as every cave is
("Nearby" chat).

**How.** `src/extras/bar.js` plugs it in from outside: the cave is the game's own machinery used while the game
runs — `buildCave` of Caves.js for the gallery, `collision.addArea` for where one walks, `terrain.setHoles` for the
hole at the mouth (added to those already cut) —, the props of the world are left alone but for two boulders of the
valley (props/Rocks.js) that stood in the mouth: one is taken away, one pushed up the slope, with what stops one.
`src/world/zones/places/bar/`: `plan.js` (numbers and words alone: where, the card, the lines, the show), `Bar.js`
(what is seen; its light painted into the vertices), `Star.js` (the star and what comes off her). No file of the
game is changed. What it weighs: its chunk is 41 KB (17 KB packed); 53 meshes and 38,000 triangles, drawn only
within 48 m of the mouth.

Its checks: `node tools/bar-test.mjs` (24: the plan — the number and its steps, how a bouquet is spent —, then in
the running game: off, nothing; on, the cave dug, its boulders cleared, a walk round the slab and under the ground to
the door, the doorman refusing none and two flowers and taking three of six, a glass and its minute of sway, three
glasses and no more, a flower on the stage, the curtain down keeping it, the number step by step, the tune and the
"Nearby" chat inside, and everything stopped once out). Pictures (the free camera is kept over the ground: a shot
lets it go under): `node tools/game-shots.mjs bar room=at:-65,193,180 'go=js:__mmf.free.groundAt=()=>-1e9'
counter=-63.4,34.9,195.6,-90,8`.
