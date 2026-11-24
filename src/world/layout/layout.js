// World layout: the single source of truth shared by the offline bakers (tools/)
// and the runtime. Coordinates are in metres: +X = east, +Z = south, Y = up.
// Y = 0 is the sea level. Everything here is plain data (no three.js imports).
//
// The world in one paragraph: a valley closed by mountains on three sides and open on a cove to the east.
// The mill, its ponds and its garden sit in the middle; the mill stream runs down to the beach, where the
// promenade and the pier are. The area inside BOUNDS can be walked, plus a few places reached from it: a
// stairway cut in the rock up to a village high above the valley, caves, an island in the cove.

export const WORLD = {
  size: 1024, // detailed terrain: a square centred on the origin (playable area + the mountains around it)
  half: 512,
  verticalScale: 1.3, // gentle exaggeration of the surveyed relief
  backdrop: 2048, // extent of the low-resolution surrounding terrain
};

// The surveyed valley is set this much lower than surveyed, so that its lower end is flooded by the sea.
export const DATUM = -9.8;
const D = DATUM;
/** Stream control points given with surveyed heights. */
const lowered = (points) => points.map(([x, z, y, w]) => [x, z, Math.round((y + D) * 100) / 100, w]);

const m2 = (v) => Math.round(v * 100) / 100;
export const LEVELS = {
  sea: 0,
  pondBig: m2(20.0 + D),
  court: m2(20.6 + D),
  pondTail: m2(16.8 + D),
  pondBean: m2(13.6 + D),
};

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// The mill and its outbuilding

export const MILL = {
  // Main house: local +X = garden (east) facade, local +Z = pond-side gable.
  house: { x: -118, z: -9, yaw: -19 * DEG, length: 16.4, width: 7.4, floorY: LEVELS.court + 0.15 },
  // Outbuilding: two volumes in a row, ridge along world X.
  annexA: { x: -136.5, z: -1.2, yaw: 0, length: 8.0, width: 7.0 }, // east volume (with lean-to)
  annexB: { x: -145.0, z: -1.2, yaw: 0, length: 9.0, width: 6.0 }, // west volume
  shed: { x: -127.5, z: -31.5, yaw: -8 * DEG, length: 3.2, width: 2.4 },
};

/** Local (lx, lz) of a building frame -> world [x, z]. */
export function frameToWorld(frame, lx, lz) {
  const c = Math.cos(frame.yaw), s = Math.sin(frame.yaw);
  return [frame.x + lx * c + lz * s, frame.z - lx * s + lz * c];
}

/** Rectangle footprint corners of a frame (optionally inflated). */
export function frameRect(frame, margin = 0, w = frame.width, l = frame.length) {
  const hw = w / 2 + margin, hl = l / 2 + margin;
  return [frameToWorld(frame, -hw, -hl), frameToWorld(frame, hw, -hl), frameToWorld(frame, hw, hl), frameToWorld(frame, -hw, hl)];
}

// ---------------------------------------------------------------------------
// Still water: outlines are closed control polygons (smoothed with splines).

export const PONDS = [
  {
    id: 'big',
    name: 'The Great Pond',
    level: LEVELS.pondBig,
    depth: 2.6,
    bank: 0.45,
    shelf: 5.5, // distance from shore to reach ~full depth
    margin: 9, cutSlope: 0.27, // level strip around the pond, then slope of the cut into the valley sides
    outline: [
      [-131.3, 8.4], [-125, 8.5], [-118.7, 8.9], [-112.4, 13.1], [-106.1, 17.3], [-102.9, 27.3], [-100.8, 39.9], [-105, 50.4], [-114.5, 63],
      [-129.2, 75.6], [-140.8, 83], [-146.5, 87.5], [-150.5, 85], [-155.5, 80], [-162.5, 73], [-170, 70], [-176, 74.5],
      [-178.5, 84], [-179, 92], [-181.5, 100], [-181, 108], [-185, 115], [-195, 118], [-207, 118], [-217, 113],
      [-224, 104], [-231, 96], [-234.5, 89], [-233, 81], [-224, 76], [-215.3, 73.5], [-208, 65], [-196, 57],
      [-183, 49.5], [-184.5, 42], [-178, 37], [-170, 34.5], [-155.5, 24.2], [-149, 21], [-145, 19.5], [-139.7, 13.7],
    ],
    // straight masonry edges (no spline smoothing between these consecutive control points)
    hardEdges: [[0, 4]],
    islands: [
      { id: 'birch', x: -133.4, z: 30.7, rx: 5.0, rz: 6.8, top: 0.75 },
      { id: 'willow', x: -202, z: 102, rx: 8.5, rz: 8.0, top: 0.6 },
    ],
  },
  {
    id: 'tail',
    name: 'Mill Pool',
    level: LEVELS.pondTail,
    depth: 1.1,
    bank: 0.35,
    shelf: 2.5,
    margin: 2.5, cutSlope: 0.36,
    outline: [
      [-102.5, 15.5], [-98.5, 17], [-96, 14], [-95, 6], [-93, -2], [-88, -8], [-86, -15], [-87.5, -22], [-92.5, -24.5],
      [-98, -22.5], [-100.5, -16], [-100, -8], [-100.5, 0], [-102, 8],
    ],
    islands: [],
  },
  {
    id: 'bean',
    name: 'Iris Pond',
    level: LEVELS.pondBean,
    depth: 1.6,
    bank: 0.35,
    shelf: 4,
    margin: 6, cutSlope: 0.28,
    outline: [
      [-79.5, -41.4], [-74.3, -49.8], [-63.8, -54], [-51.2, -55], [-42.8, -51.8], [-32.3, -56.1], [-26, -51.9], [-22.3, -44.5],
      [-22.3, -35.1], [-24.9, -28.8], [-32.3, -25.6], [-38.6, -26.7], [-47, -32], [-55.4, -33.5], [-63.8, -31.9], [-74.3, -33],
      [-78.5, -37.2],
    ],
    islands: [],
  },
  {
    // The pool one dives into from the boards of the tower (see CLIMB.tower): cut into the foot of the hill
    // behind it, on the side away from the climb.
    id: 'dive',
    name: 'The Splash Pool',
    level: 8.0,
    depth: 3.8,
    bank: 0.3,
    shelf: 1.5,
    margin: 2.2, cutSlope: 1.7,
    outline: Array.from({ length: 12 }, (_, k) => { const a = (k / 12) * Math.PI * 2; return [Math.round((-14.9 + Math.cos(a) * 6.6) * 10) / 10, Math.round((112.9 + Math.sin(a) * 6.6) * 10) / 10]; }),
    islands: [],
  },
];

// ---------------------------------------------------------------------------
// Running water. Each control point: [x, z, waterY, width].
// Water heights are monotonic downstream; `falls` mark short steep drops (weirs, cascades).

