// The golden dog of the cove: a sitting Australian shepherd fifteen metres tall. Its shape is sculpted and
// written to public/assets/world/statue.bin by tools/bake-statue.mjs (see there for the layout of the file);
// here it is unpacked, scaled, and given its gold.
import * as THREE from 'three';
import { surfaceMaterial } from '../../../render/SurfaceMaterial.js';

/** The mesh of the statue, `height` m tall, sitting on y = 0 at the origin and looking towards +z. */
export function statueGeometry(buffer, height) {
  const head = new Uint32Array(buffer, 0, 4), box = new Float32Array(buffer, 16, 6);
  if (head[0] !== 0x31415453) throw new Error('statue.bin: not a statue');
  const V = head[1], I = head[2];
  const q = new Uint16Array(buffer, 40, V * 3), n8 = new Int8Array(buffer, 40 + V * 6, V * 4), idx = new Uint16Array(buffer, 40 + V * 10, I);
  // (modelled one unit tall: the top of its box is the tips of its ears)
  const k = height / (box[1] + box[4]);
  const pos = new Float32Array(V * 3), nrm = new Float32Array(V * 3), col = new Uint8Array(V * 4);
  for (let v = 0; v < V; v++) {
    for (let a = 0; a < 3; a++) {
      pos[v * 3 + a] = (box[a] + (q[v * 3 + a] / 65535) * box[3 + a]) * k;
      nrm[v * 3 + a] = n8[v * 4 + a] / 127;
    }
    // (the vertex alpha is the light that reaches the hollows: between the legs, under the chin, behind the ears)
    col[v * 4] = col[v * 4 + 1] = col[v * 4 + 2] = 255;
    col[v * 4 + 3] = Math.round((n8[v * 4 + 3] / 127) * 255);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(V * 2), 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 4, true));
  g.setIndex(new THREE.BufferAttribute(idx.slice(), 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** Polished gold. */
export const goldMaterial = () => surfaceMaterial({ name: 'gold', color: [1.0, 0.56, 0.1], rough: 0.28, spec: 1, metal: true });
