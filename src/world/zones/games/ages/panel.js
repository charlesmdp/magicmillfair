// War Through the Ages: its panel — what one buys, and what one has. It is made when a war begins and taken away
// when it ends (nothing of it is in the page otherwise): six buttons along the bottom of the screen — the three
// robots of one's age, its turret, its great blow, the next age —, each with its picture, its price and a veil
// that lifts as it comes back; over them one's gold (and what comes every second) and one's experience towards the
// next age; over each base, how much of it stands; and what the game has to say (a new age, a great blow, the end).
// A finger or a mouse presses a button, the keys 1 … 6 do the same, and so do the stick (left and right choose)
// and the jump key (it presses what is chosen).
import { ERAS, W, offer } from './rules.js';

const CSS = `
.ages-ui{position:fixed;inset:0;z-index:28;pointer-events:none;font:600 13px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif;color:#f6e7c8;user-select:none;-webkit-user-select:none}
.ages-bar{position:absolute;left:50%;bottom:calc(10px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:flex;flex-direction:column;gap:6px;align-items:stretch;pointer-events:auto;--w:clamp(52px,calc((100vw - 372px)/6 - 6px),98px)}
.ages-info{display:flex;gap:8px;align-items:stretch;height:30px}
.ages-gold,.ages-xp{display:flex;align-items:center;gap:7px;padding:0 11px;border-radius:999px;background:rgba(20,26,30,.86);border:1px solid rgba(246,231,200,.34)}
.ages-gold b{font:800 19px/1 system-ui,sans-serif;color:#ffd75e;font-variant-numeric:tabular-nums;min-width:3ch;text-align:right}
.ages-gold small{font-size:11.5px;opacity:.8;font-weight:600;white-space:nowrap}
.ages-coin{display:inline-block;width:15px;height:15px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3b0,#f2c14e 45%,#b9801a);box-shadow:0 0 0 1.5px #7a4f0c;flex:none}
.ages-xp{flex:1;min-width:0}
.ages-xp em{font-style:normal;font-size:11.5px;white-space:nowrap;opacity:.9}
.ages-xp em:last-child{color:#ffd75e;opacity:1}
.ages-xp i{flex:1;height:10px;min-width:30px;border-radius:5px;background:rgba(0,0,0,.55);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(246,231,200,.25)}
.ages-xp u{display:block;height:100%;width:0;background:linear-gradient(90deg,#7ad0ff,#b9f3ff);border-radius:5px;transition:width .25s}
.ages-xp.go u{background:linear-gradient(90deg,#f2c14e,#fff0a8)}
.ages-row{display:flex;gap:6px}
.ages-b{position:relative;width:var(--w);height:calc(var(--w)*.98 + 6px);padding:0;border-radius:12px;border:2px solid rgba(246,231,200,.28);background:linear-gradient(#2c3a44,#18212a);color:inherit;font:inherit;overflow:hidden;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform .08s,border-color .15s,box-shadow .15s;filter:saturate(.55) brightness(.72)}
.ages-b canvas{position:absolute;left:50%;top:3px;width:calc(var(--w)*.68);height:calc(var(--w)*.68);transform:translateX(-50%);pointer-events:none}
.ages-b kbd{position:absolute;left:4px;top:4px;min-width:17px;padding:1px 0;border-radius:5px;background:rgba(0,0,0,.6);border:1px solid rgba(246,231,200,.35);font:700 11px/1.25 system-ui,sans-serif;text-align:center;z-index:2}
.ages-touch .ages-b kbd{display:none}
.ages-b .n{position:absolute;left:0;right:0;bottom:19px;font-size:10.5px;font-weight:600;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 3px;text-shadow:0 1px 2px #000;z-index:2}
.ages-b .p{position:absolute;left:0;right:0;bottom:3px;display:flex;justify-content:center;align-items:center;gap:4px;font:800 13px/1 system-ui,sans-serif;color:#ffd75e;font-variant-numeric:tabular-nums;white-space:nowrap;z-index:2;text-shadow:0 1px 2px #000}
.ages-b .p .ages-coin{width:11px;height:11px}
.ages-b .f{position:absolute;left:0;right:0;top:0;height:0;background:rgba(6,10,14,.72);border-bottom:2px solid rgba(255,215,94,.9);z-index:1;pointer-events:none}
.ages-b .f.none{border-bottom:0}
.ages-b.ok{filter:none;border-color:#f2c14e;box-shadow:0 0 0 1px rgba(0,0,0,.5),0 3px 12px rgba(242,193,78,.35)}
.ages-b.poor .p{color:#ff8d7a}
.ages-b.sel{outline:3px solid #fff;outline-offset:1px}
.ages-b:active,.ages-b.hit{transform:translateY(2px) scale(.96)}
.ages-b.no{animation:ages-no .25s}
.ages-b.age.ok{animation:ages-pulse .9s infinite;background:linear-gradient(#6a4a12,#3a2708)}
.ages-b.blow.ok{background:linear-gradient(#6a2616,#32100a)}
.ages-b.age .f{top:auto;bottom:0;background:linear-gradient(0deg,rgba(122,208,255,.5),rgba(122,208,255,.18));border-bottom:0;border-top:2px solid #b9f3ff}
@keyframes ages-no{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
@keyframes ages-pulse{50%{box-shadow:0 0 0 4px rgba(242,193,78,.55),0 0 22px rgba(242,193,78,.8)}}
.ages-hp{position:absolute;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;gap:3px;width:clamp(92px,13vw,170px);text-shadow:0 1px 3px rgba(0,0,0,.9)}
.ages-hp b{font:800 12px/1 system-ui,sans-serif;letter-spacing:.08em;white-space:nowrap}
.ages-hp i{display:block;width:100%;height:12px;border-radius:6px;background:rgba(0,0,0,.62);box-shadow:0 0 0 2px rgba(246,231,200,.75);overflow:hidden}
.ages-hp u{display:block;height:100%;width:100%;border-radius:6px;transition:width .2s}
.ages-hp0 u{background:linear-gradient(#69bdff,#2a7fe0)}.ages-hp1 u{background:linear-gradient(#ff8a70,#d83a26)}
.ages-hp0 b{color:#9ad4ff}.ages-hp1 b{color:#ffa694}
.ages-hp span{font-size:11.5px;white-space:nowrap}
.ages-hp.ouch i{box-shadow:0 0 0 2px #fff,0 0 14px #fff}
.ages-say{position:absolute;left:50%;top:calc(92px + env(safe-area-inset-top,0px));transform:translateX(-50%);max-width:92vw;padding:7px 18px;border-radius:14px;background:rgba(20,26,30,.8);border:1px solid rgba(246,231,200,.4);font:700 clamp(17px,2.6vw,26px)/1.2 Georgia,'Times New Roman',serif;text-align:center;opacity:0;transition:opacity .25s;white-space:nowrap}
.ages-say.on{opacity:1}
.ages-say.age{color:#ffd75e;border-color:#f2c14e}.ages-say.blow{color:#ffb38a;border-color:#ff8a5a}.ages-say.warn{color:#ffa694;border-color:#e8554e}.ages-say.win{color:#ffe9a0;border-color:#f2c14e;font-size:clamp(22px,4vw,38px)}.ages-say.lose{color:#ffb0a4;border-color:#e8554e;font-size:clamp(22px,4vw,38px)}
.ages-say small{display:block;font:600 13px/1.3 system-ui,sans-serif;opacity:.9;white-space:normal}
.ages-float{position:absolute;font:800 15px/1 system-ui,sans-serif;color:#ffd75e;text-shadow:0 1px 2px #000,0 0 6px rgba(0,0,0,.8);transform:translate(-50%,-50%);opacity:0;white-space:nowrap}
.ages-float.on{animation:ages-up 1s ease-out}
@keyframes ages-up{0%{opacity:0;margin-top:6px}15%{opacity:1}100%{opacity:0;margin-top:-34px}}
.ages-flash{position:absolute;inset:0;background:#fff;opacity:0;transition:opacity .9s ease-out}
.ages-tip{position:absolute;left:50%;transform:translateX(-50%);bottom:100%;margin-bottom:6px;padding:4px 12px;border-radius:999px;background:rgba(20,26,30,.86);border:1px solid rgba(246,231,200,.3);font-size:12px;font-weight:600;white-space:nowrap;opacity:0;transition:opacity .3s}
.ages-tip.on{opacity:1}
@media (max-height:520px){.ages-bar{gap:4px;bottom:calc(5px + env(safe-area-inset-bottom,0px));--w:clamp(52px,calc((100vw - 340px)/6 - 5px),74px)}.ages-info{height:24px}.ages-gold b{font-size:16px}.ages-b{height:calc(var(--w)*.86)}.ages-b .n{display:none}.ages-b canvas{top:1px;width:calc(var(--w)*.62);height:calc(var(--w)*.62)}.ages-row{gap:5px}.ages-say{top:calc(82px + env(safe-area-inset-top,0px));padding:4px 14px}.ages-hp{width:clamp(80px,13vw,140px)}.ages-hp span{display:none}}
@media (max-aspect-ratio:1/1){.ages-bar{bottom:calc(178px + env(safe-area-inset-bottom,0px));--w:calc((100vw - 16px)/6 - 5px)}.ages-row{gap:5px}.ages-xp em:first-child{display:none}}
`;
const KIND = ['unit', 'unit', 'unit', 'turret', 'blow', 'age'];
/** The great blow of each age, in a word or two (its button is narrow). */
const BLOW = ['Stones', 'Arrows', 'Broadside', 'Air Raid', 'The Atom'];
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

