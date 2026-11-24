// The four games of the pier head, as the page plays them and as the server plays them again (server/replay.js):
// nothing here knows the 3D library, a screen or a network. Each is a function that paints what stands still
// into `parts`, makes what moves with `mesh(geometry, name, material)` — and, for what a mesh alone cannot do,
// with `more` (a pool of instances, a mesh rebuilt every frame, matrices: all from the page; on the server,
// things that do nothing) — and returns the game: { view, firstPerson, crosshair, reset(seed),
// step(dt, t, time, aim, io), score… }. What is left to chance is drawn from the seed the game was reset with
// (none: the device's own dice — a booth nobody plays at idles along).
import { V, lerp, clamp01, HALF, BACK, FRONT, WHITE, geometry, disc, dice, host, sin, cos, hypot, exp } from './core.js';

/** id (also the board of its scores), name, where it stands on the pier (along, side), its colour, how long a game lasts. */
export const PIER_BOOTHS = [
  { id: 'shoot', name: 'Bullseye Alley', along: 81, side: -19, color: [0.85, 0.18, 0.14], seconds: 45, how: 'Click the targets as they show: the small ones at the back are worth more. Leave the black ones alone!' },
  { id: 'mole', name: 'Whack-a-Mole', along: 81, side: 19, color: [0.1, 0.6, 0.62], seconds: 45, how: 'Click the moles as they come up. Golden ones are worth three; a hard hat takes two blows. Leave the rabbits alone!' },
  { id: 'milk', name: 'Feed the Clown', along: 123, side: -18, color: [0.95, 0.66, 0.08], seconds: 45, how: 'Hold the button down and keep the jet of milk in his mouth. He will not stay still.' },
  { id: 'bell', name: 'Ring the Bell', along: 123, side: 18, color: [0.2, 0.42, 0.85], seconds: 0, how: 'Three blows. Strike when the needle is right at the top — it goes through in a blink. The best one counts.' },
];

/** The high striker: what a blow is worth (0 to 9,999) when the needle stands at `g` (0 at the bottom, 1 at the top)… */
export const STRIKE = (g) => { const k = clamp01(g); return Math.round(9999 * k * k * k * k * k); };
/** …and how far up the tower (0 to 1) that sends the puck. */
const SCALE_INV = (points) => points / 9999;

// ---------------------------------------------------------------------------
// Bullseye Alley: hardly anything runs on rails. Targets pop up from behind three rows of painted bushes (the
// far ones smaller, and worth more), some sliding along once they are up; others are thrown across the booth,
// or swing down from the ceiling on a cord; a golden one flashes past; and a black one must be left alone.
// Now and then, though, a train of targets does go by on one of two rails: something steady to break the
// rhythm (and, later in the game, a black one riding in the middle of it).
// Everything comes quicker and stays less long as the game goes on.

