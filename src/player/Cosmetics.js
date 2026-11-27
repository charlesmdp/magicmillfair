// Things an avatar can wear, hold or ride: hats, a bouquet, a jetpack, a quad.
// Everything is modelled by hand in metres, in one material (colours in the vertices): one draw call each.
//
// What can be sold later goes through `owns(id)`: today it says yes to everything. Plug purchases in there
// (and check them on a server before trusting them: anything decided in the browser can be faked).
import * as THREE from 'three';
import { MeshBuilder } from '../world/props/MeshBuilder.js';
import { surfaceMaterial } from '../render/SurfaceMaterial.js';
import { LAYER } from '../render/Shadows.js';

/**
 * Hats, in the order of their number on the network (5 bits: at most 32 entries, 'none' included; never reorder,
 * append — and add the same name to HAT_IDS in server/wardrobe.js and its card to server/items.js).
 */
export const HATS = [
  { id: 'none', name: 'No hat' },
  { id: 'cap', name: 'Cap', premium: true },
  { id: 'straw', name: 'Straw hat', premium: true },
  { id: 'beanie', name: 'Beanie', premium: true },
  { id: 'tophat', name: 'Top hat', premium: true },
  { id: 'cowboy', name: 'Cowboy hat', premium: true },
  { id: 'crown', name: 'Crown', premium: true },
  { id: 'wizard', name: 'Wizard hat', premium: true },
  { id: 'pirate', name: 'Pirate hat', premium: true },
  { id: 'viking', name: 'Viking helmet', premium: true },
  { id: 'chef', name: "Chef's hat", premium: true },
  { id: 'propeller', name: 'Propeller cap', premium: true },
  { id: 'party', name: 'Party hat', premium: true },
  { id: 'halo', name: 'Halo', premium: true },
  { id: 'jester', name: "Jester's hat", premium: true },
  { id: 'antlers', name: 'Antlers', premium: true },
  { id: 'sombrero', name: 'Sombrero', premium: true },
  { id: 'mortarboard', name: 'Graduation cap', premium: true },
  { id: 'cone', name: 'Traffic cone', premium: true },
];
/** Other things meant to be sold one day. */
export const EXTRAS = { jetpack: { name: 'Jetpack', premium: true } };

/** Does this visitor have that item? Everything is free for now: the one place to change when it is not. */
export function owns(id) { return id !== undefined; }

const V = (x, y, z) => new THREE.Vector3(x, y, z);
let material = null;
export function cosmeticMaterial() {
  if (!material) material = surfaceMaterial({ rough: 0.62, spec: 0.22, name: 'cosmetic', side: THREE.DoubleSide });
  return material;
}
let glow = null;
function glowMaterial() {
  if (!glow) glow = surfaceMaterial({ rough: 0.4, spec: 0.2, emissive: [2.4, 2.0, 1.4], name: 'cosmetic-glow', side: THREE.DoubleSide });
  return glow;
}
function mesh(builder, mat = cosmeticMaterial()) {
  const m = new THREE.Mesh(builder.build(), mat);
  m.layers.enable(LAYER.DYNAMIC_CASTER);
  m.frustumCulled = false;
  return m;
}

// ---------------------------------------------------------------------------
// Wings: cardboard feathers on a harness, for the flying theatre. A group with its two wings in
// userData.sides ([left, right]): each turns about the spine (its own y) to beat.

let wingGeometry = null;
export function wings() {
  if (!wingGeometry) {
    const b = new MeshBuilder();
    // (the right wing: five feathers fanned out from the shoulder, the longest on top; cream, tipped with gold)
    for (let i = 0; i < 5; i++) {
      const a = 0.62 - i * 0.3, len = 0.98 - i * 0.12, w = 0.2, c = Math.cos(a), s = Math.sin(a), z = -0.004 * i;
      const root = V(0.06, 0, z), mid = V(0.06 + c * len * 0.55, s * len * 0.55, z), tip = V(0.06 + c * len, s * len, z), nx = -s * w * 0.5, ny = c * w * 0.5;
      b.tint(1.25, 1.18, 1.02, 1).quad(V(root.x - nx * 0.5, root.y - ny * 0.5, z), V(mid.x - nx, mid.y - ny, z), V(mid.x + nx, mid.y + ny, z), V(root.x + nx * 0.5, root.y + ny * 0.5, z));
      b.tint(1.5, 1.05, 0.3, 1).tri(V(mid.x - nx, mid.y - ny, z), tip, V(mid.x + nx, mid.y + ny, z));
    }
    b.tint(0.5, 0.36, 0.24, 1).box(-0.02, -0.16, -0.03, 0.12, 0.2, 0.01); // the strap it hangs from
    wingGeometry = b.build();
  }
  const g = new THREE.Group(), right = mesh({ build: () => wingGeometry }), left = mesh({ build: () => wingGeometry });
  left.scale.x = -1;
  g.add(left, right);
  g.userData.sides = [left, right];
  return g;
}

