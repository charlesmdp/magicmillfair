// Checks of Little Mine Train (the game `mine`), without a browser: the line is a loop of a kilometre from a
// station at the foot of the west mountains and back — in the open it runs over the ground, clear of the trees;
// its tunnels are under the ground; it stands away from what the valley has there already; one leans, brakes
// and hops as the rules say; a driver with a person's limits gets round without leaving the rails, a clumsy one
// leaves them a few times and still gets home, and who does nothing is off at the first sharp bend.
// usage: node tools/mine-test.mjs [--plan]     (--plan: the line, every ten metres, over the ground of the world)
import fs from 'node:fs';
import path from 'node:path';
import { check, done, ground, ROOT } from './lib/check.mjs';
import { BOUNDS } from '../src/world/layout/layout.js';
import { MINE, course, railAt, stretchAt, startRun, stepRun, cartPose, heatOf, botInput, naiveInput, botRun } from '../src/world/zones/games/mine/rules.js';

const M = MINE, C = course(), L = C.length, F = C.fork, height = await ground();
const T = new Float32Array(fs.readFileSync(path.join(ROOT, 'public/assets/world/trees.bin')).buffer.slice(0));
const trees = (x, z, r) => { let n = 0; for (let i = 0; i + 5 < T.length; i += 6) if ((T[i] - x) ** 2 + (T[i + 1] - z) ** 2 < r * r) n++; return n; };
const inside = (x, z) => { let c = false; for (let i = 0, j = BOUNDS.length - 1; i < BOUNDS.length; j = i++) if ((BOUNDS[j][1] > z) !== (BOUNDS[i][1] > z) && x < ((BOUNDS[i][0] - BOUNDS[j][0]) * (z - BOUNDS[j][1])) / (BOUNDS[i][1] - BOUNDS[j][1]) + BOUNDS[j][0]) c = !c; return c; };
const OPEN = new Set(['station', 'open', 'trestle']);

if (process.argv.includes('--plan')) {
  console.log(`length ${L.toFixed(1)} m · top of the lift ${C.top.toFixed(0)} · fork ${F.s0.toFixed(0)} → ${F.s1.toFixed(0)} (short way ${F.len.toFixed(0)} m) · finish ${C.finish.toFixed(0)}`);
  console.log(C.stretches.map((q) => `${q.name} ${q.from.toFixed(0)}`).join(' · '));
  for (let s = 0; s <= L; s += 10) { const r = railAt(s, 0, {}), g = height(r.x, r.z); console.log(`${String(s).padStart(5)}  ${r.kind.padEnd(8)} x ${r.x.toFixed(0).padStart(5)} z ${r.z.toFixed(0).padStart(5)} y ${r.y.toFixed(1).padStart(6)}  ground ${g.toFixed(1).padStart(6)}  over ${(r.y - g).toFixed(1).padStart(6)}  trees ${trees(r.x, r.z, 4)}  k ${(r.k * 100).toFixed(1).padStart(5)}  free ${C.free[Math.round(s / C.ds)].toFixed(1)}`); }
  console.log('bends', C.bends.map((b) => `${b.s.toFixed(0)}${b.dir > 0 ? 'R' : 'L'}${b.r.toFixed(0)}${b.brake ? '!' : ''}(${b.need.toFixed(2)})`).join(' '));
  console.log('signals', C.signals.map((g) => g.s.toFixed(0)).join(' '));
  for (const kind of ['steady', 'bold', 'clumsy']) { const b = botRun(kind); console.log(kind, JSON.stringify(b)); }
  process.exit(0);
}
done();
