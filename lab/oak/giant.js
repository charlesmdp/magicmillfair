// The old tree, made a giant: the oak of the clearing (see layout.js, 'elder') stands where the baker put it,
// as tall as the baker made it. Until the layout itself says otherwise, this moves it and makes it grow in the
// running game — its place in the forest's own tables (what is drawn near, what is drawn far, what is walked
// into) — and takes off it the few small branches and leaves that hang in the way of the climb. Nothing here
// builds anything: it is the forest's tree, elsewhere, bigger, and a little pruned.
import * as THREE from 'three';

const CELL = 32; // the forest's grid (Forest.js); checked below, not trusted

/**
 * Moves the tree of species `name` nearest to (x, z) to (toX, toZ), `scale` times its model (the same in
 * height and width), turned to `turn`, in the shape `variant` of its species, its foot `sink` in the ground.
 * Returns { x, y, z, scale, height, index, species (the forest's record), model } — or null when there is no
 * such tree. The tree hardly sways after that (`sway`): what is climbed must stay where it is stood on.
 */
export function growTree(world, name, x, z, { toX, toZ, scale, turn = 0, variant = 0, sink = 0.3, sway = 0.06 }) {
  const forest = world.forest, data = world.data;
  const sp = forest.species.find((s) => s && s.name === name);
  if (!sp) return null;
  let index = -1, best = 1e9;
  for (let i = 0; i < forest.count; i++) {
    if (forest.info[i * 6 + 4] !== sp.si) continue;
    const d = Math.hypot(forest.info[i * 6] - x, forest.info[i * 6 + 2] - z);
    if (d < best) { best = d; index = i; }
  }
  if (index < 0 || best > 30) return null;
  const fromX = forest.info[index * 6], fromZ = forest.info[index * 6 + 2];
  const tree = forest.all.find((t) => t.si === sp.si && Math.hypot(t.x - fromX, t.z - fromZ) < 0.01);
  variant = Math.min(variant, sp.models.length - 1);
  const model = sp.models[variant], y = data.heightAt(toX, toZ) - sink;
  new THREE.Matrix4().compose(new THREE.Vector3(toX, y, toZ), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), turn), new THREE.Vector3(scale, scale, scale)).toArray(forest.matrices, index * 16);
  forest.info.set([toX, y, toZ, Math.max(model.radius, model.height * 0.5) * scale, sp.si, variant], index * 6);
  // (which trees are looked at from where: the tree changes cell)
  for (const list of forest.grid.values()) { const k = list.indexOf(index); if (k >= 0) list.splice(k, 1); }
  const key = `${Math.floor(toX / CELL)},${Math.floor(toZ / CELL)}`;
  if (!forest.grid.has(key)) forest.grid.set(key, []);
  forest.grid.get(key).push(index);
  // drawn afresh at every level of detail: near, and far (one flat picture of it, like every tree)
  for (const v of sp.variants) for (const slot of [v.wood0, v.leaf0, v.lod1]) if (slot) slot.sum = NaN;
  if (tree) {
    Object.assign(tree, { x: toX, y, z: toZ, scale, variant, col: variant * 2 + (tree.col % 2) });
    const at = sp.trees.indexOf(tree), geo = sp.impostor?.geometry;
    if (geo && at >= 0) {
      geo.getAttribute('iPos').setXYZW(at, toX, y, toZ, scale); geo.getAttribute('iPos').needsUpdate = true;
      geo.getAttribute('iData').setX(at, tree.col); geo.getAttribute('iData').needsUpdate = true;
    }
  }
  // what one walks into: gone from where it was (whoever asks puts back what is in the way where it is now)
  const circles = world.collision.circles, k = circles.findIndex((c) => Math.hypot(c[0] - fromX, c[1] - fromZ) < 0.05);
  if (k >= 0) { circles[k][2] = 0.01; circles[k][3] = -1e9; circles[k][4] = -1e9 + 1; world.collision.bulky = null; }
  // an oak this size does not bend in the wind: its leaves still stir
  for (const m of [sp.mats.wood.m, sp.mats.wood.d, sp.mats.leaf0, sp.mats.leaf1, sp.mats.depth0, sp.mats.depth1]) if (m?.uniforms?.uSway) m.uniforms.uSway.value = sp.sp.sway * sway;
  return { x: toX, y, z: toZ, scale, height: model.height * scale, index, species: sp, model, variant };
}

/** Is this the tree the lists of a course were made for? (`check`: { wood, leaf, probes: [[vertex, x, y, z]] }) */
export function sameModel(model, check) {
  const P = model.wood0.getAttribute('position');
  if (P.count !== check.wood || model.leaf0.getAttribute('position').count !== check.leaf) return false;
  return check.probes.every(([i, x, y, z]) => Math.hypot(P.getX(i) - x, P.getY(i) - y, P.getZ(i) - z) < 0.02);
}

/**
 * Takes off a tree what is in the way: `cut`: [[first vertex, how many, sides, ring]] — branches of its bark,
 * cut at that ring (0: gone altogether); `cards`: the leaf cards to take off (four vertices each). The shapes
 * themselves are changed: every tree of that species and shape shows it (the old tree is the only one).
 */
export function prune(model, cut, cards) {
  const wood = model.wood0, P = wood.getAttribute('position');
  const gone = new Uint8Array(P.count);
  for (const [first, count, sides, ring] of cut) {
    const from = first + ring * (sides + 1);
    for (let i = from; i < first + count; i++) gone[i] = 1;
    if (ring > 0) {
      // what is left of it ends in a point: its last ring drawn in to its middle
      const a = from - (sides + 1);
      let x = 0, y = 0, z = 0;
      for (let i = a; i < from; i++) { x += P.getX(i); y += P.getY(i); z += P.getZ(i); }
      for (let i = a; i < from; i++) P.setXYZ(i, x / (sides + 1), y / (sides + 1), z / (sides + 1));
    }
  }
  P.needsUpdate = true;
  const keep = (geo, dead) => {
    const src = geo.index.array, out = [];
    for (let i = 0; i < src.length; i += 3) if (!dead(src[i]) && !dead(src[i + 1]) && !dead(src[i + 2])) out.push(src[i], src[i + 1], src[i + 2]);
    geo.setIndex(out);
  };
  keep(wood, (i) => gone[i]);
  const off = new Set(cards);
  keep(model.leaf0, (i) => off.has(i >> 2));
}
