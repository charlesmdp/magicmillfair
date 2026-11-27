// War Through the Ages: its rules. No renderer here: the game, its checks and the players that play by themselves all
// read this.
//
// A long toy battlefield stands in the west meadow: one road, a base at each end. One's own is on the left, the
// other's — played by the game — on the right. Gold comes with time, and with each robot of the other side that
// falls. With it one sends robots, which march along the road and fight by themselves — three kinds an age: a
// brawler (cheap, sturdy for its price, hits what it touches), a shooter (frail, hits from afar) and a heavy one
// (slow, dear, very hard to bring down) — and builds turrets on one's base (three places; the first is there from
// the start), which shoot the first robot that comes near.
//
// On the road the robots of a side walk in one column, and the sturdy ones go in front by themselves: a heavy one
// steps past whatever is lighter, a brawler past a shooter. The first of each column meets the first of the other;
// those behind wait, and shoot over the shoulders before them if their arm is long enough. At the other's gate,
// whoever has nobody to fight hits the base — and the shooters bombard it over the heads of those who fight at the
// gate: it is they who bring a base down, and the sturdy ones who keep them alive meanwhile.
//
// Every robot that falls is experience (as much as it cost) for both sides: the war teaches everybody. Enough of
// it and one may pass to the next age — five of them: stone, iron, powder, steam, the atom —, with its three
// robots, its turret, more gold a second and a stouter base (which keeps its wounds: what was lost of it stays
// lost, as a share). The next age is there for both sides at about the same moment: who takes it first has, for a
// while, robots twice as strong. Each age has its great blow, which falls on every robot the other has on the
// road a moment after it is called, and comes back slowly.
//
// The other side plays by the same rules — the same gold, the same prices, the same six buttons, pressed through
// the same door (`press`) — from a seed (see `general`): it is a cautious general, which keeps a fifth of its gold
// in its coffers and holds a long council before each new age. After six minutes of war it has learnt: it holds
// nothing back any more.
//
// The base of the other falls: won, and the score is the time it took (ms). One's own falls: lost, no score.
//
// Places: metres along the road, `s`, from one's own gate (0) to the other's (W.road); each side counts its own
// robots from its own gate (`p`: how far a robot has come), so that the two sides are the same thing seen from
// the two ends. On the stage (see `spot`): `a` metres to the right of its middle as the camera sees it, `v`
// metres towards the camera. Time advances in steps of 1/120 s whatever the frame rate.

export const AGES = {
  name: 'War Through the Ages',
  at: { x: -259.3, z: -18.6 }, // the middle of the stage, in the west meadow, a dozen metres south of the cars' table
  look: -1.85, // the way one looks at it (a heading of the valley: 0 looks south): west, a little north — towards the cliff; the road runs across the picture
  half: { a: 18, v: 4 }, // half its length, half its depth
  rise: 0.6, // its top stands so far over the highest ground under it
  gate: { v: 20.5 }, // where one asks to play: so far in front of the middle of the stage, facing it
  step: 1 / 120,
};

/** The war: the road, the gold, the door of a base, the great blow. */
export const W = {
  road: 24, // m from gate to gate
  out: -0.75, // where a robot comes out: so far behind its own gate, under the porch of its base
  gap: 0.15, reach: 0.3, // m between two robots of a column; how far one that has no long arm hits
  pass: 0.5, // s a robot takes to step past another
  cap: 10, door: 4, // robots a side may have at once (on the road and waiting); how many may wait inside
  gold: 40, bounty: 0.4, // gold at the start; the share of its price a fallen robot gives the other side (its experience, for both sides: the whole price)
  places: 3, turretBack: 3, mount: [2.2, 3.3, 4.4], // turrets a base can carry; s before the next can be asked for; where they stand, m behind the gate
  fuse: 1.6, blowBack: 45, blowFirst: 20, // a great blow: s between the call and the fall; s before it is there again; s before the first
  limit: 900, // s: a war that is not over by then is called off (no score)
};

