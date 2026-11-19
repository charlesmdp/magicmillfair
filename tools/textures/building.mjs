// Building materials: rubble stone walls, granite, slate roofing, timber, paving, asphalt...
import { field, normalize01, saveMaterial, fbm, perlin, worley, mulberry32, clamp, lerp, smoothstep, mix3 } from '../lib/tex.mjs';

const S = 1024;

/**
 * Coursed masonry / tiling generator (tileable).
 * Stones are laid in rows; every stone gets its own colour, height and a bevelled edge.
 */
function masonry(seed, o) {
  const rnd = mulberry32(seed);
  // rows
  const rows = [];
  let y = 0;
  while (y < S - o.courseH[0] * 0.6) {
    let h = lerp(o.courseH[0], o.courseH[1], rnd());
    if (S - (y + h) < o.courseH[0] * 0.6) h = S - y;
    rows.push({ y0: y, y1: Math.min(S, y + h) });
    y += h;
  }
  rows[rows.length - 1].y1 = S;
  rows.forEach((r, ri) => {
    const edges = [];
    let x = o.regular ? ((ri % 2) * o.stoneW[0]) / 2 : rnd() * o.stoneW[1];
    const start = x;
    while (x < start + S - o.stoneW[0] * 0.5) {
      edges.push(x);
      x += o.regular ? o.stoneW[0] : lerp(o.stoneW[0], o.stoneW[1], Math.pow(rnd(), o.widthBias || 1));
    }
    edges.push(start + S);
    r.edges = edges;
    r.stones = edges.slice(0, -1).map(() => ({ c: rnd(), s: rnd(), h: rnd(), t: rnd(), k: rnd() }));
  });
  const rowAt = (yy) => { for (let i = 0; i < rows.length; i++) if (yy < rows[i].y1) return i; return rows.length - 1; };
  const colour = new Float32Array(S * S * 3), height = new Float32Array(S * S);
  for (let py = 0, i = 0; py < S; py++) for (let px = 0; px < S; px++, i++) {
    const u = px / S, v = py / S;
    const wx = px + o.wobble * (perlin(u * 9, v * 9, seed + 1, 9) + 0.5 * perlin(u * 31, v * 31, seed + 2, 31));
    const wy = py + o.wobble * (perlin(u * 9 + 5.2, v * 9, seed + 3, 9) + 0.5 * perlin(u * 31, v * 31 + 3.1, seed + 4, 31));
    const yy = ((wy % S) + S) % S;
    const ri = rowAt(yy);
    const r = rows[ri];
    let xx = (((wx - r.edges[0]) % S) + S) % S + r.edges[0];
    let si = 0;
    while (si < r.stones.length - 1 && xx >= r.edges[si + 1]) si++;
    const st = r.stones[si];
    const dx = Math.min(xx - r.edges[si], r.edges[si + 1] - xx), dy = Math.min(yy - r.y0, r.y1 - yy);
    const d = Math.min(dx, dy);
    const joint = o.joint * (0.7 + 0.6 * st.k);
    const inStone = smoothstep(joint * 0.5, joint * 0.5 + 1.5, d);
    const bevel = smoothstep(joint * 0.5, joint * 0.5 + o.bevel, d);
    const grainN = o.grain
      ? perlin(u * o.grain[0], v * o.grain[1], seed + 7 + ((ri * 7 + si) % 5), 0) * 0.6 + perlin(u * o.grain[0] * 3, v * o.grain[1] * 3, seed + 8, 0) * 0.4
      : perlin(u * 90, v * 90, seed + 7, 90) * 0.55 + perlin(u * 28, v * 28, seed + 8, 28) * 0.45;
    const big = fbm(u * 3, v * 3, { seed: seed + 9, octaves: 3, period: 3 });
    const base = o.palette[Math.floor(st.c * o.palette.length) % o.palette.length];
    const shade = 1 + (st.s - 0.5) * o.colorVar + grainN * (o.grainAmp ?? 0.12) + big * 0.08;
    let c = [base[0] * shade, base[1] * shade, base[2] * shade];
    if (o.stain) c = mix3(c, o.stain, smoothstep(0.1, 0.5, fbm(u * 5 + st.t, v * 5, { seed: seed + 11, octaves: 3, period: 0 }) * (0.5 + st.t)) * 0.45);
    let h = bevel * (0.72 + o.heightVar * (st.h - 0.5)) + grainN * 0.05;
    if (o.lap) {
      // roofing: every tile is proud at its lower edge and tucked under the row above
      const t = (yy - r.y0) / (r.y1 - r.y0);
      h = inStone * (0.35 + 0.6 * t) + grainN * 0.03;
      c = c.map((k) => k * (0.86 + 0.2 * t));
    }
    c = mix3(o.mortar, c, inStone);
    colour[i * 3] = c[0]; colour[i * 3 + 1] = c[1]; colour[i * 3 + 2] = c[2];
    height[i] = clamp(lerp(o.mortarH ?? 0.15, h, inStone));
  }
  return { colour, height };
}

