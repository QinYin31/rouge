// ===== ⚔️ 战斗agent 名下:局内升级池(水墨江湖版 + 进化选项 + 组合推荐) =====
// rollChoices 只读不改等级;applyChoice 落实加成(被动写 p.bonuses 后 p.recalc())。
// 进化(CONTRACT v2):武器 Lv5 + 绑定被动 Lv5 → 金色 evolve 选项必占一档,每武器仅一次。
// 组合推荐(CONTRACT v2.2 §8):输出项可带 rec 字符串标记——
//   ① '可进化·绝学名':选项是满级未进化武器的绑定心法;或新武器/武器升级的绑定心法已 ≥4 级
//   ② '联动·阴阳相激':已有焚天系,选项含墨雨/墨染乾坤
//   ③ '联动·感电连锁':已有五雷↔墨雨系任一侧,选项为另一侧
//   rec 项排序置前;evolve 卡依旧最高优先(与 rec 共存时 evolve 在前);抽取概率逻辑不变。
import { WEAPONS, WEAPON_ORDER, MAX_WEAPONS, makeWeapon } from './weapons.js?v=17';
import { combatState } from './enemies.js?v=17';
import { Bus } from '../core/engine.js?v=17';

// 9 种局内被动(数值更强);crit 暴击之眼只进升级池
export const PASSIVES = {
  might:  { name: '力量',     icon: 'p_might',  maxLv: 5, desc: '内力浑厚,攻击伤害 +12%/级' },
  cd:     { name: '沙漏',     icon: 'p_cd',     maxLv: 5, desc: '心如止水,武器冷却 -8%/级' },
  speed:  { name: '疾风靴',   icon: 'p_speed',  maxLv: 5, desc: '身法 +8%/级,冲刺冷却 -4%/级' },
  hp:     { name: '生命之心', icon: 'p_hp',     maxLv: 5, desc: '气血充盈,生命上限 +20/级' },
  magnet: { name: '磁石',     icon: 'p_magnet', maxLv: 5, desc: '摄物摘星,拾取范围 +25/级' },
  xp:     { name: '贤者帽',   icon: 'p_xp',     maxLv: 5, desc: '悟性超绝,经验获取 +10%/级' },
  gold:   { name: '聚宝袋',   icon: 'p_gold',   maxLv: 5, desc: '财气随身,金币获取 +15%/级' },
  armor:  { name: '铁甲',     icon: 'p_armor',  maxLv: 5, desc: '金钟罩体,护甲 +1/级' },
  crit:   { name: '暴击之眼', icon: 'p_crit',   maxLv: 5, desc: '慧眼窥破绽,暴击率 +6%/级' },
};

const PASSIVE_BONUS = {
  might:  { key: 'mightMult',  mode: 'mult', v: 0.12 },
  cd:     { key: 'cdMult',     mode: 'mult', v: -0.08 },
  speed:  { key: 'speedMult',  mode: 'mult', v: 0.08 },
  hp:     { key: 'hpFlat',     mode: 'add',  v: 20 },
  magnet: { key: 'magnetFlat', mode: 'add',  v: 25 },
  xp:     { key: 'xpMult',     mode: 'mult', v: 0.10 },
  gold:   { key: 'goldMult',   mode: 'mult', v: 0.15 },
  armor:  { key: 'armorFlat',  mode: 'add',  v: 1 },
  // crit 无 bonuses 槽:applyChoice 在 recalc 后按等级直接写入 p.stats.crit
};

// 保底项(全满时):金币袋 / 大金币袋 / 馒头,id 互不相同
function goldChoice(amount, big) {
  return big
    ? { kind: 'gold', id: 'gold_big', name: '大金币袋', desc: `+${amount} 金币`, icon: 'coin', amount }
    : { kind: 'gold', id: 'gold', name: '金币袋', desc: `+${amount} 金币`, icon: 'coin', amount };
}
function healChoice(p) {
  return { kind: 'heal', id: 'heal', name: '馒头', desc: `回复 ${45} 生命`, icon: 'meat', heal: 45,
    _skip: p.hp >= p.stats.maxHp - 0.5 };
}

// ---- CONTRACT v2.2 §8:组合技推荐标记 ----
// 判定单个选项的 rec 文案(无推荐返回 null);可进化优先于联动。
// 只读 p.weapons 与 g.passiveLv + WEAPONS[id].evo 绑定关系,不改抽取概率。
function recFor(g, c, plv) {
  const p = g.player;
  const own = id => { for (const w of p.weapons) if (w.id === id) return true; return false; };
  if (c.kind === 'passive') { // ① 满级未进化武器的绑定心法 → 即将可进化
    for (const w of p.weapons) {
      const d = WEAPONS[w.id];
      if (w.lv >= d.maxLv && !w.evolved && d.evo && d.evo.passive === c.id) return '可进化·' + d.evo.evoName;
    }
    return null;
  }
  if (c.kind === 'newWeapon' || c.kind === 'weapon') { // ② 绑定心法已 ≥4 级 → 取此武器即可进化
    const d = WEAPONS[c.id];
    if (d && d.evo && (plv[d.evo.passive] || 0) >= 3) return '可进化·' + d.evo.evoName;
    // ③ 协同向:焚天↔墨雨系(阴阳相激)、五雷↔墨雨系(感电连锁)
    if (c.id === 'holy') {
      if (own('fireball')) return '联动·阴阳相激';
      if (own('lightning')) return '联动·感电连锁';
    } else if (c.id === 'lightning' && own('holy')) return '联动·感电连锁';
    return null;
  }
  if (c.kind === 'evolve' && c.id === 'holy') { // 墨染乾坤进化卡与协同标记共存(evolve 排序仍在前)
    if (own('fireball')) return '联动·阴阳相激';
    if (own('lightning')) return '联动·感电连锁';
  }
  return null;
}

