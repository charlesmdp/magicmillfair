// The Sanctuary in its cliff: what the rock round it needs. The ground of the world cannot be dug while the game
// runs, so the terrain is cut away in boxes where the court is (Terrain.setHoles: before the front, and round the
// towers) and the cut is lined with rock of its own: rough walls that rise to the ground above and turn over its
// edge into it, a face over the gable, and the floor of the court, flags laid by the builders, that runs out to
// the meadow. The ground that is cut away casts no shadow any more (a depth material of the terrain that knows
// these boxes — and only these: the caves of the game are untouched), what grew on it goes (trees, small plants),
// the trunks that stand on the slope over the hall stop nobody under them, and one walks in the court and in the
// hall as in a cave of the game: an area of the collision with its own floor and its own roof.
import * as THREE from 'three';
import { makeMaterial } from '../../../../render/globals.js';
import { PLAN as P, toWorld, toLocal, FACE, COURT, inCourt, courtFloor, floorAt, ceilingAt, room } from './plan.js';

const C = P.court, WO = P.W + P.T, EAVES = P.spring + P.W + 1.4, RIDGE = EAVES + 2.8;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const span = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7 + 17.3) * 43758.5453; return s - Math.floor(s); };
const noise1 = (x, y) => { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v); return (hash(i, j) * (1 - a) + hash(i + 1, j) * a) * (1 - b) + (hash(i, j + 1) * (1 - a) + hash(i + 1, j + 1) * a) * b; };
/** Rough rock: 0 … 1, blocks of a metre or two with smaller breaks in them. */
const rough = (x, y) => 0.65 * noise1(x * 0.55, y * 0.55) + 0.35 * noise1(x * 1.7 + 9.1, y * 1.7 - 3.3);
/** The gable of the front (as Sanctuary.js draws it): its top at u across. */
const gable = (u) => EAVES + 0.9 + (RIDGE - EAVES) * (1 - Math.abs(u) / WO);

/** The boxes cut out of the ground, in its own frame: [x of their middle, half width, from z, to z]. */
export const CUTS = [[0, C.half, FACE, C.mouth], ...[-1, 1].map((s) => [(s * (WO + C.half)) / 2, (C.half - WO) / 2, C.back, FACE + 0.4])];

/**
 * Cuts the ground: holes in the terrain (with whatever holes it has already: the caves) and in its shadow. `low`:
 * the lowest the floor of the court goes (over the floor of the hall). Returns the holes.
 */
export function cutGround(world, low) {
  const S = Math.sin(P.yaw), Co = Math.cos(P.yaw), shape = world.places.holes[0]?.shape ?? 0.3;
  const holes = CUTS.map(([cx, half, z0, z1]) => { const [x, z] = toWorld(cx, z0); return { x, z, dx: S, dz: Co, half, depth: z1 - z0, floor: P.floor + low - 0.2, height: 1e4, shape }; });
  const T = world.terrain;
  T.setHoles([...world.places.holes, ...holes]);
  // (the shadow pass of the terrain: the same, but for these boxes alone — so that the court is in the sun)
  const D = T.depthMaterial, n = holes.length;
  const cut = makeMaterial({
    uniforms: { uRanges: T.uniforms.uRanges, uLodCam: T.uniforms.uLodCam, uCutA: { value: holes.map((h) => new THREE.Vector4(h.x, h.z, h.dx, h.dz)) }, uCutB: { value: holes.map((h) => new THREE.Vector4(h.half, h.depth, h.floor, 0)) } },
    defines: { DEPTH_ONLY: 1, CUTS: n },
    vertexShader: D.vertexShader,
    fragmentShader: /* glsl */ `
in vec3 vWorld;
uniform vec4 uCutA[CUTS];
uniform vec4 uCutB[CUTS];
void main() {
  for (int i = 0; i < CUTS; i++) {
    vec2 d = vWorld.xz - uCutA[i].xy;
    float along = dot(d, uCutA[i].zw), across = d.x * uCutA[i].w - d.y * uCutA[i].z;
    if (along >= 0.0 && along <= uCutB[i].y && abs(across) < uCutB[i].x && vWorld.y > uCutB[i].z + 0.1) discard;
  }
  gl_FragColor = vec4(1.0);
}`,
  });
  Object.assign(cut, { colorWrite: false, polygonOffset: true, polygonOffsetFactor: D.polygonOffsetFactor, polygonOffsetUnits: D.polygonOffsetUnits });
  T.mesh.userData.depthMaterial = cut;
  return holes;
}

