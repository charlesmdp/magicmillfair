// Frame-global uniforms shared by every material (same {value} objects everywhere),
// plus the GLSL building blocks for lighting, shadows, fog and output.
import * as THREE from 'three';

export const G = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.5).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
  uSkyColor: { value: new THREE.Color(0.45, 0.6, 0.9) },
  uGroundColor: { value: new THREE.Color(0.3, 0.28, 0.2) },
  uFogColor: { value: new THREE.Color(0.62, 0.74, 0.88) },
  uFogSunColor: { value: new THREE.Color(1.0, 0.86, 0.66) },
  uFogParams: { value: new THREE.Vector4(0.0011, 0.03, 8.0, 0.0) }, // density, height falloff, base height, unused
  uWind: { value: new THREE.Vector4(0.8, 0.6, 1.0, 0.0) }, // dir.x, dir.z, strength, time offset
  uExposure: { value: 1.0 },
  // world maps (set by WorldData)
  uHeightTex: { value: null }, // RG = terrain height, BA = water height (16 bit each)
  uNormalTex: { value: null }, // R,G = normal xz, B = canopy shade, A = ambient occlusion
  uWorldMap: { value: new THREE.Vector4(1 / 1024, 512, -32, 128) }, // 1/size, half, hMin, hRange
  // shadows
  uShadowStatic: { value: null },
  uShadowStaticMat: { value: new THREE.Matrix4() },
  uShadowDyn: { value: null },
  uShadowDynMat: { value: new THREE.Matrix4() },
  uShadowParams: { value: new THREE.Vector4(1 / 2048, 1 / 2048, 0, 45) }, // static texel, dyn texel, dyn enabled, dyn radius
  uShadowCenter: { value: new THREE.Vector3() },
  // clip plane for the planar reflection pass (xyz = normal, w = d). Disabled when w is very small.
  uClipPlane: { value: new THREE.Vector4(0, 1, 0, 1e9) },
  uCaustics: { value: null },
  uNoiseTex: { value: null },
};

/** Defines injected in every material; changing them requires a material recompile. */
export const globalDefines = {
  HDR_OUTPUT: false, // true when a post-processing chain does the tone mapping
  SHADOW_DYNAMIC: false,
  SHADOW_SOFT: false,
  QUALITY: 2, // 0 low, 1 medium, 2 high
};

const registry = new Set();

/** ShaderMaterial wired to the shared uniforms and global defines. */
export function makeMaterial({ uniforms = {}, defines = {}, vertexShader, fragmentShader, ...rest }) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...G, ...uniforms },
    defines: { ...defines },
    vertexShader,
    fragmentShader,
    ...rest,
  });
  mat.userData.baseDefines = { ...defines };
  applyGlobalDefines(mat);
  registry.add(mat);
  const dispose = mat.dispose.bind(mat);
  mat.dispose = () => { registry.delete(mat); dispose(); };
  return mat;
}

function applyGlobalDefines(mat) {
  const d = { ...mat.userData.baseDefines };
  if (globalDefines.HDR_OUTPUT) d.HDR_OUTPUT = 1;
  if (globalDefines.SHADOW_DYNAMIC) d.SHADOW_DYNAMIC = 1;
  if (globalDefines.SHADOW_SOFT) d.SHADOW_SOFT = 1;
  d.QUALITY = globalDefines.QUALITY;
  mat.defines = d;
  mat.needsUpdate = true;
}

export function refreshGlobalDefines() {
  for (const m of registry) applyGlobalDefines(m);
}

// ---------------------------------------------------------------------------
// GLSL chunks

export const GLSL_COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform vec4 uFogParams;
uniform vec4 uWind;
uniform float uExposure;
uniform sampler2D uHeightTex;
uniform sampler2D uNormalTex;
uniform vec4 uWorldMap;
uniform vec4 uClipPlane;

