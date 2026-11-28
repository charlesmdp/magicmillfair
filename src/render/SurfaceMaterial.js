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
#if PAINT == 2
out vec3 vObjN; // …and which way the body looks there, at rest (what is drawn flat on a face chooses its plane by it)
#endif
#endif
void main() {
  #ifdef PAINT
  vObj = position;
  #if PAINT == 2
  vObjN = normal;
  #endif
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

// The second set of paint jobs (the tenth and after: PAINTS in server/items.js). They are a program of their
// own — the material is compiled with PAINT 2 for a robot that wears one (Character.setPaint) —, so that the
// robots that wear none, or one of the first nine, are drawn by the program they always were: nothing of these
// is paid for by who does not show them.
//
// Each is drawn on the body at rest, in metres: x to the robot's left, y up from the ground (the top of the
// head is at 1.6), z forward. A paint says what the surface is (colour, roughness, shine), what glows by itself
// (glow), the rim of light round the body (rim), how much of a mirror it is (metal), how much the sun shows in
// its lacquer (gloss), what only glitters in the light (spark) — and where it is at all (mask: the tuxedo
// leaves the head alone).
const GLSL_PAINTS2 = /* glsl */ `
struct Paint { vec3 albedo; float rough; float spec; float mask; vec3 glow; vec3 rim; float metal; float gloss; vec3 spark; };
float pHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float pNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(pHash(i), pHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(pHash(i + vec3(0.0, 1.0, 0.0)), pHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(pHash(i + vec3(0.0, 0.0, 1.0)), pHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(pHash(i + vec3(0.0, 1.0, 1.0)), pHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float pFbm(vec3 p) { return 0.5 * pNoise(p) + 0.3 * pNoise(p * 2.03 + 7.1) + 0.2 * pNoise(p * 4.1 + 13.7); }
// (1 inside a shape whose edge is where d is 0 — d: metres outside it —, over one pixel: w is what a pixel is worth)
float pIn(float d, float w) { return saturate(0.5 - d / w); }
// (the head: everything above the neck)
bool pHead(vec3 q) { return q.y > 1.035 || (q.y > 0.985 && dot(q.xz, q.xz) > 0.01); }
// (how far along a forearm, from the elbow, 0, to the wrist, 1 — the hand is beyond; -1 anywhere else. The two
// arms of the model do not rest quite alike: each has its own line)
float pForearm(vec3 q) {
  if (abs(q.x) < 0.29 || q.y > 0.7 || (q.z < 0.13 && q.y < 0.33)) return -1.0;
  vec3 e = q.x > 0.0 ? vec3(0.322, 0.614, -0.047) : vec3(-0.335, 0.635, 0.024), d = (q.x > 0.0 ? vec3(0.488, 0.324, 0.313) : vec3(-0.463, 0.272, 0.336)) - e;
  return max(0.0, dot(q - e, d) / dot(d, d));
}

// 10 · tuxedo: a dinner suit — black wool, satin lapels round a white shirt front, a bow tie under the chin, a
// carnation, white cuffs and gloves; behind, the collar, the seam of the jacket and its two buttons. The head
// keeps the colour of the robot: a suit is worn, not a skin.
void pTuxedo(vec3 q, float w, inout Paint P) {
  if (pHead(q)) { P.mask = 0.0; return; }
  float ax = abs(q.x);
  vec3 wool = vec3(0.016, 0.017, 0.024), satin = vec3(0.085, 0.086, 0.102), linen = vec3(0.94, 0.94, 0.91);
  vec3 col = wool;
  float shine = 0.0, white = 0.0; // (satin, and linen: each has its own roughness)
  if (ax < 0.207 && q.y > 0.5) {
    // the body: its front…
    float collar = pIn(0.905 - q.y, w);
    if (q.z > 0.0) {
      float k = saturate((q.y - 0.6) / 0.305), half_ = 0.012 + 0.085 * k, lapel = half_ + 0.028 + 0.045 * k * k * (3.0 - 2.0 * k);
      float above = pIn(0.6 - q.y, w);
      float shirt = pIn(ax - half_, w) * above;
      shine = pIn(ax - lapel, w) * above * (1.0 - shirt);
      // (the notch of each lapel, a button where the jacket closes, the edge of its front under it)
      shine *= 1.0 - pIn(abs((q.y - 0.8) - (ax - half_) * 0.7) - 0.0045, w) * step(half_ + 0.02, ax);
      shine = max(shine, pIn(length(vec2(q.x - 0.004, q.y - 0.574)) - 0.017, w));
      col = mix(col, vec3(0.045), pIn(abs(q.x - 0.004) - 0.0025, w) * (1.0 - above));
      // the shirt front: fine pleats, three studs — and the bow tie
      white = shirt;
      float pleat = 0.9 + 0.1 * smoothstep(0.3, 0.5, abs(fract(q.x * 62.0) - 0.5) * 2.0);
      col = mix(col, linen * pleat, shirt);
      float stud = min(min(length(vec2(q.x, q.y - 0.79)), length(vec2(q.x, q.y - 0.725))), length(vec2(q.x, q.y - 0.66))) - 0.0105;
      float tie = max(ax - 0.072, abs(q.y - 0.868) - (0.013 + 0.33 * ax)); // two wings, wider at their ends
      float knot = max(ax - 0.017, abs(q.y - 0.868) - 0.021);
      float black = max(pIn(stud, w) * shirt, pIn(min(tie, knot), w));
      col = mix(col, vec3(0.02, 0.02, 0.026), black);
      shine = max(shine * (1.0 - black), pIn(tie, w) * 0.3);
      white *= 1.0 - black;
      // a carnation on the left lapel
      vec2 fp = vec2(q.x - 0.118, q.y - 0.815);
      float fl = length(fp);
      float petal = pIn(fl - 0.024 - 0.004 * sin(atan(fp.x, fp.y) * 7.0), w);
      col = mix(col, mix(vec3(0.8, 0.03, 0.06), vec3(0.35, 0.0, 0.03), smoothstep(0.004, 0.02, fl) * 0.6 + 0.4 * step(0.5, fract(fl * 90.0))), petal);
      shine *= 1.0 - petal; white *= 1.0 - petal;
    } else {
      // …and its back: the collar of the jacket, its seam, two buttons at the waist
      shine = pIn(0.868 - q.y, w);
      col = mix(col, vec3(0.05), pIn(ax - 0.0028, w) * (1.0 - shine));
      shine = max(shine, pIn(length(vec2(ax - 0.05, q.y - 0.615)) - 0.014, w));
    }
    col = mix(col, linen, collar); white = max(white, collar); shine *= 1.0 - collar;
  } else {
    // the sleeves: a white cuff at the wrist, a white glove after it (a thin line between the two)
    float ta = pForearm(q);
    if (ta > 0.0) {
      float wt = w * 2.05;
      white = pIn(0.84 - ta, wt);
      col = mix(col, linen * (1.0 - 0.55 * pIn(abs(ta - 0.985) - 0.012, wt)), white);
    }
  }
  col = mix(col, satin, shine * (1.0 - white));
  P.albedo = col;
  P.rough = mix(mix(0.82, 0.2, shine), 0.7, white);
  P.spec = mix(mix(0.08, 1.0, shine), 0.18, white);
  P.gloss = shine * 0.5;
}

// 11 · camouflage: woodland, four tones in blotches — and a white star stencilled on the chest, worn
void pCamo(vec3 q, float w, inout Paint P) {
  vec3 c = q * 5.2;
  c += 0.9 * vec3(pNoise(c * 1.7 + 11.0), pNoise(c * 1.7 + 23.0), pNoise(c * 1.7 + 37.0));
  float e = max(w * 5.2 * 1.6, 0.012);
  vec3 col = vec3(0.21, 0.19, 0.1);
  col = mix(col, vec3(0.07, 0.12, 0.038), smoothstep(0.47 - e, 0.47 + e, pNoise(c)));
  col = mix(col, vec3(0.115, 0.064, 0.03), smoothstep(0.6 - e, 0.6 + e, pNoise(c * 1.3 + 41.0)));
  col = mix(col, vec3(0.014, 0.018, 0.014), smoothstep(0.665 - e, 0.665 + e, pNoise(c * 1.9 + 77.0)));
  if (abs(q.x) < 0.2 && q.z > 0.05 && q.y > 0.56 && q.y < 0.86) {
    // the star: five points, 8.5 cm, its paint gone in places
    vec2 sp = vec2(q.x, q.y - 0.7);
    float an = 0.6283185, a = mod(atan(sp.x, sp.y) + an, 2.0 * an) - an, r = length(sp);
    vec2 pt = r * vec2(cos(a), abs(sin(a))), tip = vec2(0.085, 0.0), edge = vec2(0.085 * 0.382 * cos(an), 0.085 * 0.382 * sin(an)) - tip;
    float d = (edge.x * (pt.y - tip.y) - edge.y * (pt.x - tip.x)) / length(edge); // (metres inside the star)
    col = mix(col, vec3(0.62, 0.61, 0.54), pIn(-d, w) * smoothstep(0.2, 0.34, pNoise(q * 38.0)));
  }
  P.albedo = col * (0.9 + 0.2 * pNoise(q * 60.0));
  P.rough = 0.92; P.spec = 0.05;
}

// 12 · tiger: orange, black stripes that swell, thin out and break off, white on the belly and the muzzle
void pTiger(vec3 q, float w, inout Paint P) {
  bool head = pHead(q);
  float ax = abs(q.x);
  // (the stripes go round the body and the limbs; on the head they run back over the skull, from a parting in the middle)
  float s = head ? ax * 10.5 + (q.y - 1.3) * 4.2 - q.z * 1.6 : q.y * 15.5 + ax * 2.2;
  s += (pNoise(q * 4.3) - 0.5) * 2.4 + (pNoise(q * 10.0 + 5.0) - 0.5) * 0.7;
  // white: the front of the body, the muzzle under the eyes, the inside of the legs (the stripes are thinner there)
  float pale = head ? smoothstep(0.12, 0.3, q.z) * (1.0 - smoothstep(1.17, 1.27, q.y)) : ax < 0.207 && q.y > 0.5 ? smoothstep(0.02, 0.13, q.z) : q.y < 0.5 && ax < 0.34 ? (1.0 - smoothstep(0.2, 0.26, ax)) * 0.8 : 0.0;
  float f = abs(fract(s) - 0.5), wide = (0.1 + 0.2 * pNoise(q * 3.3 + 17.0)) * (1.0 - 0.5 * pale);
  float e = max(fwidth(s) * 0.75, 0.02);
  float stripe = (1.0 - smoothstep(wide - e, wide + e, f)) * smoothstep(0.3, 0.42, pNoise(q * 2.6 + 31.0));
  if (head) stripe *= smoothstep(0.03, 0.075, ax); // (the parting)
  vec3 fur = mix(vec3(0.6, 0.08, 0.004), vec3(0.8, 0.155, 0.01), pNoise(q * 2.2 + 3.0));
  fur = mix(fur, vec3(0.9, 0.85, 0.76), pale);
  P.albedo = mix(fur, vec3(0.022, 0.018, 0.016), stripe) * (0.88 + 0.24 * pNoise(q * 70.0));
  P.rough = 0.78; P.spec = 0.12;
  P.rim = vec3(1.0, 0.5, 0.15) * 0.3;
}

// 13 · rust bucket: old teal paint that flakes, rust in bloom where it has gone — more of it low down —, and
// rows of rivets, each weeping a streak of orange
void pRust(vec3 q, float w, inout Paint P) {
  float grain = pNoise(q * 27.0);
  float lvl = pFbm(q * 3.4 + 2.0) + (1.0 - smoothstep(0.0, 1.5, q.y)) * 0.15 + (grain - 0.5) * 0.09;
  float e = max(w * 3.0, 0.004);
  float gone = smoothstep(0.5 - e, 0.5 + e, lvl), lifting = smoothstep(0.482 - e, 0.482 + e, lvl) * (1.0 - gone);
  vec3 paint = mix(vec3(0.028, 0.14, 0.15), vec3(0.06, 0.23, 0.215), pNoise(q * 6.0)) * (0.82 + 0.18 * grain);
  vec3 rust = mix(vec3(0.045, 0.014, 0.007), vec3(0.19, 0.05, 0.012), pNoise(q * 12.0 + 3.0));
  rust = mix(rust, vec3(0.36, 0.12, 0.02), smoothstep(0.62, 0.95, pNoise(q * 21.0 + 9.0)) * 0.5);
  // the rivets: rows round the body, every 23 cm of its height
  float row = floor((q.y - 0.115) / 0.23 + 0.5), dy = q.y - 0.115 - row * 0.23;
  float seg = 6.2831853 / 14.0, rad = length(q.xz), da = (fract(atan(q.x, q.z) / seg + 0.5 * mod(row, 2.0)) - 0.5) * seg * rad;
  float rd = length(vec2(dy, da));
  float rivet = pIn(rd - 0.0125, w), ring = pIn(rd - 0.021, w) * (1.0 - rivet);
  float weep = pIn(abs(da) - 0.004 - 0.007 * saturate(-dy / 0.1), w) * step(dy, 0.0) * (1.0 - smoothstep(0.03, 0.13, -dy)) * (0.55 + 0.45 * pNoise(q * 9.0 + 50.0));
  float seam = pIn(abs(dy) - 0.0022, w) * 0.5; // (the edge of the plate the rivets hold)
  vec3 col = mix(paint, vec3(0.3, 0.29, 0.25), lifting * 0.6);
  col = mix(col, rust, gone);
  col = mix(col, col * 0.4, seam);
  col = mix(col, vec3(0.3, 0.1, 0.02), max(weep * 0.85, ring * 0.9) * (1.0 - gone * 0.6));
  col = mix(col, vec3(0.27, 0.26, 0.24) * (0.75 + 0.5 * grain), rivet);
  float metal = max(gone, max(weep, ring)) * (1.0 - rivet);
  P.albedo = col;
  P.rough = mix(mix(0.55, 0.96, metal), 0.4, rivet);
  P.spec = mix(mix(0.3, 0.03, metal), 0.6, rivet);
}

// (points scattered one to a cell: how far the nearest is, how far the second, and a number of its own for the nearest)
vec3 pCells(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  float d1 = 9.0, d2 = 9.0, id = 0.0;
  for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) for (int c = -1; c <= 1; c++) {
    vec3 g = vec3(float(a), float(b), float(c)), o = vec3(pHash(i + g), pHash(i + g + 19.7), pHash(i + g + 43.3)), r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = o.x; } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}

// 14 · deep frost: blocks of blue ice — each its own depth of blue —, white where they have cracked apart, rime
// along the cracks, snow on whatever faces the sky, crystals that catch the sun
void pFrost(vec3 q, vec3 N, vec3 V, float t, inout Paint P) {
  vec3 cells = pCells(q * 5.6 + 0.35 * vec3(pNoise(q * 9.0), pNoise(q * 9.0 + 5.0), pNoise(q * 9.0 + 11.0)));
  float gap = cells.y - cells.x;
  // (a block is deeper blue in its middle than by its cracks, where the light scatters)
  vec3 ice = mix(vec3(0.09, 0.3, 0.55), vec3(0.008, 0.06, 0.25), saturate(cells.z * 0.6 + 0.6 * smoothstep(0.0, 0.55, gap)));
  float crack = (1.0 - smoothstep(0.01, 0.04, gap)) + (1.0 - smoothstep(0.0, 0.2, gap)) * smoothstep(0.4, 0.8, pNoise(q * 46.0)) * 0.55;
  float snow = smoothstep(0.5, 0.74, N.y + (pNoise(q * 10.0) - 0.5) * 0.5);
  // (ice seen edge-on is white: the light does not get through it)
  float edge = pow(1.0 - saturate(dot(N, V)), 3.0);
  vec3 col = mix(ice, vec3(0.6, 0.78, 0.92), saturate(crack + edge * 0.5));
  P.albedo = mix(col, vec3(0.86, 0.9, 0.96), snow);
  P.rough = mix(0.1, 0.88, snow); P.spec = mix(1.0, 0.12, snow);
  P.gloss = (1.0 - snow) * 1.2;
  P.glow = ice * 0.3 * (1.0 - snow);
  P.rim = vec3(0.4, 0.75, 1.0) * 0.7;
  vec3 cell = floor(q * 170.0);
  float rnd = pHash(cell);
  P.spark = vec3(0.85, 0.95, 1.0) * step(0.972, rnd) * pow(saturate(sin(rnd * 97.0 + t * 1.9 + dot(V, vec3(9.0, 5.0, 7.0)) * 6.0)), 6.0) * 2.8;
}

// 15 · holographic: a foil that shows every colour, sliding over the body as it — or the eye — moves
void pHolo(vec3 q, vec3 N, vec3 V, float t, inout Paint P) {
  // (the foil is laid in shards, each tilted its own way: the rainbow breaks from one to the next)
  vec3 g = q * 7.5 + 0.8 * vec3(pNoise(q * 5.0), pNoise(q * 5.0 + 7.0), pNoise(q * 5.0 + 13.0));
  vec3 cell = floor(vec3(g.x + g.y, g.y - g.x + g.z, g.z + 0.5 * g.x));
  float rnd = pHash(cell);
  float film = dot(N, V) * 1.5 + dot(q, vec3(0.9, 1.6, 0.6)) * 1.25 + rnd * 0.3 + t * 0.06;
  vec3 hue = 0.5 + 0.5 * cos(6.2831853 * (film + vec3(0.0, 0.33, 0.67)));
  P.albedo = mix(vec3(0.62, 0.64, 0.68), hue * hue * 1.2, 0.84);
  P.rough = 0.1; P.spec = 1.0;
  P.metal = 1.0;
  P.rim = (0.5 + 0.5 * cos(6.2831853 * (film + 0.4 + vec3(0.0, 0.33, 0.67)))) * 0.45;
  vec3 gr = floor(q * 190.0);
  float r2 = pHash(gr);
  P.spark = (0.5 + 0.5 * cos(6.2831853 * (r2 * 9.0 + vec3(0.0, 0.33, 0.67)))) * step(0.978, r2) * pow(saturate(sin(r2 * 97.0 + t * 2.2 + dot(V, vec3(9.0, 5.0, 7.0)) * 6.0)), 6.0) * 2.4;
}

// 16 · circuit board: a green board on every face of the body, gold traces from pad to pad — straight runs,
// corners cut at 45 degrees —, signals that run along them, chips, and a few lamps that blink
void pCircuit(vec3 q, vec3 n, float w, float t, inout Paint P) {
  vec3 an = abs(n);
  // (each face is a board of its own, laid flat on it)
  float side = an.y > max(an.x, an.z) ? 0.0 : an.x > an.z ? 1.0 : 2.0;
  vec2 uv = (side < 0.5 ? q.xz : side < 1.5 ? q.zy : q.xy) / 0.072;
  vec2 id = floor(uv), f = fract(uv) - 0.5;
  float px = w / 0.072, o = side * 37.0;
  // (a trace crosses a side of a square or not: the two squares that share the side agree)
  float N_ = step(0.42, hash12(id + vec2(0.0, 1.0) + o)), S_ = step(0.42, hash12(id + o));
  float E_ = step(0.42, hash12(vec2(id.x + 1.0, id.y) * 1.31 + 57.0 + o)), W_ = step(0.42, hash12(id * 1.31 + 57.0 + o));
  float count = N_ + S_ + E_ + W_, rnd = hash12(id * 3.7 + 5.0 + o);
  float d = 9.0;
  if (count > 1.5 && count < 2.5 && N_ + S_ > 0.5 && N_ + S_ < 1.5) {
    // a corner: cut straight from the middle of one side to the middle of the other
    vec2 a = vec2(0.0, N_ > 0.5 ? 0.5 : -0.5), b = vec2(E_ > 0.5 ? 0.5 : -0.5, 0.0), ab = b - a;
    d = length(f - a - ab * saturate(dot(f - a, ab) / dot(ab, ab)));
  } else {
    if (N_ > 0.5) d = min(d, length(f - vec2(0.0, clamp(f.y, 0.0, 0.5))));
    if (S_ > 0.5) d = min(d, length(f - vec2(0.0, clamp(f.y, -0.5, 0.0))));
    if (E_ > 0.5) d = min(d, length(f - vec2(clamp(f.x, 0.0, 0.5), 0.0)));
    if (W_ > 0.5) d = min(d, length(f - vec2(clamp(f.x, -0.5, 0.0), 0.0)));
  }
  float trace = pIn(d - 0.085, px);
  // where a trace ends, or three meet: a pad — a ring of gold round its hole — or a lamp
  float r = length(f), ends = step(count, 1.5) * step(0.5, count) + step(2.5, count);
  float lamp = ends * step(0.62, rnd) * step(count, 1.5);
  float pad = pIn(r - 0.2, px) * ends, hole = pIn(r - 0.085, px) * ends * (1.0 - lamp);
  // where nothing passes: a chip, black, with its legs and its mark
  float chip = step(count, 0.5) * step(rnd, 0.75);
  float body_ = pIn(max(abs(f.x) - 0.33, abs(f.y) - 0.2), px) * chip;
  float legs = pIn(max(abs(f.x) - 0.3, abs(abs(f.y) - 0.27) - 0.07), px) * step(0.5, fract(f.x * 7.0 + 0.25)) * chip;
  vec3 board = vec3(0.004, 0.07, 0.028) * (0.8 + 0.4 * pNoise(q * 9.0));
  board *= 1.0 - 0.3 * pIn(d - 0.13, px) * (1.0 - trace); // (the lacquer is darker along a trace)
  vec3 gold = vec3(0.95, 0.66, 0.2);
  float metal = max(max(trace, pad), legs) * (1.0 - hole) * (1.0 - body_);
  vec3 col = mix(board, gold, max(trace, pad));
  col = mix(col, vec3(0.75, 0.76, 0.78), legs);
  col = mix(col, vec3(0.012), max(hole, body_));
  col = mix(col, vec3(0.8), body_ * pIn(length(f - vec2(-0.24, 0.11)) - 0.035, px));
  // a signal: a bright point that runs along the traces
  float run = pow(saturate(sin(dot(uv, vec2(1.9, 1.3)) - t * 2.6 + rnd * 1.5)), 14.0) * trace;
  vec3 led = rnd > 0.87 ? vec3(1.0, 0.12, 0.08) : rnd > 0.74 ? vec3(1.0, 0.6, 0.05) : vec3(0.1, 1.0, 0.3);
  float bulb = lamp * pIn(r - 0.13, px);
  col = mix(col, led * 0.5, bulb);
  P.albedo = col;
  P.rough = mix(0.5, 0.25, metal); P.spec = mix(0.5, 1.0, metal);
  P.gloss = 0.5 + metal;
  P.glow = vec3(1.0, 0.85, 0.5) * run * 1.5 + led * bulb * (0.25 + 0.75 * step(0.0, sin(t * (1.0 + rnd * 3.0) + rnd * 40.0))) * 2.2;
  P.rim = vec3(0.1, 0.8, 0.3) * 0.3;
}

// 17 · marble and gold: white stone, grey veins that wander through it, and its cracks mended with gold
void pMarble(vec3 q, float w, vec3 V, float t, inout Paint P) {
  vec3 c = q * 1.9;
  vec3 wq = c + 1.3 * vec3(pFbm(c + 3.1), pFbm(c + 9.7), pFbm(c + 17.3));
  float a = (wq.x * 0.9 + wq.y * 0.7 + wq.z * 0.8) * 7.0;
  // (the great veins, and the fine ones between them: each comes and goes, swells and thins — no two run alike)
  float v = abs(sin(a)), v2 = abs(sin(a * 2.3 + 1.7 + pNoise(wq * 2.0) * 3.0));
  float here = smoothstep(0.3, 0.55, pNoise(wq * 1.1 + 5.0)), there = smoothstep(0.45, 0.6, pNoise(wq * 1.7 + 15.0));
  float vein = (1.0 - smoothstep(0.0, 0.1 + 0.25 * pNoise(wq * 2.3 + 8.0), v)) * here, fine = (1.0 - smoothstep(0.0, 0.1, v2)) * 0.5 * there;
  float cloud = max(pow(1.0 - v, 2.5) * here, smoothstep(0.45, 0.8, pFbm(c * 1.5 + 20.0)) * 0.7);
  float g = abs(pNoise(q * 3.6 + 31.0) - 0.5), e = max(w * 5.0, 0.003);
  float gold = 1.0 - smoothstep(0.028 - e, 0.028 + e, g);
  vec3 stone = mix(vec3(0.7, 0.69, 0.66), vec3(0.33, 0.35, 0.4), cloud * 0.7);
  stone = mix(stone, vec3(0.07, 0.085, 0.12), max(vein * 0.85, fine)) * (0.96 + 0.08 * pNoise(q * 45.0));
  P.albedo = mix(stone, vec3(1.0, 0.66, 0.18), gold);
  P.rough = mix(0.16, 0.2, gold); P.spec = 1.0;
  P.metal = gold;
  P.gloss = 1.4 * (1.0 - gold);
  P.rim = vec3(0.3, 0.3, 0.32);
  vec3 cell = floor(q * 200.0);
  float rnd = pHash(cell);
  P.spark = vec3(1.0, 0.9, 0.6) * gold * step(0.9, rnd) * pow(saturate(sin(rnd * 97.0 + t * 2.4 + dot(V, vec3(9.0, 5.0, 7.0)) * 6.0)), 6.0) * 2.4;
}

// 18 · last sunset: the sky of an evening from the first stars down to the embers, streaks of cloud that
// drift round, the sun going into the sea on the chest — and the sea below the belt, with its path of light
void pSunset(vec3 q, float w, float t, inout Paint P) {
  float y = q.y, th = atan(q.x, q.z);
  vec3 sky = mix(vec3(1.0, 0.3, 0.025), vec3(0.92, 0.13, 0.1), smoothstep(0.54, 0.82, y));
  sky = mix(sky, vec3(0.72, 0.08, 0.38), smoothstep(0.8, 1.12, y));
  sky = mix(sky, vec3(0.27, 0.06, 0.5), smoothstep(1.1, 1.36, y));
  sky = mix(sky, vec3(0.018, 0.028, 0.16), smoothstep(1.32, 1.56, y));
  float cl = pNoise(vec3(th * 1.5 + t * 0.035, y * 13.0, length(q.xz) * 2.0 + 3.0));
  float cloud = smoothstep(0.56, 0.72, cl) * smoothstep(0.62, 0.8, y) * (1.0 - smoothstep(1.22, 1.42, y));
  sky = mix(sky, mix(vec3(0.16, 0.03, 0.2), vec3(1.0, 0.5, 0.2), smoothstep(0.74, 0.88, cl)), cloud * 0.85);
  // the first stars, up where it is night already
  vec3 cell = floor(q * 60.0);
  float rnd = pHash(cell);
  float star = step(0.972, rnd) * smoothstep(1.3, 1.5, y) * (0.5 + 0.5 * sin(t * (1.5 + rnd * 4.0) + rnd * 60.0));
  // the sun, half in the sea already (the belt is the horizon), cut in the bands of an old poster
  float front = step(0.02, q.z) * step(abs(q.x), 0.207) * step(0.5, y);
  float sd = length(vec2(q.x, y - 0.6));
  float disc = pIn(sd - 0.14, w) * front;
  disc *= 1.0 - pIn(abs(fract((y - 0.55) * 24.0) - 0.5) - (0.2 - (y - 0.56) * 2.4), w * 24.0) * step(y, 0.66);
  float halo = front * exp(-max(sd - 0.14, 0.0) * 13.0);
  // the sea: dark, and on what faces forward the light of the sun in broken lines that come and go
  float sea = 1.0 - smoothstep(0.5, 0.53, y);
  vec3 water = mix(vec3(0.012, 0.01, 0.07), vec3(0.2, 0.045, 0.17), smoothstep(0.05, 0.52, y));
  float line = floor(y * 30.0);
  float path = step(0.45, fract(y * 30.0)) * step(0.5, pNoise(vec3(q.x * 30.0 + t * 0.5, line * 3.1, t * 0.7 + line))) * smoothstep(0.0, 0.06, q.z) * (0.35 + 0.65 * smoothstep(0.0, 0.5, y));
  vec3 col = mix(sky + vec3(1.0, 0.55, 0.12) * halo * 0.55, water, sea);
  col = mix(col, vec3(1.0, 0.8, 0.3), disc);
  // (a sky is not lit: it glows — as bright in the shade as in the sun)
  P.albedo = col * 0.2;
  P.rough = 0.55; P.spec = 0.25;
  P.gloss = 0.3;
  P.glow = col * 0.5 + vec3(1.0, 0.75, 0.3) * disc * 0.6 + vec3(1.0, 0.5, 0.15) * path * sea * 0.8 + vec3(1.0, 0.95, 0.85) * star * 2.4;
  P.rim = mix(vec3(1.0, 0.4, 0.12), vec3(0.4, 0.25, 1.0), smoothstep(0.9, 1.4, y)) * 0.4;
}
`;

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
// A paint job on an avatar — x: which (its number in PAINTS, server/items.js: 0 none, 1 gold, 2 chrome…), y:
// seconds, z: metres per unit of the body at rest. It covers what takes the colour of the player (the alpha of
// the vertex). PAINT is 1 for the first nine, drawn below; 2 for those that came after (GLSL_PAINTS2).
uniform vec4 uPaint;
in vec3 vObj;
#if PAINT == 2
in vec3 vObjN;
${GLSL_PAINTS2}
#endif
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
  #if PAINT == 2
  Paint P = Paint(albedo, rough, spec, 1.0, vec3(0.0), vec3(0.0), 0.0, 0.0, vec3(0.0));
  {
    float pw = max(length(fwidth(pq)), 1e-5), pt = uPaint.y; // (what a pixel is worth on the body, in metres: edges are drawn over one)
    vec3 pN = normalize(vNormal), pV = normalize(cameraPosition - vWorld);
    if (pk > 17.5) pSunset(pq, pw, pt, P);
    else if (pk > 16.5) pMarble(pq, pw, pV, pt, P);
    else if (pk > 15.5) pCircuit(pq, normalize(vObjN), pw, pt, P);
    else if (pk > 14.5) pHolo(pq, pN, pV, pt, P);
    else if (pk > 13.5) pFrost(pq, pN, pV, pt, P);
    else if (pk > 12.5) pRust(pq, pw, P);
    else if (pk > 11.5) pTiger(pq, pw, P);
    else if (pk > 10.5) pCamo(pq, pw, P);
    else if (pk > 9.5) pTuxedo(pq, pw, P);
    else P.mask = 0.0;
  }
  pm *= P.mask;
  albedo = mix(albedo, P.albedo, pm); rough = mix(rough, P.rough, pm); spec = mix(spec, P.spec, pm);
  #else
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
    #if PAINT == 2
    if (P.metal > 0.001) {
      // what is polished to a mirror — the holographic foil, the gold in the marble: the sky, the white line of
      // the horizon and the dark of the ground in it, in its own colour
      float band = exp(-abs(R.y - 0.04) * 12.0);
      vec3 env = mix(vec3(0.045, 0.05, 0.04), mix(vec3(0.82, 0.9, 1.0), vec3(0.2, 0.36, 0.78), smoothstep(0.0, 0.85, R.y)), smoothstep(-0.03, 0.02, R.y)) + vec3(1.4) * band;
      vec3 metal = col * 0.06 + albedo * (env * s.ao * (0.85 + 0.9 * fres) + uSunColor * (pow(sun, 90.0) * 3.2 + pow(sun, 8.0) * 0.4) * shadow);
      col = mix(col, metal, P.metal * pm);
    }
    // the sun in a lacquer, the rim of light round the body, what glows by itself, what glitters in the light
    col += (uSunColor * pow(sun, 70.0) * P.gloss * shadow + P.rim * fres * (0.3 + 0.7 * s.ao) + P.glow + P.spark * (0.3 + 0.7 * shadow) * s.ao) * pm;
    #else
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
    #endif
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
 *   paint: an avatar's paint jobs (the uniform uPaint says which). The first nine — gold, chrome, atomic,
 *          candy, meltdown, plasma, hazard stripes, mirror ball, galaxy — are in the program the material is
 *          made with; those that came after are another program, PAINT 2 (see paintSet)
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

/** The paint jobs from this number on are the second set: a program of their own (GLSL_PAINTS2). */
export const SECOND_PAINTS = 10;
/**
 * Makes a material made with `paint: true` the one that draws paint number `paint`: its program is the one of
 * the set that paint is in (compiled the first time a robot wears one of that set, kept from then on).
 */
export function paintSet(mat, paint) {
  const set = paint >= SECOND_PAINTS ? 2 : 1;
  if (mat.defines.PAINT === set) return;
  mat.userData.baseDefines.PAINT = mat.defines.PAINT = set; // (baseDefines: what a change of quality builds the defines from again)
  mat.needsUpdate = true;
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
