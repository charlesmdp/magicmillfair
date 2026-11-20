// Application entry: boot sequence, game loop and modes (intro, walk, free camera, benchmark).
import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { Input } from './core/Input.js';
import { isMobile, TIERS } from './core/Quality.js';
import { World } from './world/World.js';
import { FreeCamera } from './player/FreeCamera.js';
import { CharacterFactory, EMOTES, RANK_EMOTES } from './player/Character.js';
import { PlayerController } from './player/PlayerController.js';
import { CameraRig } from './player/CameraRig.js';
import { Interact } from './player/Interact.js';
import { RankEmotes } from './player/RankEmotes.js';
import { Hud } from './ui/Hud.js';
import { Presence, cleanChat } from './net/Presence.js';
import { RemoteAvatars } from './net/RemoteAvatars.js';
import { Benchmark } from './app/Benchmark.js';
import { SPAWN, ZONES } from './world/layout/layout.js';

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
const app = { ready: false, frames: 0, THREE };
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
  const label = (p) => (p < 0.5 ? 'Mountains, maps and textures…' : p < 0.7 ? 'Ponds, streams and reflections…' : p < 0.9 ? 'Planting the forest…' : 'Building the mill and the pier…');
  const factoryLoading = new CharacterFactory({ blobShadow: !engine.tier.shadowDynamic }).load();
  await world.load((p) => hud.setProgress(p * 0.94, label(p)));
  const factory = await factoryLoading;
  hud.setProgress(0.97, 'Shadows and finishing touches…');
  await new Promise((r) => requestAnimationFrame(r));
  world.buildCollision();
  world.bakeShadows();

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
    presence.on('chat', ({ id, peer, text }) => { hud.addChat(peer.name, peer.color, text); avatars.say(id, text); });
    // no toast when the list is merely rebuilt because the connection changed (local <-> online)
    let shownMode = presence.mode;
    presence.on('status', ({ mode, count }) => { shownMode = mode; hud.setPresence(mode, count); });
    presence.on('join', (peer) => { if (presence.mode === shownMode) hud.note(`${peer.name} joined`); });
    presence.on('leave', (peer) => { if (presence.mode === shownMode) hud.note(`${peer.name} left`); });
    presence.connect();
    Object.assign(app, { presence, avatars });
  };

  // ---------- interface actions
  const emote = (i) => {
    if (state.mode !== 'walk') return;
    if (i < EMOTES.length) { if (me.resting) return; me.emote(i); } // seated: only the animals of light
    else if (i < EMOTES.length + RANK_EMOTES.length) rank.play(RANK_EMOTES[i - EMOTES.length], me.root);
    else return;
    presence?.sendEmote(i);
  };
  // sitting, lying down, boarding
  const interact = new Interact({ player, world, hud, peers: () => (avatars ? avatars.list : []) });
  app.interact = interact;
  // chat: shown to those who are there, kept nowhere
  const say = (text) => {
    if (!cleanChat(text)) return;
    const sent = presence ? presence.sendChat(text) : cleanChat(text);
    if (!sent) { hud.note('Not so fast: a line every two seconds'); return; }
    hud.addChat(name, color, sent, true);
    hud.say(hud.selfTag, sent);
  };
  const toggleCamera = () => { if (state.mode === 'walk') setMode('free'); else if (state.mode === 'free') setMode('walk'); };
  const savedQuality = store.get('mmf.quality');
  const qualityChoice = params.get('q') && TIERS[params.get('q')] ? params.get('q') : savedQuality && TIERS[savedQuality] ? savedQuality : 'auto';
  const showQuality = () => hud.setQuality(qualityChoice, engine.tierId, engine.scale, engine.detail, engine.tier.phone);
  showQuality();
  engine.on('detail', showQuality);
  hud.setName(name);
  hud.setPresence('offline', 1);
  hud
    .on('camera', toggleCamera)
    .on('emote', emote)
    .on('interact', () => interact.press(0))
    .on('interact2', () => interact.press(1))
    .on('say', say)
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
  input.on('chat', () => { if (state.mode === 'walk' || state.mode === 'free') hud.toggleChat(true); });
  input.on('respawn', () => { if (state.mode === 'walk') { spawn(); hud.note('Back to the mill'); } });
  input.on('menu', () => { hud.panel.classList.remove('on'); hud.emotes.classList.remove('on'); hud.toggleBigMap(false); hud.toggleChat(false); });
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
      for (let i = 0; i < 10; i++) if (input.pressed(`Digit${(i + 1) % 10}`)) emote(i);
      if (input.pressed('KeyE')) interact.press(0);
      if (input.pressed('KeyL')) interact.press(1);
      player.update(dt, rig.heading, true);
      rig.update(dt, player.pos);
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
    rank.update(dt, camera);
    me.setAmbient(player.cave ? player.cave.light(player.pos.x, player.pos.z) : 1); // dim in the caves
    {
      // rings on the water around the swimmer, a splash when dropping in
      const p = player.pos, level = data.waterAt(p.x, p.z);
      if (player.splashed) { if (level > -500) world.ripples.splash(engine.time, p.x, level, p.z, player.splashed); player.splashed = 0; }
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

    if (presence) {
      presence.setLocal(player.pos.x, player.pos.y, player.pos.z, player.yaw, player.anim, mode === 'free' ? 1 : 0);
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
      if (best) hud.setZone(best.name);
    }
    if (mode === 'walk' || mode === 'free') {
      const p = mode === 'walk' ? player.pos : camera.position;
      const heading = mode === 'walk' ? rig.yaw : free.yaw, others = avatars ? avatars.list : [];
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
