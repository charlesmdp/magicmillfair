// Flappy Robot: a little theatre on the plaza at the foot of the pier. One flies on the spot, a pair of
// cardboard wings on the back, while the scenery goes by on the stage: clouds, hills, waves that rock, and
// candy-striped columns hanging from the flies and standing on the stage, with a gap between them to fly
// through. A flap (a click, a tap, the space bar) throws the flyer up; the rest of the time one falls. Every
// pair of columns passed is a point; touch one, or the waves, and the flight is over.
//
// What can be touched is plain to see: the flyer is made small for the flight and flies inside a ring of
// light — the ring is exactly what must not touch anything —, the sea is one line of foam in the very plane
// one flies in (nothing rocks in front of the flyer), and the picture is framed to the screen: the whole
// stage on a wide one; on a tall one, the flyer and what comes at it.
//
// The theatre is static and merged with the rest of the fair; what moves — the two painted cloths that scroll,
// the rows of waves, the columns — is a handful of meshes shown only to those who are near.
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';
import { ANIM } from '../../../player/Character.js';
import { WING } from '../../layout/layout.js';
import { canvasBoard } from './Boards.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// the stage, in its own frame: x across (to the right of who looks at it), y up, z towards the audience
const HALF = WING.width / 2, FLOOR = 0.7, TOP = FLOOR + WING.height, ROOF = TOP + 2.5, DEPTH = 3.5, WALL = 0.5;
const PLANE = -1.05, FLYER = -2.4; // how deep one flies, and where across the stage
const COLUMN = { r: 0.42, lip: 0.56, length: 3.0, apart: 5.2, from: HALF - 0.55, count: 3 };
const GRAVITY = 15, FLAP = 5.5, BODY = 0.4, WAVES = FLOOR + 0.44, CEILING = TOP - 0.25; // (BODY: the ring round the flyer; WAVES: the line of foam)
/** How large the flyer is made for the flight (the ring is then about as large as it is). */
export const FLYER_SCALE = 0.5;
const RED = [0.8, 0.1, 0.1], CREAM = [1.3, 1.24, 1.08], GOLD = [1.5, 1.05, 0.25], NAVY = [0.07, 0.12, 0.32];
/** How fast the scenery goes by, and how wide the gap is, after `n` pairs of columns. */
const speedAt = (n) => Math.min(6.2, 3.6 + n * 0.075), gapAt = (n) => Math.max(1.8, 2.45 - n * 0.02);

// a cloth that scrolls: `draw(ctx, w, h)` paints one turn of it (what leaves on the left comes back on the right)
function scroll(w, h, draw, alpha) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return new THREE.MeshBasicMaterial({ map: t, toneMapped: false, ...(alpha ? { alphaTest: 0.5 } : {}) });
}
// (drawn three times, one turn apart: nothing is cut at the seam)
const thrice = (ctx, w, fn) => { for (const dx of [-w, 0, w]) { ctx.save(); ctx.translate(dx, 0); fn(); ctx.restore(); } };

export class Wing {
  constructor(zone) {
    this.zone = zone;
    this.world = zone.world;
    this.session = null;
    this.name = WING.name;
    this.id = 'wing';
  }

