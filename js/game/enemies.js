// ===== ⚔️ 战斗agent 名下:敌人系统(9 种常规 + 精英 + 双 Boss) =====
// 职责:敌人 AI/移动/接触伤害、弹幕(双方)飞行与命中判定、区域(圣域/闪电)结算、
//       伤害唯一入口 damageEnemy(数字/暴击/击退/闪白/死亡掉落联动)。
import { drawSprite } from '../sprites.js';
import { Bus } from '../core/engine.js';

// 战斗模块共享的运行状态:main 仅在 startRun 中调用 applyShopBonuses(upgrades.js),
// 以此作为"本局开始"信号;engine.reset 时由各战斗模块的 addReset 复位,
// 防止退出到主菜单后后台仍在刷怪/结算/触发音效。
export const combatState = { runActive: false };

// beh: 0直线 1摆动 2直线 3突进 4直线(半减伤退) 5自爆 6直线(免疫击退) 7正弦 8快速追踪 9冲撞Boss 10弹幕Boss
export const ENEMY_TYPES = {
  slime:         { name: '史莱姆',   sprite: 'slime',         hp: 12,   speed: 40, dmg: 8,  r: 14, xp: 1,   coinP: 0.08, beh: 0,  col: '#63c74d', kb: 1 },
  bat:           { name: '蝙蝠',     sprite: 'bat',           hp: 9,    speed: 86, dmg: 6,  r: 11, xp: 1,   coinP: 0.06, beh: 1,  col: '#68386c', kb: 1 },
  skeleton:      { name: '骷髅',     sprite: 'skeleton',      hp: 28,   speed: 54, dmg: 12, r: 14, xp: 2,   coinP: 0.10, beh: 2,  col: '#c0cbdc', kb: 1 },
  spider:        { name: '蜘蛛',     sprite: 'spider',        hp: 22,   speed: 48, dmg: 11, r: 12, xp: 2,   coinP: 0.08, beh: 3,  col: '#b86f50', kb: 1 },
  brute:         { name: '蛮兵',     sprite: 'brute',         hp: 75,   speed: 34, dmg: 18, r: 19, xp: 4,   coinP: 0.12, beh: 4,  col: '#b55088', kb: 0.5 },
  bomber:        { name: '自爆虫',   sprite: 'bomber',        hp: 18,   speed: 74, dmg: 0,  r: 12, xp: 2,   coinP: 0.10, beh: 5,  col: '#e43b44', kb: 1 },
  turtle:        { name: '岩龟',     sprite: 'turtle',        hp: 170,  speed: 17, dmg: 14, r: 17, xp: 6,   coinP: 0.16, beh: 6,  col: '#9ac1c9', kb: 0 },
  wisp:          { name: '鬼火',     sprite: 'wisp',          hp: 26,   speed: 58, dmg: 10, r: 11, xp: 3,   coinP: 0.08, beh: 7,  col: '#2ce8f5', kb: 1 },
  reaper:        { name: '死神',     sprite: 'reaper',        hp: 95,   speed: 68, dmg: 22, r: 18, xp: 8,   coinP: 0.25, beh: 8,  col: '#68386c', kb: 0.4 },
  boss_golem:    { name: '石头守卫', sprite: 'boss_golem',    hp: 2200, speed: 44, dmg: 26, r: 38, xp: 60,  coinP: 1,    beh: 9,  col: '#b55088', kb: 0.12, boss: 1 },
  boss_overlord: { name: '深渊领主', sprite: 'boss_overlord', hp: 9000, speed: 42, dmg: 30, r: 48, xp: 150, coinP: 1,    beh: 10, col: '#e43b44', kb: 0.05, boss: 1 },
};

let uid = 0;
let lastHitSfx = 0;
const TAU = Math.PI * 2;
// 热路径复用的伤害参数对象(单线程,先填字段后调用,无重入)
const HIT = { kx: 0, ky: 0 };
const SMALL = { small: 1, kx: 0, ky: 0 };
const KB0 = { kx: 0, ky: 0 };

