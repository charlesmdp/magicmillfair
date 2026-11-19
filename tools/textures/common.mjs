// Shared utility textures: tileable noise, water caustics, water ripples.
import { field, normalize01, blurWrap, normalFromHeight, savePng, saveWebp, fbm, perlin, worley, clamp, smoothstep } from '../lib/tex.mjs';

export async function bakeCommon(dir, log) {
  // noise: R = soft fbm, G = billowy cells, B = fine grain
  {
    const S = 256;
    const r = normalize01(field(S, (u, v) => fbm(u * 4, v * 4, { seed: 1, octaves: 5, period: 4, gain: 0.55 })));
    const g = normalize01(field(S, (u, v) => {
      const a = worley(u * 6, v * 6, 2, 6, 1), b = worley(u * 13, v * 13, 3, 13, 1);
      return (1 - a.f1) * 0.65 + (1 - b.f1) * 0.35;
    }));
    const b = normalize01(field(S, (u, v) => fbm(u * 24, v * 24, { seed: 4, octaves: 3, period: 24 })));
    const buf = new Uint8Array(S * S * 3);
    for (let i = 0; i < S * S; i++) { buf[i * 3] = r[i] * 255; buf[i * 3 + 1] = g[i] * 255; buf[i * 3 + 2] = b[i] * 255; }
    await savePng(`${dir}/noise.png`, buf, S, S, 3);
    log('noise');
  }
  // caustics: bright filaments along warped cell borders
  {
    const S = 512;
    const c = field(S, (u, v) => {
      const wx = u + 0.035 * fbm(u * 5, v * 5, { seed: 7, octaves: 3, period: 5 });
      const wy = v + 0.035 * fbm(u * 5 + 9.1, v * 5, { seed: 8, octaves: 3, period: 5 });
      const a = worley(wx * 7, wy * 7, 11, 7, 0.95);
      const b = worley(wx * 11 + 0.5, wy * 11, 12, 11, 0.95);
      const ea = a.f2 - a.f1, eb = b.f2 - b.f1;
      return Math.exp(-ea * 9) * 0.8 + Math.exp(-eb * 11) * 0.45;
    });
    const s = blurWrap(c, S, 0.9);
    const buf = new Uint8Array(S * S);
    for (let i = 0; i < S * S; i++) buf[i] = clamp(Math.pow(s[i], 1.5) * 1.35) * 255;
    await savePng(`${dir}/caustics.png`, buf, S, S, 1);
    log('caustics');
  }
  // water ripples: RG = normal, B = height. Two scales.
  for (const [name, cells, gain, strength] of [['water_n1', 5, 0.62, 2.4], ['water_n2', 3, 0.5, 2.0]]) {
    const S = 512;
    const h = normalize01(field(S, (u, v) => {
      const w = 0.04 * perlin(u * 4, v * 4, 31, 4);
      return fbm(u * cells + w, v * cells * 1.6 + w, { seed: 21 + cells, octaves: 5, period: 0, gain }) * 0.0 +
        fbm(u * cells, v * cells, { seed: 21 + cells, octaves: 5, period: cells, gain }) + 0.35 * Math.abs(fbm(u * cells * 2, v * cells * 2, { seed: 40 + cells, octaves: 3, period: cells * 2 }));
    }));
    const n = normalFromHeight(h, S, strength * 6);
    const buf = new Uint8Array(S * S * 3);
    for (let i = 0; i < S * S; i++) {
      buf[i * 3] = (n[i * 2] * 0.5 + 0.5) * 255; buf[i * 3 + 1] = (n[i * 2 + 1] * 0.5 + 0.5) * 255; buf[i * 3 + 2] = h[i] * 255;
    }
    await saveWebp(`${dir}/${name}.webp`, buf, S, S, 3, { quality: 92 });
    log(name);
  }
  // foam: soft clumpy bubbles (R) for shore lines and rapids
  {
    const S = 512;
    const f = normalize01(field(S, (u, v) => {
      const a = worley(u * 12, v * 12, 61, 12, 1), b = worley(u * 29, v * 29, 62, 29, 1), c = worley(u * 61, v * 61, 63, 61, 1);
      const cells = smoothstep(0.02, 0.3, a.f2 - a.f1) * 0.5 + smoothstep(0.02, 0.3, b.f2 - b.f1) * 0.32 + smoothstep(0.02, 0.3, c.f2 - c.f1) * 0.18;
      return cells * (0.6 + 0.4 * fbm(u * 6, v * 6, { seed: 64, octaves: 3, period: 6 }));
    }));
    const buf = new Uint8Array(S * S);
    for (let i = 0; i < S * S; i++) buf[i] = f[i] * 255;
    await savePng(`${dir}/foam.png`, buf, S, S, 1);
    log('foam');
  }
}
