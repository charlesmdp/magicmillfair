// The tab "People" of the back office (see index.html): everybody who has an account — the owner's alone. It asks
// everything of /api/people (server/people.js) with the key, changes nothing, and — like the rest of the page —
// never reads as HTML what somebody wrote: a name, an address are set as text.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const FILTERS = [['all', 'All the accounts'], ['email', 'With an e-mail'], ['password', 'A name and a password only'], ['google', 'Google']];
  const HOW = { password: 'a password', google: 'Google', both: 'a password, or Google', email: 'no password yet', none: 'nothing' };
  const HOW_TITLE = {
    password: 'They sign in with their name and their password.', google: 'Google opens this account: it has no password of its own.', both: 'They sign in with their password, or with Google.',
    email: 'Made with a name and an address: a link to choose a password was mailed to them, and they have not chosen one yet.', none: 'No password, no Google and no address: nobody can sign in to it any more.',
  };
  const state = { filter: 'all', q: '', page: 1 };
  let T = null, wired = false, asked = 0, typing = 0;

  // (a day, by the clock of the world — the year only when it is not this one)
  const day = (ms) => (ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC', ...(new Date(ms).getUTCFullYear() !== new Date().getUTCFullYear() && { year: 'numeric' }) }) : '—');
  const hour = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const many = (n, one, more = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : more}`;
  const country = (() => { let names = null; try { names = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { /* an old browser: the two letters */ } return (cc) => { try { return (cc && names?.of(cc)) || cc || ''; } catch { return cc || ''; } }; })();
  const query = (more = {}) => new URLSearchParams({ filter: state.filter, ...(state.q && { q: state.q }), ...more }).toString();

  /** The list is asked again (`fresh`: the accounts are read again on the server) and drawn. */
  async function load(fresh = false) {
    const n = ++asked, res = await T.api(`/api/people?${query({ page: String(state.page), ...(fresh && { fresh: '1' }) })}`);
    if (n !== asked) return; // (an answer that comes after a later question)
    if (!res.ok) { T.empty($('people'), res.body?.error || 'The accounts could not be read. Try again in a moment.'); return; }
    draw(res.body);
  }

  function draw(d) {
    state.page = d.page;
    // how many of each sort — and the sort that is shown
    const tabs = $('people-filters');
    tabs.textContent = '';
    for (const [id, label] of FILTERS) {
      const b = T.el('button', id === state.filter ? 'on' : '');
      b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(id === state.filter));
      b.append(T.el('b', '', (d.counts[id] ?? 0).toLocaleString('en-US')), T.el('span', '', label));
      b.onclick = () => { state.filter = id; state.page = 1; load(); };
      tabs.append(b);
    }
    $('people-note').textContent = `${d.counts.waiting ? `${many(d.counts.waiting, 'account has', 'accounts have')} no password yet: made with a name and an address, a link to choose one was mailed. ` : ''}The addresses were given to hear about an account — the privacy page promises no newsletter. This list was read at ${hour(d.at)}.`;
    $('people-copy').disabled = $('people-csv').disabled = !d.matched;

    const box = $('people');
    if (!d.accounts.length) T.empty(box, d.total ? 'No account matches.' : 'Nobody has made an account yet.');
    else {
      const table = T.el('table', 'ptable'), head = T.el('tr'), body = T.el('tbody');
      const COLS = ['Name', 'Signs in with', 'E-mail', 'Made', 'Last came', 'Days in a row', 'Owns', 'Browsers'];
      for (const c of COLS) head.append(T.el('th', '', c));
      const thead = T.el('thead'); thead.append(head); table.append(thead, body);
      for (const a of d.accounts) {
        const row = T.el('tr'), cell = (i, cls, text) => { const td = T.el('td', cls, text); td.dataset.label = COLS[i]; row.append(td); return td; };
        cell(0, 'name', a.name);
        const how = T.el('span', `how ${a.how}`, HOW[a.how] || a.how); how.title = HOW_TITLE[a.how] || '';
        cell(1, '').append(how);
        // (an address is written whole; where a line must be cut, it is cut after its @)
        const at = a.email.indexOf('@') + 1, addr = cell(2, a.email ? 'addr' : 'addr none', a.email ? '' : 'none given');
        if (a.email) addr.append(a.email.slice(0, at), T.el('wbr'), a.email.slice(at));
        cell(3, '', day(a.created)).title = `${new Date(a.created).toLocaleString('en-GB')} (your time)`;
        cell(4, '', day(a.last));
        cell(5, '', a.days ? `${a.days}${a.best > a.days ? ` (best: ${a.best})` : ''}` : a.best ? `— (best: ${a.best})` : '—').title = 'Their days in a row as they stood when they last came — a dash once the run is over.';
        cell(6, '', [a.items ? many(a.items, 'thing') : '', a.pass === 'paid' ? 'the Game Pass' : a.pass === 'gift' ? 'the Game Pass (a gift)' : ''].filter(Boolean).join(' + ') || 'nothing');
        cell(7, 'num', String(a.devices)).title = 'How many browsers are signed in to it.';
        body.append(row);
      }
      box.textContent = '';
      box.append(table);
    }
    // the pages
    const pages = $('people-pages'), first = (d.page - 1) * d.size + 1, last = first + d.accounts.length - 1;
    pages.textContent = '';
    if (d.pages > 1) {
      const newer = T.button('Newer', 'ghost small', () => { state.page = d.page - 1; return load(); }), older = T.button('Older', 'ghost small', () => { state.page = d.page + 1; return load(); });
      newer.disabled = d.page <= 1; older.disabled = d.page >= d.pages;
      pages.append(newer, older);
    }
    pages.append(T.el('span', 'hint', d.matched ? `${d.pages > 1 ? `Accounts ${first.toLocaleString('en-US')} to ${last.toLocaleString('en-US')} of ${d.matched.toLocaleString('en-US')} — page ${d.page} of ${d.pages}` : many(d.matched, 'account')}${d.matched !== d.total ? `, out of ${d.total.toLocaleString('en-US')} in all` : ''}.` : ''));

    // who never made an account: what the fair keeps of them, and no more
    const g = d.guests;
    const said = $('guests-said'), kept = T.el('ul', 'pkept'), guests = g.visits.length;
    for (const line of [
      `The last ${g.keeps} visits, whoever made them: when, the name the robot wore, the country and the town — to know whether anybody comes.`,
      'A score of the day, under the name chosen: on the boards of “High scores”, for that day only.',
      'What was said in the chat, with the name over the robot: under “Chat”, for fourteen days.',
      'Under the random name of the browser, and nothing else: its days in a row, what it bought — and, so that the figures count nobody twice, the day it was last counted and as what (a kind of device, a country, a colour).',
    ]) kept.append(T.el('li', '', line));
    said.textContent = '';
    said.append(
      T.el('p', 'hint', 'The fair keeps no list of the names that were only typed: its privacy page says that one can play without giving a name, an address or anything else. Without an account, a visitor is the random name their browser gave itself — the name over their robot stays in that browser, and the fair keeps no address of theirs (a guest who pays gives one to Stripe; the fair writes to it, and does not keep it). What it remembers all the same:'),
      kept,
      T.el('p', 'hint', `${g.people ? `The figures have counted ${many(g.people, 'browser')} since they were switched on, for ${many(d.total, 'account')}. ` : ''}${g.kept ? `Of the ${many(g.kept, 'visit')} remembered right now, ${guests === g.kept ? (guests === 1 ? 'it was' : 'all were') : `${guests} ${guests === 1 ? 'was' : 'were'}`} made from a browser signed in to no account${guests ? ' — the newest first' : ''}${g.signed && guests ? `; the ${g.signed === 1 ? 'other was' : `${g.signed} others were`} made by somebody on the list above` : ''}:` : ''}`),
    );
    const list = $('guests');
    if (!g.visits.length) T.empty(list, g.kept ? 'Every visit remembered right now was made from a browser signed in to an account.' : 'No visit is remembered yet.');
    else {
      list.textContent = '';
      for (const v of g.visits) list.append(T.item(v.name || 'No name', [T.when(v.at), [v.city, country(v.cc)].filter(Boolean).join(', ') || 'from somewhere the host could not tell', v.n > 1 ? `the game opened ${v.n} times in that visit` : ''].filter(Boolean).join(' · ')));
    }
  }

  /** A text is put in the clipboard (true when it is there). */
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* no clipboard here: the old way */ }
    const area = T.el('textarea'); area.value = text; area.setAttribute('readonly', ''); area.className = 'offscreen';
    document.body.append(area); area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }

  function wire() {
    wired = true;
    $('people-find').oninput = () => { clearTimeout(typing); typing = setTimeout(() => { state.q = $('people-find').value.trim(); state.page = 1; load(); }, 220); };
    $('people-fresh').onclick = () => load(true);
    $('people-copy').onclick = async () => {
      const res = await T.api(`/api/people?${query({ format: 'emails' })}`), emails = res.body?.emails || [];
      if (!res.ok) return T.said(res, '');
      if (!emails.length) return T.toast('None of the accounts shown has an address.');
      const done = await copy(emails.join(', '));
      T.toast(done ? `${many(emails.length, 'address', 'addresses')} copied: those of the accounts shown, every page of them.` : 'This browser would not let the page copy. Download the table instead.', !done);
    };
    $('people-csv').onclick = async () => {
      // (the table is asked with the key, like everything else — never by an address that would carry it — and handed to the browser as a file)
      try {
        const res = await fetch(`/api/people?${query({ format: 'csv' })}`, { cache: 'no-store', headers: { Authorization: `Bearer ${encodeURIComponent(T.key())}` } });
        if (!res.ok) throw new Error(String(res.status));
        const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'atomic-oasis-accounts.csv', url = URL.createObjectURL(await res.blob());
        const a = T.el('a'); a.href = url; a.download = name; a.className = 'offscreen';
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
        T.toast(`Downloaded: ${name} — the accounts shown, every page of them. It opens in any spreadsheet.`);
      } catch { T.toast('The table could not be made. Try again in a moment.', true); }
    };
  }

  (window.officeTabs ||= []).push({ id: 'people', name: 'People', show(tools) { T = tools; if (!wired) wire(); return load(true); } });
})();
