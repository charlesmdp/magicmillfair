// Draws the other visitors: one avatar and one name tag per peer of the presence layer.
import * as THREE from 'three';
import { ANIM, EMOTE_LIST } from '../player/Character.js';
import { PAINTS, TRAILS, unpackKit } from '../../server/items.js';

const FAR = 240; // m: avatars further away are not drawn
const TAG_RANGE = 70; // m: name tags fade out with distance
const NEAR = 28; // m: within that distance an avatar gets everything (its shadow, its reflection, every frame of its animation)
const CROWD = 14; // …for the nearest ones only: beyond that many, the others are drawn light
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _frustum = new THREE.Frustum(), _sphere = new THREE.Sphere();

export class RemoteAvatars {
  /**
   * @param {{ scene: THREE.Scene, factory: import('../player/Character.js').CharacterFactory,
   *           presence: import('./Presence.js').Presence, hud: import('../ui/Hud.js').Hud }} o
   */
  constructor({ scene, factory, presence, hud, rank = null, world = null }) {
    this.scene = scene;
    this.factory = factory;
    this.presence = presence;
    this.hud = hud;
    this.rank = rank; // the animals of light (see RankEmotes)
    this.world = world;
    this.items = new Map();
    this.frame = 0;
    presence.on('join', (peer) => this._add(peer));
    presence.on('leave', (peer) => this._remove(peer.id));
    presence.on('identity', (peer) => {
      const it = this.items.get(peer.id);
      if (!it) return;
      it.character.setColor(peer.color);
      this._kit(it);
      it.tag.remove();
      it.tag = this.hud.tag(peer.id, peer.name, peer.color);
    });
    presence.on('emote', ({ id, emote }) => {
      const it = this.items.get(id);
      if (!it) return;
      const e = EMOTE_LIST[emote];
      if (!e) return; // (an emote of a newer version of the game)
      if (!e.rank) it.character.emote(emote);
      else if (it.peer.visible) this.rank?.play(e.rank, it.character.root);
    });
    for (const peer of presence.peers.values()) this._add(peer);
  }

  _add(peer) {
    if (this.items.has(peer.id)) return;
    const character = this.factory.create(peer.color);
    character.root.visible = false;
    this.scene.add(character.root);
    const it = { peer, character, tag: this.hud.tag(peer.id, peer.name, peer.color), shown: false, trail: 0 };
    this.items.set(peer.id, it);
    this._kit(it);
  }

  // What a visitor shows besides its hat: its paint, its trail (the "kit" of server/items.js).
  _kit(it) {
    const kit = unpackKit(it.peer.kit || 0);
    it.character.setPaint(kit.paint < PAINTS.length ? kit.paint : 0);
    it.trail = kit.trail < TRAILS.length ? kit.trail : 0;
  }

  _remove(id) {
    const it = this.items.get(id);
    if (!it) return;
    it.character.dispose();
    it.tag.remove();
    this.items.delete(id);
  }

  /** Speech bubble over a visitor. */
  say(id, text) {
    const it = this.items.get(id);
    if (it) this.hud.say(it.tag, text);
  }

  /** Those who are drawn in the world (near enough for the relay to tell us about them in detail). */
  get list() { return [...this.items.values()].filter((it) => it.peer.visible).map((it) => it.peer); }
  /** Everybody whose whereabouts are known, for the maps: those drawn, and those too far for that (`far`). */
  get everyone() { return [...this.items.values()].filter((it) => it.peer.visible || it.peer.far).map((it) => it.peer); }

  update(dt, camera, width, height) {
    this.frame++;
    const cam = camera.position;
    // what the camera can see (avatars are skinned: the renderer cannot cull them by itself)
    _frustum.setFromProjectionMatrix(_m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse), camera.coordinateSystem, camera.reversedDepth);
    // in a crowd only the nearest get the full treatment: how far that goes this frame
    let full = NEAR;
    if (this.items.size > CROWD) {
      const d = this._dists || (this._dists = []);
      d.length = 0;
      for (const it of this.items.values()) if (it.peer.visible) d.push(Math.hypot(it.peer.x - cam.x, it.peer.y - cam.y, it.peer.z - cam.z));
      if (d.length > CROWD) { d.sort((a, b) => a - b); full = Math.min(NEAR, d[CROWD - 1]); }
    }
    for (const it of this.items.values()) {
      const { peer, character, tag } = it;
      const root = character.root;
      const dist = peer.visible ? Math.hypot(peer.x - cam.x, peer.y - cam.y, peer.z - cam.z) : Infinity;
      const near = dist < FAR;
      // out of sight (with a margin: its shadow may still be in view): known, placed, but not drawn nor animated
      const seen = near && (dist < 6 || _frustum.intersectsSphere(_sphere.set(_v.set(peer.x, peer.y + 1, peer.z), 3.2)));
      root.visible = seen;
      let tagOn = false;
      if (near) {
        root.position.set(peer.x, peer.y, peer.z);
        root.rotation.y = peer.yaw;
      }
      if (seen) {
        character.setAnim(peer.anim, peer.speed);
        character.setLook(peer.flags);
        character.setLight(dist > full);
        // near avatars animate every frame, the others every other frame, far ones at a quarter of the frame rate
        const every = dist <= full ? 1 : dist < 90 ? 2 : 4;
        it.late = (it.late || 0) + dt;
        if (every === 1 || (this.frame + peer.id) % every === 0) { character.update(it.late); it.late = 0; }
        if (this.world && dist < 70 && (this.frame + peer.id) % 6 === 0) {
          const cave = this.world.collision.caveAt(peer.x, peer.z, peer.y);
          character.setAmbient(cave ? cave.light(peer.x, peer.z) : 1);
        }
        if (it.trail && dist < 90 && this.world?.sparks && peer.anim !== ANIM.swim) this.world.sparks.trail(it.trail, dt, peer.x, peer.y, peer.z, peer.speed);
        if (peer.anim === ANIM.swim && dist < 120 && this.world) {
          const level = this.world.data.waterAt(peer.x, peer.z);
          if (level > -500) this.world.ripples.trail(peer.id, this.world.engine.time, dt, peer.x, level, peer.z, peer.speed, true);
        }
        if (dist < TAG_RANGE) {
          _v.set(peer.x, peer.y + 2.05, peer.z).project(camera);
          if (_v.z > -1 && _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1) {
            tagOn = true;
            const x = (_v.x * 0.5 + 0.5) * width, y = (-_v.y * 0.5 + 0.5) * height;
            tag.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
            tag.style.opacity = Math.min(1, (TAG_RANGE - dist) / 18).toFixed(2);
          }
        }
      } else it.late = 0;
      if (tagOn !== it.shown) { it.shown = tagOn; tag.style.display = tagOn ? '' : 'none'; }
    }
  }

  dispose() { for (const id of [...this.items.keys()]) this._remove(id); }
}
