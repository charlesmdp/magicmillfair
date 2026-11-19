// Terrain: one instanced grid drawn for every selected quadtree node (CDLOD).
// Heights come from the world height texture in the vertex shader, with continuous
// morphing between levels of detail (no cracks, no popping, a single draw call).
import * as THREE from 'three';
import { makeMaterial, GLSL_COMMON, GLSL_SHADOW, GLSL_LIGHTING, GLSL_SURFACE } from '../../render/globals.js';

const GRID = 32; // quads per node side
const LEAF = 32; // metres
const LEVELS = 6; // 32 m .. 1024 m

const VERT = /* glsl */ `
${GLSL_COMMON}
in vec4 iNode; // x, z, size, level
uniform float uRanges[${LEVELS}];
uniform vec3 uLodCam; // detail follows the main camera in every pass (shadows, reflections)
out vec3 vWorld;
out float vClip;
#ifdef DEPTH_ONLY
#else
out float vDist;
#endif
void main() {
  vec2 g = position.xz;
  float size = iNode.z;
  int level = int(iNode.w);
  vec2 xz = iNode.xy + g * size;
  float h = worldHeightsLod(xz).x;
  float dist = distance(uLodCam, vec3(xz.x, h, xz.y));
  float range = uRanges[level];
  float morph = smoothstep(range * 0.70, range * 0.95, dist);
  vec2 fr = fract(g * ${(GRID / 2).toFixed(1)}) * ${(2 / GRID).toFixed(8)};
  g -= fr * morph;
  xz = iNode.xy + g * size;
  vec4 t = textureLod(uHeightTex, worldUV(xz), iNode.w + morph);
  h = (t.r * 255.0 * 256.0 + t.g * 255.0) / 65535.0 * uWorldMap.w + uWorldMap.z;
  vWorld = vec3(xz.x, h, xz.y);
  vClip = dot(vWorld, uClipPlane.xyz) + uClipPlane.w;
#ifndef DEPTH_ONLY
  vDist = dist;
#endif
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp sampler2DArray;
${GLSL_COMMON}
${GLSL_SHADOW}
${GLSL_LIGHTING}
${GLSL_SURFACE}
uniform sampler2D uSplatA;
uniform sampler2D uSplatB;
uniform sampler2D uTint;
uniform sampler2D uCaustics;
uniform sampler2D uNoiseTex;
uniform sampler2DArray uLayersA; // rgb albedo, a height
uniform sampler2DArray uLayersN; // rg normal, b roughness, a cavity
uniform float uLayerScale[8];
uniform vec3 uLayerColor[8];
uniform vec3 uWaterAbsorb;
uniform vec3 uWaterScatter;
in vec3 vWorld;
in float vClip;
in float vDist;

vec4 layerAlbedo(int i, vec2 xz, float farMix, float macro) {
#ifdef USE_LAYER_TEX
  vec4 a = texture(uLayersA, vec3(xz * uLayerScale[i], float(i)));
  // far away the detail averages out: fade to the layer's mean colour (keeps distant ground calm)
  a.rgb = mix(a.rgb, uLayerColor[i], farMix * 0.85);
  a.rgb *= macro;
  return a;
#else
  return vec4(uLayerColor[i], 0.5);
#endif
}

void main() {
  if (vClip < 0.0) discard;
  vec2 uv = worldUV(vWorld.xz);
  vec4 wa = texture(uSplatA, uv);
  vec4 wb = texture(uSplatB, uv);
  float w[8] = float[8](wa.r, wa.g, wa.b, wa.a, wb.r, wb.g, wb.b, wb.a);
  int i0 = 0, i1 = 1;
  float m0 = -1.0, m1 = -1.0;
  for (int i = 0; i < 8; i++) {
    float v = w[i];
    if (v > m0) { m1 = m0; i1 = i0; m0 = v; i0 = i; }
    else if (v > m1) { m1 = v; i1 = i; }
  }
  float farMix = smoothstep(30.0, 150.0, vDist);
  // broad tonal variation breaks the tiling without a second texture lookup per layer
  vec3 mn = texture(uNoiseTex, vWorld.xz * 0.013).rgb;
  float macro = 0.86 + 0.28 * (mn.r * 0.6 + mn.b * 0.4);
  vec4 a0 = layerAlbedo(i0, vWorld.xz, farMix, macro);
  vec4 a1 = layerAlbedo(i1, vWorld.xz, farMix, macro);
  // height-aware blend: the taller material shows through first
  float b0 = m0 + a0.a * 0.45, b1 = m1 + a1.a * 0.45;
  float bl = smoothstep(-0.18, 0.18, (b1 - b0)) * step(0.004, m1);
  bl = mix(bl, m1 / max(m0 + m1, 1e-4), smoothstep(30.0, 90.0, vDist));
  vec3 albedo = mix(a0.rgb, a1.rgb, bl);
  vec3 tint = texture(uTint, uv).rgb * 2.0;
  albedo *= tint;

  vec4 nt = texture(uNormalTex, uv);
  vec2 nxz = nt.rg * 2.0 - 1.0;
  vec3 Ng = normalize(vec3(nxz.x, sqrt(max(1.0 - dot(nxz, nxz), 0.0)), nxz.y));
  vec3 N = Ng;
  float rough = 0.9, cav = 1.0;
#if defined(USE_LAYER_TEX) && QUALITY > 0
  float nearK = 1.0 - smoothstep(45.0, 110.0, vDist);
  if (nearK > 0.01) {
    vec4 n0 = texture(uLayersN, vec3(vWorld.xz * uLayerScale[i0], float(i0)));
    vec4 n1 = texture(uLayersN, vec3(vWorld.xz * uLayerScale[i1], float(i1)));
    vec4 nd = mix(n0, n1, bl);
    vec2 d = (nd.rg * 2.0 - 1.0) * nearK * 1.15;
    N = normalize(vec3(Ng.x + d.x, Ng.y, Ng.z + d.y));
    rough = mix(rough, nd.b, nearK);
    cav = mix(1.0, nd.a, nearK * 0.8);
  }
#endif

  vec2 hw = worldHeights(vWorld.xz);
  float depth = hw.y - vWorld.y; // > 0 under water
  bool hasWater = hw.y > -30.0;
  float wet = hasWater ? 1.0 - smoothstep(0.0, 0.32, -depth) : 0.0;
  albedo *= mix(1.0, 0.62, wet);
  rough = mix(rough, 0.35, wet * 0.8);

  vec3 V = normalize(cameraPosition - vWorld);
  float shadow = sunShadow(vWorld, Ng);
  float canopy = mix(0.52, 1.0, nt.b);
  Surface s;
  s.albedo = albedo; s.N = N; s.Ng = Ng; s.rough = rough; s.ao = nt.a * cav * canopy; s.spec = 0.25 + 0.5 * wet; s.sss = 0.0;
  vec3 col = shadeSurface(s, vWorld, V, shadow);

  if (hasWater && depth > 0.0) {
    // light reaching the bed: caustics, then absorption on the way down and back up
    vec2 cuv = (vWorld.xz + uSunDir.xz * depth * 0.6) * 0.22;
    float c1 = texture(uCaustics, cuv + uTime * vec2(0.021, 0.013)).r;
    float c2 = texture(uCaustics, cuv * 1.37 - uTime * vec2(0.017, 0.024) + 0.31).r;
    float ca = min(c1, c2) * 2.6;
    float cfade = smoothstep(0.0, 0.25, depth) * exp(-depth * 0.45);
    col += albedo * uSunColor * ca * cfade * shadow * saturate(dot(N, uSunDir)) * 0.9;
    vec3 trans = exp(-uWaterAbsorb * depth * 1.9);
    col = col * trans + uWaterScatter * (1.0 - trans) * (0.35 + 0.65 * shadow) * (hemiAmbient(vec3(0.0, 1.0, 0.0)) + uSunColor * 0.4);
  }

  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col), 1.0);
}
`;

