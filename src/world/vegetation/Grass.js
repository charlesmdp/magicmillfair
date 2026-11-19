// Grass: blades are placed entirely on the GPU from the world maps (height, grass cover,
// tint, shade). The CPU only chooses which 8 m tiles around the camera are worth drawing.
import * as THREE from 'three';
import { makeMaterial, GLSL_COMMON, GLSL_SHADOW, GLSL_LIGHTING, GLSL_WIND } from '../../render/globals.js';

const TILE = 8;

const VERT = /* glsl */ `
${GLSL_COMMON}
${GLSL_SHADOW}
${GLSL_LIGHTING}
${GLSL_WIND}
in vec4 aBlade; // root x, root z (in tile), height along blade 0..1, side -1..1
in vec4 aRand;
in vec3 iTile;  // tile origin x, z, detail (1 near, 0 far)
uniform sampler2D uAux;
uniform sampler2D uTint;
uniform vec4 uGrass; // range, density, blade width, max height
uniform vec3 uPlayer;
out vec3 vColor;

void main() {
  vec2 root = iTile.xy + aBlade.xy;
  vec2 uv = worldUV(root);
  float cover = textureLod(uAux, uv, 0.0).r;
  float ground = worldHeightsLod(root).x;
  float dist = distance(vec3(root.x, ground, root.y), cameraPosition);
  // thin the field out with distance; survivors get wider so the lawn keeps its body
  float keep = uGrass.y * (1.0 - smoothstep(uGrass.x * 0.35, uGrass.x, dist) * 0.82);
  float fade = 1.0 - smoothstep(uGrass.x * 0.82, uGrass.x, dist);
  float h = max(cover, 0.16 * step(0.04, cover)) * uGrass.w * (0.55 + 0.75 * aRand.y) * fade;
  if (cover < 0.04 || aRand.x > keep || h < 0.015) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec4 nt = textureLod(uNormalTex, uv, 0.0);
  vec3 tint = textureLod(uTint, uv, 1.0).rgb * 2.0;
  float t = aBlade.z;
  float widen = 1.0 / sqrt(max(keep, 0.12));
  float w = uGrass.z * (0.6 + 0.8 * aRand.z) * widen * (1.0 - t * 0.85) * mix(0.5, 1.5, smoothstep(0.25, 0.8, cover));

  // blade faces the viewer (around the vertical) with a personal twist
  vec2 toCam = normalize(cameraPosition.xz - root + 1e-4);
  float yaw = (aRand.w - 0.5) * 1.6;
  vec2 fwd = vec2(toCam.x * cos(yaw) - toCam.y * sin(yaw), toCam.x * sin(yaw) + toCam.y * cos(yaw));
  vec2 side = vec2(-fwd.y, fwd.x);

  // wind: travelling gusts + individual flutter; taller grass moves more
  float gust = windGust(root);
  float sway = (0.35 * gust + 0.22 * sin(uTime * (2.0 + aRand.x * 2.0) + aRand.w * 30.0) * gust) * h;
  vec2 lean = uWind.xy * sway + (aRand.zw - 0.5) * mix(0.9, 0.35, smoothstep(0.25, 0.7, cover)) * h;
  // step aside for the walker
  vec2 away = root - uPlayer.xz;
  float pd = length(away);
  lean += (away / max(pd, 0.05)) * (1.0 - smoothstep(0.25, 1.1, pd)) * h * 1.6 * step(abs(uPlayer.y - ground), 1.5);

  vec3 p = vec3(root.x, ground, root.y);
  p.xz += side * (aBlade.w * w) + lean * (t * t);
  p.y += h * t * (1.0 - 0.22 * dot(lean, lean) / max(h * h, 1e-4));

  // shading per blade (cheap): sun + sky on the ground normal, soft self shadow towards the root
  vec2 nxz = nt.rg * 2.0 - 1.0;
  vec3 N = normalize(vec3(nxz.x, sqrt(max(1.0 - dot(nxz, nxz), 0.0)) + 0.6, nxz.y));
  float shadow = sunShadow(vec3(root.x, ground + 0.15, root.y), vec3(0.0, 1.0, 0.0));
  float ndl = saturate(dot(N, uSunDir));
  vec3 V = normalize(cameraPosition - p);
  float back = pow(saturate(dot(-V, uSunDir)), 3.0);
  float canopy = mix(0.55, 1.0, nt.b);
  // root dark and cool, tip light and warm; dry straw tips in the tall meadows
  float tall = smoothstep(0.3, 0.75, cover);
  vec3 base = mix(vec3(0.07, 0.13, 0.04), vec3(0.058, 0.095, 0.034), tall);
  vec3 tip = mix(vec3(0.098, 0.172, 0.055), vec3(0.165, 0.215, 0.075), tall);
  tip = mix(tip, vec3(0.3, 0.27, 0.13), tall * step(0.72, aRand.y) * 0.7);
  vec3 albedo = mix(base, tip, t * (0.75 + 0.25 * aRand.z)) * tint;
  // wildflowers: a few blades end in a spot of colour
  float fl = step(0.985 - 0.012 * tall, aRand.w) * step(0.3, cover) * step(cover, 0.82) * step(0.6, t);
  vec3 petal = aRand.x < 0.3 ? vec3(0.9, 0.86, 0.75) : aRand.x < 0.55 ? vec3(0.95, 0.72, 0.1) : aRand.x < 0.75 ? vec3(0.75, 0.12, 0.1) : vec3(0.35, 0.3, 0.8);
  albedo = mix(albedo, petal, fl);
  float ao = mix(mix(0.92, 0.62, tall), 1.0, t) * nt.a * canopy;
  vec3 light = uSunColor * (ndl * shadow + back * 0.35 * shadow * t) + hemiAmbient(N) * ao;
  vec3 col = albedo * light;
  col = applyFog(col, p, cameraPosition);
  vColor = outputColor(col);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const FRAG = /* glsl */ `
