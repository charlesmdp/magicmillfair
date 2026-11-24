// What is released and which version is online, on the visitor's side. The server says so with its status
// (when the page opens, each time the relay is reached again, every few minutes) and tells every room at once
// when something changes. Three things can follow:
//   - a switch went on: the game applies it as it runs (`apply`: an extra is loaded, a gate opens);
//   - the version online is no longer this page's, a switch went off, or the owner asked everybody to refresh:
//     a bar says so, counts down, and the page loads itself again — at a safe moment only: never in the middle
//     of a game, a race, a timed climb, a payment or a sentence (`safe`); the visitor comes back at the same
//     spot, in the same room (`leave` keeps what it takes);
//   - back from a new version: what is new, once, from app/news.js.
import { NEWS } from './news.js';

const POLL_MS = 4 * 60_000; // the status is read again this often (and when the page is looked at again)
const COUNT = 45; // seconds between "a new version is ready" and the refresh
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const mem = {
  get(k, session) { try { return (session ? sessionStorage : localStorage).getItem(k); } catch { return null; } },
  set(k, v, session) { try { (session ? sessionStorage : localStorage).setItem(k, v); } catch { /* private mode */ } },
  del(k, session) { try { (session ? sessionStorage : localStorage).removeItem(k); } catch { /* private mode */ } },
};

export class Updates {
  /**
   * @param root where the bar and the card are laid (the interface of the game)
   * @param o build: this page's version ('' when it has none: nothing is compared); status(): asks the server
   *   again, resolves to what it says ({ release, build, refresh, time }) or null; now(): the server's clock (ms);
   *   safe(): may the page load itself again right now?; leave(): keeps where the visitor is, then reloads;
   *   apply(release, before): makes the switches true as the game runs — returns true when only a refresh can;
   *   count: seconds between the bar and the refresh (the tools ask for fewer)
   */
  constructor(root, { build = '', status, now = () => Date.now(), safe = () => true, leave = () => location.reload(), apply = () => false, count = COUNT } = {}) {
    Object.assign(this, { build, status, now, safe, leave, apply, count: Number.isFinite(count) && count >= 1 ? count : COUNT });
    this.loaded = now(); // (asked to refresh before that: this page already is the refreshed one)
    this.release = null; // the switches, once the server has said them
    this.live = ''; // the version online
    this.pending = null; // why a refresh is on its way ('version' | 'asked' | 'off')
    this.checked = 0;
    this.bar = el('div', 'update-bar');
    this.bar.setAttribute('role', 'status');
    this.bar.innerHTML = '<span class="update-dot" aria-hidden="true"></span><span class="update-text"></span><button type="button" class="update-now">Refresh now</button>';
    this.bar.querySelector('.update-now').onclick = () => this._go();
    root.append(this.bar);
    this.card = el('div', 'update-news');
    root.append(this.card);
  }

  /** Starts listening: `first` is what the server said when the page opened (null: no server, nothing to follow). */
  start(first) {
    if (!first) return this;
    this.loaded = this.now();
    this.hear(first);
    setInterval(() => this.check(), POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - this.checked > 60_000) this.check(); });
    return this;
  }

  /** Asks the server again (the relay was reached again, time has passed). */
  async check() {
    this.checked = Date.now();
    const said = this.status ? await this.status() : null;
    if (said) this.hear(said);
  }

  /** What the server says ({ release, build, refresh }), by its status or through the relay. */
  hear({ release, build, refresh } = {}) {
    if (release && typeof release === 'object') {
      const before = this.release;
      this.release = { ...release };
      let must = false;
      try { must = !!this.apply(this.release, before); } catch (err) { console.error('[release]', err); }
      if (must) this._ask('off');
    }
    if (typeof build === 'string' && build) {
      this.live = build;
      if (this.build && build !== this.build) this._ask('version');
    }
    if (Number.isFinite(refresh) && refresh > this.loaded) this._ask('asked');
  }

  /** The bar: why, a countdown, a button — then the refresh, when it is safe. */
  _ask(why) {
    if (this.pending) return;
    // (this page was already loaded again for that very version and still is not it — files kept somewhere
    // on the way: said, but nobody is sent round in circles)
    const tried = why === 'version' && mem.get('mmf.reloaded', true) === this.live;
    this.pending = why;
    const text = this.bar.querySelector('.update-text'), words = why === 'asked' ? 'The fair asks every page to refresh' : why === 'off' ? 'The fair has changed' : 'A new version of the fair is ready';
    this.bar.classList.add('on');
    if (tried) { text.textContent = `${words}. Refresh the page when you like.`; return; }
    let left = this.count;
    const tick = () => {
      if (!this.pending) return;
      if (left > 0) { text.textContent = `${words} — refreshing in ${left} s. You will come back right here.`; left--; this.timer = setTimeout(tick, 1000); return; }
      if (this.safe()) return this._go();
      text.textContent = `${words} — refreshing as soon as you have finished what you are doing.`;
      this.timer = setTimeout(tick, 1000);
    };
    tick();
  }

  _go() {
    clearTimeout(this.timer);
    if (this.pending === 'version') { mem.set('mmf.reloaded', this.live, true); mem.set('mmf.updated', '1', true); }
    this.pending = null;
    this.leave();
  }

  /**
   * Back from a new version (and only then): what is new, once — the latest day of app/news.js, unless it was
   * already shown. Call when the visitor is in the world again.
   */
  welcomeBack() {
    if (mem.get('mmf.updated', true) !== '1') return false;
    mem.del('mmf.updated', true);
    const day = NEWS[0];
    if (!day || mem.get('mmf.news') === day.date) return false;
    mem.set('mmf.news', day.date);
    this.showNews(day);
    return true;
  }

  showNews(day = NEWS[0]) {
    const card = this.card;
    card.textContent = '';
    const head = el('div', 'update-head');
    head.append(el('small', '', 'The fair was updated'), el('b', '', 'What’s new'), el('i', '', day.date));
    const list = el('ul');
    for (const [title, line] of day.items.slice(0, 6)) { const li = el('li'); li.append(el('b', '', title), el('span', '', line)); list.append(li); }
    const close = el('button', 'update-close', 'Got it');
    close.type = 'button';
    const shut = () => { card.classList.remove('on'); clearTimeout(this.newsTimer); };
    close.onclick = shut;
    card.append(head, list, close);
    card.classList.add('on');
    this.newsTimer = setTimeout(shut, 40_000);
  }
}
