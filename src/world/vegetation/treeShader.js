// Shaders for trees: foliage cards / solid foliage geometry, bark, and distant impostors.
// All three share the same distance-based dithered cross-fade so that levels of detail swap without popping.
import { GLSL_COMMON, GLSL_SHADOW, GLSL_LIGHTING, GLSL_SURFACE, GLSL_WIND } from '../../render/globals.js';

const LOD_UNIFORMS = /* glsl */ `
uniform vec3 uLodCam;
uniform vec4 uLodRange; // near, near fade width, mid, mid fade width
uniform float uLodMode; // 0: near mesh, 1: mid mesh, 2: always (bakes)
`;

// returns (keep-if-dither-below, keep-if-dither-above) thresholds
const LOD_FADE = /* glsl */ `
vec2 lodFade(vec2 baseXZ) {
  float d = distance(baseXZ, uLodCam.xz);
  float nearT = smoothstep(uLodRange.x - uLodRange.y, uLodRange.x, d);
  float midT = smoothstep(uLodRange.z - uLodRange.w, uLodRange.z, d);
  if (uLodMode < 0.5) return vec2(1.0 - nearT, 0.0);
  if (uLodMode < 1.5) return vec2(1.0 - midT, 1.0 - nearT);
  return vec2(1.0, 0.0);
}
`;

const LOD_DISCARD = /* glsl */ `
  {
    float dth = ign(gl_FragCoord.xy);
    if (dth >= vFade.x || dth < vFade.y) discard;
  }
`;

const TREE_WIND = /* glsl */ `
${GLSL_WIND}
uniform float uSway;
// whole-tree sway (grows with height) for a tree rooted at base
vec2 treeSway(vec3 base, float heightWeight, float scale, out float gust, out float phase) {
  gust = windGust(base.xz);
  phase = hash12(base.xz) * 6.2831853;
  float osc = sin(uTime * 1.25 + phase) * 0.6 + sin(uTime * 2.1 + phase * 1.7) * 0.25;
  return uWind.xy * ((0.42 * gust + 0.2 * osc * gust) * heightWeight * uSway * scale);
}
`;

export const LEAF_VERT = /* glsl */ `
${GLSL_COMMON}
${LOD_UNIFORMS}
${LOD_FADE}
${TREE_WIND}
in vec3 aCorner; // card offsets (m) + mode: 0 billboard, 1 hanging billboard, 2 solid foliage, 3 solid wood
in vec4 aLeaf;   // sway weight, phase, ambient occlusion, tint
out vec2 vUv;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vData; // ao, tint, mode, view distance
out vec2 vFade;
out vec3 vTreeTint;
#if BAKE > 0
out vec3 vViewNormal;
#endif

void main() {
  mat4 im = instanceMatrix;
#ifdef USE_INSTANCING_COLOR
  vTreeTint = instanceColor;
#else
  vTreeTint = vec3(1.0);
#endif
  vec3 base = im[3].xyz;
  float scale = length(im[0].xyz);
  vec3 wp = (im * vec4(position, 1.0)).xyz;
  vec3 n = normalize(mat3(im) * normal);
  vFade = lodFade(base.xz);
  float mode = aCorner.z;
  float gust, phase;
#if BAKE > 0
  gust = 0.0; phase = 0.0;
#else
  wp.xz += treeSway(base, aLeaf.x, scale, gust, phase);
#endif
  float fl = sin(uTime * (2.4 + aLeaf.y * 2.2) + aLeaf.y * 43.0 + phase) * gust;
  if (mode < 1.5) {
    vec3 f = normalize(cameraPosition - wp);
    vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f) + vec3(1e-4, 0.0, 0.0));
    vec3 u = mode > 0.5 ? vec3(0.0, 1.0, 0.0) : cross(f, r);
    vec2 c = aCorner.xy * scale;
#if BAKE == 0
    if (mode > 0.5) {
      // hanging fronds swing like a curtain, more at their free end
      float k = saturate(-c.y / (3.2 * scale));
      wp.xz += uWind.xy * (k * k) * (0.5 * gust + 0.45 * fl) * uSway * 0.55;
      c.x += fl * 0.05 * k;
    } else {
      c += vec2(fl * 0.06, cos(uTime * 1.9 + aLeaf.y * 31.0) * 0.04 * gust);
    }
#endif
    wp += r * c.x + u * c.y;
  } else {
#if BAKE == 0
    // solid foliage (fronds) bobs with its phase; trunks only follow the tree sway
    if (mode < 2.5) wp.y += fl * 0.1 * saturate(aLeaf.y - 0.3);
#endif
  }
  vUv = uv;
  vWorld = wp;
  vNormal = n;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vData = vec4(aLeaf.z, aLeaf.w, mode, -mv.z);
#if BAKE > 0
  vViewNormal = mat3(viewMatrix) * n;
#endif
  gl_Position = projectionMatrix * mv;
}
`;

