// Application entry: boot sequence, game loop and modes (intro, walk, free camera, benchmark).
import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { isMobile, TIERS } from './core/Quality.js';
import { World } from './world/World.js';
import { FreeCamera } from './player/FreeCamera.js';
import { CharacterFactory, EMOTE_LIST, emoteIndex, packLook } from './player/Character.js';
import { HATS, owns } from './player/Cosmetics.js';
import { PlayerController } from './player/PlayerController.js';
import { CameraRig } from './player/CameraRig.js';
import { Interact } from './player/Interact.js';
import { RankEmotes } from './player/RankEmotes.js';
import { Hud, VERSION } from './ui/Hud.js';
import { Presence, cleanChat } from './net/Presence.js';
import { Npc } from './npc/Npc.js';
import { Scores } from './net/Scores.js';
import { countVisit } from './net/Visits.js';
import { callApi } from './net/api.js';
import { formatTime } from './world/zones/games/course.js';
import { RemoteAvatars } from './net/RemoteAvatars.js';
import { Benchmark } from './app/Benchmark.js';
import { SPAWN, ZONES, CLIMB } from './world/layout/layout.js';
import { FEATURES } from './app/config.js';
import { Soundscape } from './audio/Soundscape.js';

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
  if (!(color >= 0 && color < 16)) color = Math.floor(Math.random() * 16);
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
  const savedHat = parseInt(store.get('mmf.hat'), 10);
  const look = { hat: savedHat > 0 && savedHat < HATS.length && owns(HATS[savedHat].id) ? savedHat : 0, jet: false, bouquet: false, kinds: undefined, quad: false, bighead: false };
  const timers = {}; // cheats that wear off: name → seconds left
  // habits kept from one visit to the next
  const settings = { run: store.get('mmf.run') === '1', follow: store.get('mmf.follow') === '1' };
  player.autoRun = settings.run;
  rig.follow = settings.follow;
  // who is visiting: `admin` once the server has recognised the administrator's key; `days`: visits in a row
  const who = { admin: false, key: '', days: 1 };
  app.who = who;
  // no jetpack underground, nor where a game forbids it
  player.canFly = (p) => owns('jetpack') && !player.cave && !world.noFly.some((z) => (p.x - z.x) ** 2 + (p.z - z.z) ** 2 < z.r * z.r);
  player.onDeath = (cause) => { hud.wasted(cause); audio.play('wasted'); };
  player.onRespawn = () => { hud.wasted(null); rig.snap(player.pos, rig.yaw); audio.play('respawn'); };
  const rank = new RankEmotes(scene);
  Object.assign(app, { player, rig, free, me, rank });

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
  const startPresence = () => {
    presence = new Presence({ name, color });
    avatars = new RemoteAvatars({ scene, factory, presence, hud, rank, world });
    presence.on('chat', ({ id, peer, text, near }) => { hud.addChat(peer.name, peer.color, text, false, near); avatars.say(id, text); audio.play('chat'); });
    // what the others do is heard when they are close
    presence.on('emote', ({ id, emote: i }) => {
      const o = presence.peers.get(id), e = EMOTE_LIST[i];
      if (!o || !o.visible || !e) return;
      const d = Math.hypot(o.x - player.pos.x, o.z - player.pos.z);
      if (d < 40) audio.play(e.rank ? 'rank' : e.id === 'cheer' || e.id === 'clap' || e.id === 'hype' || e.id === 'go' ? 'cheer' : e.id === 'rage' ? 'rage' : 'emote', { volume: Math.max(0.15, 1 - d / 40) * 0.8 });
    });
    // put out of the room by the administrator: said plainly, and that is the end of the visit to this room
    presence.on('kicked', ({ ban }) => hud.banner(ban ? 'The administrator has banned you from the fair.' : 'The administrator has put you out of this room. Reload the page to come back in.'));
    presence.on('who', ({ list, now }) => { roster.details = new Map(list.map((p) => [p.id, p])); roster.now = now; if (hud.rosterOpen) showRoster(); });
    presence.on('admin', ({ ok }) => { if (ok && hud.rosterOpen) presence.who(); });
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
  const roster = { details: null, bans: null, now: 0 };
  const showRoster = () => {
    const p = player.pos, zoneOf = (x, z) => { let best = null, bd = 1; for (const zn of ZONES) { if (zn.hidden) continue; const d = Math.hypot(x - zn.x, z - zn.z) / zn.r; if (d < bd) { bd = d; best = zn; } } return best ? best.name : ''; };
    const people = [{ id: presence?.id || 0, name, color, me: true, where: zoneOf(p.x, p.z) }];
    if (presence) {
      for (const o of [...presence.peers.values()].sort((a, b) => a.name.localeCompare(b.name))) {
        const known = o.visible || o.far, d = known ? Math.hypot(o.x - p.x, o.z - p.z) : 0;
        people.push({ id: o.id, name: o.name, color: o.color, where: known ? `${d < 1000 ? `${Math.round(d)} m away` : 'far away'}${zoneOf(o.x, o.z) ? ` · ${zoneOf(o.x, o.z)}` : ''}` : '' });
      }
    }
    hud.showRoster({ people, mode: presence?.mode || 'offline', admin: who.admin && presence?.admin, details: roster.details, bans: roster.bans, now: roster.now });
  };
  const refreshRoster = async () => {
    if (!who.admin) return;
    presence?.who();
    roster.bans = (await callApi('api/bans', { key: who.key }))?.bans || null;
    if (hud.rosterOpen) showRoster();
  };

  // ---------- interface actions
  // an animal of light is earned by coming back several days in a row (the administrator has them all)
  const unlocked = (e) => !e.rank || who.admin || who.days >= e.days;
  const showEmotes = () => hud.setEmotes(EMOTE_LIST.map((e, i) => ({ index: i, ...e, locked: !unlocked(e) })), who.days);
  const emote = (i) => {
    const e = EMOTE_LIST[i];
    if (state.mode !== 'walk' || !e || player.dead) return false;
    if (e.rank) {
      if (!unlocked(e)) { hud.note(`The ${e.label.toLowerCase()} comes to those who visit ${e.days} days in a row (you are at ${who.days})`, 4200); return false; }
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
    [0xd8797277, () => { timers.bighead = 12; return 'Your head feels… roomy.'; }],
    [0xdb851716, () => {
      if (player.seat || player.swimming || player.cave) return 'Not here!';
      player.riding = true;
      return 'A quad! Shift goes faster, E gets off.';
    }],
    [0x9b3e5c80, () => { timers.moon = 25; return 'Gravity went for a walk.'; }],
    [0x58ffc1db, () => { timers.turbo = 20; return 'Legs: upgraded.'; }],
    [0x26b6b2ab, () => { delete timers.giant; timers.tiny = 20; return 'Everything looks bigger from down here.'; }],
    [0xb77215b9, () => { timers.disco = 15; return 'Disco!'; }],
    [0x9c5b13ae, () => { delete timers.tiny; timers.giant = 20; return 'Mind the lamp posts.'; }],
    [0x3f66406c, () => { timers.spring = 25; return 'Boing.'; }],
    [0xc4c40e95, () => {
      if (player.seat || player.cave || player.dead) return 'Not here!';
      timers.rocket = 9; player.launch(34);
      return 'Lift-off!';
    }],
    [0xa2793b81, () => { timers.skate = 20; return 'Somebody waxed the valley.'; }],
    [0x8354f3fc, () => { timers.fisheye = 20; return 'What big eyes you have.'; }],
  ]);
  const command = (text) => {
    const [word, ...rest] = text.slice(1).trim().split(/\s+/), name = word.toLowerCase();
    const tell = (line) => hud.addChat('✦', 5, line, true);
    if (name === 'kill') { if (!player.dead) player.die('Took the easy way out', [SPAWN.x, SPAWN.z, SPAWN.yaw + Math.PI]); return; }
    if (name === 'admin') { adminKey(rest.join(' ')); return; }
    const e = emoteIndex(name);
    if (e >= 0) { emote(e); return; }
    const secret = SECRETS.get(fingerprint(word.toUpperCase()));
    tell(secret ? secret() : 'Unknown command.');
  };
  // characters to talk to: near one of them, what is typed goes to it and to nobody else
  const npcs = world.npcs.map((n) => ({ ...n, brain: new Npc(n.id), tag: hud.tag(`npc-${n.id}`, n.name, 3), met: false }));
  let talking = null;
  world.actionSources.push((p) => {
    const n = npcs.find((q) => (q.x - p.pos.x) ** 2 + (q.z - p.pos.z) ** 2 < q.reach * q.reach);
    return n ? { label: `Talk to ${n.name}`, run: () => {
      talking = n;
      hud.toggleChat(true, n.brain.ask || `Say something to ${n.name}…`);
      if (!n.met) { n.met = true; const hello = n.brain.greeting(); hud.addChat(n.name, 3, hello); hud.say(n.tag, hello); }
    } } : null;
  });
  const say = (text, channel = 'all') => {
    if (!cleanChat(text)) return;
    if (text.trim().startsWith('/')) { if (state.mode === 'walk') command(text.trim()); return; }
    if (talking) {
      const n = talking, mine = cleanChat(text);
      hud.addChat(name, color, mine, true);
      hud.say(hud.selfTag, mine);
      n.brain.reply(mine).then((answer) => { hud.addChat(n.name, 3, answer); hud.say(n.tag, answer); });
      return;
    }
    const near = channel === 'near'; // (heard within twenty metres only)
    const sent = presence ? presence.sendChat(text, near) : cleanChat(text);
    if (!sent) { hud.note('Not so fast: a line every two seconds'); return; }
    hud.addChat(name, color, sent, true, near);
    hud.say(hud.selfTag, sent);
  };
  // the climb: a clock while climbing, the board of the best times at the gate
  const skyScores = new Scores('sky');
  const lists = (tops) => Object.fromEntries(Object.entries(tops).map(([k, v]) => [k, v])); // (already { name, score })
  skyScores.tops().then((tops) => world.games.setScores(lists(tops)));
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
  const chooseVillage = () => {
    const here = sky.villageAt(player.pos.x, player.pos.z);
    const list = sky.villages.filter((v) => v !== here);
    hud.choose('The sky villages', 'Perched on the mountains all around. Pick one: you will be carried there.', list.map((v) => ({ label: v.name, note: v.motto, color: v.color })))
      .then((i) => { if (i !== null && state.mode === 'walk' && !player.dead) travel(list[i], `Welcome to ${list[i].name}`); });
  };
  const near = (p, q, r) => (p.pos.x - q[0]) ** 2 + (p.pos.z - q[1]) ** 2 < r * r;
  world.actionSources.push((p) => {
    if (near(p, [sky.gate.x, sky.gate.z], 3.6)) return { label: 'Travel to a sky village', run: chooseVillage };
    const v = sky.villageAt(p.pos.x, p.pos.z);
    return v && near(p, v.ring, 3.2) ? { label: 'Back to the valley', run: () => travel(sky.gate, 'Back in the valley') } : null;
  });
  world.actionSources.push((p) => {
    const v = sky.villageAt(p.pos.x, p.pos.z);
    if (!v) return null;
    if (near(p, v.ring, 3.2)) return { label: 'Another village', run: chooseVillage };
    return v.url && near(p, v.sign, 3.4) ? { label: `Visit ${v.name}`, run: () => window.open(v.url, '_blank', 'noopener,noreferrer') } : null;
  });
  Object.assign(app, { travel, sky });
  const toggleCamera = () => { if (state.mode === 'walk') { if (mayFly()) setMode('free'); } else if (state.mode === 'free') setMode('walk'); };
  const savedQuality = store.get('mmf.quality');
  const qualityChoice = params.get('q') && TIERS[params.get('q')] ? params.get('q') : savedQuality && TIERS[savedQuality] ? savedQuality : 'auto';
  const showQuality = () => hud.setQuality(qualityChoice, engine.tierId, engine.scale, engine.detail, engine.tier.phone);
  showQuality();
  engine.on('detail', showQuality);
  hud.setName(name);
  hud.setHat(look.hat);
  hud.setSettings(settings);
  hud.setVolume(volume);
  showEmotes();
  hud.setPresence('offline', 1);
  // who may fly the camera about (everyone, or the administrator alone: see app/config.js)
  const mayFly = () => FEATURES.freeCamera === 'everyone' || who.admin;
  hud.setFreeCamera(mayFly());
  // the administrator: `/admin <key>` in the chat (or #admin=<key> in the address) — the key is checked by the server
  const adminKey = async (key) => {
    key = String(key || '').trim();
    if (!key) { store.del('mmf.admin'); who.admin = false; }
    else {
      const ok = (await callApi('api/admin', { key }))?.ok === true;
      who.admin = ok;
      who.key = ok ? key : '';
      if (ok) store.set('mmf.admin', key); else store.del('mmf.admin');
    }
    if (!who.admin) who.key = '';
    presence?.setAdminKey(who.key);
    hud.addChat('✦', 5, who.admin ? 'Administrator: on.' : key ? 'That key was not recognised.' : 'Administrator: off.', true);
    hud.setFreeCamera(mayFly());
    showEmotes();
    app.onAdmin?.(who.admin ? key : '');
  };
  {
    const fromHash = /[#&]admin=([^&]+)/.exec(location.hash);
    if (fromHash) { history.replaceState(null, '', location.pathname + location.search); adminKey(decodeURIComponent(fromHash[1])); }
    else if (store.get('mmf.admin')) adminKey(store.get('mmf.admin'));
  }
  countVisit().then((v) => { who.days = v.days; showEmotes(); if (v.days > 1) setTimeout(() => hud.note(`Day ${v.days} in a row — welcome back!`, 5000), 9000); });
  hud
    .on('camera', toggleCamera)
    .on('emote', emote)
    .on('interact', () => interact.press(0))
    .on('interact2', () => interact.press(1))
    .on('say', say)
    .on('roster', () => { showRoster(); refreshRoster(); })
    .on('kick', (id) => { presence?.kick(id); setTimeout(refreshRoster, 500); })
    .on('ban', (id, hours) => { presence?.ban(id, hours); setTimeout(refreshRoster, 800); })
    .on('unban', async ({ kind, key }) => { await callApi(`api/bans?${kind}=${encodeURIComponent(key)}`, { method: 'DELETE', key: who.key }); refreshRoster(); })
    .on('hat', (i) => { if (owns(HATS[i]?.id)) { look.hat = i; store.set('mmf.hat', String(i)); } })
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
    .on('color', (i) => { color = i; me.setColor(i); presence?.setIdentity(name, color); })
    .on('name', (n) => { if (!n) return; name = n; presence?.setIdentity(name, color); store.set('mmf.name', name); })
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
  input.on('drop', () => { if (look.bouquet) { look.bouquet = false; look.kinds = undefined; } });
  input.on('chat', () => { if (state.mode === 'walk' || state.mode === 'free') hud.toggleChat(true, talking ? talking.brain.ask || `Say something to ${talking.name}…` : undefined); });
  input.on('respawn', () => { if (state.mode === 'walk') { spawn(); hud.note('Back to the mill'); } });
  input.on('menu', () => { hud.panel.classList.remove('on'); hud.emotes.classList.remove('on'); hud.toggleBigMap(false); hud.toggleChat(false); hud.closeChoice(); hud.closeRoster(); });
  input.on('map', () => { if (state.mode === 'walk' || state.mode === 'free') hud.toggleBigMap(); });
  hud.setMap(data.meta.map, ZONES);
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
    } else if (mode === 'walk') {
      for (let i = 0; i < 10; i++) if (input.pressed(`Digit${(i + 1) % 10}`)) emote(hud.quickEmote(i));
      if (input.pressed('KeyE')) interact.press(0);
      if (input.pressed('KeyL')) interact.press(1);
      player.update(dt, rig.heading, true);
      rig.update(dt, player.pos, player);
      if (state.blend) {
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
    }
    camera.updateMatrixWorld();
    interact.update(mode === 'walk');
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
      player.gravity = timers.moon ? 0.22 : 1;
      player.boost = timers.turbo ? 2.2 : 1;
      player.spring = timers.spring ? 2 : 1;
      player.grip = timers.skate ? 0.09 : 1;
      player.cheat = !!(timers.moon || timers.turbo || timers.spring || timers.skate || timers.rocket);
      me.size = timers.tiny ? 0.45 : timers.giant ? 2.3 : 1;
      const fov = timers.fisheye ? 104 : engine.width < engine.height ? 68 : 55;
      if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
      if (timers.disco) me.setColor(Math.floor(state.time * 6) % 16); else if (me.colorIndex !== color) me.setColor(color);
      look.bighead = !!timers.bighead;
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
    engine.renderer.render(scene, camera);
    if (world.profile) { world.profile.mainPass = (world.profile.mainPass || 0) + performance.now() - t0; world.profile.frames = (world.profile.frames || 0) + 1; }

    // interface, a few times per second
    slow += dt; zoneTimer += dt;
    if (zoneTimer > 0.4 && (mode === 'walk' || mode === 'free')) {
      zoneTimer = 0;
      const p = mode === 'walk' ? player.pos : camera.position;
      let best = null, bestD = 1;
      for (const z of ZONES) { const d = Math.hypot(p.x - z.x, p.z - z.z) / z.r; if (d < bestD) { bestD = d; best = z; } }
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
    const who = await hud.welcome({ name, color, touch });
    name = who.name; color = who.color;
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
