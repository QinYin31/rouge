// ===== ⚔️ 战斗agent 名下:刷怪导演(时间曲线 / 怪潮包围 / 环带刷怪 / 无尽模式) =====
import { spawnEnemy, combatState } from './enemies.js';

const MAX_E = 180;          // 同屏普通怪上限(CONTRACT v2.1 §4:200→180,超过不刷普通怪)
const TAU = Math.PI * 2;

// 阶段刷怪池:[类型, 权重] —— 0-60s 纸妖/夜枭 → 120s 加骨卫/蛛妖 → 240s 加金刚力士/火药童子 → 360s 加铁甲龟/青灯鬼火
const POOLS = [
  [['slime', 6], ['bat', 3]],
  [['slime', 4], ['bat', 4], ['skeleton', 3]],
  [['slime', 3], ['bat', 3], ['skeleton', 4], ['spider', 3]],
  [['bat', 2], ['skeleton', 4], ['spider', 3], ['brute', 3], ['bomber', 3]],
  [['skeleton', 3], ['spider', 3], ['brute', 4], ['bomber', 3], ['turtle', 2], ['wisp', 3]],
];
function poolIdx(t) { return t < 55 ? 0 : t < 120 ? 1 : t < 240 ? 2 : t < 360 ? 3 : 4; }

function pickWeighted(pool) {
  let tot = 0;
  for (let i = 0; i < pool.length; i++) tot += pool[i][1];
  let r = Math.random() * tot;
  for (let i = 0; i < pool.length; i++) { r -= pool[i][1]; if (r <= 0) return pool[i][0]; }
  return pool[0][0];
}

// 强度曲线(CONTRACT v2.1 §4 后期压力软化):血量成长斜率 -25%(300s 后尤其明显)
// 旧:1 + t/65 + (t/240)²   → 600s ≈ ×16.5,斜率@600s ≈ 0.0362/s
// 新:1 + t/72 + 0.75×(t/300)² → 600s ≈ ×12.3(-25%),斜率@300s -27%、@600s -34%
function hpMultAt(t) { return 1 + t / 72 + 0.75 * (t / 300) * (t / 300); }
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
    const hpM = hpMultAt(t), dmgM = dmgMultAt(t), spdM = spdMultAt(t);
    for (let i = 0; i < budget; i++) {
      if (g.enemies.length >= cap) break;
      ringSpot(g, p);
      // 精英:冷却好了有小概率出现(最小间隔 ~16-24s);360s 后可能出黑无常
      if (eliteCd <= 0 && Math.random() < 0.09) {
        const et = (t >= 360 && Math.random() < 0.4) ? 'reaper' : pickWeighted(pool);
        spawnEnemy(g, et, SP.x, SP.y, { hpMult: hpM, dmgMult: dmgM, speedMult: spdM, elite: true });
        eliteCd = 16 + Math.random() * 8;
        continue;
      }
      spawnEnemy(g, pickWeighted(pool), SP.x, SP.y, { hpMult: hpM, dmgMult: dmgM, speedMult: spdM });
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
  const hpM = hpMultAt(t) * 0.75, dmgM = dmgMultAt(t), spdM = spdMultAt(t);
  for (let i = 0; i < n; i++) {
    if (g.enemies.length >= MAX_E) break;
    const a = off + (i / n) * TAU + (Math.random() - 0.5) * 0.15;
    spawnEnemy(g, type, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, { hpMult: hpM, dmgMult: dmgM, speedMult: spdM });
  }
  g.spawnText(p.x, p.y - 70, '怪潮来袭!', { color: '#b03a2e', size: 20, life: 1.6 });
}

// 通关后无尽模式:继续刷怪且强度随时间继续增长
export function setEndless(g) {
  endless = true;
  g._endless = true;
  g._finalBoss = false;
}