export const STREAMS = [
  {
    // Mountain torrent: tumbles down the western slopes, drops over the cliff as a waterfall and feeds the
    // great pond. Only its last stretch, from the plunge pool on, is inside the playable area.
    id: 'torrent',
    name: 'The Torrent',
    bedDepth: 0.45,
    flat: 2.2, slope: 0.62, // ravine floor half-width and side slope carved around the stream
    fill: false, smooth: 1.2, // no levelled flood plain, and keep the steps of the bed sharp
    points: [
      // (down the mountain in leaps; then three pools, one above the other, each spilling into the next)
      // (it rises in the lake of the high clearing — see GLADE —, leaves it northwards, tumbles down beside the
      // last flight of steps)
      [-368.5, 195, 68.95, 11], [-362.5, 188.5, 68.95, 13], [-357.5, 181, 68.9, 4.2], [-352, 170, 68.4, 2.6], [-348.5, 159, 63.5, 2.4],
      [-345.2, 147.5, 57.4, 2.4], [-342.2, 146.3, 46.4, 4.5],
      [-338.5, 144.8, 46.3, 9], [-331.1, 141.7, 46.2, 9], [-328.2, 140.5, 46.0, 3.4], [-325.4, 139.4, 36.5, 4.5],
      [-321.9, 137.9, 36.4, 8.5], [-314.5, 134.9, 36.3, 8.5], [-311.5, 133.7, 36.1, 3.4], [-308.7, 132.5, 27.2, 4.5],
      [-305.2, 131.1, 27.1, 9], [-298.8, 128.4, 27.0, 9], [-294.1, 126.5, 26.7, 4.6],
      // (the plunge pool: wide and deep, see PLUNGE)
      [-289.5, 124.6, 26.4, 2.8], [-285, 123, 11.75, 6.0], [-280.5, 124.1, 11.7, 13], [-275.5, 123.1, 11.62, 11.5], [-270.5, 119.8, 11.4, 4.2], [-266, 118.5, 11.2, 3.2], [-254, 117, 10.85, 3.2],
      [-244, 116, 10.55, 3.4], [-236, 114, 10.3, 3.8], [-229, 108, 10.2, 4.5], [-223, 101, 10.2, 6],
    ],
    falls: [0.5, 1.5, 2.5, 6.5, 10.5, 15.5],
    // the big drop, drawn as a sheet of white water: [from sample of the lip, to the plunge pool]
    waterfall: { lip: [-289.5, 124.6], pool: [-285, 123] },
  },
  {
    id: 'canal',
    name: 'The Cascade',
    bedDepth: 0.35,
    flat: 0.8, slope: 0.55,
    lined: true, // stone-edged channel
    points: lowered([
      [-90.5, -22.5, 16.8, 1.5], [-88.4, -26, 16.74, 1.3], [-86.6, -28.8, 15.95, 1.3], [-84.8, -31.4, 15.15, 1.3], [-83, -34, 14.4, 1.3],
      [-81.2, -36.6, 13.66, 1.4], [-79.6, -38.4, 13.62, 1.8], [-77.6, -39.8, 13.6, 2.4],
    ]),
    falls: [1.5, 2.5, 3.5, 4.5],
  },
  {
    // From the last pond to the beach, under the promenade.
    id: 'brook',
    name: 'The Brook',
    bedDepth: 0.4,
    flat: 5, slope: 0.3,
    points: [
      [-23.5, -32.5, 3.8, 2.6], [-20, -29.5, 3.42, 2.4], [-14, -25.6, 3.3, 2.4], [-5.5, -22.8, 3.14, 2.6], [3.5, -21.4, 2.55, 2.6],
      [12, -20.4, 2.36, 2.8], [19, -19.8, 1.62, 3.0], [26, -19.5, 1.36, 3.0], [33, -19.2, 1.2, 3.0], [41, -18.8, 0.62, 3.6],
      [50, -18.2, 0.22, 4.6], [60, -17.6, 0.0, 8],
    ],
    falls: [0.5, 3.5, 5.5, 8.5],
  },
  {
    id: 'raceHead', name: 'The Mill Race', bedDepth: 0.4, flat: 0.3, slope: 0.9, lined: true,
    points: lowered([[-117.9, 9.6, 20.0, 0.9], [-117.3, 6.5, 19.96, 0.9], [-116.5, 2.5, 19.93, 0.9], [-115.9, -0.4, 19.9, 0.9]]),
    falls: [],
  },
  {
    // `walled`: stone walls hold the ground on both sides (a pit and a trench, not a sloping ditch)
    id: 'raceTail', name: 'The Mill Race', bedDepth: 0.35, flat: 0.3, slope: 9, lined: true, walled: true,
    // starts as the wheel pit (wider, under the wheel), then runs east to the lower pond
    points: lowered([[-116.1, -0.72, 18.08, 1.7], [-115.82, -1.55, 18.07, 1.7], [-115.53, -2.38, 18.06, 1.7], [-115.25, -3.2, 18.05, 1.6], [-114.7, -3.75, 18.0, 1.2], [-113.3, -3.1, 17.9, 1.1], [-110.2, -2.6, 17.6, 1.1], [-107.0, -2.5, 17.3, 1.1], [-103.8, -2.6, 17.02, 1.1], [-101.4, -2.8, 16.83, 1.2], [-99.6, -3.0, 16.8, 1.6]]),
    falls: [],
  },
  {
    id: 'spill', name: 'The Spillway', bedDepth: 0.3, flat: 0.3, slope: 0.9, lined: true,
    points: lowered([[-106.4, 20.8, 20.0, 1.7], [-105.3, 19.6, 20.0, 1.7], [-104.4, 18.6, 19.9, 1.7], [-103.5, 17.6, 17.6, 1.7], [-102.6, 16.5, 16.86, 1.7], [-101.7, 15.4, 16.8, 2.0]]),
    falls: [2.5],
  },
];

// The dam closing the big pond. Water leaves it two ways (both listed in STREAMS):
// the spillway at its east end and the mill race that drives the wheel.
export const DAM = {
  crest: [[-118.7, 8.9], [-112.4, 13.1], [-106.1, 17.3]],
  crestY: LEVELS.court,
  width: 2.4,
  wheel: { lx: 4.55, lz: 5.4, radius: 1.65, width: 0.9 }, // in the house frame
};

// ---------------------------------------------------------------------------
// Sea and coast. The coastline runs north -> south with the land on the west side.
// `beach` in [0,1] says how sandy/gentle the shore is at that vertex (0 = rocky cliff).
// The cove lies between two rocky capes where the mountains reach the sea.

export const COAST = {
  line: [
    [300, -540, 0], [282, -470, 0], [262, -400, 0], [238, -330, 0], [208, -270, 0], [176, -222, 0], [146, -186, 0], [116, -160, 0.15],
    [88, -138, 0.5], [66, -112, 0.9], [51, -82, 1.0], [43, -50, 1.0], [40, -18, 1.0], [41, 14, 1.0], [47, 44, 1.0], [58, 70, 0.85],
    [76, 92, 0.45], [102, 108, 0.1], [134, 120, 0], [172, 136, 0], [190, 150, 0],
    // a pocket in the southern cape: the secret cove, shut in by the cliffs, its beach at the far end
    [197, 158, 0.05], [192, 172, 0.45], [184, 187, 1.0], [187, 200, 1.0], [200, 199, 0.55], [212, 190, 0.2], [222, 178, 0.0],
    [234, 186, 0], [246, 196, 0], [276, 246, 0], [298, 310, 0],
    [314, 390, 0], [326, 470, 0], [334, 540, 0],
  ],
  beachWidth: 20, // dry sand between the waterline and the promenade
  promenadeY: 3.2,
};

