# Five games being tried

Five games made in the lab, for their owner to try and judge. **Nothing of them is in the game**: every file is in
this folder, and only the lab page switches them on (`lab/lab.js`: "NOUVEAU · …", and a button that takes one to
each). They borrow the *mechanics* of games one knows — never their look, their names or their levels.

| Switch | What it is | Where it stands | Its checks |
|---|---|---|---|
| `waves` | **Wave Goodbye** — the sea comes in over a bar of sand: one is drawn out, and jumps what comes, for as long as one can | the north beach: a bar from (47, -60) to (103, -39) | `node lab/games/waves/test.mjs` (21) |
| `lava` | **Thin Crust** — basalt columns that warn, then sink into the lava of a crater: the last ground standing | an islet east of the head of the pier, about (188, 8) | `node lab/games/lava/test.mjs` |
| `hive` | **The Bee's Knees** — three combs of wax over the sea: the cell one sets foot on gives way | the north of the bay, about (84, -84) | `node lab/games/hive/test.mjs` |
| `flip` | **Head Over Heels** — one runs by oneself along a line of girders, and one key turns gravity over | along the south side of the pier, over the sea | `node lab/games/flip/test.mjs` |
| `spiral` | **A Turn for the Worse** — a track wound round a tower: obstacles worse every turn, one touch and it is the foot again | a tower in the south of the bay, about (168, 84) | `node lab/games/spiral/test.mjs` |

`node lab/games/browser-test.mjs` plays all five in the running game, in a headless browser: before a game is
attached nothing of it is in the world; attached it is built, offered at its gate, played to the end by its own
bot, its score told and kept, the player let go at the gate; left half-way it leaves nothing behind.

**What the checks prove is that each game can be played — a bot does it — not that it is a pleasure to play.**
That is the owner's to say, game by game.

## How each is made

A folder for each, four files (see the top of `kit.js`, which they share):

- `rules.js` — its rules, without a renderer: time in steps of 1/120 s, a player that plays by itself;
- `<Name>.js` — what is seen of it, and a session that drives the player (the shape of `Hill.js`, of `Hollow.js`);
- `extra.js` — `attach(app)`: builds it in the running game and plugs it in (`plug`, in `kit.js`);
- `test.mjs` — its checks, without a browser; the last line it prints is its line for the boards of scores.

`kit.js` holds what they share (the plug into the game, the starts on the shared clock, the arch where one asks
to play, a sign on a stake), `check.mjs` what their checks share (the lines PASS / FAIL, the ground of the world).
`shots.mjs` takes pictures of a game in the running game: `node lab/games/shots.mjs waves far=30,26,-78,-115,-28
gate=gate a=play:8` (its top says how).

## Trying them

There is no site of the lab online. Two ways to have one:

- **Plain files, anywhere**: `node lab/tools/static-site.mjs <folder>` builds the lab page as a folder of plain
  files that works from any address and without a server (no rooms, no boards: one plays alone) —
  `lab/vite.static.config.js` is its build.
- **A Worker of its own on Cloudflare**, with multiplayer and boards: `lab/wrangler.jsonc` (three steps, at the end
  of `lab/INTEGRATION.md`). It is built again at every push to the lab's branch.

On a computer: `npx vite --config lab/vite.config.js`, then `/lab/`.

## When one of them is wanted in the game

It becomes an extra like the others — a switch, off to begin with:

1. its folder goes beside the other games (`src/world/zones/games/<id>/`: `rules.js`, `<Name>.js`), its plug to
   `src/extras/<id>.js` (with `kit.js` beside it, or what it uses of it), its checks to `tools/<id>-test.mjs`, and a
   line in `EXTRAS` (`src/extras/index.js`) — all of it the lab's, to do when its owner says so;
2. the game's own session then adds the switch (`RELEASE` in `src/app/config.js`, `EXTRA` in `src/main.js`), the
   board of scores (the line each `test.mjs` prints, in `server/scores.js`; its name in `server/catalog.js`) and
   `app.<id>Done = (ms) => scoreGame('<id>', …)` — the plug calls it when a run ends.

## The games, one by one

### Wave Goodbye (`waves`)

A bar of sand runs sixty metres out from the north beach. The sea comes in over it, wave after wave, **the same
for everybody** (it goes by the clock of the world): every wave at the same speed, on the beats of one rhythm,
some two beats running. One wades in **whenever one likes**; the backwash draws one out, slowly (0.42 m/s), and
one jumps what comes — left and right along the crest, a jump, a second one in the air. A wave that catches one
carries one back to the beach, under the arch, where one can wade in again at once. The score is how long one
held.

What makes a run harder as it goes is where one stands, not the sea: a wave loses height as it runs up the sand,
and one lower than the knees only wets (it has no white crest: **a white crest says "jump"**). So by the
beach one hops knee-high rollers and a low breaker now and then; twenty-seven metres out the ripples matter
too, and everything stands taller with every metre — until, in the last ten metres, the sea asks for more than
two jumps can give. Nobody holds for ever. A crest is never level: it stands higher at one end, and a great one
(one every twenty seconds or so, said before it comes) can only be jumped at its low end. What comes two beats
running is small; the great ones come alone. Stakes say how far out one is; a golden float marks one's best.

The wader that plays by itself holds 124 to 146 s (52 to 60 m out); who stands there is carried off in 3 to
9 s; who only hammers the jump in seven. For the game's boards: `waves: { order: 'desc', min: 2500, max: 300_000 }`.

To tune: `WAVES` in `rules.js` — `drift` (how fast one is drawn out), `grow` (how tall the sea stands, metre by
metre), `beat` and `sets` (its rhythm), `kinds` (how tall, how lopsided), `knee`, `clear`.
