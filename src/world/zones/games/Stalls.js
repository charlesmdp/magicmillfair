// The six booths along the walk of the pier, three a side — six games that ask six different things of whoever
// plays them:
//
//   Buzzer Beater         an arm and an eye: wind up, let go, and send the ball where the hoop is going to be
//   Stack It              timing: drop each floor on the one below; what sticks out is cut off
//   Geiger Says           memory: the lamps light in a sequence that grows by one each round
//   Hook, Line & Sinker   patience: a hook that goes where one points, fish worth more the deeper they swim
//   SCRAM!                reflexes: five alarms, the average of five reaction times, in milliseconds
//   Shell Shock           attention: the cup that hides the glowing core, among cups that change places
//
// Each is built like the four booths of the pier head (see Booths.js, which opens the sessions and gives every
// frame where the pointer aims): a function that paints what stands still into `parts`, makes what moves with
// `mesh(geometry, name, material)`, and returns the game — { view, firstPerson, crosshair, reset(),
// step(dt, t, time, aim, io), score, and, for a game without a clock, over and line() }. `t` is the time
// played (below zero: nobody plays, or the count before the start — then aim and io are null).
import { V, lerp, clamp, clamp01, HALF, BACK, FRONT, geometry, hitZ, hitY } from './kit.js';

/** id (also the board of its scores), name, where it stands on the pier (along, side), its colour, how long a game lasts (0: until it is lost). */
export const STALLS = [
  { id: 'hoop', name: 'Buzzer Beater', along: 27, side: -4.25, color: [1.0, 0.33, 0.05], seconds: 45, how: 'Hold to wind up, let go to shoot — the green of the meter is about right. The hoop will not keep still: send the ball where it is going to be.' },
  { id: 'stack', name: 'Stack It', along: 27, side: 4.25, color: [0.55, 0.3, 0.8], seconds: 0, sub: 'The tallest tower: ten points a floor, more for a perfect one', how: 'Click to drop each floor on the one below. What sticks out is cut off; a perfect drop keeps its width. Miss altogether and it is over.' },
  { id: 'geiger', name: 'Geiger Says', along: 41, side: -4.25, color: [0.2, 0.62, 0.3], seconds: 0, sub: 'The longest sequence remembered, and how fast', how: 'Watch the lamps, then click them in the same order. One more each round. Three mistakes and it is over.' },
  { id: 'fish', name: 'Hook, Line & Sinker', along: 41, side: 4.25, color: [0.1, 0.5, 0.78], seconds: 45, how: 'The hook goes where you point. Touch a fish and bring it up to the surface: the deep ones are worth more. Mind the barrels!' },
  { id: 'scram', name: 'SCRAM!', along: 55, side: -4.25, color: [0.8, 0.12, 0.12], seconds: 0, sub: 'The quickest hand: five alarms, the average', format: (s) => `${s} ms`, how: 'Five alarms. The instant the core turns RED, click. Not before — and not for the blue.' },
  { id: 'cups', name: 'Shell Shock', along: 55, side: 4.25, color: [0.85, 0.68, 0.1], seconds: 0, sub: 'Most rounds without losing the core', how: 'Keep your eye on the cup that hides the glowing core. When they stop, click it. Three mistakes and it is over.' },
];

/** A disc that faces +Z. */
const round = (b, x, y, z, r, c, n = 14) => {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push(V(x + Math.cos(a) * r, y + Math.sin(a) * r, z)); }
  b.tint(c[0], c[1], c[2], 1).poly(pts);
};
/** A ball about the origin. */
const sphere = (b, r, sides = 9, rows = 6) => {
  const p = [];
  for (let i = 0; i <= rows; i++) { const a = -Math.PI / 2 + (Math.PI * i) / rows; p.push([Math.max(0, Math.cos(a)) * r, Math.sin(a) * r]); }
  b.lathe(p, sides);
};
const hearts = (n) => '♥'.repeat(Math.max(0, n));
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------------------
// Buzzer Beater. Hold the button: a needle climbs a meter on the wall (and comes down again); let go, and the
// ball leaves towards where one points, as far as the needle said. It drops through the plane of the rim one
// second later: through the ring it scores (the board is there to be used: a ball a little too long comes back
// off it), on the ring it jumps. The hoop slides from side to side and rests a moment at each end — less and
// less as the seconds go by. A row of baskets pays more each time.

