// ===== ⚔️战斗agent 与 🖥️UIagent 共同名下:拾取物(占位实现,须全量重写:三档宝石/金币/肉/磁铁/宝箱) =====
import { drawSprite } from '../sprites.js';
import { Bus } from '../core/engine.js';

export function initPickups(g) {
  // 敌人死亡掉落
  Bus.on('enemy-death', e => {
    const tier = e.xp >= 5 ? 'gem_r' : e.xp >= 2 ? 'gem_g' : 'gem_b';
    g.addPickup({ kind: 'gem', x: e.x, y: e.y, sprite: tier, xp: e.xp, r: 8, t: Math.random() * 7 });
    if (Math.random() < e.coinP) g.addPickup({ kind: 'coin', x: e.x + 8, y: e.y, sprite: 'coin', gold: 3, r: 8, t: 0 });
  });

  g.addUpdater(dt => {
    const p = g.player;
    for (let i = g.pickups.length - 1; i >= 0; i--) {
      const k = g.pickups[i];
      k.t += dt;
      const dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy);
      if (d < p.stats.magnet) { // 磁吸
        const v = 260 + (p.stats.magnet - d) * 3;
        k.x += dx / (d || 1) * v * dt; k.y += dy / (d || 1) * v * dt;
      }
      if (d < 18) { // 拾取
        if (k.kind === 'gem') p.addXp(k.xp);
        else if (k.kind === 'coin') { g.stats.gold += Math.round(k.gold * p.stats.goldMult); }
        g.addParticles(k.x, k.y, { n: 4, color: '#fee761', speed: 70, life: 0.3, size: 3 });
        Bus.emit('sfx', k.kind === 'coin' ? 'coin' : 'pickup');
        g.remove(g.pickups, i);
      }
    }
  });

  g.addDrawer('under', ctx => {
    for (const k of g.pickups) {
      const bob = Math.sin(k.t * 5) * 2.5;
      drawSprite(ctx, k.sprite, k.x, k.y + bob);
    }
  });
}
