// ===== 🖥️ UI agent 名下:HUD(脏检查写 DOM / 掉血闪红 / 低血警示 / 武器图标栏) =====
import { drawSprite, spriteSize, SCALE } from '../sprites.js';
import { WEAPONS } from '../game/weapons.js';

// 小尺寸像素图标 canvas(关闭平滑、按 dpr 渲染保持锐利)
function spriteCanvas(name, px) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(px * dpr));
  c.height = c.width;
  c.style.width = px + 'px';
  c.style.height = px + 'px';
  c.style.imageRendering = 'pixelated';
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  try {
    const sz = spriteSize(name) || { w: 16, h: 16 };
    const m = Math.max(sz.w, sz.h, 1);
    const s = Math.min(1.6, px * 0.84 / (m * SCALE));
    x.save(); x.scale(dpr, dpr);
    drawSprite(x, name, px / 2, px / 2, { scale: s });
    x.restore();
  } catch { /* 精灵缺失时留空,不报错 */ }
  return c;
}

export const HUD = {
  g: null, el: {}, visible: false,
  // 脏检查缓存:值变化才写 DOM
  _hp: -1, _hpTxt: '', _hpW: '', _xpW: '', _sec: -1,
  _kills: -1, _gold: -1, _lv: -1,
  _bossOn: false, _bossRef: null, _bossName: '', _bossPct: -1,
  _wSig: '', _low: false, _flashT: 0,

  init(g) {
    this.g = g;
    ['hud', 'hud-hp', 'hud-hp-text', 'hud-xp', 'hud-timer', 'hud-kills', 'hud-gold', 'hud-level',
     'hud-boss', 'hud-boss-fill', 'hud-boss-name', 'hud-weapons']
      .forEach(id => this.el[id] = document.getElementById(id));
    this.el.hpBar = document.querySelector('#hud .bar.hp');
  },

  show(b) {
    this.visible = !!b;
    this.el.hud.classList.toggle('hidden', !this.visible);
    if (!this.visible) {
      this.el.hud.classList.remove('low-hp');
      this._low = false;
    } else {
      // 重进对局:重置缓存,强制首帧刷新
      this._hp = -1; this._hpTxt = ''; this._hpW = ''; this._xpW = ''; this._sec = -1;
      this._kills = -1; this._gold = -1; this._lv = -1;
      this._bossOn = false; this._bossRef = null; this._bossName = ''; this._bossPct = -1;
    }
  },

  update() {
    if (!this.visible) return;
    const g = this.g, p = g.player;
    if (!p || !p.stats) return;

    // ---- 生命 ----
    const hpMax = p.stats.maxHp || 1;
    const pct = Math.max(0, Math.min(1, p.hp / hpMax));
    if (p.hp < this._hp - 0.01) this._flash(); // 掉血才闪红(回血不闪)
    this._hp = p.hp;
    const w = (pct * 100).toFixed(1) + '%';
    if (w !== this._hpW) { this._hpW = w; this.el['hud-hp'].style.width = w; }
    const txt = Math.ceil(p.hp) + '/' + hpMax;
    if (txt !== this._hpTxt) { this._hpTxt = txt; this.el['hud-hp-text'].textContent = txt; }
    // 低血警示(<30%)
    const low = pct < 0.3 && p.hp > 0;
    if (low !== this._low) { this._low = low; this.el.hud.classList.toggle('low-hp', low); }

    // ---- 经验 ----
    const xw = (Math.max(0, Math.min(1, p.xpRatio())) * 100).toFixed(1) + '%';
    if (xw !== this._xpW) { this._xpW = xw; this.el['hud-xp'].style.width = xw; }

    // ---- 计时(每秒一次) ----
    const sec = Math.floor(g.time);
    if (sec !== this._sec) {
      this._sec = sec;
      this.el['hud-timer'].textContent =
        String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
    }

    // ---- 击杀 / 金币 / 等级 ----
    if (g.stats.kills !== this._kills) { this._kills = g.stats.kills; this.el['hud-kills'].textContent = '💀 ' + g.stats.kills; }
    if (g.stats.gold !== this._gold) { this._gold = g.stats.gold; this.el['hud-gold'].textContent = '🪙 ' + g.stats.gold; }
    if (p.level !== this._lv) { this._lv = p.level; this.el['hud-level'].textContent = 'Lv.' + p.level; }

    // ---- Boss 血条 ----
    const b = g.boss;
    const on = !!(b && !b.dead && b.maxHp);
    if (on !== this._bossOn) { this._bossOn = on; this.el['hud-boss'].classList.toggle('hidden', !on); }
    if (on) {
      if (b !== this._bossRef || b.name !== this._bossName) {
        this._bossRef = b; this._bossName = b.name;
        this.el['hud-boss-name'].textContent = b.name || '';
      }
      const bp = Math.round(Math.max(0, Math.min(1, b.hp / b.maxHp)) * 1000) / 10;
      if (bp !== this._bossPct) { this._bossPct = bp; this.el['hud-boss-fill'].style.width = bp + '%'; }
    } else this._bossRef = null;

    // ---- 武器槽(签名变化才重建:长度或等级变化) ----
    let sig = '';
    for (const wp of p.weapons) sig += wp.id + ':' + wp.lv + '|';
    if (sig !== this._wSig) {
      this._wSig = sig;
      const box = this.el['hud-weapons'];
      box.innerHTML = '';
      for (const wp of p.weapons) {
        const W = WEAPONS[wp.id];
        const slot = document.createElement('div');
        slot.className = 'wslot';
        slot.style.position = 'relative';
        slot.title = (W && W.name ? W.name : wp.id) + ' Lv.' + wp.lv;
        if (W && W.icon) slot.appendChild(spriteCanvas(W.icon, 24));
        const tag = document.createElement('span');
        tag.className = 'lv-tag';
        tag.style.cssText = 'position:absolute;right:-3px;bottom:-3px;font-size:10px;line-height:1;padding:2px 3px;background:#000;color:#fee761;border:1px solid #3a4466;';
        tag.textContent = wp.lv;
        slot.appendChild(tag);
        box.appendChild(slot);
      }
    }
  },

  // 掉血瞬时闪红:重启动画(120ms 后移除)
  _flash() {
    const bar = this.el.hpBar;
    if (!bar) return;
    clearTimeout(this._flashT);
    bar.classList.remove('dmg-flash');
    void bar.offsetWidth; // 强制重排以重启动画
    bar.classList.add('dmg-flash');
    this._flashT = setTimeout(() => bar.classList.remove('dmg-flash'), 120);
  },
};
