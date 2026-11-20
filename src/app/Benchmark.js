// Built-in benchmark: a fixed camera tour through both zones, with frame-time statistics.
// Open the page with ?bench=1 (timed tour, about 35 s) or ?bench=<n> (n evenly spaced frames, for slow
// software renderers). Results are shown on screen and exposed on window.__mmf.bench.
import * as THREE from 'three';

// x, z, height above the ground (or the water), then the point looked at: x, z, height above the ground
const TOUR = [
  [-70, -52, 22, -122, -6, 4], // the mill from the north-east
  [-96, -30, 6, -122, -8, 4], // into the courtyard
  [-106, 14, 8, -150, 50, 1], // over the dam, the great pond
  [-170, 96, 10, -215, 100, 1], // the willow island
  [-240, 104, 9, -285, 123, 14], // the waterfall
  [-160, 112, 16, -110, 138, 18], // the old tree
  [-60, 60, 20, -20, 0, 4], // over the hillside, towards the sea
  [-40, -30, 10, 10, -8, 4], // iris pond and the seafront
  [-6, 4, 6, 60, 10, 10], // the plaza, the pier ahead
  [60, 12, 12, 118, 16, 30], // on the pier, the big wheel
  [150, -40, 26, 100, 14, 22], // round the wheel
  [120, 70, 22, 20, 0, 8], // from the sea: the whole valley and its mountains
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
    this.calls = []; this.tris = []; this.cpu = [];
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
      this.calls.push(eng.perf.calls); this.tris.push(eng.perf.triangles); this.cpu.push(eng.perf.cpuLast || 0);
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
      cpuAvg: +avg(this.cpu).toFixed(2), cpuMax: +Math.max(...this.cpu).toFixed(2),
      callsAvg: Math.round(avg(this.calls)), callsMax: Math.max(...this.calls),
      trisAvg: Math.round(avg(this.tris)), trisMax: Math.max(...this.tris),
    };
    console.log('[bench]', JSON.stringify(this.result));
  }

  /** Human-readable summary. */
  report() {
    const r = this.result;
    if (!r) return '';
    const k = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : `${Math.round(n / 1000)} k`);
    return [
      `${r.tier} · ${r.width}×${r.height}`,
      `Average ${r.fpsAvg} fps (${r.msAvg} ms)`,
      `Slowest 1 %: ${r.fpsLow1} fps (${r.ms99} ms)`,
      `Script time: ${r.cpuAvg} ms on average, ${r.cpuMax} ms at most`,
      `Draw calls: ${r.callsAvg} on average, ${r.callsMax} at most`,
      `Triangles: ${k(r.trisAvg)} on average, ${k(r.trisMax)} at most`,
      r.gpu ? `GPU: ${r.gpu}` : '',
    ].filter(Boolean).join('\n');
  }
}
