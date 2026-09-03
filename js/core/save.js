// ===== 🖥️ UI agent 名下:本地存档(容错解析 + 字段校验 + 坏档回默认) =====
// 结构契约:{v,gold,chars,settings,best,totalRuns,totalKills}  key:'pxs_save'
const KEY = 'pxs_save';

// 角色白名单(与 CHARACTERS 一致,防脏数据混入)
const VALID_CHARS = ['knight', 'mage', 'ranger', 'white'];

function defaults() {
  return {
    v: 1, gold: 0, chars: ['knight'],
    settings: { sfx: true, music: true, shake: true, lowgfx: false, fpsShow: false },
    best: { time: 0, kills: 0, level: 0, victory: false },
    totalRuns: 0, totalKills: 0,
  };
}

// 宽松转非负整数;非法/NaN 回退 fb
function toInt(v, fb, max = 99999999) {
  v = Math.floor(Number(v));
  return Number.isFinite(v) ? Math.min(Math.max(v, 0), max) : fb;
}
function toBool(v, fb) { return typeof v === 'boolean' ? v : fb; }

// 把任意来源(可能损坏/被篡改/缺字段)的数据清洗为合法结构
function sanitize(raw) {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  d.gold = toInt(raw.gold, 0);
  if (Array.isArray(raw.chars)) {
    d.chars = [...new Set(raw.chars.filter(id => typeof id === 'string' && VALID_CHARS.includes(id)))];
  }
  if (!d.chars.length) d.chars = ['knight'];
  if (!d.chars.includes('knight')) d.chars.unshift('knight'); // 初始角色永远可用
  if (raw.settings && typeof raw.settings === 'object') {
    d.settings.sfx = toBool(raw.settings.sfx, true);
    d.settings.music = toBool(raw.settings.music, true);
    d.settings.shake = toBool(raw.settings.shake, true);
    d.settings.lowgfx = toBool(raw.settings.lowgfx, false);
    d.settings.fpsShow = toBool(raw.settings.fpsShow, false);
  }
  if (raw.best && typeof raw.best === 'object') {
    d.best.time = toInt(raw.best.time, 0);
    d.best.kills = toInt(raw.best.kills, 0);
    d.best.level = toInt(raw.best.level, 0);
    d.best.victory = toBool(raw.best.victory, false);
  }
  d.totalRuns = toInt(raw.totalRuns, 0);
  d.totalKills = toInt(raw.totalKills, 0);
  return d;
}

export const Save = {
  data: defaults(),

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      this.data = raw ? sanitize(JSON.parse(raw)) : defaults();
    } catch {
      this.data = defaults(); // JSON 损坏 = 坏档,回默认
    }
    return this.data;
  },

  commit() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); }
    catch { /* 隐私模式/配额满:静默失败,不影响游戏 */ }
  },

  reset() { this.data = defaults(); this.commit(); },
};
