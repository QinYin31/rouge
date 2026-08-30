// ===== 📜 图鉴agent 名下:组合图鉴(进化绝学 × 元素联动)=====
// 结构:#codex-tabs 两个标签 → #codex-list 条目(双列)点击选中(朱砂描边)→
//       #codex-stage 播放该组合技循环演示(真实游戏精灵 drawSprite + 自绘简易粒子),
//       #codex-info 展示合成路径(小 canvas 图标)+ 效果与达成条件。
// 数据:进化条目由 WEAPONS[id].evo 自动生成(9 条);联动条目静态定义(3 条)。
// 进化门槛(CONTRACT v2.3):武器满级 + 绑定心法 3 级。
// 性能红线:RAF 仅在图鉴可见时运行,关闭立即 cancelAnimationFrame,不残留循环。
import { WEAPONS, WEAPON_ORDER } from '../game/weapons.js?v=17';
import { PASSIVES } from '../game/upgrades.js?v=17';
import { drawSprite, spriteSize, SCALE } from '../sprites.js?v=17';
import { Screens } from './screens.js?v=17';
import { SFX } from '../core/audio.js?v=17';

const TAU = Math.PI * 2;
const W = 480, H = 270;        // 演示舞台逻辑分辨率(16:9,实际缓冲按容器宽度 × dpr)
const EVO_PASS_LV = 3;         // v2.3:心法进化门槛 3 级
const ALIAS = { cd: '专注', xp: '聪慧', gold: '财运', magnet: '贪婪' }; // 心法商店别名(对照用)

// 水墨配色(与 css 变量 / sprites 调色板一致)
const INK = '#3a3a3a', INK2 = '#4a4a5a', CIN = '#b03a2e', CIN2 = '#c85545',
  AZ = '#5fb8c4', AZ2 = '#7fd4de', AZ3 = '#a8e2e8', GLD = '#e2b94e', GLD2 = '#c9972f',
  PAPER = '#f2ecdd', WHITE = '#faf6ea';

/* ---------------- 条目数据 ---------------- */
// 进化绝学:由 WEAPONS 自动生成(9 条,顺序同 WEAPON_ORDER)
const EVOS = WEAPON_ORDER.map(id => {
  const w = WEAPONS[id], pid = w.evo.passive;
  return {
    kind: 'evo', id, anim: id, name: w.evo.evoName, icon: w.evo.icon,
    weapon: w, pid, passive: PASSIVES[pid],
    sub: `${w.name} + ${PASSIVES[pid].name}`,
    desc: w.evo.desc,
  };
});
// 元素联动:静态定义(3 条;素材图标取武器/敌人精灵,结果图标为手绘水墨符记)
const LINKS = [
  {
    kind: 'link', id: 'yinyang', anim: 'yinyang', name: '阴阳相激', glyph: 'yinyang',
    inputs: [{ sprite: 'w_fireball', label: '焚天' }, { sprite: 'w_flask', label: '墨雨' }],
    sub: '焚天 + 墨雨',
    desc: '被焚天点燃之敌再被墨雨浸润,水火相激立即引爆蒸汽,白雾崩裂,波及周身之敌。',
    cond: '同时持有焚天(焚天煮海)与墨雨(墨染乾坤)时自动生效',
  },
  {
    kind: 'link', id: 'chain', anim: 'chain', name: '感电连锁', glyph: 'chain',
    inputs: [{ sprite: 'lightning_v', label: '五雷' }, { sprite: 'w_flask', label: '墨雨' }],
    sub: '五雷 + 墨雨',
    desc: '五雷劈中湿身之敌,青色电弧在其周身之敌间连锁跳跃,一雷连数敌。',
    cond: '持有五雷(九天神雷)与墨雨(墨染乾坤),雷击湿身之敌时触发',
  },
  {
    kind: 'link', id: 'xunyan', anim: 'xunyan', name: '殉焰', glyph: 'xunyan',
    inputs: [{ sprite: 'w_fireball', label: '焚天' }, { sprite: 'skeleton', label: '敌倒' }],
    sub: '焚天 + 击倒',
    desc: '燃身之敌倒下时,原地留下一片灼灼燃烧的火区,经久不熄。',
    cond: '焚天系点燃之敌死亡时自动触发',
  },
];
const TABS = [
  { id: 'evo', name: '进化绝学', items: EVOS },
  { id: 'link', name: '元素联动', items: LINKS },
];

/* ---------------- 小工具 ---------------- */
const el = id => document.getElementById(id);
const lerp = (a, b, k) => a + (b - a) * k;

// 精灵小图标 canvas(列表/路径节点用;drawSprite 直绘,像素风)
function iconCanvas(spec, px) {
  const d = Math.min(window.devicePixelRatio || 1, 2);
  const c = document.createElement('canvas');
  c.width = Math.round(px * d); c.height = Math.round(px * d);
  c.style.width = px + 'px'; c.style.height = px + 'px';
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.scale(d, d);
  if (spec.glyph) paintGlyph(x, spec.glyph, px);
  else {
    const sz = spriteSize(spec.sprite) || { w: 16, h: 16 };
    const s = Math.min(1.5, (px * 0.86) / (Math.max(sz.w, sz.h) * SCALE));
    drawSprite(x, spec.sprite, px / 2, px / 2, { scale: s });
  }
  return c;
}