const unit = (id, name, cost, hp, dmg, every, range, speed, len, back) => ({ id, name, cost, hp, dmg, every, range, speed, len, back });
/**
 * The five ages. `income`: gold a second; `need`: experience to pass on to the next; `base`: what the base
 * holds; `units`: the brawler, the shooter, the heavy one — { cost, hp, dmg (a hit), every (s between hits),
 * range (m; 0: it hits what it touches), speed (m/s), len (m of road it takes), back (s before its button is
 * there again) }; `turret`: { cost, dmg, every, range (m from the gate) }; `blow`: { dmg: to every robot the
 * other has on the road }; `shot`: how fast what is shot flies (m/s).
 */
export const ERAS = [
  {
    id: 'stone', name: 'Stone Age', income: 6, need: 400, base: 1500, shot: 11,
    units: [unit('clubber', 'Clubber', 15, 56, 8, 0.8, 0, 2.2, 0.9, 1), unit('slinger', 'Slinger', 25, 30, 8, 1, 4.2, 2, 0.9, 1.6), unit('brute', 'Brute', 90, 420, 20, 1.4, 0, 1.5, 1.5, 4)],
    turret: { id: 'thrower', name: 'Rock Thrower', cost: 80, dmg: 12, every: 1.5, range: 6 },
    blow: { id: 'stones', name: 'Stones from the Sky', dmg: 62 },
  },
  {
    id: 'iron', name: 'Iron Age', income: 12, need: 840, base: 2400, shot: 16,
    units: [unit('swordsman', 'Swordsman', 34, 108, 15, 0.8, 0, 2.2, 0.9, 1), unit('archer', 'Archer', 56, 58, 15, 1, 4.6, 2, 0.9, 1.6), unit('knight', 'Knight', 200, 800, 38, 1.4, 0, 2.4, 1.8, 4)],
    turret: { id: 'ballista', name: 'Ballista', cost: 180, dmg: 33, every: 2.2, range: 6.5 },
    blow: { id: 'arrows', name: 'Rain of Arrows', dmg: 120 },
  },
  {
    id: 'powder', name: 'Powder Age', income: 26, need: 1800, base: 3800, shot: 26,
    units: [unit('buccaneer', 'Buccaneer', 76, 206, 29, 0.8, 0, 2.2, 0.9, 1), unit('musketeer', 'Musketeer', 124, 110, 44, 1.5, 5, 2, 0.9, 1.6), unit('cannon', 'Cannon', 440, 1500, 100, 2, 3, 1.4, 1.9, 4)],
    turret: { id: 'mortar', name: 'Mortar', cost: 400, dmg: 75, every: 2.6, range: 7 },
    blow: { id: 'broadside', name: 'Broadside', dmg: 230 },
  },
  {
    id: 'steam', name: 'Steam Age', income: 55, need: 3800, base: 6100, shot: 42,
    units: [unit('trooper', 'Trooper', 168, 392, 55, 0.8, 0, 2.2, 0.9, 1), unit('gunner', 'Gunner', 272, 210, 14, 0.25, 5.4, 2, 0.9, 1.6), unit('tank', 'Tank', 960, 2850, 135, 1.4, 3.4, 1.5, 2.3, 4)],
    turret: { id: 'gatling', name: 'Gatling', cost: 880, dmg: 16, every: 0.3, range: 7.5 },
    blow: { id: 'raid', name: 'Air Raid', dmg: 430 },
  },
  {
    id: 'atom', name: 'Atom Age', income: 115, need: 0, base: 9800, shot: 70,
    units: [unit('sentinel', 'Sentinel', 370, 745, 105, 0.8, 0, 2.2, 0.9, 1), unit('blaster', 'Blaster', 600, 400, 105, 1, 5.8, 2, 0.9, 1.6), unit('colossus', 'Colossus', 2100, 5400, 260, 1.4, 3.8, 1.5, 2.2, 4)],
    turret: { id: 'tesla', name: 'Tesla Coil', cost: 1900, dmg: 125, every: 1.2, range: 8 },
    blow: { id: 'atom', name: 'The Atom', dmg: 820 },
  },
];
ERAS.forEach((e, n) => { e.n = n; e.units.forEach((u, k) => { u.era = n; u.k = k; }); e.turret.era = n; e.blow.era = n; });

