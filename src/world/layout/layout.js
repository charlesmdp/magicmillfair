// World layout: the single source of truth shared by the offline bakers (tools/)
// and the runtime. Coordinates are in metres: +X = east, +Z = south, Y = up.
// Y = 0 is the sea level. Everything here is plain data (no three.js imports).

export const WORLD = {
  size: 1024, // playable square, centred on the origin
  half: 512,
  verticalScale: 1.3, // gentle exaggeration of the surveyed relief
  backdrop: 2048, // extent of the low-resolution surrounding terrain
};

export const LEVELS = {
  sea: 0,
  pondBig: 20.0,
  court: 20.6,
  pondTail: 16.8,
  pondBean: 13.6,
  pondFar: 10.9,
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
    name: 'Le Grand Étang',
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
    name: 'Le Bassin du Moulin',
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
    name: "L'Étang aux Iris",
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
    id: 'far',
    name: 'La Mare aux Libellules',
    level: LEVELS.pondFar,
    depth: 1.3,
    bank: 0.3,
    shelf: 3.5,
    margin: 5, cutSlope: 0.28,
    outline: [
      [8.3, -55.1], [6.1, -53.1], [3.6, -48.4], [4.6, -40.4], [7.3, -32.3], [14.4, -29.2], [25.8, -24.5], [31.4, -23],
      [38.1, -24], [39.3, -27.5], [38.6, -36.1], [38.1, -47.1], [32.3, -54.3], [26.7, -57.4], [16.2, -57.2],
    ],
    islands: [],
  },
];

// ---------------------------------------------------------------------------
// Running water. Each control point: [x, z, waterY, width].
// Water heights are monotonic downstream; `falls` mark short steep drops (weirs, cascades).

