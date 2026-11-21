// Games and dangers: the Sky Stones (a climb from stone to stone against the clock), the boulder that rolls
// down the island, the acid pond, the shark that keeps swimmers from going too far.
import * as THREE from 'three';
import { Parts, MeshBuilder } from '../../props/MeshBuilder.js';
import { LAYER, staticCaster } from '../../../render/Shadows.js';
import { mergeStatic, distanceCuller } from '../../props/StaticBatch.js';
import { makeMaterial, GLSL_COMMON, GLSL_LIGHTING } from '../../../render/globals.js';
import { cosmeticMaterial } from '../../../player/Cosmetics.js';
import { CLIMB, ACID, BOULDER, ISLAND, islandPath, islandAt, ISLAND_LENGTH } from '../../layout/layout.js';
import { climbCourse, stoneDepth, formatTime } from './course.js';

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
    this._acid();
    this._boulder();
    this._shark();
    this.group.updateMatrixWorld(true);
    return this;
  }

  // ---------------------------------------------------------------------------
  // The Sky Stones

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
      ctx.fillText('THE SKY STONES', w / 2, h * 0.52);
    }, 4.4, 0.82);
    sign.mesh.position.set(gx, gy + 3.2, gz);
    sign.mesh.rotation.y = Math.atan2(first.x - gx, first.z - gz) + Math.PI; // read from outside
    this.group.add(sign.mesh);
    // the board of the best climbs, to the right of the gate
    this.board = this._board(512, 704, (ctx, w, h) => this._drawScores(ctx, w, h), 2.5, 3.44);
    const bx = gx + 3.9, bz = gz - 0.6, by = this.ground(bx, bz);
    this.board.mesh.position.set(bx, by + 2.25, bz);
    this.board.mesh.rotation.y = sign.mesh.rotation.y + 0.35;
    this.group.add(this.board.mesh);
    const post = new Parts(), pw = post.get('woodDark');
    pw.tint(1.1, 1.0, 0.85, 1);
    for (const s of [-1.05, 1.05]) pw.box(bx + Math.cos(this.board.mesh.rotation.y) * s - 0.06, by - 0.3, bz - Math.sin(this.board.mesh.rotation.y) * s - 0.06, bx + Math.cos(this.board.mesh.rotation.y) * s + 0.06, by + 4.05, bz - Math.sin(this.board.mesh.rotation.y) * s + 0.06, { tile: 1 });
    this._add(post, 'climb-posts');
    this.colliders.push({ type: 'circle', x: bx, z: bz, r: 0.9 });
    this.scores = null; // not asked yet
    this.world.noFly.push({ x: C.x, z: C.z, r: C.r + 12 }); // (wide enough that nobody flies in from outside)
  }

  /** The line of the game in progress (see Hud.setRun): only the game that wrote it may take it away. */
  _line(owner, text) {
    if (text) { this._owner = owner; this.events.run?.(text); }
    else if (this._owner === owner) { this._owner = null; this.events.run?.(null); }
  }

  /** A flat sign drawn with a canvas: { mesh, redraw() }. */
  _board(w, h, draw, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false }));
    const redraw = () => { draw(canvas.getContext('2d'), w, h); texture.needsUpdate = true; };
    redraw();
    return { mesh, redraw };
  }

  _drawScores(ctx, w, h) {
    ctx.fillStyle = '#16211b'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 8; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#f2c14e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = "700 44px Georgia, 'Times New Roman', serif";
    ctx.fillText('BEST CLIMBS', w / 2, 54);
    ctx.font = '600 22px system-ui, sans-serif'; ctx.fillStyle = '#cfc7b2';
    ctx.fillText(`${CLIMB.height} m of stones · no jetpack`, w / 2, 96);
    const list = this.scores;
    ctx.font = '600 30px system-ui, sans-serif';
    if (!list || !list.length) {
      ctx.fillStyle = '#f6f1e4';
      ctx.fillText(list ? 'Nobody has made it yet.' : '…', w / 2, h / 2 - 10);
      if (list) { ctx.font = '500 24px system-ui, sans-serif'; ctx.fillStyle = '#cfc7b2'; ctx.fillText('Be the first!', w / 2, h / 2 + 30); }
      return;
    }
    list.slice(0, 10).forEach((e, i) => {
      const y = 150 + i * 53;
      ctx.fillStyle = i === 0 ? '#f2c14e' : i < 3 ? '#f6f1e4' : '#cfc7b2';
      ctx.textAlign = 'left'; ctx.fillText(`${i + 1}.`, 34, y);
      ctx.fillText(String(e.name).slice(0, 16), 86, y);
      ctx.textAlign = 'right'; ctx.fillText(mmss(e.ms), w - 34, y);
    });
  }

  /** The best climbs to show on the board: [{ name, ms }], best first. */
  setScores(list) { this.scores = list || []; this.board.redraw(); }

  _tickClimb(dt, player) {
    const C = CLIMB, p = player.pos, run = this.run, ev = this.events;
    const d = Math.hypot(p.x - C.x, p.z - C.z);
    this.near = d < C.r + 14;
    if (d > C.r + 5) { if (run.state !== 'idle') { run.state = 'idle'; this._line('climb', null); } return; }
    if (player.riding) player.riding = false; // on foot only
    const cheating = player.gravity !== 1 || player.boost !== 1;
    const onPlate = player.grounded && Math.abs(p.y - C.y) < 0.4 && (p.x - this.start.x) ** 2 + (p.z - this.start.z) ** 2 < this.start.r ** 2;
    if (onPlate) {
      if (run.state !== 'ready') { run.state = 'ready'; run.t = 0; this._line('climb', 'Ready — the clock starts when you leave the plate'); }
      run.clean = !cheating;
      return;
    }
    if (run.state === 'ready') { run.state = 'running'; run.t = 0; }
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
    const bd = this.data.meta.bounds, edges = [];
    let area = 0;
    for (let i = 0; i < bd.length; i++) { const a = bd[i], c = bd[(i + 1) % bd.length]; area += a[0] * c[1] - c[0] * a[1]; }
    const turn = area > 0 ? 1 : -1; // which way round the outline goes
    for (let i = 0; i < bd.length; i++) {
      const a = bd[i], c = bd[(i + 1) % bd.length], mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      const l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1, nx = ((c[1] - a[1]) / l) * turn, nz = (-(c[0] - a[0]) / l) * turn; // outwards
      if (this.ground(mx, mz) < -2 && this.ground(mx + nx * 20, mz + nz * 20) < -3 && this.ground(mx + nx * 42, mz + nz * 42) < -3) edges.push([a[0], a[1], c[0], c[1]]);
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
    if (s.mode !== 'chase' && inWater && far < 30) {
      s.mode = 'chase';
      this.events.note?.('A fin is heading your way. Swim back!');
      if (Math.hypot(p.x - s.x, p.z - s.z) > 60) {
        // it comes in from the open sea, not from the other end of the bay
        const q = this._nearestEdge(p.x, p.z), l = Math.hypot(q.x - p.x, q.z - p.z) || 1;
        s.x = p.x + ((q.x - p.x) / l) * 46; s.z = p.z + ((q.z - p.z) / l) * 46;
        s.yaw = Math.atan2(p.x - s.x, p.z - s.z); s.speed = 6;
      }
    }
    if (s.mode === 'chase' && (!inWater || far > 46)) s.mode = 'patrol';
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
    }
    if (camera) this._cull(camera.position);
  }
}
