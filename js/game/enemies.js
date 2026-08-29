// ===== ⚔️ 战斗agent 名下:敌人系统(9 种常规 + 精英 + 双 Boss + 元素状态联动,水墨江湖版) =====
// 职责:敌人 AI/移动/接触伤害、弹幕(双方)飞行与命中判定、区域(墨域/火区/落雷)结算、
//       伤害唯一入口 damageEnemy(数字/暴击/击退/闪白/死亡掉落)。
// 联动(CONTRACT v2):e.status={burn,wet} 秒数;焚天命中→灼烧,墨雨/墨染→墨湿;
//       burn+wet 并存→蒸汽爆发(90px AoE+白雾+震屏);五雷击中湿敌→感电连锁;灼烧之敌死亡→殉焰火区。
import { drawSprite } from '../sprites.js';
import { Bus } from '../core/engine.js';

// 战斗模块共享的运行状态:main 仅在 startRun 中调用 applyShopBonuses(upgrades.js),
// 以此作为"本局开始"信号;engine.reset 时由各战斗模块的 addReset 复位,
// 防止退出到主菜单后后台仍在刷怪/结算/触发音效。
export const combatState = { runActive: false };

// beh: 0直线 1摆动 2直线 3突进 4直线(半减伤退) 5自爆 6直线(免疫击退) 7正弦 8快速追踪 9冲撞Boss 10弹幕Boss
export const ENEMY_TYPES = {
  slime:         { name: '纸妖',     sprite: 'slime',         hp: 12,   speed: 40, dmg: 8,  r: 14, xp: 1,   coinP: 0.08, beh: 0,  col: '#63c74d', kb: 1 },
  bat:           { name: '夜枭',     sprite: 'bat',           hp: 9,    speed: 86, dmg: 6,  r: 11, xp: 1,   coinP: 0.06, beh: 1,  col: '#68386c', kb: 1 },
  skeleton:      { name: '骨卫',     sprite: 'skeleton',      hp: 28,   speed: 54, dmg: 12, r: 14, xp: 2,   coinP: 0.10, beh: 2,  col: '#c0cbdc', kb: 1 },
  spider:        { name: '蛛妖',     sprite: 'spider',        hp: 22,   speed: 48, dmg: 11, r: 12, xp: 2,   coinP: 0.08, beh: 3,  col: '#b86f50', kb: 1 },
  brute:         { name: '金刚力士', sprite: 'brute',         hp: 75,   speed: 34, dmg: 18, r: 19, xp: 4,  coinP: 0.12, beh: 4,  col: '#b55088', kb: 0.5 },
  bomber:        { name: '火药童子', sprite: 'bomber',        hp: 18,   speed: 74, dmg: 0,  r: 12, xp: 2,   coinP: 0.10, beh: 5,  col: '#e43b44', kb: 1 },
  turtle:        { name: '铁甲龟',   sprite: 'turtle',        hp: 170,  speed: 17, dmg: 14, r: 17, xp: 6,   coinP: 0.16, beh: 6,  col: '#9ac1c9', kb: 0 },
  wisp:          { name: '青灯鬼火', sprite: 'wisp',          hp: 26,   speed: 58, dmg: 10, r: 11, xp: 3,   coinP: 0.08, beh: 7,  col: '#2ce8f5', kb: 1 },
  reaper:        { name: '黑无常',   sprite: 'reaper',        hp: 95,   speed: 68, dmg: 22, r: 18, xp: 8,   coinP: 0.25, beh: 8,  col: '#68386c', kb: 0.4 },
  boss_golem:    { name: '石像守卫', sprite: 'boss_golem',    hp: 2200, speed: 44, dmg: 26, r: 38, xp: 60,  coinP: 1,    beh: 9,  col: '#b55088', kb: 0.12, boss: 1 },
  boss_overlord: { name: '无常尊者', sprite: 'boss_overlord', hp: 9000, speed: 42, dmg: 30, r: 48, xp: 150, coinP: 1,    beh: 10, col: '#e43b44', kb: 0.05, boss: 1 },
};

