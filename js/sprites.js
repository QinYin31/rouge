// ===== 🎨 美术agent 名下:全部像素精灵定义与烘焙(水墨武侠版) =====
// 本文件上半部分为【纯数据】(可在 node 中 import 做校验,不依赖 document);
// 只有 bake()/drawSprite() 依赖 canvas API。
// 点阵格式:字符串数组,每字符一个调色板键;'.' 或 ' ' 为透明。
//
// 【水墨调色板设计】
//  宣纸:P 亮纸 / p 纸底 / e 纸影 / E 深纸(土径)/ D 土斑 / w 纸白(骨·高光)
//  墨:  k 浓墨 / K 重墨 / M 中墨 / m 淡墨 / g 淡墨灰(远山·干笔)
//  朱砂: r 朱砂 / R 朱砂亮 / q 朱砂暗(点睛专用)
//  青焰: c 青焰亮 / C 青焰 / u 青焰深 / U 青焰渊
//  辅色(水墨画之赭石·藤黄·花青): n 赭木 / N 深赭 / o 藤黄金 / O 亮金 / y 淡金
//        v 竹青 / V 竹深 / J 玉青 / s 枯褐 / t 青灰(龟甲·道袍)
//  半透明键(预烘焙晕染,禁止运行时 shadowBlur):
//        x 墨晕落影 / a·b·A 青焰晕(浓→淡) / h·H 朱砂晕 / l·L 墨晕 / j 金晕 / i 纸光

export const SCALE = 3;

// —— 水墨色板(带 alpha 的键即为烘焙进点阵的光晕/晕染) ——
export const PAL = {
  // 宣纸系
  P: '#f2ecdd', p: '#ece5d3', e: '#e2dabf', E: '#d3c7a6', D: '#c2b48e',
  w: '#faf6ea',
  // 墨系
  k: '#2b2b2b', K: '#3f4140', M: '#6b6b5d', m: '#8a8a7a', g: '#b9b3a2',
  // 朱砂系
  r: '#b03a2e', R: '#c85545', q: '#8c2f27',
  // 青焰系
  c: '#a8e2e8', C: '#7fd4de', u: '#5fb8c4', U: '#41899b',
  // 赭石 / 藤黄 / 草木 / 枯褐 / 青灰
  n: '#9c8455', N: '#77643f', o: '#c9972f', O: '#e2b94e', y: '#efe0b0',
  v: '#7f8a70', V: '#5c6b52', J: '#4f9673', s: '#5d5344', t: '#5d6b66',
  // 半透明晕染键(烘焙即半透明)
  x: '#2b2b2b38',             // 落影墨晕
  a: '#5fb8c46e',             // 青焰晕·浓
  b: '#7fd4de45',             // 青焰晕·中
  A: '#a8e2e822',             // 青焰晕·淡
  h: '#c8554566',             // 朱砂晕·浓
  H: '#c8554536',             // 朱砂晕·淡
  l: '#6b6b5d55',             // 墨晕·浓
  L: '#6b6b5d2e',             // 墨晕·淡
  j: '#c9972f5c',             // 金晕
  i: '#faf6ea77',             // 纸光
};

// 程序化生成淡墨扩散圆环(纯计算,仍属纯数据):同心墨环 + 干笔飞白
const ZONE_HOLY = (() => {
  const S = 48, g = Array.from({ length: S }, () => Array(S).fill('.'));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - 23.5, y - 23.5);
    if (d > 23) continue;
    // 干笔噪声:同一像素带内按位置决定降级(墨环不均匀,似笔锋擦过)
    const bristle = (x * 7 + y * 13 + ((x * y) % 5)) % 11;
    let ch = '.';
    if (d > 21.4) ch = bristle % 3 === 0 ? '.' : 'L';       // 外缘淡晕
    else if (d > 19.6) ch = bristle < 2 ? 'L' : 'l';        // 外环(浓)
    else if (d > 15.6) ch = '.';                            // 呼吸留白
    else if (d > 13.6) ch = bristle < 3 ? 'L' : 'l';        // 中环
    else if (d > 11.2) ch = '.';
    else if (d > 9.6) ch = bristle % 4 === 0 ? '.' : 'L';   // 内柔环
    else if (d > 5.0) ch = '.';
    else ch = 'L';                                          // 中心墨点
    g[y][x] = ch;
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
// 实体键(参与自动描边):透明 '.' 与半透明晕染/落影不描边
const _ALPHA = new Set(['.', ' ', 'x', 'a', 'b', 'A', 'h', 'H', 'l', 'L', 'j', 'i']);
const SOLID = ch => !_ALPHA.has(ch);
function outlinePass(g) { // 给所有实体外缘补 1px 浓墨描边
  const S = g.length, out = g.map(r => r.slice());
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (g[y][x] !== '.') continue;
    if ((y > 0 && SOLID(g[y - 1][x])) || (y < S - 1 && SOLID(g[y + 1][x])) ||
        (x > 0 && SOLID(g[y][x - 1])) || (x < S - 1 && SOLID(g[y][x + 1]))) out[y][x] = 'k';
  }
  return out;
}
const toRows = g => g.map(r => r.join(''));

// 墨染乾坤 24×24(进化图标):浓墨双环如砚池漩涡,带干笔飞白
const W_HOLY_EVO = (() => {
  const S = 24, g = grid(S), C = 11.5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - C, y - C);
    const bristle = (x * 5 + y * 11) % 9;
    let ch = '.';
    if (d > 12.6) ch = '.';
    else if (d > 10.6) ch = bristle < 2 ? 'M' : 'k';   // 外环浓墨(带飞白)
    else if (d > 9.2) ch = bristle % 3 === 0 ? '.' : 'l'; // 外环墨晕
    else if (d > 7.2) ch = '.';
    else if (d > 6.0) ch = bristle < 2 ? 'm' : 'M';    // 中环中墨
    else if (d > 4.4) ch = '.';
    else if (d > 3.0) ch = bristle % 4 === 0 ? '.' : 'l';
    else if (d > 1.9) ch = '.';
    else ch = 'k';                                     // 中心墨点
    g[y][x] = ch;
  }
  return toRows(g);
})();