// More sea to swim in, beyond the outline of the valley (BOUNDS shapes the mountains: this does not): along the
// northern sea cliffs, a few strokes off their foot, as far as the fall that drops into the sea and a little
// beyond. (It overlaps the bay of the valley along its southern edge.)
export const SEA_REACH = [
  [[108, -145], [176, -145], [207, -170], [228, -204], [258, -242], [199, -243], [196, -235], [190, -225], [183, -216], [177, -208], [171, -202], [165, -194], [157, -186], [150, -178], [141, -168], [127, -158], [112, -148]],
  // (and on along the cliffs, to the cove of the golden dog and its beach: the land side of this one runs
  // through the sand of the cove)
  [[196.5, -242], [258, -241], [292, -302], [240, -302], [232, -290], [222, -278], [211, -273], [203, -268.5], [199.5, -262.5], [197, -256], [195.5, -249]],
];
// The shark keeps to the open sea: it goes for whoever swims within `SHARK.near` metres of where these
// stretches end out at sea (and lets go beyond `SHARK.far`). The stretches above are drawn so that someone
// following the foot of the cliffs — to the fall, to the golden cove — stays well out of its reach.
export const SHARK = { near: 30, far: 46 };
// The cove of the golden dog, further up the same coast: a pocket of sand under the cliffs that one only
// reaches by swimming; a stair cut across the face of the cliff climbs from it to a ledge high over the sea,
// where a statue stands: a golden Australian shepherd fifteen metres tall, and a plaque.
//   cove, ledge   level places: centre, half sizes, height (the rock is cut — or built up — to them)
//   stairs        the flights, from the sand to the ledge (see STAIRWAY)
//   statue        where it sits and which way it looks (0: south, towards +Z); `plaque`: what it says
export const NORTH = {
  name: 'The Golden Cove',
  cove: { x: 199.5, z: -262.5, rx: 6.2, rz: 7.2, y: 1.15 },
  // (its beach: `face` metres of sand going down at `slope`, then the shelf under the water going down at
  // `drop`; shaped out to `reach` metres from the edge of the cove)
  beach: { face: 9, slope: 0.2, drop: 0.36, reach: 24 },
  ledge: { x: 226.5, z: -333, rx: 11, rz: 10.5, y: 44.4 },
  stairs: [{ width: 2.3, landing: 1.2, points: [[203.4, -267.6, 1.5], [212, -285, 16.2], [219, -305, 31.2], [227, -322.6, 44.4]] }],
  statue: { x: 225.5, z: -335, yaw: -0.3, height: 15, name: 'CROKMOU', plaque: 'BEST DOG EVER' },
};
// Where the capes are rock, the land stands high right at the water: sea cliffs, fluted and green, of about
// `height` metres (more or less along the coast). They only exist outside the playable valley.
export const SEA_CLIFFS = { height: 52, vary: 20, flute: 4.2, every: 11 };
// A stream that drops from the cliffs of the northern cape straight into the sea: the lip of the fall, the
// way the water goes (towards the sea), the level of the hanging valley it comes from.
export const SEA_FALL = { x: 168, z: -208, dir: [0.74, 0.67], y: 41, width: 3.4 };
// The secret cove (see the pocket in COAST.line): reached by swimming round the southern cape.
// (x, z): the middle of its camp, on the sand; `sea`: which way the bay lies from there.
export const COVE = { x: 178, z: 196, sea: [0.93, -0.37], r: 17 };

// The big pier: leaves the promenade, crosses the beach and heads out to sea.
export const PIER = {
  rootX: 16, rootZ: 6,
  heading: 6 * DEG, // 0 = +X (east), positive towards +Z (south)
  length: 132,
  width: 17,
  deckY: 4.7,
  rampLength: 16, // the deck climbs from the promenade level over this distance
  headLength: 60, headWidth: 48, // wide platform carrying the big wheel
  wheel: { along: 101, radius: 31, hubY: 4.7 + 35.5 },
};

export function pierToWorld(along, side = 0) {
  const c = Math.cos(PIER.heading), s = Math.sin(PIER.heading);
  return [PIER.rootX + along * c - side * s, PIER.rootZ + along * s + side * c];
}

// ---------------------------------------------------------------------------
// The island in the cove: a rock about a hundred metres off the beach. A path winds round it up to the top,
// with hollows in the rock on its inner side and beams over the drop on its outer side.

export const ISLAND = {
  x: 150, z: -84,
  start: Math.PI, // direction, from the centre, of the foot of the path: west, facing the beach
  turns: 2.25,
  r0: 29, r1: 8, // radius of the path at the foot and at the top
  y0: 1.0, y1: 34.5, // height of the path at both ends
  width: 3.8,
  summit: 6.5, // radius of the flat top
  alcove: { depth: 2.7, half: 2.0 }, // hollows: how far into the rock, half length along the path
  alcoves: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9], // where, as fractions of the way up
  beams: [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85],
};
const ISLAND_THETA = ISLAND.turns * 2 * Math.PI, ISLAND_STEPS = 360;
const islandRadius = (th) => ISLAND.r0 - (ISLAND.r0 - ISLAND.r1) * (Math.min(Math.max(th, 0), ISLAND_THETA) / ISLAND_THETA) ** 0.9;
const islandArc = (() => {
  // length of the path from its foot, tabulated against the angle travelled
  const t = new Float64Array(ISLAND_STEPS + 1), d = ISLAND_THETA / ISLAND_STEPS;
  for (let i = 1; i <= ISLAND_STEPS; i++) {
    const r0 = islandRadius((i - 1) * d), r1 = islandRadius(i * d);
    t[i] = t[i - 1] + Math.hypot(r1 - r0, ((r0 + r1) / 2) * d);
  }
  return t;
})();
export const ISLAND_LENGTH = islandArc[ISLAND_STEPS];
/** The island path after turning `theta` radians from its foot: { r, s (length walked), y }, or null beyond its ends. */
export function islandAt(theta) {
  if (theta < 0 || theta > ISLAND_THETA) return null;
  const f = (theta / ISLAND_THETA) * ISLAND_STEPS, i = Math.min(ISLAND_STEPS - 1, Math.floor(f));
  const s = islandArc[i] + (islandArc[i + 1] - islandArc[i]) * (f - i);
  return { r: islandRadius(theta), s, y: ISLAND.y0 + (ISLAND.y1 - ISLAND.y0) * (s / ISLAND_LENGTH) };
}
/** The island path at a fraction u (0 foot, 1 top) of its length: position, height, direction from the centre, unit tangent uphill. */
export function islandPath(u) {
  const target = Math.min(1, Math.max(0, u)) * ISLAND_LENGTH;
  let lo = 0, hi = ISLAND_STEPS;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (islandArc[m] <= target) lo = m; else hi = m; }
  const theta = ((lo + (target - islandArc[lo]) / (islandArc[hi] - islandArc[lo] || 1)) / ISLAND_STEPS) * ISLAND_THETA;
  const a = ISLAND.start + theta, r = islandRadius(theta), dr = (islandRadius(theta + 0.01) - islandRadius(theta - 0.01)) / 0.02;
  let tx = dr * Math.cos(a) - r * Math.sin(a), tz = dr * Math.sin(a) + r * Math.cos(a);
  const l = Math.hypot(tx, tz) || 1;
  tx /= l; tz /= l;
  return { x: ISLAND.x + Math.cos(a) * r, z: ISLAND.z + Math.sin(a) * r, y: ISLAND.y0 + (ISLAND.y1 - ISLAND.y0) * (target / ISLAND_LENGTH), r, angle: a, tx, tz, nx: Math.cos(a), nz: Math.sin(a) };
}

// ---------------------------------------------------------------------------
// Roads and paths. kind: asphalt | gravel | dirt | boardwalk

// The race has two tracks, and both are kept. `grove` is the one in use: 400 m drawn to be driven flat out —
// two long sweepers (the western one through a grove planted for it), esses, two chicanes, a ramp: whoever
// drives well never has to lift (no bend is tighter than 21 m in the middle of the track; a quad at full
// speed turns in 12 m, in 17.5 m while a boost lasts). `classic` is the first one: an oval of some 330 m
// round the wheat field. Each has
// its own baked maps (assets/world, assets/world-classic: `TRACK=classic npm run bake:world` bakes the second),
// so that the other one can be tried without rebuilding anything: add ?track=classic to the address. Times
// driven on the track that is not in use are not kept.
//   points   the middle of the track, closed (it ends where it starts); one drives the way it is listed
//   boosts, jump, chicanes, logs   where things stand, as shares of the lap (see RACE)
//   gap      how far apart the two walls of a chicane stand, metres
//   grove    a wood planted for the track to thread: centre, half sizes, how many trees (or none)
export const TRACKS = {
  grove: {
    points: [
      // the straight of the start, westwards; the western sweeper (an arc of 27.5 m round (-116, -132))
      [-50, -102.5], [-80, -103.5], [-104, -104.5], [-116, -104.5], [-129.75, -108.2], [-139.8, -118.25], [-143.5, -132], [-139.8, -145.75], [-129.75, -155.8], [-116, -159.5],
      // esses, then a long straight for the ramp; the eastern sweeper (24 m round (3, -129))
      [-98, -157], [-84, -153.5], [-70, -156.5], [-60, -158], [-44, -157], [-28, -156], [-12, -155], [3, -153], [15, -149.8], [23.8, -141], [27, -129], [23.8, -117], [15, -108.2], [3, -105],
      // and back to the line
      [-14, -104], [-32, -103.2], [-50, -102.5],
    ],
    boosts: [0.03, 0.3, 0.5, 0.7], jump: 0.56, chicanes: [0.085, 0.9], gap: 24, logs: [],
    grove: { x: -131, z: -132, rx: 30, rz: 37, trees: 120 },
  },
  classic: {
    points: [[-50, -102.5], [-80, -103.5], [-98, -108.5], [-106, -122], [-106, -142], [-96, -156], [-60, -158.5], [-24, -156.5], [4, -152], [20, -144], [26, -130], [22, -116], [8, -107.5], [-20, -104], [-50, -102.5]],
    boosts: [0.18, 0.4, 0.84], jump: 0.52, chicanes: [], logs: [],
    grove: null,
  },
};
const askedTrack = (typeof process !== 'undefined' && process.env && process.env.TRACK) || (typeof location !== 'undefined' && (/[?&]track=([a-z]+)/.exec(location.search) || [])[1]) || '';
/** The track of this page (of this bake): the one in use unless another is asked for. */
export const TRACK = Object.hasOwn(TRACKS, askedTrack) ? askedTrack : 'grove';
/** The folder of the baked maps that go with it (under assets/). */
export const WORLD_DIR = TRACK === 'grove' ? 'world' : `world-${TRACK}`;

