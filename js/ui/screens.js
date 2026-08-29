// ===== 🖥️ UI agent 名下:全部屏幕(菜单/选人/商店/升级三选一/暂停/结算) =====
import { CHARACTERS } from '../game/player.js';
import { SHOP_UPGRADES } from '../game/upgrades.js';
import { drawSprite, spriteSize, SCALE } from '../sprites.js';
import { SFX } from '../core/audio.js';

const SCREENS = ['screen-menu', 'screen-select', 'screen-shop', 'screen-levelup', 'screen-pause', 'screen-over'];
const TOGGLE_DEFS = [['sfx', '音效'], ['music', '音乐'], ['shake', '震动']];

// 小尺寸像素图标 canvas(names 依序尝试,第一个绘制成功的生效)
function spriteCanvas(names, px) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(px * dpr));
  c.height = c.width;
  c.style.width = px + 'px';
  c.style.height = px + 'px';
  c.style.imageRendering = 'pixelated';
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  for (const name of (Array.isArray(names) ? names : [names])) {
    try {
      const sz = spriteSize(name) || { w: 16, h: 16 };
      const m = Math.max(sz.w, sz.h, 1);
      const s = Math.min(1.6, px * 0.84 / (m * SCALE));
      x.save(); x.scale(dpr, dpr);
      drawSprite(x, name, px / 2, px / 2, { scale: s });
      x.restore();
      break;
    } catch { /* 尝试下一候选 */ }
  }
  return c;
}

// 统一按钮绑定:防连点(300ms 内忽略)+ 点击音效;onclick 赋值覆盖旧回调,防重复绑定
let _lastTap = -1e9;
function bindTap(el, fn) {
  el.onclick = () => {
    const now = performance.now();
    if (now - _lastTap < 300) return;
    _lastTap = now;
    SFX.play('click');
    fn();
  };
}

