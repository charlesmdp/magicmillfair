// Emotes of light: a sun-coloured ring opens above the player, a mechanical animal appears in it, moves for a
// few seconds and fades away. Four of them: a stag that rears, a wolf that howls, a tiger that leaps through
// the ring, a dragon that coils around it.
// Each animal is ONE mesh: rigid parts (plates, drums, beams) that the vertex shader moves with one matrix per
// part, so an emote costs two draw calls (the animal, the ring) whatever its number of pieces.
import * as THREE from 'three';
import { makeMaterial, GLSL_COMMON, GLSL_LIGHTING } from '../render/globals.js';
import { MeshBuilder } from '../world/props/MeshBuilder.js';

export const RANK_DURATION = 5.6; // seconds
const MAX_PARTS = 28;
const RING = { y: 3.75, z: -1.55, r: 2.55 }; // centre of the ring, above and behind the player (who faces +Z), and its radius
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 0 → 1 between a and b, back to 0 between c and d. */
const hold = (a, b, c, d, x) => ss(a, b, x) * (1 - ss(c, d, x));

// ---------------------------------------------------------------------------
// Rigs

class RigBuilder {
  constructor() { this.b = new MeshBuilder(); this.parts = []; this.index = {}; }

  /** A rigid part hanging from `parent` at `pivot` (in the parent's frame); `draw(b, shade)` models it around its pivot. */
  part(name, parent, pivot, draw = () => {}) {
    const id = this.parts.length;
    if (id >= MAX_PARTS) throw new Error('RankEmotes: too many parts');
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
    P.pos(I.root, 0, RING.y - 2.05 + rear * 0.15, RING.z - 0.75);
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
    P.pos(I.root, 0, RING.y - 1.75, RING.z - 0.8);
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
    const roar = hold(2.9, 3.3, 4.3, 4.8, t), y0 = RING.y - 1.2;
    P.pos(I.root, 0, y0 * (1 - leap) + 0.02 * leap + air * 1.15 - crouch * 0.22 - land * 0.16, RING.z - 0.3 + leap * 5.0);
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
  return rig;
}

function dragon() {
  const R = new RigBuilder(), SEG = 16, LINK = 0.47; // segments, and the distance between two of them
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
  const TUBE = 0.82, TH = 0.7, PS = 1.9;
  const coil = (u, out) => {
    const th = u * TH + 2.4, ps = u * PS, rr = RING.r + TUBE * Math.cos(ps);
    return out.set(rr * Math.cos(th), RING.y + rr * Math.sin(th), RING.z + TUBE * Math.sin(ps));
  };
  const p = V(0, 0, 0), q = V(0, 0, 0), up = V(0, 0, 0), x = V(0, 0, 0), y = V(0, 0, 0), zz = V(0, 0, 0), m = new THREE.Matrix4();
  /** Frame of the coil at u (z along it, y away from the ring); returns how fast the coil runs there (m per unit of u). */
  const frame = (u, lift = 0) => {
    coil(u, p); coil(u + 0.02, q);
    zz.subVectors(q, p);
    const speed = zz.length() / 0.02;
    zz.normalize();
    const th = u * TH + 2.4;
    up.set(p.x - RING.r * Math.cos(th), p.y - RING.y - RING.r * Math.sin(th), p.z - RING.z).normalize();
    x.crossVectors(up, zz).normalize(); y.crossVectors(zz, x);
    m.makeBasis(x, y, zz).setPosition(p.x + y.x * lift, p.y + y.y * lift, p.z + y.z * lift);
    return speed;
  };
  rig.animate = (t, P) => {
    const roar = hold(3.0, 3.4, 4.2, 4.7, t);
    // quick at first, slower while it roars
    let u = t * 1.25 - ss(3.0, 4.6, t) * (t - 3.0) * 0.45;
    let speed = frame(u, 0.05);
    P.direct(I.head, m);
    u -= 0.52 / speed;
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

const BUILDERS = { deer, wolf, tiger, dragon };

/** Matrices of a rig for one instant. */
class Pose {
  constructor(parts) {
    this.parts = parts;
    const n = parts.length;
    this.rotation = new Float32Array(n * 3);
    this.position = new Float32Array(n * 3);
    this.given = new Array(n).fill(null);
    this.world = Array.from({ length: n }, () => new THREE.Matrix4());
    this.matrices = new Float32Array(MAX_PARTS * 16);
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._m = new THREE.Matrix4();
    this.reset();
  }
  reset() {
    this.rotation.fill(0);
    this.given.fill(null);
    for (let i = 0; i < this.parts.length; i++) this.position.set(this.parts[i].pivot, i * 3);
  }
  rot(i, x, y, z) { this.rotation[i * 3] = x; this.rotation[i * 3 + 1] = y; this.rotation[i * 3 + 2] = z; }
  pos(i, x, y, z) { this.position[i * 3] = x; this.position[i * 3 + 1] = y; this.position[i * 3 + 2] = z; }
  /** The whole local matrix of a part, given as it is (copied). */
  direct(i, matrix) { (this.given[i] || (this.given[i] = new THREE.Matrix4())).copy(matrix); this._has = true; }
  compute() {
    const { parts, rotation: r, position: p, world, matrices } = this;
    for (let i = 0; i < parts.length; i++) {
      const w = world[i];
      if (this.given[i]) w.copy(this.given[i]);
      else {
        w.makeRotationFromEuler(this._e.set(r[i * 3], r[i * 3 + 1], r[i * 3 + 2]));
        w.setPosition(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      }
      if (parts[i].parent >= 0) w.premultiply(world[parts[i].parent]);
      w.toArray(matrices, i * 16);
    }
  }
}

// ---------------------------------------------------------------------------
// Materials

const ANIMAL_VERT = /* glsl */ `
${GLSL_COMMON}
uniform mat4 uParts[${MAX_PARTS}];
out vec3 vWorld;
out vec3 vNormal;
out float vShade;
void main() {
  int part = int(color.a * 32.0);
  mat4 m = uParts[part];
  vec4 wp = modelMatrix * (m * vec4(position, 1.0));
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * (mat3(m) * normal));
  vShade = color.r;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const ANIMAL_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
uniform float uShow;  // 0 nothing, 1 all there
uniform float uGlow;  // extra light (howl, roar)
uniform vec3 uBase;   // where it takes shape from (world)
in vec3 vWorld;
in vec3 vNormal;
in float vShade;
void main() {
  // takes shape, and dissolves, in grains of light
  float grain = ign(gl_FragCoord.xy);
  if (uShow < 0.999 && grain > uShow * 1.15 - 0.08 * sin(vWorld.y * 7.0 + uTime * 5.0)) discard;
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  float rim = pow(1.0 - saturate(dot(N, V)), 2.2);
  float top = N.y * 0.5 + 0.5;
  // sunlight made solid: deep gold, paler where it faces up, glowing at the edges
  vec3 gold = mix(vec3(0.9, 0.3, 0.02), vec3(1.0, 0.7, 0.14), top);
  float plate = min(vShade, 1.3);
  vec3 col = gold * (0.3 + 0.62 * top) * plate * plate;
  col += vec3(1.0, 0.72, 0.3) * rim * 0.5;
  col += vec3(1.0, 0.9, 0.6) * max(vShade - 1.3, 0.0) * 1.5; // eyes, the core in the chest, antlers and fins
  // a pulse of light runs along the plates
  col *= 0.95 + 0.14 * sin(vWorld.y * 8.0 + vWorld.x * 3.0 - uTime * 6.0) + uGlow * 0.45;
  col *= 1.0 + 0.9 * (1.0 - uShow);
  gl_FragColor = vec4(outputColor(col), 1.0);
}
`;

const RING_VERT = /* glsl */ `
out vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RING_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
uniform float uOpen;  // 0..1: the ring catches fire round its circumference
uniform float uShow;  // overall strength
uniform float uGlow;
in vec2 vP;
void main() {
  float r = length(vP), a = atan(vP.y, vP.x), turn = a / 6.2831853;
  float lit = smoothstep(0.0, 0.06, uOpen * 1.1 - fract(turn + 0.25));
  float core = exp(-pow((r - 0.8) / 0.026, 2.0));
  float halo = exp(-pow((r - 0.8) / 0.12, 2.0));
  // flames licking outwards, turning slowly
  float f1 = sin(a * 9.0 + uTime * 1.7) * 0.5 + 0.5, f2 = sin(a * 23.0 - uTime * 2.9) * 0.5 + 0.5, f3 = sin(a * 5.0 - uTime * 0.8) * 0.5 + 0.5;
  float lick = f1 * f2 + 0.35 * f3;
  float flame = exp(-pow((r - 0.85 - 0.07 * lick) / 0.05, 2.0)) * (0.35 + lick);
  // the teeth of a dial turning inside (these animals are machines)
  float teeth = step(0.5, fract(turn * 36.0 + uTime * 0.11)) * smoothstep(0.685, 0.695, r) * (1.0 - smoothstep(0.735, 0.745, r));
  float teeth2 = step(0.72, fract(turn * 12.0 - uTime * 0.07)) * smoothstep(0.63, 0.64, r) * (1.0 - smoothstep(0.665, 0.675, r));
  float inside = (1.0 - smoothstep(0.1, 0.78, r)) * 0.07 * uOpen;
  float I = (core * 1.5 + halo * (0.42 + uGlow * 0.5) + flame * 1.0 + (teeth * 0.5 + teeth2 * 0.36)) * lit + inside;
  I *= uShow;
  // orange flames, a core that is almost white: the colour of the sun
  vec3 col = mix(vec3(1.0, 0.3, 0.02), vec3(1.0, 0.8, 0.32), saturate(core * 0.85 + halo * 0.25)) * (0.55 + 0.75 * saturate(I));
  float alpha = saturate(I);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(outputColor(col) * alpha, alpha * 0.8);
}
`;

let ringGeometry = null;

class Emote {
  constructor(kind, rig) {
    this.kind = kind;
    this.rig = rig;
    this.pose = new Pose(rig.parts);
    this.group = new THREE.Group();
    this.uniforms = { uParts: { value: this.pose.matrices }, uShow: { value: 0 }, uGlow: { value: 0 }, uBase: { value: new THREE.Vector3() } };
    this.animal = new THREE.Mesh(rig.geometry, makeMaterial({ uniforms: this.uniforms, vertexShader: ANIMAL_VERT, fragmentShader: ANIMAL_FRAG, vertexColors: true, side: THREE.DoubleSide }));
    this.animal.frustumCulled = false;
    this.ringUniforms = { uOpen: { value: 0 }, uShow: { value: 0 }, uGlow: { value: 0 } };
    if (!ringGeometry) ringGeometry = new THREE.PlaneGeometry(2.5, 2.5);
    this.ring = new THREE.Mesh(ringGeometry, makeMaterial({
      uniforms: this.ringUniforms, vertexShader: RING_VERT, fragmentShader: RING_FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    this.ring.position.set(0, RING.y, RING.z);
    this.ring.scale.setScalar(RING.r / 0.8);
    this.ring.renderOrder = 30;
    this.ring.frustumCulled = false;
    this.group.add(this.animal, this.ring);
    this.time = 0;
    this.target = null;
  }

  start(target) {
    this.target = target;
    this.time = 0;
    this.group.rotation.y = target.rotation.y;
    this.group.visible = true;
    this.step(0);
  }

  /** Returns false once the emote is over. */
  step(dt) {
    const t = (this.time += dt);
    if (t >= RANK_DURATION || !this.target.parent) { this.group.visible = false; return false; }
    this.group.position.copy(this.target.position);
    this.pose.reset();
    const glow = this.rig.animate(t, this.pose) || 0;
    this.pose.compute();
    const show = ss(0.45, 1.25, t) * (1 - ss(RANK_DURATION - 0.95, RANK_DURATION - 0.1, t));
    this.uniforms.uShow.value = show;
    this.uniforms.uGlow.value = glow;
    this.ringUniforms.uOpen.value = ss(0, 0.75, t);
    this.ringUniforms.uShow.value = ss(0, 0.3, t) * (1 - ss(RANK_DURATION - 0.7, RANK_DURATION, t));
    this.ringUniforms.uGlow.value = glow;
    return true;
  }
}

export class RankEmotes {
  constructor(scene) {
    this.scene = scene;
    this.rigs = {};
    this.free = {}; // kind → emotes ready to be used again
    this.active = [];
  }

  /** Summon an animal over `target` (an Object3D: the avatar's root). `kind`: deer | wolf | tiger | dragon. */
  play(kind, target) {
    if (!BUILDERS[kind] || !target) return;
    // one at a time per avatar
    const again = this.active.find((e) => e.target === target);
    if (again) { again.group.visible = false; this.active.splice(this.active.indexOf(again), 1); (this.free[again.kind] ||= []).push(again); }
    let e = this.free[kind]?.pop();
    if (!e) {
      e = new Emote(kind, this.rigs[kind] || (this.rigs[kind] = BUILDERS[kind]()));
      this.scene.add(e.group);
    }
    e.start(target);
    this.active.push(e);
  }

  update(dt, camera) {
    if (this.paused) dt = 0; // (screenshots)
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      if (!e.step(dt)) { this.active.splice(i, 1); (this.free[e.kind] ||= []).push(e); continue; }
      e.group.visible = !camera || e.group.position.distanceToSquared(camera.position) < 260 * 260;
    }
  }
}
