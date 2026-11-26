// The animals of light (see RankEmotes.js): how each one is built and how it moves.
// An animal is a rig of rigid parts (plates, drums, beams), each hanging from a parent at a pivot. Its builder
// models them, all in one mesh, and gives `animate(t, pose)`: it poses the parts for the instant t (seconds
// since the ring began to open) and returns the glow of the ring, 0..1.
import * as THREE from 'three';
import { MeshBuilder } from '../world/props/MeshBuilder.js';

export const MAX_PARTS = 28;
export const RING = { y: 3.75, z: -1.55, r: 2.55 }; // centre of the ring, above and behind the player (who faces +Z), and its radius
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 0 → 1 between a and b, back to 0 between c and d. */
const hold = (a, b, c, d, x) => ss(a, b, x) * (1 - ss(c, d, x));
const SIDES = [[1, 'L'], [-1, 'R']]; // left and right: which way along X, and the letter in the names of the parts

class RigBuilder {
  constructor() { this.b = new MeshBuilder(); this.parts = []; this.index = {}; }

  /** A rigid part hanging from `parent` at `pivot` (in the parent's frame); `draw(b, shade)` models it around its pivot. */
  part(name, parent, pivot, draw = () => {}) {
    const id = this.parts.length;
    if (id >= MAX_PARTS) throw new Error('RankAnimals: too many parts');
    const b = this.b, a = (id + 0.5) / 32; // the part number travels in the vertex alpha
    const shade = (k) => { b.color = [k, k, k, a]; return b; };
    shade(1);
    draw(b, shade);
    this.parts.push({ name, parent: parent === null ? -1 : this.index[parent], pivot });
    this.index[name] = id;
    return id;
  }

  build() { return { geometry: this.b.build(), parts: this.parts, index: this.index }; }
}

/** A limb segment from its pivot to `to`, with the drum of its joint. */
function limb(b, shade, to, w, d) {
  shade(1); b.beam(V(0, 0, 0), to, w, d);
  shade(0.55); b.rod(V(-w * 0.66, 0, 0), V(w * 0.66, 0, 0), d * 0.5, 8);
}

function quadruped(R, { y, len, legF, legH, pawF = 0.2, thick = 1 }) {
  const z = len / 2 - 0.2;
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    const [f1, f2] = legF, [h1, h2] = legH, x = (0.2 + 0.06 * thick) * s;
    R.part(`fu${n}`, 'body', [x, -0.16, z], (b, sh) => limb(b, sh, V(0, -f1, 0.04), 0.15 * thick, 0.2 * thick));
    R.part(`fl${n}`, `fu${n}`, [0, -f1, 0.04], (b, sh) => { limb(b, sh, V(0, -f2, -0.04), 0.11 * thick, 0.13 * thick); sh(0.5); b.cube(0, -f2 - 0.04, 0.02, 0.16 * thick, 0.1, pawF); });
    R.part(`hu${n}`, 'body', [x, -0.1, -z], (b, sh) => limb(b, sh, V(0, -h1, -0.16), 0.17 * thick, 0.27 * thick));
    R.part(`hl${n}`, `hu${n}`, [0, -h1, -0.16], (b, sh) => { limb(b, sh, V(0, -h2, 0.16), 0.11 * thick, 0.13 * thick); sh(0.5); b.cube(0, -h2 - 0.04, 0.2, 0.16 * thick, 0.1, pawF); });
  }
  void y;
}

/**
 * A faceted shell along Z through cross-sections `[z, half width, half height, y = 0, shade]` (boxes with cut corners,
 * given from back to front): flat plates from one to the next. A shade applies from its section on. `ends`: which
 * of the two ends are closed (b: the back one, f: the front one).
 */
function hull(b, shade, sections, cut = 0.5, ends = 'bf') {
  const k = 1 - cut;
  const rings = sections.map(([z, w, h, y = 0]) => [[w, -h * k], [w, h * k], [w * k, h], [-w * k, h], [-w, h * k], [-w, -h * k], [-w * k, -h], [w * k, -h]].map(([px, py]) => V(px, y + py, z)));
  rings.forEach((p, i) => {
    if (sections[i][4] !== undefined) shade(sections[i][4]);
    const q = rings[i + 1];
    if (i === 0 && ends.includes('b')) b.poly([...p].reverse());
    if (q) for (let j = 0; j < 8; j++) b.quad(p[j], p[(j + 1) % 8], q[(j + 1) % 8], q[j]);
    else if (ends.includes('f')) b.poly(p);
  });
}

/** A fin: a skin stretched from `o` over `tips` (in order), with a rib to each tip, or only to those of `ribs`. */
function fin(b, shade, o, tips, w = 0.03, ribs = tips, skin = 0.85) {
  shade(skin); b.poly([o, ...tips]);
  shade(1.4); for (const p of ribs) b.beam(o, p, w, w);
}

/** A feather, a blade: a thin slab from p0 to p1, lying flat, w0 wide at its root and w1 at its tip. */
function blade(b, p0, p1, w0, w1, thick = 0.03) {
  const z = p1.clone().sub(p0).normalize(), x = V(0, 1, 0).cross(z).normalize(), y = z.clone().cross(x);
  const corners = (p, w) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => p.clone().addScaledVector(x, (w / 2) * i).addScaledVector(y, (thick / 2) * j));
  const a = corners(p0, w0), d = corners(p1, w1);
  for (let i = 0; i < 4; i++) b.quad(a[i], a[(i + 1) % 4], d[(i + 1) % 4], d[i]);
  b.quad(a[3], a[2], a[1], a[0]); b.quad(d[0], d[1], d[2], d[3]);
}

function deer() {
  const R = new RigBuilder();
  R.part('root', null, [0, 0, 0]);
  R.part('body', 'root', [0, 1.5, 0.56], (b, sh) => {
    sh(1); b.cube(0, 0, 0, 0.54, 0.6, 1.46);
    sh(0.8); b.cube(0, 0.05, 0.54, 0.66, 0.7, 0.5); b.cube(0, 0.02, -0.54, 0.62, 0.64, 0.46);
    sh(1.3); b.cube(0, 0.36, 0, 0.1, 0.08, 1.5);
    sh(2.3); b.cube(0, -0.04, 0.8, 0.2, 0.22, 0.05); // the core in the chest
  });
  R.part('neck', 'body', [0, 0.16, 0.72], (b, sh) => {
    sh(1); b.beam(V(0, 0, 0), V(0, 0.84, 0.34), 0.28, 0.32);
    sh(0.75); for (const k of [0.22, 0.5, 0.78]) b.cube(0, 0.84 * k, 0.34 * k, 0.36, 0.07, 0.38);
  });
  R.part('head', 'neck', [0, 0.86, 0.36], (b, sh) => {
    sh(1); b.cube(0, 0.06, 0.14, 0.3, 0.3, 0.44);
    sh(0.9); b.cube(0, -0.01, 0.48, 0.2, 0.2, 0.3);
    sh(0.55); b.cube(0, -0.05, 0.65, 0.14, 0.1, 0.06);
    sh(2.6); b.cube(0.152, 0.1, 0.24, 0.02, 0.07, 0.1); b.cube(-0.152, 0.1, 0.24, 0.02, 0.07, 0.1); // eyes
  });
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    R.part(`ear${n}`, 'head', [0.15 * s, 0.2, 0], (b, sh) => { sh(0.9); b.beam(V(0, 0, 0), V(0.27 * s, 0.12, -0.06), 0.05, 0.16); });
    R.part(`antler${n}`, 'head', [0.09 * s, 0.2, 0.04], (b, sh) => {
      sh(1.45);
      const p = [V(0, 0, 0), V(0.17 * s, 0.38, -0.1), V(0.44 * s, 0.76, -0.2), V(0.52 * s, 1.18, -0.1)];
      for (let i = 0; i < 3; i++) b.beam(p[i], p[i + 1], 0.075 - i * 0.014, 0.075 - i * 0.014);
      b.beam(p[1], p[1].clone().add(V(0.02 * s, 0.36, 0.22)), 0.045, 0.045);
      b.beam(p[1], p[1].clone().add(V(0.26 * s, 0.1, 0.14)), 0.04, 0.04);
      b.beam(p[2], p[2].clone().add(V(-0.08 * s, 0.36, 0.16)), 0.04, 0.04);
      b.beam(p[2], p[2].clone().add(V(0.32 * s, 0.2, -0.04)), 0.04, 0.04);
    });
  }
  quadruped(R, { y: 1.5, len: 1.46, legF: [0.66, 0.62], legH: [0.62, 0.72] });
  R.part('tail', 'body', [0, 0.2, -0.76], (b, sh) => { sh(1.1); b.beam(V(0, 0, 0), V(0, 0.1, -0.24), 0.14, 0.06); });
  const rig = R.build(), I = rig.index;
  rig.animate = (t, P) => {
    const rear = hold(1.5, 2.25, 3.5, 4.3, t), graze = 1 - ss(0.3, 1.3, t), paw = Math.sin(t * 9);
    P.pos(I.root, 0, RING.y - 2.95 + rear * 0.1, RING.z - 0.9);
    P.rot(I.root, -rear * 0.82, 0.62, 0);
    P.rot(I.neck, graze * 1.05 - rear * 0.2 + ss(4.3, 4.9, t) * 0.25, 0, 0);
    P.rot(I.head, graze * 0.25 + rear * 0.45 + Math.sin(t * 2.1) * 0.05, Math.sin(t * 1.4) * 0.22 * (1 - graze), 0);
    P.rot(I.earL, 0, 0, Math.sin(t * 6.3) * 0.2); P.rot(I.earR, 0, 0, -Math.sin(t * 5.1 + 1) * 0.2);
    P.rot(I.tail, Math.sin(t * 7) * 0.3 - rear * 0.5, 0, 0);
    P.rot(I.fuL, -rear * (1.15 + 0.3 * paw), 0, 0); P.rot(I.flL, rear * (1.55 + 0.35 * paw), 0, 0);
    P.rot(I.fuR, -rear * (1.15 - 0.3 * paw), 0, 0); P.rot(I.flR, rear * (1.55 - 0.35 * paw), 0, 0);
    P.rot(I.huL, rear * 0.5, 0, 0); P.rot(I.hlL, -rear * 0.28, 0, 0);
    P.rot(I.huR, rear * 0.44, 0, 0); P.rot(I.hlR, -rear * 0.22, 0, 0);
    // a hoof stamps once back down
    const stamp = hold(4.35, 4.5, 4.55, 4.75, t);
    P.rot(I.fuR, -rear * (1.15 - 0.3 * paw) - stamp * 0.5, 0, 0); P.rot(I.flR, rear * (1.55 - 0.35 * paw) + stamp * 0.9, 0, 0);
    return hold(1.9, 2.4, 3.2, 4.0, t); // glow of the ring
  };
  rig.size = 1.3;
  return rig;
}

