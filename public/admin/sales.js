// The tab "Sales" of the back office (see index.html: <section data-tab="sales">): everything that was bought,
// and the way to give a payment back, in whole or in part. The owner's alone — the server refuses anybody else
// (server/sales.js, which also decides everything: what is left of a payment, what a refund takes back).
//
// This file stands by itself next to admin.js, which knows nothing of it: it names its own tab, reads the list
// when its section is shown, and asks the API with the key the page was opened with (the one admin.js keeps for
// this tab of the browser). Nothing a buyer wrote is ever read as HTML, and no other site is spoken to.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const section = document.querySelector('section[data-tab="sales"]');
  if (!section) return;
  // (its own few rules of style: a file beside this one — the page allows no style written in a script)
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: '/admin/sales.css' }));

  // ---- the key: the one admin.js keeps while the office is open; failing that (a browser that keeps nothing), the one typed
  let typed = '';
  document.addEventListener('submit', (e) => { if (e.target?.id === 'login-form') typed = $('key')?.value.trim() || typed; }, true);
  const key = () => { try { return sessionStorage.getItem('mmf.office.key') || typed; } catch { return typed; } };
  /** A request to the API with the key: { ok, status, body }. Never throws. */
  async function api(path, { method = 'GET', body } = {}) {
    try {
      const res = await fetch(path, { method, cache: 'no-store', headers: { Authorization: `Bearer ${encodeURIComponent(key())}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
      const json = /json/.test(res.headers.get('content-type') || '') ? await res.json().catch(() => null) : null;
      return { ok: res.ok, status: res.status, body: json };
    } catch { return { ok: false, status: 0, body: null }; }
  }
  let toastTimer = 0;
  function toast(text, bad = false) {
    const t = $('toast');
    if (!t) return;
    t.textContent = text; t.classList.toggle('bad', bad); t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), bad ? 9000 : 6000);
  }
  const wrong = (res) => res.body?.error || (res.status === 403 ? 'The server said no: only the owner\'s key may do that.' : res.status === 0 ? 'The server cannot be reached.' : 'That did not work. Try again in a moment.');

  // ---- words
  const day = (t) => (t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const hour = (t) => (t ? new Date(t).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
  /** $9.99, $1,204.50, 12.50 EUR — from cents. */
  const money = (cents, currency = 'usd') => { const n = (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), cur = String(currency || 'usd').toLowerCase(); return `${cents < 0 ? '−' : ''}${cur === 'usd' ? `$${n}` : `${n} ${cur.toUpperCase()}`}`; };
  const whoOf = (w) => [w.name || `A browser without an account (${w.short || '?'}…)`, w.email].filter(Boolean).join(' · ');
  const BY = { owner: 'by you', auction: 'by the auction — outbid, or a bid that came too late', fair: 'when it was taken down', stripe: 'in Stripe itself', dispute: 'to the buyer\'s bank, after a dispute' };

  // ---------------------------------------------------------------------------------------------------- the list
  let lines = [], before = '', more = false, found = '', asked = 0, mode = null;
  const tile = (value, label, cls = '') => { const t = el('div', `tile ${cls}`.trim()); t.append(el('b', '', value), el('span', '', label)); return t; };

  /** The money given back of a sale, in a sentence — and what failed, if a refund did. */
  function backWords(s) {
    const out = [];
    for (const l of s.log) {
      if (l.failed) { out.push(`A refund of ${money(l.cents, s.currency)} failed on ${day(l.at)} (${l.failed}): it can be given back from here.`); continue; }
      if (!l.cents) continue;
      out.push(`${money(l.cents, s.currency)} given back ${BY[l.by] || ''} on ${day(l.at)}${l.why && l.by === 'owner' ? ` — “${l.why}”` : ''}${l.took ? ' · taken back' : l.kept ? ' · they kept it' : ''}`.replace(/\s+/g, ' '));
    }
    return out;
  }

  function draw() {
    const box = $('sales');
    box.textContent = '';
    for (const s of lines) {
      const row = el('div', `sale ${s.state}`);
      row.dataset.id = s.id;
      // when
      const at = el('div', 'when'); at.append(el('b', '', day(s.at)), el('small', '', hour(s.at)));
      // what, who
      const text = el('div', 'grow'), title = el('b', '', s.what);
      text.append(title, el('small', 'who', whoOf(s.who)));
      if (s.monthly) text.append(el('small', '', `${s.months > 1 ? `${s.months} payments so far, ${money(s.total, s.currency)} in all — the latest on ${day(s.paidAt)}` : 'One payment so far'}${s.ended ? ` · the subscription ended on ${day(s.ended)}` : ''}`));
      for (const line of backWords(s)) text.append(el('small', 'back', line));
      if (s.lost) text.append(el('small', 'back', 'Paid, but it could not be given: somebody had this place already. Give it back.'));
      if (s.dispute && s.state === 'disputed') text.append(el('small', 'back', `The buyer\'s bank is disputing this payment (${money(s.dispute.amount, s.currency)}) since ${day(s.dispute.at)}: answer it in Stripe. It cannot be given back while that runs.`));
      // how much, where it stands
      const sum = el('div', 'sum');
      sum.append(el('b', '', `${money(s.monthly ? s.paid : s.amount, s.currency)}${s.monthly ? ' a month' : ''}`));
      const tags = el('div', 'tags');
      if (s.state === 'paid') tags.append(el('span', 'tag ok', 'paid'));
      else if (s.state === 'part') tags.append(el('span', 'tag part', `partly refunded: ${money(s.backNow, s.currency)}`));
      else if (s.state === 'refunded') tags.append(el('span', 'tag gone', 'refunded'));
      else tags.append(el('span', 'tag old', 'disputed'));
      if (s.ended) tags.append(el('span', 'tag end', 'subscription ended'));
      if (s.lost && s.state === 'paid') tags.append(el('span', 'tag old', 'not given'));
      sum.append(tags);
      // what can be done
      const acts = el('div', 'acts');
      if (s.can) { const b = el('button', 'small warn', 'Refund…'); b.type = 'button'; b.onclick = () => openRefund(s); acts.append(b); }
      if (s.link) { const a = el('a', 'ghost', 'See it in Stripe'); a.href = s.link; a.target = '_blank'; a.rel = 'noopener noreferrer'; acts.append(a); }
      row.append(at, text, sum, acts);
      box.append(row);
    }
    if (!lines.length) box.append(el('div', 'empty', found ? `Nothing matches “${found}”.` : 'Nothing has been sold yet — or nothing since this list is kept: “Fetch what Stripe remembers” brings in the past.'));
    $('sales-more').hidden = !more;
  }

  function drawTotals(t, hidden) {
    const box = $('sales-total');
    box.textContent = '';
    const of = found ? ` that match “${found}”` : '';
    box.append(tile(t.count.toLocaleString('en-US'), `purchase${t.count === 1 ? '' : 's'}${of}`));
    for (const s of t.sums.length ? t.sums : [{ currency: 'usd', paid: 0, back: 0 }]) {
      box.append(tile(money(s.paid, s.currency), 'paid'), tile(money(s.back, s.currency), 'refunded', s.back ? 'back' : ''), tile(money(s.paid - s.back, s.currency), 'kept, before Stripe\'s fees'));
    }
    const note = $('sales-mode');
    note.hidden = !(mode === 'test' || hidden || mode === null);
    note.textContent = mode === null ? 'The shop is not open on this server (no Stripe key): nothing can be given back from here.'
      : `${mode === 'test' ? 'Test mode: these are payments made with Stripe\'s test cards — no real money. ' : ''}${hidden ? `${hidden} ${mode === 'test' ? 'real' : 'test'} payment${hidden === 1 ? ' is' : 's are'} not shown here, nor counted.` : ''}`;
  }

  async function load(older = false) {
    const n = ++asked, res = await api(`/api/sales?q=${encodeURIComponent(found)}${older && before ? `&before=${encodeURIComponent(before)}` : ''}`);
    if (n !== asked) return; // (an answer come late, after another question was asked)
    if (!res.ok) { if (!older) { lines = []; more = false; draw(); $('sales').firstChild.textContent = wrong(res); } else toast(wrong(res), true); return; }
    const b = res.body;
    mode = b.mode;
    lines = older ? lines.concat(b.sales) : b.sales;
    before = b.before || before; more = !!b.more;
    drawTotals(b.totals, b.hidden || 0);
    draw();
    $('sales-fetch').disabled = !b.stripe || filling;
    if (!filling && !fetched && b.fill?.done) $('sales-fetch-said').textContent = `Last read to its end on ${day(b.fill.done)}.`; // (what a reading made from this page said stays said)
  }
  let findTimer = 0;
  $('sales-find').addEventListener('input', () => { clearTimeout(findTimer); findTimer = setTimeout(() => { found = $('sales-find').value.trim(); load(); }, 350); });
  $('sales-more').onclick = () => load(true);

  // ---------------------------------------------------------------------------------- what Stripe remembers
  let filling = false, fetched = false;
  $('sales-fetch').onclick = async () => {
    if (filling) return;
    filling = fetched = true;
    const b = $('sales-fetch'), said = $('sales-fetch-said');
    b.disabled = true;
    said.classList.remove('bad');
    said.textContent = 'Reading Stripe\'s list…';
    // (a page at a time: each request reads one, and the next goes on from it — until Stripe says that was the last)
    for (let i = 0; i < 2000; i++) {
      const res = await api('/api/sales', { method: 'POST', body: { fetch: true } });
      if (!res.ok) { said.classList.add('bad'); said.textContent = `${wrong(res)}${res.status === 409 ? '' : ' Press again to go on: nothing is lost, nothing is doubled.'}`; break; }
      const r = res.body, plural = (n, one, many) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
      said.textContent = r.done
        ? `Done: ${plural(r.seen, 'payment', 'payments')} read at Stripe — ${plural(r.added, 'was', 'were')} missing from the list and ${r.added === 1 ? 'is' : 'are'} in it now${r.updated ? `, ${plural(r.updated, 'line was', 'lines were')} completed` : ''}${r.other ? `, ${plural(r.other, 'was', 'were')} not of this game's shop` : ''}.`
        : `Reading Stripe's list… ${plural(r.seen, 'payment', 'payments')} read, ${r.added.toLocaleString('en-US')} added so far.`;
      if (r.done) break;
    }
    filling = false;
    load();
  };

  // ---------------------------------------------------------------------------------------------------- a refund
  // (one intention, one token: drawn when the dialog opens, sent with the refund — the same click said twice is
  // one refund. After a refusal — Stripe did nothing — another is drawn; when nobody knows what Stripe did, it is kept.)
  const draw16 = () => { try { return crypto.randomUUID().replace(/-/g, ''); } catch { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`; } };
  let giving = null; // ({ sale, look, token, n }: the sale the dialog is open on)
  const dialog = $('sale-refund'), amountBox = $('sale-refund-amount'), go = $('sale-refund-go'), errBox = $('sale-refund-error');
  /** What was typed as a sum, in cents (null: not a sum). "5", "5.5", "5,50", "$5.50". */
  const centsOf = (text) => { const m = /^\s*\$?\s*(\d{1,7})(?:[.,](\d{1,2}))?\s*\$?\s*$/.exec(String(text || '')); return m ? Number(m[1]) * 100 + Number((m[2] || '').padEnd(2, '0')) : null; };
  const fail = (text) => { errBox.textContent = text; errBox.hidden = !text; };

  /** The dialog says what is about to be done, as it stands: the sum, and what becomes of what was bought. */
  function showPlan() {
    if (!giving?.look) return;
    const { look, sale } = giving, cur = sale.currency, all = $('sale-refund-all').checked, typedSum = centsOf(amountBox.value);
    const sum = all ? look.left : typedSum, full = sum === look.left, canKeep = full && !!look.keep;
    $('sale-refund-keep-row').hidden = !canKeep;
    if (!canKeep) $('sale-refund-keep').checked = false;
    const what = $('sale-refund-what');
    what.textContent = full ? ($('sale-refund-keep').checked ? look.keep : look.take) : `Nothing else changes: a part given back leaves ${sale.what} theirs${sale.monthly ? ', and its subscription goes on' : ''}.`;
    let bad = '';
    if (!all && amountBox.value.trim() && typedSum === null) bad = 'A sum like 5 or 5.50.';
    else if (!all && typedSum !== null && typedSum < 1) bad = 'More than nothing.';
    else if (!all && typedSum !== null && typedSum > look.left) bad = `No more than what is left of this payment: ${money(look.left, cur)}.`;
    fail(bad);
    const ready = look.left > 0 && !look.disputed && giving.can && (all || (typedSum !== null && typedSum >= 1 && typedSum <= look.left));
    go.disabled = !ready || giving.busy;
    go.textContent = ready ? `Give back ${money(sum, cur)}` : 'Give it back';
  }

  async function openRefund(sale) {
    const n = (giving?.n || 0) + 1;
    giving = { sale, look: null, token: draw16(), n, can: false, busy: false };
    $('sale-refund-title').textContent = `Refund — ${sale.what}`;
    $('sale-refund-who').textContent = `${whoOf(sale.who)} — bought on ${day(sale.at)} at ${hour(sale.at)}`;
    $('sale-refund-sums').textContent = 'Asking Stripe what is left of this payment…';
    $('sale-refund-what').textContent = '';
    $('sale-refund-month').hidden = true;
    $('sale-refund-all').checked = true; amountBox.value = ''; $('sale-refund-reason').value = ''; $('sale-refund-keep').checked = false; $('sale-refund-keep-row').hidden = true;
    $('sale-refund-how').disabled = true;
    fail('');
    go.disabled = true; go.textContent = 'Give it back';
    if (!dialog.open) dialog.showModal();
    const res = await api(`/api/sales?look=${encodeURIComponent(sale.id)}`);
    if (giving?.n !== n || !dialog.open) return; // (closed, or opened on another sale meanwhile)
    if (!res.ok) { $('sale-refund-sums').textContent = ''; fail(wrong(res)); return; }
    const { look, sale: fresh } = res.body, cur = fresh.currency;
    giving.sale = fresh; giving.look = look; giving.can = !!look.asked || fresh.can;
    $('sale-refund-who').textContent = `${whoOf(fresh.who)} — bought on ${day(fresh.at)} at ${hour(fresh.at)}`;
    $('sale-refund-sums').textContent = `Paid: ${money(look.paid, cur)}${look.back ? ` · already given back: ${money(look.back, cur)}` : ''} · can be given back: ${money(look.left, cur)}${look.asked ? ' (as Stripe has it, just now)' : ''}`;
    $('sale-refund-all-label').textContent = look.back ? `All that is left — ${money(look.left, cur)}` : `All of it — ${money(look.left, cur)}`;
    $('sale-refund-most').textContent = `(at most ${money(look.left, cur)})`;
    const month = $('sale-refund-month');
    month.hidden = !fresh.monthly;
    month.textContent = fresh.monthly ? `Paid by the month: this gives back its latest payment — ${money(look.paid, cur)}, paid on ${day(look.at)}. The months before it stay paid (give them back in Stripe, if ever you must).` : '';
    $('sale-refund-how').disabled = false;
    if (look.error) fail(look.error);
    if (look.disputed) fail('The buyer\'s bank is disputing this payment: it cannot be given back while that runs. Answer the dispute in Stripe.');
    else if (!look.left) fail('Nothing is left of this payment to give back.');
    showPlan();
    if (look.error) errBox.hidden = false, errBox.textContent = look.error;
  }
  for (const id of ['sale-refund-all', 'sale-refund-part', 'sale-refund-keep']) $(id).addEventListener('change', showPlan);
  amountBox.addEventListener('input', () => { $('sale-refund-part').checked = true; showPlan(); });
  amountBox.addEventListener('focus', () => { $('sale-refund-part').checked = true; showPlan(); });
  $('sale-refund-cancel').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { giving = null; });

  $('sale-refund-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!giving?.look || giving.busy || go.disabled) return;
    const g = giving, all = $('sale-refund-all').checked, sum = all ? g.look.left : centsOf(amountBox.value), keep = $('sale-refund-keep').checked && !$('sale-refund-keep-row').hidden;
    // (the button is dead from the first click to the answer: a second click sends nothing)
    g.busy = true; go.disabled = true; go.textContent = 'Asking Stripe…';
    fail('');
    const res = await api('/api/sales', { method: 'POST', body: { refund: g.sale.id, ...(all ? { all: true } : { amount: sum }), reason: $('sale-refund-reason').value.trim(), keep, token: g.token } });
    if (giving !== g) { if (res.ok) load(); return; } // (the dialog was closed while Stripe was asked: the list says what became of it)
    g.busy = false;
    if (!res.ok) {
      // (refused: Stripe did nothing — a new try is a new intention; no answer: nobody knows — the same one is said again)
      if (res.body?.refused || res.status === 400) g.token = draw16();
      fail(wrong(res));
      if (res.body?.sale) { g.sale = res.body.sale; }
      showPlan();
      if (res.status === 409 && !res.body?.refused && !res.body?.busy) { const again = await api(`/api/sales?look=${encodeURIComponent(g.sale.id)}`); if (giving === g && again.ok) { g.look = again.body.look; g.sale = again.body.sale; showPlan(); fail(wrong(res)); } }
      load();
      return;
    }
    const r = res.body, cur = r.sale?.currency;
    dialog.close();
    const done = r.again ? 'This refund was made already: nothing more was given back.'
      : `Given back: ${money(r.refunded, cur)}${r.full ? (r.took ? ' — and what was bought is taken back' : r.kept ? ' — they keep what they bought' : '') : ' — nothing else changes'}${r.stopped ? '; its subscription is cancelled' : ''}.`;
    const care = [r.unstopped && `Stripe would not stop its subscription (${r.unstopped}): cancel it in Stripe, or it goes on being charged.`, r.uncredited && `Its invoice still wants a credit note (Stripe: ${r.uncredited}): make it in Stripe, without refunding again.`, r.untaken && `What was bought could not be taken back (${r.untaken}).`].filter(Boolean).join(' ');
    toast(care ? `${done} ${care}` : done, !!care);
    load();
  };

  // ---- the tab: its name, and the list read when its section is shown (admin.js builds the tabs and hides the sections)
  const tabs = $('tabs');
  const name = () => { const b = tabs?.querySelector('button[data-tab="sales"]'); if (b && b.textContent !== 'Sales') b.textContent = 'Sales'; };
  if (tabs) new MutationObserver(name).observe(tabs, { childList: true });
  name();
  // (shown: its section is not hidden, nor the office round it, and a key was given — looked at each time admin.js
  // opens a tab: it marks the tab's button, even when this section was never hidden, the page opened on #sales)
  let shown = false;
  const office = $('office');
  const look = () => { name(); const now = !section.hidden && !office?.hidden && !!key(); if (now && !shown) { found = $('sales-find').value.trim(); load(); } shown = now; };
  new MutationObserver(look).observe(office || section, { subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  look();
})();
