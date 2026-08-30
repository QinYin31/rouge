// ===== 拾取物:宝石/金币/肉/磁铁/宝箱(带视口剔除与数量上限合并,保流畅) =====
import { drawSprite } from '../sprites.js?v=11';
import { Bus } from '../core/engine.js?v=11';

const MAX_PICKUPS = 320; // 超限时最旧宝石并入相邻宝石(防后期上千掉落物拖垮绘制)

export function initPickups(g) {
  // 敌人死亡掉落:宝石/金币 + 肉(回血)+ 精英与 Boss 必掉宝箱
  Bus.on('enemy-death', e => {
    const tier = e.xp >= 5 ? 'gem_r' : e.xp >= 2 ? 'gem_g' : 'gem_b';
    g.addPickup({ kind: 'gem', x: e.x, y: e.y, sprite: tier, xp: e.xp, r: 8, t: Math.random() * 7 });
    if (Math.random() < e.coinP) g.addPickup({ kind: 'coin', x: e.x + 8, y: e.y, sprite: 'coin', gold: 3, r: 8, t: 0 });
    if (Math.random() < (e.elite ? 0.45 : 0.018))
      g.addPickup({ kind: 'meat', x: e.x - 10, y: e.y + 6, sprite: 'meat', heal: 25, r: 9, t: Math.random() * 7 });
    if (e.elite || e.boss) {
      const nChest = e.boss ? 2 : 1;
      for (let i = 0; i < nChest; i++)
        g.addPickup({ kind: 'chest', x: e.x + (i - (nChest - 1) / 2) * 26, y: e.y + 10, sprite: 'chest', r: 12, t: 0 });
    }
  });

  // 超限合并:把最旧宝石的 xp 并入相邻宝石(每帧至多一次,摊平开销)
  const mergeOldest = () => {
    if (g.pickups.length <= MAX_PICKUPS) return;
    for (let i = 0; i < g.pickups.length; i++) {
      const a = g.pickups[i];
      if (a.kind !== 'gem') continue;
      for (let j = i + 1; j < g.pickups.length; j++) {
        const b = g.pickups[j];
        if (b.kind !== 'gem') continue;
        const dx = a.x - b.x, dy = a.y - b.y;
        if (dx * dx + dy * dy < 260 * 260) {
          a.xp += b.xp;
          a.sprite = a.xp >= 5 ? 'gem_r' : a.xp >= 2 ? 'gem_g' : 'gem_b';
          g.remove(g.pickups, j);
          return;
        }
      }
      // 找不到相邻宝石就直接并入第二个宝石(任意距离,保上限)
      for (let j = i + 1; j < g.pickups.length; j++) {
        const b = g.pickups[j];
        if (b.kind === 'gem') { a.xp += b.xp; a.sprite = a.xp >= 5 ? 'gem_r' : a.xp >= 2 ? 'gem_g' : 'gem_b'; g.remove(g.pickups, j); return; }
      }
      return;
    }
  };

  g.addUpdater(dt => {
    mergeOldest();
    const p = g.player;
    const mag = p.stats.magnet, mag2 = mag * mag;
    for (let i = g.pickups.length - 1; i >= 0; i--) {
      const k = g.pickups[i];
      k.t += dt;
      const dx = p.x - k.x, dy = p.y - k.y, d2 = dx * dx + dy * dy;
      const scan = Math.max(mag, 260) + 40;
      if (d2 > scan * scan) continue; // 视野外:跳过
      const d = Math.sqrt(d2) || 1;
      if (d < mag) { // 磁吸(强力吸取)
        const v = 260 + (mag - d) * 3;
        k.x += dx / d * v * dt; k.y += dy / d * v * dt;
      } else if (k.kind === 'gem' && d < 260) { // 远程缓漂:宝石主动飘向玩家
        k.x += dx / d * 70 * dt; k.y += dy / d * 70 * dt;
      }
      if (d < 26) { // 拾取
        if (k.kind === 'gem') p.addXp(k.xp);
        else if (k.kind === 'coin') { g.stats.gold += Math.round(k.gold * p.stats.goldMult); }
        else if (k.kind === 'meat') {
          const heal = Math.min(k.heal, p.stats.maxHp - p.hp);
          p.hp = Math.min(p.stats.maxHp, p.hp + k.heal);
          g.spawnText(p.x, p.y - 30, '+' + Math.max(1, Math.round(heal || k.heal)) + ' 气血', { color: '#63c74d', size: 14 });
          g.addParticles(k.x, k.y, { n: 6, color: '#63c74d', speed: 80, life: 0.4, size: 3 });
          Bus.emit('sfx', 'pickup');
          g.remove(g.pickups, i); continue;
        } else if (k.kind === 'chest') { // 宝箱:大量经验 + 金币 + 回血
          const gold = Math.round((40 + Math.random() * 30) * p.stats.goldMult);
          const xp = 60;
          g.stats.gold += gold;
          p.addXp(xp);
          p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.3);
          g.spawnText(p.x, p.y - 36, '开箱!经验 +' + xp + ' 金币 +' + gold, { color: '#ffd319', size: 16, life: 1.2 });
          g.addParticles(k.x, k.y, { n: 26, color: '#fee761', speed: 170, life: 0.7, size: 4, grav: 120 });
          g.addParticles(k.x, k.y, { n: 14, color: '#b03a2e', speed: 130, life: 0.6, size: 3 });
          g.shake(3, 0.18);
          Bus.emit('sfx', 'chest');
          g.remove(g.pickups, i); continue;
        }
        g.addParticles(k.x, k.y, { n: 4, color: '#fee761', speed: 70, life: 0.3, size: 3 });
        Bus.emit('sfx', k.kind === 'coin' ? 'coin' : 'pickup');
        g.remove(g.pickups, i);
      }
    }
  });

  g.addDrawer('under', ctx => {
    for (const k of g.pickups) {
      if (!g.inView(k.x, k.y, 40)) continue; // 视口剔除:视野外宝石不绘制
      const bob = Math.sin(k.t * 5) * 2.5;
      drawSprite(ctx, k.sprite, k.x, k.y + bob);
    }
  });
}
