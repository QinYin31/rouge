// ===== ⚔️ 战斗agent 名下:武器系统(9 武器 × 5 级 + 9 进化超武,水墨江湖版) =====
// 约定:玩家投射物统一 g.addProjectile(p),命中/爆炸/追踪/区域/元素状态结算在 enemies.js 的 initCombat updater 中。
// 进化(CONTRACT v2):武器 Lv5 且绑定被动 Lv5 → rollChoices 出 kind:'evolve' 金色选项(必占一档);
//       applyChoice 置 w.evolved=true / w.evoId=id,此后 update 走进化分支。
// CONTRACT v2.1 手感与平衡补丁:
//  §1 墨雨:朝怪物最多的方向落瓶(600px 内 12 扇区单次遍历分桶 O(n),取质心钳 180~380px);墨染乾坤不变。
//  §2 剑气:重做为贯穿扇形——朝最近之敌一次扇出 3~5 道(3/3/4/4/5),开角 0.5→0.9rad,
//       射程 = 弹速680 × 寿命0.8 ≈ 544px,穿透 2/2/3/3/4,单发伤害约原 60~70%(总伤靠覆盖与穿透反超)。
//  §3 全武器每级伤害斜率 +30~40%(原 ~20%),部分等级追加数量/范围/转速;进化数值随新基准同步校准。
// CONTRACT v2.2 §7 清怪爽感:升级主体成长改「覆盖/效率」——每级至少一项覆盖性成长
//  (投射物 +1 / 范围 / 射程 / 持续 / 穿透 / 连锁 / 冷却),伤害仅次要增长(+10~15%/级);
//  §8 组合推荐:rollChoices 输出 rec 标记(见 upgrades.js)。进化形态同步放大覆盖。
import { Bus } from '../core/engine.js';
import { drawSprite, has } from '../sprites.js';
import { damageEnemy, applyStatus, chainLightning } from './enemies.js';

export const WEAPON_ORDER = ['knife', 'wand', 'bow', 'orb', 'lightning', 'fireball', 'boomerang', 'holy', 'shield'];
export const MAX_WEAPONS = 4; // 同时持有武器上限(含初始武器)

const TAU = Math.PI * 2;
// 闪电无需击退的复用参数
const KB0 = { kx: 0, ky: 0 };
// 环绕类击退参数复用(热路径零分配)
const KB = { kx: 0, ky: 0 };
// 溅射/墨域跳伤:淡墨小字、无粒子(高频伤害降噪)
const SPL = { dot: 1, kx: 0, ky: 0 };
// 墨爆溅射专用查询缓冲(与 g.qbuf 隔离,允许嵌套查询)
const QB = [];

