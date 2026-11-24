// The lab page: the game as it stands, plus the extras one chooses to switch on (src/extras/index.js) — to see
// the game with and without each. The switches are in the address (?slide=0&caves=1), else what was last chosen
// here, else everything on. On this page the visitor is the administrator (see below).
import { FEATURES } from '../src/app/config.js';
import { EXTRAS, loadExtras } from '../src/extras/index.js';

// What only the lab has: tried here, not offered to the game. Off unless asked for.
const TRIALS = {
  oak: { name: 'Out on a Limb — one floor to try', load: () => import('./oak/floor/extra.js') },
  oak0: { name: 'Out on a Limb — the Great Oak (the first trial, set aside)', load: () => import('./oak/extra.js') },
};
Object.assign(EXTRAS, TRIALS);

const KEY = 'mmf.lab.3', NAMES = { slide: 'Toboggan', pond: 'The Endless Pond (course sur l’étang)', boats: 'Bateaux télécommandés', oak: 'Chêne : un étage à essayer', oak0: 'Chêne (premier essai, mis de côté)', caves: 'Grottes : chat de proximité', stats: 'Compteurs et page des chiffres' };
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const query = new URLSearchParams(location.search), saved = read(), on = {};
for (const id of Object.keys(EXTRAS)) on[id] = query.has(id) ? !/^(0|off|no|false)$/i.test(query.get(id)) : id === 'oak0' ? saved[id] === true : saved[id] !== false; // (the first trial of the oak only when asked for)

function panel(app, built) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:10px;top:38%;z-index:60;font:13px/1.35 system-ui,sans-serif;color:#f6e7c8;background:rgba(27,19,64,.86);border:1px solid rgba(242,193,78,.55);border-radius:12px;padding:8px 10px;max-width:230px;user-select:none';
  const head = document.createElement('div');
  head.textContent = 'LABO ▾';
  head.style.cssText = 'font-weight:700;letter-spacing:.08em;color:#f2c14e;cursor:pointer';
  const body = document.createElement('div');
  body.style.marginTop = '6px';
  head.onclick = () => { body.hidden = !body.hidden; head.textContent = body.hidden ? 'LABO ▸' : 'LABO ▾'; };
  for (const id of Object.keys(EXTRAS)) {
    const row = document.createElement('label'), tick = document.createElement('input');
    row.style.cssText = 'display:flex;gap:6px;align-items:center;cursor:pointer;margin:2px 0';
    tick.type = 'checkbox'; tick.checked = !!on[id];
    tick.onchange = () => {
      // (a switch is thrown by loading the page again: the game without an extra is the game that never had it)
      try { localStorage.setItem(KEY, JSON.stringify({ ...on, [id]: tick.checked })); } catch { /* no storage */ }
      const next = new URLSearchParams(location.search);
      next.delete(id);
      location.search = next.toString();
    };
    row.append(tick, document.createTextNode(NAMES[id] || EXTRAS[id].name));
    body.append(row);
  }
  const go = (label, where) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'display:block;width:100%;margin-top:5px;padding:4px 6px;border-radius:8px;border:1px solid rgba(246,231,200,.4);background:rgba(246,231,200,.12);color:inherit;font:inherit;cursor:pointer';
    b.onclick = () => { const [x, z, yaw] = where(); app.setMode?.('walk', true); app.player.teleport(x, z, yaw); app.rig.snap(app.player.pos, yaw + Math.PI); b.blur(); };
    body.append(b);
  };
  if (built.slide?.gate) go('Aller au toboggan', () => { const g = built.slide.gate; return [g.x - Math.sin(g.yaw) * 3, g.z - Math.cos(g.yaw) * 3, g.yaw]; });
  if (built.pond?.gate) go('Aller à l’Endless Pond', () => { const g = built.pond.gate; return [g.x + 2.2, g.z, g.yaw]; });
  if (built.boats?.stand) go('Aller aux bateaux', () => { const g = built.boats.stand; return [g.x - Math.sin(g.yaw) * 2.6, g.z - Math.cos(g.yaw) * 2.6, g.yaw]; });
  if (built.oak?.gate) go('Aller au chêne (étage d’essai)', () => { const g = built.oak.gate; return [g.x, g.z - 2.5, 0]; });
  if (built.oak0?.gate) go('Aller au grand chêne', () => { const g = built.oak0.gate; return [g.x - Math.sin(g.yaw) * 3, g.z - Math.cos(g.yaw) * 3, g.yaw]; });
  const note = document.createElement('div');
  note.textContent = 'Ici vous êtes administrateur : caméra libre (touche F), toute la boutique, tous les gestes.';
  note.style.cssText = 'margin-top:6px;opacity:.75;font-size:12px';
  body.append(note);
  box.append(head, body);
  document.body.append(box);
}

const wait = async () => {
  const app = window.__mmf;
  if (!(app && app.ready && app.world && app.player && app.fair && app.hud)) { setTimeout(wait, 120); return; }
  if (app.lab) return;
  app.lab = { on };
  FEATURES.freeCamera = 'everyone';
  app.hud.setFreeCamera?.(true);
  // on this page its visitor is the administrator — of this browser: what the game unlocks for one (the camera,
  // everything in the shop, every gesture) is unlocked. What a server keeps for its administrators (who is
  // here, keeping someone out, announcements) still asks for the key of that server: `/admin <key>`.
  if (app.who && !app.who.admin) { Object.assign(app.who, { admin: true, owner: true }); app.hud.setAdmin?.(true); app.refreshShop?.(); }
  panel(app, await loadExtras(app, on));
};
wait();