function hoop(parts, booth, mesh) {
  const paint = parts.get('paint'), wood = parts.get('woodDark');
  const RIM_Y = 2.5, RIM_Z = -2.9, RIM_R = 0.3, BALL = 0.15, G = 9.8, T = 1.0, BOARD_Z = RIM_Z - 0.4, NEAR = -0.4, FAR = -4.4;
  // the court: a varnished floor with the lines of a key; the back wall: the stands at night, under two floodlights
  wood.tint(1.0, 0.72, 0.42, 1).box(-HALF, 0, BACK, HALF, 0.05, FRONT - 0.5, { tile: 1, faces: 'Y' });
  paint.tint(1.4, 1.4, 1.35, 1);
  for (const [x0, z0, x1, z1] of [[-1.3, -3.9, -1.22, -1.0], [1.22, -3.9, 1.3, -1.0], [-1.3, -1.08, 1.3, -1.0]]) paint.box(x0, 0.05, z0, x1, 0.056, z1, { faces: 'Y' });
  paint.tint(0.09, 0.1, 0.24, 1).box(-HALF, 0, BACK, HALF, 3.1, BACK + 0.04, { faces: 'Z' });
  const SKIN = [[0.85, 0.55, 0.4], [0.5, 0.32, 0.22], [0.95, 0.8, 0.6], [0.32, 0.2, 0.16]], SHIRT = [[0.85, 0.2, 0.15], [0.15, 0.4, 0.8], [0.95, 0.75, 0.15], [0.9, 0.9, 0.9]];
  for (let r = 0; r < 4; r++) for (let k = 0; k < 18; k++) {
    const x = -2.75 + k * 0.32 + (r % 2) * 0.16, y = 0.42 + r * 0.36, s = SHIRT[(k * 5 + r) % 4];
    paint.tint(s[0] * 0.7, s[1] * 0.7, s[2] * 0.7, 1).box(x - 0.13, y - 0.24, BACK + 0.045 + r * 0.002, x + 0.13, y - 0.06, BACK + 0.047 + r * 0.002, { faces: 'Z' });
    round(paint, x, y, BACK + 0.05 + r * 0.002, 0.1, SKIN[(k * 7 + r * 3) % 4], 7);
  }
  for (const x of [-2.3, 2.3]) { round(paint, x, 2.78, BACK + 0.05, 0.2, [1.7, 1.6, 1.2], 8); paint.tint(0.3, 0.3, 0.34, 1).box(x - 0.03, 2.2, BACK + 0.045, x + 0.03, 2.6, BACK + 0.05, { faces: 'Z' }); }
  // the rail the hoop hangs from, and the meter on the left wall: red, amber, and the green that sends the ball as far as the ring
  paint.tint(0.2, 0.2, 0.24, 1).box(-2.9, 3.12, BOARD_Z - 0.07, 2.9, 3.18, BOARD_Z + 0.01);
  const MX = -HALF + 0.07, MY = 1.15, MH = 1.5, sweet = (RIM_Z - NEAR) / (FAR - NEAR);
  paint.tint(0.12, 0.12, 0.14, 1).box(MX - 0.03, MY - 0.08, -1.75, MX, MY + MH + 0.08, -1.05, { faces: 'X' });
  for (const [a, b, c] of [[0, sweet - 0.14, [0.85, 0.2, 0.15]], [sweet - 0.14, sweet - 0.05, [1.2, 0.85, 0.15]], [sweet - 0.05, sweet + 0.15, [0.25, 1.0, 0.35]], [sweet + 0.15, 1, [0.85, 0.2, 0.15]]]) paint.tint(c[0], c[1], c[2], 1).box(MX, MY + a * MH, -1.65, MX + 0.012, MY + b * MH, -1.15, { faces: 'X' });
  const needle = mesh(geometry((b) => b.tint(1.6, 1.6, 1.4, 1).box(0, -0.035, -0.32, 0.03, 0.035, 0.32), 'glow'), 'needle', 'glow');
  needle.visible = false;
  // the hoop: its board, the square on it, the ring and its net; lamps that light when a ball goes in
  const rig = mesh(geometry((b) => {
    b.tint(1.3, 1.3, 1.25, 1).box(-0.65, -0.14, -0.44, 0.65, 0.62, -0.4);
    b.tint(0.2, 0.2, 0.24, 1).box(-0.06, 0.62, -0.46, 0.06, 0.7, -0.38);
    b.tint(1.4, 0.35, 0.1, 1);
    for (const [x0, y0, x1, y1] of [[-0.26, 0.02, 0.26, 0.06], [-0.26, 0.36, 0.26, 0.4], [-0.26, 0.02, -0.22, 0.4], [0.22, 0.02, 0.26, 0.4]]) b.box(x0, y0, -0.4, x1, y1, -0.392, { faces: 'Z' });
    b.box(-0.04, -0.03, -0.4, 0.04, 0.01, -RIM_R + 0.02);
    for (let k = 0; k < 12; k++) { const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2; b.rod(V(Math.cos(a0) * RIM_R, 0, Math.sin(a0) * RIM_R), V(Math.cos(a1) * RIM_R, 0, Math.sin(a1) * RIM_R), 0.022, 4); }
    b.tint(1.45, 1.45, 1.45, 1);
    for (let k = 0; k < 8; k++) { const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 0.5) / 8) * Math.PI * 2; b.rod(V(Math.cos(a0) * RIM_R, 0, Math.sin(a0) * RIM_R), V(Math.cos(a1) * 0.19, -0.36, Math.sin(a1) * 0.19), 0.009, 3); }
  }), 'hoop');
  const lamps = mesh(geometry((b) => { for (let k = 0; k < 7; k++) b.tint(1.0, 0.9, 0.4, 1).box(-0.6 + k * 0.2 - 0.05, 0.64, -0.4, -0.6 + k * 0.2 + 0.05, 0.74, -0.36); }, 'glow'), 'lamps', 'glow');
  const balls = [0, 1, 2].map((k) => {
    const m = mesh(geometry((b) => { b.tint(1.25, 0.5, 0.12, 1); sphere(b, BALL); b.tint(0.14, 0.09, 0.06, 1).cylinder(0, -0.008, 0, BALL * 1.012, BALL * 1.012, 0.016, 10, { capTop: false, capBottom: false }); }), `ball${k}`);
    m.visible = false;
    return m;
  });
  const shots = balls.map(() => ({ on: false, p: V(0, 0, 0), v: V(0, 0, 0), age: 0, hits: 0, clean: true, scored: false, done: false }));
  let charge = 0, dir = 1, held = false, cool = 0, phase = rnd(0, 6), hx = 0, streak = 0, flash = 0;
  const shoot = (power, aim, io) => {
    const s = shots.find((o) => !o.on);
    if (!s) return;
    const h = hitZ(aim, RIM_Z), tx = clamp(h ? h[0] : 0, -2.7, 2.7), zT = lerp(NEAR, FAR, power);
    Object.assign(s, { on: true, age: 0, hits: 0, clean: true, scored: false, done: false });
    s.p.set(tx * 0.12, 1.2, 0.8);
    s.v.set((tx - s.p.x) / T, (RIM_Y - s.p.y + 0.5 * G * T * T) / T, (zT - s.p.z) / T); // (through the height of the ring T seconds from now, whatever the strength)
    io.play('jump', { volume: 0.35, rate: 1.3 });
  };
  const game = {
    view: { pos: [0, 1.75, 2.6], look: [0, 2.05, -3.2], fov: 60 }, firstPerson: true, crosshair: true, sweet,
    reset() { game.score = 0; game.gauge = null; game.at = 0; charge = 0; dir = 1; held = false; cool = 0; streak = 0; flash = 0; for (const s of shots) s.on = false; },
    step(dt, t, time, aim, io) {
      const p = t < 0 ? 0 : clamp01(t / 45);
      phase += dt * (0.85 + 0.95 * p);
      hx = (0.5 + 1.5 * clamp01(Math.max(0, t) / 20)) * clamp(1.3 * Math.sin(phase), -1, 1);
      game.at = hx;
      rig.position.set(hx, RIM_Y, RIM_Z);
      if (flash > 0) flash -= dt;
      lamps.visible = flash > 0 && Math.floor(flash * 12) % 2 === 0;
      lamps.position.copy(rig.position);
      for (let k = 0; k < shots.length; k++) {
        const s = shots[k], m = balls[k];
        if (s.on) {
          s.age += dt;
          const y0 = s.p.y;
          s.v.y -= G * dt;
          s.p.addScaledVector(s.v, dt);
          // the board sends it back
          if (s.v.z < 0 && s.p.z - BALL < BOARD_Z && s.p.z > BOARD_Z - 0.35 && Math.abs(s.p.x - hx) < 0.67 && s.p.y > RIM_Y - 0.14 && s.p.y < RIM_Y + 0.66) { s.p.z = BOARD_Z + BALL; s.v.z *= -0.5; s.clean = false; io?.play('land', { volume: 0.4 }); }
          // down through the plane of the ring: in, on the ring, or beside it
          if (!s.scored && s.v.y < 0 && y0 >= RIM_Y && s.p.y < RIM_Y) {
            const d = Math.hypot(s.p.x - hx, s.p.z - RIM_Z);
            if (d < RIM_R - 0.09) {
              const swish = s.clean && d < 0.1, pts = 10 + 5 * Math.min(streak, 6) + (swish ? 5 : 0);
              s.scored = true; game.score += pts; streak++; flash = 0.6;
              s.v.x *= 0.2; s.v.z *= 0.2;
              io?.play(swish ? 'coin' : 'score', { volume: 0.7 });
              if (swish) io?.note(`Swish! +${pts}`); else if (streak === 3) io?.note('Three in a row: on fire!');
            } else if (d < RIM_R + BALL && s.hits < 2) {
              const ux = (s.p.x - hx) / (d || 1), uz = (s.p.z - RIM_Z) / (d || 1), out = d > RIM_R ? 1 : -0.7;
              s.hits++; s.clean = false; s.p.y = RIM_Y + 0.01; s.v.y = Math.abs(s.v.y) * 0.42 + 0.6;
              s.v.x = s.v.x * 0.3 + ux * out * 1.1; s.v.z = s.v.z * 0.3 + uz * out * 1.1;
              io?.play('land', { volume: 0.5, rate: 1.5 });
            }
          }
          if (s.p.z < BACK + 0.2 + BALL && s.v.z < 0) { s.p.z = BACK + 0.2 + BALL; s.v.z *= -0.4; }
          if (Math.abs(s.p.x) > HALF - BALL - 0.05) { s.p.x = Math.sign(s.p.x) * (HALF - BALL - 0.05); s.v.x *= -0.5; }
          if (s.p.y < BALL + 0.05) {
            if (!s.done) { s.done = true; if (!s.scored) streak = 0; } // (a ball on the floor that did not go in ends the row)
            s.p.y = BALL + 0.05; s.v.y = Math.abs(s.v.y) * 0.5; s.v.x *= 0.7; s.v.z *= 0.7;
            if (s.v.y < 0.9) s.on = false;
          }
          if (s.age > 4 || (s.v.z > 0 && s.p.z > FRONT - 0.6)) s.on = false; // (too old, or on its way back out of the booth)
          m.position.copy(s.p); m.rotation.x -= dt * 7;
        }
        m.visible = s.on;
      }
      needle.visible = held;
      if (t < 0 || !aim) { held = false; game.gauge = null; return; }
      // winding up
      cool -= dt;
      if (aim.down && !held && cool <= 0) { held = true; charge = 0; dir = 1; }
      if (held) {
        charge += dir * dt * 0.8;
        if (charge >= 1) { charge = 2 - charge; dir = -1; } else if (charge <= 0) { charge = -charge; dir = 1; }
        game.gauge = charge;
        needle.position.set(MX + 0.014, MY + charge * MH, -1.4);
        if (!aim.down) { held = false; game.gauge = null; shoot(charge, aim, io); cool = 0.22; }
      } else if (aim.clicks > 0 && cool <= 0) { shoot(0.18, aim, io); cool = 0.22; } // (a tap: a ball that hardly leaves the hand)
    },
  };
  game.reset();
  return game;
}

