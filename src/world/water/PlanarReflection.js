// Planar reflection for water: the scene is rendered once more from a camera mirrored
// about the active water plane, into a reduced-resolution target.
import * as THREE from 'three';
import { LAYER } from '../../render/Shadows.js';
import { G } from '../../render/globals.js';

export class PlanarReflection {
  constructor(engine) {
    this.engine = engine;
    this.renderer = engine.renderer;
    this.camera = new THREE.PerspectiveCamera();
    this.camera.layers.set(LAYER.REFLECT);
    this.matrix = new THREE.Matrix4(); // world -> reflection uv (projective)
    this.planeY = 0;
    this.targetY = 0;
    this.enabled = true;
    this.hooks = []; // { before(reflectionCamera), after() }
    this.frame = 0;
    this._plane = new THREE.Plane();
    this._clip = new THREE.Vector4();
    this._q = new THREE.Vector4();
    this._n = new THREE.Vector3(0, 1, 0);
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._rot = new THREE.Matrix4();
    this._resize();
    engine.on('resize', () => this._resize());
  }

  _resize() {
    const e = this.engine;
    const s = e.tier.reflection;
    const w = Math.max(64, Math.round(e.width * e.pixelRatio * s)), h = Math.max(64, Math.round(e.height * e.pixelRatio * s));
    if (this.target && this.target.width === w && this.target.height === h) return;
    this.target?.dispose();
    this.target = new THREE.WebGLRenderTarget(w, h, {
      type: this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.target.texture.colorSpace = THREE.NoColorSpace;
  }

  setHDR(on) { if (this.hdr !== on) { this.hdr = on; this.target?.dispose(); this.target = null; this._resize(); } }

  /** Render the mirrored view. `every` > 1 skips frames (the stored matrix keeps lookups stable). */
  update(scene, camera, dt, every = 1) {
    if (!this.enabled) return false;
    this.frame++;
    // glide towards the new plane when the active water body changes
    const d = this.targetY - this.planeY;
    this.planeY += Math.abs(d) > 6 ? d : d * Math.min(1, dt * 5);
    if (every > 1 && this.frame % every !== 0) return false;
    const y = this.planeY;
    const cam = this.camera;
    const n = this._n;
    const camPos = this._pos.setFromMatrixPosition(camera.matrixWorld);
    if (camPos.y < y + 0.02) return false; // under the surface: nothing to reflect

    // mirrored position and look target (same construction as a classic reflector)
    const refPos = new THREE.Vector3(camPos.x, y, camPos.z);
    const view = new THREE.Vector3().subVectors(refPos, camPos).reflect(n).negate().add(refPos);
    this._rot.extractRotation(camera.matrixWorld);
    const look = this._look.set(0, 0, -1).applyMatrix4(this._rot).add(camPos);
    const target = this._target.subVectors(refPos, look).reflect(n).negate().add(refPos);
    cam.position.copy(view);
    cam.up.set(0, 1, 0).applyMatrix4(this._rot).reflect(n);
    cam.lookAt(target);
    cam.near = camera.near; cam.far = camera.far;
    cam.fov = camera.fov; cam.aspect = camera.aspect;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    cam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);

    this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.matrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);

    // oblique near plane: clip everything below the water (slightly lowered to avoid shoreline gaps)
    const plane = this._plane.setFromNormalAndCoplanarPoint(n, refPos.set(camPos.x, y - 0.06, camPos.z));
    plane.applyMatrix4(cam.matrixWorldInverse);
    const clip = this._clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const p = cam.projectionMatrix.elements;
    const q = this._q;
    q.x = (Math.sign(clip.x) + p[8]) / p[0];
    q.y = (Math.sign(clip.y) + p[9]) / p[5];
    q.z = -1.0;
    q.w = (1.0 + p[10]) / p[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    p[2] = clip.x; p[6] = clip.y; p[10] = clip.z + 1.0; p[14] = clip.w;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

    const r = this.renderer;
    const prev = r.getRenderTarget();
    const prevAuto = r.autoClear;
    for (const h of this.hooks) h.before?.(cam);
    r.setRenderTarget(this.target);
    r.autoClear = true;
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, cam);
    r.setRenderTarget(prev);
    r.autoClear = prevAuto;
    r.setClearColor(0x9ec3ea, 1);
    for (const h of this.hooks) h.after?.();
    return true;
  }
}
