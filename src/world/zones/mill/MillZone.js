// The mill: house, outbuilding, courtyard, dam and garden structures.
import * as THREE from 'three';
import { Parts } from '../../props/MeshBuilder.js';
import { LAYER, staticCaster } from '../../../render/Shadows.js';
import { MILL, LEVELS } from '../../layout/layout.js';
import { buildMillHouse, buildOutbuilding, HOUSE } from './MillHouse.js';
import { mergeStatic, distanceCuller } from '../../props/StaticBatch.js';
import { MillWorks } from './MillWorks.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class MillZone {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'zone:mill';
    this.cast = staticCaster(world.engine.tier);
    this.colliders = [];
    this.animated = [];
  }

  /** Place a Parts set at a layout frame (x, z, yaw) and floor height. */
  _place(parts, frame, y, name, extraYaw = 0) {
    const g = parts.toMeshes(this.world.materials, { name, layers: this.cast });
    g.position.set(frame.x, y, frame.z);
    g.rotation.y = (frame.yaw || 0) + extraYaw;
    g.updateMatrixWorld(true);
    this.group.add(g);
    return g;
  }

  build() {
    this._house();
    this._outbuilding();
    this.works = new MillWorks(this);
    this.works.build();
    this.group.updateMatrixWorld(true);
    // one mesh per material for everything that never moves (the wheel keeps turning on its own)
    const fixed = this.group.children.filter((c) => !c.userData.keep);
    this.group.add(mergeStatic(fixed, 'mill'));
    this.group.updateMatrixWorld(true);
    this._cull = distanceCuller(this.group, [[/^road/, 480], [/:glow$/, 260], [/./, 620]]);
    return this;
  }


  _house() {
    const parts = new Parts();
    const info = buildMillHouse(parts);
    const fr = MILL.house;
    this.house = this._place(parts, fr, fr.floorY, 'mill-house');
    this.houseInfo = info;
    this.colliders.push({ type: 'box', x: fr.x, z: fr.z, hw: HOUSE.W / 2 + 0.1, hl: HOUSE.L / 2 + 0.1, yaw: fr.yaw });
  }

  _outbuilding() {
    const y = LEVELS.court + 0.08;
    // east volume: lower, with the lean-to shelter facing the courtyard
    const a = new Parts();
    const A = MILL.annexA;
    buildOutbuilding(a, {
      W: A.width, L: A.length, eave: 2.7, ridge: 2.7 + (A.width / 2) * Math.tan((41 * Math.PI) / 180),
      doors: [{ side: 's', at: A.width / 2 - 0.9, w: 1.5, h: 2.1 }],
      windows: [{ side: 'w', at: 2.4, sill: 1.1 }, { side: 'w', at: 5.8, sill: 1.1 }, { side: 'e', at: 4.2, sill: 1.2 }, { side: 's', at: A.width / 2 + 1.9, sill: 1.15, w: 0.8 }],
      copings: false,
    });
    {
      // lean-to shelter on the courtyard gable (local +Z)
      const slate = a.get('slate'), wood = a.get('woodDark');
      const hl = A.length / 2, x0 = -3.0, x1 = 3.3, z0 = hl, z1 = hl + 3.1, yW = 3.35, yO = 2.25;
      slate.tint(0.9, 0.9, 0.92, 1);
      slate.quad(V(x0 - 0.2, yO + 0.08, z1 + 0.25), V(x1 + 0.2, yO + 0.08, z1 + 0.25), V(x1 + 0.2, yW + 0.08, z0), V(x0 - 0.2, yW + 0.08, z0), { tile: 2 });
      wood.tint(0.75, 0.72, 0.68, 0.75);
      wood.quad(V(x1 + 0.2, yO, z1 + 0.25), V(x0 - 0.2, yO, z1 + 0.25), V(x0 - 0.2, yW, z0), V(x1 + 0.2, yW, z0), { tile: 1.2 });
      wood.tint(0.95, 0.92, 0.88, 1);
      for (const px of [x0, x1]) wood.box(px - 0.09, -1.5, z1 - 0.09, px + 0.09, yO, z1 + 0.09, { tile: 0.8 });
      wood.box(x0 - 0.2, yO - 0.04, z1 - 0.1, x1 + 0.2, yO + 0.14, z1 + 0.1, { tile: 0.8 });
      for (let i = 0; i < 6; i++) { const px = x0 + ((x1 - x0) * i) / 5; wood.beam(V(px, yW, z0), V(px, yO + 0.02, z1 + 0.2), 0.07, 0.13, { tile: 0.8 }); }
    }
    this._place(a, A, y, 'mill-annex-a', Math.PI / 2);
    this.colliders.push({ type: 'box', x: A.x, z: A.z, hw: A.length / 2 + 0.1, hl: A.width / 2 + 0.1, yaw: 0 });

    // west volume: taller, chimney at the far end
    const b = new Parts();
    const B = MILL.annexB;
    buildOutbuilding(b, {
      W: B.width, L: B.length, eave: 3.3, ridge: 3.3 + (B.width / 2) * Math.tan((45 * Math.PI) / 180),
      doors: [{ side: 'w', at: 6.3, w: 1.1, h: 2.05 }],
      windows: [{ side: 'w', at: 2.6, sill: 1.1 }, { side: 'e', at: 3, sill: 1.2 }, { side: 'e', at: 6.4, sill: 1.2 }, { side: 'n', at: B.width / 2, sill: 1.2 }],
      chimneyAt: -B.length / 2 + 0.3, copings: true,
    });
    this._place(b, B, y, 'mill-annex-b', Math.PI / 2);
    this.colliders.push({ type: 'box', x: B.x, z: B.z, hw: B.length / 2 + 0.1, hl: B.width / 2 + 0.1, yaw: 0 });
  }

  update(dt, time, camera) {
    for (const a of this.animated) a(dt, time);
    if (camera) this._cull(camera.position);
  }
}
