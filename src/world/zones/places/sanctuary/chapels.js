// The Sanctuary: what stands in it. Under the dome, nothing but light and a round bench — the place the three
// share. In each chapel, what it turns to, drawn simply and with respect, without a word of scripture: ornament,
// geometry and light say enough. The three hold the same room: something tall in the middle of the half circle,
// a round window of glass over it with their sign, two tall windows, and seats or carpets before it.
//
//   the mosque     the niche that shows the way, the pulpit of steps, carpets, a lattice of stars, a crescent
//   the church     the altar and a cross, a rose of glass, benches
//   the synagogue  the ark and its scrolls behind a curtain, the reading desk, the lamp of seven branches, a
//                  star of six points, the light that never goes out
import { PLAN as P, CHAPELS } from './plan.js';

const TAU = Math.PI * 2;

/**
 * Builds them with the tools of Sanctuary.js (`k`: its builders, its ways of painting a face). Returns what
 * stops one: boxes [x, z, half width, half length, yaw] in the frame of the hall.
 */
export function furnish(k) {
  const { inn, V, A, face, slab, turn, surf, span, STONE, CREAM, ROSE, SLATE, GOLD } = k;
  const solid = [];
  const WOOD = [0.42, 0.27, 0.16], WOOD2 = [0.55, 0.37, 0.22];

  // ---- under the dome: a round bench of stone round the pool of light
  { const r0 = 3.0, r1 = 3.75, n = 40;
    for (const [a0, a1] of [[0.22, Math.PI / 2 - 0.22], [Math.PI / 2 + 0.22, Math.PI - 0.22], [Math.PI + 0.22, 1.5 * Math.PI - 0.22], [1.5 * Math.PI + 0.22, TAU - 0.22]]) {
      // (four lengths, with a way through to the middle before each arm)
      const ts = span(a0 + Math.PI / 4, a1 + Math.PI / 4, n / 4), prof = [[r1 - 0.12, 0], [r1 - 0.12, 0.34], [r1, 0.36], [r1, 0.5], [r0, 0.5], [r0, 0.36], [r0 + 0.12, 0.34], [r0 + 0.12, 0]];
      surf(inn, ts, prof.map((_, i) => i), (t, i) => V(prof[i][0] * Math.sin(t), prof[i][1], prof[i][0] * Math.cos(t)), { want: (m) => { const r = Math.hypot(m.x, m.z), c = (r0 + r1) / 2; return V((m.x / r) * (r - c), m.y - 0.25, (m.z / r) * (r - c)); }, base: CREAM, bond: false, jitter: 0.03, shade: 0 });
      for (const t of [ts[0], ts[ts.length - 1]]) face(inn, V(r0 * Math.sin(t), 0, r0 * Math.cos(t)), V(r1 * Math.sin(t), 0, r1 * Math.cos(t)), V(r1 * Math.sin(t), 0.5, r1 * Math.cos(t)), V(r0 * Math.sin(t), 0.5, r0 * Math.cos(t)), (m) => V(Math.cos(t) * (t === ts[0] ? -1 : 1), 0, -Math.sin(t) * (t === ts[0] ? -1 : 1)), CREAM);
      // (what stops one: a few boxes along each length)
      for (let i = 0; i < 4; i++) { const t = ts[0] + ((i + 0.5) / 4) * (ts[ts.length - 1] - ts[0]), c = (r0 + r1) / 2; solid.push([c * Math.sin(t), c * Math.cos(t), ((ts[ts.length - 1] - ts[0]) * c) / 8 + 0.05, (r1 - r0) / 2, t]); }
    }
  }
  void CHAPELS; void slab; void turn; void STONE; void ROSE; void SLATE; void GOLD; void WOOD; void WOOD2; void A; void P;
  return solid;
}