export const WEAPONS = {
  knife: {
    name: '剑气', icon: 'w_knife', maxLv: 5,
    desc: '朝最近之敌扇形射出贯穿剑气,透敌而过',
    // v2.2 覆盖导向:每级 +1 道剑气,穿透/扇面/弹速射程逐级成长;伤害仅 +10~15%/级
    // 射程 = spd × life:540 → 720px
    base: {
      dmg: [6, 7, 8, 9, 10], cd: [1.1, 1.0, 0.95, 0.88, 0.78], n: [3, 4, 5, 6, 7],
      fan: [0.5, 0.6, 0.72, 0.84, 0.96], pierce: [2, 3, 3, 4, 5],
      spd: [680, 700, 725, 760, 800], life: [0.8, 0.82, 0.85, 0.88, 0.9],
    },
    lvText: ['朝最近之敌扇出 3 道贯穿剑气(射程 540,穿透 2)', '+1 道剑气(4 道),穿透 +1,伤害 +17%', '+1 道剑气(5 道),扇面加宽,剑速与射程提升', '+1 道剑气(6 道),穿透 +1,伤害 +13%', '+1 道剑气(7 道),穿透 +1,射程 +30%'],
    evo: { passive: 'might', icon: 'w_knife_evo', evoName: '万剑归宗', desc: '十柄剑气环身高速绞杀,触之即溃,强击退如潮' },
  },
  wand: {
    name: '御风', icon: 'w_bolt', maxLv: 5,
    desc: '御风而行,风刃追踪强敌',
    // v2.2 覆盖导向:+1 风刃 / 追踪强度 / 弹速逐级成长
    base: { dmg: [12, 13, 15, 17, 19], cd: [1.25, 1.15, 1.05, 0.95, 0.85], n: [1, 2, 3, 3, 4], home: [3.2, 4.2, 5.2, 6.4, 7.6], spd: [330, 345, 360, 390, 430] },
    lvText: ['御出 1 道追踪风刃', '+1 风刃(2 道),追踪更紧,伤害 +8%', '+1 风刃(3 道),追踪更紧,伤害 +15%', '追踪大幅增强,风刃提速,伤害 +13%', '+1 风刃(4 道),御风更疾,伤害 +12%'],
    evo: { passive: 'cd', icon: 'w_wand_evo', evoName: '风卷残云', desc: '风刃四连不绝如洪流,追踪锁敌,无孔不入' },
  },
  bow: {
    name: '贯日', icon: 'w_arrow', maxLv: 5,
    desc: '力贯长虹,一箭洞穿众敌',
    // v2.2 覆盖导向:每级穿透 +2,射程与击退逐级成长(射程 1020 → 1326px)
    base: { dmg: [25, 28, 32, 36, 40], cd: [1.5, 1.4, 1.3, 1.2, 1.05], pierce: [1, 3, 5, 7, 9], spd: [680, 700, 725, 750, 780], life: [1.5, 1.55, 1.6, 1.65, 1.7], kb: [1, 1.1, 1.2, 1.35, 1.5] },
    lvText: ['弯弓射出贯日箭,洞穿一敌', '穿透 +2(共 3),箭势更远,伤害 +12%', '穿透 +2(共 5),箭势更远,伤害 +14%', '穿透 +2(共 7),击退增强,伤害 +13%', '穿透 +2(共 9),射程最远,伤害 +11%'],
    evo: { passive: 'speed', icon: 'w_bow_evo', evoName: '贯日长虹', desc: '巨箭贯日,无限洞穿,强击退如浪推山' },
  },
  orb: {
    name: '墨渊', icon: 'w_orb', maxLv: 5,
    desc: '墨珠环绕护体,触敌即伤',
    // v2.2 覆盖导向:每级 +1 墨珠,环绕半径/转速逐级成长
    base: { dmg: [9, 10, 11, 12, 14], cd: [0, 0, 0, 0, 0], n: [1, 2, 3, 4, 5], r: [64, 74, 84, 94, 104], spin: [3.2, 3.5, 3.8, 4.1, 4.5] },
    lvText: ['1 颗墨珠环身而转', '+1 墨珠(2 颗),环绕半径扩大,墨毒 +11%', '+1 墨珠(3 颗),转速更疾,墨毒 +10%', '+1 墨珠(4 颗),环绕半径扩大,墨毒 +9%', '+1 墨珠(5 颗),转速更疾,墨毒 +17%'],
    evo: { passive: 'armor', icon: 'w_orb_evo', evoName: '周天星斗', desc: '七颗大墨珠周天巡转,撞击处墨爆更广' },
  },
  lightning: {
    name: '五雷', icon: 'lightning_v', maxLv: 5,
    desc: '五雷正法,天雷劈落邪祟',
    // v2.2 覆盖导向:每级 +1 落雷,索敌半径扩大;高等级自带连锁(3 级 2 连锁 → 5 级 3 连锁)
    base: { dmg: [20, 23, 26, 29, 33], cd: [2.1, 1.9, 1.75, 1.55, 1.35], n: [1, 2, 3, 4, 5], R: [440, 460, 485, 515, 555], chainN: [0, 0, 2, 2, 3], chainR: 130 },
    lvText: ['天雷初鸣,劈向一敌', '+1 落雷(2 道),雷域扩大,伤害 +15%', '+1 落雷(3 道),新增连锁(跳 2 敌),伤害 +13%', '+1 落雷(4 道),雷域扩大,伤害 +12%', '+1 落雷(5 道),连锁 +1(跳 3 敌),伤害 +14%'],
    evo: { passive: 'xp', icon: 'w_lightning_evo', evoName: '九天神雷', desc: '同屏九雷齐落,雷霆四连锁链,邪祟辟易' },
  },
  fireball: {
    name: '焚天', icon: 'w_fireball', maxLv: 5,
    desc: '弹指烈焰,命中爆开焚敌',
    // v2.2 覆盖导向:爆炸半径大增(+22~25%/级)、灼烧持续 +0.5秒/级、弹速提升
    base: { dmg: [18, 20, 22, 25, 28], cd: [1.7, 1.6, 1.5, 1.4, 1.25], boomR: [48, 60, 74, 90, 110], burnHit: [3, 3.5, 4, 4.5, 5], spd: [300, 312, 324, 336, 350] },
    lvText: ['弹指烈焰,命中爆开(半径 48)', '爆炸半径 +25%,灼烧 +0.5秒,伤害 +11%', '爆炸半径 +23%,弹速提升,伤害 +10%', '爆炸半径 +22%,灼烧 +0.5秒,伤害 +14%', '爆炸半径 +22%,弹速提升,灼烧 +0.5秒,伤害 +12%'],
    evo: { passive: 'hp', icon: 'w_fireball_evo', evoName: '焚天煮海', desc: '烈焰超爆,大地燃灼,火海经久不熄' },
  },
  boomerang: {
    name: '回风', icon: 'w_boomerang', maxLv: 5,
    desc: '回风落雁,去而复返',
    // v2.2 覆盖导向:+1 镖 / 镖体碰撞半径增大 / 弹速射程提升
    base: { dmg: [16, 18, 20, 22, 25], cd: [1.8, 1.7, 1.6, 1.5, 1.35], n: [1, 2, 2, 3, 4], spd: [440, 470, 500, 540, 580], r: [11, 12, 13, 14, 16] },
    lvText: ['掷出回风刃,去而复返', '+1 回风刃(2 枚),伤害 +13%', '镖体增大,去势更远,伤害 +11%', '+1 回风刃(3 枚),镖体再增,伤害 +10%', '+1 回风刃(4 枚),射程大增,伤害 +14%'],
    evo: { passive: 'gold', icon: 'w_boomerang_evo', evoName: '金刃轮回', desc: '四枚巨刃轮回往复,回程伤势倍之' },
  },
  holy: {
    name: '墨雨', icon: 'w_flask', maxLv: 5,
    desc: '朝群敌最密处泼墨成域,墨湿蚀敌',
    // v2.2 覆盖导向:墨域半径大增(+18%/级)、持续 +0.4~0.6秒/级、瓶数 +1
    base: { tick: [6, 7, 8, 9, 10], cd: [2.5, 2.4, 2.3, 2.2, 2.0], n: [1, 2, 2, 3, 3], r: [54, 64, 76, 90, 106], dur: [2.6, 3.0, 3.5, 4.0, 4.6] },
    lvText: ['朝群敌最密处泼墨成域(半径 54,持续 2.6秒)', '+1 墨瓶(2 瓶),墨域扩大,持续 +0.4秒', '墨域大幅扩大,持续 +0.5秒,墨毒 +14%', '+1 墨瓶(3 瓶),墨域再扩,墨毒 +13%', '墨域再扩 +18%,持续 +0.6秒,墨毒 +11%'],
    evo: { passive: 'magnet', icon: 'w_holy_evo', evoName: '墨染乾坤', desc: '大型墨域随身缓转,墨染之处万物皆湿' },
  },
  shield: {
    name: '金钟罩', icon: 'w_shield', maxLv: 5,
    desc: '金钟罩体,震荡波推敌',
    // v2.2 覆盖导向:钟域半径大增(+17~20%/级)、频率(冷却)与击退逐级成长
    base: { dmg: [14, 16, 18, 20, 23], cd: [3.4, 3.1, 2.8, 2.5, 2.2], maxR: [150, 180, 214, 252, 294], kb: [1, 1.1, 1.2, 1.3, 1.45] },
    lvText: ['金钟震荡,推开来敌(半径 150)', '钟域扩大 +20%,击退增强,伤害 +14%', '钟域扩大 +19%,钟鸣更急,伤害 +13%', '钟域扩大 +18%,击退增强,伤害 +11%', '钟域大扩 +17%,钟鸣更急,伤害 +15%'],
    evo: { passive: 'crit', icon: 'w_shield_evo', evoName: '雷动金钟', desc: '钟鸣频率倍增,环缘雷光放电更远更频' },
  },
};