// ---------------------------------------------------------------------------
// Stack It. A floor slides from side to side over the tower; a click drops it. What rests on the floor below
// stays, what sticks out falls off, and the next floor is as wide as what stayed. Dropped just right (within
// a few centimetres) it keeps its width — three such in a row and it grows back a little. Each floor comes
// faster than the last. The tower sinks into its plinth as it grows, so that its top stays in front of the eyes.

function stack(parts, booth, mesh) {
  const paint = parts.get('paint');
  const H = 0.24, D = 1.0, W0 = 1.7, Z = -1.7, BASE = 0.9, SPAN = 2.3, N = 10;
  // dusk over a city: a sky in bands, a low sun, towers with their windows lit; a plinth edged with hazard tape
  for (const [y0, y1, c] of [[0, 1.3, [1.25, 0.62, 0.3]], [1.3, 2.2, [0.85, 0.4, 0.42]], [2.2, 3.1, [0.36, 0.24, 0.5]]]) paint.tint(c[0], c[1], c[2], 1).box(-HALF, y0, BACK, HALF, y1, BACK + 0.04, { faces: 'Z' });
  round(paint, 1.2, 1.35, BACK + 0.045, 0.5, [1.7, 1.25, 0.4], 16);
  for (let k = 0; k < 13; k++) {
    const x0 = -HALF + k * 0.465, h = 0.55 + (((k * 37) % 11) / 10) * 1.35;
    paint.tint(0.1, 0.08, 0.17, 1).box(x0, 0, BACK + 0.05, x0 + 0.42, h, BACK + 0.056, { faces: 'Z' });
    paint.tint(1.5, 1.2, 0.45, 1);
    for (let j = 0; j < Math.floor(h / 0.27); j++) for (let i = 0; i < 2; i++) if ((k * 3 + j * 5 + i) % 3) paint.box(x0 + 0.08 + i * 0.17, 0.14 + j * 0.27, BACK + 0.057, x0 + 0.17 + i * 0.17, 0.26 + j * 0.27, BACK + 0.059, { faces: 'Z' });
  }
  paint.tint(0.3, 0.3, 0.36, 1).box(-1.25, 0, Z - 0.75, 1.25, BASE, Z + 0.75, { faces: 'xXZY' });
  for (let k = 0; k < 10; k++) paint.tint(...(k % 2 ? [0.08, 0.08, 0.08] : [1.3, 1.0, 0.1]), 1).box(-1.25 + k * 0.25, BASE - 0.14, Z + 0.752, -1.0 + k * 0.25, BASE, Z + 0.756, { faces: 'Z' });
  const TONES = [[0.95, 0.3, 0.3], [0.98, 0.65, 0.15], [0.95, 0.9, 0.3], [0.3, 0.8, 0.45], [0.25, 0.6, 0.95]];
  const blocks = Array.from({ length: N }, (_, k) => {
    const c = TONES[k % TONES.length];
    const m = mesh(geometry((b) => { b.tint(c[0], c[1], c[2], 1).box(-0.5, 0, -D / 2, 0.5, H, D / 2); b.tint(c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 1).box(-0.5, 0.0, D / 2, 0.5, 0.04, D / 2 + 0.004, { faces: 'Z' }); }), `floor${k}`);
    m.visible = false;
    return m;
  });
  const chip = mesh(geometry((b) => b.tint(0.9, 0.9, 0.92, 1).box(-0.5, 0, -D / 2, 0.5, H, D / 2)), 'chip');
  chip.visible = false;
  let floors = [], sx = 0, sdir = 1, w = W0, speed = 1.6, streak = 0, sink = 0, fall = null, lost = 0;
  const next = () => { sdir = -sdir; sx = -sdir * SPAN; speed = Math.min(5.4, 1.6 + 0.11 * floors.length); };
  const game = {
    view: { pos: [0, 2.3, 3.2], look: [0, 1.85, Z], fov: 56 }, firstPerson: true, crosshair: false,
    line: () => `${floors.length - 1} floor${floors.length === 2 ? '' : 's'} · ${game.score} pts`,
    reset() { game.score = 0; game.over = false; floors = [{ x: 0, w: W0 }]; w = W0; streak = 0; sink = 0; fall = null; lost = 0; sdir = -1; next(); chip.visible = false; },
    step(dt, t, time, aim, io) {
      const n = floors.length, top = floors[n - 1];
      sink += (Math.max(0, n - 4) * H - sink) * Math.min(1, dt * 6);
      if (!game.over) {
        sx += sdir * speed * dt;
        if (sx > SPAN) { sx = 2 * SPAN - sx; sdir = -1; } else if (sx < -SPAN) { sx = -2 * SPAN - sx; sdir = 1; }
      }
      game.at = sx; game.goal = top.x;
      // what is seen: the floors that are down, the one that slides, a piece that falls
      for (let k = 0; k < N; k++) blocks[k].visible = false;
      for (let f = Math.max(0, n - (N - 1)); f < n; f++) { const m = blocks[f % N]; m.visible = true; m.scale.x = floors[f].w; m.position.set(floors[f].x, BASE + f * H - sink, Z); m.rotation.z = 0; }
      const slider = blocks[n % N];
      if (!game.over) { slider.visible = true; slider.scale.x = w; slider.position.set(sx, BASE + n * H - sink + 0.07, Z); slider.rotation.z = 0; }
      if (fall) {
        fall.vy -= 9.8 * dt; fall.y += fall.vy * dt; fall.rot += fall.spin * dt;
        fall.mesh.visible = fall.y > -0.5; fall.mesh.scale.x = fall.w; fall.mesh.position.set(fall.x, fall.y, Z); fall.mesh.rotation.z = fall.rot;
        if (fall.y <= -0.5) fall = null;
      }
      if (t < 0 || !aim || game.over || !aim.clicks) return;
      const l = Math.max(sx - w / 2, top.x - top.w / 2), r = Math.min(sx + w / 2, top.x + top.w / 2), ov = r - l, y = BASE + n * H - sink;
      if (ov < 0.03) {
        // beside the tower: it is over
        game.over = true;
        fall = { mesh: slider, x: sx, y, w, vy: 0, rot: 0, spin: sdir * 2.5 };
        io.play('fail', { volume: 0.7 });
        return;
      }
      if (Math.abs(sx - top.x) < 0.05) {
        streak++;
        if (streak >= 3) w = Math.min(W0, w + 0.1);
        floors.push({ x: top.x, w });
        game.score += 10 + 5 * Math.min(streak, 5);
        io.play('checkpoint', { volume: 0.7, rate: 1 + 0.07 * Math.min(streak, 8) });
        io.note(streak >= 3 ? 'Perfect! It grows back.' : 'Perfect!');
      } else {
        const cut = w - ov;
        fall = { mesh: chip, x: sx > top.x ? r + cut / 2 : l - cut / 2, y, w: cut, vy: 0, rot: 0, spin: sx > top.x ? -3 : 3 };
        w = ov; streak = 0;
        floors.push({ x: (l + r) / 2, w });
        game.score += 10;
        io.play('land', { volume: 0.7 });
        if (w < 0.06) { game.over = true; return; }
      }
      next();
      game.at = sx; game.goal = floors[floors.length - 1].x; // (where things stand now: the next floor starts from the other side)
    },
  };
  game.reset();
  return game;
}

