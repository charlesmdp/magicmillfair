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
import { nameOk } from '../server/decency.js';
import { BOARDS as GAME_NAMES } from '../server/catalog.js';
import { rankSponsors, dollars, siteWords } from './app/thanks.js';
import { oasisPicture, OASIS_ROBOT } from './ui/OasisPicture.js';
import { drawSponsor } from './world/zones/games/Boards.js';
import { ShopView } from './ui/ShopView.js';
import { Arcade } from './ui/Arcade.js';
import { AccountView } from './ui/AccountView.js';
import { PayView } from './ui/PayView.js';
import { LegalView } from './ui/LegalView.js';
import { HelpView } from './ui/HelpView.js';
import { SponsorsView, Photographer } from './ui/SponsorsView.js';
import { deviceId } from './net/device.js';
import { Previewer } from './ui/Preview.js';
import { Sparks } from './world/effects/Sparks.js';
import { Account } from './net/Account.js';
import { Shop, price, logoData, iconFile, loadImage, ownDraft } from './net/Shop.js';
import { PlayerController, JET, JET_LITE } from './player/PlayerController.js';
import { CameraRig } from './player/CameraRig.js';
import { Interact } from './player/Interact.js';
import { RankEmotes, rankPicture } from './player/RankEmotes.js';
import { Hud, VERSION } from './ui/Hud.js';
import { Presence, cleanChat, cleanRoom, roomLabel } from './net/Presence.js';
import { Npc } from './npc/Npc.js';
import { Scores, scoreRoom } from './net/Scores.js';
import { keysHelp } from './extras/help.js'; // (the keys of a game, shown again whenever asked: the lab's, used as it is)
import { countVisit } from './net/Visits.js';
import { callApi, checkAdminKey, hasApi, noApi, sharedNow } from './net/api.js';
import { formatTime } from './world/zones/games/course.js';
import { formatScore as golfScore } from './world/zones/games/golf/score.js';
import { buildGameSignposts } from './world/zones/games/Signposts.js';
import { RemoteAvatars } from './net/RemoteAvatars.js';
import { Benchmark } from './app/Benchmark.js';
import { SPAWN, ZONES, CLIMB, RACE, WING, TRACK, PIER } from './world/layout/layout.js';
import { VILLAGE_PERKS, VILLAGE_PITCH, money } from './world/layout/sponsors.js';
import { FEATURES, SKY_STAGES, skyAsked } from './app/config.js';
import { Updates } from './app/Updates.js';
import { PASS_LINES, ACCOUNT_LINES, ACCOUNT_PERKS, passDue, accountDue } from './app/pitches.js';
import { Soundscape } from './audio/Soundscape.js';
import { oneTab } from './app/OneTab.js';
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
// (when this browser first came here: the cards of the Game Pass are counted from then — app/pitches.js)
const FIRST = 'mmf.first', PASS_SEEN = 'mmf.passcards', ACCOUNT_SEEN = 'mmf.accountcards';
if (!(Number(store.get(FIRST)) > 0)) store.set(FIRST, String(Date.now()));

const canvas = document.getElementById('view');
const ui = document.getElementById('ui');
const touch = isMobile() || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
const app = { ready: false, frames: 0, THREE, version: VERSION };
// The game keeps itself to itself: nothing of it is left on the page for a console to pick up — except while
// it is being worked on (a development page), on the lab's pages (their build says __LAB__) and in the builds
// the tools make for their checks (__TEST__). A speed bump, not a wall: the browser belongs to its visitor.
if (import.meta.env.DEV || typeof __LAB__ !== 'undefined' || typeof __TEST__ !== 'undefined') window.__mmf = app;

