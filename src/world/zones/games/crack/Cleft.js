// Between a Rock: what is seen of it and how it is climbed. Its rules are in cleft.js; here it is built — two
// ribs of rock up the sea cliff and the cleft between them, the nets, what grows on the walls, the stone that
// comes down, the planks at its foot and the walkway to them from the beach, the bell at the lip — and a climb
// is run: a session that drives the player (see PlayerController.driver).
//
// The cleft is built in its own frame, which leans back against the cliff: x across (to the right as one looks
// into it), y up it, z out of it towards the sea. It opens outwards like a book: what is on its walls is seen
// from in front. What falls falls by the clock of the world: everybody sees the same stones.
import * as THREE from 'three';
import { Parts } from '../../../props/MeshBuilder.js';
import { LAYER } from '../../../../render/Shadows.js';
import { ANIM } from '../../../../player/Character.js';
import { Polygon } from '../../../Areas.js';
import { canvasBoard } from '../Boards.js';
import { formatTime } from '../course.js';
import { CLEFT, cleft, wallAt, rainAt, startClimb, stepClimb, climbPose, cleftPoint, kickMark, botInput } from './cleft.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const h2 = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7 + 74.7) * 43758.5453; return s - Math.floor(s); };
const noise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v); return (h2(i, j) * (1 - a) + h2(i + 1, j) * a) * (1 - b) + (h2(i, j + 1) * (1 - a) + h2(i + 1, j + 1) * a) * b; };
const ROPE = [1.15, 1.0, 0.72], GOLD = [1.5, 1.05, 0.2], CREAM = [1.3, 1.17, 0.9], RED = [0.95, 0.1, 0.12];
const OPEN = CLEFT.open, BACK = -CLEFT.back, WALK = CLEFT.way, LANDING = CLEFT.landing;
const Y0 = -4.4, ROWS = 54, DY = 0.85; // its ribs from under the sea up, in rows
const HINTS = ['', 'The Brambles: thorns throw you off. The beads on the walls show where a kick would land.', 'The Polish: on the pale rock you slide at once — kick, do not wait.', 'The Moss: nothing holds on moss. Land beside it.', 'The Rain of Stones: be off the wall a stone comes down!'];

