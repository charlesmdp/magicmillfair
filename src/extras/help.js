// The keys of a game, whenever one wants them again: while a game of the extras is on, a small button under the
// line of the run — and the H key — shows them once more, a line for each, in a panel of their own (the note of
// the game is one line, cut short on a narrow screen). One for the whole game: the game that is on gives its
// keys with `set`, and takes them back with `clear`.
let made = null;

/** What shows the keys of the game that is on: { set(text) (says them, and keeps them for the asking), clear() }. */
export function keysHelp(app) {
  if (made) return made;
  let text = '', hide = 0;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:30;display:none;max-width:min(92vw,460px);font:500 13px/1.5 system-ui,sans-serif;color:#f6e7c8;background:rgba(20,26,30,.86);border:1px solid rgba(246,231,200,.35);border-radius:12px;padding:8px 14px;pointer-events:none;text-align:left';
  document.body.append(box);
  const shut = () => { box.style.display = 'none'; clearTimeout(hide); };
  /** Shows the keys, a line for each (they are given with " · " between them), for nine seconds. */
  const say = () => {
    if (!text) return;
    box.replaceChildren(...text.split(' · ').map((line) => { const row = document.createElement('div'); row.textContent = line; return row; }));
    box.style.display = 'block';
    clearTimeout(hide); hide = setTimeout(shut, 9000);
  };
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.textContent = app.input?.isTouch ? '? keys' : 'H · keys';
  pill.title = 'Show the keys of this game again';
  pill.style.cssText = 'position:fixed;left:50%;top:54px;transform:translateX(-50%);z-index:30;display:none;font:600 12px/1 system-ui,sans-serif;letter-spacing:.04em;color:#f6e7c8;background:rgba(20,26,30,.62);border:1px solid rgba(246,231,200,.35);border-radius:999px;padding:5px 11px;cursor:pointer;touch-action:manipulation';
  pill.addEventListener('click', (e) => { e.preventDefault(); if (box.style.display === 'block') shut(); else say(); pill.blur(); });
  document.body.append(pill);
  // (H, unless one is typing: in the chat, in a field)
  window.addEventListener('keydown', (e) => {
    if (!text || e.code !== 'KeyH' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    say();
  });
  made = {
    set: (keys) => { text = keys || ''; pill.style.display = text ? 'block' : 'none'; say(); },
    clear: () => { text = ''; pill.style.display = 'none'; shut(); },
  };
  return made;
}
