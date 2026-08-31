// 输入:键盘(WASD/方向键) + 触屏摇杆向量合并
export const Input = {
  keys: new Set(),
  touch: { x: 0, y: 0, active: false },
  _lastTap: { code: '', t: 0 },
  _dashReq: false,
  init() {
    window.addEventListener('keydown', e => {
      if (!e.repeat) {
        const now = performance.now();
        const isDir = e.code.startsWith('Key') || e.code.startsWith('Arrow');
        // 电脑端空格冲刺：有菜单/升级/暂停层时不积压请求，避免恢复后误冲刺
        if (e.code === 'Space' && !document.querySelector('#screens .screen:not(.hidden)')) this.requestDash();
        if (isDir && e.code === this._lastTap.code && now - this._lastTap.t < 250) this.requestDash();
        if (isDir) this._lastTap = { code: e.code, t: now };
      }
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  },
  setTouch(x, y, active) { this.touch.x = x; this.touch.y = y; this.touch.active = active; },
  requestDash() { this._dashReq = true; },              // 冲刺按钮/双击方向调用
  takeDashRequest() { const r = this._dashReq; this._dashReq = false; return r; },
  move() {
    if (this.touch.active) {
      const m = Math.hypot(this.touch.x, this.touch.y);
      return m > 1 ? { x: this.touch.x / m, y: this.touch.y / m } : { x: this.touch.x, y: this.touch.y };
    }
    let x = 0, y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    const m = Math.hypot(x, y);
    return m > 0 ? { x: x / m, y: y / m } : { x: 0, y: 0 };
  }
};
