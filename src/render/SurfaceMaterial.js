// General purpose lit material for buildings and props (same lighting, shadows and haze as the rest of the world).
import * as THREE from 'three';
import { makeMaterial, GLSL_COMMON, GLSL_SHADOW, GLSL_LIGHTING, GLSL_SURFACE, G } from './globals.js';
import { GLSL_SKY } from './Atmosphere.js';

const VERT = /* glsl */ `
${GLSL_COMMON}
#include <skinning_pars_vertex>
out vec2 vUv;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vColor;
void main() {
  vec3 transformed = position;
  vec3 objectNormal = normal;
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>
  vec4 p = vec4(transformed, 1.0);
  vec3 n = objectNormal;
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  n = mat3(instanceMatrix) * n;
  #endif
  vec4 wp = modelMatrix * p;
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * n);
  vUv = uv;
  #ifdef USE_COLOR_ALPHA
  vColor = color;
  #elif defined(USE_COLOR)
  vColor = vec4(color, 1.0);
  #else
  vColor = vec4(1.0);
  #endif
  #ifdef USE_INSTANCING_COLOR
  vColor.rgb *= instanceColor;
  #endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const DEPTH_FRAG = /* glsl */ `void main() { gl_FragColor = vec4(1.0); }`;

let skinnedDepth = null;
/** Depth-only material that follows skeletal animation (shadow pass for characters). */
export function skinnedDepthMaterial() {
  if (!skinnedDepth) {
    skinnedDepth = makeMaterial({ vertexShader: VERT, fragmentShader: DEPTH_FRAG, side: THREE.DoubleSide });
    skinnedDepth.colorWrite = false;
  }
  return skinnedDepth;
}

const FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_SHADOW}
${GLSL_LIGHTING}
${GLSL_SURFACE}
uniform sampler2D uMap;
uniform sampler2D uNormalMap;
uniform vec3 uColor;
uniform vec4 uParams; // roughness, specular, normal scale, uv scale
uniform vec3 uEmissive;
uniform float uAmbient; // ambient light reaching this object (1 in the open, less in a cave)
#ifdef USE_FADE
uniform sampler2D uNoiseTex;
#endif
in vec2 vUv;
in vec3 vWorld;
in vec3 vNormal;
in vec4 vColor;
void main() {
  vec2 uv = vUv * uParams.w;
  #ifdef TINT_MASK
  // the vertex alpha says how much of the surface takes the colour of the material (an avatar's paint)
  vec3 albedo = mix(vColor.rgb, uColor, vColor.a);
  #else
  vec3 albedo = uColor * vColor.rgb;
  #endif
  #ifdef USE_MAP
  albedo *= texture(uMap, uv).rgb;
  #endif
  vec3 Ng = normalize(vNormal);
  #ifdef DOUBLE_SIDED
  if (!gl_FrontFacing) Ng = -Ng;
  #endif
  vec3 N = Ng;
  float cav = 1.0;
  #if defined(USE_NORMAL_MAP) && QUALITY > 0
  {
    vec3 dp1 = dFdx(vWorld), dp2 = dFdy(vWorld);
    vec2 du1 = dFdx(uv), du2 = dFdy(uv);
    vec3 dp2p = cross(dp2, Ng), dp1p = cross(Ng, dp1);
    vec3 T = dp2p * du1.x + dp1p * du2.x, B = dp2p * du1.y + dp1p * du2.y;
    float inv = inversesqrt(max(dot(T, T), dot(B, B)) + 1e-12);
    vec3 nt = texture(uNormalMap, uv).xyz;
    vec2 d = (nt.xy * 2.0 - 1.0) * uParams.z;
    N = normalize(Ng + (T * d.x + B * d.y) * inv);
    cav = 0.8 + 0.4 * nt.z;
  }
  #endif
  vec3 V = normalize(cameraPosition - vWorld);
  float shadow = sunShadow(vWorld, Ng);
  Surface s;
  s.albedo = albedo * cav; s.N = N; s.Ng = Ng; s.rough = uParams.x; s.spec = uParams.y; s.sss = 0.0;
  #if defined(USE_FADE) || defined(TINT_MASK)
  s.ao = uAmbient;
  #else
  s.ao = vColor.a * uAmbient;
  #endif
  vec3 col = shadeSurface(s, vWorld, V, shadow);
  #ifdef WATERLINE
  {
    // darken and tint whatever stands in the water
    vec2 hw = worldHeights(vWorld.xz);
    float lvl = abs(vWorld.x) < uWorldMap.y && abs(vWorld.z) < uWorldMap.y ? hw.y : (vWorld.x > 300.0 ? 0.0 : -100.0);
    float dep = lvl - vWorld.y;
    if (lvl > -30.0) {
      float wet = 1.0 - smoothstep(0.0, 0.4, -dep);
      col *= mix(1.0, 0.6, wet);
      if (dep > 0.0) {
        vec3 tr = exp(-vec3(0.42, 0.11, 0.09) * dep * 1.9);
        col = col * tr + vec3(0.02, 0.1, 0.09) * (1.0 - tr) * (hemiAmbient(vec3(0.0, 1.0, 0.0)) + uSunColor * 0.4 * shadow);
      }
    }
  }
  #endif
  col += uEmissive * vColor.rgb;
  col = applyFog(col, vWorld, cameraPosition);
  #ifdef USE_FADE
  // ground decal (roads): the vertex alpha fades the edges, broken up by noise so the border looks worn
  float fade = smoothstep(0.0, 1.0, vColor.a * 1.7 - texture(uNoiseTex, vWorld.xz * 0.13).r * 0.7);
  gl_FragColor = vec4(outputColor(col) * fade, fade);
  #else
  gl_FragColor = vec4(outputColor(col), 1.0);
  #endif
}
`;