export const PATHS = [
  {
    // The only road into the valley: it comes out of a tunnel under the northern mountains.
    id: 'lane', kind: 'asphalt', width: 3.3, cut: 1,
    points: [
      [-80, -190], [-86, -176], [-95, -160], [-105.7, -144.1], [-113.5, -124.1], [-117.1, -110.2], [-120.7, -91.7],
      [-122.4, -74.2], [-122.2, -58], [-120.6, -44], [-118.6, -35], [-116.2, -29.5], [-113.6, -26.2],
    ],
  },
  {
    // From the mill down the valley to the seafront: the way to the pier.
    id: 'valley', kind: 'gravel', width: 2.2, cut: 0.6,
    points: [
      [-111.5, -27.5], [-105, -31.5], [-97, -32.5], [-89.5, -30.2], [-84.6, -31.4], [-80, -28.5], [-74, -25.5], [-62, -22.5],
      [-48, -22], [-36, -20.5], [-27, -16.5], [-20, -9], [-16, -1], [-15, 5],
    ],
  },
  {
    id: 'pondloop', kind: 'dirt', width: 1.5, cut: 0.5,
    points: [
      [-102.2, 21.4], [-98.2, 27], [-96.2, 40], [-100.5, 53], [-110, 66.5], [-125, 79.5], [-138, 88], [-147, 93], [-158, 91],
      [-170, 96], [-176, 108], [-184, 120.5], [-196, 123.5], [-209, 123], [-221, 117.5], [-229.5, 111.5], [-239, 103],
      [-241, 90], [-238, 77], [-227, 70], [-217, 67.5], [-209, 59], [-198, 51.5], [-190, 44], [-183, 32.5],
      [-170, 28.5], [-157, 18.5], [-146, 13.5], [-140.5, 7.2], [-136.5, 4.6],
    ],
  },
  {
    // Spur of the pond path to the foot of the waterfall.
    id: 'falls', kind: 'dirt', width: 1.3, cut: 0.5,
    points: [[-239, 103], [-247, 109.5], [-257, 112.5], [-267, 113.6], [-274, 114.9], [-276.4, 114.6]],
  },
  {
    id: 'garden', kind: 'gravel', width: 1.2, cut: 0.3,
    points: [[-128.6, -5.2], [-128.2, -9.5], [-127.8, -14.5], [-128.4, -20], [-129, -25.5], [-129.2, -31], [-131, -36.5], [-136, -40.5], [-144, -42]],
  },
  {
    // From the lane through the wheat fields, over the lookout hill, down to the north end of the beach.
    id: 'fields', kind: 'dirt', width: 1.4, cut: 0.5,
    points: [
      [-120.5, -102], [-108, -99], [-92, -96], [-76, -93], [-60, -90.5], [-44, -89], [-30, -89.5], [-16, -92], [-4, -93], [8, -90],
      [18, -86], [27, -86.5],
    ],
  },
  {
    // From the dam up the southern hillside to the old tree.
    id: 'hill', kind: 'dirt', width: 1.4, cut: 0.5,
    points: [
      [-100.5, 53], [-88, 60], [-74, 70], [-62, 82], [-54, 96], [-52, 110], [-58, 122], [-70, 130], [-84, 135], [-96, 137.5],
    ],
  },
  {
    // …and from the hillside down to the south end of the beach.
    id: 'shore', kind: 'dirt', width: 1.4, cut: 0.5,
    points: [[-62, 82], [-48, 70], [-32, 60], [-14, 53], [4, 49], [18, 50], [27, 55]],
  },
  {
    // From the pond path to the foot of the stairway.
    id: 'stairs', kind: 'dirt', width: 1.5, cut: 0.5,
    points: [[-238, 77], [-249, 72.5], [-261, 65.5], [-271.5, 58.8]],
  },
  {
    // From the pond path into the woods, to the camp.
    id: 'camp', kind: 'dirt', width: 1.3, cut: 0.5,
    points: [[-176.5, 30.5], [-181, 22], [-186, 12], [-190.5, 3], [-193, -2]],
  },
  {
    // From the shore path to the gate of the climb.
    id: 'climb', kind: 'gravel', width: 1.8, cut: 0.5,
    points: [[4, 49.6], [3.4, 56], [1.9, 63]],
  },
  {
    // The race track: a loop round the wheat fields (see RACE and TRACKS). Closed: it ends where it starts.
    id: 'race', kind: 'gravel', width: 7.5, cut: 1,
    points: TRACKS[TRACK].points,
  },
  {
    // The path that winds round the island.
    id: 'island', kind: 'dirt', width: 3.0, cut: 0.2,
    points: Array.from({ length: 96 }, (_, i) => { const p = islandPath(i / 95); return [Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100]; }),
  },
];

// ---------------------------------------------------------------------------
// The stairway and the high village. Steps cut in the rock climb the western mountain in five flights, from
// the end of the pond to a shelf nearly a hundred metres above the valley, where a few houses look out over
// everything down to the sea.

export const STAIRWAY = {
  width: 2.6,
  // corners [x, z, y]: a straight flight between two of them, a landing at each
  // (the last flight arrives square on to the edge of the village, between the two walls of its lookout)
  points: [[-273, 58, 22.7], [-300, 74, 35.9], [-316, 48, 52.7], [-336, 68, 74.5], [-339, 31, 94.7], [-356, 30, 108]],
  landing: 1.7, // radius of the landings
};

// Above the great waterfall the torrent comes down in three steps, a pool on each. Rock stairs climb beside
// them from the foot of the fall; each terrace is a bank of level rock on the north side of its pool.
// (levels: the walking level of each terrace; `bank`: the polygon one can walk, pool included)
export const FALLS = {
  stairs: [
    // (the first flight starts on the shore of the plunge pool, where the path ends, and cuts through the ridge)
    { width: 2.2, landing: 1.4, points: [[-277.5, 114.2, 12.8], [-280.5, 105.5, 15.5], [-297.5, 108.5, 21.6], [-301.5, 120.5, 27.45]] },
    { width: 2.2, landing: 1.4, points: [[-304.5, 123.4, 27.45], [-319.5, 127.2, 36.75]] },
    { width: 2.2, landing: 1.4, points: [[-322.5, 129.2, 36.75], [-337.5, 133.4, 46.65]] },
    // (and on, from the top terrace, through a cleft in the rock up to the high clearing)
    { width: 2.2, landing: 1.4, points: [[-346.5, 141, 46.65], [-357.5, 150, 54.8], [-360.5, 164, 62.8], [-368.5, 175.5, 69.3]] },
  ],
  levels: [
    { y: 27.45, bank: [[-291.5, 119.5], [-306.5, 117.5], [-311, 127.5], [-309, 137], [-296.5, 133], [-290, 129]] },
    { y: 36.75, bank: [[-313, 124.5], [-324.5, 124.5], [-328.5, 134.5], [-325.5, 143.5], [-313.5, 139.5], [-310.5, 131]] },
    { y: 46.65, bank: [[-331, 130.5], [-343.5, 131], [-348, 141.5], [-344.5, 151.5], [-331, 147], [-327, 137.5]] },
  ],
  // on the top terrace: a bench that looks down the three falls to the valley
  seat: { x: -341.5, z: 134.6, yaw: 1.2 },
};

