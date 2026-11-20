// Rings spreading on the water around swimmers and waders, and the splash of a dive: one instanced mesh.
import * as THREE from 'three';
import { makeMaterial, GLSL_COMMON, GLSL_LIGHTING } from '../../render/globals.js';

const MAX = 64;

const VERT = /* glsl */ `
${GLSL_COMMON}
in vec4 iRing;  // x, y, z, time of birth
in vec3 iShape; // final radius, life, strength
out vec2 vP;
out float vAge;
out float vStrength;
out vec3 vWorld;
void main() {
  float age = (uTime - iRing.w) / iShape.y;
  vAge = age;
  vStrength = iShape.z;
  vP = position.xz;
  float r = age < 0.0 || age > 1.0 ? 0.0 : iShape.x * (0.25 + 0.75 * sqrt(age));
  vWorld = vec3(iRing.x + position.x * r, iRing.y + 0.035, iRing.z + position.z * r);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

const FRAG = /* glsl */ `
${GLSL_COMMON}
${GLSL_LIGHTING}
in vec2 vP;
in float vAge;
in float vStrength;
in vec3 vWorld;
void main() {
  float r = length(vP);
  // a bright crest, a fainter one behind it
  float ring = exp(-pow((r - 0.86) / 0.07, 2.0)) + 0.45 * exp(-pow((r - 0.56) / 0.06, 2.0));
  float a = ring * (1.0 - vAge) * (1.0 - vAge) * vStrength;
  if (a < 0.01) discard;
  vec3 col = (hemiAmbient(vec3(0.0, 1.0, 0.0)) + uSunColor * 0.55) * vec3(0.92, 0.97, 1.0);
  col = applyFog(col, vWorld, cameraPosition);
  a = min(a, 0.8);
  gl_FragColor = vec4(outputColor(col) * a, a);
}
`;

export class Ripples {
  constructor() {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    this.ring = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4).fill(-1e6), 4);
    this.shape = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.ring.setUsage(THREE.DynamicDrawUsage); this.shape.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iRing', this.ring);
    g.setAttribute('iShape', this.shape);
    g.instanceCount = MAX;
    this.mesh = new THREE.Mesh(g, makeMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.visible = false;
    this.mesh.name = 'ripples';
    this.next = 0;
    this.until = 0; // nothing left to draw after that time
    this.timers = new Map();
  }

  /** One ring at (x, z) on water whose surface is at `y`. */
  spawn(time, x, y, z, radius = 1.6, life = 1.5, strength = 0.7) {
    const i = this.next;
    this.next = (i + 1) % MAX;
    this.ring.setXYZW(i, x, y, z, time);
    this.shape.setXYZ(i, radius, life, strength);
    this.ring.needsUpdate = this.shape.needsUpdate = true;
    this.until = Math.max(this.until, time + life);
  }

  /** Someone has just dropped into the water. */
  splash(time, x, y, z, force = 1) {
    const k = Math.min(1.6, 0.7 + force * 0.12);
    this.spawn(time, x, y, z, 2.2 * k, 1.1, 1);
    this.spawn(time + 0.12, x, y, z, 3.4 * k, 1.7, 0.8);
    this.spawn(time + 0.3, x, y, z, 4.6 * k, 2.3, 0.6);
  }

  /**
   * Call every frame for whoever is in the water (`key` tells them apart): rings at a rhythm that follows
   * their speed. `swim`: afloat (otherwise wading).
   */
  trail(key, time, dt, x, y, z, speed, swim) {
    let left = (this.timers.get(key) ?? 0) - dt;
    if (left <= 0) {
      const moving = Math.min(1, speed / 3);
      if (swim) this.spawn(time, x, y, z, 1.3 + 0.9 * moving, 1.5, 0.5 + 0.3 * moving);
      else if (speed > 0.6) this.spawn(time, x, y, z, 0.8 + 0.4 * moving, 1.0, 0.45);
      left = swim ? 0.62 - 0.34 * moving : 0.42;
    }
    this.timers.set(key, left);
  }

  update(time) { this.mesh.visible = time < this.until; }
}