// ---------------------------------------------------------------------------
// Hats. Modelled for a head of radius 1 whose top is at the origin (y up, the face towards +Z): the avatar
// scales them to its own head.

const hatCache = new Map();
export function hatGeometry(id) {
  if (hatCache.has(id)) return hatCache.get(id);
  const b = new MeshBuilder();
  const S = 16;
  if (id === 'cap') {
    b.tint(0.75, 0.1, 0.1, 1).lathe([[1.0, -0.22], [1.0, 0.0], [0.9, 0.3], [0.6, 0.52], [0.2, 0.6], [0.0, 0.61]], S);
    b.tint(0.95, 0.95, 0.92, 1).cylinder(0, 0.58, 0, 0.09, 0.07, 0.07, 8); // the button on top
    // the visor, curved round the front
    b.tint(0.6, 0.07, 0.07, 1);
    for (let i = 0; i < 8; i++) {
      const a0 = -0.9 + (i / 8) * 1.8, a1 = -0.9 + ((i + 1) / 8) * 1.8, r0 = 0.98, r1 = 1.75;
      const p = (a, r, y) => V(Math.sin(a) * r, y, Math.cos(a) * r * (r > 1 ? 1.05 : 1));
      b.quad(p(a0, r0, -0.14), p(a1, r0, -0.14), p(a1, r1, -0.2), p(a0, r1, -0.2));
    }
  } else if (id === 'straw') {
    b.tint(0.9, 0.76, 0.4, 1).lathe([[1.9, -0.06], [1.85, 0.0], [1.02, 0.06], [0.98, 0.42], [0.86, 0.56], [0.3, 0.62], [0.0, 0.62]], S);
    b.tint(0.82, 0.68, 0.34, 1).lathe([[1.9, -0.06], [1.0, 0.0]], S); // underside of the brim
    b.tint(0.2, 0.5, 0.3, 1).lathe([[1.0, 0.08], [1.01, 0.26]], S); // ribbon
  } else if (id === 'beanie') {
    b.tint(0.14, 0.36, 0.62, 1).lathe([[1.06, -0.3], [1.07, -0.1], [1.0, 0.25], [0.7, 0.55], [0.3, 0.7], [0.0, 0.72]], S);
    b.tint(0.9, 0.9, 0.86, 1).lathe([[1.1, -0.32], [1.14, -0.24], [1.14, -0.08], [1.08, -0.04]], S); // turned-up rim
    b.place(0, 0.84, 0).lathe([[0.0, -0.22], [0.2, -0.12], [0.24, 0.0], [0.2, 0.12], [0.0, 0.22]], 8).pop(); // pompom
  } else if (id === 'tophat') {
    b.tint(0.05, 0.05, 0.06, 1).lathe([[1.5, -0.03], [1.5, 0.03], [0.86, 0.06], [0.84, 1.25], [0.9, 1.3], [0.0, 1.3]], S);
    b.tint(0.04, 0.04, 0.05, 1).lathe([[1.5, -0.03], [0.86, 0.0]], S);
    b.tint(0.6, 0.08, 0.1, 1).lathe([[0.875, 0.08], [0.875, 0.34]], S); // band
  } else if (id === 'cowboy') {
    // the brim curls up at the sides
    b.tint(0.45, 0.28, 0.14, 1);
    const R = 12, A = 20;
    const brim = (i, j) => {
      const a = (j / A) * Math.PI * 2, r = 0.95 + (i / R) * 1.0;
      const curl = Math.abs(Math.sin(a)) ** 2 * ((i / R) ** 2) * 0.55; // up at the sides (±X)
      return V(Math.sin(a) * r * 1.0, 0.02 + curl - (i / R) * 0.05, Math.cos(a) * r * 1.12);
    };
    for (let i = 0; i < R; i++) for (let j = 0; j < A; j++) b.quad(brim(i, j), brim(i, j + 1), brim(i + 1, j + 1), brim(i + 1, j));
    b.tint(0.5, 0.31, 0.16, 1).lathe([[0.97, 0.0], [0.88, 0.5], [0.72, 0.74], [0.4, 0.66], [0.0, 0.58]], S); // pinched crown
    b.tint(0.12, 0.08, 0.05, 1).lathe([[0.975, 0.03], [0.94, 0.2]], S);
  } else if (id === 'crown') {
    b.tint(1.0, 0.72, 0.12, 1).lathe([[0.9, -0.05], [0.92, 0.3]], S);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), w = 0.32;
      const p0 = V(s * 0.92 - c * w, 0.3, c * 0.92 + s * w), p1 = V(s * 0.92 + c * w, 0.3, c * 0.92 - s * w), top = V(s * 0.98, 0.78, c * 0.98);
      b.tint(1.0, 0.72, 0.12, 1).tri(p0, p1, top);
      b.tint(i % 2 ? 0.8 : 0.1, 0.1, i % 2 ? 0.15 : 0.7, 1).place(s * 0.98, 0.8, c * 0.98).lathe([[0.0, -0.09], [0.09, 0.0], [0.0, 0.09]], 6).pop(); // jewels
    }
    b.tint(0.5, 0.05, 0.12, 1).lathe([[0.9, 0.24], [0.6, 0.42], [0.0, 0.46]], S); // velvet inside
  } else if (id === 'wizard') {
    b.tint(0.2, 0.1, 0.5, 1).lathe([[1.7, -0.04], [1.65, 0.02], [0.95, 0.06], [0.8, 0.5], [0.5, 1.2], [0.24, 1.75]], S);
    b.tint(0.17, 0.08, 0.42, 1).lathe([[1.7, -0.04], [0.95, 0.0]], S);
    // the tip, bent over
    b.tint(0.2, 0.1, 0.5, 1).rod(V(0, 1.72, 0), V(0.3, 2.1, -0.18), 0.24, 8, { r1: 0.02, caps: false });
    b.tint(1.0, 0.8, 0.2, 1).lathe([[0.97, 0.08], [0.92, 0.26]], S); // band
    for (let i = 0; i < 5; i++) { const a = i * 1.9 + 0.4, y = 0.55 + i * 0.22, r = 0.82 - i * 0.12; b.place(Math.sin(a) * r, y, Math.cos(a) * r).lathe([[0.0, -0.07], [0.07, 0.0], [0.0, 0.07]], 4).pop(); } // stars
  } else if (id === 'pirate') {
    // a tricorn: the brim turned up on three sides, a point at the front and two behind; a skull on the crown
    b.tint(0.06, 0.06, 0.07, 1).lathe([[0.98, -0.02], [0.94, 0.36], [0.68, 0.6], [0.3, 0.68], [0.0, 0.69]], S);
    const RR = 6, A = 24;
    const brim = (i, j) => {
      const a = (j / A) * Math.PI * 2, corner = 0.5 + 0.5 * Math.cos(3 * a), t = i / RR; // corner: 1 at the three points, 0 where it is turned up
      const r = 0.95 + t * (0.32 + 0.8 * corner);
      return V(Math.sin(a) * r, 0.0 + (1 - corner) * t ** 1.3 * 0.62 + corner * t * 0.08, Math.cos(a) * r);
    };
    for (let i = 0; i < RR; i++) {
      b.tint(i === RR - 1 ? 0.95 : 0.07, i === RR - 1 ? 0.8 : 0.07, i === RR - 1 ? 0.3 : 0.08, 1); // (a gold braid along the edge)
      for (let j = 0; j < A; j++) b.quad(brim(i, j), brim(i, j + 1), brim(i + 1, j + 1), brim(i + 1, j));
    }
    // the skull and its two bones
    b.tint(0.95, 0.95, 0.9, 1).place(0, 0.34, 0.9).lathe([[0.0, -0.15], [0.12, -0.11], [0.17, 0.0], [0.13, 0.12], [0.0, 0.16]], 8).pop();
    for (const s of [-1, 1]) b.rod(V(-0.24 * s, 0.2, 0.9), V(0.24 * s, 0.48, 0.9), 0.035, 5);
    b.tint(0.03, 0.03, 0.03, 1);
    for (const s of [-1, 1]) b.place(0.065 * s, 0.37, 1.06).lathe([[0.0, -0.04], [0.04, 0.0], [0.0, 0.04]], 5).pop();
  } else if (id === 'viking') {
    b.tint(0.5, 0.52, 0.56, 1).lathe([[1.03, -0.26], [1.05, 0.0], [0.98, 0.3], [0.72, 0.6], [0.3, 0.74], [0.0, 0.76]], S);
    b.tint(0.85, 0.62, 0.2, 1).lathe([[1.07, -0.28], [1.09, -0.19], [1.09, -0.08], [1.06, -0.04]], S); // a brass band round the rim
    b.lathe([[0.0, 0.74], [0.1, 0.78], [0.0, 0.86]], 6); // and a stud on top
    b.tint(0.42, 0.44, 0.48, 1).box(-0.1, -0.55, 0.98, 0.1, 0.1, 1.08); // the nose guard
    // two horns: out, then up, tapering
    b.tint(1.25, 1.18, 1.0, 1);
    for (const s of [-1, 1]) {
      const pts = [[1.0, 0.22, 0], [1.36, 0.36, 0], [1.6, 0.66, 0.02], [1.63, 1.0, 0.06], [1.5, 1.32, 0.1]], rad = [0.22, 0.19, 0.15, 0.1, 0.02];
      for (let k = 0; k + 1 < pts.length; k++) b.rod(V(pts[k][0] * s, pts[k][1], pts[k][2]), V(pts[k + 1][0] * s, pts[k + 1][1], pts[k + 1][2]), rad[k], 7, { r1: rad[k + 1], caps: k === 0 });
      b.tint(0.85, 0.62, 0.2, 1).place(1.0 * s, 0.22, 0).lathe([[0.0, -0.05], [0.27, -0.03], [0.27, 0.06], [0.0, 0.08]], 8).pop().tint(1.25, 1.18, 1.0, 1); // (its socket)
    }
  } else if (id === 'chef') {
    b.tint(1.3, 1.3, 1.28, 1).lathe([[1.0, -0.12], [1.01, 0.0], [1.0, 0.5]], S); // the band
    // the puffed top, in twelve pleats
    const A = 24, prof = [[1.0, 0.5], [1.24, 0.72], [1.38, 1.02], [1.34, 1.3], [1.1, 1.5], [0.6, 1.62], [0.0, 1.66]];
    const at = (k, j) => { const [r, y] = prof[k], a = (j / A) * Math.PI * 2, f = 1 + (k > 0 && k < prof.length - 1 ? 0.045 * Math.cos(a * 12) : 0); return V(Math.sin(a) * r * f, y, Math.cos(a) * r * f); };
    for (let k = 0; k + 1 < prof.length; k++) for (let j = 0; j < A; j++) { const g = j % 2 ? 1.3 : 1.18; b.tint(g, g, g * 0.99, 1).quad(at(k, j), at(k, j + 1), at(k + 1, j + 1), at(k + 1, j)); }
  } else if (id === 'propeller') {
    // a cap in four colours, a short visor, a stalk on top (the propeller itself is another mesh: it turns)
    const A = 16, prof = [[1.0, -0.2], [1.0, 0.02], [0.9, 0.32], [0.6, 0.52], [0.22, 0.6], [0.0, 0.61]], tones = [[0.85, 0.12, 0.1], [1.1, 0.85, 0.1], [0.1, 0.35, 0.8], [0.15, 0.6, 0.25]];
    const at = (k, j) => { const [r, y] = prof[k], a = (j / A) * Math.PI * 2; return V(Math.sin(a) * r, y, Math.cos(a) * r); };
    for (let k = 0; k + 1 < prof.length; k++) for (let j = 0; j < A; j++) { const t = tones[(j >> 2) % 4]; b.tint(t[0], t[1], t[2], 1).quad(at(k, j), at(k, j + 1), at(k + 1, j + 1), at(k + 1, j)); }
    b.tint(0.85, 0.12, 0.1, 1);
    for (let i = 0; i < 6; i++) {
      const a0 = -0.7 + (i / 6) * 1.4, a1 = -0.7 + ((i + 1) / 6) * 1.4, p = (a, r, y) => V(Math.sin(a) * r, y, Math.cos(a) * r);
      b.quad(p(a0, 0.98, -0.12), p(a1, 0.98, -0.12), p(a1, 1.5, -0.17), p(a0, 1.5, -0.17));
    }
    b.tint(1.1, 0.85, 0.1, 1).cylinder(0, 0.58, 0, 0.05, 0.05, 0.26, 6);
    b.tint(0.85, 0.12, 0.1, 1).place(0, 0.86, 0).lathe([[0.0, -0.07], [0.08, 0.0], [0.0, 0.07]], 6).pop();
  } else if (id === 'propeller-rotor') {
    // (about its own axis, the origin at the top of the stalk)
    for (const [s, t] of [[1, [1.1, 0.85, 0.1]], [-1, [0.1, 0.35, 0.8]]]) {
      b.tint(t[0], t[1], t[2], 1);
      b.quad(V(0.06 * s, 0, -0.07), V(0.62 * s, 0.03, -0.12), V(0.62 * s, -0.03, 0.1), V(0.06 * s, 0, 0.07));
    }
  } else if (id === 'party') {
    // a paper cone in rings of two colours, a ruff round its foot, a pompom on its tip
    const A = 14, N = 6, r0 = 0.66, h = 1.55;
    const at = (k, j) => { const t = k / N, a = (j / A) * Math.PI * 2 + t * 1.2; return V(Math.sin(a) * r0 * (1 - t), t * h, Math.cos(a) * r0 * (1 - t)); };
    for (let k = 0; k < N; k++) for (let j = 0; j < A; j++) { const t = (k + (j >> 1)) % 2 ? [1.25, 0.25, 0.55] : [0.15, 0.75, 0.95]; b.tint(t[0], t[1], t[2], 1).quad(at(k, j), at(k, j + 1), at(k + 1, j + 1), at(k + 1, j)); }
    b.tint(1.3, 1.3, 1.25, 1).lathe([[0.62, -0.03], [0.78, 0.0], [0.78, 0.08], [0.62, 0.12]], A);
    b.tint(1.4, 1.1, 0.15, 1).place(0, h + 0.06, 0).lathe([[0.0, -0.17], [0.15, -0.09], [0.19, 0.0], [0.15, 0.09], [0.0, 0.17]], 8).pop();
  }
  const g = b.empty ? null : b.build();
  hatCache.set(id, g);
  return g;
}

