### Robots Can See You (`sneak`)

*Asked for on 26 November 2026: "a game in which one has to hide because robots see us (one goes between
alleys, etc.)".*

A yard on a quay of its own, in the sea in the south of the bay (x 74…138, z 60…90: south of the pier and of the
machine of *Mostly Up & Down*, north of the cliffs, 30 m short of the spiral's tower; its floor 1.5 m over the
sea). One asks to play on the sand of the south beach, at (60, 80), 12 m from the gate of the spiral; a gangway
of planks goes from the arch to the quay. One is put at the near end of the yard and let go at the arch again.

**The yard is 30 × 64 m, five rooms in a row** between walls, and one goes through it away from the beach, "up"
the screen. Containers are drawn cut low (1.5 m) so that every alley reads as on a map; crates, sandbags and
planters of tall grass are lower still. **Three cores** glow in it; each opens a gate (the bars sink), the last
one the door out. **A save at the door of each room.**

1. **The first alley** — one robot walks an alley between two rows of containers; one waits in a gap, crosses
   behind it to the gap on the other side.
2. **Round the block** — two robots go round a block of containers, one after the other; alcoves to let them
   pass; core 1 in a notch of the block.
3. **The camera and the beam** — a camera sweeps a square that one crosses crouched behind a wall of sandbags
   (or at a run while it looks away); a beam of light blinks across an alley (it flickers before it comes on);
   a second camera watches the way to the door, a crate half-way.
4. **The open yard** — the searchlight: a pool of light that goes to and fro, seen from its tower (what stands
   in its way casts a shadow in it); a robot that turns on the spot, all the way round in nine seconds, and
   hears; core 2 behind its sandbags.
5. **The last alley** — a guard that stands with its back turned, and listens; a second beam; a patrol along the
   last alley, alcoves on the way to core 3 at its far end and back to the door.

**Seeing is drawn.** Each robot and camera has its cone on the ground, cast against what hides: it stops at
containers and walls — and at crates, sandbags and grass *while one crouches*: what is drawn is exactly where
one would be seen as one stands at that moment. Blue: calm. Amber: it has heard something, or begins to see
one. Red: caught. A meter over one's head fills while one is in a cone: full after half a second in plain
sight, after more than a second at the far end of a cone, at once at arm's length; it empties in under a
second out of sight. **Caught: one falls, is put back at the last save, and ten seconds are added** — never the
run.

**The moves.** The stick walks; pushed all the way while standing, one runs (5.2 m/s) — and **a run is heard
5 m around**: a ring on the ground shows how far, and a robot inside it pricks up (its cone turns amber), then
turns its head to where the noise was, for a second and a half. **One button toggles crouching**: slow
(1.9 m/s), silent, hidden behind anything low. On a keyboard the stick is all or nothing: one runs, or one
crouches. Nothing else: no fighting, and the robots never chase.

**The rounds go by the shared clock** (`worldClock()`): the same for everybody, whenever one arrived, learnt run
after run; only where a robot *looks* is turned for a moment by a noise, in the browser of who made it. Several
slip through at once and see each other (a robot that sees a friend catches the friend: each browser keeps its
own meter). Score: the time from the first step to the door, ten seconds added for each time caught
(`sneak: { order: 'asc', min: 20_000, max: 1800_000 }`).

**The view.** From high behind (17.5 m up, 61° down), looking along the yard, following softly, never turning:
on a wide screen the whole width of the yard is in the picture; on a telephone held upright the camera is
higher and one sees further ahead. Stick up is the way one goes.

**The player that plays by itself** goes from hiding place to hiding place along a way of 66 points (222 m); at
each it watches the rounds — it knows them, as one who has played — and leaves a quarter of a second after it
has seen a moment that stays good for a quarter of a second more: at a run if no robot would hear it, crouched
if not. It never needs anything a stick and one button cannot do. From twelve different moments of the rounds
it gets through in 2 min 05 to 2 min 37, never caught. A clumsy one — it runs everywhere, never crouches, looks
only ten metres ahead and leaves as soon as nothing looks there — is caught 3 to 21 times and still ends at the
door, in 3 min 30 to 10 min 30. Standing still, no time runs and nothing is reached.

`node tools/sneak-test.mjs`: 30 checks. `node tools/play-test.mjs sneak`: see below.

**What it does not do, and what nobody has seen.**

- Nobody has played it by hand: the checks prove that it can be done with a person's limits, not that it is a
  pleasure, nor that the rooms are in the right order of difficulty for a newcomer.
- The others' meters, their crouching and their noise are not shown: a friend is seen walking (leaning when
  crouched is one's own picture only), and a friend's run does not turn the robots in one's own browser.
- The quay is not ground: one who swims to it sees the yard from the water and cannot climb on it; nothing of
  it is a wall for who is not playing.
- There is no crouching pose in the game's avatar: crouched, one's robot leans forward and sinks a little.
- The yard is painted for the night (dark paving, warm pools under the lamps) but lit by the day of the world:
  no new kind of light was made.
