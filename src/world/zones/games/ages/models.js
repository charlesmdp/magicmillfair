// War Through the Ages: what its toys are made of — the little robots of the two armies, dressed for their age; the
// turrets; the two bases, age by age. Everything here is drawn with a MeshBuilder (boxes, rods, lathes), facing
// the way `dir` says (1: towards the right of the stage — one's own side marches that way; -1: the other's) — the
// same shapes mirrored, never a mirror of the mesh: their sword arm stays on the side the camera looks at.
//
// A robot stands on the road at the origin, the road running along x, the camera looking from +z. Every robot wears
// the colour of its side on its chest, on its shoulders and on the little flag it carries on its back: blue is
// one's own, red is the other's, in every age.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
/** The colour of each side — one's own blue, the other's red —, and the light of their eyes. */
export const TEAM = [[0.12, 0.5, 2.3], [2.4, 0.15, 0.09]];
export const EYES = [[0.8, 2.2, 3.0], [3.0, 1.9, 0.5]];

const BLACK = [0.06, 0.06, 0.07], INK = [0.14, 0.13, 0.15], WHITE = [1.9, 1.88, 1.8], CREAM = [1.7, 1.5, 1.1];
const RUST = [1.0, 0.5, 0.22], FUR = [0.62, 0.38, 0.18], BONE = [1.8, 1.7, 1.35], WOOD = [0.8, 0.5, 0.26], DARKWOOD = [0.4, 0.25, 0.13], STONE = [0.8, 0.76, 0.7];
const STEEL = [1.1, 1.16, 1.28], IRON = [0.42, 0.45, 0.52], BRASS = [1.9, 1.3, 0.32], LEATHER = [0.55, 0.32, 0.16], GREEN = [0.36, 0.72, 0.28];
const KHAKI = [0.95, 0.84, 0.46], OLIVE = [0.44, 0.52, 0.24], COPPER = [1.6, 0.66, 0.3], BRICK = [1.25, 0.42, 0.26];
const PEARL = [1.9, 1.92, 1.95], HAZARD = [2.5, 1.9, 0.08], GLOW = [0.5, 3.2, 1.0], CYAN = [0.6, 2.4, 3.0], CONCRETE = [1.25, 1.24, 1.18];

/** The tools one draws with, into builder `b`: everything mirrored along x by `dir`. */
function kit(b, dir) {
  const X = (x) => x * dir, T = (c) => b.tint(c[0], c[1], c[2], 1);
  return {
    b, dir, X,
    box: (x0, y0, z0, x1, y1, z1, c) => T(c).box(Math.min(X(x0), X(x1)), y0, z0, Math.max(X(x0), X(x1)), y1, z1),
    cyl: (x, y, z, r0, r1, h, c, n = 8) => T(c).cylinder(X(x), y, z, r0, r1, h, n, { capBottom: true }),
    rod: (x0, y0, z0, x1, y1, z1, r, c, n = 6, r1 = r) => T(c).rod(V(X(x0), y0, z0), V(X(x1), y1, z1), r, n, { r1 }),
    lathe: (x, y, z, profile, c, n = 8) => { T(c); b.place(X(x), y, z).lathe(profile, n).pop(); },
    ball: (x, y, z, r, c, n = 8) => { T(c); b.place(X(x), y, z).lathe([[0.001, -r], [r * 0.72, -r * 0.7], [r, 0], [r * 0.72, r * 0.7], [0.001, r]], n).pop(); },
    /** Draws `fn` so many times larger, from the point (x, y) of the road. */
    at: (x, y, s, fn) => { b.push(new THREE.Matrix4().makeScale(s, s, s).setPosition(X(x), y, 0)); fn(); b.pop(); },
  };
}

/**
 * The little robot every soldier is: two feet, a barrel of a body, a round head with a visor all round it and an
 * eye on each side, two arms held forward, and on its back a pole with the flag of its side. o: { body, head (its
 * colours), side (0 | 1), legs, arms, flag (false: without) }.
 */
function bot(K, o) {
  const { box, cyl, rod, lathe, ball } = K, body = o.body, dark = mul(body, 0.5), team = TEAM[o.side], eye = EYES[o.side];
  if (o.legs !== false) for (const z of [-0.13, 0.13]) { box(-0.1, 0, z - 0.075, 0.16, 0.075, z + 0.075, dark); cyl(0.01, 0.07, z, 0.055, 0.05, 0.22, dark, 6); }
  lathe(0, 0.27, 0, [[0.001, 0], [0.19, 0.02], [0.245, 0.14], [0.245, 0.34], [0.2, 0.5], [0.001, 0.53]], body);
  box(0.14, 0.4, -0.15, 0.265, 0.7, 0.15, team);
  for (const z of [-0.27, 0.27]) ball(0, 0.74, z, 0.105, team, 6);
  lathe(0.02, 0.8, 0, [[0.001, 0], [0.13, 0.01], [0.165, 0.1], [0.165, 0.2], [0.11, 0.29], [0.001, 0.31]], o.head || mul(body, 1.18));
  box(0, 0.9, -0.172, 0.19, 1.0, 0.172, BLACK);
  for (const z of [-0.178, 0.178]) box(0.06, 0.92, z - 0.005, 0.15, 0.98, z + 0.005, eye);
  box(0.186, 0.92, -0.1, 0.196, 0.98, 0.1, eye);
  if (o.arms !== false) { rod(0, 0.7, 0.27, 0.27, 0.56, 0.3, 0.045, dark); rod(0, 0.7, -0.27, 0.24, 0.52, -0.27, 0.045, dark); ball(0.28, 0.555, 0.3, 0.06, body, 6); }
  if (o.flag !== false) { rod(-0.2, 0.55, 0, -0.26, 1.64, 0, 0.014, BLACK, 4); box(-0.52, 1.34, -0.012, -0.262, 1.62, 0.012, team); }
}
const skirt = (K, c, low = 0.26) => K.lathe(0, low, 0, [[0.31, 0], [0.29, 0.09], [0.25, 0.2]], c, 9);

