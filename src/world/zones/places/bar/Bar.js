// The Velvet Gasket: what is seen of it. Its plan is in plan.js; here it is built into the running game — a cave
// of its own (the game's own gallery: Caves.js, a hole cut in the terrain at its mouth, a corridor to walk in),
// a slab of rock and two boulders before its mouth, a small red lantern behind them; inside, a door of planks
// with a hatch, and beyond it a low vaulted room: a counter and its bottles, round tables with their lamps, a
// little stage with its curtain and footlights.
//
// Its light is its own, painted into the vertices: red and gold, dim. The walls are the rock of the game's caves
// with the lamps of the room painted over the daylight of the mouth; what furnishes the room is painted outright
// (a surface that only shines with what its vertices say, as the Sanctuary's inside is); what moves on the stage
// is lit as the robots of the game are.
import * as THREE from 'three';
import { Parts, MeshBuilder } from '../../../props/MeshBuilder.js';
import { surfaceMaterial } from '../../../../render/SurfaceMaterial.js';
import { staticCaster } from '../../../../render/Shadows.js';
import { buildCave } from '../Caves.js';
import { seatAt } from '../../../../player/PlayerController.js';
import { ANIM, emoteIndex } from '../../../../player/Character.js';
import { HATS, makeBouquet } from '../../../../player/Cosmetics.js';
import { PAINTS } from '../../../../../server/items.js';
import { BAR, AX, FLOOR, LAMPS, CARD, SHOW, smooth } from './plan.js';
import { buildStar } from './Star.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DZ = BAR.door.z;
/** How bright the painted light is shown (the game's eye is wide open: a half is nearly white). */
const EXPOSE = 0.42;
const SHADE = [0.06, 0.042, 0.04]; // what is left where no lamp reaches
const WOOD = [0.42, 0.24, 0.13], MAHOGANY = [0.36, 0.13, 0.07], VELVET = [0.72, 0.05, 0.08], GOLD = [1, 0.74, 0.26], ZINC = [0.66, 0.64, 0.58], CREAM = [0.95, 0.9, 0.78], IRON = [0.12, 0.11, 0.11], NIGHT = [0.1, 0.1, 0.34];
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/** The light painted on a point of the inside: [r, g, b]. (nx, ny, nz): the way its face looks — none for a thing too thin to have one. */
export function lightAt(x, y, z, nx = 0, ny = 0, nz = 0) {
  let r = SHADE[0], g = SHADE[1], b = SHADE[2];
  const faced = nx !== 0 || ny !== 0 || nz !== 0;
  for (const [lx, ly, lz, power, reach, c] of LAMPS) {
    if ((lz - DZ) * (z - DZ) < 0) continue; // (the door is between them)
    const dx = lx - x, dy = FLOOR + ly - y, dz = lz - z, d2 = dx * dx + dy * dy + dz * dz;
    let k = power / (1 + d2 / (reach * reach));
    if (faced) k *= 0.4 + 0.6 * Math.max(0, (nx * dx + ny * dy + nz * dz) / (Math.sqrt(d2) || 1));
    r += k * c[0]; g += k * c[1]; b += k * c[2];
  }
  return [r, g, b];
}

/** Paints the light of the place into what a builder holds: each vertex colour — what the thing is made of, so far — becomes what is seen of it. */
function paint(b, { flat = false, m = null } = {}) {
  const p = new THREE.Vector3(), n = new THREE.Vector3(), nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
  for (let i = 0; i < b.count; i++) {
    p.set(b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]); n.set(b.nrm[i * 3], b.nrm[i * 3 + 1], b.nrm[i * 3 + 2]);
    if (m) { p.applyMatrix4(m); n.applyMatrix3(nm).normalize(); }
    const l = flat ? lightAt(p.x, p.y, p.z) : lightAt(p.x, p.y, p.z, n.x, n.y, n.z), j = i * 4;
    b.col[j] *= l[0] * EXPOSE; b.col[j + 1] *= l[1] * EXPOSE; b.col[j + 2] *= l[2] * EXPOSE; b.col[j + 3] = 1;
  }
  return b;
}

/** The walls of the gallery, as Caves.js lit them (the day at the mouth, then nothing): the lamps of the room are painted over. */
function relight(b) {
  for (let i = 0; i < b.count; i++) {
    const j = i * 4, x = b.pos[i * 3], y = b.pos[i * 3 + 1], z = b.pos[i * 3 + 2], k = smooth(182.4, 184.4, z);
    if (k <= 0) continue;
    const l = lightAt(x, y, z), day = b.col[j + 3] * (1 - 0.72 * k);
    const w = [day + l[0] * 1.5 * k, day + l[1] * 1.5 * k, day * 1.04 + l[2] * 1.5 * k], A = Math.max(w[0], w[1], w[2]);
    b.col[j] *= w[0] / A; b.col[j + 1] *= w[1] / A; b.col[j + 2] *= w[2] / (A * 1.04); b.col[j + 3] = Math.min(1.9, Math.max(0.12, A));
  }
}

/** A lump of rock: a faceted ball pushed about by a few planes, stretched (sx, sy, sz). */
function lump(seed, sx, sy, sz) {
  const geo = new THREE.IcosahedronGeometry(1, 1), pos = geo.attributes.position, v = new THREE.Vector3(), planes = [];
  for (let k = 0; k < 7; k++) { const u = hash(seed + k * 3.1) * 2 - 1, a = hash(seed + k * 7.7) * Math.PI * 2, r = Math.sqrt(1 - u * u); planes.push({ n: V(r * Math.cos(a), u * 0.7, r * Math.sin(a)).normalize(), d: 0.5 + hash(seed + k * 1.9) * 0.4 }); }
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    for (const p of planes) { const over = v.dot(p.n) - p.d; if (over > 0) v.addScaledVector(p.n, -over * 0.85); }
    pos.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
  }
  geo.computeVertexNormals();
  const uv = geo.attributes.uv, n = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, pos.getX(i), pos.getZ(i)); else if (ax >= az) uv.setXY(i, pos.getZ(i), pos.getY(i)); else uv.setXY(i, pos.getX(i), pos.getY(i));
  }
  return geo;
}

/** A hanging cloth: a sheet in folds from `p` along `u` (a unit vector), `w` wide, `h` high; `n`: the way it faces. */
function drape(b, p, u, n, w, h, tone, folds = 8, depth = 0.07) {
  const N = folds * 2, col = (i) => { const k = i % 2 ? 1 : 0.5; return [tone[0] * k, tone[1] * k, tone[2] * k, 1]; };
  const at = (i, y) => V(p.x + u.x * (w * i) / N + n.x * (i % 2 ? depth : -depth), p.y + y, p.z + u.z * (w * i) / N + n.z * (i % 2 ? depth : -depth));
  for (let i = 0; i < N; i++) b.quad(at(i, 0), at(i + 1, 0), at(i + 1, h), at(i, h), { normal: n, colors: [col(i), col(i + 1), col(i + 1), col(i)] });
  return b;
}