// 石像守卫 40×40:灰石傀儡,身布斧凿裂纹,胸口青焰石核
const BOSS_GOLEM = (() => {
  const g = grid(40), CX = 19.5;
  // 腿与脚(石块感:上亮下暗)
  prect(g, 13, 28, 17, 34, 'm'); prect(g, 22, 28, 26, 34, 'm');
  prect(g, 12, 33, 18, 37, 'M'); prect(g, 21, 33, 27, 37, 'M');
  prect(g, 13, 33, 17, 34, 'm'); prect(g, 22, 33, 26, 34, 'm');
  // 躯干(左上受光,右下背光)
  pell(g, CX, 22, 12.5, 11, 'g'); pell(g, CX + 1, 23, 11.4, 10, 'm'); pell(g, CX + 2.5, 24, 9.8, 9, 'M');
  pell(g, CX + 1, 23, 11.4, 10, 'm'); pell(g, CX, 23, 10.5, 9.4, 'm');
  // 手臂 + 巨拳(两侧)
  for (const s of [-1, 1]) {
    const ax = CX + s * 13.2;
    pell(g, ax, 20, 4.6, 8.4, 'g'); pell(g, ax + s * 0.8, 21, 3.6, 7.2, 'm');
    pell(g, ax, 31.5, 5.2, 4.8, 'g'); pell(g, ax + s * 0.6, 32, 4.2, 3.8, 'm');
    prect(g, ax - 3 + s, 29, ax + 2 + s, 30, 'M'); // 拳纹裂纹
  }
  // 头(略陷入双肩)
  pell(g, CX, 9.5, 8, 6.4, 'g'); pell(g, CX + 0.8, 10.2, 6.9, 5.4, 'm');
  // 眉、眼、嘴裂纹(青焰石核目光)
  prect(g, 12, 6, 17, 7, 'M'); prect(g, 22, 6, 27, 7, 'M');
  prect(g, 13, 7, 17, 9, 'k'); prect(g, 22, 7, 26, 9, 'k');
  prect(g, 15, 8, 16, 8, 'c'); prect(g, 23, 8, 24, 8, 'c');
  prect(g, 17, 13, 22, 13, 'k'); ppx(g, 18, 12, 'k'); ppx(g, 21, 12, 'k');
  // 胸口青焰石核(预烘焙微晕)
  pell(g, CX, 25.5, 4.6, 4, 'k'); pell(g, CX, 25.5, 3.4, 2.9, 'a'); pell(g, CX, 25.5, 2.4, 2.0, 'c');
  ppx(g, CX, 25, 'w');
  // 斧凿裂纹与苔点
  line(g, 8, 18, 12, 24, 0.5, 'k'); line(g, 27, 26, 30, 21, 0.5, 'k');
  line(g, 24, 34, 28, 37, 0.5, 'k'); line(g, 14, 11, 17, 8, 0.4, 'k');
  pell(g, 10.5, 15.5, 2.2, 1.5, 'v'); pell(g, 29, 28, 1.9, 1.3, 'V');
  pell(g, 14, 31, 1.4, 1.0, 'v'); pell(g, 26, 12, 1.2, 0.9, 'V');
  prect(g, 8, 38, 31, 38, 'x'); // 落影(先画,outlinePass 会跳过)
  return toRows(outlinePass(g));
})();

// 无常尊者 56×56:黑袍魔头,高帽垂符,朱砂点睛,浓墨撕裂下摆
const BOSS_OVERLORD = (() => {
  const g = grid(56), CX = 27.5;
  // 黑袍(先画):肩部向两侧下摆展开,底缘撕裂
  for (let y = 20; y <= 47; y++) {
    const t = (y - 20) / 27;
    const x0 = Math.round(15 - 12 * t), x1 = Math.round(40 + 12 * t);
    for (let x = x0; x <= x1; x++) {
      if (y >= 44 && (x * 5 + y * 3) % 13 < 3) continue; // 撕裂锯齿(稀疏)
      ppx(g, x, y, x < x0 + 2 || x > x1 - 2 ? 'k' : 'K'); // 边缘浓墨,袍身重墨
    }
  }
  // 袍身淡墨飞白(笔触感)
  line(g, 22, 26, 20, 40, 1.2, 'M'); line(g, 33, 28, 35, 42, 1.0, 'M');
  line(g, 26, 24, 25, 44, 0.8, 'M');
  // 手臂(垂于袍上)+ 利爪
  for (const s of [-1, 1]) {
    const ax = CX + s * 12;
    line(g, ax, 25, ax + s * 2.5, 38, 3.2, 'K');
    line(g, ax + s * 0.8, 26, ax + s * 2.2, 36, 2, 'k');
    for (let f = -1; f <= 1; f++) line(g, ax + s * 2.5 + f, 38, ax + s * 2.5 + f * 1.6, 43, 0.9, 'k');
  }
  // 腰间朱砂绦带
  prect(g, 20, 30, 35, 31, 'r'); prect(g, 19, 30, 20, 33, 'R');
  // 胸口镇魂印(朱砂圆印)
  pell(g, CX, 26.5, 3.4, 4.2, 'r'); pell(g, CX, 26.5, 2.0, 2.6, 'R'); ppx(g, CX - 1, 26, 'y');
  // 肩部
  for (const s of [-1, 1]) {
    const sx = CX + s * 13;
    pell(g, sx, 21.5, 6.4, 4.6, 'K'); pell(g, sx + s, 22.2, 5.2, 3.6, 'k');
    prect(g, Math.round(sx) - 3, 18, Math.round(sx) + 2, 18, 'm'); // 肩缘淡墨勾
  }
  // 脸(惨白)+ 朱砂瞳
  pell(g, CX, 13.5, 6.8, 6.4, 'k'); pell(g, CX - 0.6, 13.8, 5.6, 5.2, 'w');
  pell(g, CX - 0.8, 14, 4.8, 4.4, 'w');
  prect(g, 22, 11, 25, 12, 'k'); prect(g, 30, 11, 33, 12, 'k');     // 浓眉
  prect(g, 23, 13, 24, 14, 'r'); prect(g, 31, 13, 32, 14, 'r');     // 朱砂瞳
  ppx(g, 23, 13, 'R'); ppx(g, 31, 13, 'R');
  prect(g, 25, 17, 30, 17, 'k'); ppx(g, 26, 18, 'k'); ppx(g, 29, 18, 'k'); // 抿口獠影
  // 高帽(白纸高帽,前贴朱砂符)
  prect(g, 22, 1, 33, 9, 'w'); prect(g, 22, 1, 33, 1, 'k');
  prect(g, 21, 9, 34, 10, 'k');                                     // 帽檐
  prect(g, 24, 3, 26, 7, 'r'); ppx(g, 25, 5, 'w');                  // 帽前朱砂符印
  line(g, 20, 9.5, 20, 17, 0.8, 'p'); ppx(g, 20, 13, 'r');          // 垂符纸条
  line(g, 35, 9.5, 35, 17, 0.8, 'p'); ppx(g, 35, 15, 'r');
  // 袍下利爪足
  for (const s of [-1, 1]) {
    const fx = CX + s * 5.5;
    prect(g, Math.round(fx) - 2, 46, Math.round(fx) + 2, 50, 'K');
    for (let f = -1; f <= 1; f++) line(g, fx + f * 1.6, 50, fx + f * 2.1, 53, 0.8, 'k');
  }
  prect(g, 14, 54, 41, 54, 'x'); // 落影(先画,outlinePass 会跳过)
  return toRows(outlinePass(g));
})();

