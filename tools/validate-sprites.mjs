// ===== 精灵数据校验 + 预览图渲染(node tools/validate-sprites.mjs)=====
// 1) 校验:每张图行数>0、所有行等长、字符都在调色板中(或为透明 '.')
// 2) 对照 CONTRACT.md 检查必需精灵名是否齐全
// 3) 生成 tools/preview.png(放大 4 倍的接触表,供人工目检美术)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { PIX, PAL, SCALE, has, spriteSize } from '../js/sprites.js';

const here = dirname(fileURLToPath(import.meta.url));
const REQUIRED = [
  'hero_knight_0', 'hero_knight_1', 'hero_knight_2', 'hero_knight_3', 'hero_knight_idle',
  'hero_mage_0', 'hero_mage_1', 'hero_mage_2', 'hero_mage_3', 'hero_mage_idle',
  'hero_ranger_0', 'hero_ranger_1', 'hero_ranger_2', 'hero_ranger_3', 'hero_ranger_idle',
  'hero_white_0', 'hero_white_1', 'hero_white_2', 'hero_white_3', 'hero_white_idle',
  'slime', 'bat', 'skeleton', 'spider', 'brute', 'bomber', 'turtle', 'wisp', 'reaper',
  'boss_golem', 'boss_overlord',
  'w_knife', 'w_bolt', 'w_arrow', 'w_orb', 'w_fireball', 'w_boomerang', 'w_flask', 'w_shield',
  'lightning_v', 'zone_holy',
  'gem_b', 'gem_g', 'gem_r', 'coin', 'meat', 'magnet', 'chest',
  'tile_grass_0', 'tile_grass_1', 'tile_grass_2', 'tile_dirt',
  'dec_rock', 'dec_flower', 'dec_bones', 'dec_stump',
  'p_might', 'p_cd', 'p_speed', 'p_hp', 'p_magnet', 'p_xp', 'p_gold', 'p_armor', 'p_crit',
  'hero_face_knight', 'hero_face_mage', 'hero_face_ranger', 'hero_face_white',
  // 水墨 v2:进化超武 9 + 天眼
  'w_knife_evo', 'w_wand_evo', 'w_bow_evo', 'w_orb_evo', 'w_lightning_evo',
  'w_fireball_evo', 'w_boomerang_evo', 'w_holy_evo', 'w_shield_evo',
  // 高像素 v3:表现层小精灵
  'fx_dot', 'fx_streak', 'fx_ink',
];

let errors = 0;
const fail = (...a) => { errors++; console.error('  ✗', ...a); };

console.log(`调色板色数:${Object.keys(PAL).length}`);

// ---- 必需名检查 ----
for (const n of REQUIRED) if (!has(n)) fail(`缺少必需精灵 ${n}`);
const extra = Object.keys(PIX).filter(n => !REQUIRED.includes(n));
if (extra.length) console.log('  (额外精灵):', extra.join(', '));

// ---- 点阵结构检查 ----
for (const [name, rows] of Object.entries(PIX)) {
  if (!Array.isArray(rows) || rows.length === 0) { fail(`${name}: 行数为 0`); continue; }
  const w = rows[0].length;
  if (w === 0) { fail(`${name}: 首行长度为 0`); continue; }
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j];
    if (r.length !== w) fail(`${name}: 第 ${j} 行长度 ${r.length} ≠ ${w}`);
    for (const ch of r) {
      if (ch === '.' || ch === ' ') continue;
      if (!PAL[ch]) fail(`${name}: 第 ${j} 行存在未知字符 "${ch}"`);
    }
  }
  console.log(`  ✓ ${name} ${w}×${rows.length}`);
}

