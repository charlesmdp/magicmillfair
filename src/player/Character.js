// Animated avatar (a friendly CC0 robot), shared by the local player and remote players.
// The model comes as nineteen separate pieces; they are merged at load into ONE skinned mesh, so that an
// avatar is a single draw call (per pass) however many visitors there are.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { surfaceMaterial, skinnedDepthMaterial, paintSet } from '../render/SurfaceMaterial.js';
import { LAYER } from '../render/Shadows.js';
import { assetUrl } from '../core/Assets.js';
import { HATS, makeHat, makeBouquet, makeJetpack, makeQuad, makeDisguise, QUAD, wings as makeWings } from './Cosmetics.js';
import { SIZE_SCALE, hatOf, withHat } from '../../server/items.js';

/**
 * Body colours offered to players (index is what travels over the network; never reorder). The first sixteen
 * are everybody's; the two rows after them come with the Game Pass (server/items.js: FREE_COLORS).
 */
export const AVATAR_COLORS = [
  0xf2a03d, 0xe8554e, 0x3fa7d6, 0x59c173, 0xb07cd8, 0xf2d24b, 0xff8fb1, 0x2ec4b6,
  0xe76f51, 0x6c8ef5, 0x9ccc65, 0xd4a373, 0xef476f, 0x48cae4, 0xf4f1de, 0x8d99ae,
  // black, charcoal, snow, crimson, royal blue, forest, deep purple, chocolate
  0x141416, 0x474b55, 0xffffff, 0x9d0208, 0x1d3ac9, 0x1b5e20, 0x5a189a, 0x5d4037,
  // acid green, hot pink, electric cyan, gold, lavender, mint, peach, midnight
  0x7dff2a, 0xff2d95, 0x00e5ff, 0xffc300, 0xcdb4db, 0xa8f0d0, 0xffb4a2, 0x14213d,
];

/** Animation ids exchanged over the network. */
export const ANIM = { idle: 0, walk: 1, run: 2, jump: 3, swim: 4, sit: 5, lie: 6, work: 7, dead: 8, dive: 9, cross: 10 };
const CLIP_OF = ['Idle', 'Walking', 'Running', 'Jump', 'Running', 'Sitting', 'Idle', 'Sitting', 'Death', 'Idle', 'Sitting'];
/** Emotes played by the avatar itself; the ones after them (RANK_EMOTES) summon an animal of light. */
export const EMOTES = ['Wave', 'Dance', 'ThumbsUp', 'Yes', 'No', 'Punch'];
export const RANK_EMOTES = ['deer', 'wolf', 'tiger', 'dragon'];
export const isResting = (anim) => anim === ANIM.sit || anim === ANIM.lie || anim === ANIM.work || anim === ANIM.cross;

/**
 * Every emote, in the order of the numbers that travel over the network (never reorder: append).
 *   clip: an animation of the model · move: a gesture made by hand (see MOVES) · rank: an animal of light,
 *   earned by coming back `days` days in a row. `id` is also the chat command (/wave, /cheer…).
 */
export const EMOTE_LIST = [
  { id: 'wave', label: 'Wave', clip: 'Wave' }, { id: 'dance', label: 'Dance', clip: 'Dance' }, { id: 'thumbsup', label: 'Thumbs up', clip: 'ThumbsUp' },
  { id: 'yes', label: 'Yes', clip: 'Yes' }, { id: 'no', label: 'No', clip: 'No' }, { id: 'punch', label: 'Punch', clip: 'Punch' },
  { id: 'deer', label: 'Stag', rank: 'deer', days: 10 }, { id: 'wolf', label: 'Wolf', rank: 'wolf', days: 25 },
  { id: 'tiger', label: 'Tiger', rank: 'tiger', days: 30 }, { id: 'dragon', label: 'Dragon', rank: 'dragon', days: 50 },
  { id: 'rage', label: 'Rage', move: 'rage' }, { id: 'cheer', label: 'Cheer', move: 'cheer' }, { id: 'clap', label: 'Clap', move: 'clap' },
  { id: 'hype', label: 'Jump for joy', move: 'hype' }, { id: 'go', label: 'Go! Go!', move: 'go' }, { id: 'bow', label: 'Bow', move: 'bow' },
  { id: 'goldfish', label: 'Goldfish', rank: 'goldfish', days: 2 }, { id: 'squirrel', label: 'Squirrel', rank: 'squirrel', days: 3 },
  { id: 'carp', label: 'Carp', rank: 'carp', days: 5 }, { id: 'eagle', label: 'Eagle', rank: 'eagle', days: 15 },
  { id: 'panda', label: 'Panda', rank: 'panda', days: 20 }, { id: 'elephant', label: 'Elephant', rank: 'elephant', days: 35 },
];
export const emoteIndex = (id) => EMOTE_LIST.findIndex((e) => e.id === id);

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * Gestures made by hand, on top of the standing pose: fn(t, P, e) fills P for the instant t (seconds), e being
 * the 0..1 envelope that eases the gesture in and out. P: L / R = where each hand goes ([x to the left, y up,
 * z forward], metres from the feet), lift (m), lean (the whole body, forward), bend (from the waist), twist,
 * roll, head (turned), nod (radians).
 */