// ===== 点阵图集 =====
export const PIX = {

  // ---------------- 英雄(16×16,2 帧走路,默认朝右;写意剪影 + 笔触感) ----------------

  // 剑客:黑衣斗篷 + 长剑,朱砂腰绦,墨发束顶
  hero_knight_0: [
    '................',
    '......kkkk......',
    '.....kKKKKk..k..',
    '.....kKwwkwk.wk.',
    '.....kKwwwwk.wk.',
    '......kKKk...wk.',
    '...kKKKKKKKk.wk.',
    '..kKKKKKKKKKkwk.',
    '..kKKrrRRrrKkwk.',
    '.kKKKKKKKKKKkoo.',
    '.kKKKKKKKKKKkNk.',
    '.kKKKKKKKKKKkk..',
    '..kKKkKKkKKk....',
    '....kKk.kKk.....',
    '....kk...kk.....',
    '................',
  ],
  hero_knight_1: [
    '................',
    '......kkkk......',
    '.....kKKKKk..k..',
    '.....kKwwkwk.wk.',
    '.....kKwwwwk.wk.',
    '......kKKk...wk.',
    '...kKKKKKKKk.wk.',
    '..kKKKKKKKKKkwk.',
    '..kKKrrRRrrKkwk.',
    '.kKKKKKKKKKKkoo.',
    '.kKKKKKKKKKKkNk.',
    '.kKKKKKKKKKKkk..',
    '..kKKkKKkKKk....',
    '...kKk...kKk....',
    '...kk.....kk....',
    '................',
  ],

  // 道人:青灰道袍 + 白须,拂尘斜指,墨髻玉簪
  hero_mage_0: [
    '.............w..',
    '......kkk...wmw.',
    '.....kKKKk..wmw.',
    '....kKwwkwKkN...',
    '....kKwwwwKkN...',
    '....kwwwwk..N...',
    '...kttwwwttkN...',
    '..kttwwtttttkN..',
    '..ttttttttttkN..',
    '.ttttrrRRrrttk..',
    '.tttttttttttt...',
    '..tttttttttk....',
    '...ttkrrktt.....',
    '....ktk.ktk.....',
    '....kk...kk.....',
    '................',
  ],
  hero_mage_1: [
    '.............w..',
    '......kkk...wmw.',
    '.....kKKKk..wmw.',
    '....kKwwkwKkN...',
    '....kKwwwwKkN...',
    '....kwwwwk..N...',
    '...kttwwwttkN...',
    '..kttwwtttttkN..',
    '..ttttttttttkN..',
    '.ttttrrRRrrttk..',
    '.tttttttttttt...',
    '..tttttttttk....',
    '...ttkrrktt.....',
    '...ktk...ktk....',
    '...kk.....kk....',
    '................',
  ],

  // 游侠:墨竹斗笠 + 短打劲装,背负长弓,朱砂束腰
  hero_ranger_0: [
    '................',
    '......kkkk......',
    '....kkMMMMkk....',
    '..kkMMMMMMMMkk..',
    '.....kKwwkwKk...',
    '...N.kKwwwwKk...',
    '.N.m.kKKKKKKk...',
    'N..m.kKKKKKKk...',
    'N..m.kKrrrKKk...',
    'N..m.kKKKKKKk...',
    '.N.m.kKKKKKKk...',
    '...m.kKKKKKKk...',
    '...N..kKKKKk....',
    '.....kKk.kKk....',
    '.....kk...kk....',
    '................',
  ],
  hero_ranger_1: [
    '................',
    '......kkkk......',
    '....kkMMMMkk....',
    '..kkMMMMMMMMkk..',
    '.....kKwwkwKk...',
    '...N.kKwwwwKk...',
    '.N.m.kKKKKKKk...',
    'N..m.kKKKKKKk...',
    'N..m.kKrrrKKk...',
    'N..m.kKKKKKKk...',
    '.N.m.kKKKKKKk...',
    '...m.kKKKKKKk...',
    '...N..kKKKKk....',
    '....kKk...kKk...',
    '....kk.....kk...',
    '................',
  ],

  // ---------------- 敌人 ----------------

  // 纸妖:皱纸成精,朱砂点睛,下摆撕裂如符纸
  slime: [
    '..............',
    '.....mmmm.....',
    '....mppppm....',
    '..mppPPppppm..',
    '..mpPpppppeM..',
    '..mpprppprpm..',
    '..mpprppprpm..',
    '..mppppppppm..',
    '..mppkkkpppm..',
    '..meppppppem..',
    '...mpmppmpm...',
    '....m..m..m...',
    '.....xxxx.....',
    '..............',
  ],

  // 夜枭:浓墨羽身,金瞳圆睁,展翅无声
  bat: [
    '..............',
    '.k..........k.',
    '.kk........kk.',
    '.kKk..kk..kKk.',
    'kKKKkkkkkkKKKk',
    'kKKKOyKKyOKKKk',
    'kKKKOkKKOkKKKk',
    'kKKKKKooKKKKKk',
    '.kKKMKKKKMKk..',
    '..kKKKKKKKKk..',
    '...kKKKKKKk...',
    '....kKkkKk....',
    '....kk..kk....',
    '..............',
  ],

  // 骨卫:白骨持刀,墨线勾形
  skeleton: [
    '....kkkkkkk.....',
    '....kwwwwwwk....',
    '....kwwwwwwk.k..',
    '....kwkwwkwk.wk.',
    '....kwwwwwwk.wk.',
    '....kkkkkkkk.wk.',
    '.....kwwwwk..wk.',
    '...kwwwwwwwk.wk.',
    '...kwkwkwkwk.wk.',
    '...kwkwkwkwk.wk.',
    '....kkkkkkkkoooo',
    '.....kwwwwk..Nk.',
    '.....kKk.kKk.Nk.',
    '.....kk..kk..kk.',
    '.....xx..xx.....',
    '................',
  ],

  // 墨蛛:小头浓墨腹,八足斜张,朱砂复眼
  spider: [
    '..............',
    '.k..........k.',
    '..k..kkkk..k..',
    '...kkKrrKkk...',
    '.k..kKKKKk..k.',
    '..kkKKKKKKkk..',
    '.k.kKKKKKKk.k.',
    'k..kKMKKMKk..k',
    'k..kKKKKKKk..k',
    '.kkkKKKKKKkkk.',
    '...kKKKKKKk...',
    '..k.kkkkkk.k..',
    '.k..........k.',
    '..............',
  ],

  // 金刚力士:浓墨魁梧,怒目朱砂,腰束赤绦
  brute: [
    '....kkkkkkkkkkkk....',
    '...kKKKKKKKKKKKKk...',
    '...kKmmKKKKKKmmKk...',
    '...kKKrrKKKKrrKKk...',
    '...kKKKKKKKKKKKKk...',
    '...kKKkkkkkkkKKKk...',
    '....kKKKKKKKKKKk....',
    '..kMMKKKKKKKKKKMMk..',
    '.kMMKKKKrrrrKKKKMMk.',
    'kMMKkKKKrrrrKKKkKMMk',
    'kMMk.KKKKrrKKKK.kMMk',
    'kMk..kKKKKKKKKk..kMk',
    '.k...kKKKKKKKKk...k.',
    '.....kKKKkkKKKk.....',
    '.....kKKk..kKKk.....',
    '.....kKKk..kKKk.....',
    '....kMMKk..kMMKk....',
    '....kkkkk..kkkkk....',
    '..xxxxxxxxxxxxxxxx..',
    '....................',
  ],

  // 火药童子:稚童高举赤色爆竹,引信火星头顶炸开
  bomber: [
    '......hh......',
    '......kk......',
    '.....kRRk.....',
    '.....kOOk.....',
    '.....kRRk.....',
    '....kkRRkk....',
    '....kkkkkk....',
    '....kppppk....',
    '....kkppkk....',
    '.....kKKk.....',
    '.....kKKk.....',
    '....kKk.kKk...',
    '....kKk.kKk...',
    '....kk...kk...',
  ],

  // 铁甲龟:玄墨甲壳青铜纹,铁头横出,四足踏地
  turtle: [
    '..................',
    '..................',
    '.....kkkkkk.......',
    '...kkMMMMMMkk.....',
    '..kMmmMMMMMMMk....',
    '.kMMmkkMMkkMMk....',
    '.kMMkkMMkkMMkkttt.',
    '.kMmMkkMMkkMMktkt.',
    '.kMMkkMMkkMMkkttt.',
    '.kMMkkMMkkMMkkttk.',
    '..kMMkkMMkkMMktt..',
    '...kkMMMMMMkkk....',
    '....kkkkkkkkkk....',
    '...kMMk..kMMk.....',
    '...kmmk..kmmk.....',
    '...kkk....kkk.....',
    '...xx......xx.....',
    '..................',
  ],

  // 青灯鬼火:青焰灯笼,纸骨透光,预烘焙青晕
  wisp: [
    '....uu......',
    '...uuuuu....',
    '.bbCcccCbb..',
    'bCccwcwccCb.',
    'bCcwwuwwcCb.',
    'bCccwcwccCb.',
    '.bbCcccCbb..',
    '...uuuuu....',
    '...buuub....',
    '....bAb.....',
    '............',
    '............',
  ],

  // 黑无常:白高帽朱砂符,惨白长舌,浓墨袍
  reaper: [
    '........kkkkkk......',
    '.......kwwwwwwk.....',
    '.......kwrwrrwk.....',
    '.......kwwwwwwk.....',
    '.......kwwwwwwk.....',
    '.....kkkwwwwwwkkk...',
    '...kkwwwwwwwwwwwwkk.',
    '....kwwkwwwwkwwk....',
    '....kwwwwwwwwwwk....',
    '.....kkwwkkwwkk.....',
    '....kKKkkRRkkKKk....',
    '...kKKKKkRRkKKKKk...',
    '...kKKKKkRRkKKKKk...',
    '...kKKKKkrrkKKKKk...',
    '..kKKKKKKkkKKKKKKk..',
    '..kKKKKKKKKKKKKKKk..',
    '..kKKKKKKKKKKKKKKk..',
    '..kKkKKKkKKKkKKKkk..',
    '..kk.kkk.kk.kk......',
    '....xx.xx.xx.xx.....',
  ],

  // ---------------- Boss(程序化绘制,见顶部 BOSS_GOLEM / BOSS_OVERLORD) ----------------

  // 石像守卫 40×40:灰石傀儡,斧凿裂纹,胸口青焰石核
  boss_golem: BOSS_GOLEM,

  // 无常尊者 56×56:黑袍高帽魔头,朱砂点睛
  boss_overlord: BOSS_OVERLORD,

  // ---------------- 武器弹体 / 表现(默认朝右) ----------------

  // 剑气:青焰柳叶,锋刃透光,预烘焙青晕
  w_knife: [
    '..........',
    '......cc..',
    '.....cCCb.',
    '..ccCcCCb.',
    '.cCcwwCCb.',
    '..ccCcCCb.',
    '......cCb.',
    '.......cb.',
    '..........',
    '..........',
  ],

  // 符弹:墨玉弹心 + 符纸飘尾
  w_bolt: [
    '........',
    '....kkk.',
    '...kKKKk',
    '.rpkkCKk',
    '.rpkkKKk',
    '...kKKk.',
    '....kKk.',
    '.....kk.',
  ],

  // 墨竹箭:竹节箭杆,竹叶翎羽,白锋菱镞
  w_arrow: [
    '............',
    'vv......kk..',
    '.vv....kwwk.',
    '..vvvvvkwwkk',
    '..VVVVVkwwkk',
    '.vv....kwwk.',
    'vv......kk..',
    '............',
  ],

  // 墨渊珠:淡墨圆珠,上亮下沉,晕染自然
  w_orb: [
    '...kkkk...',
    '..kmmmmk..',
    '.kmPmmmmk.',
    '.kmPmmMMk.',
    'kmmmmmmMMk',
    'kmmmmmMMKk',
    '.kmmmMMKk.',
    '.kmMMKKk..',
    '..kkkkk...',
    '..........',
  ],

  // 焚天珠:赤红火珠,焰尾拖曳,预烘焙朱砂晕
  w_fireball: [
    '............',
    '....hh......',
    '...hRRh.....',
    '..hRORRh....',
    '..ROOORRk...',
    '.kROOORRk...',
    '.kRROORRk...',
    '..kRRRRk....',
    '..kqRRqk....',
    '...kqqk.....',
    '....qq......',
    '............',
  ],

  // 回风刃:弯月回刃,浓墨刃身,淡墨内锋
  w_boomerang: [
    '....kkkk....',
    '..kMMMMMMk..',
    '.kMMMMMMMMk.',
    'kkMMm.kkkk..',
    'kkMm........',
    'kkM.........',
    'kkM.........',
    'kkMm........',
    'kkMMm.kkkk..',
    '.kMMMMMMMMk.',
    '..kMMMMMMk..',
    '....kkkk....',
  ],

  // 墨滴葫芦:束腰小葫芦,腹纳浓墨,纸光点釉
  w_flask: [
    '...kkk....',
    '...kNk....',
    '...knk....',
    '..kPnnk...',
    '...knNk...',
    '..knnnnk..',
    '.knnKKnnk.',
    '.knKKKnnk.',
    '.knKKKKnk.',
    '..kkkkkk..',
  ],

  // 墨圈:淡墨护环,浓墨勾边
  w_shield: [
    '................',
    '.....kkkkkk.....',
    '...kkMMMMMMkk...',
    '..kkMMkkkkMMkk..',
    '.kkMMk....kMMkk.',
    '.kMMk......kMMk.',
    'kkMMk......kMMkk',
    'kkMk........kMkk',
    'kkMk........kMkk',
    'kkMMk......kMMkk',
    '.kMMk......kMMk.',
    '.kkMMk....kMMkk.',
    '..kkMMkkkkMMkk..',
    '...kkMMMMMMkk...',
    '.....kkkkkk.....',
    '................',
  ],

  // 五雷符:黄纸朱砂符,青焰雷纹纵贯
  lightning_v: [
    '.pppppp.',
    '.pRrrRp.',
    '.pppppp.',
    '.ppCwpp.',
    '.ppCwpp.',
    '.ppCwpp.',
    '.ppCwpp.',
    '.pCwpp..',
    '.pCwpp..',
    '.pCwpp..',
    '.pCwpp..',
    '.ppCwpp.',
    '.ppCwpp.',
    '.ppCwpp.',
    '.ppCwpp.',
    '.pCwpp..',
    '.pCwpp..',
    '.pCwpp..',
    '.pCwpp..',
    '.ppCwpp.',
    '.ppCwpp.',
    '.ppCwpp.',
    '.ppCwpp.',
    '.pCwpp..',
    '.pCwpp..',
    '.pCwpp..',
    '.pCwpp..',
    '.pppppp.',
  ],

  // 墨染光域 48×48(半透明同心墨环,alpha 由绘制方再调)
  zone_holy: ZONE_HOLY,

  // ---------------- 拾取物 ----------------

  // 青焰火种·微(青)
  gem_b: [
    '...cc...',
    '..bCc...',
    '.bcCwc..',
    '.cCwCCb.',
    '.bCCCub.',
    '..uCCu..',
    '...uu...',
    '........',
  ],
  // 青焰火种·小(玉青)
  gem_g: [
    '...vv...',
    '..bVv...',
    '.bvVwv..',
    '.vVwJJb.',
    '.bJJJvb.',
    '..JJJv..',
    '...JJ...',
    '........',
  ],
  // 青焰火种·大(朱砂)
  gem_r: [
    '...RR...',
    '..bRh...',
    '.bhRwO..',
    '.hRwOOb.',
    '.bOOOrb.',
    '..rrrq..',
    '...rq...',
    '........',
  ],
  // 方孔铜钱
  coin: [
    '.kkkkkk.',
    'kOooooOk',
    'kOokkoOk',
    'kookkook',
    'kNokkoNk',
    'kNokkoNk',
    'kNooooNk',
    '.kkkkkk.',
  ],
  // 白面馒头
  meat: [
    '............',
    '...kkkk.....',
    '..kwwwwk....',
    '.kwPPwwwwk..',
    '.kwPwwwwk...',
    '.kwwwwwwek..',
    '.kwwwwwwwk..',
    '.kwwwwwwk...',
    '..kwwwwk....',
    '...kkkkk....',
    '...xxxx.....',
    '............',
  ],
  // 摄魂铃:铜铃朱砂符
  magnet: [
    '.....kk.....',
    '....kOOk....',
    '...kOOOOk...',
    '...kOOOOk...',
    '..kOOOOOOk..',
    '..kOyOOyOk..',
    '..kOOOOOOk..',
    '..kkkkkkkk..',
    '...kOOOOk...',
    '....krrk....',
    '....krrk....',
    '............',
  ],
  // 墨木宝匣:乌木包铜角,金锁衔环
  chest: [
    '................',
    '..kkkkkkkkkkkk..',
    '.kNNNNNNNNNNNNk.',
    '.kNnnnnnnnnnnNk.',
    '.kNnnnnnnnnnnNk.',
    '.kkkkkkkkkkkkkk.',
    '.kNNNNNNNNNNNNk.',
    '.kNnnnOOOOnnnNk.',
    '.kNnnnOOnnnnnNk.',
    '.kNnnnOOnnnnnNk.',
    '.kNnnnnnnnnnnNk.',
    '.kNnnnnnnnnnnNk.',
    '.kkkkkkkkkkkkkk.',
    '.xxxxxxxxxxxxxx.',
    '................',
    '................',
  ],

  // ---------------- 地面图块 / 装饰(宣纸底,几乎无对比,纸纹细腻) ----------------

  tile_grass_0: [
    'pppppppppppppppp',
    'pppPpppppppppppp',
    'pppppppppppppppp',
    'pppppppPpppppppp',
    'pppppppppppepppp',
    'pppppppppppppppp',
    'ppPppppppppppppp',
    'pppppppppppppppp',
    'pppppppppPpppppp',
    'pppppppppppppppp',
    'pppppppppppppppp',
    'ppeppppppppppppp',
    'pppppppppppppPpp',
    'pppppppppppppppp',
    'pppppppppppppppp',
    'pppppppppppppppp',
  ],
  tile_grass_1: [
    'pppppppppppppppp',
    'pppppppppppppppp',
    'ppPppppppppppppp',
    'pppppppppppppppp',
    'ppppppppppppppep',
    'pppppppPpppppppp',
    'pppppppppppppppp',
    'pppppppppppppppp',
    'ppppppppppppPppp',
    'pppppppppppppppp',
    'pepppppppppppppp',
    'pppppppppppppppp',
    'pppppppppppppppp',
    'pppppPpppppppppp',
    'pppppppppppppppp',
    'pppppppppppppppp',
  ],
  tile_grass_2: [
    'pppppppppppppppp',
    'pppppppepppppppp',
    'pppppppppppppppp',
    'pppppppppppppppp',
    'pppppppppppppppp',
    'ppppppppppppPppp',
    'ppPppppppppppppp',
    'pppppppppppppppp',
    'pppppppppppppppp',
    'pppppppppppppppp',
    'pppppppppppppppp',
    'pppppPpppppppppp',
    'pppppppppppepppp',
    'pppppppppppppppp',
    'pppppppppppppppp',
    'pppppppppppppppp',
  ],
  tile_dirt: [
    'EEEEEEEEEEEEEEEE',
    'EEEDEEEEEEEEEEEE',
    'EEEEEEEEEDEEEEEE',
    'EEEEEEEEEEEEEEEE',
    'EEDEEEEEEEEEEEEE',
    'EEEEEEEEEEEEDEEE',
    'EEEEEDEEEEEEEEEE',
    'EEEEEEEEEEEEEEEE',
    'EEEEEEEEEEEEEEEE',
    'EDEEEEEEEDEEEEEE',
    'EEEEEEEEEEEEEEEE',
    'EEEEEEDEEEEEEEEE',
    'EEEEEEEEEEEEEEEE',
    'EEEEEDDEEEEEDEEE',
    'EEEEEEEEEEDEEEEE',
    'EEEEEEEEEEEEEEEE',
  ],

  // 山石:淡墨皴笔,枯润相生
  dec_rock: [
    '................',
    '................',
    '................',
    '................',
    '......MMMM......',
    '.....kMmgmM.....',
    '....kMmgmmgM....',
    '...kMmgmmmgmM...',
    '...kMmmgmmmmM...',
    '..kMmgmmmmgmmM..',
    '..kMmmmmmmgmmM..',
    '.kMmgmmmmmmmgmM.',
    '.MMMMMMMMMMMMMM.',
    '..xx........xx..',
    '................',
    '................',
  ],
  // 梅点:朱砂梅瓣,枯枝横斜
  dec_flower: [
    '................',
    '.............s..',
    '............s...',
    '...........s....',
    '...RR.....s.....',
    '..RORs...s......',
    '...RR.....s.....',
    '..........s.....',
    '.........s......',
    '....s..RRR......',
    '.......ROR......',
    '........RR......',
    '..R.............',
    '................',
    '................',
    '................',
  ],
  // 枯枝:老干如铁,淡墨疏影
  dec_bones: [
    '.......k........',
    '.......s........',
    '....k..s........',
    '....ks.s........',
    '.....kss....k...',
    '......ss...k....',
    '......ss..ks....',
    '.......ssks.....',
    '.......kss......',
    '........ss......',
    '........ss......',
    '.......kss......',
    '......ss.kk.....',
    '................',
    '................',
    '................',
  ],
  // 竹丛:淡墨两竿,竹叶疏斜
  dec_stump: [
    '..v.....v.......',
    '.vv....vvv......',
    '..k.....k.......',
    '..k..v..k.......',
    '..k.....k....v..',
    '..V.....V.......',
    '.vk.....k..vv...',
    '..k.v...k.......',
    '..k.....k..v....',
    '..V.....V.......',
    '.vk.....kv......',
    '..k.....k.......',
    '..k.....k.......',
    '..V.....V.......',
    '.xx.....xx......',
    '................',
  ],

  // ---------------- 被动图标(16×16,表意清晰) ----------------

  // 剑谱:乌木函册,白锋剑纹,朱砂小印
  p_might: [
    '................',
    '................',
    '...kkkkkkkkkk...',
    '..kNNNNNNNNNNk..',
    '..kNwwwwwwwwNk..',
    '..kNwkkkkkkwNk..',
    '..kNwkkwwkkwNk..',
    '..kNwkkwwkkwNk..',
    '..kNwkkkkkkwNk..',
    '..kNwwwwrwwwNk..',
    '..kNPPPPPPPPNk..',
    '..kkkkkkkkkkkk..',
    '..xxxxxxxxxx....',
    '................',
    '................',
    '................',
  ],

  // 沙漏:木框金沙,光阴滴落
  p_cd: [
    '................',
    '..kkkkkkkkkk....',
    '..kwwwwwwwwk....',
    '..kwOOOOOOwk....',
    '...kwkOOOkwk....',
    '....kwkOkwk.....',
    '.....kwkwk......',
    '......kwk.......',
    '......kwk.......',
    '.....kwkwk......',
    '....kwOOOwk.....',
    '...kwkOOOOkwk...',
    '..kwkkkkkkkwk...',
    '..kwwwwwwwwwk...',
    '..kkkkkkkkkkk...',
    '................',
  ],

  // 草鞋:麻绳编底,履步生风
  p_speed: [
    '................',
    '................',
    '................',
    '....kOk.kOk.....',
    '.....kOkkOk.....',
    '.....kkOOkk.....',
    '..kkkkkkkkkk....',
    '..kononononk....',
    '..kOnOnOnOnk....',
    '..kononononk....',
    '..kkkkkkkkkk....',
    '...xxxxxxxx.....',
    '................',
    '................',
    '................',
    '................',
  ],

  // 气血丹:朱砂药丹,金光温润
  p_hp: [
    '................',
    '................',
    '................',
    '.....hhhh.......',
    '....hRRRRh......',
    '...hRROORRh.....',
    '...hROwOORh.....',
    '...hROOORRh.....',
    '....hRRRRh......',
    '.....hhhh.......',
    '.....xxxx.......',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],

  // 摄魂铃:铜铃摇动,朱砂符咒
  p_magnet: [
    '................',
    '................',
    '.....kkk........',
    '....kkOkk.......',
    '....kOOOk.......',
    '...kOOOOOk......',
    '..kOOOOOOOk.....',
    '..kOyOOOyOk.....',
    '..kOOOOOOOk.....',
    '..kkkkkkkkk.....',
    '...kOOOOOk......',
    '....krrrk.......',
    '....krrrk.......',
    '.....xxx........',
    '................',
    '................',
  ],

  // 书卷:展卷诵读,墨字斑驳
  p_xp: [
    '................',
    '................',
    '..kN........Nk..',
    '..kNppppppppNk..',
    '..kNpPPpPPppNk..',
    '..kNppppppppNk..',
    '..kNpPPpPPppNk..',
    '..kNppppppppNk..',
    '..kNpPPpPpppNk..',
    '..kNppppppppNk..',
    '..kN........Nk..',
    '..kkk......kkk..',
    '...xxxxxxxx.....',
    '................',
    '................',
    '................',
  ],

  // 钱袋:束口布囊,铜钱溢光
  p_gold: [
    '................',
    '................',
    '......kk........',
    '.....kNNk.......',
    '....kNnnNk......',
    '...kNnnnnNk.....',
    '..kNnnnnnnNk....',
    '..kNnnOOnnNk....',
    '..kNnnOOOnNk....',
    '..kNnnnOOnNk....',
    '..kNnnnnnnNk....',
    '...kNnnnnNk.....',
    '....kkkkkk......',
    '.....xxxx.......',
    '................',
    '................',
  ],

  // 铁布衫:墨色短褂,铜扣护心
  p_armor: [
    '................',
    '.kkkk....kkkk...',
    '.kMMkkkkkkkkMMk.',
    '.kMMkKKKKKKkMMk.',
    '.kMMkKMMMMKkMMk.',
    '.kMMkKMOOMKkMMk.',
    '.kMMkKMOOMKkMMk.',
    '.kMMkKKKKKKkMMk.',
    '.kMMkKKKKKKkMMk.',
    '.kMkkKKKKKKkkMk.',
    '.kkkkkkkkkkkkkk.',
    '...xxxxx.xxxx...',
    '................',
    '................',
    '................',
    '................',
  ],

  // 天眼:竖目观世,朱砂瞳仁,慧光四射
  p_crit: [
    '................',
    '.......k........',
    '....k..k..k.....',
    '.....kkkkk......',
    '...kkwwwwwkk....',
    '..kwwwwwwwwk....',
    '.kwwwrrrrwwwwk..',
    '.kwwwrkkrrwwwk..',
    '..kwwwrrwwwk....',
    '...kkwwwwkk.....',
    '.....kkkkk......',
    '....k..k..k.....',
    '.......k........',
    '................',
    '................',
    '................',
  ],

  // ---------------- 进化超武(明显更华丽,青焰/朱砂/金辉点睛) ----------------

  // 万剑归宗:中锋悬剑,四方剑气环绕
  w_knife_evo: [
    '.......kwk......',
    '.......kwk......',
    '..c....kwk....c.',
    '..Cc...kwk...Cc.',
    '...Cc..kwk..Cc..',
    '....Cc.kwk.Cc...',
    '.....CckwkCC....',
    '.....ooOoooo....',
    '......kNk.......',
    '......kNk.......',
    '......kkk.......',
    '..C..........C..',
    '...Cc......Cc...',
    '....Cc....Cc....',
    '.....Cc..Cc.....',
    '......CCCC......',
  ],

  // 风卷残云:浓墨双环漩涡,错位开口,青焰风梢
  w_wand_evo: [
    '.......kk.......',
    '....kkkkkkkk....',
    '..kkkkkkkkkkk...',
    '..kkk......c....',
    '.kkkk...........',
    '.kk..MMMMMM.....',
    '.kk.MM....MM....',
    'kkk.MM....MM....',
    'kkk.MM....MM....',
    'kkk.MM....MM.kkk',
    '.kk.....CMM..kk.',
    '.kkk....MM.kkk..',
    '..kk........kk..',
    '..kkkkkkkkkkkk..',
    '....kkkkkkkk....',
    '.......kk.......',
  ],

  // 贯日长虹:赤金巨箭,曜日锋芒
  w_bow_evo: [
    '..................',
    '............hkkkk.',
    '.OO.......kkRRRRk.',
    'kOOrRrrrrrRROOwRk.',
    'kOOrRrrrrrRROOwRk.',
    '.OO.......kkRRRRk.',
    '............hkkkk.',
    '..................',
  ],

  // 周天星斗:墨珠居中,四星周天巡转
  w_orb_evo: [
    '................',
    '.......MM.......',
    '......MPPM......',
    '.......MM.......',
    '..MM........MM..',
    '..MMkmmmmmmkMM..',
    '....kmPmmmmk....',
    '....kmPmmMMk....',
    '....kmmmmMKk....',
    '.....kkkkkk.....',
    '..MM........MM..',
    '.......MM.......',
    '......MKKM......',
    '.......MM.......',
    '................',
    '................',
  ],

  // 九天神雷:双雷符并悬,金焰缠符
  w_lightning_evo: [
    '..pppppppp..',
    '..pRrrrrRp..',
    '..pppppppp..',
    '..ppCwpCup..',
    '..ppcwpcup..',
    '..ppCwpCup..',
    '..ppcwpcup..',
    '..ppCwpCup..',
    '..ppCwpCup..',
    '..pCwppCup..',
    '..pcwppcup..',
    '..pCwppCup..',
    '..pcwppcup..',
    '..pCwppCup..',
    '..pCwppCup..',
    '..ppCwpCup..',
    '..ppcwpcup..',
    '..ppCwpCup..',
    '..ppcwpcup..',
    '..pCwppCup..',
    '..pcwppcup..',
    '..pCwppCup..',
    '..pCwppCup..',
    '..pCwppCup..',
    '..pCwppCup..',
    '..pCwppCup..',
    '..pCwppCup..',
    '..pCwppCup..',
    '..pCwppCup..',
    '..pCwppCup..',
    '..pppppppp..',
    '....orOo....',
  ],

  // 焚天煮海:赤焰腾空,朱砂晕染
  w_fireball_evo: [
    '......hh........',
    '.....hRRh.......',
    '....hROORh......',
    '...hROOOORh.....',
    '..hROOwOORh.....',
    '..kROwwOORk.....',
    '.kRROOOOORRk....',
    '.kRROOOOORRk....',
    '.kqRROOORRqk....',
    '..kqqRRRRqqk....',
    '...kqqqqqqk.....',
    '....kkqqqkk.....',
    '......kqk.......',
    '.......k........',
    '................',
    '................',
  ],

  // 金刃轮回:金缘弯月巨刃,金晕流转
  w_boomerang_evo: [
    '.......jj.......',
    '...jOOOOOOOOj...',
    '..jOOOOOOOOOOj..',
    '.jOOkkkkkkkkOOj.',
    '.jOOkkkk........',
    '.jOOkkm.........',
    '.jOOk...........',
    '.jOOk...........',
    '.jOOkm..........',
    '.jOOkkkk........',
    '.jOOkkkkkkkkOOj.',
    '..jOOOOOOOOOOj..',
    '...jOOOOOOOOj...',
    '.......jj.......',
    '................',
    '................',
  ],

  // 墨染乾坤:浓墨双环,如砚池漩涡(图标用)
  w_holy_evo: W_HOLY_EVO,

  // 雷动金钟:金钟镇魂,钟缘青雷
  w_shield_evo: [
    '.......kk.......',
    '......kOOk......',
    '......kOOk......',
    '.....kOOOOk.....',
    '....kOOOOOOk....',
    '....kOyOOyOk....',
    '...kOOOOOOOOk...',
    '...kOOOOOOOOk...',
    '..kOOOOOOOOOOk..',
    '..kOyOOOOOyOk...',
    '..kkkkkkkkkkkk..',
    '..kkkOcOcOkkkk..',
    '..kkOcOcOcOkkk..',
    '....kkkkkkkk....',
    '......krrk......',
    '.......xx.......',
  ],

  // ---------------- 英雄头像(16×16,选人卡) ----------------

  // 剑客:束发朱额带,剑眉冷目
  hero_face_knight: [
    '................',
    '.....kkkkk......',
    '....kKKKKKk.....',
    '...kKKKKKKKk....',
    '...krrrrrrrk....',
    '...kwwwwwwwk....',
    '...kwkwwwkwk....',
    '...kwwwwwwwk....',
    '...kwwkkwwk.....',
    '....kwwwwk......',
    '.....kkkk.......',
    '...kKKKKKKKk....',
    '..kKKKKKKKKKk...',
    '.kKKKKKKKKKKKk..',
    '.kKKKKKKKKKKKk..',
    '.kkkkkkkkkkkkk..',
  ],
  // 道人:墨髻白须,慈眉仙风
  hero_face_mage: [
    '................',
    '.......kk.......',
    '......kKKk......',
    '.....kKKKKk.....',
    '.....kKKKKk.....',
    '....kwwwwwwk....',
    '....kwkwwkwk....',
    '....kwwwwwwk....',
    '.....kwwwwk.....',
    '.....kwwwwk.....',
    '......kwwk......',
    '......kwwk......',
    '.....kttttk.....',
    '....kttttttk....',
    '...kttttttttk...',
    '...kkkkkkkkkk...',
  ],
  // 游侠:墨竹斗笠遮眉,目光炯炯
  hero_face_ranger: [
    '................',
    '.....kkkkk......',
    '...kkMMMMMkk....',
    '.kkMMMMMMMMMkk..',
    'kkMMMMMMMMMMMkk.',
    '...kwwwwwwwk....',
    '...kwkwwwkwk....',
    '...kwwwwwwwk....',
    '....kwwwwk......',
    '.....kkkk.......',
    '....kKKKKKk.....',
    '...kKKKKKKKk....',
    '..kKKKKKKKKKk...',
    '.kKKKKKKKKKKKk..',
    '.kKKKKKKKKKKKk..',
    '.kkkkkkkkkkkkk..',
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