// 进化形态数值表(v2.2:覆盖同步放大——数量/半径/连锁/火区全面加码,伤害微调;
// 单发/单次伤害维持 ≈ 各自满级普通形态总伤 ×2.5~3 倍率档)
const EVO = {
  knife:     { n: 10, r: 132, spin: 8.2, dmg: 86, hitCd: 0.3, kb: 175 }, // 十剑环身:环绕单敌 86/0.3≈287/s
  wand:      { n: 4, cd: 0.25, dmg: 72, spd: 470, home: 9.5, life: 1.9 }, // 四连弹幕,更快更黏
  bow:       { cd: 0.8, dmg: 188, spd: 1040, r: 20, life: 1.8, kbMult: 3.6 }, // 巨箭更巨更快更远
  orb:       { n: 7, r: 132, spin: 5.4, dmg: 66, hitCd: 0.42, kb: 90, splashR: 96, splashMult: 0.6 }, // 七珠+墨爆扩大
  lightning: { n: 9, cd: 1.22, dmg: 108, chainN: 4, chainR: 160, chainMult: 0.55 }, // 连锁 +1、连锁半径扩大
  fireball:  { cd: 1.05, dmg: 115, spd: 360, boomR: 185, boomMult: 1.0, zoneR: 112, zoneDur: 3.6, zoneTick: 16 }, // 超爆+火海更广更久
  boomerang: { n: 4, cd: 1.05, dmg: 96, spd: 610, r: 18, retMult: 2 }, // 四枚巨刃
  holy:      { r: 185, dmg: 46, tick: 0.32 }, // 墨域大扩 + 跳伤更频
  shield:    { cd: 0.95, dmg: 82, maxR: 300, grow: 520, zapCd: 0.18, zapMult: 0.5, zapN: 3 }, // 钟域更大,环缘放电 3 敌
};

