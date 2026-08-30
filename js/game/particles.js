// 粒子与飘字(对象池)
import { Bus } from '../core/engine.js?v=11';

const isMobile = window.innerWidth < 600;
const MAX_P = isMobile ? 320 : 700, MAX_T = 90; // 移动端减预算保流畅
const pool = [], tpool = [];

export function initParticles(g) {
  g.addReset(() => { pool.length = 0; tpool.length = 0; });
  g.addUpdater(dt => {
    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      p.life -= dt;
      if (p.life <= 0) { g.remove(pool, i); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const f = Math.pow(p.drag, dt * 60); // 帧率无关阻力
      p.vx *= f; p.vy *= f;
      p.vy += p.grav * dt;
    }
    for (let i = tpool.length - 1; i >= 0; i--) {
      const t = tpool[i];
      t.life -= dt;
      if (t.life <= 0) { g.remove(tpool, i); continue; }
      t.y -= 34 * dt;
    }
  });
  g.addDrawer('fx', ctx => {
    for (const p of pool) {
      if (!g.inView(p.x, p.y, 20)) continue;
      ctx.globalAlpha = Math.min(1, p.life / p.maxLife * 1.5);
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  });
  g.addDrawer('texts', ctx => {
    ctx.textAlign = 'center';
    const minWorld = 15 / (g.cam ? g.cam.zoom : 1); // 手机低倍缩放下保证伤害数字屏幕可读
    for (const t of tpool) {
      ctx.globalAlpha = Math.min(1, t.life / t.maxLife * 2);
      ctx.font = `bold ${Math.max(t.size, minWorld)}px "Microsoft YaHei", sans-serif`;
      ctx.fillStyle = '#000'; ctx.fillText(t.str, t.x + 1.5, t.y + 1.5);
      ctx.fillStyle = t.color; ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  });

  Bus.on('fx-burst', ({ x, y, n = 8, color = '#fff', speed = 90, life = 0.5, size = 4, grav = 0, spread = Math.PI * 2, dir = 0 }) => {
    n = Math.round(n * (isMobile ? 0.6 : 1));
    for (let i = 0; i < n && pool.length < MAX_P; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const v = speed * (0.5 + Math.random() * 0.7);
      pool.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: life * (0.7 + Math.random() * 0.6), maxLife: life,
        size: size * (0.7 + Math.random() * 0.8), color, grav, drag: 0.92,
      });
    }
  });
  Bus.on('fx-text', ({ x, y, str, color = '#fff', size = 15, life = 0.7 }) => {
    if (tpool.length >= MAX_T) tpool.shift();
    tpool.push({ x: x + (Math.random() - 0.5) * 14, y: y - 10, str, color, size, life, maxLife: life });
  });
}

export function burst(g, x, y, o) { g.addParticles(x, y, o); }