const MOVES = {
  // fists shaking by the head, feet stamping, the head saying no
  rage: { T: 3.0, fn(t, P, e) {
    const s = Math.sin(t * 26);
    P.L = [0.36 + 0.03 * s, 1.22 + 0.09 * Math.sin(t * 31), 0.42]; P.R = [-0.36 - 0.03 * s, 1.22 + 0.09 * Math.sin(t * 29 + 1), 0.42];
    P.lift = 0.07 * Math.abs(Math.sin(t * 9.5)) * e; P.lean = 0.22 * e; P.twist = 0.13 * Math.sin(t * 9.5) * e; P.head = 0.4 * Math.sin(t * 17) * e;
  } },
  // fists pumped in turn, little hops
  cheer: { T: 3.2, fn(t, P, e) {
    const a = Math.sin(t * 9);
    P.L = [0.3, 1.25 + 0.4 * Math.max(0, a), 0.18]; P.R = [-0.3, 1.25 + 0.4 * Math.max(0, -a), 0.18];
    P.lift = 0.1 * Math.abs(a) * e; P.roll = 0.06 * a * e;
  } },
  // applause
  clap: { T: 2.8, fn(t, P, e) {
    const c = 0.5 + 0.5 * Math.cos(t * 22);
    P.L = [0.03 + 0.17 * c, 1.12, 0.36]; P.R = [-0.03 - 0.17 * c, 1.12, 0.36];
    P.nod = 0.08 * Math.sin(t * 5.5) * e;
  } },
  // three jumps for joy, arms in a V
  hype: { T: 2.7, fn(t, P, e) {
    P.L = [0.5, 1.75, 0]; P.R = [-0.5, 1.75, 0];
    P.lift = 0.42 * Math.abs(Math.sin((t * Math.PI) / 0.9)) * e; P.twist = 0.5 * Math.sin(t * 3.5) * e;
  } },
  // both arms waving overhead, from side to side
  go: { T: 3.2, fn(t, P, e) {
    const s = Math.sin(t * 7);
    P.L = [0.28 + 0.3 * s, 1.75, 0.05]; P.R = [-0.28 + 0.3 * s, 1.75, 0.05];
    P.roll = -0.1 * s * e;
  } },
  // a bow from the waist
  bow: { T: 2.6, fn(t, P) {
    const b = ss(0.1, 0.7, t) * (1 - ss(1.7, 2.4, t));
    P.bend = 0.62 * b; P.nod = 0.2 * b;
  } },
};
const REST_HAND = [0.33, 0.74, 0.04]; // about where a hand hangs (gestures ease in from there)

/**
 * What an avatar wears and holds travels in the 16 "flags" bits of its state:
 * bit 0 free camera · bits 1-3, 12 and 14 hat (its number in HATS: see hatOf and withHat in server/items.js) ·
 * bit 4 jetpack burning · bit 5 bouquet · bit 6 quad · bit 7 a head twice the size · bits 8-9 and 13 size (see
 * SIZE_SCALE in items.js) · bits 10-11 disguise (0 none, 1 a bush, 2 a tree) · bit 15 free
 */
export const packLook = (o) => withHat((o.free ? 1 : 0) | (o.jet ? 16 : 0) | (o.bouquet ? 32 : 0) | (o.quad ? 64 : 0) | (o.dome ? 128 : 0)
  | (((o.size || 0) & 3) << 8) | (((o.disguise || 0) & 3) << 10) | ((((o.size || 0) >> 2) & 1) << 13), o.hat || 0);
const unpackLook = (f) => ({ hat: hatOf(f), jet: !!(f & 16), bouquet: !!(f & 32), quad: !!(f & 64), dome: !!(f & 128), size: ((f >> 8) & 3) | (((f >> 13) & 1) << 2), disguise: (f >> 10) & 3 });

const HEIGHT = 1.72;
// Seated, the hips sit this far behind the feet and the underside of the body this high above them.
export const SEAT = { back: 0.22, under: 0.2 };
const FIXED = { Main: null, Black: [0.03, 0.03, 0.035] }; // colours of the model's materials; anything else is grey
const GREY = [0.3, 0.3, 0.28];

