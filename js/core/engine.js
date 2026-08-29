// 核心引擎:固定步长主循环 / 实体数组 / 空间哈希 / 事件总线 / 相机集成
export const Bus = {
  map: new Map(),
  on(evt, fn) { (this.map.get(evt) || this.map.set(evt, []).get(evt)).push(fn); },
  emit(evt, data) { const l = this.map.get(evt); if (l) for (const fn of l) fn(data); }
};

export class SpatialHash {
  constructor(cell = 80) { this.cell = cell; this.m = new Map(); }
  clear() { this.m.clear(); }
  key(x, y) { return ((x / this.cell) | 0) * 73856093 ^ ((y / this.cell) | 0) * 19349663; }
  insert(e) {
    const k = this.key(e.x, e.y);
    let a = this.m.get(k); if (!a) this.m.set(k, a = []);
    a.push(e);
    // 跨格大实体:登记到相邻覆盖格
    const r = e.r || 0, c = this.cell;
    if (r > c / 2) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const k2 = this.key(e.x + dx * c, e.y + dy * c);
      let a2 = this.m.get(k2); if (!a2) this.m.set(k2, a2 = []); if (a2 !== a) a2.push(e);
    }
  }
  query(x, y, r, out) {
    out.length = 0; const c = this.cell;
    const x0 = ((x - r) / c) | 0, x1 = ((x + r) / c) | 0, y0 = ((y - r) / c) | 0, y1 = ((y + r) / c) | 0;
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) {
      const a = this.m.get((ix * 73856093) ^ (iy * 19349663));
      if (a) for (const e of a) if (out.indexOf(e) < 0) out.push(e);
    }
    return out;
  }
}

const LAYERS = ['ground', 'zones', 'under', 'enemies', 'player', 'projectiles', 'fx', 'texts'];

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.updaters = []; this.drawers = {}; LAYERS.forEach(l => this.drawers[l] = []);
    this.resets = [];
    this.enemies = []; this.projectiles = []; this.zones = []; this.pickups = [];
    this.grid = new SpatialHash(80);
    this.qbuf = [];
    this.player = null; this.stats = { kills: 0, gold: 0, level: 1, dmg: 0 };
    this.boss = null;
    this.time = 0; this.paused = 0; this.running = false;
    this.cam = null; // main 注入
    this.acc = 0; this.lastT = 0;
    this._bind = this._frame.bind(this);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
    if (this.cam) this.cam.resize(this.w, this.h);
  }
  addUpdater(fn) { this.updaters.push(fn); }
  addAlways(fn) { (this.always = this.always || []).push(fn); }
  addDrawer(layer, fn) { this.drawers[layer].push(fn); }
  addReset(fn) { this.resets.push(fn); }
  pause() { this.paused++; }
  resume() { this.paused = Math.max(0, this.paused - 1); }
  remove(arr, i) { arr[i] = arr[arr.length - 1]; arr.pop(); }
  shake(mag, dur) { this.cam && this.cam.shake(mag, dur); }

  addEnemy(e) { this.enemies.push(e); }
  addProjectile(p) { p.hitIds = p.hitIds || new Set(); this.projectiles.push(p); }
  addZone(z) { this.zones.push(z); }
  addPickup(p) { this.pickups.push(p); }
  addParticles(x, y, o) { /* 由 particles 模块注册到 Bus('fx') */ Bus.emit('fx-burst', { x, y, ...o }); }
  spawnText(x, y, str, o) { Bus.emit('fx-text', { x, y, str, ...o }); }

  reset() {
    this.enemies.length = 0; this.projectiles.length = 0; this.zones.length = 0; this.pickups.length = 0;
    this.time = 0; this.paused = 0; this.boss = null;
    this.stats = { kills: 0, gold: 0, level: 1, dmg: 0 };
    for (const fn of this.resets) fn();
  }

  start() { if (!this.running) { this.running = true; this.lastT = performance.now(); requestAnimationFrame(this._bind); } }
  _frame(t) {
    if (!this.running) return;
    requestAnimationFrame(this._bind);
    let dt = (t - this.lastT) / 1000; this.lastT = t;
    if (dt > 0.25) dt = 0.25;
    this.acc += dt;
    const step = 1 / 60;
    let steps = 0;
    while (this.acc >= step && steps < 4) {
      this.acc -= step; steps++;
      if (this.paused === 0) {
        this.time += step;
        for (const fn of this.updaters) fn(step);
      }
    }
    if (this.always) for (const fn of this.always) fn(dt);
    this._draw();
  }

  _draw() {
    const ctx = this.ctx, dpr = this.dpr, cam = this.cam;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0d17'; ctx.fillRect(0, 0, this.w, this.h);
    if (!cam) return;
    const { ox, oy, zoom } = cam.offset(this.w, this.h);
    ctx.translate(this.w / 2, this.h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x + ox, -cam.y + oy);
    for (const l of LAYERS) for (const fn of this.drawers[l]) fn(ctx);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
