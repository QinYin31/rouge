// ===== ⚔️ 战斗agent 名下:升级池与商店数据 =====
// rollChoices 只读不改等级;applyChoice 落实加成(被动写 p.bonuses 后 p.recalc())。
import { WEAPONS, WEAPON_ORDER, MAX_WEAPONS, makeWeapon } from './weapons.js';
import { combatState } from './enemies.js';
import { Save } from '../core/save.js';

// 8 种局内被动(权重方向与商店一致,数值更强)
export const PASSIVES = {
  might:  { name: '力量之书', icon: 'p_might',  maxLv: 5, desc: '攻击伤害 +12%/级' },
  cd:     { name: '沙漏',     icon: 'p_cd',     maxLv: 5, desc: '武器冷却 -8%/级' },
  speed:  { name: '疾风靴',   icon: 'p_speed',  maxLv: 5, desc: '移动速度 +8%/级' },
  hp:     { name: '生命之心', icon: 'p_hp',     maxLv: 5, desc: '最大生命 +20/级' },
  magnet: { name: '磁石',     icon: 'p_magnet', maxLv: 5, desc: '拾取范围 +25/级' },
  xp:     { name: '贤者帽',   icon: 'p_xp',     maxLv: 5, desc: '经验获取 +10%/级' },
  gold:   { name: '聚宝袋',   icon: 'p_gold',   maxLv: 5, desc: '金币获取 +15%/级' },
  armor:  { name: '铁甲',     icon: 'p_armor',  maxLv: 5, desc: '护甲 +1/级' },
};

// 8 种商店永久强化(开局经 applyShopBonuses 应用;护甲商店上限 2 级)
export const SHOP_UPGRADES = [
  { id: 'might',  name: '力量', desc: '伤害 +4%/级',    icon: 'p_might',  max: 5, cost: [30, 80, 160, 300, 520] },
  { id: 'hp',     name: '体质', desc: '生命 +8/级',     icon: 'p_hp',     max: 5, cost: [30, 80, 160, 300, 520] },
  { id: 'speed',  name: '敏捷', desc: '移速 +2%/级',    icon: 'p_speed',  max: 5, cost: [25, 70, 140, 260, 460] },
  { id: 'cd',     name: '专注', desc: '冷却 -2%/级',    icon: 'p_cd',     max: 5, cost: [40, 90, 180, 320, 560] },
  { id: 'magnet', name: '贪婪', desc: '拾取范围 +8/级', icon: 'p_magnet', max: 5, cost: [20, 60, 120, 240, 420] },
  { id: 'xp',     name: '聪慧', desc: '经验 +3%/级',    icon: 'p_xp',     max: 5, cost: [35, 85, 170, 310, 540] },
  { id: 'gold',   name: '财运', desc: '金币 +5%/级',    icon: 'p_gold',   max: 5, cost: [25, 70, 140, 260, 460] },
  { id: 'armor',  name: '坚韧', desc: '护甲 +1/级',     icon: 'p_armor',  max: 2, cost: [120, 400] },
];

const PASSIVE_BONUS = {
  might:  { key: 'mightMult',  mode: 'mult', v: 0.12 },
  cd:     { key: 'cdMult',     mode: 'mult', v: -0.08 },
  speed:  { key: 'speedMult',  mode: 'mult', v: 0.08 },
  hp:     { key: 'hpFlat',     mode: 'add',  v: 20 },
  magnet: { key: 'magnetFlat', mode: 'add',  v: 25 },
  xp:     { key: 'xpMult',     mode: 'mult', v: 0.10 },
  gold:   { key: 'goldMult',   mode: 'mult', v: 0.15 },
  armor:  { key: 'armorFlat',  mode: 'add',  v: 1 },
};

// 保底项(全满时):金币袋 / 大金币袋 / 烤肉,id 互不相同
function goldChoice(amount, big) {
  return big
    ? { kind: 'gold', id: 'gold_big', name: '大金币袋', desc: `+${amount} 金币`, icon: 'coin', amount }
    : { kind: 'gold', id: 'gold', name: '金币袋', desc: `+${amount} 金币`, icon: 'coin', amount };
}
function healChoice(p) {
  return { kind: 'heal', id: 'heal', name: '烤肉', desc: `回复 ${45} 生命`, icon: 'meat', heal: 45,
    _skip: p.hp >= p.stats.maxHp - 0.5 };
}