// A laptop for those who sit down to work: one small mesh, shared geometry and material.
let laptopParts = null;
function laptop() {
  if (!laptopParts) {
    const g = new THREE.BufferGeometry();
    const pos = [], nrm = [], col = [], idx = [];
    const quad = (pts, n, c) => { const i = pos.length / 3; for (const v of pts) { pos.push(...v); nrm.push(...n); col.push(...c); } idx.push(i, i + 1, i + 2, i, i + 2, i + 3); };
    const box = (x0, y0, z0, x1, y1, z1, c) => {
      quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], c); quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], c);
      quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], c); quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], c);
      quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], c); quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], c);
    };
    const dark = [0.035, 0.037, 0.04], key = [0.012, 0.012, 0.014];
    box(-0.19, 0, -0.13, 0.19, 0.018, 0.13, dark); // base
    box(-0.16, 0.018, -0.1, 0.16, 0.021, 0.04, key); // keyboard
    // lid, leaning back, with a lit screen facing the user (who sits on the -Z side)
    const lid = (y, z) => [y * Math.cos(0.3) - z * Math.sin(0.3), 0.13 + y * Math.sin(0.3) + z * Math.cos(0.3)];
    const [y0, z0] = lid(0.012, 0), [y1, z1] = lid(0.26, 0), [ys0, zs0] = lid(0.028, -0.004), [ys1, zs1] = lid(0.245, -0.004);
    quad([[0.19, y0, z0 + 0.012], [-0.19, y0, z0 + 0.012], [-0.19, y1, z1 + 0.012], [0.19, y1, z1 + 0.012]], [0, 0.3, 0.95], dark); // back of the lid
    quad([[-0.19, y0, z0], [0.19, y0, z0], [0.19, y1, z1], [-0.19, y1, z1]], [0, -0.3, -0.95], dark); // bezel
    quad([[-0.17, ys0, zs0], [0.17, ys0, zs0], [0.17, ys1, zs1], [-0.17, ys1, zs1]], [0, -0.3, -0.95], [0.5, 0.72, 0.95]); // screen
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    g.setIndex(idx);
    laptopParts = { geometry: g, material: surfaceMaterial({ rough: 0.4, spec: 0.5, emissive: [1.5, 1.5, 1.5], name: 'laptop' }) };
  }
  const mesh = new THREE.Mesh(laptopParts.geometry, laptopParts.material);
  mesh.layers.enable(LAYER.DYNAMIC_CASTER);
  return mesh;
}

let blobMaterial = null;
function blobShadowMaterial() {
  if (!blobMaterial) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.55, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    blobMaterial = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  }
  return blobMaterial;
}

export class CharacterFactory {
  /** @param {{ blobShadow?: boolean }} [options] blobShadow: a soft disc under each avatar (tiers without real-time shadows) */
  constructor({ blobShadow = false } = {}) { this.blobShadow = blobShadow; }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(assetUrl('models/robot.glb'));
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    // facial morph targets are not used: their animation tracks go
    this.clips = gltf.animations.map((clip) => {
      clip.tracks = clip.tracks.filter((t) => !t.name.includes('morphTargetInfluences'));
      return clip;
    });
    const box = new THREE.Box3().setFromObject(scene);
    this.scale = HEIGHT / (box.max.y - box.min.y);
    this.footY = box.min.y;

    // ---- one skeleton, one geometry
    const bones = [];
    scene.traverse((o) => { if (o.isBone) bones.push(o); });
    const boneIndex = new Map(bones.map((b, i) => [b, i]));
    this.boneNames = bones.map((b) => b.name);
    this.inverses = bones.map((b) => b.matrixWorld.clone().invert());
    const pos = [], nrm = [], col = [], skinI = [], skinW = [], idx = [];
    const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
    const meshes = [];
    scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const headBox = new THREE.Box3();
    for (const m of meshes) {
      const g = m.geometry, p = g.attributes.position, gn = g.attributes.normal, base = pos.length / 3;
      const fixed = m.material.name in FIXED ? FIXED[m.material.name] : GREY;
      const c = fixed ? [fixed[0], fixed[1], fixed[2], 0] : [1, 1, 1, 1]; // alpha 1: takes the colour of the player
      nm.getNormalMatrix(m.matrixWorld);
      let bone = m.parent;
      while (bone && !bone.isBone) bone = bone.parent;
      const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        if (m.isSkinnedMesh) m.applyBoneTransform(i, v); // where the rest pose puts it
        v.applyMatrix4(m.matrixWorld);
        n.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize();
        pos.push(v.x, v.y, v.z); nrm.push(n.x, n.y, n.z); col.push(...c);
        if (m.isSkinnedMesh) {
          for (let k = 0; k < 4; k++) { skinI.push(boneIndex.get(m.skeleton.bones[si.getComponent(i, k)]) ?? 0); skinW.push(sw.getComponent(i, k)); }
        } else { skinI.push(boneIndex.get(bone) ?? 0, 0, 0, 0); skinW.push(1, 0, 0, 0); }
        if (bone && bone.name === 'Head') headBox.expandByPoint(v);
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
      else for (let i = 0; i < p.count; i++) idx.push(base + i);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinI, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinW, 4));
    geo.setIndex(idx);
    this.geometry = geo;
    this.triangles = idx.length / 3;
    // the head, for hats: its top, its middle and how wide the dome is (metres, feet at 0)
    const k = this.scale;
    this.head = { top: (headBox.max.y - this.footY) * k, x: ((headBox.min.x + headBox.max.x) / 2) * k, z: ((headBox.min.z + headBox.max.z) / 2) * k, w: (headBox.max.x - headBox.min.x) * k, d: (headBox.max.z - headBox.min.z) * k, h: (headBox.max.y - headBox.min.y) * k };
    // the bones alone, to be cloned for each avatar
    for (const m of meshes) m.removeFromParent();
    this.armature = scene;
    return this;
  }

  create(colorIndex = 0) { return new Character(this, colorIndex); }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3();
const _u = new THREE.Vector3(), _w = new THREE.Vector3(), _w2 = new THREE.Vector3(), _axis = new THREE.Vector3();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion();
const clamp1 = (x) => Math.min(1, Math.max(-1, x));

