// ===== 单文件接触表预览(美术自检用) =====
// 用法:node tools/preview-file.mjs js/pix/hero-knight.js [更多文件...]
// 产物:tools/preview-<文件名>.png(放大 4 倍,宣纸底,附精灵名与尺寸),可 Read 目检。
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { PAL } from '../js/pix/palette.js';

const here = dirname(fileURLToPath(import.meta.url));

// ---- PNG 编码(纯 node,zlib + CRC32) ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) { c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8); }
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
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex2rgba = col => {
  let hex = col.slice(1);
  if (hex.length === 3) hex = hex.replace(/./g, c => c + c);
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
  return [r, g, b, a];
};

const Z = 4, GAP = 12, MAXW = 900, LABEL = 14;
for (const arg of process.argv.slice(2)) {
  const mod = await import(pathToFileURL(arg).href);
  const pix = mod[Object.keys(mod)[0]];
  const names = Object.keys(pix);
  // 布局:货架式,按最高行高排
  const placed = [];
  let cx = GAP, cy = GAP + LABEL, rowH = 0;
  for (const n of names) {
    const rows = pix[n];
    const w = rows[0].length * Z, h = rows.length * Z;
    if (cx + w + GAP > MAXW) { cx = GAP; cy += rowH + GAP + LABEL; rowH = 0; }
    placed.push([n, cx, cy - LABEL, w, h]);
    cx += w + GAP; rowH = Math.max(rowH, h);
  }
  const SW = MAXW, SH = cy + rowH + GAP;
  const img = Buffer.alloc(SW * SH * 4);
  const put = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= SW || y >= SH) return;
    const o = (y * SW + x) * 4;
    img[o] = r; img[o + 1] = g; img[o + 2] = b; img[o + 3] = a;
  };
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) put(x, y, 0xec, 0xe5, 0xd3);
  for (const [n, px, py, w, h] of placed) {
    const rows = pix[n];
    for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[0].length; i++) {
      const col = PAL[rows[j][i]];
      if (!col) continue;
      const [r, g, b, a] = hex2rgba(col);
      for (let dy = 0; dy < Z; dy++) for (let dx = 0; dx < Z; dx++) {
        const X = px + i * Z + dx, Y = py + LABEL + j * Z + dy;
        if (a < 255) {
          const o = (Y * SW + X) * 4;
          img[o] = Math.round(img[o] * (1 - a / 255) + r * (a / 255));
          img[o + 1] = Math.round(img[o + 1] * (1 - a / 255) + g * (a / 255));
          img[o + 2] = Math.round(img[o + 2] * (1 - a / 255) + b * (a / 255));
        } else put(X, Y, r, g, b);
      }
    }
  }
  mkdirSync(join(here), { recursive: true });
  const out = join(here, 'preview-' + basename(arg).replace(/\.js$/, '') + '.png');
  writeFileSync(out, encodePNG(SW, SH, img));
  console.log('预览已生成:', out, `(${SW}×${SH}, ${names.length} 张)`);
}