/**
 * @param {object} o map, normalMap (textures), color [r,g,b], rough, spec, normalScale, uvScale, emissive [r,g,b];
 *   fade: the vertex alpha is an opacity (soft-edged ground decals) instead of ambient occlusion
 */
export function surfaceMaterial(o = {}) {
  const defines = {};
  if (o.map) defines.USE_MAP = 1;
  if (o.normalMap) defines.USE_NORMAL_MAP = 1;
  if (o.waterline) defines.WATERLINE = 1;
  if (o.fade) defines.USE_FADE = 1;
  if (o.tintMask) defines.TINT_MASK = 1;
  const mat = makeMaterial({
    ...(o.fade ? { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor } : {}),
    uniforms: {
      ...(o.fade ? { uNoiseTex: G.uNoiseTex } : {}),
      uMap: { value: o.map || null },
      uNormalMap: { value: o.normalMap || null },
      uColor: { value: new THREE.Vector3(...(o.color || [1, 1, 1])) },
      uParams: { value: new THREE.Vector4(o.rough ?? 0.8, o.spec ?? 0.2, o.normalScale ?? 1, o.uvScale ?? 1) },
      uEmissive: { value: new THREE.Vector3(...(o.emissive || [0, 0, 0])) },
      uAmbient: { value: 1 },
    },
    defines,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: o.side ?? THREE.FrontSide,
    vertexColors: o.vertexColors ?? true,
  });
  if (o.polygonOffset) { mat.polygonOffset = true; mat.polygonOffsetFactor = -o.polygonOffset; mat.polygonOffsetUnits = -o.polygonOffset * 4; }
  mat.name = o.name || 'surface';
  return mat;
}

// ---------------------------------------------------------------------------
// Glass: mostly reflects the sky, lets the inside show through a little.

const GLASS_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
${GLSL_SKY}
uniform vec4 uGlass; // tint rgb, opacity
in vec2 vUv;
in vec3 vWorld;
in vec3 vNormal;
in vec4 vColor;
void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = 0.06 + 0.94 * pow(1.0 - saturate(dot(N, V)), 4.0);
  vec3 R = reflect(-V, N);
  vec3 sky = skyGradient(vec3(R.x, abs(R.y) * 0.8 + 0.1, R.z));
  float glint = pow(saturate(dot(R, uSunDir)), 260.0) * 6.0;
  float a = saturate(uGlass.a + fres * 0.7 + glint);
  vec3 col = mix(uGlass.rgb * (hemiAmbient(N) + uSunColor * 0.25), sky, fres) + uSunColor * glint;
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col) * a, a);
}
`;

export function glassMaterial({ tint = [0.05, 0.08, 0.09], opacity = 0.35 } = {}) {
  const mat = makeMaterial({
    uniforms: { uGlass: { value: new THREE.Vector4(...tint, opacity) }, uSkyZenith: G.uSkyZenith, uSkyHorizon: G.uSkyHorizon },
    vertexShader: VERT,
    fragmentShader: GLASS_FRAG,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexColors: true,
  });
  mat.name = 'glass';
  return mat;
}