function wolf() {
  const R = new RigBuilder();
  R.part('root', null, [0, 0, 0]);
  R.part('body', 'root', [0, 1.08, 0.6], (b, sh) => {
    sh(1); b.cube(0, 0, -0.05, 0.46, 0.5, 1.5);
    sh(0.8); b.cube(0, 0.06, 0.5, 0.58, 0.64, 0.56); b.cube(0, 0, -0.6, 0.5, 0.5, 0.4);
    sh(1.3); for (let i = 0; i < 5; i++) b.cube(0, 0.33 + (i < 2 ? 0.05 : 0), 0.62 - i * 0.3, 0.1, 0.1, 0.2); // hackles
    sh(2.3); b.cube(0, -0.02, 0.8, 0.18, 0.2, 0.05);
  });
  R.part('neck', 'body', [0, 0.12, 0.7], (b, sh) => {
    sh(1); b.beam(V(0, 0, 0), V(0, 0.36, 0.42), 0.3, 0.34);
    sh(0.75); b.cube(0, 0.14, 0.16, 0.42, 0.3, 0.2);
  });
  R.part('head', 'neck', [0, 0.38, 0.44], (b, sh) => {
    sh(1); b.cube(0, 0.04, 0.12, 0.34, 0.3, 0.4);
    sh(0.9); b.cube(0, 0.0, 0.5, 0.18, 0.15, 0.44);
    sh(0.5); b.cube(0, 0.04, 0.74, 0.1, 0.08, 0.06);
    sh(2.6); b.cube(0.172, 0.1, 0.22, 0.02, 0.06, 0.1); b.cube(-0.172, 0.1, 0.22, 0.02, 0.06, 0.1);
    sh(0.95); for (const s of [1, -1]) b.beam(V(0.12 * s, 0.16, -0.02), V(0.17 * s, 0.44, -0.06), 0.12, 0.05); // ears
  });
  R.part('jaw', 'head', [0, -0.08, 0.26], (b, sh) => {
    sh(0.8); b.cube(0, -0.03, 0.22, 0.15, 0.06, 0.44);
    sh(1.7); for (const s of [1, -1]) b.cube(0.05 * s, 0.03, 0.4, 0.02, 0.07, 0.03); // fangs
  });
  quadruped(R, { y: 1.08, len: 1.5, legF: [0.5, 0.46], legH: [0.46, 0.52], pawF: 0.24 });
  R.part('tail1', 'body', [0, 0.14, -0.8], (b, sh) => { sh(1); b.beam(V(0, 0, 0), V(0, -0.1, -0.5), 0.16, 0.18); });
  R.part('tail2', 'tail1', [0, -0.1, -0.5], (b, sh) => { sh(1.2); b.beam(V(0, 0, 0), V(0, -0.06, -0.5), 0.12, 0.14); sh(1.6); b.cube(0, -0.07, -0.54, 0.07, 0.08, 0.1); });
  const rig = R.build(), I = rig.index;
  rig.animate = (t, P) => {
    const howl = hold(1.7, 2.3, 3.9, 4.5, t), prowl = 1 - ss(1.0, 1.7, t), step = Math.sin(t * 6.5);
    P.pos(I.root, 0, RING.y - 2.3, RING.z - 1.0);
    P.rot(I.root, -howl * 0.34 + prowl * 0.1, 0.6, 0);
    P.rot(I.neck, prowl * 0.55 - howl * 0.75, 0, 0);
    P.rot(I.head, prowl * 0.1 - howl * 0.62, Math.sin(t * 1.7) * 0.2 * (1 - howl), 0);
    P.rot(I.jaw, howl * (0.5 + 0.06 * Math.sin(t * 11)), 0, 0);
    P.rot(I.tail1, -0.2 + howl * 0.75, Math.sin(t * 3) * 0.3, 0); P.rot(I.tail2, howl * 0.4, Math.sin(t * 3 - 0.8) * 0.4, 0);
    const k = prowl * 0.42;
    P.rot(I.fuL, step * k - howl * 0.12, 0, 0); P.rot(I.flL, Math.max(0, -step) * k * 1.3, 0, 0);
    P.rot(I.fuR, -step * k - howl * 0.12, 0, 0); P.rot(I.flR, Math.max(0, step) * k * 1.3, 0, 0);
    // haunches fold as it sits back to howl
    P.rot(I.huL, -step * k + howl * 0.62, 0, 0); P.rot(I.hlL, Math.max(0, step) * k - howl * 0.95, 0, 0);
    P.rot(I.huR, step * k + howl * 0.62, 0, 0); P.rot(I.hlR, Math.max(0, -step) * k - howl * 0.95, 0, 0);
    return howl * (0.75 + 0.25 * Math.sin(t * 11));
  };
  rig.size = 1.4;
  return rig;
}

function tiger() {
  const R = new RigBuilder();
  R.part('root', null, [0, 0, 0]);
  R.part('body', 'root', [0, 1.0, 0], (b, sh) => {
    sh(1); b.cube(0, 0, 0, 0.6, 0.56, 1.9);
    sh(0.85); b.cube(0, 0.04, 0.66, 0.74, 0.7, 0.6); b.cube(0, 0.02, -0.7, 0.68, 0.62, 0.5);
    sh(0.42); for (let i = 0; i < 7; i++) { const z = 0.78 - i * 0.26; b.cube(0, 0.3, z, 0.66, 0.05, 0.08); b.cube(0.31, 0.06, z + 0.04, 0.03, 0.34, 0.07); b.cube(-0.31, 0.06, z + 0.04, 0.03, 0.34, 0.07); } // stripes
    sh(2.3); b.cube(0, -0.04, 0.99, 0.2, 0.22, 0.05);
  });
  R.part('head', 'body', [0, 0.2, 0.98], (b, sh) => {
    sh(1); b.cube(0, 0.06, 0.2, 0.52, 0.44, 0.46);
    sh(0.9); b.cube(0, -0.02, 0.5, 0.3, 0.22, 0.24);
    sh(0.5); b.cube(0, 0.04, 0.63, 0.14, 0.09, 0.05);
    sh(2.6); b.cube(0.262, 0.14, 0.3, 0.02, 0.06, 0.12); b.cube(-0.262, 0.14, 0.3, 0.02, 0.06, 0.12);
    sh(0.95); for (const s of [1, -1]) b.cube(0.2 * s, 0.32, 0.06, 0.14, 0.12, 0.06); // ears
    sh(0.42); b.cube(0, 0.285, 0.2, 0.12, 0.03, 0.4); for (const s of [1, -1]) b.cube(0.15 * s, 0.285, 0.14, 0.05, 0.03, 0.24);
    sh(0.8); for (const s of [1, -1]) b.cube(0.3 * s, -0.06, 0.2, 0.08, 0.2, 0.3); // jowls
  });
  R.part('jaw', 'head', [0, -0.13, 0.26], (b, sh) => {
    sh(0.8); b.cube(0, -0.04, 0.16, 0.26, 0.07, 0.34);
    sh(1.8); for (const s of [1, -1]) b.cube(0.09 * s, 0.04, 0.3, 0.03, 0.1, 0.03);
  });
  quadruped(R, { y: 1.0, len: 1.9, legF: [0.46, 0.42], legH: [0.44, 0.46], pawF: 0.3, thick: 1.35 });
  R.part('tail1', 'body', [0, 0.14, -0.98], (b, sh) => { sh(1); b.beam(V(0, 0, 0), V(0, -0.06, -0.52), 0.13, 0.13); sh(0.42); b.cube(0, -0.03, -0.26, 0.15, 0.15, 0.08); });
  R.part('tail2', 'tail1', [0, -0.06, -0.52], (b, sh) => { sh(1); b.beam(V(0, 0, 0), V(0, 0.02, -0.5), 0.11, 0.11); sh(0.42); b.cube(0, 0.01, -0.25, 0.13, 0.13, 0.08); });
  R.part('tail3', 'tail2', [0, 0.02, -0.5], (b, sh) => { sh(1); b.beam(V(0, 0, 0), V(0, 0.08, -0.44), 0.09, 0.09); sh(0.42); b.cube(0, 0.08, -0.44, 0.11, 0.11, 0.12); });
  const rig = R.build(), I = rig.index;
  rig.animate = (t, P) => {
    // crouch in the ring, leap through it, land in front, roar
    const leap = ss(1.55, 2.35, t), air = Math.sin(leap * Math.PI), crouch = hold(0.2, 0.9, 1.5, 1.7, t), land = hold(2.3, 2.45, 2.55, 3.0, t);
    const roar = hold(2.9, 3.3, 4.3, 4.8, t), y0 = RING.y - 1.55;
    P.pos(I.root, 0.4 * leap, y0 * (1 - leap) + 0.02 * leap + air * 1.3 - crouch * 0.28 - land * 0.2, RING.z - 0.4 + leap * 5.4);
    P.rot(I.root, -air * 0.42 + leap * (1 - leap) * 1.2 * (leap > 0.5 ? 1 : -0.4) + crouch * 0.16 - roar * 0.1, 0.2 * (1 - leap), 0);
    P.rot(I.head, crouch * 0.2 - roar * 0.5 + air * 0.2, Math.sin(t * 9) * 0.1 * roar, Math.sin(t * 13) * 0.05 * roar);
    P.rot(I.jaw, roar * (0.62 + 0.05 * Math.sin(t * 17)) + air * 0.3, 0, 0);
    const bend = crouch * 0.75 + land * 0.6;
    for (const n of ['L', 'R']) {
      P.rot(I[`fu${n}`], -bend * 0.75 - air * 1.2, 0, 0); P.rot(I[`fl${n}`], bend * 1.5 + air * 0.5, 0, 0);
      P.rot(I[`hu${n}`], bend * 0.8 + air * 1.0, 0, 0); P.rot(I[`hl${n}`], -bend * 1.5 - air * 0.4, 0, 0);
    }
    const lash = Math.sin(t * 5.2);
    P.rot(I.tail1, -0.25 + air * 0.5, lash * 0.35, 0); P.rot(I.tail2, 0.25, lash * 0.5, 0); P.rot(I.tail3, 0.35, Math.sin(t * 5.2 - 0.9) * 0.6, 0);
    return Math.max(hold(1.5, 1.75, 2.0, 2.5, t), roar * (0.7 + 0.3 * Math.sin(t * 17)));
  };
  rig.size = 1.3;
  return rig;
}

