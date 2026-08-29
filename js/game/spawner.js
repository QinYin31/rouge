// ===== ⚔️ 战斗agent 名下:刷怪导演(时间曲线 / 怪潮包围 / 环带刷怪 / 无尽模式) =====
import { spawnEnemy, combatState } from './enemies.js';

const MAX_E = 220;          // 同屏普通怪上限(超过不刷普通怪)
const TAU = Math.PI * 2;

// 阶段刷怪池:[类型, 权重] —— 0-60s 史莱姆/蝙蝠 → 120s 加骷髅/蜘蛛 → 240s 加蛮兵/自爆虫 → 360s 加岩龟/鬼火
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

// 强度曲线:血量随时间平滑指数缓增(600s ≈ ×16.5),伤害 ×3.5,速度 ×1.3 封顶
function hpMultAt(t) { return 1 + t / 65 + (t / 240) * (t / 240); }
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

    // 怪潮:每 45~60s 一圈同种怪环形包围
    hordeT -= dt;
    if (hordeT <= 0) {
      hordeT = (endless ? 38 : 46) + Math.random() * 14;
      doHorde(g, p, t);
    }

    // 持续小怪:间隔随时间缩短(0.9s → 0.24s,无尽 0.15s)
    eliteCd -= dt;
    const interval = Math.max(endless ? 0.15 : 0.24, 0.9 - t * 0.0011);
    acc += dt;
    let budget = (acc / interval) | 0;
    acc -= budget * interval;
    if (budget > 8) budget = 8;
    if (budget <= 0) return;
    const pool = POOLS[poolIdx(t)];
    const hpM = hpMultAt(t), dmgM = dmgMultAt(t), spdM = spdMultAt(t);
    for (let i = 0; i < budget; i++) {
      if (g.enemies.length >= MAX_E) break;
      ringSpot(g, p);
      // 精英:冷却好了有小概率出现(最小间隔 ~16-24s);360s 后可能出死神
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

// 怪潮:一圈同种怪包围玩家(血量 ×0.75,数量随时间增加到 30)
function doHorde(g, p, t) {
  if (g.enemies.length > 170) return;
  const type = pickWeighted(POOLS[poolIdx(t)]);
  const zoom = g.cam ? g.cam.zoom : 1;
  const R = Math.hypot(g.w, g.h) / (2 * zoom) + 60;
  const n = Math.min(30, 14 + ((t / 45) | 0));
  const off = Math.random() * TAU;
  const hpM = hpMultAt(t) * 0.75, dmgM = dmgMultAt(t), spdM = spdMultAt(t);
  for (let i = 0; i < n; i++) {
    if (g.enemies.length >= MAX_E) break;
    const a = off + (i / n) * TAU + (Math.random() - 0.5) * 0.15;
    spawnEnemy(g, type, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, { hpMult: hpM, dmgMult: dmgM, speedMult: spdM });
  }
  g.spawnText(p.x, p.y - 70, '怪潮来袭!', { color: '#e43b44', size: 20, life: 1.6 });
}

// 通关后无尽模式:继续刷怪且强度随时间继续增长
export function setEndless(g) {
  endless = true;
  g._endless = true;
  g._finalBoss = false;
}
