// Boulders: at the foot of the crags that close the valley, along the torrent and on the rocky shores.
// Three shapes, instanced; placed once at load from the baked data (deterministic).
import * as THREE from 'three';
import { LAYER } from '../../render/Shadows.js';
import { CAVES, STAIRWAY } from '../layout/layout.js';

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// A lump: a subdivided icosahedron pushed around by a few random planes, a little flattened.
function boulder(seed) {
  const geo = new THREE.IcosahedronGeometry(1, 1); // 80 triangles: the facets are the look
  const pos = geo.attributes.position;
  const planes = [];
  for (let k = 0; k < 7; k++) {
    const u = hash(seed + k * 3.1) * 2 - 1, a = hash(seed + k * 7.7) * Math.PI * 2, r = Math.sqrt(1 - u * u);
    planes.push({ n: new THREE.Vector3(r * Math.cos(a), u * 0.7, r * Math.sin(a)).normalize(), d: 0.45 + hash(seed + k * 1.9) * 0.4 });
  }
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    for (const p of planes) { const over = v.dot(p.n) - p.d; if (over > 0) v.addScaledVector(p.n, -over * 0.85); } // facets
    v.y *= 0.72;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  // box-projected texture coordinates (metres) and a vertex shade: darker underneath
  const uv = new Float32Array(pos.count * 2), col = new Float32Array(pos.count * 4), nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
    if (ay >= ax && ay >= az) { uv[i * 2] = pos.getX(i); uv[i * 2 + 1] = pos.getZ(i); }
    else if (ax >= az) { uv[i * 2] = pos.getZ(i); uv[i * 2 + 1] = pos.getY(i); }
    else { uv[i * 2] = pos.getX(i); uv[i * 2 + 1] = pos.getY(i); }
    const k = 0.8 + 0.3 * hash(seed + i * 0.37);
    col.set([k, k * 0.985, k * 0.96, 0.55 + 0.45 * THREE.MathUtils.smoothstep(pos.getY(i), -0.5, 0.3)], i * 4);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  return geo;
}

export class Rocks {
  /** @param {import('../World.js').World} world */
  constructor(world) {
    this.group = new THREE.Group();
    this.group.name = 'rocks';
    this.colliders = [];
    const data = world.data, meta = data.meta;
    const items = [];
    // no boulder in front of a cave or at the foot of the stairway
    const clear = [...CAVES.map((c) => [c.nodes[0][0], c.nodes[0][1], 8]), [STAIRWAY.points[0][0], STAIRWAY.points[0][1], 6]];
    const put = (x, z, size, sink = 0.3) => {
      if (!data.inside(x, z, 4)) return;
      for (const [cx, cz, r] of clear) if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return;
      const ground = data.heightAt(x, z), water = data.waterAt(x, z);
      if (water > -500 && water - ground > 1.3) return; // too deep to show
      items.push({ x, y: ground - size * sink, z, size });
    };
    // 1. the foot of the crags, all around the playable area (land side only)
    const b = meta.bounds;
    let seed = 1;
    for (let i = 0; i < b.length; i++) {
      const p = b[i], q = b[(i + 1) % b.length];
      if (data.heightAt(p[0], p[1]) < 1.0) continue; // at sea
      let nx = q[1] - p[1], nz = -(q[0] - p[0]);
      const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l; // outward (the outline runs clockwise on the map)
      // fallen blocks at the foot of the face…
      const n = Math.floor(hash(seed += 1.37) * 3.4);
      for (let k = 0; k < n; k++) {
        const out = -4 + hash(seed += 2.11) * 6, along = (hash(seed += 0.73) - 0.5) * 6;
        const big = hash(seed += 1.91);
        put(p[0] + nx * out - nz * along, p[1] + nz * out + nx * along, 0.5 + big * big * 2.2);
      }
      // …and outcrops standing out of it, which break its line
      if (hash(seed += 5.3) < 0.55) {
        const out = 1.5 + hash(seed += 0.41) * 7;
        put(p[0] + nx * out, p[1] + nz * out, 2.2 + hash(seed += 0.87) * 3.2, 0.5);
      }
    }
    // 2. the torrent and its plunge pool
    const torrent = meta.streams.find((s) => s.id === 'torrent');
    if (torrent) {
      for (let i = 0; i < torrent.samples.length; i += 2) {
        const s = torrent.samples[i];
        if (s[0] > -238) break;
        for (const side of [-1, 1]) {
          if (hash(seed += 3.3) < 0.45) continue;
          const a = torrent.samples[Math.max(0, i - 1)], c = torrent.samples[Math.min(torrent.samples.length - 1, i + 1)];
          let nx = c[1] - a[1], nz = -(c[0] - a[0]);
          const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
          const off = s[3] / 2 + 0.2 + hash(seed += 1.1) * 1.6;
          put(s[0] + nx * off * side, s[1] + nz * off * side, 0.35 + hash(seed += 0.9) * 0.9, 0.35);
        }
      }
    }
    // 3. rocky shores of the cove (where the coast is not sandy)
    for (const c of meta.coast) {
      if (c[2] > 0.45 || Math.abs(c[1]) > 330) continue;
      const n = 1 + Math.floor(hash(seed += 4.1) * 3);
      for (let k = 0; k < n; k++) put(c[0] + (hash(seed += 1.3) - 0.5) * 12, c[1] + (hash(seed += 2.7) - 0.5) * 9, 0.6 + hash(seed += 0.61) ** 2 * 2.8, 0.42);
    }

    // One instanced mesh per 224 m square of the map: whole squares are culled when out of view. A single
    // shape is enough: every boulder is turned and stretched differently.
    const shapes = [boulder(11)];
    const mat = world.materials.rock;
    const m = new THREE.Matrix4(), qt = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    const tint = new THREE.Color();
    const buckets = new Map();
    items.forEach((it, i) => {
      const key = `${i % shapes.length}:${Math.floor((it.x + 400) / 224)}:${Math.floor((it.z + 300) / 224)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(it);
    });
    for (const [key, mine] of buckets) {
      const mesh = new THREE.InstancedMesh(shapes[+key.split(':')[0]], mat, mine.length);
      mine.forEach((it, i) => {
        const r = hash(it.x * 3.1 + it.z * 1.7);
        e.set((r - 0.5) * 0.7, r * 43, (hash(r * 91) - 0.5) * 0.7);
        qt.setFromEuler(e);
        m.compose(ps.set(it.x, it.y, it.z), qt, sc.set(it.size * (0.7 + 0.7 * hash(r * 7)), it.size * (0.6 + 0.6 * hash(r * 13)), it.size * (0.8 + 0.4 * hash(r * 17))));
        mesh.setMatrixAt(i, m);
        const g = 0.82 + 0.3 * hash(r * 29);
        mesh.setColorAt(i, tint.setRGB(g, g * 0.99, g * 0.96));
        if (it.size > 0.9) this.colliders.push([it.x, it.z, it.size * 0.7]);
      });
      mesh.name = `rocks:${key}`;
      mesh.matrixAutoUpdate = false;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.layers.enable(LAYER.STATIC_CASTER);
      this.group.add(mesh);
    }
    this.count = items.length;
  }
}