function dragon() {
  const R = new RigBuilder(), SEG = 13, SIZE = 1.55, LINK = 0.47 * SIZE; // segments, how much bigger than modelled, distance between two
  R.part('head', null, [0, 0, 0], (b, sh) => {
    sh(1); b.cube(0, 0.04, 0.1, 0.5, 0.4, 0.62);
    sh(0.9); b.cube(0, 0.0, 0.58, 0.3, 0.24, 0.5);
    sh(0.5); for (const s of [1, -1]) b.cube(0.08 * s, 0.1, 0.82, 0.06, 0.06, 0.05); // nostrils
    sh(2.7); b.cube(0.252, 0.12, 0.24, 0.02, 0.07, 0.14); b.cube(-0.252, 0.12, 0.24, 0.02, 0.07, 0.14);
    sh(1.45); for (const s of [1, -1]) { b.beam(V(0.16 * s, 0.22, -0.1), V(0.34 * s, 0.56, -0.72), 0.1, 0.1); b.beam(V(0.22 * s, 0.08, -0.14), V(0.52 * s, 0.14, -0.6), 0.07, 0.07); } // horns
    sh(0.8); b.cube(0, 0.27, 0.2, 0.36, 0.06, 0.5); for (const s of [1, -1]) b.beam(V(0.14 * s, -0.04, 0.72), V(0.2 * s, -0.34, 1.0), 0.03, 0.03); // brow, whiskers
  });
  R.part('jaw', 'head', [0, -0.14, 0.16], (b, sh) => {
    sh(0.8); b.cube(0, -0.04, 0.34, 0.26, 0.08, 0.68);
    sh(1.8); for (const s of [1, -1]) for (const z of [0.5, 0.62]) b.cube(0.1 * s, 0.03, z, 0.03, 0.09, 0.03);
  });
  for (let i = 0; i < SEG; i++) {
    const k = 1 - 0.66 * (i / (SEG - 1)) ** 1.4;
    R.part(`s${i}`, null, [0, 0, 0], (b, sh) => {
      sh(i % 2 ? 0.8 : 1); b.cube(0, 0, 0, 0.46 * k, 0.4 * k, 0.5);
      sh(0.55); b.cube(0, -0.17 * k, 0, 0.32 * k, 0.1 * k, 0.54); // belly plates
      sh(0.62); b.rod(V(-0.26 * k, 0, 0.25), V(0.26 * k, 0, 0.25), 0.13 * k, 8); // the joint with the next one
      sh(1.5); b.beam(V(0, 0.19 * k, 0.14), V(0, 0.46 * k, -0.16), 0.06 * k, 0.22 * k); // dorsal fin
    });
  }
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    R.part(`wing${n}`, 's2', [0.2 * s, 0.14, 0], (b, sh) => {
      sh(1.25); b.beam(V(0, 0, 0), V(0.85 * s, 0.2, -0.06), 0.08, 0.08);
      sh(0.6);
      const a = V(0, 0, 0), c = V(0.85 * s, 0.2, -0.06), d = V(0.7 * s, 0.04, -0.62), e = V(0.06 * s, -0.04, -0.5);
      if (s > 0) b.quad(a, c, d, e); else b.quad(e, d, c, a);
    });
    R.part(`tip${n}`, `wing${n}`, [0.85 * s, 0.2, -0.06], (b, sh) => {
      const fingers = [[0.95, 0.06], [0.85, -0.38], [0.56, -0.68]];
      sh(1.25); for (const [x, z] of fingers) b.beam(V(0, 0, 0), V(x * s, -0.06, z), 0.05, 0.05);
      sh(0.6);
      const o = V(0, 0, 0), q = [...fingers.map(([x, z]) => V(x * s, -0.06, z)), V(-0.15 * s, -0.16, -0.56)];
      for (let i = 0; i < 3; i++) { if (s > 0) b.tri(o, q[i], q[i + 1]); else b.tri(o, q[i + 1], q[i]); }
    });
  }
  R.part('fin', `s${SEG - 1}`, [0, 0, -0.25], (b, sh) => {
    sh(1.4);
    const o = V(0, 0, 0), u = V(0, 0.42, -0.4), d = V(0, -0.3, -0.4), e = V(0, 0.04, -0.95);
    b.tri(o, u, e); b.tri(e, u, o); b.tri(o, e, d); b.tri(d, e, o);
  });
  const rig = R.build(), I = rig.index;
  // The dragon winds round the ring like a serpent round a hoop: `u` runs along that coil.
  const TUBE = 0.95, TH = 0.7, PS = 1.55;
  const coil = (u, out) => {
    const th = u * TH + 2.4, ps = u * PS, rr = RING.r + TUBE * Math.cos(ps);
    return out.set(rr * Math.cos(th), RING.y + rr * Math.sin(th), RING.z + TUBE * Math.sin(ps));
  };
  const p = V(0, 0, 0), q = V(0, 0, 0), up = V(0, 0, 0), x = V(0, 0, 0), y = V(0, 0, 0), zz = V(0, 0, 0), m = new THREE.Matrix4(), big = V(SIZE, SIZE, SIZE);
  /** Frame of the coil at u (z along it, y away from the ring); returns how fast the coil runs there (m per unit of u). */
  const frame = (u, lift = 0) => {
    coil(u, p); coil(u + 0.02, q);
    zz.subVectors(q, p);
    const speed = zz.length() / 0.02;
    zz.normalize();
    const th = u * TH + 2.4;
    up.set(p.x - RING.r * Math.cos(th), p.y - RING.y - RING.r * Math.sin(th), p.z - RING.z).normalize();
    x.crossVectors(up, zz).normalize(); y.crossVectors(zz, x);
    m.makeBasis(x, y, zz).scale(big).setPosition(p.x + y.x * lift, p.y + y.y * lift, p.z + y.z * lift);
    return speed;
  };
  rig.animate = (t, P) => {
    const roar = hold(3.0, 3.4, 4.2, 4.7, t);
    // quick at first, slower while it roars
    let u = 1.6 + t * 1.15 - ss(3.0, 4.6, t) * (t - 3.0) * 0.45;
    let speed = frame(u, 0.08);
    P.direct(I.head, m);
    u -= (0.52 * SIZE) / speed;
    for (let i = 0; i < SEG; i++) { speed = frame(u); P.direct(I[`s${i}`], m); u -= LINK / speed; }
    P.rot(I.jaw, 0.12 + roar * (0.6 + 0.06 * Math.sin(t * 19)), 0, 0);
    const flap = Math.sin(t * 6.4);
    P.rot(I.wingL, 0, 0, 0.25 + flap * 0.55); P.rot(I.tipL, 0, 0, -0.3 + Math.sin(t * 6.4 - 0.9) * 0.6);
    P.rot(I.wingR, 0, 0, -0.25 - flap * 0.55); P.rot(I.tipR, 0, 0, 0.3 - Math.sin(t * 6.4 - 0.9) * 0.6);
    P.rot(I.fin, 0, Math.sin(t * 8) * 0.3, 0);
    return Math.max(roar * (0.75 + 0.25 * Math.sin(t * 19)), 0.25 * ss(0.4, 1.2, t) * (1 - ss(4.6, 5.2, t)));
  };
  return rig;
}

