// The window of the Trading Post: every game of the fair on a card — a photograph of it as it stands right
// now (taken by the game itself, see Photographer below), who sponsors it if somebody does, what it takes to
// have its panel — and, underneath, the other things a sponsor can have.
//
//   view.open({ cards, wheel, beach, extras, note })
//     cards:  [{ id, name, state: 'free' | 'live' | 'mine' | 'pending' | 'taken', sponsor: { title, subtitle, logo, url, site, clicks } | null,
//                price (words), acts: [{ label, run }], photo: () → canvas | null, stamp (when it changes, the photograph is retaken) }]
//     wheel:  the gondolas of the big wheel that somebody holds, as cards of the same kind ("Gondola 7": which
//             one it is, a photograph of it as it goes round, whose it is) — { cards, of (how many gondolas there are) }
//     beach:  the beach huts that somebody holds, the same way ("Beach hut 5") — { cards, of (how many huts there are) }
//     extras: [{ title, text, act: { label, run } | null }]
//     note:   a line under the title (the shop is closed, test mode…)
//
// Nothing a sponsor wrote is ever read as HTML: it is set as text; a logo is a picture served by the game.
import * as THREE from 'three';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const TAGS = { free: 'Free', live: 'Sponsored', mine: 'Yours', pending: 'To approve', taken: 'Taken' };

/**
 * Photographs of the world taken by the game's own renderer, from anywhere (`prepare(camera)`, when set, is
 * called before each: what is drawn for one eye only is made ready for this one): shoot(from, at, w, h, fov) → a
 * canvas. The scene is drawn once more, small, from another eye — what is in the picture is what is there
 * (a sponsor's panel included).
 */
export class Photographer {
  constructor(engine) {
    this.engine = engine;
    this.camera = new THREE.PerspectiveCamera(50, 1.6, 0.3, 3000);
    this.targets = new Map();
  }

