// Sun, sky and haze: one place defines the lighting mood of the whole world.
import * as THREE from 'three';
import { G, makeMaterial, GLSL_COMMON, GLSL_LIGHTING } from './globals.js';

G.uSkyZenith = { value: new THREE.Color() };
G.uSkyHorizon = { value: new THREE.Color() };
G.uCloudParams = { value: new THREE.Vector4(0.44, 0.22, 0.004, 1.0) }; // coverage threshold, softness, drift speed, brightness
G.uCloudColor = { value: new THREE.Color() };
G.uCloudShade = { value: new THREE.Color() };

const DEG = Math.PI / 180;

/** Warm, clear late-morning light. Colours are linear. */
export const LOOK = {
  sunAzimuth: 152, // degrees clockwise from north (-Z)
  sunElevation: 43,
  sunColor: [1.0, 0.93, 0.8],
  sunIntensity: 3.3,
  skyZenith: [0.15, 0.36, 0.78],
  skyHorizon: [0.62, 0.78, 0.95],
  ambientSky: [0.5, 0.66, 0.95],
  ambientSkyIntensity: 0.95,
  ambientGround: [0.36, 0.33, 0.2],
  ambientGroundIntensity: 0.42,
  fogColor: [0.62, 0.76, 0.93],
  fogSunColor: [1.0, 0.88, 0.7],
  fogDensity: 0.00105,
  fogFalloff: 0.022,
  fogBase: 6,
  cloudColor: [1.0, 0.97, 0.92],
  cloudShade: [0.62, 0.7, 0.84],
  exposure: 1.0,
};

export function applyLook(look = LOOK) {
  const a = look.sunAzimuth * DEG, e = look.sunElevation * DEG;
  G.uSunDir.value.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).normalize();
  G.uSunColor.value.setRGB(...look.sunColor).multiplyScalar(look.sunIntensity);
  G.uSkyColor.value.setRGB(...look.ambientSky).multiplyScalar(look.ambientSkyIntensity);
  G.uGroundColor.value.setRGB(...look.ambientGround).multiplyScalar(look.ambientGroundIntensity);
  G.uFogColor.value.setRGB(...look.fogColor);
  G.uFogSunColor.value.setRGB(...look.fogSunColor);
  G.uFogParams.value.set(look.fogDensity, look.fogFalloff, look.fogBase, 0);
  G.uSkyZenith.value.setRGB(...look.skyZenith);
  G.uSkyHorizon.value.setRGB(...look.skyHorizon);
  G.uCloudColor.value.setRGB(...look.cloudColor);
  G.uCloudShade.value.setRGB(...look.cloudShade);
  G.uExposure.value = look.exposure;
}

/** Sky radiance along a direction (shared by the dome and by the water reflections). */
export const GLSL_SKY = /* glsl */ `
uniform vec3 uSkyZenith;
uniform vec3 uSkyHorizon;
uniform vec4 uCloudParams;
uniform vec3 uCloudColor;
uniform vec3 uCloudShade;
uniform sampler2D uNoiseTex;

vec3 skyGradient(vec3 dir) {
  float h = saturate(dir.y);
  vec3 col = mix(uSkyHorizon, uSkyZenith, pow(h, 0.5));
  float sd = saturate(dot(dir, uSunDir));
  // warm haze around the sun, stronger near the horizon
  col += uFogSunColor * (pow(sd, 6.0) * 0.16 + pow(sd, 40.0) * 0.35) * (1.0 - 0.6 * h);
  // below the horizon: haze colour (hides the edge of the world)
  col = mix(col, uFogColor, smoothstep(0.0, -0.08, dir.y));
  return col;
}

float cloudDensity(vec2 uv) {
  float n = texture(uNoiseTex, uv).r * 0.62 + texture(uNoiseTex, uv * 2.7 + 0.37).g * 0.28 + texture(uNoiseTex, uv * 7.3).b * 0.1;
  return n;
}

vec3 skyRadiance(vec3 dir, float detail) {
  vec3 col = skyGradient(dir);
  if (dir.y > 0.012) {
    vec2 uv = dir.xz / (dir.y + 0.12) * 0.085 + uTime * uCloudParams.z * vec2(0.8, 0.35);
    float n = cloudDensity(uv);
    float cov = smoothstep(uCloudParams.x, uCloudParams.x + uCloudParams.y, n);
    if (cov > 0.001) {
      // cheap self shadowing: density a little further towards the sun
      float n2 = cloudDensity(uv + uSunDir.xz * 0.018);
      float lit = saturate(0.62 + (n - n2) * 4.5 * detail);
      float sd = saturate(dot(dir, uSunDir));
      vec3 cc = mix(uCloudShade, uCloudColor * 1.25, lit);
      cc += uFogSunColor * pow(sd, 5.0) * 0.5 * (1.0 - cov * 0.5); // silver lining
      float fade = smoothstep(0.012, 0.16, dir.y);
      col = mix(col, cc * uCloudParams.w, cov * fade * 0.94);
    }
  }
  return col;
}
`;

const SKY_VERT = /* glsl */ `
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
out vec3 vDir;
void main() {
  vec4 p = uProjInv * vec4(position.xy, 1.0, 1.0);
  vDir = mat3(uCamWorld) * (p.xyz / p.w);
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
${GLSL_SKY}
in vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  vec3 col = skyRadiance(dir, 1.0);
  float sd = dot(dir, uSunDir);
  col += uSunColor * (smoothstep(0.99955, 0.99985, sd) * 4.0 + pow(saturate(sd), 900.0) * 1.2);
  gl_FragColor = vec4(outputColor(col), 1.0);
}
`;

export class Sky {
  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.uniforms = { uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() } };
    this.material = makeMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000; // after the opaque world: only the visible sky pixels are shaded
    this.mesh.name = 'sky';
    this.mesh.onBeforeRender = (renderer, scene, camera) => {
      this.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
      this.uniforms.uCamWorld.value.copy(camera.matrixWorld);
    };
  }
}
