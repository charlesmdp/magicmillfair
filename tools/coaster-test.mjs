// Checks of Hold the Rails!, without a browser: the line is long, goes round the three ranges of the valley,
// never dips under the ground of the world nor stands on stilts taller than a coaster's, keeps clear of what
// stands there already and of where one walks; the car is not held by its rails — a bend throws it out, a banked
// one less, a crest lightens it, the stick brings it back, and beyond the sleepers it falls: seconds lost, never
// the run; a hand with a person's limits rides it clean, and nobody gets round by doing nothing.
// usage: node tools/coaster-test.mjs            (its last line is its line for server/scores.js)
import { ground } from './lib/check.mjs';
import { COASTER, WAY, course, railAt, railPoint, railNear, frameAt, pushAt, lightAt, roomAt, rampAt, capAt, startRun, stepRun, carPose, heatOf, botInput, botRun, fastest } from '../src/world/zones/games/coaster/rules.js';
import { BOUNDS, GLADE, COVE, NORTH } from '../src/world/layout/layout.js';
import { slideCourse, SLIDE } from '../src/world/zones/games/slide/track.js';
import { RAFT } from '../src/world/zones/games/raft/rules.js';
import { BOARDS } from '../server/scores.js';

const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };
const K = COASTER, c = course(), P = c.points, height = await ground();
const inside = (poly, x, z) => { let q = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) q = !q; } return q; };
const sec = (ms) => `${(ms / 1000).toFixed(1)} s`;
const at = (name) => c.marks.get(name);
/** A car put at metre `s` of the line, `u` across, going at `v`. */
const put = (s, u = 0, v = 15) => { const st = startRun(c); Object.assign(st, { q: s, s, u, v }); st.flag = Math.max(0, c.flags.findLastIndex((f) => f.s <= s)); return st; };
/** Runs it `secs` seconds: `drive(st, input, t)` fills the input (a burst asked there is one press). Returns what happened. */
const run = (st, secs, drive, stop) => { const input = { x: 0, y: 0, boost: false }, events = [], seen = []; for (let t = 0; t < secs && !st.over; t += K.step) { input.boost = false; drive?.(st, input, t); stepRun(st, K.step, input, events); for (const e of events) seen.push({ ...e, t, s: st.s }); events.length = 0; if (stop?.(st, seen)) break; } return seen; };
const lifted = (s) => c.lifts.some((l) => s >= l.from - 1 && s <= l.to + 1);
const segDist = (x, z, ax, az, bx, bz) => { const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2))); return Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t); };

