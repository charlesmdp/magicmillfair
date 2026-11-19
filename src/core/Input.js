// Unified input: keyboard (physical key positions, so AZERTY works like QWERTY),
// mouse (pointer lock or drag), touch (virtual stick + drag to look) and gamepad.

export class Input {
  constructor(target) {
    this.target = target;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.rise = 0;
    this.run = false;
    this.touch = { x: 0, y: 0, active: false, run: false }; // filled by the virtual stick
    this.touchRise = 0;
    this._look = { x: 0, y: 0 };
    this._zoom = 0;
    this._pressed = new Set(); // keys that went down since the last update()
    this._frame = new Set(); // the same, as seen by the current frame
    this.handlers = new Map();
    this.sensitivity = 0.0024;
    this.touchSensitivity = 0.0052;
    this.locked = false;
    this.enabled = true;
    this.isTouch = false;
    this._bind();
  }

  on(action, fn) {
    if (!this.handlers.has(action)) this.handlers.set(action, new Set());
    this.handlers.get(action).add(fn);
  }
  emit(action, payload) { this.handlers.get(action)?.forEach((fn) => fn(payload)); }

  _bind() {
    const t = this.target;
    const actions = { KeyF: 'camera', KeyP: 'perf', KeyM: 'map', KeyH: 'help', Escape: 'menu', KeyT: 'emote', Enter: 'chat', KeyR: 'respawn', KeyG: 'photo' };
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.repeat) return;
      this.keys.add(e.code);
      this._pressed.add(e.code);
      if (actions[e.code]) this.emit(actions[e.code]);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // mouse look: pointer lock when available, otherwise drag
    let dragging = false, lastX = 0, lastY = 0, moved = 0;
    t.addEventListener('mousedown', (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      dragging = true; lastX = e.clientX; lastY = e.clientY; moved = 0;
    });
    window.addEventListener('mouseup', () => { dragging = false; });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked) {
        this._look.x += e.movementX * this.sensitivity;
        this._look.y += e.movementY * this.sensitivity;
      } else if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
        this._look.x += dx * this.sensitivity * 1.25;
        this._look.y += dy * this.sensitivity * 1.25;
      }
    });
    t.addEventListener('contextmenu', (e) => e.preventDefault());
    t.addEventListener('dblclick', () => { if (!this.isTouch) this.requestLock(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === t;
      this.emit('lock', this.locked);
    });
    t.addEventListener('wheel', (e) => { this._zoom += Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 60); e.preventDefault(); }, { passive: false });

    // touch: any finger that does not start on a UI control looks around; two fingers pinch
    const looks = new Map();
    let pinch = 0;
    t.addEventListener('touchstart', (e) => {
      this.isTouch = true;
      for (const c of e.changedTouches) looks.set(c.identifier, { x: c.clientX, y: c.clientY });
      if (looks.size === 2) { const [a, b] = [...looks.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
      e.preventDefault();
    }, { passive: false });
    t.addEventListener('touchmove', (e) => {
      for (const c of e.changedTouches) {
        const p = looks.get(c.identifier);
        if (!p) continue;
        if (looks.size === 1) {
          this._look.x += (c.clientX - p.x) * this.touchSensitivity;
          this._look.y += (c.clientY - p.y) * this.touchSensitivity;
        }
        p.x = c.clientX; p.y = c.clientY;
      }
      if (looks.size === 2) {
        const [a, b] = [...looks.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this._zoom += (pinch - d) * 0.02;
        pinch = d;
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => { for (const c of e.changedTouches) looks.delete(c.identifier); };
    t.addEventListener('touchend', end);
    t.addEventListener('touchcancel', end);
  }

  requestLock() {
    try { this.target.requestPointerLock?.()?.catch?.(() => {}); } catch { /* not allowed right now */ }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  /** Did this key go down since the previous frame? (valid after update()) */
  pressed(code) { return this._frame.has(code); }

  /** Call once per frame before reading move/look. */
  update() {
    const k = this.keys;
    const fresh = this._pressed;
    this._pressed = this._frame;
    this._pressed.clear();
    this._frame = fresh;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    let rise = 0;
    if (k.has('Space') || k.has('KeyE')) rise += 1;
    if (k.has('KeyC') || k.has('KeyQ') || k.has('ControlLeft')) rise -= 1;
    let run = k.has('ShiftLeft') || k.has('ShiftRight');
    this.jump = fresh.has('Space') || this._touchJump === true;
    this._touchJump = false;

    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      x += dz(gp.axes[0]); y -= dz(gp.axes[1]);
      this._look.x += dz(gp.axes[2]) * 0.045; this._look.y += dz(gp.axes[3]) * 0.035;
      if (gp.buttons[0]?.pressed && !this._padJump) this.jump = true;
      this._padJump = gp.buttons[0]?.pressed;
      if (gp.buttons[10]?.pressed || gp.buttons[1]?.pressed || gp.buttons[7]?.value > 0.4) run = true;
      rise += (gp.buttons[7]?.value || 0) - (gp.buttons[6]?.value || 0);
      break;
    }
    if (this.touch.active) { x += this.touch.x; y += this.touch.y; run = run || this.touch.run; }
    rise += this.touchRise;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    if (!this.enabled) { x = 0; y = 0; rise = 0; this.jump = false; }
    this.move.x = x; this.move.y = y; this.rise = Math.max(-1, Math.min(1, rise)); this.run = run;
  }

  touchJump() { this._touchJump = true; }

  consumeLook() {
    const l = { x: this._look.x, y: this._look.y };
    this._look.x = 0; this._look.y = 0;
    return this.enabled ? l : { x: 0, y: 0 };
  }
  consumeZoom() { const z = this._zoom; this._zoom = 0; return z; }
}
