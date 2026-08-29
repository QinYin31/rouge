// ===== ⚔️ 战斗agent 名下:武器系统(9 武器 × 5 级 + 9 进化超武,水墨江湖版) =====
// 约定:玩家投射物统一 g.addProjectile(p),命中/爆炸/追踪/区域/元素状态结算在 enemies.js 的 initCombat updater 中。
// 进化(CONTRACT v2):武器 Lv5 且绑定被动 Lv5 → rollChoices 出 kind:'evolve' 金色选项(必占一档);
//       applyChoice 置 w.evolved=true / w.evoId=id,此后 update 走进化分支(单发伤害≈满级普通 2~3 倍 + 形态质变)。
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
    desc: '掷出无形剑气,斩向最近之敌',
    base: { dmg: [10, 11, 13, 17, 21], cd: [1.1, 1.0, 0.95, 0.9, 0.75], n: [1, 2, 3, 3, 3], spread: [0.1, 0.18, 0.3, 0.38, 0.46] },
    lvText: ['掷出 1 道剑气', '+1 剑气', '+1 剑气,扇形织剑', '剑气锋锐,伤害 +30%', '剑意凝练,出剑更快更狠'],
    evo: { passive: 'might', icon: 'w_knife_evo', evoName: '万剑归宗', desc: '八柄剑气环身高速绞杀,触之即溃,强击退如潮' },
  },
  wand: {
    name: '御风', icon: 'w_bolt', maxLv: 5,
    desc: '御风而行,风刃追踪强敌',
    base: { dmg: [12, 15, 15, 19, 23], cd: [1.25, 1.1, 1.1, 1.0, 0.9], n: [1, 1, 2, 2, 3], home: [3.2, 4.4, 4.4, 5.4, 6.4] },
    lvText: ['御出 1 道风刃', '风刃更利,伤害 +25%', '+1 风刃', '风势更紧,追踪更强', '+1 风刃,御风更疾'],
    evo: { passive: 'cd', icon: 'w_wand_evo', evoName: '风卷残云', desc: '风刃三连不绝如洪流,追踪锁敌,无孔不入' },
  },
  bow: {
    name: '贯日', icon: 'w_arrow', maxLv: 5,
    desc: '力贯长虹,一箭洞穿众敌',
    base: { dmg: [24, 28, 34, 42, 52], cd: [1.5, 1.4, 1.3, 1.2, 1.05], pierce: [1, 2, 3, 4, 6] },
    lvText: ['弯弓射出贯日箭', '箭势更烈,+1 穿透', '+1 穿透,伤害 +21%', '+1 穿透', '连珠箭雨,+2 穿透且更迅疾'],
    evo: { passive: 'speed', icon: 'w_bow_evo', evoName: '贯日长虹', desc: '巨箭贯日,无限洞穿,强击退如浪推山' },
  },
  orb: {
    name: '墨渊', icon: 'w_orb', maxLv: 5,
    desc: '墨珠环绕护体,触敌即伤',
    base: { dmg: [9, 11, 14, 17, 21], cd: [0, 0, 0, 0, 0], n: [1, 2, 2, 3, 4], r: [64, 68, 74, 80, 86] },
    lvText: ['1 颗墨珠环身而转', '+1 墨珠', '墨珠更巨更沉', '+1 墨珠', '+1 墨珠,墨压更重'],
    evo: { passive: 'armor', icon: 'w_orb_evo', evoName: '周天星斗', desc: '六颗大墨珠周天巡转,撞击处墨爆四溅' },
  },
  lightning: {
    name: '五雷', icon: 'lightning_v', maxLv: 5,
    desc: '五雷正法,天雷劈落邪祟',
    base: { dmg: [20, 24, 30, 38, 46], cd: [2.1, 1.9, 1.7, 1.5, 1.3], n: [1, 2, 2, 3, 4] },
    lvText: ['天雷初鸣,劈向一敌', '雷法渐精,+1 落雷', '雷威更盛,伤害 +25%', '+1 落雷', '雷动九霄,+1 落雷且更迅疾'],
    evo: { passive: 'xp', icon: 'w_lightning_evo', evoName: '九天神雷', desc: '同屏九雷齐落,雷霆连锁,邪祟辟易' },
  },
  fireball: {
    name: '焚天', icon: 'w_fireball', maxLv: 5,
    desc: '弹指烈焰,命中爆开焚敌',
    base: { dmg: [18, 22, 26, 32, 40], cd: [1.7, 1.6, 1.5, 1.4, 1.25], boomR: [48, 54, 62, 72, 84] },
    lvText: ['弹指烈焰,命中爆开', '火势蔓延,爆炸更大', '焰威更盛,爆炸更大', '真火淬炼,伤害 +23%', '焚天之势,爆炸更巨更疾'],
    evo: { passive: 'hp', icon: 'w_fireball_evo', evoName: '焚天煮海', desc: '烈焰超爆,大地燃灼,火海经久不熄' },
  },
  boomerang: {
    name: '回风', icon: 'w_boomerang', maxLv: 5,
    desc: '回风落雁,去而复返',
    base: { dmg: [16, 20, 24, 30, 36], cd: [1.8, 1.7, 1.6, 1.5, 1.35], n: [1, 1, 2, 2, 3], spd: [430, 450, 470, 490, 510] },
    lvText: ['掷出回风刃', '刃锋更利,伤害 +25%', '+1 回风刃', '风回更疾,伤害 +25%', '+1 回风刃'],
    evo: { passive: 'gold', icon: 'w_boomerang_evo', evoName: '金刃轮回', desc: '三枚巨刃轮回往复,回程伤势倍之' },
  },
  holy: {
    name: '墨雨', icon: 'w_flask', maxLv: 5,
    desc: '泼墨成域,墨湿蚀敌',
    base: { tick: [6, 8, 10, 13, 16], cd: [2.5, 2.4, 2.3, 2.2, 2.0], n: [1, 1, 2, 2, 3], r: [54, 60, 66, 74, 82], dur: [2.6, 3.0, 3.4, 3.8, 4.4] },
    lvText: ['泼墨成域,蚀敌血肉', '墨域更广更久', '+1 墨域', '墨毒更深,伤害提升', '+1 墨域,经久不散'],
    evo: { passive: 'magnet', icon: 'w_holy_evo', evoName: '墨染乾坤', desc: '大型墨域随身缓转,墨染之处万物皆湿' },
  },
  shield: {
    name: '金钟罩', icon: 'w_shield', maxLv: 5,
    desc: '金钟罩体,震荡波推敌',
    base: { dmg: [14, 18, 23, 29, 36], cd: [3.4, 3.1, 2.8, 2.5, 2.2], maxR: [150, 172, 194, 218, 244] },
    lvText: ['金钟震荡,推开来敌', '钟声更沉,伤害与范围提升', '钟鸣更急,冷却缩短', '金钟加固,伤害与范围提升', '钟鸣九霄,伤害大增且更疾'],
    evo: { passive: 'crit', icon: 'w_shield_evo', evoName: '雷动金钟', desc: '钟鸣频率倍增,环缘雷光放电' },
  },
};