// ---------------------------------------------------------------------------------------------- the line
{
  const north = P.filter((p) => p.z < -250).length, west = P.filter((p) => p.x < -290).length, south = P.filter((p) => p.z > 250).length;
  check('a long line: two to three kilometres of rail', c.track >= 2000 && c.track <= 3000 && c.length > 1900, `${c.track.toFixed(0)} m of rail, ${c.length.toFixed(0)} m on the map, from ${Math.min(...P.map((p) => p.y)).toFixed(0)} m to ${c.top.toFixed(0)} m over the sea`);
  check('it goes round every mountain of the valley: the northern range, the western, the southern — hundreds of metres of it in each', north > 350 && west > 500 && south > 450 && Math.min(...P.map((p) => p.x)) < -470 && Math.min(...P.map((p) => p.z)) < -300 && Math.max(...P.map((p) => p.z)) > 290, `${north} m north of z -250, ${west} m west of x -290, ${south} m south of z 250`);
  // the ground of the world, under the whole width of the sleepers, all along
  let low = 1e9, lowAt = 0, high = -1e9, highAt = 0, out = 0;
  const q = {}, quiet = (s) => s < at('lift1') + 4 || s > at('finish') + 4;
  let lowQuiet = 1e9;
  for (let s = 0; s <= c.length; s += 1) {
    const p = railAt(c, s);
    let g = -1e9;
    for (const u of [-2.4, -1.2, 0, 1.2, 2.4]) { railPoint(c, s, u, 0, q); g = Math.max(g, height(q.x, q.z)); if (Math.abs(q.x) > 506 || Math.abs(q.z) > 506) out++; }
    const over = p.y - g;
    if (quiet(s)) lowQuiet = Math.min(lowQuiet, over); else if (over < low) { low = over; lowAt = s; }
    if (over > high) { high = over; highAt = s; }
  }
  check('never under the ground: the ground of the world lies under the rails all along, across the whole width of the sleepers — and the line stays in the world', low > 2.5 && lowQuiet > 1.2 && out === 0, `${low.toFixed(1)} m over it at the least (at metre ${lowAt}); ${lowQuiet.toFixed(1)} m in the station and at the terminus`);
  check('it stands on trestles a coaster could stand on: never more than forty-odd metres over the rock', high < 43, `${high.toFixed(1)} m at the most (at metre ${highAt})`);
  // what stands there already
  const slide = slideCourse(), near = (x, z, list) => { let d = 1e9; for (const p of P) for (const [ax, az] of list) d = Math.min(d, Math.hypot(p.x - ax, p.z - az)); return d; };
  let dSlide = 1e9; for (const line of slide.lines) for (let i = 0; i < line.points.length; i += 3) { const a = line.points[i]; for (let j = 0; j < P.length; j += 3) dSlide = Math.min(dSlide, Math.hypot(P[j].x - a.x, P[j].z - a.z)); }
  const d = { slide: dSlide, dog: near(0, 0, [[NORTH.ledge.x, NORTH.ledge.z], [212, -296]]), sanctuary: near(0, 0, [[-189, -124]]), stairway: near(0, 0, [[-312, 60]]), temple: near(0, 0, [[-380, 36]]), glade: near(0, 0, [[GLADE.x, GLADE.z]]), cove: near(0, 0, [[COVE.x, COVE.z]]), mineStation: near(0, 0, [[-263, -60]]) };
  let torrent = 1e9, river = 1e9; for (const p of P) { torrent = Math.min(torrent, segDist(p.x, p.z, -268, 116, GLADE.x, GLADE.z)); river = Math.min(river, Math.hypot(Math.max(0, 258 - p.x), Math.max(0, p.z + 351))); }
  check('it keeps clear of what stands in the mountains: the slide, the golden dog and its cove, Wild River, the Sanctuary, the Stairway, the Lost Temple, the waterfall and its torrent, the High Clearing, the secret cove',
    d.slide > 40 && d.dog > 120 && river > 150 && d.sanctuary > 100 && d.stairway > 90 && d.temple > 45 && torrent > 60 && d.glade > 70 && d.cove > 100,
    `the slide ${d.slide.toFixed(0)} m off in plan, the dog ${d.dog.toFixed(0)}, the river ${river.toFixed(0)}, the Sanctuary ${d.sanctuary.toFixed(0)}, the Stairway ${d.stairway.toFixed(0)}, the Temple ${d.temple.toFixed(0)}, the torrent ${torrent.toFixed(0)}, the Clearing ${d.glade.toFixed(0)}, the secret cove ${d.cove.toFixed(0)}`);
  // the Little Mine Train: most of its line is in the rock; what stands in the open air is its station corner at the
  // north-west of the acid-pond meadow (x -255…-210, z -140…-98, up to y 32) and its high run on two bare terraces
  // (x -270…-143, z -300…-265, up to y 130). The coaster passes each 25 m away on the map, or 25 m above its top.
  const BOXES = [{ name: 'its station', x0: -255, x1: -210, z0: -140, z1: -98, top: 32 }, { name: 'its high run', x0: -270, x1: -143, z0: -300, z1: -265, top: 130 }];
  const off = (p, q) => Math.hypot(Math.max(0, q.x0 - p.x, p.x - q.x1), Math.max(0, q.z0 - p.z, p.z - q.z1));
  const crowd = P.filter((p) => BOXES.some((q) => off(p, q) < 25 && p.y < q.top + 25)), nearRun = Math.min(...P.map((p) => off(p, BOXES[1]))), over = P.filter((p) => off(p, BOXES[1]) < 25);
  check('and of the Little Mine Train, where it runs in the open: 25 m from its station corner and from its high terraces on the map — or 25 m above their tops', crowd.length === 0 && d.mineStation > 150 && Math.min(...P.map((p) => off(p, BOXES[0]))) > 100,
    `${nearRun.toFixed(0)} m north of its high run at the nearest${over.length ? `, but for ${over.length} m of the second lift, ${(Math.min(...over.map((p) => p.y)) - 130).toFixed(0)} m above its top` : ''}; its station ${Math.min(...P.map((p) => off(p, BOXES[0]))).toFixed(0)} m off`);
  // (…and against its own rules, once they are in this branch: every metre of its rails that is in the open air)
  {
    const mine = await import('../src/world/zones/games/mine/rules.js').catch(() => null), pts = mine?.course?.().pts?.filter((p) => ['station', 'open', 'trestle'].includes(p.kind)) || [];
    let nearest = 1e9, bad = 0;
    for (const m of pts) for (let i = 0; i < P.length; i += 2) { const dd = Math.hypot(m.x - P[i].x, m.z - P[i].z); if (dd < nearest) nearest = dd; if (dd < 25 && P[i].y - m.y < 25) bad++; }
    check('…checked against its own rails, metre by metre', bad === 0, pts.length ? `${pts.length / 2} m of its rails are in the open air; the coaster is never nearer than ${nearest.toFixed(0)} m on the map` : 'its rules are not in this branch yet: only its two boxes were checked');
  }
  // where one walks
  const walked = P.filter((p) => inside(BOUNDS, p.x, p.z)), mid = walked.filter((p) => p.s > at('lift1') + 12 && p.s < at('finish') + 4);
  check('over ground nobody walks: only its station and its terminus stand where one does', mid.length === 0 && walked.length > 20 && walked.length < 140, `${walked.filter((p) => p.s < 100).length} m of it at the station, ${walked.filter((p) => p.s > 100).length} m at the terminus`);
  // itself
  let nearSelf = 1e9, crossings = 0, gapAbove = 1e9;
  for (let i = 0; i < P.length; i += 2) for (let j = i + 60; j < P.length; j += 2) {
    const dd = Math.hypot(P[i].x - P[j].x, P[i].z - P[j].z);
    if (dd < 3) { crossings++; gapAbove = Math.min(gapAbove, Math.abs(P[i].y - P[j].y)); } else if (Math.abs(P[i].y - P[j].y) < 8) nearSelf = Math.min(nearSelf, dd);
  }
  check('it never meets itself — but once, at the Whirl, where the way in passes high over the way out', crossings > 0 && crossings < 12 && gapAbove > 8 && nearSelf > 10, `${gapAbove.toFixed(1)} m between the two at the Whirl; elsewhere two stretches at one height are never nearer than ${nearSelf.toFixed(0)} m`);
  // its shape
  const free = P.filter((p) => !lifted(p.s)), steep = Math.max(...free.map((p) => Math.abs(p.rise))), tight = 1 / Math.max(...P.map((p) => Math.abs(p.k)));
  const first = P.filter((p) => p.s > at('drop1') + 25 && p.s < 1000 && !lifted(p.s) && p.s < at('west') - 30), last = P.filter((p) => p.s > c.length - 1000);
  const rFirst = 1 / Math.max(...first.map((p) => Math.abs(p.k))), rLast = 1 / Math.max(...last.map((p) => Math.abs(p.k)));
  check('the first kilometre forgives, the last does not: wide bends and a wide tolerance first, tight ones and a narrow one at the end', rFirst > 38 && rLast < 25 && tight > 16 && P[300].lim === K.lim[0] && Math.abs(P[P.length - 300].lim - K.lim[1]) < 0.02 && K.lim[0] >= 1.4 && K.lim[1] <= 1.05,
    `past the top of the first lift no bend tighter than ${rFirst.toFixed(0)} m in the first kilometre, ${rLast.toFixed(0)} m in the last; one may be ${K.lim[0]} m off the middle at first, ${K.lim[1]} m at the end`);
  check('it is a coaster, not a wall: off its lifts nowhere steeper than 52 degrees', steep < 1.28, `${(Math.atan(steep) * 57.3).toFixed(0)}° at the steepest`);
  const rises = c.lifts.map((l) => railAt(c, l.to).y - railAt(c, l.from).y);
  check('three lifts, one for each range: the chain takes the car up, and the eyes rest', c.lifts.length === 3 && rises.every((r) => r > 40), rises.map((r, i) => `${r.toFixed(0)} m in ${((railAt(c, c.lifts[i].to).t - railAt(c, c.lifts[i].from).t) / K.chain).toFixed(0)} s`).join(', '));
  const gaps = c.flags.slice(1).map((f, i) => f.s - c.flags[i].s - c.lifts.reduce((sum, l) => sum + Math.max(0, Math.min(f.s, l.to) - Math.max(c.flags[i].s, l.from)), 0)), bad = c.flags.filter((f) => c.gaps.some((g) => f.s > g.from - g.run - 4 && f.s < g.to + 2) || c.lost.some((g) => f.s > g.from - 5 && f.s < g.to + 2));
  check('a flag on a pylon every so often: a save never further than 150 m of rails one has to hold (a lift is not counted), none where the rails are broken', c.flags.length >= 14 && Math.max(...gaps) < 150 && bad.length === 0 && c.flags[0].s < 10, `${c.flags.length} flags, ${Math.round(Math.max(...gaps))} m apart at the most`);
  check('eight kinds of moment at least: lifts, a first drop, banked bends, crests that lighten, a whirl over itself, a switchback, a dive into a hollow, gaps to fly, rails missing, a horseshoe, a last dive',
    c.gaps.length >= 3 && c.lost.length >= 3 && c.stretches.length >= 12 && P.some((p) => p.kv < -0.02) && P.some((p) => p.kv > 0.02) && P.some((p) => Math.abs(p.bank) > 0.45),
    `${c.stretches.length} stretches · ${c.gaps.length} gaps (${c.gaps.map((g) => (g.to - g.from).toFixed(0)).join(', ')} m), ${c.lost.length} stretches with a rail missing (${c.lost.map((g) => (g.to - g.from).toFixed(0)).join(', ')} m)`);
  check('what is in the way never moves: the line is the same for everybody, try after try', JSON.stringify(course().gaps) === JSON.stringify(c.gaps) && course() === c && WAY.length > 40);
  // the gate
  const G = K.gate, gy = height(G.x, G.z), sg = SLIDE.gate, rg = RAFT.gate;
  check('one asks to play at the back of the north beach: ground one walks, dry, by the station — clear of the gates of the slide and of the river', inside(BOUNDS, G.x, G.z) && gy > 1 && gy < 8 && Math.hypot(G.x - sg.x, G.z - sg.z) > 18 && Math.hypot(G.x - rg.x, G.z - rg.z) > 12 && Math.hypot(G.x - P[0].x, G.z - P[0].z) < 12,
    `(${G.x}, ${G.z}), ${gy.toFixed(1)} m over the sea; ${Math.hypot(G.x - sg.x, G.z - sg.z).toFixed(0)} m from the slide's gate, ${Math.hypot(G.x - rg.x, G.z - rg.z).toFixed(0)} m from the river's, ${Math.hypot(G.x - P[0].x, G.z - P[0].z).toFixed(0)} m from the car that waits`);
}