// The high clearing, above and behind the falls: a meadow ringed by woods on a shelf of the mountain, the lake
// the torrent rises in, a fire, benches. Reached by the last flight of FALLS.stairs. (x, z): its middle; rx,
// rz: its half sizes; y: its level.
export const GLADE = { x: -357, z: 193, rx: 27, rz: 21, y: 69.3, fire: [-348.5, 199], name: 'The High Clearing' };

// The pool at the foot of the great waterfall is dug deep between these two points (`r` metres around the
// line, `depth` metres under the water): one can leap into it from the lowest terrace, sixteen metres up.
// Its banks shelve gently (`shelf`: the slope) as far as one can stand, then drop.
export const PLUNGE = { a: [-285, 123.2], b: [-274.5, 123.2], r: 7.4, depth: 3.3, shelf: 0.72 };

const SQUARE = { x: -378, z: 37 };
// The temple on the mountain. Its shelf is levelled at `y`; the stairway arrives on the east side, between the
// two walls of the lookout, under the gate. Each building: centre, yaw (its front, local +X, looks that way).
const facing = (x, z, tx = SQUARE.x, tz = SQUARE.z) => Math.round(Math.atan2(-(tz - z), tx - x) * 1000) / 1000;
export const VILLAGE = {
  y: 108,
  outline: [[-353, 18], [-353, 52], [-363, 63], [-389, 65], [-403, 52], [-406, 27], [-394, 11], [-368, 9]],
  square: SQUARE,
  fountain: { x: -374.5, z: 37 }, // the lotus pond
  // low wall of the lookout, along the edge above the valley (east side)
  wall: [[-362.4, 62.2], [-353.3, 51.6], [-353.3, 33.4]],
  wall2: [[-353.3, 26.6], [-353.3, 18.4], [-367.6, 9.3]],
  temple: {
    hall: { x: -393.2, z: 36.5, yaw: facing(-393.2, 36.5, -360, 36.5), plinth: 6.2 }, // the pagoda: it looks east, over the court, at the valley
    gate: { x: -358.6, z: 30, yaw: 0 },
    pavilions: [
      { x: -381, z: 15.6, w: 4.6, l: 7.2, yaw: facing(-381, 15.6, -381, 37) },
      { x: -384, z: 58.4, w: 4.6, l: 7.2, yaw: facing(-384, 58.4, -384, 37) },
      { x: -399.5, z: 20.5, w: 4.2, l: 5.6, yaw: facing(-399.5, 20.5) },
    ],
    bell: { x: -362.2, z: 17.6, yaw: 0.55 },
    stupa: { x: -365, z: 53.6, yaw: 0.4 },
    wheels: { x: -370.6, z: 11.9, yaw: -0.08, count: 8 },
    urn: { x: -382.6, z: 36.8 },
    lanterns: [[-362.5, 27.4], [-362.5, 32.6], [-368.5, 33.2], [-368.5, 40.6], [-380.5, 31.6], [-380.5, 41.8], [-386, 31.2], [-386, 42]],
    masts: [[-355, 56.5], [-355.4, 21.2]],
  },
};

// Thirty little villages perched on the mountains all around, one for each company that wants its own:
// nobody walks there, one is carried (see the Sky Gate). Their sites are chosen by the baker — shoulders and
// tops that look down on the valley — and written to world.json; who lives where is in sponsors.js.
// (`hall`, `pavilions`: where the buildings of a village stand on its shelf — [right, towards the valley] from
// its middle — and their half sizes; nothing grows under them)
export const SKY = {
  count: 50, pad: 12.5, apart: 64, gate: { x: -110.5, z: -39, yaw: -1.2 },
  hall: { x: 0, z: -8.1, hw: 3.2, hl: 1.9 }, pavilions: [{ x: -7.0, z: -1.6, h: 2.35 }, { x: 7.0, z: -1.6, h: 2.35 }],
}; // (the gate: on the lawn by the lane, on the way from the arrival to the mill)

// ---------------------------------------------------------------------------
// Games and dangers

// The climbing game ("Mostly Up"): stones to jump from one to the next, up to a platform `height` metres above the ground.
// (x, z) is the middle of its round lawn, levelled at y; one comes in through the gate, on the north side.
// `tower`: the striped tower one climbs to watch and cheer, in a bay cut into the hill behind the lawn (its
// winding stair rises `pitch` metres a turn, `turns` times; nobody gets from it into the game).
export const CLIMB = { x: 0, z: 80, y: 8.3, r: 13.5, height: 90, gate: [1.6, 64.6], name: 'Mostly Up', tower: { x: -9.5, z: 101, r: 6.2, pitch: 7, turns: 12 } };
// A pond of acid in a hollow of the north-western woods. Nobody tells you it is there.
export const ACID = { x: -236, z: -82, r: 4.2 };
// The race: three laps of the track round the wheat fields (the path 'race'), on a quad, against the clock.
// `start`: where the line is, as a share of the lap from the first point of the path (one drives the way the
// path is listed); `boosts` and `jump`: where the pads and the ramp are, the same way.
// `paddock`: on which side of the line one asks to race, and the board stands (1: on the right of the way
// the track is listed turned a quarter… in short: the side of the valley).
// `grove`: a wood planted for the track to thread (centre, half sizes, how many trees); `chicanes`: where
// two walls of bales, one from each side, make the way zigzag; `logs`: where a log lies across half the track
// (hop it, or go round). The ramp stands at the end of a funnel of bales: everybody flies.
// `every`: a race leaves every so many seconds, on a clock everybody shares: friends who ask for the same
// start leave together. `starts`: the names of the starts, in turn (a colour: it is on the board by the tent).
export const RACE = {
  name: 'Quadmania', laps: 3, width: 7.5, start: 0.012, paddock: 1, every: 5, starts: ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange'],
  boosts: TRACKS[TRACK].boosts, jump: TRACKS[TRACK].jump, chicanes: TRACKS[TRACK].chicanes, gap: TRACKS[TRACK].gap || 24, logs: TRACKS[TRACK].logs, grove: TRACKS[TRACK].grove,
};
// Flappy Robot: a little theatre on the plaza at the foot of the pier, where one flies on the spot while the
// scenery goes by. (x, z): the middle of the front of its stage; `yaw`: which way the stage looks;
// `width`, `height`: the opening of the stage.
export const WING = { name: 'Flappy Robot', x: -7.2, z: 12.6, yaw: Math.PI * 0.75, width: 12, height: 5.2 };
// The boulder of the island: it rolls down the whole path, again and again (seconds; metres per second).
export const BOULDER = { radius: 1.55, speed: 7.2, period: 52 };

// ---------------------------------------------------------------------------
// Caves: galleries and chambers under the mountains. Each node is [x, z, half width, floor, height of the roof];
// the first one is the mouth, a flat end at the foot of the rock face, and the gallery runs on from there.
// `open` is how many metres the mouth cuts through the face before the rock closes over it.

