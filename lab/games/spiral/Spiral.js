// A Turn for the Worse: what is seen of it and how it is run. Its rules are in rules.js; here the tower is built
// — a striped tower on a rock in the sea, the gallery of planks that winds up round it nineteen times, its rails
// and its bulbs, what stands in the way and what moves, a pointed roof and a bell — and a run is a session that
// drives the player (see PlayerController.driver): the legs do what the stick asks — up, they run; let go, they
// stop —, and the camera rides behind, as one piece with the runner: it stops when the runner stops. What moves
// is drawn from the clock of the world: everybody sees the same.
//
// What stands in the way says what it asks by its paint: yellow and black is jumped, red and white is slid
// under, navy and cream is gone round (or through), and a crate is jumped onto (a blue band: one jump; a red
// band: two; a gold band: three). A plank that gives way is pale, its ends marked in yellow; a springboard is
// gold; a belt is black, its slats running down; the wind shows in streamers.
//
// The tower is long: what never moves is merged into a few meshes; what moves is drawn as instances, one draw
// for each kind, and only near the camera (a turn and a half up and down); only the gallery near it casts shadows.
import * as THREE from 'three';
import { Parts } from '../../../src/world/props/MeshBuilder.js';
import { LAYER } from '../../../src/render/Shadows.js';
import { ANIM } from '../../../src/player/Character.js';
import { canvasBoard } from '../../../src/world/zones/games/Boards.js';
import { formatTime } from '../../../src/world/zones/games/course.js';
import { V, clamp, worldClock, gateArch } from '../kit.js';
import { SPIRAL, TURN, LENGTH, LANDINGS, course, trackY, slopeAt, spiralAt, floorAt, startRun, stepRun, botInput, millAngle, stompAt, stompSoon, hammerAt, barrelsOf, heightOf, turnOf, liftAt, gustAt, doorAt, cannonAt, ramAt, trolleysOf, trodAt } from './rules.js';

const S = SPIRAL, C = S.at, H = S.half, TAU = Math.PI * 2;
const DECK = 0.24; // how thick the gallery is
const CREAM = [1.3, 1.17, 0.9], RED = [0.95, 0.1, 0.12], GOLD = [1.5, 1.05, 0.2], NAVY = [0.07, 0.09, 0.26], YELLOW = [1.65, 1.3, 0.1], BLACK = [0.05, 0.05, 0.06], WHITE = [1.45, 1.42, 1.36], BLUE = [0.12, 0.42, 1.1];
const WHY = { hole: 'Down a hole!', low: 'A hurdle across the shins!', high: 'Head first into a board!', fence: 'Straight into a fence!', crate: 'Flat against a crate!', mill: 'Caught by the mill!', stomp: 'Stomped!', hammer: 'Hammered!', barrel: 'Bowled over by a barrel!', lift: 'Caught by the bar!', door: 'Into the wall — the door was elsewhere!', cannon: 'Hit by a cannon ball!', trolley: 'Swept off by a board!', ram: 'Rammed!' };
const NEAR = 1.4 * TURN; // (what moves is drawn only so far along the track from the camera)

/** A point about the tower: at angle `a`, `r` metres from its middle, `y` over the sea. */
const pol = (a, r, y) => V(C.x + Math.cos(a) * r, y, C.z + Math.sin(a) * r);
/** A point of the track: metre `s`, `u` across, `up` over its planks. */
const at = (s, u = 0, up = 0) => pol(S.from - s / S.r, S.r + u, trackY(s) + up);
const angleOf = (s) => S.from - s / S.r;
const _o = new THREE.Object3D(), _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
/** Puts `_o` on the track at metre `s`, `u` across, `up` over the planks: its +x up the track, +z towards the rail; tilted with the planks if asked. */
const pose = (s, u = 0, up = 0, tilt = false) => { _o.position.copy(at(s, u, up)); _o.rotation.set(0, Math.PI / 2 - angleOf(s), tilt ? Math.atan(slopeAt(s)) : 0, 'YZX'); _o.scale.set(1, 1, 1); return _o; };