// ---------------------------------------------------------------------------------------------- the car is not held by the rails
{
  // a bend of the flank, in the first kilometre: where it is tightest
  const bendS = P.filter((p) => p.s > at('dip1') - 20 && p.s < at('hump1') - 30).reduce((a, b) => (Math.abs(b.k) > Math.abs(a.k) ? b : a)).s, pb = railAt(c, bendS);
  const slow = pushAt(pb, 12), fast = pushAt(pb, 24), flat = pushAt({ ...pb, bank: 0 }, 24);
  check('speed pushes the car to the outside of a bend — nothing at the speed its lean was made for, more and more above it; a banked bend less than a flat one', slow === 0 && Math.abs(fast) > 2 && Math.abs(flat) > Math.abs(fast) + 2 && Math.sign(fast) === Math.sign(pb.k),
    `a bend of ${Math.abs(1 / pb.k).toFixed(0)} m leaning ${(Math.abs(pb.bank) * 57.3).toFixed(0)}°: ${Math.abs(fast).toFixed(1)} m/s² at 24 m/s (${Math.abs(flat).toFixed(1)} if it lay flat), nothing at 12`);
  // the stick untouched, at speed: out, and back at the last flag
  const a = put(bendS - 30, 0, 23), seen = run(a, 12, (st) => { if (st.falls === 0) st.v = 23; }, (st, ev) => ev.some((e) => e.type === 'back'));
  const fell = seen.find((e) => e.type === 'fall'), back = seen.find((e) => e.type === 'back');
  check('the stick untouched, the bend throws it off: beyond the sleepers it falls — and is put back on the rails at the last flag, the clock running: seconds lost, never the run', !!fell && fell.why === 'out' && !!back && Math.abs(a.s - c.flags[back.flag].s) < 1 && a.falls === 1 && !a.over && a.clock > K.fall.time && Math.sign(fell.side) === Math.sign(pb.k),
    fell ? `off at metre ${fell.s.toFixed(0)}, to the ${fell.side > 0 ? 'right' : 'left'}; back at "${c.flags[back?.flag ?? 0].name}" ${(back.t - fell.t).toFixed(1)} s later` : 'it held');
  // …and the stick holds it
  const b = put(bendS - 30, 0, 23), held = run(b, 6, (st, input) => { st.v = 23; const p = railAt(st.line, st.q + st.v * 0.1); input.x = Math.max(-1, Math.min(1, (-pushAt(p, st.v) - 8 * st.u - 3 * st.vu) / K.steer)); }, (st) => st.s > Math.min(bendS + 34, c.lost[0].from - 3));
  check('the stick brings it back: leaning against the bend, the same car at the same speed stays on the rails', !held.some((e) => e.type === 'fall') && b.s > bendS + 15, `${Math.abs(b.u).toFixed(2)} m off the middle at the end of it`);
  const tol = (s, u) => { const st = put(s, u, 5); run(st, 0.3, (q, input) => { input.y = -1; }); return st.fall > 0; };
  check('how far it may stray is how wide the sleepers are: a metre and a half at first, a metre at the end', !tol(300, 1.4) && tol(300, 1.55) && !tol(c.length - 250, 0.93) && tol(c.length - 250, 1.08));
  // a crest lightens it
  const crest = P.filter((p) => !lifted(p.s)).reduce((x, y) => (y.kv < x.kv ? y : x)), dip = P.reduce((x, y) => (y.kv > x.kv ? y : x));
  const across = (s, v) => { const st = put(s - v * 0.15, 0, v); run(st, 0.3, (q, input) => { input.x = 1; q.v = v; }); return st.u; };
  const flatS = at('leap') + 2, onCrest = across(crest.s, 22), onFlat = across(flatS, 22);
  check('a crest lightens the car, a dip weighs on it: over a crest the stick bites less', lightAt(crest, 22) < 0.6 && lightAt(dip, 22) > 1.15 && lightAt(railAt(c, flatS), 22) > 0.9 && onCrest < onFlat * 0.8, `at 22 m/s: ${lightAt(crest, 22).toFixed(2)} of its weight over the crest at metre ${crest.s.toFixed(0)}, ${lightAt(dip, 22).toFixed(2)} in the dip at ${dip.s.toFixed(0)}; full stick for 0.3 s takes it ${onCrest.toFixed(2)} m across on the crest, ${onFlat.toFixed(2)} m on the level`);
  // forward, back
  const sp = (y) => { const st = put(flatS - 10, 0, 12); run(st, 2.5, (q, input) => { input.y = y; }); return st.v; };
  const coast = sp(0), on = sp(1), braked = sp(-1);
  check('stick forward lets it run, stick back brakes', on > coast + 2 && braked < coast - 5 && braked >= K.creep, `after 2.5 s from 12 m/s on the level: ${coast.toFixed(1)} m/s coasting, ${on.toFixed(1)} running, ${braked.toFixed(1)} braking`);
  // the burst
  const one = put(flatS - 10, 0, 12), ev1 = run(one, 2, (q, input, t) => { input.y = 1; if (t === 0) input.boost = true; });
  const heldDown = put(c.lifts[1].to + 6, 0, 12), ev2 = run(heldDown, 11, (q, input) => { input.y = 0; input.boost = true; q.u = 0; q.vu = 0; q.v = Math.min(q.v, 14); }, (q) => q.fall > 0);
  check('the one button is a burst of speed, and it comes back: pressed, it throws the car forward; held down, it is one burst every five seconds, no more', ev1.filter((e) => e.type === 'boost').length === 1 && one.v > on + 4 && K.boost.rest >= 4 && ev2.filter((e) => e.type === 'boost').length <= 3 && ev2.filter((e) => e.type === 'boost').length >= 2,
    `${one.v.toFixed(1)} m/s after 2 s with a burst, ${on.toFixed(1)} m/s after 2.5 s without; ${ev2.filter((e) => e.type === 'boost').length} bursts in ${Math.min(11, heldDown.clock).toFixed(0)} s with the button held`);
  // a lift
  const l = c.lifts[0], up = put(l.from - 4, 0.6, 5), evl = run(up, 60, null, (q) => q.s > l.to + 2);
  check('on a lift the chain does it all: the car is taken up in the middle of the rails, at the speed of the chain, whatever one does', evl.some((e) => e.type === 'lift') && evl.some((e) => e.type === 'top') && !evl.some((e) => e.type === 'fall') && Math.abs(up.u) < 0.2 && up.clock < (railAt(c, l.to).t - railAt(c, l.from).t) / K.chain + 4,
    `${(railAt(c, l.to).y - railAt(c, l.from).y).toFixed(0)} m up in ${up.clock.toFixed(1)} s`);
}

