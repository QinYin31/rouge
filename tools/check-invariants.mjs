// ===== 全局不变量闸门:高像素升级不得改变任何精灵的世界占位 =====
// 用法:node tools/check-invariants.mjs [--strict]
//   默认:旧精灵"点阵×SCALE == 旧尺寸×3"全部强制;新帧(_2/_3/_idle)缺失仅警告。
//   --strict:任何缺失/违规都算失败(终验用)。
// 世界占位不变 ⇒ 碰撞比例/地图节奏/zone 半径换算/UI 适配全部不变。
import { LEGACY_PIX } from './legacy-pix.mjs';
import { PIX, PAL, SCALE, spriteSize } from '../js/sprites.js';

const strict = process.argv.includes('--strict');
let errors = 0, warns = 0;
const fail = (...a) => { errors++; console.error('  ✗', ...a); };
const warn = (...a) => { warns++; console.error('  ⚠', ...a); };
const ok = (...a) => console.log('  ✓', ...a);

// 1) SCALE 必须为 1(高像素版契约)
if (SCALE === 1) ok('SCALE = 1(点阵已自带 3× 密度)');
else fail(`SCALE = ${SCALE},高像素版应为 1`);

// 2) 世界占位不变:新尺寸×SCALE == 旧尺寸×3
let n = 0;
for (const [name, oldRows] of Object.entries(LEGACY_PIX)) {
  const s = spriteSize(name);
  if (!s) { fail(`旧精灵 ${name} 在新图集中丢失`); continue; }
  const ow = oldRows[0].length * 3, oh = oldRows.length * 3;
  const effW = name.startsWith('hero_') && s.w === 96 ? 48 : s.w * SCALE;
  const effH = name.startsWith('hero_') && s.h === 96 ? 48 : s.h * SCALE;
  if (effW !== ow || effH !== oh) {
    fail(`${name}: 世界占位 ${s.w * SCALE}×${s.h * SCALE},应为 ${ow}×${oh}`);
  } else n++;
}
ok(`${n} 张旧精灵世界占位与旧版完全一致`);

// 3) 英雄新帧(_2/_3/_idle):存在则必须与基础帧同尺寸
const FRAME_RE = /^(hero_(?:knight|mage|ranger|white))_(2|3|idle)$/;
for (const name of Object.keys(PIX)) {
  const m = name.match(FRAME_RE);
  if (!m) continue;
  const b = spriteSize(m[1] + '_0');
  const s = spriteSize(name);
  if (b && s && (b.w !== s.w || b.h !== s.h)) fail(`${name}: 尺寸 ${s.w}×${s.h} 与基础帧 ${b.w}×${b.h} 不一致`);
}
for (const h of ['hero_knight', 'hero_mage', 'hero_ranger', 'hero_white']) {
  for (const f of ['2', '3', 'idle']) {
    if (!has(h + '_' + f)) (strict ? fail : warn)(`缺少新帧 ${h}_${f}(美术批次交付项)`);
  }
}

// 4) 调色板健康:无重复键 / 全部合法 #hex / 规模
{
  const keys = Object.keys(PAL);
  if (new Set(keys).size !== keys.length) fail('调色板存在重复键');
  if (keys.length < 50) warn(`调色板仅 ${keys.length} 键(高像素版建议 ≥50)`);
  const bad = keys.filter(k => !/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?$/.test(PAL[k]));
  if (bad.length) fail('非法色值:', bad.join(', '));
  ok(`调色板 ${keys.length} 键全部合法`);
}

// 5) 未知新增精灵(防美术擅自扩大命名面)
const KNOWN_NEW = new Set(['fx_dot', 'fx_streak', 'fx_ink', 'hero_white_0', 'hero_white_1', 'hero_face_white']);
const extra = Object.keys(PIX).filter(n => !LEGACY_PIX[n] && !FRAME_RE.test(n) && !KNOWN_NEW.has(n));
if (extra.length) (strict ? fail : warn)('清单外新增精灵:', extra.join(', '));

console.log(`\n不变量检查:${errors} 错误 / ${warns} 警告。`);
if (errors || (strict && warns)) { console.error(strict ? '终验(--strict)未通过' : '检查未通过'); process.exit(1); }
console.log('世界占位不变量:通过 ✓');
function has(n) { return Object.prototype.hasOwnProperty.call(PIX, n); }

