// ===== 🖥️ UI agent 名下:HUD(脏检查写 DOM / 掉血闪红 / 低血警示 / 武器图标栏 / 冲刺按钮 / 属性面板) =====
import { drawSprite, spriteSize, SCALE } from '../sprites.js?v=17';
import { WEAPONS } from '../game/weapons.js?v=17';
import { CHARACTERS } from '../game/player.js?v=17';
import { Input } from '../core/input.js?v=17';

// 属性面板行标签(顺序与 _updateStats 的 vals 一一对应)
const STAT_LABELS = ['攻击', '冷却', '护甲', '移速', '范围', '经验', '财运', '拾取'];

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
  _glyph: null, _cdSpan: null, _dashOn: null, _dashTxt: '', _dashT: -1e9, // 冲刺按钮
  _statVals: null, _statSig: '', _statT: -1e9, _statWide: false,     // 属性面板

  init(g) {
    this.g = g;
    ['hud', 'hud-hp', 'hud-hp-text', 'hud-xp', 'hud-timer', 'hud-kills', 'hud-gold', 'hud-level',
     'hud-boss', 'hud-boss-fill', 'hud-boss-name', 'hud-weapons']
      .forEach(id => this.el[id] = document.getElementById(id));
    this.el.hpBar = document.querySelector('#hud .bar.hp');
    this.el['btn-dash'] = document.getElementById('btn-dash');
    this._initDashBtn();
    this._initStatsPanel();
    window.addEventListener('resize', () => this._applyStatWidth());
  },

  show(b) {
    this.visible = !!b;
    this.el.hud.classList.toggle('hidden', !this.visible);
    // 冲刺按钮在 #hud 之外,需单独切换:仅对局中显示
    if (this.el['btn-dash']) this.el['btn-dash'].classList.toggle('hidden', !this.visible);
    if (!this.visible) {
      this.el.hud.classList.remove('low-hp');
      this._low = false;
      this._resetDashVisual();
    } else {
      // 重进对局:重置缓存,强制首帧刷新
      this._hp = -1; this._hpTxt = ''; this._hpW = ''; this._xpW = ''; this._sec = -1;
      this._kills = -1; this._gold = -1; this._lv = -1;
      this._bossOn = false; this._bossRef = null; this._bossName = ''; this._bossPct = -1;
      this._dashT = -1e9; this._dashOn = null; this._dashTxt = null; // 冲刺按钮强制首帧刷新
      this._statT = -1e9; this._statSig = '';                       // 属性面板强制刷新
      this._applyStatWidth();
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
    const on = !!(b && !b.dead && b.maxHp && b.hp > 0);
    if (on !== this._bossOn) { this._bossOn = on; this.el['hud-boss'].classList.toggle('hidden', !on); }
    if (on) {
      if (b !== this._bossRef || b.name !== this._bossName) {
        this._bossRef = b; this._bossName = b.name;
        this.el['hud-boss-name'].textContent = b.name || '';
      }
      const bp = Math.round(Math.max(0, Math.min(1, b.hp / b.maxHp)) * 1000) / 10;
      if (bp !== this._bossPct) { this._bossPct = bp; this.el['hud-boss-fill'].style.width = bp + '%'; }
    } else { this._bossRef = null; if (this._bossPct !== 0) { this._bossPct = 0; this.el['hud-boss-fill'].style.width = '0%'; } }

    // ---- 武器槽(签名变化才重建:长度或等级变化) ----
    let sig = '';
    for (const wp of p.weapons) sig += wp.id + ':' + wp.lv + (wp.evolved ? 'e' : '') + '|';
    if (sig !== this._wSig) {
      this._wSig = sig;
      const box = this.el['hud-weapons'];
      box.innerHTML = '';
      for (const wp of p.weapons) {
        const W = WEAPONS[wp.id];
        const slot = document.createElement('div');
        slot.className = 'wslot';
        slot.style.position = 'relative';
        const evo = wp.evolved && W && W.evo;
        slot.title = evo ? (W.evo.evoName || W.name) : ((W && W.name ? W.name : wp.id) + ' Lv.' + wp.lv);
        if (W && (evo ? W.evo.icon : W.icon)) slot.appendChild(spriteCanvas(evo ? W.evo.icon : W.icon, 24));
        const tag = document.createElement('span');
        tag.className = 'lv-tag';
        tag.style.cssText = 'position:absolute;right:-3px;bottom:-3px;font-size:10px;line-height:1;padding:2px 3px;background:#000;color:#fee761;border:1px solid #3a4466;';
        tag.textContent = wp.lv;
        slot.appendChild(tag);
        box.appendChild(slot);
      }
    }

    // ---- 冲刺按钮 / 属性面板(各自节流) ----
    const now = performance.now();
    this._updateDash(now);
    this._updateStats(now);
  },

  // ---------- 冲刺按钮 ----------
  _initDashBtn() {
    const btn = this.el['btn-dash'];
    if (!btn || btn.dataset.hudInit) return;
    btn.dataset.hudInit = '1';
    btn.title = '双击方向键冲刺';
    btn.style.touchAction = 'none'; // 快速连点不触发浏览器双击缩放
    // 重建内容:冷却进度环 + 「冲」印文 + 冷却秒数覆盖层(冷却时盖住印文)
    btn.innerHTML = '';
    const ring = document.createElement('span');
    ring.className = 'dash-ring';
    const glyph = document.createElement('span');
    glyph.className = 'dash-glyph';
    glyph.textContent = '冲';
    const cd = document.createElement('span');
    cd.className = 'dash-cd';
    cd.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;';
    btn.append(ring, glyph, cd);
    this._glyph = glyph; this._cdSpan = cd; this._dashRing = ring; this._dashMax = 0; this._ringPct = -1;
    const req = e => {
      e.preventDefault();
      if (this.g && this.g.paused) return; // 暂停/选卡期间不预存请求,避免恢复后误冲刺
      Input.requestDash();
    };
    btn.addEventListener('pointerdown', req); // 触摸按下即时响应
    btn.addEventListener('click', req);       // 键盘回车 / 兼容兜底
  },

  _updateDash(now) {
    const btn = this.el['btn-dash'];
    if (!btn || !this._cdSpan) return;
    if (now - this._dashT < 100) return; // ≤100ms 节流
    this._dashT = now;
    const p = this.g.player;
    const cd = p ? p.dashCd() : 0; // 只读战斗侧钳制后的剩余冷却,不自行计算
    const cooling = cd > 0;
    if (cooling !== this._dashOn) {
      this._dashOn = cooling;
      btn.classList.toggle('cooldown', cooling); // 就绪移除/冷却中添加,呼吸光↔褪色交给美术 CSS
      if (this._glyph) this._glyph.style.visibility = cooling ? 'hidden' : 'visible';
      if (!cooling) { this._dashMax = 0; this._ringPct = -1; if (this._dashRing) this._dashRing.style.background = 'none'; }
      else this._dashMax = 0;
    }
    if (cooling) this._dashMax = Math.max(this._dashMax, cd); // 记录本次冷却总量,供进度环比例
    const txt = cooling ? String(Math.ceil(cd)) : '';
    if (txt !== this._dashTxt) { this._dashTxt = txt; this._cdSpan.textContent = txt; }
    // 冷却进度环(conic 扫描,≥5% 步进才重写样式)
    if (this._dashRing) {
      const pct = cooling && this._dashMax > 0 ? Math.round(cd / this._dashMax * 20) / 20 : 0;
      if (pct !== this._ringPct) {
        this._ringPct = pct;
        this._dashRing.style.background = pct > 0
          ? `conic-gradient(rgba(43,43,43,.5) ${pct * 360}deg, transparent 0deg)`
          : 'none';
      }
    }
  },

  _resetDashVisual() {
    const btn = this.el['btn-dash'];
    if (btn) btn.classList.remove('cooldown');
    if (this._cdSpan) this._cdSpan.textContent = '';
    if (this._glyph) this._glyph.style.visibility = 'visible';
    if (this._dashRing) this._dashRing.style.background = 'none';
    this._dashOn = null; this._dashTxt = ''; this._dashT = -1e9; this._dashMax = 0; this._ringPct = -1;
  },

  // ---------- 属性面板(宽 ≥900px 显示;500ms 节流、值变化才写) ----------
  _initStatsPanel() {
    const hud = this.el.hud;
    if (!hud || this._statVals) return;
    const box = document.createElement('div');
    box.id = 'hud-stats';
    box.className = 'hud-stats';
    // 内联兜底样式:美术 CSS 尚无 .hud-stats 时也可用(不改 CSS,后续类样式可直接覆盖布局)
    box.style.cssText =
      'position:absolute;left:12px;top:calc(96px + env(safe-area-inset-top));z-index:5;' +
      'min-width:128px;padding:8px 12px;pointer-events:none;' +
      'background:rgba(236,229,211,.88);border:1px solid rgba(43,43,43,.5);border-radius:4px;' +
      'box-shadow:2px 2px 0 rgba(43,43,43,.2);font-size:13px;line-height:1.95;color:#2b2b2b;text-shadow:0 1px 0 rgba(242,236,221,.9);';
    this._statVals = [];
    for (const label of STAT_LABELS) {
      const row = document.createElement('div');
      row.className = 'stat-row';
      row.style.cssText = 'display:flex;justify-content:space-between;gap:16px;';
      const n = document.createElement('span');
      n.textContent = label;
      const v = document.createElement('span');
      v.style.cssText = 'font-weight:700;color:#b03a2e;'; // 朱砂数值
      row.append(n, v);
      box.appendChild(row);
      this._statVals.push(v);
    }
    hud.appendChild(box);
    this.el['hud-stats'] = box;
    this._statSig = '';
    this._statT = -1e9;
    this._applyStatWidth();
  },

  _applyStatWidth() {
    const box = this.el['hud-stats'];
    if (!box) return;
    this._statWide = window.innerWidth >= 900; // 移动端隐藏,不遮挡小屏视野
    box.classList.toggle('hidden', !this._statWide);
    if (this._statWide) this._statSig = ''; // 重新显示时强制刷新
  },

  _updateStats(now) {
    if (!this._statWide || !this._statVals) return;
    if (now - this._statT < 500) return;
    this._statT = now;
    const p = this.g.player;
    if (!p || !p.stats) return;
    const c = CHARACTERS[p.charId] || {}; // 基线取角色初始值;当前值含局内被动来自 p.stats
    const s = p.stats;
    const pct = (v, base) => {
      const d = Math.round((v / (base || 1) - 1) * 100);
      return (d >= 0 ? '+' : '') + d + '%';
    };
    const cdr = Math.round((1 / (s.cdMult || 1) - 1) * 100); // >0 = 冷却缩短
    const vals = [
      pct(s.might, c.might),                        // 攻击:相对本角色基线的 +%
      (cdr >= 0 ? '-' : '+') + Math.abs(cdr) + '%', // 冷却:负 % = 缩短
      '+' + Math.round(s.armor - (c.armor || 0)),   // 护甲:相对基线 +N
      pct(s.speed, c.speed),                        // 移速
      pct(s.areaMult, 1),                           // 范围
      pct(s.xpMult, 1),                             // 经验
      pct(s.goldMult, 1),                           // 财运
      String(Math.round(s.magnet)),                 // 拾取:绝对值(基线 60+char.magnet)
    ];
    const sig = vals.join('|');
    if (sig === this._statSig) return; // 值变化才写 DOM
    this._statSig = sig;
    for (let i = 0; i < vals.length; i++) this._statVals[i].textContent = vals[i];
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