// ---------------------------------------------------------------------------------------------- gaps, rails missing, flags
{
  // every gap: flown at the speed it needs, short below it
  const fly = (g, v) => { const st = put(g.from - 3, 0, v); const seen = run(st, 6, (q, input) => { if (!q.air && q.q < g.from) q.v = v; input.y = 1; }, (q, ev) => ev.some((e) => e.type === 'land' || e.type === 'fall')); return seen; };
  const ok = c.gaps.every((g) => fly(g, g.need + 0.5).some((e) => e.type === 'land') && fly(g, g.need - 1.5).some((e) => e.type === 'fall' && e.why === 'gap') && fly(g, K.top).some((e) => e.type === 'land'));
  check('a gap is flown off its ramp at speed: at the speed it needs and above, the car lands on the far rails; slower, it falls short — and is back at the flag before it', ok && c.gaps[0].need < 14 && c.gaps.slice(1).every((g) => g.need > 16 && g.need < 22),
    c.gaps.map((g) => `${(g.to - g.from).toFixed(0)} m at metre ${g.from.toFixed(0)}: ${g.need} m/s`).join(' · '));
  check('the ramp before a gap curls up to its lip, and the car rides it', c.gaps.every((g) => rampAt(c, g.from) === g.lip && rampAt(c, g.from - g.run / 2) > 0 && rampAt(c, g.from - g.run - 1) === 0 && rampAt(c, g.from + 1) === 0) && carPose(put(c.gaps[0].from - 0.01)).y > railAt(c, c.gaps[0].from).y + c.gaps[0].lip - 0.05);
  // every stretch with a rail missing
  const pass = (g, u) => { const st = put(g.from - 2, u, 12); const seen = run(st, 6, (q, input) => { q.v = 12; const p = railAt(q.line, q.q); input.x = Math.max(-1, Math.min(1, (-pushAt(p, q.v) - 9 * (q.u - u) - 3 * q.vu) / K.steer)); }, (q, ev) => q.s > g.to + 2 || ev.some((e) => e.type === 'fall')); return seen.find((e) => e.type === 'fall'); };
  const kept = c.lost.every((g) => !pass(g, -g.side * 0.6)), mid = c.lost.every((g) => pass(g, 0)?.why === 'rail'), wrong = c.lost.every((g) => !!pass(g, g.side * 0.6));
  check('where a rail is missing one keeps to the other: on its side of the middle the car passes; in the middle, or on the side of the missing one, it falls', kept && mid && wrong, c.lost.map((g) => `${(g.to - g.from).toFixed(0)} m at metre ${g.from.toFixed(0)}, the ${g.side < 0 ? 'left' : 'right'} rail`).join(' · '));
  const r = roomAt(c, c.lost[0].from + 5, 1.5);
  check('…and the room it leaves is from a hand beyond the middle to the end of the sleepers on that side', (c.lost[0].side < 0 ? r[0] === K.lost.keep && r[1] === 1.5 : r[1] === -K.lost.keep && r[0] === -1.5));
  // three falls from the same flag
  const g2 = c.gaps[1], m = put(c.flags.findLast((f) => f.s < g2.from - 30).s, 0, 9), backs = run(m, 200, (q, input) => { input.y = -1; }, (q, ev) => ev.filter((e) => e.type === 'back').length >= K.mercy).filter((e) => e.type === 'back');
  check('nobody is left stuck: fallen three times running from the same flag, one is put back at the next', backs.length === K.mercy && backs[K.mercy - 1].on && !backs[0].on && c.flags[backs[K.mercy - 1].flag].s > g2.to, `braking all the way, one falls short of the gap of the Hollow ${backs.length} times, and is then put down beyond it`);
  // a flag is a save, and one leaves it rolling with the burst at hand
  const f = c.flags[2], sv = put(f.s - 12, 0, 10), evf = run(sv, 30, (q, input, t) => { input.y = 1; if (t === 0) input.boost = true; if (q.s > f.s + 5 && q.falls === 0) q.u = 9; }, (q, ev) => ev.some((e) => e.type === 'back'));
  check('a flag passed is a save: fallen beyond it, one is back at it — rolling, in the middle of the rails, the burst at hand again', evf.some((e) => e.type === 'boost') && evf.some((e) => e.type === 'flag' && e.n === 2) && Math.abs(sv.s - f.s) < 1 && sv.u === 0 && sv.v === K.fall.v && sv.cool <= 0 && sv.set > 0);
}

