// The booths of the pier. Four stand at the pier head, on either side of the big wheel — each a game of some
// forty-five seconds played from its counter, with a pointer (the mouse, a finger): Bullseye Alley (a shooting
// gallery whose targets speed up), Whack-a-Mole, Feed the Clown (a jet of milk to keep in a mouth that will not
// stay still) and Ring the Bell (the high striker). Six more line the walk that leads there (their games are
// in Stalls.js). Each has its board of scores and its sponsor's panel; the backdrop of the shooting gallery is
// a sponsor's tarp too; and over each a great arrow of running lights says where to play.
//
// Nothing here knows about the keyboard, the camera or the network: the game (main.js) opens a session, gives
// it every frame where the pointer aims (a ray) and whether it is pressed, and reads its score at the end.
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';
import { distanceCuller } from '../../props/StaticBatch.js';
import { PIER, pierToWorld } from '../../layout/layout.js';
import { canvasBoard, drawSponsor } from './Boards.js';
import { V, lerp, clamp01, HALF, BACK, FRONT, WHITE, WOOD, geometry, disc, sessionOf, packLog, STEP_MIN, STEP_MAX, seedWait } from './kit.js';
import { STALLS, STALL_GAMES } from './Stalls.js';
import { PIER_BOOTHS, PIER_GAMES, STRIKE } from './PierGames.js';

/** Every booth: the four of the pier head (PierGames.js), the six of the walk (Stalls.js). */
export const BOOTHS = [...PIER_BOOTHS, ...STALLS];

// The arrow of lights over a booth, in the plane that faces whoever walks along the pier (x = 0 in the frame of
// the booth): it hangs from a mast behind the booth and points down at the counter. [y, z] of its outline:
// the tail, the shaft, the head.
const ARROW = (() => {
  const tail = [5.95, -0.3], a = 35 * (Math.PI / 180), dir = [-Math.cos(a), Math.sin(a)], nor = [Math.sin(a), Math.cos(a)];
  const at = (u, v) => [tail[0] + dir[0] * u + nor[0] * v, tail[1] + dir[1] * u + nor[1] * v];
  const shape = (grow) => [at(-grow, 0.34 + grow), at(1.55 - grow * 0.4, 0.34 + grow), at(1.55 - grow * 0.4, 0.8 + grow * 1.6), at(2.65 + grow * 1.5, 0), at(1.55 - grow * 0.4, -0.8 - grow * 1.6), at(1.55 - grow * 0.4, -0.34 - grow), at(-grow, -0.34 - grow)];
  return { tail, outer: shape(0.1), inner: shape(0), rim: shape(0.05) };
})();
export { STRIKE };
const PIER_MID = pierToWorld(PIER.length * 0.55, 0);

export class Booths {
  /** @param zone the games zone (its world, its group, its colliders, its score stands) */
  constructor(zone) {
    this.zone = zone;
    this.world = zone.world;
    this.group = new THREE.Group();
    this.group.name = 'booths';
    this.list = [];
    this.session = null;
    this._m = new THREE.Matrix4();
    this._o = new THREE.Vector3();
    this._d = new THREE.Vector3();
  }

