// 输入:键盘(WASD/方向键) + 触屏摇杆向量合并
export const Input = {
  keys: new Set(),
  touch: { x: 0, y: 0, active: false },
  init() {
    window.addEventListener('keydown', e => {
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  },
  setTouch(x, y, active) { this.touch.x = x; this.touch.y = y; this.touch.active = active; },
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