// --- 射击音效节流:最多 80ms 一次,避免爆音 ---
let lastShoot = 0;
function sfxShoot() {
  const n = performance.now();
  if (n - lastShoot >= 80) { lastShoot = n; Bus.emit('sfx', 'shoot'); }
}

// 最近敌人(平方距离比较,零分配)
function nearestEnemy(g, x, y, maxR) {
  let best = null, bd = maxR * maxR;
  const es = g.enemies;
  for (let i = 0; i < es.length; i++) {
    const e = es[i];
    if (e.dead) continue;
    const dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = e; }
  }
  return best;
}

// 墨雨索敌直方图(CONTRACT v2.1 §1):600px 内敌人按 12 方向扇区单次遍历分桶(O(n)),
// 模块级复用,热路径零分配
const HOLY_SEC = 12;
const secCnt = new Int32Array(HOLY_SEC);
const secSumX = new Float64Array(HOLY_SEC);
const secSumY = new Float64Array(HOLY_SEC);

// 闪电候选表(模块级复用,避免每次施法分配)
const tmpList = [];

// 环绕类(墨渊/万剑归宗/周天星斗)绘制器(仅注册一次,跨局复用)
let orbitDrawerOn = false;
function ensureOrbitDrawer(g) {
  if (orbitDrawerOn) return;
  orbitDrawerOn = true;
  g.addDrawer('projectiles', ctx => {
    const p = g.player;
    if (!p) return;
    for (const w of p.weapons) {
      if (!w.orbN || (w.id !== 'orb' && w.id !== 'knife')) continue;
      const knife = w.id === 'knife';
      let spr;
      if (knife) spr = w.evolved ? (has('w_knife_evo') ? 'w_knife_evo' : 'w_knife') : 'w_knife';
      else spr = w.evolved ? (has('w_orb_evo') ? 'w_orb_evo' : 'w_orb') : 'w_orb';
      const scl = w.evolved ? 1.35 : 1;
      for (let i = 0; i < w.orbN; i++) {
        const a = w.ang + (i / w.orbN) * TAU;
        const x = p.x + Math.cos(a) * w.orbR, y = p.y + Math.sin(a) * w.orbR;
        if (!g.inView(x, y, 60)) continue; // 视口剔除
        drawSprite(ctx, spr, x, y, {
          angle: knife ? a + 1.5708 : a * 2, // 剑气切向指向,墨珠自旋
          alpha: w.evolved ? 0.95 : 1, scale: scl,
        });
      }
    }
  });
}

// 墨染乾坤(圣域进化)绘制器:跟随玩家的大型缓转墨域
let domainDrawerOn = false;
function ensureDomainDrawer(g) {
  if (domainDrawerOn) return;
  domainDrawerOn = true;
  g.addDrawer('zones', ctx => {
    const p = g.player;
    if (!p) return;
    for (const w of p.weapons) {
      if (w.id !== 'holy' || !w.evolved || !w.domR) continue;
      if (!g.inView(p.x, p.y, w.domR + 60)) continue;
      const pulse = 0.5 + 0.1 * Math.sin(w.domAng * 2.3);
      drawSprite(ctx, 'zone_holy', p.x, p.y, { alpha: pulse, scale: w.domR / 72, angle: w.domAng * 0.35 });
      drawSprite(ctx, 'zone_holy', p.x, p.y, { alpha: pulse * 0.6, scale: w.domR / 116, angle: -w.domAng * 0.6 });
    }
  });
}

// 环绕类通用判定:近距接触 → 伤害(+可选墨爆溅射),每敌独立受击冷却
function orbitTick(w, dt, g, p, n, rad, spin, dmg, hitCd, kb, splashR, splashMult) {
  ensureOrbitDrawer(g);
  w.ang += spin * dt;
  w.orbN = n;
  w.orbR = rad;
  w.orbDmg = dmg;
  const near = g.grid.query(p.x, p.y, rad + 40, g.qbuf);
  for (let k = 0; k < near.length; k++) {
    const e = near[k];
    if (e.dead || e.orbCd > 0) continue;
    const rr = e.r + 14, rr2 = rr * rr;
    for (let i = 0; i < n; i++) {
      const a = w.ang + (i / n) * TAU;
      const ox = p.x + Math.cos(a) * rad - e.x;
      const oy = p.y + Math.sin(a) * rad - e.y;
      if (ox * ox + oy * oy < rr2) {
        e.orbCd = hitCd;
        const dx = e.x - p.x, dy = e.y - p.y, dd = Math.sqrt(dx * dx + dy * dy) || 1;
        KB.kx = (dx / dd) * kb; KB.ky = (dy / dd) * kb;
        damageEnemy(g, e, dmg, KB);
        if (splashR > 0) { // 周天星斗:撞击处小范围墨爆
          const sNear = g.grid.query(e.x, e.y, splashR, QB);
          for (let s = 0; s < sNear.length; s++) {
            const o = sNear[s];
            if (o === e || o.dead) continue;
            const sx = o.x - e.x, sy = o.y - e.y, sr = splashR + o.r;
            if (sx * sx + sy * sy < sr * sr) damageEnemy(g, o, dmg * splashMult, SPL);
          }
          g.addParticles(e.x, e.y, { n: 4, color: '#4a4a5a', speed: 95, life: 0.28, size: 4 });
        }
        break;
      }
    }
  }
}