// ---- 尺寸契约抽查(高像素 v3:全部为旧尺寸×3,世界占位与旧版一致) ----
const SIZE_WANT = {
  boss_golem: [120, 120], boss_overlord: [168, 168], lightning_v: [24, 84], zone_holy: [144, 144],
  skeleton: [48, 48], brute: [60, 60], turtle: [54, 54], wisp: [36, 36], reaper: [60, 60],
  hero_knight_0: [48, 48], hero_knight_1: [48, 48], hero_knight_2: [48, 48], hero_knight_3: [48, 48], hero_knight_idle: [48, 48],
  hero_mage_0: [48, 48], hero_mage_1: [48, 48], hero_mage_2: [48, 48], hero_mage_3: [48, 48], hero_mage_idle: [48, 48],
  hero_ranger_0: [48, 48], hero_ranger_1: [48, 48], hero_ranger_2: [48, 48], hero_ranger_3: [48, 48], hero_ranger_idle: [48, 48],
  hero_white_0: [48, 48], hero_white_1: [48, 48], hero_white_2: [48, 48], hero_white_3: [48, 48], hero_white_idle: [48, 48],
  hero_face_knight: [48, 48], hero_face_mage: [48, 48], hero_face_ranger: [48, 48], hero_face_white: [48, 48],
  tile_grass_0: [48, 48], tile_grass_1: [48, 48], tile_grass_2: [48, 48], tile_dirt: [48, 48],
  dec_rock: [48, 48], dec_flower: [48, 48], dec_bones: [48, 48], dec_stump: [48, 48],
  p_might: [48, 48], p_cd: [48, 48], p_speed: [48, 48], p_hp: [48, 48], p_magnet: [48, 48],
  p_xp: [48, 48], p_gold: [48, 48], p_armor: [48, 48], p_crit: [48, 48],
  chest: [48, 48], meat: [36, 36], magnet: [36, 36], coin: [24, 24],
  gem_b: [24, 24], gem_g: [24, 24], gem_r: [24, 24],
  slime: [42, 42], bat: [42, 42], spider: [42, 42], bomber: [42, 42],
  w_knife: [30, 30], w_bolt: [24, 24], w_arrow: [36, 24], w_orb: [30, 30],
  w_fireball: [36, 36], w_boomerang: [36, 36], w_flask: [30, 30], w_shield: [48, 48],
  // 进化超武(随原武器或略大,×3)
  w_knife_evo: [48, 48], w_wand_evo: [48, 48], w_bow_evo: [54, 24], w_orb_evo: [48, 48],
  w_lightning_evo: [36, 96], w_fireball_evo: [48, 48], w_boomerang_evo: [48, 48],
  w_holy_evo: [72, 72], w_shield_evo: [48, 48],
  // 高像素 v3:表现层小精灵
  fx_dot: [6, 6], fx_streak: [12, 3], fx_ink: [10, 10],
};
for (const [n, [w, h]] of Object.entries(SIZE_WANT)) {
  const s = spriteSize(n);
  if (!s) fail(`spriteSize(${n}) 返回空`);
  else if (s.w !== w || s.h !== h) fail(`spriteSize(${n}) = ${s.w}×${s.h},期望 ${w}×${h}`);
}

// ---- PNG 编码(纯 node,zlib + CRC32) ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 接触表渲染:深色底,放大 4 倍,货架式排布 ----
const Z = 4, GAP = 8, MAXW = 1150;
const names = Object.keys(PIX);
const placed = [];
let cx = GAP, cy = GAP, rowH = 0;
for (const n of names) {
  const rows = PIX[n];
  const w = rows[0].length * Z, h = rows.length * Z;
  if (cx + w + GAP > MAXW) { cx = GAP; cy += rowH + GAP; rowH = 0; }
  placed.push([n, cx, cy, w, h]);
  cx += w + GAP; rowH = Math.max(rowH, h);
}
const SW = MAXW, SH = cy + rowH + GAP;
const img = Buffer.alloc(SW * SH * 4);
const put = (x, y, r, g, b, a = 255) => {
  if (x < 0 || y < 0 || x >= SW || y >= SH) return;
  const o = (y * SW + x) * 4;
  img[o] = r; img[o + 1] = g; img[o + 2] = b; img[o + 3] = a;
};
for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) put(x, y, 0xec, 0xe5, 0xd3); // 宣纸底(水墨精灵目检更真实)
for (const [n, px, py, w, h] of placed) {
  const rows = PIX[n];
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[0].length; i++) {
    const col = PAL[rows[j][i]];
    if (!col) continue;
    let hex = col.slice(1);
    if (hex.length === 3) hex = hex.replace(/./g, c => c + c);
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
    for (let dy = 0; dy < Z; dy++) for (let dx = 0; dx < Z; dx++) {
      const X = px + i * Z + dx, Y = py + j * Z + dy;
      if (a < 255) { // 半透明色与底色混合,预览更接近实际
        const o = (Y * SW + X) * 4;
        img[o] = Math.round(img[o] * (1 - a / 255) + r * (a / 255));
        img[o + 1] = Math.round(img[o + 1] * (1 - a / 255) + g * (a / 255));
        img[o + 2] = Math.round(img[o + 2] * (1 - a / 255) + b * (a / 255));
      } else put(X, Y, r, g, b);
    }
  }
  console.log(`  预览: ${n} @ (${px},${py})`);
}
mkdirSync(here, { recursive: true });
writeFileSync(join(here, 'preview.png'), encodePNG(SW, SH, img));
console.log(`预览图已生成: tools/preview.png (${SW}×${SH}), SCALE=${SCALE}`);

if (errors) { console.error(`\n校验失败:${errors} 处错误`); process.exit(1); }
console.log(`\n校验通过:${names.length} 张精灵图全部合法。`);