// ---------------------------------------------------------------------------
// Geiger Says. Four great lamps on the wall of a control room. They light one after the other, each with its
// note; then it is the player's turn to click them in the same order. Each round adds one to the sequence and
// shows it a little faster. A wrong lamp, or five seconds without one, costs one of three lives, and the
// sequence is shown again. A round pays ten points a lamp, and up to half as much again for answering briskly.

function geiger(parts, booth, mesh) {
  const paint = parts.get('paint');
  const X = [-2.1, -0.7, 0.7, 2.1], Y = 1.65, R = 0.56, ZW = BACK + 0.05;
  const COL = [[0.2, 0.9, 0.3], [1.0, 0.85, 0.15], [1.0, 0.25, 0.2], [0.25, 0.55, 1.0]], RATE = [0.75, 0.9, 1.12, 1.35];
  // steel panels and their rivets, a hazard stripe along the top, the housings of the lamps, a dial and its needle
  paint.tint(0.3, 0.36, 0.38, 1).box(-HALF, 0, BACK, HALF, 3.1, BACK + 0.04, { faces: 'Z' });
  for (let k = 0; k < 4; k++) paint.tint(0.24, 0.29, 0.31, 1).box(-HALF + 0.06 + k * 1.5, 0.08, BACK + 0.042, -HALF + 1.44 + k * 1.5, 2.66, BACK + 0.045, { faces: 'Z' });
  for (let k = 0; k < 12; k++) paint.tint(...(k % 2 ? [0.08, 0.08, 0.08] : [1.3, 1.0, 0.1]), 1).quad(V(-HALF + k * 0.5, 2.74, ZW), V(-HALF + k * 0.5 + 0.5, 2.74, ZW), V(-HALF + k * 0.5 + 0.72, 3.08, ZW), V(-HALF + k * 0.5 + 0.22, 3.08, ZW));
  X.forEach((x, k) => {
    round(paint, x, Y, ZW, R + 0.11, [0.1, 0.11, 0.13], 18);
    round(paint, x, Y, ZW + 0.004, R, COL[k].map((c) => c * 0.26), 18);
    for (let j = 0; j < 6; j++) { const a = (j / 6) * Math.PI * 2; round(paint, x + Math.cos(a) * (R + 0.055), Y + Math.sin(a) * (R + 0.055), ZW + 0.006, 0.025, [0.6, 0.62, 0.65], 6); }
  });
  round(paint, 0, 0.62, ZW, 0.36, [0.92, 0.9, 0.82], 16);
  paint.tint(0.75, 0.1, 0.08, 1).quad(V(-0.02, 0.6, ZW + 0.005), V(0.02, 0.6, ZW + 0.005), V(0.2, 0.86, ZW + 0.005), V(0.17, 0.88, ZW + 0.005));
  const lit = X.map((x, k) => {
    const m = mesh(geometry((b) => { round(b, 0, 0, 0, R, COL[k].map((c) => c * 1.55), 18); round(b, -0.16, 0.18, 0.003, 0.14, [1.7, 1.7, 1.7], 8); }, 'glow'), `lit${k}`, 'glow');
    m.position.set(x, Y, ZW + 0.01);
    m.visible = false;
    return m;
  });
  const glow = [0, 0, 0, 0];
  let seq = [], phase = 'pause', i = 0, timer = 0, lives = 3, stage = 1, took = 0, idle = 0;
  const draw = () => { let k; do k = Math.floor(Math.random() * 4); while (seq.length > 1 && seq[seq.length - 1] === k && seq[seq.length - 2] === k); return k; };
  const game = {
    view: { pos: [0, 1.72, 2.5], look: [0, 1.66, -3.2], fov: 58 }, firstPerson: true, crosshair: true,
    line: () => `round ${stage} · ${game.score} pts · ${hearts(lives)}`,
    reset() { game.score = 0; game.over = false; seq = []; seq.push(draw()); seq.push(draw()); phase = 'pause'; game.phase = phase; timer = 1.0; lives = 3; stage = 1; i = 0; glow.fill(0); },
    step(dt, t, time, aim, io) {
      for (let k = 0; k < 4; k++) { glow[k] -= dt; lit[k].visible = glow[k] > 0; }
      if (t < 0 || !aim) { if ((idle -= dt) <= 0) { idle = 0.6; glow[Math.floor(Math.random() * 4)] = 0.3; } return; }
      if (game.over) return;
      timer -= dt;
      const on = Math.max(0.2, 0.5 - 0.03 * stage);
      if (phase === 'pause') { if (timer <= 0) { phase = 'show'; i = 0; timer = 0.2; } }
      else if (phase === 'show') {
        if (timer <= 0) {
          if (i < seq.length) { const k = seq[i++]; glow[k] = on; io.play('checkpoint', { rate: RATE[k], volume: 0.7 }); timer = on + 0.13; }
          else { phase = 'input'; i = 0; timer = 5; took = 0; }
        }
      } else if (phase === 'input') {
        took += dt;
        let k = -1;
        if (aim.clicks) { const h = hitZ(aim, ZW); if (h) { let bd = R + 0.16; X.forEach((x, j) => { const d = Math.hypot(h[0] - x, h[1] - Y); if (d < bd) { bd = d; k = j; } }); } }
        if (k >= 0 && k === seq[i]) {
          glow[k] = 0.22; io.play('checkpoint', { rate: RATE[k], volume: 0.7 });
          i++; timer = 5;
          if (i === seq.length) {
            // the whole of it: a longer one next
            const n = seq.length;
            game.score += 10 * n + Math.round(5 * n * clamp01(1.7 - took / n));
            stage++; seq.push(draw());
            phase = 'pause'; timer = 0.9;
            io.play('score', { volume: 0.5 });
          }
        } else if (k >= 0 || timer <= 0) {
          lives--;
          glow.fill(0.45);
          io.play('fail', { volume: 0.7 });
          if (lives <= 0) game.over = true; else { io.note(k >= 0 ? 'Wrong lamp! Watch again.' : 'Too slow! Watch again.'); phase = 'pause'; timer = 1.1; }
        }
      }
      game.phase = phase;
    },
  };
  game.reset();
  return game;
}

