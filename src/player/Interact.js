// What the player can do where they stand: sit, lie down, board the wheel… and get up again.
import { ANIM, isResting } from './Character.js';

const REACH = 1.9;

export class Interact {
  /**
   * @param {{ player: import('./PlayerController.js').PlayerController, world: object, hud: object,
   *           peers: () => Iterable<{x:number,y:number,z:number,anim:number}> }} o
   * world.seats: fixed seats (see seatAt); world.seatSources: functions (player position) → a seat that moves
   * (a gondola of the wheel) or null.
   */
  constructor({ player, world, hud, peers }) {
    this.player = player;
    this.world = world;
    this.hud = hud;
    this.peers = peers;
    this.target = null;
    this._at = { x: 0, y: 0, z: 0, yaw: 0 };
  }

  _taken(seat) {
    const p = seat.at ? seat.at(this._at) : seat;
    for (const o of this.peers()) if (isResting(o.anim) && (o.x - p.x) ** 2 + (o.z - p.z) ** 2 + (o.y - p.y) ** 2 < 0.5) return true;
    return false;
  }

  _nearest() {
    const pos = this.player.pos;
    let best = null, bestD = Infinity;
    for (const s of this.world.seats) {
      const d = (s.x - pos.x) ** 2 + (s.z - pos.z) ** 2, reach = s.reach ?? REACH;
      if (d < reach * reach && d < bestD && Math.abs(s.y - pos.y) < 1.7) { best = s; bestD = d; }
    }
    for (const source of this.world.seatSources) {
      const s = source(pos);
      if (s) return s; // a ride takes precedence
    }
    return best && !this._taken(best) ? best : null;
  }

  /** Every frame while walking. `active`: the player has the controls. */
  update(active) {
    const { player, hud } = this;
    const seat = player.seat;
    if (!active) { this.target = null; hud.setPrompt(0, null); hud.setPrompt(1, null); return; }
    if (seat) {
      this.target = null;
      hud.setPrompt(0, seat.locked ? (seat.leaving ? 'Getting off at the bottom…' : 'Get off') : 'Stand up');
      hud.setPrompt(1, seat.work ? (seat.pose === ANIM.work ? 'Close the laptop' : 'Open the laptop') : null);
      return;
    }
    const can = player.grounded && !player.swimming;
    this.target = can ? this._nearest() : null;
    hud.setPrompt(0, this.target ? this.target.label || 'Sit' : null);
    hud.setPrompt(1, null);
  }

  /** The first (0) or second (1) action offered. */
  press(i = 0) {
    const { player } = this;
    const seat = player.seat;
    if (seat) {
      if (i === 1) { if (seat.work) seat.pose = seat.pose === ANIM.work ? ANIM.sit : ANIM.work; return; }
      if (seat.locked) seat.leaving = !seat.leaving; else player.stand();
      return;
    }
    if (i === 0 && this.target && !this._taken(this.target)) {
      const s = this.target;
      if (s.work) s.pose = ANIM.work; // sitting down to work: the laptop comes out by itself
      s.leaving = false;
      player.sit(s);
    }
  }
}
