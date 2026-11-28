// A plane in the sky, as an extra: every few minutes an airliner crosses high over the oasis, from one haze to
// the other, a white trail behind it — and whoever looks at it is told what their robot thinks of it ("A
// plane?… Strange. Everything was supposed to have stopped."). Asked for by the owner on 28 November 2026
// ("Rajouter avion dans le ciel et quand on le regarde on a un message … Fais le uniquement si le jeu
// s'alourdit de façon anecdotique"). Its switch: `plane` (RELEASE in src/app/config.js), ON as it is delivered —
// the owner asked for it to be there; off, nothing of it is loaded.
//
// What it weighs: this file, two meshes (a few hundred triangles, no texture) drawn only while a pass lasts —
// about one minute in five —, and a dozen sums a frame. Nothing is sent anywhere: where the plane is comes
// from the clock alone — the server's, which every page keeps (app.updates.now) —, so that everybody sees the
// same pass at the same moment and can point at it together.
export const PLANE = {
  every: 300, // s between two passes
  speed: 115, // m/s — slow for an airliner, so that there is time to look up
  reach: 3000, // m: it comes out of the haze this far from the middle, and goes back into it as far on the other side
  middle: [-60, 0], // the middle of the oasis, about
  aside: [1000, 1750], // m: how far from the middle its line passes (never overhead: one does not look straight up)
  height: [520, 700], // m over the sea
  span: 46, // m, wing tip to wing tip
  look: 8, // degrees: how near the middle of the view it has to be to be "looked at"…
  held: 0.6, // …and for how long (s)
};

/** What the robot thinks, sighting after sighting (kept in the browser: `mmf.plane`); the last one comes back. */
export const THOUGHTS = [
  'A plane?… Strange. Everything was supposed to have stopped.',
  'That plane again. The same line across the sky. Somebody still keeps a timetable.',
  'Nobody down here has fuel, or a runway. And yet there it goes.',
  'Maybe it never landed. Maybe it has been up there since the day everything stopped.',
  'You wave at the plane. It does not wave back. Planes never did.',
  'The plane. Right on time.',
];

const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

/**
 * Where the plane is at `ms` (the clock of the world): null between two passes, else
 * { pass, x, y, z, yaw, k (0…1 along its line), fade (0…1: out of the haze, and back into it) }.
 */
export function planeAt(ms, P = PLANE) {
  const t = ms / 1000, pass = Math.floor(t / P.every), into = t - pass * P.every;
  const length = 2 * P.reach, lasts = length / P.speed;
  if (into > lasts) return null;
  const heading = hash(pass) * Math.PI * 2, side = hash(pass + 0.5) < 0.5 ? -1 : 1;
  const aside = side * (P.aside[0] + hash(pass + 0.25) * (P.aside[1] - P.aside[0]));
  const y = P.height[0] + hash(pass + 0.75) * (P.height[1] - P.height[0]);
  const dx = Math.sin(heading), dz = Math.cos(heading), along = into * P.speed - P.reach;
  // (its line: through the point `aside` metres to the side of the middle, along its heading)
  const x = P.middle[0] + dz * aside + dx * along, z = P.middle[1] - dx * aside + dz * along;
  const k = into / lasts, edge = 650 / length;
  return { pass, x, y, z, yaw: heading, k, fade: Math.max(0, Math.min(1, k / edge, (1 - k) / edge)) };
}

/** Is the plane at `p` looked at from `eye` along `dir` (a unit vector)? — within `PLANE.look` degrees of the middle of the view. */
export function lookedAt(eye, dir, p, P = PLANE) {
  const x = p.x - eye.x, y = p.y - eye.y, z = p.z - eye.z, d = Math.hypot(x, y, z);
  return d > 1 && (x * dir.x + y * dir.y + z * dir.z) / d > Math.cos((P.look * Math.PI) / 180);
}

