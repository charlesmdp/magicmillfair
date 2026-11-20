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
      [-356, 152, 66, 2.0], [-340, 144, 54, 2.0], [-324, 138, 43.5, 2.2], [-310, 132.5, 34, 2.2], [-298, 128, 27.4, 2.4],
      [-289.5, 124.6, 26.4, 2.8], [-285, 123, 11.75, 5.0], [-277, 120.5, 11.6, 4.4], [-266, 118.5, 11.2, 3.2], [-254, 117, 10.85, 3.2],
      [-244, 116, 10.55, 3.4], [-236, 114, 10.3, 3.8], [-229, 108, 10.2, 4.5], [-223, 101, 10.2, 6],
    ],
    falls: [0.5, 1.5, 2.5, 3.5, 5.5],
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
    [76, 92, 0.45], [102, 108, 0.1], [134, 120, 0], [172, 136, 0], [210, 160, 0], [246, 196, 0], [276, 246, 0], [298, 310, 0],
    [314, 390, 0], [326, 470, 0], [334, 540, 0],
  ],
  beachWidth: 20, // dry sand between the waterline and the promenade
  promenadeY: 3.2,
};

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
    points: [[-239, 103], [-247, 109.5], [-257, 112.5], [-267, 113.6], [-275, 115.4]],
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
  points: [[-273, 58, 22.7], [-300, 74, 35.9], [-316, 48, 52.7], [-336, 68, 74.5], [-350, 46, 94.7], [-356, 30, 108]],
  landing: 1.7, // radius of the landings
};

const SQUARE = { x: -378, z: 37 };
// a house whose front door (local +X) looks at the square, give or take `turn`
const house = (x, z, w, l, h, turn = 0) => ({ x, z, w, l, h, yaw: Math.round((Math.atan2(-(SQUARE.z - z), SQUARE.x - x) + turn) * 1000) / 1000 });
export const VILLAGE = {
  y: 108,
  outline: [[-353, 18], [-353, 52], [-363, 63], [-389, 65], [-403, 52], [-406, 27], [-394, 11], [-368, 9]],
  square: SQUARE,
  // houses: centre, yaw, width (along local X), length, eave height
  houses: [
    house(-367.5, 16, 6.0, 8.0, 2.9, 0.12), house(-383, 16.5, 5.6, 7.4, 2.7, -0.08), house(-396.5, 25.5, 6.2, 8.6, 3.1, 0.1),
    house(-398, 43, 6.4, 9.0, 3.0, -0.06), house(-390, 57, 5.8, 7.8, 2.8, 0.1), house(-374, 58.5, 5.6, 7.2, 2.7, -0.1),
  ],
  // the chapel: its door, in the gable (local +Z), looks at the square
  chapel: { x: -362.5, z: 52.5, w: 5.0, l: 7.5, h: 3.4, yaw: Math.round(Math.atan2(SQUARE.x + 362.5, SQUARE.z - 52.5) * 1000) / 1000 },
  fountain: { x: -378, z: 37 },
  // low wall of the lookout, along the edge above the valley (east side)
  wall: [[-362.4, 62.2], [-353.3, 51.6], [-353.3, 33.4]],
  wall2: [[-353.3, 26.6], [-353.3, 18.4], [-367.6, 9.3]],
};

// ---------------------------------------------------------------------------
// Caves: galleries and chambers under the mountains. Each node is [x, z, half width, floor, height of the roof];
// the first one is the mouth, a flat end at the foot of the rock face, and the gallery runs on from there.
// `open` is how many metres the mouth cuts through the face before the rock closes over it.

export const CAVES = [
  {
    // behind the waterfall: a chamber under the torrent, then a narrow passage to a second, hidden room
    id: 'grotto', name: 'The Hidden Grotto', open: 3.6,
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
];

// ---------------------------------------------------------------------------
// Places to rest

// The camp in the woods north of the pond: hammocks round a fire.
export const CAMP = { x: -197, z: -9, r: 12.5 };
// Beanbags at the north end of the beach (the left end, looking out to sea)…
export const BEACH_LOUNGE = { x: 44.5, z: -93, yaw: 0.35, r: 7 };
// …and on a deck on stilts over the great pond, reached by a gangway from the north bank.
export const POND_DECK = { x: -152.5, z: 37, yaw: 0.06, w: 10, l: 8, y: LEVELS.pondBig + 0.85, gangway: [[-151, 22.2], [-151.9, 33]] };

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
  { crop: 'wheat', outline: [[-102, -150], [-56, -150], [-46, -128], [-52, -104], [-100, -110]] },
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
  // on the island: pines holding on to its ledges, a palm by the landing
  ...[[0.07, 'palm', 0.8, -3.6], [0.2, 'pine', 0.7, 3.3], [0.31, 'cypress', 0.8, 3.2], [0.49, 'pine', 0.85, 3.4], [0.6, 'pine', 0.6, 3.2], [0.7, 'cypress', 0.7, 3.3], [0.8, 'pine', 0.75, 3.3], [0.9, 'pine', 0.55, 3.2]]
    .map(([u, species, scale, off]) => { const p = islandPath(u); return [Math.round((p.x + p.nx * off) * 10) / 10, Math.round((p.z + p.nz * off) * 10) / 10, species, scale]; }),
];

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
  { id: 'village', name: 'The High Village', x: -380, z: 36, r: 40 },
  { id: 'camp', name: 'The Camp', x: CAMP.x, z: CAMP.z, r: 26 },
  { id: 'grotto', name: 'The Hidden Grotto', x: -303, z: 114, r: 21 },
  { id: 'north', name: 'Echo Cave', x: -34, z: -190, r: 17 },
  { id: 'south', name: 'Hollow of the Old Tree', x: -126, z: 201, r: 16 },
];

// The playable area (closed polygon). On land it is the foot of the mountains; at sea, how far one can swim.
export const BOUNDS = [
  // west side, north to south is listed last; start in the north-west corner and go clockwise
  [-272, -30], [-270, -66], [-254, -104], [-224, -136], [-184, -158], [-136, -170], [-98, -176], [-74, -176], [-48, -172], [-8, -164],
  [28, -154], [60, -146], [84, -143],
  // the cove
  [122, -150], [172, -148], [222, -116], [246, -40], [244, 50], [214, 100], [170, 114], [130, 106],
  // south side, east to west
  [92, 113], [60, 126], [22, 146], [-22, 166], [-70, 178], [-124, 184], [-176, 180], [-222, 166], [-256, 146], [-279, 131],
  [-284, 121], [-281, 108], [-276, 66], [-270, 20],
];

// What the map of the HUD shows.
export const MAP_VIEW = { x0: -420, z0: -205, x1: 255, z1: 205 };
