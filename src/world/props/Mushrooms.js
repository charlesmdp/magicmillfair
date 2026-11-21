// Toadstools at the foot of the trees: red caps with white spots. They can be picked and eaten — a bad idea.
// One instanced mesh per 224 m square of the map; a picked one is gone for a while, then grows back.
import * as THREE from 'three';
import { MeshBuilder } from './MeshBuilder.js';
import { LAYER } from '../../render/Shadows.js';

const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const REGROW = 150; // seconds

function toadstool() {
  const b = new MeshBuilder();
  b.tint(0.93, 0.9, 0.8, 1).lathe([[0.06, 0], [0.042, 0.1], [0.036, 0.21]], 6); // the stem
  b.tint(0.9, 0.86, 0.74, 1).lathe([[0.036, 0.2], [0.17, 0.185]], 7); // the gills (seen from below)
  b.tint(0.8, 0.07, 0.05, 1).lathe([[0.17, 0.185], [0.16, 0.25], [0.105, 0.315], [0.0, 0.345]], 7); // the cap
  b.tint(0.98, 0.97, 0.92, 1);
  for (const [a, r, y, s] of [[0.3, 0.115, 0.303, 0.034], [2.2, 0.12, 0.297, 0.028], [4.3, 0.11, 0.308, 0.032], [1.2, 0.04, 0.338, 0.03], [5.4, 0.15, 0.262, 0.024]]) {
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    b.quad(V(x - s, y, z + s), V(x + s, y, z + s), V(x + s, y, z - s), V(x - s, y, z - s));
  }
  return b.build();
}

export class Mushrooms {
  /** @param {import('../World.js').World} world  @param {[number, number, number][]} trees trunks: [x, z, radius] */
  constructor(world, trees) {
    const data = world.data, b = data.meta.bounds;
    const inside = (x, z) => { let inn = false; for (let i = 0, j = b.length - 1; i < b.length; j = i++) if ((b[j][1] > z) !== (b[i][1] > z) && x < ((b[i][0] - b[j][0]) * (z - b[j][1])) / (b[i][1] - b[j][1]) + b[j][0]) inn = !inn; return inn; };
    this.group = new THREE.Group();
    this.group.name = 'mushrooms';
    this.items = [];
    // a clump at the foot of one tree in so many, in the woods, away from the water and from each other
    const clumps = [];
    trees.forEach(([tx, tz, tr], i) => {
      if (hash(i * 3.7 + 1) > 0.3 || tr > 0.9 || !inside(tx, tz) || data.canopyShadeAt(tx, tz) < 0.3) return;
      if (data.depthAt(tx, tz) > -0.3 || data.heightAt(tx, tz) < 3.5) return;
      if (clumps.some((c) => (c[0] - tx) ** 2 + (c[1] - tz) ** 2 < 17 * 17)) return;
      clumps.push([tx, tz]);
      const n = 1 + Math.floor(hash(i * 1.3) * 3);
      for (let k = 0; k < n; k++) {
        const a = hash(i * 7.1 + k * 3.3) * Math.PI * 2, d = tr + 0.4 + hash(i * 2.9 + k) * 0.55;
        const x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d, y = data.heightAt(x, z);
        if (!inside(x, z) || Math.abs(data.heightAt(x + 0.5, z) - y) > 0.4 || Math.abs(data.heightAt(x, z + 0.5) - y) > 0.4) continue;
        this.items.push({ x, y: y - 0.02, z, size: 0.75 + hash(i + k * 5.5) * 0.85, turn: a * 3, gone: 0, mesh: null, slot: 0 });
      }
    });
    const geo = toadstool(), mat = world.materials.paint, m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const buckets = new Map();
    for (const it of this.items) {
      const key = `${Math.floor((it.x + 400) / 224)}:${Math.floor((it.z + 300) / 224)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(it);
    }
    this._place = (it, scale) => {
      e.set((hash(it.x) - 0.5) * 0.3, it.turn, (hash(it.z) - 0.5) * 0.3);
      it.mesh.setMatrixAt(it.slot, m.compose(V(it.x, it.y, it.z), q.setFromEuler(e), V(scale, scale, scale)));
      it.mesh.instanceMatrix.needsUpdate = true;
    };
    for (const [key, mine] of buckets) {
      const mesh = new THREE.InstancedMesh(geo, mat, mine.length);
      mesh.name = `mushrooms:${key}`;
      mine.forEach((it, i) => { it.mesh = mesh; it.slot = i; this._place(it, it.size); });
      mesh.matrixAutoUpdate = false;
      mesh.computeBoundingSphere();
      mesh.layers.enable(LAYER.STATIC_CASTER);
      this.group.add(mesh);
    }
    this.pending = 0; // how many are growing back
  }

  /** The toadstool within reach of (x, z) at height y, or null. */
  near(x, y, z, reach = 1.25) {
    let best = null, bestD = reach * reach;
    for (const it of this.items) {
      if (it.gone > 0) continue;
      const d = (it.x - x) ** 2 + (it.z - z) ** 2;
      if (d < bestD && Math.abs(it.y - y) < 1.2) { bestD = d; best = it; }
    }
    return best;
  }

  /** Picked: gone, for a while. */
  pick(it) {
    if (it.gone > 0) return;
    it.gone = REGROW;
    this.pending++;
    this._place(it, 0);
  }

  update(dt) {
    if (!this.pending) return;
    for (const it of this.items) {
      if (it.gone <= 0) continue;
      it.gone -= dt;
      if (it.gone <= 0) { this.pending--; this._place(it, it.size); }
    }
  }
}