function speckled(seed, { base, dark, light, scale = 1 }) {
  const colour = new Float32Array(S * S * 3), height = new Float32Array(S * S);
  for (let py = 0, i = 0; py < S; py++) for (let px = 0; px < S; px++, i++) {
    const u = px / S, v = py / S;
    const big = fbm(u * 3, v * 3, { seed, octaves: 4, period: 3 });
    const g1 = perlin(u * 210 * scale, v * 210 * scale, seed + 1, Math.round(210 * scale));
    const g2 = perlin(u * 90 * scale, v * 90 * scale, seed + 2, Math.round(90 * scale));
    const w = worley(u * 70 * scale, v * 70 * scale, seed + 3, Math.round(70 * scale), 1);
    let c = base.map((k) => k * (1 + big * 0.14 + g2 * 0.07));
    c = mix3(c, dark, smoothstep(0.25, 0.6, g1) * 0.5);
    c = mix3(c, light, smoothstep(0.18, 0.05, w.f1) * (w.id > 0.6 ? 0.7 : 0));
    colour[i * 3] = c[0]; colour[i * 3 + 1] = c[1]; colour[i * 3 + 2] = c[2];
    height[i] = clamp(0.5 + big * 0.25 + g1 * 0.08 + g2 * 0.1);
  }
  return { colour, height };
}

function asphalt(seed) {
  const colour = new Float32Array(S * S * 3), height = new Float32Array(S * S);
  for (let py = 0, i = 0; py < S; py++) for (let px = 0; px < S; px++, i++) {
    const u = px / S, v = py / S;
    const w = worley(u * 120, v * 120, seed, 120, 1), w2 = worley(u * 52, v * 52, seed + 1, 52, 1);
    const big = fbm(u * 3, v * 3, { seed: seed + 2, octaves: 4, period: 3 });
    const agg = smoothstep(0.34, 0.1, w.f1), agg2 = smoothstep(0.3, 0.12, w2.f1) * (w2.id > 0.7 ? 1 : 0);
    const crack = smoothstep(0.022, 0.0, w2.f2 - w2.f1) * smoothstep(0.1, 0.4, big);
    let c = mix3([44, 44, 46], [86, 84, 82], agg * (0.3 + 0.7 * w.id));
    c = mix3(c, [128, 122, 112], agg2 * 0.7);
    c = c.map((k) => k * (1 + big * 0.2));
    c = mix3(c, [26, 26, 26], crack * 0.7);
    colour[i * 3] = c[0]; colour[i * 3 + 1] = c[1]; colour[i * 3 + 2] = c[2];
    height[i] = clamp(0.4 + agg * 0.3 + agg2 * 0.25 - crack * 0.4 + big * 0.08);
  }
  return { colour, height };
}

