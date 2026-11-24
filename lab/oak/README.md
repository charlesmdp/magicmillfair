# Out on a Limb — the Great Oak: a trial, set aside

A climb up the old tree of the clearing, made twice as tall: branches to walk along, dead wood that breaks,
three nets, a crow's nest at 66 m. It works — `node lab/oak/oak-test.mjs` passes, a bot climbs it with the real
controller — and **it is not fun**, which is why it stays here and is not offered to the game. Only the lab page
has a switch for it (off unless asked for: `/lab/?oak=1`).

What the owner found, playing it:

- **the camera is a disaster**: in a crown full of limbs it is forever inside wood or against the back of the
  robot's head;
- **the branches are hard to see**: bark on bark on leaves — nothing says "this is where you go next";
- **staying on a branch is far too hard for a human**: a round branch 0.8 to 1.2 m wide, that turns, walked at
  8 m/s with a camera that turns too;
- nothing of the pleasure of the other games.

What the checks proved was that the climb *can* be done (a bot that aims its landings to the centimetre), not
that anyone would want to. A second attempt should start from what makes Mostly Up pleasant — holds that read at
a glance against the sky, a camera with nothing between it and the player, one clear thing to do at a time — and
keep the tree as scenery rather than climb inside it: outside the crown, or round a bare trunk.

**A second attempt has begun: `floor/`** — one floor, for its owner to try in the lab (`/lab/`, "Chêne : un
étage à essayer"). An old snag stands in the clearing with four limbs curling round it over a net. On a limb one
cannot fall: one goes along it. The game is the jump from limb to limb: a ring of light shows where it would end,
green on a limb, red in the net, and one still steers a little in the air. One limb sways, one is dead wood that
cracks under who lingers; the net puts back on the limb one left. The camera is put by the game, outside the
tree. `node lab/oak/floor/test.mjs` (13) says that it works — not that it is a pleasure: that is the question.

What is here of the first attempt, if any of it is of use again:

- `giant.js` — moves and grows a tree of the forest in the running game (its matrices, its far picture, its
  place in the forest's grid), and prunes branches and leaf cards off its model;
- `tree.js` — reads a tree's skeleton back from its mesh, and searches a way up between its limbs
  (`node lab/oak/oak-course.mjs` writes it down in `route.js`, so that it is the same on every device);
- `Oak.js` — bark tubes with a flat top to walk on, bracket fungi, nets drawn by a shader, wood that breaks and
  grows back, the clock from a plate to a bell;
- `extra.js` — how it plugs into the running game; `oak-test.mjs` — 25 checks.