function shoot(parts, booth, mesh, more) {
  let roll = Math.random; // (what is left to chance: drawn from the seed of the game when it is played for a score)
  const paint = parts.get('paint');
  const COVER = [{ z: -2.0, top: 1.2, r: 0.25, pts: 10 }, { z: -2.75, top: 1.68, r: 0.2, pts: 20 }, { z: -3.5, top: 2.16, r: 0.155, pts: 30 }];
  COVER.forEach((cv, k) => {
    const g = [0.15 + 0.06 * k, 0.5 - 0.07 * k, 0.2 + 0.03 * k];
    paint.tint(g[0], g[1], g[2], 1).box(-HALF, 0, cv.z - 0.05, HALF, cv.top - 0.13, cv.z, { faces: 'ZY' });
    for (let i = 0; i < 12; i++) {
      const x = -HALF + 0.25 + i * 0.5, pts = [];
      for (let a = 0; a <= 6; a++) pts.push(V(x + cos((Math.PI * a) / 6) * 0.28, cv.top - 0.13 + sin((Math.PI * a) / 6) * (0.13 + 0.04 * ((i + k) % 2)), cv.z + 0.003));
      paint.tint(g[0] * (0.92 + 0.16 * (i % 2)), g[1] * (0.92 + 0.16 * (i % 2)), g[2], 1).poly(pts);
    }
  });
  more.backdrop?.(); // (the backdrop is a sponsor's tarp: the page hangs it)

  // the two rails (a dark bar the targets ride on): one in front of the middle row, one in front of the last
  const RAILS = [{ z: -2.38, y: 1.5, r: 0.2, pts: 15 }, { z: -3.18, y: 2.02, r: 0.16, pts: 35 }];
  for (const r of RAILS) paint.tint(0.17, 0.17, 0.2, 1).box(-HALF, r.y - r.r - 0.045, r.z - 0.025, HALF, r.y - r.r - 0.005, r.z + 0.025, { faces: 'ZY' });
  const RED = [0.85, 0.12, 0.1], MAX = 16, BOMBS = 3;
  const pool = (geo, n, name) => more.pool(geo, n, name, 'paint');
  const discs = pool(geometry((b) => disc(b, [[1, RED], [0.68, WHITE], [0.36, RED]])), MAX, 'targets');
  const bombs = pool(geometry((b) => { disc(b, [[1, [0.05, 0.05, 0.06]], [0.82, [0.16, 0.16, 0.18]]]); b.tint(1.4, 0.1, 0.08, 1).place(0, 0, 0.03, 0, 0, Math.PI / 4).box(-0.62, -0.1, 0, 0.62, 0.1, 0.01).box(-0.1, -0.62, 0, 0.1, 0.62, 0.01).pop(); }), BOMBS, 'bombs');
  const gold = mesh(geometry((b) => disc(b, [[1, [1.5, 1.05, 0.2]], [0.55, [1.7, 1.4, 0.5]]], 10)), 'gold');
  gold.scale.setScalar(0.11);
  const slots = Array.from({ length: MAX + BOMBS }, (_, i) => ({ on: false, bomb: i >= MAX, kind: '', x: 0, y: 0, z: 0, r: 0.2, pts: 0, t: 0, life: 0, vx: 0, vy: 0, x0: 0, y0: 0, len: 1, w: 1, ph: 0, top: 0, hit: 0 }));
  const G = { on: false, t: 0, x0: 0, dir: 1, y: 2.0, wait: 8 };
  const m4 = more.M4(), q = more.Q(), e = more.E(), s3 = V(0, 0, 0), p3 = V(0, 0, 0);
  const rnd = (a, b) => a + roll() * (b - a);
  let gap = 0.5, rail = 5;
  // a train: three to five targets, evenly spaced, at a steady pace along one rail
  const train = (t) => {
    const p = t < 0 ? 0 : clamp01(t / 45), on = RAILS[roll() < 0.55 ? 0 : 1], dir = roll() < 0.5 ? 1 : -1;
    const n = 3 + Math.floor(roll() * 3), speed = rnd(1.5, 2.1) * (1 + 0.5 * p), black = t > 16 && roll() < 0.6 ? Math.floor(roll() * n) : -1;
    for (let k = 0; k < n; k++) {
      const bomb = k === black, s = slots.find((o) => !o.on && o.bomb === bomb);
      if (!s) continue;
      Object.assign(s, { on: true, kind: 'rail', t: 0, hit: 0, x0: -dir * (HALF + 0.3 + k * 0.62), x: -dir * (HALF + 0.3 + k * 0.62), vx: dir * speed, vy: 0, y: on.y, z: on.z, r: bomb ? on.r * 0.95 : on.r, pts: bomb ? -40 : on.pts, life: 99 });
    }
  };
  const spawn = (t) => {
    const p = t < 0 ? 0 : clamp01(t / 45), r = roll();
    const bomb = t > 9 && r < 0.14, kind = bomb ? 'pop' : t > 6 && r < 0.14 + 0.2 + 0.12 * p ? 'fly' : t > 18 && r < 0.14 + 0.2 + 0.12 * p + 0.16 ? 'swing' : 'pop';
    const s = slots.find((o) => !o.on && o.bomb === bomb);
    if (!s) return;
    Object.assign(s, { on: true, kind, t: 0, hit: 0, vx: 0, vy: 0 });
    if (kind === 'pop') {
      const cv = COVER[Math.floor(roll() * 3)];
      let x = 0;
      for (let k = 0; k < 6; k++) { x = rnd(-2.6, 2.6); if (!slots.some((o) => o.on && o !== s && o.kind === 'pop' && o.z === cv.z && Math.abs(o.x - x) < 0.75)) break; }
      Object.assign(s, { x, z: cv.z + 0.04, top: cv.top, r: bomb ? cv.r * 0.95 : cv.r, pts: bomb ? -40 : cv.pts, life: (t < 0 ? 1.8 : lerp(1.5, 0.7, p)) * rnd(0.8, 1.25), vx: t > 12 && roll() < 0.45 ? rnd(0.5, 1.5) * (roll() < 0.5 ? -1 : 1) : 0 });
    } else if (kind === 'fly') {
      const dir = roll() < 0.5 ? 1 : -1;
      Object.assign(s, { x0: -dir * (HALF + 0.3), y0: rnd(1.3, 1.9), vx: dir * rnd(2.6, 4.2) * (1 + 0.35 * p), vy: rnd(2.2, 3.6), z: rnd(-3.1, -2.2), r: 0.17, pts: 40, life: 9 });
    } else Object.assign(s, { x0: rnd(-2.1, 2.1), y0: 3.02, len: rnd(0.9, 1.35), w: rnd(2.2, 3.4) * (1 + 0.3 * p), ph: rnd(0, 6.28), z: -3.15, r: 0.19, pts: 25, life: rnd(3.2, 4.6) });
  };
  const game = {
    view: { pos: [0, 1.72, 2.5], look: [0, 1.75, -3], fov: 58 }, firstPerson: true, crosshair: true,
    reset(seed) { roll = dice(seed); game.score = 0; game.streak = 0; game.reload = 0; gap = 0.4; rail = rnd(4, 7); for (const s of slots) s.on = false; G.on = false; G.wait = 14; },
    /** t: seconds played (-1 while nobody plays: a target shows now and then), time: the clock of the world */
    step(dt, t, time, aim, io) {
      const p = t < 0 ? 0 : clamp01(t / 45);
      if ((gap -= dt) <= 0) { gap = t < 0 ? rnd(1.2, 2.4) : lerp(0.62, 0.27, p) * rnd(0.7, 1.3); spawn(t); }
      if ((rail -= dt) <= 0) { rail = t < 0 ? rnd(7, 12) : rnd(6.5, 11); train(t); }
      let d = 0, b = 0;
      for (const s of slots) {
        let scale = 0, tip = 0;
        if (s.on) {
          s.t += dt;
          if (s.hit > 0) { s.hit -= dt; tip = 1 - s.hit / 0.22; scale = s.r * Math.max(0.2, s.hit / 0.22); if (s.hit <= 0) s.on = false; }
          else if (s.kind === 'pop') {
            const up = Math.min(1, s.t / 0.16, (s.life - s.t) / 0.16);
            if (s.t >= s.life) s.on = false;
            s.x += s.vx * dt; if (Math.abs(s.x) > 2.7) { s.x = Math.sign(s.x) * 2.7; s.vx = -s.vx; }
            { const u = Math.max(0, up); s.y = s.top - s.r * 1.1 + s.r * 2.05 * (0.6 * Math.sqrt(u) + 0.4 * u); } // (it springs up fast, then eases)
            scale = s.r;
          } else if (s.kind === 'rail') {
            s.x = s.x0 + s.vx * s.t;
            if (Math.abs(s.x) > HALF + 0.3 && s.x * s.vx > 0) s.on = false;
            scale = Math.abs(s.x) > HALF - 0.04 ? 0 : s.r; // (it comes in through the wall)
          } else if (s.kind === 'fly') {
            s.x = s.x0 + s.vx * s.t; s.y = s.y0 + s.vy * s.t - 2.7 * s.t * s.t;
            if (Math.abs(s.x) > HALF + 0.35 || s.y < 0.9) s.on = false;
            scale = s.r; tip = 0.25 * sin(s.t * 9);
          } else {
            const grow = Math.min(1, s.t / 0.3, (s.life - s.t) / 0.3), a = 0.95 * sin(s.w * s.t + s.ph), len = 0.15 + (s.len - 0.15) * Math.max(0, grow);
            if (s.t >= s.life) s.on = false;
            s.x = s.x0 + sin(a) * len; s.y = s.y0 - cos(a) * len;
            scale = s.r;
          }
        }
        const pooled = s.bomb ? bombs : discs;
        if (host.shown) pooled.setMatrixAt(s.bomb ? b++ : d++, m4.compose(p3.set(s.x, s.y, s.z), q.setFromEuler(e.set(-1.45 * tip, 0, 0)), s3.setScalar(s.on ? scale : 0)));
      }
      discs.instanceMatrix.needsUpdate = true; bombs.instanceMatrix.needsUpdate = true;
      // the golden one: fast, in waves
      if (G.on) { G.t += dt; if (G.t * 3.6 * (1 + 0.3 * p) > HALF * 2 + 0.7) G.on = false; }
      else if (t > 0 && (G.wait -= dt) <= 0) { G.on = true; G.t = 0; G.dir = roll() < 0.5 ? 1 : -1; G.y = rnd(1.7, 2.5); G.wait = rnd(5, 9); }
      const gx = G.dir * (-HALF - 0.35 + G.t * 3.6 * (1 + 0.3 * p)), gy = G.y + 0.28 * sin(G.t * 7);
      gold.visible = G.on;
      gold.position.set(gx, gy, -3.3);
      if (t < 0 || !aim) return;
      game.reload -= dt;
      if (aim.clicks && game.reload <= 0) {
        game.reload = 0.25;
        io.play('shot', { volume: 0.7 });
        const at = (z) => { const u = (z - aim.o.z) / aim.d.z; return [aim.o.x + aim.d.x * u, aim.o.y + aim.d.y * u]; };
        let hit = null, pts = 0;
        for (const s of slots) { if (!s.on || s.hit > 0 || Math.abs(s.x) > HALF) continue; const [hx, hy] = at(s.z); if (hypot(hx - s.x, hy - s.y) < s.r * 1.12 && (!hit || s.z > hit.z)) hit = s; }
        if (G.on) { const [hx, hy] = at(-3.3); if (hypot(hx - gx, hy - gy) < 0.17) { pts = 100; G.on = false; hit = null; } }
        if (hit) { pts = hit.pts; hit.hit = 0.22; }
        // (a row of hits pays a little more each time; the black one takes points away)
        if (pts > 0) { game.score += pts + Math.min(15, game.streak * 3); game.streak++; io.play(pts === 100 ? 'score' : 'hit'); }
        else if (pts < 0) { game.score = Math.max(0, game.score + pts); game.streak = 0; io.play('fail', { volume: 0.7 }); io.note('Not the black one! −40'); }
        else { game.streak = 0; io.play('miss', { volume: 0.4 }); }
      }
    },
  };
  game.reset();
  return game;
}