/** The six buttons of the panel, in their order (the keys 1 … 6). */
export const BUTTONS = ['brawler', 'shooter', 'heavy', 'turret', 'blow', 'age'];
/** Who goes in front in a column: the heavy one, then the brawler, then the shooter (by the place of each among the three). */
const RANK = [1, 2, 0];
const STEP = AGES.step, L = W.road;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/** Numbers in [0, 1) that are always the same for the same seed and the same count. */
const hash = (n, k = 0) => { const s = Math.sin(n * 127.1 + k * 311.7 + 74.7) * 43758.5453; return s - Math.floor(s); };

// ---- where it stands: the stage, as the valley sees it
const LOOK = [Math.sin(AGES.look), Math.cos(AGES.look)]; // the way the camera looks, on the plan (x, z)
/** The place of the valley that is `a` metres to the right of the middle of the stage (as the camera sees it) and `v` metres towards the camera: { x, z }. */
export const spot = (a, v = 0) => ({ x: AGES.at.x - LOOK[1] * a - LOOK[0] * v, z: AGES.at.z + LOOK[0] * a - LOOK[1] * v });
/** Where a place of the road is on the stage: `s` metres from one's own gate → `a`. */
export const along = (s) => s - L / 2;
/** Where one asks to play (a heading of the valley), in front of the stage and facing it. */
export const GATE = { ...spot(0, AGES.gate.v), yaw: AGES.look };

/**
 * A war as it begins. `seed`: what the other side makes of its gold. Each side: `gold`, `xp` (towards the next
 * age), `age` (0 … 4), `hp` (its base), `units` (its robots on the road, the first in front), `door` (those
 * waiting inside), `cool` (s before each of the buttons 1 … 4 is there again), `blow` (s before its great blow
 * is), `turrets` (its three places: null, or { era, cool }); and what it did so far (`spent`, `sent`, `felled`,
 * `lost`). A robot: `id`, `def` (see ERAS), `p` (m from its own gate), `hp`, `cool` (s before it hits again),
 * `moving`, `hit` (s since it last hit: the swing of its arm), `ouch` (s since it was last hit). `shots`: what
 * flies — { side, era, from, to (m along the road), t, T (s flown, s to fly), dmg, at (the robot aimed at, or
 * null: the base), turret (the place it left from, or -1) }. `strikes`: the great blows on their way — { side,
 * era, at (the second they fall) }.
 */
export function startWar(seed = 1) {
  const side = (i) => ({ i, gold: W.gold, earned: W.gold, xp: 0, age: 0, hp: ERAS[0].base, units: [], door: [], cool: [0, 0, 0, 0], blow: W.blowFirst, turrets: Array.from({ length: W.places }, (_, j) => (j ? null : { era: 0, cool: 0.6 })), spent: 0, sent: 0, felled: 0, lost: 0, blows: 0 });
  return { seed, clock: 0, acc: 0, over: false, won: false, out: false, time: 0, sides: [side(0), side(1)], shots: [], strikes: [], told: [], uid: 0, ai: null, bot: null };
}

/** Puts a robot of side `i` on the road, behind those already there: of age `era`, of kind `k` (0 … 2), `p` metres from its own gate. */
export function putRobot(st, i, era, k, p) {
  const d = ERAS[era].units[k], u = { id: ++st.uid, side: i, def: d, p, hp: d.hp, cool: 0.35, moving: true, hit: 9, ouch: 9, hurt: 0, swap: 0, born: st.clock };
  st.sides[i].units.push(u);
  return u;
}
/** The place of a robot along the road, as the stage has it (from the gate of side 0). */
export const roadOf = (side, p) => (side ? L - p : p);
/** The place a new turret would take on the base of `s`: a free one, else the oldest of an earlier age; -1: none. */
function placeFor(s) {
  let best = -1;
  for (let j = 0; j < W.places; j++) { const t = s.turrets[j]; if (!t) return j; if (t.era < s.age && (best < 0 || t.era < s.turrets[best].era)) best = j; }
  return best;
}
/**
 * What button `b` (0 … 5) offers side `i` now: { kind, name, cost, ok (it can be pressed), fill (0 … 1: how far
 * it has come back — or, for the next age, how much of the experience is there), why ('' | 'gold' | 'wait' |
 * 'full' | 'last') }.
 */
