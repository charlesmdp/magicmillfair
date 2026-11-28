// Toy weapons, as an extra: the toys of a fair — a cork gun, a spark zapper — that anybody can draw, and a robot
// that is hit falls as after a strange mushroom, lies there a few seconds and stands again where it fell. Asked
// for by the owner on 28 November 2026 ("des armes: quand je tire sur un robot, ça le « tue » — momentanément,
// comme lorsqu'on mange un champignon"). Its switch: `weapons` (RELEASE in src/app/config.js), off as delivered.
//
// Who decides that a robot falls: the browser of the one who is hit, and nobody else. A shot is a small message
// ("I fired this toy, at this visitor, the cork ends there") handed on by the relay to those near, as the boats
// and the games do (Presence.sendThing: no change to the protocol). The browser it is aimed at agrees only from
// what it knows itself — where it stands, what it is doing, and where the relay places the one who shot (never
// what the message says of it): see judge(). Nobody is felled from the other end of the island, nor twice in a
// row, by a browser that lies. Then it says that it fell, and by whom.
//
// Where toys do nothing — neither firing nor being hit: in a game, seated or on a ride, in the water, in a cave
// (the caves are safe places), in The Sanctuary, round where newcomers arrive by the mill, on who is typing or
// in a menu, and on who has just stood up (a shimmer says so). Barnaby the butler cannot be felled.
//
// Plugged in from outside (window.__mmf): no file of the game is changed. What it reaches into: the two-bone arm
// of Character (`_keep`, `_ik`: the hand is put on the grip after the robot has been animated, as the game does
// for a bouquet), the points of world.sparks (`_spawn`), the voices of audio.effects, and RemoteAvatars.update
// (wrapped, so that the others' arms are bent after they have been animated).
import * as THREE from 'three';
import { MeshBuilder, Parts } from '../world/props/MeshBuilder.js';
import { ANIM } from '../player/Character.js';
import { SPAWN } from '../world/layout/layout.js';

/**
 * A choice kept ready for the owner. false: anybody who walks about can be felled. true: only those who have
 * their own toy drawn can be — a duel between the willing; who has none in hand is left alone.
 */
export const ONLY_ARMED = false;

/**
 * The toys, in the order of the numbers that travel (only ever add at the end). `range` (m), `reload` (s),
 * `speed` (m/s; 0: at once), `reach`: how near the middle of a robot the sight has to pass (m), `cone`: the
 * help to the aim on a phone — the robot nearest the sight within that angle (radians) is the one.
 */
export const TOYS = [
  // slow and long: one cork, then a second and a half to push the next one in — it has to be aimed
  { id: 'cork', name: 'Cork gun', verb: 'Corked', range: 28, reload: 1.5, speed: 30, reach: 0.55, cone: 0.1 },
  // quick and short: a spark that jumps a few metres at once, and again half a second later
  { id: 'zap', name: 'Spark zapper', verb: 'Zapped', range: 9, reload: 0.55, speed: 0, reach: 0.7, cone: 0.17 },
];

export const RULES = {
  safe: 25, // m round where newcomers arrive, by the mill: toys do nothing there
  shield: 6, // s out of reach after standing again
  slack: 4, // m forgiven on the range: two browsers never quite agree on where each robot is
  haste: 0.7, // a toy heard again sooner than this share of its reload is not believed
  sight: 0.3, // where the sight is on the screen, above the middle (one's own robot stands in the middle)
};

const KIND = 9; // (the relay's "kind" of these messages: the boats have 1, who plays what 15)
const OP = { hold: 7701, fire: 7702, fell: 7703, nope: 7704 }; // (what a message is: its "run")
const SILENT = 4; // s without a word: that visitor has put the toy away
/** Why a shot did nothing, as it travels back to who fired, and what is said of it there. */
const WHY = ['', 'shield', 'game', 'seat', 'cave', 'sanctuary', 'mill', 'menu', 'swim', 'unarmed', 'far', 'wall', 'haste', 'down', 'safe', 'unseen', 'toy'];
const SAID = {
  shield: (n) => `${n} has just stood up: out of reach for a moment.`, game: (n) => `${n} is in a game.`, seat: (n) => `${n} is sitting: left alone.`,
  cave: (n) => `${n} is in a cave: a safe place.`, sanctuary: (n) => `${n} is in The Sanctuary.`, mill: (n) => `${n} is by the mill, where everybody arrives.`,
  menu: (n) => `${n} is busy: left alone.`, swim: (n) => `${n} is in the water.`, unarmed: (n) => `${n} has no toy in hand: no duel.`,
  far: (n) => `${n} is too far.`, wall: (n) => `Something stands between you and ${n}.`, safe: () => 'No toys from where you stand.',
};
const HERE = {
  shield: 'You have just stood up: no toys for a moment.', game: 'No toys during a game.', seat: 'No toys while seated.', swim: 'No toys in the water.',
  cave: 'The caves are safe places: no toys in here.', sanctuary: 'No toys in The Sanctuary.', mill: 'No toys by the mill, where everybody arrives.',
};

/**
 * Does a shot fell the one it is aimed at? Asked in the browser of who is hit, of what that browser knows:
 *   toy       which toy the message names
 *   quiet     why toys do nothing on oneself just now ('' when nothing is in the way)
 *   onlyArmed, armed   the rule of the duel, and whether one's own toy is drawn
 *   seen      the relay says where the one who shot is
 *   safe      …and that is a place toys do not fire from (the mill, a cave, a seat)
 *   dist      metres between that place and oneself
 *   since     seconds since that visitor's last shot was heard
 *   wall      a building stands between the two
 * Returns '' (one falls) or why not.
 */
