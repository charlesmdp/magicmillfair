// The Velvet Gasket as an extra: a hidden cabaret of robots in a cave of its own, under the southern slopes —
// "un bar de strip tease pour robots où faut payer avec des fleurs (vu qu'elles servaient à rien), avec de
// l'alcooil, dans une grotte, caché" (the owner, 28 November 2026). A joke, and a clean one: what the star of the
// house takes off on its stage is hardware, and the drinks are oil. Its switch: `bar` (RELEASE in
// src/app/config.js), off as it is delivered; with it off nothing of it is loaded, built or shown — no cave, no
// hole in the ground, no robot.
//
// Plugged in from outside (window.__mmf): the cave is the game's own machinery — a gallery of Caves.js, a
// corridor given to the collision, a hole added to those of the terrain — so that one walks into it as into any
// cave, and the caves' rule (only those nearby hear what is said) holds there. Nothing is sent anywhere: the
// flowers are the bouquet in hand (app.look), spent as the plaques and the golden dog spend one; the cover, the
// glasses and the door are each visitor's own; the show goes by the clock everybody shares, so that everybody in
// the room sees the same step of the number. What the others see of a visitor there is the game's own emotes.
// See src/world/zones/places/bar/ (plan.js: where it stands, what is said; Bar.js, Star.js: what is seen).
import { ZONES } from '../world/layout/layout.js';
import { emoteIndex } from '../player/Character.js';
import { tunePlayer } from './tunes.js';
import { Bar } from '../world/zones/places/bar/Bar.js';
import { BAR, AX, FLOOR, CARD, LINES, SHOW, showAt, flowersOf, spend, smooth } from '../world/zones/places/bar/plan.js';

/** How far the world leans after a glass (radians): gently enough to make nobody ill — and not at all for who asked their device for less motion. */
const SWAY = 0.026;