export const CAVES = [
  {
    // behind the waterfall: a chamber under the torrent, then a narrow passage to a second, hidden room
    // (`water`: its mouth opens on water, not on a doorstep of level ground)
    id: 'grotto', name: 'The Hidden Grotto', open: 3.6, water: true,
    nodes: [
      [-286.1, 122.5, 2.7, 12.0, 3.6], [-290.6, 122.8, 4.3, 12.05, 4.6], [-297.5, 123.5, 7.2, 12.1, 6.2], [-303.0, 121.0, 4.6, 12.2, 4.7],
      [-307.0, 115.5, 2.1, 12.6, 3.1], [-311.0, 109.2, 2.3, 13.2, 3.3], [-316.0, 103.0, 5.9, 13.6, 5.6], [-319.6, 99.2, 2.6, 13.6, 3.0],
    ],
    lights: [[-299.5, 126.5, 'crystal'], [-294.5, 119.0, 'lantern'], [-318.5, 104.5, 'crystal'], [-313.5, 100.5, 'crystal'], [-309.2, 112.0, 'crystal']],
    chairs: [[-299.5, 121.2, 0.9], [-297.0, 119.6, -0.3], [-300.6, 118.4, 2.1], [-314.5, 104.8, 2.4], [-317.6, 101.8, 0.6]],
    table: [-298.9, 119.6],
  },
  {
    // at the foot of the northern mountains, behind the fields
    id: 'north', name: 'Echo Cave', open: 4.6,
    nodes: [[-32, -170.4, 2.3, 8.3, 3.4], [-32.3, -177, 2.3, 8.4, 3.4], [-33.5, -184.5, 2.6, 8.6, 3.6], [-35.5, -193.5, 7.0, 8.8, 6.0], [-37, -200, 3.4, 8.8, 3.8]],
    lights: [[-31.0, -191.0, 'lantern'], [-39.8, -195.6, 'lantern'], [-33.2, -180, 'lantern']],
    chairs: [[-36.9, -191.2, 1.9], [-34.0, -191.6, -1.4], [-35.2, -195.4, 3.3], [-37.9, -194.2, 2.6]],
    table: [-35.6, -193.2],
  },
  {
    // under the southern slopes, a few steps from the old tree
    id: 'south', name: 'Hollow of the Old Tree', open: 3.6,
    nodes: [[-124, 184.0, 2.2, 35.75, 3.3], [-124.5, 190, 2.2, 35.85, 3.3], [-126.3, 197.5, 2.5, 36.0, 3.5], [-127, 206.5, 6.6, 36.2, 5.8], [-126, 213, 3.2, 36.2, 3.8]],
    lights: [[-131.2, 204.5, 'lantern'], [-123.2, 208.8, 'crystal'], [-125.4, 194, 'lantern']],
    chairs: [[-128.6, 208.6, 0.4], [-125.6, 208.4, -0.5], [-127.2, 204.2, 3.14]],
    table: [-127.1, 206.6],
  },
  {
    // in the northern sea cliffs, right behind the fall that drops into the sea: only swimmers find it.
    // (`reach`: how far in front of the mouth one may come to it — here, from the sea, through the fall;
    // `slip`: the sea bed rises to its doorstep, to walk out of the water)
    id: 'sea', name: "The Smugglers' Den", open: 3.2, water: true, slip: 4.5, reach: 13,
    nodes: [[165.7, -210.15, 2.4, 0.34, 3.4], [161.4, -214.1, 2.4, 0.4, 3.4], [156.8, -217.4, 2.2, 0.55, 3.2], [151.2, -219.2, 2.7, 0.72, 3.6], [144.2, -218.2, 6.8, 0.85, 6.0], [138.4, -216.6, 3.3, 0.85, 3.8]],
    lights: [[159.2, -214.6, 'lantern'], [149.3, -221.6, 'crystal'], [142.0, -213.6, 'lantern'], [140.6, -220.4, 'crystal'], [139.6, -214.2, 'crystal']],
    chairs: [[145.5, -220.1, -1.3], [143.9, -220.8, 0.46], [143.6, -219.1, 2.29]],
    table: [144.4, -219.8],
    hoard: [139.4, -216.9, 1.84], // a chest that someone left there, open, facing that way
    stock: [[145.6, -213.3, 'keg'], [144.4, -212.9, 'keg'], [145.8, -223.0, 'keg'], [142.6, -223.2, 'crate'], [143.7, -223.5, 'crate']], // what they were hiding
  },
];

// ---------------------------------------------------------------------------
// Places to rest

// The camp in the woods north of the pond: hammocks round a fire.
export const CAMP = { x: -197, z: -9, r: 12.5 };
// Beanbags at the north end of the beach (the left end, looking out to sea)…
export const BEACH_LOUNGE = { x: 43.5, z: -92, yaw: 0.35, r: 9 };
// …and on a deck on stilts over the great pond, reached by a gangway from the north bank.
export const POND_DECK = { x: -152.5, z: 37.5, yaw: 0.06, w: 16, l: 12, y: LEVELS.pondBig + 0.85, gangway: [[-151, 22.2], [-151.9, 31.5]] };

// Boardwalk along the back of the beach (planks laid on graded ground).
export const PROMENADE = {
  width: 8.5,
  y: COAST.promenadeY,
  points: [[41, -106], [28, -88], [19, -54], [15.5, -18], [16.5, 16], [23.5, 51], [37, 82]],
  plaza: { x: 0, z: 4.3, r: 15 },
};

// Dry-stone retaining walls of the rock garden (uphill side = left of the direction of travel).
export const TERRACES = [
  { h: 1.15, points: [[-134.2, -6.4], [-130.5, -7.4], [-127, -6.2], [-124.6, -3.6]] },
  { h: 1.25, points: [[-151, -11.5], [-142, -14.4], [-133.5, -14.2], [-127, -12.2], [-122.6, -13.6], [-121, -18.5]] },
  { h: 1.1, points: [[-153.5, -19.5], [-143, -22.6], [-134, -22.4], [-127.5, -20.4], [-123.4, -22.6]] },
  { h: 1.0, points: [[-152, -28], [-142, -30.8], [-133, -30.4], [-126, -28.2]] },
];

export const ROCK_GARDEN = {
  outline: [[-158, -6], [-134.5, -6.2], [-124.8, -3.4], [-120.2, -17], [-120.8, -31], [-125, -40.5], [-136, -45], [-150, -45.5], [-161, -34], [-163, -18]],
  baseY: LEVELS.court,
  topY: Math.round((27.4 + D) * 100) / 100,
  // steepest ascent direction (unit vector, pointing uphill)
  up: [-0.42, -0.91],
  run: 40,
};

// Flat or gently sloped authored areas: { outline, y | (y0,y1,axis) , feather }
export const PADS = [
  // courtyard between the house, the outbuilding and the pond wall
  { id: 'court', y: LEVELS.court, feather: 2.2, outline: [[-135.5, -5.8], [-124.4, -3.2], [-116.6, -0.4], [-114.4, 4.5], [-117.4, 8.3], [-125, 8.1], [-133, 7.9], [-141, 4.4], [-150.4, 4.2], [-150.6, -5.6]] },
  // driveway in front of the carport
  { id: 'drive', y: Math.round((20.9 + D) * 100) / 100, feather: 3.5, outline: [[-120.5, -30.5], [-110.5, -30.5], [-109, -22], [-112, -18], [-119.5, -19.5]] },
  // seafront plaza at the foot of the pier
  { id: 'plaza', y: COAST.promenadeY, feather: 7, outline: [[-16, -3], [-7, -12], [7, -12], [12, -7], [12, 16], [7, 20.5], [-7, 20.5], [-16, 11.5]] },
];

// ---------------------------------------------------------------------------
// Land cover hints for the baker.

