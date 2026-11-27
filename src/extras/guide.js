// Barnaby the barker as an extra: a robot in a top hat who stands on the gravel before the carport of the mill,
// by the pool — on the way of whoever arrives — and sends them to the games: "they are free to try". Asked for
// by the owner on 27 November 2026 ("mets un mec là qui te dit d'aller tester les jeux et qu'ils peuvent
// essayer"). Its switch: `guide` (RELEASE in src/app/config.js), ON as it is delivered — the owner asked for him
// to be there; off, nothing of him is loaded.
//
// He waves and calls when somebody comes near, turns to face them, and, asked (E: "Talk to Barnaby"), says
// which games are open today and where — he reads it from the game itself (app.extras: what is switched on, and
// where the gate of each stands), so he is never out of date. What he says is seen by whoever asked, nobody
// else: a bubble over his head and lines in their own chat. Nothing is sent anywhere.
import { EXTRAS } from './index.js';
import { ANIM, EMOTE_LIST } from '../player/Character.js';
import { HATS } from '../player/Cosmetics.js';

export const GUIDE = {
  name: 'Barnaby', title: 'Barker',
  x: -110.6, z: -24.4, // the east edge of the gravel, the carport's corner post to his left, the pool behind him
  faces: [-121.5, -44], // …looking up the lane, at who comes down from the gate
  reach: 3.4, // m: near enough to be asked
  calls: 15, // m: near enough to be called
  quiet: 40, // s between two calls
};

/** The games he may speak of, in the order he names them (the ids of their switches). */
const GAMES = ['waves', 'lava', 'hive', 'flip', 'spiral', 'walls', 'sneak', 'crack', 'hollow', 'slide', 'raft', 'hill', 'pond', 'boats', 'golf', 'cars', 'ages', 'mine', 'coaster'];

/** Where a gate stands, in words a newcomer can follow from the mill (the lane goes east to the seafront and the pier; the meadow is west). */
export function whereIs(x, z) {
  if (x > 150 && z > 150) return 'in the secret cove';
  if (x > 28 && z < -28) return 'on the north beach';
  if (x > 28 && z > 28) return 'on the south beach';
  if (x > 28) return 'on the pier';
  if (x < -200 && z < 0) return 'in the west meadow';
  if (Math.hypot(x + 168, z - 70) < 95) return 'at the Great Pond';
  if (z < -70) return 'north of the fields';
  return 'near the mill';
}

/** What is open now: [{ id, name, where }] — read from the running game. */
export function openGames(app) {
  const list = [];
  for (const id of GAMES) {
    const g = app.extras?.[id], at = g && g !== true ? g.gate || g.stand || g.boardSpot : null;
    if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.z)) continue;
    list.push({ id, name: String(EXTRAS[id]?.name || id).split(' — ')[0], where: whereIs(at.x, at.z) });
  }
  return list;
}

/** What he says when asked, a line at a time: [text…]. `n`: how many times this visitor has asked already. */
export function linesFor(open, n = 0) {
  const byPlace = new Map();
  for (const g of open) { if (!byPlace.has(g.where)) byPlace.set(g.where, []); byPlace.get(g.where).push(g.name); }
  const places = [...byPlace].map(([where, names]) => `${where}: ${names.join(', ')}`);
  const fair = 'On the pier: six booths, the quad race and the flying theatre. South of the lane: Mostly Up, the climb.';
  if (!open.length) {
    return n % 2 === 0
      ? ['Step right up! Every game of the fair is free to try: walk up to one and press E.', `${fair} Follow the lane east — you cannot miss the big wheel.`]
      : ['The stars on the map (M) are the games. Each keeps a board of the best scores: put your name on one!', 'New games are being built all over the oasis. Come back and ask me: I shall know before anybody.'];
  }
  if (n % 2 === 1) return ['Every game is free to try, as often as you like: walk under its arch and press E — E again to leave.', `The stars on the map (M) show where they are. ${fair}`, 'Each game keeps a board of the best scores by its gate. Go and put your name on one!'];
  const lines = [`Step right up! ${open.length === 1 ? 'A new game is' : `${open.length} new games are`} open today, and ${open.length === 1 ? 'it is' : 'every one is'} free to try.`];
  // (three places a line at the most: a line of chat is read at a glance or not at all)
  for (let i = 0; i < places.length; i += 3) lines.push(`${places.slice(i, i + 3).join(' · ')}.`.replace(/^./, (c) => c.toUpperCase()));
  lines.push('Walk under the arch of a game and press E. The stars on the map (M) show the way. Off you go — and tell me how it went!');
  return lines;
}

