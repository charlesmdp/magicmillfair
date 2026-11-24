// Meltdown Run: the game inside the arcade cabinet of the pier. The robot of the fair runs away from a reactor
// that is giving up — over drums, over pools of something green, under the drones that patrol the road; the
// longer the run, the faster. It is drawn on a small canvas (480 × 270, shown large and with square pixels)
// laid over the game while one plays; nothing of it lives in the 3D world but the cabinet.
//
// The game (main.js) opens a session, steps it every frame with what is pressed ({ jump, duck }) and reads its
// score at the end: a metre for every ten pixels run, twenty-five for each isotope picked up on the way.
// The rules are ArcadeRules.js (the server plays a run again with them): this file is the screen and the sound.
import { W, GROUND, TICK, JUMPED, LANDED, COIN, CRASHED, CHECKPOINT, runOf, runLog } from './ArcadeRules.js';
import { packLog, seedWait } from '../world/zones/games/core.js';

const H = 270;
const SKY = ['#2a1a3e', '#5b2a52', '#b04a4a', '#f08a3c', '#f7c95c'];
const rnd = (a, b) => a + Math.random() * (b - a); // (for what is only looked at: the dust, the shaking)
/** The road before a run: nothing on it, nobody running yet. */
const REST = () => ({ t: 0, x: 0, speed: 190, y: 0, air: false, duck: false, things: [], score: 0, over: false });

export class Arcade {
  /** @param parent where the screen is laid (the interface of the game) */
  constructor(parent) {
    this.el = document.createElement('div');
    this.el.className = 'arcade';
    this.el.innerHTML = '<div class="bezel"><b class="marquee">MELTDOWN RUN</b><canvas width="480" height="270"></canvas><div class="keys"><span>JUMP · Space, ↑ or tap the top</span><span>DUCK · ↓, S or hold the bottom</span></div></div>';
    parent.append(this.el);
    this.canvas = this.el.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.session = null;
  }

  get isOpen() { return !!this.session; }

