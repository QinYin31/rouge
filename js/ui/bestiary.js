// ===== 📖 图鉴agent 名下:怪物图鉴 =====
import { ENEMY_TYPES } from '../game/enemies.js?v=17';
import { drawSprite, spriteSize, SCALE } from '../sprites.js?v=17';
import { Screens } from './screens.js?v=17';
import { SFX } from '../core/audio.js?v=17';
const TAU = Math.PI * 2;
const W = 480, H = 270;
const BEH_DESC = {
  0: '直线追击，基础近战',
  1: '快速摆动追击，难被预判',
  2: '直线追击',
  3: '突进型：爬行后短距冲刺',
  4: '半减伤直线，击退抗性高',
  5: '自爆型：近身引信后自爆，范围伤害',
  6: '免疫击退，重装直线',
  7: '正弦飘忽，轨迹捉摸不定',
  8: '快速追踪，精英级',
  9: 'Boss·石像守卫：蓄力冲锋+碎地冲击',
  10: 'Boss·无常尊者：多阶段弹幕+召唤',
  11: '远程弹幕：保持距离发射追踪弹',
  12: '区域威胁：生成泥沼预警圈，1秒后爆发',
  13: '召唤辅助：召唤小怪并为友军加速回血',
};
const SPAWN_INFO = {
  slime: '0s起 全阶段',
  bat: '0s起 全阶段',
  skeleton: '55s后',
  spider: '120s后',
  qinglu: '120s后',
  brute: '240s后',
  bomber: '240s后',
  mire: '240s后',
  turtle: '360s后',
  wisp: '360s后',
  summoner: '360s后',
  reaper: '精英/240s后',
  boss_golem: '300s Boss',
  boss_overlord: '600s 最终Boss',
};
const ORDER = ['slime','bat','skeleton','spider','qinglu','brute','bomber','mire','turtle','wisp','summoner','reaper','boss_golem','boss_overlord'];
const TABS_DEF = [
  { id: 'normal', name: '常规', ids: ['slime','bat','skeleton','spider','qinglu','brute','bomber','mire','turtle','wisp'] },
  { id: 'special', name: '特殊/Boss', ids: ['summoner','reaper','boss_golem','boss_overlord'] },
];
let ui = null, tab = 'normal', sel = null, openFlag = false, raf = 0, bound = false;
let stageCanvas = null, stageCtx = null;
const el = id => document.getElementById(id);
function iconCanvas(spec, px) {
  const d = Math.min(window.devicePixelRatio || 1, 2);
  const c = document.createElement('canvas');
  c.width = Math.round(px*d); c.height = Math.round(px*d);
  c.style.width = px+'px'; c.style.height = px+'px';
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.scale(d,d);
  const sz = spriteSize(spec.sprite) || {w:16,h:16};
  const s = Math.min(1.5, (px*0.86)/(Math.max(sz.w,sz.h)*SCALE));
  drawSprite(x, spec.sprite, px/2, px/2, {scale:s});
  return c;
}
function renderInfo(e) {
  const box = ui.info; box.innerHTML='';
  const head = document.createElement('div'); head.className='codex-info-head';
  const nm = document.createElement('span'); nm.className='codex-info-name'; nm.textContent=e.name;
  const tag = document.createElement('span'); tag.className='codex-info-tag'; tag.textContent = e.boss ? 'Boss' : (BEH_DESC[e.beh]||'');
  head.append(nm, tag); box.appendChild(head);
  const stats = document.createElement('div'); stats.className='codex-info-cond'; stats.style.lineHeight='1.9';
  stats.innerHTML = '生命 <b>'+e.hp+'</b> · 速度 <b>'+e.speed+'</b> · 碰撞伤害 <b>'+e.dmg+'</b> · 半径 <b>'+e.r+'</b><br>经验 <b>'+e.xp+'</b> · 金币概率 <b>'+Math.round(e.coinP*100)+'%</b> · 击退系数 <b>'+e.kb+'</b><br>出现：<b>'+(SPAWN_INFO[e.id]||'—')+'</b>';
  box.appendChild(stats);
  const beh = document.createElement('div'); beh.className='codex-info-desc'; beh.textContent = BEH_DESC[e.beh] || '—'; box.appendChild(beh);
  const feats = [];
  if (e.id==='slime') feats.push('死亡分裂为2只小纸妖');
  if (e.id==='bomber') feats.push('近身0.6s后自爆，范围92');
  if (e.id==='qinglu') feats.push('每2.2s发射一枚敌方弹幕，可被闪避');
  if (e.id==='mire') feats.push('在玩家附近生成泥沼：1.05s预警后才造成伤害（已延长前摇至6.2s冷却）');
  if (e.id==='summoner') feats.push('每5.4s召唤纸妖/夜枭，并为半径220内友军加速18%与回血');
  if (e.id==='wisp') feats.push('正弦飘忽，难以瞄准');
  if (e.id==='turtle') feats.push('免疫击退，血厚低速');
  if (e.id==='reaper') feats.push('精英怪，6倍血量掉落宝箱');
  if (e.boss) feats.push('Boss拥有独立血量成长与阶段弹幕');
  if (feats.length) { const f = document.createElement('div'); f.className='codex-info-cond'; f.innerHTML = '特性：'+feats.map(s=>'· '+s).join('<br>'); box.appendChild(f); }
}
function renderList() {
  const list = ui.list; list.innerHTML='';
  const tabDef = TABS_DEF.find(x=>x.id===tab);
  for (const id of tabDef.ids) {
    const e = ENEMY_TYPES[id]; if (!e) continue;
    const b = document.createElement('button'); b.className='codex-item'+(sel && sel.id===id?' sel':'');
    const ic = document.createElement('span'); ic.className='codex-item-icon'; ic.appendChild(iconCanvas({sprite:e.sprite},30));
    const tx = document.createElement('span'); tx.className='codex-item-text';
    const nm = document.createElement('span'); nm.className='codex-item-name'; nm.textContent=e.name;
    const sb = document.createElement('span'); sb.className='codex-item-sub'; sb.textContent = e.boss ? 'Boss' : BEH_DESC[e.beh]||'';
    tx.append(nm,sb); b.append(ic,tx);
    b.onclick=()=>{ SFX.play('click'); select({id,...e}); };
    list.appendChild(b);
  }
}
function renderTabs() {
  const tabs = ui.tabs; tabs.innerHTML='';
  for (const tb of TABS_DEF) {
    const b = document.createElement('button'); b.className='codex-tab'+(tab===tb.id?' on':''); b.textContent=tb.name;
    const n = document.createElement('span'); n.className='codex-tab-n'; n.textContent=String(tb.ids.length); b.appendChild(n);
    b.onclick=()=>{ if(tab===tb.id) return; SFX.play('click'); tab=tb.id; renderTabs(); const first = ENEMY_TYPES[tb.ids[0]]; select({id:tb.ids[0],...first}); };
    tabs.appendChild(b);
  }
}
let animT = 0;
function loop() { if (!openFlag) return; animT += 0.016; drawStage(); raf = requestAnimationFrame(loop); }
function drawStage() {
  if (!stageCtx || !sel) return;
  const ctx = stageCtx; ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#f2ecdd'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(43,43,43,0.08)'; ctx.lineWidth=1;
  for(let i=0;i<W;i+=40){ ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,H); ctx.stroke();}
  for(let i=0;i<H;i+=40){ ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(W,i); ctx.stroke();}
  const cx = W/2, cy = H/2 + 10; const bob = Math.sin(animT*1.6)*6; const e = sel;
  ctx.fillStyle='rgba(43,43,43,0.12)'; ctx.beginPath(); ctx.ellipse(cx, cy+32, 22 + Math.sin(animT*1.2)*2, 8, 0, 0, TAU); ctx.fill();
  const scale = e.boss ? 2.2 : 1.7;
  if (e.boss) { ctx.strokeStyle = e.id==='boss_overlord' ? '#e43b44' : '#b55088'; ctx.lineWidth=2; ctx.globalAlpha=0.35; ctx.beginPath(); ctx.arc(cx, cy+bob, 46, 0, TAU); ctx.stroke(); ctx.globalAlpha=1; }
  else if (e.id==='mire') { ctx.strokeStyle='#8b9bb4'; ctx.setLineDash([6,4]); ctx.lineWidth=1.5; ctx.globalAlpha=0.5; ctx.beginPath(); ctx.arc(cx, cy+bob+8, 38, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1; }
  drawSprite(ctx, e.sprite, cx, cy+bob, {scale});
  ctx.fillStyle='#2b2b2b'; ctx.font='700 13px Kaiti SC'; ctx.textAlign='center'; ctx.fillText(e.name + (e.boss?' · Boss':''), cx, 22);
}
function fitStage() {
  if (!ui || !ui.stage) return;
  const box = ui.stage; const rect = box.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio||1,2);
  const w = Math.max(240, Math.min(480, Math.round(rect.width))); const h = Math.round(w*9/16);
  stageCanvas.width = Math.round(w*dpr); stageCanvas.height=Math.round(h*dpr);
  stageCanvas.style.width=w+'px'; stageCanvas.style.height=h+'px';
  const ctx2 = stageCanvas.getContext('2d'); ctx2.imageSmoothingEnabled=false;
  const sx = w/W, sy = h/H; ctx2.setTransform(dpr*sx,0,0,dpr*sy,0,0);
  stageCtx = ctx2;
}
function buildUI() {
  ui = { stage: el('bestiary-stage'), info: el('bestiary-info'), list: el('bestiary-list'), tabs: el('bestiary-tabs') };
  stageCanvas = document.createElement('canvas'); stageCanvas.width=W; stageCanvas.height=H; stageCtx = stageCanvas.getContext('2d'); stageCtx.imageSmoothingEnabled=false;
  ui.stage.innerHTML=''; ui.stage.appendChild(stageCanvas);
  renderTabs(); const first = ENEMY_TYPES[ORDER[0]]; select({id:ORDER[0],...first});
}
function select(e){ sel=e; renderList(); renderInfo(e); }
function bindOnce(){ if(bound) return; bound=true; el('btn-bestiary-back').addEventListener('click',()=>{ SFX.play('click'); close();}); window.addEventListener('resize',()=>{ if(openFlag) fitStage();}); }
function stopLoop(){ if(raf){ cancelAnimationFrame(raf); raf=0; } }
function close(){ openFlag=false; stopLoop(); el('screen-bestiary').classList.add('hidden'); Screens.show('screen-menu'); }
export const Bestiary = { open(){ if(!ui) buildUI(); bindOnce(); openFlag=true; el('screen-menu').classList.add('hidden'); el('screen-bestiary').classList.remove('hidden'); fitStage(); animT=0; if(!raf) raf=requestAnimationFrame(loop); } };