export const LEAF_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_SHADOW}
${GLSL_LIGHTING}
${GLSL_SURFACE}
uniform sampler2D uLeafTex;
uniform vec3 uLeafTint;
uniform vec3 uBarkColor;
in vec2 vUv;
in vec3 vWorld;
in vec3 vNormal;
in vec4 vData;
in vec2 vFade;
in vec3 vTreeTint;
#if BAKE > 0
in vec3 vViewNormal;
#endif

void main() {
  float mode = vData.z;
  bool wood = mode > 2.5;
  vec4 tex = wood ? vec4(1.0) : texture(uLeafTex, vUv);
  float alpha = tex.a;
  // keep distant crowns full: mip-mapped alpha thins out, so lower the cut with distance
  float cutoff = mix(0.5, 0.22, smoothstep(18.0, 110.0, vData.w));
#if defined(DEPTH_ONLY) || BAKE == 2 || !defined(USE_A2C)
  if (alpha < cutoff) discard;
  #if BAKE == 0
${LOD_DISCARD}
  #endif
#else
  alpha = saturate((alpha - cutoff) / max(fwidth(alpha), 1e-4) + 0.5);
  #if BAKE == 0
  // with multisampling the level-of-detail cross-fade rides on sample coverage (no visible stipple)
  alpha *= saturate(min(vFade.x, 1.0 - vFade.y) * 1.02);
  #endif
  if (alpha < 0.02) discard;
#endif
#ifdef DEPTH_ONLY
  gl_FragColor = vec4(1.0);
#else
  vec3 albedo;
  if (wood) albedo = uBarkColor;
  else {
    albedo = tex.rgb * uLeafTint * vTreeTint;
    albedo = mix(vec3(dot(albedo, vec3(0.3, 0.55, 0.15))), albedo, 0.86);
    // per-clump colour drift: some warmer / lighter, some deeper
    float t = vData.y;
    albedo *= mix(vec3(0.8, 0.88, 0.9), vec3(1.08, 1.04, 0.78), t * t);
  }
  #if BAKE == 1
  gl_FragColor = vec4(albedo, alpha);
  #elif BAKE == 2
  gl_FragColor = vec4(normalize(vViewNormal) * 0.5 + 0.5, vData.x * (wood ? 0.5 : 1.0));
  #else
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float shadow = sunShadow(vWorld, N);
  Surface s;
  s.albedo = albedo; s.N = N; s.Ng = N; s.rough = 0.62; s.ao = vData.x; s.spec = wood ? 0.0 : 0.1; s.sss = wood ? 0.0 : 0.6;
  // foliage self-shadowing is noisy: let ambient occlusion carry part of it
  shadow = mix(shadow, 1.0, wood ? 0.0 : 0.12);
  vec3 col = shadeSurface(s, vWorld, V, shadow);
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col), alpha);
  #endif