  /** Where a press on the screen (in page pixels) falls: 'jump', 'duck' or null (outside the picture). */
  zone(x, y) {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || y < r.top - 40 || y > r.bottom + 60) return null;
    return y > r.top + r.height * 0.62 ? 'duck' : 'jump';
  }

  /**
   * A run begins. `io`: { play(sound, options) }; `color`: the colour of the robot (a CSS colour); `seeded`: the
   * seed of the run — a promise of the one the server drew for it, or a whole number (a rehearsal); none: the
   * device's own dice (the run cannot be played again by the server). Returns the session: { over, score, line,
   * step(dt, { jump, duck }), log() (what was pressed and when, for the server; null without a seed),
   * restart(seeded), close() }. A run is stepped 120 times a second, whatever the screen.
   */
  open(io, color = '#9fb4c8', seeded = null) {
    const ctx = this.ctx;
    // (`q`: the run as the rules keep it; the rest is only looked at)
    let run = null, q = REST(), written = null, held = 0, turn = 0, crash = 0, stride = 0, dust = [], shake = 0, best = 0;
    const begin = (given) => {
      if (run) return;
      const seed = Number.isInteger(given) ? given : undefined;
      run = runOf(seed); q = run.s;
      written = seed !== undefined ? runLog() : null;
    };
    // (a promise: the server is drawing the seed — a moment, a few seconds at the most; else at once)
    const wait = (seeded) => {
      const mine = ++turn, go = (given) => { if (mine === turn) begin(given); };
      if (typeof seeded?.then === 'function') { seeded.then(go, () => go()); setTimeout(go, seedWait()); } else go(seeded);
    };
    const draw = () => {
      const sx = shake > 0 ? Math.round(rnd(-2, 2)) : 0, sy = shake > 0 ? Math.round(rnd(-2, 2)) : 0;
      ctx.setTransform(1, 0, 0, 1, sx, sy);
      // the sky at dusk, a low sun, the towers of the plant far behind, dunes, the road
      for (let k = 0; k < SKY.length; k++) { ctx.fillStyle = SKY[k]; ctx.fillRect(-4, Math.round((k * GROUND) / SKY.length) - 4, W + 8, GROUND / SKY.length + 5); }
      ctx.fillStyle = '#ffe9a6'; ctx.beginPath(); ctx.arc(360, 150, 34, 0, 7); ctx.fill();
      ctx.fillStyle = '#f7c95c'; for (let k = 0; k < 4; k++) ctx.fillRect(322, 152 + k * 9, 76, 3);
      const far = (q.x * 0.12) % 240;
      ctx.fillStyle = '#3a2148';
      for (let k = -1; k < 3; k++) {
        const bx = k * 240 - far;
        ctx.beginPath(); ctx.moveTo(bx + 30, GROUND); ctx.lineTo(bx + 42, 128); ctx.lineTo(bx + 76, 128); ctx.lineTo(bx + 88, GROUND); ctx.closePath(); ctx.fill(); // a cooling tower
        ctx.fillRect(bx + 120, 150, 26, 64); ctx.fillRect(bx + 150, 164, 44, 50); ctx.fillRect(bx + 128, 132, 5, 20);
        ctx.fillStyle = '#6b3a5c'; ctx.beginPath(); ctx.arc(bx + 59 + ((q.t * 6) % 30), 116 - ((q.t * 9) % 26), 9 + ((q.t * 3) % 6), 0, 7); ctx.fill(); // its steam
        ctx.fillStyle = '#3a2148';
      }
      const mid = (q.x * 0.4) % 160;
      ctx.fillStyle = '#5a2c44';
      for (let k = -1; k < 5; k++) { ctx.beginPath(); ctx.ellipse(k * 160 - mid + 80, GROUND + 6, 110, 34, 0, Math.PI, 0); ctx.fill(); }
      ctx.fillStyle = '#2a1626'; ctx.fillRect(-4, GROUND, W + 8, H - GROUND + 4);
      ctx.fillStyle = '#f2c14e'; ctx.fillRect(-4, GROUND, W + 8, 2);
      ctx.fillStyle = '#4a2a3e';
      for (let k = 0; k < 9; k++) ctx.fillRect(((k * 64 - q.x) % 576 + 576) % 576 - 48, GROUND + 14 + (k % 3) * 12, 26, 3);
      // what is on the road
      for (const o of q.things) {
        const ox = Math.round(o.x - q.x), oy = GROUND - o.up - o.h;
        if (ox > W + 30 || ox < -60) continue;
        if (o.kind === 'drum' || o.kind === 'stack' || o.kind === 'tall') {
          const n = o.kind === 'stack' ? 2 : 1, rows = o.kind === 'tall' ? 2 : 1;
          for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) {
            const dx = ox + i * 20, dy = oy + j * 21, dh = o.kind === 'tall' ? 21 : 24;
            ctx.fillStyle = '#e8b420'; ctx.fillRect(dx, dy, 18, dh);
            ctx.fillStyle = '#9a7410'; ctx.fillRect(dx, dy + 4, 18, 2); ctx.fillRect(dx, dy + dh - 6, 18, 2);
            ctx.fillStyle = '#1a1410'; ctx.fillRect(dx + 6, dy + 9, 6, 6); ctx.fillStyle = '#e8b420'; ctx.fillRect(dx + 8, dy + 11, 2, 2);
          }
        } else if (o.kind === 'pool') {
          ctx.fillStyle = '#7dff5a'; ctx.fillRect(ox, oy + 2, o.w, 3); ctx.fillRect(ox + 4, oy, o.w - 8, 2);
          ctx.fillStyle = '#d6ffc4'; ctx.fillRect(ox + 8 + Math.round(4 * Math.sin(q.t * 6 + o.ph)), oy - 3 - ((q.t * 20 + o.ph * 9) % 9), 2, 2);
        } else if (o.kind === 'drone' || o.kind === 'high') {
          const bob = Math.round(2 * Math.sin(q.t * 7 + o.ph));
          ctx.fillStyle = '#20222c'; ctx.fillRect(ox + 4, oy + 4 + bob, 26, 9);
          ctx.fillStyle = '#ff4a3c'; ctx.fillRect(ox + 8, oy + 7 + bob, 5, 3);
          ctx.fillStyle = '#8a90a0'; ctx.fillRect(ox + (Math.floor(q.t * 30) % 2 ? 0 : 6), oy + bob, 22 + (Math.floor(q.t * 30) % 2 ? 12 : 0), 2);
        } else if (!o.gone) {
          ctx.fillStyle = '#7dff5a'; ctx.beginPath(); ctx.arc(ox + 5, oy + 5 + Math.round(2 * Math.sin(q.t * 5 + o.x)), 5, 0, 7); ctx.fill();
          ctx.fillStyle = '#eaffdf'; ctx.fillRect(ox + 3, oy + 2 + Math.round(2 * Math.sin(q.t * 5 + o.x)), 2, 2);
        }
      }
      // the robot: a round head with a visor and an antenna, a body the colour of its owner, legs that run
      const rx = 64, low = q.duck && !q.air, ry = GROUND - q.y - (low ? 20 : 34), run = Math.floor(stride) % 2;
      for (const d of dust) { ctx.fillStyle = `rgba(240, 200, 150, ${Math.max(0, d.l) * 0.7})`; ctx.fillRect(Math.round(d.x - q.x), Math.round(GROUND - d.y), 3, 3); }
      if (low) {
        ctx.fillStyle = color; ctx.fillRect(rx - 2, ry + 8, 26, 9);
        ctx.fillStyle = '#dfe6ee'; ctx.fillRect(rx + 12, ry, 16, 13); ctx.fillStyle = '#1a2230'; ctx.fillRect(rx + 18, ry + 4, 10, 4);
        ctx.fillStyle = '#5a6272'; ctx.fillRect(rx, ry + 17, 7, 3); ctx.fillRect(rx + 14, ry + 17, 7, 3);
      } else {
        ctx.fillStyle = '#5a6272'; ctx.fillRect(rx + 11, ry - 6, 2, 6); ctx.fillStyle = '#ff4a3c'; ctx.fillRect(rx + 10, ry - 8, 4, 3); // the antenna
        ctx.fillStyle = '#dfe6ee'; ctx.fillRect(rx + 2, ry, 20, 14); ctx.fillRect(rx + 4, ry - 2, 16, 2);
        ctx.fillStyle = '#1a2230'; ctx.fillRect(rx + 10, ry + 4, 12, 5);
        ctx.fillStyle = '#7dff5a'; ctx.fillRect(rx + (crash ? 12 : 17), ry + 5, 3, 3);
        ctx.fillStyle = color; ctx.fillRect(rx + 5, ry + 14, 14, 12);
        ctx.fillStyle = '#5a6272';
        if (q.air) { ctx.fillRect(rx + 5, ry + 26, 4, 5); ctx.fillRect(rx + 15, ry + 25, 4, 5); ctx.fillRect(rx + 1, ry + 16, 4, 3); ctx.fillRect(rx + 19, ry + 14, 4, 3); }
        else { ctx.fillRect(rx + (run ? 4 : 8), ry + 26, 4, 8); ctx.fillRect(rx + (run ? 15 : 11), ry + 26, 4, run ? 6 : 8); ctx.fillRect(rx + (run ? 1 : 3), ry + 17, 4, 3); ctx.fillRect(rx + (run ? 19 : 17), ry + 18, 4, 3); }
      }
      // the counter, and what the screen says
      ctx.textBaseline = 'top'; ctx.font = "bold 14px 'Courier New', monospace";
      ctx.fillStyle = '#1a1020'; ctx.textAlign = 'right'; ctx.fillText(`${String(q.score).padStart(5, '0')} m`, W - 9, 11);
      ctx.fillStyle = '#ffe9a6'; ctx.fillText(`${String(q.score).padStart(5, '0')} m`, W - 10, 10);
      if (best) { ctx.fillStyle = '#f0b98a'; ctx.font = "bold 10px 'Courier New', monospace"; ctx.fillText(`BEST ${best} m`, W - 10, 28); }
      if (crash) {
        ctx.fillStyle = 'rgba(20, 8, 24, 0.55)'; ctx.fillRect(-4, 78, W + 8, 84);
        ctx.textAlign = 'center'; ctx.fillStyle = '#ff5a48'; ctx.font = "bold 30px 'Courier New', monospace"; ctx.fillText('MELTDOWN!', W / 2, 88);
        ctx.fillStyle = '#ffe9a6'; ctx.font = "bold 13px 'Courier New', monospace"; ctx.fillText(`${q.score} m — jump to run again`, W / 2, 128);
        ctx.fillStyle = '#c9b6d6'; ctx.font = "bold 10px 'Courier New', monospace"; ctx.fillText('E or Esc: walk away', W / 2, 146);
      } else if (q.t < 2.4) {
        ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9a6'; ctx.font = "bold 15px 'Courier New', monospace"; ctx.fillText('RUN!', W / 2, 60);
        ctx.fillStyle = '#f7e2c0'; ctx.font = "bold 10px 'Courier New', monospace"; ctx.fillText('jump the drums and the pools · duck the drones', W / 2, 80);
      }
    };
    const session = {
      over: false, score: 0, line: 'Meltdown Run',
      step: (dt, keys) => {
        dt = Math.min(dt, 0.05);
        if (crash) { crash += dt; if (shake > 0) shake -= dt; draw(); return; }
        if (!run) { draw(); return; } // (not before the server has said which seed: a moment)
        held += dt;
        const now = (keys.jump ? 1 : 0) | (keys.duck ? 2 : 0);
        let ev = 0;
        while (held >= TICK && !q.over) {
          held -= TICK;
          written?.step(now);
          ev |= run.tick(now);
        }
        stride += dt * (q.speed / 22);
        if (ev & JUMPED) io.play('jump', { volume: 0.4, rate: 1.4 });
        if (ev & LANDED) for (let k = 0; k < 3; k++) dust.push({ x: q.x + 64 + rnd(0, 16), y: rnd(0, 3), l: 0.35 });
        for (const d of dust) { d.l -= dt; d.y += 14 * dt; }
        dust = dust.filter((d) => d.l > 0);
        if (ev & COIN) io.play('coin', { volume: 0.5 });
        if (ev & CHECKPOINT) io.play('checkpoint', { volume: 0.5 });
        if (ev & CRASHED) {
          crash = 0.001; shake = 0.35;
          session.over = true;
          best = Math.max(best, q.score);
          io.play('fail', { volume: 0.8 });
        }
        session.score = q.score;
        session.line = `Meltdown Run · ${q.score} m`;
        draw();
      },
      /** What was pressed and when, for the server (null: the run had no seed, or is not over). */
      log: () => (written && q.over ? packLog(written.words()) : null),
      /** What is on the road ahead, and how fast it comes: { speed, things: [{ kind, gap (pixels to the robot), wide, up }] }. */
      peek: () => ({ speed: q.speed, things: q.things.filter((o) => !o.gone && o.kind !== 'iso').map((o) => ({ kind: o.kind, gap: o.x + 2 - (q.x + 84), wide: o.w - 4, up: o.up })) }),
      /** Another run, on the same screen (`seeded`: its seed, as for open). */
      restart: (seeded = null) => { run = null; q = REST(); written = null; held = 0; crash = 0; stride = 0; dust = []; shake = 0; session.over = false; session.score = 0; wait(seeded); },
      close: () => { turn++; this.el.classList.remove('on'); this.session = null; },
    };
    wait(seeded);
    this.session = session;
    this.el.classList.add('on');
    draw();
    return session;
  }
}

