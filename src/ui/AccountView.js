// The account, on a card of its own (Settings → Your account): signing in, making one, finding the way back in.
// It shows and it asks, nothing more: what is typed goes to the game (main.js), which talks to the server and
// answers with what went wrong, if anything — and the card says so where the eyes already are, under the
// field it is about.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

/** The same rule as the server's (server/accounts.js): 3 to 16 letters, digits, spaces, dashes or underscores. */
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} _-]{1,14}[\p{L}\p{N}]$/u;
const MAIL = /^[^\s@]{1,64}@[^\s@]{1,80}\.[^\s@]{2,}$/;
/** How good a password is, 0 to 4: its length first, then what it is made of. */
const strength = (p) => (p.length < 8 ? 0 : 1 + (p.length >= 12 ? 1 : 0) + (/[a-z]/.test(p) && /[A-Z]/.test(p) || /\d/.test(p) && /[^\d\s]/.test(p) ? 1 : 0) + (/[^A-Za-z0-9]/.test(p) && p.length >= 10 ? 1 : 0));
const WORDS = ['Too short: 8 characters at least', 'It will do', 'Good', 'Strong', 'Very strong'];
const TEXT = {
  login: { tab: 'Sign in', go: 'Sign in', busy: 'Signing in…' },
  create: { tab: 'Create an account', go: 'Create my account', busy: 'Creating it…' },
  reset: { tab: '', go: 'Set the new password', busy: 'One moment…' },
};