/**
 * Lines the cut with rock, and lays the floor of the court. `rock`, `stone`: builders in the frame of the hall;
 * `face`, `plain`: how a face is laid and painted (Sanctuary.js); `ground(lx, lz)`: the terrain over the floor.
 */
export function carve({ rock, stone, face, plain, ground, TRIM, OUT }) {
  /** A rough sheet of rock: `pt(i, j)` its corners (i along, j up) — [point, how far it is set back, 0 … 1] —, `want` the way it looks. */
  const sheet = (ni, nj, pt, want) => {
    const G = Array.from({ length: nj + 1 }, (_, j) => Array.from({ length: ni + 1 }, (_, i) => {
      const [p, back = 0.5] = pt(i, j), t = (0.8 + 0.3 * noise1(p.x * 0.23 + p.z * 0.29, p.y * 0.35)) * (1.08 - 0.32 * back) * (0.82 + 0.18 * Math.min(1, Math.max(0, (p.y - COURT) / 2.5)));
      return { p, c: [0.9 * t, 0.86 * t, 0.8 * t, 1] };
    }));
    const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
      const a = G[j][i], b = G[j][i + 1], c = G[j + 1][i + 1], d = G[j + 1][i];
      n.crossVectors(e1.subVectors(c.p, a.p), e2.subVectors(d.p, b.p));
      if (n.lengthSq() < 1e-8) continue;
      n.normalize();
      if (n.dot(want) < 0) rock.quad(a.p, d.p, c.p, b.p, { normal: n.clone().negate(), colors: [a.c, d.c, c.c, b.c] });
      else rock.quad(a.p, b.p, c.p, d.p, { normal: n.clone(), colors: [a.c, b.c, c.c, d.c] });
    }
  };
  /** How far a face of the cut is set back at (a along it, y up): rough blocks in beds, as the rock of the cliff. */
  const bed = (a, y) => 0.55 * noise1(a * 0.32, y * 0.75) + 0.3 * noise1(a * 0.95 + 5.3, y * 1.6) + 0.15 * noise1(a * 2.4 - 7.1, y * 2.3);
  /** The edge of the cut, over the ground: it turns over it and goes into it (`k` 1 then 2: how far from the edge). */
  const lip = (k) => (k === 1 ? [1.1, 0.4] : [2.5, -1.1]);
  const lowest = COURT - 1.4, rough = bed;
  // ---- the two sides of the court: from the back of the towers out to the meadow, up to the ground and over it
  for (const s of [-1, 1]) {
    const zs = span(C.back - 0.4, C.mouth + 0.9, 32), NJ = 18;
    sheet(zs.length - 1, NJ + 2, (i, j) => {
      const z = zs[i], top = Math.max(COURT + 0.3, ground(s * C.half, z) + 0.8);
      if (j > NJ) { const [o, dy] = lip(j - NJ); return [V(s * (C.half + o), ground(s * (C.half + o), z) + dy, z + (hash(i, j) - 0.5) * 0.5), 0.3]; }
      const y = lowest + ((top - lowest) * j) / NJ, r = j === 0 ? 0.3 : rough(z * s, y);
      return [V(s * (C.half - 0.1 - 1.05 * r), y, z + (j > 0 && i > 0 && i < zs.length - 1 ? (hash(i, j) - 0.5) * 0.3 : 0)), r];
    }, V(-s, 0.15, 0));
  }
  // ---- behind each tower, across its slot: up to the ground and over it, back into the slope
  for (const s of [-1, 1]) {
    const xs = span(s * (WO - 0.7), s * (C.half + 0.6), 10), NJ = 18;
    sheet(xs.length - 1, NJ + 2, (i, j) => {
      const x = xs[i], top = ground(x, C.back) + 0.8;
      if (j > NJ) { const [o, dy] = lip(j - NJ); return [V(x, ground(x, C.back - o) + dy, C.back - o), 0.3]; }
      const y = lowest + ((top - lowest) * j) / NJ, r = j === 0 ? 0.3 : rough(x + 40, y);
      return [V(x, y, C.back - 0.1 - 0.6 * r), r];
    }, V(0, 0.15, 1));
    // (and over the arm of the doors, between the tower and the ground that is left there: a face down to the
    // top of the tower, so that the cut in the ground does not show over it)
    const zs = span(C.back - 0.2, FACE + 0.3, 7), NJ2 = 4;
    sheet(zs.length - 1, NJ2 + 2, (i, j) => {
      const z = zs[i], top = ground(s * WO, z) + 0.8, bottom = P.towers.height - 1.2;
      if (j > NJ2) { const [o, dy] = lip(j - NJ2); return [V(s * (WO - o), ground(s * (WO - o), z) + dy, z), 0.3]; }
      const y = bottom + ((Math.max(top, bottom + 0.5) - bottom) * j) / NJ2, r = rough(z, y + 20);
      return [V(s * (WO + 0.05 + 0.35 * r), y, z), r];
    }, V(s, 0.15, 0));
  }
  // ---- over the gable, between the towers: the face of the cliff, cut back to the wall of the front
  {
    const xs = span(-WO, WO, 16), NJ = 7;
    sheet(xs.length - 1, NJ + 2, (i, j) => {
      const x = xs[i], top = ground(x, FACE) + 0.8, bottom = gable(x) - 0.9;
      if (j > NJ) { const [o, dy] = lip(j - NJ); return [V(x, ground(x, FACE - o) + dy, FACE - o), 0.3]; }
      const y = bottom + ((Math.max(top, bottom + 0.5) - bottom) * j) / NJ, r = j === 0 ? 0 : rough(x - 40, y);
      return [V(x, y, FACE - 0.05 - 0.7 * r), r];
    }, V(0, 0.15, 1));
  }
  // ---- the floor of the court: great flags, in courses across, out to the meadow (it slopes to it at the mouth)
  {
    const g = (x, z) => courtFloor(x, z, ground);
    const xs = span(-C.half, C.half, 16), zs = [...span(C.back - 0.3, C.mouth - C.ramp, 14), ...span(C.mouth - C.ramp, C.mouth + 0.6, 6).slice(1)];
    for (let j = 0; j + 1 < zs.length; j++) for (let i = 0; i + 1 < xs.length; i++) {
      const k = 0.92 + 0.14 * hash(Math.floor((i + (j % 2)) / 2), j), base = (i + j) % 3 ? OUT : TRIM;
      face(stone, V(xs[i], g(xs[i], zs[j]), zs[j]), V(xs[i + 1], g(xs[i + 1], zs[j]), zs[j]), V(xs[i + 1], g(xs[i + 1], zs[j + 1]), zs[j + 1]), V(xs[i], g(xs[i], zs[j + 1]), zs[j + 1]), V(0, 1, 0), base, plain, [k, k, k * 1.01, k * 1.01]);
    }
  }
}

