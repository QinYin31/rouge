// ===== ⚔️ 战斗agent 名下:武器系统(9 武器 × 5 级,行为差异化) =====
// 约定:玩家投射物统一 g.addProjectile(p),命中/爆炸/追踪/区域结算在 enemies.js 的 initCombat updater 中。
import { Bus } from '../core/engine.js';
import { drawSprite } from '../sprites.js';
import { damageEnemy } from './enemies.js';

export const WEAPON_ORDER = ['knife', 'wand', 'bow', 'orb', 'lightning', 'fireball', 'boomerang', 'holy', 'shield'];
export const MAX_WEAPONS = 4; // 同时持有武器上限(含初始武器)

const TAU = Math.PI * 2;
// 闪电无需击退的复用参数
const KB0 = { kx: 0, ky: 0 };

export const WEAPONS = {
  knife: {
    name: '飞刀', icon: 'w_knife', maxLv: 5,
    desc: '快速掷出飞刀,射向最近的敌人',
    base: { dmg: [10, 11, 13, 17, 21], cd: [1.1, 1.0, 0.95, 0.9, 0.75], n: [1, 2, 3, 3, 3], spread: [0.1, 0.18, 0.3, 0.38, 0.46] },
    lvText: ['掷出 1 把飞刀', '+1 飞刀', '+1 飞刀,扇形散射', '伤害 +30%', '伤害提升,冷却大幅缩短'],
  },
  wand: {
    name: '魔弹', icon: 'w_bolt', maxLv: 5,
    desc: '发射会追踪敌人的魔弹',
    base: { dmg: [12, 15, 15, 19, 23], cd: [1.25, 1.1, 1.1, 1.0, 0.9], n: [1, 1, 2, 2, 3], home: [3.2, 4.4, 4.4, 5.4, 6.4] },
    lvText: ['发射 1 颗追踪魔弹', '伤害 +25%', '+1 魔弹', '伤害与追踪强度提升', '+1 魔弹,冷却缩短'],
  },
  bow: {
    name: '长弓', icon: 'w_arrow', maxLv: 5,
    desc: '高伤箭矢,直线穿透多个敌人',
    base: { dmg: [24, 28, 34, 42, 52], cd: [1.5, 1.4, 1.3, 1.2, 1.05], pierce: [1, 2, 3, 4, 6] },
    lvText: ['射出穿透箭', '+1 穿透', '+1 穿透,伤害 +21%', '+1 穿透', '+2 穿透,冷却缩短'],
  },
  orb: {
    name: '环绕法球', icon: 'w_orb', maxLv: 5,
    desc: '法球围绕自身旋转,接触伤害',
    base: { dmg: [9, 11, 14, 17, 21], cd: [0, 0, 0, 0, 0], n: [1, 2, 2, 3, 4], r: [64, 68, 74, 80, 86] },
    lvText: ['1 颗法球环绕自身', '+1 法球', '半径与伤害提升', '+1 法球', '+1 法球,伤害提升'],
  },
  lightning: {
    name: '闪电', icon: 'lightning_v', maxLv: 5,
    desc: '闪电随机劈落视野内的敌人',
    base: { dmg: [20, 24, 30, 38, 46], cd: [2.1, 1.9, 1.7, 1.5, 1.3], n: [1, 2, 2, 3, 4] },
    lvText: ['随机落雷劈向敌人', '+1 落雷', '伤害 +25%', '+1 落雷', '+1 落雷,冷却缩短'],
  },
  fireball: {
    name: '火球', icon: 'w_fireball', maxLv: 5,
    desc: '火球命中或燃尽时爆炸,波及周围',
    base: { dmg: [18, 22, 26, 32, 40], cd: [1.7, 1.6, 1.5, 1.4, 1.25], boomR: [48, 54, 62, 72, 84] },
    lvText: ['命中后爆炸', '爆炸半径扩大', '爆炸半径扩大', '伤害 +23%', '爆炸半径大幅扩大,冷却缩短'],
  },
  boomerang: {
    name: '回旋镖', icon: 'w_boomerang', maxLv: 5,
    desc: '飞出后折返,去程回程都能杀伤',
    base: { dmg: [16, 20, 24, 30, 36], cd: [1.8, 1.7, 1.6, 1.5, 1.35], n: [1, 1, 2, 2, 3], spd: [430, 450, 470, 490, 510] },
    lvText: ['掷出回旋镖', '伤害 +25%', '+1 回旋镖', '伤害 +25%', '+1 回旋镖'],
  },
  holy: {
    name: '圣水', icon: 'w_flask', maxLv: 5,
    desc: '掷出圣水,落地形成持续伤害圣域',
    base: { tick: [6, 8, 10, 13, 16], cd: [2.5, 2.4, 2.3, 2.2, 2.0], n: [1, 1, 2, 2, 3], r: [54, 60, 66, 74, 82], dur: [2.6, 3.0, 3.4, 3.8, 4.4] },
    lvText: ['掷出圣水形成圣域', '范围与持续时间提升', '+1 圣域', '伤害提升', '+1 圣域,持续更久'],
  },
  shield: {
    name: '护盾', icon: 'w_shield', maxLv: 5,
    desc: '周期性释放向外扩散的冲击环',
    base: { dmg: [14, 18, 23, 29, 36], cd: [3.4, 3.1, 2.8, 2.5, 2.2], maxR: [150, 172, 194, 218, 244] },
    lvText: ['释放护盾冲击环', '伤害与范围提升', '冷却缩短', '伤害与范围提升', '伤害大幅提升,冷却缩短'],
  },
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
// 环绕法球击退参数复用(热路径零分配)
const KB = { kx: 0, ky: 0 };

// 环绕法球绘制(仅注册一次,跨局复用)
let orbDrawerOn = false;
function ensureOrbDrawer(g) {
  if (orbDrawerOn) return;
  orbDrawerOn = true;
  g.addDrawer('projectiles', ctx => {
    const p = g.player;
    if (!p) return;
    for (const w of p.weapons) {
      if (w.id !== 'orb' || !w.orbN) continue;
      for (let i = 0; i < w.orbN; i++) {
        const a = w.ang + (i / w.orbN) * TAU;
        drawSprite(ctx, 'w_orb', p.x + Math.cos(a) * w.orbR, p.y + Math.sin(a) * w.orbR, { angle: a * 2 });
      }
    }
  });
}

// 环绕法球:持续近距判定(非弹体),每敌 0.5s 独立受击冷却;绘制器在此懒注册
function updateOrb(w, dt, g, p, b, L) {
  ensureOrbDrawer(g);
  w.ang += 3.4 * dt;
  w.orbN = b.n[L];
  w.orbR = b.r[L] * p.stats.areaMult;
  w.orbDmg = b.dmg[L] * p.stats.might;
  const near = g.grid.query(p.x, p.y, w.orbR + 34, g.qbuf);
  for (let k = 0; k < near.length; k++) {
    const e = near[k];
    if (e.dead || e.orbCd > 0) continue;
    const rr = e.r + 13, rr2 = rr * rr;
    for (let i = 0; i < w.orbN; i++) {
      const a = w.ang + (i / w.orbN) * TAU;
      const ox = p.x + Math.cos(a) * w.orbR - e.x;
      const oy = p.y + Math.sin(a) * w.orbR - e.y;
      if (ox * ox + oy * oy < rr2) {
        e.orbCd = 0.5;
        const dx = e.x - p.x, dy = e.y - p.y, dd = Math.sqrt(dx * dx + dy * dy) || 1;
        KB.kx = (dx / dd) * 70; KB.ky = (dy / dd) * 70;
        damageEnemy(g, e, w.orbDmg, KB);
        break;
      }
    }
  }
}

export function makeWeapon(id) {
  const d = WEAPONS[id];
  const w = {
    id, lv: 1, cd: d.base.cd[0], timer: 0.2,
    ang: Math.random() * TAU, orbN: 0, orbR: 0, orbDmg: 0, // orb 状态
    update(dt, g) {
      const p = g.player;
      if (!p) return;
      const b = WEAPONS[this.id].base, L = this.lv - 1;
      if (this.id === 'orb') { updateOrb(this, dt, g, p, b, L); return; }
      this.timer -= dt;
      if (this.timer > 0) return;
      switch (this.id) {
        case 'knife': { // 飞刀:朝最近敌人,高等级扇形多连发
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
        case 'wand': { // 魔弹:追踪弹,等级提升数量与追踪强度
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
        case 'bow': { // 长弓:高伤直线穿透箭
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
        case 'lightning': { // 闪电:随机劈落视野内敌人,竖向闪电特效
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
            damageEnemy(g, e, b.dmg[L] * p.stats.might, KB0);
            g.addZone({ x: e.x, y: e.y, r: 0, life: 0.28, maxLife: 0.28, tickDmg: 0, sprite: 'lightning_v' });
            g.addParticles(e.x, e.y, { n: 5, color: '#7df9ff', speed: 120, life: 0.3, size: 3 });
          }
          sfxShoot();
          break;
        }
        case 'fireball': { // 火球:命中或到寿命时爆炸 AoE
          const e = nearestEnemy(g, p.x, p.y, 620);
          const a = e ? Math.atan2(e.y - p.y, e.x - p.x) : Math.random() * TAU;
          this.timer = b.cd[L] * p.stats.cdMult;
          const dmg = b.dmg[L] * p.stats.might;
          g.addProjectile({
            x: p.x, y: p.y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, r: 10,
            dmg, life: 1.8, pierce: 0, rot: a, sprite: 'w_fireball', spin: 6,
            boomR: b.boomR[L] * p.stats.areaMult, boomDmg: dmg * 0.8,
          });
          sfxShoot();
          break;
        }
        case 'boomerang': { // 回旋镖:飞出后折返,往返都能伤
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
        case 'holy': { // 圣水:随机掷出,落地生成持续伤害区
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
              },
            });
          }
          sfxShoot();
          break;
        }
        case 'shield': { // 护盾:快速扩张的冲击环弹体
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
