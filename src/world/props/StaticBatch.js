// Fewer draw calls for static scenery: meshes that share a material are merged, and whole groups of
// small things are hidden once they are too far to be seen.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merge the meshes found under `roots` that share material, layers and render order into one mesh each,
 * baked in world space. Returns a group holding the merged meshes; the originals are removed.
 */
export function mergeStatic(roots, name = 'static') {
  const buckets = new Map();
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
      const key = `${o.material.uuid}|${o.layers.mask}|${o.renderOrder}`;
      if (!buckets.has(key)) buckets.set(key, { material: o.material, layers: o.layers.mask, renderOrder: o.renderOrder, geos: [], label: o.name.split(':').pop() });
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      buckets.get(key).geos.push(g);
    });
  }
  const group = new THREE.Group();
  group.name = name;
  for (const b of buckets.values()) {
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (!geo) throw new Error(`Fusion impossible : ${name}:${b.label}`);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, b.material);
    mesh.name = `${name}:${b.label}`;
    mesh.layers.mask = b.layers;
    mesh.renderOrder = b.renderOrder;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  for (const root of roots) {
    root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) o.geometry.dispose(); });
    root.removeFromParent();
  }
  return group;
}

/**
 * Distance culling for scenery. `rules` maps a mesh-name test to the distance (m) beyond which it is hidden:
 * [[/:glow$/, 300], [/./, 900]] — the first matching rule wins. Returns an update function (camera position).
 */
export function distanceCuller(root, rules) {
  const items = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const rule = rules.find(([test]) => test.test(o.name));
    if (!rule || !Number.isFinite(rule[1])) return;
    const g = o.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const sphere = (o.boundingSphere || g.boundingSphere).clone().applyMatrix4(o.matrixWorld);
    items.push({ o, sphere, far: rule[1] });
  });
  return (cam) => {
    for (const it of items) it.o.visible = it.sphere.distanceToPoint(cam) < it.far;
  };
}
