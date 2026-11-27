// The Sanctuary: what stands in it. Under the dome, nothing but light and a round bench — the place the three
// share. In each chapel, what it turns to, drawn simply and with respect, without a word of scripture: ornament,
// geometry and light say enough. The three hold the same room: something tall in the middle of the half circle,
// a round window of glass over it with their sign, two tall windows, and seats or carpets before it.
//
//   the mosque     the niche that shows the way, the pulpit of steps, carpets, a lattice of stars, a crescent
//   the church     the altar and a cross, a rose of glass, benches
//   the synagogue  the ark and its scrolls behind a curtain, the reading desk, the lamp of seven branches, a
//                  star of six points, the light that never goes out
import { PLAN as P, CHAPELS, armPoint } from './plan.js';

const TAU = Math.PI * 2;

/**
 * Builds them with the tools of Sanctuary.js (`k`: its builders, its ways of painting a face). Returns what
 * stops one: boxes [x, z, half width, half length, yaw] in the frame of the hall.
 */
export function furnish(k) {
  const { inn, thin, V, A, face, slab, turn, surf, span, plain, lit, rose, GLASS, STONE, CREAM, ROSE, GOLD } = k;
  const solid = [], C = P.chord, W = P.W;
  const WOOD = [0.4, 0.25, 0.14], WOOD2 = [0.58, 0.4, 0.24], WHITE = [1.1, 1.07, 1.0], FLAME = [1.6, 1.1, 0.4], TEAL = [0.1, 0.5, 0.52], NAVY = [0.1, 0.16, 0.5], RED = [0.55, 0.09, 0.1];
  const stop = (a, u, v, hw, hl) => solid.push([...armPoint(a, u, v), hw, hl, a]);
  /** A small flame: two leaves of light, crossed. */
  const flame = (p, s = 0.07) => { for (const [dx, dz] of [[1, 0], [0, 1]]) face(thin, V(p.x - dx * s, p.y + s * 1.2, p.z - dz * s), V(p.x, p.y, p.z), V(p.x + dx * s, p.y + s * 1.2, p.z + dz * s), V(p.x, p.y + s * 3.4, p.z), V(dz, 0, dx), FLAME, plain); };

  // ---- under the dome: a round bench of stone round the pool of light
  { const r0 = 3.0, r1 = 3.75;
    for (let q = 0; q < 4; q++) {
      // (four lengths, with a way through to the middle before each arm)
      const ts = span(q * (TAU / 4) + 0.24, (q + 1) * (TAU / 4) - 0.24, 10), prof = [[r1 - 0.12, 0], [r1 - 0.12, 0.34], [r1, 0.36], [r1, 0.5], [r0, 0.5], [r0, 0.36], [r0 + 0.12, 0.34], [r0 + 0.12, 0]], c = (r0 + r1) / 2;
      surf(inn, ts, prof.map((_, i) => i), (t, i) => V(prof[i][0] * Math.sin(t), prof[i][1], prof[i][0] * Math.cos(t)), { want: (m) => { const r = Math.hypot(m.x, m.z); return V((m.x / r) * (r - c), (m.y - 0.3) * 3, (m.z / r) * (r - c)); }, base: CREAM, bond: false, jitter: 0.03, shade: 0 });
      for (const [t, s] of [[ts[0], -1], [ts[10], 1]]) face(inn, V(r0 * Math.sin(t), 0, r0 * Math.cos(t)), V(r1 * Math.sin(t), 0, r1 * Math.cos(t)), V(r1 * Math.sin(t), 0.5, r1 * Math.cos(t)), V(r0 * Math.sin(t), 0.5, r0 * Math.cos(t)), V(Math.cos(t) * s, 0, -Math.sin(t) * s), CREAM);
      for (let i = 0; i < 4; i++) { const t = ts[0] + ((i + 0.5) / 4) * (ts[10] - ts[0]); solid.push([c * Math.sin(t), c * Math.cos(t), ((ts[10] - ts[0]) * c) / 8 + 0.05, (r1 - r0) / 2, t]); }
    }
  }

  for (const { id, angle: a } of CHAPELS) {
    const F = (x, y, z) => A(a, x, y, z), toRoom = (m) => F(0, 3, C - 2).sub(m), front = F(0, 0, -1).sub(F(0, 0, 0)); // (`front`: towards who looks at the chapel)
    const ux = F(1, 0, 0).sub(F(0, 0, 0)), up = V(0, 1, 0);
    // ---- the round window over what the chapel turns to: the same ring of stone for each, and its sign in glass
    const wc = F(0, 5.45, C + W - 0.2), wr = 1.05, WP = (u, v, d = 0) => wc.clone().addScaledVector(ux, u).addScaledVector(up, v).addScaledVector(front, d);
    for (let i = 0; i < 24; i++) { const t0 = (i / 24) * TAU, t1 = ((i + 1) / 24) * TAU; face(inn, WP(wr * Math.cos(t0), wr * Math.sin(t0), 0.03), WP((wr + 0.24) * Math.cos(t0), (wr + 0.24) * Math.sin(t0), 0.03), WP((wr + 0.24) * Math.cos(t1), (wr + 0.24) * Math.sin(t1), 0.03), WP(wr * Math.cos(t1), wr * Math.sin(t1), 0.03), front, i % 2 ? CREAM : ROSE); }
    const disc = (r, n, col, d = 0, turnBy = 0) => { for (let i = 0; i < n; i++) { const t0 = turnBy + (i / n) * TAU, t1 = turnBy + ((i + 1) / n) * TAU, c = typeof col === 'function' ? col(i) : col; face(inn, WP(0, 0, d), WP(r * Math.cos(t0), r * Math.sin(t0), d), WP(r * Math.cos(t1), r * Math.sin(t1), d), WP(0, 0, d), front, c, plain); } };
    const poly = (pts, col, d) => { for (let i = 1; i + 1 < pts.length; i++) face(inn, WP(pts[0][0], pts[0][1], d), WP(pts[i][0], pts[i][1], d), WP(pts[i + 1][0], pts[i + 1][1], d), WP(pts[0][0], pts[0][1], d), front, col, plain); };
    const ngon = (n, r, t) => Array.from({ length: n }, (_, i) => [r * Math.cos(t + (i / n) * TAU), r * Math.sin(t + (i / n) * TAU)]);
    if (id === 'church') rose(inn, WP(0, 0, 0), ux, up, wr, front, 1.0);
    if (id === 'mosque') {
      // (a star of eight points — two squares, one turned on the other — gold on a blue ground)
      disc(wr, 16, (i) => (i % 2 ? [0.05, 0.2, 0.75] : [0.04, 0.3, 0.6]));
      poly(ngon(4, wr * 0.86, Math.PI / 4), GLASS[1], 0.012); poly(ngon(4, wr * 0.86, 0), GLASS[1], 0.014);
      poly(ngon(8, wr * 0.47, Math.PI / 8), [0.08, 0.6, 0.55], 0.02); poly(ngon(8, wr * 0.2, 0), GLASS[4], 0.026);
    }
    if (id === 'synagogue') {
      // (a star of six points — two triangles, one upon the other — blue on a ground of gold)
      disc(wr, 12, (i) => (i % 2 ? [1.0, 0.72, 0.2] : [0.95, 0.56, 0.1]));
      poly(ngon(3, wr * 0.88, Math.PI / 2), [0.06, 0.18, 0.85], 0.012); poly(ngon(3, wr * 0.88, -Math.PI / 2), [0.06, 0.18, 0.85], 0.014);
      poly(ngon(6, wr * 0.44, 0), [0.25, 0.45, 1.0], 0.02);
    }

    if (id === 'church') {
      // ---- the altar on its step, its cloth, two candles; behind it a tall plain cross of gold
      slab(inn, F, -2.3, 0, C + 1.5, 2.3, 0.18, C + 4.5, CREAM, { faces: 'xXYz' });
      slab(inn, F, -1.1, 0.18, C + 2.3, 1.1, 1.06, C + 3.2, STONE, { faces: 'xXzZ' });
      slab(inn, F, -1.3, 1.06, C + 2.2, 1.3, 1.2, C + 3.3, CREAM);
      slab(inn, F, -0.5, 1.2, C + 2.17, 0.5, 1.225, C + 3.33, WHITE, { faces: 'xXY' });
      face(inn, F(-0.5, 0.5, C + 2.17), F(0.5, 0.5, C + 2.17), F(0.5, 1.22, C + 2.17), F(-0.5, 1.22, C + 2.17), front, WHITE);
      face(inn, F(-0.5, 0.5, C + 2.165), F(0.5, 0.5, C + 2.165), F(0.5, 0.6, C + 2.165), F(-0.5, 0.6, C + 2.165), front, GOLD);
      for (const s of [-1, 1]) { const at = F(s * 0.95, 1.2, C + 2.75); turn(inn, at, [[0.1, 0], [0.05, 0.06], [0.04, 0.3], [0.08, 0.33], [0.03, 0.35], [0.03, 0.62]], 6, GOLD); flame(V(at.x, at.y + 0.63, at.z)); }
      slab(inn, F, -0.36, 0.18, C + 3.75, 0.36, 0.48, C + 4.35, CREAM);
      slab(inn, F, -0.1, 0.48, C + 3.95, 0.1, 4.25, C + 4.15, GOLD);
      slab(inn, F, -0.78, 3.1, C + 3.95, 0.78, 3.3, C + 4.15, GOLD);
      stop(a, 0, C + 2.75, 1.3, 0.55); stop(a, 0, C + 4.05, 0.4, 0.3);
      // ---- benches, in two files
      for (let r = 0; r < 4; r++) for (const s of [-1, 1]) {
        const v = 11.9 + r * 1.75, x0 = s < 0 ? -4.5 : 0.9, x1 = s < 0 ? -0.9 : 4.5;
        slab(inn, F, x0, 0.38, v, x1, 0.46, v + 0.48, WOOD2, { faces: 'YzZxX' });
        slab(inn, F, x0, 0.1, v - 0.08, x1, 1.0, v, WOOD);
        for (const x of [x0, x1 - 0.07]) slab(inn, F, x, 0, v - 0.08, x + 0.07, 0.78, v + 0.5, WOOD);
        stop(a, (x0 + x1) / 2, v + 0.2, (x1 - x0) / 2, 0.3);
      }
    }

    if (id === 'mosque') {
      // ---- the niche that shows the way: an arch of blue tiles in a frame of pale stone, a small lamp in it
      const z = C + W - 0.42, arch = (h, y0, rise) => [[-h, 0], ...Array.from({ length: 13 }, (_, i) => { const t = Math.PI - (i / 12) * Math.PI; return [h * Math.cos(t), y0 + rise * Math.sin(t) ** 0.72]; }), [h, 0]];
      slab(inn, F, -1.55, 0, z, 1.55, 4.25, C + W, CREAM, { faces: 'xXYz' });
      for (const [x0, y0, x1, y1] of [[-1.42, 0.1, -1.2, 4.1], [1.2, 0.1, 1.42, 4.1], [-1.2, 3.88, 1.2, 4.1]]) face(inn, F(x0, y0, z - 0.012), F(x1, y0, z - 0.012), F(x1, y1, z - 0.012), F(x0, y1, z - 0.012), front, TEAL);
      const pts = arch(0.85, 2.3, 1.25);
      for (let i = 0; i + 1 < pts.length; i++) { const g = (y) => { const t = y / 3.55; return [0.03 + 0.05 * t, 0.1 + 0.3 * t, 0.3 + 0.5 * t]; }, [u0, y0] = pts[i], [u1, y1] = pts[i + 1], q = (u, y, c) => { const p = F(u, y, z - 0.015); return [p, c]; };
        const a0 = q(u0, 0, g(0)), a1 = q(u1, 0, g(0)), a2 = q(u1, y1, g(y1)), a3 = q(u0, y0, g(y0));
        // (painted corner by corner: darker at its foot, lit towards its point)
        face(inn, a0[0], a1[0], a2[0], a3[0], front, [1, 1, 1], (p) => { const c = g(F(0, 0, 0).y + p.y); return [c[0], c[1], c[2], 1]; }); }
      const rim = arch(0.97, 2.3, 1.4);
      for (let i = 0; i + 1 < pts.length; i++) face(inn, F(pts[i][0], pts[i][1], z - 0.03), F(pts[i + 1][0], pts[i + 1][1], z - 0.03), F(rim[i + 1][0], rim[i + 1][1], z - 0.03), F(rim[i][0], rim[i][1], z - 0.03), front, GOLD);
      { const at = F(0, 2.35, z - 0.2); turn(inn, at, [[0.02, -0.16], [0.11, -0.08], [0.14, 0.04], [0.08, 0.16], [0.02, 0.22]], 6, FLAME, { paint: plain }); slab(inn, F, -0.008, 2.57, z - 0.208, 0.008, 3.5, z - 0.192, GOLD); }
      // (a crescent of gold over it)

      stop(a, 0, C + W - 0.3, 1.6, 0.35);
      // ---- the pulpit of steps, to the right of the niche: a small gate, seven steps between two rails, a seat under a pointed roof
      { const x0 = -3.5, x1 = -2.55, v0 = C - 0.6, run = 0.42, rise = 0.3, n = 7, top = n * rise, vt = v0 + n * run;
        for (let i = 0; i < n; i++) { slab(inn, F, x0, 0, v0 + i * run, x1, (i + 1) * rise, v0 + (i + 1) * run, WOOD2, { faces: 'xXYz' }); for (const x of [x0 - 0.05, x1]) slab(inn, F, x, (i + 1) * rise, v0 + i * run, x + 0.05, (i + 1) * rise + 0.8, v0 + (i + 1) * run, i % 2 ? TEAL : WOOD); }
        slab(inn, F, x0, 0, vt, x1, top, vt + 0.9, WOOD2, { faces: 'xXYZ' });
        for (const x of [x0 - 0.05, x1 - 0.03]) for (const v of [vt + 0.02, vt + 0.8]) slab(inn, F, x, top, v, x + 0.08, top + 1.9, v + 0.08, WOOD);
        turn(inn, F((x0 + x1) / 2, top + 1.9, vt + 0.45), [[0.72, 0], [0.72, 0.1], [0.5, 0.3], [0.22, 0.8], [0.03, 1.25]], 8, TEAL);
        turn(inn, F((x0 + x1) / 2, top + 3.15, vt + 0.45), [[0.01, 0], [0.09, 0.06], [0.09, 0.14], [0.03, 0.2], [0.03, 0.42]], 6, GOLD);
        // (a crescent of gold on its point, its horns up)
        { const R = 0.36, r = 0.3, d = 0.13, cx = (x0 + x1) / 2, cy = top + 3.15 + 0.42 + R, n = 14, zz = vt + 0.45;
          for (let i = 0; i < n; i++) { const o = (q) => { const t = ((39.3 - q * 258.6) * Math.PI) / 180; return F(cx + R * Math.cos(t), cy + R * Math.sin(t), zz); }, e = (q) => { const t = ((19.9 - q * 219.8) * Math.PI) / 180; return F(cx + r * Math.cos(t), cy + d + r * Math.sin(t), zz); }; face(thin, o(i / n), o((i + 1) / n), e((i + 1) / n), e(i / n), front, [1.25, 0.95, 0.38]); } }
        for (const x of [x0 - 0.05, x1 - 0.03]) slab(inn, F, x, 0, v0 - 0.1, x + 0.08, 2.3, v0, WOOD);
        slab(inn, F, x0 - 0.05, 2.1, v0 - 0.1, x1 + 0.05, 2.45, v0, TEAL);
        stop(a, (x0 + x1) / 2, (v0 + vt + 0.9) / 2, (x1 - x0) / 2 + 0.06, (vt + 0.9 - v0) / 2); }
      // ---- carpets, in rows that turn to the niche
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
        const v = 11.75 + r * 2.15, u = -5.0 + c * 2.0, field = (r + c) % 2 ? RED : [0.5, 0.12, 0.2], y = 0.02;
        face(inn, F(u + 0.06, y, v), F(u + 1.94, y, v), F(u + 1.94, y, v + 2.0), F(u + 0.06, y, v + 2.0), up, [0.8, 0.68, 0.45]);
        face(inn, F(u + 0.2, y + 0.006, v + 0.14), F(u + 1.8, y + 0.006, v + 0.14), F(u + 1.8, y + 0.006, v + 1.86), F(u + 0.2, y + 0.006, v + 1.86), up, field);
        face(inn, F(u + 0.5, y + 0.012, v + 0.36), F(u + 1.5, y + 0.012, v + 0.36), F(u + 1.5, y + 0.012, v + 1.2), F(u + 0.5, y + 0.012, v + 1.2), up, (r + c) % 2 ? NAVY : TEAL);
        face(inn, F(u + 0.5, y + 0.012, v + 1.2), F(u + 1.5, y + 0.012, v + 1.2), F(u + 1.0, y + 0.012, v + 1.68), F(u + 1.0, y + 0.012, v + 1.68), up, (r + c) % 2 ? NAVY : TEAL);
      }
      // ---- a lattice of stars before its two tall windows
      for (const bb of [Math.PI * 0.2, Math.PI * 0.8]) {
        const r = W - 0.13, o = F(r * Math.cos(bb), 1.9, C + r * Math.sin(bb)), x = F(-Math.sin(bb), 0, Math.cos(bb)).sub(F(0, 0, 0)), w = 1.3, h = 4.3, Q = (u, v) => o.clone().addScaledVector(x, u).addScaledVector(up, v), wantIn = (m) => F(0, m.y, C).sub(m);
        for (let i = -4; i <= 8; i++) for (const dir of [1, -1]) {
          // (bars one way and the other; where they cross, a star is left open)
          const y0 = i * 0.65, pts = []; for (const t of [0, 1]) { const u = -w / 2 + t * w, v = y0 + dir * (u + w / 2) * 1.0 + (dir < 0 ? w : 0); pts.push([u, v]); }
          const c0 = Math.max(0, Math.min(h, pts[0][1])), c1 = Math.max(0, Math.min(h, pts[1][1])); if (c0 === c1) continue;
          const ua = pts[0][0] + ((c0 - pts[0][1]) / (pts[1][1] - pts[0][1])) * w, ub = pts[0][0] + ((c1 - pts[0][1]) / (pts[1][1] - pts[0][1])) * w;
          face(inn, Q(ua, c0 - 0.045), Q(ub, c1 - 0.045), Q(ub, c1 + 0.045), Q(ua, c0 + 0.045), wantIn, CREAM);
        }
        for (const u of [-w / 2 - 0.05, w / 2 - 0.03]) face(inn, Q(u, 0), Q(u + 0.08, 0), Q(u + 0.08, h), Q(u, h), wantIn, CREAM);
      }
    }

    if (id === 'synagogue') {
      // ---- the ark on its steps: two columns, a lintel, the two tablets (blank) over it; inside, the scrolls
      // in their mantles, behind a curtain drawn aside
      slab(inn, F, -2.5, 0, C + 1.9, 2.5, 0.16, C + 4.7, CREAM, { faces: 'xXYz' });
      slab(inn, F, -2.0, 0.16, C + 2.5, 2.0, 0.32, C + 4.7, CREAM, { faces: 'xXYz' });
      const z = C + 3.7;
      slab(inn, F, -1.25, 0.32, z, 1.25, 3.5, C + 4.7, WOOD2, { faces: 'xX' });
      slab(inn, F, -1.25, 0.32, z, -1.08, 3.5, z + 0.1, WOOD2, { faces: 'zX' }); slab(inn, F, 1.08, 0.32, z, 1.25, 3.5, z + 0.1, WOOD2, { faces: 'zx' });
      face(inn, F(-1.1, 0.32, z + 0.55), F(1.1, 0.32, z + 0.55), F(1.1, 3.5, z + 0.55), F(-1.1, 3.5, z + 0.55), front, [0.16, 0.1, 0.07]);
      slab(inn, F, -1.1, 0.32, z, 1.1, 0.62, z + 0.55, WOOD, { faces: 'Yz' });
      for (const s of [-1, 1]) turn(inn, F(s * 1.48, 0.32, z - 0.12), [[0.24, 0], [0.24, 0.12], [0.16, 0.2], [0.14, 2.75], [0.2, 2.85], [0.25, 3.0], [0.25, 3.1]], 8, CREAM);
      slab(inn, F, -1.8, 3.42, z - 0.4, 1.8, 3.8, C + 4.7, CREAM);
      for (const s of [-1, 1]) { slab(inn, F, s < 0 ? -0.6 : 0.04, 3.8, z + 0.1, s < 0 ? -0.04 : 0.6, 4.5, z + 0.26, WHITE); const c = F(s * 0.32, 4.5, z + 0.1); for (let i = 0; i < 6; i++) { const t0 = (i / 6) * Math.PI, t1 = ((i + 1) / 6) * Math.PI; face(inn, c, c.clone().addScaledVector(ux, 0.28 * Math.cos(t0)).addScaledVector(up, 0.28 * Math.sin(t0)), c.clone().addScaledVector(ux, 0.28 * Math.cos(t1)).addScaledVector(up, 0.28 * Math.sin(t1)), c, front, WHITE); } }
      [[-0.62, [0.5, 0.07, 0.1]], [0, [1.0, 0.97, 0.9]], [0.62, [0.1, 0.17, 0.52]]].forEach(([x, col]) => {
        const at = F(x, 0.62, z + 0.3); turn(inn, at, [[0.2, 0], [0.22, 0.05], [0.22, 1.35], [0.1, 1.42]], 8, col);
        turn(inn, at, [[0.225, 0.78], [0.225, 0.92]], 8, GOLD);
        for (const s of [-1, 1]) turn(inn, V(at.x + ux.x * s * 0.09, at.y + 1.42, at.z + ux.z * s * 0.09), [[0.03, 0], [0.03, 0.2], [0.07, 0.25], [0.07, 0.33], [0.02, 0.4]], 5, GOLD);
      });
      for (const s of [-1, 1]) {
        // (the curtain: deep blue, in folds, held back either side; a band of gold across its head)
        const xs = span(0, 1, 6); surf(inn, xs, [0.62, 1.5, 3.1], (t, y, i) => F(s * (1.08 - t * (y < 1 ? 0.3 : y < 2 ? 0.26 : 0.55)), y, z + 0.02 + (i % 2 ? 0.07 : 0)), { want: front, base: (i) => (i % 2 ? NAVY : [0.14, 0.22, 0.66]), bond: false, jitter: 0.02, shade: 0 });
        face(inn, F(s * 1.08, 1.42, z - 0.005), F(s * 0.8, 1.42, z - 0.005), F(s * 0.8, 1.54, z - 0.005), F(s * 1.08, 1.54, z - 0.005), front, GOLD);
      }
      surf(inn, span(-1.1, 1.1, 10), [3.0, 3.45], (x, y, i) => F(x, y, z - 0.02 + (i % 2 ? 0.06 : 0)), { want: front, base: (i) => (i % 2 ? NAVY : [0.14, 0.22, 0.66]), bond: false, jitter: 0.02, shade: 0 });
      face(inn, F(-1.1, 2.96, z - 0.03), F(1.1, 2.96, z - 0.03), F(1.1, 3.06, z - 0.03), F(-1.1, 3.06, z - 0.03), front, GOLD);
      stop(a, 0, C + 4.1, 1.8, 0.75);
      // ---- the light that never goes out, hung before the ark
      { const at = F(0, 4.05, C + 2.9); turn(inn, at, [[0.02, -0.2], [0.13, -0.08], [0.17, 0.06], [0.12, 0.2], [0.03, 0.28]], 8, [1.5, 0.35, 0.12], { paint: plain }); turn(inn, at, [[0.05, 0.28], [0.09, 0.32], [0.02, 0.4]], 6, GOLD); slab(inn, F, -0.01, 4.45, C + 2.89, 0.01, 7 + Math.sqrt(W * W - 2.9 * 2.9), C + 2.91, GOLD); }
      // ---- the lamp of seven branches, of gold, beside the ark
      { const mx = 3.0, mz = C + 3.0, yc = 1.3, top = 1.85, ribbon = (p0, p1, w = 0.035) => { const d = [p1[0] - p0[0], p1[1] - p0[1]], l = Math.hypot(d[0], d[1]) || 1, nx = (-d[1] / l) * w, ny = (d[0] / l) * w; face(thin, F(mx + p0[0] - nx, p0[1] - ny, mz), F(mx + p0[0] + nx, p0[1] + ny, mz), F(mx + p1[0] + nx, p1[1] + ny, mz), F(mx + p1[0] - nx, p1[1] - ny, mz), front, GOLD); };
        turn(inn, F(mx, 0, mz), [[0.34, 0], [0.32, 0.06], [0.12, 0.16], [0.05, 0.34]], 8, GOLD);
        ribbon([0, 0.3], [0, top]);
        for (const r of [0.27, 0.54, 0.81]) { for (let i = 0; i < 10; i++) { const t0 = Math.PI + (i / 10) * Math.PI, t1 = Math.PI + ((i + 1) / 10) * Math.PI; ribbon([r * Math.cos(t0), yc + r * Math.sin(t0)], [r * Math.cos(t1), yc + r * Math.sin(t1)]); } for (const s of [-1, 1]) ribbon([s * r, yc], [s * r, top]); }
        for (const x of [-0.81, -0.54, -0.27, 0, 0.27, 0.54, 0.81]) { ribbon([x - 0.07, top + 0.03], [x + 0.07, top + 0.03], 0.03); const p = F(mx + x, top + 0.07, mz); flame(p, 0.05); }
        stop(a, mx, mz, 0.9, 0.3); }
      // ---- the reading desk on its platform, in the middle of the chapel, turned to the ark
      slab(inn, F, -1.5, 0, 13.2, 1.5, 0.25, 15.9, WOOD2, { faces: 'xXYzZ' });
      slab(inn, F, -0.8, 0.25, 14.85, 0.8, 1.12, 15.45, WOOD);
      face(inn, F(-0.95, 1.14, 14.7), F(0.95, 1.14, 14.7), F(0.95, 1.42, 15.6), F(-0.95, 1.42, 15.6), up, NAVY);
      face(inn, F(-0.95, 1.14, 14.7), F(0.95, 1.14, 14.7), F(0.95, 0.8, 14.69), F(-0.95, 0.8, 14.69), front, NAVY);
      face(inn, F(-0.95, 0.8, 14.685), F(0.95, 0.8, 14.685), F(0.95, 0.88, 14.685), F(-0.95, 0.88, 14.685), front, GOLD);
      slab(inn, F, -0.95, 1.12, 15.58, 0.95, 1.42, 15.62, WOOD, { faces: 'ZxX' });
      for (const x of [-1.42, 1.42]) for (const v of [13.28, 15.82]) turn(inn, F(x, 0.25, v), [[0.07, 0], [0.05, 0.1], [0.05, 0.85], [0.09, 0.9], [0.09, 1.0], [0.02, 1.08]], 6, WOOD);
      for (const x of [-1.42, 1.42]) slab(inn, F, x - 0.03, 1.05, 13.28, x + 0.03, 1.12, 15.82, WOOD);
      stop(a, 0, 14.55, 1.5, 1.35);
      // ---- benches along its two walls, turned to the middle
      for (const s of [-1, 1]) { const x0 = s < 0 ? -4.95 : 4.2, x1 = s < 0 ? -4.2 : 4.95; slab(inn, F, x0, 0.38, 11.8, x1, 0.46, 18.6, WOOD2, { faces: 'YxXzZ' }); slab(inn, F, s < 0 ? -5.05 : 4.95, 0.1, 11.8, s < 0 ? -4.95 : 5.05, 1.05, 18.6, WOOD); for (const v of [11.8, 15.15, 18.53]) slab(inn, F, x0, 0, v, x1, 0.38, v + 0.07, WOOD); stop(a, (x0 + x1) / 2, 15.2, 0.45, 3.4); }
    }
  }
  void lit;
  return solid;
}