#define PI 3.14159265359
#define saturate(x) clamp(x, 0.0, 1.0)

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float ign(vec2 px) { // interleaved gradient noise (stable screen-space dither)
  return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
}
vec2 worldUV(vec2 xz) { return (xz + uWorldMap.y) * uWorldMap.x; }
// terrain and water-surface heights (metres); water < -30 means "no water here"
vec2 worldHeights(vec2 xz) {
  vec4 t = textureLod(uHeightTex, worldUV(xz), 0.0);
  return vec2(t.r * 255.0 * 256.0 + t.g * 255.0, t.b * 255.0 * 256.0 + t.a * 255.0) / 65535.0 * uWorldMap.w + uWorldMap.z;
}
vec2 worldHeightsLod(vec2 xz) {
  vec4 t = textureLod(uHeightTex, worldUV(xz), 0.0);
  return vec2(t.r * 255.0 * 256.0 + t.g * 255.0, t.b * 255.0 * 256.0 + t.a * 255.0) / 65535.0 * uWorldMap.w + uWorldMap.z;
}
`;

export const GLSL_SHADOW = /* glsl */ `
uniform highp sampler2DShadow uShadowStatic;
uniform mat4 uShadowStaticMat;
uniform vec4 uShadowParams;
uniform vec3 uShadowCenter;
#ifdef SHADOW_DYNAMIC
uniform highp sampler2DShadow uShadowDyn;
uniform mat4 uShadowDynMat;
#endif

float shadowTap(highp sampler2DShadow map, vec3 c) { return texture(map, c); }

float shadowPCF(highp sampler2DShadow map, vec3 c, float texel, float spread) {
#ifdef SHADOW_SOFT
  vec2 o = vec2(texel * spread);
  float s = shadowTap(map, c + vec3(-o.x, -o.y, 0.0)) + shadowTap(map, c + vec3(o.x, -o.y, 0.0))
          + shadowTap(map, c + vec3(-o.x, o.y, 0.0)) + shadowTap(map, c + vec3(o.x, o.y, 0.0));
  return s * 0.25;
#else
  return shadowTap(map, c);
#endif
}

// Sun visibility at a world position. N = geometric normal (for the bias).
float sunShadow(vec3 wp, vec3 N) {
  float ndl = saturate(dot(N, uSunDir));
  vec3 p = wp + N * (0.35 + 0.9 * (1.0 - ndl));
  vec4 sc = uShadowStaticMat * vec4(p, 1.0);
  vec3 c = sc.xyz * 0.5 + 0.5;
  float vis = 1.0;
  if (c.x > 0.001 && c.x < 0.999 && c.y > 0.001 && c.y < 0.999 && c.z < 1.0) {
    vis = shadowPCF(uShadowStatic, vec3(c.xy, c.z - 0.0006), uShadowParams.x, 0.9);
  }
#ifdef SHADOW_DYNAMIC
  if (uShadowParams.z > 0.5) {
    vec3 pd = wp + N * (0.03 + 0.07 * (1.0 - ndl));
    vec4 sd = uShadowDynMat * vec4(pd, 1.0);
    vec3 cd = sd.xyz * 0.5 + 0.5;
    vec2 e = abs(cd.xy - 0.5) * 2.0;
    float edge = max(e.x, e.y);
    if (edge < 1.0 && cd.z < 1.0 && cd.z > 0.0) {
      float dv = shadowPCF(uShadowDyn, vec3(cd.xy, cd.z - 0.00035), uShadowParams.y, 0.75);
      vis = mix(dv, vis, smoothstep(0.82, 1.0, edge));
    }
  }
#endif
  return vis;
}
`;

export const GLSL_LIGHTING = /* glsl */ `
vec3 hemiAmbient(vec3 N) {
  float k = N.y * 0.5 + 0.5;
  return mix(uGroundColor, uSkyColor, k * k * (3.0 - 2.0 * k));
}

