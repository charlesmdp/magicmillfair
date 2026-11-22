// DOM interface: welcome screen, heads-up display, settings, touch controls, name tags.
import { AVATAR_COLORS } from '../player/Character.js';
import { HATS } from '../player/Cosmetics.js';
import { TIERS, TIER_ORDER } from '../core/Quality.js';
import { assetUrl } from '../core/Assets.js';

const ICON = {
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  // (a little drone: the camera that flies about)
  cam: '<svg viewBox="0 0 24 24"><path d="M2.5 6.5h6M15.5 6.5h6"/><path d="M5.5 6.5v2.3l3.5 1.9M18.5 6.5v2.3L15 10.7"/><rect x="9" y="9.6" width="6" height="4.6" rx="1.5"/><circle cx="12" cy="17.6" r="2.1"/><path d="M12 14.2v1.3"/></svg>',
  smile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 14.5s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M12 19V6M6 11l6-6 6 6"/></svg>',
  run: '<svg viewBox="0 0 24 24"><path d="M13 5.5a1.6 1.6 0 1 0 0-.01M6 21l3.5-6 3 2 1.5 4M9.5 15l1.5-6 4 2 3 0M11 9l-4 1-1 3"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M6 14l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M6 10l6 6 6-6"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  hand: '<svg viewBox="0 0 24 24"><path d="M8 12V6a1.5 1.5 0 0 1 3 0v5V4.5a1.5 1.5 0 0 1 3 0V11V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 6.5-6 6.5S5.5 18 4 14l-1-2.6a1.4 1.4 0 0 1 2.5-1.2z"/></svg>',
};
// the emotes on the keys 1 to 0: the six gestures of the model, then cheering on (see EMOTE_LIST)
const QUICK = ['wave', 'dance', 'thumbsup', 'yes', 'no', 'punch', 'cheer', 'clap', 'hype', 'rage'];
const hex = (i) => `#${AVATAR_COLORS[((i % 16) + 16) % 16].toString(16).padStart(6, '0')}`;

