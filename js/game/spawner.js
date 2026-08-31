// ===== ⚔️ 战斗agent 名下:刷怪导演(时间曲线 / 怪潮包围 / 环带刷怪 / 无尽模式) =====
import { spawnEnemy, ENEMY_TYPES, combatState } from './enemies.js?v=17';

const MAX_E = 180;          // 同屏普通怪上限(CONTRACT v2.1 §4:200→180,超过不刷普通怪)
const TAU = Math.PI * 2;

// 阶段刷怪池:[类型, 权重] —— 0-60s 纸妖/夜枭 → 120s 加骨卫/蛛妖 → 240s 加金刚力士/火药童子 → 360s 加铁甲龟/青灯鬼火
const POOLS = [
  [['slime', 6], ['bat', 3]],
  [['slime', 4], ['bat', 4], ['skeleton', 3]],
  [['slime', 3], ['bat', 3], ['skeleton', 4], ['spider', 3], ['qinglu', 1]],
  [['bat', 2], ['skeleton', 4], ['spider', 3], ['brute', 3], ['bomber', 3], ['qinglu', 2], ['mire', 1]],
  [['skeleton', 3], ['spider', 3], ['brute', 4], ['bomber', 3], ['turtle', 2], ['wisp', 3], ['qinglu', 2], ['mire', 2], ['summoner', 1]],
];
function poolIdx(t) { return t < 55 ? 0 : t < 120 ? 1 : t < 240 ? 2 : t < 360 ? 3 : 4; }

function pickWeighted(pool) {
  let tot = 0;
  for (let i = 0; i < pool.length; i++) tot += pool[i][1];
  let r = Math.random() * tot;
  for (let i = 0; i < pool.length; i++) { r -= pool[i][1]; if (r <= 0) return pool[i][0]; }
  return pool[0][0];
}

// 普通怪血量曲线：前期平缓，240s 后明显加压，避免后期低基础血量怪被一击清空。
// 采样点:0s×1.00 / 60s×1.35 / 120s×1.90 / 300s×6.50 / 600s×28.00。
const HP_POINTS = [[0, 1], [60, 1.35], [120, 1.9], [300, 6.5], [450, 15], [600, 28]];
// 精英单独走较缓曲线，再叠加精英自身×6，避免普通怪加压后精英膨胀到不可控。
const ELITE_HP_POINTS = [[0, 1], [60, 1.2], [120, 1.55], [300, 3.5], [450, 5.8], [600, 8]];
const NORMAL_HP_TAIL = 0.06; // 600s 后每秒继续增加 0.06 倍,无尽模式仍有成长
const ELITE_HP_TAIL = 0.018;

function curveAt(t, points, tail = 0) {
  const sec = Math.max(0, Number(t) || 0);
  if (sec >= points[points.length - 1][0]) {
    return points[points.length - 1][1] + (sec - points[points.length - 1][0]) * tail;
  }
  for (let i = 1; i < points.length; i++) {
    const [t1, v1] = points[i];
    if (sec <= t1) {
      const [t0, v0] = points[i - 1];
      const f0 = (sec - t0) / (t1 - t0);
      const f = f0 * f0 * (3 - 2 * f0); // smoothstep,避免阶段切换时血量跳变
      return v0 + (v1 - v0) * f;
    }
  }
  return points[points.length - 1][1];
}

export function hpMultAt(t) { return curveAt(t, HP_POINTS, NORMAL_HP_TAIL); }
export function eliteHpMultAt(t) { return curveAt(t, ELITE_HP_POINTS, ELITE_HP_TAIL); }

// 低基础血量怪的后期保底:600s 时至少 735HP,保证进化武器单发也不能随手秒掉。
export function minOrdinaryHpAt(t) {
  return Math.max(0, (Number(t) || 0) - 180) * 1.75;
}

export function spawnHpMultAt(typeId, t, { elite = false, horde = false } = {}) {
  const type = ENEMY_TYPES[typeId];
  if (!type) return 1;
  const normalCurve = hpMultAt(t);
  const floor = minOrdinaryHpAt(t) / Math.max(1, type.hp);
  if (elite) return Math.max(eliteHpMultAt(t), floor);
  const curve = normalCurve * (horde ? 0.75 : 1);
  return Math.max(curve, floor);
}
function dmgMultAt(t) { return 1 + t / 240; }
function spdMultAt(t) { return 1 + Math.min(0.3, t / 2000); }

let endless = false;
// 复用的刷怪坐标(热路径零分配)
const SP = { x: 0, y: 0 };

