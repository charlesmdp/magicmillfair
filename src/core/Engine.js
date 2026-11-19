// Renderer, frame loop, resolution scaling and performance bookkeeping.
import * as THREE from 'three';
import { TIERS, detectTier } from './Quality.js';
import { G, globalDefines, refreshGlobalDefines } from '../render/globals.js';
import { setMaxAnisotropy } from './Assets.js';

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    // probe the GPU once to choose a tier before creating the real context
    const probe = document.createElement('canvas').getContext('webgl2');
    this.tierId = detectTier(probe);
    probe?.getExtension('WEBGL_lose_context')?.loseContext();
    this.tier = TIERS[this.tierId];

    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = true;
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.35, 3200);
    this.camera.position.set(-70, 32, -40);
    this.scale = 1; // dynamic resolution factor (within the tier limits)
    this.frame = 0;
    this.time = 0;
    this.dt = 0.016;
    this.listeners = { resize: new Set(), tier: new Set() };
    this.postEnabled = false;
    this._createRenderer();
    this.perf = { fps: 60, ms: 16, cpuMs: 0, calls: 0, triangles: 0, samples: [] };
    this._last = performance.now();
    this._acc = 0; this._accN = 0;
    this.adaptive = true;
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  _createRenderer() {
    const t = this.tier;
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: t.msaa && !(t.post && this.postEnabled),
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
    });
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.info.autoReset = false;
    renderer.sortObjects = true;
    renderer.setClearColor(0x9ec3ea, 1);
    this.renderer = renderer;
    const gl = renderer.getContext();
    this.hasFloatTargets = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    setMaxAnisotropy(Math.min(t.quality >= 2 ? 8 : t.quality === 1 ? 4 : 2, renderer.capabilities.getMaxAnisotropy()));
    globalDefines.QUALITY = t.quality;
    globalDefines.SHADOW_SOFT = t.shadowSoft;
    refreshGlobalDefines();
    this.resize();
  }

  on(type, fn) { this.listeners[type].add(fn); return () => this.listeners[type].delete(fn); }

  get pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.tier.maxPixelRatio) * this.scale;
  }

  resize() {
    const w = Math.max(1, Math.floor(window.innerWidth)), h = Math.max(1, Math.floor(window.innerHeight));
    this.width = w; this.height = h;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep a comfortable horizontal field of view on tall (phone) screens
    this.camera.fov = w < h ? 68 : 55;
    this.camera.updateProjectionMatrix();
    this.listeners.resize.forEach((fn) => fn(w, h, this.pixelRatio));
  }

  setScale(s) {
    s = Math.min(1, Math.max(this.tier.minScale, s));
    if (Math.abs(s - this.scale) < 0.02) return;
    this.scale = s;
    this.resize();
  }

  /** Called once per frame by the app before rendering. */
  beginFrame() {
    const now = performance.now();
    let dt = (now - this._last) / 1000;
    this._last = now;
    this.rawDt = dt;
    dt = Math.min(dt, 0.1);
    this.dt = dt;
    this.time += dt;
    this.frame++;
    G.uTime.value = this.time;
    this.renderer.info.reset();
    this._cpu0 = now;
  }

  endFrame() {
    const info = this.renderer.info.render;
    const p = this.perf;
    p.calls = info.calls; p.triangles = info.triangles;
    p.cpuLast = performance.now() - this._cpu0;
    p.cpuMs += (p.cpuLast - p.cpuMs) * 0.1;
    this._acc += this.rawDt; this._accN++;
    if (this._acc >= 0.5) {
      const ms = (this._acc / this._accN) * 1000;
      p.ms = ms; p.fps = 1000 / ms;
      this._acc = 0; this._accN = 0;
      if (this.adaptive && this.frame > 90) this._adapt(ms);
    }
  }

  /** Dynamic resolution: trade pixels for frame rate, slowly and with hysteresis. */
  _adapt(ms) {
    const target = 1000 / 58;
    if (ms > target * 1.22) this.setScale(this.scale - 0.07);
    else if (ms < target * 1.04 && this.scale < 1) {
      this._calm = (this._calm || 0) + 1;
      if (this._calm >= 4) { this._calm = 0; this.setScale(this.scale + 0.05); }
    } else this._calm = 0;
  }

  start(fn) {
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      this.beginFrame();
      fn(this.dt, this.time);
      this.endFrame();
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() { cancelAnimationFrame(this._raf); }
}