// 进化形态数值表(单发伤害 ≈ 满级普通 ×2.2~2.6;频率/范围按形态质变另行放大)
const EVO = {
  knife:     { n: 8, r: 110, spin: 7.2, dmg: 50, hitCd: 0.3, kb: 175 },
  wand:      { n: 3, cd: 0.30, dmg: 50, spd: 430, home: 8.5, life: 1.7 },
  bow:       { cd: 0.9, dmg: 135, spd: 950, r: 17, life: 1.6, kbMult: 3.2 },
  orb:       { n: 6, r: 112, spin: 4.4, dmg: 54, hitCd: 0.42, kb: 90, splashR: 76, splashMult: 0.55 },
  lightning: { n: 9, cd: 1.4, dmg: 100, chainN: 3, chainR: 140, chainMult: 0.5 },
  fireball:  { cd: 1.15, dmg: 92, spd: 330, boomR: 150, boomMult: 1.0, zoneR: 88, zoneDur: 3, zoneTick: 15 },
  boomerang: { n: 3, cd: 1.15, dmg: 80, spd: 545, r: 15, retMult: 2 },
  holy:      { r: 150, dmg: 38, tick: 0.35 },
  shield:    { cd: 1.1, dmg: 80, maxR: 252, grow: 480, zapCd: 0.22, zapMult: 0.45 },
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
        if (this.id === 'knife') { // 万剑归宗:八剑环身高速绞杀
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
              zapCd: c.zapCd, zapT: c.zapCd, zapMult: c.zapMult,
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
        orbitTick(this, dt, g, p, b.n[L], b.r[L] * p.stats.areaMult, 3.4,
          b.dmg[L] * p.stats.might, 0.5, 70, 0, 0);
        return;
      }
      const b = WEAPONS[this.id].base;
      this.timer -= dt;
      if (this.timer > 0) return;
      switch (this.id) {
        case 'knife': { // 剑气:朝最近之敌,高等级扇形多连发
          const e = nearestEnemy(g, p.x, p.y, 620);
          if (!e) { this.timer = 0.25; return; }
          this.timer = b.cd[L] * p.stats.cdMult;
          const base = Math.atan2(e.y - p.y, e.x - p.x);
          const n = b.n[L], sp = b.spread[L];
          for (let i = 0; i < n; i++) {
            const a = base + (n > 1 ? (i / (n - 1) - 0.5) * sp : 0);
            g.addProjectile({
              x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14,
              vx: Math.cos(a) * 560, vy: Math.sin(a) * 560, r: 8,
              dmg: b.dmg[L] * p.stats.might, life: 0.85, pierce: 0, rot: a, sprite: 'w_knife',
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
              x: p.x, y: p.y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, r: 8,
              dmg: b.dmg[L] * p.stats.might, life: 2.2, pierce: 0, rot: a, sprite: 'w_bolt',
              home: b.home[L], spd: 330,
            });
          }
          sfxShoot();
          break;
        }
        case 'bow': { // 贯日:高伤直线穿透箭
          const e = nearestEnemy(g, p.x, p.y, 700);
          const a = e ? Math.atan2(e.y - p.y, e.x - p.x) : (p.facing < 0 ? Math.PI : 0);
          this.timer = b.cd[L] * p.stats.cdMult;
          g.addProjectile({
            x: p.x, y: p.y, vx: Math.cos(a) * 680, vy: Math.sin(a) * 680, r: 9,
            dmg: b.dmg[L] * p.stats.might, life: 1.5, pierce: b.pierce[L], rot: a, sprite: 'w_arrow',
          });
          sfxShoot();
          break;
        }
        case 'lightning': { // 五雷:随机劈落视野内敌人;击中墨湿之敌触发感电连锁
          const R = 440, R2 = R * R;
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
            const st = e.status; // 感电连锁:五雷击中湿身之敌,电弧跳跃
            if (st && st.wet > 0) chainLightning(g, e, dmg * 0.6, 3, 140);
            g.addZone({ x: e.x, y: e.y, r: 0, life: 0.28, maxLife: 0.28, tickDmg: 0, sprite: 'lightning_v' });
            g.addParticles(e.x, e.y, { n: 5, color: '#7df9ff', speed: 120, life: 0.3, size: 3 });
          }
          sfxShoot();
          break;
        }
        case 'fireball': { // 焚天:命中或燃尽时爆炸 AoE,施加灼烧
          const e = nearestEnemy(g, p.x, p.y, 620);
          const a = e ? Math.atan2(e.y - p.y, e.x - p.x) : Math.random() * TAU;
          this.timer = b.cd[L] * p.stats.cdMult;
          const dmg = b.dmg[L] * p.stats.might;
          g.addProjectile({
            x: p.x, y: p.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, r: 10,
            dmg, life: 1.8, pierce: 0, rot: a, sprite: 'w_fireball', spin: 6,
            boomR: b.boomR[L] * p.stats.areaMult, boomDmg: dmg * 0.8, burnHit: 3,
          });
          sfxShoot();
          break;
        }
        case 'boomerang': { // 回风:飞出后折返,往返都能伤
          const e = nearestEnemy(g, p.x, p.y, 640);
          if (!e) { this.timer = 0.25; return; }
          this.timer = b.cd[L] * p.stats.cdMult;
          const n = b.n[L];
          const aim = Math.atan2(e.y - p.y, e.x - p.x);
          for (let i = 0; i < n; i++) {
            const a = aim + (i - (n - 1) / 2) * 0.32;
            g.addProjectile({
              x: p.x, y: p.y, vx: Math.cos(a) * b.spd[L], vy: Math.sin(a) * b.spd[L], r: 11,
              dmg: b.dmg[L] * p.stats.might, life: 4, pierce: 9999, rot: a, sprite: 'w_boomerang',
              bm: 1, spin: 14,
            });
          }
          sfxShoot();
          break;
        }
        case 'holy': { // 墨雨:泼墨落地成域,持续蚀敌并施加墨湿
          this.timer = b.cd[L] * p.stats.cdMult;
          const n = b.n[L];
          for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU, dist = 90 + Math.random() * 150, T = 0.55;
            g.addProjectile({
              x: p.x, y: p.y, vx: Math.cos(a) * dist / T, vy: Math.sin(a) * dist / T, r: 8,
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
        case 'shield': { // 金钟罩:快速扩张的冲击环弹体
          this.timer = b.cd[L] * p.stats.cdMult;
          const maxR = b.maxR[L] * p.stats.areaMult;
          g.addProjectile({
            x: p.x, y: p.y, vx: 0, vy: 0, r: 16,
            dmg: b.dmg[L] * p.stats.might, life: maxR / 430 + 0.15, pierce: 9999, rot: 0,
            sprite: 'w_shield', ring: 1, grow: 430, maxR,
          });
          sfxShoot();
          break;
        }
      }
    },
  };
  return w;
}