function goldfish() {
  const R = new RigBuilder(), SIZE = 1.25, GLUB = [1.6, 1.9, 2.2, 3.1, 3.6]; // how much bigger than modelled, when each bubble leaves the mouth
  R.part('body', null, [0, 0, 0], (b, sh) => {
    hull(b, sh, [[-0.14, 0.33, 0.47, 0, 1], [0.06, 0.34, 0.48, 0], [0.27, 0.3, 0.41, 0], [0.44, 0.21, 0.27, -0.02], [0.56, 0.11, 0.13, -0.05]]);
    hull(b, sh, [[-0.2, 0.355, 0.495, 0, 0.6], [-0.08, 0.355, 0.495, 0]]); // the collar the tail half turns in
    sh(0.7); for (const s of [1, -1]) b.cube(0.3 * s, -0.04, 0.2, 0.04, 0.4, 0.05); // gills
    sh(0.55); b.cube(0, -0.01, 0.6, 0.15, 0.06, 0.1); // upper lip
    for (const s of [1, -1]) fin(b, sh, V(0.1 * s, -0.44, 0.02), [V(0.18 * s, -0.68, -0.12), V(0.06 * s, -0.62, -0.28)]); // pelvic fins
  });
  R.part('jaw', 'body', [0, -0.1, 0.5], (b, sh) => { sh(0.55); b.cube(0, -0.01, 0.09, 0.14, 0.06, 0.12); });
  R.part('dorsal', 'body', [0, 0.48, 0], (b, sh) => {
    const tips = [V(0, 0.38, 0.08), V(0, 0.46, -0.16), V(0, 0.34, -0.42), V(0, -0.04, -0.36)];
    fin(b, sh, V(0, 0, 0.22), tips, 0.03, tips.slice(0, 3));
  });
  R.part('rear', 'body', [0, 0, -0.14], (b, sh) => {
    hull(b, sh, [[-0.52, 0.06, 0.12, 0.04, 0.85], [-0.38, 0.13, 0.22, 0.04], [-0.18, 0.23, 0.35, 0.02], [0, 0.3, 0.44, 0]]);
    fin(b, sh, V(0, -0.24, -0.14), [V(0, -0.5, -0.3), V(0, -0.34, -0.46)]); // anal fin
  });
  for (const [s, n] of SIDES) {
    // bulging eyes: a drum, a lens, a pupil off its centre (the drum turns: the eyes roll)
    R.part(`eye${n}`, 'body', [0.22 * s, 0.16, 0.33], (b, sh) => {
      sh(0.6); b.rod(V(0, 0, 0), V(0.15 * s, 0, 0), 0.16, 8);
      sh(2.4); b.rod(V(0.15 * s, 0, 0), V(0.18 * s, 0, 0), 0.125, 8);
      sh(0.25); b.rod(V(0.18 * s, 0, 0.045), V(0.195 * s, 0, 0.045), 0.06, 6);
    });
    R.part(`pec${n}`, 'body', [0.31 * s, -0.18, 0.2], (b, sh) => fin(b, sh, V(0, 0, 0), [V(0.28 * s, 0.08, -0.08), V(0.34 * s, -0.08, -0.28), V(0.14 * s, -0.22, -0.32)]));
    // the fan tail: two veils side by side, each hinged half-way
    R.part(`tail${n}`, 'rear', [0.02 * s, 0.04, -0.5], (b, sh) => fin(b, sh, V(0, 0, 0.04), [V(0, 0.4, -0.3), V(0, 0.02, -0.32), V(0, -0.36, -0.3)]));
    R.part(`veil${n}`, `tail${n}`, [0, 0.02, -0.31], (b, sh) => {
      const tips = [V(0, 0.38, 0.01), V(0, 0.84, -0.44), V(0, 0.4, -0.4), V(0, 0.02, -0.2), V(0, -0.34, -0.38), V(0, -0.78, -0.4), V(0, -0.38, 0.01)];
      fin(b, sh, V(0, 0, 0), tips, 0.03, [tips[1], tips[2], tips[4], tips[5]]);
    });
  }
  GLUB.forEach((_, i) => R.part(`bubble${i}`, null, [0, 0, 0], (b, sh) => {
    const r = [0.1, 0.13, 0.16, 0.09, 0.08][i];
    sh(1.45); b.lathe([[0, -r], [0.75 * r, -0.66 * r], [r, 0], [0.75 * r, 0.66 * r], [0, r]], 6);
  }));
  const rig = R.build(), I = rig.index;
  // It swims round a tilted oval inside the ring; `a` runs along it, and stands still while the fish blows its bubbles.
  const along = (t) => 3.2 + 2.3 * ss(-0.6, 1.5, t) + 3.9 * ss(2.2, 5.6, t) + 0.04 * t;
  const at = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0 }, e = new THREE.Euler(0, 0, 0, 'YXZ'), m = new THREE.Matrix4();
  const swim = (t) => {
    const a = along(t);
    at.speed = (along(t + 0.02) - a) / 0.02;
    at.x = 1.25 * Math.sin(a); at.y = RING.y + 0.05 - 0.35 * Math.cos(a - 5.6) + 0.05 * Math.sin(t * 2.3); at.z = RING.z - 0.45 + 0.8 * Math.cos(a);
    at.yaw = Math.atan2(1.25 * Math.cos(a), -0.8 * Math.sin(a));
    at.pitch = -0.3 * Math.sin(a - 5.6) - 0.2 * (1 - Math.min(1, at.speed));
    return at;
  };
  // where each bubble leaves the mouth, and which way
  const blown = GLUB.map((T) => {
    const f = swim(T); e.set(f.pitch, f.yaw, 0);
    return { from: V(0, -0.07, 0.68).multiplyScalar(SIZE).applyEuler(e).add(V(f.x, f.y, f.z)), dir: V(0, 0, 1).applyEuler(e) };
  });
  rig.animate = (t, P) => {
    const f = swim(t), go = Math.min(1, f.speed / 1.1), wag = (d) => go * Math.sin(t * 7.5 - d) + (1 - go) * 0.5 * Math.sin(t * 2.8 - d);
    let glub = 0;
    for (const T of GLUB) glub = Math.max(glub, hold(T - 0.16, T - 0.02, T + 0.02, T + 0.2, t));
    P.pos(I.body, f.x, f.y, f.z);
    P.rot(I.body, f.pitch - glub * 0.08, f.yaw - 0.12 * wag(0), -0.14 * go + 0.08 * wag(0.6));
    P.rot(I.rear, 0, 0.3 * wag(0.5), 0);
    P.rot(I.dorsal, 0, 0, 0.16 * wag(0.9));
    P.rot(I.jaw, glub * 0.8, 0, 0);
    const look = hold(1.65, 1.85, 2.7, 3.0, t) * 0.95;
    for (const [s, n] of SIDES) {
      P.rot(I[`tail${n}`], 0, 0.3 * s + 0.4 * wag(1.1), 0); P.rot(I[`veil${n}`], 0, 0.08 * s + 0.6 * wag(1.9), 0);
      P.rot(I[`pec${n}`], 0, s * (0.1 - 0.3 * go), s * (0.15 + (0.55 - 0.3 * go) * Math.sin(t * 9 + s)));
      P.rot(I[`eye${n}`], -look, 0, 0);
    }
    for (let i = 0; i < GLUB.length; i++) {
      const u = Math.max(0, t - GLUB[i]), life = i < 3 ? 1.9 : 1.3, { from, dir } = blown[i];
      // out of the mouth, then up, wobbling; it swells and bursts
      const k = u > life ? 0 : SIZE * ss(0, 0.25, u) * (1 + 0.25 * u / life + 0.5 * ss(life - 0.12, life, u));
      const out = 0.28 * ss(0, 0.4, u), up = (1.15 * u * u) / (u + 0.3);
      m.makeScale(k, k, k).setPosition(from.x + dir.x * out + 0.07 * Math.sin(u * 7), from.y + dir.y * out + up, from.z + dir.z * out + 0.05 * Math.sin(u * 6 + i));
      P.direct(I[`bubble${i}`], m);
    }
    return 0.35 * glub;
  };
  rig.size = SIZE;
  return rig;
}

function squirrel() {
  const R = new RigBuilder(), UP = -Math.PI / 2, CURL = [-1.2, 1.05, 0.15, -0.35, -0.85]; // (turns a hull to stand on end); the tail at rest: how each segment leans on the one before
  R.part('root', null, [0, 0, 0]);
  // sitting up: the spine rises from the hips, leaning a little forward
  R.part('body', 'root', [0, 0.42, -0.06], (b, sh) => {
    b.place(0, 0, 0, 0, UP + 0.28);
    hull(b, sh, [[-0.3, 0.2, 0.2, 0, 0.9], [-0.12, 0.3, 0.3, 0.02], [0.12, 0.31, 0.3, 0.02], [0.4, 0.25, 0.24, 0], [0.62, 0.17, 0.16, -0.02], [0.72, 0.12, 0.12, -0.03]]);
    sh(1.25); b.cube(0, -0.27, 0.16, 0.3, 0.08, 0.46); // the pale belly
    b.pop();
  });
  R.part('head', 'body', [0, 0.68, 0.19], (b, sh) => {
    hull(b, sh, [[-0.16, 0.15, 0.14, 0.17, 1], [-0.02, 0.2, 0.19, 0.17], [0.2, 0.19, 0.17, 0.15], [0.36, 0.11, 0.11, 0.1], [0.44, 0.06, 0.06, 0.09, 0.5]]);
    sh(1.15); for (const s of [1, -1]) b.cube(0.15 * s, 0.05, 0.2, 0.14, 0.18, 0.22); // cheeks
    sh(2.6); for (const s of [1, -1]) b.cube(0.195 * s, 0.2, 0.16, 0.02, 0.11, 0.13);
    sh(1.8); b.cube(0, -0.02, 0.4, 0.07, 0.08, 0.03); // teeth
  });
  R.part('jaw', 'head', [0, 0.02, 0.2], (b, sh) => { sh(0.8); b.cube(0, -0.03, 0.1, 0.16, 0.05, 0.2); });
  for (const [s, n] of SIDES) {
    R.part(`ear${n}`, 'head', [0.13 * s, 0.32, -0.02], (b, sh) => {
      sh(0.95); b.beam(V(0, 0, 0), V(0.04 * s, 0.19, -0.02), 0.14, 0.05);
      sh(1.45); b.beam(V(0.04 * s, 0.17, -0.02), V(0.06 * s, 0.3, -0.04), 0.06, 0.03); // tuft
    });
    R.part(`arm${n}`, 'body', [0.2 * s, 0.52, 0.14], (b, sh) => limb(b, sh, V(0.02 * s, -0.2, 0.16), 0.1, 0.11));
    R.part(`hand${n}`, `arm${n}`, [0.02 * s, -0.2, 0.16], (b, sh) => { limb(b, sh, V(-0.09 * s, 0.12, 0.2), 0.08, 0.09); sh(0.6); b.cube(-0.09 * s, 0.13, 0.22, 0.1, 0.08, 0.1); });
    // haunch: the folded leg, in one piece, and the long foot
    R.part(`thigh${n}`, 'root', [0.27 * s, 0.38, -0.04], (b, sh) => {
      sh(1); b.rod(V(-0.08 * s, 0, 0), V(0.08 * s, 0, 0), 0.25, 10);
      sh(0.9); b.beam(V(0, 0, 0), V(0, 0.02, 0.36), 0.15, 0.2); b.beam(V(0, 0.02, 0.34), V(0, -0.28, 0.2), 0.11, 0.12);
    });
    R.part(`foot${n}`, `thigh${n}`, [0, -0.28, 0.2], (b, sh) => { sh(0.6); b.beam(V(0, 0, -0.06), V(0, -0.03, 0.34), 0.13, 0.08); });
  }
  R.part('nut', 'handR', [0.22, 0.14, 0.22], (b, sh) => {
    sh(1.2); b.lathe([[0, -0.19], [0.09, -0.11], [0.125, 0], [0.115, 0.07]], 8);
    sh(0.5); b.lathe([[0.14, 0.05], [0.135, 0.11], [0.08, 0.16], [0, 0.17]], 8); b.beam(V(0, 0.16, 0), V(0.02, 0.24, 0), 0.03, 0.03); // its cup and stalk
  });
  const TAIL = [ // its five segments, each a hull stood on end, from the rump to the tip
    [[-0.06, 0.1, 0.09, 0, 0.75], [0.36, 0.2, 0.17]], [[-0.07, 0.19, 0.16, 0, 1], [0.48, 0.31, 0.22]], [[-0.07, 0.3, 0.21, 0, 0.75], [0.48, 0.34, 0.23]],
    [[-0.07, 0.33, 0.225, 0, 1], [0.44, 0.29, 0.2]], [[-0.07, 0.28, 0.195, 0, 0.75], [0.26, 0.2, 0.14, 0, 1.3], [0.42, 0.07, 0.05]],
  ];
  TAIL.forEach((sections, i) => R.part(`tail${i}`, i ? `tail${i - 1}` : 'body', i ? [0, TAIL[i - 1][1][0], 0] : [0, -0.18, -0.28], (b, sh) => {
    b.place(0, 0, 0, 0, UP); hull(b, sh, sections, 0.5, i < 4 ? '' : 'f'); b.pop();
  }));
  const rig = R.build(), I = rig.index;
  const FLICKS = [[1.75, 0.5], [2.42, 1], [2.82, 1], [4.3, 0.7]], whip = (u) => (u > 0 && u < 1 ? Math.sin(u * 6.283) * (1 - u) : 0); // when the tail flicks and how hard; a flick: there and back, once
  rig.animate = (t, P) => {
    // nibbles; stops, glances left and right; hops round; nibbles again
    const nib = Math.max(hold(1.15, 1.45, 2.2, 2.38, t), hold(3.85, 4.05, 5.3, 5.5, t)), alert = hold(2.25, 2.4, 3.1, 3.3, t);
    const glance = hold(2.78, 2.88, 3.04, 3.14, t) - hold(2.4, 2.5, 2.68, 2.78, t);
    const u = (t - 3.3) / 0.4, air = u > 0 && u < 1 ? 4 * u * (1 - u) : 0, turn = ss(3.3, 3.7, t);
    const crouch = hold(3.14, 3.26, 3.3, 3.36, t) + hold(3.66, 3.72, 3.76, 3.95, t), chew = nib * Math.sin(t * 40);
    P.pos(I.root, -0.3 + 0.6 * turn, RING.y - 1.3 + air * 0.65 - crouch * 0.07, RING.z - 0.3);
    P.rot(I.root, 0, 0.75 - 2.3 * turn, 0);
    P.rot(I.body, 0.08 * nib - 0.14 * alert + 0.2 * crouch - 0.12 * air, 0, 0);
    P.rot(I.head, 0.2 * nib + 0.03 * chew - 0.12 * alert + 0.15 * crouch, glance * 0.95, 0);
    P.rot(I.jaw, 0.2 * nib + 0.18 * chew, 0, 0);
    const spin = 6 * (Math.min(2.3, Math.max(1.2, t)) + Math.min(5.4, Math.max(3.9, t)));
    P.rot(I.nut, 0.2, spin, 0);
    for (let i = 0; i < 5; i++) {
      let flick = 0; // it runs up the tail
      for (const [t0, k] of FLICKS) flick += k * whip((t - t0 - 0.03 * i) / 0.34);
      const lean = CURL[i] + 0.05 * Math.sin(t * 2.2 - i * 0.5) + flick * (0.15 + 0.1 * i) + (i < 2 ? 0.3 * crouch - 0.25 * air : 0);
      P.rot(I[`tail${i}`], lean, 0.06 * Math.sin(t * 1.7 - i * 0.7), i < 2 ? -0.16 : 0); // (a little to one side: it shows from the front too)
    }
    for (const [s, n] of SIDES) {
      P.rot(I[`ear${n}`], -0.25 * alert + 0.1 * nib, 0, s * (0.12 * Math.sin(t * 9 + s) * (1 - alert) - 0.1 * alert));
      P.rot(I[`arm${n}`], 0.1 - 0.15 * nib + 0.2 * air, 0, 0); P.rot(I[`hand${n}`], 0.25 - 0.3 * nib, 0, 0);
      P.rot(I[`thigh${n}`], 0.55 * air - 0.2 * crouch, 0, 0); P.rot(I[`foot${n}`], 0.8 * air, 0, 0);
    }
    return 0.35 * alert + 0.4 * air;
  };
  rig.size = 1.4;
  return rig;
}

