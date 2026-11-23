// What the booths of the pier share (Booths.js: the four of the pier head; Stalls.js: the six along the walk):
// the size of a booth in its own frame, a few colours, and small helpers to build and to aim.
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const lerp = (a, b, t) => a + (b - a) * t, clamp01 = (t) => Math.min(1, Math.max(0, t));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** A booth in its own frame: half its width, its back wall, the front of its counter (one plays from z = FRONT + 1). */
export const HALF = 3, BACK = -4, FRONT = 1.0;
export const WHITE = [0.97, 0.95, 0.9], WOOD = [0.9, 0.8, 0.66], GOLD = [1.5, 1.05, 0.25];

/** A geometry built in one go: fill(builder, parts). */
export const geometry = (fill, material = 'paint') => { const parts = new Parts(); fill(parts.get(material), parts); return parts.get(material).build(); };

/** A disc facing +Z, of radius 1, in rings of colour (from the rim to the middle). */
export function disc(b, rings, sides = 14) {
  rings.forEach(([r, c], k) => {
    const pts = [];
    for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2; pts.push(V(Math.cos(a) * r, Math.sin(a) * r, k * 0.012)); }
    b.tint(c[0], c[1], c[2], 1).poly(pts);
  });
}

/** Where the pointer's ray (`aim`: { o, d }, in the frame of the booth) meets the plane z = `z`: [x, y], or null. */
export const hitZ = (aim, z) => { if (Math.abs(aim.d.z) < 1e-5) return null; const u = (z - aim.o.z) / aim.d.z; return u > 0 ? [aim.o.x + aim.d.x * u, aim.o.y + aim.d.y * u] : null; };
/** …and the plane y = `y`: [x, z], or null. */
export const hitY = (aim, y) => { if (Math.abs(aim.d.y) < 1e-5) return null; const u = (y - aim.o.y) / aim.d.y; return u > 0 ? [aim.o.x + aim.d.x * u, aim.o.z + aim.d.z * u] : null; };