export const STREAMS = [
  {
    id: 'upper',
    name: 'Le Ruisseau',
    bedDepth: 0.45,
    flat: 15, slope: 0.24, // valley floor half-width and side slope carved around the stream
    points: [
      [-455, 530, 23.7, 2.6], [-457, 504, 23.55, 2.6], [-455, 480, 23.4, 2.8], [-447, 458, 23.25, 2.6], [-444, 436, 23.1, 2.6],
      [-458, 420, 22.95, 2.8], [-474, 408, 22.8, 2.6], [-478, 392, 22.7, 2.6], [-488, 378, 22.6, 2.8], [-485, 360, 22.5, 2.6],
      [-482, 340, 22.4, 2.6], [-494, 318, 22.3, 2.8], [-492, 296, 22.2, 2.6], [-488, 274, 22.1, 2.6], [-499, 255, 22.0, 2.8],
      [-490, 246, 21.95, 2.6], [-474, 250, 21.85, 2.6], [-456, 254, 21.75, 2.8], [-450, 240, 21.65, 2.6], [-449, 227, 21.55, 2.6],
      [-441, 217, 21.45, 2.8], [-438, 202, 21.35, 2.6], [-425, 191, 21.25, 2.8], [-411, 184, 21.15, 2.8], [-393, 182, 21.0, 3.0],
      [-376, 179, 20.9, 3.0], [-363, 181, 20.8, 2.8], [-355, 172, 20.7, 2.8], [-337, 166, 20.6, 3.0], [-322, 158, 20.5, 3.0],
      [-303, 151, 20.4, 3.2], [-287, 146.5, 20.32, 3.2], [-276, 138, 20.25, 3.0], [-263, 134.5, 20.2, 3.2], [-250, 131, 20.14, 3.4],
      [-244, 122, 20.08, 3.4], [-236, 115, 20.03, 3.8], [-229, 108, 20.0, 4.5], [-223, 101, 20.0, 6],
    ],
    falls: [],
  },
  {
    id: 'canal',
    name: 'Le Bief',
    bedDepth: 0.35,
    flat: 0.8, slope: 0.55,
    lined: true, // stone-edged channel
    points: [
      [-90.5, -22.5, 16.8, 1.5], [-88.4, -26, 16.74, 1.3], [-86.6, -28.8, 15.95, 1.3], [-84.8, -31.4, 15.15, 1.3], [-83, -34, 14.4, 1.3],
      [-81.2, -36.6, 13.66, 1.4], [-79.6, -38.4, 13.62, 1.8], [-77.6, -39.8, 13.6, 2.4],
    ],
    falls: [1.5, 2.5, 3.5, 4.5],
  },
  {
    id: 'brook',
    name: 'Le Ruisseau',
    bedDepth: 0.4,
    flat: 7, slope: 0.3,
    points: [
      [-23.5, -32.5, 13.6, 2.6], [-20, -29.5, 12.3, 2.4], [-14, -25, 11.75, 2.4], [-5, -20, 11.45, 2.6], [6, -18, 11.2, 2.4],
      [14, -13.5, 10.95, 2.6], [25, -9.5, 10.35, 2.8], [36, -8, 9.8, 2.6], [45, -7.5, 9.5, 2.4], [50, -8.2, 8.9, 2.8],
      [56, -10, 8.8, 2.8], [65, -13.5, 8.55, 2.6], [74, -9, 8.3, 2.8], [84, -7, 8.1, 2.6], [91, -1, 7.95, 2.8],
      [97, 3.2, 7.8, 2.4], [101.5, 0.6, 7.1, 3.0], [106, -2.2, 7.0, 2.8], [116, -2, 6.7, 2.8], [126, -7, 6.3, 2.6],
      [133, -3, 6.1, 2.8], [144, -5, 5.7, 2.8], [152, -11, 5.3, 2.4], [156.5, -15.2, 4.55, 3.2], [161, -17.5, 4.4, 3.0],
      [169, -12, 4.15, 2.8], [178, -8, 3.9, 3.0], [182, -16, 3.6, 2.8], [193, -17.5, 3.1, 3.0], [203, -21.5, 2.5, 2.6],
      [208.5, -23.6, 1.85, 3.4], [215, -24, 1.75, 3.2], [224, -21.5, 1.5, 3.2], [234, -18, 1.25, 3.4], [242, -23, 1.0, 3.4],
      [251, -27, 0.75, 3.6], [262, -33, 0.5, 4.0], [273, -41, 0.28, 4.6], [284, -48, 0.1, 6], [296, -52, 0.0, 9],
    ],
    falls: [0.5, 8.5, 15.5, 22.5, 29.5],
  },
  {
    id: 'raceHead', name: 'Le Bief', bedDepth: 0.4, flat: 0.3, slope: 0.9, lined: true,
    points: [[-117.9, 9.6, 20.0, 0.9], [-117.3, 6.5, 19.96, 0.9], [-116.5, 2.5, 19.93, 0.9], [-115.9, -0.4, 19.9, 0.9]],
    falls: [],
  },
  {
    id: 'raceTail', name: 'Le Bief', bedDepth: 0.35, flat: 0.3, slope: 0.9, lined: true,
    points: [[-115.3, -3.7, 18.05, 1.1], [-113.3, -2.9, 17.9, 1.1], [-110.2, -2.6, 17.6, 1.1], [-107.0, -2.5, 17.3, 1.1], [-103.8, -2.6, 17.02, 1.1], [-101.4, -2.8, 16.83, 1.2], [-99.6, -3.0, 16.8, 1.6]],
    falls: [],
  },
  {
    id: 'spill', name: 'Le Déversoir', bedDepth: 0.3, flat: 0.3, slope: 0.9, lined: true,
    points: [[-106.4, 20.8, 20.0, 1.7], [-105.3, 19.6, 20.0, 1.7], [-104.4, 18.6, 19.9, 1.7], [-103.5, 17.6, 17.6, 1.7], [-102.6, 16.5, 16.86, 1.7], [-101.7, 15.4, 16.8, 2.0]],
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

export const COAST = {
  line: [
    [372, -540, 0.2], [356, -486, 0.1], [342, -452, 0.0], [338, -412, 0.0], [350, -378, 0.0], [356, -352, 0.0],
    [336, -338, 0.3], [318, -318, 0.9], [301, -284, 1.0], [291, -240, 1.0], [286, -182, 1.0], [286.5, -120, 1.0],
    [291, -70, 1.0], [297, -40, 1.0], [308, -4, 1.0], [322, 26, 0.9], [340, 48, 0.4], [366, 62, 0.0], [400, 72, 0.0],
    [432, 94, 0.0], [452, 128, 0.0], [456, 174, 0.0], [442, 224, 0.0], [433, 280, 0.0], [445, 340, 0.0],
    [461, 400, 0.0], [470, 460, 0.0], [480, 540, 0.0],
  ],
  promenadeY: 3.2,
};

// The big pier: starts at the seafront plaza and heads out to sea.
export const PIER = {
  rootX: 287, rootZ: -181,
  heading: 20 * DEG, // 0 = +X (east), positive towards +Z (south)
  length: 212,
  width: 18,
  deckY: 5.2,
  rampLength: 22,
  headLength: 62, headWidth: 46, // wide platform carrying the big wheel
  wheel: { along: 176, radius: 31, hubY: 5.2 + 36 },
};

export function pierToWorld(along, side = 0) {
  const c = Math.cos(PIER.heading), s = Math.sin(PIER.heading);
  return [PIER.rootX + along * c - side * s, PIER.rootZ + along * s + side * c];
}

// ---------------------------------------------------------------------------
// Roads and paths. kind: asphalt | gravel | dirt | boardwalk

export const PATHS = [
  {
    id: 'road', kind: 'asphalt', width: 5.6, cut: 1,
    points: [
      [-560, -740], [-400, -597], [-290.4, -499.9], [-233.3, -450.6], [-184.2, -412.9], [-38.6, -304.5], [9.7, -269.7],
      [70.6, -223.5], [89.9, -210], [108, -201], [125.3, -195.2], [141.2, -192.5], [159.3, -191.9], [173.7, -193.7],
      [189.6, -197.4], [221.4, -203.7], [233.7, -204.2], [245.4, -203.1], [257, -199.5], [266, -194.5],
    ],
  },
  {
    id: 'lane', kind: 'asphalt', width: 3.3, cut: 1,
    points: [
      [-38.6, -304.5], [-60, -254], [-81.2, -205.2], [-105.7, -144.1], [-113.5, -124.1], [-117.1, -110.2], [-120.7, -91.7],
      [-122.4, -74.2], [-122.2, -58], [-120.6, -44], [-118.6, -35], [-116.2, -29.5], [-113.6, -26.2],
    ],
  },
  {
    id: 'valley', kind: 'gravel', width: 1.9, cut: 0.6,
    points: [
      [-111.5, -27.5], [-105, -31.5], [-97, -32.5], [-89.5, -30.2], [-84.6, -31.4], [-80, -28.5], [-74, -25.5], [-62, -22.5],
      [-48, -22], [-36, -20.5], [-27, -23], [-21.6, -28.6], [-15.5, -31], [-8, -27], [4, -25.5], [18, -20.5], [30, -16], [42, -14],
      [52, -17.5], [64, -20.5], [76, -16], [86, -14], [96, -9.5], [108, -9.5], [120, -10.5], [128, -14], [140, -12],
      [150, -19.5], [160, -24.5], [170, -19.5], [181, -23.5], [194, -24.8], [205, -29.5], [216, -31], [226, -28.5],
      [236, -26], [244, -30.5], [252, -35], [261, -41.5], [268, -50], [273.5, -62], [277.5, -78], [280, -96],
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
    id: 'garden', kind: 'gravel', width: 1.2, cut: 0.3,
    points: [[-128.6, -5.2], [-128.2, -9.5], [-127.8, -14.5], [-128.4, -20], [-129, -25.5], [-129.2, -31], [-131, -36.5], [-136, -40.5], [-144, -42]],
  },
  {
    id: 'cliff', kind: 'dirt', width: 1.4, cut: 0.5,
    points: [
      [134, -6.5], [137, 4], [146, 14], [160, 22], [178, 28], [200, 30], [222, 31], [246, 36], [270, 44], [296, 52],
      [318, 58], [342, 70], [366, 82], [392, 92], [416, 108], [434, 130],
    ],
  },
];

// Boardwalk along the beach (built as a mesh; the ground below is graded to it).
export const PROMENADE = {
  width: 8.5,
  y: COAST.promenadeY,
  points: [[318, -312], [303, -276], [291.5, -236], [284.5, -196], [281.5, -168], [281.5, -132], [283.5, -100], [287.5, -72], [292.5, -51], [300.5, -27], [311, -3], [324, 20]],
  plaza: { x: 272.5, z: -187.5, r: 15 },
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
  topY: 27.4,
  // steepest ascent direction (unit vector, pointing uphill)
  up: [-0.42, -0.91],
  run: 40,
};

// Flat or gently sloped authored areas: { outline, y | (y0,y1,axis) , feather }
export const PADS = [
  // courtyard between the house, the outbuilding and the pond wall
  { id: 'court', y: LEVELS.court, feather: 2.2, outline: [[-135.5, -5.8], [-124.4, -3.2], [-116.6, -0.4], [-114.4, 4.5], [-117.4, 8.3], [-125, 8.1], [-133, 7.9], [-141, 4.4], [-150.4, 4.2], [-150.6, -5.6]] },
  // driveway in front of the carport
  { id: 'drive', y: 20.9, feather: 3.5, outline: [[-120.5, -30.5], [-110.5, -30.5], [-109, -22], [-112, -18], [-119.5, -19.5]] },
  // seafront plaza at the foot of the pier
  { id: 'plaza', y: COAST.promenadeY, feather: 9, outline: [[254, -208], [276, -214], [292, -200], [292, -170], [276, -164], [256, -172]] },
];

// ---------------------------------------------------------------------------
// Land cover hints for the baker.

export const PARK = [
  // garden lawns east of the house, around the lower ponds
  [[-121, -72], [-100, -80], [-60, -72], [-15, -70], [46, -68], [50, -40], [44, -16], [2, -6], [-20, 6], [-60, 6], [-86, 23], [-100, 21], [-106, 9], [-114, 2], [-111, -20]],
  // parkland around the big pond
  [[-140, 4], [-170, 16], [-204, 28], [-252, 40], [-300, 62], [-302, 132], [-250, 142], [-204, 132], [-180, 126], [-150, 102], [-134, 92], [-99, 62], [-93, 30], [-99, 10]],
];

export const FIELDS = [
  { crop: 'soil', outline: [[-560, -560], [-300, -560], [-332, -300], [-353, -160], [-244, -84], [-300, -30], [-429, 90], [-560, 215]] },
  { crop: 'cereal', outline: [[-345, -165], [-322, -300], [-190, -408], [-62, -308], [-104, -162], [-128, -100], [-238, -88]] },
  { crop: 'soil', outline: [[-92, -152], [-48, -288], [62, -238], [150, -200], [124, -112], [42, -96], [-40, -94]] },
  { crop: 'wheat', outline: [[-262, 205], [-42, 200], [-30, 342], [-272, 348]] },
  { crop: 'soil', outline: [[64, 110], [196, 92], [258, 198], [240, 332], [72, 332]] },
  { crop: 'wheat', outline: [[-250, 372], [-20, 368], [-10, 560], [-262, 560]] },
  { crop: 'cereal', outline: [[30, 366], [250, 360], [300, 560], [20, 560]] },
  { crop: 'wheat', outline: [[-170, -440], [-30, -330], [70, -250], [160, -230], [230, -330], [150, -560], [-140, -560]] },
];

// Hand-placed specimen trees: [x, z, species, scale]
export const HERO_TREES = [
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
  [46, -30, 'willow', 0.95],
  [-84, 2, 'oak', 1.15],
];

export const SPAWN = { x: -108.5, z: -30.5, yaw: 2.2 };

// Named places (for the HUD and for zone streaming).
export const ZONES = [
  { id: 'mill', name: 'Le Moulin', x: -120, z: -4, r: 70 },
  { id: 'pond', name: 'Le Grand Étang', x: -165, z: 68, r: 85 },
  { id: 'valley', name: 'La Vallée', x: 90, z: -15, r: 120 },
  { id: 'promenade', name: 'La Promenade', x: 288, z: -150, r: 150 },
  { id: 'pier', name: 'La Grande Jetée', x: 390, z: -146, r: 110 },
];