/**
 * What grew on the ground that is cut away goes: the trees (near, far, and in the shadows), the small plants. The
 * trunks and stones that stand on the slope over the hall stop nothing under them any more. Returns how many
 * trees went.
 */
export function clearGround(world) {
  const over = (x, z) => { const [lx, lz] = toLocal(x, z); return !!room(lx, lz, -3) || inCourt(lx, lz, 1.5) || (Math.abs(lx) <= WO + 1 && lz > 0 && lz < FACE + 1); };
  const gone = (x, z) => { const [lx, lz] = toLocal(x, z); return inCourt(lx, lz, 0.8); };
  const F = world.forest;
  let n = 0;
  if (F?.matrices) {
    for (let i = 0; i < F.count; i++) if (gone(F.info[i * 6], F.info[i * 6 + 2])) { F.matrices.fill(0, i * 16, i * 16 + 16); n++; }
    for (const sp of F.species || []) {
      if (!sp) continue;
      for (const v of sp.variants || []) for (const k of ['wood0', 'leaf0', 'lod1']) if (v[k]) v[k].sum = NaN; // (sent again)
      const ip = sp.impostor?.geometry.attributes.iPos;
      if (!ip) continue;
      sp.trees.forEach((t, k) => { if (gone(t.x, t.z)) ip.array[k * 4 + 3] = 0; });
      ip.needsUpdate = true;
    }
  }
  for (const z of [C.back + 2.5, C.back + 9, C.back + 15.5, C.mouth]) for (const x of [-9.5, -3.2, 3.2, 9.5]) { const [wx, wz] = toWorld(x, z); world.scatter?.keepClear?.(wx, wz, 5.2); }
  // (no grass grows on the floor of the court: its cover is taken out of the map of the ground there)
  const d = world.data, [x0, z0, x1, z1] = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => toWorld(a * (C.half + 1), b > 0 ? C.mouth + 1 : C.back - 1)).reduce((q, [x, z]) => [Math.min(q[0], x), Math.min(q[1], z), Math.max(q[2], x), Math.max(q[3], z)], [1e9, 1e9, -1e9, -1e9]);
  if (d.aux && d.auxTex) {
    for (let z = Math.floor(z0); z <= z1; z++) for (let x = Math.floor(x0); x <= x1; x++) { const [lx, lz] = toLocal(x + 0.5, z + 0.5); if (inCourt(lx, lz, 1)) d.aux[d.index(x + 0.5, z + 0.5) * 4] = 0; }
    d.auxTex.needsUpdate = true;
  }
  // (the boulders that lay at the foot of the cliff, where the court is cut)
  const m = new THREE.Matrix4(), q = new THREE.Vector3(), none = new THREE.Matrix4().makeScale(0, 0, 0);
  world.rocks?.group.traverse((o) => {
    if (!o.isInstancedMesh) return;
    let hit = false;
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); q.setFromMatrixPosition(m); if (gone(q.x, q.z)) { o.setMatrixAt(i, none); hit = true; } }
    if (hit) { o.instanceMatrix.needsUpdate = true; o.computeBoundingSphere?.(); }
  });
  const col = world.collision, h = (q) => world.data.heightAt(q[0], q[1]);
  for (const q of col.circles) if (over(q[0], q[1])) q[3] = Math.max(q[3], h(q) - 0.5);
  col.bulky = (col.bulky || col.circles.filter((q) => q[2] >= 0.9)).filter((q) => !over(q[0], q[1]));
  return n;
}