// ---------------------------------------------------------------------------
// Hook, Line & Sinker. The sea in a box: fish cross it at their own depth — the small ones near the top, the
// big ones near the bottom, a golden one now and then, in a hurry. The hook goes where one points, no faster
// than a hook can; a fish it touches is caught, and counts once it is brought up to the surface. Drums of
// something that glows sink through the water: a hook that touches one loses its fish, and fifteen points.

function fish(parts, booth, mesh) {
  const paint = parts.get('paint');
  const Z = -2.2, TOP = 2.5, X0 = -2.65, X1 = 2.65, Y0 = 0.6;
  // the water, darker towards the bottom; the sky over it and the crests of the waves; a bed of sand, weeds, a drum half buried
  for (let k = 0; k < 5; k++) paint.tint(0.04 + 0.03 * k, 0.17 + 0.09 * k, 0.36 + 0.11 * k, 1).box(-HALF, 0.3 + k * 0.46, BACK, HALF, 0.3 + (k + 1) * 0.46, BACK + 0.04, { faces: 'Z' });
  paint.tint(0.6, 0.84, 1.05, 1).box(-HALF, 2.6, BACK, HALF, 3.1, BACK + 0.04, { faces: 'Z' });
  for (let k = 0; k < 12; k++) { const pts = []; for (let a = 0; a <= 6; a++) pts.push(V(-HALF + 0.25 + k * 0.5 + Math.cos((Math.PI * a) / 6) * 0.27, 2.56 + Math.sin((Math.PI * a) / 6) * 0.1, BACK + 0.045)); paint.tint(1.3, 1.4, 1.5, 1).poly(pts); }
  paint.tint(0.9, 0.78, 0.5, 1).box(-HALF, 0, BACK, HALF, 0.34, -0.7, { faces: 'YZ' });
  for (let k = 0; k < 11; k++) {
    const x = -2.8 + k * 0.56 + ((k * 13) % 5) * 0.03, z = BACK + 0.25 + ((k * 7) % 4) * 0.5, h = 0.5 + ((k * 11) % 6) * 0.14, lean = ((k % 3) - 1) * 0.16;
    paint.tint(0.1, 0.45 + 0.05 * (k % 3), 0.22, 1).tri(V(x - 0.07, 0.34, z), V(x + 0.07, 0.34, z), V(x + lean, 0.34 + h, z)).tri(V(x + 0.1, 0.34, z), V(x + 0.22, 0.34, z), V(x + 0.2 - lean, 0.34 + h * 0.7, z));
  }
  paint.tint(1.2, 0.95, 0.1, 1).place(1.9, 0.3, -3.0, 0, 0, 0.5).cylinder(0, 0, 0, 0.2, 0.2, 0.42, 10).pop();
  // the fish: three kinds by depth and a golden one; each is its own mesh, turned about to swim the other way
  const KINDS = [
    { len: 0.3, pts: 10, c: [1.3, 0.55, 0.15], y: [1.6, 2.25], v: [1.1, 1.7], pull: 1 },
    { len: 0.44, pts: 25, c: [0.3, 0.85, 1.1], y: [1.05, 1.6], v: [0.8, 1.2], pull: 0.85 },
    { len: 0.62, pts: 50, c: [0.75, 0.4, 1.1], y: [0.68, 1.05], v: [0.5, 0.8], pull: 0.68 },
    { len: 0.34, pts: 100, c: [1.7, 1.3, 0.3], y: [0.75, 2.1], v: [2.2, 2.8], pull: 1 },
  ];
  const body = (k) => geometry((b) => {
    const L = k.len, c = k.c;
    b.tint(c[0], c[1], c[2], 1).place(0, 0, 0, 0, 0, -Math.PI / 2).lathe([[0.0, -L * 0.5], [L * 0.06, -L * 0.4], [L * 0.2, 0.0], [L * 0.19, L * 0.25], [L * 0.1, L * 0.43], [0.0, L * 0.5]], 7).pop();
    b.tint(c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, 1);
    for (const s of [1, -1]) { // the tail and a fin, seen from both sides
      const tail = [V(-L * 0.42, 0, 0), V(-L * 0.72, L * 0.22, 0), V(-L * 0.72, -L * 0.22, 0)], fin = [V(-L * 0.05, L * 0.18, 0), V(L * 0.12, L * 0.19, 0), V(-L * 0.12, L * 0.36, 0)];
      if (s > 0) b.tri(tail[0], tail[2], tail[1]).tri(fin[0], fin[1], fin[2]); else b.tri(tail[0], tail[1], tail[2]).tri(fin[0], fin[2], fin[1]);
    }
    b.tint(0.04, 0.04, 0.05, 1);
    for (const s of [1, -1]) b.box(L * 0.27, L * 0.03, s * L * 0.17 - 0.012, L * 0.33, L * 0.09, s * L * 0.17 + 0.012);
  });
  const shoal = [0, 0, 0, 1, 1, 1, 2, 3].map((kind, i) => { const m = mesh(body(KINDS[kind]), `f${i}`); m.visible = false; return { m, k: KINDS[kind], on: false, x: 0, y: 0, y0: 0, dir: 1, v: 1, wait: rnd(0, 2.5) * (kind === 3 ? 4 : 1), ph: rnd(0, 6) }; });
  const drums = [0, 1].map((i) => {
    const m = mesh(geometry((b) => { b.tint(1.25, 1.0, 0.1, 1).cylinder(0, -0.16, 0, 0.15, 0.15, 0.32, 9); b.tint(0.06, 0.06, 0.06, 1).cylinder(0, -0.05, 0, 0.154, 0.154, 0.1, 9, { capTop: false, capBottom: false }); }), `drum${i}`);
    m.visible = false;
    return { m, on: false, x: 0, y: 0, wait: 6 + i * 3.5, ph: rnd(0, 6) };
  });
  const line = mesh(geometry((b) => b.tint(1.4, 1.4, 1.4, 1).box(-0.007, 0, -0.007, 0.007, 1, 0.007)), 'line');
  const hook = mesh(geometry((b) => { b.tint(1.5, 1.1, 0.3, 1).box(-0.012, -0.16, -0.012, 0.012, 0, 0.012).box(-0.012, -0.18, -0.012, 0.09, -0.156, 0.012).box(0.066, -0.18, -0.012, 0.09, -0.1, 0.012); b.tint(1.3, 0.2, 0.15, 1); sphere(b, 0.035, 6, 4); }), 'hook');
  let hx = 0, hy = TOP, carry = null, stun = 0;
  const game = {
    view: { pos: [0, 1.75, 2.6], look: [0, 1.5, Z], fov: 58 }, firstPerson: true, crosshair: true,
    reset() { game.score = 0; game.carry = false; hx = 0; hy = TOP; carry = null; stun = 0; for (const d of drums) { d.on = false; d.wait = rnd(5, 9); } },
    step(dt, t, time, aim, io) {
      const playing = t >= 0 && !!aim, p = t < 0 ? 0 : clamp01(t / 45);
      // the fish swim across, each at its depth; one that leaves comes back a moment later
      for (const f of shoal) {
        if (f === carry) continue;
        if (!f.on) {
          if ((f.wait -= dt) > 0) { f.m.visible = false; continue; }
          f.on = true; f.dir = Math.random() < 0.5 ? 1 : -1; f.x = f.dir > 0 ? X0 - 0.6 : X1 + 0.6; f.y0 = rnd(f.k.y[0], f.k.y[1]); f.v = rnd(f.k.v[0], f.k.v[1]) * (1 + 0.25 * p);
        }
        f.x += f.dir * f.v * dt; f.y = f.y0 + 0.05 * Math.sin(time * 2.2 + f.ph);
        if (f.x < X0 - 0.7 || f.x > X1 + 0.7) { f.on = false; f.wait = rnd(0.6, 2.6) * (f.k.pts === 100 ? 4 : 1); }
        f.m.visible = f.on; f.m.position.set(f.x, f.y, Z); f.m.rotation.set(0, f.dir > 0 ? 0 : Math.PI, 0.12 * Math.sin(time * 9 + f.ph));
      }
      // the drums sink
      for (const d of drums) {
        if (!d.on) { if (playing && (d.wait -= dt) <= 0) { d.on = true; d.x = rnd(X0 + 0.3, X1 - 0.3); d.y = TOP + 0.3; } d.m.visible = d.on; continue; }
        d.y -= (0.42 + 0.3 * p) * dt;
        if (d.y < Y0 - 0.4) { d.on = false; d.wait = rnd(2.5, 6) * (1 - 0.4 * p); }
        d.m.visible = d.on; d.m.position.set(d.x + 0.12 * Math.sin(time * 1.7 + d.ph), d.y, Z); d.m.rotation.z = 0.3 * Math.sin(time * 1.3 + d.ph);
      }
      // the hook: towards where one points, at the pace of a hook (slower with a big fish on)
      if (playing) {
        const h = hitZ(aim, Z), tx = clamp(h ? h[0] : hx, X0, X1), ty = clamp(h ? h[1] : hy, Y0, TOP + 0.05), pull = carry ? carry.k.pull : 1;
        hx += clamp(tx - hx, -3.2 * pull * dt, 3.2 * pull * dt);
        hy += clamp(ty - hy, -2.3 * dt, 2.9 * pull * dt);
        if (stun > 0) stun -= dt;
        if (!carry && stun <= 0) for (const f of shoal) if (f.on && Math.hypot(f.x - hx, f.y - (hy - 0.12)) < f.k.len * 0.5 + 0.08) { carry = f; io.play('pick', { volume: 0.8 }); break; }
        for (const d of drums) if (d.on && Math.hypot(d.m.position.x - hx, d.y - (hy - 0.1)) < 0.25) {
          d.on = false; d.wait = rnd(2.5, 6); stun = 0.7;
          game.score = Math.max(0, game.score - 15);
          if (carry) { carry.on = true; carry.x = hx; carry.y0 = clamp(hy - 0.2, carry.k.y[0], carry.k.y[1]); carry = null; }
          io.play('fail', { volume: 0.6 }); io.note('A drum! −15');
        }
        if (carry && hy >= TOP - 0.04) {
          game.score += carry.k.pts;
          io.play('coin', { volume: 0.8 }); io.note(`+${carry.k.pts}`);
          carry.on = false; carry.wait = rnd(0.8, 2.4) * (carry.k.pts === 100 ? 4 : 1); carry.m.visible = false; carry = null;
        }
      } else { hx += (0 - hx) * Math.min(1, dt * 2); hy += (TOP - 0.3 - hy) * Math.min(1, dt * 2); if (carry) { carry.on = false; carry = null; } }
      if (carry) { carry.m.visible = true; carry.m.position.set(hx, hy - 0.2 - carry.k.len * 0.3, Z); carry.m.rotation.set(0, 0, Math.PI / 2 + 0.3 * Math.sin(time * 22)); }
      game.carry = !!carry;
      line.position.set(hx, hy, Z); line.scale.y = Math.max(0.01, 3.0 - hy);
      hook.position.set(hx, hy, Z);
    },
  };
  game.reset();
  return game;
}

