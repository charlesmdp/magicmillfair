// Built-in benchmark: a fixed camera tour through both zones, with frame-time statistics.
// Open the page with ?bench=1 (timed tour, about 35 s) or ?bench=<n> (n evenly spaced frames, for slow
// software renderers). Results are shown on screen and exposed on window.__mmf.bench.
import * as THREE from 'three';

// x, z, height above the ground (or the water), then the point looked at: x, z, height above the ground
const TOUR = [
  [-48, -62, 20, -120, -6, 4],
  [-84, -36, 6, -122, -6, 4],
  [-104, 16, 8, -150, 50, 1],
  [-150, 104, 12, -186, 66, 0],
  [-66, 44, 24, 24, -8, 6],
  [44, -18, 15, 140, -62, 5],
  [150, -84, 15, 246, -182, 4],
  [224, -172, 7, 300, -178, 9],
  [302, -176, 10, 444, -123, 30],
  [398, -164, 17, 445, -123, 34],
  [470, -62, 30, 430, -128, 25],
  [498, -150, 22, 380, -140, 10],
];
const SEGMENT = 3.2; // seconds per leg in timed mode

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export class Benchmark {
  constructor(engine, world, { frames = 0 } = {}) {
    this.engine = engine;
    this.world = world;
    this.fixedFrames = frames > 1 ? Math.round(frames) : 0;
    const floor = (x, z) => Math.max(world.data.heightAt(x, z), world.data.waterAt(x, z));
    this.keys = TOUR.map(([x, z, h, lx, lz, lh]) => [x, floor(x, z) + h, z, lx, floor(lx, lz) + lh, lz]);
    this.duration = (this.keys.length - 1) * SEGMENT;
    this.phase = 'warmup';
    this.u = 0;
    this.samples = [];
    this.calls = []; this.tris = [];
    this.done = false;
    this._look = new THREE.Vector3();
    engine.adaptive = false; // fixed resolution: results stay comparable
    engine.setScale(1);
  }

  /** Camera pose at u in [0, 1] along the tour. */
  pose(u, camera) {
    const n = this.keys.length - 1;
    const f = Math.min(n - 1e-4, Math.max(0, u * n));
    const i = Math.floor(f), t = f - i;
    const k = (j) => this.keys[Math.min(n, Math.max(0, j))];
    const a = k(i - 1), b = k(i), c = k(i + 1), d = k(i + 2);
    const v = [0, 1, 2, 3, 4, 5].map((j) => catmull(a[j], b[j], c[j], d[j], t));
    // never dive under the terrain between two keys
    const world = this.world.data;
    v[1] = Math.max(v[1], Math.max(world.heightAt(v[0], v[2]), world.waterAt(v[0], v[2])) + 2.5);
    camera.position.set(v[0], v[1], v[2]);
    camera.lookAt(this._look.set(v[3], v[4], v[5]));
  }

  /** Call once per frame before rendering. Returns true while the tour runs. */
  update(dt, camera) {
    if (this.done) return false;
    const eng = this.engine;
    if (this.phase === 'warmup') {
      // quick first lap: compiles shaders and streams vegetation, not measured
      this.u += this.fixedFrames ? 1 / 12 : dt / 5;
      if (this.u >= 1) { this.u = 0; this.phase = 'run'; this._skip = 3; }
      this.pose(Math.min(1, this.u), camera);
      return true;
    }
    if (this._skip > 0) this._skip--;
    else {
      this.samples.push(eng.rawDt * 1000);
      this.calls.push(eng.perf.calls); this.tris.push(eng.perf.triangles);
    }
    this.u += this.fixedFrames ? 1 / this.fixedFrames : dt / this.duration;
    if (this.u >= 1) { this._finish(); return false; }
    this.pose(this.u, camera);
    return true;
  }

  get progress() { return this.phase === 'warmup' ? this.u * 0.12 : 0.12 + this.u * 0.88; }

  _finish() {
    this.done = true;
    const s = [...this.samples].sort((a, b) => a - b);
    const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    const pct = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0;
    const eng = this.engine, gl = eng.renderer.getContext();
    let gpu = '';
    try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)); } catch { /* hidden */ }
    const ms = avg(this.samples);
    this.result = {
      tier: eng.tierId,
      gpu,
      frames: this.samples.length,
      width: Math.round(eng.width * eng.pixelRatio), height: Math.round(eng.height * eng.pixelRatio),
      fpsAvg: +(1000 / ms).toFixed(1),
      msAvg: +ms.toFixed(2), msMedian: +pct(0.5).toFixed(2), ms95: +pct(0.95).toFixed(2), ms99: +pct(0.99).toFixed(2),
      fpsLow1: +(1000 / Math.max(0.01, pct(0.99))).toFixed(1),
      callsAvg: Math.round(avg(this.calls)), callsMax: Math.max(...this.calls),
      trisAvg: Math.round(avg(this.tris)), trisMax: Math.max(...this.tris),
    };
    console.log('[bench]', JSON.stringify(this.result));
  }

  /** Human-readable summary (French). */
  report() {
    const r = this.result;
    if (!r) return '';
    const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : `${Math.round(n / 1000)} k`);
    return [
      `Palier ${r.tier} · ${r.width}×${r.height}`,
      `Moyenne ${r.fpsAvg} ips (${r.msAvg} ms)`,
      `1 % les plus lentes : ${r.fpsLow1} ips (${r.ms99} ms)`,
      `Appels de dessin : ${r.callsAvg} en moyenne, ${r.callsMax} au plus`,
      `Triangles : ${k(r.trisAvg)} en moyenne, ${k(r.trisMax)} au plus`,
      r.gpu ? `GPU : ${r.gpu}` : '',
    ].filter(Boolean).join('\n');
  }
}
