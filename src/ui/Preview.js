// Pictures for the shop: the visitor's own robot wearing (or leaving behind it) each thing that is sold,
// drawn once by the game's renderer into a small canvas — the real thing, not a drawing of it.
import * as THREE from 'three';
import { ANIM } from '../player/Character.js';
import { HATS } from '../player/Cosmetics.js';
import { PAINTS, TRAILS } from '../../server/items.js';
import { Sparks } from '../world/effects/Sparks.js';

const UP = 640; // far above the valley: nothing casts a shadow there

export class Previewer {
  constructor(engine, factory) {
    this.engine = engine;
    this.factory = factory;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 0.8, 0.2, 60);
    this.targets = new Map(); // "wxh" → render target
    this.character = null;
    this.sparks = null;
  }

  _target(w, h) {
    const key = `${w}x${h}`;
    if (!this.targets.has(key)) this.targets.set(key, new THREE.WebGLRenderTarget(w, h, { samples: 4, depthBuffer: true }));
    return this.targets.get(key);
  }

  /**
   * A picture of the robot (in colour `color`) with `id` ('hat:crown', 'jetpack', 'paint:gold', 'trail:confetti',
   * 'fireworks', or '' for the robot as it is), `w` by `h` pixels. Returns a canvas (transparent round the robot).
   */
  shot(id, color, w = 300, h = 375) {
    const { renderer } = this.engine;
    if (!this.character) {
      this.character = this.factory.create(color);
      this.character.root.position.set(0, UP, 0);
      this.scene.add(this.character.root);
      this.sparks = new Sparks();
      this.scene.add(this.sparks.mesh);
    }
    const c = this.character, [type, name] = id.split(':');
    c.setPaint(0);
    c.setColor(color);
    c.setLook({ hat: 0, jet: false, bouquet: false, quad: false, bighead: false });
    if (c.jetpack) c.jetpack.visible = false;
    for (const it of this.sparks.items) it.on = false;
    this.sparks.rockets.length = 0;
    let view = 'body';
    if (type === 'hat') { c.setLook({ hat: Math.max(0, HATS.findIndex((x) => x.id === name)) }); view = 'head'; }
    else if (type === 'jetpack' || type === 'jetlite') { c.setLook({ jet: true }); view = 'back'; }
    else if (type === 'paint') c.setPaint(Math.max(0, PAINTS.indexOf(name)));
    c.setAnim(type === 'trail' ? ANIM.run : ANIM.idle, 6);
    // (a few steps of its animation, so that it stands — or runs — as it does in the game; the paints that move get somewhere)
    for (let k = 0; k < 14; k++) c.update(0.1 + (type === 'paint' ? 0.35 : 0));
    if (type === 'jetlite' && c.jetpack) c.jetpack.scale.setScalar(0.72); else if (c.jetpack) c.jetpack.scale.setScalar(1);
    const cam = this.camera;
    cam.aspect = w / h;
    // (the robot stands in the upper four fifths of the picture: the name of the card goes over the bottom)
    if (view === 'head') { cam.fov = 26; cam.position.set(1.6, UP + 1.85, 4.3); cam.lookAt(0, UP + 1.18, 0); }
    else if (view === 'back') { cam.fov = 28; cam.position.set(-2.2, UP + 1.3, -3.9); cam.lookAt(0, UP + 0.62, 0); }
    else { cam.fov = 28; cam.position.set(1.7, UP + 1.15, 4.3); cam.lookAt(0, UP + 0.62, 0); }
    if (type === 'trail') {
      // a wake of it, as if the robot had come running from the left of the picture
      const trail = Math.max(0, TRAILS.indexOf(name));
      cam.position.set(2.4, UP + 1.2, 5.2); cam.lookAt(-0.7, UP + 0.6, 0);
      for (let k = 0; k < 150; k++) { const u = (150 - k) * 0.012; this.sparks.trail(trail, 0.07, -u * 1.5, UP, -u * 0.25, 6); this.sparks.update(0.012, cam, h); }
    } else if (type === 'fireworks') {
      cam.fov = 44; cam.position.set(1.5, UP + 1.5, 15); cam.lookAt(0, UP + 5.4, 0);
      // (three rockets from below the picture, lit one after the other: one has burst, one is bursting, one is on its way)
      for (const [dx, wait] of [[-3.6, 0], [3.4, 10], [0.2, 18]]) { for (let k = 0; k < wait; k++) this.sparks.update(0.045, cam, h); this.sparks.firework(dx, UP - 13, -2); }
      for (let k = 0; k < 21; k++) this.sparks.update(0.045, cam, h);
    }
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    this.sparks.update(0.0001, cam, h);
    const rt = this._target(w, h), was = renderer.getRenderTarget(), color0 = new THREE.Color(), alpha0 = renderer.getClearAlpha();
    renderer.getClearColor(color0);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(this.scene, cam);
    const px = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    renderer.setRenderTarget(was);
    renderer.setClearColor(color0, alpha0);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'), img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // (rows come bottom first)
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  dispose() {
    for (const t of this.targets.values()) t.dispose();
    this.targets.clear();
    if (this.character) { this.character.dispose(); this.character = null; }
  }
}