export function offer(st, i, b) {
  const s = st.sides[i], era = ERAS[s.age];
  if (b < 3) {
    const d = era.units[b], fill = clamp(1 - s.cool[b] / d.back, 0, 1), full = s.units.length + s.door.length >= W.cap || s.door.length >= W.door;
    return { kind: BUTTONS[b], name: d.name, cost: d.cost, fill, ok: !st.over && fill >= 1 && !full && s.gold >= d.cost, why: full ? 'full' : fill < 1 ? 'wait' : s.gold < d.cost ? 'gold' : '' };
  }
  if (b === 3) {
    const d = era.turret, fill = clamp(1 - s.cool[3] / W.turretBack, 0, 1), full = placeFor(s) < 0;
    return { kind: 'turret', name: d.name, cost: d.cost, fill, ok: !st.over && fill >= 1 && !full && s.gold >= d.cost, why: full ? 'full' : fill < 1 ? 'wait' : s.gold < d.cost ? 'gold' : '' };
  }
  if (b === 4) { const fill = clamp(1 - s.blow / W.blowBack, 0, 1); return { kind: 'blow', name: era.blow.name, cost: 0, fill, ok: !st.over && s.blow <= 0, why: s.blow > 0 ? 'wait' : '' }; }
  const last = s.age >= ERAS.length - 1, fill = last ? 1 : clamp(s.xp / era.need, 0, 1);
  return { kind: 'age', name: last ? era.name : ERAS[s.age + 1].name, cost: 0, fill, ok: !st.over && !last && s.xp >= era.need, why: last ? 'last' : s.xp < era.need ? 'wait' : '' };
}

/**
 * Side `i` presses button `b` (0 … 5: the brawler, the shooter, the heavy one, a turret, the great blow, the
 * next age). True if it bought something (what it bought is told with the events of the next step: 'buy' |
 * 'turret' | 'blow' | 'age').
 */
export function press(st, i, b) {
  if (!(b >= 0 && b < 6) || !offer(st, i, b).ok) return false;
  const s = st.sides[i], era = ERAS[s.age], events = st.told;
  if (b < 3) {
    const d = era.units[b];
    s.gold -= d.cost; s.spent += d.cost; s.cool[b] = d.back; s.door.push(d);
    events.push({ type: 'buy', side: i, k: b, era: s.age });
  } else if (b === 3) {
    const d = era.turret, j = placeFor(s);
    s.gold -= d.cost; s.spent += d.cost; s.cool[3] = W.turretBack; s.turrets[j] = { era: s.age, cool: 0.6 };
    events.push({ type: 'turret', side: i, place: j, era: s.age });
  } else if (b === 4) {
    s.blow = W.blowBack; s.blows++;
    st.strikes.push({ side: i, era: s.age, at: st.clock + W.fuse });
    events.push({ type: 'blow', side: i, era: s.age });
  } else {
    s.xp -= era.need; s.age++;
    s.hp = (s.hp / era.base) * ERAS[s.age].base; // (the base keeps its wounds: what was lost of it stays lost, as a share)
    s.cool[0] = s.cool[1] = s.cool[2] = 0;
    events.push({ type: 'age', side: i, era: s.age });
  }
  return true;
}

/**
 * Advances a war by `dt` seconds. `events` (optional) gets what happened: { type: 'buy' | 'out' (a robot comes
 * out: side, unit) | 'hit' (side, unit: who hit; at: a robot, or null — the base) | 'shot' (shot) | 'land' (shot,
 * hurt: it found what it was aimed at) | 'fall' (side, unit, gold: what its fall gave the other side) | 'base' (side:
 * whose base was hit, dmg) | 'turret' | 'blow' | 'strike' (side, era, n: robots it fell on) | 'age' | 'won' | 'lost' |
 * 'off' (called off) }. The other side is played here (`general`), on its own rhythm.
 */
export function stepWar(st, dt, events) {
  st.acc += Math.min(dt, 0.25);
  while (st.acc >= STEP && !st.over) { st.acc -= STEP; sub(st, events); }
  return st;
}