// 视野外缘环带上取点
function ringSpot(g, p) {
  const zoom = g.cam ? g.cam.zoom : 1;
  const R = Math.hypot(g.w, g.h) / (2 * zoom) + 50 + Math.random() * 150;
  const a = Math.random() * TAU;
  SP.x = p.x + Math.cos(a) * R;
  SP.y = p.y + Math.sin(a) * R;
}

export function initSpawner(g) {
  let acc = 0, hordeT = 42, eliteCd = 15;
  g.addReset(() => {
    acc = 0; hordeT = 42; eliteCd = 15; endless = false;
    g._finalBoss = false; g._endless = false;
    combatState.runActive = false;
  });

  g.addUpdater(dt => {
    const p = g.player;
    if (!p || !combatState.runActive) return;
    const t = g.time;
    // 600s 后交给 Boss 流程(最终 Boss 期间停刷);无尽模式解除限制
    if (!endless && (t >= 600 || g._finalBoss)) return;
    // 前 120s 玩家尚在成长期,刷怪密度与同屏上限下调 15%,2 分钟后恢复原曲线
    const early = !endless && t < 120;
    const cap = early ? (MAX_E * 0.85) | 0 : MAX_E;

    // 怪潮:每 45~60s 一圈同种怪环形包围
    hordeT -= dt;
    if (hordeT <= 0) {
      hordeT = (endless ? 38 : 46) + Math.random() * 14;
      doHorde(g, p, t, early);
    }

    // 持续小怪:间隔随时间缩短(0.9s → 360s 时 0.504s → 600s 时 0.348s);360s 后收缩放缓(后期密度增长放缓,
    // 旧曲线 600s 收缩至 0.24s);前 120s 间隔 ×1/0.85(密度 -15%);无尽 0.15s 下限
    eliteCd -= dt;
    const base = Math.max(endless ? 0.15 : 0.26,
      0.9 - Math.min(t, 360) * 0.0011 - Math.max(0, t - 360) * 0.00065);
    const interval = early ? base / 0.85 : base;
    acc += dt;
    let budget = (acc / interval) | 0;
    acc -= budget * interval;
    if (budget > 8) budget = 8;
    if (budget <= 0) return;
    const pool = POOLS[poolIdx(t)];
    const dmgM = dmgMultAt(t), spdM = spdMultAt(t);
    for (let i = 0; i < budget; i++) {
      if (g.enemies.length >= cap) break;
      ringSpot(g, p);
      // 精英:冷却好了有小概率出现(最小间隔 ~16-24s);360s 后可能出黑无常
      if (eliteCd <= 0 && Math.random() < 0.09) {
        const et = (t >= 360 && Math.random() < 0.4) ? 'reaper' : pickWeighted(pool);
        spawnEnemy(g, et, SP.x, SP.y, { hpMult: spawnHpMultAt(et, t, { elite: true }), dmgMult: dmgM, speedMult: spdM, elite: true });
        eliteCd = 16 + Math.random() * 8;
        continue;
      }
      const type = pickWeighted(pool);
      spawnEnemy(g, type, SP.x, SP.y, { hpMult: spawnHpMultAt(type, t), dmgMult: dmgM, speedMult: spdM });
    }
  });
}

// 怪潮:一圈同种怪包围玩家(血量 ×0.75;数量随时间增加但 360s 后放缓:
// 14+8@360s → 24@600s(旧曲线 27);前期数量 -15%)
function doHorde(g, p, t, early) {
  if (g.enemies.length > (early ? 145 : 165)) return;
  const type = pickWeighted(POOLS[poolIdx(t)]);
  const zoom = g.cam ? g.cam.zoom : 1;
  const R = Math.hypot(g.w, g.h) / (2 * zoom) + 60;
  let n = 14 + ((Math.min(t, 360) / 45) | 0) + ((Math.max(0, t - 360) / 90) | 0);
  if (n > 30) n = 30;
  if (early) n = (n * 0.85) | 0;
  const off = Math.random() * TAU;
  const dmgM = dmgMultAt(t), spdM = spdMultAt(t);
  for (let i = 0; i < n; i++) {
    if (g.enemies.length >= MAX_E) break;
    const a = off + (i / n) * TAU + (Math.random() - 0.5) * 0.15;
    spawnEnemy(g, type, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, {
      hpMult: spawnHpMultAt(type, t, { horde: true }), dmgMult: dmgM, speedMult: spdM,
    });
  }
  g.spawnText(p.x, p.y - 70, '怪潮来袭!', { color: '#b03a2e', size: 20, life: 1.6 });
}

// 通关后无尽模式:继续刷怪且强度随时间继续增长
export function setEndless(g) {
  endless = true;
  g._endless = true;
  g._finalBoss = false;
}
