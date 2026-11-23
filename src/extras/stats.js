// The game in figures, as an extra: this browser counts what its visitor does — keys pressed, metres walked,
// time played, time spent moving, presses of the big red button — keeps its own sums (shown on the page as
// "your own figures"), and about once a minute tells the server what was added, with what the robot is
// counted as: its colour, the kind of device, where the visitor first came from. Nothing else is sent, and
// nothing that says who anybody is (see server/stats.js).
//
// The figures are shown on the page /opendata, and in the game itself: a line added to the settings (the
// cogwheel) opens that page in a window. Plugged in from outside (window.__mmf): no file of the game is changed.
import { deviceId } from '../net/device.js';

const MINE = 'mmf.figures', FROM = 'mmf.from', PAGE = '/opendata/index.html'; // (the file itself: found by every server)
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* no storage */ } };

/** What the visitor is on: ['phone' | 'tablet' | 'computer', 'iOS' | 'Android' | 'Windows' | 'macOS' | 'Linux' | 'ChromeOS' | 'other']. */
export function device(nav = navigator) {
  const ua = nav.userAgent || '', touch = (nav.maxTouchPoints || 0) > 1;
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch); // (an iPad says it is a Mac)
  const os = /iPhone|iPod/.test(ua) || ipad ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'other';
  const kind = ipad || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'tablet' : /iPhone|iPod|Android.*Mobile|Mobile/.test(ua) ? 'phone' : 'computer';
  return [kind, os];
}

/** Where the visitor came from, the first time: a name for a site that sent them, or 'direct'. Kept from then on. */
export function origin(loc = location, referrer = document.referrer) {
  const kept = read(FROM);
  if (typeof kept === 'string' && kept) return kept;
  let from = 'direct';
  try {
    const q = new URLSearchParams(loc.search), tag = q.get('utm_source') || q.get('ref') || q.get('from');
    const host = referrer ? new URL(referrer).hostname.replace(/^www\./, '') : '';
    const known = [[/google\./, 'Google'], [/bing\./, 'Bing'], [/duckduckgo\./, 'DuckDuckGo'], [/^(t\.co|x\.com|twitter\.com)$/, 'X'], [/reddit\./, 'Reddit'], [/youtube\.|youtu\.be/, 'YouTube'], [/tiktok\./, 'TikTok'], [/instagram\./, 'Instagram'], [/facebook\.|fb\./, 'Facebook'], [/discord/, 'Discord'], [/linkedin\./, 'LinkedIn'], [/twitch\./, 'Twitch'], [/producthunt\./, 'Product Hunt'], [/ycombinator\./, 'Hacker News'], [/whatsapp\./, 'WhatsApp'], [/t\.me|telegram\./, 'Telegram']];
    if (tag) from = tag.replace(/[^\w .:+-]/g, '').slice(0, 40) || 'direct';
    else if (host && host !== loc.hostname) from = (known.find(([re]) => re.test(host)) || [0, host])[1].slice(0, 40);
  } catch { /* an address that cannot be read: direct */ }
  write(FROM, from);
  return from;
}

export function attach(app) {
  const { world, player, hud } = app;
  const zero = () => ({ keys: 0, metres: 0, secs: 0, moving: 0, blasts: 0 });
  const mine = { ...zero(), since: Date.now(), ...(read(MINE) || {}) }; // this device's own sums
  let fresh = zero(); // what the server has not been told yet
  const add = (k, v) => { fresh[k] += v; mine[k] += v; };
  const [kind, os] = device(), from = origin();

  // ---- what is counted
  addEventListener('keydown', (e) => { if (!e.repeat) add('keys', 1); }, { capture: true, passive: true });
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') add('keys', 1); }, { capture: true, passive: true }); // (on a phone, the fingers are the keys)
  let last = null, heard = null, saved = 0;
  world.zones.push({
    update: (dt) => {
      if (document.hidden || !app.input?.enabled) { last = null; return; } // (not playing: the welcome screen, another tab)
      const step = Math.min(dt, 1), p = player.pos;
      add('secs', step);
      if (last) {
        const m = Math.hypot(p.x - last.x, p.z - last.z);
        if (m > 0.002 && m < 5 + 40 * step) { add('metres', m); if (m / step > 0.3) add('moving', step); } // (a teleport is not a walk)
      }
      (last ||= { x: 0, z: 0 }); last.x = p.x; last.z = p.z;
      // the big red button: one's own presses
      if (app.presence && heard !== app.presence) { heard = app.presence; heard.on('blast', ({ self }) => { if (self) add('blasts', 1); }); }
      if ((saved += step) > 5) { saved = 0; write(MINE, mine); }
    },
  });

  // ---- what is told: about once a minute, and when the page is left
  const tell = () => {
    if (fresh.secs < 1 && !fresh.keys) return;
    const body = JSON.stringify({ device: deviceId(), d: fresh, color: hud._robot?.color ?? app.presence?.color ?? null, kind, os, from });
    fresh = zero();
    write(MINE, mine);
    try { if (!navigator.sendBeacon?.('/api/stats', new Blob([body], { type: 'application/json' }))) fetch('/api/stats', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {}); } catch { /* not told this time */ }
  };
  setInterval(tell, 60_000);
  addEventListener('pagehide', tell);
  document.addEventListener('visibilitychange', () => { if (document.hidden) tell(); });

  // ---- the window in the game: the page itself, opened from the settings
  const style = document.createElement('style');
  style.textContent = `.figures { position: fixed; inset: 0; z-index: 60; display: none; align-items: center; justify-content: center; background: rgba(8, 12, 10, 0.55); backdrop-filter: blur(3px); }
.figures.on { display: flex; }
.figures .sheet { position: relative; width: min(920px, 94vw); height: min(760px, 88vh); border-radius: 18px; overflow: hidden; background: #0d1f14; box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55); border: 1px solid rgba(182, 255, 46, 0.35); }
.figures iframe { width: 100%; height: 100%; border: 0; display: block; }
.figures .close { position: absolute; top: 10px; right: 12px; width: 36px; height: 36px; border-radius: 50%; border: 0; background: rgba(0, 0, 0, 0.45); color: #fff; font: 600 18px/1 system-ui, sans-serif; cursor: pointer; }`;
  document.head.append(style);
  const modal = document.createElement('div');
  modal.className = 'figures';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', 'The game in figures');
  modal.innerHTML = '<div class="sheet"><button class="close" type="button" aria-label="Close">✕</button></div>';
  document.body.append(modal);
  const sheet = modal.firstChild;
  const close = () => { modal.classList.remove('on'); sheet.querySelector('iframe')?.remove(); };
  const open = () => {
    tell(); write(MINE, mine);
    const frame = document.createElement('iframe');
    frame.title = 'The game in figures';
    frame.src = `${PAGE}?in=game`;
    sheet.append(frame);
    modal.classList.add('on');
    hud.panel?.classList.remove('on');
  };
  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) close(); });
  sheet.querySelector('.close').onclick = close;
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('on')) close(); });
  // a line in the settings, above "Your robot"
  const panel = hud.panel, before = panel && [...panel.querySelectorAll('h3')].find((h) => /robot/i.test(h.textContent));
  if (panel) {
    const title = document.createElement('h3'), button = document.createElement('button');
    title.textContent = 'The game in figures';
    button.type = 'button'; button.className = 'open-shop open-figures'; button.textContent = 'Open the figures';
    button.onclick = open;
    if (before) before.before(title, button); else panel.append(title, button);
  }
  return { open, close, tell, get mine() { return mine; } };
}
