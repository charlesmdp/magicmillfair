// The water slide ("Mostly Down"): what is seen of it and how it is ridden. The line it follows is in
// track.js, the way one goes down it in ride.js; here it is built — the trough in bands of colour, the water
// that runs in it, the masts of its helices and the legs of the rest, the deck at the top, the arches, the
// buoys, the strips of light, the gate on the beach and the board of the best times — and a ride is run.
//
// Like the race, a ride is a session that drives the player (see PlayerController.driver): the game opens
// it, calls its camera every frame, reads its line for the clock of the screen and its time at the end.
// Nothing here knows about the keyboard, the network or the leaderboards.
import * as THREE from 'three';
import { Parts } from '../../../props/MeshBuilder.js';
import { LAYER } from '../../../../render/Shadows.js';
import { distanceCuller } from '../../../props/StaticBatch.js';
import { makeMaterial, GLSL_COMMON, GLSL_SHADOW, GLSL_LIGHTING } from '../../../../render/globals.js';
import { ANIM } from '../../../../player/Character.js';
import { canvasBoard } from '../Boards.js';
import { formatTime } from '../course.js';
import { SLIDE, slideCourse, lineAt, frameAt } from './track.js';
import { RIDE, startRide, stepRide, ridePose, rideProgress, lowSide, botInput } from './ride.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

const CREAM = [1.3, 1.17, 0.9], RED = [0.95, 0.1, 0.12], GOLD = [1.5, 1.05, 0.2], TEAL = [0.12, 0.7, 0.78], BLUE = [0.16, 0.36, 1.0];
const PURPLE = [0.5, 0.2, 0.85], NAVY = [0.07, 0.07, 0.2], YELLOW = [1.6, 1.3, 0.12], WHITE = [1.7, 1.7, 1.66], STEEL = [0.5, 0.53, 0.58];
// two colours for each stretch of the course, in bands; a shortcut wears the colours of a warning
const BANDS = [[RED, CREAM], [GOLD, CREAM], [TEAL, CREAM], [RED, GOLD], [BLUE, WHITE], [PURPLE, TEAL], [RED, CREAM], [BLUE, WHITE]];
const WARN = [NAVY, YELLOW];
const BAND = 6; // metres of one colour
const WALL = 0.13; // thickness of the trough
const SEAT = 0.34; // how high the rider's hips ride above the bottom of the trough (on a ring)

