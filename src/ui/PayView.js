// Paying without leaving the game: Stripe's own form (their "embedded Checkout": a frame of theirs — the game
// never sees a card) on a card laid over the game. It is only used when the server has been given Stripe's
// publishable key (see the README: "The shop"); otherwise, and whenever the form cannot be shown here (their
// script blocked, anything unexpected), the visitor is sent to Stripe's page as before.
//
// Stripe's script is fetched the first time somebody buys something, never before.
const SCRIPT = 'https://js.stripe.com/v3/';
let script = null;
const stripeJs = () => (script ||= new Promise((resolve, reject) => {
  if (window.Stripe) { resolve(window.Stripe); return; }
  const s = document.createElement('script');
  s.src = SCRIPT; s.async = true;
  s.onload = () => (window.Stripe ? resolve(window.Stripe) : reject(new Error('Stripe did not load')));
  s.onerror = () => { script = null; s.remove(); reject(new Error('Stripe could not be fetched')); };
  document.head.append(s);
}));
const within = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('too long')), ms))]);

export class PayView {
  /** @param root where the card is laid (the interface of the game) */
  constructor(root) {
    this.el = document.createElement('div');
    this.el.className = 'pay';
    this.el.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Payment">
        <div class="pay-bar"><b class="pay-what">Payment</b><span class="pay-mode"></span><button type="button" class="pay-x" aria-label="Close">×</button></div>
        <div class="pay-form"></div>
        <p class="pay-note">Paid on Stripe: the game never sees your card.</p>
      </div>`;
    root.append(this.el);
    this.form = this.el.querySelector('.pay-form');
    this.checkout = null;
    this.stripe = null;
    this.key = '';
    this.closed = null;
    this.el.querySelector('.pay-x').onclick = () => this.close();
    this.el.addEventListener('pointerdown', (e) => { if (e.target === this.el) this.close(); });
    this.el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.close(); });
    this.el.addEventListener('keyup', (e) => e.stopPropagation());
  }

  get isOpen() { return this.el.classList.contains('on'); }

  /**
   * Shows the form of the payment `secret` (what the server got from Stripe). `pk`: Stripe's publishable key;
   * `title`: what is being bought; `test`: no real money; `paid()`: called once the payment is made, the card
   * already closed; `closed()`: the visitor shut the card without paying. Resolves to true once the form is
   * up, to false when it cannot be shown here.
   */
  async open(pk, secret, { title = 'Payment', test = false, paid, closed } = {}) {
    try {
      this._drop();
      const Stripe = await within(stripeJs(), 12_000);
      if (!this.stripe || this.key !== pk) { this.stripe = Stripe(pk); this.key = pk; }
      let over = false;
      const checkout = await within(this.stripe.initEmbeddedCheckout({
        fetchClientSecret: async () => secret,
        onComplete: () => { if (over) return; over = true; this.closed = null; this.close(); paid?.(); },
      }), 20_000);
      this.checkout = checkout;
      this.closed = closed || null;
      this.el.querySelector('.pay-what').textContent = title;
      this.el.querySelector('.pay-mode').textContent = test ? 'Test mode: no real money' : '';
      this.el.classList.add('on');
      checkout.mount(this.form);
      return true;
    } catch (err) {
      console.warn('[pay]', err?.message || err);
      this._drop();
      this.el.classList.remove('on');
      return false;
    }
  }

  _drop() {
    try { this.checkout?.destroy(); } catch { /* already gone */ }
    this.checkout = null;
    this.form.textContent = '';
  }

  close() {
    if (!this.isOpen) return;
    this.el.classList.remove('on');
    this._drop();
    const closed = this.closed;
    this.closed = null;
    closed?.();
  }
}
