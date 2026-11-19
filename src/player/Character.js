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
export const ANIM = { idle: 0, walk: 1, run: 2, jump: 3, swim: 4, sit: 5 };
const CLIP_OF = ['Idle', 'Walking', 'Running', 'Jump', 'Walking', 'Sitting'];
export const EMOTES = ['Wave', 'Dance', 'ThumbsUp', 'Yes', 'No', 'Punch'];

const HEIGHT = 1.72;

export class CharacterFactory {
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
    this.setColor(colorIndex);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of factory.clips) {
      const a = this.mixer.clipAction(clip);
      if (['Jump', ...EMOTES].includes(clip.name) && clip.name !== 'Dance') { a.clampWhenFinished = true; a.loop = THREE.LoopOnce; }
      this.actions[clip.name] = a;
    }
    this.current = null;
    this.anim = -1;
    this.emoting = null;
    this.tilt = 0;
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
    if (id !== this.anim) {
      this.anim = id;
      if (this.emoting && id !== ANIM.idle) this.emoting = null;
      if (!this.emoting) this._play(CLIP_OF[id] || 'Idle', id === ANIM.jump ? 0.1 : 0.22);
    }
    const a = this.actions[CLIP_OF[id]];
    if (a && !this.emoting) a.timeScale = id === ANIM.walk ? Math.max(0.6, speed / 2.3) : id === ANIM.run ? Math.max(0.8, speed / 6.2) : id === ANIM.swim ? 0.7 : 1;
    this.swimming = id === ANIM.swim;
  }

  emote(index) {
    const name = EMOTES[index];
    if (!name || !this.actions[name]) return;
    this.emoting = name;
    this._play(name, 0.15);
  }

  update(dt) {
    this.mixer.update(dt);
    // lean forward when swimming
    const target = this.swimming ? 1.05 : 0;
    this.tilt += (target - this.tilt) * Math.min(1, dt * 6);
    this.model.rotation.x = this.tilt;
    this.model.position.y = -this.factory.footY * this.factory.scale + (this.swimming ? 0.45 : 0);
  }

  dispose() {
    this.mixer.stopAllAction();
    for (const m of this.materials) m.dispose();
    this.root.removeFromParent();
  }
}