// A country, as its two letters say: its flag (an emoji made of the two letters — drawn as a flag wherever
// the system has them, as the letters themselves elsewhere) and its name in English.
const FLAGS = (() => {
  // (does this system draw flags? a flag has colours; two letters in a box have none)
  try {
    const c = document.createElement('canvas'); c.width = c.height = 24;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.font = '18px sans-serif'; g.textBaseline = 'top'; g.fillStyle = '#000'; g.fillText('\u{1F1EB}\u{1F1F7}', 0, 2);
    const d = g.getImageData(0, 0, 24, 24).data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 60 && (Math.abs(d[i] - d[i + 1]) > 40 || Math.abs(d[i + 1] - d[i + 2]) > 40)) return true;
  } catch { /* no canvas */ }
  return false;
})();
const REGIONS = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
export const countryName = (cc) => { if (!/^[A-Z]{2}$/.test(cc || '')) return 'Unknown'; try { return REGIONS?.of(cc) || cc; } catch { return cc; } };
/** A small element showing the flag of a country (or its two letters in a box). */
export function flagOf(cc) {
  const ok = /^[A-Z]{2}$/.test(cc || ''), f = el('span', `flag${ok && FLAGS ? '' : ' code'}`);
  f.textContent = !ok ? '?' : FLAGS ? String.fromCodePoint(...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : cc;
  f.title = countryName(cc);
  return f;
}

// the version of this build (see vite.config.js)
const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : { commit: '', date: '' };
export const VERSION = `Version ${BUILD.commit || 'local'}${BUILD.date ? ` · built ${BUILD.date} UTC` : ''}`;

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

/** "Chrome 141 · Windows · computer" out of what a browser says of itself. */
export function describeAgent(ua) {
  ua = String(ua || '');
  if (!ua) return 'unknown browser';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'unknown system';
  const hit = (re) => re.exec(ua)?.[1];
  const browser = hit(/Edg\w*\/(\d+)/) ? `Edge ${hit(/Edg\w*\/(\d+)/)}` : hit(/OPR\/(\d+)/) ? `Opera ${hit(/OPR\/(\d+)/)}` : hit(/Firefox\/(\d+)/) ? `Firefox ${hit(/Firefox\/(\d+)/)}`
    : hit(/(?:Chrome|CriOS)\/(\d+)/) ? `Chrome ${hit(/(?:Chrome|CriOS)\/(\d+)/)}` : hit(/Version\/(\d+)[\d.]* .*Safari/) ? `Safari ${hit(/Version\/(\d+)[\d.]* .*Safari/)}` : ua.split(/[ /]/)[0].slice(0, 24);
  const device = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'tablet' : /Mobi|iPhone|iPod|Android/.test(ua) ? 'phone' : 'computer';
  return `${browser} · ${os} · ${device}`;
}

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
    // the page carries its own loading screen (index.html), shown before any script: it is taken over here
    let s = this.root.querySelector('.splash');
    if (!s) {
      s = el('div', 'splash');
      s.innerHTML = '<div class="card"><h1 class="title">Atomic <em>Oasis</em></h1><div class="bar"><i></i></div><div class="hint load"></div><div class="form"><label for="mmf-name">Your name</label><input id="mmf-name" type="text" maxlength="16" autocomplete="off" spellcheck="false" /><label>Colour</label><div class="swatches"></div><button class="go" type="button">Step right up!</button><div class="keys"></div></div><div class="version"></div></div>';
      this.root.append(s);
    }
    this.splash = s;
    s.querySelector('.version').textContent = VERSION;
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
        <button class="pill players" type="button" title="Who is here"><span class="dot"></span><span class="count">On your own</span></button>
      </div>
      <div class="top-right">
        <button class="icon" data-act="chat" title="Chat (Enter)" aria-label="Chat">${ICON.chat}</button>
        <button class="icon" data-act="emote" title="Emotes (T)" aria-label="Emotes">${ICON.smile}</button>
        <button class="icon" data-act="camera" title="Flying camera (F)" aria-label="Flying camera" aria-pressed="false">${ICON.cam}</button>
        <button class="icon" data-act="settings" title="Settings" aria-label="Settings">${ICON.gear}</button>
      </div>
      <div class="toast"><small>Now entering</small><span></span></div>
      <div class="pill note"></div>
      <div class="pill run" aria-live="off"></div>
      <div class="tags"></div>
      <button class="minimap" type="button" title="Open the map (M)" aria-label="Open the map"><canvas width="192" height="192"></canvas></button>
      <div class="bigmap" role="dialog" aria-label="Map">
        <div class="sheet"><canvas></canvas><div class="legend"><b>Map</b><button class="mega" type="button" aria-pressed="false" title="The whole country, with the fifty sky villages">Mega map</button><span>Click anywhere to close</span></div></div>
      </div>
      <div class="stats"></div>
      <div class="emotes">
        <div class="held"><button data-drop>Put the bouquet down (B)</button></div>
      </div>
      <div class="wasted" aria-live="assertive"><div class="band"><b>WASTED</b><span></span></div></div>
      <div class="sight" aria-hidden="true"></div>
      <div class="gauge" aria-hidden="true"><i></i><b></b></div>
      <div class="prompts">
        <button class="prompt" type="button" data-prompt="0"><kbd>E</kbd><span></span></button>
        <button class="prompt" type="button" data-prompt="1"><kbd>L</kbd><span></span></button>
      </div>
      <div class="chat">
        <div class="log" aria-live="polite"></div>
        <form class="say"><div class="line"><button type="button" class="chan" title="Who hears you (Tab)">Everyone</button><input type="text" maxlength="200" placeholder="Say something…" autocomplete="off" spellcheck="false" enterkeyhint="send" aria-label="Chat message" /></div><small class="tip">Stuck somewhere? Type <b>/kill</b> · an emote by its name: <b>/wave</b>, <b>/cheer</b>…</small></form>
      </div>
      <div class="chooser" role="dialog" aria-label="Choose">
        <div class="sheet"><h2></h2><p class="lead"></p><div class="list"></div><button class="close" type="button">Stay here</button></div>
      </div>
      <div class="roster" role="dialog" aria-label="Visitors">
        <div class="sheet"><h2>Who is here</h2><p class="lead"></p><div class="body"><div class="list"></div><div class="admins"></div><div class="bans"></div><div class="visitors"></div></div><button class="close" type="button">Close</button></div>
      </div>
      <div class="flash" aria-hidden="true"></div>
      <div class="banner" role="alert"></div>
      <div class="panel" role="dialog" aria-label="Settings">
        <h2>Settings</h2>
        <h3>Graphics quality</h3>
        <div class="seg quality"><button data-q="auto">Auto</button>${TIER_ORDER.map((q) => `<button data-q="${q}">${TIERS[q].label}</button>`).join('')}</div>
        <p class="q-info"></p>
        <h3>Display</h3>
        <div class="row"><span>Minimap</span><button class="switch" data-sw="map" aria-pressed="true" aria-label="Minimap"></button></div>
        <div class="row"><span>Performance figures</span><button class="switch" data-sw="stats" aria-pressed="false" aria-label="Performance figures"></button></div>
        <h3>Sound</h3>
        <div class="row"><span>Sounds</span><input type="range" class="vol" data-vol="sound" min="0" max="100" step="5" aria-label="Volume of the sounds" /></div>
        <div class="row"><span>Music</span><input type="range" class="vol" data-vol="music" min="0" max="100" step="5" aria-label="Volume of the music" /></div>
        <h3>Controls</h3>
        <div class="row"><span>Run by default <small>(Shift walks)</small></span><button class="switch" data-set="run" aria-pressed="false" aria-label="Run by default"></button></div>
        <div class="row"><span>The camera turns with the character</span><button class="switch" data-set="follow" aria-pressed="false" aria-label="The camera turns with the character"></button></div>
        <h3>Hat</h3>
        <div class="hats">${HATS.map((h, i) => `<button data-hat="${i}">${h.name}</button>`).join('')}</div>
        <button class="buy-jet" type="button" hidden></button>
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
    // (a click closes it; an administrator's click on the map itself carries them to that spot first)
    this.bigEl.onclick = (e) => {
      const v = this._bigView;
      if (this._admin && v && e.target === this.bigCanvas) {
        const r = this.bigCanvas.getBoundingClientRect();
        this.emit('goto', { x: v.x0 + ((e.clientX - r.left) / r.width) * (v.x1 - v.x0), z: v.z0 + ((e.clientY - r.top) / r.height) * (v.z1 - v.z0) });
      }
      this.toggleBigMap(false);
    };
    // the mega map: the whole square kilometre, mountains included, with every sky village (loaded when asked for)
    this.megaBtn = this.bigEl.querySelector('.mega');
    this.megaBtn.onclick = (e) => { e.stopPropagation(); this.setMega(!this.mega); this.megaBtn.blur(); };
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
    // who hears a line: everyone in the room, or those within twenty metres (Tab, or the button, switches)
    this.chatChannel = 'all';
    this.chanBtn = this.chatForm.querySelector('.chan');
    const channel = (to) => {
      if (to === 'important' && !this._admin) to = 'all';
      this.chatChannel = to;
      this.chanBtn.textContent = to === 'near' ? 'Nearby' : to === 'important' ? 'Important' : 'Everyone';
      this.chanBtn.classList.toggle('near', to === 'near');
      this.chanBtn.classList.toggle('important', to === 'important');
      if (!this._chatTo) this.chatInput.placeholder = to === 'near' ? 'Say something to those within 20 m…' : to === 'important' ? 'An announcement to everyone, in red…' : 'Say something to everyone…';
    };
    // (an administrator has a third channel: "important", shown to all in another colour)
    const nextChannel = () => channel(this.chatChannel === 'all' ? 'near' : this.chatChannel === 'near' && this._admin ? 'important' : 'all');
    this.chanBtn.onclick = () => { nextChannel(); this.chatInput.focus({ preventScroll: true }); };
    this.chanBtn.addEventListener('mousedown', (e) => e.preventDefault()); // (the field keeps the focus)
    this._channel = channel;
    this.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.chatInput.value;
      this.chatInput.value = '';
      this.toggleChat(false);
      if (text.trim()) this.emit('say', text, this.chatChannel);
    });
    // what was said earlier: the wheel with the pointer over the log (it opens up for a while), or, while
    // typing, the wheel, the scroll bar, a finger, Page Up and Page Down
    window.addEventListener('wheel', (e) => {
      if (document.pointerLockElement || !this.chatLog.childElementCount || this.root.querySelector('.chooser.on, .roster.on, .bigmap.on')) return;
      const r = this.chatLog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY > r.bottom + 4 || e.clientY < r.bottom - Math.max(r.height, 150)) return;
      e.preventDefault(); e.stopPropagation();
      if (!this.chatEl.classList.contains('peek') && !this.chatOpen) { this.chatEl.classList.add('peek'); this.chatLog.scrollTop = this.chatLog.scrollHeight; }
      this.chatLog.scrollTop += e.deltaY;
      clearTimeout(this._tp);
      this._tp = setTimeout(() => { this.chatEl.classList.remove('peek'); this.chatLog.scrollTop = this.chatLog.scrollHeight; }, 7000);
    }, { capture: true, passive: false });
    this.chatLog.addEventListener('mousedown', (e) => e.preventDefault()); // (the scroll bar must not take the line being typed away)
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'PageUp' || e.key === 'PageDown') { this.chatLog.scrollTop += (e.key === 'PageUp' ? -1 : 1) * this.chatLog.clientHeight * 0.8; e.preventDefault(); }
      if (e.key === 'Escape') { this.chatInput.value = ''; this.toggleChat(false); }
      else if (e.key === 'Tab' && !this._chatTo) { e.preventDefault(); nextChannel(); }
      e.stopPropagation();
    });
    this.chatInput.addEventListener('blur', () => { if (!this.chatInput.value) this.toggleChat(false); });
    for (const ev of ['mousedown', 'touchstart', 'wheel']) this.chatEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    this.cameraBtn = h.querySelector('[data-act="camera"]');
    this.emotes.querySelector('[data-drop]').onclick = () => { this.emit('drop'); this.emotes.classList.remove('on'); };
    h.querySelectorAll('[data-hat]').forEach((b) => (b.onclick = () => this.emit('hat', +b.dataset.hat)));
    h.querySelector('.buy-jet').onclick = () => this.emit('buy', 'jetpack');
    this.wastedEl = h.querySelector('.wasted');
    h.querySelectorAll('.quality button').forEach((b) => (b.onclick = () => this.emit('quality', b.dataset.q)));
    h.querySelectorAll('[data-vol]').forEach((r) => {
      r.addEventListener('input', () => this.emit('volume', r.dataset.vol, +r.value / 100));
      r.addEventListener('keydown', (e) => e.stopPropagation());
    });
    h.querySelectorAll('[data-set]').forEach((b) => (b.onclick = () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      this.emit('setting', b.dataset.set, on);
    }));
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
    // who is here: opened from the head count
    this.rosterEl = h.querySelector('.roster');
    h.querySelector('.players').onclick = (e) => { e.currentTarget.blur(); this.emit('roster'); };
    this.rosterEl.querySelector('.close').onclick = () => this.closeRoster();
    this.rosterEl.onclick = (e) => { if (e.target === this.rosterEl) this.closeRoster(); };
    this.bannerEl = h.querySelector('.banner');
    this.sightEl = h.querySelector('.sight');
    this.gaugeEl = h.querySelector('.gauge');
    // prevent clicks on the interface from reaching the 3D view
    for (const n of [this.panel, this.emotes, h.querySelector('.chooser'), this.rosterEl, h.querySelector('.players')]) for (const ev of ['mousedown', 'touchstart', 'wheel']) n.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    // the visitor's own speech bubble (the others have their name tag)
    this.selfTag = el('div', 'tag self');
    this.selfTag.style.display = 'none';
    this.tagsEl.append(this.selfTag);
  }

  // ---------- the shop: what the hats and the jetpack cost, while they are sold
  /** `tag(id)`: what to write after the name of a hat ('' when it is theirs); `jet`: the line of the jetpack, or null. */
  setShop(tag, jet) {
    this.hud.querySelectorAll('[data-hat]').forEach((b) => { const h = HATS[+b.dataset.hat], t = tag(h.id); b.textContent = t ? `${h.name} · ${t}` : h.name; b.classList.toggle('locked', !!t); });
    const j = this.hud.querySelector('.buy-jet');
    j.hidden = !jet;
    if (jet) j.textContent = jet;
  }

  /**
   * A few things to fill in. `fields`: [{ key, label, value, max, hint, type: 'text' | 'file' }]. Resolves to
   * { key: text (a File, or null, for a file) }, or to null when the visitor gives up.
   */
  form(title, lead, fields, save = 'Save') {
    const box = this.hud.querySelector('.chooser'), list = box.querySelector('.list'), close = box.querySelector('.close');
    this._choice?.(null);
    box.querySelector('h2').textContent = title;
    box.querySelector('.lead').textContent = lead || '';
    list.textContent = '';
    list.classList.add('fields');
    close.textContent = 'Cancel';
    this.panel.classList.remove('on'); this.emotes.classList.remove('on'); this.toggleBigMap(false);
    this.input.exitLock();
    return new Promise((resolve) => {
      const inputs = {};
      const done = (v) => { this._choice = null; box.classList.remove('on'); list.classList.remove('fields'); close.textContent = 'Stay here'; box.onclick = null; resolve(v); };
      this._choice = done;
      for (const f of fields) {
        const row = el('label'), name = el('span'), input = el('input');
        name.textContent = f.label;
        if (f.type === 'file') { input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp'; }
        else { input.type = 'text'; input.maxLength = f.max || 60; input.value = f.value || ''; input.autocomplete = 'off'; input.spellcheck = false; if (f.hint) input.placeholder = f.hint; }
        row.append(name, input);
        list.append(row);
        inputs[f.key] = input;
      }
      const ok = el('button', 'save');
      ok.type = 'button'; ok.textContent = save;
      ok.onclick = (e) => { e.stopPropagation(); done(Object.fromEntries(fields.map((f) => [f.key, f.type === 'file' ? inputs[f.key].files[0] || null : inputs[f.key].value.trim()]))); };
      list.append(ok);
      close.onclick = (e) => { e.stopPropagation(); done(null); };
      box.onclick = (e) => { if (e.target === box) done(null); };
      box.classList.add('on');
      inputs[fields[0].key]?.focus();
    });
  }

  // ---------- a list to choose from (the sky villages)
  /**
   * Shows `items` ([{ label, note, color: [r, g, b] }]) under a title; resolves to the index chosen, or to
   * null when the visitor closes the list (button, Escape, click outside).
   */
  choose(title, lead, items) {
    const box = this.hud.querySelector('.chooser'), list = box.querySelector('.list');
    this._choice?.(null);
    box.querySelector('h2').textContent = title;
    box.querySelector('.lead').textContent = lead || '';
    list.textContent = '';
    this.panel.classList.remove('on'); this.emotes.classList.remove('on'); this.toggleBigMap(false);
    this.input.exitLock(); // the list is clicked: the pointer must be free
    return new Promise((resolve) => {
      const done = (i) => { this._choice = null; box.classList.remove('on'); box.onclick = null; resolve(i); };
      this._choice = done;
      items.forEach((it, i) => {
        const b = el('button');
        b.type = 'button';
        const dot = el('i');
        if (it.color) dot.style.background = `rgb(${it.color.map((c) => Math.round(Math.min(1, c * 1.2) * 255)).join(',')})`;
        const text = el('span');
        text.append(el('b', '', ''), el('small', '', ''));
        text.firstChild.textContent = it.label;
        text.lastChild.textContent = it.note || '';
        b.append(dot, text);
        b.onclick = (e) => { e.stopPropagation(); done(i); };
        list.append(b);
      });
      box.querySelector('.close').onclick = (e) => { e.stopPropagation(); done(null); };
      box.onclick = (e) => { if (e.target === box) done(null); };
      box.classList.add('on');
      list.scrollTop = 0;
    });
  }
  get choosing() { return !!this._choice; }
  closeChoice() { this._choice?.(null); }

  // ---------- emotes, settings
  /**
   * The emotes offered: [{ index, id, label, clip | move | rank, days, locked }] (see EMOTE_LIST). The animals of
   * light are shown with the number of days in a row that earns them; `days`: where the visitor stands.
   */
  setEmotes(list, days = 1) {
    this._emoteIds = Object.fromEntries(list.map((e) => [e.id, e.index]));
    const box = this.emotes, held = box.querySelector('.held');
    box.querySelectorAll('.group').forEach((n) => n.remove());
    const ranks = list.filter((e) => e.rank).sort((a, b) => a.days - b.days);
    const groups = [
      ['', list.filter((e) => e.clip)],
      ['Cheer on', list.filter((e) => e.move)],
      ['', ranks],
    ];
    for (const [title, items] of groups) {
      if (!items.length) continue;
      const g = el('div', `group${items[0].rank ? ' rank' : ''}`);
      if (title) g.append(el('h4', '', title));
      if (items[0].rank) g.append(this._streak(ranks, days));
      const row = el('div', 'set');
      for (const e of items) {
        const b = el('button');
        b.type = 'button';
        b.textContent = e.label;
        b.title = e.rank ? (e.locked ? `Comes on day ${e.days} in a row: ${Math.max(1, e.days - days)} more to go` : `/${e.id} — yours`) : `/${e.id}`;
        if (e.rank) b.append(el('small', '', e.locked ? `Day ${e.days}` : '✓ yours'));
        if (e.locked) b.classList.add('locked');
        b.onclick = () => { this.emit('emote', e.index); box.classList.remove('on'); };
        row.append(b);
      }
      g.append(row);
      box.insertBefore(g, held);
    }
  }
  // What the animals of light are and how one earns them: the days in a row so far, the next animal, how far along.
  _streak(ranks, days) {
    const box = el('div', 'streak'), count = el('div', 'count'), about = el('div', 'about');
    count.append(el('b', '', String(days)), el('span', '', days === 1 ? 'day in a row' : 'days in a row'));
    const next = ranks.find((e) => e.locked), last = [...ranks].reverse().find((e) => !e.locked);
    const from = last ? Math.min(days, last.days) : 1, to = next ? next.days : from;
    const bar = el('div', 'bar'), fill = el('i');
    fill.style.width = `${next ? Math.round(100 * Math.min(1, Math.max(0.04, (days - from) / Math.max(1, to - from)))) : 100}%`;
    bar.append(fill);
    const line = el('p', 'next');
    if (next) { const left = Math.max(1, next.days - days); line.append('Next: the ', el('b', '', next.label), ` on day ${next.days} — come back `, el('b', '', left === 1 ? 'tomorrow' : `${left} more days`), left === 1 ? '' : ' in a row'); }
    else line.append('Every animal is yours. Show them off!');
    about.append(el('h4', '', 'Animals of light'), el('p', '', 'Visit every day: each day in a row calls a new animal to your side. Miss a day and the count starts again at 1.'), bar, line);
    box.append(count, about);
    return box;
  }
  /** The emote on key `i` (0 = the key 1): its number, or -1. */
  quickEmote(i) { return this._emoteIds?.[QUICK[i]] ?? -1; }

  /** { sound, music }, each 0..1. */
  setVolume(volume) { this.hud.querySelectorAll('[data-vol]').forEach((r) => { r.value = String(Math.round((volume[r.dataset.vol] ?? 0) * 100)); }); }
  setSettings(settings) { this.hud.querySelectorAll('[data-set]').forEach((b) => b.setAttribute('aria-pressed', String(!!settings[b.dataset.set]))); }
  /** The screen whitens (0: not at all, 1: wholly): the flash of the big red button. */
  setFlash(v) {
    v = v < 0.01 ? 0 : Math.min(1, v);
    if (v === this._flash) return;
    this._flash = v;
    const f = (this._flashEl ||= this.root.querySelector('.flash'));
    f.style.opacity = String(v);
    f.style.display = v ? 'block' : 'none';
  }
  /** An administrator has the "important" channel of the chat. */
  setAdmin(on) {
    this._admin = !!on;
    if (!on && this.chatChannel === 'important') this._channel('all');
    this.bigEl.querySelector('.legend span').textContent = on ? 'Administrator: click a spot to go there · outside the map to close' : 'Click anywhere to close';
    this.bigEl.classList.toggle('goto', !!on);
  }
  /** May the visitor fly the camera about? (the button disappears otherwise) */
  setFreeCamera(on) { this.cameraBtn.style.display = on ? '' : 'none'; }

  // ---------- who is here
  get rosterOpen() { return this.rosterEl.classList.contains('on'); }
  closeRoster() { this.rosterEl.classList.remove('on'); }
  /**
   * The list of the visitors of the room. people: [{ id, name, color, me, where (a few words) }]; for an
   * administrator, `details` (id → { ip, ua, dev, since, cc, city, admin }), `bans` ([{ kind, key, name,
   * until }]), `admins` ([{ id, name, by, at }]: those who were named) and `visitors` (where people come
   * from: see server/visitors.js) add what only they may see and do: 'kick' (id), 'ban' (id, hours), 'unban'
   * ({ kind, key }), 'promote' (id) and — the owner only — 'demote' (the id of a named administrator) are emitted.
   */
  showRoster({ people, mode, admin = false, owner = false, details = null, bans = null, admins = null, visitors = null, now = 0 }) {
    const box = this.rosterEl, list = box.querySelector('.list'), bansEl = box.querySelector('.bans'), adminsEl = box.querySelector('.admins'), visitorsEl = box.querySelector('.visitors');
    if (!this.rosterOpen) { this.panel.classList.remove('on'); this.emotes.classList.remove('on'); this.toggleBigMap(false); this.input.exitLock(); }
    box.querySelector('h2').textContent = people.length > 1 ? `Who is here — ${people.length} visitors` : 'Who is here';
    box.querySelector('.lead').textContent = mode === 'online' ? (admin ? `You are ${owner ? 'the owner' : 'an administrator'}: you also see where each visitor connects from, can put them out, and can name other administrators.` : 'Everyone in this room.')
      : mode === 'local' ? 'No server here: only the tabs of this browser see each other.' : 'Offline: nobody else can be seen.';
    list.textContent = '';
    const ago = (t) => { const m = Math.max(0, Math.round((now - t) / 60000)); return m < 1 ? 'just arrived' : m < 60 ? `here for ${m} min` : `here for ${Math.floor(m / 60)} h ${m % 60} min`; };
    for (const p of people) {
      const row = el('div', `who${p.me ? ' me' : ''}`);
      const dot = el('i'); dot.style.background = hex(p.color);
      const text = el('span');
      const name = el('b'); name.textContent = p.me ? `${p.name} (you)` : p.name;
      const where = el('small'); where.textContent = p.where || '';
      text.append(name, where);
      row.append(dot, text);
      const d = details?.get(p.id);
      if (admin && d) {
        if (d.cc) name.prepend(flagOf(d.cc), ' ');
        if (d.admin) { const badge = el('em', 'rank'); badge.textContent = d.admin === 'owner' ? 'owner' : 'admin'; name.append(' ', badge); }
        const more = el('small', 'more');
        more.textContent = `${d.cc ? `${d.city ? `${d.city}, ` : ''}${countryName(d.cc)} · ` : ''}${d.ip || 'address unknown'} · ${describeAgent(d.ua)}${d.dev ? ` · device ${d.dev.slice(0, 8)}…` : ''} · ${ago(d.since)}`;
        more.title = d.ua || '';
        text.append(more);
        if (!p.me) {
          const acts = el('span', 'acts');
          const act = (label, title, fn, cls = '') => { const b = el('button', cls); b.type = 'button'; b.textContent = label; b.title = title; b.onclick = fn; acts.append(b); };
          act('Go to', 'Be carried next to them', () => { this.closeRoster(); this.emit('goto', { id: p.id }); }, 'good');
          if (!d.admin) act('Make admin', 'Name them an administrator: their browser keeps a key of its own', () => this.emit('promote', p.id), 'good');
          if (d.admin !== 'owner' || owner) { // (nobody but the owner puts the owner out)
            act('Kick', 'Put out of the room (they can come back)', () => this.emit('kick', p.id));
            act('Ban 1 h', 'Keep out for an hour (address and device)', () => this.emit('ban', p.id, 1));
            act('Ban 1 day', 'Keep out for a day', () => this.emit('ban', p.id, 24));
            act('Ban for good', 'Keep out until the ban is lifted', () => this.emit('ban', p.id, 0));
          }
          row.append(acts);
        }
      }
      list.append(row);
    }
    // the administrators who were named (the owner takes the title away)
    adminsEl.textContent = '';
    if (admin && admins && admins.length) {
      adminsEl.append(el('h3', '', `Administrators — ${admins.length} named`));
      for (const a of admins) {
        const row = el('div', 'who');
        const text = el('span');
        const name = el('b'); name.textContent = a.name || '?';
        const what = el('small'); what.textContent = `named by ${a.by || '?'} · ${new Date(a.at).toLocaleDateString()}`;
        text.append(name, what);
        row.append(text);
        if (owner) {
          const off = el('button'); off.type = 'button'; off.textContent = 'Remove'; off.title = 'They are an administrator no more'; off.onclick = () => this.emit('demote', a.id);
          const acts = el('span', 'acts'); acts.append(off);
          row.append(acts);
        }
        adminsEl.append(row);
      }
    }
    // where the visitors come from
    visitorsEl.textContent = '';
    if (admin && visitors && visitors.days) {
      const sum = (n) => visitors.days.slice(0, n).reduce((t, d) => t + (d.u || 0), 0), today = visitors.days.find((d) => d.day === visitors.today);
      visitorsEl.append(el('h3', '', 'Visitors'));
      const tiles = el('div', 'tiles');
      for (const [label, value] of [['Today', today?.u || 0], ['7 days', sum(7)], ['30 days', sum(30)], ['Page loads today', today?.n || 0]]) { const t = el('div', 'tile'); t.append(el('b', '', String(value)), el('small', '', label)); tiles.append(t); }
      visitorsEl.append(tiles);
      if (visitors.countries?.length) {
        const top = visitors.countries[0].n || 1, grid = el('div', 'countries');
        for (const c of visitors.countries.slice(0, 12)) {
          const row = el('div', 'country'), bar = el('i'), label = el('span');
          bar.style.width = `${Math.max(3, Math.round((100 * c.n) / top))}%`;
          label.append(flagOf(c.cc), ` ${countryName(c.cc)}`);
          row.append(label, el('b', '', String(c.n)), bar);
          grid.append(row);
        }
        visitorsEl.append(el('h3', '', 'Where from (30 days)'), grid);
      }
      if (visitors.recent?.length) {
        visitorsEl.append(el('h3', '', 'Latest visits'));
        const since = (t) => { const m = Math.max(0, Math.round((visitors.now - t) / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };
        for (const r of visitors.recent.slice(0, 40)) {
          const row = el('div', 'who'), text = el('span'), name = el('b'), what = el('small');
          name.append(flagOf(r.cc), ` ${r.name || 'Visitor'}`);
          what.textContent = `${r.cc ? `${r.city ? `${r.city}, ` : ''}${countryName(r.cc)}` : 'place unknown'} · ${since(r.at)}${r.n > 1 ? ` · ${r.n} page loads` : ''} · device ${r.dev}…`;
          text.append(name, what);
          row.append(text);
          visitorsEl.append(row);
        }
      }
    }
    bansEl.textContent = '';
    if (admin && bans && bans.length) {
      bansEl.append(el('h3', '', 'Kept out'));
      for (const b of bans) {
        const row = el('div', 'who');
        const text = el('span');
        const name = el('b'); name.textContent = b.name || '?';
        const what = el('small'); what.textContent = `${b.kind === 'ip' ? `address ${b.key}` : `device ${String(b.key).slice(0, 8)}…`} · ${b.until ? `until ${new Date(b.until).toLocaleString()}` : 'for good'}`;
        text.append(name, what);
        const lift = el('button'); lift.type = 'button'; lift.textContent = 'Lift'; lift.onclick = () => this.emit('unban', { kind: b.kind, key: b.key });
        const acts = el('span', 'acts'); acts.append(lift);
        row.append(text, acts);
        bansEl.append(row);
      }
    }
    box.classList.add('on');
  }

  /** A message that stays (put out by the administrator, for instance); null takes it away. */
  banner(text) {
    this.bannerEl.textContent = text || '';
    this.bannerEl.classList.toggle('on', !!text);
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
  /** `to`: the placeholder when the line goes to a character (then nobody else hears it); else to the room. */
  toggleChat(open = !this.chatOpen, to = '') {
    if (open) {
      this._chatTo = to;
      this.chanBtn.style.display = to ? 'none' : '';
      if (to) this.chatInput.placeholder = to; else this._channel(this.chatChannel);
    }
    this.chatEl.classList.toggle('typing', open);
    this.chatEl.classList.remove('peek');
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
    if (open) { this.panel.classList.remove('on'); this.emotes.classList.remove('on'); this.chatInput.focus({ preventScroll: true }); }
    else if (document.activeElement === this.chatInput) this.chatInput.blur();
  }

  /**
   * A line in the chat log. `kind`: 'near' (said to those nearby only), 'important' (an administrator's
   * announcement), 'private' (between the visitor and a character: nobody else sees it), or nothing.
   * Lines fade away after a while; the log shows again whenever one comes in.
   */
  addChat(name, color, text, self = false, kind = '') {
    if (kind === true) kind = 'near';
    const line = el('p', `${self ? 'self' : ''}${kind ? ` ${kind}` : ''}`);
    const who = el('b');
    who.style.color = hex(color);
    who.textContent = name;
    line.append(who);
    if (kind) { const tag = el('i'); tag.textContent = kind === 'near' ? 'nearby' : kind === 'important' ? 'important' : 'only you'; line.append(tag); }
    line.append(document.createTextNode(` ${text}`));
    // (someone reading further up is left where they are)
    const reading = (this.chatOpen || this.chatEl.classList.contains('peek')) && this.chatLog.scrollHeight - this.chatLog.scrollTop - this.chatLog.clientHeight > 40;
    this.chatLog.append(line);
    while (this.chatLog.childElementCount > 200) this.chatLog.firstElementChild.remove();
    if (!reading) this.chatLog.scrollTop = this.chatLog.scrollHeight;
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
  /** The sight of the games one aims in: at (x, y) on the page, or hidden (null). */
  setSight(x, y) {
    const on = x !== null && x !== undefined;
    if (on !== this._sight) { this._sight = on; this.sightEl.classList.toggle('on', on); }
    if (on) this.sightEl.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  /** The gauge of the high striker: its needle at `v` (0 at the bottom, 1 at the top), or hidden (null). */
  setGauge(v) {
    const on = v !== null && v !== undefined;
    if (on !== this._gauge) { this._gauge = on; this.gaugeEl.classList.toggle('on', on); }
    if (on) this.gaugeEl.lastElementChild.style.bottom = `${(v * 100).toFixed(1)}%`;
  }

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

  setPresence(mode, count, shard = 1) {
    const dot = this.hud.querySelector('.players .dot');
    dot.className = `dot ${mode === 'online' ? 'online' : mode === 'local' ? 'local' : ''}`;
    this.hud.querySelector('.players .count').textContent = count <= 1 ? (mode === 'online' ? 'Online · on your own' : 'On your own') : `${count} visitors`;
    this.hud.querySelector('.net-info').textContent = mode === 'online'
      ? (shard > 1 ? `Connected, in room ${shard}: the first rooms are full. To be sure to meet someone, share an address ending in ?room=a-name-of-your-own.` : 'Connected: everyone who opens this address sees each other.')
      : mode === 'local'
        ? 'Local mode: only the tabs of this browser see each other (no presence server found).'
        : 'Offline.';
  }

  // ---------- name tags
  tag(id, name, color, badge = '') {
    const t = el('div', 'tag');
    if (badge) { const b = el('em', 'badge'); b.textContent = badge; t.append(b); t.classList.add('badged'); }
    const dot = el('i'); dot.style.background = hex(color);
    t.append(dot, document.createTextNode(name));
    this.tagsEl.append(t);
    return t;
  }

  // ---------- maps (north up). `view` is the window of the world drawn in map.jpg: { x0, z0, x1, z1 }.
  setMap(view, zones) { this.mapView = view; this.zones = zones; }

  /** The sky villages, for the mega map: [{ name, x, z, color, forHire, price }], and how big the country is. */
  setVillages(villages, size, label = (v) => v.name) { this.villages = villages; this.megaView = { x0: -size / 2, z0: -size / 2, x1: size / 2, z1: size / 2 }; this._villageLabel = label; }

  setMega(on) {
    this.mega = !!on && !!this.megaView;
    this.megaBtn.setAttribute('aria-pressed', this.mega ? 'true' : 'false');
    this.megaBtn.textContent = this.mega ? 'Valley map' : 'Mega map';
    this.bigEl.querySelector('.legend b').textContent = this.mega ? 'Mega map' : 'Map';
    if (this.mega && !this.megaImg) { this.megaImg = new Image(); this.megaImg.src = assetUrl('world/megamap.jpg'); }
    this._bigSize = '';
  }

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
      ctx.beginPath(); ctx.arc(px, pz, o.far ? 3 : 4, 0, 7); ctx.fillStyle = `#${AVATAR_COLORS[o.color % 16].toString(16).padStart(6, '0')}`; ctx.fill();
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
    const mega = this.mega && this.megaImg.complete && this.megaImg.width > 0;
    const v = mega ? this.megaView : this.mapView, img = mega ? this.megaImg : this.mapImg;
    if (!v || !this.bigMapOpen || !img.complete || !img.width) return;
    this._bigView = v; // (what a click on it means)
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
    ctx.lineJoin = 'round';
    if (mega) {
      // the sky villages: a mark in the colours of each; the name of those that are taken, the price of the others
      ctx.font = `600 ${Math.max(9, Math.round(w / 92))}px system-ui, sans-serif`;
      for (const sv of this.villages || []) {
        const px = X(sv.x), pz = Z(sv.z), rgb = sv.color.map((c) => Math.round(Math.min(1, c * 1.25) * 255)).join(',');
        ctx.beginPath(); ctx.moveTo(px, pz - 7); ctx.lineTo(px + 6.5, pz + 4.5); ctx.lineTo(px - 6.5, pz + 4.5); ctx.closePath();
        ctx.fillStyle = `rgb(${rgb})`; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = sv.forHire ? 'rgba(255, 255, 255, 0.75)' : '#f2c14e'; ctx.stroke();
        const text = this._villageLabel(sv), half = ctx.measureText(text).width / 2 + 4, tx = Math.min(w - half, Math.max(half, px));
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(14, 22, 17, 0.85)'; ctx.strokeText(text, tx, pz + 13);
        ctx.fillStyle = sv.forHire ? '#e6dfcc' : '#f2c14e'; ctx.fillText(text, tx, pz + 13);
      }
    }
    ctx.font = `600 ${Math.max(mega ? 9 : 11, Math.round(w / (mega ? 86 : 62)))}px Georgia, 'Times New Roman', serif`;
    for (const zone of this.zones || []) {
      if (zone.hidden || (mega && zone.r < 30)) continue; // (some places are for those who find them; the mega map only names the large ones)
      const half = ctx.measureText(zone.name).width / 2 + 6;
      const tx = Math.min(w - half, Math.max(half, X(zone.x))), tz = Z(zone.z); // never cut by the edge
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(14, 22, 17, 0.8)'; ctx.strokeText(zone.name, tx, tz);
      ctx.fillStyle = '#f6f1e4'; ctx.fillText(zone.name, tx, tz);
    }
    // the others, with their names
    ctx.font = `600 ${Math.max(10, Math.round(w / 80))}px system-ui, sans-serif`;
    const named = others.length <= 40; // (in a crowd, only those close by are named)
    for (const o of others) {
      const px = X(o.x), pz = Z(o.z);
      ctx.beginPath(); ctx.arc(px, pz, o.far ? 4 : 5.5, 0, 7); ctx.fillStyle = `#${AVATAR_COLORS[o.color % 16].toString(16).padStart(6, '0')}`; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      if (!named && o.far) continue;
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
