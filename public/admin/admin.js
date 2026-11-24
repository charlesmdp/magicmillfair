// The back office of the fair (see index.html). Everything is asked of the game's API with the key as a header;
// nothing a visitor wrote is ever read as HTML (it is set as text), and no other site is spoken to.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const KEEP = 'mmf.office.key';
  const mem = { get: (k, s) => { try { return (s ? sessionStorage : localStorage).getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } }, del: (k) => { try { sessionStorage.removeItem(k); } catch { /* private mode */ } } };
  let key = '', me = { owner: false, boards: [] }, blobs = [];

  /** A request to the API with the key: { ok, status, body }. Never throws. */
  async function api(path, { method = 'GET', body } = {}) {
    try {
      const res = await fetch(path, { method, cache: 'no-store', headers: { Authorization: `Bearer ${encodeURIComponent(key)}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) }, ...(body !== undefined && { body: JSON.stringify(body) }) });
      const json = /json/.test(res.headers.get('content-type') || '') ? await res.json().catch(() => null) : null;
      return { ok: res.ok, status: res.status, body: json };
    } catch { return { ok: false, status: 0, body: null }; }
  }
  let toastTimer = 0;
  function toast(text, bad = false) {
    const t = $('toast');
    t.textContent = text; t.classList.toggle('bad', bad); t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 4200);
  }
  const said = (res, done) => { if (res.ok) toast(done); else toast(res.body?.error || (res.status === 403 ? 'The server said no: this key may not do that.' : 'That did not work. Try again in a moment.'), true); return res.ok; };
  const when = (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const money = (cents) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
  const empty = (box, text) => { box.textContent = ''; box.append(el('div', 'empty', text)); };
  const button = (label, cls, run) => { const b = el('button', cls, label); b.type = 'button'; b.onclick = async () => { b.disabled = true; try { await run(); } finally { b.disabled = false; } }; return b; };
  const item = (title, small, ...acts) => {
    const row = el('div', 'item'), text = el('div', 'grow');
    text.append(typeof title === 'string' ? el('b', '', title) : title);
    if (small) text.append(el('small', '', small));
    row.append(text);
    if (acts.length) { const box = el('div', 'acts'); box.append(...acts); row.append(box); }
    return row;
  };
  /** A picture only an administrator may see (what awaits approval): fetched with the key, shown from memory. */
  async function picture(url) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${encodeURIComponent(key)}` } });
      if (!res.ok || !/^image\/(png|jpeg|webp)$/.test(res.headers.get('content-type') || '')) return null;
      const src = URL.createObjectURL(await res.blob());
      blobs.push(src);
      const img = el('img'); img.alt = ''; img.src = src;
      return img;
    } catch { return null; }
  }

  // ---------------------------------------------------------------------------------------------- the releases
  const SWITCH = {
    slide: ['Mostly Down — the water slide', 'The new ride, from the cliffs to the sea.'],
    pond: ['The Endless Pond', 'Three circuits on the Great Pond: fifteen seconds, twenty, then as long as one can.'],
    boats: ['The Little Regatta', 'Radio-controlled boats racing on the Great Pond: three laps against three others.'],
    hill: ['Uphill Battle', 'Up a long slope while logs, barrels and boulders roll down it — a start every ten seconds.'],
    crack: ['Between a Rock', 'Up a cleft between two needles of rock in the sea, from wall to wall.'],
    hollow: ['The Hollow Hill', 'A race flown under the ground: one lap of a great cave, against the clock.'],
    caves: ['The caves are safe places', 'In a cave, only those nearby hear what is said.'],
    stats: ['The game in figures', 'The counters, and the page /opendata.'],
    sky: ['The sky villages', 'Hidden: nothing of them. Soon: their gate is there, closed. Open: everything.'],
    userRooms: ['Rooms made by players', 'Not built yet: this switch does nothing so far.'],
    freeRooms: ['Rooms by address', 'Off: only the common rooms exist (you still get in anywhere). On: any name written in the address (?room=a-name) is a room of its own, free.'],
  };
  async function showReleases() {
    const res = await api('/api/release');
    if (!res.ok) return;
    const { release, refresh, build } = res.body, box = $('switches');
    $('fact-build').textContent = build || 'unknown';
    box.textContent = '';
    for (const [name, value] of Object.entries(release)) {
      const [title, hint] = SWITCH[name] || [name, ''];
      const row = el('div', 'switch'), text = el('div');
      text.append(el('b', '', title), el('small', '', hint));
      row.append(text);
      const set = async (v) => { if (said(await api('/api/release', { method: 'POST', body: { set: { [name]: v } } }), `${title}: ${v === true ? 'on' : v === false ? 'off' : v}. Every room has been told.`)) showReleases(); };
      if (typeof value === 'boolean') {
        const t = el('button', 'toggle'); t.type = 'button'; t.setAttribute('aria-pressed', String(value)); t.setAttribute('aria-label', title);
        t.onclick = () => set(!value);
        row.append(t);
      } else {
        const stages = el('div', 'stages');
        for (const s of ['hidden', 'soon', 'open']) { const b = el('button', s === value ? 'on' : '', s[0].toUpperCase() + s.slice(1)); b.type = 'button'; b.onclick = () => { if (s !== value) set(s); }; stages.append(b); }
        row.append(stages);
      }
      box.append(row);
    }
    $('refresh-note').textContent = refresh ? `Last asked: ${when(refresh)}.` : 'Never asked yet.';
  }
  $('refresh-all').onclick = async () => {
    if (!confirm('Ask every open page to load itself again? Each does it at a safe moment, and its visitor comes back at the same spot.')) return;
    if (said(await api('/api/release', { method: 'POST', body: { refresh: true } }), 'Asked: every page refreshes at its next safe moment.')) showReleases();
  };
  $('announce-form').onsubmit = async (e) => {
    e.preventDefault();
    const text = $('announce').value.trim();
    if (!text) return;
    const res = await api('/api/announce', { method: 'POST', body: { text } });
    if (said(res, 'Said.')) { $('announce-note').textContent = `"${res.body.said}" — heard in ${res.body.rooms} room${res.body.rooms === 1 ? '' : 's'}.`; $('announce').value = ''; }
  };

  // ------------------------------------------------------------------------------------------------- the rooms
  async function showRooms() {
    const res = await api('/api/rooms');
    if (!res.ok) return;
    const { rooms, players, old, build, rules, base } = res.body, box = $('rooms');
    $('fact-here').textContent = String(players); $('fact-old').textContent = String(old); if (build) $('fact-build').textContent = build;
    // (the rules of the door: shown as they stand — not while the owner is typing in them)
    if (rules && !$('rules-form').contains(document.activeElement)) {
      for (const k of ['max', 'open', 'start', 'low']) { $(`rule-${k}`).value = rules[k]; if (k === 'max' && base) $(`rule-${k}`).max = base.max; }
      $('rules-note').textContent = base ? `The usual: at most ${base.max}, a new room at ${base.open}, starting under ${base.start}, quiet at ${base.low}. "At most" can be lowered here, never raised above ${base.max}.` : '';
    }
    if (!rooms.length) return empty(box, 'Nobody is connected right now.');
    box.textContent = '';
    const PHASE = { starting: 'starting: every newcomer goes there', live: 'takes newcomers', quiet: 'quiet: takes no newcomer' };
    for (const r of rooms) {
      const title = el('b', '', r.label && r.label !== r.name ? `${r.label} ` : r.name);
      if (r.label && r.label !== r.name) title.append(el('small', '', r.name));
      if (r.old) title.append(Object.assign(el('span', 'tag old', `${r.old} on an older version`)));
      box.append(item(title, `${r.players} visitor${r.players === 1 ? '' : 's'}${r.phase ? ` · ${PHASE[r.phase] || r.phase}` : ' · a room of its own'}`, Object.assign(el('a', '', 'Open it'), { href: `/?room=${encodeURIComponent(r.name)}`, target: '_blank', rel: 'noopener' })));
    }
  }
  $('rules-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = {};
    for (const k of ['max', 'open', 'start', 'low']) if ($(`rule-${k}`).value !== '') body[k] = Number($(`rule-${k}`).value);
    const res = await api('/api/rooms/rules', { method: 'POST', body });
    if (said(res, 'The door follows these numbers from now on.')) { document.activeElement?.blur(); showRooms(); }
  };
  $('rules-reset').onclick = async () => { if (said(await api('/api/rooms/rules', { method: 'POST', body: { reset: true } }), 'Back to the usual numbers.')) showRooms(); };
  // (how many connections one address may have: in a room, in all, new ones a minute)
  async function showLimits() {
    const res = await api('/api/limits');
    if (!res.ok) return;
    const { limits, base, on } = res.body;
    if (!$('limits-form').contains(document.activeElement)) for (const k of ['room', 'total', 'minute']) $(`limit-${k}`).value = limits[k];
    $('limits-note').textContent = on ? `The usual: ${base.room} in one room, ${base.total} in all, ${base.minute} new ones a minute.` : 'Switched off on this server (ADDRESS_LIMITS=0): nothing is counted.';
  }
  $('limits-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = {};
    for (const k of ['room', 'total', 'minute']) if ($(`limit-${k}`).value !== '') body[k] = Number($(`limit-${k}`).value);
    if (said(await api('/api/limits', { method: 'POST', body }), 'The door counts with these numbers from now on.')) { document.activeElement?.blur(); showLimits(); }
  };
  $('limits-reset').onclick = async () => { if (said(await api('/api/limits', { method: 'POST', body: { reset: true } }), 'Back to the usual numbers.')) showLimits(); };

  // ------------------------------------------------------------------------------------------------ the scores
  let boards = null;
  const scoreText = (unit, score) => {
    if (unit === 'time') { const s = score / 1000, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; }
    return unit === 'ms' ? `${score} ms` : score.toLocaleString('en-US');
  };
  async function showScores(reload = true) {
    if (reload || !boards) { const res = await api('/api/scores?board=all'); if (!res.ok) return; boards = res.body.boards; }
    const pick = $('board'), was = pick.value;
    if (!pick.options.length || reload) {
      pick.textContent = '';
      for (const id of Object.keys(boards)) { const info = me.boards.find((b) => b.id === id); pick.append(Object.assign(el('option', '', info?.name || id), { value: id })); }
      if (was && boards[was]) pick.value = was;
    }
    const id = pick.value, list = boards[id]?.tops?.[$('period').value] || [], unit = me.boards.find((b) => b.id === id)?.unit || 'points', box = $('scores');
    if (!list.length) return empty(box, 'Nobody on this list.');
    box.textContent = '';
    list.forEach((e, i) => {
      const row = item(e.name, '', button('Refuse this line', 'danger small', async () => {
        if (!confirm(`Take "${e.name}" off the board of ${pick.selectedOptions[0].textContent} (its four lists)?`)) return;
        if (said(await api(`/api/scores?board=${encodeURIComponent(id)}&name=${encodeURIComponent(e.name)}`, { method: 'DELETE' }), 'Taken off.')) showScores();
      }));
      row.prepend(el('span', 'rank', `${i + 1}`));
      row.querySelector('.grow').after(el('span', 'num', scoreText(unit, e.score)));
      box.append(row);
    });
  }
  // (the scores the server played again and did not believe: the owner's to take, or to let go)
  async function showFlagged() {
    const res = await api('/api/flagged');
    if (!res.ok) return;
    const box = $('flagged'), list = res.body.flagged || [];
    if (!list.length) return empty(box, 'None: every great score came out of its game.');
    box.textContent = '';
    for (const f of list) {
      const info = me.boards.find((b) => b.id === f.board), decide = async (accept) => { if (said(await api('/api/flagged', { method: 'POST', body: { id: f.id, accept } }), accept ? 'On the board.' : 'Let go.')) { showFlagged(); if (accept) showScores(); } };
      const acts = el('span', 'row');
      acts.append(button('Take it', 'small', () => decide(true)), button('Let it go', 'ghost small', () => decide(false)));
      box.append(item(`${f.name} — ${info?.name || f.board}: ${scoreText(info?.unit || 'points', f.score)}`, `${f.why}${f.guest ? ' · no account' : ''} · ${when(f.at)}`, acts));
    }
  }
  $('board').onchange = () => showScores(false);
  $('period').onchange = () => showScores(false);

  // ---------------------------------------------------------------------------------- the sponsors, the plaques
  const placeName = (id) => {
    const [type, rest] = id.split(':');
    if (type === 'board') return `The panel of ${me.boards.find((b) => b.id === rest)?.name || rest}`;
    if (type === 'gondola') return `Gondola ${rest} of the big wheel`;
    if (type === 'tarp') return 'The backdrop of Bullseye Alley';
    if (type === 'village') return `The sky village "${rest}"`;
    if (type === 'plaque') return `Plaque no. ${rest}`;
    return id;
  };
  async function showSponsors() {
    const res = await api('/api/sponsors');
    if (!res.ok) return;
    for (const src of blobs.splice(0)) URL.revokeObjectURL(src);
    const { slots, refunds } = res.body, live = $('sponsors'), wait = $('plaques'), done = $('engraved'), back = $('refunds');
    live.textContent = wait.textContent = done.textContent = back.textContent = '';
    const down = (id, s) => {
      const acts = [];
      // (nothing is given back by itself: the owner decides — at once, or later from the list of refunds)
      const take = (refund) => async () => {
        if (!confirm(refund ? 'Take this down and give the money back?' : s.sub ? 'Take this down? Its subscription stops: nothing more is charged. What was paid is kept.' : s.bid ? 'Take this down? The money is kept — you can still give it back afterwards, from the list of refunds below.' : 'Take this down?')) return;
        const out = await api(`/api/sponsors?slot=${encodeURIComponent(id)}${refund ? '&refund=1' : ''}`, { method: 'DELETE' });
        if (said(out, `Taken down${out.body?.refunded ? ', refunded' : ''}${out.body?.stopped ? ', its subscription stopped' : ''}.`)) showSponsors();
      };
      acts.push(button('Take down', 'danger small', take(false)));
      if ((s.bid || s.sub) && me.owner) acts.push(button('Take down and refund', 'ghost small', take(true)));
      return acts;
    };
    for (const [id, s] of Object.entries(slots).sort((a, b) => (b[1].at || 0) - (a[1].at || 0))) {
      const plaque = id.startsWith('plaque:');
      if (s.draft) {
        // (what awaits approval: only plaques nowadays)
        const row = item(`${placeName(id)} — "${s.draft.title}"`, [s.draft.subtitle, s.draft.url].filter(Boolean).join(' · '),
          button('Accept', 'small', async () => { if (said(await api('/api/sponsors', { method: 'POST', body: { slot: id, approve: true } }), 'Accepted: it is shown to everyone.')) showSponsors(); }),
          button('Refuse', 'ghost small', async () => { if (said(await api('/api/sponsors', { method: 'POST', body: { slot: id, approve: false } }), 'Refused: nothing is shown.')) showSponsors(); }));
        if (s.draft.logo) picture(s.draft.logo).then((img) => { if (img) row.prepend(img); });
        (plaque ? wait : live).append(row);
        continue;
      }
      const title = el('b', '', `${placeName(id)}${s.title ? ` — "${s.title}"` : ''}`);
      if (s.state !== 'live') title.append(el('span', 'tag', 'paid, nothing shown yet'));
      const row = item(title, [s.subtitle, s.url, s.bid ? `bid ${money(s.bid)}` : s.sub ? 'paid by the month' : '', `since ${when(s.at)}`].filter(Boolean).join(' · '), ...down(id, s));
      if (s.logo) { const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.src = s.logo; row.prepend(img); }
      (plaque ? done : live).append(row);
    }
    if (!live.children.length) empty(live, 'No sponsor yet.');
    if (!wait.children.length) empty(wait, 'Nothing awaits your approval.');
    if (!done.children.length) empty(done, 'No plaque is engraved yet.');
    for (const r of refunds || []) {
      // (what was kept, or what Stripe refused to give back: the owner can give it back from here)
      const later = !r.ok && r.pay && me.owner ? [button(r.kept ? 'Refund now' : 'Try again', 'small', async () => {
        if (!confirm(`Give ${money(r.amount || 0)} back?`)) return;
        const out = await api('/api/sponsors', { method: 'POST', body: { refund: r.pay } });
        if (out.ok && !out.body?.refunded) toast('Stripe refused: to be done by hand in Stripe.', true); else said(out, 'Given back.');
        showSponsors();
      })] : [];
      back.append(item(`${money(r.amount || 0)} — ${r.why || ''}`, `${when(r.at)} · ${r.ok ? 'given back' : r.kept && !r.error ? 'kept: not given back' : `NOT given back: ${r.error || 'Stripe refused'} — to be done by hand in Stripe`}`, ...later));
    }
    if (!back.children.length) empty(back, 'No refund so far.');
  }

  // ---------------------------------------------------------------------------------------------- who is kept out
  async function showBans() {
    const res = await api('/api/bans');
    if (!res.ok) return;
    const box = $('bans'), list = res.body.bans || [];
    if (!list.length) return empty(box, 'Nobody is kept out.');
    box.textContent = '';
    for (const b of list) {
      const kind = b.kind === 'ip' ? 'ip' : b.kind === 'acct' ? 'acct' : 'dev';
      box.append(item(`${b.name || 'Somebody'} — ${kind === 'ip' ? 'address' : kind === 'acct' ? 'account' : 'browser'} ${b.key}`, `${b.quiet ? 'in silence · ' : ''}${b.until ? `until ${when(b.until)}` : 'for good'} · since ${when(b.at)}`,
        button(b.quiet ? 'Lift' : 'Let back in', 'ghost small', async () => { if (said(await api(`/api/bans?${kind}=${encodeURIComponent(b.key)}`, { method: 'DELETE' }), b.quiet ? 'Lifted: they are heard again.' : 'Let back in.')) showBans(); })));
    }
  }
  $('ban-form').onsubmit = async (e) => {
    e.preventDefault();
    const ip = $('ban-ip').value.trim(), dev = $('ban-dev').value.trim(), acct = $('ban-acct').value.trim(), quiet = $('ban-quiet').checked, err = $('ban-error');
    err.hidden = true;
    if (!ip && !dev && !acct) { err.textContent = 'An address, a browser identifier or the name of an account is needed (the first two are shown in "Who is here", in the game).'; err.hidden = false; return; }
    const res = await api('/api/bans', { method: 'POST', body: { ...(ip && { ip }), ...(dev && { dev }), ...(acct && { acct }), name: $('ban-name').value.trim() || acct, hours: Number($('ban-hours').value), ...(quiet && { quiet: true }) } });
    if (said(res, quiet ? 'Kept out in silence from now on (a visitor who is connected: from their next connection).' : 'Kept out from now on.')) { $('ban-ip').value = $('ban-dev').value = $('ban-acct').value = $('ban-name').value = ''; $('ban-quiet').checked = false; showBans(); }
  };

  // ------------------------------------------------------------------------------------------------- the figures
  async function showFigures() {
    const res = await api('/api/stats');
    const box = $('figures');
    if (!res.ok) return empty(box, 'The figures are not switched on on this server.');
    const f = res.body;
    box.textContent = '';
    for (const [value, label] of [[f.here, 'here now'], [f.today, 'today'], [f.people, 'visitors ever'], [`$${f.money}`, 'earned'], [f.passes, 'Game Passes sold'], [f.keys?.toLocaleString('en-US'), 'keys pressed'], [`${f.km} km`, 'walked'], [`${f.hours} h`, 'played']]) {
      const tile = el('div', 'tile'); tile.append(el('b', '', String(value ?? '—')), el('span', '', label)); box.append(tile);
    }
    $('fig-money').value = f.money; $('fig-passes').value = f.passes; $('fig-people').value = f.people;
  }
  $('figures-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = { money: Number($('fig-money').value), passes: Number($('fig-passes').value), people: Number($('fig-people').value) };
    if (![body.money, body.passes, body.people].every(Number.isFinite)) return;
    if (said(await api('/api/stats/set', { method: 'POST', body }), 'Set.')) { $('figures-note').textContent = 'These are now the figures the counting goes on from.'; showFigures(); }
  };

  // ----------------------------------------------------------------------------------------- the administrators
  async function showAdmins() {
    const res = await api('/api/admins');
    if (!res.ok) return;
    const box = $('admins'), list = res.body.admins || [];
    if (!list.length) return empty(box, 'No administrator has been named. (The owner is the one who holds ADMIN_KEY.)');
    box.textContent = '';
    for (const a of list) {
      box.append(item(a.name || 'Somebody', `named by ${a.by || '—'} · ${when(a.at)}`, ...(me.owner ? [button('Take the title away', 'danger small', async () => {
        if (!confirm(`Take the title away from ${a.name || 'this administrator'}?`)) return;
        if (said(await api(`/api/admins?id=${encodeURIComponent(a.id)}`, { method: 'DELETE' }), 'Done: that key no longer works.')) showAdmins();
      })] : [])));
    }
  }

  // ----------------------------------------------------------------------------------------- the office itself
  const SHOW = { releases: showReleases, rooms: () => { showRooms(); showLimits(); }, scores: () => { showScores(); showFlagged(); }, sponsors: showSponsors, bans: showBans, figures: showFigures, admins: showAdmins };
  const NAMES = { releases: 'Releases', rooms: 'Rooms', scores: 'High scores', sponsors: 'Sponsors & plaques', bans: 'Kept out', figures: 'Figures', admins: 'Administrators' };
  function open(tab) {
    for (const s of document.querySelectorAll('section[data-tab]')) s.hidden = s.dataset.tab !== tab || (s.hasAttribute('data-owner') && !me.owner);
    for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.tab === tab);
    SHOW[tab]?.();
    try { history.replaceState(null, '', `#${tab}`); } catch { /* a page of a file */ }
  }
  async function enter(tried) {
    key = tried.trim();
    const res = key ? await api('/api/admin') : { ok: false, status: 403 };
    if (!res.ok || !res.body?.ok) {
      key = '';
      mem.del(KEEP);
      const err = $('login-error');
      err.textContent = res.status === 0 ? 'The server cannot be reached.' : res.status === 404 ? 'There is no server behind this page.' : 'That key was not recognised.';
      err.hidden = !tried;
      return false;
    }
    mem.set(KEEP, key);
    me = { owner: res.body.owner === true, boards: Array.isArray(res.body.boards) ? res.body.boards : [] };
    $('login').hidden = true; $('office').hidden = false; $('facts').hidden = false;
    $('who').textContent = me.owner ? 'You are the owner: everything is yours to decide.' : 'You are an administrator: the scores, the sponsors, the plaques and who is kept out. What is released is the owner\'s.';
    const tabs = $('tabs');
    tabs.textContent = '';
    for (const s of document.querySelectorAll('section[data-tab]')) {
      if (s.hasAttribute('data-owner') && !me.owner) continue;
      const b = el('button', '', NAMES[s.dataset.tab]); b.type = 'button'; b.dataset.tab = s.dataset.tab; b.onclick = () => open(s.dataset.tab);
      tabs.append(b);
    }
    for (const f of document.querySelectorAll('form[data-owner]')) f.hidden = !me.owner;
    const asked = location.hash.slice(1), first = tabs.querySelector(`[data-tab="${CSS.escape(asked)}"]`) ? asked : tabs.firstChild.dataset.tab;
    showRooms(); // (the figures at the top of the page)
    if (me.owner) showReleases();
    open(first);
    return true;
  }
  $('login-form').onsubmit = (e) => { e.preventDefault(); enter($('key').value); $('key').value = ''; };
  $('signout').onclick = () => { mem.del(KEEP); location.reload(); };
  const inGame = mem.get('mmf.admin');
  if (inGame) { const b = $('use-game'); b.hidden = false; b.onclick = () => enter(inGame); }
  const kept = mem.get(KEEP, true);
  if (kept) enter(kept);
  // (the rooms and who is connected: read again now and then while the page is looked at)
  setInterval(() => { if (key && !document.hidden) showRooms(); }, 20000);
})();