/**
 * The hall and its court as a place of the collision where one walks under the ground, as in the caves of the
 * game (Collision: areas, caveAt): its floor, its roof, how much light reaches whoever stands there, and the
 * nearest point of it. It runs out on the meadow a few metres beyond the mouth of the court (the playable area
 * starts there).
 */
export function hallArea(world) {
  const ground = (x, z) => world.data.heightAt(x, z), W2 = P.W + 0.4, R2 = P.R + 0.4, D = P.door.half + 0.2;
  const apron = C.mouth + 8;
  const rects = [[-C.half, C.half, FACE, apron], [-D, D, P.chord - 0.5, FACE + 0.5], [-W2, W2, 0, P.chord], [0, P.chord, -W2, W2], [-W2, W2, -P.chord, 0], [-P.chord, 0, -W2, W2], ...[-1, 1].map((s) => (s < 0 ? [-C.half, -WO, C.back, FACE] : [WO, C.half, C.back, FACE]))];
  const discs = [[0, 0, R2], [P.chord, 0, W2], [0, -P.chord, W2], [-P.chord, 0, W2]];
  const corners = [[-30, -30], [30, -30], [30, apron], [-30, apron]].map(([a, b]) => toWorld(a, b));
  const box = [Math.min(...corners.map((c) => c[0])), Math.min(...corners.map((c) => c[1])), Math.max(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[1]))];
  const local = (x, z) => toLocal(x, z);
  const within = (lx, lz) => rects.some(([x0, x1, z0, z1]) => lx >= x0 && lx <= x1 && lz >= z0 && lz <= z1) || discs.some(([cx, cz, r]) => (lx - cx) ** 2 + (lz - cz) ** 2 <= r * r);
  return {
    cave: true,
    name: P.name,
    contains(x, z) { if (x < box[0] || z < box[1] || x > box[2] || z > box[3]) return false; const [lx, lz] = local(x, z); return within(lx, lz); },
    floorAt(x, z) { return floorAt(x, z, ground) ?? ground(x, z); },
    ceilingAt(x, z) { const [lx, lz] = local(x, z), c = ceilingAt(lx, lz); return P.floor + (c ?? 60); },
    /** How much of the light of the sky an avatar standing there has: the lamps and the glass in the hall, the day in the court. */
    light(x, z) { const [lx, lz] = local(x, z); return lz > P.chord + 0.5 ? 1 : room(lx, lz, 0) ? 0.72 : 0.85; },
    depthAt(x, z) { const [, lz] = local(x, z); return Math.max(0, C.mouth - lz); },
    nearest(x, z, out) {
      const [lx, lz] = local(x, z);
      if (within(lx, lz)) { out.x = x; out.z = z; return 0; }
      let best = Infinity, bx = 0, bz = 0;
      for (const [x0, x1, z0, z1] of rects) { const px = Math.min(x1, Math.max(x0, lx)), pz = Math.min(z1, Math.max(z0, lz)), d = (px - lx) ** 2 + (pz - lz) ** 2; if (d < best) { best = d; bx = px; bz = pz; } }
      for (const [cx, cz, r] of discs) { const d = Math.hypot(lx - cx, lz - cz), k = (r - 0.001) / (d || 1), px = cx + (lx - cx) * k, pz = cz + (lz - cz) * k, e = (px - lx) ** 2 + (pz - lz) ** 2; if (e < best) { best = e; bx = px; bz = pz; } }
      [out.x, out.z] = toWorld(bx, bz);
      return best;
    },
  };
}