/** The picture on the screen of the cabinet while nobody plays (drawn once on a small canvas). */
export function arcadeTitle(ctx, w, h) {
  for (let k = 0; k < SKY.length; k++) { ctx.fillStyle = SKY[k]; ctx.fillRect(0, (k * h) / SKY.length, w, h / SKY.length + 1); }
  ctx.fillStyle = '#ffe9a6'; ctx.beginPath(); ctx.arc(w * 0.74, h * 0.56, h * 0.16, 0, 7); ctx.fill();
  ctx.fillStyle = '#2a1626'; ctx.fillRect(0, h * 0.8, w, h * 0.2);
  ctx.fillStyle = '#f2c14e'; ctx.fillRect(0, h * 0.8, w, h * 0.012);
  ctx.fillStyle = '#3a2148'; ctx.beginPath(); ctx.moveTo(w * 0.08, h * 0.8); ctx.lineTo(w * 0.13, h * 0.42); ctx.lineTo(w * 0.27, h * 0.42); ctx.lineTo(w * 0.32, h * 0.8); ctx.closePath(); ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1a1020'; ctx.font = `bold ${Math.round(h * 0.2)}px 'Courier New', monospace`; ctx.fillText('MELTDOWN', w / 2 + 3, h * 0.24 + 3); ctx.fillText('RUN', w / 2 + 3, h * 0.45 + 3);
  ctx.fillStyle = '#ff5a48'; ctx.fillText('MELTDOWN', w / 2, h * 0.24); ctx.fillStyle = '#ffe9a6'; ctx.fillText('RUN', w / 2, h * 0.45);
  ctx.fillStyle = '#7dff5a'; ctx.font = `bold ${Math.round(h * 0.085)}px 'Courier New', monospace`; ctx.fillText('PRESS E TO PLAY', w / 2, h * 0.9);
}
