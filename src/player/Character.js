// Animated avatar (a friendly CC0 robot), shared by the local player and remote players.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { surfaceMaterial, skinnedDepthMaterial } from '../render/SurfaceMaterial.js';
import { LAYER } from '../render/Shadows.js';
import { assetUrl } from '../core/Assets.js';

/** Body colours offered to players (index is what travels over the network). */
export const AVATAR_COLORS = [
  0xf2a03d, 0xe8554e, 0x3fa7d6, 0x59c173, 0xb07cd8, 0xf2d24b, 0xff8fb1, 0x2ec4b6,
  0xe76f51, 0x6c8ef5, 0x9ccc65, 0xd4a373, 0xef476f, 0x48cae4, 0xf4f1de, 0x8d99ae,
];

/** Animation ids exchanged over the network. */
export const ANIM = { idle: 0, walk: 1, run: 2, jump: 3, swim: 4, sit: 5, lie: 6, work: 7 };
const CLIP_OF = ['Idle', 'Walking', 'Running', 'Jump', 'Running', 'Sitting', 'Idle', 'Sitting'];
/** Emotes played by the avatar itself; the ones after them (RANK_EMOTES) summon an animal of light. */
export const EMOTES = ['Wave', 'Dance', 'ThumbsUp', 'Yes', 'No', 'Punch'];
export const RANK_EMOTES = ['deer', 'wolf', 'tiger', 'dragon'];
export const isResting = (anim) => anim === ANIM.sit || anim === ANIM.lie || anim === ANIM.work;

const HEIGHT = 1.72;
// Seated, the hips sit this far behind the feet and the underside of the body this high above them.
export const SEAT = { back: 0.22, under: 0.2 };

// Bones bent on top of the animation: [axis, angle…] (found by trying; exposed for tuning)
export const POSE = { swim: ['z', -0.9], work: ['z', -0.95, 'z', -0.55] };

