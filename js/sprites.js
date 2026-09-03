// ===== 🎨 美术:调色板 + 点阵图集聚合 + 烘焙绘制(水墨武侠·高像素版) =====
// 高像素版 v3:点阵密度 ×3(SCALE 3→1),每个精灵的"点阵尺寸×SCALE"即世界占位与旧版
// 完全一致 —— 碰撞、地图节奏、UI 适配、视野全部不变(见 CONTRACT.md「高像素美术 v3」)。
//
// 模块布局(各家族文件由对应美术负责人维护,互相独立):
//   js/pix/palette.js     调色板(唯一色源,新增色先加这里)
//   js/pix/brush.js       程序化画笔(grid/ppx/prect/pell/line/outlinePass)
//   js/pix/ground.js      地面 tile + 装饰 + zone_holy
//   js/pix/hero-*.js      三位英雄(走路 _0.._3 + 待机 _idle + 头像 face_*)
//   js/pix/enemies-*.js   常规敌人
//   js/pix/bosses.js      两个 Boss(程序化生成)
//   js/pix/projectiles.js 武器弹体 + 进化超武
//   js/pix/items.js       拾取物 + 被动图标
//   js/pix/fx.js          表现层小精灵(粒子墨点等)
// 点阵格式:字符串数组,每字符一个调色板键;'.' 或 ' ' 为透明。
// 本文件上半部分为【纯数据聚合】(可在 node 中 import 做校验,不依赖 document);
// 只有 bake()/drawSprite() 依赖 canvas API。

import { PAL } from './pix/palette.js';
import { PIX_GROUND } from './pix/ground.js';
import { PIX_HERO_KNIGHT } from './pix/hero-knight.js';
import { PIX_HERO_MAGE } from './pix/hero-mage.js';
import { PIX_HERO_RANGER } from './pix/hero-ranger.js';
import { PIX_HERO_WHITE } from './pix/hero-white.js';
import { PIX_ENEMIES_A } from './pix/enemies-a.js';
import { PIX_ENEMIES_B } from './pix/enemies-b.js';
import { PIX_BOSSES } from './pix/bosses.js';
import { PIX_PROJECTILES } from './pix/projectiles.js';
import { PIX_ITEMS } from './pix/items.js';
import { PIX_FX } from './pix/fx.js';

export { PAL };
export const SCALE = 1; // 全局绘制放大倍数(点阵本身已是高密度,1:1 进世界)

// ===== 点阵图集(家族模块聚合) =====
export const PIX = {
  ...PIX_GROUND,
  ...PIX_HERO_KNIGHT,
  ...PIX_HERO_MAGE,
  ...PIX_HERO_RANGER,
  ...PIX_HERO_WHITE,
  ...PIX_ENEMIES_A,
  ...PIX_ENEMIES_B,
  ...PIX_BOSSES,
  ...PIX_PROJECTILES,
  ...PIX_ITEMS,
  ...PIX_FX,
};

// ================= 运行时:烘焙与绘制(以下才依赖 canvas) =================

// 调色板解析(#RGB / #RRGGBB / #RRGGBBAA)-> [r,g,b,a]
const _rgb = Object.create(null);
for (const key in PAL) {
  let h = PAL[key];
  if (h[0] === '#') h = h.slice(1);
  const n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h, 16);
  const len = h.length === 3 ? 6 : h.length;
  _rgb[key] = len === 8
    ? [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, (n & 255) / 255]
    : [(n >>> 16) & 255, (n >>> 8) & 255, n & 255, 1];
}

const bakeCache = new Map();   // name -> HTMLCanvasElement
const tintCache = new Map();   // 'name|tint' -> HTMLCanvasElement
let _tmpCanvas = null;

function raster(rows) {
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const img = x.createImageData(w, h);
  const d = img.data;
  for (let j = 0; j < h; j++) {
    const row = rows[j];
    for (let i = 0; i < w; i++) {
      const col = _rgb[row[i]];
      if (!col) continue;
      const o = (j * w + i) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = Math.round(col[3] * 255);
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

/** 启动时调用一次:烘焙全部点阵到离屏 canvas(重复调用会重建) */
export function bake() {
  bakeCache.clear();
  tintCache.clear();
  for (const name in PIX) bakeCache.set(name, raster(PIX[name]));
}

/** 精灵是否存在 */
export function has(name) { return Object.prototype.hasOwnProperty.call(PIX, name); }

/** 原始像素尺寸;未知名字返回 null(UI 侧有回退) */
export function spriteSize(name) {
  const p = PIX[name];
  return p ? { w: p[0].length, h: p.length } : null;
}

// tint:单色剪影(受击闪白等)。离屏临时 canvas + 'source-in',按 name|tint 缓存。
function tinted(src, color) {
  if (!_tmpCanvas) _tmpCanvas = document.createElement('canvas');
  const t = _tmpCanvas;
  if (t.width < src.width || t.height < src.height) { t.width = src.width; t.height = src.height; }
  const x = t.getContext('2d');
  x.save();
  x.clearRect(0, 0, src.width, src.height);
  x.globalCompositeOperation = 'source-over';
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, src.width, src.height);
  x.restore();
  const out = document.createElement('canvas');
  out.width = src.width; out.height = src.height;
  out.getContext('2d').drawImage(t, 0, 0);
  return out;
}

/**
 * 以世界坐标 (cx,cy) 为中心绘制精灵(禁止平滑由引擎保证)。
 * o: { flip:bool, angle:number, alpha:0-1, tint:'#hex 或 null',
 *      scale:number, sx:number, sy:number }  // sx/sy 为非等比附加缩放(粒子拖尾用)
 */
export function drawSprite(ctx, name, cx, cy, o = {}) {
  let c = bakeCache.get(name);
  if (!c) {
    const rows = PIX[name];
    if (!rows) return;
    c = raster(rows);
    bakeCache.set(name, c);
  }
  // 1K/2K: hero_white 96/128/1024 auto scale to keep world 48
  let baseScale = SCALE * (o.scale || 1);
  if (name.startsWith('hero_')) {
    const expected = 48;
    if (c.width !== expected) baseScale *= expected / c.width;
  }
  const s = baseScale;
  if (!(s > 0)) return;
  const w = c.width * s * (o.sx || 1), h = c.height * s * (o.sy || 1);
  const alpha = o.alpha;
  if (alpha !== undefined && alpha <= 0) return;

  ctx.save();
  if (alpha !== undefined && alpha < 1) ctx.globalAlpha *= alpha;
  ctx.translate(cx, cy);
  if (o.angle) ctx.rotate(o.angle);
  if (o.flip) ctx.scale(-1, 1);
  if (o.tint) {
    const key = name + '|' + o.tint;
    let t = tintCache.get(key);
    if (!t) { t = tinted(c, o.tint); tintCache.set(key, t); }
    c = t;
  }
  ctx.drawImage(c, -w / 2, -h / 2, w, h);
  ctx.restore();
}