// 联动结果符记(无对应精灵,手绘水墨小符:阴阳鱼 / 电弧 / 烛焰)
function paintGlyph(x, kind, px) {
  const c = px / 2;
  x.lineJoin = 'round'; x.lineCap = 'round';
  if (kind === 'yinyang') { // 阴阳相激:上青(水)下赤(火)的阴阳鱼
    x.save(); x.translate(c, c); x.rotate(-0.5);
    x.fillStyle = AZ; x.beginPath(); x.arc(0, 0, 10, Math.PI, TAU); x.fill();
    x.fillStyle = CIN2; x.beginPath(); x.arc(0, 0, 10, 0, Math.PI); x.fill();
    x.fillStyle = CIN2; x.beginPath(); x.arc(-5, -1, 4.4, 0, TAU); x.fill();
    x.fillStyle = AZ; x.beginPath(); x.arc(5, 1, 4.4, 0, TAU); x.fill();
    x.strokeStyle = '#2b2b2b'; x.lineWidth = 2;
    x.beginPath(); x.arc(0, 0, 10, 0, TAU); x.stroke();
    x.restore();
  } else if (kind === 'chain') { // 感电连锁:两妖之间青色折电
    x.fillStyle = '#3f4140';
    x.beginPath(); x.arc(7, 23, 3.4, 0, TAU); x.fill();
    x.beginPath(); x.arc(26, 8, 3.4, 0, TAU); x.fill();
    x.strokeStyle = AZ; x.lineWidth = 2.6;
    x.beginPath(); x.moveTo(8, 21); x.lineTo(13, 16); x.lineTo(11, 13); x.lineTo(19, 12); x.lineTo(17, 9); x.lineTo(25, 9);
    x.stroke();
    x.strokeStyle = '#e8fbff'; x.lineWidth = 1;
    x.stroke();
  } else { // 殉焰:地面余烬烛焰
    x.strokeStyle = '#6b6b5d'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(5, 25); x.lineTo(28, 25); x.stroke();
    x.fillStyle = CIN2;
    x.beginPath();
    x.moveTo(16.5, 5);
    x.quadraticCurveTo(24, 14, 21.5, 21);
    x.quadraticCurveTo(19, 25, 16.5, 25);
    x.quadraticCurveTo(14, 25, 11.5, 21);
    x.quadraticCurveTo(9, 14, 16.5, 5);
    x.fill();
    x.fillStyle = GLD;
    x.beginPath();
    x.moveTo(16.5, 12);
    x.quadraticCurveTo(19.5, 17, 18.4, 21.5);
    x.quadraticCurveTo(16.5, 23.5, 14.6, 21.5);
    x.quadraticCurveTo(13.5, 17, 16.5, 12);
    x.fill();
  }
}

/* ---------------- 粒子 / 特效(每个演示独立状态,互不串扰) ---------------- */
const newState = () => ({
  parts: [], rings: [], texts: [], zones: [], marks: [], tg: null,
  flash: 0, shake: 0, acc: 0, lastU: 1, init: 0,
});
const STATES = {};
let now = 0; // 演示时间轴(秒,RAF 累计)

function part(st, x, y, vx, vy, life, size, col, o) {
  if (st.parts.length >= 150) return; // 粒子预算上限
  st.parts.push({ x, y, vx, vy, life, ml: life, size, col, grav: (o && o.grav) || 0 });
}
function updParts(st, dt) {
  const a = st.parts;
  for (let i = a.length - 1; i >= 0; i--) {
    const p = a[i];
    p.life -= dt;
    if (p.life <= 0) { a[i] = a[a.length - 1]; a.pop(); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt;
  }
}
function drawParts(ctx, st) {
  for (const p of st.parts) {
    const u = p.life / p.ml;
    ctx.globalAlpha = Math.min(1, u * 1.4);
    ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.6, p.size * (0.4 + 0.6 * u)), 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function ring(st, x, y, r0, r1, dur, col, lw) { st.rings.push({ x, y, r0, r1, t0: now, dur, col, lw }); }
function drawRings(ctx, st) {
  for (let i = st.rings.length - 1; i >= 0; i--) {
    const r = st.rings[i], p = (now - r.t0) / r.dur;
    if (p >= 1) { st.rings.splice(i, 1); continue; }
    if (p < 0) continue;
    const e = 1 - (1 - p) * (1 - p);
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = r.col; ctx.lineWidth = r.lw;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
function text(st, x, y, str, col, dur, size) { st.texts.push({ x, y, str, col, t0: now, dur, size }); }
function drawTexts(ctx, st) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = st.texts.length - 1; i >= 0; i--) {
    const tx = st.texts[i], p = (now - tx.t0) / tx.dur;
    if (p >= 1) { st.texts.splice(i, 1); continue; }
    ctx.globalAlpha = p < 0.12 ? p / 0.12 : 1 - (p - 0.12) / 0.88;
    ctx.font = `bold ${tx.size}px "Kaiti SC","STKaiti","KaiTi","SimSun",serif`;
    ctx.strokeStyle = 'rgba(250,246,234,.85)'; ctx.lineWidth = 3;
    const yy = tx.y - p * 24;
    ctx.strokeText(tx.str, tx.x, yy);
    ctx.fillStyle = tx.col;
    ctx.fillText(tx.str, tx.x, yy);
    ctx.globalAlpha = 1;
  }
}
// 火区(焚天煮海 / 殉焰):橙红渐变圆 + 火舌粒子,到时淡出
function drawZones(st, ctx, t, dt) {
  for (let i = st.zones.length - 1; i >= 0; i--) {
    const z = st.zones[i], age = t - z.t0, k = age / z.dur;
    if (k >= 1) { st.zones.splice(i, 1); continue; }
    const flick = 0.72 + 0.28 * Math.sin(t * 13 + z.x * 0.37);
    const a = (k < 0.82 ? 1 : (1 - k) / 0.18) * flick;
    const gr = ctx.createRadialGradient(z.x, z.y, z.r * 0.1, z.x, z.y, z.r);
    gr.addColorStop(0, `rgba(226,185,78,${0.55 * a})`);
    gr.addColorStop(0.55, `rgba(200,85,69,${0.42 * a})`);
    gr.addColorStop(1, 'rgba(176,58,46,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(140,47,39,${0.5 * a})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r * 0.86, 0, TAU); ctx.stroke();
    st.zacc = (st.zacc || 0) + dt;
    if (st.zacc > 0.09) {
      st.zacc = 0;
      const a2 = Math.random() * TAU, rr = Math.sqrt(Math.random()) * z.r * 0.8;
      part(st, z.x + Math.cos(a2) * rr, z.y + Math.sin(a2) * rr,
        (Math.random() - 0.5) * 16, -55 - Math.random() * 40, 0.45, 2.4, Math.random() < 0.5 ? CIN2 : GLD);
    }
  }
}
// 青色电弧(折线,双描:青焰芯 + 纸白内芯,逐帧抖动)
function arc(ctx, x1, y1, x2, y2, amp, col1, col2) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of [[3.4, col1], [1.3, col2]]) {
    ctx.strokeStyle = s[1]; ctx.lineWidth = s[0];
    ctx.beginPath(); ctx.moveTo(x1, y1);
    for (let i = 1; i < 6; i++) {
      const k = i / 6, j = (Math.random() - 0.5) * 2 * amp * Math.sin(k * Math.PI);
      ctx.lineTo(x1 + dx * k + nx * j, y1 + dy * k + ny * j);
    }
    ctx.lineTo(x2, y2); ctx.stroke();
  }
}
function shadow(ctx, x, y, r) {
  ctx.fillStyle = 'rgba(43,43,43,.15)';
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.4, 0, 0, TAU); ctx.fill();
}
function drawHero(ctx, t, x, y, base, o = {}) {
  const f = ((t * 3.6) | 0) % 2; // 2 帧走路动画
  shadow(ctx, x, y + 22, 13);
  drawSprite(ctx, base + '_' + f, x, y, { flip: !!o.flip, scale: o.scale || 1 });
}