// ---------------------------------------------------------------------------------------------- the others, the starts, the music
{
  let worst = 0; const q = {}, o = {};
  for (let s = 8; s < c.length - 8; s += 5) for (const u of [-1, 0, 1]) { railPoint(c, s, u, 0.4, q); const back = railNear(c, q.x, q.z, q.y, 8, o); worst = Math.max(worst, back ? Math.hypot(back.s - s, back.u - u) : 99); }
  const pose = carPose(put(900, 0.5, 15)), there = railNear(c, pose.x, pose.z, pose.y);
  check('the others see one\'s car where one is: a place of the world is found again on the line, anywhere along it — at the Whirl too, where the height tells the two rails apart', worst < 0.8 && Math.abs(there.s - 900) < 0.6 && Math.abs(there.u - 0.5) < 0.2 && railNear(c, K.gate.x, K.gate.z + 12, 4) === null, `${worst.toFixed(2)} m off at the worst`);
  const a = startRun(c, { wait: 4.2 }), ev = run(a, 6, (st, input) => { input.y = 1; });
  check('a start every ten seconds: one waits for it in the station, counted in, and the clock starts with it', K.every === 10 && ev.filter((e) => e.type === 'tick').map((e) => e.n).join() === '3,2,1' && ev.some((e) => e.type === 'go') && Math.abs(a.clock - 1.8) < 0.05 && a.s > c.start, `the clock at ${a.clock.toFixed(2)} s, 1.8 s after the start`);
  const w = startRun(c, { wait: 3 }), h0 = heatOf(w), hs = [];
  { const st = startRun(c), input = { x: 0, y: 0, boost: false }; for (let t = 0; t < 400 && !st.over; t += K.step) { botInput(st, 'steady', input); stepRun(st, K.step, input); if (Math.round(t / K.step) % 240 === 0) hs.push(heatOf(st)); } }
  check('its music follows the run: nothing while one waits, more as it goes, as it speeds, as the car nears the edge — never out of 0 … 1', h0 === 0 && hs.every((h) => h >= 0 && h <= 1) && hs[hs.length - 2] > hs[2] + 0.3 && Math.max(...hs) > 0.75, `${hs[2].toFixed(2)} on the first lift, ${Math.max(...hs).toFixed(2)} at the most`);
}

