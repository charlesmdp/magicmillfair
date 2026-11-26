// Games and dangers: the climb from stone to stone against the clock ("Mostly Up") and the tower from which
// it is watched, the boulder that rolls down the island, the acid pond, the shark that keeps swimmers from
// going too far.
import * as THREE from 'three';
import { Parts, MeshBuilder } from '../../props/MeshBuilder.js';
import { LAYER, staticCaster } from '../../../render/Shadows.js';
import { mergeStatic, distanceCuller } from '../../props/StaticBatch.js';
import { makeMaterial, GLSL_COMMON, GLSL_LIGHTING } from '../../../render/globals.js';
import { cosmeticMaterial } from '../../../player/Cosmetics.js';
import { Booths } from './Booths.js';
import { Race } from './Race.js';
import { Wing } from './Wing.js';
import { buildNotices } from './Notices.js';
import { buildThanksWall } from './ThanksWall.js';
import { buildRelics } from './Relics.js';
import { CLIMB, ACID, BOULDER, ISLAND, islandPath, islandAt, ISLAND_LENGTH, SEA_REACH, SHARK, PONDS } from '../../layout/layout.js';
import { climbCourse, stoneDepth, formatTime } from './course.js';
import { canvasBoard, drawScores, drawSponsor, drawSponsorList } from './Boards.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mmss = formatTime;

// ---------------------------------------------------------------------------
// Acid: a surface that glows and bubbles