/* ---------------- 假想敌(真实敌人精灵:skeleton 骨卫 / slime 纸妖) ---------------- */
function tgt(x, y, spr, o) {
  return { bx: x, by: y, x, y, ox: 0, oy: 0, kx: 0, ky: 0, flash: 0, cd: 0, ph: Math.random() * TAU, spr, alpha: 1, rot: 0, still: o && o.still };
}
function updTargets(st, dt) {
  for (const g of st.tg) {
    g.cd -= dt;
    g.flash = Math.max(0, g.flash - dt * 3.2);
    g.ox += g.kx * dt; g.oy += g.ky * dt;
    const d = Math.exp(-4.2 * dt); g.kx *= d; g.ky *= d;
    g.x = g.bx + g.ox; g.y = g.by + g.oy;
  }
}
function drawTarget(ctx, t, g, o = {}) {
  const wx = g.still ? 0 : Math.sin(t * 2.1 + g.ph) * 1.6;
  const wy = g.still ? 0 : Math.cos(t * 1.6 + g.ph) * 1.2;
  const alpha = o.alpha !== undefined ? o.alpha : g.alpha;
  if (alpha <= 0.02) return;
  shadow(ctx, g.x + wx, g.y + 22, 13);
  drawSprite(ctx, g.spr, g.x + wx, g.y + wy, {
    tint: g.flash > 0.02 ? WHITE : null, // 受击闪白(与游戏一致)
    alpha,
    angle: o.angle !== undefined ? o.angle : g.rot,
  });
}
function hitTgt(st, g, ang, kb, col, n) {
  g.flash = 1;
  g.kx += Math.cos(ang) * kb; g.ky += Math.sin(ang) * kb;
  for (let i = 0; i < n; i++) {
    const a = ang + (Math.random() - 0.5) * 1.7, sp = 60 + Math.random() * 140;
    part(st, g.x, g.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.28 + Math.random() * 0.2, 2.1, col);
  }
}