function carp() {
  const R = new RigBuilder(), SEG = 7, DROPS = 8, SIZE = 0.85, NECK = 0.46 * SIZE, LINK = 0.42 * SIZE, W = 0.28, H = 0.33; // segments, how much bigger than modelled, from the head to the first, between two, half width and height
  const girth = (i) => 1 - 0.62 * (Math.max(0, i - 1) / (SEG - 1)) ** 1.4; // the body tapers
  R.part('head', null, [0, 0, 0], (b, sh) => {
    hull(b, sh, [[-0.24, W, H, 0, 1], [0.02, 0.275, 0.315, 0], [0.26, 0.22, 0.24, -0.02], [0.43, 0.15, 0.15, -0.05], [0.5, 0.115, 0.1, -0.06]]);
    sh(0.45); b.cube(0, 0.3, 0.02, 0.32, 0.06, 0.36); // a patch of colour, as koi have
    sh(0.75); for (const s of [1, -1]) b.cube(0.275 * s, -0.03, -0.1, 0.03, 0.42, 0.2); // gill covers
    sh(2.5); for (const s of [1, -1]) b.cube(0.235 * s, 0.09, 0.22, 0.02, 0.11, 0.12);
    sh(0.6); b.cube(0, -0.03, 0.51, 0.23, 0.07, 0.08); // lips
    sh(1.4); for (const s of [1, -1]) b.beam(V(0.08 * s, -0.11, 0.5), V(0.13 * s, -0.26, 0.56), 0.03, 0.03); // the short barbels
  });
  R.part('jaw', 'head', [0, -0.12, 0.34], (b, sh) => { sh(0.6); b.cube(0, -0.02, 0.1, 0.21, 0.07, 0.22); });
  for (const [s, n] of SIDES) R.part(`barb${n}`, 'head', [0.13 * s, -0.11, 0.45], (b, sh) => { sh(1.4); b.beam(V(0, 0, 0), V(0.11 * s, -0.3, -0.1), 0.035, 0.035); });
  for (let i = 0; i < SEG; i++) {
    const a = girth(i + 1), f = 0.9 * girth(i); // each plate overlaps the next
    R.part(`s${i}`, null, [0, 0, 0], (b, sh) => {
      hull(b, sh, [[-0.26, W * a, H * a, 0, i % 2 ? 0.82 : 1], [0.26, W * f, H * f, 0]], 0.5, 'b');
      sh(0.45); // patches of colour
      if (i === 1) b.cube(0.1, H * a, 0, 0.26, 0.05, 0.36);
      if (i === 3) b.cube(0, H * a, -0.02, 0.4, 0.05, 0.4);
      if (i === 4) b.cube(-W * a, 0.05, 0, 0.05, 0.3, 0.34);
      if (i === 6) b.cube(0, H * a, 0, 0.16, 0.04, 0.3);
      if (i > 0 && i < 4) { // the dorsal fin: a sail on each of three segments
        const high = [0, 0.34, 0.3, 0.2][i], top = [V(0, H * a + high, 0.02), V(0, H * a + high * 0.85, -0.26)];
        fin(b, sh, V(0, H * f - 0.03, 0.26), [...top, V(0, H * a - 0.03, -0.26)], 0.03, top);
      }
      if (i === 3) for (const s of [1, -1]) fin(b, sh, V(0.12 * s, -H * a * 0.9, 0.1), [V(0.27 * s, -H * a - 0.2, -0.06), V(0.14 * s, -H * a - 0.16, -0.22)]); // pelvic fins
      if (i === 5) fin(b, sh, V(0, -H * a * 0.9, 0.1), [V(0, -H * a - 0.22, -0.06), V(0, -H * a - 0.12, -0.24)]); // anal fin
    });
  }
  for (const [s, n] of SIDES) R.part(`pec${n}`, 's0', [0.22 * s, -0.19, 0.14], (b, sh) => fin(b, sh, V(0, 0, 0), [V(0.46 * s, -0.02, -0.08), V(0.5 * s, -0.14, -0.34), V(0.2 * s, -0.2, -0.42)]));
  R.part('tail', `s${SEG - 1}`, [0, 0, -0.24], (b, sh) => {
    const tips = [V(0, 0.09, 0.02), V(0, 0.56, -0.58), V(0, 0.14, -0.36), V(0, 0, -0.26), V(0, -0.14, -0.36), V(0, -0.54, -0.56), V(0, -0.09, 0.02)];
    fin(b, sh, V(0, 0, 0), tips, 0.03, [tips[1], tips[2], tips[4], tips[5]]);
  });
  // the splash: drops, and rings widening on the water
  for (let j = 0; j < DROPS; j++) R.part(`drop${j}`, null, [0, 0, 0], (b, sh) => { sh(1.9); b.lathe([[0, -0.14], [0.12, -0.02], [0.06, 0.14], [0, 0.26]], 5); });
  for (let k = 0; k < 2; k++) R.part(`ripple${k}`, null, [0, 0, 0], (b, sh) => { sh(1.5); b.lathe([[1, 0], [0.92, 0]], 20); });
  const rig = R.build(), I = rig.index;
  // Its way: a wide bend under water, from behind the ring; a straight run through it, which is the leap (s from 0 to RUN); a tighter bend under water.
  const RUN = 3.4, BEND = 1.1, TURN = 1.0, HIGH = 2.3, DEEP = 1.0, POOL = RING.y - 0.85;
  const dx = Math.cos(0.38), dz = Math.sin(0.38), nx = dz, nz = -dx; // which way the leap goes, and the side the bends are on
  const path = (s, out) => {
    let q = s, n = 0;
    if (s < 0) { q = -BEND * Math.sin(-s / BEND); n = BEND * (1 - Math.cos(-s / BEND)); }
    else if (s > RUN) { q = RUN + TURN * Math.sin((s - RUN) / TURN); n = TURN * (1 - Math.cos((s - RUN) / TURN)); }
    const under = s < 0 ? -s : s - RUN, y = under < 0 ? 4 * HIGH * (s / RUN) * (1 - s / RUN) : -DEEP * (1 - Math.exp((-4 * HIGH * under) / (RUN * DEEP)));
    q -= RUN / 2 + 0.35;
    return out.set(dx * q + nx * n, POOL + y, RING.z + dz * q + nz * n);
  };
  const T0 = 1.45, AIR = 1.8, SPLASH = [[T0, path(0, V(0, 0, 0))], [T0 + AIR, path(RUN, V(0, 0, 0))]]; // when it leaves the water, how long it flies; when and where it splashes
  const Q = Array.from({ length: SEG + 2 }, () => V(0, 0, 0)), q2 = V(0, 0, 0), x = V(0, 0, 0), y = V(0, 0, 0), z = V(0, 0, 0), m = new THREE.Matrix4(), big = V(SIZE, SIZE, SIZE);
  rig.animate = (t, P) => {
    // points along the body, each following the head along the way; a wave runs down them, stronger in the water
    let s = (RUN / AIR) * (t - T0);
    for (let j = 0; j < Q.length; j++) {
      const p = path(s, Q[j]);
      path(s + 0.02, q2);
      const speed = q2.distanceTo(p) / 0.02, wet = ss(POOL + 0.3, POOL - 0.3, p.y);
      x.set(q2.z - p.z, 0, p.x - q2.x).normalize();
      p.addScaledVector(x, (0.03 + 0.19 * (j / (SEG + 1)) ** 2) * (0.45 + 0.55 * wet) * Math.sin(t * 11 - j * 0.85));
      s -= (j ? LINK : NECK) / speed;
    }
    for (let j = 0; j <= SEG; j++) {
      z.subVectors(Q[Math.max(0, j - 1)], Q[j + 1]).normalize();
      x.set(z.z, 0, -z.x).normalize(); y.crossVectors(z, x);
      P.direct(j ? I[`s${j - 1}`] : I.head, m.makeBasis(x, y, z).scale(big).setPosition(Q[j]));
    }
    const fly = ss(POOL - 0.1, POOL + 0.7, Q[0].y), gasp = hold(T0 + 0.5, T0 + 0.75, T0 + 1.1, T0 + 1.4, t);
    P.rot(I.jaw, 0.15 + 0.5 * gasp, 0, 0);
    P.rot(I.tail, 0, 0.45 * Math.sin(t * 11 - (SEG + 1.6) * 0.85), 0);
    for (const [k, n] of SIDES) {
      P.rot(I[`pec${n}`], 0, k * (0.75 - 0.95 * fly), k * (0.5 * fly + 0.12 * Math.sin(t * 7 + k)));
      P.rot(I[`barb${n}`], 0.5 * fly + 0.2 * Math.sin(t * 6 + k), 0, 0);
    }
    for (let j = 0; j < DROPS; j++) {
      let k = 0;
      for (const [t0, from] of SPLASH) {
        const u = t - t0, up = 3.3 + 1.1 * Math.sin(j * 2.4), out = 0.75 + 0.5 * Math.cos(j * 1.7), a = j * 0.8 + t0;
        if (u <= 0 || u >= up / 4.5) continue;
        k = 1.5 * ss(0, 0.08, u) * (1 - 0.4 * u * 4.5 / up);
        m.makeScale(k, k, k).setPosition(from.x + (Math.cos(a) * out + dx * 0.6) * u, from.y + up * u - 4.5 * u * u, from.z + (Math.sin(a) * out + dz * 0.6) * u);
      }
      if (!k) m.makeScale(0, 0, 0);
      P.direct(I[`drop${j}`], m);
    }
    for (let j = 0; j < 2; j++) {
      let k = 0;
      for (const [t0, from] of SPLASH) {
        const u = (t - t0 - 0.16 * j) / 0.95;
        if (u <= 0 || u >= 1) continue;
        k = 0.3 + 1.2 * (1 - (1 - u) * (1 - u));
        m.makeScale(k, 1, k).setPosition(from.x, from.y, from.z);
      }
      if (!k) m.makeScale(0, 0, 0);
      P.direct(I[`ripple${j}`], m);
    }
    return Math.max(hold(T0 + 0.35, T0 + 0.7, T0 + 1.0, T0 + 1.4, t), 0.6 * hold(T0 + AIR - 0.05, T0 + AIR + 0.05, T0 + AIR + 0.1, T0 + AIR + 0.5, t));
  };
  return rig;
}