// ---------------------------------------------------------------------------------------------- who rides it
let line = '';
{
  const steady = botRun(c, 'steady'), keen = botRun(c, 'keen'), clumsy = botRun(c, 'clumsy', 1500), least = fastest(c);
  check('a hand with a person\'s limits — what it does, it does a quarter of a second late — rides the whole line clean at its first try: never off the rails', steady.over && steady.falls === 0, `${sec(steady.time)}, ${steady.boosts} bursts, ${steady.fast.toFixed(1)} m/s at the fastest`);
  check('…and never by a hair: its wheels stay well inside the sleepers all along', steady.worst < 0.85, `${(steady.worst * 100).toFixed(0)} % of the tolerance at the nearest`);
  check('a good first clean run takes two to four minutes', steady.time > 120_000 && steady.time < 240_000, steady.stretches.filter((q, i) => i % 3 === 1).map((q) => `${q.name} at ${q.t} s`).join(' · '));
  check('the same hand without the delay, braking later, is quicker — and nobody beats the line ridden flat out with nothing pushing the car off', keen.over && keen.falls === 0 && keen.time < steady.time - 4000 && least < keen.time - 5000, `keen ${sec(keen.time)}; flat out ${sec(least)}`);
  check('nobody gets round by doing nothing: the stick untouched, the chain takes the car up and the first bend throws it off — again and again; it is carried to the end flag by flag, and takes three times as long', clumsy.over && clumsy.falls >= 15 && clumsy.time > steady.time * 2.5, `${sec(clumsy.time)}, off the rails ${clumsy.falls} times`);
  // never a moment narrower than a quarter of a second: the burst before the gap that needs one
  const g = c.gaps[c.gaps.length - 1], flag = c.flags.findLast((f) => f.s < g.from - 20);
  const tryAt = (when) => { const st = put(flag.s, 0, K.fall.v); let pressed = false; const seen = run(st, 14, (q, input) => { botInput(q, 'steady', input); input.boost = false; if (!pressed && q.clock >= when) { input.boost = true; pressed = true; } }, (q, ev) => ev.some((e) => e.type === 'land' || e.type === 'fall')); return seen.some((e) => e.type === 'land'); };
  let from = -1, to = -1; for (let t = 0; t <= 6; t += 0.05) { if (tryAt(t)) { if (from < 0) from = t; to = t; } }
  const bare = (() => { const st = put(flag.s, 0, K.fall.v); return run(st, 14, (q, input) => { botInput(q, 'steady', input); input.boost = false; }, (q, ev) => ev.some((e) => e.type === 'land' || e.type === 'fall')).some((e) => e.type === 'land'); })();
  check('it never needs a moment narrower than a quarter of a second: the gap of the Leap needs the burst, and from the flag before it the burst may come anywhere in a window far wider than that', !bare && from >= 0 && to - from >= 0.5, `without the burst one falls short; pressed anywhere from ${from.toFixed(2)} to ${to.toFixed(2)} s after the flag, one flies it`);
  // what a bend may be taken at
  const caps = P.filter((p) => !lifted(p.s) && Math.abs(p.k) > 0.02).map((p) => capAt(p, 1));
  check('no bend asks for a crawl: the tightest is still taken at forty kilometres an hour by who leans hard', Math.min(...caps) > 11, `${Math.min(...caps).toFixed(1)} m/s through the tightest, the stick hard over`);
  const min = Math.floor(least / 1000) * 1000, max = 900_000;
  check('what the board of scores believes is what the line allows', BOARDS.coaster.order === 'asc' && BOARDS.coaster.min === min && BOARDS.coaster.max === max && steady.time > min && clumsy.time < max, `server/scores.js: min ${BOARDS.coaster.min}, max ${BOARDS.coaster.max}`);
  line = `coaster: { order: 'asc', min: ${min.toLocaleString('en').replace(/,/g, '_')}, max: ${max.toLocaleString('en').replace(/,/g, '_')} }`;
}
void frameAt;

// (the count, then — last — the line for server/scores.js)
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
console.log(line);
process.exit(failed ? 1 : 0);
