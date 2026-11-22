// The item shop: everything that is sold, on one bright screen. Shelves of cards — dressed by rarity, each
// with a picture of the visitor's own robot wearing the thing — and, for the card that is picked, a panel
// with what it is, what it costs and the button that buys it (or puts it on, once it is theirs).
//
// It knows nothing of payments or of the game: it is told what to show (open()), and says what was asked
// ('buy' id, 'equip' id, 'close').

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const SHELVES = [['featured', 'Featured'], ['gear', 'Gear'], ['hats', 'Hats'], ['paint', 'Paint jobs'], ['trails', 'Trails'], ['fun', 'Just for fun'], ['sponsor', 'Sponsor a game']];
const RARITY = { legendary: 'Legendary', epic: 'Epic', rare: 'Rare', uncommon: 'Uncommon' };

export class ShopView {
  /** @param root where the screen goes (the interface) · picture(id, w, h) → a canvas for that item, or null */
  constructor(root, picture) {
    this.picture = picture;
    this.handlers = {};
    this.items = [];
    this.picked = null;
    this.pictures = new Map();
    const box = (this.el = el('div', 'shop'));
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Item shop');
    box.innerHTML = `
      <div class="shop-rays" aria-hidden="true"></div>
      <header><h2>Item <em>shop</em></h2><span class="mode"></span><button class="x" type="button" aria-label="Close the shop">Close <kbd>Esc</kbd></button></header>
      <div class="shop-body"><div class="shelves"></div>
        <aside class="detail"><div class="stage"></div><div class="about"><small class="rar"></small><h3></h3><p class="blurb"></p><div class="acts"></div><p class="fine"></p></div></aside>
      </div>`;
    root.append(box);
    this.shelves = box.querySelector('.shelves');
    this.detail = box.querySelector('.detail');
    box.querySelector('.x').onclick = () => this.close();
    // while the shop is open the keys are its own, wherever the focus is: Escape closes it, nothing reaches the game
    // (the keys that come back up still do: a key held when the shop opened is let go of)
    window.addEventListener('keydown', (e) => { if (!this.isOpen) return; if (e.key === 'Escape') this.close(); e.stopPropagation(); }, true);
    for (const ev of ['mousedown', 'touchstart', 'wheel']) box.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
  }

  on(name, fn) { this.handlers[name] = fn; return this; }
  emit(name, ...a) { this.handlers[name]?.(...a); }
  get isOpen() { return this.el.classList.contains('on'); }

  close() {
    if (!this.isOpen) return;
    this.el.classList.remove('on');
    this.emit('close');
  }

  /**
   * Shows the shop. items: [{ id, name, group, rarity, blurb, cost (what the price tag says: '$9.99'), owned,
   * worn, wearable, featured }]; mode: 'test' | 'live' | null (nothing is sold: everything is the visitor's).
   */
  open({ items, mode, note = '' }) {
    this.items = items;
    this.mode = mode;
    this.note = note;
    this.el.querySelector('.mode').textContent = mode === 'test' ? 'Test mode · no real money' : mode ? '' : 'Free today · everything is yours';
    this._draw();
    this.el.classList.add('on');
    this.el.tabIndex = -1;
    this.el.focus({ preventScroll: true });
    const keep = this.picked && items.find((it) => it.id === this.picked);
    this._pick((keep || items.find((it) => it.featured) || items[0]).id);
  }

  /** The same shop with other facts (something was bought, put on, taken off). */
  refresh(items) {
    if (!this.isOpen) return;
    this.items = items;
    const top = this.shelves.scrollTop;
    this._draw();
    this.shelves.scrollTop = top;
    if (this.picked) this._pick(this.picked);
  }

  _picture(id, w, h) {
    const key = `${id}|${w}`;
    if (!this.pictures.has(key)) { let c = null; try { c = this.picture(id, w, h); } catch { c = null; } this.pictures.set(key, c); }
    const c = this.pictures.get(key);
    if (!c) return el('div', 'nopic');
    // (a canvas can only be in one place: each card gets a copy)
    const copy = document.createElement('canvas');
    copy.width = c.width; copy.height = c.height;
    copy.getContext('2d').drawImage(c, 0, 0);
    return copy;
  }

  /** Forget the pictures (the robot changed colour) — or only those whose item starts with `prefix`. */
  stale(prefix = '') { for (const key of [...this.pictures.keys()]) if (key.startsWith(prefix)) this.pictures.delete(key); }

  _card(it, big = false) {
    const b = el('button', `card ${it.rarity}${big ? ' big' : ''}${it.owned ? ' owned' : ''}${it.worn ? ' worn' : ''}`);
    b.type = 'button';
    b.dataset.item = it.id;
    b.append(el('span', 'shine'), this._picture(it.id, 300, 375));
    const foot = el('span', 'foot');
    foot.append(el('b', '', it.name), el('i', `price${it.owned ? ' has' : ''}`, it.worn ? 'Equipped' : it.owned ? 'Owned' : it.cost));
    b.append(el('small', 'rar', RARITY[it.rarity] || ''), foot);
    b.onclick = () => this._pick(it.id);
    return b;
  }

  _draw() {
    this.shelves.textContent = '';
    for (const [group, title] of SHELVES) {
      const list = group === 'featured' ? this.items.filter((it) => it.featured) : this.items.filter((it) => it.group === group);
      if (!list.length) continue;
      const shelf = el('section', `shelf shelf-${group}`);
      shelf.append(el('h3', '', title));
      const row = el('div', 'row');
      for (const it of list) row.append(this._card(it, group === 'featured'));
      shelf.append(row);
      this.shelves.append(shelf);
    }
  }

  _pick(id) {
    const it = this.items.find((x) => x.id === id);
    if (!it) return;
    this.picked = id;
    for (const c of this.shelves.querySelectorAll('.card')) c.classList.toggle('picked', c.dataset.item === id);
    const d = this.detail;
    d.className = `detail ${it.rarity}`;
    const stage = d.querySelector('.stage');
    stage.textContent = '';
    stage.append(el('span', 'shine'), this._picture(id, 420, 525));
    d.querySelector('.rar').textContent = RARITY[it.rarity] || '';
    d.querySelector('h3').textContent = it.name;
    d.querySelector('.blurb').textContent = it.blurb || '';
    const acts = d.querySelector('.acts');
    acts.textContent = '';
    const act = (label, cls, fn) => { const b = el('button', cls, label); b.type = 'button'; b.onclick = fn; acts.append(b); return b; };
    if (it.act) act(it.act, 'buy', () => this.emit('buy', id)); // (a place to sponsor: a bid)
    else if (!it.owned) act(`Buy · ${it.cost}`, 'buy', () => this.emit('buy', id));
    else if (it.wearable) act(it.worn ? 'Take it off' : 'Equip', it.worn ? 'off' : 'equip', () => this.emit('equip', id));
    else act('Yours', 'yours', () => {}).disabled = true;
    d.querySelector('.fine').textContent = it.fine || (it.owned ? (it.hint || 'It is yours for good.') : `${this.mode === 'test' ? 'Test mode: use the card 4242 4242 4242 4242 — no real money. ' : 'Paid once, on Stripe. '}${this.note}`);
  }
}
