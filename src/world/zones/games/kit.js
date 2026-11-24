// What the booths of the pier share (Booths.js: the four of the pier head; Stalls.js: the six along the walk):
// the size of a booth in its own frame, a few colours, and small helpers to build and to aim — all of it in
// core.js, which owes nothing to the 3D library (the server replays the games with it). Here the page gives
// core.js the two things that do: vectors and geometries.
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';
import { host } from './core.js';

host.V = (x, y, z) => new THREE.Vector3(x, y, z);
/** A geometry built in one go: fill(builder, parts). */
host.geometry = (fill, material = 'paint') => { const parts = new Parts(); fill(parts.get(material), parts); return parts.get(material).build(); };

export * from './core.js';
