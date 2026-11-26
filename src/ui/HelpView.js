// Help and support, on a card of its own, opened from the settings: the contact form of Orka (orka.chat), the
// service that brings what is written in it to the fair. The form is a page of Orka's, framed: it is fetched only
// when the card is first opened — nothing of Orka's is loaded before —, and the game sends it nothing (no name, no
// address, no identifier): what reaches Orka is what the visitor types in it. It says how tall it is (a message
// `orka_form_resize`), and the frame follows. The address of the fair is under it, for whoever would rather write.
// (Privacy, app/legal.js, says so: keep the two together.)
import { LEGAL } from '../app/legal.js';

/** Where the form is, and the fair's own name at Orka (not a secret: it is in every page that shows the form). */
export const ORKA = { origin: 'https://widget.orka.chat', app: '6b0872839b5d97f318d3ab69' };

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export class HelpView {
  /** @param root where the card is laid (the interface of the game) */
  constructor(root) {
    this.handlers = {};
    this.frame = null;
    this.el = el('div', 'help');
    this.el.innerHTML = `
      <div class="help-sheet" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <button type="button" class="help-x" aria-label="Close">×</button>
        <div class="help-head"><div class="help-badge" aria-hidden="true">?</div><div><h2 id="help-title">Help &amp; support</h2><p class="help-lead">A question, something that went wrong, an idea for the fair? Write to us here.</p></div></div>
        <div class="help-body"><div class="help-form"><p class="help-wait">Opening the form…</p></div></div>
        <p class="help-foot"></p>
      </div>`;
    root.append(this.el);
    this.box = this.el.querySelector('.help-form');
    const foot = this.el.querySelector('.help-foot');
    if (LEGAL.contact) { foot.append('Or write to '); const a = el('a', '', LEGAL.contact); a.href = `mailto:${LEGAL.contact}`; foot.append(a, '. '); }
    foot.append('The form is Orka’s: what you write in it goes to Orka, which brings it to us (see Privacy).');
    this.el.querySelector('.help-x').onclick = () => this.close();
    this.el.addEventListener('pointerdown', (e) => { if (e.target === this.el) this.close(); });
    this.el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.close(); });
    this.el.addEventListener('keyup', (e) => e.stopPropagation());
    for (const ev of ['mousedown', 'touchstart', 'wheel']) this.el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    // (the form says how tall it is: only the form itself is listened to)
    window.addEventListener('message', (e) => {
      if (!this.frame || e.origin !== ORKA.origin || e.source !== this.frame.contentWindow || e.data?.action !== 'orka_form_resize') return;
      const h = Number(e.data?.data?.height);
      if (Number.isFinite(h) && h > 80 && h < 4000) this.frame.style.height = `${Math.ceil(h)}px`;
    });
  }

  on(name, fn) { this.handlers[name] = fn; return this; }
  get isOpen() { return this.el.classList.contains('on'); }

  /** Opens the card — and, the first time, fetches the form. */
  open() {
    this.el.classList.add('on');
    if (!this.frame) {
      const f = (this.frame = el('iframe', 'help-frame'));
      f.title = 'Contact form';
      f.src = `${ORKA.origin}/form.html?appId=${encodeURIComponent(ORKA.app)}`;
      f.referrerPolicy = 'origin'; // (Orka is told which site the form was opened on — not which page)
      f.addEventListener('load', () => this.box.classList.add('ready'));
      this.box.append(f);
    }
    this.el.querySelector('.help-x').focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.el.classList.remove('on');
    this.handlers.close?.();
  }
}
