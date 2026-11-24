// Application entry: boot sequence, game loop and modes (intro, walk, free camera, benchmark).
import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { isMobile, TIERS } from './core/Quality.js';
import { World } from './world/World.js';
import { FreeCamera } from './player/FreeCamera.js';
import { CharacterFactory, EMOTE_LIST, AVATAR_COLORS, emoteIndex, packLook } from './player/Character.js';
import { HATS } from './player/Cosmetics.js';
import { ITEMS, PAINTS, TRAILS, itemOf, packKit, PASS, SIZES, SIZE, SIZE_SCALE, sizeOf, FREE_COLORS } from '../server/items.js';
import { BOARDS as GAME_NAMES } from '../server/catalog.js';
import { drawSponsor } from './world/zones/games/Boards.js';
import { ShopView } from './ui/ShopView.js';
import { Arcade } from './ui/Arcade.js';
import { AccountView } from './ui/AccountView.js';
import { PayView } from './ui/PayView.js';
import { LegalView } from './ui/LegalView.js';
import { deviceId } from './net/device.js';
import { Previewer } from './ui/Preview.js';
import { Sparks } from './world/effects/Sparks.js';
import { Account } from './net/Account.js';
import { Shop, price, logoData, loadImage, ownDraft } from './net/Shop.js';
import { PlayerController, JET, JET_LITE } from './player/PlayerController.js';
import { CameraRig } from './player/CameraRig.js';
import { Interact } from './player/Interact.js';
import { RankEmotes, rankPicture } from './player/RankEmotes.js';
import { Hud, VERSION } from './ui/Hud.js';
import { Presence, cleanChat } from './net/Presence.js';
import { Npc } from './npc/Npc.js';
import { Scores } from './net/Scores.js';
import { countVisit } from './net/Visits.js';
import { callApi, checkAdminKey, hasApi, sharedNow } from './net/api.js';
import { formatTime } from './world/zones/games/course.js';
import { RemoteAvatars } from './net/RemoteAvatars.js';
import { Benchmark } from './app/Benchmark.js';
import { SPAWN, ZONES, CLIMB, RACE, WING, TRACK, PIER } from './world/layout/layout.js';
import { VILLAGE_PERKS, VILLAGE_PITCH, money } from './world/layout/sponsors.js';
import { FEATURES, skyGateOpen } from './app/config.js';
import { Soundscape } from './audio/Soundscape.js';
import { Blast } from './world/effects/Blast.js';
import { BLAST_EVERY } from '../server/protocol.js';

const params = new URLSearchParams(location.search);
const SHOT = params.has('shot'); // screenshot tool: no interface, free camera
const BENCH = params.has('bench') ? Number(params.get('bench')) || 1 : 0;
const store = {
  get(k, session = false) { try { return (session ? sessionStorage : localStorage).getItem(k); } catch { return null; } },
  set(k, v, session = false) { try { (session ? sessionStorage : localStorage).setItem(k, v); } catch { /* private mode */ } },
  del(k, session = false) { try { (session ? sessionStorage : localStorage).removeItem(k); } catch { /* private mode */ } },
};

const canvas = document.getElementById('view');
const ui = document.getElementById('ui');
const touch = isMobile() || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
const app = { ready: false, frames: 0, THREE, version: VERSION };
window.__mmf = app;

const input = new Input(canvas);
input.enabled = false;
const hud = new Hud(ui, { input, isTouch: touch });
const arcade = new Arcade(ui); // (the screen of the cabinet of the pier: shown while one plays)
const accountView = new AccountView(ui); // (the card of the account: signing in, making one)
const payView = new PayView(ui); // (the payment form, when it can be shown inside the game)
const legalView = new LegalView(ui, { device: deviceId }); // (the terms of use and the privacy policy, opened from the settings)
if (SHOT && !params.has('ui')) ui.style.display = 'none';

// The view the welcome screen floats over: a slow arc above the mill and its pond.
const INTRO = { x: -140, z: 10, radius: 80, angle: -0.42, swing: 0.3, height: 24, lookHeight: 1 };

