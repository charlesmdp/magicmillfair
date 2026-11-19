// Water surface shader shared by ponds, streams and the sea (variants via #defines).
import { GLSL_COMMON, GLSL_SHADOW, GLSL_LIGHTING } from '../../render/globals.js';
import { GLSL_SKY } from '../../render/Atmosphere.js';

export const WATER_VERT = /* glsl */ `
${GLSL_COMMON}
in vec4 aFlow; // xz direction, speed, white-water amount
uniform vec3 uCenter;
out vec3 vWorld;
out vec4 vFlow;
out float vWave;

#ifdef SEA
// sum of a few trochoidal waves; amplitude fades out in the shallows
vec3 wave(vec2 xz, vec2 dir, float len, float amp, float speed, inout vec2 slope) {
  float k = 6.2831853 / len;
  float ph = k * dot(dir, xz) - uTime * speed * k;
  float s = sin(ph), c = cos(ph);
  slope += dir * (k * amp * c);
  return vec3(-dir.x * amp * 0.6 * c, amp * s, -dir.y * amp * 0.6 * c);
}
#endif

void main() {
  vec3 p = position + uCenter;
  vFlow = aFlow;
  vWave = 0.0;
#ifdef SEA
  float bed = worldHeightsLod(p.xz).x;
  float inMap = step(abs(p.x), uWorldMap.y) * step(abs(p.z), uWorldMap.y);
  float deep = mix(1.0, smoothstep(0.15, 3.2, -bed), inMap);
  float fade = deep * (1.0 - smoothstep(180.0, 420.0, length(position.xz)));
  vec2 slope = vec2(0.0);
  vec3 d = vec3(0.0);
  d += wave(p.xz, normalize(vec2(-1.0, 0.25)), 31.0, 0.16, 2.6, slope);
  d += wave(p.xz, normalize(vec2(-0.8, -0.5)), 17.0, 0.09, 2.1, slope);
  d += wave(p.xz, normalize(vec2(-0.55, 0.8)), 9.5, 0.05, 1.7, slope);
  d += wave(p.xz, normalize(vec2(-1.0, -0.1)), 5.3, 0.028, 1.4, slope);
  p += d * fade;
  vFlow.xy = slope * fade; // wave slope for the normal
  vWave = d.y * fade;
#endif
  vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const WATER_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_SHADOW}
${GLSL_LIGHTING}
${GLSL_SKY}
uniform sampler2D uRipple1;
uniform sampler2D uRipple2;
uniform sampler2D uFoam;
uniform sampler2D uAux;
uniform sampler2D uReflection;
uniform mat4 uReflMatrix;
uniform vec4 uReflParams; // enabled, plane height, hdr (1) or display-referred (0), strength
uniform vec3 uAbsorb;
uniform vec3 uScatter;
uniform vec4 uRippleParams; // scale1, scale2, strength, speed
in vec3 vWorld;
in vec4 vFlow;
in float vWave;

vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 invTonemap(vec3 y) {
  y = clamp(y, 0.0, 0.985);
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  vec3 A = c * y - a, B = d * y - b, C = e * y;
  return (-B - sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A) / uExposure;
}

// cheaper sky for reflections: gradient + one cloud lookup
vec3 skyReflection(vec3 dir) {
  dir.y = abs(dir.y) + 0.02;
  vec3 col = skyGradient(dir);
  vec2 uv = dir.xz / (dir.y + 0.12) * 0.085 + uTime * uCloudParams.z * vec2(0.8, 0.35);
  float n = texture(uNoiseTex, uv).r * 0.62 + texture(uNoiseTex, uv * 2.7 + 0.37).g * 0.38;
  float cov = smoothstep(uCloudParams.x, uCloudParams.x + uCloudParams.y, n) * smoothstep(0.012, 0.16, dir.y);
  return mix(col, mix(uCloudShade, uCloudColor * 1.15, 0.7) * uCloudParams.w, cov * 0.9);
}

void main() {
  vec3 P = vWorld;
  vec2 hw = worldHeights(P.xz);
  bool inMap = abs(P.x) < uWorldMap.y && abs(P.z) < uWorldMap.y;
  float bed = hw.x;
#ifdef SEA
  if (!inMap) bed = -8.0;
  else if (abs(hw.y) > 0.6) discard; // another water body (or dry land) owns this spot
  float depth = -bed + vWave;
#elif defined(STREAM)
  if (abs(hw.y - P.y) > 2.2) discard; // generous: the level changes fast across a cascade
  float depth = P.y - bed + vFlow.w * 0.5;
#else
  if (abs(hw.y - P.y) > 0.6) discard;
  float depth = P.y - bed;
#endif
  float edge = smoothstep(0.0, 0.07, depth);
  if (edge <= 0.001) discard;

  vec3 toCam = cameraPosition - P;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float gust = 1.0;

  // ---- surface normal
  vec2 nrm;
  float foamFlow = 0.0;
#ifdef STREAM
  // two-phase flow so the ripples travel downstream without visible resets
  vec2 fdir = vFlow.xy;
  float speed = vFlow.z;
  float t = uTime * 0.55;
  float ph0 = fract(t), ph1 = fract(t + 0.5);
  float mixw = abs(1.0 - 2.0 * ph0);
  vec2 base = P.xz * uRippleParams.x * 1.9;
  vec2 adv = fdir * speed * uRippleParams.x * 1.9 * 1.8;
  vec3 r0 = texture(uRipple1, base - adv * ph0).rgb;
  vec3 r1 = texture(uRipple1, base - adv * ph1 + 0.43).rgb;
  vec3 rr = mix(r0, r1, mixw);
  nrm = (rr.rg * 2.0 - 1.0) * (0.55 + 0.9 * min(speed, 2.5) * 0.4) * uRippleParams.z;
  foamFlow = vFlow.w;
#else
  float tt = uTime * uRippleParams.w;
  vec2 w = uWind.xy;
  vec3 r0 = texture(uRipple1, P.xz * uRippleParams.x + w * tt * 0.9).rgb;
  vec3 r1 = texture(uRipple1, P.xz * uRippleParams.x * 1.73 - w.yx * tt * 0.7 + 0.31).rgb;
  vec3 r2 = texture(uRipple2, P.xz * uRippleParams.y + w * tt * 0.35).rgb;
  // wind gusts: patches of ruffled water between mirror-calm areas
  float g1 = texture(uNoiseTex, P.xz * 0.011 + w * uTime * 0.012).r;
  float g2 = texture(uNoiseTex, P.xz * 0.031 - w.yx * uTime * 0.02 + 0.5).r;
  gust = smoothstep(0.32, 0.72, g1 * 0.65 + g2 * 0.35);
  #ifdef SEA
  gust = 0.55 + 0.45 * gust;
  #else
  gust = 0.16 + 0.84 * gust;
  #endif
  nrm = ((r0.rg + r1.rg) - 1.0) * 0.6 + (r2.rg * 2.0 - 1.0) * 0.5;
  nrm *= uRippleParams.z * gust;
  #ifdef SEA
  nrm -= vFlow.xy; // geometric wave slope
  #endif
#endif
  nrm *= 1.0 / (1.0 + dist * 0.012);
  vec3 N = normalize(vec3(nrm.x, 1.0, nrm.y));

  // ---- reflection
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);
  vec3 refl = skyReflection(R);
  if (uReflParams.x > 0.5) {
    // mirror the camera about this surface, follow the mirrored ray a little, look it up in the planar map
    vec3 mirrorCam = vec3(cameraPosition.x, 2.0 * P.y - cameraPosition.y, cameraPosition.z);
    vec3 rdir = normalize(P - mirrorCam);
    float reach = 22.0;
    vec3 Q = P + rdir * reach + vec3(nrm.x, 0.0, nrm.y) * (2.2 + dist * 0.03) * reach * 0.045;
    Q.y += (uReflParams.y - P.y) * 0.0;
    vec4 rc = uReflMatrix * vec4(Q, 1.0);
    vec2 ruv = rc.xy / rc.w;
    if (rc.w > 0.0 && ruv.x > 0.0 && ruv.x < 1.0 && ruv.y > 0.0 && ruv.y < 1.0) {
      vec4 rt = texture(uReflection, ruv);
      vec3 rcol = uReflParams.z > 0.5 ? rt.rgb : invTonemap(srgbToLinear(rt.rgb));
      refl = mix(refl, rcol, rt.a * uReflParams.w);
    }
  }

  float shadow = sunShadow(P, vec3(0.0, 1.0, 0.0));

  // sun glitter
  vec3 Hh = normalize(uSunDir + V);
  float ndh = max(dot(N, Hh), 0.0);
  float glit = pow(ndh, 900.0) * 9.0 + pow(ndh, 120.0) * 0.5;
  vec3 spec = uSunColor * glit * shadow * (0.35 + 0.65 * gust);

  // ---- water body: what is added on top of the (already tinted) bed
  float path = depth / max(ndv, 0.28);
  vec3 trans = exp(-uAbsorb * path * 0.55);
  float tavg = dot(trans, vec3(0.3, 0.5, 0.2));
  vec3 light = hemiAmbient(vec3(0.0, 1.0, 0.0)) * 0.9 + uSunColor * (0.25 + 0.3 * saturate(uSunDir.y)) * (0.3 + 0.7 * shadow);
  vec3 body = uScatter * light * (1.0 - tavg);

  // ---- foam
  float foam = 0.0;
  vec2 fuv = P.xz * 0.35;
  float ftex = texture(uFoam, fuv + N.xz * 0.02).r;
#ifdef SEA
  if (inMap) {
    float shore = texture(uAux, worldUV(P.xz)).g * 16.0; // metres from the shore, inside the water
    // swash: thin lines of foam riding in and dying on the sand
    float band = sin(shore * 0.95 + uTime * 0.85 + ftex * 2.2 + sin(P.z * 0.07) * 2.0) * 0.5 + 0.5;
    float lines = smoothstep(0.82, 1.0, band) * (1.0 - smoothstep(1.0, 11.0, shore));
    float lap = (1.0 - smoothstep(0.0, 0.22 + 0.12 * sin(uTime * 0.9 + P.z * 0.2), depth));
    foam = max(lines * 0.75, lap) * smoothstep(0.25, 0.7, ftex + lap * 0.4);
  }
  foam = max(foam, smoothstep(0.1, 0.24, vWave) * smoothstep(0.45, 0.8, ftex) * 0.5);
#else
  float lap = 1.0 - smoothstep(0.0, 0.1, depth);
  foam = lap * smoothstep(0.35, 0.8, ftex) * 0.5;
  #ifdef STREAM
  float t2 = uTime * 0.9;
  vec2 fa = P.xz * 0.9 - vFlow.xy * vFlow.z * fract(t2) * 1.4;
  vec2 fb = P.xz * 0.9 - vFlow.xy * vFlow.z * fract(t2 + 0.5) * 1.4 + 0.5;
  float fl = mix(texture(uFoam, fa).r, texture(uFoam, fb).r, abs(1.0 - 2.0 * fract(t2)));
  float white = smoothstep(1.0 - foamFlow * 1.05, 1.15 - foamFlow * 0.8, fl + foamFlow * 0.35);
  // streaks along the banks and behind stones in fast water
  float riffle = smoothstep(0.55, 0.95, fl) * smoothstep(0.6, 1.6, vFlow.z) * (1.0 - smoothstep(0.05, 0.4, depth)) * 0.6;
  foam = max(foam, max(white, riffle));
  #endif
#endif
  foam = saturate(foam);

  // ---- compose (premultiplied alpha over the bed)
  float alpha = fres + (1.0 - fres) * (1.0 - tavg);
  vec3 col = refl * fres + body * (1.0 - fres) + spec;
  vec3 foamCol = (hemiAmbient(vec3(0.0, 1.0, 0.0)) + uSunColor * (0.2 + 0.8 * shadow) * saturate(uSunDir.y + 0.2)) * 0.82;
  col = mix(col, foamCol, foam);
  alpha = max(alpha, foam);
  alpha = saturate(alpha + dot(spec, vec3(0.33)));
  // haze applies to the water's own contribution
  vec3 unp = col / max(alpha, 1e-3);
  unp = applyFog(unp, P, cameraPosition);
  alpha *= edge;
  gl_FragColor = vec4(outputColor(unp) * alpha, alpha);
}
`;
