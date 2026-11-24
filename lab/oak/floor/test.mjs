// Checks of the floor of Out on a Limb that is being tried, without a browser: four limbs a jump apart over a
// net; on a limb one cannot fall; the ring of light tells where a jump ends, and that is where it ends; a jump
// taken too soon ends in the net, which puts one back; the dead limb cracks under who lingers; a bot rings the
// bell. (Whether climbing it is a pleasure is for whoever tries it to say.)
// usage: node lab/oak/floor/test.mjs
import { LIMB, limbs, limbAt, startClimb, stepClimb, climbFall, botInput, botClimb } from './limb.js';

const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const P = LIMB, L = limbs();
const run = (st, secs, drive, stop) => { const input = { x: 0, z: 0, jump: false }, events = [], seen = []; for (let t = 0; t < secs && !st.over; t += P.step) { input.jump = false; drive?.(st, input, t); stepClimb(st, P.step, input, events); for (const e of events) seen.push({ ...e, at: t }); events.length = 0; if (stop?.(st, seen)) break; } return seen; };
const along = (st, i) => { const p = limbAt(L[st.on], st.s, st.clock), f = Math.hypot(p.tx, p.tz) || 1; i.x = p.tx / f; i.z = p.tz / f; };

{
  const gaps = L.slice(1).map((b, k) => { const a = L[k], p = a.line[a.line.length - 1], q = b.line[0]; return { far: Math.hypot(q.x - p.x, q.z - p.z), up: q.y - p.y }; });
  check('four limbs round the snag, each higher than the last, all well over the net', L.length === 4 && L.every((l, k) => l.line[0].y > P.net.y + 1.2 && (k === 0 || l.y[0] > L[k - 1].y[1] + 0.4)), L.map((l) => `${l.name} ${l.length.toFixed(1)} m at ${l.y[0]} m`).join(' · '));
  check('from one to the next: more than a step, less than a jump', gaps.every((g) => g.far > 1.4 && g.far < 2.9 && g.up > 0.4 && g.up < 1.2), gaps.map((g) => `${g.far.toFixed(1)} m across, ${g.up.toFixed(1)} m up`).join(' · '));
  check('they keep to the sides away from the old tree: the camera stays in the open', P.limbs.every((l) => l.from >= 55 && l.to <= 305));
}
{
  // on a limb one cannot fall: whichever way one pushes, for as long as one likes
  const st = startClimb(); let least = 9, most = 0;
  run(st, 12, (q, i, t) => { const a = t * 2.3; i.x = Math.cos(a); i.z = Math.sin(a * 1.7); least = Math.min(least, q.s); most = Math.max(most, q.s); });
  check('on a limb one cannot fall, whichever way one pushes', st.on === 0 && st.falls === 0 && least >= P.inner - 1e-6 && most <= L[0].length, `from ${least.toFixed(2)} to ${most.toFixed(2)} m along it`);
  // the ring tells where a jump would end; at a run from the end of a limb, on the next — and that is where it ends
  const a = startClimb(); let said = null;
  const seen = run(a, 6, (q, i) => { i.x = 0; i.z = 0; if (q.on === 0 && !said) { along(q, i); const f = climbFall(q, true, {}); if (f && f.ok && f.limb === 1) { said = { ...f }; i.jump = true; } } }, (q, ev) => ev.some((e) => e.type === 'land' || e.type === 'net'));
  check('the ring of light tells where a jump would end, and that is where it ends', !!said && seen.some((e) => e.type === 'land' && e.limb === 1) && Math.hypot(a.x - said.x, a.z - said.z) < 0.6, said ? `on ${L[1].name}, ${Math.hypot(a.x - said.x, a.z - said.z).toFixed(2)} m from where it said` : 'no jump found');
  // too soon: the net — which puts one back on the limb one left
  const b = startClimb();
  const early = run(b, 6, (q, i, t) => { if (q.on === 0) along(q, i); i.jump = t > 0.3 && t < 0.31; }, (q, ev) => ev.some((e) => e.type === 'back'));
  const net = early.find((e) => e.type === 'net'), back = early.find((e) => e.type === 'back');
  check('a jump taken too soon ends in the net, which puts one back on the limb one left', !!net && !!back && back.limb === 0 && b.on === 0 && b.falls === 1 && back.at - net.at > P.held - 0.05, back ? `back after ${(back.at - net.at).toFixed(1)} s` : '');
  // in the air one still steers
  const c = startClimb(), d = startClimb();
  run(c, 0.6, (q, i, t) => { i.jump = t < 0.01; i.x = 0; i.z = 0; }); run(d, 0.6, (q, i, t) => { i.jump = t < 0.01; if (q.on < 0) { i.x = 1; i.z = 0; } });
  check('in the air one still steers', Math.abs(d.x - c.x) > 0.3, `${Math.abs(d.x - c.x).toFixed(2)} m aside in half a second`);
}
{
  // the limb that sways; the dead limb
  const s = L[1], lo = limbAt(s, 0.3, s.sway.period * 0.75).y, hi = limbAt(s, 0.3, s.sway.period * 0.25).y;
  check('one limb sways: where one lands on it rises and falls', hi - lo > 0.4, `${(hi - lo).toFixed(2)} m between the two`);
  const st = startClimb(); Object.assign(st, { on: 2, s: 0.4, last: 1, started: true }); st.crack = st.clock + P.crack;
  const seen = run(st, 12, null, (q, ev) => ev.some((e) => e.type === 'back'));
  const crack = seen.find((e) => e.type === 'crack'), back = seen.find((e) => e.type === 'back');
  check('the dead limb cracks under who lingers on it: into the net, and back on the limb before', !!crack && Math.abs(crack.at - P.crack) < 0.05 && !!back && back.limb === 1 && st.falls === 1);
  const grown = run(st, P.back + 1, null, (q) => q.gone < 0);
  check('…and it grows back', st.gone < 0 && grown !== null);
}
{
  const bot = botClimb();
  check('a bot goes from the plate to the bell without a fall', bot.over && bot.falls === 0 && bot.jumps === 3 && bot.time > 3000 && bot.time < 15000, `${(bot.time / 1000).toFixed(1)} s, ${bot.jumps} jumps`);
  const at = (dt) => { const st = startClimb(), input = { x: 0, z: 0, jump: false }; let acc = 0; for (let t = 0; t < 60 && !st.over; t += dt) { acc += dt; while (acc >= P.step && !st.over) { acc -= P.step; botInput(st, input); stepClimb(st, P.step, input, null); } } return st.time; };
  check('the same climb at 30 and at 144 frames a second', at(1 / 30) === at(1 / 144) && at(1 / 30) === bot.time);
  // someone slower: who stops on every limb, then goes on, still gets there (but for the dead limb, which wants no stopping)
  const st = startClimb(); let wait = 0, on = 0;
  run(st, 60, (q, i) => { if (q.on !== on) { on = q.on; wait = q.on >= 0 && !L[q.on].dead ? 0.8 : 0; } if (wait > 0) { wait -= P.step; return; } botInput(q, i); });
  check('who stops to think on each limb gets there too', st.over && st.falls <= 1, `${(st.time / 1000).toFixed(1)} s, ${st.falls} in the net`);
}
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