export function spawnEnemy(g, typeId, x, y, o = {}) {
  const t = ENEMY_TYPES[typeId];
  if (!t) return null;
  const elite = !!o.elite, mini = !!o.mini;
  const hpM = (o.hpMult || 1) * (elite ? 6 : 1) * (mini ? 0.35 : 1);
  const e = {
    id: ++uid, type: typeId, name: t.name, sprite: t.sprite, beh: t.beh, boss: !!t.boss, pcol: t.col,
    x, y,
    r: t.r * (elite ? 1.3 : 1) * (mini ? 0.62 : 1),
    hp: t.hp * hpM, maxHp: t.hp * hpM,
    speed: t.speed * (o.speedMult || 1) * (elite ? 1.08 : 1) * (mini ? 1.25 : 1),
    dmg: t.dmg * (o.dmgMult || 1) * (elite ? 1.5 : 1),
    xp: mini ? 1 : Math.round(t.xp * (elite ? 5 : 1)),
    coinP: Math.min(1, t.coinP * (elite ? 3 : 1)),
    elite, mini,
    hpMult: o.hpMult || 1, dmgMult: o.dmgMult || 1, // 供史莱姆分裂继承成长
    flashT: 0, kx: 0, ky: 0, hitCd: 0, orbCd: 0,
    t: Math.random() * 10, aiT: Math.random() * 2.4, state: 0, atkCd: 2 + Math.random() * 2, atkN: 0,
    fuse: -1, cx: 0, cy: 0, spd: 0,
    kbMult: t.kb !== undefined ? t.kb : 1,
  };
  g.addEnemy(e);
  return e;
}

// 震屏(尊重玩家设置;engine.save 由 main 注入)
export function shakeIf(g, mag, dur) {
  if (g.save && g.save.data && g.save.data.settings && !g.save.data.settings.shake) return;
  g.shake(mag, dur);
}

// 唯一伤害入口:伤害数字 / 暴击(10%×1.6) / 击退 / 闪白 / 死亡掉落
export function damageEnemy(g, e, amount, o = {}) {
  if (!e || e.dead || e.hp <= 0) return;
  const st = g.player ? g.player.stats : null;
  let crit = o.crit;
  if (crit === undefined) {
    crit = !!st && Math.random() < st.crit;
    if (crit) amount *= st.critDmg;
  }
  const dmg = Math.max(1, Math.round(amount));
  e.hp -= dmg;
  g.stats.dmg += dmg;
  e.flashT = 0.09;
  const kb = (o.kb !== undefined ? o.kb : 1) * e.kbMult;
  if (kb > 0) { e.kx += (o.kx || 0) * kb; e.ky += (o.ky || 0) * kb; }
  g.spawnText(e.x, e.y - e.r - 8, String(dmg), {
    color: crit ? '#fee761' : (o.small ? '#ffb3a0' : '#ffffff'),
    size: crit ? 18 : (o.small ? 11 : 13), crit,
  });
  g.addParticles(e.x, e.y, { n: crit ? 7 : 3, color: e.pcol, speed: 110, life: 0.3, size: 3 });
  if (crit) shakeIf(g, 2.5, 0.12);
  const now = performance.now();
  if (now - lastHitSfx >= 70) { lastHitSfx = now; Bus.emit('sfx', 'hit'); } // 音效节流
  if (e.hp <= 0) killEnemy(g, e);
}

function killEnemy(g, e) {
  if (e.dead) return;
  e.dead = true;
  g.stats.kills++;
  g.addParticles(e.x, e.y, { n: e.boss ? 30 : 10, color: e.pcol, speed: e.boss ? 210 : 130, life: 0.55, size: 4, grav: 70 });
  // 史莱姆死亡分裂 2 只小史莱姆(小史莱姆不再分裂)
  if (e.type === 'slime' && !e.mini && g.enemies.length < 235) {
    for (let i = 0; i < 2; i++) {
      spawnEnemy(g, 'slime', e.x + (i ? 12 : -12), e.y + (Math.random() - 0.5) * 18,
        { hpMult: e.hpMult * 0.4, dmgMult: e.dmgMult, speedMult: 1.15, mini: true });
    }
  }
  Bus.emit('enemy-death', e); // pickups 监听掉落(精英 e.elite 必掉宝箱);boss.js 监听 Boss 死亡
}

