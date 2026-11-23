// Meltdown Run: the game inside the arcade cabinet of the pier. The robot of the fair runs away from a reactor
// that is giving up — over drums, over pools of something green, under the drones that patrol the road; the
// longer the run, the faster. It is drawn on a small canvas (480 × 270, shown large and with square pixels)
// laid over the game while one plays; nothing of it lives in the 3D world but the cabinet.
//
// The game (main.js) opens a session, steps it every frame with what is pressed ({ jump, duck }) and reads its
// score at the end: a metre for every ten pixels run, twenty-five for each isotope picked up on the way.

const W = 480, H = 270, GROUND = 214;
const SKY = ['#2a1a3e', '#5b2a52', '#b04a4a', '#f08a3c', '#f7c95c'];
const rnd = (a, b) => a + Math.random() * (b - a);

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
   * A run begins. `io`: { play(sound, options) }; `color`: the colour of the robot (a CSS colour). Returns the
   * session: { over, score, line, step(dt, { jump, duck }), restart(), close() }.
   */
  open(io, color = '#9fb4c8') {
    const ctx = this.ctx;
    let t, x, speed, y, vy, air, duck, crash, things, next, score, bonus, step, dust, shake, want, best = 0, held = false;
    const reset = () => { t = 0; x = 0; speed = 190; y = 0; vy = 0; air = false; duck = false; crash = 0; things = []; next = 420; score = 0; bonus = 0; step = 0; dust = []; shake = 0; want = 0; };
    // what comes down the road: [kind, width, height, how high its foot is above the ground]
    const KINDS = { drum: [18, 24, 0], stack: [38, 24, 0], tall: [20, 42, 0], pool: [44, 5, 0], drone: [34, 13, 23], high: [34, 13, 58], iso: [10, 10, 52] };
    const spawn = () => {
      const p = Math.min(1, t / 60), r = Math.random();
      const kind = t < 6 ? 'drum' : r < 0.26 ? 'drum' : r < 0.42 ? 'stack' : r < 0.55 - 0.05 * p ? 'pool' : r < 0.78 ? 'drone' : r < 0.86 ? 'high' : 'tall';
      const [w, h, up] = KINDS[kind];
      things.push({ kind, x: x + W + 20, w, h, up, ph: rnd(0, 6) });
      // (an isotope now and then: over a drum for the taking, or in the open)
      if (Math.random() < 0.3) things.push({ kind: 'iso', x: x + W + 20 + (kind === 'drum' || kind === 'pool' ? w / 2 - 5 : rnd(90, 150)), w: 10, h: 10, up: kind === 'drum' || kind === 'pool' ? 62 : rnd(8, 58), ph: 0 });
      next = x + W + 20 + speed * rnd(0.72, 1.3) + w;
    };
    const draw = () => {
      const sx = shake > 0 ? Math.round(rnd(-2, 2)) : 0, sy = shake > 0 ? Math.round(rnd(-2, 2)) : 0;
      ctx.setTransform(1, 0, 0, 1, sx, sy);
      // the sky at dusk, a low sun, the towers of the plant far behind, dunes, the road
      for (let k = 0; k < SKY.length; k++) { ctx.fillStyle = SKY[k]; ctx.fillRect(-4, Math.round((k * GROUND) / SKY.length) - 4, W + 8, GROUND / SKY.length + 5); }
      ctx.fillStyle = '#ffe9a6'; ctx.beginPath(); ctx.arc(360, 150, 34, 0, 7); ctx.fill();
      ctx.fillStyle = '#f7c95c'; for (let k = 0; k < 4; k++) ctx.fillRect(322, 152 + k * 9, 76, 3);
      const far = (x * 0.12) % 240;
      ctx.fillStyle = '#3a2148';
      for (let k = -1; k < 3; k++) {
        const bx = k * 240 - far;
        ctx.beginPath(); ctx.moveTo(bx + 30, GROUND); ctx.lineTo(bx + 42, 128); ctx.lineTo(bx + 76, 128); ctx.lineTo(bx + 88, GROUND); ctx.closePath(); ctx.fill(); // a cooling tower
        ctx.fillRect(bx + 120, 150, 26, 64); ctx.fillRect(bx + 150, 164, 44, 50); ctx.fillRect(bx + 128, 132, 5, 20);
        ctx.fillStyle = '#6b3a5c'; ctx.beginPath(); ctx.arc(bx + 59 + ((t * 6) % 30), 116 - ((t * 9) % 26), 9 + ((t * 3) % 6), 0, 7); ctx.fill(); // its steam
        ctx.fillStyle = '#3a2148';
      }
      const mid = (x * 0.4) % 160;
      ctx.fillStyle = '#5a2c44';
      for (let k = -1; k < 5; k++) { ctx.beginPath(); ctx.ellipse(k * 160 - mid + 80, GROUND + 6, 110, 34, 0, Math.PI, 0); ctx.fill(); }
      ctx.fillStyle = '#2a1626'; ctx.fillRect(-4, GROUND, W + 8, H - GROUND + 4);
      ctx.fillStyle = '#f2c14e'; ctx.fillRect(-4, GROUND, W + 8, 2);
      ctx.fillStyle = '#4a2a3e';
      for (let k = 0; k < 9; k++) ctx.fillRect(((k * 64 - x) % 576 + 576) % 576 - 48, GROUND + 14 + (k % 3) * 12, 26, 3);
      // what is on the road
      for (const o of things) {
        const ox = Math.round(o.x - x), oy = GROUND - o.up - o.h;
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
          ctx.fillStyle = '#d6ffc4'; ctx.fillRect(ox + 8 + Math.round(4 * Math.sin(t * 6 + o.ph)), oy - 3 - ((t * 20 + o.ph * 9) % 9), 2, 2);
        } else if (o.kind === 'drone' || o.kind === 'high') {
          const bob = Math.round(2 * Math.sin(t * 7 + o.ph));
          ctx.fillStyle = '#20222c'; ctx.fillRect(ox + 4, oy + 4 + bob, 26, 9);
          ctx.fillStyle = '#ff4a3c'; ctx.fillRect(ox + 8, oy + 7 + bob, 5, 3);
          ctx.fillStyle = '#8a90a0'; ctx.fillRect(ox + (Math.floor(t * 30) % 2 ? 0 : 6), oy + bob, 22 + (Math.floor(t * 30) % 2 ? 12 : 0), 2);
        } else if (!o.gone) {
          ctx.fillStyle = '#7dff5a'; ctx.beginPath(); ctx.arc(ox + 5, oy + 5 + Math.round(2 * Math.sin(t * 5 + o.x)), 5, 0, 7); ctx.fill();
          ctx.fillStyle = '#eaffdf'; ctx.fillRect(ox + 3, oy + 2 + Math.round(2 * Math.sin(t * 5 + o.x)), 2, 2);
        }
      }
      // the robot: a round head with a visor and an antenna, a body the colour of its owner, legs that run
      const rx = 64, low = duck && !air, ry = GROUND - y - (low ? 20 : 34), run = Math.floor(step) % 2;
      for (const d of dust) { ctx.fillStyle = `rgba(240, 200, 150, ${Math.max(0, d.l) * 0.7})`; ctx.fillRect(Math.round(d.x - x), Math.round(GROUND - d.y), 3, 3); }
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
        if (air) { ctx.fillRect(rx + 5, ry + 26, 4, 5); ctx.fillRect(rx + 15, ry + 25, 4, 5); ctx.fillRect(rx + 1, ry + 16, 4, 3); ctx.fillRect(rx + 19, ry + 14, 4, 3); }
        else { ctx.fillRect(rx + (run ? 4 : 8), ry + 26, 4, 8); ctx.fillRect(rx + (run ? 15 : 11), ry + 26, 4, run ? 6 : 8); ctx.fillRect(rx + (run ? 1 : 3), ry + 17, 4, 3); ctx.fillRect(rx + (run ? 19 : 17), ry + 18, 4, 3); }
      }
      // the counter, and what the screen says
      ctx.textBaseline = 'top'; ctx.font = "bold 14px 'Courier New', monospace";
      ctx.fillStyle = '#1a1020'; ctx.textAlign = 'right'; ctx.fillText(`${String(score).padStart(5, '0')} m`, W - 9, 11);
      ctx.fillStyle = '#ffe9a6'; ctx.fillText(`${String(score).padStart(5, '0')} m`, W - 10, 10);
      if (best) { ctx.fillStyle = '#f0b98a'; ctx.font = "bold 10px 'Courier New', monospace"; ctx.fillText(`BEST ${best} m`, W - 10, 28); }
      if (crash) {
        ctx.fillStyle = 'rgba(20, 8, 24, 0.55)'; ctx.fillRect(-4, 78, W + 8, 84);
        ctx.textAlign = 'center'; ctx.fillStyle = '#ff5a48'; ctx.font = "bold 30px 'Courier New', monospace"; ctx.fillText('MELTDOWN!', W / 2, 88);
        ctx.fillStyle = '#ffe9a6'; ctx.font = "bold 13px 'Courier New', monospace"; ctx.fillText(`${score} m — jump to run again`, W / 2, 128);
        ctx.fillStyle = '#c9b6d6'; ctx.font = "bold 10px 'Courier New', monospace"; ctx.fillText('E or Esc: walk away', W / 2, 146);
      } else if (t < 2.4) {
        ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9a6'; ctx.font = "bold 15px 'Courier New', monospace"; ctx.fillText('RUN!', W / 2, 60);
        ctx.fillStyle = '#f7e2c0'; ctx.font = "bold 10px 'Courier New', monospace"; ctx.fillText('jump the drums and the pools · duck the drones', W / 2, 80);
      }
    };
    const session = {
      over: false, score: 0, line: 'Meltdown Run',
      step: (dt, keys) => {
        dt = Math.min(dt, 0.05);
        if (crash) { crash += dt; if (shake > 0) shake -= dt; draw(); return; }
        t += dt;
        speed = Math.min(520, 190 + t * 5.5);
        x += speed * dt;
        step += dt * (speed / 22);
        // jumping (held: higher; asked for a moment before landing: given on landing), ducking (in the air: down faster)
        if (keys.jump && !held) want = 0.13;
        if (want > 0) { if (air) want -= dt; else { want = 0; air = true; vy = 400; io.play('jump', { volume: 0.4, rate: 1.4 }); } }
        held = keys.jump;
        duck = keys.duck;
        if (air) {
          vy -= (vy > 0 && keys.jump ? 880 : 1500) * dt + (duck ? 1400 * dt : 0);
          y += vy * dt;
          if (y <= 0) { y = 0; air = false; for (let k = 0; k < 3; k++) dust.push({ x: x + 64 + rnd(0, 16), y: rnd(0, 3), l: 0.35 }); }
        }
        for (const d of dust) { d.l -= dt; d.y += 14 * dt; }
        dust = dust.filter((d) => d.l > 0);
        if (x + W + 20 >= next) spawn();
        things = things.filter((o) => o.x - x > -80);
        // what the robot runs into, what it picks up
        const low = duck && !air, bx0 = x + 66, bx1 = x + 84, by0 = y + 2, by1 = y + (low ? 18 : 32);
        for (const o of things) {
          if (o.gone) continue;
          const ox0 = o.x + 2, ox1 = o.x + o.w - 2, oy0 = o.up + 1, oy1 = o.up + o.h - 1;
          if (bx1 < ox0 || bx0 > ox1 || by1 < oy0 || by0 > oy1) continue;
          if (o.kind === 'iso') { o.gone = true; bonus += 25; io.play('coin', { volume: 0.5 }); continue; }
          crash = 0.001; shake = 0.35;
          session.over = true;
          best = Math.max(best, score);
          io.play('fail', { volume: 0.8 });
          break;
        }
        const was = score;
        score = Math.floor(x / 10) + bonus;
        if (Math.floor(score / 500) > Math.floor(was / 500)) io.play('checkpoint', { volume: 0.5 });
        session.score = score;
        session.line = `Meltdown Run · ${score} m`;
        draw();
      },
      /** What is on the road ahead, and how fast it comes: { speed, things: [{ kind, gap (pixels to the robot), wide, up }] }. */
      peek: () => ({ speed, things: things.filter((o) => !o.gone && o.kind !== 'iso').map((o) => ({ kind: o.kind, gap: o.x + 2 - (x + 84), wide: o.w - 4, up: o.up })) }),
      /** Another run, on the same screen. */
      restart: () => { reset(); session.over = false; session.score = 0; held = true; },
      close: () => { this.el.classList.remove('on'); this.session = null; },
    };
    reset();
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
