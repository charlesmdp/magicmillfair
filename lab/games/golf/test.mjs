// Checks of Par for the Course, without a browser: the nine beds lie in their rectangle of the meadow, clear of
// each other and of the pond (but for the two over the acid), the arch and the stand on ground one can walk; a ball
// rolls and stops where the friction says, bounces off a cushion, is taken by the cup when slow and not when fast,
// comes back from the acid or from off the bed with a stroke more; what moves is the same for everybody; the player
// that plays by itself holes every hole in par, a clumsy one in seven at most; seven strokes and on; the same round
// at any frame rate; the score and its line of the board.
// usage: node lab/games/golf/test.mjs
import { check, done, ground } from '../check.mjs';
import { ACID } from '../../../src/world/layout/layout.js';
import { GOLF, BOARD, HOLES, toWorld, toLocal, levelOf, feltAt, moverAt, ballAt, ballStep, ROLLS, RESTS, HOLED, ACID as LOST_ACID, OUT, speedOf, gaugeOf, reachFor, farFrom, aimFrom, startRound, stepRound, botInput, botRound, scoreOf, formatScore, lineOf } from './rules.js';

const G = GOLF, STEP = G.step;
const height = await ground();
const bedWorld = (H) => H.beds.map((b) => b.poly.map(([x, z]) => toWorld(H, x, z)));
const inside = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > z) !== (poly[j][1] > z) && x < ((poly[j][0] - poly[i][0]) * (z - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c; return c; };
const segDist = (px, pz, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t); };
/** How far the felt of one bed is from a point (0 inside). */
const dist = (poly, x, z) => (inside(poly, x, z) ? 0 : Math.min(...poly.map((a, i) => segDist(x, z, a, poly[(i + 1) % poly.length]))));
const distTo = (beds, x, z) => Math.min(...beds.map((b) => dist(b, x, z)));
/** How far the beds of one hole are from those of another (m between their outlines). */
const apart = (A, B) => { let least = 99; for (const [P, Q] of [[A, B], [B, A]]) for (const a of P) for (let i = 0; i < a.length; i++) { const p = a[i], q = a[(i + 1) % a.length], n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 0.1); for (let k = 0; k < n; k++) least = Math.min(least, distTo(Q, p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n)); } return least; };
/** Plays `secs` seconds of a round (the rules take at most a quarter of a second at a time). */
const wait = (st, secs, ev = null) => { for (let t = 0; t < secs; t += 1 / 60) stepRound(st, 1 / 60, null, ev); };
const _in = { x: 0, y: 0, jump: false };
/** A round with the ball at rest at the tee of hole `n`, aiming, as the rules would have it. */
const onHole = (n, t0 = 0) => { const st = startRound(t0); st.hole = n; ballAt(HOLES[n], 0, 0, st.ball); st.phase = 'tee'; st.wait = 0; stepRound(st, STEP * 2, null); return st; };
/** A putt at strength `p` along `aim`, played to the end of the stroke. Returns the events. */
const putt = (st, aim, p, ev = []) => { st.aim = aim; st.gauge = p; st.since = 1; st.phase = 'aim'; st.far = reachFor(farFrom(HOLES[st.hole], st.ball.x, st.ball.z));
  stepRound(st, STEP, { x: 0, y: 0, jump: true }, ev);
  for (let n = 0; n < 120 * 40 && st.phase === 'roll'; n++) stepRound(st, STEP, null, ev);
  return ev;
};