// 自爆虫爆炸:对玩家与周围敌人造成伤害(可殉爆连锁)
function bomberBoom(g, e) {
  if (e.dead) return;
  e.dead = true;
  g.stats.kills++;
  g.addParticles(e.x, e.y, { n: 16, color: '#feae34', speed: 180, life: 0.45, size: 4 });
  g.addParticles(e.x, e.y, { n: 8, color: '#e43b44', speed: 110, life: 0.55, size: 5 });
  shakeIf(g, 3.5, 0.2);
  Bus.emit('sfx', 'hit');
  const R = 92, p = g.player;
  const dx = p.x - e.x, dy = p.y - e.y;
  if (dx * dx + dy * dy < (R + 13) * (R + 13)) p.takeDamage(Math.max(6, Math.round(20 * e.dmgMult)));
  const near = g.grid.query(e.x, e.y, R, g.qbuf);
  for (let k = 0; k < near.length; k++) {
    const o = near[k];
    if (o === e || o.dead) continue;
    const ox = o.x - e.x, oy = o.y - e.y, rr = R + o.r;
    if (ox * ox + oy * oy < rr * rr) {
      const dd = Math.sqrt(ox * ox + oy * oy) || 1;
      HIT.kx = (ox / dd) * 140; HIT.ky = (oy / dd) * 140;
      damageEnemy(g, o, Math.max(10, e.maxHp * 1.1), HIT);
    }
  }
  Bus.emit('enemy-death', e);
}

// 敌方环形/扇形弹幕
function ringBullets(g, x, y, n, spd, dmg) {
  const off = Math.random() * TAU;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * TAU;
    g.addProjectile({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 6, dmg, life: 5, fromEnemy: 1, sprite: 'w_bolt', tint: '#e43b44', rot: a });
  }
}
function fanBullets(g, x, y, aim, n, spread, spd, dmg) {
  for (let i = 0; i < n; i++) {
    const a = aim + (i - (n - 1) / 2) * spread;
    g.addProjectile({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 6, dmg, life: 5, fromEnemy: 1, sprite: 'w_bolt', tint: '#e43b44', rot: a });
  }
}

// 追踪弹转向寻的
function steerHome(pr, dt, g) {
  const near = g.grid.query(pr.x, pr.y, 260, g.qbuf);
  let tx = 0, ty = 0, bd = 260 * 260, found = false;
  for (let k = 0; k < near.length; k++) {
    const e = near[k];
    if (e.dead) continue;
    const dx = e.x - pr.x, dy = e.y - pr.y, d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; tx = e.x; ty = e.y; found = true; }
  }
  if (!found) return;
  const cur = Math.atan2(pr.vy, pr.vx);
  let da = Math.atan2(ty - pr.y, tx - pr.x) - cur;
  if (da > Math.PI) da -= TAU; else if (da < -Math.PI) da += TAU;
  const mt = pr.home * dt;
  if (da > mt) da = mt; else if (da < -mt) da = -mt;
  const na = cur + da;
  pr.vx = Math.cos(na) * pr.spd;
  pr.vy = Math.sin(na) * pr.spd;
  pr.rot = na;
}

// 火球爆炸:半径 AoE,带距离衰减
function explode(g, pr) {
  const r = pr.boomR;
  g.addParticles(pr.x, pr.y, { n: 14, color: '#feae34', speed: 170, life: 0.4, size: 4 });
  g.addParticles(pr.x, pr.y, { n: 6, color: '#e43b44', speed: 100, life: 0.5, size: 5 });
  shakeIf(g, 2, 0.12);
  const near = g.grid.query(pr.x, pr.y, r, g.qbuf);
  for (let k = 0; k < near.length; k++) {
    const e = near[k];
    if (e.dead) continue;
    const dx = e.x - pr.x, dy = e.y - pr.y, dd = Math.sqrt(dx * dx + dy * dy);
    if (dd < r + e.r) {
      HIT.kx = dd > 1 ? (dx / dd) * 90 : 0;
      HIT.ky = dd > 1 ? (dy / dd) * 90 : 0;
      damageEnemy(g, e, pr.boomDmg * (1 - 0.4 * Math.min(1, dd / r)), HIT);
    }
  }
}

