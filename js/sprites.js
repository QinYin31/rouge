// ===== 🎨 美术agent 名下:全部像素精灵定义与烘焙 =====
// 本文件上半部分为【纯数据】(可在 node 中 import 做校验,不依赖 document);
// 只有 bake()/drawSprite() 依赖 canvas API。
// 点阵格式:字符串数组,每字符一个调色板键;'.' 或 ' ' 为透明。

export const SCALE = 3;

// —— EDG32(Endesga32)风格调色板,32 色 ——
// 命名直觉:k 轮廓黑 / K 深藏青 / A 暗钢 / B 中钢 / C 亮钢 / D 银白 / w 白
// r 暗红 R 红 q 粉 | o 橙 O 金橙 y 黄 | g 深绿 G 绿 v 亮绿
// E 墨青 b 深蓝 u 蓝 c 亮青 | s 肤暗 S 肤 n 棕 N 深棕 d 近黑棕
// m 锈红 M 浅锈 f 沙棕 F 米白 | P 品紫 V 暗紫 t 龟青
// 带透明度的辅助色:x 落影 / h·j·l 圣域光圈(烘焙即半透明)
export const PAL = {
  k: '#181425', K: '#262b44', A: '#3a4466', B: '#5a6988', C: '#8b9bb4',
  D: '#c0cbdc', w: '#ffffff',
  r: '#a22633', R: '#e43b44', q: '#f6757a',
  o: '#f77622', O: '#feae34', y: '#fee761',
  g: '#265c42', G: '#3e8948', v: '#63c74d',
  E: '#193c3e', b: '#124e89', u: '#0099db', c: '#2ce8f5',
  s: '#c28569', S: '#e8b796', n: '#b86f50', N: '#733e39', d: '#3e2731',
  m: '#be4a2f', M: '#d77643', f: '#e4a672', F: '#ead4aa',
  P: '#b55088', V: '#68386c', t: '#9ac1c9',
  x: '#0b0d1759',
  h: '#fee76155', j: '#feae3473', l: '#fffbe03d', i: '#fffbe88a',
};

// 程序化生成圣域光圈(纯计算,仍属纯数据):同心亮环 + 中心微光
const ZONE_HOLY = (() => {
  const S = 48, g = Array.from({ length: S }, () => Array(S).fill('.'));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - 23.5, y - 23.5);
    if (d > 23) continue;
    if (d > 21.2) g[y][x] = 'i';            // 外缘亮环
    else if (d > 19.4) g[y][x] = 'h';       // 外柔环
    else if (d > 15.2) g[y][x] = '.';       // 呼吸暗隙
    else if (d > 13.4) g[y][x] = 'j';       // 中环
    else if (d > 11.2) g[y][x] = '.';
    else if (d > 9.8) g[y][x] = 'h';
    else if (d > 5.2) g[y][x] = '.';
    else g[y][x] = 'l';                     // 中心微光
  }
  return g.map(r => r.join(''));
})();

// —— 大型 Boss 采用程序化绘制(纯计算):小画笔 + 自动描边,保证体型比例与轮廓质量 ——
function grid(S) { return Array.from({ length: S }, () => Array(S).fill('.')); }
function ppx(g, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c;
}
function prect(g, x0, y0, x1, y1, c) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) ppx(g, x, y, c);
}
function pell(g, cx, cy, rx, ry, c) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1.04) ppx(g, x, y, c);
    }
}
function line(g, x0, y0, x1, y1, r, c) { // 圆头粗线
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
  for (let i = 0; i <= n; i++) pell(g, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, r, r, c);
}
const SOLID = ch => ch !== '.' && ch !== 'x';
function outlinePass(g) { // 给所有实体外缘补 1px 描边('x' 落影不描)
  const S = g.length, out = g.map(r => r.slice());
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (g[y][x] !== '.') continue;
    if ((y > 0 && SOLID(g[y - 1][x])) || (y < S - 1 && SOLID(g[y + 1][x])) ||
        (x > 0 && SOLID(g[y][x - 1])) || (x < S - 1 && SOLID(g[y][x + 1]))) out[y][x] = 'k';
  }
  return out;
}
const toRows = g => g.map(r => r.join(''));

