// ===== 🎨 高像素美术模块(Boss 精绘) =====
// 石像守卫 boss_golem 120×120:灰石傀儡 · 双拳巨臂 · 斧凿裂纹 · 苔点 · 胸口青焰石核(预烘焙晕 f/A/b/a)
// 无常尊者 boss_overlord 168×168:黑袍魔头 · 白纸高帽+朱砂符印 · 惨白脸朱砂瞳 · 腰间朱砂绦带 · 撕裂下摆 · 袍下利爪
// 程序化生成器 IIFE(brush.js 画笔):分部位体块建模 + 左上光源多阶明暗;导出仍为静态字符串数组。
// 尺寸/包围盒/落影行与占位版(旧图×3)一致,锚点=画布中心。
import { grid, ppx, prect, pell, line, outlinePass, toRows } from './brush.js';

export const PIX_BOSSES = (() => {
  // ---- 确定性随机(mulberry32,保证每次构建点阵一致) ----
  const rng = seed => {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---- 遮罩色域(只允许覆盖这些既有色) ----
  const STONE = new Set(['6', 'g', 'm', 'M', 'K', 'd']);
  const ROBE = new Set(['k', 'K', 'B']);

  // ---- 通用笔触 ----
  // 椭圆填色;ok 给定时仅覆盖允许色(用于受光/背光月牙与苔点)
  function blob(g, cx, cy, rx, ry, c, ok) {
    if (rx < 0.5) rx = 0.5;
    if (ry < 0.5) ry = 0.5;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      if (!g[y]) continue;
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy > 1.02) continue;
        if (ok && !ok.has(g[y][x])) continue;
        ppx(g, x, y, c);
      }
    }
  }
  // 五阶石球(光源左上):T = [受光, 亮, 中间, 背光, 最暗]
  function stoneBall(g, cx, cy, rx, ry, T = ['6', 'g', 'm', 'M', 'K']) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy > 1.04) continue;
        const L = -0.6 * dx - 0.8 * dy; // 与光向(-0.6,-0.8)点积
        ppx(g, x, y, L > 0.52 ? T[0] : L > 0.12 ? T[1] : L > -0.22 ? T[2] : L > -0.58 ? T[3] : T[4]);
      }
  }
  // 四阶竖柱(圆端,左亮右暗):T = [亮, 中间, 背光, 最暗]
  function pillar(g, cx, y0, y1, r, T = ['g', 'm', 'M', 'K']) {
    for (let y = y0; y <= y1; y++) {
      const yt = y0 + r, yb = y1 - r;
      let hw = r;
      if (y < yt) hw = Math.sqrt(Math.max(0, r * r - (yt - y) * (yt - y)));
      else if (y > yb) hw = Math.sqrt(Math.max(0, r * r - (y - yb) * (y - yb)));
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const u = hw < 0.5 ? 0.5 : (x - (cx - hw)) / (2 * hw);
        ppx(g, x, y, u < 0.3 ? T[0] : u < 0.6 ? T[1] : u < 0.85 ? T[2] : T[3]);
      }
    }
  }
  // 1px 折线(裂纹/衣褶)
  const crack = (g, pts, c = 'k') => {
    for (let i = 0; i < pts.length - 1; i++)
      line(g, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 0.5, c);
  };
  // 干笔飞白:区域内随机单点枯斑
  function fleck(g, x0, y0, x1, y1, n, tones, ok, rand) {
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + rand() * (x1 - x0)), y = Math.round(y0 + rand() * (y1 - y0));
      if (!g[y] || !ok.has(g[y][x])) continue;
      ppx(g, x, y, tones[(rand() * tones.length) | 0]);
    }
  }
  // 斧凿痕:一组短平行斜线
  function chisel(g, x, y, n, len, c, rand) {
    for (let i = 0; i < n; i++) {
      const jx = x + i * 3.2 + rand() * 1.6, jy = y + i * 2.4 + rand() * 1.6;
      line(g, jx, jy, jx + len, jy - len * 0.8, 0.5, c);
    }
  }
  // 苔点簇:小椭圆 v/V + 受光 4 芽点
  function moss(g, cx, cy, rand) {
    const n = 5 + (rand() * 3 | 0);
    for (let i = 0; i < n; i++) {
      const mx = cx + (rand() - 0.5) * 17, my = cy + (rand() - 0.5) * 10;
      blob(g, mx, my, 1.3 + rand() * 1.6, 1 + rand() * 1.1, rand() < 0.6 ? 'v' : 'V', STONE);
      if (rand() < 0.55) ppx(g, Math.round(mx - 1), Math.round(my - 1), '4');
      if (rand() < 0.3) blob(g, mx + 1, my + 1.5, 1, 0.7, 'V', STONE);
    }
  }

  // ==================== boss_golem 石像守卫 120×120 ====================
  const golem = (() => {
    const g = grid(120), rand = rng(20260902);
    // 落影(先画;outlinePass 自动跳过半透明)
    pell(g, 60, 115, 38, 1.6, 'x');
    pell(g, 20, 114.5, 15, 1, 'x'); pell(g, 100, 114.5, 15, 1, 'x');

    // —— 双腿(先画,上端被躯干压住) ——
    pillar(g, 45, 88, 112, 11);
    pillar(g, 75, 88, 112, 11);
    pell(g, 44, 107, 12, 6, 'm'); pell(g, 41, 104.5, 8, 3.5, 'g'); pell(g, 48, 110, 9, 3, 'M'); // 足外扩
    pell(g, 76, 107, 12, 6, 'm'); pell(g, 73, 104.5, 8, 3.5, 'g'); pell(g, 80, 110, 9, 3, 'M');

    // —— 躯干石甲(微收腰,左上受光) ——
    for (let y = 38; y <= 94; y++) {
      const t = y < 58 ? 0 : y < 86 ? (y - 58) * 0.16 : 4.5 - (y - 86) * 0.35;
      const xl = Math.round(36 + t), xr = Math.round(84 - t);
      for (let x = xl; x <= xr; x++) {
        const u = (x - xl) / (xr - xl);
        ppx(g, x, y, u < 0.2 ? 'g' : u < 0.55 ? 'm' : u < 0.84 ? 'M' : 'K');
      }
      if (y < 41) for (let x = xl; x <= xr; x++) ppx(g, x, y, 'g'); // 顶面受光
    }
    blob(g, 50, 48, 9, 6, 'g', STONE); blob(g, 70, 48, 8, 5.5, 'g', STONE); // 胸肌隆起
    blob(g, 47, 45, 7, 4, '6', STONE); blob(g, 73, 46, 5.5, 3.5, 'g', STONE); // 凿面受光片
    crack(g, [[60, 42], [60, 50], [59, 57]]);                               // 胸中缝
    crack(g, [[45, 64], [60, 64.5], [75, 64]]);                             // 腹甲横缝
    crack(g, [[46, 78], [60, 78.5], [74, 78]]);
    crack(g, [[52, 68], [56, 68.5], [60, 68]]);                             // 凿槽短线

    // —— 胸口青焰石核:石槽 → 预烘焙晕(f/A/b/a)→ 实焰(5/u/C/c/T/w) ——
    pell(g, 60, 76, 15, 13, 'K'); pell(g, 60, 76, 13, 11, 'k');             // 凿出的石槽
    pell(g, 60, 76, 20, 17, 'f'); pell(g, 60, 76, 17, 14.5, 'A');
    pell(g, 60, 76, 15, 12.5, 'b'); pell(g, 60, 76, 12.5, 10.5, 'a');
    pell(g, 60, 77, 9, 7.5, '5'); pell(g, 60, 77, 7.8, 6.4, 'u');
    pell(g, 60, 77.5, 6.4, 5.2, 'C'); pell(g, 60, 78, 5, 4, 'c');
    pell(g, 60, 78.5, 3.4, 2.6, 'T'); pell(g, 59, 78, 2.2, 1.6, 'w');       // 焰心
    line(g, 60, 71, 56, 65, 1.4, 'c'); line(g, 60, 71, 63.5, 66, 1, 'C');   // 焰舌
    line(g, 60, 70, 60, 63.5, 0.8, 'a');                                    // 中焰
    ppx(g, 52, 62, 'c'); ppx(g, 68, 60, 'C'); ppx(g, 60, 59, 'a');          // 青焰火星

    // —— 双肩巨岩 ——
    stoneBall(g, 25, 44, 15, 12);
    stoneBall(g, 95, 44, 15, 12);
    crack(g, [[16, 36], [20, 42]]); crack(g, [[104, 36], [100, 42]], 'M');  // 肩上凿裂

    // —— 巨臂(垂柱) ——
    pillar(g, 21, 46, 86, 13);
    pillar(g, 99, 46, 86, 13);
    prect(g, 33, 54, 34, 82, 'k'); prect(g, 85, 54, 86, 82, 'k');           // 臂/躯干凿缝

    // —— 双拳(锤岩) ——
    stoneBall(g, 20, 98, 17, 14);
    stoneBall(g, 100, 98, 17, 14);
    // 指节棱(整条受光棱 + 亮斑,而非圆泡)
    blob(g, 20, 87, 13, 2.6, 'g', STONE); blob(g, 20, 89.5, 12, 1.6, 'm', STONE);
    pell(g, 12, 85.5, 3, 2, 'g'); pell(g, 28, 85.5, 3, 2, 'g');
    crack(g, [[19, 86], [19, 94]]);
    crack(g, [[12, 91], [11, 104]]); crack(g, [[20, 94], [20, 107]]); crack(g, [[27, 91], [28, 104]]);
    blob(g, 33, 100, 5, 6, 'm', STONE); blob(g, 32, 96.5, 4, 2.5, 'g', STONE); crack(g, [[31, 95], [33, 103]]); // 拇指
    blob(g, 100, 87, 13, 2.6, 'g', STONE); blob(g, 100, 89.5, 12, 1.6, 'm', STONE);
    pell(g, 92, 85.5, 3, 2, 'g'); pell(g, 108, 85.5, 3, 2, 'g');
    crack(g, [[99, 90], [99, 106]]); crack(g, [[107, 90], [107, 106]]); crack(g, [[114, 91], [115, 104]]);
    blob(g, 87, 100, 5, 6, 'm', STONE); blob(g, 88, 96.5, 4, 2.5, 'g', STONE); crack(g, [[89, 95], [87, 103]]);

    // —— 头颅(穹顶+下颚) ——
    stoneBall(g, 60, 21, 26, 15);
    pell(g, 60, 29, 23, 8, 'm');
    blob(g, 52, 27, 14, 5, 'g', STONE); blob(g, 70, 32, 14, 4, 'M', STONE); blob(g, 60, 36.5, 13, 2.5, 'K', STONE);
    // 额眉横脊 + 深目(怒目蹙眉)
    prect(g, 40, 20, 80, 22, 'k'); prect(g, 41, 19, 79, 19, 'M'); prect(g, 56, 20, 64, 22, 'm');
    prect(g, 42, 23, 78, 24, 'K');
    crack(g, [[52, 23], [57, 26]]); crack(g, [[68, 23], [63, 26]]);         // 眉间怒纹
    for (const ex of [47, 73]) {                                            // 青焰双目
      blob(g, ex, 27, 4.6, 3.2, 'a');
      blob(g, ex, 27, 4.2, 3.2, 'k');
      blob(g, ex, 27.5, 3, 2.1, 'c');
      ppx(g, ex - 1, 26, 'T'); ppx(g, ex, 26, 'T'); ppx(g, ex - 1, 27, 'c');
    }
    line(g, 54, 32.5, 66, 32.5, 0.7, 'k'); ppx(g, 53, 33, 'k'); ppx(g, 67, 33, 'k'); // 凿口短线
    // 额角崩口(右上缺角)+ 颈侧凿缝
    for (let x = 72; x <= 84; x++) {
      const yCut = Math.round(8 + (x - 72) * 0.55);
      for (let y = 0; y <= yCut; y++) if (STONE.has(g[y] && g[y][x])) ppx(g, x, y, '.');
    }
    crack(g, [[78, 11], [75, 17]]);
    crack(g, [[38, 33], [44, 37]]); crack(g, [[82, 33], [76, 37]]);
    crack(g, [[46, 30], [43, 35]]);                                         // 颊部裂纹

    // —— 斧凿裂纹 / 凿痕 / 飞白 / 苔点 ——
    crack(g, [[50, 9], [53, 14], [51, 19]]); crack(g, [[53, 14], [57, 16]]);
    crack(g, [[43, 46], [39, 56], [42, 66]]);
    crack(g, [[78, 50], [82, 60]], 'M');
    crack(g, [[15, 62], [13, 72]]); crack(g, [[105, 60], [107, 70]]);
    crack(g, [[10, 96], [14, 104], [12, 109]]); crack(g, [[100, 94], [96, 102], [99, 108]]);
    crack(g, [[42, 98], [40, 106]]); crack(g, [[78, 100], [80, 108]]);
    crack(g, [[40, 52], [37, 60], [40, 68]]);                               // 左臂纵裂
    chisel(g, 46, 54, 3, 5, 'd', rand); chisel(g, 66, 58, 3, 5, 'd', rand);
    chisel(g, 13, 66, 2, 4, 'd', rand); chisel(g, 95, 66, 2, 4, 'd', rand);
    chisel(g, 41, 99, 2, 4, 'd', rand); chisel(g, 68, 100, 2, 4, 'd', rand);
    chisel(g, 41, 29, 2, 3.5, 'd', rand); chisel(g, 55, 90, 2, 4, 'd', rand);
    fleck(g, 38, 42, 82, 92, 60, ['d', 'g', 'd'], STONE, rand);              // 石面干笔飞白
    fleck(g, 10, 50, 32, 80, 18, ['d', 'g'], STONE, rand);
    fleck(g, 88, 50, 110, 80, 18, ['d', 'g'], STONE, rand);
    fleck(g, 6, 88, 34, 110, 16, ['d', 'g'], STONE, rand);
    fleck(g, 86, 88, 114, 110, 16, ['d', 'g'], STONE, rand);
    fleck(g, 38, 8, 82, 34, 12, ['d', 'g'], STONE, rand);
    fleck(g, 38, 96, 82, 110, 12, ['d', 'g'], STONE, rand);
    for (let i = 0; i < 7; i++) {                                            // 横向枯笔
      const x = 42 + rand() * 30, y = 60 + rand() * 26;
      if (STONE.has(g[Math.round(y)]?.[Math.round(x)])) line(g, x, y, x + 4 + rand() * 4, y, 0.5, 'd');
    }
    moss(g, 27, 46, rand);                                                   // 苔点(臂/肩/拳/腿)
    moss(g, 18, 36, rand);
    moss(g, 86, 100, rand);
    moss(g, 89, 90, rand);
    moss(g, 42, 99, rand);
    moss(g, 104, 50, rand);
    moss(g, 14, 103, rand);
    // 轮廓崩口小凿
    ppx(g, 8, 67, '.'); ppx(g, 117, 97, '.'); ppx(g, 30, 108, '.');

    return toRows(outlinePass(g));
  })();

  // ==================== boss_overlord 无常尊者 168×168 ====================
  const overlord = (() => {
    const g = grid(168), rand = rng(1680051);
    const CX = 84;
    // 落影(先画)
    pell(g, CX, 163, 42, 1.6, 'x');
    pell(g, 64, 163.5, 13, 1, 'x'); pell(g, 104, 163.5, 13, 1, 'x');

    // —— 袍下利爪:细腿 + 三趾(先画,被袍摆半掩) ——
    for (const [lx, rx] of [[57, 75], [93, 111]]) {
      for (let x = lx; x <= rx; x++)
        for (let y = 140; y <= 156; y++) ppx(g, x, y, x === lx || x === rx ? 'k' : 'K');
      ppx(g, lx + 4, 147, 'B'); ppx(g, lx + 5, 147, 'B');                   // 膝头微光
    }
    blob(g, 66, 154, 11, 4.5, 'K'); blob(g, 102, 154, 11, 4.5, 'K');        // 足背
    // 三趾利爪
    const claw = (x0, y0, x1, y1) => { line(g, x0, y0, x1, y1, 1, 'k'); ppx(g, Math.round(x1), Math.round(y1), 'I'); };
    claw(60, 153, 55, 159); claw(66, 155, 65, 160); claw(72, 153, 76, 158);
    claw(96, 153, 91, 159); claw(102, 155, 102, 160); claw(108, 153, 112, 158);

    // —— 裙摆(大氅外扩,褶 #B/缝 #k,撕裂下摆) ——
    const hem = [];
    for (let x = 8; x <= 160; x++) {                                        // 撕裂摆缘:破布齿
      const legWin = (x >= 56 && x <= 77) || (x >= 92 && x <= 113);
      hem[x] = legWin ? 139 + (rand() * 3 | 0) : 143 + (rand() * 8 | 0);
    }
    const folds = [[60, -0.26], [74, -0.12], [96, 0.12], [110, 0.26]];
    for (let y = 96; y <= 150; y++) {
      const t = Math.min(1, (y - 96) / 54);
      const half = 33 + 41 * Math.pow(t, 0.8);
      const xl = Math.round(CX - half), xr = Math.round(CX + half);
      for (let x = xl; x <= xr; x++) {
        if (y > hem[x]) continue;                                           // 撕裂缺口
        let c = 'K';
        if (x < xl + 3) c = 'B';                                            // 左缘受光
        else if (x > xr - 3) c = 'k';                                       // 右缘背光
        for (const [fc, fs] of folds) {
          const d = Math.abs(x - (fc + fs * (y - 96)));
          if (d <= 2) { c = 'B'; break; }
          if (d <= 3.4) { c = 'k'; break; }
        }
        ppx(g, x, y, c);
      }
    }
    // 摆上垂褶走向 + 袍下探出的爪尖
    crack(g, [[66, 102], [52, 128], [46, 144]]); crack(g, [[102, 102], [116, 130], [122, 146]]);
    crack(g, [[30, 108], [22, 134]]); crack(g, [[138, 108], [146, 134]]);
    crack(g, [[84, 118], [83, 136]]);
    line(g, 66, 141, 64, 146, 0.8, 'k'); ppx(g, 64, 146, 'I'); ppx(g, 65, 145, 'I');
    line(g, 102, 141, 104, 145, 0.8, 'k'); ppx(g, 104, 145, 'I'); ppx(g, 103, 144, 'I');

    // —— 躯干(收腰) ——
    prect(g, 51, 56, 117, 96, 'K');
    for (const [fc] of folds) {                                             // 躯干竖褶延续
      for (let y = 60; y <= 96; y++) {
        ppx(g, fc - 1, y, 'B'); ppx(g, fc, y, 'B'); ppx(g, fc + 1, y, 'B');
        ppx(g, fc - 3, y, 'k'); ppx(g, fc + 3, y, 'k');
      }
    }
    prect(g, 51, 56, 52, 96, 'B');                                          // 胸左受光棱
    blob(g, 66, 62, 15, 7, 'B', ROBE);                                      // 胸口受光面
    prect(g, 116, 56, 117, 96, 'k');                                        // 右侧背光棱

    // —— 肩部体块 ——
    blob(g, CX, 54, 51, 8, 'K');
    blob(g, CX, 52.6, 49.5, 6.8, 'B', ROBE);                                // 顶棱受光
    line(g, 42, 58, 56, 62, 1, 'k'); line(g, 126, 58, 112, 62, 1, 'k');     // 肩 cap 凿缝
    crack(g, [[64, 50], [70, 53]]); crack(g, [[104, 50], [98, 53]]);

    // —— 垂袖(左受光/右背光,袖口撕裂) ——
    const cutL = [], cutR = [];
    for (let x = 18; x <= 44; x++) cutL[x] = 112 + ((rand() * 12) | 0);
    for (let x = 124; x <= 150; x++) cutR[x] = 112 + ((rand() * 12) | 0);
    for (let y = 54; y <= 126; y++) {
      const xl = Math.round(30 - (y - 54) * 0.12);
      for (let x = xl; x <= xl + 19; x++) {
        if (y > cutL[x]) continue;                                          // 袖口撕裂
        let c = 'k';
        if (x <= xl + 1) c = 'B';
        else if (x >= xl + 18) c = 'K';
        ppx(g, x, y, c);
      }
      const xr = Math.round(138 + (y - 54) * 0.12);
      for (let x = xr - 19; x <= xr; x++) {
        if (y > cutR[x]) continue;
        let c = 'k';
        if (x <= xr - 18) c = 'K';
        else if (y <= 57) c = 'K';                                          // 顶棱微光
        ppx(g, x, y, c);
      }
    }

    // —— 兜帽 + 惨白脸 ——
    prect(g, 58, 30, 110, 60, 'k');
    for (let i = 0; i < 4; i++) {                                           // 帽底圆角
      for (let y = 57 + i; y <= 60; y++) { ppx(g, 58 + i, y, '.'); ppx(g, 110 - i, y, '.'); }
    }
    blob(g, 84, 45, 19, 11, '.');                                           // 脸洞(留 1px 墨圈自动描边)
    blob(g, 84, 45, 17.5, 9.8, 'W');                                        // 惨白
    blob(g, 85.5, 47, 15, 7.6, 'w', new Set(['W']));
    blob(g, 86, 50.5, 12, 5, 'G', new Set(['W', 'w']));                     // 颌底青灰
    prect(g, 66, 35, 102, 36, 'I');                                         // 檐下浓影压眉
    line(g, 68, 40, 76, 40, 0.7, 'K'); line(g, 92, 40, 100, 40, 0.7, 'K');  // 眉影
    for (const ex of [72, 96]) {                                            // 朱砂点睛
      blob(g, ex, 43.5, 3.6, 2.6, 'h');                                     // 朱砂晕(预烘焙,仅 1px 环)
      blob(g, ex, 43.5, 2.8, 2, 'r');
      blob(g, ex - 0.4, 43, 1.8, 1.4, 'R');
      line(g, ex - 3, 41, ex + 3, 41, 0.6, 'k');                            // 上睑
      ppx(g, ex - 1, 42, 'X'); ppx(g, ex, 42, 'X');
    }
    ppx(g, 84, 46, 'G'); ppx(g, 85, 46, 'G'); ppx(g, 84, 47, 'G'); ppx(g, 83, 47, 'w'); // 鼻影
    ppx(g, 70, 47, 'G'); ppx(g, 71, 48, 'G'); ppx(g, 98, 47, 'G'); ppx(g, 97, 48, 'G'); // 颊陷
    line(g, 80, 50, 88, 50, 0.5, 'k'); ppx(g, 84, 51, 'G');                 // 抿口

    // —— 高帽:乌纱塔顶 + 白纸帽面 + 朱砂符印 ——
    prect(g, 61, 0, 107, 6, 'k');                                           // 塔顶乌纱
    prect(g, 61, 3, 107, 28, 'k');
    prect(g, 61, 3, 63, 28, 'K');                                           // 左棱微光
    prect(g, 57, 27, 111, 33, 'k');                                         // 帽檐
    prect(g, 57, 27, 111, 28, 'K');
    prect(g, 57, 32, 111, 33, 'I');                                         // 檐下浓影
    prect(g, 67, 7, 101, 25, 'W');                                          // 白纸帽面(黑缘加宽)
    blob(g, 94, 20, 12, 9, 'w', new Set(['W']));
    prect(g, 67, 23, 101, 25, 'G');                                         // 纸面折影
    // 朱砂敕符(竖笔+横批,偏左依旧图)
    line(g, 78.5, 11, 78.5, 22, 1.2, 'r');
    line(g, 74, 13, 83, 13, 1, 'r');
    line(g, 75, 16.5, 82, 16.5, 1, 'r');
    line(g, 75.5, 19.5, 81, 19.5, 1, 'r');
    ppx(g, 77, 12, 'X'); ppx(g, 75, 13, 'X'); ppx(g, 76, 16, 'X'); ppx(g, 77, 19, 'X');
    ppx(g, 80, 21, 'Y'); ppx(g, 81, 20, 'Y');

    // —— 垂符纸条(随袍摆,左右错位,朱砂印) ——
    const strip = (x0, y0, y1, sway) => {
      for (let y = y0; y <= y1; y++) {
        const off = Math.round(((y - y0) / (y1 - y0)) * sway);
        ppx(g, x0 + off, y, 'W');
        for (let x = x0 + 1 + off; x <= x0 + 3 + off; x++) ppx(g, x, y, 'p');
        ppx(g, x0 + 4 + off, y, 'G');
      }
    };
    strip(57, 33, 60, -3);                                                  // 左长符
    ppx(g, 58, 42, 'r'); ppx(g, 59, 42, 'r'); ppx(g, 58, 43, 'r'); ppx(g, 59, 43, 'X');
    strip(106, 33, 52, 3);                                                  // 右短符
    ppx(g, 107, 44, 'r'); ppx(g, 108, 44, 'r'); ppx(g, 108, 45, 'X');

    // —— 纸白领(窄 V,收进颌下) ——
    line(g, 79, 57, 84, 62, 2, 'w'); line(g, 89, 57, 84, 62, 2, 'w');
    line(g, 80, 57.5, 84, 61, 0.8, 'W'); line(g, 88, 57.5, 84, 61, 0.8, 'W');
    line(g, 79, 62.5, 89, 62.5, 0.6, 'k');

    // —— 腰间朱砂绦带(垂布感)+ 两端穗 ——
    for (let x = 51; x <= 117; x++) {
      const y0 = 92 + (x > 68 && x < 100 ? 1 : 0);
      ppx(g, x, y0, 'R'); ppx(g, x, y0 + 1, 'R');
      for (let y = y0 + 2; y <= y0 + 6; y++) ppx(g, x, y, 'r');
      ppx(g, x, y0 + 7, 'q');
    }
    ppx(g, 56, 93, 'X'); ppx(g, 60, 92, 'X'); ppx(g, 108, 93, 'X');
    blob(g, 52, 100, 2, 4, 'q'); blob(g, 52, 98, 2, 3, 'r');
    blob(g, 116, 100, 2, 4, 'q'); blob(g, 116, 98, 2, 3, 'r');

    // —— 绦带巨结(缠结柱结,扁平束结造型)+ 垂穗双尾 ——
    for (let y = 73; y <= 93; y++) {                                        // 结体:竖椭圆
      const dy = (y - 83) / 10;
      const half = 7 * Math.sqrt(Math.max(0, 1 - dy * dy));
      for (let x = Math.round(86 - half); x <= Math.round(86 + half); x++) {
        let c = 'r';
        if (x <= 84) c = 'R';                                               // 左受光
        else if (x >= 88) c = x >= 90 ? 'Y' : 'q';                          // 右背光焦朱
        ppx(g, x, y, c);
      }
    }
    crack(g, [[81, 78], [91, 79]], 'k');                                    // 三道缠勒
    crack(g, [[80, 83.5], [92, 83.5]], 'k');
    crack(g, [[81, 88], [91, 89]], 'k');
    ppx(g, 83, 76, 'X'); ppx(g, 84, 75, 'X'); ppx(g, 82, 79, 'X');          // 受光点
    line(g, 84, 62, 85.5, 72.5, 1.4, 'r'); line(g, 85.5, 63, 87, 72.5, 0.6, 'Y'); // 领下系带
    line(g, 83, 93, 77, 102, 1.6, 'r'); line(g, 77, 102, 75, 110, 1.3, 'r');
    line(g, 84, 94, 78.5, 102, 0.5, 'q');
    ppx(g, 74, 111, 'r'); ppx(g, 76, 112, 'q'); ppx(g, 73, 109, 'q');       // 散穗
    line(g, 89, 93, 95, 101, 1.4, 'r'); line(g, 90, 94, 95.5, 100, 0.5, 'q');
    ppx(g, 96, 102, 'r'); ppx(g, 97, 100, 'q');

    // —— 飞白笔触(line M)+ 枯斑 ——
    const stroke = (x, y, len, c) => line(g, x, y, x + len, y + (rand() - 0.5) * 2, 0.5, c);
    for (let i = 0; i < 14; i++) {
      const x = Math.round(24 + rand() * 116), y = Math.round(100 + rand() * 40);
      if (ROBE.has(g[y]?.[x])) stroke(x, y, 3 + rand() * 5, 'M');
    }
    for (let i = 0; i < 8; i++) {
      const x = Math.round(54 + rand() * 58), y = Math.round(64 + rand() * 30);
      if (ROBE.has(g[y]?.[x])) stroke(x, y, 3 + rand() * 4, 'M');
    }
    for (let i = 0; i < 10; i++) {
      const x = Math.round(22 + rand() * 124), y = Math.round(58 + rand() * 60);
      if (g[y]?.[x] === 'k') ppx(g, x, y, 'B');
    }
    fleck(g, 14, 100, 154, 146, 22, ['M', 'B'], ROBE, rand);

    return toRows(outlinePass(g));
  })();

  return { boss_golem: golem, boss_overlord: overlord };
})();