export class Cleft {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'cleft';
    this.session = null;
    this.best = 0;
    /** The clock everybody shares (s): the stones come down by it. */
    this.clock = () => (performance.timeOrigin + performance.now()) / 1000;
  }

  build() {
    const world = this.world, mats = world.materials, C = CLEFT, L = cleft(), parts = new Parts();
    const rock = parts.get('rock'), dark = parts.get('cave'), matte = parts.get('matte'), paint = parts.get('paint'), wood = parts.get('woodDeck'), wet = parts.get('woodWet'), bark = parts.get('woodDark');
    const s = Math.sin(C.lean), c = Math.cos(C.lean), cx = C.at.x, F = C.floor;
    const M = (this.frame = new THREE.Matrix4().makeBasis(V(-1, 0, 0), V(0, c, s), V(0, s, -c)).setPosition(cx, F, C.at.z));
    const all = [...parts.map.values()];
    /** A sheet of rock: rows and columns of facets through the points `at(i, j)`, each with its own tone. */
    const sheet = (b, nu, nv, at, tone, flip = false) => {
      const pts = [];
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pts.push(at(i, j));
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const a = pts[j * (nu + 1) + i], q = pts[j * (nu + 1) + i + 1], r = pts[(j + 1) * (nu + 1) + i + 1], d = pts[(j + 1) * (nu + 1) + i], o = { color: tone(i, j), u0: i * 0.9, v0: j * 0.9 };
        if (flip) b.quad(a, d, r, q, o); else b.quad(a, q, r, d, o);
      }
    };
    const wall = (side, y) => wallAt(side, clamp(y, 0, C.height));
    for (const b of all) b.push(M);
    // ---- the two ribs: each a strip of rock from the back of the cleft round its nose to where it goes into the cliff
    const profile = (side, j) => {
      const y = Y0 + j * DY, w = wall(side, y);
      // (its nose comes forward and goes back, it swells and thins, and it tapers to a horn above the lip)
      const horn = clamp((y - 36.5) / 5.2, 0, 1), swell = noise(y * 0.13 + side * 9.1, 2.2) - 0.5;
      const front = 1.5 + 0.9 * (noise(y * 0.21 + side * 5.3, 1.7) - 0.5) + 0.35 * (noise(y * 0.8, 9.1 + side) - 0.5) - horn * 0.9;
      const thick = (3.1 + 2.4 * (noise(y * 0.16 + 3.1, 4.4 + side) - 0.5) + 1.3 * swell + Math.max(0, 5 - y) * 0.35) * (1 - horn * 0.5), x1 = w + OPEN * 0.95;
      return [[w + OPEN * BACK, BACK], [w + OPEN * -0.5, -0.5], [w, 0], [x1, 0.95], [x1 + 0.3, front - 0.12], [x1 + 0.9, front], [x1 + thick * 0.55, front - 0.1 + 0.5 * swell], [x1 + thick - 0.5, front - 0.7 - horn], [x1 + thick, front - 2.1 - horn], [x1 + thick + 0.5, -5.5], [x1 + thick + 0.7, -11]];
    };
    const N = 10; // (facets round a rib)
    for (const side of [-1, 1]) {
      const at = (i, j) => {
        const p = profile(side, j)[i], inner = i <= 3, amp = inner ? 0.05 : 0.32;
        const x = p[0] + (inner ? h2(i * 7 + side * 3, j) : h2(i * 7 + side * 3, j) - 0.5) * amp, z = p[1] + (inner ? 0 : (h2(i * 3 + 11, j * 5 + side) - 0.5) * 0.3);
        return V(side * x, Y0 + j * DY + (inner ? 0 : (h2(i + 40, j * 5 + 1) - 0.5) * 0.3) + (j === ROWS ? (inner ? 0.2 : 0.9 * h2(i, side + 60)) - 0.5 : 0), z);
      };
      const tone = (i, j) => {
        const g = 0.74 + 0.34 * noise(i * 0.9 + side, j * 0.7), m = clamp((i - 3.5) / 2.5, 0, 1) * (0.35 + 0.65 * noise(j * 0.3 + 7, i * 0.5 + side)) * 0.9, k = i < 2 ? 0.62 + 0.19 * i : 1;
        return [g * k * (1 - m * 0.5), g * k * (1 - m * 0.22), g * k * (1 - m * 0.62), 1];
      };
      sheet(rock, N, ROWS, at, tone, side < 0);
      const top = []; for (let i = 0; i <= N; i++) top.push(at(i, ROWS));
      rock.tint(0.55, 0.7, 0.42, 1).poly(side > 0 ? top : top.reverse());
    }
    // ---- the back of the cleft: darker rock, between the ribs, up to the lip
    sheet(dark, 8, 53, (i, j) => { const x = -3.4 + i * 0.85, y = Y0 + (j * (C.height - Y0)) / 53; return V(x, y, BACK + 0.26 + 0.3 * (noise(x * 0.7 + 3, y * 0.55) - 0.5)); }, (i, j) => { const g = 0.36 + 0.24 * noise(i * 0.8, j * 0.6 + 5); return [g, g * 0.97, g * 0.95, 1]; });
    // ---- what is on the walls: the polished lengths, the moss, the brambles
    const face = (side, y, z) => side * (wall(side, y) + OPEN * z);
    for (const side of [-1, 1]) for (const p of L.patches[side]) {
      const rows = Math.max(2, Math.round((p.y1 - p.y0) / 0.4)), dy = (p.y1 - p.y0) / rows, seed = p.y0 * 3.7 + side;
      if (p.kind === 'polish') {
        sheet(paint, 4, rows, (i, j) => { const y = p.y0 + j * dy, z = BACK + 0.15 + i * 0.58 + (i === 4 ? 0.25 * h2(j, seed) : 0); return V(face(side, y, z) - side * 0.035, y, z); }, (i, j) => { const g = 0.86 + 0.16 * h2(i + seed, j); return [g * 0.9, g * 0.97, g * 1.04, 1]; }, side < 0);
      } else if (p.kind === 'moss') {
        sheet(matte, 4, rows, (i, j) => { const y = p.y0 + j * dy + (j === 0 ? -0.25 * h2(i, seed + 1) : j === rows ? 0.2 * h2(i, seed + 2) : 0), z = BACK + 0.15 + i * 0.6 + (i === 4 ? 0.3 * h2(j, seed) : 0); return V(face(side, y, z) - side * (0.05 + 0.07 * h2(i * 3 + seed, j)), y, z); }, (i, j) => { const g = 0.75 + 0.5 * h2(i + seed, j * 3); return [0.2 * g, 0.52 * g, 0.1 * g, 1]; }, side < 0);
        for (let k = 0; k < 7; k++) { const z = BACK + 0.3 + 2.1 * h2(k, seed + 5), y = p.y0 + 0.1 - 0.2 * h2(k, seed + 6), x = face(side, y, z) - side * 0.06; matte.tint(0.16, 0.42, 0.08, 1).rod(V(x, y, z), V(x, y - 0.25 - 0.35 * h2(k, seed + 7), z), 0.05, 5, { r1: 0.005, caps: false }); }
      } else if (p.kind === 'thorn') {
        for (let k = 0; k < 13; k++) {
          const ya = p.y0 + (p.y1 - p.y0) * h2(k, seed + 1), za = BACK + 0.25 + 2.1 * h2(k, seed + 2), yb = ya + (h2(k, seed + 3) - 0.5) * 1.0, zb = clamp(za + (h2(k, seed + 4) - 0.5) * 1.5, BACK + 0.1, 1.2);
          const a = V(face(side, ya, za), ya, za), b = V(face(side, yb, zb), yb, zb), out = 0.16 + 0.26 * h2(k, seed + 5), m = a.clone().add(b).multiplyScalar(0.5).add(V(-side * out, 0.12, OPEN * out * 0.5));
          matte.tint(0.62, 0.1, 0.16, 1).rod(a, m, 0.042, 5, { caps: false }).rod(m, b, 0.042, 5, { caps: false });
          for (let t = 0; t < 5; t++) {
            const f = (t + 0.5) / 5, q = f < 0.5 ? a.clone().lerp(m, f * 2) : m.clone().lerp(b, f * 2 - 1), d = V(-side * (0.4 + h2(t, k + seed)), h2(t + 9, k + seed) - 0.5, h2(t + 5, k + seed) - 0.2).normalize().multiplyScalar(0.17);
            paint.tint(1.25, 1.15, 0.9, 1).rod(q, q.clone().add(d), 0.024, 4, { r1: 0.001, caps: false });
          }
          if (k % 3 === 0) matte.tint(0.2, 0.05, 0.3, 1).place(m.x, m.y - 0.05, m.z).lathe([[0, -0.06], [0.055, -0.03], [0.055, 0.03], [0, 0.06]], 6).pop();
        }
      }
    }
    // ---- the nets, one at the top of each stretch but the last: ropes from wall to wall, and from front to back
    for (const y of L.nets) {
      const w = wall(1, y), z0 = BACK + 0.3, z1 = 1.0, at = (x, z) => V(x * (1 + (OPEN * z) / w), y - 0.02, z);
      for (let k = 0; k <= 7; k++) { const z = z0 + ((z1 - z0) * k) / 7, thick = k === 0 || k === 7 ? 0.032 : 0.015; matte.tint(...ROPE, 1).rod(at(-w, z), at(w, z), thick, 5, { caps: false }); }
      const n = Math.round((2 * w) / 0.32);
      for (let k = 0; k <= n; k++) { const x = -w + (2 * w * k) / n; matte.tint(...ROPE, 1).rod(at(x, z0), at(x, z1), k === 0 || k === n ? 0.03 : 0.015, 4, { caps: false }); }
      for (const sx of [-1, 1]) for (const z of [z0, z1]) { const p = at(sx * w, z); paint.tint(0.25, 0.25, 0.28, 1).box(p.x - 0.07, y - 0.09, z - 0.07, p.x + 0.07, y + 0.05, z + 0.07); }
    }
    for (const b of all) b.pop();
    // ---- the lip: a ledge of rock at the top, level, and the bell on its gallows
    const lip = cleftPoint(0, C.height, BACK + 0.3), ledge = (this.ledge = { x: cx, y: lip.y + 0.02, z: lip.z + 1.5 });
    sheet(rock, 9, 7, (i, j) => V(cx - 4.5 + i, lip.y + (j === 0 ? -0.5 : 0.04 * h2(i, j)) + Math.max(0, j - 4) * 0.5, lip.z - 0.25 + j * 0.95), (i, j) => { const g = 0.62 + 0.22 * h2(i, j + 3); return [g * 0.7, g * 0.86, g * 0.5, 1]; }, true);
    const gx = cx - 1.9, gz = lip.z + 2.3;
    bark.tint(0.9, 0.85, 0.8, 1).cylinder(gx, lip.y - 0.2, gz, 0.09, 0.07, 2.7, 6).beam(V(gx, lip.y + 2.4, gz), V(gx + 1.2, lip.y + 2.4, gz), 0.09, 0.09);
    paint.tint(...GOLD, 1).place(gx + 1.05, lip.y + 1.9, gz).lathe([[0.03, 0.4], [0.13, 0.36], [0.22, 0.1], [0.31, -0.05], [0.34, -0.12]], 10).pop();
    // ---- the planks at the foot, the landing in front of them and the walkway from the beach: level, on piles
    const [ax, az] = WALK.a, [bx, bz] = WALK.b, len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
    wood.tint(1, 0.98, 0.92, 1).box(cx - 1.47, F - 0.09, LANDING[3] - 0.05, cx + 1.47, F, C.at.z + 0.85).box(LANDING[0], F - 0.09, LANDING[1], LANDING[2], F, LANDING[3]);
    wood.beam(V(ax, F - 0.045, az), V(bx + 0.2, F - 0.045, bz), WALK.half * 2, 0.09);
    const pile = (x, z, top = F - 0.05) => { const g = Math.min(-0.6, this.data.heightAt(x, z)) - 0.5; wet.tint(0.9, 0.88, 0.85, 1).cylinder(x, g, z, 0.09, 0.09, top - g, 6); };
    const post = (x, z) => { pile(x, z, F + 0.95); return V(x, F + 0.88, z); };
    let prev = null;
    for (let t = 1.2; t < len + 0.1; t += 2.25) {
      // (a pile under the planks on the side of the cliff; on the side of the sea a post, and a rope from post to post)
      const x = ax + dx * t, z = az + dz * t, p = post(x + dz * 0.7, z - dx * 0.7);
      pile(x - dz * 0.68, z + dx * 0.68);
      if (prev) matte.tint(...ROPE, 1).rod(prev, p, 0.022, 4, { caps: false });
      prev = p;
    }
    for (const x of [LANDING[0] + 0.15, cx, LANDING[2] - 0.15]) { const p = post(x, LANDING[1] + 0.12); if (prev) matte.tint(...ROPE, 1).rod(prev, p, 0.022, 4, { caps: false }); prev = p; }
    { const p = post(LANDING[2] - 0.15, LANDING[3] - 0.5); matte.tint(...ROPE, 1).rod(prev, p, 0.022, 4, { caps: false }); }
    pile(LANDING[0] + 0.2, LANDING[3] - 0.2); pile(cx - 1.2, C.at.z + 0.2); pile(cx + 1.2, C.at.z + 0.2);
    // ---- its name over the walkway, where it leaves the sand; what it is, by the cleft
    const sx = ax + dx * 2.4, sz = az + dz * 2.4, yaw = Math.atan2(dx, dz);
    for (const u of [-1.05, 1.05]) for (let y = 0, k = 0; y < 3.1; y += 0.62, k++) paint.tint(...(k % 2 ? CREAM : RED), 1).cylinder(sx + dz * u, F + y, sz - dx * u, 0.1, 0.1, 0.62, 8);
    const name = canvasBoard(1024, 200, (ctx, w, h) => {
      ctx.fillStyle = '#1d2a33'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = "700 92px Georgia, 'Times New Roman', serif"; ctx.fillText(C.name.toUpperCase(), w / 2, 84, w * 0.9);
      ctx.fillStyle = '#f2c14e'; ctx.font = '600 34px system-ui, sans-serif'; ctx.fillText('FORTY METRES UP THE CLEFT · FROM WALL TO WALL', w / 2, 158, w * 0.9);
    }, 2.5, 0.49, { both: true });
    name.mesh.position.set(sx, F + 2.9, sz); name.mesh.rotation.y = yaw; name.mesh.name = 'cleft-name';
    this.group.add(name.mesh);
    this.board = canvasBoard(512, 384, (ctx, w, h) => this._board(ctx, w, h), 1.5, 1.125, { both: false });
    this.board.mesh.position.set(LANDING[2] - 0.5, F + 1.55, LANDING[3] - 0.45); this.board.mesh.rotation.y = Math.PI + 0.5; this.board.mesh.name = 'cleft-board';
    bark.tint(0.9, 0.85, 0.8, 1).cylinder(LANDING[2] - 0.5, F, LANDING[3] - 0.42, 0.06, 0.06, 1.1, 6);
    this.group.add(this.board.mesh);
    this.group.add(parts.toMeshes(mats, { name: 'cleft-rock', layers: [LAYER.STATIC_CASTER] }));
    // ---- what moves: the stone that comes down, and the beads that show where a kick would land
    const lump = (name, build) => { const p = new Parts(); build(p); const m = p.toMeshes(mats, { name, layers: [] }); m.visible = false; this.group.add(m); return m; };
    this.stone = lump('cleft-stone', (p) => p.get('rock').tint(1.05, 1, 0.95, 1).lathe([[0, -0.36], [0.24, -0.3], [0.4, -0.05], [0.36, 0.2], [0.2, 0.36], [0, 0.4]], 7));
    const bead = (name, r, tone) => lump(name, (p) => p.get('glow').tint(...tone, 1).lathe([[0, -r], [r * 0.75, -r * 0.6], [r, 0], [r * 0.75, r * 0.6], [0, r]], 8));
    this.beads = { plain: { ok: bead('cleft-bead', 0.15, [1.1, 1.1, 1.0]), bad: bead('cleft-bead-bad', 0.17, [1.3, 0.12, 0.08]) }, high: { ok: bead('cleft-bead-high', 0.1, [1.2, 0.85, 0.15]), bad: bead('cleft-bead-high-bad', 0.12, [1.3, 0.12, 0.08]) } };
    // ---- one walks to it: the planks carry, and so does the water round them (they stand beyond the edge of the bay)
    const col = world.collision;
    this.deck = {
      clearance: 1.2,
      heightAt: (x, z) => {
        if (x >= LANDING[0] && x <= LANDING[2] && z >= LANDING[1] && z <= LANDING[3]) return F;
        if (Math.abs(x - cx) <= 1.47 && z > LANDING[3] - 0.05 && z <= C.at.z + 0.85) return F;
        const t = (x - ax) * dx + (z - az) * dz, u = (x - ax) * -dz + (z - az) * dx;
        return t >= 0 && t <= len + 0.2 && Math.abs(u) <= WALK.half ? F : null;
      },
    };
    col.addPlatform(this.deck);
    col.addArea(new Polygon([[ax + dz * 2, az - dx * 2], [LANDING[0] - 0.3, LANDING[1] - 1.5], [LANDING[2] + 1.2, LANDING[1] - 1.5], [LANDING[2] + 1.2, LANDING[3] + 0.1], [cx + 1.45, LANDING[3] + 0.1], [cx + 1.45, C.at.z + 0.8], [cx - 1.45, C.at.z + 0.8], [cx - 1.45, LANDING[3] + 0.1], [LANDING[0] - 0.3, LANDING[3] + 0.1], [ax - dz * 2, az + dx * 2]], { name: 'cleft' }));
    for (const side of [-1, 1]) col.addBox(cx + side * (1.5 + 1.7), C.at.z + 0.3, 1.7, 1.75);
    this.gate = { x: cx, z: (LANDING[1] + LANDING[3]) / 2 + 0.2, y: F, yaw: 0 };
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    return this;
  }

  _board(ctx, w, h) {
    ctx.fillStyle = '#1d2a33'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f2c14e'; ctx.font = "700 44px Georgia, 'Times New Roman', serif"; ctx.fillText(CLEFT.name.toUpperCase(), w / 2, 52, w * 0.9);
    ctx.fillStyle = '#f6e7b8'; ctx.font = '600 25px system-ui, sans-serif';
    ['Kick from wall to wall, up to the bell.', 'Do nothing, and you slide.', 'A net every eight metres catches you.', 'Thorns, polish, moss — then it rains stones.'].forEach((t, k) => ctx.fillText(t, w / 2, 112 + k * 40, w * 0.9));
    ctx.fillStyle = '#f2c14e'; ctx.font = '700 36px system-ui, sans-serif'; ctx.fillText(this.best ? `Your best  ${formatTime(this.best)}` : 'Not climbed yet', w / 2, 318, w * 0.9);
  }

  setBest(ms) { this.best = ms || 0; this.board?.redraw(); }
  /** Is one on the planks before the cleft (where one asks to climb)? */
  near(x, z, y = CLEFT.floor) { return Math.abs(y - CLEFT.floor) < 1.2 && x > LANDING[0] + 0.3 && x < LANDING[2] - 0.3 && z > LANDING[1] && z < CLEFT.at.z + 0.9; }

  /** A place of the cleft in the world, as a vector. */
  at(x, y, d, out = V(0, 0, 0)) { const p = cleftPoint(x, y, d, this._p || (this._p = {})); return out.set(p.x, p.y, p.z); }

  /**
   * A climb is asked for: the player is put on the planks between the walls. `io`: { play, note }.
   * Returns the session — the driver of the player: step(dt, player, control), camera(camera, dt), line, over
   * (`time` in ms), ended, drop(player), close(), auto (true: it climbs by itself).
   */
  open(player, io) {
    const C = CLEFT, events = [], input = { x: 0, y: 0, jump: false }, st = startClimb(this.clock());
    const S = { cam: null, look: V(0, 0, 0), after: 0, acc: 0, yaw: Math.PI, spin: 0 }, _t = V(0, 0, 0), pos = V(0, 0, 0), mark = {};
    const session = {
      cleft: this, over: false, ended: false, time: 0, line: '', riding: false, anim: ANIM.idle, state: st, auto: false,
      step: (dt, pl, control) => {
        const inp = pl.input;
        if (session.auto) {
          S.acc += Math.min(dt, 0.25);
          while (S.acc >= C.step && !st.over) { S.acc -= C.step; botInput(st, input); stepClimb(st, C.step, input, events); }
        } else {
          input.x = control ? inp.move.x : 0; input.y = control ? inp.move.y : 0; input.jump = control && !!inp.jump;
          if (!st.over) stepClimb(st, dt, input, events);
        }
        for (const e of events) this._tell(e, io);
        events.length = 0;
        let yaw;
        if (st.over) {
          // over the lip, and a few steps onto the ledge, to the bell
          S.after += dt;
          if (!session.over) { session.over = true; session.time = st.time; }
          const k = clamp(S.after / 0.7, 0, 1), from = this.at(st.x, C.height, 0, _t);
          pos.set(from.x + (this.ledge.x - 0.6 - from.x) * k, from.y + (this.ledge.y - from.y) * k + Math.sin(k * Math.PI) * 0.5, from.z + (this.ledge.z - from.z) * k);
          yaw = Math.PI; session.anim = k < 1 ? ANIM.jump : ANIM.idle;
          if (S.after > 3.2) session.ended = true;
        } else {
          this.at(st.x, st.y, 0, pos);
          const way = st.side || (st.stand ? st.face : Math.sign(st.vx) || st.face);
          yaw = -way * Math.PI / 2;
          session.anim = st.stand ? (Math.abs(input.x) > 0.3 ? ANIM.walk : ANIM.idle) : ANIM.jump;
        }
        S.spin = st.flung ? S.spin + dt * 11 : 0;
        let d = yaw - S.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); S.yaw += d * Math.min(1, dt * 16);
        pl.pos.copy(pos); pl.yaw = S.yaw; pl.roll = 0; pl.pitch = st.flung ? Math.sin(S.spin) * 1.1 : 0;
        pl.speed = st.stand ? Math.abs(input.x) * C.walk : 0; pl.grounded = st.stand || st.over;
        this._beads(st, mark);
        const sec = C.sections[st.section];
        session.line = st.over ? `${C.name} · ${formatTime(st.time)}` : !st.started ? `${C.name} · jump to a wall, and kick from wall to wall` : `${formatTime(Math.round((st.clock - st.go) * 1000))} · ${sec.name} · ${Math.max(0, Math.floor(st.y))} m of ${C.height}`;
      },
      /** The camera: out over the water in front of the cleft, a little above the climber, looking into it. */
      camera: (cam, dt) => {
        const y = st.over ? C.height + 0.5 : st.y, out = st.over ? 14.5 : 11.5;
        this.at(st.x * 0.3, y + 3.3, out, _t);
        if (!S.cam) S.cam = _t.clone(); else S.cam.lerp(_t, Math.min(1, dt * 5));
        this.at(st.x * 0.45, y + 1.9, 0, _t);
        S.look.lerp(_t, S.look.lengthSq() ? Math.min(1, dt * 7) : 1);
        cam.position.copy(S.cam); cam.up.set(0, 1, 0); cam.lookAt(S.look);
        return 58;
      },
      /** The climb is over (or left): the player is put back on the planks before the cleft. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x, this.gate.z, this.gate.yaw); session.close(); },
      close: () => { if (this.session === session) this.session = null; player.pitch = 0; for (const k of ['plain', 'high']) { this.beads[k].ok.visible = false; this.beads[k].bad.visible = false; } },
    };
    this.session = session;
    session.step(0, player, false);
    return session;
  }

  /** The beads on the walls: where a kick taken now would land (the white one), and a steep kick (the small yellow one). */
  _beads(st, mark) {
    for (const [key, high] of [['plain', false], ['high', true]]) {
      const b = this.beads[key], m = st.over || (high && st.stand) ? null : kickMark(st, high, mark); // (off a net there is one jump only)
      b.ok.visible = b.bad.visible = false;
      if (!m || m.kind === 'top') continue;
      const bad = m.kind === 'thorn' || m.kind === 'rain', mesh = bad ? b.bad : b.ok, z = 0.5;
      if (m.kind === 'net') this.at(m.x, m.y + 0.15, z, mesh.position);
      else this.at(m.side * (wallAt(m.side, m.y + CLEFT.chest) + OPEN * z - 0.06), m.y + CLEFT.chest, z, mesh.position);
      mesh.visible = true; mesh.updateMatrixWorld(true);
    }
  }

  _tell(e, io) {
    if (e.type === 'kick') io.play('jump', { volume: e.high ? 0.6 : 0.45 });
    else if (e.type === 'thorn') { io.play('hit'); io.note('Thorns!'); }
    else if (e.type === 'rain') { io.play('hit'); io.note('A stone!'); }
    else if (e.type === 'fall') io.note(`Into the net — ${Math.round(e.from - e.to)} m lost.`);
    else if (e.type === 'section') { io.play('tick'); io.note(HINTS[e.n] || CLEFT.sections[e.n].name); }
    else if (e.type === 'top') { io.play('bell'); io.play('victory', { volume: 0.7 }); io.note(`The lip! ${formatTime(e.time)}`); }
  }

  /** Every frame: the stone that comes down is where the clock of the world says. */
  update(time = 0) {
    const r = rainAt(this.clock(), this._r || (this._r = {}));
    this.stone.visible = !!r;
    if (!r) return;
    this.at(r.side * (wallAt(r.side, clamp(r.y, 0, CLEFT.height)) + OPEN * 0.45 - 0.42), r.y, 0.45, this.stone.position);
    this.stone.rotation.set(r.y * 1.3, r.n, r.y * 0.9);
    this.stone.updateMatrixWorld(true);
    void time;
  }
}
