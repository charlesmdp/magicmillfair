# Mostly Down — the water slide: what is here, and what it takes to make it part of the game

A slide of 1,174 m that leaves the rim of the cliffs above the golden dog (154 m up), winds round the statue,
corkscrews over the sea, runs along the cliffs through the fall, whirls in the bay and ends on the beach, by
the gate where one asked to ride. Two shortcuts (a tighter turn inside a helix), buoys, strips of light, two
stretches whose outer side is cut low, an arch every ninety metres or so where one is put back after flying out.

Nothing of the game was changed to build it: every file is new.

| File | What it is |
|---|---|
| `src/world/zones/games/slide/track.js` | The course: the line, its shortcuts, what lies in it. No renderer. |
| `src/world/zones/games/slide/ride.js` | How one goes down, and a bot that proves it can be done. No renderer. |
| `src/world/zones/games/slide/Slide.js` | What is seen, and the session that drives the player (as `Race` does). |
| `tools/slide-test.mjs` | 28 checks, without a browser: `node tools/slide-test.mjs` |
| `lab/slide/attach.js` | The lab's way of plugging the slide into the running game from outside. |
| `lab/vite.config.js`, `lab/slide/index.html` | The lab page: the game as it stands, plus the slide. |

## Trying it

```bash
npx vite --config lab/vite.config.js
```

then open `/lab/slide/`. It is the whole game (its own room of visitors, `lab-slide`); walk to the north end of
the beach, stand on the round mat under the gate, press **E**. A/D or the arrows steer across the trough, W or
Shift lies back (faster, steers less), S brakes, E leaves.

## Making it part of the game

The slide follows the pattern of the race: `open(player, io)` returns a session that is also the driver of the
player — `{ step(dt, player, control), camera(camera, dt), line, over, time (ms), close(), exit }`.

1. **`src/world/zones/games/GamesZone.js`** — build it with the other games, before the shadows are baked:
   `this.slide = new Slide(this.world, { board: false }).build();`, call `this.slide.update(dt, time, camera)`
   from the zone's update, and hang the usual board where the slide says:
   `this.slide.board = this.scoreStand('slide', spot.x, spot.z, spot.yaw, { title: 'MOSTLY DOWN', sub: 'from the top to the sand · best times', format: formatTime })`
   with `spot = this.slide.boardSpot`.
2. **`src/main.js`**
   - `fair.boards.slide = new Scores('slide'); fair.stands.slide = world.games.slide.board;` and
     `GAMES.slide = [SLIDE.name, formatTime]`.
   - `fairIo.go` starts the clock of the race's board: it must start the slide's when the slide is ridden
     (`go: () => fair.boards[fair.kind === 'slide' ? 'slide' : 'race'].start()`).
   - a `playSlide` beside `playRace` (same refusals: a game already on, dead, a cheat on):
     `fair.session = world.games.slide.open(player, fairIo); fair.kind = 'slide'; fair.after = 0; player.driver = fair.session;`
   - the action: `if (world.games.slide.near(p.pos.x, p.pos.z)) return { label: `Ride ${SLIDE.name}`, run: playSlide };`
   - `fairStep`: the branch of the race already does what a ride needs (`player.update`, `s.camera`, `hud.setRun`).
     At the end: `scoreGame('slide', SLIDE.name, s.time, formatTime(s.time))`, and — unlike the race — the player
     must be put down: in `endGame`, for the slide, `player.driver = null; player.riding = false;` then
     `player.teleport(...)` to `s.exit` when the ride was finished (to the gate when it was left), and
     `rig.snap(player.pos, yaw + Math.PI)`. `lab/slide/attach.js` does exactly this (`leave`).
   - while riding, the slide wants its own field of view: `fair.fov = s.camera(camera, dt)` (as for the race).
3. **`server/scores.js`** — `slide: { order: 'asc', min: 47_000, max: 3600_000 }` in `BOARDS` (the bold bot
   needs a minute; `tools/slide-test.mjs` prints the rule from the course as it stands).
   **`server/catalog.js`** — `slide: 'Mostly Down'` in `BOARDS` (the sponsor's panel of the board).
4. **`tools/net-test.mjs`** — wherever the boards are listed.
5. Then `lab/slide/attach.js` has no use any more.

## What to know

- **Time** advances in steps of 1/120 s whatever the frame rate: a run takes the same time on every device
  (checked at 30, 60 and 144 frames a second).
- **A ride that steers by itself**: `session.auto = 'careful' | 'bold'` (a demonstration, the tests);
  `session.jump(s)` puts the rider at metre `s` (such a ride has no time).
- **Cost**: 14 KB of code once compressed, no image, no model. Built in under a tenth of a second on a desktop
  computer; about 7 MB of memory (3 of geometry, 4 of signs). The trough exists twice: in full (60,000
  triangles) for the stretches within 150 m of the camera, and plainly (7,000) for the rest. From most of the
  valley that is 14 draw calls and 13,000 triangles more (3 %) — the engine draws it even behind a hill; from
  the beach by the gate, 27 draw calls and 44,000 triangles (19 %). What never moves casts its shadow in the
  map baked at load only: no real-time shadow pass, no mirror image in the sea.
- **The top is outside the map** (`MAP_VIEW`): the round map goes dark up there.
- **Nobody walks on the deck or in the trough**: neither has a collider. Someone who flies there falls through.
- **The site of the deck** was chosen between the trees of the rim; the baker knows nothing of the slide, so a
  later change of the forest may plant one there.

## Not done

- Other visitors are seen sliding (their position is relayed as usual), but in the ring only on one's own
  screen, and nobody bumps into anybody.
- The fall the slide passes through does not splash the rider; a buoy that is hit does not move.
- Not tried on a phone (the stick steers, up lies back, down brakes — untested on a real one), nor with a
  crowd on the slide.
- The times of the bots are not a ceiling: the bold one still touches a buoy or two.
