// DOM interface: welcome screen, heads-up display, settings, touch controls, name tags.
import { AVATAR_COLORS, EMOTES, RANK_EMOTES } from '../player/Character.js';
import { HATS } from '../player/Cosmetics.js';
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
  chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  hand: '<svg viewBox="0 0 24 24"><path d="M8 12V6a1.5 1.5 0 0 1 3 0v5V4.5a1.5 1.5 0 0 1 3 0V11V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 6.5-6 6.5S5.5 18 4 14l-1-2.6a1.4 1.4 0 0 1 2.5-1.2z"/></svg>',
};
const EMOTE_LABEL = ['Wave', 'Dance', 'Thumbs up', 'Yes', 'No', 'Punch'];
const RANK_LABEL = { deer: 'Deer', wolf: 'Wolf', tiger: 'Tiger', dragon: 'Dragon' };
const hex = (i) => `#${AVATAR_COLORS[((i % 16) + 16) % 16].toString(16).padStart(6, '0')}`;

// the version of this build (see vite.config.js)
const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : { commit: '', date: '' };
export const VERSION = `Version ${BUILD.commit || 'local'}${BUILD.date ? ` · built ${BUILD.date} UTC` : ''}`;

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
        <p class="subtitle">An old mill, its ponds and its valley between the mountains… and down by the sea, a grand pier with its big wheel.</p>
        <div class="bar"><i></i></div>
        <div class="hint load">Getting the world ready…</div>
        <div class="form">
          <label for="mmf-name">Your name</label>
          <input id="mmf-name" type="text" maxlength="16" autocomplete="off" spellcheck="false" />
          <label>Colour</label>
          <div class="swatches"></div>
          <button class="go" type="button">Explore</button>
          <div class="keys"></div>
        </div>
        <div class="version">${VERSION}</div>
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

  /** Show name / colour form; resolves when the visitor presses "Explore". */
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
      b.setAttribute('aria-label', `Colour ${i + 1}`);
      b.setAttribute('aria-pressed', String(i === chosen));
      b.onclick = () => { chosen = i; sw.querySelectorAll('button').forEach((x, k) => x.setAttribute('aria-pressed', String(k === i))); this.emit('color', i); };
      sw.append(b);
    });
    s.querySelector('.keys').innerHTML = touch
      ? 'Drag on the left to walk, on the right to look around.'
      : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> or arrows · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump · <kbd>E</kbd> sit, board · <kbd>Enter</kbd> chat · <kbd>T</kbd> emotes · <kbd>F</kbd> free camera · <kbd>M</kbd> map';
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
        <div class="pill zone">The Mill</div>
        <div class="pill players"><span class="dot"></span><span class="count">On your own</span></div>
      </div>
      <div class="top-right">
        <button class="icon" data-act="chat" title="Chat (Enter)" aria-label="Chat">${ICON.chat}</button>
        <button class="icon" data-act="emote" title="Emotes (T)" aria-label="Emotes">${ICON.smile}</button>
        <button class="icon" data-act="camera" title="Free camera (F)" aria-label="Free camera" aria-pressed="false">${ICON.cam}</button>
        <button class="icon" data-act="settings" title="Settings" aria-label="Settings">${ICON.gear}</button>
      </div>
      <div class="toast"><small>Now entering</small><span></span></div>
      <div class="pill note"></div>
      <div class="pill run" aria-live="off"></div>
      <div class="tags"></div>
      <button class="minimap" type="button" title="Open the map (M)" aria-label="Open the map"><canvas width="192" height="192"></canvas></button>
      <div class="bigmap" role="dialog" aria-label="Map">
        <div class="sheet"><canvas></canvas><div class="legend"><b>Map</b><span>Click anywhere to close</span></div></div>
      </div>
      <div class="stats"></div>
      <div class="emotes">
        <div>${EMOTES.map((e, i) => `<button data-emote="${i}">${EMOTE_LABEL[i]}</button>`).join('')}</div>
        <div class="rank">${RANK_EMOTES.map((e, i) => `<button data-emote="${EMOTES.length + i}">${RANK_LABEL[e]}</button>`).join('')}</div>
        <div class="held"><button data-drop>Put the bouquet down (B)</button></div>
      </div>
      <div class="wasted" aria-live="assertive"><div class="band"><b>WASTED</b><span></span></div></div>
      <div class="prompts">
        <button class="prompt" type="button" data-prompt="0"><kbd>E</kbd><span></span></button>
        <button class="prompt" type="button" data-prompt="1"><kbd>L</kbd><span></span></button>
      </div>
      <div class="chat">
        <div class="log" aria-live="polite"></div>
        <form class="say"><input type="text" maxlength="200" placeholder="Say something…" autocomplete="off" spellcheck="false" enterkeyhint="send" aria-label="Chat message" /></form>
      </div>
      <div class="panel" role="dialog" aria-label="Settings">
        <h2>Settings</h2>
        <h3>Graphics quality</h3>
        <div class="seg quality"><button data-q="auto">Auto</button>${TIER_ORDER.map((q) => `<button data-q="${q}">${TIERS[q].label}</button>`).join('')}</div>
        <p class="q-info"></p>
        <h3>Display</h3>
        <div class="row"><span>Minimap</span><button class="switch" data-sw="map" aria-pressed="true" aria-label="Minimap"></button></div>
        <div class="row"><span>Performance figures</span><button class="switch" data-sw="stats" aria-pressed="false" aria-label="Performance figures"></button></div>
        <h3>Hat</h3>
        <div class="hats">${HATS.map((h, i) => `<button data-hat="${i}">${h.name}</button>`).join('')}</div>
        <h3>Your name</h3>
        <input type="text" maxlength="16" class="name" autocomplete="off" spellcheck="false" />
        <p class="net-info"></p>
        <p class="version">${VERSION}</p>
      </div>`;
    this.root.append(h);
    this.zoneEl = h.querySelector('.zone');
    this.toastEl = h.querySelector('.toast');
    this.noteEl = h.querySelector('.note');
    this.runEl = h.querySelector('.run');
    this.tagsEl = h.querySelector('.tags');
    this.statsEl = h.querySelector('.stats');
    this.panel = h.querySelector('.panel');
    this.emotes = h.querySelector('.emotes');
    this.mapEl = h.querySelector('.minimap');
    this.mapCtx = this.mapEl.querySelector('canvas').getContext('2d');
    this.bigEl = h.querySelector('.bigmap');
    this.bigCanvas = this.bigEl.querySelector('canvas');
    this.mapEl.onclick = () => { this.toggleBigMap(true); this.mapEl.blur(); };
    this.bigEl.onclick = () => this.toggleBigMap(false);
    for (const ev of ['mousedown', 'touchstart', 'wheel']) this.bigEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    this.mapImg = new Image();
    this.mapImg.src = assetUrl('world/map.jpg');
    h.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
      const act = b.dataset.act;
      if (act === 'settings') this.panel.classList.toggle('on');
      else if (act === 'emote') this.emotes.classList.toggle('on');
      else if (act === 'chat') this.toggleChat();
      else this.emit(act);
      b.blur();
    }));
    // what can be done here (sit, board…): shown when there is something, pressed or tapped
    this.prompts = [...h.querySelectorAll('.prompt')];
    this.prompts.forEach((b, i) => {
      b.onclick = () => { this.emit(i ? 'interact2' : 'interact'); b.blur(); };
      for (const ev of ['mousedown', 'touchstart']) b.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    });
    // chat
    this.chatEl = h.querySelector('.chat');
    this.chatLog = this.chatEl.querySelector('.log');
    this.chatForm = this.chatEl.querySelector('.say');
    this.chatInput = this.chatForm.querySelector('input');
    this.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.chatInput.value;
      this.chatInput.value = '';
      this.toggleChat(false);
      if (text.trim()) this.emit('say', text);
    });
    this.chatInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { this.chatInput.value = ''; this.toggleChat(false); } e.stopPropagation(); });
    this.chatInput.addEventListener('blur', () => { if (!this.chatInput.value) this.toggleChat(false); });
    for (const ev of ['mousedown', 'touchstart', 'wheel']) this.chatEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    this.cameraBtn = h.querySelector('[data-act="camera"]');
    this.emotes.querySelectorAll('button[data-emote]').forEach((b) => (b.onclick = () => { this.emit('emote', +b.dataset.emote); this.emotes.classList.remove('on'); }));
    this.emotes.querySelector('[data-drop]').onclick = () => { this.emit('drop'); this.emotes.classList.remove('on'); };
    h.querySelectorAll('[data-hat]').forEach((b) => (b.onclick = () => { this.setHat(+b.dataset.hat); this.emit('hat', +b.dataset.hat); }));
    this.wastedEl = h.querySelector('.wasted');
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
    // the visitor's own speech bubble (the others have their name tag)
    this.selfTag = el('div', 'tag self');
    this.selfTag.style.display = 'none';
    this.tagsEl.append(this.selfTag);
  }

  // ---------- hats, the bouquet, dying
  setHat(i) { this.hud.querySelectorAll('[data-hat]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.hat === i))); }
  setHolding(on) { if (on !== this._holding) { this._holding = on; this.emotes.classList.toggle('holding', on); } }

  /** The end-of-the-road screen: `cause` is the line under the big word; null takes it away. */
  wasted(cause) {
    document.body.classList.toggle('dead', !!cause);
    if (cause) this.wastedEl.querySelector('span').textContent = cause;
  }

  // ---------- what can be done here
  /** Up to two actions: setPrompt(0, 'Sit') shows the first button, setPrompt(0, null) hides it. */
  setPrompt(i, text) {
    const b = this.prompts[i];
    if (b._text === text) return;
    b._text = text;
    if (text) b.lastElementChild.textContent = text;
    b.classList.toggle('on', !!text);
  }

  // ---------- chat
  get chatOpen() { return this.chatEl.classList.contains('typing'); }
  toggleChat(open = !this.chatOpen, placeholder = 'Say something…') {
    if (open) this.chatInput.placeholder = placeholder;
    this.chatEl.classList.toggle('typing', open);
    if (open) { this.panel.classList.remove('on'); this.emotes.classList.remove('on'); this.chatInput.focus({ preventScroll: true }); }
    else if (document.activeElement === this.chatInput) this.chatInput.blur();
  }

  /** A line in the chat log. Lines fade away after a while; the log shows again whenever one comes in. */
  addChat(name, color, text, self = false) {
    const line = el('p', self ? 'self' : '');
    const who = el('b');
    who.style.color = hex(color);
    who.textContent = name;
    line.append(who, document.createTextNode(` ${text}`));
    this.chatLog.append(line);
    while (this.chatLog.childElementCount > 40) this.chatLog.firstElementChild.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
    this.chatEl.classList.add('fresh');
    clearTimeout(this._tc);
    this._tc = setTimeout(() => this.chatEl.classList.remove('fresh'), 14000);
  }

  /** Speech bubble over a name tag (see tag()), for a few seconds. */
  say(tag, text) {
    let b = tag.querySelector('.bubble');
    if (!b) { b = el('div', 'bubble'); tag.append(b); }
    b.textContent = text;
    tag.classList.add('saying');
    clearTimeout(tag._ts);
    tag._ts = setTimeout(() => tag.classList.remove('saying'), Math.min(9000, 3200 + text.length * 60));
  }

  setQuality(choice, tier, scale, detail = 1, phone = false) {
    this.hud.querySelectorAll('.quality button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === choice)));
    this.hud.querySelector('.q-info').textContent = `Running: ${TIERS[tier].label}${phone ? ' (phone profile)' : ''} · resolution ${Math.round(scale * 100)} % · detail ${Math.round(detail * 100)} %. The game lowers resolution and detail by itself whenever needed to stay smooth.`;
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

  /** The line of a game in progress (a clock, a score), under the place name; null takes it away. */
  setRun(text) {
    if (text === this._run) return;
    this._run = text;
    if (text) this.runEl.textContent = text;
    this.runEl.classList.toggle('show', !!text);
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
    this.hud.querySelector('.players .count').textContent = count <= 1 ? (mode === 'online' ? 'Online · on your own' : 'On your own') : `${count} visitors`;
    this.hud.querySelector('.net-info').textContent = mode === 'online'
      ? 'Connected: everyone who opens this address sees each other.'
      : mode === 'local'
        ? 'Local mode: only the tabs of this browser see each other (no presence server found).'
        : 'Offline.';
  }

  // ---------- name tags
  tag(id, name, color) {
    const t = el('div', 'tag');
    t.innerHTML = `<i style="background:${hex(color)}"></i>`;
    t.append(document.createTextNode(name));
    this.tagsEl.append(t);
    return t;
  }

  // ---------- maps (north up). `view` is the window of the world drawn in map.jpg: { x0, z0, x1, z1 }.
  setMap(view, zones) { this.mapView = view; this.zones = zones; }

  _marker(ctx, px, pz, heading, size) {
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-heading);
    ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * 0.72, size * 0.78); ctx.lineTo(0, size * 0.4); ctx.lineTo(-size * 0.72, size * 0.78); ctx.closePath();
    ctx.fillStyle = '#f2c14e'; ctx.fill(); ctx.lineWidth = Math.max(1.5, size * 0.16); ctx.strokeStyle = '#1b2a22'; ctx.stroke();
    ctx.restore();
  }

  /** The round minimap, centred on the viewer. */
  drawMap(x, z, heading, others) {
    const v = this.mapView, img = this.mapImg;
    if (!v || this.mapEl.style.display === 'none' || !img.complete || !img.width) return;
    const ctx = this.mapCtx, S = 192, view = 130; // metres across
    const k = S / view, ppm = img.width / (v.x1 - v.x0);
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(img, (x - view / 2 - v.x0) * ppm, (z - view / 2 - v.z0) * ppm, view * ppm, view * ppm, 0, 0, S, S);
    for (const o of others) {
      const px = S / 2 + (o.x - x) * k, pz = S / 2 + (o.z - z) * k;
      if (px < 0 || pz < 0 || px > S || pz > S) continue;
      ctx.beginPath(); ctx.arc(px, pz, 4, 0, 7); ctx.fillStyle = `#${AVATAR_COLORS[o.color % 16].toString(16).padStart(6, '0')}`; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    this._marker(ctx, S / 2, S / 2, heading, 9);
  }

  get bigMapOpen() { return this.bigEl.classList.contains('on'); }
  toggleBigMap(open = !this.bigMapOpen) {
    this.bigEl.classList.toggle('on', open);
    if (open) { this.panel.classList.remove('on'); this.emotes.classList.remove('on'); this._bigSize = ''; }
  }

  /** The whole valley, with the places, the other visitors and oneself. */
  drawBigMap(x, z, heading, others) {
    const v = this.mapView, img = this.mapImg;
    if (!v || !this.bigMapOpen || !img.complete || !img.width) return;
    const cv = this.bigCanvas;
    // as large as the window allows, at the density of the screen
    const aspect = (v.x1 - v.x0) / (v.z1 - v.z0);
    const w = Math.round(Math.min(window.innerWidth * 0.94, (window.innerHeight * 0.84 - 34) * aspect, 1180)), h = Math.round(w / aspect);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this._bigSize !== `${w}x${h}`) { this._bigSize = `${w}x${h}`; cv.width = w * dpr; cv.height = h * dpr; cv.style.width = `${w}px`; cv.style.height = `${h}px`; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(img, 0, 0, w, h);
    const k = w / (v.x1 - v.x0), X = (wx) => (wx - v.x0) * k, Z = (wz) => (wz - v.z0) * k;
    // place names
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.max(11, Math.round(w / 62))}px Georgia, 'Times New Roman', serif`;
    ctx.lineJoin = 'round';
    for (const zone of this.zones || []) {
      const half = ctx.measureText(zone.name).width / 2 + 6;
      const tx = Math.min(w - half, Math.max(half, X(zone.x))), tz = Z(zone.z); // never cut by the edge
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(14, 22, 17, 0.8)'; ctx.strokeText(zone.name, tx, tz);
      ctx.fillStyle = '#f6f1e4'; ctx.fillText(zone.name, tx, tz);
    }
    // the others, with their names
    ctx.font = `600 ${Math.max(10, Math.round(w / 80))}px system-ui, sans-serif`;
    for (const o of others) {
      const px = X(o.x), pz = Z(o.z);
      ctx.beginPath(); ctx.arc(px, pz, 5.5, 0, 7); ctx.fillStyle = `#${AVATAR_COLORS[o.color % 16].toString(16).padStart(6, '0')}`; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(14, 22, 17, 0.8)'; ctx.strokeText(o.name, px, pz - 14);
      ctx.fillStyle = '#fff'; ctx.fillText(o.name, px, pz - 14);
    }
    // oneself: a pulsing ring so that the arrow is found at once
    const px = X(x), pz = Z(z), pulse = (performance.now() / 1400) % 1;
    ctx.beginPath(); ctx.arc(px, pz, 10 + pulse * 16, 0, 7); ctx.lineWidth = 2; ctx.strokeStyle = `rgba(242, 193, 78, ${(1 - pulse) * 0.9})`; ctx.stroke();
    this._marker(ctx, px, pz, heading, 12);
  }

  // ---------- touch controls
  _touch() {
    const zone = el('div', 'stick-zone');
    const stick = el('div', 'stick', '<b></b>');
    zone.append(stick);
    const knob = stick.firstChild;
    const pads = el('div', 'pads');
    pads.innerHTML = `
      <button class="pad walk-only" data-pad="run" aria-label="Run" aria-pressed="false">${ICON.run}</button>
      <button class="pad big walk-only" data-pad="jump" aria-label="Jump">${ICON.jump}</button>
      <button class="pad free-only" data-pad="down" aria-label="Down">${ICON.down}</button>
      <button class="pad big free-only" data-pad="up" aria-label="Up">${ICON.up}</button>`;
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