/** What is written in the place, on one canvas: the slate, the sign, the name over the stage, the plate on the door, the bill, a label. */
const REGION = { slate: [0, 0, 768, 480], sign: [0, 480, 768, 160], name: [0, 640, 768, 128], door: [768, 0, 256, 256], bill: [768, 256, 256, 384], label: [768, 640, 128, 128] };
function writing() {
  const W = 1024, canvas = document.createElement('canvas');
  canvas.width = canvas.height = W;
  const g = canvas.getContext('2d'), serif = "Georgia, 'Times New Roman', serif";
  g.textBaseline = 'middle';
  // ---- the slate: the card of drinks, in chalk
  g.fillStyle = '#141d1a'; g.fillRect(0, 0, 768, 480);
  g.strokeStyle = '#7a5830'; g.lineWidth = 14; g.strokeRect(7, 7, 754, 466);
  g.textAlign = 'center'; g.fillStyle = '#f6efdc'; g.font = `700 66px ${serif}`; g.fillText(CARD.title, 384, 58);
  g.strokeStyle = '#f0b64a'; g.lineWidth = 3; g.beginPath(); g.moveTo(150, 100); g.lineTo(618, 100); g.stroke();
  CARD.drinks.forEach(([name, note], i) => {
    const y = 140 + i * 50;
    g.textAlign = 'left'; g.fillStyle = '#f6efdc'; g.font = `700 33px ${serif}`; g.fillText(name, 36, y);
    g.textAlign = 'right'; g.fillStyle = '#a9c4b0'; g.font = `italic 23px ${serif}`; g.fillText(note, 734, y + 2);
  });
  g.textAlign = 'center'; g.fillStyle = '#f0b64a'; g.font = `700 27px ${serif}`; g.fillText(CARD.foot, 384, 440);
  // ---- the sign over the counter: tubes of red light
  g.fillStyle = '#0b0506'; g.fillRect(0, 480, 768, 160);
  g.font = '800 122px system-ui, sans-serif'; g.shadowColor = '#ff1838'; g.shadowBlur = 26; g.fillStyle = '#ff3550'; g.fillText(CARD.title, 384, 564);
  g.shadowBlur = 8; g.fillStyle = '#ffd9d6'; g.font = '800 122px system-ui, sans-serif'; g.globalAlpha = 0.55; g.fillText(CARD.title, 384, 564); g.globalAlpha = 1; g.shadowBlur = 0;
  // ---- the name of the house, over the stage
  g.fillStyle = '#3b0910'; g.fillRect(0, 640, 768, 128);
  g.strokeStyle = '#f1c35a'; g.lineWidth = 5; g.strokeRect(8, 648, 752, 112);
  g.fillStyle = '#f6cf6c'; g.font = `700 66px ${serif}`; g.fillText(BAR.name.toUpperCase(), 384, 706, 700);
  // ---- the plate on the door
  g.fillStyle = '#5d4718'; g.fillRect(768, 0, 256, 256);
  g.strokeStyle = '#2a1f08'; g.lineWidth = 6; g.strokeRect(778, 10, 236, 236);
  g.fillStyle = '#1a1205'; g.font = `700 25px ${serif}`; g.fillText(BAR.name.toUpperCase(), 896, 52, 216);
  g.font = `italic 22px ${serif}`; g.fillText('cabaret', 896, 92);
  g.font = `700 30px ${serif}`; g.fillText('COVER:', 896, 142); g.fillText(`${BAR.cover} FLOWERS`, 896, 180, 216);
  g.font = `italic 19px ${serif}`; g.fillText('no flowers, no show', 896, 222);
  // ---- the bill of tonight
  g.fillStyle = '#eadfc4'; g.fillRect(768, 256, 256, 384);
  g.strokeStyle = '#a5121f'; g.lineWidth = 8; g.strokeRect(778, 266, 236, 364);
  g.fillStyle = '#a5121f'; g.font = `700 40px ${serif}`; g.fillText('TONIGHT', 896, 306);
  // (her outline: a bell of a skirt, a barrel, a round head, a hat with a feather)
  g.beginPath(); g.moveTo(856, 500); g.lineTo(936, 500); g.lineTo(914, 430); g.lineTo(878, 430); g.closePath(); g.fill();
  g.fillRect(874, 384, 44, 48); g.beginPath(); g.arc(896, 364, 20, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(896, 346, 34, 7, 0, 0, Math.PI * 2); g.fill(); g.fillRect(880, 330, 32, 16);
  g.strokeStyle = '#a5121f'; g.lineWidth = 6; g.beginPath(); g.moveTo(884, 332); g.quadraticCurveTo(850, 300, 842, 340); g.stroke();
  g.fillStyle = '#231a12'; g.font = `700 25px ${serif}`; g.fillText('MISS PEONY', 896, 530); g.font = `700 38px ${serif}`; g.fillText('PISTON', 896, 564);
  g.fillStyle = '#a5121f'; g.font = `700 17px ${serif}`; g.fillText('TAKES IT ALL OFF', 896, 596); g.fillStyle = '#231a12'; g.font = `italic 15px ${serif}`; g.fillText('down to the last bolt', 896, 616);
  // ---- the label of a bottle
  g.fillStyle = '#efe6cf'; g.fillRect(768, 640, 128, 128);
  g.strokeStyle = '#8a1220'; g.lineWidth = 5; g.strokeRect(774, 646, 116, 116);
  g.fillStyle = '#8a1220'; g.font = '800 25px system-ui, sans-serif'; g.fillText(CARD.title, 832, 680, 104);
  g.fillStyle = '#d09a1e'; g.beginPath(); g.moveTo(832, 700); g.quadraticCurveTo(856, 736, 832, 748); g.quadraticCurveTo(808, 736, 832, 700); g.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

export class Bar {
  /** @param app the game, once it runs (window.__mmf) */
  constructor(app) {
    this.app = app;
    this.world = app.world;
    this.group = new THREE.Group();
    this.group.name = 'bar';
    this.outside = new THREE.Group(); this.outside.name = 'bar-outside';
    this.inside = new THREE.Group(); this.inside.name = 'bar-inside';
    this.group.add(this.outside, this.inside);
    this.robots = {}; // doorman, barman, mini, guests: []
    this.door = { open: false, k: 0 }; // (k: how far the leaf has swung)
    this.peek = 0; // how far the shutter of the hatch has slid
    this.tossed = []; // the flowers that fly to the stage, and lie on it
    this._was = null; // what the show was at the last frame (for what happens once: a cheer, a step forward)
    this.time = 0;
  }

  /** Builds the place into the world. Returns itself. */
  build() {
    const { world } = this, col = world.collision, tier = world.engine.tier;
    const materials = {
      ...world.materials,
      barIn: surfaceMaterial({ name: 'bar-inside', color: [0, 0, 0], rough: 1, spec: 0, emissive: [1, 1, 1] }),
      barThin: surfaceMaterial({ name: 'bar-thin', color: [0, 0, 0], rough: 1, spec: 0, emissive: [1, 1, 1], side: THREE.DoubleSide }),
    };
    this.materials = materials;
    const inn = new Parts(), out = new Parts();
    // ---- the cave itself: the game's own gallery
    const seats = [], colliders = [];
    const { corridor, hole } = buildCave(inn, BAR.cave, { seats, colliders, ground: (x, z) => world.data.heightAt(x, z) });
    this.corridor = corridor; this.hole = hole;
    relight(inn.get('cave'));
    const day = corridor.light;
    /** (the light on who stands in it: what the day leaves, and the lamps) */
    corridor.light = (x, z) => { const l = lightAt(x, FLOOR + 1.1, z); return Math.min(1.25, day(x, z) * (z > DZ ? 0.7 : 1) + 0.85 * Math.max(l[0], l[1], l[2])); };
    const fl = (z) => corridor.floorAt(AX, z);

    this._outside(out);
    const P = inn.get('barIn'), T = inn.get('barThin'), G = inn.get('glow');
    this._door(P, G, fl(DZ));
    this._room(P, T, G);
    paint(P); paint(T, { flat: true });
    const plates = this._plates();

    const o = out.toMeshes(materials, { name: 'bar', layers: staticCaster(tier) });
    while (o.children.length) this.outside.add(o.children[0]);
    const i = inn.toMeshes(materials, { name: 'bar', layers: [] }); // (under the ground: no shadow to cast, nothing to mirror)
    while (i.children.length) this.inside.add(i.children[0]);
    this.inside.add(plates);
    this._moving(fl(DZ));
    this._robots();
    // ---- into the world: where one walks, what stops one, where one sits, the hole in the ground
    world.scene.add(this.group);
    this.group.updateMatrixWorld(true);
    col.addArea(corridor);
    for (const c of this._colliders) { if (c.box) c.handle = col.addBox(c.x, c.z, c.hw, c.hl, c.yaw || 0, c.y0 ?? -1e9, c.y1 ?? 1e9); else c.handle = col.addCircle(c.x, c.z, c.r, c.y0 ?? -1e9, c.y1 ?? 1e9); }
    for (const s of this._seats) world.seats.push(s);
    this.dig();
    this.cleared = this._clearMouth();
    world.scatter?.keepClear?.(AX, 176.4, 3.4);
    world.scatter?.keepClear?.(BAR.slab.x, BAR.slab.z, 3);
    return this;
  }

  /**
   * The boulders of the valley (props/Rocks.js) were laid before there was a mouth here: one that stands in it
   * goes, one that leans into the passage is pushed aside, up the slope — its instance and what stops one with
   * it. (The game keeps its boulders eight metres from the mouths of its own caves; this one wants its rocks.)
   * Returns what was done: [{ at: [x, z], to: [x, z] | null }].
   */
  _clearMouth() {
    const { world } = this, col = world.collision, ground = (x, z) => world.data.heightAt(x, z), done = [];
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), M = BAR.mouth, half = BAR.cave.nodes[0][2];
    for (const mesh of world.rocks?.group.children || []) {
      if (!mesh.isInstancedMesh) continue;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m); m.decompose(p, q, s);
        const reach = Math.max(s.x, s.z) * 0.9, aside = Math.abs(p.x - AX) - reach;
        if (s.x === 0 || p.z < M.z - 1.5 || p.z > M.z + 5 || aside > half + 0.3) continue;
        const was = [p.x, p.z];
        // (its collider, if it has one: the same place, size × 0.7)
        const c = col.circles.find((k) => Math.abs(k[0] - p.x) < 0.01 && Math.abs(k[1] - p.z) < 0.01 && k[3] < -1e8);
        if (Math.abs(p.x - AX) < half + 0.4) {
          m.makeScale(0, 0, 0); // (in the mouth: it goes)
          if (c) c[3] = 1e9;
          done.push({ at: was, to: null });
        } else {
          const side = Math.sign(p.x - AX), x = AX + side * (half + 0.35 + reach), sink = p.y - ground(p.x, p.z);
          p.set(x, ground(x, p.z) + Math.min(0, sink), p.z);
          m.compose(p, q, s);
          if (c) { c[3] = 1e9; col.addCircle(p.x, p.z, c[2]); }
          done.push({ at: was, to: [p.x, p.z] });
        }
        mesh.setMatrixAt(i, m);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    return done;
  }

  /**
   * The hole in the ground at the mouth: added to those the terrain already has, whoever cut them (the game's own
   * caves, another extra) — and put back if somebody who came later left it out.
   */
  dig() {
    const t = this.world.terrain, A = t.uniforms.uHoleA?.value || [], B = t.uniforms.uHoleB?.value || [], h = this.hole;
    if (A.some((a) => Math.abs(a.x - h.x) < 1e-6 && Math.abs(a.y - h.z) < 1e-6)) return false;
    const have = A.map((a, i) => ({ x: a.x, z: a.y, dx: a.z, dz: a.w, half: B[i].x, depth: B[i].y, floor: B[i].z, height: B[i].w, shape: t.uniforms.uHoleShape?.value ?? h.shape }));
    t.setHoles([...have, h]);
    return true;
  }

  // -------------------------------------------------------------------------------------------- outside
  _outside(out) {
    const { world } = this, rock = out.get('rock'), iron = out.get('matte'), ground = (x, z) => world.data.heightAt(x, z);
    this._colliders = []; this._seats = []; this._guestSeat = new Map();
    const put = (geo, x, z, yaw, lean, sink, tone) => {
      const y = ground(x, z) - sink, from = rock.count;
      rock.add(geo, new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(lean, yaw, 0, 'YXZ')).setPosition(x, y, z), [tone, tone * 0.985, tone * 0.96, 1]);
      // (darker underneath, as the boulders of the valley are)
      for (let i = from; i < rock.count; i++) rock.col[i * 4 + 3] = 0.55 + 0.45 * smooth(y - 0.2, y + 1.6, rock.pos[i * 3 + 1]);
    };
    const S = BAR.slab;
    put(lump(5, S.w / 2, S.h / 2 + 0.35, S.t / 2), S.x, S.z, S.yaw, S.lean, -S.h / 2 + 0.45, 0.94);
    this._colliders.push({ box: true, x: S.x, z: S.z, hw: S.w * 0.4, hl: S.t * 0.36, yaw: S.yaw });
    for (const [x, z, size, seed] of BAR.rocks) {
      put(lump(seed, size, size * 0.8, size * 0.95), x, z, seed, 0, size * 0.25, 0.9);
      this._colliders.push({ x, z, r: size * 0.78 });
    }
    // the lantern: an iron arm in the rock over the mouth, a little cage — and its light, for who is near
    const L = BAR.lantern;
    iron.tint(...IRON, 0.9).rod(V(L.x, L.y + 0.42, L.z + 0.6), V(L.x, L.y + 0.4, L.z), 0.022, 5).rod(V(L.x, L.y + 0.4, L.z), V(L.x, L.y + 0.14, L.z), 0.012, 4);
    iron.box(L.x - 0.085, L.y + 0.1, L.z - 0.085, L.x + 0.085, L.y + 0.14, L.z + 0.085).box(L.x - 0.085, L.y - 0.14, L.z - 0.085, L.x + 0.085, L.y - 0.11, L.z + 0.085);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) iron.rod(V(L.x + dx * 0.075, L.y - 0.11, L.z + dz * 0.075), V(L.x + dx * 0.075, L.y + 0.1, L.z + dz * 0.075), 0.008, 4);
    const g = new MeshBuilder();
    g.tint(1, 0.1, 0.06, 1).box(L.x - 0.06, L.y - 0.1, L.z - 0.06, L.x + 0.06, L.y + 0.09, L.z + 0.06);
    // (a red of its own, unlit: the game's glowing material would whiten it to the colour of a peach in daylight)
    this.lantern = new THREE.Mesh(g.build(), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.07, 0.04), toneMapped: false, fog: false }));
    this.lantern.name = 'bar:lantern';
    this.lantern.visible = false;
    this.outside.add(this.lantern);
  }

  // -------------------------------------------------------------------------------------------- the door
  /** The wall of planks across the passage (the leaf and the shutter of the hatch are made with what moves). */
  _door(P, G, f) {
    const D = BAR.door, H = BAR.hatch, z0 = DZ - 0.05, z1 = DZ + 0.05, top = f + 3.3, x0 = AX - 2.7, x1 = AX + 2.7;
    const planks = (xa, xb, ya, yb) => { for (let x = xa, k = Math.round(xa * 7); x < xb - 0.03; x += 0.21, k++) { const t = 0.82 + 0.3 * hash(k * 1.7); P.tint(WOOD[0] * t, WOOD[1] * t, WOOD[2] * t, 1).box(x + 0.006, ya, z0, Math.min(xb, x + 0.21) - 0.006, yb, z1); } };
    planks(x0, D.x0, f - 0.1, top); // west of the door
    planks(D.x0, D.x1, f + D.height, top); // over it
    const hx0 = H.x - H.w / 2, hx1 = H.x + H.w / 2, hy0 = f + H.y - H.h / 2, hy1 = f + H.y + H.h / 2;
    planks(D.x1, hx0, f - 0.1, top); planks(hx1, x1, f - 0.1, top); planks(hx0, hx1, f - 0.1, hy0); planks(hx0, hx1, hy1, top);
    // the frame of the door and of the hatch, in iron
    P.tint(...IRON, 1);
    for (const x of [D.x0 - 0.07, D.x1]) P.box(x, f - 0.1, z0 - 0.03, x + 0.07, f + D.height + 0.07, z1 + 0.03);
    P.box(D.x0 - 0.07, f + D.height, z0 - 0.03, D.x1 + 0.07, f + D.height + 0.07, z1 + 0.03);
    P.box(hx0 - 0.04, hy0 - 0.04, z0 - 0.025, hx1 + 0.04, hy0, z0).box(hx0 - 0.04, hy1, z0 - 0.025, hx1 + 0.04, hy1 + 0.04, z0);
    P.box(hx0 - 0.04, hy0, z0 - 0.025, hx0, hy1, z0).box(hx1, hy0, z0 - 0.025, hx1 + 0.04, hy1, z0);
    // a red lamp over the door, a warm one behind it
    G.tint(1, 0.13, 0.08, 1).add(new THREE.SphereGeometry(0.075, 8, 6), new THREE.Matrix4().makeTranslation(AX, f + 2.33, DZ - 0.3));
    P.tint(...IRON, 1).rod(V(AX, f + 2.33, DZ - 0.05), V(AX, f + 2.33, DZ - 0.24), 0.015, 4);
    this._colliders.push({ box: true, x: (x0 + D.x0) / 2, z: DZ, hw: (D.x0 - x0) / 2, hl: 0.12 }, { box: true, x: (D.x1 + x1) / 2, z: DZ, hw: (x1 - D.x1) / 2, hl: 0.12 });
    this._leaf = { box: true, x: (D.x0 + D.x1) / 2, z: DZ, hw: (D.x1 - D.x0) / 2, hl: 0.12 };
    this._colliders.push(this._leaf);
    this._plateList = [[H.x, f + 0.86, z0 - 0.012, Math.PI, 0.52, 0.52, 'door']];
  }

  // -------------------------------------------------------------------------------------------- the room
  _room(P, T, G) {
    const C = BAR.counter, S = BAR.stage, top = FLOOR + S.height, F = FLOOR, pl = this._plateList;
    const lamp = (x, y, z, r, tone) => G.tint(tone[0], tone[1], tone[2], 1).add(new THREE.SphereGeometry(r, 8, 6), new THREE.Matrix4().makeTranslation(x, y, z));
    // ---- a runner of red carpet from the door to the stage
    P.tint(...VELVET, 1).box(AX - 0.75, F - 0.02, DZ + 0.3, AX + 0.75, F + 0.07, S.z0 - 0.05, { faces: 'xXYzZ' });
    P.tint(...GOLD, 1);
    for (const x of [AX - 0.75, AX + 0.68]) P.box(x, F + 0.05, DZ + 0.3, x + 0.07, F + 0.076, S.z0 - 0.05, { faces: 'Y' });

    // ---- the stage: boards, a red front, footlights; two gilded columns and a beam; curtains
    P.tint(...WOOD, 1);
    for (let x = S.x0, k = 0; x < S.x1 - 0.03; x += 0.3, k++) { const t = 0.85 + 0.3 * hash(k * 2.3); P.tint(WOOD[0] * t, WOOD[1] * t, WOOD[2] * t, 1).box(x, top - 0.04, S.z0, Math.min(S.x1, x + 0.3) - 0.008, top, S.z1, { faces: 'Y' }); }
    P.tint(VELVET[0] * 0.6, VELVET[1] * 0.6, VELVET[2] * 0.6, 1).box(S.x0, F - 0.1, S.z0, S.x1, top - 0.04, S.z1, { faces: 'xXz' });
    P.tint(...GOLD, 1).box(S.x0 - 0.02, top - 0.07, S.z0 - 0.03, S.x1 + 0.02, top + 0.005, S.z0, { faces: 'xXyYz' }).box(S.x0 - 0.02, F, S.z0 - 0.02, S.x1 + 0.02, F + 0.07, S.z0, { faces: 'xXYz' });
    for (let k = 0; k < 7; k++) {
      const x = AX + (k - 3) * 0.95, z = S.z0 - 0.1;
      // (a shell of tin between the lamp and the room, the lamp turned to the boards)
      P.tint(...GOLD, 1).add(new THREE.SphereGeometry(0.11, 8, 5, Math.PI, Math.PI, 0, Math.PI / 2), new THREE.Matrix4().makeTranslation(x, top - 0.02, z));
      lamp(x, top + 0.035, z + 0.03, 0.045, [1, 0.8, 0.45]);
    }
    for (const x of [S.x0 + 0.26, S.x1 - 0.26]) {
      P.tint(...GOLD, 1).cylinder(x, top, S.z0 + 0.2, 0.2, 0.2, 0.12, 10).cylinder(x, top + 0.12, S.z0 + 0.2, 0.13, 0.11, 2.7, 10).cylinder(x, top + 2.82, S.z0 + 0.2, 0.12, 0.2, 0.13, 10);
    }
    P.tint(VELVET[0] * 0.55, VELVET[1] * 0.55, VELVET[2] * 0.55, 1).box(S.x0 - 0.12, top + 2.95, S.z0 + 0.03, S.x1 + 0.12, top + 3.4, S.z0 + 0.37);
    P.tint(...GOLD, 1).box(S.x0 - 0.16, top + 2.92, S.z0, S.x1 + 0.16, top + 2.97, S.z0 + 0.4).box(S.x0 - 0.16, top + 3.4, S.z0, S.x1 + 0.16, top + 3.45, S.z0 + 0.4);
    pl.push([AX, top + 3.18, S.z0 + 0.018, Math.PI, 4.3, 0.4, 'name']);
    const north = V(0, 0, -1), east = V(1, 0, 0), south = V(0, 0, 1);
    drape(T, V(S.x0 + 0.1, top + 2.52, S.z0 + 0.3), east, north, S.x1 - S.x0 - 0.2, 0.44, VELVET, 14, 0.05); // the valance
    drape(T, V(S.x0 + 0.3, top, S.z1 - 0.16), east, north, S.x1 - S.x0 - 0.6, 3.05, NIGHT, 10, 0.05); // the cloth at the back: a night sky
    for (let k = 0; k < 26; k++) { const x = S.x0 + 0.6 + hash(k * 3.3) * (S.x1 - S.x0 - 1.2), y = top + 0.5 + hash(k * 5.1) * 2.3, r = 0.02 + 0.035 * hash(k * 9.7); G.tint(0.5, 0.42, 0.2, 1).box(x - r, y - r, S.z1 - 0.24, x + r, y + r, S.z1 - 0.225, { faces: 'z' }); }
    for (const [x, dir] of [[S.x0 + 0.12, 1], [S.x1 - 0.12, -1]]) drape(T, V(x, top, S.z0 + 0.45), south, V(dir, 0, 0), S.z1 - S.z0 - 0.6, 3.0, [VELVET[0] * 0.7, VELVET[1] * 0.7, VELVET[2] * 0.7], 5, 0.05); // the wings
    this._colliders.push({ box: true, x: (S.x0 + S.x1) / 2, z: (S.z0 + S.z1) / 2, hw: (S.x1 - S.x0) / 2 + 0.05, hl: (S.z1 - S.z0) / 2 + 0.12, y0: F - 1, y1: F + 4 });

    // ---- the counter: mahogany and zinc, its ends turned to the wall; a brass rail; stools
    const xa = C.x - C.depth / 2, xb = C.x + C.depth / 2, wall = AX + 7.4;
    const block = (ax, az, bx, bz) => {
      P.tint(...MAHOGANY, 1).box(ax, F - 0.1, az, bx, F + C.height - 0.05, bz, { faces: 'xXzZ' });
      P.tint(...ZINC, 1).box(ax - 0.06, F + C.height - 0.05, az - 0.06, bx + 0.06, F + C.height, bz + 0.06);
      this._colliders.push({ box: true, x: (ax + bx) / 2, z: (az + bz) / 2, hw: (bx - ax) / 2 + 0.04, hl: (bz - az) / 2 + 0.04, y0: F - 1, y1: F + 2.6 });
    };
    block(xa, C.z0, xb, C.z1); block(xb, C.z0, wall, C.z0 + 0.5); block(xb, C.z1 - 0.5, wall, C.z1);
    P.tint(MAHOGANY[0] * 1.6, MAHOGANY[1] * 1.6, MAHOGANY[2] * 1.6, 1);
    for (let z = C.z0 + 0.35; z < C.z1 - 0.3; z += 0.9) P.box(xa - 0.012, F + 0.28, z, xa, F + 0.86, z + 0.62, { faces: 'xzZyY' });
    P.tint(...GOLD, 1).rod(V(xa - 0.16, F + 0.2, C.z0 + 0.1), V(xa - 0.16, F + 0.2, C.z1 - 0.1), 0.025, 6);
    for (const z of [C.z0 + 0.3, (C.z0 + C.z1) / 2, C.z1 - 0.3]) P.rod(V(xa, F + 0.2, z), V(xa - 0.16, F + 0.2, z), 0.018, 5);
    for (const z of [C.z0 + 0.95, (C.z0 + C.z1) / 2, C.z1 - 0.95]) {
      const x = xa - 0.72;
      P.tint(...IRON, 1).cylinder(x, F - 0.05, z, 0.2, 0.17, 0.07, 10).cylinder(x, F, z, 0.03, 0.03, 0.7, 6).cylinder(x, F + 0.26, z, 0.16, 0.16, 0.02, 10, { capBottom: true });
      P.tint(...VELVET, 1).cylinder(x, F + 0.7, z, 0.2, 0.19, 0.06, 12);
      this._seats.push(seatAt(x, F + 0.76, z, Math.PI / 2, { reach: 1.1, exit: [x - 0.75, z] }));
      this._colliders.push({ x, z, r: 0.22, y0: F - 1, y1: F + 0.5 });
    }
    // on it: bottles, glasses, an oil can
    const bottle = (x, y, z, tone, k = 1) => P.tint(...tone, 1).push(new THREE.Matrix4().makeTranslation(x, y, z)).lathe([[0.001, 0], [0.05 * k, 0], [0.05 * k, 0.17 * k], [0.018 * k, 0.25 * k], [0.018 * k, 0.33 * k], [0.001, 0.33 * k]], 8).pop();
    const glass = (x, y, z) => P.tint(0.8, 0.82, 0.8, 1).cylinder(x, y, z, 0.022, 0.034, 0.1, 8).tint(0.55, 0.38, 0.1, 1).cylinder(x, y + 0.06, z, 0.027, 0.031, 0.035, 8);
    const can = (x, y, z, yaw) => P.tint(...ZINC, 1).push(new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z)).cylinder(0, 0, 0, 0.07, 0.07, 0.1, 10).cylinder(0, 0.1, 0, 0.07, 0.012, 0.07, 10).rod(V(0, 0.15, 0), V(0.22, 0.25, 0), 0.008, 4).pop();
    const TONES = [[0.5, 0.3, 0.06], [0.1, 0.3, 0.14], [0.3, 0.07, 0.06], [0.62, 0.5, 0.2]];
    bottle(C.x + 0.05, F + C.height, C.z0 + 0.7, TONES[0], 1.15); bottle(C.x - 0.08, F + C.height, C.z0 + 0.95, TONES[1], 1.15); glass(C.x - 0.14, F + C.height, C.z0 + 1.5); glass(C.x + 0.02, F + C.height, C.z0 + 3.1);
    can(C.x + 0.05, F + C.height, C.z1 - 0.9, 2.2); bottle(C.x + 0.1, F + C.height, C.z1 - 1.5, TONES[2], 1.15);
    pl.push([C.x + 0.05 - 0.062, F + C.height + 0.12, C.z0 + 0.7, -Math.PI / 2, 0.085, 0.085, 'label'], [C.x - 0.08 - 0.062, F + C.height + 0.12, C.z0 + 0.95, -Math.PI / 2, 0.085, 0.085, 'label'], [C.x + 0.1 - 0.062, F + C.height + 0.12, C.z1 - 1.5, -Math.PI / 2, 0.085, 0.085, 'label']);
    // behind it: two posts, two shelves of bottles, and the slate over them
    const sx = C.x + 1.42, sz0 = C.z0 + 0.72, sz1 = C.z1 - 0.72;
    P.tint(...MAHOGANY, 1);
    for (const z of [sz0 - 0.1, sz1]) P.box(sx - 0.05, F - 0.1, z, sx + 0.07, F + 3.2, z + 0.1);
    for (const y of [1.12, 1.6]) {
      P.tint(...MAHOGANY, 1).box(sx - 0.2, F + y, sz0, sx + 0.07, F + y + 0.04, sz1);
      for (let k = 0; k < 9; k++) { const z = sz0 + 0.2 + k * ((sz1 - sz0 - 0.4) / 8); bottle(sx - 0.06, F + y + 0.04, z, TONES[(k + (y > 1.5 ? 1 : 0)) % 4]); pl.push([sx - 0.06 - 0.053, F + y + 0.14, z, -Math.PI / 2, 0.07, 0.07, 'label']); }
    }
    P.tint(...MAHOGANY, 1).box(sx - 0.02, F + 2.02, sz0 - 0.16, sx + 0.04, F + 3.2, sz1 + 0.16, { faces: 'xzZyY' });
    pl.push([sx - 0.03, F + 2.61, (sz0 + sz1) / 2, -Math.PI / 2, 1.76, 1.1, 'slate']);
    // the sign, hung from the vault, a little turned to the door; two lamps over the zinc
    const sy = F + 3.42, sw = 2.4, syaw = -Math.PI / 2 - 0.3, sc = (C.z0 + C.z1) / 2;
    pl.push([C.x - 0.1, sy, sc, syaw, sw, 0.5, 'sign', 0, true]);
    P.tint(...IRON, 1);
    for (const e of [-1, 1]) { const x = C.x - 0.1 - Math.cos(syaw) * e * (sw / 2 - 0.15) + 0.02, z = sc + Math.sin(syaw) * e * (sw / 2 - 0.15); P.rod(V(x, sy + 0.25, z), V(x, F + 4.35, z), 0.012, 4); }
    for (const z of [C.z0 + 1.3, C.z1 - 1.3]) {
      P.tint(...IRON, 1).rod(V(C.x, F + 2.36, z), V(C.x, F + 4.3, z), 0.01, 4);
      P.tint(...GOLD, 1).cylinder(C.x, F + 2.2, z, 0.2, 0.05, 0.16, 10, { capTop: false });
      lamp(C.x, F + 2.2, z, 0.06, [1, 0.72, 0.36]);
    }

    // ---- the tables, each with its cloth and its lamp; the chairs
    for (const [x, z] of BAR.tables) {
      P.tint(...IRON, 1).cylinder(x, F - 0.05, z, 0.27, 0.24, 0.08, 10).cylinder(x, F, z, 0.045, 0.045, 0.72, 6);
      P.tint(...CREAM, 1).push(new THREE.Matrix4().makeTranslation(x, F, z)).lathe([[0.56, 0.5], [0.53, 0.735], [0.001, 0.745]], 14).pop();
      P.tint(...GOLD, 1).cylinder(x, F + 0.745, z, 0.05, 0.03, 0.14, 8);
      G.tint(0.62, 0.11, 0.05, 1).push(new THREE.Matrix4().makeTranslation(x, F + 0.885, z)).lathe([[0.13, 0], [0.07, 0.13], [0.001, 0.13]], 10).pop();
      glass(x + 0.26, F + 0.74, z + 0.14); can(x - 0.2, F + 0.74, z - 0.22, x * 3.1);
      this._colliders.push({ x, z, r: 0.5, y0: F - 1, y1: F + 1.2 });
    }
    for (const c of BAR.chairs) {
      const y = F;
      P.tint(...MAHOGANY, 1).place(c.x, y, c.z, c.yaw);
      P.box(-0.21, 0.31, -0.21, 0.21, 0.35, 0.21);
      for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [0.18, 0.18], [-0.18, 0.18]]) P.box(lx - 0.025, -0.05, lz - 0.025, lx + 0.025, 0.31, lz + 0.025);
      P.box(-0.21, 0.35, -0.21, -0.165, 0.86, -0.17).box(0.165, 0.35, -0.21, 0.21, 0.86, -0.17).box(-0.21, 0.6, -0.205, 0.21, 0.84, -0.175);
      P.tint(...VELVET, 1).box(-0.19, 0.35, -0.17, 0.19, 0.385, 0.19);
      P.pop();
      const seat = seatAt(c.x, y + 0.38, c.z, c.yaw, { reach: 1.2, exit: [c.x - Math.sin(c.yaw) * 0.8, c.z - Math.cos(c.yaw) * 0.8] });
      if (c.guest) this._guestSeat.set(c, seat); else this._seats.push(seat);
      this._colliders.push({ x: c.x, z: c.z, r: 0.3, y0: F - 1, y1: F + (c.guest ? 1.4 : 0.5) });
    }
    // ---- red lamps on the walls, a warm one in the vestibule, the bill of tonight on an easel by the door
    for (const [x, y, z, , , tone] of LAMPS.slice(-3)) { lamp(x, F + y, z, 0.09, [tone[0], tone[1] * 0.5, tone[2] * 0.4]); P.tint(...IRON, 1).rod(V(x, F + y - 0.02, z), V(x + Math.sign(x - AX) * 0.6, F + y - 0.12, z), 0.014, 4); }
    lamp(-65.6, F + 2.3, 187.6, 0.06, [1, 0.62, 0.3]);
    const ex = AX + 2.25, ez = 189.7, eyaw = Math.PI + 0.7;
    P.tint(...WOOD, 1).place(ex, F, ez, eyaw).rod(V(-0.3, -0.05, 0.02), V(-0.22, 1.75, -0.14), 0.02, 5).rod(V(0.3, -0.05, 0.02), V(0.22, 1.75, -0.14), 0.02, 5).rod(V(0, -0.05, -0.62), V(0, 1.7, -0.16), 0.02, 5).box(-0.34, 0.62, -0.04, 0.34, 0.66, 0.06).pop();
    pl.push([ex - Math.sin(eyaw) * 0.05, F + 1.2, ez - Math.cos(eyaw) * 0.05, eyaw, 0.7, 1.05, 'bill', -0.09]);
    this._colliders.push({ x: ex, z: ez, r: 0.4, y0: F - 1, y1: F + 2 });
  }

  /** What is written, as one mesh: [x, y, z, yaw (the way it faces), w, h, which, lean]. */
  _plates() {
    const tex = writing(), pos = [], uv = [], idx = [];
    for (const [x, y, z, yaw, w, h, which, lean = 0, both = false] of this._plateList) {
      const [px, py, pw, ph] = REGION[which], u0 = px / 1024, u1 = (px + pw) / 1024, v1 = 1 - py / 1024, v0 = 1 - (py + ph) / 1024, c = Math.cos(yaw), s = Math.sin(yaw), b = pos.length / 3;
      const at = (lx, ly) => { const lz = ly * lean; return [x + lx * c + lz * s, y + ly, z - lx * s + lz * c]; };
      pos.push(...at(-w / 2, -h / 2), ...at(w / 2, -h / 2), ...at(w / 2, h / 2), ...at(-w / 2, h / 2));
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      if (both) idx.push(b, b + 2, b + 1, b, b + 3, b + 2); // (tubes of light: read from behind too, the wrong way round)
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    mesh.name = 'bar:writing';
    return mesh;
  }

  // -------------------------------------------------------------------------------------------- what moves
  _moving(f) {
    const D = BAR.door, H = BAR.hatch, S = BAR.stage, top = FLOOR + S.height, M = this.materials;
    // ---- the leaf of the door: it turns about its west edge, into the vestibule
    {
      const b = new MeshBuilder(), w = D.x1 - D.x0;
      for (let x = 0, k = 0; x < w - 1e-6; x += 0.23, k++) { const t = 0.8 + 0.3 * hash(k * 4.1 + 2); b.tint(WOOD[0] * t, WOOD[1] * t * 0.9, WOOD[2] * t * 0.85, 1).box(x + 0.005, 0.01, -0.035, Math.min(w, x + 0.23) - 0.005, D.height, 0.035); }
      b.tint(...IRON, 1);
      for (const y of [0.35, 1.65]) b.box(0, y, -0.05, w, y + 0.09, 0.05);
      b.tint(...GOLD, 1).add(new THREE.TorusGeometry(0.07, 0.014, 5, 12), new THREE.Matrix4().makeTranslation(w * 0.5, 1.12, -0.06)).cylinder(w * 0.5, 1.185, -0.05, 0.02, 0.02, 0.02, 6);
      const at = new THREE.Matrix4().makeTranslation(D.x0, f, DZ);
      paint(b, { m: at });
      this.leaf = new THREE.Mesh(b.build(), M.barIn);
      this.leaf.name = 'bar:leaf';
      this.leaf.position.set(D.x0, f, DZ);
      this.inside.add(this.leaf);
    }
    // ---- the shutter of the hatch: it slides aside when somebody comes
    {
      const b = new MeshBuilder();
      b.tint(...IRON, 1).box(-H.w / 2 - 0.02, -H.h / 2 - 0.02, 0, H.w / 2 + 0.02, H.h / 2 + 0.02, 0.02).tint(...GOLD, 1).box(-0.03, -0.03, -0.02, 0.03, 0.03, 0);
      paint(b, { m: new THREE.Matrix4().makeTranslation(H.x, f + H.y, DZ + 0.03) });
      this.shutter = new THREE.Mesh(b.build(), M.barIn);
      this.shutter.name = 'bar:shutter';
      this.shutter.position.set(H.x, f + H.y, DZ + 0.03);
      this.inside.add(this.shutter);
    }
    // ---- the curtain: two halves, each gathered to its side as it opens
    this.curtain = [1, -1].map((s) => {
      const b = new MeshBuilder(), w = (S.x1 - S.x0) / 2 - 0.12;
      // (built from its outer edge inwards: it is that edge that stays where it is)
      drape(b, V(0, 0, 0), V(-s, 0, 0), V(0, 0, -1), w, 2.6, VELVET, 9, 0.075);
      b.tint(...GOLD, 1).box(Math.min(0, -s * w), 0, -0.09, Math.max(0, -s * w), 0.09, 0.09, { faces: 'zY' });
      const edge = s > 0 ? S.x1 - 0.12 : S.x0 + 0.12;
      paint(b, { flat: true, m: new THREE.Matrix4().makeTranslation(edge, top, S.z0 + 0.34) });
      const m = new THREE.Mesh(b.build(), M.barThin);
      m.name = 'bar:curtain';
      m.position.set(edge, top, S.z0 + 0.34);
      this.inside.add(m);
      return m;
    });
    // ---- the star, and what comes off her
    this.star = buildStar(M, { x: BAR.star.x, y: top, z: BAR.star.z });
    this.inside.add(this.star.group, this.star.loose);
  }

  // -------------------------------------------------------------------------------------------- the robots of the house
  _robots() {
    const me = this.app.me, R = this.robots, F = FLOOR;
    R.guests = [];
    if (!me?.factory) return;
    const make = (name, color, { hat, paint, anim = ANIM.idle, size = 1 } = {}) => {
      const guy = me.factory.create(color);
      if (hat) guy.setLook({ hat: Math.max(0, HATS.findIndex((h) => h.id === hat)) });
      const p = paint ? PAINTS.indexOf(paint) : 0;
      if (p > 0) guy.setPaint(p);
      guy.size = size;
      guy.setAnim(anim);
      guy.setLight(true); // (under the ground: no shadow to cast, no water to be mirrored in)
      guy.root.name = `bar-${name}`;
      this.inside.add(guy.root);
      return guy;
    };
    const D = BAR.doorman, B = BAR.barman;
    R.doorman = make('doorman', 17, { hat: 'cap', paint: 'hazard' });
    R.doorman.root.position.set(D.x, this.corridor.floorAt(D.x, D.z), D.z);
    R.doorman.root.rotation.y = Math.PI; // (he looks north, through his hatch)
    this._colliders.push({ x: D.x, z: D.z, r: 0.4 });
    R.barman = make('barman', 18, { paint: 'chrome' });
    R.barman.root.position.set(B.x, F, B.z);
    R.barman.root.rotation.y = -Math.PI / 2; // (…and he, west, over his counter)
    BAR.chairs.forEach((c, k) => {
      if (!c.guest) return;
      const guy = make(`guest-${k}`, c.guest.color, { hat: c.guest.hat, paint: c.guest.paint, anim: ANIM.sit });
      const seat = this._guestSeat.get(c);
      guy.root.position.set(seat.x, seat.y, seat.z);
      guy.root.rotation.y = c.yaw;
      R.guests.push(guy);
    });
    // the smaller robot inside the star: it steps out when her shell opens
    R.mini = make('mini', 6, { hat: 'tophat', paint: 'gold', size: 0.62 });
    R.mini.root.visible = false;
    R.mini.root.rotation.y = Math.PI;
    this._mini = 'in';
  }

  /** Every robot of the house, for who counts them. */
  get everyone() { const R = this.robots; return [R.doorman, R.barman, R.mini, ...(R.guests || [])].filter(Boolean); }

  /** The room claps, or cheers: 'clap' | 'cheer' | 'hype'. `share`: how many of the guests do (0 … 1). */
  react(kind, share = 1) {
    const i = emoteIndex(kind);
    if (i < 0) return;
    this.robots.guests.forEach((g, k) => { if (share >= 1 || hash(k * 7.3 + this.time) < share) g.emote(i); });
    if (share >= 1) this.robots.barman?.emote(emoteIndex('clap'));
  }

  /** A flower flies from (x, y, z) to the stage. */
  toss(x, y, z, kind) {
    const S = BAR.stage, m = makeBouquet([kind]);
    m.scale.setScalar(0.8);
    this.inside.add(m);
    const to = V(AX + (hash(this.time * 3.7) - 0.5) * 3.6, FLOOR + S.height + 0.06, S.z0 + 0.35 + hash(this.time * 9.1) * 0.9);
    this.tossed.push({ m, from: V(x, y, z), to, t: 0, turn: this._was?.turn });
    while (this.tossed.length > 12) { const old = this.tossed.shift(); old.m.removeFromParent(); old.m.geometry.dispose(); }
    return to;
  }

  /**
   * Every frame. `show`: where the show is (plan.js: showAt); o: { drawn (the inside is in sight), flourish (0 … 1),
   * x, z (the visitor), busy (the visitor is elsewhere: playing a game) }. Returns what has just happened, for who
   * tells it: [{ what: 'roll' | 'off' | 'out' | 'bow' | 'open', n }].
   */
  update(dt, show, o) {
    this.time += dt;
    const R = this.robots, S = BAR.stage, events = [];
    this.inside.visible = !!o.drawn;
    this.lantern.visible = !!o.lantern;
    // the door: its leaf swings; what stops one there lets go when it is open
    const want = this.door.open ? 1 : 0;
    this.door.k += (want - this.door.k) * Math.min(1, dt * 3.2);
    if (this._leaf.handle) this._leaf.handle[6] = this.door.k > 0.5 ? 1e9 : -1e9;
    if (!o.drawn) { this._was = null; return events; }
    this.leaf.rotation.y = -1.72 * this.door.k;
    this.peek += ((o.peek ? 1 : 0) - this.peek) * Math.min(1, dt * 5);
    this.shutter.position.x = BAR.hatch.x + this.peek * (BAR.hatch.w + 0.05);
    // the curtain
    for (const m of this.curtain) m.scale.x = 1 - 0.84 * show.curtain;
    // the star
    this.star.pose(show, { flourish: o.flourish || 0, time: this.time });
    // the smaller robot: inside her until the shell opens; then a step forward, a dance, a bow
    const mini = R.mini, t = show.t, T5 = SHOW.off[4];
    if (mini) {
      const now = !show.on || show.n < 5 ? 'in' : t < T5 + 1.7 ? 'step' : t < SHOW.bow ? 'dance' : t < SHOW.bow + 3 ? 'bow' : 'wave';
      const z = BAR.star.z - 1.05 * smooth(T5 + 0.3, T5 + 1.7, show.on ? t : 0);
      mini.root.visible = now !== 'in';
      mini.root.position.set(BAR.star.x, FLOOR + S.height, z);
      if (now !== this._mini) {
        this._mini = now;
        if (now === 'step') mini.setAnim(ANIM.walk, 1.4);
        else if (now === 'dance') { mini.setAnim(ANIM.idle); mini.emote(emoteIndex('dance')); }
        else if (now === 'bow' || now === 'wave') { mini.setAnim(ANIM.idle); mini.emote(emoteIndex(now)); }
        else mini.setAnim(ANIM.idle);
      }
    }
    // what happens once, as the show goes from one step to the next
    const was = this._was;
    if (was && was.turn === show.turn) {
      if (show.n > was.n) events.push({ what: show.n === 5 ? 'out' : 'off', n: show.n });
      if (show.step !== was.step && (show.step === 'drums' || show.step === 'bow')) events.push({ what: show.step === 'bow' ? 'bow' : 'roll' });
    } else if (was && show.on && !was.on) events.push({ what: 'open' });
    this._was = { turn: show.turn, n: show.n, step: show.step, on: show.on };
    for (const e of events) {
      if (e.what === 'off') this.react('clap', 0.6);
      if (e.what === 'out') { this.react('cheer'); this.world.sparks?.glitter(BAR.star.x, FLOOR + S.height + 1.1, BAR.star.z - 0.3, 1.1, 70); this.world.sparks?.feathers?.(BAR.star.x, FLOOR + S.height + 1.4, BAR.star.z, 14); }
      if (e.what === 'bow') this.react('clap');
    }
    // the flowers thrown: they fly, they lie, and are swept away with the number
    for (let k = this.tossed.length - 1; k >= 0; k--) {
      const f = this.tossed[k];
      f.t = Math.min(1, f.t + dt / 0.7);
      f.m.position.lerpVectors(f.from, f.to, f.t);
      f.m.position.y += 1.3 * 4 * f.t * (1 - f.t);
      f.m.rotation.set(f.t < 1 ? f.t * 7 : 1.45, f.t * 5, 0);
      if (f.t >= 1 && (!show.on || show.turn !== f.turn) && show.curtain < 0.02) { f.m.removeFromParent(); f.m.geometry.dispose(); this.tossed.splice(k, 1); }
    }
    // the robots of the house: lit by the lamps, the barman turned to who comes to his counter
    const B = BAR.barman, near = (o.x - BAR.counter.x) ** 2 + (o.z - B.z) ** 2 < 16 && !o.busy;
    if (R.barman) { const want2 = near ? Math.atan2(o.x - B.x, o.z - B.z) : -Math.PI / 2; let d = want2 - R.barman.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); R.barman.root.rotation.y += d * Math.min(1, dt * 4); }
    for (const g of this.everyone) {
      if (!g.root.visible) continue;
      const p = g.root.position, l = lightAt(p.x, p.y + 1.1, p.z);
      g.setAmbient(Math.min(1.5, 0.22 + 1.05 * Math.max(l[0], l[1], l[2]) + (g === mini ? 0.35 : 0)));
      g.update(dt);
    }
    return events;
  }
}