// ---- the fifteen robots: [age][kind] → (K, side)
const UNITS = [
  [ // ---- the stone age: rust, furs and bones
    (K, side) => K.at(0, 0, 1.12, () => { // the clubber: a club as long as its arm
      bot(K, { body: RUST, side }); skirt(K, FUR);
      for (const z of [-0.1, 0.1]) K.rod(0.02, 1.07, z, 0.08, 1.25, z * 1.9, 0.03, BONE, 5, 0.004);
      K.rod(0.26, 0.5, 0.3, 0.5, 1.16, 0.3, 0.045, DARKWOOD, 6, 0.115); K.ball(0.5, 1.16, 0.3, 0.115, WOOD, 6);
    }),
    (K, side) => K.at(0, 0, 1.08, () => { // the slinger: a sling whirled over its head, a feather, a bag of stones
      bot(K, { body: mul(RUST, 1.15), side }); skirt(K, mul(FUR, 1.3));
      K.box(-0.04, 1.08, 0.03, -0.01, 1.36, 0.08, WHITE); K.box(-0.04, 1.3, 0.03, -0.01, 1.36, 0.08, TEAM[side]);
      K.rod(0.28, 0.56, 0.3, 0.1, 1.22, 0.36, 0.012, LEATHER, 4); K.ball(0.1, 1.24, 0.36, 0.075, STONE, 6);
      K.box(-0.1, 0.3, 0.2, 0.08, 0.46, 0.31, LEATHER);
    }),
    (K, side) => K.at(0, 0, 1.62, () => { // the brute: twice the others, tusks, a hammer of stone
      bot(K, { body: mul(RUST, 0.82), side }); skirt(K, mul(FUR, 0.8));
      for (const z of [-0.27, 0.27]) K.ball(-0.02, 0.8, z, 0.15, FUR, 6);
      for (const z of [-0.12, 0.12]) K.rod(0.16, 0.86, z, 0.34, 1.0, z * 1.5, 0.035, BONE, 5, 0.006);
      K.rod(0.27, 0.45, 0.3, 0.44, 1.28, 0.3, 0.04, DARKWOOD, 6); K.box(0.26, 1.2, 0.15, 0.62, 1.48, 0.45, STONE); K.box(0.3, 1.24, 0.13, 0.58, 1.44, 0.47, mul(STONE, 0.8));
    }),
  ],
  [ // ---- the iron age: steel, plumes, a horse on wheels
    (K, side) => K.at(0, 0, 1.12, () => { // the swordsman
      bot(K, { body: STEEL, side });
      K.lathe(0.02, 1.07, 0, [[0.175, 0], [0.13, 0.09], [0.001, 0.2]], STEEL); K.box(-0.1, 1.2, -0.016, 0.07, 1.44, 0.016, TEAM[side]);
      K.box(0.262, 0.62, 0.285, 0.31, 1.32, 0.315, mul(STEEL, 1.5)); K.box(0.19, 0.6, 0.265, 0.38, 0.66, 0.335, BRASS);
      K.box(0.3, 0.36, -0.32, 0.36, 0.88, 0.1, TEAM[side]); K.box(0.36, 0.56, -0.16, 0.38, 0.68, -0.06, WHITE);
    }),
    (K, side) => K.at(0, 0, 1.08, () => { // the archer: a green hood, a bow as tall as itself
      bot(K, { body: GREEN, head: STEEL, side });
      K.lathe(0.02, 1.06, 0, [[0.175, 0], [0.11, 0.13], [0.001, 0.27]], mul(GREEN, 0.8)); K.box(-0.02, 1.14, 0.1, 0.0, 1.4, 0.15, TEAM[side]);
      let px = 0, py = 0;
      for (let n = 0; n <= 6; n++) { const t = (-66 + n * 22) * Math.PI / 180, x = 0.12 + 0.34 * Math.cos(t), y = 0.74 + 0.56 * Math.sin(t); if (n) K.rod(px, py, 0.3, x, y, 0.3, 0.022, WOOD, 4); px = x; py = y; }
      K.rod(0.258, 0.23, 0.3, 0.258, 1.25, 0.3, 0.006, WHITE, 3); K.rod(0.0, 0.74, 0.3, 0.52, 0.74, 0.3, 0.012, DARKWOOD, 4);
      K.rod(-0.2, 0.45, -0.12, -0.32, 0.95, -0.12, 0.06, LEATHER, 6);
    }),
    (K, side) => { // the knight: a toy horse on four wheels, a lance with its pennant
      const horse = [1.6, 1.52, 1.38];
      K.box(-0.55, 0.52, -0.2, 0.5, 0.98, 0.2, horse);
      for (const z of [-1, 1]) { K.box(-0.52, 0.4, z * 0.2, 0.46, 0.9, z * 0.235, TEAM[side]); K.box(-0.52, 0.4, z * 0.236, 0.46, 0.47, z * 0.245, BRASS); }
      K.rod(0.4, 0.9, 0, 0.74, 1.34, 0, 0.14, horse, 6, 0.11); K.box(0.6, 1.22, -0.1, 1.0, 1.45, 0.1, horse); K.box(0.9, 1.22, -0.105, 1.0, 1.33, 0.105, mul(horse, 0.7));
      for (const z of [-0.07, 0.07]) K.box(0.62, 1.44, z - 0.02, 0.68, 1.55, z + 0.02, horse);
      K.box(0.4, 0.98, -0.03, 0.7, 1.4, 0.03, INK); K.rod(-0.55, 0.9, 0, -0.78, 0.5, 0, 0.05, INK, 5, 0.02);
      for (const x of [-0.36, 0.36]) for (const z of [-1, 1]) { K.rod(x, 0.21, z * 0.2, x, 0.21, z * 0.3, 0.21, INK, 10); K.rod(x, 0.21, z * 0.3, x, 0.21, z * 0.32, 0.08, BRASS, 6); K.box(x - 0.04, 0.2, z * 0.14, x + 0.04, 0.55, z * 0.2, mul(horse, 0.8)); }
      K.at(-0.08, 0.98, 0.84, () => {
        bot(K, { body: STEEL, side, legs: false, flag: false });
        K.lathe(0.02, 0.84, 0, [[0.19, 0], [0.2, 0.2], [0.15, 0.3], [0.001, 0.34]], STEEL); K.box(0.1, 0.94, -0.21, 0.22, 0.98, 0.21, BLACK); K.box(-0.12, 1.16, -0.02, 0.1, 1.5, 0.02, TEAM[side]);
      });
      K.rod(-0.3, 1.52, 0.34, 1.4, 1.36, 0.34, 0.035, WOOD, 5); K.rod(1.4, 1.36, 0.34, 1.62, 1.34, 0.34, 0.035, STEEL, 5, 0.004); K.box(0.98, 1.4, 0.33, 1.3, 1.62, 0.35, TEAM[side]);
    },
  ],
  [ // ---- the powder age: coats in the colour of one's side, three-cornered hats, a cannon
    (K, side) => K.at(0, 0, 1.12, () => { // the buccaneer: a kerchief, a cutlass, a belt with a great buckle
      bot(K, { body: CREAM, side });
      K.lathe(0.02, 1.02, 0, [[0.17, 0], [0.16, 0.07], [0.09, 0.12], [0.001, 0.13]], TEAM[side]); K.ball(-0.16, 1.04, 0.06, 0.05, TEAM[side], 5);
      K.lathe(0, 0.36, 0, [[0.255, 0], [0.255, 0.08]], INK, 9); K.box(0.22, 0.36, -0.06, 0.27, 0.44, 0.06, BRASS);
      K.box(0.262, 0.6, 0.285, 0.31, 1.0, 0.315, mul(STEEL, 1.5)); K.box(0.3, 0.98, 0.285, 0.36, 1.2, 0.315, mul(STEEL, 1.5)); K.box(0.35, 1.18, 0.285, 0.43, 1.3, 0.315, mul(STEEL, 1.5)); K.box(0.2, 0.58, 0.26, 0.37, 0.64, 0.34, BRASS);
    }),
    (K, side) => K.at(0, 0, 1.08, () => { // the musketeer: a long coat, a white belt, a tricorn, a musket with its bayonet
      bot(K, { body: mul(TEAM[side], 0.75), head: CREAM, side });
      K.lathe(0, 0.24, 0, [[0.3, 0], [0.25, 0.2]], mul(TEAM[side], 0.6), 9); K.lathe(0, 0.5, 0, [[0.252, 0], [0.252, 0.06]], WHITE, 9);
      for (const y of [0.44, 0.6, 0.7]) K.box(0.262, y, -0.02, 0.275, y + 0.04, 0.02, BRASS);
      K.lathe(0.02, 1.07, 0, [[0.33, 0], [0.33, 0.035], [0.17, 0.05], [0.15, 0.15], [0.001, 0.17]], INK, 3); K.lathe(0.02, 1.075, 0, [[0.335, 0.03], [0.335, 0.045]], BRASS, 3);
      K.rod(-0.2, 0.6, 0.3, 0.72, 0.72, 0.3, 0.03, IRON, 5); K.box(-0.3, 0.5, 0.26, 0.05, 0.63, 0.34, WOOD); K.rod(0.72, 0.72, 0.3, 0.98, 0.75, 0.3, 0.012, mul(STEEL, 1.5), 4, 0.003);
    }),
    (K, side) => { // the cannon: two great wheels, a barrel of black iron, its gunner behind it
      for (const z of [-1, 1]) { K.rod(0.1, 0.42, z * 0.4, 0.1, 0.42, z * 0.5, 0.42, WOOD, 12); K.rod(0.1, 0.42, z * 0.5, 0.1, 0.42, z * 0.53, 0.33, mul(TEAM[side], 0.8), 12); K.rod(0.1, 0.42, z * 0.53, 0.1, 0.42, z * 0.56, 0.09, BRASS, 6); }
      K.box(-0.75, 0.3, -0.36, 0.55, 0.52, 0.36, DARKWOOD); K.rod(-0.3, 0.42, 0, -0.95, 0.06, 0, 0.07, DARKWOOD, 5);
      K.rod(-0.42, 0.66, 0, 0.92, 0.84, 0, 0.19, INK, 10, 0.14); K.rod(0.84, 0.83, 0, 0.95, 0.845, 0, 0.18, INK, 10); K.ball(-0.46, 0.655, 0, 0.19, INK, 8);
      for (const x of [-0.1, 0.4]) K.rod(x, 0.7 + x * 0.12, 0, x + 0.06, 0.708 + x * 0.12, 0, 0.2, BRASS, 10);
      K.at(-0.72, 0, 0.9, () => { bot(K, { body: mul(TEAM[side], 0.75), head: CREAM, side }); K.lathe(0.02, 1.07, 0, [[0.33, 0], [0.33, 0.035], [0.17, 0.05], [0.15, 0.15], [0.001, 0.17]], INK, 3); K.rod(0.28, 0.5, 0.3, 0.2, 1.3, 0.3, 0.02, WOOD, 4); K.ball(0.2, 1.32, 0.3, 0.06, [2.6, 1.2, 0.2], 5); });
    },
  ],
  [ // ---- the steam age: khaki and brass, a boiler on every back, a tank
    (K, side) => K.at(0, 0, 1.12, () => { // the trooper: a tin hat, a boiler, a wrench as tall as itself
      bot(K, { body: KHAKI, side });
      K.lathe(0.02, 1.07, 0, [[0.26, 0], [0.18, 0.04], [0.13, 0.11], [0.001, 0.14]], OLIVE, 9); K.box(0.12, 0.93, -0.18, 0.2, 0.99, 0.18, BRASS);
      K.rod(-0.27, 0.36, 0.1, -0.27, 0.86, 0.1, 0.12, COPPER, 8); K.rod(-0.27, 0.86, 0.1, -0.27, 1.28, 0.1, 0.04, INK, 5); K.rod(-0.27, 0.6, 0.1, -0.27, 0.66, 0.1, 0.13, BRASS, 8);
      K.rod(0.27, 0.48, 0.3, 0.46, 1.16, 0.3, 0.035, STEEL, 5); K.box(0.36, 1.14, 0.26, 0.44, 1.36, 0.34, STEEL); K.box(0.5, 1.14, 0.26, 0.58, 1.36, 0.34, STEEL); K.box(0.36, 1.1, 0.26, 0.58, 1.18, 0.34, STEEL);
    }),
    (K, side) => K.at(0, 0, 1.08, () => { // the gunner: a machine gun and its belt of brass
      bot(K, { body: mul(KHAKI, 0.85), side });
      K.lathe(0.02, 1.07, 0, [[0.26, 0], [0.18, 0.04], [0.13, 0.11], [0.001, 0.14]], OLIVE, 9); K.box(0.12, 0.93, -0.18, 0.2, 0.99, 0.18, BRASS);
      K.rod(-0.27, 0.4, 0.06, -0.27, 0.8, 0.06, 0.1, COPPER, 8); K.rod(-0.27, 0.8, 0.06, -0.27, 1.16, 0.06, 0.035, INK, 5);
      K.rod(0.0, 0.62, 0.32, 0.62, 0.62, 0.32, 0.075, INK, 8); K.rod(0.62, 0.62, 0.32, 0.9, 0.62, 0.32, 0.03, IRON, 5); K.box(0.1, 0.36, 0.24, 0.36, 0.56, 0.4, OLIVE);
      for (let n = 0; n < 5; n++) K.box(0.14 + n * 0.045, 0.68, 0.38, 0.17 + n * 0.045, 0.78 - n * 0.02, 0.42, BRASS);
    }),
    (K, side) => { // the tank: riveted plates on two tracks, a gun, a chimney that smokes
      for (const z of [-1, 1]) { K.box(-1.08, 0.08, z * 0.42, 1.02, 0.56, z * 0.64, INK); K.box(-0.98, 0, z * 0.44, 0.92, 0.1, z * 0.62, INK); for (const x of [-0.82, -0.41, 0, 0.41, 0.82]) K.rod(x, 0.3, z * 0.64, x, 0.3, z * 0.67, 0.17, IRON, 8); }
      K.box(-1.0, 0.3, -0.42, 0.8, 0.92, 0.42, OLIVE); K.box(0.8, 0.3, -0.42, 1.0, 0.7, 0.42, mul(OLIVE, 0.85)); K.box(-0.9, 0.92, -0.36, 0.3, 1.0, 0.36, mul(OLIVE, 1.15));
      K.box(-1.0, 0.56, 0.42, 0.8, 0.7, 0.44, TEAM[side]); K.box(-1.0, 0.56, -0.44, 0.8, 0.7, -0.42, TEAM[side]);
      for (const x of [-0.8, -0.4, 0, 0.4]) K.box(x, 0.8, 0.42, x + 0.05, 0.85, 0.445, BRASS);
      K.cyl(-0.1, 1.0, 0, 0.34, 0.3, 0.34, mul(OLIVE, 0.9), 10); K.rod(0.15, 1.18, 0, 1.15, 1.2, 0, 0.07, INK, 8); K.rod(1.08, 1.2, 0, 1.2, 1.2, 0, 0.1, INK, 8);
      K.rod(-0.7, 1.0, -0.15, -0.7, 1.62, -0.15, 0.08, INK, 8); K.rod(-0.7, 1.4, -0.15, -0.7, 1.46, -0.15, 0.095, BRASS, 8);
      K.box(-0.1, 1.36, -0.02, 0.0, 1.5, 0.02, BRASS); K.rod(-0.4, 1.3, 0.2, -0.44, 2.12, 0.2, 0.016, BLACK, 4); K.box(-0.76, 1.8, 0.19, -0.44, 2.1, 0.21, TEAM[side]);
    },
  ],
  [ // ---- the atom age: white shells, yellow and black, a green glow
    (K, side) => K.at(0, 0, 1.12, () => { // the sentinel: a blade of light
      bot(K, { body: PEARL, head: CYAN, side });
      K.lathe(0, 0.3, 0, [[0.25, 0], [0.25, 0.08]], HAZARD, 9); for (let n = 0; n < 4; n++) { const a = n * Math.PI / 2 + 0.4; K.box(Math.cos(a) * 0.22 - 0.05, 0.3, Math.sin(a) * 0.24 - 0.05, Math.cos(a) * 0.22 + 0.05, 0.385, Math.sin(a) * 0.24 + 0.05, BLACK); }
      K.box(0.2, 0.46, -0.06, 0.272, 0.58, 0.06, GLOW);
      K.box(0.262, 0.62, 0.28, 0.31, 1.4, 0.32, GLOW); K.box(0.25, 0.52, 0.265, 0.32, 0.64, 0.335, INK);
    }),
    (K, side) => K.at(0, 0, 1.08, () => { // the blaster: a ray gun with three rings
      bot(K, { body: PEARL, head: CYAN, side });
      K.lathe(0, 0.3, 0, [[0.25, 0], [0.25, 0.08]], HAZARD, 9);
      K.box(0.2, 0.46, -0.06, 0.272, 0.58, 0.06, GLOW);
      K.rod(0.02, 0.62, 0.32, 0.6, 0.62, 0.32, 0.07, PEARL, 8, 0.045); for (const x of [0.2, 0.36, 0.52]) K.rod(x, 0.62, 0.32, x + 0.03, 0.62, 0.32, 0.11 - x * 0.06, HAZARD, 8); K.ball(0.68, 0.62, 0.32, 0.075, GLOW, 6);
      K.rod(-0.22, 0.7, -0.05, -0.36, 1.0, -0.05, 0.02, IRON, 4); K.lathe(-0.36, 1.0, -0.05, [[0.001, 0], [0.12, 0.03], [0.15, 0.09]], PEARL, 8);
    }),
    (K, side) => { // the colossus: a reactor on two legs
      for (const z of [-0.36, 0.36]) { K.box(-0.26, 0, z - 0.2, 0.36, 0.16, z + 0.2, IRON); K.rod(0.02, 0.12, z, -0.12, 0.72, z, 0.11, PEARL, 6); K.ball(-0.12, 0.72, z, 0.15, HAZARD, 6); K.rod(-0.12, 0.72, z, 0.06, 1.3, z, 0.12, PEARL, 6); }
      K.lathe(0.05, 1.2, 0, [[0.001, 0], [0.36, 0.04], [0.52, 0.3], [0.52, 0.72], [0.4, 0.94], [0.001, 0.98]], PEARL, 10);
      K.lathe(0.05, 1.52, 0, [[0.53, 0], [0.53, 0.1]], HAZARD, 10); for (let n = 0; n < 5; n++) { const a = n * Math.PI * 0.4; K.box(0.05 + Math.cos(a) * 0.48 - 0.07, 1.52, Math.sin(a) * 0.48 - 0.07, 0.05 + Math.cos(a) * 0.48 + 0.07, 1.625, Math.sin(a) * 0.48 + 0.07, BLACK); }
      K.box(0.42, 1.66, -0.2, 0.585, 1.9, 0.2, GLOW); K.box(0.3, 1.3, -0.14, 0.56, 1.44, 0.14, TEAM[side]);
      for (const z of [-1, 1]) { K.box(-0.22, 1.86, z * 0.5, 0.3, 2.18, z * 0.82, PEARL); K.box(-0.22, 1.92, z * 0.82, 0.3, 2.12, z * 0.84, TEAM[side]); K.rod(0.3, 2.02, z * 0.66, 0.84, 2.02, z * 0.66, 0.08, IRON, 8); K.ball(0.86, 2.02, z * 0.66, 0.09, GLOW, 6); }
      K.lathe(0.08, 2.14, 0, [[0.001, 0], [0.2, 0.02], [0.22, 0.14], [0.14, 0.26], [0.001, 0.3]], CYAN, 8); K.box(0.16, 2.22, -0.2, 0.32, 2.3, 0.2, BLACK); K.box(0.31, 2.235, -0.12, 0.325, 2.285, 0.12, EYES[side]);
      K.rod(-0.3, 2.0, 0, -0.36, 2.9, 0, 0.018, BLACK, 4); K.box(-0.74, 2.56, -0.012, -0.362, 2.88, 0.012, TEAM[side]);
    },
  ],
];

