// Sun shadows.
//  - a large static map covering the whole world, rendered once (the sun never moves),
//  - an optional small dynamic map following the camera for crisp nearby shadows
//    (characters, swaying foliage, building details).
import * as THREE from 'three';
import { G, makeMaterial, globalDefines, refreshGlobalDefines } from './globals.js';

export const LAYER = { MAIN: 0, STATIC_CASTER: 1, REFLECT: 2, DYNAMIC_CASTER: 3 };

const DEPTH_VERT = /* glsl */ `
void main() {
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * p;
}
`;
const DEPTH_FRAG = /* glsl */ `void main() { gl_FragColor = vec4(1.0); }`;

let defaultDepth = null;
export function defaultDepthMaterial() {
  if (!defaultDepth) {
    defaultDepth = makeMaterial({ vertexShader: DEPTH_VERT, fragmentShader: DEPTH_FRAG, side: THREE.DoubleSide });
    defaultDepth.colorWrite = false;
  }
  return defaultDepth;
}

function makeTarget(size) {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    format: THREE.RedFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: true,
  });
  const dt = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
  dt.format = THREE.DepthFormat;
  dt.compareFunction = THREE.LessEqualCompare;
  dt.minFilter = THREE.LinearFilter;
  dt.magFilter = THREE.LinearFilter;
  rt.depthTexture = dt;
  return rt;
}

export class Shadows {
  constructor(engine) {
    this.engine = engine;
    this.renderer = engine.renderer;
    this.tier = engine.tier;
    this.staticCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100);
    this.staticCam.layers.set(LAYER.STATIC_CASTER);
    this.dynCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100);
    this.dynCam.layers.set(LAYER.STATIC_CASTER);
    this.dynCam.layers.enable(LAYER.DYNAMIC_CASTER);
    this.staticTarget = makeTarget(this.tier.shadowStatic);
    G.uShadowStatic.value = this.staticTarget.depthTexture;
    this.dynTarget = null;
    this.dynRadius = 46;
    this._swapped = [];
    this._v = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._proj = new THREE.Matrix4();
    this.frame = 0;
    this.hooks = []; // { before(shadowCamera, isStatic), after() } : let systems adapt to the shadow view
    this.setDynamic(this.tier.shadowDynamic);
  }

  setDynamic(size) {
    this.dynTarget?.dispose();
    this.dynTarget = size > 0 ? makeTarget(size) : null;
    G.uShadowDyn.value = this.dynTarget ? this.dynTarget.depthTexture : null;
    G.uShadowParams.value.set(1 / this.staticTarget.width, size > 0 ? 1 / size : 0, 0, this.dynRadius);
    globalDefines.SHADOW_DYNAMIC = size > 0;
    refreshGlobalDefines();
  }

  _fitStatic(bounds) {
    const L = G.uSunDir.value;
    const cam = this.staticCam;
    const center = bounds.getCenter(new THREE.Vector3());
    cam.position.copy(center).addScaledVector(L, 2000);
    cam.up.set(0, 1, 0);
    cam.lookAt(center);
    cam.updateMatrixWorld(true);
    const inv = cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const b = new THREE.Box3();
    for (let i = 0; i < 8; i++) {
      this._v.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z).applyMatrix4(inv);
      b.expandByPoint(this._v);
    }
    cam.left = b.min.x; cam.right = b.max.x; cam.bottom = b.min.y; cam.top = b.max.y;
    cam.near = -b.max.z - 5; cam.far = -b.min.z + 5;
    cam.updateProjectionMatrix();
    G.uShadowStaticMat.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  }

  /** Temporarily replace materials by their depth-only versions for objects seen by `camera`. */
  _swap(root, camera) {
    const list = this._swapped;
    list.length = 0;
    const def = defaultDepthMaterial();
    root.traverseVisible((o) => {
      if (!(o.isMesh || o.isPoints) || !o.layers.test(camera.layers)) return;
      list.push(o, o.material);
      o.material = o.userData.depthMaterial || def;
    });
  }
  _restore() {
    const list = this._swapped;
    for (let i = 0; i < list.length; i += 2) list[i].material = list[i + 1];
    list.length = 0;
  }

  _render(scene, camera, target) {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    this._swap(scene, camera);
    r.setRenderTarget(target);
    r.autoClear = true;
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAuto;
    this._restore();
  }

  /**
   * Render the whole world into the static shadow map.
   * `prepare` lets systems switch to bake-time geometry (all trees, uniform terrain);
   * it returns a cleanup function.
   */
  bakeStatic(scene, bounds, prepare) {
    this._fitStatic(bounds);
    const cleanup = prepare ? prepare(this.staticCam) : null;
    for (const h of this.hooks) h.before?.(this.staticCam, true);
    this._render(scene, this.staticCam, this.staticTarget);
    for (const h of this.hooks) h.after?.(true);
    cleanup?.();
    this.staticBaked = true;
  }

  /** Follow the camera with the dynamic map. */
  updateDynamic(scene, camera, every = 1) {
    if (!this.dynTarget) { G.uShadowParams.value.z = 0; return; }
    this.frame++;
    if (every > 1 && this.frame % every !== 0 && G.uShadowParams.value.z > 0.5) return;
    const L = G.uSunDir.value;
    const R = this.dynRadius;
    // centre a little ahead of the camera, on the ground rather than up in the air
    const f = this._v.set(0, 0, -1).applyQuaternion(camera.quaternion);
    f.y = 0; if (f.lengthSq() > 1e-6) f.normalize();
    const focus = new THREE.Vector3().copy(camera.position).addScaledVector(f, R * 0.62);
    focus.y = this.focusY ?? camera.position.y - 2;
    const cam = this.dynCam;
    cam.up.set(0, 1, 0);
    cam.position.copy(focus).addScaledVector(L, 160);
    cam.lookAt(focus);
    cam.updateMatrixWorld(true);
    // snap to shadow texels so the edges do not swim when the camera moves
    const texel = (2 * R) / this.dynTarget.width;
    const inv = this._m.copy(cam.matrixWorld).invert();
    const c = focus.clone().applyMatrix4(inv);
    const sx = Math.round(c.x / texel) * texel - c.x, sy = Math.round(c.y / texel) * texel - c.y;
    cam.position.addScaledVector(new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), sx);
    cam.position.addScaledVector(new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1), sy);
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    cam.left = -R; cam.right = R; cam.bottom = -R; cam.top = R;
    cam.near = 10; cam.far = 320;
    cam.updateProjectionMatrix();
    for (const h of this.hooks) h.before?.(cam, false);
    this._render(scene, cam, this.dynTarget);
    for (const h of this.hooks) h.after?.(false);
    G.uShadowDynMat.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    G.uShadowParams.value.z = 1;
    G.uShadowParams.value.w = R;
    G.uShadowCenter.value.copy(focus);
  }
}