const input = new Input(canvas);
input.enabled = false;
const hud = new Hud(ui, { input, isTouch: touch });
const arcade = new Arcade(ui); // (the screen of the cabinet of the pier: shown while one plays)
const accountView = new AccountView(ui); // (the card of the account: signing in, making one)
const payView = new PayView(ui); // (the payment form, when it can be shown inside the game)
const legalView = new LegalView(ui, { device: deviceId }); // (the terms of use and the privacy policy, opened from the settings)
const helpView = new HelpView(ui); // (help and support: the form of Orka, opened from the settings)
const sponsorsView = new SponsorsView(ui); // (the window of the Trading Post: the games and their sponsors)
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
  // The sky villages: hidden, announced ("soon": their gate, closed) or open — the owner's switch `sky` (what
  // the server says; hidden where there is no server). The administrator may look ahead with ?sky=1 — and so
  // may a development page, a page of the lab and the tools. Asked while the world loads; built with it.
  // (A room a player made — server/urooms.js — has no sky village over it: those are the common rooms'. Such a
  // room is entered by its link, so the page that opens it knows from the start.)
  const ownAsked = /^own-[a-z0-9]{8}$/.test(cleanRoom(params.get('room') || ''));
  world.skyStage = (async () => {
    const served = await hasApi(), kept = store.get('mmf.admin');
    if (ownAsked && served?.release?.userRooms === true) return 'hidden';
    const ahead = skyAsked() && (import.meta.env.DEV || typeof __LAB__ !== 'undefined' || typeof __TEST__ !== 'undefined' || (!!kept && (await checkAdminKey(kept)).ok));
    return ahead ? 'open' : SKY_STAGES.includes(served?.release?.sky) ? served.release.sky : 'hidden';
  })();
  // (the places that have a name — the Sky Gate is added once the world is built, when it is there)
  const PLACES = ZONES.filter((z) => z.id !== 'skygate');
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
  // (a name was chosen on an earlier visit: no card again — ?welcome shows it all the same. The tools load the page
  // again and again and expect the card each time: on their pages it is only skipped when the address says so, ?back)
  const returning = !!(store.get('mmf.name') || '').trim() && !params.has('welcome')
    && (!(import.meta.env.DEV || typeof __LAB__ !== 'undefined' || typeof __TEST__ !== 'undefined') || params.has('back'));
  let name = (store.get('mmf.name') || '').trim() || `Visitor ${10 + Math.floor(Math.random() * 90)}`;
  if (!nameOk(name)) name = `Visitor ${10 + Math.floor(Math.random() * 90)}`; // (a name that may no longer be worn: server/decency.js)
  const me = factory.create(color);
  scene.add(me.root);
  const player = new PlayerController(me, world.collision, data, input);
  const rig = new CameraRig(camera, input, world.collision, data);
  const free = new FreeCamera(camera, input, floorAt);
  // (those who arrive do not all stand on one spot — "quand les gens arrivent, tout le monde s'empile au même
  // endroit", said the owner —: each is put somewhere on the lane within a few metres of the gate, on free and
  // level ground, looking the same way. For a picture, the spot itself.)
  const spawnPlace = () => {
    if (SHOT) return [SPAWN.x, SPAWN.z];
    const y0 = data.heightAt(SPAWN.x, SPAWN.z), p = { x: 0, z: 0 };
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()), x = SPAWN.x + Math.cos(a) * r * 3.4, z = SPAWN.z + Math.sin(a) * r * 6, y = data.heightAt(x, z);
      p.x = x; p.z = z; world.collision.resolve(p, 0.7, y);
      if (Math.hypot(p.x - x, p.z - z) < 0.05 && world.collision.walkable(x, z) && Math.abs(y - y0) < 0.8) return [x, z];
    }
    return [SPAWN.x, SPAWN.z];
  };
  const spawn = () => {
    const [x, z] = spawnPlace();
    player.teleport(x, z, SPAWN.yaw + Math.PI);
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
  // (running is on unless the visitor switched it off; the camera that always stays behind the character is
  // off unless they switched it on. The camera turns with the walker for everybody — it was a setting that
  // nobody left off: only the tools still switch it off, for a camera that stays where they put it)
  const settings = { run: store.get('mmf.run') !== '0', behind: store.get('mmf.behind') === '1' };
  player.autoRun = settings.run;
  rig.follow = !((import.meta.env.DEV || typeof __LAB__ !== 'undefined' || typeof __TEST__ !== 'undefined') && store.get('mmf.follow') === '0');
  rig.behind = settings.behind;
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
  // (the room one was in before the page loaded itself again — a refresh, a new version —: gone back to, as
  // long as the address still asks for the same thing)
  let backTo = (() => { try { const kept = JSON.parse(store.get('mmf.room', true)); return kept && kept.asked === (params.get('room') || '') ? cleanRoom(kept.room) : ''; } catch { return ''; } })();
  let inRoom = ''; // (the room one is in, once one is in one)
  // (what the interface says of the room one is in: its name, whether there are others — and, for the settings,
  // the rooms one may go to and one's own, where rooms are sold)
  const roomInfo = () => (presence && presence.mode === 'online' ? {
    name: presence.room, label: presence.label, several: /^Room (?!1$)/.test(presence.label) || (roster.rooms || []).some((r) => r.name !== presence.room),
    rooms: roster.rooms || [], own: mine.on || presence.inOwn ? { room: mine.room, price: price(mine.price || 5900), life: mine.life ? price(mine.life) : '', here: presence.inOwn ? { host: presence.host } : null } : null,
  } : null);
  // One browser, one visitor (app/OneTab.js): of two tabs of this browser, the one that came into the world last
  // plays; the other lets its place in the room go, falls silent, stops drawing and says so — until "Play here".
  // (?tabs=many in the address: every tab plays, to try the game in several tabs at once)
  let inputWas = null; // (what the controls were when the tab stepped aside: walking, or the free camera — given back as it was)
  const tab = oneTab({
    many: new URLSearchParams(location.search).get('tabs') === 'many',
    away: () => {
      inputWas = input.enabled;
      presence?.sleep();
      audio.setAway(true);
      hud.elsewhere(true);
      input.enabled = false;
      engine.pause();
    },
    back: () => {
      hud.elsewhere(false);
      audio.setAway(false);
      engine.resume();
      if (inputWas !== null) { input.enabled = inputWas; inputWas = null; }
      presence?.wake();
    },
    told: (what) => hud.elsewhere(true, what),
  });
  hud.on('playhere', () => tab.play());
  app.tab = tab;
  const startPresence = () => {
    tab.start(); // (this tab comes into the world: any other tab of this browser steps aside — unless this page started in the background and another plays)
    presence = new Presence({ name, color, kit: packKit(kit), ...(backTo && { back: backTo }) });
    if (!tab.playing) presence.sleep(); // (a page in the background asks first whether another tab plays: nothing is sent meanwhile)
    // which room: said when one is entered — and when the one that was asked for could not be
    presence.on('room', (e) => {
      // (the address follows the room, when it names one: a friend who is given this address joins the right room)
      if (params.has('room') && cleanRoom(params.get('room')) !== e.room) {
        try { const u = new URL(location.href); u.searchParams.set('room', e.room); history.replaceState(history.state, '', u); params.set('room', e.room); } catch { /* an address that cannot be rewritten */ }
      }
      store.set('mmf.room', JSON.stringify({ room: e.room, asked: params.get('room') || '' }), true);
      // (a name the address did not ask for — a page served under a folder of its own — is not worth a word)
      const lost = e.closed ? (params.has('room') ? `"${e.closed}" is not a room of the fair` : '') : e.full ? `${e.fullLabel || roomLabel(e.full)} is full` : e.asleep ? `"${e.asleepLabel}" is asleep (nobody pays for it any more)`
        : e.out ? (e.outBy === 'admin' ? `An administrator has sent you out of "${e.outLabel}"` : `The owner of "${e.outLabel}" has put you out of it`) : e.gone ? `${roomLabel(e.gone)} is no longer open` : '';
      if (lost) hud.note(e.moved ? `${lost}: you are in ${e.label}.` : `${lost}: you stay in ${e.label}.`, 7000);
      // (put out of a room, or its door found shut: said in the chat too, where it stays)
      if (lost && (e.out || e.asleep)) hud.addChat('✦', 5, `${lost}: you are in ${e.label}.`, true);
      else if (lost) { /* said */ }
      else if (e.moved && inRoom) {
        hud.note(`You are in ${e.label} now.`, 4500);
        hud.addChat('✦', 5, `You are in ${e.label} now: who you see and the chat are those of this room.`, true);
      }
      // a room a player made: reached by its link alone, with boards of its own next to the world's
      if (e.own && e.moved) hud.addChat('✦', 5, `You are in "${e.label}", a room of its own: only those who were given its link are here. The boards of the games show this room next to the world.${e.host ? ' It is yours: its settings are in "Who is here".' : ''}`, true);
      if (e.moved) hud.offer(null);
      const changed = inRoom !== e.room;
      inRoom = e.room;
      scoreRoom(e.own ? { id: e.room, member: presence.member } : null);
      if (changed && (e.own || fair.inOwn)) refreshBoards();
      fair.inOwn = !!e.own;
      refreshRooms();
    });
    // a room a player made has a password: asked for — it stays in this page, and goes nowhere but to the server
    presence.on('locked', ({ label, wrong, wait }) => {
      const ask = async () => {
        if (state.mode === 'intro') return void setTimeout(ask, 700); // (once the visitor is in the world)
        const got = await hud.form(`"${label}" has a password`, `${wait ? 'Too many wrong passwords: the door of this room is closed for a quarter of an hour.' : wrong ? 'That is not its password.' : 'Whoever made this room gave it a password.'} ${wait ? 'Try again later' : 'Type it to come in'} — or cancel, and visit the fair meanwhile.`,
          [{ key: 'password', label: 'Password', type: 'password' }], 'Come in');
        if (got?.password) presence.unlock(got.password); else presence.giveUp();
      };
      ask();
    });
    // this room has gone quiet, another has room: an offer — nobody is moved
    presence.on('quiet', ({ to, label, n }) => {
      const text = `This room has gone quiet. ${label} has ${n} visitor${n === 1 ? '' : 's'}, and room for you.`;
      hud.addChat('✦', 5, `${text} "Who is here" lists the rooms: you change with a click, and stay where you stand.`, true);
      if (!busyNow()) hud.offer(text, `Join ${label}`, () => changeRoom(to));
    });
    // what is released has changed (the owner threw a switch): said to the whole room at once
    presence.on('release', (news) => updates.hear(news));
    // a word from the fair, to every room
    presence.on('announce', ({ text }) => { hud.addChat('✦ The fair', 5, text, false, 'important'); hud.note(`The fair: ${text}`, 9000); audio.play('score'); });
    // the relay was reached again (a delivery restarts it, the line dropped, the tab was aside): is this page still the
    // version online? — and what the sponsors show may have changed meanwhile, unheard: it is asked again (so too when
    // the line first opens long after the shop was asked: a page started aside, the welcome card, a first try that failed)
    let met = false;
    presence.on('welcome', ({ mode }) => {
      if (mode !== 'online') return;
      if (met) updates.check();
      if (met || Date.now() - shopAt > 5000) sponsorsSoon();
      met = true;
    });
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
      // (…or raised their mushroom cloud — they found every relic —: of light, over them, as the animals are; and
      // heard from as far as one would hear it)
      if (o && o.visible && i === MUSHROOM) {
        const it = avatars?.items.get(id);
        if (it?.character?.root) rank.play('mushroom', it.character.root); else world.sparks.mushroom(o.x, o.y, o.z);
        const d = Math.hypot(o.x - player.pos.x, o.z - player.pos.z);
        if (d < 80) audio.play('boom', { volume: 0.5 * (1 - d / 80), rate: 1.7 });
        return;
      }
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
    // (what the sponsors show has changed — a new one, a panel changed, one taken down —: the panels and the wall of
    // thanks follow, without a reload; each page asks at a moment of its own, not all of them at once)
    presence.on('shop', () => sponsorsSoon());
    // (the name of an account is its owner's alone: asked for by somebody else, the relay says which name is worn instead)
    presence.on('named', (e) => {
      name = e.name; store.set('mmf.name', name); hud.setName(name); world.games.setMe(account.name || name);
      const line = e.rude ? `That name cannot be worn here (no insult, no address of a site, no @): you are ${e.name}.` : `"${e.taken}" is the name of somebody's account — theirs alone. Sign in if it is yours (Settings); until then you are ${e.name}.`;
      hud.note(line, 10000);
      hud.addChat('✦', 5, line, true);
    });
    let limitTold = 0; // (said once in a while: the page tries again by itself)
    presence.on('limit', ({ of, max }) => {
      if (Date.now() - limitTold < 10 * 60_000) return;
      limitTold = Date.now();
      const text = of === 'minute' ? 'Many visitors are arriving from your network at once: the fair lets you in within a minute. You are on your own until then.'
        : `Too many visitors are connected from your network (${max} at the most): you are on your own for now — the fair lets you in as soon as one of them leaves.`;
      hud.note(text, 9000);
      hud.addChat('✦', 5, text, true);
    });
    presence.on('who', ({ list, now }) => { roster.details = new Map(list.map((p) => [p.id, p])); roster.now = now; if (hud.rosterOpen) showRoster(); });
    presence.on('admin', ({ ok, out }) => {
      if (ok && hud.rosterOpen) presence.who();
      // the title was taken away while we were here (said so by the relay), or the key was not recognised
      // when the connection came back (then the server is asked again before the key is forgotten)
      if (!ok && who.admin && !who.owner) (out ? adminKey('') : adminKey(who.key)).then(() => { if (!who.admin) hud.note('You are an administrator no more.', 6000); });
    });
    if (who.key) presence.setAdminKey(who.key);
    presence.setBadge(badgeOn && who.admin);
    // no toast when the list is merely rebuilt because the connection changed (local <-> online)
    let shownMode = presence.mode;
    presence.on('status', ({ mode, count }) => { shownMode = mode; hud.setPresence(mode, count, roomInfo()); });
    // (in a crowd, comings and goings are not announced)
    presence.on('join', (peer) => { if (presence.mode === shownMode && presence.count <= 30) hud.note(`${peer.name} joined`); if (hud.rosterOpen) showRoster(); });
    presence.on('leave', (peer) => { if (presence.mode === shownMode && presence.count <= 30) hud.note(`${peer.name} left`); if (hud.rosterOpen) showRoster(); });
    presence.connect();
    Object.assign(app, { presence, avatars });
    app.worldClock = sharedNow; // (the clock everybody shares, for the tools that look at two visitors at once)
  };

  // ---------- who is here (and, for the administrator, where from; putting out, keeping out)
  const roster = { details: null, bans: null, admins: null, visitors: null, rooms: null, now: 0 };
  let badgeOn = store.get('mmf.badge') === '1'; // (an administrator who lets it be known: a badge on their name)
  // the rooms one may change to (the common rooms: how many each holds): asked when a room is entered, when the
  // list is opened, and now and then
  const refreshRooms = async () => {
    roster.rooms = presence ? await presence.rooms() : null;
    if (presence) hud.setPresence(presence.mode, presence.count, roomInfo());
    if (hud.rosterOpen) showRoster();
  };
  setInterval(() => { if (presence?.mode === 'online' && !document.hidden) refreshRooms(); }, 4 * 60_000);
  // to another room, without loading the page again: one stays where one stands
  const changeRoom = async (to) => {
    if (!presence || presence.mode !== 'online') return;
    if (fair.session || world.games.run.state === 'running' || player.riding) { hud.note('Finish what you are doing first: then change room.', 4500); return; }
    hud.note(`Joining ${roomLabel(to)}…`, 3000);
    await presence.switchRoom(to);
  };
  // a link for a friend: whoever opens it joins this room, if it has room
  const copyRoomLink = async (room) => {
    const u = new URL(location.href);
    u.search = ''; u.hash = ''; u.searchParams.set('room', room);
    try { await navigator.clipboard.writeText(u.href); hud.note('Link copied: whoever opens it joins you in this room, if it has room.', 5500); } catch { hud.note(u.href, 14000); }
  };
  const showRoster = () => {
    const p = player.pos, zoneOf = (x, z) => { let best = null, bd = 1; for (const zn of PLACES) { if (zn.hidden) continue; const d = Math.hypot(x - zn.x, z - zn.z) / zn.r; if (d < bd) { bd = d; best = zn; } } return best ? best.name : ''; };
    const people = [{ id: presence?.id || 0, name, color, me: true, where: zoneOf(p.x, p.z) }];
    if (presence) {
      for (const o of [...presence.peers.values()].sort((a, b) => a.name.localeCompare(b.name))) {
        const known = o.visible || o.far, d = known ? Math.hypot(o.x - p.x, o.z - p.z) : 0;
        people.push({ id: o.id, name: o.name, color: o.color, where: known ? `${d < 1000 ? `${Math.round(d)} m away` : 'far away'}${zoneOf(o.x, o.z) ? ` · ${zoneOf(o.x, o.z)}` : ''}` : '' });
      }
    }
    hud.showRoster({ people, mode: presence?.mode || 'offline', admin: who.admin && presence?.admin, owner: who.owner, details: roster.details, bans: roster.bans, admins: roster.admins, visitors: roster.visitors, now: roster.now, rooms: roster.rooms, room: roomInfo(), badge: badgeOn,
      // (a room of one's own — only while such rooms are switched on: the one this visitor pays for, and whether the room they are in is one)
      own: mine.on ? { room: mine.room, price: mine.price, life: mine.life, here: presence?.inOwn ? { host: presence.host } : null } : null });
  };
  // ---------- a room of one's own (server/urooms.js): nothing of it while its switch is off
  const mine = { on: false, room: null, price: 0, life: 0 }; // (price: by the month; life: bought for good, once — cents)
  const refreshMine = async (on = mine.on) => {
    mine.on = !!on;
    const got = mine.on ? await callApi(`api/myroom?device=${deviceId()}`) : null;
    mine.room = got?.room || null; mine.price = got?.price || 0; mine.life = got?.life || 0;
    if (presence) hud.setPresence(presence.mode, presence.count, roomInfo()); // (the settings name the rooms too)
    if (hud.rosterOpen) showRoster();
    if (shopView.isOpen) shopView.refresh(shopItems());
  };
  const ownLink = (id) => { const u = new URL(location.href); u.search = ''; u.hash = ''; if (id) u.searchParams.set('room', id); return u.href; };
  // (asked without callApi: a refusal has something to say here)
  const tellMine = async (body) => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/myroom`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device: deviceId(), ...body }) });
      const said = /json/.test(res.headers.get('content-type') || '') ? await res.json() : null;
      if (res.ok && said?.room) { mine.room = said.room; if (hud.rosterOpen) showRoster(); return null; }
      return said?.error || 'That could not be changed just now.';
    } catch { return 'The fair cannot be reached.'; }
  };
  const myRoom = async (what) => {
    const room = mine.room;
    if (what === 'buy') { hud.closeRoster(); openShop('room'); return; }
    if (what === 'offer') { hud.closeRoster(); roomPitch(); return; }
    if (what === 'leave') { location.assign(ownLink('')); return; }
    if (!room) return;
    if (what === 'go') location.assign(ownLink(room.id));
    else if (what === 'link') { try { await navigator.clipboard.writeText(ownLink(room.id)); hud.note(`Link copied: whoever opens it comes to your room${room.locked ? ' — and is asked for its password' : ''}.`, 6000); } catch { hud.note(ownLink(room.id), 14000); } }
    else if (what === 'edit') {
      hud.closeRoster();
      const got = await hud.form('Your room', `Its name, and a password if you want one (4 characters or more; leave it empty to change nothing${room.locked ? ' — it has one now' : ''}).`,
        [{ key: 'name', label: 'Name', value: room.name, max: 28 }, { key: 'password', label: room.locked ? 'New password' : 'Password', type: 'password', fresh: true }], 'Save');
      if (!got) return;
      const wrong = await tellMine({ ...(got.name && got.name !== room.name && { name: got.name }), ...(got.password && { password: got.password }) });
      hud.note(wrong || 'Saved.', wrong ? 7000 : 3000);
    } else if (what === 'open') { const wrong = await tellMine({ password: '' }); hud.note(wrong || 'No password any more: whoever has the link comes in.', 6000); }
    else if (what === 'reset') {
      hud.closeRoster();
      hud.offer('Empty the boards of your room? Every score made in it goes — the boards of the world keep theirs.', 'Empty them', async () => { const wrong = await tellMine({ reset: true }); hud.note(wrong || 'The boards of your room are empty.', 6000); if (!wrong && presence?.inOwn) refreshBoards(); }, 30000, 'Keep them');
    } else if (what === 'manage') { hud.note('Opening the page of your subscription…', 8000); const wrong = await shop.portal('room'); if (wrong) hud.note(wrong, 7000); }
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
  // sitting down on the ground, legs crossed, wherever one stands (X, /sit, or the emotes) — or lying down on it
  // (X held, /lie, the emotes): a step gets up again
  const sitDown = (lie = false) => {
    if (state.mode !== 'walk' || fair.session || player.dead) return;
    if (lie) { if (!player.lieOnGround()) hud.note('Not here: find some ground to lie on.', 2600); return; }
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
    if (name === 'lie') { sitDown(true); return; }
    if (name === 'mushroom' || name === 'boom') { app.mushroom?.(); return; }
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
    // the first three lines said nearby: a word on who reads them, and on how to talk to everybody (a cave has
    // its own rule, and says so itself)
    if (near && !player.cave) {
      const told = Number(store.get('mmf.nearTold')) || 0;
      if (told < 3) {
        store.set('mmf.nearTold', String(told + 1));
        hud.addChat('✦', 5, 'Only people close to you (20 m) can read what you say. Switch to "Everyone" — the green button left of the box, or Tab — to chat with the whole oasis.', true);
      }
    }
  };
  // the climb: a clock while climbing, the board of the best times at the gate
  const skyScores = new Scores('sky');
  const lists = (tops) => Object.fromEntries(Object.entries(tops).map(([k, v]) => [k, v])); // (already { name, score })
  // the fair: the four booths of the pier, the quad race and the flying theatre, each with its board. While
  // one of them is being played (`fair.session`), it has the pointer, the camera and the clock of the screen.
  const fair = { boards: { race: new Scores('race'), wing: new Scores('wing') }, session: null, kind: null, fov: null, after: 0, stands: { race: world.games.race.board, wing: world.games.wing.board }, tops: {}, roomTops: {}, inOwn: false };
  for (const b of world.games.booths.list) { fair.boards[b.id] = new Scores(b.id); fair.stands[b.id] = b.board; }
  fair.boards.run = new Scores('run'); fair.stands.run = world.games.notices.arcade.board; // (the arcade cabinet)
  // Every board is asked for — with those of the room one is in, when it is a room a player made (server/urooms.js):
  // each board then shows the room next to the world.
  const roomOf = (id) => (presence?.inOwn && fair.roomTops[id] ? { name: presence.label, lists: fair.roomTops[id] } : null);
  const refreshBoards = () => Scores.everywhere().then(({ world: all, room }) => {
    fair.tops = all; fair.roomTops = room || {};
    world.games.setScores(lists(all.sky), roomOf('sky'));
    for (const id in fair.stands) fair.stands[id].setScores(all[id], roomOf(id));
  });
  refreshBoards();
  const _aim = { origin: new THREE.Vector3(), dir: new THREE.Vector3(), clicks: 0, down: false };
  const fairIo = {
    play: (sound, options) => audio.play(sound, options), note: (text) => hud.note(text, 3000),
    strike: () => emote(emoteIndex('punch')), go: () => fair.boards.race.start(),
    feathers: (x, y, z, n) => world.sparks.feathers(x, y, z, n),
  };
  const endGame = () => {
    keysHelp(app).clear(); // (the keys of the game that was on are its own: gone with it)
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
  // (`theirs`: the lists of the room one is in, when they came with the world's)
  const showBoard = (id, tops, theirs) => { if (theirs) fair.roomTops[id] = theirs; if (id === 'sky') world.games.setScores(lists(tops), roomOf(id)); else fair.stands[id]?.setScores(tops, roomOf(id)); fair.tops[id] = tops; };
  const rankOf = (list, who) => (list || []).findIndex((e) => e.name.toLowerCase() === who.toLowerCase());
  liveScore = async (peer, id) => {
    if (!GAMES[id] || !peer) return;
    const before = fair.tops[id], { tops, room: theirs } = await boardOf(id).both(), [title, format] = GAMES[id];
    showBoard(id, tops, theirs);
    const at = rankOf(tops.day, peer.name);
    if (at < 0) return; // (kept in their browser only, or beaten since)
    const was = before ? rankOf(before.day, peer.name) : -1, same = was >= 0 && before.day[was].score === tops.day[at].score;
    if (same) return; // not a better score than the one they had
    hud.addChat('✦', 5, `${title}: ${peer.name} — ${format(tops.day[at].score)} (#${at + 1} today)`, true);
    const mine = rankOf(tops.day, name), minePast = before ? rankOf(before.day, name) : -1, theirsPast = was;
    if (mine >= 0 && at < mine && (theirsPast < 0 || minePast < 0 || theirsPast > minePast)) { hud.note(`${peer.name} just beat your score at ${title}!`, 6000); audio.play('fail', { volume: 0.5 }); }
    else audio.play('score', { volume: 0.5 });
  };
  // Scores belong to accounts (server/scores.js). Without one a score is on the list of the day only: the
  // visitor is told where it stands today — and, when it would be among the ten of a longer list, offered an
  // account to keep it (the score made as a guest is then claimed: see accountChanged).
  const whereOf = (r) => (r.guest ? (r.day ? `#${r.day} today` : 'not on the board today') : r.rank ? `#${r.rank} of all time` : 'not on the board this time');
  const offerAccount = (r) => {
    if (!r.guest || !r.best || account.name) return;
    const w = r.would || {}, [n, when] = w.all ? [w.all, 'of all time'] : w.month ? [w.month, 'this month'] : w.week ? [w.week, 'this week'] : [0, ''];
    if (!n) return;
    hud.offer(`You would be #${n} ${when} — create an account to keep it (free: a name and a password).`, 'Create an account', () => accountAction('create'), 30000, 'Not now');
  };
  const nameTaken = (text) => {
    const line = `${text} — not kept: "${name}" is the name of somebody's account. Sign in if it is yours (Settings), or play under another name.`;
    hud.note(line, 10000);
    hud.addChat('✦', 5, line, true);
  };
  /** The game is over: its score goes on the board (a time for the race, points for a booth). */
  const scoreGame = (id, title, score, text, log = null) => {
    fair.boards[id].submit(name, score, log).then((r) => {
      const { tops, rank: place, best, shared } = r;
      showBoard(id, tops, r.room);
      if (r.taken) return nameTaken(text);
      if (shared) presence?.sendScore(id);
      hud.note(`${text} — ${best ? whereOf(r) : 'your best stands'}${shared ? '' : ' (kept in this browser only)'}`, 8000);
      const shown = r.guest ? r.day : place;
      if (shown && shown <= 10 && best) hud.addChat('✦', 5, `${title}: ${name} — ${text} (#${shown}${r.guest ? ' today' : ''})`, true);
      offerAccount(r);
    });
  };
  // A game starts: the server notes when, and draws the seed of the game — what is left to chance in it comes from
  // that seed, so that the server can play the game again (server/replay.js). Without a server there is nothing
  // to wait for: the device's own dice, at once. (`fair.seed`: a rehearsal — the next games are played with it.)
  const seedOf = (board) => {
    const started = fair.boards[board].start();
    if (Number.isInteger(fair.seed)) return fair.seed;
    return noApi() ? null : started.then((r) => r?.seed);
  };
  // The keys of the game that is on: said when it opens, a line for each, and again whenever asked — the H key, or
  // the small button under the line of the run (src/extras/help.js: the lab's games say theirs the same way).
  const gameKeys = (desk, phone) => keysHelp(app).set((touch ? [...phone, 'The button at the bottom: leave'] : [...desk, 'E or Esc: leave', 'H: these keys again']).join(' · '));
  const BOOTH_KEYS = {
    shoot: [['Mouse: aim', 'Click or Space: shoot'], ['Tap a target: shoot']],
    mole: [['Mouse: aim', 'Click or Space: whack'], ['Tap a mole: whack']],
    milk: [['Mouse: aim the jet', 'Hold the button (or Space): pour'], ['Hold a finger where you aim: pour']],
    bell: [['Click or Space: strike — three blows'], ['Tap: strike — three blows']],
    hoop: [['Mouse: aim', 'Hold the button (or Space): wind up', 'Let go: shoot'], ['Hold a finger where you aim: wind up', 'Let go: shoot']],
    stack: [['Click or Space: drop the floor'], ['Tap: drop the floor']],
    geiger: [['Click the lamps in the order they lit'], ['Tap the lamps in the order they lit']],
    fish: [['Mouse: the hook goes where you point'], ['Drag a finger: the hook follows it']],
    scram: [['Click or Space: answer the alarm — red only'], ['Tap: answer the alarm — red only']],
    cups: [['Click the cup that hides the core'], ['Tap the cup that hides the core']],
  };
  const playBooth = (booth) => {
    if (fair.session || player.dead) return;
    fair.session = world.games.booths.open(booth, fairIo, seedOf(booth.id)); fair.kind = 'booth'; fair.after = 0;
    player.riding = false;
    player.teleport(booth.stand[0], booth.stand[1], booth.stand[2]);
    me.root.visible = !fair.session.firstPerson;
    if (fair.session.crosshair) document.body.classList.add('playing');
    input.consumeClicks();
    hud.note(booth.how, 6500);
    if (BOOTH_KEYS[booth.id]) gameKeys(...BOOTH_KEYS[booth.id]);
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
    hud.note(`${start.name} start!`, 5000);
    gameKeys(['Arrows or WASD: steer', 'Shift: drift — a boost when you let go', 'Space: hop'], ['The stick: steer', 'Hold Run: drift — a boost when you let go', 'Jump: hop']);
    startBlend(0.6);
  };
  // the flying theatre: up on the stage with a pair of wings; the game holds the flyer, the scenery goes by
  const playWing = () => {
    if (fair.session || player.dead) return;
    fair.session = world.games.wing.open(player, fairIo, seedOf('wing')); fair.kind = 'wing'; fair.after = 0;
    player.riding = false;
    player.driver = fair.session.driver;
    me.setWings(true);
    input.consumeClicks();
    hud.note('Flap, and fly through the gaps!', 5000);
    gameKeys(['Click or Space: flap'], ['Tap: flap']);
    startBlend(0.6);
  };
  // the arcade cabinet: its game is played on a screen of its own, laid over this one
  const playArcade = () => {
    if (fair.session || player.dead) return;
    const spot = world.games.notices.arcade;
    fair.session = arcade.open(fairIo, `#${AVATAR_COLORS[color].toString(16).padStart(6, '0')}`, seedOf('run')); fair.kind = 'arcade'; fair.after = 0;
    player.riding = false;
    player.teleport(spot.x, spot.z, spot.yaw);
    input.consumeClicks();
    // (its keys are written under its picture all along, with the way out: the button that shows the keys of a
    // game again would only sit on its title)
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
      // (a finger on its screen is heard by the cabinet itself: that screen lies over the canvas of the game)
      const P = input.pointer, zone = arcade.pressed || (P.down ? arcade.zone(P.x, P.y) : null), K = input.keys;
      const keys = { jump: K.has('Space') || K.has('ArrowUp') || K.has('KeyW') || zone === 'jump', duck: K.has('ArrowDown') || K.has('KeyS') || zone === 'duck' };
      input.consumeClicks();
      player.update(dt, rig.heading, false);
      if (s.over) {
        if (fair.after === 0) { fair.after = 0.01; if (s.score > 0) scoreGame('run', GAME_NAMES.run, s.score, `${s.score.toLocaleString('en-US')} m`, s.log()); }
        else if ((fair.after += dt) > 0.7 && keys.jump && !fair.heldJump) { s.restart(seedOf('run')); fair.after = 0; } // (another run)
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
        if (s.score > 0) scoreGame(s.booth.id, s.booth.name, s.score, s.booth.format ? s.booth.format(s.score) : `${s.score} ${s.booth.unit ? (s.score === 1 ? s.booth.unit.replace(/s$/, '') : s.booth.unit) : s.booth.seconds ? 'points' : 'on the scale'}`, s.log()); else hud.note('Nothing this time. Have another go!', 4000);
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
  // (the cross in the frame of the cabinet: the way out for who has no keys)
  arcade.onLeave = () => { if (fair.session && fair.kind === 'arcade') { endGame(); hud.note('Game left.'); } };
  queueMicrotask(() => Object.assign(app, { shop, refreshShop, adminKey, scoreGame }));
  let climbKeys = false; // (the keys of the climb are on the screen for the asking)
  world.games.events = {
    note: (text) => hud.note(text, 4200),
    run: (text) => { hud.setRun(text); if (!text && climbKeys) { climbKeys = false; keysHelp(app).clear(); } },
    started: () => {
      skyScores.start(); audio.play('start');
      // (the climb is walked and jumped like the rest of the world: its keys are said all the same — once, the first
      // time one leaves the plate — and taken back when one walks away from the course)
      if (!climbKeys) {
        climbKeys = true;
        keysHelp(app).set((touch ? ['The stick: move', 'The Jump button: jump', 'Back on the start plate: the clock starts again'] : ['WASD or the arrows: move', 'Space: jump', 'Shift: walk — one runs by default', 'Back on the start plate: the clock starts again', 'H: these keys again']).join(' · '));
      }
    },
    finished: (ms, clean) => {
      audio.play('victory');
      rank.play('dragon', me.root);
      presence?.sendEmote(emoteIndex('dragon'));
      if (!clean) { hud.note(`${formatTime(ms)} — but a cheat was on: not recorded`, 7000); return; }
      skyScores.submit(name, ms).then((r) => {
        const { tops, rank: place, best, shared } = r;
        showBoard('sky', tops, r.room);
        if (r.taken) return nameTaken(formatTime(ms));
        if (shared) presence?.sendScore('sky');
        hud.note(`${formatTime(ms)} — ${best ? whereOf(r) : 'your best time stands'}${shared ? '' : ' (kept in this browser only)'}`, 8000);
        const shown = r.guest ? r.day : place;
        hud.addChat('✦', 5, `${CLIMB.name}: ${name} reached the top in ${formatTime(ms)}${shown ? ` (#${shown}${r.guest ? ' today' : ''})` : ''}`, true);
        offerAccount(r);
      });
    },
  };
  // the sky villages: one is carried there from the Sky Gate, and back through the ring of each village
  const sky = world.sky;
  if (sky.stage !== 'hidden') PLACES.push(ZONES.find((z) => z.id === 'skygate'));
  Npc.sky = sky.stage === 'open'; // (nobody speaks of what is not there)
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
  // The big attractions have up to five sponsors: the highest bid has the panel over the board of scores, and the
  // board beside it lists the five (GamesZone.scoreStand: `roll`). Their places: 'board:<id>' and
  // 'board:<id>-2' … '-5' (server/catalog.js).
  const MAJOR_GAMES = ['sky', 'race', 'wing', 'slide', 'pond', 'boats', 'hill', 'crack', 'hollow', 'waves', 'lava', 'hive', 'flip', 'spiral', 'cars', 'golf', 'ages', 'raft', 'walls', 'sneak', 'mine', 'coaster'], rotors = [];
  const gameOf = (id) => String(id).split(':')[1]?.replace(/-\d$/, '') || '';
  /** What a place of a panel weighs: what was bid for it (or what was said to be paid for a place filled by hand); -1 when it is free. */
  const weightOf = (id) => { const v = shop.slots[id]; return v ? v.bid || v.pays?.amount || 0 : -1; };
  /** Where the next bid on a big attraction goes: its first free place, or the one that went for the least. */
  const targetOf = (rot) => rot.ids.find((k) => !shop.slots[k]) || rot.ids.slice().sort((a, b) => (shop.slots[a]?.bid || 0) - (shop.slots[b]?.bid || 0))[0];
  const addPlace = (sl) => {
    if (!sl.id.startsWith('board:') || !MAJOR_GAMES.includes(gameOf(sl.id))) { places.set(sl.id, { what: sl.what, spot: sl, set: sl.set }); return; }
    // (a big attraction: five places. The one who put in the most has the panel over the board, and keeps it; the
    // board beside it lists the five, the most first, and the places still free)
    const ids = [sl.id, ...[2, 3, 4, 5].map((n) => `${sl.id}-${n}`)], rotor = { ids, frames: new Map(), current: sl.id, spot: sl, listed: '' };
    rotor.show = () => {
      const order = ids.slice().sort((a, b) => weightOf(b) - weightOf(a) || ids.indexOf(a) - ids.indexOf(b));
      const top = order.find((id) => rotor.frames.get(id)) || '';
      rotor.current = top || sl.id;
      if (rotor.shown !== top) { rotor.shown = top; sl.set(top ? rotor.frames.get(top) : null); }
      if (!sl.roll) return;
      const offer = shop.open ? `from ${price(shop.least(targetOf(rotor)))} · step up and bid` : '';
      const rows = order.map((id) => {
        const v = shop.slots[id], f = rotor.frames.get(id), w = weightOf(id);
        return { id, state: !v && !f ? 'free' : f?.pending ? 'pending' : f ? 'live' : 'taken', title: f?.title || '', subtitle: f?.subtitle || '', logo: f?.logo || null, figure: w > 0 ? price(w) : '', mine: !!v?.mine, top: !!top && id === top, offer };
      });
      const key = JSON.stringify(rows.map((r) => [r.state, r.title, r.subtitle, r.logo?.src || '', r.figure, r.mine, r.top, r.offer]));
      if (key !== rotor.listed) { rotor.listed = key; sl.roll(rows); }
    };
    for (const id of ids) places.set(id, { what: sl.what, spot: sl, rotor, set: (sp) => { rotor.frames.set(id, sp || null); if (rotor.shown === id) rotor.shown = undefined; rotor.show(); } });
    rotors.push(rotor);
  };
  for (const sl of world.sponsorSlots || []) addPlace(sl);
  for (let n = 1; n <= (world.pier.gondolas || 0); n++) places.set(`gondola:${n}`, { what: `gondola ${n} of the big wheel`, set: (sp) => world.pier.setGondola(n, sp) });
  for (let n = 1; n <= (world.pier.huts || 0); n++) places.set(`hut:${n}`, { what: `beach hut ${n}`, set: (sp) => world.pier.setHut(n, sp) });
  for (const v of sky.villages) places.set(`village:${v.id}`, { what: `the sky village ${v.name}`, village: v, set: (sp) => { if (sp) sky.setSponsor(v.index, { name: sp.title, motto: sp.subtitle, url: sp.url }); } });
  const plaques = world.places.plaques; // (the plaques of the companions, round the plinth of the golden dog: places paid once)
  for (let n = 1; n <= (plaques?.count || 0); n++) places.set(`plaque:${n}`, { what: 'a plaque round the golden dog', plaque: n, set: (sp) => plaques.set(n, sp) });
  const shown = new Map(); // what is painted where: id → the address of its picture + its words
  // the wall of thanks, cut into the cliff by the acid pond: every sponsor, the one who puts in the most first
  // (who counts and in which order: app/thanks.js). Painted again only when the list changes.
  let thanked = '';
  const feedThanks = async () => {
    const wall = world.games.thanks, rows = rankSponsors(shop.slots, GAME_NAMES);
    const info = shop.open ? { open: true, from: `from ${dollars(shop.prices.auction?.start || 100)}`, gondola: dollars(shop.prices.gondola), backdrop: dollars(shop.prices.tarp) } : { open: false };
    const key = JSON.stringify([rows, info]);
    if (!wall || key === thanked) return;
    thanked = key;
    const logos = await Promise.all(rows.map((r) => loadImage(r.logo)));
    if (key === thanked) wall.set(rows.map((r, i) => ({ ...r, logo: logos[i] })), info);
  };
  // (at the foot of the wall: every sponsor in a list, the most generous first — its site, how often it was
  // opened — and a click opens it; when they do not fit on one face of the rock, the wall turns its pages)
  const openThanks = () => {
    const rows = rankSponsors(shop.slots, GAME_NAMES);
    if (!rows.length) { hud.note('Nobody sponsors the fair yet. The Trading Post is at the foot of the pier: the first name cut here could be yours.', 7000); return; }
    // (a list one reads: each with its logo, its name and the line under it, where it is, what it put in — Hud.thanks)
    hud.thanks('Thanks to them, the game is free', `${rows.length === 1 ? 'One sponsor keeps' : `${rows.length} sponsors keep`} Atomic Oasis free for everybody — the most generous first. Pick one to open its site: it is counted for them.`, rows)
      .then((i) => { if (i === null) return; const r = rows[i]; if (r.url) { visitSponsor(r.first, r.url); setTimeout(() => refreshShop(), 1500); } else hud.note(`${r.name} gave no site.`, 4000); });
  };
  world.actionSources.push((p) => { const w = world.games.thanks; return w && Math.abs(p.pos.y - data.heightAt(p.pos.x, p.pos.z)) < 1.5 && (p.pos.x - w.x) ** 2 + (p.pos.z - w.z) ** 2 < 13 * 13 ? { label: 'The sponsors and their sites', run: openThanks } : null; });
  { let since = 0; world.zones.push({ update: (dt) => { since += dt; if (since > 12) { since = 0; world.games.thanks?.turn(); } } }); }
  const applySponsors = async () => {
    for (const [id, place] of places) {
      const view = shop.slots[id], live = view && view.state === 'live';
      // (what awaits approval is painted where it would go for the administrator, who has to see it to say yes
      // or no — and for the holder of a plaque, who sees theirs as it will be)
      const d = (who.admin && !place.village && pending[id]?.draft) || (place.plaque && view?.mine && view.draft) || null;
      const key = d ? `?${d.title}|${d.subtitle}|${d.logo}|${d.keep ? 1 : 0}` : live ? `${view.title}|${view.subtitle}|${view.logo}|${view.bg || ''}|${view.url ? view.clicks || 0 : ''}` : view && place.plaque ? `taken${view.mine ? '!' : ''}` : '';
      if ((shown.get(id) || '') === key) continue;
      shown.set(id, key);
      if (d) place.set({ title: d.title, subtitle: d.subtitle, url: d.url, bg: view?.bg || '', pending: true, logo: d.logo ? await loadImage(who.admin ? d.logo : ownDraft(d.logo), who.admin ? who.key : '') : d.keep && live ? await loadImage(view.logo) : null });
      else if (place.plaque) place.set(live ? { title: view.title, subtitle: view.subtitle, logo: view.logo } : view ? { taken: true, mine: !!view.mine } : null); // (its picture is fetched when the plate is painted)
      // (`clicks`: how many times its site was opened from the game — written on the panel, for a place that has a site)
      else place.set(live ? { title: view.title, subtitle: view.subtitle, url: view.url, bg: view.bg || '', logo: await loadImage(view.logo), ...(view.url && { clicks: view.clicks || 0 }) } : null);
    }
    for (const r of rotors) r.show(); // (a bid may change without anything painted changing: who has the panel, the board of the five)
    hud.setVillages(sky.villages, data.meta.size, villageLabel);
    world.games.notices.ads.set(adRows()); // (the board of the booth of the sponsors)
    feedThanks();
  };
  let shopKnown = false; // (has the server said what is theirs yet?)
  let ownedWas = null; // (what this browser had the last time the relay was told)
  let shopAt = 0; // (when the shop was last asked: a page whose line opens long after that asks again — see 'welcome')
  const refreshShop = async () => {
    await shop.load();
    shopAt = Date.now();
    shopKnown = true;
    shop.everything = who.admin;
    // (the relay only shows the others what a visitor has: it is told to ask again when that changes)
    const ownedNow = `${[...(shop.owned || [])].sort().join()}|${shop.hasPass ? 1 : 0}`;
    if (ownedWas !== null && ownedNow !== ownedWas) presence?.own();
    ownedWas = ownedNow;
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
    await sponsorsShown();
  };
  /** What the sponsors show, as the shop now says it: the panels, the wall of thanks, the boards, the cards of the shop. */
  const sponsorsShown = async () => {
    for (const text of shop.notes.splice(0)) hud.addChat('✦', 5, text, true); // (outbid, refunded: said once)
    // (the empty panel over a board says how to take it)
    for (const sl of world.sponsorSlots || []) { const rot = places.get(sl.id)?.rotor; sl.offer?.(shop.open ? `from ${price(shop.least(rot ? targetOf(rot) : sl.id))} · step up and bid` : ''); }
    shopView.stale('board:');
    shopView.refresh(shopItems());
    await applySponsors();
  };
  /**
   * What the sponsors show has changed somewhere ({t:'shop'}, server/shop.js), or this page has just been out of touch
   * (its line came back): the shop is asked again and only what the sponsors show is painted again — nothing of the
   * visitor's own robot, nothing saved to their account (that is refreshShop's) — and, for an administrator, what
   * awaits their approval. At a moment of its own, a few seconds from now, so that the pages of the fair do not all
   * ask at once; one after the other, so that an older answer is never painted over a newer one.
   */
  const refreshSponsors = async () => {
    await shop.load();
    shopAt = Date.now();
    if (who.admin) pending = (await shop.all(who.key)) || {};
    await sponsorsShown();
  };
  const sponsorsSoon = () => {
    if (app.shopSoon) return;
    app.shopSoon = setTimeout(() => { app.shopSoon = 0; app.shopRun = (app.shopRun || Promise.resolve()).then(refreshSponsors).catch(() => {}); }, 800 + Math.random() * 9000);
  };
  /** The holder of a place (or the administrator) says what to show there. */
  const fillPlace = async (id) => {
    const place = places.get(id), view = shop.slots[id] || {}, was = view.draft || view, isVillage = !!place.village, isPlaque = !!place.plaque;
    const byHand = who.admin && !view.mine; // (the administrator fills a place in for a sponsor: shown at once)
    const got = await hud.form(isPlaque ? (byHand ? 'This plaque' : 'Their plaque') : isVillage ? 'Your village' : byHand ? 'This panel' : 'Your panel',
      isPlaque ? (byHand ? 'What you save is engraved at once, for everyone to read.' : 'For your companion — here with you, or missed: their name, a few words — and their picture, if you have one you like. It is engraved once the fair has looked at it.') : byHand ? 'What you save is shown to everyone at once. The colour behind it is yours to choose.' : 'It is shown at once, to everyone. Keep it short — it is painted on a sign — and fit for a fair: what is not is taken down.', [
        { key: 'title', label: isPlaque ? 'Their name (22 letters at most)' : isVillage ? 'Its name (22 letters at most)' : 'Your name (28 letters at most)', value: was.title || '', max: isVillage || isPlaque ? 22 : 28 },
        { key: 'subtitle', label: isPlaque ? 'A few words (40 letters at most) — "Still steals socks", or "2009–2024, he loved the sea"' : isVillage ? 'A line under it (34 letters at most)' : 'A line under it (40 letters at most)', value: was.subtitle || '', max: isVillage ? 34 : 40 },
        ...(isPlaque ? [] : [{ key: 'url', label: 'Your website (https://…) — optional', value: was.url || '', max: 200, hint: 'https://', fill: fromSite({ name: isVillage ? 22 : 28, line: isVillage ? 34 : 40, logo: !isVillage }) }]),
        ...(isVillage ? [] : [{ key: 'logo', label: isPlaque ? 'Their picture (PNG, JPEG or WebP) — leave empty to keep the one you sent' : 'Your logo (PNG, JPEG or WebP) — leave empty to keep the one you sent', type: 'file' }]),
        ...(byHand && !isVillage && !isPlaque ? [{ key: 'bg', label: 'The colour of the panel behind it', type: 'color', value: view.bg || '#fbf7ec' }] : []),
        // (a sponsor who paid some other way: what they paid ranks them on the wall of thanks)
        ...(byHand && !isPlaque && !view.pays?.monthly && !view.bid ? [{ key: 'paid', label: 'What they paid, in dollars — for the wall of thanks (empty: not said)', value: pending[id]?.paid ? String(pending[id].paid / 100) : '', max: 9 }] : []),
      ], byHand ? 'Save' : 'Send it');
    if (!got) return;
    if (!got.title) { hud.note('A name is needed.', 4000); return; }
    let logo = null;
    if (got.logo) { logo = await logoData(got.logo, 256, isPlaque); if (!logo) { hud.note('That picture cannot be used: a PNG, a JPEG or a WebP, please.', 6000); return; } }
    const paid = got.paid !== undefined ? Math.max(0, Math.round((parseFloat(String(got.paid).replace(/[$,\s]/g, '')) || 0) * 100)) : undefined;
    const wrong = byHand ? await shop.set(id, { title: got.title, subtitle: got.subtitle, url: got.url, logo, ...(got.bg !== undefined && { bg: got.bg }), ...(paid !== undefined && { paid }) }, who.key) : await shop.fill(id, { title: got.title, subtitle: got.subtitle, url: got.url, logo });
    hud.note(wrong || (byHand || !isPlaque ? 'Done: it is shown to everyone.' : 'Sent. Their plaque will be engraved as soon as the fair has looked at it.'), 7000);
    if (!wrong) { if (who.admin) pending = (await shop.all(who.key)) || {}; await refreshShop(); }
  };
  let pending = {}; // the administrator: every place as the server keeps it (drafts included)
  /** Opens the site of the sponsor of the place `id` — from its place, the Trading Post or the wall of thanks: counted for the sponsor. */
  const visitSponsor = (id, url) => { if (!url) return; shop.click(id)?.then(() => applySponsors()); window.open(url, '_blank', 'noopener,noreferrer'); }; // (…and the count on its panel follows)
  // A sponsor's form fills itself from the sponsor's own site: the address of the site is its first step — optional
  // — with a button. The fair reads what the site says of itself (the server goes there: server/peek.js) — its name,
  // its line, its icon — and the form is filled with it: every field still theirs to change, each saying in a word
  // where what it holds was found, and nothing saved until they save the form as before. The icon comes as the bytes
  // of whatever picture the site has (a .ico, an SVG…); this browser redraws it into one the game accepts (iconFile),
  // and it is put in the field of the logo as if it had been chosen by hand.
  const FOUND_IN = { 'og:site_name': 'from its name', 'og:title': 'from its title', title: 'from its title', address: 'from its address', description: 'from its description', 'og:description': 'from its description', 'apple-touch-icon': 'its touch icon', icon: 'its icon', 'og:image': 'the picture it shares', 'favicon.ico': 'its favicon' };
  /** What was typed for the address of a site, as an address: "acme.com" is https://acme.com ('' when it is none). */
  const siteAddress = (typed) => { const t = String(typed || '').trim().replace(/^http:\/\//i, 'https://'); return !t || /\s/.test(t) ? '' : /^https:\/\//i.test(t) ? t : /^[^/:@]+\.[^/:@]+/.test(t) && !/^[a-z][a-z0-9+.-]*:/i.test(t) ? `https://${t}` : ''; };
  const fromSite = ({ name = 28, line = 40, logo = true, enter = false } = {}) => ({
    label: 'Fill it in from my site', busy: 'Reading your site…', enter,
    hint: `One press, and the fair reads your name, a line${logo ? ' and your icon' : ''} from your site. Everything stays yours to change.`,
    run: async (typed) => {
      const url = siteAddress(typed);
      if (!url) return { error: 'Type the address of your site first — https://… — then press the button.' };
      const got = await shop.peek(url, { name, line });
      if (got.error) return got;
      const file = logo && got.icon ? await iconFile(got.icon) : null, has = [got.name && 'a name', got.line && 'a line', file && 'an icon'].filter(Boolean);
      const host = siteWords(got.url || url) || 'your site';
      return {
        value: got.url || url, values: { title: got.name, subtitle: got.line }, files: { logo: file },
        from: { title: FOUND_IN[got.from?.name] || 'from your site', subtitle: FOUND_IN[got.from?.line] || 'from your site', logo: FOUND_IN[got.from?.icon] || 'from your site' },
        say: `${has.length ? `Read on ${host}: ${has.length > 2 ? `${has[0]}, ${has[1]} and ${has[2]}` : has.join(' and ')}.` : `Nothing to read on ${host}.`}${logo && !file ? ' No usable icon found: upload yours.' : ''}${has.length ? ' Change whatever you like — nothing is saved yet.' : ' Fill it in by hand.'}`,
      };
    },
  });
  // What a sponsor shows is asked for BEFORE the payment — a name, a line, a site, a logo —, kept in this
  // browser while they are at the payment page, and sent the moment the place is theirs (see arrived()).
  const SPONSOR_DRAFT = 'mmf.sponsor';
  const sponsorFields = (village = false) => [
    { key: 'title', label: village ? 'Its name (22 letters at most)' : 'Your name — a company, a site, yourself (28 letters at most)', value: '', max: village ? 22 : 28 },
    { key: 'subtitle', label: village ? 'A line under it (34 letters at most)' : 'A line under it (40 letters at most)', value: '', max: village ? 34 : 40 },
    { key: 'url', label: 'Your website (https://…) — optional: visitors open it from your place', value: '', max: 200, hint: 'https://', fill: fromSite({ name: village ? 22 : 28, line: village ? 34 : 40, logo: !village, enter: true }) },
    ...(village ? [] : [{ key: 'logo', label: 'Your logo (PNG, JPEG or WebP) — it can also be added later', type: 'file' }]),
  ];
  /** Keeps what the form of a sponsor brought back, for after the payment. False when something is wrong (and said). */
  const keepSponsor = async (id, got) => {
    if (!got.title) { hud.note('A name is needed: it is what your place will say.', 5000); return false; }
    const url = String(got.url || '').trim();
    if (url && !/^https:\/\//i.test(url)) { hud.note('The link must start with https://', 5000); return false; }
    let logo = null;
    if (got.logo) { logo = await logoData(got.logo, 256, false); if (!logo) { hud.note('That picture cannot be used: a PNG, a JPEG or a WebP, please.', 6000); return false; } }
    store.set(SPONSOR_DRAFT, JSON.stringify({ id, title: got.title, subtitle: got.subtitle || '', url, logo, at: Date.now() }));
    return true;
  };
  /** What was kept for the place `id` (a day at the most), or null. */
  const keptSponsor = (id) => { try { const d = JSON.parse(store.get(SPONSOR_DRAFT)); return d && d.id === id && Date.now() - d.at < 86_400_000 ? d : null; } catch { return null; } };
  /**
   * A place held by the month (a gondola, a backdrop) — or, `life`, bought for good and paid once (a gondola):
   * what it will show, then off to the payment page.
   */
  const sponsorOffer = async (id, what, cents, life = false) => {
    if (!shop.open) { hud.note('The shop is not open yet. Come back soon!', 5200); return; }
    const terms = life ? `${price(cents)}, once, and it is yours for good — nothing to renew, nothing to stop` : `${price(cents)} a month, for as long as you like`;
    const got = await hud.form(life ? `Buy ${what}` : `Sponsor ${what}`, `${terms}: your name, a line under it, your logo and a link, shown to every visitor. Say what it should show, then pay: it goes up the moment you are back. ${shop.mode === 'test' ? 'Test mode: no real money.' : 'Paid on Stripe.'}`,
      sponsorFields(), life ? `Go to payment · ${price(cents)}, once` : `Go to payment · ${price(cents)} a month`);
    if (!got || !(await keepSponsor(id, got))) return;
    hud.note('Opening the payment page…', 8000);
    const wrong = await shop.buy(id, 0, life);
    if (wrong) hud.note(wrong, 7000);
  };
  /** What can be done about the place `id`, for who stands by it: [{ label, run }] */
  /** A bid for the panel of a game: how much, then off to the payment page. */
  const bidFor = async (id) => {
    if (!shop.open) { hud.note('The shop is not open yet. Come back soon!', 5200); return; }
    const rot = places.get(id)?.rotor;
    if (rot && id === rot.ids[0]) id = targetOf(rot);
    const place = places.get(id), view = shop.slots[id], least = shop.least(id);
    const shared = rot ? ` Up to ${rot.ids.length} sponsors: the highest bid has the panel over the board of scores, and all ${rot.ids.length} are on the board beside it — ${rot.ids.filter((k) => !shop.slots[k]).length} of the places are free.` : '';
    const got = await hud.form(`Sponsor ${GAME_NAMES[gameOf(id)] || place.what}`,
      `${view ? `${rot ? 'Its five places are taken; the least paid for went for' : 'Its sponsor paid'} ${price(view.bid || 0)}: bid at least ${price(least)} and ${rot ? 'that place' : 'the panel'} is yours.` : `${rot ? 'A place is free' : 'Nobody sponsors it yet'}: the first bid is ${price(least)}.`}${shared} You pay once and keep the panel — your name, a line, your logo, a link — until somebody bids more. That day you are refunded in full, automatically, and they take your place. Say what it should show, then pay: it goes up the moment you are back.`,
      [...sponsorFields(), { key: 'bid', label: `Your bid, in US dollars (at least ${price(least)})`, value: String(least / 100), max: 9 }], 'Go to payment');
    if (!got) return;
    const bid = Math.round(Number(String(got.bid).replace(',', '.').replace(/[^0-9.]/g, '')) * 100);
    if (!Number.isFinite(bid) || bid < least) { hud.note(`The bid must be at least ${price(least)}.`, 5000); return; }
    if (!(await keepSponsor(id, got))) return;
    hud.note('Opening the payment page…', 8000);
    const wrong = await shop.buy(id, bid);
    if (wrong) { hud.note(wrong, 7000); refreshShop(); }
  };
  const placeActions = (id, row = '') => {
    const rot = places.get(id)?.rotor;
    if (!rot || id !== rot.ids[0]) return placeActionsOne(id, row);
    // (the panel of a big attraction: one's own place first; otherwise a bid — for the first free place, or
    // against the one that went for the least — and the site of the sponsor shown just now)
    const own = rot.ids.find((k) => shop.slots[k]?.mine);
    if (own) return placeActionsOne(own, row);
    const out = [], place = places.get(id), free = rot.ids.filter((k) => !shop.slots[k]), cur = shop.slots[rot.current];
    const target = targetOf(rot);
    if (who.admin && shop.open) out.push({ label: 'Fill a place in (administrator)', run: () => fillPlace(target) });
    if (shop.open && out.length < 2) out.push({ label: free.length ? `Sponsor ${place.what} · from ${price(shop.least(target))}` : `Outbid a sponsor · from ${price(shop.least(target))}`, run: () => bidFor(id) });
    if (cur?.state === 'live' && cur.url) out.push({ label: `Visit ${cur.title}`, run: () => visitSponsor(rot.current, cur.url) });
    return out;
  };
  const placeActionsOne = (id, row = '') => {
    const place = places.get(id), view = shop.slots[id], out = [];
    const cents = shop.cost(id, place.village?.tier);
    if (who.admin && pending[id]?.draft) {
      const d = pending[id].draft;
      out.push({ label: `Approve "${d.title}"`, run: async () => { await shop.decide(id, true, who.key); pending = (await shop.all(who.key)) || {}; await refreshShop(); hud.note('Approved: it is shown to everyone.', 5000); } });
      out.push({ label: 'Refuse it', run: async () => { await shop.decide(id, false, who.key); pending = (await shop.all(who.key)) || {}; await applySponsors(); hud.note('Refused.', 4000); } });
      return out;
    }
    if (place.plaque) {
      // a plaque for a companion — one who is here as much as one who is missed: nothing it says reads as a memorial only —:
      // paid once; its holder has it engraved (and may change it); the administrator may fill one in
      if (view?.mine) out.push({ label: view.draft ? 'Change what you sent for your plaque' : view.state === 'live' ? 'Change your plaque' : 'Have your plaque engraved', run: () => fillPlace(id) });
      else if (who.admin && shop.open) out.push({ label: `Fill the ${row} plaque in (administrator)`, run: () => fillPlace(id) });
      else if (!view && shop.open) out.push({ label: `The ${row} plate, for your companion · ${price(cents)}`, run: () => offer(id, 'A plaque for a companion', `For your companion — here with you, or missed: the plates are an ode to life. ${price(cents)}, once, and this plate is theirs for as long as the fair stands: their name, a few words and their picture if you like, ${place.wall ? 'on the wall of the companions, round the best dog ever' : 'at the feet of the best dog ever'}. You write it right after paying; it is engraved as soon as the fair has looked at it.`, cents, false) });
      return out;
    }
    if (view?.mine || (who.admin && shop.open)) out.push({ label: view?.mine ? (view.draft ? 'Change what you sent' : 'Set up your panel') : 'Fill this place in (administrator)', run: () => fillPlace(id) });
    if (view?.mine && view.manage && out.length < 2) out.push({ label: 'Look after it, or stop it (Stripe)', run: async () => { hud.note('Opening the page of your subscription…', 8000); const wrong = await shop.portal(id); if (wrong) hud.note(wrong, 7000); } });
    if (view?.state === 'live' && view.url) out.push({ label: `Visit ${view.title}`, run: () => visitSponsor(id, view.url) });
    if (id.startsWith('board:')) {
      // the panel of a game goes to the highest bidder: from one dollar; whoever is outbid is refunded
      if (shop.open && !view?.mine && out.length < 2) out.push({ label: view ? `Outbid the sponsor · from ${price(shop.least(id))}` : `Sponsor ${place.what} · from ${price(shop.least(id))}`, run: () => bidFor(id) });
    } else if (!view && shop.open) {
      // a place nobody holds: taken by the month — and a gondola may be bought for good instead, paid once: the
      // buyer chooses. (The administrator may pay for one like anybody: only "fill it in" was offered to them
      // once, and the owner of the fair could not buy a gondola of their own wheel.)
      out.push({ label: `Sponsor ${place.what} · ${price(cents)} a month`, run: () => sponsorOffer(id, place.what, cents) });
      const life = shop.lifeCost(id);
      if (life) out.push({ label: `Buy ${place.what} for good · ${price(life)}, once`, run: () => sponsorOffer(id, place.what, life, true) });
    }
    return out;
  };
  // (by the board of the five sponsors of a big attraction — nearer it than the board of scores —: who they are, and the way to join them)
  const byRoll = (p, sl) => !!sl.rollAt && Math.abs(p.pos.y - sl.y) < 2.5 && near(p, [sl.rollAt.x, sl.rollAt.z], sl.rollAt.reach)
    && (p.pos.x - sl.rollAt.x) ** 2 + (p.pos.z - sl.rollAt.z) ** 2 < (p.pos.x - sl.x) ** 2 + (p.pos.z - sl.z) ** 2;
  world.actionSources.push((p) => {
    for (const sl of world.sponsorSlots || []) if (Math.abs(p.pos.y - sl.y) < 2.5 && near(p, [sl.x, sl.z], sl.reach) && !byRoll(p, sl)) return placeActions(sl.id)[0] || null;
    return null;
  });
  world.actionSources.push((p) => {
    for (const sl of world.sponsorSlots || []) if (Math.abs(p.pos.y - sl.y) < 2.5 && near(p, [sl.x, sl.z], sl.reach) && !byRoll(p, sl)) return placeActions(sl.id)[1] || null;
    return null;
  });
  /** The five sponsors of a big attraction, in a list one reads — the most generous first —: a click opens a site (counted for them). */
  const openRoll = (slotId) => {
    const rot = places.get(slotId)?.rotor, name = GAME_NAMES[gameOf(slotId)] || 'this game';
    if (!rot) return;
    const live = rot.ids.filter((k) => shop.slots[k]?.state === 'live').sort((a, b) => weightOf(b) - weightOf(a));
    if (!live.length) { hud.note(`Nobody sponsors ${name} yet. ${shop.open ? `The first bid is ${price(shop.least(targetOf(rot)))}: step up to its board of scores.` : 'Sponsoring starts soon.'}`, 6000); return; }
    const rows = live.map((k) => { const v = shop.slots[k], w = weightOf(k); return { name: v.title, tagline: v.subtitle || '', url: v.url || '', site: siteWords(v.url), clicks: v.clicks || 0, logo: v.logo || null, figure: w > 0 ? price(w) : '', unit: '', note: '', where: k === rot.current ? 'on the panel over the board' : '' }; });
    hud.thanks(`The sponsors of ${name}`, `The highest bid has the panel over the board of scores; all ${rot.ids.length} places are on the board beside it. Pick a sponsor to open its site: it is counted for them.`, rows)
      .then((i) => { if (i === null) return; const id = live[i], v = shop.slots[id]; if (v?.url) { visitSponsor(id, v.url); setTimeout(() => refreshShop(), 1500); } else if (v) hud.note(`${v.title} gave no site.`, 4000); });
  };
  world.actionSources.push((p) => { for (const sl of world.sponsorSlots || []) if (byRoll(p, sl)) return { label: `The sponsors of ${GAME_NAMES[gameOf(sl.id)] || 'this game'}`, run: () => openRoll(sl.id) }; return null; });
  world.actionSources.push((p) => { for (const sl of world.sponsorSlots || []) if (byRoll(p, sl)) return placeActions(sl.id)[0] || null; return null; });
  // the plaques of the companions: the two plates in front of whoever stands by the plinth (the upper, then the lower)
  const plateActions = (two, where) => {
    const out = [];
    // (with flowers in hand: they can be left under a plate that has a name on it)
    const named = two.find((q) => shop.slots[q.id]?.state === 'live');
    if (look.bouquet && named) out.push({ label: `Lay your bouquet for ${shop.slots[named.id].title}`, run: () => {
      const w = where(named.n);
      look.bouquet = false; look.kinds = undefined;
      audio.play('pick');
      world.sparks.glitter(w.x, w.y, w.z, 0.9, 50);
      hud.note(`For ${shop.slots[named.id].title}. Good companions are never very far.`, 5200);
    } });
    for (const q of two) out.push(...placeActions(q.id, q.row));
    return out;
  };
  const plaqueActions = (p) => {
    if (!plaques || Math.abs(p.pos.y - plaques.y) > 2.5) return [];
    const col = plaques.columnAt(p.pos.x, p.pos.z);
    return col === null ? [] : plateActions(plaques.ids(col), (n) => plaques.where(n));
  };
  world.actionSources.push((p) => plaqueActions(p)[0] || null);
  world.actionSources.push((p) => plaqueActions(p)[1] || null);
  // …and on the wall of the companions, in the cliff round the dog (PlacesZone.buildWall, PlaqueWall.js): built — and
  // loaded — the first time its switch is on; its plates are places like those of the plinth (plaque:73 and on),
  // offered on its galleries while it is on. Off, it goes at once (whoever stands on it is put back at the foot of
  // its stair); the plates keep what they hold.
  // (resumedAt: where a page that came back — from the payment page, a new version — had its visitor standing, which
  // way they looked, and when)
  let plateWall = null, walling = null, wallWanted = false, resumedAt = null;
  const toFoot = () => { const f = plateWall.foot; player.teleport(f.x, f.z, f.yaw); rig.snap(player.pos, f.yaw + Math.PI); };
  // (a visitor who came back where they stood on the wall had nothing to stand on until it was there: they slid down the
  // rock — put back up there, on the floor they were on, looking the way they looked, if that was a moment ago and they
  // are still just below it, not sitting anywhere)
  const putBack = () => {
    const back = resumedAt;
    resumedAt = null;
    if (!back || performance.now() - back.at > 60_000 || !plateWall.holds(back.x, back.z, back.y)) return false;
    const p = player.pos, h = plateWall.heightNear(back.x, back.z, back.y);
    if (h === null || player.dead || player.seat || player.cross || player.riding || Math.hypot(p.x - back.x, p.z - back.z) > 14 || p.y > back.y - 0.5 || p.y < plateWall.foot.y - 1) return false;
    player.teleport(back.x, back.z, back.yaw + Math.PI, h);
    rig.snap(player.pos, back.yaw);
    return true;
  };
  const setWall = (on) => {
    const was = plateWall.on;
    if (!on && was && plateWall.holds(player.pos.x, player.pos.z, player.pos.y)) { plateWall.setOn(false); toFoot(); return; }
    // (coming up, the wall may find somebody in its way — up against where its walls go, or where its lowest flight
    // stands: they step aside to the foot of its stair first)
    const inWay = on && !was && plateWall.crowds(player.pos.x, player.pos.z, player.pos.y);
    plateWall.setOn(on);
    if (on && !was && !putBack() && inWay) toFoot();
  };
  const plaqueWall = (on) => {
    wallWanted = !!on;
    if (plateWall) { setWall(wallWanted); return Promise.resolve(plateWall); }
    if (!wallWanted) return Promise.resolve(null);
    return (walling ||= world.places.buildWall().then(async (w) => {
      plateWall = w;
      for (let n = w.first; n < w.first + w.count; n++) places.set(`plaque:${n}`, { what: 'a plaque on the wall of the companions', plaque: n, wall: true, set: (sp) => w.set(n, sp) });
      setWall(wallWanted); // (the switch may have moved while it was being built)
      await applySponsors();
      return w;
    }).catch((err) => { if (!plateWall) walling = null; console.error('[wall]', err); return plateWall; }));
  };
  const wallActions = (p) => {
    const col = plateWall?.on ? plateWall.columnAt(p.pos.x, p.pos.z, p.pos.y) : null;
    return col ? plateActions(plateWall.ids(col), (n) => plateWall.where(n)) : [];
  };
  world.actionSources.push((p) => wallActions(p)[0] || null);
  world.actionSources.push((p) => wallActions(p)[1] || null);
  Object.assign(app, { plaqueWall });
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
  // the Trading Post, on the plaza at the foot of the pier: every game on a card — a photograph of it, who
  // sponsors it, the way to take its panel (ui/SponsorsView.js)
  // (the big attractions — five sponsors each — first, then the stalls of the pier)
  const boardIds = () => Object.keys(GAME_NAMES).sort((a, b) => (MAJOR_GAMES.includes(a) ? MAJOR_GAMES.indexOf(a) : 99) - (MAJOR_GAMES.includes(b) ? MAJOR_GAMES.indexOf(b) : 99)).map((k) => `board:${k}`).filter((id) => places.has(id));
  const adRows = () => boardIds().map((id) => { const v = shop.slots[id]; return { game: GAME_NAMES[id.split(':')[1]], sponsor: v?.state === 'live' ? v.title : '', offer: shop.open ? `from ${price(shop.least(id))}` : 'free' }; });
  // the stand of the wheel: its gondolas, who sponsors them, which are free
  const gondolaIds = () => Array.from({ length: world.pier.gondolas || 0 }, (_, k) => `gondola:${k + 1}`);
  /** What a gondola costs, in words: by the month — or for good. */
  const gondolaTerms = () => `${price(shop.prices.gondola)} a month${shop.prices.gondolaLife ? `, or ${price(shop.prices.gondolaLife)} for good` : ''}`;
  const chooseGondola = () => {
    const ids = gondolaIds();
    const say = (id) => { const v = shop.slots[id], d = who.admin && pending[id]?.draft; return d ? `Awaiting approval: ${d.title}` : v?.mine ? (v.life ? 'Yours for good: set it up' : 'Yours: set it up') : v?.state === 'live' ? v.title : v ? 'Taken' : shop.open ? `Free · ${gondolaTerms()}` : 'Free'; };
    hud.choose('The gondolas of the big wheel', 'Twenty-four gondolas, a banner on each: its sponsor goes round with the wheel, in sight of the whole bay.', ids.map((id, k) => ({ label: `Gondola ${k + 1}`, note: say(id), color: shop.slots[id]?.state === 'live' ? [0.9, 0.7, 0.2] : [0.5, 0.55, 0.6] })))
      .then((i) => {
        if (i === null) return;
        const acts = placeActions(ids[i]);
        if (!acts.length) { hud.note(shop.open ? 'That one is taken.' : 'The shop is not open yet. Come back soon!', 4000); return; }
        if (acts.length === 1) { acts[0].run(); return; }
        // (several things can be done about it — by the month or for good; the administrator may also fill it in —: one chooses)
        hud.choose(`Gondola ${i + 1}`, shop.slots[ids[i]] ? 'What would you like to do with it?' : 'It is free. By the month, you stop whenever you like; for good, you pay once and it goes round with your banner for as long as the fair stands.',
          acts.map((a) => (/for good/.test(a.label) ? { label: `For good · ${price(shop.prices.gondolaLife)}`, note: 'Paid once — yours to keep', color: [0.9, 0.7, 0.2] }
            : /a month$/.test(a.label) ? { label: `By the month · ${price(shop.prices.gondola)}`, note: 'Stop whenever you like' }
              : /administrator/.test(a.label) ? { label: 'Fill it in (administrator)', note: 'By hand, for nothing' } : { label: a.label, note: '' })))
          .then((k) => { if (k !== null && acts[k]) acts[k].run(); });
      });
  };
  world.actionSources.push((p) => (world.pier.sponsorBooth && near(p, world.pier.sponsorBooth, 2.6) ? { label: 'The gondolas and their sponsors', run: chooseGondola } : null));
  // the beach huts: a panel on each roof, by the month or for good — chosen on the sand by the hut itself, or
  // from the list of the Trading Post (not among world.sponsorSlots: they stand close together, and the nearest
  // is the one meant)
  const hutIds = () => Array.from({ length: world.pier.huts || 0 }, (_, k) => `hut:${k + 1}`);
  /** What a beach hut costs, in words: by the month — or for good. */
  const hutTerms = () => `${price(shop.prices.hut)} a month${shop.prices.hutLife ? `, or ${price(shop.prices.hutLife)} for good` : ''}`;
  const hutActions = (p) => { const n = world.pier.hutAt?.(p.pos.x, p.pos.z, p.pos.y) || 0; return n ? placeActions(`hut:${n}`) : []; };
  world.actionSources.push((p) => hutActions(p)[0] || null);
  world.actionSources.push((p) => hutActions(p)[1] || null);
  const chooseHut = () => {
    const ids = hutIds();
    const say = (id) => { const v = shop.slots[id], d = who.admin && pending[id]?.draft; return d ? `Awaiting approval: ${d.title}` : v?.mine ? (v.life ? 'Yours for good: set it up' : 'Yours: set it up') : v?.state === 'live' ? v.title : v ? 'Taken' : shop.open ? `Free · ${hutTerms()}` : 'Free'; };
    hud.choose('The beach huts', `${ids.length} beach huts on the sand, either side of the pier, numbered from the north: a panel on each roof, in sight of the whole boardwalk.`, ids.map((id, k) => ({ label: `Beach hut ${k + 1}`, note: say(id), color: shop.slots[id]?.state === 'live' ? [0.9, 0.7, 0.2] : [0.5, 0.55, 0.6] })))
      .then((i) => {
        if (i === null) return;
        const acts = placeActions(ids[i]);
        if (!acts.length) { hud.note(shop.open ? 'That one is taken.' : 'The shop is not open yet. Come back soon!', 4000); return; }
        if (acts.length === 1) { acts[0].run(); return; }
        hud.choose(`Beach hut ${i + 1}`, shop.slots[ids[i]] ? 'What would you like to do with it?' : 'It is free. By the month, you stop whenever you like; for good, you pay once and your panel stays on its roof for as long as the fair stands.',
          acts.map((a) => (/for good/.test(a.label) ? { label: `For good · ${price(shop.prices.hutLife)}`, note: 'Paid once — yours to keep', color: [0.9, 0.7, 0.2] }
            : /a month$/.test(a.label) ? { label: `By the month · ${price(shop.prices.hut)}`, note: 'Stop whenever you like' }
              : /administrator/.test(a.label) ? { label: 'Fill it in (administrator)', note: 'By hand, for nothing' } : { label: a.label, note: '' })))
          .then((k) => { if (k !== null && acts[k]) acts[k].run(); });
      });
  };
  {
    // thirty things left over from the world before (zones/games/Relics.js): looked at, each has a word to say —
    // and which ones were looked at is remembered, to say when all of them were
    const relics = world.games.relics, seen = new Set((store.get('mmf.relics') || '').split(',').filter((id) => relics.list.some((q) => q.id === id)));
    world.actionSources.unshift((p) => { // (before the flowers at its foot)
      const q = relics.near(p.pos.x, p.pos.z);
      if (!q || Math.abs(p.pos.y - q.y) > 2.5) return null;
      return { label: `Look at ${q.label}`, run: () => {
        const first = !seen.has(q.id), all = relics.list.length;
        seen.add(q.id);
        if (first) { store.set('mmf.relics', [...seen].join(',')); hud.setMushroom(seen.size, all); hud.relicFound(seen.size, all); }
        hud.note(`${q.text}${!first ? '' : seen.size >= all ? ` — That was the last of the ${all} relics of the world before. Now you know — and the mushroom cloud is yours: in the emotes (T).` : ` — Relic ${seen.size} of ${all}.`}`, 12000);
        audio.play('tick');
        // (the last one found: the cloud goes up at once — and from now on whenever they like)
        if (first && seen.size >= all) { rank.play('mushroom', me.root); audio.play('boom', { volume: 0.5, rate: 1.7 }); audio.play('victory'); presence?.sendEmote(MUSHROOM); }
      } };
    });
    hud.setMushroom(seen.size, relics.list.length);
    // (how many there are, and that they are worth finding: said by the small count at the top left when it is
    // pressed — and once to whoever arrives, a few seconds after the gate, for as long as some are still to be
    // found: see `relicsHello`. What the bonus is, is not said: the owner wants it kept for who earns it)
    const relicsWord = () => {
      const all = relics.list.length, n = seen.size;
      return n >= all ? `You have found the ${all} relics of the world before: the mushroom cloud is yours, in the emotes (T).`
        : `☢ ${all} relics of the world before are hidden all over the oasis — things that do not belong here: by the paths, on the pier and under it, on the islands, in the caves. Walk up to one and look at it. ${n ? `You have found ${n} of ${all}` : 'Find them all'}: whoever finds every one earns a bonus that sets them truly apart from everybody else.`;
    };
    hud.on('relics', () => hud.note(relicsWord(), 11000));
    app.relicsHello = () => { if (seen.size < relics.list.length && state.mode === 'walk' && !fair.session && !player.driver) hud.note(relicsWord(), 11000); };
    // the mushroom cloud of those who found them all, made of light like the animals, in their ring over their head —
    // the flash, the stem that rises drum by drum, the cap whose rim rolls, the embers (player/RankAnimals.js) —, and
    // a small boom; everybody near sees it (its tile is the last of the animals of light, in the emotes)
    let cloudAt = -10;
    app.mushroom = () => {
      if (state.mode !== 'walk' || player.dead || fair.session) return;
      if (seen.size < relics.list.length) { hud.note(`The mushroom cloud is for those who found the ${relics.list.length} relics of the world before: you have found ${seen.size}. Look for what does not belong here.`, 7000); return; }
      if (state.time - cloudAt < 5) return; // (one at a time: it lasts five seconds)
      cloudAt = state.time;
      rank.play('mushroom', me.root);
      audio.play('boom', { volume: 0.5, rate: 1.7 });
      presence?.sendEmote(MUSHROOM);
    };
    // (the periscope of the hidden shelter looks at whoever comes near)
    world.zones.push({ update: () => relics.watch(player.pos.x, player.pos.z) });
  }
  const photographer = new Photographer(engine);
  // (the ground is chosen piece by piece for the eye that looks, and so are the trees: without this a photograph
  // taken far from the player had no ground under it — white where the meadow should be)
  photographer.prepare = (cam) => { world.terrain.update(cam); world.forest.update(cam); };
  /** A photograph of a game as it stands right now: from in front of it, a little to the side. */
  const photoOf = (key) => {
    const b = world.games.booths.list.find((q) => q.id === key), W = 480, H = 300;
    if (b) {
      const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), sx = Math.cos(b.yaw), sz = -Math.sin(b.yaw);
      // (the stalls along the walk face each other: no room to step back, so a wider eye, closer)
      const [out, side, up, fov] = Math.abs(b.side) < 10 ? [5.5, 2.7, 2.5, 70] : [9.5, 3.2, 2.6, 50];
      return photographer.shoot([b.x + fx * out + sx * side, b.y + up, b.z + fz * out + sz * side], [b.x - fx * 0.8, b.y + 1.9, b.z - fz * 0.8], W, H, fov);
    }
    const cab = world.games.notices.arcade;
    if (key === 'run') return photographer.shoot([cab.x + 1.6, PIER.deckY + 1.7, cab.z + 3.0], [cab.x, PIER.deckY + 1.35, cab.z], W, H, 50);
    if (key === 'wing') return photographer.shoot([WING.x + 11.2, 5.6, WING.z - 9.6], [WING.x, 5.8, WING.z], W, H, 50);
    if (key === 'sky') return photographer.shoot([CLIMB.x + 3, CLIMB.y + 1.6, CLIMB.z - 12], [CLIMB.x, CLIMB.y + 20, CLIMB.z], W, H, 78); // (from the foot of the climb, looking up its stones)
    if (key === 'race') { const pd = world.games.race.paddock, g = world.groundAt(pd.x, pd.z); return photographer.shoot([pd.x - 14, g + 3.6, pd.z + 9], [pd.x + 2, g + 2, pd.z - 3], W, H, 56); }
    // (a game of the lab: the whole of it — its slide, its ponds, its slope, its rock — from the side of its
    // board, far enough to hold it all; failing that, its gate and its board from a few steps away)
    const stand = fair.stands[key], game = app.extras?.[key], gate = game && (game.gate || game.stand);
    if (stand && gate) {
      const bx = stand.board.mesh.position.x, bz = stand.board.mesh.position.z, mx = (bx + gate.x) / 2, mz = (bz + gate.z) / 2, g = world.groundAt(mx, mz);
      const box = game.group ? new THREE.Box3().setFromObject(game.group) : null;
      if (box && !box.isEmpty()) {
        const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
        let dx = bx - c.x, dz = bz - c.z;
        // (what lies flat — ponds, a circuit on the water — is looked down upon; what stands — a slide, a rock — is looked at from in front)
        const dl = Math.hypot(dx, dz) || 1, R = Math.hypot(s.x, s.z) / 2, flat = s.y < R * 0.5;
        const far = Math.min(95, flat ? R * 0.85 + 5 : Math.max(R * 1.16, s.y * 0.9) + 7);
        dx /= dl; dz /= dl;
        const fx = c.x + dx * far, fz = c.z + dz * far, fy = flat ? Math.max(world.groundAt(fx, fz) + 3, c.y + R * 0.6 + 5) : Math.max(world.groundAt(fx, fz) + 2.6, c.y + Math.max(2.5, s.y * 0.25));
        return photographer.shoot([fx, fy, fz], [c.x, c.y - s.y * 0.08, c.z], W, H, 60);
      }
      const nx = Math.sin(stand.board.mesh.rotation.y), nz = Math.cos(stand.board.mesh.rotation.y);
      return photographer.shoot([mx + nx * 11, g + 3.4, mz + nz * 11], [mx, g + 2.2, mz], W, H, 58);
    }
    return null;
  };
  const openTrading = () => {
    if (sponsorsView.isOpen || fair.session) return;
    hud.closeAll();
    input.exitLock();
    input.keys.clear(); // (nothing stays pressed behind the window)
    const first = (a) => (/^Visit /.test(a.label) ? 1 : 0); // (what one comes for first: the panel; its sponsor's site after)
    const cards = boardIds().map((card) => {
      // (a big attraction has five places on its panel: one's own is shown, or the best-paid of them; the others are counted)
      const key = card.split(':')[1], rot = places.get(card)?.rotor, ids = rot ? rot.ids : [card], held = ids.filter((k) => shop.slots[k]);
      const byBid = held.slice().sort((a, b) => (shop.slots[b].bid || 0) - (shop.slots[a].bid || 0)), id = ids.find((k) => shop.slots[k]?.mine) || byBid[0] || card;
      const v = shop.slots[id], d = who.admin && pending[id]?.draft;
      const state = d ? 'pending' : v?.mine ? 'mine' : v?.state === 'live' ? 'live' : v ? 'taken' : 'free';
      const sponsor = d ? { title: d.title, subtitle: d.subtitle } : v?.state === 'live' ? { title: v.title, subtitle: v.subtitle, logo: v.logo, url: v.url, site: siteWords(v.url), clicks: v.clicks || 0 } : null;
      const says = !shop.open ? '' : rot ? `${held.length} of ${ids.length} places taken · from ${price(shop.least(ids.find((k) => !shop.slots[k]) || byBid[byBid.length - 1] || card))}` : !v ? `From ${price(shop.least(id))}` : v.mine ? '' : `Its sponsor paid ${price(v.bid || 0)}`;
      return { id: card, name: GAME_NAMES[key], state, sponsor, price: says, acts: placeActions(card).sort((a, b) => first(a) - first(b)), photo: () => photoOf(key), stamp: `${state}|${sponsor?.title || ''}|${sponsor?.logo || ''}|${v?.bg || ''}` };
    });
    const extras = [];
    const gondolas = gondolaIds(), freeG = gondolas.filter((id) => !shop.slots[id]).length;
    // the gondolas somebody holds, each by its number and photographed as it goes round: a sponsor sees which is theirs
    const cars = gondolas.filter((id) => shop.slots[id] || (who.admin && pending[id]?.draft)).map((id) => {
      const n = +id.split(':')[1], v = shop.slots[id], d = who.admin && pending[id]?.draft;
      const state = d ? 'pending' : v?.mine ? 'mine' : v?.state === 'live' ? 'live' : 'taken';
      const sponsor = d ? { title: d.title, subtitle: d.subtitle } : v?.state === 'live' ? { title: v.title, subtitle: v.subtitle, logo: v.logo, url: v.url, site: siteWords(v.url), clicks: v.clicks || 0 } : null;
      const photo = () => { const g = world.pier.gondolaView(n); return photographer.shoot(g.from, g.at, 480, 300, 46); };
      // (the wheel turns: its photograph is taken again when the window is opened a while later)
      return { id, name: `Gondola ${n}`, state, sponsor, price: shop.open ? gondolaTerms() : '', acts: placeActions(id).sort((a, b) => first(a) - first(b)), photo, stamp: `${state}|${sponsor?.title || ''}|${sponsor?.logo || ''}|${v?.bg || ''}|${Math.floor(Date.now() / 30_000)}` };
    });
    if (gondolas.length) extras.push({ title: 'The big wheel', text: `${gondolas.length} gondolas, a banner on each, in sight of the whole bay · ${freeG} free${shop.open ? ` · ${gondolaTerms()}` : ''}`, act: { label: 'Choose a gondola', run: chooseGondola } });
    // the beach huts somebody holds, each by its number and photographed from the boardwalk
    const hutList = hutIds(), freeH = hutList.filter((id) => !shop.slots[id]).length;
    const huts = hutList.filter((id) => shop.slots[id] || (who.admin && pending[id]?.draft)).map((id) => {
      const n = +id.split(':')[1], v = shop.slots[id], d = who.admin && pending[id]?.draft;
      const state = d ? 'pending' : v?.mine ? 'mine' : v?.state === 'live' ? 'live' : 'taken';
      const sponsor = d ? { title: d.title, subtitle: d.subtitle } : v?.state === 'live' ? { title: v.title, subtitle: v.subtitle, logo: v.logo, url: v.url, site: siteWords(v.url), clicks: v.clicks || 0 } : null;
      const photo = () => { const g = world.pier.hutView(n); return g ? photographer.shoot(g.from, g.at, 480, 300, 46) : null; };
      return { id, name: `Beach hut ${n}`, state, sponsor, price: shop.open ? hutTerms() : '', acts: placeActions(id).sort((a, b) => first(a) - first(b)), photo, stamp: `${state}|${sponsor?.title || ''}|${sponsor?.logo || ''}|${v?.bg || ''}` };
    });
    if (hutList.length) extras.push({ title: 'The beach huts', text: `${hutList.length} huts on the sand either side of the pier, a panel on each roof · ${freeH} free${shop.open ? ` · ${hutTerms()}` : ''}`, act: { label: 'Choose a beach hut', run: chooseHut } });
    if (places.has('tarp:shoot')) { const v = shop.slots['tarp:shoot'], act = placeActions('tarp:shoot')[0]; extras.push({ title: 'The backdrop of Bullseye Alley', text: v?.state === 'live' ? `Held by ${v.title}.` : `The whole wall behind the targets${shop.open && !v ? ` · ${price(shop.prices.tarp)} a month` : v ? ' · taken' : ''}`, act: act ? { label: act.label.length > 34 ? 'Take the backdrop' : act.label, run: act.run } : null }); }
    if (plaques?.count) {
      // (with the wall of the companions when it is on: its plates go on from the plinth's)
      const more = plateWall?.on ? plateWall.count : 0, taken = Array.from({ length: plaques.count + more }, (_, k) => `plaque:${k + 1}`).filter((id) => shop.slots[id]).length;
      extras.push({ title: 'A plaque for a companion', text: `For your companion — here with you, or missed. ${plaques.count} brass plates round the golden dog${more ? ` and ${more} more on the wall of the companions round it` : ''}, ${taken} of them taken${shop.open ? ` · ${price(shop.prices.plaque)}, once` : ''}. They are chosen on the spot: swim north along the cliffs to the Golden Cove, then climb.`, act: null });
    }
    sponsorsView.open({ cards, wheel: { cards: cars, of: gondolas.length }, beach: { cards: huts, of: hutList.length }, extras, note: shop.open ? '' : 'The shop is not open yet: sponsoring starts soon. Meanwhile, here is every game and who sponsors it.' });
    audio.play('pick');
  };
  sponsorsView.on('close', () => { document.getElementById('view')?.focus({ preventScroll: true }); });
  world.actionSources.unshift((p) => { // (the first thing to do at the booth, whatever grows at its foot)
    const ads = world.games.notices.ads;
    return near(p, [ads.x, ads.z], ads.reach) ? { label: 'The games and their sponsors', run: openTrading } : null;
  });
  Object.assign(app, { sponsorsView, openTrading, openThanks });
  // ---------- what is released, and new versions (app/Updates.js; the switches: RELEASE in app/config.js)
  // The extras of src/extras are loaded when their switch is on — as the game runs when it goes on later;
  // one that goes off again is only undone by loading the page again.
  const EXTRA = ['slide', 'pond', 'boats', 'hill', 'crack', 'hollow', 'waves', 'lava', 'hive', 'flip', 'spiral', 'cars', 'golf', 'ages', 'raft', 'walls', 'sneak', 'mine', 'coaster', 'sanctuary', 'guide', 'caves', 'stats'];
  // (the games among them — each says, while one of its runs is on, which run: app.slideRide(), app.pondRun()…;
  // the seven with a gate are plugged in the same way, by src/extras/plug.js: app.wavesRun(), app.lavaRun()…)
  const LAB_GAMES = {
    slide: 'slideRide', pond: 'pondRun', boats: 'boatRace', hill: 'hillClimb', crack: 'cleftClimb', hollow: 'hollowFlight',
    waves: 'wavesRun', lava: 'lavaRun', hive: 'hiveRun', flip: 'flipRun', spiral: 'spiralRun', cars: 'carsRun', golf: 'golfRun',
    ages: 'agesRun', raft: 'raftRun', walls: 'wallsRun', sneak: 'sneakRun', mine: 'mineRun', coaster: 'coasterRun',
  };
  const labBusy = () => Object.values(LAB_GAMES).some((run) => !!app[run]?.());
  const applyRelease = (release, before) => {
    const on = Object.fromEntries(EXTRA.map((k) => [k, release[k] === true]));
    if (EXTRA.some((k) => on[k])) import('./extras/index.js').then(({ loadExtras }) => loadExtras(app, on)).then(() => extrasBuilt()).catch((err) => console.error('[extras]', err));
    hud.setStars(release.stars !== false); // (the stars of the map: the owner's switch)
    world.games.notices.setNews(release.newsBoards !== false); // (the boards of what is new by the poppy field: taken away, or put back, at once)
    plaqueWall(release.plaqueWall === true); // (the wall of the companions: built the first time, then shown or taken away at once)
    // (the rooms that players make: their card in the shop and their corner of "Who is here" come and go with the switch)
    if (!before || before.userRooms !== release.userRooms) queueMicrotask(() => refreshMine(release.userRooms === true));
    // (the sky is built with the world: another stage of it is another world)
    return !!before && (EXTRA.some((k) => before[k] === true && !on[k]) || (before.sky !== undefined && before.sky !== release.sky));
  };
  // ---- the games of the lab, once built: each gets a board like every game's (the four lists; over it the panel
  // of a sponsor, for sale like the others), the map a star, the forks of the paths a plank that points to it.
  // `at`: where the board stands from the gate of its game — metres to the right of one who looks the way the
  // gate looks (at the game), metres along that way, and how far the board is turned from facing those who
  // arrive (the slide says itself where its board goes — the combs and the golf too). `deck`: the gate is on planks
  // over the sea — the board stands at their height, smaller, on piles; `level`: the gate is on the deck of the pier —
  // the board stands on it. `format`: how a score is written, when it is not a time.
  const LAB_BOARD = {
    slide: { title: 'BEST TIMES', sub: 'from the top of the cliffs to the sea · fastest down' },
    pond: { title: 'LONGEST RUNS', sub: 'three ponds · who held the longest', at: [5.0, -1.4, -0.35] },
    boats: { title: 'BEST TIMES', sub: 'three laps round the buoys · fastest', at: [-4.6, -0.6, 0.35] },
    hill: { title: 'BEST TIMES', sub: 'from the arch to the bell · fastest up', at: [-6.4, -1.0, 0.35] },
    crack: { title: 'BEST TIMES', sub: 'up the cleft, from wall to wall · fastest', at: [-4.0, -0.85, Math.PI / 2], deck: true },
    hollow: { title: 'BEST TIMES', sub: 'one lap under the ground · fastest', at: [4.4, -1.6, -0.4] },
    waves: { title: 'LONGEST RUNS', sub: 'a bank of sand, the sea of everybody · who held the longest', at: [4.4, -0.5, 0] },
    lava: { title: 'LONGEST RUNS', sub: 'the lava only rises · who held the longest', at: [4.4, -0.5, 0], level: true },
    hive: { title: 'LONGEST RUNS', sub: 'four combs over the sea · who held the longest', at: [4.4, -0.5, 0] },
    flip: { title: 'BEST TIMES', sub: 'a thousand metres of girders · 3 s for each fall, a quarter of a second off for each spark', at: [4.4, -0.5, 0] },
    spiral: { title: 'BEST TIMES', sub: 'nineteen turns up to the bell · fastest, falls and all', at: [4.4, -0.5, 0] },
    cars: { title: 'BEST TIMES', sub: 'three laps of the table · fastest', at: [4.4, -0.5, 0] },
    golf: { title: 'FEWEST STROKES', sub: 'nine holes round the acid pond · the fewest strokes, then the fastest', at: [4.4, -0.5, 0], format: golfScore, star: false }, // (no star on the map for the golf)
    ages: { title: 'FASTEST VICTORIES', sub: 'two armies, five ages · the other base down the soonest', at: [4.4, -0.5, 0] },
    raft: { title: 'BEST TIMES', sub: 'down the river to the sea · fastest', at: [4.4, -0.5, 0] },
    walls: { title: 'BEST TIMES', sub: 'along the walls of the ruin, to the top of its tower · fastest', at: [4.4, -0.5, 0], level: true }, // (on its landing, at the height of its deck)
    sneak: { title: 'BEST TIMES', sub: 'through the alleys, unseen · fastest', at: [4.4, -0.5, 0] },
    mine: { title: 'BEST TIMES', sub: 'the whole line of the mine · fastest', at: [4.4, -0.5, 0] },
    coaster: { title: 'BEST TIMES', sub: 'round every mountain, on the rails · fastest', at: [4.4, -0.5, 0] },
  };
  const labSigns = { group: null, key: null, planted: new Set() };
  /** What follows the building of the extras that were switched on. */
  const extrasBuilt = () => {
    let added = false;
    for (const id of Object.keys(LAB_GAMES)) {
      const game = app.extras?.[id], gate = game && (game.gate || game.stand);
      if (!gate || fair.stands[id]) continue;
      const o = LAB_BOARD[id], fx = Math.sin(gate.yaw), fz = Math.cos(gate.yaw);
      const spot = game.boardSpot || { x: gate.x - fz * o.at[0] + fx * o.at[1], z: gate.z + fx * o.at[0] + fz * o.at[1], yaw: gate.yaw + Math.PI + o.at[2] };
      if (id === 'slide') game.board?.mesh?.removeFromParent(); // (the plain board the slide hung for itself: this one takes its place)
      const deck = o.deck ? { y: gate.y, width: 2.7, pixels: 0.75, foot: gate.y - Math.min(world.data.heightAt(spot.x, spot.z), 0) + 0.6, piles: true } : o.level ? { y: gate.y } : null;
      // (a big attraction: the board of its five sponsors beside its board, on the side away from its gate — or where the game says)
      const lx = Math.cos(spot.yaw), lz = -Math.sin(spot.yaw), away = Math.sign((spot.x - gate.x) * lx + (spot.z - gate.z) * lz) || 1;
      const five = MAJOR_GAMES.includes(id) ? { roll: o.roll || away, rollBack: o.rollBack || 0, rollAt: game.rollSpot || null } : {};
      fair.stands[id] = world.games.lateStand(id, spot.x, spot.z, spot.yaw, { title: `${GAME_NAMES[id].toUpperCase()} — ${o.title}`, sub: o.sub, format: o.format || formatTime, what: 'this game', ...deck, ...five });
      const slot = (world.sponsorSlots || []).find((q) => q.id === `board:${id}`);
      if (slot) { addPlace(slot); const rot = places.get(slot.id)?.rotor; slot.offer?.(shop.open ? `from ${price(shop.least(rot ? targetOf(rot) : slot.id))} · step up and bid` : ''); rot?.show(); }
      added = true;
    }
    if (added) { refreshBoards(); applySponsors(); shopView.stale('board:'); if (shopView.isOpen) shopView.refresh(shopItems()); }
    hud.setAttractions(attractions());
    // (the planks: rebuilt when the games that are on change)
    const games = Object.keys(LAB_GAMES).map((id) => { const game = app.extras?.[id], at = game && (game.gate || game.stand); return at ? { id, name: GAME_NAMES[id], x: at.x, z: at.z } : null; }).filter(Boolean);
    const key = games.map((g) => g.id).join();
    if (key !== labSigns.key) {
      labSigns.key = key;
      if (labSigns.group) { labSigns.group.removeFromParent(); labSigns.group.traverse((q) => { q.geometry?.dispose(); if (q.name === 'signposts-games-planks') { q.material.map?.dispose(); q.material.dispose(); } }); }
      const built = buildGameSignposts(world.games, games, labSigns.planted);
      labSigns.group = built?.group || null;
      if (built) world.games.group.add(built.group);
      app.labSigns = built?.posts || [];
    }
  };
  Object.assign(app, { extrasBuilt });
  // (never in the middle of a game, a race, a timed climb, a ride, a payment, a form or a sentence — a message to the
  // fair's help included: the frame of its form has the keys, and a reload would lose what is being written)
  const busyNow = () => !!fair.session || world.games.run.state === 'running' || labBusy() || player.riding || shopView.isOpen || payView.isOpen || accountView.isOpen || sponsorsView.isOpen || helpView.isOpen
    || hud.chatOpen || !!hud.chatInput?.value || !!document.querySelector('.chooser.on, .pitch.on') || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
  const updates = new Updates(ui, {
    build: typeof __BUILD__ !== 'undefined' ? __BUILD__.commit || '' : '',
    status: async () => { try { const res = await fetch(`${import.meta.env.BASE_URL}api/status`, { cache: 'no-store' }); return res.ok && /json/.test(res.headers.get('content-type') || '') ? await res.json() : null; } catch { return null; } },
    now: sharedNow,
    safe: () => !busyNow(),
    leave: () => {
      // (in the world: one comes back at the same spot, in the same room — as after a change of quality; so too a tab
      // that stepped aside for another of this browser, its controls held while it waits: see OneTab)
      if ((input.enabled || inputWas) && !SHOT) store.set('mmf.resume', JSON.stringify({ x: player.pos.x, y: +player.pos.y.toFixed(2), z: player.pos.z, yaw: rig.yaw, room: presence?.room || '' }), true);
      location.reload();
    },
    apply: applyRelease,
    // (the tools shorten the countdown: ?count=4 — on a development page, or in a build made for them)
    ...((import.meta.env.DEV || typeof __TEST__ !== 'undefined') && params.has('count') && { count: Number(params.get('count')) }),
  });
  Object.assign(app, { updates, busyNow });
  // (the big attractions, for the map: the climb, the race, the flying theatre — and the games of the lab that are
  // switched on, each where one asks for it; the slide is drawn too, from its top to the sea)
  const attractions = () => {
    const pd = world.games.race?.paddock, list = [{ id: 'climb', name: CLIMB.name, x: CLIMB.x, z: CLIMB.z }];
    if (pd) list.push({ id: 'race', name: RACE.name, x: pd.x, z: pd.z });
    list.push({ id: 'wing', name: WING.name, x: WING.x, z: WING.z });
    for (const id of Object.keys(LAB_GAMES)) {
      const game = app.extras?.[id], at = game && (game.gate || game.stand);
      if (!at || LAB_BOARD[id]?.star === false) continue;
      const points = id === 'slide' ? game.course?.main?.points : null;
      list.push({ id, name: GAME_NAMES[id], x: at.x, z: at.z, ...(points && { line: points.filter((_, i) => i % 6 === 0 || i === points.length - 1).map((p) => [p.x, p.z]) }) });
    }
    return list;
  };
  hud.setAttractions(attractions());
  // (the games of the lab, when they are switched on — the slide, the three ponds, the regatta, the slope, the
  // cleft, the cave, and the seven with a gate: the server notes when a run begins — a score only counts with that
  // note — and each game says when a run ends (app.slideDone(ms), app.pondDone(ms)…): the score goes on its board)
  {
    const on = {};
    for (const id of Object.keys(LAB_GAMES)) {
      fair.boards[id] = new Scores(id);
      const format = LAB_BOARD[id].format || formatTime;
      GAMES[id] = [GAME_NAMES[id], format];
      app[`${id}Done`] = (score) => scoreGame(id, GAME_NAMES[id], Math.round(score), format(score)); // (the seven with a gate tell a whole number)
    }
    world.zones.push({ update: () => { for (const id in LAB_GAMES) { const now = !!app[LAB_GAMES[id]]?.(); if (now && !on[id]) fair.boards[id].start(); on[id] = now; } } });
  }
  // a village for hire: what it brings, what it costs, and the way to take it
  const hireVillage = (v) => {
    if (!shop.open) { hud.note('Hiring opens soon. Come back shortly!', 5200); return; }
    hud.choose(`${v.name} is for sale`, `${VILLAGE_PITCH.title} ${money(v.price)} a month and this mountain top is yours — the only ${v.name} there will ever be. ${VILLAGE_PERKS.join(' ')} ${VILLAGE_PITCH.foot}`, [{ label: `Take it · ${money(v.price)} a month`, note: 'Your name, your colours, your link', color: v.color }, { label: 'Not now', note: 'My accountant is watching' }])
      .then(async (i) => { if (i !== 0) return; hud.note('Opening the payment page…', 8000); const wrong = await shop.buy(`village:${v.id}`); if (wrong) hud.note(wrong, 7000); });
  };
  world.actionSources.push((p) => {
    if (!sky.gate.hidden && near(p, [sky.gate.x, sky.gate.z], 3.6)) return sky.gate.closed ? { label: 'The Sky Gate', run: () => { hud.note('Soon, the sky will open. Not yet — but look up now and then.', 5200); audio.play('pick'); } } : { label: 'Travel to a sky village', run: chooseVillage };
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
    return v.url && (near(p, v.sign, 3.4) || (!v.forHire && near(p, v.board, 3.2))) ? { label: `Visit ${v.name}`, run: () => visitSponsor(`village:${v.id}`, v.url) } : null;
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
  // (a room of one's own: an oasis, with the visitor's own robot on its bank)
  const roomPicture = (w, h) => { let robot = null; try { robot = previewer.shot('', color, Math.round(w * OASIS_ROBOT), Math.round(h * OASIS_ROBOT)); } catch { robot = null; } return oasisPicture(w, h, robot); };
  // (what a room of one's own is for, and what it gives: said on its card in the shop and on the card that offers it)
  const ROOM_CASES = [
    ['Teams & companies', 'A team day without the trust falls: race the quads, climb Mostly Up, settle the rest on the big wheel.'],
    ['Friends', 'Game night on boards that only know your names. Bragging rights, at last, among people who will hear about it for weeks.'],
    ['Streamers & communities', 'One link in the chat and your viewers are in: leaderboards of your own — and the door for whoever spoils it.'],
  ];
  const ROOM_PERKS = [
    'Reached by its link only: it is in no list, and no stranger walks in',
    'Up to 50 visitors at once — a team day, a game night, a stream',
    'Boards of scores of its own, next to the world\'s',
    'A password if you want one — and you can put a visitor out',
    'Its name is yours to choose, and to change',
    'What you score there counts for the world too',
  ];
  const shopView = new ShopView(hud.root, (id, w, h) => (id === PASS.id ? passPicture(w, h) : id === 'room' ? roomPicture(w, h) : id.startsWith('board:') ? panelPicture(id, w, h) : previewer.shot(id, color, w, h)));
  const wornNow = (type, sub) => (type === 'hat' ? HATS[look.hat]?.id === sub : type === 'paint' ? PAINTS[kit.paint] === sub : type === 'trail' ? TRAILS[kit.trail] === sub : type === 'jetpack' || type === 'jetlite' ? jetOn() === type : false);
  const shopItems = () => {
    // (what is no longer sold — the trails — is only shown to who bought it)
    const list = ITEMS.filter((it) => !it.retired || shop.owned.has(it.id)).map((it) => {
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
        perks: PASS.perks, why: PASS.why, inside: PASS.summary, // (inside: what its banner says it gives, in a few words each)
        fine: held ? (gift ? 'When the gift ends, nothing is charged: the pass simply stops.' : 'Paid by the month on Stripe. Stop whenever you like: it lasts until the end of the month you paid for.') : 'Paid by the month on Stripe; stop whenever you like. What you bought before stays yours, pass or no pass.',
      });
    }
    // the panel over the board of each game, to the highest bidder (only while things are sold)
    if (shop.open) for (const [game, title] of Object.entries(GAME_NAMES)) {
      if (!places.has(`board:${game}`)) continue; // (a game whose board has no panel, or that is not there yet)
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
    // a room of one's own, by the month — or for good, paid once (only while such rooms are switched on, and things are sold)
    if (shop.open && mine.on) {
      const room = mine.room, live = room?.state === 'live', cost = `${price(mine.price || 5900)} a month`, good = mine.life ? `${price(mine.life)}, once` : '';
      list.push({
        id: 'room', name: room ? room.name : 'A room of your own', group: 'room', rarity: 'legendary', owned: live, wearable: false, cost: good && !live ? `${cost} · or ${price(mine.life)} for good` : cost,
        act: live ? null : room ? `Wake it · ${cost}` : `Get a room · ${cost}`,
        act2: live || !good ? null : room ? `Wake it for good · ${good}` : `Buy it for good · ${good}`,
        manage: live && room.managed ? 'Look after it, or stop it' : null,
        blurb: live ? `It is yours${room.life ? ' — for good' : ''}. Its link, its name and its password are in "Who is here".` : room ? 'Your room is asleep: nobody can enter it. Pay for it again and it wakes as it was — its name, its password, its boards.' : 'The whole oasis, for your people only — a team, a band of friends, the viewers of a stream. One link to hand out, no stranger walks in, and boards of scores that only know your names.',
        perks: ROOM_PERKS,
        fine: live && room.life ? 'Bought for good: nothing to renew, nothing to stop. No sky village hangs over a room of one\'s own.'
          : `By the month on Stripe: stop whenever you like — a room that is no longer paid for falls asleep, is kept for thirty days, then freed.${good ? ` Or for good: ${good}, and it never falls asleep.` : ''} It takes an account (free). No sky village hangs over a room of one's own.${account.name ? '' : ' Create an account first, in the settings.'}`,
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
  const showAccount = () => hud.setAccount({ name: account.name, available: account.available, mail: account.mail, email: account.email, google: account.google, viaGoogle: account.viaGoogle, passwordless: account.passwordless, invited: account.invited });
  /** Signed in (or out): what is owned, the days in a row and the look are asked again. */
  const accountChanged = async () => {
    showAccount();
    await refreshShop();
    // (on the boards, "me" is the account from now on — and what was scored as a guest in the last half hour counts for it)
    world.games.setMe(account.name || name);
    refreshMine();
    if (account.name) Scores.claim().then(({ claimed, boards }) => {
      if (!claimed.length) return;
      for (const id of claimed) { if (id === 'sky' || fair.boards[id]) showBoard(id, boards[id]); presence?.sendScore(id); }
      if (presence?.inOwn) refreshBoards(); // (…and the boards of the room they were made in)
      hud.addChat('✦', 5, `Your score${claimed.length > 1 ? 's' : ''} of a moment ago now count${claimed.length > 1 ? '' : 's'} for the week, the month and all time, under the name ${account.name}.`, true);
    });
    const v = await countVisit(name);
    who.days = v.days;
    showEmotes();
  };
  // the account, on its card (ui/AccountView.js): signing in, making one, a new password with the recovery code
  const accountAction = async (what) => {
    if (what === 'logout') { await account.logout(); await accountChanged(); hud.note('Signed out: this browser is a guest again.', 5000); return; }
    // (with Google: the game leaves for Google's page — with the name the robot wears, should this make a new account)
    if (what === 'google') { hud.note('One moment: off to Google…', 4000); offToGoogle(); return; }
    // (an account made with a name and an address, whose password is still to be chosen: the link is mailed again)
    if (what === 'invite') { const done = await account.invite(); hud.note(done.error || `The link is on its way to ${account.email}: it is good for a week. Look in the spam folder too.`, 8000); return; }
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
    // (a new account: a name and an address where the server sends e-mail — "How should we call you?", a link is
    // mailed to choose the password —, a name and a password elsewhere; the card's own tabs still lead to the other way)
    accountView.open({ mode: what === 'create' ? (account.mail ? 'join' : 'create') : what === 'reset' ? 'reset' : 'login', name: what === 'create' && !/^Visitor \d+$/.test(name) ? name : '', mail: account.mail, google: account.google });
  };
  /** Off to Google's page — where one stands is kept, to come back there (as for the payment page). `typed`: the name asked for on the card, if any. */
  const offToGoogle = (typed = '') => {
    if (input.enabled && !SHOT) store.set('mmf.resume', JSON.stringify({ x: player.pos.x, y: +player.pos.y.toFixed(2), z: player.pos.z, yaw: rig.yaw, room: presence?.room || '' }), true);
    account.toGoogle(typed || (!/^Visitor \d+$/.test(name) ? name : ''));
  };
  // Signing in with Google (server/google.js): the game leaves for Google's page and comes back with a claim in its
  // address (?google=…), which this browser hands to the server. The first time, the account is made under the
  // name typed on the card — or the one the robot wears; when that will not do, the card asks for one.
  let googleClaim = '';
  const backFromGoogle = async (word, asked = '') => {
    if (word === 'no') { hud.note('Signing in with Google was called off: nothing has changed.', 6000); return {}; }
    if (word === 'expired' || word === 'failed' || word === 'off') { hud.note('Signing in with Google did not work. Try again in a moment.', 7000); return {}; }
    googleClaim = word;
    const done = await account.claim(word, asked || (!/^Visitor \d+$/.test(name) ? name : ''), profileNow());
    if (done.same) {
      // (this Google address is the address of an account already: it is theirs — the card to sign in to it, its name in the field)
      googleClaim = '';
      hud.closeAll(); input.exitLock(); input.keys.clear();
      accountView.open({ mode: 'login', name: done.same, mail: account.mail, say: done.error, warn: true });
      return { error: done.error };
    }
    if (done.needName) {
      // (the name of the new account: what stands before the @ of the Google address is in the field — to keep, or to change)
      hud.closeAll(); input.exitLock(); input.keys.clear();
      accountView.open({ mode: 'name', name: asked || done.suggest || '', mail: account.mail, say: asked ? done.error : done.suggest ? 'Google knows you now. One thing is left: the name of your account in the oasis — keep this one, or change it.' : 'Google knows you now. One thing is left: the name of your account in the oasis.', warn: !!asked });
      return { error: done.error };
    }
    if (done.error) { hud.note(done.error, 7000); return { error: done.error }; }
    googleClaim = '';
    if (!done.created) applyProfile(account.profile);
    await accountChanged();
    audio.play('victory');
    hud.note(done.created ? `Your account “${account.name}” is made, and this browser is signed in with Google.` : `Welcome back, ${account.name}!`, 7000);
    return {};
  };

  /** The robot goes by the name of the account that was just made for it ("How should we call you?"). */
  const wearName = (n) => { if (!n || n === name || !nameOk(n)) return; name = n; hud.setName(name); presence?.setIdentity(name, color); store.set('mmf.name', name); };
  let pwToken = ''; // (the link of the message that lets a new account choose its password: ?pw=…)
  let payWaits = null; // (a payment waits for the account that is being made: see shop.gate)
  accountView
    .on('google', (typed) => offToGoogle(typed))
    .on('free', (n) => account.free(n))
    .on('submit', async (mode, d) => {
      if (mode === 'name') return backFromGoogle(googleClaim, d.name);
      if (mode === 'join') {
        const made = await account.join(d.name, d.email, { ...profileNow(), name: d.name });
        if (made.error) return { error: made.error, field: made.field };
        wearName(account.name);
        await accountChanged();
        audio.play('victory');
        hud.addChat('✦', 5, `Welcome, ${account.name}! Your name is yours now. A link to choose your password is on its way to ${account.email} — it is good for a week (look in the spam folder too).`, true);
        hud.note(`Welcome, ${account.name}! A link to choose your password is on its way to your e-mail.`, 8000);
        return {};
      }
      if (mode === 'setpw') {
        const done = await account.setPassword(pwToken, d.password);
        if (done.error) return { error: done.error };
        pwToken = '';
        applyProfile(account.profile);
        await accountChanged();
        audio.play('victory');
        hud.note(`Your password is saved, ${account.name}: this browser is signed in.`, 7000);
        return {};
      }
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
    .on('close', () => { document.getElementById('view')?.focus({ preventScroll: true }); const go = payWaits; payWaits = null; go?.(!!account.name); });
  // Paying takes an account — "quand on paye il faut que ça crée un compte": who is about to pay as a guest is
  // asked for a name and an address first (ten seconds, no password: the link to choose one is mailed), the
  // account is made, and the payment goes on. What is bought is never left in one browser alone.
  // (the tools buy a great deal as plain visitors, to check everything else: on their pages the account is only
  // asked for when the address says so — ?gate —, as the cards that come by themselves are: see pitchAuto)
  const gateOn = !(import.meta.env.DEV || typeof __LAB__ !== 'undefined' || typeof __TEST__ !== 'undefined') || params.has('gate');
  shop.gate = () => {
    if (account.name || !account.available || SHOT || !gateOn) return true;
    return new Promise((resolve) => {
      payWaits = resolve;
      hud.closeAll(); input.exitLock(); input.keys.clear();
      accountView.open({ mode: account.mail ? 'join' : 'create', name: !/^Visitor \d+$/.test(name) ? name : '', mail: account.mail, google: account.google, say: 'Before the payment: your account, so that what you buy is never lost. It is free, and takes ten seconds.' });
    });
  };
  Object.assign(app, { account, accountAction, accountView, payView, legalView, helpView });
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
  /** The payment of the Game Pass, opened at once (from the card that tells what it gives). */
  const buyPass = async () => {
    if (shop.pass) { hud.note(`You hold the ${PASS.name} already — thank you!`, 5000); return; }
    hud.note('Opening the payment page…', 8000);
    const wrong = await shop.buy(PASS.id);
    if (wrong) hud.note(wrong, 7000);
  };
  // ---------- two cards that make an offer in full, once in a while, never in the middle of anything — each six
  // times at the most, counted from the first visit, each time with words of its own (app/pitches.js; `step`:
  // which of the six): the Game Pass, to who plays without it — fifteen minutes, one hour, two hours, a day, two
  // days and three days after their first visit —; an account, to who plays without one, in between — ten
  // minutes, forty, an hour and a half, half a day, a day and a half, two days and a half. (`shown`: the
  // administrator asked to see it — nothing is counted, nothing is checked.)
  const pitchWanted = { account: () => !account.name && !noApi(), pass: () => shop.open && !shop.pass };
  const pitch = async (kind, shown = false, step = 0) => {
    if (hud.pitching) return false;
    if (kind === 'pass') {
      if (!shown && !pitchWanted.pass()) return false;
      const k = Math.max(0, Math.min(PASS_LINES.length - 1, Math.floor(Number(step) || 0))), L = PASS_LINES[k];
      if (!shown) store.set(PASS_SEEN, String(k + 1)); // (this one is passed — and so are those before it)
      audio.play('pick');
      const taken = await hud.pitch({
        kind, eyebrow: L.eyebrow, title: L.title, lead: L.lead, perks: PASS.summary,
        tag: `${price(PASS.price)} a month · stop whenever you like`,
        fine: 'Paid on Stripe: the game never sees your card. Stop in two clicks — no hard feelings, the robot keeps its dignity.',
        yes: `Get the ${PASS.name} · ${price(PASS.price)} a month`, no: L.no, picture: passPicture(420, 300),
      });
      if (taken) buyPass();
      return taken;
    }
    if (kind === 'account') {
      if (!shown && !pitchWanted.account()) return false;
      const k = Math.max(0, Math.min(ACCOUNT_LINES.length - 1, Math.floor(Number(step) || 0))), L = ACCOUNT_LINES[k];
      if (!shown) store.set(ACCOUNT_SEEN, String(k + 1)); // (this one is passed — and so are those before it)
      audio.play('pick');
      // (the first time — five minutes into the oasis — no card comes before the question: "How should we call
      // you?", a name and an address, asked at once. Where the server sends no e-mail, the card as before.)
      if (k === 0 && !shown && account.mail) { accountAction('create'); return true; }
      const taken = await hud.pitch({
        kind, eyebrow: L.eyebrow, title: L.title, lead: L.lead, perks: ACCOUNT_PERKS,
        tag: account.mail ? 'Free · a name and an e-mail · ten seconds' : 'Free · thirty seconds · no e-mail needed',
        fine: 'Free, and done in less time than the queue for the big wheel.',
        yes: 'Create my account', no: L.no, picture: previewer.shot('', color, 360, 450),
      });
      if (taken) accountAction('create');
      return taken;
    }
    return false;
  };
  // ---------- a room of one's own, offered in full: who it is for, what it gives, what it costs — and the payment
  const roomPitch = async () => {
    if (hud.pitching) return false;
    const cost = `${price(mine.price || 5900)} a month`, good = mine.life ? `${price(mine.life)}, once` : '';
    audio.play('pick');
    const taken = await hud.pitch({
      kind: 'room', eyebrow: `A room of your own · ${cost}${good ? ` — or ${price(mine.life)} for good` : ''}`, title: 'The whole oasis, for your people only',
      lead: 'The same valley, the same pier, the same big wheel — and nobody you did not invite. One link to hand out, and boards of scores that only know your names.',
      cases: ROOM_CASES, perks: ROOM_PERKS,
      fine: `It takes an account (free). By the month on Stripe: the game never sees your card, and you stop whenever you like — a room that is no longer paid for falls asleep, and is kept for thirty days.${good ? ` Or for good: ${good}, and it never falls asleep.` : ''}`,
      yes: good ? 'Get my room' : `Get my room · ${cost}`, no: 'Maybe later', picture: roomPicture(360, 420),
    });
    if (!taken) return false;
    if (!account.name) { hud.note('A room belongs to an account: make yours first — it is free — and come back for the room.', 9000); accountAction('create'); return true; }
    if (who.admin && who.key) {
      // (an administrator tries the thing out: a room for their account, for nothing — no subscription, it never falls asleep)
      const res = await callApi('api/urooms', { method: 'POST', key: who.key, body: { open: true, device: deviceId() } });
      if (res?.room) { await refreshMine(true); hud.note(`Your room is open — for nothing, as an administrator: "${res.room.name}". Its link and its settings are in "Who is here"; its boards of scores are also on the page /admin, "High scores".`, 12000); audio.play('victory'); }
      else hud.note('The room could not be opened: is this browser signed in to your account, and are the rooms of players switched on (/admin, Releases)?', 9000);
      return true;
    }
    // (by the month, or for good: one chooses)
    const life = good ? await hud.choose('A room of your own', 'By the month, you stop whenever you like. For good, you pay once and it is yours for as long as the fair stands.', [{ label: `By the month · ${price(mine.price || 5900)}`, note: 'Stop whenever you like' }, { label: `For good · ${price(mine.life)}`, note: 'Paid once — never falls asleep', color: [0.9, 0.7, 0.2] }]) : 0;
    if (life === null) return true;
    hud.note('Opening the payment page…', 8000);
    const wrong = await shop.buy('room', 0, life === 1);
    if (wrong) hud.note(wrong, 7000);
    return true;
  };
  hud.roomArt = (w, h) => roomPicture(w, h);
  // (the tools play for a long time and must not find a card over what they are doing: on their pages the cards
  // only come by themselves when the address asks for them — ?pitch)
  const pitchAuto = !(import.meta.env.DEV || typeof __LAB__ !== 'undefined' || typeof __TEST__ !== 'undefined') || params.has('pitch');
  let played = 0, cardAt = -1e9, passLook = -1e9, passPreview = -1, accountPreview = -1; // (…Preview: the last of the six the administrator was shown)
  /** Called while one walks about: the clock of the visit, and the card that is due — once nothing else is going on. */
  const playClock = (dt) => {
    played += dt;
    if (!pitchAuto) return;
    // (a card: when one of its six times has come — a minute and a half into a visit at the least, never within
    // four minutes of another card; who comes back after a while gets the last one that is due. The Game Pass is
    // looked at first; when both are due, the account comes at a later look)
    const look = played >= 90 && played - cardAt >= 240 && played - passLook >= 15;
    if (!look || busyNow() || hud.rosterOpen || hud.bigMapOpen || hud.pitching) return; // (whether the game is busy is asked only when a card could come)
    passLook = played;
    const first = Number(store.get(FIRST)), now = Date.now();
    const k = passDue(first, Number(store.get(PASS_SEEN) || 0), now);
    if (k >= 0 && pitchWanted.pass()) { cardAt = played; pitch('pass', false, k); return; }
    const a = accountDue(first, Number(store.get(ACCOUNT_SEEN) || 0), now);
    if (a >= 0 && pitchWanted.account()) { cardAt = played; pitch('account', false, a); }
  };
  Object.assign(app, { pitch, playedFor: (seconds) => { if (seconds !== undefined) played = seconds; return played; } });
  shopView
    .on('buy', async (id, how) => {
      if (id.startsWith('board:')) { shopView.close(); bidFor(id); return; } // (a place to sponsor: how much?)
      hud.note('Opening the payment page…', 8000);
      const wrong = await shop.buy(id, 0, how?.life === true); // (life: bought for good, paid once — a room of one's own)
      if (wrong) hud.note(wrong, 7000);
    })
    .on('equip', (id) => { const [type, sub] = id.split(':'); if (!shop.owns(id)) return; equip(id, !wornNow(type, sub)); shopView.refresh(shopItems()); audio.play('pick'); })
    .on('manage', async (id) => { hud.note('Opening the page of your subscription…', 8000); const wrong = await shop.portal(id === 'room' ? 'room' : ''); if (wrong) hud.note(wrong, 7000); })
    .on('close', () => { document.getElementById('view')?.focus({ preventScroll: true }); });
  // a firework (for who has the box): up it goes, and those around see it too
  const FIREWORK = 31, BOUQUET = 30, MUSHROOM = 29; // (the numbers they travel under, among the emotes: a firework lit, a bouquet held out, a mushroom cloud raised)
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
    // (said in the chat too: a note goes by while the world loads, the chat keeps it)
    const tell = (text, ms = 10000) => { hud.note(text, ms); hud.addChat('✦', 5, text, true); };
    const again = async () => {
      await refreshShop();
      if (paid === 'room') {
        // a room of one's own: there once Stripe has said it is paid
        await refreshMine(true);
        if (mine.room?.state === 'live') {
          audio.play('victory');
          const text = `"${mine.room.name}" is yours${mine.room.life ? ' — for good' : ''}. Its link and its settings are in "Who is here": give the link to whoever you like.`;
          hud.note(text, 10000);
          hud.addChat('✦', 5, text, true); // (a note goes by while the world loads: the chat keeps it)
        }
        else if (++tries < 8) setTimeout(again, 2500);
        return;
      }
      if (shop.owned.has(paid) || shop.slots[paid]?.mine || (paid === PASS.id && shop.pass)) {
        audio.play('victory');
        const plate = paid.startsWith('plaque:') && shop.slots[paid]?.mine;
        const place = !plate && shop.slots[paid]?.mine, kept = place ? keptSponsor(paid) : null;
        if (kept) {
          // (what they said their place should show, before paying: sent now that it is theirs)
          const wrong = await shop.fill(paid, { title: kept.title, subtitle: kept.subtitle, url: kept.url, logo: kept.logo });
          store.del(SPONSOR_DRAFT);
          await refreshShop();
          tell(wrong ? `The place is yours — thank you! What it should show could not be sent (${wrong}): walk up to it, "Set up your panel".` : `Paid, and up: "${shop.slots[paid]?.title || kept.title}" is shown to every visitor. Thank you — the fair stays free thanks to you! To change it: walk up to your place, "Set up your panel".`, 12000);
        } else tell(paid === PASS.id ? `The ${PASS.name} is yours. Thank you — it keeps the lights on! Pick a size and a colour in the settings.` : plate ? 'The plate is theirs, for good. Thank you!' : place ? 'It is yours — thank you! Say what it shows: your name, your link, your logo.' : 'It is yours. Thank you!', 9000);
        // (a place whose words were not given before paying: they are asked for right away)
        if (place && !kept && !shop.slots[paid].draft && shop.slots[paid].state !== 'live') { const ask = () => { if (state.mode === 'walk') fillPlace(paid); else setTimeout(ask, 900); }; ask(); }
        // (what goes on a plaque is asked for right away — the plate itself is a swim and a climb away —, once they are in the world)
        if (plate && !shop.slots[paid].draft && shop.slots[paid].state !== 'live') { let waits = 0; const ask = () => { if (state.mode === 'walk' && places.has(paid)) fillPlace(paid); else if (++waits < 200) setTimeout(ask, 900); }; ask(); }
        // (what can be worn is put on at once)
        if (itemOf(paid) && WEARABLE.includes(paid.split(':')[0])) { equip(paid, true); shopView.refresh(shopItems()); }
      }
      else if (++tries < 10) setTimeout(again, 2500);
      // (Stripe has not said it yet: nothing is lost — it is given as soon as it does)
      else tell('The payment page says it is paid, but Stripe has not told the game yet. Nothing is lost: it will be here the moment it does — reload the page in a minute. If it never comes, write to the fair (the address is in the terms).', 15000);
    };
    again();
  };
  // (leaving for Stripe's page — to pay, or to look after a subscription: where one stands is noted, to come back there)
  shop.onLeave = () => { if (input.enabled && !SHOT) store.set('mmf.resume', JSON.stringify({ x: player.pos.x, y: +player.pos.y.toFixed(2), z: player.pos.z, yaw: rig.yaw, room: presence?.room || '' }), true); };
  refreshShop().then(async () => {
    const paid = params.get('paid'), session = params.get('cs');
    if (paid === null) return;
    params.delete('paid'); params.delete('cs');
    history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : '') + location.hash);
    if (!paid) { hud.note('Nothing was paid.', 4000); return; }
    // (Stripe is asked about that payment at once: what was bought is there without waiting to be told)
    if (session) await shop.confirm(session);
    arrived(paid);
  });
  // paying without leaving the game, where the server has Stripe's publishable key: their form on a card
  // (ui/PayView.js). When it cannot be shown, the shop sends the visitor to Stripe's page as before.
  shop.onEmbed = (item, secret, session = '') => {
    hud.closeAll();
    input.exitLock();
    input.keys.clear();
    return payView.open(shop.pk, secret, { title: 'Payment', test: shop.mode === 'test', paid: async () => { if (session) await shop.confirm(session); arrived(item); } });
  };
  account.load().then(async () => {
    // (back from Google? the claim in the address is spent at once, and taken out of the address)
    const word = params.get('google');
    if (word) {
      try { const u = new URL(location.href); u.searchParams.delete('google'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch { /* the address stays as it is */ }
      await backFromGoogle(word);
    }
    // (the link of the message "choose your password": the card where it is typed — or a word if the link is spent)
    const pw = params.get('pw');
    if (pw) {
      try { const u = new URL(location.href); u.searchParams.delete('pw'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch { /* the address stays as it is */ }
      const who = await account.whose(pw);
      if (who) { pwToken = pw; hud.closeAll(); input.exitLock(); input.keys.clear(); accountView.open({ mode: 'setpw', name: who, mail: account.mail }); }
      else hud.note('That link has expired, or was used already. Settings, Your account, "Forgot the password" sends a code to your e-mail.', 12000);
    }
    showAccount();
    if (account.name) world.games.setMe(account.name); // (on the boards, "me" is the account when there is one)
  });
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
    presence?.setBadge(badgeOn && who.admin);
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
      presence?.setBadge(false);
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
    .on('roster', () => { showRoster(); refreshRoster(); refreshRooms(); if (mine.on) refreshMine(); })
    .on('myroom', myRoom)
    .on('show', (kind) => (kind === 'room' ? roomPitch() : kind === 'pass' ? pitch('pass', true, (passPreview = (passPreview + 1) % PASS_LINES.length)) : kind === 'account' ? pitch('account', true, (accountPreview = (accountPreview + 1) % ACCOUNT_LINES.length)) : pitch(kind, true))) // (the Game Pass, an account: each click, the next of its six cards)
    .on('putout', (id) => { if (presence?.host) { presence.kick(id); hud.note('Put out: they cannot come back for an hour.', 4500); } })
    .on('room', (to) => changeRoom(to))
    .on('badge', () => {
      // the administrator's badge: worn or not, as they choose — kept by this browser, shown by the relay only
      // while their key is recognised
      badgeOn = !badgeOn;
      store.set('mmf.badge', badgeOn ? '1' : '0');
      presence?.setBadge(badgeOn && who.admin);
      hud.note(badgeOn ? 'Your ADMIN badge is on: everybody who sees you sees it.' : 'Your ADMIN badge is off.', 5000);
      if (hud.rosterOpen) showRoster();
    })
    .on('roomlink', (room) => copyRoomLink(room))
    .on('visitorview', (on) => visitorView(on))
    .on('kick', (id) => { presence?.kick(id); setTimeout(refreshRoster, 500); })
    .on('ban', (id, hours, quiet) => { presence?.ban(id, hours, !!quiet); if (quiet) hud.note('Muted: they play on and notice nothing — nobody hears them any more. "Kept out", below, lifts it.', 7000); setTimeout(refreshRoster, 800); })
    .on('unban', async ({ kind, key }) => { await callApi(`api/bans?${kind}=${encodeURIComponent(key)}`, { method: 'DELETE', key: who.key }); refreshRoster(); })
    .on('promote', (id) => { presence?.promote(id); })
    .on('goto', (to) => goTo(to))
    .on('demote', async (id) => { await callApi(`api/admins?id=${encodeURIComponent(id)}`, { method: 'DELETE', key: who.key }); presence?.demote(id); refreshRoster(); })
    .on('shop', () => openShop())
    .on('account', accountAction)
    .on('legal', (which) => { hud.closeAll(); input.exitLock(); input.keys.clear(); legalView.open(which); })
    .on('help', () => { hud.closeAll(); input.exitLock(); input.keys.clear(); helpView.open(); })
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
      rig.behind = settings.behind;
    })
    .on('color', (i) => { if (i >= FREE_COLORS && !shop.hasPass) return; color = i; me.setColor(i); store.set('mmf.color', String(color)); presence?.setIdentity(name, color); shopView.stale(); keepProfile(); })
    .on('size', (i) => { if (i && !shop.hasPass) return; size = i; store.set('mmf.size', SIZES[size]); keepProfile(); })
    .on('sit', () => sitDown())
    .on('lie', () => sitDown(true))
    .on('mushroom', () => app.mushroom?.())
    .on('gift', (to) => giftTo(to))
    .on('name', (n) => { if (!n) return; if (!nameOk(n)) { hud.note('That name cannot be worn here (no insult, no address of a site, no @): pick another.', 6000); hud.setName(name); return; } name = n; presence?.setIdentity(name, color); store.set('mmf.name', name); world.games.setMe(account.name || name); keepProfile(); })
    .on('quality', (q) => {
      // a tier changes shaders, textures and shadow maps: simplest and safest is a clean restart at the same spot
      if (q === 'auto') store.del('mmf.quality'); else store.set('mmf.quality', q);
      store.set('mmf.resume', JSON.stringify({ x: player.pos.x, y: +player.pos.y.toFixed(2), z: player.pos.z, yaw: rig.yaw }), true);
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
  input.on('menu', () => { accountView.close(); payView.close(); legalView.close(); helpView.close(); sponsorsView.close(); if (fair.session && (!fair.session.over || fair.kind === 'arcade')) { endGame(); hud.note('Game left.'); } hud.panel.classList.remove('on'); hud.emotes.classList.remove('on'); hud.toggleBigMap(false); hud.toggleChat(false); hud.closeChoice(); hud.closeRoster(); });
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
      if (input.heldLong('sit', 0.45)) sitDown(true); // (X held: one lies down)
      player.update(dt, rig.heading, true);
      rig.update(dt, player.pos, player);
      playClock(dt);
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
    // (the cabinet has its own way out, in its frame and under its picture: a button here would lie under its screen)
    if (fair.session && mode === 'walk') hud.setPrompt(0, fair.kind === 'arcade' || fair.session.over ? null : fair.kind === 'race' ? 'Give up the race' : 'Leave the game');
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
          // (said in full once in a while — at the bottom of the screen, with the button that opens the item shop, where
          // the three are —; in a word otherwise)
          if (state.time - (app.toldJetLong || -999) > 90 && !busyNow()) {
            app.toldJetLong = state.time;
            const lite = price(shop.cost('jetlite')), full = price(shop.cost('jetpack')), pass = `${price(PASS.price)} a month`;
            hud.offer(touch
              ? `We give everyone a free jetpack for 24 hours, but it looks like your day is over. Feel free to get one in the shop: the Jetpack Lite (${lite}), the Jetpack (${full}) or the ${PASS.name} (${pass}).`
              : `We give everyone a free jetpack for 24 hours, but it looks like your day is over. Feel free to get one in the item shop: the Jetpack Lite (${lite}), the Jetpack (${full}) — or the ${PASS.name} (${pass}), which comes with the Jetpack Lite.`,
            'See them in the shop', () => openShop(), 22000, 'Not now', { low: true });
          } else hud.note(`Your free day with the jetpack is over. The Jetpack Lite (${price(shop.cost('jetlite'))}) and the Jetpack (${price(shop.cost('jetpack'))}) are in the item shop (O).`, 5000);
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
      // (the music of the climb is that of the Endless Pond too: it rises from pond to pond, then with the time held)
      const ponding = ear.climb === null ? app.pondRun?.() : null;
      if (ponding && !ponding.over && ponding.state?.clock > 0 && ponding.state.mode) ear.climb = Math.min(1, 0.16 + ponding.state.stage * 0.3 + Math.min(0.24, ponding.state.t / 90));
      // (…and of the cleft: it rises with the climber)
      const clefting = ear.climb === null ? app.cleftClimb?.() : null;
      if (clefting && !clefting.over && clefting.state?.started) ear.climb = Math.min(1, Math.max(0.12, clefting.state.y / 40));
      // (…and of the slope: it rises with the climber)
      const sloping = ear.climb === null ? app.hillClimb?.() : null;
      if (sloping && !sloping.over && sloping.state?.clock > 0) ear.climb = Math.min(1, Math.max(0.12, sloping.state.s / 66));
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
    }
    world.update(dt, camera);
    // (the other visitors are placed — and their names put on the screen — once the world has had its turn: a game
    // that is being played sets its own camera there (src/extras/plug.js), and says who is hidden or runs head
    // down. Done before, the names were laid out for the camera of the walk: beside the robots, and never still)
    if (presence) avatars.update(dt, camera, engine.width, engine.height);
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
  hasApi().then((first) => updates.start(first)); // (what is released, which version is online: followed from here on)
  const resume = (() => { try { return JSON.parse(store.get('mmf.resume', true)); } catch { return null; } })();
  store.del('mmf.resume', true);
  if (resume && Number.isFinite(resume.x) && Number.isFinite(resume.z) && !params.has('welcome')) { // (?welcome: the card, whatever)
    // back from a quality change, or from a new version: straight into the world, where we were (and in the same room)
    if (typeof resume.room === 'string') backTo = resume.room;
    if (Number.isFinite(resume.y)) resumedAt = { x: resume.x, y: resume.y, z: resume.z, yaw: resume.yaw || 0, at: performance.now() }; // (on the wall of the companions, once it is there)
    player.teleport(resume.x, resume.z, (resume.yaw || 0) + Math.PI);
    rig.snap(player.pos, resume.yaw || 0);
    hud.splash.classList.add('done');
    hud.hud.classList.add('on');
  } else if (returning) {
    // somebody who has been here: their name, their colour, their size are chosen — straight into the world, as
    // they were (the settings change any of it; ?welcome at the end of the address shows the card again)
    hud.splash.classList.add('done');
    hud.hud.classList.add('on');
    setTimeout(() => hud.note(`Welcome back, ${name}! Your robot is as you left it — the settings (the cog) change it.`, 5200), 500);
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
  setTimeout(() => hud.note(touch ? 'Drag on the left to walk, on the right to look around' : 'Drag the mouse to look around · double-click to capture it', 5200), returning ? 6200 : 2600);
  // (…then what there is to look for: the relics of the world before — said to whoever still has some to find)
  setTimeout(() => app.relicsHello?.(), (returning ? 6200 : 2600) + 7000);
}

boot().catch((err) => {
  console.error(err);
  app.error = String(err?.stack || err);
  hud.fail(`The world could not be loaded. ${err?.message || ''}`);
});
