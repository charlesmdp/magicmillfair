// Small plants (reeds, irises, ferns, wildflowers, lily pads...) streamed in 32 m cells
// around the camera and drawn with a single instanced draw call from one atlas.
import * as THREE from 'three';
import { makeMaterial, GLSL_COMMON, GLSL_SHADOW, GLSL_LIGHTING, GLSL_WIND } from '../../render/globals.js';
import { loadTexture } from '../../core/Assets.js';
import { ROCK_GARDEN, MILL, frameToWorld, LEVELS } from '../layout/layout.js';
import { pointInPolygon } from '../layout/spline.js';

const CELL = 32;
const STRIDE = 12;
// atlas tiles
const T = { reed: 0, cattail: 1, iris: 2, fern: 3, daisy: 4, poppy: 5, buttercup: 6, cornflower: 7, foxglove: 8, heather: 9, agapanthus: 10, pad: 11, lily: 12, dune: 13, leaves: 14, lavender: 15 };
// shapes: 0 two crossed quads, 1 three crossed quads, 2 rosette of six fronds, 3 flat on the water
const CROSS2 = 0, CROSS3 = 1, ROSETTE = 2, FLAT = 3;

const VERT = /* glsl */ `
${GLSL_COMMON}
${GLSL_SHADOW}
${GLSL_LIGHTING}
${GLSL_WIND}
in vec3 aQuad; // x across (-0.5..0.5), y along (0..1), quad index 0..5
in vec4 iA;    // position, rotation
in vec4 iB;    // width, height, tile, shape
in vec4 iC;    // tint, phase
uniform vec4 uScatter; // range, -, -, -
out vec2 vUv;
out vec3 vLight;
out vec3 vTint;
out float vFog;
out vec3 vFogCol;

void main() {
  float shape = iB.w;
  float q = aQuad.z;
  float dist = distance(iA.xyz, cameraPosition);
  float fade = 1.0 - smoothstep(uScatter.x * 0.78, uScatter.x, dist);
  float quads = shape < 0.5 ? 2.0 : shape < 1.5 ? 3.0 : shape < 2.5 ? 6.0 : 1.0;
  if (q >= quads || fade <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float w = iB.x * fade, h = iB.y * fade;
  float ang = iA.w + q * (shape > 1.5 ? 1.0472 : 3.14159 / quads);
  vec2 dir = vec2(cos(ang), sin(ang));
  vec3 p;
  float gust = windGust(iA.xz);
  float sway = (0.3 * gust + 0.2 * sin(uTime * (1.8 + iC.w * 2.0) + iC.w * 40.0) * gust);
  if (shape < 1.5) {
    p = vec3(dir.x * aQuad.x * w, aQuad.y * h, dir.y * aQuad.x * w);
    p.xz += uWind.xy * sway * aQuad.y * aQuad.y * h * 0.45;
  } else if (shape < 2.5) {
    // a frond: grows outwards, arches up then droops
    float t = aQuad.y;
    vec2 side = vec2(-dir.y, dir.x);
    float lift = h * (t * (1.7 - 1.25 * t)) + sway * 0.25 * t * h;
    p = vec3(dir.x * t * w + side.x * aQuad.x * w * 0.5, lift, dir.y * t * w + side.y * aQuad.x * w * 0.5);
  } else {
    // floating pad: rides the ripples a little
    p = vec3((aQuad.x * dir.x - (aQuad.y - 0.5) * dir.y) * w, 0.012 + sin(uTime * 1.3 + iC.w * 30.0) * 0.006, (aQuad.x * dir.y + (aQuad.y - 0.5) * dir.x) * w);
  }
  vec3 wp = iA.xyz + p;
  float tile = iB.z;
  vec2 cell = vec2(mod(tile, 4.0), floor(tile / 4.0));
  vec2 uv = vec2(aQuad.x + 0.5, 1.0 - aQuad.y);
  vUv = (cell + clamp(uv, 0.01, 0.99)) * 0.25;

  // lighting per plant (soft: plants are small)
  vec4 nt = textureLod(uNormalTex, worldUV(iA.xz), 0.0);
  float shadow = sunShadow(iA.xyz + vec3(0.0, 0.25, 0.0), vec3(0.0, 1.0, 0.0));
  vec3 V = normalize(cameraPosition - wp);
  float back = pow(saturate(dot(-V, uSunDir)), 3.0);
  float canopy = mix(0.55, 1.0, nt.b);
  float ao = mix(0.6, 1.0, shape > 2.5 ? 1.0 : aQuad.y) * canopy;
  vLight = uSunColor * (0.62 + 0.38 * back) * shadow * saturate(uSunDir.y + 0.25) + hemiAmbient(vec3(0.0, 1.0, 0.0)) * ao;
  vTint = iC.rgb;
  // fog factor per vertex
  vec3 fogged = applyFog(vec3(0.0), wp, cameraPosition);
  vec3 fogged1 = applyFog(vec3(1.0), wp, cameraPosition);
  vFog = 1.0 - (fogged1.r - fogged.r);
  vFogCol = fogged / max(vFog, 1e-3);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
uniform sampler2D uAtlas;
in vec2 vUv;
in vec3 vLight;
in vec3 vTint;
in float vFog;
in vec3 vFogCol;
void main() {
  vec4 tex = texture(uAtlas, vUv);
#ifdef USE_A2C
  float a = saturate((tex.a - 0.42) / max(fwidth(tex.a), 1e-4) + 0.5);
  if (a < 0.02) discard;
#else
  if (tex.a < 0.42) discard;
  float a = 1.0;
#endif
  vec3 col = tex.rgb * vTint * vLight;
  col = mix(col, vFogCol, vFog);
  gl_FragColor = vec4(outputColor(col), a);
}
`;