function sub(st, ev) {
  st.clock += STEP;
  const now = st.clock;
  if (st.told.length) { if (ev) for (const e of st.told) ev.push(e); st.told.length = 0; }
  for (const s of st.sides) {
    s.gold += ERAS[s.age].income * STEP; s.earned += ERAS[s.age].income * STEP;
    for (let k = 0; k < 4; k++) if (s.cool[k] > 0) s.cool[k] -= STEP;
    if (s.blow > 0) s.blow -= STEP;
    // out of the door: the next one, as soon as the one before it has left the porch
    if (s.door.length) {
      const d = s.door[0], last = s.units[s.units.length - 1];
      if (!last || last.p - last.def.len / 2 >= W.out + d.len / 2 + W.gap) {
        s.door.shift(); s.sent++;
        const unit = putRobot(st, s.i, d.era, d.k, W.out);
        ev?.push({ type: 'out', side: s.i, unit });
      }
    }
  }
  general(st, 1);
  // ---- the robots: each hits what is within its reach — the first of the other column, else the other's base —
  // and marches on until something is in its way. (Both sides read the road as it was when the step began: neither
  // is served first.)
  const fronts = [st.sides[0].units[0] || null, st.sides[1].units[0] || null], at = [fronts[0] ? fronts[0].p : 0, fronts[1] ? fronts[1].p : 0];
  let hurtBase = [0, 0];
  for (const s of st.sides) {
    const f = st.sides[1 - s.i], front = fronts[1 - s.i], edge = front ? L - at[1 - s.i] - front.def.len / 2 : Infinity; // (where the first of the other column begins, counted from one's own gate)
    for (let n = 0; n < s.units.length; n++) {
      const u = s.units[n], d = u.def, h = d.len / 2, reach = d.range || W.reach;
      u.hit += STEP; u.ouch += STEP;
      if (u.cool > 0) u.cool -= STEP;
      // (what it hits: whoever touches it; else the other's base, if its arm reaches it — shooters bombard over the
      // heads of those who fight at the gate; else the first of the other column)
      const toUnit = edge - (u.p + h), toBase = L - (u.p + h), aim = front && toUnit <= W.reach ? front : toBase <= reach ? f : front && toUnit <= reach ? front : null;
      if (aim && u.cool <= 0) {
        u.cool = d.every; u.hit = 0;
        if (d.range) {
          const dist = Math.max(0.3, aim === f ? toBase : toUnit), shot = { side: s.i, era: d.era, k: d.k, from: roadOf(s.i, u.p + h), to: roadOf(s.i, u.p + h + dist), t: 0, T: Math.max(0.07, dist / ERAS[d.era].shot), dmg: d.dmg, at: aim === f ? null : aim, turret: -1 };
          st.shots.push(shot); ev?.push({ type: 'shot', shot });
        } else {
          if (aim === f) hurtBase[f.i] += d.dmg; else { aim.hurt += d.dmg; aim.ouch = 0; }
          ev?.push({ type: 'hit', side: s.i, unit: u, at: aim === f ? null : aim });
        }
      }
      let to = u.p + d.speed * STEP;
      if (n) { const before = s.units[n - 1]; to = Math.min(to, before.p - before.def.len / 2 - h - W.gap); }
      to = Math.min(to, edge - h - 0.05, L - h);
      u.moving = to > u.p + 1e-9;
      if (u.moving) u.p = to;
    }
    // ---- the sturdy ones go in front: a heavy one that comes up behind anybody lighter, a brawler behind a shooter,
    // steps past (the two change places; each takes a moment before it does so again)
    for (let n = 1; n < s.units.length; n++) {
      const a = s.units[n - 1], b = s.units[n];
      if (RANK[b.def.k] >= RANK[a.def.k] || a.swap > now || b.swap > now || b.p - b.def.len / 2 < 0 || a.p - a.def.len / 2 - (b.p + b.def.len / 2) > W.gap + 0.1) continue; // (not under the porch: on the road)
      const head = a.p + a.def.len / 2, tail = b.p - b.def.len / 2;
      b.p = head - b.def.len / 2; a.p = tail + a.def.len / 2;
      s.units[n - 1] = b; s.units[n] = a;
      a.swap = b.swap = now + W.pass;
    }
    // ---- its turrets: each shoots the first of the other column once it is near enough to the gate
    for (let j = 0; j < W.places; j++) {
      const t = s.turrets[j];
      if (!t) continue;
      if (t.cool > 0) t.cool -= STEP;
      const d = ERAS[t.era].turret;
      if (t.cool > 0 || !front) continue;
      const far = L - at[1 - s.i] - front.def.len / 2; // (how far from one's own gate the first of the others stands)
      if (far > d.range) continue;
      t.cool = d.every;
      const shot = { side: s.i, era: t.era, k: 3, from: roadOf(s.i, -W.mount[j]), to: roadOf(s.i, far + front.def.len / 2), t: 0, T: Math.max(0.12, (far + 2.5) / ERAS[t.era].shot), dmg: d.dmg, at: front, turret: j };
      st.shots.push(shot); ev?.push({ type: 'shot', shot });
    }
  }
  // ---- what flies arrives: it hurts what it was aimed at, if that still stands
  for (let n = st.shots.length - 1; n >= 0; n--) {
    const q = st.shots[n];
    if (q.at && q.at.hp > 0) q.to = roadOf(q.at.side, q.at.p);
    if ((q.t += STEP) < q.T) continue;
    st.shots.splice(n, 1);
    const hurt = !q.at || q.at.hp > 0;
    if (!q.at) hurtBase[1 - q.side] += q.dmg; else if (hurt) { q.at.hurt += q.dmg; q.at.ouch = 0; }
    ev?.push({ type: 'land', shot: q, hurt });
  }
  // ---- the great blows fall: on every robot the other side has on the road
  for (let n = st.strikes.length - 1; n >= 0; n--) {
    const k = st.strikes[n];
    if (now < k.at) continue;
    st.strikes.splice(n, 1);
    const f = st.sides[1 - k.side], dmg = ERAS[k.era].blow.dmg;
    for (const u of f.units) { u.hurt += dmg; u.ouch = 0; }
    ev?.push({ type: 'strike', side: k.side, era: k.era, n: f.units.length });
  }
  // ---- who falls: its price is experience for both sides, a share of it gold for the other
  for (const s of st.sides) {
    const f = st.sides[1 - s.i];
    let fell = false;
    for (const u of s.units) {
      if (u.hurt) { u.hp -= u.hurt; u.hurt = 0; }
      if (u.hp > 0) continue;
      fell = true;
      const gold = Math.round(u.def.cost * W.bounty);
      f.gold += gold; f.earned += gold; f.xp += u.def.cost; s.xp += u.def.cost; f.felled++; s.lost++;
      ev?.push({ type: 'fall', side: s.i, unit: u, gold });
    }
    if (fell) s.units = s.units.filter((u) => u.hp > 0);
    if (hurtBase[s.i]) { s.hp = Math.max(0, s.hp - hurtBase[s.i]); ev?.push({ type: 'base', side: s.i, dmg: hurtBase[s.i] }); }
  }
  // ---- the end: the other's base down while one's own stands is the only way to win
  const mine = st.sides[0].hp, theirs = st.sides[1].hp;
  if (mine <= 0 || theirs <= 0) {
    st.over = true; st.won = theirs <= 0 && mine > 0; st.time = st.won ? Math.round(now * 1000) : 0;
    ev?.push({ type: st.won ? 'won' : 'lost', time: st.time });
  } else if (now >= W.limit) { st.over = true; st.out = true; ev?.push({ type: 'off' }); }
}

