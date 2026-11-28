// The Sanctuary — its plan, in numbers alone (no renderer): where it stands, how large it is, where one walks
// and what stops one. Shared by what builds it (Sanctuary.js, cliff.js), by the extra and by the checks.
//
// One great hall under a dome, dug into the cliff that closes the west meadow in the north: a round middle, and
// four arms of the same size round it — the one of the doors, towards the mill, and three chapels of equal
// dignity: a mosque (to the left of who walks in), a church (ahead) and a synagogue (to the right). All of it is
// under the rock but its front: the doors, the rose and the two towers stand in a court cut square into the
// cliff, open to the sky, and the eye of the dome comes out on the slope above, a little lantern in the grass.
//
// Its own frame: x across, y up from its floor, z from the middle towards the doors. `yaw` turns it into the
// world (as a rotation about y in three.js).
export const PLAN = {
  name: 'The Sanctuary',
  at: { x: -224.5, z: -182.0 }, // the middle, under the dome: 68 m into the cliff behind where it first stood
  yaw: 0.549, // its doors look south-south-east, down the meadow to the mill — and into the sun
  floor: 23.6, // the height of its floor (m): eight steps over the foot of the cliff; 10 m of rock and more over its vaults
  R: 12, // the round middle: its radius inside
  T: 1.3, // how thick its walls are
  W: 12 * Math.sin((26.25 * Math.PI) / 180), // half the width of an arm (5.31 m: seven lengths of the round wall)
  spring: 7, // where the vault of an arm springs: its crown is `W` higher
  chord: 20.5, // an arm runs from the round wall to here; a chapel ends in a half circle beyond (radius W)
  cornice: 14, // the top of the round wall inside: the drum stands on it
  drum: 4, // the height of the drum, with its windows
  oculus: 2.3, // the eye of the dome: its radius
  door: { half: 2.0, spring: 4.6 }, // the doorway: half its width; its arch springs here
  steps: { n: 8, run: 0.6, half: 7.5 }, // the stair up to the doors, from the floor of the court
  towers: { half: 2.9, height: 23 }, // the two towers of the front: half their width, how high their walls are
  // the court cut into the cliff before the front: its half width (1.2 m beyond the towers), where its back wall
  // stands (behind the towers), where it opens on the meadow — its floor slopes to the ground there, over `ramp` m
  court: { half: 13.6, back: 16.5, mouth: 38, ramp: 4 },
};
/** The three chapels: which way each lies (the angle of its arm from the arm of the doors). */
export const CHAPELS = [
  { id: 'mosque', angle: Math.PI / 2 }, // to the left of who walks in
  { id: 'church', angle: Math.PI }, // ahead
  { id: 'synagogue', angle: -Math.PI / 2 }, // to the right
];
const P = PLAN, C = Math.cos(P.yaw), S = Math.sin(P.yaw);
/** Its own (x, z) → the world's [x, z]. */
export const toWorld = (lx, lz) => [P.at.x + lx * C + lz * S, P.at.z - lx * S + lz * C];
/** The world's (x, z) → its own [x, z]. */
export const toLocal = (x, z) => { const dx = x - P.at.x, dz = z - P.at.z; return [dx * C - dz * S, dx * S + dz * C]; };
/** A point of an arm (u across, v out from the middle) → its own [x, z]: `angle` 0 is the arm of the doors. */
export const armPoint = (angle, u, v) => [u * Math.cos(angle) + v * Math.sin(angle), -u * Math.sin(angle) + v * Math.cos(angle)];
/** Where the outer face of the front wall is (z), where the landing ends and where the stair does. */
export const FRONT = P.chord + P.T;
export const LANDING = FRONT + 2.2;
export const STAIR_END = LANDING + P.steps.n * P.steps.run;
/** How high a step of the stair is. */
export const STEP = 0.2;
/** The floor of the court, under the floor of the hall (m). */
export const COURT = -P.steps.n * STEP;
/** The arm of the doors and the towers stand out of the rock in the court: its walls are cut there (local z). */
export const FACE = FRONT - 0.2;

