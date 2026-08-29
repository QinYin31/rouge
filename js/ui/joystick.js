// ===== 🖥️ UI agent 名下:固定底盘虚拟摇杆(触点即中心、不跟手漂移 / 12px 启动死区 / 单位向量全速) =====
import { Input } from '../core/input.js';

export const Joystick = {
  g: null, wrap: null, base: null, knob: null,
  id: null,            // 当前占用的 touch identifier(多点触控安全)
  ox: 0, oy: 0,        // 摇杆中心 = 按下触点(固定不动,move 阶段不再漂移)
  R: 48,               // 底盘视觉半径(knob 视觉 clamp 到此值)
  DEAD: 12,            // 启动死区(像素):超过即该方向全速,否则视为未推动
  vector: { x: 0, y: 0, active: false }, // 输出:单位长度方向向量(active=false 时为 0,0)
  _hideT: 0,

  init(g) {
    this.g = g;
    this.wrap = document.getElementById('joystick');
    this.base = document.getElementById('joy-base');
    this.knob = document.getElementById('joy-knob');
    this.base.style.opacity = '0';
    this.base.style.transition = 'opacity .16s';
    const opt = { passive: false };
    document.addEventListener('touchstart', e => this.down(e), opt);
    document.addEventListener('touchmove', e => this.move(e), opt);
    document.addEventListener('touchend', e => this.up(e), opt);
    document.addEventListener('touchcancel', e => this.up(e), opt);
    // 切后台防摇杆卡死
    window.addEventListener('blur', () => this.release());
    // 纯桌面环境:常驻隐藏
    if (!('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) this.wrap.classList.add('hidden');
  },

  down(e) {
    if (this.id !== null) return; // 已有摇杆占用,忽略后续手指
    for (const t of e.changedTouches) {
      const el = t.target;
      // 命中 UI(屏幕层/按钮/表单)则不启动摇杆
      if (el && el.closest && el.closest('.screen, button, a, input, label, select, textarea')) continue;
      this.id = t.identifier;
      this.ox = t.clientX; this.oy = t.clientY;
      this.vector.x = 0; this.vector.y = 0; this.vector.active = false;
      Input.setTouch(0, 0, false);
      this._showAt();
      e.preventDefault(); // 阻止合成鼠标事件与页面滚动
      break;
    }
  },

  move(e) {
    if (this.id === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== this.id) continue;
      const dx = t.clientX - this.ox, dy = t.clientY - this.oy;
      const m = Math.hypot(dx, dy);
      this._renderKnob(dx, dy); // knob 仅做视觉指向,始终 clamp 在固定底盘半径内
      if (m > this.DEAD) {
        // 固定底盘 + 全速:输出向量恒为单位长度,任何方向、任何距离都无内圈减速
        this.vector.x = dx / m; this.vector.y = dy / m;
        this.vector.active = true;
      } else {
        this.vector.x = 0; this.vector.y = 0;
        this.vector.active = false;
      }
      Input.setTouch(this.vector.x, this.vector.y, this.vector.active);
      e.preventDefault();
    }
  },

  up(e) {
    for (const t of e.changedTouches) {
      if (t.identifier !== this.id) continue;
      this.release();
    }
  },

  release() {
    this.id = null;
    this.vector.x = 0; this.vector.y = 0; this.vector.active = false;
    Input.setTouch(0, 0, false);
    this._fade();
  },

  _half() { return (this.base.offsetWidth || 110) / 2; },
  _placeBase() {
    const hw = this._half();
    this.base.style.left = (this.ox - hw) + 'px';
    this.base.style.top = (this.oy - hw) + 'px';
  },
  _renderKnob(dx, dy) {
    const m = Math.hypot(dx, dy);
    const k = m > this.R ? this.R / m : 1; // 视觉 clamp 到 R;逻辑只看 12px 死区,与视觉阈值解耦
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  },

  _showAt() {
    clearTimeout(this._hideT);
    this.wrap.classList.remove('hidden');
    this.base.style.opacity = '1';
    this._placeBase();
    this._renderKnob(0, 0);
  },

  _fade() {
    this.base.style.opacity = '0'; // 淡出,动画结束后再整体隐藏
    clearTimeout(this._hideT);
    this._hideT = setTimeout(() => { if (this.id === null) this.wrap.classList.add('hidden'); }, 180);
  },
};