/** Draws the robot of age `era` and of kind `k` (0 the brawler, 1 the shooter, 2 the heavy one) of side `side` into `b`, facing `dir`. */
export function drawUnit(b, era, k, side, dir = side ? -1 : 1) { UNITS[era][k](kit(b, dir), side); }

// ---- the five turrets: each stands on the roof of a base, its mouth towards the road
const TURRETS = [
  (K) => { // the rock thrower: a beam on a trestle, a rock in its spoon
    K.box(-0.4, 0, -0.3, 0.4, 0.1, 0.3, DARKWOOD); for (const z of [-0.26, 0.26]) { K.rod(-0.3, 0.05, z, 0, 0.75, z, 0.045, WOOD, 5); K.rod(0.3, 0.05, z, 0, 0.75, z, 0.045, WOOD, 5); }
    K.rod(0, 0.75, -0.3, 0, 0.75, 0.3, 0.04, DARKWOOD, 5); K.rod(0.3, 0.4, 0, -0.55, 1.25, 0, 0.045, WOOD, 5); K.ball(-0.58, 1.3, 0, 0.15, STONE, 6); K.box(0.2, 0.2, -0.12, 0.44, 0.44, 0.12, STONE);
  },
  (K) => { // the ballista: a great crossbow on a post
    K.box(-0.3, 0, -0.3, 0.3, 0.1, 0.3, DARKWOOD); K.rod(0, 0.1, 0, 0, 0.62, 0, 0.07, WOOD, 6);
    K.rod(-0.6, 0.66, 0, 0.62, 0.8, 0, 0.06, DARKWOOD, 6); for (const z of [-1, 1]) { K.rod(0.5, 0.79, 0, 0.2, 0.8, z * 0.62, 0.035, WOOD, 5); K.rod(0.2, 0.8, z * 0.62, -0.4, 0.7, 0, 0.008, WHITE, 3); }
    K.rod(-0.4, 0.74, 0, 0.8, 0.9, 0, 0.022, WOOD, 4); K.rod(0.8, 0.9, 0, 0.98, 0.92, 0, 0.045, STEEL, 5, 0.004);
  },
  (K) => { // the mortar: a squat mouth of bronze on a bed of oak
    K.box(-0.42, 0, -0.34, 0.42, 0.22, 0.34, DARKWOOD); for (const z of [-0.36, 0.36]) K.rod(-0.1, 0.2, z, -0.1, 0.2, z * 1.12, 0.2, WOOD, 10);
    K.rod(-0.16, 0.24, 0, 0.3, 0.9, 0, 0.24, BRASS, 10, 0.2); K.rod(0.26, 0.85, 0, 0.33, 0.95, 0, 0.25, BRASS, 10); K.rod(0.3, 0.9, 0, 0.32, 0.93, 0, 0.17, BLACK, 8);
  },
  (K) => { // the gatling: six barrels on three legs, a drum of cartridges
    for (const [x, z] of [[0.36, 0], [-0.24, 0.3], [-0.24, -0.3]]) K.rod(0, 0.6, 0, x, 0, z, 0.035, IRON, 5);
    K.rod(-0.3, 0.66, 0, 0.3, 0.7, 0, 0.13, INK, 8); for (let n = 0; n < 6; n++) { const a = n * Math.PI / 3; K.rod(0.3, 0.7 + Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0.95, 0.74 + Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0.028, IRON, 4); }
    K.rod(0.9, 0.737, 0, 0.94, 0.74, 0, 0.12, BRASS, 8); K.rod(-0.1, 0.8, 0, -0.1, 1.02, 0, 0.16, BRASS, 8); K.rod(-0.3, 0.66, 0, -0.5, 0.62, 0, 0.04, DARKWOOD, 5);
  },
  (K) => { // the tesla coil: a tower of rings under a ball of lightning
    K.box(-0.34, 0, -0.34, 0.34, 0.16, 0.34, CONCRETE); K.box(-0.34, 0.16, -0.34, 0.34, 0.22, 0.34, HAZARD);
    K.lathe(0, 0.22, 0, [[0.2, 0], [0.26, 0.06], [0.16, 0.12], [0.24, 0.2], [0.14, 0.27], [0.22, 0.36], [0.12, 0.44], [0.19, 0.53], [0.09, 0.62], [0.09, 0.9]], COPPER, 9);
    K.lathe(0, 1.02, 0, [[0.09, 0], [0.34, 0.06], [0.36, 0.14], [0.09, 0.2]], PEARL, 10); K.ball(0, 1.34, 0, 0.17, CYAN, 8);
  },
];
/** Draws the turret of age `era` into `b`, its mouth the way `dir` says. */
export function drawTurret(b, era, dir = 1) { TURRETS[era](kit(b, dir)); }

