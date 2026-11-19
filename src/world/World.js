// The world: owns the baked data and every system that draws or animates it.
import * as THREE from 'three';
import { WorldData } from './WorldData.js';
import { Terrain } from './terrain/Terrain.js';
import { Sky, applyLook, LOOK } from '../render/Atmosphere.js';
import { G } from '../render/globals.js';
import { loadTexture, loadLayerArrays, loadJSON } from '../core/Assets.js';

const LAYER_NAMES = ['lawn', 'meadow', 'forest', 'dirt', 'rock', 'sand', 'gravel', 'soil'];

export class World {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.data = new WorldData();
    this.systems = [];
  }

  async load(onProgress = () => {}) {
    const tier = this.engine.tier;
    applyLook(LOOK);
    const [, texInfo, noise, caustics] = await Promise.all([
      this.data.load((p) => onProgress(p * 0.5)),
      loadJSON('textures/textures.json'),
      loadTexture('textures/noise.png'),
      loadTexture('textures/caustics.png'),
    ]);
    this.texInfo = texInfo;
    G.uNoiseTex.value = noise;
    G.uCaustics.value = caustics;
    onProgress(0.55);

    const layers = await loadLayerArrays(`textures/terrain/${tier.layerSize}`, LAYER_NAMES, tier.layerSize);
    layers.colors = LAYER_NAMES.map((n) => new THREE.Vector3(...texInfo.terrain[n].avg));
    this.terrain = new Terrain(this.data, { layers });
    this.terrain.material.uniforms.uCaustics = G.uCaustics;
    this.terrain.setRangeScale(tier.terrainRange);
    this.scene.add(this.terrain.mesh);

    this.sky = new Sky();
    this.scene.add(this.sky.mesh);
    onProgress(0.7);
    return this;
  }

  /** Ground height including water surface when `swim` (used by cameras). */
  groundAt(x, z) { return this.data.heightAt(x, z); }

  update(dt, camera) {
    this.terrain.update(camera);
    for (const s of this.systems) s.update?.(dt, camera);
  }
}
