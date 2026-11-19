// Small sheets of falling white water (mill wheel, sluices): a ribbon with scrolling foam.
import * as THREE from 'three';
import { makeMaterial, GLSL_COMMON, GLSL_SHADOW, GLSL_LIGHTING } from '../../render/globals.js';

const VERT = /* glsl */ `
${GLSL_COMMON}
in float aFade;
out vec2 vUv;
out vec3 vWorld;
out float vFade;
void main() {
  vUv = uv;
  vFade = aFade;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_SHADOW}
${GLSL_LIGHTING}
uniform sampler2D uFoam;
in vec2 vUv;   // x: 0..1 across the sheet, y: metres along the flow
in vec3 vWorld;
in float vFade;
void main() {
  float a1 = texture(uFoam, vec2(vUv.x * 0.9, vUv.y * 0.3 - uTime * 0.9)).r;
  float a2 = texture(uFoam, vec2(vUv.x * 1.9 + 0.37, vUv.y * 0.55 - uTime * 1.5)).r;
  float streak = smoothstep(0.3, 0.9, a1 * 0.62 + a2 * 0.5);
  float sides = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
  float alpha = sides * mix(0.5, 0.96, streak) * vFade;
  if (alpha < 0.01) discard;
  float shadow = sunShadow(vWorld, vec3(0.0, 1.0, 0.0));
  vec3 light = hemiAmbient(vec3(0.0, 1.0, 0.0)) + uSunColor * (0.25 + 0.75 * shadow) * 0.8;
  vec3 col = mix(vec3(0.3, 0.5, 0.52), vec3(0.95), streak) * light * 0.9;
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col) * alpha, alpha);
}
`;

let material = null;
/** Shared material; `foam` is the uniform holding the tiling foam texture of the water system. */
export function fallsMaterial(foam) {
  if (!material) {
    material = makeMaterial({
      uniforms: { uFoam: foam }, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    material.name = 'falls';
  }
  return material;
}

/**
 * Ribbon along `points` (THREE.Vector3, in flow order), `width` metres wide along `side` (unit vector).
 * `fade(i)` gives the opacity at each point (default 1).
 */
export function fallsRibbon(points, side, width, foam, fade = () => 1) {
  const n = points.length;
  const pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), fd = new Float32Array(n * 2);
  let v = 0;
  for (let i = 0; i < n; i++) {
    if (i) v += points[i].distanceTo(points[i - 1]);
    for (let k = 0; k < 2; k++) {
      const p = points[i].clone().addScaledVector(side, (k ? 0.5 : -0.5) * width);
      pos.set([p.x, p.y, p.z], (i * 2 + k) * 3);
      uv.set([k, v], (i * 2 + k) * 2);
      fd[i * 2 + k] = fade(i);
    }
  }
  const idx = [];
  for (let i = 0; i + 1 < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aFade', new THREE.BufferAttribute(fd, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, fallsMaterial(foam));
  mesh.name = 'falls';
  mesh.renderOrder = 12; // after the water surfaces
  mesh.matrixAutoUpdate = false;
  return mesh;
}
