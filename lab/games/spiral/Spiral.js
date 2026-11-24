// A Turn for the Worse: what is seen of it and how it is run. Its rules are in rules.js; here the tower is built
// — a striped tower on a rock in the sea, the gallery of planks that winds up round it, its rails and its bulbs,
// what stands in the way and what moves, a pointed roof and a bell — and a run is a session that drives the
// player (see PlayerController.driver). What moves is drawn from the clock of the world: everybody sees the same.
//
// What stands in the way says what it asks by its paint: yellow and black is jumped, red and white is slid
// under, navy and cream is gone round, and a crate is jumped onto (a blue band: one jump; a red band: two).
import * as THREE from 'three';
import { Parts } from '../../../src/world/props/MeshBuilder.js';
import { LAYER } from '../../../src/render/Shadows.js';
import { ANIM } from '../../../src/player/Character.js';
import { canvasBoard } from '../../../src/world/zones/games/Boards.js';
import { formatTime } from '../../../src/world/zones/games/course.js';
import { V, clamp, worldClock, gateArch } from '../kit.js';
import { SPIRAL, TURN, LENGTH, course, trackY, spiralAt, floorAt, startRun, stepRun, botInput, millAngle, stompAt, stompSoon, hammerAt, barrelsOf, heightOf, turnOf } from './rules.js';

const S = SPIRAL, C = S.at, H = S.half, TAU = Math.PI * 2;
const SLOPE = Math.atan(S.rise / TURN); // how the planks climb (radians)
const DECK = 0.24; // how thick the gallery is
const CREAM = [1.3, 1.17, 0.9], RED = [0.95, 0.1, 0.12], GOLD = [1.5, 1.05, 0.2], NAVY = [0.07, 0.09, 0.26], YELLOW = [1.65, 1.3, 0.1], BLACK = [0.05, 0.05, 0.06], WHITE = [1.45, 1.42, 1.36], BLUE = [0.12, 0.42, 1.1];
const WHY = { hole: 'Down a hole!', low: 'A hurdle across the shins!', high: 'Head first into a board!', fence: 'Straight into a fence!', crate: 'Flat against a crate!', mill: 'Caught by the mill!', stomp: 'Stomped!', hammer: 'Hammered!', barrel: 'Bowled over by a barrel!' };
const BARRELS = 8;

/** A point about the tower: at angle `a`, `r` metres from its middle, `y` over the sea. */
const pol = (a, r, y) => V(C.x + Math.cos(a) * r, y, C.z + Math.sin(a) * r);
/** A point of the track: metre `s`, `u` across, `up` over its planks. */
const at = (s, u = 0, up = 0) => pol(S.from - s / S.r, S.r + u, trackY(s) + up);
const angleOf = (s) => S.from - s / S.r;