/** A hat mesh sized for a head of radius `r` (metres); null for 'none'. */
export function makeHat(id, r) {
  const g = hatGeometry(id);
  if (!g) return null;
  const m = new THREE.Mesh(g, cosmeticMaterial());
  m.scale.setScalar(r);
  m.layers.enable(LAYER.DYNAMIC_CASTER);
  m.frustumCulled = false;
  if (id === 'propeller') {
    // (its propeller turns: a mesh of its own, found in userData.rotor)
    const rotor = new THREE.Mesh(hatGeometry('propeller-rotor'), cosmeticMaterial());
    rotor.position.y = 0.9;
    rotor.layers.enable(LAYER.DYNAMIC_CASTER);
    rotor.frustumCulled = false;
    m.add(rotor);
    m.userData.rotor = rotor;
  }
  return m;
}

// ---------------------------------------------------------------------------
// A disguise (a secret word of the chat): the avatar is a bush, or a small tree, and nothing else. Origin on
// the ground, in metres.

const disguises = new Map();
export function makeDisguise(kind) {
  if (!disguises.has(kind)) {
    const b = new MeshBuilder();
    const blob = (x, y, z, r, tone, squash = 0.82) => b.tint(tone[0], tone[1], tone[2], 1).place(x, y, z, x * 3.1 + z * 1.7).lathe([[0.0, -r * squash], [r * 0.72, -r * squash * 0.62], [r, 0.0], [r * 0.74, r * squash * 0.62], [0.0, r * squash]], 7).pop();
    const LEAF = [[0.2, 0.42, 0.14], [0.26, 0.5, 0.16], [0.16, 0.36, 0.13], [0.3, 0.54, 0.2]];
    if (kind === 'tree') {
      b.tint(0.36, 0.25, 0.16, 1).cylinder(0, 0, 0, 0.19, 0.12, 1.75, 7);
      b.rod(V(0, 1.2, 0), V(0.42, 1.75, 0.1), 0.06, 5); b.rod(V(0, 1.35, 0), V(-0.36, 1.85, -0.16), 0.055, 5);
      blob(0, 2.25, 0, 0.95, LEAF[0]); blob(0.55, 1.95, 0.2, 0.62, LEAF[1]); blob(-0.5, 2.05, -0.25, 0.66, LEAF[2]);
      blob(0.1, 2.9, -0.1, 0.62, LEAF[3]); blob(-0.2, 2.5, 0.5, 0.5, LEAF[1]); blob(0.3, 2.45, -0.55, 0.52, LEAF[2]);
    } else {
      blob(0, 0.42, 0, 0.62, LEAF[0]); blob(0.42, 0.32, 0.18, 0.46, LEAF[1]); blob(-0.4, 0.3, -0.12, 0.48, LEAF[2]);
      blob(0.05, 0.78, -0.08, 0.42, LEAF[3]); blob(-0.12, 0.27, 0.44, 0.4, LEAF[1]); blob(0.2, 0.26, -0.46, 0.4, LEAF[2]);
      // (a few flowers on it: a bush that walks is still a bush)
      for (const [x, y, z] of [[0.3, 0.72, 0.3], [-0.42, 0.58, 0.2], [0.05, 1.06, 0.12], [-0.1, 0.62, -0.5]]) b.tint(1.4, 0.5, 0.7, 1).place(x, y, z).lathe([[0.0, -0.05], [0.07, 0.0], [0.0, 0.05]], 5).pop();
    }
    disguises.set(kind, b.build());
  }
  return mesh({ build: () => disguises.get(kind) });
}