let uid = 0;
let lastHitSfx = 0;
const TAU = Math.PI * 2;
// 热路径复用的伤害参数对象(单线程,先填字段后调用,无重入;调用方每敌先填)
const HIT = { kx: 0, ky: 0 };
const DOT = { dot: 1, kx: 0, ky: 0 };            // 灼烧/区域跳伤:淡墨小字、无粒子
const SYN = { synergy: 1, kx: 0, ky: 0 };        // 联动伤害(感电/环缘放电):青焰小字

// 蒸汽/连锁/环缘放电专用查询缓冲(与 g.qbuf 隔离,允许在 qbuf 迭代中嵌套查询)
const QBX = [];

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
    hpMult: o.hpMult || 1, dmgMult: o.dmgMult || 1, // 供纸妖分裂继承成长
    status: { burn: 0, wet: 0 }, burnT: 0,          // 元素状态(秒):灼烧/墨湿
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
// 配色(CONTRACT v2 水墨):普通墨色 #3a3a3a · 暴击朱砂 #b03a2e · 联动青焰 #4da7b4
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
    color: o.synergy ? '#4da7b4' : crit ? '#b03a2e' : (o.dot ? '#6f6252' : '#3a3a3a'),
    size: o.dot ? 10 : crit ? 18 : 13, crit,
  });
  if (!o.dot) g.addParticles(e.x, e.y, { n: crit ? 7 : 3, color: e.pcol, speed: 110, life: 0.3, size: 3 });
  if (crit) shakeIf(g, 1.8, 0.1);
  const now = performance.now();
  if (now - lastHitSfx >= 70) { lastHitSfx = now; Bus.emit('sfx', 'hit'); } // 音效节流
  if (e.hp <= 0) killEnemy(g, e);
}

// ---- 元素状态系统(burn 灼烧 / wet 墨湿,秒数)与四条联动 ----
// 施加状态:焚天类 → burn 3s;墨雨/墨染乾坤 → wet 3s;两者并存瞬间 → 蒸汽爆发
export function applyStatus(g, e, kind, dur) {
  if (!e || e.dead || !e.status) return;
  const s = e.status;
  s[kind] = Math.max(s[kind], dur);
  if (kind === 'burn' && e.burnT <= 0) e.burnT = 0.5;
  if (s.burn > 0 && s.wet > 0) steamBurst(g, e); // 阴阳相激
}

// 蒸汽爆发:90px AoE(该敌最大HP×8%+30),白雾大粒子 + 震屏 + 青焰提示(节流 800ms)
let lastSteamT = 0;
function steamBurst(g, e) {
  e.status.burn = 0; e.status.wet = 0; // 汽化:双状态清空,防止连环自触
  g.addParticles(e.x, e.y, { n: 10, color: '#efe9dc', speed: 150, life: 0.45, size: 7 });
  g.addParticles(e.x, e.y, { n: 6, color: '#ffffff', speed: 90, life: 0.65, size: 10 });
  shakeIf(g, 2, 0.15);
  Bus.emit('sfx', 'hit');
  const now = performance.now();
  if (now - lastSteamT >= 800) {
    lastSteamT = now;
    g.spawnText(e.x, e.y - e.r - 20, '阴阳相激!', { color: '#4da7b4', size: 17, life: 1 });
  }
  const R = 90, dmg = e.maxHp * 0.08 + 30;
  const near = g.grid.query(e.x, e.y, R, QBX);
  for (let k = 0; k < near.length; k++) {
    const o = near[k];
    if (o.dead) continue;
    const dx = o.x - e.x, dy = o.y - e.y, rr = R + o.r;
    if (dx * dx + dy * dy < rr * rr) {
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      HIT.kx = (dx / dd) * 130; HIT.ky = (dy / dd) * 130;
      damageEnemy(g, o, dmg, HIT);
    }
  }
}

