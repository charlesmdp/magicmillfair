// The sky villages: fifty small temples perched on the mountains around the valley, one per company (see
// layout/sponsors.js) — and the Sky Gate in the valley, from which one is carried up to them. Nobody walks
// there. Each village: a hall under two roofs in its colours, two open pavilions with cushions round a table,
// more cushions round an incense burner, benches that look down on the valley, lanterns, a flag, its sign
// (and, while it is for hire, a board that says what hiring it brings), and a ring to go back through.
// The higher a village stands, the dearer it is to hire.
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';
import { staticCaster, LAYER } from '../../../render/Shadows.js';
import { mergeStatic, distanceCuller } from '../../props/StaticBatch.js';
import { makeMaterial, GLSL_COMMON, GLSL_LIGHTING } from '../../../render/globals.js';
import { Polygon } from '../../Areas.js';
import { fallsMaterial } from '../../water/Falls.js';
import { seatAt } from '../../../player/PlayerController.js';
import { SKY } from '../../layout/layout.js';
import { SPONSORS, sponsorId, VILLAGE_PRICES, VILLAGE_PERKS, VILLAGE_PITCH, money } from '../../layout/sponsors.js';
import { drawEmblem } from './emblems.js';
import { canvasBoard } from '../games/Boards.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const STONE = [1.05, 1.02, 0.96], WALL = [1.75, 1.66, 1.46], DARK = [0.2, 0.2, 0.24], WOOD = [0.62, 0.44, 0.28];
const RED = [0.62, 0.1, 0.07], DARK_RED = [0.4, 0.07, 0.06], GOLD = [1.35, 0.95, 0.25], PLASTER = [1.7, 1.6, 1.38], BRONZE = [0.42, 0.33, 0.16];
const CUSHIONS = [[0.5, 0.08, 0.07], [0.95, 0.5, 0.06], [0.6, 0.12, 0.3], [0.9, 0.72, 0.2]];
const CUSHION_SEAT = 0.235; // how high one sits on a cushion
const RING = 1.4; // radius of the rings one goes through

/**
 * A pagoda roof (as on the temple, with fewer tiles), in the frame of the builder `b`: hipped, its slopes
 * hollow, its corners turned up. The eaves are a rectangle hx × hz (half sizes) round (cx, cz) at height y; it
 * rises `rise` to a rectangle ix × iz. `under`: how many rows get an underside (all of them when one can
 * stand below).
 */
function roof(b, cx, cz, y, hx, hz, rise, curl, tone, { ix = 0.02, iz = 0.02, seg = 4, rows = 3, under = 1 } = {}) {
  const at = (side, s, u, drop = 0) => {
    const lift = curl * Math.abs(s) ** 2.6 * u * u, h = y + rise * (1 - u) ** 1.7 + lift - drop;
    const along = side % 2 === 0 ? iz + (hz - iz) * u : ix + (hx - ix) * u, out = side % 2 === 0 ? ix + (hx - ix) * u : iz + (hz - iz) * u;
    const sg = side < 2 ? 1 : -1;
    return side % 2 === 0 ? V(cx + sg * out, h, cz + sg * s * along) : V(cx - sg * s * along, h, cz + sg * out);
  };
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < seg; i++) {
      const s0 = -1 + (2 * i) / seg, s1 = -1 + (2 * (i + 1)) / seg;
      for (let j = 0; j < rows; j++) {
        const u0 = j / rows, u1 = (j + 1) / rows, k = 0.88 + 0.24 * (((i * 3 + j * 5 + side) % 4) / 3);
        b.tint(tone[0] * k, tone[1] * k, tone[2] * k, 1).quad(at(side, s0, u0), at(side, s1, u0), at(side, s1, u1), at(side, s0, u1));
        if (j >= rows - under) b.tint(DARK_RED[0], DARK_RED[1], DARK_RED[2], 1).quad(at(side, s0, u1, 0.1), at(side, s1, u1, 0.1), at(side, s1, u0, 0.1), at(side, s0, u0, 0.1));
      }
      b.tint(DARK_RED[0] * 1.25, DARK_RED[1] * 1.25, DARK_RED[2] * 1.25, 1).quad(at(side, s0, 1), at(side, s1, 1), at(side, s1, 1, 0.1), at(side, s0, 1, 0.1));
    }
  }
}

