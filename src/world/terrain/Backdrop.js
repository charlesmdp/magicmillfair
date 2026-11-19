// Low-resolution relief surrounding the playable square: gives the world a horizon.
import * as THREE from 'three';
import { makeMaterial, GLSL_COMMON, GLSL_LIGHTING } from '../../render/globals.js';

const VERT = /* glsl */ `
${GLSL_COMMON}
in float aCover;
out vec3 vWorld;
out vec3 vN;
out float vCover;
void main() {
  vWorld = position;
  vN = normal;
  vCover = aCover;
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
uniform sampler2D uNoiseTex;
in vec3 vWorld;
in vec3 vN;
in float vCover;
void main() {
  // the detailed terrain owns the playable square
  if (abs(vWorld.x) < 509.0 && abs(vWorld.z) < 509.0) discard;
  vec3 N = normalize(vN);
  // patchwork of fields and meadows, woods where the canopy map says so
  vec3 n1 = texture(uNoiseTex, vWorld.xz * 0.0031).rgb;
  vec3 n2 = texture(uNoiseTex, vWorld.xz * 0.019 + 0.3).rgb;
  float parcel = floor(n1.g * 5.0) / 5.0;
  vec3 field = mix(vec3(0.115, 0.19, 0.05), vec3(0.2, 0.2, 0.065), parcel);
  field = mix(field, vec3(0.17, 0.115, 0.075), step(0.78, n1.r + parcel * 0.2));
  field *= 0.85 + 0.3 * n2.r;
  vec3 wood = vec3(0.045, 0.1, 0.03) * (0.7 + 0.6 * n2.g);
  vec3 albedo = mix(field, wood, smoothstep(0.25, 0.6, vCover));
  float slope = 1.0 - N.y;
  albedo = mix(albedo, vec3(0.2, 0.19, 0.17), smoothstep(0.3, 0.55, slope));
  albedo = mix(albedo, vec3(0.6, 0.53, 0.4), (1.0 - smoothstep(0.3, 2.2, vWorld.y)) * step(-0.5, vWorld.y)); // shore
  float ndl = saturate(dot(N, uSunDir));
  vec3 col = albedo * (uSunColor * ndl * (1.0 - 0.45 * smoothstep(0.25, 0.6, vCover)) + hemiAmbient(N));
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col), 1.0);
}
`;

export class Backdrop {
  constructor(data, noiseUniform) {
    const b = data.backdrop;
    const n = b.n;
    const pos = new Float32Array(n * n * 3), cover = new Float32Array(n * n);
    for (let j = 0, i = 0; j < n; j++) for (let k = 0; k < n; k++, i++) {
      const x = -b.half + k * b.step, z = -b.half + j * b.step;
      let h = b.height[i];
      // tuck the rim under the detailed terrain so the seam never shows
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (edge < 520) h -= 0.8;
      pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;
      cover[i] = b.cover[i];
    }
    const idx = new Uint32Array((n - 1) * (n - 1) * 6);
    let q = 0;
    for (let j = 0; j < n - 1; j++) for (let k = 0; k < n - 1; k++) {
      const x = -b.half + (k + 0.5) * b.step, z = -b.half + (j + 0.5) * b.step;
      if (Math.abs(x) < 496 && Math.abs(z) < 496) continue; // hidden under the playable square
      const a = j * n + k, c = a + n;
      idx[q++] = a; idx[q++] = c; idx[q++] = a + 1; idx[q++] = a + 1; idx[q++] = c; idx[q++] = c + 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aCover', new THREE.BufferAttribute(cover, 1));
    geo.setIndex(new THREE.BufferAttribute(idx.subarray(0, q), 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.material = makeMaterial({ uniforms: { uNoiseTex: noiseUniform }, vertexShader: VERT, fragmentShader: FRAG });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'backdrop';
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -9;
  }
}
