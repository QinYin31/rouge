// 相机:平滑跟随 + 屏幕震动 + 自适应缩放
export class Camera {
  constructor() { this.x = 0; this.y = 0; this.zoom = 1; this.shakeT = 0; this.shakeDur = 0; this.shakeMag = 0; }
  resize(w, h) { this.zoom = Math.max(0.7, Math.min(2.4, Math.min(w, h) / 500)); }
  follow(px, py, dt) {
    const k = 1 - Math.pow(0.001, dt); // 平滑系数
    this.x += (px - this.x) * k; this.y += (py - this.y) * k;
  }
  snap(px, py) { this.x = px; this.y = py; }
  shake(mag, dur) { if (mag > this.shakeMag) { this.shakeMag = mag; this.shakeDur = dur; this.shakeT = dur; } }
  offset(w, h) {
    let ox = 0, oy = 0;
    if (this.shakeT > 0) {
      this.shakeT -= 1 / 60;
      const m = this.shakeMag * (this.shakeT / this.shakeDur);
      ox = (Math.random() * 2 - 1) * m; oy = (Math.random() * 2 - 1) * m;
      if (this.shakeT <= 0) { this.shakeMag = 0; }
    }
    return { ox, oy, zoom: this.zoom };
  }
  // 视野世界范围(用于地图/刷怪计算)
  viewRect(w, h) {
    const hw = w / 2 / this.zoom, hh = h / 2 / this.zoom;
    return { x0: this.x - hw, y0: this.y - hh, x1: this.x + hw, y1: this.y + hh };
  }
}
