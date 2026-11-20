// Renderer, frame loop, resolution scaling and performance bookkeeping.
import * as THREE from 'three';
import { detectTier, resolveTier } from './Quality.js';
import { G, globalDefines, refreshGlobalDefines } from '../render/globals.js';
import { setMaxAnisotropy } from './Assets.js';

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    // probe the GPU once to choose a tier before creating the real context
    const probe = document.createElement('canvas').getContext('webgl2');
    this.tierId = detectTier(probe);
    probe?.getExtension('WEBGL_lose_context')?.loseContext();
    this.tier = resolveTier(this.tierId);

    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = true;
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.35, 3200);
    this.camera.position.set(-70, 32, -40);
    this.scale = 1; // dynamic resolution factor (within the tier limits)
    this.detail = 1; // dynamic detail factor: view distances of vegetation, refresh rate of shadows and reflections
    this.frame = 0;
    this.time = 0;
    this.dt = 0.016;
    this.listeners = { resize: new Set(), tier: new Set(), detail: new Set() };
    this.postEnabled = false;
    this._createRenderer();
    this.perf = { fps: 60, ms: 16, cpuMs: 0, calls: 0, triangles: 0, samples: [] };
    this._last = performance.now();
    this._acc = 0; this._accN = 0; this._worst = 0;
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
    if (this.rawDt > this._worst) this._worst = this.rawDt;
    if (this._acc >= 0.5) {
      const ms = (this._acc / this._accN) * 1000;
      p.ms = ms; p.fps = 1000 / ms;
      // What quality settings can act on: the frame time without the worst frame of the window. A pause of the
      // garbage collector, a shader being compiled or a tab coming back is not shortened by drawing less.
      const typical = this._accN > 3 ? ((this._acc - this._worst) / (this._accN - 1)) * 1000 : ms;
      this._acc = 0; this._accN = 0; this._worst = 0;
      if (this.adaptive && this.frame > 30) this._adapt(typical);
    }
  }

  setDetail(d) {
    d = Math.round(Math.min(1, Math.max(0.5, d)) * 100) / 100;
    if (d === this.detail) return;
    this.detail = d;
    this.listeners.detail.forEach((fn) => fn(d));
  }

  /**
   * Keeps the game smooth: when frames take too long, pixels go first (resolution scale), then detail (how far
   * trees, grass and flowers are drawn in full, how often shadows and reflections are refreshed). Both come
   * back, slowly, when there is room again.
   */
  _adapt(ms) {
    // The frame time to aim for: 58 frames a second — or, once shedding everything has been tried and bought
    // nothing, the frame time this device is held at anyway (a browser capped at 30 frames a second in
    // low-power mode, a slow processor): quality then comes back, since lowering it does not help.
    if (this._floor && ms < this._floor * 0.9) this._floor = 0; // it can do better after all
    const target = Math.max(1000 / 58, this._floor || 0);
    const now = this.time;
    if (ms > target * 1.12) {
      this._calm = 0;
      const episode = this._episode || (this._episode = { ms });
      const atMin = this.scale <= this.tier.minScale + 0.01 && this.detail <= 0.5;
      if (atMin) {
        if (ms > episode.ms * 0.9) this._floor = ms; // all the way down for nothing: the limit is elsewhere
        return;
      }
      // Dropping again right after a raise means that level cannot be held: wait twice as long before the next
      // try (up to two minutes), so that the picture does not keep switching back and forth.
      if (now - (this._raised ?? -1e9) < 8) this._patience = Math.min(240, (this._patience || 4) * 2);
      this._dropped = now;
      // one step down — two below about 23 frames a second, so that a weak device is not left struggling for
      // long (a single missed frame per frame, 60 -> 30, must stay a single step: see the patience above)
      for (let step = ms > target * 2.5 ? 2 : 1; step > 0; step--) {
        if (this.scale > 0.8) this.setScale(this.scale - 0.07);
        else if (this.detail > 0.5) this.setDetail(this.detail - 0.1);
        else this.setScale(this.scale - 0.07);
      }
    } else {
      this._episode = null;
      if (ms < target * 1.04 && (this.scale < 1 || this.detail < 1)) {
        this._calm = (this._calm || 0) + 1;
        if (this._calm >= (this._patience || 4)) {
          this._calm = 0;
          // the previous raise held (nothing was shed since): conditions are improving, try sooner next time
          if (this._raised !== undefined && (this._dropped ?? -1e9) < this._raised) this._patience = Math.max(4, (this._patience || 4) / 2);
          this._raised = now;
          if (this.detail < 1 && this.scale >= 0.79) this.setDetail(this.detail + 0.1);
          else this.setScale(this.scale + 0.05);
        }
      } else this._calm = 0;
    }
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