// 感电连锁:从 src 向 140px 内最多 maxN 个敌人跳电弧(60% 伤),青色电弧粒子连线
export function chainLightning(g, src, dmg, maxN, r) {
  const near = g.grid.query(src.x, src.y, r, QBX);
  let hits = 0;
  for (let k = 0; k < near.length && hits < maxN; k++) {
    const e = near[k];
    if (e === src || e.dead) continue;
    const dx = e.x - src.x, dy = e.y - src.y;
    if (dx * dx + dy * dy > r * r) continue;
    hits++;
    const dd = Math.sqrt(dx * dx + dy * dy) || 1;
    SYN.kx = (dx / dd) * 60; SYN.ky = (dy / dd) * 60;
    damageEnemy(g, e, dmg, SYN);
    zapLine(g, src.x, src.y, e.x, e.y);
  }
  return hits;
}

// 青色电弧:沿连线撒青焰小粒子
function zapLine(g, x0, y0, x1, y1) {
  const d = Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0));
  const n = Math.min(10, Math.max(3, (d / 16) | 0));
  for (let i = 1; i < n; i++) {
    const f = i / n;
    g.addParticles(
      x0 + (x1 - x0) * f + (Math.random() - 0.5) * 8,
      y0 + (y1 - y0) * f + (Math.random() - 0.5) * 8,
      { n: 1, color: '#5fb8c4', speed: 14, life: 0.22, size: 3 },
    );
  }
}

// 灼烧 DOT + 墨湿衰减 + 状态粒子(朱砂火星 / 青焰湿气)
function updateStatus(g, e, dt) {
  const s = e.status;
  if (s.burn > 0) {
    s.burn -= dt;
    e.burnT -= dt;
    if (e.burnT <= 0) { // 每秒灼烧 DOT(对大体型有上限,防 Boss 白嫖)
      e.burnT = 0.5;
      DOT.kx = 0; DOT.ky = 0;
      damageEnemy(g, e, 2 + Math.min(1500, e.maxHp) * 0.008, DOT);
    }
    if (Math.random() < dt * 4 && g.inView(e.x, e.y, 60)) {
      g.addParticles(e.x + (Math.random() - 0.5) * e.r, e.y - e.r * 0.4,
        { n: 1, color: '#d9662e', speed: 26, life: 0.35, size: 3, grav: -30 });
    }
  }
  if (s.wet > 0) {
    s.wet -= dt;
    if (Math.random() < dt * 3 && g.inView(e.x, e.y, 60)) {
      g.addParticles(e.x + (Math.random() - 0.5) * e.r, e.y - e.r * 0.3,
        { n: 1, color: '#5fb8c4', speed: 20, life: 0.4, size: 3 });
    }
  }
}

function killEnemy(g, e) {
  if (e.dead) return;
  e.dead = true;
  g.stats.kills++;
  g.addParticles(e.x, e.y, { n: e.boss ? 30 : 10, color: e.pcol, speed: e.boss ? 210 : 130, life: 0.55, size: 4, grav: 70 });
  // 殉焰:灼烧之敌死亡留下 2s 火区(半径 40,tick 伤害,复用 g.zones)
  if (e.status && e.status.burn > 0 && !e.mini && g.zones.length < 46) {
    g.addZone({
      x: e.x, y: e.y, r: 40, life: 2, maxLife: 2,
      tickDmg: 3 + Math.min(1200, e.maxHp) * 0.008, tick: 0.35, tickT: 0.35,
      sprite: 'zone_holy', tint: '#d9662e', burnOn: 1,
    });
  }
  // 纸妖死亡分裂 2 只小纸妖(小纸妖不再分裂)
  if (e.type === 'slime' && !e.mini && g.enemies.length < 235) {
    for (let i = 0; i < 2; i++) {
      spawnEnemy(g, 'slime', e.x + (i ? 12 : -12), e.y + (Math.random() - 0.5) * 18,
        { hpMult: e.hpMult * 0.4, dmgMult: e.dmgMult, speedMult: 1.15, mini: true });
    }
  }
  Bus.emit('enemy-death', e); // pickups 监听掉落(精英 e.elite 必掉宝箱);boss.js 监听 Boss 死亡
}

