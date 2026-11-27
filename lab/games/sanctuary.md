### The Sanctuary (`sanctuary`) — a place, not a game

*Asked for by the owner: "a great building of stone, very beautiful, in which one sees a mosque, a church and a
synagogue" — and, for its music, "something like a temple's chant". Behind its switch, off as delivered: with the
switch off nothing of it is loaded, built or heard.*

One great hall of pale stone under a dome, at the foot of the cliff that closes the west meadow in the north (its
middle at (-189, -124), its floor at 24.3 m; its doors look south-south-east, down the meadow towards the mill). A
front with two towers and a rose of coloured glass, a stair of twenty-four steps up to tall doors. Inside: a round
middle twelve metres across under the dome and its eye, a round bench, and four arms of the same size — the one of
the doors and **three chapels of equal dignity**: a mosque to the left of who walks in (the niche, the pulpit of
steps, carpets, a window of stars, a crescent), a church ahead (an altar and its cross, a rose, benches), a
synagogue to the right (the ark and its scrolls behind a curtain, the reading desk, the lamp of seven branches, a
star of six points). Light falls from the eye of the dome and through coloured glass (painted into the vertices,
a few glowing panes). No words of scripture anywhere: ornament, geometry and light.

One walks in and looks; walls, columns and benches stop one, the floor and the steps carry
(`src/world/zones/places/sanctuary/plan.js`: the plan in numbers alone; `Sanctuary.js`, `chapels.js`: what is
seen). `src/extras/sanctuary.js` builds it and plays its music for who is inside: `place.inside(x, y, z)` → 0
well outside, about 0.1 at the door, 1 under the dome.

**Its music** (`TUNES.sanctuary` in `src/extras/tunes.js`) is a chant written for this hall — men's voices alone,
one line in the first mode on G, no beat to count: the tenors from the door on, the basses an octave under them as
one walks in, and under the dome a second choir a shade out of tune with the first, a few voices a fifth above, a
held note under it all. It is as loud as one is far inside. (A first version was a slow gospel; its owner asked for
the chant instead.) `node lab/tools/tune-listen.mjs sanctuary --out=<folder>` writes it as a .wav.

`node tools/sanctuary-test.mjs` (15): with its switch off nothing of it is in the world; switched on, the player
put at the door walks in by the game's own controller, reaches the middle and each of the three chapels, is
stopped by a wall; `inside()` is 0 far away and 1 under the dome.

What nobody has done: walked in it with a hand, on a telephone, or with somebody else; heard the chant in the
hall rather than on a file.