export const PARK = [
  // grass verges under the plane trees, along the lane down to the mill
  [[-96, -146], [-104, -124], [-108, -110], [-110, -92], [-111, -76], [-111, -20], [-119, -22], [-121, -34], [-130, -50], [-134, -62], [-134, -78], [-132, -94], [-128, -112], [-122, -128], [-114, -148]],
  // garden lawns east of the house, around the lower ponds, down to the seafront
  [[-121, -72], [-100, -80], [-60, -72], [-15, -68], [6, -64], [10, -40], [9, -24], [2, 26], [-10, 36], [-34, 30], [-60, 12], [-86, 23], [-100, 21], [-106, 9], [-114, 2], [-111, -20]],
  // parkland around the big pond
  [[-140, 4], [-170, 16], [-204, 28], [-252, 40], [-272, 62], [-280, 126], [-250, 142], [-204, 132], [-180, 126], [-150, 102], [-134, 92], [-99, 62], [-93, 30], [-99, 10]],
  // the clearing of the old tree
  [[-61, 138], [-73, 163], [-108, 177], [-143, 167], [-161, 139], [-147, 110], [-112, 97], [-77, 107]],
  // the lookout hill
  [[-22, -104], [-4, -108], [14, -102], [20, -88], [10, -76], [-8, -74], [-22, -84]],
];

export const FIELDS = [
  { crop: 'wheat', outline: [[-102, -147.5], [-56, -147.5], [-46, -128], [-52, -108.5], [-100, -110]] },
  { crop: 'cereal', outline: [[-42, -150], [6, -144], [16, -124], [-2, -112], [-36, -110]] },
  { crop: 'wheat', outline: [[-36, 70], [-12, 60], [10, 57], [26, 66], [30, 98], [6, 114], [-30, 108]] },
];

// Gentle hills added to the surveyed relief: [x, z, radius, height]
export const HILLS = [
  [-2, -90, 34, 8.5], // the lookout, between the fields and the sea
  [-110, 138, 50, 5], // the knoll of the old tree
  [-212, -62, 44, 5], // wooded rise north-west of the pond
];

// Hand-placed specimen trees: [x, z, species, scale]
export const HERO_TREES = [
  [-110, 138, 'elder', 1.05], // the old tree in its clearing
  [-133.4, 30.7, 'birch', 1.0],
  [-131.6, 33.2, 'birch', 0.7],
  [-202.5, 102, 'willow', 1.1],
  [-237.5, 84, 'willow', 1.0],
  [-195, 55.5, 'oak', 1.35],
  [-160.5, 21.5, 'oak', 1.15],
  [-144.5, 13.2, 'oak', 1.0],
  [-168, 78, 'cypress', 1.25],
  [-161, 82.5, 'oak', 1.0],
  [-173, 86, 'beech', 1.1],
  [-119.2, -62, 'plane', 1.1],
  [-126.5, -86, 'plane', 1.2],
  [-146, -41.5, 'pine', 1.15],
  [-137.5, -45, 'pine', 1.0],
  [-153.5, -37, 'pine', 1.25],
  [-130.5, -46.5, 'pine', 0.9],
  [-160, -43, 'pine', 1.05],
  [-143.2, -9.5, 'cypress', 0.9],
  [-52.5, -29.5, 'cypress', 1.0],
  [-44.5, -27.6, 'birch', 0.85],
  [-109, -1.5, 'beech', 0.55],
  [-104.5, -30, 'oak', 1.0],
  [-93, 22, 'oak', 1.2],
  [-70, -62, 'beech', 1.2],
  [-12, -64, 'oak', 1.25],
  [-84, 2, 'oak', 1.15],
  [4, -92, 'pine', 1.2], // on the lookout
  [-9, -84, 'pine', 0.95],
  [-30, 40, 'willow', 0.95],
  // palms on the sand of the secret cove
  [171.2, 185.8, 'palm', 0.9], [165.6, 191.4, 'palm', 0.8], [166.2, 204.6, 'palm', 0.95], [172.6, 209.4, 'palm', 0.75], [182.4, 186.2, 'palm', 0.7], [183.6, 207.2, 'palm', 0.85],
  // on the island: pines holding on to its ledges, a palm by the landing
  ...[[0.07, 'palm', 0.8, -3.6], [0.2, 'pine', 0.7, 3.3], [0.31, 'cypress', 0.8, 3.2], [0.49, 'pine', 0.85, 3.4], [0.6, 'pine', 0.6, 3.2], [0.7, 'cypress', 0.7, 3.3], [0.8, 'pine', 0.75, 3.3], [0.9, 'pine', 0.55, 3.2]]
    .map(([u, species, scale, off]) => { const p = islandPath(u); return [Math.round((p.x + p.nx * off) * 10) / 10, Math.round((p.z + p.nz * off) * 10) / 10, species, scale]; }),
];

// The Trading Post: where sponsors come to do business — the booth of the sponsors and its red carpet, on the
// north side of the plaza at the foot of the pier: on everybody's way to the games, and a long way from where
// one arrives. (x, z): the booth; `yaw`: which way its counter looks (0: south, across the plaza).
export const TRADING = { name: 'The Trading Post', x: -1.5, z: -8.2, yaw: 0 };

// Wooden signposts at the forks of the paths (zones/games/Signposts.js): a post, and planks nailed to it that
// point the way to the games, their names painted by hand. WAYS: what a plank can point to — its words, and
// where the thing is (the plank says how far). SIGNPOSTS: where the posts stand, and for each of its planks
// what it points to and a point on the way there: a plank points along the path to take, not through the pond.
export const WAYS = {
  pier: { text: 'PIER GAMES', more: '10 BOOTHS', at: [43, 9] },
  flappy: { text: WING.name, at: [WING.x, WING.z] },
  climb: { text: CLIMB.name, at: CLIMB.gate },
  race: { text: RACE.name, at: [-50, -92] },
  trading: { text: 'TRADING POST', more: 'SPONSORS', at: [TRADING.x, TRADING.z] },
  mill: { text: 'THE MILL', at: [-118, -14] },
  // (Billy the alligator, life coach, on the deck over the great pond: where its gangway leaves the bank)
  billy: { text: 'GET LIFE ADVICE', more: 'ASK BILLY', at: [POND_DECK.gangway[0][0], POND_DECK.gangway[0][1]] },
};
// The signposts of the games that are switched on one by one (the lab's: Signposts.js, buildGameSignposts): a post
// of their own beside a few of the others, planted when the first of its games is there. `to`: the games a post
// names, in the order of its planks (from the top) — each plank points straight at its game.
export const GAME_SIGNPOSTS = [
  { id: 'games-arrival', x: -116.1, z: -43.7, to: ['slide', 'hill', 'pond', 'boats', 'hollow', 'crack'] },
  { id: 'games-plaza', x: -19.4, z: 2.5, to: ['slide', 'hollow', 'crack', 'pond', 'boats', 'hill'] },
  { id: 'games-pondside', x: -136.4, z: 7.5, to: ['pond', 'boats', 'hill'] },
  { id: 'games-shore', x: 21.7, z: 53.8, to: ['hollow', 'crack'] },
  { id: 'games-beach', x: 26.1, z: -82.1, to: ['slide'] },
];
export const SIGNPOSTS = [
  // past the banner of the arrival, on the left of the lane: everything is ahead, the race is behind
  { id: 'arrival', x: -117.3, z: -42.4, arms: [['pier', [-108, -31.5]], ['flappy', [-109.2, -31]], ['climb', [-110.6, -30.6]], ['race', [-112, -62]]] },
  // where the lane ends in front of the mill and the path down the valley begins
  { id: 'mill', x: -111.9, z: -31.6, arms: [['pier', [-97, -33.5]], ['flappy', [-97, -31.8]], ['climb', [-97, -30]], ['race', [-114, -46]], ['billy', [-124, -14]]] },
  // where the path through the fields leaves the lane
  { id: 'fields', x: -116.3, z: -97.4, arms: [['race', [-92, -92.5]], ['pier', [-104, -84]], ['mill', [-117.6, -76]]] },
  // half way down the valley
  { id: 'valley', x: -61.4, z: -24.9, arms: [['pier', [-52.7, -19.9]], ['flappy', [-52.4, -18.6]], ['mill', [-70.1, -19.9]]] },
  // where the path comes out on the plaza
  { id: 'plaza', x: -17.9, z: 0.6, arms: [['pier', [16, 6]], ['flappy', [WING.x, WING.z]], ['trading', [TRADING.x, TRADING.z + 2.4]], ['climb', [18, 30]], ['race', [-27, -16.5]]] },
  // on the boardwalk south of the pier, where the path of the shore leaves it — and where that path forks to the climb
  { id: 'shore', x: 20.2, z: 52.4, arms: [['climb', [4, 47.5]], ['pier', [18.5, 16]]] },
  { id: 'climb', x: 6.4, z: 47.6, arms: [['climb', [3.4, 63]], ['pier', [18, 51.6]]] },
  // by the paddock of the race, and at the far end of the path through the fields, on the beach
  { id: 'paddock', x: -41.6, z: -91.2, arms: [['pier', [-23.5, -82.7]], ['climb', [-24.4, -81.2]], ['mill', [-59.7, -82.7]]] },
  { id: 'beach', x: 24.6, z: -83.4, arms: [['race', [8, -88]], ['pier', [22.5, -54]], ['climb', [24.5, -54]]] },
  // …and where the path round the great pond leaves the yard of the mill: his deck is just along it (the plank
  // points along the first steps of the path, so that it is read from the yard and not seen edge on)
  { id: 'pondside', x: -134.8, z: 6.3, arms: [['billy', [-140.5, 7.2]]] },
];