// 石头守卫 40×40:巨型岩人,苔藓覆盖,胸口熔核
const BOSS_GOLEM = (() => {
  const g = grid(40), CX = 19.5;
  // 腿与脚
  prect(g, 13, 28, 17, 34, 'B'); prect(g, 22, 28, 26, 34, 'B');
  prect(g, 12, 33, 18, 37, 'A'); prect(g, 21, 33, 27, 37, 'A');
  prect(g, 13, 33, 17, 34, 'B'); prect(g, 22, 33, 26, 34, 'B');
  // 躯干(亮边朝左上)
  pell(g, CX, 22, 12.5, 11, 'C'); pell(g, CX + 1, 23, 11.4, 10, 'B'); pell(g, CX + 2.5, 24, 9.8, 9, 'A');
  pell(g, CX + 1, 23, 11.4, 10, 'B'); pell(g, CX, 23, 10.5, 9.4, 'B');
  // 手臂 + 巨拳(两侧)
  for (const s of [-1, 1]) {
    const ax = CX + s * 13.2;
    pell(g, ax, 20, 4.6, 8.4, 'C'); pell(g, ax + s * 0.8, 21, 3.6, 7.2, 'B');
    pell(g, ax, 31.5, 5.2, 4.8, 'C'); pell(g, ax + s * 0.6, 32, 4.2, 3.8, 'B');
    prect(g, ax - 3 + s, 29, ax + 2 + s, 30, 'A'); // 拳纹
  }
  // 头(略陷入双肩)
  pell(g, CX, 9.5, 8, 6.4, 'C'); pell(g, CX + 0.8, 10.2, 6.9, 5.4, 'B');
  // 眉、眼、嘴裂纹
  prect(g, 12, 6, 17, 7, 'A'); prect(g, 22, 6, 27, 7, 'A');
  prect(g, 13, 7, 17, 9, 'k'); prect(g, 22, 7, 26, 9, 'k');
  prect(g, 15, 8, 16, 8, 'c'); prect(g, 23, 8, 24, 8, 'c');
  prect(g, 17, 13, 22, 13, 'k'); ppx(g, 18, 12, 'k'); ppx(g, 21, 12, 'k');
  // 胸口熔核
  pell(g, CX, 25.5, 4.6, 4, 'k'); pell(g, CX, 25.5, 3.1, 2.6, 'c'); ppx(g, CX, 25, 'w');
  // 苔藓
  pell(g, 10.5, 15.5, 2.6, 1.8, 'G'); pell(g, 29, 28, 2.2, 1.5, 'g');
  pell(g, 14, 31, 1.7, 1.2, 'G'); pell(g, 26, 12, 1.5, 1.1, 'g');
  prect(g, 8, 38, 31, 38, 'x'); // 落影(先画,outlinePass 会跳过)
  return toRows(outlinePass(g));
})();

// 深渊领主 56×56:双骨角 + 熔心符文 + 撕裂披风
const BOSS_OVERLORD = (() => {
  const g = grid(56), CX = 27.5;
  // 披风(先画):肩部向两侧下摆展开,底缘撕裂
  for (let y = 20; y <= 47; y++) {
    const t = (y - 20) / 27;
    const x0 = Math.round(15 - 12 * t), x1 = Math.round(40 + 12 * t);
    for (let x = x0; x <= x1; x++) {
      if (y >= 44 && (x * 5 + y * 3) % 13 < 3) continue; // 撕裂锯齿(稀疏)
      ppx(g, x, y, x < x0 + 2 || x > x1 - 2 ? 'V' : 'P');
    }
  }
  // 手臂(垂于披风之上)+ 利爪
  for (const s of [-1, 1]) {
    const ax = CX + s * 12;
    line(g, ax, 25, ax + s * 2.5, 38, 3.2, 'P');
    line(g, ax + s * 0.8, 26, ax + s * 2.2, 36, 2, 'V');
    for (let f = -1; f <= 1; f++) line(g, ax + s * 2.5 + f, 38, ax + s * 2.5 + f * 1.6, 43, 0.9, 'k');
  }
  // 躯干 + 胸口符文熔心
  pell(g, CX, 31, 9.2, 11.5, 'V');
  pell(g, CX - 1, 30, 7.6, 9.6, 'V');
  pell(g, CX, 30.5, 3.6, 4.6, 'k'); pell(g, CX, 30.5, 2.4, 3.4, 'O'); pell(g, CX, 30.5, 1.2, 1.8, 'y');
  ppx(g, CX, 29.5, 'w');
  // 肩甲
  for (const s of [-1, 1]) {
    const sx = CX + s * 13;
    pell(g, sx, 21.5, 6.4, 4.6, 'P'); pell(g, sx + s, 22.2, 5.2, 3.6, 'V');
    prect(g, Math.round(sx) - 3, 18, Math.round(sx) + 2, 18, 'O'); // 甲缘金饰
  }
  // 头
  pell(g, CX, 13, 7.6, 7.2, 'V'); pell(g, CX - 1, 13.6, 6.4, 6, 'P');
  pell(g, CX - 0.5, 13.8, 5.6, 5.2, 'V');
  // 眼(红瞳)+ 嘴(獠牙)
  prect(g, 20, 10, 24, 14, 'k'); prect(g, 31, 10, 35, 14, 'k');
  prect(g, 21, 11, 23, 13, 'R'); prect(g, 32, 11, 34, 13, 'R');
  ppx(g, 21, 11, 'q'); ppx(g, 32, 11, 'q');
  prect(g, 24, 17, 31, 17, 'k'); ppx(g, 25, 18, 'q'); ppx(g, 28, 18, 'q'); ppx(g, 30, 18, 'q');
  // 双骨角(上拱曲线)
  for (const s of [-1, 1]) {
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = CX + s * (5 + 13 * t);
      const y = 7.5 - 6.2 * t + Math.sin(t * Math.PI) * 1.6;
      pell(g, x, y, 1.7, 1.7, 'F');
      pell(g, x + s * 0.7, y + 0.9, 0.9, 0.9, 'd');
    }
    ppx(g, CX + s * 17.6, 1.6, 'w'); // 角尖高光
  }
  // 披风下利爪足
  for (const s of [-1, 1]) {
    const fx = CX + s * 5.5;
    prect(g, Math.round(fx) - 2, 46, Math.round(fx) + 2, 50, 'V');
    for (let f = -1; f <= 1; f++) line(g, fx + f * 1.6, 50, fx + f * 2.1, 53, 0.8, 'k');
  }
  prect(g, 14, 54, 41, 54, 'x'); // 落影(先画,outlinePass 会跳过)
  return toRows(outlinePass(g));
})();

