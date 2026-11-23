# Mostly Down — the water slide: what is here, and what it takes to make it part of the game

A slide of 1,160 m that leaves the rim of the cliffs above the golden dog (154 m up), winds round the statue,
corkscrews over the sea, runs along the cliffs through the fall, whirls in the bay and ends **over the sea**:
one flies off the end of the trough, comes down in the water and swims the ten metres back to the beach, where
the gate is.

How it plays:

- **The stream.** Water runs down the middle of the trough. In it one is carried (70 km/h and more); beside it
  one is not; up by the rim one loses speed. The trough only half leans into its bends, so a bend throws its
  riders out of the stream: one steers to stay in it.
- **Over the edge.** Too far up a side and the ring really goes over the rim: it tips out, falls down the outside
  of the trough (the camera stays and watches), and its rider is put back at the last arch with the clock
  running. Three falls running from the same arch, and one is put back at the next: nobody is left stuck.
- **The jump** (Space, the jump button on a phone): over the rolls that lie across the stream (ridden into, they
  throw one head over heels and take most of the speed), over the whirlpools for who dares.
- **Whirlpools** (9): in the stream. They hold whoever rides into them, spin them for a second and a third, and
  let them go slowly. One goes round them — on the dry side, which is slow — or jumps them.
- **Gaps** (3): the trough stops, and goes on nine or ten metres further. At speed the ramp at the lip throws one
  across; slowly, one must jump at the lip, or fall short. An arch stands a run-up before each.
- **Shortcuts** (2): a tighter turn inside a helix, for who keeps to its side.
- Lying back (W, Shift) is faster and steers less; S brakes.

Nothing of the game was changed to build it: every file is new.

| File | What it is |
|---|---|
| `src/world/zones/games/slide/track.js` | The course: the line, its gaps, its shortcuts, what lies in it. No renderer. |
| `src/world/zones/games/slide/ride.js` | How one goes down, and a bot that proves it can be done. No renderer. |
| `src/world/zones/games/slide/Slide.js` | What is seen, and the session that drives the player (as `Race` does). |
| `tools/slide-test.mjs` | 52 checks, without a browser: `node tools/slide-test.mjs` |
| `lab/slide/attach.js` | The lab's way of plugging the slide into the running game from outside. |
| `lab/vite.config.js`, `lab/slide/index.html` | The lab page: the game as it stands, plus the slide. |

## Trying it

```bash
npx vite --config lab/vite.config.js
```

then open `/lab/slide/`. It is the whole game (its own room of visitors, `lab-slide`); walk to the north end of
the beach, stand on the round mat under the gate, press **E**. A/D or the arrows steer across the trough, Space
jumps, W or Shift lies back (faster, steers less), S brakes, E leaves.

## Making it part of the game

The slide follows the pattern of the race: `open(player, io)` returns a session that is also the driver of the
player — `{ step(dt, player, control), camera(camera, dt), line, over, time (ms), ended, exit, drop(player), close() }`.
The session reads the keys itself (`player.input`: the stick, run, jump): there is nothing to wire.

Two moments end a ride, not one:

- `over` — the rider has passed the last arch: the clock has stopped, `time` is the run's. The score is sent
  now. The session goes on driving the player: they fly off the end of the trough and come down in the sea.
- `ended` — a second or so later: they float in their ring and have turned to face the beach. Now the game lets
  go: `session.drop(player)` puts the player in the water there, swimming, facing the sand (and closes the
  session; the ring stays adrift for a while). Then `rig.snap(player.pos, player.yaw + Math.PI)`.

1. **`src/world/zones/games/GamesZone.js`** — build it with the other games, before the shadows are baked:
   `this.slide = new Slide(this.world, { board: false }).build();`, call `this.slide.update(dt, time, camera)`
   from the zone's update, and hang the usual board where the slide says:
   `this.slide.board = this.scoreStand('slide', spot.x, spot.z, spot.yaw, { title: 'MOSTLY DOWN', sub: 'from the top to the sea · best times', format: formatTime })`
   with `spot = this.slide.boardSpot`.