// ---------------------------------------------------------------------------
// Whack-a-Mole: nine holes in a sloping table

function mole(parts, booth, mesh, more) {
  let roll = Math.random; // (what is left to chance: drawn from the seed of the game when it is played for a score)
  const paint = parts.get('paint'), wood = parts.get('woodDark');
  const top = (z) => 0.98 - z * 0.2; // the table rises towards the back
  const holes = [];
  for (const z of [-0.45, -1.4, -2.35]) for (const x of [-1.55, 0, 1.55]) holes.push({ x, z, y: top(z), up: 0, state: 0, kind: 0, timer: 0, squash: 0 });
  // the table: green baize, dark rings where the holes are, a wooden rim
  paint.tint(0.14, 0.5, 0.22, 1).quad(V(-HALF, top(0.45), 0.45), V(HALF, top(0.45), 0.45), V(HALF, top(-3.2), -3.2), V(-HALF, top(-3.2), -3.2));
  paint.tint(0.1, 0.36, 0.16, 1).quad(V(-HALF, 0, 0.5), V(HALF, 0, 0.5), V(HALF, top(0.45), 0.45), V(-HALF, top(0.45), 0.45));
  // (mown in stripes, a molehill of fresh earth round each hole, daisies between them)
  for (let k = 0; k < 6; k++) { const z0 = 0.45 - k * 0.61, z1 = z0 - 0.61; if (k % 2) paint.tint(0.18, 0.58, 0.26, 1).quad(V(-HALF, top(z0) + 0.004, z0), V(HALF, top(z0) + 0.004, z0), V(HALF, top(z1) + 0.004, z1), V(-HALF, top(z1) + 0.004, z1)); }
  const ring = (h, r, lift, c) => {
    const pts = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; pts.push(V(h.x + cos(a) * r, top(h.z - sin(a) * r) + lift, h.z - sin(a) * r)); }
    paint.tint(c[0], c[1], c[2], 1).poly(pts);
  };
  for (const h of holes) { ring(h, 0.5, 0.008, [0.36, 0.25, 0.15]); ring(h, 0.43, 0.012, [0.28, 0.19, 0.11]); ring(h, 0.36, 0.016, [0.04, 0.03, 0.03]); }
  for (let k = 0; k < 16; k++) {
    const x = -2.7 + ((k * 37) % 55) / 10, z = 0.2 - ((k * 23) % 31) / 10;
    if (holes.some((h) => hypot(h.x - x, h.z - z) < 0.62)) continue;
    paint.tint(1.5, 1.5, 1.45, 1).place(x, top(z) + 0.02, z, k).cylinder(0, 0, 0, 0.05, 0.05, 0.012, 6).pop();
    paint.tint(1.5, 1.1, 0.15, 1).place(x, top(z) + 0.03, z).cylinder(0, 0, 0, 0.02, 0.02, 0.012, 5).pop();
  }
  wood.tint(0.6, 0.45, 0.3, 1).box(-HALF, top(-3.2), -3.3, HALF, top(-3.2) + 0.5, -3.2, { tile: 1 });
  // behind: a sky, hills, clouds, a sun
  paint.tint(0.35, 0.62, 0.95, 1).box(-HALF, 0, BACK, HALF, 3.1, BACK + 0.04, { faces: 'Z' });
  for (const [cx, cy, r, k] of [[-1.9, 1.7, 1.6, 0], [0.4, 1.55, 2.0, 1], [2.3, 1.75, 1.5, 0]]) {
    const pts = [];
    for (let a = 0; a <= 10; a++) pts.push(V(cx + cos((Math.PI * a) / 10) * r, Math.min(3.05, cy + sin((Math.PI * a) / 10) * r * 0.5), BACK + 0.05 + k * 0.004));
    paint.tint(0.2 + 0.08 * k, 0.55 + 0.1 * k, 0.24, 1).poly(pts);
  }
  { const pts = []; for (let a = 0; a < 14; a++) pts.push(V(-2.1 + cos((Math.PI * 2 * a) / 14) * 0.3, 2.72 + sin((Math.PI * 2 * a) / 14) * 0.3, BACK + 0.045)); paint.tint(1.6, 1.3, 0.3, 1).poly(pts); }
  for (const [cx, cy] of [[0.9, 2.78], [2.3, 2.6]]) for (const [dx, r] of [[-0.28, 0.18], [0, 0.26], [0.3, 0.19]]) {
    const pts = [];
    for (let a = 0; a < 10; a++) pts.push(V(cx + dx + cos((Math.PI * 2 * a) / 10) * r, cy + sin((Math.PI * 2 * a) / 10) * r * 0.7, BACK + 0.06));
    paint.tint(1.5, 1.5, 1.5, 1).poly(pts);
  }
  // the creatures: a body with a face on its front; brown for a mole, golden, or white with long ears
  const creature = (body, ears) => geometry((b) => {
    b.tint(body[0], body[1], body[2], 1).lathe([[0.27, -0.5], [0.29, 0.1], [0.24, 0.3], [0.12, 0.42], [0.0, 0.45]], 9);
    b.tint(0.02, 0.02, 0.02, 1).box(-0.13, 0.2, 0.22, -0.07, 0.27, 0.27).box(0.07, 0.2, 0.22, 0.13, 0.27, 0.27);
    b.tint(1.0, 0.5, 0.55, 1).box(-0.045, 0.1, 0.27, 0.045, 0.17, 0.31);
    b.tint(0.97, 0.97, 0.94, 1).box(-0.05, 0.02, 0.26, 0.05, 0.09, 0.29);
    if (ears) for (const g of [-1, 1]) b.tint(body[0], body[1], body[2], 1).box(g * 0.12 - 0.05, 0.38, -0.03, g * 0.12 + 0.05, 0.86, 0.03);
  });
  const hatted = geometry((b) => {
    b.tint(0.42, 0.27, 0.16, 1).lathe([[0.27, -0.5], [0.29, 0.1], [0.24, 0.3], [0.12, 0.42], [0.0, 0.45]], 9);
    b.tint(0.02, 0.02, 0.02, 1).box(-0.13, 0.2, 0.22, -0.07, 0.27, 0.27).box(0.07, 0.2, 0.22, 0.13, 0.27, 0.27);
    b.tint(1.0, 0.5, 0.55, 1).box(-0.045, 0.1, 0.27, 0.045, 0.17, 0.31);
    b.tint(1.5, 1.05, 0.1, 1).lathe([[0.3, 0.3], [0.3, 0.33], [0.22, 0.36], [0.2, 0.5], [0.0, 0.56]], 9); // the hard hat
  });
  const KINDS = [creature([0.42, 0.27, 0.16]), creature([1.5, 1.05, 0.2]), creature([1.25, 1.22, 1.18], true), hatted];
  const star = mesh(geometry((b) => { const pts = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.16 : 0.42; pts.push(V(cos(a) * r, 0, -sin(a) * r)); } b.tint(1, 0.9, 0.35, 1); for (let i = 0; i < 10; i++) b.tri(V(0, 0, 0), pts[i], pts[(i + 1) % 10]); }, 'glow'), 'star', 'glow');
  star.visible = false;
  let burst = 0;
  for (const h of holes) { h.mesh = mesh(KINDS[0], 'mole'); h.mesh.visible = false; }
  const mallet = mesh(geometry((b) => {
    b.tint(0.7, 0.55, 0.36, 1).box(-0.035, 0, -0.035, 0.035, 0.75, 0.035);
    b.tint(0.8, 0.14, 0.12, 1).box(-0.2, 0.75, -0.12, 0.2, 0.99, 0.12);
  }), 'mallet');
  mallet.visible = false;
  let next = 0.6, swing = 0, swingAt = null;
  const game = {
    view: { pos: [0, 2.55, 2.15], look: [0, 1.05, -1.35], fov: 56 }, firstPerson: true, crosshair: true,
    reset(seed) { roll = dice(seed); game.score = 0; game.streak = 0; next = 0.5; burst = 0; for (const h of holes) { h.state = 0; h.up = 0; } },
    step(dt, t, time, aim, io) {
      const p = t < 0 ? 0 : clamp01(t / 45);
      if ((next -= dt) <= 0) {
        next = t < 0 ? 1.6 + roll() * 2 : lerp(0.95, 0.36, p) * (0.75 + 0.5 * roll());
        const free = holes.filter((h) => h.state === 0);
        if (free.length) {
          const h = free[Math.floor(roll() * free.length)], r = roll();
          h.kind = t > 8 && r < 0.16 ? 2 : t > 10 && r < 0.28 ? 1 : t > 16 && r < 0.42 ? 3 : 0;
          h.state = 1; h.timer = (t < 0 ? 1.2 : lerp(1.5, 0.62, p)) * (h.kind === 3 ? 1.5 : 1); h.squash = 0; h.hits = h.kind === 3 ? 2 : 1;
          h.mesh.geometry = KINDS[h.kind];
        }
      }
      for (const h of holes) {
        if (h.state === 1) { h.up = Math.min(1, h.up + dt * 7); if ((h.timer -= dt) <= 0) h.state = 2; } // up, then down again
        else if (h.state === 2) { h.up -= dt * 5; if (h.up <= 0) { h.up = 0; h.state = 0; } }
        else if (h.state === 3) { h.squash = Math.min(1, h.squash + dt * 12); h.up -= dt * 3.2; if (h.up <= 0) { h.up = 0; h.state = 0; } } // whacked
        h.mesh.visible = h.up > 0.01;
        h.mesh.position.set(h.x, h.y - 0.5 + h.up * 0.56, h.z);
        h.mesh.scale.set(1 + 0.25 * h.squash, 1 - 0.45 * h.squash, 1 + 0.25 * h.squash);
      }
      if (burst > 0) { burst -= dt; star.scale.setScalar(1.6 - burst * 3); star.rotation.y += dt * 9; }
      star.visible = burst > 0;
      if (swing > 0) {
        swing -= dt;
        const u = clamp01(swing / 0.22); // 1 → 0
        mallet.visible = true;
        mallet.position.set(swingAt.x + 0.55, swingAt.y + 0.25 + 0.5 * u, swingAt.z + 0.2);
        mallet.rotation.set(0, 0, 1.2 + 0.9 * u);
      } else mallet.visible = false;
      if (t < 0 || !aim || !aim.clicks) return;
      // which hole is under the pointer? (the plane of the table, a hand above it)
      const n = 0.2, d = aim.d.y + n * aim.d.z;
      if (Math.abs(d) < 1e-5) return;
      const u = (1.2 - aim.o.y - n * aim.o.z) / d, hx = aim.o.x + aim.d.x * u, hz = aim.o.z + aim.d.z * u;
      let best = null, bd = 0.52;
      for (const h of holes) { const dd = hypot(h.x - hx, (h.z - hz) * 0.8); if (dd < bd) { bd = dd; best = h; } }
      if (!best) return;
      swing = 0.22; swingAt = best;
      if ((best.state === 1 || best.state === 2) && best.up > 0.35) {
        star.position.set(best.x, best.y + 0.42, best.z); burst = 0.3;
        if (--best.hits > 0) { best.squash = 0.6; io.play('whack', { volume: 0.6 }); return; } // (the hard hat takes the first blow)
        const pts = best.kind === 2 ? -20 : best.kind === 1 ? 30 : best.kind === 3 ? 25 : 10 + Math.round(5 * clamp01(best.timer));
        // (a row of hits pays a little more each time; a rabbit ends it)
        if (pts > 0) { game.score += pts + Math.min(10, game.streak * 2); game.streak++; } else { game.score = Math.max(0, game.score + pts); game.streak = 0; }
        best.state = 3;
        io.play(best.kind === 2 ? 'fail' : 'whack', { volume: 0.8 });
        if (best.kind === 2) io.note('Not the rabbit! −20');
      } else { game.streak = 0; io.play('miss', { volume: 0.5 }); }
    },
  };
  game.reset();
  return game;
}