// A laptop for those who sit down to work: one small mesh, shared geometry and material.
let laptopParts = null;
function laptop() {
  if (!laptopParts) {
    const g = new THREE.BufferGeometry();
    const pos = [], nrm = [], col = [], idx = [];
    const box = (x0, y0, z0, x1, y1, z1, c) => {
      const faces = [
        [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
        [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
        [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]],
      ];
      for (const [a, b2, c2, d, n] of faces) {
        const i = pos.length / 3;
        for (const v of [a, b2, c2, d]) { pos.push(...v); nrm.push(...n); col.push(...c); }
        idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
      }
    };
    const dark = [0.035, 0.037, 0.04], key = [0.012, 0.012, 0.014];
    box(-0.19, 0, -0.13, 0.19, 0.018, 0.13, dark); // base
    box(-0.16, 0.018, -0.1, 0.16, 0.021, 0.04, key); // keyboard
    // lid, leaning back, with a lit screen facing the user (the user sits on the -Z side)
    const lid = (y, z) => [y * Math.cos(0.3) - z * Math.sin(0.3), 0.13 + y * Math.sin(0.3) + z * Math.cos(0.3)];
    const quad = (pts, n, c) => { const i = pos.length / 3; for (const v of pts) { pos.push(...v); nrm.push(...n); col.push(...c); } idx.push(i, i + 1, i + 2, i, i + 2, i + 3); };
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
    this.template = gltf.scene;
    // facial morph targets are dropped (see Character), so their animation tracks go too
    this.clips = gltf.animations.map((clip) => {
      clip.tracks = clip.tracks.filter((t) => !t.name.includes('morphTargetInfluences'));
      return clip;
    });
    const box = new THREE.Box3().setFromObject(this.template);
    this.scale = HEIGHT / (box.max.y - box.min.y);
    this.footY = box.min.y;
    return this;
  }

  create(colorIndex = 0) { return new Character(this, colorIndex); }
}

export class Character {
  constructor(factory, colorIndex) {
    this.factory = factory;
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(factory.template);
    this.model.scale.setScalar(factory.scale);
    this.model.position.y = -factory.footY * factory.scale;
    this.root.add(this.model);
    this.bodyColor = new THREE.Vector3();
    const main = surfaceMaterial({ rough: 0.45, spec: 0.5, vertexColors: false, name: 'avatar-main' });
    const grey = surfaceMaterial({ color: [0.3, 0.3, 0.28], rough: 0.5, spec: 0.5, vertexColors: false, name: 'avatar-grey' });
    const black = surfaceMaterial({ color: [0.03, 0.03, 0.035], rough: 0.3, spec: 0.8, vertexColors: false, name: 'avatar-black' });
    this.mainMaterial = main;
    this.materials = [main, grey, black];
    const depth = skinnedDepthMaterial();
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      const name = o.material.name;
      o.material = name === 'Main' ? main : name === 'Black' ? black : grey;
      o.userData.depthMaterial = depth;
      o.layers.enable(LAYER.DYNAMIC_CASTER);
      o.layers.enable(LAYER.REFLECT);
      o.frustumCulled = false;
      // facial morphs are not used; drop them so the shader stays simple
      o.morphTargetInfluences = undefined;
      o.morphTargetDictionary = undefined;
      if (o.geometry.morphAttributes && Object.keys(o.geometry.morphAttributes).length) {
        o.geometry = o.geometry.clone();
        o.geometry.morphAttributes = {};
      }
    });
    if (factory.blobShadow) {
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), blobShadowMaterial());
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.05;
      blob.renderOrder = 3;
      this.root.add(blob);
    }
    this.setColor(colorIndex);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of factory.clips) {
      const a = this.mixer.clipAction(clip);
      if (['Jump', 'Sitting', 'Standing', ...EMOTES].includes(clip.name) && clip.name !== 'Dance') { a.clampWhenFinished = true; a.loop = THREE.LoopOnce; }
      this.actions[clip.name] = a;
    }
    this.bones = {};
    this.model.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    this.current = null;
    this.anim = -1;
    this.emoting = null;
    this.tilt = 0; // leaning forward (swimming)
    this.recline = 0; // lying on the back
    this.stroke = 0; // phase of the swimming strokes
    this.speed = 0;
    this.ambient = 1;
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
      if (!this.emoting) this._play(rising && id === ANIM.idle ? 'Standing' : CLIP_OF[id] || 'Idle', id === ANIM.jump ? 0.1 : 0.22);
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
    if (!name || !this.actions[name] || this.resting) return;
    this.emoting = name;
    this._play(name, 0.15);
  }

  _setLaptop(on) {
    if (on && !this.laptop) {
      this.laptop = laptop();
      this.laptop.position.set(0, 0.47, 0.24); // on the knees, screen towards the face
      this.root.add(this.laptop);
    }
    if (this.laptop) this.laptop.visible = on;
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
    const k = Math.min(1, dt * 6), base = -this.factory.footY * this.factory.scale;
    const swim = this.swimming, moving = swim ? Math.min(1, this.speed / 2.2) : 0;
    // swimming: stretched out when moving, more upright when treading water
    this.tilt += ((swim ? 0.5 + 0.62 * moving : 0) - this.tilt) * k;
    this.recline += ((this.anim === ANIM.lie ? 1 : 0) - this.recline) * k;
    this.stroke += dt * (swim ? 2.2 + 3.4 * moving : 0);
    const m = this.model;
    m.rotation.x = this.tilt - this.recline * Math.PI / 2;
    m.rotation.z = swim ? Math.sin(this.stroke) * 0.16 * moving : 0; // the body rolls with each stroke
    m.position.y = base + (swim ? 0.45 + 0.3 * moving + Math.sin(this.stroke * 2) * 0.03 : 0) + this.recline * 0.3;
    m.position.z = this.recline * 0.86; // lying: the body is centred on the spot, head behind
    if (swim) {
      // crawl: the arms come round one after the other
      const reach = 0.5 + 0.8 * moving;
      this._bend('UpperArmL', POSE.swim[0], Math.sin(this.stroke) * reach + POSE.swim[1] * moving);
      this._bend('UpperArmR', POSE.swim[0], Math.sin(this.stroke + Math.PI) * reach + POSE.swim[1] * moving);
    } else if (this.anim === ANIM.work) {
      // hands on the keyboard, fingers busy
      const t = (this.stroke += dt * 9);
      this._bend('UpperArmL', POSE.work[0], POSE.work[1] + Math.sin(t) * 0.05);
      this._bend('UpperArmR', POSE.work[0], POSE.work[1] + Math.sin(t * 1.31 + 1) * 0.05);
      this._bend('LowerArmL', POSE.work[2], POSE.work[3]);
      this._bend('LowerArmR', POSE.work[2], POSE.work[3]);
    }
  }

  /** Extra rotation of a bone about one of its own axes, on top of the animation, for this frame. */
  _bend(name, axis, angle) {
    const bone = this.bones[name];
    if (!bone) return;
    const slot = this._bent[this._bentN] || (this._bent[this._bentN] = { bone: null, q: new THREE.Quaternion() });
    this._bentN++;
    slot.bone = bone; slot.q.copy(bone.quaternion);
    if (axis === 'x') bone.rotateX(angle); else if (axis === 'y') bone.rotateY(angle); else bone.rotateZ(angle);
  }

  dispose() {
    this.mixer.stopAllAction();
    for (const m of this.materials) m.dispose();
    this.root.removeFromParent();
  }
}
