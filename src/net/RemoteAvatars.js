// Draws the other visitors: one avatar and one name tag per peer of the presence layer.
import * as THREE from 'three';
import { ANIM, EMOTES, RANK_EMOTES } from '../player/Character.js';

const FAR = 240; // m: avatars further away are not drawn
const TAG_RANGE = 70; // m: name tags fade out with distance
const _v = new THREE.Vector3();

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
      it.tag.remove();
      it.tag = this.hud.tag(peer.id, peer.name, peer.color);
    });
    presence.on('emote', ({ id, emote }) => {
      const it = this.items.get(id);
      if (!it) return;
      if (emote < EMOTES.length) it.character.emote(emote);
      else if (it.peer.visible) this.rank?.play(RANK_EMOTES[emote - EMOTES.length], it.character.root);
    });
    for (const peer of presence.peers.values()) this._add(peer);
  }

  _add(peer) {
    if (this.items.has(peer.id)) return;
    const character = this.factory.create(peer.color);
    character.root.visible = false;
    this.scene.add(character.root);
    this.items.set(peer.id, { peer, character, tag: this.hud.tag(peer.id, peer.name, peer.color), shown: false });
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

  /** Positions for the minimap. */
  get list() { return [...this.items.values()].filter((it) => it.peer.visible).map((it) => it.peer); }

  update(dt, camera, width, height) {
    this.frame++;
    const cam = camera.position;
    for (const it of this.items.values()) {
      const { peer, character, tag } = it;
      const root = character.root;
      const dist = peer.visible ? Math.hypot(peer.x - cam.x, peer.y - cam.y, peer.z - cam.z) : Infinity;
      const visible = dist < FAR;
      root.visible = visible;
      let tagOn = false;
      if (visible) {
        root.position.set(peer.x, peer.y, peer.z);
        root.rotation.y = peer.yaw;
        character.setAnim(peer.anim, peer.speed);
        // far avatars animate at a third of the frame rate
        if (dist < 90) character.update(dt);
        else if ((this.frame + peer.id) % 3 === 0) character.update(dt * 3);
        if (this.world && dist < 70 && (this.frame + peer.id) % 6 === 0) {
          const cave = this.world.collision.caveAt(peer.x, peer.z);
          character.setAmbient(cave ? cave.light(peer.x, peer.z) : 1);
        }
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
      }
      if (tagOn !== it.shown) { it.shown = tagOn; tag.style.display = tagOn ? '' : 'none'; }
    }
  }

  dispose() { for (const id of [...this.items.keys()]) this._remove(id); }
}