export function makeWeapon(id) {
  const d = WEAPONS[id];
  const w = {
    id, lv: 1, cd: d.base.cd[0], timer: 0.2,
    ang: Math.random() * TAU, orbN: 0, orbR: 0, orbDmg: 0, // 环绕类状态
    evolved: false, evoId: null,        // 进化标记(applyChoice 置位)
    domR: 0, domAng: 0, domT: 0,        // 墨染乾坤领域状态
    update(dt, g) {
      const p = g.player;
      if (!p) return;
      const L = this.lv - 1;

      // ---- 进化形态:持续型(剑气阵 / 墨珠阵 / 墨域) ----
      if (this.evolved) {
        if (this.id === 'knife') { // 万剑归宗:八剑环身高速绞杀(数值随 v2.1 新剑气基准校准)
          const c = EVO.knife;
          orbitTick(this, dt, g, p, c.n, c.r * p.stats.areaMult, c.spin,
            c.dmg * p.stats.might, c.hitCd, c.kb, 0, 0);
          return;
        }
        if (this.id === 'orb') { // 周天星斗:六大墨珠 + 撞击墨爆
          const c = EVO.orb;
          orbitTick(this, dt, g, p, c.n, c.r * p.stats.areaMult, c.spin,
            c.dmg * p.stats.might, c.hitCd, c.kb, c.splashR * p.stats.areaMult, c.splashMult);
          return;
        }
        if (this.id === 'holy') { // 墨染乾坤:随身墨域,缓转蚀敌 + 施加墨湿
          const c = EVO.holy;
          ensureDomainDrawer(g);
          this.domR = c.r * p.stats.areaMult;
          this.domAng += 0.9 * dt;
          this.domT -= dt;
          if (this.domT <= 0) {
            this.domT = c.tick;
            const near = g.grid.query(p.x, p.y, this.domR, g.qbuf);
            for (let k = 0; k < near.length; k++) {
              const e = near[k];
              if (e.dead) continue;
              const dx = e.x - p.x, dy = e.y - p.y, rr = this.domR + e.r;
              if (dx * dx + dy * dy < rr * rr) {
                damageEnemy(g, e, c.dmg * p.stats.might, SPL);
                applyStatus(g, e, 'wet', 1.5);
              }
            }
          }
          return;
        }
        // 其余进化形态走计时器施放
        this.timer -= dt;
        if (this.timer > 0) return;
        switch (this.id) {
          case 'wand': { // 风卷残云:高频三连追踪弹幕洪流
            const c = EVO.wand;
            const e = nearestEnemy(g, p.x, p.y, 640);
            if (!e) { this.timer = 0.2; return; }
            this.timer = c.cd * p.stats.cdMult;
            const dmg = c.dmg * p.stats.might;
            for (let i = 0; i < c.n; i++) {
              const a = Math.atan2(e.y - p.y, e.x - p.x) + (Math.random() - 0.5) * 0.6;
              g.addProjectile({
                x: p.x, y: p.y, vx: Math.cos(a) * c.spd, vy: Math.sin(a) * c.spd, r: 9,
                dmg, life: c.life, pierce: 1, rot: a,
                sprite: has('w_wand_evo') ? 'w_wand_evo' : 'w_bolt',
                home: c.home, spd: c.spd,
              });
            }
            sfxShoot();
            return;
          }
          case 'bow': { // 贯日长虹:巨型贯穿箭,无限穿透 + 大幅击退
            const c = EVO.bow;
            const e = nearestEnemy(g, p.x, p.y, 760);
            const a = e ? Math.atan2(e.y - p.y, e.x - p.x) : (p.facing < 0 ? Math.PI : 0);
            this.timer = c.cd * p.stats.cdMult;
            g.addProjectile({
              x: p.x, y: p.y, vx: Math.cos(a) * c.spd, vy: Math.sin(a) * c.spd, r: c.r,
              dmg: c.dmg * p.stats.might, life: c.life, pierce: 9999, rot: a,
              sprite: has('w_bow_evo') ? 'w_bow_evo' : 'w_arrow', scale: 1.6,
              kbMult: c.kbMult, trail: 1, trailT: 0,
            });
            sfxShoot();
            return;
          }
          case 'lightning': { // 九天神雷:同屏至 9 道落雷 + 小范围连锁
            const c = EVO.lightning;
            const R = 480, R2 = R * R;
            tmpList.length = 0;
            const es = g.enemies;
            for (let i = 0; i < es.length; i++) {
              const e = es[i];
              if (e.dead) continue;
              const dx = e.x - p.x, dy = e.y - p.y;
              if (dx * dx + dy * dy < R2) tmpList.push(e);
            }
            if (!tmpList.length) { this.timer = 0.3; return; }
            this.timer = c.cd * p.stats.cdMult;
            const dmg = c.dmg * p.stats.might;
            const n = Math.min(c.n, tmpList.length);
            for (let i = 0; i < n; i++) {
              const e = tmpList[(Math.random() * tmpList.length) | 0];
              if (e.dead) continue;
              damageEnemy(g, e, dmg, KB0);
              chainLightning(g, e, dmg * c.chainMult, c.chainN, c.chainR); // 雷霆连锁
              g.addZone({ x: e.x, y: e.y, r: 0, life: 0.28, maxLife: 0.28, tickDmg: 0, sprite: 'lightning_v' });
              g.addParticles(e.x, e.y, { n: 6, color: '#5fb8c4', speed: 130, life: 0.3, size: 3 });
            }
            sfxShoot();
            return;
          }
          case 'fireball': { // 焚天煮海:超大爆炸 + 灼烧火区
            const c = EVO.fireball;
            const e = nearestEnemy(g, p.x, p.y, 680);
            const a = e ? Math.atan2(e.y - p.y, e.x - p.x) : Math.random() * TAU;
            this.timer = c.cd * p.stats.cdMult;
            const dmg = c.dmg * p.stats.might;
            g.addProjectile({
              x: p.x, y: p.y, vx: Math.cos(a) * c.spd, vy: Math.sin(a) * c.spd, r: 13,
              dmg, life: 1.8, pierce: 1, rot: a,
              sprite: has('w_fireball_evo') ? 'w_fireball_evo' : 'w_fireball', spin: 7,
              boomR: c.boomR * p.stats.areaMult, boomDmg: dmg * c.boomMult, burnHit: 3,
              fireZone: {
                r: c.zoneR * p.stats.areaMult, life: c.zoneDur, tickDmg: c.zoneTick * p.stats.might,
              },
            });
            sfxShoot();
            return;
          }
          case 'boomerang': { // 金刃轮回:3 枚巨镖,回程双倍伤
            const c = EVO.boomerang;
            const e = nearestEnemy(g, p.x, p.y, 700);
            if (!e) { this.timer = 0.25; return; }
            this.timer = c.cd * p.stats.cdMult;
            const aim = Math.atan2(e.y - p.y, e.x - p.x);
            for (let i = 0; i < c.n; i++) {
              const a = aim + (i - (c.n - 1) / 2) * 0.38;
              g.addProjectile({
                x: p.x, y: p.y, vx: Math.cos(a) * c.spd, vy: Math.sin(a) * c.spd, r: c.r,
                dmg: c.dmg * p.stats.might, life: 4, pierce: 9999, rot: a,
                sprite: has('w_boomerang_evo') ? 'w_boomerang_evo' : 'w_boomerang',
                bm: 1, spin: 15, retMult: c.retMult, scale: 1.45, kbMult: 1.6,
              });
            }
            sfxShoot();
            return;
          }
          case 'shield': { // 雷动金钟:冲击环频率×2 + 环缘放电
            const c = EVO.shield;
            this.timer = c.cd * p.stats.cdMult;
            const maxR = c.maxR * p.stats.areaMult;
            g.addProjectile({
              x: p.x, y: p.y, vx: 0, vy: 0, r: 16,
              dmg: c.dmg * p.stats.might, life: maxR / c.grow + 0.15, pierce: 9999, rot: 0,
              sprite: has('w_shield_evo') ? 'w_shield_evo' : 'w_shield',
              ring: 1, grow: c.grow, maxR, ringCol: '#b03a2e',
              zapCd: c.zapCd, zapT: c.zapCd, zapMult: c.zapMult, zapN: c.zapN,
            });
            sfxShoot();
            return;
          }
        }
        return;
      }

      // ---- 普通形态 ----
      if (this.id === 'orb') { // 墨渊:持续环绕判定
        const b = WEAPONS.orb.base;
        orbitTick(this, dt, g, p, b.n[L], b.r[L] * p.stats.areaMult, b.spin[L],
          b.dmg[L] * p.stats.might, 0.5, 70, 0, 0);
        return;
      }
      const b = WEAPONS[this.id].base;
      this.timer -= dt;
      if (this.timer > 0) return;
      switch (this.id) {
        case 'knife': { // 剑气(v2.1 §2):朝最近之敌一次扇出贯穿剑气浪——长射程高穿透,青焰柳叶
          const e = nearestEnemy(g, p.x, p.y, 640);
          const base = e ? Math.atan2(e.y - p.y, e.x - p.x) : (p.facing < 0 ? Math.PI : 0);
          this.timer = b.cd[L] * p.stats.cdMult;
          const n = b.n[L], fan = b.fan[L];
          for (let i = 0; i < n; i++) {
            const a = base + (n > 1 ? (i / (n - 1) - 0.5) * fan : 0);
            g.addProjectile({
              x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14,
              vx: Math.cos(a) * b.spd[L], vy: Math.sin(a) * b.spd[L], r: 8,
              dmg: b.dmg[L] * p.stats.might, life: b.life[L], pierce: b.pierce[L], rot: a,
              sprite: 'w_knife', scale: 1 + L * 0.06, // 高等级剑气更凝练
              trail: 1, trailT: 0, trailCol: '#5fb8c4', // 青焰残迹:剑气浪
            });
          }
          sfxShoot();
          break;
        }
        case 'wand': { // 御风:追踪风刃,等级提升数量与追踪强度
          const e = nearestEnemy(g, p.x, p.y, 560);
          if (!e) { this.timer = 0.25; return; }
          this.timer = b.cd[L] * p.stats.cdMult;
          const n = b.n[L];
          for (let i = 0; i < n; i++) {
            const a = Math.atan2(e.y - p.y, e.x - p.x) + (Math.random() - 0.5) * 0.5;
            g.addProjectile({
              x: p.x, y: p.y, vx: Math.cos(a) * b.spd[L], vy: Math.sin(a) * b.spd[L], r: 8,
              dmg: b.dmg[L] * p.stats.might, life: 2.2, pierce: 0, rot: a, sprite: 'w_bolt',
              home: b.home[L], spd: b.spd[L],
            });
          }
          sfxShoot();
          break;
        }
        case 'bow': { // 贯日:高伤直线穿透箭(v2.2:穿透/射程/击退成长)
          const e = nearestEnemy(g, p.x, p.y, 700);
          const a = e ? Math.atan2(e.y - p.y, e.x - p.x) : (p.facing < 0 ? Math.PI : 0);
          this.timer = b.cd[L] * p.stats.cdMult;
          g.addProjectile({
            x: p.x, y: p.y, vx: Math.cos(a) * b.spd[L], vy: Math.sin(a) * b.spd[L], r: 9,
            dmg: b.dmg[L] * p.stats.might, life: b.life[L], pierce: b.pierce[L], rot: a, sprite: 'w_arrow',
            kbMult: b.kb[L],
          });
          sfxShoot();
          break;
        }
        case 'lightning': { // 五雷:劈落索敌半径内敌人(v2.2:落雷数/雷域逐级扩大,高等级自带连锁)
          const R = b.R[L], R2 = R * R;
          tmpList.length = 0;
          const es = g.enemies;
          for (let i = 0; i < es.length; i++) {
            const e = es[i];
            if (e.dead) continue;
            const dx = e.x - p.x, dy = e.y - p.y;
            if (dx * dx + dy * dy < R2) tmpList.push(e);
          }
          if (!tmpList.length) { this.timer = 0.3; return; }
          this.timer = b.cd[L] * p.stats.cdMult;
          const n = Math.min(b.n[L], tmpList.length);
          for (let i = 0; i < n; i++) {
            const e = tmpList[(Math.random() * tmpList.length) | 0];
            if (e.dead) continue;
            const dmg = b.dmg[L] * p.stats.might;
            damageEnemy(g, e, dmg, KB0);
            const st = e.status; // 感电连锁:五雷击中湿身之敌,电弧跳跃更远更强(墨雨协同)
            if (st && st.wet > 0) chainLightning(g, e, dmg * 0.6, 3, 140);
            else if (b.chainN[L] > 0) chainLightning(g, e, dmg * 0.5, b.chainN[L], b.chainR); // v2.2:高等级自带连锁
            g.addZone({ x: e.x, y: e.y, r: 0, life: 0.28, maxLife: 0.28, tickDmg: 0, sprite: 'lightning_v' });
            g.addParticles(e.x, e.y, { n: 5, color: '#7df9ff', speed: 120, life: 0.3, size: 3 });
          }
          sfxShoot();
          break;
        }
        case 'fireball': { // 焚天:命中或燃尽时爆炸 AoE,施加灼烧(v2.2:爆炸半径/灼烧持续/弹速成长)
          const e = nearestEnemy(g, p.x, p.y, 620);
          const a = e ? Math.atan2(e.y - p.y, e.x - p.x) : Math.random() * TAU;
          this.timer = b.cd[L] * p.stats.cdMult;
          const dmg = b.dmg[L] * p.stats.might;
          g.addProjectile({
            x: p.x, y: p.y, vx: Math.cos(a) * b.spd[L], vy: Math.sin(a) * b.spd[L], r: 10,
            dmg, life: 1.8, pierce: 0, rot: a, sprite: 'w_fireball', spin: 6,
            boomR: b.boomR[L] * p.stats.areaMult, boomDmg: dmg * 0.8, burnHit: b.burnHit[L],
          });
          sfxShoot();
          break;
        }
        case 'boomerang': { // 回风:飞出后折返,往返都能伤(v2.2:镖数/镖体/射程成长)
          const e = nearestEnemy(g, p.x, p.y, 640);
          if (!e) { this.timer = 0.25; return; }
          this.timer = b.cd[L] * p.stats.cdMult;
          const n = b.n[L];
          const aim = Math.atan2(e.y - p.y, e.x - p.x);
          for (let i = 0; i < n; i++) {
            const a = aim + (i - (n - 1) / 2) * 0.32;
            g.addProjectile({
              x: p.x, y: p.y, vx: Math.cos(a) * b.spd[L], vy: Math.sin(a) * b.spd[L], r: b.r[L],
              dmg: b.dmg[L] * p.stats.might, life: 4, pierce: 9999, rot: a, sprite: 'w_boomerang',
              bm: 1, spin: 14,
            });
          }
          sfxShoot();
          break;
        }
        case 'holy': { // 墨雨(v2.1 §1):朝怪物最多的方向落瓶
          // 600px 内敌人按 12 方向扇区单次遍历分桶(O(n)),取敌最多的扇区,
          // 在其质心附近落瓶(距玩家 180~380px 环带);无敌人才回退随机方向
          this.timer = b.cd[L] * p.stats.cdMult;
          secCnt.fill(0); secSumX.fill(0); secSumY.fill(0);
          const es = g.enemies, R2 = 600 * 600, px = p.x, py = p.y;
          for (let i = 0; i < es.length; i++) {
            const e = es[i];
            if (e.dead) continue;
            const dx = e.x - px, dy = e.y - py, d2 = dx * dx + dy * dy;
            if (d2 > R2) continue;
            let s = ((Math.atan2(dy, dx) + Math.PI) * (HOLY_SEC / TAU)) | 0;
            if (s >= HOLY_SEC) s = HOLY_SEC - 1; // atan2 边界(±PI)浮点回绕保护
            secCnt[s]++; secSumX[s] += dx; secSumY[s] += dy;
          }
          let bi = -1, bn = 0;
          for (let s = 0; s < HOLY_SEC; s++) if (secCnt[s] > bn) { bn = secCnt[s]; bi = s; }
          const n = b.n[L], T = 0.55;
          for (let i = 0; i < n; i++) {
            let dx, dy;
            if (bi >= 0) { // 最密扇区质心附近 + 小幅散布,钳制 180~380px 环带
              dx = secSumX[bi] / bn + (Math.random() - 0.5) * 90;
              dy = secSumY[bi] / bn + (Math.random() - 0.5) * 90;
              const dd = Math.sqrt(dx * dx + dy * dy) || 1;
              const cl = dd < 180 ? 180 / dd : dd > 380 ? 380 / dd : 1;
              dx *= cl; dy *= cl;
            } else { // 视野无敌人:回退随机方向
              const a = Math.random() * TAU, dist = 90 + Math.random() * 150;
              dx = Math.cos(a) * dist; dy = Math.sin(a) * dist;
            }
            g.addProjectile({
              x: px, y: py, vx: dx / T, vy: dy / T, r: 8,
              dmg: 0, life: T, pierce: 0, rot: 0, sprite: 'w_flask', ghost: 1, spin: 9,
              zone: {
                x: 0, y: 0, r: b.r[L] * p.stats.areaMult, life: b.dur[L], maxLife: b.dur[L],
                tickDmg: b.tick[L] * p.stats.might, tick: 0.4, tickT: 0.4, sprite: 'zone_holy',
                wetOn: 1,
              },
            });
          }
          sfxShoot();
          break;
        }
        case 'shield': { // 金钟罩:快速扩张的冲击环弹体(v2.2:钟域半径/频率/击退成长)
          this.timer = b.cd[L] * p.stats.cdMult;
          const maxR = b.maxR[L] * p.stats.areaMult;
          g.addProjectile({
            x: p.x, y: p.y, vx: 0, vy: 0, r: 16,
            dmg: b.dmg[L] * p.stats.might, life: maxR / 430 + 0.15, pierce: 9999, rot: 0,
            sprite: 'w_shield', ring: 1, grow: 430, maxR, kbMult: b.kb[L],
          });
          sfxShoot();
          break;
        }
      }
    },
  };
  return w;
}