export class Character {
  constructor(factory, colorIndex) {
    this.factory = factory;
    this.root = new THREE.Group();
    this.model = factory.armature.clone(true);
    this.model.scale.setScalar(factory.scale);
    this.model.position.y = -factory.footY * factory.scale;
    this.root.add(this.model);
    this.bones = {};
    const bones = [];
    this.model.traverse((o) => { if (o.isBone) { bones.push(o); this.bones[o.name] = o; } });
    const main = surfaceMaterial({ rough: 0.45, spec: 0.5, name: 'avatar', tintMask: true, paint: true });
    main.uniforms.uPaint.value.z = factory.scale;
    this.mainMaterial = main;
    this.materials = [main];
    const mesh = new THREE.SkinnedMesh(factory.geometry, main);
    mesh.bind(new THREE.Skeleton(bones, factory.inverses), new THREE.Matrix4());
    mesh.userData.depthMaterial = skinnedDepthMaterial();
    mesh.layers.enable(LAYER.DYNAMIC_CASTER);
    mesh.layers.enable(LAYER.REFLECT);
    mesh.frustumCulled = false;
    this.model.add(mesh);
    this.mesh = mesh;
    if (factory.blobShadow) {
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), blobShadowMaterial());
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.05;
      blob.renderOrder = 3;
      this.root.add(blob);
    }
    // where hats go: on top of the head, following it
    this.root.updateMatrixWorld(true);
    this.headMount = new THREE.Group();
    this.headMount.position.set(factory.head.x, factory.head.top, factory.head.z);
    this.root.add(this.headMount);
    this.headMount.updateMatrixWorld(true);
    this.bones.Head.attach(this.headMount);
    this.headScale = this.bones.Head.scale.x;

    this.setColor(colorIndex);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of factory.clips) {
      const a = this.mixer.clipAction(clip);
      if (['Jump', 'Sitting', 'Standing', 'Death', ...EMOTES].includes(clip.name) && clip.name !== 'Dance') { a.clampWhenFinished = true; a.loop = THREE.LoopOnce; }
      this.actions[clip.name] = a;
    }
    this.current = null;
    this.anim = -1;
    this.emoting = null;
    this.tilt = 0; // leaning forward (swimming)
    this.recline = 0; // lying on the back
    this.stroke = 0; // phase of the swimming strokes
    this.speed = 0;
    this.ambient = 1;
    this.look = { hat: 0, jet: false, bouquet: false, quad: false, dome: false, disguise: 0 };
    this.big = 0; // 0..1: how far the head has grown
    this.size = 1; // (the choice of who holds the Game Pass, a secret word, or a flight on the stage of the plaza)
    this.prop = null; // what the avatar is disguised as (a bush, a tree)
    this.cross = 0; // 0..1: how far it has sat down on the ground, legs crossed
    this.move = null; // a gesture made by hand: { fn, t, T } (see MOVES)
    this.tip = 0; // radians the body has tipped forward in a dive
    this.diveT = 0;
    this._pose = { L: null, R: null, lift: 0, lean: 0, bend: 0, twist: 0, roll: 0, head: 0, nod: 0 };
    this._bent = []; this._bentN = 0; // bones bent by hand this frame, and what they were before
    this.mixer.addEventListener('finished', (e) => {
      if (this.emoting && e.action === this.actions[this.emoting]) { this.emoting = null; this._play(CLIP_OF[Math.max(0, this.anim)], 0.25); }
    });
    this.setAnim(ANIM.idle);
  }

  setColor(index) {
    this.colorIndex = index; // (a paint job, when there is one, is drawn over it by the material)
    const n = AVATAR_COLORS.length, c = new THREE.Color(AVATAR_COLORS[((index % n) + n) % n]);
    this.mainMaterial.uniforms.uColor.value.set(c.r, c.g, c.b);
  }

  /**
   * A paint job over the colour of the avatar: 0 none, 1 gold plating, 2 chrome, 3 atomic glow (it pulses),
   * 4 candy (it drifts through the rainbow), 5 meltdown, 6 plasma, 7 hazard stripes, 8 mirror ball, 9 galaxy,
   * 10 tuxedo (the head keeps the colour of the robot), 11 camouflage, 12 tiger, 13 rust bucket, 14 deep frost,
   * 15 holographic, 16 circuit board, 17 marble and gold, 18 last sunset — the numbers of PAINTS in
   * server/items.js.
   */
  setPaint(paint = 0) {
    if (paint === (this.paint || 0)) return;
    this.paint = paint;
    // (the paint itself is drawn by the material: see PAINT in SurfaceMaterial.js — those from the tenth on by a
    // program of their own, which the material takes when it is given one of them)
    paintSet(this.mainMaterial, paint);
    const u = this.mainMaterial.uniforms;
    u.uPaint.value.x = paint;
    u.uParams.value.x = paint === 1 ? 0.22 : paint === 2 ? 0.08 : 0.45; u.uParams.value.y = paint === 1 || paint === 2 ? 1.0 : 0.5;
    u.uEmissive.value.set(0, 0, 0);
    this._paintT = this._paintT || 0;
  }

  _play(name, fade = 0.2) {
    const next = this.actions[name];
    if (!next || next === this.current) return;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = next;
  }

  /** Locomotion state (ANIM.*). `speed` scales the playback so feet match the ground. */
  setAnim(id, speed = 1) {
    const was = this.anim;
    if (id !== was) {
      this.anim = id;
      if (this.emoting && id !== ANIM.idle) this.emoting = null;
      if (this.move && id !== ANIM.idle && !isResting(id)) this.move = null;
      // getting up from a seat: the short "standing up" clip, then whatever comes next
      const rising = (was === ANIM.sit || was === ANIM.work) && (id === ANIM.idle || id === ANIM.walk);
      if (!this.emoting) this._play(rising && id === ANIM.idle ? 'Standing' : CLIP_OF[id] || 'Idle', id === ANIM.jump || id === ANIM.dead ? 0.1 : 0.22);
      if (rising && id === ANIM.idle) this._rising = 0.42;
      if ((id === ANIM.work) !== !!this.laptop?.visible) this._setLaptop(id === ANIM.work);
    }
    this.speed = speed;
    const a = this.actions[CLIP_OF[id]];
    if (a && !this.emoting) {
      a.timeScale = id === ANIM.walk ? Math.max(0.6, speed / 2.3) : id === ANIM.run ? Math.max(0.8, speed / 6.2)
        : id === ANIM.swim ? 0.28 + Math.min(1, speed / 5) * 0.5 : id === ANIM.lie ? 0.35 : 1;
    }
    this.swimming = id === ANIM.swim;
  }

  /** True while the avatar is seated or lying (no emote of its own then). */
  get resting() { return isResting(this.anim); }

  /** Plays emote number `index` of EMOTE_LIST (those that summon an animal are not for the avatar itself). */
  emote(index) {
    const e = EMOTE_LIST[index];
    if (!e || this.anim === ANIM.dead || this.anim === ANIM.dive) return;
    if (e.move) {
      // (a gesture can be made sitting down: the arms only)
      if (this.emoting) { this.emoting = null; this._play(CLIP_OF[Math.max(0, this.anim)], 0.15); }
      this.move = { fn: MOVES[e.move].fn, t: 0, T: MOVES[e.move].T };
    } else if (e.clip && this.actions[e.clip] && !this.resting) {
      this.move = null;
      this.emoting = e.clip;
      this._play(e.clip, 0.15);
    }
  }

  /** A pair of wings on the back (the flying theatre), or off again. `wingBeat` (0 to 1) makes them beat harder. */
  setWings(on) {
    if (on && !this.wings) {
      const s = this.factory.scale;
      this.wings = makeWings();
      this.wings.scale.setScalar(1.3 / s);
      this.wings.position.set(0, (1.08 + this.factory.footY * s) / s, -0.2 / s);
      this.model.add(this.wings);
    }
    if (this.wings) this.wings.visible = on;
    if (!on) this.wingBeat = 0;
  }

  _setLaptop(on) {
    if (on && !this.laptop) {
      this.laptop = laptop();
      this.laptop.position.set(0, 0.4, 0.0); // on the knees, screen towards the face
      this.root.add(this.laptop);
    }
    if (this.laptop) this.laptop.visible = on;
  }

  /** What the avatar wears and holds: the "flags" of its state (see packLook), or an object with the same fields. */
  setLook(look) {
    const o = typeof look === 'number' ? unpackLook(look) : look;
    const l = this.look;
    // (the size of somebody else comes with their look; one's own is set by the game)
    if (typeof look === 'number') this.size = SIZE_SCALE[o.size] || 1;
    if (o.disguise !== undefined && o.disguise !== l.disguise) {
      l.disguise = o.disguise;
      if (this.prop) { this.prop.removeFromParent(); this.prop = null; }
      if (o.disguise) { this.prop = makeDisguise(o.disguise === 2 ? 'tree' : 'bush'); this.root.add(this.prop); }
      this.model.visible = !o.disguise;
    }
    if (o.hat !== undefined && o.hat !== l.hat) {
      l.hat = o.hat;
      if (this.hat) { this.hat.removeFromParent(); this.hat = null; }
      const id = HATS[o.hat]?.id;
      if (id && id !== 'none') {
        // (hats are modelled for a head of radius 1; the dome of this robot is a little narrower than its head with ears)
        this.hat = makeHat(id, Math.min(this.factory.head.w, this.factory.head.d) * 0.5 * 0.96);
        if (this.hat) this.headMount.add(this.hat);
      }
    }
    if (o.jet !== undefined && o.jet !== l.jet) {
      l.jet = o.jet;
      if (o.jet && !this.jetpack) { this.jetpack = makeJetpack(); this.jetpack.position.set(0, 0.66, -0.21); this.root.add(this.jetpack); }
      if (this.jetpack) { this.jetpack.visible = true; this.jetpack.userData.flames.visible = o.jet; this._jetOff = o.jet ? 0 : 1.2; }
    }
    if (o.bouquet !== undefined && (o.bouquet !== l.bouquet || (o.kinds && o.kinds !== this._kinds))) {
      l.bouquet = o.bouquet; this._kinds = o.kinds;
      if (this.bouquet) { this.bouquet.removeFromParent(); this.bouquet.geometry.dispose(); this.bouquet = null; }
      if (o.bouquet) { this.bouquet = makeBouquet(o.kinds); this.bouquet.position.set(-0.23, 0.78, 0.2); this.bouquet.rotation.set(0.25, 0, 0.12); this.root.add(this.bouquet); }
    }
    if (o.quad !== undefined && o.quad !== l.quad) {
      l.quad = o.quad;
      if (o.quad && !this.quad) { this.quad = makeQuad(); this.root.add(this.quad); }
      if (this.quad) this.quad.visible = o.quad;
    }
    if (o.dome !== undefined) l.dome = o.dome;
    if (this._light) { this._light = false; this.setLight(true); } // (what has just been put on is light too)
  }

  /**
   * A light avatar is drawn once: not in the real-time shadows, not in the mirror of the water. For the
   * visitors who are far away, or many: in a crowd, that halves what each of them costs.
   */
  setLight(light) {
    if (light === this._light) return;
    this._light = light;
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      if (light) {
        // (remembering what each mesh took part in, to give it back)
        o.userData.passes = (o.layers.isEnabled(LAYER.DYNAMIC_CASTER) ? 1 : 0) | (o.layers.isEnabled(LAYER.REFLECT) ? 2 : 0);
        o.layers.disable(LAYER.DYNAMIC_CASTER); o.layers.disable(LAYER.REFLECT);
      } else {
        if (o.userData.passes & 1) o.layers.enable(LAYER.DYNAMIC_CASTER);
        if (o.userData.passes & 2) o.layers.enable(LAYER.REFLECT);
      }
    });
  }

  /** Ambient light on the avatar, 1 in the open (caves are darker). */
  setAmbient(k) {
    if (Math.abs(k - this.ambient) < 0.01) return;
    this.ambient = k;
    for (const m of this.materials) m.uniforms.uAmbient.value = k;
  }

  update(dt) {
    if (this._rising > 0) {
      this._rising -= dt;
      if (this._rising <= 0 && this.anim === ANIM.idle && !this.emoting) this._play('Idle', 0.2);
    }
    if (this.paint) this.mainMaterial.uniforms.uPaint.value.y = (this._paintT = (this._paintT + dt) % 3600); // (the paints move: a sparkle, a glow that breathes, stripes that turn)
    // (the mixer only rewrites a bone when its animated value changes: put back what was bent by hand first)
    for (let i = 0; i < this._bentN; i++) this._bent[i].bone.quaternion.copy(this._bent[i].q);
    this._bentN = 0;
    if (this._feet && this._feet.length) { const f = this._feet; for (let i = 0; i < f.length; i += 4) f[i].position.set(f[i + 1], f[i + 2], f[i + 3]); f.length = 0; }
    this.mixer.update(dt);
    const l = this.look, k = Math.min(1, dt * 6), base = -this.factory.footY * this.factory.scale;
    const swim = this.swimming, moving = swim ? Math.min(1, this.speed / 2.2) : 0;
    const riding = l.quad && this.anim === ANIM.sit;
    // swimming: stretched out when moving, more upright when treading water
    this.tilt += ((swim ? 0.5 + 0.62 * moving : 0) - this.tilt) * k;
    this.recline += ((this.anim === ANIM.lie ? 1 : 0) - this.recline) * k;
    this.stroke += dt * (swim ? 2.2 + 3.4 * moving : 0);
    const m = this.model;
    // a dive: the body tips over, about its middle, until it points at the water
    const diving = this.anim === ANIM.dive;
    this.diveT = diving ? this.diveT + dt : 0;
    this.tip += ((diving ? 0.35 + 2.4 * ss(0.05, 0.85, this.diveT) : 0) - this.tip) * Math.min(1, dt * 10);
    // a gesture made by hand
    const P = this._pose, mv = this.move;
    P.L = P.R = null; P.lift = P.lean = P.bend = P.twist = P.roll = P.head = P.nod = 0;
    if (mv) {
      mv.t += dt;
      if (mv.t >= mv.T) this.move = null;
      else {
        mv.fn(mv.t, P, ss(0, 0.25, mv.t) * (1 - ss(mv.T - 0.3, mv.T, mv.t)));
        if (this.resting) P.lift = P.lean = P.twist = P.roll = 0; // seated: the arms and the head only
      }
    }
    m.rotation.x = this.tilt + this.tip + P.lean - (this.recline * Math.PI) / 2;
    m.rotation.y = P.twist;
    m.rotation.z = (swim ? Math.sin(this.stroke) * 0.16 * moving : 0) + P.roll; // the body rolls with each stroke
    m.position.y = base + (swim ? 0.45 + 0.3 * moving + Math.sin(this.stroke * 2) * 0.03 : 0) + this.recline * 0.3 + (riding ? QUAD.seat - SEAT.under : 0) + P.lift + 0.85 * (1 - Math.cos(this.tip));
    m.position.z = this.recline * 0.86 + (riding ? 0.16 : 0) - 0.85 * Math.sin(this.tip); // lying: the body is centred on the spot, head behind
    // a growing head (and whatever is on it)
    this.big += ((l.dome ? 1 : 0) - this.big) * Math.min(1, dt * 5);
    this.bones.Head.scale.setScalar(this.headScale * (1 + 1.35 * this.big));
    if (this.root.scale.x !== this.size) this.root.scale.setScalar(this.size);
    // the propeller of the cap, which turns faster as one runs — or what turns at a pace of its own (a halo)
    const rotor = this.hat?.userData.rotor;
    if (rotor) rotor.rotation.y += dt * (rotor.userData.rate ?? 6 + Math.min(18, this.speed * 3));
    // sitting on the ground, legs crossed: the body comes down until it rests, the knees go out, the feet tuck in
    this.cross += ((this.anim === ANIM.cross ? 1 : 0) - this.cross) * Math.min(1, dt * 7);
    if (this.cross > 0.01) this._crossLegs(this.cross);
    if (l.disguise) {
      // (a bush has no hat, no jetpack and no quad: nothing shows but the bush)
      for (const o of [this.jetpack, this.bouquet, this.quad, this.laptop, this.wings]) if (o) o.visible = false;
      return;
    }
    // wings (the flying theatre): they beat a little all the time, and hard on a flap
    if (this.wings && this.wings.visible) {
      this._wingT = (this._wingT || 0) + dt;
      // (held up in a V; a flap brings them down hard, then they come back up)
      const a = 0.85 + Math.sin(this._wingT * 11) * 0.16 - (this.wingBeat || 0) * 1.15, [left, right] = this.wings.userData.sides;
      right.rotation.y = a; left.rotation.y = -a;
    }
    // the jetpack stays on the back a moment after it has burnt out
    if (this.jetpack && this.jetpack.visible) {
      const f = this.jetpack.userData.flames;
      if (f.visible) f.scale.set(1, 0.8 + 0.4 * Math.random(), 1);
      else if ((this._jetOff -= dt) <= 0) this.jetpack.visible = false;
    }
    const holding = l.bouquet && this.bouquet && !this.resting && !swim && this.anim !== ANIM.dead;
    if (this.bouquet) this.bouquet.visible = !!holding;
    const gesture = this.move && (P.L || P.R || P.head || P.nod || P.bend);
    const hands = swim || holding || riding || this.anim === ANIM.work || this.anim === ANIM.cross || diving || gesture;
    if (!hands) return;
    // hands put where they belong: the arms are bent to reach
    this.root.updateMatrixWorld(true);
    if (diving) {
      // arms spread wide like a swan, then joined ahead of the head for the water
      const j = ss(0.4, 0.75, this.diveT);
      for (const s of [1, -1]) this._reach(s > 0 ? 'L' : 'R', _t.set(s * (0.8 - 0.74 * j), 1.15 + 0.95 * j, -0.1 + 0.2 * j), true);
    } else if (gesture) {
      const e = ss(0, 0.25, this.move.t) * (1 - ss(this.move.T - 0.3, this.move.T, this.move.t));
      if (P.bend) {
        // (before the arms and the head, which hang from the waist)
        const waist = this.bones.Abdomen || this.bones.Torso || this.bones.Body;
        if (waist) { this._keep(waist); this._turn(waist, _axis.set(1, 0, 0).applyQuaternion(this.root.quaternion), P.bend); waist.updateWorldMatrix(false, true); }
      }
      if (P.L) this._reach('L', _t.set(REST_HAND[0] + (P.L[0] - REST_HAND[0]) * e, REST_HAND[1] + (P.L[1] - REST_HAND[1]) * e, REST_HAND[2] + (P.L[2] - REST_HAND[2]) * e));
      if (P.R) this._reach('R', _t.set(-REST_HAND[0] + (P.R[0] + REST_HAND[0]) * e, REST_HAND[1] + (P.R[1] - REST_HAND[1]) * e, REST_HAND[2] + (P.R[2] - REST_HAND[2]) * e));
      if (P.head || P.nod) {
        const head = this.bones.Head;
        this._keep(head);
        if (P.head) this._turn(head, _axis.set(0, 1, 0), P.head);
        if (P.nod) this._turn(head, _axis.set(1, 0, 0).applyQuaternion(this.root.quaternion), P.nod);
      }
    } else if (swim) {
      // crawl: each hand goes round, over the head, down in front, back along the body
      for (const [side, phase, sx] of [['L', 0, 1], ['R', Math.PI, -1]]) {
        const a = this.stroke + phase, reach = 0.25 + 0.2 * moving;
        this._reach(side, _t.set(sx * 0.26, 0.9 + reach * 1.6 * Math.cos(a), 0.1 + reach * Math.sin(a)), true);
      }
    } else if (riding) {
      this._reach('L', _t.set(0.3, 0.93, 0.29)); this._reach('R', _t.set(-0.3, 0.93, 0.29));
    } else if (this.anim === ANIM.work) {
      // typing: the hands hover over the keyboard, never quite still
      const t = (this.stroke += dt * 9);
      this._reach('L', _t.set(0.085, 0.455 + 0.012 * Math.sin(t), -0.03)); this._reach('R', _t.set(-0.085, 0.455 + 0.012 * Math.sin(t * 1.31 + 1), -0.03));
    } else if (this.anim === ANIM.cross) {
      // (a hand on each knee)
      this._reach('L', _t.set(0.27, 0.36, 0.2)); this._reach('R', _t.set(-0.27, 0.36, 0.2));
    } else if (holding) {
      this._reach('R', _t.set(-0.23, 0.76, 0.2));
    }
  }

  /**
   * Bends an arm so that its hand reaches a point given in the avatar's own frame (metres, x to its left,
   * y up, z forward) — or in the frame of its tilted body with `inBody` (swimming). Two-bone inverse kinematics.
   */
  _reach(side, target, inBody = false) {
    const upper = this.bones[`UpperArm${side}`], lower = this.bones[`LowerArm${side}`], end = this.bones[`Palm2${side}`];
    if (!upper || !lower || !end) return;
    this._keep(upper); this._keep(lower);
    if (inBody) { const k = this.factory.scale; target.set(target.x / k, target.y / k + this.factory.footY, target.z / k); this.model.localToWorld(target); } else this.root.localToWorld(target);
    this._ik(upper, lower, end, target);
  }

  /** Two bones (`upper`, `lower`) bent so that `end` — a point carried by the second — reaches `target` (world space). */
  _ik(upper, lower, end, target) {
    upper.getWorldPosition(_a); lower.getWorldPosition(_b); end.getWorldPosition(_c);
    const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c);
    const d = Math.min(_a.distanceTo(target), (l1 + l2) * 0.995);
    // 1. the elbow: open or close it until the hand is as far from the shoulder as the target is
    const want = Math.acos(clamp1((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2)));
    _u.subVectors(_a, _b).normalize(); _w.subVectors(_c, _b).normalize();
    const now = Math.acos(clamp1(_u.dot(_w)));
    _axis.crossVectors(_w, _u);
    if (_axis.lengthSq() < 1e-6) _axis.set(1, 0, 0).applyQuaternion(this.root.quaternion); // a straight arm: bend it in the plane of the body
    _axis.normalize();
    this._turn(lower, _axis, now - want);
    // 2. the shoulder: swing the whole arm until the hand is on the target
    upper.updateWorldMatrix(false, true);
    end.getWorldPosition(_c);
    _u.subVectors(_c, _a).normalize(); _w.subVectors(target, _a).normalize();
    _q.setFromUnitVectors(_u, _w);
    upper.parent.getWorldQuaternion(_pq);
    upper.quaternion.premultiply(_pq).premultiply(_q).premultiply(_pq.invert());
    upper.updateWorldMatrix(false, true);
  }

  /**
   * The seated pose, brought down to the ground with the legs crossed (k: 0..1 how far). The clip sits the
   * robot as on a chair, its feet in front of it; here the body is lowered until it rests, each thigh turned
   * outwards, each foot brought under the opposite knee.
   */
  _crossLegs(k) {
    const m = this.model;
    m.position.y -= SEAT.under * 0.92 * k;
    m.position.z -= 0.06 * k;
    this.root.updateMatrixWorld(true);
    const up = _axis.set(0, 1, 0);
    for (const [side, sx] of [['L', 1], ['R', -1]]) {
      const thigh = this.bones[`UpperLeg${side}`], shin = this.bones[`LowerLeg${side}`], foot = this.bones[`Foot${side}`];
      if (!thigh || !foot) return;
      const tip = this.bones[`LowerLeg${side}_end`];
      // the foot: a bone of its own in this model (it does not hang from the leg) — tucked in front of the
      // body, on the other side: the legs cross
      _t.set(-sx * 0.11, 0.075, 0.16 + (sx > 0 ? 0.07 : 0));
      this.root.localToWorld(_t);
      _u.copy(_t); // (where the leg has to end, in the world)
      foot.parent.worldToLocal(_t);
      (this._feet || (this._feet = [])).push(foot, foot.position.x, foot.position.y, foot.position.z);
      foot.position.lerp(_t, k);
      // the leg: the thigh swung outwards (the knee points away from the body), then bent to reach the foot
      this._keep(thigh);
      this._turn(thigh, up.set(0, 1, 0).applyQuaternion(this.root.quaternion), sx * 1.0 * k);
      thigh.updateWorldMatrix(false, true);
      if (shin && tip && k > 0.5) { this._keep(shin); _w2.copy(_u); _w2.y += 0.03; this._ik(thigh, shin, tip, _w2); }
    }
  }

  /** Rotates a bone about an axis given in world space. */
  _turn(bone, axis, angle) {
    bone.parent.getWorldQuaternion(_pq);
    _q.setFromAxisAngle(axis, angle);
    bone.quaternion.premultiply(_pq).premultiply(_q).premultiply(_pq.invert());
  }

  /** Remembers the animated rotation of a bone about to be bent by hand (given back before the next animation step). */
  _keep(bone) {
    const slot = this._bent[this._bentN] || (this._bent[this._bentN] = { bone: null, q: new THREE.Quaternion() });
    this._bentN++;
    slot.bone = bone; slot.q.copy(bone.quaternion);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mesh.skeleton.dispose();
    for (const m of this.materials) m.dispose();
    this.root.removeFromParent();
  }
}
