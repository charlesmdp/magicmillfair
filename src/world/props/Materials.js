// Shared materials for buildings and props (one instance each, so draw calls batch well).
import * as THREE from 'three';
import { loadTexture } from '../../core/Assets.js';
import { surfaceMaterial, glassMaterial } from '../../render/SurfaceMaterial.js';

const DEFS = {
  // name: [texture, { colour, roughness, specular, normal scale }]
  stone: ['wall_schist', { rough: 0.9, spec: 0.12, normalScale: 1.4 }],
  drystone: ['wall_dry', { rough: 0.92, spec: 0.1, normalScale: 1.6 }],
  granite: ['granite', { rough: 0.82, spec: 0.16, normalScale: 0.8 }],
  // natural rock (boulders): the granite texture, larger grain, greyer, standing in water where needed
  rock: ['granite', { rough: 0.9, spec: 0.1, normalScale: 1.5, uvScale: 0.45, color: [0.62, 0.6, 0.56], waterline: true }],
  // the walls of the caves: the same stone again, darker (their light comes from the vertices)
  cave: ['granite', { rough: 0.94, spec: 0.06, normalScale: 1.7, uvScale: 0.5, color: [0.6, 0.55, 0.5] }],
  slate: ['slate', { rough: 0.55, spec: 0.5, normalScale: 1.2 }],
  woodDark: ['wood_dark', { rough: 0.8, spec: 0.15, normalScale: 1.0 }],
  woodDeck: ['wood_deck', { rough: 0.82, spec: 0.14, normalScale: 1.0 }],
  woodPaint: ['wood_paint', { rough: 0.6, spec: 0.25, normalScale: 0.5 }],
  paving: ['paving', { rough: 0.85, spec: 0.14, normalScale: 0.9 }],
  asphalt: ['asphalt', { rough: 0.9, spec: 0.12, normalScale: 0.8, polygonOffset: 2, fade: true }],
  // plain painted / coloured surfaces share the neutral "metal" texture; colour comes from the vertices
  paint: ['metal', { rough: 0.5, spec: 0.35, normalScale: 0.3 }],
  matte: ['metal', { rough: 0.9, spec: 0.08, normalScale: 0.3 }],
  // same textures, but aware of the water they stand in
  woodWet: ['wood_dark', { rough: 0.8, spec: 0.15, normalScale: 1.0, waterline: true }],
  stoneWet: ['wall_dry', { rough: 0.92, spec: 0.1, normalScale: 1.6, waterline: true }],
};

export async function loadMaterials(tier) {
  const size = tier.layerSize;
  const names = [...new Set(Object.values(DEFS).map((d) => d[0]))];
  const tex = {};
  await Promise.all(names.map(async (n) => {
    const [c, nm] = await Promise.all([
      loadTexture(`textures/building/${size}/${n}_c.webp`, { srgb: true }),
      loadTexture(`textures/building/${size}/${n}_n.webp`),
    ]);
    tex[n] = { c, nm };
  }));
  const mats = {};
  for (const [key, [t, o]] of Object.entries(DEFS)) {
    mats[key] = surfaceMaterial({ map: tex[t].c, normalMap: tex[t].nm, name: key, ...o });
  }
  mats.glass = glassMaterial();
  mats.glow = surfaceMaterial({ name: 'glow', rough: 0.4, spec: 0.2, emissive: [2.2, 2.0, 1.5] });
  mats.doubleSided = surfaceMaterial({ map: tex.metal.c, name: 'cloth', rough: 0.85, spec: 0.08, side: THREE.DoubleSide });
  return mats;
}