// ===== 点阵图集 =====
export const PIX = {

  // ---------------- 英雄(16×16,2 帧走路,默认朝右) ----------------

  // 战士:钢盔红缨 + 红色战裙,敦实轮廓
  hero_knight_0: [
    '......kRRk......',
    '.....kCRRCk.....',
    '....kCCCCCCk....',
    '....kCKKDKKCk...',
    '....kCCDDCCCk...',
    '.....kkkkkk.....',
    '....kAACCAAk....',
    '...kACkRRkCAk...',
    '..kACCkRRkCCAk..',
    '..kACkRRRRkCAk..',
    '..kACkRRRRkCAk..',
    '..kAkyyyyyykAk..',
    '...kkkRRRRkkk...',
    '......kRRk......',
    '....kKk..kKk....',
    '....kkk..kkk....',
  ],
  hero_knight_1: [
    '.....kRRk.......',
    '.....kCRRCk.....',
    '....kCCCCCCk....',
    '....kCKKDKKCk...',
    '....kCCDDCCCk...',
    '.....kkkkkk.....',
    '....kAACCAAk....',
    '...kACkRRkCAk...',
    '..kACCkRRkCCAk..',
    '..kACkRRRRkCAk..',
    '..kACkRRRRkCAk..',
    '..kAkyyyyyykAk..',
    '...kkkRRRRkkk...',
    '......kRRk......',
    '...kKk....kKk...',
    '...kkk....kkk...',
  ],

  // 法师:蓝尖帽 + 白胡 + 青袍
  hero_mage_0: [
    '........kk......',
    '.......kuuk.....',
    '......kuuuuk....',
    '.....kuuuuuuk...',
    '....kuuuuuuuuk..',
    '.kbbbbbbbbbbbbk.',
    '....kSSSSSSk....',
    '....kSKSSKSk....',
    '....kSSSSSSk....',
    '....kwwwwwwk....',
    '.....kwwwwk.....',
    '....kuwwwwuk....',
    '...kuuuuuuuuk...',
    '...kuuuuuuuuk...',
    '....kuukkuuk....',
    '....kk....kk....',
  ],
  hero_mage_1: [
    '.........kk.....',
    '.......kuuk.....',
    '......kuuuuk....',
    '.....kuuuuuuk...',
    '....kuuuuuuuuk..',
    '.kbbbbbbbbbbbbk.',
    '....kSSSSSSk....',
    '....kSKSSKSk....',
    '....kSSSSSSk....',
    '....kwwwwwwk....',
    '.....kwwwwk.....',
    '....kuwwwwuk....',
    '...kuuuuuuuuk...',
    '...kuuuuuuuuk...',
    '....kuukkuuk....',
    '.....kk..kk.....',
  ],

  // 游侠:绿兜帽 + 皮革腰带 + 背后箭羽
  hero_ranger_0: [
    '.....kkkkk......',
    '....kGGGGGk.....',
    '...kGGGGGGGk....',
    '...kGkkkkkGk....',
    '...kgSSKSGk.....',
    '....kSSSSk......',
    '...kGGGGGGk.....',
    '..FkGGGGGGk.....',
    '..NkGgGGgGk.....',
    '..FkGGGGGGk.....',
    '....kGGGGk......',
    '....knnnnk......',
    '....kGkkGk......',
    '....kGkkGk......',
    '....kNkkNk......',
    '....kkk.kkk.....',
  ],
  hero_ranger_1: [
    '.....kkkkk......',
    '....kGGGGGk.....',
    '...kGGGGGGGk....',
    '...kGkkkkkGk....',
    '...kgSSKSGk.....',
    '....kSSSSk......',
    '...kGGGGGGk.....',
    '..FkGGGGGGk.....',
    '..NkGgGGgGk.....',
    '..FkGGGGGGk.....',
    '....kGGGGk......',
    '....knnnnk......',
    '...kGk..kGk.....',
    '...kGk..kGk.....',
    '...kNk..kNk.....',
    '...kkk..kkk.....',
  ],

  // ---------------- 敌人 ----------------

  // 史莱姆:圆润弹性 + 左上高光 + 眯眯眼
  slime: [
    '..............',
    '....kkkkkk....',
    '...kGGGGGGk...',
    '..kGGvvGGGGk..',
    '.kGGvGGGGGGGk.',
    '.kGvGGGGGGGGk.',
    '.kGGkGGGGkGGk.',
    '.kGGkGGGGkGGk.',
    '.kGGGGGGGGGGk.',
    '.kGGGkkkGGGGk.',
    '.kGGGGGGGGGGk.',
    '..kGGGGGGGGk..',
    '...kkkkkkkk...',
    '....xxxxxx....',
  ],

  // 蝙蝠:展翅 + 红瞳獠牙
  bat: [
    '..............',
    '.....k..k.....',
    '.k...kKKk...k.',
    '.kk.kkKKkk.kk.',
    '.kVPKRKKRKPVk.',
    'kVPPKKKKKKPPVk',
    'kVPPKKKKKKPPVk',
    'kVPKPkwwkPKPVk',
    '.kVPKkKKkKPVk.',
    '.kkVPKKKKPVkk.',
    '...kVPKKPVk...',
    '....kkVVkk....',
    '.....kVVk.....',
    '......kk......',
  ],

  // 骷髅:持竖剑
  skeleton: [
    '.....kkkkkk.....',
    '....kDDDDDDk....',
    '....kDDDDDDk....',
    '....kDkDDkDk.kD.',
    '....kDDDDDDk.kD.',
    '....kkkkkkkk.kD.',
    '....kDkDkDk..kD.',
    '.....kDDDDk..kD.',
    '...kkDDDDDDkkkD.',
    '..kDDkDDDDkDyyk.',
    '..kDDkDDDDk.kkk.',
    '...kkkDDDkk.....',
    '.....kDkDk......',
    '.....kDkDk......',
    '.....kDkDk......',
    '.....kk.kk......',
  ],

  // 蜘蛛:多腿 + 红眼复眼
  spider: [
    '..............',
    '..k........k..',
    '.kk..kkkk..kk.',
    '.k.kkNNNNkk.k.',
    'kk.kNNNNNNk.kk',
    'kkkNNnNNnNNkkk',
    'k.kNNRNRNRNk.k',
    '..kNNNNNNNNk..',
    '..kNkNNNNkNk..',
    '.kk.kNNNNk.kk.',
    '.k..kkkkkk..k.',
    'kk..........kk',
    '..............',
    '..............',
  ],

  // 蛮兵:壮硕紫皮 + 重锤
  brute: [
    '....kkkkkkkkkkkk....',
    '...kPPPPPPPPPPPPk...',
    '..kPPKPPPPPPKPPPPk..',
    '..kPKKPPPPPPKKPPPk..',
    '..kPPPPPPPPPPPPPPk..',
    '..kPPPkPPPPPPkPPPk..',
    '.kAAAkkPPPPPPkkAAAk.',
    'kAAAAAkPPPPPPkAAAAAk',
    'kAAkAAkPPPPPPkAAkAAk',
    'kAk.kAkPPyyPPkAk.kAk',
    'kAk.kAkkPyyPkAk.kAk.',
    '.k..kAAkPyyPkAAk..k.',
    '.....kkkPPPPkkk.....',
    '....kPPPPPPPPPPk....',
    '....kPPkPPPPkPPk....',
    '....kPPk.kk.kPPk....',
    '....kPPk....kPPk....',
    '...kkAAk....kAAkk...',
    '...kkkkk....kkkkk...',
    '...xxxxxxxxxxxxxxxx.',
  ],

  // 自爆虫:身体就是炸弹,头顶引信
  bomber: [
    '.....kok......',
    '......k.......',
    '....kkkkkk....',
    '...kKKKKKKk...',
    '..kKwKKKKKKk..',
    '..kKKKKKKKKk..',
    '..kKyKKyKKKk..',
    '..kKKKKKKKKk..',
    '..kKkRRkKKKk..',
    '...kKKKKKKk...',
    '....kkkkkk....',
    '...kAkkkkAk...',
    '....kk..kk....',
    '..............',
  ],

  // 岩龟:厚重龟甲 + 探头
  turtle: [
    '..................',
    '....kkkkkkkk......',
    '..kkBBBBBBBBkk....',
    '.kBBtBBBBBBtBBk...',
    '.kBtBBttBBBBtBk...',
    'kBBtBttttBBBtBBk..',
    'kBBBtttBBttBBBkkk.',
    'kBtBBBttttBBBkttk.',
    'kBBtBBBttBBBkttStk',
    'kBBBBBBBBBBBktKStk',
    '.kBBtBBBBBBBkkkkkk',
    '.kBtBBttBBtBBk....',
    '..kkBBBBBBBkk.....',
    '...kkkkkkkkk......',
    '...kBBk..kBBk.....',
    '...kAAk..kAAk.....',
    '...kkk....kkk.....',
    '..................',
  ],

  // 鬼火:飘忽焰形 + 拖尾
  wisp: [
    '....kk......',
    '...kcck.....',
    '..kcccck....',
    '.kcwcccck...',
    '.kcwkccck...',
    '.kccccccck..',
    '.kckcccck...',
    '.kuccccck...',
    '..kuccck....',
    '...kck.k....',
    '....k..k....',
    '............',
  ],

  // 死神(精英):斗篷 + 竖镰(右手持柄)
  reaper: [
    '..........kkkk.kkkk.',
    '........kVVVVVkDDDDk',
    '........kVkkkkVDDDDD',
    '........kVkccckVkNN.',
    '........kVkkkkVk.NN.',
    '.......kVVkkkkVV.NN.',
    '......kVVVVVVVVV.NN.',
    '......kVPVVVVVVV.NN.',
    '.....kVVPPVVVVVV.NN.',
    '.....kVPPPVVVVVVDNN.',
    '....kVVPPVVVVVVV.NN.',
    '....kVVVVVVVVVVV.NN.',
    '...kVVVVVVVVVVVV.NN.',
    '...kVPVVVVVVVVVV.NN.',
    '...kVVVVVPVVVVVV.NN.',
    '...kVVVVVVVVVVVV.NN.',
    '...kVVVVVVVVVVVV.NN.',
    '...kVkVVkVVkVVkV.NN.',
    '....kk.kkk.kk.kk.NN.',
    '....kk.kkk.kk.kk....',
  ],

  // ---------------- Boss(程序化绘制,见顶部 BOSS_GOLEM / BOSS_OVERLORD) ----------------

  // 石头守卫 40×40:巨型岩人,苔藓覆盖,胸口熔核
  boss_golem: BOSS_GOLEM,

  // 深渊领主 56×56:双骨角 + 熔心符文 + 撕裂披风
  boss_overlord: BOSS_OVERLORD,

  // ---------------- 武器弹体 / 表现(默认朝右) ----------------

  // 飞刀
  w_knife: [
    '..........',
    '......kkk.',
    '.....kDDk.',
    '.kkkDDDDwk',
    '.kykDDDDk.',
    '.kkkDDDk..',
    '.....kkk..',
    '..........',
    '..........',
    '..........',
  ],

  // 魔弹(青色飞矢)
  w_bolt: [
    '........',
    '.....kk.',
    '..kkcck.',
    '.kcccwk.',
    '.kccwwk.',
    '..kkcck.',
    '.....kk.',
    '........',
  ],

  // 长弓箭
  w_arrow: [
    '............',
    '........kk..',
    'kk....kkDDk.',
    'kFkknnDDDDDk',
    'kFFknnDDDDDk',
    'kk....kkDDk.',
    '........kk..',
    '............',
  ],

  // 奥术法球
  w_orb: [
    '...kkkk...',
    '..kcccck..',
    '.kccuuuck.',
    '.kcwuuuck.',
    'kcuuuuuuck',
    'kuuuuuubck',
    '.kuuuubuk.',
    '..kuubuk..',
    '...kkkk...',
    '..........',
  ],

  // 火球(带旋尾)
  w_fireball: [
    '............',
    '..kk........',
    '.kRRkk......',
    '.kRORkk.....',
    '..kRORRkk...',
    '..kROyyRRkk.',
    '..kROyyOORk.',
    '..kROOOORk..',
    '..kRROORk...',
    '...kRRRk....',
    '....kkk.....',
    '............',
  ],

  // 回旋镖
  w_boomerang: [
    '............',
    '.kk......kk.',
    'kNNk....kNNk',
    'kNyNk..kNyNk',
    '.kNyNkkNyNk.',
    '..kNyNNyNk..',
    '...kNyNyNk..',
    '....kNyyNk..',
    '.....kNNk...',
    '......kk....',
    '............',
    '............',
  ],

  // 圣水瓶
  w_flask: [
    '...kkkk...',
    '...kNNk...',
    '...kwwk...',
    '..kwwwwk..',
    '.kwwuuwwk.',
    '.kwuuyuwk.',
    'kwuuyyyuwk',
    'kwuuyyyuwk',
    '.kuuyyyuk.',
    '..kkkkkk..',
  ],

  // 圣盾
  w_shield: [
    '....kkkkkkkk....',
    '..kkCCDDDDCCkk..',
    '.kCDDCAAAACDDCk.',
    '.kDCAAkyykAACDk.',
    'kDCAkyyyyyykACDk',
    'kCAkyyOAyyOykACk',
    'kCAkyOOyyOOykACk',
    'kCAkyyOAyyOykACk',
    'kDCAkyyyyyykACDk',
    '.kDCAAkyykAACDk.',
    '.kCDDCAAAACDDCk.',
    '..kkCCDDDDCCkk..',
    '....kkkkkkkk....',
    '................',
    '................',
    '................',
  ],

  // 竖向闪电 8×28
  lightning_v: [
    '...ww...',
    '..cwwc..',
    '..cwwc..',
    '.cwwwc..',
    '.cwwwc..',
    '..cwwc.y',
    '..cwwc.y',
    '.cwwwc.y',
    '.cwwwc..',
    '..cwwc..',
    '...ww...',
    '...ww...',
    '..cwwc..',
    '.cwwwc..',
    '.cwwwc..',
    '..cwwc..',
    '..cwwc.y',
    '...ww.y.',
    '..cwwc..',
    '.cwwwc..',
    '.cwwwc..',
    '..cwwc..',
    '..cwwc..',
    '...ww...',
    '...ww...',
    '...ww...',
    '...ww...',
    '........',
  ],

  // 圣域光圈 48×48(半透明同心环,alpha 由绘制方再调)
  zone_holy: ZONE_HOLY,

  // ---------------- 拾取物 ----------------

  gem_b: [
    '..kkkk..',
    '.kwcuuk.',
    'kwcuuuuk',
    'kcuuuuuk',
    '.kuuuuuk',
    '.kuuuuk.',
    '..kuuk..',
    '...kk...',
  ],
  gem_g: [
    '..kkkk..',
    '.kwvGGk.',
    'kwvGGGGk',
    'kvGGGGGk',
    '.kGGGGGk',
    '.kGGGGk.',
    '..kGGk..',
    '...kk...',
  ],
  gem_r: [
    '..kkkk..',
    '.kwqRRk.',
    'kwqRRRRk',
    'kqRRRRRk',
    '.kRRRRRk',
    '.kRRRRk.',
    '..kRRk..',
    '...kk...',
  ],
  coin: [
    '..kkkk..',
    '.kyyyyk.',
    'kywyyyok',
    'kywyyyok',
    'kyyyyook',
    '.kyyook.',
    '..kkkk..',
    '........',
  ],
  meat: [
    '............',
    '...kkkk.....',
    '..kRRRRk....',
    '.kRqqRRRk...',
    '.kRqRRRRRkk.',
    '.kRRRRRRRFFk',
    '.kRRRRRRRFFk',
    '..kRRRRRk...',
    '...kkkkk....',
    '............',
    '............',
    '............',
  ],
  magnet: [
    '............',
    '...kkkkkk...',
    '..kRRRRRRk..',
    '..kRRkkkRRk.',
    '..kRRk.kRRk.',
    '..kRRk.kRRk.',
    '..kRRk.kRRk.',
    '..kwwk.kwwk.',
    '..kwwk.kwwk.',
    '...kk...kk..',
    '............',
    '............',
  ],
  chest: [
    '................',
    '...kkkkkkkkkk...',
    '..kOOOOOOOOOOk..',
    '.kOnnnnnnnnnnOk.',
    '.knnnnnnnnnnnnk.',
    '.knnNnnnnnnnNnk.',
    '.kkkkkkkkkkkkkk.',
    '.kNNNNNNNNNNNNk.',
    '.kNnnnnnNNnnnNk.',
    '.kNnnnyOOynnnNk.',
    '.kNnnnyOOynnnNk.',
    '.kNnnnnnNNnnnNk.',
    '.kNNNNNNNNNNNNk.',
    '.kkkkkkkkkkkkkk.',
    '.xxxxxxxxxxxxxx.',
    '................',
  ],

  // ---------------- 地面图块 / 装饰 ----------------

  tile_grass_0: [
    'EEEEEEEEEEEEEEEE',
    'EEgEEEEEEEEgEEEE',
    'EEEEEEGEEEEEEEEE',
    'EEEEEgEEEEEgEEEE',
    'EGEEEEEEEEEEEEGE',
    'EEEEEEEEgEEEEEEE',
    'EEEgEEEEEEEEEEgE',
    'EEEEEEEEEEGEEEEE',
    'EGEEEEgEEEEEEEEE',
    'EEEEEEEEEEEEgEEE',
    'EEEGEEEEEEEEEEEE',
    'EEEEEEEEEgEEEGEE',
    'gEEEEgEEEEEEEEEE',
    'EEEEEEEEEGEEgEEE',
    'EEgEEEEEEEEEEEEE',
    'EEEEEEEEEEEEEEEE',
  ],
  tile_grass_1: [
    'EEEEEEEEEEEEEEEE',
    'EEEEgEEEEEEEGEEE',
    'EGEEEEEEEEgEEEEE',
    'EEEEEEEEEEEEEEEE',
    'EEEEEEgEEEEEEEEG',
    'EEgEEEEEEEEgEEEE',
    'EEEEEEEGEEEEEEEE',
    'EEEEgEEEEEEEEgEE',
    'EEEEEEEEEEEEEEEE',
    'EGEEEEgEEEEEEEEE',
    'EEEEEEEEEEEGEEEE',
    'EEEEgEEEEEEEEEEE',
    'EEEEEEEEgEEgEEEE',
    'EEEGEEEEEEEEEGEE',
    'EEEEEEEEgEEEEEEE',
    'EEEEEEEEEEEEEEEE',
  ],
  tile_grass_2: [
    'EEEEEEEEEEEEEEEE',
    'EEEEEEEEgEEEEEEE',
    'EEGEEEEEEEEEEGEE',
    'EEEEEEgEEEEEEEEE',
    'EEEgEEEEEEEEEEEE',
    'EEEEEEEEEGEEEEEE',
    'EgEEEEgEEEEEEEEG',
    'EEEEEEEEEEEgEEEE',
    'EEEGEEEEEEEEEEEE',
    'EEEEEEEGEEEEEEEE',
    'EgEEEEEEEEgEEEEE',
    'EEEEEEEEEEEEEEEE',
    'EEEEgEEEGEEEEEEE',
    'EEEEEEEEEEEEgEEE',
    'EGEEEEgEEEEEEEEE',
    'EEEEEEEEEEEEEEEE',
  ],
  tile_dirt: [
    'NNNNNNNNNNNNNNNN',
    'NNnNNNNNNNNNnNNN',
    'NNNNNNNdNNNNNNNN',
    'NnNNNNNNNNNnNNNN',
    'NNNNNnNNNNNNNNNN',
    'NNdNNNNNNnNNNNNN',
    'NNNNNNNNNNNNNNNN',
    'NnNNNNNNNNNNNdNN',
    'NNNNNnNNNNNNNNNN',
    'NNNNNNNNNNnNNNNN',
    'NNdNNNNNNNNNNNNN',
    'NNNNNNNNNnNNNnNN',
    'NnNNNNNNNNNNNNNN',
    'NNNNNnNNdNNNNNNN',
    'NNNNNNNNNNNNNnNN',
    'NNNNNNNNNNNNNNNN',
  ],

  dec_rock: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '......kkkk......',
    '.....kBBBBk.....',
    '....kBCDDBBk....',
    '...kBBDDDDBBk...',
    '...kBBDDDBBBk...',
    '..kBBBBBBBBBBk..',
    '..kBABBBBABBBk..',
    '..kBBBBBBBBBBk..',
    '..kkkkkkkkkkkk..',
    '...xx......xx...',
    '................',
  ],
  dec_flower: [
    '................',
    '................',
    '......kk........',
    '.....kyyk.......',
    '....kyOOyk......',
    '.....kyyk.......',
    '......kv........',
    '...k...v...kk...',
    '..kcck.v.kyOyk..',
    '...kuu.v.kuyuk..',
    '....v.GvG..v....',
    '.....GvvG..v....',
    '......vGv.Gv....',
    '.......v.Gv.....',
    '.......v..v.....',
    '................',
  ],
  dec_bones: [
    '................',
    '................',
    '................',
    '................',
    '....kkkk........',
    '...kDDDDk.......',
    '...kDkDkD.......',
    '...kDDDDk..kkk..',
    '....kkkk..kFFFk.',
    '...kDDDDkkkFFk..',
    '..kDDDDDDkFFkk..',
    '...kkkkkkkk.....',
    '................',
    '................',
    '................',
    '................',
  ],
  dec_stump: [
    '................',
    '................',
    '................',
    '....kkkkkkkk....',
    '...kffnnnnffk...',
    '..kfnNnnnnNnfk..',
    '..kfnNnffnNnfk..',
    '..kfnNnnnnNnfk..',
    '..kNnnnnnnnnNk..',
    '..kNNnnnnnnNNk..',
    '..kNNNNNNNNNNk..',
    '..kNkNNNNNNkNk..',
    '..kNkkNNNNkkNk..',
    '..kkkkkkkkkkkk..',
    '....xxxxxxx.....',
    '................',
  ],

  // ---------------- 被动图标(16×16) ----------------

  // 力量:利剑
  p_might: [
    '..........kk....',
    '.........kDDk...',
    '........kDwwk...',
    '.......kDwwk....',
    '......kDwwk.....',
    '.....kDwwk......',
    '....kDwwk.......',
    '.kk.kDwk........',
    'kyykkDwk........',
    '.kkykkk.........',
    '..kykNk.........',
    '...kyNk.........',
    '....kk..........',
    '....kNk.........',
    '.....kk.........',
    '................',
  ],

  // 冷却:沙漏
  p_cd: [
    '.kkkkkkkkkkkkkk.',
    '..kFFFFFFFFFFFFk',
    '...kDDDDDDDDk...',
    '....kDDyyDDk....',
    '.....kDyyDk.....',
    '......kyyk......',
    '.......kk.......',
    '.......kk.......',
    '......kyyk......',
    '.....kyyyyk.....',
    '....kyyyyyyk....',
    '...kDDyyyyDDk...',
    '...kDDDDDDDDk...',
    '..kFFFFFFFFFFFFk',
    '.kkkkkkkkkkkkkk.',
    '................',
  ],

  // 移速:疾风之靴
  p_speed: [
    '................',
    '................',
    '........kk......',
    '...kkkkkNNk.....',
    '..kwwwwkNNNk....',
    '.kwwwwwkNNNNk...',
    'kwwwwwkNNNNNk...',
    'kkwwkkNNNNNNk...',
    '.kkkNNNNNNNk....',
    '...kNNNNNNk.....',
    '...kNNNNNk......',
    '..kNkkkkkk......',
    '..kkkoookk......',
    '..kooooooook....',
    '..kkkkkkkkkk....',
    '................',
  ],

  // 生命:红心
  p_hp: [
    '................',
    '................',
    '...kkkk..kkkk...',
    '..kRRRRkkRRRRk..',
    '.kRqqRRRRRRRRRk.',
    '.kRqRRRRRRRRRRk.',
    'kRqRRRRRRRRRRRRk',
    'kRRRRRRRRRRRRRRk',
    'kRRRRRRRRRRRRRRk',
    '.kRRRRRRRRRRRRk.',
    '..kRRRRRRRRRRk..',
    '...kRRRRRRRRk...',
    '....kRRRRRRk....',
    '.....kRRRRk.....',
    '......kRRk......',
    '.......kk.......',
  ],

  // 磁力:磁铁
  p_magnet: [
    '................',
    '...kkkkkkkkkk...',
    '..kRRRRRRRRRRk..',
    '..kRRRkkkkRRRk..',
    '..kRRk....kRRk..',
    '..kRRk....kRRk..',
    '..kRRk....kRRk..',
    '..kRRk....kRRk..',
    '..kwwk....kwwk..',
    '..kwwk....kwwk..',
    '..kwwk....kwwk..',
    '..kkkk....kkkk..',
    '................',
    '................',
    '................',
    '................',
  ],

  // 经验:学士帽
  p_xp: [
    '................',
    '.......kk.......',
    '.....kkVVkk.....',
    '...kkVVVVVVkk...',
    '.kkVVVVVVVVVVky.',
    'kVVVVVVVVVVVVVVk',
    '.kkVVVVVVVVVVky.',
    '...kkkkkkkkkk.yk',
    '.....kVVVVk...y.',
    '.....kVVVVk.....',
    '.....kVVVVk.....',
    '.....kVVVVk.....',
    '.....kkkkkk.....',
    '................',
    '................',
    '................',
  ],

  // 金币:钱袋
  p_gold: [
    '................',
    '.......kk.......',
    '......kNNk......',
    '.....knnnk......',
    '....kknnnkk.....',
    '...knnnnnnnk....',
    '..knnnnnnnnnk...',
    '.knnnnnnnnnnnk..',
    '.knnnnOOnnnnnk..',
    'knnnnOyyOnnnnnk.',
    'knnnnOOnnnnnnnk.',
    'knnnnnnnnnnnnnk.',
    '.knnnnnnnnnnnk..',
    '..knnnnnnnnnk...',
    '...kkkkkkkkk....',
    '................',
  ],

  // 护甲:胸甲
  p_armor: [
    '................',
    '..kkkk....kkkk..',
    '.kCCCCkkkkCCCCk.',
    '.kCCCkkAAkkCCCk.',
    'kCCCCkAAAAkCCCCk',
    'kCCCkAAAAAAkCCCk',
    'kCCCkADDDDAkCCCk',
    'kCCCkADDDDAkCCCk',
    'kCCCkAAAAAAkCCCk',
    'kCCCkAADDDAkCCCk',
    '.kCCkAAAAAAkCCk.',
    '.kCCkkAAAAkkCCk.',
    '..kkkAAAAAAkkk..',
    '.....kkkkkk.....',
    '................',
    '................',
  ],

  // ---------------- 英雄头像(16×16,选人卡) ----------------

  hero_face_knight: [
    '......kRRk......',
    '.....kCRRCk.....',
    '....kCCCCCCk....',
    '...kCCCCCCCCk...',
    '...kCCCCCCCCk...',
    '...kCKKDDKKCk...',
    '...kCKKDDKKCk...',
    '...kCCCCCCCCk...',
    '....kCCDDCCk....',
    '....kCCCCCCk....',
    '.....kkkkkk.....',
    '....kAACCAAk....',
    '...kAACCCAACk...',
    '..kAACCCAACCk...',
    '.kAACCCCCCAACk..',
    '.kkkkkkkkkkkkkk.',
  ],
  hero_face_mage: [
    '........kk......',
    '.......kuuk.....',
    '......kuuuuk....',
    '.....kuuuuuuk...',
    '....kuuuuuuuuk..',
    '.kbbbbbbbbbbbbk.',
    '....kSSSSSSk....',
    '....kSKSSKSk....',
    '....kSKSSKSk....',
    '....kSSSSSSk....',
    '....kwwwwwwk....',
    '.....kwwwwk.....',
    '....kwwwwwwk....',
    '...kwwwwwwwwk...',
    '...kwwwwwwwwk...',
    '....kwwwwwwk....',
  ],
  hero_face_ranger: [
    '.....kkkkkk.....',
    '....kGGGGGGk....',
    '...kGGGGGGGGk...',
    '...kGGGGGGGGk...',
    '...kGkkkkkkGk...',
    '...kgSSSSSSgk...',
    '...kgSKSSKSgk...',
    '...kgSKSSKSgk...',
    '...kgSSSSSSgk...',
    '....kSSSSSSk....',
    '....kgSSSSgk....',
    '....kGGGGGGk....',
    '...kGGGGGGGGk...',
    '..kGGGGGGGGGGk..',
    '.kGGGGGGGGGGGGk.',
    '.kkkkkkkkkkkkkk.',
  ],
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
 * 以世界坐标 (cx,cy) 为中心绘制精灵(已按 SCALE 放大,禁止平滑由引擎保证)。
 * o: { flip:bool, angle:number, alpha:0-1, tint:'#hex 或 null', scale:number }
 */
export function drawSprite(ctx, name, cx, cy, o = {}) {
  let c = bakeCache.get(name);
  if (!c) {
    const rows = PIX[name];
    if (!rows) return;
    c = raster(rows);
    bakeCache.set(name, c);
  }
  const s = SCALE * (o.scale || 1);
  if (!(s > 0)) return;
  const w = c.width * s, h = c.height * s;
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
