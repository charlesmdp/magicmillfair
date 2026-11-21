// Animated avatar (a friendly CC0 robot), shared by the local player and remote players.
// The model comes as nineteen separate pieces; they are merged at load into ONE skinned mesh, so that an
// avatar is a single draw call (per pass) however many visitors there are.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { surfaceMaterial, skinnedDepthMaterial } from '../render/SurfaceMaterial.js';
import { LAYER } from '../render/Shadows.js';
import { assetUrl } from '../core/Assets.js';
import { HATS, makeHat, makeBouquet, makeJetpack, makeQuad, QUAD } from './Cosmetics.js';

/** Body colours offered to players (index is what travels over the network). */
export const AVATAR_COLORS = [
  0xf2a03d, 0xe8554e, 0x3fa7d6, 0x59c173, 0xb07cd8, 0xf2d24b, 0xff8fb1, 0x2ec4b6,
  0xe76f51, 0x6c8ef5, 0x9ccc65, 0xd4a373, 0xef476f, 0x48cae4, 0xf4f1de, 0x8d99ae,
];

/** Animation ids exchanged over the network. */
export const ANIM = { idle: 0, walk: 1, run: 2, jump: 3, swim: 4, sit: 5, lie: 6, work: 7, dead: 8 };
const CLIP_OF = ['Idle', 'Walking', 'Running', 'Jump', 'Running', 'Sitting', 'Idle', 'Sitting', 'Death'];
/** Emotes played by the avatar itself; the ones after them (RANK_EMOTES) summon an animal of light. */
export const EMOTES = ['Wave', 'Dance', 'ThumbsUp', 'Yes', 'No', 'Punch'];
export const RANK_EMOTES = ['deer', 'wolf', 'tiger', 'dragon'];
export const isResting = (anim) => anim === ANIM.sit || anim === ANIM.lie || anim === ANIM.work;

/**
 * What an avatar wears and holds travels in the 8 "flags" bits of its state:
 * bit 0 free camera · bits 1-3 hat (index in HATS) · bit 4 jetpack burning · bit 5 bouquet · bit 6 quad · bit 7 big head
 */
export const packLook = (o) => (o.free ? 1 : 0) | ((o.hat & 7) << 1) | (o.jet ? 16 : 0) | (o.bouquet ? 32 : 0) | (o.quad ? 64 : 0) | (o.bighead ? 128 : 0);

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
const _u = new THREE.Vector3(), _w = new THREE.Vector3(), _axis = new THREE.Vector3();
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
    const main = surfaceMaterial({ rough: 0.45, spec: 0.5, name: 'avatar', tintMask: true });
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
    this.look = { hat: 0, jet: false, bouquet: false, quad: false, bighead: false };
    this.big = 0; // 0..1: how far the head has grown
    this.size = 1; // (a cheat shrinks the avatar)
    this._bent = []; this._bentN = 0; // bones bent by hand this frame, and what they were before
    this.mixer.addEventListener('finished', (e) => {
      if (this.emoting && e.action === this.actions[this.emoting]) { this.emoting = null; this._play(CLIP_OF[Math.max(0, this.anim)], 0.25); }
    });
    this.setAnim(ANIM.idle);
  }

  setColor(index) {
    this.colorIndex = index;
    const c = new THREE.Color(AVATAR_COLORS[((index % 16) + 16) % 16]);
    this.mainMaterial.uniforms.uColor.value.set(c.r, c.g, c.b);
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

  emote(index) {
    const name = EMOTES[index];
    if (!name || !this.actions[name] || this.resting || this.anim === ANIM.dead) return;
    this.emoting = name;
    this._play(name, 0.15);
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
    const o = typeof look === 'number' ? { hat: (look >> 1) & 7, jet: !!(look & 16), bouquet: !!(look & 32), quad: !!(look & 64), bighead: !!(look & 128) } : look;
    const l = this.look;
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
    if (o.bighead !== undefined) l.bighead = o.bighead;
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
    // (the mixer only rewrites a bone when its animated value changes: put back what was bent by hand first)
    for (let i = 0; i < this._bentN; i++) this._bent[i].bone.quaternion.copy(this._bent[i].q);
    this._bentN = 0;
    this.mixer.update(dt);
    const l = this.look, k = Math.min(1, dt * 6), base = -this.factory.footY * this.factory.scale;
    const swim = this.swimming, moving = swim ? Math.min(1, this.speed / 2.2) : 0;
    const riding = l.quad && this.anim === ANIM.sit;
    // swimming: stretched out when moving, more upright when treading water
    this.tilt += ((swim ? 0.5 + 0.62 * moving : 0) - this.tilt) * k;
    this.recline += ((this.anim === ANIM.lie ? 1 : 0) - this.recline) * k;
    this.stroke += dt * (swim ? 2.2 + 3.4 * moving : 0);
    const m = this.model;
    m.rotation.x = this.tilt - (this.recline * Math.PI) / 2;
    m.rotation.z = swim ? Math.sin(this.stroke) * 0.16 * moving : 0; // the body rolls with each stroke
    m.position.y = base + (swim ? 0.45 + 0.3 * moving + Math.sin(this.stroke * 2) * 0.03 : 0) + this.recline * 0.3 + (riding ? QUAD.seat - SEAT.under : 0);
    m.position.z = this.recline * 0.86 + (riding ? 0.16 : 0); // lying: the body is centred on the spot, head behind
    // a growing head (and whatever is on it)
    this.big += ((l.bighead ? 1 : 0) - this.big) * Math.min(1, dt * 5);
    this.bones.Head.scale.setScalar(this.headScale * (1 + 1.35 * this.big));
    if (this.root.scale.x !== this.size) this.root.scale.setScalar(this.size);
    // the jetpack stays on the back a moment after it has burnt out
    if (this.jetpack && this.jetpack.visible) {
      const f = this.jetpack.userData.flames;
      if (f.visible) f.scale.set(1, 0.8 + 0.4 * Math.random(), 1);
      else if ((this._jetOff -= dt) <= 0) this.jetpack.visible = false;
    }
    const holding = l.bouquet && this.bouquet && !this.resting && !swim && this.anim !== ANIM.dead;
    if (this.bouquet) this.bouquet.visible = !!holding;
    const hands = swim || holding || riding || this.anim === ANIM.work;
    if (!hands) return;
    // hands put where they belong: the arms are bent to reach
    this.root.updateMatrixWorld(true);
    if (swim) {
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