// 加权不重复抽一项(从 pool 中 splice 移除)
function weightedPick(pool) {
  let tot = 0;
  for (let i = 0; i < pool.length; i++) tot += pool[i].w;
  let r = Math.random() * tot;
  for (let i = 0; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) return pool.splice(i, 1)[0]; }
  return pool.splice(0, 1)[0];
}

// 被动等级记录在 g.passiveLv(main 开局创建;crit 等新键由 applyChoice 动态补)
export function rollChoices(g) {
  const p = g.player;
  const plv = g.passiveLv || (g.passiveLv = {});
  const cands = [];
  // 进化候选:武器满级 + 绑定被动满级 + 尚未进化 → 必占一档(最高权重)
  const evoIds = [];
  for (const w of p.weapons) {
    const d = WEAPONS[w.id];
    if (w.lv < d.maxLv) {
      cands.push({
        kind: 'weapon', id: w.id, icon: d.icon, w: 10,
        name: `${d.name} Lv.${w.lv + 1}`,
        desc: d.lvText[Math.min(d.lvText.length - 1, w.lv)],
      });
    } else if (!w.evolved) {
      const evo = d.evo;
      if (evo && (plv[evo.passive] || 0) >= Math.min(3, PASSIVES[evo.passive].maxLv)) evoIds.push(w.id); // 门槛:心法3级(v2.3 下调)
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
  // 被动(含 crit 暴击之眼)
  for (const id in PASSIVES) {
    if ((plv[id] || 0) < PASSIVES[id].maxLv) {
      const d = PASSIVES[id];
      cands.push({ kind: 'passive', id, name: d.name, desc: d.desc, icon: d.icon, w: 7 });
    }
  }
  const out = [];
  if (evoIds.length) { // 进化项独占一档,另两档为普通项
    const id = evoIds[(Math.random() * evoIds.length) | 0];
    const d = WEAPONS[id], evo = d.evo;
    out.push({ kind: 'evolve', id, name: `⚡进化·${evo.evoName}`, desc: evo.desc, icon: evo.icon, evo: true });
  }
  if (!out.length && !cands.length) { // 全满保底:金币 / 回血
    return [goldChoice(25), healChoice(p), goldChoice(60, true)];
  }
  const pool = cands.slice();
  while (out.length < 3 && pool.length) out.push(weightedPick(pool));
  // 不足 3 项时补保底(满血时不给回血项)
  const fills = [goldChoice(25), healChoice(p), goldChoice(60, true)];
  for (let i = 0; i < fills.length && out.length < 3; i++) {
    if (fills[i]._skip) continue;
    out.push(fills[i]);
  }
  while (out.length < 3) out.push(goldChoice(25));
  // rec 标记 + 排序(v2.2 §8):evolve 卡仍最前,rec 项次之;稳定排序,同档保持抽取顺序
  for (let i = 0; i < out.length; i++) {
    const r = recFor(g, out[i], plv);
    if (r) out[i].rec = r;
  }
  if (out.some(c => c.rec)) {
    const rank = c => (c.kind === 'evolve' ? 0 : c.rec ? 1 : 2);
    out.sort((a, b) => rank(a) - rank(b));
  }
  return out;
}

export function applyChoice(g, c) {
  const p = g.player;
  if (c.kind === 'newWeapon') {
    if (p.weapons.length < MAX_WEAPONS) p.weapons.push(makeWeapon(c.id));
  } else if (c.kind === 'weapon') {
    const w = p.weapons.find(x => x.id === c.id);
    if (w && w.lv < WEAPONS[w.id].maxLv) w.lv++;
  } else if (c.kind === 'evolve') { // 武器进化:实例原地升级为超武形态
    const w = p.weapons.find(x => x.id === c.id);
    if (w && !w.evolved) {
      w.evolved = true;
      w.evoId = c.id;
      const evo = WEAPONS[c.id].evo;
      g.addParticles(p.x, p.y, { n: 26, color: '#b03a2e', speed: 200, life: 0.8, size: 5, grav: 40 });
      g.spawnText(p.x, p.y - 64, `${evo.evoName}!`, { color: '#b03a2e', size: 24, life: 1.6 });
      Bus.emit('sfx', 'levelup');
    }
  } else if (c.kind === 'passive') {
    g.passiveLv[c.id] = (g.passiveLv[c.id] || 0) + 1;
    const b = PASSIVE_BONUS[c.id];
    if (b) {
      const bon = p.bonuses;
      if (b.mode === 'mult') bon[b.key] *= (1 + b.v);
      else bon[b.key] += b.v;
    }
    if (c.id === 'speed') p.dashCdMul = (p.dashCdMul || 1) * 0.96; // 疾风靴:冲刺冷却 -4%/级
    p.recalc();
    // 暴击之眼:recalc 后按角色基础暴击叠加(基础 10% + 6%/级)
    p.stats.crit = (p.charBonus.crit || 0.1) + 0.06 * (g.passiveLv.crit || 0);
  } else if (c.kind === 'gold') {
    g.stats.gold += c.amount || 25;
  } else if (c.kind === 'heal') {
    p.hp = Math.min(p.stats.maxHp, p.hp + (c.heal || 45));
  }
}