  build() {
    const mats = this.world.materials, y = PIER.deckY;
    for (const def of BOOTHS) {
      const [ox, oz] = pierToWorld(def.along, def.side), yaw = -PIER.heading + (def.side > 0 ? Math.PI : 0);
      const g = new THREE.Group();
      g.position.set(ox, y, oz);
      g.rotation.y = yaw;
      const parts = new Parts();
      this._shell(parts, def);
      const booth = { ...def, x: ox, y, z: oz, yaw, group: g, dyn: new THREE.Group(), game: null };
      g.add(booth.dyn);
      booth.bulbs = this._mesh(booth, geometry((b) => { for (let k = 1; k < 16; k += 2) b.tint(1.0, 0.86, 0.5, 1).place(-HALF + 0.1 + k * ((HALF * 2 - 0.2) / 16), 2.9, FRONT + 0.09).lathe([[0.0, -0.06], [0.055, 0.0], [0.0, 0.06]], 6).pop(); }, 'glow'), 'bulbs', 'glow');
      booth.game = (PIER_GAMES[def.id] || STALL_GAMES[def.id])(parts, booth, (geo, name, material) => this._mesh(booth, geo, name, material), this._more(booth));
      this._arrow(parts, def);
      const shell = parts.toMeshes(mats, { name: `booth-${def.id}`, layers: this.zone.cast });
      g.add(shell);
      // its name, over the counter
      const sign = canvasBoard(512, 96, (ctx, w, h) => {
        ctx.fillStyle = '#7a1420'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 6; ctx.strokeRect(5, 5, w - 10, h - 10);
        ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = "700 58px Georgia, 'Times New Roman', serif";
        ctx.fillText(def.name.toUpperCase(), w / 2, h / 2 + 3, w - 30);
      }, 4.6, 0.86, { both: true }); // (read from behind too: from the walk on the other side, from the wheel)
      // (the striker has no roof to carry it: its name is on the back wall, beside the tower)
      if (def.id === 'bell') { sign.mesh.scale.set(0.76, 0.76, 1); sign.mesh.position.set(1.0, 3.48, BACK + 0.03); } else sign.mesh.position.set(0, 3.42, FRONT + 0.77);
      sign.mesh.name = `booth-${def.id}:sign`;
      g.add(sign.mesh);
      this.group.add(g);
      g.updateMatrixWorld(true);
      booth.inverse = new THREE.Matrix4().copy(g.matrixWorld).invert();
      const world = (lx, lz) => { const v = V(lx, 0, lz).applyMatrix4(g.matrixWorld); return [v.x, v.z]; };
      booth.stand = [...world(0, FRONT + 1.0), yaw + Math.PI]; // where one plays from, looking in
      // nobody walks into a booth
      const [cx, cz] = world(0, (BACK + FRONT + 0.15) / 2);
      this.zone.colliders.push({ type: 'box', x: cx, z: cz, hw: HALF + 0.12, hl: (FRONT + 0.15 - BACK) / 2 + 0.1, yaw });
      // its board of scores, beside it, and the panel of its sponsor
      const [bx, bz] = world((def.side < 0 ? 1 : -1) * (HALF + 2.1), FRONT - 0.2); // (on the side of the end of the pier)
      booth.board = this.zone.scoreStand(def.id, bx, bz, yaw, { title: def.name.toUpperCase(), sub: def.sub || (def.seconds ? `Most points in ${def.seconds} seconds` : 'The hardest blow of three, out of 9,999'), format: def.format || ((s) => String(s)), width: 2.7, y, pixels: 0.75 });
      this.list.push(booth);
    }
    // the lights of the arrows: a bulb every hand along each outline, in three sets lit in turn — they run round
    // the arrow (three meshes for all the booths together)
    {
      const sets = [0, 1, 2].map(() => new Parts());
      for (const b of this.list) {
        const pts = ARROW.rim, ax = b.id === 'bell' ? 2.3 : 0;
        let k = 0;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i], q = pts[(i + 1) % pts.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(1, Math.round(len / 0.27));
          for (let j = 0; j < n; j++, k++) {
            const glow = sets[k % 3].get('glow');
            glow.place(b.x, b.y, b.z, b.yaw).tint(1.0, 0.9, 0.55, 1).place(ax, lerp(p[0], q[0], j / n), lerp(p[1], q[1], j / n)).lathe([[0.0, -0.085], [0.075, 0.0], [0.0, 0.085]], 5).pop().pop();
          }
        }
      }
      this.arrows = sets.map((parts, i) => { const m = new THREE.Mesh(parts.get('glow').build(), mats.glow); m.name = `booths:arrows${i}`; m.frustumCulled = false; this.group.add(m); return m; });
    }
    this.group.updateMatrixWorld(true);
    this._cull = distanceCuller(this.group, [[/:sign$/, 220], [/^booth-\w+:(glow|doubleSided)$/, 300], [/^booth-/, 480]]);
    return this;
  }

  // The shell of a booth: a plank floor, a counter with a striped front between two turned posts, striped
  // walls, a back wall, a striped roof with a scalloped valance, a row of light bulbs, prizes hung under the
  // beam, pennants on the ridge.
  _shell(parts, def) {
    const paint = parts.get('paint'), cloth = parts.get('doubleSided'), wood = parts.get('woodDark'), glow = parts.get('glow'), c = def.color;
    const dark = [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5], GOLD = [1.5, 1.05, 0.25];
    // the counter: a thick top, a front of stripes between two gold lines, a star on every other stripe
    wood.tint(WOOD[0], WOOD[1], WOOD[2], 1).box(-HALF - 0.08, 1.0, FRONT - 0.55, HALF + 0.08, 1.08, FRONT + 0.2, { tile: 1 });
    for (let s = 0; s < 12; s++) { const k = s % 2 ? WHITE : c; paint.tint(k[0], k[1], k[2], 1).box(-HALF + s * 0.5, 0.1, FRONT - 0.06, -HALF + (s + 1) * 0.5, 0.92, FRONT, { faces: 'Z' }); }
    paint.tint(GOLD[0], GOLD[1], GOLD[2], 1).box(-HALF, 0.92, FRONT - 0.06, HALF, 1.0, FRONT + 0.015, { faces: 'ZY' }).box(-HALF, 0, FRONT - 0.06, HALF, 0.1, FRONT + 0.015, { faces: 'ZY' });
    for (let s = 1; s < 12; s += 2) {
      const pts = [];
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.07 : 0.17; pts.push(V(-HALF + (s + 0.5) * 0.5 + Math.cos(a) * r, 0.51 + Math.sin(a) * r, FRONT + 0.006)); }
      paint.tint(c[0] * 1.1, c[1] * 1.1, c[2] * 1.1, 1);
      for (let i = 0; i < 10; i++) paint.tri(V(-HALF + (s + 0.5) * 0.5, 0.51, FRONT + 0.006), pts[i], pts[(i + 1) % 10]);
    }
    paint.tint(dark[0], dark[1], dark[2], 1).box(-HALF, 0, FRONT - 0.5, HALF, 1.0, FRONT - 0.06, { faces: 'zY' });
    // the walls: striped outside, dark inside; the back wall
    for (const g of [-1, 1]) {
      for (let s = 0; s < 10; s++) { const k = s % 2 ? WHITE : c, z0 = BACK + s * 0.5; paint.tint(k[0], k[1], k[2], 1).box(g * HALF + (g > 0 ? 0.03 : -0.05), 0, z0, g * HALF + (g > 0 ? 0.05 : -0.03), 2.95, z0 + 0.5, { faces: g > 0 ? 'X' : 'x' }); }
      paint.tint(dark[0], dark[1], dark[2], 1).box(g * HALF - 0.03, 0, BACK, g * HALF + 0.03, 2.95, FRONT, { faces: g > 0 ? 'xZ' : 'XZ' });
    }
    paint.tint(dark[0], dark[1], dark[2], 1).box(-HALF, 0, BACK - 0.08, HALF, 3.1, BACK, { faces: 'zZ' });
    // two turned posts at the corners of the counter, banded like barley sugar, a gold ball on each
    for (const px of [-HALF, HALF]) {
      for (let k = 0; k < 8; k++) { const b = k % 2 ? WHITE : c; paint.tint(b[0], b[1], b[2], 1).cylinder(px, 1.08 + k * 0.234, FRONT, 0.085, 0.085, 0.234, 8, { capTop: false, capBottom: false }); }
      paint.tint(GOLD[0], GOLD[1], GOLD[2], 1).place(px, 3.05, FRONT).lathe([[0.0, 0.0], [0.13, 0.05], [0.15, 0.15], [0.09, 0.26], [0.0, 0.3]], 8).pop();
      glow.tint(1.0, 0.8, 0.45, 1).place(px, 1.08, FRONT + 0.26).lathe([[0.0, 0.0], [0.1, 0.03], [0.12, 0.16], [0.07, 0.26], [0.0, 0.28]], 7).pop(); // a lamp on the counter
    }
    wood.tint(WOOD[0], WOOD[1], WOOD[2], 1).box(-HALF - 0.1, 2.93, FRONT - 0.07, HALF + 0.1, 3.05, FRONT + 0.07, { tile: 1 });
    // light bulbs along the beam (every other one blinks: see update())
    for (let k = 0; k <= 16; k += 2) glow.tint(1.0, 0.86, 0.5, 1).place(-HALF + 0.1 + k * ((HALF * 2 - 0.2) / 16), 2.9, FRONT + 0.09).lathe([[0.0, -0.06], [0.055, 0.0], [0.0, 0.06]], 6).pop();
    // prizes hung under the beam: bears, ducks, rabbits
    const TOYS = [[0.55, 0.36, 0.2], [1.5, 1.2, 0.2], [1.3, 1.25, 1.2], [1.3, 0.5, 0.65], [0.3, 0.55, 1.2]];
    for (let k = 0; k < 7; k++) {
      if (k > 1 && k < 5) continue; // (none in the middle: that is where one looks through)
      const x = -HALF + 0.55 + k * ((HALF * 2 - 1.1) / 6), t = TOYS[k % TOYS.length], y = 2.52 - (k % 2) * 0.12;
      wood.tint(0.9, 0.85, 0.7, 1).box(x - 0.008, y + 0.2, FRONT - 0.2, x + 0.008, 2.93, FRONT - 0.184);
      paint.tint(t[0], t[1], t[2], 1).place(x, y, FRONT - 0.19, 0.3 * (k % 3 - 1));
      paint.lathe([[0.0, -0.2], [0.12, -0.16], [0.14, -0.02], [0.08, 0.06]], 7).lathe([[0.07, 0.04], [0.11, 0.1], [0.1, 0.2], [0.0, 0.24]], 7); // body, head
      for (const g of [-1, 1]) paint.box(g * 0.09 - 0.035, k % 5 === 2 ? 0.18 : 0.17, -0.02, g * 0.09 + 0.035, k % 5 === 2 ? 0.38 : 0.25, 0.02).box(g * 0.14 - 0.03, -0.1, -0.03, g * 0.14 + 0.03, 0.0, 0.03); // ears, arms
      paint.tint(0.03, 0.03, 0.03, 1).box(-0.045, 0.13, 0.085, -0.02, 0.155, 0.1).box(0.02, 0.13, 0.085, 0.045, 0.155, 0.1);
      paint.pop();
    }
    if (def.id === 'bell') return;
    // the roof: stripes from the eaves in front up to the ridge and down to the back, a scalloped valance
    // edged with gold, pennants along the ridge
    const N = 14, x0 = -HALF - 0.35, step = (HALF * 2 + 0.7) / N;
    for (let s = 0; s < N; s++) {
      const k = s % 2 ? WHITE : c, a = x0 + s * step, b = a + step;
      cloth.tint(k[0] * 1.1, k[1] * 1.1, k[2] * 1.1, 1);
      cloth.quad(V(a, 2.9, FRONT + 0.75), V(b, 2.9, FRONT + 0.75), V(b, 3.85, -1.3), V(a, 3.85, -1.3));
      cloth.quad(V(b, 3.1, BACK - 0.15), V(a, 3.1, BACK - 0.15), V(a, 3.85, -1.3), V(b, 3.85, -1.3));
      cloth.tri(V(a, 2.9, FRONT + 0.75), V((a + b) / 2, 2.6, FRONT + 0.75), V(b, 2.9, FRONT + 0.75));
      cloth.tint(GOLD[0], GOLD[1], GOLD[2], 1).tri(V((a + b) / 2 - 0.06, 2.63, FRONT + 0.752), V((a + b) / 2, 2.53, FRONT + 0.752), V((a + b) / 2 + 0.06, 2.63, FRONT + 0.752));
      const p = s % 2 ? c : GOLD;
      cloth.tint(p[0] * 1.15, p[1] * 1.15, p[2] * 1.15, 1).tri(V(a + 0.06, 3.87, -1.3), V(b - 0.06, 3.87, -1.3), V((a + b) / 2, 4.22 + 0.1 * (s % 3), -1.3));
    }
    cloth.tint(c[0], c[1], c[2], 1);
    for (const g of [-1, 1]) cloth.tri(V(g * (HALF + 0.35), 2.9, FRONT + 0.75), V(g * (HALF + 0.35), 3.1, BACK - 0.15), V(g * (HALF + 0.35), 3.85, -1.3));
  }

  // The arrow over a booth: a mast behind it, an arm, and the arrow itself — gold round a field of the colour
  // of the booth, seen from both ways along the pier (its lights are built with those of the others: see build).
  _arrow(parts, def) {
    const paint = parts.get('paint'), cloth = parts.get('doubleSided'), c = def.color, x = def.id === 'bell' ? 2.3 : 0;
    const P = ([y, z], dx = 0) => V(x + dx, y, z);
    const fill = (shape, dx) => { cloth.poly([P(shape[0], dx), P(shape[1], dx), P(shape[5], dx), P(shape[6], dx)]).poly([P(shape[2], dx), P(shape[3], dx), P(shape[4], dx)]); };
    cloth.tint(1.5, 1.05, 0.2, 1); fill(ARROW.outer, 0);
    cloth.tint(c[0] * 1.25, c[1] * 1.25, c[2] * 1.25, 1); fill(ARROW.inner, 0.014); fill(ARROW.inner, -0.014);
    // the mast, the arm that carries the arrow, a stay
    const top = V(x, 6.45, BACK - 0.2), tail = P(ARROW.tail);
    paint.tint(0.93, 0.93, 0.9, 1).rod(V(x, 0, BACK - 0.2), top, 0.075, 6).rod(top, V(x, tail.y + 0.3, tail.z + 0.5), 0.05, 5).rod(V(x, 5.1, BACK - 0.2), V(x, tail.y - 0.2, tail.z - 0.1), 0.035, 5);
    paint.tint(1.5, 1.05, 0.25, 1).place(top.x, top.y, top.z).lathe([[0.0, 0.0], [0.13, 0.08], [0.0, 0.3]], 7).pop();
  }

  /** Something that moves in a booth (its targets, its moles…): kept apart from what stands still. */
  // What a game may need besides plain meshes (PierGames.js): a pool of instances, a mesh whose points change
  // every frame, matrices to place instances with — and, for the shooting gallery, its backdrop.
  _more(booth) {
    const add = (m, name) => { m.name = `moving-${booth.id}:${name}`; m.frustumCulled = false; booth.dyn.add(m); return m; };
    return {
      pool: (geo, n, name, material = 'paint') => add(new THREE.InstancedMesh(geo, this.world.materials[material], n), name),
      dynamic: (geo, name, material = 'paint') => { geo.attributes.position.setUsage(THREE.DynamicDrawUsage); return add(new THREE.Mesh(geo, this.world.materials[material]), name); },
      M4: () => new THREE.Matrix4(), Q: () => new THREE.Quaternion(), E: () => new THREE.Euler(),
      backdrop: () => this._backdrop(booth),
    };
  }

  // The backdrop of the shooting gallery: a sponsor's tarp.
  _backdrop(booth) {
    const state = { sponsor: null };
    const tarp = canvasBoard(1024, 400, (ctx, w, h) => drawSponsor(ctx, w, h, state.sponsor, { what: 'this backdrop' }), 5.7, 2.2);
    tarp.mesh.position.set(0, 2.0, BACK + 0.03);
    tarp.mesh.name = 'booth-shoot:tarp';
    booth.group.add(tarp.mesh);
    const [sx, sz] = pierToWorld(booth.along, booth.side + 2.6);
    (this.world.sponsorSlots ||= []).push({ id: 'tarp:shoot', what: 'the backdrop of the shooting gallery', x: sx, y: booth.y, z: sz, reach: 3, set: (sp) => { state.sponsor = sp; tarp.redraw(); } });
  }

  _mesh(booth, geo, name, material = 'paint') {
    const m = new THREE.Mesh(geo, this.world.materials[material]);
    m.name = `moving-${booth.id}:${name}`;
    booth.dyn.add(m);
    return m;
  }





  // ---------------------------------------------------------------------------

  /** The booth at whose counter (x, z) stands, or null. */
  near(x, z) {
    for (const b of this.list) {
      const dx = x - b.stand[0], dz = z - b.stand[1];
      if (dx * dx + dz * dz < 2.4 * 2.4) return b;
    }
    return null;
  }

  /**
   * A game starts at a booth. `io`: { play(sound, options), note(text), strike() }; `seeded`: a promise of the
   * seed the server drew for this run (none, or one that never comes: the device's own dice — the game then
   * cannot be played again by the server). Returns the session: { booth, view: { pos, look, fov } (in the
   * world), firstPerson, crosshair, step(dt, time, aim), over, score, line (what the clock of the screen says),
   * gauge (0 to 1, or null), log() (every step that was taken, for the server — null when there is no seed),
   * close() }. `aim`: { origin, dir (in the world), clicks, down }.
   * The game is stepped by the clock it shares with the server (core.js): with the direction of the pointer in
   * the frame of the booth, 75 times a second at the most, each step written down as it is taken.
   */
  open(booth, io, seeded = null) {
    const game = booth.game, g = booth.group, d = this._d;
    let core = null, seed, held = 0, clicks = 0;
    const begin = (given) => { if (core) return; seed = Number.isInteger(given) ? given : undefined; core = sessionOf(booth, game, seed); };
    const session = {
      booth, firstPerson: game.firstPerson, crosshair: game.crosshair, over: false, score: 0, gauge: null, line: `${booth.name} · get ready…`,
      view: { pos: V(...game.view.pos).applyMatrix4(g.matrixWorld), look: V(...game.view.look).applyMatrix4(g.matrixWorld), fov: game.view.fov },
      t: booth.seconds ? -3 : 0, // the count before the game (the striker needs none)
      step: (dt, time, aim) => {
        if (session.over || !core) return; // (not before the server has said which seed: a moment)
        clicks += aim.clicks;
        held += Math.min(dt, STEP_MAX);
        if (held < STEP_MIN) return; // (a faster screen shows the same step twice)
        d.copy(aim.dir).transformDirection(booth.inverse);
        core.tick(held, d.x, d.y, d.z, clicks, aim.down, true, io);
        held = 0; clicks = 0;
        session.t = core.t; session.over = core.over; session.score = core.score; session.gauge = core.gauge; session.line = core.line;
      },
      log: () => (core && seed !== undefined ? packLog(core.words) : null),
      close: () => { if (this.session === session) this.session = null; game.reset(); },
    };
    this.session = session;
    // (a promise: the server is drawing the seed — a moment, a few seconds at the most; else at once)
    if (typeof seeded?.then === 'function') { seeded.then(begin, () => begin()); setTimeout(begin, seedWait()); } else begin(seeded);
    return session;
  }

  /** Every frame: the booths nobody plays at idle along, when somebody is near enough to see. */
  update(dt, time, pos, camera) {
    if (camera) this._cull(camera.position);
    { const near = (pos.x - PIER_MID[0]) ** 2 + (pos.z - PIER_MID[1]) ** 2 < 330 * 330, lit = Math.floor(time * 7) % 3; this.arrows.forEach((m, i) => { m.visible = near && i === lit; }); }
    for (const b of this.list) {
      const d2 = (pos.x - b.x) ** 2 + (pos.z - b.z) ** 2;
      b.dyn.visible = d2 < 70 * 70;
      b.bulbs.visible = Math.floor(time * 2.2 + b.along) % 2 === 0;
      if ((this.session && this.session.booth === b) || d2 > 45 * 45) continue;
      b.game.step(dt, -1, time, null, null);
    }
  }
}