// The light inside a ring: a slow whirl. `uv` runs from -1 to 1 across it.
const PORTAL_VERT = /* glsl */ `
out vec2 vUv;
out vec3 vWorld;
void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }
`;
const PORTAL_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
in vec2 vUv;
in vec3 vWorld;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float a = atan(vUv.y, vUv.x);
  float arms = sin(a * 3.0 + r * 7.0 - uTime * 1.6) * 0.5 + 0.5;
  float veil = sin(a * 5.0 - r * 11.0 + uTime * 0.9) * 0.5 + 0.5;
  vec3 col = mix(vec3(0.12, 0.42, 0.95), vec3(0.75, 0.95, 1.0), arms * 0.7 + veil * 0.3);
  col += vec3(1.0, 0.9, 0.6) * smoothstep(0.35, 0.0, r) * 0.9; // a bright heart
  col *= 1.25 * (0.75 + 0.25 * sin(uTime * 2.3 + r * 4.0));
  float alpha = smoothstep(1.0, 0.82, r) * (0.55 + 0.45 * arms);
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col) * alpha, alpha);
}
`;

/**
 * An orca leaping out of a round basin: the fountain of a village that has one. Built at the local origin of
 * the builders (stone, skin, fins, water); it leaps towards the local direction `turn`.
 */
function orcaFountain(stone, skin, fins, water, cx, cz, turn) {
  stone.tint(STONE[0], STONE[1], STONE[2], 1).place(cx, 0, cz).lathe([[1.3, -0.3], [1.3, 0.36], [1.2, 0.44], [1.06, 0.44], [1.02, 0.26], [0.0, 0.26]], 16).pop();
  water.tint(0.07, 0.24, 0.42, 1).cylinder(cx, 0.3, cz, 1.03, 1.03, 0.02, 16);
  const BLACK = [0.035, 0.04, 0.055, 1], WHITE = [0.96, 0.96, 0.94, 1], L = 2.7, N = 14, S = 12;
  // the spine: it comes out of the water almost upright and arcs over; `t` runs from the tail stock to the snout
  const spine = [];
  let py = 0.05, pz = -0.35;
  for (let k = 0; k <= N; k++) {
    const t = k / N, th = 1.42 - 1.0 * t; // how steeply it rises there
    spine.push({ t, p: V(0, py, pz), T: V(0, Math.sin(th), Math.cos(th)), U: V(0, Math.cos(th), -Math.sin(th)) }); // (U: towards its back)
    py += (Math.sin(th) * L) / N; pz += (Math.cos(th) * L) / N;
  }
  const radius = (t) => 0.4 * Math.sin(Math.PI * (0.1 + t * 0.855)) ** 0.62; // (a blunt head, a narrow tail stock)
  const at = (k, a) => { const s = spine[k], r = radius(s.t); return V(Math.cos(a) * r, 0, 0).addScaledVector(s.U, Math.sin(a) * r * 1.08).add(s.p); };
  // (black above, white below: the belly, the throat, the chin)
  const tone = (k, a) => (Math.sin(a) < -0.3 && spine[k].t > 0.1 ? WHITE : BLACK);
  skin.place(cx, 0, cz, turn);
  for (let k = 0; k < N; k++) for (let j = 0; j < S; j++) {
    const a0 = (j / S) * Math.PI * 2, a1 = ((j + 1) / S) * Math.PI * 2, am = (a0 + a1) / 2;
    skin.quad(at(k, a0), at(k, a1), at(k + 1, a1), at(k + 1, a0), { color: tone(k, am), tile: 1 });
  }
  // the snout closed, the white patch behind each eye
  for (let j = 0; j < S; j++) { const a0 = (j / S) * Math.PI * 2, a1 = ((j + 1) / S) * Math.PI * 2; skin.tri(at(N, a0), at(N, a1), spine[N].p.clone().addScaledVector(spine[N].T, 0.1), { color: tone(N, (a0 + a1) / 2), tile: 1 }); }
  for (const g of [-1, 1]) {
    const s = spine[Math.round(N * 0.82)], r = radius(s.t), c = V(g * Math.cos(0.5) * r * 0.96, 0, 0).addScaledVector(s.U, Math.sin(0.5) * r * 1.02).add(s.p);
    const m = new THREE.Matrix4().makeBasis(s.T, s.U, V(-1, 0, 0)).setPosition(c).multiply(new THREE.Matrix4().makeScale(0.16, 0.07, 0.035));
    skin.tint(WHITE[0], WHITE[1], WHITE[2], 1).push(m).lathe([[0.0, -1], [0.7, -0.7], [1.0, 0.0], [0.7, 0.7], [0.0, 1]], 8, { tile: 1 }).pop();
  }
  skin.pop();
  // the fins (thin: seen from both sides): the tall one on its back, a paddle on each side
  fins.place(cx, 0, cz, turn).tint(BLACK[0], BLACK[1], BLACK[2], 1);
  {
    const a = spine[Math.round(N * 0.62)], b = spine[Math.round(N * 0.42)];
    const A = a.p.clone().addScaledVector(a.U, radius(a.t) * 1.0), B = b.p.clone().addScaledVector(b.U, radius(b.t) * 1.0);
    fins.tri(A, B, B.clone().addScaledVector(b.U, 0.62).addScaledVector(b.T, -0.06));
    for (const g of [-1, 1]) {
      const s = spine[Math.round(N * 0.7)], r = radius(s.t), root = V(g * r * 0.92, 0, 0).addScaledVector(s.U, -r * 0.35).add(s.p);
      fins.tri(root.clone().addScaledVector(s.T, 0.2), root.clone().addScaledVector(s.T, -0.2), root.clone().add(V(g * 0.5, 0, 0)).addScaledVector(s.U, -0.2).addScaledVector(s.T, -0.36));
    }
  }
  fins.pop();
  // white water where it breaks the surface
  for (let k = 0; k < 7; k++) { const a = k * 0.9 + turn; water.tint(0.42, 0.47, 0.52, 1).place(cx + Math.sin(a) * 0.36, 0.3, cz + Math.cos(a) * 0.36 - 0.2).lathe([[0.0, 0.0], [0.15, 0.03], [0.11, 0.12], [0.0, 0.2 + 0.07 * (k % 3)]], 6).pop(); }
}

export class SkyZone {
  /** `stage`: 'open' (the villages and their gate), 'soon' (the gate alone, closed) or 'hidden' (nothing at all). */
  constructor(world, { stage = 'open' } = {}) {
    this.world = world;
    this.stage = stage === 'soon' || stage === 'hidden' ? stage : 'open';
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'zone:sky';
    this.cast = staticCaster(world.engine.tier);
    this.colliders = [];
    this.platforms = [];
    this.areas = [];
    this.seats = world.seats;
    /**
     * The villages: { index, id, name, motto, url, color, forHire, tier (0 to 9), price (dollars a month), x, y, z,
     * yaw, arrive: [x, z, which way one faces], ring: [x, z], sign: [x, z], board: [x, z] }
     */
    this.villages = [];
    this._roots = {};
    this._portals = []; // quads to merge: [centre, right, up]
    this._signs = [];
    this._perks = [];
    this._brands = []; // the boards of the villages that have something to say of themselves (see sponsors.js: pitch)
  }

  build() {
    if (this.stage === 'hidden') {
      // nothing of the sky: no village on the mountains, no gate, not a stone (where the gate would stand is
      // kept, for the game to know the spot)
      const G = SKY.gate, y = this.data.heightAt(G.x, G.z);
      this.gate = { x: G.x, z: G.z, y, yaw: G.yaw, arrive: [G.x + Math.sin(G.yaw) * 2.4, G.z + Math.cos(G.yaw) * 2.4, G.yaw], hidden: true };
      this._cull = () => {};
      return this;
    }
    const open = this.stage === 'open';
    if (open) {
      const sites = this.data.meta.sky || [];
      // the price of each: ten prices, as many villages at each, from the lowest shelf to the highest
      const order = sites.map((_, i) => i).sort((a, b) => sites[a].y - sites[b].y || a - b), tier = [];
      order.forEach((i, rank) => { tier[i] = Math.min(VILLAGE_PRICES.length - 1, Math.floor((rank * VILLAGE_PRICES.length) / sites.length)); });
      sites.forEach((site, i) => this._village(site, i, SPONSORS[i] || { name: `Sky Village ${i + 1}`, motto: '', color: [0.5, 0.5, 0.5], forHire: true }, tier[i]));
    }
    this._gate();
    this.group.updateMatrixWorld(true);
    for (const [key, roots] of Object.entries(this._roots)) this.group.add(mergeStatic(roots, key));
    if (this._portals.length) this._buildPortals();
    if (open) {
      this._buildSigns();
      this._buildPerks();
      this._buildBrands();
      this._torrents();
    } else this._soon();
    this.group.updateMatrixWorld(true);
    this.group.traverse((o) => { if (o.isMesh) o.layers.disable(LAYER.REFLECT); });
    const k = this.world.engine.tier.phone ? 0.6 : 1;
    this._cull = distanceCuller(this.group, [[/^sky\d:matte$/, 1300], [/^sky\d:/, 420 * k], [/^skyv\d+:/, 150], [/^skygate:/, 600 * k], [/^sky-(portals|signs|perks|torrents)$/, Infinity], [/^sky-brand$/, 260], [/^skygate-soon$/, 320]]);
    return this;
  }

  _add(key, parts, shadow = true) {
    const g = parts.toMeshes(this.world.materials, { name: key, layers: shadow ? this.cast : [], castShadow: shadow });
    g.updateMatrixWorld(true);
    (this._roots[key] ||= []).push(g);
    this.group.add(g);
  }

  /** A stone ring standing on a slab, to walk through: centre (x, y, z) at ground level, facing `yaw` (`lit`: the light whirls inside it). */
  _ring(parts, x, y, z, yaw, tone = STONE, lit = true) {
    const b = parts.get('matte'), sx = Math.cos(yaw), sz = -Math.sin(yaw); // across the ring
    b.tint(tone[0], tone[1], tone[2], 1).cylinder(x, y - 0.5, z, RING + 0.9, RING + 1.0, 0.62, 14);
    const cy = y + 0.12 + RING + 0.25;
    let prev = null;
    for (let k = 0; k <= 18; k++) {
      const a = -0.5 + (k / 18) * (Math.PI + 1.0), p = V(x + sx * Math.cos(a) * (RING + 0.2), cy + Math.sin(a) * (RING + 0.2), z + sz * Math.cos(a) * (RING + 0.2));
      if (prev) b.tint(tone[0] * (0.86 + 0.14 * (k % 2)), tone[1] * (0.86 + 0.14 * (k % 2)), tone[2] * (0.86 + 0.14 * (k % 2)), 1).rod(prev, p, 0.2, 6, { caps: k === 1 || k === 18 });
      prev = p;
    }
    if (lit) this._portals.push([V(x, cy, z), V(sx, 0, sz), V(0, 1, 0)]);
    for (const s of [-1, 1]) this.colliders.push({ type: 'circle', x: x + sx * s * (RING + 0.25), z: z + sz * s * (RING + 0.25), r: 0.3 });
    this.platforms.push({ type: 'disc', x, z, r: RING + 0.9, y: y + 0.12, clearance: 1.0 });
  }

  _village(site, i, who, tier) {
    const { x, z, y, yaw } = site;
    // What is seen from the valley (the hall, the ring) goes with the villages of its part of the sky; the
    // rest (pavilions, cushions, benches, lanterns) is its own, and only drawn for those who are there.
    const parts = new Parts(), close = new Parts();
    const m = parts.get('matte'), n = close.get('matte'), glow = close.get('glow'), cloth = close.get('doubleSided');
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const W = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c]; // local (right, towards the valley) → world
    const col = who.color || [0.5, 0.5, 0.5], tone = [col[0] * 1.5, col[1] * 1.5, col[2] * 1.5];
    const all = [m, n, glow, cloth];
    for (const b of all) b.place(x, y, z, yaw);
    const circle = (lx, lz, r, extra) => { const [wx, wz] = W(lx, lz); this.colliders.push({ type: 'circle', x: wx, z: wz, r, ...extra }); };
    const seat = (lx, lz, h, facing, extra) => { const [wx, wz] = W(lx, lz); this.seats.push(seatAt(wx, y + h, wz, yaw + facing, extra)); };

    // ---- the hall, at the back: a stone plinth, plastered walls with a red foot, a porch of four red columns,
    // two roofs in the colours of the village, a golden point
    {
      const HW = SKY.hall.hw, HL = SKY.hall.hl, CZ = SKY.hall.z - 0.3, front = CZ + HL;
      m.tint(STONE[0] * 0.9, STONE[1] * 0.9, STONE[2] * 0.9, 1).box(-HW - 0.55, -1.6, CZ - HL - 0.5, HW + 0.55, 0.45, front + 1.1, { faces: 'xXzZY' });
      m.tint(STONE[0], STONE[1], STONE[2], 1).box(-1.5, -0.8, front + 1.1, 1.5, 0.22, front + 1.55, { faces: 'xXZY' });
      m.tint(PLASTER[0], PLASTER[1], PLASTER[2], 1).box(-HW, 0.45, CZ - HL, HW, 3.0, front, { faces: 'xXzZ' });
      m.tint(DARK_RED[0], DARK_RED[1], DARK_RED[2], 1).box(-HW - 0.03, 0.45, CZ - HL - 0.03, HW + 0.03, 1.15, front + 0.03, { faces: 'xXzZ' });
      // the door: dark, in a red frame; a round window on either side
      m.tint(0.1, 0.05, 0.04, 1).box(-0.75, 0.45, front, 0.75, 2.45, front + 0.05, { faces: 'Z' });
      m.tint(RED[0], RED[1], RED[2], 1).box(-0.97, 0.45, front, -0.75, 2.67, front + 0.1, { faces: 'xXZ' }).box(0.75, 0.45, front, 0.97, 2.67, front + 0.1, { faces: 'xXZ' }).box(-0.97, 2.45, front, 0.97, 2.67, front + 0.1, { faces: 'yZ' });
      for (const g of [-1, 1]) m.tint(0.12, 0.08, 0.07, 1).place(g * 2.1, 2.05, front + 0.04, 0, Math.PI / 2).lathe([[0.0, 0.0], [0.42, 0.0]], 10).pop();
      for (const lx of [-3.45, -1.35, 1.35, 3.45]) m.tint(RED[0], RED[1], RED[2], 1).cylinder(lx, 0.45, front + 0.75, 0.16, 0.15, 2.55, 7, { capTop: false, capBottom: false });
      roof(m, 0, CZ + 0.3, 3.0, HW + 1.25, HL + 1.45, 1.5, 0.75, tone, { ix: 2.0, iz: 1.0 });
      m.tint(PLASTER[0], PLASTER[1], PLASTER[2], 1).box(-1.9, 4.35, CZ + 0.3 - 0.92, 1.9, 5.4, CZ + 0.3 + 0.92, { faces: 'xXzZ' });
      m.tint(DARK_RED[0], DARK_RED[1], DARK_RED[2], 1).box(-1.93, 4.35, CZ + 0.3 - 0.95, 1.93, 4.75, CZ + 0.3 + 0.95, { faces: 'xXzZ' });
      roof(m, 0, CZ + 0.3, 5.4, 2.95, 1.95, 1.5, 0.6, tone);
      m.tint(GOLD[0], GOLD[1], GOLD[2], 1).place(0, 6.8, CZ + 0.3).lathe([[0.0, 0.0], [0.2, 0.08], [0.09, 0.3], [0.13, 0.5], [0.0, 0.95]], 6).pop();
      const [hx, hz] = W(0, CZ + 0.3);
      this.colliders.push({ type: 'box', x: hx, z: hz, hw: HW + 0.6, hl: HL + 0.85, yaw });
    }

    // ---- two open pavilions, left and right: a low table, four cushions round it
    const cushion = (lx, lz, facing, k) => {
      const cc = CUSHIONS[k % CUSHIONS.length];
      n.tint(cc[0], cc[1], cc[2], 1).place(lx, 0, lz, k * 1.7).lathe([[0.0, 0.0], [0.3, 0.0], [0.37, 0.07], [0.37, 0.16], [0.29, 0.225], [0.0, 0.24]], 8).pop();
      seat(lx, lz, CUSHION_SEAT, facing, { reach: 1.4 });
    };
    for (const { x: px, z: pz, h: ph } of SKY.pavilions) {
      const g = Math.sign(px) || 1;
      n.tint(STONE[0], STONE[1], STONE[2], 1).box(px - ph, -1.2, pz - ph, px + ph, 0.03, pz + ph, { faces: 'xXzZY' });
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        n.tint(RED[0], RED[1], RED[2], 1).cylinder(px + a * 1.95, 0.03, pz + b * 1.95, 0.13, 0.12, 2.5, 6, { capTop: false, capBottom: false });
        circle(px + a * 1.95, pz + b * 1.95, 0.2);
      }
      roof(n, px, pz, 2.5, 2.95, 2.95, 1.25, 0.55, tone, { under: 3 });
      n.tint(GOLD[0], GOLD[1], GOLD[2], 1).place(px, 3.7, pz).lathe([[0.0, 0.0], [0.13, 0.06], [0.05, 0.22], [0.0, 0.5]], 5).pop();
      n.tint(WOOD[0], WOOD[1], WOOD[2], 1).cylinder(px, 0.03, pz, 0.17, 0.14, 0.3, 7, { capTop: false, capBottom: false }).cylinder(px, 0.33, pz, 0.56, 0.56, 0.05, 10, { capBottom: true });
      circle(px, pz, 0.5, { y0: y - 1, y1: y + 0.6 });
      for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + (k * Math.PI) / 2; cushion(px + Math.sin(a) * 1.12, pz + Math.cos(a) * 1.12, a + Math.PI, k + (g > 0 ? 1 : 0)); }
    }

    // ---- before the ring: six cushions round an incense burner
    {
      const bz = 4.6, fountain = who.centre === 'orca';
      if (fountain) {
        // (its skin shines: a material of its own, for this village only)
        const skin = close.get('paint'), fins = close.get('doubleSided');
        skin.place(x, y, z, yaw);
        orcaFountain(n, skin, fins, glow, 0, bz, 1.25);
        skin.pop();
        circle(0, bz, 1.4);
      } else {
        n.tint(STONE[0] * 0.9, STONE[1] * 0.9, STONE[2] * 0.9, 1).place(0, 0, bz).lathe([[0.3, -0.3], [0.3, 0.1], [0.14, 0.2], [0.14, 0.42]], 7).pop();
        n.tint(BRONZE[0], BRONZE[1], BRONZE[2], 1).place(0, 0.42, bz).lathe([[0.12, 0.0], [0.36, 0.14], [0.4, 0.3], [0.33, 0.33], [0.0, 0.3]], 9).pop();
        glow.tint(1.0, 0.55, 0.2, 1).cylinder(0, 0.73, bz, 0.2, 0.02, 0.16, 6, { capBottom: false });
        circle(0, bz, 0.5);
      }
      const ring = fountain ? 2.45 : 2.0;
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k / 6) * Math.PI * 2; cushion(Math.sin(a) * ring, bz + Math.cos(a) * ring, a + Math.PI, k); }
    }

    // ---- at the edge: three stone benches that look down on the valley, lanterns between them
    for (const lx of [-4.5, 0, 4.5]) {
      n.tint(STONE[0], STONE[1], STONE[2], 1).box(lx - 1.05, 0.3, 9.36, lx + 1.05, 0.39, 9.84).box(lx - 0.92, -0.3, 9.42, lx - 0.68, 0.3, 9.78).box(lx + 0.68, -0.3, 9.42, lx + 0.92, 0.3, 9.78);
      for (const o of [-0.5, 0.5]) seat(lx + o, 9.6, 0.39, 0);
      const [bx, bz] = W(lx, 9.6);
      this.colliders.push({ type: 'box', x: bx, z: bz, hw: 1.05, hl: 0.26, yaw, y0: y - 1, y1: y + 0.6 });
    }
    for (const [lx, lz] of [[-2.25, 9.5], [2.25, 9.5], [-2.7, -4.2], [2.7, -4.2]]) {
      n.tint(STONE[0], STONE[1], STONE[2], 1).place(lx, 0, lz).lathe([[0.3, -0.2], [0.3, 0.1], [0.13, 0.2], [0.1, 0.95], [0.27, 1.05], [0.27, 1.12]], 6).lathe([[0.33, 1.5], [0.11, 1.68], [0.04, 1.84]], 6).pop();
      glow.tint(1.0, 0.74, 0.36, 1).box(lx - 0.17, 1.12, lz - 0.17, lx + 0.17, 1.5, lz + 0.17);
      circle(lx, lz, 0.3);
    }

    // ---- the flag
    n.tint(1.3, 1.25, 1.15, 1).rod(V(8.7, -0.3, 4.2), V(8.7, 7.2, 4.2), 0.06, 6);
    cloth.tint(col[0] * 1.3, col[1] * 1.3, col[2] * 1.3, 1);
    for (let k = 0; k < 5; k++) {
      const a0 = k * 0.44, a1 = (k + 1) * 0.44, w0 = Math.sin(k * 1.2) * 0.14, w1 = Math.sin((k + 1) * 1.2) * 0.14;
      cloth.quad(V(8.76 + a0, 5.7, 4.2 + w0), V(8.76 + a1, 5.7, 4.2 + w1), V(8.76 + a1, 7.1, 4.2 + w1), V(8.76 + a0, 7.1, 4.2 + w0));
    }
    circle(8.7, 4.2, 0.2);

    // ---- the signs: two posts and a board each (their faces are drawn later, all on one sheet). On the left,
    // the name of the village; on the right, while it is for hire, what hiring it brings.
    const board = (lx, lz, turn, w, h, foot) => {
      n.place(lx, 0, lz, turn);
      n.tint(WOOD[0], WOOD[1], WOOD[2], 1).box(-w / 2 - 0.09, -0.3, -0.06, -w / 2 + 0.03, foot + h + 0.25, 0.06).box(w / 2 - 0.03, -0.3, -0.06, w / 2 + 0.09, foot + h + 0.25, 0.06);
      n.tint(WOOD[0] * 0.7, WOOD[1] * 0.7, WOOD[2] * 0.7, 1).box(-w / 2, foot - 0.06, -0.03, w / 2, foot + h + 0.06, 0.015);
      n.pop();
      const ca = Math.cos(yaw + turn), sn = Math.sin(yaw + turn), [bx, bz] = W(lx, lz);
      for (const g of [-1, 1]) this.colliders.push({ type: 'circle', x: bx + ca * g * w / 2, z: bz - sn * g * w / 2, r: 0.16 });
      // (the board looks along its local +Z: back towards the middle of the village)
      return { i, centre: V(bx + sn * 0.03, y + foot + h / 2, bz + ca * 0.03), right: V(ca, 0, -sn), w, h };
    };
    this._signs.push(board(-5.6, 5.6, 0.75, 3.0, 1.5, 1.1));
    if (who.forHire) this._perks.push(board(5.6, 5.6, -0.75, 2.3, 2.3, 0.7));
    else if (who.pitch || who.emblem) this._brands.push(board(5.6, 5.6, -0.75, 2.3, 2.3, 0.7));
    for (const b of all) b.pop();

    // the ring one arrives through, its back to the hall
    const [rx, rz] = W(0, -2.6);
    this._ring(parts, rx, y, rz, yaw);
    // where one can walk: the round shelf
    const edge = [];
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; edge.push([x + Math.cos(a) * (SKY.pad - 0.7), z + Math.sin(a) * (SKY.pad - 0.7)]); }
    this.areas.push(new Polygon(edge, { name: 'sky' }));
    const [ax, az] = W(0, 0.4), [gx, gz] = W(-5.6, 5.6), [px, pz] = W(5.6, 5.6);
    const price = VILLAGE_PRICES[tier];
    this.villages.push({
      index: i, id: sponsorId(who), name: who.name, motto: who.forHire ? `For sale · ${money(price)} a month` : who.motto || '', url: /^https:\/\//.test(who.url || '') ? who.url : null, color: col,
      forHire: !!who.forHire, tier, price, x, y, z, yaw, arrive: [ax, az, yaw], ring: [rx, rz], sign: [gx, gz], board: [px, pz], // (one arrives looking at the valley)
      emblem: who.emblem || null, pitch: who.pitch || null, demo: !!who.demo,
    });
    // six sectors round the valley, so that what is behind the camera is not drawn
    const sector = Math.floor(((Math.atan2(z, x + 60) + Math.PI) / (2 * Math.PI)) * 6) % 6;
    this._add(`sky${sector}`, parts);
    this._add(`skyv${i}`, close, false);
  }

  // The Sky Gate, in the valley: a bigger ring on three steps, lanterns, a signpost
  _gate() {
    const G = SKY.gate, parts = new Parts(), y = this.data.heightAt(G.x, G.z), open = this.stage === 'open';
    const m = parts.get('matte'), glow = parts.get('glow');
    m.tint(STONE[0] * 0.92, STONE[1] * 0.92, STONE[2] * 0.92, 1).cylinder(G.x, y - 0.6, G.z, 3.4, 3.6, 0.66, 18);
    this.platforms.push({ type: 'disc', x: G.x, z: G.z, r: 3.4, y: y + 0.06, clearance: 1.0 });
    this._ring(parts, G.x, y + 0.06, G.z, G.yaw, [1.12, 1.06, 0.92], open); // (closed: no light in it yet)
    const sx = Math.cos(G.yaw), sz = -Math.sin(G.yaw), fx = Math.sin(G.yaw), fz = Math.cos(G.yaw);
    for (const g of [-1, 1]) {
      const lx = G.x + sx * g * 2.9 + fx * 1.6, lz = G.z + sz * g * 2.9 + fz * 1.6;
      m.tint(DARK[0], DARK[1], DARK[2], 1).rod(V(lx, y - 0.2, lz), V(lx, y + 2.5, lz), 0.045, 6);
      if (open) glow.tint(0.6, 0.85, 1, 1).box(lx - 0.1, y + 2.5, lz - 0.1, lx + 0.1, y + 2.82, lz + 0.1);
      else m.tint(DARK[0] * 1.6, DARK[1] * 1.6, DARK[2] * 1.8, 1).box(lx - 0.1, y + 2.5, lz - 0.1, lx + 0.1, y + 2.82, lz + 0.1); // (its lamps are not lit yet)
      this.colliders.push({ type: 'circle', x: lx, z: lz, r: 0.2 });
    }
    this.gate = { x: G.x, z: G.z, y, yaw: G.yaw, arrive: [G.x + fx * 2.4, G.z + fz * 2.4, G.yaw], ...(!open && { closed: true }) };
    this._add('skygate', parts);
  }

  /** The gate that is not open yet: a sign hangs across its ring. */
  _soon() {
    const g = this.gate, cy = g.y + 0.18 + RING + 0.1;
    const sign = canvasBoard(640, 320, (ctx, w, h) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#1b1440'); sky.addColorStop(1, '#3a2a78');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 10; ctx.strokeRect(9, 9, w - 18, h - 18);
      // (a few stars, a thin moon)
      ctx.fillStyle = '#fff6c8';
      for (let k = 0; k < 26; k++) { const x = 30 + ((k * 137) % (w - 60)), yy = 26 + ((k * 71) % 90), r = 1.2 + (k % 3) * 0.7; ctx.beginPath(); ctx.arc(x, yy, r, 0, 7); ctx.fill(); }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffe9a6'; ctx.font = "900 108px Georgia, 'Times New Roman', serif"; ctx.fillText('SOON', w / 2, 132);
      ctx.fillStyle = '#ffffff'; ctx.font = '800 40px system-ui, sans-serif'; ctx.fillText('THE SKY WILL OPEN', w / 2, 214, w - 60);
      ctx.fillStyle = '#c9b8ff'; ctx.font = '600 22px system-ui, sans-serif'; ctx.fillText('Fifty mountain tops are getting dressed.', w / 2, 266, w - 60);
    }, 2.3, 1.15, { both: true });
    sign.mesh.position.set(g.x, cy, g.z);
    sign.mesh.rotation.y = g.yaw;
    sign.mesh.name = 'skygate-soon';
    this.group.add(sign.mesh);
  }

  _buildPortals() {
    const n = this._portals.length, pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = [];
    this._portals.forEach(([c, right, up], k) => {
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([u, v], q) => {
        const p = c.clone().addScaledVector(right, u * RING * 1.02).addScaledVector(up, v * RING * 1.02);
        pos.set([p.x, p.y, p.z], (k * 4 + q) * 3); uv.set([u, v], (k * 4 + q) * 2);
      });
      idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, makeMaterial({ vertexShader: PORTAL_VERT, fragmentShader: PORTAL_FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
    mesh.name = 'sky-portals';
    mesh.renderOrder = 14;
    mesh.frustumCulled = false; // (they are all over the map: one mesh, a hundred triangles)
    this.group.add(mesh);
  }

  // The faces of the signs: every name on one sheet, one mesh
  _buildSigns() {
    const COLS = 5, ROWS = Math.ceil(this._signs.length / COLS), CW = 400, CH = 200; // (fifty of them: 2000 × 2000)
    const canvas = document.createElement('canvas');
    canvas.width = COLS * CW; canvas.height = ROWS * CH;
    const ctx = canvas.getContext('2d');
    const n = this._signs.length, pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = [];
    const paint = (k) => {
      const sg = this._signs[k], v = this.villages[sg.i], cx = (k % COLS) * CW, cy = Math.floor(k / COLS) * CH;
      const rgb = v.color.map((q) => Math.round(Math.min(1, q * 1.15) * 255));
      ctx.fillStyle = '#f6f1e4'; ctx.fillRect(cx, cy, CW, CH);
      ctx.fillStyle = `rgb(${rgb})`; ctx.fillRect(cx, cy, CW, 30); ctx.fillRect(cx, cy + CH - 12, CW, 12);
      // (an emblem takes the left of the sign; the name and the line under it share what is left)
      const mark = v.emblem && !v.forHire && drawEmblem(ctx, v.emblem, cx + 70, cy + 104, 116, `rgb(${rgb})`), mid = cx + (mark ? 264 : CW / 2), room = mark ? CW - 150 : CW - 36;
      ctx.fillStyle = '#1b2a22'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let size = 62;
      do { ctx.font = `700 ${size}px Georgia, 'Times New Roman', serif`; size -= 2; } while (ctx.measureText(v.name).width > room && size > 20);
      ctx.fillText(v.name, mid, cy + (v.motto ? 96 : 110));
      if (v.motto) {
        size = 26;
        do { ctx.font = `500 ${size}px system-ui, sans-serif`; size -= 1; } while (ctx.measureText(v.motto).width > room + 6 && size > 12);
        ctx.fillStyle = '#5a5140'; ctx.fillText(v.motto, mid, cy + 150);
      }
    };
    this._signs.forEach((sg, k) => {
      const cx = (k % COLS) * CW, cy = Math.floor(k / COLS) * CH;
      paint(k);
      const up = V(0, 1, 0);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], q) => {
        const p = sg.centre.clone().addScaledVector(sg.right, (a * sg.w) / 2).addScaledVector(up, (b * sg.h) / 2);
        pos.set([p.x, p.y, p.z], (k * 4 + q) * 3);
        uv.set([(cx + (a > 0 ? CW : 0)) / canvas.width, 1 - (cy + (b > 0 ? 0 : CH)) / canvas.height], (k * 4 + q) * 2);
      });
      idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this._paintSign = (index) => { const k = this._signs.findIndex((sg) => sg.i === index); if (k >= 0) { paint(k); tex.needsUpdate = true; } };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    mesh.name = 'sky-signs';
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  /**
   * A village is taken (or its holder changed what it says): its sign is painted again, the board that offered
   * it goes. `who`: { name, motto, url }.
   */
  setSponsor(index, who) {
    const v = this.villages[index];
    if (!v || !who || !who.name) return;
    Object.assign(v, { name: String(who.name).slice(0, 22), motto: String(who.motto || '').slice(0, 34), url: /^https:\/\//.test(who.url || '') ? who.url : null, forHire: false });
    this._paintSign?.(index);
    const perks = this.group.getObjectByName('sky-perks'), k = this._perks.findIndex((p) => p.i === index);
    if (perks && k >= 0) { const pos = perks.geometry.attributes.position; for (let q = 0; q < 4; q++) pos.setXYZ(k * 4 + q, 0, -1000, 0); pos.needsUpdate = true; }
  }

  // White water on the mountains, to be seen from the villages: near one village in two a torrent comes down a
  // slope that the village looks at, for as long as the slope lasts. All of them are one mesh.
  _torrents() {
    const water = this.world.water;
    if (!water || !water.shared || !water.shared.uFoam) return;
    const data = this.data, h = (x, z) => data.heightAt(x, z), bd = data.meta.bounds || [];
    const inValley = (x, z) => { let inside = false; for (let i = 0, j = bd.length - 1; i < bd.length; j = i++) if ((bd[j][1] > z) !== (bd[i][1] > z) && x < ((bd[i][0] - bd[j][0]) * (z - bd[j][1])) / (bd[i][1] - bd[j][1]) + bd[j][0]) inside = !inside; return inside; };
    const blocked = (x, z) => Math.abs(x) > 500 || Math.abs(z) > 500 || inValley(x, z) || this.villages.some((v) => (x - v.x) ** 2 + (z - v.z) ** 2 < 25 * 25);
    const pos = [], uv = [], fade = [], idx = [];
    this.villages.forEach((v, i) => {
      if (i % 2 !== 1) return;
      // from the village, which of the slopes round it shows the longest run of water? (a torrent comes down the
      // steepest way, three metres at a time, until the ground levels out)
      const trace = (x, z) => {
        const out = [V(x, h(x, z) + 0.14, z)];
        for (let n = 0; n < 52; n++) {
          const gx = (h(x + 2, z) - h(x - 2, z)) / 4, gz = (h(x, z + 2) - h(x, z - 2)) / 4, g = Math.hypot(gx, gz);
          if (g < 0.12) break;
          x -= (gx / g) * 3; z -= (gz / g) * 3;
          if (blocked(x, z) || data.waterAt(x, z) > -500) break;
          out.push(V(x, h(x, z) + 0.14, z));
        }
        return out;
      };
      const eye = V(v.x, v.y + 2.2, v.z);
      const seen = (p) => { for (let k = 1; k < 10; k++) { const t = k / 10; if (h(eye.x + (p.x - eye.x) * t, eye.z + (p.z - eye.z) * t) > eye.y + (p.y - eye.y) * t + 0.6) return false; } return true; };
      let pts = null, best = 4;
      for (let k = 0; k < 20; k++) for (const r of [48, 72, 100]) {
        const a = (k / 20) * Math.PI * 2, x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r;
        if (blocked(x, z)) continue;
        const path = trace(x, z);
        if (path.length < 12) continue;
        let score = 0;
        for (let q = 0; q < path.length; q += 2) if (seen(path[q])) score++;
        if (score > best) { best = score; pts = path; }
      }
      if (!pts) return;
      v.torrent = pts[pts.length >> 1].toArray(); // (where to look for it)
      const n = pts.length;
      if (n < 12) return;
      const base = pos.length / 3;
      let along = 0;
      for (let k = 0; k < n; k++) {
        const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, sx = -(b.z - a.z) / l, sz = (b.x - a.x) / l;
        if (k) along += pts[k].distanceTo(pts[k - 1]);
        const w = (3.2 + 2.8 * (k / n)) / 2, f = Math.min(1, k / 3, (n - 1 - k) / 4); // (wide: it is seen from far)
        for (const g of [-1, 1]) { pos.push(pts[k].x + sx * w * g, pts[k].y, pts[k].z + sz * w * g); uv.push(g > 0 ? 1 : 0, along); fade.push(Math.max(0, f)); }
        if (k + 1 < n) { const q = base + k * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      }
    });
    if (!idx.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, fallsMaterial(water.shared.uFoam));
    mesh.name = 'sky-torrents';
    mesh.renderOrder = 12;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.torrents = idx.length / 6;
  }

  // The boards of the villages for hire: the same face for all (one small sheet, one mesh)
  // The boards of the villages that say something of themselves: their emblem, their name, a few lines.
  // One sheet each (there are few of them), all in one mesh per board.
  _buildBrands() {
    const up = V(0, 1, 0);
    for (const sg of this._brands) {
      const v = this.villages[sg.i], S = 512, canvas = document.createElement('canvas');
      canvas.width = S; canvas.height = S;
      const ctx = canvas.getContext('2d'), rgb = `rgb(${v.color.map((q) => Math.round(Math.min(1, q * 1.15) * 255))})`;
      ctx.fillStyle = '#f8f5ec'; ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = rgb; ctx.fillRect(0, 0, S, 16); ctx.fillRect(0, S - 62, S, 62);
      const lines = v.pitch || [], top = v.emblem && drawEmblem(ctx, v.emblem, S / 2, 112, 176, rgb) ? 214 : 40;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#101a2c';
      let size = 60;
      do { ctx.font = `800 ${size}px system-ui, sans-serif`; size -= 2; } while (ctx.measureText(v.name).width > S - 60 && size > 24);
      ctx.fillText(v.name, S / 2, top + 30);
      ctx.fillStyle = rgb; ctx.fillRect(S / 2 - 40, top + 66, 80, 5);
      lines.slice(0, 4).forEach((line, k) => {
        ctx.fillStyle = k ? '#39445a' : '#101a2c'; ctx.font = `${k ? 500 : 700} ${k ? 24 : 27}px system-ui, sans-serif`;
        ctx.fillText(line, S / 2, top + 100 + k * 36, S - 44);
      });
      ctx.fillStyle = '#ffffff'; ctx.font = '700 23px system-ui, sans-serif';
      ctx.fillText(v.url ? `${v.url.replace(/^https:\/\//, '')} — step up to visit` : v.name, S / 2, S - 40, S - 30);
      if (v.demo) { ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.font = '500 15px system-ui, sans-serif'; ctx.fillText('A demonstration village: yours could look like this', S / 2, S - 15, S - 30); }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const pos = new Float32Array(12), uv = new Float32Array(8);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], q) => {
        const p = sg.centre.clone().addScaledVector(sg.right, (a * sg.w) / 2).addScaledVector(up, (b * sg.h) / 2);
        pos.set([p.x, p.y, p.z], q * 3);
        uv.set([(a + 1) / 2, (b + 1) / 2], q * 2);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      mesh.name = 'sky-brand';
      this.group.add(mesh);
    }
  }

  _buildPerks() {
    if (!this._perks.length) return;
    const S = 512, canvas = document.createElement('canvas');
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f6f1e4'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#7a1420'; ctx.fillRect(0, 0, S, 118);
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(0, 118, S, 8);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f6e7b8'; ctx.font = "700 44px Georgia, 'Times New Roman', serif"; ctx.fillText(VILLAGE_PITCH.title, S / 2, 46, S - 30);
    ctx.fillStyle = '#f2c14e'; ctx.font = '600 22px system-ui, sans-serif'; ctx.fillText(VILLAGE_PITCH.sub, S / 2, 92, S - 30);
    ctx.textAlign = 'left'; ctx.font = '600 25px system-ui, sans-serif';
    VILLAGE_PERKS.forEach((line, k) => {
      const ly = 166 + k * 47;
      ctx.fillStyle = '#b3541e'; ctx.beginPath(); ctx.arc(40, ly, 8, 0, 7); ctx.fill();
      ctx.fillStyle = '#1b2a22'; ctx.fillText(line, 62, ly + 1, S - 84);
    });
    ctx.textAlign = 'center'; ctx.fillStyle = '#5a5140'; ctx.font = '500 21px system-ui, sans-serif';
    ctx.fillText(VILLAGE_PITCH.foot, S / 2, 458, S - 30);
    ctx.fillStyle = '#7a1420'; ctx.font = '700 22px system-ui, sans-serif'; ctx.fillText('FOR SALE — step up to this board', S / 2, 490);
    const n = this._perks.length, pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = [], up = V(0, 1, 0);
    this._perks.forEach((sg, k) => {
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], q) => {
        const p = sg.centre.clone().addScaledVector(sg.right, (a * sg.w) / 2).addScaledVector(up, (b * sg.h) / 2);
        pos.set([p.x, p.y, p.z], (k * 4 + q) * 3);
        uv.set([(a + 1) / 2, (b + 1) / 2], (k * 4 + q) * 2);
      });
      idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    mesh.name = 'sky-perks';
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  /** The village one stands in, or null. */
  villageAt(x, z) {
    for (const v of this.villages) if ((x - v.x) ** 2 + (z - v.z) ** 2 < SKY.pad * SKY.pad) return v;
    return null;
  }

  /** A village by its id (see sponsors.js) or its number (1 to 50). */
  find(key) {
    const k = String(key || '').toLowerCase();
    return this.villages.find((v) => v.id === k) || this.villages[parseInt(k, 10) - 1] || null;
  }

  update(dt, time, camera) {
    if (camera) this._cull(camera.position);
  }
}
