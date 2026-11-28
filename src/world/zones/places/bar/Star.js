// Miss Peony Piston, the star of The Velvet Gasket: a tin diva on hidden wheels, with two fans of feathers. What
// she takes off in her number is hardware — her hat (a light bulb under it), a shoulder plate (a ball and its
// springs), the panel of her chest (cogs that turn), the plate of her back (wiring, and the key she is wound
// with) — and, on the last drum roll, her whole shell opens like a wardrobe and a smaller robot steps out of it.
// Nothing here but casing: no anatomy to speak of. Everything she does is read from the clock of the show
// (plan.js: showAt), so that everybody in the room sees the same gesture at the same moment.
import * as THREE from 'three';
import { MeshBuilder } from '../../../props/MeshBuilder.js';
import { SHOW, smooth } from './plan.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ENAMEL = [0.86, 0.13, 0.3], GOLD = [0.98, 0.7, 0.2], CREAM = [0.97, 0.9, 0.78], DARK = [0.05, 0.04, 0.045], STEEL = [0.55, 0.58, 0.62], COPPER = [0.8, 0.42, 0.22], PINK = [1, 0.62, 0.75], WHITE = [1, 0.97, 0.93];
/** Her casing, from the hem of her skirt to the top of her head: [radius, height]. */
const SHELL = [[0.5, 0.03], [0.535, 0.1], [0.5, 0.26], [0.42, 0.5], [0.33, 0.72], [0.27, 0.9], [0.262, 0.97], [0.3, 1.05], [0.335, 1.2], [0.33, 1.34], [0.27, 1.45], [0.11, 1.5], [0.1, 1.55], [0.17, 1.6], [0.215, 1.7], [0.2, 1.8], [0.13, 1.88], [0.02, 1.92]];
/** The colour of the casing at a height. */
const band = (y) => (y < 0.07 || (y > 0.88 && y < 0.99) ? GOLD : y < 1.47 ? ENAMEL : y < 1.58 ? STEEL : CREAM);
const LIT = 1.75; // how bright she stands in the lights of the stage (the game's caves: 0.2 in the dark, 1.9 by a lantern)
const rgba = (c, k = 1) => [c[0], c[1], c[2], LIT * k];
const mesh = (b, material, name) => { const m = new THREE.Mesh(b.build(), material); m.name = name; return m; };

/** Half of the casing: the side where x has the sign of `s`. */
function half(s) {
  const b = new MeshBuilder(), pts = SHELL.map(([r, y]) => new THREE.Vector2(r, y));
  const lathe = (k, shade) => {
    const from = b.count;
    b.add(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x * k, p.y)), 9, s > 0 ? 0 : Math.PI, Math.PI));
    for (let i = from; i < b.count; i++) { const c = shade || band(b.pos[i * 3 + 1]); b.col.splice(i * 4, 4, c[0], c[1], c[2], LIT * (shade ? 0.5 : 1)); }
  };
  lathe(1, null);
  lathe(0.93, DARK); // (its inside, seen once it has opened)
  // an eye lid and its lashes, a button or two down the front
  for (let k = 0; k < 3; k++) b.tint(...rgba(DARK)).rod(V(s * (0.05 + k * 0.03), 1.765, 0.2), V(s * (0.045 + k * 0.045), 1.82 + (k === 1 ? 0.012 : 0), 0.215), 0.006, 4);
  b.tint(...rgba(GOLD));
  for (const y of [0.3, 0.52]) b.push(new THREE.Matrix4().makeTranslation(s * 0.035, y, 0.5 - (y - 0.26) * 0.34)).cylinder(0, 0, 0, 0.03, 0.02, 0.03, 8).pop();
  return b;
}

/** A cog: a disc with teeth, turning about z. */
function cog(r, teeth, tone) {
  const b = new MeshBuilder();
  b.tint(...rgba(tone)).push(new THREE.Matrix4().makeRotationX(Math.PI / 2)).cylinder(0, -0.012, 0, r, r, 0.024, 14, { capBottom: true }).cylinder(0, -0.02, 0, r * 0.3, r * 0.3, 0.04, 8, { capBottom: true }).pop();
  for (let k = 0; k < teeth; k++) { const a = (k / teeth) * Math.PI * 2; b.push(new THREE.Matrix4().makeRotationZ(a)).box(r - 0.005, -r * 0.13, -0.012, r + r * 0.22, r * 0.13, 0.012).pop(); }
  return b;
}

