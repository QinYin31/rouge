// ===== 🎨 像素画笔工具(纯计算,零依赖;供程序化生成大型精灵的美术模块使用) =====
// 用法:import { grid, ppx, prect, pell, line, outlinePass, toRows } from './brush.js'
// 坐标均为点阵格;outlinePass 会跳过透明与半透明晕染键。

// 实体键(参与自动描边):透明 '.' 与半透明晕染/落影不描边
const _ALPHA = new Set(['.', ' ', 'x', 'a', 'b', 'A', 'h', 'H', 'l', 'L', 'j', 'i', '0', 'f', 'z']);
const SOLID = ch => !_ALPHA.has(ch);

export function grid(S) { return Array.from({ length: S }, () => Array(S).fill('.')); }
export function ppx(g, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c;
}
export function prect(g, x0, y0, x1, y1, c) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ppx(g, x, y, c);
}
export function pell(g, cx, cy, rx, ry, c) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1.04) ppx(g, x, y, c);
    }
}
export function line(g, x0, y0, x1, y1, r, c) { // 圆头粗线
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
  for (let i = 0; i <= n; i++) pell(g, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, r, r, c);
}
export function outlinePass(g) { // 给所有实体外缘补 1px 浓墨描边
  const S = g.length, out = g.map(r => r.slice());
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (g[y][x] !== '.') continue;
    if ((y > 0 && SOLID(g[y - 1][x])) || (y < S - 1 && SOLID(g[y + 1][x])) ||
        (x > 0 && SOLID(g[y][x - 1])) || (x < S - 1 && SOLID(g[y][x + 1]))) out[y][x] = 'k';
  }
  return out;
}
export const toRows = g => g.map(r => r.join(''));