// ---------------------------------------------------------------------------
// A bouquet: stems gathered in a paper cone, blossoms above. Origin in the fist, flowers towards +Y.

export const FLOWER_COLORS = {
  poppy: [0.85, 0.08, 0.06], cornflower: [0.2, 0.32, 0.85], buttercup: [0.98, 0.82, 0.1], daisy: [0.97, 0.97, 0.92], iris: [0.95, 0.8, 0.15],
  foxglove: [0.82, 0.3, 0.6], lavender: [0.52, 0.4, 0.8], agapanthus: [0.35, 0.45, 0.9], heather: [0.75, 0.35, 0.6], lily: [0.98, 0.75, 0.82],
};
const MIXED = ['poppy', 'cornflower', 'buttercup', 'daisy', 'foxglove', 'lavender', 'poppy'];
export function makeBouquet(kinds = MIXED) {
  const b = new MeshBuilder();
  b.tint(0.93, 0.9, 0.82, 1).lathe([[0.012, -0.12], [0.05, 0.02], [0.085, 0.15]], 8); // paper
  const n = Math.max(3, Math.min(9, kinds.length));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3, lean = i === 0 ? 0 : 0.085 + (i % 2) * 0.03, h = 0.3 + (i % 3) * 0.035;
    const top = V(Math.sin(a) * lean, h, Math.cos(a) * lean);
    b.tint(0.2, 0.5, 0.15, 1).rod(V(0, 0.0, 0), top, 0.006, 4, { caps: false });
    const c = FLOWER_COLORS[kinds[i % kinds.length]] || FLOWER_COLORS.poppy;
    b.tint(c[0], c[1], c[2], 1).place(top.x, top.y, top.z).lathe([[0.0, -0.012], [0.045, 0.0], [0.05, 0.016], [0.02, 0.035], [0.0, 0.03]], 7).pop();
    b.tint(0.95, 0.75, 0.1, 1).place(top.x, top.y + 0.03, top.z).lathe([[0.0, -0.008], [0.014, 0.0], [0.0, 0.01]], 5).pop();
  }
  b.tint(0.25, 0.55, 0.18, 1);
  for (let i = 0; i < 4; i++) { const a = i * 1.7; b.tri(V(0, 0.08, 0), V(Math.sin(a) * 0.1, 0.2, Math.cos(a) * 0.1), V(Math.sin(a + 0.5) * 0.07, 0.24, Math.cos(a + 0.5) * 0.07)); } // leaves
  return mesh(b);
}