// The wall of thanks (zones/games/ThanksWall.js): a tablet cut into the cliff west of the meadow of the acid
// pond, where the rock is one even face — every sponsor of the fair on it, the most generous first. (x, z):
// the middle of it, on the map; yaw: the way it faces (the meadow); it is `width` long and `height` up the
// slope, its foot `lift` above the grass. How far it leans back is the rock's own business (it finds out).
export const THANKS_WALL = { x: -268.05, z: -82.2, yaw: 70 * DEG, width: 16.5, height: 6.5, lift: 1.3 };

// What stands on the way for visitors to read (zones/games/Notices.js): the banner and the rules where one
// arrives; the boards of what is new, by the poppy field; the booth of the sponsors, at the Trading Post; and
// the arcade cabinet at the top of the ramp of the pier (in the frame of the pier), its board of scores across the walk.
export const NOTICES = {
  // (the boards of what is new: by the poppy field, west of the lane — behind whoever arrives, not in front.
  // (x, z): the middle one; they stand `gap` metres apart on an arc that looks towards the lane)
  news: { x: -146.8, z: -72, yaw: 1.04, gap: 3.3 },
  // (what a newcomer sees first: a banner across the lane, `half` metres to each post, and the rules to the left)
  welcome: { x: -121.05, z: -49, yaw: Math.PI + 0.068, half: 3.7 },
  rules: { x: -116.9, z: -53.6, yaw: -2.49 },
  // (…and, to the right, how it all came to this: the story of the opening, told another way)
  story: { x: -125.35, z: -52.0, yaw: 2.62 },
  // (…and, beside whoever arrives, on the left of the lane: an easel of painted planks that sends them to the
  // beach. `yaw`: which way its front looks; `to`: where its arrow points — the way one walks: up the lane, then
  // down the valley —; `far`: the place it counts the metres to)
  beach: { x: -119.75, z: -60.5, yaw: -2.8, to: [-97, -32], far: [14, -2] },
  // (…and the easel of the life coach: in a flower bed of the rock garden, above the house — Billy is on his
  // deck, down by the great pond; the planks of the signposts take over further on)
  advice: { x: -124.6, z: -16.6, yaw: -1.86 }, // (its front looks west, a little uphill: at whoever comes along the path of the garden)
  ads: { x: TRADING.x, z: TRADING.z, yaw: TRADING.yaw },
  arcade: { along: 17.6, side: -6.7 },
};

// Where visitors arrive: on the lane, facing the mill (yaw is the camera heading).
export const SPAWN = { x: -121.8, z: -60, yaw: 3.21 };

// Named places (for the HUD and the map).
export const ZONES = [
  { id: 'mill', name: 'The Mill', x: -122, z: -6, r: 52 },
  { id: 'pond', name: 'The Great Pond', x: -168, z: 70, r: 78 },
  { id: 'falls', name: 'The Waterfall', x: -268, z: 116, r: 34 },
  { id: 'iris', name: 'Iris Pond', x: -52, z: -40, r: 40 },
  { id: 'fields', name: 'The Wheat Fields', x: -62, z: -124, r: 52 },
  { id: 'lookout', name: 'Lookout Hill', x: -2, z: -90, r: 30 },
  { id: 'elder', name: 'The Old Tree', x: -110, z: 138, r: 50 },
  { id: 'seafront', name: 'The Seafront', x: 24, z: -6, r: 62 },
  { id: 'pier', name: 'The Grand Pier', x: 96, z: 14, r: 72 },
  { id: 'island', name: 'The Island', x: ISLAND.x, z: ISLAND.z, r: 44 },
  { id: 'stairway', name: 'The Stairway', x: -312, z: 60, r: 40 },
  { id: 'village', name: 'The Lost Temple', x: -380, z: 36, r: 40 },
  { id: 'terraces', name: 'Above the Falls', x: -318, z: 132, r: 30 },
  { id: 'glade', name: GLADE.name, x: GLADE.x, z: GLADE.z, r: 30 },
  { id: 'cove', name: 'The Secret Cove', x: COVE.x, z: COVE.z + 2, r: 36, hidden: true }, // (not named on the map)
  { id: 'camp', name: 'The Camp', x: CAMP.x, z: CAMP.z, r: 26 },
  { id: 'climb', name: CLIMB.name, x: CLIMB.x, z: CLIMB.z, r: 24 },
  { id: 'trading', name: TRADING.name, x: TRADING.x, z: TRADING.z + 2, r: 13 },
  { id: 'skygate', name: 'The Sky Gate', x: SKY.gate.x, z: SKY.gate.z, r: 9 },
  { id: 'lounge', name: 'The Beach Lounge', x: BEACH_LOUNGE.x, z: BEACH_LOUNGE.z, r: 20 },
  { id: 'deck', name: 'The Pond Deck', x: POND_DECK.x, z: POND_DECK.z, r: 12 },
  { id: 'grotto', name: 'The Hidden Grotto', x: -303, z: 114, r: 21 },
  { id: 'north', name: 'Echo Cave', x: -34, z: -190, r: 17 },
  { id: 'south', name: 'Hollow of the Old Tree', x: -126, z: 201, r: 16 },
  { id: 'sea', name: "The Smugglers' Den", x: 150, z: -217, r: 17, hidden: true }, // (nor is this one)
  { id: 'golden', name: NORTH.name, x: 212, z: -296, r: 52, hidden: true }, // (nor this)
];

// The playable area (closed polygon). On land it is the foot of the mountains; at sea, how far one can swim.
export const BOUNDS = [
  // west side, north to south is listed last; start in the north-west corner and go clockwise
  [-272, -30], [-270, -66], [-254, -104], [-224, -136], [-184, -158], [-136, -170], [-98, -176], [-74, -176], [-48, -172], [-8, -164],
  [28, -154], [60, -146], [84, -143],
  // the cove
  [122, -150], [172, -148], [222, -116], [246, -40], [262, 40],
  // round the southern cape, out at sea, to the secret cove and back along the foot of the cliffs
  [288, 110], [292, 168], [272, 202], [247, 185], [229, 171], [215, 184],
  // (the land of the secret cove: its beach, the hollow behind it, up to the foot of the slopes)
  [205, 197], [199, 210], [190, 221], [176, 225], [161, 221], [153, 208], [153, 193], [161, 183], [173, 178], [186, 174],
  [197, 171], [202, 158], [196, 146], [177, 128],
  [170, 114], [130, 106],
  // south side, east to west
  [92, 113], [60, 126], [22, 146], [-22, 166], [-70, 178], [-124, 184], [-176, 180], [-222, 166], [-256, 146], [-279, 131],
  [-284, 121], [-281, 108], [-276, 66], [-270, 20],
];

// What the map of the HUD shows.
export const MAP_VIEW = { x0: -420, z0: -205, x1: 255, z1: 205 };
