// Works out the way up the Great Oak ("Out on a Limb") once and writes it down: lab/oak/route.js.
// The course is found by a search (see tree.js) that takes seconds and that two browsers might not finish the
// same way; the game reads what is written here, the same for everybody.
// usage: node lab/oak/oak-course.mjs [--seed=23] [--dry]     (then: node lab/oak/oak-test.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildTree, SPECIES_ORDER } from '../../src/world/vegetation/TreeBuilder.js';
import { OAK, readSkeleton, oakCourse, clearing, trunkRadius } from './tree.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));

/** The ground of the world, as the game reads it (WorldData.heightAt). */
export async function worldGround() {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/assets/world/world.json'), 'utf8'));
  const { data, info } = await sharp(path.join(ROOT, 'public/assets/world/height.png')).raw().toBuffer({ resolveWithObject: true });
  const [lo, hi] = meta.heightRange, N = info.width, half = N / 2;
  const at = (i, j) => { const k = (j * N + i) * info.channels; return ((data[k] * 256 + data[k + 1]) / 65535) * (hi - lo) + lo; };
  return (x, z) => {
    const u = Math.min(N - 1.001, Math.max(0, x + half - 0.5)), v = Math.min(N - 1.001, Math.max(0, z + half - 0.5)), i = Math.floor(u), j = Math.floor(v), fx = u - i, fz = v - j;
    return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fz) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fz;
  };
}

/** The tree the course is in: its model (as the forest builds it), its skeleton, its leaf cards, the ground round it. */
export async function oakTree() {
  const si = SPECIES_ORDER.indexOf(OAK.species), model = buildTree(OAK.species, 1337 + si * 101 + OAK.variant * 17);
  const skeleton = readSkeleton(model.wood0, OAK.scale);
  const L = model.leaf0.getAttribute('position'), cards = [];
  for (let k = 0; k < L.count; k += 4) cards.push([L.getX(k) * OAK.scale, L.getY(k) * OAK.scale, L.getZ(k) * OAK.scale]);
  const height = await worldGround(), base = height(OAK.at.x, OAK.at.z) - OAK.sink;
  return { model, skeleton, cards, base, ground: (x, z) => height(OAK.at.x + x, OAK.at.z + z) - base };
}

const r3 = (v) => Math.round(v * 1000) / 1000;

