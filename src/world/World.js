// The world: owns the baked data and every system that draws or animates it.
import * as THREE from 'three';
import { WorldData } from './WorldData.js';
import { Terrain } from './terrain/Terrain.js';
import { Sky, applyLook, LOOK } from '../render/Atmosphere.js';
import { G } from '../render/globals.js';
import { loadTexture, loadLayerArrays, loadJSON } from '../core/Assets.js';
import { Shadows, LAYER } from '../render/Shadows.js';
import { Water } from './water/Water.js';
import { Forest } from './vegetation/Forest.js';
import { Grass } from './vegetation/Grass.js';
import { Scatter } from './vegetation/Scatter.js';
import { Backdrop } from './terrain/Backdrop.js';
import { loadMaterials } from './props/Materials.js';
import { MillZone } from './zones/mill/MillZone.js';

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
    this.terrain.mesh.layers.enable(LAYER.STATIC_CASTER);
    this.terrain.mesh.layers.enable(LAYER.REFLECT);
    this.scene.add(this.terrain.mesh);

    this.backdrop = new Backdrop(this.data, G.uNoiseTex);
    this.backdrop.mesh.layers.enable(LAYER.REFLECT);
    this.scene.add(this.backdrop.mesh);

    this.shadows = new Shadows(this.engine);
    this.shadows.hooks.push({
      before: (cam, isStatic) => {
        if (isStatic) this.terrain.selectUniform(1);
        else this.terrain.update(this.engine.camera, cam);
      },
      after: (isStatic) => { if (isStatic) this.terrain.restoreRanges(); },
    });

    this.sky = new Sky();
    this.scene.add(this.sky.mesh);

    this.water = new Water(this.engine, this.data);
    await this.water.load();
    this.scene.add(this.water.group);
    this.water.reflection.hooks.push({ before: (cam) => this.terrain.update(this.engine.camera, cam) });
    onProgress(0.7);

    this.forest = new Forest(this.engine, this.data);
    await this.forest.load((p) => onProgress(0.7 + p * 0.2));
    this.scene.add(this.forest.group);
    onProgress(0.9);

    this.grass = new Grass(this.engine, this.data);
    this.scene.add(this.grass.group);

    this.scatter = await new Scatter(this.engine, this.data).load();
    this.scene.add(this.scatter.group);

    this.materials = await loadMaterials(tier);
    this.zones = [];
    this.mill = new MillZone(this).build();
    this.scene.add(this.mill.group);
    this.zones.push(this.mill);
    return this;
  }

  /** (Re)render the static shadow map. Call after static geometry changes. */
  bakeShadows() {
    const bounds = new THREE.Box3(new THREE.Vector3(-512, -14, -512), new THREE.Vector3(512, 100, 512));
    this.shadows.bakeStatic(this.scene, bounds, () => this.forest.prepareShadowBake());
  }

  /** Ground height including water surface when `swim` (used by cameras). */
  groundAt(x, z) { return this.data.heightAt(x, z); }

  update(dt, camera) {
    for (const s of this.systems) s.update?.(dt, camera);
    for (const z of this.zones) z.update?.(dt, this.engine.time);
    this.forest.update(camera);
    this.shadows.updateDynamic(this.scene, camera, this.engine.tier.quality >= 2 ? 1 : 2);
    this.water.update(dt, camera, this.scene);
    this.terrain.update(camera);
    this.grass.update(camera, this.playerPos);
    this.scatter.update(camera);
  }
}