// ---------------------------------------------------------------------------
// The jetpack: two tanks on the back (the avatar faces +Z, so they sit at -Z), nozzles underneath. Its flames
// are a second small mesh, shown while it burns.

export function makeJetpack() {
  const b = new MeshBuilder();
  for (const x of [-0.11, 0.11]) {
    b.tint(0.75, 0.76, 0.78, 1).place(x, 0, 0).lathe([[0.0, -0.2], [0.07, -0.17], [0.085, -0.05], [0.085, 0.14], [0.06, 0.22], [0.0, 0.25]], 10).pop();
    b.tint(0.2, 0.2, 0.22, 1).place(x, -0.2, 0).lathe([[0.03, 0.0], [0.065, -0.09]], 8).pop(); // nozzle
    b.tint(0.85, 0.2, 0.1, 1).place(x, 0.02, 0).lathe([[0.088, -0.03], [0.088, 0.03]], 10).pop(); // stripe
  }
  b.tint(0.25, 0.25, 0.27, 1).box(-0.1, -0.06, 0.04, 0.1, 0.1, 0.1); // the plate against the back
  const pack = mesh(b);
  const f = new MeshBuilder();
  for (const x of [-0.11, 0.11]) {
    f.tint(1.0, 0.55, 0.12, 1).place(x, -0.29, 0).lathe([[0.055, 0.0], [0.07, -0.12], [0.0, -0.5]], 8).pop();
    f.tint(1.0, 0.9, 0.5, 1).place(x, -0.29, 0).lathe([[0.03, 0.0], [0.035, -0.08], [0.0, -0.28]], 6).pop();
  }
  const flames = mesh(f, glowMaterial());
  flames.layers.disable(LAYER.DYNAMIC_CASTER);
  pack.add(flames);
  pack.userData.flames = flames;
  return pack;
}