const ACID_VERT = /* glsl */ `
out vec3 vWorld;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }
`;
const ACID_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
uniform vec3 uCentre; // x, z, radius
in vec3 vWorld;
void main() {
  vec2 p = vWorld.xz - uCentre.xy;
  float r = length(p) / uCentre.z;
  if (r > 1.0) discard;
  // slow swirls, and bubbles that swell and burst
  float swirl = sin(p.x * 2.3 + uTime * 0.7 + sin(p.y * 1.7 - uTime * 0.5) * 1.6) * 0.5 + 0.5;
  vec2 cell = floor(p * 1.6), f = fract(p * 1.6) - 0.5;
  float seed = hash12(cell), phase = fract(uTime * (0.25 + seed * 0.35) + seed * 7.0);
  float bubble = smoothstep(0.42 * phase + 0.04, 0.42 * phase, length(f - (vec2(hash12(cell + 3.1), hash12(cell + 7.7)) - 0.5) * 0.5)) * (1.0 - phase) * step(0.45, seed);
  vec3 col = mix(vec3(0.1, 0.5, 0.03), vec3(0.55, 1.0, 0.1), swirl * 0.6) * 1.25 + vec3(0.7, 1.0, 0.35) * bubble * 1.6;
  col *= 1.0 - 0.45 * smoothstep(0.75, 1.0, r);
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col), 1.0);
}
`;

export class GamesZone {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'zone:games';
    this.cast = staticCaster(world.engine.tier);
    this.colliders = [];
    this.platforms = [];
    this.ground = (x, z) => this.data.heightAt(x, z);
    /** Filled by the game: note(text), run(text | null), finished(ms, clean). */
    this.events = {};
    this.run = { state: 'idle', t: 0, clean: true };
  }

  build() {
    this._climb();
    this._tower();
    this._acid();
    this._boulder();
    this._shark();
    // the fair: four booths on the pier head, a race round the wheat fields
    this.booths = new Booths(this).build();
    this.group.add(this.booths.group);
    this.race = new Race(this).build();
    this.wing = new Wing(this).build(); // the theatre of the plaza
    this.notices = buildNotices(this); // what is new, who sponsors what, and the arcade cabinet of the pier
    this.thanks = buildThanksWall(this); // every sponsor, cut into the cliff by the acid pond
    this.relics = buildRelics(this); // twenty-five things left over from the world before, by the paths
    this.group.updateMatrixWorld(true);
    return this;
  }

  // ---------------------------------------------------------------------------
  // The climb ("Mostly Up")

  _climb() {
    const parts = new Parts();
    const rock = parts.get('rock'), glow = parts.get('glow'), wood = parts.get('woodDark'), paint = parts.get('paint');
    const C = CLIMB, course = (this.course = climbCourse());
    // the stone itself is pale; a ring painted on it tells how far up one is: green, yellow, orange, red, violet
    const BANDS = [[0.25, [0.3, 1.25, 0.35]], [0.5, [1.7, 1.35, 0.2]], [0.75, [1.75, 0.75, 0.15]], [0.9, [1.6, 0.22, 0.18]], [2, [1.05, 0.45, 1.7]]];
    const band = (v) => BANDS.find(([upTo]) => v < upTo)[1];
    course.forEach((st, i) => {
      const c = [1.32, 1.28, 1.2], k = 0.9 + 0.2 * ((i * 7) % 5) / 4;
      if (st.beam) {
        // a plank on two floating stones
        const { yaw, half, hw } = st.beam, hx = Math.sin(yaw), hz = Math.cos(yaw);
        wood.tint(1.25, 1.1, 0.9, 1).place(st.x, st.y, st.z, yaw).box(-hw, -0.12, -half, hw, 0, half, { tile: 1.5 }).pop();
        for (const e of [-1, 1]) {
          rock.tint(c[0] * k, c[1] * k, c[2] * k, 1).place(st.x + hx * e * (half - 0.4), st.y - 0.12, st.z + hz * e * (half - 0.4))
            .lathe([[0.0, -0.9], [0.2, -0.6], [0.36, -0.2], [0.38, 0.0], [0.0, 0.0]], 7, { tile: 1.6 }).pop();
          glow.tint(0.25, 0.6, 1.0, 1).place(st.x + hx * e * (half - 0.4), st.y - 1.0, st.z + hz * e * (half - 0.4)).lathe([[0.0, -0.4], [0.1, 0.0]], 5).pop();
        }
        this.platforms.push({ type: 'slab', x: st.x, z: st.z, hw, hl: half, yaw, y: st.y, clearance: 0.45, thick: stoneDepth(st) });
        return;
      }
      const r = st.r, T = stoneDepth(st);
      const sides = st.r > 1.2 ? 12 : 9, ring = st.top ? [1.9, 1.45, 0.25] : band(st.s);
      rock.tint(c[0] * k, c[1] * k, c[2] * k, 1).place(st.x, st.y, st.z, i * 1.3);
      rock.lathe([[0.0, -T], [r * 0.5, -T * 0.78], [r * 0.93, -T * 0.32], [r * 1.0, -0.07], [r * 0.96, 0.0], [r * 0.82, 0.0]], sides, { tile: 1.6 });
      // the top: rings of paint (several on the platforms where one rests)
      const rings = st.rest || st.top ? [0.82, 0.66, 0.5, 0.34, 0.18, 0] : [0.82, 0.56, 0];
      for (let q = 0; q + 1 < rings.length; q++) {
        const on = q % 2 === 0;
        rock.tint(on ? ring[0] : c[0] * k, on ? ring[1] : c[1] * k, on ? ring[2] : c[2] * k, 1).lathe([[r * rings[q], 0.0], [r * rings[q + 1], 0.0]], sides, { tile: 1.6 });
      }
      rock.pop();
      // what holds it up: a pillar of rock near the ground, a shard of light higher up
      if (st.y - C.y < 7) rock.tint(c[0] * 0.78, c[1] * 0.78, c[2] * 0.78, 1).cylinder(st.x, C.y - 0.5, st.z, r * 0.42, r * 0.3, st.y - C.y - T + 0.6, 8, { tile: 1.6, capTop: false });
      else glow.tint(0.25, 0.6, 1.0, 1).place(st.x, st.y - T + 0.05, st.z).lathe([[0.0, -0.45 - r * 0.3], [0.1 + r * 0.08, 0.0]], 5).pop();
      this.platforms.push({ type: 'disc', x: st.x, z: st.z, r, y: st.y, clearance: 0.45, thick: T * 0.85 });
      if (st.rest || st.top) {
        // a mast with a pennant, to rest by (and to see how high one is)
        const px = st.x + r * 0.62, pz = st.z;
        paint.tint(0.9, 0.9, 0.88, 1).rod(V(px, st.y, pz), V(px, st.y + (st.top ? 5 : 2.6), pz), 0.04, 6);
        const cloth = parts.get('doubleSided'), h = st.top ? 5 : 2.6, tone = st.top ? [1.0, 0.75, 0.1] : [0.85, 0.15, 0.12];
        cloth.tint(tone[0], tone[1], tone[2], 1).tri(V(px, st.y + h, pz), V(px, st.y + h - 0.6, pz), V(px + (st.top ? 1.8 : 1.1), st.y + h - 0.3, pz + 0.2));
      }
    });
    const top = course[course.length - 1];
    this.top = { x: top.x, z: top.z, r: top.r, y: top.y };
    {
      // the bell at the top: touch the platform and the climb is done
      paint.tint(1.0, 0.75, 0.15, 1).place(top.x - 1.2, top.y + 1.5, top.z).lathe([[0.42, 0.0], [0.36, 0.16], [0.24, 0.5], [0.07, 0.62]], 10).pop();
      wood.tint(1.1, 1.0, 0.85, 1);
      for (const s of [-1, 1]) wood.rod(V(top.x - 1.2, top.y, top.z + s * 0.6), V(top.x - 1.2, top.y + 2.3, top.z + s * 0.6), 0.05, 6);
      wood.rod(V(top.x - 1.2, top.y + 2.3, top.z - 0.7), V(top.x - 1.2, top.y + 2.3, top.z + 0.7), 0.05, 6);
    }
    // the start: a plate at the foot of the first stone
    const first = course[0], dx = C.gate[0] - first.x, dz = C.gate[1] - first.z, dl = Math.hypot(dx, dz);
    this.start = { x: first.x + (dx / dl) * (first.r + 1.5), z: first.z + (dz / dl) * (first.r + 1.5), r: 1.3, y: C.y };
    paint.tint(1.0, 0.75, 0.12, 1).cylinder(this.start.x, C.y - 0.05, this.start.z, 1.3, 1.3, 0.09, 16);
    paint.tint(0.85, 0.15, 0.12, 1).cylinder(this.start.x, C.y - 0.05, this.start.z, 0.9, 0.9, 0.1, 16);
    paint.tint(0.97, 0.95, 0.9, 1).cylinder(this.start.x, C.y - 0.05, this.start.z, 0.5, 0.5, 0.11, 12);
    // the gate: two striped posts, a sign across, the board of the best climbs beside it
    const [gx, gz] = C.gate, gy = this.ground(gx, gz);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 6; k++) paint.tint(k % 2 ? 0.92 : 0.8, k % 2 ? 0.9 : 0.14, k % 2 ? 0.86 : 0.1, 1).cylinder(gx + s * 2.0, gy + k * 0.62 - 0.2, gz, 0.16, 0.16, 0.62, 10, { capTop: k === 5 });
      paint.tint(1.0, 0.75, 0.12, 1).place(gx + s * 2.0, gy + 3.68, gz).lathe([[0.0, -0.16], [0.2, 0.0], [0.0, 0.2]], 8).pop();
      this.colliders.push({ type: 'circle', x: gx + s * 2.0, z: gz, r: 0.26 });
    }
    this._add(parts, 'climb');
    const sign = this._board(1024, 192, (ctx, w, h) => {
      ctx.fillStyle = '#7a1420'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 10; ctx.strokeRect(12, 12, w - 24, h - 24);
      ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${h * 0.56}px Georgia, 'Times New Roman', serif`;
      ctx.fillText(C.name.toUpperCase(), w / 2, h * 0.52);
    }, 4.4, 0.82, { both: true });
    sign.mesh.position.set(gx, gy + 3.2, gz);
    sign.mesh.rotation.y = Math.atan2(first.x - gx, first.z - gz) + Math.PI; // read from outside (and from inside)
    this.group.add(sign.mesh);
    // the board of the best climbs, to the right of the gate, under the panel of whoever sponsors the game
    this.scores = null; // not asked yet
    const stand = this.scoreStand('sky', gx + 4.6, gz - 0.7, sign.mesh.rotation.y + 0.35, {
      title: `${C.name.toUpperCase()} — BEST CLIMBS`, sub: `${C.height} m of stones · no jetpack · fastest to the top`, format: mmss, what: 'this game',
      roll: -1, // (the board of its five sponsors: on the left — the gate is on the right)
    });
    this.board = stand.board;
    this.world.noFly.push({ x: C.x, z: C.z, r: C.r + 12 }); // (wide enough that nobody flies in from outside)
  }

  /**
   * A scoreboard on two posts with a sponsor panel above it, facing `yaw`: what every game of the fair has at
   * its entrance. Returns { board, panel, setScores(lists, room), setSponsor(sponsor) } (`room`: { name, lists }
   * in a room a player made: the board then shows both); the place is added to
   * world.sponsorSlots under `board:<id>` (walk up to it to sponsor the game).
   * A big attraction — five sponsors on its panel — has a second board beside it that lists the five (`roll`: +1
   * on the right of who reads the board, -1 on the left; `rollBack`: so far behind; `rollAt`: { x, z } where it
   * stands instead; `piles`: its posts go down to the bottom of the sea): stand.roll, { mesh, at, rows, setRows }.
   */
  scoreStand(id, x, z, yaw, o) {
    const { title, sub, format, what = 'this game', width = 3.4, pixels = 1, foot = 0.3, roll = 0, rollBack = 0, rollAt = null, piles = false } = o;
    const given = o.y !== undefined, y = given ? o.y : this.ground(x, z); // (given: on planks or on the pier — not on the ground)
    const k = width / 3.4;
    const state = { lists: null, room: null, sponsor: null, offer: '' };
    // (`pixels`: a smaller board is drawn on a smaller sheet — the same drawing, scaled)
    // (the board and the panel read from both sides: one walks round a stand)
    const board = canvasBoard(Math.round(1024 * pixels), Math.round(904 * pixels), (ctx) => { ctx.save(); ctx.scale(pixels, pixels); drawScores(ctx, 1024, 904, { title, sub, lists: state.lists, format, me: this.me, room: state.room }); ctx.restore(); }, width, 3.0 * k, { both: true });
    board.mesh.position.set(x, y + 0.75 + 1.5 * k, z);
    board.mesh.rotation.y = yaw;
    const panel = canvasBoard(Math.round(1024 * pixels), Math.round(316 * pixels), (ctx) => { ctx.save(); ctx.scale(pixels, pixels); drawSponsor(ctx, 1024, 316, state.sponsor, { what, price: state.offer, label: 'OUR AWESOME SPONSOR' }); ctx.restore(); }, width, 1.05 * k, { both: true });
    panel.mesh.position.set(x, y + 0.75 + 3.0 * k + 0.08 + 0.525 * k, z);
    panel.mesh.rotation.y = yaw;
    this.group.add(board.mesh, panel.mesh);
    const post = new Parts(), pw = post.get('woodDark'), paint = post.get('paint');
    const ax = Math.cos(yaw), az = -Math.sin(yaw), top = y + 0.75 + 4.05 * k + 0.25;
    for (const s of [-1, 1]) {
      const px = x + ax * s * (width / 2 + 0.09), pz = z + az * s * (width / 2 + 0.09);
      pw.tint(1.1, 1.0, 0.85, 1).box(px - 0.07, y - foot, pz - 0.07, px + 0.07, top, pz + 0.07, { tile: 1 }); // (`foot`: how deep the posts go — a stand by planks over the sea stands on the bottom)
      paint.tint(1.0, 0.75, 0.12, 1).place(px, top, pz).lathe([[0.0, -0.02], [0.13, 0.1], [0.0, 0.26]], 8).pop();
    }
    {
      // a crown for the board: a golden arch from post to post, light bulbs along it, a star at its top
      const glow = post.get('glow'), W2 = width / 2 + 0.16, rise = 0.62 * k, nx = Math.sin(yaw), nz = Math.cos(yaw), N = 12;
      const at = (th, r, out) => V(x + ax * Math.cos(th) * W2 * r + nx * out, top - 0.12 + Math.sin(th) * rise * (r === 1 ? 1 : 0.62), z + az * Math.cos(th) * W2 * r + nz * out);
      for (let i = 0; i < N; i++) {
        const t0 = (Math.PI * i) / N, t1 = (Math.PI * (i + 1)) / N;
        paint.tint(1.5, 1.05, 0.25, 1).quad(at(t0, 0.86, 0.05), at(t1, 0.86, 0.05), at(t1, 1, 0.05), at(t0, 1, 0.05)).quad(at(t1, 0.86, -0.05), at(t0, 0.86, -0.05), at(t0, 1, -0.05), at(t1, 1, -0.05));
        paint.tint(1.1, 0.7, 0.12, 1).quad(at(t0, 1, 0.05), at(t1, 1, 0.05), at(t1, 1, -0.05), at(t0, 1, -0.05));
        if (i > 0) { const b = at(t0, 0.93, 0.08); glow.tint(1.0, 0.88, 0.55, 1).place(b.x, b.y, b.z).lathe([[0.0, -0.055 * k], [0.05 * k, 0.0], [0.0, 0.055 * k]], 6).pop(); }
      }
      const apex = at(Math.PI / 2, 1, 0);
      for (const g of [1, -1]) for (let i = 0; i < 10; i += 2) {
        const p = (j, r) => { const a = (j / 10) * Math.PI * 2 + Math.PI / 2; return V(apex.x + ax * Math.cos(a) * r * g, apex.y + 0.3 * k + Math.sin(a) * r, apex.z + az * Math.cos(a) * r * g).add(V(nx * 0.06 * g, 0, nz * 0.06 * g)); };
        const c = V(apex.x + nx * 0.06 * g, apex.y + 0.3 * k, apex.z + nz * 0.06 * g);
        paint.tint(1.6, 1.25, 0.3, 1).tri(c, p(i - 1, 0.13 * k), p(i, 0.32 * k)).tri(c, p(i, 0.32 * k), p(i + 1, 0.13 * k));
      }
    }
    // ---- the board of the five sponsors, beside the board of scores and the same way round (a big attraction)
    let list = null;
    if (roll || rollAt) {
      const rw = 2.1 * k, d = width / 2 + 0.45 + rw / 2, nx = Math.sin(yaw), nz = Math.cos(yaw), rows = { list: [] };
      const rx = rollAt ? rollAt.x : x + ax * roll * d - nx * rollBack, rz = rollAt ? rollAt.z : z + az * roll * d - nz * rollBack;
      const feet = [-1, 1].map((s) => this.ground(rx + ax * s * (rw / 2 + 0.09), rz + az * s * (rw / 2 + 0.09))), hi = Math.max(...feet), lo = Math.min(...feet);
      // (on the ground: never buried where the ground rises, never more than half a metre up where it falls away)
      const ry = given ? y : Math.max(hi, Math.min(y, hi + 0.5)), rfoot = piles ? Math.max(foot, ry - Math.min(lo, 0) + 0.6) : given ? foot : ry - lo + 0.3;
      // (drawn on a sheet of 640 × 904, a little smaller than the board of scores' own: five rows read well enough)
      const sheet = canvasBoard(Math.round(512 * pixels), Math.round(724 * pixels), (ctx) => { ctx.save(); ctx.scale(0.8 * pixels, 0.8 * pixels); drawSponsorList(ctx, 640, 904, rows.list); ctx.restore(); }, rw, 3.0 * k, { both: true });
      sheet.mesh.position.set(rx, ry + 0.75 + 1.5 * k, rz);
      sheet.mesh.rotation.y = yaw;
      sheet.mesh.name = `sponsors-${id}`;
      this.group.add(sheet.mesh);
      const rtop = ry + 0.75 + 3.0 * k + 0.2;
      for (const s of [-1, 1]) {
        const px = rx + ax * s * (rw / 2 + 0.09), pz = rz + az * s * (rw / 2 + 0.09);
        pw.tint(1.1, 1.0, 0.85, 1).box(px - 0.07, ry - rfoot, pz - 0.07, px + 0.07, rtop, pz + 0.07, { tile: 1 });
        paint.tint(1.0, 0.75, 0.12, 1).place(px, rtop, pz).lathe([[0.0, -0.02], [0.13, 0.1], [0.0, 0.26]], 8).pop();
      }
      this.colliders.push({ type: 'box', x: rx, z: rz, hw: rw / 2 + 0.2, hl: 0.14, yaw });
      list = {
        mesh: sheet.mesh, at: { x: rx, y: ry, z: rz, hw: rw / 2 + 0.2 },
        /** What it lists now (for the checks). */
        get rows() { return rows.list; },
        setRows: (r) => { rows.list = r || []; sheet.redraw(); },
        reach: { x: rx + nx * 1.3, z: rz + nz * 1.3, reach: 2.2 },
      };
    }
    this._add(post, `stand-${id}`);
    this.colliders.push({ type: 'box', x, z, hw: width / 2 + 0.2, hl: 0.14, yaw });
    const stand = {
      id, board, panel, roll: list,
      /** Who is on the panel now (for the checks). */
      get sponsor() { return state.sponsor; },
      /** What the board shows now: its four lists (for the checks). */
      get lists() { return state.lists; },
      setScores: (lists, room = null) => { state.lists = lists; state.room = room; board.redraw(); },
      redraw: () => board.redraw(),
      setSponsor: (sponsor) => { state.sponsor = sponsor; panel.redraw(); },
      /** What the empty panel says about taking it ("from $1 · step up and bid"), or nothing. */
      setOffer: (text) => { if (text !== state.offer) { state.offer = text; if (!state.sponsor) panel.redraw(); } },
    };
    (this.world.sponsorSlots ||= []).push({ id: `board:${id}`, what, x: x + Math.sin(yaw) * 1.4, y, z: z + Math.cos(yaw) * 1.4, reach: 3.2, set: stand.setSponsor, offer: stand.setOffer, ...(list && { roll: list.setRows, rollAt: list.reach }) });
    (this.stands ||= {})[id] = stand;
    return stand;
  }

  /**
   * The board of a game that is switched on after the world was built (the games of the lab): a stand like every
   * other game's — and what stops the walker is told to the world at once (the rest was told when it was built).
   */
  lateStand(id, x, z, yaw, o) {
    if (this.stands?.[id]) return this.stands[id];
    const stand = this.scoreStand(id, x, z, yaw, o);
    this.world.collision.addBox(x, z, (o.width || 3.4) / 2 + 0.2, 0.14, yaw);
    if (stand.roll) this.world.collision.addBox(stand.roll.at.x, stand.roll.at.z, stand.roll.at.hw, 0.14, yaw); // (the board of its five sponsors)
    return stand;
  }

  // ---------------------------------------------------------------------------
  // The tower of those who watch: a striped fairground tower in the bay behind the lawn, a stair winding round
  // it with a landing on every turn that faces the climb, a deck under a tent roof at the top. One gets in and
  // out by its door only: there is no way from it into the game.

  _tower() {
    const C = CLIMB, T = C.tower, parts = new Parts();
    const paint = parts.get('paint'), deck = parts.get('woodDeck'), cloth = parts.get('doubleSided');
    const base = C.y, P = T.pitch, N = T.turns, top = base + P * N, TAU = Math.PI * 2;
    const R0 = 2.0, R1 = 3.62, RW = 3.78, RD = 5.4, LAND = Math.PI / 3;
    const face = Math.atan2(C.x - T.x, C.z - T.z); // towards the lawn
    // `u`: the angle round the tower, from where a landing starts (landings are centred on the side of the lawn)
    const pt = (u, r, y) => V(T.x + Math.sin(face + u - LAND / 2) * r, y, T.z + Math.cos(face + u - LAND / 2) * r);
    const uOf = (x, z) => { const u = (Math.atan2(x - T.x, z - T.z) - face + LAND / 2) % TAU; return u < 0 ? u + TAU : u; };
    const rise = (u) => (u < LAND ? 0 : (P * (u - LAND)) / (TAU - LAND)); // the landing, then the steps up to the next one
    this.tower = { x: T.x, z: T.z, top, r: RD };

    // --- what one walks on: each turn of the stair, then the deck (all round outside the stair, and its last landing)
    for (let k = 0; k < N; k++) {
      this.platforms.push({ type: 'custom', clearance: 1.6, heightAt: (x, z) => {
        const r2 = (x - T.x) ** 2 + (z - T.z) ** 2;
        return r2 > RW * RW || r2 < (R0 - 0.4) ** 2 ? null : base + P * k + rise(uOf(x, z));
      } });
    }
    this.platforms.push({ type: 'custom', clearance: 1.0, heightAt: (x, z) => {
      const r2 = (x - T.x) ** 2 + (z - T.z) ** 2;
      return r2 > RD * RD ? null : r2 >= RW * RW || uOf(x, z) < LAND ? top : null;
    } });
    // --- what holds people in: the shaft, the wall of the stair (open at the door, and at the top landing),
    // the rail of the deck, the rail between the top landing and the well of the stair
    this.colliders.push({ type: 'circle', x: T.x, z: T.z, r: R0 });
    // The diving boards: three planks out over the splash pool, on the side away from the stones — a third of
    // the way up, two thirds, and at the very top. The wall of the stair and the rail of the deck open at each.
    const UB = (14 / 24) * TAU, UT = (16 / 28) * TAU, TIP = RD + 5.0, BW = 0.82; // where they leave the stair, the deck; how far out; half width
    const boards = [4, 8].map((k) => ({ u: UB, y: base + P * k + rise(UB), r0: R1 - 0.1, turn: k }));
    boards.push({ u: UT, y: top, r0: RD - 0.2, turn: -1 });
    const ring = (r, n, bands) => {
      for (let i = 0; i < n; i++) {
        const u = ((i + 0.5) / n) * TAU, q = pt(u, r, 0);
        for (const [y0, y1] of bands(u, i)) this.colliders.push({ type: 'box', x: q.x, z: q.z, hw: r * Math.tan(Math.PI / n) + 0.06, hl: 0.1, yaw: face + u - LAND / 2, y0, y1 });
      }
    };
    ring(RW + 0.1, 24, (u, i) => {
      if (u < LAND) return [[base + 3.2, top - 0.9]];
      if (i !== 13 && i !== 14) return [[base - 2, top + 6]];
      const [a, b] = boards; // (the two that leave the stair)
      return [[base - 2, a.y - 0.3], [a.y + 2.3, b.y - 0.3], [b.y + 2.3, top + 6]];
    });
    ring(RD, 28, (u, i) => (i === 15 || i === 16 ? [] : [[top - 0.6, top + 6]]));
    for (const b of boards) this.platforms.push({ type: 'slab', x: pt(b.u, (b.r0 + TIP) / 2, 0).x, z: pt(b.u, (b.r0 + TIP) / 2, 0).z, hw: BW, hl: (TIP - b.r0) / 2, yaw: face + b.u - LAND / 2, y: b.y });
    {
      const q = pt(LAND + 0.04, (R0 + RW) / 2, 0);
      this.colliders.push({ type: 'box', x: q.x, z: q.z, hw: (RW - R0) / 2 + 0.1, hl: 0.08, yaw: face + LAND / 2 + 0.04 + Math.PI / 2, y0: top - 0.5, y1: top + 6 });
    }
    this.world.noFly.push({ x: T.x, z: T.z, r: RD + 4 });

    // --- the shaft, in bands of red and cream
    for (let i = 0; i <= N * 2; i++) {
      const c = i % 2 ? [0.93, 0.9, 0.82] : [0.78, 0.12, 0.1];
      paint.tint(c[0], c[1], c[2], 1).cylinder(T.x, base - 0.6 + i * (P / 2), T.z, R0, R0, i === N * 2 ? 4.9 : P / 2, 14, { capTop: false, capBottom: false });
    }
    // --- the stair: steps, landings, the band along their outer edge, a rail
    const STEPS = Math.round(P / 0.2), du = (TAU - LAND) / STEPS, sh = P / STEPS;
    const TEAL = [0.05, 0.4, 0.42], PLANK = [1.0, 0.94, 0.84], EDGE = [0.86, 0.66, 0.2];
    const flat = (u0, u1, r0, r1, y, n) => {
      for (let i = 0; i < n; i++) {
        const a = u0 + ((u1 - u0) * i) / n, b = u0 + ((u1 - u0) * (i + 1)) / n;
        deck.tint(PLANK[0], PLANK[1], PLANK[2], 1).quad(pt(a, r0, y), pt(a, r1, y), pt(b, r1, y), pt(b, r0, y), { tile: 1.2 });
        deck.tint(0.6, 0.55, 0.48, 1).quad(pt(a, r0, y - 0.09), pt(b, r0, y - 0.09), pt(b, r1, y - 0.09), pt(a, r1, y - 0.09), { tile: 1.2 });
      }
    };
    const fascia = (a, b, ya, yb, r, depth) => paint.tint(EDGE[0], EDGE[1], EDGE[2], 1).quad(pt(a, r, ya - depth), pt(b, r, yb - depth), pt(b, r, yb + 0.02), pt(a, r, yb + 0.02));
    const rail = (u0, u1, r, y0, y1, n) => {
      paint.tint(TEAL[0], TEAL[1], TEAL[2], 1);
      for (let i = 0; i <= n; i++) {
        const a = u0 + ((u1 - u0) * i) / n, ya = y0 + ((y1 - y0) * i) / n;
        paint.rod(pt(a, r, ya), pt(a, r, ya + 1.08), 0.032, 5, { caps: false });
        if (i < n) { const b = u0 + ((u1 - u0) * (i + 1)) / n, yb = y0 + ((y1 - y0) * (i + 1)) / n; paint.beam(pt(a, r, ya + 1.08), pt(b, r, yb + 1.08), 0.07, 0.06); }
      }
    };
    for (let k = 0; k < N; k++) {
      const y0 = base + P * k;
      if (k > 0) { flat(0, LAND, R0, R1, y0, 4); fascia(0, LAND, y0, y0, R1, 0.3); rail(0, LAND, R1 - 0.04, y0, y0, 2); }
      for (let i = 0; i < STEPS; i++) {
        const a = LAND + i * du, b = a + du, ya = y0 + sh * i, yb = ya + sh;
        deck.tint(PLANK[0] * 0.8, PLANK[1] * 0.8, PLANK[2] * 0.8, 1).quad(pt(a, R0, ya), pt(a, R1, ya), pt(a, R1, yb), pt(a, R0, yb), { tile: 1.2 }); // riser
        deck.tint(PLANK[0], PLANK[1], PLANK[2], 1).quad(pt(a, R0, yb), pt(a, R1, yb), pt(b, R1, yb), pt(b, R0, yb), { tile: 1.2 }); // tread
        deck.tint(0.6, 0.55, 0.48, 1).quad(pt(a, R0, ya - 0.05), pt(b, R0, yb - 0.05), pt(b, R1, yb - 0.05), pt(a, R1, ya - 0.05), { tile: 1.2 }); // seen from below
        fascia(a, b, ya, yb, R1, 0.34);
      }
      if (boards.some((b) => b.turn === k)) {
        const yAt = (u) => y0 + sh + ((P - sh) * (u - LAND)) / (TAU - LAND), W = 0.26;
        rail(LAND, UB - W, R1 - 0.04, yAt(LAND), yAt(UB - W), 5);
        rail(UB + W, TAU, R1 - 0.04, yAt(UB + W), yAt(TAU), 4);
      } else rail(LAND, TAU, R1 - 0.04, y0 + sh, y0 + P, 10);
    }
    // --- the deck at the top, its rails, the tent roof on its posts, a pennant
    flat(0, TAU, R1, RD, top, 24);
    flat(0, LAND, R0, R1, top, 4);
    fascia(0, TAU / 2, top, top, RD, 0.3); fascia(TAU / 2, TAU, top, top, RD, 0.3);
    rail(UT + 0.21, UT - 0.21 + TAU, RD - 0.06, top, top, 23);
    rail(LAND + 0.06, TAU - 0.75, R1 + 0.06, top, top, 8);
    // --- the diving boards: a plank with a red tip, beams under it, braces back to the tower, a rail to start with
    const NAMES = ['THE TOE DIP', 'THE BELLY FLOP', 'THE LEAP OF FAITH'];
    const pool = PONDS.find((p) => p.id === 'dive'), poolX = pool.outline.reduce((s, q) => s + q[0], 0) / pool.outline.length, poolZ = pool.outline.reduce((s, q) => s + q[1], 0) / pool.outline.length;
    boards.forEach((b, i) => {
      const yaw = face + b.u - LAND / 2, hl = (TIP - b.r0) / 2, mid = pt(b.u, (b.r0 + TIP) / 2, b.y);
      deck.tint(PLANK[0], PLANK[1], PLANK[2], 1).place(mid.x, mid.y, mid.z, yaw).box(-BW, -0.1, -hl, BW, 0, hl - 1.1, { tile: 1.2 }).pop();
      paint.place(mid.x, mid.y, mid.z, yaw);
      paint.tint(0.95, 0.93, 0.88, 1).box(-BW, -0.1, hl - 1.1, BW, 0.003, hl - 0.85);
      paint.tint(0.82, 0.1, 0.08, 1).box(-BW, -0.1, hl - 0.85, BW, 0.003, hl);
      paint.tint(TEAL[0], TEAL[1], TEAL[2], 1);
      for (const s of [-1, 1]) {
        paint.box(s * (BW - 0.3) - 0.07, -0.32, -hl, s * (BW - 0.3) + 0.07, -0.1, hl - 0.5);
        paint.beam(V(s * (BW - 0.3), -6.9, -hl - (b.turn < 0 ? 1.55 : 0.05)), V(s * (BW - 0.3), -0.3, hl * 0.1), 0.13, 0.13);
        // (a rail along the first steps: after that, nothing)
        for (const z of [-hl + 0.25, -hl + 1.4, -hl + 2.55]) paint.rod(V(s * (BW - 0.04), 0, z), V(s * (BW - 0.04), 1.05, z), 0.032, 5, { caps: false });
        paint.beam(V(s * (BW - 0.04), 1.05, -hl + 0.25), V(s * (BW - 0.04), 1.05, -hl + 2.55), 0.07, 0.06);
      }
      paint.pop();
      // its name and how high it is over the water, on a board across the way in (it reads from both sides)
      const sign = this._board(384, 160, (ctx, w, h) => {
        ctx.fillStyle = '#16211b'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 7; ctx.strokeRect(7, 7, w - 14, h - 14);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f6e7b8'; ctx.font = "900 80px Georgia, 'Times New Roman', serif"; ctx.fillText(`${Math.round(b.y - pool.level)} m`, w / 2, 62);
        ctx.fillStyle = '#f2c14e'; ctx.font = '700 27px system-ui, sans-serif'; ctx.fillText(NAMES[i], w / 2, 124, w - 30);
      }, 1.5, 0.625);
      const sp = pt(b.u, b.r0 + 0.5, b.y + 2.62), out = V(Math.sin(yaw), 0, Math.cos(yaw));
      sign.mesh.position.copy(sp).addScaledVector(out, 0.012);
      sign.mesh.rotation.y = yaw;
      sign.mesh.name = 'games:dive';
      const back = sign.mesh.clone();
      back.position.copy(sp).addScaledVector(out, -0.012);
      back.rotation.y = yaw + Math.PI;
      this.group.add(sign.mesh, back);
      paint.tint(TEAL[0], TEAL[1], TEAL[2], 1);
      for (const s of [-1, 1]) { const q = sp.clone().addScaledVector(V(Math.cos(yaw), 0, -Math.sin(yaw)), s * 0.8); paint.rod(V(q.x, b.y, q.z), V(q.x, b.y + 2.95, q.z), 0.04, 6, { caps: false }); }
    });
    {
      // the splash pool: a big ring of red and white floats in the middle to aim for, and a sign on the bank
      const n = 16, r = 1.7, y = pool.level - 0.04;
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * TAU, a1 = ((k + 1) / n) * TAU, c = k % 2 ? [0.95, 0.93, 0.88] : [0.85, 0.1, 0.08];
        paint.tint(c[0], c[1], c[2], 1).rod(V(poolX + Math.cos(a0) * r, y, poolZ + Math.sin(a0) * r), V(poolX + Math.cos(a1) * r, y, poolZ + Math.sin(a1) * r), 0.26, 8, { caps: false });
      }
      const dx = T.x - poolX, dz = T.z - poolZ, dl = Math.hypot(dx, dz), sx = poolX + (dx / dl) * 8.6 + (dz / dl) * 4.2, sz = poolZ + (dz / dl) * 8.6 - (dx / dl) * 4.2, sy = this.ground(sx, sz);
      const yaw = Math.atan2(C.x - sx, C.z - sz), W = 2.3, H = 1.15;
      const sign = this._board(640, 320, (ctx, w, h) => {
        const serif = "Georgia, 'Times New Roman', serif";
        ctx.fillStyle = '#0f3a52'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 8; ctx.strokeRect(10, 10, w - 20, h - 20);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff3d6'; ctx.font = `900 74px ${serif}`; ctx.fillText('THE SPLASH POOL', w / 2, 84, w - 50);
        ctx.fillStyle = '#f2c14e'; ctx.font = `700 36px ${serif}`; ctx.fillText('Three boards up the tower.', w / 2, 164, w - 60);
        ctx.fillStyle = '#d9ecf5'; ctx.font = `italic 600 32px ${serif}`; ctx.fillText('Aim for the ring. The water is deep there,', w / 2, 220, w - 60); ctx.fillText('and only there.', w / 2, 262, w - 60);
      }, W, H);
      sign.mesh.position.set(sx, sy + 1.15 + H / 2, sz);
      sign.mesh.rotation.y = yaw;
      sign.mesh.name = 'games:dive';
      this.group.add(sign.mesh);
      const wood = parts.get('woodDark');
      wood.tint(0.95, 0.9, 0.8, 1).place(sx, sy, sz, yaw);
      wood.box(-W / 2, 1.1, -0.05, W / 2, 1.2 + H, -0.012, { tile: 1 });
      for (const g of [-1, 1]) wood.box(g * (W / 2 + 0.07) - 0.06, -0.3, -0.09, g * (W / 2 + 0.07) + 0.06, 1.3 + H, 0.03, { tile: 1 });
      wood.pop();
      this.colliders.push({ type: 'box', x: sx, z: sz, hw: W / 2 + 0.15, hl: 0.12, yaw });
      /** The boards and the pool (for whoever wants to send someone there). */
      this.dive = { pool: { x: poolX, z: poolZ, y: pool.level }, boards: boards.map((b) => { const q = pt(b.u, TIP - 0.6, b.y); return { x: q.x, y: b.y, z: q.z }; }) };
    }
    for (let i = 0; i < 8; i++) paint.tint(0.93, 0.9, 0.82, 1).rod(pt((i / 8) * TAU, RD - 0.06, top + 1.08), pt((i / 8) * TAU, RD - 0.06, top + 3.2), 0.07, 6, { caps: false });
    const apex = V(T.x, top + 5.9, T.z), eave = top + 3.1, ROOF = 16;
    for (let i = 0; i < ROOF; i++) {
      const a = (i / ROOF) * TAU, b = ((i + 1) / ROOF) * TAU, c = i % 2 ? [0.95, 0.92, 0.84] : [0.8, 0.12, 0.1];
      cloth.tint(c[0], c[1], c[2], 1).tri(apex, pt(a, RD + 0.7, eave), pt(b, RD + 0.7, eave));
      cloth.tri(pt(a, RD + 0.7, eave), pt(a, RD + 0.72, eave - 0.4), pt(b, RD + 0.7, eave)); // a scalloped edge
    }
    paint.tint(1.0, 0.75, 0.12, 1).place(T.x, top + 5.85, T.z).lathe([[0.0, 0.0], [0.22, 0.14], [0.0, 0.42]], 8).pop();
    paint.tint(0.93, 0.9, 0.82, 1).rod(V(T.x, top + 6.2, T.z), V(T.x, top + 9.4, T.z), 0.045, 6);
    cloth.tint(1.0, 0.75, 0.1, 1).tri(V(T.x, top + 9.4, T.z), V(T.x, top + 8.5, T.z), V(T.x + 2.1, top + 8.95, T.z + 0.3));
    this._add(parts, 'tower');
    // a sign over the door
    const sign = this._board(768, 160, (ctx, w, h) => {
      ctx.fillStyle = '#16211b'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = "700 62px Georgia, 'Times New Roman', serif"; ctx.fillText('THE GRANDSTAND', w / 2, h * 0.4);
      ctx.fillStyle = '#f2c14e'; ctx.font = '600 28px system-ui, sans-serif'; ctx.fillText('climb up · watch them · cheer', w / 2, h * 0.76);
    }, 3.3, 0.69);
    const sp = pt(LAND / 2, RW + 0.25, base + 3.75);
    sign.mesh.position.copy(sp);
    sign.mesh.rotation.y = face;
    this.group.add(sign.mesh);
  }

  /** The line of the game in progress (see Hud.setRun): only the game that wrote it may take it away. */
  _line(owner, text) {
    if (text) { this._owner = owner; this.events.run?.(text); }
    else if (this._owner === owner) { this._owner = null; this.events.run?.(null); }
  }

  /** A flat sign drawn with a canvas: { mesh, redraw() }. */
  _board(w, h, draw, width, height, options) { return canvasBoard(w, h, draw, width, height, options); }

  /** Whose name is picked out on the boards (the visitor's own). */
  setMe(name) { this.me = name; for (const st of Object.values(this.stands || {})) st.redraw(); }

  /** The best climbs to show on the board: { day, week, month, all }, each [{ name, score }] best first. */
  setScores(lists, room = null) { this.scores = lists; this.stands.sky.setScores(lists, room); }

  _tickClimb(dt, player) {
    const C = CLIMB, p = player.pos, run = this.run, ev = this.events;
    const d = Math.hypot(p.x - C.x, p.z - C.z);
    this.near = d < C.r + 14;
    if (d > C.r + 5) { if (run.state !== 'idle') { run.state = 'idle'; this._line('climb', null); } return; }
    if (player.riding) player.riding = false; // on foot only
    const cheating = player.cheat || player.gravity !== 1 || player.boost !== 1;
    const onPlate = player.grounded && Math.abs(p.y - C.y) < 0.4 && (p.x - this.start.x) ** 2 + (p.z - this.start.z) ** 2 < this.start.r ** 2;
    if (onPlate) {
      if (run.state !== 'ready') { run.state = 'ready'; run.t = 0; this._line('climb', 'Ready — the clock starts when you leave the plate'); }
      run.clean = !cheating;
      return;
    }
    if (run.state === 'ready') { run.state = 'running'; run.t = 0; ev.started?.(); }
    if (run.state !== 'running') return;
    run.t += dt;
    if (cheating || player.jet > 0) run.clean = false;
    this._line('climb', `${mmss(run.t * 1000)}  ·  ${Math.max(0, p.y - C.y).toFixed(0)} m${run.clean ? '' : '  ·  cheat on: no record'}`);
    const T = this.top;
    if (player.grounded && p.y > T.y - 0.3 && (p.x - T.x) ** 2 + (p.z - T.z) ** 2 < T.r * T.r) {
      run.state = 'done';
      this._line('climb', `Top reached in ${mmss(run.t * 1000)}!`);
      ev.finished?.(Math.round(run.t * 1000), run.clean);
    }
  }

  // ---------------------------------------------------------------------------
  // The acid pond

  _acid() {
    const A = ACID, y = this.data.meta.acid?.y ?? this.ground(A.x, A.z) + 1;
    this.acid = { x: A.x, z: A.z, r: A.r + 0.5, y };
    const geo = new THREE.CircleGeometry(A.r + 1.4, 24);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, makeMaterial({ uniforms: { uCentre: { value: new THREE.Vector3(A.x, A.z, A.r + 1.3) } }, vertexShader: ACID_VERT, fragmentShader: ACID_FRAG }));
    mesh.position.set(A.x, y, A.z);
    mesh.name = 'acid';
    this.group.add(mesh);
    this.acidMesh = mesh;
    // a few bleached bones and a sign nobody reads, half hidden
    const parts = new Parts(), wood = parts.get('woodDark'), paint = parts.get('paint');
    const sx = A.x + (A.r + 2.6), sz = A.z + 1.2, sy = this.ground(sx, sz);
    wood.tint(0.9, 0.8, 0.65, 1).box(sx - 0.04, sy - 0.3, sz - 0.04, sx + 0.04, sy + 1.15, sz + 0.04, { tile: 1 });
    paint.tint(0.95, 0.85, 0.1, 1).place(sx, sy + 1.2, sz, 0.5).box(-0.3, -0.22, -0.02, 0.3, 0.22, 0.02).pop();
    paint.tint(0.05, 0.05, 0.05, 1).place(sx, sy + 1.2, sz, 0.5).box(-0.04, -0.12, -0.03, 0.04, 0.1, 0.03).box(-0.04, -0.19, -0.03, 0.04, -0.15, 0.03).pop();
    this._add(parts, 'acid-sign');
  }

  // ---------------------------------------------------------------------------
  // The boulder of the island

  _boulder() {
    const R = BOULDER.radius;
    const geo = new THREE.IcosahedronGeometry(R, 2);
    const pos = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = Math.sin(v.x * 2.1 + 1.3) * Math.sin(v.y * 2.7) * Math.sin(v.z * 1.9 + 0.7);
      v.multiplyScalar(1 + 0.07 * n);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const col = new Float32Array(pos.count * 4), uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { const k = 0.8 + 0.3 * Math.abs(Math.sin(i * 12.9898)); col.set([k, k * 0.98, k * 0.95, 1], i * 4); uv[i * 2] = pos.getX(i) + pos.getZ(i); uv[i * 2 + 1] = pos.getY(i); }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const mesh = new THREE.Mesh(geo, this.world.materials.rock);
    mesh.name = 'boulder';
    mesh.layers.enable(LAYER.DYNAMIC_CASTER);
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.group.add(mesh);
    this.boulder = mesh;
    this.boulderAt = new THREE.Vector3();
    this._axis = new THREE.Vector3();
  }

  /** Where the boulder is at time `now` (ms): fills this.boulderAt, returns the length of path it has left, or -1 when it is not rolling. */
  boulderState(now = Date.now()) {
    const B = BOULDER, travel = ISLAND_LENGTH / B.speed, t = (now / 1000) % B.period, c = this.boulderAt;
    this._bt = t;
    if (t < travel) {
      const p = islandPath(1 - t / travel);
      c.set(p.x, p.y + B.radius, p.z);
      this._bp = p;
      return ISLAND_LENGTH * (1 - t / travel);
    }
    if (t < travel + 2.2) {
      // off the end of the path, into the sea
      const p = islandPath(0), k = t - travel;
      c.set(p.x - p.tx * B.speed * k, p.y + B.radius - 2.6 * k * k, p.z - p.tz * B.speed * k);
      this._bp = p;
      return 0;
    }
    return -1;
  }

  /** How far along the island path (metres from its foot) someone at (x, y, z) is, or -1 away from the island. */
  _islandAlong(x, y, z) {
    const dx = x - ISLAND.x, dz = z - ISLAND.z;
    if (dx * dx + dz * dz > (ISLAND.r0 + 7) ** 2 || y < 0.4) return -1;
    let a = Math.atan2(dz, dx) - ISLAND.start;
    a -= Math.floor(a / (2 * Math.PI)) * 2 * Math.PI;
    let best = -1, err = 4; // the turn of the path whose height is that of the feet
    for (let k = 0; k < 4; k++) { const q = islandAt(a + 2 * Math.PI * k); if (q && Math.abs(q.y - y) < err) { err = Math.abs(q.y - y); best = q.s; } }
    return best;
  }

  _tickBoulder(player, now) {
    const B = BOULDER, mesh = this.boulder, c = this.boulderAt;
    const dIsland = Math.hypot(player.pos.x - ISLAND.x, player.pos.z - ISLAND.z);
    if (dIsland > 420) { mesh.visible = false; return; }
    const left = this.boulderState(now), on = left >= 0, t = this._bt;
    mesh.visible = on;
    const mine = this._islandAlong(player.pos.x, player.pos.y, player.pos.z);
    if (!on) {
      this._splashed = false;
      // a word of warning to whoever is on the island, a few seconds before the next one
      const wait = B.period - t;
      this._line('boulder', mine >= 0 && wait < 5 ? 'A rumble from the top… find a hollow or a walkway!' : null);
      return;
    }
    const p = this._bp;
    mesh.position.copy(c);
    // it rolls down the path: about the axis across it
    mesh.quaternion.setFromAxisAngle(this._axis.set(-p.tz, 0, p.tx), (t * B.speed) / B.radius);
    if (left === 0 && !this._splashed && c.y < 0.6) { this._splashed = true; this.world.ripples.splash(this.world.engine.time, c.x, 0, c.z, 12); }
    // how far above the walker it still is
    const gap = mine >= 0 && left > 0 ? left - mine : -1;
    this._line('boulder', gap > 0 && gap < 140 ? `Boulder ${gap.toFixed(0)} m above — into a hollow, or out on a walkway!` : null);
    if (!player.dead && (player.pos.x - c.x) ** 2 + (player.pos.y + 0.8 - c.y) ** 2 + (player.pos.z - c.z) ** 2 < (B.radius + 0.42) ** 2) {
      const foot = islandPath(0);
      this._line('boulder', null);
      player.die('Flattened by the boulder', [foot.x - foot.nx * 3.2 - foot.tx * 3, foot.z - foot.nz * 3.2 - foot.tz * 3, Math.atan2(foot.tx, foot.tz)]);
    }
  }

  // ---------------------------------------------------------------------------
  // The shark

  _shark() {
    const b = new MeshBuilder();
    const TOP = [0.3, 0.36, 0.42], BELLY = [0.86, 0.88, 0.88];
    // body: a spindle along Z (nose at +Z), darker above
    const ring = (z, r, squash = 1) => Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return V(Math.cos(a) * r, Math.sin(a) * r * squash, z); });
    const rings = [ring(1.75, 0.02), ring(1.3, 0.22, 0.85), ring(0.6, 0.4, 0.9), ring(-0.2, 0.42, 0.95), ring(-1.0, 0.27), ring(-1.55, 0.1), ring(-1.75, 0.05)];
    for (let k = 0; k + 1 < rings.length; k++) for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8, up = Math.sin(((i + 0.5) / 8) * Math.PI * 2) > -0.2;
      const c = up ? TOP : BELLY;
      b.tint(c[0], c[1], c[2], 1).quad(rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]);
    }
    b.tint(TOP[0] * 0.9, TOP[1] * 0.9, TOP[2] * 0.9, 1);
    const fin = (p0, p1, p2) => { b.tri(p0, p1, p2); b.tri(p2, p1, p0); };
    fin(V(0, 0.36, 0.25), V(0, 1.02, -0.3), V(0, 0.36, -0.55)); // dorsal fin: what one sees coming
    fin(V(0, 0.08, -1.6), V(0, 0.75, -2.3), V(0, 0.0, -1.95)); fin(V(0, -0.05, -1.6), V(0, -0.45, -2.15), V(0, 0.0, -1.95)); // tail
    for (const s of [-1, 1]) fin(V(s * 0.35, -0.12, 0.5), V(s * 1.0, -0.35, 0.05), V(s * 0.36, -0.14, 0.0));
    b.tint(0.02, 0.02, 0.02, 1);
    for (const s of [-1, 1]) b.place(s * 0.2, 0.08, 1.25).lathe([[0.0, -0.035], [0.035, 0.0], [0.0, 0.035]], 5).pop();
    const mesh = new THREE.Mesh(b.build(), cosmeticMaterial());
    mesh.name = 'shark';
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.shark = mesh;
    // where the sea ends for swimmers: the edges of the playable area beyond which there is only open water
    // (not the foot of the cliffs, which one may follow all the way to the secret cove)
    // (the valley's outline, and the stretches of sea added to it: an edge of one that lies within another is
    // not an edge of the sea)
    const outlines = [this.data.meta.bounds, ...SEA_REACH], edges = [];
    const within = (bd, x, z) => { let inside = false; for (let i = 0, j = bd.length - 1; i < bd.length; j = i++) if ((bd[j][1] > z) !== (bd[i][1] > z) && x < ((bd[i][0] - bd[j][0]) * (z - bd[j][1])) / (bd[i][1] - bd[j][1]) + bd[j][0]) inside = !inside; return inside; };
    for (const bd of outlines) {
      let area = 0;
      for (let i = 0; i < bd.length; i++) { const a = bd[i], c = bd[(i + 1) % bd.length]; area += a[0] * c[1] - c[0] * a[1]; }
      const turn = area > 0 ? 1 : -1; // which way round the outline goes
      for (let i = 0; i < bd.length; i++) {
        const a = bd[i], c = bd[(i + 1) % bd.length], mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
        const l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1, nx = ((c[1] - a[1]) / l) * turn, nz = (-(c[0] - a[0]) / l) * turn; // outwards
        if (outlines.some((o) => o !== bd && within(o, mx + nx * 2, mz + nz * 2))) continue;
        if (this.ground(mx, mz) < -2 && this.ground(mx + nx * 20, mz + nz * 20) < -3 && this.ground(mx + nx * 42, mz + nz * 42) < -3) edges.push([a[0], a[1], c[0], c[1]]);
      }
    }
    this.seaEdges = edges;
    const e0 = edges[Math.floor(edges.length / 2)] || [200, 0, 200, 10];
    this.sharkState = { mode: 'patrol', x: e0[0] - 8, z: e0[1], yaw: 0, edge: Math.floor(edges.length / 2), dir: 1, speed: 3 };
  }

  /** The point nearest to (x, z) on the line where the open sea is closed to swimmers: { x, z, d }. */
  _nearestEdge(x, z) {
    const out = (this._edge ||= { x: 0, z: 0, d: 0 });
    out.d = Infinity;
    for (const [ax, az, bx, bz] of this.seaEdges) {
      const dx = bx - ax, dz = bz - az;
      let t = ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (d < out.d) { out.d = d; out.x = ax + dx * t; out.z = az + dz * t; }
    }
    return out;
  }

  /** Distance from (x, z) to where the open sea is closed to swimmers. */
  seaEdgeDistance(x, z) { return this._nearestEdge(x, z).d; }

  _tickShark(dt, time, player) {
    const s = this.sharkState, p = player.pos, mesh = this.shark;
    if (!this.seaEdges.length) { mesh.visible = false; return; }
    const far = this.seaEdgeDistance(p.x, p.z);
    mesh.visible = far < 600;
    const inWater = player.swimming && !player.dead;
    if (s.mode !== 'chase' && inWater && far < SHARK.near) {
      s.mode = 'chase';
      this.events.note?.('A fin is heading your way. Swim back!');
      if (Math.hypot(p.x - s.x, p.z - s.z) > 60) {
        // it comes in from the open sea, not from the other end of the bay
        const q = this._nearestEdge(p.x, p.z), l = Math.hypot(q.x - p.x, q.z - p.z) || 1;
        s.x = p.x + ((q.x - p.x) / l) * 46; s.z = p.z + ((q.z - p.z) / l) * 46;
        s.yaw = Math.atan2(p.x - s.x, p.z - s.z); s.speed = 6;
      }
    }
    if (s.mode === 'chase' && (!inWater || far > SHARK.far)) s.mode = 'patrol';
    let tx, tz, speed;
    if (s.mode === 'chase') { tx = p.x; tz = p.z; speed = 9.5; }
    else {
      // up and down along the edge of the playable sea, a few metres inside it
      const e = this.seaEdges[s.edge], ex = s.dir > 0 ? e[2] : e[0], ez = s.dir > 0 ? e[3] : e[1];
      tx = ex; tz = ez; speed = 3.2;
      if (Math.hypot(tx - s.x, tz - s.z) < 4) { s.edge += s.dir; if (s.edge < 0 || s.edge >= this.seaEdges.length) { s.dir = -s.dir; s.edge += s.dir; } }
    }
    const want = Math.atan2(tx - s.x, tz - s.z);
    let d = want - s.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    s.yaw += d * Math.min(1, dt * (s.mode === 'chase' ? 4 : 1.5));
    s.speed += (speed - s.speed) * Math.min(1, dt * 2);
    s.x += Math.sin(s.yaw) * s.speed * dt; s.z += Math.cos(s.yaw) * s.speed * dt;
    mesh.position.set(s.x, -0.62 + Math.sin(time * 1.3) * 0.05, s.z);
    mesh.rotation.y = s.yaw + Math.sin(time * (3 + s.speed * 0.5)) * 0.09;
    if (s.mode === 'chase' && Math.hypot(p.x - s.x, p.z - s.z) < 1.7) {
      s.mode = 'patrol';
      this.world.ripples.splash(time, p.x, 0, p.z, 10);
      player.die('Eaten by the shark', [46, 6, -Math.PI / 2], 0.5);
    }
  }

  _add(parts, name) {
    const g = parts.toMeshes(this.world.materials, { name, layers: this.cast });
    g.updateMatrixWorld(true);
    this.group.add(g);
    (this._static ||= []).push(g);
  }

  /** Merge what never moves; call once everything is built. */
  finish() {
    this.group.add(mergeStatic(this._static, 'games'));
    this.group.updateMatrixWorld(true);
    this.group.traverse((o) => { if (o.isMesh && /^games:/.test(o.name)) o.layers.disable(LAYER.REFLECT); });
    this._cull = distanceCuller(this.group, [[/^games:rock$/, 700], [/^games:/, 320], [/^acid$/, 120]]);
    return this;
  }

  update(dt, time, camera) {
    const player = this.world.player;
    if (player) {
      this._tickClimb(dt, player);
      this._tickBoulder(player, Date.now());
      this._tickShark(dt, time, player);
      const a = this.acid, p = player.pos;
      if (!player.dead && (p.x - a.x) ** 2 + (p.z - a.z) ** 2 < a.r * a.r && p.y < a.y + 0.1) player.die('Dissolved in acid', [a.x + a.r + 7, a.z + 3, -Math.PI / 2], 0.4);
      this.booths.update(dt, time, p, camera);
      this.wing.update(dt, time, p);
      this.race.update?.(p);
      this.notices.update(p, time);
    }
    if (camera) this._cull(camera.position);
  }
}