function eagle() {
  const R = new RigBuilder();
  R.part('body', null, [0, 0, 0], (b, sh) => {
    hull(b, sh, [[-0.58, 0.1, 0.08, 0.04, 0.8], [-0.3, 0.21, 0.19, 0.01], [0.05, 0.27, 0.27, -0.02], [0.32, 0.24, 0.25, -0.01], [0.52, 0.14, 0.15, 0.06]]);
    sh(2.3); b.cube(0, -0.27, 0.2, 0.16, 0.05, 0.2); // the core in the breast
  });
  // white head, hooked beak
  R.part('head', 'body', [0, 0.1, 0.46], (b, sh) => {
    hull(b, sh, [[-0.1, 0.15, 0.16, 0.02, 1.3], [0.12, 0.19, 0.19, 0.12], [0.36, 0.18, 0.17, 0.16], [0.5, 0.12, 0.11, 0.14]]);
    sh(0.95); b.beam(V(0, 0.17, 0.46), V(0, 0.12, 0.76), 0.14, 0.14); b.beam(V(0, 0.15, 0.73), V(0, -0.04, 0.8), 0.1, 0.09);
    sh(0.5); for (const s of [1, -1]) b.beam(V(0.19 * s, 0.26, 0.22), V(0.15 * s, 0.22, 0.5), 0.06, 0.06); // brows
    sh(2.6); for (const s of [1, -1]) b.cube(0.182 * s, 0.18, 0.38, 0.02, 0.07, 0.1);
  });
  R.part('jaw', 'head', [0, 0.08, 0.48], (b, sh) => { sh(0.9); b.beam(V(0, 0, 0), V(0, -0.02, 0.24), 0.09, 0.05); });
  R.part('tail', 'body', [0, 0.03, -0.5], (b, sh) => { sh(1.3); blade(b, V(0, 0, 0.05), V(0, -0.02, -0.78), 0.2, 0.26); });
  for (const [s, n] of SIDES) {
    R.part(`tail${n}`, 'tail', [0.04 * s, -0.012, 0], (b, sh) => {
      sh(1.15); blade(b, V(0, 0, 0.04), V(0.2 * s, -0.01, -0.74), 0.18, 0.24);
      sh(1.3); blade(b, V(0.03 * s, -0.012, 0.03), V(0.4 * s, -0.02, -0.66), 0.17, 0.22);
    });
    // a wing: three bones, a row of feathers on each of the first two, five fingers at the tip
    const bone = (b, sh, to, w) => { sh(1.2); b.beam(V(0, 0, 0), to, w, w); sh(0.6); b.rod(V(0, -w * 0.8, 0), V(0, w * 0.8, 0), w, 6); };
    const row = (b, sh, count, x0, dx, z0, dz, len, w) => {
      for (let i = 0; i < count; i++) { sh(i % 2 ? 0.72 : 0.88); blade(b, V((x0 + dx * i) * s, -0.012 * i - 0.01, z0 + dz * i), V((x0 + dx * i + 0.05) * s, -0.012 * i - 0.03, -len), w, w * 0.9); }
    };
    R.part(`arm${n}`, 'body', [0.2 * s, 0.14, 0.22], (b, sh) => {
      bone(b, sh, V(0.62 * s, 0, -0.06), 0.09);
      row(b, sh, 3, 0.1, 0.2, -0.04, -0.02, 0.8, 0.25);
      sh(1); blade(b, V(0.02 * s, 0.04, -0.14), V(0.62 * s, 0.04, -0.2), 0.3, 0.3);
    });
    R.part(`fore${n}`, `arm${n}`, [0.62 * s, 0, -0.06], (b, sh) => {
      bone(b, sh, V(0.72 * s, 0, 0.1), 0.08);
      row(b, sh, 4, 0.08, 0.18, -0.04, 0.035, 0.84, 0.23);
      sh(1); blade(b, V(0.02 * s, 0.04, -0.14), V(0.72 * s, 0.04, -0.04), 0.3, 0.3);
    });
    R.part(`hand${n}`, `fore${n}`, [0.72 * s, 0, 0.1], (b, sh) => {
      bone(b, sh, V(0.3 * s, 0, -0.06), 0.07);
      sh(1); blade(b, V(0, 0.04, -0.12), V(0.3 * s, 0.04, -0.14), 0.24, 0.2);
    });
    [25, 44, 62, 79, 95].forEach((deg, k) => R.part(`p${k}${n}`, `hand${n}`, [(0.04 + 0.065 * k) * s, -0.01 - 0.012 * k, -0.03 - 0.008 * k], (b, sh) => {
      const a = (deg * Math.PI) / 180, len = [0.95, 1.1, 1.18, 1.12, 0.96][k];
      sh(k % 2 ? 0.72 : 0.88); blade(b, V(0, 0, 0), V(Math.sin(a) * len * s, 0, -Math.cos(a) * len), 0.25, 0.13);
    }));
    R.part(`leg${n}`, 'body', [0.13 * s, -0.16, -0.08], (b, sh) => {
      sh(0.85); b.beam(V(0, 0.04, 0), V(0, -0.3, 0.06), 0.17, 0.2);
      sh(1.45); b.beam(V(0, -0.28, 0.06), V(0, -0.5, 0.1), 0.06, 0.06);
    });
    R.part(`claw${n}`, `leg${n}`, [0, -0.5, 0.1], (b, sh) => {
      for (const [tx, tz] of [[0.09, 0.17], [0, 0.2], [-0.09, 0.17], [0, -0.13]]) {
        const l = Math.hypot(tx, tz), ux = tx / l, uz = tz / l;
        sh(1.45); b.beam(V(0, 0, 0), V(tx, -0.05, tz), 0.045, 0.045);
        sh(0.4); b.tri(V(tx, -0.02, tz), V(tx + ux * 0.07, -0.07, tz + uz * 0.07), V(tx + ux * 0.02, -0.17, tz + uz * 0.02)); // talon
      }
    });
  }
  const rig = R.build(), I = rig.index;
  rig.animate = (t, P) => {
    // comes down into the ring, wings held high; three great beats; then hangs on the wind, wings wide
    const open = ss(1.0, 1.5, t), soar = ss(3.2, 3.75, t), flap = open * (1 - soar), glide = open * soar, drop = 1 - open;
    const ph = t < 1.5 ? 0 : ((t - 1.5) / 0.6) % 1, w = ph < 0.4 ? ph / 0.8 : 0.5 + (ph - 0.4) / 1.2; // the beat: down quickly, up slowly
    const c = (lag) => Math.cos(6.283 * (w - lag)), up = Math.max(0, Math.sin(6.283 * (w - 0.5))) * flap;
    const pitch = -0.35 * drop - 0.6 * flap - 0.48 * glide, sway = -glide * Math.sin((t - 3.4) * 2.4);
    P.pos(I.body, 0.3 * sway, RING.y + 0.1 + drop * 1.4 - flap * 0.2 * c(0.12) + glide * 0.35 * ss(3.3, 5.2, t), RING.z - 0.3 - drop * 0.8);
    P.rot(I.body, pitch, 0.1 * sway, 0.22 * sway);
    const cry = hold(3.85, 4.0, 4.4, 4.6, t);
    P.rot(I.head, -pitch * 0.85 - cry * 0.25, glide * 0.7 * Math.sin((t - 3.3) * 2.6), -0.1 * sway);
    P.rot(I.jaw, cry * 0.5, 0, 0);
    P.rot(I.tail, -0.4 * flap - 0.15 * glide + 0.12 * flap * c(0.3), 0, 0);
    const fan = 0.3 * flap + 0.2 * glide - 0.2 * drop;
    for (const [s, n] of SIDES) {
      P.rot(I[`tail${n}`], 0, -s * fan, 0);
      P.rot(I[`arm${n}`], 0, s * (0.3 * drop + 0.12 * up), s * (0.85 * drop + flap * (0.1 + 0.58 * c(0)) + glide * 0.12));
      P.rot(I[`fore${n}`], 0, s * (-0.3 * drop + 0.3 * up), s * (0.15 * drop + flap * (-0.1 + 0.34 * c(0.18)) + glide * 0.04));
      P.rot(I[`hand${n}`], 0, s * (0.5 * drop + 0.35 * up), s * (0.1 * drop + flap * (-0.04 + 0.3 * c(0.3)) + glide * 0.08));
      for (let k = 0; k < 5; k++) P.rot(I[`p${k}${n}`], 0, -s * (drop * 0.5 + 0.3 * up) * (k / 4 - 0.1), s * (flap * (0.05 + 0.26 * c(0.42)) * (0.5 + k / 8) + glide * (0.08 + 0.05 * k + 0.03 * Math.sin(t * 9 + k))));
      P.rot(I[`leg${n}`], 0.2 * drop - 0.35 * flap + 1.2 * glide, 0, 0);
      P.rot(I[`claw${n}`], -0.3 * (drop + flap) + 0.5 * glide, 0, 0);
    }
    return Math.max(flap * 0.5 * Math.max(0, -c(0.25)), cry);
  };
  rig.size = 1.05;
  return rig;
}