  shoot(from, at, w = 480, h = 300, fov = 50) {
    const { renderer, scene } = this.engine, key = `${w}x${h}`, cam = this.camera;
    if (!this.targets.has(key)) this.targets.set(key, new THREE.WebGLRenderTarget(w, h, { samples: 4, depthBuffer: true }));
    const rt = this.targets.get(key);
    cam.fov = fov; cam.aspect = w / h;
    cam.position.set(from[0], from[1], from[2]);
    cam.lookAt(at[0], at[1], at[2]);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    // (the ground and the trees are drawn for the eye that looks: they are told whose eye this is — the game
    // tells them again, for the player's, with its next frame)
    this.prepare?.(cam);
    const was = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    const px = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
    renderer.setRenderTarget(was);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'), img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // (rows come bottom first)
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  dispose() { for (const t of this.targets.values()) t.dispose(); this.targets.clear(); }
}

export class SponsorsView {
  /** @param root where the window is laid (the interface of the game) */
  constructor(root) {
    this.handlers = {};
    this.photos = new Map(); // id → { stamp, canvas }
    this.el = el('div', 'trading');
    this.el.innerHTML = `
      <div class="tp-rays" aria-hidden="true"></div>
      <div class="tp-sheet" role="dialog" aria-modal="true" aria-label="The Trading Post: the games and their sponsors" tabindex="-1">
        <header class="tp-head">
          <div class="tp-title"><h2>The Trading <em>Post</em></h2><p class="tp-lead"></p></div>
          <div class="tp-count" aria-live="polite"></div>
          <button type="button" class="tp-x">Close <kbd>Esc</kbd></button>
        </header>
        <div class="tp-scroll">
          <div class="tp-grid"></div>
          <h3 class="tp-also tp-also-w">On the big wheel</h3>
          <div class="tp-grid tp-wheel"></div>
          <h3 class="tp-also tp-also-b">On the beach</h3>
          <div class="tp-grid tp-beach"></div>
          <h3 class="tp-also tp-also-x">Also for sponsors</h3>
          <div class="tp-extras"></div>
        </div>
      </div>`;
    root.append(this.el);
    this.sheet = this.el.querySelector('.tp-sheet');
    this.grid = this.el.querySelector('.tp-grid');
    this.wheel = this.el.querySelector('.tp-wheel');
    this.beach = this.el.querySelector('.tp-beach');
    this.extras = this.el.querySelector('.tp-extras');
    this.el.querySelector('.tp-x').onclick = () => this.close();
    this.el.addEventListener('pointerdown', (e) => { if (e.target === this.el) this.close(); });
    this.el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.close(); });
    this.el.addEventListener('keyup', (e) => e.stopPropagation());
    for (const ev of ['mousedown', 'touchstart', 'wheel']) this.el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
  }

  on(name, fn) { this.handlers[name] = fn; return this; }
  get isOpen() { return this.el.classList.contains('on'); }

  open({ cards = [], wheel = null, beach = null, extras = [], note = '' } = {}) {
    this.el.classList.add('on');
    this.run = (this.run || 0) + 1;
    const held = cards.filter((c) => c.state === 'live' || c.state === 'mine' || c.state === 'taken').length;
    this.el.querySelector('.tp-lead').textContent = note || 'Every game has a panel over its board of scores: your name, a line, your logo and a link, in sight of everybody who plays. The highest bid holds it; whoever is outbid is refunded in full.';
    const count = this.el.querySelector('.tp-count');
    count.textContent = '';
    count.append(el('b', '', `${held}`), el('span', '', ` of ${cards.length} games sponsored`));
    this.grid.textContent = '';
    this.wheel.textContent = '';
    this.beach.textContent = '';
    const frames = [], cars = wheel?.cards || [], huts = beach?.cards || [];
    // (the gondolas somebody holds, each by its number: a sponsor finds theirs here)
    const title = this.el.querySelector('.tp-also-w');
    title.hidden = this.wheel.hidden = !cars.length;
    title.textContent = `On the big wheel · ${cars.length} of ${wheel?.of || cars.length} gondolas sponsored`;
    // (the beach huts somebody holds, the same way)
    const sand = this.el.querySelector('.tp-also-b');
    sand.hidden = this.beach.hidden = !huts.length;
    sand.textContent = `On the beach · ${huts.length} of ${beach?.of || huts.length} beach huts sponsored`;
    for (const c of [...cards, ...cars, ...huts]) {
      const car = cars.includes(c), hut = huts.includes(c);
      const card = el('article', `tp-card${car ? ' tp-car' : ''}${hut ? ' tp-hut' : ''} is-${c.state}`);
      card.dataset.id = c.id;
      const pic = el('div', 'tp-pic');
      pic.append(el('span', 'tp-tag', TAGS[c.state] || ''));
      const kept = this.photos.get(c.id);
      if (kept && kept.stamp === c.stamp) pic.prepend(kept.canvas); else frames.push({ c, pic });
      const body = el('div', 'tp-body');
      body.append(el('h3', '', c.name));
      const who = el('div', 'tp-who');
      if (c.sponsor && c.sponsor.title) {
        if (c.sponsor.logo) { const img = el('img', 'tp-logo'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer'; img.src = c.sponsor.logo; img.onerror = () => img.remove(); who.append(img); }
        const words = el('div', 'tp-words');
        words.append(el('small', '', c.state === 'pending' ? 'Awaiting your approval' : c.state === 'mine' ? (car ? 'Your gondola' : hut ? 'Your beach hut' : 'Your panel') : 'Sponsored by'), el('b', '', c.sponsor.title));
        if (c.sponsor.subtitle) words.append(el('i', '', c.sponsor.subtitle));
        // (its site, and how many times it was opened from the game)
        if (c.sponsor.site) words.append(el('span', 'tp-site', `${c.sponsor.site} · ${c.sponsor.clicks || 0} click${c.sponsor.clicks === 1 ? '' : 's'}`));
        who.append(words);
      } else {
        who.classList.add('none');
        who.append(el('b', '', c.state === 'mine' ? 'Yours — nothing on it yet' : c.state === 'taken' ? `Taken — its ${car ? 'banner' : 'panel'} is on its way` : 'No sponsor yet'), el('i', '', c.state === 'free' ? 'Its panel says "Your brand here".' : ''));
      }
      body.append(who);
      const acts = el('div', 'tp-acts');
      if (c.price) acts.append(el('span', 'tp-price', c.price));
      (c.acts || []).slice(0, 2).forEach((a, i) => {
        const b = el('button', i ? 'tp-more' : 'tp-go', a.label);
        b.type = 'button';
        b.onclick = () => { this.close(); a.run(); };
        acts.append(b);
      });
      body.append(acts);
      card.append(pic, body);
      (car ? this.wheel : hut ? this.beach : this.grid).append(card);
    }
    this.extras.textContent = '';
    this.el.querySelector('.tp-also-x').hidden = !extras.length;
    for (const x of extras) {
      const box = el('div', 'tp-extra');
      const text = el('div');
      text.append(el('b', '', x.title), el('span', '', x.text));
      box.append(text);
      if (x.act) { const b = el('button', 'tp-more', x.act.label); b.type = 'button'; b.onclick = () => { this.close(); x.act.run(); }; box.append(b); }
      this.extras.append(box);
    }
    this.el.querySelector('.tp-scroll').scrollTop = 0;
    this.sheet.focus({ preventScroll: true });
    // the photographs: one a frame, so that the window opens at once and nothing stutters
    const run = this.run;
    const next = () => {
      if (run !== this.run || !this.isOpen) return;
      const job = frames.shift();
      if (!job) return;
      let canvas = null;
      try { canvas = job.c.photo ? job.c.photo() : null; } catch { canvas = null; }
      if (canvas) { canvas.className = 'tp-photo'; job.pic.prepend(canvas); this.photos.set(job.c.id, { stamp: job.c.stamp, canvas }); }
      requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }

  close() {
    if (!this.isOpen) return;
    this.el.classList.remove('on');
    this.run = (this.run || 0) + 1;
    this.handlers.close?.();
  }
}