export function initCombat(g) {
  g.addReset(() => { uid = 0; lastHitSfx = 0; combatState.runActive = false; });

  g.addUpdater(dt => {
    const p = g.player;
    if (!p || !combatState.runActive) return;
    const es = g.enemies, px = p.x, py = p.y;

    // 1) 空间哈希重建(武器索敌 / 弹幕判定 / 软分离共用)
    g.grid.clear();
    for (let i = 0; i < es.length; i++) g.grid.insert(es[i]);

    // 2) 玩家更新(移动 + 武器)。main.js 未调用 p.update,由战斗模块接管。
    p.update(dt, g);

    // 3) 区域:圣域持续伤害 / 闪电表现
    for (let i = g.zones.length - 1; i >= 0; i--) {
      const z = g.zones[i];
      z.life -= dt;
      if (z.life <= 0) { g.remove(g.zones, i); continue; }
      if (z.tickDmg > 0) {
        z.tickT -= dt;
        if (z.tickT <= 0) {
          z.tickT = z.tick;
          const near = g.grid.query(z.x, z.y, z.r, g.qbuf);
          for (let k = 0; k < near.length; k++) {
            const e = near[k];
            if (e.dead) continue;
            const dx = e.x - z.x, dy = e.y - z.y, rr = z.r + e.r;
            if (dx * dx + dy * dy < rr * rr) damageEnemy(g, e, z.tickDmg, SMALL);
          }
        }
      }
    }

    // 4) 敌人 AI + 移动 + 接触伤害 + 远处回收
    for (let i = es.length - 1; i >= 0; i--) {
      const e = es[i];
      if (e.dead) { g.remove(es, i); continue; }
      e.t += dt; e.hitCd -= dt; e.orbCd -= dt;
      if (e.flashT > 0) e.flashT -= dt;
      const dx = px - e.x, dy = py - e.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / d, uy = dy / d;
      let vx = ux * e.speed, vy = uy * e.speed;
      switch (e.beh) {
        case 1: { // 蝙蝠:快速小幅摆动
          const s = Math.sin(e.t * 7) * 36;
          vx += -uy * s; vy += ux * s;
          break;
        }
        case 3: { // 蜘蛛:爬行 1.6s → 突进 0.8s 循环
          const cyc = (e.t + e.aiT) % 2.4;
          if (cyc < 1.6) { vx *= 0.5; vy *= 0.5; } else { vx *= 2.7; vy *= 2.7; }
          break;
        }
        case 5: { // 自爆虫:贴近后 0.6s 红闪引信,自爆
          if (e.fuse >= 0) {
            e.fuse -= dt;
            vx *= 0.12; vy *= 0.12;
            if (e.fuse <= 0) { bomberBoom(g, e); continue; }
          } else if (d < 58) e.fuse = 0.6;
          break;
        }
        case 7: { // 鬼火:正弦飘忽轨迹
          const s = Math.sin(e.t * 2.8) * 52;
          vx = ux * e.speed - uy * s; vy = uy * e.speed + ux * s;
          break;
        }
        case 9: { // 石头守卫:蓄力 0.8s 后猛冲
          e.atkCd -= dt;
          if (e.state === 1) { // 蓄力(原地,红黄闪烁预警)
            e.aiT -= dt; vx = 0; vy = 0;
            if (e.aiT <= 0) { e.state = 2; e.aiT = 0.72; e.cx = ux; e.cy = uy; }
          } else if (e.state === 2) { // 冲撞(留冲击特效)
            e.aiT -= dt;
            vx = e.cx * 410; vy = e.cy * 410;
            g.addParticles(e.x, e.y, { n: 1, color: '#c0cbdc', speed: 40, life: 0.3, size: 4 });
            if (e.aiT <= 0) {
              e.state = 0; e.atkCd = 3.4;
              shakeIf(g, 3, 0.15);
              g.addParticles(e.x, e.y, { n: 10, color: '#c0cbdc', speed: 130, life: 0.4, size: 4 });
            }
          } else if (e.atkCd <= 0 && d < 540) {
            e.state = 1; e.aiT = 0.8;
            g.spawnText(e.x, e.y - e.r - 18, '!', { color: '#e43b44', size: 18, life: 0.6 });
            g.addParticles(e.x, e.y, { n: 6, color: '#b55088', speed: 70, life: 0.5, size: 3 });
          }
          break;
        }
        case 10: { // 深渊领主:三阶段(追踪 + 环形/扇形弹幕 + 狂暴加速)
          const hpf = e.hp / e.maxHp;
          const phase = hpf > 0.66 ? 1 : hpf > 0.33 ? 2 : 3;
          e.spd = phase === 1 ? 40 : phase === 2 ? 52 : 68;
          vx = ux * e.spd; vy = uy * e.spd;
          e.atkCd -= dt;
          if (e.atkCd <= 0) {
            e.atkN++;
            const bd = 14 + phase * 3, bs = 150 + phase * 18;
            if (e.atkN % 2 === 1) ringBullets(g, e.x, e.y, 10 + phase * 4, bs, bd);
            else fanBullets(g, e.x, e.y, Math.atan2(dy, dx), 3 + phase * 2, 0.26, bs + 30, bd + 4);
            e.atkCd = phase === 3 ? 1.5 : phase === 2 ? 2.0 : 2.5;
          }
          break;
        }
      }
      e.x += (vx + e.kx) * dt;
      e.y += (vy + e.ky) * dt;
      e.kx *= 0.86; e.ky *= 0.86;
      // 远处(>1100)回收:传送到玩家另一侧环带,避免堆积
      if (!e.boss) {
        const fx = e.x - px, fy = e.y - py;
        if (fx * fx + fy * fy > 1100 * 1100) {
          const a = Math.atan2(fy, fx) + Math.PI + (Math.random() - 0.5) * 1.2;
          const R = 660 + Math.random() * 120;
          e.x = px + Math.cos(a) * R; e.y = py + Math.sin(a) * R;
          e.kx = 0; e.ky = 0; e.fuse = -1; e.state = 0;
        }
      }
      // 接触伤害(每敌 0.5s 冷却)
      if (e.dmg > 0 && e.hitCd <= 0 && d < e.r + 13) {
        e.hitCd = 0.5;
        p.takeDamage(e.dmg);
      }
    }

    // 5) 同格软分离(防堆叠;Boss 不可被推动)
    for (const cell of g.grid.m.values()) {
      const n = cell.length;
      if (n < 2) continue;
      for (let i = 0; i < n; i++) {
        const a = cell[i];
        if (a.dead || a.boss) continue;
        for (let j = i + 1; j < n; j++) {
          const b = cell[j];
          if (b.dead) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const rr = (a.r + b.r) * 0.8;
          const d2 = dx * dx + dy * dy;
          if (d2 > 0.01 && d2 < rr * rr) {
            const dd = Math.sqrt(d2), push = (rr - dd) * 0.18;
            const nx = (dx / dd) * push, ny = (dy / dd) * push;
            a.x -= nx; a.y -= ny;
            if (!b.boss) { b.x += nx; b.y += ny; }
          }
        }
      }
    }

    // 6) 弹幕:飞行 / 追踪 / 回旋 / 冲击环 / 爆炸 / 命中判定
    const prs = g.projectiles;
    for (let i = prs.length - 1; i >= 0; i--) {
      const pr = prs[i];
      pr.life -= dt;
      let dead = pr.life <= 0;
      if (pr.ring) { // 护盾冲击环:原地扩张
        pr.r += pr.grow * dt;
        if (pr.r >= pr.maxR) dead = true;
      } else if (pr.bm) { // 回旋镖:向玩家加速折返,返程可再命中
        const bx = px - pr.x, by = py - pr.y;
        const bd = Math.sqrt(bx * bx + by * by) || 1;
        pr.vx += (bx / bd) * 950 * dt;
        pr.vy += (by / bd) * 950 * dt;
        if (!pr.bmRet && pr.vx * bx + pr.vy * by > 0) { pr.bmRet = 1; pr.hitIds.clear(); }
        pr.x += pr.vx * dt; pr.y += pr.vy * dt;
        pr.rot += 14 * dt;
        if (pr.bmRet && bd < 30 && pr.life < 3.55) dead = true;
      } else {
        if (pr.home) steerHome(pr, dt, g);
        pr.x += pr.vx * dt; pr.y += pr.vy * dt;
        if (pr.spin) pr.rot += pr.spin * dt;
      }
      if (pr.fromEnemy) { // 敌方弹幕远离即回收
        const fx = pr.x - px, fy = pr.y - py;
        if (fx * fx + fy * fy > 1100 * 1100) dead = true;
      }
      if (dead) {
        if (pr.boomR) explode(g, pr);
        if (pr.zone) { pr.zone.x = pr.x; pr.zone.y = pr.y; g.addZone(pr.zone); }
        g.remove(prs, i);
        continue;
      }
      if (pr.fromEnemy) { // 敌方弹幕 → 玩家
        const fx = pr.x - px, fy = pr.y - py, rr = pr.r + 12;
        if (fx * fx + fy * fy < rr * rr) { p.takeDamage(pr.dmg); g.remove(prs, i); }
        continue;
      }
      if (pr.ghost) continue; // 圣水瓶飞行中不参与命中
      // 玩家弹幕 → 敌人
      const near = g.grid.query(pr.x, pr.y, pr.r + 46, g.qbuf);
      for (let k = 0; k < near.length; k++) {
        const e = near[k];
        if (e.dead || pr.hitIds.has(e.id)) continue;
        const ex = e.x - pr.x, ey = e.y - pr.y, rr = pr.r + e.r;
        if (ex * ex + ey * ey < rr * rr) {
          pr.hitIds.add(e.id);
          if (pr.ring) { // 冲击环:沿径向击退
            const dd = Math.sqrt(ex * ex + ey * ey) || 1;
            HIT.kx = (ex / dd) * 120; HIT.ky = (ey / dd) * 120;
          } else { HIT.kx = pr.vx * 0.09; HIT.ky = pr.vy * 0.09; }
          damageEnemy(g, e, pr.dmg, HIT);
          if (pr.pierce > 0) pr.pierce--;
          else {
            if (pr.boomR) explode(g, pr);
            g.remove(prs, i);
            break;
          }
        }
      }
    }
  });

  // ---- 绘制:区域(圣域光圈 / 竖向闪电) ----
  g.addDrawer('zones', ctx => {
    for (const z of g.zones) {
      const f = z.maxLife ? Math.max(0, Math.min(1, z.life / z.maxLife)) : 1;
      if (z.sprite === 'lightning_v') {
        drawSprite(ctx, 'lightning_v', z.x, z.y - 30, { alpha: Math.min(1, f * 1.8) });
      } else {
        drawSprite(ctx, z.sprite || 'zone_holy', z.x, z.y, { alpha: 0.3 + 0.45 * f, scale: z.r ? z.r / 72 : 1 });
      }
    }
  });

  // ---- 绘制:敌人(闪白/引信红闪/蓄力预警/精英橙圈/血条) ----
  g.addDrawer('enemies', ctx => {
    const p = g.player;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const bob = (e.beh === 1 || e.beh === 7) ? Math.sin(e.t * 7) * 3 : Math.sin(e.t * 5) * 1.5;
      let tint = null;
      if (e.flashT > 0) tint = '#ffffff';
      else if (e.fuse >= 0) tint = Math.sin(e.t * 36) > 0 ? '#ff4444' : null;
      else if (e.state === 1) tint = Math.sin(e.t * 28) > 0 ? '#ffd24a' : null;
      drawSprite(ctx, e.sprite, e.x, e.y + bob, {
        flip: p ? p.x < e.x : false, tint,
        alpha: e.mini ? 0.85 : 1, scale: e.mini ? 0.62 : 1,
      });
      if (e.elite) { // 精英橙圈标记
        ctx.strokeStyle = '#feae34'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y + bob, e.r + 6, 0, 7); ctx.stroke();
      }
      if ((e.elite || e.boss) && e.hp < e.maxHp) { // 精英/Boss 头顶小血条
        const w = e.r * 1.8, hpf = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(e.x - w / 2, e.y - e.r - 14, w, 4);
        ctx.fillStyle = e.boss ? '#feae34' : '#e43b44';
        ctx.fillRect(e.x - w / 2, e.y - e.r - 14, w * hpf, 4);
      }
    }
  });

  // ---- 绘制:弹幕(冲击环为扩张圆环,其余为精灵) ----
  g.addDrawer('projectiles', ctx => {
    for (const pr of g.projectiles) {
      if (pr.ring) {
        const f = Math.max(0, pr.r / pr.maxR);
        ctx.globalAlpha = Math.max(0, 0.9 - f * 0.55);
        ctx.strokeStyle = '#7df9ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, 7); ctx.stroke();
        ctx.globalAlpha = Math.max(0, 0.35 - f * 0.2);
        if (pr.r > 10) { ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r - 8, 0, 7); ctx.stroke(); }
        ctx.globalAlpha = 1;
      } else {
        drawSprite(ctx, pr.sprite, pr.x, pr.y, { angle: pr.rot || 0, tint: pr.tint || null });
      }
    }
  });
}