export function judge(o) {
  const toy = TOYS[o.toy];
  if (!toy) return 'toy';
  if (o.quiet) return o.quiet;
  if (o.onlyArmed && !o.armed) return 'unarmed';
  if (!o.seen) return 'unseen';
  if (o.safe) return 'safe';
  if (!(o.dist <= toy.range + RULES.slack)) return 'far';
  if (o.since < toy.reload * RULES.haste) return 'haste';
  if (o.wall) return 'wall';
  return '';
}

// ---- the toys themselves: a few boxes and cylinders painted in their vertices; the grip at the origin, the barrel along +z
// Where the grip is held, in the robot's own frame (x to its left, y up, z forward): out to its right, clear of
// its head — which is nearly a metre wide —, so that whoever plays it sees the toy from behind.
const GRIP = [-0.56, 0.86, 0.28];
const BIG = 1.3; // (the toys of a fair: larger than life)
const FLY = 2.6; // (…and the cork that flies larger still: it has to be seen from thirty metres)
const MUZZLE = [[0, 0.045 * BIG, 0.47 * BIG], [0, 0.05 * BIG, 0.43 * BIG]]; // the mouth of each toy, from its grip
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ball = (b, x, y, z, r) => b.add(new THREE.SphereGeometry(r, 10, 7), new THREE.Matrix4().makeTranslation(x, y, z));
function buildToys(mats) {
  const cork = new Parts(), plug = new Parts(), zap = new Parts();
  {
    const p = cork.get('paint'), y = 0.045;
    p.tint(0.5, 0.29, 0.13).beam(V(0, -0.15, -0.045), V(0, 0.005, 0), 0.055, 0.07); // a wooden grip
    p.tint(0.86, 0.12, 0.09).rod(V(0, y, -0.12), V(0, y, 0.3), 0.05, 12); // the barrel, fire-engine red
    p.tint(0.98, 0.76, 0.1).rod(V(0, y, 0.3), V(0, y, 0.41), 0.05, 12, { r1: 0.092 }).rod(V(0, y, 0.0), V(0, y, 0.035), 0.06, 12).rod(V(0, y, -0.12), V(0, y, -0.095), 0.06, 12); // a brass bell and two rings
    p.tint(0.6, 0.62, 0.66).rod(V(0, y, -0.22), V(0, y, -0.12), 0.018, 8); // the rod of the pump
    ball(p.tint(0.12, 0.36, 0.85), 0, y, -0.235, 0.042); // …and its blue knob
    plug.get('paint').tint(0.83, 0.63, 0.4).rod(V(0, y, 0.385), V(0, y, 0.47), 0.056, 10, { r1: 0.047 }); // the cork
  }
  {
    const p = zap.get('paint'), y = 0.05;
    p.tint(0.96, 0.42, 0.08).beam(V(0, -0.14, -0.04), V(0, 0.005, 0), 0.05, 0.065); // an orange grip
    p.tint(0.08, 0.6, 0.62).cube(0, y, 0.045, 0.085, 0.1, 0.23); // a teal box of tin
    p.tint(0.72, 0.74, 0.8).rod(V(0, y, 0.16), V(0, y, 0.39), 0.02, 8).beam(V(0, 0.1, -0.02), V(0, 0.2, -0.06), 0.014, 0.014); // the rod, and an aerial
    p.tint(1.0, 0.8, 0.12); for (const [z, r] of [[0.2, 0.068], [0.265, 0.056], [0.33, 0.044]]) p.rod(V(0, y, z), V(0, y, z + 0.018), r, 14); // three discs
    ball(p.tint(0.9, 0.14, 0.12), 0, 0.215, -0.066, 0.024);
    ball(zap.get('glow').tint(0.5, 0.95, 1.5), 0, y, 0.41, 0.04); // the tip, alight
  }
  const corkGun = cork.toMeshes(mats, { name: 'toy-cork' }), stopper = plug.toMeshes(mats, { name: 'toy-plug' });
  corkGun.add(stopper);
  const toys = [corkGun, zap.toMeshes(mats, { name: 'toy-zap' })];
  for (const t of toys) t.scale.setScalar(BIG);
  return toys;
}

const css = `
.toys { position: absolute; right: calc(14px + var(--safe-r)); bottom: calc(16px + var(--safe-b)); display: flex; align-items: center; gap: 8px; pointer-events: none; }
.toys button { pointer-events: auto; display: grid; place-items: center; padding: 0; color: #f6e7c8; }
.toys svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.toys .toy-draw { position: relative; width: 42px; height: 42px; border-radius: 50%; background: var(--panel); border: 1px solid rgba(255, 255, 255, 0.22); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.toys .toy-draw[aria-pressed='true'] { background: rgba(242, 193, 78, 0.9); color: #2a1d05; border-color: transparent; }
.toys .toy-draw kbd { position: absolute; right: -3px; bottom: -3px; min-width: 16px; padding: 0 3px; border-radius: 5px; background: var(--accent); color: #2a1d05; font: 700 10px/1.5 system-ui, sans-serif; text-align: center; }
.toys .toy-fire { display: none; }
.toys .toy-line { padding: 6px 12px; border-radius: 999px; background: var(--panel); border: 1px solid rgba(242, 193, 78, 0.5); font: 500 12.5px/1.3 system-ui, sans-serif; color: #f6e7c8; white-space: nowrap; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
.toys .toy-line:empty { display: none; }
.toys .toy-line b { color: var(--accent); font-weight: 700; }
.free .toys, .dead .toys { display: none; }
.touch .toys { right: calc(158px + var(--safe-r)); bottom: calc(22px + var(--safe-b)); flex-direction: column-reverse; align-items: flex-end; gap: 10px; }
.touch .toys .toy-draw { width: 52px; height: 52px; border: 1.5px solid rgba(255, 255, 255, 0.3); background: rgba(255, 255, 255, 0.12); }
.touch .toys .toy-draw[aria-pressed='true'] { background: rgba(242, 193, 78, 0.9); border-color: transparent; }
.touch .toys .toy-draw kbd, .touch .toys .toy-line { display: none; }
.touch .toys .toy-fire.on { display: grid; width: 70px; height: 70px; border-radius: 50%; border: 1.5px solid rgba(255, 255, 255, 0.45); background: rgba(222, 62, 44, 0.82); color: #fff; }
.touch .toys .toy-fire svg { width: 30px; height: 30px; }
.touch .toys .toy-fire:active { background: rgba(242, 193, 78, 0.85); color: #2a1d05; }
.touch .toys .toy-fire.wait { opacity: 0.45; }
`;
const ICONS = {
  toy: '<svg viewBox="0 0 24 24"><path d="M3 8h12l4-2v8l-4-2H3z"/><path d="M6 12l-1.5 6h4L10 12"/><path d="M21 10h.01"/></svg>',
  fire: '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.2 5.6 5.9-1.4-3.5 4.9 3.9 4.6-6-.4-2.5 5.7-2.5-5.7-6 .4 3.9-4.6L3.9 6.7l5.9 1.4z"/></svg>',
};

