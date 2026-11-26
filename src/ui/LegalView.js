// The small print, on a card of its own: the terms of use, the privacy policy and the legal notice (their words are
// in app/legal.js), opened from the settings. Three tabs, a short version at the top of each, then the sections.
import { LEGAL, TERMS, PRIVACY, LEGAL_NOTICE } from '../app/legal.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export class LegalView {
  /** @param root where the card is laid (the interface of the game); `device`: () → the identifier of this browser */
  constructor(root, { device } = {}) {
    this.device = device || (() => '');
    this.handlers = {};
    this.el = el('div', 'legal');
    this.el.innerHTML = `
      <div class="legal-sheet" role="dialog" aria-modal="true" aria-label="Terms of use, privacy and legal notice">
        <button type="button" class="legal-x" aria-label="Close">×</button>
        <div class="legal-head"><div class="legal-badge" aria-hidden="true"></div><div><h2>The small print</h2><p class="legal-lead"></p></div></div>
        <div class="legal-tabs" role="tablist"><button type="button" role="tab" data-doc="terms">Terms of use</button><button type="button" role="tab" data-doc="privacy">Privacy</button><button type="button" role="tab" data-doc="notice">Legal notice</button></div>
        <div class="legal-body" tabindex="0"></div>
        <p class="legal-foot"></p>
      </div>`;
    root.append(this.el);
    this.body = this.el.querySelector('.legal-body');
    this.el.querySelector('.legal-x').onclick = () => this.close();
    this.el.addEventListener('pointerdown', (e) => { if (e.target === this.el) this.close(); });
    this.el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.close(); });
    this.el.addEventListener('keyup', (e) => e.stopPropagation());
    for (const ev of ['mousedown', 'touchstart', 'wheel']) this.el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    for (const b of this.el.querySelectorAll('.legal-tabs button')) b.onclick = () => this.show(b.dataset.doc);
  }

  on(name, fn) { this.handlers[name] = fn; return this; }
  get isOpen() { return this.el.classList.contains('on'); }

  /** Opens the card on 'terms', 'privacy' or 'notice'. */
  open(which = 'terms') {
    this.el.classList.add('on');
    this.show(which);
    this.body.focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.el.classList.remove('on');
    this.handlers.close?.();
  }

  show(which) {
    const doc = which === 'privacy' ? PRIVACY() : which === 'notice' ? LEGAL_NOTICE() : TERMS();
    for (const b of this.el.querySelectorAll('.legal-tabs button')) { const on = b.dataset.doc === which; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); }
    this.el.querySelector('.legal-lead').textContent = doc.lead;
    const body = this.body;
    body.textContent = '';
    body.scrollTop = 0;
    // the short version, on a card of its own
    const short = el('div', 'legal-short');
    short.append(el('b', '', 'The short version'));
    const list = el('ul');
    for (const line of doc.short) list.append(el('li', '', line));
    short.append(list);
    body.append(short);
    for (const s of doc.sections) {
      const sec = el('section');
      const h = el('h3');
      h.append(el('span', 'legal-ico', s.icon), s.title);
      sec.append(h);
      for (const part of s.text) {
        if (Array.isArray(part)) { const ul = el('ul'); for (const line of part) ul.append(el('li', '', line)); sec.append(ul); } else sec.append(el('p', '', part));
      }
      body.append(sec);
    }
    if (which === 'privacy') {
      const id = this.device();
      if (id) { const me = el('p', 'legal-id'); me.append('The identifier of this browser: ', el('code', '', id)); body.append(me); }
    }
    this.el.querySelector('.legal-foot').textContent = `Last updated: ${LEGAL.updated}`;
  }
}
