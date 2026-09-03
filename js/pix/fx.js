// ===== 🎨 表现层小精灵(粒子墨点/拖尾/墨花) — 高像素版新增 =====
// 粒子系统(particles.js)以 tint 方式着色使用:形状的 alpha 轮廓决定软边。
import { PAL } from './palette.js';

// fx_dot 6×6:圆头墨点,边缘半透明晕(粒子基础形态)
const FX_DOT = [
  '..ll..',
  '.lMMl.',
  'lMMMMl',
  'lMMMMl',
  '.lMMl.',
  '..ll..',
];

// fx_streak 12×3:两端收锋的笔触(拖尾/弹道残影,sx 非等比拉长)
const FX_STREAK = [
  '..llMMMMll..',
  '.lMMMMMMMMl.',
  '..llMMMMll..',
];

// fx_ink 10×10:墨花溅射(主体 + 卫星墨点,命中反馈)
const FX_INK = [
  '....ll....',
  '..llMMl...',
  '.lMMMMMl..',
  'lMMMMMMl.l',
  'lMMMMMMllM',
  '.lMMMMMl..',
  '..lMMMl.l.',
  '.llMMl..l.',
  'l..ll.....',
  '.l........',
];

export const PIX_FX = { fx_dot: FX_DOT, fx_streak: FX_STREAK, fx_ink: FX_INK };
void PAL;