#endif
}
`;

export const WOOD_VERT = /* glsl */ `
${GLSL_COMMON}
${LOD_UNIFORMS}
${LOD_FADE}
${TREE_WIND}
in vec3 aWind; // sway weight, branch weight, -
out vec2 vUv;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vFade;
out float vAo;
#if BAKE > 0
out vec3 vViewNormal;
#endif
void main() {
  mat4 im = instanceMatrix;
  vec3 base = im[3].xyz;
  float scale = length(im[0].xyz);
  vec3 wp = (im * vec4(position, 1.0)).xyz;
  vec3 n = normalize(mat3(im) * normal);
  vFade = lodFade(base.xz);
#if BAKE == 0
  float gust, phase;
  wp.xz += treeSway(base, aWind.x, scale, gust, phase);
  wp.xz += vec2(sin(uTime * 2.2 + phase + wp.y * 0.8), cos(uTime * 1.8 + phase * 1.3 + wp.x)) * 0.035 * aWind.y * gust;
#endif
  vUv = uv;
  vWorld = wp;
  vNormal = n;
  // darker where branches disappear into the crown, lighter on the open trunk
  vAo = mix(1.0, 0.55, smoothstep(0.1, 0.6, aWind.y)) * mix(0.75, 1.0, smoothstep(0.0, 1.2, (wp.y - base.y) / scale));
#if BAKE > 0
  vViewNormal = mat3(viewMatrix) * n;
#endif
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const WOOD_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_SHADOW}
${GLSL_LIGHTING}
${GLSL_SURFACE}
uniform sampler2D uBarkTex;
uniform sampler2D uBarkNrm;
in vec2 vUv;
in vec3 vWorld;
in vec3 vNormal;
in vec2 vFade;
in float vAo;
#if BAKE > 0
in vec3 vViewNormal;
#endif
void main() {
#if BAKE == 0
${LOD_DISCARD}
#endif
#ifdef DEPTH_ONLY
  gl_FragColor = vec4(1.0);
#else
  vec3 albedo = texture(uBarkTex, vUv).rgb;
  #if BAKE == 1
  gl_FragColor = vec4(albedo, 1.0);
  #elif BAKE == 2
  gl_FragColor = vec4(normalize(vViewNormal) * 0.5 + 0.5, vAo * 0.6);
  #else
  vec3 N = normalize(vNormal);
  #if QUALITY > 0
  // tangent frame from screen-space derivatives (no stored tangents)
  vec3 dp1 = dFdx(vWorld), dp2 = dFdy(vWorld);
  vec2 du1 = dFdx(vUv), du2 = dFdy(vUv);
  vec3 dp2p = cross(dp2, N), dp1p = cross(N, dp1);
  vec3 T = dp2p * du1.x + dp1p * du2.x, B = dp2p * du1.y + dp1p * du2.y;
  float inv = inversesqrt(max(dot(T, T), dot(B, B)) + 1e-12);
  vec3 nt = texture(uBarkNrm, vUv).xyz;
  vec2 d = (nt.xy * 2.0 - 1.0) * 1.3;
  N = normalize(N + (T * d.x + B * d.y) * inv);
  albedo *= 0.75 + 0.5 * nt.z;
  #endif
  vec3 V = normalize(cameraPosition - vWorld);
  float shadow = sunShadow(vWorld, normalize(vNormal));
  Surface s;
  s.albedo = albedo; s.N = N; s.Ng = N; s.rough = 0.85; s.ao = vAo; s.spec = 0.1; s.sss = 0.0;
  vec3 col = shadeSurface(s, vWorld, V, shadow);
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col), 1.0);
  #endif
