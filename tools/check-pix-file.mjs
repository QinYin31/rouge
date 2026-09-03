// ===== 单文件美术校验(美术子代理自检用) =====
// 用法:node tools/check-pix-file.mjs js/pix/hero-knight.js [更多文件...]
// 只依赖 js/pix/palette.js 与 tools/legacy-pix.mjs,不受其他美术文件影响,可并发使用。
// 校验:单一具名导出 / 行列规整 / 字符全在调色板 / 尺寸契约(旧图×3 或新帧=基础帧)。
import { pathToFileURL } from 'node:url';
import { LEGACY_PIX } from './legacy-pix.mjs';
import { PAL } from '../js/pix/palette.js';

const NEW_SIZES = {
  fx_dot: [6, 6], fx_streak: [12, 3], fx_ink: [10, 10],
  hero_white_0: [48, 48], hero_white_1: [48, 48], hero_white_2: [48, 48],
  hero_white_3: [48, 48], hero_white_idle: [48, 48], hero_face_white: [48, 48],
};
const FRAME_RE = /^(hero_(?:knight|mage|ranger|white))_(2|3|idle)$/;

let errors = 0, checked = 0;
const fail = (...a) => { errors++; console.error('  ✗', ...a); };

for (const arg of process.argv.slice(2)) {
  console.log('检查', arg);
  let mod;
  try {
    mod = await import(pathToFileURL(arg).href);
  } catch (e) { fail('模块导入失败(语法错误?):', e.message); continue; }
  const keys = Object.keys(mod);
  if (keys.length !== 1 || typeof mod[keys[0]] !== 'object') {
    fail(`应导出恰好一个点阵对象(如 export const PIX_X = {...}),实际导出: ${keys.join(', ')}`);
    continue;
  }
  const pix = mod[keys[0]];
  // 同文件内的基础帧尺寸(供新帧推导)
  const localBase = n => {
    const m = n.match(FRAME_RE);
    if (!m) return null;
    const b = pix[m[1] + '_0'] || LEGACY_PIX[m[1] + '_0'];
    return b ? [b[0].length, b.length] : null;
  };
  for (const [name, rows] of Object.entries(pix)) {
    checked++;
    if (!Array.isArray(rows) || rows.length === 0) { fail(`${name}: 行数为 0`); continue; }
    const w = rows[0].length;
    if (!rows.every(r => typeof r === 'string' && r.length === w)) { fail(`${name}: 存在缺失/不等长行`); continue; }
    for (const r of rows) for (const ch of r) {
      if (ch === '.' || ch === ' ') continue;
      if (!PAL[ch]) fail(`${name}: 未知调色板字符 "${ch}"(色板见 js/pix/palette.js)`);
    }
    let want = null, tag = '';
    if (LEGACY_PIX[name]) {
      const l = LEGACY_PIX[name];
      want = [l[0].length * 3, l.length * 3]; tag = '旧图×3';
    } else if (NEW_SIZES[name]) {
      want = NEW_SIZES[name]; tag = '新增';
    } else {
      const b = localBase(name);
      if (b) { want = b; tag = '新帧=基础帧'; }
      else fail(`${name}: 不在旧图清单/新增表/帧规则内,请核对精灵名`);
    }
    if (want && (rows[0].length !== want[0] || rows.length !== want[1])) {
      fail(`${name}: 尺寸 ${w}×${rows.length},期望 ${want[0]}×${want[1]}(${tag})`);
    }
  }
  console.log(`  ✓ ${Object.keys(pix).length} 张通过结构检查`);
}
console.log(`\n共检查 ${checked} 张精灵,${errors} 处错误。`);
if (errors) process.exit(1);
console.log('单文件校验通过。目检请跑:node tools/preview-file.mjs ' + (process.argv[2] || ''));