const CALLS = [
  'Step right up! New games all over the oasis — free to try!',
  'Psst — over here! I know where every game is.',
  'You there! Fancy a game? They are all free to try.',
];

/** Puts Barnaby where he stands (in the running game) and lets him speak. Returns { at, open(), lines(n) }. */
export function attach(app) {
  const { world, hud, player } = app, me = app.me;
  if (!me?.factory || !me.root?.parent) return null;
  const G = GUIDE, y = world.data.heightAt(G.x, G.z);
  const guy = me.factory.create(3);
  const hat = Math.max(0, HATS.findIndex((h) => h.id === 'tophat'));
  guy.setColor(19); // crimson, as the awnings of the fair
  guy.setLook({ hat });
  guy.setAnim(ANIM.idle);
  const home = Math.atan2(G.faces[0] - G.x, G.faces[1] - G.z);
  guy.root.position.set(G.x, y, G.z);
  guy.root.rotation.y = home;
  guy.root.name = 'guide';
  me.root.parent.add(guy.root);
  world.collision?.addCircle?.(G.x, G.z, 0.45); // (one walks round him, not through)
  world.scatter?.keepClear?.(G.x, G.z, 1.5);

  const tag = hud.tag('npc-guide', G.name, 1, G.title);
  tag.style.display = 'none';
  const WAVE = Math.max(0, EMOTE_LIST.findIndex((e) => e.id === 'wave')), CHEER = EMOTE_LIST.findIndex((e) => e.id === 'go');
  let asked = 0, clock = 0, called = -1e9, shown = false, yaw = home, timers = [];
  const hush = () => { for (const t of timers) clearTimeout(t); timers = []; };
  const speak = (lines) => {
    hush();
    lines.forEach((text, i) => timers.push(setTimeout(() => { hud.addChat(G.name, 1, text, false, 'private'); hud.say(tag, text); }, i * 3400)));
  };
  const free = () => !player.driver && !app.fair?.session && !player.dead;
  world.actionSources.push((p) => {
    if (!free() || (p.pos.x - G.x) ** 2 + (p.pos.z - G.z) ** 2 > G.reach * G.reach) return null;
    return { label: `Talk to ${G.name}`, run: () => { guy.emote(CHEER >= 0 && asked % 2 === 0 ? CHEER : WAVE); speak(linesFor(openGames(app), asked++)); called = clock; } };
  });

  const v = new app.THREE.Vector3();
  world.zones.push({
    update: (dt, time, camera) => {
      clock += dt;
      const dx = player.pos.x - G.x, dz = player.pos.z - G.z, d2 = dx * dx + dz * dz;
      const seen = d2 < 70 * 70;
      if (guy.root.visible !== seen) guy.root.visible = seen;
      if (!seen) { if (shown) { shown = false; tag.style.display = 'none'; } return; }
      // he turns to who is near, and back up the lane when they have gone
      const want = d2 < G.calls * G.calls && free() ? Math.atan2(dx, dz) : home;
      let turn = want - yaw; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      yaw += turn * Math.min(1, dt * 4);
      guy.root.rotation.y = yaw;
      guy.setAmbient(1);
      guy.setLight(d2 > 40 * 40);
      guy.update(dt);
      // he calls who comes near (not while they play, not twice in a row)
      if (d2 < G.calls * G.calls && d2 > G.reach * G.reach && free() && clock - called > G.quiet) {
        called = clock;
        guy.emote(WAVE);
        hud.say(tag, CALLS[Math.floor(Math.random() * CALLS.length)]);
      }
      if (d2 > (G.calls + 6) ** 2 && timers.length) hush(); // (walked away: he does not go on talking to nobody)
      // his name over his hat
      let on = d2 < 30 * 30;
      if (on) { v.set(G.x, y + 2.15, G.z).project(camera); on = v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1; }
      if (on) tag.style.transform = `translate(${((v.x * 0.5 + 0.5) * app.engine.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * app.engine.height).toFixed(1)}px) translate(-50%, -100%)`;
      if (on !== shown) { shown = on; tag.style.display = on ? '' : 'none'; }
    },
  });
  return { at: { x: G.x, y, z: G.z }, character: guy, tag, open: () => openGames(app), lines: (n = 0) => linesFor(openGames(app), n), talk: () => speak(linesFor(openGames(app), asked++)) };
}