  build() {
    const zone = this.zone, yaw = WING.yaw, x0 = WING.x, z0 = WING.z, y0 = zone.ground(x0, z0);
    const fx = Math.sin(yaw), fz = Math.cos(yaw), sx = Math.cos(yaw), sz = -Math.sin(yaw); // towards the audience; to its right
    /** A point of the stage, in the world. */
    const at = (x, y, z) => V(x0 + sx * x + fx * z, y0 + y, z0 + sz * x + fz * z);
    this.at = at;
    this.yaw = yaw;
    this.y0 = y0;
    const parts = new Parts(), paint = parts.get('paint'), wood = parts.get('woodDark'), deck = parts.get('woodDeck'), cloth = parts.get('doubleSided'), glow = parts.get('glow'), matte = parts.get('matte');
    for (const b of [paint, wood, deck, cloth, glow, matte]) b.place(x0, y0, z0, yaw);

    // ---- the house: a platform, two walls, a back, a loft over the opening for the columns to hang in
    deck.tint(1.0, 0.92, 0.8, 1).box(-HALF - WALL, FLOOR - 0.08, -DEPTH, HALF + WALL, FLOOR, 0.9, { tile: 1.4, faces: 'Y' });
    paint.tint(RED[0] * 0.75, RED[1] * 0.75, RED[2] * 0.75, 1).box(-HALF - WALL, -0.4, -DEPTH, HALF + WALL, FLOOR - 0.08, 0.9, { faces: 'xXZz' });
    paint.tint(GOLD[0], GOLD[1], GOLD[2], 1).box(-HALF - WALL - 0.02, FLOOR - 0.14, 0.9, HALF + WALL + 0.02, FLOOR - 0.04, 0.93, { faces: 'ZyY' });
    for (let k = -7; k <= 7; k++) {
      // (gold stars along the front of the platform)
      const cx = k * 0.86, cy = 0.28;
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + Math.PI / 2, b = a + Math.PI / 5, c = a - Math.PI / 5; paint.tri(V(cx, cy, 0.905), V(cx + Math.cos(c) * 0.07, cy + Math.sin(c) * 0.07, 0.905), V(cx + Math.cos(a) * 0.17, cy + Math.sin(a) * 0.17, 0.905)).tri(V(cx, cy, 0.905), V(cx + Math.cos(a) * 0.17, cy + Math.sin(a) * 0.17, 0.905), V(cx + Math.cos(b) * 0.07, cy + Math.sin(b) * 0.07, 0.905)); }
    }
    matte.tint(CREAM[0] * 0.8, CREAM[1] * 0.8, CREAM[2] * 0.8, 1);
    for (const g of [-1, 1]) matte.box(g > 0 ? HALF : -HALF - WALL, FLOOR, -DEPTH, g > 0 ? HALF + WALL : -HALF, ROOF, 0.3);
    matte.box(-HALF - WALL, -0.4, -DEPTH - 0.25, HALF + WALL, ROOF, -DEPTH, { faces: 'xXzZY' });
    matte.box(-HALF, TOP, -DEPTH, HALF, ROOF, 0.3, { faces: 'ZyY' }); // the loft: its front, its floor (seen from below), its roof
    matte.tint(0.12, 0.1, 0.14, 1).box(-HALF, TOP - 0.02, -DEPTH, HALF, TOP, 0.3, { faces: 'y' });
    // (a red band and a gold line round the top; a pediment)
    paint.tint(RED[0], RED[1], RED[2], 1).box(-HALF - WALL - 0.06, ROOF, -DEPTH - 0.3, HALF + WALL + 0.06, ROOF + 0.3, 0.38);
    paint.tint(GOLD[0], GOLD[1], GOLD[2], 1).box(-HALF - WALL - 0.1, ROOF + 0.3, -DEPTH - 0.34, HALF + WALL + 0.1, ROOF + 0.42, 0.44);
    // ---- the two columns of the frame, striped, a gold ball on each
    for (const g of [-1, 1]) {
      const cx = g * (HALF + WALL / 2), bands = 14, h = (ROOF - 0.1) / bands;
      for (let k = 0; k < bands; k++) { const t = k % 2 ? CREAM : RED; paint.tint(t[0], t[1], t[2], 1).cylinder(cx, k * h, 0.46, 0.36, 0.36, h, 12, { capTop: false }); }
      paint.tint(GOLD[0], GOLD[1], GOLD[2], 1).cylinder(cx, -0.3, 0.46, 0.5, 0.44, 0.5, 12).cylinder(cx, ROOF - 0.12, 0.46, 0.42, 0.5, 0.3, 12);
      paint.place(cx, ROOF + 0.42, 0.46).lathe([[0.0, 0.0], [0.26, 0.1], [0.33, 0.34], [0.24, 0.6], [0.0, 0.7]], 10).pop();
    }
    // ---- the curtains: gathered at each side, a scalloped pelmet across the top, gold fringe
    for (const g of [-1, 1]) {
      const folds = 6;
      for (let k = 0; k < folds; k++) {
        const xa = g * (HALF - (k / folds) * 1.15), xb = g * (HALF - ((k + 1) / folds) * 1.15), za = 0.16 + (k % 2 ? 0.12 : 0), zb = 0.16 + (k % 2 ? 0 : 0.12), dark = k % 2 ? 0.78 : 1;
        // (wider at the top than where the cord holds it)
        const pinch = (y) => 1 - 0.45 * Math.exp(-(((y - 2.2) / 0.9) ** 2));
        let prev = null;
        for (let j = 0; j <= 8; j++) {
          const y = FLOOR + (j / 8) * (TOP - FLOOR), p = pinch(y), a = V(g * (HALF - (HALF - Math.abs(xa)) * p), y, za), b = V(g * (HALF - (HALF - Math.abs(xb)) * p), y, zb);
          if (prev) cloth.tint(RED[0] * dark, RED[1] * dark, RED[2] * dark, 1).quad(prev[0], prev[1], b, a);
          prev = [a, b];
        }
      }
      paint.tint(GOLD[0], GOLD[1], GOLD[2], 1).box(g > 0 ? HALF - 0.75 : -HALF, 2.1, 0.14, g > 0 ? HALF : -HALF + 0.75, 2.3, 0.32); // the cord
    }
    for (let k = 0; k < 15; k++) {
      const xa = -HALF + (k / 15) * WING.width, xb = -HALF + ((k + 1) / 15) * WING.width, xm = (xa + xb) / 2, dark = k % 2 ? 0.8 : 1;
      cloth.tint(RED[0] * dark, RED[1] * dark, RED[2] * dark, 1).quad(V(xa, TOP - 0.45, 0.34), V(xb, TOP - 0.45, 0.34), V(xb, TOP + 0.25, 0.34), V(xa, TOP + 0.25, 0.34)).tri(V(xa, TOP - 0.45, 0.34), V(xm, TOP - 0.85, 0.34), V(xb, TOP - 0.45, 0.34));
      paint.tint(GOLD[0], GOLD[1], GOLD[2], 1).place(xm, TOP - 0.93, 0.34).lathe([[0.0, 0.0], [0.07, 0.07], [0.0, 0.16]], 6).pop();
    }
    // ---- footlights along the front of the stage; bulbs up the columns of the frame and round the marquee
    for (let k = -6; k <= 6; k++) {
      paint.tint(0.1, 0.1, 0.12, 1).box(k * 0.92 - 0.14, FLOOR, 0.62, k * 0.92 + 0.14, FLOOR + 0.2, 0.86, { faces: 'xXZY' });
      glow.tint(1.0, 0.86, 0.5, 1).box(k * 0.92 - 0.1, FLOOR + 0.04, 0.6, k * 0.92 + 0.1, FLOOR + 0.18, 0.63, { faces: 'z' });
    }
    const bulb = (x, y, z) => glow.tint(1.0, 0.85, 0.5, 1).place(x, y, z).lathe([[0.0, -0.07], [0.07, 0.0], [0.0, 0.07]], 6).pop();
    for (let k = 0; k <= 22; k++) { const x = -HALF + 0.3 + (k / 22) * (WING.width - 0.6); bulb(x, TOP + 0.42, 0.36); bulb(x, ROOF - 0.12, 0.36); }
    for (let k = 1; k < 5; k++) for (const g of [-1, 1]) bulb(g * (HALF - 0.3), TOP + 0.42 + (k / 5) * (ROOF - TOP - 0.54), 0.36);
    for (const b of [paint, wood, deck, cloth, glow, matte]) b.pop();
    zone._add(parts, 'wing');
    // (nobody walks into the house; its front edge can be sat on by the eye only)
    const c = at(0, 0, (0.9 - DEPTH - 0.25) / 2);
    zone.colliders.push({ type: 'box', x: c.x, z: c.z, hw: HALF + WALL + 0.45, hl: (0.9 + DEPTH + 0.25) / 2 + 0.05, yaw });