export class Spiral {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'spiral';
    this.session = null;
    this.best = 0;
    this.focus = 0; // (the metre of track the camera is about: what moves is drawn near it)
    /** The clock everybody shares (ms): what moves on the track is counted on it. */
    this.clock = worldClock;
  }

  build() {
    const world = this.world, mats = world.materials, core = new Parts();
    // (what never moves is merged in pieces of three turns each: a piece out of sight of a camera is not drawn for it)
    const chunks = Array.from({ length: Math.ceil(S.turns / 3) }, () => new Parts());
    let paint, deck, dark, glow;
    /** The builders of the piece that holds metre `s`. */
    const chunk = (s) => { const p = chunks[clamp(Math.floor(s / (3 * TURN)), 0, chunks.length - 1)]; paint = p.get('paint'); deck = p.get('woodDeck'); dark = p.get('woodDark'); glow = p.get('glow'); };
    chunk(0);
    const { things, bare } = course(), top = trackY(LENGTH), roofY = top + 5.4;
    const of = (kind) => things.filter((t) => t.kind === kind);

    // ---- the rock it stands on, the tower, its roof: what casts a shadow and shows in the sea
    {
      // (a plinth of dressed stone, standing on the bed of the bay: two drums, the sea at its foot)
      const stone = core.get('stoneWet'), wall = core.get('paint');
      stone.tint(0.95, 0.93, 0.9, 1).cylinder(C.x, -7.8, C.z, S.r + H + 2.9, S.r + H + 1.5, 8.6, 28, { capTop: true });
      stone.tint(1.05, 1.02, 0.98, 1).cylinder(C.x, 0.8, C.z, S.r + H + 0.7, S.r + H + 0.5, 1.9, 28, { capTop: true });
      // the wall: stripes from the rock to the roof; a navy band at each landing
      const M = 48, y0 = 1.4;
      for (let k = 0; k < M; k++) {
        const a0 = (k / M) * TAU, a1 = ((k + 1) / M) * TAU, red = Math.floor(k / 2) % 2 === 0;
        wall.tint(...(red ? [0.86, 0.13, 0.11] : [1.42, 1.3, 1.02]), 1).quad(pol(a1, S.core, y0), pol(a0, S.core, y0), pol(a0, S.core, roofY), pol(a1, S.core, roofY));
      }
      wall.tint(...NAVY, 1).cylinder(C.x, y0, C.z, S.core + 0.35, S.core + 0.2, 1.3, 32, { capTop: false });
      for (const a of LANDINGS) wall.tint(...GOLD, 1).cylinder(C.x, trackY(a) + 3.4, C.z, S.core + 0.06, S.core + 0.06, 0.35, 32, { capTop: false });
      wall.tint(...GOLD, 1).cylinder(C.x, roofY - 0.5, C.z, S.core + 0.25, S.core + 0.55, 0.5, 32, { capTop: false });
      // the roof: a pointed hat in sixteen gores, a ball, a flag
      const R = [[S.core + 2.4, roofY - 0.2], [S.core + 0.6, roofY + 2.4], [2.6, roofY + 5.6], [0.9, roofY + 8.4], [0.02, roofY + 9.8]], G = 16;
      for (let j = 0; j + 1 < R.length; j++) for (let k = 0; k < G; k++) {
        const a0 = (k / G) * TAU, a1 = ((k + 1) / G) * TAU;
        wall.tint(...(k % 2 ? CREAM : NAVY), 1).quad(pol(a1, R[j][0], R[j][1]), pol(a0, R[j][0], R[j][1]), pol(a0, R[j + 1][0], R[j + 1][1]), pol(a1, R[j + 1][0], R[j + 1][1]));
      }
      wall.tint(...NAVY, 1).cylinder(C.x, roofY - 0.2, C.z, S.core + 0.5, S.core + 2.4, 0.01, G, { capTop: false }); // (closed from below)
      wall.tint(...GOLD, 1).place(C.x, roofY + 9.9, C.z).lathe([[0.01, -0.34], [0.3, -0.2], [0.36, 0], [0.3, 0.2], [0.01, 0.34]], 10).pop();
      wall.tint(...CREAM, 1).cylinder(C.x, roofY + 10.1, C.z, 0.045, 0.04, 3.1, 6);
      const fa = S.from + 0.5, f0 = V(C.x, roofY + 13.1, C.z), fx = Math.cos(fa), fz = Math.sin(fa);
      for (const flip of [1, -1]) { const p = [f0, V(f0.x + fx * 2.2, f0.y - 0.45, f0.z + fz * 2.2), V(f0.x, f0.y - 0.9, f0.z)]; wall.tint(...RED, 1).tri(...(flip > 0 ? p : [p[0], p[2], p[1]])); }
      const m = core.toMeshes(mats, { name: 'spiral-tower', layers: [LAYER.STATIC_CASTER, LAYER.REFLECT] });
      this.group.add(m);
    }

    // ---- the gallery: planks from below the foot to the bell, missing where the course says so (and where a
    // plank that gives way is: those are drawn apart, they fall)
    const holes = of('hole'), crumbles = of('crumble'), gaps = [...holes, ...crumbles], S0 = -3.6, S1 = LENGTH + 3.2;
    const landing = (s) => LANDINGS.some((a) => s >= a && s <= a + S.land);
    const cuts = [];
    for (let s = S0; s < S1; s += 0.75) cuts.push(s);
    cuts.push(S1);
    for (const h of gaps) cuts.push(h.s0, h.s1);
    for (const a of LANDINGS) cuts.push(a, a + S.land);
    cuts.sort((a, b) => a - b);
    const marks = cuts.filter((s, i) => i === 0 || s - cuts[i - 1] > 0.04);
    for (let i = 0; i + 1 < marks.length; i++) {
      const sa = marks[i], sb = marks[i + 1], mid = (sa + sb) / 2;
      chunk(mid);
      // what is left of the width there
      let spans = [[-H, H]];
      for (const h of gaps) if (mid > h.s0 && mid < h.s1) spans = spans.flatMap(([a, b]) => (h.u1 <= a || h.u0 >= b ? [[a, b]] : [[a, Math.min(b, h.u0)], [Math.max(a, h.u1), b]].filter(([p, q]) => q - p > 0.02)));
      for (const [u0, u1] of spans) {
        const narrow = u1 - u0 < 2 * H - 0.1, tone = narrow ? [1.5, 1.32, 0.95] : landing(mid) ? [1.4, 1.28, 1.08] : [1.16, 1.06, 0.9];
        deck.tint(...tone, 1).quad(at(sa, u0), at(sa, u1), at(sb, u1), at(sb, u0), { v0: sa });
        paint.tint(1.02, 0.94, 0.78, 1).quad(at(sa, u1, -DECK), at(sa, u0, -DECK), at(sb, u0, -DECK), at(sb, u1, -DECK));
        // its edges: a painted board along the rail and along the tower side; a cut edge, in yellow
        if (u1 > H - 0.01) paint.tint(...RED, 1).quad(at(sa, H + 0.03, -DECK - 0.12), at(sb, H + 0.03, -DECK - 0.12), at(sb, H + 0.03, 0.05), at(sa, H + 0.03, 0.05));
        else paint.tint(...YELLOW, 1).quad(at(sa, u1, -DECK), at(sb, u1, -DECK), at(sb, u1, 0.002), at(sa, u1, 0.002));
        if (u0 < -H + 0.01) paint.tint(...CREAM, 1).quad(at(sb, -H - 0.03, -DECK - 0.12), at(sa, -H - 0.03, -DECK - 0.12), at(sa, -H - 0.03, 0.05), at(sb, -H - 0.03, 0.05));
        else paint.tint(...YELLOW, 1).quad(at(sb, u0, -DECK), at(sa, u0, -DECK), at(sa, u0, 0.002), at(sb, u0, 0.002));
      }
    }
    for (const h of holes) {
      chunk(h.s0);
      // the two ends of a hole: the cut of the planks, in yellow — the far one is what who runs sees of it —, and
      // a band of yellow and black on the planks before it
      paint.tint(...YELLOW, 1).quad(at(h.s0, h.u0, -DECK), at(h.s0, h.u0), at(h.s0, h.u1), at(h.s0, h.u1, -DECK));
      paint.tint(...YELLOW, 1).quad(at(h.s1, h.u1, -DECK), at(h.s1, h.u1), at(h.s1, h.u0), at(h.s1, h.u0, -DECK));
      if (h.form === 'rope') continue; // (beside a plank a foot wide: nothing to mark)
      const n = Math.max(2, Math.round((h.u1 - h.u0) / 0.4));
      for (let k = 0; k < n; k++) {
        const a = h.u0 + ((h.u1 - h.u0) * k) / n, b = h.u0 + ((h.u1 - h.u0) * (k + 1)) / n;
        paint.tint(...(k % 2 ? BLACK : YELLOW), 1).quad(at(h.s0 - 0.34, a, 0.012), at(h.s0 - 0.34, b, 0.012), at(h.s0 - 0.02, b, 0.012), at(h.s0 - 0.02, a, 0.012));
      }
    }
    // ---- under the stretches of planks over nothing, a net of dark cloth: against it they show, and the turn below does not
    for (const [s0, s1] of bare) for (let s = s0; s < s1 + 0.5; s += 1.5) {
      chunk(s);
      const e = Math.min(s1 + 0.5, s + 1.5);
      paint.tint(0.035, 0.05, 0.13, 1).quad(at(s, -H, -3.1), at(s, H, -3.1), at(e, H, -3.1), at(e, -H, -3.1));
      paint.tint(0.035, 0.05, 0.13, 1).quad(at(s, H, -3.12), at(s, -H, -3.12), at(e, -H, -3.12), at(e, H, -3.12));
    }
    // ---- what holds it: a beam and a strut from the wall, twelve to a turn
    for (let s = S0 + 0.4; s < S1; s += TURN / 12) {
      chunk(s);
      if (gaps.some((h) => s > h.s0 - 0.2 && s < h.s1 + 0.2)) continue; // (none under a hole: nothing there looks like something to step on)
      const a = angleOf(s), y = trackY(s) - DECK - 0.13;
      dark.tint(1.5, 1.35, 1.15, 1).beam(pol(a, S.core - 0.05, y), pol(a, S.r + H - 0.05, y), 0.15, 0.26);
      dark.tint(1.5, 1.35, 1.15, 1).beam(pol(a, S.core - 0.05, y - 2.3), pol(a, S.r + 0.3, y - 0.1), 0.09, 0.09);
    }
    // ---- the rails: posts and a hand rail by the sea, a lighter one on the tower side; a bulb on every post.
    // None where the track is only planks over nothing
    const rail = (u, high, every, tone, from, to) => {
      let prev = null;
      for (let s = from; s <= to + 1e-6; s += 1.5) { chunk(s); const p = at(Math.min(s, to), u, high); if (prev) paint.tint(...tone, 1).beam(prev, p, 0.075, 0.07); prev = p; }
      for (let s = from; s <= to + 1e-6; s += every) {
        chunk(s);
        if (gaps.some((h) => s > h.s0 - 0.05 && s < h.s1 + 0.05 && h.u0 <= u && h.u1 >= u)) continue; // (no post over a hole)
        const p = at(s, u, 0);
        paint.tint(...CREAM, 1).cube(p.x, p.y + high / 2, p.z, 0.075, high, 0.075);
        if (u > 0) glow.tint(1, 0.95, 0.7, 1).cube(p.x, p.y + high + 0.12, p.z, 0.13, 0.13, 0.13);
      }
    };
    const runs = [];
    { let from = S0; for (const [a, b] of bare) { runs.push([from, a]); from = b + 0.6; } runs.push([from, Math.min(S1, LENGTH - 9)]); }
    for (const [a, b] of runs) { rail(H - 0.07, 1.02, TURN / 24, RED, a, b); rail(-H + 0.07, 0.9, TURN / 12, NAVY, a, b); }
    rail(H - 0.07, 1.02, 1.3, RED, LENGTH + 0.6, S1); rail(-H + 0.07, 0.9, 1.3, NAVY, LENGTH + 0.6, S1);

    // ---- the landings: a painted line across at each end, a flag by the rail
    LANDINGS.forEach((a, i) => {
      chunk(a);
      for (const s of [a + 0.15, a + S.land - 0.15]) {
        const n = 8;
        for (let k = 0; k < n; k++) { const u0 = -H + (2 * H * k) / n, u1 = -H + (2 * H * (k + 1)) / n; paint.tint(...(k % 2 ? GOLD : WHITE), 1).quad(at(s - 0.12, u0, 0.012), at(s - 0.12, u1, 0.012), at(s + 0.12, u1, 0.012), at(s + 0.12, u0, 0.012)); }
      }
      const p = at(a + S.land / 2, H + 0.2), q = V(p.x, p.y + 3.2, p.z), out = at(a + S.land / 2, H + 1.4, 3.2);
      paint.tint(...CREAM, 1).cylinder(p.x, p.y - 0.3, p.z, 0.05, 0.04, 3.6, 6);
      paint.tint(...GOLD, 1).place(q.x, q.y + 0.4, q.z).lathe([[0.01, -0.1], [0.1, 0], [0.01, 0.1]], 8).pop();
      for (const flip of [1, -1]) { const f = [q, V(out.x, q.y - 0.4, out.z), V(q.x, q.y - 0.8, q.z)]; paint.tint(...(i % 2 ? NAVY : RED), 1).tri(...(flip > 0 ? f : [f[0], f[2], f[1]])); }
    });

    // ---- what stands in the way
    /** Builders set on the planks at metre `s`: +z up the track, -x towards the rail (x is -u), y over the planks. */
    const on = (s, fn, ...bs) => { const p = at(s), a = angleOf(s); for (const b of bs) b.place(p.x, p.y, p.z, Math.PI - a, -Math.atan(slopeAt(s))); fn(); for (const b of bs) b.pop(); };
    /** A board from x0 to x1 in bands of two colours. */
    const bands = (x0, x1, y0, y1, z0, z1, a, b, n) => { for (let k = 0; k < n; k++) paint.tint(...(k % 2 ? b : a), 1).box(x0 + ((x1 - x0) * k) / n, y0, z0, x0 + ((x1 - x0) * (k + 1)) / n, y1, z1); };
    const frame = (up, z0, z1, tone) => { for (const x of [-H + 0.05, H - 0.05]) for (const z of [z0, z1]) paint.tint(...tone, 1).box(x - 0.06, 0, z - 0.06, x + 0.06, up, z + 0.06); };
    for (const t of things) {
      chunk(t.s0);
      if (t.kind === 'low') on(t.s, () => {
        const x0 = -t.u1 + 0.04, x1 = -t.u0 - 0.04;
        bands(x0, x1, 0.3, S.bar.low, -0.06, 0.06, YELLOW, BLACK, Math.max(3, Math.round((x1 - x0) / 0.4)));
        for (const x of [x0 + 0.1, x1 - 0.1]) paint.tint(...CREAM, 1).box(x - 0.05, 0, -0.22, x + 0.05, 0.3, 0.22);
      }, paint);
      else if (t.kind === 'high') on(t.s, () => {
        // (a board hung at the height of the head in an open frame: what is beyond it stays in sight)
        const x0 = -t.u1 + 0.05, x1 = -t.u0 - 0.05, up = S.bar.top + 0.1;
        for (const x of [x0, x1]) paint.tint(...CREAM, 1).box(x - 0.05, 0, -0.05, x + 0.05, up, 0.05);
        paint.tint(...GOLD, 1).box(x0 - 0.08, up, -0.07, x1 + 0.08, up + 0.14, 0.07);
        for (const x of [x0 + 0.5, x1 - 0.5]) paint.tint(...CREAM, 1).box(x - 0.02, S.bar.hung, -0.02, x + 0.02, up, 0.02);
        bands(x0 + 0.06, x1 - 0.06, S.bar.high + 0.02, S.bar.hung, -0.05, 0.05, RED, WHITE, Math.max(4, Math.round((x1 - x0) / 0.36)));
      }, paint);
      else if (t.kind === 'fence') on(t.s, () => {
        // (bars one sees through, a yellow rail on top, an arrow of yellow boards pointing at the way round)
        const x0 = -t.u1 + (t.u1 < H ? 0.03 : 0.05), x1 = -t.u0 - (t.u0 > -H ? 0.03 : 0.05), n = Math.round((x1 - x0) / 0.26), top = S.bar.top;
        for (let k = 0; k <= n; k++) { const x = x0 + ((x1 - x0) * k) / n; paint.tint(...(k % 2 ? CREAM : NAVY), 1).box(x - 0.045, 0.02, -0.045, x + 0.045, top - 0.1, 0.045); }
        for (const y of [0.32, top - 0.2]) paint.tint(...NAVY, 1).box(x0, y, -0.03, x1, y + 0.1, 0.03);
        paint.tint(...YELLOW, 1).box(x0 - 0.04, top - 0.1, -0.07, x1 + 0.04, top + 0.05, 0.07);
        const open = t.u0 > -H ? 1 : -1, cx = (x0 + x1) / 2, tip = cx + open * 0.62;
        paint.tint(...YELLOW, 1).box(Math.min(cx - open * 0.55, tip), 1.22, -0.075, Math.max(cx - open * 0.55, tip), 1.44, -0.05);
        for (const dy of [-1, 1]) paint.tint(...YELLOW, 1).beam(V(tip, 1.33, -0.0625), V(tip - open * 0.42, 1.33 + dy * 0.36, -0.0625), 0.025, 0.2);
      }, paint);
      else if (t.kind === 'crate') on((t.s0 + t.s1) / 2, () => {
        const x0 = -t.u1 + 0.03, x1 = -t.u0 - 0.03, l = (t.s1 - t.s0) / 2, band = t.top > 2.2 ? GOLD : t.top > 1.2 ? RED : BLUE, tone = t.top > 1.2 ? [1.12, 0.95, 0.72] : [1.3, 1.12, 0.82];
        deck.tint(...tone, 1).box(x0, 0, -l, x1, t.top, l, { faces: 'xXYzZ' });
        // (bands at its corners and round its top, in the colour of its height; an arrow up on its face)
        for (const [x, z] of [[x0, -l], [x1, -l], [x0, l], [x1, l]]) paint.tint(...band, 1).box(x - 0.045 + (x === x0 ? 0.03 : -0.03), 0, z - 0.045 + (z < 0 ? 0.03 : -0.03), x + 0.045 + (x === x0 ? 0.03 : -0.03), t.top + 0.015, z + 0.045 + (z < 0 ? 0.03 : -0.03));
        paint.tint(...band, 1).box(x0 - 0.015, t.top - 0.16, -l - 0.015, x1 + 0.015, t.top - 0.02, -l + 0.02);
        const cx = (x0 + x1) / 2, ay = t.top * 0.5;
        paint.tint(...YELLOW, 1).box(cx - 0.07, ay - 0.3, -l - 0.02, cx + 0.07, ay + 0.2, -l);
        for (const d of [-1, 1]) paint.tint(...YELLOW, 1).beam(V(cx, ay + 0.34, -l - 0.01), V(cx + d * 0.3, ay + 0.04, -l - 0.01), 0.02, 0.15);
      }, paint, deck);
      else if (t.kind === 'stomp') on((t.s0 + t.s1) / 2, () => {
        // (the frame its two blocks hang in: a post at each rail before and after, a beam over them)
        const l = (t.s1 - t.s0) / 2 + 0.16, up = t.up + 1.5;
        for (const x of [-H + 0.1, H - 0.1]) for (const z of [-l, l]) paint.tint(...NAVY, 1).box(x - 0.06, 0, z - 0.06, x + 0.06, up, z + 0.06);
        for (const z of [-l, l]) paint.tint(...NAVY, 1).box(-H + 0.04, up, z - 0.07, H - 0.04, up + 0.16, z + 0.07);
        for (const x of [-H + 0.1, H - 0.1]) paint.tint(...NAVY, 1).box(x - 0.07, up, -l, x + 0.07, up + 0.16, l);
      }, paint);
      else if (t.kind === 'barrels') on(t.s1, () => {
        // (the hatch the barrels are dropped from, under the gallery above)
        const y1 = t.drop + 1.5 - DECK - 0.2;
        paint.tint(...NAVY, 1).box(-H + 0.15, y1 - 0.7, -0.75, H - 0.15, y1, 0.75);
        bands(-H + 0.15, H - 0.15, y1 - 0.82, y1 - 0.7, -0.78, 0.78, YELLOW, BLACK, 8);
      }, paint);
      else if (t.kind === 'spring') on((t.s0 + t.s1) / 2, () => {
        // (a gold board on a coil, red at its sides, an arrow up on it)
        const l = (t.s1 - t.s0) / 2;
        paint.tint(...RED, 1).box(-H + 0.06, 0, -l, H - 0.06, 0.1, l);
        paint.tint(...GOLD, 1).box(-H + 0.1, 0.1, -l + 0.04, H - 0.1, 0.16, l - 0.04);
        bands(-H + 0.1, H - 0.1, 0.161, 0.17, -l + 0.04, -l + 0.2, YELLOW, BLACK, 8);
        paint.tint(...RED, 1).box(-0.08, 0.161, -0.1, 0.08, 0.17, l - 0.1);
        for (const d of [-1, 1]) paint.tint(...RED, 1).beam(V(0, 0.166, l - 0.08), V(d * 0.32, 0.166, l - 0.4), 0.02, 0.008);
      }, paint);
      else if (t.kind === 'lift') on(t.s, () => {
        // (two posts by the rails, the bar runs up and down between them; a gold cap on each)
        for (const x of [-H + 0.02, H - 0.02]) { paint.tint(...CREAM, 1).box(x - 0.06, 0, -0.08, x + 0.06, 1.75, 0.08); paint.tint(...GOLD, 1).box(x - 0.08, 1.75, -0.1, x + 0.08, 1.85, 0.1); }
      }, paint);
      else if (t.kind === 'door') on(t.s, () => {
        // (a frame across, and the pockets the wall slides into: by the tower, and out over the sea)
        frame(t.top + 0.15, -0.02, 0.02, NAVY);
        paint.tint(...YELLOW, 1).box(-H - 0.1, t.top + 0.15, -0.1, H + 0.1, t.top + 0.3, 0.1);
        for (const d of [-1, 1]) paint.tint(...NAVY, 1).box(d > 0 ? H + 0.02 : -H - 2.05, -0.3, -0.2, d > 0 ? H + 2.05 : -H - 0.02, t.top + 0.15, 0.2);
      }, paint);
      else if (t.kind === 'cannon') {
        // (a muzzle in the wall of the tower, at the height of its balls, banded in their colours; a net beyond the rail)
        const a = angleOf(t.s), y = trackY(t.s) + t.y, c = t.high ? [RED, WHITE] : [YELLOW, BLACK];
        paint.tint(...NAVY, 1).rod(pol(a, S.core - 0.1, y), pol(a, S.core + 0.55, y), t.r + 0.1, 10);
        paint.tint(...c[0], 1).rod(pol(a, S.core + 0.4, y), pol(a, S.core + 0.6, y), t.r + 0.14, 10);
        paint.tint(...c[1], 1).rod(pol(a, S.core + 0.25, y), pol(a, S.core + 0.4, y), t.r + 0.13, 10);
      } else if (t.kind === 'ram') on(t.s, () => {
        // (its sleeve, by the tower or out over the sea: the ram draws back into it)
        const x0 = t.side < 0 ? H + 0.02 : -H - 3.35, x1 = t.side < 0 ? H + 3.35 : -H - 0.02;
        paint.tint(...NAVY, 1).box(x0, -0.35, -0.55, x1, t.top + 0.2, 0.55, { faces: 'xXyYzZ' });
        bands(Math.min(x0, x1), Math.max(x0, x1), t.top + 0.2, t.top + 0.32, -0.56, 0.56, YELLOW, BLACK, 10);
      }, paint);
      else if (t.kind === 'trolley') {
        // (a cable over the middle of the track, a gallows at each end)
        let prev = null;
        for (let s = t.s0; s <= t.s1 + 1e-6; s += 1.5) { const p = at(Math.min(s, t.s1), 0, 2.2); if (prev) paint.tint(0.2, 0.2, 0.24, 1).beam(prev, p, 0.04, 0.04); prev = p; }
        for (const s of [t.s0, t.s1]) on(s, () => { paint.tint(...NAVY, 1).box(-H - 0.15, 0, -0.08, -H + 0.01, 2.45, 0.08); paint.tint(...NAVY, 1).box(-H - 0.15, 2.3, -0.06, 0.15, 2.45, 0.06); paint.tint(...GOLD, 1).box(-0.15, 2.1, -0.12, 0.15, 2.32, 0.12); }, paint);
      } else if (t.kind === 'belt') {
        // (black rubber over the planks, a yellow roller at each end)
        for (let s = t.s0; s < t.s1 - 1e-6; s += 1) { const e = Math.min(t.s1, s + 1); paint.tint(0.06, 0.06, 0.07, 1).quad(at(s, -H + 0.08, 0.02), at(s, H - 0.08, 0.02), at(e, H - 0.08, 0.02), at(e, -H + 0.08, 0.02)); }
        for (const s of [t.s0, t.s1]) { const p = at(s, -H + 0.05, 0.02), q = at(s, H - 0.05, 0.02); paint.tint(...YELLOW, 1).rod(p, q, 0.09, 8); }
      } else if (t.kind === 'wind') {
        // (masts by the rail, every three metres: the streamers on them show the gusts)
        for (let s = t.s0 + 1; s < t.s1; s += 3) { const p = at(s, H + 0.12); paint.tint(...CREAM, 1).cylinder(p.x, p.y - 0.2, p.z, 0.04, 0.035, 2.5, 6); paint.tint(...RED, 1).cube(p.x, p.y + 2.32, p.z, 0.1, 0.1, 0.1); }
      }
    }
    // ---- a banner over the track where each turn begins: its number, its name (drawn only near the camera)
    this.banners = S.names.map((name, n) => {
      const s = n * TURN + (n ? 0 : 0.9), a = angleOf(s), mid = at(s, 0, 3.75);
      chunk(s);
      for (const u of [-H + 0.07, H - 0.07]) { const p = at(s, u); paint.tint(...(n % 2 ? NAVY : RED), 1).cube(p.x, p.y + 2.05, p.z, 0.09, 4.1, 0.09); }
      const b = canvasBoard(1024, 200, (ctx, w, h) => {
        ctx.fillStyle = n % 2 ? '#12122e' : '#3a1410'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, w - 16, h - 16);
        ctx.fillStyle = '#f2c14e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 44px system-ui, sans-serif';
        ctx.fillText(n ? `TURN ${n + 1} OF ${S.turns}` : S.name.toUpperCase(), w / 2, 56, w * 0.9);
        ctx.fillStyle = '#f6e7b8'; ctx.font = "700 86px Georgia, 'Times New Roman', serif"; ctx.fillText(name.toUpperCase(), w / 2, 134, w * 0.9);
      }, 2 * H - 0.1, (2 * H - 0.1) * 0.195);
      b.mesh.position.copy(mid); b.mesh.rotation.y = -a; b.mesh.name = 'spiral-banner';
      this.group.add(b.mesh);
      return { b, s };
    });
    // ---- the bell, on a gallows over the end of the last plank
    {
      const a = angleOf(LENGTH + 0.9), y = top;
      chunk(LENGTH);
      paint.tint(...NAVY, 1).beam(pol(a, S.core - 0.05, y + 3.3), pol(a, S.r + 0.1, y + 3.3), 0.14, 0.14);
      paint.tint(...NAVY, 1).beam(pol(a, S.core - 0.05, y + 1.9), pol(a, S.r - 1.6, y + 3.25), 0.09, 0.09);
      const p = pol(a, S.r, y + 2.5);
      paint.tint(...CREAM, 1).cylinder(p.x, p.y + 0.3, p.z, 0.02, 0.02, 0.5, 5);
      paint.tint(...GOLD, 1).place(p.x, p.y, p.z).lathe([[0.42, -0.34], [0.38, -0.24], [0.28, -0.06], [0.22, 0.12], [0.13, 0.27], [0.03, 0.32]], 12).pop();
      paint.tint(...GOLD, 1).cube(p.x, p.y - 0.36, p.z, 0.1, 0.1, 0.1);
      this.bell = p;
    }
    this.chunks = chunks.map((p, k) => {
      const m = p.toMeshes(mats, { name: `spiral-track${k}`, layers: [] }), casts = [];
      m.traverse((o) => { if (o.isMesh && o.castShadow) casts.push(o); });
      this.group.add(m);
      return { a: 3 * k * TURN, b: 3 * (k + 1) * TURN, casts };
    });

    // ---- what moves: each kind built once and drawn as instances where the clock says (see _place)
    /** A kind of moving thing: its pieces built in the frame of `pose` (+x up the track, +z towards the rail), as many as `max` at once. */
    const fleet = (name, max, build) => {
      const p = new Parts(); build(p.get('paint'), p);
      const m = p.toMeshes(mats, { name, layers: [] }), meshes = [];
      m.updateMatrixWorld(true); m.traverse((o) => { if (o.isMesh) meshes.push(o); });
      const ims = meshes.map((o) => {
        const im = new THREE.InstancedMesh(o.geometry, o.material, Math.max(1, max));
        im.name = name; im.count = 0; im.visible = false; im.frustumCulled = false; im.layers.mask = o.layers.mask; im.castShadow = o.castShadow; im.receiveShadow = o.receiveShadow;
        im.userData.local = o.matrixWorld.clone();
        this.group.add(im);
        return im;
      });
      const f = { ims, n: 0, max };
      this.fleets.push(f);
      return f;
    };
    this.fleets = [];
    const stripe = (b, x0, x1, y0, y1, z0, z1, ca, cb, n) => { for (let k = 0; k < n; k++) b.tint(...(k % 2 ? cb : ca), 1).box(x0 + ((x1 - x0) * k) / n, y0, z0, x0 + ((x1 - x0) * (k + 1)) / n, y1, z1); };
    const stripeZ = (b, x0, x1, y0, y1, z0, z1, ca, cb, n) => { for (let k = 0; k < n; k++) b.tint(...(k % 2 ? cb : ca), 1).box(x0, y0, z0 + ((z1 - z0) * k) / n, x1, y1, z0 + ((z1 - z0) * (k + 1)) / n); };
    const ball = (b, r, ca, cb) => { b.tint(...ca, 1).lathe([[0.001, -r], [r * 0.72, -r * 0.7], [r, 0], [r * 0.72, r * 0.7], [0.001, r]], 12); b.tint(...cb, 1).rod(V(0, -r * 0.18, 0), V(0, r * 0.18, 0), r * 1.02, 12, { caps: false }); };
    const mill0 = of('mill')[0], stomp0 = of('stomp')[0], ham = of('hammer'), L = Math.min(...ham.map((t) => t.L));
    this.mills = fleet('spiral-mills', of('mill').length, (b) => {
      // (its post, and two arms: the low one along +x, the high one the other way)
      b.tint(...NAVY, 1).cylinder(0, 0, 0, mill0.r + 0.03, mill0.r, 1.5, 8);
      b.tint(...GOLD, 1).place(0, 1.5, 0).lathe([[0.001, 0.2], [0.12, 0.14], [0.15, 0.04], [0.001, 0]], 8).pop();
      stripe(b, 0.1, mill0.arm, 0.24, S.bar.low - 0.02, -0.07, 0.07, YELLOW, BLACK, 5);
      stripe(b, -mill0.arm, -0.1, S.bar.high + 0.03, mill0.high - 0.03, -0.07, 0.07, RED, WHITE, 5);
    });
    this.stomps = [-1, 1].map((side) => fleet(`spiral-stomps-${side > 0 ? 'b' : 'a'}`, of('stomp').length, (b) => {
      // (a block: a band of yellow and black round its foot)
      const l = (stomp0.s1 - stomp0.s0) / 2, z0 = side > 0 ? 0.05 : -H + 0.16, z1 = side > 0 ? H - 0.16 : -0.05;
      b.tint(...(side > 0 ? [0.85, 0.16, 0.14] : NAVY), 1).box(-l, 0.2, z0, l, 1.3, z1);
      stripe(b, -l - 0.01, l + 0.01, 0, 0.2, z0 - 0.01, z1 + 0.01, YELLOW, BLACK, 6);
      b.tint(...CREAM, 1).cylinder(0, 1.3, (z0 + z1) / 2, 0.09, 0.09, stomp0.up + 0.2 - 1.3, 6);
    }));
    this.hammers = fleet('spiral-hammers', ham.length, (b) => {
      // (hung from the gallery above: a rod, and a drum of a head whose flat faces look up and down the track)
      b.tint(...CREAM, 1).cylinder(0, -L + 0.3, 0, 0.05, 0.05, L - 0.3, 6);
      b.tint(...NAVY, 1).rod(V(-0.3, 0, 0), V(0.3, 0, 0), 0.13, 8);
      b.tint(...RED, 1).rod(V(-0.25, -L, 0), V(0.25, -L, 0), ham[0].head, 14);
      b.tint(...YELLOW, 1).rod(V(-0.27, -L, 0), V(0.27, -L, 0), ham[0].head * 0.5, 10);
    });
    this.hammerL = L;
    this.barrels = fleet('spiral-barrels', 16, (b) => {
      const r = 0.4, w = 0.55;
      b.tint(1.05, 0.72, 0.38, 1).rod(V(0, 0, -w), V(0, 0, -w * 0.35), r, 10, { r1: r * 1.08 }).rod(V(0, 0, -w * 0.35), V(0, 0, w * 0.35), r * 1.08, 10).rod(V(0, 0, w * 0.35), V(0, 0, w), r * 1.08, 10, { r1: r });
      for (const z of [-w * 0.62, w * 0.62]) b.tint(0.2, 0.2, 0.24, 1).rod(V(0, 0, z - 0.04), V(0, 0, z + 0.04), r * 1.1, 10, { caps: false });
      b.tint(...YELLOW, 1).box(-0.08, r * 0.9, -0.2, 0.08, r * 1.1, 0.2); // (a mark that shows it roll)
    });
    // (a lift: its bar, yellow and black while it is low, red and white while it is high)
    this.lifts = [[YELLOW, BLACK], [RED, WHITE]].map(([a, c], i) => fleet(`spiral-lifts-${i}`, of('lift').length, (b) => stripeZ(b, -0.07, 0.07, 0, 0.3, -H + 0.08, H - 0.08, a, c, 8)));
    this.doors = fleet('spiral-doors', of('door').length, (b) => {
      // (two panels of a wall, the door between them: cream at its edges, a gold lintel over it)
      const g = of('door')[0].gap / 2, top = of('door')[0].top;
      for (const d of [-1, 1]) {
        b.tint(...NAVY, 1).box(-0.06, 0.02, d > 0 ? g : -g - 1.95, 0.06, top - 0.05, d > 0 ? g + 1.95 : -g);
        b.tint(...CREAM, 1).box(-0.075, 0.02, d > 0 ? g : -g - 0.12, 0.075, top - 0.05, d > 0 ? g + 0.12 : -g);
        for (let k = 0; k < 3; k++) b.tint(...CREAM, 1).box(-0.07, 0.5 + k * 0.7, d > 0 ? g + 0.4 : -g - 1.6, 0.07, 0.6 + k * 0.7, d > 0 ? g + 1.6 : -g - 0.4);
      }
      b.tint(...GOLD, 1).box(-0.08, top - 0.25, -g, 0.08, top - 0.05, g);
    });
    this.balls = [false, true].map((high) => fleet(`spiral-balls-${high ? 'high' : 'low'}`, of('cannon').filter((t) => t.high === high).length, (b) => ball(b, 0.25, high ? RED : BLACK, high ? WHITE : YELLOW)));
    this.rams = [-1, 1].map((side) => fleet(`spiral-rams-${side > 0 ? 'rail' : 'tower'}`, of('ram').filter((t) => t.side === side).length, (b) => {
      // (a block, its face banded yellow and black: from the tower, it comes out towards +z)
      const top = of('ram')[0].top, z0 = side < 0 ? -3.2 : 0.06, z1 = side < 0 ? -0.06 : 3.2, f = side < 0 ? -0.06 : 0.06;
      b.tint(...NAVY, 1).box(-0.42, 0.04, z0, 0.42, top - 0.05, z1);
      stripe(b, -0.43, 0.43, 0.04, top - 0.05, Math.min(f, 0), Math.max(f, 0) + 1e-3, YELLOW, BLACK, 6);
    }));
    this.boards = fleet('spiral-trolleys', 24, (b) => {
      // (a board hung from a wheel on the cable: red and white, slid under)
      const t = of('trolley')[0];
      stripeZ(b, -0.05, 0.05, t.y0, t.y1, -H + 0.12, H - 0.12, RED, WHITE, 8);
      for (const z of [-0.7, 0.7]) b.tint(...CREAM, 1).box(-0.02, t.y1, z - 0.02, 0.02, 2.15, z + 0.02);
      b.tint(...CREAM, 1).box(-0.03, 2.1, -0.72, 0.03, 2.16, 0.72);
      b.tint(...GOLD, 1).rod(V(0, 2.2, -0.1), V(0, 2.2, 0.1), 0.09, 8);
    });
    this.planks = fleet('spiral-planks', 64, (b, p) => {
      // (a plank that gives way, a metre long and as wide as its scale: pale, its ends yellow)
      p.get('woodDeck').tint(1.55, 1.38, 1.02, 1).box(-0.47, -DECK, -0.5, 0.47, 0, 0.5);
      for (const x of [-0.5, 0.47]) b.tint(...YELLOW, 1).box(x, -DECK, -0.5, x + 0.03, 0.004, 0.5);
      b.tint(0.35, 0.25, 0.15, 1).box(-0.2, 0, -0.3, 0.25, 0.004, -0.27);
    });
    this.slats = fleet('spiral-slats', 64, (b) => b.tint(...YELLOW, 1).box(-0.06, 0.02, -H + 0.12, 0.06, 0.045, H - 0.12));
    this.streamers = fleet('spiral-streamers', 48, (b) => stripe(b, 0, 1.3, -0.07, 0.07, -0.004, 0.004, RED, WHITE, 6));
    this.kinds = { mill: of('mill'), stomp: of('stomp'), hammer: ham, barrels: of('barrels'), lift: of('lift'), door: of('door'), cannon: of('cannon'), ram: of('ram'), trolley: of('trolley'), crumble: crumbles, belt: of('belt'), wind: of('wind') };

    // ---- a shadow under the runner: where one would come down
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2; this.blob.visible = false; this.blob.renderOrder = 5; this.blob.name = 'spiral-blob';
    this.group.add(this.blob);

    // ---- the gate, on the sand of the south beach, looking at the tower
    const gx = S.gate.x, gz = S.gate.z, gy = this.data.heightAt(gx, gz), yaw = Math.atan2(C.x - gx, C.z - gz), gate = new Parts();
    gateArch(this.group, gate.get('paint'), gx, gy, gz, yaw, S.name.toUpperCase(), S.back === 'landing' ? 'UP THE TOWER TO THE BELL · ONE TOUCH AND IT IS THE LAST LANDING AGAIN' : 'UP THE TOWER TO THE BELL · ONE TOUCH AND IT IS THE FOOT AGAIN', { width: 4 });
    this.group.add(gate.toMeshes(mats, { name: 'spiral-gate', layers: [LAYER.STATIC_CASTER] }));
    this.board = canvasBoard(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#12122e'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 8; ctx.strokeRect(7, 7, w - 14, h - 14);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f2c14e'; ctx.font = '600 30px system-ui, sans-serif'; ctx.fillText('YOUR BEST TIME TO THE BELL', w / 2, 56, w * 0.9);
      ctx.fillStyle = '#ffffff'; ctx.font = '700 84px Georgia, serif'; ctx.fillText(this.best ? formatTime(this.best) : '—', w / 2, 138);
      ctx.fillStyle = '#c9d2ff'; ctx.font = '500 26px system-ui, sans-serif'; ctx.fillText(this.best ? (S.back === 'landing' ? 'from the foot, falls and all' : 'in one attempt, from the foot') : 'the bell has not rung yet', w / 2, 214, w * 0.9);
    }, 1.7, 0.85, { both: true });
    // (to the left of the gate, a step back, on dry sand: the stand of the best times is to its right)
    const bx = gx + Math.cos(yaw) * 3.1 - Math.sin(yaw) * 0.6, bz = gz - Math.sin(yaw) * 3.1 - Math.cos(yaw) * 0.6;
    this.board.mesh.position.set(bx, this.data.heightAt(bx, bz) + 1.25, bz); this.board.mesh.rotation.y = yaw - 0.3; this.board.mesh.name = 'spiral-board';
    this.group.add(this.board.mesh);
    this.gate = { x: gx, y: gy, z: gz, yaw };
    this.group.updateMatrixWorld(true);
    world.scene.add(this.group);
    this._place(this.clock() / 1000);
    return this;
  }

  /** This visitor's best time to the bell (ms): what the board by the gate shows. */
  setBest(ms) { this.best = ms || 0; this.board?.redraw(); }
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.4 * 2.4; }

  /** Puts what moves where it is at `now` (s of the clock of the world) — only near the metre `this.focus`. */
  _place(now) {
    const F = this.focus, K = this.kinds, st = this.session?.state, near = (t) => t.s1 > F - NEAR && t.s0 < F + NEAR;
    for (const f of this.fleets) f.n = 0;
    const put = (f) => { if (f.n >= f.max) return; _o.updateMatrix(); for (const im of f.ims) im.setMatrixAt(f.n, _m.multiplyMatrices(_o.matrix, im.userData.local)); f.n++; };
    for (const t of K.mill) if (near(t)) { _o.position.copy(at(t.s)); _o.rotation.set(0, Math.PI / 2 - (angleOf(t.s) + millAngle(t, now)), 0); _o.scale.set(1, 1, 1); put(this.mills); }
    for (const t of K.stomp) if (near(t)) for (const side of [-1, 1]) {
      const s = (t.s0 + t.s1) / 2, soon = stompSoon(t, now, side);
      pose(s, 0, stompAt(t, now, side) + (soon < 0.2 ? Math.sin(now * 70) * 0.035 : 0)); // (it trembles before it comes down)
      put(this.stomps[side > 0 ? 1 : 0]);
    }
    for (const t of K.hammer) if (near(t)) {
      _o.position.copy(at(t.s, 0, this.hammerL + 0.92)); _o.rotation.set(-Math.asin(clamp(hammerAt(t, now) / this.hammerL, -1, 1)), Math.PI / 2 - angleOf(t.s), 0, 'YXZ'); _o.scale.set(1, 1, 1);
      put(this.hammers);
    }
    for (const t of K.barrels) if (near(t)) barrelsOf(t, now, (b) => { _o.position.copy(at(b.s, b.u, t.r + b.fall)); _o.rotation.set(0, Math.PI / 2 - angleOf(b.s), b.turn, 'YZX'); _o.scale.set(1, 1, 1); put(this.barrels); });
    for (const t of K.lift) if (near(t)) { const y = liftAt(t, now); pose(t.s, 0, y); put(this.lifts[y > (t.lo + t.hi) / 2 ? 1 : 0]); }
    for (const t of K.door) if (near(t)) { pose(t.s, doorAt(t, now)); put(this.doors); }
    for (const t of K.cannon) if (near(t)) { const u = cannonAt(t, now); if (u < H + 2.6) { pose(t.s, u, t.y); _o.rotation.z -= (u * 4) % TAU; put(this.balls[t.high ? 1 : 0]); } }
    for (const t of K.ram) if (near(t)) { const e = ramAt(t, now); pose(t.s, t.side < 0 ? -H + e : H - e); put(this.rams[t.side < 0 ? 0 : 1]); }
    for (const t of K.trolley) if (near(t)) trolleysOf(t, now, (s) => { pose(s, 0, 0, true); _o.rotation.z += Math.sin(now * 5 + s) * 0.04; put(this.boards); });
    for (const t of K.crumble) if (near(t) && t.s1 > F - 30 && t.s0 < F + 50) {
      // (a plank that gives way: it trembles once trodden on, then drops, and is gone)
      const k = st ? trodAt(st, t.id) : undefined, age = k === undefined ? -1 : st.total - k, drop = age > S.crumble ? 0.5 * S.g * (age - S.crumble) ** 2 : 0;
      if (drop > 30) continue;
      pose((t.s0 + t.s1) / 2, (t.u0 + t.u1) / 2, (age >= 0 && !drop ? Math.sin(age * 90) * 0.02 : 0) - drop, true);
      if (drop) _o.rotation.x += drop * 0.05;
      _o.scale.set(1, 1, t.u1 - t.u0);
      put(this.planks);
    }
    for (const t of K.belt) if (near(t)) for (let x = (now * t.v) % 1; x < t.s1 - t.s0; x += 1) { pose(t.s1 - x, 0, 0, true); put(this.slats); }
    for (const t of K.wind) if (near(t)) {
      // (a streamer at the top of each mast: it hangs when calm, and stands out over the sea in a gust)
      const g = gustAt(t, now);
      for (let s = t.s0 + 1; s < t.s1; s += 3) {
        const a = angleOf(s), droop = (1 - g) * 1.35 + 0.1 + Math.sin(now * 9 + s) * 0.06 * (0.3 + g), out = t.dir;
        _x.set(Math.cos(a) * out * Math.cos(droop), -Math.sin(droop), Math.sin(a) * out * Math.cos(droop));
        _z.set(Math.sin(a), 0, -Math.cos(a)); _y.crossVectors(_z, _x).normalize(); _z.crossVectors(_x, _y);
        _o.position.copy(at(s, H + 0.12, 2.3)); _o.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z)); _o.scale.set(1, 1, 1);
        put(this.streamers);
      }
    }
    for (const f of this.fleets) for (const im of f.ims) { im.count = f.n; im.visible = f.n > 0; im.instanceMatrix.needsUpdate = true; }
    for (const { b, s } of this.banners) b.mesh.visible = Math.abs(s - F) < NEAR;
    // (only the pieces of the gallery about the camera cast a shadow, and the one over it: the rest is far, and dear)
    for (const c of this.chunks) { const cast = F > c.a - 1.5 * TURN && F < c.b + 0.5 * TURN; for (const o of c.casts) o.castShadow = cast; }
  }

  /** Every frame: what moves is where the clock says — the clock of the run while one runs —, near the runner or the camera. */
  update(dt, time, cam) {
    const st = this.session?.state;
    if (st) this.focus = st.s;
    else if (cam) this.focus = clamp(((cam.position.y - S.foot - 2) / S.rise) * TURN, 0, LENGTH); // (the turn at the height of the camera)
    this._place(st ? st.t0 + st.total : this.clock() / 1000);
  }

  /**
   * A run is asked for: the player is put at the foot of the track, and stands there — the clock of the attempt
   * waits for the first step. `io`: { play, note }. Returns the session — the driver of the player: step(dt,
   * player, control), camera(camera, dt), line, over (`score`: the time of the attempt that reached the bell,
   * ms), ended, drop(player), close(), auto (true: it runs by itself).
   */
  open(player, io) {
    const st = startRun(this.clock() / 1000), events = [], input = { side: 0, run: 0, jump: false, down: false, crouch: false }, pose = {};
    const K = { acc: 0, low: false, camS: null, camU: 0, camY: 0, after: 0, lie: 0 };
    const _c = V(0, 0, 0), _l = V(0, 0, 0);
    const session = {
      spiral: this, over: false, ended: false, score: 0, time: 0, line: '', riding: false, anim: ANIM.idle, state: st, auto: false,
      step: (dt, pl, control) => {
        const inp = pl.input, mx = control ? inp.move.x : 0, my = control ? inp.move.y : 0;
        if (session.auto) {
          // (running by itself, it decides at every step of the run, as the checks do)
          K.acc += Math.min(dt, 0.25);
          while (K.acc >= S.step && !st.over) { K.acc -= S.step; botInput(st, input); stepRun(st, S.step, input, events); }
        } else {
          // (the stick is round — up and aside together, or W and D, are 0.7 of each: the legs run full out from a
          // little over half-way up, and one steers full out from two thirds aside, so that one does both at once)
          input.run = clamp((my - 0.15) / 0.4, 0, 1); input.side = clamp(mx / 0.65, -1, 1); input.jump = control && !!inp.jump;
          // (down is a push of the stick, counted once; held, the slide goes on a little — and a duck for as long.
          // On a keyboard S counts while W is still held: the two together read as a stick in its middle)
          const keys = control && typeof inp.keys?.has === 'function' ? inp.keys : null;
          input.crouch = my < -0.5 || (!!keys && (keys.has('KeyS') || keys.has('ArrowDown'))); input.down = input.crouch && !K.low;
          K.low = input.crouch;
          if (!st.over) stepRun(st, dt, input, events);
        }
        for (const e of events) this._tell(e, st, io);
        events.length = 0;
        // ---- where the runner is, and how it holds itself
        spiralAt(st.s, st.u, pose);
        const down = st.down > 0, low = (st.slide > 0 || st.duck > 0) && !st.air && !down; // (low: sliding, or ducking where one stands)
        if (down && st.why !== 'hole') K.lie = Math.min(1, K.lie + dt * 9); else K.lie = 0;
        pl.pos.set(pose.x, pose.y + st.h - (low ? 0.28 : 0) + K.lie * 0.12, pose.z);
        pl.yaw = pose.yaw - clamp(st.vu / S.side, -1, 1) * 0.3; // (it turns a little the way it steers: to the right is towards the rail)
        pl.pitch = low ? -0.2 - 0.3 * clamp(st.v / 3, 0, 1) : -1.35 * K.lie; pl.roll = 0; // (a slide leans back; a duck sits up)
        pl.speed = st.wait > 0 || down || st.over ? 0 : Math.max(st.v, Math.abs(st.vu) * 0.6); pl.grounded = true;
        session.anim = st.over || st.wait > 0 ? ANIM.idle : down ? (st.why === 'hole' ? ANIM.jump : ANIM.sit) : low ? ANIM.sit : st.air ? ANIM.jump : st.v > 3 ? ANIM.run : st.v > 0.3 || Math.abs(st.vu) > 1 ? ANIM.walk : ANIM.idle;
        // (its shadow, on what is under it: the planks, the top of a crate — nothing over a hole)
        const G = floorAt(st.s, st.u, st);
        this.blob.visible = Number.isFinite(G) && !down;
        if (this.blob.visible) { const k = clamp(1 - (st.h - G) / 3, 0.45, 1); this.blob.position.set(pose.x, pose.y + G + 0.03, pose.z); this.blob.scale.setScalar(k); this.blob.updateMatrixWorld(true); }
        if (st.over) { K.after += dt; if (!session.over) { session.over = true; session.score = session.time = st.time; } if (K.after > 2.8) session.ended = true; }
        const turn = turnOf(st.s), best = `best ${heightOf(st.best).toFixed(1)} m of ${Math.round(heightOf(LENGTH))} up`, landing = S.back === 'landing';
        const who = landing ? (st.outs ? `${st.outs} fall${st.outs > 1 ? 's' : ''}` : 'no fall yet') : `Attempt ${st.attempt}`;
        session.line = st.over ? `${S.name} · the bell in ${formatTime(st.time)} · ${landing ? who : `attempt ${st.attempt}`}`
          : !st.going ? `${who} · at the foot — the clock starts with your first step${st.best > 0 ? ` · ${best}` : ''}`
            : `${who} · turn ${turn + 1} of ${S.turns}: ${S.names[turn]} · ${formatTime(Math.round(st.clock * 1000))} · ${best}`;
      },
      /**
       * The camera: behind the runner, a little outside the gallery and above it, looking down the track ahead —
       * it goes round with the runner, the tower always on its left and never in the way; back at the foot, it
       * is there at once. Along the track it is one piece with the runner — where it stands and what it looks at
       * are both counted from the runner's place —: when the legs stop it stops with them, without a swing.
       */
      camera: (cam, dt) => {
        const D = S.cam, cr = S.r + D.out;
        if (K.camS === null || Math.abs(st.s - K.camS) > 12) { K.camU = st.u; K.camY = 0; }
        K.camS = st.s;
        K.camU += (st.u - K.camU) * Math.min(1, dt * 4);
        K.camY += (Math.max(0, st.h) - K.camY) * Math.min(1, dt * 3);
        const a = angleOf(st.s) + D.back / cr, y = trackY(st.s) + D.up + K.camY * 0.3;
        _c.set(C.x + Math.cos(a) * (cr + K.camU * 0.35), y, C.z + Math.sin(a) * (cr + K.camU * 0.35));
        const la = angleOf(st.s + D.ahead);
        _l.set(C.x + Math.cos(la) * (S.r + K.camU * 0.5 - 0.7), trackY(st.s + D.ahead) + 0.3 + K.camY * 0.3, C.z + Math.sin(la) * (S.r + K.camU * 0.5 - 0.7));
        cam.position.copy(_c); cam.up.set(0, 1, 0); cam.lookAt(_l);
        return 66;
      },
      /** The run is over (the bell), or left: the player is put back at the gate, on the sand. */
      drop: (pl) => { pl.driver = null; pl.riding = false; pl.pitch = 0; pl.roll = 0; pl.teleport(this.gate.x, this.gate.z, this.gate.yaw); session.close(); },
      close: () => { if (this.session === session) this.session = null; this.blob.visible = false; player.pitch = 0; player.roll = 0; },
    };
    this.session = session;
    session.step(0, player, false);
    return session;
  }

  _tell(e, st, io) {
    if (e.type === 'jump') io.play('jump', { volume: 0.5 });
    else if (e.type === 'again') io.play('jump', { volume: 0.4, rate: 1.3 });
    else if (e.type === 'land') io.play('land', { volume: 0.35 });
    else if (e.type === 'go') io.play('start', { volume: e.attempt === 1 ? 0.6 : 0.35 }); // (the first step: the clock starts)
    else if (e.type === 'foot') io.play('respawn', { volume: 0.6 });
    else if (e.type === 'spring') io.play('jump', { volume: 0.7, rate: 0.7 });
    else if (e.type === 'turn') { io.play('checkpoint', { volume: 0.6 }); io.note(`Turn ${e.n + 1}: ${S.names[e.n]}`, 1800); }
    else if (e.type === 'out') { io.play(e.why === 'hole' ? 'fail' : 'hit'); io.note(`${WHY[e.why] || 'Out!'} ${heightOf(e.s).toFixed(1)} m up — back to ${S.back === 'landing' && st.home > 0 ? 'the last landing' : 'the foot'}.`, 1700); }
    else if (e.type === 'top') { io.play('bell'); io.play('victory', { volume: 0.7 }); io.note(`The bell! ${formatTime(e.time)}, at attempt ${e.attempt}`, 5000); }
  }
}