/** Is (lx, lz), its own, in the court (the stair and the towers stand in it)? `m`: a margin. */
export const inCourt = (lx, lz, m = 0) => Math.abs(lx) <= P.court.half + m && lz >= P.court.back - m && lz <= P.court.mouth + m && (lz >= FACE - m || Math.abs(lx) >= P.W + P.T - m);

/**
 * The floor of the court at (lx, lz), its own, over the floor of the hall: flat, then down (or up) to the ground
 * of the meadow over the last metres before its mouth. `ground(lx, lz)`: the height of the terrain there, over
 * the floor of the hall (none: flat).
 */
export function courtFloor(lx, lz, ground) {
  const C = P.court, t = (lz - (C.mouth - C.ramp)) / (C.ramp + 0.6);
  if (!ground || t <= 0) return COURT;
  const g = ground(lx, C.mouth + 0.6) - 0.12, s = Math.min(1, t);
  return COURT + (g - COURT) * s * s * (3 - 2 * s);
}

/** Is (lx, lz), its own, on the floor inside (0: no; 1: the round middle; 2: an arm; 3: the apse of a chapel)? `m`: a margin kept from the walls. */
export function room(lx, lz, m = 0) {
  if (Math.hypot(lx, lz) <= P.R - m) return 1;
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const c = Math.cos(a), s = Math.sin(a), u = lx * c - lz * s, v = lx * s + lz * c; // (into the arm's frame)
    if (v < 0 || Math.abs(u) > P.W - m) continue;
    if (v <= P.chord) return 2;
    if (a !== 0 && Math.hypot(u, v - P.chord) <= P.W - m) return 3;
  }
  return 0;
}

/**
 * The floor one walks on at (x, z) of the world: its height, or null where there is none — the hall, its
 * doorway, the landing before it and the stair down to the meadow (a slope, under the steps that are drawn).
 */
export function floorAt(x, z, ground) {
  if ((x - P.at.x) ** 2 + (z - P.at.z) ** 2 > 48 * 48) return null; // (asked for every step taken anywhere in the valley: far from it, answered at once)
  const [lx, lz] = toLocal(x, z);
  if (room(lx, lz, -0.4)) return P.floor;
  if (Math.abs(lx) <= P.door.half + 0.2 && lz > P.chord - 0.5 && lz <= FRONT + 0.1) return P.floor; // the doorway
  if (Math.abs(lx) <= P.steps.half && lz > FRONT - 0.1 && lz <= STAIR_END) {
    const d = lz - LANDING; // (the landing, then the steps)
    return d <= 0 ? P.floor : P.floor - (d / P.steps.run) * STEP;
  }
  if (inCourt(lx, lz)) return P.floor + courtFloor(lx, lz, ground && ((u, v) => { const [gx, gz] = toWorld(u, v); return ground(gx, gz) - P.floor; }));
  return null;
}

/**
 * The roof over (lx, lz), its own, inside (over its floor): the dome over the middle, the vaults of the arms and
 * of the half circles, the arch of the doorway; the sky over the stair and the court (null outside).
 */
export function ceilingAt(lx, lz) {
  const t = room(lx, lz, -0.4);
  if (t === 1) return P.cornice + P.drum + Math.sqrt(Math.max(0, P.R * P.R - lx * lx - lz * lz));
  if (t) {
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const c = Math.cos(a), s = Math.sin(a), u = lx * c - lz * s, v = lx * s + lz * c, d = v > P.chord ? Math.hypot(u, v - P.chord) : Math.abs(u);
      if (v >= 0 && Math.abs(u) <= P.W + 0.4 && (v <= P.chord || a !== 0)) return P.spring + Math.sqrt(Math.max(0, P.W * P.W - Math.min(d, P.W) ** 2));
    }
  }
  if (Math.abs(lx) <= P.door.half + 0.2 && lz > P.chord - 0.5 && lz <= FRONT + 0.1) return P.door.spring + P.door.half * 0.8;
  return inCourt(lx, lz, 0.5) ? 60 : null;
}