#endif
}
`;

// ---------------------------------------------------------------------------
// Impostors: one camera-facing quad per distant tree, textured from an atlas of
// pre-rendered views (4 elevations x 4 looks), relit with the atlas normals.

export const IMPOSTOR_VERT = /* glsl */ `
${GLSL_COMMON}
${LOD_UNIFORMS}
${GLSL_WIND}
in vec4 iPos;  // base xyz, scale
in vec4 iData; // atlas column, tint, phase, -
uniform vec4 uImp; // sphere radius, centre height, elevation frames, columns
out vec2 vUvA;
out vec2 vUvB;
out float vBlend;
out vec3 vWorld;
out vec3 vR;
out vec3 vU;
out vec3 vF;
out vec3 vInfo; // tint, dither weight, distance
void main() {
  float scale = iPos.w;
  vec3 center = iPos.xyz + vec3(0.0, uImp.y * scale, 0.0);
  float d = distance(iPos.xz, uLodCam.xz);
  float w = uLodMode > 1.5 ? 1.0 : smoothstep(uLodRange.z - uLodRange.w, uLodRange.z, d);
  vec3 toCam = cameraPosition - center;
  float dist = length(toCam);
  vec3 f = toCam / dist;
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f) + vec3(1e-4, 0.0, 0.0));
  vec3 u = cross(f, r);
  // gentle whole-crown sway so distant woods are not frozen
  float gust = windGust(iPos.xz);
  float sway = sin(uTime * 1.25 + iData.z * 6.283) * 0.6 * gust * 0.22 * scale * max(position.y + 0.5, 0.0);
  vec3 wp = center + (r * (position.x * 2.0) + u * (position.y * 2.0)) * uImp.x * scale;
  wp.xz += uWind.xy * sway;
  // which pre-rendered elevations to blend
  float elev = asin(clamp(f.y, 0.0, 1.0)) / 1.5707963;
  float e = elev * (uImp.z - 1.0);
  float e0 = floor(e), e1 = min(e0 + 1.0, uImp.z - 1.0);
  vBlend = e - e0;
  vec2 cell = vec2(1.0 / uImp.w, 1.0 / uImp.z);
  vec2 q = position.xy + 0.5;
  vUvA = (vec2(iData.x, e0) + q) * cell;
  vUvB = (vec2(iData.x, e1) + q) * cell;
  vWorld = wp;
  vR = r; vU = u; vF = f;
  vInfo = vec3(iData.y, w, dist);
  gl_Position = w <= 0.001 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

export const IMPOSTOR_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_SHADOW}
${GLSL_LIGHTING}
${GLSL_SURFACE}
uniform sampler2D uAtlas;
uniform sampler2D uAtlasN;
in vec2 vUvA;
in vec2 vUvB;
in float vBlend;
in vec3 vWorld;
in vec3 vR;
in vec3 vU;
in vec3 vF;
in vec3 vInfo;
void main() {
  vec4 a = mix(texture(uAtlas, vUvA), texture(uAtlas, vUvB), vBlend);
  float cutoff = mix(0.45, 0.24, smoothstep(120.0, 500.0, vInfo.z));
  if (a.a < cutoff) discard;
  if (vInfo.y < 0.999 && ign(gl_FragCoord.xy) < 1.0 - vInfo.y) discard;
#ifdef DEPTH_ONLY
  gl_FragColor = vec4(1.0);
#else
  vec4 nt = mix(texture(uAtlasN, vUvA), texture(uAtlasN, vUvB), vBlend);
  vec3 nv = normalize(nt.xyz * 2.0 - 1.0);
  vec3 N = normalize(vR * nv.x + vU * nv.y + vF * nv.z);
  vec3 albedo = a.rgb / max(a.a, 0.25);
  float t = vInfo.x;
  albedo *= mix(vec3(0.86, 0.92, 0.9), vec3(1.12, 1.08, 0.82), t);
  vec3 V = vF;
  float shadow = mix(sunShadow(vWorld, N), 1.0, 0.12);
  Surface s;
  s.albedo = albedo; s.N = N; s.Ng = N; s.rough = 0.65; s.ao = nt.a; s.spec = 0.08; s.sss = 0.6;
  vec3 col = shadeSurface(s, vWorld, V, shadow);
  col = applyFog(col, vWorld, cameraPosition);
  gl_FragColor = vec4(outputColor(col), 1.0);
#endif
}
`;