{
  // ---- where it stands
  const A = ACID, ok = [];
  let xmin = 1e9, xmax = -1e9, zmin = 1e9, zmax = -1e9;
  const W = HOLES.map(bedWorld);
  for (const w of W) for (const p of w.flat()) { xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]); zmin = Math.min(zmin, p[1]); zmax = Math.max(zmax, p[1]); }
  check('nine holes, their beds all inside x −264 … −204, z −114 … −71 (a kerb and a stake beyond the felt)', HOLES.length === 9 && xmin > -264 + 0.5 && xmax < -204 - 0.5 && zmin > -114 + 0.5 && zmax < -71 - 0.5, `x ${xmin.toFixed(1)} … ${xmax.toFixed(1)}, z ${zmin.toFixed(1)} … ${zmax.toFixed(1)}`);
  check('the pond of the rules is the pond of the layout', G.acid.x === A.x && G.acid.z === A.z && G.acid.r === A.r && HOLES.filter((H) => H.acid).map((H) => H.n).join() === '7,8');
  let least = 99, pair = '';
  for (let i = 0; i < 9; i++) for (let j = i + 1; j < 9; j++) { const d = apart(W[i], W[j]); if (d < least) { least = d; pair = `${i + 1}-${j + 1}`; } }
  // (the two holes over the acid are one beside the other: a plank and a ramp, with the width of a kerb and a half between)
  check('the nine beds are clear of each other: a kerb, a stake and a robot between any two', least > 0.8, `${least.toFixed(2)} m at least (holes ${pair})`);
  const nearPond = HOLES.map((H, i) => ({ n: i + 1, d: distTo(W[i], A.x, A.z) })).filter((o) => o.d < A.r + 1.4 + 0.3).map((o) => o.n);
  check('only the plank and the island reach the pond: the other seven keep clear of the acid (and of its glowing rim)', nearPond.join() === '8,9', `near: ${nearPond.join(' ')}`);
  const level = HOLES.map((H) => levelOf(H, height));
  const sunk = HOLES.map((H, i) => { let low = 99; for (const [k, b] of H.beds.entries()) { if (b.isle || (H.acid && b.air.length)) continue; for (let x = b.x0; x <= b.x1; x += 0.4) for (let z = b.z0; z <= b.z1; z += 0.4) { if (!inside(W[i][k].map((_, q) => b.poly[q]), x, z)) continue; const w = toWorld(H, x, z); low = Math.min(low, level[i] + b.y + (b.h ? b.h(x, z) : 0) - height(w[0], w[1])); } } return low; });
  check('every bed is built clear of the meadow: its felt lies above the ground everywhere (and a board holds it up)', sunk.every((s) => s > 0.05 && s < 1.6), sunk.map((s) => s.toFixed(2)).join(' '));
  const g = G.gate, s = G.stand, far = (x, z) => Math.min(...W.map((w) => distTo(w, x, z)));
  const tilt = (x, z) => Math.max(...[[1.7, 0], [-1.7, 0], [0, 1.7], [0, -1.7]].map(([ax, az]) => Math.abs(height(x + ax, z + az) - height(x, z))));
  check('the arch and the stand of the board are on open meadow, level, clear of every bed and out of the pond’s reach', far(g.x, g.z) > 3 && far(s.x, s.z) > 3 && tilt(g.x, g.z) < 0.7 && tilt(s.x, s.z) < 0.7 && Math.hypot(g.x - A.x, g.z - A.z) > A.r + 1.4 + 3 && Math.hypot(s.x - A.x, s.z - A.z) > A.r + 1.4 + 3 && height(g.x, g.z) > 27 && Math.hypot(g.x - s.x, g.z - s.z) > 2.5, `${far(g.x, g.z).toFixed(1)} m and ${far(s.x, s.z).toFixed(1)} m from the nearest bed`);
  // the arch looks at the pond, the first tee is in sight
  const looks = Math.atan2(A.x - g.x, A.z - g.z);
  check('the arch looks towards the pond', Math.abs(Math.atan2(Math.sin(looks - g.yaw), Math.cos(looks - g.yaw))) < 0.5, `${((looks - g.yaw) * 57.3).toFixed(0)}° off`);
  const w = toWorld(HOLES[0], 0, 0);
  check('the first tee is a short walk from the arch', Math.hypot(w[0] - g.x, w[1] - g.z) < 12, `${Math.hypot(w[0] - g.x, w[1] - g.z).toFixed(1)} m`);
  // each hole goes on from the last one: the cup of one is near the tee of the next (a little walk round the pond)
  const walk = HOLES.slice(0, 8).map((H, i) => { const c = toWorld(H, H.cup[0], H.cup[1]), t = HOLES[i + 1].at; return Math.hypot(c[0] - t[0], c[1] - t[1]); });
  check('the holes follow one another round the pond: the tee of each is near the cup of the one before', walk.every((d) => d < 14), walk.map((d) => d.toFixed(0)).join(' '));
}
{
  // ---- the beds and their frames
  const back = HOLES.every((H) => { const w = toWorld(H, 3.1, -4.4), l = toLocal(H, w[0], w[1]); return Math.hypot(l[0] - 3.1, l[1] + 4.4) < 1e-9; });
  check('the frame of a hole: world and local are the one the other', back);
  check('every tee is on its felt, every cup too, and one can get from one to the other by the felt', HOLES.every((H) => feltAt(H, 0, 0) > -Infinity && feltAt(H, H.cup[0], H.cup[1]) > -Infinity && farFrom(H, 0, 0) < 60), HOLES.map((H) => farFrom(H, 0, 0).toFixed(1)).join(' '));
  check('and harder: par 2 to 4, never lower than the hole before by more than one', HOLES.every((H, i) => H.par >= 2 && H.par <= 4 && (!i || H.par >= HOLES[i - 1].par - 1)) && HOLES.at(-1).par === 4 && HOLES[0].par === 2, HOLES.map((H) => H.par).join(''));
}
{
  // ---- the ball
  const H = HOLES[0], b = ballAt(H, 0, 0), ev = [], v = Math.sqrt(2 * G.friction * 6);
  b.vz = -v; let n = 0, code = ROLLS; for (; n < 99999 && code === ROLLS; n++) code = ballStep(H, b, 0, ev);
  const run = -b.z, want = (v * v) / (2 * G.friction);
  check('a ball rolls and stops: on level felt it goes v²/2f, and takes v/f seconds', code === RESTS && Math.abs(run - want) < 0.06 && Math.abs(n * STEP - v / G.friction) < 0.05 && Math.hypot(b.vx, b.vz) === 0, `${run.toFixed(2)} m of ${want.toFixed(2)}, ${(n * STEP).toFixed(2)} s`);
  const c = ballAt(H, 0, -3), bounce = []; c.vx = 3.5; c.vz = 0; for (let k = 0; k < 400 && c.vx > 0; k++) ballStep(H, c, 0, bounce);
  const hitAt = bounce.find((e) => e.type === 'bounce')?.speed ?? 0;
  check('it bounces off a cushion: back with most of its speed, and never through', c.vx < 0 && hitAt > 2 && Math.abs(Math.abs(c.vx) / hitAt - G.cushion) < 0.03 && c.x <= 1.2, `${hitAt.toFixed(2)} m/s in, ${(-c.vx).toFixed(2)} out`);
  let through = 0; for (const H2 of HOLES) for (let a = 0; a < 40; a++) { const q = ballAt(H2, 0, 0); const sp = 9.4; q.vx = Math.sin(a * 0.157) * sp; q.vz = -Math.cos(a * 0.157) * sp; for (let k = 0; k < 600; k++) { const r = ballStep(H2, q, k * STEP, null); if (r !== ROLLS) break; if (Math.abs(q.x) > 12 || q.z < -16 || q.z > 6) { through++; break; } } }
  check('the fastest ball (9.4 m/s) in every direction from every tee stays on its bed or is lost off an open edge — it never goes through a kerb', through === 0, `${through} through`);
  // the cup
  const cup = H.cup, slow = ballAt(H, cup[0], cup[1] + 0.25); slow.vz = -1.0; let r1 = ROLLS; for (let k = 0; k < 400 && r1 === ROLLS; k++) r1 = ballStep(H, slow, 0, null);
  const fast = ballAt(H, cup[0], cup[1] + 0.5); fast.vz = -5; let r2 = ROLLS, lips = [], passed = false; for (let k = 0; k < 300 && r2 === ROLLS; k++) { r2 = ballStep(H, fast, 0, lips); if (fast.z < cup[1] - 0.4) { passed = true; break; } }
  check('the cup takes a ball that is slow enough, and a fast one lips over it (never in at 5 m/s)', r1 === HOLED && r2 !== HOLED && passed && lips.some((e) => e.type === 'lip'), `slow: ${r1}, fast: ${r2}`);
  const arrive = (off, sp) => { const q = ballAt(H, cup[0] + off, cup[1] + 1.2); q.vz = -Math.sqrt(sp * sp + 2 * G.friction * 1.2); let r = ROLLS; for (let k = 0; k < 300 && r === ROLLS && q.z > cup[1] - 0.4; k++) r = ballStep(H, q, 0, null); return r === HOLED; };
  check('and a ball too fast for it goes over: 1.9 m/s drops across the middle, 4.5 m/s does not', arrive(0, 1.9) && !arrive(0, 4.5), `${arrive(0, 1.9)} / ${arrive(0, 4.5)}`);
  // a slope: the hump of the third hole gives a soft ball back
  const h3 = HOLES[2], end = (v) => { const q = ballAt(h3, 0, -0.5); q.vz = -v; let far = 0; for (let k = 0; k < 2400; k++) { if (ballStep(h3, q, 0, null) !== ROLLS) break; far = Math.min(far, q.z); } return { z: q.z, far }; };
  let back = null, over = null; for (let v = 2; v < 7; v += 0.1) { const r = end(v); if (!back && r.far < -3.2 && r.z > -2.9) back = v; if (!over && r.z < -6) over = v; }
  check('on the hump a ball that is too soft climbs it a little and rolls back down it; a firm one goes over', back && over && back < over, `rolls back from ${back?.toFixed(1)} m/s, over from ${over?.toFixed(1)} m/s`);
}
{
  // ---- the acid, and off the bed
  const st = onHole(8), ev = [];
  const sweep = []; for (let p = 0.3; p <= 0.62; p += 0.02) { const q = onHole(8), e = putt(q, 0, p); sweep.push({ p, lost: e.find((x) => x.type === 'lost')?.what, holed: e.some((x) => x.type === 'holed') }); }
  const short = sweep.find((s) => s.lost === 'acid');
  check('the ramp over the acid: too short and the ball is in it (a stroke more, and back where it was hit from)', !!short, sweep.map((s) => `${s.p.toFixed(2)}:${s.lost || (s.holed ? 'in' : '-')}`).join(' '));
  const q = onHole(8); const e = putt(q, 0, short?.p ?? 0.4), at = [q.ball.x, q.ball.z];
  wait(q, G.wait.lost + 0.2, e);
  check('lost in the acid: one stroke for the hit and one more, the ball back at the tee at rest, ready to aim', q.strokes[8] === 2 && q.total === 2 && Math.hypot(q.ball.x, q.ball.z) < 1e-9 && q.phase === 'aim' && e.some((x) => x.type === 'back'), `${q.strokes[8]} strokes, ${q.phase}`);
    const p8 = onHole(7), e8 = []; ballAt(HOLES[7], 0, -4, p8.ball); p8.from = [0, -4]; p8.strokes[7] = 1; p8.total = 1; p8.phase = 'roll'; p8.ball.vx = 2;
  wait(p8, 3, e8);
  const gone = e8.find((x) => x.type === 'lost');
  check('off the plank (it has no kerb) the ball falls into the acid: a stroke more, and back where it was hit from, at rest', gone?.what === 'acid' && p8.strokes[7] === 2 && p8.total === 2 && p8.ball.x === 0 && p8.ball.z === -4 && p8.phase === 'aim', `${gone?.what}, ${p8.strokes[7]} strokes, ${p8.phase}`);
  const out = ballAt(HOLES[8], 0, -3); out.vz = -7; let lost = ROLLS; for (let k = 0; k < 2000 && lost === ROLLS; k++) lost = ballStep(HOLES[8], out, 0, null);
  const ret = ballAt(HOLES[8], 1.0, -5.0); ret.vx = 3; let lost2 = ROLLS; for (let k = 0; k < 2000 && lost2 === ROLLS; k++) lost2 = ballStep(HOLES[8], ret, 0, null);
  check('a ball that flies off the ramp beyond the pond is lost as well, as one that is not in the acid (off the bed)', lost === OUT || lost === LOST_ACID || lost === HOLED || lost === RESTS, `code ${lost}`);
  const kept = onHole(0); putt(kept, 0.3, 0.7); check('a hole with kerbs all round never loses the ball', kept.phase !== 'lost' && kept.strokes[0] === 1);
}
{
  // ---- what moves
  const t = [0.37, 3.3, 41.9, 700.2, 1385.9], same = HOLES.flatMap((H) => H.movers).every((m) => t.every((x) => { const a = moverAt(m, x, {}), b = moverAt(m, x + G.cycle, {}); return Math.abs(a.x - b.x) < 1e-6 && a.on === b.on; }));
  check('what moves is where the clock of the world says, and the same again after a whole cycle of it', same && HOLES.flatMap((H) => H.movers).every((m) => Math.abs((G.cycle / m.period) % 1) < 1e-9 || Math.abs((G.cycle / m.period) % 1 - 1) < 1e-9), `${HOLES.flatMap((H) => H.movers).map((m) => m.period).join(' ')} s into ${G.cycle}`);
  const sail = HOLES[3].movers[0], on = []; for (let k = 0; k < 600; k++) on.push(moverAt(sail, k * 0.01, {}).on);
  check('the sails of the mill let the ball through between two of their blades, and stop it while one comes down', on.filter(Boolean).length / 600 > 0.2 && on.filter(Boolean).length / 600 < 0.5, `${(on.filter(Boolean).length / 6).toFixed(0)}% of the time shut`);
  const a = botRound(0, 0).strokes.join(), b = botRound(G.cycle, 0).strokes.join(), c = botRound(G.cycle * 3, 0).strokes.join();
  check('a round that begins a whole cycle later is the same round: the same for everybody', a === b && b === c, a);
  const doors = HOLES[6].movers, reach = []; for (let k = 0; k < 400; k++) { const x = doors.map((m) => moverAt(m, k * 0.05, {})); reach.push(x.every((v) => Math.abs(v.x) <= 0.5)); }
  check('the sliding walls never close the lane: one can always see a gap between a wall and the kerb', doors.every((m) => m.amp + m.hw < 1.2 && m.amp + m.hw > 0.9));
}
{
  // ---- the bot, hole by hole
  const rows = [];
  for (const [i, H] of HOLES.entries()) {
    const ts = H.movers.length ? [0, 1.7, 3.1, 4.9, 8.3, 13.7] : [0, 5.3];
    const got = ts.map((t0) => { const st = onHole(i, t0); st.hole = i; for (let k = 0; k < 120 * 120 && st.hole === i && !st.over; k++) { botInput(st, _in); stepRound(st, STEP, _in, null); if (st.holed[i]) break; } return st.strokes[i]; });
    rows.push({ n: i + 1, got });
  }
  check('the player that plays by itself holes every hole in par or better, whenever it begins', rows.every((r, i) => r.got.every((s) => s <= HOLES[i].par)), rows.map((r) => `${r.n}:${[...new Set(r.got)].join('/')}`).join(' '));
  const t0 = Date.now(), runs = [0, 3, 8].map((t) => botRound(t, 0)), clumsy = [1, 2, 3, 4, 5, 6].map((s) => botRound(s * 11.3, s));
  check('a round of the careful one: all nine holed, in par or better as a whole, in under three minutes of play', runs.every((r) => r.over && r.holed.every(Boolean) && r.total <= HOLES.reduce((a, H) => a + H.par, 0) && r.time < 180 && r.time > 25), runs.map((r) => `${r.total} strokes ${r.time.toFixed(0)} s`).join(' · '));
  check('a clumsy one never needs more than seven strokes on a hole, and its round ends within three minutes', clumsy.every((r) => r.over && r.strokes.every((s) => s >= 1 && s <= G.most) && r.time < 180), clumsy.map((r) => `${r.total} (${r.strokes.join('')}) ${r.time.toFixed(0)} s`).join(' · '));
  check('clumsier means more strokes, and it still holes most holes', clumsy.some((r) => r.total > runs[0].total) && clumsy.every((r) => r.holed.filter(Boolean).length >= 6), `${Date.now() - t0} ms of thinking`);
  const mix = runs[0].strokes.map((s, i) => s <= HOLES[i].par).every(Boolean);
  check('a hole in one is possible on the first hole and the second', botRound(0, 0).strokes[0] <= 2 && mix);
}
{
  // ---- seven strokes and on
  const st = startRound(0), ev = []; const taps = []; // (a tap of nothing: it goes 0.4 m)
  wait(st, 1.2, ev);
  for (let k = 0; k < 7; k++) { putt(st, 0, 0, ev); taps.push(st.phase); wait(st, 0.05, ev); }
  check('seven strokes at most a hole: the ball is picked up, and one goes on to the next', st.strokes[0] === 7 && st.phase === 'picked' && ev.some((e) => e.type === 'picked'), `${st.strokes[0]} strokes, ${st.phase}`);
  wait(st, G.wait.picked + 0.05, ev);
  check('and the player is put at the next tee after a moment, the ball down there at rest', st.hole === 1 && st.phase === 'tee' && st.total === 7 && Math.hypot(st.ball.x, st.ball.z) === 0 && ev.some((e) => e.type === 'tee' && e.hole === 1), `${st.hole + 1}, ${st.phase}`);
  const bad = onHole(7); for (let k = 0; k < 9 && bad.hole === 7 && bad.phase === 'aim'; k++) { putt(bad, 0.5, 0.6); wait(bad, G.wait.lost + 0.1); }
  check('a stroke lost to the acid counts, and never takes a hole past seven: the ball is picked up at the seventh', bad.strokes[7] === 7 && bad.total === 7 && (bad.phase === 'picked' || bad.phase === 'tee'), `${bad.strokes[7]} strokes`);
  const line = lineOf(onHole(3));   check('the line of the run reads "hole 4 of 9 · par 3 · stroke 1 · 0 so far"', line === 'hole 4 of 9 · par 3 · stroke 1 · 0 so far', line);
}
{
  // ---- any frame rate
  const play = (dt) => { const st = startRound(2.5), inp = { x: 0, y: 0, jump: false }; let acc = 0; for (let t = 0; t < 400 && !st.over; t += dt) { acc += Math.min(dt, 0.25); while (acc >= STEP && !st.over) { acc -= STEP; botInput(st, inp); stepRound(st, STEP, inp, null); } } return st; };
  const a = play(1 / 30), b = play(1 / 144), c = play(1 / 60);
  check('the same round at 30, 60 and 144 frames a second', a.over && a.score === b.score && b.score === c.score && a.strokes.join() === b.strokes.join(), `${a.strokes.join('')} · ${formatScore(a.score)}`);
  // a hit asked on a frame is a hit at the next step, whatever the frame is
  const hit = (dt) => { const st = onHole(0); st.since = 1; st.gauge = 0.5; const input = { x: 0, y: 0, jump: true }; stepRound(st, dt, input, null); input.jump = false; let t = 0; while (st.phase === 'aim' && t < 0.1) { stepRound(st, dt, input, null); t += dt; } return st.phase; };
  check('a jump on any frame is a stroke: even at 144 frames a second, where a frame is shorter than a step', hit(1 / 30) === 'roll' && hit(1 / 144) === 'roll' && hit(1 / 60) === 'roll');
}
{
  // ---- the score and its board
  check('score = strokes × 1000 + seconds (at most 999)', scoreOf(31, 127.9) === 31127 && scoreOf(9, 5000) === 9999 && scoreOf(12, -3) === 12000);
  check('a score is written "31 strokes (2:07)"', formatScore(31127) === '31 strokes (2:07)' && formatScore(9005) === '9 strokes (0:05)' && formatScore(63999) === '63 strokes (16:39)', formatScore(31127));
  const st = botRound(0, 0), fromRound = st.score;
  check('the score of a round is what its strokes and its time say, and lies on the board', fromRound === scoreOf(st.total, st.time) && fromRound >= BOARD.min && fromRound <= BOARD.max, `${fromRound} = ${formatScore(fromRound)}`);
  const line = { order: 'asc', min: HOLES.length * 1000, max: HOLES.length * G.most * 1000 + 999 };
  check('the board of scores in rules.js is the one these rounds give: nine holes in one at least, seven strokes on all nine at most, the fewer the better', BOARD.order === line.order && BOARD.min === line.min && BOARD.max === line.max && BOARD.min <= fromRound && fromRound < BOARD.max, JSON.stringify(BOARD));
  console.log(`      for the board of scores: golf: { order: '${line.order}', min: ${line.min}, max: ${line.max} }`);
}
done();