/**
 * How much one is in it, 0 … 1: 0 well outside, about 0.1 in the doorway, 1 under the dome (its music is heard
 * by this).
 */
export function inside(x, y, z) {
  if (y < P.floor - 3.5 || y > P.floor + 32 || (x - P.at.x) ** 2 + (z - P.at.z) ** 2 > 48 * 48) return 0;
  const [lx, lz] = toLocal(x, z), r = Math.hypot(lx, lz);
  if (Math.abs(lx) <= P.steps.half && lz > P.chord) return Math.max(0, 0.1 * (1 - (lz - FRONT) / 9)); // the doorway, the stair
  if (!room(lx, lz, -0.5)) return 0;
  if (lz > 0 && Math.abs(lx) < P.W + 0.5 && r > 7) return Math.max(0.1, 1 - (0.9 * (lz - 7)) / (P.chord - 7)); // walking in
  return Math.min(1, Math.max(0.55, 1 - (r - 7) / 30));
}

/** Where one stands before the doors, looking in: { x, y, z, yaw } of the world. */
export const DOOR = (() => { const [x, z] = toWorld(0, FRONT + 1.2); return { x, y: P.floor, z, yaw: P.yaw + Math.PI }; })();

/**
 * What stops one: boxes [lx, lz, half width, half length, yaw, top] in its own frame (the walls, the towers, the
 * cheeks of the stair, the rock of the court), `top` how high over its floor (what flies over the slope above it
 * is not stopped). What stands inside — benches, desks — is added by what builds it.
 */
export function walls() {
  const out = [], t = P.T, mid = P.W + t / 2;
  const arm = (a, u, v, hw, hl, yaw = 0) => { const [x, z] = armPoint(a, u, v); out.push([x, z, hw, hl, yaw + a]); };
  const edge = Math.sqrt(P.R * P.R - P.W * P.W); // where an arm leaves the round wall
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    // (its two side walls)
    for (const s of [-1, 1]) arm(a, s * mid, (edge + P.chord) / 2, t / 2, (P.chord - edge) / 2 + 0.3);
    if (a === 0) {
      // (the front wall, either side of the doorway; the towers; the cheeks of the stair)
      for (const s of [-1, 1]) arm(a, s * (P.door.half + (P.W + t - P.door.half) / 2), P.chord + t / 2, (P.W + t - P.door.half) / 2, t / 2);
      for (const s of [-1, 1]) { arm(a, s * (P.W + t + P.towers.half), FRONT - P.towers.half + 0.9, P.towers.half, P.towers.half); out[out.length - 1][5] = P.towers.height + 1; }
      for (const s of [-1, 1]) arm(a, s * (P.steps.half + 0.45), (FRONT + STAIR_END) / 2 + 0.5, 0.45, (STAIR_END - FRONT) / 2 + 0.6);
      // (the rock of the court: its two sides, and behind the towers)
      const C = P.court, wo = P.W + t;
      for (const s of [-1, 1]) out.push([s * (C.half + 0.3), (C.back + C.mouth) / 2, 0.75, (C.mouth - C.back) / 2 + 0.4, 0, 40], [s * (wo + C.half) / 2, C.back - 0.45, (C.half - wo) / 2 + 0.5, 0.5, 0, 40]);
    } else {
      // (the half circle of a chapel: six lengths of wall)
      const n = 6;
      for (let i = 0; i < n; i++) { const b = ((i + 0.5) / n) * Math.PI, r = P.W + t / 2; arm(a, r * Math.cos(b), P.chord + r * Math.sin(b), (Math.PI * r) / n / 2 + 0.25, t / 2, -b + Math.PI / 2); }
    }
    // (the round wall between this arm and the next: four lengths)
    const a0 = Math.asin(P.W / P.R), n = 4, span = Math.PI / 2 - 2 * a0, r = P.R + t / 2;
    for (let i = 0; i < n; i++) { const b = a + a0 + ((i + 0.5) / n) * span; out.push([r * Math.sin(b), r * Math.cos(b), (span * r) / n / 2 + 0.3, t / 2, b]); }
  }
  return out;
}
