// The tab "E-mails" of the back office (see index.html): every kind of message the fair sends — read as it leaves,
// its words changed, switched off — and what left lately. The owner's alone. It asks everything of /api/mails
// (server/mails.js) with the key; the server builds each message, this page only shows it.
//
// A message is shown in a frame that can do nothing (sandboxed: no script runs in it), built here from what the
// server made: the page allows no style written in a document (its Content-Security-Policy), so the styles a
// message carries on its elements are read and set one property at a time — the look is the message's own.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const OWNERS = new Set(['ownerSale', 'ownerRefund']);
  let T = null, wired = false, data = null;
  // (what the owner is doing on each card: is it open, which case, what is typed and not kept yet — { sentence: text | null (back to the original) })
  const ui = {};
  const at = (kind) => (ui[kind] ||= { open: false, form: '', draft: {}, view: 'html', asked: 0, timer: 0, wrong: {} });
  const many = (n, one, more = `${one}s`) => `${n} ${n === 1 ? one : more}`;
  const clock = (ms) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const post = (body) => T.api('/api/mails', { method: 'POST', body });

  // ---- a message, shown as it leaves
  /** The declarations of a style written on an element: [[property, value]…] (a ; inside brackets or quotes is not an end). */
  function declarations(css) {
    const list = [];
    let depth = 0, quote = '', start = 0;
    for (let i = 0; i <= css.length; i++) {
      const c = css[i];
      if (quote) { if (c === quote) quote = ''; continue; }
      if (c === '"' || c === "'") quote = c;
      else if (c === '(') depth++;
      else if (c === ')') depth = Math.max(0, depth - 1);
      else if (i === css.length || (c === ';' && !depth)) {
        const one = css.slice(start, i), colon = one.indexOf(':');
        if (colon > 0) list.push([one.slice(0, colon).trim(), one.slice(colon + 1).trim()]);
        start = i + 1;
      }
    }
    return list;
  }
  /** The HTML of a message is put in a frame: its elements, their styles — and nothing that could run, load or lead anywhere. */
  function paint(frame, html) {
    const doc = frame.contentDocument;
    if (!doc || !doc.documentElement) return;
    const made = new DOMParser().parseFromString(html, 'text/html'), styles = [];
    for (const node of made.querySelectorAll('script, style, link, iframe, object, embed, form, img, video, audio, base, meta')) node.remove(); // (a message of the fair has none of these)
    for (const node of made.querySelectorAll('[style]')) { styles.push([node, node.getAttribute('style') || '']); node.removeAttribute('style'); }
    for (const a of made.querySelectorAll('a[href]')) { a.setAttribute('tabindex', '-1'); a.setAttribute('title', a.getAttribute('href')); }
    const body = doc.adoptNode(made.body);
    if (doc.body) doc.documentElement.replaceChild(body, doc.body); else doc.documentElement.append(body);
    for (const [node, css] of styles) for (const [name, value] of declarations(css)) { try { node.style.setProperty(name, value.replace(/\s*!important\s*$/, ''), /!important\s*$/.test(value) ? 'important' : ''); } catch { /* a value this browser does not know */ } }
    body.inert = true; // (nothing in it is clicked or tabbed to: its links lead nowhere from here)
    doc.documentElement.style.setProperty('background', '#ffffff'); // (as a mail reader shows a message that has no colour of its own)
    fit(frame);
  }
  /** A frame is as tall as its message: nothing of it is cut, and it has no scroll bar of its own. */
  function fit(frame) {
    const root = frame.contentDocument?.documentElement;
    if (!root || frame.hidden) return;
    const tall = Math.max(160, Math.ceil(root.getBoundingClientRect().height));
    if (Math.abs(tall - frame.offsetHeight) > 1) frame.style.height = `${tall}px`;
  }
  /** A frame for a message — and what is to be painted in it once it is there. */
  function frameFor(card) {
    const frame = T.el('iframe', 'mail-frame');
    frame.setAttribute('sandbox', 'allow-same-origin'); // (no script, no form, no way out: the page reaches in to paint it, nothing in it reaches out)
    frame.setAttribute('title', 'The message, as it leaves');
    frame.setAttribute('srcdoc', '<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body></body></html>');
    frame.addEventListener('load', () => { card.ready = true; if (card.html) paint(frame, card.html); });
    // (a window made narrower: the message is taller)
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => fit(frame)).observe(frame);
    return frame;
  }

  // ---- one kind of message: its card
  const kindOf = (id) => data.kinds.find((k) => k.id === id);
  const formOf = (k) => k.forms.find((f) => f.id === at(k.id).form) || k.forms[0];
  /** What the field of a sentence shows: what is typed and not kept yet, else what is kept, else the original. */
  const shownText = (k, f) => { const d = at(k.id).draft; return Object.hasOwn(d, f.id) ? (d[f.id] === null ? f.original : d[f.id]) : f.typed ?? f.original; };
  const pending = (k) => Object.keys(at(k.id).draft).length;

  /** The message of a card is asked again of the server, with the words as they are typed. */
  async function preview(k, card) {
    const s = at(k.id), n = ++s.asked, res = await post({ preview: { kind: k.id, form: formOf(k).id, words: s.draft } });
    if (n !== s.asked || !card.box.isConnected) return; // (an answer that comes after a later letter, or after the card was drawn again)
    if (!res.ok) { card.subject.textContent = res.body?.error || 'The message could not be made. Try again in a moment.'; return; }
    card.html = res.body.html;
    card.subject.textContent = res.body.subject;
    card.text.textContent = res.body.text;
    if (card.ready) paint(card.frame, card.html);
    s.wrong = res.body.broken || {};
    for (const [id, row] of Object.entries(card.rows)) say(k, k.fields.find((f) => f.id === id), row);
  }
  /** Under a sentence: why it cannot be used as it is typed — or when it is used, where it shows. */
  function say(k, f, row) {
    const s = at(k.id), wrong = s.wrong[f.id], value = row.input.value, changed = Object.hasOwn(s.draft, f.id), kept = f.typed !== undefined;
    row.box.classList.toggle('changed', changed);
    row.box.classList.toggle('wrong', !!wrong);
    row.state.textContent = changed ? 'not saved yet' : kept ? 'yours' : '';
    row.state.hidden = !changed && !kept;
    row.back.hidden = !(kept ? s.draft[f.id] !== null : changed);
    const notes = [];
    if (wrong) notes.push(`${wrong} As it is, the original sentence is sent in its place.`);
    else if (!value.trim() && !f.must) notes.push('Empty: this sentence is left out of the message.');
    if (f.only === 'text') notes.push('Only in the plain-text twin of the message.');
    if (f.only === 'html') notes.push('Only in the dressed message: its plain-text twin does not have it.');
    if (f.note) notes.push(f.note);
    if (f.twin && !changed && !kept) notes.push(`The plain-text twin of the message says it a little differently: “${f.twin}” — what you type here goes in both.`);
    row.note.textContent = notes.join(' ');
    row.note.classList.toggle('bad', !!wrong);
  }

  function editor(k, card) {
    const s = at(k.id), form = formOf(k), box = T.el('div', 'mail-edit');
    card.rows = {};
    if (k.forms.length > 1) {
      const pick = T.el('select'), label = T.el('label', 'mail-case', 'Which case ');
      for (const f of k.forms) pick.append(Object.assign(T.el('option', '', f.name), { value: f.id }));
      pick.value = form.id;
      pick.onchange = () => { s.form = pick.value; drawCard(k); };
      label.append(pick);
      box.append(label, T.el('p', 'hint', `This message has ${k.forms.length} cases. Each shows the sentences it is made of; a sentence that several cases share is changed for all of them.`));
    }
    const cols = T.el('div', 'mail-cols'), left = T.el('div', 'mail-fields'), right = T.el('div', 'mail-preview');
    const legend = T.el('p', 'hint');
    legend.append('In a sentence, a word between braces is put in when the message is made: ');
    Object.entries(k.vars).forEach(([name, what], i) => { if (i) legend.append(', '); legend.append(T.el('code', '', `{${name}}`), ` ${what}`); });
    legend.append('. Words between [square brackets] that hold one are left out when it is not known: “Thank you[, {name}]!”.');
    left.append(legend);
    for (const id of form.fields) {
      const f = k.fields.find((x) => x.id === id), row = { box: T.el('div', 'mail-field') }, head = T.el('label', '', f.label), holders = { ...k.vars, ...(f.own || {}) };
      row.input = T.el(f.line ? 'input' : 'textarea');
      row.input.id = `mail-${k.id}-${f.id}`; head.htmlFor = row.input.id;
      if (f.line) row.input.type = 'text'; else row.input.rows = Math.min(8, Math.max(2, Math.ceil(shownText(k, f).length / 44)));
      row.input.maxLength = f.line ? 200 : 1500;
      row.input.spellcheck = true;
      row.input.value = shownText(k, f);
      row.state = T.el('span', 'tag');
      head.append(' ', row.state);
      // (what was typed changes the message at once: asked of the server a moment after the last letter)
      const typed = () => {
        const value = row.input.value;
        if (value === (f.typed ?? f.original)) delete s.draft[f.id]; else s.draft[f.id] = value;
        say(k, f, row); mark(k, card);
        clearTimeout(s.timer); s.timer = setTimeout(() => preview(k, card), 260);
      };
      row.input.oninput = typed;
      const chips = T.el('div', 'chips');
      for (const [name, what] of Object.entries(holders)) {
        const chip = T.el('button', 'chip', `{${name}}`);
        chip.type = 'button'; chip.title = `Put {${name}} in this sentence: ${what}`;
        chip.onclick = () => { const i = row.input.selectionStart ?? row.input.value.length, j = row.input.selectionEnd ?? i; row.input.setRangeText(`{${name}}`, i, j, 'end'); row.input.focus(); typed(); };
        chips.append(chip);
      }
      row.back = T.el('button', 'ghost small', 'Back to the original');
      row.back.type = 'button';
      row.back.onclick = () => { if (f.typed !== undefined) s.draft[f.id] = null; else delete s.draft[f.id]; row.input.value = f.original; say(k, f, row); mark(k, card); preview(k, card); };
      chips.append(row.back);
      row.note = T.el('small', 'mail-note');
      row.box.append(head, row.input, chips, row.note);
      left.append(row.box);
      card.rows[f.id] = row;
      say(k, f, row);
    }
    card.save = T.button('Save these words', '', async () => {
      const res = await post({ kind: k.id, words: s.draft });
      if (!res.ok) {
        const row = card.rows[res.body?.field];
        if (row) { s.wrong = { ...s.wrong, [res.body.field]: res.body.why || res.body.error }; say(k, k.fields.find((f) => f.id === res.body.field), row); row.input.focus(); }
        return T.toast(res.body?.error || 'It could not be saved. Try again in a moment.', true);
      }
      const n = pending(k);
      data.kinds[data.kinds.findIndex((x) => x.id === k.id)] = res.body.kind;
      s.draft = {}; s.wrong = {};
      T.toast(`Saved: ${many(n, 'sentence')} of “${k.name}”. From now on it leaves with these words.`);
      drawCard(res.body.kind);
    });
    card.forget = T.button('Forget what I typed', 'ghost', () => { s.draft = {}; s.wrong = {}; drawCard(k); });
    const acts = T.el('div', 'row wrap');
    acts.append(card.save, card.forget);
    left.append(acts);

    const views = T.el('div', 'stages'), dressed = T.el('button', '', 'As it looks'), plain = T.el('button', '', 'Its plain-text twin');
    card.subject = T.el('b', 'mail-subject', form.subject);
    const subject = T.el('div', 'mail-line'); subject.append(T.el('span', '', 'Subject'), card.subject);
    card.frame = frameFor(card);
    card.text = T.el('pre', 'mail-text');
    const show = (view) => { s.view = view; dressed.classList.toggle('on', view === 'html'); plain.classList.toggle('on', view === 'text'); card.frame.hidden = view !== 'html'; card.text.hidden = view !== 'text'; if (view === 'html' && card.ready && card.html) paint(card.frame, card.html); };
    dressed.type = plain.type = 'button';
    dressed.onclick = () => show('html'); plain.onclick = () => show('text');
    views.append(dressed, plain);
    right.append(subject, views, card.frame, card.text);
    show(s.view);
    cols.append(left, right);
    box.append(cols);
    preview(k, card);
    return box;
  }
  /** What a card says of its state: switched off, how many sentences are the owner's, how many are typed and not kept. */
  function mark(k, card) {
    const mine = k.fields.filter((f) => f.typed !== undefined).length, n = pending(k), broken = Object.keys(k.broken || {}).length;
    card.tags.textContent = '';
    if (k.off) card.tags.append(T.el('span', 'tag old', 'switched off'));
    if (mine) card.tags.append(T.el('span', 'tag', `${many(mine, 'sentence')} in your words`));
    if (broken) card.tags.append(T.el('span', 'tag old', `${many(broken, 'sentence')} cannot be used`));
    if (n) card.tags.append(T.el('span', 'tag', `${many(n, 'change')} not saved yet`));
    if (card.save) { card.save.disabled = !n; card.forget.disabled = !n; }
  }
  function drawCard(k) {
    const s = at(k.id), was = document.querySelector(`.mail[data-kind="${k.id}"]`), card = { box: T.el('div', `mail${k.off ? ' off' : ''}`), tags: T.el('span', 'mail-tags'), rows: {} };
    card.box.dataset.kind = k.id;
    const head = T.el('div', 'mail-head'), text = T.el('div', 'grow'), title = T.el('b', '', k.name);
    title.append(' ', card.tags);
    const subject = T.el('small', 'mail-says'); subject.append('Subject: ', T.el('i', '', `“${k.forms[0].subject}”`), k.forms.length > 1 ? ` — and ${many(k.forms.length - 1, 'other case')}` : '');
    text.append(title, T.el('small', '', `When: ${k.when}`), T.el('small', '', `To: ${k.to}${OWNERS.has(k.id) ? (data.notify ? ` That address is ${data.notify}.` : ' No address is saved there: none of these is sent.') : ''}`), subject);
    head.append(text);
    if (k.locked) {
      const lock = T.el('div', 'mail-lock'); lock.append(T.el('span', 'tag', 'always sent'), T.el('small', '', k.locked.replace(/^Always sent: /, 'It cannot be switched off: ')));
      head.append(lock);
    } else {
      const sw = T.el('button', 'toggle'); sw.type = 'button'; sw.setAttribute('aria-pressed', String(!k.off)); sw.setAttribute('aria-label', `${k.name}: ${k.off ? 'switched off' : 'sent'}`); sw.title = k.off ? 'Switched off: not sent. Click to send it again.' : 'Sent. Click to switch it off.';
      sw.onclick = async () => {
        if (!k.off && !confirm(`Stop sending “${k.name}”? Nobody gets it until you switch it on again.`)) return;
        const res = await post({ kind: k.id, off: !k.off });
        if (!T.said(res, k.off ? `“${k.name}” is sent again.` : `“${k.name}” is switched off: it is no longer sent.`)) return;
        k.off = !k.off;
        drawCard(k);
      };
      head.append(sw);
    }
    const acts = T.el('div', 'row wrap'), open = T.el('button', 'ghost', s.open ? 'Close' : 'Read it, change its words');
    open.type = 'button';
    open.onclick = () => { s.open = !s.open; drawCard(k); };
    const send = T.button('Send me this one', 'ghost', async () => {
      const res = await post({ send: { kind: k.id, form: formOf(k).id, words: s.draft } });
      if (!res.ok) return T.toast(res.body?.error || 'It could not be sent. Try again in a moment.', true);
      T.toast(`Sent to ${res.body.to}${pending(k) ? ', with the words as you see them here (they are not saved yet)' : ''}: look in that mailbox — and in its spam, the first time.`);
      if (res.body.log) { data.log = res.body.log; drawLog(); }
    });
    send.disabled = !data.mail || !data.me;
    send.title = !data.mail ? 'This server sends no e-mail.' : !data.me ? 'Say first where your tests go, at the top of this page.' : `To ${data.me}, with made-up values${k.forms.length > 1 ? ' — the case chosen below' : ''}.`;
    acts.append(open, send);
    card.box.append(head, acts);
    if (s.open) card.box.append(editor(k, card));
    mark(k, card);
    if (was) was.replaceWith(card.box); else $('mails').append(card.box);
  }

  // ---- what left lately
  function drawLog() {
    const box = $('mails-log'), log = data.log || [];
    $('mails-log-said').textContent = `The last ${data.keeps} messages at the most, the newest first. The list keeps no address: for an account it keeps its name, and the address shown is the one that account has now; for a buyer without an account — whose address is asked of Stripe for one message and kept nowhere — it keeps nothing of who it was. “Handed to the mailer” means the mail service took it — not that it was read.`;
    if (!log.length) return T.empty(box, data.mail ? 'No message has left since this list is kept.' : 'No message has left: this server sends none.');
    box.textContent = '';
    for (const l of log) {
      const title = T.el('b', '', l.name), w = l.whom || {};
      if (l.form) title.append(T.el('span', 'tag quiet', l.form));
      if (l.test) title.append(T.el('span', 'tag', 'a test'));
      if (l.state === 'failed') title.append(T.el('span', 'tag old', 'not delivered'));
      if (l.state === 'off') title.append(T.el('span', 'tag quiet', 'not sent'));
      const whom = w.you ? `to you — ${w.email || 'your address'}` : w.account ? `to ${w.account} — ${w.paid ? 'at the address they gave at the payment (it is not kept)' : w.email || 'their account has no address any more'}` : w.guest ? 'to a buyer without an account — their address is not kept' : 'to an address the list does not keep';
      const how = l.state === 'sent' ? 'handed to the mailer' : l.state === 'off' ? 'not sent: this kind of message was switched off' : `the mailer refused it: ${l.error || 'no reason given'}`;
      const row = T.item(title, `${clock(l.at)} · ${whom} · ${how}`);
      row.classList.add(`left-${l.state}`);
      box.append(row);
    }
  }

  async function load() {
    const res = await T.api('/api/mails');
    if (!res.ok) { T.empty($('mails'), res.body?.error || 'The e-mails could not be read. Try again in a moment.'); return; }
    data = res.body;
    $('mails-none').hidden = data.mail;
    if (document.activeElement !== $('mails-me')) $('mails-me').value = data.me || '';
    if (!data.me && data.notify && !$('mails-me').value) $('mails-me').placeholder = data.notify;
    $('mails').textContent = '';
    for (const k of data.kinds) drawCard(k);
    drawLog();
  }
  function wire() {
    wired = true;
    $('mails-me-form').onsubmit = async (e) => {
      e.preventDefault();
      const me = $('mails-me').value.trim(), res = await post({ me });
      if (!T.said(res, me ? `Your tests will go to ${res.body?.me || me}.` : 'No address for your tests any more.')) return;
      data.me = res.body.me;
      for (const k of data.kinds) drawCard(k);
    };
  }

  (window.officeTabs ||= []).push({ id: 'mails', name: 'E-mails', show(tools) { T = tools; if (!wired) wire(); return load(); } });
})();