// Aerial perspective: exponential height fog with a warm glow towards the sun.
vec3 applyFog(vec3 color, vec3 wp, vec3 camPos) {
  vec3 v = wp - camPos;
  float dist = length(v);
  vec3 dir = v / max(dist, 1e-4);
  float density = uFogParams.x, falloff = uFogParams.y;
  float h0 = camPos.y - uFogParams.z;
  float dy = v.y;
  float od = density * exp(-falloff * h0) * dist;
  float t = falloff * dy;
  od *= abs(t) > 0.001 ? (1.0 - exp(-t)) / t : 1.0;
  float f = 1.0 - exp(-od);
  float s = pow(saturate(dot(dir, uSunDir)), 6.0);
  vec3 fc = mix(uFogColor, uFogSunColor, s * 0.75);
  return mix(color, fc, saturate(f));
}

vec3 tonemapFilmic(vec3 x) {
  // ACES-like fit with a slightly lifted toe: keeps colours rich without crushing the shade
  x *= uExposure;
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  vec3 r = saturate((x * (a * x + b)) / (x * (c * x + d) + e));
  // keep some of the original saturation that the per-channel curve washes out
  float l = dot(r, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(l), r, 1.12);
}
vec3 linearToSRGB(vec3 c) {
  c = saturate(c);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
// Final colour for the framebuffer. With HDR_OUTPUT the post chain finishes the job.
vec3 outputColor(vec3 c) {
#ifdef HDR_OUTPUT
  return max(c, 0.0);
#else
  return linearToSRGB(tonemapFilmic(c));
#endif
}
`;

export const GLSL_CLIP_VERT = /* glsl */ `
#define CLIP_DISTANCE(wp) (dot(wp, uClipPlane.xyz) + uClipPlane.w)
`;

export const GLSL_WIND = /* glsl */ `
// Layered wind: slow gusts travelling across the land + faster local flutter.
float windGust(vec2 xz) {
  vec2 d = uWind.xy;
  float t = uTime * 0.35;
  float a = sin(dot(xz, d) * 0.045 - t * 1.7) * 0.5 + 0.5;
  float b = sin(dot(xz, vec2(-d.y, d.x)) * 0.031 + t * 1.1 + a * 2.0) * 0.5 + 0.5;
  float c = sin(dot(xz, d) * 0.19 - t * 4.3 + b * 3.0) * 0.5 + 0.5;
  return (0.45 + 0.4 * a * b + 0.25 * c) * uWind.z;
}
`;

/** Standard direct + ambient shading used by most opaque surfaces. */
export const GLSL_SURFACE = /* glsl */ `
struct Surface {
  vec3 albedo;
  vec3 N;       // shading normal
  vec3 Ng;      // geometric normal (shadow bias)
  float rough;
  float ao;
  float spec;   // specular strength 0..1
  float sss;    // translucency 0..1 (foliage)
};

vec3 shadeSurface(Surface s, vec3 wp, vec3 V, float shadow) {
  float ndl = dot(s.N, uSunDir);
  float wrap = mix(0.0, 0.35, s.sss);
  float diff = saturate((ndl + wrap) / (1.0 + wrap));
  vec3 direct = uSunColor * diff * shadow;
  // light passing through thin leaves when looking towards the sun
  float back = saturate(dot(-V, uSunDir)) ;
  vec3 trans = uSunColor * s.sss * (0.25 + 0.75 * back * back) * saturate(-ndl * 0.7 + 0.5) * shadow * vec3(1.0, 1.05, 0.55);
  vec3 amb = hemiAmbient(s.N) * s.ao;
  vec3 col = s.albedo * (direct + amb + trans);
  if (s.spec > 0.0) {
    vec3 Hh = normalize(uSunDir + V);
    float a = max(s.rough * s.rough, 0.02);
    float ndh = saturate(dot(s.N, Hh));
    float d = ndh * ndh * (a * a - 1.0) + 1.0;
    float D = a * a / (PI * d * d);
    float fres = 0.04 + 0.96 * pow(1.0 - saturate(dot(V, Hh)), 5.0);
    col += uSunColor * shadow * saturate(ndl) * D * fres * s.spec * 0.25;
    // sky reflection at grazing angles
    float f2 = pow(1.0 - saturate(dot(s.N, V)), 5.0);
    col += uSkyColor * f2 * s.spec * (1.0 - s.rough) * s.ao * 0.5;
  }
  return col;
}
`;