const DEPTH_FRAG = /* glsl */ `
void main() { gl_FragColor = vec4(1.0); }
`;

export class Terrain {
  /**
   * @param {import('../WorldData.js').WorldData} data
   */
  constructor(data, { layers = null } = {}) {
    this.data = data;
    this.half = data.half;
    this.rangeScale = 1;
    this.baseRange = 70;
    this._buildTree();

    // unit grid in XZ
    const n = GRID + 1;
    const pos = new Float32Array(n * n * 3);
    for (let j = 0, p = 0; j < n; j++) for (let i = 0; i < n; i++, p += 3) { pos[p] = i / GRID; pos[p + 1] = 0; pos[p + 2] = j / GRID; }
    const index = new Uint16Array(GRID * GRID * 6);
    for (let j = 0, q = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      // alternate the diagonal so morphing vertices pair up cleanly
      if ((i + j) % 2 === 0) { index[q++] = a; index[q++] = c; index[q++] = d; index[q++] = a; index[q++] = d; index[q++] = b; }
      else { index[q++] = a; index[q++] = c; index[q++] = b; index[q++] = b; index[q++] = c; index[q++] = d; }
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    this.maxNodes = 1400;
    this.nodeBuf = new Float32Array(this.maxNodes * 4);
    this.nodeAttr = new THREE.InstancedBufferAttribute(this.nodeBuf, 4);
    this.nodeAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iNode', this.nodeAttr);
    geo.instanceCount = 0;
    this.geometry = geo;

    this.ranges = new Float32Array(LEVELS);
    const layerColors = [
      [0.21, 0.35, 0.09], [0.27, 0.36, 0.1], [0.14, 0.12, 0.07], [0.21, 0.16, 0.11],
      [0.3, 0.29, 0.27], [0.72, 0.63, 0.46], [0.47, 0.43, 0.37], [0.24, 0.17, 0.11],
    ].map((c) => new THREE.Vector3(...c));
    this.uniforms = {
      uRanges: { value: this.ranges },
      uLodCam: { value: new THREE.Vector3() },
      uSplatA: { value: data.splatATex },
      uSplatB: { value: data.splatBTex },
      uTint: { value: data.tintTex },
      uLayersA: { value: layers?.albedo ?? null },
      uLayersN: { value: layers?.normal ?? null },
      uLayerScale: { value: layers?.scales ?? new Float32Array([0.5, 0.42, 0.36, 0.4, 0.4, 0.45, 0.85, 0.38]) },
      uLayerColor: { value: layers?.colors ?? layerColors },
      uWaterAbsorb: { value: new THREE.Vector3(0.42, 0.11, 0.09) },
      uWaterScatter: { value: new THREE.Vector3(0.02, 0.1, 0.09) },
    };
    this.material = makeMaterial({
      uniforms: this.uniforms,
      defines: layers ? { USE_LAYER_TEX: 1 } : {},
      vertexShader: VERT,
      fragmentShader: FRAG,
    });
    this.depthMaterial = this._depth = makeMaterial({
      uniforms: { uRanges: this.uniforms.uRanges, uLodCam: this.uniforms.uLodCam },
      defines: { DEPTH_ONLY: 1 },
      vertexShader: VERT,
      fragmentShader: DEPTH_FRAG,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'terrain';
    this.mesh.userData.depthMaterial = this.depthMaterial;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = -10;
    this.depthMaterial.colorWrite = false;
    this.depthMaterial.polygonOffset = true;
    this.depthMaterial.polygonOffsetFactor = 1.2;
    this.depthMaterial.polygonOffsetUnits = 2;
    this._frustum = new THREE.Frustum();
    this._mat = new THREE.Matrix4();
    this._box = new THREE.Box3();
    this.stats = { nodes: 0, triangles: 0 };
    this.setRangeScale(1);
  }

  setLayers(layers) {
    this.uniforms.uLayersA.value = layers.albedo;
    this.uniforms.uLayersN.value = layers.normal;
    if (layers.scales) this.uniforms.uLayerScale.value = layers.scales;
    if (layers.colors) this.uniforms.uLayerColor.value = layers.colors;
    this.material.userData.baseDefines.USE_LAYER_TEX = 1;
    this.material.defines.USE_LAYER_TEX = 1;
    this.material.needsUpdate = true;
  }

  setRangeScale(s) {
    this.rangeScale = s;
    for (let l = 0; l < LEVELS; l++) this.ranges[l] = this.baseRange * s * 2 ** l;
  }

  _buildTree() {
    // min/max heights per node and level
    const d = this.data, N = d.size;
    this.levels = [];
    const n0 = N / LEAF;
    const mn = new Float32Array(n0 * n0).fill(Infinity), mx = new Float32Array(n0 * n0).fill(-Infinity);
    for (let j = 0; j < N; j++) {
      const nj = (j / LEAF) | 0;
      for (let i = 0; i < N; i++) {
        const h = d.height[j * N + i];
        const q = nj * n0 + ((i / LEAF) | 0);
        if (h < mn[q]) mn[q] = h;
        if (h > mx[q]) mx[q] = h;
      }
    }
    this.levels.push({ n: n0, min: mn, max: mx, size: LEAF });
    for (let l = 1; l < LEVELS; l++) {
      const prev = this.levels[l - 1];
      const n = prev.n / 2;
      const a = new Float32Array(n * n), b = new Float32Array(n * n);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const q0 = j * 2 * prev.n + i * 2;
        a[j * n + i] = Math.min(prev.min[q0], prev.min[q0 + 1], prev.min[q0 + prev.n], prev.min[q0 + prev.n + 1]);
        b[j * n + i] = Math.max(prev.max[q0], prev.max[q0 + 1], prev.max[q0 + prev.n], prev.max[q0 + prev.n + 1]);
      }
      this.levels.push({ n, min: a, max: b, size: prev.size * 2 });
    }
  }

  _sphereBox(cx, cy, cz, r, x0, y0, z0, x1, y1, z1) {
    const dx = cx < x0 ? x0 - cx : cx > x1 ? cx - x1 : 0;
    const dy = cy < y0 ? y0 - cy : cy > y1 ? cy - y1 : 0;
    const dz = cz < z0 ? z0 - cz : cz > z1 ? cz - z1 : 0;
    return dx * dx + dy * dy + dz * dz <= r * r;
  }

  _add(x0, z0, size, level) {
    if (this._count >= this.maxNodes) return;
    const p = this._count++ * 4;
    this.nodeBuf[p] = x0; this.nodeBuf[p + 1] = z0; this.nodeBuf[p + 2] = size; this.nodeBuf[p + 3] = level;
  }

  _select(level, i, j, cull) {
    const L = this.levels[level];
    const size = L.size;
    const x0 = -this.half + 0.5 + i * size, z0 = -this.half + 0.5 + j * size;
    const y0 = L.min[j * L.n + i] - 1, y1 = L.max[j * L.n + i] + 1;
    const c = this._cam;
    if (!this._sphereBox(c.x, c.y, c.z, this.ranges[level], x0, y0, z0, x0 + size, y1, z0 + size)) return false;
    if (cull) {
      this._box.min.set(x0, y0, z0); this._box.max.set(x0 + size, y1, z0 + size);
      if (!this._frustum.intersectsBox(this._box)) return true;
    }
    if (level === 0 || !this._sphereBox(c.x, c.y, c.z, this.ranges[level - 1], x0, y0, z0, x0 + size, y1, z0 + size)) {
      this._add(x0, z0, size, level);
      return true;
    }
    const half = size / 2;
    for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
      if (!this._select(level - 1, i * 2 + a, j * 2 + b, cull)) {
        // child is outside its own range: draw it at its level, the shader morphs it to the parent's grid
        const cx0 = x0 + a * half, cz0 = z0 + b * half;
        if (cull) {
          const Lc = this.levels[level - 1];
          const q = (j * 2 + b) * Lc.n + i * 2 + a;
          this._box.min.set(cx0, Lc.min[q] - 1, cz0); this._box.max.set(cx0 + half, Lc.max[q] + 1, cz0 + half);
          if (!this._frustum.intersectsBox(this._box)) continue;
        }
        this._add(cx0, cz0, half, level - 1);
      }
    }
    return true;
  }

  /** Select the nodes to draw for this camera. `lodCamera` drives the detail, `cullCamera` the frustum. */
  update(lodCamera, cullCamera = lodCamera, cull = true) {
    this._cam = lodCamera.getWorldPosition(this._camPos || (this._camPos = new THREE.Vector3()));
    this.uniforms.uLodCam.value.copy(this._cam);
    this._mat.multiplyMatrices(cullCamera.projectionMatrix, cullCamera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._mat, cullCamera.coordinateSystem, cullCamera.reversedDepth);
    this._count = 0;
    const top = LEVELS - 1;
    if (!this._select(top, 0, 0, cull)) this._add(-this.half + 0.5, -this.half + 0.5, this.levels[top].size, top);
    this.geometry.instanceCount = this._count;
    this.nodeAttr.clearUpdateRanges?.();
    this.nodeAttr.addUpdateRange?.(0, this._count * 4);
    this.nodeAttr.needsUpdate = true;
    this.stats.nodes = this._count;
    this.stats.triangles = this._count * GRID * GRID * 2;
  }

  /** Fixed uniform detail over the whole map (used when baking the static shadow map). */
  selectUniform(level) {
    const L = this.levels[level];
    this.uniforms.uLodCam.value.set(0, 1e7, 0); // far away + huge ranges below => no morphing
    this._savedRanges = Float32Array.from(this.ranges);
    this.ranges.fill(1e9);
    this._count = 0;
    for (let j = 0; j < L.n; j++) for (let i = 0; i < L.n; i++) this._add(-this.half + 0.5 + i * L.size, -this.half + 0.5 + j * L.size, L.size, level);
    this.geometry.instanceCount = this._count;
    this.nodeAttr.clearUpdateRanges?.();
    this.nodeAttr.needsUpdate = true;
  }

  restoreRanges() {
    if (this._savedRanges) { this.ranges.set(this._savedRanges); this._savedRanges = null; }
  }
}
