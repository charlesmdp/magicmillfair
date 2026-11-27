// War Through the Ages as an extra: plugged into the running game from outside, through what the game exposes (plug.js),
// so that the game without it is exactly the game as it was. Its switch: RELEASE in src/app/config.js (off as it is
// delivered); its board of scores: main.js (LAB_GAMES, LAB_BOARD) and server/scores.js.
import { plug } from './plug.js';
import { Ages } from '../world/zones/games/ages/Ages.js';
import * as rules from '../world/zones/games/ages/rules.js';

const { AGES } = rules;

/** Sets the stage in the west meadow (the game, once it runs) and lets the player wage a war on it. Returns the game. */
export function attach(app) {
  const ages = new Ages(app.world).build();
  app.world.bakeShadows(); // (the stage and its arch were not there when the shadows of what never moves were drawn)
  return plug(app, ages, {
    id: 'ages', rules,
    label: () => `Play ${AGES.name}`,
    leave: 'Leave the war',
    left: 'You left the war.',
    keys: (touch) => (touch
      ? 'Tap a button: a brawler, a shooter, a heavy one · then a turret on your base, the great blow, the next age · A button takes its price in gold and lifts its veil as it comes back · Sturdy robots go in front by themselves: shooters behind them bring the other base down · Or: stick left / right to choose a button, the arrow button to press it'
      : '1 2 3: send a brawler, a shooter, a heavy one · 4: a turret on your base · 5: the great blow, on every robot of the other side · 6: the next age, once the bar is full · Or ← → to choose a button and Space to press it; a click does too · Sturdy robots go in front by themselves: shooters behind them bring the other base down · E: leave · H: these keys again'),
  });
}