// ---------------------------------------------------------------------------------------------------------
// The other general. It has the same six buttons, and looks at the road a little less than once a second. It sends
// its robots in an order it keeps to, waiting until it can pay for the next; some time after it came to an age, it
// builds a turret of that age; with nobody of its own out and somebody near its gate, a brawler goes out at once.
// It is cautious: a fifth of the gold it gets stays in its coffers, it holds a long council before each new age
// (the experience is there for both sides at about the same moment: one has that long to make use of it), and its
// great blow waits for a crowd. After `bold` seconds of war it has learnt: it holds nothing back. What it draws
// from the seed: where its order begins, and the moments it looks at the road.

export const GENERAL = {
  every: 1.2, first: 6, // s between two looks at the road; before the first
  council: 26, // s between having the experience and passing to the next age
  blow: 5, // robots on its half of the road before its great blow falls
  order: [0, 1, 0, 1, 1, 0, 1, 0, 1, 2], // what it sends, in turn: brawlers, shooters, a heavy one — it waits until it can pay for the next
  turretAt: 25, // s after it came to an age, it builds a turret of that age
  alarm: 8, // m from its gate: nearer than that with none of its own on the road, a brawler goes out at once
  thrift: 0.8, // the share of the gold it gets that it lets itself spend: the rest stays in its coffers
  bold: 360, boldOrder: [2, 1, 1], // after so many seconds of war it holds nothing back: its coffers are spent, no council, its great blow on three, and this order
};

