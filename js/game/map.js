// 无限地面:分块离屏缓存(256px chunk + 16px 出血),每块只烘焙一次
import { drawSprite } from '../sprites.js?v=11';

const TILE = 32, CHUNK = 256, BLEED = 16; // 8×8 tile 一块;精灵 48px 出格,烘焙留出血防接缝
const chunks = new Map();

function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function tileAt(ctx, gx, gy, px, py) {
  const r = hash2(gx, gy);
  drawSprite(ctx, r < 0.10 ? 'tile_dirt' : `tile_grass_${(r * 30 | 0) % 3}`, px, py);
  if (r > 0.93) drawSprite(ctx, 'dec_rock', px, py);
  else if (r > 0.90) drawSprite(ctx, 'dec_flower', px, py);
  else if (r > 0.875) drawSprite(ctx, 'dec_bones', px, py);
  else if (r > 0.855) drawSprite(ctx, 'dec_stump', px, py);
}

function getChunk(cx, cy) {
  const key = cx + ',' + cy;
  let c = chunks.get(key);
  if (c) return c;
  const size = CHUNK + BLEED * 2;
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const cc = cv.getContext('2d');
  cc.imageSmoothingEnabled = false;
  for (let ty = -1; ty <= 8; ty++) {
    for (let tx = -1; tx <= 8; tx++) {
      tileAt(cc, cx * 8 + tx, cy * 8 + ty,
        BLEED + tx * TILE + TILE / 2, BLEED + ty * TILE + TILE / 2);
    }
  }
  c = { cv };
  chunks.set(key, c);
  if (chunks.size > 80) { // 简单防膨胀:清掉最旧的一块
    chunks.delete(chunks.keys().next().value);
  }
  return c;
}

export function initMap(g) {
  g.addReset(() => chunks.clear());
  g.addDrawer('ground', ctx => {
    const v = g.cam.viewRect(g.w, g.h);
    const x0 = Math.floor(v.x0 / CHUNK), x1 = Math.floor(v.x1 / CHUNK);
    const y0 = Math.floor(v.y0 / CHUNK), y1 = Math.floor(v.y1 / CHUNK);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        ctx.drawImage(getChunk(cx, cy).cv, cx * CHUNK - BLEED, cy * CHUNK - BLEED);
      }
    }
  });
}