/** A curved plate of the casing, round the angle `mid` (0: her front), from height y0 to y1 — about its own middle. */
function plate(b, mid, spread, r, y0, y1, yc) {
  const N = 6;
  for (let k = 0; k < N; k++) {
    const a0 = mid - spread + (2 * spread * k) / N, a1 = mid - spread + (2 * spread * (k + 1)) / N;
    b.quad(V(Math.sin(a0) * r, y0 - yc, Math.cos(a0) * r), V(Math.sin(a1) * r, y0 - yc, Math.cos(a1) * r), V(Math.sin(a1) * r, y1 - yc, Math.cos(a1) * r), V(Math.sin(a0) * r, y1 - yc, Math.cos(a0) * r));
  }
  return b;
}

/** A fan of feathers, held at `at`, opening about the way `up` points (in the plane that faces her front). */
function fan(b, at, lean) {
  const N = 9;
  b.push(new THREE.Matrix4().makeTranslation(at.x, at.y, at.z).multiply(new THREE.Matrix4().makeRotationX(lean)));
  for (let k = 0; k < N; k++) {
    const a = ((k / (N - 1)) - 0.5) * 2.5, L = 0.62 - 0.1 * Math.abs(k - 4) / 4, z = (k % 2) * 0.006 - 0.003;
    b.tint(...rgba(k % 2 ? WHITE : PINK));
    b.push(new THREE.Matrix4().makeRotationZ(-a));
    b.quad(V(0, 0, z), V(0.075, L * 0.62, z), V(0, L, z), V(-0.075, L * 0.62, z));
    b.pop();
  }
  b.tint(...rgba(GOLD)).cylinder(0, -0.09, 0, 0.018, 0.022, 0.12, 6);
  b.pop();
}

/**
 * Builds her (in `materials`: the world's `paint` and `doubleSided`, its `glow`). Returns { group (what moves with
 * her: put it on the stage), loose (what comes off: put it in the same frame as the group), pose(show, o) }.
 *   stage: { x, y, z } the middle of the boards she stands on; lands: where each piece falls (x, z offsets).
 */
