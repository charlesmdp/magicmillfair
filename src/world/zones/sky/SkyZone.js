// The sky villages: thirty hamlets perched on the mountains around the valley, one per company (see
// layout/sponsors.js) — and the Sky Gate in the valley, from which one is carried up to them. Nobody walks
// there. Each village: three houses, a sign, a flag, a bench that looks down on the valley, lanterns, and a
// ring to go back through.
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';
import { staticCaster, LAYER } from '../../../render/Shadows.js';
import { mergeStatic, distanceCuller } from '../../props/StaticBatch.js';
import { makeMaterial, GLSL_COMMON, GLSL_LIGHTING } from '../../../render/globals.js';
import { Polygon } from '../../Areas.js';
import { seatAt } from '../../../player/PlayerController.js';
import { SKY } from '../../layout/layout.js';
import { SPONSORS, sponsorId } from '../../layout/sponsors.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const STONE = [1.05, 1.02, 0.96], WALL = [1.75, 1.66, 1.46], DARK = [0.2, 0.2, 0.24], WOOD = [0.62, 0.44, 0.28];
const RING = 1.4; // radius of the rings one goes through

// The light inside a ring: a slow whirl. `uv` runs from -1 to 1 across it.
const PORTAL_VERT = /* glsl */ `
out vec2 vUv;
out vec3 vWorld;
void main() { vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }
`;
const PORTAL_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
in vec2 vUv;
in vec3 vWorld;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float a = atan(vUv.y, vUv.x);
  float arms = sin(a * 3.0 + r * 7.0 - uTime * 1.6) * 0.5 + 0.5;
  float veil = sin(a * 5.0 - r * 11.0 + uTime * 0.9) * 0.5 + 0.5;
  vec3 col = mix(vec3(0.12, 0.42, 0.95), vec3(0.75, 0.95, 1.0), arms * 0.7 + veil * 0.3);
  col += vec3(1.0, 0.9, 0.6) * smoothstep(0.35, 0.0, r) * 0.9; // a bright heart
  col *= 1.25 * (0.75 + 0.25 * sin(uTime * 2.3 + r * 4.0));
  float alpha = smoothstep(1.0, 0.82, r) * (0.55 + 0.45 * arms);
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col) * alpha, alpha);
}
`;

export class SkyZone {
  constructor(world) {
    this.world = world;
    this.data = world.data;
    this.group = new THREE.Group();
    this.group.name = 'zone:sky';
    this.cast = staticCaster(world.engine.tier);
    this.colliders = [];
    this.platforms = [];
    this.areas = [];
    this.seats = world.seats;
    /** The villages: { index, id, name, motto, url, x, y, z, yaw, arrive: [x, z, which way one faces], ring: [x, z], sign: [x, z] } */
    this.villages = [];
    this._roots = {};
    this._portals = []; // quads to merge: [centre, right, up]
    this._signs = [];
  }

  build() {
    const sites = this.data.meta.sky || [];
    sites.forEach((site, i) => this._village(site, i, SPONSORS[i] || { name: `Sky Village ${i + 1}`, motto: '', color: [0.5, 0.5, 0.5] }));
    this._gate();
    this.group.updateMatrixWorld(true);
    for (const [key, roots] of Object.entries(this._roots)) this.group.add(mergeStatic(roots, key));
    this._buildPortals();
    this._buildSigns();
    this.group.updateMatrixWorld(true);
    this.group.traverse((o) => { if (o.isMesh) o.layers.disable(LAYER.REFLECT); });
    const k = this.world.engine.tier.phone ? 0.6 : 1;
    this._cull = distanceCuller(this.group, [[/^sky\d:matte$/, 1300], [/^sky\d:/, 420 * k], [/^skygate:/, 600 * k], [/^sky-(portals|signs)$/, Infinity]]);
    return this;
  }

  _add(key, parts) {
    const g = parts.toMeshes(this.world.materials, { name: key, layers: this.cast });
    g.updateMatrixWorld(true);
    (this._roots[key] ||= []).push(g);
    this.group.add(g);
  }

  /** A stone ring standing on a slab, to walk through: centre (x, y, z) at ground level, facing `yaw`. */
  _ring(parts, x, y, z, yaw, tone = STONE) {
    const b = parts.get('matte'), sx = Math.cos(yaw), sz = -Math.sin(yaw); // across the ring
    b.tint(tone[0], tone[1], tone[2], 1).cylinder(x, y - 0.5, z, RING + 0.9, RING + 1.0, 0.62, 14);
    const cy = y + 0.12 + RING + 0.25;
    let prev = null;
    for (let k = 0; k <= 18; k++) {
      const a = -0.5 + (k / 18) * (Math.PI + 1.0), p = V(x + sx * Math.cos(a) * (RING + 0.2), cy + Math.sin(a) * (RING + 0.2), z + sz * Math.cos(a) * (RING + 0.2));
      if (prev) b.tint(tone[0] * (0.86 + 0.14 * (k % 2)), tone[1] * (0.86 + 0.14 * (k % 2)), tone[2] * (0.86 + 0.14 * (k % 2)), 1).rod(prev, p, 0.2, 6, { caps: k === 1 || k === 18 });
      prev = p;
    }
    this._portals.push([V(x, cy, z), V(sx, 0, sz), V(0, 1, 0)]);
    for (const s of [-1, 1]) this.colliders.push({ type: 'circle', x: x + sx * s * (RING + 0.25), z: z + sz * s * (RING + 0.25), r: 0.3 });
    this.platforms.push({ type: 'disc', x, z, r: RING + 0.9, y: y + 0.12, clearance: 1.0 });
  }

  _village(site, i, who) {
    const { x, z, y, yaw } = site, parts = new Parts();
    const m = parts.get('matte'), glow = parts.get('glow'), cloth = parts.get('doubleSided');
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const W = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c]; // local (right, towards the valley) → world
    const col = who.color || [0.5, 0.5, 0.5];
    for (const b of [m, glow, cloth]) b.place(x, y, z, yaw);
    // houses: a stone foot, plastered walls, a roof in the colours of the village
    const house = (lx, lz, w, l, h, turn) => {
      for (const b of [m]) b.place(lx, 0, lz, turn);
      m.tint(STONE[0] * 0.9, STONE[1] * 0.9, STONE[2] * 0.9, 1).box(-w / 2 - 0.15, -1.6, -l / 2 - 0.15, w / 2 + 0.15, 0.3, l / 2 + 0.15, { faces: 'xXzZY' });
      m.tint(WALL[0], WALL[1], WALL[2], 1).box(-w / 2, 0.3, -l / 2, w / 2, h, l / 2, { faces: 'xXzZ' });
      const rise = w * 0.42, e = 0.45;
      m.tint(col[0] * 1.5, col[1] * 1.5, col[2] * 1.5, 1);
      m.quad(V(-w / 2 - e, h - 0.12, l / 2 + e), V(0, h + rise, l / 2 + e), V(0, h + rise, -l / 2 - e), V(-w / 2 - e, h - 0.12, -l / 2 - e));
      m.quad(V(0, h + rise, l / 2 + e), V(w / 2 + e, h - 0.12, l / 2 + e), V(w / 2 + e, h - 0.12, -l / 2 - e), V(0, h + rise, -l / 2 - e));
      m.tint(col[0] * 1.1, col[1] * 1.1, col[2] * 1.1, 1);
      m.quad(V(-w / 2 - e, h - 0.2, -l / 2 - e), V(0, h + rise - 0.08, -l / 2 - e), V(0, h + rise - 0.08, l / 2 + e), V(-w / 2 - e, h - 0.2, l / 2 + e));
      m.quad(V(0, h + rise - 0.08, -l / 2 - e), V(w / 2 + e, h - 0.2, -l / 2 - e), V(w / 2 + e, h - 0.2, l / 2 + e), V(0, h + rise - 0.08, l / 2 + e));
      m.tint(WALL[0], WALL[1], WALL[2], 1);
      for (const g of [-1, 1]) { const A = V(-w / 2, h, g * l / 2), B = V(w / 2, h, g * l / 2), C = V(0, h + rise - 0.06, g * l / 2); if (g > 0) m.tri(A, B, C); else m.tri(B, A, C); }
      // the door and two windows on the front (+Z), a chimney
      m.tint(WOOD[0], WOOD[1], WOOD[2], 1).box(-0.5, 0.3, l / 2, 0.5, 2.25, l / 2 + 0.05);
      m.tint(DARK[0], DARK[1], DARK[2] * 1.4, 1);
      for (const g of [-1, 1]) m.box(g * (w / 2 - 0.95) - 0.38, 1.25, l / 2, g * (w / 2 - 0.95) + 0.38, 2.1, l / 2 + 0.04);
      m.tint(STONE[0] * 0.8, STONE[1] * 0.8, STONE[2] * 0.8, 1).box(w / 4 - 0.25, h + rise * 0.3, -0.3, w / 4 + 0.25, h + rise + 0.6, 0.3);
      m.pop();
      const [hx, hz] = W(lx, lz);
      this.colliders.push({ type: 'box', x: hx, z: hz, hw: w / 2 + 0.2, hl: l / 2 + 0.2, yaw: yaw + turn });
    };
    house(-6.6, -3.6, 4.2, 5.0, 2.7, 0.9);
    house(6.6, -3.6, 4.2, 5.0, 2.7, -0.9);
    house(0, -8.4, 6.4, 4.4, 3.2, 0);
    // the flag
    m.tint(1.3, 1.25, 1.15, 1).rod(V(5.6, -0.3, 6.6), V(5.6, 7.2, 6.6), 0.06, 6);
    cloth.tint(col[0] * 1.3, col[1] * 1.3, col[2] * 1.3, 1);
    for (let k = 0; k < 5; k++) {
      const a0 = k * 0.44, a1 = (k + 1) * 0.44, w0 = Math.sin(k * 1.2) * 0.14, w1 = Math.sin((k + 1) * 1.2) * 0.14;
      cloth.quad(V(5.66 + a0, 5.7, 6.6 + w0), V(5.66 + a1, 5.7, 6.6 + w1), V(5.66 + a1, 7.1, 6.6 + w1), V(5.66 + a0, 7.1, 6.6 + w0));
    }
    // the sign: two posts, a board (its face is drawn later, from the names of the villages)
    const SW = 3.0, SH = 1.5, sy = 1.1, sa = 0.75; // facing the middle of the village
    m.place(-5.6, 0, 5.6, sa);
    m.tint(WOOD[0], WOOD[1], WOOD[2], 1).box(-SW / 2 - 0.09, -0.3, -0.06, -SW / 2 + 0.03, sy + SH + 0.25, 0.06).box(SW / 2 - 0.03, -0.3, -0.06, SW / 2 + 0.09, sy + SH + 0.25, 0.06);
    m.tint(WOOD[0] * 0.7, WOOD[1] * 0.7, WOOD[2] * 0.7, 1).box(-SW / 2, sy - 0.06, -0.03, SW / 2, sy + SH + 0.06, 0.015);
    m.pop();
    {
      const ca = Math.cos(yaw + sa), sn = Math.sin(yaw + sa), [bx, bz] = W(-5.6, 5.6);
      // (the board looks along its local +Z: back towards the middle of the village)
      this._signs.push({ i, centre: V(bx + sn * 0.03, y + sy + SH / 2, bz + ca * 0.03), right: V(ca, 0, -sn), w: SW, h: SH });
      for (const g of [-1, 1]) this.colliders.push({ type: 'circle', x: bx + ca * g * SW / 2, z: bz - sn * g * SW / 2, r: 0.16 });
    }
    // a bench for two at the edge, looking down on the valley; lanterns on either side
    m.tint(STONE[0], STONE[1], STONE[2], 1).box(-1.05, 0.3, 9.36, 1.05, 0.39, 9.84).box(-0.92, -0.3, 9.42, -0.68, 0.3, 9.78).box(0.68, -0.3, 9.42, 0.92, 0.3, 9.78);
    for (const g of [-1, 1]) {
      m.tint(DARK[0], DARK[1], DARK[2], 1).rod(V(g * 2.6, -0.2, 9.2), V(g * 2.6, 2.0, 9.2), 0.04, 6);
      glow.tint(1, 0.82, 0.5, 1).box(g * 2.6 - 0.08, 2.0, 9.12, g * 2.6 + 0.08, 2.26, 9.28);
    }
    for (const b of [m, glow, cloth]) b.pop();
    for (const o of [-0.5, 0.5]) { const [bx, bz] = W(o, 9.6); this.seats.push(seatAt(bx, y + 0.39, bz, yaw)); }
    { const [bx, bz] = W(0, 9.6); this.colliders.push({ type: 'box', x: bx, z: bz, hw: 1.05, hl: 0.26, yaw, y0: y - 1, y1: y + 0.6 }); }
    { const [fx, fz] = W(5.6, 6.6); this.colliders.push({ type: 'circle', x: fx, z: fz, r: 0.2 }); }
    // the ring one arrives through, its back to the houses
    const [rx, rz] = W(0, -2.6);
    this._ring(parts, rx, y, rz, yaw);
    // where one can walk: the round shelf
    const edge = [];
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; edge.push([x + Math.cos(a) * (SKY.pad - 0.7), z + Math.sin(a) * (SKY.pad - 0.7)]); }
    this.areas.push(new Polygon(edge, { name: 'sky' }));
    const [ax, az] = W(0, 0.4), [gx, gz] = W(-5.6, 5.6);
    this.villages.push({ index: i, id: sponsorId(who), name: who.name, motto: who.motto || '', url: /^https:\/\//.test(who.url || '') ? who.url : null, color: col, x, y, z, yaw, arrive: [ax, az, yaw], ring: [rx, rz], sign: [gx, gz] }); // (one arrives looking at the valley)
    // six sectors round the valley, so that what is behind the camera is not drawn
    const sector = Math.floor(((Math.atan2(z, x + 60) + Math.PI) / (2 * Math.PI)) * 6) % 6;
    this._add(`sky${sector}`, parts);
  }

  // The Sky Gate, in the valley: a bigger ring on three steps, lanterns, a signpost
  _gate() {
    const G = SKY.gate, parts = new Parts(), y = this.data.heightAt(G.x, G.z);
    const m = parts.get('matte'), glow = parts.get('glow');
    m.tint(STONE[0] * 0.92, STONE[1] * 0.92, STONE[2] * 0.92, 1).cylinder(G.x, y - 0.6, G.z, 3.4, 3.6, 0.66, 18);
    this.platforms.push({ type: 'disc', x: G.x, z: G.z, r: 3.4, y: y + 0.06, clearance: 1.0 });
    this._ring(parts, G.x, y + 0.06, G.z, G.yaw, [1.12, 1.06, 0.92]);
    const sx = Math.cos(G.yaw), sz = -Math.sin(G.yaw), fx = Math.sin(G.yaw), fz = Math.cos(G.yaw);
    for (const g of [-1, 1]) {
      const lx = G.x + sx * g * 2.9 + fx * 1.6, lz = G.z + sz * g * 2.9 + fz * 1.6;
      m.tint(DARK[0], DARK[1], DARK[2], 1).rod(V(lx, y - 0.2, lz), V(lx, y + 2.5, lz), 0.045, 6);
      glow.tint(0.6, 0.85, 1, 1).box(lx - 0.1, y + 2.5, lz - 0.1, lx + 0.1, y + 2.82, lz + 0.1);
      this.colliders.push({ type: 'circle', x: lx, z: lz, r: 0.2 });
    }
    this.gate = { x: G.x, z: G.z, y, yaw: G.yaw, arrive: [G.x + fx * 2.4, G.z + fz * 2.4, G.yaw] };
    this._add('skygate', parts);
  }

  _buildPortals() {
    const n = this._portals.length, pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = [];
    this._portals.forEach(([c, right, up], k) => {
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([u, v], q) => {
        const p = c.clone().addScaledVector(right, u * RING * 1.02).addScaledVector(up, v * RING * 1.02);
        pos.set([p.x, p.y, p.z], (k * 4 + q) * 3); uv.set([u, v], (k * 4 + q) * 2);
      });
      idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, makeMaterial({ vertexShader: PORTAL_VERT, fragmentShader: PORTAL_FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
    mesh.name = 'sky-portals';
    mesh.renderOrder = 14;
    mesh.frustumCulled = false; // (they are all over the map: one mesh, a hundred triangles)
    this.group.add(mesh);
  }

  // The faces of the signs: every name on one sheet, one mesh
  _buildSigns() {
    const COLS = 5, ROWS = Math.ceil(this._signs.length / COLS), CW = 400, CH = 200;
    const canvas = document.createElement('canvas');
    canvas.width = COLS * CW; canvas.height = ROWS * CH;
    const ctx = canvas.getContext('2d');
    const n = this._signs.length, pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = [];
    this._signs.forEach((sg, k) => {
      const v = this.villages[sg.i], cx = (k % COLS) * CW, cy = Math.floor(k / COLS) * CH;
      const rgb = v.color.map((q) => Math.round(Math.min(1, q * 1.15) * 255));
      ctx.fillStyle = '#f6f1e4'; ctx.fillRect(cx, cy, CW, CH);
      ctx.fillStyle = `rgb(${rgb})`; ctx.fillRect(cx, cy, CW, 30); ctx.fillRect(cx, cy + CH - 12, CW, 12);
      ctx.fillStyle = '#1b2a22'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let size = 62;
      do { ctx.font = `700 ${size}px Georgia, 'Times New Roman', serif`; size -= 2; } while (ctx.measureText(v.name).width > CW - 36 && size > 20);
      ctx.fillText(v.name, cx + CW / 2, cy + (v.motto ? 96 : 110));
      if (v.motto) {
        size = 26;
        do { ctx.font = `500 ${size}px system-ui, sans-serif`; size -= 1; } while (ctx.measureText(v.motto).width > CW - 30 && size > 12);
        ctx.fillStyle = '#5a5140'; ctx.fillText(v.motto, cx + CW / 2, cy + 150);
      }
      const up = V(0, 1, 0);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], q) => {
        const p = sg.centre.clone().addScaledVector(sg.right, (a * sg.w) / 2).addScaledVector(up, (b * sg.h) / 2);
        pos.set([p.x, p.y, p.z], (k * 4 + q) * 3);
        uv.set([(cx + (a > 0 ? CW : 0)) / canvas.width, 1 - (cy + (b > 0 ? 0 : CH)) / canvas.height], (k * 4 + q) * 2);
      });
      idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    mesh.name = 'sky-signs';
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  /** The village one stands in, or null. */
  villageAt(x, z) {
    for (const v of this.villages) if ((x - v.x) ** 2 + (z - v.z) ** 2 < SKY.pad * SKY.pad) return v;
    return null;
  }

  /** A village by its id (see sponsors.js) or its number (1 to 30). */
  find(key) {
    const k = String(key || '').toLowerCase();
    return this.villages.find((v) => v.id === k) || this.villages[parseInt(k, 10) - 1] || null;
  }

  update(dt, time, camera) {
    if (camera) this._cull(camera.position);
  }
}