function hash(x, z, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi, s), b = hash(xi + 1, zi, s), c = hash(xi, zi + 1, s), d = hash(xi + 1, zi + 1, s);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

export class Scatter {
  constructor(engine, data) {
    this.engine = engine;
    this.data = data;
    this.range = engine.tier.scatterRange;
    this.density = engine.tier.scatterDensity;
    this.cells = new Map();
    // room for what a tier can show at once (the nearest cells win when an area is denser than that)
    this.capacity = Math.round(26000 * Math.max(1, (this.range / 80) ** 2 * this.density));
    this.group = new THREE.Group();
    this.group.name = 'scatter';
    this.stats = { instances: 0, cells: 0 };
    this._key = '';
    this._surf = new Float32Array(8);
  }

  async load() {
    const tier = this.engine.tier;
    const atlas = await loadTexture(`textures/foliage/plants_${tier.quality >= 2 ? 1024 : 512}.webp`, { srgb: true, repeat: false });
    const a2c = !!tier.msaa;
    this.uniforms = { uAtlas: { value: atlas }, uScatter: { value: new THREE.Vector4(this.range, 0, 0, 0) } };
    this.material = makeMaterial({ uniforms: this.uniforms, defines: a2c ? { USE_A2C: 1 } : {}, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, alphaToCoverage: a2c });
    // base geometry: six quads, each two segments tall
    const quad = [], idx = [];
    for (let q = 0; q < 6; q++) {
      const base = q * 6;
      for (let r = 0; r < 3; r++) { quad.push(-0.5, r / 2, q, 0.5, r / 2, q); }
      for (let r = 0; r < 2; r++) { const a = base + r * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('aQuad', new THREE.Float32BufferAttribute(quad, 3));
    geo.setIndex(idx);
    this.buffer = new Float32Array(this.capacity * STRIDE);
    const ib = new THREE.InstancedInterleavedBuffer(this.buffer, STRIDE);
    ib.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iA', new THREE.InterleavedBufferAttribute(ib, 4, 0));
    geo.setAttribute('iB', new THREE.InterleavedBufferAttribute(ib, 4, 4));
    geo.setAttribute('iC', new THREE.InterleavedBufferAttribute(ib, 4, 8));
    geo.instanceCount = 0;
    this.ib = ib;
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.name = 'scatter:plants';
    this.mesh.renderOrder = -4;
    this.group.add(this.mesh);
    return this;
  }

  /** Decide what grows in one cell. Deterministic for a given cell. */
  _generate(cx, cz) {
    const d = this.data, out = [];
    const x0 = cx * CELL, z0 = cz * CELL;
    const half = d.half;
    if (x0 + CELL < -half || z0 + CELL < -half || x0 > half || z0 > half) return new Float32Array(0);
    const dens = this.density;
    const surf = this._surf;
    const push = (x, y, z, w, h, tile, shape, tint, r) => out.push(x, y, z, r * 6.283, w, h, tile, shape, tint[0], tint[1], tint[2], r);
    const step = 1.15;
    const fr = MILL.house;
    for (let gz = 0; gz < CELL / step; gz++) {
      for (let gx = 0; gx < CELL / step; gx++) {
        const sx = Math.floor(x0 / step) + gx, sz = Math.floor(z0 / step) + gz;
        const r1 = hash(sx, sz, 1), r2 = hash(sx, sz, 2), r3 = hash(sx, sz, 3), r4 = hash(sx, sz, 4);
        const x = (sx + r1) * step, z = (sz + r2) * step;
        if (x < x0 || x >= x0 + CELL || z < z0 || z >= z0 + CELL) continue;
        if (Math.abs(x) > half - 2 || Math.abs(z) > half - 2) continue;
        if (r3 > dens) continue;
        const h = d.heightAt(x, z);
        const wl = d.waterAt(x, z);
        d.surfaceAt(x, z, surf);
        const lawn = surf[0], meadow = surf[1], forest = surf[2], dirt = surf[3], rock = surf[4], sand = surf[5], gravel = surf[6];
        const k = r4;
        const tintV = (a, b, c) => [a * (0.85 + 0.3 * r1), b * (0.88 + 0.24 * r2), c * (0.85 + 0.3 * r1)];
        if (wl > -500) {
          const depth = wl - h;
          const fresh = wl > 1.0;
          if (fresh && gravel < 0.75) {
            // the fringe: reeds, cattails and yellow irises where the water meets the bank
            const patch = valueNoise(x * 0.07, z * 0.07, 11);
            if (depth > -0.3 && depth < 0.42 && patch > 0.42 && k < 0.8) {
              const t = k < 0.42 ? T.reed : k < 0.6 ? T.cattail : T.iris;
              const size = t === T.iris ? 0.95 + r1 * 0.5 : 1.3 + r1 * 1.0;
              push(x, Math.max(h, wl - 0.25), z, size * 0.85, size, t, CROSS3, tintV(1, 1, 1), r2);
              continue;
            }
            // floating lilies on the calm shallows
            const shore = d.aux[d.index(x, z) * 4 + 1] / 255 * 16;
            if (depth > 0.45 && depth < 1.9 && shore < 9 && valueNoise(x * 0.11, z * 0.11, 23) > 0.6 && k < 0.5 && wl > 12) {
              push(x, wl, z, 0.55 + r1 * 0.5, 1, r2 < 0.22 ? T.lily : T.pad, FLAT, [1, 1, 1], r2);
              continue;
            }
          }
          if (depth > -0.05) continue;
        }
        // rock garden: heathers, lavender, agapanthus between the stones
        if (pointInPolygon(ROCK_GARDEN.outline, x, z)) {
          if (gravel > 0.6 && dirt < 0.3) continue;
          if (k < 0.55) {
            const t = k < 0.22 ? T.heather : k < 0.36 ? T.lavender : k < 0.46 ? T.agapanthus : T.leaves;
            const s = t === T.heather ? 0.7 + r1 * 0.6 : 0.6 + r1 * 0.5;
            push(x, h - 0.03, z, t === T.heather ? s * 1.5 : s, t === T.heather ? s * 0.8 : s * 1.2, t, t === T.leaves ? ROSETTE : CROSS3, tintV(1, 1, 1), r2);
          }
          continue;
        }
        if (gravel + sand * 0.0 + rock > 0.5) continue;
        if (forest > 0.45) {
          // woodland floor: ferns, a few foxgloves towards the light
          if (k < 0.2 * forest) push(x, h - 0.04, z, 0.8 + r1 * 0.7, 0.42 + r2 * 0.3, T.fern, ROSETTE, tintV(0.92, 1, 0.92), r2);
          else if (k > 0.985 && forest < 0.8) push(x, h, z, 0.55, 1.2 + r1 * 0.6, T.foxglove, CROSS2, [1, 1, 1], r2);
          continue;
        }
        if (sand > 0.25 && h > 2.1 && sand < 0.9) {
          if (k < 0.3) push(x, h - 0.03, z, 0.9 + r1 * 0.5, 0.6 + r2 * 0.45, T.dune, CROSS3, tintV(1, 1, 1), r2);
          continue;
        }
        const grass = d.grassAt(x, z);
        if (meadow > 0.55 && grass > 0.35 && grass < 0.86) {
          // drifts of wildflowers in the meadows
          const drift = valueNoise(x * 0.045, z * 0.045, 31), kind = valueNoise(x * 0.02, z * 0.02, 37);
          if (drift > 0.5 && k < 0.34) {
            const t = kind < 0.3 ? T.daisy : kind < 0.5 ? T.buttercup : kind < 0.72 ? T.poppy : T.cornflower;
            push(x, h, z, 0.55 + r1 * 0.3, 0.6 + r2 * 0.3, t, CROSS2, [1, 1, 1], r2);
          }
          continue;
        }
        if (lawn > 0.6 && k < 0.035 && valueNoise(x * 0.08, z * 0.08, 41) > 0.55) {
          push(x, h, z, 0.3, 0.28 + r1 * 0.1, r2 < 0.6 ? T.daisy : T.buttercup, CROSS2, [1, 1, 1], r2);
        }
      }
    }
    // planted borders: agapanthus along the garden facade, lavender by the terrace
    for (let i = 0; i < 26; i++) {
      const lz = -7.6 + i * 0.6;
      if (lz > -2.9 && lz < 2.6) continue; // conservatory
      const [x, z] = frameToWorld(fr, 4.25, lz);
      if (x >= x0 && x < x0 + CELL && z >= z0 && z < z0 + CELL) {
        const r = hash(i, 7, 9);
        push(x, d.heightAt(x, z) - 0.02, z, 0.8, 0.95 + r * 0.3, i % 3 ? T.agapanthus : T.lavender, CROSS3, [1, 1, 1], r);
      }
    }
    for (let i = 0; i < 12; i++) {
      const x = -131 + i * 0.95, z = 8.0;
      if (x >= x0 && x < x0 + CELL && z >= z0 && z < z0 + CELL) push(x, LEVELS.court + 0.5, z + 0.35, 0.7, 0.6, i % 2 ? T.lavender : T.heather, CROSS3, [1, 1, 1], hash(i, 3, 5));
    }
    return new Float32Array(out);
  }

  update(camera) {
    const cp = camera.position;
    const R = this.range;
    const c0x = Math.floor((cp.x - R) / CELL), c1x = Math.floor((cp.x + R) / CELL);
    const c0z = Math.floor((cp.z - R) / CELL), c1z = Math.floor((cp.z + R) / CELL);
    const key = `${c0x},${c1x},${c0z},${c1z}`;
    // when some cells did not fit, the choice is revisited as the viewer moves
    const moved = this._full && Math.hypot(cp.x - this._bx, cp.z - this._bz) > 12;
    if (key === this._key && !this._pending && !moved) return;
    this._key = key;
    this._bx = cp.x; this._bz = cp.z;
    // generate at most a couple of new cells per frame to stay smooth
    let budget = this._first ? 2 : 64;
    this._first = true;
    let pending = false;
    const active = [];
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const k = `${cx},${cz}`;
      let cell = this.cells.get(k);
      if (!cell) {
        if (budget <= 0) { pending = true; continue; }
        budget--;
        cell = { data: this._generate(cx, cz), used: 0 };
        this.cells.set(k, cell);
      }
      cell.used = this.engine.frame;
      cell.d = Math.hypot((cx + 0.5) * CELL - cp.x, (cz + 0.5) * CELL - cp.z);
      active.push(cell);
    }
    this._pending = pending;
    // nearest cells first: if the buffer fills up, only the far ones are left out
    active.sort((a, b) => a.d - b.d);
    let n = 0;
    this._full = false;
    for (const cell of active) {
      const len = Math.min(cell.data.length, this.buffer.length - n);
      if (len < cell.data.length) this._full = true;
      if (len <= 0) break;
      this.buffer.set(len === cell.data.length ? cell.data : cell.data.subarray(0, len), n);
      n += len;
    }
    this.geo.instanceCount = n / STRIDE;
    this.ib.clearUpdateRanges(); this.ib.addUpdateRange(0, n);
    this.ib.needsUpdate = true;
    this.stats.instances = n / STRIDE; this.stats.cells = active.length;
    // forget cells that have been far away for a while
    if (this.cells.size > 220) {
      for (const [k, cell] of this.cells) if (this.engine.frame - cell.used > 600) this.cells.delete(k);
    }
  }
}