// ---------------------------------------------------------------------------
// SCRAM! A round window on the core of a reactor: green, and calm. After a wait that is never the same it
// turns red: click. The time between the two is the score of the alarm; five alarms, and their average, in
// milliseconds, goes on the board — the lower the better. A click before the red costs 300 ms and the wait
// starts again; so does a click on the blue flash that the core gives, now and then, just to see. (A click
// that comes less than 90 ms after the red was on its way before it: it counts as one too soon.)

function scram(parts, booth, mesh) {
  const paint = parts.get('paint');
  const CY = 1.72, ZW = BACK + 0.05, R = 0.95, ALARMS = 5;
  // concrete, a band of hazard tape, pipes, the window and its bolts; five small lamps: one for each alarm dealt with
  paint.tint(0.44, 0.45, 0.47, 1).box(-HALF, 0, BACK, HALF, 3.1, BACK + 0.04, { faces: 'Z' });
  for (let k = 0; k < 12; k++) paint.tint(...(k % 2 ? [0.08, 0.08, 0.08] : [1.3, 1.0, 0.1]), 1).quad(V(-HALF + k * 0.5, 0.1, ZW), V(-HALF + k * 0.5 + 0.5, 0.1, ZW), V(-HALF + k * 0.5 + 0.7, 0.4, ZW), V(-HALF + k * 0.5 + 0.2, 0.4, ZW));
  for (const [x, c] of [[-2.55, [0.75, 0.3, 0.2]], [-2.2, [0.3, 0.5, 0.7]], [2.2, [0.3, 0.5, 0.7]], [2.55, [0.75, 0.3, 0.2]]]) paint.tint(c[0], c[1], c[2], 1).rod(V(x, 0.4, BACK + 0.14), V(x, 3.08, BACK + 0.14), 0.09, 7);
  round(paint, 0, CY, ZW, R + 0.2, [0.2, 0.21, 0.23], 22);
  round(paint, 0, CY, ZW + 0.004, R, [0.03, 0.07, 0.05], 22);
  for (let j = 0; j < 10; j++) { const a = (j / 10) * Math.PI * 2; round(paint, Math.cos(a) * (R + 0.1), CY + Math.sin(a) * (R + 0.1), ZW + 0.006, 0.04, [0.62, 0.64, 0.66], 6); }
  for (let k = 0; k < ALARMS; k++) round(paint, -0.6 + k * 0.3, 0.6, ZW, 0.09, [0.1, 0.11, 0.12], 10);
  const done = Array.from({ length: ALARMS }, (_, k) => { const m = mesh(geometry((b) => round(b, 0, 0, 0, 0.075, [0.4, 1.6, 0.5], 10), 'glow'), `done${k}`, 'glow'); m.position.set(-0.6 + k * 0.3, 0.6, ZW + 0.01); m.visible = false; return m; });
  const core = [[0.3, 1.35, 0.5], [1.8, 0.14, 0.1], [0.3, 0.65, 1.8]].map((c, k) => { const m = mesh(geometry((b) => { round(b, 0, 0, 0, R * 0.97, c, 22); round(b, 0, 0, 0.003, R * 0.5, c.map((v) => v * 1.25), 16); }, 'glow'), ['calm', 'alarm', 'decoy'][k], 'glow'); m.position.set(0, CY, ZW + 0.012); m.visible = k === 0; return m; });
  const now = () => performance.now();
  let phase = 'wait', timer = 2, wait = 0, decoy = -1, blue = 0, at = 0, n = 0, penalty = 0, times = [];
  const arm = () => { phase = 'wait'; wait = 0; timer = rnd(1.4, 4.2); decoy = n >= 1 && Math.random() < 0.55 ? rnd(0.5, timer - 0.7) : -1; blue = 0; };
  const game = {
    view: { pos: [0, 1.72, 2.5], look: [0, 1.7, -3.2], fov: 58 }, firstPerson: true, crosshair: false,
    line: () => `alarm ${Math.min(ALARMS, n + 1)} of ${ALARMS}${times.length ? ` · ${times[times.length - 1]} ms` : ''}`,
    reset() { game.score = 0; game.over = false; n = 0; penalty = 0; times = []; arm(); game.phase = phase; },
    step(dt, t, time, aim, io) {
      const calm = 0.58 + 0.035 * Math.sin(time * 3);
      if (t < 0 || !aim) { core[0].visible = true; core[0].scale.setScalar(calm); core[1].visible = core[2].visible = false; for (const m of done) m.visible = false; return; }
      const click = aim.clicks > 0;
      if (phase === 'wait') {
        wait += dt; timer -= dt;
        if (decoy >= 0 && wait >= decoy) { decoy = -1; blue = 0.24; io.play('click', { volume: 0.5 }); }
        if (blue > 0) blue -= dt;
        if (click) { penalty += 300; io.play('fail', { volume: 0.6 }); io.note('Too soon! +300 ms'); arm(); }
        else if (timer <= 0) { phase = 'alarm'; at = now(); io.play('press', { volume: 0.9 }); }
      } else if (phase === 'alarm') {
        const el = now() - at;
        if (click && el < 90) { penalty += 300; io.play('fail', { volume: 0.6 }); io.note('Too soon! +300 ms'); arm(); }
        else if (click || el > 1500) {
          const ms = Math.min(1500, Math.round(el)) + penalty;
          times.push(ms); penalty = 0; n++;
          io.play(click ? 'score' : 'fail', { volume: 0.6 }); io.note(click ? `${ms} ms` : 'Asleep at the desk: 1,500 ms');
          phase = 'shown'; timer = 1.0;
        }
      } else if (phase === 'shown') {
        if ((timer -= dt) <= 0) {
          if (n >= ALARMS) { game.score = Math.max(1, Math.round(times.reduce((a, b) => a + b, 0) / times.length)); game.over = true; phase = 'over'; } else arm();
        }
      }
      game.phase = phase;
      core[1].visible = phase === 'alarm'; core[1].scale.setScalar(0.96 + 0.04 * Math.sin(time * 40));
      core[2].visible = phase === 'wait' && blue > 0; core[2].scale.setScalar(0.7);
      core[0].visible = !core[1].visible && !core[2].visible; core[0].scale.setScalar(calm);
      done.forEach((m, k) => { m.visible = k < n; });
    },
  };
  game.reset();
  return game;
}