export function buildStar(materials, stage) {
  const group = new THREE.Group(), loose = new THREE.Group();
  group.name = 'bar-star'; loose.name = 'bar-star-pieces';
  group.position.set(stage.x, stage.y, stage.z);
  const thin = materials.doubleSided, solid = materials.paint, glow = materials.glow;
  // ---- the plinth she rolls on
  { const b = new MeshBuilder(); b.tint(...rgba(DARK, 0.8)).cylinder(0, 0, 0, 0.56, 0.54, 0.05, 16).tint(...rgba(GOLD, 0.9)).cylinder(0, 0.012, 0, 0.575, 0.575, 0.022, 16, { capTop: false }); group.add(mesh(b, solid, 'bar-star:plinth')); }
  // ---- the two halves of her casing, each with its eye, its arm and its fan
  const halves = [1, -1].map((s) => {
    const g = new THREE.Group();
    g.add(mesh(half(s), thin, 'bar-star:shell'));
    const e = new MeshBuilder();
    e.tint(0.25, 0.85, 1, 1).add(new THREE.SphereGeometry(0.036, 8, 6), new THREE.Matrix4().makeTranslation(s * 0.078, 1.73, 0.186));
    const eye = mesh(e, glow, 'bar-star:eye');
    g.add(eye);
    // the arm: from the shoulder down to the hand, and the fan in it — it turns about the shoulder
    const arm = new THREE.Group(), a = new MeshBuilder();
    arm.position.set(s * 0.375, 1.4, 0);
    a.tint(...rgba(STEEL)).rod(V(0, 0, 0), V(0, -0.28, 0.03), 0.035, 6).rod(V(0, -0.28, 0.03), V(0, -0.52, 0.14), 0.03, 6);
    a.tint(...rgba(GOLD)).add(new THREE.SphereGeometry(0.05, 7, 5), new THREE.Matrix4().makeTranslation(0, -0.28, 0.03)).add(new THREE.SphereGeometry(0.045, 7, 5), new THREE.Matrix4().makeTranslation(0, -0.52, 0.14));
    fan(a, V(0, -0.5, 0.15), 0.6);
    arm.add(mesh(a, thin, 'bar-star:arm'));
    g.add(arm);
    group.add(g);
    return { g, arm, eye, s };
  });
  // ---- what is under the plates: a bulb, a shoulder joint, cogs, wiring and a key
  const bulb = (() => { const b = new MeshBuilder(); b.tint(1, 0.85, 0.4, 1).add(new THREE.SphereGeometry(0.07, 8, 6), new THREE.Matrix4().makeTranslation(0.001, 2.02, 0)); const m = mesh(b, glow, 'bar-star:bulb'); const s = new MeshBuilder(); s.tint(...rgba(STEEL)).cylinder(0.001, 1.9, 0, 0.035, 0.03, 0.07, 8); const g = new THREE.Group(); g.add(m, mesh(s, solid, 'bar-star:socket')); halves[0].g.add(g); return g; })();
  const joint = (() => { const b = new MeshBuilder(); b.tint(...rgba(STEEL)).add(new THREE.SphereGeometry(0.075, 8, 6), new THREE.Matrix4().makeTranslation(0.375, 1.42, 0)); for (let k = 0; k < 3; k++) b.tint(...rgba(COPPER)).cylinder(0.375 - 0.04 * k, 1.47 + 0.028 * k, 0, 0.085 - 0.012 * k, 0.085 - 0.012 * k, 0.012, 10); const m = mesh(b, solid, 'bar-star:joint'); halves[0].g.add(m); return m; })();
  const works = new THREE.Group(), cogs = [];
  {
    const w = new MeshBuilder();
    w.tint(...rgba(DARK, 0.6));
    plate(w, 0, 0.62, 0.343, 1.03, 1.39, 0);
    for (const [x, y, r, teeth, tone, speed, side] of [[0.11, 1.24, 0.12, 10, GOLD, 1.4, 0], [-0.1, 1.31, 0.075, 8, COPPER, -2.24, 1], [-0.085, 1.13, 0.085, 8, STEEL, 1.98, 1]]) {
      const c = mesh(cog(r, teeth, tone), solid, 'bar-star:cog');
      c.position.set(x, y, Math.sqrt(Math.max(0.01, 0.352 ** 2 - x * x)) + 0.012);
      c.rotation.y = Math.atan2(x, 0.34) * 0.8;
      c.userData.speed = speed;
      cogs.push(c);
      halves[side].g.add(c);
    }
    works.add(mesh(w, thin, 'bar-star:works'));
    const v = new MeshBuilder();
    v.tint(1, 0.3, 0.2, 1).add(new THREE.SphereGeometry(0.035, 7, 5), new THREE.Matrix4().makeTranslation(0.02, 1.1, 0.352));
    const valve = mesh(v, glow, 'bar-star:valve');
    works.add(valve);
    works.userData.valve = valve;
    group.add(works);
  }
  const back = new THREE.Group(), key = new THREE.Group();
  {
    const w = new MeshBuilder();
    w.tint(...rgba(DARK, 0.6));
    plate(w, Math.PI, 0.62, 0.343, 1.03, 1.39, 0);
    for (const [k, c] of [[0, [0.9, 0.15, 0.1]], [1, [0.95, 0.8, 0.15]], [2, [0.15, 0.45, 0.9]], [3, [0.2, 0.75, 0.3]]]) {
      const y = 1.33 - k * 0.085;
      w.tint(...rgba(c)).rod(V(-0.17, y, -0.31), V(-0.04, y - 0.03, -0.356), 0.011, 5).rod(V(-0.04, y - 0.03, -0.356), V(0.17, y + 0.02, -0.31), 0.011, 5);
    }
    back.add(mesh(w, thin, 'bar-star:wiring'));
    const kb = new MeshBuilder();
    kb.tint(...rgba(GOLD)).rod(V(0, 0, 0), V(0, 0, -0.2), 0.018, 6);
    kb.add(new THREE.TorusGeometry(0.075, 0.018, 5, 12), new THREE.Matrix4().makeTranslation(-0.085, 0, -0.2)).add(new THREE.TorusGeometry(0.075, 0.018, 5, 12), new THREE.Matrix4().makeTranslation(0.085, 0, -0.2));
    key.add(mesh(kb, solid, 'bar-star:key'));
    key.position.set(0, 1.16, -0.34);
    back.add(key);
    group.add(back);
  }
  // ---- what comes off: built about its own middle, put where it belongs each frame
  const pieces = [];
  // (rest: where it sits on her; land: where it falls, from the middle of the boards [x, z, how high its own middle lies]; lie: how it lies there)
  const piece = (name, b, material, rest, land, lie) => { const m = mesh(b, material, `bar-star:${name}`); loose.add(m); pieces.push({ m, rest, land, lie }); };
  {
    const b = new MeshBuilder();
    b.tint(...rgba(DARK, 0.9)).cylinder(0, 0, 0, 0.36, 0.36, 0.014, 16, { capBottom: true }).cylinder(0, 0.014, 0, 0.19, 0.17, 0.17, 12);
    b.tint(...rgba(GOLD)).cylinder(0, 0.014, 0, 0.196, 0.196, 0.04, 12, { capTop: false });
    for (const [k, c] of [[0, PINK], [1, WHITE], [2, PINK]]) {
      b.tint(...rgba(c)).push(new THREE.Matrix4().makeTranslation(-0.12, 0.1, -0.05).multiply(new THREE.Matrix4().makeRotationZ(0.5 + k * 0.32)).multiply(new THREE.Matrix4().makeRotationY(0.3 * k)));
      b.quad(V(0, 0, 0), V(0.085, 0.3, 0), V(0, 0.56, 0), V(-0.085, 0.3, 0)).pop();
    }
    piece('hat', b, thin, V(0, 1.895, 0), [-2.35, -1.2, 0.03], [0, 0.3, 0]);
  }
  { const b = new MeshBuilder(); b.tint(...rgba(GOLD)).add(new THREE.SphereGeometry(0.155, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2)); b.tint(...rgba(ENAMEL)).cylinder(0, 0.14, 0, 0.03, 0.01, 0.05, 6); piece('plate', b, thin, V(0.375, 1.4, 0), [2.4, -0.9, 0.17], [Math.PI, 0, 0.2]); }
  for (const [name, mid, to] of [['chest', 0, [-1.55, 0.9, 0.4]], ['back', Math.PI, [1.85, 1.1, 0.4]]]) {
    const b = new MeshBuilder();
    b.tint(...rgba(GOLD));
    plate(b, mid, 0.68, 0.378, 1.0, 1.42, 1.21);
    // (a flower of enamel on it: five petals round a stud)
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; b.tint(...rgba(ENAMEL)).push(new THREE.Matrix4().makeRotationY(mid).multiply(new THREE.Matrix4().makeTranslation(Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0.384)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))).cylinder(0, 0, 0, 0.045, 0.045, 0.008, 8).pop(); }
    piece(name, b, thin, V(0, 1.21, 0), to, [Math.PI / 2 * (mid ? -1 : 1), 0.4, 0]);
  }
  const mid = 0.5 * (SHOW.turn[0] + SHOW.turn[1]);
  /** Where she is at `t` (s into the number): how far aside, how high, turned how far. */
  const body = (t) => {
    const calm = smooth(2.5, 5, t) * (1 - smooth(56.5, 59, t));
    const turn = (smooth(SHOW.turn[0], SHOW.turn[0] + 1.6, t) - smooth(SHOW.turn[1] - 1.6, SHOW.turn[1], t)) * Math.PI;
    return { x: 1.1 * Math.sin(t * 0.52) * calm * (1 - 0.8 * smooth(mid - 4, mid - 2.4, t) * (1 - smooth(mid + 2.4, mid + 4, t))), y: 0.03 * Math.abs(Math.sin(t * 2.1)) * calm, yaw: 0.3 * Math.sin(t * 1.05) * calm + turn };
  };
  const q = new THREE.Quaternion(), e = new THREE.Euler(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
  const place = (o, at, rest) => {
    const yaw = Math.PI + at.yaw, c = Math.cos(yaw), s = Math.sin(yaw);
    return o.set(stage.x + at.x + rest.x * c + rest.z * s, stage.y + at.y + rest.y, stage.z - rest.x * s + rest.z * c);
  };
  const back1 = (k) => { const c = 1.70158, u = k - 1; return 1 + (c + 1) * u * u * u + c * u * u; }; // (it overshoots, and settles)
  const bell = (a, b, x) => (x <= a || x >= b ? 0 : Math.sin(((x - a) / (b - a)) * Math.PI));
  /**
   * Puts her as the show has her at this moment. o: { flourish (0 … 1: a flower has just landed), time (s, for what
   * only turns) }. Returns { open (0 … 1: how far the shell stands open), at (her body) }.
   */
  function pose(show, o = {}) {
    const t = show.on ? show.t : 0, n = show.on ? show.n : 0, at = body(t), fl = o.flourish || 0, time = o.time || 0;
    const openK = n >= 5 ? back1(Math.min(1, (t - SHOW.off[4]) / 0.9)) : 0;
    // (a flower on the stage: she spins once on herself, both fans up)
    const spin = n >= 5 ? 0 : fl > 0 ? smooth(0, 1, 1 - fl) * Math.PI * 2 : 0;
    group.position.set(stage.x + at.x, stage.y + at.y, stage.z);
    group.rotation.y = Math.PI + at.yaw + spin;
    // the fans: they open and shut as she dances; shut before each piece comes off, thrown wide as it does
    let hide = 0, show1 = 0;
    for (let i = 0; i < 4; i++) { hide = Math.max(hide, smooth(SHOW.off[i] - 2.2, SHOW.off[i] - 1.2, t) * (1 - smooth(SHOW.off[i] - 0.15, SHOW.off[i], t))); show1 = Math.max(show1, smooth(SHOW.off[i] - 0.15, SHOW.off[i] + 0.15, t) * (1 - smooth(SHOW.off[i] + 1.4, SHOW.off[i] + 2.2, t))); }
    const up = Math.max(fl > 0 ? bell(0, 1, fl) : 0, bell(SHOW.off[0] - 0.9, SHOW.off[0] + 0.5, t));
    for (const h of halves) {
      const k = 0.5 + 0.5 * Math.sin(t * 1.25 + h.s * 0.9);
      let rx = -0.95 + 0.6 * k, rz = -0.38 + 1.5 * k;
      rx += (-0.95 - rx) * hide; rz += (-0.42 - rz) * hide;
      rx += (-0.35 - rx) * show1; rz += (1.25 - rz) * show1;
      const u = h.s > 0 || fl > 0 ? up : 0;
      rx += (-2.7 - rx) * u; rz += (0.25 - rz) * u;
      if (n >= 5) { rx = -0.5; rz = 0.9; }
      h.arm.rotation.set(rx, 0, rz * h.s);
      // the shell: its two halves swing apart, as the doors of a wardrobe do
      h.g.position.x = h.s * 0.72 * openK;
      h.g.rotation.y = h.s * 0.55 * openK;
    }
    bulb.visible = n >= 1;
    bulb.scale.setScalar(n >= 1 ? 0.8 + 0.2 * back1(Math.min(1, (t - SHOW.off[0]) / 0.4)) : 1);
    joint.visible = true;
    works.visible = n >= 3 && n < 5;
    for (const c of cogs) { c.visible = n >= 3; c.rotation.z = time * c.userData.speed; }
    works.userData.valve.scale.setScalar(0.85 + 0.25 * Math.abs(Math.sin(time * 3)));
    back.visible = n >= 4 && n < 5;
    key.scale.setScalar(n >= 4 ? back1(Math.min(1, (t - SHOW.off[3]) / 0.5)) : 0.001);
    key.rotation.z = time * 1.6;
    // what has come off flies to where it lies; the rest sits on her
    const now = { x: at.x, y: at.y, yaw: at.yaw + spin };
    pieces.forEach((pc, i) => {
      const age = t - SHOW.off[i];
      if (!show.on || age < 0) {
        place(pc.m.position, now, pc.rest);
        pc.m.rotation.set(0, Math.PI + now.yaw, 0);
        return;
      }
      const k = Math.min(1, age / 1.05), from = body(SHOW.off[i]);
      place(p0, from, pc.rest);
      p1.set(stage.x + pc.land[0], stage.y + pc.land[2], stage.z + pc.land[1]);
      pc.m.position.lerpVectors(p0, p1, k);
      pc.m.position.y += 1.5 * 4 * k * (1 - k) * (1 - 0.25 * k);
      e.set(pc.lie[0] * k + (1 - k) * 9 * k, Math.PI + from.yaw + pc.lie[1] * k, pc.lie[2] * k + (1 - k) * 6 * k);
      pc.m.quaternion.copy(q.setFromEuler(e));
    });
    return { open: openK, at };
  }
  /** The top of her head, for what is written over it. */
  const head = (out = new THREE.Vector3()) => out.set(group.position.x, group.position.y + 2.35, group.position.z);
  return { group, loose, pose, body, head, halves, pieces, cogs };
}
