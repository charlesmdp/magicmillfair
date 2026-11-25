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
#ifdef PAINT
out vec3 vObj; // where the point is on the body at rest: a paint job is drawn there, and does not swim as the body moves
#endif
void main() {
  #ifdef PAINT
  vObj = position;
  #endif
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
#ifdef PAINT
// A paint job on an avatar — x: which (0 none, 1 gold, 2 chrome, 3 atomic, 4 candy), y: seconds, z: metres
// per unit of the body at rest. It covers what takes the colour of the player (the alpha of the vertex).
uniform vec4 uPaint;
in vec3 vObj;
#endif
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
  float rough = uParams.x, spec = uParams.y;
  #ifdef PAINT
  float pk = uPaint.x, pm = vColor.a;
  vec3 pq = vObj * uPaint.z;
  float veins = 0.0, hot = 0.0;
  vec3 pglow = vec3(0.0), prim = vec3(0.0); // (what glows by itself, and the colour of the rim of light round the body)
  if (pk > 8.5) {
    // galaxy: a night sky wrapped round the body — nebulas that drift, stars that twinkle
    float t = uPaint.y;
    vec3 c = pq * 4.2;
    float neb = 0.5 + 0.5 * sin(c.x * 1.1 + 1.5 * sin(c.y * 0.9 + t * 0.12)) * sin(c.z * 1.3 + 1.5 * sin(c.x * 0.8 - t * 0.1));
    vec3 sky = mix(vec3(0.015, 0.02, 0.07), mix(vec3(0.3, 0.06, 0.45), vec3(0.05, 0.28, 0.55), neb), smoothstep(0.35, 0.95, neb) * 0.85);
    vec3 cell = floor(pq * 64.0);
    float rnd = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float star = step(0.982, rnd) * (0.45 + 0.55 * sin(t * (1.5 + rnd * 4.0) + rnd * 60.0));
    albedo = mix(albedo, sky, pm);
    rough = mix(rough, 0.3, pm); spec = mix(spec, 0.8, pm);
    pglow = vec3(1.0, 0.95, 0.85) * star * 2.6 + sky * 0.9;
    prim = vec3(0.45, 0.35, 1.0) * 0.8;
  } else if (pk > 7.5) {
    // mirror ball: little mirrors, each with a colour of its own, twinkling one after the other
    float t = uPaint.y;
    vec3 g = pq * 15.0, cell = floor(g), f = fract(g);
    float rnd = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    vec3 hue = 0.5 + 0.5 * cos(6.2832 * (rnd + t * 0.04 + vec3(0.0, 0.33, 0.67)));
    float joint = step(0.07, f.x) * step(0.07, f.y) * step(0.07, f.z);
    albedo = mix(albedo, mix(vec3(0.8, 0.83, 0.88), hue, 0.4) * (0.75 + 0.25 * rnd) * mix(0.3, 1.0, joint), pm);
    rough = mix(rough, 0.1, pm); spec = mix(spec, 1.0, pm);
    pglow = hue * pow(saturate(sin(rnd * 40.0 + t * (1.2 + rnd * 2.5))), 10.0) * 1.8 * joint;
  } else if (pk > 6.5) {
    // hazard stripes: yellow and black, winding round the body
    float band = pq.y * 7.0 + atan(pq.x, pq.z) * 0.95493, f = fract(band);
    float edge = smoothstep(0.0, 0.04, f) * (1.0 - smoothstep(0.5, 0.54, f));
    albedo = mix(albedo, mix(vec3(0.045, 0.045, 0.05), vec3(1.0, 0.76, 0.04), edge), pm);
    rough = mix(rough, 0.3, pm); spec = mix(spec, 0.8, pm);
  } else if (pk > 5.5) {
    // plasma: filaments of violet and cyan chasing one another over a dark shell
    float t = uPaint.y;
    vec3 c = pq * 5.5;
    float w = sin(c.y * 2.0 + t * 1.3 + 2.0 * sin(c.x * 1.5 + t * 0.7)) + sin(c.z * 2.3 - t * 1.1 + 2.0 * sin(c.y * 1.2 - t * 0.5));
    vec3 hue = mix(vec3(0.6, 0.12, 1.0), vec3(0.05, 0.9, 1.0), smoothstep(-0.8, 0.8, w));
    albedo = mix(albedo, vec3(0.035, 0.02, 0.08), pm);
    rough = mix(rough, 0.25, pm); spec = mix(spec, 0.8, pm);
    pglow = hue * (0.18 + 1.7 * pow(abs(sin(w * 2.6)), 8.0));
    prim = hue * 1.3;
  } else if (pk > 4.5) {
    // meltdown: a crust of black slag, and the fire of the core in its cracks, crawling
    float t = uPaint.y;
    vec3 c = pq * 6.5;
    float n = sin(c.x * 1.3 + 1.9 * sin(c.y * 0.8 - t * 0.35)) * sin(c.y * 1.2 + 1.6 * sin(c.z * 1.1 + t * 0.3)) * sin(c.z * 0.9 + 1.8 * sin(c.x * 0.7 - t * 0.25));
    float crack = 1.0 - smoothstep(0.0, 0.12, abs(n));
    albedo = mix(albedo, vec3(0.05, 0.032, 0.028), pm);
    rough = mix(rough, 0.62, pm); spec = mix(spec, 0.3, pm);
    pglow = (vec3(1.0, 0.3, 0.03) * crack * 2.0 + vec3(1.0, 0.8, 0.25) * pow(crack, 5.0) * 1.4) * (0.75 + 0.25 * sin(t * 1.7 + c.y * 0.7));
    prim = vec3(1.0, 0.38, 0.06) * 0.7;
  } else if (pk > 3.5) {
    // candy: a swirl of stripes, white and a colour that changes from one to the next, lacquered; it turns slowly
    float band = pq.y * 11.0 + atan(pq.x, pq.z) * 1.27324 + uPaint.y * 0.22, k = floor(band), f = fract(band);
    // (the colours of a sweet shop, one after the other: raspberry, lemon, mint, blueberry, bubble gum)
    float c5 = mod(floor(k * 0.5), 5.0);
    vec3 hue = c5 < 0.5 ? vec3(0.95, 0.08, 0.22) : c5 < 1.5 ? vec3(1.0, 0.8, 0.1) : c5 < 2.5 ? vec3(0.15, 0.85, 0.6) : c5 < 3.5 ? vec3(0.2, 0.45, 1.0) : vec3(1.0, 0.35, 0.7);
    vec3 tone = mod(k, 2.0) < 0.5 ? vec3(1.0, 0.98, 0.96) : hue;
    albedo = mix(albedo, tone * (0.86 + 0.14 * smoothstep(0.0, 0.08, f) * (1.0 - smoothstep(0.92, 1.0, f))), pm);
    rough = mix(rough, 0.14, pm); spec = mix(spec, 1.0, pm);
  } else if (pk > 2.5) {
    // atomic: a dark shell, and under it something that glows — veins of it, hot spots that breathe
    float t = uPaint.y;
    vec3 c = pq * 8.5;
    float n = sin(c.x + 1.7 * sin(c.y * 0.9 + t * 0.6)) * sin(c.y * 1.1 + 1.7 * sin(c.z * 0.8 - t * 0.45)) * sin(c.z + 1.7 * sin(c.x * 1.2 + t * 0.5));
    veins = 1.0 - smoothstep(0.0, 0.07, abs(n));
    hot = smoothstep(0.35, 0.95, n) + smoothstep(0.35, 0.95, -n) * 0.5;
    albedo = mix(albedo, vec3(0.025, 0.06, 0.03), pm);
    rough = mix(rough, 0.32, pm); spec = mix(spec, 0.7, pm);
  } else if (pk > 1.5) albedo = mix(albedo, vec3(0.93, 0.95, 0.98), pm);
  else if (pk > 0.5) albedo = mix(albedo, vec3(1.0, 0.7, 0.26), pm);
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
  s.albedo = albedo * cav; s.N = N; s.Ng = Ng; s.rough = rough; s.spec = spec; s.sss = 0.0;
  #if defined(USE_FADE) || defined(TINT_MASK)
  s.ao = uAmbient;
  #else
  s.ao = vColor.a * uAmbient;
  #endif
  vec3 col = shadeSurface(s, vWorld, V, shadow);
  #ifdef METAL
  {
    // polished metal: little of its own colour, a lot of what is round it, in the colour of the metal — dark
    // and warm below, a bright band at the horizon, the softer light of the sky above — and the sun, wherever
    // it catches
    vec3 R = reflect(-V, N);
    float band = exp(-abs(R.y - 0.05) * 6.5);
    vec3 env = mix(vec3(0.075, 0.05, 0.03), vec3(0.46, 0.47, 0.5), smoothstep(-0.1, 0.5, R.y)) + vec3(0.8, 0.74, 0.62) * band;
    float sun = saturate(dot(R, uSunDir));
    float glint = pow(sun, 64.0) * 2.4 + pow(sun, 7.0) * 0.3;
    float fres = pow(1.0 - saturate(dot(N, V)), 4.0);
    col = col * 0.2 + albedo * (env * s.ao * (0.9 + 0.7 * fres) + uSunColor * glint * shadow);
  }
  #endif
  #ifdef PAINT
  if (pk > 0.5) {
    vec3 R = reflect(-V, N);
    float fres = pow(1.0 - saturate(dot(N, V)), 4.0), sun = saturate(dot(R, uSunDir));
    if (pk < 2.5) {
      // gold, chrome: polished metal — little of its own colour, a lot of what is round it. Gold: warm ground,
      // a bright horizon, a soft sky, and a sparkle that runs over it. Chrome: the blue of the sky, a white
      // horizon, the dark of the ground — a mirror.
      bool gold = pk < 1.5;
      float band = exp(-abs(R.y - 0.04) * (gold ? 9.0 : 16.0));
      // (what is under the horizon: the ground — dark, a little green for a mirror, warm for gold)
      vec3 env = gold ? mix(vec3(0.07, 0.035, 0.012), vec3(0.62, 0.58, 0.5), smoothstep(-0.15, 0.7, R.y)) + vec3(1.5, 1.3, 0.95) * band
        : mix(vec3(0.035, 0.06, 0.03), mix(vec3(0.8, 0.9, 1.0), vec3(0.1, 0.26, 0.7), smoothstep(0.0, 0.85, R.y)), smoothstep(-0.03, 0.02, R.y)) + vec3(1.5) * band;
      float glint = pow(sun, 90.0) * 3.4 + pow(sun, 8.0) * 0.4;
      // (gold dust: grains that catch the light one after the other as the body or the eye moves)
      vec3 grain = floor(pq * 190.0);
      float rnd = fract(sin(dot(grain, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      float sparkle = gold ? step(0.975, rnd) * pow(saturate(sin(rnd * 97.0 + uPaint.y * 2.4 + dot(V, vec3(9.0, 5.0, 7.0)) * 6.0)), 6.0) * 2.6 : 0.0;
      vec3 metal = col * 0.06 + albedo * (env * s.ao * (0.85 + 0.9 * fres) + uSunColor * glint * shadow) + vec3(1.0, 0.92, 0.7) * sparkle * (0.35 + 0.65 * shadow);
      col = mix(col, metal, pm);
    } else if (pk < 3.5) {
      // atomic: what glows under the shell, and a rim of it round the body
      float pulse = 0.62 + 0.38 * sin(uPaint.y * 2.6);
      vec3 glow = vec3(0.3, 1.0, 0.1) * (veins * 1.5 + hot * 1.1) * pulse + vec3(0.45, 1.0, 0.18) * fres * (1.0 + 0.5 * pulse);
      col += glow * pm;
    } else if (pk < 4.5 || (pk > 6.5 && pk < 8.5)) {
      // candy, hazard stripes, the mirror ball: a lacquer — the sun in it, a pale rim (and the mirrors that twinkle)
      col += (uSunColor * pow(sun, 70.0) * 1.3 * shadow + vec3(0.22) * fres + pglow) * pm;
    } else {
      // meltdown, plasma, galaxy: what glows by itself, and a rim of it round the body
      col += (pglow + prim * fres) * pm;
    }
  }
  #endif
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
 *   fade: the vertex alpha is an opacity (soft-edged ground decals) instead of ambient occlusion;
 *   metal: polished metal, which shows the sky and the ground round it;
 *   paint: an avatar's paint jobs (gold, chrome, atomic, candy, meltdown, plasma, hazard stripes, mirror ball,
 *          galaxy: the uniform uPaint says which)
 */
export function surfaceMaterial(o = {}) {
  const defines = {};
  if (o.map) defines.USE_MAP = 1;
  if (o.normalMap) defines.USE_NORMAL_MAP = 1;
  if (o.waterline) defines.WATERLINE = 1;
  if (o.fade) defines.USE_FADE = 1;
  if (o.tintMask) defines.TINT_MASK = 1;
  if (o.metal) defines.METAL = 1;
  if (o.paint) defines.PAINT = 1;
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
      ...(o.paint ? { uPaint: { value: new THREE.Vector4(0, 0, 1, 0) } } : {}),
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