// ---------------------------------------------------------------------------
// Shell Shock. Three lead cups on a table; one is lifted to show the glowing core under it, and put down
// again. Then they change places, two at a time, one passing in front of the other — more often and faster
// each round; a fourth cup joins at the fourth round, a fifth at the eighth, and from the sixth round on two
// pairs may move at once. When they stop: which one? The right cup pays ten points times the round; a wrong
// one costs one of three lives, and the round is played again.

function cups(parts, booth, mesh) {
  const paint = parts.get('paint');
  const TY = 1.0, Z = -1.15, GAP = 1.15, MAXN = 5, CUP_H = 0.58;
  // a table of green felt edged with hazard tape; behind, a curtain the colour of midnight, with stars
  paint.tint(0.1, 0.42, 0.24, 1).box(-HALF, TY - 0.1, -2.75, HALF, TY, 0.45, { faces: 'YZ' });
  for (let k = 0; k < 12; k++) paint.tint(...(k % 2 ? [0.08, 0.08, 0.08] : [1.3, 1.0, 0.1]), 1).box(-HALF + k * 0.5, TY - 0.1, 0.452, -HALF + k * 0.5 + 0.5, TY, 0.456, { faces: 'Z' });
  paint.tint(0.07, 0.3, 0.17, 1).box(-HALF, 0, 0.3, HALF, TY - 0.1, 0.34, { faces: 'Z' });
  paint.tint(0.1, 0.08, 0.26, 1).box(-HALF, 0, BACK, HALF, 3.1, BACK + 0.04, { faces: 'Z' });
  for (let k = 0; k < 26; k++) round(paint, -2.8 + ((k * 47) % 57) / 10, 1.25 + ((k * 29) % 18) / 10, BACK + 0.045, 0.025 + (k % 3) * 0.012, [1.6, 1.5, 0.9], 5);
  const cupGeo = geometry((b) => {
    b.tint(0.42, 0.44, 0.5, 1).lathe([[0.36, 0.0], [0.36, 0.05], [0.31, 0.1], [0.25, 0.5], [0.2, CUP_H], [0.0, CUP_H]], 12);
    b.tint(1.3, 1.0, 0.1, 1).cylinder(0, 0.2, 0, 0.3, 0.285, 0.1, 12, { capTop: false, capBottom: false });
    b.tint(0.25, 0.26, 0.3, 1).place(0, CUP_H, 0).lathe([[0.0, 0.0], [0.07, 0.03], [0.05, 0.09], [0.0, 0.11]], 7).pop();
  });
  const cup = Array.from({ length: MAXN }, (_, k) => ({ m: mesh(cupGeo, `cup${k}`), slot: k, x: 0, z: Z, lift: 0 }));
  const core = mesh(geometry((b) => { b.tint(0.45, 1.7, 0.35, 1); sphere(b, 0.12, 8, 5); }, 'glow'), 'core', 'glow');
  let n = 3, where = 0, phase = 'reveal', timer = 0, stage = 1, lives = 3, left = 0, moves = [], pick = -1, rest = 0;
  const slotX = (s) => (s - (n - 1) / 2) * GAP;
  const deal = () => {
    n = 3 + (stage >= 4 ? 1 : 0) + (stage >= 8 ? 1 : 0);
    cup.forEach((c, k) => { c.slot = k; c.x = slotX(k); c.z = Z; c.lift = 0; c.m.visible = k < n; });
    where = Math.floor(Math.random() * n); phase = 'reveal'; timer = 1.2; left = Math.min(13, 3 + stage); moves = []; pick = -1; rest = 0;
  };
  const swap = (d) => {
    // two cups change places (one in front, the other behind); with room enough and late enough, two pairs at once
    const free = cup.slice(0, n).sort(() => Math.random() - 0.5), pairs = n >= 4 && stage >= 6 && Math.random() < 0.6 ? 2 : 1;
    for (let k = 0; k < pairs; k++) { const a = free[k * 2], b = free[k * 2 + 1], sign = Math.random() < 0.5 ? 1 : -1; moves.push({ c: a, from: a.x, to: b.x, sign, t: 0, d }, { c: b, from: b.x, to: a.x, sign: -sign, t: 0, d }); const s = a.slot; a.slot = b.slot; b.slot = s; }
  };
  const game = {
    view: { pos: [0, 2.45, 2.3], look: [0, 1.0, -1.3], fov: 56 }, firstPerson: true, crosshair: true,
    line: () => `round ${stage} · ${game.score} pts · ${hearts(lives)}`,
    reset() { game.score = 0; game.over = false; stage = 1; lives = 3; deal(); game.phase = phase; },
    step(dt, t, time, aim, io) {
      const playing = t >= 0 && !!aim && !game.over;
      timer -= dt;
      if (phase === 'reveal') {
        cup[where].lift = 0.6 * Math.sin(Math.PI * clamp01(1 - timer / 1.2));
        if (timer <= 0) { cup[where].lift = 0; phase = 'shuffle'; }
      } else if (phase === 'shuffle') {
        if (moves.length) {
          for (const m of moves) { m.t += dt; const u = clamp01(m.t / m.d), e = u * u * (3 - 2 * u); m.c.x = lerp(m.from, m.to, e); m.c.z = Z + m.sign * Math.sin(Math.PI * u) * Math.min(0.62, Math.abs(m.to - m.from) * 0.5); }
          if (moves[0].t >= moves[0].d) { for (const m of moves) { m.c.x = m.to; m.c.z = Z; } moves = []; rest = 0.03; }
        } else if ((rest -= dt) <= 0) {
          if (left-- > 0) { swap(Math.max(0.16, 0.5 - 0.035 * stage)); if (playing) io.play('click', { volume: 0.35, rate: 0.8 }); }
          else if (playing) phase = 'pick'; else deal(); // (nobody plays: the cups go on changing places, for show)
        }
      } else if (phase === 'pick') {
        if (playing && aim.clicks) {
          const h = hitY(aim, TY + 0.3);
          let bd = 0.5;
          if (h) cup.slice(0, n).forEach((c, k) => { const d = Math.hypot(h[0] - c.x, h[1] - c.z); if (d < bd) { bd = d; pick = k; } });
          if (pick >= 0) {
            phase = 'show'; timer = 1.2;
            if (pick === where) { game.score += 10 * stage + 5 * (n - 3); io.play('coin', { volume: 0.8 }); } else { lives--; io.play('fail', { volume: 0.7 }); io.note(lives > 0 ? 'Not that one!' : 'The core is lost.'); }
          }
        }
      } else if (phase === 'show') {
        const up = 0.6 * Math.sin(Math.PI * clamp01(1 - timer / 1.2));
        cup[pick].lift = up; cup[where].lift = up;
        if (timer <= 0) {
          if (pick === where) { stage++; if (stage === 4 || stage === 8) io?.play('checkpoint', { volume: 0.6 }); deal(); if (playing && (stage === 4 || stage === 8)) io.note('One more cup!'); }
          else if (lives <= 0) { game.over = true; cup[pick].lift = 0; cup[where].lift = 0; } else deal();
        }
      }
      game.phase = phase;
      for (let k = 0; k < n; k++) { const c = cup[k]; c.m.position.set(c.x, TY + c.lift, c.z); }
      core.visible = cup[where].lift > 0.08;
      core.position.set(cup[where].x, TY + 0.12, cup[where].z);
    },
  };
  game.reset();
  return game;
}

/** id → (parts, booth, mesh) → the game. */
export const STALL_GAMES = { hoop, stack, geiger, fish, scram, cups };