in vec3 vColor;
void main() { gl_FragColor = vec4(vColor, 1.0); }
`;

function patch(count, detail, seed) {
  // detail: 5 vertices (3 triangles) per blade, otherwise a single triangle
  const vpb = detail ? 5 : 3;
  const blade = new Float32Array(count * vpb * 4), rand = new Float32Array(count * vpb * 4);
  const index = new Uint32Array(count * (detail ? 9 : 3));
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const shape = detail ? [[0, -1], [0, 1], [0.5, -0.7], [0.5, 0.7], [1, 0]] : [[0, -1], [0, 1], [1, 0]];
  // jittered grid for an even cover
  const n = Math.ceil(Math.sqrt(count));
  for (let b = 0; b < count; b++) {
    const gx = b % n, gz = Math.floor(b / n);
    const x = ((gx + rnd()) / n) * TILE, z = ((gz + rnd()) / n) * TILE;
    const r = [rnd(), rnd(), rnd(), rnd()];
    for (let v = 0; v < vpb; v++) {
      const o = (b * vpb + v) * 4;
      blade[o] = x; blade[o + 1] = z; blade[o + 2] = shape[v][0]; blade[o + 3] = shape[v][1];
      rand.set(r, o);
    }
    const i0 = b * vpb;
    if (detail) index.set([i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2, i0 + 2, i0 + 3, i0 + 4], b * 9);
    else index.set([i0, i0 + 1, i0 + 2], b * 3);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('aBlade', new THREE.BufferAttribute(blade, 4));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  return geo;
}

export class Grass {
  constructor(engine, data) {
    this.engine = engine;
    this.data = data;
    this.group = new THREE.Group();
    this.group.name = 'grass';
    const t = engine.tier;
    this.range = t.grassRange;
    this.uniforms = {
      uAux: { value: data.auxTex },
      uTint: { value: data.tintTex },
      uGrass: { value: new THREE.Vector4(t.grassRange, 1, 0.034, 0.92) },
      uPlayer: { value: new THREE.Vector3(0, -999, 0) },
    };
    this.material = makeMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
    const near = Math.round(2600 * t.grassDensity), far = Math.round(900 * t.grassDensity);
    this.maxTiles = 420;
    this.lods = [patch(near, true, 7), patch(far, false, 11)].map((geo, i) => {
      const buf = new Float32Array(this.maxTiles * 3);
      const attr = new THREE.InstancedBufferAttribute(buf, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('iTile', attr);
      geo.instanceCount = 0;
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.name = `grass:${i ? 'far' : 'near'}`;
      mesh.renderOrder = -5;
      this.group.add(mesh);
      return { geo, buf, attr, mesh, blades: i ? far : near };
    });
    this.nearRange = Math.min(20, this.range * 0.45);
    this._buildCoverGrid();
    this._frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this._box = new THREE.Box3();
    this.stats = { tiles: 0, blades: 0 };
  }

  /** Per tile: is there any grass, and the height span of the ground (for culling). */
  _buildCoverGrid() {
    const d = this.data, N = d.size, n = N / TILE;
    const has = new Uint8Array(n * n), lo = new Float32Array(n * n), hi = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let any = 0, mn = Infinity, mx = -Infinity;
      for (let b = 0; b < TILE; b++) for (let a = 0; a < TILE; a++) {
        const q = (j * TILE + b) * N + i * TILE + a;
        if (d.aux[q * 4] > 12) any = 1;
        const h = d.height[q];
        if (h < mn) mn = h; if (h > mx) mx = h;
      }
      has[j * n + i] = any; lo[j * n + i] = mn; hi[j * n + i] = mx;
    }
    this.cover = { n, has, lo, hi };
  }

  update(camera, playerPos) {
    const cp = camera.position;
    if (playerPos) this.uniforms.uPlayer.value.copy(playerPos);
    const R = this.range;
    this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._m, camera.coordinateSystem, camera.reversedDepth);
    const half = this.data.half, c = this.cover;
    const i0 = Math.max(0, Math.floor((cp.x - R + half) / TILE)), i1 = Math.min(c.n - 1, Math.floor((cp.x + R + half) / TILE));
    const j0 = Math.max(0, Math.floor((cp.z - R + half) / TILE)), j1 = Math.min(c.n - 1, Math.floor((cp.z + R + half) / TILE));
    const counts = [0, 0];
    // too high above the ground: individual blades are invisible, skip everything
    const above = cp.y - this.data.heightAt(cp.x, cp.z);
    if (above < R * 1.6) {
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const q = j * c.n + i;
        if (!c.has[q]) continue;
        const x = -half + i * TILE, z = -half + j * TILE;
        const dx = Math.max(x - cp.x, 0, cp.x - x - TILE), dz = Math.max(z - cp.z, 0, cp.z - z - TILE);
        const d = Math.hypot(dx, dz);
        if (d > R) continue;
        this._box.min.set(x, c.lo[q], z); this._box.max.set(x + TILE, c.hi[q] + 1.2, z + TILE);
        if (!this._frustum.intersectsBox(this._box)) continue;
        const lod = d < this.nearRange ? 0 : 1;
        if (counts[lod] >= this.maxTiles) continue;
        const L = this.lods[lod], o = counts[lod]++ * 3;
        L.buf[o] = x; L.buf[o + 1] = z; L.buf[o + 2] = 1 - lod;
      }
    }
    let blades = 0;
    this.lods.forEach((L, k) => {
      L.geo.instanceCount = counts[k];
      L.mesh.visible = counts[k] > 0;
      L.attr.clearUpdateRanges(); L.attr.addUpdateRange(0, counts[k] * 3); L.attr.needsUpdate = true;
      blades += counts[k] * L.blades;
    });
    this.stats.tiles = counts[0] + counts[1];
    this.stats.blades = blades;
  }
}