function panda() {
  const R = new RigBuilder(), UP = -Math.PI / 2, DARK = 0.3;
  // round and heavy: the belly is a ball it can roll on (the part turns about its centre)
  R.part('body', null, [0, 0, 0], (b, sh) => {
    b.place(0, 0, 0, 0, UP);
    hull(b, sh, [[-0.52, 0.34, 0.3, 0, 1.1], [-0.36, 0.5, 0.46, 0], [-0.05, 0.6, 0.55, 0], [0.26, 0.56, 0.5, 0.02, DARK], [0.5, 0.44, 0.38, 0.03], [0.66, 0.3, 0.26, 0.03]]);
    b.pop();
    sh(1.1); b.cube(0, -0.3, -0.52, 0.18, 0.16, 0.14); // tail
  });
  R.part('head', 'body', [0, 0.6, 0.06], (b, sh) => {
    hull(b, sh, [[-0.3, 0.26, 0.24, 0.27, 1.15], [-0.1, 0.41, 0.36, 0.29], [0.14, 0.43, 0.37, 0.28], [0.32, 0.33, 0.29, 0.23], [0.4, 0.2, 0.16, 0.16]]);
    sh(1.2); b.cube(0, 0.13, 0.43, 0.28, 0.2, 0.18); // muzzle
    sh(DARK); b.cube(0, 0.19, 0.53, 0.12, 0.08, 0.04);
    for (const s of [1, -1]) { // the patches round the eyes, slanting, and the eyes
      b.place(0.18 * s, 0.33, 0.37, 0.35 * s, -0.25, 0.5 * s);
      sh(DARK); b.cube(0, 0, 0, 0.15, 0.22, 0.05); sh(2.4); b.cube(0, 0.02, 0.03, 0.05, 0.05, 0.02);
      b.pop();
    }
  });
  R.part('jaw', 'head', [0, 0.06, 0.32], (b, sh) => { sh(1.05); b.cube(0, -0.02, 0.1, 0.22, 0.07, 0.2); });
  for (const [s, n] of SIDES) {
    R.part(`ear${n}`, 'head', [0.31 * s, 0.58, -0.02], (b, sh) => { sh(DARK); b.rod(V(0, 0.07, -0.05), V(0, 0.07, 0.05), 0.15, 10); });
    R.part(`arm${n}`, 'body', [0.5 * s, 0.36, 0.1], (b, sh) => { sh(DARK); b.beam(V(0, 0, 0), V(0.06 * s, -0.3, 0.3), 0.24, 0.26); sh(0.2); b.rod(V(-0.14 * s, 0, 0), V(0.14 * s, 0, 0), 0.14, 8); });
    R.part(`fore${n}`, `arm${n}`, [0.06 * s, -0.3, 0.3], (b, sh) => {
      sh(DARK); b.beam(V(0, 0, 0), V(-0.2 * s, 0.16, 0.26), 0.21, 0.23); b.cube(-0.22 * s, 0.18, 0.3, 0.24, 0.22, 0.2);
      sh(0.2); b.rod(V(-0.13 * s, 0, 0), V(0.13 * s, 0, 0), 0.12, 8);
    });
    R.part(`leg${n}`, 'body', [0.36 * s, -0.36, 0.2], (b, sh) => {
      sh(DARK); b.beam(V(0, 0, 0), V(0.14 * s, -0.02, 0.5), 0.27, 0.27); b.cube(0.14 * s, 0.05, 0.56, 0.28, 0.36, 0.14);
      sh(0.9); b.cube(0.14 * s, 0, 0.635, 0.15, 0.13, 0.02); for (const k of [-1, 0, 1]) b.cube((0.14 + 0.08 * k) * s, 0.15, 0.635, 0.055, 0.06, 0.02); // pads
    });
  }
  R.part('bamboo', 'foreR', [0.22, 0.2, 0.32], (b, sh) => {
    const u = V(0.55, 0.8, -0.1).normalize(), at = (k) => u.clone().multiplyScalar(k);
    sh(1.15); b.rod(at(-0.85), at(0.48), 0.065, 6);
    sh(0.6); for (const k of [-0.55, -0.2, 0.15]) b.rod(at(k - 0.025), at(k + 0.025), 0.085, 6);
    sh(1.45); for (const [k, x, y] of [[-0.55, -0.44, 0.12], [-0.55, -0.24, -0.38], [-0.2, -0.38, 0.32]]) b.tri(at(k), at(k).add(V(x, y, 0.05)), at(k).add(V(x * 0.5 - y * 0.28, y * 0.5 + x * 0.28, 0.02))); // leaves
  });
  const rig = R.build(), I = rig.index;
  rig.animate = (t, P) => {
    // sits munching its bamboo; looks up and waves a paw; leans too far back, rolls onto its back and rocks there, legs in the air
    const hello = hold(2.0, 2.3, 3.0, 3.3, t), back = ss(3.05, 3.7, t), wave = Math.max(hello, hold(3.9, 4.1, 4.9, 5.2, t));
    const lean = 0.1 - 0.1 * hello + back * (0.5 + 0.35 * Math.cos((t - 3.7) * 5)), munch = 1 - Math.max(hello, back);
    const chew = Math.sin(t * 16), tug = Math.max(0, Math.sin(t * 3.4 - 0.5)) * munch;
    P.pos(I.body, 0, RING.y - 0.9, RING.z - 0.7 - 0.75 * (lean - 0.1));
    P.rot(I.body, -lean, 0.15, back * 0.1 * Math.sin(t * 3.3) + 0.04 * Math.sin(t * 1.9));
    P.rot(I.head, 0.22 * munch - 0.1 * hello + 0.55 * back * lean + 0.03 * chew - 0.12 * tug, -0.3 * hello, 0.08 * Math.sin(t * 1.9) + 0.12 * tug + 0.15 * hello * Math.sin(t * 5));
    P.rot(I.jaw, 0.14 + 0.12 * chew * (1 - hello) + 0.1 * hello, 0, 0);
    for (const [s, n] of SIDES) {
      P.rot(I[`ear${n}`], 0, 0, s * 0.12 * Math.sin(t * 7 + s * 2));
      P.rot(I[`leg${n}`], -0.5 * back * lean + 0.22 * back * Math.sin(t * 6 + s * 1.6) + 0.04 * Math.sin(t * 2.7 + s), 0, 0);
    }
    P.rot(I.armR, -0.25 + 0.12 * tug + 0.3 * hello, 0, 0); P.rot(I.foreR, -0.1 + 0.2 * tug + 0.3 * hello, 0, 0);
    P.rot(I.armL, -0.45 - 1.2 * wave, 0, 1.0 * wave); P.rot(I.foreL, -0.5 + 0.3 * wave, 0, wave * (-0.2 + 0.6 * Math.sin(t * 11)));
    return 0.5 * wave;
  };
  rig.size = 1.55;
  return rig;
}

function elephant() {
  const R = new RigBuilder(), TRUNK = 7, HANG = [-0.25, 0.1, 0.1, 0, -0.2, -0.35, -0.4], CALL = [-1.75, -0.6, -0.45, -0.25, 0.1, 0.45, 0.6]; // trunk segments; how each bends on the one before: hanging, raised to trumpet
  R.part('root', null, [0, 0, 0]);
  R.part('body', 'root', [0, 1.55, 0], (b, sh) => {
    hull(b, sh, [[-0.98, 0.36, 0.42, 0.02, 1], [-0.7, 0.54, 0.6, 0.02], [-0.1, 0.58, 0.62, 0], [0.5, 0.56, 0.64, 0.06], [0.9, 0.42, 0.5, 0.12]], 0.4);
    sh(0.75); b.cube(0, 0.62, -0.1, 0.84, 0.06, 1.1); for (const s of [1, -1]) b.cube(0.58 * s, 0.3, -0.1, 0.05, 0.66, 1.1); // a cloth over its back
    sh(1.5); for (const s of [1, -1]) b.cube(0.6 * s, 0, -0.1, 0.05, 0.08, 1.14);
  });
  R.part('head', 'body', [0, 0.3, 0.92], (b, sh) => {
    hull(b, sh, [[-0.2, 0.4, 0.44, 0.1, 1], [0.1, 0.46, 0.5, 0.14], [0.4, 0.4, 0.44, 0.08], [0.62, 0.26, 0.3, -0.06]], 0.4);
    sh(2.3); b.cube(0, 0.36, 0.54, 0.16, 0.16, 0.05); // the core, on its brow
    sh(2.6); for (const s of [1, -1]) b.cube(0.41 * s, 0.16, 0.36, 0.02, 0.07, 0.1);
    for (const s of [1, -1]) { // tusks
      const p = [V(0.22 * s, -0.26, 0.48), V(0.3 * s, -0.62, 0.8), V(0.32 * s, -0.68, 1.15), V(0.28 * s, -0.52, 1.46)];
      sh(0.55); b.rod(p[0], p[0].clone().lerp(p[1], 0.35), 0.1, 6);
      sh(1.5); for (let i = 0; i < 3; i++) b.beam(p[i], p[i + 1], 0.11 - i * 0.02, 0.11 - i * 0.02);
    }
  });
  R.part('jaw', 'head', [0, -0.34, 0.3], (b, sh) => { sh(0.8); b.cube(0, -0.06, 0.14, 0.3, 0.14, 0.36); });
  for (const [s, n] of SIDES) {
    R.part(`ear${n}`, 'head', [0.42 * s, 0.3, -0.02], (b, sh) => {
      const tips = [V(0.02 * s, 0.22, -0.02), V(0.68 * s, 0.3, -0.08), V(1.1 * s, -0.08, -0.12), V(1.02 * s, -0.62, -0.12), V(0.56 * s, -1.08, -0.08), V(0.06 * s, -0.62, -0.02)];
      fin(b, sh, V(0, 0, 0), tips, 0.05, tips.slice(1, 5), 0.92);
    });
    for (const [f, z, bend] of [['f', 0.6, 0], ['h', -0.62, 0.06]]) {
      const leg = (b, sh, to, w, d) => { sh(1); b.beam(V(0, 0, 0), to, w, d); sh(0.6); b.rod(V(-w * 0.6, 0, 0), V(w * 0.6, 0, 0), d * 0.38, 6); };
      R.part(`${f}u${n}`, 'body', [0.36 * s, -0.3, z], (b, sh) => leg(b, sh, V(0, -0.6, -bend), 0.34, 0.38));
      R.part(`${f}l${n}`, `${f}u${n}`, [0, -0.6, -bend], (b, sh) => {
        leg(b, sh, V(0, -0.55, bend), 0.3, 0.32);
        sh(0.8); b.cylinder(0, -0.65, bend, 0.22, 0.2, 0.14, 6, { capTop: false, capBottom: true });
        if (f === 'f') { sh(1.5); for (const k of [-1, 0, 1]) b.cube(0.1 * k, -0.61, bend + 0.2, 0.07, 0.08, 0.04); } // nails
      });
    }
  }
  for (let i = 0; i < TRUNK; i++) {
    const w = (k) => 0.21 - 0.115 * (k / TRUNK);
    R.part(`t${i}`, i ? `t${i - 1}` : 'head', i ? [0, -0.27, 0] : [0, -0.06, 0.62], (b, sh) => {
      b.place(0, 0, 0, 0, Math.PI / 2);
      hull(b, sh, [[-0.05, w(i), w(i) * 0.95, 0, i % 2 ? 0.82 : 1], [0.3, w(i + 1), w(i + 1) * 0.95, 0]], 0.4, i === TRUNK - 1 ? 'f' : '');
      hull(b, sh, [[-0.05, w(i) * 1.15, w(i) * 1.1, 0, 0.55], [0.05, w(i) * 1.15, w(i) * 1.1, 0]], 0.4, ''); // the collar of the joint
      b.pop();
    });
  }
  R.part('tail', 'body', [0, 0.2, -0.98], (b, sh) => { sh(1); b.beam(V(0, 0, 0), V(0, -0.7, -0.12), 0.07, 0.07); sh(0.5); b.cube(0, -0.76, -0.13, 0.12, 0.2, 0.1); });
  const rig = R.build(), I = rig.index;
  rig.animate = (t, P) => {
    // stands swaying, ears flapping; lifts a front foot, throws its trunk up and trumpets; stamps the foot down again
    const lift = hold(1.45, 2.15, 4.05, 4.42, t), call = hold(1.9, 2.7, 3.9, 4.6, t), blast = call * (0.75 + 0.25 * Math.sin(t * 22)), stamp = hold(4.36, 4.44, 4.48, 4.8, t);
    P.pos(I.root, -0.25, RING.y - 2.4 - stamp * 0.06, RING.z - 0.8);
    P.rot(I.root, -0.09 * call, 0.95, 0.03 * Math.sin(t * 1.6) * (1 - call));
    P.rot(I.head, 0.12 - 0.42 * call + 0.03 * Math.sin(t * 2.3) + 0.08 * stamp, 0.12 * Math.sin(t * 1.3) * (1 - call), 0);
    P.rot(I.jaw, 0.1 + 0.4 * blast, 0, 0);
    for (const [s, n] of SIDES) {
      P.rot(I[`ear${n}`], 0, s * (0.95 + 0.4 * Math.sin(t * 3.4 + s * 0.4) * (1 - call) - 0.8 * call + 0.05 * call * Math.sin(t * 31)), 0);
      P.rot(I[`hu${n}`], 0.07 * call, 0, 0); P.rot(I[`hl${n}`], -0.1 * call, 0, 0);
    }
    P.rot(I.fuR, -0.95 * lift, 0, 0); P.rot(I.flR, 1.45 * lift, 0, 0);
    P.rot(I.fuL, 0.08 * call, 0, 0);
    for (let i = 0; i < TRUNK; i++) {
      const up = ss(0, 1, call * 1.6 - 0.6 * (1 - i / (TRUNK - 1))); // it curls up from the tip, the root follows
      P.rot(I[`t${i}`], HANG[i] * (1 - up) + CALL[i] * up + 0.13 * Math.sin(t * 2.4 - i * 0.6) * (1 - call) + 0.03 * call * Math.sin(t * 24 - i), 0, 0.07 * Math.sin(t * 1.7 - i * 0.5) * (1 - call));
    }
    P.rot(I.tail, 0.25 + 0.2 * Math.sin(t * 3.1), 0, 0.45 * Math.sin(t * 4.3));
    return blast;
  };
  rig.size = 1.42;
  return rig;
}