/* ---------------- 12 段演示动画(共用主循环 + 时间轴 now) ---------------- */
const ANIMS = {
  // 万剑归宗:黑衣侠客居中,十柄剑气高速环绕绞杀,偶发剑光粒子
  knife(ctx, t, dt, st) {
    if (!st.init) { st.init = 1; st.tg = [tgt(352, 84, 'skeleton'), tgt(126, 208, 'skeleton')]; }
    updTargets(st, dt);
    const hx = 240, hy = 140, R = 88, N = 10, spin = 3.1;
    st.acc += dt;
    while (st.acc > 0.11) { // 剑光四溅
      st.acc -= 0.11;
      const a = Math.random() * TAU;
      part(st, hx + Math.cos(a) * R, hy + Math.sin(a) * R, Math.cos(a) * 150, Math.sin(a) * 150, 0.32, 2, AZ2);
    }
    drawHero(ctx, t, hx, hy, 'hero_knight');
    const base = t * spin;
    for (let i = 0; i < N; i++) {
      const a = base + i / N * TAU;
      const px = hx + Math.cos(a) * R, py = hy + Math.sin(a) * R;
      drawSprite(ctx, 'w_knife_evo', px, py, { angle: a + Math.PI / 2, alpha: 0.95, scale: 1.02 }); // 剑锋切向
      for (const g of st.tg) {
        const dx = g.x - px, dy = g.y - py;
        if (g.cd <= 0 && dx * dx + dy * dy < 34 * 34) {
          g.cd = 0.34;
          hitTgt(st, g, Math.atan2(dy, dx), 210, AZ2, 6);
          st.shake = Math.max(st.shake, 1.4);
        }
      }
    }
    for (const g of st.tg) drawTarget(ctx, t, g);
  },

  // 风卷残云:风灵弹螺旋追踪,四连不绝射向骨卫立靶
  wand(ctx, t, dt, st) {
    if (!st.init) { st.init = 1; st.tg = [tgt(382, 148, 'skeleton', { still: 1 })]; st.bolts = []; }
    updTargets(st, dt);
    const hx = 95, hy = 140, T = st.tg[0];
    st.acc += dt;
    while (st.acc > 0.24) { // 每 0.24s 一发,如洪流
      st.acc -= 0.24;
      const aim = Math.atan2(T.y - hy, T.x - hx);
      st.bolts.push({ x: hx, y: hy, a: aim + (Math.random() - 0.5) * 2.1, spd: 330 + Math.random() * 40, life: 2.4 });
      for (let i = 0; i < 3; i++) {
        part(st, hx, hy, Math.cos(aim) * 60 + (Math.random() - 0.5) * 40, Math.sin(aim) * 60 + (Math.random() - 0.5) * 40, 0.25, 1.8, AZ3);
      }
    }
    drawHero(ctx, t, hx, hy, 'hero_mage');
    for (let i = st.bolts.length - 1; i >= 0; i--) {
      const b = st.bolts[i];
      b.life -= dt;
      const want = Math.atan2(T.y - b.y, T.x - b.x);
      let da = want - b.a;
      while (da > Math.PI) da -= TAU;
      while (da < -Math.PI) da += TAU;
      b.a += Math.max(-6.2 * dt, Math.min(6.2 * dt, da)); // 强追踪 → 螺旋卷入
      b.x += Math.cos(b.a) * b.spd * dt; b.y += Math.sin(b.a) * b.spd * dt;
      const dx = T.x - b.x, dy = T.y - b.y;
      if (dx * dx + dy * dy < 30 * 30) { // 命中
        st.bolts.splice(i, 1);
        hitTgt(st, T, Math.atan2(dy, dx), 90, AZ2, 8);
        ring(st, T.x, T.y, 4, 26, 0.28, AZ2, 2);
        st.shake = Math.max(st.shake, 1);
        continue;
      }
      if (b.life <= 0) { st.bolts.splice(i, 1); continue; }
      for (let k = 1; k <= 2; k++) { // 风痕拖尾
        part(st, b.x - Math.cos(b.a) * 9 * k, b.y - Math.sin(b.a) * 9 * k, 0, 0, 0.18, 2 - k * 0.5, AZ3);
      }
      drawSprite(ctx, 'w_wand_evo', b.x, b.y, { angle: t * 7 + i, scale: 0.85, alpha: 0.95 });
    }
    for (const g of st.tg) drawTarget(ctx, t, g);
  },

  // 贯日长虹:赤金巨箭贯穿一排纸妖,长拖尾,击飞出画
  bow(ctx, t, dt, st) {
    if (!st.init) {
      st.init = 1;
      st.tg = [300, 338, 376, 414, 452].map(x => tgt(x, 211, 'slime'));
    }
    const u = (t % 2.4) / 2.4;
    if (u < st.lastU) { // 循环复位:纸妖重列
      for (const g of st.tg) { g.hit = 0; g.ox = g.oy = g.kx = g.ky = 0; g.alpha = 1; g.rot = 0; }
    }
    st.lastU = u;
    updTargets(st, dt);
    const ax = -70 + u * 640, ay = 205;
    const gr = ctx.createLinearGradient(ax - 120, ay, ax, ay); // 朱砂拖尾
    gr.addColorStop(0, 'rgba(200,85,69,0)');
    gr.addColorStop(1, 'rgba(200,85,69,.55)');
    ctx.strokeStyle = gr; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax - 120, ay); ctx.lineTo(ax, ay); ctx.stroke();
    part(st, ax - 30 - Math.random() * 50, ay + (Math.random() - 0.5) * 8, -40, (Math.random() - 0.5) * 20, 0.3, 2, GLD);
    for (const g of st.tg) {
      if (!g.hit && ax > g.bx - 6) { // 贯穿:击飞 + 纸屑纷飞
        g.hit = 1; g.flash = 1;
        g.kx = 240; g.ky = -70; g.rotV = 5;
        for (let k = 0; k < 7; k++) {
          part(st, g.x, g.y, 60 + Math.random() * 160, (Math.random() - 0.5) * 140 - 30, 0.45, 2.4, Math.random() < 0.6 ? PAPER : INK2);
        }
        st.shake = Math.max(st.shake, 1.6);
      }
      if (g.hit) { g.alpha = Math.max(0, g.alpha - dt * 1.8); g.rot += (g.rotV || 0) * dt; }
    }
    drawHero(ctx, t, 66, 205, 'hero_ranger');
    if (ax < 560) drawSprite(ctx, 'w_bow_evo', ax, ay, { angle: 0, scale: 2 });
    for (const g of st.tg) drawTarget(ctx, t, g, { alpha: g.alpha, angle: g.rot });
  },

  // 周天星斗:七颗墨珠周天巡转,触靶爆出墨点 + 地面墨渍
  orb(ctx, t, dt, st) {
    if (!st.init) { st.init = 1; st.tg = [tgt(340, 85, 'skeleton'), tgt(170, 220, 'skeleton'), tgt(305, 235, 'skeleton')]; }
    updTargets(st, dt);
    const hx = 240, hy = 140, R = 88, N = 7, spin = 2.4;
    drawHero(ctx, t, hx, hy, 'hero_knight');
    const base = t * spin;
    for (let i = 0; i < N; i++) {
      const a = base + i / N * TAU;
      const px = hx + Math.cos(a) * R, py = hy + Math.sin(a) * R;
      drawSprite(ctx, 'w_orb_evo', px, py, { angle: a * 2, scale: 1.15 });
      for (const g of st.tg) {
        const dx = g.x - px, dy = g.y - py;
        if (g.cd <= 0 && dx * dx + dy * dy < 34 * 34) { // 撞击墨爆
          g.cd = 0.42;
          hitTgt(st, g, Math.atan2(dy, dx), 160, INK2, 9);
          ring(st, g.x, g.y, 6, 34, 0.3, INK2, 2);
          st.marks.push({ x: g.x, y: g.y, t0: t });
          st.shake = Math.max(st.shake, 1.2);
        }
      }
    }
    for (let i = st.marks.length - 1; i >= 0; i--) { // 墨渍渐干
      const m = st.marks[i], age = t - m.t0;
      if (age > 2.2) { st.marks.splice(i, 1); continue; }
      ctx.globalAlpha = 0.3 * (1 - age / 2.2);
      ctx.fillStyle = INK2;
      ctx.beginPath(); ctx.ellipse(m.x, m.y, 9 + age * 2, 6 + age * 1.2, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const g of st.tg) drawTarget(ctx, t, g);
  },

  // 九天神雷:雷符随机劈落靶位,白闪 + 青色连锁电弧
  lightning(ctx, t, dt, st) {
    if (!st.init) {
      st.init = 1;
      st.tg = [tgt(150, 170, 'skeleton'), tgt(340, 110, 'skeleton'), tgt(395, 205, 'skeleton'), tgt(120, 228, 'skeleton')];
      st.strikes = []; st.next = 0.5;
    }
    updTargets(st, dt);
    st.next -= dt;
    if (st.next <= 0) { // 排雷:预警圈 → 落雷(可连锁)
      st.next = 0.5 + Math.random() * 0.25;
      const g = st.tg[(Math.random() * st.tg.length) | 0];
      const others = st.tg.filter(o => o !== g && Math.hypot(o.x - g.x, o.y - g.y) < 170);
      const c = others.length ? others[(Math.random() * others.length) | 0] : null;
      st.strikes.push({ x: g.x, y: g.y, g, c, t0: t + 0.16, done: 0 });
    }
    for (let i = st.strikes.length - 1; i >= 0; i--) {
      const s = st.strikes[i], d0 = t - s.t0;
      if (d0 > 0.55) { st.strikes.splice(i, 1); continue; }
      if (d0 < 0) { // 落雷预警:青色罗盘圈收束
        const wp = 1 + d0 / 0.16; // 0 → 1
        ctx.globalAlpha = 0.3 + 0.35 * Math.sin(t * 30) * (1 - wp * 0.4);
        ctx.strokeStyle = AZ; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, 18 * (1 - wp * 0.45), 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
      const p = d0 / 0.4;
      drawSprite(ctx, 'lightning_v', s.x, s.y - 8, { alpha: 1 - p, scale: 1.6 }); // 雷符
      ctx.globalAlpha = (1 - p) * 0.85; // 白闪核心
      ctx.fillStyle = WHITE;
      ctx.beginPath(); ctx.arc(s.x, s.y, 12 * (1 - p * 0.6), 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      if (!s.done) { // 起劈一瞬:闪光 / 火星 / 连锁
        s.done = 1;
        st.flash = Math.max(st.flash, 0.3);
        st.shake = Math.max(st.shake, 2);
        hitTgt(st, s.g, -Math.PI / 2, 60, AZ3, 9);
        if (s.c) hitTgt(st, s.c, Math.atan2(s.c.y - s.y, s.c.x - s.x), 60, AZ2, 6);
      }
      if (s.c && d0 < 0.2) arc(ctx, s.x, s.y, s.c.x, s.c.y, 9, AZ, '#e8fbff');
    }
    for (const g of st.tg) drawTarget(ctx, t, g);
  },

  // 焚天煮海:火球掷出落地超爆,火焰环扩散 + 地面火区经久燃烧
  fireball(ctx, t, dt, st) {
    if (!st.init) { st.init = 1; st.tg = [tgt(362, 138, 'skeleton')]; st.exploded = 0; }
    updTargets(st, dt);
    const u = t % 3.4, sx = 88, sy = 190, ex = 322, ey = 148, dur = 0.75;
    if (u < dt * 1.5) st.exploded = 0; // 循环复位
    if (!st.exploded) {
      const s = Math.min(1, u / dur);
      const fx = sx + (ex - sx) * s, fy = sy + (ey - sy) * s;
      const ang = Math.atan2(ey - sy, ex - sx);
      if (s < 1) {
        part(st, fx - Math.cos(ang) * 14, fy - Math.sin(ang) * 14, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.3, 2.4, CIN2);
        drawSprite(ctx, 'w_fireball_evo', fx, fy, { angle: ang + t * 6, scale: 1.1 });
      } else { // 落地:超爆 + 火区
        st.exploded = 1;
        ring(st, ex, ey, 12, 84, 0.42, CIN2, 3.5);
        ring(st, ex, ey, 6, 56, 0.3, GLD, 2.5);
        for (let k = 0; k < 24; k++) {
          const a = Math.random() * TAU, sp = 60 + Math.random() * 190;
          part(st, ex, ey, Math.cos(a) * sp, Math.sin(a) * sp - 40, 0.45 + Math.random() * 0.3,
            2.5 + Math.random() * 2, [CIN2, GLD, CIN][(Math.random() * 3) | 0], { grav: 130 });
        }
        st.zones.push({ x: ex, y: ey, r: 62, t0: t, dur: 2.35 });
        st.flash = Math.max(st.flash, 0.22);
        st.shake = Math.max(st.shake, 2.6);
        const g = st.tg[0], dxx = g.x - ex, dyy = g.y - ey;
        if (dxx * dxx + dyy * dyy < 78 * 78) hitTgt(st, g, Math.atan2(dyy, dxx), 200, CIN2, 8);
      }
    }
    drawHero(ctx, t, sx - 14, sy, 'hero_mage');
    drawZones(st, ctx, t, dt);
    for (const g of st.tg) {
      const z = st.zones[0]; // 火区灼烧:火星附身
      if (z) {
        const dxx = g.x - z.x, dyy = g.y - z.y;
        if (dxx * dxx + dyy * dyy < (z.r + 14) * (z.r + 14)) {
          st.acc += dt;
          if (st.acc > 0.13) {
            st.acc = 0;
            part(st, g.x + (Math.random() - 0.5) * 18, g.y + (Math.random() - 0.5) * 14,
              (Math.random() - 0.5) * 20, -50 - Math.random() * 30, 0.4, 2.2, CIN2);
          }
        }
      }
      drawTarget(ctx, t, g);
    }
  },

  // 金刃轮回:金边回刃四枚飞出折返,去回皆伤,金屑洒落
  boomerang(ctx, t, dt, st) {
    if (!st.init) { st.init = 1; st.tg = [tgt(322, 96, 'skeleton')]; st.bacc = 0; }
    updTargets(st, dt);
    const hx = 150, hy = 148, T = st.tg[0];
    drawHero(ctx, t, hx, hy, 'hero_knight');
    for (let i = 0; i < 4; i++) {
      const s = (((t - i * 0.22) % 2.8) + 2.8) % 2.8 / 2.8; // 依次错峰掷出
      const d = Math.sin(s * Math.PI) * 172; // 去而复返的距离曲线
      const a = -0.343 + (i - 1.5) * 0.36;
      const bx = hx + Math.cos(a) * d, by = hy + Math.sin(a) * d;
      st.bacc += dt;
      if (st.bacc > 0.08) { st.bacc = 0; part(st, bx, by, 0, 0, 0.3, 2, GLD2); }
      const dx = T.x - bx, dy = T.y - by;
      if (T.cd <= 0 && dx * dx + dy * dy < 32 * 32) {
        T.cd = 0.55; // 去回各伤一次
        hitTgt(st, T, Math.atan2(dy, dx), 170, GLD, 7);
        st.shake = Math.max(st.shake, 1.2);
      }
      drawSprite(ctx, 'w_boomerang_evo', bx, by, { angle: t * 13 + i * 0.7, scale: 1.2 });
    }
    for (const g of st.tg) drawTarget(ctx, t, g);
  },

  // 墨染乾坤:hero 脚下大型墨域缓转,墨雨滴落,域内之敌尽湿
  holy(ctx, t, dt, st) {
    if (!st.init) { st.init = 1; st.tg = [tgt(312, 186, 'skeleton'), tgt(95, 88, 'skeleton', { still: 1 })]; st.drops = []; st.racc = 0; st.wacc = 0; }
    updTargets(st, dt);
    const hx = 240, hy = 150, R = 128;
    const pulse = 0.5 + 0.1 * Math.sin(t * 2.3); // 双层墨域缓转(与游戏绘制一致)
    drawSprite(ctx, 'zone_holy', hx, hy, { alpha: pulse, scale: 1.8, angle: t * 0.35 });
    drawSprite(ctx, 'zone_holy', hx, hy, { alpha: pulse * 0.6, scale: 1.18, angle: -t * 0.6 });
    st.racc += dt;
    while (st.racc > 0.055) { // 墨雨滴落
      st.racc -= 0.055;
      if (st.drops.length > 36) break;
      const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * R * 0.92;
      const tx = hx + Math.cos(a) * rr, ty = hy + Math.sin(a) * rr;
      st.drops.push({ x: tx, y0: ty - 64, ty, s: 0 });
    }
    for (let i = st.drops.length - 1; i >= 0; i--) {
      const d = st.drops[i];
      d.s += dt / 0.34;
      if (d.s >= 1) { // 落地溅墨
        st.drops.splice(i, 1);
        part(st, d.x, d.ty, (Math.random() - 0.5) * 36, (Math.random() - 0.5) * 20, 0.22, 1.6, INK);
        continue;
      }
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = INK;
      ctx.fillRect(d.x - 1, lerp(d.y0, d.ty, d.s) - 4, 2, 8);
      ctx.globalAlpha = 1;
    }
    const g = st.tg[0]; // 域内之敌:墨湿蚀体;域外之敌安然无恙(示边界)
    st.wacc += dt;
    if (st.wacc > 0.42) {
      st.wacc = 0;
      g.flash = Math.max(g.flash, 0.7);
      g.kx += (Math.random() - 0.5) * 70; g.ky += (Math.random() - 0.5) * 70;
      for (let k = 0; k < 4; k++) {
        part(st, g.x, g.y, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 70 - 20, 0.35, 2, AZ2);
      }
    }
    drawHero(ctx, t, hx, hy, 'hero_knight');
    for (const gg of st.tg) drawTarget(ctx, t, gg);
  },

  // 雷动金钟:金钟居中嗡鸣,朱砂钟环自中心扩张,环缘青电放花
  shield(ctx, t, dt, st) {
    if (!st.init) { st.init = 1; st.tg = [tgt(372, 218, 'skeleton'), tgt(74, 62, 'skeleton')]; }
    updTargets(st, dt);
    const hx = 240, hy = 145;
    const u = (t % 1.25) / 1.25;
    const r = 205 * (1 - (1 - u) * (1 - u)); // easeOut 扩张
    drawHero(ctx, t, hx, hy, 'hero_knight');
    drawSprite(ctx, 'w_shield_evo', hx, hy - 6, { alpha: 0.9, scale: 1.15, angle: Math.sin(t * 2.5) * 0.08 });
    const fade = 1 - u; // 金钟环:朱砂主环 + 藤金内环
    ctx.globalAlpha = fade * 0.8;
    ctx.strokeStyle = CIN; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(hx, hy, r, 0, TAU); ctx.stroke();
    ctx.globalAlpha = fade * 0.9;
    ctx.strokeStyle = GLD; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(hx, hy, Math.max(1, r - 3), 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
    for (let k = 0; k < 3; k++) { // 环缘电花
      const a = t * 3.1 + k * TAU / 3 + Math.random() * 0.5;
      const px = hx + Math.cos(a) * r, py = hy + Math.sin(a) * r;
      const a2 = a + (Math.random() - 0.5) * 0.8;
      arc(ctx, px, py, px + Math.cos(a2) * 16, py + Math.sin(a2) * 16, 3, AZ, '#e8fbff');
      if (Math.random() < 0.5) part(st, px, py, Math.cos(a2) * 60, Math.sin(a2) * 60, 0.25, 1.8, AZ2);
    }
    for (const g of st.tg) {
      const dd = Math.hypot(g.x - hx, g.y - hy);
      if (g.cd <= 0 && Math.abs(dd - r) < 16) { // 环推之敌
        g.cd = 0.6;
        hitTgt(st, g, Math.atan2(g.y - hy, g.x - hx), 260, AZ2, 6);
        st.shake = Math.max(st.shake, 1.4);
      }
      drawTarget(ctx, t, g);
    }
  },

  // 阴阳相激:赤红火球与青焰水球相向飞行,相撞白雾爆发
  yinyang(ctx, t, dt, st) {
    if (!st.init) { st.init = 1; st.tg = [tgt(240, 196, 'slime')]; st.boom = 0; st.facc = 0; st.wacc = 0; }
    updTargets(st, dt);
    const u = (t % 2.7) / 2.7;
    if (u < st.lastU) st.boom = 0; // 循环复位
    st.lastU = u;
    const g = st.tg[0];
    if (u < 0.46) { // 水火相向
      const p = u / 0.46;
      const fx = lerp(52, 240, p), fy = 118 - Math.sin(p * Math.PI) * 26;
      const wx = lerp(428, 240, p), wy = 126 + Math.sin(p * Math.PI) * 26;
      part(st, fx, fy, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0.28, 2.2, CIN2);
      part(st, wx, wy, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0.28, 2.2, AZ2);
      drawSprite(ctx, 'w_fireball', fx, fy, { angle: p * 3, scale: 1.15 });
      drawSprite(ctx, 'w_orb', wx, wy, { tint: AZ, scale: 1.25, angle: t * 4 }); // 青焰水球(青染墨珠)
    } else if (!st.boom) { // 相撞:蒸汽爆发!
      st.boom = 1;
      st.flash = Math.max(st.flash, 0.32);
      st.shake = Math.max(st.shake, 3);
      text(st, 240, 86, '蒸汽爆发!', AZ, 1.15, 16);
      ring(st, 240, 124, 8, 92, 0.55, WHITE, 3);
      ring(st, 240, 124, 4, 60, 0.4, AZ3, 2);
      for (let k = 0; k < 30; k++) {
        const a = Math.random() * TAU, sp = 50 + Math.random() * 180;
        part(st, 240, 124, Math.cos(a) * sp, Math.sin(a) * sp - 50, 0.5 + Math.random() * 0.4,
          2.5 + Math.random() * 2.5, Math.random() < 0.6 ? WHITE : AZ3, { grav: -30 }); // 白雾升腾
      }
      g.flash = 1; g.ky = 140;
    }
    // 燃烧 + 墨湿状态示警(火舌 / 青露)
    st.facc += dt;
    if (st.facc > 0.16) {
      st.facc = 0;
      part(st, g.x + (Math.random() - 0.5) * 16, g.y - 8, (Math.random() - 0.5) * 14, -46, 0.35, 2, CIN2);
    }
    st.wacc += dt;
    if (st.wacc > 0.21) {
      st.wacc = 0;
      part(st, g.x + (Math.random() - 0.5) * 16, g.y - 4, 0, 26, 0.4, 1.8, AZ2);
    }
    drawTarget(ctx, t, g);
  },

  // 感电连锁:青色电弧在三只纸妖之间折线跳跃
  chain(ctx, t, dt, st) {
    if (!st.init) { st.init = 1; st.tg = [tgt(140, 95, 'slime'), tgt(362, 112, 'slime'), tgt(252, 214, 'slime')]; st.cy = -1; st.wacc = 0; }
    updTargets(st, dt);
    const cyc = 2.1, lc = t % cyc, cy = Math.floor(t / cyc);
    if (cy !== st.cy) { st.cy = cy; st.fired = [0, 0, 0]; }
    const [A, B, C] = st.tg;
    if (lc > 0.15 && lc < 0.55) { // 主劈:雷符落于首敌
      drawSprite(ctx, 'lightning_v', A.x, A.y - 10, { alpha: 1 - (lc - 0.15) / 0.4, scale: 1.4 });
    }
    if (lc > 0.15 && !st.fired[0]) {
      st.fired[0] = 1;
      st.flash = Math.max(st.flash, 0.25);
      st.shake = Math.max(st.shake, 1.8);
      hitTgt(st, A, -Math.PI / 2, 50, AZ3, 8);
    }
    if (lc > 0.6 && lc < 0.82) { // 连锁 A→B
      arc(ctx, A.x, A.y, B.x, B.y, 9, AZ, '#e8fbff');
      if (!st.fired[1]) { st.fired[1] = 1; hitTgt(st, B, Math.atan2(B.y - A.y, B.x - A.x), 60, AZ2, 6); }
    }
    if (lc > 0.9 && lc < 1.12) { // 连锁 B→C
      arc(ctx, B.x, B.y, C.x, C.y, 9, AZ, '#e8fbff');
      if (!st.fired[2]) { st.fired[2] = 1; hitTgt(st, C, Math.atan2(C.y - B.y, C.x - B.x), 60, AZ2, 6); }
    }
    st.wacc += dt; // 湿身水汽
    if (st.wacc > 0.3) {
      st.wacc = 0;
      const g = st.tg[(Math.random() * 3) | 0];
      part(st, g.x, g.y, (Math.random() - 0.5) * 30, -30, 0.4, 1.8, AZ3);
    }
    for (const g of st.tg) drawTarget(ctx, t, g);
  },

  // 殉焰:纸妖燃身倒下(旋转淡出)→ 原地留下灼灼火区
  xunyan(ctx, t, dt, st) {
    if (!st.init) { st.init = 1; st.tg = [tgt(240, 196, 'slime')]; st.cy = -1; st.dieT = -1; st.facc = 0; }
    updTargets(st, dt);
    const cyc = 3.4, lc = t % cyc, cy = Math.floor(t / cyc);
    if (cy !== st.cy) { // 循环复位:纸妖重生
      st.cy = cy; st.dieT = -1;
      const g0 = st.tg[0];
      g0.alpha = 1; g0.rot = 0; g0.ox = g0.oy = g0.kx = g0.ky = 0;
    }
    const g = st.tg[0];
    if (lc < 1.15) { // 燃身:朱砂火焰附体
      st.facc += dt;
      while (st.facc > 0.07) {
        st.facc -= 0.07;
        part(st, g.x + (Math.random() - 0.5) * 18, g.y + (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 24, -55 - Math.random() * 35, 0.4, 2.3, [CIN2, GLD, CIN][(Math.random() * 3) | 0]);
      }
      if (lc < 0.15) g.alpha = lc / 0.15; // 淡入
    }
    if (lc >= 1.15 && st.dieT < 0) { // 倒下:旋转淡出,遗留火区
      st.dieT = t;
      st.zones.push({ x: g.x, y: g.y + 6, r: 54, t0: t, dur: 1.75 });
      text(st, g.x, g.y - 34, '殉焰', CIN, 1.0, 14);
      for (let k = 0; k < 8; k++) {
        part(st, g.x, g.y, (Math.random() - 0.5) * 140, (Math.random() - 0.5) * 100, 0.5, 2.2, Math.random() < 0.6 ? PAPER : INK2);
      }
      st.shake = Math.max(st.shake, 1.2);
    }
    if (st.dieT > 0) { // 旋转淡出
      const d0 = t - st.dieT;
      g.rot = Math.min(Math.PI / 2, d0 * 4.2);
      g.alpha = Math.max(0, 1 - d0 / 0.55);
    }
    drawZones(st, ctx, t, dt);
    drawTarget(ctx, t, g, { alpha: g.alpha, angle: g.rot });
  },
};

/* ---------------- 舞台画布:宣纸底 + 淡墨网格(预渲染背景) ---------------- */
let cv = null, ctx = null, BG = null, view = 1;

function fitStage() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = Math.min(480, Math.max(220, ui.stage.clientWidth)) || 480;
  if (!cv) {
    cv = document.createElement('canvas');
    ui.stage.appendChild(cv);
  }
  cv.width = Math.round(cssW * dpr);
  cv.height = Math.round(cv.width * H / W);
  view = cv.width / W;
  ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  buildBG();
}

function buildBG() { // 静态背景只画一次:宣纸 + 杂点 + 网格 + 双勾内框 + 落款小印
  BG = document.createElement('canvas');
  BG.width = cv.width; BG.height = cv.height;
  const x = BG.getContext('2d');
  x.setTransform(view, 0, 0, view, 0, 0);
  x.fillStyle = '#ece5d3';
  x.fillRect(0, 0, W, H);
  const g = x.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 340);
  g.addColorStop(0, 'rgba(250,246,234,.5)');
  g.addColorStop(1, 'rgba(210,199,166,.36)');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  for (let i = 0; i < 150; i++) { // 纸张杂点
    x.globalAlpha = 0.04 + Math.random() * 0.07;
    x.fillStyle = Math.random() < 0.5 ? '#8a8a7a' : '#6b6b5d';
    const r = Math.random() < 0.85 ? 1 : 2;
    x.fillRect(Math.random() * W, Math.random() * H, r, r);
  }
  x.globalAlpha = 1;
  x.strokeStyle = 'rgba(107,107,93,.11)'; // 淡墨网格(与游戏地面一致)
  x.lineWidth = 1;
  x.beginPath();
  for (let gx = 40; gx < W; gx += 40) { x.moveTo(gx, 0); x.lineTo(gx, H); }
  for (let gy = 40; gy < H; gy += 40) { x.moveTo(0, gy); x.lineTo(W, gy); }
  x.stroke();
  x.strokeStyle = 'rgba(43,43,43,.4)'; // 双勾内框(墨色粗细不均)
  x.lineWidth = 2;
  x.strokeRect(5.5, 5.5, W - 11, H - 11);
  x.strokeStyle = 'rgba(107,107,93,.3)';
  x.lineWidth = 1;
  x.strokeRect(11.5, 11.5, W - 23, H - 23);
  x.save(); // 落款朱砂小印
  x.translate(W - 26, H - 26);
  x.rotate(-0.06);
  x.fillStyle = 'rgba(176,58,46,.78)';
  x.fillRect(-9, -9, 18, 18);
  x.fillStyle = 'rgba(250,246,234,.92)';
  x.font = 'bold 12px "Kaiti SC","STKaiti","KaiTi","SimSun",serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('录', 0, 1);
  x.restore();
}

/* ---------------- 主循环(RAF 仅在图鉴可见时运行) ---------------- */
let raf = 0, lastTs = 0;

function loop(ts) {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  now += dt;
  render(dt);
}

function render(dt) {
  const st = STATES[sel.anim];
  ctx.setTransform(view, 0, 0, view, 0, 0);
  ctx.drawImage(BG, 0, 0, W, H);
  st.flash = Math.max(0, st.flash - dt * 2.6);
  st.shake = Math.max(0, st.shake - dt * 8);
  if (st.shake > 0.02) ctx.translate((Math.random() - 0.5) * st.shake * 2.4, (Math.random() - 0.5) * st.shake * 2.4);
  updParts(st, dt);
  ANIMS[sel.anim](ctx, now, dt, st);
  drawParts(ctx, st);
  drawRings(ctx, st);
  drawTexts(ctx, st);
  if (st.flash > 0.01) { // 白闪(落雷 / 蒸汽 / 超爆)
    ctx.globalAlpha = Math.min(0.8, st.flash);
    ctx.fillStyle = WHITE;
    ctx.fillRect(-10, -10, W + 20, H + 20);
    ctx.globalAlpha = 1;
  }
}

function startLoop() {
  if (!raf) { lastTs = performance.now(); raf = requestAnimationFrame(loop); }
}
function stopLoop() {
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
}

/* ---------------- DOM:标签 / 列表 / 详情 ---------------- */
let ui = null, tab = 'evo', sel = null, bound = false, openFlag = false;

function pathNode(spec, label, cls) {
  const n = document.createElement('span');
  n.className = 'codex-path-node' + (cls ? ' ' + cls : '');
  n.appendChild(iconCanvas(spec, 30));
  const l = document.createElement('span');
  l.className = 'codex-path-label';
  l.textContent = label;
  n.appendChild(l);
  return n;
}
function pathSep(ch) {
  const s = document.createElement('span');
  s.className = ch === '+' ? 'codex-path-plus' : 'codex-path-arrow';
  s.textContent = ch;
  return s;
}

function renderInfo(e) {
  const box = ui.info;
  box.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'codex-info-head';
  const nm = document.createElement('span');
  nm.className = 'codex-info-name';
  nm.textContent = e.name;
  const tag = document.createElement('span');
  tag.className = 'codex-info-tag';
  tag.textContent = e.kind === 'evo' ? '进化绝学' : '元素联动';
  head.append(nm, tag);
  box.appendChild(head);

  const path = document.createElement('div');
  path.className = 'codex-path';
  if (e.kind === 'evo') {
    path.append(
      pathNode({ sprite: e.weapon.icon }, `${e.weapon.name}·满级`),
      pathSep('+'),
      pathNode({ sprite: e.passive.icon }, `${e.passive.name}·${EVO_PASS_LV}级`),
      pathSep('→'),
      pathNode({ sprite: e.icon }, e.name, 'is-evo'),
    );
  } else {
    e.inputs.forEach((inp, i) => {
      if (i) path.append(pathSep('+'));
      path.append(pathNode({ sprite: inp.sprite }, inp.label));
    });
    path.append(pathSep('→'), pathNode({ glyph: e.glyph }, e.name, 'is-evo'));
  }
  box.appendChild(path);

  const d = document.createElement('div');
  d.className = 'codex-info-desc';
  d.textContent = e.desc;
  box.appendChild(d);

  const c = document.createElement('div');
  c.className = 'codex-info-cond';
  if (e.kind === 'evo') {
    const alias = ALIAS[e.pid] && ALIAS[e.pid] !== e.passive.name ? `(又称「${ALIAS[e.pid]}」)` : '';
    c.innerHTML =
      `达成:<b>${e.weapon.name}</b> Lv.${e.weapon.maxLv}(满级)+ <b>${e.passive.name}</b>${alias} Lv.${EVO_PASS_LV}` +
      `<br>条件满足后,升级三选一将出现金色「进化」卡,选择后该武器即化作绝学形态`;
    box.appendChild(c);
    const pd = document.createElement('div');
    pd.className = 'codex-info-cond';
    pd.textContent = `心法·${e.passive.name}:${e.passive.desc}`;
    box.appendChild(pd);
  } else {
    c.textContent = '触发:' + e.cond;
    box.appendChild(c);
  }
}

function renderList() {
  const list = ui.list;
  list.innerHTML = '';
  const items = TABS.find(x => x.id === tab).items;
  for (const e of items) {
    const b = document.createElement('button');
    b.className = 'codex-item' + (sel === e ? ' sel' : '');
    const ic = document.createElement('span');
    ic.className = 'codex-item-icon';
    ic.appendChild(iconCanvas(e.kind === 'evo' ? { sprite: e.icon } : { glyph: e.glyph }, 30));
    const tx = document.createElement('span');
    tx.className = 'codex-item-text';
    const nm = document.createElement('span');
    nm.className = 'codex-item-name';
    nm.textContent = e.name;
    const sb = document.createElement('span');
    sb.className = 'codex-item-sub';
    sb.textContent = e.sub;
    tx.append(nm, sb);
    b.append(ic, tx);
    b.onclick = () => { SFX.play('click'); select(e); };
    list.appendChild(b);
  }
}

function renderTabs() {
  const tabs = ui.tabs;
  tabs.innerHTML = '';
  for (const tb of TABS) {
    const b = document.createElement('button');
    b.className = 'codex-tab' + (tab === tb.id ? ' on' : '');
    b.textContent = tb.name;
    const n = document.createElement('span');
    n.className = 'codex-tab-n';
    n.textContent = String(tb.items.length);
    b.appendChild(n);
    b.onclick = () => {
      if (tab === tb.id) return;
      SFX.play('click');
      tab = tb.id;
      renderTabs();
      select(TABS.find(x => x.id === tab).items[0]);
    };
    tabs.appendChild(b);
  }
}

function select(e) {
  sel = e;
  STATES[e.anim] = newState(); // 重置该演示的粒子/特效状态
  renderList();
  renderInfo(e);
}

function buildUI() {
  ui = { stage: el('codex-stage'), info: el('codex-info'), list: el('codex-list'), tabs: el('codex-tabs') };
  renderTabs();
  select(EVOS[0]); // 默认选中第一项:万剑归宗
}

function bindOnce() {
  if (bound) return;
  bound = true;
  el('btn-codex-back').addEventListener('click', () => { SFX.play('click'); close(); });
  window.addEventListener('resize', () => { if (openFlag) fitStage(); });
}

/* ---------------- 公开 API ---------------- */
function close() {
  openFlag = false;
  stopLoop(); // 性能红线:关闭即停 RAF,不残留循环
  el('screen-codex').classList.add('hidden');
  Screens.show('screen-menu');
}

export const Codex = {
  open() {
    if (!ui) buildUI();
    bindOnce();
    openFlag = true;
    el('screen-menu').classList.add('hidden');
    el('screen-codex').classList.remove('hidden');
    fitStage(); // 先显示再量宽(hidden 时 clientWidth 为 0)
    startLoop();
  },
};