// ---------------------------------------------------------------------------------------------- the water
// A sheet of water running down the bottom of the trough: streaks of foam that go the way one slides.
const WATER_VERT = /* glsl */ `
${GLSL_COMMON}
out vec2 vUv;
out vec3 vWorld;
out vec3 vNormalW;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const WATER_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_SHADOW}
${GLSL_LIGHTING}
uniform sampler2D uFoam;
in vec2 vUv;   // x: -1..1 across the sheet, y: metres along the flow
in vec3 vWorld;
in vec3 vNormalW;
void main() {
  float a1 = texture(uFoam, vec2(vUv.x * 0.7, vUv.y * 0.09 - uTime * 1.1)).r;
  float a2 = texture(uFoam, vec2(vUv.x * 1.6 + 0.37, vUv.y * 0.19 - uTime * 1.9)).r;
  float streak = smoothstep(0.42, 0.92, a1 * 0.62 + a2 * 0.52);
  float edge = 1.0 - smoothstep(0.55, 1.0, abs(vUv.x));
  vec3 n = normalize(vNormalW);
  float shadow = sunShadow(vWorld, n);
  vec3 light = hemiAmbient(n) + uSunColor * (0.2 + 0.8 * shadow) * max(dot(n, uSunDir), 0.0);
  vec3 view = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(view, n), 0.0), 3.0);
  vec3 tone = mix(vec3(0.16, 0.6, 0.78), vec3(1.0), streak * 0.85);
  vec3 col = tone * light + vec3(0.75, 0.9, 1.0) * fres * 0.35;
  float alpha = edge * mix(0.62, 0.95, streak);
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col) * alpha, alpha);
}
`;
let waterMat = null;
function waterMaterial(foam) {
  if (!waterMat) {
    waterMat = makeMaterial({
      uniforms: { uFoam: foam }, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, side: THREE.DoubleSide,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    waterMat.name = 'slide:water';
  }
  return waterMat;
}

// ---------------------------------------------------------------------------------------------- building

const _f = { side: [0, 0, 0], up: [0, 0, 0] };
/** A point of the pipe of radius `r` round the axis of the trough at a sample, `a` radians from its bottom. */
function onPipe(p, f, a, r, out = V(0, 0, 0)) {
  const R = SLIDE.radius, sn = Math.sin(a) * r, cs = R - Math.cos(a) * r;
  return out.set(p.x + f.side[0] * sn + f.up[0] * cs, p.y + f.side[1] * sn + f.up[1] * cs, p.z + f.side[2] * sn + f.up[2] * cs);
}
/** …and the way out of the pipe there (towards its axis when `inward`). */
function pipeNormal(f, a, inward, out = V(0, 0, 0)) {
  const sn = Math.sin(a), cs = Math.cos(a), k = inward ? -1 : 1;
  return out.set((f.side[0] * sn - f.up[0] * cs) * k, (f.side[1] * sn - f.up[1] * cs) * k, (f.side[2] * sn - f.up[2] * cs) * k);
}

export class Slide {
  /**
   * @param world the world: its scene, its ground (data), its materials, its water (for the foam), its engine
   * @param {{ board?: boolean }} [o] board: false when the game hangs its own board of scores at `boardSpot`
   *   (GamesZone.scoreStand) instead of the plain one built here
   */
  constructor(world, { board = true } = {}) {
    this.world = world;
    this.ownBoard = board;
    this.data = world.data;
    this.course = slideCourse();
    this.group = new THREE.Group();
    this.group.name = 'slide';
    this.session = null;
    this.best = null; // the best time of this visitor, ms
    this.events = null;
  }

  build() {
    const world = this.world, mats = world.materials, tier = world.engine.tier, cast = [LAYER.STATIC_CASTER], course = this.course;
    // the trough, a stretch of some fifty metres at a time (what is out of sight is not drawn)
    const lines = [course.main, ...course.forks];
    lines.forEach((line, li) => {
      const pts = line.points, CHUNK = 56;
      for (let from = 0; from < pts.length - 1; from += CHUNK) {
        const parts = new Parts();
        this._trough(parts.get('paint'), line, from, Math.min(pts.length - 1, from + CHUNK));
        const g = parts.toMeshes(mats, { name: `slide-trough${li}-${from}`, layers: cast });
        this.group.add(g);
      }
    });
    this._water(lines);
    this._supports(mats, cast);
    this._ends(mats, cast);
    this._things(mats);
    this.group.updateMatrixWorld(true);
    const far = tier.phone ? 0.6 : 1;
    this._cull = distanceCuller(this.group, [[/^slide-water/, 260 * far], [/^slide-things/, 240 * far], [/^slide-arches/, 420 * far], [/^slide-trough/, 1500], [/^slide-legs/, 1200], [/./, 900]]);
    world.scene.add(this.group);
    return this;
  }

  /** The trough of a line between two samples: its inside, its outside and its two lips. */
  _trough(b, line, i0, i1) {
    const pts = line.points, R = SLIDE.radius, N = 10, fork = line.id >= 0;
    const palette = (p) => (fork ? WARN : BANDS[(p.tag.stretch ?? 0) % BANDS.length]);
    const a = V(0, 0, 0), n = V(0, 0, 0);
    let prev = null;
    for (let i = i0; i <= i1; i++) {
      const p = pts[i], f = frameAt(p, _f), lo = -(p.rim[0] + 0.07), hi = p.rim[1] + 0.07;
      const tone = palette(p)[Math.floor(p.s / BAND) % 2], low = p.rim[0] < SLIDE.rim - 0.2 || p.rim[1] < SLIDE.rim - 0.2;
      const ring = { in: [], out: [], lipL: [], lipR: [] };
      for (let j = 0; j <= N; j++) {
        const ang = lerp(lo, hi, j / N);
        // the inside is a shade lighter than the outside; a low side wears red and white
        const edge = j === 0 ? p.rim[0] : j === N ? p.rim[1] : 9, warn = edge < SLIDE.rim - 0.2 && edge > 0.2;
        const cIn = warn ? (Math.floor(p.s / 1.5) % 2 ? RED : WHITE) : [tone[0] * 1.08 + 0.05, tone[1] * 1.08 + 0.05, tone[2] * 1.08 + 0.05];
        ring.in.push(b.vert(onPipe(p, f, ang, R, a), pipeNormal(f, ang, true, n), j / N, p.s, [...cIn, 1]));
        ring.out.push(b.vert(onPipe(p, f, ang, R + WALL, a), pipeNormal(f, ang, false, n), j / N, p.s, [...tone, 1]));
      }
      // the lips: flat tops of the two sides, white
      for (const [key, ang, sign] of [['lipL', lo, -1], ['lipR', hi, 1]]) {
        n.set(f.side[0] * Math.cos(ang) + f.up[0] * Math.sin(ang), f.side[1] * Math.cos(ang) + f.up[1] * Math.sin(ang), f.side[2] * Math.cos(ang) + f.up[2] * Math.sin(ang)).multiplyScalar(sign);
        const tint = low && sign === (p.rim[1] < p.rim[0] ? 1 : -1) ? (Math.floor(p.s / 1.5) % 2 ? RED : WHITE) : WHITE;
        ring[key].push(b.vert(onPipe(p, f, ang, R, a), n, 0, p.s, [...tint, 1]), b.vert(onPipe(p, f, ang, R + WALL, a), n, 1, p.s, [...tint, 1]));
      }
      if (prev) {
        for (let j = 0; j < N; j++) {
          b.idx.push(prev.in[j], prev.in[j + 1], ring.in[j], ring.in[j], prev.in[j + 1], ring.in[j + 1]);
          b.idx.push(prev.out[j], ring.out[j], prev.out[j + 1], prev.out[j + 1], ring.out[j], ring.out[j + 1]);
        }
        b.idx.push(prev.lipL[0], ring.lipL[0], prev.lipL[1], prev.lipL[1], ring.lipL[0], ring.lipL[1]);
        b.idx.push(prev.lipR[0], prev.lipR[1], ring.lipR[0], ring.lipR[0], prev.lipR[1], ring.lipR[1]);
      }
      prev = ring;
    }
  }

  /** The water that runs in every trough, in stretches. */
  _water(lines) {
    const foam = this.world.water?.shared?.uFoam;
    if (!foam) return;
    const R = SLIDE.radius, N = 6, a = V(0, 0, 0), n = V(0, 0, 0), mat = waterMaterial(foam);
    lines.forEach((line, li) => {
      const pts = line.points, CHUNK = 84;
      for (let from = 0; from < pts.length - 1; from += CHUNK) {
        const to = Math.min(pts.length - 1, from + CHUNK), pos = [], nrm = [], uv = [], idx = [];
        for (let i = from; i <= to; i++) {
          const p = pts[i], f = frameAt(p, _f), run = p.tag.runout ? 1.0 : 0.66;
          const lo = -Math.min(run, p.rim[0] + 0.02), hi = Math.min(run, p.rim[1] + 0.02);
          for (let j = 0; j <= N; j++) {
            const ang = lerp(lo, hi, j / N);
            onPipe(p, f, ang, R - 0.035, a); pipeNormal(f, ang, true, n);
            pos.push(a.x, a.y, a.z); nrm.push(n.x, n.y, n.z); uv.push((j / N) * 2 - 1, p.s);
          }
          if (i > from) {
            const r0 = (i - from - 1) * (N + 1), r1 = r0 + N + 1;
            for (let j = 0; j < N; j++) idx.push(r0 + j, r0 + j + 1, r1 + j, r1 + j, r0 + j + 1, r1 + j + 1);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx);
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = `slide-water${li}-${from}`;
        mesh.renderOrder = 12; // after the water of the world
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
      }
    });
  }

  /** What holds it all up: a mast in the middle of each helix, with an arm to every turn; legs under the rest. */
  _supports(mats, cast) {
    const course = this.course, data = this.data, P = course.main.points, R = SLIDE.radius;
    const ground = (x, z) => Math.min(data.heightAt(x, z), Math.max(-6, data.heightAt(x, z)));
    const parts = new Parts(), b = parts.get('paint');
    const under = (p) => { const f = frameAt(p, _f); return V(p.x - f.up[0] * (WALL + 0.05), p.y - f.up[1] * (WALL + 0.05), p.z - f.up[2] * (WALL + 0.05)); };
    const inHelix = (s) => course.helices.some((h) => s >= h.from - 2 && s <= h.to + 2);
    // nothing that holds the slide up may go through another part of it: how near a segment passes any trough
    // (other than round the metre `own` of the main line, which it holds)
    const every = [course.main, ...course.forks].flatMap((line) => line.points.filter((_, n) => n % 2 === 0).map((p) => ({ x: p.x, y: p.y + R * 0.5, z: p.z, s: line.id < 0 ? p.s : -1e6 })));
    const _ab = V(0, 0, 0), _ap = V(0, 0, 0);
    const clearOf = (a, c, own, room = R + 0.9) => {
      _ab.subVectors(c, a);
      const l2 = _ab.lengthSq() || 1;
      for (const q of every) {
        if (Math.abs(q.s - own) < 9) continue;
        _ap.set(q.x - a.x, q.y - a.y, q.z - a.z);
        const t = clamp(_ap.dot(_ab) / l2, 0, 1), dx = a.x + _ab.x * t - q.x, dy = a.y + _ab.y * t - q.y, dz = a.z + _ab.z * t - q.z;
        if (dx * dx + dy * dy + dz * dz < room * room) return false;
      }
      return true;
    };
    for (const h of course.helices) {
      const base = ground(h.x, h.z) - 1, top = h.top + 5.5;
      // the mast, in bands, a ball on top
      for (let y = base, k = 0; y < top; y += 9, k++) {
        const y1 = Math.min(top, y + 9), t0 = (y - base) / (top - base), t1 = (y1 - base) / (top - base);
        b.tint(...(k % 2 ? CREAM : BANDS[course.stretches.findIndex((s) => s.name === h.name) % BANDS.length][0]), 1).cylinder(h.x, y, h.z, lerp(1.25, 0.6, t0), lerp(1.25, 0.6, t1), y1 - y, 12, { capTop: false });
      }
      b.tint(...GOLD, 1).place(h.x, top + 0.5, h.z).lathe([[0.0, -0.75], [0.52, -0.5], [0.75, 0], [0.52, 0.5], [0.0, 0.75]], 10).pop();
      // an arm from the mast to the trough, every sixth of a turn (not where a shortcut is in its way)
      const stepLen = (2 * Math.PI * h.r) / 6;
      for (let s = h.from + stepLen * 0.5; s < h.to; s += stepLen) {
        const p = P[Math.round(s)], u = under(p), dx = u.x - h.x, dz = u.z - h.z, d = Math.hypot(dx, dz) || 1;
        const a0 = V(h.x + (dx / d) * 0.5, u.y - 0.9 - d * 0.07, h.z + (dz / d) * 0.5), a1 = V(u.x - (dx / d) * 0.2, u.y - 0.12, u.z - (dz / d) * 0.2);
        if (clearOf(a0, a1, p.s, R + 0.5)) b.tint(...STEEL, 1).rod(a0, a1, 0.17, 6, { caps: false });
      }
    }
    // legs: one every so often under what no mast holds, where the ground is not too far below — and never
    // through a turn of the slide that passes underneath (the leg is then tried a little further on)
    const legs = new Parts(), lb = legs.get('paint');
    let since = 99;
    for (let i = 4; i < P.length - 2; i++) {
      const p = P[i];
      since += 1;
      if (inHelix(p.s) || since < 15) continue;
      const u = under(p), g = ground(p.x, p.z);
      if (u.y - g < 0.9) continue;
      if (!clearOf(V(p.x, g - 0.6, p.z), V(u.x, u.y - 0.25, u.z), p.s, R + 1.7)) continue;
      since = 0;
      const tall = u.y - g, r = clamp(0.2 + tall * 0.006, 0.22, 0.6);
      lb.tint(...CREAM, 1).rod(V(p.x, g - 0.6, p.z), V(u.x, u.y - 0.25, u.z), r, 8, { caps: false, r1: r * 0.7 });
      // a yoke under the trough, and a red band every twenty metres of a tall leg
      const f = frameAt(p, _f);
      lb.tint(...STEEL, 1).rod(V(u.x - f.side[0] * (R * 0.8), u.y - 0.2 - f.side[1] * (R * 0.8), u.z - f.side[2] * (R * 0.8)), V(u.x + f.side[0] * (R * 0.8), u.y - 0.2 + f.side[1] * (R * 0.8), u.z + f.side[2] * (R * 0.8)), 0.13, 6);
      for (let y = g + 20; y < u.y - 4; y += 20) lb.tint(...RED, 1).cylinder(p.x + (u.x - p.x) * ((y - g) / tall), y, p.z + (u.z - p.z) * ((y - g) / tall), r * 1.25, r * 1.25, 1.2, 8);
    }
    this.group.add(parts.toMeshes(mats, { name: 'slide-masts', layers: cast }), legs.toMeshes(mats, { name: 'slide-legs', layers: cast }));
  }

  /** The deck at the top, the arches along the way, the end of the run-out, the gate on the beach and its board. */
  _ends(mats, cast) {
    const course = this.course, P = course.main.points, R = SLIDE.radius, data = this.data;
    const parts = new Parts(), wood = parts.get('woodDeck'), paint = parts.get('paint');
    // ---- the deck: planks on the rim of the cliff, a rail, two posts and the name
    const T = SLIDE.top, fx = Math.sin(T.yaw), fz = Math.cos(T.yaw), rx = -fz, rz = fx;
    wood.place(T.x - fx * 3.2, T.y - 0.12, T.z - fz * 3.2, T.yaw);
    wood.tint(1, 1, 1, 1).box(-5.2, -0.35, -4.6, 5.2, 0, 4.4);
    wood.pop();
    paint.place(T.x - fx * 3.2, T.y - 0.12, T.z - fz * 3.2, T.yaw);
    for (const sx of [-5.1, 5.1]) for (let z = -4.4; z <= 4.4; z += 2.2) paint.tint(...CREAM, 1).box(sx - 0.07, 0, z - 0.07, sx + 0.07, 1.05, z + 0.07);
    for (const sx of [-5.1, 5.1]) paint.tint(...RED, 1).box(sx - 0.05, 0.98, -4.45, sx + 0.05, 1.08, 4.45);
    paint.tint(...RED, 1).box(-5.1, 0.98, -4.5, 5.1, 1.08, -4.4);
    for (const sx of [-2.6, 2.6]) paint.tint(...CREAM, 1).cylinder(sx, 0, 3.3, 0.16, 0.13, 4.6, 8);
    paint.pop();
    // (legs under the deck, down to the rock)
    for (const [ox, oz] of [[-4.6, -4], [4.6, -4], [-4.6, 3.8], [4.6, 3.8]]) {
      const x = T.x - fx * 3.2 + rx * ox + fx * oz, z = T.z - fz * 3.2 + rz * ox + fz * oz, g = data.heightAt(x, z);
      if (T.y - 0.4 - g > 0.2) wood.tint(0.8, 0.8, 0.8, 1).rod(V(x, g - 0.4, z), V(x, T.y - 0.4, z), 0.16, 6, { caps: false });
    }
    const sign = (text, sub, w, h, tone = '#7a1420') => canvasBoard(1024, Math.round((1024 * h) / w), (ctx, cw, ch) => {
      ctx.fillStyle = tone; ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = ch * 0.05; ctx.strokeRect(ch * 0.05, ch * 0.05, cw - ch * 0.1, ch - ch * 0.1);
      ctx.fillStyle = '#f6e7b8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(ch * (sub ? 0.46 : 0.6))}px Georgia, 'Times New Roman', serif`;
      ctx.fillText(text, cw / 2, ch * (sub ? 0.4 : 0.53), cw * 0.9);
      if (sub) { ctx.font = `600 ${Math.round(ch * 0.2)}px system-ui, sans-serif`; ctx.fillStyle = '#f2c14e'; ctx.fillText(sub, cw / 2, ch * 0.78, cw * 0.9); }
    }, w, h, { both: true });
    const hang = (board, x, y, z, yaw) => { board.mesh.position.set(x, y, z); board.mesh.rotation.y = yaw; board.mesh.name = 'slide-sign'; this.group.add(board.mesh); return board; };
    hang(sign(SLIDE.name.toUpperCase(), `${Math.round(course.finish / 10) * 10} METRES OF WATER · ${Math.round(T.y - course.basin.y)} M DOWN`, 5.0, 1.25), T.x + fx * 0.1, T.y + 4.1, T.z + fz * 0.1, T.yaw);

    // ---- the arches: one at every place one is put back, numbered; a chequered one where the clock stops
    const arches = new Parts(), ab = arches.get('paint');
    const arch = (s, tones, big) => {
      const p = lineAt(course.main, s), f = frameAt(p, { side: [0, 0, 0], up: [0, 0, 0] }), r = R + (big ? 0.95 : 0.62), n = 14, pts = [];
      for (let k = 0; k <= n; k++) {
        const ang = lerp(-1.95, 1.95, k / n), sn = Math.sin(ang) * r, cs = R - Math.cos(ang) * r;
        pts.push(V(p.x + f.side[0] * sn + f.up[0] * cs, p.y + f.side[1] * sn + f.up[1] * cs, p.z + f.side[2] * sn + f.up[2] * cs));
      }
      for (let k = 0; k < n; k++) ab.tint(...tones[k % tones.length], 1).rod(pts[k], pts[k + 1], big ? 0.2 : 0.13, 6, { caps: false });
    };
    course.marks.forEach((m, k) => { if (k) arch(m.s, [GOLD, GOLD, RED], false); });
    arch(course.finish, [NAVY, WHITE], true);
    arch(1.2, [RED, CREAM], true);
    {
      const p = lineAt(course.main, course.finish), f = frameAt(p, { side: [0, 0, 0], up: [0, 0, 0] });
      hang(sign('FINISH', '', 3.4, 0.8, '#1b1340'), p.x + f.up[0] * (R + 2.2), p.y + f.up[1] * (R + 2.2), p.z + f.up[2] * (R + 2.2), p.yaw);
    }

    // ---- where a shortcut leaves: its name and which side, a little before
    for (const fk of course.forks) {
      const p = lineAt(course.main, fk.from - 20), f = frameAt(p, { side: [0, 0, 0], up: [0, 0, 0] }), k = fk.side * (R + 1.5);
      const x = p.x + f.side[0] * k + f.up[0] * 2.3, y = p.y + f.side[1] * k + f.up[1] * 2.3, z = p.z + f.side[2] * k + f.up[2] * 2.3;
      hang(sign(fk.side < 0 ? `◀ ${fk.name.toUpperCase()}` : `${fk.name.toUpperCase()} ▶`, 'SHORTER · STEEPER · KEEP TO THIS SIDE', 4.4, 1.25, '#12122e'), x, y, z, p.yaw);
      ab.tint(...STEEL, 1).rod(V(p.x + f.side[0] * fk.side * (R + 0.1), p.y + f.side[1] * fk.side * (R + 0.1) + 0.9, p.z + f.side[2] * fk.side * (R + 0.1)), V(x, y - 0.5, z), 0.09, 6);
    }

    // ---- the end of the run-out: a rounded wall, and steps down to the sand
    const E = P[P.length - 1], ef = frameAt(E, { side: [0, 0, 0], up: [0, 0, 0] });
    for (let k = 0; k <= 8; k++) {
      const ang = lerp(-1.2, 1.2, k / 8), a = onPipe(E, ef, ang, R), top = a.clone().add(V(Math.sin(E.yaw) * 0.0, 0, 0));
      paint.tint(...(k % 2 ? RED : CREAM), 1).rod(V(a.x + Math.sin(E.yaw) * 0.25, a.y - 0.1, a.z + Math.cos(E.yaw) * 0.25), V(top.x + Math.sin(E.yaw) * 0.25, E.y + 1.25, top.z + Math.cos(E.yaw) * 0.25), 0.2, 6);
    }
    // ---- the gate on the beach: two striped posts, the name over them, a round mat, the board of the times
    const G = SLIDE.gate, gy = data.heightAt(G.x, G.z), gfx = Math.sin(G.yaw), gfz = Math.cos(G.yaw);
    this.gate = { x: G.x, y: gy, z: G.z, yaw: G.yaw };
    paint.place(G.x, gy, G.z, G.yaw);
    for (const sx of [-2.1, 2.1]) for (let y = 0, k = 0; y < 4.2; y += 0.7, k++) paint.tint(...(k % 2 ? CREAM : RED), 1).cylinder(sx, y, 0, 0.2, 0.2, 0.7, 10, { capTop: y + 0.7 >= 4.2 });
    for (const sx of [-2.1, 2.1]) paint.tint(...GOLD, 1).place(sx, 4.45, 0).lathe([[0.0, -0.3], [0.22, -0.2], [0.3, 0], [0.22, 0.2], [0.0, 0.3]], 8).pop();
    paint.tint(...TEAL, 1).cylinder(0, 0.02, 0, 2.0, 2.0, 0.05, 28);
    paint.tint(...CREAM, 1).cylinder(0, 0.03, 0, 1.55, 1.55, 0.05, 28);
    paint.pop();
    hang(sign(SLIDE.name.toUpperCase(), 'THE WATER SLIDE · STAND HERE TO BE TAKEN TO THE TOP', 4.3, 1.15), G.x, gy + 4.05, G.z, G.yaw);
    // the board of the times stands to the right of the gate, turned a little towards who arrives
    this.boardSpot = { x: G.x - gfz * 4.4 + gfx * 0.4, z: G.z + gfx * 4.4 + gfz * 0.4, yaw: G.yaw + 0.5 };
    if (this.ownBoard) {
      // (a plain one: this visitor's best, and the times of the bots to beat — the lab has no board of scores)
      const B = this.boardSpot;
      this.board = canvasBoard(768, 512, (ctx, w, h) => this._drawBoard(ctx, w, h), 3.0, 2.0, { both: true });
      this.board.mesh.position.set(B.x, gy + 1.75, B.z);
      this.board.mesh.rotation.y = B.yaw;
      this.board.mesh.name = 'slide-board';
      this.group.add(this.board.mesh);
      for (const sx of [-1.3, 1.3]) { const c = Math.cos(B.yaw), sn = Math.sin(B.yaw), px = B.x + c * sx, pz = B.z - sn * sx, g0 = data.heightAt(px, pz); paint.tint(...CREAM, 1).cylinder(px, g0 - 0.2, pz, 0.08, 0.08, 1.2 + (gy - g0) + 0.2, 6); }
    }

    this.group.add(parts.toMeshes(mats, { name: 'slide-ends', layers: cast }), arches.toMeshes(mats, { name: 'slide-arches', layers: cast }));
  }

  _drawBoard(ctx, w, h) {
    ctx.fillStyle = '#1b1340'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 10; ctx.strokeRect(9, 9, w - 18, h - 18);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f6e7b8'; ctx.font = "700 70px Georgia, 'Times New Roman', serif"; ctx.fillText(SLIDE.name.toUpperCase(), w / 2, 78);
    ctx.fillStyle = '#f2c14e'; ctx.font = '600 28px system-ui, sans-serif'; ctx.fillText('FROM THE TOP TO THE SAND, AGAINST THE CLOCK', w / 2, 136);
    const rows = [['Your best', this.best ? formatTime(this.best) : '—', '#ffffff'], ...(this.par || []).map(([name, ms]) => [name, formatTime(ms), '#bfe8ee'])];
    rows.forEach(([name, value, tone], i) => {
      const y = 215 + i * 78;
      ctx.textAlign = 'left'; ctx.fillStyle = tone; ctx.font = `${i ? 500 : 700} 44px system-ui, sans-serif`; ctx.fillText(name, 70, y);
      ctx.textAlign = 'right'; ctx.font = `700 50px ui-monospace, Menlo, monospace`; ctx.fillText(value, w - 70, y);
    });
  }

  /** The best time of this visitor (ms), and the times to beat ([[name, ms]]): what the board by the gate shows. */
  setTimes(best, par) { this.best = best || null; if (par) this.par = par; this.board?.redraw(); }

  /** What lies in the troughs: buoys (striped balls afloat) and strips of light. */
  _things(mats) {
    const course = this.course, R = SLIDE.radius, parts = new Parts(), paint = parts.get('paint'), glow = parts.get('glow');
    const lineOf = (id) => (id < 0 ? course.main : course.forks[id]);
    const p = {}, f = { side: [0, 0, 0], up: [0, 0, 0] }, a = V(0, 0, 0), b = V(0, 0, 0), n = V(0, 0, 0);
    this.buoys = [];
    for (const t of course.things) {
      const line = lineOf(t.line);
      if (t.kind === 'buoy') {
        lineAt(line, t.s, p); frameAt(p, f);
        const c = onPipe(p, f, t.a, R - t.r * 0.72), up = pipeNormal(f, t.a, true);
        const m = new THREE.Matrix4().makeBasis(V(p.tx, p.ty, p.tz).cross(up).normalize(), up.clone(), V(p.tx, p.ty, p.tz)).setPosition(c);
        paint.push(m);
        // a ball in four bands, a ring round its middle
        const prof = [[0.0, -1], [0.5, -0.87], [0.87, -0.5], [1, 0], [0.87, 0.5], [0.5, 0.87], [0.0, 1]].map(([r, y]) => [r * t.r, y * t.r]);
        for (let k = 0; k < 6; k++) paint.tint(...(k % 2 ? WHITE : RED), 1).lathe([prof[k], prof[k + 1]], 10);
        paint.tint(...NAVY, 1).lathe([[t.r * 1.02, -0.07], [t.r * 1.12, 0], [t.r * 1.02, 0.07]], 10);
        paint.pop();
        this.buoys.push({ index: course.things.indexOf(t), x: c.x, y: c.y, z: c.z });
      } else {
        // chevrons of light lying on the trough, pointing the way one goes
        for (let k = 0; k < 4; k++) {
          const s0 = t.s + k * (t.length / 4), tip = lineAt(line, s0 + 0.95, {}), base = lineAt(line, s0, {});
          const ft = frameAt(tip, { side: [0, 0, 0], up: [0, 0, 0] }), fb = frameAt(base, { side: [0, 0, 0], up: [0, 0, 0] });
          for (const sgn of [-1, 1]) {
            const q0 = onPipe(base, fb, t.a + sgn * t.half, R - 0.05), q1 = onPipe(base, fb, t.a + sgn * t.half * 0.45, R - 0.05), q2 = onPipe(tip, ft, t.a, R - 0.05);
            const q3 = onPipe(lineAt(line, s0 + 0.55, {}), ft, t.a + sgn * t.half, R - 0.05);
            pipeNormal(fb, t.a, true, n);
            glow.tint(1.0, 0.95, 0.35, 1).quad(sgn > 0 ? q1 : q0, sgn > 0 ? q0 : q1, sgn > 0 ? q3 : q2, sgn > 0 ? q2 : q3, { normal: n.clone() });
          }
        }
      }
    }
    void a; void b;
    const g = parts.toMeshes(mats, { name: 'slide-things', layers: [] });
    this.group.add(g);
  }

  /** Is the player standing at the gate, where one asks to ride? */
  near(x, z) { return (x - this.gate.x) ** 2 + (z - this.gate.z) ** 2 < 2.3 * 2.3; }

  /** Where one stands again after a ride: on the sand by the end of the run-out. [x, z, yaw] */
  get exit() { const e = this.course.basin; return [e.x - Math.sin(e.yaw) * 0.5 - Math.cos(e.yaw) * -3.2, e.z - Math.cos(e.yaw) * 0.5 + Math.sin(e.yaw) * -3.2, e.yaw]; }

  /**
   * A ride starts: the player is put in the trough at the top; three, two, one… `io`: { play(sound, options),
   * note(text), go() (the clock starts), splash(x, y, z, n) (optional: something bright where water flies) }.
   * Returns the session — it is also the driver of the player (see PlayerController.driver):
   * { step(dt, player, control), camera(camera, dt), line, over, time (ms), speed, riding: false, anim, close(), exit }.
   */
  open(player, io) {
    const course = this.course, st = startRide(course), events = [], pose = {};
    const S = { count: 3.4, cam: null, look: null, fov: 60, shake: 0, stretch: -1, said: 0, tilt: 0, after: 0, lean: 0 };
    // a ring to sit in
    const ring = this._ring || (this._ring = this._makeRing());
    ring.visible = true;
    const _m = new THREE.Matrix4(), _x = V(0, 0, 0), _y = V(0, 0, 0), _z = V(0, 0, 0), _c = V(0, 0, 0), _t = V(0, 0, 0);
    const input = { steer: 0, tuck: false, brake: false };
    const session = {
      slide: this, over: false, time: 0, line: '', speed: 0, riding: false, anim: ANIM.sit, state: st, falls: 0,
      exit: this.exit,
      auto: null, // 'careful' | 'bold': the ride steers by itself (see botInput)
      /** For the tests: the rider is put at metre `s` of the line, going at `v`. Such a ride has no time. */
      jump: (s, v = 15) => { Object.assign(st, { line: -1, s, v, a: 0, w: 0, h: 0, vh: 0, out: 0, jumped: true }); st.mark = Math.max(0, course.marks.findLastIndex((m) => m.s <= s)); S.count = 0; S.cam = null; },
      step: (dt, pl, control) => {
        const inp = pl.input;
        if (session.auto) botInput(st, session.auto, input);
        else {
          input.steer = control ? clamp(inp.move.x, -1, 1) : 0;
          input.tuck = control && (inp.move.y > 0.35 || !!inp.run);
          input.brake = control && inp.move.y < -0.35;
        }
        if (S.count > 0) {
          const was = S.count;
          S.count -= dt;
          if (Math.ceil(S.count) !== Math.ceil(was) && S.count > 0 && S.count <= 3) io.play('tick');
          if (S.count <= 0) { io.play('start'); io.go?.(); st.v = 2.5; }
        } else stepRide(st, dt, input, events);
        for (const e of events) this._tell(e, st, io, S);
        events.length = 0;
        ridePose(st, pose);
        // ---- what the player is, as far as the world is concerned
        const out = st.out > 0;
        _c.set(pose.x + pose.ux * SEAT, pose.y + pose.uy * SEAT, pose.z + pose.uz * SEAT);
        if (out) { S.tilt += dt * 7; }
        pl.pos.copy(_c);
        pl.yaw = pose.yaw + (out ? S.tilt : 0);
        S.lean += ((input.tuck ? -0.42 : input.brake ? 0.18 : -0.16) - S.lean) * Math.min(1, dt * 6);
        pl.pitch = -pose.pitch + S.lean; // nose down the slope; lying back when tucked
        pl.roll = -pose.roll;
        pl.speed = st.v; pl.grounded = true;
        // the ring under the rider, flat on the water of the trough
        _z.set(pose.fx, pose.fy, pose.fz); _y.set(pose.ux, pose.uy, pose.uz); _x.crossVectors(_y, _z).normalize(); _z.crossVectors(_x, _y);
        ring.matrix.copy(_m.makeBasis(_x, _y, _z).setPosition(pose.x + pose.ux * 0.2, pose.y + pose.uy * 0.2, pose.z + pose.uz * 0.2));
        ring.matrixWorldNeedsUpdate = true;
        // ---- the clock of the screen
        session.speed = st.v;
        const here = rideProgress(st), idx = course.stretches.findIndex((s) => here >= s.from && here <= s.to + 1);
        if (idx !== S.stretch && idx >= 0 && S.count <= 0) { S.stretch = idx; if (idx > 0 && idx < course.stretches.length - 1) io.note(st.line >= 0 ? course.forks[st.line].name : course.stretches[idx].name); }
        if (st.over && !session.over) { session.over = true; session.time = st.jumped ? 0 : st.time; session.falls = st.falls; }
        session.line = S.count > 0 ? `${SLIDE.name} · ${Math.ceil(S.count) > 3 ? 'ready' : Math.ceil(S.count)}…`
          : session.over ? `${SLIDE.name} · ${formatTime(session.time)}`
            : `${formatTime(Math.round(st.clock * 1000))} · ${Math.round(st.v * 3.6)} km/h · ${Math.max(0, Math.round(course.finish - here))} m to go`;
      },
      /** The camera of the ride: behind and above, looking down the trough; wider as it goes faster. */
      camera: (cam, dt) => {
        const back = 5.4 + st.v * 0.07, up = 2.35 + st.v * 0.015;
        _t.set(pose.x - pose.fx * back + pose.ux * up * 0.55, pose.y - pose.fy * back + up + pose.uy * 0.4, pose.z - pose.fz * back + pose.uz * up * 0.55);
        if (!S.cam) { S.cam = _t.clone(); S.look = V(pose.x, pose.y, pose.z); }
        S.cam.lerp(_t, Math.min(1, dt * (st.out > 0 ? 1.2 : 7.5)));
        _t.set(pose.x + pose.fx * 5.5, pose.y + pose.fy * 5.5 + 0.9, pose.z + pose.fz * 5.5);
        S.look.lerp(_t, Math.min(1, dt * 9));
        cam.position.copy(S.cam);
        if (S.shake > 0) { S.shake = Math.max(0, S.shake - dt * 2.2); cam.position.x += (Math.random() - 0.5) * S.shake * 0.5; cam.position.y += (Math.random() - 0.5) * S.shake * 0.5; }
        cam.up.set(0, 1, 0);
        cam.lookAt(S.look);
        // (the horizon leans a little with the trough: the bends are felt)
        cam.rotateZ(clamp(-pose.roll * 0.22, -0.3, 0.3));
        S.fov += (62 + 24 * clamp(st.v / 26, 0, 1.25) + (st.boost > 0 ? 6 : 0) - S.fov) * Math.min(1, dt * 4);
        return S.fov;
      },
      close: () => { if (this.session === session) this.session = null; player.pitch = 0; player.roll = 0; ring.visible = false; },
    };
    this.session = session;
    session.step(0, player, false);
    return session;
  }

  /** What happened in a step of the ride, told to the player. */
  _tell(e, st, io, S) {
    if (e.type === 'buoy') { io.play('fail', { volume: 0.5 }); S.shake = 0.9; io.splash?.(st); }
    else if (e.type === 'boost') io.play('boost', { volume: 0.8 });
    else if (e.type === 'out') { io.play('fail'); io.note('Out! Back to the last arch…'); S.tilt = 0; }
    else if (e.type === 'back') io.play('respawn');
    else if (e.type === 'mark') io.play('tick', { volume: 0.5 });
    else if (e.type === 'fork') { io.play('boost', { volume: 0.5 }); io.note(`${this.course.forks[e.fork].name}: the short way down`); }
    else if (e.type === 'land' && e.hard > 3) S.shake = Math.max(S.shake, 0.4);
    else if (e.type === 'finish') io.play('victory');
  }

  _makeRing() {
    const geo = new THREE.TorusGeometry(0.52, 0.2, 8, 18);
    geo.rotateX(Math.PI / 2);
    const col = new Float32Array(geo.attributes.position.count * 4);
    for (let i = 0; i < geo.attributes.position.count; i++) {
      const ang = Math.atan2(geo.attributes.position.getZ(i), geo.attributes.position.getX(i)), tone = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 2 ? WHITE : RED;
      col.set([tone[0], tone[1], tone[2], 1], i * 4);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const mesh = new THREE.Mesh(geo, this.world.materials.paint);
    mesh.name = 'slide-ring';
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.world.scene.add(mesh);
    return mesh;
  }

  /** Every frame: what is too far to be seen is not drawn. */
  update(dt, time, camera) { if (camera && this._cull) this._cull(camera.position); }
}

export { lowSide, RIDE };