// ---- its shape: boxes that taper, each face its own shade (no light is computed: it is far, and in full sun)
function model(THREE, P) {
  const pos = [], col = [];
  const s = P.span / 46; // (drawn for a span of 46 m)
  const quad = (a, b, c, d, shade) => { for (const v of [a, b, c, a, c, d]) { pos.push(v[0] * s, v[1] * s, v[2] * s); col.push(shade[0], shade[1], shade[2]); } };
  const WHITE = [0.97, 0.97, 0.98], SIDE = [0.84, 0.87, 0.92], BELLY = [0.62, 0.67, 0.75], DARK = [0.36, 0.4, 0.47], FIN = [0.78, 0.33, 0.25];
  // a box between two cross-sections — at z0: half width w0, half height h0, its middle at height y0; at z1 likewise — `x` to the side
  const span = (z0, w0, h0, y0, z1, w1, h1, y1, [top, side, under] = [WHITE, SIDE, BELLY], x = 0) => {
    const A = [[x - w0, y0 - h0, z0], [x + w0, y0 - h0, z0], [x + w0, y0 + h0, z0], [x - w0, y0 + h0, z0]];
    const B = [[x - w1, y1 - h1, z1], [x + w1, y1 - h1, z1], [x + w1, y1 + h1, z1], [x - w1, y1 + h1, z1]];
    quad(A[3], A[2], B[2], B[3], top); quad(A[1], A[0], B[0], B[1], under);
    quad(A[0], A[3], B[3], B[0], side); quad(A[2], A[1], B[1], B[2], side);
    quad(A[0], A[1], A[2], A[3], side); quad(B[1], B[0], B[3], B[2], side);
  };
  /** A flat plate, white seen from over and grey from under (`m`: which side of the body it is on — its corners turn the other way). */
  const plate = (m, a, b, c, d) => { quad(...(m > 0 ? [a, b, c, d] : [d, c, b, a]), WHITE); quad(...(m > 0 ? [d, c, b, a] : [a, b, c, d]), BELLY); };
  // the body: nose (+z) to tail
  span(21, 0.5, 0.6, -0.3, 17, 1.9, 1.9, 0); span(17, 1.9, 1.9, 0, -9, 1.9, 1.9, 0); span(-9, 1.9, 1.9, 0, -20, 0.5, 0.7, 1.1);
  for (const m of [-1, 1]) {
    // a wing, swept back (its root at the body, its tip behind and a little higher), an engine under it, half the tailplane
    plate(m, [m * 1.6, -0.9, 5.5], [m * 23, 0.5, -6.5], [m * 23, 0.5, -9], [m * 1.6, -0.9, -2.5]);
    span(3.2, 0.95, 0.95, -1.9, -1.4, 0.8, 0.8, -1.9, [SIDE, DARK, DARK], m * 8);
    plate(m, [m * 0.8, 1.2, -16], [m * 8, 1.6, -19.5], [m * 8, 1.6, -21], [m * 0.8, 1.2, -19.5]);
  }
  // the fin, in the colour of a company nobody remembers
  quad([0, 1.6, -13.5], [0, 8.6, -19], [0, 8.6, -21], [0, 1.4, -20.5], FIN); quad([0, 1.4, -20.5], [0, 8.6, -21], [0, 8.6, -19], [0, 1.6, -13.5], FIN);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

// ---- its trail: two ribbons crossed (seen from below as from the side), thin and bright behind the engines,
// wide and gone a kilometre behind
function trail(THREE, P) {
  const pos = [], col = [], N = 22, L = 1150, from = 26;
  for (let i = 0; i < N; i++) {
    const seg = (j) => { const u = j / N, z = -(from + u * u * L + u * 40), w = 2.2 + u * 26, a = Math.min(1, u * 9) * (1 - u) ** 1.6 * 0.82; return { z, w, a }; };
    const a = seg(i), b = seg(i + 1);
    for (const flat of [true, false]) {
      const A0 = flat ? [-a.w, 0, a.z] : [0, -a.w * 0.6, a.z], A1 = flat ? [a.w, 0, a.z] : [0, a.w * 0.6, a.z];
      const B0 = flat ? [-b.w, 0, b.z] : [0, -b.w * 0.6, b.z], B1 = flat ? [b.w, 0, b.z] : [0, b.w * 0.6, b.z];
      for (const [v, al] of [[A0, a.a], [A1, a.a], [B1, b.a], [A0, a.a], [B1, b.a], [B0, b.a]]) { pos.push(v[0], v[1], v[2]); col.push(1, 1, 1, al); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  return geo;
}

/** Puts the plane in the sky of the running game. Returns { group, at(), zone, thoughts, clock } (`clock`: where its hour comes from — the checks set it). */
export function attach(app) {
  const { world, hud, player } = app, THREE = app.THREE, P = PLANE;
  const scene = world.scene || app.me?.root?.parent;
  if (!scene || !THREE) return null;
  const group = new THREE.Group();
  group.name = 'plane';
  group.visible = false;
  const body = new THREE.Mesh(model(THREE, P), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false, transparent: true }));
  const wake = new THREE.Mesh(trail(THREE, P), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  body.frustumCulled = wake.frustumCulled = false; // (two small meshes, drawn one minute in five: not worth a test each frame)
  body.renderOrder = 2; wake.renderOrder = 1;
  group.add(wake, body);
  scene.add(group);

  const store = { get: () => { try { return Number(localStorage.getItem('mmf.plane')) || 0; } catch { return 0; } }, set: (n) => { try { localStorage.setItem('mmf.plane', String(n)); } catch { /* a private window: it starts again */ } } };
  const api = { group, clock: () => (app.updates?.now ? app.updates.now() : Date.now()), at: () => planeAt(api.clock(), P), thoughts: THOUGHTS, said: -1, seen: store.get() };
  const dir = new THREE.Vector3();
  let stare = 0;
  /** Is the ground in the way, from `eye` towards the plane? (a few heights along the first hundreds of metres) */
  const hidden = (eye, p) => {
    for (let i = 1; i <= 8; i++) {
      const u = (i * 45) / Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z);
      if (u >= 1) break;
      if (world.data.heightAt(eye.x + (p.x - eye.x) * u, eye.z + (p.z - eye.z) * u) > eye.y + (p.y - eye.y) * u) return true;
    }
    return false;
  };
  const zone = {
    update: (dt, time, camera) => {
      const p = api.at();
      if (!p || p.fade <= 0) { if (group.visible) group.visible = false; stare = 0; return; }
      group.visible = true;
      group.position.set(p.x, p.y, p.z);
      group.rotation.y = p.yaw;
      body.material.opacity = p.fade;
      wake.material.opacity = p.fade;
      // looked at? — not during a game, not from under a roof of rock, once a pass
      if (api.said === p.pass || p.fade < 0.6 || !camera || player.driver || app.fair?.session || player.cave || player.dead) { stare = 0; return; }
      camera.getWorldDirection(dir);
      stare = lookedAt(camera.position, dir, p, P) ? stare + dt : 0;
      if (stare < P.held || hidden(camera.position, p)) return;
      api.said = p.pass;
      const text = THOUGHTS[Math.min(api.seen, THOUGHTS.length - 1)];
      store.set(++api.seen);
      hud.note(text, 9000);
      hud.addChat?.('✦', 5, text, true);
    },
  };
  world.zones.push(zone);
  api.zone = zone;
  return api;
}
