// DOM interface: welcome screen, heads-up display, settings, touch controls, name tags.
import { AVATAR_COLORS, EMOTES } from '../player/Character.js';
import { TIERS, TIER_ORDER } from '../core/Quality.js';
import { assetUrl } from '../core/Assets.js';

const ICON = {
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M3 8h3l2-3h8l2 3h3v11H3z"/><circle cx="12" cy="13" r="3.6"/></svg>',
  smile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 14.5s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M12 19V6M6 11l6-6 6 6"/></svg>',
  run: '<svg viewBox="0 0 24 24"><path d="M13 5.5a1.6 1.6 0 1 0 0-.01M6 21l3.5-6 3 2 1.5 4M9.5 15l1.5-6 4 2 3 0M11 9l-4 1-1 3"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M6 14l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 10l6 6 6-6"/></svg>',
};
const EMOTE_LABEL = ['Saluer', 'Danser', 'Bravo', 'Oui', 'Non', 'Hop !'];

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export class Hud {
  constructor(root, { input, isTouch }) {
    this.root = root;
    this.input = input;
    this.handlers = {};
    if (isTouch) root.classList.add('touch');
    root.append(el('div', 'vignette'));
    this._splash();
    this._hud();
    this._touch();
  }

  on(name, fn) { this.handlers[name] = fn; return this; }
  emit(name, ...a) { this.handlers[name]?.(...a); }

  // ---------- welcome
  _splash() {
    const s = (this.splash = el('div', 'splash'));
    s.innerHTML = `
      <div class="card">
        <svg class="wheel" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="#f2c14e" stroke-width="2.4"><circle cx="32" cy="32" r="26"/><circle cx="32" cy="32" r="5" fill="#f2c14e"/>
          ${Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return `<path d="M32 32L${(32 + Math.cos(a) * 26).toFixed(1)} ${(32 + Math.sin(a) * 26).toFixed(1)}"/><circle cx="${(32 + Math.cos(a) * 26).toFixed(1)}" cy="${(32 + Math.sin(a) * 26).toFixed(1)}" r="3.4" fill="#e8795a" stroke="none"/>`; }).join('')}</g></svg>
        <h1 class="title">Magic <em>Mill</em> Fair</h1>
        <p class="subtitle">Un moulin, sa vallée, ses étangs… et au bout du ruisseau, une grande jetée de fête foraine.</p>
        <div class="bar"><i></i></div>
        <div class="hint load">Préparation du monde…</div>
        <div class="form">
          <label for="mmf-name">Votre nom</label>
          <input id="mmf-name" type="text" maxlength="16" autocomplete="off" spellcheck="false" />
          <label>Couleur</label>
          <div class="swatches"></div>
          <button class="go" type="button">Explorer</button>
          <div class="keys"></div>
        </div>
      </div>`;
    this.root.append(s);
    this.bar = s.querySelector('.bar i');
    this.loadHint = s.querySelector('.hint.load');
  }

  setProgress(p, label) {
    this.bar.style.width = `${Math.round(Math.min(1, p) * 100)}%`;
    if (label) this.loadHint.textContent = label;
  }

  fail(message) {
    this.loadHint.textContent = message;
    this.loadHint.style.color = '#ffb4a2';
  }

  /** Show name / colour form; resolves when the visitor presses "Explorer". */
  welcome({ name, color, touch }) {
    const s = this.splash;
    s.classList.add('glass');
    s.querySelector('.card').classList.add('ready');
    const input = s.querySelector('#mmf-name');
    input.value = name;
    const sw = s.querySelector('.swatches');
    let chosen = color;
    AVATAR_COLORS.forEach((c, i) => {
      const b = el('button');
      b.type = 'button';
      b.style.background = `#${c.toString(16).padStart(6, '0')}`;
      b.setAttribute('aria-label', `Couleur ${i + 1}`);
      b.setAttribute('aria-pressed', String(i === chosen));
      b.onclick = () => { chosen = i; sw.querySelectorAll('button').forEach((x, k) => x.setAttribute('aria-pressed', String(k === i))); this.emit('color', i); };
      sw.append(b);
    });
    s.querySelector('.keys').innerHTML = touch
      ? 'Glissez à gauche pour marcher, à droite pour regarder.'
      : '<kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> ou flèches · <kbd>Maj</kbd> courir · <kbd>Espace</kbd> sauter · <kbd>F</kbd> caméra libre';
    return new Promise((resolve) => {
      const go = () => {
        const n = input.value.trim().slice(0, 16) || name;
        s.classList.add('done');
        this.hud.classList.add('on');
        resolve({ name: n, color: chosen });
      };
      s.querySelector('.go').onclick = go;
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); e.stopPropagation(); });
    });
  }

  // ---------- heads-up display
  _hud() {
    const h = (this.hud = el('div', 'hud'));
    h.innerHTML = `
      <div class="top-left">
        <div class="pill zone">Le Moulin</div>
        <div class="pill players"><span class="dot"></span><span class="count">Seul</span></div>
      </div>
      <div class="top-right">
        <button class="icon" data-act="emote" title="Émotes (T)" aria-label="Émotes">${ICON.smile}</button>
        <button class="icon" data-act="camera" title="Caméra libre (F)" aria-label="Caméra libre" aria-pressed="false">${ICON.cam}</button>
        <button class="icon" data-act="settings" title="Réglages" aria-label="Réglages">${ICON.gear}</button>
      </div>
      <div class="toast"><small>Vous entrez dans</small><span></span></div>
      <div class="pill note"></div>
      <div class="tags"></div>
      <div class="minimap"><canvas width="192" height="192"></canvas></div>
      <div class="stats"></div>
      <div class="emotes">${EMOTES.map((e, i) => `<button data-emote="${i}">${EMOTE_LABEL[i]}</button>`).join('')}</div>
      <div class="panel" role="dialog" aria-label="Réglages">
        <h2>Réglages</h2>
        <h3>Qualité graphique</h3>
        <div class="seg quality"><button data-q="auto">Auto</button>${TIER_ORDER.map((q) => `<button data-q="${q}">${TIERS[q].label}</button>`).join('')}</div>
        <p class="q-info"></p>
        <h3>Affichage</h3>
        <div class="row"><span>Mini-carte</span><button class="switch" data-sw="map" aria-pressed="true" aria-label="Mini-carte"></button></div>
        <div class="row"><span>Mesures de performance</span><button class="switch" data-sw="stats" aria-pressed="false" aria-label="Mesures"></button></div>
        <h3>Votre nom</h3>
        <input type="text" maxlength="16" class="name" autocomplete="off" spellcheck="false" />
        <p class="net-info"></p>
      </div>`;
    this.root.append(h);
    this.zoneEl = h.querySelector('.zone');
    this.toastEl = h.querySelector('.toast');
    this.noteEl = h.querySelector('.note');
    this.tagsEl = h.querySelector('.tags');
    this.statsEl = h.querySelector('.stats');
    this.panel = h.querySelector('.panel');
    this.emotes = h.querySelector('.emotes');
    this.mapEl = h.querySelector('.minimap');
    this.mapCtx = this.mapEl.querySelector('canvas').getContext('2d');
    this.mapImg = new Image();
    this.mapImg.src = assetUrl('world/map.jpg');
    h.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
      const act = b.dataset.act;
      if (act === 'settings') this.panel.classList.toggle('on');
      else if (act === 'emote') this.emotes.classList.toggle('on');
      else this.emit(act);
      b.blur();
    }));
    this.cameraBtn = h.querySelector('[data-act="camera"]');
    this.emotes.querySelectorAll('button').forEach((b) => (b.onclick = () => { this.emit('emote', +b.dataset.emote); this.emotes.classList.remove('on'); }));
    h.querySelectorAll('.quality button').forEach((b) => (b.onclick = () => this.emit('quality', b.dataset.q)));
    h.querySelectorAll('[data-sw]').forEach((b) => (b.onclick = () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      if (b.dataset.sw === 'map') this.mapEl.style.display = on ? '' : 'none';
      else this.setStatsVisible(on);
    }));
    const name = h.querySelector('.name');
    name.addEventListener('keydown', (e) => e.stopPropagation());
    name.addEventListener('change', () => this.emit('name', name.value.trim().slice(0, 16)));
    this.nameInput = name;
    // prevent clicks on the interface from reaching the 3D view
    for (const n of [this.panel, this.emotes]) for (const ev of ['mousedown', 'touchstart', 'wheel']) n.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
  }

  setQuality(choice, tier, scale) {
    this.hud.querySelectorAll('.quality button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === choice)));
    this.hud.querySelector('.q-info').textContent = `Palier actif : ${TIERS[tier].label} · résolution ${Math.round(scale * 100)} %. Le mode Auto ajuste la résolution pour rester fluide.`;
  }
  setName(n) { this.nameInput.value = n; }
  setCameraMode(free) { this.cameraBtn.setAttribute('aria-pressed', String(free)); this.root.classList.toggle('free', free); }
  toggleEmotes() { this.emotes.classList.toggle('on'); }
  toggleStats() { const b = this.hud.querySelector('[data-sw="stats"]'); b.click(); }
  setStatsVisible(on) { this.statsOn = on; this.statsEl.classList.toggle('on', on); this.hud.querySelector('[data-sw="stats"]').setAttribute('aria-pressed', String(on)); }
  setStats(text) { if (this.statsOn) this.statsEl.textContent = text; }

  setZone(name) {
    if (name === this._zone) return;
    this._zone = name;
    this.zoneEl.textContent = name;
    this.toastEl.querySelector('span').textContent = name;
    this.toastEl.classList.add('show');
    clearTimeout(this._tz);
    this._tz = setTimeout(() => this.toastEl.classList.remove('show'), 3200);
  }

  note(text, ms = 2600) {
    this.noteEl.textContent = text;
    this.noteEl.classList.add('show');
    clearTimeout(this._tn);
    this._tn = setTimeout(() => this.noteEl.classList.remove('show'), ms);
  }

  setPresence(mode, count) {
    const dot = this.hud.querySelector('.players .dot');
    dot.className = `dot ${mode === 'online' ? 'online' : mode === 'local' ? 'local' : ''}`;
    this.hud.querySelector('.players .count').textContent = count <= 1 ? (mode === 'online' ? 'En ligne · seul' : 'Seul') : `${count} visiteurs`;
    this.hud.querySelector('.net-info').textContent = mode === 'online'
      ? 'Connecté : les visiteurs de cette adresse se voient.'
      : mode === 'local'
        ? 'Mode local : seuls les onglets de ce navigateur se voient (aucun serveur de présence détecté).'
        : 'Hors ligne.';
  }

  // ---------- name tags
  tag(id, name, color) {
    const t = el('div', 'tag');
    t.innerHTML = `<i style="background:#${AVATAR_COLORS[color % 16].toString(16).padStart(6, '0')}"></i>`;
    t.append(document.createTextNode(name));
    this.tagsEl.append(t);
    return t;
  }

  // ---------- minimap (north up, centred on the viewer)
  drawMap(x, z, heading, others, half = 512) {
    if (this.mapEl.style.display === 'none' || !this.mapImg.complete) return;
    const ctx = this.mapCtx, S = 192, view = 150; // metres across
    const k = S / view;
    ctx.clearRect(0, 0, S, S);
    const img = this.mapImg, ppm = img.width / (half * 2);
    ctx.drawImage(img, (x + half - view / 2) * ppm, (z + half - view / 2) * ppm, view * ppm, view * ppm, 0, 0, S, S);
    ctx.fillStyle = '#fff';
    for (const o of others) {
      const px = S / 2 + (o.x - x) * k, pz = S / 2 + (o.z - z) * k;
      if (px < 0 || pz < 0 || px > S || pz > S) continue;
      ctx.beginPath(); ctx.arc(px, pz, 4, 0, 7); ctx.fillStyle = `#${AVATAR_COLORS[o.color % 16].toString(16).padStart(6, '0')}`; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(-heading);
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6.5, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6.5, 7); ctx.closePath();
    ctx.fillStyle = '#f2c14e'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#1b2a22'; ctx.stroke();
    ctx.restore();
  }

  // ---------- touch controls
  _touch() {
    const zone = el('div', 'stick-zone');
    const stick = el('div', 'stick', '<b></b>');
    zone.append(stick);
    const knob = stick.firstChild;
    const pads = el('div', 'pads');
    pads.innerHTML = `
      <button class="pad walk-only" data-pad="run" aria-label="Courir" aria-pressed="false">${ICON.run}</button>
      <button class="pad big walk-only" data-pad="jump" aria-label="Sauter">${ICON.jump}</button>
      <button class="pad free-only" data-pad="down" aria-label="Descendre">${ICON.down}</button>
      <button class="pad big free-only" data-pad="up" aria-label="Monter">${ICON.up}</button>`;
    this.hud.append(zone, pads);
    const inp = this.input;
    let id = null, ox = 0, oy = 0;
    const R = 52;
    const place = (x, y) => { stick.style.left = `${x}px`; stick.style.top = `${y}px`; };
    const reset = () => { id = null; inp.touch.active = false; inp.touch.x = 0; inp.touch.y = 0; knob.style.transform = ''; stick.style.left = ''; stick.style.top = ''; };
    zone.addEventListener('touchstart', (e) => {
      if (id !== null) return;
      const t = e.changedTouches[0];
      id = t.identifier;
      const r = zone.getBoundingClientRect();
      ox = t.clientX; oy = t.clientY;
      place(ox - r.left, oy - r.top);
      inp.touch.active = true;
      inp.isTouch = true;
      e.preventDefault(); e.stopPropagation();
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        let dx = t.clientX - ox, dy = t.clientY - oy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        // small dead zone, full tilt = run
        const m = Math.min(1, d / R);
        inp.touch.x = m < 0.12 ? 0 : dx / R; inp.touch.y = m < 0.12 ? 0 : -dy / R;
      }
      e.preventDefault(); e.stopPropagation();
    }, { passive: false });
    const end = (e) => { for (const t of e.changedTouches) if (t.identifier === id) reset(); e.stopPropagation(); };
    zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
    pads.querySelectorAll('[data-pad]').forEach((b) => {
      const k = b.dataset.pad;
      const down = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (k === 'jump') inp.touchJump();
        else if (k === 'run') { inp.touch.run = !inp.touch.run; b.setAttribute('aria-pressed', String(inp.touch.run)); }
        else inp.touchRise = k === 'up' ? 1 : -1;
      };
      const up = (e) => { e.preventDefault(); e.stopPropagation(); if (k === 'up' || k === 'down') inp.touchRise = 0; };
      b.addEventListener('touchstart', down, { passive: false });
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
      b.addEventListener('mousedown', down); b.addEventListener('mouseup', up); b.addEventListener('mouseleave', up);
    });
  }
}