// ---- the two bases. A base stands at one end of the stage: `d` metres behind its gate (0: the gate, where the
// road ends — 5.7: the end of the stage), across the stage (z, towards the camera) and up. Whatever the age it has
// the same body — a low block in front, which carries the three turrets on its roof (BASE.roof), and a taller one
// behind it, where one's robot stands and looks at the war (BASE.deck) —, a porch over the end of the road, out of
// which the robots come, and the flag of its side; each age dresses it its own way.
export const BASE = { roof: 3.0, deck: 4.0, from: 1.3, to: 5.7, front: 2.6, mid: -0.2, back: -3.6, porch: 2.35, stand: { d: 3.5, z: -1.9 }, turret: { z: 1.55 }, flag: { d: 5.2, z: -3.2, top: 7.3 } };

/**
 * Draws the base of side `side` in the dress of age `era` into the builders of `parts` ('paint', 'woodDark', 'glow'):
 * `gate` is where its gate stands along the stage (x), `out` the way its robots march (1 | -1).
 */
export function drawBase(parts, era, side, gate, out) {
  const P = (name) => { const b = parts.get(name), X = (d) => gate - out * d, T = (c) => b.tint(c[0], c[1], c[2], 1); return {
    box: (d0, y0, z0, d1, y1, z1, c) => T(c).box(Math.min(X(d0), X(d1)), y0, z0, Math.max(X(d0), X(d1)), y1, z1),
    rod: (d0, y0, z0, d1, y1, z1, r, c, n = 6, r1 = r) => T(c).rod(V(X(d0), y0, z0), V(X(d1), y1, z1), r, n, { r1 }),
    lathe: (d, y, z, profile, c, n = 10) => { T(c); b.place(X(d), y, z).lathe(profile, n).pop(); },
    cyl: (d, y, z, r0, r1, h, c, n = 10) => T(c).cylinder(X(d), y, z, r0, r1, h, n),
  }; };
  const paint = P('paint'), wood = P('woodDark'), glow = P('glow'), B = BASE, team = TEAM[side], F = B.front, M = B.mid, K = B.back, a = B.from, z = B.to;
  // (the two blocks, in two tones of `wall`; a dark door where the road ends)
  const blocks = (wall, low = 0.8) => {
    paint.box(a, 0, M, z, B.roof, F, wall); paint.box(a, 0, K, z, B.deck, M, mul(wall, 0.92));
    paint.box(a, 0, M - 0.02, z + 0.02, 0.5, F + 0.02, mul(wall, low)); paint.box(a, 0, K - 0.02, z + 0.02, 0.5, M, mul(wall, low));
    paint.box(a - 0.03, 0, 0.0, a + 0.05, 1.95, 1.2, BLACK);
  };
  // (a low wall round the two roofs, with gaps — the teeth of a keep, stakes, a rail — every `step` metres)
  const parapet = (c, h, step, gap, w = 0.14) => {
    for (let d = a; d < z - 0.01; d += step) { const e = Math.min(z, d + step - gap); paint.box(d, B.roof, F - w, e, B.roof + h, F, c); paint.box(d, B.deck, K, e, B.deck + h, K + w, c); paint.box(d, B.deck, M - w, e, B.deck + h, M, c); }
    for (let v = K; v < M - 0.01; v += step) { const e = Math.min(M, v + step - gap); paint.box(a, B.deck, v, a + w, B.deck + h, e, c); paint.box(z - w, B.deck, v, z, B.deck + h, e, c); }
    for (let v = M; v < F - 0.01; v += step) { const e = Math.min(F, v + step - gap); paint.box(a, B.roof, v, a + w, B.roof + h, e, c); paint.box(z - w, B.roof, v, z, B.roof + h, e, c); }
  };
  // (the flag of the side, on a tall pole behind: one sees whose base it is from the other end of the meadow)
  const flag = (pole) => { paint.rod(B.flag.d, B.deck, B.flag.z, B.flag.d, B.flag.top, B.flag.z, 0.05, pole, 6); paint.box(B.flag.d - 1.5, B.flag.top - 1.05, B.flag.z - 0.02, B.flag.d - 0.05, B.flag.top - 0.1, B.flag.z + 0.02, team); paint.box(B.flag.d - 1.5, B.flag.top - 0.66, B.flag.z - 0.025, B.flag.d - 0.05, B.flag.top - 0.5, B.flag.z + 0.025, WHITE); paint.lathe(B.flag.d, B.flag.top, B.flag.z, [[0.001, 0.2], [0.09, 0.12], [0.07, 0.02], [0.001, 0]], BRASS, 6); };
  // (two banners of the side down the front wall)
  const banners = (y0 = 1.0, y1 = 2.6) => { for (const d of [2.3, 4.6]) { paint.box(d - 0.3, y0, F, d + 0.3, y1, F + 0.04, team); paint.box(d - 0.3, y1 - 0.1, F, d + 0.3, y1, F + 0.06, BRASS); paint.box(d - 0.1, y0 + 0.5, F + 0.04, d + 0.1, y0 + 0.9, F + 0.05, WHITE); } };
  if (era === 0) {
    // ---- the stone age: a mound of rock, a stockade of stakes, two tusks for a porch
    blocks([0.86, 0.72, 0.56], 0.75);
    for (const [d, y, v, r] of [[1.5, 0, 2.4, 0.7], [3.4, 0, 2.7, 0.55], [5.4, 0, 2.3, 0.8], [5.6, 0, -1.5, 0.9], [1.5, 2.6, 1.9, 0.45], [4.9, 2.7, 0.3, 0.5]]) paint.lathe(d, y, v, [[0.001, -0.2], [r, 0], [r * 0.85, r * 0.6], [r * 0.4, r], [0.001, r * 1.05]], [0.74, 0.62, 0.5], 7);
    for (let d = a + 0.12; d < z; d += 0.36) { wood.rod(d, B.roof, F - 0.1, d, B.roof + 0.62 + 0.14 * Math.sin(d * 7), F - 0.1, 0.09, WOOD, 5, 0.01); wood.rod(d, B.deck, K + 0.1, d, B.deck + 0.72 + 0.14 * Math.cos(d * 5), K + 0.1, 0.09, WOOD, 5, 0.01); }
    for (let v = K + 0.3; v < M; v += 0.36) wood.rod(z - 0.1, B.deck, v, z - 0.1, B.deck + 0.7 + 0.12 * Math.sin(v * 6), v, 0.09, WOOD, 5, 0.01);
    for (const v of [-0.3, 1.5]) { paint.rod(0.12, 0, v, 0.5, 1.5, v + (v < 0 ? 0.12 : -0.12), 0.17, BONE, 6, 0.12); paint.rod(0.5, 1.5, v + (v < 0 ? 0.12 : -0.12), 0.75, 2.5, 0.6, 0.12, BONE, 6, 0.02); }
    paint.box(0.5, 2.25, -0.3, a, 2.35, 1.5, [1.25, 0.85, 0.5]); paint.box(0.5, 2.05, -0.3, 0.56, 2.25, 1.5, [1.05, 0.7, 0.4]);
    paint.rod(2.0, 0, F + 0.5, 2.0, 2.3, F + 0.5, 0.13, WOOD, 6); paint.lathe(2.0, 2.3, F + 0.5, [[0.001, 0], [0.16, 0.02], [0.2, 0.14], [0.18, 0.26], [0.001, 0.34]], RUST, 7); paint.box(2.0 - 0.05, 2.42, F + 0.5 - 0.21, 2.0 + 0.22, 2.5, F + 0.5 + 0.21, BLACK);
    paint.box(3.4, 0.7, F, 4.4, 1.6, F + 0.03, [1.5, 0.75, 0.3]); paint.box(3.6, 0.9, F + 0.03, 4.2, 1.4, F + 0.05, [0.86, 0.72, 0.56]);
    flag(WOOD);
  } else if (era === 1) {
    // ---- the iron age: a keep of grey stone, its teeth, a round tower, banners
    blocks([1.05, 1.04, 1.0], 0.8); parapet([1.12, 1.1, 1.06], 0.5, 0.7, 0.3);
    for (let d = a + 0.4; d < z; d += 1.1) paint.box(d, 1.7, F, d + 0.12, 2.3, F + 0.02, BLACK);
    paint.cyl(z - 0.3, 0, K + 0.4, 1.0, 1.0, B.deck + 1.0, [1.0, 0.98, 0.94], 10); paint.lathe(z - 0.3, B.deck + 1.0, K + 0.4, [[1.25, 0], [0.7, 0.9], [0.001, 1.9]], [0.5, 0.62, 1.0], 10);
    for (const v of [-0.3, 1.5]) paint.box(0.05, 0, v - 0.14, 0.4, 2.2, v + 0.14, [1.0, 0.98, 0.94]);
    paint.box(0, 2.2, -0.5, a, 2.6, 1.7, [1.05, 1.04, 1.0]); for (let v = -0.5; v < 1.6; v += 0.6) paint.box(0, 2.6, v, 0.25, 2.95, v + 0.32, [1.12, 1.1, 1.06]);
    banners(); flag(WOOD);
  } else if (era === 2) {
    // ---- the powder age: a fort of brick, white corner stones, guns at its ports, barrels
    blocks(BRICK, 0.62); parapet(CREAM, 0.34, 1.1, 0.42, 0.2);
    for (const d of [a, z - 0.2]) for (let y = 0.5; y < B.roof; y += 0.6) paint.box(d - 0.02, y, F - 0.2, d + 0.22, y + 0.3, F + 0.03, CREAM);
    for (const d of [2.4, 3.6, 4.8]) { paint.box(d - 0.28, 1.5, F, d + 0.28, 2.0, F + 0.03, BLACK); paint.rod(d, 1.74, F - 0.1, d, 1.74, F + 0.5, 0.11, INK, 8); paint.box(d - 0.34, 1.42, F, d + 0.34, 1.5, F + 0.08, CREAM); }
    for (const [d, v] of [[1.75, F + 0.45], [2.25, F + 0.5], [2.0, F + 0.95]]) { wood.cyl(d, 0, v, 0.24, 0.24, 0.6, WOOD, 8); wood.cyl(d, 0.25, v, 0.255, 0.255, 0.1, IRON, 8); }
    for (const v of [-0.3, 1.5]) wood.box(0.06, 0, v - 0.1, 0.26, 2.3, v + 0.1, DARKWOOD);
    paint.box(-0.1, 2.3, -0.5, a, 2.45, 1.7, [0.9, 0.3, 0.2]); paint.box(-0.2, 2.45, -0.6, a, 2.55, 1.8, [1.1, 0.4, 0.26]);
    paint.box(z - 1.5, B.deck, K + 0.2, z - 0.2, B.deck + 1.3, K + 1.5, CREAM); paint.lathe(z - 0.85, B.deck + 1.3, K + 0.85, [[1.05, 0], [0.5, 0.5], [0.001, 0.9]], [0.9, 0.3, 0.2], 4);
    banners(0.4, 1.3); flag(WOOD);
  } else if (era === 3) {
    // ---- the steam age: plates of iron and rivets, pipes of copper, a great cog, a chimney of brick
    blocks([0.5, 0.54, 0.6], 0.7); parapet(IRON, 0.5, 2.2, 0.06, 0.06);
    for (let d = a; d < z; d += 1.1) { paint.box(d - 0.03, 0.5, F, d + 0.03, B.roof, F + 0.03, IRON); for (let y = 0.8; y < B.roof; y += 0.55) paint.box(d + 0.1, y, F, d + 0.16, y + 0.06, F + 0.03, BRASS); }
    paint.rod(a + 0.2, 2.5, F + 0.14, z - 0.2, 2.5, F + 0.14, 0.09, COPPER, 8); paint.rod(z - 0.2, 0.3, F + 0.14, z - 0.2, 2.5, F + 0.14, 0.09, COPPER, 8);
    paint.rod(3.4, 1.4, F, 3.4, 1.4, F + 0.14, 0.62, BRASS, 12); paint.rod(3.4, 1.4, F + 0.14, 3.4, 1.4, F + 0.2, 0.2, IRON, 8); for (let n = 0; n < 10; n++) { const t = n * Math.PI / 5; paint.box(3.4 + Math.cos(t) * 0.66 - 0.09, 1.4 + Math.sin(t) * 0.66 - 0.09, F, 3.4 + Math.cos(t) * 0.66 + 0.09, 1.4 + Math.sin(t) * 0.66 + 0.09, F + 0.12, BRASS); }
    for (const d of [1.9, 5.0]) { paint.rod(d, 1.6, F, d, 1.6, F + 0.05, 0.3, BRASS, 10); glow.rod(d, 1.6, F + 0.05, d, 1.6, F + 0.07, 0.22, [2.6, 1.9, 0.6], 10); }
    paint.cyl(z - 0.7, 0, K + 0.7, 0.62, 0.42, 6.6, BRICK, 10); paint.cyl(z - 0.7, 6.6, K + 0.7, 0.5, 0.5, 0.3, INK, 10); paint.cyl(z - 0.7, 3.2, K + 0.7, 0.57, 0.56, 0.24, CREAM, 10);
    paint.lathe(2.3, B.deck, K + 0.9, [[0.001, 0], [0.6, 0.05], [0.6, 1.0], [0.3, 1.3], [0.001, 1.34]], COPPER, 10); paint.cyl(2.3, B.deck + 0.5, K + 0.9, 0.62, 0.62, 0.1, BRASS, 10);
    for (const v of [-0.3, 1.5]) { paint.box(0.06, 0, v - 0.09, 0.24, 2.3, v + 0.09, IRON); for (let y = 0.1; y < 2.2; y += 0.5) paint.box(0.04, y, v - 0.1, 0.26, y + 0.25, v + 0.1, y % 1 < 0.5 ? HAZARD : BLACK); }
    paint.box(-0.05, 2.3, -0.45, a, 2.48, 1.65, IRON); paint.box(-0.05, 2.48, -0.45, 0.1, 2.6, 1.65, BRASS);
    banners(0.3, 1.0); flag(IRON);
  } else {
    // ---- the atom age: pale concrete, yellow and black, a dome, a cooling tower, windows that glow green
    blocks(CONCRETE, 0.86); parapet(PEARL, 0.4, 2.2, 0.08, 0.05);
    for (let d = a, n = 0; d < z - 0.01; d += 0.55, n++) paint.box(d, 0.5, F, Math.min(z, d + 0.55), 0.78, F + 0.025, n % 2 ? BLACK : HAZARD);
    for (const d of [2.0, 3.1, 4.2, 5.3]) { paint.box(d - 0.32, 1.3, F, d + 0.32, 2.3, F + 0.03, IRON); glow.box(d - 0.25, 1.38, F + 0.03, d + 0.25, 2.22, F + 0.045, [0.6, 2.8, 1.0]); }
    paint.lathe(2.9, B.deck, K + 1.5, [[1.45, 0], [1.4, 0.5], [1.1, 1.1], [0.6, 1.5], [0.001, 1.65]], PEARL, 14); paint.lathe(2.9, B.deck + 0.35, K + 1.5, [[1.46, 0], [1.44, 0.14]], HAZARD, 14);
    paint.lathe(z - 0.95, 0, K + 0.95, [[0.95, 0], [0.72, 2.6], [0.62, 4.2], [0.7, 5.6], [0.82, 6.4]], [1.5, 1.5, 1.46], 12); paint.lathe(z - 0.95, 6.36, K + 0.95, [[0.83, 0], [0.84, 0.08]], [2.2, 0.3, 0.2], 12);
    for (const v of [-0.3, 1.5]) { paint.box(0.06, 0, v - 0.08, 0.2, 2.3, v + 0.08, PEARL); glow.box(0.04, 0.3, v - 0.03, 0.22, 2.0, v + 0.03, [0.6, 2.8, 1.0]); }
    paint.box(-0.1, 2.3, -0.5, a, 2.42, 1.7, PEARL); paint.box(-0.1, 2.42, -0.5, a, 2.47, 1.7, HAZARD);
    banners(0.9, 1.25); flag(IRON);
  }
}

/** What flies over the stage when the steam age lets its great blow fall: a little plane, its nose towards +x. */
export function drawPlane(b) {
  const K = kit(b, 1);
  K.rod(-1.3, 0, 0, 1.0, 0, 0, 0.26, OLIVE, 8, 0.2); K.rod(1.0, 0, 0, 1.25, 0, 0, 0.2, INK, 8, 0.1); K.box(-0.2, 0.3, -1.9, 0.5, 0.36, 1.9, KHAKI); K.box(-0.2, -0.3, -1.6, 0.5, -0.24, 1.6, KHAKI);
  for (const z of [-1.2, 1.2]) { K.rod(0.15, -0.26, z, 0.15, 0.32, z, 0.03, DARKWOOD, 4); }
  K.box(-1.5, 0, -0.7, -1.1, 0.05, 0.7, KHAKI); K.box(-1.5, 0, -0.03, -1.1, 0.6, 0.03, KHAKI); K.rod(1.26, 0, -0.7, 1.26, 0, 0.7, 0.04, DARKWOOD, 4); K.ball(0.1, 0.34, 0, 0.16, INK, 6);
}