/**
 * The mushroom cloud, made of light like the animals — for those who found every relic of the world before (it
 * is no animal: nothing counts days for it). A flash at the foot of the ring; a ring of dust runs over the ground;
 * a stem of golden drums rises, each out of the one under it, to the top of the ring; a cap swells on it, its rim a
 * rolling tube of plates around a white-hot seam; a collar of cloud rings the stem; embers fly off and fall.
 */
function mushroom() {
  const R = new RigBuilder(), STEM = 6, ROLL = 8, EMBERS = 6, Z = RING.z - 0.35, RC = 1.5, TUBE = 0.56, DRUM = 0.76;
  for (let i = 0; i < STEM; i++) {
    R.part(`stem${i}`, null, [0, 0, Z], (b, sh) => {
      // (a drum of the stem: narrower going up — the foot of the cloud is wide —, a glowing band round its top)
      const r = i ? 0.44 - 0.03 * i : 0.62;
      sh(i % 2 ? 0.86 : 1); b.cylinder(0, 0, 0, r + (i ? 0.03 : 0.42), r, DRUM, 12, { capTop: false });
      sh(1.25); b.cylinder(0, DRUM - 0.06, 0, r + 0.035, r + 0.035, 0.06, 12, { capTop: false, capBottom: true });
      if (!i) { sh(0.6); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; b.beam(V(Math.cos(a) * 0.62, 0.02, Math.sin(a) * 0.62), V(Math.cos(a) * 1.18, 0.02, Math.sin(a) * 1.18), 0.16, 0.08); } } // (its roots, flat on the ground)
    });
  }
  R.part('cap', null, [0, 0, Z], (b, sh) => {
    sh(1); b.lathe([[RC + 0.16, 0.12], [RC + 0.08, 0.6], [1.18, 1.0], [0.7, 1.28], [0.3, 1.38], [0, 1.4]], 16); // its dome
    sh(0.82); b.lathe([[RC - 0.05, 0.62], [RC - 0.15, 0.7]], 16); // a fold of cloud round the dome
    sh(0.7); b.lathe([[0.3, -0.42], [0.86, -0.3], [RC - 0.3, 0.04]], 16); // its belly, over the stem
    sh(2.6); b.lathe([[RC - TUBE + 0.1, -0.18], [RC - TUBE - 0.04, 0], [RC - TUBE + 0.1, 0.18]], 16); // the white-hot seam inside the tube
    sh(2.2); b.cylinder(0, 1.36, 0, 0.22, 0.05, 0.18, 8); // a spark on its top
  });
  for (let k = 0; k < ROLL; k++) {
    R.part(`roll${k}`, 'cap', [0, 0, 0], (b, sh) => {
      // (a plate of the tube round the rim: a short drum lying along the rim, a ridge on it that rolls over)
      const half = RC * Math.tan(Math.PI / ROLL) + 0.04;
      sh(k % 2 ? 0.86 : 1); b.rod(V(-half, 0, 0), V(half, 0, 0), TUBE, 9);
      sh(1.7); b.beam(V(-half * 0.92, TUBE - 0.02, 0), V(half * 0.92, TUBE - 0.02, 0), 0.16, 0.08);
      sh(0.55); b.beam(V(-half * 0.92, -TUBE + 0.02, 0), V(half * 0.92, -TUBE + 0.02, 0), 0.12, 0.06);
    });
  }
  R.part('collar', null, [0, 0, Z], (b, sh) => { sh(1.45); b.lathe([[1, -0.04], [0.86, 0.07], [0.68, 0.02], [0.66, -0.03]], 18); });
  for (let j = 0; j < 2; j++) R.part(`dust${j}`, null, [0, 0, Z], (b, sh) => { sh(j ? 1 : 1.35); b.lathe([[1, 0], [0.93, 0.07], [0.86, 0.02]], 22); });
  for (let j = 0; j < EMBERS; j++) R.part(`ember${j}`, null, [0, 0, Z], (b, sh) => { sh(2.3); b.lathe([[0, -0.15], [0.1, 0], [0, 0.15]], 5); });
  R.part('flash', null, [0, 0, Z], (b, sh) => { sh(2.9); b.lathe([[0, -0.62], [0.46, -0.44], [0.62, 0], [0.46, 0.44], [0, 0.62]], 10); });
  const rig = R.build(), I = rig.index, m = new THREE.Matrix4(), none = () => m.makeScale(0, 0, 0);
  rig.animate = (t, P) => {
    // the stem: up in a second and a half, each drum out of the one under it (the narrower nest in the wider)
    const rise = 1 - Math.exp(-Math.max(0, t - 0.85) / 0.75), top = 0.7 + (STEM - 1) * (DRUM - 0.05) * rise;
    for (let i = 0; i < STEM; i++) P.direct(I[`stem${i}`], m.makeTranslation(0, ((top - 0.7) * i) / (STEM - 1), Z));
    // the cap: rides on the stem and swells; its tube rolls outwards, over and over
    const grow = 0.25 + 0.8 * (1 - Math.exp(-Math.max(0, t - 0.9) / 0.8)), breathe = 1 + 0.03 * Math.sin(t * 3.1);
    P.direct(I.cap, m.makeScale(grow * breathe, grow, grow * breathe).setPosition(0, top + DRUM - 0.1 + 0.4 * grow, Z));
    for (let k = 0; k < ROLL; k++) { const a = ((k + 0.5) * 2 * Math.PI) / ROLL; P.pos(I[`roll${k}`], RC * Math.sin(a), 0, RC * Math.cos(a)); P.rot(I[`roll${k}`], -2.6 * t, a, 0); }
    // a collar of cloud rings the stem half-way up, once it is there, and widens
    const c = ss(1.5, 1.8, t), w = 0.7 + 1.1 * ss(1.5, 3.4, t);
    P.direct(I.collar, c ? m.makeScale(w * c, 1, w * c).setPosition(0, 0.5 * top + 0.4, Z) : none());
    // two rings of dust run over the ground, one after the other
    for (let j = 0; j < 2; j++) { const u = (t - 0.7 - 0.28 * j) / 1.5, k = u > 0 && u < 1 ? 0.5 + 3.3 * (1 - (1 - u) ** 2) : 0; P.direct(I[`dust${j}`], k ? m.makeScale(k, 1 - 0.6 * u, k).setPosition(0, 0.03, Z) : none()); }
    // embers fly off the cap and fall
    for (let j = 0; j < EMBERS; j++) {
      const u = t - 1.6 - 0.17 * j, a = j * 2.4 + 0.5, v = 1.9 + 0.45 * (j % 3), s = u > 0 && u < 1.3 ? ss(0, 0.12, u) * (1 - ss(0.95, 1.3, u)) : 0;
      P.direct(I[`ember${j}`], s ? m.makeScale(s, s, s).setPosition(Math.cos(a) * v * u, top + 1.1 + 2.6 * u - 3.4 * u * u, Z + Math.sin(a) * v * u * 0.6) : none());
    }
    // the flash, at the foot, before anything else
    const f = hold(0.62, 0.82, 1.0, 1.55, t) * (1 + 0.7 * ss(0.62, 1.4, t));
    P.direct(I.flash, f ? m.makeScale(f, f, f).setPosition(0, 0.75, Z) : none());
    return Math.max(hold(0.62, 0.85, 1.05, 1.7, t), 0.32 * hold(1.5, 2.1, 3.7, 4.7, t)); // (the ring and the plates: the flash, then a warm glow)
  };
  return rig;
}

export const BUILDERS = { deer, wolf, tiger, dragon, goldfish, squirrel, carp, eagle, panda, elephant, mushroom };