// 火药童子自爆:对玩家与周围敌人造成伤害(可殉爆连锁)
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

// 火球爆炸:半径 AoE,带距离衰减;可施加灼烧 / 留下灼烧火区(焚天煮海)
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
      if (pr.burnHit) applyStatus(g, e, 'burn', pr.burnHit);
    }
  }
  const fz = pr.fireZone; // 焚天煮海:灼烧火区残留
  if (fz && g.zones.length < 60) {
    g.addZone({
      x: pr.x, y: pr.y, r: fz.r, life: fz.life, maxLife: fz.life,
      tickDmg: fz.tickDmg, tick: 0.35, tickT: 0.35,
      sprite: 'zone_holy', tint: '#d9662e', burnOn: 1,
    });
  }
}

// 雷动金钟:冲击环环缘放电(命中环缘附近至多 2 敌,青焰联动伤害)
function ringZap(g, pr) {
  const near = g.grid.query(pr.x, pr.y, pr.r + 60, QBX);
  let n = 0;
  for (let k = 0; k < near.length; k++) {
    const e = near[k];
    if (e.dead) continue;
    const dx = e.x - pr.x, dy = e.y - pr.y, d2 = dx * dx + dy * dy;
    const lo = pr.r - 50, hi = pr.r + 34 + e.r;
    if (d2 < lo * lo || d2 > hi * hi) continue;
    const dd = Math.sqrt(d2) || 1;
    SYN.kx = (dx / dd) * 90; SYN.ky = (dy / dd) * 90;
    damageEnemy(g, e, pr.dmg * pr.zapMult, SYN);
    zapLine(g, pr.x + (dx / dd) * (pr.r - 10), pr.y + (dy / dd) * (pr.r - 10), e.x, e.y);
    if (++n >= 2) break;
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
    // 疾风靴:p.dashCdMul 由 upgrades.js 维护;此处钳制使冲刺冷却实际缩短
    // (player 内冲刺冷却 = 3×cdMult;若 player 将来直接消费 dashCdMul,此钳制自动成为空操作)
    const dashCap = 3 * p.stats.cdMult * (p.dashCdMul || 1);
    if (p.dash.cd > dashCap) p.dash.cd = dashCap;

    // 3) 区域:墨域/火区持续伤害(+施加状态)/ 落雷表现
    for (let i = g.zones.length - 1; i >= 0; i--) {
      const z = g.zones[i];
      z.life -= dt;
      if (z.life <= 0) { g.remove(g.zones, i); continue; }
      if (z.burnOn && Math.random() < dt * 6 && g.inView(z.x, z.y, z.r + 40)) { // 火区火星
        g.addParticles(z.x + (Math.random() - 0.5) * z.r, z.y + (Math.random() - 0.5) * z.r * 0.7,
          { n: 1, color: '#d9662e', speed: 30, life: 0.4, size: 3, grav: -40 });
      }
      if (z.tickDmg > 0) {
        z.tickT -= dt;
        if (z.tickT <= 0) {
          z.tickT = z.tick;
          const near = g.grid.query(z.x, z.y, z.r, g.qbuf);
          for (let k = 0; k < near.length; k++) {
            const e = near[k];
            if (e.dead) continue;
            const dx = e.x - z.x, dy = e.y - z.y, rr = z.r + e.r;
            if (dx * dx + dy * dy < rr * rr) {
              DOT.kx = 0; DOT.ky = 0;
              damageEnemy(g, e, z.tickDmg, DOT);
              if (z.wetOn) applyStatus(g, e, 'wet', 1.2);
              else if (z.burnOn) applyStatus(g, e, 'burn', 1.2);
            }
          }
        }
      }
    }

    // 4) 敌人 AI + 移动 + 元素状态 + 接触伤害 + 远处回收
    for (let i = es.length - 1; i >= 0; i--) {
      const e = es[i];
      if (e.dead) { g.remove(es, i); continue; }
      e.t += dt; e.hitCd -= dt; e.orbCd -= dt;
      if (e.flashT > 0) e.flashT -= dt;
      if (e.status && (e.status.burn > 0 || e.status.wet > 0)) updateStatus(g, e, dt);
      const dx = px - e.x, dy = py - e.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / d, uy = dy / d;
      let vx = ux * e.speed, vy = uy * e.speed;
      switch (e.beh) {
        case 1: { // 夜枭:快速小幅摆动
          const s = Math.sin(e.t * 7) * 36;
          vx += -uy * s; vy += ux * s;
          break;
        }
        case 3: { // 蛛妖:爬行 1.6s → 突进 0.8s 循环
          const cyc = (e.t + e.aiT) % 2.4;
          if (cyc < 1.6) { vx *= 0.5; vy *= 0.5; } else { vx *= 2.7; vy *= 2.7; }
          break;
        }
        case 5: { // 火药童子:贴近后 0.6s 红闪引信,自爆
          if (e.fuse >= 0) {
            e.fuse -= dt;
            vx *= 0.12; vy *= 0.12;
            if (e.fuse <= 0) { bomberBoom(g, e); continue; }
          } else if (d < 58) e.fuse = 0.6;
          break;
        }
        case 7: { // 青灯鬼火:正弦飘忽轨迹
          const s = Math.sin(e.t * 2.8) * 52;
          vx = ux * e.speed - uy * s; vy = uy * e.speed + ux * s;
          break;
        }
        case 9: { // 石像守卫:蓄力 0.8s 后猛冲
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
            g.spawnText(e.x, e.y - e.r - 18, '!', { color: '#b03a2e', size: 18, life: 0.6 });
            g.addParticles(e.x, e.y, { n: 6, color: '#b55088', speed: 70, life: 0.5, size: 3 });
          }
          break;
        }
        case 10: { // 无常尊者:三阶段(追踪 + 环形/扇形弹幕 + 狂暴加速)
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
      if (pr.ring) { // 金钟罩/雷动金钟冲击环:原地扩张(+雷动金钟环缘放电)
        pr.r += pr.grow * dt;
        if (pr.zapMult) {
          pr.zapT -= dt;
          if (pr.zapT <= 0) { pr.zapT = pr.zapCd; ringZap(g, pr); }
        }
        if (pr.r >= pr.maxR) dead = true;
      } else if (pr.bm) { // 回风/金刃轮回:向玩家加速折返,返程可再命中
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
      if (pr.trail) { // 贯日长虹:朱砂拖尾
        pr.trailT -= dt;
        if (pr.trailT <= 0) {
          pr.trailT = 0.05;
          g.addParticles(pr.x, pr.y, { n: 1, color: '#b03a2e', speed: 18, life: 0.26, size: 4 });
        }
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
      if (pr.ghost) continue; // 墨雨瓶飞行中不参与命中
      // 玩家弹幕 → 敌人
      const near = g.grid.query(pr.x, pr.y, pr.r + 46, g.qbuf);
      for (let k = 0; k < near.length; k++) {
        const e = near[k];
        if (e.dead || pr.hitIds.has(e.id)) continue;
        const ex = e.x - pr.x, ey = e.y - pr.y, rr = pr.r + e.r;
        if (ex * ex + ey * ey < rr * rr) {
          pr.hitIds.add(e.id);
          let dmg = pr.dmg;
          if (pr.bmRet && pr.retMult) dmg *= pr.retMult; // 金刃轮回:回程双倍伤
          if (pr.ring) { // 冲击环:沿径向击退
            const dd = Math.sqrt(ex * ex + ey * ey) || 1;
            HIT.kx = (ex / dd) * 120; HIT.ky = (ey / dd) * 120;
          } else {
            const km = pr.kbMult || 1;
            HIT.kx = pr.vx * 0.09 * km; HIT.ky = pr.vy * 0.09 * km;
          }
          damageEnemy(g, e, dmg, HIT);
          if (pr.burnHit) applyStatus(g, e, 'burn', pr.burnHit); // 焚天类:施加灼烧
          if (pr.wetHit) applyStatus(g, e, 'wet', pr.wetHit);
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

  // ---- 绘制:区域(墨域 / 火区 / 落雷符纹) ----
  g.addDrawer('zones', ctx => {
    for (const z of g.zones) {
      if (!g.inView(z.x, z.y, 60 + (z.r || 0) + (z.sprite === 'lightning_v' ? 60 : 0))) continue; // 视口剔除
      const f = z.maxLife ? Math.max(0, Math.min(1, z.life / z.maxLife)) : 1;
      if (z.sprite === 'lightning_v') {
        drawSprite(ctx, 'lightning_v', z.x, z.y - 30, { alpha: Math.min(1, f * 1.8) });
      } else {
        drawSprite(ctx, z.sprite || 'zone_holy', z.x, z.y, { alpha: 0.3 + 0.45 * f, scale: z.r ? z.r / 72 : 1, tint: z.tint || null });
      }
    }
  });

  // ---- 绘制:敌人(闪白/引信红闪/蓄力预警/精英圈/血条) ----
  g.addDrawer('enemies', ctx => {
    const p = g.player;
    for (const e of g.enemies) {
      if (e.dead || !g.inView(e.x, e.y, 60)) continue; // 视口剔除
      const bob = (e.beh === 1 || e.beh === 7) ? Math.sin(e.t * 7) * 3 : Math.sin(e.t * 5) * 1.5;
      let tint = null;
      if (e.flashT > 0) tint = '#ffffff';
      else if (e.fuse >= 0) tint = Math.sin(e.t * 36) > 0 ? '#ff4444' : null;
      else if (e.state === 1) tint = Math.sin(e.t * 28) > 0 ? '#ffd24a' : null;
      drawSprite(ctx, e.sprite, e.x, e.y + bob, {
        flip: p ? p.x < e.x : false, tint,
        alpha: e.mini ? 0.85 : 1, scale: e.mini ? 0.62 : 1,
      });
      if (e.elite) { // 精英朱砂圈标记
        ctx.strokeStyle = '#b03a2e'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y + bob, e.r + 6, 0, 7); ctx.stroke();
      }
      if ((e.elite || e.boss) && e.hp < e.maxHp) { // 精英/Boss 头顶小血条
        const w = e.r * 1.8, hpf = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(e.x - w / 2, e.y - e.r - 14, w, 4);
        ctx.fillStyle = e.boss ? '#b03a2e' : '#e43b44';
        ctx.fillRect(e.x - w / 2, e.y - e.r - 14, w * hpf, 4);
      }
    }
  });

  // ---- 绘制:弹幕(冲击环为扩张圆环,其余为精灵) ----
  g.addDrawer('projectiles', ctx => {
    for (const pr of g.projectiles) {
      if (!g.inView(pr.x, pr.y, 60 + (pr.ring ? pr.maxR : 0))) continue; // 视口剔除
      if (pr.ring) {
        const f = Math.max(0, pr.r / pr.maxR);
        ctx.globalAlpha = Math.max(0, 0.9 - f * 0.55);
        ctx.strokeStyle = pr.ringCol || '#7df9ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, 7); ctx.stroke();
        ctx.globalAlpha = Math.max(0, 0.35 - f * 0.2);
        if (pr.r > 10) { ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r - 8, 0, 7); ctx.stroke(); }
        ctx.globalAlpha = 1;
      } else {
        drawSprite(ctx, pr.sprite, pr.x, pr.y, { angle: pr.rot || 0, tint: pr.tint || null, scale: pr.scale || 1 });
      }
    }
  });
}