function general(st, i) {
  const G = GENERAL, g = (st.ai ||= { next: G.first, n: 0, at: Math.floor(hash(st.seed, 7) * 3), ageAt: 0, since: 0, turret: 0, bold: false });
  if (st.clock < g.next) return;
  g.n++;
  g.next = st.clock + G.every * (0.8 + 0.4 * hash(st.seed, g.n));
  const s = st.sides[i], f = st.sides[1 - i], era = ERAS[s.age], bold = st.clock >= G.bold;
  if (bold && !g.bold) { g.bold = true; st.told.push({ type: 'bold', side: i }); }
  // the next age, after the council
  if (s.age < ERAS.length - 1 && s.xp >= era.need) {
    if (!g.ageAt) g.ageAt = st.clock + (bold ? 2 : G.council);
    else if (st.clock >= g.ageAt) { g.ageAt = 0; if (press(st, i, 5)) { g.since = st.clock; return; } }
  }
  // the great blow: when enough of them are on its half
  if (s.blow <= 0) {
    let near = 0; for (const u of f.units) if (u.p > L * 0.5) near++;
    if (near >= (bold ? 3 : G.blow) && press(st, i, 4)) return;
  }
  const free = bold ? s.gold : s.gold - (1 - G.thrift) * s.earned, buy = (b) => free >= offer(st, i, b).cost && press(st, i, b);
  // somebody near its gate and nobody to answer: a brawler, at once
  if (!s.units.length && !s.door.length && f.units.length && f.units[0].p > L - G.alarm && buy(0)) return;
  // a turret of its age, some time after it came to it; else the next of its order
  if (g.turret < s.age + 1 && st.clock - g.since >= G.turretAt && placeFor(s) >= 0) { if (buy(3)) g.turret = s.age + 1; return; }
  const order = bold ? G.boldOrder : G.order;
  if (buy(order[g.at % order.length])) g.at++;
}

// ---------------------------------------------------------------------------------------------------------
// Players that play by themselves, on one's own side. Each looks at the war on its own rhythm — never more than
// a few times a second — and presses one button at a time, as a hand does.

const eyes = (st, every, first = 0.5) => { const b = (st.bot ||= { next: first, n: 0 }); if (st.clock < b.next) return null; b.n++; b.next = st.clock + every; return b; };

/**
 * The player that plays by itself (the checks, and `session.auto`): it looks three times a second and acts on what
 * it saw the time before — a third of a second late. It sends a shooter, then a heavy one, in turn (the heavy ones
 * step to the front by themselves), waiting for the gold of the next rather than send what is cheap; with nobody on
 * the road and the others past the first third of it, a brawler goes out at once. It builds a turret in the ages
 * it means to, lets its great blow fall on a crowd, and passes to the next age as soon as it can.
 */
export function acePlay(st, o = ACE) {
  const b = eyes(st, o.every);
  if (!b) return;
  const s = st.sides[0], f = st.sides[1], era = ERAS[s.age], seen = b.seen;
  b.seen = { foes: f.units.length, worth: f.units.reduce((n, u) => n + u.def.cost, 0), front: f.units.length ? L - f.units[0].p : L };
  if (!seen) return;
  if (press(st, 0, 5)) { b.at = 0; b.since = st.clock; return; }
  const mine = s.units.length + s.door.length;
  // the great blow: on a crowd — enough of them, worth enough
  if (s.blow <= 0 && seen.foes >= o.blowMin && seen.worth >= o.blowWorth * era.units[0].cost && press(st, 0, 4)) return;
  // nobody on the road and they are coming: a brawler, now
  if (!mine && seen.front < L * o.near && press(st, 0, 0)) return;
  // a turret of this age, some time after it came — it waits for its price once part of it is there
  if (o.turrets[s.age] && (b.turret ?? -1) < s.age && st.clock - (b.since || 0) >= o.turretAt && mine >= 1) { if (press(st, 0, 3)) b.turret = s.age; else if (s.gold >= era.turret.cost * o.saveFrom) return; }
  const order = o.order[s.age] || o.order[0];
  if (press(st, 0, order[(b.at || 0) % order.length])) b.at = (b.at || 0) + 1;
}
/**
 * How it plays: `every` (s between two looks), `blowMin`, `blowWorth` (its great blow: on so many of the others,
 * worth so many brawlers of its age), `near` (the share of the road the others may hold before a brawler goes out
 * alone), `turrets` (the ages it builds one in), `turretAt` (s after it came to the age), `saveFrom` (the share of
 * a turret's price from which it waits for the rest), `order` (what it sends, in turn: 0 a brawler, 1 a shooter, 2
 * a heavy one — one order for all the ages, or one each).
 */