    // ---- the marquee on the loft: the name of the game, what to do
    const sign = canvasBoard(1024, 300, (ctx, w, h) => {
      const serif = "Georgia, 'Times New Roman', serif";
      const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#10204e'); bg.addColorStop(1, '#1d3a86');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 10; ctx.strokeRect(10, 10, w - 20, h - 20);
      // a wing on either side
      const wing = (cx, dir) => { ctx.fillStyle = '#fff3d6'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(cx + dir * (i * 24 + 40), 122 + i * 15, 86 - i * 11, 20 - i * 1.5, dir * (-0.32 + i * 0.07), 0, 7); ctx.fill(); } };
      wing(96, 1); wing(w - 96, -1);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 170px ${serif}`;
      ctx.fillStyle = '#0a1230'; ctx.fillText(WING.name.toUpperCase(), w / 2 + 6, 130 + 7, w - 420);
      const g = ctx.createLinearGradient(0, 50, 0, 210); g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#f6c64e'); g.addColorStop(1, '#e19a1c');
      ctx.fillStyle = g; ctx.fillText(WING.name.toUpperCase(), w / 2, 130, w - 420);
      ctx.fillStyle = '#d9ecf5'; ctx.font = `italic 600 38px ${serif}`; ctx.fillText('you flap · the scenery does the travelling', w / 2, 250, w - 80);
    }, WING.width - 1.6, (WING.width - 1.6) * (300 / 1024));
    sign.mesh.position.copy(at(0, (TOP + 0.42 + ROOF - 0.12) / 2 + 0.06, 0.32));
    sign.mesh.rotation.y = yaw;
    sign.mesh.name = 'games:wing-sign';
    zone.group.add(sign.mesh);

    // ---- what moves: the sky and the hills (two cloths that scroll), three rows of waves, the columns
    const dyn = (this.dyn = new THREE.Group());
    dyn.name = 'moving-wing';
    dyn.position.set(x0, y0, z0);
    dyn.rotation.y = yaw;
    zone.group.add(dyn);
    const plane = (w, h, x, y, z, material, turns) => {
      const g = new THREE.PlaneGeometry(w, h);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * turns);
      const m = new THREE.Mesh(g, material);
      m.position.set(x, y, z);
      dyn.add(m);
      return m;
    };
    this.sky = plane(WING.width, WING.height + 0.3, 0, FLOOR + (WING.height + 0.3) / 2, -DEPTH + 0.04, scroll(1024, 512, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3f8fe0'); g.addColorStop(0.65, '#9fd2f7'); g.addColorStop(1, '#e9f6ff');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // (a sun low on one side, clouds in three sizes)
      ctx.fillStyle = '#fff2b8'; ctx.beginPath(); ctx.arc(820, 150, 60, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,246,200,0.35)'; ctx.beginPath(); ctx.arc(820, 150, 92, 0, 7); ctx.fill();
      const cloud = (x, y, s) => { ctx.fillStyle = '#ffffff'; for (const [dx, dy, r] of [[0, 0, 34], [38, 8, 28], [-38, 10, 26], [14, -20, 26], [-16, -14, 22], [66, 16, 18], [-66, 17, 17]]) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, 7); ctx.fill(); } ctx.fillStyle = 'rgba(190,215,240,0.55)'; ctx.fillRect(x - 84 * s, y + 24 * s, 168 * s, 10 * s); };
      thrice(ctx, w, () => { cloud(130, 110, 1.0); cloud(420, 210, 0.7); cloud(640, 90, 0.85); cloud(930, 260, 0.6); cloud(300, 330, 0.5); cloud(760, 360, 0.55); });
    }), 0.62);
    this.hills = plane(WING.width, 2.9, 0, FLOOR + 1.45, -DEPTH + 0.75, scroll(1024, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const ridge = (base, amp, tone, bumps, phase) => { ctx.fillStyle = tone; ctx.beginPath(); ctx.moveTo(0, h); for (let x = 0; x <= w; x += 8) ctx.lineTo(x, base - amp * (0.5 + 0.5 * Math.sin((x / w) * Math.PI * 2 * bumps + phase)) - amp * 0.35 * Math.sin((x / w) * Math.PI * 2 * (bumps * 2 + 1) + phase * 2)); ctx.lineTo(w, h); ctx.fill(); };
      ridge(150, 95, '#6fa7c9', 2, 0.6);
      ridge(190, 80, '#4f9a5a', 3, 2.1);
      ridge(236, 60, '#2f7d3c', 4, 4.0);
      // a few round trees and a windmill on the near hills
      thrice(ctx, w, () => {
        for (const [x, y, r] of [[90, 176, 15], [130, 184, 11], [470, 168, 16], [520, 180, 10], [820, 190, 13]]) { ctx.fillStyle = '#1f5e2c'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.fillRect(x - 2, y, 4, r + 6); }
        ctx.fillStyle = '#f3ead6'; ctx.fillRect(676, 140, 16, 40); ctx.strokeStyle = '#7a3b22'; ctx.lineWidth = 5; for (let i = 0; i < 4; i++) { const a = 0.5 + (i * Math.PI) / 2; ctx.beginPath(); ctx.moveTo(684, 142); ctx.lineTo(684 + Math.cos(a) * 34, 142 + Math.sin(a) * 34); ctx.stroke(); }
      });
    }, true), 0.75);
    // the waves: scalloped strips, white behind blue — all of them behind the flyer, and none higher than the
    // first, whose foam is the line that must not be touched (WAVES)
    const paintMat = this.world.materials.paint, CREST = 0.46 * 0.62 + 0.07;
    this.waves = [[PLANE - 0.05, [0.06, 0.26, 0.62], WAVES - CREST - FLOOR], [PLANE - 0.5, [0.1, 0.4, 0.78], WAVES - CREST - FLOOR - 0.04], [PLANE - 1.0, [0.2, 0.55, 0.9], WAVES - CREST - FLOOR - 0.08]].map(([z, tone, up], k) => {
      const b = new Parts().get('paint'), step = 0.8, r = 0.46;
      for (const [dz, dy, t] of [[-0.02, 0.07, [1.5, 1.5, 1.45]], [0, 0, tone]]) {
        b.tint(t[0], t[1], t[2], 1);
        for (let i = -10; i <= 10; i++) {
          const cx = i * step + (k % 2 ? step / 2 : 0), base = FLOOR - 0.05, top = FLOOR + up + dy;
          b.quad(V(cx - step / 2, base, z + dz), V(cx + step / 2, base, z + dz), V(cx + step / 2, top, z + dz), V(cx - step / 2, top, z + dz));
          for (let j = 0; j < 6; j++) { const a0 = (j / 6) * Math.PI, a1 = ((j + 1) / 6) * Math.PI; b.tri(V(cx, top, z + dz), V(cx + Math.cos(a0) * r, top + Math.sin(a0) * r * 0.62, z + dz), V(cx + Math.cos(a1) * r, top + Math.sin(a1) * r * 0.62, z + dz)); }
        }
      }
      const m = new THREE.Mesh(b.build(), paintMat);
      m.frustumCulled = false;
      dyn.add(m);
      return m;
    });
    // the columns: red and cream bands, a gold lip and a gold cap where the gap is. One shape hangs, one stands.
    const column = (dir) => {
      const b = new Parts().get('paint'), bands = 8, h = COLUMN.length / bands;
      for (let k = 0; k < bands; k++) { const t = k % 2 ? CREAM : RED; b.tint(t[0], t[1], t[2], 1).cylinder(0, dir > 0 ? 0.2 + k * h : -0.2 - (k + 1) * h, 0, COLUMN.r, COLUMN.r, h, 12, { capTop: false }); }
      b.tint(GOLD[0], GOLD[1], GOLD[2], 1).cylinder(0, dir > 0 ? 0 : -0.22, 0, COLUMN.lip, COLUMN.lip, 0.22, 14, { capBottom: true });
      return b.build();
    };
    this.columns = [1, -1].map((dir) => { const m = new THREE.InstancedMesh(column(dir), paintMat, COLUMN.count); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); dyn.add(m); return m; });
    this._m = new THREE.Matrix4();
    /** The pairs on the stage: where each is across it, the middle and the height of its gap, whether it has been passed. */
    this.pairs = Array.from({ length: COLUMN.count }, (_, k) => ({ x: COLUMN.from - k * COLUMN.apart * 0.9, y: FLOOR + WING.height * (0.42 + 0.16 * Math.sin(k * 2.4)), gap: 2.6, passed: true }));
    this.scrolled = 0; // metres of scenery gone by
    this._place();

    // ---- where one asks to fly (before the stage), and the board of the best flights beside it
    const spot = at(FLYER + 1.0, 0, 3.4);
    this.spot = { x: spot.x, z: spot.z, r: 3.2, yaw: yaw + Math.PI };
    const bp = at(HALF + WALL + 2.6, 0, 1.3);
    this.board = zone.scoreStand(this.id, bp.x, bp.z, yaw - 0.5, { title: `${WING.name.toUpperCase()} — BEST FLIGHTS`, sub: 'columns flown past in one flight', format: (n) => `${n}`, width: 3.0, pixels: 0.85 });
    this.view = { pos: at(0.4, FLOOR + 2.5, 11.6), look: at(0.2, FLOOR + 2.55, 0), fov: 44 };
    // the ring of light round the flyer: what must not touch a column, nor the foam
    this.ring = new THREE.Mesh(new THREE.RingGeometry(BODY - 0.035, BODY, 40), new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false }));
    this.ring.renderOrder = 30;
    this.ring.visible = false;
    dyn.add(this.ring);
    return this;
  }

  /** The columns are put where the pairs are (those still waiting in the wings are kept out of sight). */
  _place() {
    const m = this._m;
    this.pairs.forEach((p, i) => {
      const away = p.x > COLUMN.from + 0.01 ? -60 : 0;
      this.columns[0].setMatrixAt(i, m.makeTranslation(p.x, p.y + p.gap / 2 + away, PLANE)); // the one that hangs
      this.columns[1].setMatrixAt(i, m.makeTranslation(p.x, p.y - p.gap / 2 + away, PLANE)); // the one that stands
    });
    this.columns[0].instanceMatrix.needsUpdate = true;
    this.columns[1].instanceMatrix.needsUpdate = true;
  }

  /** The painted cloths go by `d` metres (the far one slower than the near one). */
  _drift(d) {
    this.scrolled += d;
    this.sky.material.map.offset.x = (this.scrolled * 0.2) / (WING.width / 0.62);
    this.hills.material.map.offset.x = (this.scrolled * 0.5) / (WING.width / 0.75);
  }

  /** The scenery goes by `d` metres; a pair that leaves on the left comes back on the right, with the gap `next()` gives. */
  _scroll(d, next) {
    this._drift(d);
    let last = -Infinity;
    for (const p of this.pairs) last = Math.max(last, p.x);
    for (const p of this.pairs) {
      p.x -= d;
      if (p.x < -COLUMN.from) { p.x = Math.max(COLUMN.from, last - d + COLUMN.apart); last = p.x + d; Object.assign(p, next(), { passed: false }); }
    }
    this._place();
  }

  /** Is that point of the world over the stage (where only a flyer can be)? */
  inside(x, y, z) {
    const dx = x - WING.x, dz = z - WING.z, lx = dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw), lz = dx * Math.sin(this.yaw) + dz * Math.cos(this.yaw);
    return Math.abs(lx) < HALF && lz > -DEPTH && lz < 0.6 && y > this.y0 - 0.8 && y < this.y0 + ROOF;
  }

  /** Is (x, z) where a flight is asked for? */
  near(x, z) { return !!this.spot && (x - this.spot.x) ** 2 + (z - this.spot.z) ** 2 < this.spot.r ** 2; }

  /**
   * A flight starts. `io`: { play(sound, options), feathers(x, y, z, n) }. Returns the session — { booth (what
   * the game is, for the board), view (the camera), step(dt, time, aim), over, score, line, driver (what moves
   * the player: see PlayerController.driver), close() }. `aim.clicks`: how many flaps were asked for this frame.
   */
  open(player, io) {
    // (`this.seed`: set it and the next flight meets those gaps and no others — a rehearsal, a test)
    const S = { y: FLOOR + WING.height * 0.55, vy: 0, t: 0, flying: false, fallen: 0, beat: 0, score: 0, seed: this.seed ?? ((Math.random() * 1e9) | 0) };
    this.seed = undefined;
    // (the gaps: never two far apart in height one after the other — what can be flown, however fast it goes)
    let lastY = S.y;
    const rnd = () => { S.seed = (S.seed * 1664525 + 1013904223) | 0; return (S.seed >>> 8) / 16777216; };
    const next = () => {
      const gap = gapAt(S.score + 2), lo = WAVES + 0.41 + gap / 2, hi = CEILING - 0.3 - gap / 2;
      lastY = clamp(lastY + (rnd() * 2 - 1) * 1.9, lo, hi);
      return { y: lastY, gap };
    };
    // the stage is cleared: the first pair comes in from the right after a moment
    this.pairs.forEach((p, k) => Object.assign(p, next(), { x: COLUMN.from + 3.5 + k * COLUMN.apart, passed: false }));
    this._place();
    const pos = new THREE.Vector3(), heading = this.yaw + Math.PI / 2; // (one flies towards the right of the stage)
    const off = new THREE.Vector3(0, 0.95 * FLYER_SCALE, 0), _p = new THREE.Vector3(), _q = new THREE.Vector3(); // from the feet of the flyer to its middle
    const session = {
      booth: { id: this.id, name: WING.name, unit: 'columns' }, view: this.view, firstPerson: false, crosshair: false, over: false, score: 0, gauge: null,
      line: `${WING.name} · flap to take off`, state: S,
      /** The picture, framed to a screen `aspect` times as wide as it is high: the whole stage if it fits, else the flyer and what comes at it. */
      viewAt: (aspect) => {
        const view = this.view, high = WING.height + 1.3, wide = high * aspect, D = 10.5, cy = FLOOR + WING.height / 2 + 0.05;
        let cx = 0, H = high;
        if (wide < WING.width + 0.4) {
          const across = Math.max(wide, 7.6); // (a tall screen: seven and a half metres across, however much sky that shows)
          H = across / aspect;
          cx = clamp(FLYER - 1.4 + across / 2, -HALF - 0.2 + across / 2, Math.max(-HALF - 0.2 + across / 2, HALF + 0.2 - across / 2));
        }
        view.pos.copy(this.at(cx, cy, PLANE + D)); view.look.copy(this.at(cx, cy, PLANE)); view.fov = (2 * Math.atan(H / (2 * D)) * 180) / Math.PI;
        return view;
      },
      step: (dt, time, aim) => {
        if (session.over) return;
        S.t += dt;
        S.beat = Math.max(0, S.beat - dt * 3.2);
        if (S.fallen) {
          // the fall: straight down into the waves, and the flight is over
          S.vy -= GRAVITY * 1.5 * dt; S.y += S.vy * dt;
          if (S.y < WAVES - 0.5) { if (S.fallen === 1) { S.fallen = 2; io.play('splash', { volume: 0.7 }); } if ((S.t - S.hit) > 0.9) session.over = true; S.y = Math.max(S.y, FLOOR - 0.6); }
          return;
        }
        if (aim.clicks > 0) {
          if (!S.flying) { S.flying = true; io.play('start'); }
          S.vy = FLAP; S.beat = 1;
          io.play('flap', { volume: 0.7 });
        }
        if (!S.flying) { S.y = FLOOR + WING.height * 0.55 + Math.sin(S.t * 2.6) * 0.18; this._drift(dt * 1.2); return; } // (waiting: it hovers, the clouds drift)
        S.vy -= GRAVITY * dt; S.y += S.vy * dt;
        if (S.y > CEILING - BODY) { S.y = CEILING - BODY; S.vy = Math.min(S.vy, 0); } // (the pelmet: one bumps one's head, no more)
        this._scroll(speedAt(S.score) * dt, next);
        let hit = S.y - BODY < WAVES;
        for (const p of this.pairs) {
          const dx = p.x - FLYER;
          if (Math.abs(dx) < COLUMN.lip + BODY * 0.9 && (S.y - BODY < p.y - p.gap / 2 || S.y + BODY > p.y + p.gap / 2)) hit = true;
          if (!p.passed && dx < -COLUMN.lip) { p.passed = true; S.score++; session.score = S.score; io.play('coin', { volume: 0.6 }); }
        }
        if (hit) {
          S.fallen = 1; S.hit = S.t; S.vy = Math.max(S.vy, 2.5);
          io.play('whack', { volume: 0.8 });
          const w = this.at(FLYER, S.y, PLANE);
          io.feathers?.(w.x, w.y, w.z, 22);
        }
        session.line = `${WING.name} · ${S.score}`;
      },
      /** Where the flyer is, how it holds itself: the player is put there every frame. */
      driver: {
        anim: ANIM.swim, riding: false,
        step: (dt, pl) => {
          // (the middle of the flyer — between its head and its waist — is kept in the middle of the ring: the
          // pose swings the body about its feet, so where the feet go is worked out from where the body was)
          const bones = pl.character.bones, waist = bones && (bones.Abdomen || bones.Torso || bones.Body);
          if (bones?.Head && waist) { bones.Head.getWorldPosition(_p); waist.getWorldPosition(_q); _p.add(_q).multiplyScalar(0.5).sub(pl.pos); if (_p.length() < 2) off.lerp(_p, 0.35); }
          pos.copy(this.at(FLYER, S.y, PLANE)).sub(off);
          pl.pos.copy(pos);
          this.ring.visible = !S.fallen;
          this.ring.position.set(FLYER, S.y, PLANE + 0.4);
          pl.yaw = heading;
          // (nose up on a flap, nose down in the fall; tumbling once hit)
          pl.pitch = S.fallen ? pl.pitch + dt * 9 : clamp(-S.vy * 0.07, -0.5, 0.6) - 0.25;
          pl.roll = 0;
          pl.speed = 4;
          pl.grounded = false;
          pl.character.wingBeat = S.beat;
        },
      },
      close: () => {
        if (this.session === session) this.session = null;
        this.ring.visible = false;
        player.pitch = 0; player.roll = 0;
        // the stage goes back to idling: the columns where they were left drift on
        this.pairs.forEach((p) => { p.passed = true; });
      },
    };
    this.session = session;
    return session;
  }

  /** Every frame: when nobody is flying, the scenery idles along for whoever is near enough to see it. */
  update(dt, time, pos) {
    const d2 = (pos.x - WING.x) ** 2 + (pos.z - WING.z) ** 2;
    this.dyn.visible = d2 < 110 * 110;
    if (!this.dyn.visible) return;
    this.waves.forEach((m, k) => { m.position.x = Math.sin(time * (1.1 + k * 0.23) + k * 2.1) * 0.34; m.position.y = k ? Math.sin(time * 1.9 + k) * 0.03 - 0.03 : 0; }); // (the first row slides, and does not rise: it is the line)
    if (this.session || d2 > 60 * 60) return;
    this._idle = this._idle || { y: FLOOR + WING.height * 0.5, k: 0 };
    const I = this._idle;
    this._scroll(dt * 2.2, () => { I.k++; I.y = clamp(FLOOR + WING.height * (0.5 + 0.22 * Math.sin(I.k * 1.7)), WAVES + 1.6, CEILING - 1.6); return { y: I.y, gap: 2.6 }; });
  }
}
