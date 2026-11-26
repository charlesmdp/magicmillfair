// The lab page: the game as it stands, plus the extras one chooses to switch on (src/extras/index.js) — to see
// the game with and without each. The switches are in the address (?slide=0&caves=1), else what was last chosen
// here, else everything on. On this page the visitor is the administrator (see below).
import { FEATURES } from '../src/app/config.js';
import { EXTRAS, loadExtras } from '../src/extras/index.js';

// What only the lab has: tried here, not offered to the game.
const TRIALS = {
  oak: { name: 'Out on a Limb — one floor to try', load: () => import('./oak/floor/extra.js') },
  oak0: { name: 'Out on a Limb — the Great Oak (the first trial, set aside)', load: () => import('./oak/extra.js') },
};
// (the panel: the seven games that came last first — they are extras of the game now, each behind its switch)
const NEW = ['waves', 'lava', 'hive', 'flip', 'spiral', 'cars', 'golf'];
const ORDER = [...NEW, ...Object.keys(EXTRAS).filter((id) => !NEW.includes(id)), ...Object.keys(TRIALS)];
Object.assign(EXTRAS, TRIALS);

const KEY = 'mmf.lab.3', NAMES = { waves: '★ Big Tsunami (les vagues)', lava: '★ No Touch Lava! (la lave)', hive: '★ Bee Fly (nid d’abeille)', flip: '★ Mostly Up & Down (gravité)', spiral: '★ Spiral of Death (spirale)', cars: '★ Karting Simulator (voitures télécommandées)', golf: '★ Balthazar Golf (mini-golf)', slide: 'Toboggan', pond: 'The Endless Pond (trois étangs)', boats: 'Bateaux télécommandés', hill: 'Jump the Logs (la pente aux rondins)', crack: 'Bouncy Rock (la fissure entre deux aiguilles)', hollow: 'The Nuclear Cave (course volante dans la grotte)', oak: 'Chêne : un étage à essayer', oak0: 'Chêne (premier essai, mis de côté)', caves: 'Grottes : chat de proximité', stats: 'Compteurs et page des chiffres' };
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };
const query = new URLSearchParams(location.search), saved = read(), on = {};
for (const id of Object.keys(EXTRAS)) on[id] = query.has(id) ? !/^(0|off|no|false)$/i.test(query.get(id)) : id === 'oak0' ? saved[id] === true : saved[id] !== false; // (the first trial of the oak only when asked for)

// Where the button of a game puts one: the spot where one asks to play — or a step or two before it, facing it.
const SPOT = {
  slide: (g) => [g.x - Math.sin(g.yaw) * 3, g.z - Math.cos(g.yaw) * 3, g.yaw],
  hill: (g) => [g.x - Math.sin(g.yaw) * 2.5, g.z - Math.cos(g.yaw) * 2.5, g.yaw],
  hollow: (g) => [g.x, g.z - 1.5, g.yaw],
  boats: (g) => [g.x - Math.sin(g.yaw) * 2.6, g.z - Math.cos(g.yaw) * 2.6, g.yaw],
  oak: (g) => [g.x, g.z - 2.5, 0],
  oak0: (g) => [g.x - Math.sin(g.yaw) * 3, g.z - Math.cos(g.yaw) * 3, g.yaw],
};

function panel(app, built) {
  const coarse = !!window.matchMedia?.('(pointer: coarse)').matches; // (a phone, a tablet: the panel opens shut, clear of the stick)
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;left:10px;top:${coarse ? '104px' : '38%'};z-index:60;font:13px/1.35 system-ui,sans-serif;color:#f6e7c8;background:rgba(27,19,64,.86);border:1px solid rgba(242,193,78,.55);border-radius:12px;padding:8px 10px;max-width:250px;user-select:none`;
  const head = document.createElement('div');
  head.style.cssText = 'font-weight:700;letter-spacing:.08em;color:#f2c14e;cursor:pointer';
  const body = document.createElement('div');
  body.style.cssText = 'margin-top:6px;max-height:52vh;overflow-y:auto;overscroll-behavior:contain';
  const shut = (yes) => { body.hidden = yes; head.textContent = yes ? 'LABO ▸' : 'LABO ▾'; };
  head.onclick = () => shut(!body.hidden);
  shut(coarse);
  const hint = document.createElement('div');
  hint.textContent = '★ nouveau · coche : allumé · flèche : y aller';
  hint.style.cssText = 'opacity:.75;font-size:12px;margin-bottom:4px';
  body.append(hint);
  for (const id of ORDER) {
    const line = document.createElement('div'), row = document.createElement('label'), tick = document.createElement('input');
    line.style.cssText = 'display:flex;gap:6px;align-items:center;margin:3px 0';
    row.style.cssText = 'display:flex;gap:6px;align-items:center;cursor:pointer;flex:1;min-width:0';
    tick.type = 'checkbox'; tick.checked = !!on[id];
    tick.onchange = () => {
      // (a switch is thrown by loading the page again: the game without an extra is the game that never had it)
      try { localStorage.setItem(KEY, JSON.stringify({ ...on, [id]: tick.checked })); } catch { /* no storage */ }
      const next = new URLSearchParams(location.search);
      next.delete(id);
      location.search = next.toString();
    };
    row.append(tick, document.createTextNode(NAMES[id] || EXTRAS[id].name));
    line.append(row);
    // (the arrow: one is put where one asks to play that game)
    const g = built[id] && (built[id].gate || built[id].stand);
    if (g) {
      const b = document.createElement('button');
      b.textContent = '➜'; b.title = 'Y aller'; b.setAttribute('aria-label', `Aller à ${NAMES[id] || id}`);
      b.style.cssText = 'flex:none;width:30px;height:26px;border-radius:8px;border:1px solid rgba(246,231,200,.4);background:rgba(246,231,200,.14);color:inherit;font:inherit;cursor:pointer;touch-action:manipulation';
      b.onclick = () => { const [x, z, yaw] = (SPOT[id] || ((q) => [q.x, q.z, q.yaw]))(g); app.setMode?.('walk', true); app.player.teleport(x, z, yaw); app.rig.snap(app.player.pos, yaw + Math.PI); b.blur(); if (coarse) shut(true); };
      line.append(b);
    }
    body.append(line);
  }
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
  const built = await loadExtras(app, on);
  app.extrasBuilt?.(); // (what the game does once its extras are built: their boards of scores, their stars on the map, their planks)
  panel(app, built);
};
wait();
