// 无限地面:确定性哈希铺设图块与装饰(🎨美术agent 提供图块精灵名,不改本文件)
import { drawSprite } from '../sprites.js';

const TILE = 32;

function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function initMap(g) {
  g.addDrawer('ground', ctx => {
    const v = g.cam.viewRect(g.w, g.h);
    const x0 = Math.floor(v.x0 / TILE) - 1, x1 = Math.ceil(v.x1 / TILE) + 1;
    const y0 = Math.floor(v.y0 / TILE) - 1, y1 = Math.ceil(v.y1 / TILE) + 1;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const r = hash2(tx, ty);
        const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
        drawSprite(ctx, r < 0.10 ? 'tile_dirt' : `tile_grass_${(r * 30 | 0) % 3}`, cx, cy);
        // 装饰物(稀疏)
        if (r > 0.93) drawSprite(ctx, 'dec_rock', cx, cy);
        else if (r > 0.90) drawSprite(ctx, 'dec_flower', cx, cy);
        else if (r > 0.875) drawSprite(ctx, 'dec_bones', cx, cy);
        else if (r > 0.855) drawSprite(ctx, 'dec_stump', cx, cy);
      }
    }
  });
}