export const ACE = { every: 1 / 3, blowMin: 3, blowWorth: 2, near: 0.7, turrets: [0, 1, 0, 1, 0], turretAt: 25, saveFrom: 0.3, order: [[1, 2]] };

/**
 * A newcomer who was told one thing — "a sturdy one in front, shooters behind, a heavy one when you can": it looks
 * once a second, sends its robots in that order, sees the button of the next age some seconds after it lit, lets
 * its great blow fall some seconds after a few of the others are on the road, and never builds a turret.
 */
export function newcomerPlay(st, o = NEWCOMER) {
  const b = eyes(st, o.every, 1.5);
  if (!b) return;
  const s = st.sides[0], f = st.sides[1];
  if (offer(st, 0, 5).ok) { if ((b.age = (b.age || 0) + 1) >= o.late) { b.age = 0; press(st, 0, 5); } return; }
  if (s.blow <= 0 && f.units.length >= o.blowMin) { if ((b.blow = (b.blow || 0) + 1) >= o.blowLate) { b.blow = 0; if (press(st, 0, 4)) return; } }
  if (!s.units.length && !s.door.length && f.units.length && f.units[0].p > L - o.alarm && press(st, 0, 0)) return; // (they are at the gate and nobody is out: a brawler)
  if (press(st, 0, o.order[(b.at || 0) % o.order.length])) b.at = (b.at || 0) + 1;
}
export const NEWCOMER = { every: 1, late: 4, blowMin: 3, blowLate: 3, alarm: 8, order: [0, 1, 0, 1, 1, 2] };

/** A clumsy one: every two seconds or so it presses one of the six buttons, any of them, lit or not. */
export function clumsyPlay(st) {
  const b = eyes(st, 1.5, 2);
  if (!b) return;
  b.next += hash(st.seed + 0.75, b.n);
  press(st, 0, Math.floor(hash(st.seed + 0.125, b.n) * 6));
}
/** One who hammers the first button, and nothing else. */
export function masherPlay(st) { if (eyes(st, 0.5, 1)) press(st, 0, 0); }
/** Who never presses anything. */
export function idlePlay() {}

/**
 * Runs a war with `play` on one's own side (the player that plays by itself, unless another is given), until it is
 * over or `secs` have passed: { won, time (ms; 0: no victory), over, out, clock, state, events: how many of each,
 * ages: the second each side passed to each age }.
 */
export function warRun(seed = 1, play = acePlay, secs = W.limit + 5) {
  const st = startWar(seed), events = [], counts = {}, ages = [[0], [0]];
  while (st.clock < secs && !st.over) {
    play(st); stepWar(st, STEP, events);
    for (const e of events) { counts[e.type] = (counts[e.type] || 0) + 1; if (e.type === 'age') ages[e.side].push(st.clock); }
    events.length = 0;
  }
  return { won: st.won, time: st.time, over: st.over, out: st.out, clock: st.clock, state: st, events: counts, ages };
}

/**
 * The board of scores of the game: the time of the victory (ms). The most: the second after which a war is called
 * off. The least: under anything that was ever found — the quickest of some two thousand ways of playing takes more
 * than two minutes (tools/ages-test.mjs looks for quicker ones, and counts what the rules alone forbid: a base
 * cannot fall in under half a minute whatever one does).
 */
export const BOARD = { order: 'asc', min: 80_000, max: W.limit * 1000 };