// ---------------------------------------------------------------------------
// Feed the Clown: a jet of milk, a mouth that slides about. The jet is one smooth stream that bulges as it
// flows; in the mouth it disappears with a splash of drops, and a bottle on the wall fills up; anywhere
// else it splatters, and runs down.

function milk(parts, booth, mesh, more) {
  let roll = Math.random; // (what is left to chance: drawn from the seed of the game when it is played for a score)
  const paint = parts.get('paint'), wood = parts.get('woodDark'), Z = -3.2;
  // behind: a sky with hills and clouds; the rail the clown rides on; the churn and its nozzle on the counter
  paint.tint(0.35, 0.62, 0.95, 1).box(-HALF, 0, BACK, HALF, 3.1, BACK + 0.04, { faces: 'Z' });
  for (const [cx, cy, r, k] of [[-2.0, 1.25, 1.5, 0], [0.2, 1.05, 1.9, 1], [2.2, 1.3, 1.4, 0]]) {
    const pts = [];
    for (let a = 0; a <= 10; a++) pts.push(V(cx + cos((Math.PI * a) / 10) * r, Math.min(3.05, cy + sin((Math.PI * a) / 10) * r * 0.55), BACK + 0.05 + k * 0.004));
    paint.tint(0.2 + 0.08 * k, 0.55 + 0.1 * k, 0.24, 1).poly(pts);
  }
  for (const [cx, cy] of [[-1.7, 2.55], [1.2, 2.75], [2.5, 2.35]]) for (const [dx, r] of [[-0.3, 0.2], [0, 0.28], [0.32, 0.2]]) {
    const pts = [];
    for (let a = 0; a < 10; a++) pts.push(V(cx + dx + cos((Math.PI * 2 * a) / 10) * r, cy + sin((Math.PI * 2 * a) / 10) * r * 0.7, BACK + 0.06));
    paint.tint(1.5, 1.5, 1.5, 1).poly(pts);
  }
  wood.tint(0.45, 0.36, 0.28, 1).box(-HALF, 1.02, Z - 0.3, HALF, 1.1, Z - 0.18, { tile: 1 });
  paint.tint(0.75, 0.78, 0.82, 1).place(0, 1.08, FRONT - 0.2).lathe([[0.2, 0.0], [0.22, 0.3], [0.14, 0.42], [0.14, 0.5], [0.0, 0.5]], 10).pop();
  paint.tint(0.3, 0.3, 0.34, 1).box(-0.04, 1.31, FRONT - 0.5, 0.04, 1.39, FRONT - 0.2);
  // a bottle on the wall: it fills as he drinks
  const BX = -2.45, BY = 1.35, BH = 1.25;
  paint.tint(0.86, 0.93, 1.0, 1).box(BX - 0.26, BY - 0.04, BACK + 0.07, BX + 0.26, BY + BH + 0.04, BACK + 0.09, { faces: 'Z' });
  paint.tint(0.86, 0.93, 1.0, 1).box(BX - 0.1, BY + BH + 0.04, BACK + 0.07, BX + 0.1, BY + BH + 0.3, BACK + 0.09, { faces: 'Z' });
  paint.tint(0.9, 0.2, 0.16, 1).box(BX - 0.12, BY + BH + 0.3, BACK + 0.07, BX + 0.12, BY + BH + 0.38, BACK + 0.1, { faces: 'Z' });
  const level = mesh(geometry((b) => b.tint(1, 1, 0.97, 1).box(-0.22, 0, 0, 0.22, 1, 0.012, { faces: 'Z' }), 'glow'), 'level', 'glow');
  level.position.set(BX, BY, BACK + 0.09);
  // the clown: a white face, a red nose, hair on both sides, a little hat, and a mouth wide open
  const clown = mesh(geometry((b) => {
    disc(b, [[0.62, [1.3, 1.26, 1.2]]], 18);
    for (const g of [-1, 1]) {
      b.tint(1.3, 0.45, 0.1, 1).place(g * 0.62, 0.12, 0.0).lathe([[0.0, -0.26], [0.2, -0.16], [0.26, 0.0], [0.2, 0.18], [0.0, 0.28]], 8).pop(); // hair
      disc(b.place(g * 0.24, 0.22, 0.02), [[0.14, [1.5, 1.5, 1.5]], [0.1, [0.2, 0.5, 1.2]], [0.045, [0.03, 0.03, 0.05]]], 12); b.pop(); // eyes
      b.tint(0.05, 0.05, 0.08, 1).place(g * 0.24, 0.43, 0.02, 0, 0, g * -0.25).box(-0.12, -0.02, 0, 0.12, 0.02, 0.01).pop(); // eyebrows
      disc(b.place(g * 0.38, -0.08, 0.02), [[0.12, [1.5, 0.55, 0.6]]], 10); b.pop(); // cheeks
    }
    b.tint(1.5, 0.12, 0.1, 1).place(0, 0.07, 0.06).lathe([[0.0, -0.13], [0.09, -0.09], [0.13, 0.0], [0.09, 0.09], [0.0, 0.13]], 9).pop(); // nose
    disc(b.place(0, -0.3, 0.03), [[0.27, [1.3, 0.14, 0.12]], [0.215, [0.03, 0.01, 0.01]]], 16); b.pop(); // lips, mouth
    b.tint(0.2, 0.42, 1.2, 1).place(0.12, 0.58, 0.0, 0, 0, -0.3).lathe([[0.3, 0.0], [0.3, 0.04], [0.15, 0.06], [0.11, 0.42], [0.0, 0.44]], 9).pop(); // hat
    b.tint(1.5, 1.1, 0.2, 1).place(0.25, 1.0, 0.0).lathe([[0.0, -0.07], [0.07, 0.0], [0.0, 0.07]], 6).pop(); // its pompom
  }), 'clown');
  const MOUTH = -0.3, R = 0.215;
  // what fills the mouth while he drinks
  const gulpDisc = mesh(geometry((b) => disc(b, [[1, [1, 1, 0.97]]], 14), 'glow'), 'gulp', 'glow');
  // the jet: a tube from the nozzle to where it lands, rebuilt every frame (a hundred points)
  const SEG = 18, SIDES = 6;
  const tubeGeo = geometry((b) => {
    b.tint(1, 1, 0.97, 1);
    for (let i = 0; i <= SEG; i++) for (let j = 0; j < SIDES; j++) b.vert(V(0, 0, 0), V(0, 1, 0), j / SIDES, i / SEG);
    for (let i = 0; i < SEG; i++) for (let j = 0; j < SIDES; j++) { const a = i * SIDES + j, c = i * SIDES + ((j + 1) % SIDES); b.idx.push(a, c, a + SIDES, c, c + SIDES, a + SIDES); }
  }, 'glow');
  const jet = more.dynamic(tubeGeo, 'jet', 'glow'); // (a mesh whose points change every frame)
  jet.visible = false;
  // drops: thrown up where the jet lands (round the mouth, or off the wall), and splatters that run down
  const DROPS = 14, drops = more.pool(geometry((b) => b.tint(1, 1, 0.97, 1).lathe([[0.0, -0.035], [0.03, -0.012], [0.035, 0.012], [0.0, 0.035]], 6), 'glow'), DROPS, 'drops', 'glow');
  const SPLATS = 8, splats = more.pool(geometry((b) => disc(b, [[1, [1, 1, 0.97]]], 9), 'glow'), SPLATS, 'splats', 'glow');
  const drop = Array.from({ length: DROPS }, () => ({ t: 9, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 })), splat = Array.from({ length: SPLATS }, () => ({ t: 9, x: 0, y: 0 }));
  const NOZZLE = V(0, 1.35, FRONT - 0.52), land = V(0, 1.6, Z), end = V(), c0 = V(), c1 = V(), tan = V(), right = V(), up = V(), UP = V(0, 1, 0);
  const m4 = more.M4(), q = more.Q(), s3 = V(0, 0, 0), p3 = V(0, 0, 0);
  const C = { x: 0, y: 1.95, v: 1, turn: 2 };
  let flow = 0, gulp = 0, hiss = 0, full = 0, nextDrop = 0, nextSplat = 0, kd = 0, ks = 0, glug = 0, shown = 0;
  const centre = (u, out) => { out.copy(NOZZLE).lerp(end, u); out.y += 0.55 * 4 * u * (1 - u); return out; };
  const game = {
    view: { pos: [0, 1.75, 2.45], look: [0, 1.8, -3.2], fov: 58 }, firstPerson: true, crosshair: true,
    reset(seed) {
      roll = dice(seed); game.score = 0; full = 0; shown = 0; C.x = 0; C.v = 1; C.turn = 2; for (const d of drop) d.t = 9; for (const sp of splat) sp.t = 9;
      land.set(0, 1.6, Z); end.set(0, 1.6, Z); flow = 0; gulp = 0; hiss = 0; nextDrop = 0; nextSplat = 0; kd = 0; ks = 0; glug = 0;
    },
    step(dt, t, time, aim, io) {
      const p = t < 0 ? 0 : clamp01(t / 45), speed = t < 0 ? 0.5 : lerp(0.9, 3.3, p);
      C.x += Math.sign(C.v || 1) * speed * dt;
      if (C.x > 2.0) { C.x = 2.0; C.v = -1; } else if (C.x < -1.75) { C.x = -1.75; C.v = 1; }
      if (t > 28 && (C.turn -= dt) <= 0) { C.v = -C.v; C.turn = 0.5 + roll() * 1.1; } // he starts changing his mind
      C.y = 1.95 + (t > 14 ? 0.3 * clamp01((t - 14) / 6) * sin(time * 2.7) : 0);
      const on = t >= 0 && aim && aim.down;
      let fed = false;
      if (on) {
        const u = (Z - aim.o.z) / aim.d.z, ax = Math.min(HALF - 0.2, Math.max(-HALF + 0.2, aim.o.x + aim.d.x * u)), ay = Math.min(2.9, Math.max(1.15, aim.o.y + aim.d.y * u));
        const k = 1 - exp(-dt * 6.5); // the jet takes a moment to follow the hand
        land.x += (ax - land.x) * k; land.y += (ay - land.y) * k;
        fed = hypot(land.x - C.x, land.y - (C.y + MOUTH)) < R;
        end.set(land.x, land.y, fed ? Z - 0.1 : hypot(land.x - C.x, land.y - C.y) > 0.66 ? BACK + 0.07 : Z + 0.04); // in his mouth, on his face, or past him on the wall
        if (fed) {
          full += 50 * dt; game.score = Math.floor(full);
          if ((gulp -= dt) <= 0) { gulp = 0.42; io.play('gulp', { volume: 0.7 }); }
        }
        if ((hiss -= dt) <= 0) { hiss = 0.3; io.play('squirt', { volume: 0.35 }); }
        // the stream
        flow += dt * 16;
        const pos = tubeGeo.attributes.position;
        if (host.shown) for (let i = 0; i <= SEG; i++) {
          const w = i / SEG;
          centre(w, c0); centre(Math.min(1, w + 0.02), c1);
          tan.copy(c1).sub(c0).normalize(); right.crossVectors(tan, UP).normalize(); up.crossVectors(right, tan);
          const r = (0.034 + 0.011 * sin(w * 20 - flow)) * (1 - 0.25 * w) * (i === 0 ? 0.6 : 1);
          for (let j = 0; j < SIDES; j++) { const a = (j / SIDES) * Math.PI * 2, cs = cos(a) * r, sn = sin(a) * r; pos.setXYZ(i * SIDES + j, c0.x + right.x * cs + up.x * sn, c0.y + right.y * cs + up.y * sn, c0.z + right.z * cs + up.z * sn); }
        }
        pos.needsUpdate = true;
        // drops fly from where it lands; off the mouth it leaves a splatter that runs down
        if ((nextDrop -= dt) <= 0) {
          nextDrop = fed ? 0.045 : 0.07;
          const d = drop[kd++ % DROPS], a = roll() * 6.28, v = 0.6 + roll() * 1.2;
          Object.assign(d, { t: 0, x: end.x, y: end.y, z: end.z + 0.05, vx: cos(a) * v, vy: Math.abs(sin(a)) * v + 0.8, vz: 0.5 + roll() * 0.9 });
        }
        if (!fed && (nextSplat -= dt) <= 0) { nextSplat = 0.11; Object.assign(splat[ks++ % SPLATS], { t: 0, x: end.x + (roll() - 0.5) * 0.08, y: end.y, z: end.z + 0.012 + (ks % SPLATS) * 0.0012 }); }
      }
      jet.visible = !!on;
      drop.forEach((d, i) => {
        d.t += dt;
        const alive = d.t < 0.55;
        if (alive) { d.vy -= 7 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; }
        if (host.shown) drops.setMatrixAt(i, m4.compose(p3.set(d.x, d.y, d.z), q, s3.setScalar(alive ? 1 - d.t / 0.6 : 0)));
      });
      drops.instanceMatrix.needsUpdate = true;
      splat.forEach((sp, i) => {
        sp.t += dt;
        const alive = sp.t < 1.3, k = alive ? 1 - sp.t / 1.3 : 0;
        if (host.shown) splats.setMatrixAt(i, m4.compose(p3.set(sp.x, sp.y - 0.25 * sp.t * sp.t, sp.z ?? Z), q, s3.set(0.11 * k + 0.03 * (alive ? 1 : 0), (0.11 + 0.16 * sp.t) * (alive ? 1 : 0), 1)));
      });
      splats.instanceMatrix.needsUpdate = true;
      // the bottle fills; every three hundred points it empties with a glug and starts again
      const part = (full % 300) / 300;
      if (Math.floor(full / 300) > shown) { shown = Math.floor(full / 300); glug = 0.5; if (io) io.play('score', { volume: 0.7 }); }
      if (glug > 0) glug -= dt;
      level.scale.set(1, Math.max(0.001, (glug > 0 ? 1 : part) * BH), 1);
      level.visible = t >= 0 && (part > 0.003 || glug > 0);
      // he puffs his cheeks and bobs while he drinks, wags his head otherwise
      const puff = fed ? 1.06 + 0.05 * sin(time * 30) : 1;
      clown.position.set(C.x, C.y + (fed ? 0.03 * sin(time * 14) : 0), Z);
      clown.scale.set(puff, puff, 1);
      clown.rotation.z = fed ? 0.04 * sin(time * 20) : 0.12 * sin(time * 1.7);
      gulpDisc.visible = fed;
      gulpDisc.position.set(C.x, clown.position.y + MOUTH * puff, Z + 0.045);
      gulpDisc.scale.setScalar(R * (0.55 + 0.3 * Math.abs(sin(time * 12))));
    },
  };
  game.reset();
  return game;
}