function fmtT(t) {
  t = Math.max(0, Math.floor(t || 0));
  return `${Math.floor(t / 60)}分${String(t % 60).padStart(2, '0')}秒`;
}
function mmss(t) {
  t = Math.max(0, Math.floor(t || 0));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// 设置开关:label > checkbox + span,美化交给 CSS
function buildToggles(container, data, onToggle) {
  container.innerHTML = '';
  for (const [key, label] of TOGGLE_DEFS) {
    const l = document.createElement('label');
    l.className = 'tg';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!data.settings[key];
    cb.addEventListener('change', () => { SFX.play('click'); onToggle(key, cb.checked); });
    const sp = document.createElement('span');
    sp.textContent = label;
    l.append(cb, sp);
    container.appendChild(l);
  }
}

export const Screens = {
  g: null, current: null, el: {},
  _lvKey: null, _lvHint: null, _pauseInfo: null, _selTok: 0,

  init(g) {
    this.g = g;
    for (const id of SCREENS) this.el[id] = document.getElementById(id);
  },

  show(id) {
    for (const k of SCREENS) this.el[k].classList.toggle('hidden', k !== id);
    this.current = id;
    this._unbindKeys();
  },

  hide() {
    for (const k of SCREENS) this.el[k].classList.add('hidden');
    this.current = null;
    this._unbindKeys();
  },

  _unbindKeys() {
    if (this._lvKey) { window.removeEventListener('keydown', this._lvKey); this._lvKey = null; }
  },

  // ---------- 主菜单 ----------
  buildMenu(cb) {
    const d = this.g.save.data, b = d.best;
    document.getElementById('menu-stats').innerHTML =
      `最佳纪录:存活 <b>${fmtT(b.time)}</b> · 击杀 <b>${b.kills}</b> · 等级 <b>${b.level}</b>${b.victory ? ' · 🏆已通关' : ''}` +
      `<br>总场次 <b>${d.totalRuns}</b> · 总击杀 <b>${d.totalKills}</b> · 金币 <b>🪙 ${d.gold}</b>`;
    bindTap(document.getElementById('btn-play'), cb.onPlay);
    bindTap(document.getElementById('btn-shop'), cb.onShop);
    buildToggles(document.getElementById('menu-toggles'), d, cb.onToggle);
    this.show('screen-menu');
  },

  // ---------- 选人(点击未解锁且金币足够 → 直接购买解锁后立即开局) ----------
  buildSelect(cb) {
    const d = this.g.save.data;
    const list = document.getElementById('char-list');
    list.innerHTML = '';
    const tok = ++this._selTok;

    for (const [id, c] of Object.entries(CHARACTERS)) {
      const unlocked = d.chars.includes(id);
      const card = document.createElement('button');
      card.className = 'card char-card' + (unlocked ? '' : ' locked');
      card.style.cssText = 'display:flex;align-items:center;gap:12px;width:100%;padding:10px;text-align:left;';
      card.appendChild(spriteCanvas(['hero_face_' + id, c.sprite + '_0'], 48)); // 头像,缺脸图回退全身像

      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      const attrs = [`生命 ${c.hp}`, `移速 ${Math.round(c.speed)}`];
      if (c.armor) attrs.push(`护甲 +${c.armor}`);
      if (c.cdMult && c.cdMult !== 1) attrs.push(`冷却 -${Math.round((1 - c.cdMult) * 100)}%`);
      if (c.magnet) attrs.push(`磁吸 +${c.magnet}`);
      const cost = document.createElement('div');
      cost.className = 'char-cost';

      const render = owned => {
        info.innerHTML =
          `<div class="char-name">${c.name}</div>` +
          `<div class="char-desc">${c.desc}</div>` +
          `<div class="char-attrs" style="font-size:12px;color:#8b9bb4;margin-top:2px;">${attrs.join(' · ')}</div>`;
        cost.innerHTML = owned ? '✔ 可用'
          : `🔒 ${c.cost} 金币${d.gold >= c.cost ? ' · 点击解锁' : ' · 金币不足'}`;
        info.appendChild(cost);
      };
      render(unlocked);
      card.appendChild(info);

      let owned = unlocked, picked = false;
      bindTap(card, () => {
        if (picked) return;
        if (owned) { picked = true; cb.onPick(id, true); return; }
        if (d.gold >= c.cost) {
          // 直接购买解锁:扣款 + 存档 + 音效
          d.gold -= c.cost;
          d.chars.push(id);
          this.g.save.commit();
          SFX.play('coin');
          owned = true;
          card.classList.remove('locked');
          render(true);
          // 短暂展示解锁状态,再立即以此角色开局
          setTimeout(() => {
            if (!picked && this.current === 'screen-select' && tok === this._selTok) {
              picked = true;
              cb.onPick(id, true);
            }
          }, 380);
        } else {
          SFX.play('no');
          card.classList.remove('shake');
          void card.offsetWidth;
          card.classList.add('shake');
          setTimeout(() => card.classList.remove('shake'), 400);
        }
      });
      list.appendChild(card);
    }

    bindTap(document.getElementById('btn-select-back'), () => { this._selTok++; cb.onBack(); });
    this.show('screen-select');
  },

  // ---------- 永久强化商店 ----------
  buildShop(cb) {
    const d = this.g.save.data;
    document.getElementById('shop-gold').textContent = `🪙 ${d.gold}`;
    const list = document.getElementById('shop-list');
    list.innerHTML = '';

    for (const u of SHOP_UPGRADES) {
      const lv = Math.min(d.shop[u.id] || 0, u.max);
      const maxed = lv >= u.max;
      const price = maxed ? 0 : u.cost[lv];

      const row = document.createElement('div');
      row.className = 'shop-row';
      row.style.cssText = 'display:flex;align-items:center;gap:10px;text-align:left;';

      const ico = spriteCanvas([u.icon], 30);
      ico.style.flexShrink = '0';
      row.appendChild(ico);

      const mid = document.createElement('div');
      mid.style.cssText = 'flex:1;min-width:0;';
      mid.innerHTML =
        `<div class="shop-name">${u.name} <em style="font-style:normal;font-size:12px;color:#8b9bb4;">Lv.${lv}/${u.max}</em></div>` +
        `<div class="shop-desc" style="font-size:12px;color:#8b9bb4;">${u.desc}</div>`;
      // 等级 pips
      const pips = document.createElement('div');
      pips.className = 'pips';
      pips.style.cssText = 'display:flex;gap:3px;margin-top:4px;';
      for (let i = 0; i < u.max; i++) {
        const p = document.createElement('i');
        p.className = 'pip' + (i < lv ? ' on' : '');
        p.style.cssText = `width:8px;height:8px;display:inline-block;background:${i < lv ? '#fee761' : '#3a4466'};`;
        pips.appendChild(p);
      }
      mid.appendChild(pips);
      row.appendChild(mid);

      const btn = document.createElement('button');
      btn.className = 'btn shop-buy' + (maxed ? ' maxed' : '');
      const poor = !maxed && d.gold < price;
      btn.textContent = maxed ? '已满级' : poor ? '金币不足' : `🪙 ${price}`;
      btn.disabled = maxed || poor;
      if (poor) btn.style.cssText = 'opacity:.5;filter:grayscale(.55);';
      if (!maxed && !poor) bindTap(btn, () => cb.onBuy(u.id)); // 扣款与刷新由 main 处理
      row.appendChild(btn);

      list.appendChild(row);
    }

    bindTap(document.getElementById('btn-shop-back'), cb.onBack);
    this.show('screen-shop');
  },

  // ---------- 升级三选一 ----------
  showLevelUp(choices, onPick) {
    const list = this.el['screen-levelup'].querySelector('#levelup-cards') || document.getElementById('levelup-cards');
    list.innerHTML = '';
    let done = false;
    const pick = c => {
      if (done) return;
      done = true;
      this._unbindKeys();
      SFX.play('click');
      onPick(c);
    };

    choices.forEach((c, i) => {
      const card = document.createElement('button');
      card.className = 'card level-card';
      card.style.animationDelay = i * 70 + 'ms'; // 入场 stagger(配合 CSS 动画)
      const ico = document.createElement('div');
      ico.className = 'lv-icon';
      ico.appendChild(spriteCanvas([c.icon], 56));
      const nm = document.createElement('div');
      nm.className = 'lv-name';
      nm.textContent = c.name;
      const ds = document.createElement('div');
      ds.className = 'lv-desc';
      ds.style.cssText = 'font-size:12px;color:#8b9bb4;margin-top:2px;';
      ds.textContent = c.desc;
      card.append(ico, nm, ds);
      bindTap(card, () => pick(c));
      list.appendChild(card);
    });

    // 操作提示(一次性创建,复用节点)
    const panel = this.el['screen-levelup'].querySelector('.panel');
    if (panel) {
      if (!this._lvHint) {
        this._lvHint = document.createElement('p');
        this._lvHint.className = 'menu-stats';
        this._lvHint.textContent = ('ontouchstart' in window) ? '点击卡片完成选择' : '按 1 / 2 / 3 快速选择';
      }
      panel.appendChild(this._lvHint);
    }

    this.show('screen-levelup'); // 先切屏,再挂键盘(show 内会清理旧监听)
    this._lvKey = e => {
      const i = '123'.indexOf(e.key);
      if (i >= 0 && i < choices.length) pick(choices[i]);
    };
    window.addEventListener('keydown', this._lvKey);
  },

  // ---------- 暂停 ----------
  buildPause(cb) {
    bindTap(document.getElementById('btn-resume'), cb.onResume);
    bindTap(document.getElementById('btn-quit'), cb.onQuit);
    buildToggles(document.getElementById('pause-toggles'), this.g.save.data, cb.onToggle);
    const g = this.g;
    if (g.player) {
      if (!this._pauseInfo) {
        this._pauseInfo = document.createElement('p');
        this._pauseInfo.className = 'menu-stats';
      }
      this._pauseInfo.textContent = `已坚持 ${mmss(g.time)} · 击杀 ${g.stats.kills} · Lv.${g.player.level}`;
      const h2 = this.el['screen-pause'].querySelector('h2');
      if (h2) h2.insertAdjacentElement('afterend', this._pauseInfo);
    }
    this.show('screen-pause');
  },

  // ---------- 结算 ----------
  showResult(stats, cb) {
    // 胜利/失败主题类名交给 CSS
    const panel = this.el['screen-over'].querySelector('.panel');
    if (panel) {
      panel.classList.remove('victory', 'defeat');
      panel.classList.add(cb.victory ? 'victory' : 'defeat');
    }
    document.getElementById('over-title').textContent = cb.victory ? '🏆 通关胜利!' : '💀 你倒下了';

    // 网格化数据(主流程在结算前已把纪录写入存档,数值追平/超过即为新纪录)
    const d = this.g.save.data;
    const cells = [
      { v: fmtT(stats.time), l: '存活时间', rec: d.best.time > 0 && Math.floor(stats.time) >= d.best.time },
      { v: String(stats.kills), l: '击杀', rec: d.best.kills > 0 && stats.kills >= d.best.kills },
      { v: 'Lv.' + stats.level, l: '等级', rec: d.best.level > 0 && stats.level >= d.best.level },
      { v: '🪙 ' + stats.gold, l: '获得金币', rec: false },
    ];
    const ov = document.getElementById('over-stats');
    ov.innerHTML = '';
    ov.style.display = 'grid';
    ov.style.gridTemplateColumns = 'repeat(2, 1fr)';
    ov.style.gap = '10px';
    for (const c of cells) {
      const cell = document.createElement('div');
      cell.className = 'ostat';
      const v = document.createElement('div');
      v.className = 'ostat-v';
      v.style.cssText = 'font-size:20px;font-weight:700;';
      v.textContent = c.v + (c.rec ? ' ★' : '');
      const l = document.createElement('div');
      l.className = 'ostat-l';
      l.style.cssText = 'font-size:12px;color:#8b9bb4;';
      l.textContent = c.l + (c.rec ? '(新纪录)' : '');
      cell.append(v, l);
      ov.appendChild(cell);
    }

    document.getElementById('btn-endless').classList.toggle('hidden', !cb.endless);
    bindTap(document.getElementById('btn-again'), cb.onAgain);
    bindTap(document.getElementById('btn-endless'), cb.onEndless);
    bindTap(document.getElementById('btn-menu'), cb.onMenu);
    this.show('screen-over');
  },
};