// ---------------------------------------------------------------------------
// The quad: four fat tyres, a seat, handlebars. Origin on the ground under the rider, facing +Z.

export const QUAD = { seat: 0.62, length: 1.7 };
let quadGeo = null;
export function makeQuad() {
  if (!quadGeo) {
    const b = new MeshBuilder();
    // tyres and hubs
    for (const [x, z] of [[-0.48, 0.58], [0.48, 0.58], [-0.48, -0.56], [0.48, -0.56]]) {
      b.tint(0.05, 0.05, 0.055, 1).place(x, 0.27, z, 0, 0, Math.PI / 2).lathe([[0.14, -0.13], [0.25, -0.12], [0.27, -0.05], [0.27, 0.05], [0.25, 0.12], [0.14, 0.13]], 12).pop();
      b.tint(0.78, 0.78, 0.8, 1).place(x, 0.27, z, 0, 0, Math.PI / 2).lathe([[0.0, -0.14], [0.14, -0.135], [0.14, 0.135], [0.0, 0.14]], 8).pop();
    }
    // frame, engine, bodywork
    b.tint(0.12, 0.12, 0.13, 1).box(-0.2, 0.22, -0.7, 0.2, 0.42, 0.72);
    b.tint(0.85, 0.12, 0.08, 1);
    b.box(-0.3, 0.42, 0.28, 0.3, 0.6, 0.84); // front
    b.box(-0.28, 0.42, -0.84, 0.28, 0.56, -0.3); // rear rack
    for (const s of [-1, 1]) { b.box(s * 0.3, 0.5, 0.34, s * 0.66, 0.56, 0.84); b.box(s * 0.28, 0.48, -0.82, s * 0.66, 0.54, -0.32); } // mudguards
    b.tint(0.08, 0.08, 0.09, 1).box(-0.2, 0.5, -0.36, 0.2, QUAD.seat, 0.3); // seat
    // handlebars and the headlight
    b.tint(0.15, 0.15, 0.16, 1).rod(V(0, 0.58, 0.42), V(0, 0.92, 0.3), 0.03, 6);
    b.rod(V(-0.36, 0.92, 0.28), V(0.36, 0.92, 0.28), 0.022, 6);
    b.tint(0.04, 0.04, 0.045, 1).rod(V(-0.36, 0.92, 0.28), V(-0.24, 0.92, 0.28), 0.032, 6).rod(V(0.24, 0.92, 0.28), V(0.36, 0.92, 0.28), 0.032, 6);
    b.tint(1.6, 1.5, 1.1, 1).place(0, 0.66, 0.85, 0, Math.PI / 2, 0).lathe([[0.0, 0.0], [0.09, 0.005], [0.1, 0.03]], 10).pop();
    quadGeo = b.build();
  }
  const m = new THREE.Mesh(quadGeo, cosmeticMaterial());
  m.layers.enable(LAYER.DYNAMIC_CASTER);
  m.frustumCulled = false;
  return m;
}
