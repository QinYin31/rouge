// ===== ⚔️ 战斗agent 名下:Boss 系统(300s 石像守卫 / 600s 无常尊者 / 无尽复读) =====
// Boss 类型定义在 enemies.js 的 ENEMY_TYPES 中(不进常规刷怪池),行为 AI 由 enemies.js 按 beh 驱动;
// 本模块负责:定时召唤、血条引用 g.boss、死亡大爆炸/震屏/宝箱、最终 Boss 通关事件。
import { spawnEnemy, shakeIf, combatState } from './enemies.js?v=17';
import { Bus } from '../core/engine.js?v=17';

// Boss 独立生命设计:不跟随普通怪血量曲线,只按 Boss 战时间和无尽进度增长。
export const BOSS_DESIGNS = Object.freeze({
  boss_golem: { baseHp: 24000, startTime: 300, growthPeriod: 1200 },
  boss_overlord: { baseHp: 120000, startTime: 600, growthPeriod: 2400 },
});

export function bossHpAt(typeId, t) {
  const d = BOSS_DESIGNS[typeId];
  if (!d) return 0;
  const elapsed = Math.max(0, (Number(t) || 0) - d.startTime);
  return Math.round(d.baseHp * (1 + elapsed / d.growthPeriod));
}

export function initBoss(g) {
  let s300 = false, s600 = false, victorySent = false, endlessArmed = false, nextGolem = 0;

  g.addReset(() => {
    s300 = s600 = false; victorySent = false; endlessArmed = false; nextGolem = 0;
    g._finalBoss = false;
    combatState.runActive = false;
  });

  function spawnBoss(typeId, t, dmgMult) {
    const p = g.player;
    const design = BOSS_DESIGNS[typeId];
    const a = Math.random() * Math.PI * 2;
    const hp = bossHpAt(typeId, t);
    const b = spawnEnemy(g, typeId, p.x + Math.cos(a) * 470, p.y + Math.sin(a) * 470, {
      hpOverride: hp, dmgMult,
    });
    b.bossHpDesign = design.baseHp;
    g.boss = b; // HUD 血条
    Bus.emit('boss-spawn', { name: b.name }); // main:音效 + 震屏 + 出场提示
    return b;
  }

  g.addUpdater(() => {
    if (!g.player || !combatState.runActive) return;
    const t = g.time;
    // 300s 小 Boss:石像守卫(冲撞型)
    if (!s300 && t >= 300) {
      s300 = true;
      spawnBoss('boss_golem', t, 1.1 + t / 1800);
    }
    // 600s 最终 Boss:无常尊者(三阶段弹幕型)
    if (!s600 && t >= 600) {
      s600 = true;
      g._finalBoss = true; // 通知 spawner 停止常规刷怪
      spawnBoss('boss_overlord', t, 1.1);
    }
    // 无尽模式:每 150s 复读石像守卫(强度继续随时间增长)
    if (g._endless) {
      if (!endlessArmed) { endlessArmed = true; nextGolem = t + 120; }
      else if (t >= nextGolem && (!g.boss || g.boss.dead)) {
        nextGolem = t + 150;
        spawnBoss('boss_golem', t, 1 + t / 600);
      }
    }
  });

  // Boss 死亡:大爆炸粒子 + 震屏 + 掉宝箱;最终 Boss → 通关(只发一次)
  Bus.on('enemy-death', e => {
    if (!e || !e.boss) return;
    const final = e.type === 'boss_overlord';
    g.addParticles(e.x, e.y, { n: final ? 46 : 30, color: final ? '#e43b44' : '#b55088', speed: 230, life: 0.8, size: 5, grav: 60 });
    g.addParticles(e.x, e.y, { n: 18, color: '#fee761', speed: 160, life: 0.6, size: 4 });
    shakeIf(g, final ? 12 : 8, 0.6);
    g.addPickup({ kind: 'chest', x: e.x, y: e.y, sprite: 'chest', r: 10, t: 0 });
    if (g.boss === e) g.boss = null;
    if (final && !victorySent) {
      victorySent = true;
      Bus.emit('runend', { victory: true });
    }
  });
}