const _o = V(0, 0, 0), _d = V(0, 0, 0), _m = V(0, 0, 0), _c = V(0, 0, 0), _v = V(0, 0, 0), _w = V(0, 0, 0), _t = V(0, 0, 0), _q = new THREE.Quaternion(), _s = V(0, 0, 0), _mat = new THREE.Matrix4(), FWD = V(0, 0, 1);
const rnd = (a, b) => a + Math.random() * (b - a);
const upright = (a) => a === ANIM.idle || a === ANIM.walk || a === ANIM.run || a === ANIM.jump;

/** Switches the toys on (in the running game). Returns what the checks and the pictures drive them with. */
export function attach(app) {
  const { world, player, hud } = app, col = world.collision, data = world.data, me = app.me;
  if (!me?.root || !world.materials?.paint || !hud?.hud) return null;
  const models = buildToys(world.materials);
  const group = new THREE.Group();
  group.name = 'weapons';
  world.scene.add(group);
  // what is mine: the toy in hand (-1: none), when it may fire again, how long one is still out of reach
  const S = { toy: -1, last: 0, ready: 0, fired: -99, kick: 0, shield: 0, model: null, i: -1, plug: null, bubble: null, glint: 0 };
  const seen = new Map(); // visitor → what they said of their toy: { toy, shield, at, fired, kick, model… }
  let clock = 0, wasDead = !!player.dead, mine = null, pending = null, told = { toy: 0, shield: false, at: -99 }, said = { why: '', at: -99 }, sightOn = false;
  // (what the checks and the pictures read and drive; `onlyArmed`: the rule of the duel, as it is here; `pace`: how
  // fast the shots drawn here fly — a picture slows them down to catch one in the air)
  const api = {
    toys: TOYS, rules: RULES, onlyArmed: ONLY_ARMED, pace: 1, log: [], heard: seen, group,
    get toy() { return S.toy; }, get shield() { return S.shield; }, get loaded() { return clock >= S.ready; }, get down() { return !!mine; },
  };
  const note = (what, o) => { api.log.push({ what, ...o }); if (api.log.length > 40) api.log.shift(); };
  const isTouch = () => !!app.input.isTouch || hud.root.classList.contains('touch');
  const myId = () => app.presence?.id || 0;

  // ---- sounds, made when they are asked for (the voices of the game's own effects: audio/Effects.js)
  const POP = (s, t) => { s.tone(t, 'sine', 620, 120, 0.07, 0.42, 0.001, 0.012, 0.035); s.noise(t, 'white', 'bandpass', 1700, 500, 1, 0.12, 0.001, 0.008, 0.03); s.tone(t + 0.012, 'triangle', 240, 90, 0.09, 0.2, 0.002, 0.03, 0.05); };
  const ZAP = (s, t) => { s.tone(t, 'sawtooth', 2100, 280, 0.13, 0.11, 0.002, 0.07, 0.035); s.tone(t, 'square', 96, 62, 0.12, 0.09, 0.002, 0.09, 0.03); s.noise(t, 'white', 'highpass', 5200, 3000, 0.7, 0.05, 0.001, 0.05, 0.04); };
  const TINK = (s, t) => { s.tone(t, 'sine', 2380, 2380, 0, 0.12, 0.001, 0.004, 0.12); s.tone(t, 'sine', 3570, 3570, 0, 0.06, 0.001, 0.004, 0.08); };
  const BONK = (s, t) => { s.tone(t, 'sine', 300, 110, 0.12, 0.3, 0.002, 0.04, 0.07); s.noise(t, 'pink', 'lowpass', 700, 260, 0.7, 0.08, 0.002, 0.03, 0.06); };
  const sound = (recipe, x, z, loud = 1) => {
    const a = app.audio, fx = a?.effects;
    if (!fx || !a.live || !(a.levels?.sound > 0) || (!a.offline && a.ctx?.state !== 'running')) return;
    const v = loud * Math.max(0, 1 - Math.hypot(x - player.pos.x, z - player.pos.z) / 60);
    if (v < 0.03) return;
    fx.volume = v; fx.rate = rnd(0.94, 1.06);
    try { recipe(fx, a.ctx.currentTime + 0.005); } catch { /* no sound: the toy is seen all the same */ }
  };
  const spark = (o) => world.sparks?._spawn?.(o);

  // ---- where toys do nothing
  const menus = () => hud.chatOpen || hud.bigMapOpen || hud.rosterOpen || hud.panel?.classList.contains('on') || hud.emotes?.classList.contains('on');
  /** Why toys do nothing on oneself just now — neither firing nor being hit —, or '' when nothing is in the way. */
  const quiet = () => {
    const p = player.pos;
    if (player.dead) return 'down';
    if (!app.input.enabled || hud.root.classList.contains('free')) return 'menu';
    if (app.fair?.session || player.driver || world.games?.run?.state === 'running') return 'game';
    if (player.seat || player.riding || player.cross) return 'seat';
    if (player.swimming || player.diving) return 'swim';
    if (player.cave) return 'cave';
    if (app.sanctuary?.inside?.(p.x, p.y, p.z) > 0) return 'sanctuary';
    if ((p.x - SPAWN.x) ** 2 + (p.z - SPAWN.z) ** 2 < RULES.safe * RULES.safe) return 'mill';
    if (S.shield > 0) return 'shield';
    if (menus() || app.busyNow?.()) return 'menu';
    return '';
  };
  /** Is that visitor — placed where the relay says — somewhere toys do not fire from? */
  const safeAt = (q) => (q.x - SPAWN.x) ** 2 + (q.z - SPAWN.z) ** 2 < RULES.safe * RULES.safe || !!col.caveAt(q.x, q.z, q.y) || app.sanctuary?.inside?.(q.x, q.y, q.z) > 0 || !upright(q.anim);
  /** How much of the way from a to b is free (1: all of it): a building, or the ground, may stand in it. */
  const clear = (a, b) => {
    let f = col.segment(a.x, a.z, b.x, b.z);
    const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.5));
    for (let i = 1; i < n && i / n < f; i++) { const k = i / n; if (a.y + (b.y - a.y) * k < data.heightAt(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k) - 0.05) { f = (i - 1) / n; break; } }
    return f;
  };
  /** The mouth of toy `i` held by a robot standing at (x, y, z) and facing `yaw`. */
  const muzzle = (x, y, z, yaw, i, out) => {
    const s = Math.sin(yaw), c = Math.cos(yaw), lx = GRIP[0] + MUZZLE[i][0], lz = GRIP[2] + MUZZLE[i][2];
    return out.set(x + c * lx + s * lz, y + GRIP[1] + MUZZLE[i][1], z - s * lx + c * lz);
  };
  const shieldOf = (id) => (id === myId() ? S.shield : seen.get(id)?.shield || 0);

  // ---- a toy in a hand: the model hangs from the robot, and its right hand is put on the grip
  const bent = (c, bone) => { for (let k = 0; k < c._bentN; k++) if (c._bent[k].bone === bone) return true; return false; };
  const carry = (h, c, i, kick, loaded) => {
    if (h.model && (h.i !== i || h.model.parent !== c.root)) { h.model.removeFromParent(); h.model = null; }
    if (i < 0) return;
    if (!h.model) { h.model = models[i].clone(); h.i = i; h.plug = h.model.getObjectByName('toy-plug') || null; c.root.add(h.model); }
    const k = kick * kick, y = GRIP[1] + 0.05 * k, z = GRIP[2] - 0.08 * k;
    h.model.position.set(GRIP[0], y, z);
    h.model.rotation.x = -0.6 * k; // (it kicks up as it goes off)
    if (h.plug) h.plug.visible = loaded;
    const upper = c.bones?.UpperArmR, lower = c.bones?.LowerArmR, palm = c.bones?.Palm2R;
    if (!upper || !lower || !palm || !c._ik || !c._keep) return;
    // (the arm is given back as it was animated before the next step of its animation: Character._keep)
    if (!bent(c, upper)) c._keep(upper);
    if (!bent(c, lower)) c._keep(lower);
    c.root.updateMatrixWorld(true);
    c._ik(upper, lower, palm, c.root.localToWorld(_t.set(GRIP[0], y - 0.07, z - 0.02)));
  };
  // ---- out of reach: a bubble that shimmers round the robot, and glints
  const bubbleGeo = new THREE.SphereGeometry(1, 18, 12);
  // (a soap bubble: clear in its middle, bright at its rim, with bands of light that climb it)
  const bubbleMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vY; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; vY = position.y; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vY; void main() { float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0); float band = 0.5 + 0.5 * sin(vY * 15.0 - uTime * 8.0); float a = (0.1 + 0.8 * rim) * (0.6 + 0.4 * band) * (0.82 + 0.18 * sin(uTime * 27.0)); gl_FragColor = vec4(mix(vec3(0.5, 0.9, 1.0), vec3(1.0), rim * 0.7 + band * 0.2), a); }',
  });
  const shimmer = (h, at, dt) => {
    if (!at) { if (h.bubble) h.bubble.visible = false; return; }
    if (!h.bubble) { h.bubble = new THREE.Mesh(bubbleGeo, bubbleMat); h.bubble.renderOrder = 15; h.bubble.name = 'toy-shield'; group.add(h.bubble); }
    const s = 1 + 0.05 * Math.sin(clock * 11 + at.x);
    h.bubble.visible = true;
    h.bubble.position.set(at.x, at.y + 0.98, at.z);
    h.bubble.scale.set(0.66 * s, 1.1, 0.66 * s);
    h.glint = (h.glint || 0) + dt * 30;
    while (h.glint >= 1) {
      h.glint -= 1;
      const a = rnd(0, 6.283), u = rnd(-1, 1), r = 0.66 * Math.sqrt(1 - u * u);
      spark({ x: at.x + Math.cos(a) * r, y: at.y + 0.98 + u * 1.1, z: at.z + Math.sin(a) * r, vx: 0, vy: rnd(0.2, 0.7), vz: 0, life: rnd(0.25, 0.55), r: 0.7, g: 0.95, b: 1.0, glow: 2.6, size: rnd(0.06, 0.13) });
    }
  };

  // ---- a shot, as everybody near sees it: the cork that flies and pops, the spark that jumps
  const shots = [], bolts = [];
  const boltGeo = new MeshBuilder().tint(0.22, 0.6, 1.25).box(-0.5, -0.5, 0, 0.5, 0.5, 1).build();
  const shoot = (i, from, to, shielded) => {
    const toy = TOYS[i], len = from.distanceTo(to);
    _v.subVectors(to, from).normalize();
    for (let k = 0; k < 5; k++) spark({ x: from.x, y: from.y, z: from.z, vx: _v.x * rnd(1, 3) + rnd(-0.6, 0.6), vy: rnd(0.2, 1), vz: _v.z * rnd(1, 3) + rnd(-0.6, 0.6), life: rnd(0.25, 0.5), r: 0.95, g: 0.93, b: 0.86, glow: 0.75, size: rnd(0.14, 0.26), drag: 3 });
    sound(i ? ZAP : POP, from.x, from.z, i ? 0.8 : 1);
    if (toy.speed) {
      let s = shots.find((q) => q.t >= q.T);
      if (!s) { if (shots.length >= 8) return; s = { obj: models[0].getObjectByName('toy-plug').clone() }; s.obj.name = 'toy-shot'; s.obj.scale.setScalar(FLY); group.add(s.obj); shots.push(s); }
      Object.assign(s, { a: from.clone(), b: to.clone(), t: 0, T: Math.max(0.05, len / toy.speed), shielded, len });
      fly(s, 0);
      s.obj.visible = true;
    } else {
      let b = bolts.find((q) => q.t >= q.T);
      if (!b) { if (bolts.length >= 4) return; b = { mesh: new THREE.InstancedMesh(boltGeo, world.materials.glow, 9) }; b.mesh.frustumCulled = false; b.mesh.name = 'toy-bolt'; group.add(b.mesh); bolts.push(b); }
      Object.assign(b, { a: from.clone(), b: to.clone(), t: 0, T: 0.16, flick: 0.035 });
      jag(b);
      b.mesh.visible = true;
      for (let k = 0; k < 10; k++) spark({ x: to.x, y: to.y, z: to.z, vx: rnd(-2.5, 2.5), vy: rnd(-1, 3), vz: rnd(-2.5, 2.5), life: rnd(0.2, 0.45), r: 0.6, g: 0.95, b: 1.0, glow: 3, size: rnd(0.07, 0.16), grav: 5 });
      if (shielded) sound(TINK, to.x, to.z, 0.7);
    }
  };
  /** The cork of shot `s`, `k` of its way along (0 to 1): a flat arc, turning as it goes. */
  const fly = (s, k) => {
    s.obj.position.lerpVectors(s.a, s.b, k);
    s.obj.position.y += Math.sin(k * Math.PI) * s.len * 0.012;
    s.obj.quaternion.setFromUnitVectors(FWD, _v.subVectors(s.b, s.a).normalize());
    s.obj.rotateZ(s.t * 22);
    s.obj.translateY(-0.045 * FLY).translateZ(-0.43 * FLY); // (the cork sits at the mouth of its model: it is put so that it flies on the line)
  };
  /** The spark of bolt `b`: a broken line from the mouth of the zapper to where it lands. */
  const jag = (b) => {
    const n = b.mesh.count, len = b.a.distanceTo(b.b), wide = Math.min(0.45, 0.06 * len + 0.08);
    _c.copy(b.a);
    for (let k = 1; k <= n; k++) {
      _w.lerpVectors(b.a, b.b, k / n);
      if (k < n) _w.set(_w.x + rnd(-wide, wide), _w.y + rnd(-wide, wide), _w.z + rnd(-wide, wide));
      _v.subVectors(_w, _c);
      const l = _v.length();
      _q.setFromUnitVectors(FWD, _v.divideScalar(l || 1));
      b.mesh.setMatrixAt(k - 1, _mat.compose(_c, _q, _s.set(0.05, 0.05, l)));
      _c.copy(_w);
    }
    b.mesh.instanceMatrix.needsUpdate = true;
  };
  const moveShots = (dt) => {
    for (const s of shots) {
      if (s.t >= s.T) continue;
      s.t += dt;
      const k = Math.min(1, s.t / s.T);
      fly(s, k);
      // (a thread of smoke behind it, so that the eye follows)
      _w.lerpVectors(s.a, s.b, k);
      spark({ x: _w.x, y: _w.y + Math.sin(k * Math.PI) * s.len * 0.012, z: _w.z, vx: 0, vy: 0.15, vz: 0, life: 0.38, r: 1, g: 0.98, b: 0.93, glow: 0.85, size: rnd(0.1, 0.17) });
      if (k < 1) continue;
      s.obj.visible = false;
      // it pops where it lands: a puff, and bits of cork
      for (let n = 0; n < 9; n++) spark({ x: s.b.x, y: s.b.y, z: s.b.z, vx: rnd(-2.2, 2.2), vy: rnd(0.4, 3), vz: rnd(-2.2, 2.2), life: rnd(0.35, 0.7), r: 0.86, g: 0.68, b: 0.44, glow: 0.9, size: rnd(0.06, 0.12), kind: 1, grav: 6, drag: 1 });
      for (let n = 0; n < 4; n++) spark({ x: s.b.x, y: s.b.y, z: s.b.z, vx: rnd(-0.6, 0.6), vy: rnd(0.1, 0.8), vz: rnd(-0.6, 0.6), life: rnd(0.3, 0.5), r: 1, g: 0.98, b: 0.92, glow: 0.8, size: rnd(0.25, 0.4), drag: 2 });
      sound(s.shielded ? TINK : BONK, s.b.x, s.b.z, 0.6);
    }
    for (const b of bolts) {
      if (b.t >= b.T) continue;
      b.t += dt;
      if (b.t >= b.T) { b.mesh.visible = false; continue; }
      if ((b.flick -= dt) > 0) continue;
      b.flick = 0.035;
      jag(b); // (drawn anew a few times while it lasts)
    }
  };

  // ---- one's own toy
  const holding = () => S.toy >= 0 && upright(player.anim) && !player.driver && !app.fair?.session && !me.look?.disguise;
  /** Who the sight is on, and where a shot fired now would end: { peer (or null), end, butler }. */
  const aim = () => {
    const toy = TOYS[Math.max(0, S.toy)], cam = app.engine.camera, p = player.pos, helped = isTouch();
    _o.copy(cam.position);
    _d.set(0, RULES.sight, 0.5).unproject(cam).sub(_o).normalize();
    muzzle(p.x, p.y, p.z, Math.atan2(_d.x, _d.z), Math.max(0, S.toy), _m);
    const tMe = Math.max(0, _v.set(p.x, p.y + 1, p.z).sub(_o).dot(_d)); // (how far along the sight's ray one's own robot is)
    const guide = app.extras?.guide?.at, list = [];
    if (app.presence) for (const q of app.presence.peers.values()) if (q.visible && !q.far && !q.hidden) list.push(q);
    if (guide) list.push({ butler: true, x: guide.x, y: guide.y, z: guide.z });
    let best = null, score = Infinity;
    for (const q of list) {
      _c.set(q.x, q.y + 0.95, q.z);
      if (_c.distanceTo(_m) > toy.range) continue;
      const t = _v.subVectors(_c, _o).dot(_d);
      if (t < tMe + 0.4) continue; // (behind oneself: between the camera and one's own robot)
      // how far from their middle the sight passes — a robot is taller than it is wide: heights count for half
      _w.copy(_d).multiplyScalar(t).sub(_v);
      const miss = Math.hypot(_w.x, _w.y * 0.5, _w.z);
      if (!(miss < toy.reach || (helped && Math.atan2(miss, t) < toy.cone))) continue;
      const sc = helped ? miss / t : t; // (with a finger: the nearest to the sight; with a mouse: the first the sight is on)
      if (sc < score && clear(_m, _c) >= 1) { best = q; score = sc; }
    }
    if (best) return { peer: best.butler ? null : best, butler: !!best.butler, end: V(best.x, best.y + 1.0, best.z) };
    // nobody: the shot goes where the sight looks, as far as the toy carries — or to the ground, or a wall, before that
    const om = _v.subVectors(_o, _m), b = om.dot(_d), far = -b + Math.sqrt(Math.max(0, b * b - (om.lengthSq() - toy.range * toy.range)));
    let t = Math.max(tMe, far);
    for (let s = tMe + 1; s < far; s += 1) { if (_o.y + _d.y * s < Math.max(data.heightAt(_o.x + _d.x * s, _o.z + _d.z * s), data.waterAt(_o.x + _d.x * s, _o.z + _d.z * s))) { t = s; break; } }
    const end = V(_o.x + _d.x * t, _o.y + _d.y * t, _o.z + _d.z * t), f = clear(_m, end);
    if (f < 1) end.sub(_m).multiplyScalar(Math.max(0.02, f)).add(_m);
    return { peer: null, butler: false, end };
  };
  const explain = (why) => {
    const text = HERE[why];
    if (!text || (said.why === why && clock - said.at < 2.5)) return;
    said = { why, at: clock };
    hud.note(text, 2600);
  };
  const DRY = ['I would rather you did not.', 'Quite. The games are that way.', 'One does not shoot the staff.', 'Most amusing. Do carry on — elsewhere.'];
  let dry = 0;
  /** Fires the toy in hand where the sight looks. Returns what came of it: { peer, end, butler } or { why }. */
  const fire = () => {
    if (S.toy < 0) return { why: 'away' };
    const why = quiet();
    if (why) { explain(why); return { why }; }
    if (clock < S.ready) return { why: 'reload' };
    const toy = TOYS[S.toy], a = aim(), p = player.pos;
    S.ready = clock + toy.reload; S.fired = clock; S.kick = 1;
    if (Math.hypot(a.end.x - p.x, a.end.z - p.z) > 0.6) player.yaw = Math.atan2(a.end.x - p.x, a.end.z - p.z); // (the robot turns to where it fires)
    const from = muzzle(p.x, p.y, p.z, player.yaw, S.toy, V(0, 0, 0));
    shoot(S.toy, from, a.end, !!a.peer && shieldOf(a.peer.id) > 0);
    app.presence?.sendThing?.(KIND, OP.fire, [S.toy, a.peer ? a.peer.id : 0, a.end.x, a.end.y, a.end.z]);
    note('fire', { toy: S.toy, at: a.peer ? a.peer.id : 0 });
    if (a.butler) { const g = app.extras.guide, text = DRY[dry++ % DRY.length]; setTimeout(() => { g.character?.emote?.(4); hud.say(g.tag, text); hud.addChat('Barnaby', 15, text, false, 'private'); }, 350); } // (he shakes his head, and says a dry word to who fired — nobody else)
    return a;
  };
  const refresh = () => {
    const toy = TOYS[S.toy];
    drawBtn.setAttribute('aria-pressed', String(!!toy));
    drawBtn.title = toy ? `${toy.name} — put it away (C)` : 'Toys (C)';
    fireBtn.classList.toggle('on', !!toy);
    line.innerHTML = toy ? `<b>${toy.name}</b> · click: fire · N: the other toy · C: away` : '';
  };
  /** Draws toy `i` (the one held last, when none is named). False where no toy can be held. */
  const draw = (i = S.last) => {
    const why = quiet();
    if (why === 'down' || why === 'game' || why === 'seat' || why === 'swim' || (why === 'menu' && (!app.input.enabled || hud.root.classList.contains('free')))) { explain(why); return false; }
    S.toy = S.last = TOYS[i] ? i : 0;
    S.ready = Math.max(S.ready, clock + 0.25);
    app.audio?.play('click');
    if (isTouch()) hud.note(`${TOYS[S.toy].name}: the red button fires where you look.`, 3600); // (with keys, the line by the button says them)
    if (why) explain(why);
    refresh();
    return true;
  };
  const away = () => { if (S.toy < 0) return; S.toy = -1; app.audio?.play('click', { volume: 0.6 }); refresh(); };
  const next = () => draw(S.toy < 0 ? S.last : (S.toy + 1) % TOYS.length);
  // (a phone has one button for all of it: the first toy, the other one, away)
  const cycle = () => { if (S.toy < 0) draw(0); else if (S.toy + 1 < TOYS.length) draw(S.toy + 1); else away(); };

  // ---- the keys and the buttons. C: draw, put away; N: the other toy; a click on the world fires — on a phone, two buttons
  if (!document.getElementById('toys-style')) { const st = document.createElement('style'); st.id = 'toys-style'; st.textContent = css; document.head.append(st); }
  const ui = document.createElement('div');
  ui.className = 'toys';
  ui.innerHTML = `<div class="toy-line"></div><button type="button" class="toy-fire" aria-label="Fire">${ICONS.fire}</button><button type="button" class="toy-draw" aria-label="Toys" aria-pressed="false" title="Toys (C)">${ICONS.toy}<kbd>C</kbd></button>`;
  hud.hud.append(ui);
  const [line, fireBtn, drawBtn] = ui.children;
  const press = (b, fn) => {
    const down = (e) => { e.preventDefault(); e.stopPropagation(); fn(); b.blur(); };
    b.addEventListener('touchstart', down, { passive: false });
    b.addEventListener('mousedown', down);
  };
  press(drawBtn, () => (isTouch() ? cycle() : S.toy < 0 ? draw() : away()));
  press(fireBtn, fire);
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    // (by the letter printed on the key, as the game's own shortcuts; a keyboard without Latin letters: by its place)
    const key = typeof e.key === 'string' && e.key.length === 1 ? e.key.toLowerCase() : '', is = (letter, code) => (key >= 'a' && key <= 'z' ? key === letter : e.code === code);
    if (!app.input.enabled || hud.root.classList.contains('free')) return; // (not one's robot just now: the free camera has C for itself)
    if (is('c', 'KeyC')) { if (S.toy < 0) draw(); else away(); } else if (is('n', 'KeyN')) next();
  });
  // (a click on the world: at once while the mouse is locked; else when the button comes back up without having
  // dragged the view round)
  const canvas = app.input.target;
  let down = null;
  canvas?.addEventListener('mousedown', (e) => { if (e.button !== 0 || S.toy < 0) return; if (app.input.locked) fire(); else down = { x: e.clientX, y: e.clientY, at: performance.now() }; });
  window.addEventListener('mouseup', (e) => { const d = down; down = null; if (d && e.button === 0 && S.toy >= 0 && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6 && performance.now() - d.at < 400) fire(); });

  // ---- what travels: the toy one holds (said again every second and a half), a shot, a fall, a shot that did nothing
  const send = (op, numbers) => app.presence?.sendThing?.(KIND, op, numbers);
  const tell = () => {
    const toy = holding() ? S.toy + 1 : 0, shield = S.shield > 0;
    if (toy === told.toy && shield === told.shield && (clock - told.at < 1.5 || (!toy && !shield))) return;
    told = { toy, shield, at: clock };
    send(OP.hold, [toy, Math.round(S.shield * 10) / 10]);
  };
  const nopes = new Map();
  const heardShot = (e, st) => {
    const d = e.d, i = d[0], toy = TOYS[i], peer = e.peer, p = player.pos;
    if (!toy || !peer || ![d[2], d[3], d[4]].every(Number.isFinite)) return;
    const since = clock - st.fired;
    st.fired = clock; st.kick = 1; st.toy = i; st.at = clock;
    // (drawn from where their robot stands, and no further than their toy carries — whatever the message says)
    const end = V(d[2], d[3], d[4]), from = muzzle(peer.x, peer.y, peer.z, Math.atan2(end.x - peer.x, end.z - peer.z), i, V(0, 0, 0)), len = from.distanceTo(end), most = toy.range + RULES.slack;
    if (len > most) end.sub(from).multiplyScalar(most / len).add(from);
    if (peer.visible && !peer.hidden) shoot(i, from, end, d[1] > 0 && shieldOf(d[1]) > 0);
    if (!myId() || d[1] !== myId()) return;
    // …at me. Do I fall? Decided here, from what this browser knows itself.
    const dist = Math.hypot(peer.x - p.x, peer.y - p.y, peer.z - p.z);
    const why = judge({ toy: i, quiet: pending ? 'down' : quiet(), onlyArmed: api.onlyArmed, armed: S.toy >= 0, seen: !!peer.visible && !peer.far, safe: safeAt(peer), dist, since, wall: clear(from, _c.set(p.x, p.y + 1, p.z)) < 1 });
    note('shot', { by: e.id, toy: i, why, dist: Math.round(dist * 10) / 10 });
    if (why) {
      // (said back to who fired, once in a while: why nothing came of it)
      if (WHY.indexOf(why) > 0 && clock - (nopes.get(e.id) || -99) > 1) { nopes.set(e.id, clock); send(OP.nope, [e.id, WHY.indexOf(why)]); }
      return;
    }
    pending = { by: e.id, name: peer.name, toy: i, at: clock + (toy.speed ? Math.max(0, dist / toy.speed - 0.12) : 0) };
  };
  const fall = (h) => {
    const p = player.pos, toy = TOYS[h.toy];
    player.die(`${toy.verb} by ${h.name}`, [p.x, p.z, player.yaw]);
    if (!player.dead) return;
    // (where the body lies: it comes down to the ground if it was in the air, and stands again on that very floor)
    mine = { death: player.dead, x: p.x, z: p.z, yaw: player.yaw, vy: 0 };
    send(OP.fell, [h.by, h.toy]);
    note('fell', { by: h.by, toy: h.toy });
  };
  const onThing = (e) => {
    if (e.kind !== KIND || !Array.isArray(e.d) || !e.peer) return;
    const d = e.d, st = seen.get(e.id) || { toy: -1, shield: 0, at: -99, fired: -99, kick: 0, model: null, i: -1, plug: null, bubble: null, glint: 0 };
    seen.set(e.id, st);
    if (e.run === OP.hold) { st.toy = TOYS[d[0] - 1] ? d[0] - 1 : -1; st.shield = Math.min(RULES.shield, Math.max(0, +d[1] || 0)); st.at = clock; }
    else if (e.run === OP.fire) heardShot(e, st);
    else if (e.run === OP.fell && d[0] === myId() && myId()) { hud.note(`${TOYS[d[1]]?.verb || 'Felled'}: ${e.peer.name} is down!`, 3200); app.audio?.play('hit'); note('got', { who: e.id }); }
    else if (e.run === OP.nope && d[0] === myId() && myId()) { const why = WHY[d[1]], text = SAID[why]?.(e.peer.name); note('nope', { who: e.id, why }); if (text) hud.note(text, 3000); }
  };
  const forget = (st) => { st.model?.removeFromParent(); st.bubble?.removeFromParent(); };
  let wired = null, patched = null;
  const wire = () => {
    const p = app.presence, av = app.avatars;
    if (p && wired !== p) { wired = p; p.on('thing', onThing); p.on('leave', (peer) => { const st = seen.get(peer.id); if (st) { forget(st); seen.delete(peer.id); } }); }
    // (the others' arms: bent after their robots have been animated, which is done after the world's turn)
    if (av && patched !== av) { patched = av; const update = av.update.bind(av); av.update = (dt, ...rest) => { update(dt, ...rest); others(dt); }; }
  };
  const others = (dt) => {
    const items = app.avatars?.items;
    if (!items) return;
    for (const [id, st] of seen) {
      const it = items.get(id);
      if (!it) { forget(st); seen.delete(id); continue; }
      if (clock - st.at > SILENT) st.toy = -1;
      st.shield = Math.max(0, st.shield - dt);
      st.kick = Math.max(0, st.kick - dt * 4);
      const c = it.character, q = it.peer, there = c.root.visible && !q.hidden;
      carry(st, c, there && st.toy >= 0 && upright(q.anim) && !c.look?.disguise ? st.toy : -1, st.kick, clock - st.fired >= (TOYS[st.toy]?.reload || 0));
      shimmer(st, there && st.shield > 0 && q.anim !== ANIM.dead ? q : null, dt);
    }
  };

  world.zones.push({
    update: (dt) => {
      clock += dt;
      wire();
      const p = player.pos, dead = !!player.dead;
      // a fall of one's own: the body comes down to the ground; standing again is where it fell, and out of reach for a while
      if (pending && clock >= pending.at) { const h = pending; pending = null; if (!quiet()) fall(h); }
      if (mine && player.dead === mine.death) {
        const floor = Math.max(col.groundAt(p.x, p.z, p.y + 0.3), data.waterAt(p.x, p.z) - 0.9);
        if (p.y > floor) { mine.vy -= 15 * dt; p.y = Math.max(floor, p.y + mine.vy * dt); }
        mine.y = p.y;
      }
      if (wasDead && !dead) {
        if (mine) { player.teleport(mine.x, mine.z, mine.yaw, mine.y); app.rig?.snap(player.pos, app.rig.yaw); mine = null; }
        S.shield = RULES.shield;
      }
      wasDead = dead;
      if (S.shield > 0) S.shield = Math.max(0, S.shield - dt);
      // (a game, a seat, the water: the toy is put away — it would be in the way)
      if (S.toy >= 0 && (player.driver || app.fair?.session || player.seat || player.riding || player.swimming)) { S.toy = -1; refresh(); }
      S.kick = Math.max(0, S.kick - dt * 4);
      carry(S, me, holding() && me.root.visible ? S.toy : -1, S.kick, clock >= S.ready);
      shimmer(S, S.shield > 0 && !dead ? p : null, dt);
      bubbleMat.uniforms.uTime.value = clock;
      // the sight: while a toy is drawn and may fire here; dimmed until the toy is ready again
      const on = S.toy >= 0 && holding() && !quiet();
      if (on) { hud.setSight(app.engine.width / 2, app.engine.height * (0.5 - RULES.sight / 2)); hud.sightEl.style.opacity = clock < S.ready ? '0.35' : ''; }
      else if (sightOn) { if (!app.fair?.session) hud.setSight(null); hud.sightEl.style.opacity = ''; } // (a game of the pier has the sight for itself)
      sightOn = on;
      fireBtn.classList.toggle('wait', !on || clock < S.ready);
      tell();
      moveShots(dt * api.pace);
    },
  });
  refresh();

  return Object.assign(api, {
    draw, away, next, cycle, fire, aim, quiet, judge, buttons: { draw: drawBtn, fire: fireBtn },
    /** (for the checks) a shot heard as if the relay had handed it on: what `id` claims to have fired. */
    hear: (id, op, d) => onThing({ kind: KIND, id, peer: app.presence?.peers.get(id), run: OP[op], d }),
  });
}