// ---------------------------------------------------------------------------
// Ring the Bell: the high striker. A needle sweeps a gauge — slowly at the bottom, in a flash at the top,
// never twice at the same pace — and the blow is as hard as the needle is high. The scale goes to 9,999 and
// is anything but fair: nine tenths of the way up is worth little more than half. Three blows; the best counts.

function bell(parts, booth, mesh, more) {
  let roll = Math.random; // (what is left to chance: drawn from the seed of the game when it is played for a score)
  const paint = parts.get('paint'), wood = parts.get('woodDark');
  const TX = -1.9, TZ = -1.6, H = 5.6, BASE = 0.5; // the tower: where it stands, how high the puck can go
  // (this booth has no roof: its tower rises well above the others)
  wood.tint(0.75, 0.6, 0.42, 1).box(TX - 0.45, 0, TZ - 0.12, TX + 0.45, BASE + H + 0.5, TZ, { tile: 1 });
  paint.tint(0.95, 0.93, 0.86, 1).box(TX - 0.3, BASE, TZ, TX + 0.3, BASE + H, TZ + 0.02, { faces: 'Z' });
  // the marks of the scale: a thousand, two thousand… nine thousand
  for (let k = 1; k <= 9; k++) {
    const y = BASE + SCALE_INV(k * 1000) * H, c = k >= 9 ? [1.5, 0.2, 0.15] : k >= 5 ? [1.5, 0.9, 0.15] : [0.2, 0.5, 0.25];
    paint.tint(c[0], c[1], c[2], 1).box(TX - 0.3, y - 0.025, TZ + 0.02, TX + 0.3, y + 0.025, TZ + 0.035, { faces: 'Z' });
    for (let d = 0; d < k; d++) paint.box(TX + 0.34 + (d % 5) * 0.05, y - 0.02 + Math.floor(d / 5) * 0.06, TZ + 0.02, TX + 0.37 + (d % 5) * 0.05, y + 0.02 + Math.floor(d / 5) * 0.06, TZ + 0.03, { faces: 'Z' }); // as many pips as thousands
  }
  paint.tint(0.2, 0.2, 0.24, 1).box(TX - 0.03, BASE, TZ + 0.035, TX + 0.03, BASE + H, TZ + 0.06, { faces: 'xXZ' }); // the rail
  // the bell at the top, the pad one strikes at the bottom, a mallet leaning on the tower
  paint.tint(1.5, 1.05, 0.25, 1).place(TX, BASE + H + 0.1, TZ + 0.2).lathe([[0.3, 0.0], [0.26, 0.06], [0.2, 0.3], [0.08, 0.42], [0.0, 0.44]], 10).pop();
  paint.tint(0.5, 0.1, 0.1, 1).box(TX - 0.5, 0, TZ + 0.5, TX + 0.5, 0.24, TZ + 1.5);
  paint.tint(0.9, 0.2, 0.16, 1).place(TX, 0.24, TZ + 1.0).lathe([[0.36, 0.0], [0.36, 0.08], [0.3, 0.12], [0.0, 0.12]], 12).pop();
  wood.tint(0.9, 0.75, 0.5, 1).place(TX + 0.75, 0, TZ + 0.3, 0, 0, -0.22).box(-0.04, 0, -0.04, 0.04, 1.5, 0.04, { tile: 1 }).pop();
  paint.tint(0.25, 0.22, 0.2, 1).place(TX + 0.75, 0, TZ + 0.3, 0, 0, -0.22).box(-0.22, 1.5, -0.13, 0.22, 1.82, 0.13).pop();
  // (lights round the top, lit when the bell rings)
  const lamp = mesh(geometry((b) => { for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; b.tint(1, 0.85, 0.3, 1).box(TX + cos(a) * 0.62 - 0.06, BASE + H + 0.25 + sin(a) * 0.5 - 0.06, TZ + 0.05, TX + cos(a) * 0.62 + 0.06, BASE + H + 0.25 + sin(a) * 0.5 + 0.06, TZ + 0.12); } }, 'glow'), 'lamps', 'glow');
  lamp.visible = false;
  const puck = mesh(geometry((b) => b.tint(1.4, 0.3, 0.2, 1).box(-0.16, -0.07, 0, 0.16, 0.07, 0.14)), 'puck');
  let blows = 3, phase = 0, power = 0, rise = 0, flash = 0, u = 0, dir = 1, rate = 1.5;
  const pace = () => (1.45 + 0.6 * (3 - blows)) * (0.82 + 0.36 * roll()); // sweeps a second: quicker at each blow, never the same twice
  const game = {
    view: { pos: [1.5, 2.0, 5.7], look: [-0.9, 3.15, -1.6], fov: 62 }, firstPerson: false, crosshair: false, blows: 3,
    reset(seed) { roll = dice(seed); game.score = 0; blows = 3; phase = 0; rise = 0; u = roll() * 0.5; dir = 1; rate = pace(); game.gauge = 0; game.left = 3; game.over = false; },
    step(dt, t, time, aim, io) {
      if (flash > 0) flash -= dt;
      lamp.visible = flash > 0 && Math.floor(flash * 10) % 2 === 0;
      if (t < 0) { puck.position.set(TX, BASE + 0.07, TZ + 0.035); game.gauge = null; return; }
      if (phase === 0) {
        // the needle: up and down; its height is the square of where it is in its sweep (it lingers low, and
        // is through the top in a blink)
        u += dir * rate * dt;
        if (u >= 1) { u = 2 - u; dir = -1; rate = pace(); } else if (u <= 0) { u = -u; dir = 1; rate = pace(); }
        game.gauge = u * u;
        if (aim && aim.clicks) { power = game.gauge; phase = 1; rise = 0; io.play('whack'); io.strike?.(); }
        puck.position.set(TX, BASE + 0.07, TZ + 0.035);
      } else {
        // the puck flies up as far as the blow was hard, then drops back
        rise += dt;
        const pts = STRIKE(power), top = SCALE_INV(pts);
        const up = Math.min(1, rise / 0.55), fall = clamp01((rise - 0.75) / 0.5), k = (1 - (1 - up) * (1 - up)) * (1 - fall * fall);
        puck.position.set(TX, BASE + 0.07 + top * (H - 0.14) * k, TZ + 0.035);
        if (phase === 1 && up >= 1) {
          phase = 2;
          if (pts >= 9000) { io.play('bell'); flash = 1.8; io.note(`DING! ${pts.toLocaleString('en-US')}`); } else io.note(pts.toLocaleString('en-US'));
          if (pts > game.score) game.score = pts;
        }
        if (rise > 1.3) {
          blows--; game.left = blows;
          if (blows <= 0) { game.over = true; game.gauge = null; } else { phase = 0; u = roll() * 0.4; dir = 1; rate = pace(); }
        }
      }
    },
  };
  game.reset();
  return game;
}

export const PIER_GAMES = { shoot, mole, milk, bell };