export class Spiral {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'spiral';
    this.session = null;
    this.best = 0;
    /** The clock everybody shares (ms): what moves on the track is counted on it. */
    this.clock = worldClock;
  }

  build() {
    const world = this.world, mats = world.materials, parts = new Parts(), core = new Parts();
    const paint = parts.get('paint'), deck = parts.get('woodDeck'), dark = parts.get('woodDark'), glow = parts.get('glow');
    const { things } = course(), top = trackY(LENGTH), roofY = top + 5.4;

    // ---- the rock it stands on, the tower, its roof: what casts a shadow and shows in the sea
    {
      // (a plinth of dressed stone, standing on the bed of the bay: two drums, the sea at its foot)
      const stone = core.get('stoneWet'), wall = core.get('paint');
      stone.tint(0.95, 0.93, 0.9, 1).cylinder(C.x, -7.8, C.z, S.r + H + 2.9, S.r + H + 1.5, 8.6, 28, { capTop: true });
      stone.tint(1.05, 1.02, 0.98, 1).cylinder(C.x, 0.8, C.z, S.r + H + 0.7, S.r + H + 0.5, 1.9, 28, { capTop: true });
      // the wall: stripes from the rock to the roof
      const M = 48, y0 = 1.4;
      for (let k = 0; k < M; k++) {
        const a0 = (k / M) * TAU, a1 = ((k + 1) / M) * TAU, red = Math.floor(k / 2) % 2 === 0;
        wall.tint(...(red ? [0.86, 0.13, 0.11] : [1.42, 1.3, 1.02]), 1).quad(pol(a1, S.core, y0), pol(a0, S.core, y0), pol(a0, S.core, roofY), pol(a1, S.core, roofY));
      }
      wall.tint(...NAVY, 1).cylinder(C.x, y0, C.z, S.core + 0.35, S.core + 0.2, 1.3, 32, { capTop: false });
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

    // ---- the gallery: planks from below the foot to the bell, missing where the course says so
    const holes = things.filter((t) => t.kind === 'hole'), S0 = -3.6, S1 = LENGTH + 3.2;
    const cuts = [];
    for (let s = S0; s < S1; s += 0.75) cuts.push(s);
    cuts.push(S1);
    for (const h of holes) cuts.push(h.s0, h.s1);
    cuts.sort((a, b) => a - b);
    const marks = cuts.filter((s, i) => i === 0 || s - cuts[i - 1] > 0.04);
    for (let i = 0; i + 1 < marks.length; i++) {
      const sa = marks[i], sb = marks[i + 1], mid = (sa + sb) / 2;
      // what is left of the width there
      let spans = [[-H, H]];
      for (const h of holes) if (mid > h.s0 && mid < h.s1) spans = spans.flatMap(([a, b]) => (h.u1 <= a || h.u0 >= b ? [[a, b]] : [[a, Math.min(b, h.u0)], [Math.max(a, h.u1), b]].filter(([p, q]) => q - p > 0.02)));
      for (const [u0, u1] of spans) {
        const narrow = u1 - u0 < 2 * H - 0.1, tone = narrow ? [1.5, 1.32, 0.95] : [1.16, 1.06, 0.9];
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
      // the two ends of a hole: the cut of the planks, in yellow — the far one is what who runs sees of it —, and
      // a band of yellow and black on the planks before it
      paint.tint(...YELLOW, 1).quad(at(h.s0, h.u0, -DECK), at(h.s0, h.u0), at(h.s0, h.u1), at(h.s0, h.u1, -DECK));
      paint.tint(...YELLOW, 1).quad(at(h.s1, h.u1, -DECK), at(h.s1, h.u1), at(h.s1, h.u0), at(h.s1, h.u0, -DECK));
      const n = Math.max(2, Math.round((h.u1 - h.u0) / 0.4));
      for (let k = 0; k < n; k++) {
        const a = h.u0 + ((h.u1 - h.u0) * k) / n, b = h.u0 + ((h.u1 - h.u0) * (k + 1)) / n;
        paint.tint(...(k % 2 ? BLACK : YELLOW), 1).quad(at(h.s0 - 0.34, a, 0.012), at(h.s0 - 0.34, b, 0.012), at(h.s0 - 0.02, b, 0.012), at(h.s0 - 0.02, a, 0.012));
      }
    }
    // ---- what holds it: a beam and a strut from the wall, twelve to a turn
    for (let s = S0 + 0.4; s < S1; s += TURN / 12) {
      if (holes.some((h) => s > h.s0 - 0.2 && s < h.s1 + 0.2)) continue; // (none under a hole: nothing there looks like something to step on)
      const a = angleOf(s), y = trackY(s) - DECK - 0.13;
      dark.tint(1.5, 1.35, 1.15, 1).beam(pol(a, S.core - 0.05, y), pol(a, S.r + H - 0.05, y), 0.15, 0.26);
      dark.tint(1.5, 1.35, 1.15, 1).beam(pol(a, S.core - 0.05, y - 2.3), pol(a, S.r + 0.3, y - 0.1), 0.09, 0.09);
    }
    // ---- the rails: posts and a hand rail by the sea, a lighter one on the tower side; a bulb on every post
    const rail = (u, high, every, tone, from, to) => {
      let prev = null;
      for (let s = from; s <= to + 1e-6; s += 1.5) { const p = at(Math.min(s, to), u, high); if (prev) paint.tint(...tone, 1).beam(prev, p, 0.075, 0.07); prev = p; }
      for (let s = from; s <= to + 1e-6; s += every) {
        if (holes.some((h) => s > h.s0 - 0.05 && s < h.s1 + 0.05 && h.u0 <= u && h.u1 >= u)) continue; // (no post over a hole)
        const p = at(s, u, 0);
        paint.tint(...CREAM, 1).cube(p.x, p.y + high / 2, p.z, 0.075, high, 0.075);
        if (u > 0) glow.tint(1, 0.95, 0.7, 1).cube(p.x, p.y + high + 0.12, p.z, 0.13, 0.13, 0.13);
      }
    };
    const CROWN = 343.2; // (where the track gives way to planks: the rails stop there)
    rail(H - 0.07, 1.02, TURN / 24, RED, S0, CROWN);
    rail(-H + 0.07, 0.9, TURN / 12, NAVY, S0, CROWN);
    rail(H - 0.07, 1.02, 1.3, RED, LENGTH + 0.6, S1); rail(-H + 0.07, 0.9, 1.3, NAVY, LENGTH + 0.6, S1);

    // ---- what stands in the way
    /** Builders set on the planks at metre `s`: +z up the track, -x towards the rail (x is -u), y over the planks. */
    const on = (s, fn, ...bs) => { const p = at(s), a = angleOf(s); for (const b of bs) b.place(p.x, p.y, p.z, Math.PI - a, -SLOPE); fn(); for (const b of bs) b.pop(); };
    /** A board from x0 to x1 in bands of two colours. */
    const bands = (x0, x1, y0, y1, z0, z1, a, b, n) => { for (let k = 0; k < n; k++) paint.tint(...(k % 2 ? b : a), 1).box(x0 + ((x1 - x0) * k) / n, y0, z0, x0 + ((x1 - x0) * (k + 1)) / n, y1, z1); };
    for (const t of things) {
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
        const x0 = -t.u1 + 0.03, x1 = -t.u0 - 0.03, l = (t.s1 - t.s0) / 2, band = t.top > 1.2 ? RED : BLUE, tone = t.top > 1.2 ? [1.12, 0.95, 0.72] : [1.3, 1.12, 0.82];
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
        const y1 = S.rise - DECK - 0.2;
        paint.tint(...NAVY, 1).box(-H + 0.15, y1 - 0.7, -0.75, H - 0.15, y1, 0.75);
        bands(-H + 0.15, H - 0.15, y1 - 0.82, y1 - 0.7, -0.78, 0.78, YELLOW, BLACK, 8);
      }, paint);
    }
    // ---- a banner over the track where each turn begins: its number, its name
    this.banners = S.names.map((name, n) => {
      const s = n * TURN + (n ? 0 : 0.9), a = angleOf(s), mid = at(s, 0, 3.75);
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
      return b;
    });
    // ---- the bell, on a gallows over the end of the last plank
    {
      const a = angleOf(LENGTH + 0.9), y = top;
      paint.tint(...NAVY, 1).beam(pol(a, S.core - 0.05, y + 3.3), pol(a, S.r + 0.1, y + 3.3), 0.14, 0.14);
      paint.tint(...NAVY, 1).beam(pol(a, S.core - 0.05, y + 1.9), pol(a, S.r - 1.6, y + 3.25), 0.09, 0.09);
      const p = pol(a, S.r, y + 2.5);
      paint.tint(...CREAM, 1).cylinder(p.x, p.y + 0.3, p.z, 0.02, 0.02, 0.5, 5);
      paint.tint(...GOLD, 1).place(p.x, p.y, p.z).lathe([[0.42, -0.34], [0.38, -0.24], [0.28, -0.06], [0.22, 0.12], [0.13, 0.27], [0.03, 0.32]], 12).pop();
      paint.tint(...GOLD, 1).cube(p.x, p.y - 0.36, p.z, 0.1, 0.1, 0.1);
      this.bell = p;
    }
    this.group.add(parts.toMeshes(mats, { name: 'spiral-track', layers: [] }));

    // ---- what moves: built once, put where the clock says (see _place)
    const lump = (name, build) => { const p = new Parts(); build(p.get('paint'), p); const m = p.toMeshes(mats, { name, layers: [] }); this.group.add(m); return m; };
    const stripe = (b, x0, x1, y0, y1, z0, z1, ca, cb, n) => { for (let k = 0; k < n; k++) b.tint(...(k % 2 ? cb : ca), 1).box(x0 + ((x1 - x0) * k) / n, y0, z0, x0 + ((x1 - x0) * (k + 1)) / n, y1, z1); };
    this.mills = things.filter((t) => t.kind === 'mill').map((t, i) => {
      const p = at(t.s);
      // (its post, and two arms: the low one along +x, the high one the other way)
      const g = lump(`spiral-mill${i}`, (b) => {
        b.tint(...NAVY, 1).cylinder(0, 0, 0, t.r + 0.03, t.r, 1.5, 8);
        b.tint(...GOLD, 1).place(0, 1.5, 0).lathe([[0.001, 0.2], [0.12, 0.14], [0.15, 0.04], [0.001, 0]], 8).pop();
        stripe(b, 0.1, t.arm, 0.24, S.bar.low - 0.02, -0.07, 0.07, YELLOW, BLACK, 5);
        stripe(b, -t.arm, -0.1, S.bar.high + 0.03, t.high - 0.03, -0.07, 0.07, RED, WHITE, 5);
      });
      g.position.copy(p);
      return { t, g, a: angleOf(t.s) };
    });
    this.stomps = things.filter((t) => t.kind === 'stomp').flatMap((t, i) => [-1, 1].map((side) => {
      const s = (t.s0 + t.s1) / 2, p = at(s), l = (t.s1 - t.s0) / 2;
      // (a block: +x up the track, +z towards the rail; a band of yellow and black round its foot)
      const g = lump(`spiral-stomp${i}${side > 0 ? 'b' : 'a'}`, (b) => {
        const z0 = side > 0 ? 0.05 : -H + 0.16, z1 = side > 0 ? H - 0.16 : -0.05;
        b.tint(...(side > 0 ? [0.85, 0.16, 0.14] : NAVY), 1).box(-l, 0.2, z0, l, 1.3, z1);
        stripe(b, -l - 0.01, l + 0.01, 0, 0.2, z0 - 0.01, z1 + 0.01, YELLOW, BLACK, 6);
        b.tint(...CREAM, 1).cylinder(0, 1.3, (z0 + z1) / 2, 0.09, 0.09, t.up + 0.2 - 1.3, 6);
      });
      g.position.copy(p); g.rotation.y = Math.PI / 2 - angleOf(s);
      return { t, g, side, y: p.y };
    }));
    this.hammers = things.filter((t) => t.kind === 'hammer').map((t, i) => {
      const L = S.rise - 1.7, p = at(t.s, 0, L + 0.92);
      // (hung from the gallery above: a rod, and a drum of a head whose flat faces look up and down the track)
      const g = lump(`spiral-hammer${i}`, (b) => {
        b.tint(...CREAM, 1).cylinder(0, -L + 0.3, 0, 0.05, 0.05, L - 0.3, 6);
        b.tint(...NAVY, 1).rod(V(-0.3, 0, 0), V(0.3, 0, 0), 0.13, 8);
        b.tint(...RED, 1).rod(V(-0.25, -L, 0), V(0.25, -L, 0), t.head, 14);
        b.tint(...YELLOW, 1).rod(V(-0.27, -L, 0), V(0.27, -L, 0), t.head * 0.5, 10);
      });
      g.position.copy(p);
      return { t, g, L, yaw: Math.PI / 2 - angleOf(t.s) };
    });
    this.stretches = things.filter((t) => t.kind === 'barrels');
    this.barrels = Array.from({ length: BARRELS }, (_, i) => {
      const g = lump(`spiral-barrel${i}`, (b) => {
        const r = 0.4, w = 0.55;
        b.tint(1.05, 0.72, 0.38, 1).rod(V(0, 0, -w), V(0, 0, -w * 0.35), r, 10, { r1: r * 1.08 }).rod(V(0, 0, -w * 0.35), V(0, 0, w * 0.35), r * 1.08, 10).rod(V(0, 0, w * 0.35), V(0, 0, w), r * 1.08, 10, { r1: r });
        for (const z of [-w * 0.62, w * 0.62]) b.tint(0.2, 0.2, 0.24, 1).rod(V(0, 0, z - 0.04), V(0, 0, z + 0.04), r * 1.1, 10, { caps: false });
        b.tint(...YELLOW, 1).box(-0.08, r * 0.9, -0.2, 0.08, r * 1.1, 0.2); // (a mark that shows it roll)
      });
      g.visible = false;
      return g;
    });
    // ---- a shadow under the runner: where one would come down
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.34, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2; this.blob.visible = false; this.blob.renderOrder = 5; this.blob.name = 'spiral-blob';
    this.group.add(this.blob);

    // ---- the gate, on the sand of the south beach, looking at the tower
    const gx = S.gate.x, gz = S.gate.z, gy = this.data.heightAt(gx, gz), yaw = Math.atan2(C.x - gx, C.z - gz), gate = new Parts();
    // (the name between two spaces at each end: the posts stand before the ends of the board)
    gateArch(this.group, gate.get('paint'), gx, gy, gz, yaw, `  ${S.name.toUpperCase()}  `, 'UP THE TOWER TO THE BELL · ONE TOUCH AND IT IS THE FOOT AGAIN', { width: 4 });
    this.group.add(gate.toMeshes(mats, { name: 'spiral-gate', layers: [LAYER.STATIC_CASTER] }));
    this.board = canvasBoard(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#12122e'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 8; ctx.strokeRect(7, 7, w - 14, h - 14);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f2c14e'; ctx.font = '600 30px system-ui, sans-serif'; ctx.fillText('YOUR BEST TIME TO THE BELL', w / 2, 56, w * 0.9);
      ctx.fillStyle = '#ffffff'; ctx.font = '700 84px Georgia, serif'; ctx.fillText(this.best ? formatTime(this.best) : '—', w / 2, 138);
      ctx.fillStyle = '#c9d2ff'; ctx.font = '500 26px system-ui, sans-serif'; ctx.fillText(this.best ? 'in one attempt, from the foot' : 'the bell has not rung yet', w / 2, 214, w * 0.9);
    }, 1.7, 0.85, { both: true });
    const bx = gx - Math.cos(yaw) * 2.9, bz = gz + Math.sin(yaw) * 2.9;
    this.board.mesh.position.set(bx, this.data.heightAt(bx, bz) + 1.25, bz); this.board.mesh.rotation.y = yaw + 0.3; this.board.mesh.name = 'spiral-board';
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

  /** Puts what moves where it is at `now` (s of the clock of the world). */
  _place(now) {
    for (const m of this.mills) { m.g.rotation.y = Math.PI / 2 - (m.a + millAngle(m.t, now)); m.g.updateMatrixWorld(true); }
    for (const b of this.stomps) {
      const soon = stompSoon(b.t, now, b.side);
      b.g.position.y = b.y + stompAt(b.t, now, b.side) + (soon < 0.2 ? Math.sin(now * 70) * 0.035 : 0); // (it trembles before it comes down)
      b.g.updateMatrixWorld(true);
    }
    for (const h of this.hammers) { h.g.rotation.set(-Math.asin(clamp(hammerAt(h.t, now) / h.L, -1, 1)), h.yaw, 0, 'YXZ'); h.g.updateMatrixWorld(true); }
    let used = 0;
    for (const t of this.stretches) barrelsOf(t, now, (b) => {
      const g = this.barrels[used++];
      if (!g) return;
      const p = at(b.s, b.u, t.r + b.fall);
      g.visible = true;
      g.position.copy(p);
      g.rotation.set(0, Math.PI / 2 - angleOf(b.s), b.turn, 'YZX');
      g.updateMatrixWorld(true);
    });
    for (let k = used; k < this.barrels.length; k++) this.barrels[k].visible = false;
  }

  /** Every frame: what moves is where the clock says — the clock of the run while one runs. */
  update() { const st = this.session?.state; this._place(st ? st.t0 + st.total : this.clock() / 1000); }

  /**
   * A run is asked for: the player is put at the foot of the track, and goes. `io`: { play, note }. Returns the
   * session — the driver of the player: step(dt, player, control), camera(camera, dt), line, over (`score`: the
   * time of the attempt that reached the bell, ms), ended, drop(player), close(), auto (true: it runs by itself).
   */
  open(player, io) {
    const st = startRun(this.clock() / 1000), events = [], input = { side: 0, jump: false, down: false, crouch: false }, pose = {};
    const K = { acc: 0, wasY: 0, camS: null, camU: 0, camY: 0, look: V(0, 0, 0), after: 0, lie: 0, count: 9 };
    const _c = V(0, 0, 0), _l = V(0, 0, 0);
    const session = {
      spiral: this, over: false, ended: false, score: 0, time: 0, line: '', riding: false, anim: ANIM.idle, state: st, auto: false,
      step: (dt, pl, control) => {
        const inp = pl.input, my = control ? inp.move.y : 0;
        if (session.auto) {
          // (running by itself, it decides at every step of the run, as the checks do)
          K.acc += Math.min(dt, 0.25);
          while (K.acc >= S.step && !st.over) { K.acc -= S.step; botInput(st, input); stepRun(st, S.step, input, events); }
        } else {
          input.side = control ? inp.move.x : 0; input.jump = control && !!inp.jump;
          input.down = my < -0.5 && K.wasY >= -0.5; input.crouch = my < -0.5; // (down is a push of the stick, counted once; held, the slide goes on a little)
          if (!st.over) stepRun(st, dt, input, events);
        }
        K.wasY = my;
        // (three, two, one before the first attempt)
        if (st.attempt === 1 && st.wait > 0 && Math.ceil(st.wait) !== K.count) { K.count = Math.ceil(st.wait); if (K.count <= 3) io.play('tick'); }
        for (const e of events) this._tell(e, st, io);
        events.length = 0;
        // ---- where the runner is, and how it holds itself
        spiralAt(st.s, st.u, pose);
        const down = st.down > 0, sliding = st.slide > 0 && !st.air && !down;
        if (down && st.why !== 'hole') K.lie = Math.min(1, K.lie + dt * 9); else K.lie = 0;
        pl.pos.set(pose.x, pose.y + st.h - (sliding ? 0.28 : 0) + K.lie * 0.12, pose.z);
        pl.yaw = pose.yaw - clamp(st.vu / S.side, -1, 1) * 0.3; // (it turns a little the way it steers: to the right is towards the rail)
        pl.pitch = sliding ? -0.5 : -1.35 * K.lie; pl.roll = 0;
        pl.speed = st.wait > 0 || down || st.over ? 0 : st.v; pl.grounded = true;
        session.anim = st.over || st.wait > 0 ? ANIM.idle : down ? (st.why === 'hole' ? ANIM.jump : ANIM.sit) : sliding ? ANIM.sit : st.air ? ANIM.jump : ANIM.run;
        // (its shadow, on what is under it: the planks, the top of a crate — nothing over a hole)
        const G = floorAt(st.s, st.u);
        this.blob.visible = Number.isFinite(G) && !down;
        if (this.blob.visible) { const k = clamp(1 - (st.h - G) / 3, 0.45, 1); this.blob.position.set(pose.x, pose.y + G + 0.03, pose.z); this.blob.scale.setScalar(k); this.blob.updateMatrixWorld(true); }
        if (st.over) { K.after += dt; if (!session.over) { session.over = true; session.score = session.time = st.time; } if (K.after > 2.8) session.ended = true; }
        const turn = turnOf(st.s);
        session.line = st.over ? `${S.name} · the bell in ${formatTime(st.time)} · attempt ${st.attempt}`
          : st.attempt === 1 && st.wait > 0 ? `${S.name} · ${Math.ceil(st.wait) > 3 ? 'ready' : Math.ceil(st.wait)}…`
            : `Attempt ${st.attempt} · turn ${turn + 1} of ${S.turns}: ${S.names[turn]} · ${formatTime(Math.round(st.clock * 1000))} · best ${heightOf(st.best).toFixed(1)} m of ${Math.round(heightOf(LENGTH))} up`;
      },
      /**
       * The camera: behind the runner, a little outside the gallery and above it, looking down the track ahead —
       * it goes round with the runner, the tower always on its left and never in the way; back at the foot, it
       * is there at once.
       */
      camera: (cam, dt) => {
        const D = S.cam, cr = S.r + D.out;
        if (K.camS === null || Math.abs(st.s - K.camS) > 12) { K.camU = st.u; K.camY = 0; K.look.set(0, 0, 0); }
        K.camS = st.s;
        K.camU += (st.u - K.camU) * Math.min(1, dt * 4);
        K.camY += (Math.max(0, st.h) - K.camY) * Math.min(1, dt * 3);
        const a = angleOf(st.s) + D.back / cr, y = trackY(st.s) + D.up + K.camY * 0.3;
        _c.set(C.x + Math.cos(a) * (cr + K.camU * 0.35), y, C.z + Math.sin(a) * (cr + K.camU * 0.35));
        const la = angleOf(st.s + D.ahead);
        _l.set(C.x + Math.cos(la) * (S.r + K.camU * 0.5 - 0.7), trackY(st.s + D.ahead) + 0.3 + K.camY * 0.3, C.z + Math.sin(la) * (S.r + K.camU * 0.5 - 0.7));
        if (K.look.lengthSq() === 0) K.look.copy(_l); else K.look.lerp(_l, Math.min(1, dt * 10));
        cam.position.copy(_c); cam.up.set(0, 1, 0); cam.lookAt(K.look);
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
    else if (e.type === 'go') io.play(e.attempt === 1 ? 'start' : 'respawn', { volume: 0.6 });
    else if (e.type === 'turn') { io.play('checkpoint', { volume: 0.6 }); io.note(`Turn ${e.n + 1}: ${S.names[e.n]}`, 1800); }
    else if (e.type === 'out') { io.play(e.why === 'hole' ? 'fail' : 'hit'); io.note(`${WHY[e.why] || 'Out!'} ${heightOf(e.s).toFixed(1)} m up — back to the foot.`, 1700); }
    else if (e.type === 'top') { io.play('bell'); io.play('victory', { volume: 0.7 }); io.note(`The bell! ${formatTime(e.time)}, at attempt ${e.attempt}`, 5000); }
  }
}