async function boot() {
  let engine;
  try {
    engine = new Engine(canvas);
  } catch (err) {
    hud.fail('This browser cannot display the 3D world (WebGL 2 is required).');
    throw err;
  }
  const world = new World(engine);
  const camera = engine.camera, scene = engine.scene, data = world.data;
  Object.assign(app, { engine, world, input, hud });
  // (the places that have a name — the Sky Gate has none while it is not there)
  const PLACES = ZONES.filter((z) => !(z.id === 'skygate' && !skyGateOpen()));
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    hud.note('The graphics context was lost. Reload the page (the “Light” quality is advised).', 1e8);
  });

  // ---------- loading
  const label = (p) => (p < 0.5 ? 'Raising the mountains…' : p < 0.7 ? 'Filling the ponds and the sea…' : p < 0.9 ? 'Planting the forest…' : 'Putting up the big wheel…');
  const factoryLoading = new CharacterFactory({ blobShadow: !engine.tier.shadowDynamic }).load();
  await world.load((p) => hud.setProgress(p * 0.94, label(p)));
  const factory = await factoryLoading;
  hud.setProgress(0.97, 'Stringing the lights…');
  await new Promise((r) => requestAnimationFrame(r));
  world.buildCollision();
  world.bakeShadows();

  // ---------- sound: every ambience, music and effect is synthesised (src/audio/): nothing to download.
  // Browsers only allow sound after a gesture: the first click, key or touch starts it.
  const level = (key, def) => { const v = parseFloat(store.get(key)); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : def; };
  const volume = { sound: level('mmf.sound', 0.8), music: level('mmf.music', 0.6) };
  const audio = new Soundscape({ data });
  audio.setLevels(volume);
  for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, () => audio.unlock(), { passive: true });
  app.audio = audio;

  // ---------- player and cameras
  const floorAt = (x, z) => Math.max(data.heightAt(x, z), data.waterAt(x, z));
  let color = parseInt(store.get('mmf.color'), 10);
  if (!(color >= 0 && color < 32)) color = Math.floor(Math.random() * 16);
  // (the size of the robot: the choice of who holds the Game Pass; 0 is everybody's)
  let size = Math.max(0, SIZES.indexOf(sizeOf(store.get('mmf.size'))));
  let disguise = 0; // a bush (1), a tree (2): a secret word of the chat
  let name = (store.get('mmf.name') || '').trim() || `Visitor ${10 + Math.floor(Math.random() * 90)}`;
  const me = factory.create(color);
  scene.add(me.root);
  const player = new PlayerController(me, world.collision, data, input);
  const rig = new CameraRig(camera, input, world.collision, data);
  const free = new FreeCamera(camera, input, floorAt);
  const spawn = () => {
    player.teleport(SPAWN.x, SPAWN.z, SPAWN.yaw + Math.PI);
    rig.snap(player.pos, SPAWN.yaw);
  };
  spawn();
  world.playerPos = player.pos;
  world.player = player; // (the games and the dangers of the valley watch the player)
  // what the avatar wears and holds (see Cosmetics.js); the hat is remembered from one visit to the next
  // the shop: closed (and everything free) until the server says otherwise
  const shop = new Shop();
  const owns = (id) => id !== undefined && (id === 'none' || shop.owns(id === 'jetpack' ? 'jetpack' : `hat:${id}`));
  const savedHat = parseInt(store.get('mmf.hat'), 10);
  const look = { hat: savedHat > 0 && savedHat < HATS.length && owns(HATS[savedHat].id) ? savedHat : 0, jet: false, bouquet: false, kinds: undefined, quad: false, dome: false, size: 0, disguise: 0 };
  // what the avatar shows besides its hat — its paint, its trail — is remembered too, and told to the others
  // as one small number (see server/items.js)
  const kit = { paint: 0, trail: 0, pet: 0 };
  { const saved = (() => { try { return JSON.parse(store.get('mmf.kit')) || {}; } catch { return {}; } })(); kit.paint = Math.max(0, PAINTS.indexOf(saved.paint)); kit.trail = Math.max(0, TRAILS.indexOf(saved.trail)); }
  // the small bright things: trails, fireworks (one set of points for everybody)
  world.sparks = new Sparks();
  scene.add(world.sparks.mesh);
  const timers = {}; // cheats that wear off: name → seconds left
  // habits kept from one visit to the next
  // (running, and the camera that turns with the character, are on unless the visitor switched them off)
  const settings = { run: store.get('mmf.run') !== '0', follow: store.get('mmf.follow') !== '0' };
  player.autoRun = settings.run;
  rig.follow = settings.follow;
  // who is visiting: `admin` once the server has recognised the administrator's key; `days`: visits in a row
  const who = { admin: false, owner: false, key: '', days: 1 };
  app.who = who;
  // no jetpack underground, nor where a game forbids it
  // (two jetpacks: the real one, and a light one with a small tank that needs its breath between two goes.
  // Who has both chooses the one that is on — in the item shop —, and may wear none)
  const jetOn = () => {
    const real = shop.owns('jetpack'), lite = shop.owns('jetlite'), want = store.get('mmf.jet');
    if (want === 'none') return null;
    return want === 'jetlite' && lite ? 'jetlite' : want === 'jetpack' && real ? 'jetpack' : real ? 'jetpack' : lite ? 'jetlite' : null;
  };
  const fitJet = () => { const on = jetOn(); player.tank = on === 'jetpack' ? JET.time : JET_LITE.time; player.jetEvery = on === 'jetlite' ? JET_LITE.every : 0; if (on !== 'jetlite') player.jetCool = 0; if (player.fuel > player.tank) player.fuel = player.tank; };
  player.canFly = (p) => !!jetOn() && !player.cave && !world.noFly.some((z) => (p.x - z.x) ** 2 + (p.z - z.z) ** 2 < z.r * z.r);
  player.onDeath = (cause) => { hud.wasted(cause); audio.play('wasted'); };
  player.onRespawn = () => { hud.wasted(null); rig.snap(player.pos, rig.yaw); audio.play('respawn'); };
  const rank = new RankEmotes(scene);
  Object.assign(app, { player, rig, free, me, rank, look });

  const state = { mode: 'intro', time: 0, blend: null };
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion();
  const startBlend = (duration) => { state.blend = { t: 0, duration, pos: camera.position.clone(), quat: camera.quaternion.clone() }; };
  const setMode = (mode, instant = false) => {
    if (mode === state.mode) return;
    if (mode === 'free') {
      free.syncFromCamera();
      free.vel.set(0, 0, 0);
      hud.note(touch ? 'Free camera: use the arrows to go up and down' : 'Free camera · Space / C: up, down · Shift: faster · F: back to your character');
    } else if (mode === 'walk') {
      if (state.mode === 'free') rig.yaw = free.yaw;
      const far = camera.position.distanceTo(player.pos);
      if (!instant) startBlend(Math.min(2.6, 0.7 + far / 90));
      rig._first = true;
    }
    state.mode = mode;
    hud.setCameraMode(mode === 'free');
  };
  app.setMode = setMode;
  app.setCam = (x, y, z, yaw, pitch) => { setMode('free'); state.blend = null; free.setPose(x, y, z, (yaw * Math.PI) / 180, (pitch * Math.PI) / 180); };

  // ---------- presence (other visitors)
  let presence = null, avatars = null;
  let liveScore = () => {}; // (set once the boards exist)
  const startPresence = () => {
    presence = new Presence({ name, color, kit: packKit(kit) });
    avatars = new RemoteAvatars({ scene, factory, presence, hud, rank, world });
    presence.on('score', ({ peer, board }) => liveScore(peer, board));
    presence.on('chat', ({ id, peer, text, near, important }) => {
      hud.addChat(peer.name, peer.color, text, false, important ? 'important' : near ? 'near' : '');
      avatars.say(id, text);
      audio.play(important ? 'score' : 'chat');
      if (important) hud.note(`${peer.name}: ${text}`, 9000); // (an administrator's announcement: on the screen too)
    });
    presence.on('blast', ({ self, peer, since }) => detonate(self ? name : peer?.name || 'Somebody', since));
    presence.on('blastWait', ({ wait }) => hud.note(`Patience: one nuclear explosion every fifteen minutes. Next one in ${Math.ceil(wait / 60000)} min.`, 4500));
    // named an administrator by one of them: the key of our own is kept, and checked like any other
    presence.on('promoted', ({ key, by, id }) => {
      if (key) adminKey(key).then(() => { if (who.admin) hud.addChat('✦', 5, `${by || 'An administrator'} has made you an administrator. The list of who is here shows you more, and "Important" is yours in the chat.`, true); });
      else if (id !== undefined) { hud.note('They are an administrator now.', 4000); refreshRoster(); }
    });
    // what the others do is heard when they are close
    presence.on('emote', ({ id, emote: i }) => {
      const o = presence.peers.get(id), e = EMOTE_LIST[i];
      if (o && o.visible && i === FIREWORK) { world.sparks.firework(o.x, o.y, o.z); return; } // (somebody lit a firework)
      if (o && o.visible && i === BOUQUET) {
        // somebody holds out their bouquet: whoever stands right by them, hands free, takes it
        if (Math.hypot(o.x - player.pos.x, o.z - player.pos.z) < 3 && Math.abs(o.y - player.pos.y) < 2 && !look.bouquet && state.mode === 'walk' && !player.dead && !fair.session) {
          look.kinds = undefined; look.bouquet = true;
          audio.play('pick');
          hud.note(`${o.name} gives you a bouquet.`, 5000);
          world.sparks.glitter(player.pos.x, player.pos.y + 1.2, player.pos.z, 0.7, 24);
        }
        return;
      }
      if (!o || !o.visible || !e) return;
      const d = Math.hypot(o.x - player.pos.x, o.z - player.pos.z);
      if (d < 40) audio.play(e.rank ? 'rank' : e.id === 'cheer' || e.id === 'clap' || e.id === 'hype' || e.id === 'go' ? 'cheer' : e.id === 'rage' ? 'rage' : 'emote', { volume: Math.max(0.15, 1 - d / 40) * 0.8 });
    });
    // put out of the room by the administrator: said plainly, and that is the end of the visit to this room
    presence.on('kicked', ({ ban }) => hud.banner(ban ? 'The administrator has banned you from the fair.' : 'The administrator has put you out of this room. Reload the page to come back in.'));
    // something was given by an administrator: the shop is asked again (it says what, in the chat)
    presence.on('gift', () => { refreshShop().then(() => { audio.play('victory'); hud.note('A gift from the fair has just arrived: look in the item shop!', 7000); }); });
    presence.on('who', ({ list, now }) => { roster.details = new Map(list.map((p) => [p.id, p])); roster.now = now; if (hud.rosterOpen) showRoster(); });
    presence.on('admin', ({ ok, out }) => {
      if (ok && hud.rosterOpen) presence.who();
      // the title was taken away while we were here (said so by the relay), or the key was not recognised
      // when the connection came back (then the server is asked again before the key is forgotten)
      if (!ok && who.admin && !who.owner) (out ? adminKey('') : adminKey(who.key)).then(() => { if (!who.admin) hud.note('You are an administrator no more.', 6000); });
    });
    if (who.key) presence.setAdminKey(who.key);
    // no toast when the list is merely rebuilt because the connection changed (local <-> online)
    let shownMode = presence.mode;
    presence.on('status', ({ mode, count }) => { shownMode = mode; hud.setPresence(mode, count, presence.shard); });
    // (in a crowd, comings and goings are not announced)
    presence.on('join', (peer) => { if (presence.mode === shownMode && presence.count <= 30) hud.note(`${peer.name} joined`); if (hud.rosterOpen) showRoster(); });
    presence.on('leave', (peer) => { if (presence.mode === shownMode && presence.count <= 30) hud.note(`${peer.name} left`); if (hud.rosterOpen) showRoster(); });
    presence.connect();
    Object.assign(app, { presence, avatars });
  };

  // ---------- who is here (and, for the administrator, where from; putting out, keeping out)
  const roster = { details: null, bans: null, admins: null, visitors: null, now: 0 };
  const showRoster = () => {
    const p = player.pos, zoneOf = (x, z) => { let best = null, bd = 1; for (const zn of PLACES) { if (zn.hidden) continue; const d = Math.hypot(x - zn.x, z - zn.z) / zn.r; if (d < bd) { bd = d; best = zn; } } return best ? best.name : ''; };
    const people = [{ id: presence?.id || 0, name, color, me: true, where: zoneOf(p.x, p.z) }];
    if (presence) {
      for (const o of [...presence.peers.values()].sort((a, b) => a.name.localeCompare(b.name))) {
        const known = o.visible || o.far, d = known ? Math.hypot(o.x - p.x, o.z - p.z) : 0;
        people.push({ id: o.id, name: o.name, color: o.color, where: known ? `${d < 1000 ? `${Math.round(d)} m away` : 'far away'}${zoneOf(o.x, o.z) ? ` · ${zoneOf(o.x, o.z)}` : ''}` : '' });
      }
    }
    hud.showRoster({ people, mode: presence?.mode || 'offline', admin: who.admin && presence?.admin, owner: who.owner, details: roster.details, bans: roster.bans, admins: roster.admins, visitors: roster.visitors, now: roster.now });
  };
  const refreshRoster = async () => {
    if (!who.admin) return;
    presence?.who();
    const [bans, admins, visitors] = await Promise.all([callApi('api/bans', { key: who.key }), callApi('api/admins', { key: who.key }), callApi('api/visitors', { key: who.key })]);
    roster.bans = bans?.bans || null;
    roster.admins = admins?.admins || null;
    roster.visitors = visitors || null;
    if (hud.rosterOpen) showRoster();
  };

  // ---------- interface actions
  // an animal of light is earned by coming back several days in a row (the administrator has them all)
  const unlocked = (e) => !e.rank || who.admin || who.days >= e.days;
  const showEmotes = () => hud.setEmotes(EMOTE_LIST.map((e, i) => ({ index: i, ...e, locked: !unlocked(e) })), who.days);
  // (the pictures of the animals of light, in the panel of the emotes: drawn by the renderer the first time they are looked at)
  hud.setRankPicture((kind) => rankPicture(engine.renderer, kind, 168));
  const emote = (i) => {
    const e = EMOTE_LIST[i];
    if (state.mode !== 'walk' || !e || player.dead) return false;
    if (e.rank) {
      if (!unlocked(e)) { const left = e.days - who.days; hud.note(`The ${e.label.toLowerCase()} comes on day ${e.days} in a row. You are on day ${who.days}: come back ${left === 1 ? 'tomorrow' : `${left} more days running`}!`, 5200); return false; }
      rank.play(e.rank, me.root);
      audio.play('rank');
    } else {
      if (e.clip && me.resting) return false; // seated: gestures of the arms and animals of light only
      me.emote(i);
      audio.play(e.id === 'cheer' || e.id === 'clap' || e.id === 'hype' || e.id === 'go' ? 'cheer' : e.id === 'rage' ? 'rage' : 'emote');
    }
    presence?.sendEmote(i);
    return true;
  };
  // sitting, lying down, boarding
  const interact = new Interact({ player, world, hud, peers: () => (avatars ? avatars.list : []) });
  // sitting down on the ground, legs crossed, wherever one stands (X, /sit, or the emotes): a step gets up again
  const sitDown = () => {
    if (state.mode !== 'walk' || fair.session || player.dead) return;
    if (player.cross) { player.cross = false; return; }
    if (!player.sitOnGround()) hud.note('Not here: find some ground to sit on.', 2600);
  };
  {
    // picking flowers: looked for a few times a second around the feet
    let flower = null, wait = 0;
    world.actionSources.push((p) => {
      // (flowers grow on the ground: nothing to pick from a stone, a deck or a roof above them)
      if (--wait <= 0) { wait = 12; flower = Math.abs(p.pos.y - data.heightAt(p.pos.x, p.pos.z)) < 0.7 ? world.scatter.flowerNear(p.pos.x, p.pos.z) : null; }
      return flower ? { label: look.bouquet ? 'Add to the bouquet' : 'Pick a flower', run: () => { look.kinds = [...(look.kinds || []), flower].slice(-9); look.bouquet = true; wait = 0; audio.play('pick'); } } : null;
    });
  }
  // toadstools: picked and eaten on the spot. Nobody should do that.
  world.actionSources.push((p) => {
    const it = world.mushrooms.near(p.pos.x, p.pos.y, p.pos.z);
    return it ? { label: 'Pick and eat the mushroom', run: () => { world.mushrooms.pick(it); audio.play('eat'); player.die('Ate a strange mushroom', [p.pos.x, p.pos.z, player.yaw]); } } : null;
  });
  app.interact = interact;
  // chat: shown to those who are there, kept nowhere
  // Commands, typed in the chat and never sent to anyone: /kill (when stuck), an emote by its name (/wave,
  // /cheer…) — and a few secret words, known by their fingerprints only (they are written nowhere in the game).
  const fingerprint = (word) => { let h = 2166136261; for (const c of word) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const SECRETS = new Map([
    [0xd8797277, () => { timers.dome = 12; return 'Your head feels… roomy.'; }],
    [0xdb851716, () => {
      if (player.seat || player.swimming || player.cave) return 'Not here!';
      player.riding = true;
      return 'A quad! Shift goes faster, E gets off.';
    }],
    [0x9b3e5c80, () => { timers.lowg = 25; return 'Gravity went for a walk.'; }],
    [0x58ffc1db, () => { timers.haste = 20; return 'Legs: upgraded.'; }],
    [0x26b6b2ab, () => { delete timers.maxi; timers.mini = 20; return 'Everything looks bigger from down here.'; }],
    [0xb77215b9, () => { timers.strobe = 15; return 'The lights have gone to your head.'; }],
    [0x9c5b13ae, () => { delete timers.mini; timers.maxi = 20; return 'Mind the lamp posts.'; }],
    [0x3f66406c, () => { timers.hops = 25; return 'Boing.'; }],
    [0xc4c40e95, () => {
      if (player.seat || player.cave || player.dead) return 'Not here!';
      timers.shot = 9; player.launch(34);
      return 'Lift-off!';
    }],
    [0xa2793b81, () => { timers.slick = 20; return 'Somebody waxed the valley.'; }],
    [0x8354f3fc, () => { timers.wide = 20; return 'What big eyes you have.'; }],
    [0x14433f79, () => { disguise = disguise === 1 ? 0 : 1; return disguise ? 'You are a bush. Nobody suspects a thing. (The same word again, and you are yourself.)' : 'You are yourself again.'; }],
    [0x0e46ff87, () => { disguise = disguise === 2 ? 0 : 2; return disguise ? 'You are a tree. Stand very still. (The same word again, and you are yourself.)' : 'You are yourself again.'; }],
  ]);
  const command = (text) => {
    const [word, ...rest] = text.slice(1).trim().split(/\s+/), name = word.toLowerCase();
    const tell = (line) => hud.addChat('✦', 5, line, true);
    if (name === 'kill') { if (!player.dead) player.die('Took the easy way out', [SPAWN.x, SPAWN.z, SPAWN.yaw + Math.PI]); return; }
    if (name === 'admin') { adminKey(rest.join(' ')); return; }
    if (name === 'sit') { sitDown(); return; }
    const e = emoteIndex(name);
    if (e >= 0) { emote(e); return; }
    const secret = SECRETS.get(fingerprint(word.toUpperCase()));
    // (no secret word while a game is on: the race is the same for everybody)
    tell(secret ? (fair.session ? 'Not during a game.' : secret()) : 'Unknown command.');
  };
  // characters to talk to: near one of them, what is typed goes to it and to nobody else
  // (what is said to a character, and what it answers, stays on this screen: nobody else sees or hears it)
  const npcs = world.npcs.map((n) => { const brain = new Npc(n.id); return { ...n, brain, tag: hud.tag(`npc-${n.id}`, n.name, 3, brain.title), met: false }; });
  let talking = null;
  world.actionSources.push((p) => {
    const n = npcs.find((q) => (q.x - p.pos.x) ** 2 + (q.z - p.pos.z) ** 2 < q.reach * q.reach);
    return n ? { label: `Talk to ${n.name}`, run: () => {
      talking = n;
      hud.toggleChat(true, n.brain.ask || `Say something to ${n.name}…`);
      if (!n.met) { n.met = true; const hello = n.brain.greeting(); hud.addChat(n.name, 3, hello, false, 'private'); hud.say(n.tag, hello); }
    } } : null;
  });
  const say = (text, channel = 'all') => {
    if (!cleanChat(text)) return;
    if (text.trim().startsWith('/')) { if (state.mode === 'walk') command(text.trim()); return; }
    if (talking) {
      const n = talking, mine = cleanChat(text);
      hud.addChat(name, color, mine, true, 'private');
      hud.say(hud.selfTag, mine);
      n.brain.reply(mine).then((answer) => { hud.addChat(n.name, 3, answer, false, 'private'); hud.say(n.tag, answer); });
      return;
    }
    const near = channel === 'near'; // (heard within twenty metres only)
    const important = channel === 'important' && who.admin && !!presence?.admin; // (an administrator's announcement)
    const sent = presence ? presence.sendChat(text, near, important) : cleanChat(text);
    if (!sent) { hud.note('Not so fast: a line every two seconds'); return; }
    hud.addChat(name, color, sent, true, important ? 'important' : near ? 'near' : '');
    hud.say(hud.selfTag, sent);
  };
  // the climb: a clock while climbing, the board of the best times at the gate
  const skyScores = new Scores('sky');
  const lists = (tops) => Object.fromEntries(Object.entries(tops).map(([k, v]) => [k, v])); // (already { name, score })
  // the fair: the four booths of the pier, the quad race and the flying theatre, each with its board. While
  // one of them is being played (`fair.session`), it has the pointer, the camera and the clock of the screen.
  const fair = { boards: { race: new Scores('race'), wing: new Scores('wing') }, session: null, kind: null, fov: null, after: 0, stands: { race: world.games.race.board, wing: world.games.wing.board }, tops: {} };
  for (const b of world.games.booths.list) { fair.boards[b.id] = new Scores(b.id); fair.stands[b.id] = b.board; }
  fair.boards.run = new Scores('run'); fair.stands.run = world.games.notices.arcade.board; // (the arcade cabinet)
  Scores.every().then((all) => { fair.tops = all; world.games.setScores(lists(all.sky)); for (const id in fair.stands) fair.stands[id].setScores(all[id]); });
  const _aim = { origin: new THREE.Vector3(), dir: new THREE.Vector3(), clicks: 0, down: false };
  const fairIo = {
    play: (sound, options) => audio.play(sound, options), note: (text) => hud.note(text, 3000),
    strike: () => emote(emoteIndex('punch')), go: () => fair.boards.race.start(),
    feathers: (x, y, z, n) => world.sparks.feathers(x, y, z, n),
  };
  const endGame = () => {
    const s = fair.session;
    if (!s) return;
    s.close();
    fair.session = null; fair.fov = null;
    if (fair.kind === 'race') { player.driver = null; player.riding = false; player.vel.set(0, 0, 0); }
    if (fair.kind === 'wing') {
      // (down from the stage, the wings handed back)
      const spot = world.games.wing.spot;
      player.driver = null; player.riding = false; player.vel.set(0, 0, 0);
      me.setWings(false);
      player.teleport(spot.x, spot.z, spot.yaw);
    }
    me.root.visible = true;
    document.body.classList.remove('playing');
    hud.setRun(null); hud.setSight(null); hud.setGauge(null);
    rig.snap(player.pos, player.yaw + Math.PI);
    startBlend(0.5);
  };
  // ---------- the boards, live: when somebody in the room finishes a game, their score is fetched and shown
  const GAMES = { sky: [CLIMB.name, formatTime], race: [RACE.name, formatTime], wing: [WING.name, (n) => `${n} column${n === 1 ? '' : 's'}`], run: [GAME_NAMES.run, (m) => `${m.toLocaleString('en-US')} m`] };
  for (const b of world.games.booths.list) GAMES[b.id] = [b.name, b.format || ((points) => `${points.toLocaleString('en-US')} points`)];
  const boardOf = (id) => (id === 'sky' ? skyScores : fair.boards[id]);
  const showBoard = (id, tops) => { if (id === 'sky') world.games.setScores(lists(tops)); else fair.stands[id]?.setScores(tops); fair.tops[id] = tops; };
  const rankOf = (list, who) => (list || []).findIndex((e) => e.name.toLowerCase() === who.toLowerCase());
  liveScore = async (peer, id) => {
    if (!GAMES[id] || !peer) return;
    const before = fair.tops[id], tops = await boardOf(id).tops(), [title, format] = GAMES[id];
    showBoard(id, tops);
    const at = rankOf(tops.day, peer.name);
    if (at < 0) return; // (kept in their browser only, or beaten since)
    const was = before ? rankOf(before.day, peer.name) : -1, same = was >= 0 && before.day[was].score === tops.day[at].score;
    if (same) return; // not a better score than the one they had
    hud.addChat('✦', 5, `${title}: ${peer.name} — ${format(tops.day[at].score)} (#${at + 1} today)`, true);
    const mine = rankOf(tops.day, name), minePast = before ? rankOf(before.day, name) : -1, theirsPast = was;
    if (mine >= 0 && at < mine && (theirsPast < 0 || minePast < 0 || theirsPast > minePast)) { hud.note(`${peer.name} just beat your score at ${title}!`, 6000); audio.play('fail', { volume: 0.5 }); }
    else audio.play('score', { volume: 0.5 });
  };
  /** The game is over: its score goes on the board (a time for the race, points for a booth). */
  const scoreGame = (id, title, score, text) => {
    fair.boards[id].submit(name, score).then(({ tops, rank: place, best, shared }) => {
      showBoard(id, tops);
      if (shared) presence?.sendScore(id);
      const where = place ? `#${place} of all time` : 'not on the board this time';
      hud.note(`${text} — ${best ? where : 'your best stands'}${shared ? '' : ' (kept in this browser only)'}`, 8000);
      if (place && place <= 10 && best) hud.addChat('✦', 5, `${title}: ${name} — ${text} (#${place})`, true);
    });
  };
  const playBooth = (booth) => {
    if (fair.session || player.dead) return;
    fair.boards[booth.id].start();
    fair.session = world.games.booths.open(booth, fairIo); fair.kind = 'booth'; fair.after = 0;
    player.riding = false;
    player.teleport(booth.stand[0], booth.stand[1], booth.stand[2]);
    me.root.visible = !fair.session.firstPerson;
    if (fair.session.crosshair) document.body.classList.add('playing');
    input.consumeClicks();
    hud.note(booth.how, 6500);
    startBlend(0.6);
  };
  const playRace = () => {
    if (fair.session || player.dead) return;
    if (player.cheat || timers.lowg || timers.haste) { hud.note('Not with a cheat on.'); return; }
    // (everybody races at the same size, as themselves: no secret word lasts into the race)
    for (const k of ['mini', 'maxi', 'dome', 'hops', 'slick', 'shot', 'wide', 'strobe']) delete timers[k];
    // (it leaves with the next start: whoever asks for the same one leaves at the same instant)
    const start = world.games.race.nextStart();
    fair.session = world.games.race.open(player, fairIo, start, presence?.id ?? 0); fair.kind = 'race'; fair.after = 0;
    player.driver = fair.session;
    hud.note(`${start.name} start! ${touch ? 'The stick steers; hold Run to drift, Jump to hop.' : 'Arrows or WASD · Shift: drift (a boost when you let go) · Space: hop · E: give up'}`, 7000);
    startBlend(0.6);
  };
  // the flying theatre: up on the stage with a pair of wings; the game holds the flyer, the scenery goes by
  const playWing = () => {
    if (fair.session || player.dead) return;
    fair.boards.wing.start();
    fair.session = world.games.wing.open(player, fairIo); fair.kind = 'wing'; fair.after = 0;
    player.riding = false;
    player.driver = fair.session.driver;
    me.setWings(true);
    input.consumeClicks();
    hud.note(touch ? 'Tap to flap, and fly through the gaps!' : 'Click or press Space to flap, and fly through the gaps! · E: give up', 6500);
    startBlend(0.6);
  };
  // the arcade cabinet: its game is played on a screen of its own, laid over this one
  const playArcade = () => {
    if (fair.session || player.dead) return;
    const spot = world.games.notices.arcade;
    fair.boards.run.start();
    fair.session = arcade.open(fairIo, `#${AVATAR_COLORS[color].toString(16).padStart(6, '0')}`); fair.kind = 'arcade'; fair.after = 0;
    player.riding = false;
    player.teleport(spot.x, spot.z, spot.yaw);
    input.consumeClicks();
    hud.note(touch ? 'Tap the top of the screen to jump, hold the bottom to duck.' : 'Space or ↑ jumps (hold it to jump higher), ↓ or S ducks.', 6500);
  };
  world.actionSources.unshift((p) => { // (before the flowers and the rest: by the cabinet, the first thing to do is to play)
    const cab = world.games.notices.arcade;
    if (Math.abs(p.pos.y - PIER.deckY) < 2 && near(p, [cab.x, cab.z], cab.reach)) return { label: `Play ${GAME_NAMES.run}`, run: playArcade };
    return null;
  });
  world.actionSources.push((p) => {
    const booth = world.games.booths.near(p.pos.x, p.pos.z);
    if (booth) return { label: `Play ${booth.name}`, run: () => playBooth(booth) };
    if (world.games.wing.near(p.pos.x, p.pos.z)) return { label: `Play ${WING.name}`, run: playWing };
    if (!world.games.race.near(p.pos.x, p.pos.z)) return null;
    const start = world.games.race.nextStart();
    return { label: `Race: ${RACE.laps} laps on a quad · ${start.name} start in ${Math.ceil(start.wait)} s`, run: playRace };
  });
  world.games.race.clock = sharedNow;
  // one frame of the game being played
  const fairStep = (dt) => {
    const s = fair.session;
    if (player.dead) { endGame(); return; }
    if (fair.kind === 'arcade') {
      // (its own little screen: what is pressed, on the keys or on the picture)
      const P = input.pointer, zone = P.down ? arcade.zone(P.x, P.y) : null, K = input.keys;
      const keys = { jump: K.has('Space') || K.has('ArrowUp') || K.has('KeyW') || zone === 'jump', duck: K.has('ArrowDown') || K.has('KeyS') || zone === 'duck' };
      input.consumeClicks();
      player.update(dt, rig.heading, false);
      if (s.over) {
        if (fair.after === 0) { fair.after = 0.01; if (s.score > 0) scoreGame('run', GAME_NAMES.run, s.score, `${s.score.toLocaleString('en-US')} m`); }
        else if ((fair.after += dt) > 0.7 && keys.jump && !fair.heldJump) { fair.boards.run.start(); s.restart(); fair.after = 0; } // (another run)
      }
      fair.heldJump = keys.jump;
      s.step(dt, keys);
      hud.setRun(s.line);
    } else if (fair.kind === 'booth' || fair.kind === 'wing') {
      const P = input.pointer, view = s.viewAt ? s.viewAt(engine.width / engine.height) : s.view, tall = engine.width < engine.height;
      camera.position.copy(view.pos); camera.lookAt(view.look);
      fair.fov = s.viewAt ? view.fov : Math.min(96, view.fov * (tall ? 1.5 : 1)); // (a game that frames itself says how wide it looks)
      camera.updateMatrixWorld();
      _aim.dir.set((P.x / window.innerWidth) * 2 - 1, -(P.y / window.innerHeight) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
      _aim.origin.copy(camera.position);
      _aim.clicks = input.consumeClicks() + (input.pressed('Space') ? 1 : 0);
      _aim.down = P.down || input.keys.has('Space');
      s.step(dt, state.time, _aim);
      player.update(dt, rig.heading, false);
      hud.setRun(s.line);
      hud.setSight(s.crosshair && !s.over ? P.x : null, P.y);
      hud.setGauge(s.gauge);
      if (s.over && fair.after === 0) {
        fair.after = 0.01;
        audio.play(s.score > 0 ? 'victory' : 'fail');
        if (s.score > 0) scoreGame(s.booth.id, s.booth.name, s.score, s.booth.format ? s.booth.format(s.score) : `${s.score} ${s.booth.unit ? (s.score === 1 ? s.booth.unit.replace(/s$/, '') : s.booth.unit) : s.booth.seconds ? 'points' : 'on the scale'}`); else hud.note('Nothing this time. Have another go!', 4000);
      }
      if (fair.after > 0 && (fair.after += dt) > 1.6) endGame();
    } else {
      player.update(dt, rig.heading, true);
      fair.fov = s.camera(camera, dt);
      hud.setRun(s.line);
      if (s.over && fair.after === 0) {
        fair.after = 0.01;
        // (a time driven on the track that is not in use is not kept: see TRACKS)
        if (TRACK === 'grove') scoreGame('race', RACE.name, s.time, formatTime(s.time)); else { audio.play('victory'); hud.note(`${formatTime(s.time)} on the ${TRACK} track — a track on trial: its times are not kept.`, 8000); }
      }
      if (fair.after > 0 && (fair.after += dt) > 3) endGame();
    }
    if (fair.session && input.pressed('KeyE') && (!s.over || fair.kind === 'arcade')) { endGame(); hud.note(fair.kind === 'race' ? 'Race abandoned.' : 'Game left.'); }
  };
  Object.assign(app, { fair, playBooth, playRace, playWing, playArcade, endGame, fairStep });
  queueMicrotask(() => Object.assign(app, { shop, refreshShop, adminKey, scoreGame }));
  world.games.events = {
    note: (text) => hud.note(text, 4200),
    run: (text) => hud.setRun(text),
    started: () => { skyScores.start(); audio.play('start'); },
    finished: (ms, clean) => {
      audio.play('victory');
      rank.play('dragon', me.root);
      presence?.sendEmote(emoteIndex('dragon'));
      if (!clean) { hud.note(`${formatTime(ms)} — but a cheat was on: not recorded`, 7000); return; }
      skyScores.submit(name, ms).then(({ tops, rank: place, best, shared }) => {
        world.games.setScores(lists(tops));
        fair.tops.sky = tops;
        if (shared) presence?.sendScore('sky');
        const where = place ? `#${place} of all time` : 'not on the board this time';
        hud.note(`${formatTime(ms)} — ${best ? where : 'your best time stands'}${shared ? '' : ' (kept in this browser only)'}`, 8000);
        hud.addChat('✦', 5, `${CLIMB.name}: ${name} reached the top in ${formatTime(ms)}${place ? ` (#${place})` : ''}`, true);
      });
    },
  };
  // the sky villages: one is carried there from the Sky Gate, and back through the ring of each village
  const sky = world.sky;
  const travel = (to, word) => {
    const [x, z, facing] = to.arrive;
    player.teleport(x, z, facing);
    rig.snap(player.pos, facing + Math.PI); // the camera behind, looking the same way
    hud.note(word, 4200);
    audio.play('teleport');
  };
  // The big red button at the top of the island: a nuclear explosion far out at sea — one for the whole room,
  // and no other for a quarter of an hour (the relay sees to it; alone, this browser does).
  const blast = new Blast();
  scene.add(blast.group);
  const button = world.places.button;
  const bomb = { readyAt: Number(store.get('mmf.blast')) || 0, fuse: 0, since: 0 };
  const blastLeft = () => Math.max(0, (presence?.mode === 'online' ? presence.blastReadyAt : bomb.readyAt) - Date.now());
  const mmss = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  /** It is going off: a siren first (unless we arrive in the middle of the show), then the flash. */
  const detonate = (by, since = 0) => {
    if (blast.active || bomb.fuse > 0) return;
    if (since > 0) { blast.fire(since); return; }
    bomb.fuse = 1.9;
    button.press();
    audio.play('press');
    hud.addChat('✦', 5, `${by} pressed the big red button. Enjoy the show!`, true);
  };
  const pressButton = () => {
    if (blastLeft() > 0) { hud.note(`Patience: one nuclear explosion every fifteen minutes. Next one in ${mmss(blastLeft())}.`, 4500); return; }
    if (presence?.sendBlast()) return; // (the relay tells the whole room, us included)
    bomb.readyAt = Date.now() + BLAST_EVERY;
    store.set('mmf.blast', String(bomb.readyAt));
    detonate(name);
  };
  world.actionSources.push((p) => {
    if (!near(p, [button.x, button.z], button.reach) || Math.abs(p.pos.y - button.y) > 2.5) return null;
    const left = blastLeft();
    return { label: left > 0 ? `The button is recharging · ${mmss(left)}` : 'Press the big red button', run: pressButton };
  });
  Object.assign(app, { blast, pressButton, bomb });
  // The administrator goes where they like: next to a visitor ({ id }), or to a spot of the map ({ x, z }).
  // the administrator gives something to a visitor: a thing of the shop to keep, or the Game Pass for a while
  const giftTo = async (to) => {
    if (!who.admin || !to?.dev) return;
    if (!shop.open) { hud.note('The shop is not open: everything is free already.', 5000); return; }
    const options = [
      { label: `${PASS.name} — 30 days`, note: 'Every hat, the Jetpack Lite, the four sizes, the extra colours', what: { pass: 30 }, color: [0.95, 0.76, 0.3] },
      { label: `${PASS.name} — a year`, note: 'The same, for 365 days', what: { pass: 365 }, color: [0.95, 0.76, 0.3] },
      ...ITEMS.map((it) => ({ label: it.name, note: `${it.group} · ${price(it.price)} in the shop`, what: { item: it.id } })),
    ];
    const pick = await hud.choose(`A gift for ${to.name}`, 'It is theirs at once: a thing to keep for good, or the pass for the days you choose. Their game says it comes from the fair.', options);
    if (pick === null) return;
    const wrong = await shop.gift(who.key, to.dev, options[pick].what);
    if (wrong) { hud.note(wrong, 6000); return; }
    presence?.gifted(to.id);
    hud.note(`Given to ${to.name}: ${options[pick].label}.`, 5000);
  };
  const goTo = (to) => {
    if (!who.admin || state.mode !== 'walk' || player.dead) return;
    let x = to.x, z = to.z, word = 'There you are.';
    if (to.id !== undefined) {
      const o = presence?.peers.get(to.id);
      if (!o || !(o.visible || o.far)) { hud.note('Where they are is not known yet. Try again in a moment.', 4000); return; }
      const a = Math.random() * Math.PI * 2;
      x = o.x + Math.cos(a) * 1.4; z = o.z + Math.sin(a) * 1.4; word = `Next to ${o.name}.`;
    }
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const stand = world.collision.walkable.bind(world.collision);
    if (!stand(x, z)) {
      // (the nearest place one can stand on)
      let best = null;
      for (let r = 1; r <= 90 && !best; r += r < 6 ? 0.7 : 2) for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2, qx = x + Math.cos(a) * r, qz = z + Math.sin(a) * r; if (stand(qx, qz)) { best = [qx, qz]; break; } }
      if (!best) { hud.note('Nowhere to stand around there.', 4000); return; }
      [x, z] = best;
    }
    if (fair.session) endGame();
    const facing = to.id !== undefined ? Math.atan2(presence.peers.get(to.id).x - x, presence.peers.get(to.id).z - z) : player.yaw;
    player.teleport(x, z, facing);
    rig.snap(player.pos, facing + Math.PI);
    hud.note(word, 3000);
    audio.play('teleport');
  };
  // (what the large map writes by a village: its name — and what it costs, where the map shows prices)
  const villageLabel = (v) => (FEATURES.mapPrices && v.forHire ? money(v.price) : v.name);
  const chooseVillage = () => {
    const here = sky.villageAt(player.pos.x, player.pos.z);
    // (the cheapest first; each is the only one of its kind)
    const list = sky.villages.filter((v) => v !== here).sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
    hud.choose('The sky villages — pay for view', 'Others invented pay-per-view. We invented pay FOR view: fifty mountain tops, one of each, the cheapest first. Pick one and you are carried there — looking is free.',
      list.map((v) => ({ label: v.name, note: v.forHire ? `For sale · ${money(v.price)}/mo · 1 left` : `Sold · ${v.motto || 'somebody lives here'}`, color: v.color })))
      .then((i) => { if (i !== null && state.mode === 'walk' && !player.dead) travel(list[i], `Welcome to ${list[i].name}`); });
  };
  const near = (p, q, r) => (p.pos.x - q[0]) ** 2 + (p.pos.z - q[1]) ** 2 < r * r;
  // ---------- the shop and the sponsors
  /** Offers something for sale; on yes, off to the payment page. */
  const offer = (item, title, lead, cents, monthly) => {
    if (!shop.open) { hud.note('The shop is not open yet. Come back soon!', 5200); return; }
    hud.choose(title, lead, [{ label: `${monthly ? 'Take it' : 'Buy it'} · ${price(cents)}${monthly ? ' a month' : ''}`, note: shop.mode === 'test' ? 'Test mode: no real money' : 'Paid on Stripe', color: [0.9, 0.7, 0.2] }, { label: 'Not now', note: 'Keep looking round' }])
      .then(async (i) => { if (i !== 0) return; hud.note('Opening the payment page…', 8000); const wrong = await shop.buy(item); if (wrong) hud.note(wrong, 7000); });
  };
  // every place that can be sponsored: id → { what, cents, limits, set(sponsor | null) }
  const places = new Map();
  for (const sl of world.sponsorSlots || []) places.set(sl.id, { what: sl.what, spot: sl, set: sl.set });
  for (let n = 1; n <= (world.pier.gondolas || 0); n++) places.set(`gondola:${n}`, { what: `gondola ${n} of the big wheel`, set: (sp) => world.pier.setGondola(n, sp) });
  for (const v of sky.villages) places.set(`village:${v.id}`, { what: `the sky village ${v.name}`, village: v, set: (sp) => { if (sp) sky.setSponsor(v.index, { name: sp.title, motto: sp.subtitle, url: sp.url }); } });
  const plaques = world.places.plaques; // (the plaques of the companions, round the plinth of the golden dog: places paid once)
  for (let n = 1; n <= (plaques?.count || 0); n++) places.set(`plaque:${n}`, { what: 'a plaque round the golden dog', plaque: n, set: (sp) => plaques.set(n, sp) });
  const shown = new Map(); // what is painted where: id → the address of its picture + its words
  const applySponsors = async () => {
    for (const [id, place] of places) {
      const view = shop.slots[id], live = view && view.state === 'live';
      // (what awaits approval is painted where it would go for the administrator, who has to see it to say yes
      // or no — and for the holder of a plaque, who sees theirs as it will be)
      const d = (who.admin && !place.village && pending[id]?.draft) || (place.plaque && view?.mine && view.draft) || null;
      const key = d ? `?${d.title}|${d.subtitle}|${d.logo}|${d.keep ? 1 : 0}` : live ? `${view.title}|${view.subtitle}|${view.logo}|${view.bg || ''}` : view && place.plaque ? `taken${view.mine ? '!' : ''}` : '';
      if ((shown.get(id) || '') === key) continue;
      shown.set(id, key);
      if (d) place.set({ title: d.title, subtitle: d.subtitle, url: d.url, bg: view?.bg || '', pending: true, logo: d.logo ? await loadImage(who.admin ? d.logo : ownDraft(d.logo), who.admin ? who.key : '') : d.keep && live ? await loadImage(view.logo) : null });
      else if (place.plaque) place.set(live ? { title: view.title, subtitle: view.subtitle, logo: view.logo } : view ? { taken: true, mine: !!view.mine } : null); // (its picture is fetched when the plate is painted)
      else place.set(live ? { title: view.title, subtitle: view.subtitle, url: view.url, bg: view.bg || '', logo: await loadImage(view.logo) } : null);
    }
    hud.setVillages(sky.villages, data.meta.size, villageLabel);
    world.games.notices.ads.set(adRows()); // (the board of the booth of the sponsors)
  };
  let shopKnown = false; // (has the server said what is theirs yet?)
  const refreshShop = async () => {
    await shop.load();
    shopKnown = true;
    shop.everything = who.admin;
    // (nothing is worn that is not theirs — or lent: the Game Pass lends every hat)
    if (look.hat && !owns(HATS[look.hat].id)) look.hat = 0;
    // (a colour of the pass, a size: back to everybody's when the pass is gone)
    if (color >= FREE_COLORS && !shop.hasPass) { color -= FREE_COLORS; me.setColor(color); store.set('mmf.color', String(color)); presence?.setIdentity(name, color); }
    hud.setRobot({ color, size: shop.hasPass ? size : 0, pass: shop.hasPass });
    if (kit.paint && !shop.owns(`paint:${PAINTS[kit.paint]}`)) kit.paint = 0;
    if (kit.trail && !shop.owns(`trail:${TRAILS[kit.trail]}`)) kit.trail = 0;
    wear();
    fitJet();
    // (the free day of the light jetpack: said once, the first time it is found)
    if (shop.open && shop.lent('jetlite') === 'trial' && !shop.has('jetpack') && !store.get('mmf.trial')) {
      store.set('mmf.trial', '1');
      setTimeout(() => hud.addChat('✦', 5, 'A present for your first day: the Jetpack Lite is yours for 24 hours. Jump, then press jump again in the air.', true), 9000);
    }
    hud.setShop(shop.open);
    hud.setFireworks(shop.owns('fireworks'));
    for (const text of shop.notes.splice(0)) hud.addChat('✦', 5, text, true); // (outbid, refunded: said once)
    // (the empty panel over a board says how to take it)
    for (const sl of world.sponsorSlots || []) sl.offer?.(shop.open ? `from ${price(shop.least(sl.id))} · step up and bid` : '');
    shopView.stale('board:');
    shopView.refresh(shopItems());
    await applySponsors();
  };
  /** The holder of a place (or the administrator) says what to show there. */
  const fillPlace = async (id) => {
    const place = places.get(id), view = shop.slots[id] || {}, was = view.draft || view, isVillage = !!place.village, isPlaque = !!place.plaque;
    const byHand = who.admin && !view.mine; // (the administrator fills a place in for a sponsor: shown at once)
    const got = await hud.form(isPlaque ? (byHand ? 'This plaque' : 'Their plaque') : isVillage ? 'Your village' : byHand ? 'This panel' : 'Your panel',
      isPlaque ? (byHand ? 'What you save is engraved at once, for everyone to read.' : 'Their name, a few words — and their picture, if you have one you like. It is engraved once the fair has looked at it.') : byHand ? 'What you save is shown to everyone at once. The colour behind it is yours to choose.' : 'It is shown once the fair has looked at it. Keep it short: it is painted on a sign.', [
        { key: 'title', label: isPlaque ? 'Their name (22 letters at most)' : isVillage ? 'Its name (22 letters at most)' : 'Your name (28 letters at most)', value: was.title || '', max: isVillage || isPlaque ? 22 : 28 },
        { key: 'subtitle', label: isPlaque ? 'A few words (40 letters at most)' : isVillage ? 'A line under it (34 letters at most)' : 'A line under it (40 letters at most)', value: was.subtitle || '', max: isVillage ? 34 : 40 },
        ...(isPlaque ? [] : [{ key: 'url', label: 'Your website (https://…)', value: was.url || '', max: 200, hint: 'https://' }]),
        ...(isVillage ? [] : [{ key: 'logo', label: isPlaque ? 'Their picture (PNG, JPEG or WebP) — leave empty to keep the one you sent' : 'Your logo (PNG, JPEG or WebP) — leave empty to keep the one you sent', type: 'file' }]),
        ...(byHand && !isVillage && !isPlaque ? [{ key: 'bg', label: 'The colour of the panel behind it', type: 'color', value: view.bg || '#fbf7ec' }] : []),
      ], byHand ? 'Save' : 'Send it');
    if (!got) return;
    if (!got.title) { hud.note('A name is needed.', 4000); return; }
    let logo = null;
    if (got.logo) { logo = await logoData(got.logo, 256, isPlaque); if (!logo) { hud.note('That picture cannot be used: a PNG, a JPEG or a WebP, please.', 6000); return; } }
    const wrong = byHand ? await shop.set(id, { title: got.title, subtitle: got.subtitle, url: got.url, logo, ...(got.bg !== undefined && { bg: got.bg }) }, who.key) : await shop.fill(id, { title: got.title, subtitle: got.subtitle, url: got.url, logo });
    hud.note(wrong || (byHand ? 'Done: it is shown to everyone.' : isPlaque ? 'Sent. Their plaque will be engraved as soon as the fair has looked at it.' : 'Sent. It will be shown as soon as it is approved.'), 7000);
    if (!wrong) { if (who.admin) pending = (await shop.all(who.key)) || {}; await refreshShop(); }
  };
  let pending = {}; // the administrator: every place as the server keeps it (drafts included)
  /** What can be done about the place `id`, for who stands by it: [{ label, run }] */
  /** A bid for the panel of a game: how much, then off to the payment page. */
  const bidFor = async (id) => {
    if (!shop.open) { hud.note('The shop is not open yet. Come back soon!', 5200); return; }
    const place = places.get(id), view = shop.slots[id], least = shop.least(id);
    const got = await hud.form(`Sponsor ${GAME_NAMES[id.split(':')[1]] || place.what}`,
      `${view ? `Its sponsor paid ${price(view.bid || 0)}: bid at least ${price(least)} and the panel is yours.` : `Nobody sponsors it yet: the first bid is ${price(least)}.`} You pay once and keep the panel — your name, a line, your logo, a link — until somebody bids more. That day you are refunded in full, automatically, and they take your place.`,
      [{ key: 'bid', label: `Your bid, in US dollars (at least ${price(least)})`, value: String(least / 100), max: 9 }], 'Go to payment');
    if (!got) return;
    const bid = Math.round(Number(String(got.bid).replace(',', '.').replace(/[^0-9.]/g, '')) * 100);
    if (!Number.isFinite(bid) || bid < least) { hud.note(`The bid must be at least ${price(least)}.`, 5000); return; }
    hud.note('Opening the payment page…', 8000);
    const wrong = await shop.buy(id, bid);
    if (wrong) { hud.note(wrong, 7000); refreshShop(); }
  };
  const placeActions = (id, row = '') => {
    const place = places.get(id), view = shop.slots[id], out = [];
    const cents = shop.cost(id, place.village?.tier);
    if (who.admin && pending[id]?.draft) {
      const d = pending[id].draft;
      out.push({ label: `Approve "${d.title}"`, run: async () => { await shop.decide(id, true, who.key); pending = (await shop.all(who.key)) || {}; await refreshShop(); hud.note('Approved: it is shown to everyone.', 5000); } });
      out.push({ label: 'Refuse it', run: async () => { await shop.decide(id, false, who.key); pending = (await shop.all(who.key)) || {}; await applySponsors(); hud.note('Refused.', 4000); } });
      return out;
    }
    if (place.plaque) {
      // a plaque for a companion: paid once; its holder has it engraved (and may change it); the administrator may fill one in
      if (view?.mine) out.push({ label: view.draft ? 'Change what you sent for your plaque' : view.state === 'live' ? 'Change your plaque' : 'Have your plaque engraved', run: () => fillPlace(id) });
      else if (who.admin && shop.open) out.push({ label: `Fill the ${row} plaque in (administrator)`, run: () => fillPlace(id) });
      else if (!view && shop.open) out.push({ label: `The ${row} plate, for your companion · ${price(cents)}`, run: () => offer(id, 'A plaque for a companion', `${price(cents)}, once, and this plate is theirs for as long as the fair stands: their name, a few words and their picture if you like, at the feet of the best dog ever. You write it right after paying; it is engraved as soon as the fair has looked at it.`, cents, false) });
      return out;
    }
    if (view?.mine || (who.admin && shop.open)) out.push({ label: view?.mine ? (view.draft ? 'Change what you sent' : 'Set up your panel') : 'Fill this place in (administrator)', run: () => fillPlace(id) });
    if (view?.state === 'live' && view.url) out.push({ label: `Visit ${view.title}`, run: () => window.open(view.url, '_blank', 'noopener,noreferrer') });
    if (id.startsWith('board:')) {
      // the panel of a game goes to the highest bidder: from one dollar; whoever is outbid is refunded
      if (shop.open && !view?.mine && out.length < 2) out.push({ label: view ? `Outbid the sponsor · from ${price(shop.least(id))}` : `Sponsor ${place.what} · from ${price(shop.least(id))}`, run: () => bidFor(id) });
    } else if (!view && shop.open && !out.length) out.push({ label: `Sponsor ${place.what} · ${price(cents)} a month`, run: () => offer(id, `Sponsor ${place.what}`, `${price(cents)} a month, for as long as you like: your name, a line under it, your logo and a link, shown to every visitor. It appears once the fair has approved it.`, cents, true) });
    return out;
  };
  world.actionSources.push((p) => {
    for (const sl of world.sponsorSlots || []) if (Math.abs(p.pos.y - sl.y) < 2.5 && near(p, [sl.x, sl.z], sl.reach)) return placeActions(sl.id)[0] || null;
    return null;
  });
  world.actionSources.push((p) => {
    for (const sl of world.sponsorSlots || []) if (Math.abs(p.pos.y - sl.y) < 2.5 && near(p, [sl.x, sl.z], sl.reach)) return placeActions(sl.id)[1] || null;
    return null;
  });
  // the plaques of the companions: the two plates in front of whoever stands by the plinth (the upper, then the lower)
  const plaqueActions = (p) => {
    if (!plaques || Math.abs(p.pos.y - plaques.y) > 2.5) return [];
    const col = plaques.columnAt(p.pos.x, p.pos.z);
    if (col === null) return [];
    const two = plaques.ids(col), out = [];
    // (with flowers in hand: they can be left under a plate that has a name on it)
    const named = two.find((q) => shop.slots[q.id]?.state === 'live');
    if (look.bouquet && named) out.push({ label: `Lay your bouquet for ${shop.slots[named.id].title}`, run: () => {
      const w = plaques.where(named.n);
      look.bouquet = false; look.kinds = undefined;
      audio.play('pick');
      world.sparks.glitter(w.x, w.y, w.z, 0.9, 50);
      hud.note(`For ${shop.slots[named.id].title}. Good companions are never very far.`, 5200);
    } });
    for (const q of two) out.push(...placeActions(q.id, q.row));
    return out;
  };
  world.actionSources.push((p) => plaqueActions(p)[0] || null);
  world.actionSources.push((p) => plaqueActions(p)[1] || null);
  // the golden dog above its cove: say hello at the foot of the plinth, and it answers
  world.actionSources.push((p) => {
    const c = world.places.crokmou;
    if (!c || Math.abs(p.pos.y - c.y) > 3 || !near(p, [c.x, c.z], c.reach)) return null;
    const name = c.name[0] + c.name.slice(1).toLowerCase();
    // (with flowers in hand: they are for the dog)
    if (look.bouquet) return { label: `Lay your bouquet at ${name}'s feet`, run: () => {
      look.bouquet = false; look.kinds = undefined;
      audio.play('woof');
      world.sparks.glitter(c.head.x, c.head.y, c.head.z, 6, 110);
      world.sparks.glitter(p.pos.x, p.pos.y + 0.4, p.pos.z, 1.2, 40);
      hud.note(`Woof! Woof! ${name} has never been given flowers before. Best visitor ever.`, 5200);
    } };
    return { label: `Say hello to ${name}`, run: () => {
      audio.play('woof');
      world.sparks.glitter(c.head.x, c.head.y, c.head.z, 5, 70);
      hud.note(`Woof! ${name} is very pleased to see you.`, 4200);
    } };
  });
  // a bouquet in hand and somebody close by: it can be given to them (they take it if their hands are free)
  world.actionSources.push((p) => {
    if (!look.bouquet || !avatars) return null;
    let best = null, bd = 2.6 * 2.6;
    for (const o of avatars.list) { const d = (o.x - p.pos.x) ** 2 + (o.z - p.pos.z) ** 2; if (d < bd && Math.abs(o.y - p.pos.y) < 2) { bd = d; best = o; } }
    return best ? { label: `Give your bouquet to ${best.name}`, run: () => {
      look.bouquet = false; look.kinds = undefined;
      presence?.sendEmote(BOUQUET);
      audio.play('pick');
      hud.note(`You hold out your bouquet to ${best.name}.`, 4000);
    } } : null;
  });
  // the booth of the sponsors, on the way to the mill: every game, who sponsors it, and the way to take its panel
  const boardIds = () => Object.keys(GAME_NAMES).map((k) => `board:${k}`).filter((id) => places.has(id));
  const sponsorLine = (id) => { const v = shop.slots[id], d = who.admin && pending[id]?.draft; return d ? `Awaiting approval: ${d.title}` : v?.mine ? 'Yours: set it up' : v?.state === 'live' ? v.title : v ? 'Taken' : shop.open ? `Free · from ${price(shop.least(id))}` : 'Free'; };
  const adRows = () => boardIds().map((id) => { const v = shop.slots[id]; return { game: GAME_NAMES[id.split(':')[1]], sponsor: v?.state === 'live' ? v.title : '', offer: shop.open ? `from ${price(shop.least(id))}` : 'free' }; });
  world.actionSources.unshift((p) => { // (the first thing to do at the booth, whatever grows at its foot)
    const ads = world.games.notices.ads;
    if (!near(p, [ads.x, ads.z], ads.reach)) return null;
    return { label: 'The games and their sponsors', run: () => {
      const ids = boardIds();
      hud.choose('Sponsor a game', 'Your name, a line, your logo and a link over the board of scores of a game, in sight of everybody who plays it. The highest bid holds the panel; whoever is outbid is refunded in full.', ids.map((id) => ({ label: GAME_NAMES[id.split(':')[1]], note: sponsorLine(id), color: shop.slots[id]?.state === 'live' ? [0.9, 0.7, 0.2] : [0.5, 0.55, 0.6] })))
        .then((i) => { if (i === null) return; const acts = placeActions(ids[i]); if (acts.length) acts[0].run(); else hud.note(shop.open ? 'That one is taken.' : 'The shop is not open yet. Come back soon!', 4000); });
    } };
  });
  // the stand of the wheel: its gondolas, who sponsors them, which are free
  world.actionSources.push((p) => {
    if (!world.pier.sponsorBooth || !near(p, world.pier.sponsorBooth, 2.6)) return null;
    return { label: 'The gondolas and their sponsors', run: () => {
      const ids = Array.from({ length: world.pier.gondolas }, (_, k) => `gondola:${k + 1}`);
      const say = (id) => { const v = shop.slots[id], d = who.admin && pending[id]?.draft; return d ? `Awaiting approval: ${d.title}` : v?.mine ? 'Yours: set it up' : v?.state === 'live' ? v.title : v ? 'Taken' : shop.open ? `Free · ${price(shop.prices.gondola)} a month` : 'Free'; };
      hud.choose('The gondolas of the big wheel', 'Twenty-four gondolas, a banner on each: its sponsor goes round with the wheel, in sight of the whole bay.', ids.map((id, k) => ({ label: `Gondola ${k + 1}`, note: say(id), color: shop.slots[id]?.state === 'live' ? [0.9, 0.7, 0.2] : [0.5, 0.55, 0.6] })))
        .then((i) => { if (i === null) return; const acts = placeActions(ids[i]); if (acts.length) acts[0].run(); else hud.note(shop.open ? 'That one is taken.' : 'The shop is not open yet. Come back soon!', 4000); });
    } };
  });
  // a village for hire: what it brings, what it costs, and the way to take it
  const hireVillage = (v) => {
    if (!shop.open) { hud.note('Hiring opens soon. Come back shortly!', 5200); return; }
    hud.choose(`${v.name} is for sale`, `${VILLAGE_PITCH.title} ${money(v.price)} a month and this mountain top is yours — the only ${v.name} there will ever be. ${VILLAGE_PERKS.join(' ')} ${VILLAGE_PITCH.foot}`, [{ label: `Take it · ${money(v.price)} a month`, note: 'Your name, your colours, your link', color: v.color }, { label: 'Not now', note: 'My accountant is watching' }])
      .then(async (i) => { if (i !== 0) return; hud.note('Opening the payment page…', 8000); const wrong = await shop.buy(`village:${v.id}`); if (wrong) hud.note(wrong, 7000); });
  };
  world.actionSources.push((p) => {
    if (!sky.gate.hidden && near(p, [sky.gate.x, sky.gate.z], 3.6)) return { label: 'Travel to a sky village', run: chooseVillage };
    const v = sky.villageAt(p.pos.x, p.pos.z);
    return v && near(p, v.ring, 3.2) ? { label: 'Back to the valley', run: () => travel(sky.gate, 'Back in the valley') } : null;
  });
  world.actionSources.push((p) => {
    const v = sky.villageAt(p.pos.x, p.pos.z);
    if (!v) return null;
    if (near(p, v.ring, 3.2)) return { label: 'Another village', run: chooseVillage };
    if (near(p, v.board, 3.0) || near(p, v.sign, 3.0)) {
      // (its holder sets it up there; the administrator approves there; anybody else may hire it while it is free)
      const id = `village:${v.id}`, view = shop.slots[id];
      if (view?.mine || (who.admin && (pending[id]?.draft || view))) { const acts = placeActions(id); if (acts.length) return acts[0]; }
      if (v.forHire && !view) return { label: `Buy ${v.name} · ${money(v.price)} a month`, run: () => hireVillage(v) };
    }
    return v.url && (near(p, v.sign, 3.4) || (!v.forHire && near(p, v.board, 3.2))) ? { label: `Visit ${v.name}`, run: () => window.open(v.url, '_blank', 'noopener,noreferrer') } : null;
  });
  Object.assign(app, { travel, sky });
  // ---------- the item shop: everything that is sold, on one screen (ui/ShopView.js)
  const WEARABLE = ['hat', 'paint', 'trail', 'jetpack', 'jetlite'];
  const previewer = new Previewer(engine, factory);
  // (the picture of a place to sponsor: its panel as it stands over the board, under the name of the game)
  const panelPicture = (id, w, h) => {
    const c = document.createElement('canvas'), view = shop.slots[id], game = GAME_NAMES[id.split(':')[1]] || '';
    c.width = w; c.height = h;
    const ctx = c.getContext('2d'), pw = w * 0.9, ph = pw * 0.31;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.font = `italic 900 ${Math.round(h * 0.085)}px 'Arial Black', Impact, Arial, sans-serif`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'; ctx.shadowOffsetY = 3; ctx.shadowBlur = 0;
    ctx.fillText(game.toUpperCase(), w / 2, h * 0.2, w * 0.92);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 8;
    ctx.translate(w / 2, h * 0.47); ctx.rotate(-0.05);
    ctx.fillStyle = '#000'; ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
    ctx.shadowColor = 'transparent';
    ctx.translate(-pw / 2, -ph / 2);
    ctx.beginPath(); ctx.rect(0, 0, pw, ph); ctx.clip();
    const sponsor = view?.state === 'live' ? { title: view.title, subtitle: view.subtitle, logo: null } : null;
    drawSponsor(ctx, pw, ph, sponsor, { what: 'this game' });
    return c;
  };
  const passPicture = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d'), tw = w * 0.86, th = tw * 0.52;
    ctx.translate(w / 2, h * 0.46); ctx.rotate(-0.09);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 9;
    const g = ctx.createLinearGradient(-tw / 2, -th / 2, tw / 2, th / 2);
    g.addColorStop(0, '#ffe08a'); g.addColorStop(0.5, '#f2c14e'); g.addColorStop(1, '#c98d1f');
    ctx.fillStyle = g;
    // (a ticket: a rounded card with a bite out of each side)
    const r = th * 0.1, bite = th * 0.11;
    ctx.beginPath();
    ctx.moveTo(-tw / 2 + r, -th / 2); ctx.lineTo(tw / 2 - r, -th / 2); ctx.quadraticCurveTo(tw / 2, -th / 2, tw / 2, -th / 2 + r);
    ctx.lineTo(tw / 2, -bite); ctx.arc(tw / 2, 0, bite, -Math.PI / 2, Math.PI / 2, true); ctx.lineTo(tw / 2, th / 2 - r); ctx.quadraticCurveTo(tw / 2, th / 2, tw / 2 - r, th / 2);
    ctx.lineTo(-tw / 2 + r, th / 2); ctx.quadraticCurveTo(-tw / 2, th / 2, -tw / 2, th / 2 - r); ctx.lineTo(-tw / 2, bite); ctx.arc(-tw / 2, 0, bite, Math.PI / 2, -Math.PI / 2, true);
    ctx.lineTo(-tw / 2, -th / 2 + r); ctx.quadraticCurveTo(-tw / 2, -th / 2, -tw / 2 + r, -th / 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(90, 50, 0, 0.55)'; ctx.lineWidth = Math.max(1.5, w * 0.006); ctx.setLineDash([w * 0.02, w * 0.014]);
    ctx.strokeRect(-tw / 2 + th * 0.12, -th / 2 + th * 0.1, tw - th * 0.24, th - th * 0.2);
    ctx.setLineDash([]);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#3a2300';
    ctx.font = `600 ${Math.round(th * 0.13)}px Georgia, 'Times New Roman', serif`; ctx.fillText('ATOMIC OASIS', 0, -th * 0.27);
    ctx.font = `900 ${Math.round(th * 0.3)}px Georgia, 'Times New Roman', serif`; ctx.fillText('GAME PASS', 0, 0, tw * 0.8);
    ctx.font = `italic 600 ${Math.round(th * 0.115)}px Georgia, 'Times New Roman', serif`; ctx.fillText('admit one robot · every day', 0, th * 0.28);
    return c;
  };
  const shopView = new ShopView(hud.root, (id, w, h) => (id === PASS.id ? passPicture(w, h) : id.startsWith('board:') ? panelPicture(id, w, h) : previewer.shot(id, color, w, h)));
  const wornNow = (type, sub) => (type === 'hat' ? HATS[look.hat]?.id === sub : type === 'paint' ? PAINTS[kit.paint] === sub : type === 'trail' ? TRAILS[kit.trail] === sub : type === 'jetpack' || type === 'jetlite' ? jetOn() === type : false);
  const shopItems = () => {
    const list = ITEMS.map((it) => {
      const [type, sub] = it.id.split(':'), owned = shop.has(it.id), lent = shop.lent(it.id), left = lent === 'trial' ? shop.trialLeft(it.id) : 0;
      return {
        ...it, owned, lent, cost: price(shop.cost(it.id) || it.price), worn: (owned || !!lent) && wornNow(type, sub), wearable: WEARABLE.includes(type),
        hint: it.id === 'fireworks' ? 'Yours: press V (or the button in the emotes) to light one.' : it.id === 'jetpack' ? 'Yours: jump, then press jump again in the air. With both jetpacks, the one that is on is chosen here.' : it.id === 'jetlite' ? `Yours: jump, then press jump again in the air — once every ${JET_LITE.every} seconds. With both jetpacks, the one that is on is chosen here.` : 'Yours for good: put it on and take it off as you please.',
        ...(lent === 'pass' && { fine: `Yours while you hold the ${PASS.name}. Buy it to keep it for good.` }),
        ...(lent === 'trial' && { fine: `A taste, on the house: yours for ${left > 3600_000 ? `${Math.ceil(left / 3600_000)} more hours` : `${Math.max(1, Math.ceil(left / 60_000))} more minutes`} — jump, then press jump again in the air. After that it is sold here, and it comes with the ${PASS.name}.` }),
      };
    });
    // the Game Pass, by the month (only while things are sold)
    if (shop.open) {
      const held = !!shop.pass && shop.hasPass, gift = held && shop.pass.gift;
      list.unshift({
        id: PASS.id, name: PASS.name, group: 'pass', rarity: 'legendary', owned: held, wearable: false,
        cost: `${price(shop.prices.pass || PASS.price)} a month`,
        act: held ? null : `Get the pass · ${price(shop.prices.pass || PASS.price)} a month`,
        manage: held && shop.pass.managed ? 'Look after it, or stop it' : null,
        blurb: held ? (gift ? `A gift of the fair: yours until ${new Date(shop.pass.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.` : 'It is yours. Thank you — truly.') : 'One pass, by the month, and the fair opens a little wider.',
        perks: PASS.perks, why: PASS.why, pitch: ['Every hat', 'Jetpack Lite', 'Four sizes', '16 more colours'],
        fine: held ? (gift ? 'When the gift ends, nothing is charged: the pass simply stops.' : 'Paid by the month on Stripe. Stop whenever you like: it lasts until the end of the month you paid for.') : 'Paid by the month on Stripe; stop whenever you like. What you bought before stays yours, pass or no pass.',
      });
    }
    // the panel over the board of each game, to the highest bidder (only while things are sold)
    if (shop.open) for (const [game, title] of Object.entries(GAME_NAMES)) {
      const id = `board:${game}`, view = shop.slots[id], least = shop.least(id), mine = !!view?.mine;
      list.push({
        id, name: title, group: 'sponsor', rarity: view ? 'epic' : 'rare', owned: mine, wearable: false,
        cost: mine ? 'Yours' : view ? `Beat ${price(view.bid || 0)}` : `From ${price(least)}`,
        act: mine ? null : `Bid · from ${price(least)}`,
        blurb: `Your name, a line under it, your logo and a link, on the panel over the scores of ${title}: where everybody who plays looks. ${view ? (mine ? 'It is yours until somebody bids more.' : `Its sponsor paid ${price(view.bid || 0)}: bid ${price(least)} or more and it is yours.`) : `Nobody has it yet: the first bid is ${price(least)}.`}`,
        hint: 'Yours: go to the board of the game and set up your panel.',
        fine: mine ? 'Yours: go to the board of the game to set up your panel. Outbid, you are refunded in full.' : 'An auction: you pay your bid once and hold the panel until somebody bids more — then you are refunded in full, automatically.',
      });
    }
    return list;
  };
  /** What is worn goes on the avatar, is remembered (by the account too, for who has one), and is told to the others. */
  function wear() {
    me.setPaint(kit.paint);
    store.set('mmf.hat', String(look.hat));
    store.set('mmf.kit', JSON.stringify({ paint: PAINTS[kit.paint], trail: TRAILS[kit.trail] }));
    presence?.setIdentity(name, color, packKit(kit));
    keepProfile();
  }
  // ---------- an account: not needed to play; it keeps what was bought, the days in a row and the look
  const account = new Account();
  const profileNow = () => ({ name, color, hat: HATS[look.hat]?.id || 'none', paint: PAINTS[kit.paint], trail: TRAILS[kit.trail], size: SIZES[size] });
  let keeping = 0;
  function keepProfile() { if (!account.name) return; clearTimeout(keeping); keeping = setTimeout(() => account.save(profileNow()), 1500); }
  /** The look kept by the account comes back on this browser (what is no longer theirs is left off: see refreshShop). */
  const applyProfile = (p) => {
    if (!p) return;
    if (p.name) { name = p.name; store.set('mmf.name', name); hud.setName(name); world.games.setMe(name); }
    if (Number.isInteger(p.color)) { color = p.color; me.setColor(color); store.set('mmf.color', String(color)); shopView.stale(); }
    look.hat = Math.max(0, HATS.findIndex((h) => h.id === p.hat));
    kit.paint = Math.max(0, PAINTS.indexOf(p.paint)); kit.trail = Math.max(0, TRAILS.indexOf(p.trail));
    if (p.size) { size = SIZES.indexOf(sizeOf(p.size)); store.set('mmf.size', SIZES[size]); }
  };
  const showAccount = () => hud.setAccount({ name: account.name, available: account.available, mail: account.mail, email: account.email });
  /** Signed in (or out): what is owned, the days in a row and the look are asked again. */
  const accountChanged = async () => {
    showAccount();
    await refreshShop();
    const v = await countVisit(name);
    who.days = v.days;
    showEmotes();
  };
  // the account, on its card (ui/AccountView.js): signing in, making one, a new password with the recovery code
  const accountAction = async (what) => {
    if (what === 'logout') { await account.logout(); await accountChanged(); hud.note('Signed out: this browser is a guest again.', 5000); return; }
    if (what === 'email') {
      // the address of the account: only ever used to mail a code when the password is forgotten
      const got = await hud.form('The e-mail of your account', 'It is only used to send you a code if you forget the password. Leave it empty to take it away. Your password is asked for, so that nobody changes it behind your back.',
        [{ key: 'email', label: 'E-mail', max: 120, hint: 'you@example.org' }, { key: 'password', label: 'Your password', type: 'password' }], 'Save');
      if (!got) return;
      const done = await account.setEmail(got.email, got.password);
      hud.note(done.error || (got.email ? 'Saved: a code can be sent there if you forget the password.' : 'Taken away: no e-mail is kept for this account.'), 6000);
      showAccount();
      return;
    }
    hud.closeAll();
    input.exitLock();
    input.keys.clear(); // (nothing stays pressed behind the card)
    accountView.open({ mode: what === 'create' ? 'create' : what === 'reset' ? 'reset' : 'login', name: what === 'create' && !/^Visitor \d+$/.test(name) ? name : '', mail: account.mail });
  };
  accountView
    .on('submit', async (mode, d) => {
      if (mode === 'create') {
        const made = await account.create(d.name, d.password, profileNow(), d.email);
        if (made.error) return { error: made.error };
        await accountChanged();
        audio.play('victory');
        return { recovery: made.recovery, name: account.name };
      }
      const done = mode === 'reset' ? await account.reset(d.name, d.code, d.password) : await account.login(d.name, d.password);
      if (done.error) return { error: done.error };
      applyProfile(account.profile);
      await accountChanged();
      audio.play('victory');
      hud.note(`Welcome back, ${account.name}!`, 5000);
      return {};
    })
    .on('mailcode', (who) => account.mailCode(who))
    .on('close', () => { document.getElementById('view')?.focus({ preventScroll: true }); });
  Object.assign(app, { account, accountAction, accountView, payView, legalView });
  const equip = (id, on) => {
    const [type, sub] = id.split(':');
    if (type === 'jetpack' || type === 'jetlite') {
      // (the jetpack that is on: this one — or, taken off, none: the other one is put on from its own card)
      store.set('mmf.jet', on ? type : 'none');
      fitJet();
      return;
    }
    if (type === 'hat') look.hat = on ? Math.max(0, HATS.findIndex((h) => h.id === sub)) : 0;
    else if (type === 'paint') kit.paint = on ? Math.max(0, PAINTS.indexOf(sub)) : 0;
    else if (type === 'trail') kit.trail = on ? Math.max(0, TRAILS.indexOf(sub)) : 0;
    wear();
  };
  const openShop = (pick) => {
    if (shopView.isOpen || fair.session) return;
    hud.closeAll();
    input.exitLock();
    input.keys.clear(); // (nothing stays pressed behind the shop)
    if (pick) shopView.picked = pick;
    shopView.open({ items: shopItems(), mode: shop.mode, note: account.name ? `It goes to your account, ${account.name}.` : 'It stays in this browser: an account (Settings) keeps it everywhere.' });
    audio.play('pick');
  };
  shopView
    .on('buy', async (id) => {
      if (id.startsWith('board:')) { shopView.close(); bidFor(id); return; } // (a place to sponsor: how much?)
      hud.note('Opening the payment page…', 8000);
      const wrong = await shop.buy(id);
      if (wrong) hud.note(wrong, 7000);
    })
    .on('equip', (id) => { const [type, sub] = id.split(':'); if (!shop.owns(id)) return; equip(id, !wornNow(type, sub)); shopView.refresh(shopItems()); audio.play('pick'); })
    .on('manage', async () => { hud.note('Opening the page of your subscription…', 8000); const wrong = await shop.portal(); if (wrong) hud.note(wrong, 7000); })
    .on('close', () => { document.getElementById('view')?.focus({ preventScroll: true }); });
  // a firework (for who has the box): up it goes, and those around see it too
  const FIREWORK = 31, BOUQUET = 30; // (the numbers they travel under, among the emotes: a firework lit, a bouquet held out)
  let fireworkAt = -10;
  const lightFirework = () => {
    if (state.mode !== 'walk' || player.dead || fair.session) return;
    if (!shop.owns('fireworks')) { hud.note('Fireworks are sold in the item shop (O).', 4000); return; }
    if (state.time - fireworkAt < 2.5) return;
    fireworkAt = state.time;
    world.sparks.firework(player.pos.x, player.pos.y, player.pos.z);
    presence?.sendEmote(FIREWORK);
  };
  Object.assign(app, { shop, shopView, openShop, refreshShop, kit, equip, lightFirework, showEmotes });
  const toggleCamera = () => { if (state.mode === 'walk') { if (mayFly()) setMode('free'); } else if (state.mode === 'free') setMode('walk'); };
  const savedQuality = store.get('mmf.quality');
  const qualityChoice = params.get('q') && TIERS[params.get('q')] ? params.get('q') : savedQuality && TIERS[savedQuality] ? savedQuality : 'auto';
  const showQuality = () => hud.setQuality(qualityChoice, engine.tierId, engine.scale, engine.detail, engine.tier.phone);
  showQuality();
  engine.on('detail', showQuality);
  hud.setName(name);
  hud.setHat(look.hat);
  // where the shop stands. Back from the payment page, what was bought may take a few seconds to arrive
  // (the server only believes what Stripe tells it).
  const arrived = (paid) => {
    hud.note('Thank you! It will be here in a moment…', 6000);
    let tries = 0;
    const again = async () => {
      await refreshShop();
      if (shop.owned.has(paid) || shop.slots[paid]?.mine || (paid === PASS.id && shop.pass)) {
        audio.play('victory');
        const plate = paid.startsWith('plaque:') && shop.slots[paid]?.mine;
        hud.note(paid === PASS.id ? `The ${PASS.name} is yours. Thank you — it keeps the lights on! Pick a size and a colour in the settings.` : plate ? 'The plate is theirs, for good. Thank you!' : shop.slots[paid]?.mine ? 'It is yours. Go to it to set it up: your name, your link, your logo.' : 'It is yours. Thank you!', 9000);
        // (what goes on a plaque is asked for right away — the plate itself is a swim and a climb away —, once they are in the world)
        if (plate && !shop.slots[paid].draft && shop.slots[paid].state !== 'live') { const ask = () => { if (state.mode === 'walk') fillPlace(paid); else setTimeout(ask, 900); }; ask(); }
        // (what can be worn is put on at once)
        if (itemOf(paid) && WEARABLE.includes(paid.split(':')[0])) { equip(paid, true); shopView.refresh(shopItems()); }
      }
      else if (++tries < 8) setTimeout(again, 2500);
    };
    again();
  };
  refreshShop().then(() => {
    const paid = params.get('paid');
    if (paid === null) return;
    params.delete('paid');
    history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : '') + location.hash);
    if (!paid) { hud.note('Nothing was paid.', 4000); return; }
    arrived(paid);
  });
  // paying without leaving the game, where the server has Stripe's publishable key: their form on a card
  // (ui/PayView.js). When it cannot be shown, the shop sends the visitor to Stripe's page as before.
  shop.onEmbed = (item, secret) => {
    hud.closeAll();
    input.exitLock();
    input.keys.clear();
    return payView.open(shop.pk, secret, { title: 'Payment', test: shop.mode === 'test', paid: () => arrived(item) });
  };
  account.load().then(showAccount);
  hud.setSettings(settings);
  hud.setVolume(volume);
  showEmotes();
  hud.setPresence('offline', 1);
  // who may fly the camera about (everyone, or the administrator alone: see app/config.js)
  const mayFly = () => FEATURES.freeCamera === 'everyone' || who.admin;
  hud.setFreeCamera(mayFly());
  // the administrator: `/admin <key>` in the chat (or #admin=<key> in the address) — the key is checked by the server
  const adminKey = async (key, loud = false) => {
    key = String(key || '').trim();
    let why = '';
    if (!key) { store.del('mmf.admin'); who.admin = false; }
    else {
      const answer = await checkAdminKey(key), ok = answer.ok;
      // (why not, when it is not the key that is wrong)
      if (!ok) { const api = await hasApi(); why = !api ? 'There is no server behind this page: nobody can be its administrator here.' : api.admin === false ? 'This server has no administrator key: set the secret ADMIN_KEY, then try again.' : answer.dead ? '' : 'The server could not be reached: try again in a moment.'; }
      who.admin = ok;
      who.owner = ok && answer.owner; // (the owner's key, or one handed to an administrator who was named)
      who.key = ok ? key : '';
      // (a key the server refuses is forgotten; one it could not be asked about is kept for the next visit)
      if (ok) store.set('mmf.admin', key); else if (answer.dead) store.del('mmf.admin');
    }
    if (!who.admin) { who.key = ''; who.owner = false; }
    presence?.setAdminKey(who.key);
    hud.setAdmin(who.admin);
    pending = who.admin ? (await shop.all(who.key)) || {} : {};
    refreshShop();
    const said = who.admin ? `Administrator: on.${Object.values(pending).some((s) => s.draft) ? ' Sponsors await your approval: go and see their panels.' : ''}` : key ? why || 'That key was not recognised.' : 'Administrator: off.';
    hud.addChat('✦', 5, said, true);
    if (loud) hud.note(said, 7000);
    hud.setFreeCamera(mayFly());
    showEmotes();
    app.onAdmin?.(who.admin ? key : '');
  };
  // (the key in the address — #admin=… — is read when the page opens, and again whenever it is typed after
  // the address of a page that is already open: that does not load the page again)
  const keyFromAddress = () => {
    const found = /[#&]admin=([^&]*)/.exec(location.hash);
    if (!found) return false;
    let key = found[1];
    try { key = decodeURIComponent(key); } catch { /* a key with a % of its own: taken as it was typed */ }
    history.replaceState(null, '', location.pathname + location.search);
    adminKey(key, true);
    return true;
  };
  // The administrator can look at the game as a visitor sees it — no free view, no approvals, no key sent to
  // the room — and come back (the pill at the top left). It lasts until the tab is closed.
  const visitorView = (on) => {
    if (on) {
      const key = who.key || store.get('mmf.admin') || '';
      if (!key) return;
      who.masked = key;
      try { sessionStorage.setItem('mmf.visitor', '1'); } catch { /* private mode */ }
      if (state.mode === 'free') toggleCamera();
      who.admin = false; who.owner = false; who.key = '';
      presence?.setAdminKey('');
      hud.setAdmin(false);
      pending = {};
      refreshShop();
      hud.setFreeCamera(mayFly());
      showEmotes();
      app.onAdmin?.('');
      hud.setVisitorView(true);
      hud.note('You now see the game as a visitor does. The yellow pill, top left, brings the administrator back.', 7000);
    } else {
      const key = who.masked || store.get('mmf.admin') || '';
      who.masked = '';
      try { sessionStorage.removeItem('mmf.visitor'); } catch { /* private mode */ }
      hud.setVisitorView(false);
      adminKey(key, true);
    }
  };
  let asVisitor = false;
  try { asVisitor = sessionStorage.getItem('mmf.visitor') === '1'; } catch { /* private mode */ }
  if (!keyFromAddress() && store.get('mmf.admin')) {
    if (asVisitor) { who.masked = store.get('mmf.admin'); hud.setVisitorView(true); } else adminKey(store.get('mmf.admin'));
  }
  addEventListener('hashchange', keyFromAddress);
  countVisit(name).then((v) => { who.days = v.days; showEmotes(); if (v.days > 1) setTimeout(() => hud.note(`Day ${v.days} in a row — welcome back!`, 5000), 9000); });
  hud
    .on('camera', toggleCamera)
    .on('emote', emote)
    .on('interact', () => { if (fair.session) { if (!fair.session.over || fair.kind === 'arcade') { endGame(); hud.note('Game left.'); } } else interact.press(0); })
    .on('interact2', () => interact.press(1))
    .on('say', say)
    .on('roster', () => { showRoster(); refreshRoster(); })
    .on('visitorview', (on) => visitorView(on))
    .on('kick', (id) => { presence?.kick(id); setTimeout(refreshRoster, 500); })
    .on('ban', (id, hours) => { presence?.ban(id, hours); setTimeout(refreshRoster, 800); })
    .on('unban', async ({ kind, key }) => { await callApi(`api/bans?${kind}=${encodeURIComponent(key)}`, { method: 'DELETE', key: who.key }); refreshRoster(); })
    .on('promote', (id) => { presence?.promote(id); })
    .on('goto', (to) => goTo(to))
    .on('demote', async (id) => { await callApi(`api/admins?id=${encodeURIComponent(id)}`, { method: 'DELETE', key: who.key }); presence?.demote(id); refreshRoster(); })
    .on('shop', () => openShop())
    .on('account', accountAction)
    .on('legal', (which) => { hud.closeAll(); input.exitLock(); input.keys.clear(); legalView.open(which); })
    .on('firework', lightFirework)
    .on('drop', () => { look.bouquet = false; look.kinds = undefined; })
    .on('volume', (key, value) => {
      volume[key] = value;
      store.set(`mmf.${key}`, String(value));
      audio.setLevels(volume);
      audio.unlock();
    })
    .on('setting', (key, on) => {
      settings[key] = on;
      store.set(`mmf.${key}`, on ? '1' : '0');
      player.autoRun = settings.run;
      rig.follow = settings.follow;
    })
    .on('color', (i) => { if (i >= FREE_COLORS && !shop.hasPass) return; color = i; me.setColor(i); store.set('mmf.color', String(color)); presence?.setIdentity(name, color); shopView.stale(); keepProfile(); })
    .on('size', (i) => { if (i && !shop.hasPass) return; size = i; store.set('mmf.size', SIZES[size]); keepProfile(); })
    .on('sit', () => sitDown())
    .on('gift', (to) => giftTo(to))
    .on('name', (n) => { if (!n) return; name = n; presence?.setIdentity(name, color); store.set('mmf.name', name); world.games.setMe(name); keepProfile(); })
    .on('quality', (q) => {
      // a tier changes shaders, textures and shadow maps: simplest and safest is a clean restart at the same spot
      if (q === 'auto') store.del('mmf.quality'); else store.set('mmf.quality', q);
      store.set('mmf.resume', JSON.stringify({ x: player.pos.x, z: player.pos.z, yaw: rig.yaw }), true);
      const url = new URL(location.href);
      url.searchParams.delete('q');
      location.replace(url.href);
    });
  input.on('camera', toggleCamera);
  input.on('perf', () => hud.toggleStats());
  input.on('emote', () => hud.toggleEmotes());
  input.on('shop', () => { if (state.mode === 'walk') openShop(); });
  input.on('firework', lightFirework);
  input.on('sit', () => sitDown());
  input.on('drop', () => { if (look.bouquet) { look.bouquet = false; look.kinds = undefined; } });
  input.on('chat', () => { if (state.mode === 'walk' || state.mode === 'free') hud.toggleChat(true, talking ? talking.brain.ask || `Say something to ${talking.name}…` : undefined); });
  input.on('respawn', () => { if (state.mode === 'walk') { endGame(); spawn(); hud.note('Back to the mill'); } });
  input.on('menu', () => { accountView.close(); payView.close(); legalView.close(); if (fair.session && (!fair.session.over || fair.kind === 'arcade')) { endGame(); hud.note('Game left.'); } hud.panel.classList.remove('on'); hud.emotes.classList.remove('on'); hud.toggleBigMap(false); hud.toggleChat(false); hud.closeChoice(); hud.closeRoster(); });
  input.on('map', () => { if (state.mode === 'walk' || state.mode === 'free') hud.toggleBigMap(); });
  hud.setMap(data.meta.map, PLACES);
  hud.setVillages(world.sky.villages, data.meta.size, villageLabel);
  if (params.has('stats')) hud.setStatsVisible(true);

  // ---------- benchmark
  const bench = BENCH ? new Benchmark(engine, world, { frames: BENCH }) : null;
  if (bench) { app.benchmark = bench; state.mode = 'bench'; me.root.visible = false; }

  // ---------- frame loop
  let gpuName = '';
  try {
    const gl = engine.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) gpuName = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '').replace(/^ANGLE \((.*)\)$/, '$1').slice(0, 64);
  } catch { /* hidden by the browser */ }
  let slow = 0, zoneTimer = 0, lastScale = engine.scale;
  const sound = { listener: { x: 0, y: 0, z: 0, speed: 0, grounded: true, swimming: false, wading: false, riding: false, dead: false, cave: false, surface: 'grass', climb: null, game: null }, surf: new Float32Array(8), grounded: true, fall: 0, jet: 0 };
  app.sound = sound;
  const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n));

  engine.start((dt) => {
    input.update();
    state.time += dt;
    const mode = state.mode;
    if (mode === 'intro') {
      const a = INTRO.angle + Math.sin(state.time * 0.1) * INTRO.swing;
      const x = INTRO.x + Math.cos(a) * INTRO.radius, z = INTRO.z + Math.sin(a) * INTRO.radius;
      camera.position.set(x, Math.max(floorAt(INTRO.x, INTRO.z) + INTRO.height, floorAt(x, z) + 8), z);
      camera.lookAt(INTRO.x, floorAt(INTRO.x, INTRO.z) + INTRO.lookHeight, INTRO.z);
      player.update(dt, rig.heading, false);
    } else if (mode === 'bench') {
      if (!bench.update(dt, camera)) {
        app.bench = bench.result;
        hud.setStatsVisible(true);
        hud.statsEl.textContent = `Benchmark done\n${bench.report()}`;
        state.mode = 'done';
      } else if (app.frames % 10 === 0) hud.statsEl.textContent = `Benchmark running… ${Math.round(bench.progress * 100)} %`;
    } else if (mode === 'free') {
      free.update(dt);
      player.update(dt, rig.heading, false);
    } else if (mode === 'walk' && fair.session) {
      fairStep(dt);
    } else if (mode === 'walk') {
      for (let i = 0; i < 10; i++) if (input.pressed(`Digit${(i + 1) % 10}`)) emote(hud.quickEmote(i));
      if (input.pressed('KeyE')) interact.press(0);
      if (input.pressed('KeyL')) interact.press(1);
      player.update(dt, rig.heading, true);
      rig.update(dt, player.pos, player);
    }
    if (mode === 'walk' && state.blend) {
      const b = state.blend;
      b.t += dt / b.duration;
      if (b.t >= 1) state.blend = null;
      else {
        const k = b.t * b.t * (3 - 2 * b.t);
        _p.copy(camera.position); _q.copy(camera.quaternion);
        camera.position.copy(b.pos).lerp(_p, k);
        camera.quaternion.copy(b.quat).slerp(_q, k);
      }
    }
    {
      // the big red button: the fuse, then the show — the screen whitens, the camera trembles when the blast arrives
      if (bomb.fuse > 0 && (bomb.fuse -= dt) <= 0) blast.fire(0);
      const fx = blast.update(dt, camera);
      if (fx.boom) audio.play('boom');
      hud.setFlash(fx.flash);
      if (fx.shake > 0.003 && !fair.session) { // (not while a game is being played: that would be unfair)
        camera.position.x += (Math.random() - 0.5) * fx.shake;
        camera.position.y += (Math.random() - 0.5) * fx.shake * 0.7;
        camera.position.z += (Math.random() - 0.5) * fx.shake;
      }
      bomb.since += dt;
      if (button.pressed > 0 || bomb.since > 0.5) { button.update(button.pressed > 0 ? dt : 0, blastLeft() <= 0); bomb.since = 0; }
    }
    camera.updateMatrixWorld();
    interact.update(mode === 'walk' && !fair.session);
    if (fair.session && mode === 'walk') hud.setPrompt(0, fair.kind === 'arcade' ? 'Walk away' : fair.session.over ? null : fair.kind === 'race' ? 'Give up the race' : 'Leave the game');
    // the name of the characters one can talk to floats over them; walking away ends the conversation
    for (const n of npcs) {
      const d2 = (n.x - player.pos.x) ** 2 + (n.z - player.pos.z) ** 2;
      if (talking === n && d2 > (n.reach + 2.5) ** 2) { talking = null; hud.toggleChat(false); }
      let on = d2 < 30 * 30;
      if (on) { _p.set(n.x, n.y, n.z).project(camera); on = _p.z > -1 && _p.z < 1 && Math.abs(_p.x) < 1.1 && Math.abs(_p.y) < 1.1; }
      if (on) n.tag.style.transform = `translate(${((_p.x * 0.5 + 0.5) * engine.width).toFixed(1)}px, ${((-_p.y * 0.5 + 0.5) * engine.height).toFixed(1)}px) translate(-50%, -100%)`;
      if (on !== n.shown) { n.shown = on; n.tag.style.display = on ? '' : 'none'; }
    }
    rank.update(dt, camera);
    me.setAmbient(player.cave ? player.cave.light(player.pos.x, player.pos.z) : 1); // dim in the caves
    {
      // cheats wear off; what the avatar wears follows what the player does
      for (const k in timers) if ((timers[k] -= dt) <= 0) delete timers[k];
      player.gravity = timers.lowg ? 0.22 : 1;
      player.boost = timers.haste ? 2.2 : 1;
      player.hop = timers.hops ? 2 : 1;
      player.grip = timers.slick ? 0.09 : 1;
      player.cheat = !!(timers.lowg || timers.haste || timers.hops || timers.slick || timers.shot);
      // (the size: small for a flight on the stage of the plaza; a secret word for a moment; or the choice of who
      // holds the pass — and in the race, everybody's)
      const racing = !!fair.session && fair.kind === 'race';
      look.size = racing ? 0 : fair.session && fair.kind === 'wing' ? SIZE.flyer : timers.mini ? SIZE.mini : timers.maxi ? SIZE.maxi : shop.hasPass ? size : 0;
      look.disguise = racing ? 0 : disguise;
      me.size = SIZE_SCALE[look.size];
      if (player.jetWait) {
        // (the light jetpack was asked for too soon: how long it still needs)
        if (mode === 'walk' && !fair.session && state.time - (app.toldWait || -99) > 1.5) { app.toldWait = state.time; hud.note(`The Jetpack Lite is getting its breath back: ${Math.ceil(player.jetWait)} s.`, 2200); audio.play('miss', { volume: 0.4 }); }
        player.jetWait = 0;
      }
      if (player.noJet) {
        player.noJet = false;
        // (a jetpack was asked for and there is none: the free day is over — where to get one)
        if (jetOn() === null && (shop.owns('jetpack') || shop.owns('jetlite')) && mode === 'walk' && !fair.session && !player.cave && state.time - (app.toldJet || -99) > 8) {
          // (they have one, and took it off)
          app.toldJet = state.time;
          hud.note('Your jetpack is off. Put it back on in the item shop (O).', 5000);
        } else if (shop.open && !shop.owns('jetpack') && !shop.owns('jetlite') && mode === 'walk' && !fair.session && state.time - (app.toldJet || -99) > 8) {
          app.toldJet = state.time;
          hud.note(`Your free day with the jetpack is over. The Jetpack Lite is ${price(shop.cost('jetlite'))} in the item shop — and it comes with the ${PASS.name}.`, 7000);
        }
      }
      const fov = fair.fov ?? (timers.wide ? 104 : engine.width < engine.height ? 68 : 55);
      if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
      if (timers.strobe) me.setColor(Math.floor(state.time * 6) % 16); else if (me.colorIndex !== color) me.setColor(color);
      // the trail of the avatar, if it has one; the fireworks; the bang of those that burst close by
      const sparks = world.sparks;
      if (kit.trail && mode === 'walk' && !player.swimming && !player.dead) sparks.trail(kit.trail, dt, player.pos.x, player.pos.y, player.pos.z, Math.hypot(player.vel.x, player.vel.z));
      const rockets = sparks.rockets.length;
      sparks.update(dt, camera, engine.height);
      if (rockets > (sparks._heard || 0)) audio.play('rocket', { volume: 0.7 });
      sparks._heard = sparks.rockets.length;
      if (sparks.burst) { const d = Math.hypot(sparks.burst.x - camera.position.x, sparks.burst.z - camera.position.z); if (d < 260) audio.play('bang', { volume: Math.max(0.12, 1 - d / 260) }); sparks.burst = null; }
      look.dome = !!timers.dome;
      look.jet = player.jet > 0;
      look.quad = player.riding;
      if (player.swimming && look.bouquet) { look.bouquet = false; look.kinds = undefined; hud.note('The bouquet floats away…'); }
      me.setLook(look);
      hud.setHolding(look.bouquet);
    }
    {
      // rings on the water around the swimmer, a splash when dropping in
      const p = player.pos, level = data.waterAt(p.x, p.z);
      if (player.splashed) {
        if (level > -500) world.ripples.splash(engine.time, p.x, level, p.z, player.splashed);
        audio.play(player.dived ? 'dive' : 'splash', { volume: Math.min(1, 0.4 + player.splashed / 12) });
        player.splashed = 0; player.dived = false;
      }
      if ((player.swimming || player.wading) && level > -500) world.ripples.trail(0, engine.time, dt, p.x, level, p.z, player.speed, player.swimming);
      // one's own speech bubble
      const tag = hud.selfTag, saying = tag.classList.contains('saying') && mode === 'walk';
      if (saying) {
        _p.set(p.x, p.y + 2.0, p.z).project(camera);
        const on = _p.z > -1 && _p.z < 1;
        tag.style.display = on ? '' : 'none';
        if (on) tag.style.transform = `translate(${((_p.x * 0.5 + 0.5) * engine.width).toFixed(1)}px, ${((-_p.y * 0.5 + 0.5) * engine.height).toFixed(1)}px) translate(-50%, -100%)`;
      } else if (tag.style.display !== 'none') tag.style.display = 'none';
    }

    {
      // what is heard: where the player is, what they walk on, what they are doing
      const p = player.pos, terrain = data.heightAt(p.x, p.z), run = world.games.run;
      const ear = sound.listener;
      ear.x = p.x; ear.y = p.y; ear.z = p.z; ear.speed = player.speed;
      ear.grounded = player.grounded; ear.swimming = player.swimming; ear.wading = !!player.wading; ear.riding = player.riding; ear.dead = !!player.dead;
      ear.cave = !!player.cave;
      if (app.frames % 6 === 0) {
        if (player.wading) ear.surface = 'water';
        else if (player.cave) ear.surface = 'stone';
        else if (p.y - terrain > 0.12) ear.surface = p.x > -25 && p.y < 12 ? 'wood' : world.games.tower && Math.hypot(p.x - world.games.tower.x, p.z - world.games.tower.z) < 7 ? 'wood' : 'stone'; // a deck, or steps and stones
        else { data.surfaceAt(p.x, p.z, sound.surf); const w = sound.surf; ear.surface = w[5] > 0.45 ? 'sand' : w[4] + w[6] > 0.5 ? 'stone' : 'grass'; }
      }
      ear.climb = run.state === 'running' ? Math.min(1, Math.max(0, (p.y - CLIMB.y) / CLIMB.height)) : null;
      ear.game = fair.session ? fair.kind : null;
      // leaving the ground, coming back to it, lighting the jetpack
      if (mode === 'walk' && !player.dead && !player.seat) {
        if (sound.grounded && !player.grounded && !player.swimming && player.vel.y > 2) audio.play('jump');
        else if (!sound.grounded && player.grounded && sound.fall < -4) audio.play('land', { volume: Math.min(1, -sound.fall / 14) });
        if (player.jet > 0 && !(sound.jet > 0)) audio.play('jet');
      }
      sound.grounded = player.grounded || player.swimming; sound.fall = player.vel.y; sound.jet = player.jet;
      audio.update(dt, ear);
    }
    if (presence) {
      presence.setLocal(player.pos.x, player.pos.y, player.pos.z, player.yaw, player.anim, packLook({ free: mode === 'free', ...look }));
      presence.update(dt);
      avatars.update(dt, camera, engine.width, engine.height);
    }
    world.update(dt, camera);
    const t0 = world.profile ? performance.now() : 0;
    if (!arcade.isOpen || app.frames % 4 === 0) engine.renderer.render(scene, camera); // (behind the screen of the arcade, the world is drawn one frame in four)
    if (world.profile) { world.profile.mainPass = (world.profile.mainPass || 0) + performance.now() - t0; world.profile.frames = (world.profile.frames || 0) + 1; }

    // interface, a few times per second
    slow += dt; zoneTimer += dt;
    if (zoneTimer > 0.4 && (mode === 'walk' || mode === 'free')) {
      zoneTimer = 0;
      const p = mode === 'walk' ? player.pos : camera.position;
      let best = null, bestD = 1;
      for (const z of PLACES) { const d = Math.hypot(p.x - z.x, p.z - z.z) / z.r; if (d < bestD) { bestD = d; best = z; } }
      const village = sky.villageAt(p.x, p.z);
      if (village) hud.setZone(village.name); else if (best) hud.setZone(best.name);
    }
    if (mode === 'walk' || mode === 'free') {
      const p = mode === 'walk' ? player.pos : camera.position;
      const heading = mode === 'walk' ? rig.yaw : free.yaw, others = avatars ? avatars.everyone : [];
      if (hud.bigMapOpen) hud.drawBigMap(p.x, p.z, heading, others);
      else if (app.frames % 3 === 0) hud.drawMap(p.x, p.z, heading, others);
    }
    if (slow > 0.5) {
      slow = 0;
      const pf = engine.perf;
      if (hud.statsOn && state.mode !== 'done') {
        hud.setStats(
          `${pf.fps.toFixed(0)} fps · ${pf.ms.toFixed(1)} ms (script ${pf.cpuMs.toFixed(1)})\n` +
          `Draw calls ${pf.calls} · Triangles ${fmt(pf.triangles)}\n` +
          `${Math.round(engine.width * engine.pixelRatio)}×${Math.round(engine.height * engine.pixelRatio)} · resolution ${Math.round(engine.scale * 100)} % · detail ${Math.round(engine.detail * 100)} %\n` +
          `${TIERS[engine.tierId].label}${engine.tier.phone ? ' (phone)' : ''}${gpuName ? `\n${gpuName}` : ''}`,
        );
      }
      if (engine.scale !== lastScale) { lastScale = engine.scale; showQuality(); }
    }
    app.frames++;
    app.ready = true;
  });

  // ---------- welcome
  if (SHOT) {
    engine.adaptive = false; // screenshots: always at full resolution and detail
    const cam = (params.get('cam') || '-60,46,-52,126,-18').split(',').map(Number);
    app.setCam(...cam);
    input.enabled = true;
    hud.splash.classList.add('done');
    hud.hud.classList.add('on');
    if (params.has('walk')) setMode('walk');
    if (params.has('net')) startPresence();
    return;
  }
  if (bench) {
    hud.splash.classList.add('done');
    hud.hud.classList.add('on');
    hud.setStatsVisible(true);
    return;
  }
  hud.setProgress(1);
  const resume = (() => { try { return JSON.parse(store.get('mmf.resume', true)); } catch { return null; } })();
  store.del('mmf.resume', true);
  if (resume && Number.isFinite(resume.x) && Number.isFinite(resume.z)) {
    // back from a quality change: straight into the world, where we were
    player.teleport(resume.x, resume.z, (resume.yaw || 0) + Math.PI);
    rig.snap(player.pos, resume.yaw || 0);
    hud.splash.classList.add('done');
    hud.hud.classList.add('on');
  } else {
    const who = await hud.welcome({ name, color, touch, size: shopKnown && shop.hasPass ? size : 0, pass: shopKnown && shop.hasPass });
    name = who.name; color = who.color >= FREE_COLORS && !shop.hasPass ? who.color - FREE_COLORS : who.color;
    if (shop.hasPass) { size = who.size || 0; store.set('mmf.size', SIZES[size]); }
    world.games.setMe(name);
    me.setColor(color);
    hud.setName(name);
    store.set('mmf.name', name); store.set('mmf.color', String(color));
  }
  // an address may lead straight to a sky village: ?village=its-name (or its number)
  const invited = params.get('village') ? sky.find(params.get('village')) : null;
  if (invited) travel(invited, `Welcome to ${invited.name}`);
  input.enabled = true;
  startBlend(2.4);
  rig._first = true;
  state.mode = 'walk';
  hud.setCameraMode(false);
  startPresence();
  canvas.focus();
  setTimeout(() => hud.note(touch ? 'Drag on the left to walk, on the right to look around' : 'Drag the mouse to look around · double-click to capture it', 5200), 2600);
}

boot().catch((err) => {
  console.error(err);
  app.error = String(err?.stack || err);
  hud.fail(`The world could not be loaded. ${err?.message || ''}`);
});