/** Digs the cave and opens the house in the world of `app` (the game, once it runs). Returns what the checks ask it. */
export function attach(app) {
  const { world, player, hud } = app, look = app.look;
  const place = new Bar(app).build();
  world.bakeShadows(); // (the slab and the boulders before the mouth cast a shadow like any rock)
  // (the caves' rule names the place when one walks in; it is on no map: `hidden`)
  if (!ZONES.some((z) => z.id === BAR.id)) ZONES.push({ ...BAR.zone });
  const R = place.robots, D = BAR.door, C = BAR.counter, S = BAR.stage, v = new app.THREE.Vector3();
  const state = { paid: false, drinks: 0, thrown: 0, sway: 0, roll: 0, flourish: 0, hic: 0 };
  const heard = { inside: 0, heat: 0.3 };
  const tune = tunePlayer(app);
  let playing = false, swayT = 0, wasIn = false, greeted = -1e9, peeked = -1e9, clock = 0, source = null;
  const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- who speaks: a name over each, a bubble, and the line in one's own chat (nobody else reads it)
  const tags = {};
  for (const [id, who] of [['doorman', BAR.doorman], ['barman', BAR.barman], ['star', BAR.star]]) { tags[id] = hud.tag(`npc-bar-${id}`, who.name, id === 'star' ? 12 : 15, who.title); tags[id].style.display = 'none'; tags[id].dataset.on = ''; }
  const say = (id, text) => { hud.addChat(BAR[id].name, id === 'star' ? 12 : 15, text, false, 'private'); hud.say(tags[id], text); };

  // ---- a few sounds of its own, made with the game's: a roll of the drum, a cymbal, a hiccup
  const fx = (make) => {
    const a = app.audio, e = a?.effects;
    if (!e || !a.live || !(a.levels?.sound > 0) || (!a.offline && a.ctx?.state !== 'running')) return;
    try { e.volume = 1; e.rate = 1; make(e, a.ctx.currentTime + 0.02); } catch { /* no sound: no matter */ }
  };
  const drums = (secs) => fx((e, t) => { const n = Math.floor(secs / 0.055); for (let i = 0; i < n; i++) e.noise(t + i * 0.055, 'white', 'bandpass', 1900, 1900, 0.9, 0.02 + 0.055 * (i / n) ** 2, 0.001, 0.014, 0.014); });
  const cymbal = (at = 0) => fx((e, t) => e.noise(t + at, 'white', 'highpass', 5200, 5200, 0.7, 0.085, 0.002, 0.04, 0.3));
  const hiccup = () => fx((e, t) => e.tone(t, 'sine', 380, 780, 0.06, 0.2, 0.004, 0.05, 0.02));

  const free = () => !player.driver && !app.fair?.session && !player.dead;
  const emote = (id) => { const i = emoteIndex(id); if (i < 0) return; app.me?.emote(i); app.presence?.sendEmote(i); }; // (the others see it: the game's own emotes)

  // ---- the door: the cover is flowers
  const knock = () => {
    const n = flowersOf(look);
    say('doorman', n ? LINES.few(n) : LINES.where);
    app.audio?.play('press');
    R.doorman?.emote(emoteIndex('no'));
    peeked = clock;
    return false;
  };
  const pay = () => {
    if (state.paid) return true;
    if (!spend(look, BAR.cover)) return knock();
    state.paid = true;
    place.door.open = true;
    app.audio?.play('pick');
    app.audio?.play('click');
    say('doorman', LINES.welcome);
    R.doorman?.emote(emoteIndex('thumbsup'));
    greeted = clock;
    return true;
  };
  // ---- the counter: a glass for a flower, three a night
  const order = () => {
    if (state.drinks >= BAR.most) { say('barman', LINES.enough); R.barman?.emote(emoteIndex('no')); return false; }
    if (!spend(look, 1)) { say('barman', LINES.dry); return false; }
    state.drinks++;
    const [name] = CARD.drinks[Math.floor(Math.random() * CARD.drinks.length)];
    say('barman', LINES.drink(name));
    R.barman?.emote(emoteIndex('thumbsup'));
    app.audio?.play('gulp');
    emote('cheer'); // (the glass is raised…)
    state.sway = BAR.sway; state.hic = 1.3; // (…and the world sways a little, for a minute)
    hud.note(`${name}. The world sways a little — it passes in a minute.`, 4200);
    return true;
  };
  // ---- the stage: a flower thrown earns a flourish, and a cheer from the room
  const toss = () => {
    const show = api.show();
    if (!show.on || show.curtain < 0.5) { hud.note(LINES.down, 3200); return false; }
    const gone = spend(look, 1);
    if (!gone) { hud.note(LINES.none, 3400); return false; }
    state.thrown++;
    state.flourish = 1;
    const to = place.toss(player.pos.x, player.pos.y + 1.25, player.pos.z, gone[0]);
    world.sparks?.glitter(to.x, to.y + 0.3, to.z, 0.5, 26);
    world.sparks?.feathers?.(BAR.star.x, FLOOR + S.height + 1.5, BAR.star.z, 10);
    app.audio?.play('cheer');
    cymbal(0.1);
    place.react('cheer');
    emote('clap');
    hud.note(LINES.thrown, 2600);
    hud.say(tags.star, show.n >= 5 ? 'For me? Oh, you.' : 'A flower! Watch this.');
    return true;
  };
  // (asked before the world's own actions: at the door, the counter and the stage, that is what the E key — or
  // the button, on a phone — means)
  source = (p) => {
    if (!free() || p.cave !== place.corridor) return null;
    const x = p.pos.x, z = p.pos.z;
    if (!state.paid) return z > D.z - D.reach && z < D.z ? (flowersOf(look) >= BAR.cover ? { label: `Pay the cover: ${BAR.cover} flowers`, run: pay } : { label: 'Knock on the hatch', run: knock }) : null;
    if (x > C.x - C.depth / 2 - C.reach && x < C.x && z > C.z0 - 0.3 && z < C.z1 + 0.3) return { label: state.drinks >= BAR.most ? 'Ask for one more glass' : 'A glass of Alcooil: 1 flower', run: order };
    if (z > S.z0 - S.reach && z < S.z0 && Math.abs(x - AX) < (S.x1 - S.x0) / 2 + 0.4) return { label: 'Throw a flower on the stage', run: toss };
    return null;
  };
  world.actionSources.unshift(source);

  /** A name over somebody of the house, where the camera sees it — or put away. */
  const label = (id, on, x, y, z, camera) => {
    const tag = tags[id];
    if (on && camera) { v.set(x, y, z).project(camera); on = v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1; } else on = false;
    if (on) tag.style.transform = `translate(${((v.x * 0.5 + 0.5) * app.engine.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * app.engine.height).toFixed(1)}px) translate(-50%, -100%)`;
    if (tag.dataset.on !== (on ? '1' : '')) { tag.dataset.on = on ? '1' : ''; tag.style.display = on ? '' : 'none'; }
  };

  /** Every frame (the checks walk a minute through it, a step at a time). */
  const step = (dt, camera = null) => {
    clock += dt;
    if (place.dig()) console.warn('[bar] the hole of its mouth was put back in the terrain');
    const p = player.pos, L = BAR.lantern, inCave = player.cave === place.corridor;
    const inRoom = inCave && p.z > D.z, show = api.show();
    const drawn = inCave || Math.hypot(p.x - AX, p.z - BAR.mouth.z) < 48;
    const atDoor = inCave && !state.paid && p.z < D.z && p.z > D.z - 4.6 && free();
    state.flourish = Math.max(0, state.flourish - dt / 2.2);
    const events = place.update(dt, show, { drawn, lantern: Math.hypot(p.x - L.x, p.z - L.z) < L.seen && Math.abs(p.y - L.y) < 12, peek: atDoor, flourish: state.flourish, x: p.x, z: p.z, busy: !free() });
    // ---- the doorman: his hatch slides open for who comes, and he says what the cover is
    if (atDoor && clock - peeked > 30) { peeked = clock; say('doorman', LINES.peek[Math.floor(Math.random() * LINES.peek.length)]); }
    if (inCave && !wasIn && state.paid && clock - greeted > 30) { greeted = clock; say('doorman', LINES.back); }
    wasIn = inCave;
    // ---- the show, for who is in the room: the drums, what comes off, the bow
    if (inRoom) for (const e of events) {
      if (e.what === 'open') { drums(SHOW.roll[0][1] - 0.2); cymbal(SHOW.roll[0][1]); say('star', LINES.announce); }
      if (e.what === 'roll') drums(SHOW.off[4] - SHOW.roll[1][0] - 0.1);
      if (e.what === 'off' || e.what === 'out') { cymbal(); say('star', LINES.pieces[e.n - 1]); }
      if (e.what === 'out' || e.what === 'bow') app.audio?.play('cheer');
      if (e.what === 'bow') say('star', LINES.bow);
    }
    // ---- its music: for who is inside, faint behind the door
    const k = !inCave || !free() ? 0 : inRoom ? 1 : 0.14 * smooth(179.5, 183.5, p.z);
    heard.inside += (k - heard.inside) * Math.min(1, dt * 3);
    heard.heat = !show.on ? 0.3 : show.n >= 5 ? 1 : 0.7;
    if (!playing && k > 0.01) { tune.play('bar', { state: heard }); playing = true; }
    if (playing) { tune.tick(); if (k <= 0 && heard.inside < 0.01) { tune.stop(); playing = false; } }
    // ---- a glass: the world sways a little, and one hiccups
    state.roll = 0;
    if (state.sway > 0) {
      state.sway = Math.max(0, state.sway - dt);
      swayT += dt;
      state.hic -= dt;
      if (state.hic <= 0 && state.sway > 2 && free()) { state.hic = 7 + Math.random() * 9; hud.say(hud.selfTag, 'hic!'); hiccup(); }
      const a = calm ? 0 : SWAY * (1 + 0.15 * (state.drinks - 1)) * Math.min(1, state.sway / 6, (BAR.sway - state.sway) / 2 + 0.05);
      state.roll = a * Math.sin(swayT * 1.05);
      if (camera && free() && a > 0) { camera.rotateZ(state.roll); camera.rotateX(0.3 * a * Math.sin(swayT * 0.67 + 1)); camera.updateMatrixWorld(); }
    }
    // ---- the names
    const fd = place.corridor.floorAt(AX, D.z), top = FLOOR + S.height;
    label('doorman', inCave && free() && Math.abs(p.z - D.z) < 6, BAR.doorman.x, fd + (place.door.k > 0.5 ? 2.2 : 2.0), place.door.k > 0.5 ? BAR.doorman.z : D.z - 0.1, camera);
    label('barman', inRoom && free() && Math.hypot(p.x - BAR.barman.x, p.z - BAR.barman.z) < 9, BAR.barman.x, FLOOR + 2.15, BAR.barman.z, camera);
    label('star', inRoom && free() && show.curtain > 0.4, place.star.group.position.x, top + (show.n >= 5 ? 2.3 : show.n >= 1 ? 2.25 : 2.6), BAR.star.z, camera);
    return events;
  };
  world.zones.push({ update: (dt, time, camera) => step(dt, camera) });

  const api = {
    place, plan: BAR, state, heard,
    /** The clock of the show: the server's, which every page keeps — the checks set it. */
    clock: () => (app.updates?.now ? app.updates.now() : Date.now()),
    show: () => showAt(api.clock()),
    step,
    /** What the E key means where the visitor stands now: { label, run } or null. */
    action: () => source(player),
    knock, pay, order, toss,
    get playing() { return playing && !!tune.playing; },
  };
  app.bar = api;
  return api;
}
