// ===== 一次性迁移脚本:旧点阵最近邻 ×3 → js/pix/* 占位模块 + 旧图快照 =====
// 用法:node tools/upscale-pix.mjs  (必须在改写 js/sprites.js 之前对旧版运行)
// 产物:
//   1) tools/legacy-pix.mjs      旧版 PIX/PAL 快照(美术参考,只读)
//   2) js/pix/<family>.js        各美术模块占位数据(×3 放大,视觉与旧版完全一致)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIX, PAL } from '../js/sprites.js';

const here = dirname(fileURLToPath(import.meta.url));

// 家族 → 导出变量名
const FAMILIES = [
  ['ground.js', 'PIX_GROUND', ['tile_grass_0', 'tile_grass_1', 'tile_grass_2', 'tile_dirt', 'dec_rock', 'dec_flower', 'dec_bones', 'dec_stump', 'zone_holy']],
  ['hero-knight.js', 'PIX_HERO_KNIGHT', ['hero_knight_0', 'hero_knight_1', 'hero_face_knight']],
  ['hero-mage.js', 'PIX_HERO_MAGE', ['hero_mage_0', 'hero_mage_1', 'hero_face_mage']],
  ['hero-ranger.js', 'PIX_HERO_RANGER', ['hero_ranger_0', 'hero_ranger_1', 'hero_face_ranger']],
  ['enemies-a.js', 'PIX_ENEMIES_A', ['slime', 'bat', 'skeleton', 'spider', 'bomber']],
  ['enemies-b.js', 'PIX_ENEMIES_B', ['turtle', 'brute', 'wisp', 'reaper']],
  ['bosses.js', 'PIX_BOSSES', ['boss_golem', 'boss_overlord']],
  ['projectiles.js', 'PIX_PROJECTILES', ['w_knife', 'w_bolt', 'w_arrow', 'w_orb', 'w_fireball', 'w_boomerang', 'w_flask', 'w_shield', 'lightning_v', 'w_knife_evo', 'w_wand_evo', 'w_bow_evo', 'w_orb_evo', 'w_lightning_evo', 'w_fireball_evo', 'w_boomerang_evo', 'w_holy_evo', 'w_shield_evo']],
  ['items.js', 'PIX_ITEMS', ['gem_b', 'gem_g', 'gem_r', 'coin', 'meat', 'magnet', 'chest', 'p_might', 'p_cd', 'p_speed', 'p_hp', 'p_magnet', 'p_xp', 'p_gold', 'p_armor', 'p_crit']],
];

// 最近邻 ×3:每字符横 ×3,每行纵 ×3
const up3 = rows => rows.flatMap(r => {
  const t = [...r].map(c => c + c + c).join('');
  return [t, t, t];
});

// ---- 1) 旧图快照(美术子代理的参考底稿) ----
const snap = [];
snap.push('// ===== 旧版(3× 放大前)原始点阵快照 —— 只读参考,勿在运行时引用 =====');
snap.push('// 由 tools/upscale-pix.mjs 生成:保留旧版 16px 时代的设计意图与配色分布。');
snap.push('export const LEGACY_PAL = ' + JSON.stringify(PAL, null, 2).replace(/"/g, "'") + ';');
snap.push('export const LEGACY_PIX = {');
for (const [name, rows] of Object.entries(PIX)) {
  snap.push(`  // ${rows[0].length}×${rows.length}`);
  snap.push(`  ${JSON.stringify(name)}: [`);
  for (const r of rows) snap.push(`    ${JSON.stringify(r)},`);
  snap.push('  ],');
}
snap.push('};');
writeFileSync(join(here, 'legacy-pix.mjs'), snap.join('\n') + '\n');

// ---- 2) 家族占位模块(×3 数据) ----
const claimed = new Set();
mkdirSync(join(here, '..', 'js', 'pix'), { recursive: true });
for (const [file, varName, names] of FAMILIES) {
  const out = [];
  out.push('// ===== 🎨 高像素美术模块(占位:旧点阵 ×3,待精绘替换) =====');
  out.push(`// 本文件由 tools/upscale-pix.mjs 生成占位,美术按 CONTRACT.md 重绘。导出:${varName}`);
  out.push('export const ' + varName + ' = {');
  for (const n of names) {
    if (!PIX[n]) { console.error('  ✗ 缺少精灵', n); continue; }
    claimed.add(n);
    const rows = up3(PIX[n]);
    out.push(`  ${JSON.stringify(n)}: [`);
    for (const r of rows) out.push(`    ${JSON.stringify(r)},`);
    out.push('  ],');
  }
  out.push('};');
  writeFileSync(join(here, '..', 'js', 'pix', file), out.join('\n') + '\n');
  console.log('  ✓ js/pix/' + file, '(' + names.length + ' 张占位)');
}
const unclaimed = Object.keys(PIX).filter(n => !claimed.has(n));
if (unclaimed.length) console.log('  ! 未分配到家族的精灵:', unclaimed.join(', '));
console.log('完成:tools/legacy-pix.mjs + js/pix/* 占位模块已生成。');