export class AccountView {
  /** @param root where the card is laid (the interface of the game) */
  constructor(root) {
    this.handlers = {};
    this.mode = 'login';
    this.mail = false;
    this.el = el('div', 'account');
    this.el.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Your account">
        <button type="button" class="x" aria-label="Close">×</button>
        <div class="head"><div class="badge" aria-hidden="true"></div><div><h2>Your account</h2><p class="lead">Keep what is yours, on every device you play from.</p></div></div>
        <ul class="perks"><li>What you bought</li><li>Your days in a row</li><li>Your robot</li></ul>
        <div class="tabs" role="tablist"><button type="button" role="tab" data-mode="login">Sign in</button><button type="button" role="tab" data-mode="create">Create an account</button></div>
        <form novalidate>
          <h3 class="card-title"></h3>
          <label class="f f-name"><span>Account name</span><input name="name" maxlength="16" autocomplete="username" autocapitalize="off" spellcheck="false"><small></small></label>
          <label class="f f-code"><span>Recovery code</span><input name="code" maxlength="20" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX"><small></small></label>
          <label class="f f-password"><span class="what">Password</span><span class="pw"><input name="password" type="password" maxlength="100"><button type="button" class="eye" aria-label="Show the password">Show</button></span><i class="meter" aria-hidden="true"><b></b></i><small></small></label>
          <label class="f f-again"><span>The password again</span><input name="again" type="password" maxlength="100" autocomplete="new-password"><small></small></label>
          <label class="f f-email"><span>E-mail <em>(optional)</em></span><input name="email" type="email" maxlength="120" autocomplete="email" spellcheck="false"><small>Only to send you a code if you forget the password.</small></label>
          <p class="error" role="alert"></p>
          <button class="submit" type="submit"></button>
          <p class="links"><button type="button" class="link forgot">Forgot the password?</button><button type="button" class="link mailcode">Send me a code by e-mail</button><button type="button" class="link back">Back to signing in</button></p>
        </form>
        <div class="done">
          <h3>Write this down</h3>
          <p class="why"></p>
          <code></code>
          <div class="done-row"><button type="button" class="copy">Copy it</button><button type="button" class="ok">I have written it down</button></div>
        </div>
        <p class="small">A name and a password: nothing else is needed, and nobody has to make one to play. The password itself is never kept — only a print of it that cannot be read back.</p>
      </div>`;
    root.append(this.el);
    const $ = (s) => this.el.querySelector(s);
    this.form = $('form');
    this.inputs = Object.fromEntries(['name', 'code', 'password', 'again', 'email'].map((k) => [k, this.form.elements[k]]));
    this.error = $('.error');
    this.go = $('.submit');
    this.sheet = $('.sheet');
    // nothing typed here reaches the game behind; Escape closes
    this.sheet.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') this.close(); });
    this.sheet.addEventListener('keyup', (e) => e.stopPropagation());
    this.el.addEventListener('pointerdown', (e) => { if (e.target === this.el) this.close(); });
    $('.x').onclick = () => this.close();
    for (const b of this.el.querySelectorAll('.tabs button')) b.onclick = () => this.show(b.dataset.mode);
    $('.forgot').onclick = () => this.show('reset');
    $('.back').onclick = () => this.show('login');
    $('.eye').onclick = (e) => { const p = this.inputs.password, on = p.type === 'password'; p.type = on ? 'text' : 'password'; this.inputs.again.type = p.type; e.currentTarget.textContent = on ? 'Hide' : 'Show'; p.focus(); };
    $('.mailcode').onclick = async (e) => {
      const name = this.inputs.name.value.trim();
      if (!NAME.test(name)) { this._hint('name', 'Type the name of the account first.'); this.inputs.name.focus(); return; }
      const b = e.currentTarget;
      b.disabled = true;
      const res = (await this.handlers.mailcode?.(name)) || {};
      b.disabled = false;
      this._say(res.error || 'If that account has an e-mail, a code is on its way to it. It is good for half an hour.', !res.error);
      if (!res.error) this.inputs.code.focus();
    };
    for (const k of Object.keys(this.inputs)) this.inputs[k].addEventListener('input', () => this._check(k));
    this.form.addEventListener('submit', (e) => { e.preventDefault(); this._submit(); });
    $('.copy').onclick = async (e) => { try { await navigator.clipboard.writeText($('.done code').textContent); e.currentTarget.textContent = 'Copied'; } catch { e.currentTarget.textContent = 'Select it and copy'; } };
    $('.ok').onclick = () => this.close();
  }

  /** 'submit': (mode, { name, password, code, email }) → { error } | { recovery } | {} ; 'mailcode': (name) → { error } | {} ; 'close'. */
  on(name, fn) { this.handlers[name] = fn; return this; }
  get isOpen() { return this.el.classList.contains('on'); }

  /** Opens the card. mode: 'login' | 'create' | 'reset'; name: what to put in the first field; mail: can the server send e-mails? */
  open({ mode = 'login', name = '', mail = false } = {}) {
    this.mail = mail;
    for (const k of Object.keys(this.inputs)) { this.inputs[k].value = ''; this._hint(k, ''); }
    this.inputs.name.value = name;
    this.inputs.password.type = 'password'; this.inputs.again.type = 'password';
    this.el.querySelector('.eye').textContent = 'Show';
    this.sheet.classList.remove('is-done');
    this.el.classList.add('on');
    this.show(mode);
  }

  close() {
    if (!this.isOpen) return;
    this.el.classList.remove('on');
    for (const k of ['password', 'again', 'code']) this.inputs[k].value = '';
    this.handlers.close?.();
  }

  /** One of the three faces of the card. */
  show(mode) {
    this.mode = mode;
    const t = TEXT[mode];
    this.sheet.dataset.mode = mode;
    this.sheet.classList.toggle('has-mail', this.mail);
    for (const b of this.el.querySelectorAll('.tabs button')) { const on = b.dataset.mode === mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); }
    this.el.querySelector('.card-title').textContent = mode === 'reset' ? 'A new password' : '';
    this.el.querySelector('.f-password .what').textContent = mode === 'reset' ? 'New password' : 'Password';
    this.el.querySelector('.f-code small').textContent = mode === 'reset' ? (this.mail ? 'The code you wrote down when the account was made — or the one sent to your e-mail.' : 'The code you wrote down when the account was made.') : '';
    this.inputs.password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    this.go.textContent = t.go;
    this.go.disabled = false;
    this._say('');
    for (const k of ['name', 'password', 'again', 'email']) this._check(k, true);
    (this.inputs.name.value ? this.inputs.password : this.inputs.name).focus();
  }

  _hint(key, text, good = false) {
    const row = this.inputs[key].closest('.f'), small = row.querySelector('small');
    if (key === 'email' && !text) { small.textContent = 'Only to send you a code if you forget the password.'; row.classList.remove('bad', 'good'); return; }
    if (key === 'code' && !text) { row.classList.remove('bad', 'good'); return; }
    small.textContent = text;
    row.classList.toggle('bad', !!text && !good);
    row.classList.toggle('good', !!text && good);
  }
  _say(text, good = false) { this.error.textContent = text; this.error.classList.toggle('good', good); }

  /** Looks at one field as it is typed (quiet: nothing is said of a field that is still empty). Returns whether it is right. */
  _check(key, quiet = false) {
    const v = this.inputs[key].value, making = this.mode !== 'login';
    if (key === 'name') {
      // (only a name that is being chosen is weighed: one that exists already is whatever it is)
      const ok = NAME.test(v.trim());
      this._hint('name', !v || this.mode !== 'create' ? '' : ok ? 'That will do nicely.' : '3 to 16 letters or digits (spaces, - and _ in the middle).', ok);
      return ok;
    }
    if (key === 'password') {
      const s = strength(v), meter = this.el.querySelector('.meter');
      meter.dataset.level = String(making && v ? s : -1);
      this._hint('password', !v || !making ? '' : WORDS[s], s > 0);
      if (this.inputs.again.value) this._check('again', quiet);
      return v.length >= 8;
    }
    if (key === 'again') {
      const ok = v === this.inputs.password.value;
      this._hint('again', !v || this.mode !== 'create' ? '' : ok ? 'The same: good.' : 'Not the same as above.', ok);
      return ok;
    }
    if (key === 'email') {
      const ok = !v.trim() || MAIL.test(v.trim());
      this._hint('email', ok ? '' : 'That does not look like an e-mail address.');
      return ok;
    }
    return true;
  }

  async _submit() {
    if (this.go.disabled) return;
    const mode = this.mode, I = this.inputs, name = I.name.value.trim();
    // what is plainly wrong is said at once, in its place
    if (!NAME.test(name)) { this._hint('name', mode === 'login' ? 'The name of your account, as you chose it.' : '3 to 16 letters or digits (spaces, - and _ in the middle).'); I.name.focus(); return; }
    if (mode === 'reset' && I.code.value.replace(/[^A-Za-z0-9]/g, '').length < 6) { this._hint('code', 'The code is needed.'); I.code.focus(); return; }
    if (I.password.value.length < 8) { this._hint('password', mode === 'login' ? 'Your password has 8 characters at least.' : WORDS[0]); I.password.focus(); return; }
    if (mode === 'create' && I.again.value !== I.password.value) { this._hint('again', 'Not the same as above.'); I.again.focus(); return; }
    if (mode === 'create' && this.mail && !this._check('email')) { I.email.focus(); return; }
    this._say('');
    this.go.disabled = true; this.go.textContent = TEXT[mode].busy;
    let res;
    try { res = (await this.handlers.submit?.(mode, { name, password: I.password.value, code: I.code.value.trim(), email: this.mail ? I.email.value.trim() : '' })) || {}; } catch { res = { error: 'It did not work. Try again.' }; }
    this.go.disabled = false; this.go.textContent = TEXT[mode].go;
    if (res.error) { this._say(res.error); return; }
    if (res.recovery) {
      // the code to keep: shown once, on its own
      this.el.querySelector('.done .why').textContent = `Your account "${res.name || name}" is made, and this browser is signed in. If you ever forget the password, this recovery code is the way back in. It is shown once: keep it somewhere safe.`;
      this.el.querySelector('.done code').textContent = res.recovery;
      this.el.querySelector('.copy').textContent = 'Copy it';
      this.sheet.classList.add('is-done');
      this.el.querySelector('.ok').focus();
      return;
    }
    this.close();
  }
}