// ---- the pictures that are not robots: the great blow of each age, and the sign of each age
const INK = '#f6e7c8', GOLD = '#ffd75e', HOT = '#ff9a4a';
function blowPicture(g, era) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (era === 0) { // stones from the sky
    for (const [x, y, r] of [[30, 34, 11], [58, 52, 14], [76, 26, 8]]) { g.strokeStyle = HOT; g.lineWidth = 4; g.beginPath(); g.moveTo(x - r * 2.4, y - r * 2.8); g.lineTo(x - r * 0.6, y - r * 0.7); g.stroke(); g.fillStyle = '#b7aa98'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = '#7d7265'; g.beginPath(); g.arc(x + r * 0.25, y + r * 0.25, r * 0.55, 0, 7); g.fill(); }
  } else if (era === 1) { // a rain of arrows
    g.strokeStyle = INK; g.lineWidth = 3.5;
    for (const [x, y] of [[22, 20], [44, 14], [66, 22], [34, 44], [58, 46]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 16, y + 34); g.stroke(); g.fillStyle = '#c9d4e2'; g.beginPath(); g.moveTo(x + 21, y + 44); g.lineTo(x + 10, y + 34); g.lineTo(x + 22, y + 30); g.fill(); g.strokeStyle = INK; }
  } else if (era === 2) { // a broadside
    g.fillStyle = 'rgba(246,231,200,.5)'; for (const [x, y, r] of [[18, 30, 10], [30, 22, 12], [28, 40, 9]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    g.strokeStyle = HOT; g.lineWidth = 4; g.beginPath(); g.moveTo(36, 34); g.lineTo(56, 44); g.stroke();
    g.fillStyle = '#20242c'; g.beginPath(); g.arc(66, 50, 15, 0, 7); g.fill(); g.fillStyle = '#5b6474'; g.beginPath(); g.arc(61, 45, 5, 0, 7); g.fill();
  } else if (era === 3) { // an air raid
    g.fillStyle = INK; g.beginPath(); g.ellipse(46, 26, 30, 7, -0.12, 0, 7); g.fill(); g.fillRect(34, 12, 22, 5); g.fillRect(36, 33, 20, 5); g.fillRect(14, 20, 6, 14);
    for (const [x, y] of [[40, 54], [58, 62], [70, 48]]) { g.fillStyle = '#20242c'; g.beginPath(); g.ellipse(x, y, 5, 9, 0.3, 0, 7); g.fill(); g.fillStyle = HOT; g.fillRect(x - 5, y - 13, 7, 4); }
  } else { // the atom
    g.fillStyle = HOT; g.beginPath(); g.ellipse(48, 30, 30, 15, 0, 0, 7); g.fill(); g.fillStyle = GOLD; g.beginPath(); g.ellipse(48, 27, 20, 9, 0, 0, 7); g.fill();
    g.fillStyle = HOT; g.beginPath(); g.moveTo(40, 38); g.quadraticCurveTo(46, 54, 36, 72); g.lineTo(60, 72); g.quadraticCurveTo(50, 54, 56, 38); g.fill();
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.ellipse(48, 72, 30, 5, 0, 0, 7); g.stroke();
  }
}
function agePicture(g, era) {
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = 5;
  if (era === 0) { g.beginPath(); g.moveTo(34, 70); g.lineTo(58, 26); g.stroke(); g.fillStyle = '#b7aa98'; g.beginPath(); g.moveTo(44, 22); g.lineTo(72, 18); g.lineTo(66, 44); g.closePath(); g.fill(); }
  else if (era === 1) { g.beginPath(); g.moveTo(48, 12); g.lineTo(48, 58); g.moveTo(34, 52); g.lineTo(62, 52); g.moveTo(48, 58); g.lineTo(48, 72); g.stroke(); g.fillStyle = '#c9d4e2'; g.beginPath(); g.moveTo(48, 8); g.lineTo(54, 20); g.lineTo(54, 50); g.lineTo(42, 50); g.lineTo(42, 20); g.fill(); }
  else if (era === 2) { g.lineWidth = 12; g.strokeStyle = '#39404c'; g.beginPath(); g.moveTo(24, 46); g.lineTo(74, 30); g.stroke(); g.lineWidth = 5; g.strokeStyle = '#c98a4a'; g.beginPath(); g.arc(40, 58, 14, 0, 7); g.stroke(); g.beginPath(); g.moveTo(40, 44); g.lineTo(40, 72); g.moveTo(26, 58); g.lineTo(54, 58); g.stroke(); }
  else if (era === 3) { g.strokeStyle = '#e0a23a'; g.lineWidth = 9; for (let n = 0; n < 8; n++) { const a = n * Math.PI / 4; g.beginPath(); g.moveTo(48 + Math.cos(a) * 20, 42 + Math.sin(a) * 20); g.lineTo(48 + Math.cos(a) * 29, 42 + Math.sin(a) * 29); g.stroke(); } g.lineWidth = 8; g.beginPath(); g.arc(48, 42, 17, 0, 7); g.stroke(); }
  else { g.strokeStyle = '#8ff0b0'; g.lineWidth = 3.5; for (const a of [0, Math.PI / 3, -Math.PI / 3]) { g.beginPath(); g.ellipse(48, 42, 31, 11, a, 0, 7); g.stroke(); } g.fillStyle = GOLD; g.beginPath(); g.arc(48, 42, 6.5, 0, 7); g.fill(); }
  // (an arrow that points up: the age to come)
  g.fillStyle = GOLD; g.beginPath(); g.moveTo(80, 4); g.lineTo(93, 20); g.lineTo(85, 20); g.lineTo(85, 32); g.lineTo(75, 32); g.lineTo(75, 20); g.lineTo(67, 20); g.closePath(); g.fill();
}

/**
 * Makes the panel of a war. o: { touch (true on a telephone), press(b): what a button does (0 … 5), pictures(era)
 * → the pictures of the three robots and of the turret of an age (four canvases, or null) }. Returns { rect() (where
 * its row of buttons is on the page), update(st, chosen), place(i, x, y) (the bar of base `i`, on the page), say(text,
 * kind, ms, more), gold(x, y, text), ouch(i), nope(b), flash(), tip(text), close() }.
 */
export function makePanel(o) {
  let style = document.getElementById('ages-style');
  if (!style) { style = el('style'); style.id = 'ages-style'; style.textContent = CSS; document.head.append(style); }
  const root = el('div', `ages-ui${o.touch ? ' ages-touch' : ''}`);
  const hp = [0, 1].map((i) => { const box = el('div', `ages-hp ages-hp${i}`), name = el('b', '', i ? 'THE OTHER SIDE' : 'YOUR BASE'), bar = el('i'), fill = el('u'), age = el('span', '', ERAS[0].name); bar.append(fill); box.append(name, bar, age); root.append(box); return { box, fill, age, was: -1, era: -1, t: 0 }; });
  const say = el('div', 'ages-say'), floats = el('div'), flash = el('div', 'ages-flash');
  const bar = el('div', 'ages-bar'), info = el('div', 'ages-info'), row = el('div', 'ages-row'), tip = el('div', 'ages-tip');
  const gold = el('span', 'ages-gold'), goldN = el('b', '', String(W.gold)), goldS = el('small', '', '');
  gold.append(el('i', 'ages-coin'), goldN, goldS);
  const xp = el('span', 'ages-xp'), xpFrom = el('em', '', ERAS[0].name), xpBar = el('i'), xpFill = el('u'), xpTo = el('em', '', ERAS[1].name);
  xpBar.append(xpFill); xp.append(xpFrom, xpBar, xpTo); info.append(gold, xp);
  const buttons = KIND.map((kind, b) => {
    const btn = el('button', `ages-b ${kind}`), cv = el('canvas'), name = el('span', 'n'), price = el('span', 'p'), fill = el('i', 'f');
    btn.type = 'button'; cv.width = cv.height = 96;
    btn.append(el('kbd', '', String(b + 1)), cv, name, price, fill);
    // (a finger, a mouse: once, as it goes down — and nothing of it reaches the game under the panel)
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); o.press(b); });
    for (const type of ['mousedown', 'touchstart', 'click', 'dblclick']) btn.addEventListener(type, (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    row.append(btn);
    return { btn, cv, name, price, fill, shown: '', cls: '', h: -1, pic: '' };
  });
  bar.append(tip, info, row); root.append(say, floats, flash, bar);
  document.body.append(root);
  // (the keys 1 … 6 — taken before the game hears them, which would make one's robot wave: only while a war is on)
  const key = (e) => {
    const m = /^(?:Digit|Numpad)([1-6])$/.exec(e.code);
    if (!m || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault(); e.stopImmediatePropagation();
    o.press(Number(m[1]) - 1);
  };
  window.addEventListener('keydown', key, true);
  const pool = [];
  let sayT = 0, tipT = 0, age = -1, chosenWas = -1, goldWas = -1, incomeWas = -1, xpWas = -1, readyWas = null;
  const draw = (B, b, era) => {
    const g = B.cv.getContext('2d'); g.clearRect(0, 0, 96, 96);
    if (b === 4) blowPicture(g, era); else if (b === 5) agePicture(g, Math.min(4, era + 1)); else { const pics = o.pictures?.(era); if (pics && pics[b]) g.drawImage(pics[b], 0, 0, 96, 96); else { g.fillStyle = INK; g.font = '700 44px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(['B', 'S', 'H', 'T'][b], 48, 44); } }
  };
  const panel = {
    root,
    /** Where the buttons are on the page (the game keeps its stage clear of them). */
    rect: () => bar.getBoundingClientRect(),
    /** What the war is now: `st` (rules.js), `chosen` (the button the stick has chosen, or -1). */
    update(st, chosen = -1) {
      const s = st.sides[0], era = ERAS[s.age];
      const g = Math.floor(s.gold);
      if (g !== goldWas) { goldWas = g; goldN.textContent = String(g); }
      if (era.income !== incomeWas) { incomeWas = era.income; goldS.textContent = `+${era.income} a second`; }
      const last = s.age >= ERAS.length - 1, share = last ? 1 : Math.min(1, s.xp / era.need), w = Math.round(share * 100), ready = !last && s.xp >= era.need;
      if (w !== xpWas) { xpWas = w; xpFill.style.width = `${w}%`; }
      if (ready !== readyWas) { readyWas = ready; xp.classList.toggle('go', ready); }
      if (s.age !== age) { age = s.age; xpFrom.textContent = era.name; xpTo.textContent = last ? 'the last age' : `${ERAS[s.age + 1].name}${o.touch ? '' : ' · 6'}`; }
      for (let b = 0; b < 6; b++) {
        const B = buttons[b], q = offer(st, 0, b), pic = `${b}:${s.age}`;
        if (B.pic !== pic) { B.pic = pic; draw(B, b, s.age); B.name.textContent = b === 5 ? (last ? 'the last age' : q.name) : b === 4 ? BLOW[s.age] : q.name; }
        const shown = b < 4 ? (q.why === 'full' ? 'full' : String(q.cost)) : b === 4 ? (q.ok ? 'ready' : `${Math.ceil(s.blow)} s`) : last ? '—' : q.ok ? 'go!' : `${Math.floor(q.fill * 100)} %`;
        if (B.shown !== shown) { B.shown = shown; if (b < 4 && q.why !== 'full') { B.price.replaceChildren(el('i', 'ages-coin'), document.createTextNode(shown)); } else B.price.textContent = shown; }
        const cls = `${q.ok ? ' ok' : ''}${q.why === 'gold' ? ' poor' : ''}${b === chosen ? ' sel' : ''}`;
        if (B.cls !== cls) { B.cls = cls; B.btn.className = `ages-b ${KIND[b]}${cls}`; }
        const h = b === 5 ? Math.round(q.fill * 100) : Math.round((1 - q.fill) * 100);
        if (B.h !== h) { B.h = h; B.fill.style.height = `${h}%`; B.fill.classList.toggle('none', h === 0 || h === 100); }
      }
      chosenWas = chosen;
      for (let i = 0; i < 2; i++) {
        const side = st.sides[i], H = hp[i], pct = Math.max(0, Math.round((100 * side.hp) / ERAS[side.age].base));
        if (H.was !== pct) { H.was = pct; H.fill.style.width = `${pct}%`; }
        if (H.era !== side.age) { H.era = side.age; H.age.textContent = ERAS[side.age].name; }
      }
    },
    /** Puts the bar of base `i` over (x, y) of the page. */
    place(i, x, y) { const s = hp[i].box.style; s.left = `${Math.round(x)}px`; s.top = `${Math.round(y)}px`; },
    /** Base `i` was hit: its bar flashes. */
    ouch(i) { const H = hp[i]; H.box.classList.add('ouch'); clearTimeout(H.t); H.t = setTimeout(() => H.box.classList.remove('ouch'), 140); },
    /** Says something over the stage for `ms`: `kind` 'age' | 'blow' | 'warn' | 'win' | 'lose' | ''; `more`: a smaller line under it. */
    say(text, kind = '', ms = 2200, more = '') {
      say.className = `ages-say on ${kind}`; say.textContent = text;
      if (more) say.append(el('small', '', more));
      clearTimeout(sayT); if (ms) sayT = setTimeout(() => say.classList.remove('on'), ms);
    },
    /** A word of advice just over the buttons, for `ms`. */
    tip(text, ms = 6000) { tip.textContent = text; tip.classList.add('on'); clearTimeout(tipT); tipT = setTimeout(() => tip.classList.remove('on'), ms); },
    /** Gold that comes from a fall: a figure that rises from (x, y) of the page. */
    gold(x, y, text) {
      let f = pool.find((q) => !q.busy);
      if (!f) { if (pool.length >= 14) return; f = { e: el('span', 'ages-float'), busy: false }; floats.append(f.e); pool.push(f); }
      f.busy = true; f.e.textContent = text; f.e.style.left = `${Math.round(x)}px`; f.e.style.top = `${Math.round(y)}px`;
      f.e.classList.remove('on'); void f.e.offsetWidth; f.e.classList.add('on');
      setTimeout(() => { f.busy = false; f.e.classList.remove('on'); }, 1000);
    },
    /** A button that was pressed for nothing shakes; one that did something dips. */
    nope(b) { const e = buttons[b].btn; e.classList.remove('no'); void e.offsetWidth; e.classList.add('no'); },
    done(b) { const e = buttons[b].btn; e.classList.add('hit'); setTimeout(() => e.classList.remove('hit'), 110); },
    /** The war is over: the buttons go (what the game says of the score is said where they were). */
    end() { bar.style.display = 'none'; },
    /** The whole screen goes white for a moment (the atom). */
    flash() { flash.style.transition = 'none'; flash.style.opacity = '0.92'; void flash.offsetWidth; flash.style.transition = ''; flash.style.opacity = '0'; },
    /** Takes everything away. */
    close() {
      window.removeEventListener('keydown', key, true);
      clearTimeout(sayT); clearTimeout(tipT); for (const H of hp) clearTimeout(H.t);
      root.remove(); style.remove();
    },
  };
  void chosenWas;
  return panel;
}
