// The statues of the golden cove: an Australian shepherd fifteen metres tall, sitting, and its companions — a
// cat at its right, a snake at its left, a bird on its head. Their shape is sculpted and written to
// public/assets/world/statue.bin by tools/bake-statue.mjs (see there for the layout of the file); here it is
// unpacked, scaled, and given its gold — three tones of it: the gold itself, a paler one for the ruff, the
// blaze and the paws, a deeper and redder one for the patches of the coat.
import * as THREE from 'three';
import { surfaceMaterial } from '../../../render/SurfaceMaterial.js';

// (the colour of the material is the palest gold: the tones of the vertices only darken it)
const PALE = [1.0, 0.83, 0.47], GOLD = [1.0, 0.56, 0.1], DEEP = [0.86, 0.33, 0.055], DARK = [0.34, 0.15, 0.04];
/** The gold of a tone: 0 the gold itself, 1 pale, -1 deep and red, beyond that the dark of a nose or an eye. */
const goldOf = (t, out, o) => {
  const [a, b, u] = t >= 0 ? [GOLD, PALE, Math.min(1, t)] : t >= -1 ? [GOLD, DEEP, -t] : [DEEP, DARK, Math.min(1, (-t - 1) * 2)];
  for (let c = 0; c < 3; c++) out[o + c] = Math.round(Math.min(1, (a[c] + (b[c] - a[c]) * u) / PALE[c]) * 255);
};

/**
 * The mesh of the statues, sitting on y = 0 at the origin and looking towards +z: one unit of the file is
 * `height` metres (the top of the dog's head is a little under it, the bird on it a little over).
 */
export function statueGeometry(buffer, height) {
  const head = new Uint32Array(buffer, 0, 4), box = new Float32Array(buffer, 16, 6);
  // (a file of the sculpture as it was before — the dog alone, of one gold, modelled one unit tall to the tips of
  // its ears — is still read: a browser may hold the old file for a moment after an update)
  const old = head[0] === 0x31415453;
  if (!old && head[0] !== 0x32415453) throw new Error('statue.bin: not a statue');
  const V = head[1], I = head[2], k = old ? height / (box[1] + box[4]) : height;
  const q = new Uint16Array(buffer, 40, V * 3), n8 = new Int8Array(buffer, 40 + V * 6, V * 4), tone = old ? new Uint8Array(V).fill(128) : new Uint8Array(buffer, 40 + V * 10, V), idx = new Uint16Array(buffer, old ? 40 + V * 10 : 40 + V * 11 + (V & 1), I);
  const pos = new Float32Array(V * 3), nrm = new Float32Array(V * 3), col = new Uint8Array(V * 4);
  for (let v = 0; v < V; v++) {
    for (let a = 0; a < 3; a++) {
      pos[v * 3 + a] = (box[a] + (q[v * 3 + a] / 65535) * box[3 + a]) * k;
      nrm[v * 3 + a] = n8[v * 4 + a] / 127;
    }
    goldOf((tone[v] - 128) / 84, col, v * 4);
    // (the vertex alpha is the light that reaches the hollows: between the legs, under the chin, behind the ears)
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

/** Polished gold (its palest tone: see above). */
export const goldMaterial = () => surfaceMaterial({ name: 'gold', color: PALE, rough: 0.28, spec: 1, metal: true });