// 被动等级记录在 g.passiveLv(main 开局创建)
export function rollChoices(g) {
  const p = g.player;
  const plv = g.passiveLv || (g.passiveLv = {});
  const cands = [];
  // 升级已有武器(权重最高)
  for (const w of p.weapons) {
    const d = WEAPONS[w.id];
    if (w.lv < d.maxLv) {
      cands.push({
        kind: 'weapon', id: w.id, icon: d.icon, w: 10,
        name: `${d.name} Lv.${w.lv + 1}`,
        desc: d.lvText[Math.min(d.lvText.length - 1, w.lv)],
      });
    }
  }
  // 新武器(未满 4 把)
  if (p.weapons.length < MAX_WEAPONS) {
    const owned = new Set(p.weapons.map(x => x.id));
    for (const id of WEAPON_ORDER) {
      if (owned.has(id)) continue;
      const d = WEAPONS[id];
      cands.push({ kind: 'newWeapon', id, name: d.name, desc: d.desc, icon: d.icon, w: 6 });
    }
  }
  // 被动
  for (const id in PASSIVES) {
    if ((plv[id] || 0) < PASSIVES[id].maxLv) {
      const d = PASSIVES[id];
      cands.push({ kind: 'passive', id, name: d.name, desc: d.desc, icon: d.icon, w: 7 });
    }
  }
  // 全满保底:金币 / 回血
  if (!cands.length) {
    return [goldChoice(25), healChoice(p), goldChoice(60, true)];
  }
  // 加权不重复抽 3 项(避免重复项)
  const pool = cands.slice();
  const out = [];
  while (out.length < 3 && pool.length) {
    let tot = 0;
    for (let i = 0; i < pool.length; i++) tot += pool[i].w;
    let r = Math.random() * tot, idx = 0;
    for (let i = 0; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) { idx = i; break; } }
    out.push(pool.splice(idx, 1)[0]);
  }
  // 不足 3 项时补保底(满血时不给回血项)
  const fills = [goldChoice(25), healChoice(p), goldChoice(60, true)];
  for (let i = 0; i < fills.length && out.length < 3; i++) {
    if (fills[i]._skip) continue;
    out.push(fills[i]);
  }
  while (out.length < 3) out.push(goldChoice(25));
  return out;
}

export function applyChoice(g, c) {
  const p = g.player;
  if (c.kind === 'newWeapon') {
    if (p.weapons.length < MAX_WEAPONS) p.weapons.push(makeWeapon(c.id));
  } else if (c.kind === 'weapon') {
    const w = p.weapons.find(x => x.id === c.id);
    if (w && w.lv < WEAPONS[w.id].maxLv) w.lv++;
  } else if (c.kind === 'passive') {
    g.passiveLv[c.id] = (g.passiveLv[c.id] || 0) + 1;
    const b = PASSIVE_BONUS[c.id], bon = p.bonuses;
    if (b.mode === 'mult') bon[b.key] *= (1 + b.v);
    else bon[b.key] += b.v;
    p.recalc();
  } else if (c.kind === 'gold') {
    g.stats.gold += c.amount || 25;
  } else if (c.kind === 'heal') {
    p.hp = Math.min(p.stats.maxHp, p.hp + (c.heal || 45));
  }
}

// 开局时把商店永久强化应用到玩家(main 调用;同时标记本局开始)
export function applyShopBonuses(p) {
  combatState.runActive = true;
  const shop = (Save.data && Save.data.shop) || {};
  const map = {
    might: 'mightMult', hp: 'hpFlat', speed: 'speedMult', cd: 'cdMult',
    magnet: 'magnetFlat', xp: 'xpMult', gold: 'goldMult', armor: 'armorFlat',
  };
  const mult = { mightMult: 0.04, speedMult: 0.02, cdMult: -0.02, xpMult: 0.03, goldMult: 0.05 };
  const add = { hpFlat: 8, magnetFlat: 8, armorFlat: 1 };
  for (const id in map) {
    const lv = shop[id] || 0, key = map[id];
    for (let i = 0; i < lv; i++) {
      if (key in mult) p.bonuses[key] *= (1 + mult[key]);
      else p.bonuses[key] += add[key];
    }
  }
  p.recalc();
}
