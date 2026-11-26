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
    boats: ['Harbor Heaven', 'Radio-controlled boats racing on the Great Pond: three laps against three others.'],
    hill: ['Jump the Logs', 'Up a long slope while logs, barrels and boulders roll down it — a start every ten seconds.'],
    crack: ['Bouncy Rock', 'Up a cleft between two needles of rock in the sea, from wall to wall.'],
    hollow: ['The Nuclear Cave', 'A race flown under the ground: one lap of a great cave where waste was buried, against the clock.'],
    waves: ['Big Tsunami', 'A bank of sand off the north beach, and the sea that comes in: one jumps what comes, for as long as one can.'],
    lava: ['No Touch Lava!', 'A volcano off the head of the pier: basalt columns, and lava that only rises — a round every ten seconds.'],
    hive: ["Bee Fly", 'Four combs over the sea: the wax one stands on gives way, and the bees take it apart too.'],
    flip: ['Mostly Up & Down', 'A machine along the pier: one runs by oneself and turns gravity over — a thousand metres, a start every ten seconds.'],
    spiral: ['Spiral of Death', 'A track wound round a tower in the bay: nineteen turns of obstacles, up to its bell — a save at every landing.'],
    cars: ['Karting Simulator', 'Radio-controlled cars raced on a table by the acid pond, seen from above: three laps against three others.'],
    golf: ['Balthazar Golf', 'Nine holes of crazy golf round the acid pond, each the valley in miniature.'],
    caves: ['The caves are safe places', 'In a cave, only those nearby hear what is said.'],
    stats: ['The game in figures', 'The counters, and the page /opendata.'],
    stars: ['Stars on the map', 'On: the big attractions wear a red star and their name on the map (M). Off: the map names its places only.'],
    sky: ['The sky villages', 'Hidden: nothing of them. Soon: their gate is there, closed. Open: everything.'],
    userRooms: ['Rooms made by players', 'Off: nothing of them — no card in the shop, no path that answers. On: an account can buy a room of its own ($59 a month): reached by its link only, fifty visitors, a password if its owner wants one, its own boards of scores.'],
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
  // (the rooms that players made — only while they are switched on: the path does not answer otherwise)
  async function showUserRooms() {
    const res = await api('/api/urooms');
    $('urooms-box').hidden = !res.ok;
    if (!res.ok) return;
    const box = $('urooms'), rooms = res.body.rooms || [];
    // (the rooms whose boards can be read on the page of the high scores)
    const pick = $('scores-room'), chosen = pick.value;
    pick.textContent = '';
    pick.append(Object.assign(el('option', '', 'the world'), { value: '' }));
    for (const r of rooms) pick.append(Object.assign(el('option', '', `${r.name} — of ${r.owner}`), { value: r.id }));
    pick.value = rooms.some((r) => r.id === chosen) ? chosen : '';
    $('scores-room-box').hidden = !rooms.length;
    if (!rooms.length) return empty(box, 'None yet.');
    box.textContent = '';
    for (const r of rooms) {
      const title = el('b', '', `${r.name} `);
      title.append(el('small', '', r.id));
      if (r.state !== 'live') title.append(el('span', 'tag old', 'asleep'));
      const acts = el('span', 'acts');
      // (its own boards of scores: on the page of the high scores, with this room chosen)
      acts.append(button('Its boards', 'ghost small', () => { $('scores-room').value = r.id; location.hash = 'scores'; open('scores'); }));
      if (r.state === 'live') acts.append(Object.assign(el('a', '', 'Open it'), { href: `/?room=${encodeURIComponent(r.id)}`, target: '_blank', rel: 'noopener' }));
      box.append(item(title, `of ${r.owner} · since ${when(r.since)} · ${r.locked ? 'has a password' : 'no password'}${r.state !== 'live' && r.until ? ` · freed ${when(r.until)}` : ''}`, acts));
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
    if (unit === 'strokes') { const s = score % 1000; return `${Math.floor(score / 1000)} strokes (${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')})`; } // (the golf: strokes × 1000 + seconds)
    return unit === 'ms' ? `${score} ms` : score.toLocaleString('en-US');
  };
  // (every board at once, a card each: the first five of the period chosen — the rest behind "Show all")
  let period = 'all';
  const shownInFull = new Set(), FIRST = 5;
  async function showScores(reload = true) {
    // (the boards of the world — or those of a room a player made, chosen above: scores made in it, by its members)
    const ofRoom = $('scores-room').value;
    if (reload || !boards) { const res = await api(`/api/scores?board=all${ofRoom ? `&room=${encodeURIComponent(ofRoom)}` : ''}`); if (!res.ok) return; boards = ofRoom ? res.body.room?.boards || {} : res.body.boards; }
    for (const b of $('period').querySelectorAll('button')) b.classList.toggle('on', b.dataset.period === period);
    const box = $('scores'), all = $('scores-empty').checked;
    box.textContent = '';
    for (const id of Object.keys(boards)) {
      const info = me.boards.find((b) => b.id === id), name = info?.name || id, unit = info?.unit || 'points', list = boards[id]?.tops?.[period] || [];
      if (!list.length && !all) continue;
      const card = el('div', 'board'), head = el('div', 'board-head');
      card.dataset.board = id;
      head.append(el('b', '', name), el('span', 'count', list.length ? `${list.length} line${list.length > 1 ? 's' : ''}` : 'nobody'));
      card.append(head);
      (shownInFull.has(id) ? list : list.slice(0, FIRST)).forEach((e, i) => {
        const row = el('div', 'line'), refuse = button('Refuse', 'danger small', async () => {
          if (!confirm(`Take "${e.name}" off the board of ${name} (its four lists)?`)) return;
          if (said(await api(`/api/scores?board=${encodeURIComponent(id)}&name=${encodeURIComponent(e.name)}`, { method: 'DELETE' }), 'Taken off.')) showScores();
        });
        refuse.title = 'Refuse this line: the name comes off the four lists of this board';
        row.append(el('span', 'rank', `${i + 1}`), el('span', 'who', e.name), el('span', 'num', scoreText(unit, e.score)), ofRoom ? el('span') : refuse); // (a room's boards are its owner's to empty)
        card.append(row);
      });
      if (list.length > FIRST) card.append(button(shownInFull.has(id) ? 'Show the first five' : `Show all ${list.length}`, 'ghost small', () => { if (shownInFull.has(id)) shownInFull.delete(id); else shownInFull.add(id); showScores(false); }));
      box.append(card);
    }
    if (!box.children.length) empty(box, ofRoom ? 'Nobody has scored in this room for this period.' : 'Nobody on any board for this period.');
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
  for (const b of $('period').querySelectorAll('button')) b.onclick = () => { period = b.dataset.period; showScores(false); };
  $('scores-room').onchange = () => showScores(true);
  // (an administrator tries a room of one's own out: one for the account this browser is signed in to, for nothing)
  $('uroom-open').onclick = async () => {
    const device = (() => { try { return localStorage.getItem('mmf.device') || ''; } catch { return ''; } })();
    if (!device) return toast('Open the game in this browser first, and sign in to your account (Settings).');
    const res = await api('/api/urooms', { method: 'POST', body: { open: true, device } });
    if (res.ok) { toast(res.body.fresh ? `"${res.body.room.name}" is open: its link is below, and in the game under "Who is here".` : `Your account already has a room: "${res.body.room.name}".`); showUserRooms(); } else said(res, '');
  };
  $('scores-empty').onchange = () => showScores(false);

  // ---------------------------------------------------------------------------------- the sponsors, the plaques
  const placeName = (id) => {
    const [type, rest] = id.split(':');
    if (type === 'board') { const [game, n] = rest.split('-'); return `The panel of ${me.boards.find((b) => b.id === game)?.name || game}${n ? ` (place ${n})` : ''}`; }
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
  // ------------------------------------------------------------------------------------------------- the chat
  // (what was said lately, the newest first: read again every few seconds while the tab is looked at)
  let chatLines = [], chatMore = false, tabNow = '';
  const clock = (ms) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const roomName = (r) => (r === 'main' ? 'Room 1' : /^main-\d+$/.test(r) ? `Room ${r.slice(5)}` : r || '—');
  function drawChat() {
    const box = $('chatlog'), find = $('chat-find').value.trim().toLowerCase();
    const list = find ? chatLines.filter((l) => `${l.name} ${l.text} ${roomName(l.room)} ${l.room}`.toLowerCase().includes(find)) : chatLines;
    $('chat-more').hidden = !chatMore;
    if (!list.length) return empty(box, chatLines.length ? 'Nothing matches among the lines read so far.' : 'Nothing was said lately.');
    box.textContent = '';
    for (const l of list) {
      const row = el('div', `said${l.muted ? ' muted' : ''}`);
      row.dataset.n = l.n;
      row.append(el('span', 'at', clock(l.t)), el('span', 'room', roomName(l.room)), el('b', 'who', l.name), el('span', 'what', l.text));
      if (l.to !== 'everyone') row.append(el('span', `tag ${l.to}`, l.to));
      if (l.muted) row.append(el('span', 'tag', 'kept out in silence'));
      if (l.filtered) row.append(el('span', 'tag', 'the others read ********'));
      box.append(row);
    }
  }
  async function showChat(older = false) {
    const res = await api(`/api/chatlog?limit=200${older && chatLines.length ? `&before=${chatLines[chatLines.length - 1].n}` : ''}`);
    if (!res.ok) return;
    const got = res.body.lines || [];
    if (older) { chatLines = chatLines.concat(got); chatMore = !!res.body.more; }
    else {
      // (the newest lines come first; what was read before, further down, stays on the page)
      const last = got.length ? got[got.length - 1].n : Infinity, kept = chatLines.filter((l) => l.n < last);
      if (!kept.length) chatMore = !!res.body.more;
      chatLines = got.concat(kept);
    }
    if (res.body.keeps) $('chat-keeps').textContent = `Kept: the last ${res.body.keeps.lines.toLocaleString('en-US')} lines, ${res.body.keeps.days} days at the most — the privacy page of the game says so.`;
    $('chat-forget').hidden = !me.owner;
    drawChat();
  }
  $('chat-find').oninput = drawChat;
  $('chat-more').onclick = () => showChat(true);
  $('chat-forget').onclick = async () => {
    if (!confirm('Forget every line of chat kept so far? This cannot be undone.')) return;
    if (said(await api('/api/chatlog', { method: 'DELETE' }), 'Forgotten.')) { chatLines = []; chatMore = false; showChat(); }
  };
  setInterval(() => { if (key && !document.hidden && tabNow === 'chat' && $('chat-live').checked) showChat(); }, 8000);

  const SHOW = { releases: showReleases, rooms: () => { showRooms(); showLimits(); showUserRooms(); }, scores: () => { showScores(); showFlagged(); }, chat: () => showChat(), sponsors: showSponsors, bans: showBans, figures: showFigures, admins: showAdmins };
  const NAMES = { releases: 'Releases', rooms: 'Rooms', scores: 'High scores', chat: 'Chat', sponsors: 'Sponsors & plaques', bans: 'Kept out', figures: 'Figures', admins: 'Administrators' };
  function open(tab) {
    tabNow = tab;
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
    $('who').textContent = me.owner ? 'You are the owner: everything is yours to decide.' : 'You are an administrator: the scores, the chat, the sponsors, the plaques and who is kept out. What is released is the owner\'s.';
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
