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
import { PierZone, deckHeight } from './zones/pier/PierZone.js';
import { PlacesZone } from './zones/places/PlacesZone.js';
import { Collision } from './Collision.js';
import { Rocks } from './props/Rocks.js';
import { Birds } from './wildlife/Birds.js';
import { Ripples } from './water/Ripples.js';
import { PIER, ISLAND } from './layout/layout.js';

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
    // the ground is drawn after the other opaque things: most of it hides behind them and is rejected early
    this.terrain.mesh.renderOrder = 5;
    this.scene.add(this.terrain.mesh);

    this.backdrop = new Backdrop(this.data, G.uNoiseTex);
    if (tier.quality > 0) this.backdrop.mesh.layers.enable(LAYER.REFLECT);
    this.backdrop.mesh.renderOrder = 6;
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
    // the mirrored view is small and rippled: a coarser ground is enough there
    this.terrainRange = tier.terrainRange;
    this.water.reflection.hooks.push({
      before: (cam) => {
        this.terrain.setRangeScale(this.terrainRange * (tier.quality === 0 ? 0.4 : 0.55));
        this.terrain.update(this.engine.camera, cam);
        this.forest.setReflectionPass(true); // trees as impostors
      },
      after: () => { this.terrain.setRangeScale(this.terrainRange); this.forest.setReflectionPass(false); },
    });
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
    this.seats = []; // places to sit or lie (see player/PlayerController.js: seatAt)
    this.seatSources = []; // seats that move: functions (player position) → seat or null
    this.actionSources = []; // other things to do on the spot: functions (player) → { label, run } or null
    this.noFly = []; // discs { x, z, r } where the jetpack does not work
    this.ripples = new Ripples();
    this.scene.add(this.ripples.mesh);
    this.mill = new MillZone(this).build();
    this.scene.add(this.mill.group);
    this.zones.push(this.mill);
    this.pier = new PierZone(this).build();
    this.scene.add(this.pier.group);
    this.zones.push(this.pier);
    this.seatSources.push((pos) => this.pier.boarding(pos)); // the cars of the big wheel
    this.places = new PlacesZone(this).build();
    this.scene.add(this.places.group);
    this.zones.push(this.places);
    this.terrain.setHoles(this.places.holes);
    this.npcs = this.places.npcs;
    this.noFly.push({ x: ISLAND.x, z: ISLAND.z, r: ISLAND.r0 + 18 }); // the island is climbed on foot
    this.detail = 1;
    this.engine.on('detail', (d) => this.applyDetail(d));
    this.rocks = new Rocks(this);
    this.scene.add(this.rocks.group);
    this.birds = new Birds(this);
    this.scene.add(this.birds.mesh);
    return this;
  }

  /**
   * Detail factor from the engine (1 = the tier as designed, 0.5 = the least): vegetation is drawn in full less
   * far, shadows and reflections are refreshed less often. Applied live, nothing is rebuilt.
   */
  applyDetail(d) {
    const t = this.engine.tier;
    this.detail = d;
    this.forest.setDetail(d);
    this.grass.setRange(t.grassRange * (0.5 + 0.5 * d));
    this.scatter.setRange(t.scatterRange * (0.55 + 0.45 * d));
    this.terrainRange = t.terrainRange * (0.78 + 0.22 * d);
    this.terrain.setRangeScale(this.terrainRange);
    this.water.every = d < 0.8 ? Math.max(2, t.reflectionEvery) : t.reflectionEvery;
  }

  /** Gather obstacles and walkable platforms from every system. */
  buildCollision() {
    const col = (this.collision = new Collision(this.data));
    col.setBounds(this.data.meta.bounds);
    for (const [x, z, r] of this.forest.colliders()) col.addCircle(x, z, r);
    for (const [x, z, r] of this.rocks.colliders) col.addCircle(x, z, r);
    for (const zone of [this.mill, this.places]) for (const c of zone.colliders) {
      if (c.type === 'box') col.addBox(c.x, c.z, c.hw, c.hl, c.yaw, c.y0, c.y1);
      else col.addCircle(c.x, c.z, c.r, c.y0, c.y1);
    }
    for (const a of this.places.areas) col.addArea(a);
    for (const p of [...(this.mill.platforms || []), ...this.places.platforms]) {
      if (p.type === 'disc') {
        col.addPlatform({ clearance: p.clearance ?? 1.0, heightAt: (x, z) => ((x - p.x) ** 2 + (z - p.z) ** 2 <= p.r * p.r ? p.y : null) });
      } else if (p.type === 'deck') {
        const ax = p.a.x, az = p.a.z, dx = p.b.x - ax, dz = p.b.z - az, len = Math.hypot(dx, dz);
        col.addPlatform({
          clearance: p.clearance ?? 1.1,
          heightAt: (x, z) => {
            const t = ((x - ax) * dx + (z - az) * dz) / (len * len);
            if (t < -0.02 || t > 1.02) return null;
            const v = ((x - ax) * dz - (z - az) * dx) / len;
            if (Math.abs(v) > p.width / 2) return null;
            const tc = Math.min(1, Math.max(0, t));
            return p.a.y + (p.b.y - p.a.y) * tc + Math.sin(Math.PI * tc) * p.camber;
          },
        });
      } else if (p.type === 'slab') {
        const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
        col.addPlatform({ clearance: 1.0, heightAt: (x, z) => {
          const lx = (x - p.x) * c - (z - p.z) * s, lz = (x - p.x) * s + (z - p.z) * c;
          return Math.abs(lx) <= p.hw && Math.abs(lz) <= p.hl ? p.y : null;
        } });
      }
    }
    // the pier deck, the boarding platform under the wheel, railings and things standing on the deck
    const pier = this.pier, ph = PIER.heading, pc = Math.cos(ph), ps = Math.sin(ph);
    const toWorld = (u, v) => [PIER.rootX + u * pc - v * ps, PIER.rootZ + u * ps + v * pc];
    col.addPlatform({ clearance: 1.5, heightAt: (x, z) => pier.deckAt(x, z) });
    col.addPlatform({ clearance: 1.0, heightAt: (x, z) => {
      const dx = x - PIER.rootX, dz = z - PIER.rootZ;
      const u = dx * pc + dz * ps - PIER.wheel.along, v = -dx * ps + dz * pc;
      if (Math.abs(v) > 5) return null;
      if (u >= -5 && u <= 5) return PIER.deckY + 0.9;
      if (u < -5 && u > -6.6 && Math.abs(v) < 2.2) return PIER.deckY + 0.9 * ((u + 6.6) / 1.6);
      return null;
    } });
    const y0 = PIER.deckY - 0.6, y1 = PIER.deckY + 4;
    for (const c of pier.colliders) {
      if (c.type === 'local') { const [x, z] = toWorld(c.x, c.z); col.addCircle(x, z, c.r, deckHeight(c.x) - 0.6, y1); }
      else col.addCircle(c.x, c.z, c.r);
    }
    const W = PIER.width / 2, HW = PIER.headWidth / 2, L = PIER.length, h0 = L - PIER.headLength;
    const rail = (u0, v0, u1, v1) => {
      const [x, z] = toWorld((u0 + u1) / 2, (v0 + v1) / 2);
      const along = Math.abs(u1 - u0) > Math.abs(v1 - v0);
      // box frame uses layout yaw convention: local x along the pier when yaw = -heading
      col.addBox(x, z, along ? Math.abs(u1 - u0) / 2 : 0.12, along ? 0.12 : Math.abs(v1 - v0) / 2, -ph, along && u0 < PIER.rampLength ? 2.6 : y0, y1);
    };
    rail(2.5, -W, h0, -W); rail(2.5, W, h0, W); rail(h0, -HW, h0, -W); rail(h0, W, h0, HW);
    rail(h0, -HW, L, -HW); rail(h0, HW, L, HW); rail(L, -HW, L, HW);
    return col;
  }

  /** (Re)render the static shadow map. Call after static geometry changes. */
  bakeShadows() {
    // the playable valley and the slopes that can cast a shadow into it (not the whole terrain: sharper shadows)
    const b = this.data.meta.map;
    const bounds = new THREE.Box3(new THREE.Vector3(b.x0 - 45, -14, b.z0 - 80), new THREE.Vector3(b.x1 + 15, 215, b.z1 + 80));
    this.shadows.bakeStatic(this.scene, bounds, () => this.forest.prepareShadowBake());
  }

  /** Ground height including water surface when `swim` (used by cameras). */
  groundAt(x, z) { return this.data.heightAt(x, z); }

  update(dt, camera) {
    // `profile` (an object) accumulates the script time of each step, for tools/bench.mjs
    const prof = this.profile;
    let t = prof ? performance.now() : 0;
    const mark = (k) => { if (prof) { const n = performance.now(); prof[k] = (prof[k] || 0) + n - t; t = n; } };
    for (const s of this.systems) s.update?.(dt, camera);
    for (const z of this.zones) z.update?.(dt, this.engine.time, camera);
    this.birds.update(dt, this.engine.time, this.playerPos);
    this.ripples.update(this.engine.time);
    mark('zones');
    this.forest.update(camera);
    mark('forest');
    // real-time shadows every frame on capable computers, every other frame elsewhere (the water's mirrored
    // view then takes the frames in between), every third when detail has been shed
    this.shadows.updateDynamic(this.scene, camera, this.detail < 0.7 ? 3 : this.engine.tier.quality >= 2 && this.detail > 0.9 && !this.engine.tier.phone ? 1 : 2);
    mark('shadowPass');
    this.water.update(dt, camera, this.scene);
    mark('reflectionPass');
    this.terrain.update(camera);
    mark('terrain');
    this.grass.update(camera, this.playerPos);
    mark('grass');
    this.scatter.update(camera);
    mark('scatter');
  }
}