2. **`src/main.js`**
   - `fair.boards.slide = new Scores('slide'); fair.stands.slide = world.games.slide.board;` and
     `GAMES.slide = [SLIDE.name, formatTime]`.
   - `fairIo.go` starts the clock of the race's board: it must start the slide's when the slide is ridden
     (`go: () => fair.boards[fair.kind === 'slide' ? 'slide' : 'race'].start()`).
   - `fairIo.splash = (x, y, z, strength) => world.ripples.splash(engine.time, x, y, z, strength)` (rings on the
     water where a rider falls in; optional).
   - a `playSlide` beside `playRace` (same refusals: a game already on, dead, a cheat on):
     `fair.session = world.games.slide.open(player, fairIo); fair.kind = 'slide'; fair.after = 0; player.driver = fair.session;`
   - the action: `if (world.games.slide.near(p.pos.x, p.pos.z)) return { label: `Ride ${SLIDE.name}`, run: playSlide };`
   - `fairStep`: the branch of the race already does what a ride needs (`player.update`, `s.camera`, `hud.setRun`).
     When `s.over` turns true: `scoreGame('slide', SLIDE.name, s.time, formatTime(s.time))` — once. When
     `s.ended` turns true: `s.drop(player)`, `rig.snap(player.pos, player.yaw + Math.PI)`, and the game is over
     (no teleport: the player is where the slide left them, in the sea, and swims back).
     A ride left before its end (E): `s.close(); player.driver = null; player.riding = false;` and
     `player.teleport(...)` to the gate. `lab/slide/attach.js` does exactly this (`leave`).
   - while riding, the slide wants its own field of view: `fair.fov = s.camera(camera, dt)` (as for the race).
3. **`server/scores.js`** — `slide: { order: 'asc', min: 44_000, max: 3600_000 }` in `BOARDS` (the bold bot
   needs 57 s; `tools/slide-test.mjs` prints the rule from the course as it stands).
   **`server/catalog.js`** — `slide: 'Mostly Down'` in `BOARDS` (the sponsor's panel of the board).
4. **`tools/net-test.mjs`** — wherever the boards are listed.
5. Then `lab/slide/attach.js` has no use any more.

## What to know

- **Time** advances in steps of 1/120 s whatever the frame rate: a run takes the same time on every device
  (checked at 30, 60 and 144 frames a second).
- **The times to beat** (`botRun`): a careful rider 1:05.8, a bold one through both shortcuts 0:56.8, someone who
  touches nothing 1:47 (into 8 whirlpools and 13 rolls).
- **Tuning** is in two places: `RIDE` in `ride.js` (the push of the stream, the drag of the sides, the steering,
  the jump, how long a whirlpool holds…) and `SLIDE` / `LEAN` / `COURSE` in `track.js` (the width of the trough,
  how much it leans into its bends, the stretches). After a change: `node tools/slide-test.mjs`.
- **A ride that steers by itself**: `session.auto = 'careful' | 'bold' | (state, input) => …` (a demonstration,
  the tests); `session.warp(s)` puts the rider at metre `s` (such a ride has no time).
- **Cost**: 16 KB of code once compressed, no image, no model. Built in under a tenth of a second on a desktop
  computer; about 7 MB of memory (3 of geometry, 4 of signs). The trough exists twice: in full for the stretches
  within 150 m of the camera, and plainly (a fifteenth of the triangles) for the rest. From most of the valley
  that is 15 draw calls and 13,000 triangles more (3 %) — the engine draws it even behind a hill; from the beach
  by the gate, 27 draw calls and 39,000 triangles (17 %). What never moves casts its shadow in the map baked at
  load only: no real-time shadow pass, no mirror image in the sea.
- **The top is outside the map** (`MAP_VIEW`): the round map goes dark up there.
- **Nobody walks on the deck or in the trough**: neither has a collider. Someone who flies there falls through.
- **The site of the deck** was chosen between the trees of the rim; the baker knows nothing of the slide, so a
  later change of the forest may plant one there.

## Not done

- Other visitors are seen sliding (their position is relayed as usual), but in the ring only on one's own
  screen, and nobody bumps into anybody.
- The fall the slide passes through does not splash the rider.
- A rider who goes over the edge falls through whatever part of the slide lies below (only the ground and the
  water stop them).
- Not tried on a phone (the stick steers, the jump button jumps, up lies back, down brakes — untested on a real
  one), nor with a crowd on the slide.