export async function bakeBuilding(dir, log) {
  const mats = {
    // 2 m x 2 m: schist rubble, flat stones in rough courses, lime mortar (as on the mill)
    wall_schist: [() => masonry(11, {
      courseH: [22, 66], stoneW: [60, 250], widthBias: 1.4, joint: 7, bevel: 9, wobble: 5, colorVar: 0.5, heightVar: 0.45,
      palette: [[92, 84, 78], [116, 100, 84], [74, 70, 72], [138, 112, 84], [104, 92, 96], [84, 74, 66], [150, 126, 98], [66, 62, 64], [124, 104, 92]],
      mortar: [150, 140, 122], stain: [150, 110, 70], mortarH: 0.2,
    }), 5.0, 0.6],
    // dry stone (garden walls, the dam): chunkier, dark joints
    wall_dry: [() => masonry(22, {
      courseH: [34, 96], stoneW: [80, 300], widthBias: 1.2, joint: 9, bevel: 14, wobble: 9, colorVar: 0.5, heightVar: 0.7,
      palette: [[98, 90, 84], [120, 106, 92], [80, 76, 76], [136, 116, 92], [108, 98, 98], [90, 80, 72]],
      mortar: [34, 30, 27], stain: [96, 108, 70], mortarH: 0.0,
    }), 6.0, 0.7],
    granite: [() => speckled(33, { base: [168, 164, 156], dark: [112, 108, 104], light: [214, 210, 202] }), 2.0, 0.4],
    // 2 m x 2 m natural slate, 20 cm exposure
    slate: [() => masonry(44, {
      courseH: [102.4, 102.4], stoneW: [128, 128], regular: true, joint: 3, bevel: 3, wobble: 1.2, colorVar: 0.26, heightVar: 0.2, lap: true,
      palette: [[72, 80, 96], [64, 72, 88], [82, 88, 102], [70, 76, 88], [78, 80, 98], [60, 68, 82]],
      mortar: [30, 34, 42], stain: [96, 104, 92], grainAmp: 0.07,
    }), 4.0, 0.5],
    // planks running along u (2 m): dark old oak beams / weathered decking / painted joinery
    wood_dark: [() => masonry(55, {
      courseH: [150, 220], stoneW: [1024, 1024], joint: 4, bevel: 5, wobble: 0.8, colorVar: 0.3, heightVar: 0.2, grain: [3, 70], grainAmp: 0.3,
      palette: [[92, 66, 44], [80, 58, 40], [104, 76, 50], [72, 52, 38]], mortar: [26, 18, 14],
    }), 3.0, 0.45],
    wood_deck: [() => masonry(66, {
      courseH: [100, 104], stoneW: [700, 1024], joint: 6, bevel: 5, wobble: 0.6, colorVar: 0.34, heightVar: 0.25, grain: [2.5, 80], grainAmp: 0.26,
      palette: [[150, 128, 102], [134, 116, 96], [164, 142, 114], [122, 108, 92], [142, 122, 100]], mortar: [36, 30, 26], stain: [110, 110, 108],
    }), 3.0, 0.5],
    wood_paint: [() => masonry(77, {
      courseH: [200, 260], stoneW: [1024, 1024], joint: 2, bevel: 3, wobble: 0.4, colorVar: 0.06, heightVar: 0.08, grain: [3, 60], grainAmp: 0.06,
      palette: [[232, 230, 224], [226, 224, 216]], mortar: [150, 148, 142],
    }), 1.2, 0.2],
    // 2 m x 2 m pale limestone slabs (terrace)
    paving: [() => masonry(88, {
      courseH: [180, 300], stoneW: [220, 520], joint: 9, bevel: 6, wobble: 2, colorVar: 0.22, heightVar: 0.15,
      palette: [[196, 186, 164], [184, 176, 158], [204, 192, 168], [176, 168, 152]], mortar: [112, 104, 90], stain: [150, 150, 130],
    }), 2.6, 0.4],
    asphalt: [() => asphalt(99), 2.4, 0.35],
    metal: [() => speckled(110, { base: [200, 200, 200], dark: [180, 180, 180], light: [214, 214, 214], scale: 0.5 }), 0.6, 0.1],
  };
  for (const [name, [gen, strength, cav]] of Object.entries(mats)) {
    const { colour, height } = gen();
    normalize01(height);
    await saveMaterial(dir, name, S, colour, height, { normalStrength: strength, sizes: [1024, 512], cavityAmount: cav });
    log(`building/${name}`);
  }
  return {};
}