/** The course as it is written down (see route.js): plain numbers, nothing that is worked out again. */
export function written(course, tree) {
  const { skeleton, cards, model } = tree, cl = clearing(course, skeleton, cards);
  const P = model.wood0.getAttribute('position');
  const holds = course.holds.map((h) => {
    const o = { kind: h.kind, s: r3(h.s), y: r3(h.y) };
    if (h.kind === 'fungus') Object.assign(o, { x: r3(h.x), z: r3(h.z), r: r3(h.r), th: r3(h.th), on: [r3(h.on.x), r3(h.on.z)], at: [r3(h.at.x), r3(h.at.y), r3(h.at.z)], ...(h.stair ? { stair: true } : null) });
    else if (h.kind === 'deck') Object.assign(o, { x: r3(h.x), z: r3(h.z), r0: r3(h.r0), r1: r3(h.r1), gap: h.gap.map(r3), level: h.level });
    else {
      // (its whole line, the way one walks it; the part one can stand on: all but what is in the bark)
      const first = h.line.findIndex((p) => Math.abs(p.x - h.pts[0].x) < 1e-9 && Math.abs(p.z - h.pts[0].z) < 1e-9);
      Object.assign(o, { hw: r3(h.hw), ...(h.knot ? { knot: r3(h.knot) } : null), len: r3(h.len), shape: h.shape, root: h.root, fragile: r3(h.fragile), lift: r3(h.lift), walk: [first, first + h.pts.length - 1], line: h.line.map((p) => [r3(p.x), r3(p.y), r3(p.z), r3(p.d), r3(p.h)]) });
    }
    return o;
  });
  // the stem, every half metre; the limbs of the tree one must not walk through, as round posts one above the other
  const stem = [];
  for (let y = -1.5; y <= course.leader.to + 0.5; y += 0.5) {
    // (its middle, how thick it is — and how thick where it is thinnest: the foot of the trunk is fluted)
    const c = course.stem(y);
    let least = c.r;
    for (let k = 0; k < 24; k++) least = Math.min(least, trunkRadius(skeleton, (k / 24) * Math.PI * 2, Math.max(y, skeleton[0].pts[0].y)) ?? c.r);
    stem.push([r3(c.x), r3(c.z), r3(c.r), r3(least)]);
  }
  const posts = [];
  for (const o of course.limbs) {
    const len = Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y, o.b.z - o.a.z), n = Math.max(1, Math.ceil(len / 0.55));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = o.a.x + (o.b.x - o.a.x) * t, y = o.a.y + (o.b.y - o.a.y) * t, z = o.a.z + (o.b.z - o.a.z) * t, r = o.a.r + (o.b.r - o.a.r) * t;
      if (Math.hypot(x, z) < OAK.net + 1) posts.push([r3(x), r3(z), r3(r * 0.92), r3(y - r), r3(y + r - 0.3)]);
    }
  }
  return {
    seed: course.seed,
    // (what the tree must look like for the lists below to mean anything: see giant.js)
    model: { wood: P.count, leaf: model.leaf0.getAttribute('position').count, probes: [0, 0.21, 0.47, 0.73, 0.99].map((f) => { const i = Math.floor((P.count - 1) * f); return [i, r3(P.getX(i)), r3(P.getY(i)), r3(P.getZ(i))]; }) },
    ground: r3(course.ground), height: r3(course.height),
    start: { x: r3(course.start.x), y: r3(course.start.y), z: r3(course.start.z), r: course.start.r },
    top: { x: r3(course.top.x), y: r3(course.top.y), z: r3(course.top.z), r: r3(course.top.r) },
    stem: { from: -1.5, step: 0.5, at: stem },
    leader: course.leader.pts.map((p) => [r3(p.x), r3(p.y), r3(p.z), r3(p.r)]),
    holds,
    jumps: course.jumps.map((j) => ({ from: j.from, to: j.to, a: [r3(j.a.x), r3(j.a.y), r3(j.a.z)], b: [r3(j.b.x), r3(j.b.y), r3(j.b.z)], gap: r3(j.gap), rise: r3(j.rise), ratio: r3(j.ratio), runup: r3(j.runup) })),
    nets: course.nets.map((n) => ({ y: r3(n.y), x: r3(n.x), z: r3(n.z), r0: r3(n.r0), r1: r3(n.r1), sag: n.sag, level: n.level })),
    posts,
    // what is taken off the tree: [first vertex, how many, sides, the ring it is cut at (0: all of it)] of its bark; the leaf cards
    cut: [...cl.cut.entries()].map(([k, ring]) => [skeleton[k].first, skeleton[k].count, skeleton[k].sides, ring]),
    cards: [...cl.cards].sort((a, b) => a - b),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tree = await oakTree(), t0 = Date.now();
  const course = oakCourse({ skeleton: tree.skeleton, ground: tree.ground, seed: opt.seed ? Number(opt.seed) : OAK.seed, tries: opt.seed ? 1 : 60 });
  const route = written(course, tree), br = route.holds.filter((h) => h.kind === 'branch');
  const text = `// The way up the Great Oak ("Out on a Limb"), as lab/oak/oak-course.mjs worked it out (see tree.js): written down so\n// that it is the same on every device. Not to be edited by hand: change tree.js, then run the tool again.\n/* eslint-disable */\nexport const ROUTE = ${JSON.stringify(route)};\n`;
  console.log(`seed ${course.seed}: ${route.holds.length} holds — ${br.length} branches (${br.filter((h) => h.fragile).length} dead), ${route.holds.filter((h) => h.kind === 'fungus').length} fungi, ${route.jumps.length} jumps; ${route.cut.length} small branches and ${route.cards.length} leaf cards taken off the tree; ${route.posts.length} posts; ${(text.length / 1024).toFixed(0)} KB; ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (!opt.dry) { fs.writeFileSync(path.join(ROOT, 'lab/oak/route.js'), text); console.log('written: lab/oak/route.js'); }
}
